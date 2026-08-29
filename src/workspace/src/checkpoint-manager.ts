/**
 * @module checkpoint-manager
 * @description A9 工作区 Checkpoint、Diff、撤销与删除恢复管理 (PRD §5 A9-F03 / ADR-0089)
 *
 * 合同：Checkpoint 不只存在内存——pre-mutation 原始内容写入产品恢复区
 * （content-addressed blob / 目录快照），轮清单持久化为版本化 JSON；
 * 撤销支持按文件与按 Turn，撤销前校验当前文件漂移；崩溃后可从磁盘恢复；
 * 恢复失败必须结构化报告，不允许静默吞错。
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { buildContentDiffPreview } from './diff';

export const CHECKPOINT_SCHEMA_VERSION = 4;

export interface FileChangeRecord {
  filePath: string;
  action: 'create' | 'modify' | 'delete';
  isDirectory: boolean;
  /** F2：外部变化无原始内容可恢复（基线未覆盖）时为 true；undo 保留现场并如实报告。 */
  unrecoverable?: boolean;
  originalHash?: string;
  /** 单文件原始内容 blob（恢复区内路径）。 */
  originalBlobPath?: string;
  /** 目录原始内容快照（恢复区内路径）。 */
  originalSnapshotPath?: string;
  /**
   * 轮内当前状态快照：路径在本轮内被新建后再次变更/删除时，捕获当时的
   * 实际内容用于恢复；不覆盖 original*（轮初语义）。
   */
  currentStateBlobPath?: string;
  currentStateSnapshotPath?: string;
  /** 目录快照/轮后目录状态的确定性树哈希。 */
  originalTreeHash?: string;
  currentStateTreeHash?: string;
  newTreeHash?: string;
  newHash?: string;
  newBlobPath?: string;
  /** undo 成功后持久化，重启或重复点击不会再次作用于文件系统。 */
  undoAppliedAt?: string;
  timestamp: string;
}

/** 外部（Shell/Git/项目脚本）造成的不可恢复变化标记。 */
export interface UnrecoverableExternalChange {
  path: string;
  kind: 'created' | 'modified' | 'deleted' | 'renamed' | 'outside' | 'too_large' | 'backup_failed';
  reason: string;
}

export interface TurnCheckpoint {
  schemaVersion: typeof CHECKPOINT_SCHEMA_VERSION;
  turnId: string;
  createdAt: string;
  updatedAt: string;
  changes: Record<string, FileChangeRecord>;
  /** v3：显式标记为不可恢复的外部变化（不静默遗漏）。 */
  unrecoverable: Record<string, UnrecoverableExternalChange>;
}

export interface UndoOutcome {
  restored: string[];
  errors: string[];
  /** 撤销时发现文件被外部修改、未覆盖的路径。 */
  drifted: string[];
}

export class CheckpointManager {
  private readonly checkpoints = new Map<string, TurnCheckpoint>();
  private readonly recoveryRoot: string;
  private readonly blobsRoot: string;
  private readonly snapshotsRoot: string;
  private readonly manifestsRoot: string;

  constructor(private readonly workspaceRoot: string, recoveryRoot?: string) {
    this.recoveryRoot = recoveryRoot ?? path.join(workspaceRoot, '.agent_recovery');
    this.blobsRoot = path.join(this.recoveryRoot, 'blobs');
    this.snapshotsRoot = path.join(this.recoveryRoot, 'snapshots');
    this.manifestsRoot = path.join(this.recoveryRoot, 'checkpoints');
  }

  getRecoveryRoot(): string {
    return this.recoveryRoot;
  }

  private assertSafeTurnId(turnId: string): void {
    if (!/^[a-zA-Z0-9._-]+$/.test(turnId)) {
      throw new Error(`checkpoint manifest contains unsafe turn id: ${turnId}`);
    }
  }

  private isPlainRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
      && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
  }

  private isWithin(root: string, candidate: string): boolean {
    const relative = path.relative(path.resolve(root), path.resolve(candidate));
    return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  }

  private assertWorkspaceRelativePath(candidate: unknown, label: string): string {
    if (typeof candidate !== 'string' || candidate.length === 0 || candidate.includes('\0')) {
      throw new Error(`${label} must be a non-empty relative path`);
    }
    if (path.isAbsolute(candidate) || path.win32.isAbsolute(candidate)) {
      throw new Error(`${label} must stay inside the workspace`);
    }
    const winNormalized = path.win32.normalize(candidate);
    if (winNormalized === '.' || winNormalized === '..' || winNormalized.startsWith('..\\')) {
      throw new Error(`${label} escapes the workspace`);
    }
    const resolved = path.resolve(this.workspaceRoot, candidate);
    if (resolved === path.resolve(this.workspaceRoot) || !this.isWithin(this.workspaceRoot, resolved)) {
      throw new Error(`${label} escapes the workspace`);
    }
    if (this.isWithin(this.recoveryRoot, resolved)) throw new Error(`${label} targets the recovery store`);
    // Resolve the nearest existing ancestor as well, so a junction/symlink in
    // a tampered manifest cannot redirect undo outside the trusted workspace.
    let probe = resolved;
    while (!fs.existsSync(probe) && path.dirname(probe) !== probe) probe = path.dirname(probe);
    if (fs.existsSync(probe) && !this.isWithin(fs.realpathSync(this.workspaceRoot), fs.realpathSync(probe))) {
      throw new Error(`${label} resolves outside the workspace`);
    }
    return candidate;
  }

  private assertRecoveryArtifact(candidate: unknown, root: string, label: string, kind: 'file' | 'directory'): string {
    if (typeof candidate !== 'string' || candidate.length === 0 || candidate.includes('\0')) {
      throw new Error(`${label} must be a recovery artifact path`);
    }
    const resolved = path.resolve(candidate);
    if (!this.isWithin(root, resolved) || !fs.existsSync(resolved)) {
      throw new Error(`${label} is missing or outside the recovery root`);
    }
    const canonicalRoot = fs.realpathSync(root);
    const canonicalArtifact = fs.realpathSync(resolved);
    if (!this.isWithin(canonicalRoot, canonicalArtifact)) {
      throw new Error(`${label} resolves outside the recovery root`);
    }
    const stat = fs.statSync(canonicalArtifact);
    if ((kind === 'file' && !stat.isFile()) || (kind === 'directory' && !stat.isDirectory())) {
      throw new Error(`${label} has the wrong artifact type`);
    }
    return canonicalArtifact;
  }

  private validateBlob(candidate: unknown, expectedHash: unknown, label: string): void {
    const blobPath = this.assertRecoveryArtifact(candidate, this.blobsRoot, label, 'file');
    const name = path.basename(blobPath);
    if (!/^[a-f0-9]{64}$/.test(name) || path.basename(path.dirname(blobPath)) !== name.slice(0, 2)) {
      throw new Error(`${label} is not a content-addressed blob path`);
    }
    if (expectedHash !== undefined && (typeof expectedHash !== 'string' || expectedHash !== name)) {
      throw new Error(`${label} does not match its declared SHA-256`);
    }
    const actual = this.hashBytes(fs.readFileSync(blobPath));
    if (actual !== name) throw new Error(`${label} content SHA-256 mismatch`);
  }

  private validateCheckpoint(parsed: unknown, requestedTurnId: string): TurnCheckpoint {
    if (!this.isPlainRecord(parsed)) throw new Error('checkpoint manifest must be an object');
    if (![2, 3, CHECKPOINT_SCHEMA_VERSION].includes(Number(parsed.schemaVersion))) {
      throw new Error(`checkpoint manifest schema mismatch for ${requestedTurnId}`);
    }
    if (parsed.turnId !== requestedTurnId) throw new Error(`checkpoint manifest turn mismatch for ${requestedTurnId}`);
    this.assertSafeTurnId(requestedTurnId);
    for (const field of ['createdAt', 'updatedAt']) {
      const value = parsed[field];
      if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
        throw new Error(`checkpoint manifest ${field} is invalid`);
      }
    }
    if (!this.isPlainRecord(parsed.changes)) throw new Error('checkpoint manifest changes must be an object');
    for (const [key, raw] of Object.entries(parsed.changes)) {
      if (!this.isPlainRecord(raw)) throw new Error(`checkpoint change ${key} must be an object`);
      const filePath = this.assertWorkspaceRelativePath(raw.filePath, `checkpoint change ${key}.filePath`);
      if (filePath !== key) throw new Error(`checkpoint change key does not match filePath: ${key}`);
      if (!['create', 'modify', 'delete'].includes(String(raw.action))) throw new Error(`checkpoint change ${key} has invalid action`);
      if (typeof raw.isDirectory !== 'boolean') throw new Error(`checkpoint change ${key} has invalid isDirectory`);
      if (typeof raw.timestamp !== 'string' || !Number.isFinite(Date.parse(raw.timestamp))) {
        throw new Error(`checkpoint change ${key} has invalid timestamp`);
      }
      if (raw.unrecoverable !== undefined && typeof raw.unrecoverable !== 'boolean') {
        throw new Error(`checkpoint change ${key} has invalid unrecoverable flag`);
      }
      for (const hashField of ['originalHash', 'newHash', 'originalTreeHash', 'currentStateTreeHash', 'newTreeHash']) {
        const value = raw[hashField];
        if (value !== undefined && (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) {
          throw new Error(`checkpoint change ${key}.${hashField} is invalid`);
        }
      }
      if (raw.undoAppliedAt !== undefined && (typeof raw.undoAppliedAt !== 'string' || !Number.isFinite(Date.parse(raw.undoAppliedAt)))) {
        throw new Error(`checkpoint change ${key}.undoAppliedAt is invalid`);
      }
      if (raw.isDirectory === true && (raw.originalBlobPath !== undefined || raw.currentStateBlobPath !== undefined
        || raw.newBlobPath !== undefined || raw.originalHash !== undefined || raw.newHash !== undefined)) {
        throw new Error(`checkpoint change ${key} mixes directory and file artifacts`);
      }
      if (raw.isDirectory === false && (raw.originalSnapshotPath !== undefined || raw.currentStateSnapshotPath !== undefined
        || raw.originalTreeHash !== undefined || raw.currentStateTreeHash !== undefined || raw.newTreeHash !== undefined)) {
        throw new Error(`checkpoint change ${key} mixes file and directory artifacts`);
      }
      if (raw.originalBlobPath !== undefined) this.validateBlob(raw.originalBlobPath, raw.originalHash, `checkpoint change ${key}.originalBlobPath`);
      if (raw.newBlobPath !== undefined) this.validateBlob(raw.newBlobPath, raw.newHash, `checkpoint change ${key}.newBlobPath`);
      if (raw.currentStateBlobPath !== undefined) this.validateBlob(raw.currentStateBlobPath, undefined, `checkpoint change ${key}.currentStateBlobPath`);
      for (const snapshotField of ['originalSnapshotPath', 'currentStateSnapshotPath']) {
        if (raw[snapshotField] !== undefined) {
          const snapshotPath = this.assertRecoveryArtifact(raw[snapshotField], this.snapshotsRoot, `checkpoint change ${key}.${snapshotField}`, 'directory');
          const expectedTreeHash = snapshotField === 'originalSnapshotPath' ? raw.originalTreeHash : raw.currentStateTreeHash;
          if (expectedTreeHash !== undefined && this.hashDirectoryTree(snapshotPath) !== expectedTreeHash) {
            throw new Error(`checkpoint change ${key}.${snapshotField} tree SHA-256 mismatch`);
          }
        }
      }
    }
    const unrecoverable = parsed.unrecoverable === undefined ? {} : parsed.unrecoverable;
    if (!this.isPlainRecord(unrecoverable)) throw new Error('checkpoint manifest unrecoverable must be an object');
    for (const [key, raw] of Object.entries(unrecoverable)) {
      if (!this.isPlainRecord(raw) || raw.path !== key || typeof raw.reason !== 'string' || raw.reason.length === 0
        || !['created', 'modified', 'deleted', 'renamed', 'outside', 'too_large', 'backup_failed'].includes(String(raw.kind))) {
        throw new Error(`checkpoint unrecoverable entry is invalid: ${key}`);
      }
      if (raw.kind !== 'outside') this.assertWorkspaceRelativePath(raw.path, `checkpoint unrecoverable ${key}.path`);
    }
    return {
      ...(parsed as unknown as TurnCheckpoint),
      unrecoverable: unrecoverable as Record<string, unknown> as Record<string, UnrecoverableExternalChange>,
    };
  }

  private manifestPath(turnId: string): string {
    this.assertSafeTurnId(turnId);
    return path.join(this.manifestsRoot, `${turnId}.json`);
  }

  /** 加载（含崩溃后恢复）：优先内存，其次磁盘清单。 */
  loadCheckpoint(turnId: string): TurnCheckpoint | undefined {
    const memory = this.checkpoints.get(turnId);
    if (memory) return memory;
    const manifestPath = this.manifestPath(turnId);
    if (!fs.existsSync(manifestPath)) return undefined;
    try {
      const parsed = this.validateCheckpoint(JSON.parse(fs.readFileSync(manifestPath, 'utf8')), turnId);
      this.checkpoints.set(turnId, parsed);
      return parsed;
    } catch (err) {
      throw new Error(`无法读取 Checkpoint 清单 ${manifestPath}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  listPersistedTurns(): string[] {
    if (!fs.existsSync(this.manifestsRoot)) return [];
    return fs
      .readdirSync(this.manifestsRoot)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -5));
  }

  private persist(checkpoint: TurnCheckpoint): void {
    checkpoint.updatedAt = new Date().toISOString();
    fs.mkdirSync(this.manifestsRoot, { recursive: true });
    const target = this.manifestPath(checkpoint.turnId);
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
    try {
      fs.writeFileSync(tmp, `${JSON.stringify(checkpoint, null, 2)}\n`, 'utf8');
      fs.renameSync(tmp, target);
    } catch (err) {
      // 清单持久化失败必须暴露：撤销保证依赖磁盘事实，不能只在内存成立。
      try {
        if (fs.existsSync(tmp)) fs.unlinkSync(tmp);
      } catch (_cleanupErr) { /* best effort */ }
      throw new Error(`Checkpoint 清单写入失败 (${target}): ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * 开启一轮新的 Checkpoint 事务
   */
  startTurn(turnId: string): TurnCheckpoint {
    let checkpoint = this.loadCheckpoint(turnId);
    if (!checkpoint) {
      checkpoint = {
        schemaVersion: CHECKPOINT_SCHEMA_VERSION,
        turnId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        changes: {},
        unrecoverable: {},
      };
      this.checkpoints.set(turnId, checkpoint);
      this.persist(checkpoint);
    }
    if (!checkpoint.unrecoverable) checkpoint.unrecoverable = {};
    return checkpoint;
  }

  private hashBytes(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /** 不跟随 symlink/junction 的确定性目录树哈希。 */
  private hashDirectoryTree(root: string): string {
    const digest = crypto.createHash('sha256');
    const visit = (absolute: string, relative: string): void => {
      const stat = fs.lstatSync(absolute);
      const normalized = relative.replace(/\\/g, '/');
      if (stat.isSymbolicLink()) {
        digest.update(`L\0${normalized}\0${fs.readlinkSync(absolute)}\0`);
        return;
      }
      if (stat.isDirectory()) {
        digest.update(`D\0${normalized}\0`);
        for (const name of fs.readdirSync(absolute).sort()) visit(path.join(absolute, name), path.join(relative, name));
        return;
      }
      if (stat.isFile()) {
        digest.update(`F\0${normalized}\0${stat.size}\0${this.hashBytes(fs.readFileSync(absolute))}\0`);
        return;
      }
      digest.update(`O\0${normalized}\0${stat.mode}\0${stat.size}\0`);
    };
    visit(root, '.');
    return digest.digest('hex');
  }

  private storeBlob(content: Buffer): string {
    const hash = this.hashBytes(content);
    const blobPath = path.join(this.blobsRoot, hash.slice(0, 2), hash);
    if (!fs.existsSync(blobPath)) {
      fs.mkdirSync(path.dirname(blobPath), { recursive: true });
      const tmp = `${blobPath}.tmp-${process.pid}-${Date.now()}`;
      fs.writeFileSync(tmp, content);
      fs.renameSync(tmp, blobPath);
    }
    return blobPath;
  }

  /** 递归快照目录到恢复区（用于目录删除/覆盖的恢复）。 */
  private snapshotDirectory(absDir: string, turnId: string, relPath: string): { path: string; treeHash: string } {
    const identity = this.hashBytes(Buffer.from(relPath, 'utf8'));
    const target = path.join(this.snapshotsRoot, turnId.replace(/[^a-zA-Z0-9._-]+/g, '_'), identity);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(absDir, target, { recursive: true });
    const sourceTreeHash = this.hashDirectoryTree(absDir);
    if (this.hashDirectoryTree(target) !== sourceTreeHash) throw new Error(`目录快照完整性校验失败: ${relPath}`);
    return { path: target, treeHash: sourceTreeHash };
  }

  private isExternalTarget(targetPath: string): boolean {
    const resolved = path.resolve(this.workspaceRoot, targetPath);
    return resolved === path.resolve(this.workspaceRoot) || !this.isWithin(this.workspaceRoot, resolved);
  }

  /**
   * 在发生副作用前记录文件/目录内容基线。失败抛出结构化错误——
   * 无法建立可撤销基线时宁可拒绝变更，也不产生不可恢复副作用。
   * 对轮内已存在的记录，补充“当前状态”快照以支持后续变更/删除的恢复。
   */
  recordPreMutation(turnId: string, targetPath: string): FileChangeRecord {
    const checkpoint = this.startTurn(turnId);
    if (this.isExternalTarget(targetPath)) {
      checkpoint.unrecoverable[targetPath] = {
        path: targetPath,
        kind: 'outside',
        reason: '目标位于工作区外；为避免重启后从可篡改清单对外部路径执行恢复，仅记录事实，不提供自动 undo。',
      };
      this.persist(checkpoint);
      return { filePath: targetPath, action: 'modify', isDirectory: false, unrecoverable: true, timestamp: new Date().toISOString() };
    }
    const existing = checkpoint.changes[targetPath];

    const absPath = path.resolve(this.workspaceRoot, targetPath);
    const pathExists = fs.existsSync(absPath);
    const pathIsDirectory = pathExists && fs.statSync(absPath).isDirectory();

    if (existing) {
      if (pathExists && pathIsDirectory) {
        if (!existing.originalSnapshotPath && !existing.currentStateSnapshotPath) {
          const snapshot = this.snapshotDirectory(absPath, turnId, targetPath);
          existing.currentStateSnapshotPath = snapshot.path;
          existing.currentStateTreeHash = snapshot.treeHash;
        }
        existing.isDirectory = true;
      } else if (pathExists) {
        if (!existing.originalBlobPath && !existing.newBlobPath && !existing.currentStateBlobPath) {
          const content = fs.readFileSync(absPath);
          existing.currentStateBlobPath = this.storeBlob(content);
        }
      }
      this.persist(checkpoint);
      return existing;
    }

    let record: FileChangeRecord;
    if (pathExists) {
      if (pathIsDirectory) {
        const snapshot = this.snapshotDirectory(absPath, turnId, targetPath);
        record = {
          filePath: targetPath,
          action: 'modify',
          isDirectory: true,
          originalSnapshotPath: snapshot.path,
          originalTreeHash: snapshot.treeHash,
          timestamp: new Date().toISOString(),
        };
      } else {
        const content = fs.readFileSync(absPath);
        const hash = this.hashBytes(content);
        record = {
          filePath: targetPath,
          action: 'modify',
          isDirectory: false,
          originalHash: hash,
          originalBlobPath: this.storeBlob(content),
          timestamp: new Date().toISOString(),
        };
      }
    } else {
      record = {
        filePath: targetPath,
        action: 'create',
        isDirectory: false,
        timestamp: new Date().toISOString(),
      };
    }
    checkpoint.changes[targetPath] = record;
    this.persist(checkpoint);
    return record;
  }

  /**
   * 记录已完成的文件变更后状态
   */
  recordPostMutation(turnId: string, targetPath: string, action: 'create' | 'modify' | 'delete'): void {
    const checkpoint = this.startTurn(turnId);
    if (this.isExternalTarget(targetPath)) {
      const existing = checkpoint.unrecoverable[targetPath];
      checkpoint.unrecoverable[targetPath] = {
        path: targetPath,
        kind: 'outside',
        reason: existing?.reason ?? '工作区外变化不提供自动 undo。',
      };
      this.persist(checkpoint);
      return;
    }
    const absPath = path.resolve(this.workspaceRoot, targetPath);
    const existing = checkpoint.changes[targetPath] ?? {
      filePath: targetPath,
      action,
      isDirectory: false,
      timestamp: new Date().toISOString(),
    };

    if (action === 'delete') {
      existing.action = 'delete';
      existing.newHash = undefined;
      existing.newBlobPath = undefined;
      existing.newTreeHash = undefined;
    } else if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
      const content = fs.readFileSync(absPath);
      existing.newHash = this.hashBytes(content);
      existing.newBlobPath = this.storeBlob(content);
      existing.newTreeHash = undefined;
      existing.isDirectory = false;
    } else if (fs.existsSync(absPath) && fs.statSync(absPath).isDirectory()) {
      existing.newHash = undefined;
      existing.newBlobPath = undefined;
      existing.newTreeHash = this.hashDirectoryTree(absPath);
      existing.isDirectory = true;
    } else {
      existing.newHash = undefined;
      existing.newBlobPath = undefined;
    }

    checkpoint.changes[targetPath] = existing;
    this.persist(checkpoint);
  }

  /**
   * 撤销整轮 Turn 的所有文件修改。撤销前检查当前文件漂移：外部修改过的
   * 条目被跳过并计入 drifted，不盲目覆盖。
   */
  undoTurn(turnId: string): UndoOutcome {
    const checkpoint = this.loadCheckpoint(turnId);
    if (!checkpoint) {
      return { restored: [], errors: [`未找到 Checkpoint: ${turnId}`], drifted: [] };
    }
    const outcome: UndoOutcome = { restored: [], errors: [], drifted: [] };
    // 逆序撤销：后写的先撤。
    const paths = Object.keys(checkpoint.changes).reverse();
    for (const relPath of paths) {
      this.undoOne(checkpoint, relPath, outcome);
    }
    return outcome;
  }

  /** 按单文件撤销本轮变化。 */
  undoFile(turnId: string, relPath: string): UndoOutcome {
    const checkpoint = this.loadCheckpoint(turnId);
    if (!checkpoint) {
      return { restored: [], errors: [`未找到 Checkpoint: ${turnId}`], drifted: [] };
    }
    if (!checkpoint.changes[relPath]) {
      return { restored: [], errors: [`Checkpoint ${turnId} 中没有 ${relPath} 的记录`], drifted: [] };
    }
    const outcome: UndoOutcome = { restored: [], errors: [], drifted: [] };
    this.undoOne(checkpoint, relPath, outcome);
    return outcome;
  }

  private undoOne(checkpoint: TurnCheckpoint, relPath: string, outcome: UndoOutcome): void {
    const record = checkpoint.changes[relPath];
    const absPath = path.resolve(this.workspaceRoot, relPath);
    try {
      if (record.undoAppliedAt) {
        outcome.restored.push(`${relPath} (此前已撤销，未重复执行)`);
        return;
      }
      if (record.action === 'create') {
        // 新建的文件/目录撤销为删除；漂移（外部改写）时不盲删。
        if (fs.existsSync(absPath)) {
          const drift = this.describeDrift(absPath, record.newHash, record.newTreeHash, record.isDirectory);
          if (drift) {
            outcome.drifted.push(`${relPath} (${drift})`);
            return;
          }
          if (fs.statSync(absPath).isDirectory()) {
            fs.rmSync(absPath, { recursive: true, force: true });
          } else {
            fs.unlinkSync(absPath);
          }
        }
        outcome.restored.push(`${relPath} (已移除新建文件)`);
        this.markUndoApplied(checkpoint, record);
        return;
      }

      if (record.action === 'delete') {
        const errorsBefore = outcome.errors.length;
        // 删除撤销为恢复内容：优先轮初原始内容，其次轮内当前状态快照；
        // 都不存在说明是“轮内新建后删除”，净效果为不存在，无需恢复。
        if (fs.existsSync(absPath)) {
          outcome.drifted.push(`${relPath} (删除后被外部重建，未覆盖)`);
          return;
        }
        const restoreSnapshot = record.originalSnapshotPath ?? record.currentStateSnapshotPath;
        const restoreBlob = record.originalBlobPath ?? record.currentStateBlobPath;
        if (record.isDirectory && restoreSnapshot) {
          if (!fs.existsSync(restoreSnapshot)) {
            outcome.errors.push(`撤销删除 ${relPath} 失败: 目录快照缺失 (${restoreSnapshot})`);
            return;
          }
          const expectedSnapshotHash = record.originalSnapshotPath ? record.originalTreeHash : record.currentStateTreeHash;
          if (!expectedSnapshotHash || this.hashDirectoryTree(restoreSnapshot) !== expectedSnapshotHash) {
            outcome.errors.push(`撤销删除 ${relPath} 失败: 目录快照缺少或不匹配树哈希`);
            return;
          }
          fs.mkdirSync(path.dirname(absPath), { recursive: true });
          fs.cpSync(restoreSnapshot, absPath, { recursive: true });
          outcome.restored.push(`${relPath} (已恢复目录及内容)`);
        } else if (!record.isDirectory && restoreBlob) {
          if (!fs.existsSync(restoreBlob)) {
            outcome.errors.push(`撤销删除 ${relPath} 失败: 原始内容 blob 缺失 (${restoreBlob})`);
            return;
          }
          fs.mkdirSync(path.dirname(absPath), { recursive: true });
          fs.copyFileSync(restoreBlob, absPath);
          outcome.restored.push(`${relPath} (已恢复原始版本)`);
        } else if (!restoreSnapshot && !restoreBlob) {
          if (record.unrecoverable === true) {
            outcome.errors.push(`撤销删除 ${relPath} 失败: 轮前基线未覆盖该文件，原内容无法恢复`);
          } else {
            outcome.restored.push(`${relPath} (轮内新建后删除，净效果保持不存在)`);
          }
        } else {
          outcome.errors.push(`撤销删除 ${relPath} 失败: 恢复内容记录类型不匹配`);
        }
        if (outcome.errors.length === errorsBefore) this.markUndoApplied(checkpoint, record);
        return;
      }

      // F2：无原始内容且标记不可恢复的修改 → 保留当前现场，绝不删除原文件。
      if (record.unrecoverable === true && !record.originalBlobPath && !record.originalSnapshotPath) {
        outcome.errors.push(`撤销 ${relPath} 失败: 该文件的轮前基线未覆盖（超限/读取失败），无法恢复原内容；当前内容已保留`);
        return;
      }

      // modify：恢复原始内容；当前状态与 post-mutation 哈希不一致时视为漂移。
      if (fs.existsSync(absPath)) {
        const drift = this.describeDrift(absPath, record.newHash, record.newTreeHash, record.isDirectory);
        if (drift) {
          outcome.drifted.push(`${relPath} (${drift})`);
          return;
        }
      }
      if (record.isDirectory && record.originalSnapshotPath) {
        if (!record.originalTreeHash || this.hashDirectoryTree(record.originalSnapshotPath) !== record.originalTreeHash) {
          outcome.errors.push(`撤销修改 ${relPath} 失败: 目录快照缺少或不匹配树哈希`);
          return;
        }
        fs.rmSync(absPath, { recursive: true, force: true });
        fs.cpSync(record.originalSnapshotPath, absPath, { recursive: true });
        outcome.restored.push(`${relPath} (已恢复原始目录)`);
      } else if (record.originalBlobPath) {
        if (!fs.existsSync(record.originalBlobPath)) {
          outcome.errors.push(`撤销修改 ${relPath} 失败: 原始内容 blob 缺失`);
          return;
        }
        fs.mkdirSync(path.dirname(absPath), { recursive: true });
        fs.copyFileSync(record.originalBlobPath, absPath);
        outcome.restored.push(`${relPath} (已恢复原始版本)`);
      } else {
        // 原本不存在（create 语义被记为 modify）→ 撤销为删除。
        if (fs.existsSync(absPath)) fs.unlinkSync(absPath);
        outcome.restored.push(`${relPath} (已移除新建文件)`);
      }
      this.markUndoApplied(checkpoint, record);
    } catch (err: any) {
      outcome.errors.push(`撤销 ${relPath} 失败: ${err.message}`);
    }
  }

  private markUndoApplied(checkpoint: TurnCheckpoint, record: FileChangeRecord): void {
    record.undoAppliedAt = new Date().toISOString();
    this.persist(checkpoint);
  }

  private describeDrift(
    absPath: string,
    expectedHash: string | undefined,
    expectedTreeHash: string | undefined,
    expectedDirectory: boolean,
  ): string | undefined {
    if (!fs.existsSync(absPath)) {
      return expectedHash || expectedTreeHash ? '路径在变更后消失' : undefined;
    }
    const stat = fs.lstatSync(absPath);
    if (stat.isDirectory() !== expectedDirectory) return '路径类型在变更后被外部替换';
    if (stat.isDirectory()) {
      if (!expectedTreeHash) return '目录缺少轮后树哈希，拒绝自动覆盖';
      return this.hashDirectoryTree(absPath) === expectedTreeHash ? undefined : '目录在变更后被外部修改';
    }
    if (!expectedHash) return undefined;
    const current = this.hashBytes(fs.readFileSync(absPath));
    return current === expectedHash ? undefined : '文件在变更后被外部修改';
  }

  /**
   * 记录外部（Shell/Git/脚本）造成的可恢复变化：created → undo 删除；
   * modified/deleted → 用提供的内容 blob 恢复原始内容。
   */
  recordExternalFact(
    turnId: string,
    relPath: string,
    action: 'created' | 'modified' | 'deleted',
    options: { originalBlobPath?: string; newBlobPath?: string; originalHash?: string; newHash?: string; unrecoverable?: boolean } = {},
  ): void {
    const checkpoint = this.startTurn(turnId);
    const existing = checkpoint.changes[relPath];
    if (existing && existing.action !== 'create' && existing.originalBlobPath) {
      // 已有工具写入记录（含轮初原始内容）优先，不覆盖更强的事实。
      this.persist(checkpoint);
      return;
    }
    const record: FileChangeRecord = existing ?? {
      filePath: relPath,
      action: 'create',
      isDirectory: false,
      timestamp: new Date().toISOString(),
    };
    if (action === 'created') {
      record.action = 'create';
      record.newBlobPath = options.newBlobPath ?? record.newBlobPath;
      record.newHash = options.newHash ?? record.newHash;
    } else if (action === 'modified') {
      record.action = 'modify';
      record.originalBlobPath = options.originalBlobPath ?? record.originalBlobPath;
      record.originalHash = options.originalHash ?? record.originalHash;
      record.newBlobPath = options.newBlobPath ?? record.newBlobPath;
      record.newHash = options.newHash ?? record.newHash;
    } else {
      record.action = 'delete';
      record.originalBlobPath = options.originalBlobPath ?? record.originalBlobPath;
      record.originalHash = options.originalHash ?? record.originalHash;
    }
    if (options.unrecoverable === true) record.unrecoverable = true;
    checkpoint.changes[relPath] = record;
    this.persist(checkpoint);
  }

  /** 显式标记不可恢复的外部变化（不静默遗漏）。 */
  recordUnrecoverableExternal(turnId: string, change: UnrecoverableExternalChange): void {
    const checkpoint = this.startTurn(turnId);
    checkpoint.unrecoverable[change.path] = change;
    this.persist(checkpoint);
  }

  /** 读取外部变化报告（含可恢复与不可恢复），供 Diff/SQLite/UI 共用。 */
  getExternalChanges(turnId: string): {
    recoverable: Array<{ path: string; action: 'create' | 'modify' | 'delete' }>;
    unrecoverable: UnrecoverableExternalChange[];
  } {
    const checkpoint = this.loadCheckpoint(turnId);
    if (!checkpoint) return { recoverable: [], unrecoverable: [] };
    return {
      recoverable: Object.values(checkpoint.changes).map((r) => ({ path: r.filePath, action: r.action })),
      unrecoverable: Object.values(checkpoint.unrecoverable ?? {}),
    };
  }

  /**
   * 获取指定 Turn 的变更清单和 Diff
   */
  getTurnDiff(turnId: string): Array<{ path: string; action: string; diffText: string }> {
    const checkpoint = this.loadCheckpoint(turnId);
    if (!checkpoint) return [];

    const results: Array<{ path: string; action: string; diffText: string }> = [];
    for (const [relPath, record] of Object.entries(checkpoint.changes)) {
      const original = record.originalBlobPath && fs.existsSync(record.originalBlobPath)
        ? fs.readFileSync(record.originalBlobPath)
        : null;
      const next = record.newBlobPath && fs.existsSync(record.newBlobPath)
        ? fs.readFileSync(record.newBlobPath)
        : null;
      const diff = buildContentDiffPreview(original, next);
      results.push({ path: relPath, action: record.action, diffText: diff.unifiedDiff });
    }
    return results;
  }

  getTurnChanges(turnId: string): FileChangeRecord[] {
    const checkpoint = this.loadCheckpoint(turnId);
    return checkpoint ? Object.values(checkpoint.changes).map((r) => ({ ...r })) : [];
  }

  /** 供删除恢复区使用的显式接口：把文件内容存入恢复区并返回路径。 */
  saveToRecovery(relPath: string, content: Buffer): string {
    return this.storeBlob(content);
  }
}

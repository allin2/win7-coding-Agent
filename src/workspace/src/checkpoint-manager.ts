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
  /** 轮初与轮后路径类型分开记录，支持同一 Turn 内 file↔directory 替换。 */
  originalKind?: 'absent' | 'file' | 'directory';
  newKind?: 'absent' | 'file' | 'directory';
  /** F2：外部变化无原始内容可恢复（基线未覆盖）时为 true；undo 保留现场并如实报告。 */
  unrecoverable?: boolean;
  originalHash?: string;
  /** 原始文件工件来自直接工具的 pre-mutation，或更早的 Shell-entry baseline。 */
  originalArtifactRole?: 'original' | 'baseline';
  /** 单文件原始内容 blob（恢复区内路径）。 */
  originalBlobPath?: string;
  /** 目录原始内容快照（恢复区内路径）。 */
  originalSnapshotPath?: string;
  /** 原始目录工件来自直接工具或更早的 Shell-entry baseline。 */
  originalSnapshotRole?: 'original' | 'baseline';
  /**
   * 轮内当前状态快照：路径在本轮内被新建后再次变更/删除时，捕获当时的
   * 实际内容用于恢复；不覆盖 original*（轮初语义）。
   */
  currentStateBlobPath?: string;
  currentStateSnapshotPath?: string;
  currentStateHash?: string;
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
  /** 1 = 文件/目录恢复工件都绑定 turnId + filePath + role。 */
  artifactBindingVersion?: 1;
  changes: Record<string, FileChangeRecord>;
  /** v3：显式标记为不可恢复的外部变化（不静默遗漏）。 */
  unrecoverable: Record<string, UnrecoverableExternalChange>;
  /** Durable Shell-entry baseline; pending collection makes undo fail closed after a crash. */
  externalBaseline?: PersistedExternalBaseline;
}

export interface PersistedExternalBaseline {
  schemaVersion: 1;
  frozenAt: string;
  collectionStatus: 'pending' | 'awaiting_confirmation' | 'complete';
  collectedAt?: string;
  undoConfirmationId?: string;
  files: Record<string, { sha256: string; blobPath: string; size: number }>;
  directories: Record<string, { snapshotPath: string; treeHash: string }>;
  skipped: Array<{ path: string; reason: 'too_large' | 'backup_failed' | 'outside'; size?: number; mtimeMs?: number }>;
}

export interface UndoOutcome {
  restored: string[];
  errors: string[];
  /** 撤销时发现文件被外部修改、未覆盖的路径。 */
  drifted: string[];
}

class CheckpointDriftError extends Error {}

export class CheckpointManager {
  private readonly checkpoints = new Map<string, TurnCheckpoint>();
  private readonly authorizedExternalUndoTurns = new Set<string>();
  private readonly workspaceRoot: string;
  private readonly recoveryRoot: string;
  private readonly blobsRoot: string;
  private readonly snapshotsRoot: string;
  private readonly manifestsRoot: string;
  private readonly containsSensitiveData: (value: string | Buffer) => boolean;

  constructor(
    workspaceRoot: string,
    recoveryRoot?: string,
    containsSensitiveData: (value: string | Buffer) => boolean = () => false,
  ) {
    try {
      this.workspaceRoot = fs.realpathSync(workspaceRoot);
    } catch (_error) {
      this.workspaceRoot = path.resolve(workspaceRoot);
    }
    this.recoveryRoot = recoveryRoot ? path.resolve(recoveryRoot) : path.join(this.workspaceRoot, '.agent_recovery');
    this.blobsRoot = path.join(this.recoveryRoot, 'blobs');
    this.snapshotsRoot = path.join(this.recoveryRoot, 'snapshots');
    this.manifestsRoot = path.join(this.recoveryRoot, 'checkpoints');
    this.containsSensitiveData = containsSensitiveData;
  }

  private assertNotSensitive(value: string | Buffer, label: string): void {
    if (this.containsSensitiveData(value)) {
      throw new Error(`A9_CHECKPOINT_SECRET_BLOCKED: ${label} contains known secret material`);
    }
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
    if (!this.isWithin(root, resolved)) throw new Error(`${label} is outside the recovery root`);
    if (!fs.existsSync(resolved)) throw new Error(`${label} is missing from the recovery root`);
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
    if (this.hashFile(blobPath) !== name) throw new Error(`${label} content SHA-256 mismatch`);
  }

  private fileSnapshotPath(turnId: string, relPath: string, role: 'baseline' | 'original' | 'current' | 'new'): string {
    return path.join(this.snapshotsRoot, turnId, this.hashBytes(Buffer.from(relPath, 'utf8')), `${role}.bin`);
  }

  private storeBoundFile(
    content: Buffer,
    turnId: string,
    relPath: string,
    role: 'baseline' | 'original' | 'current' | 'new',
  ): string {
    this.assertSafeTurnId(turnId);
    this.assertNotSensitive(relPath, 'checkpoint path');
    this.assertNotSensitive(content, 'checkpoint file content');
    const target = this.fileSnapshotPath(turnId, relPath, role);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    // A Turn-entry baseline is immutable. A later tool mutation in the same
    // Turn must not replace it with an already-modified intermediate state.
    if ((role === 'baseline' || role === 'original') && fs.existsSync(target)) return target;
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
    fs.writeFileSync(tmp, content);
    if (this.hashBytes(fs.readFileSync(tmp)) !== this.hashBytes(content)) {
      fs.unlinkSync(tmp);
      throw new Error(`文件快照完整性校验失败: ${relPath}`);
    }
    fs.renameSync(tmp, target);
    return target;
  }

  private validateBoundFile(
    candidate: unknown,
    expectedHash: unknown,
    turnId: string,
    relPath: string,
    role: 'baseline' | 'original' | 'current' | 'new',
    label: string,
  ): void {
    const artifact = this.assertRecoveryArtifact(candidate, this.snapshotsRoot, label, 'file');
    const expectedPath = fs.realpathSync(this.fileSnapshotPath(turnId, relPath, role));
    if (artifact !== expectedPath) throw new Error(`${label} is not bound to its turn, file path and role`);
    if (typeof expectedHash !== 'string' || !/^[a-f0-9]{64}$/.test(expectedHash)
      || this.hashBytes(fs.readFileSync(artifact)) !== expectedHash) {
      throw new Error(`${label} content SHA-256 mismatch`);
    }
    this.assertNotSensitive(fs.readFileSync(artifact), `${label} content`);
  }

  private assertSnapshotNotSensitive(root: string, label: string): void {
    const stack = [root];
    while (stack.length > 0) {
      const current = stack.pop()!;
      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        this.assertNotSensitive(entry.name, `${label} path`);
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else if (entry.isFile()) this.assertNotSensitive(fs.readFileSync(full), `${label} content`);
      }
    }
  }

  private snapshotPath(turnId: string, relPath: string, role: 'baseline' | 'original' | 'current'): string {
    return path.join(this.snapshotsRoot, turnId, this.hashBytes(Buffer.from(relPath, 'utf8')), `${role}.dir`);
  }

  /** Shell 基线只保存目录存在性；文件内容由独立 file facts 保存，避免递归重复复制。 */
  saveEmptyDirectoryBaseline(turnId: string, relPath: string): { snapshotPath: string; treeHash: string } {
    this.assertSafeTurnId(turnId);
    this.assertWorkspaceRelativePath(relPath, 'directory baseline path');
    const target = this.snapshotPath(turnId, relPath, 'baseline');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (fs.existsSync(target)) return { snapshotPath: target, treeHash: this.hashDirectoryTree(target) };
    fs.mkdirSync(target);
    return { snapshotPath: target, treeHash: this.hashDirectoryTree(target) };
  }

  emptyDirectoryTreeHash(): string {
    return crypto.createHash('sha256').update('D\0.\0').digest('hex');
  }

  private artifactMatches(target: string, isDirectory: boolean, expectedHash: string | undefined): boolean {
    if (!expectedHash || !fs.existsSync(target)) return false;
    const stat = fs.lstatSync(target);
    if (stat.isDirectory() !== isDirectory) return false;
    return isDirectory
      ? this.hashDirectoryTree(target) === expectedHash
      : stat.isFile() && this.hashFile(target) === expectedHash;
  }

  private restoreSwapPaths(checkpoint: TurnCheckpoint, relPath: string): {
    stage: string; backup: string; stageCleanup: string; backupCleanup: string;
  } {
    const identity = this.hashBytes(Buffer.from(relPath, 'utf8'));
    const swapRoot = path.join(this.recoveryRoot, 'undo-staging', checkpoint.turnId);
    return {
      stage: path.join(swapRoot, `${identity}.stage`),
      backup: path.join(swapRoot, `${identity}.backup`),
      stageCleanup: path.join(swapRoot, `${identity}.stage.cleanup`),
      backupCleanup: path.join(swapRoot, `${identity}.backup.cleanup`),
    };
  }

  /** Move a recovery artifact to a deterministic quarantine, then revalidate the moved object before deletion. */
  private cleanupSwapArtifactAtomically(
    source: string,
    quarantine: string,
    expectedKind: 'file' | 'directory',
    expectedHash: string,
  ): void {
    if (fs.existsSync(quarantine)) {
      if (fs.existsSync(source)) throw new CheckpointDriftError('恢复清理同时存在源对象与隔离对象，拒绝删除');
      if (!this.artifactMatches(quarantine, expectedKind === 'directory', expectedHash)) {
        throw new CheckpointDriftError('恢复清理隔离对象身份不匹配，已保留现场');
      }
      fs.rmSync(quarantine, { recursive: true, force: true });
      return;
    }
    if (!fs.existsSync(source)) return;
    fs.renameSync(source, quarantine);
    if (!this.artifactMatches(quarantine, expectedKind === 'directory', expectedHash)) {
      if (!fs.existsSync(source)) fs.renameSync(quarantine, source);
      throw new CheckpointDriftError('恢复清理对象在隔离后身份不匹配，已恢复现场');
    }
    fs.rmSync(quarantine, { recursive: true, force: true });
  }

  private hasPendingRestoreSwap(checkpoint: TurnCheckpoint, relPath: string): boolean {
    const paths = this.restoreSwapPaths(checkpoint, relPath);
    return fs.existsSync(paths.backup) || fs.existsSync(paths.backupCleanup);
  }

  /**
   * 撤销“轮内新建”时先把目标原子移入恢复区，再对被移动对象复核。
   * 这样外部写入无法在哈希检查与删除之间替换目标而被误删。
   */
  private removeCreatedArtifactAtomically(
    checkpoint: TurnCheckpoint,
    relPath: string,
    expectedKind: 'file' | 'directory',
    expectedHash: string,
  ): void {
    const absPath = path.resolve(this.workspaceRoot, relPath);
    const { backup } = this.restoreSwapPaths(checkpoint, relPath);
    fs.mkdirSync(path.dirname(backup), { recursive: true });

    // 崩溃发生在 target→backup 后：只删除仍与轮后身份一致的隔离对象。
    if (fs.existsSync(backup)) {
      if (fs.existsSync(absPath)) {
        throw new CheckpointDriftError('撤销删除存在未决隔离对象且目标已被重建，拒绝继续');
      }
      if (!this.artifactMatches(backup, expectedKind === 'directory', expectedHash)) {
        fs.renameSync(backup, absPath);
        throw new CheckpointDriftError('隔离对象与轮后身份不一致，已恢复现场');
      }
      fs.rmSync(backup, { recursive: true, force: true });
      return;
    }

    if (!fs.existsSync(absPath)) return;
    fs.renameSync(absPath, backup);
    if (!this.artifactMatches(backup, expectedKind === 'directory', expectedHash)) {
      if (!fs.existsSync(absPath)) fs.renameSync(backup, absPath);
      throw new CheckpointDriftError('目标在撤销删除前发生变化，已恢复现场');
    }
    fs.rmSync(backup, { recursive: true, force: true });
  }

  /**
   * 先在恢复区完成并校验副本，再以同卷 rename 交换目标。复制失败不会先
   * 删除/截断用户当前状态；遗留 backup/stage 允许崩溃后的下一次 undo 收敛。
   */
  private restoreArtifactAtomically(
    checkpoint: TurnCheckpoint,
    relPath: string,
    source: string,
    isDirectory: boolean,
    expectedHash: string,
    expectedCurrent: { kind: 'absent' } | { kind: 'file' | 'directory'; hash: string },
  ): void {
    const absPath = path.resolve(this.workspaceRoot, relPath);
    const { stage, backup, stageCleanup, backupCleanup } = this.restoreSwapPaths(checkpoint, relPath);
    const swapRoot = path.dirname(stage);
    fs.mkdirSync(swapRoot, { recursive: true });

    if (fs.existsSync(backupCleanup) && !fs.existsSync(absPath)) {
      throw new CheckpointDriftError('恢复清理隔离对象存在但已恢复目标消失，拒绝继续');
    }

    // 上次已完成交换但尚未来得及持久化 undoAppliedAt。
    if (this.artifactMatches(absPath, isDirectory, expectedHash)) {
      this.cleanupSwapArtifactAtomically(stage, stageCleanup, isDirectory ? 'directory' : 'file', expectedHash);
      if (expectedCurrent.kind === 'absent') {
        if (fs.existsSync(backup) || fs.existsSync(backupCleanup)) {
          throw new CheckpointDriftError('已恢复目标旁存在不应出现的未决备份，拒绝删除');
        }
      } else {
        this.cleanupSwapArtifactAtomically(backup, backupCleanup, expectedCurrent.kind, expectedCurrent.hash);
      }
      return;
    }
    if (fs.existsSync(backupCleanup)) {
      throw new CheckpointDriftError('恢复清理隔离对象存在但目标不是已验证原始状态，拒绝继续');
    }

    // 上次在 target→backup 与 stage→target 之间崩溃：优先完成已校验 stage；
    // stage 不完整则把原目标放回，绝不把半成品暴露为恢复成功。
    if (fs.existsSync(backup) && !fs.existsSync(absPath)) {
      if (expectedCurrent.kind === 'absent'
        || !this.artifactMatches(backup, expectedCurrent.kind === 'directory', expectedCurrent.hash)) {
        fs.renameSync(backup, absPath);
        throw new CheckpointDriftError('未决备份与轮后目标身份不一致，已恢复现场并拒绝继续');
      }
      if (this.artifactMatches(stage, isDirectory, expectedHash)) {
        fs.renameSync(stage, absPath);
        this.cleanupSwapArtifactAtomically(backup, backupCleanup, expectedCurrent.kind, expectedCurrent.hash);
        return;
      }
      if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
      fs.renameSync(backup, absPath);
      throw new Error('检测到未完成的上次恢复；已还原撤销前状态，请重试');
    }
    if (fs.existsSync(backup)) {
      throw new Error(`恢复交换存在未决备份，拒绝覆盖当前目标: ${backup}`);
    }

    if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
    try {
      if (isDirectory) fs.cpSync(source, stage, { recursive: true });
      else {
        fs.mkdirSync(path.dirname(stage), { recursive: true });
        fs.copyFileSync(source, stage);
      }
      if (!this.artifactMatches(stage, isDirectory, expectedHash)) {
        throw new Error('恢复 staging 完整性校验失败');
      }
    } catch (error) {
      if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
      throw error;
    }

    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    const hadTarget = fs.existsSync(absPath);
    const currentChanged = expectedCurrent.kind === 'absent'
      ? hadTarget
      : !hadTarget || !this.artifactMatches(absPath, expectedCurrent.kind === 'directory', expectedCurrent.hash);
    if (currentChanged) {
      fs.rmSync(stage, { recursive: true, force: true });
      throw new CheckpointDriftError('目标在恢复 staging 期间发生变化，拒绝覆盖');
    }
    let originalMoved = false;
    let stageInstalled = false;
    try {
      if (hadTarget) {
        fs.renameSync(absPath, backup);
        originalMoved = true;
        // 以被原子移走的对象为准再次校验，关闭“哈希通过后、rename 前”
        // 的 TOCTOU。校验失败时绝不安装旧快照。
        if (expectedCurrent.kind === 'absent'
          || !this.artifactMatches(backup, expectedCurrent.kind === 'directory', expectedCurrent.hash)) {
          throw new CheckpointDriftError('目标在恢复交换前发生变化，拒绝覆盖');
        }
      }
      if (fs.existsSync(absPath)) {
        throw new CheckpointDriftError('目标在恢复交换期间被重建，拒绝覆盖');
      }
      fs.renameSync(stage, absPath);
      stageInstalled = true;
      if (!this.artifactMatches(absPath, isDirectory, expectedHash)) {
        throw new Error('恢复后的目标完整性校验失败');
      }
    } catch (error) {
      // Remove only the object installed by this attempt. Preserve an object
      // that another actor replaced after installation.
      if (stageInstalled && fs.existsSync(absPath)
        && this.artifactMatches(absPath, isDirectory, expectedHash)) {
        fs.rmSync(absPath, { recursive: true, force: true });
      }
      if (originalMoved && fs.existsSync(backup) && !fs.existsSync(absPath)) fs.renameSync(backup, absPath);
      if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true, force: true });
      throw error;
    }
    if (fs.existsSync(backup)) {
      if (expectedCurrent.kind === 'absent') {
        throw new CheckpointDriftError('恢复完成后备份身份发生变化，拒绝删除');
      }
      this.cleanupSwapArtifactAtomically(backup, backupCleanup, expectedCurrent.kind, expectedCurrent.hash);
    }
  }

  private validateCheckpoint(parsed: unknown, requestedTurnId: string): TurnCheckpoint {
    if (!this.isPlainRecord(parsed)) throw new Error('checkpoint manifest must be an object');
    if (Number(parsed.schemaVersion) !== CHECKPOINT_SCHEMA_VERSION) {
      throw new Error(`checkpoint manifest schema mismatch for ${requestedTurnId}`);
    }
    if (parsed.turnId !== requestedTurnId) throw new Error(`checkpoint manifest turn mismatch for ${requestedTurnId}`);
    if (parsed.artifactBindingVersion !== 1) {
      throw new Error(`checkpoint manifest artifact binding is missing or unsupported for ${requestedTurnId}`);
    }
    this.assertSafeTurnId(requestedTurnId);
    for (const field of ['createdAt', 'updatedAt']) {
      const value = parsed[field];
      if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) {
        throw new Error(`checkpoint manifest ${field} is invalid`);
      }
    }
    if (!this.isPlainRecord(parsed.changes)) throw new Error('checkpoint manifest changes must be an object');
    const changes: Record<string, FileChangeRecord> = Object.create(null);
    for (const [key, raw] of Object.entries(parsed.changes)) {
      if (!this.isPlainRecord(raw)) throw new Error(`checkpoint change ${key} must be an object`);
      const filePath = this.assertWorkspaceRelativePath(raw.filePath, `checkpoint change ${key}.filePath`);
      this.assertNotSensitive(filePath, `checkpoint change ${key}.filePath`);
      if (filePath !== key) throw new Error(`checkpoint change key does not match filePath: ${key}`);
      if (!['create', 'modify', 'delete'].includes(String(raw.action))) throw new Error(`checkpoint change ${key} has invalid action`);
      if (typeof raw.isDirectory !== 'boolean') throw new Error(`checkpoint change ${key} has invalid isDirectory`);
      for (const kindField of ['originalKind', 'newKind']) {
        if (raw[kindField] !== undefined && !['absent', 'file', 'directory'].includes(String(raw[kindField]))) {
          throw new Error(`checkpoint change ${key}.${kindField} is invalid`);
        }
      }
      if (typeof raw.timestamp !== 'string' || !Number.isFinite(Date.parse(raw.timestamp))) {
        throw new Error(`checkpoint change ${key} has invalid timestamp`);
      }
      if (raw.unrecoverable !== undefined && typeof raw.unrecoverable !== 'boolean') {
        throw new Error(`checkpoint change ${key} has invalid unrecoverable flag`);
      }
      for (const hashField of ['originalHash', 'currentStateHash', 'newHash', 'originalTreeHash', 'currentStateTreeHash', 'newTreeHash']) {
        const value = raw[hashField];
        if (value !== undefined && (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))) {
          throw new Error(`checkpoint change ${key}.${hashField} is invalid`);
        }
      }
      if (raw.originalArtifactRole !== undefined && !['original', 'baseline'].includes(String(raw.originalArtifactRole))) {
        throw new Error(`checkpoint change ${key}.originalArtifactRole is invalid`);
      }
      if (raw.originalSnapshotRole !== undefined && !['original', 'baseline'].includes(String(raw.originalSnapshotRole))) {
        throw new Error(`checkpoint change ${key}.originalSnapshotRole is invalid`);
      }
      if (raw.undoAppliedAt !== undefined && (typeof raw.undoAppliedAt !== 'string' || !Number.isFinite(Date.parse(raw.undoAppliedAt)))) {
        throw new Error(`checkpoint change ${key}.undoAppliedAt is invalid`);
      }
      const originalKind = raw.originalKind ?? (raw.action === 'create' ? 'absent' : raw.isDirectory ? 'directory' : 'file');
      const newKind = raw.newKind ?? (raw.action === 'delete' ? 'absent' : raw.isDirectory ? 'directory' : 'file');
      if (originalKind === 'absent' && (raw.originalBlobPath !== undefined || raw.originalHash !== undefined
          || raw.originalSnapshotPath !== undefined || raw.originalTreeHash !== undefined)
        || originalKind === 'directory' && (raw.originalBlobPath !== undefined || raw.originalHash !== undefined)
        || originalKind === 'file' && (raw.originalSnapshotPath !== undefined || raw.originalTreeHash !== undefined)) {
        throw new Error(`checkpoint change ${key} mixes original directory and file artifacts`);
      }
      if (newKind === 'absent' && (raw.newBlobPath !== undefined || raw.newHash !== undefined || raw.newTreeHash !== undefined)
        || newKind === 'directory' && (raw.newBlobPath !== undefined || raw.newHash !== undefined)
        || newKind === 'file' && raw.newTreeHash !== undefined) {
        throw new Error(`checkpoint change ${key} mixes new directory and file artifacts`);
      }
      const bound = true;
      if (raw.originalBlobPath !== undefined) {
        const role = raw.originalArtifactRole === 'baseline' ? 'baseline' : 'original';
        if (bound) this.validateBoundFile(raw.originalBlobPath, raw.originalHash, requestedTurnId, filePath, role, `checkpoint change ${key}.originalBlobPath`);
        else this.validateBlob(raw.originalBlobPath, raw.originalHash, `checkpoint change ${key}.originalBlobPath`);
      }
      if (raw.newBlobPath !== undefined) {
        if (bound) this.validateBoundFile(raw.newBlobPath, raw.newHash, requestedTurnId, filePath, 'new', `checkpoint change ${key}.newBlobPath`);
        else this.validateBlob(raw.newBlobPath, raw.newHash, `checkpoint change ${key}.newBlobPath`);
      }
      if (raw.currentStateBlobPath !== undefined) {
        if (bound) this.validateBoundFile(raw.currentStateBlobPath, raw.currentStateHash, requestedTurnId, filePath, 'current', `checkpoint change ${key}.currentStateBlobPath`);
        else this.validateBlob(raw.currentStateBlobPath, raw.currentStateHash, `checkpoint change ${key}.currentStateBlobPath`);
      }
      for (const snapshotField of ['originalSnapshotPath', 'currentStateSnapshotPath']) {
        if (raw[snapshotField] !== undefined) {
          const snapshotPath = this.assertRecoveryArtifact(raw[snapshotField], this.snapshotsRoot, `checkpoint change ${key}.${snapshotField}`, 'directory');
          this.assertSnapshotNotSensitive(snapshotPath, `checkpoint change ${key}.${snapshotField}`);
          if (bound) {
            const role = snapshotField === 'originalSnapshotPath'
              ? (raw.originalSnapshotRole === 'baseline' ? 'baseline' : 'original')
              : 'current';
            const expectedSnapshotPath = fs.realpathSync(this.snapshotPath(requestedTurnId, filePath, role));
            if (snapshotPath !== expectedSnapshotPath) {
              throw new Error(`checkpoint change ${key}.${snapshotField} is not bound to its turn and file path`);
            }
          }
          const expectedTreeHash = snapshotField === 'originalSnapshotPath' ? raw.originalTreeHash : raw.currentStateTreeHash;
          if (expectedTreeHash !== undefined && this.hashDirectoryTree(snapshotPath) !== expectedTreeHash) {
            throw new Error(`checkpoint change ${key}.${snapshotField} tree SHA-256 mismatch`);
          }
        }
      }
      changes[key] = {
        ...(raw as unknown as FileChangeRecord),
        originalKind: originalKind as FileChangeRecord['originalKind'],
        newKind: newKind as FileChangeRecord['newKind'],
      };
    }
    const unrecoverable = parsed.unrecoverable === undefined ? {} : parsed.unrecoverable;
    if (!this.isPlainRecord(unrecoverable)) throw new Error('checkpoint manifest unrecoverable must be an object');
    const normalizedUnrecoverable: Record<string, UnrecoverableExternalChange> = Object.create(null);
    for (const [key, raw] of Object.entries(unrecoverable)) {
      if (!this.isPlainRecord(raw) || raw.path !== key || typeof raw.reason !== 'string' || raw.reason.length === 0
        || !['created', 'modified', 'deleted', 'renamed', 'outside', 'too_large', 'backup_failed'].includes(String(raw.kind))) {
        throw new Error(`checkpoint unrecoverable entry is invalid: ${key}`);
      }
      if (raw.kind !== 'outside') this.assertWorkspaceRelativePath(raw.path, `checkpoint unrecoverable ${key}.path`);
      this.assertNotSensitive(raw.path, `checkpoint unrecoverable ${key}.path`);
      this.assertNotSensitive(raw.reason, `checkpoint unrecoverable ${key}.reason`);
      normalizedUnrecoverable[key] = raw as unknown as UnrecoverableExternalChange;
    }
    let externalBaseline: PersistedExternalBaseline | undefined;
    if (parsed.externalBaseline !== undefined) {
      const baseline = parsed.externalBaseline;
      if (!this.isPlainRecord(baseline) || baseline.schemaVersion !== 1
        || !['pending', 'awaiting_confirmation', 'complete'].includes(String(baseline.collectionStatus))
        || typeof baseline.frozenAt !== 'string' || !Number.isFinite(Date.parse(baseline.frozenAt))
        || (baseline.collectedAt !== undefined
          && (typeof baseline.collectedAt !== 'string' || !Number.isFinite(Date.parse(baseline.collectedAt))))
        || (baseline.undoConfirmationId !== undefined
          && (typeof baseline.undoConfirmationId !== 'string' || !/^undo-[a-f0-9]{32}$/.test(baseline.undoConfirmationId)))
        || (baseline.collectionStatus === 'awaiting_confirmation') !== (baseline.undoConfirmationId !== undefined)
        || !this.isPlainRecord(baseline.files) || !this.isPlainRecord(baseline.directories)
        || !Array.isArray(baseline.skipped)) {
        throw new Error('checkpoint external baseline is invalid');
      }
      const files: PersistedExternalBaseline['files'] = Object.create(null);
      for (const [relPath, raw] of Object.entries(baseline.files)) {
        if (!this.isPlainRecord(raw) || raw.size === undefined || !Number.isSafeInteger(raw.size) || Number(raw.size) < 0) {
          throw new Error(`checkpoint external baseline file is invalid: ${relPath}`);
        }
        this.assertWorkspaceRelativePath(relPath, 'checkpoint external baseline file path');
        this.assertNotSensitive(relPath, 'checkpoint external baseline file path');
        this.validateBoundFile(raw.blobPath, raw.sha256, requestedTurnId, relPath, 'baseline', 'checkpoint external baseline file');
        files[relPath] = raw as unknown as PersistedExternalBaseline['files'][string];
      }
      const directories: PersistedExternalBaseline['directories'] = Object.create(null);
      for (const [relPath, raw] of Object.entries(baseline.directories)) {
        if (!this.isPlainRecord(raw)) throw new Error(`checkpoint external baseline directory is invalid: ${relPath}`);
        this.assertWorkspaceRelativePath(relPath, 'checkpoint external baseline directory path');
        this.assertNotSensitive(relPath, 'checkpoint external baseline directory path');
        const artifact = this.assertRecoveryArtifact(raw.snapshotPath, this.snapshotsRoot, 'checkpoint external baseline directory', 'directory');
        const expectedPath = fs.realpathSync(this.snapshotPath(requestedTurnId, relPath, 'baseline'));
        if (artifact !== expectedPath || typeof raw.treeHash !== 'string'
          || this.hashDirectoryTree(artifact) !== raw.treeHash) {
          throw new Error(`checkpoint external baseline directory binding is invalid: ${relPath}`);
        }
        this.assertSnapshotNotSensitive(artifact, 'checkpoint external baseline directory');
        directories[relPath] = raw as unknown as PersistedExternalBaseline['directories'][string];
      }
      const skipped = baseline.skipped.map((raw) => {
        if (!this.isPlainRecord(raw) || typeof raw.path !== 'string'
          || !['too_large', 'backup_failed', 'outside'].includes(String(raw.reason))) {
          throw new Error('checkpoint external baseline skipped fact is invalid');
        }
        this.assertWorkspaceRelativePath(raw.path, 'checkpoint external baseline skipped path');
        this.assertNotSensitive(raw.path, 'checkpoint external baseline skipped path');
        return raw as unknown as PersistedExternalBaseline['skipped'][number];
      });
      externalBaseline = {
        ...(baseline as unknown as PersistedExternalBaseline), files, directories, skipped,
      };
    }
    return {
      ...(parsed as unknown as TurnCheckpoint),
      changes,
      unrecoverable: normalizedUnrecoverable,
      ...(externalBaseline ? { externalBaseline } : {}),
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

  /**
   * 返回崩溃时尚未完成轮后收集的 Shell 基线。返回副本，调用方不能修改
   * CheckpointManager 内部状态；清单仍须先通过完整的路径与工件绑定校验。
   */
  getPendingExternalBaseline(turnId: string): PersistedExternalBaseline | undefined {
    const baseline = this.loadCheckpoint(turnId)?.externalBaseline;
    if (!baseline || baseline.collectionStatus !== 'pending') return undefined;
    return {
      ...baseline,
      files: Object.fromEntries(Object.entries(baseline.files).map(([key, value]) => [key, { ...value }])),
      directories: Object.fromEntries(Object.entries(baseline.directories).map(([key, value]) => [key, { ...value }])),
      skipped: baseline.skipped.map((item) => ({ ...item })),
    };
  }

  getExternalUndoConfirmation(turnId: string): string | undefined {
    const baseline = this.loadCheckpoint(turnId)?.externalBaseline;
    return baseline?.collectionStatus === 'awaiting_confirmation' ? baseline.undoConfirmationId : undefined;
  }

  confirmExternalUndo(turnId: string, confirmationId: string): boolean {
    const checkpoint = this.loadCheckpoint(turnId);
    const baseline = checkpoint?.externalBaseline;
    if (!checkpoint || baseline?.collectionStatus !== 'awaiting_confirmation'
      || baseline.undoConfirmationId !== confirmationId) return false;
    // Consume the presented identity before touching user files, but keep the
    // durable state awaiting confirmation with a rotated identity. A crash
    // during undo therefore returns to preview-only behavior after restart.
    baseline.undoConfirmationId = `undo-${crypto.randomBytes(16).toString('hex')}`;
    this.persist(checkpoint);
    this.authorizedExternalUndoTurns.add(turnId);
    return true;
  }

  listPersistedTurns(): string[] {
    if (!fs.existsSync(this.manifestsRoot)) return [];
    return fs
      .readdirSync(this.manifestsRoot)
      .filter((name) => name.endsWith('.json'))
      .map((name) => name.slice(0, -5));
  }

  /** 重新按当前已知秘密集合验证所有持久化 Turn；用于 Provider 密钥轮换后 fail-closed。 */
  revalidatePersistedTurns(): void {
    const turnIds = this.listPersistedTurns();
    this.checkpoints.clear();
    for (const turnId of turnIds) {
      try {
        this.loadCheckpoint(turnId);
      } catch (error) {
        if (error instanceof Error && error.message.includes('A9_CHECKPOINT_SECRET_BLOCKED')) throw error;
        // Existing malformed/legacy Turns remain individually quarantined;
        // only a newly recognized plaintext secret blocks Provider setup.
      }
    }
  }

  private persist(checkpoint: TurnCheckpoint): void {
    checkpoint.updatedAt = new Date().toISOString();
    fs.mkdirSync(this.manifestsRoot, { recursive: true });
    const target = this.manifestPath(checkpoint.turnId);
    const tmp = `${target}.tmp-${process.pid}-${Date.now()}`;
    try {
      const serialized = `${JSON.stringify(checkpoint, null, 2)}\n`;
      // Secret checks happen at every caller-controlled path/content ingress.
      // Scanning the complete structural JSON here creates false positives for
      // short header values that happen to occur in schema labels or generated
      // recovery paths; no workspace file content is embedded in this JSON.
      fs.writeFileSync(tmp, serialized, 'utf8');
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
        artifactBindingVersion: 1,
        changes: Object.create(null),
        unrecoverable: Object.create(null),
      };
      this.checkpoints.set(turnId, checkpoint);
      this.persist(checkpoint);
    }
    if (!checkpoint.unrecoverable) checkpoint.unrecoverable = Object.create(null);
    return checkpoint;
  }

  private hashBytes(content: Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  private hashFile(filePath: string): string {
    const digest = crypto.createHash('sha256');
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.allocUnsafe(64 * 1024);
    try {
      let bytesRead = 0;
      do {
        bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null);
        if (bytesRead > 0) digest.update(buffer.subarray(0, bytesRead));
      } while (bytesRead > 0);
    } finally {
      fs.closeSync(fd);
    }
    return digest.digest('hex');
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
  private snapshotDirectory(
    absDir: string,
    turnId: string,
    relPath: string,
    role: 'original' | 'current',
  ): { path: string; treeHash: string } {
    this.assertSafeTurnId(turnId);
    this.assertNotSensitive(relPath, 'checkpoint directory path');
    const inspect = (absolute: string, relative: string): void => {
      this.assertNotSensitive(relative, 'checkpoint directory entry path');
      const stat = fs.lstatSync(absolute);
      if (stat.isDirectory()) {
        for (const name of fs.readdirSync(absolute)) inspect(path.join(absolute, name), path.join(relative, name));
      } else if (stat.isFile()) {
        this.assertNotSensitive(fs.readFileSync(absolute), 'checkpoint directory file content');
      }
    };
    inspect(absDir, relPath);
    const target = this.snapshotPath(turnId, relPath, role);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (role === 'original' && fs.existsSync(target)) {
      return { path: target, treeHash: this.hashDirectoryTree(target) };
    }
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
    this.assertNotSensitive(targetPath, 'checkpoint mutation path');
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
      // 轮初不存在的对象始终保持 create 语义；后续修改、删除或重命名
      // 不能把它转换成可恢复的轮前对象，否则 undo 会创建错对象。
      if (existing.action === 'create') {
        if (pathExists) {
          existing.isDirectory = pathIsDirectory;
          existing.newKind = pathIsDirectory ? 'directory' : 'file';
        }
        this.persist(checkpoint);
        return existing;
      }
      if (pathExists && pathIsDirectory) {
        if (!existing.originalSnapshotPath && !existing.currentStateSnapshotPath) {
          const snapshot = this.snapshotDirectory(absPath, turnId, targetPath, 'current');
          existing.currentStateSnapshotPath = snapshot.path;
          existing.currentStateTreeHash = snapshot.treeHash;
        }
        existing.isDirectory = true;
      } else if (pathExists) {
        if (!existing.originalBlobPath && !existing.newBlobPath && !existing.currentStateBlobPath) {
          const content = fs.readFileSync(absPath);
          existing.currentStateBlobPath = this.storeBoundFile(content, turnId, targetPath, 'current');
          existing.currentStateHash = this.hashBytes(content);
        }
      }
      this.persist(checkpoint);
      return existing;
    }

    let record: FileChangeRecord;
    if (pathExists) {
      if (pathIsDirectory) {
        const snapshot = this.snapshotDirectory(absPath, turnId, targetPath, 'original');
        record = {
          filePath: targetPath,
          action: 'modify',
          isDirectory: true,
          originalKind: 'directory',
          newKind: 'directory',
          originalSnapshotPath: snapshot.path,
          originalSnapshotRole: 'original',
          originalTreeHash: snapshot.treeHash,
          timestamp: new Date().toISOString(),
        };
      } else {
        const frozenOriginal = this.fileSnapshotPath(turnId, targetPath, 'original');
        const content = fs.existsSync(frozenOriginal)
          ? fs.readFileSync(frozenOriginal)
          : fs.readFileSync(absPath);
        const hash = this.hashBytes(content);
        record = {
          filePath: targetPath,
          action: 'modify',
          isDirectory: false,
          originalKind: 'file',
          newKind: 'file',
          originalHash: hash,
          originalArtifactRole: 'original',
          originalBlobPath: this.storeBoundFile(content, turnId, targetPath, 'original'),
          timestamp: new Date().toISOString(),
        };
      }
    } else {
      record = {
        filePath: targetPath,
        action: 'create',
        isDirectory: false,
        originalKind: 'absent',
        newKind: 'absent',
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
    this.assertNotSensitive(targetPath, 'checkpoint mutation path');
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
      if (existing.action !== 'create') existing.action = 'delete';
      existing.newKind = 'absent';
      existing.newHash = undefined;
      existing.newBlobPath = undefined;
      existing.newTreeHash = undefined;
    } else if (fs.existsSync(absPath) && fs.statSync(absPath).isFile()) {
      const content = fs.readFileSync(absPath);
      existing.newHash = this.hashBytes(content);
      // New content is needed only for Diff. If it contains a known secret,
      // retain the post-state hash for safe undo but never copy plaintext into
      // recovery storage.
      existing.newBlobPath = this.containsSensitiveData(content)
        ? undefined
        : this.storeBoundFile(content, turnId, targetPath, 'new');
      existing.newTreeHash = undefined;
      existing.isDirectory = false;
      existing.newKind = 'file';
    } else if (fs.existsSync(absPath) && fs.statSync(absPath).isDirectory()) {
      existing.newHash = undefined;
      existing.newBlobPath = undefined;
      existing.newTreeHash = this.hashDirectoryTree(absPath);
      existing.isDirectory = true;
      existing.newKind = 'directory';
    } else {
      existing.newHash = undefined;
      existing.newBlobPath = undefined;
      existing.newKind = 'absent';
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
    const authorizedExternalUndo = this.authorizedExternalUndoTurns.has(turnId);
    if (checkpoint.externalBaseline && checkpoint.externalBaseline.collectionStatus !== 'complete' && !authorizedExternalUndo) {
      return { restored: [], errors: ['Shell 轮后状态尚未完成收集或等待显式确认；拒绝把未知当前状态当作该 Turn 的变更自动覆盖'], drifted: [] };
    }
    const outcome: UndoOutcome = { restored: [], errors: [], drifted: [] };
    // 先移除轮内新建的深层对象，再自浅向深恢复目录骨架，最后恢复文件。
    // 这使 Shell file↔directory 替换和空目录变化可确定收敛。
    const depth = (value: string) => value.split(/[\\/]/).length;
    const paths = Object.keys(checkpoint.changes).sort((left, right) => {
      const leftKind = checkpoint.changes[left].originalKind;
      const rightKind = checkpoint.changes[right].originalKind;
      const rank = (kind: FileChangeRecord['originalKind']) => kind === 'absent' ? 0 : kind === 'directory' ? 1 : 2;
      const rankDelta = rank(leftKind) - rank(rightKind);
      if (rankDelta !== 0) return rankDelta;
      return leftKind === 'absent' ? depth(right) - depth(left) : depth(left) - depth(right);
    });
    try {
      for (const relPath of paths) this.undoOne(checkpoint, relPath, outcome);
    } finally {
      if (authorizedExternalUndo) this.authorizedExternalUndoTurns.delete(turnId);
    }
    if (authorizedExternalUndo) {
      if (outcome.errors.length === 0 && outcome.drifted.length === 0 && checkpoint.externalBaseline) {
        checkpoint.externalBaseline.collectionStatus = 'complete';
        checkpoint.externalBaseline.undoConfirmationId = undefined;
        this.persist(checkpoint);
      }
    }
    return outcome;
  }

  /** 按单文件撤销本轮变化。 */
  undoFile(turnId: string, relPath: string): UndoOutcome {
    const checkpoint = this.loadCheckpoint(turnId);
    if (!checkpoint) {
      return { restored: [], errors: [`未找到 Checkpoint: ${turnId}`], drifted: [] };
    }
    const authorizedExternalUndo = this.authorizedExternalUndoTurns.has(turnId);
    if (checkpoint.externalBaseline && checkpoint.externalBaseline.collectionStatus !== 'complete' && !authorizedExternalUndo) {
      return { restored: [], errors: [`Shell 轮后状态尚未完成收集或等待显式确认；拒绝自动撤销 ${relPath}`], drifted: [] };
    }
    if (!checkpoint.changes[relPath]) {
      return { restored: [], errors: [`Checkpoint ${turnId} 中没有 ${relPath} 的记录`], drifted: [] };
    }
    const outcome: UndoOutcome = { restored: [], errors: [], drifted: [] };
    try {
      this.undoOne(checkpoint, relPath, outcome);
    } finally {
      if (authorizedExternalUndo) this.authorizedExternalUndoTurns.delete(turnId);
    }
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
      const originalKind = record.originalKind ?? (record.action === 'create' ? 'absent' : record.isDirectory ? 'directory' : 'file');
      const newKind = record.newKind ?? (record.action === 'delete' ? 'absent' : record.isDirectory ? 'directory' : 'file');
      const newHash = newKind === 'directory' ? record.newTreeHash : newKind === 'file' ? record.newHash : undefined;
      if (originalKind === 'absent') {
        // 新建的文件/目录撤销为删除；漂移（外部改写）时不盲删。
        if (fs.existsSync(absPath)) {
          if (newKind === 'absent') {
            outcome.drifted.push(`${relPath} (轮后应不存在但同路径已被重建)`);
            return;
          }
          const drift = this.describeDrift(absPath, newKind, newHash);
          if (drift) {
            outcome.drifted.push(`${relPath} (${drift})`);
            return;
          }
          if (!newHash) {
            outcome.errors.push(`撤销 ${relPath} 失败: 新建对象缺少轮后完整性哈希`);
            return;
          }
          this.removeCreatedArtifactAtomically(checkpoint, relPath, newKind as 'file' | 'directory', newHash);
        }
        outcome.restored.push(`${relPath} (已移除新建文件)`);
        this.markUndoApplied(checkpoint, record);
        return;
      }

      // F2：无原始内容且标记不可恢复的修改 → 保留当前现场，绝不删除原文件。
      if (record.unrecoverable === true && !record.originalBlobPath && !record.originalSnapshotPath) {
        outcome.errors.push(`撤销 ${relPath} 失败: 该文件的轮前基线未覆盖（超限/读取失败），无法恢复原内容；当前内容已保留`);
        return;
      }

      // modify：恢复原始内容；当前状态与 post-mutation 哈希不一致时视为漂移。
      const originalStateHash = originalKind === 'directory' ? record.originalTreeHash : record.originalHash;
      if (originalStateHash && this.artifactMatches(absPath, originalKind === 'directory', originalStateHash)) {
        const { stage, backup, stageCleanup, backupCleanup } = this.restoreSwapPaths(checkpoint, relPath);
        if (fs.existsSync(backup) || fs.existsSync(backupCleanup)) {
          if (newKind === 'absent' || !newHash) {
            outcome.errors.push(`撤销 ${relPath} 失败: 已恢复目标旁存在身份不明的未决备份`);
            return;
          }
          this.cleanupSwapArtifactAtomically(backup, backupCleanup, newKind as 'file' | 'directory', newHash);
        }
        if (fs.existsSync(stage) || fs.existsSync(stageCleanup)) {
          this.cleanupSwapArtifactAtomically(
            stage, stageCleanup, originalKind as 'file' | 'directory', originalStateHash,
          );
        }
        outcome.restored.push(`${relPath} (检测到此前已完成恢复)`);
        this.markUndoApplied(checkpoint, record);
        return;
      }
      if (!this.hasPendingRestoreSwap(checkpoint, relPath)) {
        const drift = this.describeDrift(absPath, newKind, newHash);
        if (drift) {
          outcome.drifted.push(`${relPath} (${drift})`);
          return;
        }
      }
      if (newKind !== 'absent' && !newHash) {
        outcome.errors.push(`撤销 ${relPath} 失败: 轮后 ${newKind} 缺少完整性哈希`);
        return;
      }
      const expectedCurrent = newKind === 'absent'
        ? { kind: 'absent' as const }
        : { kind: newKind, hash: newHash! };
      if (originalKind === 'directory' && record.originalSnapshotPath) {
        if (!record.originalTreeHash || this.hashDirectoryTree(record.originalSnapshotPath) !== record.originalTreeHash) {
          outcome.errors.push(`撤销修改 ${relPath} 失败: 目录快照缺少或不匹配树哈希`);
          return;
        }
        this.restoreArtifactAtomically(checkpoint, relPath, record.originalSnapshotPath, true, record.originalTreeHash, expectedCurrent);
        outcome.restored.push(`${relPath} (已恢复原始目录)`);
      } else if (originalKind === 'file' && record.originalBlobPath) {
        if (!fs.existsSync(record.originalBlobPath)) {
          outcome.errors.push(`撤销修改 ${relPath} 失败: 原始内容 blob 缺失`);
          return;
        }
        if (!record.originalHash) {
          outcome.errors.push(`撤销修改 ${relPath} 失败: 原始内容缺少 SHA-256`);
          return;
        }
        this.restoreArtifactAtomically(checkpoint, relPath, record.originalBlobPath, false, record.originalHash, expectedCurrent);
        outcome.restored.push(`${relPath} (已恢复原始版本)`);
      } else {
        outcome.errors.push(`撤销 ${relPath} 失败: 轮前 ${originalKind} 恢复工件缺失`);
        return;
      }
      this.markUndoApplied(checkpoint, record);
    } catch (err: any) {
      if (err instanceof CheckpointDriftError) outcome.drifted.push(`${relPath} (${err.message})`);
      else outcome.errors.push(`撤销 ${relPath} 失败: ${err.message}`);
    }
  }

  private markUndoApplied(checkpoint: TurnCheckpoint, record: FileChangeRecord): void {
    record.undoAppliedAt = new Date().toISOString();
    this.persist(checkpoint);
  }

  private describeDrift(
    absPath: string,
    expectedKind: 'absent' | 'file' | 'directory',
    expectedHash: string | undefined,
  ): string | undefined {
    if (!fs.existsSync(absPath)) {
      return expectedKind === 'absent' ? undefined : '路径在变更后消失';
    }
    if (expectedKind === 'absent') return '轮后应不存在但同路径已被重建';
    const stat = fs.lstatSync(absPath);
    if (stat.isDirectory() !== (expectedKind === 'directory')) return '路径类型在变更后被外部替换';
    if (stat.isDirectory()) {
      if (!expectedHash) return '目录缺少轮后树哈希，拒绝自动覆盖';
      return this.hashDirectoryTree(absPath) === expectedHash ? undefined : '目录在变更后被外部修改';
    }
    if (!expectedHash) return '文件缺少轮后 SHA-256，状态不确定，拒绝自动覆盖';
    const current = this.hashFile(absPath);
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
    this.assertNotSensitive(relPath, 'checkpoint external path');
    const checkpoint = this.startTurn(turnId);
    const existing = checkpoint.changes[relPath];
    const record: FileChangeRecord = existing ?? {
      filePath: relPath,
      action: 'create',
      isDirectory: false,
      originalKind: 'absent',
      newKind: 'absent',
      timestamp: new Date().toISOString(),
    };
    if (action === 'created') {
      record.action = 'create';
      record.originalKind = 'absent';
      record.newKind = 'file';
      record.newBlobPath = options.newBlobPath ?? record.newBlobPath;
      record.newHash = options.newHash ?? record.newHash;
    } else if (action === 'modified') {
      const preserveCreate = options.unrecoverable !== true && Boolean(existing)
        && (record.originalKind === 'absent' || record.action === 'create');
      if (!preserveCreate) {
        record.action = 'modify';
        record.originalKind = 'file';
      }
      record.newKind = 'file';
      const baselineEarlier = checkpoint.externalBaseline
        && Date.parse(checkpoint.externalBaseline.frozenAt) <= Date.parse(record.timestamp);
      if (options.originalBlobPath && (!record.originalBlobPath || baselineEarlier)) {
        record.originalBlobPath = options.originalBlobPath;
        record.originalHash = options.originalHash;
        record.originalArtifactRole = 'baseline';
      }
      record.newBlobPath = options.newBlobPath ?? record.newBlobPath;
      record.newHash = options.newHash ?? record.newHash;
    } else {
      const preserveCreate = options.unrecoverable !== true && Boolean(existing)
        && (record.originalKind === 'absent' || record.action === 'create');
      if (!preserveCreate) {
        record.action = 'delete';
        record.originalKind = 'file';
      }
      record.newKind = 'absent';
      const baselineEarlier = checkpoint.externalBaseline
        && Date.parse(checkpoint.externalBaseline.frozenAt) <= Date.parse(record.timestamp);
      if (options.originalBlobPath && (!record.originalBlobPath || baselineEarlier)) {
        record.originalBlobPath = options.originalBlobPath;
        record.originalHash = options.originalHash;
        record.originalArtifactRole = 'baseline';
      }
    }
    if (options.unrecoverable === true) record.unrecoverable = true;
    checkpoint.changes[relPath] = record;
    this.persist(checkpoint);
  }

  /** Persist the complete bounded Shell-entry baseline before execution starts. */
  persistExternalBaseline(turnId: string, baseline: Omit<PersistedExternalBaseline, 'schemaVersion' | 'collectionStatus'>): void {
    const checkpoint = this.startTurn(turnId);
    if (checkpoint.externalBaseline?.collectionStatus === 'complete') {
      throw new Error(`Shell external baseline is already complete for ${turnId}`);
    }
    checkpoint.externalBaseline = {
      schemaVersion: 1,
      collectionStatus: 'pending',
      frozenAt: baseline.frozenAt,
      files: baseline.files,
      directories: baseline.directories,
      skipped: baseline.skipped,
    };
    // Round-trip validation on the next load is not enough: persist must fail
    // before side effects if any artifact binding is malformed.
    this.persist(checkpoint);
    this.checkpoints.delete(turnId);
    this.loadCheckpoint(turnId);
  }

  markExternalBaselineCollected(turnId: string, requireUndoConfirmation = false): string | undefined {
    const checkpoint = this.startTurn(turnId);
    if (!checkpoint.externalBaseline) throw new Error(`Shell external baseline is missing for ${turnId}`);
    checkpoint.externalBaseline.collectionStatus = requireUndoConfirmation ? 'awaiting_confirmation' : 'complete';
    checkpoint.externalBaseline.collectedAt = new Date().toISOString();
    checkpoint.externalBaseline.undoConfirmationId = requireUndoConfirmation
      ? `undo-${crypto.randomBytes(16).toString('hex')}`
      : undefined;
    this.persist(checkpoint);
    return checkpoint.externalBaseline.undoConfirmationId;
  }

  /** 记录 Shell 扫描发现的目录存在性/类型变化；目录内容由子路径事实恢复。 */
  recordExternalDirectoryFact(
    turnId: string,
    relPath: string,
    action: 'created' | 'deleted' | 'present' | 'replaced_by_file',
    options: { originalSnapshotPath?: string; originalTreeHash?: string; emptyTreeHash?: string } = {},
  ): void {
    this.assertNotSensitive(relPath, 'checkpoint external directory path');
    const checkpoint = this.startTurn(turnId);
    const existing = checkpoint.changes[relPath];
    const record: FileChangeRecord = existing ?? {
      filePath: relPath,
      action: action === 'created' ? 'create' : action === 'deleted' ? 'delete' : 'modify',
      isDirectory: true,
      originalKind: action === 'created' ? 'absent' : 'directory',
      newKind: action === 'deleted' ? 'absent' : action === 'replaced_by_file' ? 'file' : 'directory',
      timestamp: new Date().toISOString(),
    };
    if (action !== 'created' && record.originalKind === 'absent' && options.originalSnapshotPath) {
      record.action = 'modify';
      record.originalKind = 'directory';
    }
    if (options.originalSnapshotPath && !record.originalSnapshotPath && !record.originalBlobPath) {
      record.originalSnapshotPath = options.originalSnapshotPath;
      record.originalTreeHash = options.originalTreeHash;
      record.originalSnapshotRole = 'baseline';
    } else if (options.originalSnapshotPath && record.originalSnapshotPath) {
      const baselineEarlier = checkpoint.externalBaseline
        && Date.parse(checkpoint.externalBaseline.frozenAt) <= Date.parse(record.timestamp);
      if (baselineEarlier) {
        record.originalSnapshotPath = options.originalSnapshotPath;
        record.originalTreeHash = options.originalTreeHash;
        record.originalSnapshotRole = 'baseline';
      }
    }
    if (action === 'deleted') {
      record.newKind = 'absent';
      record.newHash = undefined;
      record.newBlobPath = undefined;
      record.newTreeHash = undefined;
    } else if (action !== 'replaced_by_file') {
      record.newKind = 'directory';
      record.newHash = undefined;
      record.newBlobPath = undefined;
      record.newTreeHash = options.emptyTreeHash;
    }
    record.isDirectory = true;
    checkpoint.changes[relPath] = record;
    this.persist(checkpoint);
  }

  /** 显式标记不可恢复的外部变化（不静默遗漏）。 */
  recordUnrecoverableExternal(turnId: string, change: UnrecoverableExternalChange): void {
    this.assertNotSensitive(change.path, 'checkpoint unrecoverable path');
    this.assertNotSensitive(change.reason, 'checkpoint unrecoverable reason');
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
  saveToRecovery(turnId: string, relPath: string, content: Buffer): string {
    return this.storeBoundFile(content, turnId, relPath, 'baseline');
  }
}

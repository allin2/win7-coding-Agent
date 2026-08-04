/**
 * Desktop Alpha 2 trusted single-file write boundary.
 *
 * Model input is an intent only. This module reads the current file, creates
 * the immutable plan/diff/hash bundle, and owns the one-time approval and
 * recovery seams consumed by applyPlan.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import {
  ApplyResult,
  WritePlan,
  WorkspaceError,
} from './types';
import {
  WorkspaceApprovalBinding,
  WorkspaceApprovalPort,
  ApplyPlanOptions,
  buildApplyApprovalRequest,
  applyPlan,
} from './apply';
import { createTextReplacePlan } from './replace';
import { validatePath } from './safety';

export type TrustedWritePlanStatus =
  | 'prepared'
  | 'awaiting_approval'
  | 'approved'
  | 'applying'
  | 'applied'
  | 'rejected'
  | 'expired'
  | 'failed';

export interface TrustedWriteIntent {
  workspaceRoot: string;
  path: string;
  oldText: string;
  newText: string;
  sessionId: string;
  taskId: string;
  turnId: string;
  callId: string;
  /** Model-provided digests are deliberately ignored, never trusted. */
  modelPreviewSha256?: string;
  modelBaselineSha256?: string;
}

export interface TrustedWritePlan {
  schemaVersion: '2.0';
  planId: string;
  status: TrustedWritePlanStatus;
  workspaceRoot: string;
  relativePath: string;
  sessionId: string;
  taskId: string;
  turnId: string;
  callId: string;
  baseSha256: string;
  contentSha256: string;
  previewSha256: string;
  planHash: string;
  encoding: 'utf-8';
  bom: boolean;
  eol: 'lf' | 'crlf' | 'mixed' | 'none';
  anchor: { text: string; line: number };
  preview: NonNullable<WritePlan['operations'][number]['preview']>;
  writePlan: WritePlan;
  beforeContent: Buffer;
  afterContent: Buffer;
  createdAt: string;
  expiresAt: string;
}

export interface TrustedWritePlanPublic {
  schemaVersion: '2.0';
  planId: string;
  status: TrustedWritePlanStatus;
  workspaceRoot: string;
  relativePath: string;
  sessionId: string;
  taskId: string;
  turnId: string;
  callId: string;
  baseSha256: string;
  contentSha256: string;
  previewSha256: string;
  planHash: string;
  encoding: 'utf-8';
  bom: boolean;
  eol: 'lf' | 'crlf' | 'mixed' | 'none';
  anchor: { text: string; line: number };
  preview: TrustedWritePlan['preview'];
  createdAt: string;
  expiresAt: string;
}

export interface TrustedWritePreparerOptions {
  ttlMs?: number;
  maxFileBytes?: number;
  maxPreviewBytes?: number;
  maxPlans?: number;
  now?: () => Date;
}

export interface WriteTransactionCoordinatorOptions {
  /** Existing test seam for deterministic rollback-failure injection. */
  restoreBackup?: ApplyPlanOptions['restoreBackup'];
  /** Existing test seam for deterministic post-replace failure injection. */
  workspace?: ApplyPlanOptions['workspace'];
}

export class TrustedWritePreparer {
  private readonly plans = new Map<string, TrustedWritePlan>();
  private readonly callIndex = new Map<string, string>();
  private readonly ttlMs: number;
  private readonly maxFileBytes: number;
  private readonly maxPreviewBytes: number;
  private readonly maxPlans: number;
  private readonly now: () => Date;

  constructor(options: TrustedWritePreparerOptions = {}) {
    this.ttlMs = options.ttlMs ?? 5 * 60 * 1000;
    this.maxFileBytes = options.maxFileBytes ?? 2 * 1024 * 1024;
    this.maxPreviewBytes = options.maxPreviewBytes ?? 64 * 1024;
    this.maxPlans = options.maxPlans ?? 1;
    this.now = options.now ?? (() => new Date());
    if (![this.ttlMs, this.maxFileBytes, this.maxPreviewBytes, this.maxPlans].every(Number.isInteger)) {
      throw new TypeError('Trusted write limits must be integers');
    }
    if (this.ttlMs <= 0 || this.maxFileBytes <= 0 || this.maxPreviewBytes < 256 || this.maxPlans !== 1) {
      throw new TypeError('A2 allows one positive plan and a bounded preview');
    }
  }

  prepare(intent: TrustedWriteIntent): TrustedWritePlan {
    this.expirePlans();
    this.assertIntent(intent);
    if (this.plans.size >= this.maxPlans) {
      throw new WorkspaceError('WORKSPACE_WRITE_LOCKED', 'Only one active A2 write plan is allowed; resolve the current plan first.');
    }
    const root = path.resolve(intent.workspaceRoot);
    const target = this.resolveTarget(root, intent.path);
    const replacement = createTextReplacePlan(target, intent.oldText, intent.newText, {
      maxFileBytes: this.maxFileBytes,
      maxPreviewBytes: this.maxPreviewBytes,
      createDirectories: false,
    });
    const operation = replacement.plan.operations[0];
    const preview = replacement.preview;
    if (!operation.baseSha256) throw new WorkspaceError('REPLAN_REQUIRED', 'A2 requires an existing file baseline.');
    if (preview.truncated) {
      throw new WorkspaceError('DIFF_TRUNCATED', 'The approval diff is truncated; narrow the edit before approval.');
    }
    if (preview.encoding !== 'utf-8') {
      throw new WorkspaceError('ENCODING_AMBIGUOUS', 'A2 only permits unambiguous UTF-8 text files.');
    }
    const beforeContent = fs.readFileSync(target);
    const afterContent = Buffer.from(operation.content);
    const eol = detectEol(beforeContent);
    if (eol !== detectEol(afterContent)) {
      throw new WorkspaceError('ENCODING_AMBIGUOUS', 'The replacement must preserve the target file EOL style.');
    }
    const createdAt = this.now();
    const expiresAt = new Date(createdAt.getTime() + this.ttlMs);
    const planId = `wpl_${crypto.randomBytes(12).toString('hex')}`;
    const relativePath = path.relative(root, target).split(path.sep).join('/');
    const previewSha256 = sha256(Buffer.from(stableJson(preview), 'utf8'));
    const contentSha256 = sha256(afterContent);
    const planHash = sha256(Buffer.from(stableJson({
      schemaVersion: '2.0', planId, workspaceRoot: root, relativePath,
      sessionId: intent.sessionId, taskId: intent.taskId, turnId: intent.turnId, callId: intent.callId,
      baseSha256: operation.baseSha256, contentSha256, previewSha256,
      encoding: 'utf-8', bom: hasUtf8Bom(beforeContent), eol,
      anchor: { text: intent.oldText, line: replacement.matchLine },
      createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(),
    }), 'utf8'));
    const plan: TrustedWritePlan = {
      schemaVersion: '2.0', planId, status: 'awaiting_approval', workspaceRoot: root, relativePath,
      sessionId: intent.sessionId, taskId: intent.taskId, turnId: intent.turnId, callId: intent.callId,
      baseSha256: operation.baseSha256, contentSha256, previewSha256, planHash,
      encoding: 'utf-8', bom: hasUtf8Bom(beforeContent), eol,
      anchor: { text: intent.oldText, line: replacement.matchLine }, preview,
      writePlan: replacement.plan, beforeContent, afterContent,
      createdAt: createdAt.toISOString(), expiresAt: expiresAt.toISOString(),
    };
    this.plans.set(planId, plan);
    this.callIndex.set(intent.callId, planId);
    return plan;
  }

  get(planId: string): TrustedWritePlan | undefined {
    this.expirePlans();
    return this.plans.get(planId);
  }

  getByCall(callId: string): TrustedWritePlan | undefined {
    const planId = this.callIndex.get(callId);
    return planId ? this.get(planId) : undefined;
  }

  mark(planId: string, status: TrustedWritePlanStatus): TrustedWritePlan {
    const plan = this.get(planId);
    if (!plan) throw new WorkspaceError('REPLAN_REQUIRED', `Write plan is unavailable: ${planId}`);
    plan.status = status;
    return plan;
  }

  remove(planId: string): void {
    const plan = this.plans.get(planId);
    if (plan) this.callIndex.delete(plan.callId);
    this.plans.delete(planId);
  }

  public(plan: TrustedWritePlan): TrustedWritePlanPublic {
    return {
      schemaVersion: plan.schemaVersion, planId: plan.planId, status: plan.status,
      workspaceRoot: plan.workspaceRoot, relativePath: plan.relativePath,
      sessionId: plan.sessionId, taskId: plan.taskId, turnId: plan.turnId, callId: plan.callId,
      baseSha256: plan.baseSha256, contentSha256: plan.contentSha256,
      previewSha256: plan.previewSha256, planHash: plan.planHash,
      encoding: plan.encoding, bom: plan.bom, eol: plan.eol,
      anchor: { ...plan.anchor }, preview: { ...plan.preview },
      createdAt: plan.createdAt, expiresAt: plan.expiresAt,
    };
  }

  private expirePlans(): void {
    const now = this.now().getTime();
    for (const plan of this.plans.values()) {
      if (new Date(plan.expiresAt).getTime() <= now && plan.status !== 'applied') plan.status = 'expired';
    }
  }

  private assertIntent(intent: TrustedWriteIntent): void {
    if (!intent || !intent.workspaceRoot || !intent.path || !intent.oldText || intent.oldText === intent.newText) {
      throw new WorkspaceError('INVALID_TOOL_INPUT', 'A2 requires a non-empty exact replacement intent.');
    }
    if (![intent.sessionId, intent.taskId, intent.turnId, intent.callId].every((value) => typeof value === 'string' && value.length > 0)) {
      throw new WorkspaceError('INVALID_TOOL_INPUT', 'A2 write plans require session/task/turn/call identity.');
    }
  }

  private resolveTarget(root: string, relativePath: string): string {
    if (path.isAbsolute(relativePath)) throw new WorkspaceError('WORKSPACE_BOUNDARY_VIOLATION', 'A2 paths must be workspace-relative.');
    const target = path.resolve(root, relativePath);
    const validation = validatePath(target, root);
    if (!validation.valid) {
      throw new WorkspaceError('WORKSPACE_BOUNDARY_VIOLATION', validation.error ?? 'A2 target escapes the workspace.');
    }
    if (!fs.existsSync(target) || !fs.statSync(target).isFile()) throw new WorkspaceError('PATH_NOT_FILE', `A2 target is not an existing file: ${relativePath}`);
    return target;
  }
}

export interface WriteApprovalBinding extends WorkspaceApprovalBinding {
  planId: string;
  taskId: string;
  turnId: string;
  callId: string;
  planHash: string;
}

interface WriteApprovalRecord extends WriteApprovalBinding {
  requestSha256: string;
  expiresAt: string;
  consumedAt?: string;
}

export class WriteApprovalLedger implements WorkspaceApprovalPort {
  private readonly records = new Map<string, WriteApprovalRecord>();

  issue(input: Omit<WriteApprovalBinding, 'approvalId'> & { request: unknown; ttlMs?: number }): WriteApprovalBinding {
    const ttlMs = input.ttlMs ?? 5 * 60 * 1000;
    if (!Number.isInteger(ttlMs) || ttlMs <= 0) throw new TypeError('Approval TTL must be positive');
    const record: WriteApprovalRecord = {
      approvalId: `apr_${crypto.randomBytes(12).toString('hex')}`,
      planId: input.planId, taskId: input.taskId, turnId: input.turnId, callId: input.callId,
      planHash: input.planHash, sessionId: input.sessionId, subject: input.subject,
      previewSha256: input.previewSha256, baselineSha256: input.baselineSha256,
      requestSha256: sha256(Buffer.from(stableJson(input.request), 'utf8')),
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    };
    this.records.set(record.approvalId, record);
    return publicBinding(record);
  }

  validateAndConsume(binding: WorkspaceApprovalBinding | undefined, request: unknown): { valid: boolean; reason?: string } {
    const candidate = binding as WriteApprovalBinding | undefined;
    if (!candidate) return { valid: false, reason: 'A2 approval binding is required.' };
    const record = this.records.get(candidate.approvalId);
    if (!record) return { valid: false, reason: 'A2 approval was not found.' };
    if (record.consumedAt) return { valid: false, reason: 'A2 approval was already consumed.' };
    if (new Date(record.expiresAt).getTime() <= Date.now()) return { valid: false, reason: 'A2 approval expired.' };
    const mismatches = [
      record.planId === candidate.planId ? undefined : 'planId',
      record.taskId === candidate.taskId ? undefined : 'taskId',
      record.turnId === candidate.turnId ? undefined : 'turnId',
      record.callId === candidate.callId ? undefined : 'callId',
      record.planHash === candidate.planHash ? undefined : 'planHash',
      record.sessionId === candidate.sessionId ? undefined : 'sessionId',
      record.subject === candidate.subject ? undefined : 'subject',
      record.previewSha256 === candidate.previewSha256 ? undefined : 'previewSha256',
      record.baselineSha256 === candidate.baselineSha256 ? undefined : 'baselineSha256',
      record.requestSha256 === sha256(Buffer.from(stableJson(request), 'utf8')) ? undefined : 'request',
    ].filter(Boolean);
    if (mismatches.length > 0) return { valid: false, reason: `A2 approval binding changed: ${mismatches.join(', ')}` };
    record.consumedAt = new Date().toISOString();
    return { valid: true };
  }

  revoke(approvalId: string): void { this.records.delete(approvalId); }
}

export interface RecoveryManifest {
  schemaVersion: '1.0';
  transactionId: string;
  planId: string;
  workspaceRoot: string;
  targetPath: string;
  originalSha256: string;
  targetSha256: string;
  backupPath: string;
  phase: 'prepared' | 'backup_created' | 'replacing' | 'verifying' | 'rollback_failed';
  createdAt: string;
}

export class RecoveryManifestStore {
  private readonly filePath: string;
  constructor(directory: string) {
    if (!directory) throw new TypeError('Recovery directory is required');
    this.filePath = path.join(directory, 'a2-write-recovery.json');
  }
  get path(): string { return this.filePath; }
  load(): RecoveryManifest | undefined {
    try { return JSON.parse(fs.readFileSync(this.filePath, 'utf8')) as RecoveryManifest; } catch { return undefined; }
  }
  save(manifest: RecoveryManifest): void {
    fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
    fs.writeFileSync(this.filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  }
  clear(): void { try { if (fs.existsSync(this.filePath)) fs.unlinkSync(this.filePath); } catch { /* keep evidence when cleanup fails */ } }
}

export class WriteTransactionCoordinator {
  readonly approvals = new WriteApprovalLedger();
  readonly recovery: RecoveryManifestStore;
  private locked = false;

  constructor(
    private readonly workspaceRoot: string,
    recoveryDirectory: string,
    private readonly options: WriteTransactionCoordinatorOptions = {},
  ) {
    this.recovery = new RecoveryManifestStore(recoveryDirectory);
  }

  isLocked(): boolean { return this.locked; }

  issueApproval(plan: TrustedWritePlan, identity: Omit<WriteApprovalBinding, 'approvalId'>): WriteApprovalBinding {
    if (this.locked) throw new WorkspaceError('WORKSPACE_WRITE_LOCKED', 'Workspace write is locked after a rollback failure.');
    if (plan.status !== 'awaiting_approval' && plan.status !== 'prepared') throw new WorkspaceError('APPROVAL_INVALID', 'Only a pending A2 plan can be approved.');
    return this.approvals.issue({ ...identity, request: buildApplyApprovalRequest(plan.writePlan, this.workspaceRoot) });
  }

  apply(plan: TrustedWritePlan, binding: WriteApprovalBinding): ApplyResult {
    if (this.locked) throw new WorkspaceError('WORKSPACE_WRITE_LOCKED', 'Workspace write is locked after a rollback failure.');
    if (plan.status !== 'awaiting_approval' && plan.status !== 'approved') throw new WorkspaceError('REPLAN_REQUIRED', 'A2 plan is not pending application.');
    const operation = plan.writePlan.operations[0];
    this.recovery.save({
      schemaVersion: '1.0', transactionId: `txn_${crypto.randomBytes(10).toString('hex')}`,
      planId: plan.planId, workspaceRoot: this.workspaceRoot, targetPath: operation.path,
      originalSha256: plan.baseSha256, targetSha256: plan.contentSha256,
      backupPath: operation.path + '.bak', phase: 'prepared', createdAt: new Date().toISOString(),
    });
    plan.status = 'applying';
    const result = applyPlan(plan.writePlan, {
      workspaceRoot: this.workspaceRoot,
      approval: binding,
      approvalLedger: this.approvals,
      ...(this.options.workspace ? { workspace: this.options.workspace } : {}),
      ...(this.options.restoreBackup ? { restoreBackup: this.options.restoreBackup } : {}),
    });
    if (result.success) {
      plan.status = 'applied';
      this.recovery.clear();
    } else if (result.rollbackStatus === 'failed') {
      plan.status = 'failed';
      this.locked = true;
      const pending = this.recovery.load();
      if (pending) this.recovery.save({ ...pending, phase: 'rollback_failed' });
    } else {
      plan.status = 'failed';
      this.recovery.clear();
    }
    return result;
  }

  getPendingRecovery(): RecoveryManifest | undefined { return this.recovery.load(); }

  restorePending(): { restored: boolean; detail: string } {
    const pending = this.recovery.load();
    if (!pending) return { restored: false, detail: 'No pending A2 recovery transaction.' };
    try {
      if (!fs.existsSync(pending.backupPath)) throw new Error('Backup file is missing.');
      fs.copyFileSync(pending.backupPath, pending.targetPath);
      if (sha256(fs.readFileSync(pending.targetPath)) !== pending.originalSha256) throw new Error('Restored hash does not match the original hash.');
      fs.unlinkSync(pending.backupPath);
      this.recovery.clear();
      this.locked = false;
      return { restored: true, detail: 'Original file restored and the write lock was cleared.' };
    } catch (error) {
      this.locked = true;
      return { restored: false, detail: error instanceof Error ? error.message : String(error) };
    }
  }
}

function publicBinding(record: WriteApprovalRecord): WriteApprovalBinding {
  return {
    approvalId: record.approvalId, planId: record.planId, taskId: record.taskId,
    turnId: record.turnId, callId: record.callId, planHash: record.planHash,
    sessionId: record.sessionId, subject: record.subject,
    previewSha256: record.previewSha256, baselineSha256: record.baselineSha256,
  };
}

function detectEol(content: Buffer): 'lf' | 'crlf' | 'mixed' | 'none' {
  const text = content.subarray(hasUtf8Bom(content) ? 3 : 0).toString('utf8');
  const crlf = (text.match(/\r\n/g) ?? []).length;
  const lf = (text.replace(/\r\n/g, '').match(/\n/g) ?? []).length;
  const cr = (text.replace(/\r\n/g, '').match(/\r/g) ?? []).length;
  const styles = Number(crlf > 0) + Number(lf > 0) + Number(cr > 0);
  if (styles === 0) return 'none';
  if (styles > 1) return 'mixed';
  return crlf > 0 ? 'crlf' : 'lf';
}

function hasUtf8Bom(content: Buffer): boolean {
  return content.length >= 3 && content[0] === 0xef && content[1] === 0xbb && content[2] === 0xbf;
}

function sha256(value: Buffer): string { return crypto.createHash('sha256').update(value).digest('hex'); }

function stableJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
}

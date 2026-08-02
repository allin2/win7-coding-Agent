/**
 * @module runner/approval
 * @description 三档审批逻辑（ADR-0030）
 * @remarks
 * - READ_ONLY: 始终批准（只读操作无需审批）
 * - WORKSPACE_WRITE: 需显式审批（工作区写操作）
 * - 外部传入 full_access: 始终拒绝（ADR-0030 明令不做）
 */

import * as crypto from 'crypto';
import { ApprovalExecutionBinding, RunRequest } from './types';

/**
 * ApprovalLevel — 本地镜像类型（与 @win7-agent/core 保持兼容）
 * @remarks 避免跨模块编译依赖，值语义与 core/types.ts 完全一致
 */
export enum ApprovalLevel {
  READ_ONLY = 'read_only',
  WORKSPACE_WRITE = 'workspace_write',
}

/**
 * 审批检查结果
 */
export interface ApprovalResult {
  /** 是否批准执行 */
  approved: boolean;
  /** 拒绝或批准原因说明 */
  reason?: string;
}

export interface ApprovalGrant {
  sessionId: string;
  subject: string;
  request: unknown;
  previewSha256: string;
  baselineSha256: string;
  ttlMs?: number;
}

export interface ApprovalRecord {
  schemaVersion: '1.0';
  approvalId: string;
  sessionId: string;
  subject: string;
  requestSha256: string;
  previewSha256: string;
  baselineSha256: string;
  issuedAt: string;
  expiresAt: string;
  consumedAt?: string;
}

export interface ApprovalValidation {
  valid: boolean;
  code?: 'APPROVAL_REQUIRED' | 'APPROVAL_INVALID' | 'APPROVAL_REPLAYED';
  reason?: string;
  record?: ApprovalRecord;
}

/**
 * Execution-boundary approval ledger. Persistence belongs to the State
 * adapter; this class freezes request/baseline semantics and one-time use.
 */
export class ApprovalLedger {
  private readonly records = new Map<string, ApprovalRecord>();

  issue(grant: ApprovalGrant): ApprovalRecord {
    if (!grant.sessionId || !grant.subject) {
      throw new Error('Approval requires sessionId and subject');
    }
    assertSha256(grant.previewSha256, 'previewSha256');
    assertSha256(grant.baselineSha256, 'baselineSha256');
    const ttlMs = grant.ttlMs ?? 5 * 60 * 1000;
    if (!Number.isInteger(ttlMs) || ttlMs <= 0) {
      throw new Error('Approval ttlMs must be a positive integer');
    }
    const issuedAtMs = Date.now();
    const record: ApprovalRecord = {
      schemaVersion: '1.0',
      approvalId: `apr_${crypto.randomBytes(16).toString('hex')}`,
      sessionId: grant.sessionId,
      subject: grant.subject,
      requestSha256: fingerprintApprovalRequest(grant.request),
      previewSha256: grant.previewSha256.toLowerCase(),
      baselineSha256: grant.baselineSha256.toLowerCase(),
      issuedAt: new Date(issuedAtMs).toISOString(),
      expiresAt: new Date(issuedAtMs + ttlMs).toISOString(),
    };
    this.records.set(record.approvalId, record);
    return { ...record };
  }

  validateAndConsume(
    binding: ApprovalExecutionBinding | undefined,
    request: unknown,
    nowMs: number = Date.now(),
  ): ApprovalValidation {
    if (!binding) {
      return {
        valid: false,
        code: 'APPROVAL_REQUIRED',
        reason: 'Workspace write requires an exact approval binding',
      };
    }
    const record = this.records.get(binding.approvalId);
    if (!record) {
      return {
        valid: false,
        code: 'APPROVAL_INVALID',
        reason: `Approval not found: ${binding.approvalId}`,
      };
    }
    if (record.consumedAt) {
      return {
        valid: false,
        code: 'APPROVAL_REPLAYED',
        reason: `Approval was already consumed at ${record.consumedAt}`,
      };
    }
    if (new Date(record.expiresAt).getTime() <= nowMs) {
      return {
        valid: false,
        code: 'APPROVAL_INVALID',
        reason: 'Approval has expired',
      };
    }
    const requestSha256 = fingerprintApprovalRequest(request);
    const mismatches = [
      record.sessionId === binding.sessionId ? undefined : 'sessionId',
      record.subject === binding.subject ? undefined : 'subject',
      record.requestSha256 === requestSha256 ? undefined : 'request',
      record.previewSha256 === binding.previewSha256.toLowerCase() ? undefined : 'preview',
      record.baselineSha256 === binding.baselineSha256.toLowerCase() ? undefined : 'baseline',
    ].filter((value): value is string => value !== undefined);
    if (mismatches.length > 0) {
      return {
        valid: false,
        code: 'APPROVAL_INVALID',
        reason: `Approval binding changed: ${mismatches.join(', ')}`,
      };
    }

    record.consumedAt = new Date(nowMs).toISOString();
    return { valid: true, record: { ...record } };
  }

  get(approvalId: string): ApprovalRecord | undefined {
    const record = this.records.get(approvalId);
    return record ? { ...record } : undefined;
  }
}

export function buildRunApprovalRequest(request: RunRequest): unknown {
  return {
    command: request.command,
    args: request.args,
    workDir: request.config.workDir,
    envOverlay: request.config.envOverlay ?? {},
    timeoutMs: request.config.timeoutMs,
    idleTimeoutMs: request.config.idleTimeoutMs,
    maxStdoutBytes: request.config.maxStdoutBytes,
    maxStderrBytes: request.config.maxStderrBytes,
    stdinPolicy: request.config.stdinPolicy,
    approvalLevel: request.approvalLevel,
  };
}

export function fingerprintApprovalRequest(request: unknown): string {
  return crypto
    .createHash('sha256')
    .update(canonicalJson(request), 'utf8')
    .digest('hex');
}

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') {
    return JSON.stringify(value);
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('Approval request contains a non-finite number');
    }
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`)
      .join(',')}}`;
  }
  throw new Error(`Approval request contains unsupported value: ${typeof value}`);
}

function assertSha256(value: string, field: string): void {
  if (!/^[a-f0-9]{64}$/i.test(value)) {
    throw new Error(`${field} must be a SHA-256 hex digest`);
  }
}

/**
 * 检查操作是否获得审批
 * @param level - 当前会话的审批级别（已获授权的最高级别）
 * @param requestedLevel - 本次请求的操作所需的审批级别
 * @returns 审批结果
 *
 * @example
 * ```typescript
 * // 只读操作始终批准
 * checkApproval(ApprovalLevel.READ_ONLY, ApprovalLevel.READ_ONLY);
 * // => { approved: true, reason: 'Read-only operations are always approved' }
 *
 * // 写操作需显式审批
 * checkApproval(ApprovalLevel.WORKSPACE_WRITE, ApprovalLevel.WORKSPACE_WRITE);
 * // => { approved: true, reason: 'Workspace write approved' }
 *
 * // 完全访问始终拒绝
 * checkApproval('full_access', 'full_access');
 * // => { approved: false, reason: 'FULL_ACCESS is prohibited by ADR-0030' }
 * ```
 */
export function checkApproval(
  level: ApprovalLevel | string,
  requestedLevel: ApprovalLevel | string
): ApprovalResult {
  // FULL_ACCESS 始终拒绝（ADR-0030 明令不做）
  if (requestedLevel === 'full_access') {
    return {
      approved: false,
      reason: 'FULL_ACCESS is prohibited by ADR-0030 — unrestricted operations are not supported',
    };
  }

  // 如果当前会话级别为 FULL_ACCESS，也拒绝（防止越权）
  if (level === 'full_access') {
    return {
      approved: false,
      reason: 'Session has FULL_ACCESS level which is prohibited by ADR-0030',
    };
  }

  // READ_ONLY: 只读操作始终批准
  if (requestedLevel === ApprovalLevel.READ_ONLY) {
    return {
      approved: true,
      reason: 'Read-only operations are always approved',
    };
  }

  // WORKSPACE_WRITE: 需显式审批
  if (requestedLevel === ApprovalLevel.WORKSPACE_WRITE) {
    // 当前会话级别必须至少为 WORKSPACE_WRITE 才能批准
    if (level === ApprovalLevel.WORKSPACE_WRITE) {
      return {
        approved: true,
        reason: 'Workspace write operation approved with explicit authorization',
      };
    }
    // 当前级别为 READ_ONLY 时，写操作被拒绝
    return {
      approved: false,
      reason: 'Workspace write requires explicit approval — current session level is READ_ONLY',
    };
  }

  // 未知级别，fail-closed
  return {
    approved: false,
    reason: `Unknown approval level: "${requestedLevel}" — denied by fail-closed policy`,
  };
}

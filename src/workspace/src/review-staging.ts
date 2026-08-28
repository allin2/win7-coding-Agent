/**
 * A8-03 multi-file private staging and Review boundary.
 *
 * The model may propose bytes, but this module is the authority for the
 * workspace baseline, deterministic ReviewSet hashes, per-file decisions,
 * approval binding, encoding/EOL metadata, secret blocking and all-or-nothing
 * application.  No method that prepares or reviews a proposal writes the
 * user's workspace.
 */

import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { decodeBuffer, detectEncoding } from './encoding';
import { validatePath } from './safety';
import { WorkspaceError } from './types';

export type ReviewOperation = 'CREATE' | 'MODIFY' | 'DELETE';
export type ReviewDecision = 'PENDING' | 'ACCEPTED' | 'REJECTED';
export type ReviewStatus =
  | 'DRAFT'
  | 'READY'
  | 'STALE'
  | 'APPLYING'
  | 'APPLIED'
  | 'REJECTED'
  | 'FAILED'
  | 'RECOVERY_REQUIRED';
export type ReviewEncoding = 'utf-8' | 'gbk' | 'utf-16le' | 'binary';
export type ReviewEol = 'lf' | 'crlf' | 'cr' | 'mixed' | 'none';
export type ValidationStatus = 'PASS' | 'FAIL' | 'CANCELLED' | 'NOT_RUN';

export interface ReviewDiffV1 {
  schemaVersion: 1;
  encoding: ReviewEncoding;
  beforeSha256: string | null;
  afterSha256: string | null;
  startLine: number;
  removedLineCount: number;
  addedLineCount: number;
  unifiedDiff: string;
  truncated: boolean;
  diffSha256: string;
}

export interface ReviewFileItemV1 {
  schemaVersion: 1;
  relativePath: string;
  comparisonKey: string;
  operation: ReviewOperation;
  beforeExists: boolean;
  afterExists: boolean;
  beforeBytes: number;
  afterBytes: number;
  beforeSha256: string | null;
  afterSha256: string | null;
  beforeEncoding: ReviewEncoding;
  afterEncoding: ReviewEncoding;
  beforeBom: boolean;
  afterBom: boolean;
  beforeEol: ReviewEol;
  afterEol: ReviewEol;
  diff: ReviewDiffV1;
  /** SHA-256 references into the private content-addressed staging area. */
  beforeBlobRef: string | null;
  afterBlobRef: string | null;
  decision: ReviewDecision;
  decisionEventId?: string;
  writable: boolean;
}

export interface ReviewValidationRunV1 {
  schemaVersion: 1;
  validationId: string;
  reviewId: string;
  revision: number;
  /** Full proposal snapshot used when the validation run started. */
  previewHash: string;
  validatedSetHash: string;
  acceptedSetHash: string;
  profileId: string | null;
  argvDigestSha256: string | null;
  status: ValidationStatus;
  complete: boolean;
  outputTruncated: boolean;
  summary: string;
  source: string;
  trustedAdapter: boolean;
  applicablePaths: string[];
  startedAt: string;
  completedAt: string;
  createdAt: string;
  stale: boolean;
  staleReason?: string;
}

export interface ReviewSetV1 {
  schemaVersion: 1;
  reviewId: string;
  revision: number;
  workspaceId: string;
  sessionId: string;
  taskId: string;
  status: ReviewStatus;
  workspaceBaseHash: string;
  previewHash: string;
  acceptedSetHash: string;
  files: ReviewFileItemV1[];
  validationRuns: ReviewValidationRunV1[];
  unverifiedItems: string[];
  createdAt: string;
  updatedAt: string;
  lastEventSeq: number;
  appliedAt?: string;
}

export interface ReviewProposal {
  /** Workspace-relative path; slash and backslash are accepted as separators. */
  relativePath: string;
  operation: ReviewOperation;
  /** Required for CREATE/MODIFY. DELETE deliberately has no after bytes. */
  afterContent?: Buffer;
}

export interface ReviewStagingOptions {
  workspaceRoot: string;
  workspaceId: string;
  sessionId: string;
  taskId: string;
  proposals: readonly ReviewProposal[];
  stagingRoot: string;
  knownSecrets?: readonly string[];
  now?: () => Date;
  idFactory?: (kind: string) => string;
  maxDiffBytes?: number;
  maxFileBytes?: number;
  failureInjector?: (phase: ReviewApplyPhase, item?: ReviewFileItemV1) => void;
}

/** Restore a hash-only Review projection after a process restart.  The
 * private staging root is the source of proposal bytes; the SQLite catalog
 * supplies only this bounded, non-content ReviewSet projection. */
export interface ReviewStagingRestoreOptions {
  workspaceRoot: string;
  sessionId: string;
  taskId: string;
  stagingRoot: string;
  review: ReviewSetV1;
  knownSecrets?: readonly string[];
  now?: () => Date;
  idFactory?: (kind: string) => string;
  maxDiffBytes?: number;
  maxFileBytes?: number;
  failureInjector?: (phase: ReviewApplyPhase, item?: ReviewFileItemV1) => void;
}

export type ReviewApplyPhase = 'preflight' | 'backup' | 'write' | 'verify' | 'rollback';

export interface ReviewApprovalBindingV1 {
  approvalId: string;
  sessionId: string;
  taskId: string;
  reviewId: string;
  revision: number;
  workspaceBaseHash: string;
  previewHash: string;
  acceptedSetHash: string;
  subject: string;
  expiresAt: string;
}

export interface ReviewApplyOperationResult {
  relativePath: string;
  operation: ReviewOperation;
  success: boolean;
  error?: string;
}

export interface ReviewApplyResult {
  success: boolean;
  status: ReviewStatus;
  zeroWrites: boolean;
  operations: ReviewApplyOperationResult[];
  rolledBack: boolean;
  rollbackStatus: 'not_required' | 'completed' | 'failed';
  rollbackErrors: string[];
  recoveryRequired: boolean;
  approvalConsumed: boolean;
}

interface ReviewApplyRequest {
  schemaVersion: 1;
  sessionId: string;
  taskId: string;
  reviewId: string;
  revision: number;
  workspaceRoot: string;
  workspaceBaseHash: string;
  previewHash: string;
  acceptedSetHash: string;
  accepted: Array<{
    relativePath: string;
    operation: ReviewOperation;
    beforeSha256: string | null;
    afterSha256: string | null;
    diffSha256: string;
  }>;
}

interface RecoveryFileRecord {
  relativePath: string;
  targetPath: string;
  beforeExists: boolean;
  beforeSha256: string | null;
  backupPath: string | null;
}

interface RecoveryManifestV1 {
  schemaVersion: 1;
  reviewId: string;
  transactionId: string;
  workspaceRoot: string;
  files: RecoveryFileRecord[];
  createdAt: string;
}

/** Deterministic object serialization used by every A8-03 hash. */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
    .join(',')}}`;
}

export function sha256(value: Buffer | string | unknown): string {
  const input = Buffer.isBuffer(value)
    ? value
    : typeof value === 'string'
      ? Buffer.from(value, 'utf8')
      : Buffer.from(canonicalJson(value), 'utf8');
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** Private, content-addressed bytes. Values never appear in public ReviewSet DTOs. */
export class ContentAddressedBlobStore {
  private readonly root: string;
  private readonly knownSecrets: readonly string[];

  constructor(root: string, knownSecrets: readonly string[] = []) {
    if (!root || typeof root !== 'string') throw new TypeError('A8-03 stagingRoot is required');
    this.root = path.resolve(root);
    this.knownSecrets = knownSecrets.filter((value) => typeof value === 'string' && value.length > 0);
    fs.mkdirSync(this.root, { recursive: true });
  }

  put(content: Buffer): string {
    assertNoSensitiveBytes(content, this.knownSecrets);
    const digest = sha256(content);
    const directory = path.join(this.root, digest.slice(0, 2));
    const filePath = path.join(directory, digest);
    fs.mkdirSync(directory, { recursive: true });
    if (!fs.existsSync(filePath)) {
      const tempPath = `${filePath}.tmp-${crypto.randomBytes(6).toString('hex')}`;
      try {
        fs.writeFileSync(tempPath, content, { flag: 'wx' });
        fs.renameSync(tempPath, filePath);
      } catch (error) {
        try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* preserve primary error */ }
        if (!fs.existsSync(filePath)) throw error;
      }
    }
    return digest;
  }

  get(reference: string): Buffer {
    if (!/^[a-f0-9]{64}$/.test(reference)) throw new WorkspaceError('REVIEW_INVALID', 'Invalid private blob reference.');
    const filePath = path.join(this.root, reference.slice(0, 2), reference);
    if (!fs.existsSync(filePath)) throw new WorkspaceError('REVIEW_INVALID', `Private blob is missing: ${reference}`);
    const content = fs.readFileSync(filePath);
    if (sha256(content) !== reference) throw new WorkspaceError('REVIEW_INVALID', `Private blob hash mismatch: ${reference}`);
    return content;
  }

  has(reference: string): boolean {
    if (!/^[a-f0-9]{64}$/.test(reference)) return false;
    const filePath = path.join(this.root, reference.slice(0, 2), reference);
    if (!fs.existsSync(filePath)) return false;
    try { return sha256(fs.readFileSync(filePath)) === reference; } catch { return false; }
  }
}

/** One-time, exact approval ledger for a multi-file accepted subset. */
export class ReviewApprovalLedger {
  private readonly records = new Map<string, { binding: ReviewApprovalBindingV1; requestHash: string; consumed: boolean }>();

  issue(input: Omit<ReviewApprovalBindingV1, 'approvalId' | 'expiresAt'> & { request: ReviewApplyRequest; ttlMs?: number }): ReviewApprovalBindingV1 {
    const ttlMs = input.ttlMs ?? 5 * 60 * 1000;
    if (!Number.isInteger(ttlMs) || ttlMs <= 0) throw new TypeError('Review approval TTL must be positive');
    const binding: ReviewApprovalBindingV1 = {
      approvalId: `a8r-apr-${crypto.randomBytes(12).toString('hex')}`,
      sessionId: input.sessionId,
      taskId: input.taskId,
      reviewId: input.reviewId,
      revision: input.revision,
      workspaceBaseHash: input.workspaceBaseHash,
      previewHash: input.previewHash,
      acceptedSetHash: input.acceptedSetHash,
      subject: input.subject,
      expiresAt: new Date(Date.now() + ttlMs).toISOString(),
    };
    this.records.set(binding.approvalId, {
      binding,
      requestHash: sha256(input.request),
      consumed: false,
    });
    return { ...binding };
  }

  validate(binding: ReviewApprovalBindingV1 | undefined, request: ReviewApplyRequest): { valid: boolean; reason?: string } {
    if (!binding) return { valid: false, reason: 'A8-03 approval is required.' };
    const record = this.records.get(binding.approvalId);
    if (!record) return { valid: false, reason: 'A8-03 approval was not found.' };
    if (record.consumed) return { valid: false, reason: 'A8-03 approval was already consumed.' };
    if (Date.parse(record.binding.expiresAt) <= Date.now()) return { valid: false, reason: 'A8-03 approval expired.' };
    const expected = record.binding;
    const mismatches = [
      expected.sessionId === binding.sessionId ? undefined : 'sessionId',
      expected.taskId === binding.taskId ? undefined : 'taskId',
      expected.reviewId === binding.reviewId ? undefined : 'reviewId',
      expected.revision === binding.revision ? undefined : 'revision',
      expected.workspaceBaseHash === binding.workspaceBaseHash ? undefined : 'workspaceBaseHash',
      expected.previewHash === binding.previewHash ? undefined : 'previewHash',
      expected.acceptedSetHash === binding.acceptedSetHash ? undefined : 'acceptedSetHash',
      expected.subject === binding.subject ? undefined : 'subject',
      expected.expiresAt === binding.expiresAt ? undefined : 'expiresAt',
      record.requestHash === sha256(request) ? undefined : 'request',
    ].filter((item): item is string => Boolean(item));
    return mismatches.length === 0
      ? { valid: true }
      : { valid: false, reason: `A8-03 approval binding changed: ${mismatches.join(', ')}` };
  }

  consume(binding: ReviewApprovalBindingV1 | undefined, request: ReviewApplyRequest): { valid: boolean; reason?: string } {
    const validation = this.validate(binding, request);
    if (!validation.valid || !binding) return validation;
    const record = this.records.get(binding.approvalId);
    if (!record) return { valid: false, reason: 'A8-03 approval was not found.' };
    record.consumed = true;
    return { valid: true };
  }

  revoke(approvalId: string): void { this.records.delete(approvalId); }
  revokeAll(): void { this.records.clear(); }
}

/** In-memory owner of a ReviewSet and its private staging/transaction data. */
export class ReviewStagingSession {
  readonly approvals = new ReviewApprovalLedger();
  readonly blobs: ContentAddressedBlobStore;
  private readonly workspaceRoot: string;
  private readonly stagingRoot: string;
  private readonly knownSecrets: readonly string[];
  private readonly now: () => Date;
  private readonly idFactory: (kind: string) => string;
  private readonly maxDiffBytes: number;
  private readonly maxFileBytes: number;
  private readonly failureInjector?: (phase: ReviewApplyPhase, item?: ReviewFileItemV1) => void;
  private state: ReviewSetV1;
  private locked = false;
  private recoveryPath: string;

  constructor(options: ReviewStagingOptions) {
    assertNonEmpty(options.workspaceRoot, 'workspaceRoot');
    assertNonEmpty(options.workspaceId, 'workspaceId');
    assertNonEmpty(options.sessionId, 'sessionId');
    assertNonEmpty(options.taskId, 'taskId');
    if (!Array.isArray(options.proposals) || options.proposals.length === 0) {
      throw new WorkspaceError('REVIEW_INVALID', 'A8-03 requires at least one proposed file.');
    }
    if (!fs.existsSync(options.workspaceRoot) || !fs.statSync(options.workspaceRoot).isDirectory()) {
      throw new WorkspaceError('WORKSPACE_ROOT_INVALID', 'A8-03 workspaceRoot must be an existing directory.');
    }
    this.workspaceRoot = path.resolve(options.workspaceRoot);
    this.stagingRoot = path.resolve(options.stagingRoot);
    this.knownSecrets = (options.knownSecrets ?? []).filter((value) => typeof value === 'string' && value.length > 0);
    this.now = options.now ?? (() => new Date());
    this.idFactory = options.idFactory ?? ((kind) => `a8r-${kind}-${crypto.randomBytes(12).toString('hex')}`);
    this.maxDiffBytes = options.maxDiffBytes ?? 64 * 1024;
    this.maxFileBytes = options.maxFileBytes ?? 2 * 1024 * 1024;
    this.failureInjector = options.failureInjector;
    if (!Number.isInteger(this.maxDiffBytes) || this.maxDiffBytes < 256) throw new TypeError('maxDiffBytes must be at least 256');
    if (!Number.isInteger(this.maxFileBytes) || this.maxFileBytes <= 0) throw new TypeError('maxFileBytes must be positive');
    this.recoveryPath = path.join(this.stagingRoot, 'recovery.v1.json');
    const hadRecoveryManifest = fs.existsSync(this.recoveryPath);
    this.blobs = new ContentAddressedBlobStore(path.join(this.stagingRoot, 'blobs'), this.knownSecrets);
    try {
      this.state = this.createInitialReview(options);
    } catch (error) {
      // A rejected secret/path/binary proposal must not leave earlier blobs in
      // the private staging root. A pre-existing recovery root is retained so
      // the recovery contract remains auditable and restorable.
      if (!hadRecoveryManifest) removeDirectory(this.stagingRoot);
      throw error;
    }
    if (hadRecoveryManifest) {
      this.locked = true;
      this.state.status = 'RECOVERY_REQUIRED';
    }
  }

  static restore(options: ReviewStagingRestoreOptions): ReviewStagingSession {
    assertNonEmpty(options.workspaceRoot, 'workspaceRoot');
    assertNonEmpty(options.sessionId, 'sessionId');
    assertNonEmpty(options.taskId, 'taskId');
    if (!options.review || options.review.schemaVersion !== 1 || options.review.sessionId !== options.sessionId || options.review.taskId !== options.taskId) {
      throw new WorkspaceError('REVIEW_INVALID', 'A8-05 persisted Review projection does not match its task/session.');
    }
    if (!fs.existsSync(options.workspaceRoot) || !fs.statSync(options.workspaceRoot).isDirectory()) {
      throw new WorkspaceError('WORKSPACE_ROOT_INVALID', 'A8-05 restore workspaceRoot must be an existing directory.');
    }
    const session = Object.create(ReviewStagingSession.prototype) as ReviewStagingSession;
    // These are deliberately assigned through a record cast: restore is an
    // internal, schema-validated construction path and keeps the normal
    // proposal constructor's private fields encapsulated from callers.
    Object.assign(session as unknown as Record<string, unknown>, {
      workspaceRoot: path.resolve(options.workspaceRoot),
      stagingRoot: path.resolve(options.stagingRoot),
      knownSecrets: (options.knownSecrets ?? []).filter((value) => typeof value === 'string' && value.length > 0),
      now: options.now ?? (() => new Date()),
      idFactory: options.idFactory ?? ((kind: string) => `a8r-${kind}-${crypto.randomBytes(12).toString('hex')}`),
      maxDiffBytes: options.maxDiffBytes ?? 64 * 1024,
      maxFileBytes: options.maxFileBytes ?? 2 * 1024 * 1024,
      failureInjector: options.failureInjector,
      state: clone(options.review),
      approvals: new ReviewApprovalLedger(),
      locked: false,
      recoveryPath: path.join(path.resolve(options.stagingRoot), 'recovery.v1.json'),
    });
    (session as unknown as { blobs: ContentAddressedBlobStore }).blobs = new ContentAddressedBlobStore(
      path.join(path.resolve(options.stagingRoot), 'blobs'), options.knownSecrets ?? [],
    );
    const recoveryManifestPresent = fs.existsSync((session as unknown as { recoveryPath: string }).recoveryPath);
    if (recoveryManifestPresent || options.review.status === 'RECOVERY_REQUIRED') {
      (session as unknown as { locked: boolean }).locked = true;
      (session as unknown as { state: ReviewSetV1 }).state.status = 'RECOVERY_REQUIRED';
    } else {
      session.revalidateBaseline();
    }
    return session;
  }

  get review(): ReviewSetV1 { return clone(this.state); }
  get isLocked(): boolean { return this.locked; }

  /** Re-check every persisted target before exposing a restored Review. */
  revalidateBaseline(): ReviewSetV1 {
    if (this.locked || this.state.status !== 'READY') return this.review;
    const drift = this.findDrift(this.state.files);
    const missingBlob = this.acceptedFiles().some((item) => item.operation !== 'DELETE' && (!item.afterBlobRef || !this.blobs.has(item.afterBlobRef)));
    if (drift.length > 0) {
      this.approvals.revokeAll();
      this.state.status = 'STALE';
      this.state.lastEventSeq += 1;
      this.state.updatedAt = this.now().toISOString();
    } else if (missingBlob) {
      this.locked = true;
      this.state.status = 'RECOVERY_REQUIRED';
      this.state.lastEventSeq += 1;
      this.state.updatedAt = this.now().toISOString();
    }
    return this.review;
  }

  getFile(relativePath: string): ReviewFileItemV1 | undefined {
    const key = comparisonKey(normalizeRelativePath(relativePath));
    const item = this.state.files.find((candidate) => candidate.comparisonKey === key);
    return item ? clone(item) : undefined;
  }

  decide(relativePath: string, decision: ReviewDecision): ReviewSetV1 {
    this.assertMutable();
    if (this.state.status !== 'READY') throw new WorkspaceError('REVIEW_NOT_READY', `Review is ${this.state.status}, not ready for decisions.`);
    if (!['PENDING', 'ACCEPTED', 'REJECTED'].includes(decision)) throw new WorkspaceError('REVIEW_INVALID', 'Unknown Review decision.');
    const item = this.requireFile(relativePath);
    if (decision === 'ACCEPTED' && !item.writable) throw new WorkspaceError('BINARY_WRITE_DENIED', `Binary or ambiguous file cannot be accepted: ${item.relativePath}`);
    if (item.decision === decision) return this.review;
    item.decision = decision;
    item.decisionEventId = this.nextEventId('decision');
    this.invalidateValidation('file decision changed');
    this.bumpRevision();
    if (this.state.files.every((candidate) => candidate.decision !== 'PENDING') && this.acceptedFiles().length === 0) {
      this.state.status = 'REJECTED';
      this.cleanupPrivateBlobs();
    }
    return this.review;
  }

  /** Replace one proposal's after bytes without touching the real workspace. */
  revise(relativePath: string, proposal: Pick<ReviewProposal, 'operation' | 'afterContent'>): ReviewSetV1 {
    this.assertMutable();
    if (this.state.status !== 'READY') throw new WorkspaceError('REVIEW_NOT_READY', `Review is ${this.state.status}, not ready for revision.`);
    const current = this.requireFile(relativePath);
    const replacement = this.buildFileItem({ relativePath: current.relativePath, ...proposal });
    const index = this.state.files.findIndex((candidate) => candidate.comparisonKey === current.comparisonKey);
    this.state.files[index] = replacement;
    this.state.files.sort(compareFiles);
    this.invalidateValidation('proposal bytes changed');
    this.bumpRevision();
    return this.review;
  }

  issueApproval(subject: string, ttlMs = 5 * 60 * 1000): ReviewApprovalBindingV1 {
    this.assertMutable();
    if (typeof subject !== 'string' || !subject.trim()) throw new WorkspaceError('APPROVAL_INVALID', 'Approval subject is required.');
    if (this.state.status !== 'READY') throw new WorkspaceError('REVIEW_NOT_READY', `Review is ${this.state.status}, not ready for approval.`);
    if (this.state.files.some((item) => item.decision === 'PENDING')) throw new WorkspaceError('REVIEW_NOT_READY', 'Every Review file must be accepted or rejected before apply.');
    const accepted = this.acceptedFiles();
    if (accepted.length === 0) throw new WorkspaceError('REVIEW_NOT_READY', 'All files were rejected; no write approval is required.');
    if (accepted.some((item) => !item.writable)) throw new WorkspaceError('BINARY_WRITE_DENIED', 'Binary or ambiguous content cannot enter WritePlan.');
    const request = this.buildApplyRequest();
    return this.approvals.issue({
      sessionId: this.state.sessionId,
      taskId: this.state.taskId,
      reviewId: this.state.reviewId,
      revision: this.state.revision,
      workspaceBaseHash: this.state.workspaceBaseHash,
      previewHash: this.state.previewHash,
      acceptedSetHash: this.state.acceptedSetHash,
      subject,
      request,
      ttlMs,
    });
  }

  recordValidation(input: {
    profileId?: string;
    argv?: readonly string[];
    status: ValidationStatus;
    complete: boolean;
    outputTruncated?: boolean;
    summary: string;
    source: string;
    trustedAdapter?: boolean;
    applicablePaths?: readonly string[];
  }): ReviewValidationRunV1 {
    this.assertMutable();
    if (this.state.status !== 'READY') throw new WorkspaceError('REVIEW_NOT_READY', `Review is ${this.state.status}, not ready for validation.`);
    if (!input || typeof input.summary !== 'string' || !input.summary.trim() || typeof input.source !== 'string' || !input.source.trim()) {
      throw new WorkspaceError('VALIDATION_INVALID', 'Validation summary and source are required.');
    }
    if (!['PASS', 'FAIL', 'CANCELLED', 'NOT_RUN'].includes(input.status)) throw new WorkspaceError('VALIDATION_INVALID', 'Unknown validation status.');
    if (input.status === 'PASS' && (!input.complete || input.outputTruncated || input.trustedAdapter !== true || !input.profileId)) {
      throw new WorkspaceError('VALIDATION_INVALID', 'PASS requires a complete, non-truncated result from a trusted Runner/remote adapter.');
    }
    const paths = (input.applicablePaths ?? this.acceptedFiles().map((item) => item.relativePath))
      .map(normalizeRelativePath)
      .sort((left, right) => comparisonKey(left).localeCompare(comparisonKey(right)));
    for (const relativePath of paths) {
      if (this.requireFile(relativePath).decision !== 'ACCEPTED') {
        throw new WorkspaceError('VALIDATION_INVALID', `Validation path is not in the accepted subset: ${relativePath}`);
      }
    }
    const validationStartedAt = this.now().toISOString();
    const validatedSetHash = this.hashSelectedSet(paths);
    const validationCoverageStale = input.status !== 'NOT_RUN' && validatedSetHash !== this.state.acceptedSetHash;
    let safeSummary: string;
    let safeSource: string;
    try {
      safeSummary = redactText(input.summary, this.knownSecrets);
      safeSource = redactText(input.source, this.knownSecrets);
    } catch (error) {
      // A known credential in validation evidence is a persistence boundary
      // violation. Revoke pending approvals, remove private bytes and leave
      // the Review terminally failed so no later apply can use a half-clean
      // staging set.
      this.approvals.revokeAll();
      this.cleanupPrivateBlobs();
      this.state.status = 'FAILED';
      this.state.unverifiedItems = this.state.files
        .filter((item) => item.decision === 'ACCEPTED')
        .map((item) => item.relativePath);
      this.state.lastEventSeq += 1;
      this.state.updatedAt = this.now().toISOString();
      throw error;
    }
    const validation: ReviewValidationRunV1 = {
      schemaVersion: 1,
      validationId: this.nextId('validation'),
      reviewId: this.state.reviewId,
      revision: this.state.revision,
      previewHash: this.state.previewHash,
      validatedSetHash,
      acceptedSetHash: this.state.acceptedSetHash,
      profileId: input.profileId ?? null,
      argvDigestSha256: input.argv ? sha256(input.argv) : null,
      status: input.status,
      complete: Boolean(input.complete),
      outputTruncated: Boolean(input.outputTruncated),
      summary: safeSummary,
      source: safeSource,
      trustedAdapter: input.trustedAdapter === true,
      applicablePaths: paths,
      startedAt: validationStartedAt,
      completedAt: validationStartedAt,
      createdAt: validationStartedAt,
      stale: validationCoverageStale,
      ...(validationCoverageStale ? { staleReason: 'validated set does not match the accepted set' } : {}),
    };
    // A newly recorded validation changes the evidence visible to the user;
    // any approval issued before it must be re-issued against that evidence.
    this.approvals.revokeAll();
    this.state.validationRuns.push(validation);
    const coveredPaths = input.status === 'NOT_RUN' || input.status === 'CANCELLED'
      ? new Set<string>()
      : new Set(paths);
    this.state.unverifiedItems = this.state.files
      .filter((item) => item.decision === 'ACCEPTED' && !coveredPaths.has(item.relativePath))
      .map((item) => item.relativePath);
    this.state.lastEventSeq += 1;
    this.state.updatedAt = this.now().toISOString();
    return clone(validation);
  }

  apply(binding: ReviewApprovalBindingV1): ReviewApplyResult {
    if (this.locked) throw new WorkspaceError('WORKSPACE_WRITE_LOCKED', 'A8-03 Review write is locked pending recovery.');
    if (this.state.status !== 'READY') throw new WorkspaceError('REVIEW_NOT_READY', `Review is ${this.state.status}, not ready to apply.`);
    if (this.state.files.some((item) => item.decision === 'PENDING')) throw new WorkspaceError('REVIEW_NOT_READY', 'Every Review file must be decided before apply.');
    const accepted = this.acceptedFiles();
    if (accepted.length === 0) {
      this.state.status = 'REJECTED';
      this.state.updatedAt = this.now().toISOString();
      this.cleanupPrivateBlobs();
      return emptyApplyResult('REJECTED');
    }
    if (accepted.some((item) => !item.writable)) throw new WorkspaceError('BINARY_WRITE_DENIED', 'Binary or ambiguous content cannot enter WritePlan.');
    const request = this.buildApplyRequest();
    const approvalCheck = this.approvals.validate(binding, request);
    if (!approvalCheck.valid) throw new WorkspaceError('APPROVAL_INVALID', approvalCheck.reason ?? 'A8-03 approval validation failed.');
    const drift = this.findDrift(accepted);
    if (drift.length > 0) {
      this.approvals.revoke(binding.approvalId);
      this.state.status = 'STALE';
      this.state.lastEventSeq += 1;
      this.state.updatedAt = this.now().toISOString();
      return {
        success: false,
        status: 'STALE',
        zeroWrites: true,
        operations: drift,
        rolledBack: false,
        rollbackStatus: 'not_required',
        rollbackErrors: [],
        recoveryRequired: false,
        approvalConsumed: false,
      };
    }
    const consumed = this.approvals.consume(binding, request);
    if (!consumed.valid) throw new WorkspaceError('APPROVAL_INVALID', consumed.reason ?? 'A8-03 approval validation failed.');
    this.state.status = 'APPLYING';
    const transactionId = this.nextId('transaction');
    const transactionRoot = path.join(this.stagingRoot, 'transactions', transactionId);
    fs.mkdirSync(transactionRoot, { recursive: true });
    const records: RecoveryFileRecord[] = [];
    const operations: ReviewApplyOperationResult[] = [];
    let writesStarted = false;
    try {
      for (const item of accepted) {
        this.inject('backup', item);
        const targetPath = this.targetPath(item.relativePath);
        const beforeExists = fs.existsSync(targetPath);
        let backupPath: string | null = null;
        if (beforeExists) {
          backupPath = path.join(transactionRoot, `${records.length}.before`);
          fs.copyFileSync(targetPath, backupPath);
        }
        records.push({ relativePath: item.relativePath, targetPath, beforeExists, beforeSha256: item.beforeSha256, backupPath });
      }
      this.writeRecoveryManifest({ schemaVersion: 1, reviewId: this.state.reviewId, transactionId, workspaceRoot: this.workspaceRoot, files: records, createdAt: this.now().toISOString() });
      for (const item of accepted) {
        this.inject('write', item);
        const targetPath = this.targetPath(item.relativePath);
        if (item.operation === 'DELETE') {
          if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);
        } else {
          const content = item.afterBlobRef ? this.blobs.get(item.afterBlobRef) : null;
          if (!content) throw new WorkspaceError('REVIEW_INVALID', `Missing after blob for ${item.relativePath}`);
          fs.mkdirSync(path.dirname(targetPath), { recursive: true });
          atomicReplace(targetPath, content);
        }
        writesStarted = true;
        operations.push({ relativePath: item.relativePath, operation: item.operation, success: true });
      }
      for (const item of accepted) {
        this.inject('verify', item);
        const targetPath = this.targetPath(item.relativePath);
        if (item.operation === 'DELETE') {
          if (fs.existsSync(targetPath)) throw new WorkspaceError('VERIFY_MISMATCH', `Delete verification failed: ${item.relativePath}`);
        } else {
          const content = item.afterBlobRef ? this.blobs.get(item.afterBlobRef) : null;
          if (!content || !fs.existsSync(targetPath) || !fs.readFileSync(targetPath).equals(content)) {
            throw new WorkspaceError('VERIFY_MISMATCH', `Byte verification failed: ${item.relativePath}`);
          }
        }
      }
      this.removeRecoveryManifest();
      removeDirectory(transactionRoot);
      this.cleanupPrivateBlobs();
      this.state.status = 'APPLIED';
      this.state.appliedAt = this.now().toISOString();
      this.state.lastEventSeq += 1;
      this.state.updatedAt = this.now().toISOString();
      return { success: true, status: 'APPLIED', zeroWrites: false, operations, rolledBack: false, rollbackStatus: 'not_required', rollbackErrors: [], recoveryRequired: false, approvalConsumed: true };
    } catch (error) {
      const rollbackErrors: string[] = [];
      try {
        this.inject('rollback');
        for (const record of records.slice().reverse()) {
          try {
            if (record.beforeExists && record.backupPath) {
              atomicReplace(record.targetPath, fs.readFileSync(record.backupPath));
            } else if (fs.existsSync(record.targetPath)) {
              fs.unlinkSync(record.targetPath);
            }
          } catch (rollbackError) {
            rollbackErrors.push(`${record.relativePath}: ${errorMessage(rollbackError)}`);
          }
        }
      } catch (rollbackError) {
        rollbackErrors.push(`rollback: ${errorMessage(rollbackError)}`);
      }
      const errorResult = errorMessage(error);
      if (rollbackErrors.length > 0) {
        this.locked = true;
        this.state.status = 'RECOVERY_REQUIRED';
        this.writeRecoveryManifest({ schemaVersion: 1, reviewId: this.state.reviewId, transactionId, workspaceRoot: this.workspaceRoot, files: records, createdAt: this.now().toISOString() });
      } else {
        this.state.status = 'FAILED';
        this.removeRecoveryManifest();
        removeDirectory(transactionRoot);
      }
      this.state.lastEventSeq += 1;
      this.state.updatedAt = this.now().toISOString();
      if (operations.length === 0 && writesStarted) operations.push({ relativePath: '(batch)', operation: 'MODIFY', success: false, error: errorResult });
      else operations.push({ relativePath: '(batch)', operation: 'MODIFY', success: false, error: errorResult });
      return {
        success: false,
        status: this.state.status,
        zeroWrites: !writesStarted,
        operations,
        rolledBack: rollbackErrors.length === 0,
        rollbackStatus: rollbackErrors.length === 0 ? 'completed' : 'failed',
        rollbackErrors,
        recoveryRequired: rollbackErrors.length > 0,
        approvalConsumed: true,
      };
    }
  }

  restoreRecovery(): { restored: boolean; detail: string } {
    const manifest = this.loadRecoveryManifest();
    if (!manifest) return { restored: false, detail: 'No A8-03 recovery manifest is present.' };
    const errors: string[] = [];
    for (const record of manifest.files.slice().reverse()) {
      try {
        if (record.beforeExists && record.backupPath && fs.existsSync(record.backupPath)) {
          atomicReplace(record.targetPath, fs.readFileSync(record.backupPath));
          if (record.beforeSha256 && sha256(fs.readFileSync(record.targetPath)) !== record.beforeSha256) throw new Error('restored hash mismatch');
        } else if (!record.beforeExists && fs.existsSync(record.targetPath)) {
          fs.unlinkSync(record.targetPath);
        }
      } catch (error) {
        errors.push(`${record.relativePath}: ${errorMessage(error)}`);
      }
    }
    if (errors.length > 0) {
      this.locked = true;
      return { restored: false, detail: errors.join('; ') };
    }
    this.removeRecoveryManifest();
    this.locked = false;
    this.state.status = 'READY';
    this.state.lastEventSeq += 1;
    this.state.updatedAt = this.now().toISOString();
    return { restored: true, detail: 'A8-03 accepted subset restored and write lock cleared.' };
  }

  private createInitialReview(options: ReviewStagingOptions): ReviewSetV1 {
    const files = options.proposals.map((proposal) => this.buildFileItem(proposal));
    const duplicate = new Set<string>();
    for (const item of files) {
      if (duplicate.has(item.comparisonKey)) throw new WorkspaceError('REVIEW_INVALID', `Duplicate Windows path in ReviewSet: ${item.relativePath}`);
      duplicate.add(item.comparisonKey);
    }
    files.sort(compareFiles);
    const createdAt = this.now().toISOString();
    const review: ReviewSetV1 = {
      schemaVersion: 1,
      reviewId: this.nextId('review'),
      revision: 1,
      workspaceId: options.workspaceId,
      sessionId: options.sessionId,
      taskId: options.taskId,
      status: 'READY',
      workspaceBaseHash: hashWorkspaceBase(files),
      previewHash: hashPreview(files),
      acceptedSetHash: hashAcceptedSet(files),
      files,
      validationRuns: [],
      unverifiedItems: files.map((item) => item.relativePath),
      createdAt,
      updatedAt: createdAt,
      lastEventSeq: 0,
    };
    return review;
  }

  private buildFileItem(proposal: ReviewProposal): ReviewFileItemV1 {
    const relativePath = normalizeRelativePath(proposal.relativePath);
    if (!['CREATE', 'MODIFY', 'DELETE'].includes(proposal.operation)) throw new WorkspaceError('REVIEW_INVALID', `Unsupported Review operation: ${proposal.operation}`);
    const targetPath = this.targetPath(relativePath);
    const lstat = lstatIfPresent(targetPath);
    if (lstat && lstat.isSymbolicLink()) throw new WorkspaceError('WORKSPACE_BOUNDARY_VIOLATION', `Reparse/symlink target is not writable: ${relativePath}`);
    const beforeExists = Boolean(lstat);
    if (beforeExists && !lstat?.isFile()) throw new WorkspaceError('PATH_NOT_FILE', `Review target is not a regular file: ${relativePath}`);
    if (proposal.operation === 'CREATE' && beforeExists) throw new WorkspaceError('REVIEW_INVALID', `CREATE target already exists: ${relativePath}`);
    if (proposal.operation !== 'CREATE' && !beforeExists) throw new WorkspaceError('REVIEW_INVALID', `${proposal.operation} target does not exist: ${relativePath}`);
    if ((proposal.operation === 'CREATE' || proposal.operation === 'MODIFY') && !Buffer.isBuffer(proposal.afterContent)) {
      throw new WorkspaceError('REVIEW_INVALID', `${proposal.operation} requires afterContent bytes: ${relativePath}`);
    }
    const before = beforeExists ? fs.readFileSync(targetPath) : null;
    const after = proposal.operation === 'DELETE' ? null : Buffer.from(proposal.afterContent as Buffer);
    if (before && before.length > this.maxFileBytes || after && after.length > this.maxFileBytes) throw new WorkspaceError('FILE_TOO_LARGE', `Review file exceeds ${this.maxFileBytes} bytes: ${relativePath}`);
    assertNoSensitiveBytes(before, this.knownSecrets);
    assertNoSensitiveBytes(after, this.knownSecrets);
    const beforeMeta = describeBytes(before);
    const afterMeta = describeBytes(after);
    const diff = buildReviewDiff(before, after, this.maxDiffBytes);
    const beforeBlobRef = before ? this.blobs.put(before) : null;
    const afterBlobRef = after ? this.blobs.put(after) : null;
    return {
      schemaVersion: 1,
      relativePath,
      comparisonKey: comparisonKey(relativePath),
      operation: proposal.operation,
      beforeExists,
      afterExists: after !== null,
      beforeBytes: before?.length ?? 0,
      afterBytes: after?.length ?? 0,
      beforeSha256: before ? sha256(before) : null,
      afterSha256: after ? sha256(after) : null,
      beforeEncoding: beforeMeta.encoding,
      afterEncoding: afterMeta.encoding,
      beforeBom: beforeMeta.bom,
      afterBom: afterMeta.bom,
      beforeEol: beforeMeta.eol,
      afterEol: afterMeta.eol,
      diff,
      beforeBlobRef,
      afterBlobRef,
      decision: 'PENDING',
      writable: beforeMeta.encoding !== 'binary' && afterMeta.encoding !== 'binary',
    };
  }

  private acceptedFiles(): ReviewFileItemV1[] { return this.state.files.filter((item) => item.decision === 'ACCEPTED'); }

  private requireFile(relativePath: string): ReviewFileItemV1 {
    const key = comparisonKey(normalizeRelativePath(relativePath));
    const item = this.state.files.find((candidate) => candidate.comparisonKey === key);
    if (!item) throw new WorkspaceError('REVIEW_INVALID', `Review file is not found: ${relativePath}`);
    return item;
  }

  private targetPath(relativePath: string): string {
    const target = path.resolve(this.workspaceRoot, relativePath);
    const validation = validatePath(target, this.workspaceRoot);
    if (!validation.valid) throw new WorkspaceError('WORKSPACE_BOUNDARY_VIOLATION', validation.error ?? `Unsafe Review path: ${relativePath}`);
    return target;
  }

  private buildApplyRequest(): ReviewApplyRequest {
    return {
      schemaVersion: 1,
      sessionId: this.state.sessionId,
      taskId: this.state.taskId,
      reviewId: this.state.reviewId,
      revision: this.state.revision,
      workspaceRoot: this.workspaceRoot,
      workspaceBaseHash: this.state.workspaceBaseHash,
      previewHash: this.state.previewHash,
      acceptedSetHash: this.state.acceptedSetHash,
      accepted: this.acceptedFiles().map((item) => ({
        relativePath: item.relativePath,
        operation: item.operation,
        beforeSha256: item.beforeSha256,
        afterSha256: item.afterSha256,
        diffSha256: item.diff.diffSha256,
      })),
    };
  }

  private findDrift(files: readonly ReviewFileItemV1[]): ReviewApplyOperationResult[] {
    const drift: ReviewApplyOperationResult[] = [];
    for (const item of files) {
      this.inject('preflight', item);
      const targetPath = this.targetPath(item.relativePath);
      const currentStat = lstatIfPresent(targetPath);
      if (currentStat?.isSymbolicLink()) throw new WorkspaceError('WORKSPACE_BOUNDARY_VIOLATION', `Reparse/symlink target is not writable: ${item.relativePath}`);
      const exists = Boolean(currentStat);
      const currentHash = exists && currentStat?.isFile() ? sha256(fs.readFileSync(targetPath)) : null;
      const matches = item.beforeExists
        ? exists && currentHash === item.beforeSha256
        : !exists;
      if (!matches) drift.push({ relativePath: item.relativePath, operation: item.operation, success: false, error: 'STALE: target baseline drifted; zero files written.' });
    }
    return drift;
  }

  private hashSelectedSet(paths: readonly string[]): string {
    const selected = paths.map((relativePath) => this.requireFile(relativePath));
    return hashAcceptedSet(selected);
  }

  private invalidateValidation(reason: string): void {
    this.state.validationRuns.forEach((run) => {
      run.stale = true;
      run.staleReason = reason;
    });
    this.state.unverifiedItems = this.state.files
      .filter((item) => item.decision !== 'REJECTED')
      .map((item) => item.relativePath);
  }

  private bumpRevision(): void {
    this.state.revision += 1;
    this.approvals.revokeAll();
    this.state.status = 'READY';
    this.state.workspaceBaseHash = hashWorkspaceBase(this.state.files);
    this.state.previewHash = hashPreview(this.state.files);
    this.state.acceptedSetHash = hashAcceptedSet(this.state.files);
    this.state.lastEventSeq += 1;
    this.state.updatedAt = this.now().toISOString();
  }

  private nextEventId(kind: string): string { this.state.lastEventSeq += 1; return this.nextId(`${kind}-event`); }
  private nextId(kind: string): string { const value = this.idFactory(kind); if (!value || typeof value !== 'string') throw new WorkspaceError('REVIEW_INVALID', `Invalid ${kind} identifier.`); return value; }
  private assertMutable(): void { if (this.locked) throw new WorkspaceError('WORKSPACE_WRITE_LOCKED', 'A8-03 Review is locked pending recovery.'); }
  private inject(phase: ReviewApplyPhase, item?: ReviewFileItemV1): void { if (this.failureInjector) this.failureInjector(phase, item); }

  private writeRecoveryManifest(manifest: RecoveryManifestV1): void {
    fs.mkdirSync(path.dirname(this.recoveryPath), { recursive: true });
    atomicReplace(this.recoveryPath, Buffer.from(JSON.stringify(manifest, null, 2) + '\n', 'utf8'));
  }
  private cleanupPrivateBlobs(): void {
    // ReviewSet keeps only hashes and references after a terminal decision;
    // the private bytes must not outlive APPLIED/REJECTED state.
    removeDirectory(path.join(this.stagingRoot, 'blobs'));
    removeDirectory(path.join(this.stagingRoot, 'transactions'));
  }
  private loadRecoveryManifest(): RecoveryManifestV1 | undefined {
    try { return JSON.parse(fs.readFileSync(this.recoveryPath, 'utf8')) as RecoveryManifestV1; } catch { return undefined; }
  }
  private removeRecoveryManifest(): void { try { if (fs.existsSync(this.recoveryPath)) fs.unlinkSync(this.recoveryPath); } catch { /* retain evidence on cleanup failure */ } }
}

export function createReviewStagingSession(options: ReviewStagingOptions): ReviewStagingSession {
  return new ReviewStagingSession(options);
}

function describeBytes(value: Buffer | null): { encoding: ReviewEncoding; bom: boolean; eol: ReviewEol } {
  if (value === null) return { encoding: 'utf-8', bom: false, eol: 'none' };
  const result = detectEncoding(value);
  if (result.encoding === 'ambiguous') return { encoding: 'binary', bom: result.bom, eol: 'none' };
  const text = decodeBuffer(value, result.encoding);
  if (text === undefined) return { encoding: 'binary', bom: result.bom, eol: 'none' };
  return { encoding: result.encoding, bom: result.bom, eol: detectEol(text) };
}

function buildReviewDiff(before: Buffer | null, after: Buffer | null, maxBytes: number): ReviewDiffV1 {
  const beforeInfo = describeBytes(before);
  const afterInfo = describeBytes(after);
  const beforeText = decodeReviewText(before, beforeInfo.encoding);
  const afterText = decodeReviewText(after, afterInfo.encoding);
  const beforeHash = before ? sha256(before) : null;
  const afterHash = after ? sha256(after) : null;
  if (beforeText === undefined || afterText === undefined || beforeInfo.encoding === 'binary' || afterInfo.encoding === 'binary') {
    const unifiedDiff = '[binary or ambiguous content; byte hashes are shown and write acceptance is disabled]';
    return { schemaVersion: 1, encoding: 'binary', beforeSha256: beforeHash, afterSha256: afterHash, startLine: 1, removedLineCount: 0, addedLineCount: 0, unifiedDiff, truncated: false, diffSha256: sha256(unifiedDiff) };
  }
  const beforeLines = splitLines(beforeText);
  const afterLines = splitLines(afterText);
  let prefix = 0;
  while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < beforeLines.length - prefix && suffix < afterLines.length - prefix && beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]) suffix += 1;
  const removed = beforeLines.slice(prefix, beforeLines.length - suffix);
  const added = afterLines.slice(prefix, afterLines.length - suffix);
  const contextBefore = beforeLines.slice(Math.max(0, prefix - 3), prefix);
  const contextAfter = afterLines.slice(afterLines.length - suffix, afterLines.length - suffix + 3);
  const raw = [`@@ -${prefix + 1},${removed.length} +${prefix + 1},${added.length} @@`, ...contextBefore.map((line) => ` ${line}`), ...removed.map((line) => `-${line}`), ...added.map((line) => `+${line}`), ...contextAfter.map((line) => ` ${line}`)].join('\n');
  const capped = capUtf8(raw, maxBytes);
  const encoding: ReviewEncoding = beforeInfo.encoding === afterInfo.encoding ? beforeInfo.encoding : 'binary';
  const text = encoding === 'binary' ? '[text encoding changed; inspect explicit before/after metadata and byte hashes]' : capped.text;
  return { schemaVersion: 1, encoding, beforeSha256: beforeHash, afterSha256: afterHash, startLine: prefix + 1, removedLineCount: removed.length, addedLineCount: added.length, unifiedDiff: text, truncated: capped.truncated, diffSha256: sha256(text) };
}

function decodeReviewText(value: Buffer | null, encoding: ReviewEncoding): string | undefined {
  if (value === null) return '';
  if (encoding === 'binary') return undefined;
  return decodeBuffer(value, encoding);
}

function splitLines(value: string): string[] { return value.length === 0 ? [] : value.split(/\r\n|\n|\r/); }

function detectEol(value: string): ReviewEol {
  const crlf = (value.match(/\r\n/g) ?? []).length;
  const lf = (value.replace(/\r\n/g, '').match(/\n/g) ?? []).length;
  const cr = (value.replace(/\r\n/g, '').match(/\r/g) ?? []).length;
  const styles = Number(crlf > 0) + Number(lf > 0) + Number(cr > 0);
  if (styles === 0) return 'none';
  if (styles > 1) return 'mixed';
  return crlf > 0 ? 'crlf' : lf > 0 ? 'lf' : 'cr';
}

function capUtf8(value: string, maxBytes: number): { text: string; truncated: boolean } {
  const bytes = Buffer.from(value, 'utf8');
  if (bytes.length <= maxBytes) return { text: value, truncated: false };
  const notice = Buffer.from('\n[diff preview truncated; narrow the review or inspect the target range]\n', 'utf8');
  const available = Math.max(0, maxBytes - notice.length);
  const head = Math.floor(available / 2);
  const tail = available - head;
  let headEnd = head;
  while (headEnd > 0 && (bytes[headEnd] & 0xc0) === 0x80) headEnd -= 1;
  let tailStart = bytes.length - tail;
  while (tailStart < bytes.length && (bytes[tailStart] & 0xc0) === 0x80) tailStart += 1;
  return { text: Buffer.concat([bytes.subarray(0, headEnd), notice, bytes.subarray(tailStart)]).toString('utf8'), truncated: true };
}

function hashWorkspaceBase(files: readonly ReviewFileItemV1[]): string {
  return sha256(files.slice().sort(compareFiles).map((item) => ({ relativePath: item.relativePath, operation: item.operation, beforeExists: item.beforeExists, beforeSha256: item.beforeSha256 })));
}

function hashPreview(files: readonly ReviewFileItemV1[]): string {
  return sha256(files.slice().sort(compareFiles).map((item) => ({ relativePath: item.relativePath, operation: item.operation, beforeSha256: item.beforeSha256, afterSha256: item.afterSha256, diffSha256: item.diff.diffSha256 })));
}

function hashAcceptedSet(files: readonly ReviewFileItemV1[]): string {
  return sha256(files.slice().filter((item) => item.decision === 'ACCEPTED').sort(compareFiles).map((item) => ({ relativePath: item.relativePath, operation: item.operation, beforeSha256: item.beforeSha256, afterSha256: item.afterSha256, diffSha256: item.diff.diffSha256, decision: item.decision })));
}

function compareFiles(left: ReviewFileItemV1, right: ReviewFileItemV1): number {
  return left.comparisonKey.localeCompare(right.comparisonKey);
}

function normalizeRelativePath(value: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new WorkspaceError('REVIEW_INVALID', 'Review path must be a non-empty relative path.');
  const normalized = value.trim().replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized) || normalized.includes('\0')) throw new WorkspaceError('WORKSPACE_BOUNDARY_VIOLATION', 'Review paths must be workspace-relative.');
  const parts = normalized.split('/');
  if (parts.some((part) => !part || part === '.' || part === '..')) throw new WorkspaceError('WORKSPACE_BOUNDARY_VIOLATION', 'Review path contains an empty or escaping component.');
  if (parts.some((part) => part.toLowerCase() === '.git')) throw new WorkspaceError('WORKSPACE_SENSITIVE_PATH', 'Review cannot modify .git internals.');
  return parts.join('/');
}

function comparisonKey(relativePath: string): string { return relativePath.replace(/\//g, '\\').toLowerCase(); }

function assertNoSensitiveBytes(value: Buffer | null, knownSecrets: readonly string[]): void {
  if (!value || knownSecrets.length === 0) return;
  for (const secret of knownSecrets) {
    const bytes = Buffer.from(secret, 'utf8');
    if (bytes.length > 0 && value.includes(bytes)) throw new WorkspaceError('SENSITIVE_DATA_BLOCKED', 'Known sensitive value was blocked from the private Review staging area.');
  }
}

function redactText(value: string, knownSecrets: readonly string[]): string {
  for (const secret of knownSecrets) if (secret && value.includes(secret)) throw new WorkspaceError('SENSITIVE_DATA_BLOCKED', 'Known sensitive value was blocked from Review validation evidence.');
  return value;
}

function atomicReplace(filePath: string, content: Buffer): void {
  const tempPath = `${filePath}.a8tmp-${crypto.randomBytes(8).toString('hex')}`;
  try {
    fs.writeFileSync(tempPath, content, { flag: 'wx' });
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch { /* preserve primary error */ }
    throw error;
  }
}

function removeDirectory(directory: string): void {
  try { fs.rmSync(directory, { recursive: true, force: true }); } catch { /* recovery manifest remains authoritative */ }
}

function emptyApplyResult(status: ReviewStatus): ReviewApplyResult {
  return {
    success: status === 'APPLIED',
    status,
    zeroWrites: true,
    operations: [],
    rolledBack: false,
    rollbackStatus: 'not_required',
    rollbackErrors: [],
    recoveryRequired: false,
    approvalConsumed: false,
  };
}

function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : String(error); }
function assertNonEmpty(value: unknown, label: string): asserts value is string { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${label} is required`); }
function lstatIfPresent(targetPath: string): fs.Stats | null {
  try {
    return fs.lstatSync(targetPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

/**
 * Phase 4 — Workspace Write: shared type definitions.
 *
 * All public types for encoding detection, path safety, write planning,
 * atomic application, shadow workspace, and diff reporting.
 */

// ---------------------------------------------------------------------------
// Encoding
// ---------------------------------------------------------------------------

export type Encoding = 'utf-8' | 'gbk' | 'utf-16le' | 'ambiguous';

export interface EncodingResult {
  encoding: Encoding;
  bom: boolean;
  confidence: number;
}

// ---------------------------------------------------------------------------
// Path safety
// ---------------------------------------------------------------------------

export interface PathValidation {
  valid: boolean;
  resolvedPath: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Error model (ADR-0012 §5)
// ---------------------------------------------------------------------------

export type WorkspaceErrorCode =
  | 'ENCODING_AMBIGUOUS'
  | 'ANCHOR_INVALID'
  | 'ANCHOR_NOT_FOUND'
  | 'ANCHOR_AMBIGUOUS'
  | 'PATH_NOT_FILE'
  | 'PATH_NOT_DIRECTORY'
  | 'INVALID_TOOL_INPUT'
  | 'FILE_TOO_LARGE'
  | 'DIFF_TRUNCATED'
  | 'REPLAN_REQUIRED'
  | 'WORKSPACE_BOUNDARY_VIOLATION'
  | 'WORKSPACE_ROOT_INVALID'
  | 'APPROVAL_REQUIRED'
  | 'APPROVAL_INVALID'
  | 'WORKSPACE_WRITE_LOCKED'
  | 'ATOMIC_REPLACE_FAILED'
  | 'VERIFY_MISMATCH'
  | 'SENSITIVE_DATA_BLOCKED'
  | 'REVIEW_INVALID'
  | 'WORKSPACE_SENSITIVE_PATH'
  | 'REVIEW_NOT_READY'
  | 'REVIEW_STALE'
  | 'BINARY_WRITE_DENIED'
  | 'VALIDATION_INVALID'
  | 'RECOVERY_REQUIRED'
  | 'BASELINE_DRIFT'
  | 'READ_REQUIRED'
  | 'ENCODING_WRITE_UNSUPPORTED'
  | 'CHECKPOINT_PERSIST_FAILED';

export class WorkspaceError extends Error {
  readonly code: WorkspaceErrorCode;

  constructor(code: WorkspaceErrorCode, message: string) {
    super(message);
    this.name = 'WorkspaceError';
    this.code = code;
  }
}

// ---------------------------------------------------------------------------
// Write plan
// ---------------------------------------------------------------------------

export interface WriteOperation {
  path: string;
  content: Buffer;
  encoding: string;
  createDirectories: boolean;
  baseSha256?: string;
  /** Bounded content-level preview generated before approval. */
  preview?: ContentDiffPreview;
}

export interface WritePlan {
  operations: WriteOperation[];
  timestamp: string;
  version: string;
}

export interface CreatePlanOptions {
  encoding?: string;
  createDirectories?: boolean;
  maxPreviewBytes?: number;
}

// ---------------------------------------------------------------------------
// Apply result
// ---------------------------------------------------------------------------

export interface OperationResult {
  path: string;
  success: boolean;
  error?: string;
  preview?: ContentDiffPreview;
}

export interface ApplyResult {
  success: boolean;
  operations: OperationResult[];
  rolledBack: boolean;
  rollbackStatus: 'not_required' | 'completed' | 'failed';
  rollbackErrors: string[];
  cleanupWarnings: string[];
}

// ---------------------------------------------------------------------------
// Shadow workspace & diff
// ---------------------------------------------------------------------------

export interface DiffEntry {
  path: string;
  status: 'added' | 'modified' | 'deleted';
  preview: ContentDiffPreview;
}

export interface DiffResult {
  entries: DiffEntry[];
}

export interface ContentDiffPreview {
  schemaVersion: '1.0';
  encoding: 'utf-8' | 'binary';
  beforeSha256: string | null;
  afterSha256: string | null;
  /** First changed line in the original, or 1 for an added file. */
  startLine: number;
  removedLineCount: number;
  addedLineCount: number;
  /** Bounded, unified-style content preview suitable for approval and model review. */
  unifiedDiff: string;
  truncated: boolean;
}

export interface CreateTextReplacePlanOptions extends CreatePlanOptions {
  /** Refuse token-expensive whole-file decoding above this byte size. */
  maxFileBytes?: number;
}

export interface TextReplacementPlan {
  plan: WritePlan;
  preview: ContentDiffPreview;
  matchLine: number;
}

// ---------------------------------------------------------------------------
// Read-only ACI tools
// ---------------------------------------------------------------------------

export interface ReadTextOptions {
  workspaceRoot: string;
  path: string;
  /** Explicit decoder selection; default remains strict UTF-8. */
  encoding?: 'utf-8' | 'gbk';
  startLine?: number;
  maxLines?: number;
  maxOutputBytes?: number;
  maxFileBytes?: number;
}

export interface ReadTextLine {
  line: number;
  text: string;
}

export interface ReadTextResult {
  schemaVersion: '1.0';
  path: string;
  encoding: 'utf-8' | 'gbk';
  totalLines: number;
  startLine: number;
  endLine: number;
  lines: ReadTextLine[];
  content: string;
  truncated: boolean;
  truncationReasons: Array<'line_limit' | 'output_bytes' | 'line_bytes'>;
}

export interface SearchTextOptions {
  workspaceRoot: string;
  path?: string;
  pattern: string;
  maxMatches?: number;
  contextLines?: number;
  maxFiles?: number;
  maxScannedBytes?: number;
  maxFileBytes?: number;
  maxOutputBytes?: number;
  ignoredNames?: string[];
}

export interface SearchContextLine {
  line: number;
  text: string;
}

export interface SearchTextMatch {
  path: string;
  line: number;
  text: string;
  before: SearchContextLine[];
  after: SearchContextLine[];
}

export type SearchTruncationReason =
  | 'matches'
  | 'output_bytes'
  | 'file_count'
  | 'scanned_bytes'
  | 'file_too_large'
  | 'unreadable'
  | 'unsupported_encoding';

export interface SearchTextResult {
  schemaVersion: '1.0';
  pattern: string;
  root: string;
  matches: SearchTextMatch[];
  returnedMatches: number;
  /** Count observed across the complete allowed scan, not just returned rows. */
  totalMatches: number;
  /** False when a scan budget or unreadable/unsupported file prevents an exact total. */
  totalMatchesExact: boolean;
  scannedFiles: number;
  scannedBytes: number;
  skippedBinary: number;
  skippedUnreadable: number;
  skippedOversized: number;
  truncated: boolean;
  truncationReasons: SearchTruncationReason[];
}

export interface ListDirectoryOptions {
  workspaceRoot: string;
  path?: string;
  maxEntries?: number;
  maxOutputBytes?: number;
}

export interface ListDirectoryEntry {
  name: string;
  path: string;
  type: 'file' | 'directory' | 'symlink' | 'other';
  size?: number;
}

export interface ListDirectoryResult {
  schemaVersion: '1.0';
  path: string;
  depth: 1;
  entries: ListDirectoryEntry[];
  returnedEntries: number;
  totalEntries: number;
  truncated: boolean;
  truncationReasons: Array<'entry_limit' | 'output_bytes'>;
}

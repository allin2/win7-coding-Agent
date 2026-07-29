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
  | 'REPLAN_REQUIRED'
  | 'WORKSPACE_BOUNDARY_VIOLATION'
  | 'ATOMIC_REPLACE_FAILED'
  | 'VERIFY_MISMATCH';

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
}

export interface WritePlan {
  operations: WriteOperation[];
  timestamp: string;
  version: string;
}

export interface CreatePlanOptions {
  encoding?: string;
  createDirectories?: boolean;
}

// ---------------------------------------------------------------------------
// Apply result
// ---------------------------------------------------------------------------

export interface OperationResult {
  path: string;
  success: boolean;
  error?: string;
}

export interface ApplyResult {
  success: boolean;
  operations: OperationResult[];
  rolledBack: boolean;
}

// ---------------------------------------------------------------------------
// Shadow workspace & diff
// ---------------------------------------------------------------------------

export interface DiffEntry {
  path: string;
  status: 'added' | 'modified' | 'deleted';
}

export interface DiffResult {
  entries: DiffEntry[];
}

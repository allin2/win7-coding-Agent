/**
 * win7-agent-workspace — module entry point.
 *
 * Re-exports every public symbol so consumers can import from the package
 * root: `import { detectEncoding, createPlan, applyPlan, … } from '…'`.
 */

// Types & error class
export {
  Encoding,
  EncodingResult,
  PathValidation,
  WorkspaceErrorCode,
  WorkspaceError,
  WriteOperation,
  WritePlan,
  CreatePlanOptions,
  OperationResult,
  ApplyResult,
  DiffEntry,
  DiffResult,
  ContentDiffPreview,
  CreateTextReplacePlanOptions,
  TextReplacementPlan,
  ReadTextOptions,
  ReadTextLine,
  ReadTextResult,
  SearchTextOptions,
  SearchContextLine,
  SearchTextMatch,
  SearchTruncationReason,
  SearchTextResult,
  ListDirectoryOptions,
  ListDirectoryEntry,
  ListDirectoryResult,
} from './types';

// Encoding detection
export { detectEncoding } from './encoding';

// Path safety
export { validatePath, isJunction } from './safety';

// Atomic writing
export { atomicWrite, atomicWriteBatch } from './atomic';

// Shadow workspace
export { ShadowWorkspace } from './shadow';

// Diff
export { computeDiff, buildContentDiffPreview } from './diff';

// Plan / Apply
export { createPlan, createPlanBatch } from './plan';
export { createTextReplacePlan } from './replace';
export {
  TrustedWritePreparer,
  WriteApprovalLedger,
  RecoveryManifestStore,
  WriteTransactionCoordinator,
} from './trusted-write';
export type {
  TrustedWritePlanStatus,
  TrustedWriteIntent,
  TrustedWritePlan,
  TrustedWritePlanPublic,
  TrustedWritePreparerOptions,
  WriteTransactionCoordinatorOptions,
  WriteApprovalBinding,
  RecoveryManifest,
} from './trusted-write';
export { listDirectory, readText, searchText } from './readonly';
export { createReadonlyWorkspacePort } from './readonly-port';
export {
  WorkspaceApprovalBinding,
  WorkspaceApprovalValidation,
  WorkspaceApprovalPort,
  ApplyPlanOptions,
  buildApplyApprovalRequest,
  applyPlan,
} from './apply';

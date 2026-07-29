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
export { computeDiff } from './diff';

// Plan / Apply
export { createPlan, createPlanBatch } from './plan';
export { applyPlan } from './apply';

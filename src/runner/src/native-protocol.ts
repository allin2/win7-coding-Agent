export interface NativeHelperRequest {
  schema_version: 1;
  requestId: string;
  executable: string;
  argv: string[];
  workingDirectory: string;
  timeoutMs: number;
  idleTimeoutMs: number;
  maxOutputSize: number;
  allowNetwork: false;
  allowedDirectories: string[];
  protectedDirectories: string[];
  aclPolicy?: { acceptanceRoot: string; perRunRoot: string };
}

export interface NativeHelperExecutionResult {
  schema_version: 1;
  type: 'execution_result';
  requestId: string;
  status: 'completed';
  exitCode: number;
  executionTimeMs: number;
  timedOut: boolean;
  idleTimedOut?: boolean;
  canceled: boolean;
  outputTruncated: boolean;
  containmentVerified: boolean;
  inputDetached: boolean;
  hostJob: {
    detected: boolean;
    breakaway: 'none' | 'explicit' | 'silent';
    limitFlags: number;
    childJobAssignmentVerified: boolean;
  };
  tokenAudit: {
    verified: boolean;
    isRestricted: boolean;
    tokenType: string;
    restrictedSidSetVerified: boolean;
    integrityRid: number;
  };
  stdoutSize: number;
  stderrSize: number;
  stdoutBase64: string;
  stderrBase64: string;
  aclChanges: Array<{ applied: boolean; verified: boolean; rolledBack: boolean; error: string }>;
}

export interface NativeHelperErrorResult {
  schema_version: 1;
  type: 'error';
  requestId: string;
  error: string;
  message: string;
}

export type NativeHelperResponse = NativeHelperExecutionResult | NativeHelperErrorResult;

export function parseNativeHelperResponse(line: string, expectedRequestId: string): NativeHelperResponse {
  let value: unknown;
  try { value = JSON.parse(line); } catch (_error) { throw new Error('Helper response is not valid JSON'); }
  if (!value || typeof value !== 'object') throw new Error('Helper response is not an object');
  const response = value as Partial<NativeHelperResponse>;
  if (response.schema_version !== 1 || response.requestId !== expectedRequestId ||
      (response.type !== 'execution_result' && response.type !== 'error')) {
    throw new Error('Helper response envelope or request binding is invalid');
  }
  return response as NativeHelperResponse;
}

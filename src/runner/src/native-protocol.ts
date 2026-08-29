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
  idleTimedOut: boolean;
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
    source: 'suspended_child_process_token';
    verified: boolean;
    isRestricted: boolean;
    tokenType: string;
    restrictedSidSetVerified: boolean;
    userRestrictedSid: boolean;
    worldRestrictedSid: boolean;
    administratorsRestrictedSid: boolean;
    restrictedSidCount: number;
    integritySid: string;
    integrityRid: number;
  };
  stdoutSize: number;
  stderrSize: number;
  stdoutBase64: string;
  stderrBase64: string;
  aclChanges: Array<{ path: string; mechanism: 'low_integrity_label' | 'deny_ace'; applied: boolean; verified: boolean; rolledBack: boolean; error: string }>;
}

export interface NativeHelperErrorResult {
  schema_version: 1;
  type: 'error';
  requestId: string;
  error: string;
  message: string;
}

export type NativeHelperResponse = NativeHelperExecutionResult | NativeHelperErrorResult;

/** One cleanup-proof predicate shared by every helper consumer. */
export function hasCompleteHelperCleanupProof(result: NativeHelperExecutionResult): boolean {
  const hostJobOk = result.hostJob.childJobAssignmentVerified === true
    && (!result.hostJob.detected || result.hostJob.breakaway === 'explicit' || result.hostJob.breakaway === 'silent');
  const tokenOk = result.tokenAudit.verified === true
    && result.tokenAudit.isRestricted === true
    && result.tokenAudit.tokenType === 'primary'
    && result.tokenAudit.restrictedSidSetVerified === true
    && result.tokenAudit.userRestrictedSid === true
    && result.tokenAudit.worldRestrictedSid === true
    && result.tokenAudit.administratorsRestrictedSid === false
    && result.tokenAudit.restrictedSidCount >= 2
    && result.tokenAudit.integritySid === 'S-1-16-4096'
    && result.tokenAudit.integrityRid === 4096;
  const aclOk = result.aclChanges.every((change) => !change.applied || (change.verified && change.rolledBack));
  const hostJobSemanticsOk = result.hostJob.detected
    ? result.hostJob.breakaway === 'explicit' || result.hostJob.breakaway === 'silent'
    : result.hostJob.breakaway === 'none';
  return result.containmentVerified === true && result.inputDetached === true
    && hostJobOk && hostJobSemanticsOk && tokenOk && aclOk;
}

/** Reject permissive Node base64 decoding and bind declared byte counts. */
export function decodeNativeHelperBase64(value: string, expectedSize: number, label: string): Buffer {
  if (typeof value !== 'string' || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) {
    throw new Error(`${label} is not canonical base64`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length !== expectedSize || decoded.toString('base64') !== value) {
    throw new Error(`${label} byte count or canonical encoding mismatch`);
  }
  return decoded;
}

export function parseNativeHelperResponse(line: string, expectedRequestId: string): NativeHelperResponse {
  let value: unknown;
  try { value = JSON.parse(line); } catch (_error) { throw new Error('Helper response is not valid JSON'); }
  if (!value || typeof value !== 'object') throw new Error('Helper response is not an object');
  const response = value as Partial<NativeHelperResponse>;
  if (response.schema_version !== 1 || response.requestId !== expectedRequestId ||
      (response.type !== 'execution_result' && response.type !== 'error')) {
    throw new Error('Helper response envelope or request binding is invalid');
  }
  if (response.type === 'error') {
    if (!hasExactKeys(response as unknown as Record<string, unknown>, ['schema_version', 'type', 'requestId', 'error', 'message'])
      || typeof response.error !== 'string' || typeof response.message !== 'string') {
      throw new Error('Helper error response fields are invalid');
    }
    return response as NativeHelperErrorResult;
  }
  const result = response as Partial<NativeHelperExecutionResult>;
  const exactTopLevel = ['schema_version', 'type', 'requestId', 'status', 'exitCode', 'executionTimeMs',
    'timedOut', 'idleTimedOut', 'canceled', 'outputTruncated', 'containmentVerified', 'inputDetached',
    'hostJob', 'tokenAudit', 'stdoutSize', 'stderrSize', 'stdoutBase64', 'stderrBase64', 'aclChanges'];
  if (!hasExactKeys(response as unknown as Record<string, unknown>, exactTopLevel)
    || result.status !== 'completed'
    || typeof result.timedOut !== 'boolean' || typeof result.idleTimedOut !== 'boolean' || typeof result.canceled !== 'boolean'
    || typeof result.outputTruncated !== 'boolean' || typeof result.containmentVerified !== 'boolean'
    || typeof result.inputDetached !== 'boolean'
    || !Number.isSafeInteger(result.exitCode) || Number(result.exitCode) < 0 || Number(result.exitCode) > 0xFFFFFFFF
    || !isNonNegativeInteger(result.executionTimeMs) || !isNonNegativeInteger(result.stdoutSize) || !isNonNegativeInteger(result.stderrSize)
    || typeof result.stdoutBase64 !== 'string' || typeof result.stderrBase64 !== 'string'
    || !isRecord(result.hostJob) || !hasExactKeys(result.hostJob, ['detected', 'breakaway', 'limitFlags', 'childJobAssignmentVerified'])
    || typeof result.hostJob.detected !== 'boolean'
    || !['none', 'explicit', 'silent'].includes(String(result.hostJob.breakaway))
    || !isNonNegativeInteger(result.hostJob.limitFlags)
    || typeof result.hostJob.childJobAssignmentVerified !== 'boolean'
    || !isRecord(result.tokenAudit)
    || !hasExactKeys(result.tokenAudit, ['source', 'verified', 'isRestricted', 'tokenType', 'restrictedSidSetVerified',
      'userRestrictedSid', 'worldRestrictedSid', 'administratorsRestrictedSid', 'restrictedSidCount', 'integritySid', 'integrityRid'])
    || result.tokenAudit.source !== 'suspended_child_process_token'
    || typeof result.tokenAudit.verified !== 'boolean'
    || typeof result.tokenAudit.isRestricted !== 'boolean' || typeof result.tokenAudit.tokenType !== 'string'
    || typeof result.tokenAudit.restrictedSidSetVerified !== 'boolean'
    || typeof result.tokenAudit.userRestrictedSid !== 'boolean' || typeof result.tokenAudit.worldRestrictedSid !== 'boolean'
    || typeof result.tokenAudit.administratorsRestrictedSid !== 'boolean'
    || !isNonNegativeInteger(result.tokenAudit.restrictedSidCount)
    || typeof result.tokenAudit.integritySid !== 'string' || !/^S-1-16-[0-9]+$/.test(result.tokenAudit.integritySid)
    || !isNonNegativeInteger(result.tokenAudit.integrityRid)
    || !Array.isArray(result.aclChanges)
    || result.aclChanges.some((change) => !isRecord(change)
      || !hasExactKeys(change, ['path', 'mechanism', 'applied', 'verified', 'rolledBack', 'error'])
      || typeof change.path !== 'string' || change.path.length === 0
      || !['low_integrity_label', 'deny_ace'].includes(String(change.mechanism))
      || typeof change.applied !== 'boolean' || typeof change.verified !== 'boolean'
      || typeof change.rolledBack !== 'boolean' || typeof change.error !== 'string')) {
    throw new Error('Helper execution response fields are invalid');
  }
  decodeNativeHelperBase64(result.stdoutBase64!, result.stdoutSize!, 'stdoutBase64');
  decodeNativeHelperBase64(result.stderrBase64!, result.stderrSize!, 'stderrBase64');
  return response as NativeHelperResponse;
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function hasExactKeys(value: Record<string, unknown>, expected: string[]): boolean {
  const actual = Object.keys(value).sort();
  const canonical = [...expected].sort();
  return actual.length === canonical.length && actual.every((key, index) => key === canonical[index]);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

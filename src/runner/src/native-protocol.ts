export interface NativeHelperRequestV1 {
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

export interface NativeHelperRequestV2 {
  schemaVersion: 2;
  requestId: string;
  profileId: 'a9-trusted-shell-current-user-v1';
  executable: string;
  argv: string[];
  shellKind: 'cmd' | 'powershell' | 'bash';
  shellPath: string;
  shellVersion: string;
  shellIdentity: string;
  shellSource: 'automatic' | 'workspace_explicit';
  command: string;
  cwd: string;
  envOverlay: Record<string, string>;
  maxStdoutBytes: number;
  maxStderrBytes: number;
  managed: boolean;
  deadlineMode: 'none' | 'fixed';
  timeoutMs?: number;
  idleTimeoutMs?: number;
}

export type NativeHelperRequest = NativeHelperRequestV1 | NativeHelperRequestV2;

interface HostJobProof {
  detected: boolean;
  breakaway: 'none' | 'explicit' | 'silent';
  limitFlags: number;
  childJobAssignmentVerified: boolean;
}

interface CurrentUserTokenProof {
  source: 'suspended_child_process_token';
  verified: boolean;
  tokenMode: 'current_user';
  restrictedToken: false;
  tokenType: 'primary';
  sameUser: boolean;
  lowIntegrity: false;
  integritySid: string;
  integrityRid: number;
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
  hostJob: HostJobProof;
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

export interface NativeHelperStartedResultV2 {
  schemaVersion: 2;
  type: 'execution_started';
  requestId: string;
  profileId: 'a9-trusted-shell-current-user-v1';
  helperPid: number;
  childPid: number;
  ready: {
    childJobAssignmentVerified: boolean;
    inputDetached: boolean;
    stdoutCaptureReady: boolean;
    stderrCaptureReady: boolean;
  };
  tokenAudit: CurrentUserTokenProof;
}

export interface NativeHelperExecutionResultV2 {
  schemaVersion: 2;
  type: 'execution_result';
  requestId: string;
  profileId: 'a9-trusted-shell-current-user-v1';
  status: 'completed';
  exitCode: number;
  executionTimeMs: number;
  timedOut: boolean;
  idleTimedOut: boolean;
  canceled: boolean;
  outputTruncated: boolean;
  containmentVerified: boolean;
  inputDetached: boolean;
  cleanupConfirmed: boolean;
  workDirAclModified: false;
  hostJob: HostJobProof;
  tokenAudit: CurrentUserTokenProof;
  stdoutSize: number;
  stderrSize: number;
  stdoutBase64: string;
  stderrBase64: string;
}

export interface NativeHelperErrorResult {
  schema_version: 1;
  type: 'error';
  requestId: string;
  error: string;
  message: string;
}

export interface NativeHelperErrorResultV2 {
  schemaVersion: 2;
  type: 'error';
  requestId: string;
  error: string;
  message: string;
}

export type NativeHelperResponse = NativeHelperExecutionResult | NativeHelperErrorResult
  | NativeHelperExecutionResultV2 | NativeHelperErrorResultV2;
export type NativeHelperMessage = NativeHelperResponse | NativeHelperStartedResultV2;

/** One profile-aware cleanup-proof predicate shared by every helper consumer. */
export function hasCompleteHelperCleanupProof(
  result: NativeHelperExecutionResult | NativeHelperExecutionResultV2,
): boolean {
  const hostJobOk = result.hostJob.childJobAssignmentVerified === true
    && (!result.hostJob.detected || result.hostJob.breakaway === 'explicit' || result.hostJob.breakaway === 'silent');
  const hostJobSemanticsOk = result.hostJob.detected
    ? result.hostJob.breakaway === 'explicit' || result.hostJob.breakaway === 'silent'
    : result.hostJob.breakaway === 'none';
  if ('schemaVersion' in result) {
    const tokenOk = result.profileId === 'a9-trusted-shell-current-user-v1'
      && result.tokenAudit.verified === true
      && result.tokenAudit.tokenMode === 'current_user'
      && result.tokenAudit.restrictedToken === false
      && result.tokenAudit.tokenType === 'primary'
      && result.tokenAudit.sameUser === true
      && result.tokenAudit.lowIntegrity === false;
    return result.containmentVerified === true && result.inputDetached === true
      && result.cleanupConfirmed === true && result.workDirAclModified === false
      && hostJobOk && hostJobSemanticsOk && tokenOk;
  }
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

export function parseNativeHelperResponse(
  line: string,
  expectedRequestId: string,
  expectedSchemaVersion: 1 | 2 = 1,
): NativeHelperMessage {
  let value: unknown;
  try { value = JSON.parse(line); } catch (_error) { throw new Error('Helper response is not valid JSON'); }
  if (!isRecord(value)) throw new Error('Helper response is not an object');
  return expectedSchemaVersion === 2
    ? parseV2(value, expectedRequestId)
    : parseV1(value, expectedRequestId);
}

function parseV2(value: Record<string, unknown>, expectedRequestId: string): NativeHelperMessage {
  if (value.schemaVersion !== 2 || value.requestId !== expectedRequestId
    || !['execution_started', 'execution_result', 'error'].includes(String(value.type))) {
    throw new Error('Helper v2 envelope or request binding is invalid');
  }
  if (value.type === 'error') {
    if (!hasExactKeys(value, ['schemaVersion', 'type', 'requestId', 'error', 'message'])
      || typeof value.error !== 'string' || typeof value.message !== 'string') {
      throw new Error('Helper v2 error fields are invalid');
    }
    return value as unknown as NativeHelperErrorResultV2;
  }
  if (value.type === 'execution_started') {
    if (!hasExactKeys(value, ['schemaVersion', 'type', 'requestId', 'profileId', 'helperPid', 'childPid', 'ready', 'tokenAudit'])
      || value.profileId !== 'a9-trusted-shell-current-user-v1'
      || !isPositiveInteger(value.helperPid) || !isPositiveInteger(value.childPid)
      || !isRecord(value.ready)
      || !hasExactKeys(value.ready, ['childJobAssignmentVerified', 'inputDetached', 'stdoutCaptureReady', 'stderrCaptureReady'])
      || Object.values(value.ready).some((item) => item !== true)
      || !isCurrentUserTokenProof(value.tokenAudit)) {
      throw new Error('Helper v2 readiness proof is invalid');
    }
    return value as unknown as NativeHelperStartedResultV2;
  }
  const exact = ['schemaVersion', 'type', 'requestId', 'profileId', 'status', 'exitCode', 'executionTimeMs',
    'timedOut', 'idleTimedOut', 'canceled', 'outputTruncated', 'containmentVerified', 'inputDetached',
    'cleanupConfirmed', 'workDirAclModified', 'hostJob', 'tokenAudit', 'stdoutSize', 'stderrSize',
    'stdoutBase64', 'stderrBase64'];
  if (!hasExactKeys(value, exact) || value.profileId !== 'a9-trusted-shell-current-user-v1'
    || value.status !== 'completed' || !isUInt32(value.exitCode)
    || !isNonNegativeInteger(value.executionTimeMs) || !isNonNegativeInteger(value.stdoutSize)
    || !isNonNegativeInteger(value.stderrSize)
    || ['timedOut', 'idleTimedOut', 'canceled', 'outputTruncated', 'containmentVerified',
      'inputDetached', 'cleanupConfirmed'].some((key) => typeof value[key] !== 'boolean')
    || value.workDirAclModified !== false || !isHostJobProof(value.hostJob)
    || !isCurrentUserTokenProof(value.tokenAudit)
    || typeof value.stdoutBase64 !== 'string' || typeof value.stderrBase64 !== 'string') {
    throw new Error('Helper v2 execution response fields are invalid');
  }
  decodeNativeHelperBase64(value.stdoutBase64, value.stdoutSize as number, 'stdoutBase64');
  decodeNativeHelperBase64(value.stderrBase64, value.stderrSize as number, 'stderrBase64');
  return value as unknown as NativeHelperExecutionResultV2;
}

function parseV1(value: Record<string, unknown>, expectedRequestId: string): NativeHelperResponse {
  if (value.schema_version !== 1 || value.requestId !== expectedRequestId
    || (value.type !== 'execution_result' && value.type !== 'error')) {
    throw new Error('Helper response envelope or request binding is invalid');
  }
  if (value.type === 'error') {
    if (!hasExactKeys(value, ['schema_version', 'type', 'requestId', 'error', 'message'])
      || typeof value.error !== 'string' || typeof value.message !== 'string') {
      throw new Error('Helper error response fields are invalid');
    }
    return value as unknown as NativeHelperErrorResult;
  }
  const exact = ['schema_version', 'type', 'requestId', 'status', 'exitCode', 'executionTimeMs',
    'timedOut', 'idleTimedOut', 'canceled', 'outputTruncated', 'containmentVerified', 'inputDetached',
    'hostJob', 'tokenAudit', 'stdoutSize', 'stderrSize', 'stdoutBase64', 'stderrBase64', 'aclChanges'];
  if (!hasExactKeys(value, exact) || value.status !== 'completed' || !isUInt32(value.exitCode)
    || !isNonNegativeInteger(value.executionTimeMs) || !isNonNegativeInteger(value.stdoutSize)
    || !isNonNegativeInteger(value.stderrSize)
    || ['timedOut', 'idleTimedOut', 'canceled', 'outputTruncated', 'containmentVerified', 'inputDetached']
      .some((key) => typeof value[key] !== 'boolean')
    || !isHostJobProof(value.hostJob) || !isRecord(value.tokenAudit)
    || !hasExactKeys(value.tokenAudit, ['source', 'verified', 'isRestricted', 'tokenType', 'restrictedSidSetVerified',
      'userRestrictedSid', 'worldRestrictedSid', 'administratorsRestrictedSid', 'restrictedSidCount', 'integritySid', 'integrityRid'])
    || value.tokenAudit.source !== 'suspended_child_process_token'
    || ['verified', 'isRestricted', 'restrictedSidSetVerified', 'userRestrictedSid', 'worldRestrictedSid',
      'administratorsRestrictedSid'].some((key) => typeof (value.tokenAudit as Record<string, unknown>)[key] !== 'boolean')
    || typeof value.tokenAudit.tokenType !== 'string' || !isNonNegativeInteger(value.tokenAudit.restrictedSidCount)
    || typeof value.tokenAudit.integritySid !== 'string' || !/^S-1-16-[0-9]+$/.test(value.tokenAudit.integritySid)
    || !isNonNegativeInteger(value.tokenAudit.integrityRid) || !Array.isArray(value.aclChanges)
    || value.aclChanges.some((change) => !isRecord(change)
      || !hasExactKeys(change, ['path', 'mechanism', 'applied', 'verified', 'rolledBack', 'error'])
      || typeof change.path !== 'string' || change.path.length === 0
      || !['low_integrity_label', 'deny_ace'].includes(String(change.mechanism))
      || typeof change.applied !== 'boolean' || typeof change.verified !== 'boolean'
      || typeof change.rolledBack !== 'boolean' || typeof change.error !== 'string')
    || typeof value.stdoutBase64 !== 'string' || typeof value.stderrBase64 !== 'string') {
    throw new Error('Helper execution response fields are invalid');
  }
  decodeNativeHelperBase64(value.stdoutBase64, value.stdoutSize as number, 'stdoutBase64');
  decodeNativeHelperBase64(value.stderrBase64, value.stderrSize as number, 'stderrBase64');
  return value as unknown as NativeHelperExecutionResult;
}

function isCurrentUserTokenProof(value: unknown): value is CurrentUserTokenProof {
  return isRecord(value)
    && hasExactKeys(value, ['source', 'verified', 'tokenMode', 'restrictedToken', 'tokenType', 'sameUser', 'lowIntegrity', 'integritySid', 'integrityRid'])
    && value.source === 'suspended_child_process_token' && value.verified === true
    && value.tokenMode === 'current_user' && value.restrictedToken === false
    && value.tokenType === 'primary' && value.sameUser === true && value.lowIntegrity === false
    && typeof value.integritySid === 'string' && /^S-1-16-[0-9]+$/.test(value.integritySid)
    && isNonNegativeInteger(value.integrityRid) && value.integrityRid > 4096;
}

function isHostJobProof(value: unknown): value is HostJobProof {
  return isRecord(value) && hasExactKeys(value, ['detected', 'breakaway', 'limitFlags', 'childJobAssignmentVerified'])
    && typeof value.detected === 'boolean' && ['none', 'explicit', 'silent'].includes(String(value.breakaway))
    && isNonNegativeInteger(value.limitFlags) && typeof value.childJobAssignmentVerified === 'boolean';
}

function isUInt32(value: unknown): value is number {
  return isNonNegativeInteger(value) && value <= 0xFFFFFFFF;
}

function isPositiveInteger(value: unknown): value is number {
  return isNonNegativeInteger(value) && value > 0;
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

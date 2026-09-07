/// <reference types="node" />
/// <reference types="node" />
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
    aclPolicy?: {
        acceptanceRoot: string;
        perRunRoot: string;
    };
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
    aclChanges: Array<{
        path: string;
        mechanism: 'low_integrity_label' | 'deny_ace';
        applied: boolean;
        verified: boolean;
        rolledBack: boolean;
        error: string;
    }>;
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
export type NativeHelperResponse = NativeHelperExecutionResult | NativeHelperErrorResult | NativeHelperExecutionResultV2 | NativeHelperErrorResultV2;
export type NativeHelperMessage = NativeHelperResponse | NativeHelperStartedResultV2;
/** One profile-aware cleanup-proof predicate shared by every helper consumer. */
export declare function hasCompleteHelperCleanupProof(result: NativeHelperExecutionResult | NativeHelperExecutionResultV2): boolean;
/** Reject permissive Node base64 decoding and bind declared byte counts. */
export declare function decodeNativeHelperBase64(value: string, expectedSize: number, label: string): Buffer;
export declare function parseNativeHelperResponse(line: string, expectedRequestId: string, expectedSchemaVersion?: 1 | 2): NativeHelperMessage;
export {};
//# sourceMappingURL=native-protocol.d.ts.map
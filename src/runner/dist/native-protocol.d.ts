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
    aclPolicy?: {
        acceptanceRoot: string;
        perRunRoot: string;
    };
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
    aclChanges: Array<{
        applied: boolean;
        verified: boolean;
        rolledBack: boolean;
        error: string;
    }>;
}
export interface NativeHelperErrorResult {
    schema_version: 1;
    type: 'error';
    requestId: string;
    error: string;
    message: string;
}
export type NativeHelperResponse = NativeHelperExecutionResult | NativeHelperErrorResult;
export declare function parseNativeHelperResponse(line: string, expectedRequestId: string): NativeHelperResponse;
//# sourceMappingURL=native-protocol.d.ts.map
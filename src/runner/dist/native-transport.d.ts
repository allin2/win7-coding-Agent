/// <reference types="node" />
/// <reference types="node" />
import { NativeHelperRequest, NativeHelperResponse, NativeHelperStartedResultV2 } from './native-protocol';
export type HelperTransportResult = {
    kind: 'response';
    response: NativeHelperResponse;
} | {
    kind: 'spawn_failed' | 'helper_crashed' | 'cancelled' | 'watchdog_timeout';
    detail: string;
    cleanupConfirmed: boolean;
};
export interface HelperTransport {
    invoke(request: NativeHelperRequest, signal?: AbortSignal, environment?: NodeJS.ProcessEnv): Promise<HelperTransportResult>;
    startManaged?(request: NativeHelperRequest, environment?: NodeJS.ProcessEnv): ManagedHelperInvocation;
}
export interface ManagedHelperInvocation {
    /** Helper PID is diagnostic only; managed process identity comes from ready.childPid. */
    pid?: number;
    ready: Promise<NativeHelperStartedResultV2>;
    completion: Promise<HelperTransportResult>;
    cancel(): void;
}
/** One request per helper process. No shell and no inherited stdio. */
export declare class StdioHelperTransport implements HelperTransport {
    private readonly helperPath;
    private readonly protocolOutputLimit;
    private readonly startupTimeoutMs;
    constructor(helperPath: string, protocolOutputLimit?: number, startupTimeoutMs?: number);
    invoke(request: NativeHelperRequest, signal?: AbortSignal, environment?: NodeJS.ProcessEnv): Promise<HelperTransportResult>;
    startManaged(request: NativeHelperRequest, environment?: NodeJS.ProcessEnv): ManagedHelperInvocation;
    private invokeInternal;
}
//# sourceMappingURL=native-transport.d.ts.map
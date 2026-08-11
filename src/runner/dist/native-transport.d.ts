/// <reference types="node" />
import { NativeHelperRequest, NativeHelperResponse } from './native-protocol';
export type HelperTransportResult = {
    kind: 'response';
    response: NativeHelperResponse;
} | {
    kind: 'spawn_failed' | 'helper_crashed' | 'cancelled' | 'watchdog_timeout';
    detail: string;
    cleanupConfirmed: boolean;
};
export interface HelperTransport {
    invoke(request: NativeHelperRequest, signal?: AbortSignal): Promise<HelperTransportResult>;
}
/** One request per helper process. No shell and no inherited stdio. */
export declare class StdioHelperTransport implements HelperTransport {
    private readonly helperPath;
    private readonly protocolOutputLimit;
    constructor(helperPath: string, protocolOutputLimit?: number);
    invoke(request: NativeHelperRequest, signal?: AbortSignal): Promise<HelperTransportResult>;
}
//# sourceMappingURL=native-transport.d.ts.map
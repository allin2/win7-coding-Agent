import { ApprovalLedger } from './approval';
import { ExecutableProfileRegistry } from './profiles';
import { HelperTransport } from './native-transport';
import { IRunner } from './runner';
import { RunRequest, RunResult } from './types';
export type RunnerEventKind = 'runner.started' | 'runner.stdout' | 'runner.stderr' | 'runner.truncated' | 'runner.finished';
export interface RunnerEvent {
    kind: RunnerEventKind;
    requestId: string;
    timestamp: string;
    data: Record<string, unknown>;
}
export interface NativeRunnerOptions {
    registry: ExecutableProfileRegistry;
    transport: HelperTransport;
    approvalLedger?: ApprovalLedger;
    onEvent?: (event: RunnerEvent) => void;
}
export declare class NativeRunner implements IRunner {
    private readonly options;
    constructor(options: NativeRunnerOptions);
    execute(request: RunRequest): Promise<RunResult>;
    private validateApproval;
    private executionResult;
    private transportFailure;
    private emit;
}
//# sourceMappingURL=native-runner.d.ts.map
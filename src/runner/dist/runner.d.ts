/**
 * Runner boundary contracts and deterministic implementations used before the
 * SPIKE_02 native helper is available. No implementation in this file starts a
 * process; production execution remains fail-closed.
 */
import { RunRequest, RunResult, RunStatus } from './types';
import { ApprovalLedger } from './approval';
export declare function findProhibitedShellHost(command: string): string | null;
/** Only harness/programming defects may reject this promise. */
export interface IRunner {
    execute(request: RunRequest): Promise<RunResult>;
}
export interface MockRunnerConfig {
    defaultExitCode?: number;
    defaultStdout?: string;
    defaultStderr?: string;
    mockDurationMs?: number;
    simulateStatus?: Extract<RunStatus, 'timeout' | 'idle_timeout' | 'cancelled' | 'spawn_failed' | 'cleanup_failed'>;
    approvalLedger?: ApprovalLedger;
}
/**
 * Deterministic runner for tests and explicit simulations. It mirrors the
 * execution boundary validation and result envelope of the eventual native
 * Runner but deliberately never invokes child_process.
 */
export declare class MockRunner implements IRunner {
    private readonly config;
    private readonly approvalLedger?;
    constructor(config?: MockRunnerConfig);
    execute(request: RunRequest): Promise<RunResult>;
}
/** Production placeholder until SPIKE_02 validates the native containment helper. */
export declare class UnavailableRunner implements IRunner {
    execute(_request: RunRequest): Promise<RunResult>;
}
//# sourceMappingURL=runner.d.ts.map
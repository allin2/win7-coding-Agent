/**
 * @module runner
 * @description Runner 模块公共 API 导出入口
 * @remarks 统一导出 Runner 接口、Mock 实现、审批逻辑和 Containment 探测
 */
export { RunResult, RunStatus, CapturedStream, RunnerFailure, RunnerConfig, RunRequest, ContainmentStatus, ApprovalExecutionBinding, RunnerError, RunnerErrorCode, } from './types';
export { OutputCapture, captureText, captureBytes, StreamEncoding } from './output';
export { IRunner, MockRunner, UnavailableRunner, MockRunnerConfig, findProhibitedShellHost, validateRequest, } from './runner';
export { ExecutableProfile, ResolvedExecutableProfile, ExecutableProfileRegistry, ProfileResolutionError, } from './profiles';
export { NativeHelperRequest, NativeHelperResponse, NativeHelperExecutionResult, NativeHelperErrorResult, parseNativeHelperResponse, } from './native-protocol';
export { HelperTransport, HelperTransportResult, StdioHelperTransport } from './native-transport';
export { NativeRunner, NativeRunnerOptions, RunnerEvent, RunnerEventKind } from './native-runner';
export { ApprovalResult, ApprovalGrant, ApprovalRecord, ApprovalValidation, ApprovalLedger, buildRunApprovalRequest, fingerprintApprovalRequest, checkApproval, } from './approval';
export { IContainmentProbe, MockContainmentProbe, MockContainmentConfig, } from './containment';
export { TrustedShellRequest, TrustedShellResult, TrustedShellRunner, } from './trusted-shell-runner';
export { ShellKind, DetectedShell, ShellDetectionOptions, detectSystemShells, getActiveShell, } from './shell-detection';
export { BackgroundProcessHandle, PollResult, BackgroundProcessManager, } from './background-process-manager';
export { killProcessTree, } from './process-cleanup';
//# sourceMappingURL=index.d.ts.map
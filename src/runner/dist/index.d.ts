/**
 * @module runner
 * @description Runner 模块公共 API 导出入口
 * @remarks 统一导出 Runner 接口、Mock 实现、审批逻辑和 Containment 探测
 */
export { RunResult, RunStatus, CapturedStream, RunnerFailure, RunnerConfig, RunRequest, ContainmentStatus, ApprovalExecutionBinding, RunnerError, RunnerErrorCode, } from './types';
export { OutputCapture, captureText } from './output';
export { IRunner, MockRunner, UnavailableRunner, MockRunnerConfig, findProhibitedShellHost, } from './runner';
export { ApprovalResult, ApprovalGrant, ApprovalRecord, ApprovalValidation, ApprovalLedger, buildRunApprovalRequest, fingerprintApprovalRequest, checkApproval, } from './approval';
export { IContainmentProbe, MockContainmentProbe, MockContainmentConfig, } from './containment';
//# sourceMappingURL=index.d.ts.map
/**
 * @module runner
 * @description Runner 模块公共 API 导出入口
 * @remarks 统一导出 Runner 接口、Mock 实现、审批逻辑和 Containment 探测
 */
export { RunResult, RunnerConfig, RunRequest, ContainmentStatus, } from './types';
export { IRunner, MockRunner, MockRunnerConfig, findShellMetaChar, } from './runner';
export { ApprovalResult, checkApproval, } from './approval';
export { IContainmentProbe, MockContainmentProbe, MockContainmentConfig, } from './containment';
//# sourceMappingURL=index.d.ts.map
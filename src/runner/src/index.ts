/**
 * @module runner
 * @description Runner 模块公共 API 导出入口
 * @remarks 统一导出 Runner 接口、Mock 实现、审批逻辑和 Containment 探测
 */

// 类型定义
export {
  RunResult,
  RunStatus,
  CapturedStream,
  RunnerFailure,
  RunnerConfig,
  RunRequest,
  ContainmentStatus,
  ApprovalExecutionBinding,
  RunnerError,
  RunnerErrorCode,
} from './types';

export { OutputCapture, captureText } from './output';

// Runner 接口与 Mock 实现
export {
  IRunner,
  MockRunner,
  UnavailableRunner,
  MockRunnerConfig,
  findProhibitedShellHost,
} from './runner';

// 审批逻辑
export {
  ApprovalResult,
  ApprovalGrant,
  ApprovalRecord,
  ApprovalValidation,
  ApprovalLedger,
  buildRunApprovalRequest,
  fingerprintApprovalRequest,
  checkApproval,
} from './approval';

// Containment 探测
export {
  IContainmentProbe,
  MockContainmentProbe,
  MockContainmentConfig,
} from './containment';

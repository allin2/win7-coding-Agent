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

export { OutputCapture, captureText, captureBytes, StreamEncoding } from './output';

// Runner 接口与 Mock 实现
export {
  IRunner,
  MockRunner,
  UnavailableRunner,
  MockRunnerConfig,
  findProhibitedShellHost,
  validateRequest,
} from './runner';

export {
  ExecutableProfile,
  ResolvedExecutableProfile,
  ExecutableProfileRegistry,
  ProfileResolutionError,
} from './profiles';
export {
  NativeHelperRequest,
  NativeHelperResponse,
  NativeHelperExecutionResult,
  NativeHelperErrorResult,
  parseNativeHelperResponse,
} from './native-protocol';
export { HelperTransport, HelperTransportResult, StdioHelperTransport } from './native-transport';
export { NativeRunner, NativeRunnerOptions, RunnerEvent, RunnerEventKind } from './native-runner';

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

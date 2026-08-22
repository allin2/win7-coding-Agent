/**
 * @module git-adapter
 * @description Git Adapter 模块公共 API 导出入口
 * @remarks 统一导出 Git 适配器、白名单验证和隔离配置
 */

// 类型定义
export {
  GitCommandCategory,
  GitCommandDef,
  GitResult,
  GitRequest,
  GitApprovalBinding,
  GitRunnerRequest,
  GitRunnerResult,
  GitRunnerPort,
  GitAdapterError,
  GitAdapterErrorCode,
  GitSessionBaseline,
  GitSessionInspection,
  GitTrackedRollbackResult,
} from './types';

// 白名单验证
export {
  WhitelistResult,
  validateWhitelist,
  findCommandDef,
  getCommandCategory,
} from './whitelist';

// 隔离配置
export {
  buildIsolatedEnv,
  buildIsolatedArgs,
  getIsolationConfig,
} from './isolation';

// Git 适配器
export {
  GitAdapter,
  GitAdapterConfig,
} from './adapter';

export { GitSessionGuard } from './session';

// A9 Trusted Git 投影
export {
  TrustedGitProjection,
  TrustedGitStatusEntry,
  TrustedGitExternalMechanism,
  projectTrustedGit,
  detectExternalMechanisms,
} from './trusted-projection';

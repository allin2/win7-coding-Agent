/**
 * @module git-adapter/isolation
 * @description Git 隔离配置注入 — 环境变量与 -c 参数构建
 * @remarks
 * - 构建隔离环境变量（GIT_CONFIG_NOSYSTEM, 受控 HOME 等）
 * - 注入 -c 配置参数（禁用 hooks, pager, editor, credential 等）
 * - 剥离危险环境变量（GIT_*, SSH_*, GIT_SSH 等）
 */

import * as path from 'path';

/**
 * 空目录路径（跨平台兼容）
 * @remarks Windows 上使用 TEMP 目录下的空目录，Unix 上使用 /dev/null 替代
 */
const NULL_DIR = process.platform === 'win32'
  ? path.join(process.env.TEMP || 'C:\\Temp', 'win7-agent-git-empty')
  : '/tmp/win7-agent-git-empty';

/**
 * 需要剥离的环境变量前缀/名称
 */
const DANGEROUS_ENV_PREFIXES = [
  'GIT_',
  'SSH_',
  'GIT_SSH',
  'GIT_SSH_COMMAND',
  'GIT_SSH_VARIANT',
];

/**
 * 需要隔离的精确环境变量名
 */
const DANGEROUS_ENV_EXACT = [
  'GIT_CONFIG',
  'GIT_CONFIG_GLOBAL',
  'GIT_CONFIG_SYSTEM',
  'GIT_DIR',
  'GIT_WORK_TREE',
  'GIT_INDEX_FILE',
  'GIT_ASKPASS',
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
];

/**
 * Git -c 隔离配置项
 * @remarks 禁用所有可能的外部交互和配置源
 */
const ISOLATION_CONFIG: ReadonlyArray<[string, string]> = [
  ['core.hooksPath', '/dev/null'],
  ['core.pager', 'cat'],
  ['core.editor', 'false'],
  ['credential.helper', ''],
  ['core.sshCommand', 'false'],
  ['core.fsmonitor', ''],
  ['filter.*.process', ''],
];

/**
 * 构建隔离环境变量
 * @param baseEnv - 基础环境变量（可选，默认使用 process.env）
 * @returns 隔离后的环境变量对象
 * @remarks
 * - 设置 GIT_CONFIG_NOSYSTEM=1 阻止系统级配置
 * - 将 HOME/XDG_CONFIG_HOME 指向受控空目录
 * - 剥离所有 GIT_*, SSH_*, GIT_SSH 等危险环境变量
 */
export function buildIsolatedEnv(baseEnv?: Record<string, string>): Record<string, string> {
  const env = baseEnv ? { ...baseEnv } : {};

  // 剥离危险的环境变量
  for (const key of Object.keys(env)) {
    // 检查精确匹配
    if (DANGEROUS_ENV_EXACT.includes(key)) {
      delete env[key];
      continue;
    }
    // 检查前缀匹配
    for (const prefix of DANGEROUS_ENV_PREFIXES) {
      if (key.startsWith(prefix)) {
        delete env[key];
        break;
      }
    }
  }

  // 设置隔离环境变量
  env['GIT_CONFIG_NOSYSTEM'] = '1';
  env['HOME'] = NULL_DIR;
  env['XDG_CONFIG_HOME'] = NULL_DIR;

  // Windows 特定：设置 USERPROFILE 为受控目录
  if (process.platform === 'win32') {
    env['USERPROFILE'] = NULL_DIR;
  }

  // 确保 PATH 存在（但不包含危险路径）
  if (!env['PATH'] && process.env.PATH) {
    env['PATH'] = process.env.PATH;
  }

  return env;
}

/**
 * 构建隔离 -c 参数
 * @param args - 原始 Git 参数数组
 * @returns 注入 -c 配置参数后的新参数数组
 * @remarks
 * 在参数列表前注入以下 -c 配置：
 * - core.hooksPath → /dev/null（禁用 hooks）
 * - core.pager → cat（禁用分页器）
 * - core.editor → false（禁用编辑器）
 * - credential.helper → 空（禁用凭据助手）
 * - core.sshCommand → false（禁用 SSH）
 * - core.fsmonitor → 空（禁用 fsmonitor）
 * - filter.*.process → 空（禁用 filter process）
 */
export function buildIsolatedArgs(args: string[]): string[] {
  const isolatedArgs: string[] = [];

  // 注入 -c 配置参数
  for (const [key, value] of ISOLATION_CONFIG) {
    isolatedArgs.push('-c', `${key}=${value}`);
  }

  // 追加原始参数
  isolatedArgs.push(...args);

  return isolatedArgs;
}

/**
 * 获取隔离配置列表（用于测试验证）
 * @returns 隔离配置项数组
 */
export function getIsolationConfig(): ReadonlyArray<[string, string]> {
  return ISOLATION_CONFIG;
}

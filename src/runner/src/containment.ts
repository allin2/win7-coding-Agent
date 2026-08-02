/**
 * @module runner/containment
 * @description Containment 探测接口与 Mock 实现
 * @remarks
 * - IContainmentProbe 接口定义进程隔离探测契约
 * - MockContainmentProbe 用于测试和非 Windows 环境
 * - fail-closed 逻辑：探测失败时拒绝高风险命令
 */

import { ContainmentStatus } from './types';

/**
 * IContainmentProbe 接口 — 进程隔离探测
 * @remarks
 * 在 Windows 上通过 IsProcessInJob API 检测进程是否在 Job Object 中。
 * 在非 Windows 环境或测试环境中使用 Mock 实现。
 */
export interface IContainmentProbe {
  /**
   * 探测当前进程的 containment 状态
   * @returns Containment 状态
   * @remarks fail-closed：探测失败时应返回 available=false
   */
  probeContainment(): Promise<ContainmentStatus>;

  /**
   * 判断是否允许执行高风险命令
   * @remarks fail-closed 逻辑：探测失败或 containment 不可用时拒绝
   * @returns 是否允许执行
   */
  isHighRiskAllowed(): Promise<boolean>;
}

/**
 * MockContainmentProbe 配置
 */
export interface MockContainmentConfig {
  /** Containment 是否可用 */
  available?: boolean;
  /** 进程是否在 Job Object 中 */
  inJob?: boolean;
  /** 进程是否受限 */
  restricted?: boolean;
  /** 不可用原因 */
  reason?: string;
  /** 是否模拟探测失败 */
  simulateFailure?: boolean;
}

/**
 * MockContainmentProbe — IContainmentProbe 的模拟实现
 * @remarks 用于测试和非 Windows 环境，默认 fail-closed
 */
export class MockContainmentProbe implements IContainmentProbe {
  private readonly config: MockContainmentConfig;

  /**
   * 创建 MockContainmentProbe 实例
   * @param config - Mock 行为配置（默认 fail-closed）
   */
  constructor(config: MockContainmentConfig = {}) {
    this.config = {
      available: config.available ?? false,
      inJob: config.inJob ?? false,
      restricted: config.restricted ?? false,
      reason: config.reason ?? 'Mock containment probe — not running on Windows',
      simulateFailure: config.simulateFailure ?? false,
    };
  }

  /**
   * 模拟 containment 探测
   * @returns Containment 状态
   * @remarks 当 simulateFailure=true 时返回 available=false（fail-closed）
   */
  async probeContainment(): Promise<ContainmentStatus> {
    // 模拟探测失败（fail-closed）
    if (this.config.simulateFailure) {
      return {
        available: false,
        inJob: false,
        restricted: false,
        reason: 'Containment probe failed — fail-closed policy applied',
      };
    }

    return {
      available: this.config.available!,
      inJob: this.config.inJob!,
      restricted: this.config.restricted!,
      reason: this.config.reason,
    };
  }

  /**
   * 判断是否允许执行高风险命令
   * @remarks
   * fail-closed 逻辑：
   * - 探测失败 → 拒绝
   * - containment 不可用 → 拒绝
   * - 进程不在 Job Object 中 → 拒绝
   * - 进程未受限 → 拒绝
   */
  async isHighRiskAllowed(): Promise<boolean> {
    const status = await this.probeContainment();

    // fail-closed: 任何条件不满足都拒绝
    if (!status.available) {
      return false;
    }
    if (!status.inJob) {
      return false;
    }
    if (!status.restricted) {
      return false;
    }

    return true;
  }
}

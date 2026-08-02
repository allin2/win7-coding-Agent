"use strict";
/**
 * @module runner/containment
 * @description Containment 探测接口与 Mock 实现
 * @remarks
 * - IContainmentProbe 接口定义进程隔离探测契约
 * - MockContainmentProbe 用于测试和非 Windows 环境
 * - fail-closed 逻辑：探测失败时拒绝高风险命令
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MockContainmentProbe = void 0;
/**
 * MockContainmentProbe — IContainmentProbe 的模拟实现
 * @remarks 用于测试和非 Windows 环境，默认 fail-closed
 */
class MockContainmentProbe {
    /**
     * 创建 MockContainmentProbe 实例
     * @param config - Mock 行为配置（默认 fail-closed）
     */
    constructor(config = {}) {
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
    async probeContainment() {
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
            available: this.config.available,
            inJob: this.config.inJob,
            restricted: this.config.restricted,
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
    async isHighRiskAllowed() {
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
exports.MockContainmentProbe = MockContainmentProbe;
//# sourceMappingURL=containment.js.map
/**
 * @module containment.test
 * @description Containment 探测测试 — fail-closed 逻辑、Mock 实现
 */

import { MockContainmentProbe } from '../src/containment';

describe('MockContainmentProbe', () => {
  describe('probeContainment()', () => {
    it('默认 fail-closed: available=false', async () => {
      const probe = new MockContainmentProbe();
      const status = await probe.probeContainment();
      expect(status.available).toBe(false);
      expect(status.inJob).toBe(false);
      expect(status.restricted).toBe(false);
    });

    it('可配置为可用状态', async () => {
      const probe = new MockContainmentProbe({
        available: true,
        inJob: true,
        restricted: true,
      });
      const status = await probe.probeContainment();
      expect(status.available).toBe(true);
      expect(status.inJob).toBe(true);
      expect(status.restricted).toBe(true);
    });

    it('simulateFailure 时返回 available=false', async () => {
      const probe = new MockContainmentProbe({
        available: true,
        simulateFailure: true,
      });
      const status = await probe.probeContainment();
      expect(status.available).toBe(false);
      expect(status.reason).toContain('fail-closed');
    });

    it('自定义 reason', async () => {
      const probe = new MockContainmentProbe({ reason: 'custom reason' });
      const status = await probe.probeContainment();
      expect(status.reason).toBe('custom reason');
    });
  });

  describe('isHighRiskAllowed()', () => {
    it('默认 fail-closed: 拒绝高风险', async () => {
      const probe = new MockContainmentProbe();
      const allowed = await probe.isHighRiskAllowed();
      expect(allowed).toBe(false);
    });

    it('containment 不可用时拒绝', async () => {
      const probe = new MockContainmentProbe({ available: false, inJob: true, restricted: true });
      const allowed = await probe.isHighRiskAllowed();
      expect(allowed).toBe(false);
    });

    it('不在 Job Object 中时拒绝', async () => {
      const probe = new MockContainmentProbe({ available: true, inJob: false, restricted: true });
      const allowed = await probe.isHighRiskAllowed();
      expect(allowed).toBe(false);
    });

    it('未受限时拒绝', async () => {
      const probe = new MockContainmentProbe({ available: true, inJob: true, restricted: false });
      const allowed = await probe.isHighRiskAllowed();
      expect(allowed).toBe(false);
    });

    it('所有条件满足时允许', async () => {
      const probe = new MockContainmentProbe({
        available: true,
        inJob: true,
        restricted: true,
      });
      const allowed = await probe.isHighRiskAllowed();
      expect(allowed).toBe(true);
    });

    it('探测失败时拒绝', async () => {
      const probe = new MockContainmentProbe({ simulateFailure: true });
      const allowed = await probe.isHighRiskAllowed();
      expect(allowed).toBe(false);
    });
  });
});

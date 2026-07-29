/**
 * @module concurrency.test
 * @description 并发配额管理测试 — 获取/释放/超限排队/写锁串行
 */

import { ConcurrencyManager } from '../src/concurrency';
import { AgentError, AgentErrorCode } from '../src/errors';

describe('ConcurrencyManager', () => {
  describe('acquire() / release()', () => {
    it('获取执行槽成功（未超限）', () => {
      const mgr = new ConcurrencyManager(2);
      const result = mgr.acquire('task-1');
      expect(result.granted).toBe(true);
    });

    it('达到上限后排队', () => {
      const mgr = new ConcurrencyManager(2);
      mgr.acquire('task-1');
      mgr.acquire('task-2');
      const result = mgr.acquire('task-3');
      expect(result.granted).toBe(false);
      expect(result.position).toBe(0);
    });

    it('排队任务按 FIFO 顺序', () => {
      const mgr = new ConcurrencyManager(1);
      mgr.acquire('task-1');
      const r2 = mgr.acquire('task-2');
      const r3 = mgr.acquire('task-3');
      expect(r2.position).toBe(0);
      expect(r3.position).toBe(1);
    });

    it('释放后自动提升队列首个任务', () => {
      const mgr = new ConcurrencyManager(1);
      mgr.acquire('task-1');
      mgr.acquire('task-2');
      mgr.acquire('task-3');

      mgr.release('task-1');
      const usage = mgr.getUsage();
      expect(usage.active).toBe(1);
      expect(usage.queue).toEqual(['task-3']);
      // task-2 应已被提升为活跃
    });

    it('重复 acquire 同一任务幂等', () => {
      const mgr = new ConcurrencyManager(2);
      const r1 = mgr.acquire('task-1');
      const r2 = mgr.acquire('task-1');
      expect(r1.granted).toBe(true);
      expect(r2.granted).toBe(true);
      expect(mgr.getUsage().active).toBe(1);
    });

    it('释放不存在的任务不报错', () => {
      const mgr = new ConcurrencyManager(2);
      expect(() => mgr.release('nonexistent')).not.toThrow();
    });
  });

  describe('getUsage()', () => {
    it('返回正确的使用量快照', () => {
      const mgr = new ConcurrencyManager(3);
      mgr.acquire('task-1');
      mgr.acquire('task-2');
      mgr.acquire('task-3');
      mgr.acquire('task-4'); // 排队

      const usage = mgr.getUsage();
      expect(usage.active).toBe(3);
      expect(usage.limit).toBe(3);
      expect(usage.queue).toEqual(['task-4']);
    });

    it('空状态返回零', () => {
      const mgr = new ConcurrencyManager(2);
      const usage = mgr.getUsage();
      expect(usage.active).toBe(0);
      expect(usage.limit).toBe(2);
      expect(usage.queue).toEqual([]);
    });
  });

  describe('acquireWriteLock() / releaseWriteLock()', () => {
    it('获取写锁成功', () => {
      const mgr = new ConcurrencyManager(2);
      const result = mgr.acquireWriteLock('/workspace', 'task-1');
      expect(result).toBe(true);
    });

    it('同一任务重复获取写锁幂等', () => {
      const mgr = new ConcurrencyManager(2);
      mgr.acquireWriteLock('/workspace', 'task-1');
      const result = mgr.acquireWriteLock('/workspace', 'task-1');
      expect(result).toBe(true);
    });

    it('不同任务争抢写锁抛出 WORKSPACE_WRITE_LOCK', () => {
      const mgr = new ConcurrencyManager(2);
      mgr.acquireWriteLock('/workspace', 'task-1');
      expect(() => mgr.acquireWriteLock('/workspace', 'task-2')).toThrow(AgentError);
      try {
        mgr.acquireWriteLock('/workspace', 'task-2');
      } catch (e) {
        expect((e as AgentError).code).toBe(AgentErrorCode.WORKSPACE_WRITE_LOCK);
      }
    });

    it('释放写锁后其他任务可获取', () => {
      const mgr = new ConcurrencyManager(2);
      mgr.acquireWriteLock('/workspace', 'task-1');
      mgr.releaseWriteLock('/workspace', 'task-1');
      const result = mgr.acquireWriteLock('/workspace', 'task-2');
      expect(result).toBe(true);
    });

    it('仅锁持有者可释放', () => {
      const mgr = new ConcurrencyManager(2);
      mgr.acquireWriteLock('/workspace', 'task-1');
      // task-2 尝试释放 task-1 的锁，不应生效
      mgr.releaseWriteLock('/workspace', 'task-2');
      expect(mgr.isWriteLocked('/workspace')).toBe(true);
    });

    it('支持中文路径', () => {
      const mgr = new ConcurrencyManager(2);
      const result = mgr.acquireWriteLock('/工作区/中文路径', 'task-1');
      expect(result).toBe(true);
      expect(mgr.isWriteLocked('/工作区/中文路径')).toBe(true);
    });

    it('路径大小写不敏感（Win7 兼容）', () => {
      const mgr = new ConcurrencyManager(2);
      mgr.acquireWriteLock('/Workspace/Project', 'task-1');
      expect(() => mgr.acquireWriteLock('/workspace/project', 'task-2')).toThrow(AgentError);
    });

    it('反斜杠和正斜杠等价（Win7 兼容）', () => {
      const mgr = new ConcurrencyManager(2);
      mgr.acquireWriteLock('C:\\Workspace\\Project', 'task-1');
      expect(() => mgr.acquireWriteLock('C:/Workspace/Project', 'task-2')).toThrow(AgentError);
    });
  });

  describe('isWriteLocked()', () => {
    it('未锁定时返回 false', () => {
      const mgr = new ConcurrencyManager(2);
      expect(mgr.isWriteLocked('/workspace')).toBe(false);
    });

    it('锁定后返回 true', () => {
      const mgr = new ConcurrencyManager(2);
      mgr.acquireWriteLock('/workspace', 'task-1');
      expect(mgr.isWriteLocked('/workspace')).toBe(true);
    });

    it('释放后返回 false', () => {
      const mgr = new ConcurrencyManager(2);
      mgr.acquireWriteLock('/workspace', 'task-1');
      mgr.releaseWriteLock('/workspace', 'task-1');
      expect(mgr.isWriteLocked('/workspace')).toBe(false);
    });
  });

  describe('默认并发上限', () => {
    it('默认上限为 2（PERFORMANCE_BUDGET #9）', () => {
      const mgr = new ConcurrencyManager();
      expect(mgr.getUsage().limit).toBe(2);
    });
  });
});

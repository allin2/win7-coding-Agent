/**
 * @module context.test
 * @description 上下文管理测试 — 创建/获取/销毁/list
 */

import {
  AgentContext,
  createContext,
  getContext,
  destroyContext,
  getAllContexts,
  clearAllContexts,
} from '../src/context';
import { AgentState } from '../src/types';

describe('AgentContext', () => {
  it('创建时初始状态为 IDLE', () => {
    const ctx = new AgentContext('s1');
    expect(ctx.sessionId).toBe('s1');
    expect(ctx.state).toBe(AgentState.IDLE);
    expect(ctx.task).toBeNull();
    expect(ctx.capabilities).toEqual([]);
    expect(ctx.createdAt).toBeDefined();
  });

  it('可设置和获取 state', () => {
    const ctx = new AgentContext('s1');
    ctx.state = AgentState.PLANNING;
    expect(ctx.state).toBe(AgentState.PLANNING);
  });

  it('可设置和获取 task', () => {
    const ctx = new AgentContext('s1');
    const task = {
      taskId: 't1',
      sessionId: 's1',
      state: AgentState.PLANNING,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      metadata: {},
    };
    ctx.task = task;
    expect(ctx.task).toEqual(task);
  });

  it('addCapability / removeCapability', () => {
    const ctx = new AgentContext('s1');
    const token = {
      tokenId: 'tok_1',
      sessionId: 's1',
      capabilities: ['read_only'],
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      revoked: false,
    };
    ctx.addCapability(token);
    expect(ctx.capabilities).toHaveLength(1);
    expect(ctx.capabilities[0].tokenId).toBe('tok_1');

    ctx.removeCapability('tok_1');
    expect(ctx.capabilities).toHaveLength(0);
  });

  it('isActive() 新创建的上下文是活跃的', () => {
    const ctx = new AgentContext('s1');
    expect(ctx.isActive()).toBe(true);
  });

  it('reset() 重置到初始状态', () => {
    const ctx = new AgentContext('s1');
    ctx.state = AgentState.EXECUTING;
    ctx.addCapability({
      tokenId: 'tok_1',
      sessionId: 's1',
      capabilities: ['read_only'],
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
      revoked: false,
    });
    ctx.reset();
    expect(ctx.state).toBe(AgentState.IDLE);
    expect(ctx.task).toBeNull();
    expect(ctx.capabilities).toHaveLength(0);
  });
});

describe('ContextManager (module-level functions)', () => {
  afterEach(() => {
    clearAllContexts();
  });

  it('createContext 创建并注册上下文', () => {
    const ctx = createContext('s1');
    expect(ctx).toBeInstanceOf(AgentContext);
    expect(ctx.sessionId).toBe('s1');
  });

  it('getContext 获取已创建的上下文', () => {
    createContext('s1');
    const ctx = getContext('s1');
    expect(ctx).toBeDefined();
    expect(ctx!.sessionId).toBe('s1');
  });

  it('getContext 获取不存在的上下文返回 undefined', () => {
    expect(getContext('nonexistent')).toBeUndefined();
  });

  it('destroyContext 销毁上下文', () => {
    createContext('s1');
    destroyContext('s1');
    expect(getContext('s1')).toBeUndefined();
  });

  it('getAllContexts 返回所有上下文', () => {
    createContext('s1');
    createContext('s2');
    const all = getAllContexts();
    expect(all).toHaveLength(2);
  });

  it('clearAllContexts 清空所有上下文', () => {
    createContext('s1');
    createContext('s2');
    clearAllContexts();
    expect(getAllContexts()).toHaveLength(0);
  });
});

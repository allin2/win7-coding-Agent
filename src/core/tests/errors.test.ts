/**
 * @module errors.test
 * @description 错误模块测试 — AgentError 构造、序列化、工厂函数
 */

import {
  AgentError,
  AgentErrorCode,
  containmentUnavailableError,
  policyDeniedError,
  approvalRequiredError,
  concurrencyLimitError,
  workspaceWriteLockError,
  invalidStateTransitionError,
  capabilityRevokedError,
} from '../src/errors';

describe('AgentError', () => {
  it('构造时携带错误码和消息', () => {
    const err = new AgentError(AgentErrorCode.POLICY_DENIED, 'test error');
    expect(err.code).toBe(AgentErrorCode.POLICY_DENIED);
    expect(err.message).toBe('test error');
    expect(err.name).toBe('AgentError');
    expect(err.context).toEqual({});
  });

  it('构造时支持 context', () => {
    const err = new AgentError(AgentErrorCode.CONCURRENCY_LIMIT, 'limit', { limit: 2 });
    expect(err.context).toEqual({ limit: 2 });
  });

  it('是 Error 的实例', () => {
    const err = new AgentError(AgentErrorCode.POLICY_DENIED, 'test');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AgentError);
  });

  it('toJSON() 序列化', () => {
    const err = new AgentError(AgentErrorCode.POLICY_DENIED, 'test', { key: 'val' });
    const json = err.toJSON();
    expect(json.name).toBe('AgentError');
    expect(json.code).toBe(AgentErrorCode.POLICY_DENIED);
    expect(json.message).toBe('test');
    expect(json.context).toEqual({ key: 'val' });
  });
});

describe('工厂函数', () => {
  it('containmentUnavailableError', () => {
    const err = containmentUnavailableError('sandbox missing');
    expect(err.code).toBe(AgentErrorCode.CONTAINMENT_UNAVAILABLE);
    expect(err.message).toBe('sandbox missing');
  });

  it('policyDeniedError', () => {
    const err = policyDeniedError('denied', { tool: 'evil' });
    expect(err.code).toBe(AgentErrorCode.POLICY_DENIED);
    expect(err.context).toEqual({ tool: 'evil' });
  });

  it('approvalRequiredError', () => {
    const err = approvalRequiredError('need approval');
    expect(err.code).toBe(AgentErrorCode.APPROVAL_REQUIRED);
  });

  it('concurrencyLimitError', () => {
    const err = concurrencyLimitError('limit reached', { active: 2 });
    expect(err.code).toBe(AgentErrorCode.CONCURRENCY_LIMIT);
  });

  it('workspaceWriteLockError', () => {
    const err = workspaceWriteLockError('locked');
    expect(err.code).toBe(AgentErrorCode.WORKSPACE_WRITE_LOCK);
  });

  it('invalidStateTransitionError', () => {
    const err = invalidStateTransitionError('bad transition', { from: 'idle' });
    expect(err.code).toBe(AgentErrorCode.INVALID_STATE_TRANSITION);
  });

  it('capabilityRevokedError', () => {
    const err = capabilityRevokedError('revoked');
    expect(err.code).toBe(AgentErrorCode.CAPABILITY_REVOKED);
  });
});

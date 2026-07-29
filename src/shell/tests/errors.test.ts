/**
 * 错误码覆盖测试
 */

import { ShellError, ShellErrorCode } from '../src/errors';

describe('ShellError', () => {
  it('所有错误码均可构造', () => {
    for (const code of Object.values(ShellErrorCode)) {
      const err = new ShellError(code, `测试错误: ${code}`);
      expect(err.code).toBe(code);
      expect(err.message).toBe(`测试错误: ${code}`);
      expect(err.name).toBe('ShellError');
      expect(err).toBeInstanceOf(ShellError);
      expect(err).toBeInstanceOf(Error);
    }
  });

  it('detail 可选', () => {
    const err = new ShellError(ShellErrorCode.IPC_SCHEMA_INVALID, 'msg', 'detail info');
    expect(err.detail).toBe('detail info');
  });

  it('无 detail 时 toJSON 不包含 detail 字段', () => {
    const err = new ShellError(ShellErrorCode.OUTBOUND_BLOCKED, 'blocked');
    const json = err.toJSON();
    expect(json).not.toHaveProperty('detail');
    expect(json.code).toBe('OUTBOUND_BLOCKED');
  });

  it('有 detail 时 toJSON 包含 detail 字段', () => {
    const err = new ShellError(ShellErrorCode.UPDATE_VERIFY_FAILED, 'verify failed', 'hash mismatch');
    const json = err.toJSON();
    expect(json.detail).toBe('hash mismatch');
  });

  it('错误码枚举值正确', () => {
    expect(ShellErrorCode.IPC_SCHEMA_INVALID).toBe('IPC_SCHEMA_INVALID');
    expect(ShellErrorCode.RENDERER_CAPABILITY_DENIED).toBe('RENDERER_CAPABILITY_DENIED');
    expect(ShellErrorCode.OUTBOUND_BLOCKED).toBe('OUTBOUND_BLOCKED');
    expect(ShellErrorCode.UPDATE_VERIFY_FAILED).toBe('UPDATE_VERIFY_FAILED');
    expect(ShellErrorCode.GPU_FALLBACK_REQUIRED).toBe('GPU_FALLBACK_REQUIRED');
  });
});

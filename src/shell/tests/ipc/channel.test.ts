/**
 * IPC Channel 测试
 */

import { IPCChannel } from '../../src/ipc/channel';
import { IPCMessageType, IPCDirection, IPCMessage } from '../../src/ipc/messages';
import { ShellError, ShellErrorCode } from '../../src/errors';

function makeValidMessage(overrides: Partial<IPCMessage> = {}): IPCMessage {
  return {
    id: 'msg-001',
    type: IPCMessageType.SESSION_CREATE,
    direction: IPCDirection.RENDERER_TO_CORE,
    sessionId: 'sess-001',
    timestamp: new Date().toISOString(),
    payload: { workspacePath: '/home/user/project' },
    ...overrides,
  };
}

describe('IPCChannel', () => {
  let channel: IPCChannel;

  beforeEach(() => {
    channel = new IPCChannel();
  });

  describe('registerHandler / send', () => {
    it('注册 handler 后发送合法消息成功', () => {
      const received: IPCMessage[] = [];
      channel.registerHandler(IPCMessageType.SESSION_CREATE, (msg) => {
        received.push(msg);
      });

      const result = channel.send(makeValidMessage());
      expect(result.success).toBe(true);
      expect(received).toHaveLength(1);
    });

    it('未注册 handler 时返回 success=false', () => {
      const result = channel.send(makeValidMessage());
      expect(result.success).toBe(false);
      expect(result.error).toContain('未注册 handler');
    });

    it('非法消息抛出 ShellError', () => {
      expect(() => channel.send(makeValidMessage({ payload: {} } as IPCMessage))).toThrow(ShellError);
    });
  });

  describe('onMessage', () => {
    it('监听回调在合法消息通过校验后触发', () => {
      const messages: IPCMessage[] = [];
      channel.onMessage((msg) => { messages.push(msg); });
      channel.registerHandler(IPCMessageType.SESSION_CREATE, () => {});
      channel.receive(makeValidMessage());
      expect(messages).toHaveLength(1);
    });

    it('offMessage 移除监听', () => {
      const messages: IPCMessage[] = [];
      const cb = (msg: IPCMessage) => { messages.push(msg); };
      channel.onMessage(cb);
      channel.offMessage(cb);
      channel.registerHandler(IPCMessageType.SESSION_CREATE, () => {});
      channel.receive(makeValidMessage());
      expect(messages).toHaveLength(0);
    });
  });

  describe('receive', () => {
    it('接收合法消息并路由', () => {
      const received: IPCMessage[] = [];
      channel.registerHandler(IPCMessageType.SESSION_CREATE, (msg) => { received.push(msg); });
      const result = channel.receive(makeValidMessage());
      expect(result.success).toBe(true);
      expect(received).toHaveLength(1);
    });

    it('接收非法消息抛出', () => {
      expect(() => channel.receive({ bad: true })).toThrow(ShellError);
    });
  });

  describe('getRegisteredTypes', () => {
    it('返回已注册的消息类型', () => {
      channel.registerHandler(IPCMessageType.SESSION_CREATE, () => {});
      channel.registerHandler(IPCMessageType.TASK_SUBMIT, () => {});
      const types = channel.getRegisteredTypes();
      expect(types).toContain(IPCMessageType.SESSION_CREATE);
      expect(types).toContain(IPCMessageType.TASK_SUBMIT);
    });
  });

  describe('unregisterHandler', () => {
    it('移除 handler 后发送返回失败', () => {
      channel.registerHandler(IPCMessageType.SESSION_CREATE, () => {});
      channel.unregisterHandler(IPCMessageType.SESSION_CREATE);
      const result = channel.send(makeValidMessage());
      expect(result.success).toBe(false);
    });
  });
});

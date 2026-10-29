import {
  A9AgentLoop,
  A9ModelPort,
  A9WorkspacePort,
  A9RunnerPort,
  PermissionMode,
  TurnOutcome,
} from '../src';

function makeLoop(options: {
  readImage?: (path: string, turn: string, signal?: AbortSignal) => Promise<any>;
  provider: A9ModelPort;
  onQuestionPending?: (question: any) => void | Promise<void>;
  onEvent?: (event: any) => void;
  onAuditEvent?: (event: any) => void;
  permissionMode?: PermissionMode;
}) {
  const workspaceService: A9WorkspacePort = {
    list: jest.fn().mockResolvedValue({ entries: [] }), read: jest.fn().mockResolvedValue({ content: '' }),
    search: jest.fn().mockResolvedValue({ matches: [] }),
    write: jest.fn().mockResolvedValue({ written: true }), edit: jest.fn().mockResolvedValue({ replaced: true }),
    copy: jest.fn().mockResolvedValue({ copied: true }), move: jest.fn().mockResolvedValue({ moved: true }),
    delete: jest.fn().mockResolvedValue({ deleted: true }),
  };
  const runner: A9RunnerPort = { execute: jest.fn() };
  const loop = new A9AgentLoop({
    workspaceRoot: '/workspace',
    questionIdentity: { workspace: '/workspace', conversationId: 'conversation-1', taskId: 'task-1' },
    provider: options.provider,
    readImage: options.readImage,
    workspaceService,
    runner,
    permissionMode: options.permissionMode ?? PermissionMode.FULL_ACCESS,
    onQuestionPending: options.onQuestionPending,
    onEvent: options.onEvent,
    onAuditEvent: options.onAuditEvent,
  });
  return { loop, workspaceService };
}

function providerWith(sequence: Array<{ calls?: any[]; content?: string; finishReason?: string }>): A9ModelPort {
  let index = 0;
  return {
    sendStreamRequest: jest.fn(async () => {
      const step = sequence[index++];
      if (!step) throw new Error('unexpected model request');
      return {
        id: `response-${index}`,
        content: step.content || '',
        finishReason: step.finishReason || (step.calls ? 'tool_calls' : 'stop'),
        ...(step.calls ? { toolCalls: step.calls } : {}),
      };
    }),
  };
}

const imageCall = (id: string) => ({ id, name: 'read_image', arguments: JSON.stringify({ path: `sample-${id}.png` }) });
const readImage = async () => ({ metadata: { path: 'sample.png', reference: 'ref' }, image: { mimeType: 'image/png', data: 'eA==' } });
describe('A9-42 image lifecycle', () => {
  it('limits pending images to two and per-turn reads to four', async () => {
    const provider = providerWith([
      { calls: [imageCall('1'), imageCall('2'), imageCall('3')] },
      { calls: [imageCall('4'), imageCall('5')] },
      { calls: [imageCall('6')] }, { content: 'done' },
    ]);
    const port = jest.fn(readImage);
    const { loop } = makeLoop({ provider, readImage: port, permissionMode: PermissionMode.READ_ONLY });
    await loop.runTurn('see');
    expect(port).toHaveBeenCalledTimes(4);
    const requests = (provider.sendStreamRequest as jest.Mock).mock.calls.map(call => call[0]);
    expect(requests.map(r => r.messages.reduce((n: number, m: any) => n + (m.images || []).length, 0))).toEqual([0, 2, 2, 0]);
    expect(JSON.stringify(loop.getConversationHistory())).not.toContain('eA==');
  });
  it.each(['answered', 'cancelled'] as const)('discards pixels across a question suspension: %s', async decision => {
    const provider = providerWith([{ calls: [imageCall('1'), { id: 'q', name: 'ask_user', arguments: '{"prompt":"target?"}' }] }, { content: 'done' }]);
    const { loop } = makeLoop({ provider, readImage });
    const suspended = await loop.runTurn('see and ask'); const q = suspended.pendingQuestion!;
    await loop.resumeAfterQuestion({ conversationId: q.conversationId, questionId: q.questionId, revision: q.revision,
      decision, ...(decision === 'answered' ? { answer: 'yes' } : {}) });
    const requests = (provider.sendStreamRequest as jest.Mock).mock.calls.map(call => call[0]);
    expect(JSON.stringify(requests)).not.toContain('eA==');
    expect(JSON.stringify(loop.getConversationHistory())).not.toContain('eA==');
  });
  it('drops an in-flight read on cancellation before requesting a model', async () => {
    const controller = new AbortController();
    const provider = providerWith([{ calls: [imageCall('1')] }, { content: 'must not run' }]);
    const { loop } = makeLoop({ provider, readImage: async () => { controller.abort(); return readImage(); } });
    await loop.runTurn('see', { signal: controller.signal });
    expect(provider.sendStreamRequest).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(loop.getConversationHistory())).not.toContain('eA==');
  });
});

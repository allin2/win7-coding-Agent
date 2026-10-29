import {
  A9AgentLoop,
  A9ModelPort,
  A9WorkspacePort,
  A9RunnerPort,
  PermissionMode,
  TurnOutcome,
} from '../src';

function makeLoop(options: {
  office?: any;
  maxToolResultChars?: number;
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
    office: options.office,
    maxToolResultChars: options.maxToolResultChars,
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

describe('Office Core policy and structured model budget', () => {
  it('keeps a single oversized unit valid JSON and preserves a continuation position', async () => {
    const provider = providerWith([{ calls: [{ id: 'read', name: 'document_read', arguments: '{"path":"file.docx"}' }] }, { content: 'done' }]);
    const office = { inspect: jest.fn(), writeCopy: jest.fn(), read: jest.fn(async () => ({ schemaVersion: 1, format: 'docx',
      units: [{ index: 3, type: 'table_row', cells: ['x'.repeat(3000)] }], nextStart: 4, truncated: true })) };
    const { loop } = makeLoop({ provider, office, maxToolResultChars: 1000, permissionMode: PermissionMode.READ_ONLY });
    await loop.runTurn('read');
    const message = loop.getConversationHistory().find(m => m.role === 'tool' && m.toolName === 'document_read')!;
    const payload = JSON.parse(message.content);
    expect(payload.units[0]).toMatchObject({ index: 3, contentTruncated: true }); expect(payload.nextStart).toBe(4);
    expect(message.content.length).toBeLessThan(1000);
  });
  it('does not expose Office tools without a configured port or writes in Review', () => {
    expect(makeLoop({ provider: providerWith([]) }).loop.getVisibleTools()).not.toContain('document_read');
    const { loop } = makeLoop({ provider: providerWith([]), office: {}, permissionMode: PermissionMode.REVIEW });
    expect(loop.getVisibleTools()).toContain('document_read'); expect(loop.getVisibleTools()).not.toContain('document_write_copy');
  });
});

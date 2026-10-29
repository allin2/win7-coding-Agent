/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import * as http from 'http';
import * as vm from 'vm';
import Database from 'better-sqlite3';

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime');
const { createA9ProductRequestHandler } = require('../../product/a9-product-ipc');

type FixtureStep =
  | { kind: 'fail' }
  | { kind: 'ask'; prompt: string; options?: string[]; later?: Array<{ name: string; args: any }> }
  | { kind: 'write'; name: string; args: any }
  | { kind: 'text'; content: string };

async function setup(options: { steps: FixtureStep[]; restartAt?: number } = { steps: [] }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-42-question-'));
  const workspaceRoot = path.join(root, '中文 workspace');
  const dataRoot = path.join(root, 'data');
  fs.mkdirSync(workspaceRoot); fs.mkdirSync(dataRoot);
  fs.writeFileSync(path.join(workspaceRoot, 'note.txt'), 'current\n', 'utf8');
  const requests: any[] = [];
  const responses: http.ServerResponse[] = [];
  let stepIndex = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString('utf8'); });
    req.on('end', () => {
      requests.push(JSON.parse(body));
      const step = options.steps[stepIndex++];
      if (step && step.kind === 'fail') { res.writeHead(400); res.end('fixture continuation failure'); return; }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      if (!step || step.kind === 'text') {
        res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: step && step.kind === 'text' ? step.content : 'done' }, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`);
        return;
      }
      if (step.kind === 'ask') {
        const calls = [
          { index: 0, id: `question-${stepIndex}`, type: 'function',
            function: { name: 'ask_user', arguments: JSON.stringify({ prompt: step.prompt, ...(step.options ? { options: step.options } : {}) }) } },
          ...(step.later || []).map((call, index) => ({ index: index + 1, id: `later-${stepIndex}-${index}`, type: 'function',
            function: { name: call.name, arguments: JSON.stringify(call.args) } })),
        ];
        res.end(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: calls }, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n`);
        return;
      }
      res.end(`data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: `write-${stepIndex}`, type: 'function',
        function: { name: step.name, arguments: JSON.stringify(step.args) } }] }, finish_reason: 'tool_calls' }] })}\n\ndata: [DONE]\n\n`);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  const make = () => createA9AgentRuntime({
    workspaceRoot, dataRoot, ownerId: `a9-42-${process.pid}-${Math.random()}`,
    openDatabase: (databasePath: string, openOptions: any) => new Database(databasePath, openOptions),
  });
  let runtime = make();
  runtime.setMode('read_only');
  await runtime.configureProvider({ baseUrl, model: 'fixture', skipProbe: true });
  const db = new Database(path.join(dataRoot, 'a9-state.db'));
  const ipc = () => createA9ProductRequestHandler({ isValidRendererSender: () => true, getA9Runtime: () => runtime });
  return {
    root, workspaceRoot, dataRoot, requests, db,
    get runtime() { return runtime; },
    ipc,
    reply(payload: any) {
      return ipc()({}, { schemaVersion: 7, action: 'a9.question.reply', payload });
    },
    async restart() { await runtime.shutdown(); runtime = make(); },
    async close() {
      for (const response of responses) response.destroy();
      await runtime.shutdown(); db.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe('A9-42 ask_user product runtime chain', () => {
  it('rejects credential-bearing answers before durable storage and model dispatch', async () => {
    const f = await setup({ steps: [{ kind: 'ask', prompt: 'target?' }] });
    try {
      const first = await f.runtime.submitTurn('ask'); const q = first.result.pendingQuestion;
      const reply = await f.reply({ conversationId: q.conversationId, questionId: q.questionId,
        revision: q.revision, decision: 'answered', answer: 'Authorization: Bearer secret-value' });
      expect(reply.ok).toBe(false);
      expect(reply.error.code).toBe('A9_QUESTION_SENSITIVE_INPUT');
      expect(f.requests).toHaveLength(1);
      expect(JSON.stringify(f.db.prepare('SELECT payload_json FROM a9_events').all())).not.toContain('secret-value');
      expect(f.runtime.getSnapshot().pendingQuestion.questionId).toBe(q.questionId);
    } finally { await f.close(); }
  });
  it('an old duplicate cannot erase a newer pending question', async () => {
    const f = await setup({ steps: [{ kind: 'ask', prompt: 'first' }, { kind: 'ask', prompt: 'second' }] });
    try {
      const first = await f.runtime.submitTurn('ask'); const q = first.result.pendingQuestion;
      const reply = { conversationId: q.conversationId, questionId: q.questionId, revision: q.revision, decision: 'answered', answer: 'one' };
      await f.reply(reply);
      const second = f.runtime.getSnapshot().pendingQuestion;
      expect(second.prompt).toBe('second');
      expect((await f.reply(reply)).duplicate).toBe(true);
      expect(f.runtime.getSnapshot().pendingQuestion.questionId).toBe(second.questionId);
      expect(f.requests).toHaveLength(2);
    } finally { await f.close(); }
  });

  it.each([false, true])('keeps a durable answer and can continue after provider failure (restart=%s)', async (restart) => {
    const f = await setup({ steps: [{ kind: 'ask', prompt: 'destination?' }, { kind: 'fail' }, { kind: 'text', content: 'recovered' }] });
    try {
      const first = await f.runtime.submitTurn('ask'); const q = first.result.pendingQuestion;
      if (restart) await f.restart();
      const reply = { conversationId: q.conversationId, questionId: q.questionId, revision: q.revision, decision: 'answered', answer: 'staging' };
      const failed = await f.reply(reply);
      expect(failed.ok).toBe(false);
      expect(failed.error.code).toBe('A9_QUESTION_CONTINUATION_FAILED');
      expect(f.runtime.getSnapshot().agentStatus).toBe('interrupted');
      expect(f.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='question_resolved'").get()).toEqual({ n: 1 });
      await f.restart();
      const fact = f.runtime.getSnapshot().recoveryTasks[0];
      expect(fact).toBeTruthy();
      const resumed = await f.runtime.continueTask({ conversationId: fact.conversationId, taskId: fact.taskId,
        interruptedTurnId: fact.interruptedTurnId, recoveryRevision: fact.recoveryRevision });
      expect(resumed.ok).toBe(true);
      expect(JSON.stringify(f.requests[f.requests.length - 1])).toContain('staging');
      expect(f.requests).toHaveLength(3);
    } finally { await f.close(); }
  });
  it('shows needs_input, persists first, and does not dispatch the later same-batch write', async () => {
    const f = await setup({ steps: [
      { kind: 'ask', prompt: 'Should I use staging?', options: ['staging', 'production'],
        later: [{ name: 'write', args: { path: 'unsafe.txt', content: 'must not run' } }] },
      { kind: 'text', content: 'staging noted' },
    ] });
    try {
      const turn = await f.runtime.submitTurn('ask first');
      expect(turn.ok).toBe(true);
      expect(turn.result.outcome).toBe('needs_input');
      expect(turn.result.pendingQuestion).toMatchObject({
        schemaVersion: 1, revision: 1, prompt: 'Should I use staging?', options: ['staging', 'production'],
      });
      const snapshot = f.runtime.getSnapshot();
      expect(snapshot.agentStatus).toBe('needs_input');
      expect(snapshot.pendingQuestion.questionId).toBe(turn.result.pendingQuestion.questionId);
      expect(fs.existsSync(path.join(f.workspaceRoot, 'unsafe.txt'))).toBe(false);
      expect(f.requests).toHaveLength(1);
      expect(f.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='question_pending'").get()).toEqual({ n: 1 });
    } finally { await f.close(); }
  });

  it('commits the answer before continuation, re-plans, and a duplicate reply has no second dispatch', async () => {
    const f = await setup({ steps: [
      { kind: 'ask', prompt: 'Name the file', options: ['note.txt'] },
      { kind: 'text', content: 'understood' },
    ] });
    try {
      const first = await f.runtime.submitTurn('need a name');
      const question = first.result.pendingQuestion;
      const reply = {
        conversationId: question.conversationId, questionId: question.questionId,
        revision: question.revision, decision: 'answered', answer: 'note.txt',
      };
      const answered = await f.reply(reply);
      expect(answered.ok).toBe(true);
      expect(answered.result.outcome).toBe('completed');
      expect(f.requests).toHaveLength(2);
      expect(f.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='question_resolved'").get()).toEqual({ n: 1 });
      const repeated = await f.reply(reply);
      expect(repeated.ok).toBe(true);
      expect(repeated.duplicate).toBe(true);
      expect(f.requests).toHaveLength(2);
    } finally { await f.close(); }
  });

  it('cancelled ends the Turn and never runs later same-batch calls', async () => {
    const f = await setup({ steps: [
      { kind: 'ask', prompt: 'Continue?', later: [{ name: 'write', args: { path: 'unsafe.txt', content: 'no' } }] },
    ] });
    try {
      const first = await f.runtime.submitTurn('ask');
      const q = first.result.pendingQuestion;
      const cancelled = await f.reply({
        conversationId: q.conversationId, questionId: q.questionId, revision: q.revision, decision: 'cancelled',
      });
      expect(cancelled.ok).toBe(true);
      expect(cancelled.result.outcome).toBe('cancelled');
      expect(fs.existsSync(path.join(f.workspaceRoot, 'unsafe.txt'))).toBe(false);
      expect(f.requests).toHaveLength(1);
      expect(f.runtime.getSnapshot().agentStatus).toBe('cancelled');
    } finally { await f.close(); }
  });

  it('strict IPC rejects cross-conversation, stale, empty and extra fields before runtime', async () => {
    const f = await setup({ steps: [{ kind: 'ask', prompt: 'Pick', options: ['a'] }] });
    try {
      const first = await f.runtime.submitTurn('ask');
      const q = first.result.pendingQuestion;
      const base = { conversationId: q.conversationId, questionId: q.questionId, revision: q.revision, decision: 'answered', answer: 'a' };
      for (const payload of [
        { ...base, answer: '' },
        { ...base, extra: true },
        { ...base, decision: 'cancelled' },
      ]) {
        const response = await f.reply(payload);
        expect(response.ok).toBe(false);
        expect(response.error.code).toBe('A9_PAYLOAD_INVALID');
      }
      const foreign = await f.reply({ ...base, conversationId: 'foreign' });
      expect(foreign.ok).toBe(false);
      expect(foreign.error.code).toBe('A9_PAYLOAD_INVALID');
      const stale = await f.reply({ ...base, revision: q.revision + 1 });
      expect(stale.ok).toBe(false);
      expect(stale.error.code).toBe('A9_QUESTION_STALE');
      expect(f.requests).toHaveLength(1);
      expect(f.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='question_resolved'").get()).toEqual({ n: 0 });
    } finally { await f.close(); }
  });

  it('restart displays the unresolved question, can answer it, and never replays the old queue', async () => {
    const f = await setup({ steps: [
      { kind: 'ask', prompt: 'Resume after restart?', options: ['yes'],
        later: [{ name: 'write', args: { path: 'unsafe.txt', content: 'no' } }] },
      { kind: 'text', content: 'resumed safely' },
    ] });
    try {
      const first = await f.runtime.submitTurn('ask');
      const q = first.result.pendingQuestion;
      await f.restart();
      const snapshot = f.runtime.getSnapshot();
      expect(snapshot.agentStatus).toBe('needs_input');
      expect(snapshot.pendingQuestion).toMatchObject({ questionId: q.questionId, revision: q.revision, recovered: true });
      expect(f.requests).toHaveLength(1);
      const reply = await f.reply({ conversationId: q.conversationId, questionId: q.questionId,
        revision: q.revision, decision: 'answered', answer: 'yes' });
      expect(reply.ok).toBe(true);
      expect(reply.result.outcome).toBe('completed');
      expect(f.requests).toHaveLength(2);
      expect(fs.existsSync(path.join(f.workspaceRoot, 'unsafe.txt'))).toBe(false);
    } finally { await f.close(); }
  });

  it('preload exposes a strict reply action on the actual invoke channel', async () => {
    let api: any;
    const invoke = jest.fn(async () => ({ ok: true }));
    const file = path.resolve(__dirname, '../../product/preload.js');
    vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
      process: { argv: [] },
      require: () => ({
        contextBridge: { exposeInMainWorld: (_name: string, value: any) => { api = value; } },
        ipcRenderer: { invoke },
      }),
      Date,
    });
    await api.a9.replyQuestion('conversation', 'question', 1, 'answered', 'free answer');
    expect(invoke).toHaveBeenCalledWith('product:a9-request', {
      schemaVersion: 7,
      action: 'a9.question.reply',
      payload: { conversationId: 'conversation', questionId: 'question', revision: 1, decision: 'answered', answer: 'free answer' },
    });
    await api.a9.replyQuestion('conversation', 'question', 1, 'cancelled');
    expect(invoke).toHaveBeenLastCalledWith('product:a9-request', {
      schemaVersion: 7,
      action: 'a9.question.reply',
      payload: { conversationId: 'conversation', questionId: 'question', revision: 1, decision: 'cancelled' },
    });
  });
});

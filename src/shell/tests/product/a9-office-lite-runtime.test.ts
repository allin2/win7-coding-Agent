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

async function setup(options: { steps: FixtureStep[]; mode?: string; journey?: boolean } = { steps: [] }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-42-question-'));
  const workspaceRoot = path.join(root, '中文 workspace');
  const dataRoot = path.join(root, 'data');
  fs.mkdirSync(workspaceRoot); fs.mkdirSync(dataRoot);
  fs.writeFileSync(path.join(workspaceRoot, 'note.txt'), 'current\n', 'utf8');
  const requests: any[] = [];
  const responses: http.ServerResponse[] = [];
  let stepIndex = 0;
  const journey = require('../../../../scripts/win7-dev/a9-42-office-journey.cjs');
  const journeyState = options.journey ? journey.makeFixtureState() : null;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk.toString('utf8'); });
    req.on('end', () => {
      requests.push(JSON.parse(body));
      if (journeyState) {
        try {
          journeyState.requests += 1;
          const delta = journey.fixtureStep(journeyState, requests[requests.length - 1]);
          res.writeHead(200, { 'Content-Type': 'text/event-stream' });
          res.end(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
        } catch (error: any) { res.writeHead(400); res.end(journey.safeError(error)); }
        return;
      }
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
  runtime.setMode(options.mode || 'full_access');
  await runtime.configureProvider({ baseUrl, model: 'fixture', skipProbe: true });
  const db = new Database(path.join(dataRoot, 'a9-state.db'));
  const ipc = () => createA9ProductRequestHandler({ isValidRendererSender: () => true, getA9Runtime: () => runtime });
  return {
    root, workspaceRoot, dataRoot, requests, db, journeyState,
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

const doc = { schemaVersion: 1, format: 'docx', blocks: [
  { type: 'heading', level: 1, text: '工作报告' }, { type: 'paragraph', text: '正文甲' },
  { type: 'table', rows: [['姓名', '金额'], ['张三', '12']] },
] };
const book = { schemaVersion: 1, format: 'xlsx', sheets: [{ name: '数据', rows: [['名称', '数量'], ['乙', 12]] }] };

describe('Office Lite actual Runtime/Core/Gateway/Worker/Workspace chain', () => {
  it.each([['docx', doc], ['xlsx', book]])('creates and reads a %s copy and can undo it', async (extension, content) => {
    const output = `中文 副本.${extension}`;
    const f = await setup({ steps: [
      { kind: 'write', name: 'document_write_copy', args: { path: output, content: JSON.stringify(content) } },
      { kind: 'write', name: 'document_read', args: { path: output } }, { kind: 'text', content: 'done' },
    ] });
    try {
      const result = await f.runtime.submitTurn('create and inspect a document');
      expect(result.ok).toBe(true);
      expect(fs.readFileSync(path.join(f.workspaceRoot, output)).subarray(0, 2).toString()).toBe('PK');
      expect(JSON.stringify(f.requests[2])).toContain(extension === 'docx' ? '正文甲' : '名称');
      expect(JSON.stringify(f.requests[2])).toContain('content_only');
      const workspace = require('../../../workspace/dist');
      const service = new workspace.A9WorkspaceService(f.workspaceRoot);
      expect(service.getCheckpointManager().undoTurn(result.result.turnId).errors).toEqual([]);
      expect(fs.existsSync(path.join(f.workspaceRoot, output))).toBe(false);
    } finally { await f.close(); }
  });

  it('restores an unanswered Office question without dispatch, then generates, reads, hash-binds a copy and undoes through product IPC', async () => {
    const journey = require('../../../../scripts/win7-dev/a9-42-office-journey.cjs');
    const f = await setup({ steps: [], journey: true });
    try {
      const first = await f.runtime.submitTurn('a942:office:new');
      expect(first.result.outcome).toBe('needs_input');
      const q = first.result.pendingQuestion;
      expect(f.requests).toHaveLength(1);
      await f.restart();
      expect(f.runtime.getSnapshot().pendingQuestion).toMatchObject({ questionId: q.questionId, recovered: true });
      expect(f.requests).toHaveLength(1);
      expect(fs.existsSync(path.join(f.workspaceRoot, journey.FILES.poison))).toBe(false);
      f.journeyState.phase = 'answer_allowed';
      const answer = { conversationId: q.conversationId, questionId: q.questionId, revision: q.revision, decision: 'answered', answer: '小样本' };
      const resumed = await f.reply(answer);
      expect(resumed.ok).toBe(true);
      expect(f.journeyState.phase).toBe('new_done');
      const original = fs.readFileSync(path.join(f.workspaceRoot, journey.FILES.doc));
      const book = fs.readFileSync(path.join(f.workspaceRoot, journey.FILES.book));
      const beforeDuplicate = f.requests.length;
      const duplicate = await f.reply(answer);
      expect(duplicate.ok).toBe(true); expect(duplicate.duplicate).toBe(true);
      expect(f.requests).toHaveLength(beforeDuplicate);
      const copied = await f.runtime.submitTurn('a942:office:copy');
      expect(copied.ok).toBe(true); expect(f.journeyState.phase).toBe('copy_done');
      expect(fs.readFileSync(path.join(f.workspaceRoot, journey.FILES.doc))).toEqual(original);
      const copiedBytes = fs.readFileSync(path.join(f.workspaceRoot, journey.FILES.copy));
      expect(copiedBytes.equals(original)).toBe(false);
      const undone = await f.ipc()({}, { schemaVersion: 7, action: 'a9.checkpoint.undoTurn', payload: { turnId: copied.result.turnId } });
      expect(undone.ok).toBe(true); expect(undone.outcome.errors).toEqual([]);
      expect(undone.outcome.restored).toEqual([journey.FILES.copy + ' (已移除新建文件)']);
      expect(fs.existsSync(path.join(f.workspaceRoot, journey.FILES.copy))).toBe(false);
      expect(fs.readFileSync(path.join(f.workspaceRoot, journey.FILES.doc))).toEqual(original);
      expect(fs.readFileSync(path.join(f.workspaceRoot, journey.FILES.book))).toEqual(book);
      expect(fs.existsSync(path.join(f.workspaceRoot, journey.FILES.poison))).toBe(false);
      expect(f.db.prepare("SELECT count(*) n FROM a9_events WHERE event_type='question_resolved'").get()).toEqual({ n: 1 });
      const facts = f.db.prepare("SELECT payload_json FROM a9_events WHERE event_type='tool_end'").all()
        .map((r: any) => JSON.parse(r.payload_json).data);
      for (const tool of ['document_write_copy', 'document_read', 'document_inspect']) {
        expect(facts.some((e: any) => e.toolName === tool && e.result && !JSON.parse(e.result).error)).toBe(true);
      }
    } finally { await f.close(); }
  });

  it('Read Only offers document reads and never exposes or dispatches document writes', async () => {
    const f = await setup({ mode: 'read_only', steps: [
      { kind: 'write', name: 'document_write_copy', args: { path: 'denied.docx', content: JSON.stringify(doc) } }, { kind: 'text', content: 'done' },
    ] });
    try {
      await f.runtime.submitTurn('read only');
      const tools = f.requests[0].tools.map((t: any) => t.function.name);
      expect(tools).toContain('document_read'); expect(tools).toContain('document_inspect');
      expect(tools).not.toContain('document_write_copy');
      expect(fs.existsSync(path.join(f.workspaceRoot, 'denied.docx'))).toBe(false);
    } finally { await f.close(); }
  });

  it('redacts recognized credentials from document content before model requests and event projections', async () => {
    const f = await setup({ mode: 'read_only', steps: [
      { kind: 'write', name: 'document_read', args: { path: 'sensitive.docx' } }, { kind: 'text', content: 'done' },
    ] });
    try {
      const { processOffice } = require('../../product/office-lite-engine');
      const content = { schemaVersion: 1, format: 'docx', blocks: [{ type: 'paragraph', text: 'Authorization: Bearer hidden-office-credential' }] };
      const document = await processOffice({ action: 'write', format: 'docx', content });
      fs.writeFileSync(path.join(f.workspaceRoot, 'sensitive.docx'), document.buffer);
      await f.runtime.submitTurn('read document');
      expect(JSON.stringify(f.requests)).not.toContain('hidden-office-credential');
      expect(JSON.stringify(f.db.prepare('SELECT payload_json FROM a9_events').all())).not.toContain('hidden-office-credential');
      expect(JSON.stringify(f.requests[1]).toLowerCase()).toContain('redacted');
    } finally { await f.close(); }
  });
});

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

async function setup(options: { steps: FixtureStep[]; nativeImage?: any; enabled?: boolean } = { steps: [] }) {
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
    workspaceRoot, dataRoot, nativeImage: options.nativeImage, ownerId: `a9-42-${process.pid}-${Math.random()}`,
    openDatabase: (databasePath: string, openOptions: any) => new Database(databasePath, openOptions),
  });
  let runtime = make();
  runtime.setMode('read_only');
  await runtime.configureProvider({ baseUrl, model: 'fixture', skipProbe: true, imageInputEnabled: options.enabled === true });
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

// Decoder fixture only. This verifies real runtime/SQLite/IPC/Gateway paths,
// not Electron native decoding or Win7 performance.
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64');
const nativeImage = { createFromBuffer: () => ({ isEmpty: () => false, getSize: () => ({ width: 1, height: 1 }), toPNG: () => png }) };
const read: FixtureStep = { kind: 'write', name: 'read_image', args: { path: '图.png' } };

describe('A9-42 image product chain', () => {
  it('sends pixels only in the next request and persists metadata only; preview binds identity', async () => {
    const f = await setup({ nativeImage, enabled: true, steps: [read, { kind: 'write', name: 'read', args: { path: 'note.txt' } }, { kind: 'text', content: 'done' }] });
    try {
      fs.writeFileSync(path.join(f.workspaceRoot, '图.png'), png);
      const result = await f.runtime.submitTurn('inspect image');
      expect(result.ok).toBe(true);
      expect(f.requests).toHaveLength(3);
      const images = f.requests[1].messages.flatMap((m: any) => Array.isArray(m.content) ? m.content.filter((p: any) => p.type === 'image_url') : []);
      expect(images).toHaveLength(1);
      expect(images[0].image_url.url).toBe(`data:image/png;base64,${png.toString('base64')}`);
      expect(JSON.stringify(f.requests[2])).not.toContain('data:image');
      const rows = f.db.prepare('SELECT payload_json FROM a9_events').all() as any[];
      expect(JSON.stringify(rows)).not.toContain(png.toString('base64'));
      expect(JSON.stringify(f.runtime.getSnapshot())).not.toContain(png.toString('base64'));
      const metadata = rows.map(r => JSON.parse(r.payload_json)).map(p => p.data && p.data.image || p.image).find(Boolean);
      expect(metadata).toBeTruthy();
      const preview = (conversationId: string, reference: string) => f.ipc()({}, { schemaVersion: 7, action: 'a9.image.preview', payload: { conversationId, reference } });
      expect((await preview(metadata.conversationId, metadata.reference)).ok).toBe(true);
      expect((await preview('foreign', metadata.reference)).ok).toBe(false);
      fs.writeFileSync(path.join(f.workspaceRoot, '图.png'), Buffer.concat([png, Buffer.from('changed')]));
      expect((await preview(metadata.conversationId, metadata.reference)).ok).toBe(false);
      await f.restart();
      expect((await preview(metadata.conversationId, metadata.reference)).ok).toBe(false);
    } finally { await f.close(); }
  });

  it('defaults off, resets on model change and requires a decoder', async () => {
    const f = await setup({ nativeImage, steps: [{ kind: 'text', content: 'off' }, { kind: 'text', content: 'on' }] });
    try {
      await f.runtime.submitTurn('off');
      expect(f.requests[0].tools.some((t: any) => t.function.name === 'read_image')).toBe(false);
      await f.runtime.configureProvider({ baseUrl: f.runtime.getSnapshot().provider.baseUrl, model: 'fixture', imageInputEnabled: true, skipProbe: true });
      await f.runtime.submitTurn('on');
      expect(f.requests[1].tools.some((t: any) => t.function.name === 'read_image')).toBe(true);
      await f.runtime.configureProvider({ baseUrl: f.runtime.getSnapshot().provider.baseUrl, model: 'changed', skipProbe: true });
      expect(f.runtime.getSnapshot().provider.imageInputEnabled).toBe(false);
    } finally { await f.close(); }
    const noDecoder = await setup({ enabled: true, steps: [{ kind: 'text', content: 'no decoder' }] });
    try {
      await noDecoder.runtime.submitTurn('no decoder');
      expect(noDecoder.requests[0].tools.some((t: any) => t.function.name === 'read_image')).toBe(false);
    } finally { await noDecoder.close(); }
  });
});

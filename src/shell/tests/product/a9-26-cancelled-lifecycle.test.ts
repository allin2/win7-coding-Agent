/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime') as any;

it('R1-03 O-1 cancelled turn emits a terminal event and persists cancelled statuses', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-o1-'));
  const workspaceRoot = path.join(root, 'ws');
  const dataRoot = path.join(root, 'data');
  fs.mkdirSync(workspaceRoot);
  fs.mkdirSync(dataRoot);
  let notifyStarted: (() => void) | undefined;
  const started = new Promise<void>((resolve) => { notifyStarted = resolve; });
  const pending: http.ServerResponse[] = [];
  const server = http.createServer((req, res) => {
    req.resume();
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      res.write(': waiting\n\n');
      pending.push(res);
      notifyStarted?.();
    });
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${(server.address() as any).port}`;
  const runtime = createA9AgentRuntime({
    workspaceRoot, dataRoot, ownerId: 'a9-o1-test',
    openDatabase: (databasePath: string, options?: { readonly?: boolean }) =>
      new Database(databasePath, options?.readonly ? { readonly: true } : {}),
  });
  try {
    runtime.setMode('full_access');
    await runtime.configureProvider({ baseUrl, model: 'fixture', skipProbe: true });
    const turn = runtime.submitTurn('wait then stop');
    await started;
    expect(runtime.stop().ok).toBe(true);
    const response = await turn;
    expect(response.result.outcome).toBe('cancelled');
    const db = new Database(path.join(dataRoot, 'a9-state.db'), { readonly: true });
    try {
      for (const table of ['a9_tasks', 'a9_turns', 'a9_runs']) {
        expect((db.prepare(`SELECT status FROM ${table}`).all() as Array<{ status: string }>).map((row) => row.status))
          .toContain('cancelled');
      }
      const events = db.prepare("SELECT event_type, payload_json FROM a9_events WHERE event_type = 'turn_completed'").all() as Array<{ event_type: string; payload_json: string }>;
      expect(events.some((row) => {
        const payload = JSON.parse(row.payload_json);
        return payload.data?.outcome === 'cancelled';
      })).toBe(true);
    } finally { db.close(); }
  } finally {
    runtime.shutdown();
    pending.forEach((res) => res.end());
    await new Promise<void>((resolve) => server.close(() => resolve()));
    fs.rmSync(root, { recursive: true, force: true });
  }
}, 30_000);

/**
 * A9-19 P02 / ADR-0135：运行中模型输出的内存预览。
 *
 * 使用真实运行时（A9AgentLoop/OpenAICompatibleProvider/A9PersistenceManager dist 与 better-sqlite3），
 * 由带延迟的流式夹具模型在轮次进行中采样快照：预览必须在轮次结束前可见，跨 chunk 的秘密及其前缀
 * 不得出现在任何预览里，步边界后预览重新开始，轮次结束后预览消失且最终文本只落盘一次。
 */
/// <reference path="./better-sqlite3.d.ts" />
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

const { createA9AgentRuntime } = require('../../product/a9-agent-runtime') as any;

type Step = { tool?: { id: string; name: string; args: unknown }; content?: string; chunks?: string[]; delayMs?: number };

function sse(res: http.ServerResponse, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function startDelayedModel(script: Step[]): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  let round = 0;
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', async () => {
        const step = script[Math.min(round, script.length - 1)];
        round += 1;
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const chunks = step.chunks || (step.content ? [step.content] : []);
        for (let index = 0; index < chunks.length; index += 1) {
          if (index > 0) await sleep(step.delayMs ?? 0);
          const last = index === chunks.length - 1 && !step.tool;
          sse(res, { choices: [{ delta: { content: chunks[index] }, finish_reason: last ? 'stop' : null }] });
        }
        if (step.tool) {
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: step.tool.id, function: { name: step.tool.name, arguments: JSON.stringify(step.tool.args) } }] }, finish_reason: 'tool_calls' }] });
        }
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${(server.address() as any).port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function openReal(databasePath: string, opts?: { readonly?: boolean }): any {
  return new Database(databasePath, opts?.readonly ? { readonly: true } : {});
}

async function sampleWhile<T>(work: Promise<T>, sample: () => void, everyMs = 25): Promise<T> {
  let done = false;
  const result = work.finally(() => { done = true; });
  while (!done) {
    sample();
    await sleep(everyMs);
  }
  return result;
}

describe('A9-19 live model preview (ADR-0135)', () => {
  let root: string;
  let workspaceRoot: string;
  let dataRoot: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-19-preview-'));
    workspaceRoot = path.join(root, 'ws');
    dataRoot = path.join(root, 'data');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(dataRoot, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('shows redacted streaming text before the turn completes and never exposes a split secret or its prefix', async () => {
    const secret = 'A9-19-SPLIT-PREVIEW-SECRET-7731';
    const lead = '正在分析工作区结构，稍后给出入口文件与依赖关系的说明。'.repeat(4);
    const tail = '以上是结论，入口位于 src/index.ts，其余模块按目录分层。'.repeat(3);
    const fixture = await startDelayedModel([{
      chunks: [lead.slice(0, 40), lead.slice(40), secret.slice(0, 10), secret.slice(10, 20), secret.slice(20), tail],
      delayMs: 120,
    }]);
    let runtime: any;
    try {
      runtime = createA9AgentRuntime({ workspaceRoot, dataRoot, openDatabase: openReal });
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'preview-model', apiKey: secret, skipProbe: true });
      const previews: Array<{ text: string; turnId: string }> = [];
      const turn: any = await sampleWhile(runtime.submitTurn('explain the workspace'), () => {
        const preview = runtime.getSnapshot().liveModelPreview;
        if (preview) previews.push(preview);
      });
      expect(turn.ok).toBe(true);

      const visible = previews.filter((preview) => preview.text.length > 0);
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.some((preview) => preview.text.includes('正在分析工作区结构'))).toBe(true);
      for (const preview of previews) {
        expect(preview.text).not.toContain(secret);
        expect(preview.text).not.toContain(secret.slice(0, 10));
        expect(typeof preview.turnId).toBe('string');
      }

      const after = runtime.getSnapshot();
      expect(after.liveModelPreview).toBeNull();
      const persistedChunks = after.timeline.filter((event: any) => event.type === 'model_chunk');
      expect(persistedChunks).toHaveLength(1);
      expect(persistedChunks[0].data.content).toContain('***redacted***');
      expect(JSON.stringify(after)).not.toContain(secret);
    } finally {
      if (runtime) await runtime.shutdown();
      await fixture.close();
    }
  }, 30_000);

  it('restarts the preview at a step boundary so an earlier step is not repeated', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'calc.ts'), 'export const add = (a: number, b: number) => a + b;\n');
    const stepOne = '第一步：我先读取 calc.ts 确认实现。'.repeat(4);
    const stepTwo = '第二步：实现正确，加法返回两数之和，无需修改。'.repeat(5);
    const fixture = await startDelayedModel([
      { content: stepOne, tool: { id: 'r1', name: 'read', args: { path: 'calc.ts' } } },
      { chunks: [stepTwo.slice(0, 30), stepTwo.slice(30, 80), stepTwo.slice(80)], delayMs: 150 },
    ]);
    let runtime: any;
    try {
      runtime = createA9AgentRuntime({ workspaceRoot, dataRoot, openDatabase: openReal });
      runtime.setMode('full_access');
      await runtime.configureProvider({ baseUrl: fixture.baseUrl, model: 'preview-model', apiKey: 'unused-key-000000', skipProbe: true });
      const previews: string[] = [];
      const turn: any = await sampleWhile(runtime.submitTurn('check calc'), () => {
        const preview = runtime.getSnapshot().liveModelPreview;
        if (preview && preview.text) previews.push(preview.text);
      });
      expect(turn.ok).toBe(true);
      const stepTwoPreviews = previews.filter((text) => text.includes('第二步'));
      expect(stepTwoPreviews.length).toBeGreaterThan(0);
      for (const text of stepTwoPreviews) expect(text).not.toContain('第一步');
      const snapshot = runtime.getSnapshot();
      expect(snapshot.liveModelPreview).toBeNull();
      expect(snapshot.timeline.some((event: any) => event.type === 'model_note' && String(event.data.content).includes('第一步'))).toBe(true);
    } finally {
      if (runtime) await runtime.shutdown();
      await fixture.close();
    }
  }, 30_000);
});

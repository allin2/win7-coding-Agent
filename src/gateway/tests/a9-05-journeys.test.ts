/**
 * A9-05 开发机旅程测试（J1/J2/J4/J5）。
 *
 * 说明（诚实边界）：模型端为本地 OpenAI-compatible fixture（回环地址），
 * Loop/Provider/Workspace/Runner/Git 全部为真实实现；这是开发机旅程证据，
 * 不构成真实模型旅程或 Win7 旅程（REAL_PROVIDER_SMOKE=NOT_PERFORMED）。
 *
 * - J1 项目解释：按需 list/read/search，不预加载全仓库；
 * - J2 缺陷修复：定位→修改→运行验证→已验证完成（COMPLETED + verified）；
 * - J4 Shell 与 Git：真实临时 Git 仓库 + 本地裸远端；git status/add 自主执行，
 *   commit/push 走审批；push 拒绝零副作用、批准后真实推送；
 * - J5 撤销与恢复：轮内文件撤销 + 模拟崩溃重启后从磁盘 checkpoint 恢复，
 *   不重放模型、Shell、Git 或审批。
 */
import { execFileSync } from 'child_process';
import * as http from 'http';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { OpenAICompatibleProvider } from '../src';
import { A9AgentLoop, PermissionMode, TurnOutcome } from '../../core/src';
import { A9WorkspaceService } from '../../workspace/src';
import { TrustedShellRunner, createTrustedShellLoopAdapter } from '../../runner/src';

function sse(res: http.ServerResponse, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

function toolCall(res: http.ServerResponse, id: string, name: string, args: unknown): void {
  sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id, function: { name, arguments: JSON.stringify(args) } }] }, finish_reason: 'tool_calls' }] });
}

function finalAnswer(res: http.ServerResponse, content: string): void {
  sse(res, { choices: [{ delta: { content }, finish_reason: 'stop' }] });
}

interface ScriptedServer {
  baseUrl: string;
  requestBodies: any[];
  close: () => Promise<void>;
}

/** fixture 模型：按脚本顺序返回 tool_calls/最终回答；脚本末项重复。 */
function startScriptedModel(script: Array<{ tool?: { id: string; name: string; args: unknown }; content?: string }>): Promise<ScriptedServer> {
  const requestBodies: any[] = [];
  let round = 0;
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        try { requestBodies.push(JSON.parse(body)); } catch (_e) { requestBodies.push(null); }
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const step = script[Math.min(round, script.length - 1)];
        round += 1;
        if (step.tool) toolCall(res, step.tool.id, step.tool.name, step.tool.args);
        else finalAnswer(res, step.content ?? 'done');
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${(server.address() as any).port}`,
        requestBodies,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString('utf8');
}

describe('A9-05 journeys (dev machine, fixture model, real runtime stack)', () => {
  let workspace: string;

  beforeEach(() => {
    workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-j-'));
  });

  afterEach(() => {
    fs.rmSync(workspace, { recursive: true, force: true });
  });

  it('J1: explains an unknown project using on-demand list/read/search only', async () => {
    // 一个小型“未知项目”。
    fs.mkdirSync(path.join(workspace, 'src'));
    fs.writeFileSync(path.join(workspace, 'AGENTS.md'), '# Rules\nUse structured argv.\n');
    fs.writeFileSync(path.join(workspace, 'src', 'index.ts'), 'export const VERSION = "1.0.0";\n');
    fs.writeFileSync(path.join(workspace, 'package.json'), '{\n  "name": "demo",\n  "version": "1.0.0"\n}\n');
    fs.writeFileSync(path.join(workspace, 'big-generated.txt'), 'noise\n'.repeat(500));

    const model = await startScriptedModel([
      { tool: { id: 'l1', name: 'list', args: {} } },
      { tool: { id: 'r1', name: 'read', args: { path: 'package.json' } } },
      { tool: { id: 's1', name: 'search', args: { pattern: 'VERSION' } } },
      { tool: { id: 'r2', name: 'read', args: { path: 'src/index.ts' } } },
      { content: '该项目是 demo v1.0.0：package.json 定义名称与版本，src/index.ts 导出 VERSION=1.0.0，遵循 AGENTS.md 的结构化 argv 规则。' },
    ]);
    try {
      const loop = new A9AgentLoop({
        workspaceRoot: workspace,
        provider: new OpenAICompatibleProvider({ baseUrl: model.baseUrl, model: 'fixture' }),
        workspaceService: new A9WorkspaceService(workspace),
        runner: createTrustedShellLoopAdapter(new TrustedShellRunner()),
        permissionMode: PermissionMode.FULL_ACCESS,
      });
      const result = await loop.runTurn('解释这个项目的结构和版本');
      expect(result.outcome).toBe(TurnOutcome.COMPLETED);
      expect(result.toolCallsExecuted).toBe(4);
      // 4 次模型请求都在拿到工具结果之后（按需读取，无预加载全仓库：请求 1 只有 user 消息）。
      expect(model.requestBodies[0].messages.length).toBe(2);
      const finalReq = model.requestBodies[model.requestBodies.length - 1];
      const toolContents = finalReq.messages.filter((m: any) => m.role === 'tool').map((m: any) => m.content).join('\n');
      expect(toolContents).toContain('demo');
      expect(toolContents).toContain('VERSION');
    } finally {
      await model.close();
    }
  }, 20_000);

  it('J2: fixes a real defect and reaches verified completion', async () => {
    fs.writeFileSync(path.join(workspace, 'calc.ts'), 'export function add(a: number, b: number) {\n  return a - b;\n}\n');

    const model = await startScriptedModel([
      { tool: { id: 'r1', name: 'read', args: { path: 'calc.ts' } } },
      { tool: { id: 'e1', name: 'edit', args: { path: 'calc.ts', oldText: 'return a - b;', newText: 'return a + b;' } } },
      { tool: { id: 's1', name: 'shell', args: { command: 'node -e "console.log(require(\'assert\').ok) ; console.log(\'tests passed\')"' } } },
      { content: '缺陷已修复：calc.ts 的 add 现在返回 a + b；验证命令已运行并通过。' },
    ]);
    try {
      const loop = new A9AgentLoop({
        workspaceRoot: workspace,
        provider: new OpenAICompatibleProvider({ baseUrl: model.baseUrl, model: 'fixture' }),
        workspaceService: new A9WorkspaceService(workspace),
        runner: createTrustedShellLoopAdapter(new TrustedShellRunner()),
        permissionMode: PermissionMode.FULL_ACCESS,
      });
      const result = await loop.runTurn('修复 calc.ts 里的缺陷并验证');
      // 修改后运行了成功的验证命令 → 已验证完成。
      expect(result.outcome).toBe(TurnOutcome.COMPLETED);
      expect(result.verification).toBe('verified');
      expect(fs.readFileSync(path.join(workspace, 'calc.ts'), 'utf8')).toContain('return a + b;');
    } finally {
      await model.close();
    }
  }, 20_000);

  it('J2-negative: writes without verification end as completed_with_warnings, never fake verified', async () => {
    fs.writeFileSync(path.join(workspace, 'a.ts'), 'const x = 1;\n');
    const model = await startScriptedModel([
      { tool: { id: 'r1', name: 'read', args: { path: 'a.ts' } } },
      { tool: { id: 'e1', name: 'edit', args: { path: 'a.ts', oldText: 'const x = 1;', newText: 'const x = 2;' } } },
      { content: '修改完成。' },
    ]);
    try {
      const loop = new A9AgentLoop({
        workspaceRoot: workspace,
        provider: new OpenAICompatibleProvider({ baseUrl: model.baseUrl, model: 'fixture' }),
        workspaceService: new A9WorkspaceService(workspace),
        runner: createTrustedShellLoopAdapter(new TrustedShellRunner()),
        permissionMode: PermissionMode.FULL_ACCESS,
      });
      const result = await loop.runTurn('把 x 改成 2');
      expect(result.outcome).toBe(TurnOutcome.COMPLETED_WITH_WARNINGS);
      expect(result.verification).toBe('unverified');
    } finally {
      await model.close();
    }
  }, 20_000);

  describe('J4: shell and git with real repository and local bare remote', () => {
    let bareRemote: string;

    beforeEach(() => {
      git(workspace, 'init', '-q', '-b', 'main');
      git(workspace, 'config', 'user.email', 'agent@example.com');
      git(workspace, 'config', 'user.name', 'A9 Agent');
      fs.writeFileSync(path.join(workspace, 'README.md'), '# j4\n');
      git(workspace, 'add', 'README.md');
      git(workspace, 'commit', '-q', '-m', 'init');
      bareRemote = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-j4-remote-'));
      git(bareRemote, 'init', '-q', '--bare', '-b', 'main');
      git(workspace, 'remote', 'add', 'origin', bareRemote);
    });

    afterEach(() => {
      fs.rmSync(bareRemote, { recursive: true, force: true });
    });

    function buildLoop(modelBaseUrl: string): A9AgentLoop {
      return new A9AgentLoop({
        workspaceRoot: workspace,
        provider: new OpenAICompatibleProvider({ baseUrl: modelBaseUrl, model: 'fixture' }),
        workspaceService: new A9WorkspaceService(workspace),
        runner: createTrustedShellLoopAdapter(new TrustedShellRunner()),
        permissionMode: PermissionMode.FULL_ACCESS,
        shellOptions: { kind: 'sh' },
      });
    }

    it('runs status/add autonomously, requires approval for commit, then applies it after approval', async () => {
      fs.writeFileSync(path.join(workspace, 'feature.txt'), 'new feature\n');
      const model = await startScriptedModel([
        { tool: { id: 'st', name: 'shell', args: { command: 'git status --porcelain=v1' } } },
        { tool: { id: 'ad', name: 'shell', args: { command: 'git add feature.txt' } } },
        { tool: { id: 'cm', name: 'shell', args: { command: 'git commit -m "add feature"' } } },
        { content: '已按用户要求提交 feature.txt。' },
      ]);
      try {
        const loop = buildLoop(model.baseUrl);
        const first = await loop.runTurn('查看状态、暂存 feature.txt 并提交');
        // commit 仅在用户明确要求时创建 → 进入审批。
        expect(first.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
        expect(first.pendingApproval?.toolName).toBe('shell');
        expect(first.pendingApproval?.reason).toContain('commit');

        const resumed = await loop.resumeAfterApproval({
          approvalId: first.pendingApproval!.approvalId,
          decision: 'approved',
          bindingDigest: first.pendingApproval!.bindingDigest,
        });
        expect(resumed.outcome).toBe(TurnOutcome.COMPLETED_WITH_WARNINGS);
        expect(git(workspace, 'log', '--oneline')).toContain('add feature');
      } finally {
        await model.close();
      }
    }, 30_000);

    it('denied push has zero side effects on the remote; approved push really pushes', async () => {
      fs.writeFileSync(path.join(workspace, 'to-push.txt'), 'payload\n');
      git(workspace, 'add', 'to-push.txt');
      git(workspace, 'commit', '-q', '-m', 'commit to push');

      // 拒绝路径。
      const denyModel = await startScriptedModel([
        { tool: { id: 'p1', name: 'shell', args: { command: 'git push origin main' } } },
        { content: '推送被拒绝，未执行。' },
      ]);
      try {
        const denyLoop = buildLoop(denyModel.baseUrl);
        const first = await denyLoop.runTurn('推送 main 到 origin');
        expect(first.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
        expect(first.pendingApproval?.reason).toContain('push');
        const denied = await denyLoop.resumeAfterApproval({
          approvalId: first.pendingApproval!.approvalId,
          decision: 'denied',
          bindingDigest: first.pendingApproval!.bindingDigest,
        });
        expect(denied.outcome).toBe(TurnOutcome.BLOCKED);
        // 远端裸仓库没有任何分支引用 → 拒绝零副作用。
        expect(git(bareRemote, 'for-each-ref')).toBe('');
      } finally {
        await denyModel.close();
      }

      // 批准路径：真实推送成功。
      const allowModel = await startScriptedModel([
        { tool: { id: 'p2', name: 'shell', args: { command: 'git push origin main' } } },
        { content: '推送完成。' },
      ]);
      try {
        const allowLoop = buildLoop(allowModel.baseUrl);
        const first = await allowLoop.runTurn('推送 main 到 origin');
        expect(first.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
        const done = await allowLoop.resumeAfterApproval({
          approvalId: first.pendingApproval!.approvalId,
          decision: 'approved',
          bindingDigest: first.pendingApproval!.bindingDigest,
        });
        // push 成功执行且无本地工作区副作用需要验证 → 正常完成。
        expect(done.outcome).toBe(TurnOutcome.COMPLETED);
        expect(git(bareRemote, 'for-each-ref')).toContain('refs/heads/main');
      } finally {
        await allowModel.close();
      }
    }, 40_000);
  });

  it('J5: undoes turn changes and restores a checkpoint after a simulated crash (no replay)', async () => {
    const original = 'const value = 1;\n';
    fs.writeFileSync(path.join(workspace, 'state.ts'), original);

    const model = await startScriptedModel([
      { tool: { id: 'r1', name: 'read', args: { path: 'state.ts' } } },
      { tool: { id: 'e1', name: 'edit', args: { path: 'state.ts', oldText: 'const value = 1;', newText: 'const value = 2;' } } },
      { content: '已修改。' },
    ]);
    let service: A9WorkspaceService | undefined;
    try {
      service = new A9WorkspaceService(workspace);
      const loop = new A9AgentLoop({
        workspaceRoot: workspace,
        provider: new OpenAICompatibleProvider({ baseUrl: model.baseUrl, model: 'fixture' }),
        workspaceService: service,
        runner: createTrustedShellLoopAdapter(new TrustedShellRunner()),
        permissionMode: PermissionMode.FULL_ACCESS,
      });
      const result = await loop.runTurn('把 value 改成 2');
      expect(result.outcome).toBe(TurnOutcome.COMPLETED_WITH_WARNINGS);
      expect(fs.readFileSync(path.join(workspace, 'state.ts'), 'utf8')).toBe('const value = 2;\n');

      // 撤销本轮变化。
      const undo = service.getCheckpointManager().undoTurn(result.turnId);
      expect(undo.errors).toEqual([]);
      expect(fs.readFileSync(path.join(workspace, 'state.ts'), 'utf8')).toBe(original);

      // 重新执行一轮并模拟崩溃：新服务实例从磁盘 checkpoint 恢复。
      const model2 = await startScriptedModel([
        { tool: { id: 'r1', name: 'read', args: { path: 'state.ts' } } },
        { tool: { id: 'e1', name: 'edit', args: { path: 'state.ts', oldText: 'const value = 1;', newText: 'const value = 3;' } } },
        { content: '已修改。' },
      ]);
      try {
        const crashLoop = new A9AgentLoop({
          workspaceRoot: workspace,
          provider: new OpenAICompatibleProvider({ baseUrl: model2.baseUrl, model: 'fixture' }),
          workspaceService: service,
          runner: createTrustedShellLoopAdapter(new TrustedShellRunner()),
          permissionMode: PermissionMode.FULL_ACCESS,
        });
        const second = await crashLoop.runTurn('把 value 改成 3');
        expect(fs.readFileSync(path.join(workspace, 'state.ts'), 'utf8')).toBe('const value = 3;\n');

        // 崩溃：丢弃内存态，重建服务（重启等价物），仅恢复事实，不重放任何动作。
        const revived = new A9WorkspaceService(workspace);
        const restored = revived.getCheckpointManager().loadCheckpoint(second.turnId);
        expect(restored).toBeDefined();
        const undoAfterCrash = revived.getCheckpointManager().undoTurn(second.turnId);
        expect(undoAfterCrash.errors).toEqual([]);
        expect(fs.readFileSync(path.join(workspace, 'state.ts'), 'utf8')).toBe(original);
      } finally {
        await model2.close();
      }
    } finally {
      await model.close();
    }
  }, 30_000);
});

/**
 * A9-05 开发机旅程测试（R5 重建：行为化 fixture，真实项目与真实测试命令）。
 *
 * 证据分级（诚实边界）：
 * - FIXTURE MODEL：模型端为回环行为化 fixture（根据收到的 messages 与 tool 结果
 *   决定下一步，不按剧本盲吐）；Loop/Workspace/Runner/Git/Runtime/SQLite 均为真实实现。
 * - REAL MODEL J1～J3：J2 已由 DeepSeek 真实 Provider 完成 verified 修复/测试；
 *   J1/J3 的自动验收已装配在真实 Provider smoke，仍等待外部执行结果。
 * - Windows PS/CMD/DPI：NOT_PERFORMED（非 Windows 环境只记录 sh/dev_host_only）。
 */
import { execFileSync, spawn } from 'child_process';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as http from 'http';
import * as os from 'os';
import * as path from 'path';

import { OpenAICompatibleProvider } from '../src';
import { A9AgentLoop, PermissionMode, TurnOutcome, canonicalizeWorkspacePath } from '../../core/src';
import { A9WorkspaceService } from '../../workspace/src';
import { TrustedShellRunner, createTrustedShellLoopAdapter } from '../../runner/src';

// ---------------------------------------------------------------------------
// 行为化 fixture 模型
// ---------------------------------------------------------------------------

interface ToolStep { tool: { id: string; name: string; args: unknown } }
type NextStep = ToolStep | { content: string } | { done: true; content?: string };

/** behave(seen) 基于已回执的工具结果决定下一步；seen 为 `${name}:${content前缀}` 列表。 */
function startBehaviorModel(behave: (seen: string[], fullMessages: any[]) => NextStep): Promise<{ baseUrl: string; close: () => Promise<void>; requests: any[] }> {
  const requests: any[] = [];
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        let parsed: any = null;
        try { parsed = JSON.parse(body); } catch (_e) { /* keep */ }
        requests.push(parsed);
        const messages = parsed?.messages ?? [];
        const seen: string[] = messages
          .filter((m: any) => m.role === 'tool' && m.name !== 'probe_test_echo')
          .map((m: any) => `${m.name}:${String(m.content).slice(0, 400)}`);
        const next = behave(seen, messages);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const send = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
        if ((next as any).tool) {
          const t = (next as any).tool;
          send({ choices: [{ delta: { tool_calls: [{ index: 0, id: t.id, function: { name: t.name, arguments: JSON.stringify(t.args) } }] }, finish_reason: 'tool_calls' }] });
        } else {
          send({ choices: [{ delta: { content: (next as any).content ?? (next as any).done ? ((next as any).content ?? 'done') : 'done' }, finish_reason: 'stop' }] });
        }
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${(server.address() as any).port}`,
        requests,
        close: () => new Promise<void>((done) => server.close(() => done())),
      });
    });
  });
}

function toolResultContents(messages: any[]): string {
  return messages.filter((m) => m.role === 'tool' && m.name !== 'probe_test_echo').map((m) => String(m.content)).join('\n--\n');
}

function makeLoop(workspaceRoot: string, baseUrl: string, extra: Record<string, unknown> = {}) {
  const service = new A9WorkspaceService(workspaceRoot);
  const loop = new A9AgentLoop({
    workspaceRoot,
    provider: new OpenAICompatibleProvider({ baseUrl, model: 'fixture-model' }),
    workspaceService: service,
    runner: createTrustedShellLoopAdapter(new TrustedShellRunner()),
    permissionMode: PermissionMode.FULL_ACCESS,
    externalChangePort: service,
    ...extra,
  });
  return { loop, service };
}

// ---------------------------------------------------------------------------
// J1：项目解释（必须实际读取 AGENTS.md；文件引用来自工具结果）
// ---------------------------------------------------------------------------

describe('J1 (FIXTURE MODEL): project explanation reads AGENTS.md and real config', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-j1-'));
    fs.writeFileSync(path.join(workspaceRoot, 'AGENTS.md'), '# Rules\nAlways use structured argv; tests must actually run.\n');
    fs.writeFileSync(path.join(workspaceRoot, 'package.json'), '{\n  "name": "demo-app",\n  "version": "1.4.2"\n}\n');
    fs.mkdirSync(path.join(workspaceRoot, 'src'));
    fs.writeFileSync(path.join(workspaceRoot, 'src', 'index.ts'), 'export const VERSION = "1.4.2";\n');
    fs.writeFileSync(path.join(workspaceRoot, 'big-generated.txt'), 'noise\n'.repeat(50));
  });

  afterEach(() => { fs.rmSync(workspaceRoot, { recursive: true, force: true }); });

  it('reads AGENTS.md, project config and a source file on demand; answer cites only read files', async () => {
    const model = await startBehaviorModel((seen, messages) => {
      // 行为锚点基于工具结果内容（而非文件名出现在内容中的假设）。
      if (!seen.some((e) => e.startsWith('list:'))) return { tool: { id: 'l1', name: 'list', args: {} } };
      if (!seen.some((e) => e.startsWith('read:') && e.includes('structured argv'))) return { tool: { id: 'a1', name: 'read', args: { path: 'AGENTS.md' } } };
      if (!seen.some((e) => e.startsWith('read:') && e.includes('demo-app'))) return { tool: { id: 'p1', name: 'read', args: { path: 'package.json' } } };
      if (!seen.some((e) => e.startsWith('search:'))) return { tool: { id: 's1', name: 'search', args: { pattern: 'VERSION' } } };
      if (!seen.some((e) => e.startsWith('read:') && e.includes('export const VERSION'))) return { tool: { id: 'i1', name: 'read', args: { path: 'src/index.ts' } } };
      // 最终回答只引用已读文件（fixture 从真实工具结果构造答案）。
      const contents = toolResultContents(messages);
      const files = ['AGENTS.md', 'package.json', 'src/index.ts'].filter((f) => contents.includes(f));
      return { done: true, content: `Project explained from ${files.join(', ')}: version 1.4.2, rules require real test runs.` };
    });
    try {
      const { loop } = makeLoop(workspaceRoot, model.baseUrl);
      const result = await loop.runTurn('解释这个项目');
      expect(result.outcome).toBe(TurnOutcome.COMPLETED);

      const finalRequest = model.requests[model.requests.length - 1];
      const toolContents = toolResultContents(finalRequest.messages);
      // 必须实际读取 AGENTS.md（未读取则本断言失败）。
      expect(toolContents).toContain('structured argv');
      expect(toolContents).toContain('demo-app');
      expect(toolContents).toContain('VERSION');
      // 最终答案中的文件引用必须能从工具结果得到。
      for (const file of ['AGENTS.md', 'package.json', 'src/index.ts']) {
        expect(result.finalMessage).toContain(file);
        expect(toolContents).toContain(file);
      }
      // 未预加载全仓库：第一次请求只有 system+user 两条消息。
      expect(model.requests[0].messages.length).toBe(2);
    } finally {
      await model.close();
    }
  }, 30_000);
});

// ---------------------------------------------------------------------------
// J2：缺陷修复（真实可运行项目；同一测试先失败后通过）
// ---------------------------------------------------------------------------

function writeJ2Project(workspaceRoot: string, buggy: boolean) {
  fs.writeFileSync(path.join(workspaceRoot, 'calc.js'), buggy
    ? 'exports.add = (a, b) => a - b;\n'
    : 'exports.add = (a, b) => a + b;\n');
  // 测试命令必须导入并执行被修改模块（禁止只打印 tests passed）。
  fs.writeFileSync(path.join(workspaceRoot, 'test.js'), [
    "const calc = require('./calc.js');",
    'if (calc.add(1, 2) !== 3) { console.error("FAIL: add(1,2) =", calc.add(1, 2)); process.exit(1); }',
    'console.log("PASS: add works");',
    '',
  ].join('\n'));
}

describe('J2 (FIXTURE MODEL): bug fix with a real failing-then-passing test', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-j2-'));
    writeJ2Project(workspaceRoot, true);
  });

  afterEach(() => { fs.rmSync(workspaceRoot, { recursive: true, force: true }); });

  it('runs the real test before (fails) and after (passes) the fix; completion is verified', async () => {
    const model = await startBehaviorModel((seen) => {
      if (!seen.some((e) => e.startsWith('shell:'))) {
        return { tool: { id: 't0', name: 'shell', args: { command: 'node test.js' } } };
      }
      const tested = seen.some((e) => e.startsWith('shell:') && e.includes('PASS: add works'));
      if (!tested) {
        if (!seen.some((e) => e.startsWith('read:'))) return { tool: { id: 'r1', name: 'read', args: { path: 'calc.js' } } };
        if (!seen.some((e) => e.startsWith('edit:'))) return { tool: { id: 'e1', name: 'edit', args: { path: 'calc.js', oldText: 'a - b', newText: 'a + b' } } };
        return { tool: { id: 't1', name: 'shell', args: { command: 'node test.js' } } };
      }
      return { done: true, content: 'calc.js add fixed; node test.js now passes (was failing before the fix).' };
    });
    try {
      const { loop } = makeLoop(workspaceRoot, model.baseUrl);
      const result = await loop.runTurn('修复 add 并运行测试');
      expect(result.outcome).toBe(TurnOutcome.COMPLETED);
      expect(result.verification).toBe('verified');

      // 修改前测试真实失败、修改后同一命令真实通过。
      const firstTest = model.requests.find((r) => toolResultContents(r.messages).includes('FAIL: add(1,2)'));
      const passingTest = model.requests.find((r) => toolResultContents(r.messages).includes('PASS: add works'));
      expect(firstTest).toBeDefined();
      expect(passingTest).toBeDefined();
      expect(fs.readFileSync(path.join(workspaceRoot, 'calc.js'), 'utf8')).toContain('a + b');
    } finally {
      await model.close();
    }
  }, 30_000);

  it('recovers from a first wrong fix when the test still fails, then verifies', async () => {
    const model = await startBehaviorModel((seen) => {
      const edits = seen.filter((e) => e.startsWith('edit:')).length;
      const passing = seen.some((e) => e.startsWith('shell:') && e.includes('PASS: add works'));
      if (!seen.some((e) => e.startsWith('read:'))) return { tool: { id: 'r1', name: 'read', args: { path: 'calc.js' } } };
      if (edits === 0) {
        // 第一次修复：改错方向（仍会失败）。
        return { tool: { id: 'e1', name: 'edit', args: { path: 'calc.js', oldText: 'a - b', newText: 'a - b - 0' } } };
      }
      if (!passing) {
        if (edits === 1 && seen.some((e) => e.startsWith('shell:'))) {
          // 测试仍失败 → 根据失败继续修复。
          return { tool: { id: 'e2', name: 'edit', args: { path: 'calc.js', oldText: 'a - b - 0', newText: 'a + b' } } };
        }
        return { tool: { id: 't1', name: 'shell', args: { command: 'node test.js' } } };
      }
      return { done: true, content: 'Second fix landed after the first attempt still failed the real test.' };
    });
    try {
      const { loop } = makeLoop(workspaceRoot, model.baseUrl);
      const result = await loop.runTurn('修复 add');
      expect(result.outcome).toBe(TurnOutcome.COMPLETED);
      expect(result.verification).toBe('verified');
      // 两轮真实测试执行：一次失败（改错后），一次通过（改对后）。
      const contents = toolResultContents(model.requests[model.requests.length - 1].messages);
      expect(contents).toContain('FAIL: add(1,2)');
      expect(contents).toContain('PASS: add works');
      expect(fs.readFileSync(path.join(workspaceRoot, 'calc.js'), 'utf8')).toContain('a + b');
    } finally {
      await model.close();
    }
  }, 30_000);
});

// ---------------------------------------------------------------------------
// J3：小功能（跨两个源码文件 + 一个测试文件 + 真实项目脚本）
// ---------------------------------------------------------------------------

describe('J3 (FIXTURE MODEL): cross-file feature with real project script', () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-j3-'));
    fs.writeFileSync(path.join(workspaceRoot, 'stringUtils.js'), 'exports.capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);\n');
    fs.writeFileSync(path.join(workspaceRoot, 'run-checks.js'), "require('./testSlug.js'); console.log('script: all checks done');\n");
  });

  afterEach(() => { fs.rmSync(workspaceRoot, { recursive: true, force: true }); });

  it('implements slugify across two files plus a test, runs the real script, stays in scope', async () => {
    const model = await startBehaviorModel((seen) => {
      const scriptRan = seen.some((e) => e.startsWith('shell:') && e.includes('all checks done'));
      if (!seen.some((e) => e.startsWith('read:') && e.includes('capitalize'))) return { tool: { id: 'r1', name: 'read', args: { path: 'stringUtils.js' } } };
      if (!seen.some((e) => e.startsWith('edit:'))) {
        return { tool: { id: 'e1', name: 'edit', args: { path: 'stringUtils.js', oldText: 'exports.capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);', newText: "exports.capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);\nexports.slugify = (s) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');" } } };
      }
      if (!seen.some((e) => e.startsWith('write:') && e.includes('slug.js'))) {
        return { tool: { id: 'w1', name: 'write', args: { path: 'slug.js', content: "const { slugify } = require('./stringUtils.js');\nmodule.exports = { slugify, kebab: (s) => slugify(s) };\n" } } };
      }
      if (!seen.some((e) => e.startsWith('write:') && e.includes('testSlug.js'))) {
        return { tool: { id: 'w2', name: 'write', args: { path: 'testSlug.js', content: "const { slugify, capitalize } = require('./stringUtils.js');\nconst slug = require('./slug.js');\nif (slugify('Hello World') !== 'hello-world') { console.error('SLUG FAIL'); process.exit(1); }\nif (slug.kebab('A B') !== 'a-b') { console.error('SLUG FAIL'); process.exit(1); }\nif (capitalize('x') !== 'X') { console.error('SLUG FAIL'); process.exit(1); }\nconsole.log('SLUG PASS');\n" } } };
      }
      if (!scriptRan) {
        return { tool: { id: 's1', name: 'shell', args: { command: 'node run-checks.js' } } };
      }
      return { done: true, content: 'slugify implemented across stringUtils.js + slug.js with testSlug.js; project script run-checks.js passes.' };
    });
    try {
      const { loop, service } = makeLoop(workspaceRoot, model.baseUrl);
      const result = await loop.runTurn('实现 slugify 小功能并验证');
      expect(result.outcome).toBe(TurnOutcome.COMPLETED);
      expect(result.verification).toBe('verified');

      // 真实文件与测试结果可核验。
      expect(fs.readFileSync(path.join(workspaceRoot, 'stringUtils.js'), 'utf8')).toContain('exports.slugify');
      expect(fs.existsSync(path.join(workspaceRoot, 'slug.js'))).toBe(true);
      const contents = toolResultContents(model.requests[model.requests.length - 1].messages);
      expect(contents).toContain('SLUG PASS');
      expect(contents).toContain('all checks done');

      // 不做无关重构：本轮变更只涉及功能相关文件。
      const changed = service.getCheckpointManager().getTurnDiff(result.turnId).map((d) => d.path);
      for (const p of changed) {
        expect(['stringUtils.js', 'slug.js', 'testSlug.js', 'run-checks.js']).toContain(p);
      }
    } finally {
      await model.close();
    }
  }, 40_000);
});

// ---------------------------------------------------------------------------
// J4：Shell 与 Git（真实临时仓库 + 裸远端；git pull 自主；push 审批绑定）
// ---------------------------------------------------------------------------

describe('J4 (FIXTURE MODEL, sh/dev_host_only): shell and git with real repo and bare remote', () => {
  let workspaceRoot: string;
  let bareRemote: string;

  function git(cwd: string, ...args: string[]): string {
    return execFileSync('git', args, { cwd, stdio: 'pipe' }).toString('utf8');
  }

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-j4-'));
    git(workspaceRoot, 'init', '-q', '-b', 'main');
    git(workspaceRoot, 'config', 'user.email', 'agent@example.com');
    git(workspaceRoot, 'config', 'user.name', 'A9 Agent');
    fs.writeFileSync(path.join(workspaceRoot, 'README.md'), '# j4\n');
    git(workspaceRoot, 'add', 'README.md');
    git(workspaceRoot, 'commit', '-q', '-m', 'init');
    bareRemote = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-j4-remote-'));
    git(bareRemote, 'init', '-q', '--bare', '-b', 'main');
    git(workspaceRoot, 'remote', 'add', 'origin', bareRemote);
    // 同步基线：先推送 init，使后续 pull 可以 fast-forward（避免分叉冲突）。
    git(workspaceRoot, 'push', '-q', 'origin', 'main');
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
    fs.rmSync(bareRemote, { recursive: true, force: true });
  });

  function buildLoop(baseUrl: string) {
    return makeLoop(workspaceRoot, baseUrl, { shellOptions: { kind: 'sh' } });
  }

  it('classifies git pull as autonomous and really pulls from the bare remote', async () => {
    // 在远端制造一个新提交（经第二个克隆推送）。
    const helper = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-j4-helper-'));
    try {
      git(helper, 'clone', '-q', bareRemote, 'repo');
      const repoDir = path.join(helper, 'repo');
      git(repoDir, 'config', 'user.email', 'helper@example.com');
      git(repoDir, 'config', 'user.name', 'Helper');
      fs.writeFileSync(path.join(repoDir, 'remote-note.txt'), 'from remote\n');
      git(repoDir, 'add', 'remote-note.txt');
      git(repoDir, 'commit', '-q', '-m', 'remote change');
      git(repoDir, 'push', '-q', 'origin', 'main');

      const model = await startBehaviorModel((seen) => {
        if (!seen.some((e) => e.startsWith('shell:'))) {
          return { tool: { id: 'p1', name: 'shell', args: { command: 'git pull origin main' } } };
        }
        return { done: true, content: 'pulled' };
      });
      try {
        const { loop } = buildLoop(model.baseUrl);
        const result = await loop.runTurn('拉取远端更新');
        // pull 自主执行：不进入审批。
        expect(result.outcome).not.toBe(TurnOutcome.NEEDS_APPROVAL);
        expect(fs.existsSync(path.join(workspaceRoot, 'remote-note.txt'))).toBe(true);
        // pull 修改工作区且无验证 → 诚实带警告完成。
        expect(result.outcome).toBe(TurnOutcome.COMPLETED_WITH_WARNINGS);
      } finally {
        await model.close();
      }
    } finally {
      fs.rmSync(helper, { recursive: true, force: true });
    }
  }, 40_000);

  it('commit requires approval; the pending approval binds the real git target; denial is zero-side-effect', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'feature.txt'), 'feature\n');
    git(workspaceRoot, 'add', 'feature.txt');
    const model = await startBehaviorModel((seen, messages) => {
      const committed = seen.some((e) => e.startsWith('shell:') && e.includes('"exitCode": 0'));
      const lastUser = [...messages].reverse().find((m: any) => m.role === 'user');
      const isRetry = String(lastUser?.content ?? '').includes('再次尝试');
      if (committed) return { done: true, content: 'committed after approval' };
      if (!seen.some((e) => e.startsWith('shell:')) || (isRetry && seen.some((e) => e.includes('denied')))) {
        return { tool: { id: 'c1', name: 'shell', args: { command: 'git commit -a -m "add feature"' } } };
      }
      return { done: true, content: 'denied; not committed' };
    });
    try {
      const { loop } = buildLoop(model.baseUrl);
      const first = await loop.runTurn('提交 feature.txt');
      expect(first.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
      expect(first.pendingApproval?.toolName).toBe('shell');
      expect(first.pendingApproval?.gitBinding).toBeDefined();
      expect(first.pendingApproval?.gitBinding?.commandSha256).toMatch(/^[0-9a-f]{64}$/);
      expect(first.pendingApproval?.summary).toContain('git commit');

      const denied = await loop.resumeAfterApproval({
        approvalId: first.pendingApproval!.approvalId,
        decision: 'denied',
        bindingDigest: first.pendingApproval!.bindingDigest,
      });
      expect(denied.outcome).toBe(TurnOutcome.BLOCKED);
      expect(git(workspaceRoot, 'log', '--oneline')).not.toContain('add feature');

      // 批准后真实提交（携带完整绑定回复）。
      const second = await loop.runTurn('再次尝试提交');
      expect(second.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
      await loop.resumeAfterApproval({
        approvalId: second.pendingApproval!.approvalId,
        decision: 'approved',
        bindingDigest: second.pendingApproval!.bindingDigest,
      });
      expect(git(workspaceRoot, 'log', '--oneline')).toContain('add feature');
    } finally {
      await model.close();
    }
  }, 40_000);

  it('push denial leaves the remote untouched; approved push with binding lands', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'to-push.txt'), 'payload\n');
    git(workspaceRoot, 'add', 'to-push.txt');
    git(workspaceRoot, 'commit', '-q', '-m', 'commit to push');
    const remoteRefBefore = git(bareRemote, 'for-each-ref');

    const denyModel = await startBehaviorModel((seen) => {
      if (!seen.some((e) => e.startsWith('shell:'))) {
        return { tool: { id: 'p1', name: 'shell', args: { command: 'git push origin main' } } };
      }
      return { done: true, content: 'push was denied' };
    });
    try {
      const denyLoop = buildLoop(denyModel.baseUrl).loop;
      const first = await denyLoop.runTurn('推送');
      expect(first.outcome).toBe(TurnOutcome.NEEDS_APPROVAL);
      expect(first.pendingApproval?.gitBinding?.remote).toBe('origin');
      expect(first.pendingApproval?.gitBinding?.branch).toBe('main');
      expect(first.pendingApproval?.gitBinding?.force).toBe(false);
      const denied = await denyLoop.resumeAfterApproval({
        approvalId: first.pendingApproval!.approvalId,
        decision: 'denied',
        bindingDigest: first.pendingApproval!.bindingDigest,
      });
      expect(denied.outcome).toBe(TurnOutcome.BLOCKED);
      // 拒绝零副作用：远端 ref 保持推送前状态（hash 不变）。
      expect(git(bareRemote, 'for-each-ref')).toBe(remoteRefBefore);
    } finally {
      await denyModel.close();
    }

    const allowModel = await startBehaviorModel((seen) => {
      if (!seen.some((e) => e.startsWith('shell:'))) {
        return { tool: { id: 'p2', name: 'shell', args: { command: 'git push origin main' } } };
      }
      return { done: true, content: 'pushed' };
    });
    try {
      const allowLoop = buildLoop(allowModel.baseUrl).loop;
      const first = await allowLoop.runTurn('推送');
      const done = await allowLoop.resumeAfterApproval({
        approvalId: first.pendingApproval!.approvalId,
        decision: 'approved',
        bindingDigest: first.pendingApproval!.bindingDigest,
      });
      expect(done.outcome).toBe(TurnOutcome.COMPLETED);
      // 批准后真实推送：远端 ref 前进到本地 HEAD。
      const localHead = git(workspaceRoot, 'rev-parse', 'HEAD').trim();
      expect(git(bareRemote, 'for-each-ref')).toContain(localHead);
    } finally {
      await allowModel.close();
    }
  }, 60_000);
});

// ---------------------------------------------------------------------------
// J5：撤销与恢复（产品 A9 Runtime + 真实 SQLite；真实子进程崩溃后重启）
// ---------------------------------------------------------------------------

/** 延迟 fixture：read 工具回执后不结束响应（保持 Turn active），可解锁。 */
function startStallFixture(): Promise<{ baseUrl: string; close: () => Promise<void>; release: () => void }> {
  let released = false;
  const pending: import('http').ServerResponse[] = [];
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        const sse = (obj: unknown) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
        const toolMsgs = (parsed.messages ?? []).filter((m: any) => m.role === 'tool' && m.name !== 'probe_test_echo');
        if (toolMsgs.length === 0) {
          sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'r1', function: { name: 'read', arguments: '{"path":"note.txt"}' } }] }, finish_reason: 'tool_calls' }] });
          res.write('data: [DONE]\n\n');
          res.end();
        } else if (released) {
          sse({ choices: [{ delta: { content: 'late final' }, finish_reason: 'stop' }] });
          res.write('data: [DONE]\n\n');
          res.end();
        } else {
          pending.push(res); // 不结束：模型“停住”，Turn 保持 active。
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({
        baseUrl: `http://127.0.0.1:${(server.address() as any).port}`,
        close: () => new Promise<void>((done) => server.close(() => done())),
        release: () => {
          released = true;
          for (const res of pending.splice(0)) {
            res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'late final' }, finish_reason: 'stop' }] })}\n\n`);
            res.write('data: [DONE]\n\n');
            res.end();
          }
        },
      });
    });
  });
}

describe('J5 (FIXTURE MODEL): product runtime undo and restart recovery with real SQLite', () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createA9AgentRuntime } = require('../../shell/product/a9-agent-runtime') as any;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { A9PersistenceManager } = require('../../state/dist') as any;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Database = require('better-sqlite3') as any;

  let root: string;
  let workspaceRoot: string;
  let dataRoot: string;

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-j5-'));
    workspaceRoot = path.join(root, 'ws');
    dataRoot = path.join(root, 'data');
    fs.mkdirSync(workspaceRoot, { recursive: true });
    fs.mkdirSync(dataRoot, { recursive: true });
    fs.writeFileSync(path.join(workspaceRoot, 'state.ts'), 'const value = 1;\n');
    fs.writeFileSync(path.join(workspaceRoot, 'note.txt'), 'n\n');
  });

  afterEach(() => { fs.rmSync(root, { recursive: true, force: true }); });

  function makeRuntime() {
    return createA9AgentRuntime({
      workspaceRoot,
      dataRoot,
      ownerId: `j5-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      openDatabase: (p: string, o?: { readonly?: boolean }) => new Database(p, o?.readonly ? { readonly: true } : {}),
    });
  }

  it('recovers mode/provider/checkpoint/interruption after a real subprocess crash, without replay', async () => {
    const model = await startBehaviorModel((seen) => {
      const readTargets = seen.filter((e) => e.startsWith('read:')).map((e) => e.slice(5, 60));
      if (!readTargets.some((t) => t.includes('state.ts'))) return { tool: { id: 'r1', name: 'read', args: { path: 'state.ts' } } };
      if (!seen.some((e) => e.startsWith('edit:'))) return { tool: { id: 'e1', name: 'edit', args: { path: 'state.ts', oldText: 'const value = 1;', newText: 'const value = 2;' } } };
      return { done: true, content: 'edited state.ts' };
    });
    const stall = await startStallFixture();
    const markerFile = path.join(root, 'crash.marker');
    try {
      // 第一段进程：模式、Provider、已完成任务与 checkpoint。
      const runtime1 = makeRuntime();
      runtime1.setMode('full_access');
      await runtime1.configureProvider({ baseUrl: model.baseUrl, model: 'fixture-model', skipProbe: true });
      const turn = await runtime1.submitTurn('把 value 改成 2');
      expect(turn.ok).toBe(true);
      expect(fs.readFileSync(path.join(workspaceRoot, 'state.ts'), 'utf8')).toBe('const value = 2;\n');
      runtime1.shutdown();

      // 真实子进程崩溃：启动 runtime，确认 active task/turn/run 已落库后 exit(70)
      // （不 shutdown、不清理），模拟进程崩溃留下的活动状态。
      const childLog = path.join(root, 'child.log');
      const logStream = fs.openSync(childLog, 'a');
      const child = spawn(process.execPath, [path.join(__dirname, '..', '..', 'shell', 'tests', 'product', 'a9-f5-crash-child.cjs')], {
        env: {
          ...process.env,
          A9_F5_WORKSPACE: workspaceRoot,
          A9_F5_DATAROOT: dataRoot,
          A9_F5_FIXTURE_URL: stall.baseUrl,
          A9_F5_MARKER: markerFile,
        },
        stdio: ['ignore', 'ignore', logStream],
      });
      child.on('exit', () => { fs.closeSync(logStream); });
      const markerDeadline = Date.now() + 30_000;
      while (!fs.existsSync(markerFile) && Date.now() < markerDeadline) {
        await new Promise((r) => setTimeout(r, 200));
      }
      expect(fs.existsSync(markerFile)).toBe(true);
      // 子进程用 pid 存活探测等待退出（jest 下 exit 事件可能不投递）。
      const exitDeadline = Date.now() + 15_000;
      let exited = false;
      while (Date.now() < exitDeadline) {
        const childPid = child.pid ?? 0;
        try { process.kill(childPid, 0); await new Promise((r) => setTimeout(r, 150)); } catch (_e) { exited = true; break; }
      }
      expect(exited).toBe(true);
      expect(child.exitCode).toBe(70);

      // 第二段进程：运行时重建（模拟重启）→ active → interrupted，只恢复事实。
      const runtime2 = makeRuntime();
      const snapshot = runtime2.getSnapshot();
      expect(snapshot.mode).toBe('full_access');
      expect(snapshot.provider.configured).toBe(true);
      // 子进程最后持久化的 Provider 配置（stall fixture）被恢复；非秘密配置不丢失。
      expect(snapshot.provider.baseUrl).toBe(stall.baseUrl);
      expect(snapshot.provider.model).toBe('fixture');
      expect(snapshot.checkpoints.length).toBeGreaterThanOrEqual(1);
      // 真实中断事实：task/turn/run 三个层级都从 active → interrupted。
      expect(snapshot.interruptions.some((i: any) => i.kind === 'task')).toBe(true);
      expect(snapshot.interruptions.some((i: any) => i.kind === 'turn')).toBe(true);
      expect(snapshot.interruptions.some((i: any) => i.kind === 'run')).toBe(true);
      // 不自动重放：时间线为空（没有自动执行任何模型/Shell/Git/审批）。
      expect(snapshot.timeline).toEqual([]);

      // 撤销恢复真实文件内容（已完成轮的 checkpoint）。
      const undo = runtime2.undoTurn(turn.result.turnId);
      expect(undo.ok).toBe(true);
      expect(undo.outcome.errors).toEqual([]);
      expect(fs.readFileSync(path.join(workspaceRoot, 'state.ts'), 'utf8')).toBe('const value = 1;\n');
      runtime2.shutdown();

      // A9PersistenceManager 直接打开同一数据库可读取 checkpoint 事实（真实 SQLite）。
      const canonical = canonicalizeWorkspacePath(workspaceRoot);
      const a9SessionId = `a9-${crypto.createHash('sha256').update(canonical, 'utf8').digest('hex').slice(0, 16)}`;
      const persistence = A9PersistenceManager.open({
        databasePath: path.join(dataRoot, 'a9-state.db'),
        openDatabase: (p: string, o?: { readonly?: boolean }) => new Database(p, o?.readonly ? { readonly: true } : {}),
        dataRoot,
      });
      expect(persistence.status).toBe('ready');
      if (persistence.status === 'ready') {
        expect(persistence.manager.listCheckpoints(a9SessionId).length).toBeGreaterThanOrEqual(1);
      }
    } finally {
      stall.release();
      await model.close();
      await stall.close();
    }
  }, 90_000);
});

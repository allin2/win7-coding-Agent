/**
 * R3 回归测试：Shell/项目脚本变化进入 checkpoint/Diff/undo，验证语义诚实。
 *
 * 复现缺陷：Shell 执行 `printf changed > via-shell.txt` 后文件存在，
 * 但 getDiff(turnId)=[]、undoTurn 报未找到 Checkpoint、Turn 被标
 * completed/not_applicable。
 * 全部使用真实 A9AgentLoop + A9WorkspaceService（含外部变化端口）+
 * TrustedShellRunner；模型端为回环 fixture。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { OpenAICompatibleProvider } from '../src';
import { A9AgentLoop, PermissionMode, TurnOutcome, isNonVerifyingCommand } from '../../core/src';
import { A9WorkspaceService } from '../../workspace/src';
import { TrustedShellRunner, createTrustedShellLoopAdapter } from '../../runner/src';
import type { A9ExternalChangePort } from '../../core/src';

function sse(res: import('http').ServerResponse, obj: unknown): void {
  res.write(`data: ${JSON.stringify(obj)}\n\n`);
}

/** 行为化 fixture：按已发生的事件序列给出 tool_calls，直到最终回答。 */
function startBehaviorModel(behave: (seen: string[]) => { tool?: { id: string; name: string; args: unknown }; content?: string } | { content: string }) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const http = require('http');
  const seen: string[] = [];
  return new Promise<{ baseUrl: string; close: () => Promise<void> }>((resolve) => {
    const server = http.createServer((req: any, res: any) => {
      let body = '';
      req.on('data', (d: Buffer) => { body += d.toString('utf8'); });
      req.on('end', () => {
        const parsed = JSON.parse(body);
        // 从 tool 消息重建“已发生事件”签名（name + 关键结果片段）。
        seen.length = 0;
        for (const m of parsed.messages ?? []) {
          if (m.role === 'tool') seen.push(`${m.name}:${String(m.content).slice(0, 60)}`);
        }
        const next = behave(seen);
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        if ((next as any).tool) {
          const t = (next as any).tool;
          sse(res, { choices: [{ delta: { tool_calls: [{ index: 0, id: t.id, function: { name: t.name, arguments: JSON.stringify(t.args) } }] }, finish_reason: 'tool_calls' }] });
        } else {
          sse(res, { choices: [{ delta: { content: (next as any).content ?? 'done' }, finish_reason: 'stop' }] });
        }
        res.write('data: [DONE]\n\n');
        res.end();
      });
    });
    server.listen(0, '127.0.0.1', () => {
      resolve({ baseUrl: `http://127.0.0.1:${(server.address() as any).port}`, close: () => new Promise<void>((d) => server.close(() => d())) });
    });
  });
}

describe('R3: isNonVerifyingCommand classifier', () => {
  it('treats pure output/inspection commands as non-verifying', () => {
    for (const cmd of ['echo done', 'echo "tests passed"', 'printf ok', 'ls -la', 'cat out.txt', 'type main.ts', 'pwd', 'true', 'dir /b']) {
      expect(`${cmd} => ${isNonVerifyingCommand(cmd)}`).toBe(`${cmd} => true`);
    }
  });

  it('treats runner-involved commands as verification candidates', () => {
    for (const cmd of ['npm test', 'node test.js', 'python -m pytest', 'echo hi | node -e "process.exit(0)"', 'bash -c "npm test"', 'npx jest']) {
      expect(`${cmd} => ${isNonVerifyingCommand(cmd)}`).toBe(`${cmd} => false`);
    }
  });
});

describe('R3: shell-created/modified/deleted files enter diff and undo (real loop)', () => {
  let workspaceRoot: string;
  let service: A9WorkspaceService;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-r3-'));
    service = new A9WorkspaceService(workspaceRoot);
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  async function runLoop(model: { baseUrl: string; close: () => Promise<void> }) {
    const loop = new A9AgentLoop({
      workspaceRoot,
      provider: new OpenAICompatibleProvider({ baseUrl: model.baseUrl, model: 'fixture' }),
      workspaceService: service,
      runner: createTrustedShellLoopAdapter(new TrustedShellRunner()),
      permissionMode: PermissionMode.FULL_ACCESS,
      externalChangePort: service as unknown as A9ExternalChangePort,
    });
    return loop.runTurn('do the shell work');
  }

  it('reproduced defect is fixed: shell-created file appears in diff and undo deletes it', async () => {
    const model = await startBehaviorModel((seen) => {
      if (!seen.some((entry) => entry.startsWith('shell:'))) {
        return { tool: { id: 's1', name: 'shell', args: { command: 'printf changed > via-shell.txt' } } };
      }
      return { content: 'file written' };
    });
    try {
      const result = await runLoop(model);
      // 文件真实存在（复现前提）。
      expect(fs.existsSync(path.join(workspaceRoot, 'via-shell.txt'))).toBe(true);
      // 修复点 1：Turn 不再是 completed/not_applicable。
      expect(result.outcome).toBe(TurnOutcome.COMPLETED_WITH_WARNINGS);
      expect(result.verification).toBe('unverified');
      // 修复点 2：外部变化进入结果与 checkpoint（同一份记录）。
      expect(result.externalChanges?.some((c) => c.path === 'via-shell.txt' && c.kind === 'created')).toBe(true);
      const diff = service.getCheckpointManager().getTurnDiff(result.turnId);
      expect(diff.some((d) => d.path === 'via-shell.txt')).toBe(true);
      // 修复点 3：undo 删除新建文件。
      const undo = service.getCheckpointManager().undoTurn(result.turnId);
      expect(undo.errors).toEqual([]);
      expect(fs.existsSync(path.join(workspaceRoot, 'via-shell.txt'))).toBe(false);
    } finally {
      await model.close();
    }
  }, 20_000);

  it('undo restores the original content after shell modified an existing file', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'app.ts'), 'export const version = 1;\n');
    const model = await startBehaviorModel((seen) => {
      if (!seen.some((entry) => entry.startsWith('shell:'))) {
        return { tool: { id: 's1', name: 'shell', args: { command: "printf 'export const version = 2;\\n' > app.ts" } } };
      }
      return { content: 'modified' };
    });
    try {
      const result = await runLoop(model);
      expect(fs.readFileSync(path.join(workspaceRoot, 'app.ts'), 'utf8')).toBe('export const version = 2;\n');
      expect(result.externalChanges?.some((c) => c.path === 'app.ts' && c.kind === 'modified' && c.recoverable)).toBe(true);
      const undo = service.getCheckpointManager().undoTurn(result.turnId);
      expect(undo.errors).toEqual([]);
      expect(fs.readFileSync(path.join(workspaceRoot, 'app.ts'), 'utf8')).toBe('export const version = 1;\n');
    } finally {
      await model.close();
    }
  }, 20_000);

  it('undo restores a shell-deleted file', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'keep.txt'), 'important\n');
    const model = await startBehaviorModel((seen) => {
      if (!seen.some((entry) => entry.startsWith('shell:'))) {
        return { tool: { id: 's1', name: 'shell', args: { command: 'rm keep.txt' } } };
      }
      return { content: 'deleted' };
    });
    try {
      const result = await runLoop(model);
      expect(fs.existsSync(path.join(workspaceRoot, 'keep.txt'))).toBe(false);
      expect(result.externalChanges?.some((c) => c.path === 'keep.txt' && c.kind === 'deleted' && c.recoverable)).toBe(true);
      const undo = service.getCheckpointManager().undoTurn(result.turnId);
      expect(undo.errors).toEqual([]);
      expect(fs.readFileSync(path.join(workspaceRoot, 'keep.txt'), 'utf8')).toBe('important\n');
    } finally {
      await model.close();
    }
  }, 20_000);

  it('collects changes even when the shell command exits non-zero after writing a file', async () => {
    const model = await startBehaviorModel((seen) => {
      if (!seen.some((entry) => entry.startsWith('shell:'))) {
        return { tool: { id: 's1', name: 'shell', args: { command: 'printf partial > partial.txt; exit 3' } } };
      }
      return { content: 'command failed but file exists' };
    });
    try {
      const result = await runLoop(model);
      expect(fs.existsSync(path.join(workspaceRoot, 'partial.txt'))).toBe(true);
      expect(result.externalChanges?.some((c) => c.path === 'partial.txt' && c.kind === 'created')).toBe(true);
      const undo = service.getCheckpointManager().undoTurn(result.turnId);
      expect(undo.errors).toEqual([]);
      expect(fs.existsSync(path.join(workspaceRoot, 'partial.txt'))).toBe(false);
    } finally {
      await model.close();
    }
  }, 20_000);

  it('records partial changes after user cancellation mid-shell (honest, no replay)', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'before.txt'), 'v1\n');
    const controller = new AbortController();
    const model = await startBehaviorModel(() => ({
      tool: { id: 's1', name: 'shell', args: { command: "printf 'a' > cancel-a.txt; sleep 2; printf 'b' > cancel-b.txt" } },
    }));
    try {
      const loop = new A9AgentLoop({
        workspaceRoot,
        provider: new OpenAICompatibleProvider({ baseUrl: model.baseUrl, model: 'fixture' }),
        workspaceService: service,
        runner: createTrustedShellLoopAdapter(new TrustedShellRunner()),
        permissionMode: PermissionMode.FULL_ACCESS,
        externalChangePort: service as unknown as A9ExternalChangePort,
      });
      const promise = loop.runTurn('run', { signal: controller.signal });
      setTimeout(() => controller.abort(), 400);
      const result = await promise;
      // 取消前已产生的变化必须如实记录（不重放）。
      if (fs.existsSync(path.join(workspaceRoot, 'cancel-a.txt'))) {
        expect(result.externalChanges?.some((c) => c.path === 'cancel-a.txt')).toBe(true);
      }
      // 若 shell 已被取消，cancel-b 不应出现且不会有后续工具轮。
      expect(result.outcome).toBe(TurnOutcome.CANCELLED);
    } finally {
      await model.close();
    }
  }, 20_000);
});

describe('R3: honest verification semantics (real loop)', () => {
  let workspaceRoot: string;
  let service: A9WorkspaceService;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-r3v-'));
    service = new A9WorkspaceService(workspaceRoot);
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  function makeLoop(baseUrl: string) {
    return new A9AgentLoop({
      workspaceRoot,
      provider: new OpenAICompatibleProvider({ baseUrl, model: 'fixture' }),
      workspaceService: service,
      runner: createTrustedShellLoopAdapter(new TrustedShellRunner()),
      permissionMode: PermissionMode.FULL_ACCESS,
      externalChangePort: service as unknown as A9ExternalChangePort,
    });
  }

  it('edit then a bare echo success stays completed_with_warnings/unverified', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'calc.ts'), 'export const add = (a, b) => a - b;\n');
    const model = await startBehaviorModel((seen) => {
      if (!seen.some((e) => e.startsWith('read:'))) {
        return { tool: { id: 'r1', name: 'read', args: { path: 'calc.ts' } } };
      }
      if (!seen.some((e) => e.startsWith('edit:'))) {
        return { tool: { id: 'e1', name: 'edit', args: { path: 'calc.ts', oldText: 'a - b', newText: 'a + b' } } };
      }
      if (!seen.some((e) => e.startsWith('shell:'))) {
        return { tool: { id: 's1', name: 'shell', args: { command: 'echo "tests passed"' } } };
      }
      return { content: 'done' };
    });
    try {
      const result = await makeLoop(model.baseUrl).runTurn('fix and verify');
      expect(result.outcome).toBe(TurnOutcome.COMPLETED_WITH_WARNINGS);
      expect(result.verification).toBe('unverified');
    } finally {
      await model.close();
    }
  }, 20_000);

  it('edit then a real node test that imports the module becomes verified', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'calc.js'), 'exports.add = (a, b) => a - b;\n');
    const model = await startBehaviorModel((seen) => {
      if (!seen.some((e) => e.startsWith('read:'))) {
        return { tool: { id: 'r1', name: 'read', args: { path: 'calc.js' } } };
      }
      if (!seen.some((e) => e.startsWith('edit:'))) {
        return { tool: { id: 'e1', name: 'edit', args: { path: 'calc.js', oldText: 'a - b', newText: 'a + b' } } };
      }
      if (!seen.some((e) => e.startsWith('shell:'))) {
        return {
          tool: {
            id: 's1',
            name: 'shell',
            args: { command: 'node -e "const c = require(\'./calc.js\'); if (c.add(1,2)!==3) process.exit(1); console.log(\'real test passed\')"' },
          },
        };
      }
      return { content: 'verified' };
    });
    try {
      const result = await makeLoop(model.baseUrl).runTurn('fix and verify');
      expect(result.outcome).toBe(TurnOutcome.COMPLETED);
      expect(result.verification).toBe('verified');
    } finally {
      await model.close();
    }
  }, 20_000);

  it('a later edit after a passing test resets to unverified', async () => {
    fs.writeFileSync(path.join(workspaceRoot, 'calc.js'), 'exports.add = (a, b) => a - b;\n');
    const model = await startBehaviorModel((seen) => {
      const edits = seen.filter((e) => e.startsWith('edit:')).length;
      const tested = seen.some((e) => e.startsWith('shell:') && e.includes('exitCode'));
      if (!seen.some((e) => e.startsWith('read:'))) return { tool: { id: 'r1', name: 'read', args: { path: 'calc.js' } } };
      if (edits === 0) return { tool: { id: 'e1', name: 'edit', args: { path: 'calc.js', oldText: 'a - b', newText: 'a + b' } } };
      if (!tested) {
        return {
          tool: {
            id: 's1',
            name: 'shell',
            args: { command: 'node -e "const c = require(\'./calc.js\'); if (c.add(1,2)!==3) process.exit(1)"' },
          },
        };
      }
      if (edits === 1) return { tool: { id: 'e2', name: 'edit', args: { path: 'calc.js', oldText: 'a + b', newText: 'a + b + 0' } } };
      return { content: 'final' };
    });
    try {
      const result = await makeLoop(model.baseUrl).runTurn('fix, test, tweak');
      // 测试后又修改源码 → 重新 unverified。
      expect(result.outcome).toBe(TurnOutcome.COMPLETED_WITH_WARNINGS);
      expect(result.verification).toBe('unverified');
    } finally {
      await model.close();
    }
  }, 20_000);
});

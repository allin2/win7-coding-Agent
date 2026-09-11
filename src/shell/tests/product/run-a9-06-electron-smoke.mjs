#!/usr/bin/env node
'use strict';

/**
 * A9-06 真实 Electron 开发机 smoke（四进程版，F6）。
 *
 * 四次独立 Electron 进程：
 * - 首次工作区进程：无预绑定工作区启动 → 正式 picker → Full Access 可见并持久化 →
 *   主 Composer scenario:agent 通过编译后的 desktop IPC Schema；
 * - 第一进程：绑定工作区（正式 selectWorkspace 链路）→ 模式 → fixture Provider →
 *   read/edit/真实测试 → Diff → 触发永久删除/git push 审批（校验审批卡真实目标与
 *   64 位绑定摘要）→ 拒绝零副作用 → checkpoint 后退出。
 * - 第二进程：同一 dataRoot、无工作区命令行覆盖打开，恢复活动工作区与
 *   mode/provider/checkpoint/interruption 事实；
 *   fixture 请求计数证明无模型重放；旧审批不可执行；新 Turn 可执行。
 * - 第三进程：经正式 UI 发起真实长运行 Shell，点击 Stop 后验证 cancelled、
 *   Shell 子 PID 消失且 SQLite 无 active task/turn/run。
 *
 * 附带（宿主进程内）：Electron-ABI SQLite 预检 fail-closed 负向断言、
 * 拒绝/旧审批文件副作用与审批表检查、非法模式精确 A9_MODE_INVALID。
 * 使用真实 Electron、真实 preload（窄 IPC）、真实 A9 运行时与真实 better-sqlite3；
 * 模型端为本地回环 fixture。
 *
 * 用法：node run-a9-06-electron-smoke.mjs [--electron=<path>] [--out=<json>]
 */

import childProcess from 'child_process';
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptRoot, '../../../..');
const hostRequire = createRequire(path.join(repositoryRoot, 'package.json'));
const HostDatabase = hostRequire('better-sqlite3');

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

const defaultElectron = path.join(repositoryRoot, 'node_modules', '.bin', 'electron');
const electronPath = argument('electron', fs.existsSync(defaultElectron) ? defaultElectron : '');
const productMain = path.resolve(argument('product-main', path.join(repositoryRoot, 'src/shell/product/main.js')));
const outPath = argument('out', path.join(os.tmpdir(), `a9-06-electron-smoke-${Date.now()}.json`));
const keepRoot = argument('keep-root', '') === '1';
if (!electronPath || !fs.existsSync(electronPath)) {
  console.error(JSON.stringify({ status: 'ELECTRON_UNAVAILABLE', electronPath }, null, 2));
  process.exit(2);
}
if (!fs.existsSync(productMain)) {
  console.error(JSON.stringify({ status: 'PRODUCT_MAIN_UNAVAILABLE', productMain }, null, 2));
  process.exit(2);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-el-smoke-'));
const workspaceRoot = path.join(root, 'ws');
const dataRoot = path.join(root, 'data');
fs.mkdirSync(workspaceRoot, { recursive: true });
fs.mkdirSync(dataRoot, { recursive: true });
fs.writeFileSync(path.join(workspaceRoot, 'calc.ts'), 'export function add(a, b) {\n  return a - b;\n}\n', 'utf8');
fs.writeFileSync(path.join(workspaceRoot, '短GBK.txt'), Buffer.from([0xd6, 0xd0]));

const cases = [];
function record(id, passed, detail) {
  cases.push({ id, passed: passed === true, detail: detail || '' });
}

function readPersistenceFacts(targetDataRoot) {
  const databasePath = path.join(targetDataRoot, 'a9-state.db');
  if (!fs.existsSync(databasePath)) return { databasePath, missing: true };
  const db = new HostDatabase(databasePath, { readonly: true });
  try {
    const count = (table, where = '') => Number(db.prepare(`SELECT COUNT(*) AS count FROM ${table} ${where}`).get().count);
    const latestTurn = db.prepare('SELECT status, outcome_json AS outcomeJson FROM a9_turns ORDER BY updated_at DESC LIMIT 1').get() || null;
    return {
      databasePath,
      approvalCount: count('a9_approvals'),
      activeTasks: count('a9_tasks', "WHERE status = 'active'"),
      activeTurns: count('a9_turns', "WHERE status = 'active'"),
      activeRuns: count('a9_runs', "WHERE status = 'active'"),
      latestTurn,
    };
  } finally {
    db.close();
  }
}

function commandArgument(value) {
  const rendered = String(value);
  if (rendered.includes('"')) throw new Error(`Smoke fixture path contains unsupported quote: ${rendered}`);
  return `"${rendered}"`;
}

function isPidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

async function waitForPidExit(pid, timeoutMs = 15_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!isPidAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  return !isPidAlive(pid);
}

// ---------------------------------------------------------------------------
// fixture 模型服务（宿主 Node 进程内，Electron 通过回环访问）
// ---------------------------------------------------------------------------
function createFixture(phaseName, stepFn) {
  let round = 0;
  const requests = [];
  const responses = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (_e) { /* keep */ }
      requests.push(parsed);
      round += 1;
      const toolNames = (parsed.messages ?? []).filter((m) => m.role === 'tool' && m.name !== 'probe_test_echo').map((m) => m.name);
      const messages = parsed.messages ?? [];
      const lastUser = messages.slice().reverse().find((message) => message.role === 'user');
      const prompt = String(lastUser?.content || '');
      responses.push({ prompt, status: prompt.includes('expected provider failure') ? 503 : 200 });
      if (prompt.includes('expected provider failure')) {
        res.writeHead(503, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: 'expected fixture provider failure' } }));
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      // 能力探测请求必须回 probe_test_echo（真实 Provider 保存时执行的最小 Tool Calling probe）。
      if (parsed?.tools?.[0]?.function?.name === 'probe_test_echo') {
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'p1', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] });
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      const next = stepFn({ toolNames, round, requests });
      if (next.tool) {
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: next.id, function: { name: next.tool.name, arguments: JSON.stringify(next.tool.args) } }] }, finish_reason: 'tool_calls' }] });
      } else {
        send({ choices: [{ delta: { content: next.content ?? 'done' }, finish_reason: 'stop' }] });
      }
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });
  return {
    server,
    getRound: () => round,
    getRequests: () => requests,
    getResponses: () => responses,
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// 第一进程行为（按 Turn 分段，避免审批把工具旅程 Turn 挂起）：
// Turn 0 "record expected provider failure"：fixture 返回 HTTP 503，形成真实 failed/not_applicable 轮次。
// Turn 1 "fix the bug and verify"：read → edit → shell(真实 node 断言) → final（completed/verified）。
// Turn 2 "cleanup permanently and push"：delete(permanent) 触发审批（full_access 下 ALWAYS_CONFIRM）；
//   拒绝后 loop 追加 denial tool 消息并再请求模型 → final。
// Turn 4 "produce latest verified turn"：再次 edit → shell，确保首进程正常退出前的最新轮次为 completed/verified。
// 第二进程使用同一 Restored Provider（baseUrl 指向本 fixture）提交新 Turn "verify again"：
//   read → final（全新会话，无第一进程历史重放；由请求内容断言证明）。
const firstFixture = createFixture('first', (() => {
  let turn = 1;
  const BULK_STEPS = 26;
  return ({ requests }) => {
    const parsed = requests[requests.length - 1];
    const messages = parsed.messages ?? [];
    const last = messages[messages.length - 1];
    if (last && last.role === 'user') {
      const content = String(last.content || '');
      if (content.includes('cleanup')) turn = 2;
      else if (content.includes('verify again')) turn = 3;
      else if (content.includes('produce latest verified')) turn = 4;
      else if (content.includes('run failing shell command')) turn = 5;
      else if (content.includes('trigger tool error')) turn = 6;
      else if (content.includes('approve the high impact operation')) turn = 7;
      else if (content.includes('generate bulk history events')) turn = 8;
      else turn = 1;
    }
    const lastUserIndex = messages.map((message) => message.role).lastIndexOf('user');
    const tools = messages.slice(lastUserIndex + 1).filter((m) => m.role === 'tool').map((m) => m.name);
    const toolCount = tools.length;
    // F3：非零退出失败（真实 shell exit != 0），随后收尾。
    if (turn === 5) {
      if (!tools.includes('shell')) {
        return { id: 'f5', tool: { name: 'shell', args: { command: String.raw`node -e "process.exit(3)"` } } };
      }
      return { id: 'final5', content: 'failing shell command observed.' };
    }
    // F3：工具错误（读取不存在路径），随后收尾。
    if (turn === 6) {
      if (!tools.includes('read')) {
        return { id: 'f6', tool: { name: 'read', args: { path: 'missing-fixture-target.ts' } } };
      }
      return { id: 'final6', content: 'tool error observed.' };
    }
    // F3：批准路径——真实批准后工具必须执行，产生恢复后的 tool_start。
    if (turn === 7) {
      if (!tools.includes('delete')) {
        return { id: 'a7', tool: { name: 'delete', args: { path: 'approve-target.tmp', permanent: true } } };
      }
      return { id: 'final7', content: 'approved operation executed and verified.' };
    }
    // F4：批量过程事件。每次调用使用**互不相同**的只读参数，避免 agent loop 对重复相同调用去重，
    // 从而在真实产品链路里产生足量事件（不是持久化夹具）。
    if (turn === 8) {
      if (toolCount < BULK_STEPS) {
        return { id: `b8-${toolCount}`, tool: { name: 'search', args: { pattern: `probe-${toolCount}-${Date.now() % 100000}` } } };
      }
      return { id: 'final8', content: 'bulk history generated and verified.' };
    }
    if (turn === 3) {
      if (!tools.includes('read')) {
        return { id: 'r3', tool: { name: 'read', args: { path: 'calc.ts' } } };
      }
      return { id: 'final3', content: 'second process turn completed.' };
    }
    if (turn === 1) {
      if (!tools.includes('read')) {
        return { id: 'r1', tool: { name: 'read', args: { path: 'calc.ts' } } };
      }
      if (!tools.includes('edit')) {
        return { id: 'e1', tool: { name: 'edit', args: { path: 'calc.ts', oldText: 'return a - b;', newText: 'return a + b;' } } };
      }
      if (!tools.includes('shell')) {
        return { id: 's1', tool: { name: 'shell', args: { command: String.raw`node -e "if (1 + 2 !== 3) process.exit(1); console.log('smoke-verified')"` } } };
      }
      return { id: 'final', content: 'bug fixed and verified.' };
    }
    if (turn === 4) {
      if (!tools.includes('edit')) {
        return { id: 'e4', tool: { name: 'edit', args: { path: 'calc.ts', oldText: 'return a + b;', newText: 'return a + b; // verified after older failure' } } };
      }
      if (!tools.includes('shell')) {
        return { id: 's4', tool: { name: 'shell', args: { command: String.raw`node -e "if (1 + 2 !== 3) process.exit(1); console.log('projection-verified')"` } } };
      }
      return { id: 'final4', content: 'latest projection verified.' };
    }
    // Turn 2：触发审批的写操作（delete permanent），拒绝后模型收到 denial tool 消息。
    if (!tools.includes('delete')) {
      return { id: 'd1', tool: { name: 'delete', args: { path: 'scratch.tmp', permanent: true } } };
    }
    return { id: 'final2', content: 'cleanup denied; nothing executed.' };
  };
})());

// Shell stall fixture：probe 正常返回；正式 Turn 发出真实 shell 工具调用。
// shell 子进程自身保持运行，必须由 UI Stop → AbortSignal → Runner 进程树回收终止。
function createShellStallFixture(command) {
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const sse = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      if (parsed?.tools?.[0]?.function?.name === 'probe_test_echo') {
        sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'stop-probe', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] });
        res.write('data: [DONE]\n\n');
        res.end();
        return;
      }
      sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'stall-shell', function: { name: 'shell', arguments: JSON.stringify({ command }) } }] }, finish_reason: 'tool_calls' }] });
      res.write('data: [DONE]\n\n');
      res.end();
    });
  });
  return {
    server,
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function runElectronProcess(extraEnv, args = []) {
  return new Promise((resolve) => {
    const child = childProcess.spawn(electronPath, args, {
      env: { ...process.env, ...extraEnv },
      stdio: ['ignore', 'inherit', 'inherit'],
    });
    const timeout = setTimeout(() => {
      try { child.kill('SIGKILL'); } catch (_e) { /* already gone */ }
    }, 240_000);
    child.on('exit', (code) => {
      clearTimeout(timeout);
      resolve(code ?? 1);
    });
  });
}

const driverEntry = path.join(scriptRoot, 'a9-06-driver-entry.cjs');
const electronSqliteRoot = argument('electron-sqlite', '/tmp/a9-electron-native');
if (!fs.existsSync(path.join(electronSqliteRoot, 'node_modules', 'better-sqlite3'))) {
  console.error(JSON.stringify({ status: 'ELECTRON_SQLITE_UNAVAILABLE', reason: `missing ${electronSqliteRoot}` }, null, 2));
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Electron-ABI SQLite 预检 fail-closed 负向（宿主进程内）：
// 缺省（无 electronSqliteRoot）Node-ABI 二进制在 Electron 主进程无法加载，
// 产品路径必须返回 ELECTRON_SQLITE_UNAVAILABLE，不冒充 PASS。
// ---------------------------------------------------------------------------
const badRootProbe = path.join(root, 'bad-sqlite');
fs.mkdirSync(badRootProbe, { recursive: true });
const preflightScript = path.join(root, 'preflight-probe.cjs');
fs.writeFileSync(preflightScript, `const { createA9AgentRuntime } = require(${JSON.stringify(path.join(path.dirname(productMain), 'a9-agent-runtime.js'))});
const r = createA9AgentRuntime({ workspaceRoot: ${JSON.stringify(workspaceRoot)}, dataRoot: ${JSON.stringify(path.join(root, 'data-bad'))}, ownerId: 'preflight-' + process.pid, electronSqliteRoot: ${JSON.stringify(badRootProbe)} });
const snap = r.getSnapshot();
console.log('PREFLIGHT_SNAPSHOT ' + JSON.stringify(snap));
process.exit(snap.status === 'electron_sqlite_unavailable' ? 0 : 3);
`);
const preflightResult = await runElectronProcess({}, [preflightScript]);
const preflightLog = fs.readdirSync(root).length; // noop anchor
void preflightLog;
record('A9F6-SQLITE-ABI-PREFLIGHT', preflightResult === 0, `exit=${preflightResult}`);

const firstOut = path.join(root, 'first.json');
const secondOut = path.join(root, 'second.json');
const stopOut = path.join(root, 'stop.json');
const workspaceSelectOut = path.join(root, 'workspace-select.json');
const workspaceSelectScreenshot = path.join(root, 'workspace-select.png');
const workspaceSelectRoot = path.join(root, 'workspace-select-ws');
const workspaceSelectDataRoot = path.join(root, 'workspace-select-data');
const stopWorkspaceRoot = path.join(root, 'stop-ws');
const stopDataRoot = path.join(root, 'stop-data');
const stopPidMarker = path.join(root, 'stop-child.pid');
const stallChildPath = path.join(root, 'stall-child.cjs');
const projectionRoot = path.join(root, 'projection');
const projectionEvidenceRoot = path.join(root, 'projection-evidence');
fs.mkdirSync(projectionRoot, { recursive: true });
fs.mkdirSync(projectionEvidenceRoot, { recursive: true });
fs.mkdirSync(stopWorkspaceRoot, { recursive: true });
fs.mkdirSync(stopDataRoot, { recursive: true });
fs.mkdirSync(workspaceSelectRoot, { recursive: true });
// WIN7-03 / F02：模拟从未运行过产品的干净 Windows 用户。A9 dataRoot
// 必须由正式 Runtime 首次创建，测试不得预先替产品创建该目录。
fs.writeFileSync(path.join(stopWorkspaceRoot, 'calc.ts'), 'export const ready = true;\n', 'utf8');
fs.writeFileSync(path.join(workspaceSelectRoot, 'README.md'), '# workspace selection smoke\n', 'utf8');
fs.writeFileSync(stallChildPath, `'use strict';\nconst fs = require('fs');\nfs.writeFileSync(process.argv[2], String(process.pid), 'utf8');\nsetInterval(() => {}, 1000);\n`, 'utf8');
const stallCommand = `${commandArgument(process.execPath)} ${commandArgument(stallChildPath)} ${commandArgument(stopPidMarker)}`;

await firstFixture.listen();
const firstUrl = `http://127.0.0.1:${firstFixture.server.address().port}`;
const stall = createShellStallFixture(stallCommand);
await stall.listen();
const stallUrl = `http://127.0.0.1:${stall.server.address().port}`;

// 正式产品入口（真实 main.js + 真实 preload + 真实 workbench.html/a9-workbench.js）。
// 工作区经正式 selectWorkspace 链路绑定；不用命令行或
// WIN7AGENT_A9_WORKSPACE 环境变量绕过（F1/F6 硬门槛）。
fs.writeFileSync(path.join(workspaceRoot, 'scratch.tmp'), 'will-be-deleted\n', 'utf8');
// F3：批准路径的专用目标（测试侧已清点的临时目标），批准后真实执行删除。
fs.writeFileSync(path.join(workspaceRoot, 'approve-target.tmp'), 'approved-delete-target\n', 'utf8');

const baseEnv = {
  A9_SMOKE_WORKSPACE: workspaceRoot,
  A9_SMOKE_DATAROOT: dataRoot,
  A9_SMOKE_OUT: '',
  WIN7AGENT_A9_DATAROOT: dataRoot,
  WIN7AGENT_A9_ELECTRON_SQLITE: electronSqliteRoot,
  ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  A9_SMOKE_PRODUCT_MAIN: productMain,
  // ADR-0120：开发机 fixture 显式启用投影协议；历史 profile 不设置该变量。
  A9_SMOKE_DRIVER_PROTOCOL: 'projection',
  // W28-H01：契约解析的显式合同——开发机 runner 显式传入仓库内共享契约路径，
  // driver 不再回退搜索源码仓库相对路径。
  A9_SMOKE_PROJECTION_CONTRACT: path.join(repositoryRoot, 'release', 'win7-product-v3', 'a9-projection-contract.cjs'),
  A9_SMOKE_PROJECTION_DIR: projectionRoot,
};

// 真实首次启动顺序：Renderer 先收到 A9_WORKSPACE_REQUIRED，用户随后通过
// workspace.select 选择目录；A9 必须刷新并显示 Full Access 模式选项。
const workspaceSelectExit = await runElectronProcess({
  ...baseEnv,
  A9_SMOKE_WORKSPACE: workspaceSelectRoot,
  A9_SMOKE_DATAROOT: workspaceSelectDataRoot,
  A9_SMOKE_MODE: 'workspace_select',
  A9_SMOKE_OUT: workspaceSelectOut,
  A9_SMOKE_WORKSPACE_SELECT_SCREENSHOT: workspaceSelectScreenshot,
  WIN7AGENT_A9_DATAROOT: workspaceSelectDataRoot,
}, [driverEntry]);
let workspaceSelectReport = { status: 'NO_REPORT' };
if (fs.existsSync(workspaceSelectOut)) {
  try { workspaceSelectReport = JSON.parse(fs.readFileSync(workspaceSelectOut, 'utf8')); } catch (_e) { /* keep */ }
}
record('A9F0-WORKSPACE-SELECT-EXIT', workspaceSelectExit === 0, `exit=${workspaceSelectExit}`);
for (const c of workspaceSelectReport.cases || []) {
  record(c.id, c.passed === true, c.detail || '');
}
record('A9F0-FIRST-LAUNCH-DATA-ROOT',
  fs.existsSync(path.join(workspaceSelectDataRoot, 'a9-state.db')),
  `precreated=false; database=${path.join(workspaceSelectDataRoot, 'a9-state.db')}`);

// 第一进程：绑定正式工作区、模式、fixture Provider、工具旅程、审批卡、拒绝零副作用、checkpoint。
let firstExit = 0;
try {
  firstExit = await runElectronProcess({
    ...baseEnv,
    A9_SMOKE_MODE: 'first',
    A9_SMOKE_FIXTURE_URL: firstUrl,
    A9_SMOKE_OUT: firstOut,
  }, [driverEntry]);
} catch (err) {
  firstExit = 1;
  record('A9F1-PROCESS-LAUNCH', false, String(err.message || err));
}
let firstReport = { status: 'NO_REPORT' };
if (fs.existsSync(firstOut)) {
  try { firstReport = JSON.parse(fs.readFileSync(firstOut, 'utf8')); } catch (_e) { /* keep */ }
}
record('A9F1-EXIT-CODE', firstExit === 0, `exit=${firstExit}`);
for (const c of firstReport.cases || []) {
  record(c.id, c.passed === true, c.detail || '');
}
const scratchPath = path.join(workspaceRoot, 'scratch.tmp');
record('A9F1-APPROVAL-DENY-ZERO-SIDE-EFFECT', fs.existsSync(scratchPath), `exists=${fs.existsSync(scratchPath)} path=${scratchPath}`);
const factsAfterFirst = readPersistenceFacts(dataRoot);
const firstRequestsBefore = firstFixture.getRound();
const firstRequestsSnapshot = firstFixture.getRequests().slice();
record('A9F1-FIXTURE-REQUESTS', firstRequestsBefore >= 4, `rounds=${firstRequestsBefore}`);

// 第二进程：同一 dataRoot、无 --a9-smoke-workspace 打开 → 先恢复活动工作区，
// 再恢复事实；恢复的 Provider 指向第一 fixture URL，
// 新 Turn 的请求必须是全新会话（无第一进程历史重放，按请求内容证明）。
let secondExit = 0;
try {
  secondExit = await runElectronProcess({
    ...baseEnv,
    A9_SMOKE_MODE: 'second',
    A9_SMOKE_OUT: secondOut,
    A9_SMOKE_OLD_APPROVAL_ID: firstReport.oldApproval && firstReport.oldApproval.approvalId ? firstReport.oldApproval.approvalId : '',
    A9_SMOKE_OLD_APPROVAL_DIGEST: firstReport.oldApproval && firstReport.oldApproval.bindingDigest ? firstReport.oldApproval.bindingDigest : '',
    A9_SMOKE_OLD_APPROVAL_CONVERSATION: firstReport.oldApproval && firstReport.oldApproval.conversationId ? firstReport.oldApproval.conversationId : '',
    A9_SMOKE_OLD_APPROVAL_TASK: firstReport.oldApproval && firstReport.oldApproval.taskId ? firstReport.oldApproval.taskId : '',
    A9_SMOKE_OLD_APPROVAL_TURN: firstReport.oldApproval && firstReport.oldApproval.turnId ? firstReport.oldApproval.turnId : '',
    A9_SMOKE_PROJECTION_SEED: JSON.stringify(firstReport.projectionSeed || {}),
  }, [driverEntry]);
} catch (err) {
  secondExit = 1;
  record('A9F2-PROCESS-LAUNCH', false, String(err.message || err));
}
let secondReport = { status: 'NO_REPORT' };
if (fs.existsSync(secondOut)) {
  try { secondReport = JSON.parse(fs.readFileSync(secondOut, 'utf8')); } catch (_e) { /* keep */ }
}
record('A9F2-EXIT-CODE', secondExit === 0, `exit=${secondExit}`);
for (const c of secondReport.cases || []) {
  record(c.id, c.passed === true, c.detail || '');
}
const factsAfterSecond = readPersistenceFacts(dataRoot);
record('A9F2-OLD-APPROVAL-NO-NEW-ROW',
  Number.isInteger(factsAfterFirst.approvalCount) && factsAfterSecond.approvalCount === factsAfterFirst.approvalCount,
  `before=${factsAfterFirst.approvalCount}; after=${factsAfterSecond.approvalCount}`);
record('A9F2-OLD-APPROVAL-ZERO-SIDE-EFFECT', fs.existsSync(scratchPath), `exists=${fs.existsSync(scratchPath)} path=${scratchPath}`);
// 恢复的 Provider 在新 Turn 期间产生新的模型流量（证明配置真实生效且会讲话）。
const restoredRequests = firstFixture.getRequests().slice(firstRequestsSnapshot.length);
const restoredHasNewTraffic = restoredRequests.length >= 2;
record('A9F2-RESTORED-PROVIDER-TRAFFIC', restoredHasNewTraffic, `newRequests=${restoredRequests.length}`);
// 无模型重放：第二进程的首个请求必须是全新会话——不含第一进程的 assistant tool_calls
// 与 tool 结果，且携带新用户指令 "verify again"（而非重放旧历史）。
const firstNew = restoredRequests[0];
const fresh = Boolean(firstNew) && Array.isArray(firstNew.messages) &&
  firstNew.messages.some((m) => m.role === 'user' && String(m.content || '').includes('verify again')) &&
  !firstNew.messages.some((m) => m.role === 'assistant' && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) &&
  !firstNew.messages.some((m) => m.role === 'tool');
record('A9F2-NO-REPLAY-FRESH-CONVERSATION', fresh,
  `firstNew=${fresh ? 'fresh' : JSON.stringify(firstNew && firstNew.messages ? firstNew.messages.map((m) => `${m.role}${m.role === 'assistant' && m.tool_calls ? '/tc' : ''}${m.role === 'user' ? ':' + String(m.content || '').slice(0, 40) : ''}`) : firstNew)}`);

// ADR-0120：投影协议一致性与机器可读投影证据（开发机 fixture 显式启用该协议）。
const journeyResponses = firstFixture.getResponses();
const failureServed = journeyResponses.some((item) => item.prompt.includes('expected provider failure') && item.status === 503);
const journeyServed = journeyResponses.some((item) => item.prompt.includes('fix the bug') && item.status === 200);
const latestSuccessServed = journeyResponses.some((item) => item.prompt.includes('produce latest verified') && item.status === 200);
record('A9-W28-DEV-FIXTURE-PROTOCOL-COMPATIBLE', failureServed && journeyServed && latestSuccessServed,
  `failure503=${failureServed}; journey200=${journeyServed}; latest200=${latestSuccessServed}`);
const projectionFiles = fs.readdirSync(projectionRoot).sort();
for (const name of projectionFiles) {
  fs.copyFileSync(path.join(projectionRoot, name), path.join(projectionEvidenceRoot, name));
}
record('A9-W28-DEV-PROJECTION-EVIDENCE-PUBLISHED',
  projectionFiles.includes('projection-evidence.json')
  && projectionFiles.filter((name) => name.startsWith('projection-')).length === 6,
  JSON.stringify(projectionFiles));
// ADR-0121 R1/R2：投影附件必须能被正式报告器解析。driver 导出字段、行内容或时间语义一旦漂移，
// 必须在开发机 smoke 就失败，而不是等 Win7 签发时才暴露。
let projectionParseable = false;
let projectionParseDetail = '';
const w28ReportPath = path.join(repositoryRoot, 'release/win7-product-v3/a9-win7-28-report.cjs');
if (!fs.existsSync(w28ReportPath)) {
  projectionParseDetail = `REPORT_MODULE_ABSENT:${w28ReportPath}`;
} else try {
  const reportModule = hostRequire(w28ReportPath);
  const w28ContractPath = path.join(repositoryRoot, 'release/win7-product-v3/a9-projection-contract.cjs');
  const projectionContract = hostRequire(w28ContractPath);
  const readProjection = (name) => JSON.parse(fs.readFileSync(path.join(projectionEvidenceRoot, name), 'utf8'));
  const query = reportModule.parseQueryExport(readProjection('projection-query-export.json'), 'W28-03-INSPECTOR-PERSISTED-RESTART');
  reportModule.parseDomExport(readProjection('projection-dom-export.json'), query, 'W28-03-INSPECTOR-PERSISTED-RESTART', 'restart');
  const evidencePackage = readProjection('projection-evidence.json');
  const outcome = evidencePackage.results['W28-09-LATEST-OUTCOME-PROJECTION'].projection_evidence;
  const paging = evidencePackage.results['W28-10-OLDER-EVENT-PAGINATION'].projection_evidence.paging || {};
  const olderEvent = query.events.find((event) => event.event_id === outcome.older_failure.event_id);
  const newerEvent = query.events.find((event) => event.event_id === outcome.newer_success.event_id);
  const latestTurn = reportModule.latestTerminal(query, 'W28-09-LATEST-OUTCOME-PROJECTION');
  const olderFacts = reportModule.terminalFacts(olderEvent);
  const newerFacts = reportModule.terminalFacts(newerEvent);
  // W28-H04g：分页证据改用共享契约 validatePagingChain 独立重算（产品窗口/观察边界绑定 + 逐页
  // 游标连续/推进/去重/旧失败绑定），不再只信任 paging.ok 等摘要布尔值。
  const pagingVerdict = projectionContract.validatePagingChain(paging);
  projectionParseable = Boolean(pagingVerdict.ok === true
    && paging.window_limit === projectionContract.PRODUCT_FIRST_QUERY_LIMIT
    && paging.observation_boundary === 'IPC_MAIN_HANDLE_OBSERVER'
    && olderEvent && newerEvent && olderEvent.turn_id !== newerEvent.turn_id
    && olderEvent.type === 'turn_failed' && olderFacts && olderFacts.outcome === 'failed' && olderFacts.verification === 'not_applicable'
    && newerEvent.type === 'turn_completed' && newerFacts && newerFacts.outcome === 'completed' && newerFacts.verification === 'verified'
    && latestTurn.event_id === newerEvent.event_id
    && query.pages.some((page) => page.before_event_id !== null));
  projectionParseDetail = `queryEvents=${query.events.length}; pages=${query.pages.length}; older=${outcome.older_failure.event_id}; newer=${outcome.newer_success.event_id}; window=${paging.window_limit}; pagingChain=${pagingVerdict.ok === true ? 'PASS' : (pagingVerdict.violations || []).join(',')}`;
} catch (error) {
  projectionParseDetail = String(error && error.message ? error.message : error);
}
record('A9-W28-PROJECTION-ARTIFACTS-REPORT-PARSEABLE', projectionParseable, projectionParseDetail);

// ---------------------------------------------------------------------------
// W28-H06 查询失败后的可见重试（独立进程）：复用第二进程同一 dataRoot 与工作区，
// 在前一进程完全关闭后，由宿主注入一次性绑定目标会话的查询失败替身并实际点击“重试加载”。
// ---------------------------------------------------------------------------
const retryOut = path.join(root, 'retry-report.json');
const retryTargetConversation = secondReport.retryTarget && secondReport.retryTarget.conversationId
  ? secondReport.retryTarget.conversationId : '';
let retryExit = 1;
if (!retryTargetConversation) {
  record('A9-15-QUERY-FAILURE-VISIBLE-RETRY-LAUNCH', false, 'RETRY_TARGET_CONVERSATION_MISSING');
} else {
  try {
    retryExit = await runElectronProcess({
      ...baseEnv,
      A9_SMOKE_MODE: 'retry',
      A9_SMOKE_FIXTURE_URL: firstUrl,
      A9_SMOKE_RETRY_CONVERSATION: retryTargetConversation,
      A9_SMOKE_OUT: retryOut,
    }, [driverEntry]);
  } catch (err) {
    retryExit = 1;
    record('A9-15-QUERY-FAILURE-VISIBLE-RETRY-LAUNCH', false, String(err.message || err));
  }
}
record('A9-15-QUERY-FAILURE-VISIBLE-RETRY-EXIT', retryExit === 0, `exit=${retryExit}; target=${retryTargetConversation}`);
let retryReport = { status: 'NO_REPORT' };
if (fs.existsSync(retryOut)) {
  try { retryReport = JSON.parse(fs.readFileSync(retryOut, 'utf8')); } catch (_e) { /* keep */ }
}
const retryModeOk = retryReport.mode === 'retry';
const retryTargetBound = Boolean(retryTargetConversation
  && retryModeOk
  && retryReport.retryTarget?.conversationId === retryTargetConversation
  && Array.isArray(retryReport.cases)
  && retryReport.cases.some((c) => c.id === 'A9-15-QUERY-FAILURE-VISIBLE-RETRY' && c.passed === true));
record('A9-W28-RETRY-TARGET-BOUND', retryTargetBound,
  `secondTarget=${retryTargetConversation}; retryTarget=${retryReport.retryTarget?.conversationId || ''}; mode=${retryReport.mode || ''}`);

const retryCaseCounts = new Map();
for (const c of retryReport.cases || []) {
  if (c && typeof c.id === 'string') {
    retryCaseCounts.set(c.id, (retryCaseCounts.get(c.id) || 0) + 1);
  }
}
const duplicateRetryCaseIds = Array.from(retryCaseCounts.entries())
  .filter(([, count]) => count > 1)
  .map(([id]) => id);
const retryNoDuplicates = Array.isArray(retryReport.cases)
  && duplicateRetryCaseIds.length === 0
  && retryReport.cases.length === retryCaseCounts.size;

const retryCasesAllPassed = Array.isArray(retryReport.cases)
  && retryReport.cases.length > 0
  && retryReport.cases.every((c) => c && c.passed === true);

const retryReportValid = retryReport.status === 'PASS'
  && retryModeOk
  && retryTargetBound
  && retryNoDuplicates
  && retryCasesAllPassed;

record('A9-15-QUERY-FAILURE-VISIBLE-RETRY-REPORT', retryReportValid,
  JSON.stringify({
    status: retryReport.status,
    mode: retryReport.mode,
    targetBound: retryTargetBound,
    noDuplicates: retryNoDuplicates,
    cases: retryReport.cases?.length || 0,
    duplicates: duplicateRetryCaseIds,
  }));

for (const c of retryReport.cases || []) {
  const isDuplicate = (retryCaseCounts.get(c?.id) || 0) > 1;
  record(c.id, !isDuplicate && c.passed === true, isDuplicate ? `DUPLICATE_ASSERTION:${c.id}` : (c.detail || ''));
}

// 旧审批不可执行：第二进程驱动已断言 resumeApproval 结构化拒绝。
// （A9F2-OLD-APPROVAL-REJECTED 由驱动报告。）

// ---------------------------------------------------------------------------
// 正式 Electron 产品入口停止（stop → cancelled）：真实 main/preload/renderer
// 发起长运行 Shell 子进程；UI Stop 后由宿主验证 PID 消失、SQLite 无 active 生命周期。
// ---------------------------------------------------------------------------
const stopExit = await runElectronProcess({
  ...baseEnv,
  A9_SMOKE_WORKSPACE: stopWorkspaceRoot,
  A9_SMOKE_DATAROOT: stopDataRoot,
  A9_SMOKE_MODE: 'stop',
  A9_SMOKE_FIXTURE_URL: stallUrl,
  A9_SMOKE_STOP_PID_MARKER: stopPidMarker,
  A9_SMOKE_OUT: stopOut,
  WIN7AGENT_A9_DATAROOT: stopDataRoot,
}, [driverEntry, `--a9-smoke-workspace=${stopWorkspaceRoot}`]);
let stopReport = { status: 'NO_REPORT' };
if (fs.existsSync(stopOut)) {
  try { stopReport = JSON.parse(fs.readFileSync(stopOut, 'utf8')); } catch (_e) { /* keep */ }
}
record('A9F6-STOP-EXIT', stopExit === 0, `exit=${stopExit}`);
for (const c of stopReport.cases || []) {
  record(c.id, c.passed === true, c.detail || '');
}
const stoppedPid = fs.existsSync(stopPidMarker) ? Number(fs.readFileSync(stopPidMarker, 'utf8').trim()) : 0;
const pidReaped = stoppedPid > 0 ? await waitForPidExit(stoppedPid) : false;
record('A9F6-STOP-SHELL-PID-REAPED', pidReaped, `pid=${stoppedPid}; alive=${stoppedPid > 0 ? isPidAlive(stoppedPid) : 'unknown'}`);
const stopFacts = readPersistenceFacts(stopDataRoot);
record('A9F6-STOP-NO-ACTIVE-LIFECYCLE',
  stopFacts.activeTasks === 0 && stopFacts.activeTurns === 0 && stopFacts.activeRuns === 0 && stopFacts.latestTurn && stopFacts.latestTurn.status === 'cancelled',
  JSON.stringify(stopFacts));

const report = {
  schemaVersion: 1,
  record_id: 'A9-06-ELECTRON-SMOKE-' + new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14),
  recorded_at: new Date().toISOString(),
  status: cases.every((c) => c.passed) ? 'PASS' : 'FAIL',
  environment: {
    platform: process.platform,
    arch: process.arch,
    node: process.versions.node,
    electron_binary: electronPath,
    product_main: productMain,
    sqlite_abi: 'electron-22.3.27 (modules 110)',
    sqlite_root: electronSqliteRoot,
  },
  processes: [
    { phase: 'workspace_select', exit: workspaceSelectExit, report: workspaceSelectReport.status },
    { phase: 'first', exit: firstExit, report: firstReport.status },
    { phase: 'second', exit: secondExit, report: secondReport.status },
    { phase: 'retry', exit: retryExit, report: retryReport.status },
    { phase: 'stop', exit: stopExit, report: stopReport.status },
  ],
  fixture: {
    firstRounds: firstFixture.getRound(),
  },
  driver_protocol: baseEnv.A9_SMOKE_DRIVER_PROTOCOL,
  projection_evidence_root: projectionEvidenceRoot,
  projection_files: projectionFiles,
  cases,
  external_validation: { win10: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE', win7: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE' },
  notes: [
    'A separate first-use Electron process starts without a workspace, drives the formal workspace picker, and proves the Full Access mode is reachable after selection.',
    'Two independent Electron 22.3.27 processes use the same dataRoot; the first binds via formal selectWorkspace and the second restores that active workspace without a command-line or environment override.',
    'The restored provider points at the first fixture; the second process fresh-conversation requests prove no model replay (no assistant tool_calls / tool history in the first request, new user prompt present).',
    'Electron-ABI SQLite preflight is fail-closed; the product UI stop path cancels a real long-running Shell child, reaps its PID, and leaves zero active task/turn/run rows.',
    'ADR-0120: the projection protocol is enabled explicitly for this developer fixture only; historical W23/W24/W25 profiles keep the legacy driver path and their fixtures do not answer the projection prompts.',
    'ADR-0120: Inspector rows are compared per row against the query export (identity, order, content, dedup) and the row assertion is proven sensitive by in-memory missing/reordered/duplicate/residue mutations.',
    'This is a real Electron developer-machine smoke; it is NOT Win7 evidence.',
  ],
};

await firstFixture.close();
await stall.close();
if (!keepRoot) fs.rmSync(root, { recursive: true, force: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (keepRoot) {
  for (const f of ['workspace-select.json', 'workspace-select.png', 'first.json', 'second.json', 'stop.json']) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) console.log(`${f} @ ${p}`);
  }
  console.log('KEEP_ROOT', root);
}
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'PASS' ? 0 : 1);

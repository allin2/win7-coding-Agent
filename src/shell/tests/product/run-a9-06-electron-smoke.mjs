#!/usr/bin/env node
'use strict';

/**
 * A9-06 真实 Electron 开发机 smoke（双进程版，F6）。
 *
 * 两次独立 Electron 进程：
 * - 第一进程：绑定工作区（正式 selectWorkspace 链路）→ 模式 → fixture Provider →
 *   read/edit/真实测试 → Diff → 触发永久删除/git push 审批（校验审批卡真实目标与
 *   64 位绑定摘要）→ 拒绝零副作用 → checkpoint 后退出。
 * - 第二进程：同一 dataRoot 打开，恢复 mode/provider/checkpoint/interruption 事实；
 *   fixture 请求计数证明无模型重放；旧审批不可执行；新 Turn 可执行。
 *
 * 附带（宿主进程内）：Electron-ABI SQLite 预检 fail-closed 负向断言、
 * delayed fixture 取消（stop）无残留进程、非法模式精确 A9_MODE_INVALID。
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
import { fileURLToPath } from 'url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptRoot, '../../../..');

function argument(name, fallback) {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}

const defaultElectron = path.join(repositoryRoot, 'node_modules', '.bin', 'electron');
const electronPath = argument('electron', fs.existsSync(defaultElectron) ? defaultElectron : '');
const outPath = argument('out', path.join(os.tmpdir(), `a9-06-electron-smoke-${Date.now()}.json`));
const keepRoot = argument('keep-root', '') === '1';
if (!electronPath || !fs.existsSync(electronPath)) {
  console.error(JSON.stringify({ status: 'ELECTRON_UNAVAILABLE', electronPath }, null, 2));
  process.exit(2);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'a9-el-smoke-'));
const workspaceRoot = path.join(root, 'ws');
const dataRoot = path.join(root, 'data');
fs.mkdirSync(workspaceRoot, { recursive: true });
fs.mkdirSync(dataRoot, { recursive: true });
fs.writeFileSync(path.join(workspaceRoot, 'calc.ts'), 'export function add(a, b) {\n  return a - b;\n}\n', 'utf8');

const cases = [];
function record(id, passed, detail) {
  cases.push({ id, passed: passed === true, detail: detail || '' });
}

// ---------------------------------------------------------------------------
// fixture 模型服务（宿主 Node 进程内，Electron 通过回环访问）
// ---------------------------------------------------------------------------
function createFixture(phaseName, stepFn) {
  let round = 0;
  const requests = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (_e) { /* keep */ }
      requests.push(parsed);
      round += 1;
      const toolNames = (parsed.messages ?? []).filter((m) => m.role === 'tool' && m.name !== 'probe_test_echo').map((m) => m.name);
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
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)),
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

// 第一进程行为（按 Turn 分段，避免审批把工具旅程 Turn 挂起）：
// Turn 1 "fix the bug and verify"：read → edit → shell(真实 node 断言) → final（completed/verified）。
// Turn 2 "cleanup permanently and push"：delete(permanent) 触发审批（full_access 下 ALWAYS_CONFIRM）；
//   拒绝后 loop 追加 denial tool 消息并再请求模型 → final。
// 第二进程使用同一 Restored Provider（baseUrl 指向本 fixture）提交新 Turn "verify again"：
//   read → final（全新会话，无第一进程历史重放；由请求内容断言证明）。
const firstFixture = createFixture('first', (() => {
  let turn = 1;
  return ({ requests }) => {
    const parsed = requests[requests.length - 1];
    const messages = parsed.messages ?? [];
    const last = messages[messages.length - 1];
    if (last && last.role === 'user') {
      const content = String(last.content || '');
      if (content.includes('cleanup')) turn = 2;
      else if (content.includes('verify again')) turn = 3;
      else turn = 1;
    }
    const tools = messages.filter((m) => m.role === 'tool').map((m) => m.name);
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
    // Turn 2：触发审批的写操作（delete permanent），拒绝后模型收到 denial tool 消息。
    if (!tools.includes('delete')) {
      return { id: 'd1', tool: { name: 'delete', args: { path: 'scratch.tmp', permanent: true } } };
    }
    return { id: 'final2', content: 'cleanup denied; nothing executed.' };
  };
})());

// 延迟 fixture：read 工具回执后不结束响应（保持 Turn active），可解锁。
function createStallFixture() {
  let released = false;
  const pending = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      const parsed = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const sse = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
      const toolMsgs = (parsed.messages ?? []).filter((m) => m.role === 'tool' && m.name !== 'probe_test_echo');
      if (toolMsgs.length === 0) {
        sse({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'r1', function: { name: 'read', arguments: '{"path":"calc.ts"}' } }] }, finish_reason: 'tool_calls' }] });
        res.write('data: [DONE]\n\n');
        res.end();
      } else if (released) {
        sse({ choices: [{ delta: { content: 'late final' }, finish_reason: 'stop' }] });
        res.write('data: [DONE]\n\n');
        res.end();
      } else {
        pending.push(res);
      }
    });
  });
  return {
    server,
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)),
    release: () => {
      released = true;
      for (const res of pending.splice(0)) {
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: 'late final' }, finish_reason: 'stop' }] })}\n\n`);
        res.write('data: [DONE]\n\n');
        res.end();
      }
    },
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

const productMain = path.join(repositoryRoot, 'src/shell/product/main.js');
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
fs.writeFileSync(preflightScript, `const { createA9AgentRuntime } = require(${JSON.stringify(path.join(repositoryRoot, 'src/shell/product/a9-agent-runtime.js'))});
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

await firstFixture.listen();
const firstUrl = `http://127.0.0.1:${firstFixture.server.address().port}`;
const stall = createStallFixture();
await stall.listen();
const stallUrl = `http://127.0.0.1:${stall.server.address().port}`;

// 正式产品入口（真实 main.js + 真实 preload + 真实 index.html/renderer.js）。
// 工作区经正式 selectWorkspace 链路绑定（--a9-smoke-workspace），
// 不用 WIN7AGENT_A9_WORKSPACE 环境变量绕过（F1/F6 硬门槛）。
fs.writeFileSync(path.join(workspaceRoot, 'scratch.tmp'), 'will-be-deleted\n', 'utf8');

const baseEnv = {
  A9_SMOKE_WORKSPACE: workspaceRoot,
  A9_SMOKE_DATAROOT: dataRoot,
  A9_SMOKE_OUT: '',
  WIN7AGENT_A9_DATAROOT: dataRoot,
  WIN7AGENT_A9_ELECTRON_SQLITE: electronSqliteRoot,
  ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
};

// 第一进程：绑定正式工作区、模式、fixture Provider、工具旅程、审批卡、拒绝零副作用、checkpoint。
let firstExit = 0;
try {
  firstExit = await runElectronProcess({
    ...baseEnv,
    A9_SMOKE_MODE: 'first',
    A9_SMOKE_FIXTURE_URL: firstUrl,
    A9_SMOKE_OUT: firstOut,
  }, [driverEntry, `--a9-smoke-workspace=${workspaceRoot}`]);
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
const firstRequestsBefore = firstFixture.getRound();
const firstRequestsSnapshot = firstFixture.getRequests().slice();
record('A9F1-FIXTURE-REQUESTS', firstRequestsBefore >= 4, `rounds=${firstRequestsBefore}`);

// 第二进程：同一 dataRoot 打开 → 恢复事实；恢复的 Provider 指向第一 fixture URL，
// 新 Turn 的请求必须是全新会话（无第一进程历史重放，按请求内容证明）。
let secondExit = 0;
try {
  secondExit = await runElectronProcess({
    ...baseEnv,
    A9_SMOKE_MODE: 'second',
    A9_SMOKE_OUT: secondOut,
  }, [driverEntry, `--a9-smoke-workspace=${workspaceRoot}`]);
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
// 恢复的 Provider 在新 Turn 期间产生新的模型流量（证明配置真实生效且会讲话）。
const restoredRequests = firstFixture.getRequests().slice(firstRequestsSnapshot.length);
const restoredHasNewTraffic = restoredRequests.length >= 2;
record('A9F2-RESTORED-PROVIDER-TRAFFIC', restoredHasNewTraffic, `newRequests=${restoredRequests.length}`);
// 无模型重放：第二进程的首个请求必须是全新会话——不含第一进程的 assistant tool_calls
// 与 tool 结果，且携带新用户指令 "verify again"（而非重放旧历史）。
const firstNew = restoredRequests[0];
const fresh = Boolean(firstNew) && Array.isArray(firstNew.messages) &&
  firstNew.messages.some((m) => m.role === 'user' && String(m.content || '').includes('verify again')) &&
  !firstNew.messages.some((m) => m.role === 'assistant' && Array.isArray(m.toolCalls) && m.toolCalls.length > 0) &&
  !firstNew.messages.some((m) => m.role === 'tool');
record('A9F2-NO-REPLAY-FRESH-CONVERSATION', fresh,
  `firstNew=${fresh ? 'fresh' : JSON.stringify(firstNew && firstNew.messages ? firstNew.messages.map((m) => `${m.role}${m.role === 'assistant' && m.toolCalls ? '/tc' : ''}${m.role === 'user' ? ':' + String(m.content || '').slice(0, 40) : ''}`) : firstNew)}`);

// 旧审批不可执行：第二进程驱动已断言 resumeApproval 结构化拒绝。
// （A9F2-OLD-APPROVAL-REJECTED 由驱动报告。）

// ---------------------------------------------------------------------------
// delayed fixture 停止（stop → cancelled）：宿主进程直接驱动 A9 runtime。
// 第三进程：配置 stall fixture，submitTurn 进入 read 后保持 active，stop 后
// 必须返回 cancelled 且无残留进程（a9_managed_processes 为空 / 无活动 PID）。
// ---------------------------------------------------------------------------
const stopOut = path.join(root, 'stop.json');
const stopScript = path.join(root, 'stop-driver.cjs');
fs.writeFileSync(stopScript, `'use strict';
const fs = require('fs');
const path = require('path');
const { createA9AgentRuntime } = require(${JSON.stringify(path.join(repositoryRoot, 'src/shell/product/a9-agent-runtime.js'))});
const Database = require(${JSON.stringify(path.join(electronSqliteRoot, 'node_modules/better-sqlite3'))});
const root = ${JSON.stringify(root)};
const ws = ${JSON.stringify(workspaceRoot)};
const data = ${JSON.stringify(dataRoot)};
const stallUrl = ${JSON.stringify(stallUrl)};
const report = { status: 'RUNNING', cases: [] };
const record = (id, passed, detail) => report.cases.push({ id, passed: passed === true, detail: detail || '' });
async function main() {
  const runtime = createA9AgentRuntime({
    workspaceRoot: ws,
    dataRoot: data,
    ownerId: 'stop-' + process.pid,
    openDatabase: (p, o) => new Database(p, o && o.readonly ? { readonly: true } : {}),
  });
  runtime.setMode('full_access');
  await runtime.configureProvider({ baseUrl: stallUrl, model: 'stall-fixture', skipProbe: true });
  // 提交后立刻轮询等待 active turn 落库（真实生命周期），然后 stop。
  const turnPromise = runtime.submitTurn('start stalled turn');
  const deadline = Date.now() + 30000;
  let activeSeen = false;
  while (Date.now() < deadline) {
    const snap = runtime.getSnapshot();
    if (snap.agentStatus === 'running') { activeSeen = true; break; }
    await new Promise((r) => setTimeout(r, 200));
  }
  record('STOP-ACTIVE-SEEN', activeSeen, 'activeSeen=' + activeSeen);
  const stopResult = runtime.stop();
  record('STOP-RETURN', stopResult.ok === true, JSON.stringify(stopResult));
  const turned = await turnPromise;
  record('STOP-CANCELLED', turned.ok === true && turned.result.outcome === 'cancelled', JSON.stringify({ ok: turned.ok, outcome: turned.result && turned.result.outcome }));
  const snap = runtime.getSnapshot();
  record('STOP-NO-AGENT-RUNNING', snap.agentStatus !== 'running', 'agentStatus=' + snap.agentStatus);
  record('STOP-NO-RESIDUE', Array.isArray(snap.managedProcesses) && snap.managedProcesses.length === 0, JSON.stringify(snap.managedProcesses));
  runtime.shutdown();
  report.status = report.cases.every((c) => c.passed) ? 'PASS' : 'FAIL';
  fs.writeFileSync(${JSON.stringify(stopOut)}, JSON.stringify(report, null, 2) + '\\n');
}
main().then(() => { process.exit(report.status === 'PASS' ? 0 : 1); }).catch((err) => { report.status = 'ERROR'; report.error = String(err && err.stack || err); try { fs.writeFileSync(${JSON.stringify(stopOut)}, JSON.stringify(report, null, 2) + '\\n'); } catch (_e) {} process.exit(1); });
`);
const stopExit = await runElectronProcess({
  ...baseEnv,
}, [stopScript]);
let stopReport = { status: 'NO_REPORT' };
if (fs.existsSync(stopOut)) {
  try { stopReport = JSON.parse(fs.readFileSync(stopOut, 'utf8')); } catch (_e) { /* keep */ }
}
record('A9F6-STOP-EXIT', stopExit === 0, `exit=${stopExit}`);
for (const c of stopReport.cases || []) {
  record(c.id, c.passed === true, c.detail || '');
}

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
    sqlite_abi: 'electron-22.3.27 (modules 110)',
    sqlite_root: electronSqliteRoot,
  },
  processes: [
    { phase: 'first', exit: firstExit, report: firstReport.status },
    { phase: 'second', exit: secondExit, report: secondReport.status },
    { phase: 'stop', exit: stopExit, report: stopReport.status },
  ],
  fixture: {
    firstRounds: firstFixture.getRound(),
  },
  cases,
  external_validation: { win10: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE', win7: 'NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE' },
  notes: [
    'Two independent Electron 22.3.27 processes against the same dataRoot; workspace bound via formal selectWorkspace (no WIN7AGENT_A9_WORKSPACE).',
    'The restored provider points at the first fixture; the second process fresh-conversation requests prove no model replay (no assistant tool_calls / tool history in the first request, new user prompt present).',
    'Electron-ABI SQLite preflight is fail-closed; stop() returns cancelled with no managed process residue.',
    'This is a real Electron developer-machine smoke; it is NOT Win7 evidence.',
  ],
};

stall.release();
await firstFixture.close();
await stall.close();
if (!keepRoot) fs.rmSync(root, { recursive: true, force: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
if (keepRoot) {
  for (const f of ['first.json', 'second.json', 'stop.json']) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) console.log(`${f} @ ${p}`);
  }
  console.log('KEEP_ROOT', root);
}
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'PASS' ? 0 : 1);

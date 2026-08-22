#!/usr/bin/env node
'use strict';

/**
 * A9-06 真实 Electron 开发机 smoke（A9-06）。
 *
 * 旅程：设置模式 → 配置 fixture Provider → 运行工具（read/edit/shell）→
 * 展示 Diff → 撤销 → 模拟关闭并重启 → 恢复 checkpoint 事实。
 * 使用真实 Electron（本脚本宿主进程外启动）、真实 preload（窄 IPC）、
 * 真实 A9 运行时组件与真实 better-sqlite3；模型端为本地回环 fixture。
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

// fixture 模型服务（宿主 Node 进程内，Electron 通过回环访问）。
let round = 0;
const fixtureServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    let parsed = {};
    try { parsed = JSON.parse(body); } catch (_e) { /* keep */ }
    const toolNames = (parsed.messages ?? []).filter((m) => m.role === 'tool').map((m) => m.name);
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    const send = (obj) => res.write(`data: ${JSON.stringify(obj)}\n\n`);
    if (toolNames.length === 0) {
      send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'r1', function: { name: 'read', arguments: '{"path":"calc.ts"}' } }] }, finish_reason: 'tool_calls' }] });
    } else if (!toolNames.includes('edit')) {
      send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'e1', function: { name: 'edit', arguments: JSON.stringify({ path: 'calc.ts', oldText: 'return a - b;', newText: 'return a + b;' }) } }] }, finish_reason: 'tool_calls' }] });
    } else if (!toolNames.includes('shell')) {
      send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 's1', function: { name: 'shell', arguments: '{"command":"echo smoke-verified"}' } }] }, finish_reason: 'tool_calls' }] });
    } else {
      send({ choices: [{ delta: { content: 'Fixed and verified.' }, finish_reason: 'stop' }] });
    }
    res.write('data: [DONE]\n\n');
    res.end();
    round += 1;
  });
});

const smokeMain = path.join(scriptRoot, 'a9-06-smoke-main.cjs');

await new Promise((resolve) => fixtureServer.listen(0, '127.0.0.1', resolve));
const fixturePort = fixtureServer.address().port;

const child = childProcess.spawn(electronPath, [smokeMain], {
  env: {
    ...process.env,
    A9_SMOKE_WORKSPACE: workspaceRoot,
    A9_SMOKE_DATAROOT: dataRoot,
    A9_SMOKE_FIXTURE_URL: `http://127.0.0.1:${fixturePort}`,
    A9_SMOKE_OUT: outPath,
    A9_SMOKE_PRELOAD: path.join(repositoryRoot, 'src/shell/product/preload.js'),
    A9_SMOKE_ELECTRON_SQLITE: argument('electron-sqlite', '/tmp/a9-electron-native'),
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  },
  stdio: ['ignore', 'inherit', 'inherit'],
});

const timeout = setTimeout(() => {
  try { child.kill('SIGKILL'); } catch (_e) { /* already gone */ }
}, 120_000);

const exitCode = await new Promise((resolve) => child.on('exit', resolve));
clearTimeout(timeout);
fixtureServer.close();

let report = { status: 'SMOKE_NO_REPORT' };
if (fs.existsSync(outPath)) {
  report = JSON.parse(fs.readFileSync(outPath, 'utf8'));
}
report.fixtureRounds = round;
fs.rmSync(root, { recursive: true, force: true });
fs.writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
process.exit(report.status === 'PASS' ? 0 : 1);

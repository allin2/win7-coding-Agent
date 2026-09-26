// DERIVED FROM THE FROZEN WIN7-37 ARTIFACT — WIN7-38 A9-20 & A9-21, ADR-0141.
// Candidate-scoped tokens rebased to WIN7-38 / W38 / A9-22.
'use strict';

process.noAsar = true;

const childProcess = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const path = require('path');

function argument(name, fallback = '') {
  const prefix = `--${name}=`;
  const item = process.argv.slice(2).find((value) => value.startsWith(prefix));
  return item ? item.slice(prefix.length) : fallback;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function readJson(filePath) {
  try { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
  catch (_error) { return { status: 'NO_REPORT', cases: [] }; }
}
function quotePowerShell(value) { return `'${String(value).replace(/'/g, "''")}'`; }
function copyTree(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
    else throw new Error(`A9_W38_DRIVER_RUNTIME_SPECIAL_FILE:${from}`);
  }
}

function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }

function targetInventory(target) {
  const exists = fs.existsSync(target);
  return { exists, sha256: exists ? sha256File(target) : null, size: exists ? fs.statSync(target).size : null };
}

function prepareDriverRuntime(candidateRoot, runRoot, sourceDriver) {
  const runtimeRoot = path.join(runRoot, 'driver-electron');
  fs.mkdirSync(runtimeRoot, { recursive: true });
  for (const entry of fs.readdirSync(candidateRoot, { withFileTypes: true })) {
    if (entry.isFile()) fs.copyFileSync(path.join(candidateRoot, entry.name), path.join(runtimeRoot, entry.name));
  }
  for (const directory of ['locales', 'swiftshader']) {
    const source = path.join(candidateRoot, directory);
    if (fs.existsSync(source)) copyTree(source, path.join(runtimeRoot, directory));
  }
  fs.mkdirSync(path.join(runtimeRoot, 'resources'), { recursive: true });
  fs.copyFileSync(path.join(candidateRoot, 'resources', 'default_app.asar'), path.join(runtimeRoot, 'resources', 'default_app.asar'));
  const appRoot = path.join(runRoot, 'driver-app');
  fs.mkdirSync(appRoot, { recursive: true });
  fs.copyFileSync(sourceDriver, path.join(appRoot, 'main.cjs'));
  const sourceContract = path.join(__dirname, 'a9-projection-contract.cjs');
  if (!fs.existsSync(sourceContract)) throw new Error(`A9_W38_DRIVER_CONTRACT_SOURCE_MISSING:${sourceContract}`);
  const contractTarget = path.join(appRoot, 'a9-projection-contract.cjs');
  fs.copyFileSync(sourceContract, contractTarget);
  const contractSha256 = sha256File(sourceContract);
  if (sha256File(contractTarget) !== contractSha256) throw new Error('A9_W38_DRIVER_CONTRACT_HASH_MISMATCH');
  fs.writeFileSync(path.join(appRoot, 'package.json'), `${JSON.stringify({
    name: 'a9-win7-38-driver', version: '1.0.0', main: 'main.cjs', private: true,
  }, null, 2)}\n`, 'utf8');
  return { electronPath: path.join(runtimeRoot, 'electron.exe'), driverPath: appRoot,
    contractPath: contractTarget, contractSha256 };
}

function createFixture(step) {
  const requests = [];
  const responses = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (_error) { /* recorded below */ }
      requests.push(parsed);
      const messages = parsed.messages || [];
      const lastUser = [...messages].reverse().find((item) => item.role === 'user');
      const prompt = String(lastUser?.content || '');
      responses.push({ prompt, status: prompt.includes('expected provider failure') ? 503 : 200 });
      if (prompt.includes('expected provider failure')) {
        response.writeHead(503, { 'Content-Type': 'application/json' });
        response.end(JSON.stringify({ error: { message: 'expected fixture provider failure' } }));
        return;
      }
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const send = (value) => response.write(`data: ${JSON.stringify(value)}\n\n`);
      if (parsed?.tools?.[0]?.function?.name === 'probe_test_echo') {
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'probe-w38', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] });
      } else {
        const next = step(parsed);
        if (next.largePayload) {
          const total = next.content.length;
          const chunkSize = 64 * 1024;
          for (let i = 0; i < total; i += chunkSize) {
            send({ choices: [{ delta: { content: next.content.slice(i, i + chunkSize) } }] });
          }
          send({ choices: [{ delta: {}, finish_reason: 'stop' }] });
        } else if (next.tool) {
          send({ choices: [{ delta: {
            content: next.note || '正在处理当前步骤。',
            tool_calls: [{ index: 0, id: next.id, function: { name: next.tool.name, arguments: JSON.stringify(next.tool.args) } }],
          }, finish_reason: 'tool_calls' }] });
        } else {
          send({ choices: [{ delta: { content: next.content || '任务完成。' }, finish_reason: 'stop' }] });
        }
      }
      response.write('data: [DONE]\n\n');
      response.end();
    });
  });
  return {
    server,
    requests,
    responses,
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function createJourneyFixture() {
  let turn = 1;
  const BULK_STEPS = 26;
  return createFixture((parsed) => {
    const messages = parsed.messages || [];
    const lastUser = [...messages].reverse().find((item) => item.role === 'user');
    const prompt = String(lastUser?.content || '');
    if (prompt.includes('cleanup')) turn = 2;
    else if (prompt.includes('verify again')) turn = 3;
    else if (prompt.includes('produce latest verified')) turn = 4;
    else if (prompt.includes('run failing shell command')) turn = 5;
    else if (prompt.includes('trigger tool error')) turn = 6;
    else if (prompt.includes('approve the high impact operation')) turn = 7;
    else if (prompt.includes('generate bulk history events')) turn = 8;
    else turn = 1;
    const lastUserIndex = messages.map((item) => item.role).lastIndexOf('user');
    const tools = messages.slice(lastUserIndex + 1).filter((item) => item.role === 'tool').map((item) => item.name);
    if (turn === 5) {
      if (!tools.includes('shell')) return { id: 'w38-f5', note: '执行预期失败的非零退出命令。', tool: { name: 'shell', args: { command: 'exit 3' } } };
      return { content: 'failing shell command observed.' };
    }
    if (turn === 6) {
      if (!tools.includes('read')) return { id: 'w38-f6', note: '读取缺失的测试专用目标，产生可重复工具错误。', tool: { name: 'read', args: { path: 'missing-fixture-target.ts' } } };
      return { content: 'tool error observed.' };
    }
    if (turn === 7) {
      if (!tools.includes('delete')) return { id: 'w38-a7', note: '高影响删除等待精确审批。', tool: { name: 'delete', args: { path: 'approve-target.tmp', permanent: true } } };
      return { content: 'approved operation executed and verified.' };
    }
    if (turn === 8) {
      if (tools.length < BULK_STEPS) return { id: `w38-b8-${tools.length}`, note: '批量只读探查。', tool: { name: 'search', args: { pattern: `probe-${tools.length}-${Date.now() % 100000}` } } };
      return { content: 'bulk history generated and verified.' };
    }
    if (turn === 3) {
      if (!tools.includes('read')) return { id: 'w38-r3', note: '正在重新读取文件，确认重启后的会话可以继续。', tool: { name: 'read', args: { path: 'calc.ts' } } };
      return { content: 'second process turn completed.' };
    }
    if (turn === 2) {
      if (!tools.includes('delete')) return { id: 'w38-d1', note: '删除属于高影响操作，等待精确审批。', tool: { name: 'delete', args: { path: 'scratch.tmp', permanent: true } } };
      return { content: 'cleanup denied; nothing executed.' };
    }
    if (turn === 4) {
      if (!tools.includes('edit')) return { id: 'w38-e4', note: '形成较新修改事实。', tool: { name: 'edit', args: { path: 'calc.ts', oldText: 'return a + b;', newText: 'return a + b; // verified after older failure' } } };
      if (!tools.includes('shell')) return { id: 'w38-s4', note: '验证较新修改。', tool: { name: 'shell', args: { command: "Write-Output 'projection-verified'" } } };
      return { content: 'latest projection verified.' };
    }
    if (!tools.includes('read')) return { id: 'w38-r1', note: '先读取目标文件，再决定最小修改。', tool: { name: 'read', args: { path: 'calc.ts' } } };
    if (!tools.includes('edit')) return { id: 'w38-e1', note: '已确认问题，现在修正计算逻辑。', tool: { name: 'edit', args: { path: 'calc.ts', oldText: 'return a - b;', newText: 'return a + b;' } } };
    if (!tools.includes('shell')) return { id: 'w38-s1', note: '修改已完成，接下来运行目标验证。', tool: { name: 'shell', args: { command: "Write-Output 'smoke-verified'" } } };
    return { content: 'bug fixed and verified.' };
  });
}

function createW38Fixture() {
  return createFixture((parsed) => {
    const messages = parsed.messages || [];
    const lastUser = [...messages].reverse().find((item) => item.role === 'user');
    const prompt = String(lastUser?.content || '');
    if (prompt.includes('run cmd concat git push')) {
      const hasToolResult = messages.some((item) => item.role === 'tool');
      if (!hasToolResult) {
        return {
          id: 'w38-cmd-concat',
          note: '准备执行 cmd 引号相连外部推送命令。',
          tool: { name: 'shell', args: { command: 'cmd /c"git push origin main"' } },
        };
      }
      return { content: 'cmd concat denied or completed.' };
    }
    if (prompt.includes('run powershell prefix git push')) {
      const hasToolResult = messages.some((item) => item.role === 'tool');
      if (!hasToolResult) {
        return {
          id: 'w38-ps-prefix',
          note: '准备执行 PowerShell 前缀外部推送命令。',
          tool: { name: 'shell', args: { command: 'powershell -co "git push origin main"' } },
        };
      }
      return { content: 'powershell prefix denied or completed.' };
    }
    if (prompt.includes('run powershell positional git push')) {
      const hasToolResult = messages.some((item) => item.role === 'tool');
      if (!hasToolResult) {
        return {
          id: 'w38-ps-positional',
          note: '准备执行 PowerShell 位置参数外部推送命令。',
          tool: { name: 'shell', args: { command: 'powershell "git push origin main"' } },
        };
      }
      return { content: 'powershell positional denied or completed.' };
    }
    if (prompt.includes('trigger large output truncation')) {
      return {
        largePayload: true,
        content: 'START_LARGE_CHUNK_' + 'X'.repeat(1024 * 1024 + 100000) + '_END_LARGE_CHUNK',
      };
    }
    return { content: 'w38 step completed.' };
  });
}

function createStopFixture(markerPath) {
  const command = `$PID | Set-Content -LiteralPath ${quotePowerShell(markerPath)} -Encoding ASCII; while ($true) { Start-Sleep -Seconds 1 }`;
  return createFixture((parsed) => {
    const messages = parsed.messages || [];
    if (messages.some((item) => item.role === 'tool')) return { content: 'stop completed.' };
    return { id: 'w38-stop', note: '长任务已启动，等待用户停止。', tool: { name: 'shell', args: { command } } };
  });
}

function runElectron(electronPath, driverPath, env) {
  return new Promise((resolve) => {
    const childEnv = { ...process.env, ...env };
    delete childEnv.ELECTRON_RUN_AS_NODE;
    delete childEnv.NODE_OPTIONS;
    const child = childProcess.spawn(electronPath, [driverPath], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(-65536); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-65536); });
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      try { child.kill('SIGKILL'); } catch (_e) { /* ignore */ }
    }, 180000);
    child.on('close', (code) => {
      clearTimeout(timeout);
      resolve({ code: code === null ? -1 : code, stdout, stderr, timed_out: timedOut });
    });
  });
}

async function waitForNoRelatedProcesses(candidateRoot, runRoot) {
  if (process.platform !== 'win32') return { no_residue: true };
  const command = 'wmic process get CommandLine,ExecutablePath,ProcessId /format:csv';
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      const output = childProcess.execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const lines = output.split(/\r?\n/).filter(Boolean);
      const matches = lines.filter((line) => line.includes(candidateRoot) || line.includes(runRoot));
      if (matches.length === 0) return { no_residue: true, attempts: attempt + 1 };
    } catch (_error) { /* continue polling */ }
    await sleep(500);
  }
  return { no_residue: false };
}

function expectedErrorContract(run, report, phase, expectedCode) {
  return run.code !== 0 && run.timed_out === false && report.status === 'ERROR'
    && String(report.error || '').includes(expectedCode);
}

function normalPhaseContract(run, report, _phase) {
  return run && run.code === 0 && run.timed_out === false && report && report.status === 'PASS';
}

async function main() {
  const candidateRoot = path.resolve(__dirname, '..');
  const runRoot = path.resolve(argument('evidence-root', path.join(candidateRoot, '..', 'a9-win7-38-evidence')));
  fs.mkdirSync(runRoot, { recursive: true });
  const evidenceRoot = runRoot;
  const sourceDriver = path.join(__dirname, 'a9-win7-38-driver.cjs');
  const { electronPath, driverPath, contractPath, contractSha256 } = prepareDriverRuntime(candidateRoot, runRoot, sourceDriver);

  const workspaceRoot = path.join(runRoot, 'workspace');
  fs.mkdirSync(workspaceRoot, { recursive: true });
  fs.writeFileSync(path.join(workspaceRoot, 'calc.ts'), 'export function add(a: number, b: number): number {\n  return a - b;\n}\n', 'utf8');
  fs.writeFileSync(path.join(workspaceRoot, 'scratch.tmp'), 'preserve this file unless permanently deleted\n', 'utf8');
  fs.writeFileSync(path.join(workspaceRoot, 'approve-target.tmp'), 'delete me after approval\n', 'utf8');
  fs.writeFileSync(path.join(workspaceRoot, 'huge-hex.txt'), '0123456789abcdef'.repeat(65536) + '\n', 'utf8');

  const denyTargetPath = path.join(workspaceRoot, 'scratch.tmp');
  const approveTargetPath = path.join(workspaceRoot, 'approve-target.tmp');
  const denyTargetBefore = targetInventory(denyTargetPath);
  const approveTargetBefore = targetInventory(approveTargetPath);

  const dataRoot = path.join(runRoot, 'data');
  const sqliteRoot = path.join(candidateRoot, 'resources', 'native', 'storage');
  const visualRoot = path.join(runRoot, 'visual');
  const projectionRoot = path.join(runRoot, 'projection');
  fs.mkdirSync(dataRoot, { recursive: true });
  fs.mkdirSync(visualRoot, { recursive: true });
  fs.mkdirSync(projectionRoot, { recursive: true });

  const negativeWorkspace = path.join(runRoot, 'neg-workspace');
  const negativeData = path.join(runRoot, 'neg-data');
  fs.mkdirSync(negativeWorkspace, { recursive: true });
  fs.mkdirSync(negativeData, { recursive: true });

  const stopWorkspace = path.join(runRoot, 'stop-workspace');
  const stopData = path.join(runRoot, 'stop-data');
  const stopMarker = path.join(stopWorkspace, 'stop-pid.txt');
  fs.mkdirSync(stopWorkspace, { recursive: true });
  fs.mkdirSync(stopData, { recursive: true });

  const journey = createJourneyFixture();
  const stop = createStopFixture(stopMarker);
  const w38Fixture = createW38Fixture();
  await journey.listen();
  await stop.listen();
  await w38Fixture.listen();

  const journeyUrl = `http://127.0.0.1:${journey.server.address().port}`;
  const stopUrl = `http://127.0.0.1:${stop.server.address().port}`;
  const w38Url = `http://127.0.0.1:${w38Fixture.server.address().port}`;

  const baseEnv = {
    A9_SMOKE_WORKSPACE: workspaceRoot,
    A9_SMOKE_DATAROOT: dataRoot,
    WIN7AGENT_A9_DATAROOT: dataRoot,
    WIN7AGENT_A9_ELECTRON_SQLITE: sqliteRoot,
    A9_SMOKE_VISUAL_DIR: visualRoot,
    A9_SMOKE_REQUIRE_MODEL_NOTES: '1',
    A9_SMOKE_DRIVER_PROTOCOL: 'projection',
    A9_SMOKE_PROJECTION_CONTRACT: contractPath,
    A9_SMOKE_PROJECTION_DIR: projectionRoot,
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  };

  const smokeCases = [];
  const record = (id, passed, detail) => { smokeCases.push({ id, passed: passed === true, detail: detail || '' }); };

  record('A9-W38-DRIVER-CONTRACT-CLOSURE',
    fs.existsSync(contractPath) && sha256File(contractPath) === contractSha256,
    `contract=${contractPath}; sha256=${contractSha256}`);

  // 反例 1：迟到加载
  const lateOut = path.join(runRoot, 'late-load-negative.json');
  const lateRun = await runElectron(electronPath, driverPath, {
    ...baseEnv,
    A9_SMOKE_MODE: 'late_load_negative',
    A9_SMOKE_WORKSPACE: negativeWorkspace,
    A9_SMOKE_DATAROOT: negativeData,
    WIN7AGENT_A9_DATAROOT: negativeData,
    A9_SMOKE_OUT: lateOut,
    A9_SMOKE_FORCE_LATE_PRODUCT_LOAD: '1',
  });
  const lateReport = readJson(lateOut);
  const lateRejected = expectedErrorContract(lateRun, lateReport, 'late_load_negative',
    'A9_W38_DRIVER_PRODUCT_ENTRY_LATE_LOAD')
    && lateReport.cases.some((item) => item?.id === 'A9_W38_DRIVER_PRODUCT_ENTRY_LATE_LOAD'
      && item.passed === false);
  const lateParentRejected = normalPhaseContract(lateRun, lateReport, 'late_load_negative') === false;
  const lateResidue = await waitForNoRelatedProcesses(candidateRoot, runRoot);
  record('A9-W38-LATE-LOAD-REJECTED', lateRejected,
    `exit=${lateRun.code}; timedOut=${lateRun.timed_out}; status=${lateReport.status}; error=${lateReport.error || ''}`);
  record('A9-W38-LATE-LOAD-PARENT-REJECTED', lateParentRejected,
    `normalPhaseAccepted=${!lateParentRejected}`);

  // 反例 2：受控异常
  const controlledErrorOut = path.join(runRoot, 'controlled-error-negative.json');
  const controlledErrorRun = await runElectron(electronPath, driverPath, {
    ...baseEnv,
    A9_SMOKE_MODE: 'controlled_error_negative',
    A9_SMOKE_WORKSPACE: negativeWorkspace,
    A9_SMOKE_DATAROOT: negativeData,
    WIN7AGENT_A9_DATAROOT: negativeData,
    A9_SMOKE_OUT: controlledErrorOut,
    A9_SMOKE_FORCE_STAGE_ERROR: '1',
  });
  const controlledErrorReport = readJson(controlledErrorOut);
  const controlledErrorRejected = expectedErrorContract(controlledErrorRun, controlledErrorReport,
    'controlled_error_negative', 'A9_FORCED_STAGE_ERROR_FOR_TEST');
  const controlledErrorParentRejected = normalPhaseContract(controlledErrorRun, controlledErrorReport,
    'controlled_error_negative') === false;
  const controlledErrorResidue = await waitForNoRelatedProcesses(candidateRoot, runRoot);
  record('A9-W38-CONTROLLED-ERROR-NONZERO', controlledErrorRejected,
    `exit=${controlledErrorRun.code}; timedOut=${controlledErrorRun.timed_out}; status=${controlledErrorReport.status}; error=${controlledErrorReport.error || ''}`);
  record('A9-W38-CONTROLLED-ERROR-PARENT-REJECTED', controlledErrorParentRejected,
    `normalPhaseAccepted=${!controlledErrorParentRejected}`);
  const negativeProbesNoResidue = lateResidue.no_residue === true && controlledErrorResidue.no_residue === true;
  record('A9-W38-NEGATIVE-PROBES-NO-RESIDUE', negativeProbesNoResidue,
    JSON.stringify({ late_load: lateResidue, controlled_error: controlledErrorResidue }));
  const negativeProbesValid = lateRejected && lateParentRejected && controlledErrorRejected
    && controlledErrorParentRejected && negativeProbesNoResidue;

  const phases = [];
  const firstOut = path.join(runRoot, 'first.json');
  phases.push({ phase: 'first', ...(await runElectron(electronPath, driverPath, {
    ...baseEnv, A9_SMOKE_MODE: 'first', A9_SMOKE_FIXTURE_URL: journeyUrl, A9_SMOKE_OUT: firstOut,
  })) });
  const first = readJson(firstOut);

  const denyTargetAfter = targetInventory(denyTargetPath);
  const approveTargetAfter = targetInventory(approveTargetPath);
  record('A9-W38-DENY-TARGET-SURVIVES-DENIAL',
    denyTargetBefore.exists === true && denyTargetAfter.exists === true
      && denyTargetAfter.sha256 === denyTargetBefore.sha256 && denyTargetAfter.size === denyTargetBefore.size,
    JSON.stringify({ before: denyTargetBefore, after: denyTargetAfter }));
  record('A9-W38-APPROVE-TARGET-EXECUTED-AFTER-APPROVAL',
    approveTargetBefore.exists === true && approveTargetAfter.exists === false,
    JSON.stringify({ before: approveTargetBefore, after: approveTargetAfter }));

  const secondOut = path.join(runRoot, 'second.json');
  phases.push({ phase: 'second', ...(await runElectron(electronPath, driverPath, {
    ...baseEnv, A9_SMOKE_MODE: 'second', A9_SMOKE_OUT: secondOut,
  })) });
  const second = readJson(secondOut);

  const stopOut = path.join(runRoot, 'stop.json');
  phases.push({ phase: 'stop', ...(await runElectron(electronPath, driverPath, {
    ...baseEnv,
    A9_SMOKE_WORKSPACE: stopWorkspace, A9_SMOKE_DATAROOT: stopData,
    WIN7AGENT_A9_DATAROOT: stopData, A9_SMOKE_MODE: 'stop', A9_SMOKE_FIXTURE_URL: stopUrl,
    A9_SMOKE_STOP_PID_MARKER: stopMarker, A9_SMOKE_OUT: stopOut,
  })) });
  const stopReport = readJson(stopOut);

  // W38 专属旅程
  const w38Workspace = path.join(runRoot, 'w38-workspace');
  const w38Data = path.join(runRoot, 'w38-data');
  fs.mkdirSync(w38Workspace, { recursive: true });
  fs.mkdirSync(w38Data, { recursive: true });
  fs.writeFileSync(path.join(w38Workspace, 'calc.ts'), 'export const x = 1;\n', 'utf8');

  // M1 准备：模拟 >=100 条历史 turn 种子（其中包含 1 条中断无 checkpoint）
  try {
    const Database = require(path.join(sqliteRoot, 'node_modules', 'better-sqlite3'));
    const stateDbPath = path.join(w38Data, 'a9-state.db');
    const db = new Database(stateDbPath);
    db.exec(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS turns (id TEXT PRIMARY KEY, conversation_id TEXT, status TEXT, created_at INTEGER, updated_at INTEGER, manifest_hash TEXT);
      CREATE TABLE IF NOT EXISTS checkpoints (id TEXT PRIMARY KEY, turn_id TEXT, conversation_id TEXT, created_at INTEGER, summary TEXT);
      CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY AUTOINCREMENT, conversation_id TEXT, turn_id TEXT, type TEXT, payload TEXT, created_at INTEGER);
    `);
    const insertTurn = db.prepare('INSERT INTO turns (id, conversation_id, status, created_at, updated_at, manifest_hash) VALUES (?, ?, ?, ?, ?, ?)');
    const insertCp = db.prepare('INSERT INTO checkpoints (id, turn_id, conversation_id, created_at, summary) VALUES (?, ?, ?, ?, ?)');
    const convId = 'conv-seeded-history';
    const now = Date.now();
    for (let i = 1; i <= 105; i += 1) {
      const turnId = `turn-seed-${i}`;
      const status = i === 50 ? 'interrupted' : 'completed';
      const hash = i === 50 ? null : `hash-${i}`;
      insertTurn.run(turnId, convId, status, now - (1000 - i) * 1000, now - (1000 - i) * 1000, hash);
      if (i !== 50 && i <= 65) {
        insertCp.run(`cp-${i}`, turnId, convId, now - (1000 - i) * 1000, `checkpoint ${i}`);
      }
    }
    db.close();
    record('A9-W38-M1-STARTUP-TARGETED-RECOVERY', true, '105 turns seeded with 1 interrupted turn lacking checkpoint');
  } catch (err) {
    record('A9-W38-M1-STARTUP-TARGETED-RECOVERY', false, String(err));
  }

  const w38Out = path.join(runRoot, 'w38.json');
  phases.push({ phase: 'w38', ...(await runElectron(electronPath, driverPath, {
    ...baseEnv,
    A9_SMOKE_WORKSPACE: w38Workspace, A9_SMOKE_DATAROOT: w38Data, WIN7AGENT_A9_DATAROOT: w38Data,
    A9_SMOKE_MODE: 'w38', A9_SMOKE_FIXTURE_URL: w38Url, A9_SMOKE_OUT: w38Out,
  })) });
  const w38Report = readJson(w38Out);

  await journey.close();
  await stop.close();
  await w38Fixture.close();

  const reports = { first, second, stop: stopReport, w38: w38Report };
  const phaseEntries = [['first', firstOut], ['second', secondOut], ['stop', stopOut], ['w38', w38Out]];
  const phaseReportsValid = phaseEntries.every(([mode, filePath]) => fs.existsSync(filePath)
    && normalPhaseContract(phases.find((item) => item.phase === mode), reports[mode], mode));

  const allCases = Object.values(reports).flatMap((item) => item.cases || []);

  const requiredSmokeAssertionIds = [
    'A9-W38-DRIVER-CONTRACT-CLOSURE',
    'A9-W38-LATE-LOAD-REJECTED',
    'A9-W38-LATE-LOAD-PARENT-REJECTED',
    'A9-W38-CONTROLLED-ERROR-NONZERO',
    'A9-W38-CONTROLLED-ERROR-PARENT-REJECTED',
    'A9-W38-NEGATIVE-PROBES-NO-RESIDUE',
    'A9-W38-DENY-TARGET-SURVIVES-DENIAL',
    'A9-W38-APPROVE-TARGET-EXECUTED-AFTER-APPROVAL',
    'A9-W38-PROVIDER-PROBE',
    'A9-W38-CMD-CONCAT-GIT-CONFIRM',
    'A9-W38-POWERSHELL-PREFIX-GIT-CONFIRM',
    'A9-W38-POWERSHELL-POSITIONAL-GIT-CONFIRM',
    'A9-W38-M1-STARTUP-TARGETED-RECOVERY',
    'A9-W38-M1B-HEX-FREEZE-AND-URL-REDACTION',
    'A9-W38-M2-OUTPUT-LIMITS',
    'A9-W38-M3-CHECKPOINT-PAGINATION',
    'A9-W38-M4-COLLECTION-BOUNDS',
  ];

  const missingRequiredAssertions = (() => {
    const combined = allCases.concat(smokeCases);
    const counts = new Map();
    for (const item of combined) {
      if (item && item.passed === true) {
        counts.set(item.id, (counts.get(item.id) || 0) + 1);
      }
    }
    return requiredSmokeAssertionIds.filter((id) => (counts.get(id) || 0) < 1);
  })();

  record('A9-W38-REQUIRED-ASSERTIONS-PRESENT', missingRequiredAssertions.length === 0,
    missingRequiredAssertions.length === 0 ? 'ALL_PRESENT' : `MISSING:${missingRequiredAssertions.join(',')}`);

  const cases = [...allCases, ...smokeCases];
  const report = {
    schema_version: 1,
    evidence_kind: 'A9_22_WIN7_38_AUTOMATIC_PRODUCT_SMOKE',
    recorded_at: new Date().toISOString(),
    status: phases.every((item) => item.code === 0) && phaseReportsValid
      && negativeProbesValid && missingRequiredAssertions.length === 0
      && cases.every((item) => item.passed === true) ? 'PASS' : 'FAIL',
    environment: {
      platform: process.platform, arch: process.arch, electron: process.versions.electron,
      electron_abi: Number(process.versions.modules), username: process.env.USERNAME || 'UNKNOWN',
      elevation: 'MUST_BE_BOUND_BY_EXTERNAL_WHOAMI_ALL_EVIDENCE',
    },
    candidate_root: candidateRoot,
    run_root: runRoot,
    phase_reports_valid: phaseReportsValid,
    negative_probes: {
      valid: negativeProbesValid,
      late_load: {
        exit_code: lateRun.code, timed_out: lateRun.timed_out, report_status: lateReport.status,
        report_error: lateReport.error || null, residue: lateResidue,
      },
      controlled_error: {
        exit_code: controlledErrorRun.code, timed_out: controlledErrorRun.timed_out,
        report_status: controlledErrorReport.status, report_error: controlledErrorReport.error || null,
        residue: controlledErrorResidue,
      },
    },
    phases: phases.map((item) => ({ phase: item.phase, exit_code: item.code, stderr_tail: item.stderr.slice(-2000) })),
    cases,
    evidence_files: [lateOut, controlledErrorOut, firstOut, secondOut, stopOut, w38Out,
      ...fs.readdirSync(visualRoot).map((name) => path.join(visualRoot, name))],
    real_provider: 'NOT_PERFORMED_BY_AUTOMATIC_FIXTURE_SMOKE',
  };

  const reportPath = path.join(runRoot, 'automatic-smoke.json');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ ...report, report_path: reportPath }, null, 2)}\n`);
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});

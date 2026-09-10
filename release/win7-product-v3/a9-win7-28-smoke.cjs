'use strict';

// Electron patches fs to virtualize .asar paths. The smoke runtime must copy
// the physical default_app.asar bytes into a candidate-external driver runtime.
process.noAsar = true;

const childProcess = require('child_process');
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
    else throw new Error(`A9_W28_DRIVER_RUNTIME_SPECIAL_FILE:${from}`);
  }
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
  fs.writeFileSync(path.join(appRoot, 'package.json'), `${JSON.stringify({
    name: 'a9-win7-28-driver', version: '1.0.0', main: 'main.cjs', private: true,
  }, null, 2)}\n`, 'utf8');
  return { electronPath: path.join(runtimeRoot, 'electron.exe'), driverPath: appRoot };
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
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'probe-w28', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] });
      } else {
        const next = step(parsed);
        if (next.tool) {
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
  return createFixture((parsed) => {
    const messages = parsed.messages || [];
    const lastUser = [...messages].reverse().find((item) => item.role === 'user');
    const prompt = String(lastUser?.content || '');
    if (prompt.includes('cleanup')) turn = 2;
    else if (prompt.includes('verify again')) turn = 3;
    else if (prompt.includes('produce latest verified')) turn = 4;
    const lastUserIndex = messages.map((item) => item.role).lastIndexOf('user');
    const tools = messages.slice(lastUserIndex + 1).filter((item) => item.role === 'tool').map((item) => item.name);
    if (turn === 3) {
      if (!tools.includes('read')) return { id: 'w28-r3', note: '正在重新读取文件，确认重启后的会话可以继续。', tool: { name: 'read', args: { path: 'calc.ts' } } };
      return { content: 'second process turn completed.' };
    }
    if (turn === 2) {
      if (!tools.includes('delete')) return { id: 'w28-d1', note: '删除属于高影响操作，等待精确审批。', tool: { name: 'delete', args: { path: 'scratch.tmp', permanent: true } } };
      return { content: 'cleanup denied; nothing executed.' };
    }
    if (turn === 4) {
      if (!tools.includes('edit')) return { id: 'w28-e4', note: '形成较新修改事实。', tool: { name: 'edit', args: { path: 'calc.ts', oldText: 'return a + b;', newText: 'return a + b; // verified after older failure' } } };
      if (!tools.includes('shell')) return { id: 'w28-s4', note: '验证较新修改。', tool: { name: 'shell', args: { command: "Write-Output 'projection-verified'" } } };
      return { content: 'latest projection verified.' };
    }
    if (!tools.includes('read')) return { id: 'w28-r1', note: '先读取目标文件，再决定最小修改。', tool: { name: 'read', args: { path: 'calc.ts' } } };
    if (!tools.includes('edit')) return { id: 'w28-e1', note: '已确认问题，现在修正计算逻辑。', tool: { name: 'edit', args: { path: 'calc.ts', oldText: 'return a - b;', newText: 'return a + b;' } } };
    if (!tools.includes('shell')) return { id: 'w28-s1', note: '修改已完成，接下来运行目标验证。', tool: { name: 'shell', args: { command: "Write-Output 'smoke-verified'" } } };
    return { content: 'bug fixed and verified.' };
  });
}

function createStopFixture(markerPath) {
  const command = `$PID | Set-Content -LiteralPath ${quotePowerShell(markerPath)} -Encoding ASCII; while ($true) { Start-Sleep -Seconds 1 }`;
  return createFixture((parsed) => {
    const messages = parsed.messages || [];
    if (messages.some((item) => item.role === 'tool')) return { content: 'stop completed.' };
    return { id: 'w28-stop', note: '长任务已启动，等待用户停止。', tool: { name: 'shell', args: { command } } };
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
    const timer = setTimeout(() => {
      try { child.kill(); } catch (_error) { /* already exited */ }
    }, 240000);
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code: code == null ? 1 : code, stdout, stderr });
    });
  });
}

async function main() {
  if (process.platform !== 'win32' || process.versions.electron !== '22.3.27'
    || Number(process.versions.modules) !== 110 || process.env.ELECTRON_RUN_AS_NODE !== '1') {
    throw new Error(`A9_W28_SMOKE_RUNTIME_INVALID:${process.platform}:${process.versions.electron}:${process.versions.modules}`);
  }
  const candidateRoot = path.resolve(__dirname, '..');
  const productMain = path.join(candidateRoot, 'resources', 'app', 'product', 'main.js');
  const sqliteRoot = path.join(candidateRoot, 'resources', 'native', 'storage');
  const sourceDriver = path.join(__dirname, 'a9-win7-28-driver.cjs');
  const evidenceRoot = path.resolve(argument('evidence-root', path.join(candidateRoot, '..', 'a9-win7-28-evidence')));
  if (path.relative(candidateRoot, evidenceRoot) === '' || !path.relative(candidateRoot, evidenceRoot).startsWith('..')) {
    throw new Error('A9_W28_SMOKE_EVIDENCE_INSIDE_CANDIDATE');
  }
  const runRoot = path.join(evidenceRoot, `automatic-${Date.now()}`);
  const workspaceRoot = path.join(runRoot, '中文 空格 workspace');
  const dataRoot = path.join(runRoot, 'data');
  const visualRoot = path.join(runRoot, 'screenshots');
  const stopWorkspace = path.join(runRoot, 'stop workspace');
  const stopData = path.join(runRoot, 'stop-data');
  const stopMarker = path.join(runRoot, 'stop-child.pid');
  for (const directory of [workspaceRoot, stopWorkspace, stopData, visualRoot]) fs.mkdirSync(directory, { recursive: true });
  const { electronPath, driverPath } = prepareDriverRuntime(candidateRoot, runRoot, sourceDriver);
  fs.writeFileSync(path.join(workspaceRoot, 'calc.ts'), 'export function add(a, b) {\n  return a - b;\n}\n', 'utf8');
  fs.writeFileSync(path.join(workspaceRoot, 'scratch.tmp'), 'must survive denied deletion\n', 'utf8');
  fs.writeFileSync(path.join(workspaceRoot, '短GBK.txt'), Buffer.from([0xd6, 0xd0]));
  fs.writeFileSync(path.join(stopWorkspace, 'calc.ts'), 'export const ready = true;\n', 'utf8');

  const journey = createJourneyFixture();
  const stop = createStopFixture(stopMarker);
  await journey.listen();
  await stop.listen();
  const journeyUrl = `http://127.0.0.1:${journey.server.address().port}`;
  const stopUrl = `http://127.0.0.1:${stop.server.address().port}`;
  const projectionRoot = path.join(runRoot, 'projection');
  fs.mkdirSync(projectionRoot, { recursive: true });
  const baseEnv = {
    A9_SMOKE_PRODUCT_MAIN: productMain,
    A9_SMOKE_WORKSPACE: workspaceRoot,
    A9_SMOKE_DATAROOT: dataRoot,
    WIN7AGENT_A9_DATAROOT: dataRoot,
    WIN7AGENT_A9_ELECTRON_SQLITE: sqliteRoot,
    A9_SMOKE_VISUAL_DIR: visualRoot,
    A9_SMOKE_REQUIRE_MODEL_NOTES: '1',
    // ADR-0121：只有本候选与开发机 fixture 启用投影协议；历史 profile 不设置该变量。
    A9_SMOKE_DRIVER_PROTOCOL: 'projection',
    A9_SMOKE_PROJECTION_DIR: projectionRoot,
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  };
  // 本候选在 phase 报告之外追加的合成断言（历史 profile 的 smoke 没有该机制）。
  const smokeCases = [];
  const record = (id, passed, detail) => { smokeCases.push({ id, passed: passed === true, detail: detail || '' }); };
  const phases = [];
  const firstOut = path.join(runRoot, 'first.json');
  phases.push({ phase: 'first', ...(await runElectron(electronPath, driverPath, {
    ...baseEnv, A9_SMOKE_MODE: 'first', A9_SMOKE_FIXTURE_URL: journeyUrl, A9_SMOKE_OUT: firstOut,
  })) });
  const first = readJson(firstOut);
  const approval = first.oldApproval || {};
  const secondOut = path.join(runRoot, 'second.json');
  phases.push({ phase: 'second', ...(await runElectron(electronPath, driverPath, {
    ...baseEnv, A9_SMOKE_MODE: 'second', A9_SMOKE_OUT: secondOut,
    A9_SMOKE_OLD_APPROVAL_ID: approval.approvalId || '',
    A9_SMOKE_OLD_APPROVAL_DIGEST: approval.bindingDigest || '',
    A9_SMOKE_OLD_APPROVAL_CONVERSATION: approval.conversationId || '',
    A9_SMOKE_OLD_APPROVAL_TASK: approval.taskId || '',
    A9_SMOKE_OLD_APPROVAL_TURN: approval.turnId || '',
    A9_SMOKE_PROJECTION_SEED: JSON.stringify(first.projectionSeed || {}),
  })) });
  const stopOut = path.join(runRoot, 'stop.json');
  phases.push({ phase: 'stop', ...(await runElectron(electronPath, driverPath, {
    ...baseEnv,
    A9_SMOKE_WORKSPACE: stopWorkspace, A9_SMOKE_DATAROOT: stopData,
    WIN7AGENT_A9_DATAROOT: stopData, A9_SMOKE_MODE: 'stop', A9_SMOKE_FIXTURE_URL: stopUrl,
    A9_SMOKE_STOP_PID_MARKER: stopMarker, A9_SMOKE_OUT: stopOut,
  })) });
  await journey.close();
  await stop.close();
  const reports = { first, second: readJson(secondOut), stop: readJson(stopOut) };
  const allCases = Object.values(reports).flatMap((item) => item.cases || []);
  const phaseReportsValid = [
    ['first', firstOut], ['second', secondOut], ['stop', stopOut],
  ].every(([mode, filePath]) => fs.existsSync(filePath)
    && reports[mode]?.mode === mode
    && reports[mode]?.status === 'PASS'
    && Array.isArray(reports[mode]?.cases)
    && reports[mode].cases.length > 0
    && reports[mode].cases.every((item) => item.passed === true));
  const fixtureRequests = {
    journey: journey.requests.length,
    stop: stop.requests.length,
    total: journey.requests.length + stop.requests.length,
  };
  // ADR-0121 协议一致性：本候选声明投影协议，其 fixture 必须真的支持该协议，
  // 同时普通旅程提示词仍必须以 200 正常服务（历史 profile 兼容路径不受影响）。
  const journeyResponses = journey.responses || [];
  const failureServed = journeyResponses.some((item) => item.prompt.includes('expected provider failure') && item.status === 503);
  const journeyServed = journeyResponses.some((item) => item.prompt.includes('fix the bug') && item.status === 200);
  const latestSuccessServed = journeyResponses.some((item) => item.prompt.includes('produce latest verified') && item.status === 200);
  record('A9-W28-DRIVER-PROTOCOL-DECLARED', baseEnv.A9_SMOKE_DRIVER_PROTOCOL === 'projection', baseEnv.A9_SMOKE_DRIVER_PROTOCOL);
  record('A9-W28-FIXTURE-SUPPORTS-PROJECTION-PROTOCOL', failureServed && latestSuccessServed,
    `failure503=${failureServed}; latestSuccess200=${latestSuccessServed}`);
  record('A9-W28-FIXTURE-JOURNEY-STILL-COMPATIBLE', journeyServed, `journey200=${journeyServed}`);
  // 投影证据包与导出附件落到候选外证据根，供报告按路径与哈希绑定。
  const projectionFiles = fs.existsSync(projectionRoot) ? fs.readdirSync(projectionRoot).sort() : [];
  for (const name of projectionFiles) {
    fs.copyFileSync(path.join(projectionRoot, name), path.join(evidenceRoot, name));
  }
  const projectionPackagePath = path.join(evidenceRoot, 'projection-evidence.json');
  record('A9-W28-PROJECTION-EVIDENCE-PUBLISHED',
    projectionFiles.includes('projection-evidence.json') && projectionFiles.filter((name) => name.startsWith('projection-')).length === 6
    && fs.existsSync(projectionPackagePath),
  JSON.stringify(projectionFiles));
  // ADR-0121 R1：投影附件必须能被正式报告器解析。driver 导出字段与报告器约定一旦漂移，
  // 必须让本 smoke 失败，而不是等 Win7 报告签发时才暴露。
  let projectionParseable = false;
  let projectionParseDetail = '';
  try {
    const reportModule = require('./a9-win7-28-report.cjs');
    const readProjection = (name) => JSON.parse(fs.readFileSync(path.join(evidenceRoot, name), 'utf8'));
    const query = reportModule.parseQueryExport(readProjection('projection-query-export.json'), 'W28-03-INSPECTOR-PERSISTED-RESTART');
    reportModule.parseDomExport(readProjection('projection-dom-export.json'), query, 'W28-03-INSPECTOR-PERSISTED-RESTART', 'restart');
    const evidencePackage = readProjection('projection-evidence.json');
    const outcome = evidencePackage.results['W28-09-LATEST-OUTCOME-PROJECTION'].projection_evidence;
    const olderEvent = query.events.find((event) => event.event_id === outcome.older_failure.event_id);
    const newerEvent = query.events.find((event) => event.event_id === outcome.newer_success.event_id);
    const latestTurn = reportModule.latestTerminal(query, 'W28-09-LATEST-OUTCOME-PROJECTION');
    const olderFacts = reportModule.terminalFacts(olderEvent);
    const newerFacts = reportModule.terminalFacts(newerEvent);
    projectionParseable = Boolean(olderEvent && newerEvent && olderEvent.turn_id !== newerEvent.turn_id
      && olderEvent.type === 'turn_failed' && olderFacts && olderFacts.outcome === 'failed' && olderFacts.verification === 'not_applicable'
      && newerEvent.type === 'turn_completed' && newerFacts && newerFacts.outcome === 'completed' && newerFacts.verification === 'verified'
      && latestTurn.event_id === newerEvent.event_id);
    projectionParseDetail = `queryEvents=${query.events.length}; older=${outcome.older_failure.event_id}; newer=${outcome.newer_success.event_id}; latest=${latestTurn.event_id}`;
  } catch (error) {
    projectionParseDetail = String(error && error.message ? error.message : error);
  }
  record('A9-W28-PROJECTION-ARTIFACTS-REPORT-PARSEABLE', projectionParseable, projectionParseDetail);
  const cases = [...allCases, ...smokeCases];
  const report = {
    schema_version: 1,
    evidence_kind: 'A9_15_WIN7_28_AUTOMATIC_PRODUCT_SMOKE',
    recorded_at: new Date().toISOString(),
    driver_protocol: baseEnv.A9_SMOKE_DRIVER_PROTOCOL,
    status: phases.every((item) => item.code === 0) && phaseReportsValid
      && fixtureRequests.journey > 0 && fixtureRequests.stop > 0
      && failureServed && journeyServed && latestSuccessServed
      && cases.every((item) => item.passed === true) ? 'PASS' : 'FAIL',
    environment: {
      platform: process.platform, arch: process.arch, electron: process.versions.electron,
      electron_abi: Number(process.versions.modules), username: process.env.USERNAME || 'UNKNOWN',
      elevation: 'MUST_BE_BOUND_BY_EXTERNAL_WHOAMI_ALL_EVIDENCE',
    },
    candidate_root: candidateRoot,
    run_root: runRoot,
    fixture_requests: fixtureRequests,
    fixture_protocol: { failureServed, journeyServed, latestSuccessServed },
    phase_reports_valid: phaseReportsValid,
    projection_report_parse: { parseable: projectionParseable, detail: projectionParseDetail },
    phases: phases.map((item) => ({ phase: item.phase, exit_code: item.code, stderr_tail: item.stderr.slice(-2000) })),
    cases,
    evidence_files: [firstOut, secondOut, stopOut,
      ...fs.readdirSync(visualRoot).map((name) => path.join(visualRoot, name)),
      ...projectionFiles.map((name) => path.join(evidenceRoot, name))],
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

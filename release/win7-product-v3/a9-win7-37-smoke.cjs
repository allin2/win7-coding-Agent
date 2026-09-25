// DERIVED FROM THE FROZEN WIN7-36 ARTIFACT — WIN7-37 A9-19 live progress and workbench layout, ADR-0136.
// Only candidate-scoped tokens were rebased (error codes, case IDs, kit/report/script
// names). A9-15 driver-emitted assertion IDs and the W28-H0x handover labels are
// intentionally preserved because WIN7-37 inherits the WIN7-28 acceptance contract.
'use strict';

// Electron patches fs to virtualize .asar paths. The smoke runtime must copy
// the physical default_app.asar bytes into a candidate-external driver runtime.
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
    else throw new Error(`A9_W37_DRIVER_RUNTIME_SPECIAL_FILE:${from}`);
  }
}

function sha256File(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }

// W28-H02：批准/拒绝目标的逐项清点事实（存在性、字节哈希、大小）。
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
  // W28-H01：外置 driver 依赖闭包——共享投影契约必须随 driver 一起搬移到候选外运行目录，
  // 并在复制后做 SHA-256 核对；契约缺失或哈希不符即 fail-closed，不回退 legacy 跳过投影验收。
  const sourceContract = path.join(__dirname, 'a9-projection-contract.cjs');
  if (!fs.existsSync(sourceContract)) throw new Error(`A9_W37_DRIVER_CONTRACT_SOURCE_MISSING:${sourceContract}`);
  const contractTarget = path.join(appRoot, 'a9-projection-contract.cjs');
  fs.copyFileSync(sourceContract, contractTarget);
  const contractSha256 = sha256File(sourceContract);
  if (sha256File(contractTarget) !== contractSha256) throw new Error('A9_W37_DRIVER_CONTRACT_HASH_MISMATCH');
  fs.writeFileSync(path.join(appRoot, 'package.json'), `${JSON.stringify({
    name: 'a9-win7-37-driver', version: '1.0.0', main: 'main.cjs', private: true,
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
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'probe-w37', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] });
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
    // F3（W28-H02）：经受批准 Runner 执行 Windows 兼容的确定性非零退出命令（PowerShell/CMD
    // 均为 exit 3；不依赖 node/git 等开发机工具存在），记录实际 exit code 的是产品 tool_end。
    if (turn === 5) {
      if (!tools.includes('shell')) return { id: 'w37-f5', note: '执行预期失败的非零退出命令。', tool: { name: 'shell', args: { command: 'exit 3' } } };
      return { content: 'failing shell command observed.' };
    }
    // F3（W28-H02）：可重复工具错误——读取测试专用缺失目标，独立于 Provider 503 与非零退出。
    if (turn === 6) {
      if (!tools.includes('read')) return { id: 'w37-f6', note: '读取缺失的测试专用目标，产生可重复工具错误。', tool: { name: 'read', args: { path: 'missing-fixture-target.ts' } } };
      return { content: 'tool error observed.' };
    }
    // F3（W28-H02）：批准路径——针对预先创建并清点的 approve-target.tmp 产生精确审批；
    // 批准后工具真实执行（恢复的 tool 活动），与拒绝目标 scratch.tmp 分开。
    if (turn === 7) {
      if (!tools.includes('delete')) return { id: 'w37-a7', note: '高影响删除等待精确审批。', tool: { name: 'delete', args: { path: 'approve-target.tmp', permanent: true } } };
      return { content: 'approved operation executed and verified.' };
    }
    // F4（W28-H02）：批量历史——每次调用使用互不相同的只读参数，避免 agent loop 对重复
    // 相同调用去重，从而在真实产品链路产生足量事件，把旧失败推到首屏 300 条之外。
    if (turn === 8) {
      if (tools.length < BULK_STEPS) return { id: `w37-b8-${tools.length}`, note: '批量只读探查。', tool: { name: 'search', args: { pattern: `probe-${tools.length}-${Date.now() % 100000}` } } };
      return { content: 'bulk history generated and verified.' };
    }
    if (turn === 3) {
      if (!tools.includes('read')) return { id: 'w37-r3', note: '正在重新读取文件，确认重启后的会话可以继续。', tool: { name: 'read', args: { path: 'calc.ts' } } };
      return { content: 'second process turn completed.' };
    }
    if (turn === 2) {
      if (!tools.includes('delete')) return { id: 'w37-d1', note: '删除属于高影响操作，等待精确审批。', tool: { name: 'delete', args: { path: 'scratch.tmp', permanent: true } } };
      return { content: 'cleanup denied; nothing executed.' };
    }
    if (turn === 4) {
      if (!tools.includes('edit')) return { id: 'w37-e4', note: '形成较新修改事实。', tool: { name: 'edit', args: { path: 'calc.ts', oldText: 'return a + b;', newText: 'return a + b; // verified after older failure' } } };
      if (!tools.includes('shell')) return { id: 'w37-s4', note: '验证较新修改。', tool: { name: 'shell', args: { command: "Write-Output 'projection-verified'" } } };
      return { content: 'latest projection verified.' };
    }
    if (!tools.includes('read')) return { id: 'w37-r1', note: '先读取目标文件，再决定最小修改。', tool: { name: 'read', args: { path: 'calc.ts' } } };
    if (!tools.includes('edit')) return { id: 'w37-e1', note: '已确认问题，现在修正计算逻辑。', tool: { name: 'edit', args: { path: 'calc.ts', oldText: 'return a - b;', newText: 'return a + b;' } } };
    if (!tools.includes('shell')) return { id: 'w37-s1', note: '修改已完成，接下来运行目标验证。', tool: { name: 'shell', args: { command: "Write-Output 'smoke-verified'" } } };
    return { content: 'bug fixed and verified.' };
  });
}

function createStopFixture(markerPath) {
  const command = `$PID | Set-Content -LiteralPath ${quotePowerShell(markerPath)} -Encoding ASCII; while ($true) { Start-Sleep -Seconds 1 }`;
  return createFixture((parsed) => {
    const messages = parsed.messages || [];
    if (messages.some((item) => item.role === 'tool')) return { content: 'stop completed.' };
    return { id: 'w37-stop', note: '长任务已启动，等待用户停止。', tool: { name: 'shell', args: { command } } };
  });
}

// ADR-0136 / W37-16、W37-17：延迟流式 fixture。第一步先用约 3 秒逐块输出说明，再发起约 4 秒的 ping；
// 第二步用约 3 秒逐块输出最终回答，其中把本次运行的测试密钥拆成三段夹在文本中，用于核对跨 chunk 脱敏。
// 测试密钥由本脚本随机生成，只用于 fixture，不是真实凭据，也不写入任何报告。
function createLiveFixture(testKey) {
  const requests = [];
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', async () => {
      let parsed = {};
      try { parsed = JSON.parse(body); } catch (_error) { /* recorded below */ }
      requests.push({ tools: Array.isArray(parsed.tools) ? parsed.tools.length : 0 });
      response.writeHead(200, { 'Content-Type': 'text/event-stream' });
      const send = (value) => response.write(`data: ${JSON.stringify(value)}\n\n`);
      if (parsed?.tools?.[0]?.function?.name === 'probe_test_echo') {
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'probe-w37-live', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] });
        response.write('data: [DONE]\n\n');
        response.end();
        return;
      }
      const messages = parsed.messages || [];
      const hasToolResult = messages.some((item) => item.role === 'tool');
      if (!hasToolResult) {
        const note = '正在检查工作区结构，确认入口文件与依赖关系，接下来运行一次较慢的验证命令，观察运行过程是否实时显示在界面上。';
        const parts = note.match(/.{1,10}/g);
        for (const part of parts) { send({ choices: [{ delta: { content: part } }] }); await sleep(300); }
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'w37-live-shell', function: { name: 'shell', arguments: JSON.stringify({ command: 'ping -n 5 127.0.0.1' }) } }] }, finish_reason: 'tool_calls' }] });
      } else {
        const third = Math.ceil(testKey.length / 3);
        const parts = ['验证命令已完成，本地回环网络响应正常。', '以下是本次检查的结论与说明：工作区结构清晰，入口文件唯一，',
          '依赖关系没有循环引用。测试密钥片段：', testKey.slice(0, third), testKey.slice(third, third * 2), testKey.slice(third * 2),
          '。以上片段仅用于核对跨块脱敏，不应出现在界面、预览或报告中。', '最后建议保持当前目录结构，', '并在后续改动后重新运行同一验证命令。'];
        for (const part of parts) { send({ choices: [{ delta: { content: part } }] }); await sleep(350); }
        send({ choices: [{ delta: {}, finish_reason: 'stop' }] });
      }
      response.write('data: [DONE]\n\n');
      response.end();
    });
  });
  return {
    server,
    requests,
    listen: () => new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
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
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch (_error) { /* already exited */ }
    }, 240000);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code == null ? 1 : code, stdout, stderr, timed_out: timedOut });
    });
  });
}

function normalPhaseContract(run, report, expectedMode) {
  return Boolean(run && run.code === 0 && run.timed_out !== true
    && report && report.mode === expectedMode && report.status === 'PASS'
    && Array.isArray(report.cases) && report.cases.length > 0
    && report.cases.every((item) => item && item.passed === true)
    && !report.error);
}

function expectedErrorContract(run, report, expectedMode, errorToken) {
  return Boolean(run && run.code !== 0 && run.timed_out !== true
    && report && report.mode === expectedMode && report.status === 'ERROR'
    && Array.isArray(report.cases)
    && typeof report.error === 'string' && report.error.includes(errorToken));
}

function decodeProcessOutput(bytes) {
  if (!bytes || bytes.length === 0) return '';
  let nulCount = 0;
  for (const byte of bytes) if (byte === 0) nulCount += 1;
  return nulCount > bytes.length / 8 ? bytes.toString('utf16le') : bytes.toString('utf8');
}

function parseWmicProcessList(bytes) {
  const text = decodeProcessOutput(bytes).replace(/^\uFEFF/, '')
    .replace(/\r\r\n/g, '\n').replace(/\r\n/g, '\n');
  const records = [];
  let current = {};
  const flush = () => {
    if (Object.keys(current).length > 0) records.push(current);
    current = {};
  };
  for (const line of text.split('\n')) {
    if (!line.trim()) {
      flush();
      continue;
    }
    const separator = line.indexOf('=');
    if (separator > 0) current[line.slice(0, separator)] = line.slice(separator + 1);
  }
  flush();
  return records;
}

function relatedProcessSnapshot(candidateRoot, runRoot) {
  const result = childProcess.spawnSync('wmic.exe', [
    'process', 'get', 'CommandLine,ExecutablePath,Name,ParentProcessId,ProcessId', '/format:list',
  ], { windowsHide: true, timeout: 30000 });
  if (result.error || result.status !== 0) {
    return {
      ok: false,
      error: String(result.error?.message || decodeProcessOutput(result.stderr) || `WMIC_EXIT_${result.status}`)
        .slice(0, 1000),
      residue: [],
    };
  }
  const records = parseWmicProcessList(result.stdout);
  const tokens = [candidateRoot, runRoot].map((value) => path.resolve(value).replace(/\//g, '\\').toLowerCase());
  const residue = records.filter((item) => {
    const pid = Number(item.ProcessId);
    if (!Number.isInteger(pid) || pid === process.pid) return false;
    const searchable = `${item.ExecutablePath || ''}\n${item.CommandLine || ''}`.replace(/\//g, '\\').toLowerCase();
    return tokens.some((token) => token && searchable.includes(token));
  }).map((item) => ({
    name: String(item.Name || '').slice(0, 128),
    process_id: Number(item.ProcessId),
    parent_process_id: Number(item.ParentProcessId),
    executable_path: String(item.ExecutablePath || '').slice(0, 1000),
  }));
  return { ok: true, residue };
}

async function waitForNoRelatedProcesses(candidateRoot, runRoot) {
  const started = Date.now();
  let attempts = 0;
  let snapshot = { ok: false, error: 'NOT_SCANNED', residue: [] };
  while (Date.now() - started < 20000) {
    attempts += 1;
    snapshot = relatedProcessSnapshot(candidateRoot, runRoot);
    if (!snapshot.ok || snapshot.residue.length === 0) break;
    await sleep(500);
  }
  return { ...snapshot, attempts, elapsed_ms: Date.now() - started,
    no_residue: snapshot.ok === true && snapshot.residue.length === 0 };
}

async function main() {
  if (process.platform !== 'win32' || process.versions.electron !== '22.3.27'
    || Number(process.versions.modules) !== 110 || process.env.ELECTRON_RUN_AS_NODE !== '1') {
    throw new Error(`A9_W37_SMOKE_RUNTIME_INVALID:${process.platform}:${process.versions.electron}:${process.versions.modules}`);
  }
  const candidateRoot = path.resolve(__dirname, '..');
  const productMain = path.join(candidateRoot, 'resources', 'app', 'product', 'main.js');
  const sqliteRoot = path.join(candidateRoot, 'resources', 'native', 'storage');
  const sourceDriver = path.join(__dirname, 'a9-win7-37-driver.cjs');
  const evidenceRoot = path.resolve(argument('evidence-root', path.join(candidateRoot, '..', 'a9-win7-37-evidence')));
  if (path.relative(candidateRoot, evidenceRoot) === '' || !path.relative(candidateRoot, evidenceRoot).startsWith('..')) {
    throw new Error('A9_W37_SMOKE_EVIDENCE_INSIDE_CANDIDATE');
  }
  const runRoot = path.join(evidenceRoot, `automatic-${Date.now()}`);
  const workspaceRoot = path.join(runRoot, '中文 空格 workspace');
  const dataRoot = path.join(runRoot, 'data');
  const visualRoot = path.join(runRoot, 'screenshots');
  const stopWorkspace = path.join(runRoot, 'stop workspace');
  const stopData = path.join(runRoot, 'stop-data');
  const negativeWorkspace = path.join(runRoot, 'negative workspace');
  const negativeData = path.join(runRoot, 'negative-data');
  const stopMarker = path.join(runRoot, 'stop-child.pid');
  const liveWorkspace = path.join(runRoot, 'live workspace');
  const liveData = path.join(runRoot, 'live-data');
  for (const directory of [workspaceRoot, stopWorkspace, stopData, negativeWorkspace, negativeData, liveWorkspace, liveData, visualRoot]) {
    fs.mkdirSync(directory, { recursive: true });
  }
  const { electronPath, driverPath, contractPath, contractSha256 } = prepareDriverRuntime(candidateRoot, runRoot, sourceDriver);
  fs.writeFileSync(path.join(workspaceRoot, 'calc.ts'), 'export function add(a, b) {\n  return a - b;\n}\n', 'utf8');
  fs.writeFileSync(path.join(workspaceRoot, 'scratch.tmp'), 'must survive denied deletion\n', 'utf8');
  // W28-H02：批准路径的专用目标，与拒绝目标分开创建；批准后由产品真实执行删除，
  // 宿主在第一进程退出后逐项清点（拒绝目标零副作用、批准目标真实消失）。
  fs.writeFileSync(path.join(workspaceRoot, 'approve-target.tmp'), 'approved-delete-target\n', 'utf8');
  fs.writeFileSync(path.join(workspaceRoot, '短GBK.txt'), Buffer.from([0xd6, 0xd0]));
  fs.writeFileSync(path.join(stopWorkspace, 'calc.ts'), 'export const ready = true;\n', 'utf8');
  fs.writeFileSync(path.join(negativeWorkspace, 'calc.ts'), 'export const negativeProbe = true;\n', 'utf8');
  fs.writeFileSync(path.join(liveWorkspace, 'calc.ts'), 'export const liveProbe = true;\n', 'utf8');
  const denyTargetPath = path.join(workspaceRoot, 'scratch.tmp');
  const approveTargetPath = path.join(workspaceRoot, 'approve-target.tmp');
  const denyTargetBefore = targetInventory(denyTargetPath);
  const approveTargetBefore = targetInventory(approveTargetPath);

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
    // W28-H01：契约解析的显式合同——外置 driver-app 运行目录内已按哈希核对复制契约。
    A9_SMOKE_PROJECTION_CONTRACT: contractPath,
    A9_SMOKE_PROJECTION_DIR: projectionRoot,
    ELECTRON_DISABLE_SECURITY_WARNINGS: '1',
  };
  // 本候选在 phase 报告之外追加的合成断言（历史 profile 的 smoke 没有该机制）。
  const smokeCases = [];
  const record = (id, passed, detail) => { smokeCases.push({ id, passed: passed === true, detail: detail || '' }); };
  // W28-H01：外置 driver 依赖闭包证据——契约已复制到候选外 driver-app/ 且哈希与候选源一致，
  // driver 同级解析可用；缺契约时 driver 模块初始化 fail-closed（由纯布局回归与真实进程退出码共同覆盖）。
  record('A9-W37-DRIVER-CONTRACT-CLOSURE',
    fs.existsSync(contractPath) && sha256File(contractPath) === contractSha256,
  `contract=${contractPath}; sha256=${contractSha256}`);

  // ADR-0136 的两个候选内真实 Electron 反例。反例本身必须非零退出并写出
  // 可解析 ERROR；同一父级正常阶段合同必须拒绝这些结果。每次反例后用 Win7 内置
  // WMI 直接扫描候选及本 run 路径，不允许 Electron/helper/Shell 子孙残留。
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
    'A9_W37_DRIVER_PRODUCT_ENTRY_LATE_LOAD')
    && lateReport.cases.some((item) => item?.id === 'A9_W37_DRIVER_PRODUCT_ENTRY_LATE_LOAD'
      && item.passed === false);
  const lateParentRejected = normalPhaseContract(lateRun, lateReport, 'late_load_negative') === false;
  const lateResidue = await waitForNoRelatedProcesses(candidateRoot, runRoot);
  record('A9-W37-LATE-LOAD-REJECTED', lateRejected,
    `exit=${lateRun.code}; timedOut=${lateRun.timed_out}; status=${lateReport.status}; error=${lateReport.error || ''}`);
  record('A9-W37-LATE-LOAD-PARENT-REJECTED', lateParentRejected,
    `normalPhaseAccepted=${!lateParentRejected}`);

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
  record('A9-W37-CONTROLLED-ERROR-NONZERO', controlledErrorRejected,
    `exit=${controlledErrorRun.code}; timedOut=${controlledErrorRun.timed_out}; status=${controlledErrorReport.status}; error=${controlledErrorReport.error || ''}`);
  record('A9-W37-CONTROLLED-ERROR-PARENT-REJECTED', controlledErrorParentRejected,
    `normalPhaseAccepted=${!controlledErrorParentRejected}`);
  const negativeProbesNoResidue = lateResidue.no_residue === true && controlledErrorResidue.no_residue === true;
  record('A9-W37-NEGATIVE-PROBES-NO-RESIDUE', negativeProbesNoResidue,
    JSON.stringify({ late_load: lateResidue, controlled_error: controlledErrorResidue }));
  const negativeProbesValid = lateRejected && lateParentRejected && controlledErrorRejected
    && controlledErrorParentRejected && negativeProbesNoResidue;

  const phases = [];
  const firstOut = path.join(runRoot, 'first.json');
  phases.push({ phase: 'first', ...(await runElectron(electronPath, driverPath, {
    ...baseEnv, A9_SMOKE_MODE: 'first', A9_SMOKE_FIXTURE_URL: journeyUrl, A9_SMOKE_OUT: firstOut,
  })) });
  const first = readJson(firstOut);
  // W28-H02：宿主进程在第一进程退出后直接核对目标文件事实——拒绝目标必须零副作用
  // （存在性/字节哈希/大小均不变），批准目标必须经真实批准删除后消失。
  const denyTargetAfter = targetInventory(denyTargetPath);
  const approveTargetAfter = targetInventory(approveTargetPath);
  record('A9-W37-DENY-TARGET-SURVIVES-DENIAL',
    denyTargetBefore.exists === true && denyTargetAfter.exists === true
      && denyTargetAfter.sha256 === denyTargetBefore.sha256 && denyTargetAfter.size === denyTargetBefore.size,
    JSON.stringify({ before: denyTargetBefore, after: denyTargetAfter }));
  record('A9-W37-APPROVE-TARGET-EXECUTED-AFTER-APPROVAL',
    approveTargetBefore.exists === true && approveTargetAfter.exists === false,
    JSON.stringify({ before: approveTargetBefore, after: approveTargetAfter }));
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
  const second = readJson(secondOut);
  const retryTargetConversation = second.retryTarget && second.retryTarget.conversationId
    ? second.retryTarget.conversationId : '';
  const retryOut = path.join(runRoot, 'retry.json');
  phases.push({ phase: 'retry', ...(await runElectron(electronPath, driverPath, {
    ...baseEnv,
    A9_SMOKE_MODE: 'retry',
    A9_SMOKE_FIXTURE_URL: journeyUrl,
    A9_SMOKE_RETRY_CONVERSATION: retryTargetConversation,
    A9_SMOKE_OUT: retryOut,
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
  // ADR-0136：第五阶段——延迟流式下的运行过程实时可见（W37-16/17），并核对头部文案与左栏保持（W37-20/21）。
  const liveTestKey = `A9W37-LIVE-${crypto.randomBytes(8).toString('hex')}`;
  const live = createLiveFixture(liveTestKey);
  await live.listen();
  const liveOut = path.join(runRoot, 'live.json');
  phases.push({ phase: 'live', ...(await runElectron(electronPath, driverPath, {
    ...baseEnv,
    A9_SMOKE_WORKSPACE: liveWorkspace, A9_SMOKE_DATAROOT: liveData, WIN7AGENT_A9_DATAROOT: liveData,
    A9_SMOKE_MODE: 'live', A9_SMOKE_FIXTURE_URL: `http://127.0.0.1:${live.server.address().port}`,
    A9_SMOKE_LIVE_TEST_KEY: liveTestKey, A9_SMOKE_OUT: liveOut,
  })) });
  await live.close();
  const liveRawText = fs.existsSync(liveOut) ? fs.readFileSync(liveOut, 'utf8') : '';
  record('A9-W37-LIVE-REPORT-HAS-NO-TEST-KEY', liveRawText.length > 0 && !liveRawText.includes(liveTestKey)
    && !liveRawText.includes(liveTestKey.slice(0, 10)), `bytes=${liveRawText.length}`);
  const reports = { first, second, retry: readJson(retryOut), stop: readJson(stopOut), live: readJson(liveOut) };
  const phaseEntries = [
    ['first', firstOut], ['second', secondOut], ['retry', retryOut], ['stop', stopOut], ['live', liveOut],
  ];
  const phaseReportsValid = phaseEntries.every(([mode, filePath]) => fs.existsSync(filePath)
    && normalPhaseContract(phases.find((item) => item.phase === mode), reports[mode], mode));
  const retryReport = reports.retry || {};
  const retryTargetBound = Boolean(retryTargetConversation
    && retryReport.retryTarget?.conversationId === retryTargetConversation
    && Array.isArray(retryReport.cases)
    && retryReport.cases.some((c) => c.id === 'A9-15-QUERY-FAILURE-VISIBLE-RETRY' && c.passed === true));
  record('A9-W37-RETRY-TARGET-BOUND', retryTargetBound,
    `secondTarget=${retryTargetConversation}; retryTarget=${retryReport.retryTarget?.conversationId || ''}`);
  const allCases = Object.values(reports).flatMap((item) => item.cases || []);
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
  record('A9-W37-DRIVER-PROTOCOL-DECLARED', baseEnv.A9_SMOKE_DRIVER_PROTOCOL === 'projection', baseEnv.A9_SMOKE_DRIVER_PROTOCOL);
  record('A9-W37-FIXTURE-SUPPORTS-PROJECTION-PROTOCOL', failureServed && latestSuccessServed,
    `failure503=${failureServed}; latestSuccess200=${latestSuccessServed}`);
  record('A9-W37-FIXTURE-JOURNEY-STILL-COMPATIBLE', journeyServed, `journey200=${journeyServed}`);
  // 投影证据包与导出附件落到候选外证据根，供报告按路径与哈希绑定。
  const projectionFiles = fs.existsSync(projectionRoot) ? fs.readdirSync(projectionRoot).sort() : [];
  for (const name of projectionFiles) {
    fs.copyFileSync(path.join(projectionRoot, name), path.join(evidenceRoot, name));
  }
  const projectionPackagePath = path.join(evidenceRoot, 'projection-evidence.json');
  record('A9-W37-PROJECTION-EVIDENCE-PUBLISHED',
    projectionFiles.includes('projection-evidence.json') && projectionFiles.filter((name) => name.startsWith('projection-')).length === 6
    && fs.existsSync(projectionPackagePath),
  JSON.stringify(projectionFiles));
  // ADR-0121 R1：投影附件必须能被正式报告器解析。driver 导出字段与报告器约定一旦漂移，
  // 必须让本 smoke 失败，而不是等 Win7 报告签发时才暴露。
  let projectionParseable = false;
  let projectionParseDetail = '';
  try {
    const reportModule = require('./a9-win7-37-report.cjs');
    const readProjection = (name) => JSON.parse(fs.readFileSync(path.join(evidenceRoot, name), 'utf8'));
    const query = reportModule.parseQueryExport(readProjection('projection-query-export.json'), 'W37-03-INSPECTOR-PERSISTED-RESTART');
    reportModule.parseDomExport(readProjection('projection-dom-export.json'), query, 'W37-03-INSPECTOR-PERSISTED-RESTART', 'restart');
    const evidencePackage = readProjection('projection-evidence.json');
    const outcome = evidencePackage.results['W37-09-LATEST-OUTCOME-PROJECTION'].projection_evidence;
    const olderEvent = query.events.find((event) => event.event_id === outcome.older_failure.event_id);
    const newerEvent = query.events.find((event) => event.event_id === outcome.newer_success.event_id);
    const latestTurn = reportModule.latestTerminal(query, 'W37-09-LATEST-OUTCOME-PROJECTION');
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
  record('A9-W37-PROJECTION-ARTIFACTS-REPORT-PARSEABLE', projectionParseable, projectionParseDetail);
  // RF01: 显式要求关键断言集合存在且通过（fail-closed 对缺阶段/缺必需用例）
  const requiredSmokeAssertionIds = [
    'A9-15-QUERY-FAILURE-VISIBLE-RETRY',
    'A9-15-INSPECTOR-PERSISTED-EVENTS',
    'A9-15-DOM-OUTCOME-TURN-IDENTITY',
    'A9-15-OLDER-EVENT-PAGINATION',
    'A9-15-OLDER-FAILURE-NEWER-SUCCESS-RESTART',
    'A9-W37-DRIVER-PROTOCOL-DECLARED',
    'A9-W37-FIXTURE-SUPPORTS-PROJECTION-PROTOCOL',
    'A9-W37-PROJECTION-EVIDENCE-PUBLISHED',
    'A9-W37-PROJECTION-ARTIFACTS-REPORT-PARSEABLE',
    'A9-W37-RETRY-TARGET-BOUND',
    'A9-W37-LATE-LOAD-REJECTED',
    'A9-W37-LATE-LOAD-PARENT-REJECTED',
    'A9-W37-CONTROLLED-ERROR-NONZERO',
    'A9-W37-CONTROLLED-ERROR-PARENT-REJECTED',
    'A9-W37-NEGATIVE-PROBES-NO-RESIDUE',
    // ADR-0136：A9-19 实时性、头部文案与左栏保持断言。
    'A9-W37-LIVE-PROVIDER-PROBE',
    'A9-W37-RAIL-PRESERVED-AFTER-WORKSPACE-AND-CONVERSATION',
    'A9-W37-HEADER-AND-LABELS',
    'A9-W37-LIVE-TOOL-CARD-BEFORE-COMPLETION',
    'A9-W37-LIVE-NOTE-BEFORE-COMPLETION',
    'A9-W37-LIVE-PREVIEW-BEFORE-COMPLETION',
    'A9-W37-LIVE-PREVIEW-CLEARED-AFTER-COMPLETION',
    'A9-W37-LIVE-LATENCY-WITHIN-1500MS',
    'A9-W37-LIVE-SECRET-NOT-EXPOSED',
    'A9-W37-LIVE-REPORT-HAS-NO-TEST-KEY',
  ];
  const missingRequiredAssertions = (() => {
    const combined = allCases.concat(smokeCases);
    const counts = new Map();
    for (const item of combined) {
      if (item && item.passed === true) {
        counts.set(item.id, (counts.get(item.id) || 0) + 1);
      }
    }
    return requiredSmokeAssertionIds.filter((id) => counts.get(id) !== 1);
  })();
  record('A9-W37-REQUIRED-ASSERTIONS-PRESENT', missingRequiredAssertions.length === 0,
    missingRequiredAssertions.length === 0 ? 'ALL_PRESENT' : `MISSING:${missingRequiredAssertions.join(',')}`);
  const cases = [...allCases, ...smokeCases];
  const report = {
    schema_version: 1,
    evidence_kind: 'A9_19_WIN7_37_AUTOMATIC_PRODUCT_SMOKE',
    recorded_at: new Date().toISOString(),
    driver_protocol: baseEnv.A9_SMOKE_DRIVER_PROTOCOL,
    status: phases.length === 5 && phases.every((item) => item.code === 0) && phaseReportsValid
      && negativeProbesValid
      && retryTargetBound && missingRequiredAssertions.length === 0
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
    projection_report_parse: { parseable: projectionParseable, detail: projectionParseDetail },
    phases: phases.map((item) => ({ phase: item.phase, exit_code: item.code, stderr_tail: item.stderr.slice(-2000) })),
    cases,
    live_progress: reports.live && reports.live.liveProgress ? {
      first_persisted_ms: reports.live.liveProgress.firstPersisted, first_dom_ms: reports.live.liveProgress.firstDom,
      latency_ms: reports.live.liveProgress.latency, samples: reports.live.liveProgress.samples,
    } : null,
    evidence_files: [lateOut, controlledErrorOut, firstOut, secondOut, retryOut, stopOut, liveOut,
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

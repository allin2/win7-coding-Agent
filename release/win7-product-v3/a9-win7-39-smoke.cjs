// MECHANICALLY DERIVED FROM a9-win7-37-smoke.cjs (the WIN7-37 A9-19 candidate) FOR WIN7-39 / A9-23, ADR-0142.
// Identity tokens were rebased only (error codes, case IDs, kit/report/script names:
// W37→W39, A9-19→A9-23, WIN7_37→WIN7_39, win7-37→win7-39). Every non-identity
// difference is listed in A9_23_WIN7_39_VALIDATION.md §派生差异. A9-15 driver-emitted
// assertion IDs and the W28-H0x handover labels are intentionally preserved because
// WIN7-39 inherits the WIN7-37 (hence WIN7-28) acceptance contract.
// W39 additions after the five W37 journeys: w39_startup / w39_git / w39_m1_small /
// w39_m1_large / w39_m1b / w39_m2 / w39_m3 / w39_m4 phases, per-phase residue checks,
// product-entry gating env, per-case evidence excerpts and w39-case-index.json.
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
    else throw new Error(`A9_W39_DRIVER_RUNTIME_SPECIAL_FILE:${from}`);
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
  if (!fs.existsSync(sourceContract)) throw new Error(`A9_W39_DRIVER_CONTRACT_SOURCE_MISSING:${sourceContract}`);
  const contractTarget = path.join(appRoot, 'a9-projection-contract.cjs');
  fs.copyFileSync(sourceContract, contractTarget);
  const contractSha256 = sha256File(sourceContract);
  if (sha256File(contractTarget) !== contractSha256) throw new Error('A9_W39_DRIVER_CONTRACT_HASH_MISMATCH');
  fs.writeFileSync(path.join(appRoot, 'package.json'), `${JSON.stringify({
    name: 'a9-win7-39-driver', version: '1.0.0', main: 'main.cjs', private: true,
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
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'probe-w39', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] });
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
      if (!tools.includes('shell')) return { id: 'w39-f5', note: '执行预期失败的非零退出命令。', tool: { name: 'shell', args: { command: 'exit 3' } } };
      return { content: 'failing shell command observed.' };
    }
    // F3（W28-H02）：可重复工具错误——读取测试专用缺失目标，独立于 Provider 503 与非零退出。
    if (turn === 6) {
      if (!tools.includes('read')) return { id: 'w39-f6', note: '读取缺失的测试专用目标，产生可重复工具错误。', tool: { name: 'read', args: { path: 'missing-fixture-target.ts' } } };
      return { content: 'tool error observed.' };
    }
    // F3（W28-H02）：批准路径——针对预先创建并清点的 approve-target.tmp 产生精确审批；
    // 批准后工具真实执行（恢复的 tool 活动），与拒绝目标 scratch.tmp 分开。
    if (turn === 7) {
      if (!tools.includes('delete')) return { id: 'w39-a7', note: '高影响删除等待精确审批。', tool: { name: 'delete', args: { path: 'approve-target.tmp', permanent: true } } };
      return { content: 'approved operation executed and verified.' };
    }
    // F4（W28-H02）：批量历史——每次调用使用互不相同的只读参数，避免 agent loop 对重复
    // 相同调用去重，从而在真实产品链路产生足量事件，把旧失败推到首屏 300 条之外。
    if (turn === 8) {
      if (tools.length < BULK_STEPS) return { id: `w39-b8-${tools.length}`, note: '批量只读探查。', tool: { name: 'search', args: { pattern: `probe-${tools.length}-${Date.now() % 100000}` } } };
      return { content: 'bulk history generated and verified.' };
    }
    if (turn === 3) {
      if (!tools.includes('read')) return { id: 'w39-r3', note: '正在重新读取文件，确认重启后的会话可以继续。', tool: { name: 'read', args: { path: 'calc.ts' } } };
      return { content: 'second process turn completed.' };
    }
    if (turn === 2) {
      if (!tools.includes('delete')) return { id: 'w39-d1', note: '删除属于高影响操作，等待精确审批。', tool: { name: 'delete', args: { path: 'scratch.tmp', permanent: true } } };
      return { content: 'cleanup denied; nothing executed.' };
    }
    if (turn === 4) {
      if (!tools.includes('edit')) return { id: 'w39-e4', note: '形成较新修改事实。', tool: { name: 'edit', args: { path: 'calc.ts', oldText: 'return a + b;', newText: 'return a + b; // verified after older failure' } } };
      if (!tools.includes('shell')) return { id: 'w39-s4', note: '验证较新修改。', tool: { name: 'shell', args: { command: "Write-Output 'projection-verified'" } } };
      return { content: 'latest projection verified.' };
    }
    if (!tools.includes('read')) return { id: 'w39-r1', note: '先读取目标文件，再决定最小修改。', tool: { name: 'read', args: { path: 'calc.ts' } } };
    if (!tools.includes('edit')) return { id: 'w39-e1', note: '已确认问题，现在修正计算逻辑。', tool: { name: 'edit', args: { path: 'calc.ts', oldText: 'return a - b;', newText: 'return a + b;' } } };
    if (!tools.includes('shell')) return { id: 'w39-s1', note: '修改已完成，接下来运行目标验证。', tool: { name: 'shell', args: { command: "Write-Output 'smoke-verified'" } } };
    return { content: 'bug fixed and verified.' };
  });
}

function createStopFixture(markerPath) {
  const command = `$PID | Set-Content -LiteralPath ${quotePowerShell(markerPath)} -Encoding ASCII; while ($true) { Start-Sleep -Seconds 1 }`;
  return createFixture((parsed) => {
    const messages = parsed.messages || [];
    if (messages.some((item) => item.role === 'tool')) return { content: 'stop completed.' };
    return { id: 'w39-stop', note: '长任务已启动，等待用户停止。', tool: { name: 'shell', args: { command } } };
  });
}

// ADR-0136 / W39-16、W39-17：延迟流式 fixture。第一步先用约 3 秒逐块输出说明，再发起约 4 秒的 ping；
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
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'probe-w39-live', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] });
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
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'w39-live-shell', function: { name: 'shell', arguments: JSON.stringify({ command: 'ping -n 5 127.0.0.1' }) } }] }, finish_reason: 'tool_calls' }] });
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

// A9_W39_ENV_LIMIT_BEGIN
function w39AssertEnvironmentLengths(env) {
  for (const [name, value] of Object.entries(env)) {
    if (String(value).length > 32767) throw new Error(`A9_W39_ENV_VALUE_TOO_LONG:${name}`);
  }
}
// A9_W39_ENV_LIMIT_END

function runElectron(electronPath, driverPath, env, timeoutMs = 240000) {
  return new Promise((resolve) => {
    const childEnv = { ...process.env, ...env };
    delete childEnv.ELECTRON_RUN_AS_NODE;
    delete childEnv.NODE_OPTIONS;
    w39AssertEnvironmentLengths(childEnv);
    const child = childProcess.spawn(electronPath, [driverPath], { env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout = (stdout + chunk).slice(-65536); });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk).slice(-65536); });
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { child.kill(); } catch (_error) { /* already exited */ }
    }, timeoutMs);
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
    throw new Error(`A9_W39_SMOKE_RUNTIME_INVALID:${process.platform}:${process.versions.electron}:${process.versions.modules}`);
  }
  const candidateRoot = path.resolve(__dirname, '..');
  const productMain = path.join(candidateRoot, 'resources', 'app', 'product', 'main.js');
  const sqliteRoot = path.join(candidateRoot, 'resources', 'native', 'storage');
  const sourceDriver = path.join(__dirname, 'a9-win7-39-driver.cjs');
  const evidenceRoot = path.resolve(argument('evidence-root', path.join(candidateRoot, '..', 'a9-win7-39-evidence')));
  if (path.relative(candidateRoot, evidenceRoot) === '' || !path.relative(candidateRoot, evidenceRoot).startsWith('..')) {
    throw new Error('A9_W39_SMOKE_EVIDENCE_INSIDE_CANDIDATE');
  }
  // 派生差异 D-1：运行根与全部阶段目录名含中文与空格（W39-02 断言要求运行根、
  // 各工作区与数据根都含非 ASCII 字符与空格；W37 只有首个工作区满足）。
  const runRoot = path.join(evidenceRoot, `自动 运行 w39-${Date.now()}`);
  const workspaceRoot = path.join(runRoot, '中文 空格 workspace');
  const dataRoot = path.join(runRoot, '数据 data root');
  const visualRoot = path.join(runRoot, '截图 screenshots');
  const stopWorkspace = path.join(runRoot, '停止 stop workspace');
  const stopData = path.join(runRoot, '停止 stop-data');
  const negativeWorkspace = path.join(runRoot, '负例 negative workspace');
  const negativeData = path.join(runRoot, '负例 negative-data');
  const stopMarker = path.join(runRoot, 'stop-child.pid');
  const liveWorkspace = path.join(runRoot, '实时 live workspace');
  const liveData = path.join(runRoot, '实时 live-data');
  // W39 新阶段目录（每阶段独立工作区与数据根，路径含中文与空格）。
  const startupWorkspace = path.join(runRoot, '启动 startup workspace');
  const startupData = path.join(runRoot, '启动 startup-data');
  const gitWorkspace = path.join(runRoot, 'git 表单 workspace');
  const gitData = path.join(runRoot, 'git git-data');
  const m1SmallWorkspace = path.join(runRoot, 'm1 小历史 workspace');
  const m1SmallData = path.join(runRoot, 'm1 m1-small-data');
  const m1LargeWorkspace = path.join(runRoot, 'm1 大历史 workspace');
  const m1LargeData = path.join(runRoot, 'm1 m1-large-data');
  const m1bWorkspace = path.join(runRoot, 'm1b 冻结 workspace');
  const m1bData = path.join(runRoot, 'm1b m1b-data');
  const m2Workspace = path.join(runRoot, 'm2 截断 workspace');
  const m2Data = path.join(runRoot, 'm2 m2-data');
  const m3Workspace = path.join(runRoot, 'm3 分页 workspace');
  const m3Data = path.join(runRoot, 'm3 m3-data');
  const m4Workspace = path.join(runRoot, 'm4 集合 workspace');
  const m4Data = path.join(runRoot, 'm4 m4-data');
  const w39Directories = [workspaceRoot, stopWorkspace, stopData, negativeWorkspace, negativeData, liveWorkspace, liveData, visualRoot,
    startupWorkspace, startupData, gitWorkspace, gitData, m1SmallWorkspace, m1SmallData,
    m1LargeWorkspace, m1LargeData, m1bWorkspace, m1bData, m2Workspace, m2Data, m3Workspace, m3Data, m4Workspace, m4Data];
  for (const directory of w39Directories) {
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
  // W39：每个 w39_* 阶段工作区都含 calc.ts（workspace.select 公共前置等待该文件），
  // 以及各阶段专用夹具（路径含中文与空格）。
  for (const directory of [startupWorkspace, gitWorkspace, m1SmallWorkspace, m1LargeWorkspace, m1bWorkspace, m2Workspace, m3Workspace, m4Workspace]) {
    fs.writeFileSync(path.join(directory, 'calc.ts'), 'export const w39Probe = true;\n', 'utf8');
  }
  fs.writeFileSync(path.join(m1bWorkspace, 'small.txt'), 'alpha\n', 'utf8');
  // W39-11：1 MiB 单行十六进制文件（'0123456789abcdef' 重复 65536 次）。
  fs.writeFileSync(path.join(m1bWorkspace, 'hex-baseline.dat'), '0123456789abcdef'.repeat(65536), 'utf8');
  fs.writeFileSync(path.join(m2Workspace, 'm2-target.txt'), 'm2 target must not be modified\n', 'utf8');
  fs.writeFileSync(path.join(m3Workspace, 'counter.ts'), '// v0\nexport const version = 0;\n', 'utf8');
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
    // W39 / S-2：所有阶段（含反例）显式要求候选内产品入口；驱动缺该变量即以
    // A9_W39_DRIVER_PRODUCT_MAIN_REQUIRED 失败，不回落仓库布局。
    A9_SMOKE_REQUIRE_PRODUCT_MAIN: '1',
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
  record('A9-W39-DRIVER-CONTRACT-CLOSURE',
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
    'A9_W39_DRIVER_PRODUCT_ENTRY_LATE_LOAD')
    && lateReport.cases.some((item) => item?.id === 'A9_W39_DRIVER_PRODUCT_ENTRY_LATE_LOAD'
      && item.passed === false);
  const lateParentRejected = normalPhaseContract(lateRun, lateReport, 'late_load_negative') === false;
  const lateResidue = await waitForNoRelatedProcesses(candidateRoot, runRoot);
  record('A9-W39-LATE-LOAD-REJECTED', lateRejected,
    `exit=${lateRun.code}; timedOut=${lateRun.timed_out}; status=${lateReport.status}; error=${lateReport.error || ''}`);
  record('A9-W39-LATE-LOAD-PARENT-REJECTED', lateParentRejected,
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
  record('A9-W39-CONTROLLED-ERROR-NONZERO', controlledErrorRejected,
    `exit=${controlledErrorRun.code}; timedOut=${controlledErrorRun.timed_out}; status=${controlledErrorReport.status}; error=${controlledErrorReport.error || ''}`);
  record('A9-W39-CONTROLLED-ERROR-PARENT-REJECTED', controlledErrorParentRejected,
    `normalPhaseAccepted=${!controlledErrorParentRejected}`);
  const negativeProbesNoResidue = lateResidue.no_residue === true && controlledErrorResidue.no_residue === true;
  record('A9-W39-NEGATIVE-PROBES-NO-RESIDUE', negativeProbesNoResidue,
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
  record('A9-W39-DENY-TARGET-SURVIVES-DENIAL',
    denyTargetBefore.exists === true && denyTargetAfter.exists === true
      && denyTargetAfter.sha256 === denyTargetBefore.sha256 && denyTargetAfter.size === denyTargetBefore.size,
    JSON.stringify({ before: denyTargetBefore, after: denyTargetAfter }));
  record('A9-W39-APPROVE-TARGET-EXECUTED-AFTER-APPROVAL',
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
  // ADR-0136：第五阶段——延迟流式下的运行过程实时可见（W39-16/17），并核对头部文案与左栏保持（W39-20/21）。
  const liveTestKey = `A9W39-LIVE-${crypto.randomBytes(8).toString('hex')}`;
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
  record('A9-W39-LIVE-REPORT-HAS-NO-TEST-KEY', liveRawText.length > 0 && !liveRawText.includes(liveTestKey)
    && !liveRawText.includes(liveTestKey.slice(0, 10)), `bytes=${liveRawText.length}`);

  // =====================================================================
  // W39 追加阶段（A9-23）。与 W37 的全部非身份差异见 A9_23_WIN7_39_VALIDATION.md
  // §派生差异。判定只读产品运行后的产物；每阶段结束后与 smoke 结束前各做一次残留检查。
  // =====================================================================
  const w39Phases = [];
  const w39PhaseReports = [];
  const runW39Phase = async (name, workspace, dataRoot, extraEnv, fixtureUrl, timeoutMs) => {
    const outPath = path.join(runRoot, `${name}.json`);
    w39Phases.push({ phase: name, ...(await runElectron(electronPath, driverPath, {
      ...baseEnv,
      A9_SMOKE_WORKSPACE: workspace, A9_SMOKE_DATAROOT: dataRoot, WIN7AGENT_A9_DATAROOT: dataRoot,
      A9_SMOKE_MODE: name, A9_SMOKE_OUT: outPath,
      ...(fixtureUrl ? { A9_SMOKE_FIXTURE_URL: fixtureUrl } : {}),
      ...(extraEnv || {}),
    }, timeoutMs || 600000)) });
    // S-3：每阶段结束后的残留检查（内部断言，非必需断言清单成员）。
    const residue = await waitForNoRelatedProcesses(candidateRoot, runRoot);
    record(`W39-PHASE-RESIDUE-${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`, residue.no_residue === true, JSON.stringify(residue));
    const phaseReport = readJson(outPath);
    w39PhaseReports.push({ phase: name, path: outPath, report: phaseReport });
    return phaseReport;
  };
  const w39CasePassed = (phaseReport, caseId) => Boolean(phaseReport && Array.isArray(phaseReport.cases)
    && phaseReport.cases.some((item) => item && item.id === caseId && item.passed === true));
  const hasNonAsciiAndSpace = (value) => /[^\x00-\x7F]/.test(String(value)) && String(value).includes(' ');

  // —— W39-07～09：A9-20 形态清单（A9-20 §2 全部 12 类的具体写法）。 ——
  const encodedGitPush = Buffer.from('git push origin main', 'utf16le').toString('base64');
  const bulkPadding = 'p'.repeat(270000);
  const W39_GIT_FORMS = [
    { index: 1, id: 'cat1-control', command: 'cmd /c "git push origin main"', binding: 'origin-main' },
    { index: 2, id: 'cat2-concat-lower', command: 'cmd /c"git push origin main"', binding: 'origin-main' },
    { index: 3, id: 'cat2-concat-upper', command: 'cmd /C"git push origin main"', binding: 'origin-main' },
    { index: 4, id: 'cat3-pathed', command: 'cmd.exe /d /s /c"C:\\g\\git.exe push origin main"', binding: 'origin-main' },
    { index: 5, id: 'cat4-switch-cluster', command: 'cmd /s/c "git push origin main"', binding: 'origin-main' },
    { index: 6, id: 'cat5-r-switch', command: 'cmd /R "git push origin main"', binding: 'origin-main' },
    { index: 7, id: 'cat6-prefix-co', command: 'powershell -co "git push origin main"', binding: 'origin-main' },
    { index: 8, id: 'cat6-prefix-Com', command: 'powershell -Com "git push origin main"', binding: 'origin-main' },
    { index: 9, id: 'cat6-slash-command', command: 'powershell /Command "git push origin main"', binding: 'origin-main' },
    { index: 10, id: 'cat7-joined', command: 'powershell -NoProfile -c"git push origin main"', binding: 'origin-main' },
    { index: 11, id: 'cat8-encoded-e', command: `powershell -e ${encodedGitPush}`, binding: 'origin-main' },
    { index: 12, id: 'cat8-encoded-ec', command: `powershell -ec ${encodedGitPush}`, binding: 'origin-main' },
    { index: 13, id: 'cat9-bash-joined', command: 'bash -c"git push origin main"', binding: 'origin-main' },
    { index: 14, id: 'cat9-bash-lc', command: 'bash -lc "git push origin main"', binding: 'origin-main' },
    { index: 15, id: 'cat9-sh-ec', command: 'sh -ec "git push origin main"', binding: 'origin-main' },
    { index: 16, id: 'cat10-bash-c', command: 'bash -c "git push origin main"', binding: 'origin-main' },
    { index: 17, id: 'cat11-bulk-cmd', command: `cmd /c "${bulkPadding} git push origin main"`, binding: 'summary' },
    { index: 18, id: 'cat12-positional', command: 'powershell "git push origin main"', binding: 'origin-main' },
    { index: 19, id: 'cat12-positional-noprofile', command: 'powershell -NoProfile "git push origin main"', binding: 'origin-main' },
  ];
  const gitFormsFile = path.join(runRoot, 'w39-git-forms.json');
  fs.writeFileSync(gitFormsFile, `${JSON.stringify(W39_GIT_FORMS, null, 2)}\n`, 'utf8');
  // 远端：本地裸仓库 + 带 origin 的工作区仓库；Win7 无 git 时远端判定记 NOT_PERFORMED。
  const w39GitDetect = childProcess.spawnSync('git', ['--version'], { windowsHide: true, timeout: 15000 });
  const gitAvailable = !w39GitDetect.error && w39GitDetect.status === 0;
  const bareRoot = path.join(runRoot, 'git 裸仓库 origin');
  const gitWorkRepo = path.join(runRoot, 'git 工作区 仓库');
  const gitMainRefFile = path.join(bareRoot, 'refs', 'heads', 'main');
  let gitMainRefBefore = null;
  let gitSetupError = '';
  if (gitAvailable) {
    try {
      const gitRun = (args, cwd) => {
        const result = childProcess.spawnSync('git', args, { cwd, windowsHide: true, timeout: 30000 });
        if (result.status !== 0) throw new Error(`git ${args.join(' ')} -> exit ${result.status}: ${String(result.stderr || '').slice(0, 200)}`);
      };
      gitRun(['init', '--bare', bareRoot]);
      fs.writeFileSync(path.join(gitWorkRepo, 'README.md'), 'w39 git forms workspace\n', 'utf8');
      gitRun(['init'], gitWorkRepo);
      gitRun(['config', 'user.email', 'w39-smoke@example.invalid'], gitWorkRepo);
      gitRun(['config', 'user.name', 'w39-smoke'], gitWorkRepo);
      gitRun(['add', 'README.md'], gitWorkRepo);
      gitRun(['commit', '-m', 'w39 seed'], gitWorkRepo);
      gitRun(['remote', 'add', 'origin', bareRoot], gitWorkRepo);
      gitRun(['push', 'origin', 'HEAD:refs/heads/main'], gitWorkRepo);
      gitMainRefBefore = fs.existsSync(gitMainRefFile) ? fs.readFileSync(gitMainRefFile, 'utf8') : null;
    } catch (error) {
      gitSetupError = String(error && error.message ? error.message : error).slice(0, 300);
    }
  }
  const gitFixture = createFixture((parsed) => {
    const messages = parsed.messages || [];
    const lastUserIndex = messages.map((item) => item.role).lastIndexOf('user');
    const prompt = String((messages[lastUserIndex] || {}).content || '');
    const tools = messages.slice(lastUserIndex + 1).filter((item) => item.role === 'tool').map((item) => item.name);
    const form = W39_GIT_FORMS.find((item) => prompt === `run git form ${item.id}`);
    if (form && tools.length === 0) {
      return { id: `w39-git-${form.index}`, note: `执行第 ${form.index} 个 git 外部写形态。`, tool: { name: 'shell', args: { command: form.command } } };
    }
    return { content: 'git form denied; nothing executed.' };
  });
  await gitFixture.listen();
  const gitReport = await runW39Phase('w39_git', gitWorkspace, gitData, {
    A9_SMOKE_W39_GIT_FORMS_FILE: gitFormsFile,
  }, `http://127.0.0.1:${gitFixture.server.address().port}`, 900000);
  await gitFixture.close();
  const gitMainRefAfter = fs.existsSync(gitMainRefFile) ? fs.readFileSync(gitMainRefFile, 'utf8') : null;
  const gitRemoteUnchanged = !gitAvailable || (gitSetupError === '' && gitMainRefBefore !== null
    && gitMainRefAfter === gitMainRefBefore);
  record('W39-GIT-REMOTE-UNCHANGED', gitRemoteUnchanged, JSON.stringify({
    git_available: gitAvailable, setup_error: gitSetupError,
    remote_check: gitAvailable ? 'refs/heads/main compared before and after the phase' : 'NOT_PERFORMED_NO_GIT',
    ref_unchanged: gitAvailable ? gitMainRefAfter === gitMainRefBefore : null,
  }));

  // —— W39-03：启动耗时（无 fixture）。 ——
  const startupReport = await runW39Phase('w39_startup', startupWorkspace, startupData, {});

  // —— W39-10：M1 种子（候选内 A9PersistenceManager 公开方法；不得手写建表或插入 SQL）。 ——
  const w39SeedM1History = (dataRoot, workspaceRoot, options) => {
    const stateModule = path.join(candidateRoot, 'resources', 'app', 'state', 'dist', 'a9-persistence.js');
    const coreModule = path.join(candidateRoot, 'resources', 'app', 'core', 'dist', 'index.js');
    if (!fs.existsSync(stateModule)) throw new Error(`A9_W39_STATE_MODULE_MISSING:${stateModule}`);
    if (!fs.existsSync(coreModule)) throw new Error(`A9_W39_CORE_MODULE_MISSING:${coreModule}`);
    const { A9PersistenceManager } = require(stateModule);
    const { canonicalizeWorkspacePath } = require(coreModule);
    const Database = require(path.join(candidateRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3'));
    const outcome = A9PersistenceManager.open({
      databasePath: path.join(dataRoot, 'a9-state.db'), dataRoot,
      openDatabase: (databasePath, openOptions) => new Database(databasePath, openOptions && openOptions.readonly ? { readonly: true } : {}),
    });
    if (!outcome || outcome.status !== 'ready' || !outcome.manager) {
      throw new Error(`A9_W39_M1_SEED_OPEN_FAILED:${JSON.stringify(outcome || {}).slice(0, 300)}`);
    }
    const manager = outcome.manager;
    const canonical = canonicalizeWorkspacePath(workspaceRoot);
    manager.saveSession(options.sessionId, canonical, { title: options.title });
    manager.activateConversation(canonical, options.sessionId);
    manager.upsertTask(options.taskId, options.sessionId, 'active');
    for (let index = 1; index <= options.completedTurns; index += 1) {
      const turnId = `${options.prefix}-completed-${String(index).padStart(3, '0')}`;
      manager.upsertTurn(turnId, options.taskId, options.sessionId, 'completed',
        { outcome: 'completed', verification: 'not_applicable' });
      manager.recordModelEvent(options.sessionId, turnId, 'model_note',
        { content: `seed history ${options.prefix} turn ${index}`, step: index });
    }
    const interruptedTurnId = `${options.prefix}-interrupted-001`;
    manager.upsertTurn(interruptedTurnId, options.taskId, options.sessionId, 'interrupted',
      { outcome: 'needs_approval', verification: 'not_applicable' });
    // 无 checkpoint 行、无磁盘清单：不调用 saveCheckpoint，也不写清单文件。
    return { canonicalWorkspace: canonical, interruptedTurnId };
  };
  const m1SmallSeed = w39SeedM1History(m1SmallData, m1SmallWorkspace, {
    sessionId: 'w39-m1-small-session', taskId: 'w39-m1-small-task', prefix: 'w39-m1-small',
    completedTurns: 5, title: 'w39 m1 小历史',
  });
  const m1SmallReport = await runW39Phase('w39_m1_small', m1SmallWorkspace, m1SmallData, {
    A9_SMOKE_W39_M1_EXPECTED_TURN_ID: m1SmallSeed.interruptedTurnId,
    A9_SMOKE_W39_M1_EXPECTED_FACT_TURNS: '5',
  });
  const m1LargeSeed = w39SeedM1History(m1LargeData, m1LargeWorkspace, {
    sessionId: 'w39-m1-large-session', taskId: 'w39-m1-large-task', prefix: 'w39-m1-large',
    completedTurns: 100, title: 'w39 m1 大历史',
  });
  const m1LargeReport = await runW39Phase('w39_m1_large', m1LargeWorkspace, m1LargeData, {
    A9_SMOKE_W39_M1_EXPECTED_TURN_ID: m1LargeSeed.interruptedTurnId,
    A9_SMOKE_W39_M1_EXPECTED_FACT_TURNS: '100',
  });
  const m1SmallCase = (m1SmallReport.cases || []).find((item) => item && item.id === 'W39-M1-RECOVERY-SMALL') || {};
  const m1LargeCase = (m1LargeReport.cases || []).find((item) => item && item.id === 'W39-M1-RECOVERY-LARGE') || {};
  const m1SmallTiming = (m1SmallReport.cases || []).find((item) => item && item.id === 'W39-M1-TIMING-SMALL') || {};
  const m1LargeTiming = (m1LargeReport.cases || []).find((item) => item && item.id === 'W39-M1-TIMING-LARGE') || {};
  record('A9-W39-M1-TARGETED-RECOVERY',
    w39CasePassed(m1SmallReport, 'W39-M1-RECOVERY-SMALL') && w39CasePassed(m1LargeReport, 'W39-M1-RECOVERY-LARGE'),
    JSON.stringify({ small: m1SmallCase.detail || '', large: m1LargeCase.detail || '' }));
  record('A9-W39-M1-STARTUP-TIMING-RECORDED',
    w39CasePassed(m1SmallReport, 'W39-M1-TIMING-SMALL') && w39CasePassed(m1LargeReport, 'W39-M1-TIMING-LARGE'),
    JSON.stringify({ small: m1SmallTiming.detail || '', large: m1LargeTiming.detail || '' }));

  // —— W39-11：M1b 冻结 + URL 脱敏。口令随机生成，不写入任何证据文件。 ——
  const m1bPassword = crypto.randomBytes(12).toString('hex');
  const m1bRedactionMarker = '***redacted***@example.invalid/x';
  const m1bUrl = `https://w39user:${m1bPassword}@example.invalid/x`;
  const m1bFixture = createFixture((parsed) => {
    const messages = parsed.messages || [];
    const lastUserIndex = messages.map((item) => item.role).lastIndexOf('user');
    const prompt = String((messages[lastUserIndex] || {}).content || '');
    const tools = messages.slice(lastUserIndex + 1).filter((item) => item.role === 'tool').map((item) => item.name);
    if (prompt === 'edit the small file' && !tools.includes('edit')) {
      return { id: 'w39-m1b-edit', note: '修改小文件并冻结基线。', tool: { name: 'edit', args: { path: 'small.txt', oldText: 'alpha', newText: 'beta' } } };
    }
    if (prompt === 'echo the service url' && !tools.includes('shell')) {
      return { id: 'w39-m1b-echo', note: `检查服务 ${m1bUrl} 的可达性。`, tool: { name: 'shell', args: { command: `Write-Output 'service ${m1bUrl} checked'` } } };
    }
    return { content: 'm1b turn done.' };
  });
  await m1bFixture.listen();
  const m1bReport = await runW39Phase('w39_m1b', m1bWorkspace, m1bData, {
    A9_SMOKE_W39_M1B_URL_PASSWORD: m1bPassword,
  }, `http://127.0.0.1:${m1bFixture.server.address().port}`);
  await m1bFixture.close();
  const w39ScanDatabaseForSecret = (dataRoot, secret, marker) => {
    const result = { ok: false, rows_scanned: 0, secret_hits: 0, marker_hits: 0, error: '' };
    try {
      const Database = require(path.join(candidateRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3'));
      const db = new Database(path.join(dataRoot, 'a9-state.db'), { readonly: true });
      try {
        const rows = db.prepare('SELECT payload_json FROM a9_events').all();
        result.ok = true;
        for (const row of rows) {
          result.rows_scanned += 1;
          const text = String(row.payload_json || '');
          result.secret_hits += text.split(secret).length - 1;
          result.marker_hits += text.split(marker).length - 1;
        }
      } finally { db.close(); }
    } catch (error) {
      result.error = String(error && error.message ? error.message : error).slice(0, 300);
    }
    return result;
  };
  const w39ScanFilesForSecret = (rootDirectory, secret, marker) => {
    const result = { files_scanned: 0, secret_hits: 0, marker_hits: 0, skipped: 0 };
    const walk = (directory) => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        const full = path.join(directory, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!entry.isFile()) continue;
        let stat;
        try { stat = fs.statSync(full); } catch (_error) { result.skipped += 1; continue; }
        if (stat.size > 8 * 1024 * 1024) { result.skipped += 1; continue; }
        let text;
        try { text = fs.readFileSync(full, 'utf8'); } catch (_error) { result.skipped += 1; continue; }
        result.files_scanned += 1;
        result.secret_hits += text.split(secret).length - 1;
        result.marker_hits += text.split(marker).length - 1;
      }
    };
    try { walk(rootDirectory); } catch (error) { result.skipped += 1; result.error = String(error && error.message ? error.message : error).slice(0, 200); }
    return result;
  };
  const m1bDbScan = w39ScanDatabaseForSecret(m1bData, m1bPassword, m1bRedactionMarker);
  const m1bFileScan = w39ScanFilesForSecret(m1bData, m1bPassword, m1bRedactionMarker);
  const m1bReportPath = path.join(runRoot, 'w39_m1b.json');
  const m1bReportRaw = fs.existsSync(m1bReportPath) ? fs.readFileSync(m1bReportPath, 'utf8') : '';
  const m1bReportScan = {
    files_scanned: m1bReportRaw ? 1 : 0,
    secret_hits: m1bReportRaw.split(m1bPassword).length - 1,
    marker_hits: m1bReportRaw.split(m1bRedactionMarker).length - 1,
  };
  record('A9-W39-M1B-URL-REDACTED',
    m1bDbScan.secret_hits === 0 && m1bFileScan.secret_hits === 0 && m1bReportScan.secret_hits === 0
    && (m1bDbScan.marker_hits + m1bFileScan.marker_hits + m1bReportScan.marker_hits) >= 1,
    JSON.stringify({
      db: m1bDbScan, files: m1bFileScan, driver_report: m1bReportScan,
      marker: '***redacted***@example.invalid/x (product redactSecrets/redactUrlUserinfo output form)',
      password_recorded_in_evidence: false,
    }));

  // —— W39-12：M2 输出上限。 ——
  const m2Fixture = createFixture((parsed) => {
    const messages = parsed.messages || [];
    const lastUserIndex = messages.map((item) => item.role).lastIndexOf('user');
    const prompt = String((messages[lastUserIndex] || {}).content || '');
    if (prompt === 'trigger oversized model response') {
      return { note: 'A'.repeat(1100 * 1024), tool: { name: 'edit', args: { path: 'm2-target.txt', oldText: 'must', newText: 'CHANGED-BY-TRUNCATED-TOOL-CALL' } } };
    }
    return { content: 'second turn completed.' };
  });
  await m2Fixture.listen();
  const m2Report = await runW39Phase('w39_m2', m2Workspace, m2Data, {}, `http://127.0.0.1:${m2Fixture.server.address().port}`);
  await m2Fixture.close();

  // —— W39-13：M3 checkpoint 分页（≥60 真实 Turn，逐轮小修改）。 ——
  const m3Fixture = createFixture((parsed) => {
    const messages = parsed.messages || [];
    const lastUserIndex = messages.map((item) => item.role).lastIndexOf('user');
    const prompt = String((messages[lastUserIndex] || {}).content || '');
    const match = /^m3 turn (\d+)$/.exec(prompt);
    const tools = messages.slice(lastUserIndex + 1).filter((item) => item.role === 'tool').map((item) => item.name);
    if (match && !tools.includes('edit')) {
      const index = Number(match[1]);
      return { id: `w39-m3-${index}`, note: `m3 第 ${index} 轮小修改。`, tool: { name: 'edit', args: { path: 'counter.ts', oldText: `// v${index - 1}`, newText: `// v${index}` } } };
    }
    return { content: `m3 turn ${match ? match[1] : '?'} done.` };
  });
  await m3Fixture.listen();
  const m3Report = await runW39Phase('w39_m3', m3Workspace, m3Data, {
    A9_SMOKE_W39_M3_TURNS: '60',
  }, `http://127.0.0.1:${m3Fixture.server.address().port}`, 900000);
  await m3Fixture.close();

  // —— W39-14：M4 集合上限（种子 ≥2500 条经公开事件写入方法）。 ——
  const w39SeedM4Events = (dataRoot, workspaceRoot) => {
    const stateModule = path.join(candidateRoot, 'resources', 'app', 'state', 'dist', 'a9-persistence.js');
    const coreModule = path.join(candidateRoot, 'resources', 'app', 'core', 'dist', 'index.js');
    if (!fs.existsSync(stateModule)) throw new Error(`A9_W39_STATE_MODULE_MISSING:${stateModule}`);
    if (!fs.existsSync(coreModule)) throw new Error(`A9_W39_CORE_MODULE_MISSING:${coreModule}`);
    const { A9PersistenceManager } = require(stateModule);
    const { canonicalizeWorkspacePath } = require(coreModule);
    const Database = require(path.join(candidateRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3'));
    const outcome = A9PersistenceManager.open({
      databasePath: path.join(dataRoot, 'a9-state.db'), dataRoot,
      openDatabase: (databasePath, openOptions) => new Database(databasePath, openOptions && openOptions.readonly ? { readonly: true } : {}),
    });
    if (!outcome || outcome.status !== 'ready' || !outcome.manager) {
      throw new Error(`A9_W39_M4_SEED_OPEN_FAILED:${JSON.stringify(outcome || {}).slice(0, 300)}`);
    }
    const manager = outcome.manager;
    const canonical = canonicalizeWorkspacePath(workspaceRoot);
    manager.saveSession('w39-m4-seed-session', canonical, { title: 'w39 m4 集合上限' });
    manager.activateConversation(canonical, 'w39-m4-seed-session');
    manager.upsertTask('w39-m4-seed-task', 'w39-m4-seed-session', 'active');
    let written = 0;
    for (let index = 1; index <= 2500; index += 1) {
      const turnNumber = Math.floor((index - 1) / 250) + 1;
      const turnId = `w39-m4-seed-turn-${String(turnNumber).padStart(3, '0')}`;
      if ((index - 1) % 250 === 0) {
        manager.upsertTurn(turnId, 'w39-m4-seed-task', 'w39-m4-seed-session', 'completed',
          { outcome: 'completed', verification: 'not_applicable' });
      }
      if (index % 2 === 1) {
        manager.recordModelEvent('w39-m4-seed-session', turnId, 'model_note',
          { content: `m4 seed note ${index}`, step: index });
      } else {
        manager.recordToolEvent('w39-m4-seed-session', turnId, 'tool_end',
          { toolName: 'search', callId: `w39-m4-${index}`, step: index, result: `m4 seed result ${index}` });
      }
      written += 1;
    }
    return { written };
  };
  const m4Seed = w39SeedM4Events(m4Data, m4Workspace);
  const M4_BULK_STEPS = 55;
  const m4Fixture = createFixture((parsed) => {
    const messages = parsed.messages || [];
    const lastUserIndex = messages.map((item) => item.role).lastIndexOf('user');
    const prompt = String((messages[lastUserIndex] || {}).content || '');
    const tools = messages.slice(lastUserIndex + 1).filter((item) => item.role === 'tool').map((item) => item.name);
    if (prompt === 'generate many events' && tools.length < M4_BULK_STEPS) {
      return { id: `w39-m4-${tools.length}`, note: '批量只读探查产生事件。', tool: { name: 'search', args: { pattern: `w39-m4-${tools.length}-${Date.now() % 100000}` } } };
    }
    return { content: 'bulk events generated.' };
  });
  await m4Fixture.listen();
  const m4Report = await runW39Phase('w39_m4', m4Workspace, m4Data, {}, `http://127.0.0.1:${m4Fixture.server.address().port}`, 900000);
  await m4Fixture.close();

  // —— W39-02：中文空格路径 + 各阶段 productMainLoaded 有效。 ——
  const w39PathEntries = {
    run_root: runRoot,
    workspaces: {
      first: workspaceRoot, stop: stopWorkspace, negative: negativeWorkspace, live: liveWorkspace,
      w39_startup: startupWorkspace, w39_git: gitWorkspace, w39_m1_small: m1SmallWorkspace,
      w39_m1_large: m1LargeWorkspace, w39_m1b: m1bWorkspace, w39_m2: m2Workspace,
      w39_m3: m3Workspace, w39_m4: m4Workspace,
    },
    data_roots: {
      first: dataRoot, stop: stopData, negative: negativeData, live: liveData,
      w39_startup: startupData, w39_git: gitData, w39_m1_small: m1SmallData,
      w39_m1_large: m1LargeData, w39_m1b: m1bData, w39_m2: m2Data,
      w39_m3: m3Data, w39_m4: m4Data,
    },
  };
  const allPathsOk = hasNonAsciiAndSpace(runRoot)
    && Object.values(w39PathEntries.workspaces).every(hasNonAsciiAndSpace)
    && Object.values(w39PathEntries.data_roots).every(hasNonAsciiAndSpace);
  const productMainByPhase = {};
  let productMainOk = true;
  for (const entry of w39PhaseReports.concat([
    { phase: 'first', report: readJson(firstOut) }, { phase: 'second', report: readJson(secondOut) },
    { phase: 'retry', report: readJson(retryOut) }, { phase: 'stop', report: readJson(stopOut) },
    { phase: 'live', report: readJson(liveOut) },
  ])) {
    const loaded = entry.report && entry.report.productMainLoaded ? String(entry.report.productMainLoaded) : '';
    const valid = loaded.length > 0 && path.resolve(loaded).startsWith(path.resolve(candidateRoot) + path.sep)
      && fs.existsSync(loaded);
    productMainByPhase[entry.phase] = { productMainLoaded: loaded, valid };
    if (!valid) productMainOk = false;
  }
  record('A9-W39-CHINESE-SPACE-PATHS', allPathsOk && productMainOk, JSON.stringify({
    ...w39PathEntries, candidate_root: candidateRoot, product_main_by_phase: productMainByPhase,
  }));

  // —— W39 证据摘录（文件名固定，见交接书 §3.4）。 ——
  const copyVisual = (scene, targetName) => {
    const source = path.join(visualRoot, `${scene}.png`);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(evidenceRoot, targetName));
    return fs.existsSync(path.join(evidenceRoot, targetName));
  };
  const w39Excerpt = (phaseReport, caseIds) => ({
    phase_status: phaseReport ? phaseReport.status : 'NO_REPORT',
    phase_error: phaseReport ? (phaseReport.error || null) : null,
    cases: (phaseReport && Array.isArray(phaseReport.cases) ? phaseReport.cases : [])
      .filter((item) => caseIds.includes(item.id)),
  });
  fs.writeFileSync(path.join(evidenceRoot, 'w39-02-paths.json'), `${JSON.stringify({
    candidate_root: candidateRoot, ...w39PathEntries, product_main_by_phase: productMainByPhase,
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w39-03-startup.json'), `${JSON.stringify({
    ...(startupReport.w39Startup || {}),
    case: (startupReport.cases || []).find((item) => item.id === 'A9-W39-STARTUP-WITHIN-60S') || null,
  }, null, 2)}\n`, 'utf8');
  copyVisual('w39-startup', 'w39-03-startup.png');
  fs.writeFileSync(path.join(evidenceRoot, 'w39-04-task-flow.json'), `${JSON.stringify(w39Excerpt(readJson(firstOut),
    ['A9F1-FORMAL-EXPLORER-SESSION', 'A9F1-MODE-SELECTION', 'A9F1-PROVIDER-CONFIG-PROBE', 'A9F1-TOOL-JOURNEY',
      'A9F1-SHELL-EVENT-DTO-UI', 'A9-15-PROGRESS-EVENT-ORDER', 'A9-15-PROGRESS-RENDERED-ONCE']), null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w39-05-diff.json'), `${JSON.stringify(w39Excerpt(readJson(firstOut),
    ['A9F1-DIFF', 'A9F1-SNAPSHOT-FACTS']), null, 2)}\n`, 'utf8');
  copyVisual('completed', 'w39-05-diff.png');
  fs.writeFileSync(path.join(evidenceRoot, 'w39-06-approval-stop-restart.json'), `${JSON.stringify({
    first_approval: w39Excerpt(readJson(firstOut), ['A9F1-APPROVAL-CARD-TRUE-TARGET', 'A9-15-APPROVAL-RESOLVED-PERSISTED',
      'A9-15-DENY-ZERO-TARGET-SIDE-EFFECT']),
    second_restore: w39Excerpt(readJson(secondOut), ['A9F2-RESTORE-ACTIVE-WORKSPACE', 'A9F2-RESTORE-MODE',
      'A9F2-RESTORE-CHECKPOINT', 'A9F2-OLD-APPROVAL-REJECTED']),
    retry: w39Excerpt(readJson(retryOut), ['A9-15-QUERY-FAILURE-VISIBLE-RETRY']),
    stop: w39Excerpt(readJson(stopOut), ['A9F6-STOP-SHELL-CHILD-STARTED', 'A9F6-STOP-UI-ACTIVE', 'A9F6-STOP-TURN-CANCELLED']),
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w39-07-09-git-forms.json'), `${JSON.stringify({
    git_available: gitAvailable, setup_error: gitSetupError,
    remote_check: gitAvailable ? 'refs/heads/main compared before and after the phase' : 'NOT_PERFORMED_NO_GIT',
    ref_unchanged: gitAvailable ? gitMainRefAfter === gitMainRefBefore : null,
    forms: W39_GIT_FORMS.map((form) => ({
      index: form.index, id: form.id, binding_expectation: form.binding,
      case: (gitReport.cases || []).find((item) => item.id === `A9-W39-GIT-FORM-${String(form.index).padStart(2, '0')}`) || null,
    })),
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w39-10-startup-recovery.json'), `${JSON.stringify({
    small: { seed: m1SmallSeed, report: { status: m1SmallReport.status, w39M1: m1SmallReport.w39M1 || null } },
    large: { report: { status: m1LargeReport.status, w39M1: m1LargeReport.w39M1 || null } },
    aggregate_cases: (smokeCases || []).filter((item) => item.id === 'A9-W39-M1-TARGETED-RECOVERY'
      || item.id === 'A9-W39-M1-STARTUP-TIMING-RECORDED'),
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w39-11-m1b-hex-redaction.json'), `${JSON.stringify({
    freeze: w39Excerpt(m1bReport, ['A9-W39-M1B-FREEZE-DURATION', 'W39-M1B-URL-TURN-RAN']),
    redaction: { db: m1bDbScan, files: m1bFileScan, driver_report: m1bReportScan },
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w39-12-output-limits.json'), `${JSON.stringify(w39Excerpt(m2Report,
    ['A9-W39-M2-TRUNCATED-WITH-WARNINGS', 'A9-W39-M2-TOOL-NOT-EXECUTED', 'A9-W39-M2-NEXT-TURN-OK']), null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w39-13-checkpoint-paging.json'), `${JSON.stringify(w39Excerpt(m3Report,
    ['A9-W39-M3-COUNT-MATCHES-DB', 'A9-W39-M3-OLDER-PAGES-CONTINUOUS', 'A9-W39-M3-OLDER-DIFF']), null, 2)}\n`, 'utf8');
  copyVisual('w39-m3', 'w39-13-checkpoint-paging.png');
  fs.writeFileSync(path.join(evidenceRoot, 'w39-14-collection-bounds.json'), `${JSON.stringify({
    seed: m4Seed,
    cases: w39Excerpt(m4Report, ['A9-W39-M4-CAP-NOTICE', 'A9-W39-M4-RELEASED-COUNT-ACCURATE', 'A9-W39-M4-RENDERER-MEMORY-SAMPLED']),
  }, null, 2)}\n`, 'utf8');

  // —— S-3：smoke 结束前的最终残留检查（结构化快照）。 ——
  const finalResidue = await waitForNoRelatedProcesses(candidateRoot, runRoot);
  record('A9-W39-FINAL-NO-RESIDUE', finalResidue.no_residue === true, JSON.stringify(finalResidue));
  fs.writeFileSync(path.join(evidenceRoot, 'w39-15-residue.json'), `${JSON.stringify(finalResidue, null, 2)}\n`, 'utf8');

  const w39Reports = {
    w39_startup: startupReport, w39_git: gitReport,
    w39_m1_small: m1SmallReport, w39_m1_large: m1LargeReport, w39_m1b: m1bReport,
    w39_m2: m2Report, w39_m3: m3Report, w39_m4: m4Report,
  };
  const w39EvidenceFiles = ['w39-02-paths.json', 'w39-03-startup.json', 'w39-03-startup.png',
    'w39-04-task-flow.json', 'w39-05-diff.json', 'w39-05-diff.png', 'w39-06-approval-stop-restart.json',
    'w39-07-09-git-forms.json', 'w39-10-startup-recovery.json', 'w39-11-m1b-hex-redaction.json',
    'w39-12-output-limits.json', 'w39-13-checkpoint-paging.json', 'w39-13-checkpoint-paging.png',
    'w39-14-collection-bounds.json', 'w39-15-residue.json']
    .map((name) => path.join(evidenceRoot, name)).filter((filePath) => fs.existsSync(filePath));

  const reports = { first, second, retry: readJson(retryOut), stop: readJson(stopOut), live: readJson(liveOut), ...w39Reports };
  const phaseEntries = [
    ['first', firstOut], ['second', secondOut], ['retry', retryOut], ['stop', stopOut], ['live', liveOut],
    ...w39Phases.map((item) => [item.phase, path.join(runRoot, `${item.phase}.json`)]),
  ];
  const phaseReportsValid = phaseEntries.every(([mode, filePath]) => fs.existsSync(filePath)
    && normalPhaseContract(phases.find((item) => item.phase === mode), reports[mode], mode));
  const retryReport = reports.retry || {};
  const retryTargetBound = Boolean(retryTargetConversation
    && retryReport.retryTarget?.conversationId === retryTargetConversation
    && Array.isArray(retryReport.cases)
    && retryReport.cases.some((c) => c.id === 'A9-15-QUERY-FAILURE-VISIBLE-RETRY' && c.passed === true));
  record('A9-W39-RETRY-TARGET-BOUND', retryTargetBound,
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
  record('A9-W39-DRIVER-PROTOCOL-DECLARED', baseEnv.A9_SMOKE_DRIVER_PROTOCOL === 'projection', baseEnv.A9_SMOKE_DRIVER_PROTOCOL);
  record('A9-W39-FIXTURE-SUPPORTS-PROJECTION-PROTOCOL', failureServed && latestSuccessServed,
    `failure503=${failureServed}; latestSuccess200=${latestSuccessServed}`);
  record('A9-W39-FIXTURE-JOURNEY-STILL-COMPATIBLE', journeyServed, `journey200=${journeyServed}`);
  // 投影证据包与导出附件落到候选外证据根，供报告按路径与哈希绑定。
  const projectionFiles = fs.existsSync(projectionRoot) ? fs.readdirSync(projectionRoot).sort() : [];
  for (const name of projectionFiles) {
    fs.copyFileSync(path.join(projectionRoot, name), path.join(evidenceRoot, name));
  }
  const projectionPackagePath = path.join(evidenceRoot, 'projection-evidence.json');
  record('A9-W39-PROJECTION-EVIDENCE-PUBLISHED',
    projectionFiles.includes('projection-evidence.json') && projectionFiles.filter((name) => name.startsWith('projection-')).length === 6
    && fs.existsSync(projectionPackagePath),
  JSON.stringify(projectionFiles));
  // ADR-0121 R1：投影附件必须能被正式报告器解析。driver 导出字段与报告器约定一旦漂移，
  // 必须让本 smoke 失败，而不是等 Win7 报告签发时才暴露。
  let projectionParseable = false;
  let projectionParseDetail = '';
  try {
    const reportModule = require('./a9-win7-39-report.cjs');
    const readProjection = (name) => JSON.parse(fs.readFileSync(path.join(evidenceRoot, name), 'utf8'));
    const query = reportModule.parseQueryExport(readProjection('projection-query-export.json'), 'W39-03-INSPECTOR-PERSISTED-RESTART');
    reportModule.parseDomExport(readProjection('projection-dom-export.json'), query, 'W39-03-INSPECTOR-PERSISTED-RESTART', 'restart');
    const evidencePackage = readProjection('projection-evidence.json');
    const outcome = evidencePackage.results['W39-09-LATEST-OUTCOME-PROJECTION'].projection_evidence;
    const olderEvent = query.events.find((event) => event.event_id === outcome.older_failure.event_id);
    const newerEvent = query.events.find((event) => event.event_id === outcome.newer_success.event_id);
    const latestTurn = reportModule.latestTerminal(query, 'W39-09-LATEST-OUTCOME-PROJECTION');
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
  record('A9-W39-PROJECTION-ARTIFACTS-REPORT-PARSEABLE', projectionParseable, projectionParseDetail);
  // RF01: 显式要求关键断言集合存在且通过（fail-closed 对缺阶段/缺必需用例）
  const requiredSmokeAssertionIds = [
    'A9-15-QUERY-FAILURE-VISIBLE-RETRY',
    'A9-15-INSPECTOR-PERSISTED-EVENTS',
    'A9-15-DOM-OUTCOME-TURN-IDENTITY',
    'A9-15-OLDER-EVENT-PAGINATION',
    'A9-15-OLDER-FAILURE-NEWER-SUCCESS-RESTART',
    'A9-W39-DRIVER-PROTOCOL-DECLARED',
    'A9-W39-FIXTURE-SUPPORTS-PROJECTION-PROTOCOL',
    'A9-W39-PROJECTION-EVIDENCE-PUBLISHED',
    'A9-W39-PROJECTION-ARTIFACTS-REPORT-PARSEABLE',
    'A9-W39-RETRY-TARGET-BOUND',
    'A9-W39-LATE-LOAD-REJECTED',
    'A9-W39-LATE-LOAD-PARENT-REJECTED',
    'A9-W39-CONTROLLED-ERROR-NONZERO',
    'A9-W39-CONTROLLED-ERROR-PARENT-REJECTED',
    'A9-W39-NEGATIVE-PROBES-NO-RESIDUE',
    // ADR-0136：A9-23 实时性、头部文案与左栏保持断言。
    'A9-W39-LIVE-PROVIDER-PROBE',
    'A9-W39-RAIL-PRESERVED-AFTER-WORKSPACE-AND-CONVERSATION',
    'A9-W39-HEADER-AND-LABELS',
    'A9-W39-LIVE-TOOL-CARD-BEFORE-COMPLETION',
    'A9-W39-LIVE-NOTE-BEFORE-COMPLETION',
    'A9-W39-LIVE-PREVIEW-BEFORE-COMPLETION',
    'A9-W39-LIVE-PREVIEW-CLEARED-AFTER-COMPLETION',
    'A9-W39-LIVE-LATENCY-WITHIN-1500MS',
    'A9-W39-LIVE-SECRET-NOT-EXPOSED',
    'A9-W39-LIVE-REPORT-HAS-NO-TEST-KEY',
    // A9-23 / W39 追加断言（每项恰好出现一次）。
    'A9-W39-CHINESE-SPACE-PATHS',
    'A9-W39-STARTUP-WITHIN-60S',
    ...Array.from({ length: 19 }, (_item, index) => `A9-W39-GIT-FORM-${String(index + 1).padStart(2, '0')}`),
    'A9-W39-M1-TARGETED-RECOVERY',
    'A9-W39-M1-STARTUP-TIMING-RECORDED',
    'A9-W39-M1B-FREEZE-DURATION',
    'A9-W39-M1B-URL-REDACTED',
    'A9-W39-M2-TRUNCATED-WITH-WARNINGS',
    'A9-W39-M2-TOOL-NOT-EXECUTED',
    'A9-W39-M2-NEXT-TURN-OK',
    'A9-W39-M3-COUNT-MATCHES-DB',
    'A9-W39-M3-OLDER-PAGES-CONTINUOUS',
    'A9-W39-M3-OLDER-DIFF',
    'A9-W39-M4-CAP-NOTICE',
    'A9-W39-M4-RELEASED-COUNT-ACCURATE',
    'A9-W39-M4-RENDERER-MEMORY-SAMPLED',
    'A9-W39-FINAL-NO-RESIDUE',
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
  record('A9-W39-REQUIRED-ASSERTIONS-PRESENT', missingRequiredAssertions.length === 0,
    missingRequiredAssertions.length === 0 ? 'ALL_PRESENT' : `MISSING:${missingRequiredAssertions.join(',')}`);
  const cases = [...allCases, ...smokeCases];
  // S-5：w39-case-index.json —— 每个用例 → 断言 ID、结果、证据文件相对路径。
  const caseResult = (id) => {
    const hits = cases.filter((item) => item.id === id);
    if (!hits.length) return 'MISSING';
    return hits.every((item) => item.passed === true) ? (hits.length === 1 ? 'PASS' : `PASS_X${hits.length}`) : 'FAIL';
  };
  const gitFormResults = (indexes) => indexes.map((index) => ({
    id: `A9-W39-GIT-FORM-${String(index).padStart(2, '0')}`, result: caseResult(`A9-W39-GIT-FORM-${String(index).padStart(2, '0')}`),
  }));
  const w39CaseIndex = {
    schema_version: 1,
    candidate: 'WIN7-39',
    generated_at: new Date().toISOString(),
    smoke_status: null,
    cases: [
      { case_id: 'W39-01-CANDIDATE-INTEGRITY', assertions: [], result: 'VERIFIED_BY_RUN_A9_23_W39_INTEGRITY_CMD_NOT_SMOKE', evidence: ['integrity-output.txt', 'a9-package-integrity.json'] },
      { case_id: 'W39-02-CHINESE-SPACE-PATH', assertions: [{ id: 'A9-W39-CHINESE-SPACE-PATHS', result: caseResult('A9-W39-CHINESE-SPACE-PATHS') }], evidence: ['w39-02-paths.json'] },
      { case_id: 'W39-03-STARTUP-WITHIN-60S', assertions: [{ id: 'A9-W39-STARTUP-WITHIN-60S', result: caseResult('A9-W39-STARTUP-WITHIN-60S') }], evidence: ['w39-03-startup.png', 'w39-03-startup.json'] },
      { case_id: 'W39-04-TASK-READ-EDIT-SHELL', assertions: ['A9F1-TOOL-JOURNEY', 'A9F1-SHELL-EVENT-DTO-UI', 'A9-15-PROGRESS-EVENT-ORDER', 'A9-15-PROGRESS-RENDERED-ONCE'].map((id) => ({ id, result: caseResult(id) })), evidence: ['w39-04-task-flow.json'] },
      { case_id: 'W39-05-DIFF-AND-CHECKPOINT', assertions: ['A9F1-DIFF', 'A9F1-SNAPSHOT-FACTS'].map((id) => ({ id, result: caseResult(id) })), evidence: ['w39-05-diff.png', 'w39-05-diff.json'] },
      { case_id: 'W39-06-APPROVAL-STOP-RESTART', assertions: ['A9F1-APPROVAL-CARD-TRUE-TARGET', 'A9-15-DENY-ZERO-TARGET-SIDE-EFFECT', 'A9F6-STOP-TURN-CANCELLED', 'A9F2-RESTORE-ACTIVE-WORKSPACE', 'A9-15-QUERY-FAILURE-VISIBLE-RETRY'].map((id) => ({ id, result: caseResult(id) })), evidence: ['w39-06-approval-stop-restart.json'] },
      { case_id: 'W39-07-A9-20-GIT-FORMS-CMD', assertions: gitFormResults([1, 2, 3, 4, 5, 6]), evidence: ['w39-07-09-git-forms.json'] },
      { case_id: 'W39-08-A9-20-GIT-FORMS-POWERSHELL', assertions: gitFormResults([7, 8, 9, 10, 11, 12, 18, 19]), evidence: ['w39-07-09-git-forms.json'] },
      { case_id: 'W39-09-A9-20-GIT-FORMS-POSIX-AND-BULK', assertions: gitFormResults([13, 14, 15, 16, 17]), evidence: ['w39-07-09-git-forms.json'] },
      { case_id: 'W39-10-M1-STARTUP-TARGETED-RECOVERY', assertions: [{ id: 'A9-W39-M1-TARGETED-RECOVERY', result: caseResult('A9-W39-M1-TARGETED-RECOVERY') }, { id: 'A9-W39-M1-STARTUP-TIMING-RECORDED', result: caseResult('A9-W39-M1-STARTUP-TIMING-RECORDED') }], evidence: ['w39-10-startup-recovery.json'] },
      { case_id: 'W39-11-M1B-HEX-FREEZE-AND-URL-REDACTION', assertions: [{ id: 'A9-W39-M1B-FREEZE-DURATION', result: caseResult('A9-W39-M1B-FREEZE-DURATION') }, { id: 'A9-W39-M1B-URL-REDACTED', result: caseResult('A9-W39-M1B-URL-REDACTED') }], evidence: ['w39-11-m1b-hex-redaction.json'] },
      { case_id: 'W39-12-M2-OUTPUT-LIMITS', assertions: ['A9-W39-M2-TRUNCATED-WITH-WARNINGS', 'A9-W39-M2-TOOL-NOT-EXECUTED', 'A9-W39-M2-NEXT-TURN-OK'].map((id) => ({ id, result: caseResult(id) })), evidence: ['w39-12-output-limits.json'] },
      { case_id: 'W39-13-M3-CHECKPOINT-PAGINATION', assertions: ['A9-W39-M3-COUNT-MATCHES-DB', 'A9-W39-M3-OLDER-PAGES-CONTINUOUS', 'A9-W39-M3-OLDER-DIFF'].map((id) => ({ id, result: caseResult(id) })), evidence: ['w39-13-checkpoint-paging.png', 'w39-13-checkpoint-paging.json'] },
      { case_id: 'W39-14-M4-COLLECTION-BOUNDS', assertions: ['A9-W39-M4-CAP-NOTICE', 'A9-W39-M4-RELEASED-COUNT-ACCURATE', 'A9-W39-M4-RENDERER-MEMORY-SAMPLED'].map((id) => ({ id, result: caseResult(id) })), evidence: ['w39-14-collection-bounds.json'] },
      { case_id: 'W39-15-SECRET-SCAN-AND-POSTFLIGHT', assertions: [{ id: 'A9-W39-FINAL-NO-RESIDUE', result: caseResult('A9-W39-FINAL-NO-RESIDUE') }], evidence: ['w39-15-residue.json'] },
    ],
  };
  const report = {
    schema_version: 1,
    evidence_kind: 'A9_23_WIN7_39_AUTOMATIC_PRODUCT_SMOKE',
    recorded_at: new Date().toISOString(),
    driver_protocol: baseEnv.A9_SMOKE_DRIVER_PROTOCOL,
    status: phases.length === 5 && w39Phases.length === 8
      && phases.concat(w39Phases).every((item) => item.code === 0) && phaseReportsValid
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
    phases: phases.concat(w39Phases).map((item) => ({ phase: item.phase, exit_code: item.code, stderr_tail: item.stderr.slice(-2000) })),
    cases,
    live_progress: reports.live && reports.live.liveProgress ? {
      first_persisted_ms: reports.live.liveProgress.firstPersisted, first_dom_ms: reports.live.liveProgress.firstDom,
      latency_ms: reports.live.liveProgress.latency, samples: reports.live.liveProgress.samples,
    } : null,
    evidence_files: [lateOut, controlledErrorOut, firstOut, secondOut, retryOut, stopOut, liveOut,
      ...w39Phases.map((item) => path.join(runRoot, `${item.phase}.json`)),
      ...w39EvidenceFiles,
      ...fs.readdirSync(visualRoot).map((name) => path.join(visualRoot, name)),
      ...projectionFiles.map((name) => path.join(evidenceRoot, name))],
    real_provider: 'NOT_PERFORMED_BY_AUTOMATIC_FIXTURE_SMOKE',
  };
  const reportPath = path.join(runRoot, 'automatic-smoke.json');
  w39CaseIndex.smoke_status = report.status;
  fs.writeFileSync(path.join(evidenceRoot, 'w39-case-index.json'), `${JSON.stringify(w39CaseIndex, null, 2)}\n`, 'utf8');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ ...report, report_path: reportPath }, null, 2)}\n`);
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}

main().catch((error) => {
  process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
  process.exitCode = 1;
});

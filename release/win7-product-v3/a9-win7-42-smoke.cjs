// MECHANICALLY DERIVED FROM THE FROZEN a9-win7-41-smoke.cjs FOR WIN7-42 / A9-27, ADR-0147.
// Candidate identity tokens are rebased; registered additions and lineage corrections
// are listed in A9_27_WIN7_42_VALIDATION.md. A9-15 driver-emitted assertion IDs and
// W28-H0x handover labels remain because W42 retains the W40 inherited contract.
// W41's eight inherited phases are rebased to w42_startup / w42_git / w42_m1_small /
// w42_m1_large / w42_m1b / w42_m2 / w42_m3 / w42_m4. W42 adds w42_stop,
// w42_review, w42_review_restart and w42_review_mode with product-observation assertions.
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

// A9_W42_GIT_RESOLVE_BEGIN
function w42ResolveGitExecutable(explicitPath) {
  if (explicitPath && !path.isAbsolute(explicitPath)) throw new Error('A9_W42_GIT_EXE_NOT_ABSOLUTE');
  const probeCandidate = (candidate) => {
    if (!path.isAbsolute(candidate.path) || !fs.existsSync(candidate.path)) return null;
    const probe = childProcess.spawnSync(candidate.path, ['--version'],
      { windowsHide: true, encoding: 'utf8', timeout: 15000 });
    if (!probe.error && probe.status === 0) {
      return { executable: candidate.path, source: candidate.source,
        version: String(probe.stdout || '').trim().slice(0, 200) };
    }
    return null;
  };
  for (const candidate of [
    ...(explicitPath ? [{ path: explicitPath, source: 'git-exe-argument' }] : []),
    { path: 'C:\\acceptance\\mvp_mingit\\cmd\\git.exe', source: 'mvp-mingit' },
  ]) {
    const found = probeCandidate(candidate);
    if (found) return found;
  }
  const located = childProcess.spawnSync('where', ['git'], { windowsHide: true, encoding: 'utf8', timeout: 15000 });
  if (!located.error && located.status === 0) {
    for (const line of String(located.stdout || '').split(/\r?\n/)) {
      const found = probeCandidate({ path: line.trim(), source: 'where-git' });
      if (found) return found;
    }
  }
  return { executable: null, source: 'NOT_PERFORMED_NO_GIT', version: null };
}
// A9_W42_GIT_RESOLVE_END
function w42LinkColdSeedTurns(manager) {
  // M4 seeds events without checkpoints. Cold history needs the same task/turn
  // association as a completed product turn; the inherited M4 seed is unchanged.
  for (let turnNumber = 1; turnNumber <= 10; turnNumber += 1) {
    const turnId = `w42-m4-seed-turn-${String(turnNumber).padStart(3, '0')}`;
    manager.saveCheckpoint({ turnId, sessionId: 'w42-m4-seed-session', payload: {
      schemaVersion: 1, requestPrompt: `w42 m4 seed turn ${turnNumber}`,
      outcome: 'completed', verification: 'not_applicable', finalMessage: 'm4 seed completed',
      toolCallsExecuted: 0, externalChanges: [], providerContextGeneration: 0,
    } });
  }
  const facts = manager.listConversationFacts('w42-m4-seed-session');
  if (facts.length !== 10 || facts.some(fact => !fact.turnId)) throw new Error('W42_COLD_SEED_FACTS_UNLINKED');
  return facts;
}
function sleep(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }
function readJson(filePath) {
  try {
    const report = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!report || typeof report !== 'object' || Array.isArray(report) || !Array.isArray(report.cases)) {
      return { mode: report?.mode, status: 'ERROR', raw_status: report?.status || null,
        cases: [], error: 'A9_W42_DRIVER_REPORT_SHAPE_INVALID' };
    }
    return report;
  } catch (error) { return { status: 'NO_REPORT', cases: [], error: String(error?.message || error).slice(0, 500) }; }
}
function quotePowerShell(value) { return `'${String(value).replace(/'/g, "''")}'`; }
function copyTree(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(destination, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
    else throw new Error(`A9_W42_DRIVER_RUNTIME_SPECIAL_FILE:${from}`);
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
  const probeSource = path.join(__dirname, 'w42-product-probes.cjs');
  const probeTarget = path.join(appRoot, 'w42-product-probes.cjs');
  fs.copyFileSync(probeSource, probeTarget);
  if (sha256File(probeSource) !== sha256File(probeTarget)) throw new Error('A9_W42_PROBE_MODULE_HASH_MISMATCH');
  // W28-H01：外置 driver 依赖闭包——共享投影契约必须随 driver 一起搬移到候选外运行目录，
  // 并在复制后做 SHA-256 核对；契约缺失或哈希不符即 fail-closed，不回退 legacy 跳过投影验收。
  const sourceContract = path.join(__dirname, 'a9-projection-contract.cjs');
  if (!fs.existsSync(sourceContract)) throw new Error(`A9_W42_DRIVER_CONTRACT_SOURCE_MISSING:${sourceContract}`);
  const contractTarget = path.join(appRoot, 'a9-projection-contract.cjs');
  fs.copyFileSync(sourceContract, contractTarget);
  const contractSha256 = sha256File(sourceContract);
  if (sha256File(contractTarget) !== contractSha256) throw new Error('A9_W42_DRIVER_CONTRACT_HASH_MISMATCH');
  fs.writeFileSync(path.join(appRoot, 'package.json'), `${JSON.stringify({
    name: 'a9-win7-42-driver', version: '1.0.0', main: 'main.cjs', private: true,
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
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'probe-w42', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] });
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
      if (!tools.includes('shell')) return { id: 'w42-f5', note: '执行预期失败的非零退出命令。', tool: { name: 'shell', args: { command: 'exit 3' } } };
      return { content: 'failing shell command observed.' };
    }
    // F3（W28-H02）：可重复工具错误——读取测试专用缺失目标，独立于 Provider 503 与非零退出。
    if (turn === 6) {
      if (!tools.includes('read')) return { id: 'w42-f6', note: '读取缺失的测试专用目标，产生可重复工具错误。', tool: { name: 'read', args: { path: 'missing-fixture-target.ts' } } };
      return { content: 'tool error observed.' };
    }
    // F3（W28-H02）：批准路径——针对预先创建并清点的 approve-target.tmp 产生精确审批；
    // 批准后工具真实执行（恢复的 tool 活动），与拒绝目标 scratch.tmp 分开。
    if (turn === 7) {
      if (!tools.includes('delete')) return { id: 'w42-a7', note: '高影响删除等待精确审批。', tool: { name: 'delete', args: { path: 'approve-target.tmp', permanent: true } } };
      return { content: 'approved operation executed and verified.' };
    }
    // F4（W28-H02）：批量历史——每次调用使用互不相同的只读参数，避免 agent loop 对重复
    // 相同调用去重，从而在真实产品链路产生足量事件，把旧失败推到首屏 300 条之外。
    if (turn === 8) {
      if (tools.length < BULK_STEPS) return { id: `w42-b8-${tools.length}`, note: '批量只读探查。', tool: { name: 'search', args: { pattern: `probe-${tools.length}-${Date.now() % 100000}` } } };
      return { content: 'bulk history generated and verified.' };
    }
    if (turn === 3) {
      if (!tools.includes('read')) return { id: 'w42-r3', note: '正在重新读取文件，确认重启后的会话可以继续。', tool: { name: 'read', args: { path: 'calc.ts' } } };
      return { content: 'second process turn completed.' };
    }
    if (turn === 2) {
      if (!tools.includes('delete')) return { id: 'w42-d1', note: '删除属于高影响操作，等待精确审批。', tool: { name: 'delete', args: { path: 'scratch.tmp', permanent: true } } };
      return { content: 'cleanup denied; nothing executed.' };
    }
    if (turn === 4) {
      if (!tools.includes('edit')) return { id: 'w42-e4', note: '形成较新修改事实。', tool: { name: 'edit', args: { path: 'calc.ts', oldText: 'return a + b;', newText: 'return a + b; // verified after older failure' } } };
      if (!tools.includes('shell')) return { id: 'w42-s4', note: '验证较新修改。', tool: { name: 'shell', args: { command: 'C:\\acceptance\\python38_mvp\\python.exe check.py' } } };
      return { content: 'latest projection verified.' };
    }
    if (!tools.includes('read')) return { id: 'w42-r1', note: '先读取目标文件，再决定最小修改。', tool: { name: 'read', args: { path: 'calc.ts' } } };
    if (!tools.includes('edit')) return { id: 'w42-e1', note: '已确认问题，现在修正计算逻辑。', tool: { name: 'edit', args: { path: 'calc.ts', oldText: 'return a - b;', newText: 'return a + b;' } } };
    if (!tools.includes('shell')) return { id: 'w42-s1', note: '修改已完成，接下来运行目标验证。', tool: { name: 'shell', args: { command: 'C:\\acceptance\\python38_mvp\\python.exe check.py' } } };
    return { content: 'bug fixed and verified.' };
  });
}

function createStopFixture(markerPath) {
  const command = `$PID | Set-Content -LiteralPath ${quotePowerShell(markerPath)} -Encoding ASCII; while ($true) { Start-Sleep -Seconds 1 }`;
  return createFixture((parsed) => {
    const messages = parsed.messages || [];
    if (messages.some((item) => item.role === 'tool')) return { content: 'stop completed.' };
    return { id: 'w42-stop', note: '长任务已启动，等待用户停止。', tool: { name: 'shell', args: { command } } };
  });
}

// A9-27 fixtures only emit model tool calls. Assertions consume product output later.
function createW42StopFixture(markerPath) {
  const command = `$PID | Set-Content -LiteralPath ${quotePowerShell(markerPath)} -Encoding ASCII; while ($true) { Write-Output 'w42-running'; Start-Sleep -Milliseconds 100 }`;
  return createFixture((parsed) => {
    const messages = parsed.messages || [];
    if (messages.some((item) => item.role === 'tool')) return { content: 'stop observed.' };
    return { id: 'a925-stop-shell', note: '启动持续输出命令。', tool: { name: 'shell', args: { command } } };
  });
}

function createW42ReviewFixture() {
  return createFixture((parsed) => {
    const messages = parsed.messages || [];
    const lastUserIndex = messages.map((item) => item.role).lastIndexOf('user');
    const prompt = String((messages[lastUserIndex] || {}).content || '');
    const calls = messages.slice(lastUserIndex + 1).filter((item) => item.role === 'tool');
    const done = (name) => calls.some((item) => item.name === name);
    if (prompt === 'w42 review turn 1') {
      if (!done('read')) return { id: 'a925-r1', tool: { name: 'read', args: { path: 'calc.ts' } } };
      if (!done('edit')) return { id: 'a925-e1', tool: { name: 'edit', args: { path: 'calc.ts', oldText: 'return a - b;', newText: 'return a + b;' } } };
      if (!done('write')) return { id: 'a925-w1', tool: { name: 'write', args: { path: 'notes.md', content: '# W42 note\n' } } };
      return { content: 'First change-review turn completed.' };
    }
    if (prompt === 'w42 review turn 2') {
      const count = (name) => calls.filter((item) => item.name === name).length;
      if (count('read') === 0) return { id: 'a925-r2a', tool: { name: 'read', args: { path: 'a.txt' } } };
      if (count('edit') === 0) return { id: 'a925-e2a', tool: { name: 'edit', args: { path: 'a.txt', oldText: 'a-before', newText: 'a-after' } } };
      if (count('read') === 1) return { id: 'a925-r2b', tool: { name: 'read', args: { path: 'b.txt' } } };
      if (count('edit') === 1) return { id: 'a925-e2b', tool: { name: 'edit', args: { path: 'b.txt', oldText: 'b-before', newText: 'b-after' } } };
      return { content: 'Second change-review turn completed.' };
    }
    if (prompt === 'w42 review turn 3') {
      if (!done('read')) return { id: 'a925-r3', tool: { name: 'read', args: { path: 'calc.ts' } } };
      if (!done('edit')) return { id: 'a925-e3', tool: { name: 'edit', args: { path: 'calc.ts', oldText: 'return a + b;', newText: 'return a * b;' } } };
      return { content: 'Third change-review turn completed.' };
    }
    if (prompt === 'w42 review turn 4') {
      if (!done('shell')) return { id: 'a925-s4', tool: { name: 'shell', args: {
        command: "Set-Content -LiteralPath 'gen.txt' -Value 'generated by shell' -Encoding UTF8; Add-Content -LiteralPath 'big.bin' -Value 'x' -Encoding ASCII; Write-Output 'w42-command-complete'",
      } } };
      return { content: 'Shell change-review turn completed.' };
    }
    return { content: 'Unsupported W42 review prompt.' };
  });
}

function createW42ReviewModeFixture(toolResultPath) {
  return createFixture((parsed) => {
    const messages = parsed.messages || [];
    const lastUserIndex = messages.map((item) => item.role).lastIndexOf('user');
    const calls = messages.slice(lastUserIndex + 1).filter((item) => item.role === 'tool');
    if (calls.length === 0) return { id: 'a925-review-denied', tool: { name: 'write', args: { path: 'review-denied.txt', content: 'must not appear\n' } } };
    const response = String(calls[0].content || '');
    if (String(messages[lastUserIndex]?.content || '') === 'w42 review mode write')
      fs.writeFileSync(toolResultPath, `${JSON.stringify({ source: 'product provider request tool messages',
      prompt: String(messages[lastUserIndex]?.content || ''),
      toolResults: calls.map((item) => ({ role: item.role, name: item.name, content: String(item.content || '') })) }, null, 2)}\n`, 'utf8');
    return { content: response.slice(0, 500) };
  });
}

// ADR-0136 / A9-19 延迟流式用例（WIN7-37 编号 16/17）：第一步先用约 3 秒逐块输出说明，再发起约 4 秒的 ping；
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
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'probe-w42-live', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] }, finish_reason: 'tool_calls' }] });
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
        send({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'w42-live-shell', function: { name: 'shell', arguments: JSON.stringify({ command: 'ping -n 5 127.0.0.1' }) } }] }, finish_reason: 'tool_calls' }] });
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

// A9_W42_ENV_LIMIT_BEGIN
function w42AssertEnvironmentLengths(env) {
  for (const [name, value] of Object.entries(env)) {
    if (String(value).length > 32767) throw new Error(`A9_W42_ENV_VALUE_TOO_LONG:${name}`);
  }
}
// A9_W42_ENV_LIMIT_END

// A9_W42_REQUIRED_SUMMARY_BEGIN
function w42RequiredAssertionSummary(requiredIds, cases) {
  const missing = [];
  const presentNotPassed = [];
  for (const id of requiredIds) {
    const hits = cases.filter((item) => item && item.id === id);
    if (hits.length === 0) missing.push(id);
    else if (hits.length !== 1 || hits[0].passed !== true) presentNotPassed.push(id);
  }
  return { missing, presentNotPassed };
}
// A9_W42_REQUIRED_SUMMARY_END

function w42PhaseClock() {
  const clock = { wallMs: null, monotonicNs: null, errors: [] };
  try { clock.wallMs = Date.now(); } catch (_error) { clock.errors.push('WALL_CLOCK_READ_ERROR'); }
  try { clock.monotonicNs = process.hrtime.bigint(); } catch (_error) { clock.errors.push('MONOTONIC_CLOCK_READ_ERROR'); }
  return clock;
}

function w42PhaseTiming(started, ended) {
  const timing = { started_at: null, ended_at: null, duration_ms: null };
  const errors = [...(started?.errors || []), ...(ended?.errors || [])];
  for (const [name, value] of [['started_at', started?.wallMs], ['ended_at', ended?.wallMs]]) {
    if (!Number.isFinite(value)) { errors.push(`${name.toUpperCase()}_INVALID`); continue; }
    try { timing[name] = new Date(value).toISOString(); }
    catch (_error) { errors.push(`${name.toUpperCase()}_INVALID`); }
  }
  if (typeof started?.monotonicNs === 'bigint' && typeof ended?.monotonicNs === 'bigint'
    && ended.monotonicNs >= started.monotonicNs) {
    const durationMs = Number(ended.monotonicNs - started.monotonicNs) / 1000000;
    if (Number.isFinite(durationMs)) timing.duration_ms = durationMs;
    else errors.push('MONOTONIC_DURATION_INVALID');
  } else errors.push('MONOTONIC_DURATION_INVALID');
  if (errors.length > 0) timing.timing_error = [...new Set(errors)].join(';');
  return timing;
}

function runElectron(electronPath, driverPath, env, timeoutMs = 240000) {
  const started = w42PhaseClock();
  return new Promise((resolve) => {
    const childEnv = { ...process.env, ...env };
    delete childEnv.ELECTRON_RUN_AS_NODE;
    delete childEnv.NODE_OPTIONS;
    w42AssertEnvironmentLengths(childEnv);
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
      const timing = w42PhaseTiming(started, w42PhaseClock());
      resolve({ code: code == null ? 1 : code, stdout, stderr, timed_out: timedOut, ...timing });
    });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: 1, stdout, stderr, timed_out: timedOut,
        execution_error: String(error?.message || error).slice(0, 1000),
        ...w42PhaseTiming(started, w42PhaseClock()) });
    });
  });
}

// R4-2: failures belong to smoke records; never rewrite a driver report.
async function w42RunElectron(electronPath, driverPath, env, timeoutMs) {
  const started = w42PhaseClock();
  try { return await runElectron(electronPath, driverPath, env, timeoutMs); }
  catch (error) {
    return { code: 1, timed_out: false, stdout: '', stderr: String(error?.stack || error).slice(0, 2000),
      execution_error: String(error?.message || error).slice(0, 1000),
      ...w42PhaseTiming(started, w42PhaseClock()) };
  }
}
function w42PrepareSeed(prepare) {
  try { return prepare(); }
  catch (error) { return { error: String(error?.message || error).slice(0, 1000) }; }
}
async function w42ListenFixture(fixture) {
  try { await fixture.listen(); return null; }
  catch (error) { return `FIXTURE_LISTEN_ERROR:${String(error?.message || error).slice(0, 500)}`; }
}
async function w42CloseFixture(fixture) {
  try {
    const result = await fixture.close();
    return result ? `FIXTURE_CLOSE_ERROR:${String(result.message || result).slice(0, 500)}` : null;
  }
  catch (error) { return `FIXTURE_CLOSE_ERROR:${String(error?.message || error).slice(0, 500)}`; }
}
function w42FixtureUrl(fixture) {
  const address = fixture.server.address();
  return address ? `http://127.0.0.1:${address.port}` : '';
}
function w42BlockPhase(phases, blockedReports, mode, reason) {
  const report = { mode, status: 'BLOCKED', cases: [], blocked_reason: String(reason).slice(0, 1000) };
  blockedReports[mode] = report;
  phases.push({ phase: mode, status: 'BLOCKED', blocked_reason: report.blocked_reason,
    code: null, timed_out: false, stdout: '', stderr: '', started_at: null, ended_at: null, duration_ms: null });
  return report;
}
function w42FinalizeCaseIndex(index, runs, reports) {
  const dependencies = [[], Object.keys(reports), ['w42_startup'], ['first'], ['first', 'w42_review'],
    ['first', 'second', 'retry', 'stop', 'w42_stop'], ['w42_git'], ['w42_git'], ['w42_git'],
    ['w42_m1_small', 'w42_m1_large'], ['w42_m1b'], ['w42_m2'], ['w42_m3'], ['w42_m4'], [],
    ['w42_review'], ['w42_review', 'w42_review_restart'], ['w42_review'], ['w42_review'],
    ['w42_review'], ['w42_review', 'w42_review_mode'], ['w42_review'],
    ['w42_recovery_dir'], ['w42_verification'], ['w42_instructions_environment'], ['w42_context_budget'],
    ['w42_cold_history'], ['w42_stop', 'w42_review', 'w42_cancel_output'], ['w42_audit'], ['w42_provider']];
  for (const item of index.cases) {
    const number = Number(item.case_id.slice(4, 6));
    if (number === 1) continue; // Candidate-external integrity is not a smoke stage.
    const modes = dependencies[number - 1] || [];
    const blocked = modes.filter((mode) => reports[mode]?.status === 'BLOCKED');
    const failed = modes.filter((mode) => !normalPhaseContract(runs.find((run) => run.phase === mode), reports[mode], mode));
    if (blocked.length) {
      item.result = 'BLOCKED';
      item.reason = blocked.map((mode) => `${mode}: ${reports[mode].blocked_reason}`).join(';').slice(0, 2000);
    } else if (failed.length) {
      item.result = 'FAIL'; item.reason = `Required stage invalid or missing: ${failed.join(',')}`;
    } else if (!item.result) {
      item.result = item.assertions.length > 0 && item.assertions.every((entry) => entry.result === 'PASS') ? 'PASS' : 'FAIL';
    }
  }
}

function normalPhaseContract(run, report, expectedMode) {
  return Boolean(run && run.code === 0 && run.timed_out !== true
    && report && report.mode === expectedMode && report.status === 'PASS'
    && Array.isArray(report.cases) && report.cases.length > 0
    && report.cases.every((item) => item && item.passed === true)
    && !report.error);
}

function validatePhaseReports(phases, w42Phases, reports, reportFilesExist) {
  const allPhases = phases.concat(w42Phases);
  return Object.entries(reportFilesExist).every(([mode, exists]) => exists
    && normalPhaseContract(allPhases.find((item) => item.phase === mode), reports[mode], mode));
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
    throw new Error(`A9_W42_SMOKE_RUNTIME_INVALID:${process.platform}:${process.versions.electron}:${process.versions.modules}`);
  }
  const candidateRoot = path.resolve(__dirname, '..');
  const productMain = path.join(candidateRoot, 'resources', 'app', 'product', 'main.js');
  const sqliteRoot = path.join(candidateRoot, 'resources', 'native', 'storage');
  const sourceDriver = path.join(__dirname, 'a9-win7-42-driver.cjs');
  const evidenceRoot = path.resolve(argument('evidence-root', path.join(candidateRoot, '..', 'a9-win7-42-evidence')));
  if (path.relative(candidateRoot, evidenceRoot) === '' || !path.relative(candidateRoot, evidenceRoot).startsWith('..')) {
    throw new Error('A9_W42_SMOKE_EVIDENCE_INSIDE_CANDIDATE');
  }
  // 派生差异 D-1：运行根与全部阶段目录名含中文与空格（W42-02 断言要求运行根、
  // 各工作区与数据根都含非 ASCII 字符与空格；W37 只有首个工作区满足）。
  const gitSelection = w42ResolveGitExecutable(argument('git-exe'));
  const runRoot = path.join(evidenceRoot, `自动 运行 w42-${Date.now()}`);
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
  // W42 新阶段目录（每阶段独立工作区与数据根，路径含中文与空格）。
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
  const reliabilityWorkspace = Object.fromEntries([
    ['w42_recovery_dir', ['恢复目录 recovery workspace', '恢复目录 recovery-data']],
    ['w42_verification', ['验证分类 verification workspace', '验证分类 verification-data']],
    ['w42_instructions_environment', ['指令环境 instructions workspace', '指令环境 instructions-data']],
    ['w42_context_budget', ['上下文预算 context workspace', '上下文预算 context-data']],
    ['w42_cold_history', ['冷历史 cold workspace', '冷历史 cold-data']],
    ['w42_cancel_output', ['取消输出 cancel workspace', '取消输出 cancel-data']],
    ['w42_audit', ['审计故障 audit workspace', '审计故障 audit-data']],
    ['w42_provider', ['响应完整 provider workspace', '响应完整 provider-data']],
  ].map(([key, [workspace, data]]) => [key, {
    workspace: path.join(runRoot, workspace), data: path.join(runRoot, data),
  }]));
  const w42Directories = [workspaceRoot, stopWorkspace, stopData, negativeWorkspace, negativeData, liveWorkspace, liveData, visualRoot,
    startupWorkspace, startupData, gitWorkspace, gitData, m1SmallWorkspace, m1SmallData,
    m1LargeWorkspace, m1LargeData, m1bWorkspace, m1bData, m2Workspace, m2Data, m3Workspace, m3Data, m4Workspace, m4Data,
    ...Object.values(reliabilityWorkspace).flatMap((item) => [item.workspace, item.data])];
  for (const directory of w42Directories) {
    fs.mkdirSync(directory, { recursive: true });
  }
  const { electronPath, driverPath, contractPath, contractSha256 } = prepareDriverRuntime(candidateRoot, runRoot, sourceDriver);
  fs.writeFileSync(path.join(workspaceRoot, 'calc.ts'), 'export function add(a, b) {\n  return a - b;\n}\n', 'utf8');
  fs.copyFileSync(path.join(__dirname, 'check.py'), path.join(workspaceRoot, 'check.py'));
  fs.writeFileSync(path.join(workspaceRoot, 'scratch.tmp'), 'must survive denied deletion\n', 'utf8');
  // W28-H02：批准路径的专用目标，与拒绝目标分开创建；批准后由产品真实执行删除，
  // 宿主在第一进程退出后逐项清点（拒绝目标零副作用、批准目标真实消失）。
  fs.writeFileSync(path.join(workspaceRoot, 'approve-target.tmp'), 'approved-delete-target\n', 'utf8');
  fs.writeFileSync(path.join(workspaceRoot, '短GBK.txt'), Buffer.from([0xd6, 0xd0]));
  fs.writeFileSync(path.join(stopWorkspace, 'calc.ts'), 'export const ready = true;\n', 'utf8');
  fs.writeFileSync(path.join(negativeWorkspace, 'calc.ts'), 'export const negativeProbe = true;\n', 'utf8');
  fs.writeFileSync(path.join(liveWorkspace, 'calc.ts'), 'export const liveProbe = true;\n', 'utf8');
  // W42：每个 w42_* 阶段工作区都含 calc.ts（workspace.select 公共前置等待该文件），
  // 以及各阶段专用夹具（路径含中文与空格）。
  for (const directory of [startupWorkspace, gitWorkspace, m1SmallWorkspace, m1LargeWorkspace, m1bWorkspace, m2Workspace, m3Workspace, m4Workspace]) {
    fs.writeFileSync(path.join(directory, 'calc.ts'), 'export const w42Probe = true;\n', 'utf8');
  }
  fs.writeFileSync(path.join(m1bWorkspace, 'small.txt'), 'alpha\n', 'utf8');
  // W42-11：1 MiB 单行十六进制文件（'0123456789abcdef' 重复 65536 次）。
  fs.writeFileSync(path.join(m1bWorkspace, 'hex-baseline.dat'), '0123456789abcdef'.repeat(65536), 'utf8');
  fs.writeFileSync(path.join(m2Workspace, 'm2-target.txt'), 'm2 target must not be modified\n', 'utf8');
  fs.writeFileSync(path.join(m3Workspace, 'counter.ts'), '// v0\nexport const version = 0;\n', 'utf8');
  for (const item of Object.values(reliabilityWorkspace)) {
    fs.writeFileSync(path.join(item.workspace, 'calc.ts'), 'export const reliabilityProbe = true;\n', 'utf8');
  }
  // A9-27 stages are appended to the inherited W39 directory and fixture setup.
  const a925StopWorkspace = path.join(runRoot, '审阅停止 stop workspace');
  const a925StopData = path.join(runRoot, '审阅停止 stop-data');
  const a925StopMarker = path.join(runRoot, 'w42-stop-child.pid');
  const a925ReviewWorkspace = path.join(runRoot, '改动审阅 review workspace');
  const a925ReviewData = path.join(runRoot, '改动审阅 review-data');
  const a925ModeWorkspace = path.join(runRoot, '审阅模式 mode workspace');
  const a925ModeData = path.join(runRoot, '审阅模式 mode-data');
  for (const directory of [a925StopWorkspace, a925StopData, a925ReviewWorkspace, a925ReviewData,
    a925ModeWorkspace, a925ModeData]) fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(a925StopWorkspace, 'calc.ts'), 'export const stopReady = true;\n', 'utf8');
  fs.writeFileSync(path.join(a925ReviewWorkspace, 'calc.ts'), 'export function add(a, b) {\n  return a - b;\n}\n', 'utf8');
  fs.writeFileSync(path.join(a925ReviewWorkspace, 'a.txt'), 'a-before\n', 'utf8');
  fs.writeFileSync(path.join(a925ReviewWorkspace, 'b.txt'), 'b-before\n', 'utf8');
  fs.writeFileSync(path.join(a925ReviewWorkspace, 'big.bin'), Buffer.alloc(3 * 1024 * 1024, 0x61));
  fs.writeFileSync(path.join(a925ModeWorkspace, 'calc.ts'), 'export const reviewModeReady = true;\n', 'utf8');
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
    // W42 / S-2：所有阶段（含反例）显式要求候选内产品入口；驱动缺该变量即以
    // A9_W42_DRIVER_PRODUCT_MAIN_REQUIRED 失败，不回落仓库布局。
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
  record('A9-W42-DRIVER-CONTRACT-CLOSURE',
    fs.existsSync(contractPath) && sha256File(contractPath) === contractSha256,
  `contract=${contractPath}; sha256=${contractSha256}`);

  // ADR-0136 的两个候选内真实 Electron 反例。反例本身必须非零退出并写出
  // 可解析 ERROR；同一父级正常阶段合同必须拒绝这些结果。每次反例后用 Win7 内置
  // WMI 直接扫描候选及本 run 路径，不允许 Electron/helper/Shell 子孙残留。
  const lateOut = path.join(runRoot, 'late-load-negative.json');
  const lateRun = await w42RunElectron(electronPath, driverPath, {
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
    'A9_W42_DRIVER_PRODUCT_ENTRY_LATE_LOAD')
    && lateReport.cases.some((item) => item?.id === 'A9_W42_DRIVER_PRODUCT_ENTRY_LATE_LOAD'
      && item.passed === false);
  const lateParentRejected = normalPhaseContract(lateRun, lateReport, 'late_load_negative') === false;
  const lateResidue = await waitForNoRelatedProcesses(candidateRoot, runRoot);
  record('A9-W42-LATE-LOAD-REJECTED', lateRejected,
    `exit=${lateRun.code}; timedOut=${lateRun.timed_out}; status=${lateReport.status}; error=${lateReport.error || ''}`);
  record('A9-W42-LATE-LOAD-PARENT-REJECTED', lateParentRejected,
    `normalPhaseAccepted=${!lateParentRejected}`);

  const controlledErrorOut = path.join(runRoot, 'controlled-error-negative.json');
  const controlledErrorRun = await w42RunElectron(electronPath, driverPath, {
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
  record('A9-W42-CONTROLLED-ERROR-NONZERO', controlledErrorRejected,
    `exit=${controlledErrorRun.code}; timedOut=${controlledErrorRun.timed_out}; status=${controlledErrorReport.status}; error=${controlledErrorReport.error || ''}`);
  record('A9-W42-CONTROLLED-ERROR-PARENT-REJECTED', controlledErrorParentRejected,
    `normalPhaseAccepted=${!controlledErrorParentRejected}`);
  const negativeProbesNoResidue = lateResidue.no_residue === true && controlledErrorResidue.no_residue === true;
  record('A9-W42-NEGATIVE-PROBES-NO-RESIDUE', negativeProbesNoResidue,
    JSON.stringify({ late_load: lateResidue, controlled_error: controlledErrorResidue }));
  const negativeProbesValid = lateRejected && lateParentRejected && controlledErrorRejected
    && controlledErrorParentRejected && negativeProbesNoResidue;

  const phases = [];
  const blockedReports = {};
  const firstOut = path.join(runRoot, 'first.json');
  phases.push({ phase: 'first', ...(await w42RunElectron(electronPath, driverPath, {
    ...baseEnv, A9_SMOKE_MODE: 'first', A9_SMOKE_FIXTURE_URL: journeyUrl, A9_SMOKE_OUT: firstOut,
  })) });
  const first = readJson(firstOut);
  // W28-H02：宿主进程在第一进程退出后直接核对目标文件事实——拒绝目标必须零副作用
  // （存在性/字节哈希/大小均不变），批准目标必须经真实批准删除后消失。
  const denyTargetAfter = targetInventory(denyTargetPath);
  const approveTargetAfter = targetInventory(approveTargetPath);
  record('A9-W42-DENY-TARGET-SURVIVES-DENIAL',
    denyTargetBefore.exists === true && denyTargetAfter.exists === true
      && denyTargetAfter.sha256 === denyTargetBefore.sha256 && denyTargetAfter.size === denyTargetBefore.size,
    JSON.stringify({ before: denyTargetBefore, after: denyTargetAfter }));
  record('A9-W42-APPROVE-TARGET-EXECUTED-AFTER-APPROVAL',
    approveTargetBefore.exists === true && approveTargetAfter.exists === false,
    JSON.stringify({ before: approveTargetBefore, after: approveTargetAfter }));
  const approval = first.oldApproval || {};
  const secondOut = path.join(runRoot, 'second.json');
  const secondPrerequisite = ['approvalId', 'bindingDigest', 'conversationId', 'taskId', 'turnId']
    .every((key) => typeof approval[key] === 'string' && approval[key].length > 0)
    && ['conversationId', 'oldFailureTurnId', 'latestSuccessTurnId', 'displayed']
      .every((key) => typeof first.projectionSeed?.[key] === 'string' && first.projectionSeed[key].length > 0)
    && ['oldFailureEventId', 'latestSuccessEventId']
      .every((key) => Number.isSafeInteger(first.projectionSeed?.[key]) && first.projectionSeed[key] > 0);
  if (!secondPrerequisite) w42BlockPhase(phases, blockedReports, 'second', 'first approval binding or projection seed missing');
  else phases.push({ phase: 'second', ...(await w42RunElectron(electronPath, driverPath, {
    ...baseEnv, A9_SMOKE_MODE: 'second', A9_SMOKE_OUT: secondOut,
    A9_SMOKE_OLD_APPROVAL_ID: approval.approvalId || '',
    A9_SMOKE_OLD_APPROVAL_DIGEST: approval.bindingDigest || '',
    A9_SMOKE_OLD_APPROVAL_CONVERSATION: approval.conversationId || '',
    A9_SMOKE_OLD_APPROVAL_TASK: approval.taskId || '',
    A9_SMOKE_OLD_APPROVAL_TURN: approval.turnId || '',
    A9_SMOKE_PROJECTION_SEED: JSON.stringify(first.projectionSeed || {}),
  })) });
  const second = blockedReports.second || readJson(secondOut);
  const retryTargetConversation = second.retryTarget && second.retryTarget.conversationId
    ? second.retryTarget.conversationId : '';
  const retryOut = path.join(runRoot, 'retry.json');
  if (!retryTargetConversation) w42BlockPhase(phases, blockedReports, 'retry', 'second retry target conversation missing');
  else phases.push({ phase: 'retry', ...(await w42RunElectron(electronPath, driverPath, {
    ...baseEnv,
    A9_SMOKE_MODE: 'retry',
    A9_SMOKE_FIXTURE_URL: journeyUrl,
    A9_SMOKE_RETRY_CONVERSATION: retryTargetConversation,
    A9_SMOKE_OUT: retryOut,
  })) });
  const stopOut = path.join(runRoot, 'stop.json');
  phases.push({ phase: 'stop', ...(await w42RunElectron(electronPath, driverPath, {
    ...baseEnv,
    A9_SMOKE_WORKSPACE: stopWorkspace, A9_SMOKE_DATAROOT: stopData,
    WIN7AGENT_A9_DATAROOT: stopData, A9_SMOKE_MODE: 'stop', A9_SMOKE_FIXTURE_URL: stopUrl,
    A9_SMOKE_STOP_PID_MARKER: stopMarker, A9_SMOKE_OUT: stopOut,
  })) });
  const journeyCloseError = await w42CloseFixture(journey);
  record('W42-FIXTURE-CLOSE-JOURNEY', journeyCloseError === null, journeyCloseError || 'CLOSED');
  const stopCloseError = await w42CloseFixture(stop);
  record('W42-FIXTURE-CLOSE-STOP', stopCloseError === null, stopCloseError || 'CLOSED');
  // ADR-0136：第五阶段——A9-19 / WIN7-37 编号 16/17 的延迟流式运行过程实时可见，并核对编号 20/21 的头部文案与左栏保持。
  const liveTestKey = `A9W42-LIVE-${crypto.randomBytes(8).toString('hex')}`;
  const live = createLiveFixture(liveTestKey);
  const liveError = await w42ListenFixture(live);
  const liveOut = path.join(runRoot, 'live.json');
  if (liveError) w42BlockPhase(phases, blockedReports, 'live', liveError);
  else phases.push({ phase: 'live', ...(await w42RunElectron(electronPath, driverPath, {
    ...baseEnv,
    A9_SMOKE_WORKSPACE: liveWorkspace, A9_SMOKE_DATAROOT: liveData, WIN7AGENT_A9_DATAROOT: liveData,
    A9_SMOKE_MODE: 'w42_stop', A9_W42_MODE: 'w42_live', A9_SMOKE_FIXTURE_URL: w42FixtureUrl(live),
    A9_SMOKE_LIVE_TEST_KEY: liveTestKey, A9_SMOKE_OUT: liveOut,
  })) });
  const liveCloseError = await w42CloseFixture(live);
  record('W42-FIXTURE-CLOSE-LIVE', liveCloseError === null, liveCloseError || 'CLOSED');
  const liveRawText = fs.existsSync(liveOut) ? fs.readFileSync(liveOut, 'utf8') : '';
  record('A9-W42-LIVE-REPORT-HAS-NO-TEST-KEY', liveRawText.length > 0 && !liveRawText.includes(liveTestKey)
    && !liveRawText.includes(liveTestKey.slice(0, 10)), `bytes=${liveRawText.length}`);

  // =====================================================================
  // W42 追加阶段（A9-27）。与 W37 的全部非身份差异见 A9_27_WIN7_42_VALIDATION.md
  // §派生差异。判定只读产品运行后的产物；每阶段结束后与 smoke 结束前各做一次残留检查。
  // =====================================================================
  const w42Phases = [];
  const w42PhaseReports = [];
  const runW42Phase = async (name, workspace, dataRoot, extraEnv, fixtureUrl, timeoutMs, blockedReason) => {
    const outPath = path.join(runRoot, `${name}.json`);
    if (blockedReason) {
      const phaseReport = w42BlockPhase(w42Phases, blockedReports, name, blockedReason);
      w42PhaseReports.push({ phase: name, path: outPath, report: phaseReport });
      return phaseReport;
    }
    w42Phases.push({ phase: name, ...(await w42RunElectron(electronPath, driverPath, {
      ...baseEnv,
      A9_SMOKE_WORKSPACE: workspace, A9_SMOKE_DATAROOT: dataRoot, WIN7AGENT_A9_DATAROOT: dataRoot,
      A9_SMOKE_MODE: Object.hasOwn(reliabilityWorkspace, name) ? 'w42_stop' : name,
      ...(Object.hasOwn(reliabilityWorkspace, name) ? { A9_W42_MODE: name } : {}), A9_SMOKE_OUT: outPath,
      ...(fixtureUrl ? { A9_SMOKE_FIXTURE_URL: fixtureUrl } : {}),
      ...(extraEnv || {}),
    }, timeoutMs || 600000)) });
    // S-3：每阶段结束后的残留检查（内部断言，非必需断言清单成员）。
    const residue = await waitForNoRelatedProcesses(candidateRoot, runRoot);
    record(`W42-PHASE-RESIDUE-${name.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`, residue.no_residue === true, JSON.stringify(residue));
    const phaseReport = readJson(outPath);
    w42PhaseReports.push({ phase: name, path: outPath, report: phaseReport });
    return phaseReport;
  };
  const w42CasePassed = (phaseReport, caseId) => Boolean(phaseReport && Array.isArray(phaseReport.cases)
    && phaseReport.cases.some((item) => item && item.id === caseId && item.passed === true));
  const hasNonAsciiAndSpace = (value) => /[^\x00-\x7F]/.test(String(value)) && String(value).includes(' ');

  // —— W42-07～09：A9-20 形态清单（A9-20 §2 全部 12 类的具体写法）。 ——
  const encodedGitPush = Buffer.from('git push origin main', 'utf16le').toString('base64');
  const bulkPadding = 'p'.repeat(270000);
  const W42_GIT_FORMS = [
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
  const gitFormsFile = path.join(runRoot, 'w42-git-forms.json');
  fs.writeFileSync(gitFormsFile, `${JSON.stringify(W42_GIT_FORMS, null, 2)}\n`, 'utf8');
  // 远端：本地裸仓库 + 带 origin 的工作区仓库；Win7 无 git 时远端判定记 NOT_PERFORMED。
  const gitAvailable = Boolean(gitSelection.executable);
  const bareRoot = path.join(runRoot, 'git 裸仓库 origin');
  const gitWorkRepo = path.join(runRoot, 'git 工作区 仓库');
  const gitMainRefFile = path.join(bareRoot, 'refs', 'heads', 'main');
  let gitMainRefBefore = null;
  let gitSetupError = '';
  if (gitAvailable) {
    try {
      // A9_W42_GIT_SETUP_BEGIN
      const gitRun = (args, cwd) => {
        const result = childProcess.spawnSync(gitSelection.executable, args, { cwd, windowsHide: true, timeout: 30000 });
        if (result.error || result.status !== 0) {
          gitSetupError = `git ${args.join(' ')} -> exit ${result.status}: ${String(result.error?.message || result.stderr || '').slice(0, 200)}`;
          return false;
        }
        return true;
      };
      if (gitRun(['init', '--bare', bareRoot])) {
        fs.mkdirSync(gitWorkRepo, { recursive: true });
        fs.writeFileSync(path.join(gitWorkRepo, 'README.md'), 'w42 git forms workspace\n', 'utf8');
        const commands = [['init'], ['config', 'user.email', 'w42-smoke@example.invalid'],
          ['config', 'user.name', 'w42-smoke'], ['add', 'README.md'], ['commit', '-m', 'w42 seed'],
          ['remote', 'add', 'origin', bareRoot], ['push', 'origin', 'HEAD:refs/heads/main']];
        commands.every((args) => gitRun(args, gitWorkRepo));
      }
      // A9_W42_GIT_SETUP_END
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
    const form = W42_GIT_FORMS.find((item) => prompt === `run git form ${item.id}`);
    if (form && tools.length === 0) {
      return { id: `w42-git-${form.index}`, note: `执行第 ${form.index} 个 git 外部写形态。`, tool: { name: 'shell', args: { command: form.command } } };
    }
    return { content: 'git form denied; nothing executed.' };
  });
  const gitFixtureError = await w42ListenFixture(gitFixture);
  const gitReport = await runW42Phase('w42_git', gitWorkspace, gitData, {
    A9_SMOKE_W42_GIT_FORMS_FILE: gitFormsFile,
  }, w42FixtureUrl(gitFixture), 900000, gitFixtureError);
  const gitFixtureCloseError = await w42CloseFixture(gitFixture);
  record('W42-FIXTURE-CLOSE-GITFIXTURE', gitFixtureCloseError === null, gitFixtureCloseError || 'CLOSED');
  const gitMainRefAfter = fs.existsSync(gitMainRefFile) ? fs.readFileSync(gitMainRefFile, 'utf8') : null;
  const gitRemoteUnchanged = !gitAvailable || (gitSetupError === '' && gitMainRefBefore !== null
    && gitMainRefAfter === gitMainRefBefore);
  record('W42-GIT-REMOTE-UNCHANGED', gitRemoteUnchanged, JSON.stringify({
    git_available: gitAvailable, git_executable: gitSelection.executable, git_source: gitSelection.source,
    git_version: gitSelection.version, setup_error: gitSetupError,
    remote_check: gitAvailable ? 'refs/heads/main compared before and after the phase' : 'NOT_PERFORMED_NO_GIT',
    ref_unchanged: gitAvailable ? gitMainRefAfter === gitMainRefBefore : null,
  }));

  // —— W42-03：启动耗时（无 fixture）。 ——
  const startupReport = await runW42Phase('w42_startup', startupWorkspace, startupData, {});

  // —— W42-10：M1 种子（候选内 A9PersistenceManager 公开方法；不得手写建表或插入 SQL）。 ——
  const w42SeedM1History = (dataRoot, workspaceRoot, options) => {
    const stateModule = path.join(candidateRoot, 'resources', 'app', 'state', 'dist', 'a9-persistence.js');
    const coreModule = path.join(candidateRoot, 'resources', 'app', 'core', 'dist', 'index.js');
    if (!fs.existsSync(stateModule)) return { error: `A9_W42_STATE_MODULE_MISSING:${stateModule}` };
    if (!fs.existsSync(coreModule)) return { error: `A9_W42_CORE_MODULE_MISSING:${coreModule}` };
    const { A9PersistenceManager } = require(stateModule);
    const { canonicalizeWorkspacePath } = require(coreModule);
    const Database = require(path.join(candidateRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3'));
    const outcome = A9PersistenceManager.open({
      databasePath: path.join(dataRoot, 'a9-state.db'), dataRoot,
      openDatabase: (databasePath, openOptions) => new Database(databasePath, openOptions && openOptions.readonly ? { readonly: true } : {}),
    });
    if (!outcome || outcome.status !== 'ready' || !outcome.manager) {
      return { error: `A9_W42_M1_SEED_OPEN_FAILED:${JSON.stringify(outcome || {}).slice(0, 300)}` };
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
  const m1SmallSeed = w42PrepareSeed(() => w42SeedM1History(m1SmallData, m1SmallWorkspace, {
    sessionId: 'w42-m1-small-session', taskId: 'w42-m1-small-task', prefix: 'w42-m1-small',
    completedTurns: 5, title: 'w42 m1 小历史',
  }));
  const m1SmallReport = await runW42Phase('w42_m1_small', m1SmallWorkspace, m1SmallData, {
    A9_SMOKE_W42_M1_EXPECTED_TURN_ID: m1SmallSeed.interruptedTurnId,
    A9_SMOKE_W42_M1_EXPECTED_FACT_TURNS: '5',
  }, undefined, undefined, m1SmallSeed.error);
  const m1LargeSeed = w42PrepareSeed(() => w42SeedM1History(m1LargeData, m1LargeWorkspace, {
    sessionId: 'w42-m1-large-session', taskId: 'w42-m1-large-task', prefix: 'w42-m1-large',
    completedTurns: 100, title: 'w42 m1 大历史',
  }));
  const m1LargeReport = await runW42Phase('w42_m1_large', m1LargeWorkspace, m1LargeData, {
    A9_SMOKE_W42_M1_EXPECTED_TURN_ID: m1LargeSeed.interruptedTurnId,
    A9_SMOKE_W42_M1_EXPECTED_FACT_TURNS: '100',
  }, undefined, undefined, m1LargeSeed.error);
  const m1SmallCase = (m1SmallReport.cases || []).find((item) => item && item.id === 'W42-M1-RECOVERY-SMALL') || {};
  const m1LargeCase = (m1LargeReport.cases || []).find((item) => item && item.id === 'W42-M1-RECOVERY-LARGE') || {};
  const m1SmallTiming = (m1SmallReport.cases || []).find((item) => item && item.id === 'W42-M1-TIMING-SMALL') || {};
  const m1LargeTiming = (m1LargeReport.cases || []).find((item) => item && item.id === 'W42-M1-TIMING-LARGE') || {};
  record('A9-W42-M1-TARGETED-RECOVERY',
    w42CasePassed(m1SmallReport, 'W42-M1-RECOVERY-SMALL') && w42CasePassed(m1LargeReport, 'W42-M1-RECOVERY-LARGE'),
    JSON.stringify({ small: m1SmallCase.detail || '', large: m1LargeCase.detail || '' }));
  record('A9-W42-M1-STARTUP-TIMING-RECORDED',
    w42CasePassed(m1SmallReport, 'W42-M1-TIMING-SMALL') && w42CasePassed(m1LargeReport, 'W42-M1-TIMING-LARGE'),
    JSON.stringify({ small: m1SmallTiming.detail || '', large: m1LargeTiming.detail || '' }));

  // —— W42-11：M1b 冻结 + URL 脱敏。口令随机生成，不写入任何证据文件。 ——
  const m1bPassword = crypto.randomBytes(12).toString('hex');
  const m1bRedactionMarker = '***redacted***@example.invalid/x';
  const m1bUrl = `https://w42user:${m1bPassword}@example.invalid/x`;
  const m1bFixture = createFixture((parsed) => {
    const messages = parsed.messages || [];
    const lastUserIndex = messages.map((item) => item.role).lastIndexOf('user');
    const prompt = String((messages[lastUserIndex] || {}).content || '');
    const tools = messages.slice(lastUserIndex + 1).filter((item) => item.role === 'tool').map((item) => item.name);
    if (prompt === 'edit the small file' && !tools.includes('read')) {
      return { id: 'w42-m1b-read', note: '先读取小文件。', tool: { name: 'read', args: { path: 'small.txt' } } };
    }
    if (prompt === 'edit the small file' && !tools.includes('edit')) {
      return { id: 'w42-m1b-edit', note: '修改小文件并冻结基线。', tool: { name: 'edit', args: { path: 'small.txt', oldText: 'alpha', newText: 'beta' } } };
    }
    if (prompt === 'echo the service url' && !tools.includes('shell')) {
      return { id: 'w42-m1b-echo', note: `检查服务 ${m1bUrl} 的可达性。`, tool: { name: 'shell', args: { command: `Write-Output 'service ${m1bUrl} checked'` } } };
    }
    return { content: 'm1b turn done.' };
  });
  const m1bFixtureError = await w42ListenFixture(m1bFixture);
  const m1bReport = await runW42Phase('w42_m1b', m1bWorkspace, m1bData, {
    A9_SMOKE_W42_M1B_URL_PASSWORD: m1bPassword,
  }, w42FixtureUrl(m1bFixture), 600000, m1bFixtureError);
  const m1bFixtureCloseError = await w42CloseFixture(m1bFixture);
  record('W42-FIXTURE-CLOSE-M1BFIXTURE', m1bFixtureCloseError === null, m1bFixtureCloseError || 'CLOSED');
  const w42ScanDatabaseForSecret = (dataRoot, secret, marker) => {
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
  const w42ScanFilesForSecret = (rootDirectory, secret, marker) => {
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
  const m1bDbScan = w42ScanDatabaseForSecret(m1bData, m1bPassword, m1bRedactionMarker);
  const m1bFileScan = w42ScanFilesForSecret(m1bData, m1bPassword, m1bRedactionMarker);
  const m1bReportPath = path.join(runRoot, 'w42_m1b.json');
  const m1bReportRaw = fs.existsSync(m1bReportPath) ? fs.readFileSync(m1bReportPath, 'utf8') : '';
  const m1bReportScan = {
    files_scanned: m1bReportRaw ? 1 : 0,
    secret_hits: m1bReportRaw.split(m1bPassword).length - 1,
    marker_hits: m1bReportRaw.split(m1bRedactionMarker).length - 1,
  };
  record('A9-W42-M1B-URL-REDACTED',
    m1bDbScan.secret_hits === 0 && m1bFileScan.secret_hits === 0 && m1bReportScan.secret_hits === 0
    && (m1bDbScan.marker_hits + m1bFileScan.marker_hits + m1bReportScan.marker_hits) >= 1,
    JSON.stringify({
      db: m1bDbScan, files: m1bFileScan, driver_report: m1bReportScan,
      marker: '***redacted***@example.invalid/x (product redactSecrets/redactUrlUserinfo output form)',
      password_recorded_in_evidence: false,
    }));

  // —— W42-12：M2 输出上限。 ——
  const m2Fixture = createFixture((parsed) => {
    const messages = parsed.messages || [];
    const lastUserIndex = messages.map((item) => item.role).lastIndexOf('user');
    const prompt = String((messages[lastUserIndex] || {}).content || '');
    if (prompt === 'trigger oversized model response') {
      return { note: 'A'.repeat(1100 * 1024), tool: { name: 'edit', args: { path: 'm2-target.txt', oldText: 'must', newText: 'CHANGED-BY-TRUNCATED-TOOL-CALL' } } };
    }
    return { content: 'second turn completed.' };
  });
  const m2FixtureError = await w42ListenFixture(m2Fixture);
  const m2Report = await runW42Phase('w42_m2', m2Workspace, m2Data, {}, w42FixtureUrl(m2Fixture), 600000, m2FixtureError);
  const m2FixtureCloseError = await w42CloseFixture(m2Fixture);
  record('W42-FIXTURE-CLOSE-M2FIXTURE', m2FixtureCloseError === null, m2FixtureCloseError || 'CLOSED');

  // —— W42-13：M3 checkpoint 分页（≥60 真实 Turn，逐轮小修改）。 ——
  const m3Fixture = createFixture((parsed) => {
    const messages = parsed.messages || [];
    const lastUserIndex = messages.map((item) => item.role).lastIndexOf('user');
    const prompt = String((messages[lastUserIndex] || {}).content || '');
    const match = /^m3 turn (\d+)$/.exec(prompt);
    const tools = messages.slice(lastUserIndex + 1).filter((item) => item.role === 'tool').map((item) => item.name);
    if (match && !tools.includes('read')) {
      return { id: `w42-m3-read-${match[1]}`, note: `m3 第 ${match[1]} 轮先读取目标。`,
        tool: { name: 'read', args: { path: 'counter.ts' } } };
    }
    if (match && !tools.includes('edit')) {
      const index = Number(match[1]);
      return { id: `w42-m3-${index}`, note: `m3 第 ${index} 轮小修改。`, tool: { name: 'edit', args: { path: 'counter.ts', oldText: `// v${index - 1}`, newText: `// v${index}` } } };
    }
    return { content: `m3 turn ${match ? match[1] : '?'} done.` };
  });
  const m3FixtureError = await w42ListenFixture(m3Fixture);
  const m3Report = await runW42Phase('w42_m3', m3Workspace, m3Data, {
    A9_SMOKE_W42_M3_TURNS: '60',
  }, w42FixtureUrl(m3Fixture), 900000, m3FixtureError);
  const m3FixtureCloseError = await w42CloseFixture(m3Fixture);
  record('W42-FIXTURE-CLOSE-M3FIXTURE', m3FixtureCloseError === null, m3FixtureCloseError || 'CLOSED');

  // —— W42-14：M4 集合上限（种子 ≥2500 条经公开事件写入方法）。 ——
  const w42SeedM4Events = (dataRoot, workspaceRoot) => {
    const stateModule = path.join(candidateRoot, 'resources', 'app', 'state', 'dist', 'a9-persistence.js');
    const coreModule = path.join(candidateRoot, 'resources', 'app', 'core', 'dist', 'index.js');
    if (!fs.existsSync(stateModule)) return { error: `A9_W42_STATE_MODULE_MISSING:${stateModule}` };
    if (!fs.existsSync(coreModule)) return { error: `A9_W42_CORE_MODULE_MISSING:${coreModule}` };
    const { A9PersistenceManager } = require(stateModule);
    const { canonicalizeWorkspacePath } = require(coreModule);
    const Database = require(path.join(candidateRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3'));
    const outcome = A9PersistenceManager.open({
      databasePath: path.join(dataRoot, 'a9-state.db'), dataRoot,
      openDatabase: (databasePath, openOptions) => new Database(databasePath, openOptions && openOptions.readonly ? { readonly: true } : {}),
    });
    if (!outcome || outcome.status !== 'ready' || !outcome.manager) {
      return { error: `A9_W42_M4_SEED_OPEN_FAILED:${JSON.stringify(outcome || {}).slice(0, 300)}` };
    }
    const manager = outcome.manager;
    const canonical = canonicalizeWorkspacePath(workspaceRoot);
    manager.saveSession('w42-m4-seed-session', canonical, { title: 'w42 m4 集合上限' });
    manager.activateConversation(canonical, 'w42-m4-seed-session');
    let written = 0;
    for (let index = 1; index <= 2500; index += 1) {
      const turnNumber = Math.floor((index - 1) / 250) + 1;
      const taskId = `w42-m4-seed-task-${String(turnNumber).padStart(3, '0')}`;
      const turnId = `w42-m4-seed-turn-${String(turnNumber).padStart(3, '0')}`;
      if ((index - 1) % 250 === 0) {
        manager.upsertTask(taskId, 'w42-m4-seed-session', 'completed');
        manager.recordModelEvent('w42-m4-seed-session', null, 'conversation.request', {
          schemaVersion: 1, taskId, requestPrompt: `w42 m4 seed turn ${turnNumber}`,
        });
        manager.upsertTurn(turnId, taskId, 'w42-m4-seed-session', 'completed',
          { outcome: 'completed', verification: 'not_applicable' });
      }
      if (index % 2 === 1) {
        manager.recordModelEvent('w42-m4-seed-session', turnId, 'model_note',
          { content: `m4 seed note ${index}`, step: index });
      } else {
        manager.recordToolEvent('w42-m4-seed-session', turnId, 'tool_end',
          { toolName: 'search', callId: `w42-m4-${index}`, step: index, result: `m4 seed result ${index}` });
      }
      written += 1;
    }
    return { written };
  };
  const m4Seed = w42PrepareSeed(() => w42SeedM4Events(m4Data, m4Workspace));
  const M4_BULK_STEPS = 20;
  const m4Fixture = createFixture((parsed) => {
    const messages = parsed.messages || [];
    const lastUserIndex = messages.map((item) => item.role).lastIndexOf('user');
    const prompt = String((messages[lastUserIndex] || {}).content || '');
    const tools = messages.slice(lastUserIndex + 1).filter((item) => item.role === 'tool').map((item) => item.name);
    if (prompt === 'load m4 history') {
      if (tools.length === 0) {
        return { id: 'w42-m4-warmup', note: '只读热身以触发历史过程加载。',
          tool: { name: 'search', args: { pattern: 'w42-m4-warmup' } } };
      }
      return { content: 'm4 history warmup done.' };
    }
    if (prompt === 'generate many events' && tools.length < M4_BULK_STEPS) {
      return { id: `w42-m4-${tools.length}`, note: '批量只读探查产生事件。', tool: { name: 'search', args: { pattern: `w42-m4-${tools.length}-${Date.now() % 100000}` } } };
    }
    return { content: 'bulk events generated.' };
  });
  const m4FixtureError = await w42ListenFixture(m4Fixture);
  const m4Report = await runW42Phase('w42_m4', m4Workspace, m4Data, {}, w42FixtureUrl(m4Fixture), 900000, m4Seed.error || m4FixtureError);
  const m4FixtureCloseError = await w42CloseFixture(m4Fixture);
  record('W42-FIXTURE-CLOSE-M4FIXTURE', m4FixtureCloseError === null, m4FixtureCloseError || 'CLOSED');

  const reliabilityReports = {};

  // A9-27 stages use independent data roots except review/restart, which deliberately share one.
  const a925Phases = [];
  const a925PhaseReports = [];
  const runA925Phase = async (mode, workspace, data, fixture, extraEnv = {}, timeoutMs = 600000, blockedReason) => {
    const output = path.join(runRoot, `${mode}.json`);
    if (blockedReason) {
      const phaseReport = w42BlockPhase(a925Phases, blockedReports, mode, blockedReason);
      a925PhaseReports.push({ phase: mode, path: output, report: phaseReport });
      return phaseReport;
    }
    a925Phases.push({ phase: mode, ...(await w42RunElectron(electronPath, driverPath, {
      ...baseEnv, A9_SMOKE_MODE: mode, A9_SMOKE_WORKSPACE: workspace,
      A9_SMOKE_DATAROOT: data, WIN7AGENT_A9_DATAROOT: data,
      A9_SMOKE_OUT: output,
      ...(fixture ? { A9_SMOKE_FIXTURE_URL: w42FixtureUrl(fixture) } : {}),
      ...extraEnv,
    }, timeoutMs)) });
    const residue = await waitForNoRelatedProcesses(candidateRoot, runRoot);
    record(`W42-PHASE-RESIDUE-${mode.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`,
      residue.no_residue === true, JSON.stringify(residue));
    const phaseReport = readJson(output);
    a925PhaseReports.push({ phase: mode, path: output, report: phaseReport });
    return phaseReport;
  };

  const a925StopFixture = createW42StopFixture(a925StopMarker);
  const a925StopFixtureError = await w42ListenFixture(a925StopFixture);
  const a925StopReport = await runA925Phase('w42_stop', a925StopWorkspace, a925StopData,
    a925StopFixture, { A9_SMOKE_STOP_PID_MARKER: a925StopMarker,
      A9_SMOKE_W42_STOP_EVIDENCE: path.join(evidenceRoot, 'w42-06-stop-exit.json') }, 600000, a925StopFixtureError);
  const a925StopFixtureCloseError = await w42CloseFixture(a925StopFixture);
  record('W42-FIXTURE-CLOSE-A925STOPFIXTURE', a925StopFixtureCloseError === null, a925StopFixtureCloseError || 'CLOSED');

  const a925ReviewFixture = createW42ReviewFixture();
  const a925ReviewFixtureError = await w42ListenFixture(a925ReviewFixture);
  const a925BeforeA = sha256File(path.join(a925ReviewWorkspace, 'a.txt'));
  const a925ReviewReport = await runA925Phase('w42_review', a925ReviewWorkspace, a925ReviewData,
    a925ReviewFixture, { A9_SMOKE_W42_A_BASELINE_SHA256: a925BeforeA }, 900000, a925ReviewFixtureError);
  const a925ReviewFixtureCloseError = await w42CloseFixture(a925ReviewFixture);
  record('W42-FIXTURE-CLOSE-A925REVIEWFIXTURE', a925ReviewFixtureCloseError === null, a925ReviewFixtureCloseError || 'CLOSED');
  const a925FirstTurnId = a925ReviewReport.w42TurnIds && a925ReviewReport.w42TurnIds.first;
  const a925RestartBlocked = a925ReviewReport.status !== 'PASS' ? 'w42_review did not complete successfully'
    : !a925FirstTurnId ? 'w42_review first turnId missing' : null;
  const a925RestartReport = await runA925Phase('w42_review_restart', a925ReviewWorkspace, a925ReviewData,
    null, { A9_SMOKE_W42_FIRST_TURN: a925FirstTurnId }, 600000, a925RestartBlocked);

  // Seed the hidden staging-style Review value through the public persistence API before product startup.
  const a925ModeSeed = w42PrepareSeed(() => {
  const { A9PersistenceManager: A925Persistence } = require(path.join(candidateRoot,
    'resources', 'app', 'state', 'dist', 'a9-persistence.js'));
  const { canonicalizeWorkspacePath: a925Canonicalize } = require(path.join(candidateRoot,
    'resources', 'app', 'core', 'dist', 'index.js'));
  const A925Database = require(path.join(sqliteRoot, 'node_modules', 'better-sqlite3'));
  const a925Open = A925Persistence.open({
    databasePath: path.join(a925ModeData, 'a9-state.db'), dataRoot: a925ModeData,
    openDatabase: (databasePath, options) => new A925Database(databasePath, options?.readonly ? { readonly: true } : {}),
  });
  if (!a925Open || a925Open.status !== 'ready' || !a925Open.manager) {
    return { error: `A9_W42_REVIEW_MODE_SEED_FAILED:${JSON.stringify(a925Open).slice(0, 300)}` };
  }
  a925Open.manager.setWorkspaceMode(a925Canonicalize(a925ModeWorkspace), 'review');
  a925Open.manager.db.close();
    return { ready: true };
  });
  const a925ModeToolResults = path.join(evidenceRoot, 'w42-21-tool-results.json');
  const a925ModeFixture = createW42ReviewModeFixture(a925ModeToolResults);
  const a925ModeFixtureError = await w42ListenFixture(a925ModeFixture);
  const a925ModeReport = await runA925Phase('w42_review_mode', a925ModeWorkspace, a925ModeData, a925ModeFixture,
    { A9_SMOKE_W42_MODE_TOOL_RESULTS: a925ModeToolResults }, 600000, a925ModeSeed.error || a925ModeFixtureError);
  const a925ModeFixtureCloseError = await w42CloseFixture(a925ModeFixture);
  record('W42-FIXTURE-CLOSE-A925MODEFIXTURE', a925ModeFixtureCloseError === null, a925ModeFixtureCloseError || 'CLOSED');

  // W42-23..30: actual packaged Runtime/Core/Gateway probes, followed by real Electron selection/history checks.
  // The proof is hashed outside the candidate; no fixture can assert its own product result.
  const productProbes = require('./w42-product-probes.cjs');
  const kinds = { w42_recovery_dir: 'recovery', w42_verification: 'verification',
    w42_instructions_environment: 'instructions', w42_context_budget: 'context',
    w42_audit: 'audit', w42_provider: 'provider' };
  reliabilityWorkspace.w42_cancel_output = { workspace: a925StopWorkspace, data: a925StopData };
  for (const [mode, roots] of Object.entries(reliabilityWorkspace)) {
    let proof = null;
    let blocked = null;
    try {
      if (mode === 'w42_cold_history') {
        const seeded = w42PrepareSeed(() => w42SeedM4Events(roots.data, roots.workspace));
        if (seeded.error || seeded.written !== 2500) throw new Error(seeded.error || 'W42_COLD_SEED_COUNT');
        const { A9PersistenceManager } = require(path.join(candidateRoot, 'resources/app/state/dist/a9-persistence.js'));
        const Database = require(path.join(sqliteRoot, 'node_modules/better-sqlite3'));
        const opened = A9PersistenceManager.open({ databasePath: path.join(roots.data, 'a9-state.db'), dataRoot: roots.data,
          openDatabase: (file, options) => new Database(file, options?.readonly ? { readonly: true } : {}) });
        if (!opened.manager || opened.status !== 'ready') throw new Error('W42_COLD_SEED_LINK_OPEN_FAILED');
        try { w42LinkColdSeedTurns(opened.manager); } finally { opened.manager.db.close(); }
      } else if (mode === 'w42_cancel_output') {
        const Database = require(path.join(sqliteRoot, 'node_modules/better-sqlite3'));
        const db = new Database(path.join(a925StopData, 'a9-state.db'), { readonly: true });
        let cancelEvents;
        try { cancelEvents = db.prepare("SELECT event_type,payload_json FROM a9_events WHERE event_type='turn_completed'").all()
          .map(row => ({ type: row.event_type, data: JSON.parse(row.payload_json).data })); }
        finally { db.close(); }
        const observation = { cancelEvents, oversizedText: a925ReviewReport.w42Command?.unrecoverableText || '',
          inheritedStopPassed: a925StopReport.status === 'PASS', inheritedReviewPassed: a925ReviewReport.status === 'PASS' };
        proof = { kind: 'cancel', observation, passed: productProbes.matches('cancel', observation),
          host: { platform: process.platform, release: require('os').release(), arch: process.arch } };
      } else {
        if (mode === 'w42_recovery_dir' && !gitSelection.executable) throw new Error('W42_GIT_NOT_AVAILABLE');
        proof = await productProbes.run(kinds[mode], { candidateRoot, workspace: roots.workspace, data: roots.data,
          python: 'C:\\acceptance\\python38_mvp\\python.exe', git: gitSelection.executable });
      }
      if (proof && !proof.passed) throw new Error(`W42_PRODUCT_PROBE_FAILED:${proof.kind}`);
    } catch (error) { blocked = String(error.message || error).slice(0, 500); }
    const proofPath = path.join(runRoot, `${mode}-product-proof.json`);
    if (proof) fs.writeFileSync(proofPath, `${JSON.stringify(proof, null, 2)}\n`, 'utf8');
    const extraEnv = proof ? { A9_SMOKE_W42_PROOF: proofPath, A9_SMOKE_W42_PROOF_SHA256: sha256File(proofPath) } : {};
    reliabilityReports[mode] = await runW42Phase(mode, roots.workspace, roots.data, extraEnv, null, 600000, blocked);
  }

  // —— W42-02：中文空格路径 + 各阶段 productMainLoaded 有效。 ——
  const w42PathEntries = {
    run_root: runRoot,
    workspaces: {
      first: workspaceRoot, stop: stopWorkspace, negative: negativeWorkspace, live: liveWorkspace,
      w42_startup: startupWorkspace, w42_git: gitWorkspace, w42_m1_small: m1SmallWorkspace,
      w42_m1_large: m1LargeWorkspace, w42_m1b: m1bWorkspace, w42_m2: m2Workspace,
      w42_m3: m3Workspace, w42_m4: m4Workspace,
    },
    data_roots: {
      first: dataRoot, stop: stopData, negative: negativeData, live: liveData,
      w42_startup: startupData, w42_git: gitData, w42_m1_small: m1SmallData,
      w42_m1_large: m1LargeData, w42_m1b: m1bData, w42_m2: m2Data,
      w42_m3: m3Data, w42_m4: m4Data,
    },
  };
  Object.assign(w42PathEntries.workspaces, {
    w42_stop: a925StopWorkspace, w42_review: a925ReviewWorkspace,
    w42_review_restart: a925ReviewWorkspace, w42_review_mode: a925ModeWorkspace,
    ...Object.fromEntries(Object.entries(reliabilityWorkspace).map(([mode, item]) => [mode, item.workspace])),
  });
  Object.assign(w42PathEntries.data_roots, {
    w42_stop: a925StopData, w42_review: a925ReviewData,
    w42_review_restart: a925ReviewData, w42_review_mode: a925ModeData,
    ...Object.fromEntries(Object.entries(reliabilityWorkspace).map(([mode, item]) => [mode, item.data])),
  });
  const allPathsOk = hasNonAsciiAndSpace(runRoot)
    && Object.values(w42PathEntries.workspaces).every(hasNonAsciiAndSpace)
    && Object.values(w42PathEntries.data_roots).every(hasNonAsciiAndSpace);
  const productMainByPhase = {};
  let productMainOk = true;
  for (const entry of w42PhaseReports.concat(a925PhaseReports, [
    { phase: 'first', report: readJson(firstOut) }, { phase: 'second', report: readJson(secondOut) },
    { phase: 'retry', report: blockedReports.retry || readJson(retryOut) }, { phase: 'stop', report: readJson(stopOut) },
    { phase: 'live', report: blockedReports.live || readJson(liveOut) },
  ])) {
    const loaded = entry.report && entry.report.productMainLoaded ? String(entry.report.productMainLoaded) : '';
    const valid = loaded.length > 0 && path.resolve(loaded).startsWith(path.resolve(candidateRoot) + path.sep)
      && fs.existsSync(loaded);
    productMainByPhase[entry.phase] = { productMainLoaded: loaded, valid };
    if (!valid) productMainOk = false;
  }
  record('A9-W42-CHINESE-SPACE-PATHS', allPathsOk && productMainOk, JSON.stringify({
    ...w42PathEntries, candidate_root: candidateRoot, product_main_by_phase: productMainByPhase,
  }));

  // —— W42 证据摘录（文件名固定，见交接书 §3.4）。 ——
  const copyVisual = (scene, targetName) => {
    const source = path.join(visualRoot, `${scene}.png`);
    if (fs.existsSync(source)) fs.copyFileSync(source, path.join(evidenceRoot, targetName));
    return fs.existsSync(path.join(evidenceRoot, targetName));
  };
  const w42Excerpt = (phaseReport, caseIds) => ({
    phase_status: phaseReport ? phaseReport.status : 'NO_REPORT',
    phase_error: phaseReport ? (phaseReport.error || null) : null,
    cases: (phaseReport && Array.isArray(phaseReport.cases) ? phaseReport.cases : [])
      .filter((item) => caseIds.includes(item.id)),
  });
  fs.writeFileSync(path.join(evidenceRoot, 'w42-02-paths.json'), `${JSON.stringify({
    candidate_root: candidateRoot, ...w42PathEntries, product_main_by_phase: productMainByPhase,
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-03-startup.json'), `${JSON.stringify({
    ...(startupReport.w42Startup || {}),
    case: (startupReport.cases || []).find((item) => item.id === 'A9-W42-STARTUP-WITHIN-60S') || null,
  }, null, 2)}\n`, 'utf8');
  copyVisual('w42-startup', 'w42-03-startup.png');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-04-task-flow.json'), `${JSON.stringify(w42Excerpt(readJson(firstOut),
    ['A9F1-FORMAL-EXPLORER-SESSION', 'A9F1-MODE-SELECTION', 'A9F1-PROVIDER-CONFIG-PROBE', 'A9F1-TOOL-JOURNEY',
      'A9F1-SHELL-EVENT-DTO-UI', 'A9-15-PROGRESS-EVENT-ORDER', 'A9-15-PROGRESS-RENDERED-ONCE']), null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-05-diff.json'), `${JSON.stringify({
    inherited: w42Excerpt(readJson(firstOut), ['A9F1-DIFF', 'A9F1-SNAPSHOT-FACTS']),
    tightened: w42Excerpt(a925ReviewReport, ['A9-W42-DIFF-SCREENSHOT']),
  }, null, 2)}\n`, 'utf8');
  copyVisual('a925-review-diff', 'w42-05-diff.png');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-06-approval-stop-restart.json'), `${JSON.stringify({
    first_approval: w42Excerpt(readJson(firstOut), ['A9F1-APPROVAL-CARD-TRUE-TARGET', 'A9-15-APPROVAL-RESOLVED-PERSISTED',
      'A9-15-DENY-ZERO-TARGET-SIDE-EFFECT']),
    second_restore: w42Excerpt(readJson(secondOut), ['A9F2-RESTORE-ACTIVE-WORKSPACE', 'A9F2-RESTORE-MODE',
      'A9F2-RESTORE-CHECKPOINT', 'A9F2-OLD-APPROVAL-REJECTED']),
    retry: w42Excerpt(readJson(retryOut), ['A9-15-QUERY-FAILURE-VISIBLE-RETRY']),
    stop: w42Excerpt(readJson(stopOut), ['A9F6-STOP-SHELL-CHILD-STARTED', 'A9F6-STOP-UI-ACTIVE', 'A9F6-STOP-TURN-CANCELLED']),
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-07-09-git-forms.json'), `${JSON.stringify({
    git_available: gitAvailable, git_executable: gitSelection.executable, git_source: gitSelection.source,
    git_version: gitSelection.version, setup_error: gitSetupError,
    remote_check: gitAvailable ? 'refs/heads/main compared before and after the phase' : 'NOT_PERFORMED_NO_GIT',
    ref_unchanged: gitAvailable ? gitMainRefAfter === gitMainRefBefore : null,
    forms: W42_GIT_FORMS.map((form) => ({
      index: form.index, id: form.id, binding_expectation: form.binding,
      case: (gitReport.cases || []).find((item) => item.id === `A9-W42-GIT-FORM-${String(form.index).padStart(2, '0')}`) || null,
    })),
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-10-startup-recovery.json'), `${JSON.stringify({
    small: { seed: m1SmallSeed, report: { status: m1SmallReport.status, w42M1: m1SmallReport.w42M1 || null } },
    large: { report: { status: m1LargeReport.status, w42M1: m1LargeReport.w42M1 || null } },
    aggregate_cases: (smokeCases || []).filter((item) => item.id === 'A9-W42-M1-TARGETED-RECOVERY'
      || item.id === 'A9-W42-M1-STARTUP-TIMING-RECORDED'),
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-11-m1b-hex-redaction.json'), `${JSON.stringify({
    freeze: w42Excerpt(m1bReport, ['A9-W42-M1B-FREEZE-DURATION', 'W42-M1B-URL-TURN-RAN']),
    redaction: { db: m1bDbScan, files: m1bFileScan, driver_report: m1bReportScan },
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-12-output-limits.json'), `${JSON.stringify(w42Excerpt(m2Report,
    ['A9-W42-M2-TRUNCATED-WITH-WARNINGS', 'A9-W42-M2-TOOL-NOT-EXECUTED', 'A9-W42-M2-NEXT-TURN-OK']), null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-13-checkpoint-paging.json'), `${JSON.stringify(w42Excerpt(m3Report,
    ['A9-W42-M3-COUNT-MATCHES-DB', 'A9-W42-M3-OLDER-PAGES-CONTINUOUS', 'A9-W42-M3-OLDER-DIFF',
      'A9-W42-M3-DIFF-SCREENSHOT']), null, 2)}\n`, 'utf8');
  copyVisual('a925-m3-changes', 'w42-13-checkpoint-paging.png');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-14-collection-bounds.json'), `${JSON.stringify({
    seed: m4Seed,
    warmup: m4Report.w42M4 ? m4Report.w42M4.warmup : null,
    cases: w42Excerpt(m4Report, ['A9-W42-M4-CAP-NOTICE', 'A9-W42-M4-RELEASED-COUNT-ACCURATE', 'A9-W42-M4-RENDERER-MEMORY-SAMPLED']),
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-06-stop-exit.json'), `${JSON.stringify({
    observation: a925StopReport.w42Stop || null,
    case: (a925StopReport.cases || []).find((item) => item.id === 'A9-W42-STOP-CHILD-EXIT-WITHIN-5S') || null,
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-16-summary.json'), `${JSON.stringify({
    observation: a925ReviewReport.w42Summary || null,
    case: (a925ReviewReport.cases || []).find((item) => item.id === 'A9-W42-REVIEW-SUMMARY-CARD') || null,
  }, null, 2)}\n`, 'utf8');
  copyVisual('a925-summary', 'w42-16-summary.png');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-17-undo.json'), `${JSON.stringify({
    recall: a925ReviewReport.w42UndoRecall || null,
    file: a925ReviewReport.w42UndoFile || null,
    persisted: a925RestartReport.w42UndoPersisted || null,
    cases: [a925ReviewReport, a925RestartReport].flatMap((item) => item.cases || [])
      .filter((item) => item.id.startsWith('A9-W42-REVIEW-UNDO-')),
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-18-external.json'), `${JSON.stringify({
    observation: a925ReviewReport.w42External || null,
    case: (a925ReviewReport.cases || []).find((item) => item.id === 'A9-W42-REVIEW-EXTERNAL-DRIFT') || null,
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-19-later.json'), `${JSON.stringify({
    observation: a925ReviewReport.w42Later || null,
    case: (a925ReviewReport.cases || []).find((item) => item.id === 'A9-W42-REVIEW-LATER-TURN') || null,
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-20-command.json'), `${JSON.stringify({
    observation: a925ReviewReport.w42Command || null,
    case: (a925ReviewReport.cases || []).find((item) => item.id === 'A9-W42-REVIEW-COMMAND-CHANGES') || null,
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-21-mode.json'), `${JSON.stringify({
    mode_choices: (a925ReviewReport.cases || []).find((item) => item.id === 'A9-W42-MODE-TWO-OPTIONS') || null,
    non_blocking: (a925ReviewReport.cases || []).find((item) => item.id === 'A9-W42-REVIEW-NON-BLOCKING') || null,
    review_mode: a925ModeReport.w42ReviewMode || null,
    product_denial: (a925ModeReport.cases || []).find((item) => item.id === 'A9-W42-REVIEW-MODE-FAIL-CLOSED') || null,
  }, null, 2)}\n`, 'utf8');
  fs.writeFileSync(path.join(evidenceRoot, 'w42-22-layout.json'), `${JSON.stringify({
    geometry: a925ReviewReport.w42Layout || null,
    case: (a925ReviewReport.cases || []).find((item) => item.id === 'A9-W42-REVIEW-LAYOUT') || null,
    dpi_125_status: a925ReviewReport.w42Layout?.devicePixelRatio === 1.25 ? 'OBSERVED' : 'NOT_PERFORMED_CURRENT_DPI_NOT_125_PERCENT',
  }, null, 2)}\n`, 'utf8');
  copyVisual('a925-review-layout', 'w42-22-layout.png');
  const reliabilityEvidence = [
    ['w42_recovery_dir', 'w42-23-recovery-dir.json'],
    ['w42_verification', 'w42-24-verification.json'],
    ['w42_instructions_environment', 'w42-25-context.json'],
    ['w42_context_budget', 'w42-26-context-budget.json'],
    ['w42_cold_history', 'w42-27-cold-history.json'],
    ['w42_cancel_output', 'w42-28-cancel-output.json'],
    ['w42_audit', 'w42-29-audit.json'],
    ['w42_provider', 'w42-30-provider.json'],
  ];
  for (const [mode, name] of reliabilityEvidence) {
    const phase = reliabilityReports[mode] || null;
    fs.writeFileSync(path.join(evidenceRoot, name), `${JSON.stringify({
      phase: mode, phase_status: phase?.status || 'NO_REPORT',
      cases: Array.isArray(phase?.cases) ? phase.cases : [],
      observation: phase?.w42Reliability || null,
    }, null, 2)}\n`, 'utf8');
  }

  // —— S-3：smoke 结束前的最终残留检查（结构化快照）。 ——
  const finalResidue = await waitForNoRelatedProcesses(candidateRoot, runRoot);
  record('A9-W42-FINAL-NO-RESIDUE', finalResidue.no_residue === true, JSON.stringify(finalResidue));
  fs.writeFileSync(path.join(evidenceRoot, 'w42-15-residue.json'), `${JSON.stringify(finalResidue, null, 2)}\n`, 'utf8');

  const w42Reports = {
    w42_startup: startupReport, w42_git: gitReport,
    w42_m1_small: m1SmallReport, w42_m1_large: m1LargeReport, w42_m1b: m1bReport,
    w42_m2: m2Report, w42_m3: m3Report, w42_m4: m4Report,
    ...reliabilityReports,
  };
  const w42EvidenceFiles = ['w42-02-paths.json', 'w42-03-startup.json', 'w42-03-startup.png',
    'w42-04-task-flow.json', 'w42-05-diff.json', 'w42-05-diff.png', 'w42-06-approval-stop-restart.json',
    'w42-07-09-git-forms.json', 'w42-10-startup-recovery.json', 'w42-11-m1b-hex-redaction.json',
    'w42-12-output-limits.json', 'w42-13-checkpoint-paging.json', 'w42-13-checkpoint-paging.png',
    'w42-14-collection-bounds.json', 'w42-15-residue.json']
    .map((name) => path.join(evidenceRoot, name)).filter((filePath) => fs.existsSync(filePath));
  w42EvidenceFiles.push(...[
    'w42-06-stop-exit.json', 'w42-16-summary.json', 'w42-16-summary.png', 'w42-17-undo.json',
    'w42-18-external.json', 'w42-19-later.json', 'w42-20-command.json', 'w42-21-mode.json', 'w42-21-tool-results.json',
    'w42-22-layout.json', 'w42-22-layout.png',
    'w42-23-recovery-dir.json', 'w42-24-verification.json', 'w42-25-context.json',
    'w42-26-context-budget.json', 'w42-27-cold-history.json', 'w42-28-cancel-output.json',
    'w42-29-audit.json', 'w42-30-provider.json',
  ].map((name) => path.join(evidenceRoot, name)).filter((filePath) => fs.existsSync(filePath)));

  const reports = { first, second, retry: blockedReports.retry || readJson(retryOut), stop: readJson(stopOut), live: blockedReports.live || readJson(liveOut),
    ...w42Reports, w42_stop: a925StopReport, w42_review: a925ReviewReport,
    w42_review_restart: a925RestartReport, w42_review_mode: a925ModeReport };
  const phaseEntries = [
    ['first', firstOut], ['second', secondOut], ['retry', retryOut], ['stop', stopOut], ['live', liveOut],
    ...w42Phases.map((item) => [item.phase, path.join(runRoot, `${item.phase}.json`)]),
    ...a925Phases.map((item) => [item.phase, path.join(runRoot, `${item.phase}.json`)]),
  ];
  const reportFilesExist = Object.fromEntries(phaseEntries.map(([mode, filePath]) => [mode, fs.existsSync(filePath)]));
  const phaseReportsValid = validatePhaseReports(phases, w42Phases.concat(a925Phases), reports, reportFilesExist);
  const retryReport = reports.retry || {};
  const retryTargetBound = Boolean(retryTargetConversation
    && retryReport.retryTarget?.conversationId === retryTargetConversation
    && Array.isArray(retryReport.cases)
    && retryReport.cases.some((c) => c.id === 'A9-15-QUERY-FAILURE-VISIBLE-RETRY' && c.passed === true));
  record('A9-W42-RETRY-TARGET-BOUND', retryTargetBound,
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
  record('A9-W42-DRIVER-PROTOCOL-DECLARED', baseEnv.A9_SMOKE_DRIVER_PROTOCOL === 'projection', baseEnv.A9_SMOKE_DRIVER_PROTOCOL);
  record('A9-W42-FIXTURE-SUPPORTS-PROJECTION-PROTOCOL', failureServed && latestSuccessServed,
    `failure503=${failureServed}; latestSuccess200=${latestSuccessServed}`);
  record('A9-W42-FIXTURE-JOURNEY-STILL-COMPATIBLE', journeyServed, `journey200=${journeyServed}`);
  // 投影证据包与导出附件落到候选外证据根，供报告按路径与哈希绑定。
  const projectionFiles = fs.existsSync(projectionRoot) ? fs.readdirSync(projectionRoot).sort() : [];
  for (const name of projectionFiles) {
    fs.copyFileSync(path.join(projectionRoot, name), path.join(evidenceRoot, name));
  }
  const projectionPackagePath = path.join(evidenceRoot, 'projection-evidence.json');
  record('A9-W42-PROJECTION-EVIDENCE-PUBLISHED',
    projectionFiles.includes('projection-evidence.json') && projectionFiles.filter((name) => name.startsWith('projection-')).length === 6
    && fs.existsSync(projectionPackagePath),
  JSON.stringify(projectionFiles));
  // ADR-0121 R1：投影附件必须能被正式报告器解析。driver 导出字段与报告器约定一旦漂移，
  // 必须让本 smoke 失败，而不是等 Win7 报告签发时才暴露。
  let projectionParseable = false;
  let projectionParseDetail = '';
  try {
    const reportModule = require('./a9-win7-42-report.cjs');
    const readProjection = (name) => JSON.parse(fs.readFileSync(path.join(evidenceRoot, name), 'utf8'));
    const query = reportModule.parseQueryExport(readProjection('projection-query-export.json'), 'W42-03-INSPECTOR-PERSISTED-RESTART');
    reportModule.parseDomExport(readProjection('projection-dom-export.json'), query, 'W42-03-INSPECTOR-PERSISTED-RESTART', 'restart');
    const evidencePackage = readProjection('projection-evidence.json');
    const outcome = evidencePackage.results['W42-09-LATEST-OUTCOME-PROJECTION'].projection_evidence;
    const olderEvent = query.events.find((event) => event.event_id === outcome.older_failure.event_id);
    const newerEvent = query.events.find((event) => event.event_id === outcome.newer_success.event_id);
    const latestTurn = reportModule.latestTerminal(query, 'W42-09-LATEST-OUTCOME-PROJECTION');
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
  record('A9-W42-PROJECTION-ARTIFACTS-REPORT-PARSEABLE', projectionParseable, projectionParseDetail);
  // RF01: 显式要求关键断言集合存在且通过（fail-closed 对缺阶段/缺必需用例）
  const requiredSmokeAssertionIds = [
    'A9-15-QUERY-FAILURE-VISIBLE-RETRY',
    'A9-15-INSPECTOR-PERSISTED-EVENTS',
    'A9-15-DOM-OUTCOME-TURN-IDENTITY',
    'A9-15-OLDER-EVENT-PAGINATION',
    'A9-15-OLDER-FAILURE-NEWER-SUCCESS-RESTART',
    'A9-W42-DRIVER-PROTOCOL-DECLARED',
    'A9-W42-FIXTURE-SUPPORTS-PROJECTION-PROTOCOL',
    'A9-W42-PROJECTION-EVIDENCE-PUBLISHED',
    'A9-W42-PROJECTION-ARTIFACTS-REPORT-PARSEABLE',
    'A9-W42-RETRY-TARGET-BOUND',
    'A9-W42-LATE-LOAD-REJECTED',
    'A9-W42-LATE-LOAD-PARENT-REJECTED',
    'A9-W42-CONTROLLED-ERROR-NONZERO',
    'A9-W42-CONTROLLED-ERROR-PARENT-REJECTED',
    'A9-W42-NEGATIVE-PROBES-NO-RESIDUE',
    // ADR-0136：A9-27 实时性、头部文案与左栏保持断言。
    'A9-W42-LIVE-PROVIDER-PROBE',
    'A9-W42-RAIL-PRESERVED-AFTER-WORKSPACE-AND-CONVERSATION',
    'A9-W42-HEADER-AND-LABELS',
    'A9-W42-LIVE-TOOL-CARD-BEFORE-COMPLETION',
    'A9-W42-LIVE-NOTE-BEFORE-COMPLETION',
    'A9-W42-LIVE-PREVIEW-BEFORE-COMPLETION',
    'A9-W42-LIVE-PREVIEW-CLEARED-AFTER-COMPLETION',
    'A9-W42-LIVE-LATENCY-WITHIN-1500MS',
    'A9-W42-LIVE-SECRET-NOT-EXPOSED',
    'A9-W42-LIVE-REPORT-HAS-NO-TEST-KEY',
    // A9-27 / W42 追加断言（每项恰好出现一次）。
    'A9-W42-CHINESE-SPACE-PATHS',
    'A9-W42-STARTUP-WITHIN-60S',
    ...Array.from({ length: 19 }, (_item, index) => `A9-W42-GIT-FORM-${String(index + 1).padStart(2, '0')}`),
    'A9-W42-M1-TARGETED-RECOVERY',
    'A9-W42-M1-STARTUP-TIMING-RECORDED',
    'A9-W42-M1B-FREEZE-DURATION',
    'A9-W42-M1B-URL-REDACTED',
    'A9-W42-M2-TRUNCATED-WITH-WARNINGS',
    'A9-W42-M2-TOOL-NOT-EXECUTED',
    'A9-W42-M2-NEXT-TURN-OK',
    'A9-W42-M3-COUNT-MATCHES-DB',
    'A9-W42-M3-OLDER-PAGES-CONTINUOUS',
    'A9-W42-M3-OLDER-DIFF',
    'A9-W42-M4-CAP-NOTICE',
    'A9-W42-M4-RELEASED-COUNT-ACCURATE',
    'A9-W42-M4-RENDERER-MEMORY-SAMPLED',
    'A9-W42-FINAL-NO-RESIDUE',
  ];
  requiredSmokeAssertionIds.push(
    'A9-W42-STOP-CHILD-EXIT-WITHIN-5S', 'A9-W42-DIFF-SCREENSHOT', 'A9-W42-M3-DIFF-SCREENSHOT',
    'A9-W42-REVIEW-SUMMARY-CARD', 'A9-W42-REVIEW-UNDO-RECALL', 'A9-W42-REVIEW-UNDO-FILE',
    'A9-W42-REVIEW-UNDO-PERSISTED', 'A9-W42-REVIEW-EXTERNAL-DRIFT', 'A9-W42-REVIEW-LATER-TURN',
    'A9-W42-REVIEW-COMMAND-CHANGES', 'A9-W42-REVIEW-NON-BLOCKING', 'A9-W42-MODE-TWO-OPTIONS',
    'A9-W42-REVIEW-MODE-FAIL-CLOSED',
    'A9-W42-REVIEW-LAYOUT',
    'A9-W42-RECOVERY-DIR-GIT-SAFETY', 'A9-W42-VERIFICATION-CLASSIFICATION',
    'A9-W42-INSTRUCTIONS-ENVIRONMENT', 'A9-W42-CONTEXT-BUDGET-RETRY',
    'A9-W42-COLD-HISTORY-LOAD', 'A9-W42-CANCEL-AND-OUTPUT-REASON',
    'A9-W42-AUDIT-FAIL-CLOSED', 'A9-W42-PROVIDER-COMPLETENESS',
  );
  const requiredSummary = w42RequiredAssertionSummary(requiredSmokeAssertionIds, allCases.concat(smokeCases));
  const requiredOk = requiredSummary.missing.length === 0 && requiredSummary.presentNotPassed.length === 0;
  record('A9-W42-REQUIRED-ASSERTIONS-PRESENT', requiredOk,
    requiredOk ? 'ALL_PRESENT_AND_PASSED' : JSON.stringify({
      MISSING: requiredSummary.missing, PRESENT_NOT_PASSED: requiredSummary.presentNotPassed,
    }));
  const cases = [...allCases, ...smokeCases];
  // S-5：w42-case-index.json —— 每个用例 → 断言 ID、结果、证据文件相对路径。
  const caseResult = (id) => {
    const hits = cases.filter((item) => item.id === id);
    if (!hits.length) return 'MISSING';
    return hits.every((item) => item.passed === true) ? (hits.length === 1 ? 'PASS' : `PASS_X${hits.length}`) : 'FAIL';
  };
  const gitFormResults = (indexes) => indexes.map((index) => ({
    id: `A9-W42-GIT-FORM-${String(index).padStart(2, '0')}`, result: caseResult(`A9-W42-GIT-FORM-${String(index).padStart(2, '0')}`),
  }));
  const w42CaseIndex = {
    schema_version: 1,
    candidate: 'WIN7-42',
    generated_at: new Date().toISOString(),
    smoke_status: null,
    cases: [
      { case_id: 'W42-01-CANDIDATE-INTEGRITY', assertions: [], result: 'VERIFIED_BY_RUN_A9_27_W42_INTEGRITY_CMD_NOT_SMOKE', evidence: ['integrity-output.txt', 'a9-package-integrity.json'] },
      { case_id: 'W42-02-CHINESE-SPACE-PATH', assertions: [{ id: 'A9-W42-CHINESE-SPACE-PATHS', result: caseResult('A9-W42-CHINESE-SPACE-PATHS') }], evidence: ['w42-02-paths.json'] },
      { case_id: 'W42-03-STARTUP-WITHIN-60S', assertions: [{ id: 'A9-W42-STARTUP-WITHIN-60S', result: caseResult('A9-W42-STARTUP-WITHIN-60S') }], evidence: ['w42-03-startup.png', 'w42-03-startup.json'] },
      { case_id: 'W42-04-TASK-READ-EDIT-SHELL', assertions: ['A9F1-TOOL-JOURNEY', 'A9F1-SHELL-EVENT-DTO-UI', 'A9-15-PROGRESS-EVENT-ORDER', 'A9-15-PROGRESS-RENDERED-ONCE'].map((id) => ({ id, result: caseResult(id) })), evidence: ['w42-04-task-flow.json'] },
      { case_id: 'W42-05-DIFF-AND-CHECKPOINT', assertions: ['A9F1-DIFF', 'A9F1-SNAPSHOT-FACTS'].map((id) => ({ id, result: caseResult(id) })), evidence: ['w42-05-diff.png', 'w42-05-diff.json'] },
      { case_id: 'W42-06-APPROVAL-STOP-RESTART', assertions: ['A9F1-APPROVAL-CARD-TRUE-TARGET', 'A9-15-DENY-ZERO-TARGET-SIDE-EFFECT', 'A9F6-STOP-TURN-CANCELLED', 'A9F2-RESTORE-ACTIVE-WORKSPACE', 'A9-15-QUERY-FAILURE-VISIBLE-RETRY'].map((id) => ({ id, result: caseResult(id) })), evidence: ['w42-06-approval-stop-restart.json'] },
      { case_id: 'W42-07-A9-20-GIT-FORMS-CMD', assertions: gitFormResults([1, 2, 3, 4, 5, 6]), evidence: ['w42-07-09-git-forms.json'] },
      { case_id: 'W42-08-A9-20-GIT-FORMS-POWERSHELL', assertions: gitFormResults([7, 8, 9, 10, 11, 12, 18, 19]), evidence: ['w42-07-09-git-forms.json'] },
      { case_id: 'W42-09-A9-20-GIT-FORMS-POSIX-AND-BULK', assertions: gitFormResults([13, 14, 15, 16, 17]), evidence: ['w42-07-09-git-forms.json'] },
      { case_id: 'W42-10-M1-STARTUP-TARGETED-RECOVERY', assertions: [{ id: 'A9-W42-M1-TARGETED-RECOVERY', result: caseResult('A9-W42-M1-TARGETED-RECOVERY') }, { id: 'A9-W42-M1-STARTUP-TIMING-RECORDED', result: caseResult('A9-W42-M1-STARTUP-TIMING-RECORDED') }], evidence: ['w42-10-startup-recovery.json'] },
      { case_id: 'W42-11-M1B-HEX-FREEZE-AND-URL-REDACTION', assertions: [{ id: 'A9-W42-M1B-FREEZE-DURATION', result: caseResult('A9-W42-M1B-FREEZE-DURATION') }, { id: 'A9-W42-M1B-URL-REDACTED', result: caseResult('A9-W42-M1B-URL-REDACTED') }], evidence: ['w42-11-m1b-hex-redaction.json'] },
      { case_id: 'W42-12-M2-OUTPUT-LIMITS', assertions: ['A9-W42-M2-TRUNCATED-WITH-WARNINGS', 'A9-W42-M2-TOOL-NOT-EXECUTED', 'A9-W42-M2-NEXT-TURN-OK'].map((id) => ({ id, result: caseResult(id) })), evidence: ['w42-12-output-limits.json'] },
      { case_id: 'W42-13-M3-CHECKPOINT-PAGINATION', assertions: ['A9-W42-M3-COUNT-MATCHES-DB', 'A9-W42-M3-OLDER-PAGES-CONTINUOUS', 'A9-W42-M3-OLDER-DIFF'].map((id) => ({ id, result: caseResult(id) })), evidence: ['w42-13-checkpoint-paging.png', 'w42-13-checkpoint-paging.json'] },
      { case_id: 'W42-14-M4-COLLECTION-BOUNDS', assertions: ['A9-W42-M4-CAP-NOTICE', 'A9-W42-M4-RELEASED-COUNT-ACCURATE', 'A9-W42-M4-RENDERER-MEMORY-SAMPLED'].map((id) => ({ id, result: caseResult(id) })), evidence: ['w42-14-collection-bounds.json'] },
      { case_id: 'W42-15-SECRET-SCAN-AND-POSTFLIGHT', assertions: [{ id: 'A9-W42-FINAL-NO-RESIDUE', result: caseResult('A9-W42-FINAL-NO-RESIDUE') }], evidence: ['w42-15-residue.json'] },
    ],
  };
  const caseIndexErrors = [];
  const addCaseAssertion = (caseId, id, evidence) => {
    const item = w42CaseIndex.cases.find((entry) => entry.case_id === caseId);
    if (!item) { caseIndexErrors.push(`A9_W42_CASE_INDEX_MISSING:${caseId}`); return; }
    item.assertions.push({ id, result: caseResult(id) });
    for (const file of evidence) if (!item.evidence.includes(file)) item.evidence.push(file);
  };
  addCaseAssertion('W42-05-DIFF-AND-CHECKPOINT', 'A9-W42-DIFF-SCREENSHOT', []);
  addCaseAssertion('W42-06-APPROVAL-STOP-RESTART', 'A9-W42-STOP-CHILD-EXIT-WITHIN-5S', ['w42-06-stop-exit.json']);
  addCaseAssertion('W42-13-M3-CHECKPOINT-PAGINATION', 'A9-W42-M3-DIFF-SCREENSHOT', []);
  const addA925Case = (caseId, ids, evidence) => w42CaseIndex.cases.push({ case_id: caseId,
    assertions: ids.map((id) => ({ id, result: caseResult(id) })), evidence });
  addA925Case('W42-16-REVIEW-SUMMARY', ['A9-W42-REVIEW-SUMMARY-CARD'], ['w42-16-summary.json', 'w42-16-summary.png']);
  addA925Case('W42-17-REVIEW-UNDO', ['A9-W42-REVIEW-UNDO-RECALL', 'A9-W42-REVIEW-UNDO-FILE',
    'A9-W42-REVIEW-UNDO-PERSISTED'], ['w42-17-undo.json']);
  addA925Case('W42-18-EXTERNAL-DRIFT', ['A9-W42-REVIEW-EXTERNAL-DRIFT'], ['w42-18-external.json']);
  addA925Case('W42-19-LATER-TURN', ['A9-W42-REVIEW-LATER-TURN'], ['w42-19-later.json']);
  addA925Case('W42-20-COMMAND-CHANGES', ['A9-W42-REVIEW-COMMAND-CHANGES'], ['w42-20-command.json']);
  const commandCase = w42CaseIndex.cases.find((item) => item.case_id === 'W42-20-COMMAND-CHANGES');
  commandCase.result = caseResult('A9-W42-REVIEW-COMMAND-CHANGES') !== 'PASS' ? 'FAIL'
    : a925ReviewReport.w42Command?.unrecoverableStatus === 'OBSERVED' ? 'PASS' : 'NOT_PERFORMED';
  if (commandCase.result === 'NOT_PERFORMED') {
    commandCase.reason = 'The Win7 product run did not expose big.bin as too_large without changing product code; the recoverable gen.txt observation remains recorded separately.';
  }
  addA925Case('W42-21-NONBLOCKING-MODE', ['A9-W42-REVIEW-NON-BLOCKING', 'A9-W42-MODE-TWO-OPTIONS',
    'A9-W42-REVIEW-MODE-FAIL-CLOSED'], ['w42-21-mode.json']);
  addA925Case('W42-22-LAYOUT', ['A9-W42-REVIEW-LAYOUT'], ['w42-22-layout.json', 'w42-22-layout.png']);
  addA925Case('W42-23-RECOVERY-DIR-GIT-SAFETY', ['A9-W42-RECOVERY-DIR-GIT-SAFETY'], ['w42-23-recovery-dir.json']);
  addA925Case('W42-24-VERIFICATION-CLASSIFICATION', ['A9-W42-VERIFICATION-CLASSIFICATION'], ['w42-24-verification.json']);
  addA925Case('W42-25-INSTRUCTIONS-ENVIRONMENT', ['A9-W42-INSTRUCTIONS-ENVIRONMENT'], ['w42-25-context.json']);
  addA925Case('W42-26-CONTEXT-BUDGET-RETRY', ['A9-W42-CONTEXT-BUDGET-RETRY'], ['w42-26-context-budget.json']);
  addA925Case('W42-27-COLD-HISTORY-LOAD', ['A9-W42-COLD-HISTORY-LOAD'], ['w42-27-cold-history.json']);
  addA925Case('W42-28-CANCEL-AND-OUTPUT-REASON', ['A9-W42-CANCEL-AND-OUTPUT-REASON'], ['w42-28-cancel-output.json']);
  addA925Case('W42-29-AUDIT-FAIL-CLOSED', ['A9-W42-AUDIT-FAIL-CLOSED'], ['w42-29-audit.json']);
  addA925Case('W42-30-PROVIDER-COMPLETENESS', ['A9-W42-PROVIDER-COMPLETENESS'], ['w42-30-provider.json']);
  w42FinalizeCaseIndex(w42CaseIndex, phases.concat(w42Phases, a925Phases), reports);
  const report = {
    schema_version: 1,
    evidence_kind: 'A9_27_WIN7_42_AUTOMATIC_PRODUCT_SMOKE',
    recorded_at: new Date().toISOString(),
    driver_protocol: baseEnv.A9_SMOKE_DRIVER_PROTOCOL,
    status: phases.length === 5 && w42Phases.length === 16 && a925Phases.length === 4
      && w42CaseIndex.cases.length === 30 && caseIndexErrors.length === 0
      && phases.concat(w42Phases, a925Phases).every((item) => item.code === 0) && phaseReportsValid
      && negativeProbesValid
      && retryTargetBound && requiredOk
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
    case_index_errors: caseIndexErrors,
    phase_summary: phases.concat(w42Phases, a925Phases).map((run) => ({
      phase: run.phase, status: run.status === 'BLOCKED' ? 'BLOCKED'
        : normalPhaseContract(run, reports[run.phase], run.phase) ? 'PASS' : 'FAIL',
      report_status: reports[run.phase]?.status || 'NO_REPORT',
      error: reports[run.phase]?.error || run.execution_error || null,
      blocked_reason: run.blocked_reason || null,
    })),
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
    phases: phases.concat(w42Phases, a925Phases).map((item) => ({ phase: item.phase, exit_code: item.code, stderr_tail: item.stderr.slice(-2000),
      started_at: item.started_at, ended_at: item.ended_at, duration_ms: item.duration_ms,
      status: item.status || (normalPhaseContract(item, reports[item.phase], item.phase) ? 'PASS' : 'FAIL'),
      blocked_reason: item.blocked_reason || null,
      ...(item.execution_error ? { execution_error: item.execution_error } : {}),
      ...(item.timing_error ? { timing_error: item.timing_error } : {}) })),
    cases,
    live_progress: reports.live && reports.live.liveProgress ? {
      first_persisted_ms: reports.live.liveProgress.firstPersisted, first_dom_ms: reports.live.liveProgress.firstDom,
      latency_ms: reports.live.liveProgress.latency, samples: reports.live.liveProgress.samples,
    } : null,
    evidence_files: [lateOut, controlledErrorOut, firstOut, secondOut, retryOut, stopOut, liveOut,
      ...w42Phases.map((item) => path.join(runRoot, `${item.phase}.json`)),
      ...a925Phases.map((item) => path.join(runRoot, `${item.phase}.json`)),
      ...w42EvidenceFiles,
      ...fs.readdirSync(visualRoot).map((name) => path.join(visualRoot, name)),
      ...projectionFiles.map((name) => path.join(evidenceRoot, name))],
    real_provider: 'NOT_PERFORMED_BY_AUTOMATIC_FIXTURE_SMOKE',
  };
  const reportPath = path.join(runRoot, 'automatic-smoke.json');
  w42CaseIndex.smoke_status = report.status;
  fs.writeFileSync(path.join(evidenceRoot, 'w42-case-index.json'), `${JSON.stringify(w42CaseIndex, null, 2)}\n`, 'utf8');
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({ ...report, report_path: reportPath }, null, 2)}\n`);
  process.exitCode = report.status === 'PASS' ? 0 : 1;
}

module.exports = { validatePhaseReports, w42PhaseTiming, w42BlockPhase, w42FinalizeCaseIndex, w42LinkColdSeedTurns };

if (require.main === module) {
  main().catch((error) => {
    process.stderr.write(`${error && error.stack ? error.stack : String(error)}\n`);
    process.exitCode = 1;
  });
}

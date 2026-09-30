'use strict';

// Candidate-external test inputs; every action below uses the packaged product.
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const cp = require('child_process');
const assert = require('assert').strict;

function hash(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function frame(value) { return `data: ${JSON.stringify(value)}\n\n`; }
function reply(res, next) {
  res.writeHead(200, { 'Content-Type': 'text/event-stream' });
  if (next.raw !== undefined) { res.end(next.raw); return; }
  const tools = next.tools || (next.tool ? [{ ...next.tool, id: next.id || 'probe-call' }] : []);
  const delta = tools.length ? { tool_calls: tools.map((tool, index) => ({ index, id: tool.id || `probe-${index}`, type: 'function',
    function: { name: tool.name, arguments: JSON.stringify(tool.args) } })) } : { content: next.content || 'done' };
  res.end(frame({ choices: [{ delta, finish_reason: tools.length ? 'tool_calls' : 'stop' }] }) + 'data: [DONE]\n\n');
}
async function fixture(behavior) {
  const requests = [];
  const server = http.createServer((req, res) => {
    let text = '';
    req.on('data', (bytes) => { text += bytes.toString('utf8'); });
    req.on('end', () => {
      try {
        const parsed = JSON.parse(text); requests.push(parsed);
        const next = behavior(parsed, requests.length);
        if (next.httpError) { res.writeHead(400); res.end(JSON.stringify({ error: { message: 'context_length_exceeded' } })); }
        else reply(res, next);
      } catch (_error) { res.writeHead(500); res.end('fixture failure'); }
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { url: `http://127.0.0.1:${server.address().port}`, requests,
    close: () => new Promise((resolve) => server.close(resolve)) };
}
function turnMessages(parsed) {
  const messages = parsed.messages || [];
  const index = messages.map((message) => message.role).lastIndexOf('user');
  return { prompt: messages[index]?.content || '', tools: messages.slice(index + 1).filter((message) => message.role === 'tool') };
}

function modules(candidateRoot) {
  const app = path.join(candidateRoot, 'resources', 'app');
  const packageRuntime = process.platform === 'win32'
    ? require(path.join(app, 'product', 'a9-package-runtime.js')).loadA9PackageRuntime({ productRoot: path.join(app, 'product') }) : null;
  if (process.platform === 'win32' && !packageRuntime) throw new Error('W42_PACKAGED_RUNTIME_REQUIRED');
  return { app, packageRuntime, Core: require(path.join(app, 'core', 'dist')), Gateway: require(path.join(app, 'gateway', 'dist')),
    Workspace: require(path.join(app, 'workspace', 'dist')), Runner: require(path.join(app, 'runner', 'dist')),
    Runtime: require(path.join(app, 'product', 'a9-agent-runtime.js')),
    Database: require(path.join(candidateRoot, 'resources', 'native', 'storage', 'node_modules', 'better-sqlite3')) };
}
function runtime(m, workspace, data, extra = {}) {
  fs.mkdirSync(workspace, { recursive: true }); fs.mkdirSync(data, { recursive: true });
  const rt = m.Runtime.createA9AgentRuntime({ workspaceRoot: workspace, dataRoot: data, ownerId: 'w42-product-probe',
    ...(m.packageRuntime ? { runnerHelperPath: m.packageRuntime.runnerHelper, requireRunnerHelper: true } : {}),
    openDatabase: (file, options) => new m.Database(file, options?.readonly ? { readonly: true } : {}), ...extra });
  assert.equal(rt.status, 'ready'); rt.setMode('full_access');
  return rt;
}
function events(rt) { return rt.queryEvents({ conversationId: rt.getSnapshot().activeConversationId, limit: 1000 }).events; }
async function shutdown(rt) { const result = await rt.shutdown(); assert(Array.isArray(result?.leftToSystem) && result.leftToSystem.length === 0, 'W42_RUNTIME_CLEANUP_UNCONFIRMED'); }
async function configure(rt, server, extra = {}) { await rt.configureProvider({ baseUrl: server.url, model: 'w42-product-probe', skipProbe: true, ...extra }); }
function numericRequests(requests) {
  return requests.map((request) => ({ chars: request.messages.reduce((sum, message) => sum + String(message.content || '').length
    + (message.tool_calls || []).reduce((n, call) => n + call.function.arguments.length, 0), 0),
    roles: request.messages.map((message) => message.role) }));
}
function requestRecords(requests) {
  return requests.map((request) => ({ instructions: request.messages.filter((message) => String(message.content).includes('<project_instructions')).length,
    environment: request.messages.filter((message) => String(message.content).includes('<environment_facts')).length,
    instructionText: request.messages.find((message) => String(message.content).includes('<project_instructions'))?.content || '',
    environmentText: request.messages.find((message) => String(message.content).includes('<environment_facts'))?.content || '' }));
}

async function verification(m, workspace, data, python) {
  fs.writeFileSync(path.join(workspace, 'probe.txt'), 'value 0\n', 'utf8');
  fs.writeFileSync(path.join(workspace, 'check.py'), 'import sys\nif "--fail" in sys.argv:\n print("F" * 20000)\n sys.exit(1)\nprint("w42-check-pass")\n', 'utf8');
  const command = `${python} check.py`;
  const server = await fixture((parsed) => {
    const { prompt, tools } = turnMessages(parsed);
    const value = Number(/round (\d)/.exec(prompt)?.[1]);
    const count = (name) => tools.filter((tool) => tool.name === name).length;
    if (!count('read')) return { id: `r-${value}`, tool: { name: 'read', args: { path: 'probe.txt', encoding: 'utf-8' } } };
    if (!count('edit')) return { id: `e-${value}`, tool: { name: 'edit', args: { path: 'probe.txt', oldText: `value ${value - 1}`, newText: `value ${value}` } } };
    if (!count('shell')) return { id: `s-${value}`, tool: { name: 'shell', args: { command: value === 1 ? "Write-Output 'neutral'"
      : value === 3 ? `${command}; Write-Output done` : command } } };
    if (value === 4 && count('shell') === 1) return { id: 'failed-recheck', tool: { name: 'shell', args: { command: `${command} --fail` } } };
    return { content: `round ${value} complete` };
  });
  const rt = runtime(m, workspace, data);
  try {
    await configure(rt, server);
    const results = [];
    for (let value = 1; value <= 4; value++) results.push((await rt.submitTurn(`round ${value}`)).result);
    const audit = events(rt);
    return { results, audit, finalText: fs.readFileSync(path.join(workspace, 'probe.txt'), 'utf8'),
      largeFailure: audit.some((event) => event.payload?.data?.shell?.exitCode === 1 && event.payload.data.shell.stdout.length >= 20000) };
  } finally { await shutdown(rt); await server.close(); }
}

async function recovery(m, workspace, data, python, git) {
  const runGit = (args) => {
    const result = cp.spawnSync(git, args, { cwd: workspace, encoding: 'utf8', windowsHide: true, timeout: 30000 });
    assert.equal(result.status, 0, `git ${args[0]} failed`); return result.stdout;
  };
  runGit(['init']);
  const v = await verification(m, workspace, data, python);
  assert.equal(v.finalText, 'value 4\n');
  const ignore = path.join(workspace, '.agent_recovery', '.gitignore');
  const original = fs.readFileSync(ignore).toString('hex');
  const oldWorkspace = path.join(workspace, '旧恢复 legacy workspace');
  const oldData = path.join(data, 'legacy data');
  fs.mkdirSync(path.join(oldWorkspace, '.agent_recovery'), { recursive: true });
  fs.writeFileSync(path.join(oldWorkspace, 'calc.ts'), 'legacy\n', 'utf8');
  const old = runtime(m, oldWorkspace, oldData); await shutdown(old);
  const repaired = path.join(oldWorkspace, '.agent_recovery', '.gitignore');
  const first = { hash: hash(repaired), mtime: fs.statSync(repaired).mtimeMs };
  const reopened = runtime(m, oldWorkspace, oldData); await shutdown(reopened);
  return { ignoreHex: original, status: runGit(['status', '--porcelain', '-uall']), dryAdd: runGit(['add', '-A', '--dry-run']),
    dryClean: runGit(['clean', '-nd']), legacyHex: fs.readFileSync(repaired).toString('hex'), first,
    second: { hash: hash(repaired), mtime: fs.statSync(repaired).mtimeMs }, shellObserved: v.audit.some((event) => event.payload?.data?.toolName === 'shell') };
}

async function instructions(m, workspace, data) {
  const secret = `sk-w42-fixture-${crypto.randomBytes(24).toString('hex')}`;
  const server = await fixture(() => ({ content: 'instructions received' }));
  fs.writeFileSync(path.join(workspace, 'AGENTS.md'), '# 工作区说明\n请只修复当前任务。\n', 'utf8');
  const rt = runtime(m, workspace, data);
  try {
    await configure(rt, server, { apiKey: secret });
    await rt.submitTurn('instructions round one'); await rt.submitTurn('instructions round two');
    const two = requestRecords(server.requests);
    fs.writeFileSync(path.join(workspace, 'AGENTS.md'), `# secret fixture\n${secret}\n`, 'utf8');
    await rt.submitTurn('secret instruction round');
    const audit = events(rt);
    const statuses = audit.filter((event) => event.eventType === 'turn_started').map((event) => event.payload?.data?.projectInstructions?.status);
    const secretInRequests = JSON.stringify(server.requests).includes(secret);
    const secretInAudit = JSON.stringify(audit).includes(secret);
    let filesScanned = 0;
    let secretInData = false;
    const scan = (directory) => { for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) scan(file);
      else if (entry.isFile()) { filesScanned++; if (fs.readFileSync(file).includes(Buffer.from(secret))) secretInData = true; }
      else throw new Error('Unexpected data artifact type');
    } };
    scan(data);
    // Never export the secret or the third source instruction text.
    return { firstTwo: two, statuses, lastInstructionCount: requestRecords(server.requests).at(-1).instructions,
      secretInRequests, secretInAudit, secretInData, filesScanned };
  } finally { await shutdown(rt); await server.close(); }
}

async function context(m, workspace, data) {
  const retry = async (always) => {
    const server = await fixture((_parsed, count) => count === 1 || always ? { httpError: true } : { content: 'compressed retry succeeded' });
    const loop = new m.Core.A9AgentLoop({ workspaceRoot: workspace,
      provider: new m.Gateway.OpenAICompatibleProvider({ baseUrl: server.url, model: 'w42-budget' }), workspaceService: {}, runner: {}, contextBudgetChars: 16000 });
    loop.restoreConversationHistory(Array.from({ length: 100 }, (_, i) => [{ role: 'user', content: `history ${i}` + 'x'.repeat(150) },
      { role: 'assistant', content: 'y'.repeat(150) }]).flat());
    try { return { result: await loop.runTurn('current'), requests: numericRequests(server.requests) }; }
    finally { await server.close(); }
  };
  const successfulRetry = await retry(false);
  const failedRetry = await retry(true);
  const zero = await fixture(() => ({ content: 'should never arrive' }));
  fs.writeFileSync(path.join(workspace, 'AGENTS.md'), 'p'.repeat(20000), 'utf8');
  const audit = [];
  const loop = new m.Core.A9AgentLoop({ workspaceRoot: workspace,
    provider: new m.Gateway.OpenAICompatibleProvider({ baseUrl: zero.url, model: 'w42-budget-zero' }), workspaceService: {}, runner: {},
    contextBudgetChars: 16000, onEvent: (event) => audit.push(event) });
  let irreducible;
  try { irreducible = { result: await loop.runTurn('short input'), requests: zero.requests.length,
    failureCode: audit.find((event) => event.type === 'turn_failed')?.data.code }; }
  finally { await zero.close(); }
  // Persist a real Runtime failure for the subsequent Electron history/UI check.
  const repeated = await fixture(() => ({ httpError: true }));
  const rt = runtime(m, workspace, data);
  let uiResult;
  try { await configure(rt, repeated); uiResult = (await rt.submitTurn('budget failure UI')).result; }
  finally { await shutdown(rt); await repeated.close(); }
  return { successfulRetry, failedRetry, irreducible, uiResult, uiRequests: repeated.requests.length };
}

async function auditFailure(m, workspace, data) {
  const records = [];
  for (const event of ['control', 'tool_start', 'tool_end', 'turn_completed']) {
    const ws = path.join(workspace, event); const dbRoot = path.join(data, event);
    fs.mkdirSync(ws, { recursive: true }); fs.writeFileSync(path.join(ws, 'probe.txt'), 'original\n', 'utf8');
    fs.writeFileSync(path.join(ws, 'second.txt'), 'original\n', 'utf8');
    let db;
    const rt = runtime(m, ws, dbRoot, { openDatabase: (file) => { db = new m.Database(file); return db; } });
    const server = await fixture((parsed) => {
      const { tools } = turnMessages(parsed);
      if (!tools.some((tool) => tool.name === 'read')) return { tools: ['probe.txt', 'second.txt'].map((file, index) => ({ id: `read-${index}`, name: 'read', args: { path: file, encoding: 'utf-8' } })) };
      if (!tools.some((tool) => tool.name === 'edit')) return { tools: ['probe.txt', 'second.txt'].map((file, index) => ({ id: `edit-${index}`, name: 'edit', args: { path: file, oldText: 'original', newText: 'changed' } })) };
      return { content: 'audit control complete' };
    });
    try {
      await configure(rt, server);
      if (event !== 'control') db.exec(`CREATE TRIGGER w42_audit_fail BEFORE INSERT ON a9_events WHEN NEW.event_type = '${event}'
        AND (NEW.event_type = 'turn_completed' OR json_extract(NEW.payload_json, '$.data.toolName') = 'edit') BEGIN SELECT RAISE(FAIL, 'w42 injected storage failure'); END`);
      const result = await rt.submitTurn('edit probe');
      records.push({ event, result, requests: server.requests.length, content: fs.readFileSync(path.join(ws, 'probe.txt'), 'utf8'), secondContent: fs.readFileSync(path.join(ws, 'second.txt'), 'utf8') });
    } finally {
      if (event !== 'control') db.exec('DROP TRIGGER w42_audit_fail');
      await shutdown(rt); await server.close();
    }
  }
  return { records };
}

async function provider(m, workspace) {
  const records = [];
  for (const finish of ['tool_calls', 'missing', 'length', 'content_filter', 'stop', 'empty', 'invalid_json']) {
    const ws = path.join(workspace, finish); fs.mkdirSync(ws, { recursive: true }); fs.writeFileSync(path.join(ws, 'probe.txt'), 'original\n', 'utf8');
    const edit = { choices: [{ delta: { tool_calls: [{ index: 0, id: 'edit-1', function: { name: 'edit',
      arguments: finish === 'invalid_json' ? '{"path":' : '{"path":"probe.txt","old_text":"original","new_text":"changed"}' } }] },
      ...(finish === 'missing' ? {} : { finish_reason: ['length', 'content_filter', 'stop'].includes(finish) ? finish : 'tool_calls' }) }] };
    const server = await fixture((_parsed, count) => count > 1 ? { content: 'complete' }
      : { raw: finish === 'empty' ? '' : frame(edit) });
    const service = new m.Workspace.A9WorkspaceService(ws); await service.read('probe.txt', { encoding: 'utf-8' });
    const loop = new m.Core.A9AgentLoop({ workspaceRoot: ws,
      provider: new m.Gateway.OpenAICompatibleProvider({ baseUrl: server.url, model: 'w42-provider' }), workspaceService: service, runner: {} });
    try { records.push({ finish, result: await loop.runTurn('edit probe'), requests: server.requests.length,
      content: fs.readFileSync(path.join(ws, 'probe.txt'), 'utf8') }); }
    finally { await server.close(); }
  }
  return { records };
}

function matches(kind, value) {
  if (kind === 'recovery') return value.ignoreHex === '2a0a' && value.legacyHex === '2a0a' && value.shellObserved === true
    && ['status', 'dryAdd', 'dryClean'].every((key) => typeof value[key] === 'string' && !value[key].includes('.agent_recovery'))
    && value.first.hash === value.second.hash && value.first.mtime === value.second.mtime;
  if (kind === 'verification') return value.results?.length === 4 && value.results.every(Boolean)
    && value.results.map((result) => result.verification).join(',') === 'unverified,verified,unverified,unverified'
    && value.results[1].verificationEvidence?.exitCode === 0 && !value.results[3].verificationEvidence && value.largeFailure === true;
  if (kind === 'instructions') return value.firstTwo?.length === 2 && value.firstTwo.every((record) => record.instructions === 1 && record.environment === 1
    && record.instructionText.includes('工作区说明') && record.environmentText.includes('Windows 7 SP1') && /powershell.*5\.1/i.test(record.environmentText))
    && value.statuses.join(',') === 'loaded,loaded,secret_blocked' && value.lastInstructionCount === 0 && !value.secretInRequests && !value.secretInAudit && !value.secretInData && value.filesScanned > 0;
  if (kind === 'context') return value.successfulRetry?.requests.length === 2 && value.successfulRetry.result.outcome === 'completed'
    && value.successfulRetry.requests[1].chars <= 8000 && value.successfulRetry.requests[0].chars <= 16000
    && value.successfulRetry.requests[1].chars < value.successfulRetry.requests[0].chars
    && value.failedRetry?.requests.length === 2 && value.failedRetry.result.outcome === 'failed'
    && value.irreducible?.requests === 0 && value.irreducible.result.outcome === 'failed' && value.irreducible.failureCode === 'A9_CONTEXT_BUDGET_EXCEEDED'
    && value.uiRequests === 2 && value.uiResult.outcome === 'failed' && value.uiResult.finalMessage === '对话过长，已尝试压缩仍超出模型上限';
  if (kind === 'audit') return value.records?.length === 4 && value.records.every((record) => record.event === 'control'
    ? record.result.ok === true && record.result.result.toolCallsExecuted === 4 && record.requests === 3 && record.content === 'changed\n' && record.secondContent === 'changed\n'
    : record.result.ok === false && record.result.result?.auditIncomplete?.failedEvent === record.event
      && record.result.result.toolCallsExecuted === (record.event === 'tool_start' ? 2 : record.event === 'tool_end' ? 3 : 4)
      && record.content === (record.event === 'tool_start' ? 'original\n' : 'changed\n')
      && record.secondContent === (record.event === 'turn_completed' ? 'changed\n' : 'original\n')
      && record.requests === (record.event === 'turn_completed' ? 3 : 2));
  if (kind === 'cold') return Boolean(value.selected && value.queried && value.selected.seq < value.queried.seq
    && value.submits === 0 && value.ui?.rows > 0 && value.ui.olderEnabled === true);
  if (kind === 'cancel') return value.inheritedStopPassed === true && value.inheritedReviewPassed === true
    && value.cancelEvents?.some(event => event.type === 'turn_completed' && event.data?.outcome === 'cancelled')
    && value.oversizedText?.includes('big.bin') && value.oversizedText.includes('超过备份上限（单文件 2 MiB）') && !value.oversizedText.includes('too_large');
  if (kind === 'provider') return value.records?.length === 7 && value.records.every((record) => record.finish === 'tool_calls'
    ? record.requests === 2 && record.result.toolCallsExecuted === 1 && record.content === 'changed\n'
    : record.requests === 1 && record.result.toolCallsExecuted === 0 && record.result.outcome === 'failed' && record.content === 'original\n', 'utf8');
  return false;
}
async function run(kind, options) {
  const m = modules(options.candidateRoot);
  fs.mkdirSync(options.workspace, { recursive: true }); fs.mkdirSync(options.data, { recursive: true });
  const handlers = { recovery: () => recovery(m, options.workspace, options.data, options.python, options.git),
    verification: () => verification(m, options.workspace, options.data, options.python),
    instructions: () => instructions(m, options.workspace, options.data), context: () => context(m, options.workspace, options.data),
    audit: () => auditFailure(m, options.workspace, options.data), provider: () => provider(m, options.workspace) };
  const observation = await handlers[kind]();
  return { kind, observation, passed: matches(kind, observation), evidenceLevel: 'ACTUAL_PRODUCT_RUNTIME_OBSERVATION',
    host: { platform: process.platform, release: require('os').release(), arch: process.arch } };
}
module.exports = { run, matches };

/**
 * A5 - 开发机确定性测试（终端专属）
 *
 * 覆盖：
 *   - VTFilter：N02/N03/N04 剥离、安全序列透传、跨 chunk 缓冲、N05 有界处理
 *   - TerminalSession：状态机、用户输入写入、模型事件结构性零写入（N01）
 *   - a5-terminal-host：plain-node 传输下的通道隔离（N01 进程级）
 *   - manifest：从 D-011 ZIP 只读生成内部清单并核对原生哈希
 *   - 静态断言：N01 模型路径无 pty 写调用；N06 无 taskkill
 *   - runSuite 集成：T01-T04 DEVELOPMENT_PASS / T05 NOT_PERFORMED / N01-N06 PASS
 *
 * 运行：node test/a5-terminal-tests.js
 * 结果：全部 PASS 退出码 0；任一 FAIL 退出码 1。
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const HERE = __dirname;                          // .../spikes/02-terminal-containment/test
const SPIKE_ROOT = path.resolve(HERE, '..');
const A5 = path.join(SPIKE_ROOT, 'acceptance', 'a5');
const DEFAULT_ZIP = '/Users/qlyf/Developer/win7-coding-Agent/WIN7_NATIVE_ARTIFACTS_20260806-160514.zip';

const { VTFilter } = require(path.join(SPIKE_ROOT, 'winpty', 'filter'));
const { TerminalSession, INPUT_MODE, STATE } = require(path.join(SPIKE_ROOT, 'winpty', 'terminal_session'));
const { MockPtyModule } = require(path.join(A5, 'a5-mock-pty'));
const { runSuite, InProcessDriver } = require(path.join(A5, 'a5-terminal-harness'));

const ESC = '\x1b';
const BEL = '\x07';
const ST = ESC + '\\';
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');

let passCount = 0;
let failCount = 0;
const tests = [];

function ok(name, condition, detail = '') {
  if (condition) {
    passCount += 1;
    console.log(`  PASS ${name}${detail ? ` — ${detail}` : ''}`);
  } else {
    failCount += 1;
    console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function test(name, fn) {
  tests.push({ name, fn: async () => fn() });
}

function testAsync(name, fn) {
  tests.push({ name, fn });
}

// ─── 1. VTFilter 单元 ─────────────────────────────────────────────────────────

test('N02: OSC52 (BEL 与 ST 终止) 被剥离', () => {
  const f = new VTFilter();
  const out = f.filter(`\x1b]52;c;${b64('secret')}${BEL}plain\x1b]52;c;${b64('secret2')}${ST}`);
  assert.strictEqual(out, 'plain');
  ok('osc52-bel-stripped', !out.includes(b64('secret')));
  ok('osc52-st-stripped', !out.includes(b64('secret2')));
  ok('text-preserved', out === 'plain');
  assert.ok(f.getStats().osc52Count >= 2);
});

test('N02: OSC52 读取请求 (?) 被剥离', () => {
  const f = new VTFilter();
  const out = f.filter(`\x1b]52;c;?${BEL}`);
  assert.strictEqual(out, '');
  assert.ok(f.getStats().osc52Count >= 1);
});

test('N03: 窗口标题 OSC 0/2 被剥离', () => {
  const f = new VTFilter();
  const out = f.filter(`x\x1b]0;Malicious${BEL}y\x1b]2;phishing${ST}z`);
  assert.strictEqual(out, 'xyz');
  assert.ok(f.getStats().windowTitleCount >= 2);
});

test('N04: DECRQSS / DA / DSR / CPR 被剥离且不回写', () => {
  const f = new VTFilter();
  const out = f.filter(`\x1bP$q r${ST} \x1b[c \x1b[>c \x1b[=c \x1b[5n \x1b[6n \x1b[?6n`);
  assert.strictEqual(out.trim(), '');
  assert.ok(f.getStats().decrqssCount >= 1);
  assert.ok(f.getStats().deviceAnswerCount >= 6);
});

test('N02/N03 强化：前导零 OSC 编号（\\x1b]052 / \\x1b]000）同样被剥离', () => {
  const f = new VTFilter();
  const out = f.filter(`\x1b]052;c;${b64('x')}${BEL}\x1b]000;Title${BEL}\x1b]10;#ff0000${BEL}`);
  assert.ok(!out.includes(b64('x')));
  assert.ok(!out.includes('Title'));
  assert.ok(out.includes('\x1b]10;#ff0000'), 'OSC 10（前景色）应透传');
  assert.ok(f.getStats().osc52Count >= 1 && f.getStats().windowTitleCount >= 1);
});

test('N04 强化：带参数的 DA 查询（\\x1b[>0c / \\x1b[>1;2c / \\x1b[=1c）被剥离', () => {
  const f = new VTFilter();
  const out = f.filter(`\x1b[>0c \x1b[>1;2c \x1b[=1c`);
  assert.strictEqual(out.trim(), '');
  assert.ok(f.getStats().deviceAnswerCount >= 3);
});

test('安全 VT 序列透传（颜色/清屏/alt-screen/光标）', () => {
  const f = new VTFilter();
  const input = `\x1b[31mred\x1b[0m\x1b[2J\x1b[H\x1b[?1049h alt \x1b[?1049l\x1b[1;1H done`;
  const out = f.filter(input);
  assert.ok(out.includes('\x1b[31m'));
  assert.ok(out.includes('\x1b[?1049h'));
  assert.ok(out.includes('\x1b[?1049l'));
  assert.ok(out.includes('\x1b[2J'));
  assert.ok(out.includes('done'));
  assert.strictEqual(f.getStats().otherStripCount, 0);
});

test('跨 chunk：部分转义序列缓冲后判定', () => {
  const f = new VTFilter();
  assert.strictEqual(f.filter(`\x1b]52;c;${b64('x')}`), ''); // 无终止符 → 缓冲
  assert.strictEqual(f.filter(BEL), '');                       // 终止后剥离
  assert.ok(f.getStats().osc52Count >= 1);
});

test('跨 chunk：安全序列缓冲后透传', () => {
  const f = new VTFilter();
  assert.strictEqual(f.filter('a\x1b[31'), 'a');               // 'a' 已输出，部分 CSI → 缓冲
  assert.strictEqual(f.filter('m'), '\x1b[31m');               // 终止后透传（本次调用仅输出序列）
  assert.strictEqual(f.filter(''), '');
});

test('N05: 超长序列被整段剥离且不挂起', () => {
  const f = new VTFilter();
  const start = Date.now();
  const out = f.filter(`\x1b]52;c;${'A'.repeat(20000)}${BEL}`);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 1000, `elapsed ${elapsed}ms`);
  assert.ok(f.getStats().overlongCount >= 1);
  assert.ok(out.length < 20000); // 危险前缀已剥离，不整体泄漏为控制序列
});

test('N05: 深层嵌套序列被有界剥离', () => {
  const f = new VTFilter();
  const out = f.filter(`\x1b]52;c;${'A'.repeat(1000)}${ESC.repeat(100)}${BEL}`);
  assert.ok(f.getStats().nestedCount >= 1);
  assert.ok(!out.includes('\x1b]52'));
});

test('N05: 10 万条 OSC52 有界处理（不挂起、计数完整）', () => {
  const f = new VTFilter();
  const start = Date.now();
  f.filter(`\x1b]52;c;QQ==${BEL}`.repeat(100000));
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2000, `elapsed ${elapsed}ms`);
  assert.ok(f.getStats().osc52Count >= 100000);
});

test('N05: 超长纯文本 chunk 有界输出', () => {
  const f = new VTFilter();
  const start = Date.now();
  const out = f.filter('x'.repeat(5 * 1024 * 1024));
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2000, `elapsed ${elapsed}ms`);
  assert.ok(out.length <= 1 * 1024 * 1024, `out ${out.length}`);
  assert.ok(f.getStats().boundedCount >= 1);
});

test('flush() 剥离未终止危险前缀并返回惰性文本', () => {
  const f = new VTFilter();
  f.filter('abc\x1b]52;c;');
  assert.strictEqual(f.flush(), '', '未终止 OSC52 前缀被剥离');
  const g = new VTFilter();
  g.filter('abc\x1b[31');
  assert.strictEqual(g.flush(), '\x1b[31', '惰性 CSI 部分原样返回');
});

// ─── 2. TerminalSession 状态机 / N01 ──────────────────────────────────────────

testAsync('会话状态机 idle→running→closed 与用户输入写入', async () => {
  MockPtyModule.reset();
  const s = new TerminalSession({ shell: 'cmd.exe', inputMode: INPUT_MODE.USER_ONLY, ptyModule: MockPtyModule });
  assert.strictEqual(s.state, STATE.IDLE);
  await s.start();
  assert.strictEqual(s.state, STATE.RUNNING);
  assert.ok(s.isActive);
  const mock = MockPtyModule.last;
  assert.ok(mock, 'mock pty 已创建');
  s.sendUserInput('echo hi\r');
  assert.deepStrictEqual(mock.recordedWrites, ['echo hi\r']);
  s.resize(100, 40);
  assert.deepStrictEqual(mock.resizeLog, [[100, 40]]);
  await s.stop();
  assert.strictEqual(s.state, STATE.CLOSED);
  assert.ok(mock.killed);
});

testAsync('N01: 模型事件结构性零写入 pty', async () => {
  MockPtyModule.reset();
  const s = new TerminalSession({ shell: 'cmd.exe', inputMode: INPUT_MODE.USER_ONLY, ptyModule: MockPtyModule });
  await s.start();
  const mock = MockPtyModule.last;
  const blocked = [];
  s.on('security:blocked', (e) => blocked.push(e));

  const attempts = [
    { type: 'model-output', event: 'stdin-write', data: 'evil' },
    { type: 'model-output', event: 'stdin', data: 'evil' },
    { type: 'write', event: 'stdin', data: 'evil' },
    { type: 'user-input', data: 'evil-on-model-channel' },
    { event: 'send-keys', data: '\x1b]52;c;ZXZpbA==\x07' },
  ];
  for (const a of attempts) s.handleModelEvent(a);

  assert.strictEqual(mock.recordedWrites.length, 0, '模型侧不得写入 pty');
  assert.ok(blocked.length >= attempts.length, `blocked=${blocked.length}`);
  assert.ok(blocked.every((e) => e.reason === 'NO_STDIN_CHANNEL'));
  await s.stop();
});

testAsync('N02-N04: 会话输出经过滤器剥离危险序列', async () => {
  MockPtyModule.reset();
  const s = new TerminalSession({ shell: 'cmd.exe', inputMode: INPUT_MODE.USER_ONLY, ptyModule: MockPtyModule });
  await s.start();
  const mock = MockPtyModule.last;
  let out = '';
  s.on('output', (e) => { out += e.data; });
  mock.emitData(`ok\x1b]52;c;${b64('secret')}${BEL}\x1b]0;Title${BEL}\x1bP$q m${ST}end`);
  assert.ok(out.includes('ok') && out.includes('end'));
  assert.ok(!out.includes(b64('secret')));
  assert.ok(!out.includes('Title'));
  assert.ok(!out.includes('\x1bP$q'));
  assert.ok(s.stats.osc52Count >= 1 && s.stats.windowTitleCount >= 1 && s.stats.decrqssCount >= 1);
  await s.stop();
});

// ─── 3. a5-terminal-host 传输 / 进程级 N01 ────────────────────────────────────

function spawnHost() {
  const child = spawn(process.execPath, [path.join(A5, 'a5-terminal-host.js')], {
    env: { ...process.env, A5_PTY_MODULE: 'mock' },
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  const lines = [];
  const waiters = [];
  const rl = require('readline').createInterface({ input: child.stdout });
  rl.on('line', (line) => {
    if (!line.trim()) return;
    const msg = JSON.parse(line);
    const i = waiters.findIndex((w) => w.predicate(msg));
    if (i !== -1) {
      const [w] = waiters.splice(i, 1);
      w.resolve(msg);
    } else {
      lines.push(msg);
    }
  });
  return {
    child,
    send(msg) { child.stdin.write(`${JSON.stringify(msg)}\n`); },
    waitFor(predicate, timeoutMs = 8000) {
      const existing = lines.findIndex(predicate);
      if (existing !== -1) return Promise.resolve(lines.splice(existing, 1)[0]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('host wait timeout')), timeoutMs);
        waiters.push({ predicate, resolve: (m) => { clearTimeout(timer); resolve(m); } });
      });
    },
  };
}

testAsync('host 传输：来源校验 + 模型通道 blocked + 用户通道写入 + 关闭后不崩溃', async () => {
  const h = spawnHost();
  await h.waitFor((m) => m.type === 'host:ready');

  // 无受信来源的 session:start 被拒
  h.send({ type: 'session:start', session: { shell: 'cmd.exe' } });
  const deniedStart = await h.waitFor((m) => m.type === 'security:blocked');
  assert.strictEqual(deniedStart.reason, 'UNTRUSTED_ORIGIN');

  // 受信来源启动
  h.send({ type: 'session:start', source: 'system', session: { shell: 'cmd.exe', cols: 80, rows: 24 } });
  const started = await h.waitFor((m) => m.type === 'session:started');
  assert.ok(started.sessionId);

  // 无来源的 user-input 被拒（N01 进程级：非 user 来源结构性不能写 stdin）
  h.send({ type: 'user-input', data: 'evil-without-source\r' });
  const blockedNoSource = await h.waitFor((m) => m.type === 'security:blocked' && m.reason === 'NO_STDIN_CHANNEL');
  assert.ok(blockedNoSource);

  // 模型通道写尝试 → blocked
  h.send({ type: 'model-event', event: 'stdin-write', data: 'evil' });
  const blockedModel = await h.waitFor((m) => m.type === 'security:blocked' && m.reason === 'NO_STDIN_CHANNEL');
  assert.ok(blockedModel);

  h.send({ type: 'introspect' });
  const afterBlocked = await h.waitFor((m) => m.type === 'introspect');
  assert.strictEqual(afterBlocked.ptyWriteCount, 0, '被拒写尝试后 pty 写入必须为 0');

  // 用户来源写入 → 计数 +1 且记录内容
  h.send({ type: 'user-input', source: 'user', data: 'echo hi\r' });
  h.send({ type: 'introspect' });
  const afterUser = await h.waitFor((m) => m.type === 'introspect');
  assert.strictEqual(afterUser.ptyWriteCount, 1);
  assert.deepStrictEqual(afterUser.ptyWrites, ['echo hi\r']);

  // 会话关闭后的 user-input 不得崩溃宿主（try/catch → host:error）
  h.send({ type: 'session:stop' });
  await h.waitFor((m) => m.type === 'session:stopped');
  h.send({ type: 'user-input', source: 'user', data: 'after-exit\r' });
  const hostErr = await h.waitFor((m) => m.type === 'host:error');
  assert.ok(/会话未运行|closed/.test(hostErr.message), `got: ${hostErr.message}`);

  h.send({ type: 'shutdown' });
});

// ─── 4. manifest 只读生成 ─────────────────────────────────────────────────────

test('manifest：D-011 ZIP 只读生成，原生哈希与锁定值匹配', () => {
  const { generateManifest } = require(path.join(A5, 'a5-manifest'));
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'a5-manifest-test-'));
  const { manifest } = generateManifest({ zipPath: DEFAULT_ZIP, spikeRoot: SPIKE_ROOT, outDir, revision: 'A5-test-manifest' });
  assert.strictEqual(manifest.source_zip.match, true);
  assert.ok(manifest.native_lock.every((n) => n.match === true), JSON.stringify(manifest.native_lock));
  assert.ok(manifest.candidate_runtime.files.some((f) => f.path === 'build/Release/pty.node'));
  assert.strictEqual(manifest.source_zip.readonly, true);
  // 原始 ZIP 未被改动：外层哈希仍等于锁定值
  const { execFileSync } = require('child_process');
  const now = execFileSync('shasum', ['-a', '256', DEFAULT_ZIP], { encoding: 'utf8' }).split(' ')[0];
  assert.strictEqual(now, 'c938f115c242bf37ec364070ad9b80df173cacd43fd3df9db84aa13126f346ea');
});

// ─── 5. 静态断言 ──────────────────────────────────────────────────────────────

test('N01 静态：模型处理器路径无 pty 写调用', () => {
  const { assertNoStdinWriteInModelPath } = require(path.join(A5, 'a5-terminal-harness'));
  const check = assertNoStdinWriteInModelPath(SPIKE_ROOT);
  assert.ok(check.ok, check.detail);
});

test('N06 静态：A5 终端路径无 taskkill 执行调用', () => {
  const { assertNoTaskkill } = require(path.join(A5, 'a5-terminal-harness'));
  const check = assertNoTaskkill(SPIKE_ROOT);
  assert.ok(check.ok, check.detail);
});

// ─── 6. runSuite 集成 ─────────────────────────────────────────────────────────

testAsync('runSuite dev 集成：T01-T04 DEVELOPMENT_PASS / T05 NOT_PERFORMED / N01-N06 PASS', async () => {
  const driver = new InProcessDriver();
  const result = await runSuite({ driver, sourceRoot: SPIKE_ROOT, helperPath: '' });
  const byId = Object.fromEntries(result.cases.map((c) => [c.id, c]));
  for (const id of ['T01', 'T02', 'T03', 'T04']) {
    assert.strictEqual(byId[id].status, 'DEVELOPMENT_PASS', `${id} 应 DEVELOPMENT_PASS`);
  }
  assert.strictEqual(byId.T05.status, 'NOT_PERFORMED', 'T05 应 NOT_PERFORMED（D-013 helper 缺席）');
  for (const id of ['N01', 'N02', 'N03', 'N04', 'N05', 'N06']) {
    assert.strictEqual(byId[id].status, 'PASS', `${id} 应 PASS`);
  }
  assert.ok(!result.cases.some((c) => c.status === 'FAIL'));
});

// ─── 汇总（顺序执行，避免并发竞态）─────────────────────────────────────────────

(async () => {
  for (const t of tests) {
    try {
      await t.fn();
      passCount += 1;
      console.log(`PASS ${t.name}`);
    } catch (error) {
      failCount += 1;
      console.error(`FAIL ${t.name}: ${error.message}`);
    }
  }
  console.log('');
  console.log(`A5 开发机测试汇总: PASS=${passCount} FAIL=${failCount}`);
  process.exit(failCount === 0 ? 0 : 1);
})();

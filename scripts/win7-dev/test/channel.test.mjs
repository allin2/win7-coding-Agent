import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ROOT, DevChannel, configuration, parseArgs, remotePath, splitCommand, uploadTimeout,
  checkCapacity, developmentRootLimit, secretCategories, scanAndPlace, powershellInput, zipManifest, main } from '../win7-dev.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outRoot = path.resolve(here, '../../../outputs/win7-dev');
fs.mkdirSync(outRoot, { recursive: true });
const suite = fs.mkdtempSync(path.join(outRoot, 'unit-'));
let sequence = 0;
const dir = () => { const p = path.join(suite, String(++sequence)); fs.mkdirSync(p); return p; };
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const now = () => new Date('2026-10-21T08:00:00Z');
const wire = (data) => Buffer.from(JSON.stringify({ evidence_class: 'DEV_CHANNEL', ok: true, ...data }) + '\n');
function decodeD(input) {
  const result = {};
  for (const m of input.toString().matchAll(/'([a-z_][a-z0-9_]*)'=\[Text.Encoding\]::UTF8.GetString\(\[Convert\]::FromBase64String\('([^']*)'\)\)/g)) result[m[1]] = Buffer.from(m[2], 'base64').toString('utf8');
  return result;
}
// The only spawn supplied by every controller test. No transport executable runs.
function fakeTransport({ conflict = false, disk = false, failStep, failCode = 7, stderr = Buffer.from([0, 255, 10]), reuse = false, runExit = 0, wrongHash = false, failDownload = false } = {}) {
  const calls = []; const files = new Map(); let lock = null;
  const spawn = (exe, argv, options) => {
    const child = new EventEmitter(); child.stdin = new PassThrough(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
    child.kill = () => { child.emit('close', null, 'SIGKILL'); return true; };
    const chunks = []; child.stdin.on('data', (chunk) => chunks.push(chunk));
    child.stdin.on('finish', () => queueMicrotask(() => {
      const input = Buffer.concat(chunks); const d = decodeD(input); const call = { exe, argv, options, input, d }; calls.push(call);
      let result = wire({}); let code = 0; let error = null;
      if (exe === '/usr/bin/ssh') {
        const step = d.operation;
        if (step === failStep) { code = failCode; result = Buffer.from([0, 254, 65]); }
        else if (step === 'acquire') {
          if ((conflict || lock) && d.steal !== 'true') error = 'LOCK_CONFLICT';
          else lock = { holder: d.holder, token: d.token };
        } else if (step === 'release') { lock = null; }
        else if (step === 'status') result = wire({ hostname: 'DCCS-CHAIZL-PC', build: '7601', root_exists: true, free_bytes: 100e9, root_bytes: 0, lock });
        else if (['prepare-put', 'cand-probe'].includes(step)) {
          if (disk) error = 'DISK_LIMIT';
          else if (step === 'cand-probe') result = wire({ archive_exists: reuse });
        } else if (step === 'commit-put') files.set(d.path, files.get(d.stage));
        else if (step === 'cand-expand') result = wire({ directory: `${d.path}\\expanded`, sha256: d.sha256 });
        else if (step === 'get-info') {
          const bytes = files.get(d.path);
          if (!bytes) error = 'REMOTE_FILE_REQUIRED'; else result = wire({ bytes: bytes.length, sha256: wrongHash ? sha('wrong') : sha(bytes) });
        } else if (step === 'agent-run') {
          const base = `${ROOT}\\runs\\${d.name}`;
          for (const [name, content] of Object.entries({ 'stdout.bin': 'hello\n', 'stderr.bin': '', 'exit-code.txt': String(runExit), 'identity.json': '{"evidence_class":"DEV_CHANNEL","sid":"agent","session":1}' })) files.set(`${base}\\${name}`, Buffer.from(content));
          result = wire({ completed: true, exit_code: runExit, task_deleted: true });
        }
        if (error) { code = 1; result = wire({ ok: false, error }); }
      } else {
        assert.equal(exe, '/usr/bin/sftp');
        const m = /^(put|get) "((?:\\.|[^"\\])*)" "((?:\\.|[^"\\])*)"\n$/.exec(input.toString());
        assert.ok(m, 'one escaped SFTP operation per batch');
        const unquote = (s) => s.replace(/\\([\\"])/g, '$1').replace(/\\([?*\[\]])/g, '$1');
        const a = unquote(m[2]); const b = unquote(m[3]);
        if (m[1] === 'put') files.set(b.replaceAll('/', '\\'), fs.readFileSync(a));
        else { const bytes = files.get(a.replaceAll('/', '\\')); assert.ok(bytes); fs.writeFileSync(b, bytes); if (failDownload) code = 1; }
      }
      child.stdout.end(result); child.stderr.end(code ? stderr : Buffer.alloc(0)); child.emit('close', code, null);
    }));
    return child;
  };
  return { spawn, calls, files };
}
function controller(options = {}) { const fake = fakeTransport(options); const out = dir(); return { ...fake, out, channel: new DevChannel({ spawn: fake.spawn, env: { WIN7_DEV_IDENTITY: path.join(out, 'mock-identity') }, now, out }) }; }
function fixtureZip(filename, entry = 'a.txt', content = 'hello', { localName = entry, attributes = 0 } = {}) {
  const name = Buffer.from(entry); const ln = Buffer.from(localName); const bytes = Buffer.from(content);
  const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x800, 6);
  local.writeUInt32LE(bytes.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(ln.length, 26);
  const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 6); central.writeUInt16LE(0x800, 8);
  central.writeUInt32LE(bytes.length, 20); central.writeUInt32LE(bytes.length, 24); central.writeUInt16LE(name.length, 28); central.writeUInt32LE(attributes, 38);
  const end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10);
  end.writeUInt32LE(central.length + name.length, 12); end.writeUInt32LE(local.length + ln.length + bytes.length, 16);
  fs.writeFileSync(filename, Buffer.concat([local, ln, bytes, central, name, end]));
}

test('A9-43 capacity exception is bounded by exact holder, window, incoming size and free space', () => {
  const holder = 'a942-751c-7f41ca1c', start = Date.parse('2026-10-30T15:55:13.975Z'), end = Date.parse('2026-10-30T18:56:32.708Z');
  const scope = { holder, now: start };
  assert.equal(developmentRootLimit(holder, start), 24e9);
  assert.equal(developmentRootLimit(holder, end - 1), 24e9);
  for (const [h, at] of [['other', start], [holder.toUpperCase(), start], [holder, start - 1], [holder, end], [holder, NaN]]) {
    assert.equal(developmentRootLimit(h, at), 20e9);
    assert.throws(() => checkCapacity(100e9, 20e9 + 1, 0, { holder: h, now: at }), /DISK_LIMIT/);
  }
  checkCapacity(100e9, 23e9, 1e9, scope);
  for (const values of [[100e9, 24e9, 1], [100e9, 24e9 + 1, 0], [50e9, 0, 1], [50e9 - 1, 0, 0]]) {
    assert.throws(() => checkCapacity(...values, scope), /DISK_LIMIT/);
  }
});

test('eight commands parse, options retain one command-line argument', () => {
  for (const argv of [['status'], ['put', 'file', 'a/b'], ['get', 'a', 'b/c'], ['ps', 's.ps1'], ['cand', 'a.zip'], ['close'], ['agent-run', 'smoke', '"C:\\A9-DEV\\中文 空格\\p.exe" "a b"', '--wait', '15', '--steal']]) assert.equal(parseArgs(argv).command, argv[0]);
  assert.equal(parseArgs(['stop', '--run', '3f1c2a52-6b0e-4c1e-9f5e-0d7b8a1c2e44']).command, 'stop');
  assert.deepEqual(parseArgs(['agent-run', 'n', 'C:\\A9-DEV\\p.exe', '--wait', '15', '--steal']).wait, 15);
});
test('invalid CLI counts, options, run names and wait values fail before spawning', async () => {
  const { channel, calls } = controller();
  for (const argv of [[], ['status', 'x'], ['get', 'x'], ['status', '--steal'], ['stop'], ['stop', '--run', 'not-a-run'], ['stop', '--run', '3f1c2a52-6b0e-4c1e-9f5e-0d7b8a1c2e44', '--steal', '--steal'], ['ps', 'x', '--wait', '1'], ['agent-run', '../x', 'C:\\A9-DEV\\a.exe'], ['agent-run', 'n', 'C:\\A9-DEV\\a.exe', '--wait', '0'], ['agent-run', 'n', 'C:\\A9-DEV\\a.exe', '--wait', '90000'], ['cand', 'x', '--unknown']]) await assert.rejects(() => channel.execute(argv));
  assert.equal(calls.length, 0);
});
test('remote paths support Chinese, spaces, percent, hash and both separators', () => {
  assert.equal(remotePath('中文 空格/a%#b.txt'), 'C:\\A9-DEV\\中文 空格\\a%#b.txt');
  assert.equal(remotePath('safe\\p.exe'), 'C:\\A9-DEV\\safe\\p.exe');
});
test('all traversal, drives, UNC, case variants, ADS and Windows aliases reject without connections', async () => {
  const { channel, calls } = controller();
  for (const p of ['..\\escape', '../escape', 'a/../../escape', 'a\\..\\..\\escape', 'C:\\outside', 'c:/a9-dev/../Windows/a', 'C:\\A9-DEVIL\\x', 'D:relative', '\\\\server\\share\\x', '//server/share/x', '\\Windows\\x', '/Windows/x', 'a:x', 'NUL.txt', 'a.\\x', 'a \\x', 'LOCK', 'lOcK/a', '.CHANNEL/x', 'a\nput x y', 'x'.repeat(240)]) {
    await assert.rejects(() => channel.execute(['get', p, 'safe']), undefined, p);
  }
  assert.equal(calls.length, 0);
});
test('local download escape, reserved evidence paths and links reject before connections', async () => {
  const { channel, calls, out } = controller();
  for (const p of ['../x', '/tmp/x', 'a/../../x', 'a\\..\\x', 'C:/x', 'ledger.tsv', 'actions/x', 'quarantine/x', '.incoming/x']) await assert.rejects(() => channel.execute(['get', 'safe', p]));
  fs.symlinkSync(dir(), path.join(out, 'linked'));
  await assert.rejects(() => channel.execute(['get', 'safe', 'linked/x']), /LOCAL_REPARSE_POINT/);
  assert.equal(calls.length, 0);
});
test('agent executable must be inside root, arguments retain Windows quoting', () => {
  assert.deepEqual(splitCommand('"c:\\a9-dev\\中文 空格\\a.exe" --x "hello world"'), { executable: 'C:\\A9-DEV\\中文 空格\\a.exe', arguments: '--x "hello world"' });
  for (const cmd of ['cmd.exe /c echo x', 'C:\\Windows\\cmd.exe', 'C:\\A9-DEVIL\\x.exe', 'C:\\A9-DEV\\..\\x.exe', 'C:\\A9-DEV\\x.ps1']) assert.throws(() => splitCommand(cmd));
});
test('SSH argv exactly reuses reference options and stdin ends in a blank line', async () => {
  const { channel, calls } = controller(); channel.config = configuration({}); await channel.execute(['status']);
  // Frozen contract copied from run-rehearsal.cjs:9-13; no ignored-file dependency.
  const expected = ['-F', '/dev/null', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', 'UserKnownHostsFile=/Users/qlyf/Developer/win7-coding-Agent/.acceptance/ssh/known_hosts_win7', '-o', 'HostKeyAlias=192.168.1.11',
    '-o', 'ConnectTimeout=20', '-o', 'ConnectionAttempts=1', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=6',
    '-i', '/Users/qlyf/Developer/win7-coding-Agent/.acceptance/ssh/id_rsa_win7accept'];
  assert.deepEqual(configuration({}).options, expected);
  assert.deepEqual(calls[0].argv, [...expected, 'dccs-chaizl@192.168.1.5', 'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command -']);
  assert.equal(calls[0].exe, '/usr/bin/ssh'); assert.ok(calls[0].input.toString().endsWith('}\n\n'));
  assert.equal(calls[0].options.shell, false); assert.equal(calls[0].options.timeout, 600000);
  assert.ok(!calls[0].argv.join(' ').includes('EncodedCommand'));
});
test('environment overrides only transport bindings and holder, never strict checks', () => {
  const c = configuration({ WIN7_DEV_HOST: '192.168.1.3', WIN7_DEV_USER: 'u', WIN7_DEV_IDENTITY: '/tmp/key', WIN7_DEV_KNOWN_HOSTS: '/tmp/known', WIN7_DEV_HOST_KEY_ALIAS: '192.168.1.11', WIN7_DEV_HOLDER: 'worker-1' });
  assert.equal(c.host, 'u@192.168.1.3'); assert.equal(c.holder, 'worker-1');
  assert.ok(c.options.includes('StrictHostKeyChecking=yes')); assert.ok(c.options.includes('/tmp/key')); assert.ok(c.options.includes('UserKnownHostsFile=/tmp/known'));
  assert.throws(() => configuration({ WIN7_DEV_HOST: '-oProxyCommand=bad' }));
  assert.throws(() => configuration({ WIN7_DEV_HOST_KEY_ALIAS: 'other-host' }), /SSH_ALIAS_NOT_AUTHORIZED/);
});
test('success ledger and raw evidence retain exact bytes per remote action', async () => {
  const { channel, out } = controller(); const result = await channel.execute(['status']); assert.equal(result.evidence_class, 'DEV_CHANNEL');
  const rows = fs.readFileSync(path.join(out, 'ledger.tsv'), 'utf8').trim().split('\n'); assert.equal(rows.length, 2);
  const columns = rows[1].split('\t'); assert.equal(columns[2], 'status'); assert.equal(columns[4], '0');
  const action = path.join(out, columns[7]); assert.deepEqual(fs.readFileSync(path.join(action, 'stderr.bin')), Buffer.alloc(0));
  assert.equal(JSON.parse(fs.readFileSync(path.join(action, 'result.json'))).exit_code, 0);
});
test('failed transport still writes raw stdin/stdout/stderr and exit code ledger', async () => {
  const { channel, out } = controller({ failStep: 'status' }); await assert.rejects(() => channel.execute(['status']), /TRANSPORT_FAILED/);
  const row = fs.readFileSync(path.join(out, 'ledger.tsv'), 'utf8').trim().split('\n')[1].split('\t'); assert.equal(row[4], '7');
  const action = path.join(out, row[7]); assert.deepEqual(fs.readFileSync(path.join(action, 'stdout.bin')), Buffer.from([0, 254, 65]));
  assert.deepEqual(fs.readFileSync(path.join(action, 'stderr.bin')), Buffer.from([0, 255, 10])); assert.ok(fs.statSync(path.join(action, 'stdin.bin')).size > 0);
});
test('synchronous spawn failure is recorded without attempting a second action', async () => {
  const out = dir(); const c = new DevChannel({ env: {}, now, out, spawn: () => { throw Error('not executable'); } });
  await assert.rejects(() => c.execute(['status']), /TRANSPORT_FAILED/);
  assert.match(fs.readFileSync(path.join(out, 'ledger.tsv'), 'utf8'), /\t127\t/);
});
test('lock conflict stops writer before any SFTP; explicit steal proceeds', async () => {
  const a = controller({ conflict: true }); const f = path.join(a.out, 'input'); fs.writeFileSync(f, 'hello');
  await assert.rejects(() => a.channel.execute(['put', f, 'target']), /LOCK_CONFLICT/); assert.equal(a.calls.length, 1); assert.equal(a.calls[0].d.operation, 'acquire');
  const b = controller({ conflict: true }); await b.channel.execute(['put', f, 'target', '--steal']);
  assert.equal(b.calls[0].d.steal, 'true'); assert.equal(b.calls.at(-1).d.operation, 'release');
});
test('upload uses same options, quoted SFTP batch, byte ledger and root staging', async () => {
  const { channel, calls, out, files } = controller(); const input = path.join(out, '中文 空格 "%.txt'); fs.writeFileSync(input, 'hello');
  await channel.execute(['put', input, "中文 空格/a'#%.txt"]);
  const sftp = calls.find((c) => c.exe === '/usr/bin/sftp');
  assert.deepEqual(sftp.argv, [...channel.config.options, '-q', '-b', '-', channel.config.host]); assert.equal(sftp.options.timeout, 600000);
  assert.match(sftp.input.toString(), /C:\/A9-DEV\/\.channel\/upload-/);
  assert.equal(files.get("C:\\A9-DEV\\中文 空格\\a'#%.txt").toString(), 'hello');
  assert.match(fs.readFileSync(path.join(out, 'ledger.tsv'), 'utf8'), /"step":"upload"[^\n]*\t0\t5\t0\t/);
});
test('upload timeout computes max(600, ceil(bytes/200000))', () => {
  for (const [bytes, seconds] of [[0, 600], [120000000, 600], [120000001, 601], [200000000, 1000]]) assert.equal(uploadTimeout(bytes), seconds);
  assert.throws(() => uploadTimeout(-1));
});
test('SFTP paths quote literal glob characters rather than expanding filenames', async () => {
  const { channel, out, files, calls } = controller(); const file = path.join(out, '[literal]*?.txt'); fs.writeFileSync(file, 'literal');
  await channel.execute(['put', file, 'a[1].txt']);
  await channel.execute(['get', 'a[1].txt', 'downloaded.txt']);
  assert.equal(files.get(`${ROOT}\\a[1].txt`).toString(), 'literal'); assert.equal(fs.readFileSync(path.join(out, 'downloaded.txt'), 'utf8'), 'literal');
  assert.ok(calls.find((c) => c.exe === '/usr/bin/sftp').input.toString().includes('\\\\['));
});
test('capacity boundaries reject insufficient free, excessive root and unknown values', () => {
  checkCapacity(50e9, 20e9); checkCapacity(60e9, 0, 1e9);
  for (const values of [[50e9 - 1, 0], [60e9, 20e9 + 1], [50e9, 0, 1], [60e9, 20e9, 1], [null, 0], [NaN, 0]]) assert.throws(() => checkCapacity(...values));
});
test('disk-limit response rejects put and cand before uploading, then releases lock', async () => {
  for (const command of ['put', 'cand']) {
    const { channel, calls, out } = controller({ disk: true }); const file = path.join(out, 'a.zip'); fixtureZip(file);
    await assert.rejects(() => channel.execute(command === 'put' ? ['put', file, 'a'] : ['cand', file]), /DISK_LIMIT/);
    assert.ok(!calls.some((c) => c.exe === '/usr/bin/sftp')); assert.equal(calls.at(-1).d.operation, 'release');
  }
});
test('secret scanner covers four categories, case variants and UTF16/legacy text', () => {
  assert.deepEqual(secretCategories(Buffer.from('sk-' + 'a'.repeat(20))), ['sk-key']);
  assert.deepEqual(secretCategories(Buffer.from('sk-' + 'a'.repeat(19))), []);
  assert.deepEqual(secretCategories(Buffer.from('AUTHORIZATION: x API_KEY=x PaSsWoRd=x')), ['authorization', 'api_key', 'password']);
  assert.deepEqual(secretCategories(Buffer.from('password=hidden', 'utf16le')), ['password']);
  assert.deepEqual(secretCategories(Buffer.concat([Buffer.from([0x81, 0x40]), Buffer.from('api_key=x')])), ['api_key']);
});
test('get quarantines secrets without printing content, including .bin text files', async () => {
  const { channel, files, out, calls } = controller(); const secret = 'Authorization: private-value-that-must-not-print';
  files.set(`${ROOT}\\stdout.bin`, Buffer.from(secret));
  let error; try { await channel.execute(['get', 'stdout.bin', 'report.txt']); } catch (e) { error = e; }
  assert.equal(error.code, 'SECRET_QUARANTINED'); assert.deepEqual(error.details, { file: 'report.txt', categories: ['authorization'] });
  assert.ok(!JSON.stringify(error.details).includes('private-value')); assert.ok(!fs.existsSync(path.join(out, 'report.txt')));
  const quarantined = fs.readdirSync(path.join(out, 'quarantine')); assert.equal(quarantined.length, 1);
  assert.equal(fs.readFileSync(path.join(out, 'quarantine', quarantined[0]), 'utf8'), secret);
  assert.ok(!calls.some((c) => c.d.operation === 'acquire'));
});
test('clean get verifies size and hash, preserves bytes and records download', async () => {
  const { channel, files, out } = controller(); const bytes = Buffer.from([0, 1, 255]); files.set(`${ROOT}\\a.bin`, bytes);
  const result = await channel.execute(['get', 'a.bin', 'downloads/a.bin']);
  assert.deepEqual(fs.readFileSync(path.join(out, 'downloads/a.bin')), bytes); assert.equal(result.sha256, sha(bytes));
  assert.match(fs.readFileSync(path.join(out, 'ledger.tsv'), 'utf8'), /"step":"download"[^\n]*\t0\t0\t3\t/);
});
test('corrupt and failed partial downloads still quarantine secrets, never publish content', async () => {
  for (const options of [{ wrongHash: true }, { failDownload: true }]) {
    const { channel, files, out } = controller(options); files.set(`${ROOT}\\a.txt`, Buffer.from('password=must-stay-private'));
    await assert.rejects(() => channel.execute(['get', 'a.txt', 'a.txt']), /SECRET_QUARANTINED/);
    assert.ok(!fs.existsSync(path.join(out, 'a.txt'))); assert.equal(fs.readdirSync(path.join(out, 'quarantine')).length, 1);
    if (options.failDownload) assert.match(fs.readFileSync(path.join(out, 'ledger.tsv'), 'utf8'), /\t1\t0\tUNKNOWN\t/);
  }
});
test('streaming scanner catches patterns crossing block boundaries and UTF16 Chinese prefixes', () => {
  const out = dir(); const file = path.join(out, 'large'); const target = path.join(out, 'result');
  fs.writeFileSync(file, Buffer.concat([Buffer.alloc(65530, 32), Buffer.from('Authorization: private')]));
  assert.throws(() => scanAndPlace(file, target, out), /SECRET_QUARANTINED/);
  assert.deepEqual(secretCategories(Buffer.from('中文 开头 password=hidden', 'utf16le')), ['password']);
});
test('PowerShell payload uses an ASCII stdin envelope and decodes UTF8 script text', async () => {
  const { channel, calls, out } = controller(); const file = path.join(out, 'script.ps1'); const script = "Write-Output '中文 脚本'"; fs.writeFileSync(file, script, 'utf8');
  await channel.execute(['ps', file]);
  const input = calls.find((c) => c.d.operation === 'ps').input;
  assert.ok(input.every((b) => b < 128)); assert.ok(input.toString().includes(Buffer.from(script).toString('base64')));
  assert.ok(input.toString().includes('ScriptBlock]::Create')); assert.ok(input.toString().endsWith('}\n\n'));
});
test('configured private-key input and its hardlink alias reject without reading or spawning', async () => {
  const { channel, calls, out } = controller(); const key = path.join(out, 'mock-identity'); fs.writeFileSync(key, 'synthetic test fixture');
  const alias = path.join(out, 'alias'); fs.linkSync(key, alias);
  for (const file of [key, alias]) await assert.rejects(() => channel.execute(['put', file, 'a']), /PRIVATE_KEY_INPUT_FORBIDDEN/);
  assert.equal(calls.length, 0);
});
test('direct quarantine helper refuses overwriting evidence', () => {
  const out = dir(); const incoming = path.join(out, 'a'); const destination = path.join(out, 'b'); fs.writeFileSync(incoming, 'clean'); fs.writeFileSync(destination, 'old');
  assert.throws(() => scanAndPlace(incoming, destination, out), /LOCAL_DESTINATION_EXISTS/); assert.equal(fs.readFileSync(destination, 'utf8'), 'old');
});
test('candidate uses local SHA prefix and skips SFTP when remote hash is reused', async () => {
  for (const reuse of [true, false]) {
    const { channel, calls, out } = controller({ reuse }); const zip = path.join(out, 'p.zip'); fixtureZip(zip, '中文 空格/a.txt');
    const manifest = zipManifest(zip); assert.equal(manifest.unpacked, 5);
    const result = await channel.execute(['cand', zip]); const expected = sha(fs.readFileSync(zip));
    assert.equal(result.sha256, expected); assert.equal(result.upload_skipped, reuse);
    assert.equal(calls.filter((c) => c.exe === '/usr/bin/sftp').length, reuse ? 0 : 1);
    assert.equal(calls.find((c) => c.d.operation === 'cand-probe').d.path, `${ROOT}\\cand\\${expected.slice(0, 16)}`);
  }
});
test('ZIP traversal, local/central mismatch and symlinks reject before connections', async () => {
  const { channel, calls, out } = controller(); const zip = path.join(out, 'bad.zip');
  for (const [entry, options] of [['../escape', {}], ['C:/Windows/x', {}], ['safe', { localName: '../outside' }], ['link', { attributes: 0xa1ff0000 }]]) {
    fixtureZip(zip, entry, 'x', options); await assert.rejects(() => channel.execute(['cand', zip]));
  }
  assert.equal(calls.length, 0);
});
test('agent-run recovers three streams and identity, with nonzero exit still collected', async () => {
  for (const runExit of [0, 3]) {
    const { channel, calls, out } = controller({ runExit }); const work = channel.execute(['agent-run', 'smoke', 'C:\\A9-DEV\\app\\p.exe --echo hello', '--wait', '20']);
    if (runExit) await assert.rejects(() => work, /AGENT_EXIT_NONZERO/); else assert.equal((await work).task_deleted, true);
    assert.equal(fs.readFileSync(path.join(out, 'runs/smoke/exit-code.txt'), 'utf8'), String(runExit));
    assert.equal(calls.filter((c) => c.exe === '/usr/bin/sftp').length, 4); assert.equal(calls.at(-1).d.operation, 'release');
    const c = calls.find((c) => c.d.operation === 'agent-run'); const xml = Buffer.from(c.d.xml, 'base64').toString();
    assert.match(xml, /InteractiveToken/); assert.match(xml, /LeastPrivilege/); assert.match(xml, /A9-DEV-smoke/); assert.ok(!/[^\x00-\x7f]|\r|<\?xml/.test(xml));
    assert.equal(c.options.timeout, 80000);
  }
});
test('run-scoped stop releases lock; successful close does not reconnect to a deleted root', async () => {
  const run = '3f1c2a52-6b0e-4c1e-9f5e-0d7b8a1c2e44';
  const stopped = controller(); await stopped.channel.execute(['stop', '--run', run]);
  assert.deepEqual(stopped.calls.map((c) => c.d.operation), ['acquire', 'stop', 'release']);
  assert.equal(stopped.calls[1].d.run_root, 'C:\\A9-DEV\\run\\3f1c2a52');
  assert.equal(stopped.calls[1].d.task_prefix, 'A9-DEV-3f1c2a52-');
  const closed = controller(); await closed.channel.execute(['close']);
  assert.deepEqual(closed.calls.map((c) => c.d.operation), ['acquire', 'close']);
});
test('expired authority rejects writing before a connection, allows read-only status and scoped cleanup', async () => {
  const expiry = new Date('2026-11-28T00:00:00Z');
  const before = new DevChannel({ env: { WIN7_DEV_IDENTITY: path.join(dir(), 'mock-identity') }, spawn: fakeTransport().spawn,
    out: dir(), now: () => new Date(expiry.getTime() - 1) });
  const beforeFile = path.join(before.out, 'before.ps1'); fs.writeFileSync(beforeFile, "Write-Output 'hello'");
  assert.equal((await before.execute(['ps', beforeFile])).ok, true);
  const { spawn, calls } = fakeTransport(); const out = dir(); const c = new DevChannel({ env: { WIN7_DEV_IDENTITY: path.join(out, 'mock-identity') }, spawn, out, now: () => expiry });
  const file = path.join(out, 'script.ps1'); fs.writeFileSync(file, "Write-Output 'hello'");
  await assert.rejects(() => c.execute(['ps', file]), /AUTHORIZATION_EXPIRED/); assert.equal(calls.length, 0);
  await c.execute(['status']);
  await c.execute(['stop', '--run', '3f1c2a52-6b0e-4c1e-9f5e-0d7b8a1c2e44']);
  const stop = calls.find((call) => call.d.operation === 'stop');
  assert.equal(stop.d.run_prefix8, '3f1c2a52');
  assert.equal(stop.d.task_prefix, 'A9-DEV-3f1c2a52-');
  assert.ok(!calls.some((call) => call.d.operation === 'close'));
});
test('main errors always use DEV_CHANNEL and never expose runtime exception text', async () => {
  const result = await main(['status'], { env: {}, out: dir(), now, spawn: () => { throw Error('private'); } });
  assert.equal(result.evidence_class, 'DEV_CHANNEL'); assert.equal(result.ok, false); assert.ok(!JSON.stringify(result).includes('private'));
});
test('every generated PowerShell stdin ends with } and a blank line', () => {
  for (const file of fs.readdirSync(path.resolve(here, '../remote')).filter((s) => s.endsWith('.ps1'))) {
    assert.ok(powershellInput(file, { operation: 'test' }).toString().endsWith('}\n\n'), file);
  }
});
for (const file of fs.readdirSync(path.resolve(here, '../remote')).filter((s) => s.endsWith('.ps1'))) {
  test(`PS2 forbidden syntax scan: ${file}`, () => {
    const script = fs.readFileSync(path.resolve(here, '../remote', file), 'utf8');
    const forbidden = /\[ordered\]|\[pscustomobject\]|\b(?:Get-CimInstance|ConvertTo-Json|ConvertFrom-Json|Invoke-WebRequest|Invoke-RestMethod|Expand-Archive|Compress-Archive|Get-FileHash|Get-ChildItem\s+-File|ForEach-Object\s+-Parallel)\b|-(?:in|notin|Raw|File|Directory)\s|\?\?|\?\.|::new\s*\(|\$using:|#requires\s+-version\s+[3-9]/i;
    // -File in a task argument string is a PowerShell 2 executable option.
    const code = script.replace(/-File C:\\A9-DEV\\/g, 'SCRIPT C:\\A9-DEV\\');
    assert.equal(code.match(forbidden), null, file); assert.ok(!script.includes('\r')); assert.ok(!script.startsWith('\ufeff'));
  });
}
test('stop scope is current run only while the channel close command remains available', () => {
  const script = fs.readFileSync(path.resolve(here, '../remote/stop.ps1'), 'utf8');
  const wrapper = fs.readFileSync(path.resolve(here, '../remote/agent-wrapper.ps1'), 'utf8');
  const runner = fs.readFileSync(path.resolve(here, '../remote/agent-run.ps1'), 'utf8');
  assert.match(script, /Name\.StartsWith\(\$D\['task_prefix'\]/);
  assert.match(script, /ExecutablePath\.StartsWith\(\(\$scope \+ '\\'\)/);
  assert.match(script, /if \(\$D\['operation'\] -eq 'close'\)/);
  assert.match(script, /\[IO\.Directory\]::Delete\(\$Root,\$true\)/);
  assert.match(script, /\.channel\\stop-' \+ \$D\['run_prefix8'\]/);
  assert.ok(script.indexOf('RUN_SCOPE_INVALID') < script.indexOf('Write-Text $stop'));
  const common = fs.readFileSync(path.resolve(here, '../remote/common.ps1'), 'utf8');
  assert.match(common, /\^A9-DEV-\(\[a-f0-9\]\{8\}\)-/);
  assert.match(common, /'\\\.channel\\stop-' \+ \$prefix/);
  assert.match(wrapper, /Stop-Marker \$D\['name'\]/);
  assert.match(runner, /Stop-Marker \$name/);
  const docs = fs.readFileSync(path.resolve(here, '../README.md'), 'utf8');
  assert.match(docs, /stop --run <UUID>/);
});

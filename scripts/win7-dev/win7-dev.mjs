#!/usr/bin/env node
// Developer-only controller. Importing this module never starts a transport.
import fs from 'node:fs';
import path from 'node:path';
import { spawn as systemSpawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

export const ROOT = 'C:\\A9-DEV';
export const EVIDENCE_CLASS = 'DEV_CHANNEL';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const EXPIRY = Date.parse('2026-11-28T00:00:00Z');
const COMMANDS = ['status', 'put', 'get', 'ps', 'agent-run', 'cand', 'stop', 'close'];
const READ_ONLY = new Set(['status', 'get']);
const SECRET_PATTERNS = [
  ['sk-key', /sk-[a-z0-9]{20,}/i], ['authorization', /Authorization\s*:/i],
  ['api_key', /api_key/i], ['password', /password/i],
];
function need(condition, code) { if (!condition) throw new ChannelError(code); }
export class ChannelError extends Error {
  constructor(code, details = {}) { super(code); this.code = code; this.details = details; }
}
const b64 = (s) => Buffer.from(s, 'utf8').toString('base64');
const psString = (s) => `'${String(s).replaceAll("'", "''")}'`;
const from64 = (s) => `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${b64(s)}'))`;
const remoteSource = (file) => fs.readFileSync(path.join(HERE, 'remote', file), 'utf8');

export function configuration(env = process.env) {
  const value = (key, fallback) => env[key] ?? fallback;
  const host = value('WIN7_DEV_HOST', '192.168.1.5');
  const user = value('WIN7_DEV_USER', 'dccs-chaizl');
  need(/^[a-z0-9][a-z0-9.-]*$/i.test(host) && /^[a-z0-9][a-z0-9._-]*$/i.test(user), 'SSH_DESTINATION_INVALID');
  const identity = value('WIN7_DEV_IDENTITY', '/Users/qlyf/Developer/win7-coding-Agent/.acceptance/ssh/id_rsa_win7accept');
  const knownHosts = value('WIN7_DEV_KNOWN_HOSTS', '/Users/qlyf/Developer/win7-coding-Agent/.acceptance/ssh/known_hosts_win7');
  const alias = '192.168.1.11';
  need(env.WIN7_DEV_HOST_KEY_ALIAS === undefined || env.WIN7_DEV_HOST_KEY_ALIAS === alias, 'SSH_ALIAS_NOT_AUTHORIZED');
  for (const p of [identity, knownHosts]) need(path.isAbsolute(p) && !/[\r\n\0]/.test(p), 'SSH_FILE_PATH_INVALID');
  need(/^[a-z0-9][a-z0-9.-]*$/i.test(alias), 'SSH_ALIAS_INVALID');
  const holder = value('WIN7_DEV_HOLDER', 'main');
  need(/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(holder), 'HOLDER_INVALID');
  const options = ['-F', '/dev/null', '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'StrictHostKeyChecking=yes',
    '-o', `UserKnownHostsFile=${knownHosts}`, '-o', `HostKeyAlias=${alias}`, '-o', 'ConnectTimeout=20',
    '-o', 'ConnectionAttempts=1', '-o', 'ServerAliveInterval=30', '-o', 'ServerAliveCountMax=6', '-i', identity];
  return { host: `${user}@${host}`, holder, options, identity };
}

// CLI remote paths are relative. Both slash conventions are parsed as Windows paths.
export function remotePath(input, { internal = false } = {}) {
  need(typeof input === 'string' && input.length > 0 && !/[\x00-\x1f\x7f<>:"|?*]/.test(input), 'REMOTE_PATH_INVALID');
  const rel = input.replaceAll('/', '\\');
  need(!path.win32.isAbsolute(rel) && !rel.startsWith('\\'), 'REMOTE_PATH_ABSOLUTE');
  const segments = rel.split('\\');
  need(segments.every((s) => s && s !== '.' && s !== '..' && !/[. ]$/.test(s) && !/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s)), 'REMOTE_PATH_COMPONENT');
  if (!internal) need(!/^(?:lock|\.channel)(?:\\|$)/i.test(rel), 'REMOTE_PATH_RESERVED');
  const result = path.win32.resolve(ROOT, rel);
  need(result.toLowerCase().startsWith(`${ROOT.toLowerCase()}\\`) && result.length < 240, 'REMOTE_PATH_OUTSIDE_ROOT');
  return result;
}

export function parseArgs(argv) {
  const [command, ...rest] = argv;
  need(COMMANDS.includes(command), 'USAGE');
  let steal = false; let wait = 600; let seenWait = false; let runId = null; const args = [];
  for (let i = 0; i < rest.length; i++) {
    const arg = rest[i];
    if (arg === '--steal') { need(!steal && !READ_ONLY.has(command), 'OPTION_INVALID'); steal = true; }
    else if (arg === '--wait') {
      need(command === 'agent-run' && !seenWait && /^[1-9][0-9]*$/.test(rest[i + 1] ?? ''), 'WAIT_INVALID');
      seenWait = true; wait = Number(rest[++i]); need(wait <= 86400, 'WAIT_INVALID');
    } else if (arg === '--run') {
      need(command === 'stop' && runId === null, 'OPTION_INVALID');
      need(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(rest[i + 1] ?? ''), 'RUN_ID_INVALID');
      runId = rest[++i].toLowerCase();
    } else { need(!arg.startsWith('--'), 'OPTION_INVALID'); args.push(arg); }
  }
  const counts = { status: 0, put: 2, get: 2, ps: 1, 'agent-run': 2, cand: 1, stop: 0, close: 0 };
  need(args.length === counts[command], 'USAGE');
  if (command === 'stop') need(runId, 'RUN_SCOPE_REQUIRED');
  if (command !== 'stop') need(runId === null, 'OPTION_INVALID');
  if (command === 'put') remotePath(args[1]);
  if (command === 'get') { remotePath(args[0]); localRelative(args[1]); }
  if (command === 'agent-run') {
    need(/^[a-z0-9][a-z0-9_-]{0,47}$/i.test(args[0]), 'RUN_NAME_INVALID');
    splitCommand(args[1]);
  }
  return { command, args, steal, wait, runId };
}

export function runScope(runId) {
  need(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(runId || ''), 'RUN_ID_INVALID');
  const id = runId.toLowerCase(); const prefix8 = id.slice(0, 8);
  return { run_id: id, run_prefix8: prefix8, run_root: `C:\\A9-DEV\\run\\${prefix8}`, task_prefix: `A9-DEV-${prefix8}-` };
}

function localRelative(input) {
  need(typeof input === 'string' && input.length > 0 && !/[:\\\x00-\x1f\x7f]/.test(input) && !path.isAbsolute(input), 'LOCAL_PATH_INVALID');
  const parts = input.split('/');
  need(parts.every((s) => s && s !== '.' && s !== '..') && !/^(?:actions|quarantine|ledger\.tsv|\.incoming)(?:\/|$)/i.test(input), 'LOCAL_PATH_RESERVED');
  return parts;
}

export function splitCommand(line) {
  need(typeof line === 'string' && !/[\x00-\x1f\x7f]/.test(line), 'COMMAND_LINE_INVALID');
  const match = /^(?:"([^"\r\n]+)"|([^\s"]+))(?:\s+(.*))?$/.exec(line.trim());
  need(match, 'COMMAND_LINE_INVALID');
  const executable = match[1] ?? match[2];
  const relative = path.win32.relative(ROOT, executable.replaceAll('/', '\\'));
  need(path.win32.isAbsolute(executable) && remotePath(relative) && /\.(?:exe|com)$/i.test(executable), 'COMMAND_EXECUTABLE_OUTSIDE_ROOT');
  return { executable: remotePath(relative), arguments: match[3] ?? '' };
}

export function uploadTimeout(bytes) {
  need(Number.isSafeInteger(bytes) && bytes >= 0, 'SIZE_INVALID');
  return Math.max(600, Math.ceil(bytes / 200000));
}
export function developmentRootLimit(holder, now = Date.now()) {
  // ADR-0310: separately approved fifth window, exact holder and deadline.
  if (holder === 'a942-751c-7f41ca1c' && Number.isFinite(now)
    && now >= Date.parse('2026-10-31T01:16:21.000Z') && now < Date.parse('2026-10-31T02:46:21.000Z')) return 35e9;
  // ADR-0306/0307: one owner-approved A9-43 window; no general quota override.
  // ADR-0308: the separately approved fourth window.
  if (holder === 'a942-751c-7f41ca1c' && Number.isFinite(now)
    && now >= Date.parse('2026-10-30T23:45:35.980Z') && now < Date.parse('2026-10-31T01:15:35.980Z')) return 30e9;
  return holder === 'a942-751c-7f41ca1c' && Number.isFinite(now)
    && now >= Date.parse('2026-10-30T15:55:13.975Z')
    && now < Date.parse('2026-10-30T18:56:32.708Z') ? 24e9 : 20e9;
}
export function checkCapacity(free, used, incoming = 0, scope = {}) {
  need([free, used, incoming].every((n) => Number.isSafeInteger(n) && n >= 0), 'DISK_SPACE_UNKNOWN');
  const limit = developmentRootLimit(scope.holder, scope.now);
  need(free >= 50e9 && used <= limit && free - incoming >= 50e9 && used + incoming <= limit, 'DISK_LIMIT');
}

// No links in any local output ancestor, including outputs itself.
function safeLocal(target, base) {
  const resolved = path.resolve(target); const relative = path.relative(base, resolved);
  need(relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative)), 'LOCAL_PATH_OUTSIDE_ROOT');
  for (let at = resolved; ; at = path.dirname(at)) {
    try { need(!fs.lstatSync(at).isSymbolicLink(), 'LOCAL_REPARSE_POINT'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    if (at === path.dirname(at)) break;
  }
  return resolved;
}
function makeDir(dir, base) { safeLocal(dir, base); fs.mkdirSync(dir, { recursive: true, mode: 0o700 }); safeLocal(dir, base); }
function writeNew(file, bytes, base) { safeLocal(file, base); fs.writeFileSync(file, bytes, { flag: 'wx', mode: 0o600 }); }
async function hashFile(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function localFile(file) {
  const resolved = path.resolve(file);
  need(fs.statSync(resolved).isFile(), 'LOCAL_FILE_REQUIRED');
  return resolved;
}
function rejectIdentityInput(file, identity) {
  need(path.resolve(file) !== path.resolve(identity), 'PRIVATE_KEY_INPUT_FORBIDDEN');
  // Also reject symlink/hardlink aliases without ever reading key contents.
  let key; try { key = fs.statSync(identity); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (key) { const input = fs.statSync(file); need(input.dev !== key.dev || input.ino !== key.ino, 'PRIVATE_KEY_INPUT_FORBIDDEN'); }
}

// Check the central directory before Shell.Application sees the archive. ZIP64,
// links, non-UTF8 names, encrypted entries and ambiguous Windows names fail closed.
export function zipManifest(file) {
  const fd = fs.openSync(file, 'r');
  try {
    const size = fs.fstatSync(fd).size; need(size >= 22, 'ZIP_INVALID');
    const tail = Buffer.alloc(Math.min(size, 65557)); fs.readSync(fd, tail, 0, tail.length, size - tail.length);
    let end = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50 && i + 22 + tail.readUInt16LE(i + 20) === tail.length) { end = i; break; }
    }
    need(end >= 0 && tail.readUInt16LE(end + 4) === 0 && tail.readUInt16LE(end + 6) === 0, 'ZIP_MULTIDISK_OR_INVALID');
    const count = tail.readUInt16LE(end + 10); const length = tail.readUInt32LE(end + 12); const offset = tail.readUInt32LE(end + 16);
    need(count > 0 && count < 65535 && count === tail.readUInt16LE(end + 8) && length < 16e6 && offset + length === size - tail.length + end, 'ZIP64_OR_DIRECTORY_INVALID');
    const dir = Buffer.alloc(length); need(fs.readSync(fd, dir, 0, length, offset) === length, 'ZIP_INVALID');
    const seen = new Map(); const files = []; let at = 0; let unpacked = 0;
    for (let i = 0; i < count; i++) {
      need(at + 46 <= length && dir.readUInt32LE(at) === 0x02014b50, 'ZIP_INVALID');
      const flags = dir.readUInt16LE(at + 8); const method = dir.readUInt16LE(at + 10);
      const compressed = dir.readUInt32LE(at + 20); const bytes = dir.readUInt32LE(at + 24);
      const names = dir.readUInt16LE(at + 28); const extras = dir.readUInt16LE(at + 30); const comments = dir.readUInt16LE(at + 32);
      const attributes = dir.readUInt32LE(at + 38); const localOffset = dir.readUInt32LE(at + 42);
      need(at + 46 + names + extras + comments <= length && !(flags & 1) && [0, 8].includes(method) && compressed !== 0xffffffff && bytes !== 0xffffffff && localOffset + 30 <= offset && (attributes >>> 28) !== 0xa && !(attributes & 0x400), 'ZIP_ENTRY_UNSUPPORTED');
      const rawName = dir.subarray(at + 46, at + 46 + names);
      const local = Buffer.alloc(30); need(fs.readSync(fd, local, 0, 30, localOffset) === 30 && local.readUInt32LE(0) === 0x04034b50, 'ZIP_LOCAL_HEADER_INVALID');
      const localNames = local.readUInt16LE(26); const localExtras = local.readUInt16LE(28);
      need(local.readUInt16LE(6) === flags && local.readUInt16LE(8) === method && localNames === names && localOffset + 30 + localNames + localExtras + compressed <= offset, 'ZIP_LOCAL_HEADER_MISMATCH');
      const localName = Buffer.alloc(localNames); fs.readSync(fd, localName, 0, localNames, localOffset + 30);
      need(localName.equals(rawName), 'ZIP_LOCAL_NAME_MISMATCH');
      for (let extra = at + 46 + names; extra < at + 46 + names + extras;) {
        need(extra + 4 <= at + 46 + names + extras, 'ZIP_EXTRA_INVALID');
        const id = dir.readUInt16LE(extra); const n = dir.readUInt16LE(extra + 2);
        need(id !== 1 && id !== 0x7075 && extra + 4 + n <= at + 46 + names + extras, 'ZIP_EXTRA_UNSUPPORTED');
        extra += 4 + n;
      }
      need((flags & 0x800) || rawName.every((b) => b < 128), 'ZIP_NAME_ENCODING');
      const name = new TextDecoder('utf-8', { fatal: true }).decode(rawName).replaceAll('\\', '/');
      const isDir = name.endsWith('/'); const rel = isDir ? name.slice(0, -1) : name;
      remotePath(`cand/0000000000000000/expanded/${rel}`);
      const key = rel.toLowerCase(); need(!seen.has(key), 'ZIP_DUPLICATE_PATH'); seen.set(key, isDir);
      if (!isDir) { files.push({ path: rel, bytes }); unpacked += bytes; }
      at += 46 + names + extras + comments;
    }
    for (const [name] of seen) {
      for (let parent = path.posix.dirname(name); parent !== '.'; parent = path.posix.dirname(parent)) need(seen.get(parent) !== false, 'ZIP_FILE_DIRECTORY_COLLISION');
    }
    need(at === length && files.length > 0 && unpacked <= 20e9, 'ZIP_DIRECTORY_OR_SIZE');
    return { files, unpacked, text: files.map((f) => `${f.bytes}\t${f.path.replaceAll('/', '\\')}\n`).join('') };
  } finally { fs.closeSync(fd); }
}

// Text is detected by decoding rather than by extension (stdout.bin is text too).
export function secretCategories(bytes) {
  const texts = [];
  for (const alignment of [0, 1]) {
    const even = bytes.subarray(alignment, bytes.length - ((bytes.length - alignment) % 2));
    texts.push(even.toString('utf16le'), Buffer.from(even).swap16().toString('utf16le'));
  }
  // Latin-1 retains ASCII patterns in CP936 and other legacy text. Scan binary
  // bytes conservatively too; this avoids a NUL/encoding bypass for credentials.
  texts.push(bytes.toString('utf8'), bytes.toString('latin1'));
  return SECRET_PATTERNS.filter(([, re]) => texts.some((s) => re.test(s))).map(([name]) => name);
}

function quarantineIfSecret(file, destination, out) {
  safeLocal(file, out); safeLocal(destination, out);
  const found = new Set(); const buffer = Buffer.alloc(65536); let carry = Buffer.alloc(0);
  const fd = fs.openSync(file, 'r');
  try {
    for (;;) {
      const count = fs.readSync(fd, buffer, 0, buffer.length, null); if (!count) break;
      const window = Buffer.concat([carry, buffer.subarray(0, count)]);
      for (const category of secretCategories(window)) found.add(category);
      carry = Buffer.from(window.subarray(-256));
    }
  } finally { fs.closeSync(fd); }
  const categories = SECRET_PATTERNS.map(([name]) => name).filter((name) => found.has(name));
  if (categories.length) {
    const dir = path.join(out, 'quarantine'); makeDir(dir, out);
    const quarantine = path.join(dir, `${randomUUID()}-${path.basename(destination)}`);
    fs.renameSync(file, quarantine);
    throw new ChannelError('SECRET_QUARANTINED', { file: path.basename(destination), categories });
  }
}
export function scanAndPlace(file, destination, out) {
  quarantineIfSecret(file, destination, out);
  makeDir(path.dirname(destination), out);
  need(!fs.existsSync(destination), 'LOCAL_DESTINATION_EXISTS');
  fs.renameSync(file, destination);
}

export function powershellInput(file, data, custom = '') {
  const fields = Object.entries(data).map(([k, v]) => `${psString(k)}=${from64(String(v))}`).join(';');
  const body = custom || remoteSource(file);
  return Buffer.from(`& {\n$D = @{${fields}}\n${remoteSource('common.ps1')}\ntry {\nAssert-Identity\n${body}\n} catch {\n$code = [string]$_.Exception.Message\nif ($code -notmatch '^[A-Z][A-Z0-9_]{1,79}$') { $code = 'REMOTE_ACTION_FAILED' }\nEmit ('"ok":false,"error":' + (J $code))\nexit 1\n}\n}\n\n`, 'utf8');
}

function quoteSftp(s) {
  need(!/[\r\n\0]/.test(s), 'SFTP_PATH_INVALID');
  // Batch quoting handles spaces; glob quoting separately preserves literal names.
  const literal = s.replace(/[?*\[\]]/g, '\\$&');
  return `"${literal.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;
}
function remoteSftp(p) { return p.replaceAll('\\', '/'); }
function wireResult(result) {
  const lines = result.stdout.toString('utf8').trim().split(/\r?\n/);
  let message; try { message = JSON.parse(lines.at(-1)); } catch { throw new ChannelError('REMOTE_JSON_INVALID'); }
  need(message.evidence_class === EVIDENCE_CLASS, 'REMOTE_EVIDENCE_CLASS_INVALID');
  if (!message.ok) throw new ChannelError(/^[A-Z][A-Z0-9_]+$/.test(message.error) ? message.error : 'REMOTE_ACTION_FAILED');
  return message;
}

export class DevChannel {
  constructor({ env = process.env, spawn = systemSpawn, out = path.join(REPO, 'outputs/win7-dev'), now = () => new Date() } = {}) {
    this.config = configuration(env); this.spawn = spawn; this.out = path.resolve(out); this.now = now;
    this.token = randomUUID(); this.lease = false;
  }
  async action(step, kind, stdin, { timeout = 600, upload = 0, download = 0, direction, transferFile, parameters = {} } = {}) {
    const started = this.now().toISOString();
    makeDir(this.out, this.out);
    const dir = path.join(this.out, 'actions', `${started.replaceAll(':', '-')}-${this.command}-${step}-${randomUUID()}`);
    makeDir(dir, this.out);
    writeNew(path.join(dir, 'stdin.bin'), stdin, this.out);
    const stdoutFd = fs.openSync(path.join(dir, 'stdout.bin'), 'wx', 0o600);
    const stderrFd = fs.openSync(path.join(dir, 'stderr.bin'), 'wx', 0o600);
    const args = kind === 'ssh' ? [...this.config.options, this.config.host, 'powershell -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command -']
      : [...this.config.options, '-q', '-b', '-', this.config.host];
    let exitCode = 125; let signal = null; let spawnError = null; let stdout = Buffer.alloc(0); let total = 0;
    try {
      await new Promise((resolve) => {
        let child; let settled = false;
        const done = (code, sig) => { if (settled) return; settled = true; exitCode = Number.isInteger(code) ? code : 124; signal = sig; resolve(); };
        try { child = this.spawn(kind === 'ssh' ? '/usr/bin/ssh' : '/usr/bin/sftp', args, { cwd: REPO, stdio: ['pipe', 'pipe', 'pipe'], shell: false, timeout: timeout * 1000, killSignal: 'SIGKILL' }); }
        catch { spawnError = 'SPAWN_FAILED'; done(127, null); return; }
        child.stdout.on('data', (chunk) => { fs.writeSync(stdoutFd, chunk); stdout = Buffer.concat([stdout, chunk]).subarray(-1048576); total += chunk.length; if (total > 64 * 1024 * 1024) child.kill('SIGKILL'); });
        child.stderr.on('data', (chunk) => { fs.writeSync(stderrFd, chunk); total += chunk.length; if (total > 64 * 1024 * 1024) child.kill('SIGKILL'); });
        child.on('error', () => { spawnError = 'TRANSPORT_ERROR'; });
        child.on('close', (code, sig) => done(code, sig));
        child.stdin.on('error', () => { spawnError = 'STDIN_ERROR'; });
        child.stdin.end(stdin);
      });
    } finally {
      fs.closeSync(stdoutFd); fs.closeSync(stderrFd);
      const ended = this.now().toISOString();
      let transferred = null;
      if (kind === 'sftp' && exitCode === 0) transferred = direction === 'put' ? upload : (transferFile && fs.existsSync(transferFile) ? fs.statSync(transferFile).size : download);
      const entry = { schema_version: 1, evidence_class: EVIDENCE_CLASS, start_utc: started, end_utc: ended, command: this.command, step, transport: kind,
        exit_code: exitCode, signal, error: spawnError, parameters, upload_bytes: kind === 'sftp' && direction === 'put' ? transferred : 0,
        download_bytes: kind === 'sftp' && direction === 'get' ? transferred : 0, planned_upload_bytes: upload, planned_download_bytes: download };
      writeNew(path.join(dir, 'result.json'), `${JSON.stringify(entry)}\n`, this.out);
      const ledger = safeLocal(path.join(this.out, 'ledger.tsv'), this.out);
      try { writeNew(ledger, 'start_utc\tend_utc\tcommand\tparameters\texit_code\tupload_bytes\tdownload_bytes\taction\n', this.out); }
      catch (e) { if (e.code !== 'EEXIST') throw e; }
      const amount = (n) => n === null ? 'UNKNOWN' : n;
      fs.appendFileSync(ledger, [started, ended, this.command, JSON.stringify({ step, transport: kind, ...parameters }), exitCode, amount(entry.upload_bytes), amount(entry.download_bytes), path.relative(this.out, dir)].join('\t') + '\n', { encoding: 'utf8', mode: 0o600 });
    }
    if (exitCode !== 0 || spawnError || total > 64 * 1024 * 1024) {
      let code = 'TRANSPORT_FAILED';
      if (kind === 'ssh') {
        try { const last = JSON.parse(stdout.toString('utf8').trim().split(/\r?\n/).at(-1)); if (last.evidence_class === EVIDENCE_CLASS && last.ok === false && /^[A-Z][A-Z0-9_]{1,79}$/.test(last.error)) code = last.error; } catch { /* raw bytes already retained */ }
      }
      throw new ChannelError(code, { exit_code: exitCode, action: path.relative(this.out, dir) });
    }
    return { stdout, dir };
  }
  async ps(step, file, values = {}, options = {}) {
    const data = { holder: this.config.holder, token: this.token, command: this.command, operation: step, ...values };
    const parameters = {};
    for (const key of ['path', 'stage', 'sha256', 'bytes', 'incoming', 'name', 'wait', 'executable', 'steal', 'run_id', 'run_prefix8', 'run_root', 'task_prefix']) if (data[key] !== undefined) parameters[key] = data[key];
    if (options.custom) parameters.script_sha256 = createHash('sha256').update(options.custom, 'utf8').digest('hex');
    const result = await this.action(step, 'ssh', powershellInput(file, data, options.custom), { ...options, parameters });
    return wireResult(result);
  }
  async sftp(step, verb, local, remote, bytes) {
    const operands = verb === 'put' ? [local, remoteSftp(remote)] : [remoteSftp(remote), local];
    return this.action(step, 'sftp', Buffer.from(`${verb} ${operands.map(quoteSftp).join(' ')}\n`, 'utf8'), {
      timeout: verb === 'put' ? uploadTimeout(bytes) : 600, upload: verb === 'put' ? bytes : 0, download: verb === 'get' ? bytes : 0, direction: verb, parameters: { remote, file: path.basename(local) }, transferFile: verb === 'get' ? local : undefined,
    });
  }
  async getFile(remote, relative) {
    const destination = path.join(this.out, ...localRelative(relative)); safeLocal(destination, this.out);
    need(!fs.existsSync(destination), 'LOCAL_DESTINATION_EXISTS');
    const info = await this.ps('get-info', 'files.ps1', { path: remote });
    need(Number.isSafeInteger(info.bytes) && info.bytes >= 0 && /^[a-f0-9]{64}$/.test(info.sha256), 'REMOTE_FILE_METADATA_INVALID');
    const incoming = path.join(this.out, '.incoming'); makeDir(incoming, this.out);
    const file = path.join(incoming, randomUUID());
    let transferFailure;
    try { await this.sftp('download', 'get', file, remote, info.bytes); } catch (e) { transferFailure = e; }
    // Partial or corrupt transfers must be scanned before any integrity rejection.
    if (fs.existsSync(file)) quarantineIfSecret(file, destination, this.out);
    if (transferFailure) throw transferFailure;
    need(fs.statSync(file).size === info.bytes && await hashFile(file) === info.sha256, 'DOWNLOAD_HASH_OR_SIZE');
    makeDir(path.dirname(destination), this.out); need(!fs.existsSync(destination), 'LOCAL_DESTINATION_EXISTS');
    fs.renameSync(file, destination);
    return { file: relative, bytes: info.bytes, sha256: info.sha256 };
  }
  async upload(file, destination, { immutable = false } = {}) {
    const bytes = fs.statSync(file).size; const sha256 = await hashFile(file);
    const stage = remotePath(`.channel/upload-${this.token}`, { internal: true });
    await this.ps('prepare-put', 'files.ps1', { path: destination, stage, incoming: bytes });
    await this.sftp('upload', 'put', file, stage, bytes);
    await this.ps('commit-put', 'files.ps1', { path: destination, stage, bytes, sha256, immutable: String(immutable) });
    return { bytes, sha256 };
  }
  async execute(argv) {
    const parsed = parseArgs(argv); this.command = parsed.command;
    const { command, args, steal, wait, runId } = parsed;
    // Finish all local validation before the first possible connection.
    let input; let manifest; let script;
    if (['put', 'ps', 'cand'].includes(command)) { input = localFile(args[0]); rejectIdentityInput(input, this.config.identity); }
    if (command === 'put' || command === 'cand') quoteSftp(input);
    if (command === 'ps') { script = fs.readFileSync(input, 'utf8'); need(!script.startsWith('\ufeff') && !script.includes('\0'), 'SCRIPT_ENCODING_INVALID'); }
    if (command === 'cand') manifest = zipManifest(input);
    if (command === 'get') { const dest = path.join(this.out, ...localRelative(args[1])); safeLocal(dest, this.out); need(!fs.existsSync(dest), 'LOCAL_DESTINATION_EXISTS'); }
    if (!READ_ONLY.has(command) && !['close', 'stop'].includes(command)) need(this.now().getTime() < EXPIRY, 'AUTHORIZATION_EXPIRED');
    let result; let failure;
    try {
      if (!READ_ONLY.has(command)) { await this.ps('acquire', 'lock.ps1', { steal: String(steal) }); this.lease = true; }
      if (command === 'status') result = await this.ps('status', 'status.ps1');
      else if (command === 'get') result = await this.getFile(remotePath(args[0]), args[1]);
      else if (command === 'put') result = await this.upload(input, remotePath(args[1]));
      else if (command === 'ps') {
        const custom = `Assert-Writer\nSet-Location -LiteralPath $Root\n$env:TEMP = $Root + '\\.channel'\n$env:TMP = $env:TEMP\n$global:LASTEXITCODE = 0\n& ([ScriptBlock]::Create(${from64(script)}))\nif (-not $? -or $LASTEXITCODE -ne 0) { throw 'PAYLOAD_FAILED' }\nEmit '\"ok\":true,\"operation\":\"ps\"'`;
        result = await this.ps('ps', 'common.ps1', {}, { custom });
      } else if (command === 'cand') {
        const sha256 = await hashFile(input); const base = remotePath(`cand/${sha256.slice(0, 16)}`);
        const bytes = fs.statSync(input).size;
        const probe = await this.ps('cand-probe', 'files.ps1', { path: base, sha256, incoming: bytes + manifest.unpacked });
        if (!probe.archive_exists) await this.upload(input, `${base}\\package.zip`, { immutable: true });
        result = await this.ps('cand-expand', 'files.ps1', { path: base, sha256, manifest: b64(manifest.text) });
        result.upload_skipped = probe.archive_exists;
      } else if (command === 'agent-run') {
        const values = { name: args[0], ...splitCommand(args[1]), wait };
        const data = { ...values, holder: this.config.holder, token: this.token, operation: 'agent-run' };
        const wrapper = `$D = @{${Object.entries(data).map(([k, v]) => `${psString(k)}=${from64(String(v))}`).join(';')}}\n${remoteSource('common.ps1')}\n${remoteSource('agent-wrapper.ps1')}`;
        const xml = remoteSource('agent-task.xml').replaceAll('@@NAME@@', args[0]).replaceAll('@@TOKEN@@', this.token);
        result = await this.ps('agent-run', 'agent-run.ps1', { ...values, wrapper: b64(wrapper), xml: b64(xml) }, { timeout: wait + 60 });
        const downloads = []; const errors = [];
        for (const file of ['stdout.bin', 'stderr.bin', 'exit-code.txt', 'identity.json']) {
          try { downloads.push(await this.getFile(remotePath(`runs/${args[0]}/${file}`), `runs/${args[0]}/${file}`)); }
          catch (e) { errors.push({ error: e.code ?? 'LOCAL_IO_FAILED', ...e.details }); }
        }
        result.downloads = downloads;
        if (errors.length) throw new ChannelError('RUN_RECOVERY_FAILED', { errors });
        need(result.completed && Number.isInteger(result.exit_code), 'RUN_TIMEOUT');
        if (result.exit_code !== 0) throw new ChannelError('AGENT_EXIT_NONZERO', { exit_code: result.exit_code });
      } else {
        const values = command === 'stop' ? runScope(runId) : {};
        result = await this.ps(command, 'stop.ps1', values);
        if (command === 'close') this.lease = false;
      }
    } catch (e) { failure = e; }
    finally {
      if (this.lease) {
        try { await this.ps('release', 'lock.ps1'); this.lease = false; }
        catch (e) { if (failure) failure = new ChannelError(failure.code ?? 'LOCAL_IO_FAILED', { ...failure.details, release_error: e.code ?? 'LOCAL_IO_FAILED' }); else failure = e; }
      }
    }
    if (failure) throw failure;
    return { evidence_class: EVIDENCE_CLASS, ok: true, command, ...result };
  }
}

export async function main(argv = process.argv.slice(2), options = {}) {
  try { need(process.versions.node === '20.17.0', 'NODE_20_17_REQUIRED'); return await new DevChannel(options).execute(argv); }
  catch (error) { return { evidence_class: EVIDENCE_CLASS, ok: false, error: error instanceof ChannelError ? error.code : 'LOCAL_IO_FAILED', ...(error instanceof ChannelError ? error.details : {}) }; }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await main();
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

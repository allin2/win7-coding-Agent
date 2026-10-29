'use strict';
// Standalone candidate-external DEV_CHANNEL driver. No product implementation is replaced.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const cp = require('child_process');
const os = require('os');
const ROOT = 'C:\\A9-DEV';
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const need = (value, code) => { if (!value) throw new Error(code); };
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const safeError = error => /^[A-Z][A-Z0-9_]{1,90}$/.test(error && error.message || '') ? error.message : 'DRIVER_OPERATION_FAILED';
function inside(root, file) {
  const relative = path.win32.relative(root, file);
  return path.win32.isAbsolute(root) && path.win32.isAbsolute(file)
    && relative !== '' && !relative.startsWith('..') && !path.win32.isAbsolute(relative)
    && !relative.split(/[\\/]/).some((part) => /[:\x00-\x1f]/.test(part));
}

function parseProcesses(text) {
  const lines = text.replace(/\r/g, '').split('\n').map((line) => line.trim()).filter(Boolean);
  need(lines.length > 1, 'PROCESS_QUERY_EMPTY');
  const header = lines[0].split(',');
  for (const name of ['ProcessId', 'ParentProcessId', 'CreationDate', 'ExecutablePath', 'SessionId', 'Name']) {
    need(header.includes(name), 'PROCESS_QUERY_COLUMNS');
  }
  return lines.slice(1).map((line) => {
    const values = [];
    let quoted = false, cell = '';
    for (let i = 0; i < line.length; i += 1) {
      if (line[i] === '"') {
        if (quoted && line[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = !quoted;
      } else if (line[i] === ',' && !quoted) { values.push(cell); cell = ''; }
      else cell += line[i];
    }
    need(!quoted, 'PROCESS_QUERY_CSV');
    values.push(cell);
    need(values.length === header.length, 'PROCESS_QUERY_CSV');
    const raw = Object.fromEntries(header.map((key, index) => [key, values[index]]));
    need(/^\d+$/.test(raw.ProcessId) && /^\d+$/.test(raw.ParentProcessId), 'PROCESS_QUERY_PID');
    return { pid: Number(raw.ProcessId), parent: Number(raw.ParentProcessId), created: raw.CreationDate,
      image: raw.ExecutablePath, imageSource: raw.ExecutablePath ? 'executable_path' : null,
      session: /^\d+$/.test(raw.SessionId) ? Number(raw.SessionId) : null, name: raw.Name };
  });
}

function processRows() {
  const result = cp.spawnSync(path.join(process.env.SystemRoot, 'System32', 'wbem', 'WMIC.exe'),
    ['process', 'get', 'ProcessId,ParentProcessId,CreationDate,ExecutablePath,SessionId,Name', '/format:csv'],
    { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
  need(!result.error && result.status === 0, 'PROCESS_QUERY_FAILED');
  return parseProcesses(result.stdout);
}

function observedTree(rows, pid) {
  const first = rows.find((row) => row.pid === pid);
  need(first && /^\d{14}\.\d{6}[+-]\d{3}$/.test(first.created) && first.image, 'PROCESS_IDENTITY_UNKNOWN');
  const selected = [first];
  for (let i = 0; i < selected.length; i += 1) {
    for (const row of rows) {
      if (row.parent !== selected[i].pid || selected.some((item) => item.pid === row.pid)
        || row.name.toLowerCase() === 'wmic.exe') continue;
      need(/^\d{14}\.\d{6}[+-]\d{3}$/.test(row.created), 'PROCESS_CHILD_IDENTITY_UNKNOWN');
      // WMIC timestamps are from this same host and query. Older child links are
      // stale PID-parent references, not current descendants.
      if (row.created < selected[i].created) continue;
      need(row.image && row.session === first.session, 'PROCESS_CHILD_IDENTITY_UNKNOWN');
      selected.push(row);
    }
  }
  return selected;
}

function remainingInstances(observed, current) {
  need(Array.isArray(observed) && observed.length > 0 && Array.isArray(current) && current.length > 0, 'PROCESS_EVIDENCE_MISSING');
  return observed.filter((old) => {
    need(Number.isInteger(old.pid) && old.created && old.image, 'PROCESS_EVIDENCE_INVALID');
    const row = current.find((item) => item.pid === old.pid);
    if (!row) return false;
    need(row.created && row.image, 'PROCESS_CURRENT_IDENTITY_UNKNOWN');
    return row.created === old.created;
  });
}

function isSgToolEnvironment(row, session) {
  const prefix = 'C:\\Program Files (x86)\\SogouInput';
  if (!row || row.imageSource !== 'executable_path' || typeof row.image !== 'string'
    || typeof row.name !== 'string' || row.name.toLowerCase() !== 'sgtool.exe'
    || !Number.isSafeInteger(row.pid) || row.pid <= 0
    || !Number.isSafeInteger(row.parent) || row.parent <= 0
    || !Number.isSafeInteger(session) || session <= 0 || row.session !== session) return false;
  if (!inside(prefix, row.image) || path.win32.basename(row.image).toLowerCase() !== 'sgtool.exe'
    || path.win32.normalize(row.image).toLowerCase() !== row.image.toLowerCase()
    || row.image.split('\\').some((part) => /[. ]$/.test(part))) return false;
  const stamp = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})\.(\d{6})([+-])(\d{3})$/.exec(row.created || '');
  if (!stamp || Number(stamp[9]) > 840) return false;
  const date = new Date(Date.UTC(Number(stamp[1]), Number(stamp[2]) - 1, Number(stamp[3]),
    Number(stamp[4]), Number(stamp[5]), Number(stamp[6])));
  return date.getUTCFullYear() === Number(stamp[1]) && date.getUTCMonth() + 1 === Number(stamp[2])
    && date.getUTCDate() === Number(stamp[3]) && date.getUTCHours() === Number(stamp[4])
    && date.getUTCMinutes() === Number(stamp[5]) && date.getUTCSeconds() === Number(stamp[6]);
}

function extendObservedTree(observed, current, session) {
  const all = observed.slice();
  for (let index = 0; index < all.length; index += 1) {
    const parent = all[index];
    const now = current.find((row) => row.pid === parent.pid);
    if (now && now.created !== parent.created) continue;
    for (const row of current) {
      if (row.parent !== parent.pid || row.name.toLowerCase() === 'wmic.exe'
        || all.some((known) => known.pid === row.pid && known.created === row.created)) continue;
      need(/^\d{14}\.\d{6}[+-]\d{3}$/.test(row.created), 'PROCESS_CHILD_IDENTITY_UNKNOWN');
      if (row.created < parent.created) continue;
      need(row.image && row.session === session, 'PROCESS_CHILD_IDENTITY_UNKNOWN');
      all.push(row);
    }
  }
  return all;
}

function processObservation(observed, current, session) {
  const remaining = remainingInstances(observed, current);
  const environment = observed.filter((row) => isSgToolEnvironment(row, session)).map((old) => {
    const now = current.find((row) => row.pid === old.pid);
    let state = 'absent';
    if (now) {
      state = now.created !== old.created ? 'pid_reused' : 'identity_changed';
      if (now.created === old.created && isSgToolEnvironment(now, session)
        && now.parent === old.parent && now.image.toLowerCase() === old.image.toLowerCase()) state = 'present';
    }
    return { rule: 'ADR-0297', observed_instance: old, current_instance: now || null, state };
  });
  // Classification happens after collecting the complete tree. It never prunes
  // the environment process's children or relaxes another instance's identity.
  const blocking = remaining.filter((row) => !environment.some((item) => item.state === 'present'
    && item.observed_instance.pid === row.pid && item.observed_instance.created === row.created));
  return { remaining_instances: remaining, blocking_instances: blocking, environment_instances: environment };
}

function cleanEnvironment(root, nodeMode) {
  const env = {};
  for (const key of ['SystemRoot', 'windir', 'SystemDrive', 'USERNAME', 'USERDOMAIN', 'COMPUTERNAME',
    'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS']) {
    if (process.env[key] !== undefined) env[key] = process.env[key];
  }
  Object.assign(env, { PATH: `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}\\System32\\Wbem`,
    PATHEXT: '.COM;.EXE;.BAT;.CMD', ComSpec: process.env.ComSpec || `${process.env.SystemRoot}\\System32\\cmd.exe`,
    LOCALAPPDATA: path.join(root, 'local'), APPDATA: path.join(root, 'roaming'), USERPROFILE: path.join(root, 'profile'),
    TEMP: path.join(root, 'temp'), TMP: path.join(root, 'temp'), WIN7AGENT_PORTABLE: '0' });
  if (nodeMode) env.ELECTRON_RUN_AS_NODE = '1';
  return env;
}

async function waitFor(read, milliseconds, label) {
  const end = Date.now() + milliseconds;
  while (Date.now() < end) {
    const result = await read();
    if (result) return result;
    await delay(250);
  }
  throw new Error(`TIMEOUT_${label}`);
}

function currentIdentity(config) {
  need(process.platform === 'win32' && process.arch === 'x64', 'RUNTIME_PLATFORM');
  need(os.hostname().toUpperCase() === 'DCCS-CHAIZL-PC' && os.release() === '6.1.7601', 'RUNTIME_HOST');
  need(process.versions.electron === '22.3.27' && process.versions.node === '16.17.1', 'RUNTIME_VERSION');
  need(os.userInfo().username.toLowerCase() === 'agent', 'RUNTIME_USER');
  const whoami = path.join(process.env.SystemRoot, 'System32', 'whoami.exe');
  const user = cp.execFileSync(whoami, ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  const sid = 'S-1-5-21-1708701742-428676696-1831205153-1001';
  need(user.includes('"' + sid + '"'), 'RUNTIME_SID');
  const groups = cp.execFileSync(whoami, ['/groups', '/fo', 'csv', '/nh'], { encoding: 'utf8', windowsHide: true, timeout: 10000 });
  need(groups.includes('S-1-16-8192') && !/S-1-16-(12288|16384)/.test(groups), 'RUNTIME_INTEGRITY');
  const row = observedTree(processRows(), process.pid)[0];
  need(inside(ROOT, row.image) && row.session === config.session_id, 'RUNTIME_IMAGE_OR_SESSION');
  return { host: os.hostname(), os: os.release(), user: 'agent', sid, integrity: 'Medium', ...row,
    electron: process.versions.electron, node: process.versions.node };
}

function prepareDriverRuntime(config, physicalFs = require('original-fs')) {
  // A packaged Electron always loads resources/app, ignoring the external app
  // argument. Reuse the established candidate-external driver layout: identical
  // Electron runtime bytes, default_app only, then require the real product main.
  const runtimeRoot = path.join(config.run_root, 'driver-electron');
  const appRoot = path.join(config.run_root, 'driver-app');
  need(!physicalFs.existsSync(runtimeRoot) && !physicalFs.existsSync(appRoot), 'DRIVER_RUNTIME_EXISTS');
  const manifest = JSON.parse(physicalFs.readFileSync(path.join(config.package_root, 'release-manifest.json'), 'utf8'));
  const entries = manifest.files.filter((entry) => !entry.path.includes('/')
    || /^(locales|swiftshader)\//.test(entry.path) || entry.path === 'resources/default_app.asar');
  need(entries.some((entry) => entry.path === 'electron.exe')
    && entries.some((entry) => entry.path === 'resources/default_app.asar'), 'DRIVER_RUNTIME_INCOMPLETE');
  for (const entry of entries) {
    const from = path.join(config.package_root, ...entry.path.split('/'));
    const to = path.join(runtimeRoot, ...entry.path.split('/'));
    const bytes = physicalFs.readFileSync(from);
    need(bytes.length === entry.size && hash(bytes) === entry.sha256, 'DRIVER_RUNTIME_SOURCE_HASH');
    physicalFs.mkdirSync(path.dirname(to), { recursive: true });
    physicalFs.writeFileSync(to, bytes, { flag: 'wx' });
    need(hash(physicalFs.readFileSync(to)) === entry.sha256, 'DRIVER_RUNTIME_COPY_HASH');
  }
  physicalFs.mkdirSync(appRoot);
  const driver = physicalFs.readFileSync(__filename);
  need(hash(driver) === config.driver_sha256, 'DRIVER_SOURCE_HASH');
  physicalFs.writeFileSync(path.join(appRoot, 'main.cjs'), driver, { flag: 'wx' });
  physicalFs.writeFileSync(path.join(appRoot, 'package.json'),
    JSON.stringify({ name: 'a942-office-dev-trial', version: '1.0.0', private: true, main: 'main.cjs' }) + '\n', { flag: 'wx' });
  return { executable: path.join(runtimeRoot, 'electron.exe'), app_root: appRoot, files: entries.length };
}

function copyPortablePackage(config, physicalFs = require('original-fs')) {
  need(!physicalFs.existsSync(config.package_root), 'PORTABLE_DESTINATION_EXISTS');
  const manifestBytes = physicalFs.readFileSync(path.join(config.input_package_root, 'release-manifest.json'));
  need(hash(manifestBytes) === config.manifest_sha256, 'PORTABLE_SOURCE_MANIFEST');
  const manifest = JSON.parse(manifestBytes.toString('utf8'));
  const entries = [...manifest.files, { path: 'release-manifest.json', size: manifestBytes.length, sha256: config.manifest_sha256 }];
  for (const entry of entries) {
    const source = path.resolve(config.input_package_root, entry.path);
    const destination = path.resolve(config.package_root, entry.path);
    need(inside(config.input_package_root, source) && inside(config.package_root, destination), 'PORTABLE_COPY_PATH');
    need(!physicalFs.lstatSync(source).isSymbolicLink(), 'PORTABLE_COPY_LINK');
    const bytes = physicalFs.readFileSync(source);
    need(bytes.length === entry.size && hash(bytes) === entry.sha256, 'PORTABLE_COPY_SOURCE_HASH');
    physicalFs.mkdirSync(path.dirname(destination), { recursive: true });
    physicalFs.writeFileSync(destination, bytes, { flag: 'wx' });
    need(hash(physicalFs.readFileSync(destination)) === entry.sha256, 'PORTABLE_COPY_DESTINATION_HASH');
  }
  need(!physicalFs.existsSync(path.join(config.package_root, 'portable-data')), 'PORTABLE_DATA_NOT_FRESH');
  return { copied_files: entries.length, destination: config.package_root, original_preserved: true };
}


const CONFIG_KEYS = ['schema_version','evidence_class','profile','run_id','source_commit','zip_sha256',
  'manifest_sha256','driver_sha256','source_binding_sha256','manifest_file_count','session_id','task_name','deadline_utc',
  'real_model_request_limit','input_package_root','zip_path','run_root','package_root','workspace_root',
  'data_root','cmd_path','source_binding_path'];
function canonical(file) {
  return typeof file === 'string' && file.length < 200 && (file === ROOT || file.startsWith(ROOT + '\\'))
    && path.win32.normalize(file) === file && !/[\x00-\x1f<>"|?*]/.test(file)
    && file.split('\\').slice(1).every(part => part && !/[. ]$/.test(part) && !part.includes(':')
      && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part));
}
function validateConfig(c, now = Date.now(), allowTemplate = false) {
  need(c && Object.keys(c).length === CONFIG_KEYS.length && CONFIG_KEYS.every(k => Object.hasOwnProperty.call(c, k)), 'CONFIG_FIELDS');
  need(c.schema_version === 1 && c.evidence_class === 'DEV_CHANNEL' && c.profile === 'office-journey', 'CONFIG_SCHEMA');
  need(/^a942o-[a-f0-9]{8}$/.test(c.run_id) && /^[a-f0-9]{40}$/.test(c.source_commit), 'CONFIG_SOURCE');
  for (const key of ['zip_sha256','manifest_sha256','driver_sha256','source_binding_sha256']) need(/^[a-f0-9]{64}$/.test(c[key]), 'CONFIG_HASH');
  need(Number.isSafeInteger(c.manifest_file_count) && c.manifest_file_count > 100, 'CONFIG_FILE_COUNT');
  need(Number.isSafeInteger(c.session_id) && c.session_id > 0 && c.real_model_request_limit === 0, 'CONFIG_IDENTITY_BUDGET');
  need(c.task_name === `A9-DEV-${c.run_id}`, 'CONFIG_TASK_NAME');
  const end = Date.parse(c.deadline_utc);
  need((allowTemplate && c.deadline_utc === null) || (typeof c.deadline_utc === 'string'
    && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(c.deadline_utc)
    && end > now && end <= now + 60 * 60 * 1000), 'CONFIG_DEADLINE');
  for (const key of ['input_package_root','zip_path','run_root','package_root','workspace_root','data_root','cmd_path','source_binding_path']) need(canonical(c[key]), 'CONFIG_PATH');
  const trial = `${ROOT}\\work\\${c.run_id}`;
  for (const [key, suffix] of [['run_root','run'],['package_root','pkg'],['workspace_root','中文 workspace']]) {
    need(c[key] === `${trial}\\${suffix}`, 'CONFIG_LAYOUT');
  }
  need(c.data_root === `${c.package_root}\\portable-data` && c.cmd_path === `${c.run_root}\\cmd.exe`
    && c.source_binding_path === `${c.run_root}\\source-binding.json`, 'CONFIG_LAYOUT');
  need(!inside(trial, c.input_package_root) && c.input_package_root !== trial
    && !inside(c.input_package_root, trial) && !inside(c.input_package_root, c.zip_path)
    && !inside(trial, c.zip_path), 'CONFIG_INPUT_OVERLAP');
  return c;
}
function noLinks(root, file, io = fs) {
  need(canonical(root) && (root === file || inside(root, file)), 'PHYSICAL_PATH');
  let current = path.win32.parse(root).root;
  for (const part of file.slice(current.length).split('\\')) {
    current = path.win32.join(current, part);
    if (io.existsSync(current)) need(!io.lstatSync(current).isSymbolicLink(), 'PHYSICAL_LINK');
  }
}
function verifyPackage(c, root = c.package_root, io = require('original-fs')) {
  noLinks(ROOT, root, io);
  const bytes = io.readFileSync(path.join(root, 'release-manifest.json'));
  need(hash(bytes) === c.manifest_sha256, 'PACKAGE_MANIFEST_HASH');
  const m = JSON.parse(bytes.toString('utf8'));
  need(m.source_commit === c.source_commit && m.source_dirty === false
    && m.external_acceptance_eligible === false && Array.isArray(m.files)
    && m.files.length === c.manifest_file_count, 'PACKAGE_SOURCE');
  const seen = new Set();
  for (const e of m.files) {
    need(typeof e.path === 'string' && !e.path.includes('\\') && !e.path.split('/').some(p => !p || p === '.' || p === '..')
      && !seen.has(e.path.toLowerCase()) && Number.isSafeInteger(e.size) && e.size >= 0 && /^[a-f0-9]{64}$/.test(e.sha256), 'PACKAGE_ENTRY');
    seen.add(e.path.toLowerCase());
    const target = path.join(root, ...e.path.split('/'));
    need(inside(root, target) && target.length < 240, 'PACKAGE_PATH');
    noLinks(root, target, io);
    const actual = io.readFileSync(target);
    need(actual.length === e.size && hash(actual) === e.sha256, 'PACKAGE_FILE_HASH');
  }
  // Full tree: reject injected files, including an extra app.asar/main or SQLite.
  function walk(dir, relative = '') {
    for (const e of io.readdirSync(dir, { withFileTypes: true })) {
      const rel = relative + e.name;
      need(!e.isSymbolicLink(), 'PACKAGE_EXTRA_LINK');
      if (dir === root && e.name === 'portable-data' && root === c.package_root) continue;
      if (e.isDirectory()) walk(path.join(dir, e.name), rel + '/');
      else need(seen.has(rel.toLowerCase()) || rel === 'release-manifest.json', 'PACKAGE_EXTRA_FILE');
    }
  }
  walk(root);
  return { source_commit: m.source_commit, files: m.files.length, manifest_sha256: hash(bytes) };
}
function verifyBinding(c) {
  noLinks(c.run_root, c.source_binding_path);
  const bytes = fs.readFileSync(c.source_binding_path);
  need(hash(bytes) === c.source_binding_sha256, 'SOURCE_BINDING_HASH');
  const b = JSON.parse(bytes.toString('utf8'));
  need(b.schema_version === 1 && b.source_commit === c.source_commit && b.zip_sha256 === c.zip_sha256
    && b.manifest_sha256 === c.manifest_sha256 && b.driver_sha256 === c.driver_sha256
    && b.source_tree && /^[a-f0-9]{40}$/.test(b.source_tree)
    && b.product_files.length > 10, 'SOURCE_BINDING_IDENTITY');
  for (const e of b.product_files) {
    need(/^resources\/app\/product\//.test(e.path), 'SOURCE_BINDING_PATH');
    const target = path.join(c.input_package_root, ...e.path.split('/'));
    noLinks(c.input_package_root, target);
    need(hash(fs.readFileSync(target)) === e.sha256, 'SOURCE_BINDING_PRODUCT_HASH');
  }
  return { source_tree: b.source_tree, product_files: b.product_files.length };
}

const DOC = { schemaVersion: 1, format: 'docx', blocks: [{ type: 'heading', level: 1, text: '办公样本' }, { type: 'paragraph', text: '原稿甲' }] };
const COPY = { schemaVersion: 1, format: 'docx', blocks: [{ type: 'heading', level: 1, text: '办公样本' }, { type: 'paragraph', text: '副本乙' }] };
const BOOK = { schemaVersion: 1, format: 'xlsx', sheets: [{ name: '数据', rows: [['项目','数量'],['样本',2]] }] };
const FILES = { doc: '原稿 样本.docx', book: '数据 样本.xlsx', copy: '修改 副本.docx', poison: '未回答不得生成.docx' };
function makeFixtureState() { return { phase: 'ready', requests: 0, probes: 0, sequence: 0, pending: null, stopped: false, errors: [] }; }
function call(state, name, args) {
  const id = `a942o-${++state.sequence}`;
  state.pending = { id, name, args };
  return { tool_calls: [{ index: 0, id, type: 'function', function: { name, arguments: JSON.stringify(args) } }] };
}
function documentArgs(file, content) { return { path: file, content: JSON.stringify(content) }; }
function fixtureStep(state, parsed) {
  need(!state.stopped, 'FIXTURE_STOPPED');
  need(parsed && Array.isArray(parsed.messages) && Array.isArray(parsed.tools), 'FIXTURE_REQUEST_SCHEMA');
  const tools = parsed.tools.map(t => t.function && t.function.name);
  if (tools.includes('probe_test_echo')) {
    need(state.phase === 'ready' && ++state.probes === 1 && tools.length === 1, 'FIXTURE_PROBE_REPLAY');
    return { tool_calls: [{ index: 0, id: 'a942o-probe', type: 'function', function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] };
  }
  for (const name of ['ask_user','document_write_copy','document_read','document_inspect']) need(tools.includes(name), 'FIXTURE_TOOLS_MISSING');
  let lastUser = -1;
  parsed.messages.forEach((m, i) => { if (m.role === 'user') lastUser = i; });
  const text = lastUser >= 0 ? parsed.messages[lastUser].content : '';
  if (state.phase === 'ready' || state.phase === 'new_done' || state.phase === 'copy_done') {
    const expected = state.phase === 'ready' ? 'a942:office:new' : state.phase === 'new_done' ? 'a942:office:copy' : 'a942:office:cancel';
    need(text === expected, 'FIXTURE_PROMPT');
    if (state.phase === 'new_done') { state.phase = 'copy_read'; return call(state, 'document_read', { path: FILES.doc }); }
    const cancelling = state.phase === 'copy_done';
    state.phase = cancelling ? 'cancel_wait' : 'answer_wait';
    const result = call(state, 'ask_user', { prompt: cancelling ? '取消本次办公生成？' : '确认小样本内容？', options: ['小样本'] });
    // Core must discard the rest of this batch on needs_input.
    result.tool_calls.push({ index: 1, id: 'a942o-never', type: 'function', function: {
      name: 'document_write_copy', arguments: JSON.stringify(documentArgs(FILES.poison, DOC)) } });
    return result;
  }
  need(state.phase !== 'answer_wait' && state.phase !== 'cancel_wait', 'FIXTURE_UNANSWERED_REDISPATCH');
  if (state.phase === 'answer_allowed') {
    need(JSON.stringify(parsed.messages).includes('小样本') && JSON.stringify(parsed.messages).includes('answered'), 'FIXTURE_ANSWER_MISSING');
    state.phase = 'new_doc'; return call(state, 'document_write_copy', documentArgs(FILES.doc, DOC));
  }
  const pending = state.pending;
  need(pending, 'FIXTURE_PENDING');
  const matches = parsed.messages.filter(m => m.role === 'tool' && m.tool_call_id === pending.id);
  need(matches.length === 1, 'FIXTURE_TOOL_RESULT_ID');
  let result;
  try { result = JSON.parse(matches[0].content); } catch (_) { throw new Error('FIXTURE_TOOL_RESULT_JSON'); }
  need(result && !result.error && result.path === pending.args.path, 'FIXTURE_TOOL_FAILED');
  const reading = pending.name !== 'document_write_copy';
  if (reading) need(/^[a-f0-9]{64}$/.test(result.sha256), 'FIXTURE_SOURCE_HASH');
  else need(result.created === true && result.bytesWritten > 0 && result.fidelity === 'content_only', 'FIXTURE_WRITE_FACT');
  if (state.phase === 'new_doc') { state.phase = 'new_book'; return call(state, 'document_write_copy', documentArgs(FILES.book, BOOK)); }
  if (state.phase === 'new_book') { state.phase = 'inspect_doc'; return call(state, 'document_inspect', { path: FILES.doc }); }
  if (state.phase === 'inspect_doc') {
    need(result.canModify === true, 'FIXTURE_INSPECT_FACT');
    state.phase = 'read_doc'; return call(state, 'document_read', { path: FILES.doc });
  }
  if (state.phase === 'read_doc') {
    need(JSON.stringify(result).includes('原稿甲'), 'FIXTURE_DOC_CONTENT');
    state.sourceHash = result.sha256; state.phase = 'inspect_book'; return call(state, 'document_inspect', { path: FILES.book });
  }
  if (state.phase === 'inspect_book') { state.phase = 'read_book'; return call(state, 'document_read', { path: FILES.book }); }
  if (state.phase === 'read_book') {
    need(JSON.stringify(result).includes('项目'), 'FIXTURE_BOOK_CONTENT'); state.phase = 'new_done'; state.pending = null;
    return { content: '本地夹具：已生成并读取真实DOCX/XLSX小样本。' };
  }
  if (state.phase === 'copy_read') {
    need(result.sha256 === state.sourceHash, 'FIXTURE_ORIGINAL_CHANGED'); state.phase = 'copy_write';
    return call(state, 'document_write_copy', { ...documentArgs(FILES.copy, COPY), sourcePath: FILES.doc, sourceSha256: result.sha256 });
  }
  if (state.phase === 'copy_write') {
    need(result.sourceSha256 === state.sourceHash && result.sourcePath === FILES.doc, 'FIXTURE_COPY_BINDING');
    state.phase = 'copy_verify'; return call(state, 'document_read', { path: FILES.copy });
  }
  if (state.phase === 'copy_verify') {
    need(JSON.stringify(result).includes('副本乙'), 'FIXTURE_COPY_CONTENT'); state.phase = 'copy_done'; state.pending = null;
    return { content: '本地夹具：已按原稿哈希生成新副本，未覆盖原稿。' };
  }
  throw new Error('FIXTURE_UNKNOWN_PHASE');
}
function startFixture(log = () => {}, options = {}) {
  const state = makeFixtureState(); const sockets = new Set();
  const server = http.createServer((req, res) => {
    req.setEncoding('utf8'); // Preserve Chinese across HTTP chunk boundaries.
    let body = ''; let refused = false;
    const refuse = code => {
      if (refused) return; refused = true; state.stopped = true; state.errors.push(code);
      log({ kind: 'refused', code });
      res.writeHead(400, { 'Content-Type': 'application/json' }); res.end('{"error":{"message":"local fixture refused"}}');
    };
    req.on('error', () => refuse('FIXTURE_REQUEST_ERROR'));
    req.on('data', chunk => { if (refused) return; body += chunk; if (Buffer.byteLength(body) > 1024 * 1024) refuse('FIXTURE_BODY_LIMIT'); });
    req.on('end', () => {
      if (refused) return;
      try {
        need(req.method === 'POST' && req.url === '/v1/chat/completions', 'FIXTURE_ROUTE');
        need(!options.deadline || Date.now() < options.deadline, 'FIXTURE_DEADLINE');
        need(++state.requests <= 16, 'FIXTURE_REQUEST_LIMIT');
        const delta = fixtureStep(state, JSON.parse(body));
        log({ kind: delta.tool_calls ? delta.tool_calls[0].function.name : 'final', request: state.requests, phase: state.phase });
        res.writeHead(200, { 'Content-Type': 'text/event-stream' });
        res.end(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
      } catch (error) { refuse(safeError(error)); }
    });
  });
  server.on('connection', socket => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  return { state, listen: () => new Promise((resolve, reject) => {
    server.once('error', reject); server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/v1`));
  }), stop: () => { state.stopped = true; },
  close: () => new Promise(resolve => { state.stopped = true; for (const s of sockets) s.destroy(); server.close(resolve); }) };
}

function parseTaskNames(csv) {
  return csv.replace(/\r/g, '').split('\n').filter(line => line.trim()).map(line => {
    const match = /^(?:"((?:[^"]|"")*)"|([^,]+)),/.exec(line);
    need(match, 'TASK_QUERY_PARSE'); return (match[1] || match[2]).replace(/""/g, '"');
  });
}
function currentTasks(config) {
  const result = cp.spawnSync(path.join(process.env.SystemRoot, 'System32/schtasks.exe'), ['/query','/fo','csv','/nh'],
    { encoding: 'utf8', windowsHide: true, timeout: 10000, maxBuffer: 2 * 1024 * 1024 });
  need(!result.error && result.status === 0 && result.stdout.trim(), 'TASK_QUERY_FAILED');
  return parseTaskNames(result.stdout).filter(name => name.toLowerCase() === ('\\' + config.task_name).toLowerCase());
}
async function postflight(config) {
  currentIdentity(config);
  const file = path.join(config.run_root, 'POSTFLIGHT.json'); need(!fs.existsSync(file), 'POSTFLIGHT_REUSE');
  const r = { schema_version: 1, evidence_class: 'DEV_CHANNEL', status: 'HALTED', source_commit: config.source_commit,
    zip_sha256: config.zip_sha256, driver_sha256: config.driver_sha256 };
  try {
    need(hash(fs.readFileSync(__filename)) === config.driver_sha256, 'POSTFLIGHT_DRIVER_HASH');
    const prior = JSON.parse(fs.readFileSync(path.join(config.run_root, 'RESULT.json'), 'utf8'));
    need(prior.status === 'PRODUCT_CHECKS_COMPLETE_POSTFLIGHT_REQUIRED' && prior.driver_sha256 === config.driver_sha256
      && prior.zip_sha256 === config.zip_sha256, 'POSTFLIGHT_PRIOR_RESULT');
    const rows = processRows();
    const own = observedTree(rows, process.pid)[0];
    const launcher = rows.find(row => row.pid === own.parent);
    need(launcher && launcher.image.toLowerCase() === config.cmd_path.toLowerCase(), 'POSTFLIGHT_PARENT');
    r.tasks = currentTasks(config); need(r.tasks.length === 0, 'POSTFLIGHT_TASK_REMAINS');
    r.processes = processObservation(prior.observed_process_tree, rows, config.session_id);
    r.unexpected_root_instances = rows.filter(row => row.image && [config.run_root,config.package_root,config.input_package_root].some(root => inside(root,row.image))
      && ![own,launcher].some(known => known.pid === row.pid && known.created === row.created));
    need(r.processes.blocking_instances.length === 0 && r.unexpected_root_instances.length === 0, 'POSTFLIGHT_PROCESS_REMAINS');
    r.status = 'DEV_CHANNEL_COMPLETE';
  } catch (error) { r.first_failure = safeError(error); process.exitCode = 1; }
  fs.writeFileSync(file, JSON.stringify(r, null, 2) + '\n', { flag: 'wx' });
}

async function controller(config) {
  currentIdentity(config); // Never create evidence under an unverified identity.
  need(Date.now() < Date.parse(config.deadline_utc) - 600000, 'WINDOW_NO_NEW_SCENARIO');
  for (const target of [config.run_root, config.input_package_root, config.zip_path]) noLinks(ROOT, target);
  for (const target of [config.package_root, config.workspace_root, path.join(config.run_root, 'RESULT.json')]) need(!fs.existsSync(target), 'OUTPUT_REUSE');
  const report = path.join(config.run_root, 'RESULT.json');
  fs.writeFileSync(report, '{}\n', { flag: 'wx' });
  const result = { schema_version: 1, evidence_class: 'DEV_CHANNEL', status: 'IN_PROGRESS',
    source_commit: config.source_commit, zip_sha256: config.zip_sha256, manifest_sha256: config.manifest_sha256,
    driver_sha256: config.driver_sha256, source_binding_sha256: config.source_binding_sha256,
    real_model_requests: 0, started_at: new Date().toISOString(), task_cleanup: 'NOT_PERFORMED_EXTERNAL_POSTFLIGHT_REQUIRED' };
  let observed = []; let observer; let observationError;
  try {
    result.identity = currentIdentity(config);
    const rows = processRows(); const launcher = rows.find(r => r.pid === result.identity.parent);
    need(launcher && launcher.image.toLowerCase() === config.cmd_path.toLowerCase() && launcher.created, 'CONTROLLER_PARENT_IDENTITY');
    const own = [result.identity, launcher];
    const unexpected = rows => rows.filter(row => row.image && [config.run_root, config.package_root, config.input_package_root].some(root => inside(root, row.image))
      && !own.some(known => known.pid === row.pid && known.created === row.created)
      && !observed.some(known => known.pid === row.pid && known.created === row.created));
    need(unexpected(rows).length === 0, 'PREEXISTING_TRIAL_PROCESS');
    need(currentTasks(config).length === 1, 'LAUNCHER_TASK_IDENTITY');
    need(hash(fs.readFileSync(__filename)) === config.driver_sha256, 'DRIVER_HASH');
    need(hash(fs.readFileSync(config.zip_path)) === config.zip_sha256, 'ZIP_HASH');
    result.binding = verifyBinding(config);
    result.original = verifyPackage(config, config.input_package_root);
    result.copy = copyPortablePackage(config);
    result.package = verifyPackage(config);
    need(hash(fs.readFileSync(config.cmd_path)) === hash(fs.readFileSync(path.join(process.env.SystemRoot, 'System32/cmd.exe'))), 'CMD_COPY_HASH');
    const runtime = prepareDriverRuntime(config);
    // Do not put mutable/unchecked executable paths into the strict input config.
    result.driver_runtime = runtime;
    fs.writeFileSync(path.join(config.run_root, 'runtime-config.json'), JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
    save(report, result);
    need(Date.now() < Date.parse(config.deadline_utc) - 600000, 'WINDOW_NO_NEW_SCENARIO');
    const area = path.join(config.run_root, 'environment'); const env = cleanEnvironment(area, false);
    for (const key of ['LOCALAPPDATA','APPDATA','USERPROFILE','TEMP']) fs.mkdirSync(env[key], { recursive: true });
    const out = fs.openSync(path.join(config.run_root, 'ui-stdout.bin'), 'wx');
    const err = fs.openSync(path.join(config.run_root, 'ui-stderr.bin'), 'wx');
    try {
      result.exit = await new Promise((resolve, reject) => {
        const child = cp.spawn(runtime.executable, [runtime.app_root, '--ui', '--config', path.join(config.run_root, 'runtime-config.json'), '--portable'],
          { env, cwd: config.run_root, windowsHide: false, stdio: ['ignore', out, err] });
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, Math.min(300000, Date.parse(config.deadline_utc) - Date.now()));
        observer = setInterval(() => {
          try {
            const rows = processRows();
            observed = observed.length ? extendObservedTree(observed, rows, config.session_id) : observedTree(rows, child.pid);
            result.observed_process_tree = observed; save(report, result);
          } catch (_) { observationError = 'PROCESS_OBSERVATION_FAILED'; }
        }, 1500);
        child.once('error', error => { clearTimeout(timer); clearInterval(observer); reject(error); });
        child.once('exit', (code, signal) => { clearTimeout(timer); clearInterval(observer); resolve({ pid: child.pid, code, signal, timed_out: timedOut }); });
      });
    } finally { fs.closeSync(out); fs.closeSync(err); }
    need(!result.exit.timed_out && result.exit.code === 0 && result.exit.signal === null, 'UI_EXIT_UNEXPECTED');
    need(!observationError, 'PROCESS_OBSERVATION_FAILED');
    result.ui = JSON.parse(fs.readFileSync(path.join(config.run_root, 'ui-result.json'), 'utf8'));
    for (const name of ['ui-stdout.bin','ui-stderr.bin']) need(!/a942-local-[a-f0-9]{32}/.test(fs.readFileSync(path.join(config.run_root, name), 'utf8')), 'SECRET_IN_PROCESS_LOG');
    need(result.ui.status === 'CHECKS_COMPLETE' && result.ui.normal_quit === true, 'UI_INCOMPLETE');
    // UI and controller must have observed the same actual account/session.
    need(result.ui.identity.sid === result.identity.sid && result.ui.identity.session === result.identity.session, 'UI_IDENTITY_DRIFT');
    for (const row of result.ui.process_tree) if (!observed.some(r => r.pid === row.pid && r.created === row.created)) observed.push(row);
    await waitFor(() => {
      const rows = processRows(); observed = extendObservedTree(observed, rows, config.session_id);
      result.observed_process_tree = observed;
      result.last_process_observation = { at: new Date().toISOString(), ...processObservation(observed, rows, config.session_id), unexpected_root_instances: unexpected(rows) };
      save(report, result);
      return result.last_process_observation.blocking_instances.length === 0 && result.last_process_observation.unexpected_root_instances.length === 0;
    }, Math.min(40000, Date.parse(config.deadline_utc) - Date.now()), 'PRODUCT_TREE_ENDED');
    const Database = require(path.join(config.package_root, 'resources/native/storage/node_modules/better-sqlite3'));
    const db = new Database(path.join(config.data_root, 'a9/a9-state.db'), { readonly: true, fileMustExist: true });
    try {
      result.database = {
        workspace_locks: db.prepare('SELECT workspace_path,owner_id FROM a9_workspace_locks').all(),
        workspaces: db.prepare('SELECT workspace_path,permission_mode FROM a9_workspaces').all(),
        turns: db.prepare('SELECT turn_id,status FROM a9_turns').all(),
        questions: db.prepare("SELECT event_type,count(*) AS count FROM a9_events WHERE event_type IN ('question_pending','question_resolved') GROUP BY event_type").all(),
        tool_facts: db.prepare("SELECT turn_id,payload_json FROM a9_events WHERE event_type='tool_end'").all().map(r => {
          const p = JSON.parse(r.payload_json).data; need(p && p.toolName, 'SQLITE_EVENT_SCHEMA'); return { turn_id: r.turn_id, tool: p.toolName, result_sha256: hash(JSON.stringify(p)) };
        }),
      };
      const q = result.database.questions;
      need(q.find(r => r.event_type === 'question_pending' && r.count === 2)
        && q.find(r => r.event_type === 'question_resolved' && r.count === 2), 'SQLITE_QUESTION_FACTS');
      const events = db.prepare("SELECT payload_json FROM a9_events WHERE event_type='tool_end'").all().map(r => JSON.parse(r.payload_json).data);
      for (const tool of ['document_write_copy','document_read','document_inspect']) need(events.some(e => e.toolName === tool && typeof e.result === 'string' && !JSON.parse(e.result).error), 'SQLITE_TOOL_FACTS');
    } finally { db.close(); }
    need(result.database.workspace_locks.length === 0, 'PRODUCT_LOCK_REMAINS');
    need(result.database.workspaces.length === 1 && result.database.workspaces[0].workspace_path === path.win32.resolve(config.workspace_root).toLowerCase()
      && result.database.workspaces[0].permission_mode === 'full_access', 'WORKSPACE_PERSISTENCE');
    need(result.database.turns.length >= 3 && !result.database.turns.some(r => ['active','interrupted','failed'].includes(r.status)), 'TURN_PERSISTENCE');
    result.launcher_tasks = currentTasks(config);
    need(result.launcher_tasks.length === 1, 'LAUNCHER_TASK_IDENTITY');
    result.package_after = verifyPackage(config); result.original_after = verifyPackage(config, config.input_package_root);
    result.status = 'PRODUCT_CHECKS_COMPLETE_POSTFLIGHT_REQUIRED';
  } catch (error) { result.status = 'HALTED'; result.first_failure = safeError(error); process.exitCode = 1; }
  finally {
    clearInterval(observer); result.ended_at = new Date().toISOString(); save(report, result);
    process.stdout.write(JSON.stringify({ status: result.status, first_failure: result.first_failure || null }) + '\n');
  }
}

async function ui(config) {
  const { app, BrowserWindow, dialog, ipcMain } = require('electron');
  const report = path.join(config.run_root, 'ui-result.json');
  const result = { schema_version: 1, evidence_class: 'DEV_CHANNEL', status: 'IN_PROGRESS', normal_quit: false,
    checks: [], ipc: [], fixture: [], source_commit: config.source_commit, zip_sha256: config.zip_sha256 };
  const persist = () => save(report, result);
  const check = (name, ok) => { result.checks.push({ name, ok: Boolean(ok) }); persist(); need(ok, name); };
  let win; let fixture; let deadlineTimer;
  const evaluate = code => win.webContents.executeJavaScript(code);
  const wait = (fn, ms, name) => waitFor(fn, Math.min(ms, Date.parse(config.deadline_utc) - Date.now()), name);
  const snapshot = async () => {
    const r = await evaluate('window.win7Agent.a9.snapshot()'); need(r && r.ok && r.snapshot, 'SNAPSHOT_FAILED'); return r.snapshot;
  };
  const click = async selector => {
    const point = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});
      if(!e||e.disabled||e.hidden)throw new Error('UI_ACTION_UNAVAILABLE');e.scrollIntoView({block:'center'});
      const r=e.getBoundingClientRect(),x=Math.floor(r.left+r.width/2),y=Math.floor(r.top+r.height/2),hit=document.elementFromPoint(x,y);
      if(r.width<=0||r.height<=0||x<0||y<0||x>=innerWidth||y>=innerHeight||!hit||!(hit===e||e.contains(hit)))throw new Error('UI_ACTION_OCCLUDED');return {x,y};})()`);
    win.focus();
    for (const type of ['mouseMove','mouseDown','mouseUp']) win.webContents.sendInputEvent({ type, ...point, ...(type === 'mouseMove' ? {} : { button: 'left', clickCount: 1 }) });
  };
  const fill = async (selector, value) => {
    await click(selector);
    await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await win.webContents.insertText(value);
    await wait(() => evaluate(`document.querySelector(${JSON.stringify(selector)}).value===${JSON.stringify(value)}`), 5000, 'INPUT_VALUE');
  };
  const submit = async prompt => {
    need(Date.now() < Date.parse(config.deadline_utc) - 600000, 'WINDOW_NO_NEW_SCENARIO');
    await wait(() => evaluate('!document.getElementById("task-prompt").disabled'), 10000, 'COMPOSER_READY');
    await fill('#task-prompt', prompt);
    await wait(() => evaluate('!document.getElementById("run-task").disabled'), 10000, 'SUBMIT_READY');
    need(Date.now() < Date.parse(config.deadline_utc) - 600000, 'WINDOW_NO_NEW_SCENARIO');
    await click('#run-task');
  };
  const completed = phase => wait(async () => {
    const s = await snapshot(); return fixture.state.phase === phase && !s.pendingQuestion && ['completed','completed_with_warnings'].includes(s.agentStatus) ? s : null;
  }, 45000, 'TURN_COMPLETED');
  const screenshot = async name => {
    await evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.join(config.run_root, name + '.png'), (await win.webContents.capturePage()).toPNG(), { flag: 'wx' });
  };
  dialog.showOpenDialog = async (_owner, options) => {
    need(options && options.properties && options.properties.includes('openDirectory'), 'UNEXPECTED_FILE_PICKER');
    return { canceled: false, filePaths: [config.workspace_root] };
  };
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) => handle(channel, async (...args) => {
    const response = await listener(...args);
    if (channel === 'product:a9-request') {
      const action = args[1] && args[1].action;
      result.ipc.push({ action, ok: response && response.ok === true,
        ...(action === 'a9.checkpoint.undoTurn' && response ? { outcome: response.outcome } : {}) });
      need(result.ipc.length <= 1200, 'IPC_LOG_LIMIT');
    }
    return response;
  });
  app.on('will-quit', () => { clearTimeout(deadlineTimer); result.normal_quit = true; persist(); });
  try {
    result.identity = currentIdentity(config);
    need(hash(fs.readFileSync(__filename)) === config.driver_sha256, 'UI_DRIVER_HASH');
    check('PORTABLE_FLAG', process.argv.includes('--portable'));
    need(!fs.existsSync(config.workspace_root) && !fs.existsSync(config.data_root), 'UI_OUTPUT_REUSE');
    fs.mkdirSync(config.workspace_root);
    app.setPath('crashDumps', path.join(config.run_root, 'environment/temp'));
    fixture = startFixture(entry => { result.fixture.push(entry); persist(); }, { deadline: Date.parse(config.deadline_utc) });
    const url = await fixture.listen();
    const sentinel = 'a942-local-' + crypto.randomBytes(16).toString('hex');
    // Only a hash is persisted. No request bodies, credentials, or raw errors are logged.
    result.secret_sentinel_sha256 = hash(sentinel);
    require(path.join(config.package_root, 'resources/app/product/main.js'));
    check('PRODUCT_DATA_ROOT', app.getPath('userData') === config.data_root);
    await app.whenReady();
    win = await wait(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/renderer/workbench.html')), 30000, 'WORKBENCH');
    deadlineTimer = setTimeout(() => { fixture.stop(); result.status = 'HALTED'; result.first_failure = 'WINDOW_DEADLINE'; persist(); win.close(); }, Math.max(1, Date.parse(config.deadline_utc) - Date.now()));
    await wait(() => evaluate('document.readyState==="complete"&&Boolean(window.win7Agent&&window.win7Agent.a9)'), 20000, 'RENDERER');
    await wait(() => win.isVisible() && !win.isMinimized(), 15000, 'VISIBLE');
    await click('#workspace-select');
    await wait(async () => (await snapshot()).activeConversationId, 20000, 'WORKSPACE');
    await wait(() => evaluate('document.getElementById("a9-mode-dialog").open'), 10000, 'MODE_DIALOG');
    await click('input[name="a9-mode-choice"][value="full_access"]'); await click('#a9-mode-apply');
    await wait(async () => (await snapshot()).mode === 'full_access', 10000, 'FULL_ACCESS');
    await click('#a9-provider-open');
    await fill('#a9-provider-url', url); await fill('#a9-provider-model', 'a942-local-scripted'); await fill('#a9-provider-key', sentinel);
    check('REMEMBER_OFF', await evaluate('!document.getElementById("a9-provider-remember").checked'));
    await click('#a9-provider-apply');
    await wait(() => evaluate('!document.getElementById("a9-provider-apply").disabled&&document.getElementById("a9-provider-probe-state").textContent==="tool_calling"'), 20000, 'PROBE');
    await click('#settings-drawer header [data-close]');
    await submit('a942:office:new');
    const waiting = await wait(async () => { const s = await snapshot(); return s.agentStatus === 'needs_input' && s.pendingQuestion ? s : null; }, 20000, 'QUESTION');
    const requests = fixture.state.requests;
    // Observe genuine product idle behavior; snapshot polling does not cause model dispatch.
    await delay(1200);
    check('UNANSWERED_NO_REDISPATCH_OR_WRITE', fixture.state.requests === requests && fs.readdirSync(config.workspace_root).every(f => !/\.(docx|xlsx)$/.test(f)));
    check('QUESTION_CARD_VISIBLE', await evaluate('!document.getElementById("a9-question-host").hidden'));
    await screenshot('question');
    fixture.state.phase = 'answer_allowed';
    await click('#a9-question-card input[type="radio"]'); await click('#a9-question-card .a9-question-actions button:first-child');
    const created = await completed('new_done'); result.new_turns = created.checkpoints.map(c => c.turnId);
    need(fixture.state.phase === 'new_done', 'NEW_FIXTURE_INCOMPLETE');
    result.original_sha256 = hash(fs.readFileSync(path.join(config.workspace_root, FILES.doc)));
    result.book_sha256 = hash(fs.readFileSync(path.join(config.workspace_root, FILES.book)));
    check('REAL_OFFICE_FILES', fs.readFileSync(path.join(config.workspace_root, FILES.doc)).subarray(0,2).toString() === 'PK'
      && fs.readFileSync(path.join(config.workspace_root, FILES.book)).subarray(0,2).toString() === 'PK');
    const beforeCopy = new Set((await snapshot()).checkpoints.map(c => c.turnId));
    await submit('a942:office:copy'); const copied = await completed('copy_done');
    const copyTurns = copied.checkpoints.filter(c => !beforeCopy.has(c.turnId));
    need(copyTurns.length === 1, 'COPY_CHECKPOINT_COUNT');
    result.copy_turn = copyTurns[0].turnId;
    need(typeof result.copy_turn === 'string', 'COPY_TURN_ID');
    check('COPY_SOURCE_BOUND_ORIGINAL_UNCHANGED', fixture.state.phase === 'copy_done' && fixture.state.sourceHash === result.original_sha256
      && hash(fs.readFileSync(path.join(config.workspace_root, FILES.doc))) === result.original_sha256
      && hash(fs.readFileSync(path.join(config.workspace_root, FILES.copy))) !== result.original_sha256);
    for (let i = 0; i < 12 && await evaluate('Boolean(document.querySelector("#a9-task-stream .activity-group:not([open]) > summary"))'); i += 1) {
      await click('#a9-task-stream .activity-group:not([open]) > summary');
    }
    result.dom_tools = await evaluate('document.getElementById("a9-task-stream").innerText');
    check('UI_OFFICE_TOOL_RECORDS', await evaluate('["document_write_copy","document_read","document_inspect"].every(name=>Array.from(document.querySelectorAll("#a9-task-stream .activity-tool")).some(e=>e.title===name))'));
    check('UI_REAL_TOOL_FACTS', [FILES.doc,FILES.copy].every(f => result.dom_tools.includes(f)));
    await click('#inspector-tab-changes');
    await screenshot('office-copy');
    await click(`button[aria-label="撤销 ${result.copy_turn}"]`);
    await wait(() => !fs.existsSync(path.join(config.workspace_root, FILES.copy)), 15000, 'CHECKPOINT_UNDO');
    check('UNDO_ORIGINAL_AND_BOOK_PRESERVED', hash(fs.readFileSync(path.join(config.workspace_root, FILES.doc))) === result.original_sha256
      && hash(fs.readFileSync(path.join(config.workspace_root, FILES.book))) === result.book_sha256
      && await evaluate('document.getElementById("a9-undo-state").textContent.includes("已撤销")'));
    await submit('a942:office:cancel');
    const cancel = await wait(async () => { const s = await snapshot(); return s.pendingQuestion && s.pendingQuestion.questionId !== waiting.pendingQuestion.questionId ? s.pendingQuestion : null; }, 15000, 'CANCEL_QUESTION');
    const beforeCancel = fixture.state.requests;
    await click('#a9-question-card .a9-question-actions button:last-child');
    await wait(async () => !(await snapshot()).pendingQuestion, 10000, 'QUESTION_CANCELLED');
    // A late reply uses the real preload and strict IPC; no Runtime reference is obtained.
    const late = await evaluate(`window.win7Agent.a9.replyQuestion(${JSON.stringify(cancel.conversationId)},${JSON.stringify(cancel.questionId)},${cancel.revision},'answered','小样本')`);
    await delay(1200);
    check('CANCEL_LATE_REPLY_NO_REDISPATCH', late && late.ok === false && fixture.state.requests === beforeCancel
      && !fs.existsSync(path.join(config.workspace_root, FILES.poison)));
    check('NO_FIXTURE_ERRORS', fixture.state.errors.length === 0);
    check('RENDERER_ISOLATED', await evaluate('typeof require==="undefined"&&typeof process==="undefined"'));
    // Scan full real DB projections while the sentinel is memory-only.
    const Database = require(path.join(config.package_root, 'resources/native/storage/node_modules/better-sqlite3'));
    const db = new Database(path.join(config.data_root, 'a9/a9-state.db'), { readonly: true, fileMustExist: true });
    try { check('SECRET_NOT_IN_STATE', !JSON.stringify(db.prepare('SELECT payload_json FROM a9_events').all()).includes(sentinel)); } finally { db.close(); }
    result.fixture_requests = fixture.state.requests;
    result.process_tree = observedTree(processRows(), process.pid);
    await screenshot('undo-and-cancel');
    fixture.stop(); await fixture.close(); fixture = null;
    result.status = 'CHECKS_COMPLETE'; persist(); win.close();
  } catch (error) {
    result.status = 'HALTED'; result.first_failure = safeError(error);
    try { result.process_tree = observedTree(processRows(), process.pid); } catch (_) { result.process_query = 'UNKNOWN'; }
    persist(); if (fixture) { await fixture.close(); fixture = null; }
    if (win) win.close(); else app.quit();
  }
}
module.exports = { validateConfig, canonical, noLinks, verifyPackage, verifyBinding, hash, safeError,
  makeFixtureState, fixtureStep, startFixture, DOC, COPY, BOOK, FILES, processObservation, parseTaskNames };
if (require.main === module) {
  try {
    const args = process.argv.slice(2); const configFile = args[args.indexOf('--config') + 1];
    const config = validateConfig(JSON.parse(fs.readFileSync(configFile, 'utf8')));
    need(inside(config.run_root, path.resolve(configFile)), 'CONFIG_LOCATION');
    noLinks(config.run_root, path.resolve(configFile));
    Promise.resolve(args.includes('--ui') ? ui(config) : args.includes('--postflight') ? postflight(config) : controller(config)).catch(error => {
      process.stderr.write(safeError(error) + '\n'); process.exitCode = 1;
    });
  } catch (error) { process.stderr.write(safeError(error) + '\n'); process.exitCode = 1; }
}

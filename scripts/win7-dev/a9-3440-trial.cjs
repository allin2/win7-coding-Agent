'use strict';

// Candidate-external DEV_CHANNEL driver for A9-34/A9-40. No product module,
// IPC implementation, State operation, Runner operation or renderer is replaced.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const http = require('http');
const cp = require('child_process');
const os = require('os');
const vm = require('vm');
const office = require('./a9-42-office-journey.cjs');

const ROOT = 'C:\\A9-DEV';
const MODES = ['progress', 'interrupt', 'recover', 'reopen'];
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const need = (condition, code) => { if (!condition) throw new Error(code); };

function inside(root, file) {
  const relative = path.win32.relative(root, file);
  return path.win32.isAbsolute(root) && path.win32.isAbsolute(file)
    && relative !== '' && !relative.startsWith('..') && !path.win32.isAbsolute(relative)
    && !relative.split(/[\\/]/).some((part) => /[:\x00-\x1f]/.test(part));
}

function validateConfig(config, options = {}) {
  need(config && config.schema_version === 1, 'CONFIG_SCHEMA');
  office.rejectDriverOverrides(options.argv || [], options.env || process.env);
  const execution = office.loadExecutionBinding(options);
  const portable = config.profile === 'portable-smoke';
  need(config.evidence_class === execution.evidence_class, 'CONFIG_EVIDENCE_CLASS');
  need(config.profile === undefined || portable, 'CONFIG_PROFILE');
  need(config.run_id === execution.run_id && config.source_commit === execution.source_commit
    && config.zip_sha256 === execution.package_sha256
    && config.manifest_sha256 === execution.manifest_sha256
    && config.helper_sha256 === execution.helper_sha256
    && config.execution_binding_sha256 === execution.sha256, 'CONFIG_PACKAGE_IDENTITY');
  need(/^[a-f0-9]{64}$/.test(config.driver_sha256)
    && /^[a-f0-9]{64}$/.test(config.source_binding_sha256), 'CONFIG_DRIVER_IDENTITY');
  const layout = execution.layout;
  for (const [key, expected] of [
    ['run_root', layout.run_root], ['package_root', layout.package_root], ['input_package_root', layout.input_package_root],
    ['workspace_root', layout.workspace_root], ['data_root', layout.data_root], ['zip_path', layout.zip_path],
    ['cmd_path', layout.cmd_path], ['source_binding_path', layout.source_binding_path],
    ['execution_binding_path', layout.execution_binding_path],
  ]) need(config[key] === expected, 'CONFIG_LAYOUT');
  need(config.task_name === layout.task_prefix + 'a93440', 'CONFIG_TASK_NAME');
  need(inside(ROOT, config.run_root) && inside(ROOT, config.package_root), 'CONFIG_ROOT');
  need(inside(config.run_root, config.package_root) && !inside(config.package_root, config.run_root), 'CONFIG_ROOTS_OVERLAP');
  need(inside(config.run_root, config.cmd_path), 'CONFIG_CMD_ROOT');
  need(config.real_model_request_limit === 0 && (Number.isFinite(Date.parse(config.deadline_utc))
    || options.allowTemplate === true && config.deadline_utc === null), 'CONFIG_BUDGET');
  if (portable) {
    need(inside(ROOT, config.input_package_root), 'CONFIG_INPUT_ROOT');
    need(config.input_package_root !== config.run_root && config.input_package_root !== config.package_root
      && !inside(config.input_package_root, config.run_root)
      && !inside(config.input_package_root, config.package_root)
      && !inside(config.package_root, config.input_package_root), 'CONFIG_INPUT_ROOT_OVERLAP');
  }
  return config;
}

function verifyExecution(config, io = fs, codeRoot) {
  if (process.platform === 'win32') office.noLinks(config.run_root, config.source_binding_path, io);
  const bytes = io.readFileSync(config.source_binding_path);
  need(hash(bytes) === config.source_binding_sha256, 'SOURCE_BINDING_HASH');
  const binding = JSON.parse(bytes.toString('utf8'));
  need(binding.schema_version === 1 && binding.source_commit === config.source_commit
    && binding.zip_sha256 === config.zip_sha256 && binding.manifest_sha256 === config.manifest_sha256
    && binding.driver_sha256 === config.driver_sha256
    && binding.execution_binding_sha256 === config.execution_binding_sha256, 'SOURCE_BINDING_IDENTITY');
  office.verifyDriverClosure(binding.execution_files, 'a9-3440-trial.cjs', io, codeRoot);
  return binding;
}
function admitConfig(config, options = {}) {
  validateConfig(config, options);
  verifyExecution(config, options.io || fs, options.codeRoot);
  return config;
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
    if (!row.created || !row.image) {
      const error = new Error('PROCESS_CURRENT_IDENTITY_UNKNOWN');
      // The last successful observation cannot identify a later failed query.
      // Retain only this instance's identity fields, never command lines.
      const identity = (value) => Object.fromEntries(
        ['pid', 'parent', 'created', 'image', 'imageSource', 'session', 'name']
          .map((key) => [key, value[key] === undefined ? null : value[key]]));
      error.process_identity_failure = { at: new Date().toISOString(),
        observed_instance: identity(old), current_instance: identity(row) };
      throw error;
    }
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

function fixtureStep(parsed, commands, allowDispatch) {
  const messages = Array.isArray(parsed.messages) ? parsed.messages : [];
  const probe = Array.isArray(parsed.tools) && parsed.tools.some((tool) => tool.function && tool.function.name === 'probe_test_echo');
  need(allowDispatch, 'FIXTURE_RESTART_REQUEST');
  if (probe) return { tool_calls: [{ index: 0, id: 'a93440-probe', type: 'function',
    function: { name: 'probe_test_echo', arguments: '{"message":"probe_ok"}' } }] };
  let userIndex = -1;
  messages.forEach((message, index) => { if (message.role === 'user') userIndex = index; });
  need(userIndex >= 0 && typeof messages[userIndex].content === 'string', 'FIXTURE_PROMPT_REQUIRED');
  const prompt = messages[userIndex].content;
  const selected = Object.keys(commands).find((mode) => prompt === `a93440:${mode}`);
  need(selected, 'FIXTURE_PROMPT_REJECTED');
  if (messages.slice(userIndex + 1).some((message) => message.role === 'tool')) return { content: 'Controlled fixture completed.' };
  return { tool_calls: [{ index: 0, id: `a93440-${selected}`, type: 'function',
    function: { name: 'start_process', arguments: JSON.stringify({ command: commands[selected] }) } }] };
}

function startFixture(commands, log) {
  const state = { requests: 0, allowDispatch: true, errors: [] };
  const server = http.createServer((request, response) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) request.destroy(new Error('FIXTURE_BODY_LIMIT'));
    });
    request.on('error', () => { state.errors.push('FIXTURE_REQUEST_ERROR'); });
    request.on('end', () => {
      state.requests += 1;
      try {
        need(request.method === 'POST' && request.url === '/v1/chat/completions', 'FIXTURE_ROUTE');
        need(state.requests <= 12, 'FIXTURE_REQUEST_LIMIT');
        const delta = fixtureStep(JSON.parse(body), commands, state.allowDispatch);
        log({ at: new Date().toISOString(), request: state.requests, kind: delta.tool_calls ? delta.tool_calls[0].function.name : 'final' });
        response.writeHead(200, { 'Content-Type': 'text/event-stream' });
        response.end(`data: ${JSON.stringify({ choices: [{ delta, finish_reason: delta.tool_calls ? 'tool_calls' : 'stop' }] })}\n\ndata: [DONE]\n\n`);
      } catch (error) {
        state.errors.push(error.message);
        response.writeHead(400, { 'Content-Type': 'application/json' });
        response.end('{"error":{"message":"fixture refused request"}}');
      }
    });
  });
  return { state, server, listen: () => new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(`http://127.0.0.1:${server.address().port}/v1`));
  }) };
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
  need(inside(config.run_root, row.image), 'RUNTIME_IMAGE');
  const execution = office.loadExecutionBinding({ executionBindingPath: config.execution_binding_path });
  need(execution.target.machine_name.toUpperCase() === os.hostname().toUpperCase()
    && execution.target.account_sid === sid, 'RUNTIME_BINDING_TARGET');
  return { host: os.hostname(), os: os.release(), user: 'agent', sid, integrity: 'Medium', ...row,
    electron: process.versions.electron, node: process.versions.node };
}

function verifyPackage(config) {
  const physicalFs = require('original-fs');
  const file = path.join(config.package_root, 'release-manifest.json');
  const bytes = physicalFs.readFileSync(file);
  need(hash(bytes) === config.manifest_sha256, 'PACKAGE_MANIFEST_HASH');
  const manifest = JSON.parse(bytes.toString('utf8'));
  need(manifest.source_commit === config.source_commit && manifest.source_dirty === false
    && manifest.external_acceptance_eligible === true, 'PACKAGE_SOURCE');
  need(Array.isArray(manifest.files) && manifest.files.length > 100, 'PACKAGE_FILES');
  for (const entry of manifest.files) {
    const target = path.resolve(config.package_root, entry.path);
    need(inside(config.package_root, target) && !physicalFs.lstatSync(target).isSymbolicLink(), 'PACKAGE_PATH');
    const actual = physicalFs.readFileSync(target);
    need(actual.length === entry.size && hash(actual) === entry.sha256, 'PACKAGE_FILE_HASH');
  }
  need(hash(physicalFs.readFileSync(path.join(config.package_root, 'resources/native/runner/spike02_helper.exe'))) === config.helper_sha256, 'PACKAGE_HELPER');
  const Database = require(path.join(config.package_root, 'resources/native/storage/node_modules/better-sqlite3'));
  const db = new Database(':memory:');
  let sqlite;
  try { sqlite = db.prepare('SELECT sqlite_version() AS version').get().version; } finally { db.close(); }
  for (const module of ['core', 'gateway', 'workspace', 'runner', 'state', 'git-adapter']) {
    require(path.join(config.package_root, 'resources/app', module, 'dist/index.js'));
  }
  return { files: manifest.files.length, sqlite, helper_sha256: config.helper_sha256, source_commit: config.source_commit };
}

function readDb(config, mode, sql, ...params) {
  const Database = require(path.join(config.package_root, 'resources/native/storage/node_modules/better-sqlite3'));
  const data = path.join(config.run_root, mode === 'progress' ? 'progress' : 'recovery', 'local', 'Win7CodingAgent', 'a9', 'a9-state.db');
  const db = new Database(data, { readonly: true, fileMustExist: true });
  try { return db.prepare(sql).all(...params); } finally { db.close(); }
}

function prepareDriverRuntime(config, physicalFs = require('original-fs')) {
  const binding = verifyExecution(config, physicalFs);
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
  office.copyDriverClosure(appRoot, 'a9-3440-trial.cjs', physicalFs);
  office.verifyDriverClosure(binding.execution_files, 'a9-3440-trial.cjs', physicalFs, appRoot);
  physicalFs.writeFileSync(path.join(appRoot, 'package.json'),
    JSON.stringify({ name: 'a93440-dev-trial', version: '1.0.0', private: true, main: 'scripts/win7-dev/a9-3440-trial.cjs' }) + '\n', { flag: 'wx' });
  return { executable: path.join(runtimeRoot, 'electron.exe'), app_root: appRoot, files: entries.length };
}

async function launchUi(config, mode) {
  const executable = config.driver_runtime.executable;
  const area = path.join(config.run_root, mode === 'portable' ? 'portable' : mode === 'progress' ? 'progress' : 'recovery');
  const env = cleanEnvironment(area, false);
  for (const key of ['LOCALAPPDATA', 'APPDATA', 'USERPROFILE', 'TEMP']) fs.mkdirSync(env[key], { recursive: true });
  const output = path.join(config.run_root, mode);
  const stdout = fs.openSync(output + '-stdout.bin', 'wx');
  const stderr = fs.openSync(output + '-stderr.bin', 'wx');
  try {
    return await new Promise((resolve, reject) => {
      const child = cp.spawn(executable, [config.driver_runtime.app_root, '--ui', mode, '--config',
        path.join(config.run_root, 'runtime-config.json'), ...(mode === 'portable' ? ['--portable'] : [])],
        { env, cwd: config.run_root, windowsHide: false, stdio: ['ignore', stdout, stderr] });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; child.kill(); }, 120000);
      child.once('error', (error) => { clearTimeout(timer); reject(error); });
      child.once('exit', (code, signal) => { clearTimeout(timer); resolve({ pid: child.pid, code, signal, timed_out: timedOut, ended_at: new Date().toISOString() }); });
    });
  } finally { fs.closeSync(stdout); fs.closeSync(stderr); }
}

async function controller(config) {
  const result = { schema_version: 1, evidence_class: config.evidence_class, status: 'IN_PROGRESS', source_commit: config.source_commit,
    zip_sha256: config.zip_sha256, execution_binding_sha256: config.execution_binding_sha256,
    real_model_requests: 0, started_at: new Date().toISOString(), stages: [] };
  const report = path.join(config.run_root, 'RESULT.json');
  save(report, result);
  let fixture;
  try {
    result.identity = currentIdentity(config);
    const initialRows = processRows();
    const launcher = initialRows.find((row) => row.pid === result.identity.parent);
    need(launcher && launcher.image.toLowerCase() === config.cmd_path.toLowerCase() && launcher.created, 'CONTROLLER_PARENT_IDENTITY');
    const controllerInstances = [result.identity, launcher];
    const unexpectedOwnedRows = (rows) => rows.filter((row) =>
      (inside(config.package_root, row.image) || inside(config.run_root, row.image))
      && !controllerInstances.some((known) => known.pid === row.pid && known.created === row.created));
    need(unexpectedOwnedRows(initialRows).length === 0, 'PREEXISTING_TRIAL_PROCESS');
    need(Date.now() < Date.parse(config.deadline_utc) - 10 * 60 * 1000, 'WINDOW_NO_NEW_SCENARIO');
    need(hash(fs.readFileSync(__filename)) === config.driver_sha256, 'DRIVER_HASH');
    verifyExecution(config);
    new vm.Script(fs.readFileSync(__filename, 'utf8'), { filename: __filename });
    result.original_package = verifyPackage({ ...config, package_root: config.input_package_root });
    result.copy = copyPortablePackage(config);
    result.package = verifyPackage(config);
    config.driver_runtime = prepareDriverRuntime(config);
    result.driver_runtime = config.driver_runtime;
    const cmdOriginal = fs.readFileSync(path.join(process.env.SystemRoot, 'System32', 'cmd.exe'));
    need(hash(fs.readFileSync(config.cmd_path)) === hash(cmdOriginal), 'CMD_COPY_HASH');
    result.cmd_sha256 = hash(cmdOriginal);
    const fixtureFile = path.join(config.run_root, 'bounded-fixture.cjs');
    // A control file makes the late frame occur only after the product Turn has
    // ended. Both commands have a 25-second independent natural-exit bound.
    fs.writeFileSync(fixtureFile, `'use strict';\nconst fs=require('fs');const path=require('path');\nconst mode=process.argv[2];const start=Date.now();\nconsole.log('A93440_EARLY');\nfs.writeFileSync(path.join(process.cwd(),'fixture-'+mode+'.json'),JSON.stringify({pid:process.pid,started_at:new Date().toISOString()}));\nlet late=false;const t=setInterval(()=>{if(mode==='progress'&&!late&&fs.existsSync('late.signal')){late=true;console.log('A93440_LATE_AFTER_TURN');setTimeout(()=>{clearInterval(t);},1500);}if(Date.now()-start>25000)clearInterval(t);},100);\n`, 'utf8');
    const commands = Object.fromEntries(['progress', 'interrupt'].map((mode) =>
      [mode, `set ELECTRON_RUN_AS_NODE=1&& "${path.join(config.package_root, 'electron.exe')}" "${fixtureFile}" ${mode}`]));
    fixture = startFixture(commands, (entry) => fs.appendFileSync(path.join(config.run_root, 'fixture-requests.jsonl'), JSON.stringify(entry) + '\n', 'utf8'));
    config.fixture_url = await fixture.listen();
    save(path.join(config.run_root, 'runtime-config.json'), config);
    for (const mode of MODES) {
      need(Date.now() < Date.parse(config.deadline_utc) - 10 * 60 * 1000, 'WINDOW_NO_NEW_SCENARIO');
      fixture.state.allowDispatch = mode === 'progress' || mode === 'interrupt';
      const requestsBefore = fixture.state.requests;
      const exit = await launchUi(config, mode);
      const stage = { mode, exit, requests_before: requestsBefore, requests_after: fixture.state.requests };
      result.stages.push(stage);
      save(report, result);
      need(!exit.timed_out && exit.signal === null && exit.code === (mode === 'interrupt' ? 86 : 0), 'UI_EXIT_UNEXPECTED');
      const ui = JSON.parse(fs.readFileSync(path.join(config.run_root, mode + '-result.json'), 'utf8'));
      stage.ui = ui;
      need(ui.status === (mode === 'interrupt' ? 'INTERRUPTION_READY' : 'CHECKS_COMPLETE'), 'UI_CHECKS_FAILED');
      need(mode === 'interrupt' || ui.normal_quit === true, 'UI_NORMAL_QUIT_MISSING');
      need(fixture.state.errors.length === 0, 'FIXTURE_FAILED');
      stage.observed_process_tree = ui.process_tree.slice();
      const absent = await waitFor(() => {
        const rows = processRows();
        stage.observed_process_tree = extendObservedTree(stage.observed_process_tree, rows, result.identity.session);
        const observation = processObservation(stage.observed_process_tree, rows, result.identity.session);
        const unexpected = unexpectedOwnedRows(rows);
        const observedAt = new Date().toISOString();
        stage.last_process_observation = { at: observedAt, ...observation,
          unexpected_root_instances: unexpected };
        if (!stage.environment_observations) stage.environment_observations = [];
        stage.environment_observations.push({ at: observedAt, instances: observation.environment_instances });
        // Preserve the actual stop-point evidence. A later empty status cannot
        // reconstruct which instance caused a lifecycle timeout.
        save(report, result);
        return observation.blocking_instances.length === 0 && unexpected.length === 0
          ? { observed_at: observedAt, rows, observation } : null;
      }, 40000, 'OBSERVED_TREE_ENDED');
      stage.process_closeout = { at: absent.observed_at, observed_count: stage.observed_process_tree.length,
        ended_observed_instances: stage.observed_process_tree.length - absent.observation.remaining_instances.length,
        blocking_instances: 0, environment_instances_still_present: absent.observation.remaining_instances.length };
      if (mode === 'interrupt') {
        need(!absent.rows.some((row) => row.pid === ui.handle.pid), 'RECOVERY_ORIGINAL_PID_PRESENT');
        stage.original_pid_absent = true;
        save(path.join(config.run_root, 'interruption-absence.json'), { pid: ui.handle.pid, checked_at: absent.observed_at, process_tree: ui.process_tree });
      } else {
        stage.workspace_locks = readDb(config, mode, 'SELECT workspace_path,owner_id FROM a9_workspace_locks');
        need(stage.workspace_locks.length === 0, 'NORMAL_QUIT_LOCK_REMAINS');
      }
      if (mode === 'recover' || mode === 'reopen') need(fixture.state.requests === requestsBefore, 'RESTART_MODEL_REPLAY');
      save(report, result);
    }
    const environmentInstances = result.stages.flatMap((stage) => stage.observed_process_tree)
      .filter((row, index, all) => isSgToolEnvironment(row, result.identity.session)
        && all.findIndex((other) => other.pid === row.pid && other.created === row.created) === index);
    if (environmentInstances.length) {
      const finalRows = processRows();
      const finalTree = extendObservedTree(environmentInstances, finalRows, result.identity.session);
      result.environment_final_observation = { at: new Date().toISOString(),
        ...processObservation(finalTree, finalRows, result.identity.session) };
      need(result.environment_final_observation.blocking_instances.length === 0, 'ENVIRONMENT_IDENTITY_CHANGED');
    }
    result.status = 'DEV_CHANNEL_COMPLETE';
  } catch (error) {
    result.status = 'HALTED';
    result.error = String(error && error.message || error).slice(0, 500);
    if (error.process_identity_failure) result.process_identity_failure = error.process_identity_failure;
    process.exitCode = 1;
  } finally {
    if (fixture) {
      result.fixture_requests = fixture.state.requests;
      result.fixture_errors = fixture.state.errors;
      await new Promise((resolve) => fixture.server.close(resolve));
    }
    result.ended_at = new Date().toISOString();
    save(report, result);
    process.stdout.write(JSON.stringify({ status: result.status, stages: result.stages.length, error: result.error || null }) + '\n');
  }
}

async function ui(config, mode) {
  const { app, BrowserWindow, dialog, ipcMain } = require('electron');
  const area = path.join(config.run_root, mode === 'progress' ? 'progress' : 'recovery');
  const workspace = path.join(area, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  app.setPath('crashDumps', path.join(area, 'temp'));
  const resultFile = path.join(config.run_root, mode + '-result.json');
  const result = { schema_version: 1, evidence_class: config.evidence_class, mode, status: 'IN_PROGRESS',
    source_commit: config.source_commit, zip_sha256: config.zip_sha256,
    execution_binding_sha256: config.execution_binding_sha256,
    started_at: new Date().toISOString(), ipc: [], checks: [], normal_quit: false };
  let win;
  const persist = () => save(resultFile, result);
  const check = (name, condition) => { result.checks.push({ name, ok: Boolean(condition) }); persist(); need(condition, name); };
  const evaluate = (source) => win.webContents.executeJavaScript(source);
  const snapshot = async () => {
    const response = await evaluate('window.win7Agent.a9.snapshot()');
    need(response && response.ok === true && response.snapshot, 'SNAPSHOT_FAILED');
    return response.snapshot;
  };
  const click = (selector) => evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});if(!e||e.disabled||e.hidden)throw new Error('UI_ACTION_UNAVAILABLE');e.click();return true;})()`);
  const screenshot = async (name) => {
    // executeJavaScript can finish before Chromium submits the changed frame.
    // Capture only after the renderer has had a complete paint opportunity.
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.join(config.run_root, name + '.png'), (await win.webContents.capturePage()).toPNG());
  };
  const uiState = () => evaluate(`(() => ({stream:document.getElementById('a9-task-stream').textContent,
    stopHidden:document.getElementById('cancel-task').hidden,newDisabled:document.getElementById('conversation-new').disabled,
    cards:document.getElementById('a9-managed-cards').innerText,dialogHidden:document.getElementById('a9-managed-dismiss-dialog').hidden}))()`);
  dialog.showOpenDialog = async (_owner, options) => {
    if (options && options.properties && options.properties.includes('openDirectory')) return { canceled: false, filePaths: [workspace] };
    if (options && /Shell/.test(options.title || '')) return { canceled: false, filePaths: [config.cmd_path] };
    throw new Error('UNEXPECTED_FILE_PICKER');
  };
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) => handle(channel, async (...args) => {
    const response = await listener(...args);
    if (channel === 'product:a9-request') {
      result.ipc.push({ action: args[1].action, ok: response && response.ok === true,
        error: response && response.error ? response.error.code : null });
      if (result.ipc.length > 500) throw new Error('IPC_LOG_LIMIT');
    }
    return response;
  });
  app.on('will-quit', () => { result.normal_quit = true; result.ended_at = new Date().toISOString(); persist(); });
  try {
    result.identity = currentIdentity(config);
    need(hash(fs.readFileSync(__filename)) === config.driver_sha256, 'UI_DRIVER_HASH');
    require(path.join(config.package_root, 'resources/app/product/main.js'));
    check('USERDATA_ISOLATED', app.getPath('userData') === path.join(area, 'local', 'Win7CodingAgent'));
    await app.whenReady();
    win = await waitFor(() => BrowserWindow.getAllWindows().find((item) => item.webContents.getURL().includes('/renderer/workbench.html')), 30000, 'WORKBENCH');
    await waitFor(() => evaluate('document.readyState === "complete" && Boolean(window.win7Agent && window.win7Agent.a9)'), 20000, 'RENDERER_READY');
    if (mode === 'progress' || mode === 'interrupt') {
      await click('#workspace-select');
      await waitFor(() => evaluate(`(() => {const e=document.getElementById('a9-surface');return e&&!e.hidden&&Boolean(e.dataset.a9Status);})()`),
        20000, 'WORKSPACE_SURFACE');
      await waitFor(async () => (await snapshot()).activeConversationId, 20000, 'WORKSPACE');
      await evaluate(`document.querySelector('input[name="a9-mode-choice"][value="full_access"]').checked=true;true`);
      await click('#a9-mode-apply');
      await waitFor(async () => (await snapshot()).mode === 'full_access', 10000, 'FULL_ACCESS');
      await evaluate(`document.getElementById('a9-shell-kind').value='cmd';true`);
      await click('#a9-shell-apply');
      await waitFor(async () => (await snapshot()).shell.path === config.cmd_path, 10000, 'EXPLICIT_CMD');
      await evaluate(`(() => {document.getElementById('a9-provider-url').value=${JSON.stringify(config.fixture_url)};
        document.getElementById('a9-provider-model').value='a93440-scripted';
        document.getElementById('a9-provider-key').value='a93440-local-fixture';
        document.getElementById('a9-provider-remember').checked=false;return true;})()`);
      await click('#a9-provider-apply');
      await waitFor(() => evaluate(`!document.getElementById('a9-provider-apply').disabled && document.getElementById('a9-provider-probe-state').textContent==='tool_calling'`), 20000, 'PROVIDER_FIXTURE');
      await evaluate(`(() => {const e=document.querySelector('.drawer:not([hidden]) [data-close]');if(e)e.click();return true;})()`);
      await evaluate(`(() => {const e=document.getElementById('task-prompt');e.value=${JSON.stringify('a93440:' + mode)};e.dispatchEvent(new Event('input',{bubbles:true}));return true;})()`);
      await click('#run-task');
      const live = await waitFor(async () => {
        const snap = await snapshot();
        const item = (snap.managedProcesses || []).find((entry) => entry.lastProbeStatus === 'running' && entry.pid > 0);
        return item && snap.agentStatus !== 'running' && snap.controls.stopKind !== 'turn' ? { snap, item } : null;
      }, 20000, 'BACKGROUND_AFTER_TURN');
      result.handle = live.item;
      result.conversation_id = live.snap.activeConversationId;
      result.process_tree = observedTree(processRows(), process.pid);
      check('REAL_BACKGROUND_PID_OBSERVED', result.process_tree.some((row) => row.pid === live.item.pid));
      if (mode === 'interrupt') {
        const facts = readDb(config, mode, 'SELECT * FROM a9_managed_processes WHERE handle_id=?', live.item.handleId);
        check('RECOVERABLE_FACT_PERSISTED', facts.length === 1 && ['running', 'starting', 'cleanup_required'].includes(facts[0].last_probe_status));
        result.status = 'INTERRUPTION_READY';
        result.interruption = 'app.exit(86) bypasses the product before-quit cleanup; deliberate abnormal exit';
        persist();
        app.exit(86);
        return;
      }
      result.turn_finished_at = new Date().toISOString();
      fs.writeFileSync(path.join(workspace, 'late.signal'), 'after-turn\n', 'utf8');
      // Do not call snapshot(), refreshSnapshot(), reload or any product action
      // while observing A9-40: only the product's own polling may update the DOM.
      result.late_dom = await waitFor(async () => {
        const state = await uiState(); return state.stream.includes('A93440_LATE_AFTER_TURN') ? state : null;
      }, 12000, 'LATE_OUTPUT_VISIBLE');
      result.terminal_dom = await waitFor(async () => {
        const state = await uiState(); return state.stopHidden && !state.newDisabled ? state : null;
      }, 12000, 'NATURAL_EXIT_CONTROLS');
      check('LATE_OUTPUT_AUTOMATIC', result.late_dom.stream.includes('A93440_LATE_AFTER_TURN'));
      check('NATURAL_EXIT_AUTOMATIC', result.terminal_dom.stopHidden && !result.terminal_dom.newDisabled);
      const terminal = await snapshot();
      const fact = terminal.managedProcesses.find((item) => item.handleId === live.item.handleId);
      check('NATURAL_EXIT_FACT', fact && fact.lastProbeStatus === 'exited' && fact.cleanupRequired !== true);
      result.output_events = readDb(config, mode, "SELECT id,event_type,payload_json FROM a9_events WHERE event_type='tool_output'");
      check('LATE_OUTPUT_PERSISTED', result.output_events.some((row) => row.payload_json.includes('A93440_LATE_AFTER_TURN')));
      await screenshot('progress-complete');
    } else {
      const previous = JSON.parse(fs.readFileSync(path.join(config.run_root, 'interrupt-result.json'), 'utf8'));
      const absence = JSON.parse(fs.readFileSync(path.join(config.run_root, 'interruption-absence.json'), 'utf8'));
      check('INDEPENDENT_PID_ABSENCE', absence.pid === previous.handle.pid && !processRows().some((row) => row.pid === absence.pid));
      await waitFor(async () => (await snapshot()).activeConversationId, 20000, 'RESTORED_WORKSPACE');
      if (mode === 'reopen') {
        const activate = await evaluate(`window.win7Agent.a9.activateConversation(${JSON.stringify(previous.conversation_id)})`);
        check('REOPEN_ACTIVATION', activate && activate.ok === true);
      }
      const snap = await snapshot();
      check('ORIGINAL_CONVERSATION', snap.activeConversationId === previous.conversation_id);
      if (mode === 'recover') {
        const fact = snap.managedProcesses.find((item) => item.handleId === previous.handle.handleId);
        check('RECOVERED_ELIGIBLE', fact && fact.canDismissRecovered === true && fact.cleanupRequired === true);
        const button = `[data-handle-id="${previous.handle.handleId}"] [data-action="dismiss-recovered"]`;
        await waitFor(() => evaluate(`Boolean(document.querySelector(${JSON.stringify(button)}))`), 10000, 'DISPOSITION_CARD');
        const requests = () => result.ipc.filter((entry) => entry.action === 'a9.managed.dismissRecovered').length;
        const before = requests();
        await click(button);
        result.confirmation_dom = await evaluate(`(() => {
          const e=document.getElementById('a9-managed-dismiss-dialog');
          const r=e.getBoundingClientRect(), s=getComputedStyle(e);
          return {open:e.open,hidden:e.hidden,display:s.display,visibility:s.visibility,
            rect:{x:r.x,y:r.y,width:r.width,height:r.height},
            viewport:{width:innerWidth,height:innerHeight},focus:document.activeElement.id,
            text:e.innerText};
        })()`);
        const confirmation = result.confirmation_dom;
        check('CONFIRMATION_VISIBLE', confirmation.open && !confirmation.hidden
          && confirmation.display !== 'none' && confirmation.visibility === 'visible'
          && confirmation.rect.width > 0 && confirmation.rect.height > 0
          && confirmation.rect.x >= 0 && confirmation.rect.y >= 0
          && confirmation.rect.x + confirmation.rect.width <= confirmation.viewport.width
          && confirmation.rect.y + confirmation.rect.height <= confirmation.viewport.height
          && confirmation.text.includes('本操作不停止任何进程。'));
        check('CONFIRMATION_CANCEL_FOCUS', confirmation.focus === 'a9-managed-dismiss-cancel');
        await screenshot('recovery-confirmation');
        await click('#a9-managed-dismiss-cancel');
        check('CANCEL_ZERO_DISPOSITION_REQUESTS', requests() === before && (await uiState()).dialogHidden);
        await click(button);
        await click('#a9-managed-dismiss-confirm');
        await waitFor(async () => {
          const current = await snapshot();
          return current.managedProcesses.some((item) => item.handleId === fact.handleId && item.lastProbeStatus === 'user_dismissed');
        }, 10000, 'DISPOSITION_COMMITTED');
        check('ONE_DISPOSITION_REQUEST', requests() === before + 1);
        await waitFor(async () => (await uiState()).cards.includes('用户确认处置，应用未证实清理'), 10000, 'DISPOSITION_LABEL');
        await screenshot('recovery-complete');
        result.disposition_events = readDb(config, mode, "SELECT id,payload_json FROM a9_events WHERE event_type='managed_process_disposition'");
        check('ONE_DISPOSITION_EVENT', result.disposition_events.length === 1
          && result.disposition_events[0].payload_json.includes('user_attested_after_restart'));
        check('DISPOSITION_ROW', readDb(config, mode, 'SELECT last_probe_status FROM a9_managed_processes WHERE handle_id=?',
          fact.handleId)[0].last_probe_status === 'user_dismissed');
        await click('#conversation-new');
        await waitFor(async () => (await snapshot()).activeConversationId !== previous.conversation_id, 10000, 'NEW_CONVERSATION');
        await evaluate(`document.querySelector('input[name="a9-mode-choice"][value="read_only"]').checked=true;true`);
        await click('#a9-mode-apply');
        await waitFor(async () => (await snapshot()).mode === 'read_only', 10000, 'READ_ONLY_SWITCH');
        check('CONVERSATION_AND_MODE_SWITCH', true);
      } else {
        const current = await snapshot();
        const fact = current.managedProcesses.find((item) => item.handleId === previous.handle.handleId);
        check('DISPOSITION_SURVIVES_REOPEN', fact && fact.lastProbeStatus === 'user_dismissed' && fact.cleanupRequired !== true && !fact.canDismissRecovered);
        check('NO_DUPLICATE_DISPOSITION', readDb(config, mode,
          "SELECT id FROM a9_events WHERE event_type='managed_process_disposition'").length === 1);
      }
      result.process_tree = observedTree(processRows(), process.pid);
    }
    result.status = 'CHECKS_COMPLETE';
    persist();
    // Real window close invokes the product's shutdown and workspace-lock release.
    win.close();
  } catch (error) {
    result.status = 'FAIL';
    result.error = String(error && error.stack || error).slice(0, 1800);
    try { result.process_tree = observedTree(processRows(), process.pid); } catch (queryError) { result.process_query_error = queryError.message; }
    persist();
    // Leave the actual product lifecycle intact. Any blocked close becomes a
    // bounded controller timeout and HALTED, never a successful normal exit.
    if (win) win.close(); else app.quit();
  }
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
  need(!physicalFs.existsSync(config.data_root), 'PORTABLE_DATA_NOT_FRESH');
  return { copied_files: entries.length, destination: config.package_root, original_preserved: true };
}

async function portableController(config) {
  const result = { schema_version: 1, evidence_class: config.evidence_class, profile: 'portable-smoke',
    status: 'IN_PROGRESS', source_commit: config.source_commit, zip_sha256: config.zip_sha256,
    real_model_requests: 0, fixture_requests: 0, started_at: new Date().toISOString() };
  const report = path.join(config.run_root, 'RESULT.json');
  save(report, result);
  try {
    need(Date.now() < Date.parse(config.deadline_utc) - 10 * 60 * 1000, 'WINDOW_NO_NEW_SCENARIO');
    result.identity = currentIdentity(config);
    const initialRows = processRows();
    const launcher = initialRows.find((row) => row.pid === result.identity.parent);
    need(launcher && launcher.image.toLowerCase() === config.cmd_path.toLowerCase() && launcher.created, 'CONTROLLER_PARENT_IDENTITY');
    const own = [result.identity, launcher];
    const unexpected = rows => rows.filter(row =>
      [config.run_root, config.package_root, config.input_package_root].some(root => inside(root, row.image))
      && !own.some(known => known.pid === row.pid && known.created === row.created));
    need(unexpected(initialRows).length === 0, 'PREEXISTING_TRIAL_PROCESS');
    need(hash(fs.readFileSync(__filename)) === config.driver_sha256, 'DRIVER_HASH');
    verifyExecution(config);
    new vm.Script(fs.readFileSync(__filename, 'utf8'), { filename: __filename });
    result.original_package = verifyPackage({ ...config, package_root: config.input_package_root });
    result.copy = copyPortablePackage(config);
    result.package = verifyPackage(config);
    result.cmd_sha256 = hash(fs.readFileSync(config.cmd_path));
    need(result.cmd_sha256 === hash(fs.readFileSync(path.join(process.env.SystemRoot, 'System32', 'cmd.exe'))), 'CMD_COPY_HASH');
    config.driver_runtime = prepareDriverRuntime(config);
    result.driver_runtime = config.driver_runtime;
    save(path.join(config.run_root, 'runtime-config.json'), config);
    save(report, result);
    need(Date.now() < Date.parse(config.deadline_utc) - 10 * 60 * 1000, 'WINDOW_NO_NEW_SCENARIO');
    result.exit = await launchUi(config, 'portable');
    save(report, result);
    need(!result.exit.timed_out && result.exit.signal === null && result.exit.code === 0, 'UI_EXIT_UNEXPECTED');
    result.ui = JSON.parse(fs.readFileSync(path.join(config.run_root, 'portable-result.json'), 'utf8'));
    need(result.ui.status === 'CHECKS_COMPLETE' && result.ui.normal_quit === true, 'PORTABLE_UI_INCOMPLETE');
    result.observed_process_tree = result.ui.process_tree.slice();
    await waitFor(() => {
      const rows = processRows();
      result.observed_process_tree = extendObservedTree(result.observed_process_tree, rows, result.identity.session);
      result.last_process_observation = { at: new Date().toISOString(),
        ...processObservation(result.observed_process_tree, rows, result.identity.session),
        unexpected_root_instances: unexpected(rows) };
      save(report, result);
      return result.last_process_observation.blocking_instances.length === 0
        && result.last_process_observation.unexpected_root_instances.length === 0;
    }, 40000, 'PORTABLE_TREE_ENDED');
    const Database = require(path.join(config.package_root, 'resources/native/storage/node_modules/better-sqlite3'));
    const dbFile = path.join(config.data_root, 'a9', 'a9-state.db');
    const db = new Database(dbFile, { readonly: true, fileMustExist: true });
    try {
      result.database = { path: dbFile,
        workspace_locks: db.prepare('SELECT workspace_path,owner_id FROM a9_workspace_locks').all(),
        workspaces: db.prepare('SELECT workspace_path,permission_mode FROM a9_workspaces').all(),
        conversations: db.prepare('SELECT session_id FROM a9_sessions').all(),
        turns: db.prepare('SELECT COUNT(*) AS count FROM a9_turns').get().count };
    } finally { db.close(); }
    need(result.database.workspace_locks.length === 0, 'NORMAL_QUIT_LOCK_REMAINS');
    need(result.database.turns === 0, 'UNEXPECTED_MODEL_TURN');
    need(result.database.workspaces.length === 1 && result.database.workspaces[0].permission_mode === 'read_only',
      'READ_ONLY_MODE_NOT_PERSISTED');
    need(result.database.conversations.length === 2
      && [result.ui.first_conversation_id, result.ui.new_conversation_id]
        .every(id => result.database.conversations.some(row => row.session_id === id)), 'CONVERSATIONS_NOT_PERSISTED');
    result.package_after = verifyPackage(config);
    result.original_package_after = verifyPackage({ ...config, package_root: config.input_package_root });
    result.status = 'DEV_CHANNEL_COMPLETE';
  } catch (error) {
    result.status = 'HALTED';
    result.error = String(error && error.message || error).slice(0, 500);
    if (error.process_identity_failure) result.process_identity_failure = error.process_identity_failure;
    process.exitCode = 1;
  } finally {
    result.ended_at = new Date().toISOString();
    save(report, result);
    process.stdout.write(JSON.stringify({ status: result.status, profile: result.profile, error: result.error || null }) + '\n');
  }
}

async function portableUi(config) {
  const { app, BrowserWindow, dialog, ipcMain } = require('electron');
  const area = path.join(config.run_root, 'portable');
  const workspace = path.join(area, 'workspace');
  fs.mkdirSync(workspace, { recursive: true });
  app.setPath('crashDumps', path.join(area, 'temp'));
  const report = path.join(config.run_root, 'portable-result.json');
  const result = { schema_version: 1, evidence_class: config.evidence_class, mode: 'portable', status: 'IN_PROGRESS',
    source_commit: config.source_commit, zip_sha256: config.zip_sha256,
    started_at: new Date().toISOString(), ipc: [], checks: [], normal_quit: false };
  const persist = () => save(report, result);
  const check = (name, condition) => { result.checks.push({ name, ok: Boolean(condition) }); persist(); need(condition, name); };
  let win;
  const evaluate = source => win.webContents.executeJavaScript(source);
  const snapshot = async () => {
    const response = await evaluate('window.win7Agent.a9.snapshot()');
    need(response && response.ok === true && response.snapshot, 'SNAPSHOT_FAILED');
    return response.snapshot;
  };
  const click = async selector => {
    const point = await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});
      if(!e||e.disabled||e.hidden)throw new Error('UI_ACTION_UNAVAILABLE');
      const r=e.getBoundingClientRect(),x=Math.floor(r.left+r.width/2),y=Math.floor(r.top+r.height/2);
      const hit=document.elementFromPoint(x,y);
      if(r.width<=0||r.height<=0||x<0||y<0||x>=innerWidth||y>=innerHeight||!hit||!(hit===e||e.contains(hit)))
        throw new Error('UI_ACTION_OCCLUDED');
      return {x,y};})()`);
    win.focus();
    win.webContents.sendInputEvent({ type: 'mouseMove', ...point });
    win.webContents.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 });
    win.webContents.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 });
  };
  dialog.showOpenDialog = async (_owner, options) => {
    need(options && options.properties && options.properties.includes('openDirectory'), 'UNEXPECTED_FILE_PICKER');
    return { canceled: false, filePaths: [workspace] };
  };
  const handle = ipcMain.handle.bind(ipcMain);
  ipcMain.handle = (channel, listener) => handle(channel, async (...args) => {
    const response = await listener(...args);
    if (channel === 'product:a9-request') {
      result.ipc.push({ action: args[1].action, ok: response && response.ok === true });
      need(result.ipc.length <= 100, 'IPC_LOG_LIMIT');
    }
    return response;
  });
  app.on('will-quit', () => { result.normal_quit = true; result.ended_at = new Date().toISOString(); persist(); });
  try {
    result.identity = currentIdentity(config);
    need(hash(fs.readFileSync(__filename)) === config.driver_sha256, 'UI_DRIVER_HASH');
    check('NORMAL_PORTABLE_FLAG', process.argv.includes('--portable'));
    require(path.join(config.package_root, 'resources/app/product/main.js'));
    result.user_data_path = app.getPath('userData');
    check('PRODUCT_PORTABLE_DATA_ROOT', result.user_data_path === config.data_root);
    await app.whenReady();
    win = await waitFor(() => BrowserWindow.getAllWindows().find(item => item.webContents.getURL().includes('/renderer/workbench.html')), 30000, 'WORKBENCH');
    await waitFor(() => evaluate('document.readyState === "complete" && Boolean(window.win7Agent && window.win7Agent.a9)'), 20000, 'RENDERER_READY');
    // The real product shows its initially hidden window in ready-to-show.
    // DOM readiness can precede that event; observe it without calling show().
    await waitFor(() => win.isVisible() && !win.isMinimized(), 20000, 'WORKBENCH_VISIBLE');
    check('WORKBENCH_VISIBLE', win.isVisible() && !win.isMinimized());
    await click('#workspace-select');
    await waitFor(() => evaluate(`(() => {const e=document.getElementById('a9-surface');
      return e&&!e.hidden&&Boolean(e.dataset.a9Status);})()`), 20000, 'WORKSPACE_SURFACE');
    const first = await waitFor(async () => {
      const snap = await snapshot(); return snap.activeConversationId ? snap : null;
    }, 20000, 'WORKSPACE');
    result.first_conversation_id = first.activeConversationId;
    await waitFor(() => evaluate('document.getElementById("a9-mode-dialog").open'), 10000, 'INITIAL_PERMISSION_DIALOG');
    await click('input[name="a9-mode-choice"][value="read_only"]');
    await click('#a9-mode-apply');
    await waitFor(async () => (await snapshot()).mode === 'read_only'
      && await evaluate('!document.getElementById("a9-mode-dialog").open'), 10000, 'READ_ONLY_SELECTED');
    check('INITIAL_PERMISSION_COMPLETED', true);
    await waitFor(() => evaluate('!document.getElementById("conversation-new").disabled'), 10000, 'NEW_CONVERSATION_ENABLED');
    await click('#conversation-new');
    const next = await waitFor(async () => {
      const snap = await snapshot();
      return snap.activeConversationId && snap.activeConversationId !== first.activeConversationId ? snap : null;
    }, 10000, 'NEW_CONVERSATION');
    result.new_conversation_id = next.activeConversationId;
    check('NEW_CONVERSATION_ACTIVATED', result.new_conversation_id !== result.first_conversation_id);
    check('NO_MODEL_OR_PROVIDER_ACTION', !result.ipc.some(entry => /a9\.(?:turn\.submit|provider\.)/.test(entry.action)));
    result.dom = await evaluate(`(() => ({title:document.title,
      surfaceVisible:!document.getElementById('a9-surface').hidden,
      newConversationEnabled:!document.getElementById('conversation-new').disabled,
      modeDialogClosed:!document.getElementById('a9-mode-dialog').open,
      modeLabel:document.getElementById('a9-mode-open').textContent,
      rendererNode:typeof require,rendererProcess:typeof process}))()`);
    check('REAL_WORKBENCH_READY', result.dom.surfaceVisible && result.dom.newConversationEnabled
      && result.dom.modeDialogClosed && result.dom.modeLabel.includes('Read Only')
      && result.dom.rendererNode === 'undefined' && result.dom.rendererProcess === 'undefined');
    await evaluate('new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))');
    fs.writeFileSync(path.join(config.run_root, 'portable-workbench.png'), (await win.webContents.capturePage()).toPNG());
    result.process_tree = observedTree(processRows(), process.pid);
    result.status = 'CHECKS_COMPLETE';
    persist();
    win.close();
  } catch (error) {
    result.status = 'FAIL';
    result.error = String(error && error.stack || error).slice(0, 1800);
    try { result.process_tree = observedTree(processRows(), process.pid); } catch (queryError) { result.process_query_error = queryError.message; }
    persist();
    if (win) win.close(); else app.quit();
  }
}

module.exports = { verifyExecution, admitConfig, inside, validateConfig, parseProcesses, observedTree, remainingInstances, isSgToolEnvironment, extendObservedTree,
  processObservation, fixtureStep, startFixture, cleanEnvironment, prepareDriverRuntime, verifyPackage, ROOT, MODES };
if (require.main === module) {
  const args = process.argv.slice(2);
  const configFile = args[args.indexOf('--config') + 1];
  try {
    office.rejectDriverOverrides(args);
    const raw = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    const config = admitConfig(raw, { executionBindingPath: raw.execution_binding_path });
    need(inside(config.run_root, path.resolve(configFile)), 'CONFIG_LOCATION');
    const mode = args[0] === '--ui' ? args[1] : null;
    need(config.profile === 'portable-smoke' ? mode === null || mode === 'portable' : mode === null || MODES.includes(mode), 'UI_MODE');
    const execution = config.profile === 'portable-smoke'
      ? (mode ? portableUi(config) : portableController(config))
      : (mode ? ui(config, mode) : controller(config));
    Promise.resolve(execution).catch((error) => {
      process.stderr.write(String(error.message || error).slice(0, 500) + '\n'); process.exitCode = 1;
    });
  } catch (error) { process.stderr.write(String(error.message || error).slice(0, 500) + '\n'); process.exitCode = 1; }
}

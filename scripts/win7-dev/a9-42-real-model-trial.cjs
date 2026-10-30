'use strict';
// Candidate-external DEV_CHANNEL ONLY. Target execution needs a separately approved window.
// Local tests inject loopback upstream through startRelay's argument; CLI always uses DeepSeek.
const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const base = require('./a9-42-office-journey.cjs');
const relayTools = require('./a9-42-real-model-relay.cjs');
const office = require('./a9-42-real-model-samples.cjs');
const resources = require('./a9-42-resource-sampler.cjs');
const os = require('os');
const { hash, safeError, inside, noLinks, currentIdentity, currentTasks, processRows, observedTree,
  launcherInstances, extendObservedTree, processObservation, cleanEnvironment, waitFor, clickUi, verifyPackage, copyPortablePackage } = base;
const ROOT = 'C:\\A9-DEV';
const need = (v, code) => { if (!v) throw new Error(code); };
const save = (file, value) => fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', 'utf8');
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const SUPPORT = ['a9-42-office-journey.cjs','a9-42-real-model-relay.cjs','a9-42-real-model-samples.cjs','a9-42-resource-sampler.cjs'];
const EXTRA_KEYS = ['upstream','model','idle_seconds','api_key_file'];
function validateConfig(c, now = Date.now(), template = false) {
  need(c && c.profile === 'office-real-model' && /^a942r-[a-f0-9]{8}$/.test(c.run_id), 'CONFIG_PROFILE_RUN_ID');
  need(EXTRA_KEYS.every(k => Object.prototype.hasOwnProperty.call(c, k)), 'CONFIG_FIELDS');
  need(c.upstream === relayTools.UPSTREAM, 'CONFIG_UPSTREAM');
  need(Number.isInteger(c.real_model_request_limit) && c.real_model_request_limit >= 1 && c.real_model_request_limit <= 40, 'CONFIG_LIMIT');
  need(Number.isInteger(c.idle_seconds) && c.idle_seconds >= 30 && c.idle_seconds <= 120, 'CONFIG_IDLE');
  need(typeof c.model === 'string' && /^deepseek-[a-z0-9-]{1,50}$/.test(c.model), 'CONFIG_MODEL');
  need(base.canonical(c.api_key_file) && inside(c.run_root + '\\secret', c.api_key_file), 'CONFIG_SECRET_PATH');
  const old = Object.fromEntries(Object.entries(c).filter(([k]) => !EXTRA_KEYS.includes(k)));
  // Reuse the original strict identity/layout contract without reopening that profile.
  const oldId = c.run_id.replace('a942r-', 'a942o-');
  for (const k of ['run_id','task_name','run_root','package_root','workspace_root','data_root','cmd_path','source_binding_path']) {
    if (typeof old[k] === 'string') old[k] = old[k].split(c.run_id).join(oldId);
  }
  old.profile = 'office-journey'; old.real_model_request_limit = 0;
  base.validateConfig(old, now, template);
  need(c.task_name === 'A9-DEV-' + c.run_id, 'CONFIG_TASK_NAME');
  return c;
}
function verifyBinding(c, io = fs, root = __dirname) {
  base.verifyBinding(c);
  const binding = JSON.parse(io.readFileSync(c.source_binding_path, 'utf8'));
  return verifySupport(binding, c, io, root);
}
function verifySupport(binding, c, io = fs, root = __dirname) {
  need(binding.profile === c.profile && Array.isArray(binding.support_files) && binding.support_files.length === SUPPORT.length, 'BINDING_SUPPORT');
  for (const name of SUPPORT) {
    if (process.platform === 'win32') noLinks(c.run_root, path.join(root, name), io);
    const e = binding.support_files.find(e => e.path === name);
    need(e && hash(io.readFileSync(path.join(root, name))) === e.sha256, 'BINDING_SUPPORT_HASH');
  }
  need(Array.isArray(binding.samples) && binding.samples.length === 2, 'BINDING_SAMPLES');
  for (const name of [office.FILES.doc, office.FILES.book]) {
    if (process.platform === 'win32') noLinks(c.run_root, path.join(root, name), io);
    const e = binding.samples.find(e => e.path === name);
    need(e && hash(io.readFileSync(path.join(root, name))) === e.sha256, 'BINDING_SAMPLE_HASH');
  }
  return { source_tree: binding.source_tree, support_files: binding.support_files, samples: binding.samples };
}
function prepareDriverRuntime(c, io = require('original-fs')) {
  const runtime = path.join(c.run_root, 'driver-electron'), app = path.join(c.run_root, 'driver-app');
  need(!io.existsSync(runtime) && !io.existsSync(app), 'DRIVER_RUNTIME_EXISTS');
  const manifest = JSON.parse(io.readFileSync(path.join(c.package_root, 'release-manifest.json'), 'utf8'));
  const entries = manifest.files.filter(e => !e.path.includes('/') || /^(locales|swiftshader)\//.test(e.path) || e.path === 'resources/default_app.asar');
  need(entries.some(e => e.path === 'electron.exe') && entries.some(e => e.path === 'resources/default_app.asar'), 'DRIVER_RUNTIME_INCOMPLETE');
  for (const e of entries) {
    const b = io.readFileSync(path.join(c.package_root, ...e.path.split('/'))); need(b.length === e.size && hash(b) === e.sha256, 'DRIVER_RUNTIME_SOURCE_HASH');
    const file = path.join(runtime, ...e.path.split('/')); io.mkdirSync(path.dirname(file), { recursive: true }); io.writeFileSync(file, b, { flag: 'wx' });
    need(hash(io.readFileSync(file)) === e.sha256, 'DRIVER_RUNTIME_COPY_HASH');
  }
  io.mkdirSync(app);
  const names = ['driver.cjs', ...SUPPORT, office.FILES.doc, office.FILES.book];
  for (const name of names) {
    const source = name === 'driver.cjs' ? __filename : path.join(__dirname, name);
    io.writeFileSync(path.join(app, name), io.readFileSync(source), { flag: 'wx' });
  }
  need(hash(io.readFileSync(path.join(app, 'driver.cjs'))) === c.driver_sha256, 'DRIVER_SOURCE_HASH');
  io.writeFileSync(path.join(app, 'package.json'), JSON.stringify({ name: 'a942-real-model-dev-trial', version: '1.0.0', private: true, main: 'driver.cjs' }) + '\n', { flag: 'wx' });
  return { executable: path.join(runtime, 'electron.exe'), app_root: app, files: entries.length };
}
function sqlFacts(c, key, turnIds) {
  const Database = require(path.join(c.package_root, 'resources/native/storage/node_modules/better-sqlite3'));
  const db = new Database(path.join(c.data_root, 'a9/a9-state.db'), { readonly: true, fileMustExist: true });
  try {
    const allEvents = db.prepare('SELECT id,turn_id,event_type,payload_json FROM a9_events ORDER BY id').all();
    need(relayTools.scanSecrets(allEvents, key), 'SECRET_IN_SQLITE_EVENTS');
    const turns = db.prepare('SELECT turn_id,status,outcome_json FROM a9_turns ORDER BY rowid').all();
    return { turns: turns.filter(t => !turnIds || turnIds.includes(t.turn_id)),
      events: allEvents.filter(e => !turnIds || turnIds.includes(e.turn_id)).map(e => ({ id: e.id, turn_id: e.turn_id,
        event_type: e.event_type, data: JSON.parse(e.payload_json).data || JSON.parse(e.payload_json) })),
      workspace_locks: db.prepare('SELECT workspace_path,owner_id FROM a9_workspace_locks').all(),
      workspaces: db.prepare('SELECT workspace_path,permission_mode FROM a9_workspaces').all() };
  } finally { db.close(); }
}
// Scenario waits run inside the product main process; a full event scan every 250 ms would
// inflate the measured product CPU. Waits read only turn status; full facts are read once.
function turnRows(c) {
  const Database = require(path.join(c.package_root, 'resources/native/storage/node_modules/better-sqlite3'));
  const db = new Database(path.join(c.data_root, 'a9/a9-state.db'), { readonly: true, fileMustExist: true });
  try { return db.prepare('SELECT turn_id,status FROM a9_turns ORDER BY rowid').all(); } finally { db.close(); }
}
// The only process-query entry used by this controller/UI; resource sampling can replace it.
const queryProcesses = () => processRows();
// One WMIC query per tick feeds both process-tree observation and resource samples, so the
// measurement adds no second query process. A failed query is counted, never reused stale.
function resourceObserver(getObserved, queryRows = () => resources.queryResourceRows()) {
  let tick = null;
  const sampler = resources.createResourceSampler({ intervalMs: 1000, maxSamples: 2000,
    query: () => { const r = tick; tick = null; if (!r) throw new Error('RESOURCE_QUERY_FAILED'); return r; },
    selectTree: rows => rows.filter(row => getObserved().some(o => o.pid === row.pid && o.created === row.created)) });
  return { sampler,
    query: () => { tick = null; const r = queryRows(); tick = r;
      return r.rows.map(row => ({ ...row, imageSource: row.image ? 'executable_path' : null })); },
    sample: () => sampler.sampleOnce() };
}

// Window order: materials -> key-less network preflight PASS -> key upload -> controller.
// The controller refuses to start (and never reads a key) without this run's PASS record.
const PREFLIGHT = 'NETWORK_PREFLIGHT.json';
function requirePreflight(c, io = fs) {
  const file = path.join(c.run_root, PREFLIGHT); need(io.existsSync(file), 'NETWORK_PREFLIGHT_REQUIRED');
  const p = JSON.parse(io.readFileSync(file, 'utf8'));
  need(p.status === 'PASS' && p.run_id === c.run_id && p.driver_sha256 === c.driver_sha256 && p.upstream === relayTools.UPSTREAM, 'NETWORK_PREFLIGHT_REQUIRED');
  return p;
}
async function networkPreflight(config, { io = fs, check = () => relayTools.upstreamPreflight(), identity = currentIdentity } = {}) {
  identity(config);
  need(hash(io.readFileSync(__filename)) === config.driver_sha256, 'DRIVER_HASH');
  need(!io.existsSync(config.api_key_file), 'PREFLIGHT_SECRET_PRESENT');
  const file = path.join(config.run_root, PREFLIGHT); need(!io.existsSync(file), 'PREFLIGHT_REUSE');
  const r = { ...(await check()), run_id: config.run_id, driver_sha256: config.driver_sha256, evidence_class: 'DEV_CHANNEL', at: new Date().toISOString() };
  io.writeFileSync(file, JSON.stringify(r, null, 2) + '\n', { flag: 'wx' });
  process.stdout.write(JSON.stringify({ status: r.status, error_code: r.error_code }) + '\n');
  if (r.status !== 'PASS') process.exitCode = 1;
  return r;
}

async function postflight(config) {
  currentIdentity(config);
  const file = path.join(config.run_root, 'POSTFLIGHT.json'); need(!fs.existsSync(file), 'POSTFLIGHT_REUSE');
  const r = { schema_version: 1, evidence_class: 'DEV_CHANNEL', status: 'HALTED', source_commit: config.source_commit,
    zip_sha256: config.zip_sha256, driver_sha256: config.driver_sha256 };
  try {
    need(hash(fs.readFileSync(__filename)) === config.driver_sha256, 'POSTFLIGHT_DRIVER_HASH');
    const prior = JSON.parse(fs.readFileSync(path.join(config.run_root, 'RESULT.json'), 'utf8'));
    need(prior.status === 'TRIAL_OBSERVATION_COMPLETE_POSTFLIGHT_REQUIRED' && prior.driver_sha256 === config.driver_sha256
      && prior.zip_sha256 === config.zip_sha256, 'POSTFLIGHT_PRIOR_RESULT');
    const rows = queryProcesses();
    const own = observedTree(rows, process.pid)[0];
    const launchers = launcherInstances(rows, own, config);
    r.launcher_process_chain = launchers.slice(1);
    r.tasks = currentTasks(config); need(r.tasks.length === 0, 'POSTFLIGHT_TASK_REMAINS');
    r.processes = processObservation(prior.observed_process_tree, rows, config.session_id);
    r.unexpected_root_instances = rows.filter(row => row.image && [config.run_root,config.package_root,config.input_package_root].some(root => inside(root,row.image))
      && !launchers.some(known => known.pid === row.pid && known.created === row.created));
    need(r.processes.blocking_instances.length === 0 && r.unexpected_root_instances.length === 0, 'POSTFLIGHT_PROCESS_REMAINS');
    r.scenarios = prior.ui.scenarios.map(s => ({ name: s.name, status: s.status, reason: s.reason }));
    r.status = 'TRIAL_DEV_CHANNEL_POSTFLIGHT_COMPLETE';
  } catch (error) { r.first_failure = safeError(error); process.exitCode = 1; }
  fs.writeFileSync(file, JSON.stringify(r, null, 2) + '\n', { flag: 'wx' });
}

async function controller(config, injectedQuery) {
  currentIdentity(config); // Never create evidence under an unverified identity.
  const meter = resourceObserver(() => observed);
  const query = injectedQuery || meter.query;
  const sampler = meter.sampler;
  const sample = () => { if (!injectedQuery) meter.sample(); };
  need(Date.now() < Date.parse(config.deadline_utc) - 600000, 'WINDOW_NO_NEW_SCENARIO');
  for (const target of [config.run_root, config.input_package_root, config.zip_path]) noLinks(ROOT, target);
  for (const target of [config.package_root, config.workspace_root, path.join(config.run_root, 'RESULT.json')]) need(!fs.existsSync(target), 'OUTPUT_REUSE');
  const preflight = requirePreflight(config);
  const report = path.join(config.run_root, 'RESULT.json');
  fs.writeFileSync(report, '{}\n', { flag: 'wx' });
  const result = { schema_version: 1, evidence_class: 'DEV_CHANNEL', status: 'IN_PROGRESS',
    source_commit: config.source_commit, zip_sha256: config.zip_sha256, manifest_sha256: config.manifest_sha256,
    driver_sha256: config.driver_sha256, source_binding_sha256: config.source_binding_sha256,
    network_preflight: { status: preflight.status, at: preflight.at, tls: preflight.tls }, timeline: [], started_at: new Date().toISOString(), task_cleanup: 'NOT_PERFORMED_EXTERNAL_POSTFLIGHT_REQUIRED' };
  let observed = []; let observer; let observationError; let key;
  const logLeaks = [];
  const logChunk = (fd, b) => { if (!relayTools.scanSecrets(b, key)) { logLeaks.push('SECRET_IN_PROCESS_LOG'); fs.writeSync(fd, '[REDACTED]\n'); } else fs.writeSync(fd, b); };
  try {
    result.identity = currentIdentity(config);
    const rows = query(); const own = launcherInstances(rows, result.identity, config);
    result.launcher_process_chain = own.slice(1);
    const unexpected = rows => rows.filter(row => row.image && [config.run_root, config.package_root, config.input_package_root].some(root => inside(root, row.image))
      && !own.some(known => known.pid === row.pid && known.created === row.created)
      && !observed.some(known => known.pid === row.pid && known.created === row.created));
    result.preexisting_trial_processes = unexpected(rows);
    need(result.preexisting_trial_processes.length === 0, 'PREEXISTING_TRIAL_PROCESS');
    need(currentTasks(config).length === 1, 'LAUNCHER_TASK_IDENTITY');
    need(hash(fs.readFileSync(__filename)) === config.driver_sha256, 'DRIVER_HASH');
    need(hash(fs.readFileSync(config.zip_path)) === config.zip_sha256, 'ZIP_HASH');
    result.binding = verifyBinding(config);
    result.original = verifyPackage(config, config.input_package_root);
    result.copy = copyPortablePackage(config);
    result.package = verifyPackage(config);
    need(hash(fs.readFileSync(config.cmd_path)) === hash(fs.readFileSync(path.join(process.env.SystemRoot, 'System32/cmd.exe'))), 'CMD_COPY_HASH');
    const runtime = prepareDriverRuntime(config);
    key = relayTools.consumeKey(config).key; result.api_key_sha256 = hash(key);
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
          { env, cwd: config.run_root, windowsHide: false, stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
        result.product_spawned_at = Date.now(); save(report, result);
        child.stdio[3].on('error', () => logLeaks.push('SECRET_PIPE_FAILED')); child.stdio[3].end(key, 'utf8');
        // Buffer bounded chunks with overlap so secrets split across writes cannot reach disk.
        for (const [stream, fd] of [[child.stdout, out],[child.stderr, err]]) {
          let chunks = [], length = 0;
          stream.on('data', b => { chunks.push(b); length += b.length;
            if (length > 8 * 1024 * 1024) { logLeaks.push('PROCESS_LOG_LIMIT'); chunks = []; length = 0; } });
          stream.on('end', () => logChunk(fd, Buffer.concat(chunks)));
        }
        let timedOut = false;
        const timer = setTimeout(() => { timedOut = true; child.kill(); }, Math.max(1, Date.parse(config.deadline_utc) - Date.now()));
        observer = setInterval(() => {
          try {
            const rows = query();
            observed = observed.length ? extendObservedTree(observed, rows, config.session_id) : observedTree(rows, child.pid);
            sample(); result.observed_process_tree = observed; save(report, result);
          } catch (_) { observationError = 'PROCESS_OBSERVATION_FAILED'; child.kill(); }
        }, 1500);
        child.once('error', error => { clearTimeout(timer); clearInterval(observer); reject(error); });
        child.once('exit', () => { result.timeline.push({ name: 'product_exited', at: Date.now() }); });
        child.once('close', (code, signal) => { clearTimeout(timer); clearInterval(observer); resolve({ pid: child.pid, code, signal, timed_out: timedOut }); });
      });
    } finally { fs.closeSync(out); fs.closeSync(err); }
    need(!result.exit.timed_out && result.exit.code === 0 && result.exit.signal === null, 'UI_EXIT_UNEXPECTED');
    need(!observationError, 'PROCESS_OBSERVATION_FAILED');
    const uiResult = JSON.parse(fs.readFileSync(path.join(config.run_root, 'ui-result.json'), 'utf8'));
    need(relayTools.scanSecrets(uiResult, key), 'SECRET_IN_UI_RESULT'); result.ui = uiResult;
    need(logLeaks.length === 0, logLeaks[0] || 'PROCESS_LOG_FAILURE');
    for (const name of ['ui-stdout.bin','ui-stderr.bin']) need(relayTools.scanSecrets(fs.readFileSync(path.join(config.run_root, name)), key), 'SECRET_IN_PROCESS_LOG');
    need(relayTools.scanSecrets(result.ui, key), 'SECRET_IN_UI_RESULT');
    result.real_model_requests = result.ui.real_model_requests;
    need(result.ui.status === 'CHECKS_COMPLETE' && result.ui.normal_quit === true, 'UI_INCOMPLETE');
    // UI and controller must have observed the same actual account/session.
    need(result.ui.identity.sid === result.identity.sid && result.ui.identity.session === result.identity.session, 'UI_IDENTITY_DRIFT');
    for (const row of result.ui.process_tree) if (!observed.some(r => r.pid === row.pid && r.created === row.created)) observed.push(row);
    await waitFor(() => {
      const rows = query(); observed = extendObservedTree(observed, rows, config.session_id); sample();
      result.observed_process_tree = observed;
      result.last_process_observation = { at: new Date().toISOString(), ...processObservation(observed, rows, config.session_id), unexpected_root_instances: unexpected(rows) };
      save(report, result);
      return result.last_process_observation.blocking_instances.length === 0 && result.last_process_observation.unexpected_root_instances.length === 0;
    }, Math.min(40000, Date.parse(config.deadline_utc) - Date.now()), 'PRODUCT_TREE_ENDED');
    result.timeline.push({ name: 'tree_ended', at: Date.now() });
    const facts = sqlFacts(config, key);
    result.database = { workspace_locks: facts.workspace_locks, workspaces: facts.workspaces,
      turns: facts.turns.map(t => ({ turn_id: t.turn_id, status: t.status })), all_events_sha256: hash(JSON.stringify(facts.events)) };
    need(facts.workspace_locks.length === 0, 'PRODUCT_LOCK_REMAINS');
    need(facts.workspaces.length === 1 && facts.workspaces[0].workspace_path === path.win32.resolve(config.workspace_root).toLowerCase()
      && facts.workspaces[0].permission_mode === 'full_access', 'WORKSPACE_PERSISTENCE');
    need(!facts.turns.some(t => ['active','interrupted'].includes(t.status)), 'TURN_PERSISTENCE');
    need(relayTools.scanSecrets(fs.readFileSync(path.join(config.run_root, 'relay.json')), key), 'SECRET_IN_RELAY_LOG');
    need(relayTools.scanSecrets(result, key), 'SECRET_IN_RESULT');
    for (const name of ['RESULT.json','ui-result.json','ui-stdout.bin','ui-stderr.bin','relay.json']) need(relayTools.scanSecrets(fs.readFileSync(path.join(config.run_root, name)), key), 'SECRET_IN_EVIDENCE');
    result.launcher_tasks = currentTasks(config);
    need(result.launcher_tasks.length === 1, 'LAUNCHER_TASK_IDENTITY');
    result.package_after = verifyPackage(config); result.original_after = verifyPackage(config, config.input_package_root);
    result.status = 'TRIAL_OBSERVATION_COMPLETE_POSTFLIGHT_REQUIRED';
  } catch (error) { result.status = 'HALTED'; result.first_failure = safeError(error); process.exitCode = 1; }
  finally {
    clearInterval(observer); result.ended_at = new Date().toISOString();
    try {
      await sampler.stop();
      const samples = sampler.samples();
      const timeline = [...((result.ui && result.ui.timeline) || []), ...result.timeline];
      fs.writeFileSync(path.join(config.run_root, 'resources.json'), JSON.stringify({ schema_version: resources.RESOURCE_SUMMARY_SCHEMA_VERSION,
        samples, errors: sampler.errors(), timeline }, null, 2) + '\n', { flag: 'wx' });
      result.resources = { summary: resources.summarizeResources(samples, timeline, { logicalCpus: os.cpus().length }),
        errors: sampler.errors(), sample_count: samples.length, logical_cpus: os.cpus().length };
    } catch (_) { result.resources = 'UNKNOWN'; }
    const safe = relayTools.scanSecrets(result, key) ? result : { schema_version: 1, evidence_class: 'DEV_CHANNEL', status: 'HALTED', first_failure: 'SECRET_IN_RESULT' };
    if (safe !== result) process.exitCode = 1; save(report, safe); key = undefined;
    process.stdout.write(JSON.stringify({ status: safe.status, first_failure: safe.first_failure || null }) + '\n');
  }
}

function lateReplyRejected(reply) {
  return Boolean(reply && reply.ok === false && reply.error && ['A9_QUESTION_REPLY_CONFLICT','A9_QUESTION_STALE'].includes(reply.error.code));
}
async function readKeyPipe(fd = 3) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(null, { fd, encoding: 'utf8', autoClose: true }); let key = '';
    stream.on('data', b => { key += b; if (key.length > 256) stream.destroy(new Error('SECRET_PIPE_LIMIT')); });
    stream.once('error', () => reject(new Error('SECRET_PIPE_FAILED')));
    stream.once('end', () => { if (key.length < 8) reject(new Error('SECRET_PIPE_EMPTY')); else resolve(key); });
  });
}
async function ui(config) {
  const { app, BrowserWindow, dialog } = require('electron');
  const report = path.join(config.run_root, 'ui-result.json');
  const result = { schema_version: 1, evidence_class: 'DEV_CHANNEL', profile: config.profile, run_id: config.run_id,
    status: 'IN_PROGRESS', normal_quit: false, timeline: [], scenarios: [], source_commit: config.source_commit, zip_sha256: config.zip_sha256 };
  let win, relay, key, timer, cancelGuard, cancelWatcher;
  const persist = () => { need(relayTools.scanSecrets(result, key), 'SECRET_IN_UI_RESULT'); save(report, result); };
  const mark = (name, at = Date.now()) => { result.timeline.push({ name, at }); persist(); };
  const evaluate = code => win.webContents.executeJavaScript(code);
  const wait = (fn, ms, name) => waitFor(fn, Math.max(1, Math.min(ms, Date.parse(config.deadline_utc) - Date.now() - 15000)), name);
  const slowWait = async (fn, ms, name) => {
    const end = Date.now() + Math.max(1, Math.min(ms, Date.parse(config.deadline_utc) - Date.now() - 15000));
    while (Date.now() < end) { const r = await fn(); if (r) return r; await delay(1000); }
    throw new Error(`TIMEOUT_${name}`);
  };
  const snapshot = async () => { const s = await evaluate('window.win7Agent.a9.snapshot()'); need(s && s.ok && s.snapshot, 'SNAPSHOT_FAILED'); return s.snapshot; };
  const click = selector => clickUi({ evaluate, focus: () => win.focus(), sendInputEvent: e => win.webContents.sendInputEvent(e) }, selector);
  const fill = async (selector, value) => {
    await click(selector);
    await evaluate(`(() => {const e=document.querySelector(${JSON.stringify(selector)});e.value='';e.dispatchEvent(new Event('input',{bubbles:true}));})()`);
    await win.webContents.insertText(value);
  };
  const close = () => { if (!result.timeline.some(t => t.name === 'close_requested')) mark('close_requested'); if (win && !win.isDestroyed()) win.close(); else app.quit(); };
  const screenshot = async name => {
    need(await evaluate('document.getElementById("a9-provider-key").type==="password"'), 'SECRET_FIELD_NOT_PASSWORD');
    need(relayTools.scanSecrets(await evaluate('document.body.innerText'), key), 'SECRET_IN_SCREENSHOT_TEXT');
    fs.writeFileSync(path.join(config.run_root, name + '.png'), (await win.webContents.capturePage()).toPNG(), { flag: 'wx' });
  };
  dialog.showOpenDialog = async (_owner, options) => { need(options && options.properties.includes('openDirectory'), 'UNEXPECTED_FILE_PICKER'); return { canceled: false, filePaths: [config.workspace_root] }; };
  app.on('will-quit', () => { clearTimeout(timer); if (cancelGuard) cancelGuard(); if (cancelWatcher) cancelWatcher.close(); result.normal_quit = true; mark('will_quit'); });
  try {
    result.identity = currentIdentity(config);
    need(hash(fs.readFileSync(__filename)) === config.driver_sha256, 'UI_DRIVER_HASH'); verifyBinding(config);
    key = await readKeyPipe(); result.api_key_sha256 = hash(key);
    need(!fs.existsSync(config.api_key_file), 'SECRET_FILE_NOT_DELETED');
    need(process.argv.includes('--portable') && !fs.existsSync(config.workspace_root) && !fs.existsSync(config.data_root), 'UI_OUTPUT_REUSE');
    fs.mkdirSync(config.workspace_root);
    const binding = JSON.parse(fs.readFileSync(config.source_binding_path, 'utf8'));
    const originals = {};
    for (const e of binding.samples) {
      const b = fs.readFileSync(path.join(__dirname, e.path)); need(hash(b) === e.sha256, 'SAMPLE_HASH');
      fs.writeFileSync(path.join(config.workspace_root, e.path), b, { flag: 'wx' }); originals[e.path] = e.sha256;
    }
    result.sample_sha256 = originals;
    app.setPath('crashDumps', path.join(config.run_root, 'environment/temp'));
    relay = relayTools.startRelay({ limit: config.real_model_request_limit, deadline: Date.parse(config.deadline_utc),
      log: () => { save(path.join(config.run_root, 'relay.json'), relay.state.records); } });
    const url = await relay.listen(); save(path.join(config.run_root, 'relay.json'), []);
    const spawnedAt = JSON.parse(fs.readFileSync(path.join(config.run_root, 'RESULT.json'), 'utf8')).product_spawned_at;
    need(Number.isSafeInteger(spawnedAt), 'PRODUCT_SPAWN_TIME'); mark('product_spawned', spawnedAt);
    require(path.join(config.package_root, 'resources/app/product/main.js'));
    need(app.getPath('userData') === config.data_root, 'PRODUCT_DATA_ROOT');
    await app.whenReady();
    win = await wait(() => BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('/renderer/workbench.html')), 30000, 'WORKBENCH');
    timer = setTimeout(() => { relay.stop(); result.status = 'HALTED'; result.first_failure = 'WINDOW_DEADLINE'; persist(); close(); }, Math.max(1, Date.parse(config.deadline_utc) - Date.now() - 15000));
    await wait(() => evaluate('document.readyState==="complete"&&Boolean(window.win7Agent&&window.win7Agent.a9)'), 20000, 'RENDERER');
    await wait(() => win.isVisible() && !win.isMinimized(), 15000, 'VISIBLE');
    mark('workbench_ready'); mark('idle_start'); await delay(config.idle_seconds * 1000); mark('idle_end');
    await click('#workspace-select');
    await wait(async () => (await snapshot()).activeConversationId, 20000, 'WORKSPACE');
    await wait(() => evaluate('document.getElementById("a9-mode-dialog").open'), 10000, 'MODE_DIALOG');
    await click('input[name="a9-mode-choice"][value="full_access"]'); await click('#a9-mode-apply');
    await wait(async () => (await snapshot()).mode === 'full_access', 10000, 'FULL_ACCESS');
    await click('#a9-provider-open');
    need(await evaluate('document.getElementById("a9-provider-key").type==="password"'), 'SECRET_FIELD_NOT_PASSWORD');
    await fill('#a9-provider-url', url); await fill('#a9-provider-model', config.model); await fill('#a9-provider-key', key);
    need(await evaluate('!document.getElementById("a9-provider-remember").checked'), 'REMEMBER_MUST_BE_OFF');
    await click('#a9-provider-apply');
    await wait(() => evaluate('!document.getElementById("a9-provider-apply").disabled&&document.getElementById("a9-provider-probe-state").textContent==="tool_calling"'), 65000, 'PROBE');
    await click('#settings-drawer header [data-close]');
    const terminal = new Set(['completed','completed_with_warnings','blocked','failed','cancelled','interrupted']);
    for (const id of ['S1','S2','S3','S4','S5']) {
      if (Date.now() >= Date.parse(config.deadline_utc) - 600000 || relay.state.requests >= config.real_model_request_limit) {
        result.scenarios.push({ name: id, status: 'NOT_PERFORMED', reason: relay.state.requests >= config.real_model_request_limit ? 'REAL_MODEL_BUDGET_EXHAUSTED' : 'WINDOW_NO_NEW_SCENARIO' }); persist(); continue;
      }
      const before = office.workspaceFacts(config.workspace_root);
      const oldTurns = new Set(sqlFacts(config, key).turns.map(t => t.turn_id));
      if (await evaluate('!document.getElementById("inspector-backdrop").hidden')) { await click('#close-inspector'); await wait(() => evaluate('document.getElementById("inspector-backdrop").hidden'), 10000, 'INSPECTOR_CLOSED'); }
      await wait(() => evaluate('!document.getElementById("task-prompt").disabled'), 10000, 'COMPOSER_READY');
      await fill('#task-prompt', office.PROMPTS[id]);
      await wait(() => evaluate('!document.getElementById("run-task").disabled'), 10000, 'SUBMIT_READY');
      need(Date.now() < Date.parse(config.deadline_utc) - 600000, 'WINDOW_NO_NEW_SCENARIO');
      mark(`scenario:${id}:submit`); const start = Date.now(); await click('#run-task');
      let asked = false, lateRejected = false, beforeCancel, requestBefore, requestAfter;
      let facts, cancelWatch; let cancelWriteEvents = 0;
      try {
        const first = await slowWait(async () => {
          const turns = turnRows(config).filter(t => !oldTurns.has(t.turn_id));
          if (!turns.length) return null;
          const s = await snapshot(); return s.pendingQuestion || turns.every(t => terminal.has(t.status)) ? { s, turns } : null;
        }, 240000, 'SCENARIO_RESPONSE');
        const question = first.s.pendingQuestion;
        if (question) {
          asked = true; beforeCancel = office.workspaceFacts(config.workspace_root); requestBefore = relay.state.attempts;
          if (id === 'S4') {
            await click('#a9-question-card input[type="radio"]'); await click('#a9-question-card .a9-question-actions button:first-child');
          } else {
            if (id === 'S5') { cancelWatch = fs.watch(config.workspace_root, { recursive: true }, () => { cancelWriteEvents++; }); cancelWatch.on('error', () => { cancelWriteEvents++; }); }
            await click('#a9-question-card .a9-question-actions button:last-child');
            await wait(async () => !(await snapshot()).pendingQuestion, 10000, 'QUESTION_CANCELLED');
            const late = await evaluate(`window.win7Agent.a9.replyQuestion(${JSON.stringify(question.conversationId)},${JSON.stringify(question.questionId)},${question.revision},'answered',${JSON.stringify(question.options && question.options[0] || '确认')})`);
            lateRejected = lateReplyRejected(late); await delay(1500); requestAfter = relay.state.attempts;
          }
        }
        await slowWait(() => {
          const rows = turnRows(config).filter(t => !oldTurns.has(t.turn_id)); return rows.length && rows.every(t => terminal.has(t.status));
        }, 240000, 'SCENARIO_COMPLETED');
        const turns = sqlFacts(config, key).turns.filter(t => !oldTurns.has(t.turn_id));
        const sql = sqlFacts(config, key, turns.map(t => t.turn_id));
        const answer = sql.events.filter(e => e.event_type === 'turn_completed').map(e => e.data.finalMessage || '').join('\n');
        facts = { before, after: office.workspaceFacts(config.workspace_root), originals, sql, answer, asked,
          cancel_write_events: cancelWriteEvents, late_rejected: lateRejected, before_cancel: beforeCancel, requests_before_cancel: requestBefore, requests_after_cancel: requestAfter };
        const v = office.verdict(id, facts);
        // Persist facts as digests/projections; never model text, tool args or response content.
        result.scenarios.push({ name: id, ...v, elapsed_ms: Date.now() - start,
          turn_ids: turns.map(t => t.turn_id), answer_sha256: hash(answer),
          files: Object.fromEntries(Object.entries(facts.after).map(([n, f]) => [n, { sha256: f.sha256, size: f.size, pk: f.pk }])),
          sqlite: sql.events.map(e => ({ id: e.id, type: e.event_type, tool: e.data.toolName, payload_sha256: hash(JSON.stringify(e.data)) })),
          asked, late_rejected: lateRejected, requests_before_cancel: requestBefore, requests_after_cancel: requestAfter });
      } catch (error) {
        // A nonterminal or unknown lifecycle cannot be used as the next scenario's baseline.
        result.scenarios.push({ name: id, status: 'FAIL', reason: safeError(error), elapsed_ms: Date.now() - start });
        throw new Error(safeError(error));
      } finally { if (cancelWatch) { if (id === 'S5') cancelWatcher = cancelWatch; else cancelWatch.close(); } }
      if (id === 'S5' && asked) cancelGuard = () => {
        let currentFiles; try { currentFiles = office.workspaceFacts(config.workspace_root); } catch (_) { currentFiles = null; }
        const stable = cancelWriteEvents === 0 && relay.state.attempts === requestBefore
          && JSON.stringify(currentFiles) === JSON.stringify(beforeCancel);
        if (!stable) { const scenario = result.scenarios.find(s => s.name === 'S5'); scenario.status = 'FAIL'; scenario.reason = 'CANCEL_SIDE_EFFECT_OR_LATE_REPLY';
          result.status = 'HALTED'; result.first_failure = 'CANCEL_SIDE_EFFECT_OR_LATE_REPLY'; }
      };
      mark(`scenario:${id}:complete`);
      await screenshot(id);
      need(result.status !== 'HALTED', 'WINDOW_DEADLINE');
      need(facts.after[office.FILES.doc] && facts.after[office.FILES.book]
        && facts.after[office.FILES.doc].sha256 === originals[office.FILES.doc]
        && facts.after[office.FILES.book].sha256 === originals[office.FILES.book], 'ORIGINAL_INTEGRITY_FAILED');
    }
    need(await evaluate('typeof require==="undefined"&&typeof process==="undefined"'), 'RENDERER_ISOLATION');
    sqlFacts(config, key); result.real_model_requests = relay.state.requests;
    result.process_tree = observedTree(queryProcesses(), process.pid);
    await relay.close(); result.status = 'CHECKS_COMPLETE'; if (cancelGuard) cancelGuard(); persist(); key = undefined; close();
  } catch (error) {
    result.status = 'HALTED'; result.first_failure = safeError(error);
    for (const id of ['S1','S2','S3','S4','S5']) if (!result.scenarios.some(s => s.name === id)) result.scenarios.push({ name: id, status: 'NOT_PERFORMED', reason: 'PRIOR_HARD_STOP' });
    if (win && !win.isDestroyed()) { try { await screenshot('failure'); } catch (_) { result.failure_screenshot = 'NOT_PERFORMED'; } }
    if (relay) { result.real_model_requests = relay.state.requests; await relay.close(); }
    try { result.process_tree = observedTree(queryProcesses(), process.pid); } catch (_) { result.process_query = 'UNKNOWN'; }
    persist(); key = undefined; close();
  }
}
module.exports = { validateConfig, verifyBinding, verifySupport, prepareDriverRuntime, sqlFacts, queryProcesses, resourceObserver, requirePreflight, networkPreflight, readKeyPipe, lateReplyRejected, SUPPORT,
  controller, ui, postflight, ...relayTools, ...office };
if (require.main === module) {
  try {
    const args = process.argv.slice(2), at = args.indexOf('--config'); need(at >= 0, 'CONFIG_ARGUMENT');
    const configFile = path.resolve(args[at + 1]);
    const config = validateConfig(JSON.parse(fs.readFileSync(configFile, 'utf8')));
    need(inside(config.run_root, configFile), 'CONFIG_LOCATION'); noLinks(config.run_root, configFile);
    Promise.resolve(args.includes('--ui') ? ui(config) : args.includes('--postflight') ? postflight(config)
      : args.includes('--network-preflight') ? networkPreflight(config) : controller(config))
      .catch(error => { process.stderr.write(safeError(error) + '\n'); process.exitCode = 1; });
  } catch (error) { process.stderr.write(safeError(error) + '\n'); process.exitCode = 1; }
}

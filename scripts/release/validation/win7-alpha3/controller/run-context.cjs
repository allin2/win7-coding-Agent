'use strict';
// Shared run data. No owner receipt, deny set, historical run list, or per-run code generation.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const plan = require('./phase-plan.cjs');
const SSH_HOSTS = Object.freeze(['192.168.1.9']); // ADR-0284: LAN only.
const CLASSES = Object.freeze(['DEV_CHANNEL', 'FORMAL_GATE_A_EXECUTION']);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ROOT = 'C:\\A9-DEV';
const LAYOUT = Object.freeze({
  schema_version: 1, channel_root: ROOT,
  run_root_template: ROOT + '\\run\\{run_prefix8}', run_key: 'lowercase-uuid-v4-prefix8',
  task_prefix_template: 'A9-DEV-{run_prefix8}-', package_relative_root: 'p',
  tools_relative_root: 't', evidence_relative_root: 'e', data_relative_root: 'd', workspace_relative_root: 'w',
});
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
const encode = value => Buffer.from(JSON.stringify(value, null, 2) + '\n', 'utf8');
function need(ok, code) { if (!ok) throw Error('RUN_CONTEXT:' + code); }
function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function keys(value, names, code) {
  need(value && typeof value === 'object' && !Array.isArray(value)
    && equal(Object.keys(value).sort(), names.slice().sort()), code);
}
function read(file) {
  const stat = fs.lstatSync(file);
  need(stat.isFile() && !stat.isSymbolicLink() && stat.size <= 2 * 1024 * 1024, 'DATA_FILE');
  for (let at = path.resolve(file);; at = path.dirname(at)) {
    need(!fs.lstatSync(at).isSymbolicLink(), 'DATA_ANCESTOR');
    if (path.dirname(at) === at) break;
  }
  const raw = fs.readFileSync(file);
  need(raw[0] !== 0xef && !raw.includes(0), 'DATA_ENCODING');
  return require('./rehearsal-gate.cjs').parseJSON(raw);
}
function descriptor(id, evidenceClass, sshHost = SSH_HOSTS[0]) {
  need(typeof id === 'string' && UUID.test(id), 'UUID');
  need(CLASSES.includes(evidenceClass), 'EVIDENCE_CLASS');
  need(SSH_HOSTS.includes(sshHost), 'SSH_HOST');
  const prefix = id.slice(0, 8);
  return {
    schema_version: 1, mode: evidenceClass, evidence_class: evidenceClass, ssh_host: sshHost, run_id: id,
    remote_root: ROOT + '\\run\\' + prefix, task_prefix: 'A9-DEV-' + prefix + '-',
    local_evidence_root: 'outputs/next-version-r1/controller/' + prefix,
  };
}
function validate(d, mode) {
  need(d && typeof d === 'object', 'DESCRIPTOR');
  const expected = descriptor(d.run_id, d.evidence_class, d.ssh_host);
  keys(d, Object.keys(expected), 'DESCRIPTOR_FIELDS');
  need(mode === undefined || mode === d.evidence_class, 'MODE');
  for (const k of Object.keys(expected)) need(d[k] === expected[k], 'PATH_OR_TASK_PREFIX:' + k);
  return d;
}
function validateLayout(layout) {
  keys(layout, Object.keys(LAYOUT), 'LAYOUT_FIELDS');
  for (const k of Object.keys(LAYOUT)) need(layout[k] === LAYOUT[k], 'LAYOUT:' + k);
  return layout;
}
function roots(d) {
  validate(d);
  return { channel_root: ROOT, run_root: d.remote_root,
    candidate_root: path.win32.join(d.remote_root, 'p'), tools_root: path.win32.join(d.remote_root, 't'),
    evidence_root: path.win32.join(d.remote_root, 'e'), data_root: path.win32.join(d.remote_root, 'd'),
    work_root: path.win32.join(d.remote_root, 'w') };
}
function time(value, code) {
  need(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value), code);
  const n = Date.parse(value); need(Number.isFinite(n), code); return n;
}
function context(d, prep, data) {
  validate(d);
  need(typeof prep === 'string' && prep.length > 0, 'PREPARATION_REQUIRED');
  const input = data || read(path.join(prep, 'external', 'RUN_CONTEXT.json'));
  keys(input, ['schema_version', 'execution_layout', 'descriptor', 'window', 'budget', 'facts'], 'CONTEXT_FIELDS');
  need(input.schema_version === 1, 'CONTEXT_VERSION'); validateLayout(input.execution_layout);
  validate(input.descriptor); need(equal(d, input.descriptor), 'DESCRIPTOR_BINDING');
  keys(input.window, ['starts_at_utc', 'expires_at_utc'], 'WINDOW_FIELDS');
  need(time(input.window.expires_at_utc, 'WINDOW_END') > time(input.window.starts_at_utc, 'WINDOW_START'), 'WINDOW_ORDER');
  const b = input.budget, f = input.facts, r = roots(d);
  need(b && b.p1 && f && Array.isArray(f.builds) && f.builds.length > 0, 'INPUTS');
  need(b.run_id === d.run_id && b.new_remote_root === r.run_root, 'RUN_BINDING');
  for (const k of ['candidate_root', 'tools_root', 'evidence_root', 'work_root', 'data_root']) need(b[k] === r[k], 'ROOT_LAYOUT:' + k);
  need(b.p1.remote_root === r.run_root && b.p1.evidence_class === d.evidence_class && b.p1.ssh_host === d.ssh_host, 'BUDGET_BINDING');
  need(Number.isSafeInteger(b.p1.target_session_id) && b.p1.target_session_id > 0, 'TARGET_SESSION');
  need(Number.isSafeInteger(b.p1.max_total_seconds) && b.p1.max_total_seconds > 0, 'WALL_BUDGET');
  need(Number.isSafeInteger(b.p1.max_phase_requests) && b.p1.max_phase_requests > 0, 'REQUEST_BUDGET');
  need(!Object.prototype.hasOwnProperty.call(b, 'forbidden_runs') && !Object.prototype.hasOwnProperty.call(b, 'forbidden_roots')
    && !Object.prototype.hasOwnProperty.call(b, 'forbidden_root_sha256'), 'LOCAL_ONLY_DATA');
  need(b.target_record && b.target_record.account_name === 'agent' && b.target_record.account_sid === b.target_sid
    && typeof b.target_machine === 'string' && b.target_record.machine_name.toLowerCase() === b.target_machine.toLowerCase(), 'TARGET_RECORD');
  const p = plan.fromBudget(b);
  need(b.p1.max_total_seconds <= (time(input.window.expires_at_utc, 'WINDOW_END') - time(input.window.starts_at_utc, 'WINDOW_START')) / 1000, 'WINDOW_BUDGET');
  need(p.products.length === b.p1.max_phase_requests, 'REQUEST_COUNT');
  return { budget: b, facts: f, prep: path.resolve(prep), descriptor: d, mode: d.evidence_class,
    evidence_class: d.evidence_class, window: input.window, data: input };
}
function load(file, mode) {
  const d = read(file); validate(d, mode);
  const prep = path.dirname(path.dirname(path.resolve(file)));
  const ctx = context(d, prep);
  return Object.assign(ctx, { descriptorFile: path.resolve(file), descriptorSha: sha(fs.readFileSync(file)) });
}
function loadMode(file) { return read(file).evidence_class; }
function render(text, d) {
  validate(d);
  // Only source constants may be expanded. Run values never enter executable text.
  return text.split('@ENVIRONMENT_PROCESS_PS@').join(fs.readFileSync(path.join(__dirname, 'environment-process.ps1'), 'utf8'));
}
function runtimePS(d) { validate(d); return fs.readFileSync(path.join(__dirname, 'runtime.ps1')); }
function runtimeData(ctx) {
  const d = ctx.descriptor, b = ctx.budget, p = plan.fromBudget(b); validate(d);
  return { schema_version: 1, run_id: d.run_id, remote_root: d.remote_root, task_prefix: d.task_prefix,
    evidence_class: d.evidence_class, target_session_id: b.p1.target_session_id,
    expires_at_utc: ctx.window.expires_at_utc, products: p.products, dispatch: p.dispatch,
    seconds: p.dispatch.map(n => p.seconds[n]) };
}
function packageData(ctx) {
  const b=ctx.facts.builds[0];
  need(typeof b.zip_top==='string'&&/^[A-Za-z0-9][A-Za-z0-9_.-]{0,126}$/.test(b.zip_top)&&!/[. ]$/.test(b.zip_top),'ZIP_TOP');
  need(Number.isSafeInteger(b.zip_entries)&&b.zip_entries>0&&b.zip_entries<65535,'ZIP_ENTRIES');
  need(/^[a-f0-9]{64}$/.test(b.sha256||'')&&/^[a-f0-9]{64}$/.test(b.zip_entries_sha256||''),'ZIP_PINS');
  return {schema_version:1,run_id:ctx.descriptor.run_id,zip_top:b.zip_top,zip_entries:b.zip_entries,
    zip_sha256:b.sha256,inventory_sha256:b.zip_entries_sha256,account_sid:ctx.budget.target_sid};
}
function paths(ctx) {
  need(ctx.repo && path.isAbsolute(ctx.repo) && ctx.inputRoot && path.isAbsolute(ctx.inputRoot), 'LOCAL_PATHS_REQUIRED');
  validate(ctx.descriptor);
  return { repo: ctx.repo, out: path.join(ctx.repo, ctx.descriptor.local_evidence_root), input: ctx.inputRoot,
    authority: path.join(ctx.inputRoot, 'external', 'release-authority.json') };
}
module.exports = { SSH_HOSTS, CLASSES, ROOT, LAYOUT, sha, encode, read, descriptor, validate, validateLayout,
  roots, time, packageData, context, load, loadMode, render, runtimePS, runtimeData, paths };

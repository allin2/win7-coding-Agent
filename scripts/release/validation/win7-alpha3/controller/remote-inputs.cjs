'use strict';
// Immutable executable closure + separately hashed JSON. No rendering of run values into code.
const fs = require('fs');
const path = require('path');
const c = require('./run-context.cjs');
const TOOLS = Object.freeze(['admin-materials.ps1', 'admin-zip.cs', 'controller-injob-probe.ps1',
  'environment-process.ps1', 'gpu-cleanup.ps1', 'gpu-contract.cjs',
  'gpu-entry-gate.ps1', 'issue-request.cjs', 'launcher-common.ps1', 'launcher-contract.cjs',
  'phase-plan.cjs', 'rehearsal-gate.cjs', 'rehearsal-task.ps1', 'run-context.cjs', 'remote-inputs.cjs',
  'runtime.ps1', 'target-binding.cjs', 'trace-contract.cjs', 'trace-seal.cjs', 'writer-registry.ps1']);
const PAYLOAD = Object.freeze(['payload/capturer.js', 'payload/event-log.js', 'payload/diag-app/main.js', 'payload/diag-app/package.json']);
function need(ok, code) { if (!ok) throw Error('REMOTE_INPUTS:' + code); }
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function safeName(name) {
  need(typeof name === 'string' && /^[A-Za-z0-9_.\/-]+$/.test(name) && !name.startsWith('/')
    && name.split('/').every(s => s && s !== '.' && s !== '..' && !/[. ]$/.test(s)), 'PATH'); return name;
}
function sourceNames() {
  return TOOLS.map(n => 'tools/' + n).concat(PAYLOAD, require('./phase-plan.cjs').DISPATCH.map(p => 'tasks/' + p + '.xml')).sort();
}
function sourceFile(name) {
  safeName(name); need(sourceNames().includes(name), 'SOURCE_CLOSURE');
  if (name.startsWith('tools/')) return path.join(__dirname, name.slice(6));
  // Source layout is controller/{*.cjs,payload,tasks}; deployed layout is t/{tools,payload,tasks}.
  return path.join(path.basename(__dirname) === 'tools' ? path.dirname(__dirname) : __dirname, name);
}
function regular(file, root) {
  const absolute = path.resolve(file), limit = path.resolve(root);
  let at = absolute;
  for (;;) {
    const stat = fs.lstatSync(at); need(!stat.isSymbolicLink(), 'INPUT_REPARSE');
    if (at === absolute) need(stat.isFile(), 'INPUT_NOT_FILE');
    else need(stat.isDirectory(), 'INPUT_ANCESTOR_TYPE');
    if (at === limit) break;
    need(at !== path.dirname(at), 'INPUT_OUTSIDE_ROOT'); at = path.dirname(at);
  }
  return fs.readFileSync(absolute);
}
function sourcePins() {
  const pins = {};
  for (const name of sourceNames()) {
    const file = sourceFile(name);
    pins[name] = c.sha(regular(file, path.basename(__dirname) === 'tools' ? path.dirname(__dirname) : __dirname));
  }
  return pins;
}
function files(ctx) {
  c.context(ctx.descriptor, ctx.prep, ctx.data);
  const rows = {};
  for (const name of sourceNames()) rows[name] = fs.readFileSync(sourceFile(name));
  rows['external/RUN_DESCRIPTOR.json'] = c.encode(ctx.descriptor);
  rows['external/RUN_CONTEXT.json'] = ctx.runContextBytes||c.encode(ctx.data);
  rows['external/runtime-data.json'] = Buffer.from(JSON.stringify(c.runtimeData(ctx)) + '\n', 'utf8');
  rows['external/runtime.ps1'] = c.runtimePS(ctx.descriptor);
  rows['external/package-data.json'] = Buffer.from(JSON.stringify(c.packageData(ctx))+'\n','utf8');
  return rows;
}
function names() { return sourceNames().concat(['external/RUN_DESCRIPTOR.json', 'external/RUN_CONTEXT.json', 'external/runtime-data.json', 'external/runtime.ps1', 'external/package-data.json']); }
function bind(ctx, pins, executionBindingSha256) {
  need(/^[a-f0-9]{64}$/.test(executionBindingSha256 || ''), 'EXECUTION_BINDING_SHA');
  need(same(pins, sourcePins()), 'SOURCE_PINS');
  const rows = files(ctx);
  return { schema_version: 1, run_id: ctx.descriptor.run_id, evidence_class: ctx.descriptor.evidence_class,
    execution_binding_sha256: executionBindingSha256, source_tools: pins,
    files: Object.fromEntries(Object.entries(rows).map(([name, bytes]) => [name, { bytes: bytes.length, sha256: c.sha(bytes) }])) };
}
function isRemote(prep) { return fs.existsSync(path.join(prep, 'external/RUNTIME_INPUTS.json')); }
function verifyRemote(prep, ctx) {
  const raw = regular(path.join(prep, 'external/RUNTIME_INPUTS.json'), prep);
  need(raw.length <= 262144, 'MANIFEST_BOUND');
  const binding = require('./rehearsal-gate.cjs').parseJSON(raw);
  need(binding && binding.schema_version === 1 && binding.run_id === ctx.descriptor.run_id
    && binding.evidence_class === ctx.descriptor.evidence_class, 'RUN_BINDING');
  need(same(Object.keys(binding).sort(), ['schema_version', 'run_id', 'evidence_class', 'execution_binding_sha256', 'source_tools', 'files'].sort()), 'MANIFEST_FIELDS');
  need(same(Object.keys(binding.files), names()) && same(Object.keys(binding.source_tools), sourceNames()), 'EXACT_CLOSURE');
  for (const [name, pin] of Object.entries(binding.files)) {
    safeName(name);
    need(same(Object.keys(pin).sort(), ['bytes', 'sha256']), 'PIN_FIELDS');
    const bytes = regular(path.join(prep, name), prep);
    need(Number.isSafeInteger(pin.bytes) && bytes.length === pin.bytes && c.sha(bytes) === pin.sha256, 'INPUT_HASH:' + name);
    if (sourceNames().includes(name)) need(binding.source_tools[name] === pin.sha256, 'SOURCE_HASH:' + name);
  }
  const bytes = regular(path.join(prep, 'external/release-authority.json'), prep);
  require('./target-binding.cjs').verify(bytes, binding.execution_binding_sha256, ctx);
  return { binding, execution_tools: binding.source_tools, executionBindingSha256: binding.execution_binding_sha256 };
}
function validateBinding(binding, ctx, pins) {
  need(same(binding.source_tools, pins), 'SOURCE_PINS');
  need(same(binding, bind(ctx, pins, binding.execution_binding_sha256)), 'BINDING');
}
module.exports = { regular, TOOLS, PAYLOAD, names, sourceNames, sourcePins, sourceFile, safeName, isRemote, files, bind, verifyRemote, validateBinding };

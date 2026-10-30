'use strict';
// LOCAL ONLY. Complete authority validation/reservation before a caller may write to the target.
// This module never contacts a host or dispatches a product.
const fs = require('fs');
const path = require('path');
const authority = require('../authority.cjs');
const context = require('./run-context.cjs');
const runtime = require('./remote-inputs.cjs');
const target = require('./target-binding.cjs');
const gate = require('./rehearsal-gate.cjs');
function need(ok, code) { if (!ok) throw Error('LOCAL_ENTRY:' + code); }
function bytes(options, key, fileKey) {
  if (Buffer.isBuffer(options[key])) return options[key];
  return fs.readFileSync(options[fileKey]);
}
function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function check(ctx, options, reserve) {
  const settings = Object.assign({}, options || {}), now = settings.now === undefined ? Date.now() : settings.now;
  context.context(ctx.descriptor, ctx.prep, ctx.data);
  need(settings.mode === ctx.descriptor.evidence_class, 'CLASS');
  const tools=require('./execution-tools.cjs');
  const manifestBytes=bytes(settings,'executionToolsManifestBytes','executionToolsManifestPath');
  tools.verify(manifestBytes,ctx);
  const runBytes=bytes(settings,'runContextBytes','runContextPath');
  need(same(gate.parseJSON(runBytes),ctx.data),'RUN_CONTEXT_BYTES');
  ctx.runContextBytes=Buffer.from(runBytes);
  const planBytes=bytes(settings,'phasePlanBytes','phasePlanPath');
  need(same(gate.parseJSON(planBytes),require('./phase-plan.cjs').fromBudget(ctx.budget)),'PHASE_PLAN_BYTES');
  const raw = bytes(settings, 'executionBindingBytes', 'executionBindingPath'), sha256 = context.sha(raw);
  target.verify(raw, sha256, ctx, now);
  gate.presign(gate.parseJSON(raw), ctx, 'FULL');
  const requested = { max_requests: ctx.budget.p1.max_phase_requests, max_wall_seconds: ctx.budget.p1.max_total_seconds,
    max_real_model_requests: ctx.budget.p1.max_real_model_requests };
  for (const n of Object.values(requested)) need(Number.isSafeInteger(n) && n >= 0, 'BUDGET');
  if (settings.mode === 'DEV_CHANNEL') {
    need(settings.developmentScope&&same(settings.inputBindings,settings.developmentScope.execution_inputs),'DEV_SCOPE_INPUT_BINDINGS');
  }
  if (settings.mode === 'FORMAL_GATE_A_EXECUTION') {
    // P1 checks receipt, independent pin, bound bytes, deny-set hash/anchor/superset and hit.
    authority.validateFormal(settings);
    const payload = gate.parseJSON(bytes(settings, 'payloadBytes', 'payloadPath'));
    need(same(payload.window, ctx.window) && same(payload.budget, requested), 'GATE_A_CONTEXT_WINDOW_BUDGET');
    need(same(payload.execution_layout, ctx.data.execution_layout), 'GATE_A_LAYOUT');
  } else {
    authority.validateDevelopment(settings);
    const scope = settings.developmentScope;
    need(scope && scope.schema_version === 1 && scope.authorization === 'A9-43/ENGINEERING_03-r2'
      && scope.source_commit === ctx.facts.source_commit && scope.account_sid === ctx.budget.target_sid
      && scope.machine_name === ctx.budget.target_machine, 'DEV_SCOPE');
    need(now >= context.time(ctx.window.starts_at_utc, 'DEV_START') && now < context.time(ctx.window.expires_at_utc, 'DEV_END')
      && context.time(ctx.window.expires_at_utc, 'DEV_END') <= context.time(scope.expires_at_utc, 'DEV_SCOPE_END')
      && context.time(scope.expires_at_utc, 'DEV_SCOPE_END') <= Date.parse('2026-11-28T00:00:00Z'), 'DEV_SCOPE_WINDOW');
    for (const key of Object.keys(requested)) need(Number.isSafeInteger(scope[key]) && requested[key] <= scope[key], 'DEV_SCOPE_BUDGET');
  }
  const pins = runtime.sourcePins(), manifest = runtime.bind(ctx, pins, sha256);
  // Reserve last: invalid context/materials must not consume a run. No receipt/deny data is projected.
  const result = reserve ? authority.validateAndReserve(settings) :
    (settings.mode === 'FORMAL_GATE_A_EXECUTION' ? authority.validateFormal(settings) : authority.validateDevelopment(settings));
  return { input_bytes:{manifest:Buffer.from(manifestBytes),context:Buffer.from(runBytes),plan:Buffer.from(planBytes)}, execution_inputs: result.execution_inputs, authority: result, runtime_inputs: manifest, files: runtime.files(ctx), execution_binding_sha256: sha256 };
}
function prepare(ctx, options) { return check(ctx, options, true); }
function validate(ctx, options) { return check(ctx, options, false); }
function loadOptions(file) {
  const options=context.read(file);
  need(options && typeof options === 'object' && !Array.isArray(options),'AUTHORIZATION_OPTIONS');
  for(const key of Object.keys(options)) {
    need(!key.endsWith('Bytes'),'AUTHORIZATION_PATHS_REQUIRED');
    if(key.endsWith('Path')||key==='ledgerDir') need(typeof options[key]==='string'&&path.isAbsolute(options[key]),'AUTHORIZATION_ABSOLUTE_PATH');
  }
  need(/^[A-Za-z0-9_-]{1,64}$/.test(options.lockHolder||''),'LOCK_HOLDER');
  return options;
}
module.exports = { prepare, validate, loadOptions };

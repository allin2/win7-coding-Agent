'use strict';
// Target-only binding checks. No dependency on the local authority entry, receipt, or deny-set code.
const crypto = require('crypto');
const context = require('./run-context.cjs');
const sha = b => crypto.createHash('sha256').update(b).digest('hex');
function need(ok, code) { if (!ok) throw Error('TARGET_BINDING:' + code); }
function fields(value, names, code) {
  need(value && typeof value === 'object' && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(names.slice().sort()), code);
}
function same(a, b) {
  if (!a || !b) return false;
  return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => a[k] === b[k]);
}
function verify(bytes, expectedSha256, ctx, now = Date.now()) {
  need(Buffer.isBuffer(bytes) && bytes.length <= 65536, 'BYTES');
  need(/^[a-f0-9]{64}$/.test(expectedSha256 || '') && sha(bytes) === expectedSha256, 'REQUEST_SHA');
  const a = require('./rehearsal-gate.cjs').parseJSON(bytes);
  fields(a, ['schema_version', 'kind', 'evidence_class', 'run_id', 'formal_input_lock_sha256', 'approval_registry', 'candidate', 'target'], 'FIELDS');
  need(a.schema_version === 1 && a.kind === 'WIN7_56_EXECUTION_BINDING', 'KIND');
  const d = ctx.descriptor; context.validate(d);
  need(a.run_id === d.run_id && a.evidence_class === d.evidence_class && context.CLASSES.includes(a.evidence_class), 'RUN_CLASS');
  fields(a.candidate, ['source_commit', 'package_sha256', 'manifest_sha256', 'kit_sha256', 'helper_sha256'], 'CANDIDATE_FIELDS');
  need(/^[a-f0-9]{40}$/.test(a.candidate.source_commit || ''), 'SOURCE');
  for (const k of ['package_sha256', 'manifest_sha256', 'kit_sha256', 'helper_sha256']) need(/^[a-f0-9]{64}$/.test(a.candidate[k] || '') && !/^0+$/.test(a.candidate[k]), 'CANDIDATE_HASH');
  const f = ctx.facts, b = f.builds[0];
  need(same(a.candidate, { source_commit: f.source_commit, package_sha256: b.sha256,
    manifest_sha256: b.manifest_sha256, kit_sha256: b.kit_sha256, helper_sha256: f.helper_sha256 }), 'CANDIDATE_BINDING');
  fields(a.approval_registry, ['commit', 'sha256'], 'REGISTRY_FIELDS');
  need(/^[a-f0-9]{40}$/.test(a.approval_registry.commit || '') && /^[a-f0-9]{64}$/.test(a.approval_registry.sha256 || '')
    && same(a.approval_registry, f.approval_registry), 'REGISTRY');
  need(/^[a-f0-9]{64}$/.test(a.formal_input_lock_sha256 || '') && a.formal_input_lock_sha256 === f.formal_input_lock_sha256, 'LOCK');
  fields(a.target, ['machine_name', 'account_sid'], 'TARGET_FIELDS');
  need(typeof a.target.machine_name === 'string' && a.target.machine_name.toLowerCase() === ctx.budget.target_machine.toLowerCase()
    && /^S-1-5-21-[0-9-]+$/.test(a.target.account_sid || '') && a.target.account_sid === ctx.budget.target_sid, 'TARGET');
  const start = context.time(ctx.window.starts_at_utc, 'WINDOW_START');
  const end = context.time(ctx.window.expires_at_utc, 'WINDOW_END');
  need(Number.isFinite(now) && now >= start && now < end, 'WINDOW');
  return a;
}
module.exports = { verify, sha };

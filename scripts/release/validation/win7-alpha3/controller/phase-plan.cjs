'use strict';
// The original FULL product order and GPU gate are shared by both evidence classes.
const fs = require('fs');
const path = require('path');
const PRODUCTS = Object.freeze(['p01-env', 'p02-integrity', 'p03-chain', 'p04-streaming', 'p05-session-bg',
  'p06-continue', 'p07-safe', 'p08-ui', 'p09-report', 'p10-postflight']);
const GATE = 'gpu-entry-gate';
const DISPATCH = Object.freeze(PRODUCTS.slice(0, 2).concat([GATE], PRODUCTS.slice(2)));
// Scheduler hard ceilings retain the actually transferred WIN7-55 values. Lower per-run budgets
// are enforced by the data-driven controller/phase clocks, not by rewriting XML.
const CEILINGS = Object.freeze({ 'p01-env': 600, 'p02-integrity': 600, 'gpu-entry-gate': 120,
  'p03-chain': 1380, 'p04-streaming': 1620, 'p05-session-bg': 600, 'p06-continue': 600,
  'p07-safe': 10740, 'p08-ui': 600, 'p09-report': 300, 'p10-postflight': 600 });
function need(ok, code) { if (!ok) throw Error('PHASE_PLAN:' + code); }
function equal(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
function fromBudget(b) {
  const r = b && b.p1;
  need(b && b.selected_plan === 'FULL' && r && r.plan === 'FULL', 'FULL_REQUIRED');
  need(equal(r.phases, PRODUCTS) && equal(r.dispatch_stages, DISPATCH), 'FULL_ORDER');
  need(r.gate_requests === 1 && r.max_phase_requests === PRODUCTS.length, 'REQUEST_COUNT');
  need(r.phase_ceiling_seconds && equal(Object.keys(r.phase_ceiling_seconds).sort(), PRODUCTS.slice().sort()), 'TIMEOUT_FIELDS');
  const seconds = Object.fromEntries(DISPATCH.map(p => [p, p === GATE ? r.gate_ceiling_seconds : r.phase_ceiling_seconds[p]]));
  for (const p of DISPATCH) need(Number.isSafeInteger(seconds[p]) && seconds[p] > 0 && seconds[p] <= CEILINGS[p], 'TIMEOUT:' + p);
  return { products: PRODUCTS.slice(), dispatch: DISPATCH.slice(), gate: GATE, gateIndex: 2,
    beforeGate: DISPATCH.slice(0, 2), afterGate: DISPATCH.slice(3), seconds,
    requestDirectories: PRODUCTS.map((p, i) => String(i + 1).padStart(2, '0') + '-' + p),
    requestCount: PRODUCTS.length, stageCount: DISPATCH.length };
}
function accept(b, phase, scope = 'dispatch') {
  const p = fromBudget(b);
  const allowed = scope === 'dispatch' ? p.dispatch : scope === 'product' ? p.products : scope === 'gate' ? [p.gate] : null;
  need(allowed && allowed.includes(phase), 'PHASE_OUTSIDE_PLAN'); return p;
}
function ps(b) {
  fromBudget(b);
  return fs.readFileSync(path.join(__dirname, 'runtime.ps1'), 'utf8');
}
function task(b, name) {
  const phase = name.replace(/^tasks\//, '').replace(/\.xml$/, '');
  accept(b, phase); need(name === 'tasks/' + phase + '.xml', 'TASK_IDENTITY');
  return fs.readFileSync(path.join(__dirname, 'tasks', phase + '.xml'), 'utf8');
}
module.exports = { PRODUCTS, DISPATCH, GATE, CEILINGS, fromBudget, accept, ps, task };

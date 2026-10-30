'use strict';
const fs = require('fs');
const path = require('path');
const runContext = require('../tools/run-context.cjs');
const descriptorFile = path.join(__dirname, '../external/RUN_DESCRIPTOR.json');
function context(root, run, caseId) {
  const d = JSON.parse(fs.readFileSync(descriptorFile, 'utf8'));
  runContext.validate(d, d.mode);
  if (root !== d.remote_root || run !== d.run_id || caseId !== 'gpu-entry-gate') throw new Error('ROOT_RUN_CASE_MISMATCH');
  return { root, run, caseId, evidenceClass: d.evidence_class,
    driver: path.win32.join(d.remote_root, 'e', 'driver-electron', 'electron.exe'),
    dir: path.win32.join(root, 'e', caseId) };
}
function safe(file) {
  // Every existing ancestor must be a real directory/file, never a reparse model.
  let current = file;
  while (current) {
    try { if (fs.lstatSync(current).isSymbolicLink()) throw new Error('REPARSE_POINT'); }
    catch (error) { if (error.code !== 'ENOENT') throw error; }
    const parent = path.win32.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function createWriter(ctx, role) {
  if (!['capturer', 'app'].includes(role)) throw new Error('ROLE');
  const file = path.win32.join(ctx.dir, role + '-events.jsonl');
  safe(file);
  const fd = fs.openSync(file, 'wx');
  let bytes = 0;
  let count = 0;
  let bounded = false;
  function limit(kind) {
    if (!bounded) {
      bounded = true;
      const marker = path.win32.join(ctx.dir, role + '-bound.json');
      safe(marker);
      fs.writeFileSync(marker, JSON.stringify({ schema_version: 1, classification: ctx.evidenceClass, formal_gate_a: false, formal_gate_b: false, kind, outcome: 'HALTED', bytes, count }) + '\n', { encoding: 'utf8', flag: 'wx' });
    }
    throw new Error(kind);
  }
  return function event(name, data) {
    if (bounded) throw new Error('EVENT_BOUND');
    const line = JSON.stringify({ schema_version: 1, classification: ctx.evidenceClass, formal_gate_a: false, formal_gate_b: false, run_id: ctx.run, case: ctx.caseId, role, pid: process.pid, parent_pid: process.ppid, creation_time: 'UNKNOWN_EXTERNAL_REGISTRY', source: 'node_self', utc: new Date().toISOString(), ticks: process.hrtime.bigint().toString(), frequency: '1000000000', event: name, data }) + '\n';
    const raw = Buffer.from(line, 'utf8');
    if (++count > 10000 || bytes + raw.length > 524288 || raw.length > 16384) return limit('EVENT_BOUND');
    let offset = 0;
    while (offset < raw.length) {
      const written = fs.writeSync(fd, raw, offset, raw.length - offset);
      if (written <= 0) return limit('EVENT_WRITE_FAILED');
      offset += written;
    }
    bytes += raw.length;
    fs.fsyncSync(fd);
  };
}
module.exports = { context, safe, createWriter };

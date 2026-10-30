import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const api = require('../../validation/win10/input-binding.cjs');
const here = path.dirname(fileURLToPath(import.meta.url));
export const toolRoot = path.resolve(here, '../../validation/win10');
const fixturePins = {
  local: 'd51fdc13f859af4ce8c79bdb0c4b02a20c27dcb1e73f6db4448488186b282343',
  current: '5ceb4c8df20b47c83f1a0e12532f36541bcac4287f6a9d5d3c8fdac2059ba7d0',
  forensic: '0d78a8d4d68d67bb726914e8df87e135e557962a59b8ecb5bcc71915ae9fa152',
};
export function temporary(prefix) {
  return fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), 'win10-TEST_ONLY-' + prefix));
}
export function bindingFixture(name = 'current') {
  const bytes = fs.readFileSync(path.join(here, 'win10-TEST_ONLY', name + '.json'));
  assert.equal(api.sha(bytes), fixturePins[name], 'tracked TEST_ONLY binding bytes');
  const b = JSON.parse(bytes).binding;
  // Refresh only the current tool closure. Immutable component records and
  // reference hashes stay byte-for-byte locked by the production validator.
  b.tool_identity.files = b.tool_identity.files.map(r => api.fileRow(path.join(toolRoot, r.file)));
  b.tool_identity.files_digest = api.sha(Buffer.from(b.tool_identity.files.map(r => `${r.file}:${r.size}:${r.sha256}\n`).sort().join('')));
  if (b.execution_scope) {
    b.execution_scope.tool_digest = b.tool_identity.files_digest;
    b.execution_scope.component_digest = api.componentDigest(b);
  }
  return api.verifyStaticFiles(b);
}
export function shapeFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(here, 'win10-TEST_ONLY', name + '-shape.json'), 'utf8')).value;
}
export function isolatedTools() {
  const base = temporary('cli-');
  const tools = path.join(base, 'scripts/release/validation/win10');
  const out = path.join(base, 'outputs/engineering-win10-entry-20261007-r1');
  fs.mkdirSync(tools, { recursive: true }); fs.mkdirSync(out, { recursive: true });
  for (const name of api.ADMISSION_FILES) {
    fs.copyFileSync(path.join(toolRoot, name), path.join(tools, name));
    assert.deepEqual(fs.readFileSync(path.join(tools, name)), fs.readFileSync(path.join(toolRoot, name)));
  }
  return { tools, out, tool: path.join(tools, 'input-binding.cjs') };
}
export function writeBinding(dir, name = 'forensic') {
  const file = path.join(dir, name + '-TEST_ONLY.json');
  const b = bindingFixture(name), hash = api.writeNew(file, b);
  return { b, file, hash };
}
// A restored root contains a9-31-developer/ and engineering-win10-entry-r1/.
// No implicit local history lookup, no caller-supplied replacement hash.
export const archiveRoot = process.env.A9_WIN10_ARCHIVE_ROOT;
export function archiveFile(relative, restoredRoot = archiveRoot) {
  assert.ok(restoredRoot && path.isAbsolute(restoredRoot), 'explicit absolute A9_WIN10_ARCHIVE_ROOT required');
  const pins = JSON.parse(fs.readFileSync(path.join(here, 'win10-TEST_ONLY/archive-pins.json'), 'utf8')).files;
  const row = pins[relative]; assert.ok(row, 'missing original archive pin: ' + relative);
  const file = path.join(restoredRoot, relative);
  api.verifyFile(file, { file: path.basename(file), ...row });
  return file;
}
export function historicalTest(name, fn) {
  test('historical replay: ' + name, t => {
    if (!archiveRoot) return t.skip('NOT_PERFORMED: set A9_WIN10_ARCHIVE_ROOT to a hash-verified archive restore');
    return fn(t);
  });
}
export function receiptFixture(b) {
  const parent = { pid: 123, creation_ticks: '639269600000000000', session: 0 };
  const identity = { Sid: 'S-1-5-21-3031939772-989444280-3099258187-500', User: 'WIN-2JQ66JE4HTQ\\Administrator', IntegritySid: 'S-1-16-12288', Pid: 123, Session: 0, Rid: 12288, ElevationType: 1, Elevated: true, Ordinary: false, InJob: true };
  const sync = api.legacyMaster(b).sync_contract;
  const receipt = { schema_version: 1, proof_kind: 'SYNC_READONLY_PROBE_RESULT', runtime_profile: sync.runtime_profile, receipt_id: '1'.repeat(32), request_id: '2'.repeat(32), master_sha256: '3'.repeat(64), revision_sha256: '4'.repeat(64), source: b.product_identity.source, parent, call_module: sync.call_module, cmd: sync.cmd, argv: sync.argv, options: { shell: false, windowsHide: true, timeout_ms: 5000, encoding: 'utf8' }, started_utc_ms: 1000000, returned_utc_ms: 1000001, started_monotonic_ns: '1000000000', returned_monotonic_ns: '1001000000', timestamp_precision_ms: sync.timestamp_precision_ms, result: { pid: 456, status: 0, signal: null, error: null }, outputs: { stdout_bytes: 0, stderr_bytes: 0, summary: '[output omitted; UTF8 returned-text byte counts only; raw bytes UNKNOWN]' } };
  return { receipt, identity };
}

export function archiveCollection(name) {
  const pins = JSON.parse(fs.readFileSync(path.join(here, 'win10-TEST_ONLY/archive-pins.json'), 'utf8')).files;
  const entries = Object.keys(pins).filter(p => p.startsWith(name + '/'));
  assert.ok(entries.length, 'original collection pins required');
  for (const relative of entries) archiveFile(relative);
  return path.join(archiveRoot, name);
}

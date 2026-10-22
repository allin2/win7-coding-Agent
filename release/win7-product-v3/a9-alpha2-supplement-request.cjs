'use strict';

// Candidate-external A9-36 inputs. No requests from the old batch2 ledger are accepted.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// m6 (persistence cross-read, ADR-0245) runs after the free fixture groups and before the paid real-service group.
const PHASES = Object.freeze(['m4', 'm1', 'm2', 'm3', 'm6', 'm5']);
// Retired identities are deny-only. The final candidate hashes come exclusively from the owner's Gate A authority.
const RETIRED_W45 = Object.freeze({ source: 'ba042757a04f428cb3db3ccd10888a7bebe97d3b',
  package_sha256: 'ae1d4bb109df68c2f23e08cb4b927f2168f7a1f645969643f35101bf8f9da96e',
  manifest_sha256: '520bda7e34cade8c611d8d28120a46b046519b462e3df8978968efc45e07c7df' });
// Rollback target for M6: frozen WIN7-42.
const W42_SOURCE = '94385a87d22928acc1ce5dd8f1881d89e0d4473b';
const W42_PACKAGE_SHA = '3b6e0b72b98de794594cd6924a1298ef75ed72bafcebacf966c86ad2382a01cf';
const W42_MANIFEST_SHA = '6f7b224cdb304c9e10edf87ec9c490ffeb7dd5be42f9432ba3b6c5f3df3908c9';
const W42_PERSISTENCE_SHA = 'd57f1aa6fd2425f3da1ae20654fbe68782f5e0ab1e172d5579bfd615ebf8755e';
const M6_FIXTURE_FILES = Object.freeze(['F42.sqlite', 'FCandC.sqlite', 'FCandN.sqlite', 'C42.sqlite', 'CCand.sqlite', 'baseline.json']);
// Fixed clock for enforceRetention; never read from the system clock, so the target and the developer baseline see the same cutoff.
const M6_NOW = '2026-10-16T12:00:00.000Z';
const INPUTS = Object.freeze(['a9-alpha2-supplement.cjs', 'a9-alpha2-supplement-request.cjs', 'a9-alpha2-supplement-desktop.ps1', 'a9-batch2-driver-entry.cjs']);
const fail = (code) => { throw new Error(`A9_36_${code}`); };
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
// Reject hashes with fewer than eight distinct characters and repeated placeholder patterns, including a truncated last repetition.
function identityHash(value, length = 64) {
  if (typeof value !== 'string' || value.length !== length || /[^a-f0-9]/.test(value)) return false;
  if (new Set(value).size < 8) return false;
  for (let period = 1; period <= Math.floor(length / 2); period++) {
    if (value === value.slice(0, period).repeat(Math.ceil(length / period)).slice(0, length)) return false;
  }
  return true;
}
function fileHash(file) {
  const fd = fs.openSync(file, 'r'); const buffer = Buffer.alloc(1024 * 1024); const hash = crypto.createHash('sha256');
  try { let n; while ((n = fs.readSync(fd, buffer, 0, buffer.length, null))) hash.update(buffer.subarray(0, n)); }
  finally { fs.closeSync(fd); }
  return hash.digest('hex');
}
function exact(value, keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join('|') !== keys.slice().sort().join('|')) fail('FIELDS');
}
function readJson(file, max = 65536) {
  const stat = fs.lstatSync(file);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > max) fail('JSON_FILE');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}
function writeNew(file, value) { fs.writeFileSync(file, JSON.stringify(value, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' }); }
function absolute(value) {
  if (typeof value !== 'string' || !/^[A-Za-z]:\\/.test(value) || /[\r\n\x00"%]/.test(value) || value.length > 180 || value.split('\\').some((p) => p === '..' || p === '.')) fail('ABSOLUTE_PATH');
  return value;
}
function within(root, candidate) {
  const rel = path.relative(root, candidate);
  if (!rel || rel === '..' || rel.startsWith('..' + path.sep) || path.isAbsolute(rel)) fail('PATH_ESCAPE');
  return candidate;
}
function validateM6(a) {
  const m = a.m6;
  exact(m, ['w42_source', 'w42_zip_path', 'w42_zip_sha256', 'w42_manifest_sha256', 'w42_persistence_sha256', 'cand_persistence_sha256', 'native_sha256', 'w42_root', 'fixtures_root', 'fixture_files', 'now']);
  if (m.w42_source !== W42_SOURCE || m.w42_zip_sha256 !== W42_PACKAGE_SHA || m.w42_manifest_sha256 !== W42_MANIFEST_SHA || m.w42_persistence_sha256 !== W42_PERSISTENCE_SHA) fail('M6_BINDING');
  if (!identityHash(m.cand_persistence_sha256) || !identityHash(m.native_sha256)) fail('M6_HASH');
  for (const key of ['w42_zip_path', 'w42_root', 'fixtures_root']) absolute(m[key]);
  const run = a.run_root.toLowerCase() + '\\';
  for (const key of ['w42_zip_path', 'w42_root', 'fixtures_root']) if (!m[key].toLowerCase().startsWith(run)) fail('M6_ROOT_BINDING');
  if (m.fixtures_root.toLowerCase() !== (a.run_root + '\\inputs\\m6').toLowerCase()) fail('M6_FIXTURES_ROOT');
  for (const key of ['w42_root', 'fixtures_root']) {
    const lower = m[key].toLowerCase();
    if (lower === a.candidate_root.toLowerCase() || lower.startsWith(a.candidate_root.toLowerCase() + '\\') || a.candidate_root.toLowerCase().startsWith(lower + '\\')) fail('M6_ROOT_BINDING');
  }
  if (m.w42_root.toLowerCase() === m.fixtures_root.toLowerCase() || m.w42_root.toLowerCase().startsWith(m.fixtures_root.toLowerCase() + '\\') || m.fixtures_root.toLowerCase().startsWith(m.w42_root.toLowerCase() + '\\')) fail('M6_ROOT_BINDING');
  exact(m.fixture_files, M6_FIXTURE_FILES);
  if (!Object.values(m.fixture_files).every((h) => identityHash(h))) fail('M6_FIXTURE_HASH');
  if (m.now !== M6_NOW) fail('M6_NOW');
}
function validateAuthority(a, now = Date.now()) {
  exact(a, ['schema_version', 'task', 'status', 'run_id', 'candidate', 'source', 'runtime_sha256', 'package_sha256', 'manifest_sha256', 'candidate_root', 'run_root', 'zip_path', 'target', 'inputs', 'phases', 'max_requests', 'max_wall_seconds', 'expires_at', 'provider', 'credential_source', 'tools', 'm6']);
  if (a.schema_version !== 1 || a.task !== 'A9-36' || a.status !== 'OWNER_APPROVED' || a.candidate !== 'WIN7-50') fail('AUTHORITY');
  for (const key of ['source', 'package_sha256', 'manifest_sha256']) {
    if (!identityHash(a[key], key === 'source' ? 40 : 64)) fail('CANDIDATE_HASH');
    if (a[key] === RETIRED_W45[key]) fail('RETIRED_CANDIDATE');
  }
  if (!identityHash(a.runtime_sha256)) fail('RUNTIME_HASH');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(a.run_id)) fail('RUN_ID');
  if (JSON.stringify(a.phases) !== JSON.stringify(PHASES) || a.max_requests !== 6 || a.max_wall_seconds !== 7200) fail('BUDGET');
  const expires = Date.parse(a.expires_at);
  if (!Number.isFinite(expires) || expires <= now || expires - now > 8 * 3600000) fail('EXPIRED');
  for (const key of ['candidate_root', 'run_root', 'zip_path', 'credential_source']) absolute(a[key]);
  if (!a.run_root.endsWith('\\' + a.run_id.slice(0, 8)) || a.candidate_root.toLowerCase().startsWith(a.run_root.toLowerCase() + '\\')) fail('ROOT_BINDING');
  if (a.run_root.toLowerCase() === a.candidate_root.toLowerCase() || a.run_root.toLowerCase().startsWith(a.candidate_root.toLowerCase() + '\\')) fail('ROOT_BINDING');
  exact(a.target, ['machine', 'sid', 'session_id', 'integrity', 'elevated', 'in_job']);
  if (a.target.machine !== 'DCCS-CHAIZL-PC' || a.target.sid !== 'S-1-5-21-1708701742-428676696-1831205153-1001' || !Number.isSafeInteger(a.target.session_id) || a.target.session_id <= 0 || a.target.integrity !== 'Medium' || a.target.elevated !== false || a.target.in_job !== false) fail('TARGET');
  exact(a.inputs, INPUTS);
  if (!Object.values(a.inputs).every((h) => identityHash(h))) fail('INPUT_HASH');
  exact(a.provider, ['base_url', 'model', 'max_turns', 'max_requests', 'max_response_bytes']);
  if (a.provider.base_url !== 'https://api.deepseek.com' || a.provider.model !== 'deepseek-v4-flash' || a.provider.max_turns !== 3 || a.provider.max_requests !== 40 || a.provider.max_response_bytes !== 1048576) fail('PROVIDER');
  exact(a.tools, ['python', 'git']);
  for (const tool of Object.values(a.tools)) { exact(tool, ['path', 'sha256']); absolute(tool.path); if (!identityHash(tool.sha256)) fail('TOOL_HASH'); }
  if (a.credential_source !== 'C:\\Users\\agent\\AppData\\Local\\Win7CodingAgent\\a9') fail('CREDENTIAL_SOURCE');
  validateM6(a);
  return a;
}
function loadBound(authorityFile, pin, identity, now = Date.now()) {
  if (!identityHash(pin) || fileHash(authorityFile) !== pin) fail('PIN');
  const a = validateAuthority(readJson(authorityFile), now);
  exact(identity, ['machine', 'sid', 'session_id', 'integrity', 'elevated', 'in_job']);
  for (const key of Object.keys(a.target)) if (identity[key] !== a.target[key]) fail('TARGET_MISMATCH_' + key.toUpperCase());
  const dir = path.dirname(authorityFile);
  if (path.resolve(dir).toLowerCase() !== path.resolve(a.run_root, 'inputs').toLowerCase()) fail('AUTHORITY_LOCATION');
  for (const name of INPUTS) if (fileHash(path.join(dir, name)) !== a.inputs[name]) fail('INPUT_CHANGED');
  return a;
}
function createRequest(a, phase, pin, now = Date.now()) {
  if (!identityHash(pin)) fail('PIN');
  const index = PHASES.indexOf(phase);
  if (index < 0) fail('PHASE');
  return { schema_version: 1, task: 'A9-36', run_id: a.run_id, authority_sha256: pin, phase, index: index + 1,
    expires_at: new Date(Math.min(Date.parse(a.expires_at), now + 900000)).toISOString() };
}
function validateRequest(request, a, pin, now = Date.now()) {
  exact(request, ['schema_version', 'task', 'run_id', 'authority_sha256', 'phase', 'index', 'expires_at']);
  if (!identityHash(pin) || request.authority_sha256 !== pin) fail('REQUEST_AUTHORITY');
  if (request.schema_version !== 1 || request.task !== 'A9-36' || request.run_id !== a.run_id || !Number.isSafeInteger(request.index) || PHASES.indexOf(request.phase) !== request.index - 1 || !PHASES.includes(request.phase)) fail('REQUEST');
  const expiry = Date.parse(request.expires_at);
  if (!Number.isFinite(expiry) || expiry <= now || expiry > Date.parse(a.expires_at) || expiry - now > 900000) fail('REQUEST_EXPIRED');
}
function assertNext(request, a, ledgerRoot, pin, now = Date.now()) {
  validateRequest(request, a, pin, now);
  if (fs.existsSync(path.join(ledgerRoot, 'HALTED.json')) || fs.existsSync(path.join(ledgerRoot, `${request.index}.json`))) fail('CONSUMED_OR_HALTED');
  for (let n = 1; n < request.index; n++) {
    const previous = readJson(path.join(ledgerRoot, `${n}.json`));
    if (previous.authority_sha256 !== pin || previous.run_id !== a.run_id || previous.phase !== PHASES[n - 1] || previous.state !== 'COMPLETED' || previous.status !== 'PASS' || !/^[a-f0-9]{64}$/.test(previous.result_sha256 || '')) fail('PREREQUISITE');
    const resultPath = path.join(a.run_root, 'evidence', previous.phase, 'phase-result.json'); const priorResult = readJson(resultPath, 1048576);
    if (fileHash(resultPath) !== previous.result_sha256 || priorResult.status !== 'PASS' || priorResult.run_id !== a.run_id || priorResult.phase !== previous.phase || priorResult.package_sha256 !== a.package_sha256) fail('PREREQUISITE_RESULT');
  }
  const first = request.index > 1 ? readJson(path.join(ledgerRoot, '1.json')).started_ms : now;
  if (!Number.isSafeInteger(first) || now < first || now - first >= a.max_wall_seconds * 1000) fail('WALL_LIMIT');
}
function consume(request, a, ledgerRoot, pin, now = Date.now()) {
  validateRequest(request, a, pin, now);
  // An exclusive directory prevents competing runners. An abandoned lock is a hard stop, never automatically removed.
  fs.mkdirSync(ledgerRoot, { recursive: true });
  fs.mkdirSync(path.join(ledgerRoot, 'dispatch.lock'));
  const file = (n) => path.join(ledgerRoot, `${n}.json`);
  try {
    assertNext(request, a, ledgerRoot, pin, now);
    writeNew(file(request.index), { run_id: a.run_id, authority_sha256: pin, phase: request.phase, state: 'CONSUMED', started_ms: now, request_sha256: sha(JSON.stringify(request)) });
  } finally { fs.rmdirSync(path.join(ledgerRoot, 'dispatch.lock')); }
}
function complete(request, a, result) {
  if (!result || result.task !== 'A9-36' || result.run_id !== a.run_id || result.phase !== request.phase || result.package_sha256 !== a.package_sha256 || !['PASS', 'FAIL', 'UNKNOWN'].includes(result.status)) fail('RESULT_BINDING');
  const ledger = path.join(a.run_root, 'ledger');
  const file = path.join(ledger, `${request.index}.json`); const row = readJson(file);
  if (row.state !== 'CONSUMED' || row.run_id !== a.run_id || row.request_sha256 !== sha(JSON.stringify(request))) fail('COMPLETION_BINDING');
  const resultFile = path.join(a.run_root, 'evidence', request.phase, 'phase-result.json');
  writeNew(resultFile, result);
  // Original CONSUMED bytes retained in a distinct receipt, before atomic ledger replacement.
  writeNew(path.join(ledger, `${request.index}.consumed.json`), row);
  const next = { ...row, state: 'COMPLETED', status: result.status, result_sha256: fileHash(resultFile) };
  const temp = file + '.next'; writeNew(temp, next); fs.renameSync(temp, file);
  if (result.status !== 'PASS') writeNew(path.join(ledger, 'HALTED.json'), { phase: request.phase, status: result.status, result_sha256: next.result_sha256 });
}
module.exports = { PHASES, INPUTS, W42_SOURCE, W42_PACKAGE_SHA, W42_MANIFEST_SHA, W42_PERSISTENCE_SHA, M6_FIXTURE_FILES, M6_NOW, identityHash, sha, fileHash, readJson, writeNew, exact, within, validateAuthority, loadBound, createRequest, validateRequest, assertNext, consume, complete };

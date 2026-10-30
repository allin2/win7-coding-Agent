import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const denySet = require('../deny-set.cjs');

const H = (value) => crypto.createHash('sha256').update(value).digest('hex');
const RUN_ID = '3f1c2a52-6b0e-4c1e-9f5e-0d7b8a1c2e44';
const PREFIX = H(RUN_ID.toLowerCase().slice(0, 8));
const OTHER = H('another-run-prefix');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'a9-alpha3-deny-'));

function set(overrides = {}) {
  return {
    schema_version: 1,
    namespace: 'a9-win7-execution-run-prefix8',
    revision: 1,
    previous: null,
    match: { algorithm: 'sha256', input: 'lowercase-uuid-v4-prefix8-utf8' },
    denied_prefix_sha256: [],
    provenance: [],
    ...overrides,
  };
}
function bytes(value) { return Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function write(root, name, value) {
  const file = path.join(root, name);
  fs.writeFileSync(file, bytes(value));
  return { file, bytes: bytes(value), sha256: H(bytes(value)) };
}
function previous(value, file) {
  return { sha256: H(fs.readFileSync(file)), revision: value.revision, locator: path.basename(file) };
}
function expectCode(action, code) {
  assert.throws(action, (error) => new RegExp(`A9_ALPHA3_${code}`).test(String(error && error.message)));
}

test('deny set shape is closed and sorted lowercase SHA-256 only', () => {
  const root = tmp();
  const good = write(root, 'good.json', set({ denied_prefix_sha256: [OTHER, PREFIX].sort() }));
  assert.deepEqual(denySet.validateDenySet({ denySetBytes: good.bytes, denySetSha256: good.sha256, runId: '00000000-0000-4000-8000-000000000000' }).denied_prefix_sha256,
    [OTHER, PREFIX].sort());
  for (const [value, code] of [
    [set({ schema_version: 2 }), 'DENY_SET_SCHEMA_VERSION'],
    [set({ namespace: 'other' }), 'DENY_SET_NAMESPACE'],
    [set({ match: { algorithm: 'sha1', input: 'lowercase-uuid-v4-prefix8-utf8' } }), 'DENY_SET_ALGORITHM'],
    [set({ match: { algorithm: 'sha256', input: 'uuid' } }), 'DENY_SET_INPUT'],
    [set({ denied_prefix_sha256: ['f'.repeat(64), 'a'.repeat(64)] }), 'DENY_SET_ORDER_OR_DUPLICATE'],
    [set({ denied_prefix_sha256: ['A'.repeat(64)] }), 'DENY_SET_HASH'],
    [set({ denied_prefix_sha256: ['a'.repeat(64), 'a'.repeat(64)] }), 'DENY_SET_ORDER_OR_DUPLICATE'],
    [{ ...set(), status: 'APPROVED' }, 'DENY_SET_SCHEMA'],
    [set({ provenance: {} }), 'DENY_SET_PROVENANCE'],
  ]) {
    const item = write(root, `bad-${crypto.randomUUID()}.json`, value);
    expectCode(() => denySet.validateDenySet({ denySetBytes: item.bytes, runId: '00000000-0000-4000-8000-000000000000' }), code);
  }
});

test('missing, tampered and byte-size-mismatched files fail closed', () => {
  const root = tmp();
  expectCode(() => denySet.validateDenySet({ denySetPath: path.join(root, 'missing.json'), runId: RUN_ID }), 'DENY_SET_MISSING');
  const item = write(root, 'good.json', set());
  expectCode(() => denySet.validateDenySet({ denySetBytes: Buffer.concat([item.bytes, Buffer.from(' ')]), denySetSha256: item.sha256, runId: RUN_ID }), 'DENY_SET_FILE_SHA256_MISMATCH');
  expectCode(() => denySet.validateDenySet({ denySetBytes: Buffer.from('{'), runId: RUN_ID }), 'DENY_SET_JSON_INVALID');
});

test('ADR-0304 four counterexamples: missing anchor, tampered set, reduced set and hit are refused', () => {
  const root = tmp();
  const old = set({ revision: 1, denied_prefix_sha256: [OTHER] });
  const oldFile = write(root, 'old.json', old);
  const newValue = set({ revision: 2, previous: previous(old, oldFile.file), denied_prefix_sha256: [OTHER, PREFIX].sort() });
  const newFile = write(root, 'new.json', newValue);
  // Missing trusted anchor.
  expectCode(() => denySet.validateDenySet({ denySetBytes: newFile.bytes, denySetSha256: newFile.sha256, runId: '00000000-0000-4000-8000-000000000000' }), 'DENY_SET_TRUSTED_PREVIOUS_MISSING');
  // Tampered new file.
  expectCode(() => denySet.validateDenySet({ denySetBytes: Buffer.concat([newFile.bytes, Buffer.from(' ')]), denySetSha256: newFile.sha256, runId: '00000000-0000-4000-8000-000000000000' }), 'DENY_SET_FILE_SHA256_MISMATCH');
  // Reduced set.
  const reduced = write(root, 'reduced.json', set({ revision: 2, previous: previous(old, oldFile.file), denied_prefix_sha256: [] }));
  expectCode(() => denySet.validateDenySet({ denySetBytes: reduced.bytes, denySetSha256: reduced.sha256, runId: '00000000-0000-4000-8000-000000000000', trustedPreviousBytes: oldFile.bytes, trustedPreviousSha256: oldFile.sha256 }), 'DENY_SET_REDUCED');
  // Current run hit.
  expectCode(() => denySet.validateDenySet({ denySetBytes: newFile.bytes, denySetSha256: newFile.sha256, runId: RUN_ID, trustedPreviousBytes: oldFile.bytes, trustedPreviousSha256: oldFile.sha256 }), 'DENY_SET_RUN_PREFIX_HIT');
});

test('equal old and new sets are allowed; same prefix with a different UUID tail is refused', () => {
  const root = tmp();
  const oldValue = set({ revision: 1, denied_prefix_sha256: [OTHER] });
  const oldFile = write(root, 'old.json', oldValue);
  const equal = write(root, 'equal.json', set({ revision: 2, previous: previous(oldValue, oldFile.file), denied_prefix_sha256: [OTHER] }));
  const result = denySet.validateDenySet({ denySetBytes: equal.bytes, denySetSha256: equal.sha256,
    runId: '00000000-0000-4000-8000-000000000000', trustedPreviousBytes: oldFile.bytes, trustedPreviousSha256: oldFile.sha256 });
  assert.deepEqual(result.denied_prefix_sha256, [OTHER]);
  // The deny key is the first eight lowercase characters, so a different tail with the same prefix has the same hash.
  const hit = denySet.runPrefixHash('3f1c2a52-ffff-4fff-8fff-ffffffffffff');
  assert.equal(hit, PREFIX);
  const samePrefix = write(root, 'same-prefix.json', set({ revision: 2, previous: previous(oldValue, oldFile.file), denied_prefix_sha256: [OTHER, PREFIX].sort() }));
  expectCode(() => denySet.validateDenySet({ denySetBytes: samePrefix.bytes, denySetSha256: samePrefix.sha256,
    runId: '3f1c2a52-ffff-4fff-8fff-ffffffffffff', trustedPreviousBytes: oldFile.bytes, trustedPreviousSha256: oldFile.sha256 }), 'DENY_SET_RUN_PREFIX_HIT');
});

test('forged previous and rollback of the trusted old file are refused', () => {
  const root = tmp();
  const oldValue = set({ revision: 1, denied_prefix_sha256: [OTHER] });
  const oldFile = write(root, 'old.json', oldValue);
  const forged = write(root, 'forged.json', set({ revision: 2, previous: { sha256: H('forged'), revision: 1, locator: 'old.json' }, denied_prefix_sha256: [OTHER] }));
  expectCode(() => denySet.validateDenySet({ denySetBytes: forged.bytes, denySetSha256: forged.sha256,
    runId: '00000000-0000-4000-8000-000000000000', trustedPreviousBytes: oldFile.bytes, trustedPreviousSha256: oldFile.sha256 }), 'DENY_SET_PREVIOUS_FORGED');
  // A lower revision that chains to the newer trusted file must not roll back.
  const trusted = write(root, 'trusted.json', set({ revision: 2, previous: previous(oldValue, oldFile.file), denied_prefix_sha256: [OTHER] }));
  const rollback = write(root, 'rollback.json', set({ revision: 2, previous: { sha256: trusted.sha256, revision: 2, locator: 'trusted.json' }, denied_prefix_sha256: [OTHER] }));
  expectCode(() => denySet.validateDenySet({ denySetBytes: rollback.bytes, denySetSha256: rollback.sha256,
    runId: '00000000-0000-4000-8000-000000000000', trustedPreviousBytes: trusted.bytes, trustedPreviousSha256: trusted.sha256 }), 'DENY_SET_REVISION_ROLLBACK');
});

test('reservation uses exclusive creation; repeat and concurrent processes allow only one', async () => {
  const root = tmp();
  const ledger = path.join(root, 'ledger');
  const first = denySet.reserveConsumption({ runId: RUN_ID, denySetSha256: H('deny'), executionBindingSha256: H('binding'), ledgerDir: ledger, reservedAtUtc: '2026-10-30T00:00:00.000Z' });
  assert.equal(first.record.deny_set_sha256, H('deny'));
  assert.equal(first.record.execution_binding_sha256, H('binding'));
  assert.ok(fs.existsSync(first.path));
  expectCode(() => denySet.reserveConsumption({ runId: RUN_ID, denySetSha256: H('deny'), ledgerDir: ledger }), 'RUN_ALREADY_RESERVED');
  const secondLedger = path.join(root, 'ledger-race');
  const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), '../deny-set.cjs');
  const childCode = "const d=require(process.argv[1]);try{d.reserveConsumption({runId:process.argv[3],denySetSha256:process.argv[4],ledgerDir:process.argv[2]});process.stdout.write('OK');}catch(e){if(/RUN_ALREADY_RESERVED/.test(e.message))process.stdout.write('BUSY');else{process.stderr.write(e.message);process.exit(2);}}";
  const runChild = () => new Promise((resolve) => {
    const child = spawn(process.execPath, ['-e', childCode, tool, secondLedger, RUN_ID, H('deny')], { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
  const results = await Promise.all([runChild(), runChild()]);
  assert.deepEqual(results.map((item) => item.stdout).sort(), ['BUSY', 'OK']);
  assert.equal(results.every((item) => item.code === 0), true);
  assert.equal(results.every((item) => item.stderr === ''), true);
});

test('data changes do not alter the execution tool bytes', () => {
  const root = tmp();
  const a = write(root, 'a.json', set({ denied_prefix_sha256: [OTHER] }));
  const b = write(root, 'b.json', set({ revision: 2, previous: previous(set({ revision: 1 }), a.file), denied_prefix_sha256: [OTHER, PREFIX].sort() }));
  const tool = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../deny-set.cjs');
  const before = H(fs.readFileSync(tool));
  denySet.validateDenySet({ denySetBytes: b.bytes, denySetSha256: b.sha256, runId: '00000000-0000-4000-8000-000000000000', trustedPreviousBytes: a.bytes, trustedPreviousSha256: a.sha256 });
  assert.equal(H(fs.readFileSync(tool)), before);
});

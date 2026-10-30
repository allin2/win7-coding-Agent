import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const authority = require('../authority.cjs');
const denySet = require('../deny-set.cjs');

const H = (value) => crypto.createHash('sha256').update(value).digest('hex');
const RUN_ID = '3f1c2a52-6b0e-4c1e-9f5e-0d7b8a1c2e44';
const PREFIX = denySet.runPrefixHash(RUN_ID);
const OTHER = H('another-run-prefix');
const NOW = Date.parse('2026-10-30T12:00:00.000Z');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'a9-alpha3-authority-'));
const bytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const write = (root, name, value) => {
  const file = path.join(root, name);
  const content = bytes(value);
  fs.writeFileSync(file, content);
  return { file, bytes: content, sha256: H(content) };
};
const expectCode = (action, code) => assert.throws(action, (error) => new RegExp(`A9_ALPHA3_${code}`).test(String(error && error.message)));
const layout = () => ({
  schema_version: 1, channel_root: 'C:\\A9-DEV', run_root_template: 'C:\\A9-DEV\\run\\{run_prefix8}',
  run_key: 'lowercase-uuid-v4-prefix8', task_prefix_template: 'A9-DEV-{run_prefix8}-',
  package_relative_root: 'p', tools_relative_root: 't', evidence_relative_root: 'e',
  data_relative_root: 'd', workspace_relative_root: 'w',
});
const candidate = () => ({
  source_commit: H('source').slice(0, 40), package_sha256: H('package'), manifest_sha256: H('manifest'),
  kit_sha256: H('kit'), helper_sha256: H('helper'),
});
const registry = () => ({ commit: H('commit').slice(0, 40), sha256: H('registry') });
const target = () => ({ machine_name: 'TEST-ONLY-HOST', account_sid: 'S-1-5-21-1-2-3-1001' });
const binding = (evidenceClass = 'DEV_CHANNEL') => ({
  schema_version: 1, kind: 'WIN7_56_EXECUTION_BINDING', evidence_class: evidenceClass, run_id: RUN_ID,
  formal_input_lock_sha256: H('lock'), approval_registry: registry(), candidate: candidate(), target: target(),
});
const denyValue = (overrides = {}) => ({
  schema_version: 1, namespace: 'a9-win7-execution-run-prefix8', revision: 1, previous: null,
  match: { algorithm: 'sha256', input: 'lowercase-uuid-v4-prefix8-utf8' },
  denied_prefix_sha256: [], provenance: [], ...overrides,
});
const receipt = (payloadSha, overrides = {}) => ({
  schema_version: 1, status: 'OWNER_CONFIRMED_FINAL_SHA', signed: true, run_id: RUN_ID,
  owner_reply_verbatim: `批准本次正式执行载荷SHA-256 ${payloadSha}`,
  independent_pin: payloadSha, owner_receipt_utc: '2026-10-30T11:00:00.000Z',
  expires_at_utc: '2026-10-30T14:00:00.000Z', confirmation_utc: '2026-10-30T11:05:00.000Z', ...overrides,
});

const inputs = () => {
  const executionToolsManifestBytes=bytes({files:{test:'SYNTHETIC_ONLY'}});
  const runContextBytes=bytes({budget:{p1:{target_session_id:2}}});
  const phasePlanBytes=bytes({plan:'TEST_ONLY_FULL'});
  return {executionToolsManifestBytes,runContextBytes,phasePlanBytes,inputBindings:{
    execution_tools_manifest_sha256:H(executionToolsManifestBytes),run_context_sha256:H(runContextBytes),
    phase_plan_sha256:H(phasePlanBytes),target:{session_id:2}}};
};
const formal = options => authority.validateFormal({...inputs(),...options});
const development = options => authority.validateDevelopment({...inputs(),...options});
const reserve = options => authority.validateAndReserve({...inputs(),...options});

function formalFixture(root) {
  const bindingFile = write(root, 'execution-binding.json', binding('FORMAL_GATE_A_EXECUTION'));
  const denyFile = write(root, 'deny-set.json', denyValue());
  const payload = {
    schema_version: 1, kind: 'WIN7_56_GATE_A_PAYLOAD', run_id: RUN_ID, execution_layout: layout(),
    evidence_class: 'FORMAL_GATE_A_EXECUTION', formal_input_lock_sha256: H('lock'), approval_registry: registry(),
    candidate: candidate(), target: {...target(),session_id:2},
    execution_tools_manifest_sha256:inputs().inputBindings.execution_tools_manifest_sha256,
    run_context_sha256:inputs().inputBindings.run_context_sha256,phase_plan_sha256:inputs().inputBindings.phase_plan_sha256,
    execution_binding: { path: bindingFile.file, sha256: bindingFile.sha256 },
    deny_set: { path: denyFile.file, bytes: denyFile.bytes.length, sha256: denyFile.sha256, revision: 1,
      trusted_previous_sha256: null, initial_baseline_sha256: denyFile.sha256 },
    window: { starts_at_utc: '2026-10-30T11:00:00.000Z', expires_at_utc: '2026-10-30T14:00:00.000Z' },
    budget: { max_requests: 16, max_wall_seconds: 21600, max_real_model_requests: 0 },
  };
  const payloadFile = write(root, 'gate-a-payload.json', payload);
  const receiptFile = write(root, 'receipt.json', receipt(payloadFile.sha256));
  return { bindingFile, denyFile, payload, payloadFile, receiptFile };
}

test('development entry checks DEV_CHANNEL and run id without reading receipt or deny set', () => {
  const root = tmp();
  const bindingFile = write(root, 'binding.json', binding());
  const result = development({ executionBindingBytes: bindingFile.bytes, runId: RUN_ID });
  assert.equal(result.mode, 'DEV_CHANNEL');
  assert.equal(result.evidence_class, 'DEV_CHANNEL');
  // No receipt or deny-set path is required or read.
  assert.equal(fs.existsSync(path.join(root, 'receipt.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'deny-set.json')), false);
  expectCode(() => development({ executionBindingBytes: write(root, 'formal.json', binding('FORMAL_GATE_A_EXECUTION')).bytes, runId: RUN_ID }), 'DEV_EXECUTION_BINDING_CLASS');
  expectCode(() => development({ executionBindingBytes: bindingFile.bytes, runId: '00000000-0000-4000-8000-000000000000' }), 'DEV_RUN_ID_MISMATCH');
});

test('formal entry accepts a complete payload, receipt, pin, window, binding and deny set', () => {
  const root = tmp();
  const f = formalFixture(root);
  const result = formal({
    payloadPath: f.payloadFile.file, payloadSha256: f.payloadFile.sha256, receiptPath: f.receiptFile.file,
    executionBindingPath: f.bindingFile.file, denySetPath: f.denyFile.file, now: NOW,
  });
  assert.equal(result.mode, 'FORMAL_GATE_A_EXECUTION');
  assert.equal(result.payload_sha256, f.payloadFile.sha256);
  assert.equal(result.deny_set.revision, 1);
});

test('formal entry refuses missing receipt, mismatched pin, expired window and wrong evidence class', () => {
  const root = tmp();
  const f = formalFixture(root);
  expectCode(() => formal({ payloadPath: f.payloadFile.file, payloadSha256: f.payloadFile.sha256,
    receiptPath: path.join(root, 'missing-receipt.json'), executionBindingPath: f.bindingFile.file, denySetPath: f.denyFile.file, now: NOW }), 'GATE_A_RECEIPT_MISSING');
  const wrongPin = write(root, 'wrong-pin.json', receipt(f.payloadFile.sha256, { independent_pin: H('other') }));
  expectCode(() => formal({ payloadPath: f.payloadFile.file, payloadSha256: f.payloadFile.sha256,
    receiptPath: wrongPin.file, executionBindingPath: f.bindingFile.file, denySetPath: f.denyFile.file, now: NOW }), 'GATE_A_RECEIPT_PIN_MISMATCH');
  expectCode(() => formal({ payloadPath: f.payloadFile.file, payloadSha256: f.payloadFile.sha256,
    receiptPath: f.receiptFile.file, executionBindingPath: f.bindingFile.file, denySetPath: f.denyFile.file, now: Date.parse('2026-10-30T14:00:00.000Z') }), 'GATE_A_OUTSIDE_WINDOW');
  const devBinding = write(root, 'dev-binding.json', binding('DEV_CHANNEL'));
  const payload = { ...f.payload, execution_binding: { path: devBinding.file, sha256: devBinding.sha256 } };
  const payloadFile = write(root, 'dev-payload.json', payload);
  const receiptFile = write(root, 'dev-receipt.json', receipt(payloadFile.sha256));
  expectCode(() => formal({ payloadPath: payloadFile.file, payloadSha256: payloadFile.sha256,
    receiptPath: receiptFile.file, executionBindingPath: devBinding.file, denySetPath: f.denyFile.file, now: NOW }), 'FORMAL_EXECUTION_BINDING_CLASS');
});

test('formal entry refuses a receipt text that does not contain the payload SHA', () => {
  const root = tmp();
  const f = formalFixture(root);
  const noSha = write(root, 'no-sha.json', receipt(f.payloadFile.sha256, {
    owner_reply_verbatim: '批准本次正式执行，但未写载荷摘要；此文本仅用于测试长度边界，不构成真实负责人回执。',
  }));
  expectCode(() => formal({ payloadPath: f.payloadFile.file, payloadSha256: f.payloadFile.sha256,
    receiptPath: noSha.file, executionBindingPath: f.bindingFile.file, denySetPath: f.denyFile.file, now: NOW }), 'GATE_A_RECEIPT_MISSING_PAYLOAD_SHA');
});

test('formal entry refuses missing, tampered, reduced and hit deny sets; equal set is accepted', () => {
  const root = tmp();
  const f = formalFixture(root);
  expectCode(() => formal({ payloadPath: f.payloadFile.file, payloadSha256: f.payloadFile.sha256,
    receiptPath: f.receiptFile.file, executionBindingPath: f.bindingFile.file, denySetPath: path.join(root, 'missing.json'), now: NOW }), 'DENY_SET_MISSING');
  const tampered = write(root, 'tampered.json', denyValue());
  const tamperedBytes = Buffer.concat([tampered.bytes, Buffer.from(' ')]);
  fs.writeFileSync(tampered.file, tamperedBytes);
  const tamperedPayload = { ...f.payload, deny_set: { ...f.payload.deny_set, path: tampered.file, bytes: tamperedBytes.length } };
  const tamperedPayloadFile = write(root, 'tampered-payload.json', tamperedPayload);
  const tamperedReceipt = write(root, 'tampered-receipt.json', receipt(tamperedPayloadFile.sha256));
  expectCode(() => formal({ payloadPath: tamperedPayloadFile.file, payloadSha256: tamperedPayloadFile.sha256,
    receiptPath: tamperedReceipt.file, executionBindingPath: f.bindingFile.file, denySetPath: tampered.file, now: NOW }), 'GATE_A_DENY_SET_SHA256_MISMATCH');
  const oldValue = denyValue({ denied_prefix_sha256: [OTHER] });
  const oldFile = write(root, 'old.json', oldValue);
  const reduced = write(root, 'reduced.json', denyValue({ revision: 2, previous: { sha256: oldFile.sha256, revision: 1, locator: 'old.json' }, denied_prefix_sha256: [] }));
  const payload = { ...f.payload, deny_set: { ...f.payload.deny_set, path: reduced.file, bytes: reduced.bytes.length, sha256: reduced.sha256, revision: 2, trusted_previous_sha256: oldFile.sha256 } };
  const payloadFile = write(root, 'reduced-payload.json', payload);
  const receiptFile = write(root, 'reduced-receipt.json', receipt(payloadFile.sha256));
  expectCode(() => formal({ payloadPath: payloadFile.file, payloadSha256: payloadFile.sha256,
    receiptPath: receiptFile.file, executionBindingPath: f.bindingFile.file, denySetPath: reduced.file,
    trustedPreviousBytes: oldFile.bytes, trustedPreviousSha256: oldFile.sha256, now: NOW }), 'DENY_SET_REDUCED');
  const equal = write(root, 'equal.json', denyValue({ revision: 2, previous: { sha256: oldFile.sha256, revision: 1, locator: 'old.json' }, denied_prefix_sha256: [OTHER] }));
  const equalPayload = { ...f.payload, deny_set: { ...f.payload.deny_set, path: equal.file, bytes: equal.bytes.length, sha256: equal.sha256, revision: 2, trusted_previous_sha256: oldFile.sha256 } };
  const equalPayloadFile = write(root, 'equal-payload.json', equalPayload);
  const equalReceipt = write(root, 'equal-receipt.json', receipt(equalPayloadFile.sha256));
  assert.equal(formal({ payloadPath: equalPayloadFile.file, payloadSha256: equalPayloadFile.sha256,
    receiptPath: equalReceipt.file, executionBindingPath: f.bindingFile.file, denySetPath: equal.file,
    trustedPreviousBytes: oldFile.bytes, trustedPreviousSha256: oldFile.sha256, now: NOW }).deny_set.revision, 2);
});

test('development and formal entries reserve the same run prefix only once', () => {
  const root = tmp();
  const bindingFile = write(root, 'binding.json', binding());
  const first = reserve({ mode: 'DEV_CHANNEL', executionBindingBytes: bindingFile.bytes, runId: RUN_ID,
    ledgerDir: path.join(root, 'ledger') });
  assert.ok(first.reservation.path);
  expectCode(() => reserve({ mode: 'DEV_CHANNEL', executionBindingBytes: bindingFile.bytes, runId: RUN_ID,
    ledgerDir: path.join(root, 'ledger') }), 'RUN_ALREADY_RESERVED');
});

test('run data and deny-set changes do not alter authority tool bytes', () => {
  const root = tmp();
  const tool = path.join(path.dirname(fileURLToPath(import.meta.url)), '../authority.cjs');
  const before = H(fs.readFileSync(tool));
  const bindingFile = write(root, 'binding.json', binding());
  development({ executionBindingBytes: bindingFile.bytes, runId: RUN_ID });
  write(root, 'deny.json', denyValue({ denied_prefix_sha256: [OTHER] }));
  assert.equal(H(fs.readFileSync(tool)), before);
});

test('input hashes bind raw bytes and exact Session in both local entries', () => {
  const f=formalFixture(tmp()), common={payloadBytes:f.payloadFile.bytes,receiptBytes:f.receiptFile.bytes,
    executionBindingBytes:f.bindingFile.bytes,denySetBytes:f.denyFile.bytes,now:NOW};
  for(const key of ['executionToolsManifestBytes','runContextBytes','phasePlanBytes']) {
    expectCode(()=>formal({...common,[key]:Buffer.concat([inputs()[key],Buffer.from(' ')])}),'EXECUTION_INPUT_BYTES_MISMATCH');
    expectCode(()=>development({executionBindingBytes:bytes(binding()),runId:RUN_ID,[key]:Buffer.concat([inputs()[key],Buffer.from(' ')])}),'EXECUTION_INPUT_BYTES_MISMATCH');
  }
  expectCode(()=>development({executionBindingBytes:bytes(binding()),runId:RUN_ID,
    inputBindings:{...inputs().inputBindings,target:{session_id:3}}}),'EXECUTION_INPUT_SESSION_MISMATCH');
  for(const field of ['execution_tools_manifest_sha256','run_context_sha256','phase_plan_sha256']) {
    const payload={...f.payload};delete payload[field];
    expectCode(()=>authority.validatePayload(payload),'GATE_A_PAYLOAD_SCHEMA');
  }
  expectCode(()=>authority.validatePayload({...f.payload,target:{...f.payload.target,session_id:0}}),'GATE_A_TARGET_SESSION');
  const rawContext=bytes({budget:{p1:{target_session_id:3}}});
  const payloadBytes=bytes({...f.payload,run_context_sha256:H(rawContext)});
  expectCode(()=>formal({...common,payloadBytes,receiptBytes:bytes(receipt(H(payloadBytes))),runContextBytes:rawContext}),'EXECUTION_INPUT_SESSION_MISMATCH');
});

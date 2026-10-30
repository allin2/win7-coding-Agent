'use strict';

// WIN7-56 local authority entry. Development runs verify the execution binding and run id only;
// formal gate-A runs additionally verify the owner receipt, independent pin, window, bound
// execution-binding bytes and deny set. The target side never uses this module.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const denySet = require('./deny-set.cjs');

const EXECUTION_KIND = 'WIN7_56_EXECUTION_BINDING';
const EVIDENCE_CLASSES = Object.freeze({
  DEV_CHANNEL: 'DEV_CHANNEL',
  FORMAL_GATE_A_EXECUTION: 'FORMAL_GATE_A_EXECUTION',
});
const PAYLOAD_FIELDS = Object.freeze([
  'schema_version', 'kind', 'run_id', 'execution_layout', 'evidence_class',
  'formal_input_lock_sha256', 'approval_registry', 'candidate', 'target',
  'execution_binding', 'deny_set', 'window', 'budget',
]);
const RECEIPT_FIELDS = Object.freeze([
  'schema_version', 'status', 'signed', 'run_id', 'owner_reply_verbatim', 'independent_pin',
  'owner_receipt_utc', 'expires_at_utc', 'confirmation_utc',
]);
const EXECUTION_BINDING_FIELDS = Object.freeze([
  'schema_version', 'kind', 'evidence_class', 'run_id', 'formal_input_lock_sha256',
  'approval_registry', 'candidate', 'target',
]);
const DENY_SET_BINDING_FIELDS = Object.freeze([
  'path', 'bytes', 'sha256', 'revision', 'trusted_previous_sha256', 'initial_baseline_sha256',
]);
const CANDIDATE_FIELDS = Object.freeze(['source_commit', 'package_sha256', 'manifest_sha256', 'kit_sha256', 'helper_sha256']);
const TARGET_FIELDS = Object.freeze(['machine_name', 'account_sid']);
const WINDOW_FIELDS = Object.freeze(['starts_at_utc', 'expires_at_utc']);
const BUDGET_FIELDS = Object.freeze(['max_requests', 'max_wall_seconds', 'max_real_model_requests']);
const REGISTRY_FIELDS = Object.freeze(['commit', 'sha256']);
const LAYOUT_FIELDS = Object.freeze([
  'schema_version', 'channel_root', 'run_root_template', 'run_key', 'task_prefix_template',
  'package_relative_root', 'tools_relative_root', 'evidence_relative_root', 'data_relative_root',
  'workspace_relative_root',
]);
const HEX64 = /^[a-f0-9]{64}$/;
const HEX40 = /^[a-f0-9]{40}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function reject(code, detail) {
  const suffix = detail === undefined ? '' : `:${detail}`;
  throw new Error(`A9_ALPHA3_${code}${suffix}`);
}

function sha256(bytes) {
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

function plain(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function exactKeys(value, fields, code) {
  if (!plain(value)) reject(code);
  const actual = Object.keys(value).sort();
  const expected = [...fields].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) reject(code);
}

function parseJson(bytes, code) {
  try {
    return JSON.parse(Buffer.isBuffer(bytes) ? bytes.toString('utf8') : String(bytes));
  } catch (_error) {
    reject(code);
  }
}

function readBytes(options, bytesKey, pathKey, label) {
  if (Buffer.isBuffer(options[bytesKey])) return options[bytesKey];
  if (typeof options[pathKey] !== 'string' || !options[pathKey]) reject(`${label}_REQUIRED`);
  try {
    return fs.readFileSync(options[pathKey]);
  } catch (_error) {
    reject(`${label}_MISSING`);
  }
}

function assertBoundPath(actualPath, expectedPath, code) {
  if (actualPath === undefined) return;
  if (typeof actualPath !== 'string' || !actualPath || typeof expectedPath !== 'string' || !expectedPath) reject(code);
  if (path.resolve(actualPath) !== path.resolve(expectedPath)) reject(code);
}

function exactHash(value, code) {
  if (typeof value !== 'string' || !HEX64.test(value)) reject(code);
}

function exactSource(value, code) {
  if (typeof value !== 'string' || !HEX40.test(value)) reject(code);
}

function isoUtc(value, code) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(value)) reject(code);
  const millis = Date.parse(value);
  if (!Number.isFinite(millis)) reject(code);
  return millis;
}

function validateRunId(value) {
  if (typeof value !== 'string' || !UUID.test(value)) reject('RUN_ID_INVALID');
  return value.toLowerCase();
}

function validateEvidenceClass(value) {
  if (!Object.keys(EVIDENCE_CLASSES).some((key) => EVIDENCE_CLASSES[key] === value)) reject('EVIDENCE_CLASS_INVALID');
  return value;
}

function validateExecutionBinding(value) {
  exactKeys(value, EXECUTION_BINDING_FIELDS, 'EXECUTION_BINDING_SCHEMA');
  if (value.schema_version !== 1 || value.kind !== EXECUTION_KIND) reject('EXECUTION_BINDING_KIND');
  validateEvidenceClass(value.evidence_class);
  validateRunId(value.run_id);
  exactHash(value.formal_input_lock_sha256, 'EXECUTION_BINDING_LOCK');
  exactKeys(value.approval_registry, REGISTRY_FIELDS, 'EXECUTION_BINDING_REGISTRY_SCHEMA');
  if (!HEX40.test(value.approval_registry.commit || '')) reject('EXECUTION_BINDING_REGISTRY_COMMIT');
  exactHash(value.approval_registry.sha256, 'EXECUTION_BINDING_REGISTRY_SHA256');
  exactKeys(value.candidate, CANDIDATE_FIELDS, 'EXECUTION_BINDING_CANDIDATE_SCHEMA');
  exactSource(value.candidate.source_commit, 'EXECUTION_BINDING_SOURCE');
  for (const key of ['package_sha256', 'manifest_sha256', 'kit_sha256', 'helper_sha256']) exactHash(value.candidate[key], 'EXECUTION_BINDING_CANDIDATE_SHA256');
  exactKeys(value.target, TARGET_FIELDS, 'EXECUTION_BINDING_TARGET_SCHEMA');
  if (typeof value.target.machine_name !== 'string' || !value.target.machine_name || /[\r\n]/.test(value.target.machine_name)) reject('EXECUTION_BINDING_MACHINE');
  if (typeof value.target.account_sid !== 'string' || !/^S-1-5-21-[0-9-]+$/.test(value.target.account_sid)) reject('EXECUTION_BINDING_SID');
  return value;
}

function validateLayout(value) {
  exactKeys(value, LAYOUT_FIELDS, 'EXECUTION_LAYOUT_SCHEMA');
  if (value.schema_version !== 1) reject('EXECUTION_LAYOUT_VERSION');
  if (value.channel_root !== 'C:\\A9-DEV') reject('EXECUTION_LAYOUT_CHANNEL_ROOT');
  if (value.run_root_template !== 'C:\\A9-DEV\\run\\{run_prefix8}') reject('EXECUTION_LAYOUT_RUN_TEMPLATE');
  if (value.run_key !== 'lowercase-uuid-v4-prefix8') reject('EXECUTION_LAYOUT_RUN_KEY');
  if (value.task_prefix_template !== 'A9-DEV-{run_prefix8}-') reject('EXECUTION_LAYOUT_TASK_PREFIX');
  for (const key of ['package_relative_root', 'tools_relative_root', 'evidence_relative_root', 'data_relative_root', 'workspace_relative_root']) {
    if (typeof value[key] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,31}$/.test(value[key])) reject('EXECUTION_LAYOUT_RELATIVE_ROOT');
  }
  return value;
}

function validateCandidate(value) {
  exactKeys(value, CANDIDATE_FIELDS, 'GATE_A_CANDIDATE_SCHEMA');
  exactSource(value.source_commit, 'GATE_A_SOURCE');
  for (const key of ['package_sha256', 'manifest_sha256', 'kit_sha256', 'helper_sha256']) exactHash(value[key], 'GATE_A_CANDIDATE_SHA256');
  return value;
}

function validatePayload(value) {
  exactKeys(value, PAYLOAD_FIELDS, 'GATE_A_PAYLOAD_SCHEMA');
  if (value.schema_version !== 1) reject('GATE_A_PAYLOAD_VERSION');
  if (value.kind !== 'WIN7_56_GATE_A_PAYLOAD') reject('GATE_A_PAYLOAD_KIND');
  validateRunId(value.run_id);
  validateEvidenceClass(value.evidence_class);
  if (value.evidence_class !== EVIDENCE_CLASSES.FORMAL_GATE_A_EXECUTION) reject('GATE_A_EVIDENCE_CLASS');
  validateLayout(value.execution_layout);
  exactHash(value.formal_input_lock_sha256, 'GATE_A_LOCK');
  exactKeys(value.approval_registry, REGISTRY_FIELDS, 'GATE_A_REGISTRY_SCHEMA');
  if (!HEX40.test(value.approval_registry.commit || '')) reject('GATE_A_REGISTRY_COMMIT');
  exactHash(value.approval_registry.sha256, 'GATE_A_REGISTRY_SHA256');
  validateCandidate(value.candidate);
  exactKeys(value.target, TARGET_FIELDS, 'GATE_A_TARGET_SCHEMA');
  if (typeof value.target.machine_name !== 'string' || !value.target.machine_name) reject('GATE_A_TARGET_MACHINE');
  if (typeof value.target.account_sid !== 'string' || !/^S-1-5-21-[0-9-]+$/.test(value.target.account_sid)) reject('GATE_A_TARGET_SID');
  exactKeys(value.execution_binding, ['path', 'sha256'], 'GATE_A_EXECUTION_BINDING_SCHEMA');
  if (typeof value.execution_binding.path !== 'string' || !value.execution_binding.path || /[\r\n]/.test(value.execution_binding.path)) reject('GATE_A_EXECUTION_BINDING_PATH');
  exactHash(value.execution_binding.sha256, 'GATE_A_EXECUTION_BINDING_SHA256');
  exactKeys(value.deny_set, DENY_SET_BINDING_FIELDS, 'GATE_A_DENY_SET_SCHEMA');
  if (typeof value.deny_set.path !== 'string' || !value.deny_set.path || /[\r\n]/.test(value.deny_set.path)) reject('GATE_A_DENY_SET_PATH');
  if (!Number.isSafeInteger(value.deny_set.bytes) || value.deny_set.bytes < 1) reject('GATE_A_DENY_SET_BYTES');
  exactHash(value.deny_set.sha256, 'GATE_A_DENY_SET_SHA256');
  if (!Number.isSafeInteger(value.deny_set.revision) || value.deny_set.revision < 1) reject('GATE_A_DENY_SET_REVISION');
  if (value.deny_set.trusted_previous_sha256 !== null) exactHash(value.deny_set.trusted_previous_sha256, 'GATE_A_DENY_SET_TRUSTED_PREVIOUS');
  if (value.deny_set.initial_baseline_sha256 !== null) exactHash(value.deny_set.initial_baseline_sha256, 'GATE_A_DENY_SET_INITIAL_BASELINE');
  exactKeys(value.window, WINDOW_FIELDS, 'GATE_A_WINDOW_SCHEMA');
  const starts = isoUtc(value.window.starts_at_utc, 'GATE_A_WINDOW_START');
  const expires = isoUtc(value.window.expires_at_utc, 'GATE_A_WINDOW_EXPIRES');
  if (!(expires > starts)) reject('GATE_A_WINDOW_ORDER');
  exactKeys(value.budget, BUDGET_FIELDS, 'GATE_A_BUDGET_SCHEMA');
  for (const key of BUDGET_FIELDS) if (!Number.isSafeInteger(value.budget[key]) || value.budget[key] < 0) reject('GATE_A_BUDGET_VALUE');
  if (value.budget.max_requests < 1 || value.budget.max_wall_seconds < 1) reject('GATE_A_BUDGET_VALUE');
  return value;
}

function validateReceipt(value) {
  exactKeys(value, RECEIPT_FIELDS, 'GATE_A_RECEIPT_SCHEMA');
  if (value.schema_version !== 1) reject('GATE_A_RECEIPT_VERSION');
  if (value.status !== 'OWNER_CONFIRMED_FINAL_SHA' || value.signed !== true) reject('GATE_A_RECEIPT_STATUS');
  validateRunId(value.run_id);
  exactHash(value.independent_pin, 'GATE_A_RECEIPT_PIN');
  if (typeof value.owner_reply_verbatim !== 'string' || Buffer.byteLength(value.owner_reply_verbatim.trim(), 'utf8') < 64) reject('GATE_A_RECEIPT_TEXT');
  if (!/批准|同意/.test(value.owner_reply_verbatim) || /不同意|不批准|拒绝|暂不|\b(?:not|refuse|reject|deny)\b/i.test(value.owner_reply_verbatim)) reject('GATE_A_RECEIPT_NOT_APPROVAL');
  const received = isoUtc(value.owner_receipt_utc, 'GATE_A_RECEIPT_RECEIVED');
  const expires = isoUtc(value.expires_at_utc, 'GATE_A_RECEIPT_EXPIRES');
  const confirmed = isoUtc(value.confirmation_utc, 'GATE_A_RECEIPT_CONFIRMATION');
  if (!(expires > received) || confirmed < received) reject('GATE_A_RECEIPT_WINDOW');
  return { value, received, expires, confirmed };
}

function validateDevelopment(options) {
  const bindingBytes = readBytes(options, 'executionBindingBytes', 'executionBindingPath', 'EXECUTION_BINDING');
  const binding = validateExecutionBinding(parseJson(bindingBytes, 'EXECUTION_BINDING_JSON_INVALID'));
  if (binding.evidence_class !== EVIDENCE_CLASSES.DEV_CHANNEL) reject('DEV_EXECUTION_BINDING_CLASS');
  const runId = validateRunId(options.runId);
  if (binding.run_id !== runId) reject('DEV_RUN_ID_MISMATCH');
  return {
    mode: 'DEV_CHANNEL',
    evidence_class: EVIDENCE_CLASSES.DEV_CHANNEL,
    run_id: runId,
    execution_binding_sha256: sha256(bindingBytes),
    execution_binding: binding,
  };
}

function validateFormal(options) {
  const payloadBytes = readBytes(options, 'payloadBytes', 'payloadPath', 'GATE_A_PAYLOAD');
  if (options.payloadSha256 !== undefined) {
    exactHash(options.payloadSha256, 'GATE_A_PAYLOAD_PIN');
    if (sha256(payloadBytes) !== options.payloadSha256) reject('GATE_A_PAYLOAD_SHA256_MISMATCH');
  }
  const payload = validatePayload(parseJson(payloadBytes, 'GATE_A_PAYLOAD_JSON_INVALID'));
  const payloadSha256 = sha256(payloadBytes);

  const receiptBytes = readBytes(options, 'receiptBytes', 'receiptPath', 'GATE_A_RECEIPT');
  const receipt = validateReceipt(parseJson(receiptBytes, 'GATE_A_RECEIPT_JSON_INVALID'));
  if (receipt.value.run_id !== payload.run_id) reject('GATE_A_RECEIPT_RUN_MISMATCH');
  if (receipt.value.independent_pin !== payloadSha256) reject('GATE_A_RECEIPT_PIN_MISMATCH');
  const pinText = `(?:^|[^a-fA-F0-9])${payloadSha256}(?:$|[^a-fA-F0-9])`;
  if (!new RegExp(pinText).test(receipt.value.owner_reply_verbatim)) reject('GATE_A_RECEIPT_MISSING_PAYLOAD_SHA');

  const now = options.now === undefined ? Date.now() : options.now;
  if (!Number.isFinite(now)) reject('GATE_A_NOW_INVALID');
  const windowStart = Date.parse(payload.window.starts_at_utc);
  const windowEnd = Date.parse(payload.window.expires_at_utc);
  if (now < windowStart || now >= windowEnd) reject('GATE_A_OUTSIDE_WINDOW');
  if (receipt.expires !== windowEnd) reject('GATE_A_RECEIPT_WINDOW_MISMATCH');
  if (receipt.confirmed > now) reject('GATE_A_CONFIRMATION_FUTURE');
  if (receipt.received > receipt.confirmed) reject('GATE_A_CONFIRMATION_BEFORE_RECEIPT');

  const bindingBytes = readBytes(options, 'executionBindingBytes', 'executionBindingPath', 'EXECUTION_BINDING');
  assertBoundPath(options.executionBindingPath, payload.execution_binding.path, 'GATE_A_EXECUTION_BINDING_PATH_MISMATCH');
  if (sha256(bindingBytes) !== payload.execution_binding.sha256) reject('GATE_A_EXECUTION_BINDING_SHA256_MISMATCH');
  const binding = validateExecutionBinding(parseJson(bindingBytes, 'EXECUTION_BINDING_JSON_INVALID'));
  if (binding.evidence_class !== EVIDENCE_CLASSES.FORMAL_GATE_A_EXECUTION) reject('FORMAL_EXECUTION_BINDING_CLASS');
  if (binding.run_id !== payload.run_id) reject('FORMAL_RUN_ID_MISMATCH');
  if (binding.formal_input_lock_sha256 !== payload.formal_input_lock_sha256
    || JSON.stringify(binding.approval_registry) !== JSON.stringify(payload.approval_registry)
    || JSON.stringify(binding.candidate) !== JSON.stringify(payload.candidate)
    || JSON.stringify(binding.target) !== JSON.stringify(payload.target)) reject('FORMAL_EXECUTION_BINDING_FIELDS');

  const denySetBytes = readBytes(options, 'denySetBytes', 'denySetPath', 'DENY_SET');
  assertBoundPath(options.denySetPath, payload.deny_set.path, 'GATE_A_DENY_SET_PATH_MISMATCH');
  if (denySetBytes.length !== payload.deny_set.bytes) reject('GATE_A_DENY_SET_BYTES_MISMATCH');
  if (sha256(denySetBytes) !== payload.deny_set.sha256) reject('GATE_A_DENY_SET_SHA256_MISMATCH');
  const deny = denySet.validateDenySet({
    denySetBytes,
    denySetSha256: payload.deny_set.sha256,
    runId: payload.run_id,
    trustedPreviousBytes: options.trustedPreviousBytes,
    trustedPreviousPath: options.trustedPreviousPath,
    trustedPreviousSha256: options.trustedPreviousSha256,
  });
  if (deny.revision !== payload.deny_set.revision) reject('GATE_A_DENY_SET_REVISION_MISMATCH');
  if (deny.sha256 !== payload.deny_set.sha256) reject('GATE_A_DENY_SET_SHA256_MISMATCH');
  if (deny.revision > 1 && deny.sha256 === payload.deny_set.trusted_previous_sha256) reject('GATE_A_DENY_SET_ROLLBACK');
  if (deny.revision === 1 && payload.deny_set.trusted_previous_sha256 !== null) reject('GATE_A_DENY_SET_INITIAL_ANCHOR');
  if (deny.revision > 1 && !payload.deny_set.trusted_previous_sha256) reject('GATE_A_DENY_SET_ANCHOR_REQUIRED');
  if (deny.revision > 1 && payload.deny_set.trusted_previous_sha256 !== options.trustedPreviousSha256) reject('GATE_A_DENY_SET_TRUSTED_PREVIOUS_MISMATCH');
  if (payload.deny_set.initial_baseline_sha256 !== null && !HEX64.test(payload.deny_set.initial_baseline_sha256)) reject('GATE_A_DENY_SET_INITIAL_BASELINE');

  return {
    mode: 'FORMAL_GATE_A_EXECUTION',
    evidence_class: EVIDENCE_CLASSES.FORMAL_GATE_A_EXECUTION,
    run_id: payload.run_id,
    payload_sha256: payloadSha256,
    receipt_sha256: sha256(receiptBytes),
    execution_binding_sha256: sha256(bindingBytes),
    deny_set: deny,
  };
}

function validateAndReserve(options) {
  const settings = options || {};
  if (settings.mode !== EVIDENCE_CLASSES.DEV_CHANNEL && settings.mode !== EVIDENCE_CLASSES.FORMAL_GATE_A_EXECUTION) {
    reject('EVIDENCE_MODE_INVALID');
  }
  const result = settings.mode === EVIDENCE_CLASSES.DEV_CHANNEL ? validateDevelopment(settings) : validateFormal(settings);
  const reservation = denySet.reserveConsumption({
    runId: result.run_id,
    denySetSha256: settings.mode === EVIDENCE_CLASSES.DEV_CHANNEL ? null : result.deny_set.sha256,
    executionBindingSha256: result.execution_binding_sha256,
    ledgerDir: settings.ledgerDir,
    reservedAtUtc: settings.reservedAtUtc,
  });
  return { ...result, reservation };
}

module.exports = {
  EXECUTION_KIND,
  EVIDENCE_CLASSES,
  PAYLOAD_FIELDS,
  RECEIPT_FIELDS,
  sha256,
  validateExecutionBinding,
  validateLayout,
  validatePayload,
  validateReceipt,
  validateDevelopment,
  validateFormal,
  validateAndReserve,
};

'use strict';

// Candidate-external deny-set validation for WIN7-56. The execution tools are data-independent:
// adding or revising denied run prefixes changes only the bound JSON, never this file's bytes.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SCHEMA_VERSION = 1;
const NAMESPACE = 'a9-win7-execution-run-prefix8';
const ALGORITHM = 'sha256';
const INPUT = 'lowercase-uuid-v4-prefix8-utf8';
const HEX64 = /^[a-f0-9]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DENY_SET_FIELDS = Object.freeze(['schema_version', 'namespace', 'revision', 'previous', 'match', 'denied_prefix_sha256', 'provenance']);
const PREVIOUS_FIELDS = Object.freeze(['sha256', 'revision', 'locator']);

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

function runPrefix(runId) {
  if (typeof runId !== 'string' || !UUID.test(runId)) reject('RUN_ID_INVALID');
  return runId.toLowerCase().slice(0, 8);
}

function runPrefixHash(runId) {
  return sha256(Buffer.from(runPrefix(runId), 'utf8'));
}

function validatePrevious(previous) {
  if (previous === null) return null;
  exactKeys(previous, PREVIOUS_FIELDS, 'DENY_SET_PREVIOUS_SCHEMA');
  if (!HEX64.test(previous.sha256 || '')) reject('DENY_SET_PREVIOUS_SHA256');
  if (!Number.isSafeInteger(previous.revision) || previous.revision < 1) reject('DENY_SET_PREVIOUS_REVISION');
  if (typeof previous.locator !== 'string' || !previous.locator || previous.locator.length > 512 || /[\r\n]/.test(previous.locator)) {
    reject('DENY_SET_PREVIOUS_LOCATOR');
  }
  return previous;
}

function validateShape(value) {
  exactKeys(value, DENY_SET_FIELDS, 'DENY_SET_SCHEMA');
  if (value.schema_version !== SCHEMA_VERSION) reject('DENY_SET_SCHEMA_VERSION');
  if (value.namespace !== NAMESPACE) reject('DENY_SET_NAMESPACE');
  if (!Number.isSafeInteger(value.revision) || value.revision < 1) reject('DENY_SET_REVISION');
  exactKeys(value.match, ['algorithm', 'input'], 'DENY_SET_MATCH_SCHEMA');
  if (value.match.algorithm !== ALGORITHM) reject('DENY_SET_ALGORITHM');
  if (value.match.input !== INPUT) reject('DENY_SET_INPUT');
  if (!Array.isArray(value.denied_prefix_sha256)) reject('DENY_SET_ARRAY');
  let previous = null;
  for (const item of value.denied_prefix_sha256) {
    if (typeof item !== 'string' || !HEX64.test(item)) reject('DENY_SET_HASH');
    if (previous !== null && previous >= item) reject('DENY_SET_ORDER_OR_DUPLICATE');
    previous = item;
  }
  if (!Array.isArray(value.provenance)) reject('DENY_SET_PROVENANCE');
  validatePrevious(value.previous);
  return value;
}

function validateTrustedPrevious(value) {
  // The trusted anchor is a complete deny-set file supplied by the caller, not the new file's
  // self-declared previous field. Its structure is validated before its entries are used.
  return validateShape(value);
}

function validateDenySet(options) {
  const settings = options || {};
  const bytes = readBytes(settings, 'denySetBytes', 'denySetPath', 'DENY_SET');
  if (settings.denySetSha256 !== undefined && (!HEX64.test(settings.denySetSha256 || '') || sha256(bytes) !== settings.denySetSha256)) {
    reject('DENY_SET_FILE_SHA256_MISMATCH');
  }
  const value = validateShape(parseJson(bytes, 'DENY_SET_JSON_INVALID'));
  const prefixHash = runPrefixHash(settings.runId);

  if (value.denied_prefix_sha256.includes(prefixHash)) reject('DENY_SET_RUN_PREFIX_HIT');

  if (value.revision === 1) {
    if (value.previous !== null) reject('DENY_SET_INITIAL_PREVIOUS');
    if (settings.trustedPreviousBytes !== undefined || settings.trustedPreviousPath !== undefined || settings.trustedPreviousSha256 !== undefined) {
      reject('DENY_SET_INITIAL_TRUSTED_PREVIOUS');
    }
  } else {
    if (!HEX64.test(settings.trustedPreviousSha256 || '')) reject('DENY_SET_TRUSTED_PREVIOUS_MISSING');
    const trustedBytes = readBytes(settings, 'trustedPreviousBytes', 'trustedPreviousPath', 'DENY_SET_TRUSTED_PREVIOUS');
    if (sha256(trustedBytes) !== settings.trustedPreviousSha256) reject('DENY_SET_TRUSTED_PREVIOUS_SHA256_MISMATCH');
    const trusted = validateTrustedPrevious(parseJson(trustedBytes, 'DENY_SET_TRUSTED_PREVIOUS_JSON_INVALID'));
    if (value.previous === null) reject('DENY_SET_PREVIOUS_REQUIRED');
    if (value.previous.sha256 !== settings.trustedPreviousSha256) reject('DENY_SET_PREVIOUS_FORGED');
    if (value.previous.revision !== trusted.revision) reject('DENY_SET_PREVIOUS_REVISION_MISMATCH');
    if (value.revision <= trusted.revision) reject('DENY_SET_REVISION_ROLLBACK');
    const current = new Set(value.denied_prefix_sha256);
    const removed = trusted.denied_prefix_sha256.filter((item) => !current.has(item));
    if (removed.length > 0) reject('DENY_SET_REDUCED', removed.join(','));
  }

  return {
    schema_version: value.schema_version,
    namespace: value.namespace,
    revision: value.revision,
    denied_prefix_sha256: value.denied_prefix_sha256.slice(),
    run_prefix_sha256: prefixHash,
    sha256: sha256(bytes),
  };
}

function loadDenySet(options) {
  return validateDenySet(options);
}

function reserveConsumption(options) {
  const settings = options || {};
  if (typeof settings.ledgerDir !== 'string' || !settings.ledgerDir) reject('LEDGER_DIR_REQUIRED');
  const prefixHash = runPrefixHash(settings.runId);
  // DEV_CHANNEL reservations bind only the execution binding; formal ones also bind the deny set.
  const denySetSha256 = settings.denySetSha256 === undefined || settings.denySetSha256 === null ? null : settings.denySetSha256;
  const bindingSha256 = settings.executionBindingSha256 === undefined || settings.executionBindingSha256 === null ? null : settings.executionBindingSha256;
  if ((denySetSha256 !== null && !HEX64.test(denySetSha256)) || (bindingSha256 !== null && !HEX64.test(bindingSha256))
    || (denySetSha256 === null && bindingSha256 === null)) reject('RESERVATION_DENY_SET_SHA256');
  const record = {
    schema_version: 1,
    namespace: NAMESPACE,
    run_id: settings.runId.toLowerCase(),
    run_prefix_sha256: prefixHash,
    deny_set_sha256: denySetSha256,
    execution_binding_sha256: bindingSha256,
    reserved_at_utc: settings.reservedAtUtc || new Date().toISOString(),
  };
  const bytes = Buffer.from(`${JSON.stringify(record, null, 2)}\n`, 'utf8');
  const target = path.join(settings.ledgerDir, `${prefixHash}.json`);
  fs.mkdirSync(settings.ledgerDir, { recursive: true });
  let fd;
  try {
    fd = fs.openSync(target, 'wx');
  } catch (error) {
    if (error && error.code === 'EEXIST') reject('RUN_ALREADY_RESERVED');
    reject('RESERVATION_OPEN_FAILED', error && error.code ? error.code : 'UNKNOWN');
  }
  try {
    if (fs.writeSync(fd, bytes) !== bytes.length) reject('RESERVATION_WRITE_FAILED');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  return { path: target, sha256: sha256(bytes), record };
}

module.exports = {
  SCHEMA_VERSION,
  NAMESPACE,
  ALGORITHM,
  INPUT,
  DENY_SET_FIELDS,
  PREVIOUS_FIELDS,
  sha256,
  runPrefix,
  runPrefixHash,
  validateShape,
  validateDenySet,
  loadDenySet,
  reserveConsumption,
};

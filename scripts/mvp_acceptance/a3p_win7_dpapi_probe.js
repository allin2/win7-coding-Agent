'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { app, safeStorage } = require('electron');
const { createDpapiCredentialVault, FILE_NAME, PROTECTION } = require('../../product/credential-vault');

const startedAt = new Date().toISOString();
const phase = argument('--phase=');
const reportPath = argument('--report=');
const statePath = argument('--state=');
const ACCEPTANCE_ID = 'A3P-20260804-02';

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData');
  const credentialPath = path.join(userDataPath, 'credentials', FILE_NAME);
  const report = {
    schemaVersion: 1,
    acceptanceId: ACCEPTANCE_ID,
    suite: 'WIN7_DPAPI_CURRENT_USER',
    phase,
    environment: {
      platform: process.platform,
      arch: process.arch,
      electron: process.versions.electron,
      node: process.versions.node,
      userData: userDataPath,
    },
    runtime: {
      safeStorageAvailable: safeStorage.isEncryptionAvailable(),
      protection: PROTECTION,
      plaintextFallbackAllowed: false,
      browserWindowCreated: false,
      networkRequested: false,
    },
    cases: [],
    timestamps: { startedAt, finishedAt: null },
    status: 'FAIL',
  };

  try {
    if (process.platform !== 'win32') throw probeError('TARGET_PLATFORM_INVALID', 'DPAPI probe requires Windows.');
    if (!phase || !reportPath || !statePath) throw probeError('PROBE_ARGUMENT_INVALID', 'phase, report and state are required.');
    const vault = createDpapiCredentialVault({ safeStorage, userDataPath, platform: process.platform });
    if (phase === 'save') runSave(vault, credentialPath, report);
    else if (phase === 'reload-clear') runReloadClear(vault, credentialPath, report);
    else if (phase === 'corrupt') runCorrupt(vault, credentialPath, report);
    else throw probeError('PROBE_PHASE_INVALID', `Unsupported phase: ${phase}`);
    report.status = report.cases.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL';
  } catch (error) {
    report.error = {
      code: error && error.code ? String(error.code) : 'PROBE_FAILED',
      message: error && error.message ? String(error.message) : String(error),
    };
  }

  report.timestamps.finishedAt = new Date().toISOString();
  writeJson(reportPath, report);
  process.stdout.write(`A3P_PROBE_REPORT_WRITTEN:${reportPath}\n`);
  // app.exit() bypasses Electron's normal shutdown lifecycle. On Windows that
  // can prevent Chromium's DPAPI-backed Local State from being flushed before
  // the next probe process starts, producing a false cross-process failure.
  process.exitCode = report.status === 'PASS' ? 0 : 1;
  app.quit();
}).catch((error) => {
  process.stderr.write(`A3P_PROBE_STARTUP_FAILED:${error && error.message ? error.message : String(error)}\n`);
  app.exit(2);
});

function runSave(vault, credentialPath, report) {
  const secret = `a3p-${crypto.randomBytes(32).toString('hex')}`;
  const secretSha256 = digest(Buffer.from(secret, 'utf8'));
  const before = vault.getStatus();
  const after = vault.saveApiKey(secret);
  const sameProcessRestored = vault.loadApiKey();
  const sameProcessRestoredMatches = digest(Buffer.from(sameProcessRestored, 'utf8')) === secretSha256;
  const raw = fs.readFileSync(credentialPath, 'utf8');
  const record = JSON.parse(raw);
  const plaintextAbsent = raw.indexOf(secret) === -1;
  const structureValid = Object.keys(record).sort().join(',') === 'ciphertext,protection,schemaVersion' &&
    record.schemaVersion === 1 && record.protection === PROTECTION && typeof record.ciphertext === 'string';
  writeJson(statePath, { schemaVersion: 1, acceptanceId: ACCEPTANCE_ID, secretSha256 });
  report.cases.push({
    caseId: 'A3P_SAVE_DPAPI_CIPHERTEXT',
    status: !before.saved && after.saved && sameProcessRestoredMatches && plaintextAbsent && structureValid ? 'PASS' : 'FAIL',
    metrics: {
      beforeSaved: before.saved,
      afterSaved: after.saved,
      sameProcessDecryptHashMatches: sameProcessRestoredMatches,
      plaintextAbsent,
      structureValid,
      credentialFileBytes: Buffer.byteLength(raw, 'utf8'),
      credentialFileSha256: digest(fs.readFileSync(credentialPath)),
      ciphertextSha256: digest(Buffer.from(record.ciphertext, 'base64')),
      secretValueIncluded: false,
    },
  });
}

function runReloadClear(vault, credentialPath, report) {
  const state = readState();
  const before = vault.getStatus();
  const restored = vault.loadApiKey();
  const restoredMatches = digest(Buffer.from(restored, 'utf8')) === state.secretSha256;
  const raw = fs.readFileSync(credentialPath, 'utf8');
  const plaintextAbsent = raw.indexOf(restored) === -1;
  const after = vault.clearApiKey();
  report.cases.push({
    caseId: 'A3P_RESTART_DECRYPT_AND_CLEAR',
    status: before.saved && restoredMatches && plaintextAbsent && !after.saved && !fs.existsSync(credentialPath) ? 'PASS' : 'FAIL',
    metrics: {
      beforeSaved: before.saved,
      restoredHashMatches: restoredMatches,
      plaintextAbsent,
      afterSaved: after.saved,
      credentialFileRemoved: !fs.existsSync(credentialPath),
      secretValueIncluded: false,
    },
  });
}

function runCorrupt(vault, credentialPath, report) {
  fs.mkdirSync(path.dirname(credentialPath), { recursive: true });
  fs.writeFileSync(credentialPath, '{"schemaVersion":1,"protection":"truncated"', 'utf8');
  let errorCode = null;
  try { vault.loadApiKey(); } catch (error) { errorCode = error && error.code ? String(error.code) : 'UNKNOWN'; }
  const preservedBeforeClear = fs.existsSync(credentialPath);
  vault.clearApiKey();
  report.cases.push({
    caseId: 'A3P_CORRUPT_CIPHERTEXT_FAIL_CLOSED',
    status: errorCode === 'CREDENTIAL_STORE_CORRUPT' && preservedBeforeClear && !fs.existsSync(credentialPath) ? 'PASS' : 'FAIL',
    metrics: {
      errorCode,
      corruptEvidencePreservedUntilExplicitClear: preservedBeforeClear,
      explicitClearRemovedFile: !fs.existsSync(credentialPath),
      decryptSucceeded: false,
      networkRequested: false,
    },
  });
}

function readState() {
  const value = JSON.parse(fs.readFileSync(statePath, 'utf8'));
  if (!value || value.schemaVersion !== 1 || value.acceptanceId !== ACCEPTANCE_ID ||
      !/^[a-f0-9]{64}$/.test(value.secretSha256 || '')) {
    throw probeError('PROBE_STATE_INVALID', 'The non-secret restart state is invalid.');
  }
  return value;
}

function argument(prefix) {
  const value = process.argv.find((item) => item.indexOf(prefix) === 0);
  return value ? value.slice(prefix.length) : null;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

function digest(value) { return crypto.createHash('sha256').update(value).digest('hex'); }

function probeError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

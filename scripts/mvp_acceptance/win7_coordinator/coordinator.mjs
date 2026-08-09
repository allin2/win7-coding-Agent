#!/usr/bin/env node
/* ADR-0065 Win7 acceptance coordinator. No command connects to Win7 except
 * the explicitly named run-a4 command, which requires a signed active lease. */
'use strict';

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  LeaseLedger,
  buildArtifactManifest,
  generateCoordinatorKeyPair,
  gradeA4Candidate,
  jsonBytes,
  publicKeyId,
  sha256Bytes,
  signLeaseBytes,
  verifyLeaseFiles,
} from './lease.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..', '..');
const PUBLIC_KEY = path.join(HERE, 'lease_public.pem');
const KEY_METADATA = path.join(HERE, 'lease_public.json');
const D013_PROFILE = path.join(ROOT, 'spikes/02-terminal-containment/acceptance/d013/d013_profile.json');
const D013_RUNNER = path.join(ROOT, 'spikes/02-terminal-containment/acceptance/d013/run_d013_win7.mjs');

function parseArgs(argv) {
  const command = argv[0];
  const values = {};
  for (let i = 1; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) throw new Error(`unexpected argument: ${token}`);
    const name = token.slice(2).replace(/-/g, '_');
    const value = argv[i + 1];
    if (!value || value.startsWith('--')) throw new Error(`missing value for ${token}`);
    values[name] = value;
    i += 1;
  }
  return { command, ...values };
}

function repoHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, shell: false, encoding: 'utf8' });
  if (result.status !== 0 || !/^[0-9a-f]{40}$/.test(result.stdout.trim())) throw new Error('cannot resolve integration commit');
  return result.stdout.trim();
}

function statePaths(args) {
  const stateDir = path.resolve(args.state_dir || path.join(ROOT, '.acceptance', 'win7-coordinator'));
  return {
    stateDir,
    privateKey: path.join(stateDir, 'lease_private.pem'),
    ledger: path.join(stateDir, 'ledger.json'),
  };
}

function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJson(file, value, mode = 0o600) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode });
  fs.chmodSync(file, mode);
}

function requireAcceptanceId(value) {
  if (!/^A4-[0-9]{8}-[A-Za-z0-9][A-Za-z0-9-]{2,48}$/.test(value || '')) {
    throw new Error('acceptance id must match A4-YYYYMMDD-<unique>');
  }
}

function prepareA4(args) {
  requireAcceptanceId(args.acceptance_id);
  const profile = readJson(D013_PROFILE);
  const manifest = buildArtifactManifest(ROOT, profile);
  const manifestBytes = jsonBytes(manifest);
  const manifestHash = sha256Bytes(manifestBytes);
  const requestedAt = new Date().toISOString();
  const nonce = crypto.randomBytes(32).toString('hex');
  const request = {
    schema_version: 1,
    kind: 'WIN7_ACCEPTANCE_LEASE_REQUEST',
    coordinator: 'ADR-0065',
    state: 'REQUESTED',
    commit: repoHead(),
    acceptance_id: args.acceptance_id,
    target: profile.target,
    scope: { track: 'A4', acceptance: 'D-013', minimum_acl: 'PER_RUN_ROOT_ONLY' },
    artifact_manifest_sha256: manifestHash,
    nonce,
    requested_at: requestedAt,
    requested_validity_seconds: 7200,
    allowed_remote_roots: [
      `${profile.target.acceptance_root}\\${args.acceptance_id}`,
      `${profile.target.data_root}\\${args.acceptance_id}`,
    ],
    forbidden_operations: profile.forbidden_operations,
  };
  const { stateDir, ledger: ledgerFile } = statePaths(args);
  const requestDir = path.join(stateDir, 'requests', args.acceptance_id);
  if (fs.existsSync(requestDir)) throw new Error('request directory already exists');
  fs.mkdirSync(requestDir, { recursive: true });
  const manifestPath = path.join(requestDir, 'artifact-manifest.json');
  const requestPath = path.join(requestDir, 'unsigned-lease-request.json');
  fs.writeFileSync(manifestPath, manifestBytes, { mode: 0o600 });
  fs.writeFileSync(requestPath, jsonBytes(request), { mode: 0o600 });
  const ledger = new LeaseLedger(ledgerFile);
  ledger.request({
    acceptance_id: args.acceptance_id,
    commit: request.commit,
    nonce,
    artifact_manifest_sha256: manifestHash,
    request_path: requestPath,
    requested_at: requestedAt,
  });
  return {
    status: 'REQUESTED',
    signed: false,
    active_lease_count: ledger.active().length,
    request_path: requestPath,
    manifest_path: manifestPath,
    commit: request.commit,
    acceptance_id: request.acceptance_id,
    target: request.target,
    scope: request.scope,
    artifact_manifest_sha256: manifestHash,
    helper_sha256: manifest.files.find((item) => item.role === 'helper')?.sha256,
    input_lock_sha256: manifest.files.find((item) => item.role === 'input_lock')?.sha256,
    requested_validity_seconds: 7200,
    allowed_remote_roots: request.allowed_remote_roots,
    forbidden_operations: request.forbidden_operations,
  };
}

function grant(args) {
  requireAcceptanceId(args.acceptance_id);
  const { privateKey, ledger: ledgerFile } = statePaths(args);
  const ledger = new LeaseLedger(ledgerFile);
  if (ledger.active().length !== 0) throw new Error('another GRANTED/RUNNING lease is active');
  const entry = ledger.read().leases.find((item) => item.acceptance_id === args.acceptance_id);
  if (!entry || entry.state !== 'REQUESTED') throw new Error('lease request is not REQUESTED');
  const request = readJson(entry.request_path);
  const issued = new Date();
  const expires = new Date(issued.getTime() + 2 * 60 * 60 * 1000);
  const metadata = readJson(KEY_METADATA);
  const payload = {
    schema_version: 1,
    kind: 'WIN7_ACCEPTANCE_LEASE',
    algorithm: 'Ed25519',
    key_id: metadata.key_id,
    state: 'GRANTED',
    commit: request.commit,
    acceptance_id: request.acceptance_id,
    target: request.target,
    scope: request.scope,
    artifact_manifest_sha256: request.artifact_manifest_sha256,
    nonce: request.nonce,
    issued_at: issued.toISOString(),
    expires_at: expires.toISOString(),
    allowed_remote_roots: request.allowed_remote_roots,
    forbidden_operations: request.forbidden_operations,
  };
  const bytes = jsonBytes(payload);
  const signature = signLeaseBytes(bytes, privateKey, metadata.key_id);
  const requestDir = path.dirname(entry.request_path);
  const payloadPath = path.join(requestDir, 'lease-payload.json');
  const signaturePath = path.join(requestDir, 'lease-signature.json');
  fs.writeFileSync(payloadPath, bytes, { mode: 0o600 });
  writeJson(signaturePath, signature);
  ledger.grant(args.acceptance_id, sha256Bytes(bytes), issued.toISOString());
  return { status: 'GRANTED', payload_path: payloadPath, signature_path: signaturePath, expires_at: payload.expires_at };
}

function verify(args) {
  const payload = verifyLeaseFiles(path.resolve(args.payload), path.resolve(args.signature), PUBLIC_KEY);
  return { status: 'VERIFIED', acceptance_id: payload.acceptance_id, commit: payload.commit, expires_at: payload.expires_at };
}

function transition(args) {
  requireAcceptanceId(args.acceptance_id);
  const next = String(args.to || '').toUpperCase();
  const allowed = new Set([
    'REQUEST_SUPERSEDED', 'RUNNING', 'RETURNED', 'RELEASED',
    'RECOVERY_REQUIRED', 'RECOVERY_REVIEWED',
  ]);
  if (!allowed.has(next)) throw new Error('invalid transition target');
  const ledger = new LeaseLedger(statePaths(args).ledger);
  const lease = ledger.transition(args.acceptance_id, next, new Date().toISOString());
  return { acceptance_id: args.acceptance_id, status: lease.state, active_lease_count: ledger.active().length };
}

function runA4(args) {
  requireAcceptanceId(args.acceptance_id);
  const payloadPath = path.resolve(args.payload);
  const signaturePath = path.resolve(args.signature);
  const payloadBytes = fs.readFileSync(payloadPath);
  const payload = verifyLeaseFiles(payloadPath, signaturePath, PUBLIC_KEY, {
    acceptance_id: args.acceptance_id,
    commit: repoHead(),
  });
  const ledger = new LeaseLedger(statePaths(args).ledger);
  const entry = ledger.read().leases.find((item) => item.acceptance_id === args.acceptance_id);
  if (!entry || entry.state !== 'GRANTED' || entry.lease_payload_sha256 !== sha256Bytes(payloadBytes)) {
    throw new Error('signed lease does not match the GRANTED ledger entry');
  }
  ledger.transition(args.acceptance_id, 'RUNNING', new Date().toISOString());
  const out = path.resolve(args.out || path.join(ROOT, '.acceptance', 'win7-coordinator', 'evidence', `${args.acceptance_id}.json`));
  const result = spawnSync(process.execPath, [
    D013_RUNNER, '--execute-win7', '--acceptance-id', args.acceptance_id,
    '--lease-payload', payloadPath, '--lease-signature', signaturePath,
    '--lease-nonce', payload.nonce, '--out', out,
  ], { cwd: ROOT, encoding: 'utf8', shell: false, timeout: 20 * 60 * 1000 });
  let next = 'RECOVERY_REQUIRED';
  if (fs.existsSync(out)) {
    const report = readJson(out);
    const postflight = report.stages?.find((stage) => stage.id === 'REM-D08');
    if (result.status === 0 && report.result?.automatic_status === 'D013_CANDIDATE_EVIDENCE' && postflight?.status === 'PASS') next = 'RETURNED';
  }
  ledger.transition(args.acceptance_id, next, new Date().toISOString());
  return { status: next, report: out, worker_exit_code: result.status, stdout: result.stdout, stderr: result.stderr };
}

function gradeA4(args) {
  const payload = verifyLeaseFiles(path.resolve(args.payload), path.resolve(args.signature), PUBLIC_KEY, {
    acceptance_id: args.acceptance_id,
    commit: repoHead(),
  });
  const ledger = new LeaseLedger(statePaths(args).ledger);
  const entry = ledger.read().leases.find((item) => item.acceptance_id === args.acceptance_id);
  if (!entry || entry.state !== 'RETURNED') throw new Error('lease is not RETURNED');
  const report = readJson(path.resolve(args.report));
  if (report.acceptance_id !== payload.acceptance_id) throw new Error('report acceptance id does not match lease');
  const result = gradeA4Candidate(report);
  const output = {
    schema_version: 1,
    acceptance_id: payload.acceptance_id,
    commit: payload.commit,
    artifact_manifest_sha256: payload.artifact_manifest_sha256,
    graded_at: new Date().toISOString(),
    ...result,
  };
  if (args.out) writeJson(path.resolve(args.out), output);
  return output;
}

function status(args) {
  const ledger = new LeaseLedger(statePaths(args).ledger);
  const value = ledger.read();
  return { active_lease_count: ledger.active(value).length, leases: value.leases.map((item) => ({ acceptance_id: item.acceptance_id, state: item.state })) };
}

function help() {
  return {
    usage: [
      'coordinator.mjs init-key [--state-dir PATH]',
      'coordinator.mjs prepare-a4 --acceptance-id A4-YYYYMMDD-ID [--state-dir PATH]',
      'coordinator.mjs grant --acceptance-id ID [--state-dir PATH]',
      'coordinator.mjs verify --payload FILE --signature FILE',
      'coordinator.mjs run-a4 --acceptance-id ID --payload FILE --signature FILE [--out FILE]',
      'coordinator.mjs grade-a4 --acceptance-id ID --payload FILE --signature FILE --report FILE [--out FILE]',
      'coordinator.mjs transition --acceptance-id ID --to RELEASED [--state-dir PATH]',
      'coordinator.mjs status [--state-dir PATH]',
    ],
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let result;
  if (args.command === 'init-key') {
    const paths = statePaths(args);
    result = generateCoordinatorKeyPair(paths.privateKey, PUBLIC_KEY, KEY_METADATA);
  } else if (args.command === 'prepare-a4') result = prepareA4(args);
  else if (args.command === 'grant') result = grant(args);
  else if (args.command === 'verify') result = verify(args);
  else if (args.command === 'transition') result = transition(args);
  else if (args.command === 'run-a4') result = runA4(args);
  else if (args.command === 'grade-a4') result = gradeA4(args);
  else if (args.command === 'status') result = status(args);
  else result = help();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

try { main(); } catch (error) {
  process.stderr.write(`${JSON.stringify({ status: 'FAIL_CLOSED', error: String(error.message || error) })}\n`);
  process.exitCode = 1;
}

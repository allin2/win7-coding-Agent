#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {
  CoordinatorError, createLeaseRequest, grantLease, gradeCandidateEvidence,
  initializeKeyPair, loadState, recoverLease, recoverRelocatedLease, registerGrantedLease, releaseLease, returnLease,
  startLease, verifyLeaseBundle,
} from './core.mjs';

function parse(argv) {
  const [command, ...rest] = argv;
  const args = { command };
  for (let i = 0; i < rest.length; i += 1) {
    if (!rest[i].startsWith('--')) throw new Error(`unexpected argument: ${rest[i]}`);
    const key = rest[i].slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = rest[++i];
  }
  return args;
}

function required(args, key) {
  if (!args[key]) throw new Error(`--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required`);
  return args[key];
}

function jsonFile(filename) { return JSON.parse(fs.readFileSync(filename, 'utf8')); }
function write(filename, value) { fs.mkdirSync(path.dirname(path.resolve(filename)), { recursive: true }); fs.writeFileSync(filename, value); }

async function main() {
  const args = parse(process.argv.slice(2));
  if (args.command === 'init-key') {
    console.log(JSON.stringify(initializeKeyPair(required(args, 'privateKey'), required(args, 'publicKey'))));
    return;
  }
  if (args.command === 'request') {
    write(required(args, 'out'), Buffer.from(JSON.stringify(createLeaseRequest(jsonFile(required(args, 'spec'))), null, 2) + '\n'));
    return;
  }
  if (args.command === 'grant') {
    const granted = grantLease(jsonFile(required(args, 'request')), fs.readFileSync(required(args, 'privateKey')));
    registerGrantedLease(required(args, 'state'), granted.lease);
    write(required(args, 'lease'), granted.raw);
    write(required(args, 'signature'), granted.signature);
    console.log(JSON.stringify({ lease_id: granted.lease.lease_id, raw_sha256: granted.rawSha256, state: 'GRANTED' }));
    return;
  }
  const raw = fs.readFileSync(required(args, 'lease'));
  const signature = fs.readFileSync(required(args, 'signature'));
  const recoveryOnly = args.command === 'recover' || args.command === 'recover-relocated' || args.command === 'release';
  const lease = verifyLeaseBundle(raw, signature, fs.readFileSync(required(args, 'publicKey')), {
    sourceCommit: args.sourceCommit, packageManifestSha256: args.packageManifestSha256,
    targetIp: args.targetIp, suite: args.suite, allowExpired: recoveryOnly,
  });
  if (args.command === 'verify') { console.log(JSON.stringify({ ok: true, lease_id: lease.lease_id })); return; }
  if (args.command === 'start') { startLease(required(args, 'state'), lease, jsonFile(required(args, 'snapshot'))); return; }
  if (args.command === 'return') { returnLease(required(args, 'state'), lease, jsonFile(required(args, 'snapshot'))); return; }
  if (args.command === 'recover') { recoverLease(required(args, 'state'), lease, jsonFile(required(args, 'snapshot'))); return; }
  if (args.command === 'recover-relocated') {
    recoverRelocatedLease(required(args, 'state'), lease, jsonFile(required(args, 'snapshot')),
      jsonFile(required(args, 'relocation')), fs.readFileSync(required(args, 'privateKey')));
    return;
  }
  if (args.command === 'release') { releaseLease(required(args, 'state'), lease.lease_id); return; }
  if (args.command === 'grade') { console.log(JSON.stringify(gradeCandidateEvidence(lease, jsonFile(required(args, 'evidence')), loadState(required(args, 'state'))))); return; }
  throw new Error('command must be init-key, request, grant, verify, start, return, recover, recover-relocated, release, or grade');
}

main().catch((error) => {
  const payload = error instanceof CoordinatorError
    ? { ok: false, code: error.code, message: error.message, details: error.details }
    : { ok: false, code: 'CLI_ERROR', message: error.message };
  process.stderr.write(`${JSON.stringify(payload)}\n`);
  process.exitCode = 1;
});

#!/usr/bin/env node
'use strict';

const path = require('path');
const { parseArgs, fail } = require('./lib/common');
const { validateEvidence } = require('./lib/evidence');
const { createLease, defaultStateFile, transitionLease, verifyLeaseFiles } = require('./lib/lease');
const { createPackage } = require('./lib/package');
const remote = require('./lib/remote');

function required(args, name) {
  if (!args[name]) fail('--' + name + ' is required', 'INVALID_ARGUMENT');
  return path.resolve(args[name]);
}

function sshConfig(args) {
  return {
    ip: args.ip || '192.168.1.11',
    port: Number(args.port || 22),
    user: args.user || 'dccs-chaizl',
    identityFile: required(args, 'identity-file'),
    knownHostsFile: required(args, 'known-hosts-file'),
    ssh: args.ssh || 'ssh',
    scp: args.scp || 'scp',
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  let output;
  if (command === 'package-create') {
    output = createPackage({
      sourceCommit: args['source-commit'],
      runtimeSourceSha256: args['runtime-source-sha256'],
      runtimeRoot: required(args, 'runtime-root'),
      harnessRoot: required(args, 'harness-root'),
      runnerRoot: path.join(__dirname, 'runner'),
      publicKeyFile: path.join(__dirname, 'keys', 'coordinator-ed25519-public.pem'),
      output: required(args, 'output'),
    });
  } else if (command === 'lease-create') {
    output = createLease({
      keyFile: process.env.WIN7_ACCEPTANCE_SIGNING_KEY_FILE,
      stateFile: args['state-file'] ? path.resolve(args['state-file']) : undefined,
      sourceCommit: args['source-commit'],
      packageManifestSha256: args['package-manifest-sha256'],
      runId: args['run-id'],
      ttlMinutes: args['ttl-minutes'],
      leaseFile: required(args, 'lease-file'),
      signatureFile: args['signature-file'] ? path.resolve(args['signature-file']) : undefined,
      ip: args.ip,
      hostname: args.hostname,
    });
  } else if (command === 'preflight') {
    const lease = verifyLeaseFiles(required(args, 'lease-file'), required(args, 'signature-file'), path.join(__dirname, 'keys', 'coordinator-ed25519-public.pem'));
    output = remote.preflight(sshConfig(args), { hostname: lease.target.hostname, output: required(args, 'output') });
  } else if (command === 'execute') {
    const leaseFile = required(args, 'lease-file');
    const signatureFile = required(args, 'signature-file');
    const lease = verifyLeaseFiles(leaseFile, signatureFile, path.join(__dirname, 'keys', 'coordinator-ed25519-public.pem'));
    const keyFile = process.env.WIN7_ACCEPTANCE_SIGNING_KEY_FILE;
    output = remote.execute(sshConfig(args), {
      runId: lease.run_id,
      leaseId: lease.lease_id,
      stateFile: args['state-file'] ? path.resolve(args['state-file']) : defaultStateFile(keyFile),
      packageRoot: required(args, 'package-root'),
      leaseFile,
      signatureFile,
    });
  } else if (command === 'collect') {
    output = remote.collect(sshConfig(args), { runId: args['run-id'], outputRoot: required(args, 'output-root') });
  } else if (command === 'postflight') {
    output = remote.postflight(sshConfig(args), { runId: args['run-id'], output: required(args, 'output') });
  } else if (command === 'validate') {
    output = validateEvidence({
      leaseFile: required(args, 'lease-file'),
      signatureFile: required(args, 'signature-file'),
      publicKeyFile: path.join(__dirname, 'keys', 'coordinator-ed25519-public.pem'),
      packageRoot: required(args, 'package-root'),
      evidenceRoot: required(args, 'evidence-root'),
      preflightFile: required(args, 'preflight-file'),
      postflightFile: required(args, 'postflight-file'),
      statusFile: required(args, 'status-file'),
    });
  } else if (command === 'release') {
    const keyFile = process.env.WIN7_ACCEPTANCE_SIGNING_KEY_FILE;
    output = transitionLease({
      stateFile: args['state-file'] ? path.resolve(args['state-file']) : defaultStateFile(keyFile),
      leaseId: args['lease-id'],
      toState: 'RELEASED',
      note: args.note,
    });
  } else {
    fail('usage: cli.js <package-create|lease-create|preflight|execute|collect|postflight|validate|release> [options]', 'INVALID_ARGUMENT');
  }
  process.stdout.write(JSON.stringify(output || { ok: true }, null, 2) + '\n');
}

try {
  main();
} catch (error) {
  process.stderr.write(JSON.stringify({ error: error.code || 'COORDINATOR_ERROR', message: error.message }) + '\n');
  process.exit(1);
}

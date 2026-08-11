#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const EXPECTED_HELPER_SHA256 = '7f86dac89862b2c61d55fe83ba00bf7cdaa69714d24d0f9d21b62f9040d1c134';
const SHA_RE = /^[a-f0-9]{64}$/;

function parse(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) throw new Error(`unexpected argument: ${item}`);
    args[item.slice(2).replace(/-([a-z])/g, (_, ch) => ch.toUpperCase())] = argv[++index];
  }
  for (const name of ['acceptanceId', 'out', 'sourceCommit', 'whoamiSha256', 'pingSha256']) {
    if (!args[name]) throw new Error(`missing --${name.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`);
  }
  if (!/^D013-RUNNER-[A-Za-z0-9._-]{4,100}$/.test(args.acceptanceId)) throw new Error('invalid acceptance id');
  if (!/^[a-f0-9]{40}$/.test(args.sourceCommit)) throw new Error('invalid source commit');
  for (const name of ['whoamiSha256', 'pingSha256']) if (!SHA_RE.test(args[name])) throw new Error(`invalid ${name}`);
  return args;
}

function digest(bytes) { return crypto.createHash('sha256').update(bytes).digest('hex'); }
function hashFile(filename) { return digest(fs.readFileSync(filename)); }
function writeJson(filename, value) { fs.writeFileSync(filename, `${JSON.stringify(value, null, 2)}\n`, 'utf8'); }
function copy(source, destination) { fs.mkdirSync(path.dirname(destination), { recursive: true }); fs.copyFileSync(source, destination); }

function walk(root, current = root) {
  const entries = [];
  for (const name of fs.readdirSync(current).sort()) {
    const absolute = path.join(current, name);
    if (fs.statSync(absolute).isDirectory()) entries.push(...walk(root, absolute));
    else entries.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return entries;
}

function main() {
  const args = parse(process.argv.slice(2));
  const out = path.resolve(args.out);
  if (fs.existsSync(out)) throw new Error(`output already exists: ${out}`);
  fs.mkdirSync(out, { recursive: false });
  const remoteRoot = `C:\\Win7CodingAgent\\acceptance\\${args.acceptanceId}`;
  const acceptanceRoot = 'C:\\Win7CodingAgent\\acceptance';
  const helper = path.join(REPO, 'native', 'helper', 'build-win10-kit', 'candidate', 'spike02_helper.exe');
  if (hashFile(helper) !== EXPECTED_HELPER_SHA256) throw new Error('v24 helper candidate hash mismatch');
  copy(helper, path.join(out, 'spike02_helper.exe'));
  copy(path.join(HERE, 'runner-win7-harness.js'), path.join(out, 'runner-win7-harness.js'));
  copy(path.join(HERE, 'runner_wmi.cmd'), path.join(out, 'runner_wmi.cmd'));
  copy(path.join(REPO, 'scripts', 'mvp_acceptance', 'win7_coordinator', 'keys', 'coordinator-ed25519-public-a5.pem'),
    path.join(out, 'coordinator-ed25519-public.pem'));
  copy(path.join(REPO, 'src', 'shell', 'product', 'runner-runtime.js'), path.join(out, 'runtime', 'runner-runtime.js'));
  const runnerDist = path.join(REPO, 'src', 'runner', 'dist');
  for (const name of fs.readdirSync(runnerDist).filter((item) => item.endsWith('.js')).sort()) {
    copy(path.join(runnerDist, name), path.join(out, 'runtime', 'runner', name));
  }

  const exactPingArgs = [
    ['-n', '2', '127.0.0.1'],
    ['-n', '4', '-w', '10', '127.0.0.1'],
    ['-t', '127.0.0.1'],
  ];
  const aclPolicy = {
    acceptance_root: acceptanceRoot,
    per_run_root: remoteRoot,
    apply_low_integrity_to_work_dir: true,
  };
  const releaseManifest = {
    schema_version: 1,
    release: 'win7-native-runner-v24-acceptance',
    acceptance_id: args.acceptanceId,
    helper: { path: 'spike02_helper.exe', sha256: EXPECTED_HELPER_SHA256 },
    profiles: [
      {
        id: 'win7-whoami', executable_path: 'C:\\Windows\\System32\\whoami.exe', sha256: args.whoamiSha256,
        risk: 'low', output_encoding: 'cp936', working_directory_roots: [remoteRoot], argv_policy: { exact: [[], ['/all']] }, acl_policy: aclPolicy,
      },
      {
        id: 'win7-ping', executable_path: 'C:\\Windows\\System32\\ping.exe', sha256: args.pingSha256,
        risk: 'low', output_encoding: 'cp936', working_directory_roots: [remoteRoot], argv_policy: { exact: exactPingArgs }, acl_policy: aclPolicy,
      },
      {
        id: 'high-risk-whoami', executable_path: 'C:\\Windows\\System32\\whoami.exe', sha256: args.whoamiSha256,
        risk: 'high', output_encoding: 'cp936', working_directory_roots: [remoteRoot], argv_policy: { exact: [[]] },
      },
    ],
    acceptance_action: {
      profile_id: 'win7-whoami', args: [], timeout_ms: 15000, idle_timeout_ms: 5000,
      max_stdout_bytes: 65536, max_stderr_bytes: 65536,
    },
  };
  writeJson(path.join(out, 'runner-release-manifest.json'), releaseManifest);
  const files = walk(out).map((relative) => {
    const absolute = path.join(out, relative.split('/').join(path.sep));
    return { path: relative, size: fs.statSync(absolute).size, sha256: hashFile(absolute) };
  });
  const packageManifest = {
    schema_version: 1,
    package: 'WIN7_NATIVE_RUNNER_L01_L10',
    acceptance_id: args.acceptanceId,
    source_commit: args.sourceCommit,
    target: { ip: '192.168.1.11', os_build: '7601', arch: 'x64' },
    suite: 'NATIVE_RUNNER_L01_L10',
    cases: ['L01', 'L02', 'L03', 'L04', 'L05', 'L06', 'L07', 'L08', 'L09', 'L10'],
    files,
  };
  writeJson(path.join(out, 'package-manifest.json'), packageManifest);
  process.stdout.write(`${JSON.stringify({
    status: 'RUNNER_PACKAGE_READY', out,
    package_manifest_sha256: hashFile(path.join(out, 'package-manifest.json')),
    release_manifest_sha256: hashFile(path.join(out, 'runner-release-manifest.json')),
    helper_sha256: EXPECTED_HELPER_SHA256,
    file_count: files.length,
  }, null, 2)}\n`);
}

main();

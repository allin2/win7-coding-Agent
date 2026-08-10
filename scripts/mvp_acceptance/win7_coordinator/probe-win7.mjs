#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { CoordinatorError, canonicalJson } from './core.mjs';

const SHA_LINE = /^[0-9a-fA-F ]{64,}$/;
const ACCEPTANCE_ID_RE = /^(?:A4|A5|D013)-[A-Za-z0-9._-]{4,120}$/;

function fail(code, message) { throw new CoordinatorError(code, message); }

export function parseCertutilHash(output) {
  for (const line of String(output || '').split(/\r?\n/)) {
    const compact = line.replace(/\s/g, '');
    if (SHA_LINE.test(line.trim()) && /^[0-9a-fA-F]{64}$/.test(compact)) return compact.toLowerCase();
  }
  fail('REMOTE_HASH_INVALID', 'certutil output did not contain one SHA-256');
}

export function parseResidues(output, acceptanceId) {
  const markers = ['spike02_helper.exe', 'winpty-agent.exe', acceptanceId.toLowerCase()];
  if (acceptanceId.startsWith('A5-') || acceptanceId.startsWith('D013-RUNNER-')) markers.push('ping.exe');
  return String(output || '').split(/\r?\n/).filter((line) => {
    const lower = line.toLowerCase();
    return markers.some((marker) => lower.includes(marker));
  }).map((line) => ({ raw: line.slice(0, 4096) }));
}

export function buildSshArgs(options, remoteArgv) {
  return [
    '-i', options.privateKey,
    '-o', 'IdentitiesOnly=yes', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=8',
    '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${options.knownHosts}`,
    `${options.user}@${options.targetIp}`,
    ...remoteArgv,
  ];
}

function runRemote(options, remoteArgv, runner) {
  const result = runner('ssh', buildSshArgs(options, remoteArgv), {
    shell: false, encoding: 'utf8', timeout: 30_000, maxBuffer: 16 * 1024 * 1024,
  });
  if (result.status !== 0) fail('WIN7_PROBE_FAILED', `${remoteArgv[0]} failed: ${result.stderr || result.error || result.status}`);
  return result.stdout || '';
}

function validateArtifactMap(value, acceptanceId) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const suiteSegment = acceptanceId.startsWith('A5-') ? 'a5\\' : '';
  const expectedRoot = `c:\\win7codingagent\\acceptance\\${suiteSegment}${acceptanceId.toLowerCase()}\\`;
  const fixedRuntimeArtifacts = {
    electron: 'c:\\acceptance\\electron\\electron.exe',
  };
  const result = {};
  for (const [name, remotePath] of Object.entries(value)) {
    const normalizedPath = typeof remotePath === 'string' ? remotePath.toLowerCase() : '';
    const fixedRuntimeMatch = fixedRuntimeArtifacts[name] === normalizedPath;
    if (!/^[A-Za-z0-9_.-]+$/.test(name) || typeof remotePath !== 'string'
        || /[\r\n\0]/.test(remotePath) || (!normalizedPath.startsWith(expectedRoot) && !fixedRuntimeMatch)) {
      fail('ARTIFACT_PATH_DENIED', `artifact ${name} is outside the signed per-run root`);
    }
    result[name] = remotePath;
  }
  return result;
}

export function probeWin7(options, runner = spawnSync) {
  if (options.targetIp !== '192.168.1.11' || options.user !== 'dccs-chaizl') fail('TARGET_DENIED', 'probe target is not the locked Win7 host');
  if (!ACCEPTANCE_ID_RE.test(options.acceptanceId)) fail('INVALID_ACCEPTANCE_ID', 'acceptance id is invalid');
  const version = runRemote(options, ['cmd.exe', '/d', '/s', '/c', 'ver'], runner);
  const hostname = runRemote(options, ['hostname'], runner).trim();
  const osInfo = runRemote(options, ['wmic.exe', 'os', 'get', 'OSArchitecture,BuildNumber', '/format:list'], runner);
  const service = runRemote(options, ['sc', 'query', 'BvSshServer'], runner);
  const processes = runRemote(options, ['wmic.exe', 'process', 'get', 'Name,CommandLine,ProcessId', '/format:csv'], runner);
  if (!/7601/.test(version + osInfo) || !/64-bit|x64/i.test(osInfo)) fail('TARGET_IDENTITY_MISMATCH', 'target is not Win7 build 7601 x64');

  const artifactHashes = {};
  for (const [name, remotePath] of Object.entries(validateArtifactMap(options.artifactMap, options.acceptanceId))) {
    artifactHashes[name] = parseCertutilHash(runRemote(options, ['certutil.exe', '-hashfile', remotePath, 'SHA256'], runner));
  }

  return {
    schema_version: 1,
    phase: options.phase,
    observed_at_utc: new Date().toISOString(),
    service: { name: 'BvSshServer', state: /\bSTATE\s*:\s*4\s+RUNNING\b|\bRUNNING\b/i.test(service) ? 'RUNNING' : 'NOT_RUNNING' },
    ssh: { port: 22, reachable: true, strict_host_key_checking: true },
    target: { ip: options.targetIp, hostname, os_build: '7601', arch: 'x64' },
    residues: parseResidues(processes, options.acceptanceId),
    artifact_hashes: artifactHashes,
  };
}

function parseArgs(argv) {
  const args = { targetIp: '192.168.1.11', user: 'dccs-chaizl', phase: 'preflight', artifactMap: {} };
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (item === '--target-ip') args.targetIp = argv[++i];
    else if (item === '--user') args.user = argv[++i];
    else if (item === '--private-key') args.privateKey = path.resolve(argv[++i]);
    else if (item === '--known-hosts') args.knownHosts = path.resolve(argv[++i]);
    else if (item === '--acceptance-id') args.acceptanceId = argv[++i];
    else if (item === '--phase') args.phase = argv[++i];
    else if (item === '--artifact-map') args.artifactMap = JSON.parse(fs.readFileSync(path.resolve(argv[++i]), 'utf8'));
    else if (item === '--out') args.out = path.resolve(argv[++i]);
    else fail('CLI_ERROR', `unknown argument: ${item}`);
  }
  for (const name of ['privateKey', 'knownHosts', 'acceptanceId', 'out']) if (!args[name]) fail('CLI_ERROR', `--${name.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required`);
  if (!['preflight', 'postflight'].includes(args.phase)) fail('CLI_ERROR', '--phase must be preflight or postflight');
  return args;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const snapshot = probeWin7(args);
    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, canonicalJson(snapshot));
    process.stdout.write(`${JSON.stringify({ ok: true, out: args.out, phase: args.phase })}\n`);
  } catch (error) {
    process.stderr.write(`${JSON.stringify({ ok: false, code: error.code || 'PROBE_ERROR', message: error.message })}\n`);
    process.exitCode = 1;
  }
}

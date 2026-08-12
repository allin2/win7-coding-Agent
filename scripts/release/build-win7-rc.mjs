#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildRelease, writeJson } from './release-contract.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '..', '..');

try {
  const args = parseArguments(process.argv.slice(2));
  const headCommit = git(repositoryRoot, ['rev-parse', 'HEAD']).trim();
  const sourceCommit = args.sourceCommit || headCommit;
  if (sourceCommit !== headCommit) throw new Error(`SOURCE_COMMIT_NOT_HEAD:expected=${headCommit};received=${sourceCommit}`);
  const sourceStatus = git(repositoryRoot, ['status', '--porcelain', '--untracked-files=all']).trim();
  if (sourceStatus && !args.allowUncommitted) throw new Error('SOURCE_WORKTREE_NOT_CLEAN');
  const result = buildRelease({
    repositoryRoot,
    lockPath: path.join(repositoryRoot, 'release', 'win7-rc', 'rc-input-lock.json'),
    electronZip: args.electronZip || path.join(repositoryRoot, 'spikes', '02-terminal-containment', 'build-win10', 'kit', 'inputs', 'electron-v22.3.27-win32-x64.zip'),
    runnerZip: args.runnerZip,
    storageZip: args.storageZip,
    sourceCommit,
    outputRoot: args.output || path.join(repositoryRoot, 'release', 'win7-rc', 'out'),
  });
  const evidence = {
    schema_version: 1,
    status: 'DEVELOPER_PACKAGE_ASSEMBLY_PASS',
    release_id: result.lock.release_id,
    version: result.lock.version,
    source_commit: sourceCommit,
    zip: path.basename(result.zipPath),
    zip_sha256: result.zipHash,
    manifest_files: result.fileCount,
    gates: {
      developer_package_assembly: 'PASS',
      developer_full_regression: 'NOT_RECORDED_BY_THIS_COMMAND',
      win10: 'NOT_PERFORMED',
      win7: 'NOT_PERFORMED'
    }
  };
  writeJson(path.join(path.dirname(result.zipPath), 'build-result.json'), evidence);
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
} catch (error) {
  process.stderr.write(`RC_BUILD_FAILED:${error && error.message ? error.message : String(error)}\n`);
  process.exitCode = 1;
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (key === '--allow-uncommitted') {
      values.allowUncommitted = true;
      continue;
    }
    const value = argv[index + 1];
    if (!key.startsWith('--') || !value || value.startsWith('--')) throw new Error(`ARGUMENT_INVALID:${key}`);
    index += 1;
    if (key === '--electron-zip') values.electronZip = value;
    else if (key === '--runner-zip') values.runnerZip = value;
    else if (key === '--storage-zip') values.storageZip = value;
    else if (key === '--source-commit') values.sourceCommit = value;
    else if (key === '--output') values.output = value;
    else throw new Error(`ARGUMENT_UNKNOWN:${key}`);
  }
  if (!values.runnerZip) throw new Error('ARGUMENT_REQUIRED:--runner-zip');
  if (!values.storageZip) throw new Error('ARGUMENT_REQUIRED:--storage-zip');
  if (values.output) {
    const resolved = path.resolve(values.output);
    if (fs.existsSync(resolved) && !fs.statSync(resolved).isDirectory()) throw new Error('OUTPUT_MUST_BE_DIRECTORY');
  }
  return values;
}

function git(root, args) {
  return execFileSync('git', ['-c', 'core.fsmonitor=false', ...args], {
    cwd: root,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

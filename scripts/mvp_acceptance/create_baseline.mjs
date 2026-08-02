import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { relative, resolve, sep } from 'path';
import { execFileSync } from 'child_process';

const repositoryRoot = resolve(new URL('../..', import.meta.url).pathname);
const outputRoot = resolve(repositoryRoot, 'docs/status/mvp-baselines');
const requestedId = process.argv.find((arg) => arg.startsWith('--mvp-id='));
const now = new Date();
const defaultId = `MVP-${now.toISOString().slice(0, 10).replaceAll('-', '')}-01`;
const mvpId = requestedId ? requestedId.slice('--mvp-id='.length) : defaultId;

const excludedPrefixes = [
  '.git/',
  '.acceptance/',
  'node_modules/',
  'outputs/',
  'docs/status/mvp-baselines/',
  'spikes/01-win7-runtime-baseline/acceptance/evidence/',
  'spikes/02-terminal-containment/acceptance/evidence/',
  'spikes/03-git-adapter/acceptance/evidence/',
  'spikes/04-storage-index/acceptance/evidence/',
];

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function nulSeparatedGitFiles(args) {
  const output = execFileSync('git', args, {
    cwd: repositoryRoot,
    encoding: 'buffer',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  return output.toString('utf8').split('\0').filter(Boolean);
}

function isIncluded(repoPath) {
  return !excludedPrefixes.some((prefix) => repoPath === prefix.slice(0, -1) || repoPath.startsWith(prefix));
}

function sha256(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex');
}

const tracked = nulSeparatedGitFiles(['ls-files', '-z']);
const untracked = nulSeparatedGitFiles(['ls-files', '--others', '--exclude-standard', '-z']);
const selected = [...new Set([...tracked, ...untracked])]
  .filter(isIncluded)
  .sort();

const files = selected.flatMap((repoPath) => {
  const absolutePath = resolve(repositoryRoot, repoPath);
  if (!existsSync(absolutePath) || !statSync(absolutePath).isFile()) return [];
  return [{
    path: repoPath.split(sep).join('/'),
    bytes: statSync(absolutePath).size,
    sha256: sha256(absolutePath),
    source: tracked.includes(repoPath) ? 'tracked' : 'untracked',
  }];
});

mkdirSync(outputRoot, { recursive: true });
const outputPath = resolve(outputRoot, `${mvpId}.json`);
const manifest = {
  schema_version: 1,
  mvp_id: mvpId,
  generated_at: now.toISOString(),
  repository: relative(resolve(repositoryRoot, '..'), repositoryRoot),
  branch: runGit(['branch', '--show-current']),
  head_commit: runGit(['rev-parse', 'HEAD']),
  working_tree_status: runGit(['status', '--porcelain=v1']),
  excluded_prefixes: excludedPrefixes,
  file_count: files.length,
  files,
};

writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
process.stdout.write(`${outputPath}\n`);

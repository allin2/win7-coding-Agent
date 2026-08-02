#!/usr/bin/env node

/** Build the A2 portable acceptance directory from the already locked A1 packer. */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptRoot, '../..');
const outputRoot = path.resolve(argument('--out=') || path.join(repositoryRoot, 'outputs/desktop-alpha2'));
const stagingRoot = outputRoot + '.a1-staging';
const electronRoot = argument('--electron-root=');

fs.rmSync(stagingRoot, { recursive: true, force: true });
const args = [path.join(scriptRoot, 'build_desktop_alpha1.mjs'), `--out=${stagingRoot}`];
if (electronRoot) args.push(`--electron-root=${electronRoot}`);
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
if (result.status !== 0) throw new Error(`A1 portable build failed with exit code ${result.status}`);

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.renameSync(stagingRoot, outputRoot);
writeText(path.join(outputRoot, 'README.txt'), [
  'Win7 Coding Agent Desktop Alpha 2',
  '',
  'Controlled single-file write loop: Replay intent -> trusted plan/Diff -> explicit approval -> atomic write -> verify/rollback.',
  'Supported files: existing UTF-8 or UTF-8 BOM text, one unique exact replacement, one active plan.',
  'Rejects GBK/binary/unknown encoding, path escape, ambiguous anchor, truncated Diff, drift and approval replay.',
  'Undo is a new reverse plan and requires a new approval. Recovery never resumes silently.',
  'No real model, Runner, terminal, Git, SQLite, credentials or arbitrary network is enabled.',
  '',
  'Run start.cmd on Windows 7 SP1 x64. Select a one-time test workspace and choose the A2 edit scenario.',
  'Run smoke.cmd with A2_MVP_ID set for product-entry evidence; A1 W08 probe remains under acceptance\\w08.',
  '',
].join('\n'));
writeText(path.join(outputRoot, 'start-a2.cmd'), '@echo off\r\nsetlocal\r\n"%~dp0electron\\electron.exe" "%~dp0product" --mvp-id=%A2_MVP_ID% --user-data-dir="%~dp0user-data-a2" %*\r\n');

const manifest = [];
walk(outputRoot, (filePath) => {
  const relative = path.relative(outputRoot, filePath).replace(/\\/g, '/');
  if (relative !== 'manifest.sha256') manifest.push(`${sha256(filePath)}  ${relative}`);
});
manifest.sort();
writeText(path.join(outputRoot, 'manifest.sha256'), manifest.join('\n') + '\n');
console.log(`[a2-build] wrote ${outputRoot}`);
console.log(`[a2-build] files=${manifest.length}`);

function argument(prefix) {
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}
function writeText(filePath, content) { fs.writeFileSync(filePath, content, 'utf8'); }
function sha256(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function walk(directory, callback) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(current, callback);
    else if (entry.isFile()) callback(current);
  }
}

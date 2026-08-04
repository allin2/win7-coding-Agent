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
const w06Root = path.join(outputRoot, 'acceptance', 'w06');
fs.mkdirSync(w06Root, { recursive: true });
fs.copyFileSync(path.join(scriptRoot, 'a2_w06_tamper_probe.js'), path.join(w06Root, 'main.js'));
writeText(path.join(w06Root, 'package.json'), JSON.stringify({
  name: 'a2-w06-tamper-probe',
  version: '1.0.0',
  main: 'main.js',
}, null, 2) + '\n');
const autoRoot = path.join(outputRoot, 'acceptance', 'a2-auto');
fs.mkdirSync(autoRoot, { recursive: true });
fs.copyFileSync(path.join(scriptRoot, 'a2_w07_w10_w14_w15_probe.js'), path.join(autoRoot, 'main.js'));
writeText(path.join(autoRoot, 'package.json'), JSON.stringify({
  name: 'a2-w07-w10-w14-w15-probe',
  version: '1.0.0',
  main: 'main.js',
}, null, 2) + '\n');
const w11w12Root = path.join(outputRoot, 'acceptance', 'a2-w11-w12');
fs.mkdirSync(w11w12Root, { recursive: true });
fs.copyFileSync(path.join(scriptRoot, 'a2_w11_w12_probe.js'), path.join(w11w12Root, 'main.js'));
writeText(path.join(w11w12Root, 'package.json'), JSON.stringify({
  name: 'a2-w11-w12-probe',
  version: '1.0.0',
  main: 'main.js',
}, null, 2) + '\n');
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
  'Run acceptance\\w06 with --workspace=, --report= and --mvp-id= for packaged plan/preview/session/token tamper rejection evidence.',
  'Run acceptance\\a2-auto with --workspace=, --report= and --mvp-id= for packaged W07-W10/W14/W15 automatic evidence.',
  'Run acceptance\\a2-w11-w12 with --workspace=, --report=, --w12-user-data= and --mvp-id= for packaged W11/W12 evidence; W12 remains blocked until GUI restart/restore.',
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

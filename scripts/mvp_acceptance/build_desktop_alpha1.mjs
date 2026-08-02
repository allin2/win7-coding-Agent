#!/usr/bin/env node

/**
 * Build a self-contained Desktop Alpha 1 acceptance directory.
 *
 * This script copies only generated module output, the trusted local product,
 * AJV runtime dependencies and (when available) the locked Electron runtime.
 * It never runs npm, resolves packages online, changes PATH/registry/services,
 * or includes Runner, Git, SQLite, Gateway credentials or an updater.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptRoot, '../..');
const outputRoot = path.resolve(argument('--out=') || path.join(repositoryRoot, 'outputs/desktop-alpha1'));
const electronRoot = path.resolve(argument('--electron-root=') || path.join(repositoryRoot, '.acceptance/deps/electron/extracted'));
const productRoot = path.join(repositoryRoot, 'src/shell/product');

assertDirectory(productRoot, 'src/shell/product');
assertDirectory(path.join(repositoryRoot, 'src/core/dist'), 'src/core/dist; run npm run build --prefix src/core');
assertDirectory(path.join(repositoryRoot, 'src/state/dist'), 'src/state/dist; run npm run build --prefix src/state');
assertDirectory(path.join(repositoryRoot, 'src/workspace/dist'), 'src/workspace/dist; run npm run build --prefix src/workspace');
assertDirectory(path.join(repositoryRoot, 'src/shell/dist'), 'src/shell/dist; run npm run build --prefix src/shell');

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.mkdirSync(outputRoot, { recursive: true });
copyTree(productRoot, path.join(outputRoot, 'product'));
copyTree(path.join(repositoryRoot, 'src/shell/dist'), path.join(outputRoot, 'dist'));
copyTree(path.join(repositoryRoot, 'src/core/dist'), path.join(outputRoot, 'core/dist'));
copyTree(path.join(repositoryRoot, 'src/state/dist'), path.join(outputRoot, 'state/dist'));
copyTree(path.join(repositoryRoot, 'src/workspace/dist'), path.join(outputRoot, 'workspace/dist'));
copyRuntimeDependency('ajv');

const w08Root = path.join(outputRoot, 'acceptance', 'w08');
fs.mkdirSync(w08Root, { recursive: true });
copyFile(path.join(scriptRoot, 'a1_w08_security_probe.js'), path.join(w08Root, 'main.js'));
copyFile(path.join(scriptRoot, 'a1_w08_probe.html'), path.join(w08Root, 'probe.html'));
copyFile(path.join(scriptRoot, 'a1_w08_probe.js'), path.join(w08Root, 'probe.js'));
copyFile(path.join(scriptRoot, 'a1_w08_noop_preload.js'), path.join(w08Root, 'noop-preload.js'));
writeText(path.join(w08Root, 'package.json'), JSON.stringify({
  name: 'a1-w08-security-probe',
  version: '1.0.0',
  main: 'main.js',
}, null, 2) + '\n');

if (fs.existsSync(path.join(electronRoot, 'electron.exe')) || fs.existsSync(path.join(electronRoot, 'electron'))) {
  copyTree(electronRoot, path.join(outputRoot, 'electron'));
} else {
  console.warn(`[a1-build] Electron runtime not found at ${electronRoot}; pass --electron-root=... before Win7 deployment.`);
}

writeText(path.join(outputRoot, 'start.cmd'), '@echo off\r\nsetlocal\r\n"%~dp0electron\\electron.exe" "%~dp0product" %*\r\n');
writeText(path.join(outputRoot, 'start.sh'), '#!/bin/sh\nset -eu\n"$(dirname "$0")/electron/electron" "$(dirname "$0")/product" "$@"\n');
writeText(path.join(outputRoot, 'smoke.cmd'), '@echo off\r\nsetlocal\r\n"%~dp0electron\\electron.exe" "%~dp0product" --mvp-id=%A1_MVP_ID% --smoke-report="%~dp0smoke-report.json" --user-data-dir="%~dp0user-data"\r\n');
writeText(path.join(outputRoot, 'README.txt'), [
  'Win7 Coding Agent Desktop Alpha 1',
  '',
  'Read-only Replay Alpha: Shell -> Core -> State -> Workspace.',
  'No real model, Runner, terminal, Git, SQLite, credentials or arbitrary network.',
  'Run start.cmd with the bundled Electron runtime on Windows 7 SP1 x64.',
  'Set A1_MVP_ID before smoke.cmd and keep user-data isolated for acceptance.',
  'Run acceptance\\w08 with --mvp-id=, --workspace-report= and --report= for the W08 negative probe.',
  '',
].join('\n'));

const manifest = [];
walk(outputRoot, (filePath) => {
  const relative = path.relative(outputRoot, filePath).replace(/\\/g, '/');
  if (relative === 'manifest.sha256') return;
  manifest.push(`${sha256(filePath)}  ${relative}`);
});
manifest.sort();
writeText(path.join(outputRoot, 'manifest.sha256'), manifest.join('\n') + '\n');
console.log(`[a1-build] wrote ${outputRoot}`);
console.log(`[a1-build] files=${manifest.length} electron=${fs.existsSync(path.join(outputRoot, 'electron')) ? 'included' : 'missing'}`);

function copyRuntimeDependency(name) {
  const source = path.join(repositoryRoot, 'src/shell/node_modules', name);
  if (!fs.existsSync(source)) throw new Error(`Runtime dependency is missing: ${source}`);
  copyTree(source, path.join(outputRoot, 'node_modules', name));
  const packageJson = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  for (const dependency of Object.keys(packageJson.dependencies || {})) {
    const dependencySource = path.join(repositoryRoot, 'src/shell/node_modules', dependency);
    if (fs.existsSync(dependencySource)) copyTree(dependencySource, path.join(outputRoot, 'node_modules', dependency));
  }
}

function copyTree(source, target) {
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) fs.copyFileSync(from, to);
  }
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function walk(directory, callback) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(current, callback);
    else if (entry.isFile()) callback(current);
  }
}

function writeText(filePath, content) {
  fs.writeFileSync(filePath, content, 'utf8');
}

function sha256(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

function assertDirectory(directory, label) {
  if (!fs.existsSync(directory) || !fs.statSync(directory).isDirectory()) throw new Error(`Required directory missing: ${label}`);
}

function argument(prefix) {
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}

#!/usr/bin/env node

/** Build an isolated A3 acceptance directory from the A2 pack. */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptRoot, '../..');
const outputRoot = path.resolve(argument('--out=') || path.join(repositoryRoot, 'outputs/desktop-alpha3'));
const stagingRoot = `${outputRoot}.a2-staging`;
const electronRoot = argument('--electron-root=');
const caBundle = argument('--ca-bundle=');

fs.rmSync(stagingRoot, { recursive: true, force: true });
const args = [path.join(scriptRoot, 'build_desktop_alpha2.mjs'), `--out=${stagingRoot}`];
if (electronRoot) args.push(`--electron-root=${electronRoot}`);
const result = spawnSync(process.execPath, args, { stdio: 'inherit' });
if (result.status !== 0) throw new Error(`A2 portable build failed with exit code ${result.status}`);

fs.rmSync(outputRoot, { recursive: true, force: true });
fs.renameSync(stagingRoot, outputRoot);
const acceptanceRoot = path.join(outputRoot, 'acceptance', 'a3');
fs.mkdirSync(acceptanceRoot, { recursive: true });
copyFile(path.join(scriptRoot, 'a3_controlled_probe.mjs'), path.join(acceptanceRoot, 'probe.mjs'));
copyFile(path.join(scriptRoot, 'a3_vertical_probe.mjs'), path.join(acceptanceRoot, 'vertical.mjs'));
copyFile(path.join(scriptRoot, 'a3_controlled_fixture.mjs'), path.join(acceptanceRoot, 'fixture.mjs'));
copyFile(path.join(scriptRoot, 'a3_connect_proxy.mjs'), path.join(acceptanceRoot, 'proxy.mjs'));
copyFile(path.join(scriptRoot, 'a3_win7_electron_probe.js'), path.join(acceptanceRoot, 'win7-electron-probe.js'));
copyFile(path.join(scriptRoot, 'a3_win7_gateway_probe.js'), path.join(acceptanceRoot, 'gateway-probe.js'));
copyFile(path.join(scriptRoot, 'a3_win7_replay_probe.js'), path.join(acceptanceRoot, 'replay-probe.js'));
copyFile(path.join(scriptRoot, 'a3r_win7_public_connectivity_probe.js'), path.join(acceptanceRoot, 'public-connectivity-probe.js'));
copyFile(path.join(scriptRoot, 'a3p_win7_dpapi_probe.js'), path.join(acceptanceRoot, 'dpapi-probe.js'));
if (caBundle) copyFile(caBundle, path.join(acceptanceRoot, 'ca-bundle.pem'));
writeText(path.join(acceptanceRoot, 'README.txt'), [
  'A3 controlled Gateway acceptance tools',
  '',
  'The product defaults to Replay. Gateway mode is explicit and accepts HTTP or HTTPS; HTTPS uses TLS 1.2+.',
  'fixture.mjs is an ephemeral HTTP(S) SSE server. proxy.mjs is an ephemeral HTTP CONNECT proxy.',
  'Do not place private keys, API keys or proxy passwords in this directory or in reports.',
  'The CA bundle is public material only; delete temporary CA private keys after the run.',
  '',
].join('\n'));
writeText(path.join(outputRoot, 'README.txt'), [
  'Win7 Coding Agent Desktop Alpha 3',
  '',
  'Default: Replay, no network. Explicit Gateway mode: HTTP or HTTPS; HTTPS uses TLS 1.2+ with caller-supplied CA bundle.',
  'API keys may remain process-memory only or be explicitly protected for the current Windows user with DPAPI. Proxy credentials remain memory-only.',
  'Use the isolated user-data directory and a new acceptance workspace for A3-W01..W15.',
  'Controlled fixture results are A3_CONTROLLED_GATEWAY_PASS/MVP_NETWORK_SURROGATE, not enterprise E7 PASS.',
  'A3.1 DeepSeek mode is explicit and only allows https://api.deepseek.com with a reviewed model ID.',
  'Enter the API key in the Win7 UI only. Never put it in argv, environment variables, scripts or reports.',
  'DPAPI persistence is opt-in, never auto-enables Gateway mode, and can be cleared from the settings UI.',
  'DeepSeek sends the isolated workspace context to a public service and may incur usage charges.',
  '',
].join('\n'));
writeText(path.join(outputRoot, 'start-a3r.cmd'), '@echo off\r\nsetlocal\r\n"%~dp0electron\\electron.exe" "%~dp0product" --mvp-id=A3R-20260804-01 --acceptance-event-report="%~dp0a3r-evidence\\real-model-events.json" --user-data-dir="%~dp0a3r-user-data"\r\n');
writeText(path.join(outputRoot, 'start-a3p.cmd'), '@echo off\r\nsetlocal\r\n"%~dp0electron\\electron.exe" "%~dp0product" --mvp-id=A3P-20260804-02 --user-data-dir="%~dp0a3p-user-data"\r\n');
writeText(path.join(outputRoot, 'a3p-dpapi-accept.cmd'), [
  '@echo off',
  'chcp 65001 >nul',
  'setlocal',
  'set "A3P_ROOT=%~dp0"',
  'set "A3P_EVIDENCE=%~dp0a3p-dpapi-evidence"',
  'set "A3P_USER_DATA=C:\\Win7CodingAgent\\A3P 凭据 userData 20260804 UI02"',
  'if not exist "%A3P_EVIDENCE%" mkdir "%A3P_EVIDENCE%"',
  '"%A3P_ROOT%electron\\electron.exe" "%A3P_ROOT%acceptance\\a3\\dpapi-probe.js" --phase=save --report="%A3P_EVIDENCE%\\01-save.json" --state="%A3P_EVIDENCE%\\restart-state.json" --user-data-dir="%A3P_USER_DATA%"',
  'if errorlevel 1 goto failed',
  '"%A3P_ROOT%electron\\electron.exe" "%A3P_ROOT%acceptance\\a3\\dpapi-probe.js" --phase=reload-clear --report="%A3P_EVIDENCE%\\02-reload-clear.json" --state="%A3P_EVIDENCE%\\restart-state.json" --user-data-dir="%A3P_USER_DATA%"',
  'if errorlevel 1 goto failed',
  '"%A3P_ROOT%electron\\electron.exe" "%A3P_ROOT%acceptance\\a3\\dpapi-probe.js" --phase=corrupt --report="%A3P_EVIDENCE%\\03-corrupt.json" --state="%A3P_EVIDENCE%\\restart-state.json" --user-data-dir="%A3P_USER_DATA%"',
  'if errorlevel 1 goto failed',
  'echo A3P DPAPI ACCEPTANCE PASS',
  'echo Evidence: %A3P_EVIDENCE%',
  'pause',
  'exit /b 0',
  ':failed',
  'echo A3P DPAPI ACCEPTANCE FAILED. Keep the evidence directory for diagnosis.',
  'pause',
  'exit /b 1',
  '',
].join('\r\n'));

const manifest = [];
walk(outputRoot, (filePath) => {
  const relative = path.relative(outputRoot, filePath).replace(/\\/g, '/');
  if (relative !== 'manifest.sha256') manifest.push(`${sha256(filePath)}  ${relative}`);
});
manifest.sort();
writeText(path.join(outputRoot, 'manifest.sha256'), manifest.join('\n') + '\n');
console.log(`[a3-build] wrote ${outputRoot}`);
console.log(`[a3-build] files=${manifest.length} ca_bundle=${caBundle ? 'included' : 'not-included'}`);

function argument(prefix) {
  const value = process.argv.find((item) => item.startsWith(prefix));
  return value ? value.slice(prefix.length) : undefined;
}
function writeText(filePath, content) { fs.writeFileSync(filePath, content, 'utf8'); }
function copyFile(source, target) { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(source, target); }
function sha256(filePath) { return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex'); }
function walk(directory, callback) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(current, callback);
    else if (entry.isFile()) callback(current);
  }
}

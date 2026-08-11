#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..', '..', '..', '..');
const ACCEPTANCE_ID = 'D013-RUNNER-20260811-020000';
const REMOTE_ROOT = `C:\\Win7CodingAgent\\acceptance\\${ACCEPTANCE_ID}`;
const WORK_ROOT = `${REMOTE_ROOT}\\work`;
const HELPER_SHA256 = '7f86dac89862b2c61d55fe83ba00bf7cdaa69714d24d0f9d21b62f9040d1c134';
const WHOAMI_SHA256 = 'c36cf78f2257f606ab67b14afb02dca652a3fa6907c7805efbd2d47241ee609a';
const PING_SHA256 = '14262982a64551fde126339b22b993b6e4aed520e53dd882e67d887b6b66f942';

const out = path.resolve(requiredArgument('--out='));
const helper = path.resolve(argument('--helper=') || path.join(REPO, 'native', 'helper', 'build-win10-kit', 'candidate', 'spike02_helper.exe'));
const sourceCommit = requiredArgument('--source-commit=');
if (!/^[a-f0-9]{40}$/.test(sourceCommit)) throw new Error('source commit must be a 40-character lowercase Git object ID');
if (fs.existsSync(out)) throw new Error(`output already exists: ${out}`);
if (sha256(helper) !== HELPER_SHA256) throw new Error('V24 helper hash mismatch');

fs.mkdirSync(out, { recursive: false });
copyTree(path.join(REPO, 'src', 'shell', 'product'), path.join(out, 'product'));
copyTree(path.join(REPO, 'src', 'shell', 'dist'), path.join(out, 'dist'));
for (const moduleName of ['core', 'gateway', 'runner', 'state', 'workspace']) {
  copyTree(path.join(REPO, 'src', moduleName, 'dist'), path.join(out, moduleName, 'dist'));
}
copyDependency('ajv', new Set());
copyFile(helper, path.join(out, 'spike02_helper.exe'));
copyFile(path.join(HERE, 'verify-h3-package.cjs'), path.join(out, 'verify-h3-package.cjs'));
writeText(path.join(out, 'verify-h3-package.cmd'), [
  '@echo off',
  '"C:\\acceptance\\electron\\electron.exe" "%~dp0verify-h3-package.cjs"',
  'exit /b %ERRORLEVEL%',
  '',
].join('\r\n'));

const baseProfile = {
  id: 'win7-ping',
  executable_path: 'C:\\Windows\\System32\\ping.exe',
  sha256: PING_SHA256,
  risk: 'low',
  output_encoding: 'cp936',
  working_directory_roots: [WORK_ROOT],
  acl_policy: {
    acceptance_root: 'C:\\Win7CodingAgent\\acceptance',
    per_run_root: REMOTE_ROOT,
    // H3 exercises a read-only ping profile from an interactive, non-elevated
    // desktop session. The child token remains Low Integrity; no workspace
    // write is required, so mutating the workspace label would add privilege
    // requirements unrelated to the read-only log acceptance.
    apply_low_integrity_to_work_dir: false,
  },
};
const manifests = [
  {
    filename: 'runner-h3-log-manifest.json',
    command: 'start-h3-log.cmd',
    userData: 'h3-userdata-log',
    manifest: releaseManifest('log-and-truncation', {
      ...baseProfile,
      argv_policy: { exact: [['-n', '10', '-w', '10', '127.0.0.1']] },
    }, {
      profile_id: 'win7-ping', args: ['-n', '10', '-w', '10', '127.0.0.1'], timeout_ms: 20000,
      idle_timeout_ms: 5000, max_stdout_bytes: 128, max_stderr_bytes: 64,
    }),
  },
  {
    filename: 'runner-h3-cancel-manifest.json',
    command: 'start-h3-cancel.cmd',
    userData: 'h3-userdata-cancel',
    manifest: releaseManifest('cooperative-cancel', {
      ...baseProfile,
      argv_policy: { exact: [['-t', '127.0.0.1']] },
    }, {
      profile_id: 'win7-ping', args: ['-t', '127.0.0.1'], timeout_ms: 20000,
      idle_timeout_ms: 5000, max_stdout_bytes: 65536, max_stderr_bytes: 65536,
    }),
  },
];

for (const item of manifests) {
  const manifestPath = path.join(out, item.filename);
  writeJson(manifestPath, item.manifest);
  const manifestHash = sha256(manifestPath);
  writeText(path.join(out, item.command), [
    '@echo off',
    'setlocal',
    `if not exist "${WORK_ROOT}\\h3" mkdir "${WORK_ROOT}\\h3"`,
    `"C:\\acceptance\\electron\\electron.exe" "%~dp0product" --mvp-id=H3-${ACCEPTANCE_ID} --runner-manifest="%~dp0${item.filename}" --runner-manifest-sha256=${manifestHash} --user-data-dir="%~dp0${item.userData}"`,
    '',
  ].join('\r\n'));
}

writeText(path.join(out, 'README-H3.txt'), [
  'Win7 NativeRunner H3 read-only log acceptance',
  '',
  `Acceptance root: ${REMOTE_ROOT}`,
  `Select workspace: ${WORK_ROOT}\\h3`,
  'Scenario: 非交互 Runner 验收动作（固定 profile）',
  '',
  '1. verify-h3-package.cmd: verify the complete package before launching either UI command.',
  '2. start-h3-log.cmd: verify stdout is visible, the truncation notice is visible, and the log box scrolls.',
  '3. start-h3-cancel.cmd: start the same scenario, wait for stdout, click 取消, and verify the UI reports cancelled.',
  '4. No terminal input, paste, key injection or arbitrary command field is present.',
  '5. Close each window after recording the result. The child remains Low Integrity; this read-only H3 profile does not mutate the work\\h3 label.',
  '',
].join('\r\n'));

const files = walk(out).filter((name) => name !== 'H3_PACKAGE_MANIFEST.json').map((relative) => {
  const absolute = path.join(out, relative.split('/').join(path.sep));
  return { path: relative, size: fs.statSync(absolute).size, sha256: sha256(absolute) };
});
writeJson(path.join(out, 'H3_PACKAGE_MANIFEST.json'), {
  schema_version: 1,
  package: 'WIN7_NATIVE_RUNNER_H3_READONLY_LOG',
  acceptance_id: ACCEPTANCE_ID,
  source_commit: sourceCommit,
  target: { ip: '192.168.1.11', os_build: '7601', arch: 'x64' },
  external_runtime: {
    path: 'C:\\acceptance\\electron\\electron.exe',
    sha256: '2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb',
  },
  helper_sha256: HELPER_SHA256,
  delivery: 'incremental offline H3 UI acceptance package',
  files,
});

process.stdout.write(`${JSON.stringify({
  status: 'H3_PACKAGE_READY',
  out,
  package_manifest_sha256: sha256(path.join(out, 'H3_PACKAGE_MANIFEST.json')),
  files: files.length,
}, null, 2)}\n`);

function releaseManifest(mode, profile, action) {
  return {
    schema_version: 1,
    release: `win7-native-runner-v24-h3-${mode}`,
    acceptance_id: ACCEPTANCE_ID,
    helper: { path: 'spike02_helper.exe', sha256: HELPER_SHA256 },
    profiles: [profile, {
      id: 'win7-whoami', executable_path: 'C:\\Windows\\System32\\whoami.exe', sha256: WHOAMI_SHA256,
      risk: 'low', output_encoding: 'cp936', working_directory_roots: [WORK_ROOT],
      argv_policy: { exact: [[]] }, acl_policy: profile.acl_policy,
    }],
    acceptance_action: action,
  };
}

function copyDependency(name, seen) {
  if (seen.has(name)) return;
  seen.add(name);
  const source = path.join(REPO, 'src', 'shell', 'node_modules', name);
  if (!fs.existsSync(source)) throw new Error(`runtime dependency missing: ${name}`);
  copyTree(source, path.join(out, 'node_modules', name));
  const packageJson = JSON.parse(fs.readFileSync(path.join(source, 'package.json'), 'utf8'));
  for (const dependency of Object.keys(packageJson.dependencies || {})) copyDependency(dependency, seen);
}

function copyTree(source, target) {
  if (!fs.existsSync(source) || !fs.statSync(source).isDirectory()) throw new Error(`directory missing: ${source}`);
  fs.mkdirSync(target, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const from = path.join(source, entry.name);
    const to = path.join(target, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else if (entry.isFile()) copyFile(from, to);
  }
}

function copyFile(source, target) {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
}

function walk(root, current = root) {
  const result = [];
  for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) result.push(...walk(root, absolute));
    else if (entry.isFile()) result.push(path.relative(root, absolute).split(path.sep).join('/'));
  }
  return result;
}

function sha256(filename) { return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex'); }
function writeJson(filename, value) { writeText(filename, `${JSON.stringify(value, null, 2)}\n`); }
function writeText(filename, value) { fs.mkdirSync(path.dirname(filename), { recursive: true }); fs.writeFileSync(filename, value, 'utf8'); }
function argument(prefix) { const value = process.argv.find((item) => item.startsWith(prefix)); return value ? value.slice(prefix.length) : undefined; }
function requiredArgument(prefix) { const value = argument(prefix); if (!value) throw new Error(`${prefix} is required`); return value; }

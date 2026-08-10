/**
 * prepare-kit.cjs — regenerate the D-013 Win10 build kit closure.
 *
 *   node prepare-kit.cjs
 *
 * Copies the live helper sources into src/, then rewrites input-lock.json
 * (source snapshot + kit files) and PACKAGE_MANIFEST.json (every shipped kit
 * file) with exact SHA-256 + sizes. Run it after any helper change so the
 * offline Win10 build host verifies exactly what the repository contains.
 *
 * Generated dirs (work/, output/, evidence/, result/, candidate/) are never
 * part of the manifest.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const HERE = __dirname;
const HELPER_ROOT = path.resolve(HERE, '..');
const SOURCE_COMMIT = fs.readFileSync(path.join(HERE, 'SOURCE_COMMIT.txt'), 'utf8').trim();
const SOURCE_COMMIT_TIMESTAMP = fs.readFileSync(path.join(HERE, 'SOURCE_COMMIT_TIMESTAMP.txt'), 'utf8').trim();
if (!/^[a-f0-9]{40}$/.test(SOURCE_COMMIT) || Number.isNaN(Date.parse(SOURCE_COMMIT_TIMESTAMP))) {
  throw new Error('source commit binding is invalid');
}

const SOURCES = [
  'helper.cpp', 'helper.h',
  'logic_tests.cpp',
  'json_parser.cpp', 'json_parser.h',
  'argv_builder.cpp', 'argv_builder.h',
  'whitelist.cpp', 'whitelist.h',
  'protocol.cpp', 'CMakeLists.txt',
];

const EXCLUDED_DIRS = new Set(['work', 'output', 'evidence', 'result', 'candidate']);
// Historical package sidecars live beside the kit for repository bookkeeping;
// they are not build inputs and must not be listed as shipped files. Keeping
// them out of PACKAGE_MANIFEST also prevents a hand-curated input ZIP from
// failing the Win10 manifest gate when the sidecar points to an older ZIP.
// Finder/Explorer metadata is neither a build input nor a reproducible
// deliverable. Exclude it before calculating PACKAGE_MANIFEST so a local
// directory view cannot make the manifest disagree with the handoff ZIP.
const EXCLUDED_FILE_RE = /(?:\.zip\.sha256|(?:^|\/)(?:\.DS_Store|Thumbs\.db|\._[^/]+))$/i;

function sha256File(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

function walk(dir, base) {
  const entries = [];
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    const relative = path.relative(base, full).split(path.sep).join('/');
    if (fs.statSync(full).isDirectory()) {
      if (EXCLUDED_DIRS.has(name)) continue;
      entries.push(...walk(full, base));
    } else {
      if (!EXCLUDED_FILE_RE.test(relative)) entries.push(relative);
    }
  }
  return entries;
}

// Security contract: LABEL_SECURITY_INFORMATION consumes the pSacl argument
// (the final argument), never pDacl. Keep package generation fail-closed so the
// positional PACL parameters cannot silently regress again.
const helperSource = fs.readFileSync(path.join(HELPER_ROOT, 'helper.cpp'), 'utf8');
if (!/LABEL_SECURITY_INFORMATION\s*,\s*nullptr\s*,\s*nullptr\s*,\s*nullptr\s*,\s*pLabelAcl\s*\)/.test(helperSource)) {
  throw new Error('helper.cpp must pass the mandatory-label ACL as pSacl, with pDacl null');
}
if (/TokenImpersonation\s*,\s*&hImpersonation|CreateProcessWithTokenW\s*\(/.test(helperSource) ||
    !/CreateProcessAsUserW\s*\(\s*hRestricted/.test(helperSource)) {
  throw new Error('helper.cpp must pass the verified primary restricted token to CreateProcessAsUserW');
}
if (!/CreateRestrictedToken\s*\(\s*hSource\s*,\s*DISABLE_MAX_PRIVILEGE/.test(helperSource) ||
    /privilegesToDelete/.test(helperSource)) {
  throw new Error('helper.cpp must use DISABLE_MAX_PRIVILEGE and preserve SeChangeNotifyPrivilege');
}
const childAuditIndex = helperSource.indexOf('AuditRestrictedChildToken(pi.hProcess');
const resumeIndex = helperSource.indexOf('ResumeThread(pi.hThread)');
if (childAuditIndex < 0 || resumeIndex < 0 || childAuditIndex > resumeIndex ||
    !/OpenProcessToken\s*\(\s*childProcess\s*,\s*TOKEN_QUERY/.test(helperSource) ||
    !/GetTokenInformation\s*\(\s*hChildToken\s*,\s*TokenIntegrityLevel/.test(helperSource) ||
    !/IsTokenRestricted\s*\(\s*hChildToken\s*\)/.test(helperSource) ||
    !/SECURITY_MANDATORY_LOW_RID/.test(helperSource)) {
  throw new Error('helper.cpp must audit the actual suspended child as a restricted primary Low Integrity token before ResumeThread');
}
if (!/DOMAIN_ALIAS_RID_ADMINS/.test(helperSource) ||
    /sidsToDisable\.push_back\s*\(\s*\{\s*worldSid/.test(helperSource)) {
  throw new Error('helper.cpp must make Administrators deny-only without putting Everyone/World in the deny-only list');
}
if (!/GetTokenInformation\s*\(\s*hSource\s*,\s*TokenUser/.test(helperSource) ||
    !/GetTokenInformation\s*\(\s*hSource\s*,\s*TokenGroups/.test(helperSource) ||
    !/SE_GROUP_ENABLED/.test(helperSource) ||
    !/SE_GROUP_USE_FOR_DENY_ONLY/.test(helperSource) ||
    !/WinBuiltinAdministratorsSid/.test(helperSource) ||
    !/static_cast<DWORD>\(sidsToRestrict\.size\(\)\)\s*,\s*sidsToRestrict\.data\(\)/.test(helperSource) ||
    !/ReadRestrictedSidStrings\s*\(\s*hChildToken/.test(helperSource) ||
    !/actualRestrictedSids\s*==\s*expectation\.canonicalSids/.test(helperSource) ||
    !/restrictedSidSetVerified/.test(helperSource) ||
    !/userRestrictedSid/.test(helperSource) ||
    !/administratorsRestrictedSid/.test(helperSource) ||
    /restrictedSidCount\s*==\s*1/.test(helperSource)) {
  throw new Error('helper.cpp must derive the restricting SID set from enabled source user/groups, exclude Administrators and audit exact child equality');
}
if (!/TokenGroupsSizeProbeAccepted\s*\([^;]*sizeof\s*\(\s*DWORD\s*\)\s*\)/s.test(helperSource) ||
    /TokenRestrictedSids[\s\S]{0,400}?size\s*<\s*sizeof\s*\(\s*TOKEN_GROUPS\s*\)/.test(helperSource) ||
    !/groups->GroupCount\s*==\s*0\)\s*return\s+true/.test(helperSource) ||
    !/TokenRestrictedSids returned a truncated SID array/.test(helperSource)) {
  throw new Error('helper.cpp must accept the v19 empty TokenRestrictedSids header and bounds-check non-empty arrays');
}
if (!/CurrentLabelAclMatches/.test(helperSource) ||
    !/LabelAclsEqual/.test(helperSource) ||
    !/info\.AceCount\s*==\s*0/.test(helperSource) ||
    !/CurrentDaclMatches/.test(helperSource) ||
    !/return\s+HELPER_ERR_ACL_ROLLBACK\s*;/.test(helperSource)) {
  throw new Error('helper.cpp must verify DACL restoration, Win7 LABEL null/zero-ACE equivalence, and fail closed on rollback failure');
}
const buildScript = fs.readFileSync(path.join(HERE, 'build.ps1'), 'utf8');
if (!/protectedDirectories\s*=\s*@\(\$smokeProtected\)/.test(buildScript) ||
    !/Reset-OwnedDirectory\s+\$EvidenceRoot/.test(buildScript) ||
    !/New-ReturnPackage/.test(buildScript) ||
    !/Test-ReturnPackageWriter/.test(buildScript) ||
    !/WIN7_D013_HELPER_DIAGNOSTICS_/.test(buildScript) ||
    !/schema_version\s*=\s*3/.test(buildScript) ||
    !/RETURN_PACKAGE_MANIFEST\.json/.test(buildScript) ||
    !/function\s+Invoke-Utf8ProcessBytes/.test(buildScript) ||
    !/function\s+Get-ValidatedProcessCapture/.test(buildScript) ||
    !/CopyToAsync\s*\(\s*\$stdoutBuffer\s*\)/.test(buildScript) ||
    !/\$null\s*=\s*\$stdoutTask\.GetAwaiter\(\)\.GetResult\(\)/.test(buildScript) ||
    !/\$null\s*=\s*\$stderrTask\.GetAwaiter\(\)\.GetResult\(\)/.test(buildScript) ||
    /(?:^|\n)\s*\$stdoutTask\.GetAwaiter\(\)\.GetResult\(\)/.test(buildScript) ||
    /(?:^|\n)\s*\$stderrTask\.GetAwaiter\(\)\.GetResult\(\)/.test(buildScript) ||
    !/WriteAllBytes\s*\(\s*\$StdoutPath\s*,\s*\$stdoutBytes\s*\)/.test(buildScript) ||
    !/UTF8Encoding\s*\(\s*\$false\s*,\s*\$true\s*\)/.test(buildScript) ||
    !/PROCESS_CAPTURE_SELFTEST/.test(buildScript) ||
    !/expectedCaptureMarker\s*=\s*"D013_"\s*\+\s*\[char\]0x4E2D\s*\+\s*\[char\]0x6587/.test(buildScript) ||
    !/output_object_count\s*=\s*\$captureProbeItems\.Count/.test(buildScript) ||
    !/process_capture_selftest\s*=\s*\$CaptureStatus/.test(buildScript) ||
    !/\$versionCaptureItems\s*=\s*@\(Invoke-Utf8ProcessBytes/.test(buildScript) ||
    !/\$smokeCaptureItems\s*=\s*@\(Invoke-Utf8ProcessBytes/.test(buildScript) ||
    /@\(Invoke-Utf8ProcessBytes[\s\S]{0,500}?\)\s*\[-1\]/.test(buildScript) ||
    /\$request\s*\|\s*&\s*\$helperExe/.test(buildScript) ||
    /catch\s*\{[^}]*\bexit\b/.test(buildScript)) {
  throw new Error('build.ps1 must exercise protected ACLs and preserve PASS/PARTIAL/FAIL evidence through the single return-package finalizer');
}

// 1. Snapshot the live sources.
fs.mkdirSync(path.join(HERE, 'src'), { recursive: true });
for (const source of SOURCES) {
  const from = path.join(HELPER_ROOT, source);
  if (!fs.existsSync(from)) throw new Error(`source not found: ${source}`);
  fs.copyFileSync(from, path.join(HERE, 'src', source));
}

// 2. input-lock.json: source snapshot + kit scripts.
const lockEntries = SOURCES.map((source) => {
  const file = path.join(HERE, 'src', source);
  return { path: `src/${source}`, size: fs.statSync(file).size, sha256: sha256File(file) };
});
for (const kitFile of ['build.ps1', 'build-profile.json', 'helper.exe.manifest', 'SOURCE_COMMIT.txt', 'SOURCE_COMMIT_TIMESTAMP.txt']) {
  const file = path.join(HERE, kitFile);
  lockEntries.push({ path: kitFile, size: fs.statSync(file).size, sha256: sha256File(file) });
}
const lock = {
  schema_version: 1,
  profile: 'WIN10-VS2019-V142-SDK19041-D013-HELPER-X64',
  source_commit: SOURCE_COMMIT,
  source_commit_timestamp: SOURCE_COMMIT_TIMESTAMP,
  generated_at: SOURCE_COMMIT_TIMESTAMP,
  sources: lockEntries,
};
fs.writeFileSync(path.join(HERE, 'input-lock.json'), `${JSON.stringify(lock, null, 2)}\n`, 'utf8');

// 3. PACKAGE_MANIFEST.json: every shipped kit file.
const files = walk(HERE, HERE)
  .filter((relative) => relative !== 'input-lock.json' && relative !== 'PACKAGE_MANIFEST.json')
  .map((relative) => {
    const file = path.join(HERE, relative);
    return { path: relative, size: fs.statSync(file).size, sha256: sha256File(file) };
  });
files.push({ path: 'input-lock.json', size: fs.statSync(path.join(HERE, 'input-lock.json')).size, sha256: sha256File(path.join(HERE, 'input-lock.json')) });
const manifest = {
  schema_version: 1,
  package: 'WIN10_D013_HELPER_BUILD_KIT',
  source_commit: lock.source_commit,
  source_commit_timestamp: SOURCE_COMMIT_TIMESTAMP,
  revision: new Date().toISOString().slice(0, 10),
  status: 'READY_FOR_WIN10_BUILD',
  generated_at: SOURCE_COMMIT_TIMESTAMP,
  delivery_type: 'offline Win10 build-input kit; not a Win7 runtime package',
  expected_host: 'Windows 10 x64 + VS2019/v142 + SDK 10.0.19041.0',
  excluded: ['work/', 'output/', 'evidence/', 'result/', 'candidate/'],
  files,
};
fs.writeFileSync(path.join(HERE, 'PACKAGE_MANIFEST.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

process.stdout.write(JSON.stringify({
  status: 'KIT_REFRESHED',
  sources: SOURCES.length,
  manifest_files: files.length,
  lock_hash: sha256File(path.join(HERE, 'input-lock.json')),
  manifest_hash: sha256File(path.join(HERE, 'PACKAGE_MANIFEST.json')),
}, null, 2) + '\n');

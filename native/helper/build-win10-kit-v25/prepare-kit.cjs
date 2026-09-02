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
const { execFileSync } = require('node:child_process');

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
if (!/win7-agent-helper 1\.3\.0-d013-v25 win7-x64 profiles=v1-low-risk,v2-current-user/.test(helperSource)) {
  throw new Error('helper.cpp must expose the locked v25 production version banner');
}
if (!/currentUserProfile[\s\S]*CreateProcessW\s*\(/.test(helperSource)
    || !/AuditCurrentUserChildToken\s*\(pi\.hProcess/.test(helperSource)
    || !/RenderStartedJson/.test(helperSource)
    || !/config\.deadlineEnabled/.test(helperSource)
    || !/BuildEnvironmentBlock/.test(helperSource)
    || !/ComputeFileSha256/.test(helperSource)) {
  throw new Error('helper.cpp must contain the v25 current-user, ready, no-deadline, env and shell-identity gates');
}
const shellIdentityOpenIndex = helperSource.indexOf('shellIdentityHandle = CreateFileW(');
const shellIdentityHashIndex = helperSource.indexOf('ComputeFileSha256Handle(shellIdentityHandle', shellIdentityOpenIndex);
const currentUserCreateProcessIndex = helperSource.indexOf('CreateProcessW(', shellIdentityHashIndex);
const shellIdentityCloseIndex = helperSource.indexOf('CloseHandle(shellIdentityHandle)', currentUserCreateProcessIndex);
if (!/ComputeFileSha256Handle/.test(helperSource)
    || shellIdentityOpenIndex < 0 || shellIdentityHashIndex < shellIdentityOpenIndex
    || currentUserCreateProcessIndex < shellIdentityHashIndex || shellIdentityCloseIndex < currentUserCreateProcessIndex
    || !/FILE_SHARE_READ/.test(helperSource.slice(shellIdentityOpenIndex, shellIdentityHashIndex))
    || !/v2 is NOT a security sandbox/.test(helperSource)) {
  throw new Error('helper.cpp must hold the selected Shell identity handle through launch and describe v2 honestly');
}
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
    !/SetFileSecurityW\s*\(/.test(helperSource) ||
    !/GetSecurityDescriptorControl/.test(helperSource) ||
    !/SE_DACL_AUTO_INHERITED/.test(helperSource) ||
    !/return\s+HELPER_ERR_ACL_ROLLBACK\s*;/.test(helperSource)) {
  throw new Error('helper.cpp must exactly restore DACL/control state, preserve Win7 LABEL null/zero-ACE equivalence, and fail closed on rollback failure');
}
if (!/QueryInformationJobObject\s*\(\s*nullptr\s*,\s*JobObjectExtendedLimitInformation/.test(helperSource) ||
    !/CREATE_BREAKAWAY_FROM_JOB/.test(helperSource) ||
    !/DecideHostJobLaunchMode/.test(helperSource) ||
    !/IsProcessInJob\s*\(\s*pi\.hProcess\s*,\s*nullptr\s*,\s*&childInAnyJob\s*\)/.test(helperSource) ||
    !/childJobAssignmentVerified/.test(helperSource)) {
  throw new Error('helper.cpp must fail closed on inherited Win7 Jobs unless child breakaway and reassignment are both verified');
}
const cancelPollIndex = helperSource.indexOf('PollCancellationControl(config.requestId');
const rollbackIndex = helperSource.indexOf('// ─── Cleanup: restore ACLs + labels');
if (cancelPollIndex < 0 || rollbackIndex < 0 || cancelPollIndex > rollbackIndex ||
    !/ParseCancelControl\s*\(\s*line\s*,\s*requestId/.test(helperSource) ||
    !/result->canceled\s*=\s*true/.test(helperSource) ||
    !/result->timedOut\s*\|\|\s*result->idleTimedOut\s*\|\|\s*result->canceled/.test(helperSource)) {
  throw new Error('helper.cpp must cooperatively cancel the Job and complete ACL rollback before acknowledgement');
}
const buildScript = fs.readFileSync(path.join(HERE, 'build.ps1'), 'utf8');
const inheritedNamesBlock = buildScript.match(/\$blockedInheritedNames\s*=\s*@\(([^)]*)\)/);
const inheritedNames = new Set(Array.from((inheritedNamesBlock && inheritedNamesBlock[1] || '')
  .matchAll(/['"]([A-Z][A-Z0-9_]*)['"]/g), (match) => match[1]));
const requiredInheritedNames = [
  'AZURE_OPENAI_KEY', 'CUSTOM_PROVIDER_KEY', 'NODE_EXTRA_CA_CERTS', 'SSLKEYLOGFILE',
  'NODE_DEBUG', 'NODE_DEBUG_NATIVE', 'NODE_PRESERVE_SYMLINKS', 'NODE_ICU_DATA', 'NODE_NO_WARNINGS',
];
if (requiredInheritedNames.some((name) => !inheritedNames.has(name))) {
  throw new Error('build.ps1 inherited environment smoke must include every required secret/Node/TLS control');
}
if (!/protectedDirectories\s*=\s*@\(\$smokeProtected\)/.test(buildScript) ||
    !/Reset-OwnedDirectory\s+\$EvidenceRoot/.test(buildScript) ||
    !/New-ReturnPackage/.test(buildScript) ||
    !/Test-ReturnPackageWriter/.test(buildScript) ||
    !/WIN7_D013_V25_HELPER_DIAGNOSTICS_/.test(buildScript) ||
    !/schema_version\s*=\s*3/.test(buildScript) ||
    !/run_id\s*=\s*\$BuildRunId/.test(buildScript) ||
    !/authorized_inputs\s*=\s*\[ordered\]@\{/.test(buildScript) ||
    !/input_lock_sha256/.test(buildScript) ||
    !/package_manifest_sha256/.test(buildScript) ||
    !/validation-binding\.json/.test(buildScript) ||
    !/helper_sha256\s*=/.test(buildScript) ||
    !/foreach \(\$relative in \$profile\.delivery\.evidence\)/.test(buildScript) ||
    !/exit_codes\s*=\s*\[ordered\]@\{/.test(buildScript) ||
    !/D013_FORBIDDEN_OVERLAY_VALUE/.test(buildScript) ||
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
    !/function\s+New-V25SmokeCommand/.test(buildScript) ||
    !/else if defined NODE_NO_WARNINGS \(exit \/b 49\) else echo %A9_D013_SMOKE%/.test(buildScript) ||
    !/V25 cmd smoke syntax did not reach the final marker/.test(buildScript) ||
    !/expectedCaptureMarker\s*=\s*"D013_"\s*\+\s*\[char\]0x4E2D\s*\+\s*\[char\]0x6587/.test(buildScript) ||
    !/output_object_count\s*=\s*\$captureProbeItems\.Count/.test(buildScript) ||
    !/process_capture_selftest\s*=\s*\$CaptureStatus/.test(buildScript) ||
    !/d013-cancel-smoke/.test(buildScript) ||
    !/helper cooperative cancel smoke/.test(buildScript) ||
    !/cancelAclChanges\[0\]\.rolledBack\s*-ne\s*\$true/.test(buildScript) ||
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
  let committed;
  try {
    committed = execFileSync('git', ['show', `${SOURCE_COMMIT}:native/helper/${source}`], {
      cwd: path.resolve(HELPER_ROOT, '..', '..'), encoding: 'buffer',
      maxBuffer: 16 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch (_error) {
    throw new Error(`source commit does not contain native/helper/${source}`);
  }
  const live = fs.readFileSync(from);
  if (!live.equals(committed)) {
    throw new Error(`live source is not committed at SOURCE_COMMIT: ${source}`);
  }
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
  profile: 'WIN10-VS2019-V142-SDK19041-D013-V25-CURRENT-USER-X64',
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
  package: 'WIN10_D013_V25_HELPER_BUILD_KIT',
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

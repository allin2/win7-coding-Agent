import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
const read = (name) => fs.readFileSync(new URL(`../validation/win10/${name}`, import.meta.url), 'utf8');
const bridge = read('start-ordinary-entry-bridge.ps1');
const fixture = read('ordinary-entry-fixture.ps1');
const library = fs.readFileSync(new URL('../validation/win10/start-desktop-entry-probe.ps1', import.meta.url));
const consumer = read('forensic-admission.ps1');
const bootstrap = bridge.slice(bridge.indexOf("if($bridgeMode -ceq 'Bootstrap'){"), bridge.indexOf("if($bridgeMode -ceq 'Collect'){"));
const supervise = bridge.slice(bridge.indexOf("if($bridgeMode -cne 'Supervise'){"), bridge.indexOf('}catch{$failure=$_.Exception.Message.Substring(0,[Math]::Min(1200,$_.Exception.Message.Length));if($task)'));
const manifest = bridge.slice(bridge.indexOf('function Read-BridgeManifest{'), bridge.indexOf("if($bridgeMode -ceq 'Library'){return}"));
test('launch asks the existing desktop Shell for cmd.exe with stdin redirected from NUL', () => {
  assert.match(bootstrap, /\.FindWindowSW\(/);
  assert.match(bootstrap, /\$app=\$document\.Application/);
  assert.match(bootstrap, /\.ShellExecute\('C:\\Windows\\System32\\cmd\.exe',\$arguments,\(Split-Path -Parent \$script:BridgeCmdPath\),'open',1\)/);
  assert.match(bridge, /return '\/d \/s \/c ""'\+\$cmdPath\+'" <NUL"'/);
  assert.match(bridge, /\^\[A-Za-z\]:\\\\\[\^"<>\|&\^%\\r\\n\]\+\$/);
  assert.match(bridge, /INTEGRITY_LAUNCH_PATH/);
  assert.match(bridge, /rejected_launch_paths=\$rejected/);
});
test('exactly one launch is recorded before the Shell request and a second launch is refused', () => {
  assert(bootstrap.indexOf('launch-request.json') < bootstrap.indexOf('.ShellExecute('));
  assert.match(bridge, /\[IO\.FileMode\]::CreateNew|Write-Record/);
  assert.match(supervise, /foreach\(\$name in @\('supervisor-start\.json','bootstrap-start\.json','launch-request\.json','supervisor-final\.json'\)\)\{if\(Test-Path/);
  assert.match(supervise, /INTEGRITY_OLD_ENTRY/);
  assert.match(supervise, /INTEGRITY_TASK_ALREADY_EXISTS/);
});
test('the CMD text is recomputed and must match the file byte for byte', () => {
  assert.match(manifest, /Same-Bytes \(\[IO\.File\]::ReadAllBytes\(\$cmdPath\)\) \(\[Text\.Encoding\]::ASCII\.GetBytes\(\$expected\)\)/);
  assert.match(manifest, /INTEGRITY_TARGET_BYTES/);
  assert.match(manifest, /\$t\.cmd_size -ne 578/);
  assert.match(manifest, /\$prepared\.command_sha256 -cne \$t\.cmd_sha256/);
  assert.match(manifest, /\$prepared\.binding_sha256 -cne \$t\.pin_sha256/);
  assert.match(manifest, /\$prepared\.ordinary_command -cne \$cmdPath/);
  assert.match(manifest, /CANARY_PREPARED_NOT_ADMISSION/);
});
test('the CMD template equals the one CanaryCreate produces', () => {
  const exe = '"C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "';
  assert(consumer.includes(exe));
  assert(consumer.includes("'\" -Mode Ordinary -Root \"'+$Root+'\" -PinSha256 '+$PinSha256+' -CanaryRunId '+$run+\"`r`n\"+'pause'+\"`r`n\""));
  assert(bridge.includes("$script:PowerShellExe='C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe'"));
  assert(bridge.includes("'@echo off'+\"`r`n\"+'\"'+$script:PowerShellExe+'\" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File \"'+$ps+'\" '+$arguments+\"`r`n\"+'pause'+\"`r`n\""));
  assert(bridge.includes("('-Mode Ordinary -Root \"'+$t.admission_root+'\" -PinSha256 '+$t.pin_sha256+' -CanaryRunId '+$t.run_id)"));
  const sample = new URL('../../../.acceptance/engineering-win10-entry-r1/resume-22/canarycreate-direct/run-ordinary-forensic-admission.cmd', import.meta.url);
  if (fs.existsSync(sample)) {
    const text = fs.readFileSync(sample, 'ascii');
    const m = text.match(/^@echo off\r\n"([^"]+)" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "([^"]+)" -Mode Ordinary -Root "([^"]+)" -PinSha256 ([a-f0-9]{64}) -CanaryRunId ([a-f0-9]{32})\r\npause\r\n$/);
    assert(m, 'saved CanaryCreate sample matches the template');
    assert.equal(text.length, 578);
    assert.equal(m[3], 'C:\\Users\\a9builder.WIN-2JQ66JE4HTQ\\AppData\\Local\\A9-Engineering-Win10-Entry-20261007-R4');
  }
});
test('manifest binds review, approval, frozen library, closure, expiry and roots', () => {
  assert.match(bridge, /\$script:BridgeReviewSha='5e7b954e4fff80db65c8be20f4ae13587174ab0a136320145e488559504c7874'/);
  assert.match(manifest, /\$approval\.product_execution_authorized -or \$approval\.win7_execution_authorized -or \$approval\.automatic_retry -ne 0/);
  assert.match(manifest, /\$now -ge \[DateTimeOffset\]\$m\.central_valid_until/);
  assert.match(manifest, /\$now -ge \[DateTimeOffset\]\$m\.valid_until/);
  assert.match(manifest, /INTEGRITY_LIBRARY_ROW/);
  assert.match(manifest, /\$Root -cnotin @\(\(\$script:BridgePrefix\+'B6'\),\(\$script:BridgePrefix\+'B7'\)\)/);
  assert.match(manifest, /\$phase='B'/);
  assert.doesNotMatch(manifest, /\$script:BridgePrefix\+'(?:A1|A2|B1|B2|B3)'/);
  assert.match(manifest, /\$t\.admission_root -cne \$script:AdmissionRoot/);
  assert.match(bridge, /A9-Engineering-Win10-Entry-20261007-R4/);
});
test('the helper library is the frozen R3 file and its hash is pinned before loading', () => {
  const sha = crypto.createHash('sha256').update(library).digest('hex');
  assert.equal(sha, 'a43ad2fba30efd8bea48ddf9c93ab6c083012cc94926a11cdb069004b1ccc388');
  assert.match(bridge, /\$script:LibrarySha='a43ad2fba30efd8bea48ddf9c93ab6c083012cc94926a11cdb069004b1ccc388'/);
  assert(bridge.indexOf('INTEGRITY_LIBRARY_HASH') < bridge.indexOf('. $library -Mode Library'));
  assert.match(bridge, /\$bridgeMode=\$Mode/);
});
test('the supervisor holds the exact new cmd child of the bound Explorer and rejects ambiguity', () => {
  assert.match(supervise, /\$_\.Parent -eq \$m\.explorer\.pid -and \$_\.Exe -ieq 'cmd\.exe' -and -not \$baseline\.ContainsKey/);
  assert.match(supervise, /IDENTITY_ENTRY_CMD_AMBIGUOUS/);
  assert.match(supervise, /\[A31Capture\]::Pin\(\$p,\$m\.explorer\.pid\)/);
  assert.match(supervise, /\$cmdPin\.CreationTicks -le \$permitTicks/);
  assert.match(supervise, /Assert-Ordinary \(\[A31Capture\]::Token\(\$cmdPin\.Process\)\)/);
  assert.match(supervise, /IDENTITY_ENTRY_POWERSHELL_AMBIGUOUS/);
  assert.match(supervise, /LIFECYCLE_ENTRY_CAPTURE_SHAPE/);
  assert.match(supervise, /\$capture\.Gaps\.Count -or \$capture\.Excluded\.Count/);
});
test('the pause must release without a key press and an unreleased pause is never forced', () => {
  assert.match(supervise, /LIFECYCLE_PAUSE_NOT_RELEASED/);
  assert.match(supervise, /if\(\$psGone -and \$psGone\.ElapsedMilliseconds -ge 10000 -and -not \$cmdPin\.Process\.HasExited\)\{throw 'LIFECYCLE_PAUSE_NOT_RELEASED'\}/);
  assert.match(supervise, /if\(\$psQuery\.HasExited -and -not \$psGone\)\{\$psGone=\[Diagnostics\.Stopwatch\]::StartNew\(\)\}/);
  assert.match(supervise, /\$deltaMs -lt 0 -or \$deltaMs -gt 10000/);
  assert.match(supervise, /stdin='NUL';key_press='NOT_PERFORMED'/);
  assert.match(supervise, /LIFECYCLE_ENTRY_WINDOW_EXPIRED/);
  assert.doesNotMatch(bridge + fixture, /Stop-Process|taskkill|\.Kill\(|CloseMainWindow|SendKeys|WriteConsoleInput|SendInput|keybd_event/);
});
test('exit proofs use retained handles and the consumer verdict is not judged by the bridge', () => {
  assert.match(supervise, /foreach\(\$q in \$heldQueries\)\{\$proofs\+=@\(Finish-Held \$q\)\}/);
  assert.match(supervise, /LIFECYCLE_ENTRY_EXIT_CODE/);
  assert.match(supervise, /if\(\$m\.phase -ceq 'A'\)\{\$must\+=@\(\$directPs\[0\]\.Pid\)\}/);
  assert.match(supervise, /consumer_verdict='NOT_JUDGED_BY_BRIDGE'/);
  assert.match(supervise, /ORDINARY_ENTRY_BRIDGE_LAUNCH_AND_EXIT_PASS_NOT_ADMISSION/);
  assert.match(supervise, /\$task\.Enabled=\$false/);
  assert.match(bridge, /\$outerCloseErrors=Close-ComObjects \$com/);
  assert.doesNotMatch(bridge + fixture, /catch\s*\{\s*\}/);
});
test('task is on demand, ordinary SID, no trigger, read back before Run, created only when absent', () => {
  assert.match(supervise, /RegisterTaskDefinition\(\$m\.task_name,\$definition,2,\$script:OrdinarySid/);
  assert.match(supervise, /Triggers\.Count -ne 0/);
  assert.match(supervise, /RestartCount -ne 0/);
  assert(supervise.indexOf('INTEGRITY_TASK_READBACK') < supervise.indexOf('$running=$task.Run'));
  assert.match(supervise, /-Mode Bootstrap -Root "/);
});
test('Phase B needs a real prepared CMD and phase B file closure has no fixture', () => {
  assert.match(manifest, /\$allowed=if\(\$phase -ceq 'A'\)\{\$common\+@\('control\\ordinary-entry-fixture\.ps1','control\\fixture-entry\.cmd'\)\}else\{\$common\}/);
  assert.match(manifest, /Exact-Keys \$t @\('kind','admission_root','tool_digest','pin_sha256','run_id','cmd_path','cmd_size','cmd_sha256'\)/);
  assert.match(supervise, /\[DateTime\]::UtcNow\.AddMinutes\(\$\(if\(\$m\.phase -ceq 'A'\)\{2\}elseif\(\$m\.target\.kind -ceq 'DISPATCHER'\)\{60\}else\{15\}\)\)/);
  assert.match(supervise, /if\(\$m\.phase -ceq 'A'\)\{Signal 'fixture-pinned\.json'\}/);
});
test('fixture walks the same ancestor chain, checks policy, waits for the pin and honours abort', () => {
  assert.match(fixture, /for\(\$n=0;\$n -lt 8;\$n\+\+\)/);
  assert.match(fixture, /\$token\.Sid -cne \$identity\.Sid -or \$p\.SessionId -ne \$self\.SessionId/);
  assert.match(fixture, /\^C:\\\\Windows\\\\System32\\\\\(cmd\\\.exe\|WindowsPowerShell\\\\v1\\\.0\\\\powershell\\\.exe\)\$/);
  assert.match(fixture, /\$chain\.Count -ne 2/);
  assert.match(fixture, /\$explorer\.pid -ne \$m\.explorer\.pid/);
  assert.match(fixture, /SCOPE_FIXTURE_EXECUTION_POLICY/);
  assert.match(fixture, /LIFECYCLE_FIXTURE_ABORTED/);
  assert.match(fixture, /LIFECYCLE_FIXTURE_PIN_UNKNOWN/);
  assert(fixture.indexOf('INTEGRITY_BRIDGE_ENTRY') < fixture.indexOf('. $bridge -Mode Library'));
  assert.match(fixture, /FIXTURE_CHAIN_OK_NOT_ADMISSION/);
  assert.match(consumer, /\$image -inotmatch '\^C:\\\\Windows\\\\System32\\\\\(cmd\\\.exe\|WindowsPowerShell\\\\v1\\\.0\\\\powershell\\\.exe\)\$'/);
});
test('no forbidden API, no product admission and no consumer change', () => {
  assert.doesNotMatch(bridge + fixture, /Set-ExecutionPolicy|CreateProcessAsUser|BREAKAWAY|SetParent|Add-Type|Remove-Item|Invoke-Expression|iex /);
  assert.match(bridge, /product='NOT_PERFORMED';win7='NOT_PERFORMED'/);
  assert.doesNotMatch(bridge + fixture, /-Mode (AdminQuery|Observer|CanaryVerify|CanaryCreate)|authorize-admission-start/);
  assert.match(bridge, /\$approval\.product_execution_authorized/);
});

// SURROGATE: project only the explicit root/review/phase comparisons from the
// actual PS source. This is not a PowerShell parser or a target runtime check.
function bridgeScopeProjection(ps) {
  const prefix = ps.match(/\$script:BridgePrefix='([^']+)'/)?.[1];
  const review = ps.match(/\$script:BridgeReviewSha='([a-f0-9]{64})'/)?.[1];
  const rootGate = ps.match(/if\(\$Root -(cne|ine|cnotin|inotin) ([^\r\n]+?) -or \$env:COMPUTERNAME/) ;
  assert.ok(prefix && review && rootGate, 'supported actual source root gate');
  const suffixes = [...rootGate[2].matchAll(/\$script:BridgePrefix\+'([^']+)'/g)].map(m => m[1]);
  assert.ok(suffixes.length);
  const phase = ps.match(/\$phase='([^']+)'/)?.[1];
  assert.ok(phase, 'fixed source phase');
  const body = ps.slice(ps.indexOf('function Read-BridgeManifest{'), ps.indexOf("if($bridgeMode -ceq 'Library'){return}"));
  for (const guard of [
    '$m.root -cne $Root', '$m.review_sha256 -cne $script:BridgeReviewSha',
    '$m.phase -cne $phase', '$m.version -cne $Root.Substring($Root.Length-2)',
    "$m.task_name -cne ('\\A9-Engineering02-OrdinaryBridge-20261008-'+$m.version)",
    "$approval.status -cne 'OWNER_APPROVED'", '$approval.review_sha256 -cne $script:BridgeReviewSha',
    '$approval.product_execution_authorized', '$approval.win7_execution_authorized', '$approval.automatic_retry -ne 0'
  ]) assert.ok(body.includes(guard), `source guard: ${guard}`);
  const equal = rootGate[1].startsWith('i') ? (a, b) => a.toLowerCase() === b.toLowerCase() : (a, b) => a === b;
  const roots = suffixes.map(s => prefix + s);
  return (root, manifest, approval) => {
    if (!roots.some(expected => equal(root, expected))) throw new Error('SCOPE_TARGET_ROOT_RUNTIME');
    if (manifest.root !== root || manifest.review_sha256 !== review || manifest.phase !== phase ||
        manifest.version !== root.slice(-2) || manifest.task_name !== '\\A9-Engineering02-OrdinaryBridge-20261008-' + manifest.version)
      throw new Error('INTEGRITY_MANIFEST_SCOPE');
    if (approval.status !== 'OWNER_APPROVED' || approval.review_sha256 !== review ||
        approval.product_execution_authorized || approval.win7_execution_authorized || approval.automatic_retry !== 0)
      throw new Error('SCOPE_OWNER_APPROVAL');
    return { root, phase, review };
  };
}

function exerciseB3Scope(ps) {
  const check = bridgeScopeProjection(ps);
  const prefix = 'C:\\Users\\a9builder.WIN-2JQ66JE4HTQ\\AppData\\Local\\A9-Engineering02-OrdinaryBridge-20261008-';
  const review = '5e7b954e4fff80db65c8be20f4ae13587174ab0a136320145e488559504c7874';
  for (const version of ['B6', 'B7']) {
  const root = prefix + version;
  const good = { root, version, phase: 'B', review_sha256: review, task_name: '\\A9-Engineering02-OrdinaryBridge-20261008-' + version };
  const approval = { status: 'OWNER_APPROVED', review_sha256: review, product_execution_authorized: false, win7_execution_authorized: false, automatic_retry: 0 };
  assert.deepEqual(check(root, good, approval), { root, phase: 'B', review });
  for (const badRoot of [prefix + 'A1', prefix + 'A2', prefix + 'B1', prefix + 'B2', prefix + 'B3', prefix + 'B4', prefix + 'B5', prefix + '*', prefix + '..\\' + version, root.toLowerCase(), root + '\\'])
    assert.throws(() => check(badRoot, { ...good, root: badRoot }, approval), /SCOPE_TARGET_ROOT_RUNTIME/);
  for (const bad of [
    { root: prefix + 'B1' }, { version: 'B1' }, { version: version === 'B6' ? 'B7' : 'B6' }, { phase: 'A' },
    { task_name: '\\A9-Engineering02-OrdinaryBridge-20261008-B1' },
    { review_sha256: '226b3da3fae945196022f18273e0b50f5ec39ebf27dd189632d115e44e8835b4' },
    { review_sha256: '572b8f9ae4c6315c256d6f4b0c7b91f11b5d7fa3ae19904ed7170011a8fc8a51' },
    { review_sha256: '80f38afb85ce9433d494853fd94ce4a6916ee56efdde4737d98ee2536f910c49' },
    { review_sha256: 'e501d574a9ce5a0829cf4f5600943e62870c1ca1601d6fd51102707a9194d36e' },
    { review_sha256: '5e7b3fc50e26bc553113e1445eddeab46062e1c6abd9cf5922647e2d05227d39' }
  ]) assert.throws(() => check(root, { ...good, ...bad }, approval), /INTEGRITY_MANIFEST_SCOPE/);
  for (const bad of [
    { review_sha256: '226b3da3fae945196022f18273e0b50f5ec39ebf27dd189632d115e44e8835b4' },
    { status: 'PROPOSED' }, { review_sha256: '572b8f9ae4c6315c256d6f4b0c7b91f11b5d7fa3ae19904ed7170011a8fc8a51' },
    { review_sha256: '80f38afb85ce9433d494853fd94ce4a6916ee56efdde4737d98ee2536f910c49' },
    { review_sha256: '80f38afb85ce9433d494853fd94ce4a6916ee56efdde4737d98ee2536f910c49' },
    { review_sha256: 'e501d574a9ce5a0829cf4f5600943e62870c1ca1601d6fd51102707a9194d36e' },
    { review_sha256: '5e7b3fc50e26bc553113e1445eddeab46062e1c6abd9cf5922647e2d05227d39' },
    { product_execution_authorized: true }, { win7_execution_authorized: true }, { automatic_retry: 1 }
  ]) assert.throws(() => check(root, good, { ...approval, ...bad }), /SCOPE_OWNER_APPROVAL/);
  }
}

test('B6/B7 source scope projection rejects old roots, old review/approval, wrong phase/task/version and retry permission', () => {
  exerciseB3Scope(bridge);
});

test('isolated scope mutations are caught by the same B6/B7 rejection cases', () => {
  const mutations = [
    ["($script:BridgePrefix+'B6'),($script:BridgePrefix+'B7')", "($script:BridgePrefix+'B6'),($script:BridgePrefix+'B3')"],
    ["$script:BridgeReviewSha='5e7b954e4fff80db65c8be20f4ae13587174ab0a136320145e488559504c7874'", "$script:BridgeReviewSha='80f38afb85ce9433d494853fd94ce4a6916ee56efdde4737d98ee2536f910c49'", error => error.message === 'INTEGRITY_MANIFEST_SCOPE'],
    ["$Root -cnotin @(($script:BridgePrefix+'B6')", "$Root -inotin @(($script:BridgePrefix+'B6')"],
    ["($script:BridgePrefix+'B6'),($script:BridgePrefix+'B7')", "($script:BridgePrefix+'B6'),($script:BridgePrefix+'B7'),($script:BridgePrefix+'B1')"],
    ["$phase='B'", "$phase='A'", error => error.message === 'INTEGRITY_MANIFEST_SCOPE'],
    ["$script:BridgeReviewSha='5e7b954e4fff80db65c8be20f4ae13587174ab0a136320145e488559504c7874'", "$script:BridgeReviewSha='572b8f9ae4c6315c256d6f4b0c7b91f11b5d7fa3ae19904ed7170011a8fc8a51'", error => error.message === 'INTEGRITY_MANIFEST_SCOPE'],
    ['$approval.review_sha256 -cne $script:BridgeReviewSha', '$approval.review_sha256 -cne $script:LibrarySha']
  ];
  for (const [from, to, expected = assert.AssertionError] of mutations) {
    assert.equal(bridge.split(from).length - 1, 1, 'mutation target occurs exactly once');
    assert.throws(() => exerciseB3Scope(bridge.replace(from, to)), expected, from);
  }
});

// SURROGATE: extract the directory predicate and its common call site from the
// actual PS source. Host filesystem/PowerShell behavior needs target evidence.
function directoryProjection(ps) {
  const start = ps.indexOf('function Read-BridgeManifest{');
  const end = ps.indexOf("if($bridgeMode -ceq 'Library'){return}");
  assert(start >= 0 && end > start, 'manifest function boundary');
  const body = ps.slice(start, end);
  const guard = body.match(/foreach\(\$directory in @\(([^)]+)\)\)\{\$d=Join-Path \$Root \$directory;if\(-not\(Test-Path -LiteralPath \$d -PathType Container\)\)\{throw 'INTEGRITY_ENTRY_DIRECTORY'\};Assert-Plain \$d\}/);
  assert(guard, 'plain directory predicate is in Read-BridgeManifest');
  const directories = [...guard[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  assert.deepEqual(directories, ['control', 'inputs', 'evidence', 'signals']);
  assert(body.slice(0, guard.index).endsWith("throw 'SCOPE_TARGET_ROOT_RUNTIME'}\n "), 'directory predicate is unconditional after root gate');
  assert(guard.index < body.indexOf("$path=Join-Path $Root 'inputs\\manifest.json'"), 'guard precedes manifest access');
  const common = ps.indexOf('$m=Read-BridgeManifest;Load-Capture', end);
  assert(common > end, 'shared call precedes native loading');
  for (const marker of ["if($bridgeMode -ceq 'Preflight'){", "if($bridgeMode -ceq 'Bootstrap'){", "if($bridgeMode -cne 'Supervise'){", 'RegisterTaskDefinition(']) {
    assert(ps.indexOf(marker, end) > common, `common predicate precedes ${marker}`);
  }
  const plain = library.toString('utf8');
  assert.match(plain, /function Assert-Plain\(\[string\]\$path\)/);
  assert.match(plain, /while\(\$x\)\{if\(\$x\.Attributes -band \[IO\.FileAttributes\]::ReparsePoint\)\{throw 'INTEGRITY_REPARSE'\}/);
  assert.match(plain, /\$x=if\(\$x -is \[IO\.DirectoryInfo\]\)\{\$x\.Parent\}else\{\$x\.Directory\}/);
  return layout => {
    for (const name of directories) {
      if (!layout[name]?.container) throw new Error('INTEGRITY_ENTRY_DIRECTORY');
      if (layout[name].reparse || layout[name].parentReparse) throw new Error('INTEGRITY_REPARSE');
    }
  };
}

function exerciseDirectories(ps) {
  const check = directoryProjection(ps);
  const good = Object.fromEntries(['control', 'inputs', 'evidence', 'signals'].map(name => [name, { container: true }]));
  assert.doesNotThrow(() => check(good));
  for (const name of Object.keys(good)) {
    const missing = { ...good }; delete missing[name];
    assert.throws(() => check(missing), /INTEGRITY_ENTRY_DIRECTORY/);
    assert.throws(() => check({ ...good, [name]: { container: false } }), /INTEGRITY_ENTRY_DIRECTORY/);
    assert.throws(() => check({ ...good, [name]: { container: true, reparse: true } }), /INTEGRITY_REPARSE/);
    assert.throws(() => check({ ...good, [name]: { container: true, parentReparse: true } }), /INTEGRITY_REPARSE/);
  }
}

test('common manifest entry rejects each missing/non-directory/reparse directory before native loading or task registration', () => {
  exerciseDirectories(bridge);
});

test('isolated missing, late and Preflight-only directory guards fail the same source-linked cases', () => {
  const line = " foreach($directory in @('control','inputs','evidence','signals')){$d=Join-Path $Root $directory;if(-not(Test-Path -LiteralPath $d -PathType Container)){throw 'INTEGRITY_ENTRY_DIRECTORY'};Assert-Plain $d}\n";
  assert.equal(bridge.split(line).length - 1, 1);
  const removed = bridge.replace(line, '');
  const mutations = [
    removed,
    bridge.replace("'evidence','signals'", "'evidence'"),
    removed.replace("if($bridgeMode -ceq 'Preflight'){", "if($bridgeMode -ceq 'Preflight'){\n" + line),
    removed.replace("$running=$task.Run", line + "$running=$task.Run"),
    bridge.replace(line, " if($bridgeMode -ceq 'Preflight'){\n" + line + " }\n"),
    bridge.replace(line, line.replace(';Assert-Plain $d', '')),
    bridge.replace(line, line.replace(' -PathType Container', ''))
  ];
  for (const mutated of mutations) {
    assert.notEqual(mutated, bridge, 'actual isolated source mutation');
    assert.throws(() => exerciseDirectories(mutated), assert.AssertionError);
  }
});

// SURROGATE: statement-level projection of the actual Supervise catch/finally
// text (ADR-0209). It models only the recognised statement shapes below; it is
// not a PowerShell parser and proves nothing about PS5.1 or Win10 behavior.
function skipQuoted(text, i) {
  const quote = text[i];
  let j = i + 1;
  while (j < text.length) {
    if (quote === '"' && text[j] === '`') { j += 2; continue; }
    if (text[j] === quote) { if (text[j + 1] === quote) { j += 2; continue; } return j; }
    j++;
  }
  throw new Error('unterminated quote');
}
function closing(text, open) {
  const pairs = { '{': '}', '(': ')', '[': ']' };
  const stack = [pairs[text[open]]];
  for (let i = open + 1; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"') { i = skipQuoted(text, i); continue; }
    if (pairs[c]) stack.push(pairs[c]);
    else if (c === stack[stack.length - 1]) { stack.pop(); if (!stack.length) return i; }
  }
  throw new Error('unbalanced');
}
function statements(text) {
  const out = []; let depth = 0, from = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "'" || c === '"') { i = skipQuoted(text, i); continue; }
    if ('{(['.includes(c)) depth++;
    else if ('})]'.includes(c)) depth--;
    else if (depth === 0 && (c === ';' || c === '\n')) { if (text.slice(from, i).trim()) out.push(text.slice(from, i).trim()); from = i + 1; }
  }
  if (text.slice(from).trim()) out.push(text.slice(from).trim());
  return out;
}
function splitTryCatch(stmt) {
  const tryOpen = stmt.indexOf('{'); const tryEnd = closing(stmt, tryOpen);
  const rest = stmt.slice(tryEnd + 1);
  const m = rest.match(/^\s*catch\s*\{/);
  if (!m) throw new Error('try without catch');
  const catchOpen = tryEnd + 1 + m[0].length - 1;
  return { body: stmt.slice(tryOpen + 1, tryEnd), handler: stmt.slice(catchOpen + 1, closing(stmt, catchOpen)) };
}
function cleanupSections(ps) {
  const anchor = ps.indexOf("$fixtureCheck='PASS'");
  assert(anchor > 0, 'Supervise body anchor');
  const catchAt = ps.indexOf('}catch{', anchor);
  const catchOpen = catchAt + '}catch'.length;
  const catchEnd = closing(ps, catchOpen);
  assert(ps.startsWith('finally{', catchEnd + 1), 'finally follows the Supervise catch');
  const finallyOpen = catchEnd + 1 + 'finally'.length;
  return { catchBody: ps.slice(catchOpen + 1, catchEnd), finallyBody: ps.slice(finallyOpen + 1, closing(ps, finallyOpen)) };
}
function cleanupProjection(ps) {
  const { catchBody, finallyBody } = cleanupSections(ps);
  const run = (text, ctx) => {
    for (const stmt of statements(text)) {
      if (/^try\s*\{/.test(stmt)) {
        const { body, handler } = splitTryCatch(stmt);
        try { run(body, ctx); } catch (error) { if (error.scenario !== true) throw error; ctx.err = error; run(handler, ctx); }
      } else if (/^foreach\(\$q in \$heldQueries\)\{/.test(stmt)) {
        const open = stmt.indexOf('{'); const body = stmt.slice(open + 1, closing(stmt, open));
        for (ctx.q = 0; ctx.q < ctx.scenario.held; ctx.q++) run(body, ctx);
      } else if (/^if\(/.test(stmt)) {
        const open = stmt.indexOf('{'); const cond = stmt.slice(0, open);
        const body = stmt.slice(open + 1, closing(stmt, open));
        if (/-not\(Test-Path[^)]*abort\.json/.test(cond)) { if (!ctx.scenario.abortExists) run(body, ctx); }
        else if (/-not \$failure/.test(cond)) { if (!ctx.failure) run(body, ctx); }
      } else if (stmt.includes("Signal 'abort.json'")) {
        ctx.events.push('signal');
        if (ctx.scenario.abortThrows) throw Object.assign(new Error('signal write failed'), { scenario: true });
      } else if (stmt.includes('Finish-Held $q')) {
        ctx.events.push('finish:' + ctx.q);
        if (ctx.scenario.queryThrows.includes(ctx.q)) throw Object.assign(new Error('query failed'), { scenario: true });
        ctx.proofs.push({ q: ctx.q, exit_code: 0 });
      } else if (stmt.startsWith('$proofs+=@([ordered]@{') && stmt.includes("exit_code='UNKNOWN'")) {
        ctx.proofs.push({ q: ctx.q, exit_code: 'UNKNOWN', error: ctx.err?.message });
      } else if (stmt.startsWith('$signalErrors+=')) {
        ctx.signalErrors.push(ctx.err?.message);
      } else if (stmt.startsWith('$disableErrors+=')) {
        ctx.disableErrors.push(ctx.err?.message);
      } else if (/^\$failure=/.test(stmt)) {
        if (ctx.failure) ctx.overwritten = true; else ctx.failure = ctx.scenario.original;
      } else if (stmt.includes('$task.Enabled=$false')) {
        ctx.events.push('disable');
        if (ctx.scenario.disableThrows) throw Object.assign(new Error('disable failed'), { scenario: true });
      } else if (stmt.startsWith('$close=Close-Queries')) {
        ctx.events.push('close');
      } else if (stmt.includes('supervisor-final.json')) {
        assert.match(stmt, /schema_version=2/); assert.match(stmt, /signal_errors=\$signalErrors/);
        assert.match(stmt, /exit_proofs=\$proofs/); assert.match(stmt, /close_errors=\$close/);
        ctx.final = { error: ctx.failure ?? null, signal_errors: [...ctx.signalErrors], exit_proofs: [...ctx.proofs], disable_errors: [...ctx.disableErrors] };
      }
    }
  };
  return scenario => {
    const ctx = { scenario: { held: 3, queryThrows: [], abortThrows: false, abortExists: false, disableThrows: false, original: 'LIFECYCLE_ENTRY_WINDOW_EXPIRED', ...scenario }, events: [], proofs: [], signalErrors: [], disableErrors: [], failure: null, final: null, overwritten: false };
    ctx.failure = ctx.scenario.original;
    const [first, ...cleanup] = statements(catchBody);
    assert.match(first, /^\$failure=/, 'catch starts by recording the first error');
    run(cleanup.join('\n'), ctx);
    run(finallyBody, ctx);
    return ctx;
  };
}

function exerciseCleanup(ps) {
  const exec = cleanupProjection(ps);
  const abort = exec({ abortThrows: true });
  assert.deepEqual(abort.final.exit_proofs.map(p => p.exit_code), [0, 0, 0], 'abort write failure still forensics every held object');
  assert.equal(abort.final.signal_errors.length, 1);
  assert.equal(abort.final.error, 'LIFECYCLE_ENTRY_WINDOW_EXPIRED');
  assert.equal(abort.overwritten, false);
  const query = exec({ queryThrows: [1] });
  assert.deepEqual(query.final.exit_proofs.map(p => p.exit_code), [0, 'UNKNOWN', 0], 'one failed query is UNKNOWN and later objects continue');
  assert.deepEqual(query.final.signal_errors, []);
  const both = exec({ abortThrows: true, queryThrows: [0, 2] });
  assert.deepEqual(both.final.exit_proofs.map(p => p.exit_code), ['UNKNOWN', 0, 'UNKNOWN']);
  assert.equal(both.final.signal_errors.length, 1);
  assert.equal(both.final.error, 'LIFECYCLE_ENTRY_WINDOW_EXPIRED');
  const plain = exec({});
  assert.deepEqual(plain.final.exit_proofs.map(p => p.exit_code), [0, 0, 0]);
  assert.deepEqual(plain.final.signal_errors, []);
  assert.equal(plain.final.error, 'LIFECYCLE_ENTRY_WINDOW_EXPIRED');
  const existing = exec({ abortExists: true });
  assert.deepEqual(existing.events.filter(e => e === 'signal'), []);
  for (const run of [abort, query, both, plain]) {
    const last = Math.max(...run.events.map((e, i) => e.startsWith('finish:') ? i : -1));
    assert(run.events.indexOf('close') > last, 'handles close only after every exit query was attempted');
    assert(run.final, 'supervisor-final record is written');
  }
  const disable = exec({ abortThrows: true, disableThrows: true });
  assert(disable.final, 'task disable failure does not skip the final record');
  assert.equal(disable.final.disable_errors.length, 1);
  assert.equal(disable.final.exit_proofs.length, 3);
}

test('abort-signal write failure and a failed exit query never skip the remaining held objects (ADR-0209)', () => {
  exerciseCleanup(bridge);
});

test('the final record is schema 2 with signal_errors and keeps the original error first', () => {
  const { catchBody, finallyBody } = cleanupSections(bridge);
  assert.match(bridge, /\$signalErrors=@\(\)/);
  const assignments = [...(catchBody + finallyBody).matchAll(/\$failure=/g)];
  assert(assignments.length >= 2);
  for (const hit of assignments.slice(1)) {
    const lead = (catchBody + finallyBody).slice(Math.max(0, hit.index - 80), hit.index);
    assert.match(lead, /-not \$failure\)\{$/, 'later cleanup errors never replace the first error');
  }
  assert.match(finallyBody, /\$signalErrors\.Count -and -not \$failure/);
  assert.match(bridge, /signal_errors=\$signalErrors/);
  assert.match(bridge, /exit_proofs=\$proofs;close_errors=\$close/);
  assert.match(bridge, /ORDINARY_ENTRY_BRIDGE_LAUNCH_AND_EXIT_PASS_NOT_ADMISSION/);
  assert.doesNotMatch(catchBody, /GetProcessById|\[Diagnostics\.Process\]::Get|Pin\(/, 'no re-opening of an instance by PID to sign missing proofs');
  assert.doesNotMatch(bridge + fixture, /Stop-Process|taskkill|\.Kill\(/);
});

test('review field is bound to the exact ADR-0212 diagnostic scope v2 bytes', () => {
  const scope = new URL('../../../.acceptance/engineering-win10-entry-r1/resume-38/bridge-b6-b7-diagnostic-scope-v2.json', import.meta.url);
  const field = bridge.match(/\$script:BridgeReviewSha='([a-f0-9]{64})'/)?.[1];
  assert.equal(field, '5e7b954e4fff80db65c8be20f4ae13587174ab0a136320145e488559504c7874');
  if (fs.existsSync(scope)) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(scope)).digest('hex'), field);
});

test('isolated cleanup mutations are caught by the same ADR-0209 cases', () => {
  const sig = "try{if(-not(Test-Path -LiteralPath (Join-Path $Root 'signals\\abort.json'))){Signal 'abort.json'}}";
  const mutations = [
    // signal write no longer isolated: a throw skips every exit query
    [sig, "if(-not(Test-Path -LiteralPath (Join-Path $Root 'signals\\abort.json'))){Signal 'abort.json'};try{}"],
    // exit query not isolated per object
    ['foreach($q in $heldQueries){try{$proofs+=@(Finish-Held $q)}', 'foreach($q in $heldQueries){try{}catch{};$proofs+=@(Finish-Held $q);try{}'],
    // handles closed before forensics
    [sig, '$close=Close-Queries $heldQueries;' + sig],
    // signal error replaces the first failure
    ['$signalErrors+=@(', '$failure=$_.Exception.Message;$signalErrors+=@('],
    ['signal_errors=$signalErrors', 'signal_errors=@()'],
    ['try{$task.Enabled=$false', '$task.Enabled=$false;try{']
  ];
  for (const [from, to] of mutations) {
    assert.equal(bridge.split(from).length - 1 >= 1, true, 'mutation target present: ' + from);
    const mutated = bridge.replace(from, to);
    assert.notEqual(mutated, bridge);
    assert.throws(() => exerciseCleanup(mutated), /./, from);
  }
});

// ADR-0212: B6 keeps the ORDINARY target; B7 starts only the exact v6 dispatcher CMD. Source-text checks (SURROGATE).
test('B6 maps to ORDINARY and B7 to the exact v6 dispatcher CMD; kinds cannot be swapped', () => {
  assert.ok(manifest.includes("$kind=if($Root -ceq ($script:BridgePrefix+'B6')){'ORDINARY'}else{'DISPATCHER'}"));
  assert.ok(manifest.includes("if($t.kind -cne $kind){throw 'INTEGRITY_TARGET_KIND'}"));
  assert.ok(manifest.includes("Exact-Keys $t @('kind','admission_root','tool_digest','pin_sha256','cmd_path','cmd_size','cmd_sha256')"));
  assert.ok(manifest.includes("$cmdPath=Join-Path $t.admission_root 'run-product-dispatcher-v6.cmd'"));
  assert.ok(manifest.includes("$expected=Cmd-Text (Join-Path $t.admission_root ('control\\versions\\'+$t.tool_digest+'\\launch-product-desktop.ps1')) ('-Root \"'+$t.admission_root+'\" -PinSha256 '+$t.pin_sha256)"));
  assert.ok(manifest.includes("$b.tool_identity.version -cne 'engineering-02-v6-product' -or $b.tool_identity.files_digest -cne $t.tool_digest -or $b.execution_scope.product_execution_authorized -ne $true"));
  assert.ok(manifest.includes("throw 'INTEGRITY_TARGET_DISPATCHER'"));
  assert.ok(manifest.includes("$t.cmd_size -ne 578"));
  const dispatcher = manifest.slice(manifest.indexOf("if($kind -ceq 'DISPATCHER')"), manifest.indexOf("Exact-Keys $t @('kind','admission_root','tool_digest','pin_sha256','run_id'"));
  assert.ok(dispatcher.includes('(File-Hash $bp) -cne $t.pin_sha256') && dispatcher.includes('[DateTimeOffset]::UtcNow -ge [DateTimeOffset]$a.valid_until'));
  assert.doesNotMatch(dispatcher, /forensic-admission\.ps1|canary-prepared/);
  // The CMD template is the unchanged Cmd-Text; the expected file is compared byte for byte for both kinds.
  assert.equal(manifest.split("Same-Bytes ([IO.File]::ReadAllBytes($cmdPath)) ([Text.Encoding]::ASCII.GetBytes($expected))").length - 1, 1);
});

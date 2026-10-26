import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const start = fs.readFileSync(new URL('../validation/win10/start-desktop-entry-probe.ps1', import.meta.url), 'utf8');
const controller = fs.readFileSync(new URL('../validation/win10/desktop-entry-probe.ps1', import.meta.url), 'utf8');
const bootstrap = start.slice(start.indexOf("if($Mode -ceq 'Bootstrap'){"), start.indexOf("if($Mode -ceq 'Collect'){"));
test('activation uses existing desktop Shell and fixed CMD, without arbitrary command parameters', () => {
  assert.match(bootstrap, /\.FindWindowSW\(/);
  assert.match(bootstrap, /\$document=\$desktop\.Document/);
  assert.match(bootstrap, /\$app=\$document\.Application/);
  assert.match(bootstrap, /\.ShellExecute\('C:\\Windows\\System32\\cmd\.exe'/);
  assert.match(bootstrap, /-ExecutionPolicy RemoteSigned/);
  assert.doesNotMatch(start + controller, /Set-ExecutionPolicy|CreateProcessAsUser|BREAKAWAY|SetParent|WriteConsoleInput|SendKeys|Add-Type|taskkill|Stop-Process|Remove-Item/);
});
test('bootstrap exception never relaxes ordinary controller or child identity', () => {
  assert.match(start, /\(-not \$Bootstrap -and \$i\.InJob\)/);
  assert.match(controller, /Assert-Ordinary \(\[A31Capture\]::Token\(\$selfHeld\.Process\)\)/);
  assert.match(controller, /Assert-Ordinary \(\[A31Capture\]::Token\(\$ownedHeld\.Process\)\)/);
  assert.match(controller, /\$parentRow\[0\]\.Parent -ne \$m\.explorer\.pid/);
});
test('canonical request rejects extra, duplicate, wrong nonce and whitespace on the actual PS runtime before activation', () => {
  assert.match(start, /\$text -cne \(Request-Text \$sequence\)/);
  assert.match(start, /INTEGRITY_FIXED_REQUEST_CANONICAL/);
  assert.match(start, /"schema_version":1,"schema_version":1/);
  assert.match(start, /"command":"whoami"/);
  assert.match(start, /invalid_requests_rejected=12/);
  assert.match(start, /\[IO\.File\]::Move\(\$temp/);
});
test('readback checks task principal, triggers, action and restart before Run', () => {
  assert.match(start, /RegisterTaskDefinition\(\$m\.task_name,\$definition,2,/);
  assert.match(start, /\$principalSid=Principal-Sid \$read\.Principal\.UserId/);
  assert.match(start, /\$principalSid -cne \$script:OrdinarySid/);
  assert.match(start, /Translate\(\[Security\.Principal\.SecurityIdentifier\]\)/);
  assert.match(start, /Principal\.LogonType -ne 3/);
  assert.match(start, /Principal\.RunLevel -ne 0/);
  assert.match(start, /Triggers\.Count -ne 0/);
  assert.match(start, /RestartCount -ne 0/);
  assert(start.indexOf('INTEGRITY_TASK_READBACK') < start.indexOf('$running=$task.Run'));
  assert.match(start, /\$task\.Enabled=\$false/);
});
test('early handshake retains controller instance before dependency initialization', () => {
  assert(controller.indexOf('controller-observed.json') < controller.indexOf('. $library'));
  assert.match(start, /\$controller=\[A31Capture\]::OpenQuery\(\[int\]\$observed\.instance\.pid\)/);
  assert(start.indexOf('$heldQueries+=@($controller)') < start.indexOf("Signal 'controller-observed-pinned.json'"));
});
test('same controller and all ended instances gate every next request', () => {
  assert.match(start, /\$v\.controller\.creation_ticks -cne \$controller\.StartTime\.Ticks\.ToString\(\)/);
  assert.match(start, /-not \$v\.all_instances_ended/);
  assert.match(start, /@\(\$v\.close_errors\)\.Count -ne 0/);
  assert.match(controller, /\$used\.ContainsKey\(\$request\.nonce\)/);
  assert.match(start, /LIFECYCLE_CONTROLLER_EXITED_EARLY/);
});
test('owned fixture keeps eight-second shared budget, strict stderr and original capture proof projection', () => {
  assert.match(controller, /AddSeconds\(8\)/);
  assert.match(controller, /8000-\[int\]\$budget\.ElapsedMilliseconds/);
  assert.match(controller, /\$err\.Result\.Length\)\{throw 'OWN_CHILD_STDERR'/);
  assert.match(controller, /4096/);
  assert.match(controller, /Get-OrdinaryCaptureSet \$capture \$context \$child/);
  assert.match(controller, /\[A31Capture\]::AssertSameInstance/);
  assert.match(controller, /ReadExitCode\(\)/);
});
test('failure remains failure and fixture-controlled exit17 is the only nonzero expected root exit', () => {
  assert.match(controller, /\$expectedExit=if\(\$n -eq 2\)\{17\}else\{0\}/);
  assert.match(controller, /\$row\.kind -ceq 'powershell'\)\{\$expectedExit\}else\{0\}/);
  assert.match(controller, /FIXTURE_FAILED_TREE_CONFIRMED/);
  assert.match(controller, /evidence\\first-failure\.json/);
  assert.match(controller, /evidence\\unexpected-first-failure\.json/);
});
test('exit evidence uses retained native handles and records cleanup failures', () => {
  assert.match(start, /WaitForExit\(30000\)/);
  assert.match(start, /held_query_after_exit=\$true/);
  assert.match(start, /supervisor-cleanup\.json/);
  assert.match(start, /\$outerCloseErrors=Close-ComObjects \$com/);
  assert.doesNotMatch(start + controller, /catch\s*\{\s*\}/);
});
test('COM cleanup deduplicates retained objects before releasing and never enumerates a released wrapper', () => {
  const close = start.slice(start.indexOf('function Close-ComObjects'), start.indexOf("if($Mode -ceq 'Library')"));
  assert(close.indexOf('$unique.Add($o)') < close.indexOf('ReleaseComObject'));
  assert.match(close, /ReferenceEquals\(\$unique\[\$j\],\$o\)/);
  assert.match(close, /\$errors\+=@\(\$_\.Exception\.Message\)/);
  assert.doesNotMatch(start, /\$released\+=|\$com\+=@\(/);
  assert.match(bootstrap, /\$comErrors=Close-ComObjects \$com/);
});
test('fixed roots, scope, immutable writes and no product admission are enforced', () => {
  assert.match(start, /A9-Engineering02-DesktopEntryProbe-20261008-/);
  assert.match(start, /\[IO\.FileMode\]::CreateNew/);
  assert.match(start, /\$approval\.product_execution_authorized/);
  assert.match(start, /\$approval\.win7_execution_authorized/);
  assert.match(start, /DESKTOP_ENTRY_REUSE_DIAGNOSTIC_PASS_NOT_PRODUCT_ADMISSION/);
  assert.match(controller, /AddMinutes\(15\)/);
  assert.match(controller, /for\(\$n=1;\$n -le 3;/);
});

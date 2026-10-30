# Candidate-external; PowerShell 2.0 syntax. Every stage includes its own read-only finish.
param([string]$Phase)
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\external\runtime.ps1')
$prep = Join-Path $root 't'
$work = Join-Path $root 'w'
$candidate = Join-Path $root 'p'
$code = 1
$ordinaryProved = $false
$step = 'parameter_validation'
$failureStep = ''
$failureMessage = ''
$phaseTag = 'invalid-phase'
function Escape-Json([string]$s) { return ($s -replace '\\','\\' -replace '"','\"' -replace '[\x00-\x1f]','?') }
function Safe-Message([string]$s) {
  # Never put an unclassified exception (possibly containing a secret or path) in evidence.
  if ($s -cmatch '^[A-Z][A-Z0-9_]{0,79}$') { return $s }
  return 'REDACTED_INITIALIZATION_OR_IO_FAILURE'
}
# Query-only E2 and bound-writer tracking. Phase deadline is never extended.
. (Join-Path $prep 'tools\launcher-common.ps1')
. (Join-Path $prep 'tools\writer-registry.ps1')
function Invoke-Logged([string]$exe,[string[]]$arguments,[string]$name) {
  return (Invoke-E2 $exe $arguments $name 10740)
}

try {
  if ($DispatchStages -cnotcontains $Phase) { throw 'PHASE_OUTSIDE_P1' }
  $times = $ProductPhaseSeconds
  $index = [Array]::IndexOf($ProductStages,$Phase)
  if ($index -lt 0) { throw 'PHASE_OUTSIDE_P1' }
  $script:PhaseEnd = (Ticks) + [long]($times[$index] * $Frequency)
  $script:ExitSeen = @{}
  [void][IO.Directory]::CreateDirectory((Join-Path $work 'observed'))
  $script:RegistryFile = Join-Path $work ('observed\' + $Phase + '-registry.jsonl')
  $traceRoot = Join-Path $root 'trace'
  [void][IO.Directory]::CreateDirectory($traceRoot)
  $script:TraceFile = Join-Path $traceRoot ($Phase + '-wait.jsonl')
  New-TraceFile $script:TraceFile
  Trace 'STARTED' '{"source":"task","first_event":true}'
  $script:TaskInstance = Instance $PID
  $allowed = $ProductStages
  if ($allowed -cnotcontains $Phase) { throw 'PHASE_OUTSIDE_P1' }
  $phaseTag = $Phase
  $step = 'attempt_latch'
  [void][System.IO.Directory]::CreateDirectory((Join-Path $work 'attempts'))
  $claim = [System.IO.File]::Open((Join-Path $work ('attempts\' + $Phase + '.started')),[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
  $claim.Close()
  if (Test-Path -LiteralPath (Join-Path $root 'e\rehearsal-stop.json')) { throw 'PREVIOUS_EXTERNAL_FAILURE' }
  $step = 'environment'
  $env:APPDATA = Join-Path $root 'd\profile\Roaming'
  $env:LOCALAPPDATA = Join-Path $root 'd\profile\Local'
  $env:TEMP = Join-Path $root 'd\tmp'
  $env:TMP = $env:TEMP
  $env:WIN7AGENT_A9_DATAROOT = Join-Path $root 'd\product'
  $env:WIN7AGENT_PORTABLE = '0'
  $env:ELECTRON_RUN_AS_NODE = '1'
  if (Test-Path Env:\NODE_OPTIONS) { Remove-Item Env:\NODE_OPTIONS }
  foreach ($dir in @($env:APPDATA,$env:LOCALAPPDATA,$env:TEMP,$env:WIN7AGENT_A9_DATAROOT,(Join-Path $work 'observed'),(Join-Path $work 'logs'))) {
    [void][System.IO.Directory]::CreateDirectory($dir)
  }
  Set-Location -LiteralPath $work
  $step = 'identity_api_load'
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class RehearsalIdentity {
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool IsProcessInJob(IntPtr p, IntPtr j, out bool value);
  [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();
  [DllImport("kernel32.dll")] public static extern uint WTSGetActiveConsoleSessionId();
  [DllImport("wtsapi32.dll", SetLastError=true)] public static extern bool WTSQuerySessionInformation(IntPtr s, int id, int c, out IntPtr b, out int n);
  [DllImport("wtsapi32.dll")] public static extern void WTSFreeMemory(IntPtr b);
}
"@
  $step = 'ordinary_identity'
  $id = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($id)
  $elevated = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
  $session = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
  $console = [RehearsalIdentity]::WTSGetActiveConsoleSessionId()
  $groups = (& whoami.exe /groups /fo csv /nh) -join "`n"
  if ($LASTEXITCODE -ne 0 -or $groups -notmatch 'S-1-16-8192') { throw 'MEDIUM_NOT_PROVED' }
  $inJob = $false
  $jobQueryOk = $false
  $jobAttempts = 0
  $jobLastError = 0
  while ((-not $jobQueryOk) -and ($jobAttempts -lt 5)) {
    $jobAttempts = $jobAttempts + 1
    if (($jobAttempts % 2) -eq 1) { $jobHandle = [System.Diagnostics.Process]::GetCurrentProcess().Handle } else { $jobHandle = [RehearsalIdentity]::GetCurrentProcess() }
    $jobQueryOk = [RehearsalIdentity]::IsProcessInJob($jobHandle,[IntPtr]::Zero,[ref]$inJob)
    if (-not $jobQueryOk) { $jobLastError = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error(); Start-Sleep -Milliseconds 300 }
  }
  $jobText = '{"attempts":' + $jobAttempts + ',"last_error":' + $jobLastError + ',"query_ok":' + $jobQueryOk.ToString().ToLower() + '}'
  [System.IO.File]::WriteAllText((Join-Path $work ('observed\' + $Phase + '-injob.json')),$jobText,(New-Object System.Text.UTF8Encoding($false)))
  if (-not $jobQueryOk) { throw 'IN_JOB_UNKNOWN' }
  $buffer = [IntPtr]::Zero
  $count = 0
  if (-not [RehearsalIdentity]::WTSQuerySessionInformation([IntPtr]::Zero,$session,8,[ref]$buffer,[ref]$count)) { throw 'CONSOLE_STATE_UNKNOWN' }
  try {
    if ($count -lt 4 -or [System.Runtime.InteropServices.Marshal]::ReadInt32($buffer) -ne 0) { throw 'CONSOLE_NOT_ACTIVE' }
  } finally { [RehearsalIdentity]::WTSFreeMemory($buffer) }
  $lockRows = @(Get-WmiObject -Class Win32_Process -Filter "Name='LogonUI.exe'" -ErrorAction Stop | Where-Object { $_.SessionId -eq $session })
  if ($lockRows.Count -ne 0) { throw 'CONSOLE_LOCKED' }
  if ($elevated -or $session -ne $console -or $session -ne $TargetSession -or $session -lt 1) { throw 'ORDINARY_ACTIVE_CONSOLE_REQUIRED' }
  $ordinaryProved = $true
  $userData = Join-Path $env:LOCALAPPDATA 'Win7CodingAgent'
  $when = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  $text = '{"machine_name":"' + (Escape-Json ([System.Environment]::MachineName)) + '","account_sid":"' + $id.User.Value + '","integrity_level":"Medium","session_id":' + $session + ',"active_console_session_id":' + $console + ',"console_state":"Active","logonui_present":false,"elevated":false,"process_id":' + $PID + ',"in_job":' + $inJob.ToString().ToLower() + ',"in_job_attempts":' + $jobAttempts + ',"in_job_last_error":' + $jobLastError + ',"observed_at_utc":"' + $when + '","product_user_data":"' + (Escape-Json $userData) + '"}'
  $observed = Join-Path $work ('observed\' + $Phase + '.json')
  [System.IO.File]::WriteAllText($observed,$text + "`n",(New-Object System.Text.UTF8Encoding($false)))
  # B: measure a separate child using the controller's exact executable, flags,
  # E2 direct cmd and redirections. Never guess or flip an approved value.
  $controllerExe = Join-Path $PSHOME 'powershell.exe'
  $controllerFlags = @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File')
  $step = 'controller_launch_probe'
  if ((Invoke-Logged $controllerExe ($controllerFlags + @((Join-Path $prep 'tools\controller-injob-probe.ps1'),'-Phase',$Phase)) 'controller-probe') -ne 0) { throw 'CONTROLLER_PROBE_FAILED' }
  $step = 'issue_request'
  $electron = Join-Path $candidate 'electron.exe'
  if ((Invoke-Logged $electron @((Join-Path $prep 'tools\issue-request.cjs'),$prep,$Phase,$observed) 'issue') -ne 0) { throw 'REQUEST_GATE_REFUSED' }
  $request = Join-Path $work ('requests\' + $Phase + '.json')
  $step = 'controller'
  if ((Invoke-Logged $controllerExe ($controllerFlags + @((Join-Path $candidate 'validation\a9-batch2-desktop-controller.ps1'),'-Action','Run','-RequestFile',$request)) 'controller') -ne 0) { throw 'CONTROLLER_NONZERO' }
  $code = 0
} catch { $failureStep = $step; $failureMessage = Exception-Detail $_ }
finally {
  Trace 'finally_entry' '{}'
  if ($ordinaryProved) {
    try {
      Wait-Writers 20
      Trace 'finish_start' '{}'
      if ((Invoke-Logged (Join-Path $candidate 'electron.exe') @((Join-Path $prep 'tools\issue-request.cjs'),'finish',$prep,$Phase) 'finish') -ne 0) { throw 'FINISH_NONZERO' }
      Wait-Writers 20
      Trace 'outer_return' '{}'
    } catch { Trace 'finish_failure' ('{"detail":' + (J (Exception-Detail $_)) + '}'); $code = 1; if ($failureStep -eq '') { $failureStep = 'finish'; $failureMessage = Exception-Detail $_ } }
  }
  # Write done first, so a done-write failure also enters the same immutable stop latch.
  try {
    [void][System.IO.Directory]::CreateDirectory($work)
    if ($failureMessage -match 'WRITERS_NOT_QUIESCENT') { throw 'WRITERS_NOT_QUIESCENT' }
    [System.IO.File]::WriteAllText((Join-Path $work ($phaseTag + '.done')),([string]$code),(New-Object System.Text.UTF8Encoding($false)))
    Trace 'done_write' ('{"exit_code":' + $code + '}')
  } catch { $code = 1; if ($failureStep -eq '') { $failureStep = 'done'; $failureMessage = 'DONE_WRITE_FAILED' }; [Console]::Error.WriteLine('DONE_WRITE_FAILED_ADMIN_MUST_LATCH_STOP') }
  Close-Observers
  if ($code -ne 0) {
    try {
      [void][System.IO.Directory]::CreateDirectory((Join-Path $root 'e'))
      $stopFile = Join-Path $root 'e\rehearsal-stop.json'
      $stop = [System.IO.File]::Open($stopFile,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
      try {
        $text = '{"evidence_class":"' + $EvidenceClass + '","halted":true,"phase":"' + $phaseTag + '","step":"' + (Escape-Json $failureStep) + '","message":"' + (Escape-Json $failureMessage) + '"}'
        $raw = (New-Object System.Text.UTF8Encoding($false)).GetBytes($text + "`n")
        $stop.Write($raw,0,$raw.Length)
      } finally { $stop.Close() }
    } catch { [Console]::Error.WriteLine('STOP_MARKER_WRITE_FAILED_OR_ALREADY_EXISTS') }
  }
}
exit $code

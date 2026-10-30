# Ordinary agent entry; one diagnostic GUI. Never a product request.
param([string]$Phase)
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\external\runtime.ps1')
$env:TEMP = Join-Path $root 'd\tmp'; $env:TMP = $env:TEMP
$runId = $RunId
$work = Join-Path $root 'w'; $prep = Join-Path $root 't'
$candidate = Join-Path $root 'p'
$phaseTag = 'gpu-entry-gate'; $code = 1; $complete = $false; $identityComplete = $false
. (Join-Path $prep 'tools\launcher-common.ps1')
. (Join-Path $prep 'tools\writer-registry.ps1')
. (Join-Path $prep 'tools\gpu-cleanup.ps1')
$script:TaskInstance = Instance $PID
$anchorTick = Ticks; $anchorUtc = [DateTime]::UtcNow
$taskUtc = [Management.ManagementDateTimeConverter]::ToDateTime($script:TaskInstance.CreationDate).ToUniversalTime()
$startupSeconds = ($anchorUtc - $taskUtc).TotalSeconds
if ($startupSeconds -lt 0 -or $startupSeconds -ge 118) { throw 'GATE_TASK_AGE_UNKNOWN' }
$begin = $anchorTick - [long]($startupSeconds * $Frequency)
$script:PhaseEnd = $begin + [long](80 * $Frequency)
$cleanupEnd = $begin + [long](100 * $Frequency)
$sealEnd = $begin + [long](118 * $Frequency)
$script:ExitSeen = @{}
$area = Join-Path $root 'e\gpu-entry-gate'
try {
  if ($DispatchStages -cnotcontains $Phase) { throw 'PHASE_OUTSIDE_P1' }
  if ($Phase -cne $GateStage) { throw 'GATE_PHASE_MISMATCH' }
  [void][IO.Directory]::CreateDirectory((Join-Path $work 'attempts'))
  Write-Once (Join-Path $work 'attempts\gpu-entry-gate.started') ('{"ordinal":' + ($GateStageIndex + 1) + ',"product_request":false}')
  [void][IO.Directory]::CreateDirectory($area)
  [void][IO.Directory]::CreateDirectory((Join-Path $root 'trace'))
  $script:TraceFile = Join-Path $root 'trace\gpu-entry-gate-wait.jsonl'
  New-TraceFile $script:TraceFile
  Trace 'STARTED' '{"stage":"gpu-entry-gate","product_request":false}'
  $script:RegistryFile = Join-Path $work 'observed\gpu-entry-gate-registry.jsonl'
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($id)
  $groups = (& whoami.exe /groups /fo csv /nh) -join "`n"
  if ($LASTEXITCODE -ne 0 -or $id.User.Value -cne 'S-1-5-21-1708701742-428676696-1831205153-1001' -or $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) -or $groups -notmatch 'S-1-16-8192') { throw 'GATE_ORDINARY_IDENTITY_UNKNOWN' }
  $session = [Diagnostics.Process]::GetCurrentProcess().SessionId
  Load-LauncherNative
  if ($session -lt 1 -or $session -ne [RehearsalLauncherNative]::WTSGetActiveConsoleSessionId()) { throw 'GATE_CONSOLE_UNKNOWN' }
  if (@(Get-WmiObject Win32_Process -Filter "Name='LogonUI.exe'" -ErrorAction Stop | Where-Object { $_.SessionId -eq $session }).Count -ne 0) { throw 'GATE_CONSOLE_LOCKED' }
  if ($session -ne $TargetSession) { throw 'GPU_SIGNED_SESSION_MISMATCH' }
  Write-Once (Join-Path $area 'task-identity.json') ('{"machine_name":' + (J ([Environment]::MachineName)) + ',"account_sid":' + (J $id.User.Value) + ',"session_id":' + $session + ',"instance":' + (Instance-Json $script:TaskInstance $false) + '}')
  $profile = Join-Path $root 'd\gpu-entry-gate-profile'
  if (Test-Path -LiteralPath $profile) { throw 'GATE_PROFILE_NOT_EMPTY' }
  $env:APPDATA = Join-Path $profile 'Roaming'; $env:LOCALAPPDATA = Join-Path $profile 'Local'; $env:TEMP = Join-Path $profile 'tmp'; $env:TMP = $env:TEMP
  foreach ($dir in @($env:APPDATA,$env:LOCALAPPDATA,$env:TEMP)) { [void][IO.Directory]::CreateDirectory($dir) }
  $env:ELECTRON_RUN_AS_NODE = '1'
  if (Test-Path Env:\NODE_OPTIONS) { Remove-Item Env:\NODE_OPTIONS }
  if (Test-Path Env:\NODE_PATH) { Remove-Item Env:\NODE_PATH }
  $electron = Join-Path $candidate 'electron.exe'
  if ((Invoke-E2 $electron @((Join-Path $prep 'tools\gpu-contract.cjs'),'prepare',$prep,([string]$session),([Environment]::MachineName)) 'gate-prepare' 80) -ne 0) { throw 'GATE_PREPARE_REFUSED' }
  $identityComplete = $true
  $captureCode = Invoke-E2 $electron @((Join-Path $prep 'payload\capturer.js'),$root,$runId,'gpu-entry-gate') 'capturer' 80
  Trace 'capture_return' ('{"exit_code":' + $captureCode + '}')
} catch {
  try { Write-Once (Join-Path $area 'FIRST_FAILURE.json') ('{"kind":"GATE_FIRST_FAILURE","detail":' + (J (Exception-Detail $_)) + '}') } catch { [Console]::Error.WriteLine('GATE_FIRST_FAILURE_NOT_WRITTEN') }
} finally {
  Trace 'finally_entry' '{}'
  try {
    Cleanup-Gate $cleanupEnd
    foreach ($key in @($script:Registered.Keys)) {
      $known = $script:Registered[$key]
      if ($known.ExecutablePath -ieq (Join-Path $root 'e\driver-electron\electron.exe') -and $known.CommandLine -notmatch '\s--type=') {
        $exitFact = $script:ExitFacts[$key]
        if ($null -ne $exitFact) { Write-Once (Join-Path $area 'gui-os-exit.json') ('{"pid":' + $known.ProcessId + ',"creation_date":' + (J $known.CreationDate) + ',"os_exit_utc":' + (J $exitFact.Utc) + ',"exit_code":' + $exitFact.Code + '}') }
      }
    }
    $complete = $true
  } catch { Trace 'cleanup_unknown' ('{"detail":' + (J (Exception-Detail $_)) + '}') }
  try {
    Write-Once (Join-Path $area 'cleanup-proof.json') ('{"complete":' + (B $complete) + ',"identity_complete":' + (B $identityComplete) + ',"registered_instances":' + $script:Registered.Count + ',"termination_scope":"EXACT_REGISTERED_INSTANCES_ONLY"}')
    Close-Observers
    $sealSeconds = [Math]::Min(20,[Math]::Floor((Seconds-Left $sealEnd)))
    if ($sealSeconds -lt 1) { throw 'GATE_SEAL_NO_BUDGET' }
    $script:PhaseEnd = $sealEnd
    if ((Invoke-E2 (Join-Path $candidate 'electron.exe') @((Join-Path $prep 'tools\gpu-contract.cjs'),'evaluate',$prep) 'gate-evaluate' ([int]$sealSeconds)) -eq 0 -and $complete) { $code = 0 }
    # Wait-Writers clamps its 3-second allowance to PhaseEnd (task age 118s).
    Wait-Writers 3
    if ((Ticks) -ge $script:PhaseEnd) { throw 'GATE_SEAL_NO_BUDGET' }
    Write-Once (Join-Path $work 'gpu-entry-gate.done') ([string]$code)
    Trace 'done_write' ('{"exit_code":' + $code + '}')
  } catch { Trace 'gate_seal_unknown' ('{"detail":' + (J (Exception-Detail $_)) + '}') }
  finally { Close-Observers }
}
exit $code

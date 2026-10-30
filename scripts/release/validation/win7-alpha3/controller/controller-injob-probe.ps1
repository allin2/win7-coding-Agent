# Ordinary controller child for every full-plan dispatch stage; no product launch or request issuance.
# Must be invoked with the exact controller executable/flags/Invoke-Logged path.
param([string]$Phase)
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\external\runtime.ps1')
. (Join-Path $root 't\tools\launcher-common.ps1')
$destination = $null
$record = '{"schema_version":2,"kind":"A9_39_CONTROLLER_LAUNCH_PROBE","query_ok":false,"in_job":null,"error":"CONTROLLER_PROBE_QUERY_FAILED"}'
$code = 1
try {
  if ($DispatchStages -cnotcontains $Phase) { throw 'PHASE_OUTSIDE_P1' }
  $destination = Join-Path $root ('w\observed\' + $Phase + '-controller-probe.json')
  Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class RehearsalControllerProbe {
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool IsProcessInJob(IntPtr p, IntPtr j, out bool value);
  [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();
}
"@
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
  $elevated = $principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
  $session = [System.Diagnostics.Process]::GetCurrentProcess().SessionId
  $groups = (& whoami.exe /groups /fo csv /nh) -join "`n"
  if ($LASTEXITCODE -ne 0 -or $groups -notmatch 'S-1-16-8192' -or $elevated) { throw 'MEDIUM_NOT_PROVED' }
  $self = @(Get-WmiObject Win32_Process -Filter ('ProcessId=' + $PID) -ErrorAction Stop)
  if ($self.Count -ne 1 -or $self[0].ParentProcessId -lt 1) { throw 'PARENT_PID_UNKNOWN' }
  $inJob = $false
  $jobQueryOk = $false
  $jobAttempts = 0
  $jobLastError = 0
  while ((-not $jobQueryOk) -and ($jobAttempts -lt 5)) {
    $jobAttempts = $jobAttempts + 1
    if (($jobAttempts % 2) -eq 1) { $jobHandle = [System.Diagnostics.Process]::GetCurrentProcess().Handle } else { $jobHandle = [RehearsalControllerProbe]::GetCurrentProcess() }
    $jobQueryOk = [RehearsalControllerProbe]::IsProcessInJob($jobHandle, [IntPtr]::Zero, [ref]$inJob)
    if (-not $jobQueryOk) {
      $jobLastError = [System.Runtime.InteropServices.Marshal]::GetLastWin32Error()
      Start-Sleep -Milliseconds 300
    }
  }
  if ($jobQueryOk) { $jobText = $inJob.ToString().ToLower() } else { $jobText = 'unknown' }
  $jobJson = 'null'; if ($jobQueryOk) { $jobJson = $jobText }
  # Machine name and SID are bounded OS identity strings, not arbitrary user text.
  $machine = ([Environment]::MachineName).Replace('\','\\').Replace('"','\"')
  $utc = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ')
  $cmdRow = Instance ([int]$self[0].ParentProcessId)
  $taskRow = Instance ([int]$cmdRow.ParentProcessId)
  if ($cmdRow.ExecutablePath -ine (Join-Path $env:SystemRoot 'System32\cmd.exe')) { throw 'CMD_IMAGE_MISMATCH' }
  if ([Management.ManagementDateTimeConverter]::ToDateTime($taskRow.CreationDate) -ge [Management.ManagementDateTimeConverter]::ToDateTime($cmdRow.CreationDate) -or [Management.ManagementDateTimeConverter]::ToDateTime($cmdRow.CreationDate) -ge [Management.ManagementDateTimeConverter]::ToDateTime($self[0].CreationDate)) { throw 'CHAIN_CREATION_ORDER' }
  $chain = '{"schema":"launcher-chain-v2","purpose":"controller-probe","observed_at_utc":' + (J $utc) + ',"task":' + (Instance-Json $taskRow $false) + ',"cmd":' + (Instance-Json $cmdRow $true) + ',"child":' + (Instance-Json $self[0] $false) + '}'
  $record = '{"schema_version":2,"kind":"A9_39_CONTROLLER_LAUNCH_PROBE","launcher":"launcher-chain-v2","phase":"' + $Phase + '","query_ok":' + $jobQueryOk.ToString().ToLowerInvariant() + ',"machine_name":"' + $machine + '","account_sid":"' + $identity.User.Value + '","integrity_level":"Medium","elevated":false,"session_id":' + $session + ',"process_id":' + $PID + ',"parent_process_id":' + $self[0].ParentProcessId + ',"in_job":' + $jobJson + ',"in_job_attempts":' + $jobAttempts + ',"in_job_last_error":' + $jobLastError + ',"observed_at_utc":"' + $utc + '","chain":' + $chain + '}'
  if (-not $jobQueryOk) { throw 'IN_JOB_UNKNOWN' }
  $code = 0
} catch { [Console]::Error.WriteLine(('CONTROLLER_LAUNCH_PROBE_FAILED:' + (Exception-Detail $_))) }
finally {
  if ($null -ne $destination) {
    try {
      $stream = [System.IO.File]::Open($destination,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
      try { $bytes = (New-Object System.Text.UTF8Encoding($false)).GetBytes($record + "`n"); $stream.Write($bytes,0,$bytes.Length) } finally { $stream.Close() }
    } catch { $code = 1; [Console]::Error.WriteLine('CONTROLLER_PROBE_EVIDENCE_WRITE_FAILED') }
  }
}
exit $code

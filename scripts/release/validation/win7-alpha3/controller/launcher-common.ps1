# Rehearsal4 E2; ASCII, PowerShell 2 syntax. No general termination API.
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Frequency = [Diagnostics.Stopwatch]::Frequency
function J($value) {
  if ($null -eq $value) { return 'null' }
  $text = [string]$value
  $text = $text.Replace('\','\\')
  $text = $text.Replace('"','\"')
  $text = $text.Replace("`t",'\t')
  $text = $text.Replace("`r",'\r')
  $text = $text.Replace("`n",'\n')
  for ($c = 0; $c -lt 32; $c++) { if ($c -ne 9 -and $c -ne 10 -and $c -ne 13) { $text = $text.Replace(([string][char]$c),('\u00' + $c.ToString('X2'))) } }
  return ('"' + $text + '"')
}
function B($value) { if ($null -eq $value) { return 'null' }; if ($value) { return 'true' }; return 'false' }
function Ticks { return [System.Diagnostics.Stopwatch]::GetTimestamp() }
function Same-CreationTicks([long]$a, [long]$b) { return ([Math]::Abs(([decimal]$a - [decimal]$b)) -le 100) }
function Seconds-Left([long]$end) { return ([double]($end - (Ticks)) / $Frequency) }
function Safe([string]$file) {
  $current = [System.IO.Path]::GetFullPath($file)
  while ($null -ne $current) {
    $attr = $null
    try { $attr = [System.IO.File]::GetAttributes($current) } catch {
      $cause = $_.Exception
      while ($null -ne $cause.InnerException) { $cause = $cause.InnerException }
      if (-not ($cause -is [System.IO.FileNotFoundException]) -and -not ($cause -is [System.IO.DirectoryNotFoundException])) { throw }
    }
    if ($null -ne $attr -and ($attr -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'REPARSE_POINT' }
    $current = [System.IO.Path]::GetDirectoryName($current)
  }
}
function Exception-Detail($record) {
  $inner = $record.Exception; $savedDetail = ''
  while ($null -ne $inner) {
    if ($inner.Data.Contains('A9Detail')) { $savedDetail = [string]$inner.Data['A9Detail'] }
    if ($null -eq $inner.InnerException) { break }; $inner = $inner.InnerException
  }
  $message = [string]$inner.Message
  if ($message -imatch '(?:Authorization\s*:\s*Bearer|sk-[A-Za-z0-9_-]{20}|-----BEGIN .*PRIVATE KEY|(?:password|passwd|api[_-]?key|secret|credential)\s*[:=])') { $message = '[REDACTED_CREDENTIAL_PATTERN]' }
  $message = [regex]::Replace($message,'"[^"]*"|''[^'']*''','[DATA]')
  $message = [regex]::Replace($message,'(?i)(?:[a-z]:[\\/]|\\\\|/|\.\.?[\\/])[\s\S]*','[PATH]')
  $message = [regex]::Replace($message,'[\x00-\x1F\x7F-\x9F]','')
  $message = [regex]::Replace($message,'[^\x20-\x7E]','?')
  if ($message.Length -gt 200) { $message = $message.Substring(0,200) }
  $line = 0; if ($null -ne $record.InvocationInfo) { $line = [int]$record.InvocationInfo.ScriptLineNumber }
  if ($savedDetail.Length -gt 0) { return $savedDetail }
  $detail = [regex]::Replace(($inner.GetType().FullName + ':' + $line + ':' + $message),'[^\x20-\x7E]','?')
  if ($detail.Length -gt 300) { $detail = $detail.Substring(0,300) }
  return $detail
}
function Load-LauncherNative {
  if ('RehearsalLauncherNative' -as [type]) { return }
  Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class RehearsalLauncherNative {
 [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, uint pid);
 [DllImport("kernel32.dll", SetLastError=true)] public static extern bool IsProcessInJob(IntPtr p, IntPtr j, out bool value);
 [DllImport("kernel32.dll")] public static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll")] public static extern uint WTSGetActiveConsoleSessionId();
}
'@
}
function Launcher-Job([int]$processId) {
  Load-LauncherNative
  $success = 0; $value = $null; $samples = @(); $conflict = $false
  for ($i = 1; $i -le 5; $i++) {
    $native = [IntPtr]::Zero; $process = $null; $actual = $false; $ok = $false; $err = 0
    try {
      if (($i % 2) -eq 1) { $process = [Diagnostics.Process]::GetProcessById($processId); $handle = $process.Handle }
      elseif ($processId -eq $PID) { $handle = [RehearsalLauncherNative]::GetCurrentProcess() }
      else { $native = [RehearsalLauncherNative]::OpenProcess(4096,$false,$processId); $handle = $native }
      if ($handle -ne [IntPtr]::Zero) { $ok = [RehearsalLauncherNative]::IsProcessInJob($handle,[IntPtr]::Zero,[ref]$actual) }
      if ($ok) { $success++; if ($null -eq $value) { $value = $actual } elseif ($value -ne $actual) { $conflict = $true } }
      else { $err = [Runtime.InteropServices.Marshal]::GetLastWin32Error() }
    } catch { $err = -1 }
    finally { if ($native -ne [IntPtr]::Zero) { [void][RehearsalLauncherNative]::CloseHandle($native) }; if ($null -ne $process) { $process.Dispose() } }
    $samples += ('{"attempt":' + $i + ',"handle_kind":' + (J $(if (($i % 2) -eq 1) { 'Process.Handle' } else { 'NativeQueryHandle' })) + ',"query_ok":' + (B $ok) + ',"in_job":' + $(if ($ok) { B $actual } else { 'null' }) + ',"last_error":' + $err + '}')
  }
  if ($success -eq 0 -or $conflict) { $value = $null }
  return (New-Object PSObject -Property @{Value=$value;Json=('{"in_job":' + (B $value) + ',"successes":' + $success + ',"conflict":' + (B $conflict) + ',"samples":[' + ($samples -join ',') + ']}')})
}
function Instance([int]$processId) {
  $rows = @(Get-WmiObject Win32_Process -Filter ('ProcessId=' + $processId) -ErrorAction Stop)
  if ($rows.Count -ne 1) { throw 'INSTANCE_UNKNOWN' }
  $p = $rows[0]
  if ([string]$p.CreationDate -cnotmatch '^\d{14}\.\d{6}[+-]\d{3}$' -or [string]::IsNullOrEmpty($p.ExecutablePath) -or [string]::IsNullOrEmpty($p.CommandLine)) { throw 'PROCESS_FIELDS_UNKNOWN' }
  return $p
}
function Instance-Json($p,[bool]$withCommand) {
  $job = Launcher-Job ([int]$p.ProcessId)
  $extra = ''; if ($withCommand) { $extra = ',"command_line":' + (J $p.CommandLine) }
  return ('{"pid":' + $p.ProcessId + ',"ppid":' + $p.ParentProcessId + ',"creation_date":' + (J $p.CreationDate) + ',"image_path":' + (J $p.ExecutablePath) + $extra + ',"job":' + $job.Json + '}')
}
function Cmd-Path([string]$value) {
  if ($value.Length -lt 1 -or $value.Length -gt 240 -or $value -match '[\x00-\x1f\x7f"&|<>^%!()]' -or $value.EndsWith('\')) { throw 'CMD_UNSAFE_INPUT' }
  return ('"' + $value + '"')
}
function E2-Arguments([string]$exe,[string[]]$arguments,[string]$stdout,[string]$stderr) {
  if ($arguments.Count -gt 32) { throw 'ARGUMENT_BOUND' }
  $words = @((Cmd-Path $exe)); foreach ($arg in $arguments) { $words += (Cmd-Path $arg) }
  return ('/d /s /c "' + ($words -join ' ') + ' >' + (Cmd-Path $stdout) + ' 2>' + (Cmd-Path $stderr) + '"')
}
function New-Direct([string]$exe,[string]$arguments) {
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $exe; $info.Arguments = $arguments; $info.WorkingDirectory = $work
  $info.UseShellExecute = $false; $info.CreateNoWindow = $true
  $p = New-Object Diagnostics.Process; $p.StartInfo = $info
  if (-not $p.Start()) { $p.Dispose(); throw 'PROCESS_START_FAILED' }
  return $p
}
function New-TraceFile([string]$file) {
  Safe $file
  $f = New-Object IO.FileStream($file,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  try { $f.Flush() } finally { $f.Close() }
}
function Write-Once([string]$file,[string]$text) {
  Safe $file
  $temporary = $file + '.tmp-' + $PID
  Safe $temporary
  $bytes = $Utf8.GetBytes($text + "`n")
  if ($bytes.Length -gt 65536) { throw 'PROOF_BOUND' }
  $f = New-Object IO.FileStream($temporary,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  try { $f.Write($bytes,0,$bytes.Length); $f.Flush() } finally { $f.Close() }
  # Move fails if the final name exists. Failed temporary files remain evidence; never overwritten/deleted.
  [System.IO.File]::Move($temporary,$file)
}
# Reserve 128 lines/128 KiB for <=64 controlled-launch/finally/done events.
# Samples after 8000 lines or 1.5 MiB are recorded every 100 samples (sampling stays 200ms).
$script:TraceCount = 0; $script:TraceBytes = 0; $script:TraceStopped = $false; $script:PreviousTick = Ticks
$script:PreviousCallTick = $script:PreviousTick; $script:SamplesSinceWritten = 0; $script:MaxCallInterval = 0
$script:TraceSamples = 0; $script:TraceTruncated = $false; $script:TraceFailureReported = $false
$script:TraceReserveLines = 128; $script:TraceReserveBytes = 131072
function Trace([string]$event,[string]$data) {
  try {
    if ($null -eq $script:TraceFile -or $script:TraceStopped) { return }
    $tick = Ticks; $interval = [double]($tick - $script:PreviousTick) * 1000 / $Frequency; $callInterval = [double]($tick - $script:PreviousCallTick) * 1000 / $Frequency
    $script:PreviousCallTick = $tick
    if ($callInterval -gt $script:MaxCallInterval) { $script:MaxCallInterval = $callInterval }
    $critical = @('STARTED','invoke_before','cmd_spawn','os_exit_observed','cmd_exit','wait_return','invoke_timeout','finally_entry','finish_start','outer_return','done_write','writers_quiescent','cleanup_unknown','gate_seal_unknown') -ccontains $event
    if ($event -ceq 'wait_sample') {
      $script:TraceSamples++; $script:SamplesSinceWritten++
      if (($script:TraceCount -ge 8000 -or $script:TraceBytes -ge 1572864) -and (($script:TraceSamples % 100) -ne 0)) { return }
    }
    $line = '{"schema":"wait-trace-v3","event":' + (J $event) + ',"pid":' + $PID + ',"utc":' + (J ([DateTime]::UtcNow.ToString('o'))) + ',"ticks":' + (J ([string]$tick)) + ',"frequency":' + (J ([string]$Frequency)) + ',"clock_domain":' + (J ('ps-' + $PID)) + ',"actual_interval_ms":' + $interval.ToString('0.###',[Globalization.CultureInfo]::InvariantCulture) + ',"call_interval_ms":' + $callInterval.ToString('0.###',[Globalization.CultureInfo]::InvariantCulture) + ',"samples_since_last_written":' + $script:SamplesSinceWritten + ',"max_interval_ms_since_last_written":' + $script:MaxCallInterval.ToString('0.###',[Globalization.CultureInfo]::InvariantCulture) + ',"target_ms":200,"lower_bound_only":true,"sample_ordinal":' + $script:TraceSamples + ',"data":' + $data + '}' + "`n"
    $bytes = $Utf8.GetBytes($line)
    if ($bytes.Length -gt 4096) { $line = '{"schema":"wait-trace-v3","event":' + (J $event) + ',"detail":"TRUNCATED_LINE"}' + "`n"; $bytes = $Utf8.GetBytes($line) }
    $softFull = ($script:TraceCount -ge (12000 - $script:TraceReserveLines) -or $script:TraceBytes + $bytes.Length -gt (2097152 - $script:TraceReserveBytes))
    if (-not $critical -and $softFull) {
      if ($script:TraceTruncated) { return }
      $line = '{"schema":"wait-trace-v3","event":"TRUNCATED","reason":"NONCRITICAL_BOUND"}' + "`n"; $bytes = $Utf8.GetBytes($line); $script:TraceTruncated = $true
    }
    if ($script:TraceCount -ge 12000 -or $script:TraceBytes + $bytes.Length -gt 2097152) { throw 'TRACE_HARD_BOUND' }
    $f = $null
    try { $f = New-Object IO.FileStream($script:TraceFile,[IO.FileMode]::Append,[IO.FileAccess]::Write,[IO.FileShare]::Read); $f.Write($bytes,0,$bytes.Length); $f.Flush() } finally { if ($null -ne $f) { $f.Close() } }
    $script:TraceCount++; $script:TraceBytes += $bytes.Length
    $script:PreviousTick = $tick; $script:SamplesSinceWritten = 0; $script:MaxCallInterval = 0
  } catch {
    # Trace is best effort and must never escape finally or change a phase result.
    $script:TraceStopped = $true
    if (-not $script:TraceFailureReported) { $script:TraceFailureReported = $true; try { [Console]::Error.WriteLine('TRACE_WRITE_FAILED') } catch {} }
  }
}

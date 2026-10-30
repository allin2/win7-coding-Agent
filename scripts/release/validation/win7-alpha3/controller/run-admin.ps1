# Pinned stdin glue, PowerShell 2.0/.NET builtins. Invoked inside one outer & { ... } statement.
function Invoke-RehearsalAdmin([string]$Step,[string]$Phase,[string]$Rows,[bool]$Owned,[string]$DeletePhases) {
  $script:AdminStartTick = [Diagnostics.Stopwatch]::GetTimestamp()
  $ErrorActionPreference = 'Stop'
  [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
  $root = $script:BoundRoot
  $Session = $script:BoundSession; $TaskPrefix = $script:BoundTaskPrefix
  $work = Join-Path $root 'w'
  # Query helpers are embedded in the stdin closure; no file upload at R1.
# Rehearsal4 E2; ASCII, PowerShell 2 syntax. No general termination API.
$Utf8 = New-Object System.Text.UTF8Encoding($false)
$Frequency = [Diagnostics.Stopwatch]::Frequency
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

  $prep = Join-Path $root 't'
  $admin = Join-Path $prep 'tools\admin-materials.ps1'
  $phases = $script:BoundDispatch
  $RequestDirectories = @(); $productIndex = 0
  foreach ($p in $phases) { if ($p -cne 'gpu-entry-gate') { $productIndex++; $RequestDirectories += ($productIndex.ToString('00') + '-' + $p) } }
  # @ENVIRONMENT_PROCESS_PS@
  $global:LASTEXITCODE = 0
  function J($v) {
    if ($null -eq $v) { return 'null' }
    $text = [string]$v
    $text = $text.Replace('\','\\')
    $text = $text.Replace('"','\"')
    $text = $text.Replace("`t",'\t')
    $text = $text.Replace("`r",'\r')
    $text = $text.Replace("`n",'\n')
    for ($code = 0; $code -lt 32; $code++) {
      if ($code -eq 9 -or $code -eq 10 -or $code -eq 13) { continue }
      $text = $text.Replace(([string][char]$code),('\u00' + $code.ToString('X2',[System.Globalization.CultureInfo]::InvariantCulture)))
    }
    return ('"' + $text + '"')
  }
  function Emit([string]$s) { [Console]::WriteLine($s) }
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
  function Transfer-Path([string]$file) {
    if ($file -cne [IO.Path]::GetFullPath($file) -or $file -match '[\x00-\x1f*?"<>|/]' -or $file.Substring(2).Contains(':') -or -not $file.StartsWith(($root + '\'),[StringComparison]::Ordinal)) { throw 'TRANSFER_PATH' }
    foreach ($part in $file.Substring(($root + '\').Length).Split('\')) {
      if ($part -eq '' -or $part -eq '.' -or $part -eq '..' -or $part.EndsWith('.') -or $part.EndsWith(' ')) { throw 'TRANSFER_PATH' }
    }
    Safe $file
  }
  function Hash([string]$file) {
    Safe $file
    $f = [System.IO.File]::OpenRead($file); $h = [System.Security.Cryptography.SHA256]::Create()
    try { return [BitConverter]::ToString($h.ComputeHash($f)).Replace('-','').ToLowerInvariant() } finally { $h.Dispose(); $f.Close() }
  }
  function B64([string]$file) { Safe $file; return [Convert]::ToBase64String([System.IO.File]::ReadAllBytes($file)) }
  function Scheduler { $svc = New-Object -ComObject 'Schedule.Service'; $svc.Connect(); return $svc.GetFolder('\') }
  function Related([bool]$excludeEnvironment = $false) {
    $allRelated = @(Get-WmiObject Win32_Process -ErrorAction Stop | Where-Object {
      ($_.ExecutablePath -and $_.ExecutablePath.StartsWith(($root + '\'),[StringComparison]::OrdinalIgnoreCase)) -or
      ($_.CommandLine -and $_.CommandLine.IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0)
    })
    if (-not $excludeEnvironment) { return $allRelated }
    $script:RelatedEnvironment = @($allRelated | Where-Object { Test-EnvironmentProcess $_.ExecutablePath })
    return @($allRelated | Where-Object { -not (Test-EnvironmentProcess $_.ExecutablePath) })
  }
  function Assert-NoRegisteredWriters([int]$seconds) {
    $end = (Ticks) + [long]($seconds * $Frequency)
    $script:EnvironmentReadback = @{}
    $observed = Join-Path $work 'observed'
    if (-not (Test-Path -LiteralPath $observed)) { return }
    # One snapshot for the entire ledger, never a WMI request per historical row.
    $searcher = New-Object Management.ManagementObjectSearcher
    $searcher.Query = New-Object Management.ObjectQuery 'SELECT * FROM Win32_Process'
    $searcher.Options.Timeout = [TimeSpan]::FromSeconds(2)
    try { $all = @($searcher.Get()) } finally { $searcher.Dispose() }
    $index = @{}; foreach ($p in $all) { $id = [string]$p.ProcessId; if ($index.ContainsKey($id)) { throw 'PID_AMBIGUOUS' }; $index[$id] = $p }
    $count = 0; $totalBytes = 0
    foreach ($file in @(Get-ChildItem -LiteralPath $observed -Filter '*-registry.jsonl' -ErrorAction Stop)) {
      Safe $file.FullName
      $totalBytes += $file.Length
      if ($totalBytes -gt 25178112) { throw 'REGISTRY_BOUND' }
      $reader = New-Object IO.StreamReader($file.FullName,$Utf8)
      try {
        while ($null -ne ($line = $reader.ReadLine())) {
          if ((Ticks) -ge $end) { throw 'REGISTRY_READ_DEADLINE' }
          $count++; if ($count -gt 12288 -or $Utf8.GetByteCount($line) -gt 2048) { throw 'REGISTRY_ROW_BOUND' }
          $pidMatch = [regex]::Match($line,'"pid":([1-9][0-9]*)')
          $dateMatch = [regex]::Match($line,'"creation_date":"(\d{14}\.\d{6}[+-]\d{3})"')
          if (-not $pidMatch.Success -or -not $dateMatch.Success) { throw 'REGISTRY_UNKNOWN' }
          $p = $index[$pidMatch.Groups[1].Value]
          $environmentKey = $pidMatch.Groups[1].Value + '|' + $dateMatch.Groups[1].Value
          if (($null -eq $p -or [string]$p.CreationDate -cne $dateMatch.Groups[1].Value) -and $line -match '"role":"environment"' -and -not $script:EnvironmentReadback.ContainsKey($environmentKey)) {
            $imageMatch = [regex]::Match($line,'"image_path":("(?:[^"\\]|\\.)*"|null)')
            $parentMatch = [regex]::Match($line,'"ppid":([0-9]+)')
            $imageJson = 'null'; if ($imageMatch.Success) { $imageJson = $imageMatch.Groups[1].Value }
            $parentJson = 'null'; if ($parentMatch.Success) { $parentJson = $parentMatch.Groups[1].Value }
            $endedEnvironmentRow = ('{"ok":true,"schema":"environment-process-v1","policy":"ADR-0256","role":"environment","state":"ENVIRONMENT_GENERATION_ENDED","pid":' + $pidMatch.Groups[1].Value + ',"ppid":' + $parentJson + ',"creation_date":' + (J $dateMatch.Groups[1].Value) + ',"image_path":' + $imageJson + ',"os_exit_observed":"UNKNOWN","generation_end_observed":true}')
            $script:EnvironmentReadback[$environmentKey] = $endedEnvironmentRow; Emit $endedEnvironmentRow
          }
          # A reused PID is not the registered generation and cannot write for it.
          if ($null -ne $p -and [string]$p.CreationDate -ceq $dateMatch.Groups[1].Value) {
            if (Test-EnvironmentProcess $p.ExecutablePath) {
              $environmentRow = Environment-Record $p 'ENVIRONMENT_STILL_LIVE'
              if (-not $script:EnvironmentReadback.ContainsKey($environmentKey)) { $script:EnvironmentReadback[$environmentKey] = $environmentRow; Emit $environmentRow }
              continue
            }
            $zombie = ($null -ne $p.ThreadCount -and [int]$p.ThreadCount -eq 0 -and [string]::IsNullOrEmpty($p.CommandLine) -and [string]::IsNullOrEmpty($p.ExecutablePath))
            if (-not $zombie) { throw 'WRITERS_NOT_QUIESCENT' }
          }
        }
      } finally { $reader.Close() }
    }
    if ((Ticks) -ge $end) { throw 'REGISTRY_READ_DEADLINE' }
  }
  function Run-Lock([string]$operation) {
    # Existing v1 four-line lock protocol. No steal, close, parent ACL change or foreign-token release.
    $file = 'C:\A9-DEV\LOCK'; Safe $file
    $stream = [IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
    try {
      if ($stream.Length -gt 4096) { throw 'LOCK_FORMAT_UNKNOWN' }
      $bytes = New-Object byte[] ([int]$stream.Length); $read = $stream.Read($bytes,0,$bytes.Length)
      $rows = $Utf8.GetString($bytes).Replace("`r`n","`n").Split("`n")
      if ($read -ne $bytes.Length -or $rows.Length -ne 5 -or $rows[0] -cne '1' -or $rows[1] -cne $script:BoundHolder -or $rows[4] -cne '') { throw 'LOCK_NOT_OWNED_OR_FORMAT_UNKNOWN' }
      if ($operation -ceq 'idle') {
        if ($rows[3] -cne '') { throw 'FOREIGN_LOCK_NO_RELEASE' }; return
      }
      if ($operation -ceq 'assert') {
        if ($rows[3] -cne $script:BoundRunId) { throw 'RUN_LOCK_NOT_OWNED' }; return
      }
      if ($operation -ceq 'acquire') {
        if ($rows[3] -cne '') { throw 'LOCK_NOT_IDLE' }; $token = $script:BoundRunId
      } elseif ($operation -ceq 'release') {
        if ($rows[3] -ceq '') { return }
        if ($rows[3] -cne $script:BoundRunId) { throw 'FOREIGN_LOCK_NO_RELEASE' }; $token = ''
      } else { throw 'LOCK_OPERATION' }
      $text = '1' + "`n" + $script:BoundHolder + "`n" + [DateTime]::UtcNow.ToString('o') + "`n" + $token + "`n"
      $bytes = $Utf8.GetBytes($text); $stream.Position = 0; $stream.SetLength(0); $stream.Write($bytes,0,$bytes.Length); $stream.Flush()
      if ($operation -ceq 'acquire') { $script:RunLockStream = $stream; $stream = $null }
    } finally { if ($null -ne $stream) { $stream.Close() } }
  }
  function R7-Seal {
    Assert-NoRegisteredWriters 12
    if (@(Related $true).Count -ne 0) { throw 'WRITERS_NOT_QUIESCENT' }
    $exe = Join-Path $root 'p\electron.exe'
    $env:ELECTRON_RUN_AS_NODE = '1'
    if (Test-Path Env:\NODE_OPTIONS) { Remove-Item Env:\NODE_OPTIONS }
    if (Test-Path Env:\NODE_PATH) { Remove-Item Env:\NODE_PATH }
    $stdout = Join-Path $work 'r7-seal-stdout.json'; $stderr = Join-Path $work 'r7-seal-stderr.json'
    $args = E2-Arguments $exe @((Join-Path $prep 'tools\trace-seal.cjs'),$prep) $stdout $stderr
    $cmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
    $cmd = $null; $scanner = $null
    try {
      $cmd = New-Direct $cmdExe $args; $null = $cmd.Handle
      $cmdRow = Instance $cmd.Id
      if ($cmdRow.ExecutablePath -ine $cmdExe -or $cmdRow.CommandLine -cne ((Cmd-Path $cmdExe) + ' ' + $args) -or [int]$cmdRow.ParentProcessId -ne $PID) { throw 'SEAL_CMD_INSTANCE' }
      $end = (Ticks) + [long](30 * $Frequency)
      if ($end -gt $script:R7Start + [long](42 * $Frequency)) { $end = $script:R7Start + [long](42 * $Frequency) }
      $scannerDate = $null; $scannerId = 0
      while (-not $cmd.HasExited) {
        if ($null -eq $scanner) {
          $children = @(Get-WmiObject Win32_Process -Filter ('ParentProcessId=' + $cmd.Id) -ErrorAction Stop | Where-Object { $_.ExecutablePath -ieq $exe })
          if ($children.Count -gt 1) { throw 'SEAL_CHILD_AMBIGUOUS' }
          if ($children.Count -eq 1) { $scannerId = [int]$children[0].ProcessId; $scannerDate = [string]$children[0].CreationDate; $scanner = [Diagnostics.Process]::GetProcessById($scannerId); $null = $scanner.Handle }
        }
        if ((Ticks) -ge $end) { throw 'SEAL_SCANNER_TIMEOUT_NO_TERMINATION' }
        Start-Sleep -Milliseconds 200
      }
      if ($null -eq $scanner -or -not $scanner.HasExited -or $cmd.ExitCode -ne 0 -or $scanner.ExitCode -ne 0) { throw 'SEAL_SCANNER_NOT_PROVED' }
      $left = @(Get-WmiObject Win32_Process -Filter ('ProcessId=' + $scannerId) -ErrorAction Stop)
      if ($left.Count -ne 0) {
        if ($left.Count -ne 1 -or [string]$left[0].CreationDate -cne $scannerDate -or $null -eq $left[0].ThreadCount -or [int]$left[0].ThreadCount -ne 0 -or -not [string]::IsNullOrEmpty($left[0].CommandLine) -or -not [string]::IsNullOrEmpty($left[0].ExecutablePath)) { throw 'SEAL_SCANNER_INSTANCE_REMAINS' }
      }
    } finally { if ($null -ne $scanner) { $scanner.Dispose() }; if ($null -ne $cmd) { $cmd.Dispose() } }
  }
  function Read-Admission([bool]$lockHeld = $false) {
      $os = @(Get-WmiObject Win32_OperatingSystem -ErrorAction Stop)
      if ($os.Count -ne 1 -or $os[0].BuildNumber -cne '7601' -or $os[0].Version -notmatch '^6\.1\.' -or $os[0].ServicePackMajorVersion -ne 1 -or $os[0].OSArchitecture -notmatch '64') { throw 'WIN7_SP1_X64_REQUIRED' }
      $addresses = @(Get-WmiObject Win32_NetworkAdapterConfiguration -Filter 'IPEnabled=True' -ErrorAction Stop | ForEach-Object { $_.IPAddress })
      if ($addresses -cnotcontains '192.168.1.9') { throw 'TARGET_IP_NOT_PRESENT' }
      Safe $root
      if (Test-Path -LiteralPath $root) { throw 'NEW_ROOT_EXISTS' }
      Safe 'C:\A9-DEV\LOCK'
      if ($lockHeld) {
        if ($null -eq $script:RunLockStream) { throw 'LOCK_HANDLE_REQUIRED' }
      } else {
      $lockFile = New-Object IO.FileInfo 'C:\A9-DEV\LOCK'
      if (-not $lockFile.Exists -or $lockFile.Length -gt 4096) { throw 'LOCK_MISSING_OR_OVERSIZE' }
      $lockRows = [IO.File]::ReadAllLines($lockFile.FullName,$Utf8)
      if ($lockRows.Length -ne 4 -or $lockRows[0] -cne '1' -or $lockRows[1] -cne $script:BoundHolder -or $lockRows[3] -cne '') { throw 'LOCK_NOT_IDLE_OR_NOT_HELD' }
      }
      [long]$devUsed = 0; $devFiles = 0; $devDirs = @('C:\A9-DEV'); $devCursor = 0
      $devSizeEnd = (Ticks) + [long](10 * $Frequency)
      while ($devCursor -lt $devDirs.Count) {
        if ((Ticks) -ge $devSizeEnd -or $devDirs.Count -gt 65536) { throw 'CHANNEL_CAPACITY_UNKNOWN' }
        $devDir = $devDirs[$devCursor]; $devCursor++; Safe $devDir
        foreach ($item in @(Get-ChildItem -LiteralPath $devDir -Force -ErrorAction Stop)) {
          if ((Ticks) -ge $devSizeEnd) { throw 'CHANNEL_CAPACITY_UNKNOWN' }
          Safe $item.FullName
          if ($item.PSIsContainer) { $devDirs += $item.FullName }
          else { $devFiles++; if ($devFiles -gt 262144) { throw 'CHANNEL_CAPACITY_UNKNOWN' }; $devUsed += $item.Length }
          if ($devUsed -gt 20000000000) { throw 'CHANNEL_CAPACITY_LIMIT' }
        }
      }
      $channelExists = [bool](Test-Path -LiteralPath 'C:\A9-DEV' -ErrorAction Stop)
      $runExists = [bool](Test-Path -LiteralPath 'C:\A9-DEV\run' -ErrorAction Stop)
      foreach ($parent in @('C:\A9-DEV','C:\A9-DEV\run')) {
        Safe $parent
        if ((Test-Path -LiteralPath $parent) -and -not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'PARENT_NOT_DIRECTORY' }
      }
      $console = $null; $found = 0
      $table = @(& "$env:SystemRoot\System32\qwinsta.exe" console 2>&1)
      if ($LASTEXITCODE -ne 0) { throw 'QWINSTA_NONZERO' }
      $activeChinese = ([string][char]0x8fd0) + ([string][char]0x884c) + ([string][char]0x4e2d)
      foreach ($line in $table) {
        if ([string]$line -match '^\s*>?\s*console\s+(\S+)\s+(\d+)\s+(\S+)(?:\s+.*)?$') {
          $found = $found + 1
          if ($matches[1] -ine 'agent' -and $matches[1] -ine ([Environment]::MachineName + '\agent')) { throw 'AGENT_NOT_CONSOLE' }
          $console = [int]$matches[2]
          if ($console -lt 1 -or ($console -ne $Session) -or ($matches[3] -ine 'Active' -and $matches[3] -cne $activeChinese)) { throw 'CONSOLE_NOT_SIGNED_ACTIVE_SESSION' }
        }
      }
      if ($found -ne 1) { throw 'CONSOLE_ROW_NOT_UNIQUE' }
      $owners = 0
      foreach ($proc in @(Get-WmiObject Win32_Process -Filter "Name='explorer.exe'" -ErrorAction Stop)) {
        if ($proc.SessionId -eq $console) {
          $owner = $proc.GetOwner(); if ($owner.ReturnValue -ne 0) { throw 'OWNER_QUERY_FAILED' }
          if ($owner.User -ieq 'agent' -and $owner.Domain -ieq [Environment]::MachineName) { $owners = $owners + 1 }
        }
      }
      if ($owners -lt 1) { throw 'CONSOLE_OWNER_NOT_PROVED' }
      $locks = @(Get-WmiObject Win32_Process -Filter "Name='LogonUI.exe'" -ErrorAction Stop | Where-Object { $_.SessionId -eq $console })
      if ($locks.Count -ne 0) { throw 'CONSOLE_LOCKED' }
      $tasks = @((Scheduler).GetTasks(1) | Where-Object { $_.Name.StartsWith('A9-DEV-',[StringComparison]::OrdinalIgnoreCase) })
      $related = @(Get-WmiObject Win32_Process -ErrorAction Stop | Where-Object {
        ($_.ExecutablePath -and $_.ExecutablePath.StartsWith('C:\A9-DEV\',[StringComparison]::OrdinalIgnoreCase)) -or
        ($_.CommandLine -and $_.CommandLine.IndexOf('C:\A9-DEV\',[StringComparison]::OrdinalIgnoreCase) -ge 0)
      })
      if ($tasks.Count -ne 0 -or $related.Count -ne 0) { throw 'PREEXISTING_RUN_TASK_OR_PROCESS' }
      $disks = @(Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction Stop)
      if ($disks.Count -ne 1 -or $null -eq $disks[0].FreeSpace) { throw 'FREE_SPACE_UNKNOWN' }
      return ('{"ok":true,"kind":"R1_READ_ONLY","target_ip":"192.168.1.9","machine_name":' + (J ([Environment]::MachineName)) + ',"account_sid":' + (J $users[0].SID) + ',"build":"7601","sp1_x64":true,"session_id":' + $console + ',"console_active":true,"logonui_present":false,"run_root":' + (J $root) + ',"run_directory_exists":false,"channel_parent_exists":' + (B $channelExists) + ',"run_parent_exists":' + (B $runExists) + ',"ancestors_non_reparse":true,"channel_processes":0,"a9_dev_tasks":0,"lock_idle":true,"channel_used_bytes":' + $devUsed + ',"free_bytes":' + $disks[0].FreeSpace + ',"target_utc":' + (J ([DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ss.fffZ'))) + '}')
  }
  try {
    if ([Environment]::MachineName -ine $script:BoundMachine) { throw 'MACHINE_NOT_BOUND' }
    $users = @(Get-WmiObject Win32_UserAccount -Filter "LocalAccount=True AND Name='agent'" -ErrorAction Stop)
    if ($users.Count -ne 1 -or $users[0].SID -cne $script:BoundSid) { throw 'SID_NOT_BOUND' }
    if ($Step -cne 'R1' -and $Step -cne 'R2' -and $Step -cne 'R8') { Run-Lock 'assert' }
    if ($Step -ceq 'R1') {
      Emit (Read-Admission)
    } elseif ($Step -ceq 'R2') {
      # Same four-condition read-only admission immediately before any creation. No close.
      $null = Read-Admission
      Run-Lock 'acquire'
      $createdParents = @()
      try {
        # Repeat every admission condition while the exclusive acquired lock handle is held.
        $null = Read-Admission $true
        foreach ($parent in @('C:\A9-DEV','C:\A9-DEV\run')) {
          Safe $parent
          if (Test-Path -LiteralPath $parent) {
            if (-not (Test-Path -LiteralPath $parent -PathType Container)) { throw 'PARENT_NOT_DIRECTORY' }
          } else {
            [void](New-Item -ItemType Directory -Path $parent -ErrorAction Stop)
            $createdParents += (J $parent); Emit ('{"step":"R2_PARENT_CREATED","path":' + (J $parent) + '}'); Safe $parent
          }
        }
        Safe $root
        if (Test-Path -LiteralPath $root) { throw 'NEW_ROOT_EXISTS' }
        [void](New-Item -ItemType Directory -Path $root -ErrorAction Stop); Safe $root
        foreach ($suffix in @('p','w','d','e','d\tmp','w\tasks','w\package','t','t\tools','t\tasks','t\external','t\activation-evidence','t\payload','t\payload\diag-app')) {
          $dir = Join-Path $root $suffix; Safe $dir; [void][IO.Directory]::CreateDirectory($dir); Safe $dir
        }
        & "$env:SystemRoot\System32\icacls.exe" $root /grant ('*' + $script:BoundSid + ':(OI)(CI)M')
        if ($LASTEXITCODE -ne 0) { throw 'ACL_GRANT_FAILED' }
        & "$env:SystemRoot\System32\icacls.exe" $root /verify
        if ($LASTEXITCODE -ne 0) { throw 'ACL_VERIFY_FAILED' }
        Emit ((Get-Acl -LiteralPath $root).Sddl)
        Emit ('{"ok":true,"step":"R2","created_parent_directories":[' + ($createdParents -join ',') + ']}')
      } catch { Emit ('{"ok":false,"step":"R2","error":"CREATE_ROOT_OR_ACL_FAILED","created_parent_directories":[' + ($createdParents -join ',') + ']}'); throw }
      finally { if ($null -ne $script:RunLockStream) { $script:RunLockStream.Close(); $script:RunLockStream = $null } }
    } elseif ($Step -ceq 'R3-state') {
      if ($Rows.Length -gt 65536) { throw 'UPLOAD_STATE_INPUT_BOUND' }
      $paths = @(([System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Rows))).TrimEnd().Split("`n"))
      if ($paths.Count -lt 1 -or $paths.Count -gt 64) { throw 'UPLOAD_STATE_COUNT_BOUND' }
      $end = (Ticks) + [long](100 * $Frequency); $seen = @{}; $states = @()
      foreach ($row in $paths) {
        if ((Ticks) -ge $end) { throw 'UPLOAD_STATE_DEADLINE' }
        $file = $row.TrimEnd("`r")
        Transfer-Path $file
        if ($seen.ContainsKey($file)) { throw 'UPLOAD_STATE_PATH' }
        $seen[$file] = $true; Safe $file
        $exists = $false; $sizeJson = 'null'
        try {
          $attr = [IO.File]::GetAttributes($file)
          if (($attr -band [IO.FileAttributes]::Directory) -ne 0 -or ($attr -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'UPLOAD_STATE_NOT_FILE' }
          $info = New-Object IO.FileInfo -ArgumentList $file
          $sizeJson = [string]$info.Length; $exists = $true; Safe $file
        } catch {
          $cause = $_.Exception; while ($null -ne $cause.InnerException) { $cause = $cause.InnerException }
          if (-not ($cause -is [IO.FileNotFoundException]) -and -not ($cause -is [IO.DirectoryNotFoundException])) { throw }
        }
        if ((Ticks) -ge $end) { throw 'UPLOAD_STATE_DEADLINE' }
        $states += ('{"path":' + (J $file) + ',"exists":' + (B $exists) + ',"bytes":' + $sizeJson + '}')
      }
      Emit ('{"ok":true,"kind":"UPLOAD_STATE","remote_root":' + (J $root) + ',"machine_name":' + (J ([Environment]::MachineName)) + ',"account_sid":' + (J $users[0].SID) + ',"items":[' + ($states -join ',') + ']}')
    } elseif ($Step -ceq 'R3') {
      $transferRows = @(([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Rows))).TrimEnd().Split("`n"))
      if ($Rows.Length -gt 262144 -or $transferRows.Count -lt 1 -or $transferRows.Count -gt 128) { throw 'TRANSFER_BOUND' }
      $seenTransfer = @{}
      foreach ($row in $transferRows) {
        $v = $row.TrimEnd("`r").Split("`t")
        if ($v.Count -ne 3 -or $v[0] -cnotmatch '^[a-f0-9]{64}$' -or $v[1] -cnotmatch '^(0|[1-9][0-9]{0,15})$') { throw 'TRANSFER_ROW_INVALID' }
        Transfer-Path $v[2]
        if ($seenTransfer.ContainsKey($v[2])) { throw 'TRANSFER_DUPLICATE' }; $seenTransfer[$v[2]] = $true
        $info = New-Object System.IO.FileInfo -ArgumentList $v[2]
        $size = $info.Length; $hash = Hash $v[2]
        if ($size -ne [Int64]$v[1] -or $hash -cne $v[0]) { throw 'TRANSFER_HASH_OR_SIZE' }
        Emit ($hash + "`t" + $size + "`t" + $v[2])
      }
    } elseif ($Step -ceq 'R4' -or $Step -ceq 'R5' -or $Step -ceq 'R6') {
      if ($Step -cne 'R4' -and $phases -cnotcontains $Phase) { throw 'PHASE_OUTSIDE_P1' }
      Safe $admin
      $env:TEMP = Join-Path $root 'd\tmp'; $env:TMP = $env:TEMP
      $global:LASTEXITCODE = 0
      if ($Step -ceq 'R4') { $text = @(& $admin -Action Expand); $token = 'EXPANDED_BOUND_ENTRIES_HASH_VERIFIED' }
      elseif ($Step -ceq 'R5') { $text = @(& $admin -Action Register -Phase $Phase); $token = 'TASK_READBACK_MATCH' }
      else { $text = @(& $admin -Action RunWait -Phase $Phase); $token = 'TASK_DELETED_READBACK_ABSENT' }
      foreach ($line in $text) { Emit ([string]$line) }
      if ($LASTEXITCODE -ne 0 -or $text -cnotcontains $token) { throw 'ADMIN_ACTION_NOT_PASS' }
      if ($Step -cne 'R6') { Emit ('{"ok":true,"step":' + (J $Step) + '}') }
      elseif ($Phase -ceq 'gpu-entry-gate') {
        Emit ('{"ok":true,"kind":"GATE_SNAPSHOT","phase":"gpu-entry-gate","base64":' + (J (B64 (Join-Path $root 'e\gpu-entry-gate\gate-result.json'))) + '}')
      } else {
        $dirs = @(); $results = @()
        $requestRoot = Join-Path $root 'e\requests'; Safe $requestRoot
        foreach ($dir in @(Get-ChildItem -LiteralPath $requestRoot -Force -ErrorAction Stop)) {
          if (-not $dir.PSIsContainer) { throw 'REQUEST_ENTRY_NOT_DIRECTORY' }; Safe $dir.FullName
          if ($RequestDirectories -cnotcontains $dir.Name) { throw 'REQUEST_DIRECTORY_NAME' }
          $dirs += (J $dir.Name)
          $results += ('{"directory":' + (J $dir.Name) + ',"base64":' + (J (B64 (Join-Path $dir.FullName 'phase-result.json'))) + '}')
        }
        Emit ('{"ok":true,"kind":"PHASE_SNAPSHOT","phase":' + (J $Phase) + ',"ledger_base64":' + (J (B64 (Join-Path $root 'e\request-ledger.jsonl'))) + ',"directories":[' + ($dirs -join ',') + '],"results":[' + ($results -join ',') + ']}')
      }
    } elseif ($Step -ceq 'R7') {
      if (-not $Owned -or -not (Test-Path -LiteralPath $root)) { Emit '{"ok":true,"kind":"RECOVERY","owned":false,"tree":[],"scans":[]}' }
      else {
        $env:TEMP = Join-Path $root 'd\tmp'; $env:TMP = $env:TEMP
        $script:R7Start = $script:AdminStartTick
        $sealed = $false; $sealDetail = $null; $treeDetail = $null
        try { R7-Seal; $sealed = $true } catch { $sealDetail = Exception-Detail $_ }
        Safe $root; $env:TEMP = Join-Path $root 'd\tmp'; $env:TMP = $env:TEMP
        $lines = @()
        try {
          if ((Ticks) -ge $script:R7Start + [long](69 * $Frequency)) { throw 'R7_TREE_NO_REMAINING_BUDGET' }
          $treeSeconds = [int][Math]::Floor([Math]::Min(28,(Seconds-Left ($script:R7Start + [long](70 * $Frequency)))))
          if ($treeSeconds -lt 1) { throw 'R7_TREE_NO_REMAINING_BUDGET' }
          $lines = @(& $admin -Action TreeHash -TreeSeconds $treeSeconds); if ($LASTEXITCODE -ne 0) { throw 'TREE_HASH_FAILED' }
          if ((Ticks) -gt $script:R7Start + [long](70 * $Frequency)) { throw 'R7_STEP_DEADLINE' }
        } catch { $treeDetail = Exception-Detail $_; $sealed = $false; $lines = @() }
        $tree = @(); foreach ($line in $lines) { $tree += (J $line) }
        $scans = @()
        foreach ($ph in $phases) {
          $file = Join-Path $root ('e\rehearsal-postflight\' + $ph + '.json')
          if (Test-Path -LiteralPath $file) { $scans += ('{"phase":' + (J $ph) + ',"base64":' + (J (B64 $file)) + '}') }
        }
        if ($sealed) {
          Emit ('{"ok":true,"kind":"RECOVERY","owned":true,"tree":[' + ($tree -join ',') + '],"scans":[' + ($scans -join ',') + '],"trace_seal_base64":' + (J (B64 (Join-Path $root 'e\trace-seal.json'))) + '}')
        } else {
          # BEGIN_R7_WORK_SIZES: metadata only; no content/hash/write; never changes $sealed.
          $workSizePaths = @(); $workSizeRows = @{}; $workSizesJson = @(); $workSizesTruncated = $false; $workSizesDetail = $null
          try {
            $sizeEnd = [long][Math]::Min((Ticks) + [long](10 * $Frequency),$script:R7Start + [long](80 * $Frequency))
            Safe $root
            $pending = @($work); $cursor = 0
            while ($cursor -lt $pending.Count) {
              if ((Ticks) -ge $sizeEnd) { throw 'R7_WORK_SIZE_DEADLINE' }
              $directory = $pending[$cursor]; $cursor++
              $attributes = [System.IO.File]::GetAttributes($directory)
              if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
                if ($workSizePaths.Count -ge 256) { $workSizesTruncated = $true; break }
                $relative = $directory.Substring($root.Length + 1).Replace('\','/')
                $workSizeRows[$relative] = ('{"path":' + (J $relative) + ',"reparse":true}')
                $workSizePaths += $relative
                continue
              }
              Safe $directory
              foreach ($file in @(Get-ChildItem -LiteralPath $directory -Force -ErrorAction Stop)) {
                if ((Ticks) -ge $sizeEnd) { throw 'R7_WORK_SIZE_DEADLINE' }
                if (-not $file.FullName.StartsWith(($work + '\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'R7_WORK_SIZE_OUTSIDE_WORK' }
                $relative = $file.FullName.Substring($root.Length + 1).Replace('\','/')
                $reparse = ($file.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0
                if (-not $reparse -and $file.PSIsContainer) { $pending += $file.FullName; continue }
                if ($workSizePaths.Count -ge 256) { $workSizesTruncated = $true; break }
                if ($reparse) { $row = ('{"path":' + (J $relative) + ',"reparse":true}') }
                else { $row = ('{"path":' + (J $relative) + ',"length":' + $file.Length + ',"last_write_utc":' + (J ($file.LastWriteTimeUtc.ToString('yyyy-MM-ddTHH:mm:ss.fffZ'))) + '}') }
                $workSizeRows[$relative] = $row; $workSizePaths += $relative
              }
              if ($workSizesTruncated) { break }
            }
            if ((Ticks) -ge $sizeEnd) { throw 'R7_WORK_SIZE_DEADLINE' }
            # Bounded ordinal insertion sort; same ordering as the local JSON consumer.
            for ($i = 1; $i -lt $workSizePaths.Count; $i++) {
              $value = $workSizePaths[$i]; $j = $i - 1
              while ($j -ge 0 -and [string]::CompareOrdinal($workSizePaths[$j],$value) -gt 0) { $workSizePaths[$j + 1] = $workSizePaths[$j]; $j-- }
              $workSizePaths[$j + 1] = $value
            }
            foreach ($relative in $workSizePaths) { $workSizesJson += $workSizeRows[$relative] }
          } catch { $workSizesDetail = Exception-Detail $_; $workSizesJson = @() }
          # END_R7_WORK_SIZES
          Emit ('{"ok":true,"kind":"RECOVERY","owned":true,"tree":[],"scans":[],"metadata_only":true,"metadata":{"reason":"SCAN_OR_WRITER_GATE_FAILED","detail":' + (J $sealDetail) + ',"tree_detail":' + (J $treeDetail) + ',"retained_file_hashes":[' + ($tree -join ',') + '],"raw_evidence_retained_on_target":true,"downloaded_content":false,"work_file_sizes":[' + ($workSizesJson -join ',') + '],"work_file_sizes_truncated":' + (B $workSizesTruncated) + ',"work_file_sizes_detail":' + (J $workSizesDetail) + '}}')
        }
      }
    } elseif ($Step -ceq 'R8') {
      # Check token before any Scheduler mutation, including recovery from partial R2.
      if ($Owned) { Run-Lock 'assert' } else { Run-Lock 'idle' }
      $folder = Scheduler
      foreach ($ph in @($DeletePhases.Split(',') | Where-Object { $_ -ne '' })) {
        if (-not $Owned -or $phases -cnotcontains $ph) { throw 'CLEANUP_OUTSIDE_OWNERSHIP' }
        $name = $TaskPrefix + $ph
        $found = @($folder.GetTasks(1) | Where-Object { $_.Name -ceq $name })
        if ($found.Count -gt 1) { throw 'TASK_AMBIGUOUS' }
        if ($found.Count -eq 1) {
          # Identity is exact task name + full validated template readback, not old metadata substrings.
          & $admin -Action ReadTask -Phase $ph
          if ($LASTEXITCODE -ne 0) { throw 'TASK_NOT_THIS_RUN' }
          & $admin -Action DeleteTask -Phase $ph
          if ($LASTEXITCODE -ne 0) { throw 'DELETE_TASK_FAILED' }
        }
      }
      $tasks = @($folder.GetTasks(1) | Where-Object { $_.Name.StartsWith($TaskPrefix,[StringComparison]::Ordinal) })
      Assert-NoRegisteredWriters 12
      $procs = @(); foreach ($proc in @(Related $true)) {
        $procs += ('{"pid":' + $proc.ProcessId + ',"parent_pid":' + $proc.ParentProcessId + ',"creation_date":' + (J $proc.CreationDate) + ',"image_path":' + (J $proc.ExecutablePath) + '}')
      }
      foreach ($proc in @($script:RelatedEnvironment)) { $script:EnvironmentReadback[([string]$proc.ProcessId + '|' + [string]$proc.CreationDate)] = (Environment-Record $proc 'ENVIRONMENT_STILL_LIVE') }
      $environmentRows = @($script:EnvironmentReadback.Values)
      if ($Owned -and $tasks.Count -eq 0 -and $procs.Count -eq 0) { Run-Lock 'release' }
      Emit ('{"lock_idle":' + (B ($tasks.Count -eq 0 -and $procs.Count -eq 0)) + ',"ok":' + (($tasks.Count -eq 0 -and $procs.Count -eq 0).ToString().ToLowerInvariant()) + ',"kind":"POSTFLIGHT","tasks_remaining":' + $tasks.Count + ',"processes":[' + ($procs -join ',') + '],"environment_processes":[' + ($environmentRows -join ',') + ']}')
      if ($tasks.Count -ne 0 -or $procs.Count -ne 0) { exit 1 }
    } else { throw 'ADMIN_STEP_NOT_ALLOWED' }
  } catch { Emit ('{"ok":false,"step":' + (J $Step) + ',"error":"BOUND_ADMIN_QUERY_OR_ACTION_FAILED","detail":' + (J (Exception-Detail $_)) + '}'); exit 1 }
}

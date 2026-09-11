<#
  a9_win7_memory_baseline.ps1

  READ-ONLY per-process memory sampler for the A9 Win7 product.

  Goal: attribute resident memory to the A9 process tree on Windows 7 SP1 x64 so a
  comparable baseline exists for PERFORMANCE_BUDGET items #2 (Shell resident),
  #3 (Core utilityProcess), #4 (Runner/helper per instance) and #10 (app total).

  Invariants:
    - Read-only. Never starts, stops, injects into or modifies the product.
    - Runs as a normal NON-ELEVATED user, matching the acceptance contract.
    - Writes only CSV/TXT evidence files under -OutDir. No registry, service,
      network or system configuration change.
    - Does NOT constitute a Win7 acceptance verdict and does NOT change any
      PERFORMANCE_BUDGET status cell. Those remain owner-decided.

  Why ASCII-only: Windows PowerShell 5.1 and 2.0 read UTF-8-without-BOM files as
  ANSI, so non-ASCII literals would be corrupted. Keep every literal ASCII.
  CSV outputs are written with -Encoding ASCII so no BOM is ever produced.

  Usage (one invocation per scenario, reuse -OutDir to accumulate):
    powershell -ExecutionPolicy Bypass -File .\a9_win7_memory_baseline.ps1 `
      -Scenario S1 -Label cold-idle `
      -OutDir "D:\a9-mem\A9-MEM-BASELINE-20260911-01" `
      -IntervalSeconds 5 -DurationSeconds 600
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Za-z0-9_.-]+$')]
  [string]$Scenario,

  [string]$Label = '',

  [string]$OutDir = "$env:USERPROFILE\a9-mem-baseline",

  [int]$IntervalSeconds = 5,

  [int]$DurationSeconds = 600,

  [string]$ElectronName = 'electron.exe',

  [string[]]$EnvNoiseNames = @('BvSshServer.exe'),

  [string]$CandidateNote = 'UNSET'
)

$ErrorActionPreference = 'Stop'

$Invariant = [System.Globalization.CultureInfo]::InvariantCulture

function To-UInt64 {
  param($Value)
  if ($null -eq $Value) { return [uint64]0 }
  try { return [uint64]$Value } catch { return [uint64]0 }
}

function Format-Double {
  param([double]$Value)
  return $Value.ToString('0.###', $Invariant)
}

function Get-Median {
  param([double[]]$Values)
  if ($null -eq $Values) { return [double]0 }
  $sorted = @($Values | Sort-Object)
  $n = $sorted.Count
  if ($n -eq 0) { return [double]0 }
  if ($n % 2 -eq 1) {
    return [double]$sorted[[int](($n - 1) / 2)]
  }
  $lo = [double]$sorted[[int]($n / 2) - 1]
  $hi = [double]$sorted[[int]($n / 2)]
  return ($lo + $hi) / 2.0
}

function Get-A9Category {
  param([string]$Name, [string]$CommandLine)
  if ($null -eq $CommandLine) { $CommandLine = '' }
  if ($Name -ieq $ElectronName) {
    if ($CommandLine -match '--type=gpu-process') { return 'shell.gpu' }
    if ($CommandLine -match '--type=renderer') { return 'shell.renderer' }
    if ($CommandLine -match '--type=utility') { return 'core.utility' }
    if ($CommandLine -match '--type=') { return 'shell.other' }
    return 'shell.main'
  }
  if ($Name -match '(?i)helper') { return 'runner.helper' }
  if ($Name -match '(?i)^(cmd|powershell|pwsh)\.exe$') { return 'runner.shell-child' }
  if ($Name -match '(?i)^(git|node|npm|npx)\.exe$') { return 'runner.tool' }
  return 'a9.unclassified'
}

function Get-FileSha256 {
  param([string]$Path)
  if (-not $Path) { return '' }
  if (-not (Test-Path -LiteralPath $Path)) { return '' }
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $stream = $null
  try {
    $stream = [System.IO.File]::OpenRead($Path)
    $bytes = $sha.ComputeHash($stream)
    return ([System.BitConverter]::ToString($bytes) -replace '-', '')
  } catch {
    return ''
  } finally {
    if ($stream) { $stream.Close() }
    $sha.Clear()
  }
}

$runId = (Get-Date).ToString('yyyyMMdd-HHmmss')
if ([string]::IsNullOrEmpty($Label)) { $Label = $Scenario }
if (-not (Test-Path -LiteralPath $OutDir)) {
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
}

$samplesPath = Join-Path $OutDir 'samples.csv'
$systemPath = Join-Path $OutDir 'system.csv'
$summaryPath = Join-Path $OutDir 'summary.csv'
$metaPath = Join-Path $OutDir 'meta.txt'

$samplesHeader = 'run_id,scenario,label,ts,elapsed_s,pid,ppid,category,name,ws_bytes,private_bytes,peak_ws_bytes,handles,threads,cpu_s'
$systemHeader = 'run_id,ts,elapsed_s,total_kb,free_kb,commit_total_kb,commit_free_kb'
$summaryHeader = 'run_id,scenario,metric,category,n,min,median,max'

if (-not (Test-Path -LiteralPath $samplesPath)) {
  Add-Content -LiteralPath $samplesPath -Value $samplesHeader -Encoding ASCII
}
if (-not (Test-Path -LiteralPath $systemPath)) {
  Add-Content -LiteralPath $systemPath -Value $systemHeader -Encoding ASCII
}

$scriptPath = $MyInvocation.MyCommand.Path
$scriptHash = Get-FileSha256 -Path $scriptPath
$hostName = [string]$env:COMPUTERNAME
$psVersion = [string]$PSVersionTable.PSVersion
$osProbe = Get-WmiObject -Class Win32_OperatingSystem
$osCaption = [string]$osProbe.Caption
$osBuild = [string]$osProbe.BuildNumber

$metaLines = @()
$metaLines += 'kit=a9-memory-baseline'
$metaLines += ('run_id=' + $runId)
$metaLines += ('scenario=' + $Scenario)
$metaLines += ('label=' + $Label)
$metaLines += ('started_at=' + (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'))
$metaLines += ('host=' + $hostName)
$metaLines += ('os_caption=' + $osCaption)
$metaLines += ('os_build=' + $osBuild)
$metaLines += ('powershell=' + $psVersion)
$metaLines += ('interval_seconds=' + $IntervalSeconds)
$metaLines += ('duration_seconds=' + $DurationSeconds)
$isElevated = 'UNKNOWN'
try {
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object System.Security.Principal.WindowsPrincipal($identity)
  $isElevated = [string]$principal.IsInRole([System.Security.Principal.WindowsBuiltInRole]::Administrator)
} catch {
  $isElevated = 'UNKNOWN'
}
$metaLines += ('elevated=' + $isElevated)
$metaLines += ('script_path=' + [string]$scriptPath)
$metaLines += ('script_sha256=' + $scriptHash)
$metaLines += ('candidate_note=' + $CandidateNote)
$metaLines += '---'
Add-Content -LiteralPath $metaPath -Value $metaLines -Encoding ASCII

Write-Host ("A9 memory baseline sampler | run_id=" + $runId + " scenario=" + $Scenario)
Write-Host ("out_dir=" + $OutDir)
Write-Host ("interval=" + $IntervalSeconds + "s duration=" + $DurationSeconds + "s (press Ctrl+C to stop early)")
Write-Host "categories: shell.main shell.gpu shell.renderer core.utility runner.* a9.unclassified | env.other excluded from A9 total"
Write-Host ""

$agg = @{}
$aggCount = @{}
$aggPrivMax = @{}
$aggPeakWsMax = @{}

function Add-Agg {
  param([string]$Key, [double]$Ws, [double]$Priv, [double]$PeakWs)
  if (-not $agg.ContainsKey($Key)) {
    $agg[$Key] = @()
    $aggCount[$Key] = 0
    $aggPrivMax[$Key] = [double]0
    $aggPeakWsMax[$Key] = [double]0
  }
  $agg[$Key] = $agg[$Key] + @($Ws)
  $aggCount[$Key] = $aggCount[$Key] + 1
  if ($Priv -gt $aggPrivMax[$Key]) { $aggPrivMax[$Key] = $Priv }
  if ($PeakWs -gt $aggPeakWsMax[$Key]) { $aggPeakWsMax[$Key] = $PeakWs }
}

$start = Get-Date
$sampleIndex = 0
$maxA9Count = 0

while ($true) {
  $elapsed = [int]((Get-Date) - $start).TotalSeconds
  if ($elapsed -gt $DurationSeconds) { break }

  $ts = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')
  $all = Get-WmiObject -Class Win32_Process
  $byId = @{}
  foreach ($proc in $all) { $byId[[int]$proc.ProcessId] = $proc }

  $include = @{}
  foreach ($proc in $all) {
    if ($proc.Name -ieq $ElectronName) {
      $cmd = [string]$proc.CommandLine
      if ($cmd -notmatch '--type=') { $include[[int]$proc.ProcessId] = $true }
    }
  }
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($proc in $all) {
      $childId = [int]$proc.ProcessId
      $parentId = [int]$proc.ParentProcessId
      if ((-not $include.ContainsKey($childId)) -and $include.ContainsKey($parentId)) {
        $include[$childId] = $true
        $changed = $true
      }
    }
  }

  $a9TotalWs = [double]0
  $a9PrivTotal = [double]0
  $a9Count = 0

  foreach ($proc in $all) {
    $procId = [int]$proc.ProcessId
    $parentId = [int]$proc.ParentProcessId
    $cmd = [string]$proc.CommandLine
    $name = [string]$proc.Name

    $isA9 = $include.ContainsKey($procId)
    $isNoise = $false
    foreach ($noise in $EnvNoiseNames) {
      if ($name -ieq $noise) { $isNoise = $true }
    }
    if ((-not $isA9) -and (-not $isNoise)) { continue }

    if ($isA9) {
      $category = Get-A9Category -Name $name -CommandLine $cmd
    } else {
      $category = 'env.other'
    }

    $ws = [double](To-UInt64 $proc.WorkingSetSize)
    $priv = [double](To-UInt64 $proc.PageFileUsage)
    $peakWs = [double](To-UInt64 $proc.PeakWorkingSetSize)
    $handles = To-UInt64 $proc.HandleCount
    $threads = To-UInt64 $proc.ThreadCount
    $kernel = [double](To-UInt64 $proc.KernelModeTime)
    $user = [double](To-UInt64 $proc.UserModeTime)
    $cpuSeconds = (($kernel + $user) / 10000000.0).ToString('0.000', $Invariant)

    $line = ('{0},{1},{2},{3},{4},{5},{6},{7},{8},{9},{10},{11},{12},{13},{14}' -f $runId, $Scenario, $Label, $ts, $elapsed, $procId, $parentId, $category, $name,
      (To-UInt64 $ws), (To-UInt64 $priv), (To-UInt64 $peakWs), $handles, $threads, $cpuSeconds)
    Add-Content -LiteralPath $samplesPath -Value $line -Encoding ASCII

    if ($isA9) {
      $a9TotalWs = $a9TotalWs + $ws
      $a9PrivTotal = $a9PrivTotal + $priv
      $a9Count = $a9Count + 1
      Add-Agg -Key $category -Ws $ws -Priv $priv -PeakWs $peakWs
    } else {
      Add-Agg -Key 'env.other' -Ws $ws -Priv $priv -PeakWs $peakWs
    }
  }

  $os = Get-WmiObject -Class Win32_OperatingSystem
  $totalKb = To-UInt64 $os.TotalVisibleMemorySize
  $freeKb = To-UInt64 $os.FreePhysicalMemory
  $commitTotalKb = To-UInt64 $os.TotalVirtualMemorySize
  $commitFreeKb = To-UInt64 $os.FreeVirtualMemory

  $sysLine = ('{0},{1},{2},{3},{4},{5},{6}' -f $runId, $ts, $elapsed, $totalKb, $freeKb, $commitTotalKb, $commitFreeKb)
  Add-Content -LiteralPath $systemPath -Value $sysLine -Encoding ASCII

  Add-Agg -Key 'a9.total' -Ws $a9TotalWs -Priv $a9PrivTotal -PeakWs $a9TotalWs
  if ($totalKb -gt 0) {
    $pct = ($a9TotalWs / ([double]$totalKb * 1024.0)) * 100.0
    Add-Agg -Key 'a9.total.physical_pct' -Ws $pct -Priv 0 -PeakWs $pct
  }
  if ($a9Count -gt $maxA9Count) { $maxA9Count = $a9Count }

  $sampleIndex = $sampleIndex + 1
  if ($sampleIndex % 12 -eq 0) {
    Write-Host ("  t=" + $elapsed + "s a9_processes=" + $a9Count + " a9_ws_mb=" + (Format-Double ($a9TotalWs / 1MB)))
  }

  $remaining = $DurationSeconds - [int]((Get-Date) - $start).TotalSeconds
  if ($remaining -le 0) { break }
  $sleep = $IntervalSeconds
  if ($sleep -gt $remaining) { $sleep = $remaining }
  Start-Sleep -Seconds $sleep
}

if (-not (Test-Path -LiteralPath $summaryPath)) {
  Add-Content -LiteralPath $summaryPath -Value $summaryHeader -Encoding ASCII
}

$keys = @($agg.Keys | Sort-Object)
foreach ($key in $keys) {
  $values = @($agg[$key])
  if ($values.Count -eq 0) { continue }
  $minValue = ($values | Measure-Object -Minimum).Minimum
  $maxValue = ($values | Measure-Object -Maximum).Maximum
  $medianValue = Get-Median -Values $values
  $row = ('{0},{1},{2},{3},{4},{5},{6},{7}' -f $runId, $Scenario, 'ws_bytes', $key, $values.Count,
    (To-UInt64 $minValue), (Format-Double $medianValue), (To-UInt64 $maxValue))
  Add-Content -LiteralPath $summaryPath -Value $row -Encoding ASCII
  $row2 = ('{0},{1},{2},{3},{4},{5},{6},{7}' -f $runId, $Scenario, 'private_bytes_max', $key, $values.Count,
    (To-UInt64 $aggPrivMax[$key]), (To-UInt64 $aggPrivMax[$key]), (To-UInt64 $aggPrivMax[$key]))
  Add-Content -LiteralPath $summaryPath -Value $row2 -Encoding ASCII
  $row3 = ('{0},{1},{2},{3},{4},{5},{6},{7}' -f $runId, $Scenario, 'peak_ws_bytes_max', $key, $values.Count,
    (To-UInt64 $aggPeakWsMax[$key]), (To-UInt64 $aggPeakWsMax[$key]), (To-UInt64 $aggPeakWsMax[$key]))
  Add-Content -LiteralPath $summaryPath -Value $row3 -Encoding ASCII
}

$tailLines = @()
$tailLines += ('ended_at=' + (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'))
$tailLines += ('samples_taken=' + $sampleIndex)
$tailLines += ('max_a9_process_count=' + $maxA9Count)
$tailLines += ('final_a9_process_count=' + $a9Count)
$tailLines += ('residue_note=' + $(if ($a9Count -eq 0) { 'NO_A9_PROCESS_AT_END' } else { 'A9_PROCESSES_STILL_RUNNING_AT_END' }))
$tailLines += '---'
Add-Content -LiteralPath $metaPath -Value $tailLines -Encoding ASCII

Write-Host ""
Write-Host ("done. samples=" + $sampleIndex + " max_a9_processes=" + $maxA9Count + " final_a9_processes=" + $a9Count)
Write-Host ("wrote: " + $samplesPath)
Write-Host ("wrote: " + $systemPath)
Write-Host ("wrote: " + $summaryPath)
Write-Host ("wrote: " + $metaPath)
Write-Host "REMINDER: this run is a measurement baseline only. It is NOT a Win7 PASS"
Write-Host "and it does NOT change any PERFORMANCE_BUDGET status."

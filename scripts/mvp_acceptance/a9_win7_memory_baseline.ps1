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

  [string]$TargetExecutablePath = '',

  [int]$TargetPid = 0,

  [string]$TargetCreationTime = '',

  [switch]$TestMode,

  [string[]]$EnvNoiseNames = @('BvSshServer.exe'),

  [string]$CandidateNote = 'UNSET'
)

$ErrorActionPreference = 'Stop'

$Invariant = [System.Globalization.CultureInfo]::InvariantCulture

function To-Bytes {
  param($Value)
  if ($null -eq $Value -or [string]::IsNullOrEmpty([string]$Value)) { return 'UNKNOWN' }
  try { return [uint64]$Value } catch { return 'UNKNOWN' }
}

function Kb-ToBytes {
  param($Value)
  if ($null -eq $Value -or [string]::IsNullOrEmpty([string]$Value)) { return 'UNKNOWN' }
  try { return ([uint64]$Value * [uint64]1024) } catch { return 'UNKNOWN' }
}

function To-UInt64 {
  param($Value)
  if ($null -eq $Value -or [string]::IsNullOrEmpty([string]$Value)) { return $null }
  try { return [uint64]$Value } catch { return $null }
}

function Format-Value {
  param($Value)
  if ($null -eq $Value) { return 'UNKNOWN' }
  return [string]$Value
}

function Get-ProcessCreationKey {
  param($Process)
  $processId = [string]$Process.ProcessId
  $created = [string]$Process.CreationDate
  if ([string]::IsNullOrEmpty($created)) { $created = 'UNKNOWN' }
  return ($processId + '|' + $created)
}

function Test-TargetRoot {
  param($Process)
  if ([string]::IsNullOrEmpty([string]$Process.CreationDate)) { return $false }
  if ([string]$Process.Name -ine $ElectronName) { return $false }
  $rootCommandLine = [string]$Process.CommandLine
  if ([string]::IsNullOrEmpty($rootCommandLine) -or $rootCommandLine -match '--type=') { return $false }
  if (-not $TargetExecutablePath -and $TargetPid -le 0 -and -not $TargetCreationTime -and -not $script:BoundTargetCreationTime) { return $false }
  if ($TargetPid -gt 0 -and [int]$Process.ProcessId -ne $TargetPid) { return $false }
  $boundTime = if ($TargetCreationTime) { $TargetCreationTime } else { $script:BoundTargetCreationTime }
  if ($boundTime -and [string]$Process.CreationDate -ne $boundTime) { return $false }
  if ($TargetExecutablePath) {
    $actual = [string]$Process.ExecutablePath
    if (-not $actual -or $actual.TrimEnd('\') -ine $TargetExecutablePath.TrimEnd('\')) { return $false }
  }
  return $true
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
    if ($CommandLine -match '--type=utility') { return 'shell.utility' }
    if ($CommandLine -match '--type=') { return 'shell.other' }
    return 'shell.main'
  }
  if ($Name -match '(?i)helper') { return 'runner.helper' }
  if ($Name -match '(?i)^(cmd|powershell|pwsh)\.exe$') { return 'runner.shell-child' }
  if ($Name -match '(?i)^(git|node|npm|npx)\.exe$') { return 'runner.tool' }
  return 'a9.unclassified'
}

function Get-TrackedProcesses {
  param([object[]]$Processes, [hashtable]$State)
  if ($null -eq $State) { $State = @{ Known = @{} } }
  $State.IdentityUnknown = $false
  $byId = @{}
  foreach ($proc in $Processes) { $byId[[int]$proc.ProcessId] = $proc }
  $roots = @($Processes | Where-Object { Test-TargetRoot -Process $_ })
  if ($State.RootKey) {
    $roots = @($roots | Where-Object { (Get-ProcessCreationKey $_) -eq $State.RootKey })
  } elseif ($roots.Count -eq 1) {
    $State.RootKey = Get-ProcessCreationKey $roots[0]
  } elseif ($roots.Count -gt 1) {
    throw 'target root binding is ambiguous'
  }
  $include = @{}
  foreach ($proc in $Processes) {
    $key = Get-ProcessCreationKey $proc
    if ($State.Known.ContainsKey($key)) { $include[$key] = $true }
  }
  foreach ($root in $roots) {
    $rootKey = Get-ProcessCreationKey $root
    $include[$rootKey] = $true
    $State.Known[$rootKey] = $true
  }
  $changed = $true
  while ($changed) {
    $changed = $false
    foreach ($proc in $Processes) {
      $parent = $byId[[int]$proc.ParentProcessId]
      if ($null -ne $parent -and [string]::IsNullOrEmpty([string]$proc.CreationDate) -and $include.ContainsKey((Get-ProcessCreationKey $parent))) { $State.IdentityUnknown = $true; continue }
      if ($null -ne $parent -and -not $include.ContainsKey((Get-ProcessCreationKey $proc)) -and
          $include.ContainsKey((Get-ProcessCreationKey $parent))) {
        $include[(Get-ProcessCreationKey $proc)] = $true
        $State.Known[(Get-ProcessCreationKey $proc)] = $true
        $changed = $true
      }
    }
  }
  # Preserve known child identities when their root briefly disappears. A
  # reused PID has a different CreationDate key and is therefore excluded.
  return @($Processes | Where-Object { $include.ContainsKey((Get-ProcessCreationKey $_)) -or $State.Known.ContainsKey((Get-ProcessCreationKey $_)) })
}

function Add-Agg {
  param([string]$Key, $Ws, $Priv, $PeakWs)
  if (-not $agg.ContainsKey($Key)) { $agg[$Key] = @{ ws = @(); priv = @(); samples = 0 } }
  $record = $agg[$Key]
  $record.samples += 1
  if ($null -ne $Ws) { $record.ws += @([double]$Ws) }
  if ($null -ne $Priv) { $record.priv += @([double]$Priv) }
}

function Assert-A9MemoryBaselineLogic {
  $script:TargetPid = 10
  $script:TargetCreationTime = 'A'
  $root = New-Object PSObject -Property @{ ProcessId = 10; ParentProcessId = 1; Name = 'electron.exe'; CommandLine = 'C:\A9\electron.exe'; ExecutablePath = 'C:\A9\electron.exe'; CreationDate = 'A' }
  $child = New-Object PSObject -Property @{ ProcessId = 11; ParentProcessId = 10; Name = 'electron.exe'; CommandLine = '--type=utility'; ExecutablePath = 'C:\A9\electron.exe'; CreationDate = 'B' }
  $reused = New-Object PSObject -Property @{ ProcessId = 10; ParentProcessId = 1; Name = 'electron.exe'; CommandLine = 'C:\A9\electron.exe'; ExecutablePath = 'C:\A9\electron.exe'; CreationDate = 'C' }
  $state = @{ Known = @{}; RootKey = $null }
  if (@(Get-TrackedProcesses @($root,$child) $state).Count -ne 2) { throw 'descendant tracking failed' }
  if (@(Get-TrackedProcesses @($child) $state).Count -ne 1) { throw 'child identity persistence failed' }
  if (@(Get-TrackedProcesses @($reused) $state).Count -ne 0) { throw 'PID reuse was incorrectly included' }
  if (@(Get-TrackedProcesses @() $state).Count -ne 0) { throw 'exited child was incorrectly retained' }
  if ((Kb-ToBytes 2) -ne 2048) { throw 'KB conversion failed' }
  if ((To-Bytes $null) -ne 'UNKNOWN') { throw 'unknown value became zero' }
  if ((Get-A9Category -Name 'electron.exe' -CommandLine '--type=utility') -ne 'shell.utility') { throw 'utility classification failed' }
  $unknownPeak = New-Object PSObject -Property @{ WorkingSetSize = 1; PageFileUsage = 1; PeakWorkingSetSize = $null }
  if ((Kb-ToBytes $unknownPeak.PeakWorkingSetSize) -ne 'UNKNOWN') { throw 'unknown peak was not preserved' }
  $otherRoot = New-Object PSObject -Property @{ ProcessId = 12; ParentProcessId = 1; Name = 'electron.exe'; CommandLine = 'C:\A9\electron.exe'; ExecutablePath = 'C:\A9\electron.exe'; CreationDate = 'D' }
  $script:TargetPid = 0
  $script:TargetCreationTime = ''
  $script:BoundTargetCreationTime = ''
  $script:TargetExecutablePath = 'C:\A9\electron.exe'
  $ambiguousState = @{ Known = @{}; RootKey = $null }
  $ambiguous = $false
  try { @(Get-TrackedProcesses @($root,$otherRoot) $ambiguousState) | Out-Null } catch { $ambiguous = $true }
  if (-not $ambiguous) { throw 'multiple roots were not rejected' }
  $script:agg = @{}
  Add-Agg -Key 'fixture' -Ws 3072 -Priv $null -PeakWs $null
  Add-Agg -Key 'fixture' -Ws $null -Priv 4096 -PeakWs $null
  Add-Agg -Key 'fixture' -Ws $null -Priv $null -PeakWs $null
  if ($agg['fixture'].samples -ne 3 -or $agg['fixture'].ws.Count -ne 1 -or $agg['fixture'].priv.Count -ne 1) { throw 'unknown aggregate samples were lost' }
  if ($agg['fixture'].ws[0] -ne 3072 -or $agg['fixture'].priv[0] -ne 4096) { throw 'aggregate values changed' }
  Write-Host 'memory baseline logic tests passed'
}

if ($TestMode) { Assert-A9MemoryBaselineLogic; exit 0 }

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

$samplesHeader = 'run_id,scenario,label,ts,elapsed_ms,interval_ms,probe_duration_ms,pid,ppid,creation_key,category,name,ws_bytes,private_bytes,peak_ws_bytes,handles,threads,cpu_s'
$systemHeader = 'run_id,ts,elapsed_ms,interval_ms,probe_duration_ms,total_bytes,free_bytes,commit_total_bytes,commit_free_bytes'
$summaryHeader = 'run_id,scenario,metric,category,n,unknown_samples,min,median,mean,max'

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
$metaLines += ('target_executable_path=' + $(if ($TargetExecutablePath) { $TargetExecutablePath } else { 'UNSET' }))
$metaLines += ('target_pid=' + $(if ($TargetPid -gt 0) { $TargetPid } else { 'UNSET' }))
$metaLines += ('target_creation_time=' + $(if ($TargetCreationTime) { $TargetCreationTime } else { 'UNSET' }))
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
Write-Host "categories: shell.main shell.gpu shell.renderer shell.utility runner.* a9.unclassified | env.other excluded from A9 total"
Write-Host ""

$agg = @{}

$start = Get-Date
$lastSampleAt = $start
$state = @{ Known = @{} }
$sampleIndex = 0
$maxA9Count = 0
$a9Count = 0
$script:BoundTargetCreationTime = $TargetCreationTime

while ($true) {
  $sampleAt = Get-Date
  $elapsedMs = [int64]($sampleAt - $start).TotalMilliseconds
  if ($elapsedMs -gt ($DurationSeconds * 1000)) { break }
  $sampleDurationMs = [int64]($sampleAt - $lastSampleAt).TotalMilliseconds
  $lastSampleAt = $sampleAt

  $ts = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ss')
  $probeStart = Get-Date
  $all = @(Get-WmiObject -Class Win32_Process)
  $os = Get-WmiObject -Class Win32_OperatingSystem
  $probeDurationMs = [int64]((Get-Date) - $probeStart).TotalMilliseconds
  if ($TargetPid -gt 0 -and -not $script:BoundTargetCreationTime) {
    $candidate = @($all | Where-Object { [int]$_.ProcessId -eq $TargetPid -and [string]$_.Name -ieq $ElectronName })
    if ($candidate.Count -eq 1) { $script:BoundTargetCreationTime = [string]$candidate[0].CreationDate }
  }
  $tracked = @(Get-TrackedProcesses -Processes $all -State $state)
  $include = @{}
  foreach ($proc in $tracked) { $include[(Get-ProcessCreationKey $proc)] = $true }

  $a9TotalWs = [double]0
  $a9PrivTotal = [double]0
  $a9WsKnown = 0
  $a9PrivKnownCount = 0
  $a9WsUnknown = 0
  $a9PrivUnknown = 0
  $sampleCategoryWs = @{}
  $sampleCategoryPriv = @{}
  $sampleCategoryWsUnknown = @{}
  $sampleCategoryPrivUnknown = @{}
  $a9Count = 0

  foreach ($proc in $all) {
    $procId = [int]$proc.ProcessId
    $parentId = [int]$proc.ParentProcessId
    $cmd = [string]$proc.CommandLine
    $name = [string]$proc.Name

    $creationKey = Get-ProcessCreationKey $proc
    $isA9 = $include.ContainsKey($creationKey)
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

    $wsRaw = To-UInt64 $proc.WorkingSetSize
    $privRaw = Kb-ToBytes $proc.PageFileUsage
    $peakRaw = Kb-ToBytes $proc.PeakWorkingSetSize
    $ws = if ($null -eq $wsRaw) { $null } else { [double]$wsRaw }
    $priv = if ($privRaw -eq 'UNKNOWN') { $null } else { [double]$privRaw }
    $peakWs = $null
    $handles = To-UInt64 $proc.HandleCount
    $threads = To-UInt64 $proc.ThreadCount
    $kernel = To-UInt64 $proc.KernelModeTime
    $user = To-UInt64 $proc.UserModeTime
    $cpuSeconds = if ($null -eq $kernel -or $null -eq $user) { 'UNKNOWN' } else { (([double]$kernel + [double]$user) / 10000000.0).ToString('0.000', $Invariant) }

    $line = ('{0},{1},{2},{3},{4},{5},{6},{7},{8},{9},{10},{11},{12},{13},{14},{15},{16},{17}' -f $runId, $Scenario, $Label, $ts, $elapsedMs, $sampleDurationMs, $probeDurationMs, $procId, $parentId, $creationKey, $category, $name,
      (Format-Value $wsRaw), (Format-Value $privRaw), (Format-Value $peakRaw), (Format-Value $handles), (Format-Value $threads), $cpuSeconds)
    Add-Content -LiteralPath $samplesPath -Value $line -Encoding ASCII

    if ($isA9) {
      if ($null -ne $ws) { $a9TotalWs = $a9TotalWs + $ws; $a9WsKnown = $a9WsKnown + 1 }
      if ($null -ne $ws) { if (-not $sampleCategoryWs.ContainsKey($category)) { $sampleCategoryWs[$category] = 0 }; $sampleCategoryWs[$category] += $ws } else { $a9WsUnknown = $a9WsUnknown + 1; $sampleCategoryWsUnknown[$category] = $true }
      if ($null -ne $priv) { $a9PrivTotal = $a9PrivTotal + $priv; $a9PrivKnownCount = $a9PrivKnownCount + 1; if (-not $sampleCategoryPriv.ContainsKey($category)) { $sampleCategoryPriv[$category] = 0 }; $sampleCategoryPriv[$category] += $priv } else { $a9PrivUnknown = $a9PrivUnknown + 1; $sampleCategoryPrivUnknown[$category] = $true }
      $a9Count = $a9Count + 1
    } else {
      if ($null -ne $ws) { if (-not $sampleCategoryWs.ContainsKey('env.other')) { $sampleCategoryWs['env.other'] = 0 }; $sampleCategoryWs['env.other'] += $ws }
      else { $sampleCategoryWsUnknown['env.other'] = $true }
      if ($null -ne $priv) { if (-not $sampleCategoryPriv.ContainsKey('env.other')) { $sampleCategoryPriv['env.other'] = 0 }; $sampleCategoryPriv['env.other'] += $priv }
      else { $sampleCategoryPrivUnknown['env.other'] = $true }
    }
  }

  $totalBytes = Kb-ToBytes $os.TotalVisibleMemorySize
  $freeBytes = Kb-ToBytes $os.FreePhysicalMemory
  $commitTotalBytes = Kb-ToBytes $os.TotalVirtualMemorySize
  $commitFreeBytes = Kb-ToBytes $os.FreeVirtualMemory

  $sysLine = ('{0},{1},{2},{3},{4},{5},{6},{7},{8}' -f $runId, $ts, $elapsedMs, $sampleDurationMs, $probeDurationMs, $totalBytes, $freeBytes, $commitTotalBytes, $commitFreeBytes)
  Add-Content -LiteralPath $systemPath -Value $sysLine -Encoding ASCII

  $categoryKeys = @(@($sampleCategoryWs.Keys) + @($sampleCategoryPriv.Keys) + @($sampleCategoryWsUnknown.Keys) + @($sampleCategoryPrivUnknown.Keys) | Sort-Object -Unique)
  foreach ($category in $categoryKeys) {
    Add-Agg -Key $category -Ws $(if ($sampleCategoryWs.ContainsKey($category) -and -not $sampleCategoryWsUnknown.ContainsKey($category)) { $sampleCategoryWs[$category] } else { $null }) -Priv $(if ($sampleCategoryPriv.ContainsKey($category) -and -not $sampleCategoryPrivUnknown.ContainsKey($category)) { $sampleCategoryPriv[$category] } else { $null }) -PeakWs $null
  }
  $totalWsValue = if ($a9WsKnown -gt 0 -and $a9WsUnknown -eq 0 -and -not $state.IdentityUnknown) { $a9TotalWs } else { $null }
  $totalPrivValue = if ($a9PrivKnownCount -gt 0 -and $a9PrivUnknown -eq 0 -and -not $state.IdentityUnknown) { $a9PrivTotal } else { $null }
  if ($state.RootKey -and $a9Count -eq 0 -and -not $state.IdentityUnknown) { $totalWsValue = 0; $totalPrivValue = 0 }
  Add-Agg -Key 'a9.total' -Ws $totalWsValue -Priv $totalPrivValue -PeakWs $totalWsValue
  if ($null -ne $totalWsValue -and $totalBytes -ne 'UNKNOWN' -and [double]$totalBytes -gt 0) {
    $pct = ($a9TotalWs / [double]$totalBytes) * 100.0
    Add-Agg -Key 'a9.total.physical_pct' -Ws $pct -Priv 0 -PeakWs $pct
  }
  if ($a9Count -gt $maxA9Count) { $maxA9Count = $a9Count }

  $sampleIndex = $sampleIndex + 1
  if ($sampleIndex % 12 -eq 0) {
    Write-Host ("  t=" + (Format-Double ($elapsedMs / 1000.0)) + "s a9_processes=" + $a9Count + " a9_ws_mb=" + (Format-Double ($a9TotalWs / 1MB)))
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
  foreach ($metricKey in @('ws', 'priv')) {
    $values = @($agg[$key][$metricKey])
    $metric = if ($key -eq 'a9.total.physical_pct') { 'working_set_sum_pct' } elseif ($metricKey -eq 'ws') { 'ws_bytes' } else { 'private_bytes' }
    if ($key -eq 'a9.total.physical_pct' -and $metricKey -eq 'priv') { continue }
    $minValue = 'UNKNOWN'; $maxValue = 'UNKNOWN'; $medianValue = 'UNKNOWN'; $meanValue = 'UNKNOWN'
    if ($values.Count -gt 0) {
      $minValue = Format-Double (($values | Measure-Object -Minimum).Minimum)
      $maxValue = Format-Double (($values | Measure-Object -Maximum).Maximum)
      $medianValue = Format-Double (Get-Median -Values $values)
      $meanValue = Format-Double (($values | Measure-Object -Average).Average)
    }
    $unknownCount = $agg[$key].samples - $values.Count
    $row = ('{0},{1},{2},{3},{4},{5},{6},{7},{8},{9}' -f $runId, $Scenario, $metric, $key, $values.Count, $unknownCount, $minValue, $medianValue, $meanValue, $maxValue)
    Add-Content -LiteralPath $summaryPath -Value $row -Encoding ASCII
  }
}

$tailLines = @()
$tailLines += ('ended_at=' + (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'))
$tailLines += ('samples_taken=' + $sampleIndex)
$tailLines += ('max_a9_process_count=' + $maxA9Count)
$tailLines += ('final_a9_process_count=' + $a9Count)
$tailLines += ('bound_root_identity=' + $state.RootKey)
$tailLines += 'attribution_limit=Only descendants observed while an identified ancestor was present can be attributed.'
$tailLines += ('residue_note=' + $(if (-not $state.RootKey -or $state.IdentityUnknown) { 'ATTRIBUTION_UNKNOWN' } elseif ($a9Count -eq 0) { 'NO_TRACKED_PROCESS_AT_END' } else { 'A9_PROCESSES_STILL_RUNNING_AT_END' }))
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

<#
  run-startup-baseline.ps1

  A9-17 before/after startup A/B orchestrator for Windows 7 SP1 x64 / Windows 10.

  This script is deliberately THIN. All sampling is delegated to the already
  vetted read-only sampler a9_win7_memory_baseline.ps1; this script only seeds
  history, launches the product, starts the sampler at t=0, and records the run
  manifest. It never inspects or modifies the product's internals.

  Invariants:
    - Read-only with respect to the OS: no registry, service, network or system
      configuration change. No elevation required or wanted.
    - Writes only under -OutDir.
    - Does NOT produce a Win7 PASS, does NOT change any PERFORMANCE_BUDGET cell,
      and does NOT authorise a release. It is measurement scaffolding only.
    - ASCII-only literals: Windows PowerShell 2.0/5.1 read UTF-8-without-BOM as
      ANSI, so non-ASCII would be corrupted. Outputs use -Encoding ASCII.
    - Compatible with Windows PowerShell 2.0 (Win7 default): no $PSScriptRoot,
      no [pscustomobject], no Get-CimInstance, no classes.

  True cold start cannot be forced by a script. Run one repetition per boot with
  -Thermal Cold and append to the same -OutDir; the operator controls the reboot.

  Usage:
    powershell -ExecutionPolicy Bypass -File .\run-startup-baseline.ps1 `
      -BeforeRepo "D:\cand\before" -AfterRepo "D:\cand\after" `
      -ElectronExe "D:\cand\before\node_modules\electron\dist\electron.exe" `
      -OutDir "D:\a9-ab\A9-AB-20260913-01" `
      -HistoryCounts 0,1000,5000 -Repetitions 3 -Thermal Warm `
      -DurationSeconds 60 -IntervalSeconds 1

    powershell -ExecutionPolicy Bypass -File .\run-startup-baseline.ps1 -DryRun ...
#>
[CmdletBinding()]
param(
  [string]$BeforeRepo = '',
  [string]$AfterRepo = '',
  [string]$OutDir = "$env:USERPROFILE\a9-startup-baseline",
  [string]$ElectronExe = '',
  [int[]]$HistoryCounts = @(0, 1000, 5000),
  [int]$Repetitions = 3,
  [ValidateSet('Cold', 'Warm')]
  [string]$Thermal = 'Warm',
  [int]$DurationSeconds = 60,
  [int]$IntervalSeconds = 1,
  [string]$SamplerPath = '',
  [string]$CandidateNote = 'UNSET',
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$driverPath = Join-Path $scriptDir 'driver-startup.cjs'
$seederPath = Join-Path $scriptDir 'seed-history.cjs'
if ([string]::IsNullOrEmpty($SamplerPath)) {
  $SamplerPath = Join-Path (Split-Path -Parent $scriptDir) 'a9_win7_memory_baseline.ps1'
}

function Fail {
  param([string]$Message)
  Write-Host ('FAILED: ' + $Message)
  exit 1
}

function Quote-Arg {
  param([string]$Value)
  if ($Value -match '\s') { return ('"' + $Value + '"') }
  return $Value
}

function Assert-Inputs {
  if (-not $BeforeRepo) { Fail '-BeforeRepo is required' }
  if (-not $AfterRepo) { Fail '-AfterRepo is required' }
  if (-not (Test-Path -LiteralPath $BeforeRepo)) { Fail ('BeforeRepo not found: ' + $BeforeRepo) }
  if (-not (Test-Path -LiteralPath $AfterRepo)) { Fail ('AfterRepo not found: ' + $AfterRepo) }
  if (-not $ElectronExe) { Fail '-ElectronExe is required' }
  if (-not (Test-Path -LiteralPath $ElectronExe)) { Fail ('ElectronExe not found: ' + $ElectronExe) }
  if (-not (Test-Path -LiteralPath $driverPath)) { Fail ('driver not found: ' + $driverPath) }
  if (-not (Test-Path -LiteralPath $seederPath)) { Fail ('seeder not found: ' + $seederPath) }
  if (-not (Test-Path -LiteralPath $SamplerPath)) { Fail ('sampler not found: ' + $SamplerPath) }
  foreach ($repo in @($BeforeRepo, $AfterRepo)) {
    $main = Join-Path $repo 'src\shell\product\main.js'
    if (-not (Test-Path -LiteralPath $main)) { Fail ('repo does not look like an A9 source tree (missing src\shell\product\main.js): ' + $repo) }
  }
}

# The before/after identity must be recorded, not assumed: an operator who passes
# the same tree twice would otherwise get a meaningless "no difference" result.
function Get-TreeFingerprint {
  param([string]$Repo)
  $relative = @(
    'src\shell\product\main.js',
    'src\shell\product\a9-agent-runtime.js',
    'src\shell\product\a9-product-ipc.js',
    'src\shell\product\preload.js',
    'src\shell\product\renderer\a9-workbench.js',
    'src\state\src\a9-persistence.ts'
  )
  $lines = @()
  foreach ($item in $relative) {
    $full = Join-Path $Repo $item
    $hash = ''
    if (Test-Path -LiteralPath $full) {
      $sha = [System.Security.Cryptography.SHA256]::Create()
      $stream = $null
      try {
        $stream = [System.IO.File]::OpenRead($full)
        $hash = ([System.BitConverter]::ToString($sha.ComputeHash($stream)) -replace '-', '')
      } finally {
        if ($stream) { $stream.Close() }
        $sha.Clear()
      }
    } else {
      $hash = 'MISSING'
    }
    $lines += ($item + '=' + $hash)
  }
  return $lines
}

Assert-Inputs

$beforePrint = Get-TreeFingerprint -Repo $BeforeRepo
$afterPrint = Get-TreeFingerprint -Repo $AfterRepo
$identicalTrees = ($beforePrint -join '|') -eq ($afterPrint -join '|')
if ($identicalTrees) {
  Fail 'BeforeRepo and AfterRepo have identical A9-17 source fingerprints; an A/B run would be meaningless'
}

if (-not (Test-Path -LiteralPath $OutDir)) {
  New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
}

$runsPath = Join-Path $OutDir 'runs.csv'
$runsHeader = 'run_id,variant,scenario,rep,thermal,marks_path,product_pid,started_at'
if (-not (Test-Path -LiteralPath $runsPath)) {
  Add-Content -LiteralPath $runsPath -Value $runsHeader -Encoding ASCII
}

$metaPath = Join-Path $OutDir 'ab-meta.txt'
$metaLines = @()
$metaLines += 'kit=a9-startup-baseline'
$metaLines += ('started_at=' + (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'))
$metaLines += ('host=' + [string]$env:COMPUTERNAME)
$metaLines += ('powershell=' + [string]$PSVersionTable.PSVersion)
$metaLines += ('before_repo=' + $BeforeRepo)
$metaLines += ('after_repo=' + $AfterRepo)
$metaLines += ('electron_exe=' + $ElectronExe)
$metaLines += ('sampler_path=' + $SamplerPath)
$metaLines += ('driver_path=' + $driverPath)
$metaLines += ('seeder_path=' + $seederPath)
$metaLines += ('history_counts=' + ($HistoryCounts -join ';'))
$metaLines += ('repetitions=' + $Repetitions)
$metaLines += ('thermal=' + $Thermal)
$metaLines += ('duration_seconds=' + $DurationSeconds)
$metaLines += ('interval_seconds=' + $IntervalSeconds)
$metaLines += ('candidate_note=' + $CandidateNote)
$metaLines += ('dry_run=' + [string]$DryRun)
$metaLines += '--- before fingerprint ---'
$metaLines += $beforePrint
$metaLines += '--- after fingerprint ---'
$metaLines += $afterPrint
$metaLines += '---'
Add-Content -LiteralPath $metaPath -Value $metaLines -Encoding ASCII

Write-Host 'A9-17 startup A/B orchestrator'
Write-Host ('  before = ' + $BeforeRepo)
Write-Host ('  after  = ' + $AfterRepo)
Write-Host ('  out    = ' + $OutDir)
Write-Host ('  plan   = ' + $HistoryCounts.Count + ' history size(s) x 2 variants x ' + $Repetitions + ' repetition(s), thermal=' + $Thermal)
Write-Host '  sampling is delegated to: ' + $SamplerPath
Write-Host ''

$variants = @(
  @{ Name = 'before'; Repo = $BeforeRepo },
  @{ Name = 'after'; Repo = $AfterRepo }
)

$plan = @()
for ($rep = 1; $rep -le $Repetitions; $rep++) {
  # Clone before reversing: [array]::Reverse mutates in place, so reversing the
  # parameter arrays directly would leak the reversed order into later repetitions
  # and silently destroy the alternation this loop exists to provide.
  [int[]]$scenarios = $HistoryCounts.Clone()
  if ($rep % 2 -eq 0) { [array]::Reverse($scenarios) }
  $order = @($variants.Clone())
  if ($rep % 2 -eq 0) { [array]::Reverse($order) }
  foreach ($count in $scenarios) {
    foreach ($variant in $order) {
      $plan += ,@($variant, $count, $rep)
    }
  }
}

if ($DryRun) {
  Write-Host 'DRY RUN: no seeding, no launch, no sampling'
  foreach ($item in $plan) {
    Write-Host ('  would run: ' + $item[0].Name + ' history=' + $item[1] + ' rep=' + $item[2])
  }
  Write-Host ''
  Write-Host 'sampler self-test (read-only logic only):'
  & powershell -NoProfile -ExecutionPolicy Bypass -File $SamplerPath -TestMode -Scenario dryrun
  exit 0
}

foreach ($item in $plan) {
  $variant = $item[0]
  $count = [int]$item[1]
  $rep = [int]$item[2]
  $runId = ($variant.Name + '-h' + $count + '-' + $Thermal.ToLower() + '-r' + $rep)
  $runDir = Join-Path $OutDir $runId
  if (-not (Test-Path -LiteralPath $runDir)) {
    New-Item -ItemType Directory -Force -Path $runDir | Out-Null
  }
  $marksPath = Join-Path $runDir 'marks.json'

  Write-Host ('--- ' + $runId + ' ---')

  $seedArgs = @($seederPath, ('--repo=' + (Quote-Arg $variant.Repo)), ('--root=' + (Quote-Arg $runDir)), ('--count=' + $count))
  $seed = Start-Process -FilePath $ElectronExe -ArgumentList $seedArgs -Wait -PassThru -NoNewWindow
  if ($seed.ExitCode -ne 0) { Fail ('seeding failed for ' + $runId + ' (exit ' + $seed.ExitCode + ')') }
  if (-not (Test-Path -LiteralPath (Join-Path $runDir 'seed.json'))) { Fail ('seeder produced no seed.json for ' + $runId) }

  $env:A9_REPO = $variant.Repo
  $env:A9_MEASURE_OUTPUT = $marksPath
  $env:A9_MEASURE_DURATION_MS = [string]($DurationSeconds * 1000)
  $env:WIN7AGENT_A9_DATAROOT = (Join-Path $runDir 'data')
  $env:WIN7AGENT_A9_WORKSPACE = (Join-Path $runDir 'workspace')

  # Start the sampler first so its t=0 covers the product's t=0. The sampler
  # binds the target lazily by PID, so starting before the product is safe.
  $samplerArgs = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', (Quote-Arg $SamplerPath),
    '-Scenario', $runId,
    '-Label', $runId,
    '-OutDir', (Quote-Arg $OutDir),
    '-IntervalSeconds', [string]$IntervalSeconds,
    '-DurationSeconds', [string]($DurationSeconds + 5),
    '-ElectronName', (Split-Path -Leaf $ElectronExe),
    '-TargetExecutablePath', (Quote-Arg $ElectronExe),
    '-CandidateNote', (Quote-Arg $CandidateNote)
  )
  $sampler = Start-Process -FilePath 'powershell' -ArgumentList $samplerArgs -PassThru -NoNewWindow

  $startedAt = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')
  $product = Start-Process -FilePath $ElectronExe -ArgumentList @((Quote-Arg $driverPath)) -PassThru -NoNewWindow
  Write-Host ('  launched pid=' + $product.Id + ' sampler pid=' + $sampler.Id)

  $waitMs = ($DurationSeconds + 30) * 1000
  if (-not $product.WaitForExit($waitMs)) {
    Write-Host ('  product still running after ' + ($waitMs / 1000) + 's; stopping it')
    try { $product.Kill() } catch { }
    $product.WaitForExit(15000) | Out-Null
  }
  if (-not $sampler.WaitForExit($waitMs)) {
    Write-Host '  sampler still running; stopping it'
    try { $sampler.Kill() } catch { }
    $sampler.WaitForExit(15000) | Out-Null
  }

  if (-not (Test-Path -LiteralPath $marksPath)) {
    Write-Host ('  WARNING: no marks.json for ' + $runId + '; the run is unusable for timing')
  }
  $row = ($runId + ',' + $variant.Name + ',' + $count + ',' + $rep + ',' + $Thermal.ToLower() + ',' +
    $marksPath + ',' + $product.Id + ',' + $startedAt)
  Add-Content -LiteralPath $runsPath -Value $row -Encoding ASCII
  Write-Host ('  done ' + $runId)
}

$tailLines = @()
$tailLines += ('ended_at=' + (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz'))
$tailLines += ('runs_recorded=' + $plan.Count)
$tailLines += 'next_step=node analyze-startup-baseline.mjs <OutDir> --settle-from=45000 --settle-to=59000'
$tailLines += 'reminder=Measurement scaffolding only. Not a Win7 PASS; no PERFORMANCE_BUDGET cell changes.'
$tailLines += '---'
Add-Content -LiteralPath $metaPath -Value $tailLines -Encoding ASCII

Write-Host ''
Write-Host ('all runs recorded in ' + $runsPath)
Write-Host ('run the analyzer: node analyze-startup-baseline.mjs "' + $OutDir + '"')
Write-Host 'REMINDER: this kit produces host measurements only. It is NOT a Win7 PASS'
Write-Host 'and it does NOT change any PERFORMANCE_BUDGET status.'

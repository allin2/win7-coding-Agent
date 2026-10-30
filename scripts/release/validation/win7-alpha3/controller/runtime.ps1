# Fixed PS 2.0/5.1 reader. runtime-data.json is canonical JSON data, never PowerShell text.
# Deliberately accept only this flat ASCII projection; no Invoke-Expression, eval or JSON module.
$ErrorActionPreference = 'Stop'
$runtimeDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$runtimeFile = Join-Path $runtimeDirectory 'runtime-data.json'
function Assert-RuntimePath([string]$file) {
  $at = [IO.Path]::GetFullPath($file)
  while ($null -ne $at) {
    if (([IO.File]::GetAttributes($at) -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'RUNTIME_REPARSE_POINT' }
    $at = [IO.Path]::GetDirectoryName($at)
  }
}
Assert-RuntimePath $runtimeFile
$runtimeInfo = New-Object IO.FileInfo $runtimeFile
if (-not $runtimeInfo.Exists -or $runtimeInfo.Length -gt 65536) { throw 'RUNTIME_DATA_BOUND' }
$runtimeText = [IO.File]::ReadAllText($runtimeFile,(New-Object Text.UTF8Encoding($false,$true)))
$phaseList = '"p[0-9]{2}-[a-z][a-z0-9-]*"(?:,"p[0-9]{2}-[a-z][a-z0-9-]*")*'
$dispatchList = '"(?:p[0-9]{2}-[a-z][a-z0-9-]*|gpu-entry-gate)"(?:,"(?:p[0-9]{2}-[a-z][a-z0-9-]*|gpu-entry-gate)")*'
$pattern = '\A\{"schema_version":1,"run_id":"(?<id>[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})","remote_root":"C:\\\\A9-DEV\\\\run\\\\(?<prefix>[a-f0-9]{8})","task_prefix":"A9-DEV-(?<task>[a-f0-9]{8})-","evidence_class":"(?<class>DEV_CHANNEL|FORMAL_GATE_A_EXECUTION)","target_session_id":(?<session>[1-9][0-9]{0,8}),"expires_at_utc":"(?<end>[0-9TZ:.\-]+)","products":\[(?<products>' + $phaseList + ')\],"dispatch":\[(?<dispatch>' + $dispatchList + ')\],"seconds":\[(?<seconds>[1-9][0-9]{0,4}(?:,[1-9][0-9]{0,4})*)\]\}\n\z'
$runtimeMatch = [regex]::Match($runtimeText,$pattern)
if (-not $runtimeMatch.Success) { throw 'RUNTIME_DATA_SCHEMA' }
$RunId = $runtimeMatch.Groups['id'].Value
if ($RunId.Substring(0,8) -cne $runtimeMatch.Groups['prefix'].Value -or $RunId.Substring(0,8) -cne $runtimeMatch.Groups['task'].Value) { throw 'RUNTIME_RUN_ROOT' }
$root = 'C:\A9-DEV\run\' + $RunId.Substring(0,8)
$TaskPrefix = 'A9-DEV-' + $RunId.Substring(0,8) + '-'
$EvidenceClass = $runtimeMatch.Groups['class'].Value
$TargetSession = [int]$runtimeMatch.Groups['session'].Value
$RuntimeExpires = [DateTime]::Parse($runtimeMatch.Groups['end'].Value,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
if ([DateTime]::UtcNow -ge $RuntimeExpires) { throw 'RUNTIME_EXPIRED' }
$ProductStages = @($runtimeMatch.Groups['products'].Value.Split(',') | ForEach-Object { $_.Trim('"') })
$DispatchStages = @($runtimeMatch.Groups['dispatch'].Value.Split(',') | ForEach-Object { $_.Trim('"') })
$DispatchPhaseSeconds = @($runtimeMatch.Groups['seconds'].Value.Split(',') | ForEach-Object { [int]$_ })
$expectedProducts = @('p01-env','p02-integrity','p03-chain','p04-streaming','p05-session-bg','p06-continue','p07-safe','p08-ui','p09-report','p10-postflight')
$expectedDispatch = @('p01-env','p02-integrity','gpu-entry-gate','p03-chain','p04-streaming','p05-session-bg','p06-continue','p07-safe','p08-ui','p09-report','p10-postflight')
$ceilings = @(600,600,120,1380,1620,600,600,10740,600,300,600)
if (($ProductStages -join ',') -cne ($expectedProducts -join ',') -or ($DispatchStages -join ',') -cne ($expectedDispatch -join ',') -or $DispatchPhaseSeconds.Count -ne $expectedDispatch.Count) { throw 'RUNTIME_FULL_PLAN' }
for ($i = 0; $i -lt $DispatchPhaseSeconds.Count; $i++) { if ($DispatchPhaseSeconds[$i] -gt $ceilings[$i]) { throw 'RUNTIME_PHASE_CEILING' } }
$GateStage = 'gpu-entry-gate'
$GateStageIndex = 2
$ProductPhaseSeconds = @()
$RequestDirectories = @()
for ($i = 0; $i -lt $ProductStages.Count; $i++) {
  $index = [Array]::IndexOf($DispatchStages,$ProductStages[$i])
  $ProductPhaseSeconds += $DispatchPhaseSeconds[$index]
  $RequestDirectories += (($i + 1).ToString('00') + '-' + $ProductStages[$i])
}

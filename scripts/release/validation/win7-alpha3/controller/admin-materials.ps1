# Candidate-external, fixed roots only. Never launches electron or creates an agent request.
param([string]$Action,[string]$Phase,[int]$TreeSeconds=28)
$ErrorActionPreference = 'Stop'
. (Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) '..\external\runtime.ps1')
. (Join-Path $root 't\tools\launcher-common.ps1')
$work = Join-Path $root 'w'
$prep = Join-Path $root 't'
$allowed = $DispatchStages
$times = $DispatchPhaseSeconds
# This data is transferred under the same R3 SHA readback and runtime-input map as all executable bytes.
$packageFile = Join-Path $prep 'external\package-data.json'
Safe $packageFile
if ((New-Object IO.FileInfo $packageFile).Length -gt 4096) { throw 'PACKAGE_DATA_BOUND' }
$packageText = [IO.File]::ReadAllText($packageFile,(New-Object Text.UTF8Encoding($false,$true)))
$packagePattern = '\A\{"schema_version":1,"run_id":"(?<id>[a-f0-9-]{36})","zip_top":"(?<top>[A-Za-z0-9][A-Za-z0-9_.-]{0,126})","zip_entries":(?<count>[1-9][0-9]{0,4}),"zip_sha256":"(?<zip>[a-f0-9]{64})","inventory_sha256":"(?<inventory>[a-f0-9]{64})","account_sid":"(?<sid>S-1-5-21-[0-9-]+)"\}\n\z'
$packageMatch = [regex]::Match($packageText,$packagePattern)
if (-not $packageMatch.Success -or $packageMatch.Groups['id'].Value -cne $RunId -or $packageMatch.Groups['top'].Value.EndsWith('.') -or [int]$packageMatch.Groups['count'].Value -ge 65535) { throw 'PACKAGE_DATA_SCHEMA_OR_RUN' }
function Hash-AdminFile([string]$file) {
  Safe $file; $stream = [IO.File]::OpenRead($file); $hash = [Security.Cryptography.SHA256]::Create()
  try { return [BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-','').ToLowerInvariant() } finally { $hash.Dispose(); $stream.Close() }
}
function Assert-TaskRoot {
  if ($root -cne ('C:\A9-DEV\run\' + $RunId.Substring(0,8)) -or [IO.Path]::GetFullPath($root) -cne $root -or $root -cnotmatch '^C:\\A9-DEV\\run\\[a-f0-9]{8}$') { throw 'TASK_ROOT_ARGUMENT' }
  Safe $root
}
Assert-TaskRoot
function Phase-Index {
  if ($allowed -cnotcontains $Phase) { throw 'PHASE_OUTSIDE_P1' }
  return [Array]::IndexOf($allowed,$Phase)
}
function Stop-Latch([string]$step) {
  $file = Join-Path $root 'e\rehearsal-stop.json'
  if (-not (Test-Path -LiteralPath $file)) {
    $f = [System.IO.File]::Open($file,[System.IO.FileMode]::CreateNew,[System.IO.FileAccess]::Write,[System.IO.FileShare]::None)
    try { $b = (New-Object System.Text.UTF8Encoding($false)).GetBytes('{"halted":true,"evidence_class":"' + $EvidenceClass + '","step":"' + $step + '","message":"ADMIN_WAIT_OR_MARKER_FAILURE"}'); $f.Write($b,0,$b.Length) } finally { $f.Close() }
  }
}
function Connect-Scheduler {
  $svc = New-Object -ComObject 'Schedule.Service'
  $svc.Connect()
  return $svc.GetFolder('\')
}
function Compare-Task($task,[string]$expected) {
  # schtasks receives ASCII/LF XML without a declaration (A9-36 r5 Win7 precedent).
  $inputBytes = [System.IO.File]::ReadAllBytes($expected)
  foreach ($b in $inputBytes) { if ($b -gt 127 -or $b -eq 13) { throw 'TASK_INPUT_NOT_ASCII_LF' } }
  $inputXml = [System.Text.Encoding]::ASCII.GetString($inputBytes)
  if ($inputXml -match '(?i)^\s*<\?xml\b') { throw 'TASK_INPUT_XML_DECLARATION' }
  [xml]$want = $inputXml
  if ($inputXml.IndexOf('$(Arg0)',[StringComparison]::Ordinal) -lt 0) { throw 'TASK_ROOT_PLACEHOLDER' }
  # Scheduler may add a UTF-16 declaration to its COM string. Compare XML fields,
  # independently of that declaration; preserve the original readback in evidence.
  $readbackXml = [regex]::Replace($task.Xml,'(?is)^\s*<\?xml\b.*?\?>\s*','')
  [xml]$got = $readbackXml
  $ns1 = New-Object System.Xml.XmlNamespaceManager($want.NameTable); $ns1.AddNamespace('t','http://schemas.microsoft.com/windows/2004/02/mit/task')
  $ns2 = New-Object System.Xml.XmlNamespaceManager($got.NameTable); $ns2.AddNamespace('t','http://schemas.microsoft.com/windows/2004/02/mit/task')
  foreach ($xp in @('//t:Principals/t:Principal/t:UserId','//t:Principals/t:Principal/t:LogonType','//t:Principals/t:Principal/t:RunLevel','//t:Actions/t:Exec/t:Command','//t:Actions/t:Exec/t:Arguments','//t:Actions/t:Exec/t:WorkingDirectory','//t:RegistrationInfo/t:Description')) {
    $a = $want.SelectSingleNode($xp,$ns1); $b = $got.SelectSingleNode($xp,$ns2)
    if ($a -eq $null -or $b -eq $null -or $a.InnerText -cne $b.InnerText) { throw 'TASK_READBACK_MISMATCH' }
  }
  foreach ($node in $want.SelectNodes('//t:Settings/*',$ns1)) {
    $b = $got.SelectSingleNode(('//t:Settings/t:' + $node.LocalName),$ns2)
    if ($b -eq $null) { throw 'TASK_SETTINGS_MISSING' }
    if ($node.LocalName -ceq 'ExecutionTimeLimit') {
      if ([System.Xml.XmlConvert]::ToTimeSpan($b.InnerText) -ne [System.Xml.XmlConvert]::ToTimeSpan($node.InnerText)) { throw 'TASK_DURATION_MISMATCH' }
    } elseif ($b.InnerText -cne $node.InnerText) { throw 'TASK_SETTINGS_MISMATCH' }
  }
  if ($got.SelectNodes('//t:Triggers/*',$ns2).Count -ne 0 -or $got.SelectNodes('//t:Actions/*',$ns2).Count -ne 1 -or $got.SelectNodes('//t:Principals/*',$ns2).Count -ne 1 -or $got.SelectNodes('//t:RestartOnFailure',$ns2).Count -ne 0) { throw 'TASK_EXTRA_ACTION_OR_TRIGGER' }
  if ($want.SelectSingleNode('//t:Principals/t:Principal/t:UserId',$ns1).InnerText -cne $packageMatch.Groups['sid'].Value) { throw 'TASK_BOUND_SID' }
  return $task.Xml
}
try {
  if ($Action -ceq 'Expand' -or $Action -ceq 'TreeHash') {
    $treeClock = [Diagnostics.Stopwatch]::StartNew()
    Add-Type -Path (Join-Path $prep 'tools\admin-zip.cs')
    if ($Action -ceq 'Expand') {
      if ((Hash-AdminFile (Join-Path $prep 'ZIP_ENTRIES.tsv')) -cne $packageMatch.Groups['inventory'].Value) { throw 'ZIP_INVENTORY_HASH' }
      [RehearsalZip]::Expand((Join-Path $work 'package\candidate.zip'),(Join-Path $root 'p'),(Join-Path $prep 'ZIP_ENTRIES.tsv'),$packageMatch.Groups['zip'].Value,$packageMatch.Groups['top'].Value,[int]$packageMatch.Groups['count'].Value)
      Write-Output ('EXPANDED_BOUND_ENTRIES_HASH_VERIFIED')
    } else {
      $left = [int][Math]::Floor($TreeSeconds - $treeClock.Elapsed.TotalSeconds)
      if ($left -lt 1 -or $TreeSeconds -gt 28) { throw 'TREE_HASH_DEADLINE' }
      [RehearsalZip]::TreeBounded($root,$left) | ForEach-Object { Write-Output ($_) }
    }
  } elseif (@('Register','ReadTask','DeleteTask','RunWait') -ccontains $Action) {
    $index = Phase-Index
    $name = $TaskPrefix + $Phase
    $templateFile = Join-Path $prep ('tasks\' + $Phase + '.xml')
    $taskDir = Join-Path $work 'tasks'; [void][IO.Directory]::CreateDirectory($taskDir)
    $xmlFile = Join-Path $taskDir ($Phase + '.xml')
    if ($Action -ceq 'Register') {
      $template = [IO.File]::ReadAllText($templateFile,[Text.Encoding]::ASCII)
      # Fixed XML source bytes are in the shared input map; only Run receives the validated root.
      Write-Once $xmlFile $template
    }
    $folder = Connect-Scheduler
    if ($Action -ceq 'Register') {
      & "$env:SystemRoot\System32\schtasks.exe" /Create /TN $name /XML $xmlFile
      if ($LASTEXITCODE -ne 0) { throw 'TASK_REGISTER_FAILED' }
    }
    if ($Action -ceq 'Register' -or $Action -ceq 'ReadTask') {
      $text = Compare-Task ($folder.GetTask($name)) $templateFile
      [void][System.IO.Directory]::CreateDirectory((Join-Path $work 'task-readback'))
      Write-Once (Join-Path $work ('task-readback\' + $Phase + '-' + $Action + '-' + $PID + '.xml')) $text
      Write-Output ('TASK_READBACK_MATCH')
    } elseif ($Action -ceq 'RunWait') {
      try {
        $task = $folder.GetTask($name)
        [void](Compare-Task $task $templateFile)
        if (Test-Path -LiteralPath (Join-Path $root 'e\rehearsal-stop.json')) { throw 'PREVIOUS_EXTERNAL_FAILURE' }
        $raw = [System.IO.File]::ReadAllText((Join-Path $prep 'activation-evidence\activation.json'),[System.Text.Encoding]::UTF8)
        $match = [regex]::Matches($raw,'"common_deadline_utc"\s*:\s*"([0-9TZ:.\-]+)"')
        if ($match.Count -ne 1) { throw 'COMMON_DEADLINE_MISSING' }
        $deadline = [DateTime]::Parse($match[0].Groups[1].Value,[System.Globalization.CultureInfo]::InvariantCulture,[System.Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
        if ([DateTime]::UtcNow.AddSeconds($times[$index] + 1800) -gt $deadline) { throw 'INSUFFICIENT_COMMON_TIME' }
        Assert-TaskRoot
        [void]$task.Run([string]$root)
        $phaseDeadline = [DateTime]::UtcNow.AddSeconds($times[$index])
        while (-not (Test-Path -LiteralPath (Join-Path $work ($Phase + '.done')))) {
          if ([DateTime]::UtcNow -ge $deadline -or [DateTime]::UtcNow -ge $phaseDeadline) { throw 'TASK_WAIT_DEADLINE' }
          Start-Sleep -Seconds 15
          $task = $folder.GetTask($name)
          if ($task.State -ne 4 -and -not (Test-Path -LiteralPath (Join-Path $work ($Phase + '.done')))) { throw 'TASK_EXIT_WITHOUT_DONE' }
        }
        $task = $folder.GetTask($name)
        while ($task.State -eq 4 -and [DateTime]::UtcNow -lt $phaseDeadline -and [DateTime]::UtcNow -lt $deadline) { Start-Sleep -Milliseconds 200; $task = $folder.GetTask($name) }
        if (([System.IO.File]::ReadAllText((Join-Path $work ($Phase + '.done'))) -cne '0' -and $Phase -cne $GateStage) -or $task.State -eq 4) { throw 'TASK_NONZERO_OR_STILL_RUNNING' }
        Write-Output ('TASK_DONE_ZERO_CHECK_LEDGER_AND_RESULT_BEFORE_NEXT_PHASE')
      } catch { Stop-Latch 'admin_wait'; throw }
      finally {
        # Exactly one bound task; no wildcard, history-task or file deletion.
        $boundTask = $folder.GetTask($name)
        [void](Compare-Task $boundTask $templateFile)
        $folder.DeleteTask($name,0)
        $still = @($folder.GetTasks(1) | Where-Object { $_.Name -ceq $name })
        if ($still.Count -ne 0) { Stop-Latch 'task_delete_readback'; throw 'TASK_DELETE_READBACK_FAILED' }
        Write-Output ('TASK_DELETED_READBACK_ABSENT')
      }
    } elseif ($Action -ceq 'DeleteTask') {
      [void](Compare-Task ($folder.GetTask($name)) $templateFile)
      $folder.DeleteTask($name,0)
      $still = @($folder.GetTasks(1) | Where-Object { $_.Name -ceq $name })
      if ($still.Count -ne 0) { throw 'TASK_DELETE_READBACK_FAILED' }
      Write-Output ('TASK_DELETED_READBACK_ABSENT')
    }
  } else { throw 'UNKNOWN_ADMIN_ACTION' }
} catch {
  try { Stop-Latch 'admin_material_action' } catch { [Console]::Error.WriteLine('STOP_LATCH_FAILED_ADMIN_MUST_STOP') }
  [Console]::Error.WriteLine(('ADMIN_MATERIAL_ACTION_FAILED:' + (Exception-Detail $_))); exit 1
}

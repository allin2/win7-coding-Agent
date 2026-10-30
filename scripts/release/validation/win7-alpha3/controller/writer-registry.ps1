# Query-only generations; no process termination. PS2 syntax.
. (Join-Path $prep 'tools\environment-process.ps1')
$script:Registered = @{}
$script:Observers = @{}
$script:ExitFacts = @{}
$script:LiveKeys = @{}
$script:EnvironmentLive = 0
$script:GenerationIndex = @{}
$script:CreationCache = @{}
$script:RegistryInitialized = $false
$script:ObservationQuerySeconds = 10
$script:PidQuerySeconds = 2
$script:SlowObservationThresholdSeconds = 2
$script:SlowObservationLimit = 3
$script:SlowObservations = 0
$script:ObservationFaulted = $false
$script:ObservationComplete = $false
$script:LastObservationMs = 0
$script:RegistryRows = 0
$script:RegistryBytes = 0
$script:RegistryLiveLimit = 2048
$script:RegistryRowLimit = 12288
$script:RegistryLineBytes = 2048
$script:RegistryByteLimit = 25178112
function Creation-Ticks([string]$value) {
  if ($value -cnotmatch '^\d{14}\.\d{6}[+-]\d{3}$') { throw 'PROCESS_FIELDS_UNKNOWN' }
  if (-not $script:CreationCache.ContainsKey($value)) { $script:CreationCache[$value] = [Management.ManagementDateTimeConverter]::ToDateTime($value).ToUniversalTime().Ticks }
  return [long]$script:CreationCache[$value]
}
function End-Instance($known) {
  if (-not $known.Ended -and $known.Role -ceq 'environment') { Registry-Append (Environment-Record $known 'ENVIRONMENT_GENERATION_ENDED'); Trace 'environment_generation_ended' (Environment-Record $known 'ENVIRONMENT_GENERATION_ENDED') }
  if ($script:TraceStopped -or $script:TraceTruncated) { $script:ObservationFaulted = $true; throw 'EXIT_EVIDENCE_TRACE_FAILED' }
  $known.Ended = $true
  $script:LiveKeys.Remove((Instance-Key $known))
}
function Index-Generation($known) {
  $id = [string]$known.ProcessId
  if (-not $script:GenerationIndex.ContainsKey($id)) { $script:GenerationIndex[$id] = New-Object Collections.ArrayList }
  $items = $script:GenerationIndex[$id]
  $lo = 0; $hi = $items.Count
  while ($lo -lt $hi) { $mid = [int][Math]::Floor(($lo + $hi) / 2); if ($items[$mid].CreationTicks -gt $known.CreationTicks) { $lo = $mid + 1 } else { $hi = $mid } }
  $items.Insert($lo,$known)
}
function Build-ObservationIndex($all) {
  # One O(H log K + P) preparation per lap; no historical scan per process.
  $script:GenerationIndex = @{}; if ($script:CreationCache.Count -gt 32768) { $script:CreationCache.Clear() }
  foreach ($known in @($script:Registered.Values)) {
    $id = [string]$known.ProcessId
    if (-not $script:GenerationIndex.ContainsKey($id)) { $script:GenerationIndex[$id] = New-Object Collections.ArrayList }
    [void]$script:GenerationIndex[$id].Add($known)
  }
  foreach ($id in @($script:GenerationIndex.Keys)) {
    $sorted = @($script:GenerationIndex[$id] | Sort-Object -Property CreationTicks -Descending)
    $items = New-Object Collections.ArrayList; $items.AddRange($sorted); $script:GenerationIndex[$id] = $items
  }
  $index = @{}; $times = @{}
  foreach ($p in $all) {
    $id = [string]$p.ProcessId
    if ($index.ContainsKey($id)) { throw 'PID_AMBIGUOUS' }
    $index[$id] = $p
    if ([string]$p.CreationDate -cmatch '^\d{14}\.\d{6}[+-]\d{3}$') { $times[$id] = Creation-Ticks $p.CreationDate }
  }
  return (New-Object PSObject -Property @{Rows=$index;Ticks=$times;TaskTicks=(Creation-Ticks $script:TaskInstance.CreationDate)})
}
function Find-ParentGeneration([int]$parentId,[long]$childTicks,$view) {
  $id = [string]$parentId
  $items = $script:GenerationIndex[$id]
  if ($null -eq $items) { return $null }
  $lo = 0; $hi = $items.Count
  while ($lo -lt $hi) { $mid = [int][Math]::Floor(($lo + $hi) / 2); if ($items[$mid].CreationTicks -ge $childTicks) { $lo = $mid + 1 } else { $hi = $mid } }
  if ($lo -ge $items.Count) { return $null }
  $parent = $items[$lo]; $currentParent = $view.Rows[$id]
  if ($null -ne $currentParent -and [string]$currentParent.CreationDate -cne [string]$parent.CreationDate -and ($null -eq $view.Ticks[$id] -or $childTicks -ge $view.Ticks[$id])) { return $null }
  return $parent
}
function Initialize-Registry {
  if ($script:RegistryInitialized) { return }
  # Stages are serial (R6 waits for task exit). This is a whole-run bound across the complete plan dispatch ledger set.
  $script:RegistryRows = 0; $script:RegistryBytes = 0
  $directory = [IO.Path]::GetDirectoryName($script:RegistryFile)
  foreach ($file in @(Get-ChildItem -LiteralPath $directory -Filter '*-registry.jsonl' -ErrorAction Stop)) {
    Safe $file.FullName
    $script:RegistryBytes += $file.Length
    if ($script:RegistryBytes -gt $script:RegistryByteLimit) { throw 'REGISTRY_ROW_BOUND' }
    $reader = New-Object IO.StreamReader($file.FullName,$Utf8)
    try { while ($null -ne ($line = $reader.ReadLine())) { $script:RegistryRows++; if ($script:RegistryRows -gt $script:RegistryRowLimit -or $Utf8.GetByteCount($line) -gt $script:RegistryLineBytes) { throw 'REGISTRY_ROW_BOUND' } } } finally { $reader.Close() }
  }
  $script:RegistryInitialized = $true
}
function Instance-Key($p) { return ([string]$p.ProcessId + '|' + [string]$p.CreationDate) }
function Query-PidBounded([int]$processId) {
  $query = New-Object Management.ManagementObjectSearcher
  $query.Query = New-Object Management.ObjectQuery ('SELECT * FROM Win32_Process WHERE ProcessId=' + $processId)
  $query.Options.Timeout = $([TimeSpan]::FromSeconds($script:PidQuerySeconds))
  $before = Ticks
  try { $rows = @($query.Get()); if ((Seconds-Left ($before + [long]($script:PidQuerySeconds * $Frequency))) -lt 0) { throw 'FRESH_QUERY_TIMEOUT' }; return ,$rows }
  finally { $query.Dispose() }
}
function Tree-Snapshot([long]$deadline) {
  # Observation only: a slow/incomplete table is never an empty-table proof.
  $script:ObservationComplete = $false
  $before = Ticks; $remaining = Seconds-Left $deadline
  if ($remaining -le 0) { return $null }
  $seconds = [Math]::Min($script:ObservationQuerySeconds,$remaining)
  $query = New-Object Management.ManagementObjectSearcher
  $query.Query = New-Object Management.ObjectQuery 'SELECT * FROM Win32_Process'
  $query.Options.Timeout = [TimeSpan]::FromSeconds($seconds)
  $rows = @(); $timedOut = $false
  try {
    try { $rows = @($query.Get()); $script:ObservationComplete = $true }
    catch {
      $cause = $_.Exception
      while ($null -ne $cause) { if ($cause -is [Management.ManagementException] -and $cause.ErrorCode.ToString() -match '^(Timedout|Timeout)$') { $timedOut = $true }; $cause = $cause.InnerException }
      if (-not $timedOut -and (Seconds-Left ($before + [long]($seconds * $Frequency))) -gt 0) { throw }
    }
  } finally { $query.Dispose() }
  $script:LastObservationMs = [double]((Ticks) - $before) * 1000 / $Frequency
  if ($script:LastObservationMs -gt ($seconds * 1000)) { $script:ObservationComplete = $false }
  $slow = (-not $script:ObservationComplete -or $script:LastObservationMs -gt ($script:SlowObservationThresholdSeconds * 1000))
  if ($slow) { $script:SlowObservations++ } else { $script:SlowObservations = 0 }
  if ($slow) { Trace 'slow_observation' ('{"query_ms":' + $script:LastObservationMs.ToString('0.###',[Globalization.CultureInfo]::InvariantCulture) + ',"consecutive":' + $script:SlowObservations + ',"complete":' + (B $script:ObservationComplete) + '}') }
  if (-not $script:ObservationComplete) { return $null }
  if ($rows.Count -gt 10000) { throw 'PROCESS_TABLE_BOUND' }
  return ,$rows
}
function Exited-Row($p) {
  # Zero threads cannot write. This only classifies a row; it authorizes no termination.
  return ([string]$p.CreationDate -cmatch '^\d{14}\.\d{6}[+-]\d{3}$' -and $null -ne $p.ThreadCount -and [int]$p.ThreadCount -eq 0 -and [string]::IsNullOrEmpty($p.CommandLine) -and [string]::IsNullOrEmpty($p.ExecutablePath))
}
function Registered-Zombie($p,$known) {
  # Zero threads cannot write. Identity remains exact for gate termination/readback.
  return ($null -ne $known -and [int]$p.ProcessId -eq $known.ProcessId -and [string]$p.CreationDate -ceq [string]$known.CreationDate -and $null -ne $p.ThreadCount -and [int]$p.ThreadCount -eq 0 -and [string]::IsNullOrEmpty($p.CommandLine) -and [string]::IsNullOrEmpty($p.ExecutablePath))
}
function Registry-Append([string]$line) {
  $size = $Utf8.GetByteCount($line)
  if ($size -gt $script:RegistryLineBytes) { throw 'REGISTRY_ROW_BOUND' }
  Initialize-Registry
  if ($script:RegistryRows -ge $script:RegistryRowLimit -or $script:RegistryBytes + $size + 1 -gt $script:RegistryByteLimit) { Trace 'registry_row_bound' ('{"rows":' + $script:RegistryRows + ',"bytes":' + $script:RegistryBytes + '}'); throw 'REGISTRY_ROW_BOUND' }
  [IO.File]::AppendAllText($script:RegistryFile,$line + "`n",$Utf8)
  $script:RegistryRows++; $script:RegistryBytes += $size + 1
}
function Audit-Exited($p,$parent) {
  $key = Instance-Key $p
  if ($script:Registered.ContainsKey($key)) { End-Instance $script:Registered[$key]; return }
  $parentDate = $null; if ($null -ne $parent) { $parentDate = [string]$parent.CreationDate }
  $known = New-Object PSObject -Property @{ProcessId=[int]$p.ProcessId;ParentProcessId=[int]$p.ParentProcessId;CreationDate=[string]$p.CreationDate;ParentKey=$(if ($null -ne $parent) { Instance-Key $parent } else { '' });Ended=$true;AuditExited=$true;CreationTicks=(Creation-Ticks $p.CreationDate);Handle=$false;Role='descendant';ExecutablePath='';CommandLine=''}
  Registry-Append ('{"schema":"writer-registry-v2","role":"descendant","state":"EXITED_BEFORE_REGISTER","pid":' + $p.ProcessId + ',"ppid":' + $p.ParentProcessId + ',"creation_date":' + (J $p.CreationDate) + ',"parent_creation_date":' + (J $parentDate) + ',"handle":false,"os_exit_observed":"UNKNOWN"}')
  $script:Registered[$key] = $known
  Index-Generation $known
  Trace 'EXITED_BEFORE_REGISTER' ('{"pid":' + $p.ProcessId + ',"ppid":' + $p.ParentProcessId + ',"creation_date":' + (J $p.CreationDate) + '}')
}
function Recheck-Exited($p,$parent) {
  $fresh = Query-PidBounded ([int]$p.ProcessId)
  $script:FreshRegistrationRows = $fresh
  if ($fresh.Count -eq 0 -or ($fresh.Count -eq 1 -and [string]$fresh[0].CreationDate -ceq [string]$p.CreationDate -and (Exited-Row $fresh[0]))) { Audit-Exited $p $parent; return $true }
  return $false
}
function Register-Instance($p,[string]$role,$parent) {
  if (Test-EnvironmentProcess $p.ExecutablePath) { $role = 'environment' }
  if ([string]$p.CreationDate -cnotmatch '^\d{14}\.\d{6}[+-]\d{3}$') { throw 'PROCESS_FIELDS_UNKNOWN' }
  $key = Instance-Key $p
  if ($script:Registered.ContainsKey($key)) { if ($script:Registered[$key].AuditExited -and -not (Exited-Row $p)) { throw 'EXITED_ROW_BECAME_LIVE' }; if ($role -cne 'descendant') { $script:Registered[$key].Role = $role }; return }
  # Prior generations commit only after their complete snapshot evidence is recorded in Observe-Tree.
  if ($null -ne $parent -and ([int]$p.ParentProcessId -ne [int]$parent.ProcessId -or (Creation-Ticks $p.CreationDate) -le (Creation-Ticks $parent.CreationDate))) { throw 'TREE_PARENT_GENERATION_MISMATCH' }
  if (Exited-Row $p) { if (Recheck-Exited $p $parent) { return }; throw 'PROCESS_FIELDS_UNKNOWN' }
  if ([string]::IsNullOrEmpty($p.ExecutablePath) -or [string]::IsNullOrEmpty($p.CommandLine)) { if (Recheck-Exited $p $parent) { return }; throw 'PROCESS_FIELDS_UNKNOWN' }
  $owner = $null
  try { $owner = $p.GetOwnerSid() } catch { if (Recheck-Exited $p $parent) { return }; throw 'TREE_OWNER_MISMATCH' }
  if ($owner.ReturnValue -ne 0) { if (Recheck-Exited $p $parent) { return }; throw 'TREE_OWNER_MISMATCH' }
  if ($owner.Sid -cne 'S-1-5-21-1708701742-428676696-1831205153-1001') { throw 'TREE_OWNER_MISMATCH' }
  if ($p.SessionId -ne [Diagnostics.Process]::GetCurrentProcess().SessionId) { throw 'TREE_SESSION_MISMATCH' }
  $observer = $null; $hasHandle = $false
  try { $observer = [Diagnostics.Process]::GetProcessById([int]$p.ProcessId); $null = $observer.Handle; $hasHandle = $true }
  catch {
    if ($null -ne $observer) { $observer.Dispose(); $observer = $null }
    if (Recheck-Exited $p $parent) { return }
    # Freshly revalidate still-live identity before accepting WMI-only observation.
    $fresh = $script:FreshRegistrationRows
    if ($fresh.Count -ne 1 -or [string]$fresh[0].CreationDate -cne [string]$p.CreationDate -or [int]$fresh[0].ParentProcessId -ne [int]$p.ParentProcessId -or $fresh[0].ExecutablePath -cne $p.ExecutablePath -or $fresh[0].CommandLine -cne $p.CommandLine -or $fresh[0].SessionId -ne $p.SessionId) { throw 'OBSERVER_HANDLE_UNKNOWN' }
    $freshOwner = $null
    try { $freshOwner = $fresh[0].GetOwnerSid() } catch { if (Recheck-Exited $p $parent) { return }; throw 'TREE_OWNER_MISMATCH' }
    if ($freshOwner.ReturnValue -ne 0) { if (Recheck-Exited $p $parent) { return }; throw 'TREE_OWNER_MISMATCH' }
    if ($freshOwner.Sid -cne $owner.Sid) { throw 'TREE_OWNER_MISMATCH' }
  }
  $live = $script:LiveKeys.Count
  if ($live -ge $script:RegistryLiveLimit) { if ($null -ne $observer) { $observer.Dispose() }; throw 'REGISTRY_BOUND' }
  $known = New-Object PSObject -Property @{ProcessId=[int]$p.ProcessId;ParentProcessId=[int]$p.ParentProcessId;CreationDate=[string]$p.CreationDate;ExecutablePath=[string]$p.ExecutablePath;CurrentExecutablePath=[string]$p.ExecutablePath;CommandLine=[string]$p.CommandLine;ParentKey=$(if ($null -ne $parent) { Instance-Key $parent } else { '' });Ended=$false;AuditExited=$false;CreationTicks=(Creation-Ticks $p.CreationDate);Handle=$hasHandle;Role=$role}
  $job = Launcher-Job ([int]$p.ProcessId)
  $registrationState = 'REGISTERED'; if ($role -ceq 'environment') { $registrationState = 'ENVIRONMENT_REGISTERED' }
  $line = '{"schema":"writer-registry-v2","role":' + (J $role) + ',"state":' + (J $registrationState) + ',"pid":' + $p.ProcessId + ',"ppid":' + $p.ParentProcessId + ',"creation_date":' + (J $p.CreationDate) + ',"image_path":' + (J $p.ExecutablePath) + ',"parent_creation_date":' + (J $(if ($null -ne $parent) { $parent.CreationDate } else { $null })) + ',"handle":' + (B $hasHandle) + ',"os_exit_observed":"UNKNOWN_UNTIL_OBSERVED","job":' + $job.Json + '}'
  try { Registry-Append $line } catch { if ($null -ne $observer) { $observer.Dispose() }; throw }
  $script:Registered[$key] = $known
  $script:LiveKeys[$key] = $true
  Index-Generation $known
  if ($hasHandle) { $script:Observers[$key] = $observer }
}
function Capture-ExitFacts($observer,$known,[string]$key) {
  # Refresh only the original bound object; zero-wait signal admission precedes unchanged fact predicates.
  $stage='OBSERVER_BINDING_INVALID'
  try {
    if ($null -eq $observer -or $null -eq $known -or (Instance-Key $known) -cne $key -or $script:Observers[$key] -ne $observer) {throw 'FIXED'}
    $stage='OBSERVER_REFRESH_THROW';$null=$observer.Refresh()
    $stage='EXIT_SIGNAL_READ_THROW';$signaled=$observer.WaitForExit(0)
    if ($signaled -isnot [bool] -or $signaled -ne $true) {return (New-Object PSObject -Property @{Valid=$false;Reason='EXIT_SIGNAL_NOT_CONFIRMED'})}
    $stage='HAS_EXITED_READ_THROW';$exited=$observer.HasExited
    if ($exited -ne $true) {return (New-Object PSObject -Property @{Valid=$false;Reason='NOT_OBSERVED_EXITED'})}
    $stage='ID_READ_THROW';$observedId=$observer.Id
    $stage='START_TIME_READ_THROW';$started=$observer.StartTime
    $stage='EXIT_TIME_READ_THROW';$ended=$observer.ExitTime
    $stage='EXIT_CODE_READ_THROW';$code=$observer.ExitCode
    $stage='ID_MISMATCH';if ($observedId -ne $known.ProcessId) {throw 'FIXED'}
    $stage='START_TIME_TYPE_INVALID';if ($started -isnot [DateTime]) {throw 'FIXED'}
    $stage='EXIT_TIME_TYPE_INVALID';if ($ended -isnot [DateTime]) {throw 'FIXED'}
    $stage='EXIT_CODE_TYPE_INVALID';if ($code -isnot [int]) {throw 'FIXED'}
    $stage='TIME_CONVERSION_THROW';$startUtc=$started.ToUniversalTime();$endUtc=$ended.ToUniversalTime();$creation=Creation-Ticks $known.CreationDate
    $stage='START_CREATION_MS_MISMATCH';if ([long][Math]::Floor($startUtc.Ticks / 10000) -ne [long][Math]::Floor($creation / 10000)) {throw 'FIXED'}
    $stage='EXIT_TIME_1601';if ($endUtc.Year -le 1601) {throw 'FIXED'}
    $stage='EXIT_BEFORE_CREATION';if ($endUtc.Ticks -lt $creation) {throw 'FIXED'}
    $stage='EXIT_TIME_FUTURE';if ($endUtc -gt [DateTime]::UtcNow) {throw 'FIXED'}
    return (New-Object PSObject -Property @{Valid=$true;Utc=$endUtc.ToString('o');Code=$code;Reason='VALIDATED_HANDLE_EXIT'})
  } catch {return (New-Object PSObject -Property @{Valid=$false;Reason=$stage})}
}
function Commit-GenerationEnd($known,[string]$reason,[string]$exitRejection) {
  if ($known.Ended) { return }
  $row = '{"schema":"writer-registry-v2","role":' + (J $known.Role) + ',"state":"WRITER_GENERATION_ENDED","pid":' + $known.ProcessId + ',"ppid":' + $known.ParentProcessId + ',"creation_date":' + (J $known.CreationDate) + ',"os_exit_observed":"UNKNOWN","reason":' + (J $reason) + '}'
  # Only the same capture's fixed rejection is appended to this existing terminal row.
  if (-not [string]::IsNullOrEmpty($exitRejection)) {
    if (@('OBSERVER_BINDING_INVALID','OBSERVER_REFRESH_THROW','EXIT_SIGNAL_READ_THROW','EXIT_SIGNAL_NOT_CONFIRMED','HAS_EXITED_READ_THROW','NOT_OBSERVED_EXITED','ID_READ_THROW','START_TIME_READ_THROW','EXIT_TIME_READ_THROW','EXIT_CODE_READ_THROW','ID_MISMATCH','START_TIME_TYPE_INVALID','EXIT_TIME_TYPE_INVALID','EXIT_CODE_TYPE_INVALID','TIME_CONVERSION_THROW','START_CREATION_MS_MISMATCH','EXIT_TIME_1601','EXIT_BEFORE_CREATION','EXIT_TIME_FUTURE') -cnotcontains $exitRejection) { throw 'EXIT_REJECTION_REASON_INVALID' }
    $row = $row.Substring(0,$row.Length - 1) + ',"exit_rejection_reason":' + (J $exitRejection) + '}'
  }
  Registry-Append $row
  Trace 'writer_generation_ended' $row
  if ($script:TraceStopped -or $script:TraceTruncated) { throw 'EXIT_EVIDENCE_TRACE_FAILED' }
  End-Instance $known
}
function Observe-Tree($all) {
  if ($script:ObservationFaulted) { throw 'EXIT_OBSERVATION_FAULTED' }
  try {

  if ($null -eq $all -or -not $script:ObservationComplete) { throw 'OBSERVATION_NOT_COMPLETE' }
  $view = Build-ObservationIndex $all
  $generationProof = @{}
  foreach ($known in @($script:Registered.Values)) {
    $row = $view.Rows[[string]$known.ProcessId]
    if (-not $known.AuditExited) { $known.CurrentExecutablePath = $null; if ($null -ne $row -and [string]$row.CreationDate -ceq [string]$known.CreationDate) { $known.CurrentExecutablePath = [string]$row.ExecutablePath } }
    if ($known.AuditExited -and $null -ne $row -and [string]$row.CreationDate -ceq [string]$known.CreationDate -and -not (Exited-Row $row)) { throw 'EXITED_ROW_BECAME_LIVE' }
    if (-not $known.Ended) {
      if ($null -eq $row) { $generationProof[(Instance-Key $known)] = 'ABSENT_COMPLETE_SNAPSHOT' }
      elseif ([string]$row.CreationDate -cnotmatch '^\d{14}\.\d{6}[+-]\d{3}$') { throw 'GENERATION_IDENTITY_UNKNOWN' }
      elseif ([string]$row.CreationDate -cne [string]$known.CreationDate) { $generationProof[(Instance-Key $known)] = 'REPLACED_COMPLETE_SNAPSHOT' }
      elseif (Registered-Zombie $row $known) { $generationProof[(Instance-Key $known)] = 'ZERO_THREADS_EXACT_GENERATION' }
    }
  }
  $pending = @($all); $changed = $true; $round = 0
  while ($changed) {
    $changed = $false; $left = @(); $round++
    if ($round -gt 64) { throw 'TREE_DEPTH_BOUND' }
    foreach ($p in $pending) {
      if ([int]$p.ProcessId -eq $PID) { continue }
      $parent = $null; $childTicks = $view.Ticks[[string]$p.ProcessId]
      if ($null -ne $childTicks) {
        if ([int]$p.ParentProcessId -eq $PID -and $childTicks -gt $view.TaskTicks) { $parent = $script:TaskInstance }
        else { $parent = Find-ParentGeneration ([int]$p.ParentProcessId) ([long]$childTicks) $view }
      }
      if ($null -ne $parent) { Register-Instance $p 'descendant' $parent; $changed = $true } else { $left += $p }
    }
    $pending = $left
  }
  foreach ($unregistered in $pending) {
    if (($unregistered.ExecutablePath -and $unregistered.ExecutablePath.StartsWith(($root + '\'),[StringComparison]::OrdinalIgnoreCase)) -or ($unregistered.CommandLine -and $unregistered.CommandLine.IndexOf($root,[StringComparison]::OrdinalIgnoreCase) -ge 0)) { throw 'UNREGISTERED_RELATED_PROCESS' }
  }
  foreach ($key in @($script:Observers.Keys)) {
    $o = $script:Observers[$key]; $known = $script:Registered[$key]
    $facts = Capture-ExitFacts $o $known $key
    if ($facts.Valid -and -not $script:ExitSeen.ContainsKey($key)) {
      $event = 'descendant_exit_observed'; if ($known.Role -cne 'descendant') { $event = 'os_exit_observed' }
      if ($known.Role -ceq 'environment') { $event = 'environment_exit_observed'; Registry-Append ((Environment-Record $known 'ENVIRONMENT_OS_EXIT_OBSERVED').Replace('"os_exit_observed":"UNKNOWN_UNTIL_HANDLE_OBSERVATION"',('"os_exit_observed":true,"os_exit_utc":' + (J $facts.Utc) + ',"exit_code":' + $facts.Code))) }
      Registry-Append ('{"schema":"writer-registry-v2","role":' + (J $known.Role) + ',"state":"OS_EXIT_OBSERVED","pid":' + $known.ProcessId + ',"creation_date":' + (J $known.CreationDate) + ',"os_exit_observed":true,"os_exit_utc":' + (J $facts.Utc) + ',"exit_code":' + $facts.Code + '}')
      Trace $event ('{"pid":' + $known.ProcessId + ',"creation_date":' + (J $known.CreationDate) + ',"os_exit_utc":' + (J $facts.Utc) + ',"exit_code":' + $facts.Code + '}')
      if ($script:TraceStopped -or $script:TraceTruncated) { throw 'EXIT_EVIDENCE_TRACE_FAILED' }
      End-Instance $known
      $script:ExitFacts[$key] = New-Object PSObject -Property @{Utc=$facts.Utc;Code=$facts.Code}
      $script:ExitSeen[$key] = $true
      $o.Dispose(); $script:Observers.Remove($key)
    } elseif ($generationProof.ContainsKey($key)) {
      Commit-GenerationEnd $known $generationProof[$key] $facts.Reason
      # A proven generation end is not a managed OS exit timestamp or exit code.
      $o.Dispose(); $script:Observers.Remove($key)
    }
  }
  foreach ($key in @($generationProof.Keys)) {
    if (-not $script:Observers.ContainsKey($key)) { Commit-GenerationEnd $script:Registered[$key] $generationProof[$key] }
  }
  } catch { $script:ObservationFaulted = $true; throw }
}

function Count-BlockingWriters {
  if ($script:ObservationFaulted) { throw 'EXIT_OBSERVATION_FAULTED' }
  $count = 0; $script:EnvironmentLive = 0
  foreach ($key in @($script:LiveKeys.Keys)) {
    $known = $script:Registered[$key]
    if ((Test-EnvironmentProcess $known.ExecutablePath) -and (Test-EnvironmentProcess $known.CurrentExecutablePath)) { $script:EnvironmentLive++; continue }
    $count++
  }
  return $count
}
function Wait-Writers([int]$seconds) {
  $until = (Ticks) + [long]($seconds * $Frequency)
  if ($until -gt $script:PhaseEnd) { $until = $script:PhaseEnd }
  while ($true) {
    $lapStart = Ticks
    $all = Tree-Snapshot $until
    $live = -1
    if ($script:ObservationComplete) { Observe-Tree $all; $live = Count-BlockingWriters }
    $lapMs = [double]((Ticks) - $lapStart) * 1000 / $Frequency
    Trace 'writer_wait_lap' ('{"lap_ms":' + $lapMs.ToString('0.###',[Globalization.CultureInfo]::InvariantCulture) + ',"live":' + $live + ',"environment_live":' + $script:EnvironmentLive + ',"complete":' + (B $script:ObservationComplete) + '}')
    # A fresh complete zero-writer proof wins over a slow lap crossing the wait boundary.
    if ($live -eq 0) { Trace 'writers_quiescent' '{"live":0}'; return }
    if ((Ticks) -ge $until -or $script:SlowObservations -ge $script:SlowObservationLimit) { throw 'WRITERS_NOT_QUIESCENT' }
    Start-Sleep -Milliseconds 200
  }
}
function Close-Observers {
  foreach ($key in @($script:Observers.Keys)) { $script:Observers[$key].Dispose() }
  $script:Observers.Clear()
}
function Invoke-E2([string]$exe,[string[]]$arguments,[string]$name,[int]$seconds) {
  if ((Ticks) -ge $script:PhaseEnd) { throw 'E2_DEADLINE_BEFORE_LAUNCH' }
  $stdout = Join-Path $work ('logs\' + $phaseTag + '-' + $name + '-stdout.txt')
  $stderr = Join-Path $work ('logs\' + $phaseTag + '-' + $name + '-stderr.txt')
  $cmdExe = Join-Path $env:SystemRoot 'System32\cmd.exe'
  $argText = E2-Arguments $exe $arguments $stdout $stderr
  $expect = '{"purpose":' + (J $name) + ',"system_root":' + (J $env:SystemRoot) + ',"task":' + (Instance-Json $script:TaskInstance $false) + ',"exe":' + (J $exe) + ',"args":[' + (($arguments | ForEach-Object { J $_ }) -join ',') + '],"stdout":' + (J $stdout) + ',"stderr":' + (J $stderr) + '}'
  Write-Once (Join-Path $work ('observed\' + $phaseTag + '-' + $name + '-launch.json')) $expect
  Trace 'invoke_before' ('{"purpose":' + (J $name) + '}')
  $cmd = $null
  try {
    $cmd = New-Direct $cmdExe $argText
    $null = $cmd.Handle
    $cmdRow = Instance $cmd.Id
    if ($cmdRow.ExecutablePath -ine $cmdExe -or $cmdRow.CommandLine -cne ((Cmd-Path $cmdExe) + ' ' + $argText) -or [int]$cmdRow.ParentProcessId -ne $PID) { throw 'CMD_INSTANCE_MISMATCH' }
    Register-Instance $cmdRow 'cmd' $script:TaskInstance
    Trace 'cmd_spawn' ('{"purpose":' + (J $name) + ',"pid":' + $cmd.Id + ',"creation_date":' + (J $cmdRow.CreationDate) + '}')
    $childRow = $null; $end = (Ticks) + [long]($seconds * $Frequency); if ($end -gt $script:PhaseEnd) { $end = $script:PhaseEnd }
    while (-not $cmd.HasExited) {
      $lapStart = Ticks
      try {
      $snapshot = Tree-Snapshot $end
      if ($script:ObservationComplete) {
      if ($null -eq $childRow) {
        $children = @($snapshot | Where-Object { [int]$_.ParentProcessId -eq $cmd.Id -and $_.ExecutablePath -ieq $exe })
        if ($children.Count -gt 1) { throw 'CHAIN_CHILD_AMBIGUOUS' }
        if ($children.Count -eq 1) {
          $childRow = $children[0]
          Register-Instance $childRow $name $cmdRow
          $chain = '{"schema":"launcher-chain-v2","purpose":' + (J $name) + ',"observed_at_utc":' + (J ([DateTime]::UtcNow.ToString('o'))) + ',"task":' + (Instance-Json $script:TaskInstance $false) + ',"cmd":' + (Instance-Json $cmdRow $true) + ',"child":' + (Instance-Json $childRow $false) + '}'
          Write-Once (Join-Path $work ('observed\' + $phaseTag + '-' + $name + '-chain.json')) $chain
        }
      }
      Observe-Tree $snapshot
      if ($name -ceq 'capturer' -and $null -ne $childRow) {
        $claim = Join-Path $root 'e\gpu-entry-gate\capturer-claim.tsv'; $ack = Join-Path $root 'e\gpu-entry-gate\capturer-ack.tsv'
        if ((Test-Path -LiteralPath $claim) -and -not (Test-Path -LiteralPath $ack)) {
          $claimText = [IO.File]::ReadAllText($claim,$Utf8)
          if ($claimText -cne ([string]$childRow.ProcessId + "`tUNKNOWN`n")) { throw 'CAPTURER_CLAIM_MISMATCH' }
          Write-Once $ack $claimText.TrimEnd("`n")
        }
      }
      }
      if ($script:SlowObservations -ge $script:SlowObservationLimit) { throw 'WRITERS_NOT_QUIESCENT' }
      if ((Ticks) -ge $end) { Trace 'invoke_timeout' ('{"purpose":' + (J $name) + '}'); throw 'E2_WAIT_TIMEOUT' }
      Start-Sleep -Milliseconds 200
      } finally {
      $lapMs = [double]((Ticks) - $lapStart) * 1000 / $Frequency
      Trace 'wait_sample' ('{"purpose":' + (J $name) + ',"cmd_pid":' + $cmd.Id + ',"lap_ms":' + $lapMs.ToString('0.###',[Globalization.CultureInfo]::InvariantCulture) + '}')
      }
    }
    $result = $cmd.ExitCode
    Trace 'cmd_exit' ('{"purpose":' + (J $name) + ',"pid":' + $cmd.Id + ',"os_exit_utc":' + (J $cmd.ExitTime.ToUniversalTime().ToString('o')) + ',"exit_code":' + $result + '}')
    if ($null -eq $childRow) { throw 'CHAIN_CHILD_NOT_OBSERVED' }
    Trace 'wait_return' ('{"purpose":' + (J $name) + ',"exit_code":' + $result + '}')
    return $result
  } finally { if ($null -ne $cmd) { $cmd.Dispose() } }
}

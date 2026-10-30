# Gate-only termination. WMI-only live instances halt; PID generation and parent chain stay exact.
function Assert-GateInstance($p,$known) {
  if ([int]$p.ProcessId -ne [int]$known.ProcessId -or [string]$p.CreationDate -cne [string]$known.CreationDate -or [int]$p.ParentProcessId -ne [int]$known.ParentProcessId -or $p.ExecutablePath -cne $known.ExecutablePath -or $p.CommandLine -cne $known.CommandLine) { throw 'PID_REUSED_OR_TREE_CHANGED' }
  if ([int]$p.SessionId -ne $TargetSession -or -not ([string]$p.ExecutablePath).StartsWith(($root + '\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'GATE_TARGET_NOT_AUTHORIZED' }
  Safe ([string]$p.ExecutablePath)
  $owner = $p.GetOwnerSid()
  if ($owner.ReturnValue -ne 0 -or $owner.Sid -cne 'S-1-5-21-1708701742-428676696-1831205153-1001') { throw 'GATE_OWNER_UNKNOWN' }
  if ([int]$known.ParentProcessId -ne $PID) {
    $parent = $script:Registered[$known.ParentKey]
    if ($null -eq $parent -or (Creation-Ticks $parent.CreationDate) -ge (Creation-Ticks $known.CreationDate)) { throw 'GATE_PARENT_CHAIN_UNKNOWN' }
  }
}
function Confirm-EndedOnce($known,[bool]$successful) {
  if ($successful) { Start-Sleep -Milliseconds 500 }
  # Exactly one fresh bounded requery after a Terminate exception/nonzero result.
  $again = Query-PidBounded ([int]$known.ProcessId)
  if ($again.Count -eq 0) { return 'ALREADY_ENDED' }
  if ($again.Count -ne 1) { throw 'PID_REUSED_READBACK' }
  # Readback only: a different generation proves this registered generation ended.
  if ([string]$again[0].CreationDate -cne [string]$known.CreationDate) {
    Trace 'PID_REUSED_AFTER_END' ('{"pid":' + $known.ProcessId + ',"registered_creation_date":' + (J $known.CreationDate) + ',"current_creation_date":' + (J $again[0].CreationDate) + '}')
    return 'ALREADY_ENDED'
  }
  if (Registered-Zombie $again[0] $known) { return 'ALREADY_ENDED' }
  throw 'TERMINATE_STILL_LIVE'
}
function Cleanup-Gate([long]$cutoff) {
  if ((Ticks) -ge $cutoff) { throw 'GATE_CLEANUP_DEADLINE' }
  $snapshot = Tree-Snapshot $cutoff
  if (-not $script:ObservationComplete) { throw 'GATE_OBSERVATION_INCOMPLETE' }
  Observe-Tree $snapshot
  $items = @()
  foreach ($known in @($script:Registered.Values)) {
    if ($known.Ended) { continue }
    if ((Test-EnvironmentProcess $known.ExecutablePath) -and (Test-EnvironmentProcess $known.CurrentExecutablePath)) { Trace 'environment_cleanup_observed' (Environment-Record $known 'ENVIRONMENT_NOT_TERMINATED'); continue }
    $depth = 0; $ancestor = $known; $seen = @{}
    while ($ancestor.ParentProcessId -ne $PID) { if ($seen.ContainsKey($ancestor.ParentKey) -or -not $script:Registered.ContainsKey($ancestor.ParentKey)) { throw 'GATE_PARENT_CHAIN_UNKNOWN' }; $seen[$ancestor.ParentKey]=$true; $ancestor=$script:Registered[$ancestor.ParentKey]; $depth++; if ($depth -gt 63) { throw 'GATE_DEPTH_BOUND' } }
    $items += (New-Object PSObject -Property @{Known=$known;Depth=$depth})
  }
  foreach ($item in @($items | Sort-Object -Property Depth -Descending)) {
    if ((Ticks) -ge $cutoff) { throw 'GATE_CLEANUP_DEADLINE' }
    $known = $item.Known
    $fresh = @(Get-WmiObject Win32_Process -Filter ('ProcessId=' + $known.ProcessId) -ErrorAction Stop)
    if ($fresh.Count -eq 0) { continue }
    if ($fresh.Count -ne 1) { throw 'GATE_PID_AMBIGUOUS' }
    if (Registered-Zombie $fresh[0] $known) { continue }
    if (-not $known.Handle) { throw 'GATE_WMI_ONLY_NO_TERMINATION' }
    Assert-GateInstance $fresh[0] $known
    try {
      $answer = $fresh[0].Terminate(1)
      if ($answer.ReturnValue -ne 0) { throw 'TERMINATE_NONZERO' }
    } catch { $null = Confirm-EndedOnce $known $false; continue }
    # Successful termination has one bounded fresh readback too; never re-terminate.
    $null = Confirm-EndedOnce $known $true
  }
  if ((Ticks) -ge $cutoff) { throw 'GATE_CLEANUP_DEADLINE' }
  $remaining = 0
  foreach ($known in @($script:Registered.Values)) {
    $left = Query-PidBounded ([int]$known.ProcessId)
    if ($left.Count -eq 0) { continue }
    if ($left.Count -ne 1) { throw 'GATE_REGISTERED_REMAINS' }
    # No termination here, including historical ended generations.
    if ([string]$left[0].CreationDate -cne [string]$known.CreationDate) {
      Trace 'PID_REUSED_AFTER_END' ('{"pid":' + $known.ProcessId + ',"registered_creation_date":' + (J $known.CreationDate) + ',"current_creation_date":' + (J $left[0].CreationDate) + '}')
      continue
    }
    if ((Test-EnvironmentProcess $known.ExecutablePath) -and (Test-EnvironmentProcess $left[0].ExecutablePath)) { Trace 'environment_cleanup_observed' (Environment-Record $left[0] 'ENVIRONMENT_STILL_LIVE'); continue }
    if (-not (Registered-Zombie $left[0] $known)) { throw 'GATE_REGISTERED_REMAINS' }
  }
  if ((Ticks) -ge $cutoff) { throw 'GATE_CLEANUP_DEADLINE' }
}

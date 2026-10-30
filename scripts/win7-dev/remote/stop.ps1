Assert-Writer
$folder = Scheduler
if ($D['operation'] -eq 'close') {
  $tasks = @(Dev-Tasks)
  $stop = Safe ($Root + '\.channel\stop')
} else {
  if ($D['run_prefix8'] -notmatch '^[a-f0-9]{8}$') { throw 'RUN_SCOPE_INVALID' }
  $scope = Safe $D['run_root']
  if ($scope -ne [IO.Path]::GetFullPath(($Root + '\run\' + $D['run_prefix8']))) { throw 'RUN_SCOPE_INVALID' }
  if ($D['task_prefix'] -cne ('A9-DEV-' + $D['run_prefix8'] + '-')) { throw 'RUN_SCOPE_INVALID' }
  $tasks = @(Dev-Tasks | Where-Object { $_.Name.StartsWith($D['task_prefix'],[StringComparison]::OrdinalIgnoreCase) })
  $stop = Safe ($Root + '\.channel\stop-' + $D['run_prefix8'])
}
Write-Text $stop $D['token']
foreach ($task in $tasks) {
  # Delete registrations only: stopping a task could kill system PowerShell outside Root.
  $parent = [IO.Path]::GetDirectoryName($task.Path)
  $taskFolder = $folder.GetFolder($parent); $taskFolder.DeleteTask($task.Name,0)
}
# Never use taskkill /T: descendants may have images outside the development root.
# Order the selected images by ancestry, then terminate children before parents.
for ($round = 0; $round -lt 5; $round++) {
  if ($D['operation'] -eq 'close') { $procs = @(Dev-Processes) } else {
    $procs = @(Get-WmiObject Win32_Process -ErrorAction Stop | Where-Object {
      $_.ExecutablePath -and $_.ExecutablePath.StartsWith(($scope + '\'),[StringComparison]::OrdinalIgnoreCase)
    })
  }
  if ($procs.Count -eq 0) { break }
  $parents = @{}; foreach ($p in $procs) { $parents[[string]$p.ProcessId] = [string]$p.ParentProcessId }
  $ranked = @()
  foreach ($p in $procs) {
    $depth = 0; $at = [string]$p.ProcessId; $seen = @{}
    while ($parents.ContainsKey($at) -and -not $seen.ContainsKey($at)) { $seen[$at] = $true; $depth++; $at = $parents[$at] }
    $ranked += (New-Object PSObject -Property @{ Process = $p; Depth = $depth })
  }
  foreach ($row in @($ranked | Sort-Object Depth -Descending)) {
    # Re-query the image immediately before termination. No unfiltered descendants.
    foreach ($p in @(Get-WmiObject Win32_Process -Filter ('ProcessId=' + $row.Process.ProcessId) -ErrorAction Stop)) {
      $prefix = $(if ($D['operation'] -eq 'close') { $Root + '\' } else { $scope + '\' })
      if ($p.ExecutablePath -and $p.ExecutablePath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) {
        $terminated = $p.Terminate()
        if ($terminated.ReturnValue -ne 0) { throw 'PROCESS_TERMINATE_FAILED' }
      }
    }
  }
  Start-Sleep -Milliseconds 200
}
if ($D['operation'] -eq 'close') {
  if (@(Dev-Processes).Count -ne 0 -or @(Dev-Tasks).Count -ne 0) { throw 'DEV_ACTIVITY_REMAINS' }
} else {
  $remainingTasks = @(Dev-Tasks | Where-Object { $_.Name.StartsWith($D['task_prefix'],[StringComparison]::OrdinalIgnoreCase) })
  $remaining = @(Get-WmiObject Win32_Process -ErrorAction Stop | Where-Object {
    $_.ExecutablePath -and $_.ExecutablePath.StartsWith(($scope + '\'),[StringComparison]::OrdinalIgnoreCase)
  })
  if ($remaining.Count -ne 0 -or $remainingTasks.Count -ne 0) { throw 'RUN_ACTIVITY_REMAINS' }
}
if ($D['operation'] -eq 'close') {
  # Wrappers are system images and must finish cooperatively before root deletion.
  $end = [DateTime]::UtcNow.AddSeconds(15)
  do {
    $markers = @(); if ([IO.Directory]::Exists(($Root + '\runs'))) { $markers = @(Tree ($Root + '\runs') | Where-Object { $_.Name -eq 'active' }) }
    if ($markers.Count -eq 0) { break }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $end)
  if ($markers.Count -ne 0) { throw 'WRAPPER_LIFECYCLE_UNKNOWN' }
  if ([IO.File]::Exists((Safe ($Root + '\.channel\extraction-active')))) { throw 'EXTRACTION_LIFECYCLE_UNKNOWN' }
  # Traverse first to reject links; Delete never follows an unchecked reparse point.
  $files = @(Tree $Root); [void](Safe $Root)
  [IO.Directory]::Delete($Root,$true)
  if ([IO.Directory]::Exists($Root)) { throw 'ROOT_DELETE_FAILED' }
}
Emit ('"ok":true,"operation":' + (J $D['operation']) + ',"processes_remaining":0,"tasks_remaining":0,"root_exists":' + (B ([IO.Directory]::Exists($Root))))

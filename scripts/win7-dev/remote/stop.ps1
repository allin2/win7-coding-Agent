Assert-Writer
Write-Text (Safe ($Root + '\.channel\stop')) $D['token']
$folder = Scheduler
foreach ($task in @(Dev-Tasks)) {
  # Delete registrations only: stopping a task could kill system PowerShell outside Root.
  $parent = [IO.Path]::GetDirectoryName($task.Path)
  $taskFolder = $folder.GetFolder($parent); $taskFolder.DeleteTask($task.Name,0)
}
# Never use taskkill /T: descendants may have images outside the development root.
# Order the selected images by ancestry, then terminate children before parents.
for ($round = 0; $round -lt 5; $round++) {
  $procs = @(Dev-Processes)
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
      if ($p.ExecutablePath -and $p.ExecutablePath.StartsWith(($Root + '\'),[StringComparison]::OrdinalIgnoreCase)) {
        $terminated = $p.Terminate()
        if ($terminated.ReturnValue -ne 0) { throw 'PROCESS_TERMINATE_FAILED' }
      }
    }
  }
  Start-Sleep -Milliseconds 200
}
if (@(Dev-Processes).Count -ne 0 -or @(Dev-Tasks).Count -ne 0) { throw 'DEV_ACTIVITY_REMAINS' }
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

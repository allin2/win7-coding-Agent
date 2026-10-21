[void](Safe $Root)
[long]$used = 0
foreach ($f in @(Tree $Root)) { $used += $f.Length }
$disk = @(Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction Stop)
if ($disk.Count -ne 1 -or $null -eq $disk[0].FreeSpace) { throw 'DISK_SPACE_UNKNOWN' }
$procs = @(); foreach ($p in @(Dev-Processes)) { $procs += ('{"pid":' + $p.ProcessId + ',"parent_pid":' + $p.ParentProcessId + ',"image_path":' + (J $p.ExecutablePath) + '}') }
$tasks = @(); foreach ($t in @(Dev-Tasks)) { $tasks += ('{"name":' + (J $t.Name) + ',"path":' + (J $t.Path) + ',"state":' + $t.State + '}') }
$sessions = @(); foreach ($p in @(Get-WmiObject Win32_Process -Filter "Name='explorer.exe'" -ErrorAction Stop)) {
  $owner = $p.GetOwner()
  if ($owner.ReturnValue -eq 0 -and $owner.User -ieq 'agent') { $sessions += [string]$p.SessionId }
}
$lock = 'null'; $rows = @(Lock-Rows)
if ($rows.Count -eq 4) { $lock = '{"schema_version":1,"holder":' + (J $rows[1]) + ',"utc":' + (J $rows[2]) + ',"active":' + (B ($rows[3] -ne '')) + '}' }
Emit ('"ok":true,"hostname":' + (J ([Environment]::MachineName)) + ',"build":"7601","agent_sessions":[' + ($sessions -join ',') + '],"root_exists":' + (B ([IO.Directory]::Exists($Root))) + ',"extraction_lifecycle_unknown":' + (B ([IO.File]::Exists((Safe ($Root + '\.channel\extraction-active'))))) + ',"root_bytes":' + $used + ',"free_bytes":' + $disk[0].FreeSpace + ',"lock":' + $lock + ',"processes":[' + ($procs -join ',') + '],"tasks":[' + ($tasks -join ',') + ']')

# PS2/.NET 3.5 helpers, prepended to each stdin operation by win7-dev.mjs.
$ErrorActionPreference = 'Stop'
$Root = 'C:\A9-DEV'
$AgentSid = 'S-1-5-21-1708701742-428676696-1831205153-1001'
$Utf8 = New-Object System.Text.UTF8Encoding($false)
[Console]::OutputEncoding = $Utf8
function J($v) {
  if ($null -eq $v) { return 'null' }
  $s = ([string]$v).Replace('\','\\'); $s = $s.Replace('"','\"')
  for ($c = 0; $c -lt 32; $c++) { $s = $s.Replace(([string][char]$c),('\u00' + $c.ToString('x2'))) }
  return ('"' + $s + '"')
}
function Emit([string]$fields) { [Console]::WriteLine('{"evidence_class":"DEV_CHANNEL",' + $fields + '}') }
function B($v) { if ([bool]$v) { return 'true' } else { return 'false' } }
function Safe([string]$p) {
  $full = [IO.Path]::GetFullPath($p)
  if ($full -ine $Root -and -not $full.StartsWith(($Root + '\'),[StringComparison]::OrdinalIgnoreCase)) { throw 'PATH_OUTSIDE_ROOT' }
  $current = $full
  while ($null -ne $current) {
    $attr = $null
    try { $attr = [IO.File]::GetAttributes($current) } catch {
      $cause = $_.Exception
      while ($null -ne $cause.InnerException) { $cause = $cause.InnerException }
      if (-not ($cause -is [IO.FileNotFoundException]) -and -not ($cause -is [IO.DirectoryNotFoundException])) { throw }
    }
    if ($null -ne $attr -and ($attr -band [IO.FileAttributes]::ReparsePoint) -ne 0) { throw 'REPARSE_POINT' }
    $current = [IO.Path]::GetDirectoryName($current)
  }
  return $full
}
function Make-Dir([string]$p) { $p = Safe $p; [void][IO.Directory]::CreateDirectory($p); [void](Safe $p) }
function Tree([string]$p) {
  $p = Safe $p
  if (-not [IO.Directory]::Exists($p)) { return }
  foreach ($item in (New-Object IO.DirectoryInfo($p)).GetFileSystemInfos()) {
    [void](Safe $item.FullName)
    if (($item.Attributes -band [IO.FileAttributes]::Directory) -ne 0) { Tree $item.FullName } else { $item }
  }
}
function Hash([string]$p) {
  $p = Safe $p
  $f = [IO.File]::OpenRead($p); $h = [Security.Cryptography.SHA256]::Create()
  try { $hex = [BitConverter]::ToString($h.ComputeHash($f)); $hex = $hex.Replace('-',''); return $hex.ToLowerInvariant() } finally { $h.Clear(); $f.Close() }
}
function Write-Text([string]$p,[string]$text) { $p = Safe $p; [IO.File]::WriteAllText($p,$text,$Utf8) }
function Assert-Identity {
  if ([Environment]::MachineName -ine 'DCCS-CHAIZL-PC') { throw 'MACHINE_NOT_BOUND' }
  $os = @(Get-WmiObject Win32_OperatingSystem -ErrorAction Stop)
  if ($os.Count -ne 1 -or $os[0].BuildNumber -ne '7601' -or $os[0].ServicePackMajorVersion -ne 1 -or $os[0].OSArchitecture -notmatch '64') { throw 'WIN7_SP1_X64_REQUIRED' }
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  if ($id.Name -ine ([Environment]::MachineName + '\dccs-chaizl')) { throw 'ADMIN_ACCOUNT_NOT_BOUND' }
  $users = @(Get-WmiObject Win32_UserAccount -Filter "LocalAccount=True AND Name='agent'" -ErrorAction Stop)
  if ($users.Count -ne 1 -or $users[0].SID -cne $AgentSid) { throw 'AGENT_SID_NOT_BOUND' }
}
function Assert-Active {
  $expiry = [DateTime]::Parse('2026-10-28T00:00:00Z'); $expiry = $expiry.ToUniversalTime()
  if ([DateTime]::UtcNow -ge $expiry) { throw 'AUTHORIZATION_EXPIRED' }
}
function Lock-Rows {
  $p = Safe ($Root + '\LOCK')
  if (-not [IO.File]::Exists($p)) { return @() }
  $rows = [IO.File]::ReadAllLines($p,$Utf8)
  if ($rows.Length -ne 4 -or $rows[0] -cne '1') { throw 'LOCK_FORMAT_UNKNOWN' }
  return $rows
}
function Assert-Writer {
  if ($D['operation'] -ne 'stop' -and $D['operation'] -ne 'close' -and $D['operation'] -ne 'release') { Assert-Active }
  $rows = @(Lock-Rows)
  if ($rows.Count -ne 4 -or $rows[1] -cne $D['holder'] -or $rows[3] -cne $D['token']) { throw 'LOCK_NOT_OWNED' }
}
function Capacity([long]$incoming) {
  $disks = @(Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'" -ErrorAction Stop)
  if ($disks.Count -ne 1 -or $null -eq $disks[0].FreeSpace) { throw 'DISK_SPACE_UNKNOWN' }
  [long]$used = 0
  foreach ($file in @(Tree $Root)) { $used += $file.Length }
  [long]$free = $disks[0].FreeSpace
  if ($free -lt 50000000000 -or $used -gt 20000000000 -or ($free - $incoming) -lt 50000000000 -or ($used + $incoming) -gt 20000000000) { throw 'DISK_LIMIT' }
  return @($free,$used)
}
function Scheduler {
  $svc = New-Object -ComObject 'Schedule.Service'; $svc.Connect()
  return $svc.GetFolder('\')
}
function Folder-Tasks($folder) {
  foreach ($task in @($folder.GetTasks(1))) { if ($task.Name.StartsWith('A9-DEV-',[StringComparison]::OrdinalIgnoreCase)) { $task } }
  foreach ($child in @($folder.GetFolders(0))) { Folder-Tasks $child }
}
function Dev-Tasks { return @(Folder-Tasks (Scheduler)) }
function Dev-Processes {
  return @(Get-WmiObject Win32_Process -ErrorAction Stop | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith(($Root + '\'),[StringComparison]::OrdinalIgnoreCase) })
}
function Console-Session {
  $rows = @(& "$env:SystemRoot\System32\qwinsta.exe" console 2>&1)
  if ($LASTEXITCODE -ne 0) { throw 'CONSOLE_QUERY_FAILED' }
  $found = @()
  $activeChinese = ([string][char]0x8fd0) + ([string][char]0x884c) + ([string][char]0x4e2d)
  foreach ($row in $rows) {
    if ([string]$row -match '^\s*>?\s*console\s+(\S+)\s+(\d+)\s+(\S+)(?:\s+.*)?$') {
      if (($matches[1] -ine 'agent' -and $matches[1] -ine ([Environment]::MachineName + '\agent')) -or ($matches[3] -ine 'Active' -and $matches[3] -cne $activeChinese)) { throw 'AGENT_NOT_ACTIVE_CONSOLE' }
      $found += [int]$matches[2]
    }
  }
  if ($found.Count -ne 1 -or $found[0] -lt 1) { throw 'CONSOLE_SESSION_UNKNOWN' }
  $owners = 0
  foreach ($p in @(Get-WmiObject Win32_Process -Filter "Name='explorer.exe'" -ErrorAction Stop)) {
    if ($p.SessionId -eq $found[0]) { $o = $p.GetOwner(); if ($o.ReturnValue -eq 0 -and $o.User -ieq 'agent' -and $o.Domain -ieq [Environment]::MachineName) { $owners++ } }
  }
  if ($owners -lt 1) { throw 'CONSOLE_OWNER_UNKNOWN' }
  $locked = @(Get-WmiObject Win32_Process -Filter "Name='LogonUI.exe'" -ErrorAction Stop | Where-Object { $_.SessionId -eq $found[0] })
  if ($locked.Count -ne 0) { throw 'CONSOLE_LOCKED' }
  return $found[0]
}

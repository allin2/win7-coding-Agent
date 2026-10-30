Assert-Writer
$name = $D['name']; $taskName = 'A9-DEV-' + $name
$run = Safe ($Root + '\runs\' + $name)
if ([IO.Directory]::Exists($run)) { throw 'RUN_NAME_ALREADY_USED' }
$folder = Scheduler
foreach ($task in @($folder.GetTasks(1))) { if ($task.Name -ieq $taskName) { throw 'TASK_ALREADY_EXISTS' } }
$session = Console-Session
[void](Safe $D['executable'])
if (-not [IO.File]::Exists($D['executable'])) { throw 'AGENT_EXECUTABLE_MISSING' }
Make-Dir $run
$stop = Stop-Marker $name
if ([IO.File]::Exists($stop)) { [IO.File]::Delete($stop) }
$wrapper = $Utf8.GetString([Convert]::FromBase64String($D['wrapper']))
$wrapper = $wrapper.Replace('@@SESSION@@',[string]$session)
# Base64 envelope stays ASCII even when command arguments contain Chinese text.
[IO.File]::WriteAllText((Safe ($run + '\wrapper.ps1')),$wrapper,[Text.Encoding]::ASCII)
$xml = $Utf8.GetString([Convert]::FromBase64String($D['xml']))
foreach ($b in $Utf8.GetBytes($xml)) { if ($b -gt 127 -or $b -eq 13) { throw 'TASK_XML_NOT_ASCII_LF' } }
if ($xml -match '^\s*<\?xml') { throw 'TASK_XML_DECLARATION' }
$xmlPath = Safe ($run + '\task.xml')
[IO.File]::WriteAllText($xmlPath,$xml,[Text.Encoding]::ASCII)
$registered = $false; $finished = $false; $exitCode = $null
try {
  $text = @(& "$env:SystemRoot\System32\schtasks.exe" /Create /TN $taskName /XML $xmlPath 2>&1)
  if ($LASTEXITCODE -ne 0) { throw 'TASK_REGISTER_FAILED' }
  $registered = $true
  $task = $folder.GetTask($taskName)
  [xml]$want = $xml; [xml]$got = $task.Xml
  $ns = New-Object Xml.XmlNamespaceManager($got.NameTable); $ns.AddNamespace('t','http://schemas.microsoft.com/windows/2004/02/mit/task')
  $wns = New-Object Xml.XmlNamespaceManager($want.NameTable); $wns.AddNamespace('t','http://schemas.microsoft.com/windows/2004/02/mit/task')
  foreach ($xp in @('//t:UserId','//t:LogonType','//t:RunLevel','//t:Command','//t:Arguments','//t:WorkingDirectory','//t:Description')) {
    if ($got.SelectSingleNode($xp,$ns).InnerText -cne $want.SelectSingleNode($xp,$wns).InnerText) { throw 'TASK_READBACK_MISMATCH' }
  }
  if ($got.SelectNodes('//t:Triggers/*',$ns).Count -ne 0 -or $got.SelectNodes('//t:Actions/*',$ns).Count -ne 1) { throw 'TASK_EXTRA_ACTION' }
  [void]$task.Run($null)
  $end = [DateTime]::UtcNow.AddSeconds([int]$D['wait'])
  $exitFile = Safe ($run + '\exit-code.txt')
  do {
    if ([IO.File]::Exists($exitFile) -and ($task.GetInstances(0)).Count -eq 0) { $finished = $true; break }
    Start-Sleep -Milliseconds 200
  } while ([DateTime]::UtcNow -lt $end)
  if (-not $finished) {
    Write-Text $stop $D['token']
    $grace = [DateTime]::UtcNow.AddSeconds(15)
    do {
      if ([IO.File]::Exists($exitFile) -and ($task.GetInstances(0)).Count -eq 0) { break }
      Start-Sleep -Milliseconds 200
    } while ([DateTime]::UtcNow -lt $grace)
  }
  if ($finished) { $exitCode = [int][IO.File]::ReadAllText($exitFile,$Utf8) }
} finally {
  # Do not call task.Stop(): it can terminate a system image outside Root.
  if ($registered) { $folder.DeleteTask($taskName,0) }
}
Emit ('"ok":true,"operation":"agent-run","completed":' + (B $finished) + ',"exit_code":' + $(if ($null -eq $exitCode) { 'null' } else { [string]$exitCode }) + ',"console_session":' + $session + ',"task_deleted":true')

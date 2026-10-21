# Stored as an ASCII envelope; common helpers and D are supplied by the controller.
$run = Safe ($Root + '\runs\' + $D['name'])
$active = Safe ($run + '\active')
$stdout = $null; $stderr = $null; $process = $null; $started = $false; $result = 125
try {
  $id = [Security.Principal.WindowsIdentity]::GetCurrent()
  $session = ([Diagnostics.Process]::GetCurrentProcess()).SessionId
  if ($id.User.Value -cne $AgentSid -or $session -ne @@SESSION@@) { throw 'AGENT_IDENTITY_OR_SESSION' }
  Assert-Writer
  Write-Text $active $D['token']
  $outPath = Safe ($run + '\stdout.bin'); $errPath = Safe ($run + '\stderr.bin')
  $stdout = [IO.File]::Open($outPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  $stderr = [IO.File]::Open($errPath,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
  [void](Safe $D['executable'])
  $info = New-Object Diagnostics.ProcessStartInfo
  $info.FileName = $D['executable']; $info.Arguments = $D['arguments']; $info.WorkingDirectory = $Root
  $info.UseShellExecute = $false; $info.RedirectStandardOutput = $true; $info.RedirectStandardError = $true; $info.RedirectStandardInput = $true
  $info.EnvironmentVariables['TEMP'] = $run; $info.EnvironmentVariables['TMP'] = $run
  $process = New-Object Diagnostics.Process; $process.StartInfo = $info
  if ([IO.File]::Exists(($Root + '\.channel\stop'))) { throw 'STOP_REQUESTED' }
  if (-not $process.Start()) { throw 'AGENT_START_FAILED' }
  $started = $true
  $process.StandardInput.Close()
  $streams = @($process.StandardOutput.BaseStream,$process.StandardError.BaseStream)
  $files = @($stdout,$stderr); $buffers = New-Object object[] 2
  $buffers[0] = New-Object byte[] 32768; $buffers[1] = New-Object byte[] 32768
  $pending = @($streams[0].BeginRead($buffers[0],0,32768,$null,$null),$streams[1].BeginRead($buffers[1],0,32768,$null,$null))
  $done = @($false,$false); [long]$outputBytes = 0
  $deadline = [DateTime]::UtcNow.AddSeconds([int]$D['wait']); $drain = $null
  while (-not ($done[0] -and $done[1] -and $process.HasExited)) {
    for ($i = 0; $i -lt 2; $i++) {
      if (-not $done[$i] -and $pending[$i].IsCompleted) {
        $count = $streams[$i].EndRead($pending[$i])
        if ($count -eq 0) { $done[$i] = $true } else {
          $outputBytes += $count
          if ($outputBytes -gt 67108864) { throw 'AGENT_OUTPUT_LIMIT' }
          $files[$i].Write($buffers[$i],0,$count)
          $pending[$i] = $streams[$i].BeginRead($buffers[$i],0,32768,$null,$null)
        }
      }
    }
    if ($process.HasExited -and $null -eq $drain) { $drain = [DateTime]::UtcNow.AddSeconds(5) }
    if ([DateTime]::UtcNow -ge $deadline -or ($null -ne $drain -and [DateTime]::UtcNow -ge $drain) -or [IO.File]::Exists(($Root + '\.channel\stop'))) { throw 'AGENT_WAIT_OR_STOP' }
    Start-Sleep -Milliseconds 20
  }
  $result = $process.ExitCode
  Write-Text (Safe ($run + '\identity.json')) ('{"evidence_class":"DEV_CHANNEL","sid":' + (J $id.User.Value) + ',"session":' + $session + '}')
} catch {
  # No payload or exception text is emitted; original program streams remain files.
  Write-Text (Safe ($run + '\wrapper-error.json')) '{"evidence_class":"DEV_CHANNEL","error":"AGENT_EXECUTION_FAILED"}'
} finally {
  if ($null -ne $process) {
    if ($started -and -not $process.HasExited) {
      # Only its directly started Root executable; never kill an unfiltered tree.
      $process.Kill(); [void]$process.WaitForExit(5000)
    }
    $process.Dispose()
  }
  if ($null -ne $stdout) { $stdout.Close() }; if ($null -ne $stderr) { $stderr.Close() }
  if (-not [IO.File]::Exists((Safe ($run + '\stdout.bin')))) { Write-Text ($run + '\stdout.bin') '' }
  if (-not [IO.File]::Exists((Safe ($run + '\stderr.bin')))) { Write-Text ($run + '\stderr.bin') '' }
  Write-Text (Safe ($run + '\exit-code.txt')) ([string]$result)
  if ([IO.File]::Exists($active)) { [IO.File]::Delete($active) }
}

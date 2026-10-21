# Persistent holder plus an active invocation token; a crash requires --steal.
if ($D['operation'] -eq 'acquire') {
  if ($D['command'] -ne 'close' -and $D['command'] -ne 'stop') { Assert-Active }
  [void](Safe $Root)
  if (-not [IO.Directory]::Exists($Root)) { Make-Dir $Root }
  $file = Safe ($Root + '\LOCK')
  $stream = [IO.File]::Open($file,[IO.FileMode]::OpenOrCreate,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  try {
    if ($stream.Length -gt 4096) { throw 'LOCK_FORMAT_UNKNOWN' }
    $bytes = New-Object byte[] ([int]$stream.Length)
    $read = $stream.Read($bytes,0,$bytes.Length)
    if ($read -ne $bytes.Length) { throw 'LOCK_READ_FAILED' }
    if ($bytes.Length -gt 0) {
      # Keep the trailing empty token when an invocation has released its lease.
      $raw = $Utf8.GetString($bytes); $rawRows = $raw.Split("`n")
      if ($rawRows.Length -ne 5 -or $rawRows[0] -ne '1') { throw 'LOCK_FORMAT_UNKNOWN' }
      if (($rawRows[1] -cne $D['holder'] -or $rawRows[3] -ne '') -and $D['steal'] -ne 'true') { throw 'LOCK_CONFLICT' }
    }
    $text = '1' + "`n" + $D['holder'] + "`n" + [DateTime]::UtcNow.ToString('o') + "`n" + $D['token'] + "`n"
    $bytes = $Utf8.GetBytes($text); $stream.Position = 0; $stream.SetLength(0); $stream.Write($bytes,0,$bytes.Length); $stream.Flush()
  } finally { $stream.Close() }
  # Ensure a previous failed creation cannot bypass the required root ACL.
  $acl = @(& "$env:SystemRoot\System32\icacls.exe" $Root /grant '*S-1-5-21-1708701742-428676696-1831205153-1001:(OI)(CI)M' 2>&1)
  if ($LASTEXITCODE -ne 0) { throw 'ACL_GRANT_FAILED' }
  $acl = @(& "$env:SystemRoot\System32\icacls.exe" $Root /verify 2>&1)
  if ($LASTEXITCODE -ne 0) { throw 'ACL_VERIFY_FAILED' }
  Make-Dir ($Root + '\.channel')
  Emit '"ok":true,"operation":"acquire"'
} elseif ($D['operation'] -eq 'release') {
  Assert-Writer
  $file = Safe ($Root + '\LOCK')
  $stream = [IO.File]::Open($file,[IO.FileMode]::Open,[IO.FileAccess]::ReadWrite,[IO.FileShare]::None)
  try {
    $bytes = New-Object byte[] ([int]$stream.Length); $read = $stream.Read($bytes,0,$bytes.Length)
    $raw = $Utf8.GetString($bytes); $rows = $raw.Split("`n")
    if ($read -ne $bytes.Length -or $rows.Length -ne 5 -or $rows[1] -cne $D['holder'] -or $rows[3] -cne $D['token']) { throw 'LOCK_NOT_OWNED' }
    $text = '1' + "`n" + $D['holder'] + "`n" + [DateTime]::UtcNow.ToString('o') + "`n`n"
    $bytes = $Utf8.GetBytes($text); $stream.Position = 0; $stream.SetLength(0); $stream.Write($bytes,0,$bytes.Length); $stream.Flush()
  } finally { $stream.Close() }
  Emit '"ok":true,"operation":"release"'
} else { throw 'LOCK_OPERATION_INVALID' }

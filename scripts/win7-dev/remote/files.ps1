if ($D['operation'] -eq 'get-info') {
  $p = Safe $D['path']
  if (-not [IO.File]::Exists($p)) { throw 'REMOTE_FILE_REQUIRED' }
  Emit ('"ok":true,"bytes":' + (New-Object IO.FileInfo($p)).Length + ',"sha256":' + (J (Hash $p)))
} else {
  Assert-Writer
  if ($D['operation'] -eq 'prepare-put') {
    $space = Capacity ([long]$D['incoming'])
    $p = Safe $D['path']; Make-Dir ([IO.Path]::GetDirectoryName($p))
    if ([IO.Directory]::Exists($p)) { throw 'REMOTE_FILE_REQUIRED' }
    [void](Safe $D['stage'])
    if ([IO.File]::Exists($D['stage'])) { throw 'UPLOAD_STAGE_EXISTS' }
    Emit '"ok":true,"operation":"prepare-put"'
  } elseif ($D['operation'] -eq 'commit-put') {
    $stage = Safe $D['stage']; $p = Safe $D['path']
    if ((New-Object IO.FileInfo($stage)).Length -ne [long]$D['bytes'] -or (Hash $stage) -cne $D['sha256']) { throw 'UPLOAD_HASH_OR_SIZE' }
    if ($D['immutable'] -eq 'true') {
      if ([IO.File]::Exists($p)) {
        if ((Hash $p) -cne $D['sha256']) { throw 'CANDIDATE_HASH_CONFLICT' }
        [IO.File]::Delete($stage)
      } else { [IO.File]::Move($stage,$p) }
    } else { [IO.File]::Copy($stage,$p,$true); [IO.File]::Delete($stage) }
    Emit '"ok":true,"operation":"commit-put"'
  } elseif ($D['operation'] -eq 'cand-probe') {
    if ([IO.File]::Exists((Safe ($Root + '\.channel\extraction-active')))) { throw 'EXTRACTION_LIFECYCLE_UNKNOWN' }
    $space = Capacity 0
    $base = Safe $D['path']; $zip = Safe ($base + '\package.zip')
    $exists = [IO.File]::Exists($zip)
    if ($exists -and (Hash $zip) -cne $D['sha256']) { throw 'CANDIDATE_HASH_CONFLICT' }
    if (-not $exists) { $space = Capacity ([long]$D['incoming']) }
    Make-Dir $base
    Emit ('"ok":true,"archive_exists":' + (B $exists))
  } elseif ($D['operation'] -eq 'cand-expand') {
    if ([IO.File]::Exists((Safe ($Root + '\.channel\extraction-active')))) { throw 'EXTRACTION_LIFECYCLE_UNKNOWN' }
    $base = Safe $D['path']; $zip = Safe ($base + '\package.zip'); $expanded = Safe ($base + '\expanded')
    if ((Hash $zip) -cne $D['sha256']) { throw 'CANDIDATE_HASH_CONFLICT' }
    $manifest = $Utf8.GetString([Convert]::FromBase64String($D['manifest']))
    $expected = @{}; [long]$total = 0
    $manifest = $manifest.TrimEnd("`n")
    foreach ($line in $manifest.Split("`n")) {
      $v = $line.Split("`t")
      if ($v.Length -ne 2 -or $v[0] -notmatch '^[0-9]+$') { throw 'ZIP_MANIFEST_INVALID' }
      $entry = Safe ([IO.Path]::Combine($expanded,$v[1]))
      if ($expected.ContainsKey($entry)) { throw 'ZIP_DUPLICATE_PATH' }
      $expected[$entry] = [long]$v[0]; $total += [long]$v[0]
    }
    $ready = Safe ($base + '\ready.sha256')
    if (-not [IO.File]::Exists($ready)) {
      # A partial asynchronous extraction is retained; never merge/retry into it.
      if ([IO.Directory]::Exists($expanded)) { throw 'PARTIAL_EXTRACTION_RETAINED' }
      $space = Capacity $total
      Make-Dir $expanded
      $shell = New-Object -ComObject 'Shell.Application'
      $source = $shell.NameSpace($zip); $dest = $shell.NameSpace($expanded)
      if ($null -eq $source -or $null -eq $dest) { throw 'SHELL_ZIP_NAMESPACE_UNAVAILABLE' }
      Write-Text (Safe ($Root + '\.channel\extraction-active')) $D['sha256']
      $dest.CopyHere($source.Items(),(4 + 16 + 512 + 1024))
      $end = [DateTime]::UtcNow.AddSeconds(540)
      do {
        $complete = $true
        foreach ($entry in $expected.Keys) {
          [void](Safe $entry)
          if (-not [IO.File]::Exists($entry) -or (New-Object IO.FileInfo($entry)).Length -ne $expected[$entry]) { $complete = $false; break }
        }
        if ($complete) { break }
        Start-Sleep -Milliseconds 250
      } while ([DateTime]::UtcNow -lt $end)
      if (-not $complete) { throw 'ZIP_EXTRACTION_TIMEOUT' }
    } elseif ([IO.File]::ReadAllText($ready,$Utf8) -cne $D['sha256']) { throw 'CANDIDATE_READY_CONFLICT' }
    $files = @(Tree $expanded)
    if ($files.Count -ne $expected.Count) { throw 'ZIP_EXTRACTION_FILE_COUNT' }
    foreach ($f in $files) { if (-not $expected.ContainsKey($f.FullName) -or $f.Length -ne $expected[$f.FullName]) { throw 'ZIP_EXTRACTION_SIZE' } }
    foreach ($f in $files) {
      # A correct length alone does not mean CopyHere has closed its writer.
      $handle = [IO.File]::Open($f.FullName,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::None)
      $handle.Close()
    }
    if (-not [IO.File]::Exists($ready)) { Write-Text $ready $D['sha256'] }
    $active = Safe ($Root + '\.channel\extraction-active')
    if ([IO.File]::Exists($active)) { [IO.File]::Delete($active) }
    Emit ('"ok":true,"operation":"cand-expand","sha256":' + (J $D['sha256']) + ',"directory":' + (J $expanded) + ',"files":' + $files.Count)
  } else { throw 'FILE_OPERATION_INVALID' }
}

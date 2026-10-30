# Fixed PS2-compatible stdin contract. Canonical flat JSON only; no evaluation or PS3 JSON cmdlets.
function Initialize-AdminInput([string]$text) {
  if ([Text.Encoding]::UTF8.GetByteCount($text) -gt 262144) { throw 'ADMIN_INPUT_BOUND' }
  $pattern = '\A\{"schema_version":1,"step":"(?<step>R1|R2|R3|R3-state|R4|R5|R6|R7|R8)","phase":"(?<phase>[a-z0-9-]*)","run_id":"(?<id>[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})","session_id":(?<session>[1-9][0-9]{0,8}),"machine_name":"(?<machine>[A-Za-z0-9_-]{1,64})","account_sid":"(?<sid>S-1-5-21-[0-9-]+)","lock_holder":"(?<holder>[A-Za-z0-9_-]{1,64})","expires_at_utc":"(?<end>[0-9TZ:.\-]+)","phase_seconds":\[(?<seconds>[1-9][0-9]{0,4}(?:,[1-9][0-9]{0,4})*)\],"rows_base64":"(?<rows>(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?)","owned":(?<owned>true|false),"delete_phases":"(?<deletes>[a-z0-9,-]*)"\}\n\z'
  $m = [regex]::Match($text,$pattern)
  if (-not $m.Success) { throw 'ADMIN_INPUT_SCHEMA' }
  $script:AdminStep = $m.Groups['step'].Value; $script:AdminPhase = $m.Groups['phase'].Value
  $script:BoundRunId = $m.Groups['id'].Value
  $script:BoundRoot = 'C:\A9-DEV\run\' + $script:BoundRunId.Substring(0,8)
  $script:BoundTaskPrefix = 'A9-DEV-' + $script:BoundRunId.Substring(0,8) + '-'
  $script:BoundMachine = $m.Groups['machine'].Value; $script:BoundSid = $m.Groups['sid'].Value
  $script:BoundSession = [int]$m.Groups['session'].Value; $script:BoundHolder = $m.Groups['holder'].Value
  $script:AdminRows = $m.Groups['rows'].Value; $script:AdminOwned = ($m.Groups['owned'].Value -ceq 'true')
  $script:AdminDeletes = $m.Groups['deletes'].Value
  $script:BoundExpires = [DateTime]::Parse($m.Groups['end'].Value,[Globalization.CultureInfo]::InvariantCulture,[Globalization.DateTimeStyles]::RoundtripKind).ToUniversalTime()
  if ([DateTime]::UtcNow -ge $script:BoundExpires) { throw 'ADMIN_INPUT_EXPIRED' }
  $script:BoundDispatch = @('p01-env','p02-integrity','gpu-entry-gate','p03-chain','p04-streaming','p05-session-bg','p06-continue','p07-safe','p08-ui','p09-report','p10-postflight')
  $script:BoundSeconds = @($m.Groups['seconds'].Value.Split(',') | ForEach-Object { [int]$_ })
  $ceilings = @(600,600,120,1380,1620,600,600,10740,600,300,600)
  if ($script:BoundSeconds.Count -ne $ceilings.Count) { throw 'ADMIN_PHASE_COUNT' }
  for ($i = 0; $i -lt $ceilings.Count; $i++) { if ($script:BoundSeconds[$i] -gt $ceilings[$i]) { throw 'ADMIN_PHASE_CEILING' } }
  if ($script:AdminPhase -ne '' -and $script:BoundDispatch -cnotcontains $script:AdminPhase) { throw 'ADMIN_PHASE' }
  foreach ($p in @($script:AdminDeletes.Split(',') | Where-Object { $_ -ne '' })) { if ($script:BoundDispatch -cnotcontains $p) { throw 'ADMIN_DELETE_PHASE' } }
}

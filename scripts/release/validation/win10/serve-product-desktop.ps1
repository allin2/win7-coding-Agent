param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$PinSha256,[ValidatePattern('^[a-f0-9]{64}$')][string]$RevisionSha256,[ValidatePattern('^[a-f0-9]{32}$')][string]$RequestId,[switch]$LibraryOnly,[switch]$ProbeOnly,[string]$AdmissionContextFile,[ValidatePattern('^[a-f0-9]{64}$')][string]$AdmissionContextSha256,[ValidateSet('capture-self-query','observer-admit','canary-admin','ordinary-probe')][string]$AdmissionOperation)

# ENGINEERING_02 / ADR-0195: all consumers use the strict central validator.
$ErrorActionPreference='Stop'
function Invoke-EngineeringJson([string]$operation,[string[]]$values){
 $hostExe=Join-Path $script:EngineeringRoot 'host\electron.exe'
 if((Get-FileHash -LiteralPath $hostExe -Algorithm SHA256).Hash.ToLowerInvariant() -cne '2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb'){throw 'INTEGRITY_ENGINEERING_HOST'}
 $tool=Join-Path $script:EngineeringToolRoot 'input-binding.cjs';$argv=@($tool,$operation,$script:EngineeringFile,$script:EngineeringHash)+$values
 foreach($v in $argv){if(-not $v -or $v.Contains('"') -or $v.Contains("`r") -or $v.Contains("`n")){throw 'INTEGRITY_ENGINEERING_ARGUMENT'}}
 $pi=New-Object Diagnostics.ProcessStartInfo;$pi.FileName=$hostExe;$pi.Arguments=($argv|ForEach-Object{'"'+$_+'"'}) -join ' ';$pi.UseShellExecute=$false;$pi.RedirectStandardOutput=$true;$pi.RedirectStandardError=$true;$pi.StandardOutputEncoding=[Text.Encoding]::UTF8;$pi.StandardErrorEncoding=[Text.Encoding]::UTF8;$pi.StandardOutputEncoding=New-Object Text.UTF8Encoding($false);$pi.StandardErrorEncoding=New-Object Text.UTF8Encoding($false);$pi.EnvironmentVariables['ELECTRON_RUN_AS_NODE']='1';$pi.EnvironmentVariables['A9_ENGINEERING_BINDING']='';$pi.EnvironmentVariables.Remove('NODE_OPTIONS')
 $p=[Diagnostics.Process]::Start($pi);$null=$p.Handle;$out=$p.StandardOutput.ReadToEndAsync();$err=$p.StandardError.ReadToEndAsync()
 try{if(-not $p.WaitForExit(10000) -or -not $out.Wait(1000) -or -not $err.Wait(1000)){throw ('LIFECYCLE_CENTRAL_VALIDATOR_UNKNOWN:'+ $p.Id+':'+$p.StartTime.ToUniversalTime().Ticks)};if($out.Result.Length -gt 262144 -or $err.Result.Length -gt 4096){throw 'INTEGRITY_VALIDATOR_OUTPUT_LIMIT'};if($p.ExitCode -ne 0){throw ('INTEGRITY_CENTRAL_VALIDATOR_REJECTED:'+ $err.Result)};return ($out.Result|ConvertFrom-Json)}finally{$p.Dispose()}
}
function Read-EngineeringBinding([string]$base,[string]$pin){
 if($base -cnotin @('C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-Engineering-Win10-Entry-20261007-R2','C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-Engineering-Win10-Entry-20261007-R3','C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-Engineering-Win10-Entry-20261007-R4') -or $pin -cnotmatch '^[a-f0-9]{64}$'){throw 'SCOPE_ROOT_OR_BINDING'}
 $f=if($base -clike '*-R4'){Join-Path $base ('inputs\bindings\'+$pin+'\master-pin.json')}else{Join-Path $base 'inputs\master-pin.json'};$d=Get-Item -LiteralPath $f -Force;while($d){if($d.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'INTEGRITY_REPARSE'};$d=if($d -is [IO.DirectoryInfo]){$d.Parent}else{$d.Directory}}
 if((Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLowerInvariant() -cne $pin){throw 'INTEGRITY_BINDING_HASH'}
 $b=Get-Content -LiteralPath $f -Raw -Encoding UTF8|ConvertFrom-Json
 if($b.schema_version -ne 3 -or $b.kind -cne 'win10-static' -or $b.status -cne 'WIN10_INPUTS_NOT_ADMISSION' -or $b.deployment.root -cne $base){throw 'SCOPE_WIN10_NOT_AUTHORIZED'}
 $script:EngineeringToolRoot=if($b.tool_identity.version -cin @('engineering-02-v5-admission','engineering-02-v6-product')){Join-Path $base ('control\versions\'+$b.tool_identity.files_digest)}else{Join-Path $base 'control'}
 foreach($row in $b.tool_identity.files){$p=Join-Path $script:EngineeringToolRoot $row.file;if($row.file -cnotmatch '^[a-z0-9.-]+$' -or (Get-Item -LiteralPath $p).Length -ne $row.size -or (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant() -cne $row.sha256){throw 'INTEGRITY_ENGINEERING_TOOL'}}
 $script:EngineeringRoot=$base;$script:EngineeringFile=$f;$script:EngineeringHash=$pin
 $check=Invoke-EngineeringJson 'verify-static' @();if($check.status -cne 'WIN10_STATIC_VERIFIED_NOT_ADMISSION'){throw 'INTEGRITY_CENTRAL_SCHEMA'}
 return $b
}
function Engineering-Master($b){return (Invoke-EngineeringJson 'project-master' @())}
function Assert-EngineeringExecution([ValidateSet('ADMIN_TOOL_ADMISSION','ORDINARY_PRODUCT')][string]$Role='ORDINARY_PRODUCT'){
 $null=Invoke-EngineeringJson 'authorize' @($Role)
 if($env:COMPUTERNAME -cne 'WIN-2JQ66JE4HTQ' -or [Environment]::OSVersion.Version.Build -ne 19045 -or [IntPtr]::Size -ne 8){throw 'IDENTITY_ENGINEERING_HOST'}
 $sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;$session=[Diagnostics.Process]::GetCurrentProcess().SessionId
 if($Role -ceq 'ADMIN_TOOL_ADMISSION'){if($sid -cne 'S-1-5-21-3031939772-989444280-3099258187-500' -or $session -ne 0){throw 'IDENTITY_PREPARATION_REQUIRED'}}
 else{
  $desktopFile=if($engineering.tool_identity.version -ceq 'engineering-02-v6-product'){Join-Path $script:EngineeringRoot ('evidence\desktop-session-'+$script:EngineeringHash+'.json')}else{Join-Path $script:EngineeringRoot 'evidence\desktop-session.json'};$desktop=Invoke-EngineeringJson 'assert-desktop' @($desktopFile)
  if($sid -cne 'S-1-5-21-3031939772-989444280-3099258187-1005' -or $session -ne $desktop.parent.session){throw 'IDENTITY_ORDINARY_DESKTOP_REQUIRED'}
  $explorer=[Diagnostics.Process]::GetProcessById($desktop.parent.pid);try{if($explorer.StartTime.ToUniversalTime().Ticks.ToString() -cne $desktop.parent.creation_ticks -or $explorer.SessionId -ne $session){throw 'IDENTITY_CURRENT_DESKTOP_INSTANCE'}}finally{$explorer.Dispose()}
 }
}
$engineering=Read-EngineeringBinding $Root $PinSha256
$script:AdmissionFamily=$engineering.tool_identity.version -cin @('engineering-02-v5-admission','engineering-02-v6-product');$script:ForensicFamily=$engineering.tool_identity.version -cin @('engineering-02-v3','engineering-02-v4','engineering-02-v5-admission','engineering-02-v6-product');$script:ProductContract=$engineering.tool_identity.version -ceq 'engineering-02-v6-product'
$script:ContextMode=$script:AdmissionFamily -and (-not $script:ProductContract -or $AdmissionOperation)
if($script:ContextMode){
 if(-not $LibraryOnly -or $ProbeOnly -or -not $AdmissionOperation -or -not $AdmissionContextFile -or -not $AdmissionContextSha256){throw 'SCOPE_ADMISSION_LIBRARY_CONTEXT_REQUIRED'}
 $admissionRole=if($AdmissionOperation -ceq 'ordinary-probe'){'ORDINARY_FORENSIC_ADMISSION'}else{'ADMIN_FORENSIC_ADMISSION'}
 $null=Invoke-EngineeringJson 'authorize-admission' @($admissionRole,$AdmissionOperation,$AdmissionContextFile,$AdmissionContextSha256)
 $script:AdmissionContext=Get-Content -LiteralPath $AdmissionContextFile -Raw -Encoding UTF8|ConvertFrom-Json
 $self=[Diagnostics.Process]::GetCurrentProcess();if($script:AdmissionContext.parent.pid -ne $self.Id -or $script:AdmissionContext.parent.creation_ticks -cne $self.StartTime.ToUniversalTime().Ticks.ToString() -or $script:AdmissionContext.parent.session -ne $self.SessionId -or $script:AdmissionContext.identity.Sid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value){throw 'IDENTITY_ADMISSION_LIBRARY_INSTANCE'}
}else{if(-not $LibraryOnly){if($ProbeOnly){Assert-EngineeringExecution 'ADMIN_TOOL_ADMISSION'}else{Assert-EngineeringExecution 'ORDINARY_PRODUCT'}}elseif($script:ProductContract){$libraryRole=if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -ceq 'S-1-5-21-3031939772-989444280-3099258187-500'){'ADMIN_TOOL_ADMISSION'}else{'ORDINARY_PRODUCT'};Assert-EngineeringExecution $libraryRole}}

$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);$OutputEncoding=[Console]::OutputEncoding
$root=$Root

function Assert-Plain([string]$p){$i=Get-Item -LiteralPath $p -Force;while($i){if($i.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)){throw 'INTEGRITY_REPARSE'};$i=if($i -is [IO.DirectoryInfo]){$i.Parent}else{$i.Directory}}}
function Hash([string]$p){Assert-Plain $p;return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function New-Json([string]$p,$o){$s=[IO.File]::Open($p,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$b=(New-Object Text.UTF8Encoding($false)).GetBytes(($o|ConvertTo-Json -Depth 25));$s.Write($b,0,$b.Length);$s.Flush()}finally{$s.Dispose()}}
function Get-Identity($p){return [A31Capture]::Token($p)}
function Assert-Identity($i,[switch]$NativeOwnedJob){if($i.Sid -cne 'S-1-5-21-3031939772-989444280-3099258187-1005' -or $i.Session -ne $script:ManifestSession -or -not $i.Ordinary -or $i.Elevated -or $i.ElevationType -notin @(1,3) -or $i.Rid -ne 8192 -or $i.IntegritySid -cne 'S-1-16-8192' -or (-not $NativeOwnedJob -and $i.InJob)){throw 'IDENTITY_ORDINARY_DESKTOP_REQUIRED'}}
$script:CaptureExclusions=@();$script:CaptureIssues=@();$script:ResolvedSync=@();$script:ResolvedManifest=@();$script:ManifestMaster=$null;$script:ManifestSession=[Diagnostics.Process]::GetCurrentProcess().SessionId;$script:ManifestDispatcherPid=0;$script:ManifestDispatcherTicks=0L;$script:SyncContext=$null;$script:SnapshotClock=$null;$script:DrainErrors=@();$script:DrainErrorsCapped=$false
function Convert-Held($h){return @{process=$h.Process;pid=$h.Pid;parent_pid=$h.Parent;creation_ticks=$h.CreationTicks;session=$h.Session;pinned_at=$h.PinnedAt;capture=$h;binding=$h.Binding}}
function New-Pinned([Diagnostics.Process]$p,[int]$parent){return Convert-Held ([A31Capture]::Pin($p,$parent))}
function Accept-Capture($tree,$v){
 foreach($x in $v.Excluded){
  if((-not $script:ForensicFamily) -or -not $script:SyncContext -or $script:CaptureExclusions.Count -ge 128){throw 'LIFECYCLE_EXCLUSION_CONTEXT_OR_LIMIT'}
  $b=$x.Binding;$parent=$tree[[string]$x.Parent];if(-not $parent -or $parent.creation_ticks -ne $b.ParentCreationTicks -or $parent.session -ne $b.ParentSession -or $b.SecondParent -ne $x.Parent){throw 'LIFECYCLE_EXCLUSION_PARENT'}
  $ctx=$script:SyncContext
  $record=[ordered]@{schema_version=1;status='RELATIONSHIP_EXCLUDED_NOT_PROCESS_EXIT';reason=$x.Reason;source=$source;master_sha256=$ctx.master_sha256;revision_sha256=$ctx.revision_sha256;request_id=$ctx.request_id;parent=@{pid=$x.Parent;creation_ticks=[string]$b.ParentCreationTicks;session=$b.ParentSession;image=$b.ParentImage};child=@{pid=$x.Pid;creation_ticks=[string]$b.CreationTicks;session=$b.Session;image=$b.Image};second_parent=@{pid=$x.Parent;creation_ticks=[string]$b.SecondParentCreationTicks;session=$b.SecondParentSession;image=$b.SecondParentImage};second_child=@{pid=$b.SecondPid;creation_ticks=[string]$b.SecondCreationTicks;session=$b.SecondSession;image=$b.SecondImage};snapshots=@(@{started_ticks=[string]$b.SnapshotStartedTicks;captured_ticks=[string]$b.SnapshotCapturedTicks;pid=$x.Pid;parent_pid=$x.Parent;image=[IO.Path]::GetFileName($b.Image);clock_profile=$b.ClockProfile},@{started_ticks=[string]$b.SecondStartedTicks;captured_ticks=[string]$b.SecondCapturedTicks;pid=$b.SecondPid;parent_pid=$b.SecondParent;image=$b.SecondExe;clock_profile=$b.ClockProfile});query_ticks=@([string]$b.QueryTicks,[string]$b.SecondQueryTicks);handle_evidence='RETAINED_BOTH_INSTANCES_TWO_QUERIES'}
  if($b.Ownership -cne 'EXCLUDED_NOT_CHILD_OF_PINNED_PARENT' -or $b.SecondObservation -cne 'SAME_CHILD_AND_PARENT_INSTANCES_PROVEN_HANDLES_RETAINED'){throw 'LIFECYCLE_EXCLUSION_NATIVE_PROOF'}
  $file=Join-Path $ctx.run ('evidence\excluded-relationship-'+[Guid]::NewGuid().ToString('N')+'.json');New-Json $file $record
  $null=Invoke-EngineeringJson 'validate-exclusion' @($file,$ctx.revision_sha256,$ctx.request_id);$script:CaptureExclusions+=@($record)
 }
 foreach($h in $v.Added){$tree[[string]$h.Pid]=Convert-Held $h}
 $unknown=@();$waitEnd=[DateTime]::UtcNow.AddMilliseconds(250)
 foreach($g in $v.Gaps){if($script:CaptureIssues.Count -ge 128){throw 'SAFETY_CAPTURE_DIAGNOSTIC_LIMIT'};$issue=[ordered]@{observation_id=[Guid]::NewGuid().ToString('N');pid=$g.Pid;parent_pid=$g.Parent;exe=Safe-Text $g.Exe;observed_at=$g.ObservedAt;step=$g.Step;error_type=$g.ErrorType;native_error_code=if($g.NativeErrorKnown){$g.NativeError}else{'UNKNOWN'};error=Safe-Text $g.Error.Substring(0,[Math]::Min(500,$g.Error.Length));creation_ticks=$g.Binding.CreationTicks;exit_code='UNKNOWN';ownership='UNKNOWN';binding=$g.Binding};$script:CaptureIssues+=@($issue)
  if($script:SyncContext){New-Json (Join-Path $script:SyncContext.run ('evidence\query-failure-'+$issue.observation_id+'.json')) $issue}
  if(-not(Resolve-SyncObservation $tree $g $issue $waitEnd) -and -not(Resolve-ManifestObservation $tree $g $issue)){$unknown+=@($g)}
 }
 if($unknown.Count){throw ('LIFECYCLE_OBSERVED_CHILD_NOT_PINNED:'+ $unknown[0].Pid)}
}
function Sync-Unresolved{return @($script:CaptureIssues|Where-Object{$id=$_.observation_id;@(@($script:ResolvedSync)+@($script:ResolvedManifest)|Where-Object{$_.observation_id -ceq $id}).Count -ne 1})}
function Sync-Contract($c){
 Exact-Keys $c @('schema_version','runtime_profile','call_module','cmd','argv','timeout_ms','max_receipts','receipt_limit_bytes','total_limit_bytes','wait_limit_ms','timestamp_precision_ms','driver_safety_sha256','clock_profile','clock_frequency','snapshot_margin_ns')
 Exact-Keys $c.call_module @('file','size','sha256');Exact-Keys $c.cmd @('file','size','sha256')
 foreach($k in @('timeout_ms','max_receipts','receipt_limit_bytes','total_limit_bytes','wait_limit_ms','timestamp_precision_ms','snapshot_margin_ns')){if($c.$k -isnot [int]){throw 'INTEGRITY_SYNC_CONTRACT_TYPE'}};foreach($k in @('call_module','cmd')){if($c.$k.size -isnot [int] -or $c.$k.file -isnot [string] -or $c.$k.sha256 -isnot [string]){throw 'INTEGRITY_SYNC_SOURCE_TYPE'}}
 if($c.clock_profile -cne 'LOCKED_CLR_LIBUV_QPC_NS_V1_TEST_ONLY' -or $c.clock_frequency -isnot [string] -or $c.clock_frequency -cne '10000000' -or $c.snapshot_margin_ns -isnot [int] -or $c.snapshot_margin_ns -ne 4096 -or $c.driver_safety_sha256 -isnot [string] -or $c.driver_safety_sha256 -cnotmatch '^[a-f0-9]{64}$' -or $c.schema_version -isnot [int] -or $c.schema_version -ne 1 -or $c.runtime_profile -cne 'WIN10_ELECTRON22_NODE16_SYNC_READONLY_PROBE_RECEIPT_V1_TEST_ONLY' -or $c.call_module.file -cne 'resources/app/runner/dist/shell-detection.js' -or $c.call_module.size -ne 10416 -or $c.call_module.sha256 -cne '628dd4571b93c036a85aecfbcf66e66f70b81bca8ab7ff08ee80159b806434a4' -or $c.cmd.file -cne 'C:\Windows\System32\cmd.exe' -or $c.cmd.size -ne 289792 -or $c.cmd.sha256 -cne 'badf4752413cb0cbdc03fb95820ca167f0cdc63b597ccdb5ef43111180e088b0' -or $c.argv -isnot [object[]] -or ($c.argv -join ',') -cne '/d,/c,ver' -or $c.argv.Count -ne 3 -or $c.timeout_ms -isnot [int] -or $c.timeout_ms -ne 5000 -or $c.max_receipts -ne 128 -or $c.receipt_limit_bytes -ne 16384 -or $c.total_limit_bytes -ne 2097152 -or $c.wait_limit_ms -ne 250 -or $c.timestamp_precision_ms -ne 16){throw 'INTEGRITY_SYNC_CONTRACT'}
}
function Assert-SyncReceipt($r,$b,$c){
 Sync-Contract $c;Exact-Keys $r @('schema_version','proof_kind','runtime_profile','receipt_id','request_id','master_sha256','revision_sha256','source','parent','call_module','cmd','argv','options','started_utc_ms','returned_utc_ms','started_monotonic_ns','returned_monotonic_ns','timestamp_precision_ms','result','outputs')
 if($r.schema_version -isnot [int] -or $r.schema_version -ne 1 -or $r.proof_kind -cne 'SYNC_READONLY_PROBE_RESULT' -or $r.runtime_profile -cne $c.runtime_profile -or $r.receipt_id -isnot [string] -or $r.receipt_id -cnotmatch '^[a-f0-9]{32}$'){throw 'INTEGRITY_SYNC_RECEIPT_SCHEMA'}
 foreach($k in @('request_id','master_sha256','revision_sha256','source')){if($r.$k -isnot [string] -or $r.$k -cne $b.$k){throw 'INTEGRITY_SYNC_RECEIPT_OWNER'}}
 Exact-Keys $r.parent @('pid','creation_ticks','session');if($r.parent.pid -isnot [int] -or $r.parent.pid -lt 1 -or $r.parent.session -isnot [int] -or $r.parent.creation_ticks -isnot [string] -or $r.parent.creation_ticks -cnotmatch '^[1-9][0-9]{17}$'){throw 'INTEGRITY_SYNC_PARENT_TYPE'}
 foreach($k in @('pid','creation_ticks','session')){if($r.parent.$k -cne $b.parent.$k){throw 'INTEGRITY_SYNC_PARENT_INSTANCE'}}
 foreach($k in @('call_module','cmd')){Exact-Keys $r.$k @('file','size','sha256');foreach($f in @('file','size','sha256')){if($r.$k.$f -cne $c.$k.$f){throw 'INTEGRITY_SYNC_RECEIPT_SOURCE'}}}
 Exact-Keys $r.options @('shell','windowsHide','timeout_ms','encoding');if($r.argv -isnot [object[]] -or ($r.argv -join ',') -cne '/d,/c,ver' -or $r.argv.Count -ne 3 -or $r.options.shell -isnot [bool] -or $r.options.shell -or $r.options.windowsHide -isnot [bool] -or -not $r.options.windowsHide -or $r.options.timeout_ms -isnot [int] -or $r.options.timeout_ms -ne 5000 -or $r.options.encoding -cne 'utf8'){throw 'INTEGRITY_SYNC_INVOCATION'}
 if($r.started_utc_ms -isnot [long] -or $r.returned_utc_ms -isnot [long] -or $r.started_utc_ms -lt 1 -or $r.returned_utc_ms -lt $r.started_utc_ms -or $r.timestamp_precision_ms -isnot [int] -or $r.timestamp_precision_ms -ne 16){throw 'LIFECYCLE_SYNC_TIME_UNKNOWN'}
 foreach($k in @('started_monotonic_ns','returned_monotonic_ns')){if($r.$k -isnot [string] -or $r.$k -cnotmatch '^[0-9]{1,22}$'){throw 'LIFECYCLE_SYNC_MONOTONIC_UNKNOWN'}}
 $elapsed=([decimal]$r.returned_monotonic_ns-[decimal]$r.started_monotonic_ns)/1000000;if($elapsed -lt 0 -or [Math]::Abs([decimal]($r.returned_utc_ms-$r.started_utc_ms)-$elapsed) -gt 32){throw 'LIFECYCLE_SYNC_CLOCK_CONTRADICTION'}
 Exact-Keys $r.result @('pid','status','signal','error');if($r.result.pid -isnot [int] -or $r.result.pid -lt 1 -or $r.result.status -isnot [int] -or $r.result.status -ne 0 -or $null -ne $r.result.signal -or $null -ne $r.result.error){throw 'LIFECYCLE_SYNC_RESULT_UNPROVEN'}
 Exact-Keys $r.outputs @('stdout_bytes','stderr_bytes','summary');foreach($k in @('stdout_bytes','stderr_bytes')){if($r.outputs.$k -isnot [int] -and $r.outputs.$k -isnot [long]){throw 'INTEGRITY_SYNC_OUTPUT_COUNT'};if($r.outputs.$k -lt 0){throw 'INTEGRITY_SYNC_OUTPUT_COUNT'}};if($r.outputs.summary -cne '[output omitted; UTF8 returned-text byte counts only; raw bytes UNKNOWN]'){throw 'SAFETY_SYNC_RAW_OUTPUT'}
}
function Snapshot-Clock([long]$begun,[long]$captured){if(-not [Diagnostics.Stopwatch]::IsHighResolution -or [Diagnostics.Stopwatch]::Frequency -ne 10000000 -or $begun -le 0 -or $captured -lt $begun){throw 'LIFECYCLE_SYNC_CLOCK_UNSUPPORTED'};return [pscustomobject][ordered]@{started_counter=[string]$begun;captured_counter=[string]$captured;frequency='10000000';started_ns=[string][decimal]::Floor([decimal]$begun*100);captured_ns=[string][decimal]::Floor([decimal]$captured*100);clock_profile='LOCKED_CLR_LIBUV_QPC_NS_V1_TEST_ONLY'}}
function Associate-SyncReceipt($receipts,$g,$b,$c,$clock){
 if($g.Step -cne 'OpenQueryHandle' -or -not $g.NativeErrorKnown -or $g.NativeError -ne 87 -or $g.Exe -ine 'cmd.exe' -or $g.Parent -ne $b.parent.pid -or $g.Pid -lt 1){throw 'LIFECYCLE_SYNC_OBSERVATION_INELIGIBLE'}
 if($g.Binding.SnapshotStartedTicks -isnot [long] -or $g.Binding.SnapshotCapturedTicks -isnot [long] -or $g.Binding.SnapshotStartedTicks -le 0 -or $g.Binding.SnapshotCapturedTicks -lt $g.Binding.SnapshotStartedTicks){throw 'LIFECYCLE_SYNC_TIME_UNKNOWN'}
 foreach($r in $receipts){Assert-SyncReceipt $r $b $c};$matches=@($receipts|Where-Object{$_.result.pid -eq $g.Pid});if($matches.Count -ne 1){throw 'LIFECYCLE_SYNC_RECEIPT_NOT_UNIQUE'};$r=$matches[0]
 Exact-Keys $clock @('started_counter','captured_counter','frequency','started_ns','captured_ns','clock_profile');foreach($k in @('started_counter','captured_counter','started_ns','captured_ns')){if($clock.$k -isnot [string] -or $clock.$k -cnotmatch '^[1-9][0-9]{0,18}$' -or [decimal]$clock.$k -gt [long]::MaxValue){throw 'LIFECYCLE_SYNC_MONOTONIC_UNKNOWN'}}
 if($clock.frequency -cne $c.clock_frequency -or $clock.clock_profile -cne $c.clock_profile -or [decimal]$clock.started_ns -ne [decimal]$clock.started_counter*100 -or [decimal]$clock.captured_ns -ne [decimal]$clock.captured_counter*100 -or [decimal]$clock.captured_ns -lt [decimal]$clock.started_ns){throw 'LIFECYCLE_SYNC_TIME_UNKNOWN'}
 $overlap=@($receipts|Where-Object{[Math]::Max([decimal]$clock.started_ns,[decimal]$_.started_monotonic_ns)+4096 -lt [Math]::Min([decimal]$clock.captured_ns,[decimal]$_.returned_monotonic_ns)-4096});if($overlap.Count -ne 1 -or $overlap[0].receipt_id -cne $r.receipt_id){throw 'LIFECYCLE_SYNC_INTERVAL_NOT_UNIQUE'}
 $lower=[decimal]621355968000000000+([decimal]$r.started_utc_ms-16)*10000;$upper=[decimal]621355968000000000+([decimal]$r.returned_utc_ms+16)*10000
 if($lower -gt $g.Binding.SnapshotCapturedTicks -or $g.Binding.SnapshotStartedTicks -gt $upper -or $lower -gt $upper){throw 'LIFECYCLE_SYNC_TIME_UNKNOWN'}
 return $r
}
function Read-SyncReceipts([string]$dir,$b,$c,$parents=@()){
 if(-not @($parents).Count){$parents=@($b.parent)}
 Assert-Plain $dir;$all=@(Get-ChildItem -LiteralPath $dir -File|Where-Object{$_.Name -cmatch '^sync-probe-[a-f0-9]{32}(\.published)?\.json$'});if($all.Count -gt 256 -or ($all|Measure-Object Length -Sum).Sum -gt 2097152){throw 'SAFETY_SYNC_RECEIPT_LIMIT'}
 $out=@();foreach($pub in @($all|Where-Object{$_.Name -cmatch '\.published\.json$'})){Assert-Plain $pub.FullName;$p=Read-Json $pub.FullName 1024;Exact-Keys $p @('schema_version','receipt_id','size','sha256');if($p.schema_version -ne 1 -or $p.receipt_id -isnot [string] -or $p.receipt_id -cnotmatch '^[a-f0-9]{32}$' -or $pub.Name -cne ('sync-probe-'+$p.receipt_id+'.published.json') -or $p.size -isnot [int] -or $p.size -lt 1 -or $p.size -gt 16384 -or $p.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'INTEGRITY_SYNC_PUBLICATION'}
  $file=Join-Path $dir ('sync-probe-'+$p.receipt_id+'.json');if((Get-Item -LiteralPath $file).Length -ne $p.size -or (Hash $file) -cne $p.sha256){throw 'INTEGRITY_SYNC_RECEIPT_BYTES'};$raw=Get-Content -LiteralPath $file -Raw -Encoding UTF8;$r=$raw|ConvertFrom-Json;$owner=@($parents|Where-Object{$_.pid -ceq $r.parent.pid -and $_.creation_ticks -ceq $r.parent.creation_ticks -and $_.session -ceq $r.parent.session});if($owner.Count -ne 1){throw 'LIFECYCLE_SYNC_RECEIPT_PARENT_NOT_PINNED'};$recordBinding=[pscustomobject]@{source=$b.source;request_id=$b.request_id;master_sha256=$b.master_sha256;revision_sha256=$b.revision_sha256;parent=$owner[0]};Assert-SyncReceipt $r $recordBinding $c;if($r.receipt_id -cne $p.receipt_id){throw 'INTEGRITY_SYNC_PUBLICATION_BINDING'}
  $keys=[regex]::Matches($raw,'"([a-zA-Z_][a-zA-Z0-9_]*)"\s*:');$expected=@('schema_version','proof_kind','runtime_profile','receipt_id','request_id','master_sha256','revision_sha256','source','parent','call_module','cmd','argv','options','started_utc_ms','returned_utc_ms','started_monotonic_ns','returned_monotonic_ns','timestamp_precision_ms','result','outputs','pid','creation_ticks','session','file','size','sha256','file','size','sha256','shell','windowsHide','timeout_ms','encoding','pid','status','signal','error','stdout_bytes','stderr_bytes','summary');if($keys.Count -ne $expected.Count){throw 'INTEGRITY_SYNC_DUPLICATE_FIELDS'};foreach($k in ($expected|Select-Object -Unique)){if(@($keys|Where-Object{$_.Groups[1].Value -ceq $k}).Count -ne @($expected|Where-Object{$_ -ceq $k}).Count){throw 'INTEGRITY_SYNC_DUPLICATE_FIELDS'}}
  if($r.parent.pid -ceq $b.parent.pid -and $r.parent.creation_ticks -ceq $b.parent.creation_ticks -and $r.parent.session -ceq $b.parent.session){$out+=@($r)}
 };return $out
}
function Assert-ObserverReady($m,[string]$rid,[string]$rev,[int]$dpid,[long]$dticks){
 Load-Observer $m;$dir=Join-Path $root ('observers\'+$rid);Assert-Plain $dir
 $x=Read-Json (Join-Path $dir 'observer-ready.json');Exact-Keys $x @('schema_version','status','runtime_profile','source','request_id','master_sha256','revision_sha256','session_name','observer_creation_filetime','dispatcher_creation_filetime','machine','c_device_mapping','observer_pid','observer_session','dispatcher_pid','dispatcher_session','self_test_cases','enable_code')
 if($x.schema_version -ne 1 -or $x.status -cne 'OBSERVER_READY' -or $x.request_id -cne $rid -or $x.master_sha256 -cne $PinSha256 -or $x.revision_sha256 -cne $rev -or $x.dispatcher_pid -ne $dpid -or $x.dispatcher_creation_filetime -cne ([string]($dticks-$observerEpochTicks)) -or $x.dispatcher_session -ne $script:ManifestSession -or $x.observer_session -ne 0 -or $x.enable_code -ne 0 -or $x.session_name -cne ('A9-A31-R5-Manifest-'+$rid) -or $x.machine -cne 'WIN-2JQ66JE4HTQ' -or $x.source -cne $engineering.components.observer.legacy_source_binding){throw 'LIFECYCLE_OBSERVER_READY_BINDING'}
 if($script:ForensicFamily -and $x.self_test_cases -ne 43){throw 'INTEGRITY_OBSERVER_GENERATION_SELF_TEST'}
 if(Test-Path -LiteralPath (Join-Path $dir 'observer-halted.json')){throw 'LIFECYCLE_OBSERVER_HALTED'}
 $beat=Join-Path $dir 'observer-heartbeat.json';Assert-Plain $beat;if(([DateTime]::UtcNow-(Get-Item -LiteralPath $beat).LastWriteTimeUtc).TotalSeconds -gt 5){throw 'LIFECYCLE_OBSERVER_HEARTBEAT_STALE'}
 $evp=Join-Path $dir 'observer-events.jsonl';Assert-Plain $evp;try{$evs=[IO.File]::Open($evp,[IO.FileMode]::Open,[IO.FileAccess]::Read,[IO.FileShare]::ReadWrite);try{$evb=New-Object byte[] 4096;$null=$evs.Read($evb,0,4096)}finally{$evs.Dispose()}}catch{throw 'LIFECYCLE_OBSERVER_EVENTS_UNREADABLE'}
 $alive=@([A31Capture]::Snapshot()|Where-Object{$_.Pid -eq [int]$x.observer_pid -and $_.Exe -ieq 'manifest-process-observer.exe'});if($alive.Count -ne 1){throw 'LIFECYCLE_OBSERVER_NOT_RUNNING'}
 return $x
}
function Assert-ObserverFinal([string]$rid){
 $f=Join-Path $root ('observers\'+$rid+'\observer-final.json');if(-not(Test-Path -LiteralPath $f)){throw 'LIFECYCLE_PREVIOUS_OBSERVER_NOT_FINAL'}
 $x=Read-Json $f 262144;if($x.status -cne 'OBSERVER_FINAL_CLOSED' -or $x.request_id -cne $rid -or $x.events_lost -ne 0 -or $x.log_buffers_lost -ne 0 -or $x.realtime_buffers_lost -ne 0 -or $x.session_absent -ne $true -or $x.consumer_ended -ne $true){throw 'LIFECYCLE_PREVIOUS_OBSERVER_NOT_CLOSED'}
 if($script:ForensicFamily){$events=Join-Path $root ('observers\'+$rid+'\observer-events.jsonl');if((Hash $events) -cne $x.events_sha256){throw 'INTEGRITY_ETW_FINAL_LOG'};$audit=Invoke-EngineeringJson 'validate-generations' @($events,[string]$x.dispatcher_pid,[string]$x.dispatcher_creation_filetime);if(($audit.open_instances|ConvertTo-Json -Compress) -cne ($x.open_instances|ConvertTo-Json -Compress)){throw 'LIFECYCLE_OBSERVER_OPEN_GENERATIONS'}}
}
function Manifest-ParentKind([string]$image,[string]$dev){
 if($dev -cnotmatch '^\\Device\\HarddiskVolume[0-9]+$'){return $null}
 return $(if($image -ieq ($dev+'\Windows\System32\cmd.exe')){'cmd'}elseif($image -ieq ($dev+'\Windows\System32\WindowsPowerShell\v1.0\powershell.exe')){'powershell'}else{$null})
}
function Resolve-ManifestObservation($tree,$g,$issue){
 if(-not $script:SyncContext -or $g.Step -cne 'OpenQueryHandle' -or -not $g.NativeErrorKnown -or $g.NativeError -ne 87 -or $g.Exe -ine 'conhost.exe' -or -not $tree.ContainsKey([string]$g.Parent)){return $false}
 $ctx=$script:SyncContext;$parent=$tree[[string]$g.Parent];$image=[string]$parent.binding.Image
 $ready=Assert-ObserverReady $script:ManifestMaster $ctx.request_id $ctx.revision_sha256 $script:ManifestDispatcherPid $script:ManifestDispatcherTicks
 $dev=[string]$ready.c_device_mapping;if($dev -cnotmatch '^\\Device\\HarddiskVolume[0-9]+$'){return $false}
 $kind=Manifest-ParentKind $image $dev;if(-not $kind){return $false}
 if($g.Binding.ParentCreationTicks -cne $parent.creation_ticks -or $g.Binding.ParentSession -cne $parent.session -or $parent.session -ne $script:ManifestSession -or $parent.process.Id -ne $g.Parent -or $parent.process.StartTime.Ticks -ne $parent.creation_ticks){throw 'LIFECYCLE_MANIFEST_PARENT_BINDING'}
 if(-not $script:SnapshotClock -or $script:SnapshotClock.started_ticks -ne $g.Binding.SnapshotStartedTicks -or $script:SnapshotClock.captured_ticks -ne $g.Binding.SnapshotCapturedTicks){throw 'LIFECYCLE_MANIFEST_SNAPSHOT_CLOCK_MISSING'}
  $dir=Join-Path $root ('observers\'+$ctx.request_id);$events=Join-Path $dir 'observer-events.jsonl';$halted=Join-Path $dir 'observer-halted.json'
 $end=[DateTime]::UtcNow.AddMilliseconds(5000);if($ctx.deadline -lt $end){$end=$ctx.deadline}
 do{
  $json=$null;try{$json=[A31ManifestObserver]::ValidateConhostProof($events,$halted,[int]$g.Pid,[int]$g.Parent,[long]$parent.creation_ticks,$kind,[int]$parent.session,$script:ManifestSession,[long]$g.Binding.SnapshotStartedTicks,[long]$g.Binding.SnapshotCapturedTicks)}catch{$e=$_.Exception;while($e.InnerException){$e=$e.InnerException};throw ('LIFECYCLE_MANIFEST_PROOF_REJECTED:'+$e.Message)}
  if($json){
   $proofFact=$json|ConvertFrom-Json;$o=$script:ManifestMaster.manifest_observer
   $proof=[ordered]@{schema_version=1;proof_kind='MANIFEST_CONHOST_INSTANCE_EXIT_V1';status='PROOF_PENDING_FINAL';final_gate='AGENT_OBSERVER_CLOSED_AND_TREE_ENDED_REQUIRED';observation_id=$issue.observation_id;query_failure_retained=$true;request_id=$ctx.request_id;master_sha256=$ctx.master_sha256;revision_sha256=$ctx.revision_sha256;source=$source;machine=$env:COMPUTERNAME;pid=$g.Pid;parent=[ordered]@{pid=$g.Parent;creation_ticks=[string]$parent.creation_ticks;session=$parent.session;kind=$kind;image=$image};observer=[ordered]@{pid=$ready.observer_pid;creation_filetime=$ready.observer_creation_filetime;session_name=$ready.session_name;exe_sha256=$o.exe.sha256;mvid=$o.exe.mvid;build_scope_sha256=$o.build_scope.sha256;events_file=$events};snapshot_started_ticks=[string]$g.Binding.SnapshotStartedTicks;snapshot_captured_ticks=[string]$g.Binding.SnapshotCapturedTicks;original_os_creation_ticks='UNKNOWN';original_native_query_handle='NOT_OBTAINED';fact=$proofFact}
   New-Json (Join-Path $ctx.run ('evidence\resolved-manifest-'+$issue.observation_id+'.json')) $proof;$script:ResolvedManifest+=@($proof);return $true
  }
  if([DateTime]::UtcNow -ge $end){return $false};Start-Sleep -Milliseconds 20
 }while($true)
}
function Resolve-SyncObservation($tree,$g,$issue,[DateTime]$waitEnd){
 if(-not $script:SyncContext -or $g.Step -cne 'OpenQueryHandle' -or -not $g.NativeErrorKnown -or $g.NativeError -ne 87 -or $g.Exe -ine 'cmd.exe' -or -not $tree.ContainsKey([string]$g.Parent)){return $false};$ctx=$script:SyncContext;$parent=$tree[[string]$g.Parent];$ack=$null
 $parents=@();foreach($name in @('electron-pinned.json','electron-restart-pinned.json')){$file=Join-Path $ctx.run ('signals\'+$name);if(Test-Path -LiteralPath $file){$candidate=Read-Json $file;Exact-Keys $candidate @('schema_version','master_sha256','revision_sha256','request_id','pid','creation_ticks','identity');if($candidate.schema_version -ne 1 -or $candidate.master_sha256 -cne $ctx.master_sha256 -or $candidate.revision_sha256 -cne $ctx.revision_sha256 -or $candidate.request_id -cne $ctx.request_id -or -not $tree.ContainsKey([string]$candidate.pid)){throw 'LIFECYCLE_SYNC_RECEIPT_PARENT_NOT_PINNED'};$pin=$tree[[string]$candidate.pid];if($candidate.creation_ticks -isnot [string] -or $candidate.creation_ticks -cne ([string]$pin.creation_ticks) -or $candidate.identity.Session -ne $pin.session -or $pin.process.Id -ne $candidate.pid -or $pin.process.StartTime.Ticks -ne $pin.creation_ticks -or $pin.process.SessionId -ne $pin.session){throw 'LIFECYCLE_SYNC_PARENT_ACK_MISMATCH'};$parents+=@([pscustomobject]@{pid=$candidate.pid;creation_ticks=[string]$pin.creation_ticks;session=$pin.session});if($candidate.pid -eq $g.Parent){if($ack){throw 'LIFECYCLE_SYNC_PARENT_ACK_NOT_UNIQUE'};$ack=$candidate}}}
 if(-not $ack){return $false};Exact-Keys $ack @('schema_version','master_sha256','revision_sha256','request_id','pid','creation_ticks','identity');if($ack.schema_version -ne 1 -or $ack.master_sha256 -cne $ctx.master_sha256 -or $ack.revision_sha256 -cne $ctx.revision_sha256 -or $ack.request_id -cne $ctx.request_id -or $ack.creation_ticks -isnot [string] -or $ack.creation_ticks -cne ([string]$parent.creation_ticks) -or $ack.identity.Session -ne $parent.session -or $g.Binding.ParentCreationTicks -cne $parent.creation_ticks -or $g.Binding.ParentSession -cne $parent.session -or $parent.process.Id -ne $g.Parent -or $parent.process.StartTime.Ticks -ne $parent.creation_ticks -or $parent.process.SessionId -ne $parent.session){throw 'LIFECYCLE_SYNC_PARENT_ACK_MISMATCH'}
 $b=[pscustomobject]@{source=$source;request_id=$ctx.request_id;master_sha256=$ctx.master_sha256;revision_sha256=$ctx.revision_sha256;parent=[pscustomobject]@{pid=$g.Parent;creation_ticks=[string]$parent.creation_ticks;session=$parent.session}};$dir=Join-Path $ctx.run 'evidence'
 do{$receipts=@(Read-SyncReceipts $dir $b $ctx.contract $parents);$matches=@($receipts|Where-Object{$_.result.pid -eq $g.Pid});if($matches.Count){if(-not $script:SnapshotClock -or $script:SnapshotClock.started_ticks -ne $g.Binding.SnapshotStartedTicks -or $script:SnapshotClock.captured_ticks -ne $g.Binding.SnapshotCapturedTicks){throw 'LIFECYCLE_SYNC_SNAPSHOT_CLOCK_MISSING'};$receipt=Associate-SyncReceipt $receipts $g $b $ctx.contract $script:SnapshotClock.clock;$proof=[ordered]@{schema_version=1;proof_kind='SYNC_READONLY_PROBE_EXIT_PROVEN';observation_id=$issue.observation_id;query_failure_retained=$true;request_id=$ctx.request_id;master_sha256=$ctx.master_sha256;revision_sha256=$ctx.revision_sha256;pid=$g.Pid;parent=$b.parent;receipt_id=$receipt.receipt_id;receipt_sha256=(Hash (Join-Path $dir ('sync-probe-'+$receipt.receipt_id+'.json')));snapshot_started_ticks=[string]$g.Binding.SnapshotStartedTicks;snapshot_captured_ticks=[string]$g.Binding.SnapshotCapturedTicks;snapshot_clock=$script:SnapshotClock.clock;os_creation_ticks='UNKNOWN';native_query_handle='NOT_OBTAINED';kernel_cleanup='NOT_PROVEN_BY_THIS_RECEIPT';actual_sync_exit_status=$receipt.result.status};New-Json (Join-Path $dir ('resolved-sync-probe-'+$issue.observation_id+'.json')) $proof;$script:ResolvedSync+=@($proof);return $true};if([DateTime]::UtcNow -ge $waitEnd -or [DateTime]::UtcNow -ge $ctx.deadline){return $false};Start-Sleep -Milliseconds 10}while($true)
}
function Update-Tree($tree,[int]$rootPid){
 $script:SnapshotClock=$null
 try{$begun=[Diagnostics.Stopwatch]::GetTimestamp();$rows=[A31Capture]::Snapshot();$captured=[Diagnostics.Stopwatch]::GetTimestamp();$clock=Snapshot-Clock $begun $captured;$v=[A31Capture]::CaptureObserved([A31Capture+Held[]]@($tree.Values|ForEach-Object{$_.capture}),$rows);$script:SnapshotClock=@{started_ticks=$rows[0].SnapshotStartedTicks;captured_ticks=$rows[0].SnapshotCapturedTicks;clock=$clock}}
 catch{$g=New-Object A31Capture+Gap;$g.Pid=0;$g.Parent=0;$g.Exe='UNKNOWN';$g.ObservedAt=[DateTime]::UtcNow.ToString('o');$g.Step='SnapshotException';$e=$_.Exception;while($e.InnerException){$e=$e.InnerException};$g.ErrorType=$e.GetType().FullName;$g.Error=$e.Message;$g.NativeErrorKnown=$e -is [ComponentModel.Win32Exception];if($g.NativeErrorKnown){$g.NativeError=$e.NativeErrorCode};$g.Binding=New-Object A31Capture+Proof;$v=New-Object A31Capture+CaptureResult;$v.Added=[A31Capture+Held[]]@();$v.Gaps=[A31Capture+Gap[]]@($g);if($script:ForensicFamily){$v.Excluded=[A31Capture+Exclusion[]]@()}}
 Accept-Capture $tree $v
}
function Request-LifecycleAbort([string]$run,[string]$request,[string]$revision,[string]$reason){
 if($request -cnotmatch '^[a-f0-9]{32}$' -or $revision -cnotmatch '^[a-f0-9]{64}$' -or $run -cne (Join-Path $root ('runs\'+$request)) -or $reason -cnotin @('LIFECYCLE_CAPTURE_FAILED','LIFECYCLE_PHASE_TIMEOUT')){throw 'INTEGRITY_ABORT_BINDING'}
 $file=Join-Path $run 'signals\controller-abort.json'
 if(-not(Test-Path -LiteralPath $file)){New-Json $file ([ordered]@{schema_version=1;master_sha256=$PinSha256;revision_sha256=$revision;request_id=$request;reason_code=$reason})}
}
function Set-CaptureDiagnostic([string]$run,[string]$request,[string]$revision,$tree,[string]$error){
 New-Json (Join-Path $run ('evidence\capture-failure-'+[Guid]::NewGuid().ToString('N')+'.json')) ([ordered]@{schema_version=2;status='HALTED_UNKNOWN_RETAINED';master_sha256=$PinSha256;revision_sha256=$revision;request_id=$request;observed_at=[DateTime]::UtcNow.ToString('o');error=Safe-Text $error;held_instances=@(Snapshot-Pinned $tree);unresolved_observations=@(Sync-Unresolved);resolved_sync_probe_observations=@($script:ResolvedSync)})
}
function Drain-HaltedTree($tree,[DateTime]$deadline){
 $end=[DateTime]::UtcNow.AddSeconds(210);if($deadline -lt $end){$end=$deadline}
 do{try{Update-Tree $tree 0}catch{if($script:DrainErrors.Count -lt 128){$script:DrainErrors+=@([ordered]@{at=[DateTime]::UtcNow.ToString('o');error=Safe-Text $_.Exception.Message;status='HALTED_UNKNOWN_RETAINED'})}else{$script:DrainErrorsCapped=$true}};$alive=@($tree.Values|Where-Object{-not $_.process.HasExitedStrict()});if(-not $alive.Count -or [DateTime]::UtcNow -ge $end){return @(Snapshot-Pinned $tree)};Start-Sleep -Milliseconds 50}while($true)
}

function Snapshot-Pinned($tree){return @($tree.Values|ForEach-Object{[ordered]@{pid=$_.pid;parent_pid=$_.parent_pid;creation_ticks=$_.creation_ticks;session=$_.session;pinned_at=$_.pinned_at;binding=$_.binding;exited=$_.process.HasExitedStrict();exit_code=if($_.process.HasExitedStrict()){$_.process.ReadExitCode()}else{'UNKNOWN'}}})}
function Complete-Tree($tree,[int]$timeout){$end=[DateTime]::UtcNow.AddMilliseconds($timeout);do{$alive=@($tree.Values|Where-Object{-not $_.process.HasExitedStrict()});if(-not $alive.Count){return Snapshot-Pinned $tree};if([DateTime]::UtcNow -gt $end){throw 'LIFECYCLE_PINNED_TREE_UNKNOWN'};Update-Tree $tree 0;Start-Sleep -Milliseconds 50}while($true)}

$reuse=$root
$source=$engineering.product_identity.source
$phases=@('Boot','Background','Shell','EncodingSecurity','FailureBoundaries','StopExit','ReleaseExit','Recovery')
$scriptNames=@('stage-product.ps1','launch-product-desktop.ps1','serve-product-desktop.ps1','product-driver.cjs')
function Exact-Keys($o,[string[]]$keys){if(-not $o -or @($o.PSObject.Properties).Count -ne $keys.Count -or @(Compare-Object $keys @($o.PSObject.Properties.Name) -CaseSensitive).Count){throw 'INTEGRITY_RECORD_FIELDS'}}
function File-Digest($rows){[string[]]$lines=@($rows|ForEach-Object{$_.file+':'+$_.sha256+':'+$_.size+"`n"});[Array]::Sort($lines,[StringComparer]::Ordinal);$text=$lines -join '';$h=[Security.Cryptography.SHA256]::Create();try{return ([BitConverter]::ToString($h.ComputeHash([Text.Encoding]::UTF8.GetBytes($text)))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()}}
function Script-Rows($rows,[string[]]$names){if(@($rows).Count -ne $names.Count){throw 'INTEGRITY_SCRIPT_LIST'};$seen=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal);foreach($f in $rows){Exact-Keys $f @('file','size','sha256');if($f.file -isnot [string] -or $f.file -cnotin $names -or -not $seen.Add($f.file) -or $f.sha256 -isnot [string] -or $f.sha256 -cnotmatch '^[a-f0-9]{64}$' -or $f.size -isnot [int] -or $f.size -lt 1 -or $f.size -gt 1MB){throw 'INTEGRITY_SCRIPT_ROW'}}}

$captureSourceSha='dbc85763ce25287adcb4c853e37963755c56d9561f9d06e41f53bfdb78e952cd'
$captureCompilerSha='aae1db57f898ca8bda18590c56f86ced6d0ead80c22033b76fdfe9119706f116'
$captureRefs=@(
 @{file='mscorlib.dll';size=5445664;sha256='cbba0b14d43901ff3d92cc44efe6a79149bfcaa3006c08ca05e186b2a75b54b5'},
 @{file='System.dll';size=3541424;sha256='af12577769e3b0c94fc8e4715cdfd21cbcf0f665bf63489f81e5a0934c94c7e4'},
 @{file='System.Core.dll';size=1551312;sha256='78c77c7250b6e318e69c1162980640bf7da5e8d3303d3abcc32401a52d667139'}
)
$captureKeys=@('file','size','sha256','source_sha256','build_sha256','compiler_sha256','reference_digest','runtime_profile','assembly_name','module_version_id','build_approval_sha256','api_profile','utc_clock')
function Utc-ClockSchema($c){Exact-Keys $c @('file','size','sha256','version','signature_status','api','profile');$e=@{file='C:\Windows\System32\kernel32.dll';size=783720;sha256='4636f65d449b1353100578c6cb139933cf2b134f5e246119d18968873a058bed';version='10.0.19041.5915 (WinBuild.160101.0800)';signature_status='Valid';api='GetSystemTimePreciseAsFileTime';profile='LOCKED_KERNEL32_PRECISE_UTC_FILETIME_V1_TEST_ONLY'};foreach($key in $e.Keys){if($c.$key -isnot $e[$key].GetType() -or $c.$key -cne $e[$key]){throw 'INTEGRITY_PRECISE_UTC_PROFILE'}}}
function Capture-Schema($c){
 if($script:ForensicFamily){
  Exact-Keys $c $captureKeys;Utc-ClockSchema $c.utc_clock;$expected=(Engineering-Master $engineering).capture_library
  foreach($k in $captureKeys){if($k -cne 'utc_clock' -and $c.$k -cne $expected.$k){throw 'INTEGRITY_CAPTURE_V5_CONTRACT'}};return
 }
 Exact-Keys $c $captureKeys;Utc-ClockSchema $c.utc_clock
 if($c.api_profile -cne 'QUERY_LIMITED_INFORMATION_SYNCHRONIZE_SNAPSHOT_PRECISE_UTC_V4'){throw 'INTEGRITY_CAPTURE_API_PROFILE'}
 if($c.build_approval_sha256 -cne 'd4947801b67738be45da98606fb2cf6672bacb80f228968b878bcd9d4a22ae2d' -or $c.file -cne 'capture-library.dll' -or $c.size -isnot [int] -or $c.size -lt 1 -or $c.size -gt 1MB -or $c.source_sha256 -cne $captureSourceSha -or $c.compiler_sha256 -cne $captureCompilerSha -or $c.reference_digest -cne (File-Digest $captureRefs) -or $c.runtime_profile -cne 'WIN10_PS51_NET4_QUERY_HANDLE_CAPTURE_V4_TEST_ONLY' -or $c.assembly_name -cne 'capture-library' -or $c.module_version_id -isnot [string] -or $c.module_version_id -cnotmatch '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$'){throw 'INTEGRITY_CAPTURE_LIBRARY_CONTRACT'}
 foreach($n in @('sha256','build_sha256')){if($c.$n -isnot [string] -or $c.$n -cnotmatch '^[a-f0-9]{64}$'){throw 'INTEGRITY_CAPTURE_LIBRARY_HASH'}}
}
function Capture-Matches($a,$b){foreach($k in $captureKeys){if($k -ceq 'utc_clock'){Utc-ClockSchema $a.$k;Utc-ClockSchema $b.$k;continue};if($a.$k -cne $b.$k){throw 'INTEGRITY_CAPTURE_LIBRARY_BINDING'}}}
function Capture-Build($build,$c){
 Exact-Keys $build @('schema_version','status','source','scope_approval_sha256','runtime_profile','license','source_input','compiler','references','arguments','compiler_pid','compiler_creation_ticks','compiler_exit_code','started_at','finished_at','assembly','stdout_sha256','stderr_sha256','preparation_identity','api_profile','utc_clock')
 Utc-ClockSchema $build.utc_clock
 if($build.api_profile -cne $c.api_profile -or $build.scope_approval_sha256 -cne $c.build_approval_sha256 -or $build.schema_version -ne 1 -or $build.status -cne 'CAPTURE_BUILD_PASS' -or $build.source -cne $engineering.components.capture.legacy_source_binding -or $build.runtime_profile -cne $c.runtime_profile -or $build.license -cne 'Apache-2.0 repository test code; installed Microsoft Framework system license' -or $build.compiler_exit_code -isnot [int] -or $build.compiler_exit_code -ne 0 -or $build.compiler_pid -lt 1 -or $build.compiler_creation_ticks -lt 1){throw 'INTEGRITY_CAPTURE_BUILD_FAILED'}
 Exact-Keys $build.source_input @('file','size','sha256');if($build.source_input.file -cne 'capture-source.cs' -or $build.source_input.size -ne 19439 -or $build.source_input.sha256 -cne $captureSourceSha){throw 'INTEGRITY_CAPTURE_SOURCE'}
 if($build.compiler.sha256 -cne $captureCompilerSha -or $build.compiler.path -cne 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe' -or $build.compiler.signature_status -cne 'Valid'){throw 'INTEGRITY_CAPTURE_COMPILER'}
 foreach($ref in $build.references){Exact-Keys $ref @('file','size','sha256')}
 if(@($build.references).Count -ne 3 -or (File-Digest $build.references) -cne (File-Digest $captureRefs)){throw 'INTEGRITY_CAPTURE_REFERENCES'}
 Exact-Keys $build.assembly @('file','size','sha256','assembly_name','module_version_id');foreach($n in @('file','size','sha256','assembly_name','module_version_id')){if($build.assembly.$n -cne $c.$n){throw 'INTEGRITY_CAPTURE_ASSEMBLY_BUILD'}}
}
function Capture-BuildApproval($a,$c){
 Exact-Keys $a @('schema_version','status','source','contract_sha256','approved_at','response','approved_contract_sections','decision')
 if($a.schema_version -isnot [int] -or $a.schema_version -ne 1 -or $a.status -cne 'OWNER_APPROVED_EXACT_PRODUCT_R3_WIN10_SCOPE' -or $a.source -cne $engineering.components.capture.legacy_source_binding -or $a.contract_sha256 -cne 'da7c6341bbd11878a0e625aa195ada1fc57c822fa9eb16c6a9942ddbb59d4f33' -or $a.response -cne ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('5om55YeG'))) -or $a.approved_contract_sections -cne 'C1-C3' -or $a.decision -cne 'ADR-0187' -or $c.build_approval_sha256 -cne 'd4947801b67738be45da98606fb2cf6672bacb80f228968b878bcd9d4a22ae2d'){throw 'INTEGRITY_CAPTURE_ORIGINAL_APPROVAL'}
}
function Assert-CaptureFiles($m){
 if($script:ForensicFamily){
  Capture-Schema $m.capture_library;$null=Invoke-EngineeringJson 'assert-components' @()
  $ci=Get-Item -LiteralPath $m.capture_library.utc_clock.file;if($ci.VersionInfo.FileVersion -cne $m.capture_library.utc_clock.version -or (Get-AuthenticodeSignature -LiteralPath $ci.FullName).Status.ToString() -cne 'Valid'){throw 'INTEGRITY_PRECISE_UTC_DLL'}
  return ,[IO.File]::ReadAllBytes((Join-Path $root 'inputs\capture-library.dll'))
 }
 $c=$m.capture_library;Capture-Schema $c;$ci=Get-Item -LiteralPath $c.utc_clock.file -Force;if($ci.Length -ne $c.utc_clock.size -or (Hash $ci.FullName) -cne $c.utc_clock.sha256 -or $ci.VersionInfo.FileVersion -cne $c.utc_clock.version -or (Get-AuthenticodeSignature -LiteralPath $ci.FullName).Status.ToString() -cne $c.utc_clock.signature_status){throw 'INTEGRITY_PRECISE_UTC_DLL'};$sourceFile=Join-Path $root 'inputs\capture-source.cs';if(-not(Test-Path -LiteralPath $sourceFile -PathType Leaf) -or (Get-Item -LiteralPath $sourceFile).Length -ne 19439 -or (Hash $sourceFile) -cne $captureSourceSha){throw 'INTEGRITY_CAPTURE_SOURCE_BYTES'};$p=Join-Path $root 'inputs\capture-build.json';if(-not(Test-Path -LiteralPath $p -PathType Leaf)){throw 'INTEGRITY_CAPTURE_BUILD_MISSING'};if((Hash $p) -cne $c.build_sha256){throw 'INTEGRITY_CAPTURE_BUILD_HASH'};$build=Read-Json $p 65536;Capture-Build $build $c;if($build.scope_approval_sha256 -cne $c.build_approval_sha256){throw 'INTEGRITY_CAPTURE_BUILD_APPROVAL'};$a=Join-Path $root 'inputs\capture-build-scope-approval.json';if(-not(Test-Path -LiteralPath $a -PathType Leaf)){throw 'INTEGRITY_CAPTURE_ORIGINAL_APPROVAL_MISSING'};if((Hash $a) -cne $c.build_approval_sha256){throw 'INTEGRITY_CAPTURE_ORIGINAL_APPROVAL_HASH'};Capture-BuildApproval (Read-Json $a) $c
 $p=Join-Path $root 'inputs\capture-library.dll';if(-not(Test-Path -LiteralPath $p -PathType Leaf)){throw 'INTEGRITY_CAPTURE_LIBRARY_MISSING'};Assert-Plain $p;$bytes=[IO.File]::ReadAllBytes($p);if($bytes.Length -ne $c.size){throw 'INTEGRITY_CAPTURE_LIBRARY_SIZE'};$hash=[Security.Cryptography.SHA256]::Create();try{$actual=([BitConverter]::ToString($hash.ComputeHash($bytes))).Replace('-','').ToLowerInvariant()}finally{$hash.Dispose()};if($actual -cne $c.sha256){throw 'INTEGRITY_CAPTURE_LIBRARY_BYTES'}
 $framework='C:\Windows\Microsoft.NET\Framework64\v4.0.30319';if((Hash (Join-Path $framework 'csc.exe')) -cne $captureCompilerSha){throw 'INTEGRITY_CAPTURE_COMPILER_DRIFT'};foreach($ref in $captureRefs){$f=Join-Path $framework $ref.file;if((Get-Item -LiteralPath $f).Length -ne $ref.size -or (Hash $f) -cne $ref.sha256){throw 'INTEGRITY_CAPTURE_REFERENCE_DRIFT'}}
 return ,$bytes
}
function Load-Capture($m){
 $bytes=Assert-CaptureFiles $m;$loaded='A31Capture' -as [type]
 if($loaded){if($loaded.Assembly.GetName().Name -cne $m.capture_library.assembly_name -or $loaded.Module.ModuleVersionId.ToString() -cne $m.capture_library.module_version_id){throw 'INTEGRITY_CAPTURE_ALREADY_LOADED'}}
 else{$assembly=[Reflection.Assembly]::Load($bytes);$type=$assembly.GetType('A31Capture',$true,$false);if($type.GetField('ApiProfile').GetRawConstantValue() -cne $m.capture_library.runtime_profile -or $type.GetField('ApiContract').GetRawConstantValue() -cne $m.capture_library.api_profile -or $type.GetField('PreciseUtcClockProfile').GetRawConstantValue() -cne $m.capture_library.utc_clock.profile -or $type.GetMethod('PreciseUtcTicks').Invoke($null,@()) -le 0 -or $type.GetField('QueryAccess').GetRawConstantValue() -ne 1052672 -or $type.GetField('ImageNameFlags').GetRawConstantValue() -ne 1){throw 'INTEGRITY_CAPTURE_LOADED_API'};if($assembly.GetName().Name -cne $m.capture_library.assembly_name -or $type.Module.ModuleVersionId.ToString() -cne $m.capture_library.module_version_id){throw 'INTEGRITY_CAPTURE_LOADED_TYPE'}}
}

$observerExpected=(Engineering-Master $engineering).manifest_observer
$observerExpected.component_dir=$engineering.deployment.observer_root
$observerEpochTicks=504911232000000000L
function Observer-Schema($o){
 Exact-Keys $o @('component_dir','source','launcher','exe','contract','build_record','build_scope','bootstrap');Exact-Keys $o.source @('file','size','sha256');Exact-Keys $o.launcher @('file','size','sha256');Exact-Keys $o.exe @('file','size','sha256','mvid');Exact-Keys $o.contract @('proof_kind','provider','session_prefix','tolerance_ticks','epoch_ticks','wait_limit_ms','max_events','max_bytes','hard_budget_ms','stop_grace_ms')
 if($o.component_dir -cne $observerExpected.component_dir -or $o.build_scope.sha256 -cne $observerExpected.build_scope.sha256){throw 'INTEGRITY_OBSERVER_BINDING'}
 foreach($n in @('source','launcher','exe','build_record','build_scope','bootstrap')){foreach($k in @($observerExpected.$n.PSObject.Properties.Name)){if($o.$n.$k -cne $observerExpected.$n.$k){throw ('INTEGRITY_OBSERVER_'+$n.ToUpperInvariant())}}}
 $x=$o.contract;if($x.proof_kind -cne 'MANIFEST_CONHOST_INSTANCE_EXIT_V1' -or $x.provider -cne '22fb2cd6-0e7b-422b-a0c7-2fad1fd0e716' -or $x.session_prefix -cne 'A9-A31-R5-Manifest-' -or $x.tolerance_ticks -isnot [int] -or $x.tolerance_ticks -ne 160000 -or $x.epoch_ticks -isnot [long] -or $x.epoch_ticks -ne $observerEpochTicks -or $x.wait_limit_ms -isnot [int] -or $x.wait_limit_ms -ne 5000 -or $x.max_events -ne 4096 -or $x.max_bytes -ne 8388608 -or $x.hard_budget_ms -ne 750000 -or $x.stop_grace_ms -ne 30000){throw 'INTEGRITY_OBSERVER_CONTRACT'}
}
function Assert-ObserverFiles($m){
 $o=$m.manifest_observer;Assert-Plain $o.component_dir
 foreach($row in @($o.source,$o.launcher,$o.exe)){
  $base=if($script:AdmissionFamily -and $row.file -ceq $o.launcher.file){$script:EngineeringToolRoot}else{$o.component_dir}
  $f=Join-Path $base $row.file;Assert-Plain $f;if((Get-Item -LiteralPath $f).Length -ne $row.size -or (Hash $f) -cne $row.sha256){throw 'INTEGRITY_OBSERVER_FILE'}
 }
 $null=Invoke-EngineeringJson 'assert-components' @()
 $b=Read-Json (Join-Path $o.component_dir 'observer-build.json');if($script:ForensicFamily){if($b.status -cne 'FORENSIC_BUILD_AND_SELF_TEST_PASS_NOT_ADMISSION' -or $b.artifact.sha256 -cne $o.exe.sha256 -or $b.artifact.mvid -cne $o.exe.mvid -or $b.scope_sha256 -cne $o.build_scope.sha256){throw 'INTEGRITY_OBSERVER_V3_BUILD'};return};if($b.status -cne 'OBSERVER_BUILD_AND_PROOF_SELF_TEST_PASS' -or $b.dll_sha256 -cne $o.exe.sha256 -or $b.mvid -cne $o.exe.mvid -or $b.scope_sha256 -cne $o.build_scope.sha256){throw 'INTEGRITY_OBSERVER_BUILD'}
}
function Load-Observer($m){
 $o=$m.manifest_observer;$dll=Join-Path $o.component_dir $o.exe.file;$loaded='A31ManifestObserver' -as [type]
 if($loaded){if($loaded.Module.ModuleVersionId.ToString() -cne $o.exe.mvid){throw 'INTEGRITY_OBSERVER_ALREADY_LOADED'};return}
 Assert-ObserverFiles $m;$bytes=[IO.File]::ReadAllBytes($dll);$a=[Reflection.Assembly]::Load($bytes);if($a.ManifestModule.ModuleVersionId.ToString() -cne $o.exe.mvid -or -not ('A31ManifestObserver' -as [type])){throw 'INTEGRITY_OBSERVER_MVID'}
}
function Master-Schema($m){
 Exact-Keys $m @('schema_version','status','source','root','product_root','host_root','reused_input_root','zip','manifest','lock','helper','electron_exe','inputs','scripts','host_files','phases','request_limit','validity_minutes','scope_contract_sha256','approval_evidence_sha256','initial_driver_sha256','capture_library','sync_contract','manifest_observer')
 if($m.schema_version -isnot [int] -or $m.schema_version -ne 1 -or $m.status -cne 'CURRENT_SCOPED_ENGINEERING_MASTER' -or $m.source -cne $source -or $m.root -cne $root -or $m.product_root -cne (Join-Path $reuse 'package') -or $m.host_root -cne (Join-Path $reuse 'host') -or $m.reused_input_root -cne (Join-Path $reuse 'inputs') -or $m.request_limit -isnot [int] -or $m.request_limit -ne 16 -or $m.validity_minutes -isnot [int] -or $m.validity_minutes -ne 120 -or $m.phases -isnot [object[]] -or (@($m.phases) -join ',') -cne ($phases -join ',')){throw 'INTEGRITY_MASTER_CONTRACT'}
 foreach($name in @('zip','manifest','lock','helper','electron_exe','scope_contract_sha256','approval_evidence_sha256','initial_driver_sha256')){if($m.$name -isnot [string] -or $m.$name -cnotmatch '^[a-f0-9]{64}$'){throw 'INTEGRITY_MASTER_HASH'}}
 Capture-Schema $m.capture_library;Sync-Contract $m.sync_contract;Observer-Schema $m.manifest_observer
 Script-Rows $m.scripts @($scriptNames|Where-Object{$_ -ne 'product-driver.cjs'})
}
function Revision-Schema($p,$m,[string]$masterSha){
 Exact-Keys $p @('schema_version','status','master_sha256','source','root','product_root','host_root','zip','manifest','lock','helper','electron_exe','phases','request_limit','validity_minutes','scope_contract_sha256','approval_evidence_sha256','scripts','scripts_digest','capture_library','sync_contract','manifest_observer')
 if($p.schema_version -isnot [int] -or $p.schema_version -ne 1 -or $p.status -cne 'CURRENT_SCOPED_ENGINEERING_REVISION' -or $p.master_sha256 -cne $masterSha -or $p.request_limit -isnot [int] -or $p.request_limit -ne 16 -or $p.validity_minutes -isnot [int] -or $p.validity_minutes -ne 120 -or $p.phases -isnot [object[]] -or (@($p.phases) -join ',') -cne ($phases -join ',')){throw 'INTEGRITY_REVISION_CONTRACT'}
 foreach($name in @('source','root','product_root','host_root','zip','manifest','lock','helper','electron_exe','scope_contract_sha256','approval_evidence_sha256')){if($p.$name -isnot [string] -or $p.$name -cne $m.$name){throw 'INTEGRITY_REVISION_BINDING'}}
 Capture-Schema $p.capture_library;Capture-Matches $p.capture_library $m.capture_library;Sync-Contract $p.sync_contract;if(($p.sync_contract|ConvertTo-Json -Depth 6 -Compress) -cne ($m.sync_contract|ConvertTo-Json -Depth 6 -Compress)){throw 'INTEGRITY_SYNC_REVISION_BINDING'}
 Script-Rows $p.scripts $scriptNames;Observer-Schema $p.manifest_observer;if(($p.manifest_observer|ConvertTo-Json -Depth 8 -Compress) -cne ($m.manifest_observer|ConvertTo-Json -Depth 8 -Compress)){throw 'INTEGRITY_OBSERVER_REVISION_BINDING'}
 foreach($f in $m.scripts){$a=@($p.scripts|Where-Object{$_.file -ceq $f.file});if($a.Count -ne 1 -or $a[0].sha256 -cne $f.sha256 -or $a[0].size -ne $f.size){throw 'INTEGRITY_FIXED_PS_CHANGED'}}
 if($p.scripts_digest -isnot [string] -or $p.scripts_digest -cne (File-Digest $p.scripts)){throw 'INTEGRITY_REVISION_SCRIPT_DIGEST'}
}
function Registration-Schema(){throw 'INTEGRITY_LEGACY_REGISTRATION_NOT_SUPPORTED'}
function Checks-Schema(){throw 'INTEGRITY_LEGACY_CHECKS_NOT_SUPPORTED'}

function Read-Json([string]$file,[int]$limit=65536){Assert-Plain $file;if((Get-Item -LiteralPath $file).Length -gt $limit){throw 'INTEGRITY_RECORD_SIZE'};$v=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json;if($v.schema_version -eq 3 -and $v.kind -ceq 'revision'){return (Invoke-EngineeringJson 'unwrap-revision' @($file,(Hash $file)))};if($v.schema_version -eq 2){throw 'INTEGRITY_LOCAL_REPLAY_NOT_EXECUTABLE'};return $v}
function Read-ExecutionScope([string]$file,[string]$scopeSha){
 if(-not $script:AdmissionFamily -or $file -cne (Join-Path (Split-Path -Parent $script:EngineeringFile) 'scope-approval.json')){throw 'SCOPE_CURRENT_SCOPE_FILE'}
 Assert-Plain $file;if((Get-Item -LiteralPath $file).Length -gt 65536){throw 'INTEGRITY_RECORD_SIZE'}
 if($scopeSha -cnotmatch '^[a-f0-9]{64}$' -or (Hash $file) -cne $scopeSha){throw 'INTEGRITY_SCOPE_APPROVAL'}
 $value=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json;$expected=Invoke-EngineeringJson 'execution-scope' @()
 if(($value|ConvertTo-Json -Depth 20 -Compress) -cne ($expected|ConvertTo-Json -Depth 20 -Compress)){throw 'INTEGRITY_CURRENT_SCOPE_RECORD'}
 return $value
}
function Assert-Master{
 if($env:COMPUTERNAME -cne 'WIN-2JQ66JE4HTQ' -or [Environment]::OSVersion.Version.Build -ne 19045){throw 'IDENTITY_HOST'}
 Assert-Plain $root;$file=$script:EngineeringFile;if((Hash $file) -cne $PinSha256){throw 'INTEGRITY_MASTER_PIN'};$m=Engineering-Master $engineering;Master-Schema $m
 $null=Assert-CaptureFiles $m;Assert-ObserverFiles $m;foreach($row in @($m.sync_contract.call_module,$m.sync_contract.cmd)){$file=if($row.file -ceq $m.sync_contract.call_module.file){Join-Path $m.product_root $row.file}else{$row.file};if((Get-Item -LiteralPath $file).Length -ne $row.size -or (Hash $file) -cne $row.sha256){throw 'INTEGRITY_SYNC_SOURCE_BYTES'}}
 $approvalFile=if($script:AdmissionFamily){Join-Path (Split-Path -Parent $script:EngineeringFile) 'scope-approval.json'}else{Join-Path $root 'inputs\scope-approval.json'}
 if($script:AdmissionFamily){$null=Read-ExecutionScope $approvalFile $m.approval_evidence_sha256}
 else{if((Hash $approvalFile) -cne $m.approval_evidence_sha256){throw 'INTEGRITY_SCOPE_APPROVAL'};$a=Read-Json $approvalFile;$expected=Invoke-EngineeringJson 'execution-scope' @();if(($a|ConvertTo-Json -Depth 20 -Compress) -cne ($expected|ConvertTo-Json -Depth 20 -Compress)){throw 'INTEGRITY_CURRENT_SCOPE_RECORD'}}
 foreach($f in $m.scripts){$file=Join-Path $script:EngineeringToolRoot $f.file;if((Get-Item -LiteralPath $file).Length -ne $f.size -or (Hash $file) -cne $f.sha256){throw 'INTEGRITY_FIXED_SCRIPT'}}
 $expected=@('Win7CodingAgent-0.3.0-alpha.2-win7-x64.zip','electron-v22.3.27-win32-x64.zip','a9-v26-managed-input-lock.json','a9-v26-approved-build-kits.json');if(@($m.inputs).Count -ne 4){throw 'INTEGRITY_INPUT_LIST'};$seen=New-Object 'Collections.Generic.HashSet[string]';foreach($f in $m.inputs){Exact-Keys $f @('file','sha256','size');if($f.file -cnotin $expected -or -not $seen.Add($f.file)){throw 'INTEGRITY_INPUT_NAME'};$file=Join-Path $m.reused_input_root $f.file;if((Get-Item -LiteralPath $file).Length -ne $f.size -or (Hash $file) -cne $f.sha256){throw 'INTEGRITY_INPUT'}}
 $mf=Join-Path $m.product_root 'release-manifest.json';if((Hash $mf) -cne $m.manifest){throw 'INTEGRITY_MANIFEST'};$manifest=Read-Json $mf 262144
 if($manifest.source_commit -cne $source -or $manifest.status -cne 'A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE' -or $manifest.external_acceptance_eligible -ne $false -or $manifest.files.Count -ne 783 -or @(Get-ChildItem -LiteralPath $m.product_root -File -Recurse -Force).Count -ne 784){throw 'INTEGRITY_CLOSURE'}
 $names=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::OrdinalIgnoreCase);foreach($f in $manifest.files){if($f.path -match '(^/|\\|:|(^|/)\.\.(/|$))' -or -not $names.Add($f.path)){throw 'INTEGRITY_MANIFEST_PATH'};$file=Join-Path $m.product_root $f.path;if((Get-Item -LiteralPath $file).Length -ne $f.size -or (Hash $file) -cne $f.sha256){throw 'INTEGRITY_PAYLOAD'}}
 $names.Clear();if(@($m.host_files).Count -lt 10 -or @(Get-ChildItem -LiteralPath $m.host_root -File -Recurse -Force).Count -ne @($m.host_files).Count){throw 'INTEGRITY_HOST_CLOSURE'};foreach($f in $m.host_files){Exact-Keys $f @('file','size','sha256');if($f.file -match '(^/|\\|:|(^|/)\.\.(/|$))' -or -not $names.Add($f.file)){throw 'INTEGRITY_HOST_PATH'};$file=Join-Path $m.host_root $f.file;if((Get-Item -LiteralPath $file).Length -ne $f.size -or (Hash $file) -cne $f.sha256){throw 'INTEGRITY_HOST_FILE'}}
 if((Hash (Join-Path $m.host_root 'electron.exe')) -cne $m.electron_exe -or (Hash (Join-Path $m.product_root 'resources\native\runner\spike02_helper.exe')) -cne $m.helper){throw 'INTEGRITY_LOCKED_NATIVE'}
 if((Get-PSDrive C).Free -lt 1GB -or (Get-ChildItem -LiteralPath $root -File -Recurse -Force|Measure-Object Length -Sum).Sum -gt 1GB){throw 'CAPACITY_STOP'}
 return $m
}
function Assert-Revision([string]$sha,$m){
 if($sha -cnotmatch '^[a-f0-9]{64}$'){throw 'INTEGRITY_REVISION_NAME'};$file=Join-Path $root ('inputs\revision-'+$sha+'.json');if((Hash $file) -cne $sha){throw 'INTEGRITY_REVISION_PIN'};$p=Read-Json $file;Revision-Schema $p $m $PinSha256
 $verified=Invoke-EngineeringJson 'assert-registration' @($file,$sha);if(($verified|ConvertTo-Json -Depth 30 -Compress) -cne ($p|ConvertTo-Json -Depth 30 -Compress)){throw 'INTEGRITY_CURRENT_REVISION'}
 $dir=Join-Path $script:EngineeringToolRoot ('revisions\'+$sha);Assert-Plain $dir;$all=@(Get-ChildItem -LiteralPath $dir -Force);if($all.Count -ne 4 -or @($all|Where-Object{$_ -isnot [IO.FileInfo]}).Count){throw 'INTEGRITY_REVISION_FILE_LIST'}
 foreach($f in $p.scripts){$file=Join-Path $dir $f.file;if((Get-Item -LiteralPath $file).Length -ne $f.size -or (Hash $file) -cne $f.sha256){throw 'INTEGRITY_REVISION_FILE'}}
 $driver=Get-Content -LiteralPath (Join-Path $dir 'product-driver.cjs') -Raw -Encoding UTF8;$matches=[regex]::Matches($driver,'// SYNC_SAFETY_BEGIN\n([\s\S]*?)// SYNC_SAFETY_END');if($matches.Count -ne 2){throw 'INTEGRITY_SYNC_SAFETY_SEGMENTS'};$parts=@($matches|ForEach-Object{$_.Groups[1].Value});$h=[Security.Cryptography.SHA256]::Create();try{$digest=([BitConverter]::ToString($h.ComputeHash([Text.Encoding]::UTF8.GetBytes(($parts -join "`n"))))).Replace('-','').ToLowerInvariant()}finally{$h.Dispose()};if($digest -cne $p.sync_contract.driver_safety_sha256){throw 'INTEGRITY_SYNC_FIXED_SAFETY_BYTES'}
 return $p
}
function Assert-Request($q,$pin,[string]$revSha){
 $keys=@('schema_version','request_id','phase','source','zip','manifest','lock','scripts_digest','pin_sha256');Exact-Keys $q $keys
 foreach($name in @('request_id','phase','source','zip','manifest','lock','scripts_digest','pin_sha256')){if($q.$name -isnot [string]){throw 'INTEGRITY_REQUEST_FIELD_TYPE'}}
 if($q.schema_version -isnot [int] -or $q.schema_version -ne 1 -or $q.request_id -cnotmatch '^[a-f0-9]{32}$' -or $q.phase -cnotin $phases -or $q.source -cne $pin.source -or $q.zip -cne $pin.zip -or $q.manifest -cne $pin.manifest -or $q.lock -cne $pin.lock -or $q.scripts_digest -cne $pin.scripts_digest -or $q.pin_sha256 -cne $revSha){throw 'INTEGRITY_REQUEST_BINDING'}
}
function Parse-Request([string]$raw,$pin,[string]$revSha){
 if([Text.Encoding]::UTF8.GetByteCount($raw) -gt 4096){throw 'INTEGRITY_REQUEST_SIZE'};$matches=[regex]::Matches($raw,'"([a-z][a-z0-9_]*)"\s*:');$keys=@('schema_version','request_id','phase','source','zip','manifest','lock','scripts_digest','pin_sha256');$seen=New-Object 'Collections.Generic.HashSet[string]' ([StringComparer]::Ordinal)
 if($matches.Count -ne 9){throw 'INTEGRITY_REQUEST_DUPLICATE_OR_EXTRA'};foreach($k in $matches){if($k.Groups[1].Value -cnotin $keys -or -not $seen.Add($k.Groups[1].Value)){throw 'INTEGRITY_REQUEST_DUPLICATE_OR_EXTRA'}};$q=$raw|ConvertFrom-Json;Assert-Request $q $pin $revSha;return $q
}
function Dispatch-Allowed([int]$count,[DateTime]$deadline,[string]$state,[bool]$treeConfirmed){if($count -lt 0 -or $count -ge 16 -or [DateTime]::UtcNow -ge $deadline){throw 'SCOPE_EXPIRED_OR_LIMIT'};if($state -cne 'WAITING' -or -not $treeConfirmed){throw 'LIFECYCLE_NEXT_DISPATCH_FORBIDDEN'}}
function Assert-EntryFresh([string]$entryRoot){
 Assert-Plain $entryRoot
 foreach($name in @('evidence\dispatcher-entry-claim.json','evidence\dispatcher-start.json','evidence\dispatcher-ready.json','evidence\dispatcher-final.json','requests\stop.json')){if(Test-Path -LiteralPath (Join-Path $entryRoot $name)){throw 'INTEGRITY_OLD_DISPATCHER_ENTRY'}}
}
function New-EntryClaim([string]$entryRoot,$d){
 Assert-EntryFresh $entryRoot
 $c=[pscustomobject][ordered]@{schema_version=1;master_sha256=$d.master_sha256;dispatcher_pid=$d.identity.Pid;creation_ticks=$d.creation_ticks;started_at=$d.started_at;valid_until=$d.valid_until}
 Assert-EntryClaim $c $d
 try{New-Json (Join-Path $entryRoot 'evidence\dispatcher-entry-claim.json') $c}catch{throw ('INTEGRITY_ENTRY_CLAIM_CREATE_FAILED:'+ $_.Exception.GetType().Name)}
}
function Assert-EntryClaim($c,$d){
 Exact-Keys $c @('schema_version','master_sha256','dispatcher_pid','creation_ticks','started_at','valid_until')
 if($c.schema_version -isnot [int] -or $c.schema_version -ne 1 -or $c.dispatcher_pid -isnot [int] -or $c.dispatcher_pid -lt 1 -or $c.creation_ticks -isnot [long] -or $c.creation_ticks -lt 1 -or $c.started_at -isnot [string] -or $c.valid_until -isnot [string] -or $c.master_sha256 -cne $d.master_sha256 -or $c.dispatcher_pid -ne $d.identity.Pid -or $c.creation_ticks -ne $d.creation_ticks -or $c.started_at -cne $d.started_at -or $c.valid_until -cne $d.valid_until){throw 'INTEGRITY_ENTRY_CLAIM_BINDING'}
}
function Safe-Text([string]$text){$secret='A931-Synthetic-Key-20261003-123456789';return $text.Replace($secret,'[redacted]').Replace([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($secret)),'[redacted]')}
function Secret-Found([string]$text){$secret='A931-Synthetic-Key-20261003-123456789';return $text.Contains($secret) -or $text.Contains([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($secret)))}
$bootstrapMaster=Assert-Master;Load-Capture $bootstrapMaster
if($script:ContextMode){if((Get-Identity ([Diagnostics.Process]::GetCurrentProcess())|ConvertTo-Json -Compress) -cne ($script:AdmissionContext.identity|ConvertTo-Json -Compress)){throw 'IDENTITY_ADMISSION_LIBRARY_TOKEN'}}
if($LibraryOnly){return}
if($ProbeOnly){[ordered]@{status='PROBE_ONLY';identity=Get-Identity ([Diagnostics.Process]::GetCurrentProcess());snapshot_count=@([A31Capture]::Snapshot()).Count;ps_version=$PSVersionTable.PSVersion.ToString()}|ConvertTo-Json -Depth 6 -Compress;return}

if(-not $RevisionSha256 -or -not $RequestId){throw 'INTEGRITY_WORKER_ARGUMENTS'}
$run=Join-Path $root ('runs\'+$RequestId);$r=[ordered]@{schema_version=1;status='HALTED';master_sha256=$PinSha256;revision_sha256=$RevisionSha256;request_id=$RequestId;started_at=[DateTime]::UtcNow.ToString('o');identity=Get-Identity ([Diagnostics.Process]::GetCurrentProcess());tree='UNKNOWN'}
$tree=@{};$child=$null;$stdout=$null;$stderr=$null
try{
 Assert-Identity $r.identity;$master=Assert-Master;$revision=Assert-Revision $RevisionSha256 $master;$revisionDir=Join-Path $script:EngineeringToolRoot ('revisions\'+$RevisionSha256)
 $q=Parse-Request (Get-Content -LiteralPath (Join-Path $root ('requests\request-'+$RequestId+'.json')) -Raw -Encoding UTF8) $revision $RevisionSha256;if($q.request_id -cne $RequestId){throw 'INTEGRITY_WORKER_REQUEST_ID'};if($script:ProductContract){$revisionLabel=(Get-Content -LiteralPath (Join-Path $root ('inputs\revision-'+$RevisionSha256+'.json')) -Raw -Encoding UTF8|ConvertFrom-Json).label;$null=Invoke-EngineeringJson 'assert-product-request' @($q.phase,[string]$revisionLabel)}
 $bound=Join-Path $run 'signals\worker-pinned.json';$until=[DateTime]::UtcNow.AddSeconds(10);while(-not(Test-Path -LiteralPath $bound)){if([DateTime]::UtcNow -gt $until){throw 'LIFECYCLE_WORKER_PIN_TIMEOUT'};Start-Sleep -Milliseconds 40};$b=Read-Json $bound
 $self=[Diagnostics.Process]::GetCurrentProcess();$row=@([A31Capture]::Snapshot()|Where-Object{$_.Pid -eq $PID});if($b.master_sha256 -cne $PinSha256 -or $b.revision_sha256 -cne $RevisionSha256 -or $b.request_id -cne $RequestId -or $b.worker_pid -ne $PID -or $b.worker_creation_ticks -ne $self.StartTime.ToUniversalTime().Ticks -or $row.Count -ne 1 -or $row[0].Parent -ne $b.dispatcher_pid){throw 'LIFECYCLE_WORKER_PARENT_BINDING'}
 $parent=[Diagnostics.Process]::GetProcessById($b.dispatcher_pid);try{$null=$parent.Handle;Assert-Identity (Get-Identity $parent);if($parent.StartTime.ToUniversalTime().Ticks -ne $b.dispatcher_creation_ticks){throw 'LIFECYCLE_DISPATCHER_INSTANCE'}}finally{$parent.Dispose()}
 $start=Read-Json (Join-Path $root 'evidence\dispatcher-start.json');Assert-EntryClaim (Read-Json (Join-Path $root 'evidence\dispatcher-entry-claim.json')) $start;$deadline=[DateTime]::Parse($start.valid_until).ToUniversalTime();if($start.master_sha256 -cne $PinSha256 -or $start.identity.Pid -ne $b.dispatcher_pid -or $deadline -gt [DateTime]::Parse($start.started_at).ToUniversalTime().AddMinutes(120) -or [DateTime]::UtcNow -ge $deadline){throw 'SCOPE_WORKER_EXPIRED'}
 $script:SyncContext=@{run=$run;request_id=$RequestId;master_sha256=$PinSha256;revision_sha256=$RevisionSha256;contract=$master.sync_contract;deadline=$deadline};$script:ManifestMaster=$master;$script:ManifestDispatcherPid=[int]$b.dispatcher_pid;$script:ManifestDispatcherTicks=[long]$b.dispatcher_creation_ticks;$r.observer_ready=Assert-ObserverReady $master $RequestId $RevisionSha256 $b.dispatcher_pid $b.dispatcher_creation_ticks;$r.request=$q;$r.status='RUNNING';New-Json (Join-Path $run 'evidence\controller-start.json') $r
    $psi=New-Object Diagnostics.ProcessStartInfo;$psi.FileName=Join-Path $master.host_root 'electron.exe';$psi.UseShellExecute=$false;$psi.WorkingDirectory=$run;$selectedWorkspace=Join-Path $run 'workspace';if($q.phase -ceq 'Background'){$selectedWorkspace=Join-Path $selectedWorkspace ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('5Lit5paHIOi3r+W+hA==')));$null=[IO.Directory]::CreateDirectory($selectedWorkspace)};$psi.Arguments='"'+(Join-Path $revisionDir 'product-driver.cjs')+'" --a9-smoke-workspace="'+$selectedWorkspace+'"'
    $psi.EnvironmentVariables['LOCALAPPDATA']=Join-Path $run 'isolated-localappdata';$psi.EnvironmentVariables['TEMP']=Join-Path $run 'isolated-temp';$psi.EnvironmentVariables['TMP']=Join-Path $run 'isolated-temp';$psi.EnvironmentVariables['WIN7AGENT_A9_DATAROOT']=Join-Path $run 'isolated-localappdata\a9-data';$psi.EnvironmentVariables['A9_ENGINEERING_BINDING']=$script:EngineeringFile;$psi.EnvironmentVariables['A9_ENGINEERING_BINDING_SHA256']=$PinSha256;$psi.EnvironmentVariables['A9_TEST_ROOT']=$run;$psi.EnvironmentVariables['A9_TEST_PRODUCT']=$master.product_root;$psi.EnvironmentVariables['A9_TEST_PHASE']=$q.phase;$psi.EnvironmentVariables['A9_TEST_PIN_SHA256']=$RevisionSha256;$psi.EnvironmentVariables['A9_TEST_MASTER_SHA256']=$PinSha256
    $psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
    $child=[Diagnostics.Process]::Start($psi);$tree[[string]$child.Id]=New-Pinned $child $PID;$r.electron_identity=Get-Identity $child;Assert-Identity $r.electron_identity
    $stdout=New-Object A31Capture+Drain($child.StandardOutput);$stderr=New-Object A31Capture+Drain($child.StandardError)
    New-Json (Join-Path $run 'signals\electron-pinned.json') ([ordered]@{schema_version=1;master_sha256=$PinSha256;revision_sha256=$RevisionSha256;request_id=$RequestId;pid=$child.Id;creation_ticks=[string]$tree[[string]$child.Id].creation_ticks;identity=$r.electron_identity})
    $end=[DateTime]::UtcNow.AddMinutes(9)
    while(-not $child.WaitForExit(20)){
     Update-Tree $tree $child.Id
     foreach($sf in @(Get-ChildItem -LiteralPath (Join-Path $run 'signals') -File|Where-Object{$_.Name -cmatch '^pin-[a-z0-9-]+\.json$'})){
      $ack=Join-Path $sf.DirectoryName ('ack-'+$sf.Name);if(Test-Path -LiteralPath $ack){continue};Assert-Plain $sf.FullName;$s=Get-Content -LiteralPath $sf.FullName -Raw -Encoding UTF8|ConvertFrom-Json
      $rows=@();foreach($n in @($s.pids)){if(-not $tree.ContainsKey([string]$n)){throw 'LIFECYCLE_REQUESTED_PID_NOT_PINNED'};$p=$tree[[string]$n];if($p.process.HasExitedStrict()){throw 'LIFECYCLE_CRITICAL_EARLY_EXIT'};$i=Get-Identity $p.process;Assert-Identity $i -NativeOwnedJob;$rows+=[ordered]@{pid=$p.pid;parent_pid=$p.parent_pid;creation_ticks=$p.creation_ticks;identity=$i}}
      if($s.relationship -ceq 'helper-root-child' -and ($rows.Count -ne 3 -or $rows[1].parent_pid -ne $rows[0].pid -or $rows[2].parent_pid -ne $rows[1].pid)){throw 'LIFECYCLE_EXACT_PARENT_MISMATCH'}
      New-Json $ack ([ordered]@{status='PINNED_BEFORE_CONTROL';relationship=$s.relationship;processes=$rows;at=[DateTime]::UtcNow.ToString('o')})
     }
     if([DateTime]::UtcNow -gt $end -or [DateTime]::UtcNow -gt $deadline){throw 'LIFECYCLE_PHASE_TIMEOUT'}
    }
    Update-Tree $tree $child.Id;$r.exit_code=$child.ExitCode
    if($q.phase -ceq 'ReleaseExit'){
     $ack=Get-Content -LiteralPath (Join-Path $run 'signals\ack-pin-release-exit.json') -Raw -Encoding UTF8|ConvertFrom-Json;$pins=@($ack.processes);if($pins.Count -ne 3){throw 'LIFECYCLE_RELEASE_PINS'}
     $hp=$tree[[string]$pins[0].pid].process;$rp=$tree[[string]$pins[1].pid].process;$kp=$tree[[string]$pins[2].pid].process
     if(-not $hp.WaitForExit(5000)){throw 'LIFECYCLE_RELEASE_HELPER_UNKNOWN'}
     $r.release_handoff=@{helper_exit_code=$hp.ReadExitCode();root_alive=-not $rp.HasExitedStrict();child_alive=-not $kp.HasExitedStrict();bound_instances=$pins;at=[DateTime]::UtcNow.ToString('o')}
     New-Json (Join-Path $run 'evidence\actual-release-handoff.json') $r.release_handoff
     if($hp.ReadExitCode() -ne 0 -or $rp.HasExitedStrict() -or $kp.HasExitedStrict()){throw 'LIFECYCLE_RELEASE_LIVE_HANDOFF_UNPROVEN'}
    }
    $r.tree=@(Complete-Tree $tree 210000)
    if($q.phase -ceq 'ReleaseExit' -and ($rp.ReadExitCode() -ne 0 -or $kp.ReadExitCode() -ne 0)){throw 'LIFECYCLE_RELEASE_NATURAL_EXIT_FAILED'}
    if($q.phase -ceq 'Recovery' -and $r.exit_code -eq 93){
     if(-not $stdout.Work.Wait(5000) -or -not $stderr.Work.Wait(5000) -or $stdout.Overflow -or $stderr.Overflow -or $stdout.Failed -or $stderr.Failed){throw 'SAFETY_CRASH_CAPTURE'}
     $r.crash_exit_code=93;$r.crash_tree=$r.tree
     New-Json (Join-Path $run 'evidence\controller-crash-tree-confirmed.json') @{exit_code=93;tree=$r.tree;safe_stdout=$stdout.Text.Replace('A931-Synthetic-Key-20261003-123456789','[redacted]');safe_stderr=$stderr.Text.Replace('A931-Synthetic-Key-20261003-123456789','[redacted]')}
     $crash=Get-Content -LiteralPath (Join-Path $run 'evidence\driver-crash.json') -Raw -Encoding UTF8|ConvertFrom-Json;if($crash.status -cne 'FAULT_INJECTED_PENDING_RECOVERY' -or $crash.request_id -cne $q.request_id){throw 'INTEGRITY_CRASH_BINDING'}
     $psi.Arguments='"'+(Join-Path $revisionDir 'product-driver.cjs')+'"';$psi.EnvironmentVariables['A9_TEST_RESTART']='1'
     $child=[Diagnostics.Process]::Start($psi);if($tree.ContainsKey([string]$child.Id)){throw 'LIFECYCLE_RESTART_PID_REUSED'};$tree[[string]$child.Id]=New-Pinned $child $PID;$r.restart_identity=Get-Identity $child;Assert-Identity $r.restart_identity
     $stdout=New-Object A31Capture+Drain($child.StandardOutput);$stderr=New-Object A31Capture+Drain($child.StandardError)
     New-Json (Join-Path $run 'signals\electron-restart-pinned.json') ([ordered]@{schema_version=1;master_sha256=$PinSha256;revision_sha256=$RevisionSha256;request_id=$RequestId;pid=$child.Id;creation_ticks=[string]$tree[[string]$child.Id].creation_ticks;identity=$r.restart_identity})
     $end=[DateTime]::UtcNow.AddMinutes(2);while(-not $child.WaitForExit(20)){Update-Tree $tree $child.Id;if([DateTime]::UtcNow -gt $end){throw 'LIFECYCLE_RESTART_TIMEOUT'}}
     $r.exit_code=$child.ExitCode;$r.tree=@(Complete-Tree $tree 15000)
    }
    if(-not $stdout.Work.Wait(5000) -or -not $stderr.Work.Wait(5000) -or $stdout.Failed -or $stderr.Failed -or $stdout.Overflow -or $stderr.Overflow){throw 'SAFETY_CAPTURE_FAILED'}
    $secret='A931-Synthetic-Key-20261003-123456789';$safeOut=$stdout.Text.Replace($secret,'[redacted]').Replace([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($secret)),'[redacted]');$safeErr=$stderr.Text.Replace($secret,'[redacted]').Replace([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($secret)),'[redacted]')
    New-Json (Join-Path $run 'evidence\safe-process-output.json') @{stdout=$safeOut;stderr=$safeErr;stdout_secret_found=$stdout.Text.Contains($secret);stderr_secret_found=$stderr.Text.Contains($secret)}
    $dr=Join-Path $run 'evidence\driver-final.json';Assert-Plain $dr;$driver=Get-Content -LiteralPath $dr -Raw -Encoding UTF8|ConvertFrom-Json
    if($driver.request_id -cne $q.request_id -or $driver.phase -cne $q.phase){throw 'INTEGRITY_DRIVER_BINDING'}
    $r.driver_status=$driver.status;$r.status=if($r.exit_code -eq 0 -and $driver.status -ceq 'PASS'){if($stdout.Text.Contains($secret) -or $stderr.Text.Contains($secret)){throw 'SAFETY_SECRET_LEAK'};'PHASE_PASS_REQUIRES_EVIDENCE_REVIEW'}else{'FIXTURE_FAILED_TREE_CONFIRMED'}
    if((Secret-Found $stdout.Text) -or (Secret-Found $stderr.Text)){throw 'SAFETY_SECRET_LEAK'}
    if($driver.halt -eq $true){throw 'SAFETY_DRIVER_HARD_GATE'}

}catch{
 $r.status='HALTED';$r.error=Safe-Text $_.Exception.Message;$r.unresolved_observations=@(Sync-Unresolved);$r.resolved_sync_probe_observations=@($script:ResolvedSync);$r.resolved_manifest_proofs=@($script:ResolvedManifest);$r.manifest_proofs_pending_final=@($script:ResolvedManifest).Count
 if($tree.Count){
  if($r.error -like '*LIFECYCLE*' -and $q){try{Request-LifecycleAbort $run $q.request_id $RevisionSha256 'LIFECYCLE_CAPTURE_FAILED'}catch{$r.abort_error=Safe-Text $_.Exception.Message}}
  try{Set-CaptureDiagnostic $run $RequestId $RevisionSha256 $tree $r.error}catch{$r.diagnostic_error=Safe-Text $_.Exception.Message}
  $drainEnd=if($deadline){$deadline}else{[DateTime]::UtcNow.AddSeconds(210)}
  $r.tree=@(Drain-HaltedTree $tree $drainEnd);$r.drain_errors=@($script:DrainErrors);$r.drain_errors_capped=$script:DrainErrorsCapped;$r.unresolved_observations=@(Sync-Unresolved);$r.resolved_sync_probe_observations=@($script:ResolvedSync);$r.resolved_manifest_proofs=@($script:ResolvedManifest);$r.manifest_proofs_pending_final=@($script:ResolvedManifest).Count;$r.held_tree_ended=@($r.tree|Where-Object{-not $_.exited -or $_.exit_code -ceq 'UNKNOWN'}).Count -eq 0
 }
}
finally{$r.resolved_sync_probe_observations=@($script:ResolvedSync);$r.resolved_manifest_proofs=@($script:ResolvedManifest);$r.manifest_proofs_pending_final=@($script:ResolvedManifest).Count;$r.original_query_failures=@($script:CaptureIssues);$r.finished_at=[DateTime]::UtcNow.ToString('o');foreach($item in $tree.Values){try{$item.process.Dispose()}catch{$r.status='HALTED';$r.disposal_error=Safe-Text $_.Exception.Message}};New-Json (Join-Path $run 'evidence\controller-final.json') $r}
$r|ConvertTo-Json -Depth 25 -Compress
if($r.status -ceq 'HALTED'){exit 1}

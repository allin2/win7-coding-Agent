param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$PinSha256)

# ENGINEERING_02 / ADR-0195: all consumers use the strict central validator.
$ErrorActionPreference='Stop'
function Invoke-EngineeringJson([string]$operation,[string[]]$values){
 $hostExe=Join-Path $script:EngineeringRoot 'host\electron.exe'
 if((Get-FileHash -LiteralPath $hostExe -Algorithm SHA256).Hash.ToLowerInvariant() -cne '2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb'){throw 'INTEGRITY_ENGINEERING_HOST'}
 $tool=Join-Path $script:EngineeringToolRoot 'input-binding.cjs';$argv=@($tool,$operation,$script:EngineeringFile,$script:EngineeringHash)+$values
 foreach($v in $argv){if(-not $v -or $v.Contains('"') -or $v.Contains("`r") -or $v.Contains("`n")){throw 'INTEGRITY_ENGINEERING_ARGUMENT'}}
 $pi=New-Object Diagnostics.ProcessStartInfo;$pi.FileName=$hostExe;$pi.Arguments=($argv|ForEach-Object{'"'+$_+'"'}) -join ' ';$pi.UseShellExecute=$false;$pi.RedirectStandardOutput=$true;$pi.RedirectStandardError=$true;$pi.StandardOutputEncoding=[Text.Encoding]::UTF8;$pi.StandardErrorEncoding=[Text.Encoding]::UTF8;$pi.StandardOutputEncoding=New-Object Text.UTF8Encoding($false);$pi.StandardErrorEncoding=New-Object Text.UTF8Encoding($false);$pi.EnvironmentVariables['ELECTRON_RUN_AS_NODE']='1';$pi.EnvironmentVariables['A9_ENGINEERING_BINDING']=''
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
Assert-EngineeringExecution
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);$OutputEncoding=[Console]::OutputEncoding
$root=$Root
foreach($name in @('evidence\dispatcher-entry-claim.json','evidence\dispatcher-start.json','evidence\dispatcher-ready.json','evidence\dispatcher-final.json','requests\stop.json')){if(Test-Path -LiteralPath (Join-Path $root $name)){throw 'INTEGRITY_OLD_DISPATCHER_ENTRY'}}
$masterFile=$script:EngineeringFile;if((Get-FileHash -LiteralPath $masterFile).Hash.ToLowerInvariant() -cne $PinSha256){throw 'INTEGRITY_MASTER_PIN'}
$m=Engineering-Master $engineering
foreach($f in $m.scripts){if($f.file -cnotin @('stage-product.ps1','launch-product-desktop.ps1','serve-product-desktop.ps1') -or (Get-FileHash -LiteralPath (Join-Path $script:EngineeringToolRoot $f.file)).Hash.ToLowerInvariant() -cne $f.sha256){throw 'INTEGRITY_FIXED_SCRIPT'}}
. (Join-Path $script:EngineeringToolRoot 'serve-product-desktop.ps1') -Root $root -PinSha256 $PinSha256 -LibraryOnly
$self=[Diagnostics.Process]::GetCurrentProcess();$null=$self.Handle;$started=[DateTime]::UtcNow;$deadline=$started.AddMinutes(120)
$d=[ordered]@{schema_version=1;status='HALTED';master_sha256=$PinSha256;started_at=$started.ToString('o');valid_until=$deadline.ToString('o');identity=Get-Identity $self;creation_ticks=$self.StartTime.ToUniversalTime().Ticks;request_limit=16;requests=0;results=@();observed_tree=@()}
$tree=@{};$done=New-Object 'Collections.Generic.HashSet[string]';$passed=New-Object 'Collections.Generic.HashSet[string]';$active=$null;$lastRequest=$null
New-EntryClaim $root $d
try{
 Assert-EntryClaim (Read-Json (Join-Path $root 'evidence\dispatcher-entry-claim.json')) $d;Assert-Identity $d.identity;$master=Assert-Master;if(Test-Path -LiteralPath (Join-Path $root 'evidence\dispatcher-start.json')){throw 'INTEGRITY_OLD_DISPATCHER'}
 $d.status='WAITING';New-Json (Join-Path $root 'evidence\dispatcher-start.json') $d
 New-Json (Join-Path $root 'evidence\dispatcher-ready.json') ([ordered]@{status='WAITING';dispatcher=$d})
 Write-Host 'A9-31 reusable desktop dispatcher ready. Keep this window open (2 hours / 16 requests).'
 while([DateTime]::UtcNow -lt $deadline -and $done.Count -lt 16 -and $passed.Count -lt 8){
  $stop=Join-Path $root 'requests\stop.json';if(Test-Path -LiteralPath $stop){$st=Read-Json $stop;Exact-Keys $st @('master_sha256');if($st.master_sha256 -cne $PinSha256){throw 'INTEGRITY_STOP_REQUEST'};break}
  $requests=@(Get-ChildItem -LiteralPath (Join-Path $root 'requests') -File|Where-Object{$_.Name -cmatch '^request-[a-f0-9]{32}\.json$'}|Sort-Object Name)
  foreach($rf in $requests){
   if($done.Contains($rf.Name)){continue};Dispatch-Allowed $done.Count $deadline $d.status (-not $active);Assert-EntryClaim (Read-Json (Join-Path $root 'evidence\dispatcher-entry-claim.json')) $d;Assert-Identity (Get-Identity $self);$master=Assert-Master
   $raw=Get-Content -LiteralPath $rf.FullName -Raw -Encoding UTF8;$candidate=$raw|ConvertFrom-Json;if($candidate.pin_sha256 -isnot [string] -or $candidate.pin_sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'INTEGRITY_REVISION_REQUEST_NAME'};$revision=Assert-Revision $candidate.pin_sha256 $master;$q=Parse-Request $raw $revision $candidate.pin_sha256
   if($rf.Name -cne ('request-'+$q.request_id+'.json')){throw 'INTEGRITY_REQUEST_FILENAME'}
   $run=Join-Path $root ('runs\'+$q.request_id);if(Test-Path -LiteralPath $run){throw 'INTEGRITY_EXISTING_RUN'};$null=[IO.Directory]::CreateDirectory($run);foreach($name in @('workspace','isolated-localappdata','isolated-temp','evidence','signals')){$null=[IO.Directory]::CreateDirectory((Join-Path $run $name))};New-Json (Join-Path $run 'evidence\request.json') $q
   $null=$done.Add($rf.Name);$d.requests=$done.Count;$d.status='RUNNING';$revisionDir=Join-Path $script:EngineeringToolRoot ('revisions\'+$q.pin_sha256)
   if($lastRequest){Assert-ObserverFinal $lastRequest};$script:ManifestMaster=$master;$script:ManifestDispatcherPid=$PID;$script:ManifestDispatcherTicks=[long]$d.creation_ticks;$d.observer_ready=Assert-ObserverReady $master $q.request_id $q.pin_sha256 $PID $d.creation_ticks;$psi=New-Object Diagnostics.ProcessStartInfo;$psi.FileName=Join-Path $PSHOME 'powershell.exe';$psi.UseShellExecute=$false;$psi.WorkingDirectory=$run;$workerPolicy=if($engineering.tool_identity.version -ceq 'engineering-02-v6-product'){'RemoteSigned'}else{'Bypass'};$psi.Arguments='-NoProfile -NonInteractive -ExecutionPolicy '+$workerPolicy+' -File "'+(Join-Path $revisionDir 'serve-product-desktop.ps1')+'" -Root "'+$root+'" -PinSha256 '+$PinSha256+' -RevisionSha256 '+$q.pin_sha256+' -RequestId '+$q.request_id;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true
   $script:SyncContext=@{run=$run;request_id=$q.request_id;master_sha256=$PinSha256;revision_sha256=$q.pin_sha256;contract=$master.sync_contract;deadline=$deadline};$tree=@{};$active=[Diagnostics.Process]::Start($psi);$tree[[string]$active.Id]=New-Pinned $active $PID;Assert-Identity (Get-Identity $active);$out=New-Object A31Capture+Drain($active.StandardOutput);$err=New-Object A31Capture+Drain($active.StandardError)
   New-Json (Join-Path $run 'signals\worker-pinned.json') ([ordered]@{master_sha256=$PinSha256;revision_sha256=$q.pin_sha256;request_id=$q.request_id;dispatcher_pid=$PID;dispatcher_creation_ticks=$d.creation_ticks;worker_pid=$active.Id;worker_creation_ticks=$tree[[string]$active.Id].creation_ticks})
   $phaseEnd=[DateTime]::UtcNow.AddMinutes(12)
   while(-not $active.WaitForExit(40)){Update-Tree $tree $active.Id;if([DateTime]::UtcNow -ge $deadline -or [DateTime]::UtcNow -ge $phaseEnd){throw 'LIFECYCLE_WORKER_TIMEOUT'}}
   Update-Tree $tree $active.Id;$workerExit=$active.ExitCode;$actualTree=@(Complete-Tree $tree 20000)
   if(-not $out.Work.Wait(5000) -or -not $err.Work.Wait(5000) -or $out.Failed -or $err.Failed -or $out.Overflow -or $err.Overflow){throw 'SAFETY_WORKER_CAPTURE'}
   New-Json (Join-Path $run 'evidence\safe-worker-output.json') @{stdout=Safe-Text $out.Text;stderr=Safe-Text $err.Text;stdout_secret_found=Secret-Found $out.Text;stderr_secret_found=Secret-Found $err.Text}
   if((Secret-Found $out.Text) -or (Secret-Found $err.Text)){throw 'SAFETY_WORKER_SECRET'}
   $result=Read-Json (Join-Path $run 'evidence\controller-final.json') 1048576
   if($result.request_id -cne $q.request_id -or $result.master_sha256 -cne $PinSha256 -or $result.revision_sha256 -cne $q.pin_sha256 -or $workerExit -ne 0 -or $result.status -ceq 'HALTED' -or @($result.tree).Count -eq 0 -or @($result.tree|Where-Object{-not $_.exited -or $_.exit_code -ceq 'UNKNOWN'}).Count){throw 'SAFETY_WORKER_HARD_GATE'}
   if($result.status -cnotin @('PHASE_PASS_REQUIRES_EVIDENCE_REVIEW','FIXTURE_FAILED_TREE_CONFIRMED')){throw 'INTEGRITY_WORKER_RESULT_STATUS'}
   $receipt=[ordered]@{schema_version=1;request_id=$q.request_id;phase=$q.phase;master_sha256=$PinSha256;revision_sha256=$q.pin_sha256;dispatcher_pid=$PID;worker_pid=$active.Id;worker_exit_code=$workerExit;status=$result.status;observed_tree=$actualTree;at=[DateTime]::UtcNow.ToString('o')};New-Json (Join-Path $run 'evidence\dispatcher-result.json') $receipt;$d.results+=@($receipt)
   if($result.status -ceq 'PHASE_PASS_REQUIRES_EVIDENCE_REVIEW'){$null=$passed.Add($q.phase)}
   $d.observed_tree+=@($actualTree);foreach($item in $tree.Values){$item.process.Dispose()};$tree=@{};$active=$null;$lastRequest=$q.request_id;$d.status='WAITING';Write-Host ($q.phase+': '+$result.status+'; observer final required before the next request.')
  }
  Start-Sleep -Milliseconds 200
 }
 $d.status='COMPLETED';$d.passed_phases=@($passed);if($tree.Count){$d.observed_tree+=@(Complete-Tree $tree 20000)}
}catch{
 $d.status='HALTED';$d.error=Safe-Text $_.Exception.Message;$d.unresolved_observations=@(Sync-Unresolved);$d.resolved_sync_probe_observations=@($script:ResolvedSync);$d.resolved_manifest_proofs=@($script:ResolvedManifest)
 if($tree.Count){
  if($d.error -like '*LIFECYCLE*' -and $q){try{Request-LifecycleAbort $run $q.request_id $q.pin_sha256 'LIFECYCLE_CAPTURE_FAILED'}catch{$d.abort_error=Safe-Text $_.Exception.Message}}
  if($q){try{Set-CaptureDiagnostic $run $q.request_id $q.pin_sha256 $tree $d.error}catch{$d.diagnostic_error=Safe-Text $_.Exception.Message}}
  $d.observed_tree+=@(Drain-HaltedTree $tree $deadline);$d.drain_errors=@($script:DrainErrors);$d.drain_errors_capped=$script:DrainErrorsCapped;$d.unresolved_observations=@(Sync-Unresolved);$d.resolved_sync_probe_observations=@($script:ResolvedSync);$d.resolved_manifest_proofs=@($script:ResolvedManifest);$d.held_tree_ended=@($d.observed_tree|Where-Object{-not $_.exited -or $_.exit_code -ceq 'UNKNOWN'}).Count -eq 0
 }
}
finally{$d.resolved_sync_probe_observations=@($script:ResolvedSync);$d.resolved_manifest_proofs=@($script:ResolvedManifest);$d.original_query_failures=@($script:CaptureIssues);$d.finished_at=[DateTime]::UtcNow.ToString('o');foreach($item in $tree.Values){try{$item.process.Dispose()}catch{$d.status='HALTED';$d.disposal_error=Safe-Text $_.Exception.Message}};New-Json (Join-Path $root 'evidence\dispatcher-final.json') $d;$self.Dispose()}
$d|ConvertTo-Json -Depth 25 -Compress
if($d.status -ceq 'HALTED'){exit 1}

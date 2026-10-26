param([Parameter(Mandatory=$true)][ValidateSet('AdminQuery','Observer','CanaryCreate','CanaryVerify','Ordinary')][string]$Mode,[Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$PinSha256,[ValidatePattern('^[a-f0-9]{32}$')][string]$CanaryRunId)
# Apache-2.0. Win10 PS5.1/CLR4 test-only admission. Never a product dispatcher or Win7 component.
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
function Plain([string]$p){$i=Get-Item -LiteralPath $p -Force;while($i){if($i.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'INTEGRITY_REPARSE'};$i=if($i -is [IO.DirectoryInfo]){$i.Parent}else{$i.Directory}}}
function Hash([string]$p){Plain $p;return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Read-Json([string]$p){Plain $p;if((Get-Item -LiteralPath $p).Length -gt 262144){throw 'INTEGRITY_JSON_LIMIT'};return (Get-Content -LiteralPath $p -Raw -Encoding UTF8|ConvertFrom-Json)}
function Save([string]$p,$o){Plain (Split-Path -Parent $p);$raw=(New-Object Text.UTF8Encoding($false)).GetBytes(($o|ConvertTo-Json -Depth 25 -Compress));if($raw.Length -gt 262144){throw 'OUTPUT_LIMIT'};$f=[IO.File]::Open($p,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$f.Write($raw,0,$raw.Length);$f.Flush()}finally{$f.Dispose()};return (Hash $p)}
function Fresh-Directory([string]$p){Plain (Split-Path -Parent $p);if(Test-Path -LiteralPath $p){throw 'INTEGRITY_FRESH_RUN'};$null=New-Item -ItemType Directory -Path $p;Plain $p}
function Capture-DiagnosticProof($b){
 if(-not $b){throw 'INTEGRITY_CAPTURE_DIAGNOSTIC_PROOF'}
 return [ordered]@{snapshot_started_ticks=[string]$b.SnapshotStartedTicks;snapshot_captured_ticks=[string]$b.SnapshotCapturedTicks;query_ticks=[string]$b.QueryTicks;creation_ticks=[string]$b.CreationTicks;parent_creation_ticks=[string]$b.ParentCreationTicks;session=[string]$b.Session;image=[string]$b.Image;clock_profile=[string]$b.ClockProfile;second_observation=[string]$b.SecondObservation;ownership=[string]$b.Ownership}
}
function Capture-DiagnosticAdded($h){
 return [ordered]@{pid=$h.Pid;parent_pid=$h.Parent;creation_ticks=[string]$h.CreationTicks;session=$h.Session;binding=Capture-DiagnosticProof $h.Binding}
}
function Capture-DiagnosticGap($g){
 return [ordered]@{pid=$g.Pid;parent_pid=$g.Parent;image=[string]$g.Exe;step=[string]$g.Step;error_type=[string]$g.ErrorType;native_error_known=$g.NativeErrorKnown;native_error_code=if($g.NativeErrorKnown){$g.NativeError}else{'UNKNOWN'};binding=Capture-DiagnosticProof $g.Binding}
}
function Capture-DiagnosticExcluded($x){
 return [ordered]@{pid=$x.Pid;parent_pid=$x.Parent;reason=[string]$x.Reason;binding=Capture-DiagnosticProof $x.Binding}
}
function Capture-DiagnosticOwned($child){
 return [ordered]@{pid=$child.pid;creation_ticks=[string]$child.creation_ticks;session=$child.session;image=[string]$child.image}
}
function Save-CaptureDiagnostic($v,$c,$child,[string]$file){
 if($null -eq $v.Added -or $null -eq $v.Gaps -or $null -eq $v.Excluded){throw 'INTEGRITY_CAPTURE_DIAGNOSTIC_ARRAYS'}
 if($v.Added.Count -gt 128 -or $v.Gaps.Count -gt 128 -or $v.Excluded.Count -gt 128){throw 'SAFETY_CAPTURE_DIAGNOSTIC_LIMIT'}
 $added=@($v.Added|ForEach-Object{Capture-DiagnosticAdded $_})
 $gaps=@($v.Gaps|ForEach-Object{Capture-DiagnosticGap $_})
 $excluded=@($v.Excluded|ForEach-Object{Capture-DiagnosticExcluded $_})
 # Fixed metadata only: never serialize QueryProcess, native handles, command lines or environment values.
 $record=[ordered]@{schema_version=1;status='OWN_CHILD_CAPTURE_DIAGNOSTIC_V1_NOT_ADMISSION';source=$c.source;binding_sha256=$c.binding_sha256;execution_scope_sha256=$c.execution_scope_sha256;tool_digest=$c.tool_digest;component_digest=$c.component_digest;run_id=$c.run_id;role=$c.role;operation=$c.operation;parent=$c.parent;owned=Capture-DiagnosticOwned $child;added_count=$v.Added.Count;gaps_count=$v.Gaps.Count;excluded_count=$v.Excluded.Count;added=$added;gaps=$gaps;excluded=$excluded}
 $null=Save $file $record
}
function Capture-DiagnosticParent($parent){
 return [ordered]@{pid=$parent.pid;creation_ticks=[string]$parent.creation_ticks;session=$parent.session}
}
function Get-ChildStreamDiagnostic($task){
 if(-not $task.IsCompleted -or [string]$task.Status -cne 'RanToCompletion'){throw 'LIFECYCLE_OWN_CHILD_DRAIN_UNKNOWN'}
 $text=$task.Result;if($null -eq $text){throw 'LIFECYCLE_OWN_CHILD_DRAIN_UNKNOWN'}
 $limit=[Math]::Min(4096,$text.Length)
 if($limit -lt $text.Length -and $limit -gt 0 -and [char]::IsHighSurrogate($text,$limit-1) -and [char]::IsLowSurrogate($text,$limit)){$limit--}
 $saved=$text.Substring(0,$limit);$truncated=$saved.Length -ne $text.Length
 $bytes=(New-Object Text.UTF8Encoding($false)).GetBytes($saved);$sha=[Security.Cryptography.SHA256]::Create()
 try{$digest=[BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','').ToLowerInvariant()}finally{$sha.Dispose()}
 $fullHash=if($truncated){'UNKNOWN'}else{$digest}
 # These are decoded StreamReader text and its re-encoded prefix, never raw pipe bytes.
 return [ordered]@{completed=$task.IsCompleted;task_status=[string]$task.Status;encoding_scope='UTF8_STREAMREADER_DECODED_TEXT_REENCODED_UTF8';decoded_utf16_code_units=$text.Length;saved_utf16_code_units=$saved.Length;text=$saved;truncated=$truncated;saved_utf8_bytes=$bytes.Length;saved_utf8_sha256=$digest;full_decoded_utf8_sha256=$fullHash}
}
function Save-ChildStreamDiagnostic($c,$child,$stdout,$stderr,[string]$file){
 $out=Get-ChildStreamDiagnostic $stdout;$err=Get-ChildStreamDiagnostic $stderr
 $record=[ordered]@{schema_version=1;status='OWN_CHILD_STREAM_DIAGNOSTIC_V1_NOT_ADMISSION';evidence_scope='WIN10_DIRECT';source=$c.source;binding_sha256=$c.binding_sha256;execution_scope_sha256=$c.execution_scope_sha256;tool_digest=$c.tool_digest;component_digest=$c.component_digest;run_id=$c.run_id;role=$c.role;operation=$c.operation;parent=Capture-DiagnosticParent $c.parent;child=Capture-DiagnosticOwned $child;original_pipe_byte_identity='UNKNOWN';stdout=$out;stderr=$err}
 $null=Save $file $record
}
function Get-OrdinaryCaptureSet($v,$c,$child){
 if($null -eq $v.Added -or $null -eq $v.Gaps -or $null -eq $v.Excluded -or $v.Gaps.Count -ne 0 -or $v.Excluded.Count -ne 0 -or $v.Added.Count -lt 1 -or $v.Added.Count -gt 2){throw 'LIFECYCLE_OWN_CHILD_CAPTURE'}
 $roots=@($v.Added|Where-Object{$_.Pid -eq $child.pid});if($roots.Count -ne 1){throw 'LIFECYCLE_OWN_CHILD_ROOT'}
 $r=$roots[0];$image=[string]$child.image
 if($image -inotmatch '^\\Device\\HarddiskVolume[0-9]+\\Windows\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe$' -or $r.Parent -ne $c.parent.pid -or $r.CreationTicks.ToString() -cne $child.creation_ticks -or $r.Session -ne $child.session -or $r.Session -ne $c.parent.session -or $r.Binding.Image -ine $image){throw 'LIFECYCLE_OWN_CHILD_ROOT'}
 $console=$image.Substring(0,$image.Length-'WindowsPowerShell\v1.0\powershell.exe'.Length)+'conhost.exe';$seen=@{};$rows=@()
 foreach($h in $v.Added){
  if($h.Pid -le 0 -or $h.Pid -eq $c.parent.pid -or $seen.ContainsKey([string]$h.Pid)){throw 'LIFECYCLE_CAPTURE_DUPLICATE'};$seen[[string]$h.Pid]=$true
  $isRoot=$h.Pid -eq $r.Pid;$parentPid=if($isRoot){$c.parent.pid}else{$r.Pid};$parentTicks=if($isRoot){$c.parent.creation_ticks}else{$child.creation_ticks};$expectedImage=if($isRoot){$image}else{$console};$b=$h.Binding
  if($h.Parent -ne $parentPid -or $h.Session -ne $c.parent.session -or $b.ActualPid -ne $h.Pid -or $b.Session -ne $h.Session -or $b.Image -ine $expectedImage -or $b.Ownership -cne 'PROVEN' -or $b.ClockProfile -cne 'LOCKED_KERNEL32_PRECISE_UTC_FILETIME_V1_TEST_ONLY' -or $b.SecondObservation -cne 'NOT_REQUIRED'){throw 'LIFECYCLE_CAPTURE_SET_INSTANCE'}
  foreach($n in @('CreationTicks','ParentCreationTicks','SnapshotStartedTicks','SnapshotCapturedTicks','QueryTicks')){if([string]$b.$n -cnotmatch '^[1-9][0-9]{17}$'){throw 'LIFECYCLE_CAPTURE_SET_TICKS'}}
  if($h.CreationTicks.ToString() -cne [string]$b.CreationTicks -or [string]$b.ParentCreationTicks -cne $parentTicks -or [long]$b.CreationTicks -le [long]$parentTicks -or [long]$b.SnapshotStartedTicks -lt [long]$b.CreationTicks -or [long]$b.SnapshotCapturedTicks -lt [long]$b.SnapshotStartedTicks -or [long]$b.QueryTicks -lt [long]$b.SnapshotCapturedTicks){throw 'LIFECYCLE_CAPTURE_SET_TICKS'}
  $proof=Capture-DiagnosticProof $b;$proof.actual_pid=$b.ActualPid
  $rows+=@([ordered]@{kind=if($isRoot){'powershell'}else{'conhost'};pid=$h.Pid;parent_pid=$h.Parent;creation_ticks=$h.CreationTicks.ToString();parent_creation_ticks=$parentTicks;session=$h.Session;image=[string]$b.Image;proof=$proof;same_instance=$false;exit_code='UNKNOWN';exit_ticks='UNKNOWN';held_query_after_exit=$false})
 }
 return [ordered]@{schema_version=1;raw_added_count=$v.Added.Count;root_count=1;console_count=($v.Added.Count-1);gap_count=0;excluded_count=0;instances=$rows}
}
function Assert-OrdinaryExecutionPolicy{
 $machinePolicy=[string](Microsoft.PowerShell.Security\Get-ExecutionPolicy -Scope MachinePolicy);$userPolicy=[string](Microsoft.PowerShell.Security\Get-ExecutionPolicy -Scope UserPolicy)
 $processPolicy=[string](Microsoft.PowerShell.Security\Get-ExecutionPolicy -Scope Process);$effectivePolicy=[string](Microsoft.PowerShell.Security\Get-ExecutionPolicy)
 # Observation before native loading; ordinary identity is still checked by the existing token/Explorer chain.
 [ordered]@{schema_version=1;status='ORDINARY_EXECUTION_POLICY_OBSERVED_NOT_ADMISSION';binding_sha256=$PinSha256;machine_policy=$machinePolicy;user_policy=$userPolicy;process_policy=$processPolicy;effective_policy=$effectivePolicy}|ConvertTo-Json -Compress
 if($machinePolicy -cne 'Undefined' -or $userPolicy -cne 'Undefined'){throw 'SCOPE_ORDINARY_GROUP_POLICY'}
 if($processPolicy -cne 'RemoteSigned' -or $effectivePolicy -cne 'RemoteSigned'){throw 'SCOPE_ORDINARY_EXECUTION_POLICY'}
}
function Invoke-Central([string]$operation,[string[]]$values){
 $argv=@((Join-Path $toolRoot 'input-binding.cjs'),$operation,$bindingFile,$PinSha256)+$values
 foreach($v in $argv){if(-not $v -or $v.Contains('"') -or $v.Contains("`r") -or $v.Contains("`n")){throw 'INTEGRITY_ARGUMENT'}}
 $pi=New-Object Diagnostics.ProcessStartInfo;$pi.FileName=$hostExe;$pi.Arguments=($argv|ForEach-Object{'"'+$_+'"'}) -join ' ';$pi.UseShellExecute=$false;$pi.RedirectStandardOutput=$true;$pi.RedirectStandardError=$true;$pi.StandardOutputEncoding=[Text.Encoding]::UTF8;$pi.StandardErrorEncoding=[Text.Encoding]::UTF8;$pi.EnvironmentVariables['ELECTRON_RUN_AS_NODE']='1';$pi.EnvironmentVariables.Remove('NODE_OPTIONS');$pi.EnvironmentVariables.Remove('A9_ENGINEERING_BINDING')
 $p=[Diagnostics.Process]::Start($pi);try{$null=$p.Handle;$pidValue=$p.Id;$creation=$p.StartTime.ToUniversalTime().Ticks.ToString();$o=$p.StandardOutput.ReadToEndAsync();$e=$p.StandardError.ReadToEndAsync();if(-not $p.WaitForExit(10000)){throw ('LIFECYCLE_CENTRAL_UNKNOWN:'+ $pidValue+':'+$creation)};$clock=[Diagnostics.Stopwatch]::StartNew();if(-not $o.Wait(1000) -or -not $e.Wait([Math]::Max(0,1000-[int]$clock.ElapsedMilliseconds))){throw 'LIFECYCLE_CENTRAL_DRAIN_UNKNOWN'};if($o.Result.Length -gt 262144 -or $e.Result.Length -gt 4096){throw 'OUTPUT_LIMIT'};if($p.ExitCode -ne 0 -or $e.Result.Length){throw ('CENTRAL_REJECTED:'+ $e.Result)};return ($o.Result|ConvertFrom-Json)}finally{$p.Dispose()}
}
$expectedRoot='C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-Engineering-Win10-Entry-20261007-R4'
if($Root -cne $expectedRoot){throw 'SCOPE_ADMISSION_ROOT'};Plain $Root
$bindingFile=Join-Path $Root ('inputs\bindings\'+$PinSha256+'\master-pin.json');if((Hash $bindingFile) -cne $PinSha256){throw 'INTEGRITY_BINDING_HASH'}
$binding=Read-Json $bindingFile;$toolRoot=Join-Path $Root ('control\versions\'+$binding.tool_identity.files_digest);if($PSScriptRoot -cne $toolRoot){throw 'INTEGRITY_ADMISSION_ENTRY_PATH'};if($binding.tool_identity.version -cnotin @('engineering-02-v5-admission','engineering-02-v6-product')){throw 'SCOPE_ADMISSION_VERSION'}
if($Mode -ceq 'Ordinary'){Assert-OrdinaryExecutionPolicy}
$hostExe=Join-Path $Root 'host\electron.exe';if((Get-Item -LiteralPath $hostExe).Length -ne 157602304 -or (Hash $hostExe) -cne $binding.product_identity.electron_exe){throw 'INTEGRITY_HOST'}
$role=if($Mode -ceq 'Ordinary'){'ORDINARY_FORENSIC_ADMISSION'}else{'ADMIN_FORENSIC_ADMISSION'}
$operation=switch($Mode){'AdminQuery'{'capture-self-query'} 'Observer'{'observer-admit'} 'Ordinary'{'ordinary-probe'} default{'canary-admin'}}
# Central approval and operation checks run before any component is loaded.
$null=Invoke-Central 'authorize-admission-start' @($role,$operation)
$null=Invoke-Central 'assert-components' @()
$artifact=Join-Path $Root 'inputs\capture-library.dll';$assembly=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($artifact));$type=$assembly.GetType('A31Capture',$true,$false)
if($assembly.ManifestModule.ModuleVersionId.ToString() -cne $binding.components.capture.artifact.mvid -or ('A31Capture' -as [type]).Module.ModuleVersionId.ToString() -cne $binding.components.capture.artifact.mvid){throw 'INTEGRITY_QUERY_TYPE'}
$self=[Diagnostics.Process]::GetCurrentProcess();$null=$self.Handle
$identity=[A31Capture]::Token($self);$parent=[ordered]@{pid=$self.Id;creation_ticks=$self.StartTime.ToUniversalTime().Ticks.ToString();session=$self.SessionId}
$explorer=$null
if($Mode -ceq 'Ordinary'){
 $rows=@([A31Capture]::Snapshot());$child=$parent;$chain=@();$found=$false
 for($n=0;$n -lt 8;$n++){
  $row=@($rows|Where-Object{$_.Pid -eq $child.pid});if($row.Count -ne 1 -or $row[0].Parent -le 0){throw 'IDENTITY_ANCESTOR_UNKNOWN'}
  $p=[Diagnostics.Process]::GetProcessById($row[0].Parent);try{$null=$p.Handle;$pp=[ordered]@{pid=$p.Id;creation_ticks=$p.StartTime.ToUniversalTime().Ticks.ToString();session=$p.SessionId};$token=[A31Capture]::Token($p);$image=$p.MainModule.FileName;if($p.HasExited -or $token.Sid -cne $identity.Sid -or $p.SessionId -ne $self.SessionId){throw 'IDENTITY_ANCESTOR_INSTANCE'};$chain+=@([ordered]@{child=$child;parent=$pp});if($image -ieq 'C:\Windows\explorer.exe'){$explorer=[ordered]@{parent=$pp;identity=$token;image=$image.ToLowerInvariant();chain=$chain};$found=$true;break};if($image -inotmatch '^C:\\Windows\\System32\\(cmd\.exe|WindowsPowerShell\\v1\.0\\powershell\.exe)$'){throw 'IDENTITY_ANCESTOR_IMAGE'};$child=$pp}finally{$p.Dispose()}
 };if(-not $found){throw 'IDENTITY_EXPLORER_ANCESTOR_REQUIRED'}
}
$run=[Guid]::NewGuid().ToString('N');$runs=Join-Path $Root 'runs';if(-not(Test-Path -LiteralPath $runs)){$null=New-Item -ItemType Directory -Path $runs};Plain $runs
$dir=Join-Path $runs $run;Fresh-Directory $dir;$created=[DateTime]::UtcNow
# Obtain the digest from the central validator; PowerShell key order is not a canonical hash.
$digests=Invoke-Central 'admission-digests' @()
$context=[ordered]@{schema_version=1;status='CURRENT_FORENSIC_CONTEXT_NOT_ADMISSION';evidence_scope='WIN10_DIRECT';machine=$env:COMPUTERNAME;root=$Root;binding_sha256=$PinSha256;execution_scope_sha256=$digests.execution_scope_sha256;tool_digest=$binding.tool_identity.files_digest;component_digest=$digests.component_digest;source=$binding.product_identity.source;run_id=$run;role=$role;operation=$operation;parent=$parent;identity=$identity;explorer=$explorer;created_at=$created.ToString('o');deadline_at=$created.AddSeconds(180).ToString('o')}
$contextFile=Join-Path $dir 'current-context.json';$contextSha=Save $contextFile $context
$null=Invoke-Central 'authorize-admission' @($role,$operation,$contextFile,$contextSha)
# One claim per fixed mode and immutable binding. Reusing a completed or failed dispatch is refused.
$claims=Join-Path $Root 'evidence\admission-claims';if(-not(Test-Path -LiteralPath $claims)){$null=New-Item -ItemType Directory -Path $claims};Plain $claims
$claimFile=Join-Path $claims ($PinSha256+'-'+$Mode+'.json');$null=Save $claimFile ([ordered]@{run_id=$run;context_sha256=$contextSha;mode=$Mode;binding_sha256=$PinSha256})
$started=[DateTime]::UtcNow;$details=$null;$failure=$null;$owned=$null;$held=$null;$closeErrors=@();$lifecycle=[ordered]@{status='NOT_STARTED';pid='UNKNOWN';creation_ticks='UNKNOWN';session='UNKNOWN';image='UNKNOWN';exit_code='UNKNOWN';exit_ticks='UNKNOWN'}
function Canary-Files([string]$canary){$result=@();foreach($name in @('admin-a.json','admin-b.json','ordinary-a.json','ordinary-b.json')){$p=Join-Path $canary $name;$result+=@([ordered]@{file=$name;size=(Get-Item -LiteralPath $p).Length;sha256=Hash $p})};return $result}
function Read-Canary([string]$p,[string]$rid,[string]$owner){$v=Read-Json $p;if($v.schema_version -ne 1 -or $v.binding_sha256 -cne $PinSha256 -or $v.canary_run_id -cne $rid -or $v.owner -cne $owner -or $v.value -cne ('A9-'+$rid)){throw 'INTEGRITY_CURRENT_CANARY'}}
try{
 . (Join-Path $toolRoot 'serve-product-desktop.ps1') -Root $Root -PinSha256 $PinSha256 -LibraryOnly -AdmissionOperation $operation -AdmissionContextFile $contextFile -AdmissionContextSha256 $contextSha
 if($Mode -ceq 'AdminQuery'){
  $before=[A31Capture]::PreciseUtcTicks();$q=[A31Capture]::OpenQuery($self.Id)
  try{$check=[A31Capture]::OpenQuery($self.Id);try{[A31Capture]::AssertSameInstance($q,$check,$self.Id,$self.StartTime.ToUniversalTime().Ticks,$self.SessionId,$q.ImagePath)}finally{$check.Dispose()};$details=[ordered]@{artifact_sha256=$binding.components.capture.artifact.sha256;mvid=$type.Module.ModuleVersionId.ToString();pid=$q.Id;creation_ticks=$q.StartTime.ToUniversalTime().Ticks.ToString();session=$q.SessionId;image=$q.ImagePath;snapshot_count=@([A31Capture]::Snapshot()).Count;clock_before=$before.ToString();clock_after=[A31Capture]::PreciseUtcTicks().ToString();access=$q.RequestedAccess;inheritable=$q.Inheritable}}finally{$q.Dispose()}
 }elseif($Mode -ceq 'Observer'){
  $revision=Invoke-Central 'admission-revision' @();$revisionFile=Join-Path $dir 'observer-revision.json';$bytes=[Convert]::FromBase64String($revision.bytes);$f=[IO.File]::Open($revisionFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$f.Write($bytes,0,$bytes.Length)}finally{$f.Dispose()};if((Hash $revisionFile) -cne $digests.admission_revision_sha256 -or $revision.sha256 -cne $digests.admission_revision_sha256){throw 'INTEGRITY_ADMISSION_REVISION'}
  $text=& (Join-Path $toolRoot 'launch-manifest-observer.ps1') -Mode Admit -Root $binding.deployment.observer_root -BuildScopeSha256 $binding.components.observer.build_scope.sha256 -MasterSha256 $PinSha256 -RevisionSha256 $digests.admission_revision_sha256 -Label $run -CmdCount 1 -PowerShellCount 1 -AdmissionOperation 'observer-admit' -AdmissionContextFile $contextFile -AdmissionContextSha256 $contextSha
  $admit=$text|ConvertFrom-Json
  foreach($native in $admit.native_images){if((Manifest-ParentKind $native.image $admit.observer_final.c_device_mapping) -cne $native.kind){throw 'INTEGRITY_CONSUMER_NATIVE_CLASSIFICATION'}}
  # Rejection samples are constructed comparisons, not additional device observations.
  if((Manifest-ParentKind 'C:\Windows\System32\cmd.exe' $admit.observer_final.c_device_mapping) -or (Manifest-ParentKind ($admit.observer_final.c_device_mapping+'2\Windows\System32\cmd.exe') $admit.observer_final.c_device_mapping)){throw 'INTEGRITY_NATIVE_CLASSIFICATION_REJECTION'}
  $details=[ordered]@{admission=$admit}
 }elseif($Mode -ceq 'CanaryCreate'){
  $canary=Join-Path $dir 'canary';Fresh-Directory $canary
  foreach($name in @('admin-a.json','admin-b.json')){$null=Save (Join-Path $canary $name) ([ordered]@{schema_version=1;binding_sha256=$PinSha256;canary_run_id=$run;owner='Administrator';value=('A9-'+$run)})}
  # The runtime CMD is fixed by this source and contains only the current immutable binding/run.
  $ps=Join-Path $toolRoot 'forensic-admission.ps1';$cmd='@echo off'+"`r`n"+'"C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "'+$ps+'" -Mode Ordinary -Root "'+$Root+'" -PinSha256 '+$PinSha256+' -CanaryRunId '+$run+"`r`n"+'pause'+"`r`n"
  $f=Join-Path $dir 'run-ordinary-forensic-admission.cmd';$stream=[IO.File]::Open($f,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$bytes=[Text.Encoding]::ASCII.GetBytes($cmd);$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}
  $null=Save (Join-Path $dir 'canary-prepared.json') ([ordered]@{status='CANARY_PREPARED_NOT_ADMISSION';run_id=$run;binding_sha256=$PinSha256;context_sha256=$contextSha;command_sha256=Hash $f;ordinary_command=$f})
  [ordered]@{status='CANARY_PREPARED_NOT_ADMISSION';run_id=$run;ordinary_command=$f;command_sha256=Hash $f}|ConvertTo-Json -Compress;return
 }else{
  if(-not $CanaryRunId){throw 'SCOPE_CANARY_RUN_REQUIRED'}
  $canary=Join-Path $runs ($CanaryRunId+'\canary');Plain $canary
  foreach($name in @('admin-a.json','admin-b.json')){Read-Canary (Join-Path $canary $name) $CanaryRunId 'Administrator'}
  if($Mode -ceq 'Ordinary'){
   foreach($name in @('ordinary-a.json','ordinary-b.json')){$null=Save (Join-Path $canary $name) ([ordered]@{schema_version=1;binding_sha256=$PinSha256;canary_run_id=$CanaryRunId;owner='a9builder';value=('A9-'+$CanaryRunId)})}
   $fixture="`$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=New-Object Text.UTF8Encoding(`$false);[IO.File]::WriteAllText('"+$dir+"\child-ready.txt','ready',(New-Object Text.UTF8Encoding(`$false)));`$until=[DateTime]::UtcNow.AddSeconds(8);while(-not [IO.File]::Exists('"+$dir+"\child-release.txt')){if([DateTime]::UtcNow -ge `$until){exit 9};Start-Sleep -Milliseconds 10};[Console]::Write('A9-FORENSIC-OWNED-CHILD')"
   $pi=New-Object Diagnostics.ProcessStartInfo;$pi.FileName='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe';$pi.Arguments='-NoProfile -NonInteractive -EncodedCommand '+[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($fixture));$pi.UseShellExecute=$false;$pi.CreateNoWindow=$true;$pi.RedirectStandardOutput=$true;$pi.RedirectStandardError=$true;$pi.StandardOutputEncoding=[Text.Encoding]::UTF8;$pi.StandardErrorEncoding=[Text.Encoding]::UTF8
   $budget=[Diagnostics.Stopwatch]::StartNew();$owned=[Diagnostics.Process]::Start($pi);$null=$owned.Handle;$lifecycle.pid=$owned.Id;$lifecycle.creation_ticks=$owned.StartTime.ToUniversalTime().Ticks.ToString();$lifecycle.session=$owned.SessionId;$lifecycle.status='RUNNING';$o=$owned.StandardOutput.ReadToEndAsync();$e=$owned.StandardError.ReadToEndAsync();$held=New-Pinned $owned $self.Id;$lifecycle.image=$held.capture.Process.ImagePath;$tree=@{};$capture=$null
   try{
    $tree[[string]$self.Id]=New-Pinned $self 0
    while(-not(Test-Path -LiteralPath (Join-Path $dir 'child-ready.txt'))){if($owned.HasExited -or $budget.ElapsedMilliseconds -ge 8000){throw 'LIFECYCLE_OWN_CHILD_READY_UNKNOWN'};Start-Sleep -Milliseconds 10}
    $capture=[A31Capture]::Capture(@($tree.Values|ForEach-Object{$_.capture}));Save-CaptureDiagnostic $capture $context $lifecycle (Join-Path $dir 'capture-before-assert.json')
    $captureSet=Get-OrdinaryCaptureSet $capture $context $lifecycle;$details=[ordered]@{child=$null;capture_set=$captureSet}
    foreach($row in $captureSet.instances){
     $h=@($capture.Added|Where-Object{$_.Pid -eq $row.pid})[0]
     if($row.kind -ceq 'powershell'){[A31Capture]::AssertSameInstance($held.capture.Process,$h.Process,$row.pid,[long]$row.creation_ticks,$row.session,$row.image)}else{
      $check=[A31Capture]::OpenQuery($row.pid);try{[A31Capture]::AssertSameInstance($h.Process,$check,$row.pid,[long]$row.creation_ticks,$row.session,$row.image)}finally{$check.Dispose()}
     };$row.same_instance=$true
    }
    if($budget.ElapsedMilliseconds -ge 8000){throw 'LIFECYCLE_OWN_CHILD_EXIT_UNKNOWN'}
    $null=Save (Join-Path $dir 'child-release.txt') ([ordered]@{run_id=$run;child_pid=$owned.Id;creation_ticks=$held.creation_ticks.ToString()})
    foreach($row in $captureSet.instances){
     $h=@($capture.Added|Where-Object{$_.Pid -eq $row.pid})[0]
     if(-not $h.Process.WaitForExit([Math]::Max(0,8000-[int]$budget.ElapsedMilliseconds))){throw 'LIFECYCLE_CAPTURE_SET_EXIT_UNKNOWN'}
     $row.exit_code=$h.Process.ReadExitCode();$row.exit_ticks=$h.Process.ReadExitTime().ToUniversalTime().Ticks.ToString();$row.held_query_after_exit=$true
     if($row.exit_code -ne 0 -or [long]$row.exit_ticks -lt [long]$row.proof.query_ticks){throw 'LIFECYCLE_CAPTURE_SET_EXIT_INVALID'}
    }
    if(-not $owned.WaitForExit(0) -or -not $o.Wait([Math]::Max(0,[Math]::Min(1000,8000-[int]$budget.ElapsedMilliseconds))) -or -not $e.Wait([Math]::Max(0,[Math]::Min(1000,8000-[int]$budget.ElapsedMilliseconds))) -or $budget.ElapsedMilliseconds -ge 8000){throw 'LIFECYCLE_OWN_CHILD_EXIT_UNKNOWN'}
    Save-ChildStreamDiagnostic $context $lifecycle $o $e (Join-Path $dir 'child-stream-before-assert.json')
    if($budget.ElapsedMilliseconds -ge 8000){throw 'LIFECYCLE_OWN_CHILD_EXIT_UNKNOWN'}
    if($o.Result.Length -gt 4096 -or $e.Result.Length -gt 4096){throw 'OUTPUT_LIMIT'};if($e.Result.Length){throw 'OWN_CHILD_STDERR'}
    $rootRow=@($captureSet.instances|Where-Object{$_.kind -ceq 'powershell'})[0]
    $child=[ordered]@{pid=$owned.Id;creation_ticks=$held.creation_ticks.ToString();session=$held.session;image=$held.capture.Process.ImagePath;exit_code=$rootRow.exit_code;exit_ticks=$rootRow.exit_ticks;same_instance=$true;capture_added=$capture.Added.Count;capture_gaps=$capture.Gaps.Count;capture_exclusions=$capture.Excluded.Count;output=$o.Result;held_query_after_exit=$true}
   }finally{
    # Close every captured handle, including rejected/unclassified rows, without hiding the first error.
    $queries=@();if($capture){foreach($h in $capture.Added){$queries+=@($h.Process)}};foreach($v in $tree.Values){$queries+=@($v.capture.Process)};$closed=@()
    foreach($q in $queries){if(-not @($closed|Where-Object{[Object]::ReferenceEquals($_,$q)}).Count){try{$q.Dispose()}catch{$closeErrors+=@($_.Exception.Message)};$closed+=@($q)}}
    if($closeErrors.Count -and -not $failure){$closeErrors+=@('LIFECYCLE_QUERY_CLOSE_FAILED')}
   }
   $directions=@('admin-write-user-read','user-read-admin-write');$details=[ordered]@{child=$child;capture_set=$captureSet;canary=[ordered]@{canary_run_id=$CanaryRunId;binding_sha256=$PinSha256;files=Canary-Files $canary;directions=@($directions|ForEach-Object{[ordered]@{direction=$_;status='PASS'}})}}
  }else{
   $ordinaryReceipt=Read-Json (Join-Path $canary 'ordinary-result-reference.json');Exact-Keys $ordinaryReceipt @('run_id','context_sha256','result_sha256');if($ordinaryReceipt.run_id -cnotmatch '^[a-f0-9]{32}$' -or $ordinaryReceipt.context_sha256 -cnotmatch '^[a-f0-9]{64}$' -or $ordinaryReceipt.result_sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'INTEGRITY_ORDINARY_REFERENCE'}
   $ordinaryDir=Join-Path $runs $ordinaryReceipt.run_id;$ordinaryFile=Join-Path $ordinaryDir 'capability-result.json';$ordinaryResult=Invoke-Central 'verify-capability' @((Join-Path $ordinaryDir 'current-context.json'),$ordinaryReceipt.context_sha256,$ordinaryFile,$ordinaryReceipt.result_sha256)
   if($ordinaryResult.operation -cne 'ordinary-probe' -or $ordinaryResult.role -cne 'ORDINARY_FORENSIC_ADMISSION' -or $ordinaryResult.details.canary.canary_run_id -cne $CanaryRunId -or $ordinaryResult.binding_sha256 -cne $PinSha256){throw 'INTEGRITY_ORDINARY_CANARY_REFERENCE'}
   foreach($name in @('ordinary-a.json','ordinary-b.json')){Read-Canary (Join-Path $canary $name) $CanaryRunId 'a9builder'}
   $directions=@('admin-write-user-read','user-write-admin-read','admin-read-user-write','user-read-admin-write');$details=[ordered]@{canary=[ordered]@{canary_run_id=$CanaryRunId;binding_sha256=$PinSha256;files=Canary-Files $canary;ordinary_receipt=$ordinaryReceipt;directions=@($directions|ForEach-Object{[ordered]@{direction=$_;status='PASS'}})}}
  }
 }
}catch{$failure=$_.Exception.Message}
finally{
 if($owned){try{if($owned.HasExited){$lifecycle.status='ENDED';$lifecycle.exit_code=$owned.ExitCode;$lifecycle.exit_ticks=$owned.ExitTime.ToUniversalTime().Ticks.ToString()}else{$lifecycle.status='UNKNOWN'}}catch{$lifecycle.status='UNKNOWN';$closeErrors+=@($_.Exception.Message)}}
 if($held){try{$held.capture.Process.Dispose()}catch{$closeErrors+=@($_.Exception.Message)}}
 if($owned){try{$owned.Dispose()}catch{$closeErrors+=@($_.Exception.Message)}}
 if($closeErrors.Count -and -not $failure){$failure='LIFECYCLE_QUERY_CLOSE_FAILED'}
}
if($failure){$details=[ordered]@{partial_details=$details;owned_lifecycle=$lifecycle;capture_issues=@($script:CaptureIssues);close_errors=$closeErrors}}
$result=[ordered]@{schema_version=1;status=if($failure){'FAIL'}else{'PASS'};evidence_scope='WIN10_DIRECT';binding_sha256=$PinSha256;execution_scope_sha256=$context.execution_scope_sha256;tool_digest=$context.tool_digest;component_digest=$context.component_digest;source=$context.source;run_id=$run;role=$role;operation=$operation;parent=$parent;started_at=$started.ToString('o');finished_at=[DateTime]::UtcNow.ToString('o');details=$details;error=$failure}
$resultFile=Join-Path $dir 'capability-result.json';$resultSha=Save $resultFile $result
if(-not $failure){try{$null=Invoke-Central 'verify-capability' @($contextFile,$contextSha,$resultFile,$resultSha)}catch{$failure=$_.Exception.Message;$null=Save (Join-Path $dir 'verification-first-failure.json') ([ordered]@{status='FAIL';error=$failure;result_sha256=$resultSha})}}
if(-not $failure -and $Mode -ceq 'Ordinary'){$null=Save (Join-Path $canary 'ordinary-result-reference.json') ([ordered]@{run_id=$run;context_sha256=$contextSha;result_sha256=$resultSha})}
[ordered]@{status=if($failure){'FORENSIC_CAPABILITY_FAILED'}else{'FORENSIC_CAPABILITY_PASS_NOT_PRODUCT_ADMISSION'};run_id=$run;context_sha256=$contextSha;result_sha256=$resultSha;error=$failure;product='NOT_PERFORMED';win7='NOT_PERFORMED'}|ConvertTo-Json -Compress
if($failure){exit 1}

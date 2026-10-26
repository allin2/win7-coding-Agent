param([Parameter(Mandatory=$true)][ValidateSet('Build','Run','Stop','Admit')][string]$Mode,[Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$BuildScopeSha256,[ValidatePattern('^[a-f0-9]{32}$')][string]$RequestId,[int]$DispatcherPid=0,[ValidatePattern('^[0-9]{1,20}$')][string]$DispatcherCreation,[int]$DispatcherSession=-1,[ValidatePattern('^[a-f0-9]{64}$')][string]$MasterSha256,[ValidatePattern('^[a-f0-9]{64}$')][string]$RevisionSha256,[ValidatePattern('^[a-z0-9-]{1,40}$')][string]$Label,[int]$CmdCount=0,[int]$PowerShellCount=0,[string]$AdmissionContextFile,[ValidatePattern('^[a-f0-9]{64}$')][string]$AdmissionContextSha256,[ValidateSet('capture-self-query','observer-admit','canary-admin','ordinary-probe')][string]$AdmissionOperation)
# Apache-2.0. A9-31 R5 Win10 test launcher for the passive manifest observer. Administrator, Session 0, never loaded by the product.
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$R5=Split-Path -Parent (Split-Path -Parent (Split-Path -Parent $Root))

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
$engineering=Read-EngineeringBinding $R5 $MasterSha256
$script:AdmissionFamily=$engineering.tool_identity.version -cin @('engineering-02-v5-admission','engineering-02-v6-product');$script:ForensicFamily=$engineering.tool_identity.version -cin @('engineering-02-v3','engineering-02-v4','engineering-02-v5-admission','engineering-02-v6-product');$script:ProductContract=$engineering.tool_identity.version -ceq 'engineering-02-v6-product'
if($script:AdmissionFamily -and ($engineering.tool_identity.version -ceq 'engineering-02-v5-admission' -or $Mode -ceq 'Admit')){
 if($Mode -cne 'Admit' -or $AdmissionOperation -cne 'observer-admit' -or -not $AdmissionContextFile -or -not $AdmissionContextSha256){throw 'SCOPE_ADMISSION_OBSERVER_MODE'}
 $null=Invoke-EngineeringJson 'authorize-admission' @('ADMIN_FORENSIC_ADMISSION','observer-admit',$AdmissionContextFile,$AdmissionContextSha256)
 $ctx=Get-Content -LiteralPath $AdmissionContextFile -Raw -Encoding UTF8|ConvertFrom-Json;$self=[Diagnostics.Process]::GetCurrentProcess()
 if($ctx.parent.pid -ne $self.Id -or $ctx.parent.creation_ticks -cne $self.StartTime.ToUniversalTime().Ticks.ToString() -or $ctx.parent.session -ne 0 -or $ctx.identity.Sid -cne [Security.Principal.WindowsIdentity]::GetCurrent().User.Value){throw 'IDENTITY_ADMISSION_OBSERVER_INSTANCE'}
}else{Assert-EngineeringExecution 'ADMIN_TOOL_ADMISSION'}
function Save([string]$path,$o){$s=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$b=(New-Object Text.UTF8Encoding($false)).GetBytes(($o|ConvertTo-Json -Depth 12));$s.Write($b,0,$b.Length);$s.Flush()}finally{$s.Dispose()}}
function Hash([string]$f){(Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLowerInvariant()}
function FileTime($p){[string]$p.StartTime.ToUniversalTime().ToFileTimeUtc()}
if($Root -cne $engineering.deployment.observer_root){throw 'SCOPE_ROOT'}
if($BuildScopeSha256 -cne $engineering.components.observer.build_scope.sha256){throw 'INTEGRITY_BUILD_SCOPE'}
if($Mode -ceq 'Build'){throw 'SCOPE_LOCKED_COMPONENT_NOT_REBUILT'}
$null=Invoke-EngineeringJson 'assert-components' @()
if($script:AdmissionFamily){$a=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $R5 'inputs\capture-library.dll')));if($a.ManifestModule.ModuleVersionId.ToString() -cne $engineering.components.capture.artifact.mvid -or ('A31Capture' -as [type]).Module.ModuleVersionId.ToString() -cne $engineering.components.capture.artifact.mvid){throw 'INTEGRITY_ADMISSION_QUERY_TYPE'}}
$source=Join-Path $Root 'manifest-process-observer.cs';$dll=Join-Path $Root 'manifest-process-observer.exe'
$build=Get-Content -LiteralPath (Join-Path $Root 'observer-build.json') -Raw -Encoding UTF8|ConvertFrom-Json
$assembly=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($dll));$expectedMvid=if($script:ForensicFamily){$build.artifact.mvid}else{$build.mvid};$expectedCases=if($script:ForensicFamily){43}else{38};if([string]$assembly.ManifestModule.ModuleVersionId -cne $expectedMvid -or [A31ManifestObserver]::SelfTest() -ne $expectedCases){throw 'INTEGRITY_MVID_OR_SELF_TEST'}

function Start-Observer([string]$rid,[int]$dpid,[string]$dcreation,[int]$dsession,[string]$dir,[string]$master,[string]$revision){
 $pi=New-Object Diagnostics.ProcessStartInfo;$pi.FileName=$dll;$pi.Arguments='run '+$rid+' '+$dpid+' '+$dcreation+' "'+$dir+'" '+$master+' '+$revision+' '+$dsession
 $pi.UseShellExecute=$false;$pi.RedirectStandardOutput=$true;$pi.RedirectStandardError=$true;$pi.CreateNoWindow=$true
 $c=[Diagnostics.Process]::Start($pi);$null=$c.Handle
 return @{process=$c;creation=(FileTime $c);out=$c.StandardOutput.ReadToEndAsync();err=$c.StandardError.ReadToEndAsync()}
}
function Write-Stop([string]$rid,[string]$dir,[string]$master,[string]$revision){
 $ready=Get-Content -LiteralPath (Join-Path $dir 'observer-ready.json') -Raw -Encoding UTF8|ConvertFrom-Json
 if($ready.status -cne 'OBSERVER_READY' -or $ready.request_id -cne $rid -or $ready.master_sha256 -cne $master -or $ready.revision_sha256 -cne $revision){throw 'STOP_READY_BINDING'}
 $p=[Diagnostics.Process]::GetProcessById([int]$ready.observer_pid);try{if((FileTime $p) -cne [string]$ready.observer_creation_filetime){throw 'STOP_OBSERVER_INSTANCE'}}finally{$p.Dispose()}
 $text=[A31ManifestObserver]::StopText($rid,[int]$ready.observer_pid,[string]$ready.observer_creation_filetime,$master,$revision)
 $f=Join-Path $dir ('stop-'+$rid+'.json');$s=[IO.File]::Open($f,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
 try{$b=(New-Object Text.UTF8Encoding($false)).GetBytes($text);$s.Write($b,0,$b.Length);$s.Flush()}finally{$s.Dispose()}
 return $f
}

if($Mode -ceq 'Stop'){
 if(-not $RequestId -or -not $MasterSha256 -or -not $RevisionSha256){throw 'ARGUMENTS'}
 $dir=Join-Path $R5 ('observers\'+$RequestId);$f=Write-Stop $RequestId $dir $MasterSha256 $RevisionSha256
 @{status='STOP_SIGNAL_WRITTEN';request_id=$RequestId;stop_file=$f;stop_sha256=(Hash $f)}|ConvertTo-Json -Compress;exit 0
}

if($Mode -ceq 'Run'){if($DispatcherSession -lt 1){throw 'IDENTITY_CURRENT_DISPATCHER_SESSION_REQUIRED'}
 if(-not $RequestId -or $DispatcherPid -le 0 -or -not $DispatcherCreation -or -not $MasterSha256 -or -not $RevisionSha256){throw 'ARGUMENTS'}
 $obs=Join-Path $R5 'observers';$null=[IO.Directory]::CreateDirectory($obs);$dir=Join-Path $obs $RequestId
 if(Test-Path -LiteralPath $dir){throw 'INTEGRITY_FRESH_OBSERVER_DIR'};$null=[IO.Directory]::CreateDirectory($dir)
 for($d=Get-Item -LiteralPath $dir -Force;$d;$d=$d.Parent){if($d.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'INTEGRITY_REPARSE'}}
 $h=Start-Observer $RequestId $DispatcherPid $DispatcherCreation $DispatcherSession $dir $MasterSha256 $RevisionSha256;$child=$h.process
 try{
  $finished=$child.WaitForExit(785000)
  if(-not $finished){$code=[A31ManifestObserver]::StopNamedSession($RequestId);Save (Join-Path $dir 'observer-launch-result.json') @{status='LAUNCH_TIMEOUT_OWN_SESSION_STOP_ATTEMPTED_ONLY';pid=$child.Id;creation_filetime=$h.creation;stop_code=$code};exit 3}
  if(-not $h.out.Wait(2000) -or -not $h.err.Wait(2000)){throw 'OBSERVER_OUTPUT_DRAIN'}
  $res=@{status='OBSERVER_LAUNCH_RETURNED';pid=$child.Id;creation_filetime=$h.creation;exit_code=$child.ExitCode;stdout=if($h.out.Result.Length -le 1048576){$h.out.Result}else{'OUTPUT_LIMIT'};stderr=if($h.err.Result.Length -le 16384){$h.err.Result}else{'ERROR_LIMIT'};build_scope_sha256=$BuildScopeSha256;exe_sha256=$build.dll_sha256;mvid=$build.mvid}
  Save (Join-Path $dir 'observer-launch-result.json') $res
  $h.out.Result.TrimEnd()
  exit $child.ExitCode
 }finally{$child.Dispose()}
}

if($Mode -ceq 'Admit'){
 # Admission only: this launcher is the observed dispatcher and starts fixed roots. The observer itself never launches anything.
 if(-not $Label -or $CmdCount -ne 1 -or $PowerShellCount -ne 1){throw 'ADMISSION_BUDGET'}
 $rid=[Guid]::NewGuid().ToString('N');$dir=Join-Path $Root ('admit-'+$Label);if(Test-Path -LiteralPath $dir){throw 'INTEGRITY_FRESH_ADMISSION'};$null=[IO.Directory]::CreateDirectory($dir)
 $master=$MasterSha256;$revision=$RevisionSha256;if($revision -cnotmatch '^[a-f0-9]{64}$'){throw 'INTEGRITY_CURRENT_ADMISSION_REVISION'};$revisionPath=if($script:AdmissionFamily){Join-Path (Split-Path -Parent $AdmissionContextFile) 'observer-revision.json'}else{Join-Path $R5 ('inputs\revision-'+$revision+'.json')};$null=Invoke-EngineeringJson 'unwrap-revision' @($revisionPath,$revision)
 if([A31ManifestObserver]::QueryOwnSession($rid) -ne 4201){throw 'SESSION_NOT_FRESH'}
 $self=[Diagnostics.Process]::GetCurrentProcess();$clock=[Diagnostics.Stopwatch]::StartNew()
 if($script:AdmissionFamily){Save (Join-Path $dir 'admission-session-intent.json') ([ordered]@{request_id=$rid;session_name=('A9-A31-R5-Manifest-'+$rid);master_sha256=$master;revision_sha256=$revision;dispatcher_pid=$self.Id;dispatcher_creation_ticks=$self.StartTime.ToUniversalTime().Ticks.ToString();operation='observer-admit';status='SESSION_INTENT_NOT_STARTED'})}
 $h=Start-Observer $rid $self.Id (FileTime $self) 0 $dir $master $revision;$obs=$h.process;
 $roots=@();$nativeImages=@();$failure=$null;$final=$null;$stopRecovery=$null;$ownAbsent=$false
 try{
 if($script:AdmissionFamily){Save (Join-Path $dir 'observer-instance.json') ([ordered]@{request_id=$rid;session_name=('A9-A31-R5-Manifest-'+$rid);pid=$obs.Id;creation_filetime=$h.creation;exe_sha256=$build.artifact.sha256;mvid=$expectedMvid;status='STARTED_NOT_CLOSED'})}
  $ready=Join-Path $dir 'observer-ready.json';$until=[DateTime]::UtcNow.AddSeconds(15);while(-not(Test-Path -LiteralPath $ready)){if($obs.HasExited -or [DateTime]::UtcNow -gt $until){throw 'ADMISSION_OBSERVER_NOT_READY'};Start-Sleep -Milliseconds 50}
  $plan=@();for($i=0;$i -lt $CmdCount;$i++){$plan+=,@('cmd','C:\Windows\System32\cmd.exe','/d /c ver')};for($i=0;$i -lt $PowerShellCount;$i++){$plan+=,@('powershell','C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe','-NoProfile -NonInteractive -Command exit 0')}
  foreach($p in $plan){
   if($clock.ElapsedMilliseconds -gt 45000){throw 'ADMISSION_TOTAL_BUDGET'}
   $pi=New-Object Diagnostics.ProcessStartInfo;$pi.FileName=$p[1];$pi.Arguments=$p[2];$pi.UseShellExecute=$false;$pi.RedirectStandardOutput=$true;$pi.RedirectStandardError=$true;$pi.CreateNoWindow=$true
   $c=[Diagnostics.Process]::Start($pi);$null=$c.Handle;$so=$c.StandardOutput.ReadToEndAsync();$se=$c.StandardError.ReadToEndAsync()
   $row=@{kind=$p[0];pid=$c.Id;parent=$self.Id;session=$c.SessionId;create_ticks=$c.StartTime.ToUniversalTime().Ticks;create_filetime=(FileTime $c)}
   $q=$null;$rootFailure=$null
   try{
   if($script:AdmissionFamily){Save (Join-Path $dir ('root-dispatch-'+$row.kind+'.json')) ([ordered]@{request_id=$rid;master_sha256=$master;kind=$row.kind;pid=$row.pid;creation_ticks=$row.create_ticks.ToString();session=$row.session;image=$pi.FileName;arguments=$pi.Arguments;status='STARTED_NOT_CLOSED'})}
    if($script:AdmissionFamily){$q=[A31Capture]::OpenQuery($c.Id);if($q.StartTime.ToUniversalTime().Ticks -ne $c.StartTime.ToUniversalTime().Ticks -or $q.SessionId -ne 0){throw 'LIFECYCLE_ADMISSION_ROOT_INSTANCE'}}
    if(-not $c.WaitForExit(8000) -or -not $so.Wait(1000) -or -not $se.Wait(1000)){throw 'ADMISSION_ROOT_LIFECYCLE'}
    if($so.Result.Length -gt 4096 -or $se.Result.Length -gt 4096){throw 'ADMISSION_ROOT_OUTPUT_LIMIT'}
    $row.exit_code=$c.ExitCode;$row.exit_ticks=$c.ExitTime.ToUniversalTime().Ticks;$row.stderr_bytes=$se.Result.Length
    if($script:AdmissionFamily){
     $readyValue=Get-Content -LiteralPath $ready -Raw -Encoding UTF8|ConvertFrom-Json;$mapping=[string]$readyValue.c_device_mapping
     if(-not $q.HasExitedStrict() -or $q.ReadExitCode() -ne $c.ExitCode -or $q.ReadExitTime().Ticks -ne $row.exit_ticks){throw 'LIFECYCLE_ADMISSION_ROOT_HELD_EXIT'}
     $nativeImages+=@([ordered]@{kind=$p[0];pid=$c.Id;creation_ticks=$q.StartTime.Ticks.ToString();session=$q.SessionId;image=$q.ImagePath;normalized=[A31ManifestObserver]::NormalizeImage($q.ImagePath,$mapping);held_query_after_exit=$true})
     $row.create_ticks=$row.create_ticks.ToString();$row.exit_ticks=$row.exit_ticks.ToString()
    }
   }catch{$rootFailure=$_.Exception.Message}
   finally{
    if($rootFailure){$row.error=$rootFailure;$row.exit_code='UNKNOWN';$row.exit_ticks='UNKNOWN';try{if($c.HasExited){$row.exit_code=$c.ExitCode;$row.exit_ticks=$c.ExitTime.ToUniversalTime().Ticks.ToString()}}catch{$row.close_error=$_.Exception.Message}}
    if($q){try{$q.Dispose()}catch{$row.close_error=$_.Exception.Message;$rootFailure='LIFECYCLE_QUERY_CLOSE_FAILED'}};$c.Dispose();$roots+=,$row
   }
   if($rootFailure){throw $rootFailure}
  }
  Start-Sleep -Milliseconds 1800
  $null=Write-Stop $rid $dir $master $revision
  if(-not $obs.WaitForExit(30000)){throw 'ADMISSION_OBSERVER_STOP_TIMEOUT'}
  if(-not $h.out.Wait(2000) -or -not $h.err.Wait(2000)){throw 'ADMISSION_OBSERVER_OUTPUT'}
  $final=$h.out.Result|ConvertFrom-Json
 }catch{$failure=$_.Exception.Message;try{$stopCode=[A31ManifestObserver]::StopNamedSession($rid);$stopRecovery=@{attempted=$true;request_id=$rid;code=$stopCode;query_code=[A31ManifestObserver]::QueryOwnSession($rid);error=$null}}catch{$stopRecovery=@{attempted=$true;request_id=$rid;code='UNKNOWN';query_code='UNKNOWN';error=$_.Exception.Message}}}
 finally{$exit=if($obs.HasExited){$obs.ExitCode}else{'RUNNING'};$obs.Dispose()}
 $proofs=@();$unexpected=@();$ok=($null -eq $failure)
 if($ok){
  try{
   $events=Join-Path $dir 'observer-events.jsonl';if($script:ForensicFamily){$null=Invoke-EngineeringJson 'validate-generations' @($events,[string]$self.Id,(FileTime $self))};$halted=Join-Path $dir 'observer-halted.json'
   if($exit -ne 0 -or $final.status -cne 'OBSERVER_FINAL_CLOSED' -or $final.events_lost -ne 0 -or $final.log_buffers_lost -ne 0 -or $final.realtime_buffers_lost -ne 0){throw 'ADMISSION_OBSERVER_NOT_CLOSED'}
   if([A31ManifestObserver]::QueryOwnSession($rid) -ne 4201){throw 'ADMISSION_SESSION_NOT_ABSENT'};$ownAbsent=$true
   $recs=@([A31ManifestObserver]::Parse([IO.File]::ReadAllText($events,(New-Object Text.UTF8Encoding($false)))))
   foreach($r in $roots){
    if($r.exit_code -ne 0 -or $r.stderr_bytes -ne 0){throw ('ADMISSION_ROOT_RESULT:'+$r.pid)}
    $kids=@($recs|Where-Object{$_.id -eq 1 -and $_.parent -eq $r.pid -and [long]$_.create_ft -ge [long]$r.create_filetime -and [long]$_.create_ft -le ($r.exit_ticks-504911232000000000L)});$cons=@($kids|Where-Object{$_.image -ceq 'c:/windows/system32/conhost.exe'})
    if($cons.Count -ne 1){throw ('ADMISSION_CONHOST_COUNT:'+$r.pid+':'+$cons.Count)}
    foreach($k in $kids){if($k.image -cne 'c:/windows/system32/conhost.exe'){$unexpected+=@(@{root_pid=$r.pid;pid=$k.pid;image=$k.image})}}
    $json=[A31ManifestObserver]::ValidateConhostProof($events,$halted,[int]$cons[0].pid,[int]$r.pid,[long]$r.create_ticks,[string]$r.kind,0,0,[long]$r.create_ticks,[long]$r.exit_ticks)
    if(-not $json){throw ('ADMISSION_PROOF_PENDING:'+$r.pid)}
    $proofs+=,($json|ConvertFrom-Json)
    $rootStart=@($recs|Where-Object{$_.id -eq 1 -and $_.pid -eq $r.pid -and $_.create_ft -ceq $r.create_filetime});if($rootStart.Count -ne 1 -or $rootStart[0].create_ft -cne $r.create_filetime){throw ('ADMISSION_ROOT_CREATE_FILETIME:'+$r.pid)}
   }
  }catch{$failure=$_.Exception.Message;$ok=$false}
 }
 $result=@{schema_version=1;status=if($ok){'OBSERVER_ADMISSION_PASS_NOT_PRODUCT_ACCEPTANCE'}else{'OBSERVER_ADMISSION_FAILED'};label=$Label;request_id=$rid;error=$failure;cmd_count=$CmdCount;powershell_count=$PowerShellCount;own_session_absent=$ownAbsent;stop_recovery=$stopRecovery;elapsed_ms=$clock.ElapsedMilliseconds;observer_exit=$exit;observer_final=$final;roots=$roots;native_images=$nativeImages;proofs=$proofs;unexpected_descendants=$unexpected;build_scope_sha256=$BuildScopeSha256;exe_sha256=if($script:ForensicFamily){$build.artifact.sha256}else{$build.dll_sha256};mvid=$expectedMvid;scope='Administrator isolated admission, not ordinary product evidence'}
 Save (Join-Path $dir 'admission-result.json') $result;$result|ConvertTo-Json -Depth 12 -Compress
 if($script:AdmissionFamily){if(-not $ok){throw ('ADMISSION_FAILED:'+$failure)};return}
 if(-not $ok){exit 1};exit 0
}

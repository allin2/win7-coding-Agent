param([Parameter(Mandatory=$true)][ValidateSet('Library','Preflight','Bootstrap','Supervise','Collect','Disable')][string]$Mode,[Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestSha256)
# Apache-2.0. ENGINEERING_02 / ADR-0206 / ADR-0207 / ADR-0208 / ADR-0209 / ADR-0211. Fixed Win10 ordinary-entry bridge; it adds no authority and never admits a product.
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$bridgeMode=$Mode
$script:BridgeReviewSha='5e7b954e4fff80db65c8be20f4ae13587174ab0a136320145e488559504c7874'
$script:LibrarySha='a43ad2fba30efd8bea48ddf9c93ab6c083012cc94926a11cdb069004b1ccc388'
$script:BridgePrefix='C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-Engineering02-OrdinaryBridge-20261008-'
$script:AdmissionRoot='C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-Engineering-Win10-Entry-20261007-R4'
$script:PowerShellExe='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
# The helper library is the frozen start-desktop-entry-probe.ps1 byte-for-byte; its hash is pinned before it is loaded.
$library=Join-Path $PSScriptRoot 'desktop-entry-lib.ps1'
if((Get-FileHash -LiteralPath $library -Algorithm SHA256).Hash.ToLowerInvariant() -cne $script:LibrarySha){throw 'INTEGRITY_LIBRARY_HASH'}
. $library -Mode Library -Root $Root -ManifestSha256 $ManifestSha256
function Cmd-Text([string]$ps,[string]$arguments){return '@echo off'+"`r`n"+'"'+$script:PowerShellExe+'" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "'+$ps+'" '+$arguments+"`r`n"+'pause'+"`r`n"}
function Launch-Arguments([string]$cmdPath){if(-not $cmdPath -or $cmdPath -cnotmatch '^[A-Za-z]:\\[^"<>|&^%\r\n]+$'){throw 'INTEGRITY_LAUNCH_PATH'};return '/d /s /c ""'+$cmdPath+'" <NUL"'}
function Same-Bytes($a,$b){if($a.Length -ne $b.Length){return $false};for($i=0;$i -lt $a.Length;$i++){if($a[$i] -ne $b[$i]){return $false}};return $true}
function Read-BridgeManifest{
 if($Root -cnotin @(($script:BridgePrefix+'B6'),($script:BridgePrefix+'B7')) -or $env:COMPUTERNAME -cne 'WIN-2JQ66JE4HTQ' -or [Environment]::OSVersion.Version.Build -ne 19045 -or -not [Environment]::Is64BitProcess -or $PSVersionTable.PSVersion.ToString() -cne '5.1.19041.6456'){throw 'SCOPE_TARGET_ROOT_RUNTIME'}
 foreach($directory in @('control','inputs','evidence','signals')){$d=Join-Path $Root $directory;if(-not(Test-Path -LiteralPath $d -PathType Container)){throw 'INTEGRITY_ENTRY_DIRECTORY'};Assert-Plain $d}
 $path=Join-Path $Root 'inputs\manifest.json';if((File-Hash $path) -cne $ManifestSha256){throw 'INTEGRITY_MANIFEST_HASH'};$m=Read-Record $path
 Exact-Keys $m @('schema_version','kind','root','version','phase','experiment_id','review_sha256','approval_sha256','source_head','task_name','explorer','system_files','files','target','central_valid_until','capture','created_at','valid_until')
 $phase='B'
 if($m.schema_version -ne 1 -or $m.kind -cne 'OWNER_APPROVED_ORDINARY_ENTRY_BRIDGE' -or $m.root -cne $Root -or $m.review_sha256 -cne $script:BridgeReviewSha -or $m.source_head -cne 'a53c9b9d861486e5923bc82ea70b31b76af1a939' -or $m.experiment_id -cnotmatch '^[a-f0-9]{32}$' -or $m.phase -cne $phase -or $m.version -cne $Root.Substring($Root.Length-2) -or $m.task_name -cne ('\A9-Engineering02-OrdinaryBridge-20261008-'+$m.version)){throw 'INTEGRITY_MANIFEST_SCOPE'}
 $now=[DateTimeOffset]::UtcNow;if($now -lt [DateTimeOffset]$m.created_at -or $now -ge [DateTimeOffset]$m.valid_until -or $now -ge [DateTimeOffset]$m.central_valid_until){throw 'SCOPE_EXPIRED'}
 $common=@('control\start-ordinary-entry-bridge.ps1','control\desktop-entry-lib.ps1','inputs\approval.json','inputs\capture-library.dll','inputs\capture-build.json','inputs\capture-build-scope.json','inputs\capture-source.cs','inputs\proof-source.ps1')
 $allowed=if($phase -ceq 'A'){$common+@('control\ordinary-entry-fixture.ps1','control\fixture-entry.cmd')}else{$common}
 if(@($m.files).Count -ne $allowed.Count -or @($m.system_files).Count -ne 4){throw 'INTEGRITY_CLOSURE_COUNT'};$seen=@{}
 foreach($row in $m.files){Exact-Keys $row @('file','size','sha256');if($row.file -cnotin $allowed -or $seen.ContainsKey($row.file) -or $row.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'INTEGRITY_CLOSURE_NAME'};$seen[$row.file]=$true;$f=Join-Path $Root $row.file;if((Get-Item -LiteralPath $f).Length -ne $row.size -or (File-Hash $f) -cne $row.sha256){throw 'INTEGRITY_FILE_HASH'};if($row.file -ceq 'control\desktop-entry-lib.ps1' -and $row.sha256 -cne $script:LibrarySha){throw 'INTEGRITY_LIBRARY_ROW'}}
 $system=@('C:\Windows\System32\shell32.dll','C:\Windows\System32\taskschd.dll','C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe','C:\Windows\System32\cmd.exe');$seen=@{}
 foreach($row in $m.system_files){if($row.path -cnotin $system -or $seen.ContainsKey($row.path)){throw 'INTEGRITY_SYSTEM_FILE_NAME'};$seen[$row.path]=$true;if((Get-Item -LiteralPath $row.path).Length -ne $row.size -or (File-Hash $row.path) -cne $row.sha256){throw 'INTEGRITY_SYSTEM_FILE_HASH'}}
 $approval=Read-Record (Join-Path $Root 'inputs\approval.json');if((File-Hash (Join-Path $Root 'inputs\approval.json')) -cne $m.approval_sha256 -or $approval.status -cne 'OWNER_APPROVED' -or $approval.review_sha256 -cne $script:BridgeReviewSha -or $approval.product_execution_authorized -or $approval.win7_execution_authorized -or $approval.automatic_retry -ne 0){throw 'SCOPE_OWNER_APPROVAL'}
 if($m.capture.sha256 -cne '9a205e4cbe80bf768d5bedf96e3a670baf593291698aab54c2b458ed8ae144b6' -or $m.capture.mvid -cne 'f87e40ae-f1bf-4eef-b2a0-30cbb6da0bc0' -or (File-Hash (Join-Path $Root 'inputs\capture-library.dll')) -cne $m.capture.sha256){throw 'INTEGRITY_NATIVE_CAPTURE'}
 $t=$m.target
 if($phase -ceq 'A'){
  Exact-Keys $t @('kind','cmd_path');$cmdPath=Join-Path $Root 'control\fixture-entry.cmd'
  if($t.kind -cne 'FIXTURE' -or $t.cmd_path -cne $cmdPath){throw 'INTEGRITY_TARGET_FIXTURE'}
  $expected=Cmd-Text (Join-Path $Root 'control\ordinary-entry-fixture.ps1') ('-Root "'+$Root+'"')
 }else{
  $kind=if($Root -ceq ($script:BridgePrefix+'B6')){'ORDINARY'}else{'DISPATCHER'};if($t.kind -cne $kind){throw 'INTEGRITY_TARGET_KIND'}
  if($kind -ceq 'DISPATCHER'){
   Exact-Keys $t @('kind','admission_root','tool_digest','pin_sha256','cmd_path','cmd_size','cmd_sha256')
   if($t.admission_root -cne $script:AdmissionRoot -or $t.tool_digest -cnotmatch '^[a-f0-9]{64}$' -or $t.pin_sha256 -cnotmatch '^[a-f0-9]{64}$' -or $t.cmd_sha256 -cnotmatch '^[a-f0-9]{64}$' -or $t.cmd_size -isnot [int]){throw 'INTEGRITY_TARGET_DISPATCHER'}
   $cmdPath=Join-Path $t.admission_root 'run-product-dispatcher-v6.cmd';if($t.cmd_path -cne $cmdPath){throw 'INTEGRITY_TARGET_PATH'}
   $bp=Join-Path $t.admission_root ('inputs\bindings\'+$t.pin_sha256+'\master-pin.json');if((File-Hash $bp) -cne $t.pin_sha256){throw 'INTEGRITY_TARGET_DISPATCHER'};$b=Read-Record $bp;$a=$b.execution_scope.remote_approval
   if($b.tool_identity.version -cne 'engineering-02-v6-product' -or $b.tool_identity.files_digest -cne $t.tool_digest -or $b.execution_scope.product_execution_authorized -ne $true -or $null -eq $a -or [DateTimeOffset]::UtcNow -lt [DateTimeOffset]$a.approved_at -or [DateTimeOffset]::UtcNow -ge [DateTimeOffset]$a.valid_until){throw 'INTEGRITY_TARGET_DISPATCHER'}
   if((File-Hash $cmdPath) -cne $t.cmd_sha256 -or (Get-Item -LiteralPath $cmdPath).Length -ne $t.cmd_size){throw 'INTEGRITY_TARGET_DISPATCHER'}
   $expected=Cmd-Text (Join-Path $t.admission_root ('control\versions\'+$t.tool_digest+'\launch-product-desktop.ps1')) ('-Root "'+$t.admission_root+'" -PinSha256 '+$t.pin_sha256)
  }else{
  Exact-Keys $t @('kind','admission_root','tool_digest','pin_sha256','run_id','cmd_path','cmd_size','cmd_sha256')
  if($t.kind -cne 'ORDINARY' -or $t.admission_root -cne $script:AdmissionRoot -or $t.tool_digest -cnotmatch '^[a-f0-9]{64}$' -or $t.pin_sha256 -cnotmatch '^[a-f0-9]{64}$' -or $t.run_id -cnotmatch '^[a-f0-9]{32}$' -or $t.cmd_sha256 -cnotmatch '^[a-f0-9]{64}$' -or $t.cmd_size -ne 578){throw 'INTEGRITY_TARGET_ORDINARY'}
  $cmdPath=Join-Path $t.admission_root ('runs\'+$t.run_id+'\run-ordinary-forensic-admission.cmd');if($t.cmd_path -cne $cmdPath){throw 'INTEGRITY_TARGET_PATH'}
  $tool=Join-Path $t.admission_root ('control\versions\'+$t.tool_digest+'\forensic-admission.ps1')
  $expected=Cmd-Text $tool ('-Mode Ordinary -Root "'+$t.admission_root+'" -PinSha256 '+$t.pin_sha256+' -CanaryRunId '+$t.run_id)
  $prepared=Read-Record (Join-Path $t.admission_root ('runs\'+$t.run_id+'\canary-prepared.json'))
  if($prepared.status -cne 'CANARY_PREPARED_NOT_ADMISSION' -or $prepared.run_id -cne $t.run_id -or $prepared.binding_sha256 -cne $t.pin_sha256 -or $prepared.ordinary_command -cne $cmdPath -or $prepared.command_sha256 -cne $t.cmd_sha256 -or (File-Hash $cmdPath) -cne $t.cmd_sha256 -or (Get-Item -LiteralPath $cmdPath).Length -ne $t.cmd_size){throw 'INTEGRITY_TARGET_PREPARED'}
  }
 }
 $null=File-Hash $cmdPath;if(-not (Same-Bytes ([IO.File]::ReadAllBytes($cmdPath)) ([Text.Encoding]::ASCII.GetBytes($expected)))){throw 'INTEGRITY_TARGET_BYTES'}
 $script:ProbeManifest=$m;$script:BridgeCmdPath=$cmdPath;return $m
}
if($bridgeMode -ceq 'Library'){return}
if($PSScriptRoot -cne (Join-Path $Root 'control')){throw 'INTEGRITY_ENTRY_PATH'}
$m=Read-BridgeManifest;Load-Capture
if($bridgeMode -cne 'Bootstrap'){Assert-Admin};if($bridgeMode -ceq 'Supervise'){Import-ProofFunctions}
Assert-Explorer
$task=$null;$service=$null;$folder=$null;$com=@();$failure=$null;$outerCloseErrors=@();$disableErrors=@();$signalErrors=@()
if($bridgeMode -ceq 'Preflight'){
 Import-ProofFunctions;foreach($name in @('Capture-DiagnosticProof','Capture-DiagnosticAdded','Capture-DiagnosticGap','Capture-DiagnosticExcluded','Get-OrdinaryCaptureSet','Get-ChildStreamDiagnostic')){if(-not(Get-Command -Name $name -CommandType Function -ErrorAction SilentlyContinue)){throw 'PREFLIGHT_FUNCTION_IMPORT'}}
 $sources=@('control\start-ordinary-entry-bridge.ps1','control\desktop-entry-lib.ps1','inputs\proof-source.ps1');if($m.phase -ceq 'A'){$sources+=@('control\ordinary-entry-fixture.ps1')}
 foreach($file in $sources){$t=$null;$e=$null;$null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $Root $file),[ref]$t,[ref]$e);if($e.Count){throw ('PARSE_SOURCE:'+ $file)}}
 $arguments=Launch-Arguments $script:BridgeCmdPath;$rejected=0
 foreach($bad in @('fixture.cmd','C:\a"b.cmd','C:\a&b.cmd',"C:\a`nb.cmd",'C:\a%b.cmd','C:\a<b.cmd','C:\a|b.cmd')){$ok=$false;try{$null=Launch-Arguments $bad}catch{$ok=$true};if(-not $ok){throw 'PREFLIGHT_LAUNCH_PATH_REJECTION'};$rejected++}
 $good=[Text.Encoding]::ASCII.GetBytes((Cmd-Text 'C:\x.ps1' '-Root "C:\r"'));$flip=$good.Clone();$flip[0]=[byte]0x41;if(Same-Bytes $good $flip){throw 'PREFLIGHT_BYTES_COMPARE'}
 $bytes=[IO.File]::ReadAllBytes($script:BridgeCmdPath)
 $null=Write-Record (Join-Path $Root 'evidence\preflight.json') ([ordered]@{status='PS51_BRIDGE_SOURCE_AND_TARGET_PREFLIGHT_PASS_NOT_ENTRY';manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;phase=$m.phase;target_kind=$m.target.kind;cmd_path=$script:BridgeCmdPath;cmd_size=$bytes.Length;cmd_sha256=File-Hash $script:BridgeCmdPath;launch_arguments=$arguments;rejected_launch_paths=$rejected;ordinary_entry='NOT_PERFORMED'});return
}
if($bridgeMode -ceq 'Bootstrap'){
 $self=[Diagnostics.Process]::GetCurrentProcess();$held=[A31Capture]::Pin($self,0);$comErrors=@();$stage='START'
 try{
  $id=[A31Capture]::Token($held.Process);Assert-Ordinary $id -Bootstrap
  $null=Write-Record (Join-Path $Root 'evidence\bootstrap-start.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;instance=Instance $held.Process;identity=$id;apartment=[string][Threading.Thread]::CurrentThread.GetApartmentState()})
  $null=Wait-File 'signals\bootstrap-permit.json' 30000;Assert-Signal 'bootstrap-permit.json'
  $stage='LAUNCH_ARGUMENTS';$arguments=Launch-Arguments $script:BridgeCmdPath
  $stage='SHELL_APPLICATION';$shell=New-Object -ComObject Shell.Application;$com+=,$shell
  $stage='SHELL_WINDOWS';$windows=$shell.Windows();$com+=,$windows
  $stage='FIND_DESKTOP';$hwnd=0;$loc=$null;$locRoot=$null;$desktop=$windows.FindWindowSW([ref]$loc,[ref]$locRoot,8,[ref]$hwnd,1);if(-not $desktop -or -not $hwnd){throw 'BOOTSTRAP_DESKTOP_NOT_FOUND'};$com+=,$desktop
  $stage='DESKTOP_DOCUMENT';$document=$desktop.Document;if(-not $document){throw 'BOOTSTRAP_DESKTOP_DOCUMENT'};$com+=,$document
  $stage='DESKTOP_APPLICATION';$app=$document.Application;if(-not $app){throw 'BOOTSTRAP_DESKTOP_APPLICATION'};$com+=,$app
  $stage='LAUNCH_RECORD';$null=Write-Record (Join-Path $Root 'evidence\launch-request.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;target_kind=$m.target.kind;cmd_path=$script:BridgeCmdPath;arguments=$arguments;requested_at=[DateTime]::UtcNow.ToString('o')})
  $stage='SHELL_EXECUTE';$app.ShellExecute('C:\Windows\System32\cmd.exe',$arguments,(Split-Path -Parent $script:BridgeCmdPath),'open',1);$stage='SHELL_REQUEST_RETURNED_NOT_ENTRY'
 }catch{$failure=$_.Exception.Message.Substring(0,[Math]::Min(1000,$_.Exception.Message.Length))}
 finally{
  $comErrors=Close-ComObjects $com
  $close=Close-Queries @($held.Process);$self.Dispose();if(($comErrors.Count -or $close.Count) -and -not $failure){$failure='LIFECYCLE_BOOTSTRAP_CLOSE'}
  $null=Write-Record (Join-Path $Root 'evidence\bootstrap-final.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;status=if($failure){'FAIL'}else{'SHELL_REQUEST_RETURNED_NOT_ENTRY'};stage=$stage;error=$failure;com_close_errors=$comErrors;query_close_errors=$close})
 };if($failure){exit 1};exit 0
}
if($bridgeMode -ceq 'Collect'){
 $files=@(Get-ChildItem -LiteralPath (Join-Path $Root 'evidence') -File)+@(Get-ChildItem -LiteralPath (Join-Path $Root 'signals') -File);if($files.Count -gt 64){throw 'OUTPUT_FILE_LIMIT'};$rows=@();$total=0
 foreach($f in $files){Assert-Plain $f.FullName;$b=[IO.File]::ReadAllBytes($f.FullName);$total+=$b.Length;if($b.Length -gt 262144 -or $total -gt 1048576){throw 'OUTPUT_LIMIT'};$rows+=@([ordered]@{file=$f.FullName.Substring($Root.Length+1);size=$b.Length;sha256=File-Hash $f.FullName;bytes=[Convert]::ToBase64String($b)})}
 [ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;files=$rows}|ConvertTo-Json -Depth 6 -Compress;return
}
try{
 $service=New-Object -ComObject Schedule.Service;$com+=,$service;$service.Connect();$folder=$service.GetFolder('\');$com+=,$folder
 if($bridgeMode -ceq 'Disable'){$task=$folder.GetTask($m.task_name);$com+=,$task;$task.Enabled=$false;[ordered]@{task=$m.task_name;enabled=$task.Enabled}|ConvertTo-Json -Compress;return}
 if($bridgeMode -cne 'Supervise'){throw 'SCOPE_MODE'}
 if(-not(Test-Path -LiteralPath (Join-Path $Root 'evidence\preflight.json'))){throw 'SCOPE_PREFLIGHT_REQUIRED'}
 foreach($name in @('supervisor-start.json','bootstrap-start.json','launch-request.json','supervisor-final.json')){if(Test-Path -LiteralPath (Join-Path $Root ('evidence\'+$name))){throw 'INTEGRITY_OLD_ENTRY'}}
 $absent=$false;try{$existing=$folder.GetTask($m.task_name);$com+=,$existing}catch{$err=$_.Exception;while($err.InnerException){$err=$err.InnerException};if($err.HResult -eq -2147024894){$absent=$true}else{throw}};if(-not $absent){throw 'INTEGRITY_TASK_ALREADY_EXISTS'}
 $definition=$service.NewTask(0);$com+=,$definition;$definition.RegistrationInfo.Description='ENGINEERING_02 fixed ordinary entry bridge; no triggers; disable after run.';$definition.Principal.UserId=$script:OrdinarySid;$definition.Principal.LogonType=3;$definition.Principal.RunLevel=0
 $definition.Settings.Enabled=$true;$definition.Settings.AllowDemandStart=$true;$definition.Settings.MultipleInstances=2;$definition.Settings.ExecutionTimeLimit='PT0S';$definition.Settings.RestartCount=0;$definition.Settings.StopIfGoingOnBatteries=$false;$definition.Settings.DisallowStartIfOnBatteries=$false
 $action=$definition.Actions.Create(0);$com+=,$action;$action.Path=$script:PowerShellExe;$action.WorkingDirectory=$Root;$action.Arguments='-NoLogo -STA -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "'+(Join-Path $Root 'control\start-ordinary-entry-bridge.ps1')+'" -Mode Bootstrap -Root "'+$Root+'" -ManifestSha256 '+$ManifestSha256
 $null=Write-Record (Join-Path $Root 'evidence\task-definition-before-register.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;xml=$definition.XmlText})
 $task=$folder.RegisterTaskDefinition($m.task_name,$definition,2,$script:OrdinarySid,$null,3,$null);$com+=,$task
 $read=$task.Definition;$com+=,$read;$a=$read.Actions.Item(1);$com+=,$a
 $principalSid=Principal-Sid $read.Principal.UserId
 if($principalSid -cne $script:OrdinarySid -or $read.Principal.LogonType -ne 3 -or $read.Principal.RunLevel -ne 0 -or $read.Triggers.Count -ne 0 -or $read.Actions.Count -ne 1 -or $a.Path -cne $action.Path -or $a.Arguments -cne $action.Arguments -or $a.WorkingDirectory -cne $Root -or $read.Settings.MultipleInstances -ne 2 -or $read.Settings.RestartCount -ne 0 -or $read.Settings.ExecutionTimeLimit -cne 'PT0S' -or -not $read.Settings.AllowDemandStart){throw 'INTEGRITY_TASK_READBACK'}
 $null=Write-Record (Join-Path $Root 'evidence\task-registered.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;task=$m.task_name;xml=$task.Xml;principal_user_id=$read.Principal.UserId;principal_sid=$principalSid;readback='PASS';activated=$false})
 $null=Write-Record (Join-Path $Root 'evidence\supervisor-start.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;pid=$PID;started_at=[DateTime]::UtcNow.ToString('o')})
 $running=$task.Run($null);$com+=,$running
 $heldQueries=@();$proofs=@();$bootstrap=$null;$cmdPin=$null;$capture=$null;$pauseRelease=$null;$fixtureCheck=$null
 try{
  $start=Wait-File 'evidence\bootstrap-start.json' 30000;Assert-RecordBinding $start;$bootstrap=Open-Bound $start.instance -Bootstrap;$heldQueries+=@($bootstrap)
  $p=[Diagnostics.Process]::GetProcessById($bootstrap.Id);try{$bootstrapPin=[A31Capture]::Pin($p,0)}finally{$p.Dispose()};$heldQueries+=@($bootstrapPin.Process)
  $bootCapture=[A31Capture]::Capture(@($bootstrapPin));foreach($h in $bootCapture.Added){$heldQueries+=@($h.Process)};$null=Write-Record (Join-Path $Root 'evidence\bootstrap-capture.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;added=@($bootCapture.Added|ForEach-Object{Capture-DiagnosticAdded $_});gaps=@($bootCapture.Gaps|ForEach-Object{Capture-DiagnosticGap $_});excluded=@($bootCapture.Excluded|ForEach-Object{Capture-DiagnosticExcluded $_})});if($bootCapture.Gaps.Count -or $bootCapture.Excluded.Count -or $bootCapture.Added.Count -gt 1){throw 'LIFECYCLE_BOOTSTRAP_CAPTURE'}
  foreach($h in $bootCapture.Added){if($h.Parent -ne $bootstrap.Id -or $h.Process.ImagePath -inotmatch '^\\Device\\HarddiskVolume[0-9]+\\Windows\\System32\\conhost\.exe$'){throw 'LIFECYCLE_BOOTSTRAP_CHILD'}}
  $baseline=@{};foreach($r in [A31Capture]::Snapshot()){if($r.Parent -eq $m.explorer.pid -and $r.Exe -ieq 'cmd.exe'){$baseline[[string]$r.Pid]=$true}}
  $permitTicks=[DateTime]::UtcNow.Ticks;Signal 'bootstrap-permit.json'
  $found=$null;$until=[DateTime]::UtcNow.AddSeconds(30)
  while(-not $found){
   $new=@([A31Capture]::Snapshot()|Where-Object{$_.Parent -eq $m.explorer.pid -and $_.Exe -ieq 'cmd.exe' -and -not $baseline.ContainsKey([string]$_.Pid)})
   if($new.Count -gt 1){throw 'IDENTITY_ENTRY_CMD_AMBIGUOUS'};if($new.Count -eq 1){$found=$new[0];break}
   if($bootstrap.HasExited -and (Test-Path -LiteralPath (Join-Path $Root 'evidence\bootstrap-final.json'))){$bf=Read-Record (Join-Path $Root 'evidence\bootstrap-final.json');Assert-RecordBinding $bf;if($bf.status -ceq 'FAIL'){throw ('BOOTSTRAP_CAPABILITY_FAILURE:'+ $bf.stage+':'+$bf.error)}}
   if([DateTime]::UtcNow -ge $until){throw 'LIFECYCLE_ENTRY_CMD_UNKNOWN'};Start-Sleep -Milliseconds 20
  }
  $p=[Diagnostics.Process]::GetProcessById($found.Pid);try{$cmdPin=[A31Capture]::Pin($p,$m.explorer.pid)}finally{$p.Dispose()};$heldQueries+=@($cmdPin.Process)
  if($cmdPin.Process.ImagePath -inotmatch '^\\Device\\HarddiskVolume[0-9]+\\Windows\\System32\\cmd\.exe$' -or $cmdPin.CreationTicks -le $permitTicks -or $cmdPin.Session -ne $m.explorer.session){throw 'IDENTITY_ENTRY_CMD_INSTANCE'};Assert-Ordinary ([A31Capture]::Token($cmdPin.Process))
  $psRow=$null;$until=[DateTime]::UtcNow.AddSeconds(30)
  while(-not $psRow){
   $rows=@([A31Capture]::Snapshot()|Where-Object{$_.Parent -eq $cmdPin.Pid -and $_.Exe -ieq 'powershell.exe'});if($rows.Count -gt 1){throw 'IDENTITY_ENTRY_POWERSHELL_AMBIGUOUS'};if($rows.Count -eq 1){$psRow=$rows[0];break}
   if($cmdPin.Process.HasExited){throw 'LIFECYCLE_ENTRY_CMD_EXITED_BEFORE_POWERSHELL'};if([DateTime]::UtcNow -ge $until){throw 'LIFECYCLE_ENTRY_POWERSHELL_UNKNOWN'};Start-Sleep -Milliseconds 20
  }
  $capture=[A31Capture]::Capture(@($cmdPin));foreach($h in $capture.Added){$heldQueries+=@($h.Process)};$null=Write-Record (Join-Path $Root 'evidence\entry-capture.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;added=@($capture.Added|ForEach-Object{Capture-DiagnosticAdded $_});gaps=@($capture.Gaps|ForEach-Object{Capture-DiagnosticGap $_});excluded=@($capture.Excluded|ForEach-Object{Capture-DiagnosticExcluded $_})})
  if($capture.Gaps.Count -or $capture.Excluded.Count){throw 'LIFECYCLE_ENTRY_CAPTURE'}
  $directConsole=@($capture.Added|Where-Object{$_.Parent -eq $cmdPin.Pid -and $_.Process.ImagePath -imatch '\\conhost\.exe$'});$directPs=@($capture.Added|Where-Object{$_.Parent -eq $cmdPin.Pid -and $_.Process.ImagePath -imatch '\\WindowsPowerShell\\v1\.0\\powershell\.exe$'})
  if($directConsole.Count -ne 1 -or $directPs.Count -ne 1 -or $directPs[0].Pid -ne $psRow.Pid){throw 'LIFECYCLE_ENTRY_CAPTURE_SHAPE'}
  foreach($h in @($directConsole[0],$directPs[0])){Assert-Ordinary ([A31Capture]::Token($h.Process));if($h.Session -ne $m.explorer.session){throw 'IDENTITY_ENTRY_CAPTURE_CHILD'}}
  $null=Write-Record (Join-Path $Root 'evidence\entry-pinned.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;cmd=Instance $cmdPin.Process;console=Instance $directConsole[0].Process;powershell=Instance $directPs[0].Process;bootstrap=Instance $bootstrap})
  if($m.phase -ceq 'A'){Signal 'fixture-pinned.json'}
  $window=[DateTime]::UtcNow.AddMinutes($(if($m.phase -ceq 'A'){2}elseif($m.target.kind -ceq 'DISPATCHER'){60}else{15}));$psQuery=$directPs[0].Process;$psGone=$null
  while(@($heldQueries|Where-Object{-not $_.HasExited}).Count){
   if($psQuery.HasExited -and -not $psGone){$psGone=[Diagnostics.Stopwatch]::StartNew()}
   if($psGone -and $psGone.ElapsedMilliseconds -ge 10000 -and -not $cmdPin.Process.HasExited){throw 'LIFECYCLE_PAUSE_NOT_RELEASED'}
   if([DateTime]::UtcNow -ge $window){throw 'LIFECYCLE_ENTRY_WINDOW_EXPIRED'};Start-Sleep -Milliseconds 100
  }
  foreach($q in $heldQueries){$proofs+=@(Finish-Held $q)}
  $must=@($bootstrap.Id,$cmdPin.Pid,$directConsole[0].Pid)+@($bootCapture.Added|ForEach-Object{$_.Pid});if($m.phase -ceq 'A'){$must+=@($directPs[0].Pid)}
  if(@($proofs|Where-Object{$must -contains $_.instance.pid -and $_.exit_code -ne 0}).Count){throw 'LIFECYCLE_ENTRY_EXIT_CODE'}
  $psProof=@($proofs|Where-Object{$_.instance.pid -eq $directPs[0].Pid})[0];$cmdProof=@($proofs|Where-Object{$_.instance.pid -eq $cmdPin.Pid})[0]
  $deltaMs=[int](([long]$cmdProof.exit_ticks-[long]$psProof.exit_ticks)/10000)
  $pauseRelease=[ordered]@{powershell_exit_code=$psProof.exit_code;powershell_exit_ticks=$psProof.exit_ticks;cmd_exit_code=$cmdProof.exit_code;cmd_exit_ticks=$cmdProof.exit_ticks;cmd_exit_after_powershell_ms=$deltaMs;stdin='NUL';key_press='NOT_PERFORMED'}
  $null=Write-Record (Join-Path $Root 'evidence\pause-release.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;pause_release=$pauseRelease})
  if($deltaMs -lt 0 -or $deltaMs -gt 10000){throw 'LIFECYCLE_PAUSE_NOT_RELEASED'}
  if($m.phase -ceq 'A'){
   $observed=Read-Record (Join-Path $Root 'evidence\fixture-observed.json');Assert-RecordBinding $observed;$final=Read-Record (Join-Path $Root 'evidence\fixture-final.json');Assert-RecordBinding $final
   if($final.status -cne 'FIXTURE_CHAIN_OK_NOT_ADMISSION' -or $observed.self.pid -ne $directPs[0].Pid -or $observed.self.creation_ticks -cne $directPs[0].CreationTicks.ToString() -or $observed.chain.Count -ne 2 -or $observed.chain[0].parent.pid -ne $cmdPin.Pid -or $observed.chain[1].parent.pid -ne $m.explorer.pid -or $observed.chain[1].parent.creation_ticks -cne $m.explorer.creation_ticks){throw 'SAFETY_FIXTURE_RESULT'}
   $fixtureCheck='PASS'
  }
 }catch{$failure=$_.Exception.Message.Substring(0,[Math]::Min(1200,$_.Exception.Message.Length))
  try{if(-not(Test-Path -LiteralPath (Join-Path $Root 'signals\abort.json'))){Signal 'abort.json'}}catch{$signalErrors+=@($_.Exception.Message.Substring(0,[Math]::Min(1200,$_.Exception.Message.Length)))}
  foreach($q in $heldQueries){try{$proofs+=@(Finish-Held $q)}catch{$queryError=$_.Exception.Message;$instance='UNKNOWN';try{$instance=Instance $q}catch{$queryError+=' | INSTANCE_UNKNOWN:'+$_.Exception.Message};$proofs+=@([ordered]@{instance=$instance;exit_code='UNKNOWN';exit_ticks='UNKNOWN';held_query_after_exit=$false;error=$queryError})}}
 }finally{
  $close=Close-Queries $heldQueries;if($close.Count -and -not $failure){$failure='LIFECYCLE_SUPERVISOR_CLOSE'}
  try{$task.Enabled=$false;if($task.Enabled -and -not $failure){$failure='SAFETY_TASK_NOT_DISABLED'}}catch{$disableErrors+=@($_.Exception.Message);if(-not $failure){$failure='SAFETY_TASK_DISABLE_ERROR'}}
  if($signalErrors.Count -and -not $failure){$failure='LIFECYCLE_SUPERVISOR_SIGNAL'}
  $taskDisabled='UNKNOWN';try{$taskDisabled=(-not $task.Enabled)}catch{$disableErrors+=@($_.Exception.Message)}
  $null=Write-Record (Join-Path $Root 'evidence\supervisor-final.json') ([ordered]@{schema_version=2;manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;status=if($failure){'FAIL'}else{'ORDINARY_ENTRY_BRIDGE_LAUNCH_AND_EXIT_PASS_NOT_ADMISSION'};error=$failure;phase=$m.phase;target_kind=$m.target.kind;pause_release=$pauseRelease;fixture_check=$fixtureCheck;exit_proofs=$proofs;close_errors=$close;signal_errors=$signalErrors;disable_errors=$disableErrors;task_disabled=$taskDisabled;consumer_verdict='NOT_JUDGED_BY_BRIDGE';product='NOT_PERFORMED';win7='NOT_PERFORMED';finished_at=[DateTime]::UtcNow.ToString('o')})
 }
}catch{$failure=$_.Exception.Message.Substring(0,[Math]::Min(1200,$_.Exception.Message.Length));if($task){try{$task.Enabled=$false}catch{$disableErrors+=@($_.Exception.Message)}};if(-not(Test-Path -LiteralPath (Join-Path $Root 'evidence\supervisor-final.json'))){$null=Write-Record (Join-Path $Root 'evidence\supervisor-final.json') ([ordered]@{schema_version=2;manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;status='FAIL';error=$failure;signal_errors=$signalErrors;disable_errors=$disableErrors;task_disabled=if($task){-not $task.Enabled}else{'NOT_CREATED'};product='NOT_PERFORMED';win7='NOT_PERFORMED'})}}
finally{
 $outerCloseErrors=Close-ComObjects $com
 if(($outerCloseErrors.Count -or $disableErrors.Count) -and -not $failure){$failure='LIFECYCLE_SUPERVISOR_COM_CLOSE_OR_DISABLE'}
 if($bridgeMode -ceq 'Disable'){$null=Write-Record (Join-Path $Root 'evidence\disable-cleanup.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;com_close_errors=$outerCloseErrors;disable_errors=$disableErrors});if($outerCloseErrors.Count){throw 'LIFECYCLE_DISABLE_COM_CLOSE'}}
 if($bridgeMode -ceq 'Supervise'){$null=Write-Record (Join-Path $Root 'evidence\supervisor-cleanup.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;com_close_errors=$outerCloseErrors;disable_errors=$disableErrors;error=$failure})}
}
[ordered]@{status=if($failure){'FAIL'}else{'ORDINARY_ENTRY_BRIDGE_LAUNCH_AND_EXIT_PASS_NOT_ADMISSION'};manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;error=$failure}|ConvertTo-Json -Compress
if($failure){exit 1}

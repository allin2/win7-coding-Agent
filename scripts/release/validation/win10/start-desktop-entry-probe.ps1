param([Parameter(Mandatory=$true)][ValidateSet('Library','Preflight','Bootstrap','Supervise','Collect','Disable')][string]$Mode,[Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestSha256)
# Apache-2.0. ENGINEERING_02 / ADR-0205. Fixed Win10 diagnostic only; no product admission.
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$script:ReviewSha='04c81f90192785dfe2f468a8c94ad0903f15d384bee7f555a6d7fc8841ab136c'
$script:OrdinarySid='S-1-5-21-3031939772-989444280-3099258187-1005'
$script:Cases=@('success-before','expected-fixture-failure','success-after')
function Assert-Plain([string]$path){$x=Get-Item -LiteralPath $path -Force;while($x){if($x.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'INTEGRITY_REPARSE'};$x=if($x -is [IO.DirectoryInfo]){$x.Parent}else{$x.Directory}}}
function File-Hash([string]$path){Assert-Plain $path;return (Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant()}
function Exact-Keys($v,[string[]]$keys){$actual=@($v.PSObject.Properties.Name|Sort-Object);$wanted=@($keys|Sort-Object);if(($actual -join '|') -cne ($wanted -join '|')){throw 'INTEGRITY_KEYS'}}
function Read-Record([string]$path){Assert-Plain $path;if((Get-Item -LiteralPath $path).Length -gt 262144){throw 'OUTPUT_LIMIT'};return (Get-Content -LiteralPath $path -Raw -Encoding UTF8|ConvertFrom-Json)}
function Write-Record([string]$path,$v){Assert-Plain (Split-Path -Parent $path);$bytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($v|ConvertTo-Json -Depth 25 -Compress));if($bytes.Length -gt 262144){throw 'OUTPUT_LIMIT'};$f=[IO.File]::Open($path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$f.Write($bytes,0,$bytes.Length);$f.Flush()}finally{$f.Dispose()};return (File-Hash $path)}
function Assert-Admin{if([Security.Principal.WindowsIdentity]::GetCurrent().User.Value -cne 'S-1-5-21-3031939772-989444280-3099258187-500' -or [Diagnostics.Process]::GetCurrentProcess().SessionId -ne 0){throw 'IDENTITY_ADMIN_DIAGNOSTIC'}}
function Principal-Sid([string]$value){if($value -cmatch '^S-1-'){$sid=New-Object Security.Principal.SecurityIdentifier($value)}else{$sid=(New-Object Security.Principal.NTAccount($value)).Translate([Security.Principal.SecurityIdentifier])};return $sid.Value}
function Assert-Ordinary($i,[switch]$Bootstrap){if($i.Sid -cne $script:OrdinarySid -or $i.Session -ne $script:ProbeManifest.explorer.session -or -not $i.Ordinary -or $i.Elevated -or $i.Rid -ne 8192 -or $i.IntegritySid -cne 'S-1-16-8192' -or $i.ElevationType -notin @(1,3) -or (-not $Bootstrap -and $i.InJob)){throw 'IDENTITY_ORDINARY_DESKTOP_REQUIRED'}}
function Read-ApprovedManifest{
 $prefix='C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-Engineering02-DesktopEntryProbe-20261008-'
 if($Root -cnotin @(($prefix+'R3')) -or $env:COMPUTERNAME -cne 'WIN-2JQ66JE4HTQ' -or [Environment]::OSVersion.Version.Build -ne 19045 -or -not [Environment]::Is64BitProcess -or $PSVersionTable.PSVersion.ToString() -cne '5.1.19041.6456'){throw 'SCOPE_TARGET_ROOT_RUNTIME'}
 $path=Join-Path $Root 'inputs\manifest.json';if((File-Hash $path) -cne $ManifestSha256){throw 'INTEGRITY_MANIFEST_HASH'};$m=Read-Record $path
 Exact-Keys $m @('schema_version','kind','root','version','experiment_id','review_sha256','approval_sha256','source_head','task_name','explorer','system_files','files','requests','capture','created_at','valid_until')
 if($m.schema_version -ne 1 -or $m.kind -cne 'OWNER_APPROVED_FIXED_DESKTOP_ENTRY_DIAGNOSTIC' -or $m.root -cne $Root -or $m.review_sha256 -cne $script:ReviewSha -or $m.source_head -cne 'a53c9b9d861486e5923bc82ea70b31b76af1a939' -or $m.experiment_id -cnotmatch '^[a-f0-9]{32}$' -or $m.task_name -cne ('\A9-Engineering02-DesktopEntryProbe-20261008-'+$m.version) -or $Root -cne ($prefix+$m.version)){throw 'INTEGRITY_MANIFEST_SCOPE'}
 if([DateTimeOffset]::UtcNow -lt [DateTimeOffset]$m.created_at -or [DateTimeOffset]::UtcNow -ge [DateTimeOffset]$m.valid_until){throw 'SCOPE_EXPIRED'}
 $allowed=@('control\start-desktop-entry-probe.ps1','control\desktop-entry-probe.ps1','inputs\approval.json','inputs\capture-library.dll','inputs\capture-build.json','inputs\capture-build-scope.json','inputs\capture-source.cs','inputs\proof-source.ps1')
 if(@($m.files).Count -ne $allowed.Count -or @($m.system_files).Count -ne 4 -or @($m.requests).Count -ne 3){throw 'INTEGRITY_CLOSURE_COUNT'};$seen=@{}
 foreach($row in $m.files){Exact-Keys $row @('file','size','sha256');if($row.file -cnotin $allowed -or $seen.ContainsKey($row.file) -or $row.sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'INTEGRITY_CLOSURE_NAME'};$seen[$row.file]=$true;$f=Join-Path $Root $row.file;if((Get-Item -LiteralPath $f).Length -ne $row.size -or (File-Hash $f) -cne $row.sha256){throw 'INTEGRITY_FILE_HASH'}}
 $system=@('C:\Windows\System32\shell32.dll','C:\Windows\System32\taskschd.dll','C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe','C:\Windows\System32\cmd.exe');$seen=@{}
 foreach($row in $m.system_files){if($row.path -cnotin $system -or $seen.ContainsKey($row.path)){throw 'INTEGRITY_SYSTEM_FILE_NAME'};$seen[$row.path]=$true;if((Get-Item -LiteralPath $row.path).Length -ne $row.size -or (File-Hash $row.path) -cne $row.sha256){throw 'INTEGRITY_SYSTEM_FILE_HASH'}}
 $approval=Read-Record (Join-Path $Root 'inputs\approval.json');if((File-Hash (Join-Path $Root 'inputs\approval.json')) -cne $m.approval_sha256 -or $approval.status -cne 'OWNER_APPROVED' -or $approval.review_sha256 -cne $script:ReviewSha -or $approval.product_execution_authorized -or $approval.win7_execution_authorized){throw 'SCOPE_OWNER_APPROVAL'}
 if($m.capture.sha256 -cne '9a205e4cbe80bf768d5bedf96e3a670baf593291698aab54c2b458ed8ae144b6' -or $m.capture.mvid -cne 'f87e40ae-f1bf-4eef-b2a0-30cbb6da0bc0' -or (File-Hash (Join-Path $Root 'inputs\capture-library.dll')) -cne $m.capture.sha256){throw 'INTEGRITY_NATIVE_CAPTURE'}
 $nonces=@{};for($n=0;$n -lt 3;$n++){$q=$m.requests[$n];Exact-Keys $q @('sequence','case','nonce');if($q.sequence -ne $n+1 -or $q.case -cne $script:Cases[$n] -or $q.nonce -cnotmatch '^[a-f0-9]{32}$' -or $nonces.ContainsKey($q.nonce)){throw 'INTEGRITY_FIXED_REQUESTS'};$nonces[$q.nonce]=$true}
 $script:ProbeManifest=$m;return $m
}
function Load-Capture{
 $a=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes((Join-Path $Root 'inputs\capture-library.dll')))
 if($a.ManifestModule.ModuleVersionId.ToString() -cne $script:ProbeManifest.capture.mvid -or ('A31Capture' -as [type]).Module.ModuleVersionId.ToString() -cne $script:ProbeManifest.capture.mvid -or [A31Capture]::ApiProfile -cne 'WIN10_PS51_NET4_QUERY_HANDLE_CAPTURE_V5_TEST_ONLY'){throw 'INTEGRITY_NATIVE_MVID'}
}
function Open-Bound($v,[switch]$Bootstrap){
 $q=[A31Capture]::OpenQuery([int]$v.pid)
 try{if($q.HasExited -or $q.StartTime.Ticks.ToString() -cne [string]$v.creation_ticks -or $q.SessionId -ne $v.session){throw 'IDENTITY_INSTANCE'};Assert-Ordinary ([A31Capture]::Token($q)) -Bootstrap:$Bootstrap;return $q}catch{$q.Dispose();throw}
}
function Assert-Explorer{
 $x=$script:ProbeManifest.explorer;$q=Open-Bound $x
 try{if($q.ImagePath -inotmatch '^\\Device\\HarddiskVolume[0-9]+\\Windows\\explorer\.exe$'){throw 'IDENTITY_EXPLORER_IMAGE'}}finally{$q.Dispose()}
}
function Instance($q){return [ordered]@{pid=$q.Id;creation_ticks=$q.StartTime.ToUniversalTime().Ticks.ToString();session=$q.SessionId;image=$q.ImagePath}}
function Request-Text([int]$sequence){$q=$script:ProbeManifest.requests[$sequence-1];return (([ordered]@{schema_version=1;manifest_sha256=$ManifestSha256;experiment_id=$script:ProbeManifest.experiment_id;sequence=$sequence;case=$q.case;nonce=$q.nonce})|ConvertTo-Json -Compress)}
function Assert-Request([string]$text,[int]$sequence){if($sequence -lt 1 -or $sequence -gt 3 -or $text.Length -gt 1024 -or $text -cne (Request-Text $sequence)){throw 'INTEGRITY_FIXED_REQUEST_CANONICAL'};return ($text|ConvertFrom-Json)}
function Assert-Signal([string]$name){$v=Read-Record (Join-Path $Root ('signals\'+$name));Exact-Keys $v @('manifest_sha256','experiment_id');if($v.manifest_sha256 -cne $ManifestSha256 -or $v.experiment_id -cne $script:ProbeManifest.experiment_id){throw 'INTEGRITY_SIGNAL'}}
function Signal([string]$name){$null=Write-Record (Join-Path $Root ('signals\'+$name)) ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$script:ProbeManifest.experiment_id})}
function Wait-File([string]$rel,[int]$ms){$clock=[Diagnostics.Stopwatch]::StartNew();while(-not(Test-Path -LiteralPath (Join-Path $Root $rel))){if($clock.ElapsedMilliseconds -ge $ms){throw ('LIFECYCLE_READY_UNKNOWN:'+ $rel)};Start-Sleep -Milliseconds 50};return (Read-Record (Join-Path $Root $rel))}
function Finish-Held($q){if(-not $q.WaitForExit(30000)){throw 'LIFECYCLE_HELD_EXIT_UNKNOWN'};return [ordered]@{instance=Instance $q;exit_code=$q.ReadExitCode();exit_ticks=$q.ReadExitTime().ToUniversalTime().Ticks.ToString();held_query_after_exit=$true}}
function Assert-RecordBinding($v){if($v.manifest_sha256 -cne $ManifestSha256 -or $v.experiment_id -cne $script:ProbeManifest.experiment_id){throw 'INTEGRITY_RECORD_BINDING'}}
function Import-ProofFunctions{
 $p=Join-Path $Root 'inputs\proof-source.ps1';if((File-Hash $p) -cne '0663b6b35c03b37ca058a36ad233752b426ab219e5665ff61556fe9e75e2d5da'){throw 'INTEGRITY_PROOF_SOURCE'}
 $tokens=$null;$errors=$null;$ast=[Management.Automation.Language.Parser]::ParseFile($p,[ref]$tokens,[ref]$errors);if($errors.Count){throw 'PARSE_PROOF_SOURCE'}
 foreach($name in @('Capture-DiagnosticProof','Capture-DiagnosticAdded','Capture-DiagnosticGap','Capture-DiagnosticExcluded','Get-OrdinaryCaptureSet','Get-ChildStreamDiagnostic')){
  $fn=@($ast.FindAll({param($n)$n -is [Management.Automation.Language.FunctionDefinitionAst] -and $n.Name -ceq $name},$true));if($fn.Count -ne 1){throw 'INTEGRITY_PROOF_FUNCTION'}
  $parameters=(@($fn[0].Parameters|ForEach-Object{$_.Extent.Text}) -join ',');$body=$fn[0].Body.Extent.Text;$inside=$body.Substring(1,$body.Length-2)
  Set-Item -Path ('Function:script:'+ $name) -Value ([ScriptBlock]::Create('param('+$parameters+')'+[Environment]::NewLine+$inside))
 }
}
function Close-Queries($queries){$closed=@();$errors=@();foreach($q in $queries){if($q -and -not @($closed|Where-Object{[Object]::ReferenceEquals($_,$q)}).Count){try{$q.Dispose()}catch{$errors+=@($_.Exception.Message)};$closed+=@($q)}};return ,$errors}
function Close-ComObjects($objects){
 $unique=New-Object 'Collections.Generic.List[object]';$errors=@()
 for($n=$objects.Count-1;$n -ge 0;$n--){$o=$objects[$n];$duplicate=$false;for($j=0;$j -lt $unique.Count;$j++){if([Object]::ReferenceEquals($unique[$j],$o)){$duplicate=$true;break}};if($o -and -not $duplicate){$unique.Add($o)}}
 for($n=0;$n -lt $unique.Count;$n++){try{$null=[Runtime.InteropServices.Marshal]::ReleaseComObject($unique[$n])}catch{$errors+=@($_.Exception.Message)}}
 return ,$errors
}
if($Mode -ceq 'Library'){return}
if($PSScriptRoot -cne (Join-Path $Root 'control')){throw 'INTEGRITY_ENTRY_PATH'}
$m=Read-ApprovedManifest;Load-Capture
if($Mode -cne 'Bootstrap'){Assert-Admin};if($Mode -ceq 'Supervise'){Import-ProofFunctions}
Assert-Explorer
$task=$null;$service=$null;$folder=$null;$com=@();$failure=$null;$outerCloseErrors=@();$disableErrors=@()
if($Mode -ceq 'Preflight'){
 Import-ProofFunctions;foreach($name in @('Capture-DiagnosticProof','Capture-DiagnosticAdded','Capture-DiagnosticGap','Capture-DiagnosticExcluded','Get-OrdinaryCaptureSet','Get-ChildStreamDiagnostic')){if(-not(Get-Command -Name $name -CommandType Function -ErrorAction SilentlyContinue)){throw 'PREFLIGHT_FUNCTION_IMPORT'}}
 foreach($file in @('control\start-desktop-entry-probe.ps1','control\desktop-entry-probe.ps1','inputs\proof-source.ps1')){$t=$null;$e=$null;$null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $Root $file),[ref]$t,[ref]$e);if($e.Count){throw ('PARSE_SOURCE:'+ $file)}}
 $stream=Get-ChildStreamDiagnostic ([pscustomobject]@{IsCompleted=$true;Status='RanToCompletion';Result='A9'});if($stream.text -cne 'A9' -or $stream.saved_utf8_bytes -ne 2){throw 'PREFLIGHT_IMPORTED_FUNCTION_PARAMETERS'}
 for($n=1;$n -le 3;$n++){$valid=Request-Text $n;$null=Assert-Request $valid $n;foreach($bad in @($valid+' ',($valid -replace '"schema_version":1','"schema_version":1,"schema_version":1'),($valid -replace '"nonce":"[a-f0-9]{32}"','"nonce":"..\\evil"'),($valid.TrimEnd('}')+',"command":"whoami"}'))){$rejected=$false;try{$null=Assert-Request $bad $n}catch{$rejected=$true};if(-not $rejected){throw 'PREFLIGHT_REQUEST_REJECTION'}}}
 $null=Write-Record (Join-Path $Root 'evidence\preflight.json') ([ordered]@{status='PS51_SOURCE_AND_FIXED_REQUEST_PREFLIGHT_PASS_NOT_ENTRY';manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;ordinary_entry='NOT_PERFORMED';valid_requests=3;invalid_requests_rejected=12});return
}
if($Mode -ceq 'Bootstrap'){
 $self=[Diagnostics.Process]::GetCurrentProcess();$held=[A31Capture]::Pin($self,0);$comErrors=@();$stage='START'
 try{
  $id=[A31Capture]::Token($held.Process);Assert-Ordinary $id -Bootstrap
  $null=Write-Record (Join-Path $Root 'evidence\bootstrap-start.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;instance=Instance $held.Process;identity=$id;apartment=[string][Threading.Thread]::CurrentThread.GetApartmentState()})
  $null=Wait-File 'signals\bootstrap-permit.json' 30000;Assert-Signal 'bootstrap-permit.json'
  $stage='SHELL_APPLICATION';$shell=New-Object -ComObject Shell.Application;$com+=,$shell
  $stage='SHELL_WINDOWS';$windows=$shell.Windows();$com+=,$windows
  $stage='FIND_DESKTOP';$hwnd=0;$loc=$null;$locRoot=$null;$desktop=$windows.FindWindowSW([ref]$loc,[ref]$locRoot,8,[ref]$hwnd,1);if(-not $desktop -or -not $hwnd){throw 'BOOTSTRAP_DESKTOP_NOT_FOUND'};$com+=,$desktop
  $stage='DESKTOP_DOCUMENT';$document=$desktop.Document;if(-not $document){throw 'BOOTSTRAP_DESKTOP_DOCUMENT'};$com+=,$document
  $stage='DESKTOP_APPLICATION';$app=$document.Application;if(-not $app){throw 'BOOTSTRAP_DESKTOP_APPLICATION'};$com+=,$app
  $launchArguments='/d /s /c ""C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" -NoLogo -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "'+(Join-Path $Root 'control\desktop-entry-probe.ps1')+'" -Root "'+$Root+'" -ManifestSha256 '+$ManifestSha256+'"'
  $stage='SHELL_EXECUTE';$app.ShellExecute('C:\Windows\System32\cmd.exe',$launchArguments,$Root,'open',1);$stage='SHELL_REQUEST_RETURNED_NOT_ENTRY'
 }catch{$failure=$_.Exception.Message.Substring(0,[Math]::Min(1000,$_.Exception.Message.Length))}
 finally{
  $comErrors=Close-ComObjects $com
  $close=Close-Queries @($held.Process);$self.Dispose();if(($comErrors.Count -or $close.Count) -and -not $failure){$failure='LIFECYCLE_BOOTSTRAP_CLOSE'}
  $null=Write-Record (Join-Path $Root 'evidence\bootstrap-final.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;status=if($failure){'FAIL'}else{'SHELL_REQUEST_RETURNED_NOT_ENTRY'};stage=$stage;error=$failure;com_close_errors=$comErrors;query_close_errors=$close})
 };if($failure){exit 1};exit 0
}
if($Mode -ceq 'Collect'){
 $files=@(Get-ChildItem -LiteralPath (Join-Path $Root 'evidence') -File)+@(Get-ChildItem -LiteralPath (Join-Path $Root 'results') -File)+@(Get-ChildItem -LiteralPath (Join-Path $Root 'requests') -File);foreach($n in @(1,2,3)){$dir=Join-Path $Root ('results\fixture-'+$n);if(Test-Path -LiteralPath $dir){Assert-Plain $dir;$files+=@(Get-ChildItem -LiteralPath $dir -File)}};if($files.Count -gt 64){throw 'OUTPUT_FILE_LIMIT'};$rows=@();$total=0
 foreach($f in $files){Assert-Plain $f.FullName;$b=[IO.File]::ReadAllBytes($f.FullName);$total+=$b.Length;if($b.Length -gt 262144 -or $total -gt 1048576){throw 'OUTPUT_LIMIT'};$rows+=@([ordered]@{file=$f.FullName.Substring($Root.Length+1);size=$b.Length;sha256=File-Hash $f.FullName;bytes=[Convert]::ToBase64String($b)})}
 [ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;files=$rows}|ConvertTo-Json -Depth 6 -Compress;return
}
try{
 $service=New-Object -ComObject Schedule.Service;$com+=,$service;$service.Connect();$folder=$service.GetFolder('\');$com+=,$folder
 if($Mode -ceq 'Disable'){$task=$folder.GetTask($m.task_name);$com+=,$task;$task.Enabled=$false;[ordered]@{task=$m.task_name;enabled=$task.Enabled}|ConvertTo-Json -Compress;return}
 if($Mode -cne 'Supervise'){throw 'SCOPE_MODE'}
 if(-not(Test-Path -LiteralPath (Join-Path $Root 'evidence\preflight.json'))){throw 'SCOPE_PREFLIGHT_REQUIRED'}
 foreach($name in @('supervisor-start.json','bootstrap-start.json','controller-start.json','supervisor-final.json')){if(Test-Path -LiteralPath (Join-Path $Root ('evidence\'+$name))){throw 'INTEGRITY_OLD_ENTRY'}}
 $absent=$false;try{$existing=$folder.GetTask($m.task_name);$com+=,$existing}catch{$err=$_.Exception;while($err.InnerException){$err=$err.InnerException};if($err.HResult -eq -2147024894){$absent=$true}else{throw}};if(-not $absent){throw 'INTEGRITY_TASK_ALREADY_EXISTS'}
 $definition=$service.NewTask(0);$com+=,$definition;$definition.RegistrationInfo.Description='ENGINEERING_02 fixed desktop diagnostic; no triggers; disable after run.';$definition.Principal.UserId=$script:OrdinarySid;$definition.Principal.LogonType=3;$definition.Principal.RunLevel=0
 $definition.Settings.Enabled=$true;$definition.Settings.AllowDemandStart=$true;$definition.Settings.MultipleInstances=2;$definition.Settings.ExecutionTimeLimit='PT0S';$definition.Settings.RestartCount=0;$definition.Settings.StopIfGoingOnBatteries=$false;$definition.Settings.DisallowStartIfOnBatteries=$false
 $action=$definition.Actions.Create(0);$com+=,$action;$action.Path='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe';$action.WorkingDirectory=$Root;$action.Arguments='-NoLogo -STA -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "'+(Join-Path $Root 'control\start-desktop-entry-probe.ps1')+'" -Mode Bootstrap -Root "'+$Root+'" -ManifestSha256 '+$ManifestSha256
 $null=Write-Record (Join-Path $Root 'evidence\task-definition-before-register.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;xml=$definition.XmlText})
 $task=$folder.RegisterTaskDefinition($m.task_name,$definition,2,$script:OrdinarySid,$null,3,$null);$com+=,$task
 $read=$task.Definition;$com+=,$read;$a=$read.Actions.Item(1);$com+=,$a
 $principalSid=Principal-Sid $read.Principal.UserId
 if($principalSid -cne $script:OrdinarySid -or $read.Principal.LogonType -ne 3 -or $read.Principal.RunLevel -ne 0 -or $read.Triggers.Count -ne 0 -or $read.Actions.Count -ne 1 -or $a.Path -cne $action.Path -or $a.Arguments -cne $action.Arguments -or $a.WorkingDirectory -cne $Root -or $read.Settings.MultipleInstances -ne 2 -or $read.Settings.RestartCount -ne 0 -or $read.Settings.ExecutionTimeLimit -cne 'PT0S' -or -not $read.Settings.AllowDemandStart){throw 'INTEGRITY_TASK_READBACK'}
 $null=Write-Record (Join-Path $Root 'evidence\task-registered.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;task=$m.task_name;xml=$task.Xml;principal_user_id=$read.Principal.UserId;principal_sid=$principalSid;readback='PASS';activated=$false})
 $null=Write-Record (Join-Path $Root 'evidence\supervisor-start.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;pid=$PID;started_at=[DateTime]::UtcNow.ToString('o')})
 $running=$task.Run($null);$com+=,$running
 $heldQueries=@();$proofs=@();$results=@();$controller=$null;$bootstrap=$null;$capture=$null;$parentPin=$null
 try{
  $start=Wait-File 'evidence\bootstrap-start.json' 30000;Assert-RecordBinding $start;$bootstrap=Open-Bound $start.instance -Bootstrap;$heldQueries+=@($bootstrap)
  $p=[Diagnostics.Process]::GetProcessById($bootstrap.Id);try{$bootstrapPin=[A31Capture]::Pin($p,0)}finally{$p.Dispose()};$heldQueries+=@($bootstrapPin.Process)
  $bootCapture=[A31Capture]::Capture(@($bootstrapPin));foreach($h in $bootCapture.Added){$heldQueries+=@($h.Process)};$null=Write-Record (Join-Path $Root 'evidence\bootstrap-capture.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;added=@($bootCapture.Added|ForEach-Object{Capture-DiagnosticAdded $_});gaps=@($bootCapture.Gaps|ForEach-Object{Capture-DiagnosticGap $_});excluded=@($bootCapture.Excluded|ForEach-Object{Capture-DiagnosticExcluded $_})});if($bootCapture.Gaps.Count -or $bootCapture.Excluded.Count -or $bootCapture.Added.Count -gt 1){throw 'LIFECYCLE_BOOTSTRAP_CAPTURE'}
  foreach($h in $bootCapture.Added){if($h.Parent -ne $bootstrap.Id -or $h.Process.ImagePath -inotmatch '^\\Device\\HarddiskVolume[0-9]+\\Windows\\System32\\conhost\.exe$'){throw 'LIFECYCLE_BOOTSTRAP_CHILD'}}
  Signal 'bootstrap-permit.json'
  $waitClock=[Diagnostics.Stopwatch]::StartNew();while(-not(Test-Path -LiteralPath (Join-Path $Root 'evidence\controller-observed.json'))){
   if($bootstrap.HasExited -and (Test-Path -LiteralPath (Join-Path $Root 'evidence\bootstrap-final.json'))){$bf=Read-Record (Join-Path $Root 'evidence\bootstrap-final.json');Assert-RecordBinding $bf;if($bf.status -ceq 'FAIL' -and $bf.stage -cnotin @('SHELL_EXECUTE','SHELL_REQUEST_RETURNED_NOT_ENTRY')){throw ('BOOTSTRAP_CAPABILITY_FAILURE:'+ $bf.stage+':'+$bf.error)}}
   if($waitClock.ElapsedMilliseconds -ge 30000){throw 'LIFECYCLE_CONTROLLER_READY_UNKNOWN'};Start-Sleep -Milliseconds 50
  };$observed=Read-Record (Join-Path $Root 'evidence\controller-observed.json');if($observed.manifest_sha256 -cne $ManifestSha256){throw 'INTEGRITY_EARLY_CONTROLLER'}
  $controller=[A31Capture]::OpenQuery([int]$observed.instance.pid);$heldQueries+=@($controller)
  if($controller.StartTime.Ticks.ToString() -cne $observed.instance.creation_ticks -or $controller.SessionId -ne $observed.instance.session){throw 'IDENTITY_EARLY_CONTROLLER_INSTANCE'}
  Signal 'controller-observed-pinned.json'
  $start=Wait-File 'evidence\controller-start.json' 30000;Assert-RecordBinding $start
  if($controller.StartTime.Ticks.ToString() -cne $start.instance.creation_ticks -or $controller.Id -ne $start.instance.pid){throw 'IDENTITY_CONTROLLER_INSTANCE'};Assert-Ordinary ([A31Capture]::Token($controller))
  $parent=$start.console_parent;$parentQuery=Open-Bound $parent;$heldQueries+=@($parentQuery)
  if($parentQuery.ImagePath -inotmatch '^\\Device\\HarddiskVolume[0-9]+\\Windows\\System32\\cmd\.exe$'){throw 'IDENTITY_CONSOLE_PARENT_IMAGE'}
  $p=[Diagnostics.Process]::GetProcessById($parent.pid);try{$parentPin=[A31Capture]::Pin($p,$m.explorer.pid)}finally{$p.Dispose()};$heldQueries+=@($parentPin.Process)
  $capture=[A31Capture]::Capture(@($parentPin));foreach($h in $capture.Added){$heldQueries+=@($h.Process)};$null=Write-Record (Join-Path $Root 'evidence\entry-capture.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;added=@($capture.Added|ForEach-Object{Capture-DiagnosticAdded $_});gaps=@($capture.Gaps|ForEach-Object{Capture-DiagnosticGap $_});excluded=@($capture.Excluded|ForEach-Object{Capture-DiagnosticExcluded $_})});if($capture.Gaps.Count -or $capture.Excluded.Count -or $capture.Added.Count -lt 1 -or $capture.Added.Count -gt 2){throw 'LIFECYCLE_ENTRY_CAPTURE'}
  foreach($h in $capture.Added){Assert-Ordinary ([A31Capture]::Token($h.Process));if($h.Parent -ne $parent.pid -or $h.Session -ne $m.explorer.session -or $h.Process.ImagePath -inotmatch '^\\Device\\HarddiskVolume[0-9]+\\Windows\\System32\\(conhost\.exe|WindowsPowerShell\\v1\.0\\powershell\.exe)$'){throw 'IDENTITY_ENTRY_CAPTURE_CHILD'}}
  $actual=@($capture.Added|Where-Object{$_.Pid -eq $controller.Id});if($actual.Count -ne 1){throw 'LIFECYCLE_ENTRY_CONTROLLER_CAPTURE'};[A31Capture]::AssertSameInstance($controller,$actual[0].Process,$controller.Id,$controller.StartTime.Ticks,$controller.SessionId,$controller.ImagePath)
  $null=Write-Record (Join-Path $Root 'evidence\entry-pinned.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;controller=Instance $controller;console_parent=Instance $parentQuery;bootstrap=Instance $bootstrap;entry_children=@($capture.Added|ForEach-Object{Instance $_.Process})})
  Signal 'controller-pinned.json'
  for($n=1;$n -le 3;$n++){
   if($controller.HasExited){throw 'LIFECYCLE_CONTROLLER_EXITED_EARLY'};Assert-Explorer;Assert-Ordinary ([A31Capture]::Token($controller))
   $text=Request-Text $n;$null=Assert-Request $text $n;$temp=Join-Path $Root ('requests\pending-'+$n+'.json');$f=[IO.File]::Open($temp,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$bytes=(New-Object Text.UTF8Encoding($false)).GetBytes($text);$f.Write($bytes,0,$bytes.Length)}finally{$f.Dispose()}
   if([IO.File]::ReadAllText($temp,[Text.Encoding]::UTF8) -cne $text){throw 'INTEGRITY_PUBLISH_BYTES'};[IO.File]::Move($temp,(Join-Path $Root ('requests\request-'+$n+'.json')))
   $v=Wait-File ('results\result-'+$n+'.json') 12000;Assert-RecordBinding $v
   $expected=if($n -eq 2){'FIXTURE_FAILED_TREE_CONFIRMED'}else{'FIXTURE_PASS'}
   if($v.status -cne $expected -or $v.sequence -ne $n -or $v.nonce -cne $m.requests[$n-1].nonce -or $v.controller.pid -ne $controller.Id -or $v.controller.creation_ticks -cne $controller.StartTime.Ticks.ToString() -or -not $v.all_instances_ended -or @($v.close_errors).Count -ne 0 -or @($v.capture_set.instances).Count -lt 1){throw 'SAFETY_REQUEST_RESULT'}
   $results+=@($v);$null=Write-Record (Join-Path $Root ('evidence\request-'+$n+'-review.json')) ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;sequence=$n;result_sha256=File-Hash (Join-Path $Root ('results\result-'+$n+'.json'));review='PASS_FIXED_DIAGNOSTIC_EXPECTATION'})
  }
  Signal 'finish.json'
  $final=Wait-File 'evidence\controller-final.json' 10000;Assert-RecordBinding $final;if($final.status -cne 'COMPLETED_FIXED_DIAGNOSTIC' -or $final.requests -ne 3 -or @($final.close_errors).Count){throw 'SAFETY_CONTROLLER_FINAL'}
  foreach($q in $heldQueries){$proofs+=@(Finish-Held $q)}
  if(@($proofs|Where-Object{$_.exit_code -ne 0}).Count){throw 'LIFECYCLE_ENTRY_EXIT_CODE'}
 }catch{$failure=$_.Exception.Message.Substring(0,[Math]::Min(1200,$_.Exception.Message.Length));if($controller -and -not $controller.HasExited -and -not(Test-Path -LiteralPath (Join-Path $Root 'signals\abort.json'))){Signal 'abort.json'}
  foreach($q in $heldQueries){try{$proofs+=@(Finish-Held $q)}catch{$proofs+=@([ordered]@{instance=Instance $q;exit_code='UNKNOWN';exit_ticks='UNKNOWN';held_query_after_exit=$false;error=$_.Exception.Message})}}
 }finally{
  $close=Close-Queries $heldQueries;if($close.Count -and -not $failure){$failure='LIFECYCLE_SUPERVISOR_CLOSE'}
  $task.Enabled=$false;if($task.Enabled -and -not $failure){$failure='SAFETY_TASK_NOT_DISABLED'}
  $null=Write-Record (Join-Path $Root 'evidence\supervisor-final.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;status=if($failure){'FAIL'}else{'DESKTOP_ENTRY_REUSE_DIAGNOSTIC_PASS_NOT_PRODUCT_ADMISSION'};error=$failure;results=@($results|ForEach-Object{@{sequence=$_.sequence;status=$_.status;nonce=$_.nonce}});exit_proofs=$proofs;close_errors=$close;task_disabled=(-not $task.Enabled);product='NOT_PERFORMED';win7='NOT_PERFORMED';finished_at=[DateTime]::UtcNow.ToString('o')})
 }
}catch{$failure=$_.Exception.Message.Substring(0,[Math]::Min(1200,$_.Exception.Message.Length));if($task){try{$task.Enabled=$false}catch{$disableErrors+=@($_.Exception.Message)}};if(-not(Test-Path -LiteralPath (Join-Path $Root 'evidence\supervisor-final.json'))){$null=Write-Record (Join-Path $Root 'evidence\supervisor-final.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;status='FAIL';error=$failure;task_disabled=if($task){-not $task.Enabled}else{'NOT_CREATED'};product='NOT_PERFORMED';win7='NOT_PERFORMED'})}}
finally{
 $outerCloseErrors=Close-ComObjects $com
 if(($outerCloseErrors.Count -or $disableErrors.Count) -and -not $failure){$failure='LIFECYCLE_SUPERVISOR_COM_CLOSE_OR_DISABLE'}
 if($Mode -ceq 'Disable'){$null=Write-Record (Join-Path $Root 'evidence\disable-cleanup.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;com_close_errors=$outerCloseErrors;disable_errors=$disableErrors});if($outerCloseErrors.Count){throw 'LIFECYCLE_DISABLE_COM_CLOSE'}}
 if($Mode -ceq 'Supervise'){$null=Write-Record (Join-Path $Root 'evidence\supervisor-cleanup.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;com_close_errors=$outerCloseErrors;disable_errors=$disableErrors;error=$failure})}
}
[ordered]@{status=if($failure){'FAIL'}else{'DESKTOP_ENTRY_REUSE_DIAGNOSTIC_PASS_NOT_PRODUCT_ADMISSION'};manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;error=$failure}|ConvertTo-Json -Compress
if($failure){exit 1}

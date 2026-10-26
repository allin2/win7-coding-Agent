param([Parameter(Mandatory=$true)][string]$Root,[ValidatePattern('^[a-f0-9]{64}$')][string]$PinSha256,[ValidatePattern('^[a-f0-9]{64}$')][string]$RevisionSha256,[switch]$VerifyOnly,[switch]$PrepareCapture,[ValidatePattern('^[a-f0-9]{32}$')][string]$CompileRunId)

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
Assert-EngineeringExecution 'ADMIN_TOOL_ADMISSION'
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false);$OutputEncoding=[Console]::OutputEncoding
$root=$Root
if($PrepareCapture){throw 'SCOPE_CAPTURE_REBUILD_NOT_AUTHORIZED'

 if($PinSha256 -or $RevisionSha256 -or $VerifyOnly){throw 'INTEGRITY_PREPARE_ARGUMENTS'}
 $approvalPath=Join-Path $root 'inputs\scope-approval.json';if((Get-FileHash -LiteralPath $approvalPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne 'd4947801b67738be45da98606fb2cf6672bacb80f228968b878bcd9d4a22ae2d'){throw 'INTEGRITY_PREPARE_APPROVAL_BYTES'};$approval=Get-Content -LiteralPath $approvalPath -Raw -Encoding UTF8|ConvertFrom-Json
 if($approval.status -cne 'OWNER_APPROVED_EXACT_PRODUCT_R3_WIN10_SCOPE' -or $approval.source -cne '8d207ab11d2c8134a81e4e62900f395aae99944e' -or $approval.contract_sha256 -cne 'da7c6341bbd11878a0e625aa195ada1fc57c822fa9eb16c6a9942ddbb59d4f33'){throw 'INTEGRITY_PREPARE_APPROVAL'}
 if(-not $CompileRunId){throw 'INTEGRITY_PREPARE_RUN_REQUIRED'};if($env:COMPUTERNAME -cne 'WIN-2JQ66JE4HTQ' -or [Environment]::OSVersion.Version.Build -ne 19045){throw 'IDENTITY_PREPARE_HOST'};$compile=Join-Path $root 'compile';$initialSource=Join-Path $root 'inputs\capture-source.cs'
 $ancestor=Get-Item -LiteralPath $compile -Force;while($ancestor){if($ancestor.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)){throw 'INTEGRITY_PREPARE_REPARSE'};$ancestor=if($ancestor -is [IO.DirectoryInfo]){$ancestor.Parent}else{$ancestor.Directory}};if($CompileRunId){
  $compile=Join-Path $compile $CompileRunId;$source=Join-Path $compile 'capture-source.cs'
  if(Test-Path -LiteralPath $compile){$items=@(Get-ChildItem -LiteralPath $compile -Force);if($items.Count -ne 1 -or $items[0].Name -cne 'capture-source.cs' -or $items[0].PSIsContainer){throw 'INTEGRITY_PREPARE_OLD_RUN'}}
  else{$null=[IO.Directory]::CreateDirectory($compile);$bytes=[IO.File]::ReadAllBytes($initialSource);$stream=[IO.File]::Open($source,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}}
 }else{throw 'INTEGRITY_PREPARE_RUN_REQUIRED'}

 $i=Get-Item -LiteralPath $source -Force;while($i){if($i.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)){throw 'INTEGRITY_PREPARE_REPARSE'};$i=if($i -is [IO.DirectoryInfo]){$i.Parent}else{$i.Directory}}
 if((Get-Item -LiteralPath $source).Length -ne 19439 -or (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash.ToLowerInvariant() -cne 'dbc85763ce25287adcb4c853e37963755c56d9561f9d06e41f53bfdb78e952cd'){throw 'INTEGRITY_PREPARE_SOURCE'}
 $utcClock=@{file='C:\Windows\System32\kernel32.dll';size=783720;sha256='4636f65d449b1353100578c6cb139933cf2b134f5e246119d18968873a058bed';version='10.0.19041.5915 (WinBuild.160101.0800)';signature_status='Valid';api='GetSystemTimePreciseAsFileTime';profile='LOCKED_KERNEL32_PRECISE_UTC_FILETIME_V1_TEST_ONLY'};$ci=Get-Item -LiteralPath $utcClock.file -Force;$cs=Get-AuthenticodeSignature -LiteralPath $utcClock.file;if($ci.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint) -or $ci.Length -ne $utcClock.size -or (Get-FileHash -LiteralPath $utcClock.file).Hash.ToLowerInvariant() -cne $utcClock.sha256 -or $ci.VersionInfo.FileVersion -cne $utcClock.version -or $cs.Status.ToString() -cne $utcClock.signature_status){throw 'INTEGRITY_PRECISE_UTC_DLL'}
 $tool='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe';$toolInfo=Get-Item -LiteralPath $tool;$signature=Get-AuthenticodeSignature -LiteralPath $tool;$toolSha=(Get-FileHash -LiteralPath $tool -Algorithm SHA256).Hash.ToLowerInvariant()
 if($toolSha -cne 'aae1db57f898ca8bda18590c56f86ced6d0ead80c22033b76fdfe9119706f116' -or $signature.Status -ne 'Valid' -or $signature.SignerCertificate.Subject -cne 'CN=Microsoft Windows, O=Microsoft Corporation, L=Redmond, S=Washington, C=US'){throw 'INTEGRITY_PREPARE_COMPILER'}
 $refs=@(@{file='mscorlib.dll';size=5445664;sha256='cbba0b14d43901ff3d92cc44efe6a79149bfcaa3006c08ca05e186b2a75b54b5'},@{file='System.dll';size=3541424;sha256='af12577769e3b0c94fc8e4715cdfd21cbcf0f665bf63489f81e5a0934c94c7e4'},@{file='System.Core.dll';size=1551312;sha256='78c77c7250b6e318e69c1162980640bf7da5e8d3303d3abcc32401a52d667139'})
 $framework=Split-Path -Parent $tool;$referenceArgs=@();foreach($ref in $refs){$rp=Join-Path $framework $ref.file;$sig=Get-AuthenticodeSignature -LiteralPath $rp;if($sig.Status -ne 'Valid' -or (Get-Item -LiteralPath $rp).Length -ne $ref.size -or (Get-FileHash -LiteralPath $rp -Algorithm SHA256).Hash.ToLowerInvariant() -cne $ref.sha256){throw 'INTEGRITY_PREPARE_REFERENCE'};$referenceArgs+=('/reference:"'+$rp+'"')}
 if((Get-PSDrive C).Free -lt 2GB){throw 'CAPACITY_PREPARE'}
 $dll=Join-Path $compile 'capture-library.dll';$stdoutPath=Join-Path $compile 'compiler-out.txt';$stderrPath=Join-Path $compile 'compiler-err.txt';$record=Join-Path $compile 'compile-result.json';$temp=Join-Path $compile 'isolated-temp'
 foreach($f in @($dll,$stdoutPath,$stderrPath,$record,$temp)){if(Test-Path -LiteralPath $f){throw 'INTEGRITY_PREPARE_EXISTING_OUTPUT'}};$null=[IO.Directory]::CreateDirectory($temp)
 $arguments='/nologo /noconfig /nostdlib+ /target:library /platform:anycpu /optimize+ /debug- /out:"'+$dll+'" '+($referenceArgs -join ' ')+' "'+$source+'"'
 $r=[ordered]@{schema_version=1;status='CAPTURE_BUILD_FAILED';api_profile='QUERY_LIMITED_INFORMATION_SYNCHRONIZE_SNAPSHOT_PRECISE_UTC_V4';utc_clock=$utcClock;source=$approval.source;scope_approval_sha256=(Get-FileHash -LiteralPath $approvalPath -Algorithm SHA256).Hash.ToLowerInvariant();runtime_profile='WIN10_PS51_NET4_QUERY_HANDLE_CAPTURE_V4_TEST_ONLY';license='Apache-2.0 repository test code; installed Microsoft Framework system license';source_input=@{file='capture-source.cs';size=19439;sha256='dbc85763ce25287adcb4c853e37963755c56d9561f9d06e41f53bfdb78e952cd'};compiler=@{path=$tool;size=$toolInfo.Length;sha256=$toolSha;version=$toolInfo.VersionInfo.FileVersion;signature_status=[string]$signature.Status;signer=$signature.SignerCertificate.Subject};references=$refs;arguments=$arguments;compiler_pid='UNKNOWN';compiler_creation_ticks='UNKNOWN';compiler_exit_code='UNKNOWN';started_at=[DateTime]::UtcNow.ToString('o');finished_at='UNKNOWN';assembly='UNKNOWN';stdout_sha256='UNKNOWN';stderr_sha256='UNKNOWN';preparation_identity=@{sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;user=[Security.Principal.WindowsIdentity]::GetCurrent().Name;session=[Diagnostics.Process]::GetCurrentProcess().SessionId;scope='PREPARATION_NOT_ORDINARY_PRODUCT_EVIDENCE'}}
 $compiler=$null
 try{
  $psi=New-Object Diagnostics.ProcessStartInfo;$psi.FileName=$tool;$psi.Arguments=$arguments;$psi.WorkingDirectory=$compile;$psi.UseShellExecute=$false;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true;$psi.EnvironmentVariables['TEMP']=$temp;$psi.EnvironmentVariables['TMP']=$temp
  $compiler=[Diagnostics.Process]::Start($psi);$null=$compiler.Handle;$r.compiler_pid=$compiler.Id;$r.compiler_creation_ticks=$compiler.StartTime.ToUniversalTime().Ticks;$stdout=$compiler.StandardOutput.ReadToEndAsync();$stderr=$compiler.StandardError.ReadToEndAsync()
  if(-not $compiler.WaitForExit(30000)){throw 'LIFECYCLE_PREPARE_COMPILER_UNKNOWN'};$r.compiler_exit_code=$compiler.ExitCode
  if(-not $stdout.Wait(5000) -or -not $stderr.Wait(5000) -or $stdout.Result.Length -gt 65536 -or $stderr.Result.Length -gt 65536){throw 'SAFETY_PREPARE_CAPTURE'}
  foreach($item in @(@{path=$stdoutPath;text=$stdout.Result},@{path=$stderrPath;text=$stderr.Result})){$stream=[IO.File]::Open($item.path,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$bytes=(New-Object Text.UTF8Encoding($false)).GetBytes($item.text);$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}}
  $r.stdout_sha256=(Get-FileHash -LiteralPath $stdoutPath -Algorithm SHA256).Hash.ToLowerInvariant();$r.stderr_sha256=(Get-FileHash -LiteralPath $stderrPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if($r.compiler_exit_code -ne 0){throw 'INTEGRITY_PREPARE_COMPILE_FAILED'};$info=Get-Item -LiteralPath $dll -Force;if($info.Length -gt 1MB -or $info.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)){throw 'INTEGRITY_PREPARE_DLL'}
  $bytes=[IO.File]::ReadAllBytes($dll);$assembly=[Reflection.Assembly]::Load($bytes);$type=$assembly.GetType('A31Capture',$true,$false);if($assembly.GetName().Name -cne 'capture-library'){throw 'INTEGRITY_PREPARE_DLL_TYPE'}
  if($type.GetField('PreciseUtcClockProfile').GetRawConstantValue() -cne $utcClock.profile -or $type.GetMethod('PreciseUtcTicks').Invoke($null,@()) -le 0){throw 'INTEGRITY_PRECISE_UTC_ENTRY'}
  $r.assembly=@{file='capture-library.dll';size=$info.Length;sha256=(Get-FileHash -LiteralPath $dll -Algorithm SHA256).Hash.ToLowerInvariant();assembly_name=$assembly.GetName().Name;module_version_id=$type.Module.ModuleVersionId.ToString()};$r.status='CAPTURE_BUILD_PASS'
 }finally{
  $r.finished_at=[DateTime]::UtcNow.ToString('o');$stream=[IO.File]::Open($record,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$bytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($r|ConvertTo-Json -Depth 12));$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()};if($compiler){$compiler.Dispose()}
 }
 $r|ConvertTo-Json -Depth 12 -Compress;return
}
if(-not $PinSha256 -or -not $RevisionSha256 -or $CompileRunId){throw 'INTEGRITY_STAGE_ARGUMENTS'}
$f=$script:EngineeringFile;if((Get-FileHash -LiteralPath $f).Hash.ToLowerInvariant() -cne $PinSha256){throw 'INTEGRITY_MASTER_PIN'};$m=Engineering-Master $engineering
foreach($row in $m.scripts){if($row.file -cnotin @('stage-product.ps1','launch-product-desktop.ps1','serve-product-desktop.ps1') -or (Get-FileHash -LiteralPath (Join-Path $script:EngineeringToolRoot $row.file)).Hash.ToLowerInvariant() -cne $row.sha256){throw 'INTEGRITY_FIXED_SCRIPT'}}
. (Join-Path $script:EngineeringToolRoot 'serve-product-desktop.ps1') -Root $root -PinSha256 $PinSha256 -RevisionSha256 $RevisionSha256 -LibraryOnly
if(-not $VerifyOnly -and (Get-PSDrive C).Free -lt 2GB){throw 'CAPACITY_FIRST'}
$master=Assert-Master;$revision=if($VerifyOnly){Invoke-EngineeringJson 'unwrap-revision' @((Join-Path $root ('inputs\revision-'+$RevisionSha256+'.json')),$RevisionSha256)}else{Assert-Revision $RevisionSha256 $master};$dir=Join-Path $script:EngineeringToolRoot ('revisions\'+$RevisionSha256)
foreach($row in $revision.scripts){if($row.file.EndsWith('.ps1')){$t=$null;$e=@();$null=[Management.Automation.Language.Parser]::ParseFile((Join-Path $dir $row.file),[ref]$t,[ref]$e);if($e.Count){throw 'INTEGRITY_PS_PARSE'}}}
$o=[ordered]@{status='PRODUCT_R3_STAGED_FRESH_FULL_CLOSURE_PASS';captured_at=[DateTime]::UtcNow.ToString('o');master_sha256=$PinSha256;revision_sha256=$RevisionSha256;source=$master.source;product_files=784;host_files=@($master.host_files).Count;root_bytes=(Get-ChildItem -LiteralPath $root -File -Recurse -Force|Measure-Object Length -Sum).Sum;execution='NOT_PERFORMED'};New-Json (Join-Path $root ('evidence\stage-'+[Guid]::NewGuid().ToString('N')+'.json')) $o;$o|ConvertTo-Json -Compress

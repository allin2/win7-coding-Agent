# Win10 test components only. Local preparation is never remote authorization.
[CmdletBinding()]
param([Parameter(Mandatory=$true)][string]$ScopeFile,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ScopeSha256)
$ErrorActionPreference='Stop'
function Plain([string]$p){$item=Get-Item -LiteralPath $p -Force;while($item){if($item.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'INTEGRITY_BUILD_REPARSE'};$item=if($item -is [IO.DirectoryInfo]){$item.Parent}else{$item.Directory}}}
function Hash([string]$p){Plain $p;return (Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function Save([string]$p,$v){$bytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($v|ConvertTo-Json -Depth 25)+"`n");$stream=[IO.File]::Open($p,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$stream.Write($bytes,0,$bytes.Length);$stream.Flush()}finally{$stream.Dispose()}}
function Row([string]$p){return @{file=[IO.Path]::GetFileName($p);size=(Get-Item -LiteralPath $p).Length;sha256=Hash $p}}
if($env:COMPUTERNAME -cne 'WIN-2JQ66JE4HTQ' -or [Environment]::OSVersion.Version.Build -ne 19045 -or [IntPtr]::Size -ne 8 -or $PSVersionTable.PSVersion.Major -ne 5 -or $PSVersionTable.PSVersion.Minor -ne 1){throw 'IDENTITY_BUILD_HOST_RUNTIME'}
$root='C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-Engineering-Win10-Entry-20261007-R3'
if($ScopeFile -cnotin @(($root+'\inputs\capture-build-scope.json'),($root+'\inputs\observer-build-scope.json'))){throw 'SCOPE_BUILD_INPUT_FILE'}
if((Hash $ScopeFile) -cne $ScopeSha256){throw 'INTEGRITY_BUILD_SCOPE_BYTES'}
$scope=Get-Content -LiteralPath $ScopeFile -Raw -Encoding UTF8|ConvertFrom-Json
# This check precedes all directory creation, loading and compiler starts.
if($scope.status -cne 'OWNER_APPROVED_FORENSIC_BUILD_ONLY' -or -not $scope.remote_approval -or -not $scope.remote_approval.response -or $scope.product_execution_authorized -ne $false){throw 'SCOPE_REMOTE_BUILD_NOT_APPROVED'}
if($scope.root -cne $root -or $scope.component_id -cnotin @('capture','observer') -or $scope.run_id -cnotmatch '^[a-f0-9]{32}$' -or $scope.build_dir -cne ($root+'\compile\'+$scope.component_id+'-'+$scope.run_id)){throw 'SCOPE_BUILD_DIRECTORY'}
if([IO.Path]::GetFileName($ScopeFile) -cne ($scope.component_id+'-build-scope.json')){throw 'SCOPE_BUILD_COMPONENT_FILE'}
$control=Join-Path $root 'control';$binding=Join-Path $control 'input-binding.cjs';Plain $binding;if((Hash $binding) -cne $scope.validator.sha256 -or (Get-Item -LiteralPath $binding).Length -ne $scope.validator.size){throw 'INTEGRITY_BUILD_VALIDATOR_SOURCE'}
$hostExe=Join-Path $root 'host\electron.exe';if((Hash $hostExe) -cne '2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb'){throw 'INTEGRITY_BUILD_VALIDATOR_HOST'}
# Fixed Node16 CLI consumes the strict schema; no shell or caller-supplied program.
$psi=New-Object Diagnostics.ProcessStartInfo;$psi.FileName=$hostExe;$psi.Arguments='"'+$binding+'" validate-build-scope "'+$ScopeFile+'" '+$ScopeSha256;$psi.UseShellExecute=$false;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true;$psi.StandardOutputEncoding=[Text.Encoding]::UTF8;$psi.StandardErrorEncoding=[Text.Encoding]::UTF8;$psi.EnvironmentVariables['ELECTRON_RUN_AS_NODE']='1';$psi.EnvironmentVariables.Remove('NODE_OPTIONS')
$validator=[Diagnostics.Process]::Start($psi);try{$null=$validator.Handle;$out=$validator.StandardOutput.ReadToEndAsync();$err=$validator.StandardError.ReadToEndAsync();if(-not $validator.WaitForExit(5000)){throw 'LIFECYCLE_BUILD_VALIDATOR_UNKNOWN'};if(-not $out.Wait(1000) -or -not $err.Wait(1000) -or $validator.ExitCode -ne 0 -or $out.Result.Length -gt 65536 -or $err.Result.Length -gt 4096){throw 'INTEGRITY_BUILD_SCOPE_SCHEMA'}}finally{$validator.Dispose()}
if((Hash $PSCommandPath) -cne $scope.bootstrap.sha256 -or (Get-Item -LiteralPath $PSCommandPath).Length -ne $scope.bootstrap.size){throw 'INTEGRITY_BUILD_ENTRY'}
foreach($d in $scope.dependencies){if((Hash $d.path) -cne $d.sha256 -or (Get-Item -LiteralPath $d.path).Length -ne $d.size -or (Get-AuthenticodeSignature -LiteralPath $d.path).Status.ToString() -cne 'Valid'){throw 'INTEGRITY_BUILD_DEPENDENCY'}}
# The unchanged R2 query DLL is a byte-pinned identity bootstrap only, not new component admission.
$tokenDll=$root.Replace('-R3','-R2')+'\inputs\capture-library.dll'
if((Hash $tokenDll) -cne '3f45cc66e7f81c7321bdce4b71338614ceae618d9c0636620a0f47b72d880064'){throw 'INTEGRITY_BUILD_TOKEN_BOOTSTRAP'}
$tokenAssembly=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($tokenDll));$tokenType=$tokenAssembly.GetType('A31Capture',$true,$false);if($tokenType.Module.ModuleVersionId.ToString() -cne 'ba25f945-5351-4b90-8ed8-4c8a5f1cfe08'){throw 'INTEGRITY_BUILD_TOKEN_MVID'}
$self=[Diagnostics.Process]::GetCurrentProcess();$method=$tokenType.GetMethod('Token',[type[]]@([Diagnostics.Process]));$identity=$method.Invoke($null,@($self))
if($identity.Sid -cne 'S-1-5-21-3031939772-989444280-3099258187-500' -or $identity.Session -ne 0 -or $identity.Rid -ne 12288 -or -not $identity.Elevated -or $identity.Ordinary -or $identity.ElevationType -ne 1){throw 'IDENTITY_BUILD_PREPARATION_REQUIRED'}
$source=Join-Path $control $scope.source_snapshot.file;if((Hash $source) -cne $scope.source_snapshot.sha256 -or (Get-Item -LiteralPath $source).Length -ne $scope.source_snapshot.size){throw 'INTEGRITY_BUILD_SOURCE'}
$dir=$scope.build_dir;Plain (Split-Path -Parent $dir);if(Test-Path -LiteralPath $dir){throw 'LIFECYCLE_BUILD_RUN_NOT_FRESH'}
if((Get-PSDrive C).Free -lt 2GB){throw 'CAPACITY_BUILD'};$null=[IO.Directory]::CreateDirectory($dir)
foreach($input in @(@{path=$source;name=$scope.source_snapshot.file},@{path=$PSCommandPath;name='build-forensic-components.ps1'},@{path=$ScopeFile;name=($scope.component_id+'-build-scope.json')})){$stream=[IO.File]::Open((Join-Path $dir $input.name),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$bytes=[IO.File]::ReadAllBytes($input.path);$stream.Write($bytes,0,$bytes.Length)}finally{$stream.Dispose()}}
$artifactName=if($scope.component_id -ceq 'capture'){'capture-library.dll'}else{'manifest-process-observer.exe'};$target=if($scope.component_id -ceq 'capture'){'library'}else{'winexe'}
$references=@($scope.dependencies|Where-Object{$_.file -cin @('mscorlib.dll','System.dll','System.Core.dll')}|ForEach-Object{'/reference:"'+$_.path+'"'})
$arguments='/nologo /noconfig /nostdlib+ /utf8output /target:'+$target+' /platform:x64 /optimize+ /debug- /out:"'+(Join-Path $dir $artifactName)+'" '+($references -join ' ')+' "'+(Join-Path $dir $scope.source_snapshot.file)+'"'
$r=[ordered]@{schema_version=1;status='FORENSIC_BUILD_FAILED';build_kind='INDEPENDENT_ENGINEERING_02_FORENSIC_V3';component_id=$scope.component_id;scope_sha256=$ScopeSha256;bootstrap_sha256=$scope.bootstrap.sha256;tool_source_head=$scope.source_head;origin_snapshot=$scope.origin_snapshot;source_snapshot=$scope.source_snapshot;artifact='UNKNOWN';dependencies=$scope.dependencies;arguments=$arguments;compiler_pid='UNKNOWN';compiler_creation_ticks='UNKNOWN';compiler_exit_code='UNKNOWN';started_at=[DateTime]::UtcNow.ToString('o');finished_at='UNKNOWN';self_test_cases='NOT_PERFORMED';output_rows=@();identity=$identity}
$compiler=$null
try{
 $temp=Join-Path $dir 'isolated-temp';$null=[IO.Directory]::CreateDirectory($temp)
 $psi=New-Object Diagnostics.ProcessStartInfo;$psi.FileName=($scope.dependencies|Where-Object{$_.file -ceq 'csc.exe'}).path;$psi.Arguments=$arguments;$psi.WorkingDirectory=$dir;$psi.UseShellExecute=$false;$psi.RedirectStandardOutput=$true;$psi.RedirectStandardError=$true;$psi.StandardOutputEncoding=[Text.Encoding]::UTF8;$psi.StandardErrorEncoding=[Text.Encoding]::UTF8;$psi.EnvironmentVariables['TEMP']=$temp;$psi.EnvironmentVariables['TMP']=$temp
 $compiler=[Diagnostics.Process]::Start($psi);$null=$compiler.Handle;$r.compiler_pid=$compiler.Id;$r.compiler_creation_ticks=$compiler.StartTime.ToUniversalTime().Ticks.ToString();$out=$compiler.StandardOutput.ReadToEndAsync();$err=$compiler.StandardError.ReadToEndAsync()
 if(-not $compiler.WaitForExit(30000)){throw 'LIFECYCLE_BUILD_COMPILER_UNKNOWN'};$r.compiler_exit_code=$compiler.ExitCode
 $drain=[Diagnostics.Stopwatch]::StartNew();if(-not $out.Wait(1000)){throw 'LIFECYCLE_BUILD_DRAIN_UNKNOWN'};$remaining=[Math]::Max(0,1000-[int]$drain.ElapsedMilliseconds);if(-not $err.Wait($remaining) -or $out.Result.Length -gt 65536 -or $err.Result.Length -gt 65536){throw 'SAFETY_BUILD_OUTPUT'}
 foreach($item in @(@{name='compiler-out.json';text=$out.Result},@{name='compiler-err.json';text=$err.Result})){Save (Join-Path $dir $item.name) @{text=$item.text};$r.output_rows+=@(Row (Join-Path $dir $item.name))}
 if($r.compiler_exit_code -ne 0){throw 'INTEGRITY_BUILD_COMPILER_EXIT'}
 if((Hash (Join-Path $dir $scope.source_snapshot.file)) -cne $scope.source_snapshot.sha256 -or (Hash $source) -cne $scope.source_snapshot.sha256){throw 'INTEGRITY_BUILD_SOURCE_DRIFT'};foreach($d in $scope.dependencies){if((Hash $d.path) -cne $d.sha256){throw 'INTEGRITY_BUILD_DEPENDENCY_DRIFT'}}
 $artifact=Join-Path $dir $artifactName;Plain $artifact;if((Get-Item -LiteralPath $artifact).Length -gt 1MB){throw 'INTEGRITY_BUILD_ARTIFACT_SIZE'}
 $assembly=[Reflection.Assembly]::Load([IO.File]::ReadAllBytes($artifact));$type=$assembly.GetType($(if($scope.component_id -ceq 'capture'){'A31Capture'}else{'A31ManifestObserver'}),$true,$false)
 if($scope.component_id -ceq 'capture'){
  if($type.GetField('ApiContract').GetRawConstantValue() -cne 'QUERY_LIMITED_INFORMATION_SYNCHRONIZE_SNAPSHOT_PRECISE_UTC_V5'){throw 'INTEGRITY_BUILD_CAPTURE_PROFILE'}
  $query=$type.GetMethod('OpenQuery').Invoke($null,@($self.Id));try{if($query.Id -ne $self.Id -or $query.StartTime.ToUniversalTime().Ticks -ne $self.StartTime.ToUniversalTime().Ticks -or $query.SessionId -ne 0 -or $query.RequestedAccess -ne 1052672 -or $type.GetMethod('PreciseUtcTicks').Invoke($null,@()) -le 0){throw 'INTEGRITY_BUILD_CAPTURE_SELF_QUERY'}}finally{$query.Dispose()};$r.self_test_cases=1
 }else{if($type.GetField('ApiProfile').GetRawConstantValue() -cne 'MANIFEST_PROCESS_GENERATIONS_V2_TEST_ONLY'){throw 'INTEGRITY_BUILD_OBSERVER_PROFILE'};$r.self_test_cases=$type.GetMethod('SelfTest').Invoke($null,@());if($r.self_test_cases -ne 43){throw 'INTEGRITY_BUILD_OBSERVER_SELF_TEST'}}
 $row=Row $artifact;$r.artifact=@{file=$row.file;size=$row.size;sha256=$row.sha256;mvid=$type.Module.ModuleVersionId.ToString()};$r.status='FORENSIC_BUILD_AND_SELF_TEST_PASS_NOT_ADMISSION'
}finally{
 $r.finished_at=[DateTime]::UtcNow.ToString('o');Save (Join-Path $dir ($scope.component_id+'-build.json')) $r
 if($compiler){$compiler.Dispose()}
}
$r|ConvertTo-Json -Depth 25 -Compress

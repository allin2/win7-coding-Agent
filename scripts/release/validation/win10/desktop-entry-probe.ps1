param([Parameter(Mandatory=$true)][string]$Root,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ManifestSha256)
# Apache-2.0. Fixed diagnostic controller. Expected exit17 is preserved as FAIL, never product admission.
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
# Pin handshake precedes dependency loading; the supervisor retains this exact process before initialization continues.
$early=[Diagnostics.Process]::GetCurrentProcess();$null=$early.Handle
$prefix='C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-Engineering02-DesktopEntryProbe-20261008-'
if($Root -cnotin @(($prefix+'R3'))){throw 'SCOPE_EARLY_ROOT'}
$earlyRecord=[ordered]@{manifest_sha256=$ManifestSha256;instance=@{pid=$early.Id;creation_ticks=$early.StartTime.ToUniversalTime().Ticks.ToString();session=$early.SessionId}}
$earlyBytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($earlyRecord|ConvertTo-Json -Compress));$earlyFile=[IO.File]::Open((Join-Path $Root 'evidence\controller-observed.json'),[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read)
try{$earlyFile.Write($earlyBytes,0,$earlyBytes.Length)}finally{$earlyFile.Dispose()}
$earlyUntil=[DateTime]::UtcNow.AddSeconds(30);while(-not [IO.File]::Exists((Join-Path $Root 'signals\controller-observed-pinned.json'))){if([DateTime]::UtcNow -ge $earlyUntil){throw 'LIFECYCLE_EARLY_PIN_UNKNOWN'};Start-Sleep -Milliseconds 50};$early.Dispose()
$manifestPath=Join-Path $Root 'inputs\manifest.json'
if((Get-FileHash -LiteralPath $manifestPath).Hash.ToLowerInvariant() -cne $ManifestSha256){throw 'INTEGRITY_MANIFEST_HASH'}
$initial=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8|ConvertFrom-Json
$library=Join-Path $Root 'control\start-desktop-entry-probe.ps1';$row=@($initial.files|Where-Object{$_.file -ceq 'control\start-desktop-entry-probe.ps1'})
if($row.Count -ne 1 -or (Get-FileHash -LiteralPath $library).Hash.ToLowerInvariant() -cne $row[0].sha256 -or $PSScriptRoot -cne (Join-Path $Root 'control')){throw 'INTEGRITY_LIBRARY_ENTRY'}
. $library -Mode Library -Root $Root -ManifestSha256 $ManifestSha256
$m=Read-ApprovedManifest;Assert-Signal 'controller-observed-pinned.json';Load-Capture;Assert-Explorer;Import-ProofFunctions
$self=[Diagnostics.Process]::GetCurrentProcess();$selfHeld=$null;$parentQuery=$null;$failure=$null;$results=@();$closeErrors=@();$deadline=[DateTime]::UtcNow.AddMinutes(15)
function Invoke-FixedFixture($request,$controller,$selfHeld){
 $n=[int]$request.sequence;$dir=Join-Path $Root ('results\fixture-'+$n);if(Test-Path -LiteralPath $dir){throw 'INTEGRITY_EXISTING_FIXTURE'};Assert-Plain (Split-Path -Parent $dir);$null=New-Item -ItemType Directory -Path $dir
 $expectedExit=if($n -eq 2){17}else{0};$marker='A9-DESKTOP-ENTRY:'+$request.case+':'+$request.nonce
 $fixture=@'
$ProgressPreference='SilentlyContinue';[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
$f=[IO.File]::Open('@@DIR@@\ready.txt',[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::Read);try{$b=[Text.Encoding]::UTF8.GetBytes('ready');$f.Write($b,0,$b.Length)}finally{$f.Dispose()}
$until=[DateTime]::UtcNow.AddSeconds(8);while(-not [IO.File]::Exists('@@DIR@@\release.json')){if([DateTime]::UtcNow -ge $until){exit 9};Start-Sleep -Milliseconds 10}
[Console]::Write('@@MARKER@@');exit @@EXIT@@
'@
 $fixture=$fixture.Replace('@@DIR@@',$dir).Replace('@@MARKER@@',$marker).Replace('@@EXIT@@',[string]$expectedExit)
 $pi=New-Object Diagnostics.ProcessStartInfo;$pi.FileName='C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe';$pi.Arguments='-NoProfile -NonInteractive -EncodedCommand '+[Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($fixture));$pi.UseShellExecute=$false;$pi.CreateNoWindow=$true;$pi.RedirectStandardOutput=$true;$pi.RedirectStandardError=$true;$pi.StandardOutputEncoding=New-Object Text.UTF8Encoding($false);$pi.StandardErrorEncoding=New-Object Text.UTF8Encoding($false)
 $owned=$null;$ownedHeld=$null;$capture=$null;$captureSet=$null;$queries=@();$close=@();$errorText=$null;$stdout=$null;$stderr=$null;$allEnded=$false;$budget=[Diagnostics.Stopwatch]::StartNew()
 try{
  $owned=[Diagnostics.Process]::Start($pi);$null=$owned.Handle;$out=$owned.StandardOutput.ReadToEndAsync();$err=$owned.StandardError.ReadToEndAsync();$ownedHeld=[A31Capture]::Pin($owned,$selfHeld.Pid);$queries+=@($ownedHeld.Process);Assert-Ordinary ([A31Capture]::Token($ownedHeld.Process))
  $child=[ordered]@{pid=$owned.Id;creation_ticks=$ownedHeld.CreationTicks.ToString();session=$ownedHeld.Session;image=$ownedHeld.Process.ImagePath};$context=@{parent=$controller}
  while(-not(Test-Path -LiteralPath (Join-Path $dir 'ready.txt'))){if($owned.HasExited -or $budget.ElapsedMilliseconds -ge 8000){throw 'LIFECYCLE_FIXTURE_READY_UNKNOWN'};Start-Sleep -Milliseconds 10}
  $capture=[A31Capture]::Capture(@($selfHeld));foreach($h in $capture.Added){$queries+=@($h.Process)}
  $null=Write-Record (Join-Path $Root ('evidence\capture-'+$n+'.json')) ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;sequence=$n;controller=$controller;added=@($capture.Added|ForEach-Object{Capture-DiagnosticAdded $_});gaps=@($capture.Gaps|ForEach-Object{Capture-DiagnosticGap $_});excluded=@($capture.Excluded|ForEach-Object{Capture-DiagnosticExcluded $_})})
  $captureSet=Get-OrdinaryCaptureSet $capture $context $child
  foreach($row in $captureSet.instances){
   $h=@($capture.Added|Where-Object{$_.Pid -eq $row.pid})[0];Assert-Ordinary ([A31Capture]::Token($h.Process))
   if($row.kind -ceq 'powershell'){[A31Capture]::AssertSameInstance($ownedHeld.Process,$h.Process,$row.pid,[long]$row.creation_ticks,$row.session,$row.image)}else{$check=[A31Capture]::OpenQuery($row.pid);try{[A31Capture]::AssertSameInstance($h.Process,$check,$row.pid,[long]$row.creation_ticks,$row.session,$row.image)}finally{$check.Dispose()}};$row.same_instance=$true
  }
  if($budget.ElapsedMilliseconds -ge 8000){throw 'LIFECYCLE_FIXTURE_BUDGET'}
  $null=Write-Record (Join-Path $dir 'release.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;sequence=$n;pid=$child.pid;creation_ticks=$child.creation_ticks})
  foreach($row in $captureSet.instances){
   $h=@($capture.Added|Where-Object{$_.Pid -eq $row.pid})[0];if(-not $h.Process.WaitForExit([Math]::Max(0,8000-[int]$budget.ElapsedMilliseconds))){throw 'LIFECYCLE_CAPTURE_SET_EXIT_UNKNOWN'}
   $row.exit_code=$h.Process.ReadExitCode();$row.exit_ticks=$h.Process.ReadExitTime().ToUniversalTime().Ticks.ToString();$row.held_query_after_exit=$true;$expected=if($row.kind -ceq 'powershell'){$expectedExit}else{0}
   if($row.exit_code -ne $expected -or [long]$row.exit_ticks -lt [long]$row.proof.query_ticks){throw 'LIFECYCLE_CAPTURE_SET_EXIT_INVALID'}
  }
  if(-not $owned.WaitForExit(0) -or -not $out.Wait([Math]::Max(0,[Math]::Min(1000,8000-[int]$budget.ElapsedMilliseconds))) -or -not $err.Wait([Math]::Max(0,[Math]::Min(1000,8000-[int]$budget.ElapsedMilliseconds))) -or $budget.ElapsedMilliseconds -ge 8000){throw 'LIFECYCLE_FIXTURE_DRAIN_UNKNOWN'}
  $stdout=Get-ChildStreamDiagnostic $out;$stderr=Get-ChildStreamDiagnostic $err
  if($out.Result.Length -gt 4096 -or $err.Result.Length -gt 4096){throw 'OUTPUT_LIMIT'};if($err.Result.Length){throw 'OWN_CHILD_STDERR'};if($out.Result -cne $marker){throw 'INTEGRITY_FIXED_MARKER'}
  if($budget.ElapsedMilliseconds -ge 8000){throw 'LIFECYCLE_FIXTURE_BUDGET'};$allEnded=$true
 }catch{$errorText=$_.Exception.Message.Substring(0,[Math]::Min(1200,$_.Exception.Message.Length))}
 finally{$close=Close-Queries $queries;if($owned){try{$owned.Dispose()}catch{$close+=@($_.Exception.Message)}};if($close.Count -and -not $errorText){$errorText='LIFECYCLE_FIXTURE_CLOSE'}}
 $v=[ordered]@{schema_version=1;manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;sequence=$n;case=$request.case;nonce=$request.nonce;controller=$controller;status=if($errorText){'HALTED'}elseif($expectedExit -eq 17){'FIXTURE_FAILED_TREE_CONFIRMED'}else{'FIXTURE_PASS'};failure=if($expectedExit -eq 17){'PRESET_OWNED_FIXTURE_EXIT_17'}else{$null};error=$errorText;expected_exit=$expectedExit;capture_set=$captureSet;stdout=$stdout;stderr=$stderr;all_instances_ended=$allEnded;close_errors=$close;shared_budget_ms=$budget.ElapsedMilliseconds;level='WIN10_ORDINARY_FIXED_DIAGNOSTIC_NOT_ADMISSION'}
 $null=Write-Record (Join-Path $Root ('results\result-'+$n+'.json')) $v
 if($expectedExit -eq 17 -and -not $errorText){$null=Write-Record (Join-Path $Root 'evidence\first-failure.json') $v}
 if($errorText){$null=Write-Record (Join-Path $Root 'evidence\unexpected-first-failure.json') $v;throw $errorText};return $v
}
try{
 $snapshot=@([A31Capture]::Snapshot());$selfRow=@($snapshot|Where-Object{$_.Pid -eq $self.Id});if($selfRow.Count -ne 1){throw 'IDENTITY_CURRENT_PARENT'}
 $parentQuery=[A31Capture]::OpenQuery($selfRow[0].Parent);Assert-Ordinary ([A31Capture]::Token($parentQuery));if($parentQuery.ImagePath -inotmatch '^\\Device\\HarddiskVolume[0-9]+\\Windows\\System32\\cmd\.exe$'){throw 'IDENTITY_PARENT_IMAGE'}
 $parentRow=@($snapshot|Where-Object{$_.Pid -eq $parentQuery.Id});if($parentRow.Count -ne 1 -or $parentRow[0].Parent -ne $m.explorer.pid -or $parentQuery.StartTime.Ticks -le [long]$m.explorer.creation_ticks -or $self.StartTime.ToUniversalTime().Ticks -le $parentQuery.StartTime.Ticks){throw 'IDENTITY_EXPLORER_ANCESTRY'}
 $selfHeld=[A31Capture]::Pin($self,$parentQuery.Id);Assert-Ordinary ([A31Capture]::Token($selfHeld.Process));$controller=Instance $selfHeld.Process
 $null=Write-Record (Join-Path $Root 'evidence\controller-start.json') ([ordered]@{schema_version=1;manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;instance=$controller;identity=[A31Capture]::Token($selfHeld.Process);console_parent=Instance $parentQuery;console_parent_identity=[A31Capture]::Token($parentQuery);explorer=$m.explorer;chain=@(@{child=$controller;parent=Instance $parentQuery},@{child=Instance $parentQuery;parent=$m.explorer});deadline_at=$deadline.ToString('o')})
 $null=Wait-File 'signals\controller-pinned.json' 30000;Assert-Signal 'controller-pinned.json'
 $used=@{};for($n=1;$n -le 3;$n++){
  $file=Join-Path $Root ('requests\request-'+$n+'.json')
  while(-not(Test-Path -LiteralPath $file)){if(Test-Path -LiteralPath (Join-Path $Root 'signals\abort.json')){Assert-Signal 'abort.json';throw 'SCOPE_ABORTED'};if([DateTime]::UtcNow -ge $deadline){throw 'LIFECYCLE_CONTROLLER_WINDOW'};Start-Sleep -Milliseconds 50}
  $null=Read-ApprovedManifest;Assert-Explorer;Assert-Ordinary ([A31Capture]::Token($selfHeld.Process));$text=[IO.File]::ReadAllText($file,[Text.Encoding]::UTF8);$request=Assert-Request $text $n
  if($used.ContainsKey($request.nonce)){throw 'INTEGRITY_DUPLICATE_NONCE'};$used[$request.nonce]=$true
  $results+=@(Invoke-FixedFixture $request $controller $selfHeld)
 }
 while(-not(Test-Path -LiteralPath (Join-Path $Root 'signals\finish.json'))){if(Test-Path -LiteralPath (Join-Path $Root 'signals\abort.json')){Assert-Signal 'abort.json';throw 'SCOPE_ABORTED'};if([DateTime]::UtcNow -ge $deadline){throw 'LIFECYCLE_CONTROLLER_WINDOW'};Start-Sleep -Milliseconds 50};Assert-Signal 'finish.json'
}catch{$failure=$_.Exception.Message.Substring(0,[Math]::Min(1200,$_.Exception.Message.Length))}
finally{
 $queries=@($parentQuery);if($selfHeld){$queries+=@($selfHeld.Process)};$closeErrors=Close-Queries $queries;try{$self.Dispose()}catch{$closeErrors+=@($_.Exception.Message)};if($closeErrors.Count -and -not $failure){$failure='LIFECYCLE_CONTROLLER_CLOSE'}
 $null=Write-Record (Join-Path $Root 'evidence\controller-final.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;status=if($failure){'HALTED'}else{'COMPLETED_FIXED_DIAGNOSTIC'};requests=$results.Count;result_statuses=@($results|ForEach-Object{$_.status});error=$failure;close_errors=$closeErrors;finished_at=[DateTime]::UtcNow.ToString('o');product='NOT_PERFORMED';win7='NOT_PERFORMED'})
}
if($failure){exit 1};exit 0

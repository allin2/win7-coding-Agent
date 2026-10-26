param([Parameter(Mandatory=$true)][string]$Root)
# Apache-2.0. Own Phase A fixture for the ordinary-entry bridge. It walks the same ancestor chain as the ordinary admission harness; no admission, no product.
$ErrorActionPreference='Stop';$ProgressPreference='SilentlyContinue'
$prefix='C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-Engineering02-OrdinaryBridge-20261008-'
if($Root -cnotin @(($prefix+'A1'),($prefix+'A2'))){throw 'SCOPE_FIXTURE_ROOT'}
if($PSScriptRoot -cne (Join-Path $Root 'control')){throw 'INTEGRITY_FIXTURE_PATH'}
$manifestPath=Join-Path $Root 'inputs\manifest.json'
$ManifestSha256=(Get-FileHash -LiteralPath $manifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
$initial=Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8|ConvertFrom-Json
$bridge=Join-Path $Root 'control\start-ordinary-entry-bridge.ps1';$row=@($initial.files|Where-Object{$_.file -ceq 'control\start-ordinary-entry-bridge.ps1'})
if($row.Count -ne 1 -or (Get-FileHash -LiteralPath $bridge -Algorithm SHA256).Hash.ToLowerInvariant() -cne $row[0].sha256){throw 'INTEGRITY_BRIDGE_ENTRY'}
. $bridge -Mode Library -Root $Root -ManifestSha256 $ManifestSha256
$m=Read-BridgeManifest;Load-Capture;Assert-Explorer
$self=[Diagnostics.Process]::GetCurrentProcess();$null=$self.Handle
$identity=[A31Capture]::Token($self);Assert-Ordinary $identity
# The same execution-policy facts the ordinary admission harness requires.
$machinePolicy=[string](Microsoft.PowerShell.Security\Get-ExecutionPolicy -Scope MachinePolicy);$userPolicy=[string](Microsoft.PowerShell.Security\Get-ExecutionPolicy -Scope UserPolicy)
$processPolicy=[string](Microsoft.PowerShell.Security\Get-ExecutionPolicy -Scope Process);$effectivePolicy=[string](Microsoft.PowerShell.Security\Get-ExecutionPolicy)
if($machinePolicy -cne 'Undefined' -or $userPolicy -cne 'Undefined'){throw 'SCOPE_FIXTURE_GROUP_POLICY'}
if($processPolicy -cne 'RemoteSigned' -or $effectivePolicy -cne 'RemoteSigned'){throw 'SCOPE_FIXTURE_EXECUTION_POLICY'}
# Ancestor walk with the same rules as the ordinary admission harness: same SID and session, alive, cmd/powershell/explorer images only.
$rows=@([A31Capture]::Snapshot());$selfInstance=[ordered]@{pid=$self.Id;creation_ticks=$self.StartTime.ToUniversalTime().Ticks.ToString();session=$self.SessionId}
$child=$selfInstance;$chain=@();$found=$false;$explorer=$null
for($n=0;$n -lt 8;$n++){
 $r=@($rows|Where-Object{$_.Pid -eq $child.pid});if($r.Count -ne 1 -or $r[0].Parent -le 0){throw 'IDENTITY_ANCESTOR_UNKNOWN'}
 $p=[Diagnostics.Process]::GetProcessById($r[0].Parent)
 try{
  $null=$p.Handle;$pp=[ordered]@{pid=$p.Id;creation_ticks=$p.StartTime.ToUniversalTime().Ticks.ToString();session=$p.SessionId};$token=[A31Capture]::Token($p);$image=$p.MainModule.FileName
  if($p.HasExited -or $token.Sid -cne $identity.Sid -or $p.SessionId -ne $self.SessionId){throw 'IDENTITY_ANCESTOR_INSTANCE'}
  $chain+=@([ordered]@{child=$child;parent=$pp})
  if($image -ieq 'C:\Windows\explorer.exe'){$explorer=$pp;$found=$true;break}
  if($image -inotmatch '^C:\\Windows\\System32\\(cmd\.exe|WindowsPowerShell\\v1\.0\\powershell\.exe)$'){throw 'IDENTITY_ANCESTOR_IMAGE'}
  $child=$pp
 }finally{$p.Dispose()}
}
if(-not $found -or $chain.Count -ne 2 -or $explorer.pid -ne $m.explorer.pid -or $explorer.creation_ticks -cne $m.explorer.creation_ticks){throw 'IDENTITY_EXPLORER_ANCESTOR_REQUIRED'}
$null=Write-Record (Join-Path $Root 'evidence\fixture-observed.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;self=$selfInstance;identity=$identity;chain=$chain;policy=[ordered]@{machine=$machinePolicy;user=$userPolicy;process=$processPolicy;effective=$effectivePolicy}})
# Stay alive until the supervisor holds this instance, its console parent and their consoles.
$until=[DateTime]::UtcNow.AddSeconds(30)
while(-not [IO.File]::Exists((Join-Path $Root 'signals\fixture-pinned.json'))){
 if([IO.File]::Exists((Join-Path $Root 'signals\abort.json'))){throw 'LIFECYCLE_FIXTURE_ABORTED'}
 if([DateTime]::UtcNow -ge $until){throw 'LIFECYCLE_FIXTURE_PIN_UNKNOWN'};Start-Sleep -Milliseconds 50
}
Assert-Signal 'fixture-pinned.json'
$null=Write-Record (Join-Path $Root 'evidence\fixture-final.json') ([ordered]@{manifest_sha256=$ManifestSha256;experiment_id=$m.experiment_id;status='FIXTURE_CHAIN_OK_NOT_ADMISSION';product='NOT_PERFORMED';win7='NOT_PERFORMED'})
exit 0

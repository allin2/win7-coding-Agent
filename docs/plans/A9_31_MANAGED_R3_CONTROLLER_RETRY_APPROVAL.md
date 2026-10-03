# A9-31 managed r3 控制器 R2 启动修复补批材料

```text
Status: DRAFT_PENDING_CONTROLLER_REVIEW_AND_OWNER_APPROVAL
Branch: codex/a9-31-background-tools
Current HEAD: a0042d014c342856b96c09509865389bb441211f
Native source: 10114503a1e79706131ea4a11a5b96bd2958807a
Native kit: 0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1
Native build: NOT_PERFORMED
```

## 事实与最小修复

11:06 首轮 CreateProcessW（flags=0x01000010）返回 code 5；原 launch JSON 哈希
c7a5b14ffffde3cd67175ddbc17f1c13b811f4ccb189a6174b30232c8973e4ea。重复运行被旧记录阻断。
12:23 只读查询确认 WorkBuddy 及其子进程处于 Host Job，桌面 CMD PID6832、Explorer PID32136
及旧 A9-30 控制器不在 Job。首轮 Windows PowerShell 400 事件含相邻 CodeBuddy 包装命令；
失败父进程已退出、未记录 Job，历史根因仍为推断，不能把当前查询改绑为首轮身份。

R2 先在调用者同进程执行批准 build.ps1 的 TestBuildIdentityOnly，记录完整令牌/Job、SID、Session、PID和启动时间。
若普通角色/Medium/非提升/无 Job 不满足，停止，不创建子进程。通过后只用 CREATE_NEW_CONSOLE=16；
不请求 breakaway、不调整 Job、不提升权限。原 server/worker 再检查子进程身份后才接受原 BuildA/B。
先失败也保留读出的 caller_identity（捕获原 TestBuildIdentityOnly 输出后再传播 throw）。
保留原 launch JSON；新记录仅 managed-r3-controlled-launch-r2.json，CreateNew/独占写入，不覆盖。
原六控制、23文件 ZIP、两个构建目录与四 v1 fixture 范围均不改变。

## 精确补充路径与动作

本文件只含可审阅草稿，尚未提取或部署以下新脚本，不声称实现/独立复核通过。
请求补充本地实施路径：

- `.acceptance/a9-31-developer/native-kit-r3/control-scripts/launch-managed-r3-controlled-build-r2.ps1`
- `.acceptance/a9-31-developer/native-kit-r3/dispatch-and-collect-r2.py`

拟追加本地登记提交仅四路径：

- `release/win7-product-v3/a9-v26-approved-build-kits.json`：只追加顶层 controller_retries 项；kits 数组逐项保持。
- `docs/plans/A9_31_MANAGED_R3_CONTROLLER_RETRY_APPROVAL.md`（本文件）
- `docs/DECISIONS.md`：仅追加 ADR-0157；批准前保持 Proposed。
- `docs/reports/2026-10/a9_31_managed_r3_controller_r2_independent_review_2026-10-03.md`（复核通过后据事实形成）

请求使用现有 gpt-6-luna/high 只读复核人复核本文件草稿与调度补丁；不由实现方自签。
通过后提取准确 R2 字节、登记准确哈希与独立报告，追加上述四路径本地提交（不推送/合并）。
新登记 HEAD 必须通过原 verify-managed-r3-registry-head.py，并对新增 R2 元数据与报告 blob 另做准确 HEAD 校验。

远端仍限 Win10 192.168.1.4 / WIN-2JQ66JE4HTQ / SID1005 / Session3，批准的新写入仅：

- `D:\A9-A31-V26-MANAGED-20261003\control\launch-managed-r3-controlled-build-r2.ps1`
- `D:\A9-A31-V26-MANAGED-20261003\control\managed-r3-controller-r2-independent-review.md`
- `D:\A9-A31-V26-MANAGED-20261003\control\managed-r3-approved-registry-a0042d014c342856b96c09509865389bb441211f.json`：先 CreateNew 保存当前 registry 精确字节/哈希，再更新原 managed-r3-approved-registry.json 为新 HEAD 快照。
- `D:\A9-A31-V26-MANAGED-20261003\control\managed-r3-controlled-launch-r2.json`：启动结果；无其他新结果名。

原 launch JSON 不移动、不删除、不覆盖；原六输入不改。传输后逐项哈希、完整 PS5.1 ParseFile，再从普通桌面启动 R2。
同令牌同 Session 的新控制器实际通过普通身份门后，才用原固定 BuildA/B 两请求，60分钟。
失效身份、完整性或生命周期未知立即停止。脚本退出/身份门失败不自动重试，不恢复旧控制器。
不改变原两构建目录/ACL、账户/profile/许可证/服务/Job/UAC，不增加原生源码或新 native ZIP。

## 输入哈希与登记草稿

以下 PowerShell fence 内字节按 UTF-8 无 BOM、LF，末尾一个 LF 提取：
SHA-256 `14cc77765d4149d6c87f7cc3362ff733c37f31ed2671d8c6c951257b072dba45`，size `14330` bytes。
controller_retries 项至少绑定上述 source/kit、ID A9-31-managed-r3-controller-r2、launcher 文件/尺寸/哈希、
creation_flags=16、caller_requires_no_host_job=true、launch_record_file、retained_failure_sha256、
request_limit=2、validity_minutes=60 和实际独立复核 report_sha256/独立角色/P0/P1/P2。
批准前状态 DRAFT_PENDING_REVIEW_AND_OWNER_APPROVAL；仅负责人具体批准与复核通过后可记
APPROVED_FOR_CONTROLLED_BUILD_LAUNCH。无占位批准或报告哈希进入正式登记。

## 调度补丁合同

R2 Python 调度器引用原脚本 head/dispatch/collect 的已验证逻辑，保存新原生登记绑定到
controller-r2-registry-head-binding.json，不覆盖原 registry-head-binding.json。
只读快照同时返回原 launch 和 R2 launch；原 launch 必须仍为准确 SHA/FAIL/code5/NOT_PERFORMED，
仅作为 RETAINED_FIRST_FAILURE。不能泛化忽略 FAIL；R2/Probe/server/worker 的任何新 FAIL 均停止。
launcher 记录未写完（独占句柄或长度0）只允许等待，不派发。R2 成功必须绑定 source/kit/新 HEAD+registrySHA、
caller 与 controller SID1005/Session3、完整 Medium/非提升/无 Job、controller 实际 PID/创建时间，旧 PID不可替代。
仍拒绝既有请求，严格 A→B，B 要求 A 成功；保存 R2 轮次的新观察记录，原记录不改绑。
失败先回收有无 native result 的对应诊断，不因缺少 result 目录掩盖 pre-build worker FAIL。
两正式返回包原回收逻辑与哈希复核沿用，不自行重锁/签收口。

## 验证清单

- 原六控制和 native ZIP/23文件精确哈希继承；不重跑产品全量测试。
- 本草稿在实际 Win10 PS5.1 全文本 ParseInput；部署后完整 ParseFile。
- caller 正例及管理员/提升/非 Medium/缺失 Job/已在 Job/错 SID/错 Session/缺失 schema/type 的反例，
  断言失败时 CreateProcess 尚未执行；这是谓词证据，不能代签真实令牌。
- 新增登记缺失/未批准/self hash/旧失败漂移/报告错配、写入中记录、旧失败与新失败区分、旧 PID 重用、
  A 失败不得派发 B 的调度正负例；准确 HEAD 绑定与干净工作树检查。
- 实际普通桌面 R2 启动身份、两正式构建与返回包仍 NOT_PERFORMED；缺少具体授权不执行对应动作。

## PowerShell 入口草稿

```powershell
param([Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{40}$')][string]$ApprovedRegistryCommit,[Parameter(Mandatory=$true)][ValidatePattern('^[a-f0-9]{64}$')][string]$ApprovedRegistrySha256)
$ErrorActionPreference='Stop'
$control='D:\A9-A31-V26-MANAGED-20261003\control'
$env:TEMP=Join-Path $control 'standard-temp';$env:TMP=$env:TEMP
$record=Join-Path $control 'managed-r3-controlled-launch-r2.json'
$result=Join-Path $control 'managed-r3-controlled-controller-ready.json'
function Assert-ManagedR3PathNoReparse([string]$Path) {
 $item=Get-Item -LiteralPath $Path -Force
 while($null -ne $item){
  if(($item.Attributes -band [IO.FileAttributes]::Directory) -eq 0 -or ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0){throw 'Approved path or ancestor is not a plain directory.'}
  $item=$item.Parent
 }
}
function Assert-ManagedR3Approval([string]$Commit,[string]$RegistrySha) {
 if($Commit -cnotmatch '^[a-f0-9]{40}$' -or $RegistrySha -cnotmatch '^[a-f0-9]{64}$'){throw 'Exact locally verified approval commit and blob hash required.'}
 $file=Join-Path $control 'managed-r3-approved-registry.json'
 if((Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant() -cne $RegistrySha){throw 'Approved registry snapshot hash mismatch.'}
 $registry=Get-Content -LiteralPath $file -Raw -Encoding UTF8|ConvertFrom-Json
 $entries=@($registry.kits|Where-Object{$_.filename -ceq 'A9_31_V26_MANAGED_BUILDKIT_r3.zip'})
 if($registry.schema_version -ne 1 -or $entries.Count -ne 1){throw 'Unique managed-r3 approval entry required.'}
 $entry=$entries[0]
 if($entry.status -cne 'APPROVED_FOR_RETURN_RECORDING' -or $entry.source_commit -cne '10114503a1e79706131ea4a11a5b96bd2958807a' -or $entry.sha256 -cne '0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1' -or $entry.input_lock_sha256 -cne '5d3159712d77ccd89e0a38e7e89379562685c98cc208d0b48c4d9f34912a68b4' -or $entry.package_manifest_sha256 -cne '82ae5dd5539a85facade3b8aea6659e15bcede90e0601fd6cca075912ca248de'){throw 'Approval entry does not bind exact reviewed kit.'}
 $review=$entry.independent_kit_review
 if($null -eq $review -or $review.status -cne 'PASS' -or $review.p0 -ne 0 -or $review.p1 -ne 0 -or $review.p2 -ne 0 -or $review.independent_reviewer -ceq $review.implementation_author -or [string]::IsNullOrWhiteSpace($review.independent_reviewer) -or [string]::IsNullOrWhiteSpace($review.implementation_author) -or $review.report_sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Independent approved kit review required.'}
 if($entry.build_user_sid -cne 'S-1-5-21-3031939772-989444280-3099258187-1005' -or $entry.build_host -cne 'WIN-2JQ66JE4HTQ' -or $entry.build_host_ip -cne '192.168.1.4'){throw 'Approval target identity mismatch.'}
 $targets=@('D:\A9-A31-V26-MANAGED-20261003\control','D:\A9-A31-V26-MANAGED-20261003\build-r3-a','D:\A9-A31-V26-MANAGED-20261003\build-r3-b')
 if(@($entry.approved_write_targets).Count -ne 3 -or @(Compare-Object $targets @($entry.approved_write_targets) -CaseSensitive).Count -ne 0){throw 'Exact approved write targets required.'}
 if((Get-FileHash -LiteralPath (Join-Path $control 'managed-r3-independent-review.md') -Algorithm SHA256).Hash.ToLowerInvariant() -cne $review.report_sha256){throw 'Approved independent report hash mismatch.'}
 $expectedControls=@('managed-r3-standard-worker.ps1','stage-managed-r3-kit.ps1','serve-managed-r3-controlled-build.ps1','launch-managed-r3-controlled-build.ps1','test-managed-r3-input-closure.ps1','verify-managed-r3-registry-head.py')
 if(@($entry.control_scripts).Count -ne 6 -or @(Compare-Object $expectedControls @($entry.control_scripts|ForEach-Object{$_.file}) -CaseSensitive).Count -ne 0){throw 'Exact six control inputs required.'}
 foreach($script in $entry.control_scripts){
  $f=Join-Path $control $script.file
  if((Get-Item -LiteralPath $f -Force).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint) -or (Get-Item -LiteralPath $f).Length -ne $script.size -or (Get-FileHash -LiteralPath $f -Algorithm SHA256).Hash.ToLowerInvariant() -cne $script.sha256){throw 'Approved control byte mismatch.'}
 }

}
function Assert-ManagedR3Identity($Identity) {
 if($null -eq $Identity -or $Identity.identity_schema_version -ne 1 -or $Identity.identity_probe -cne 'win32-process-token'){throw 'Complete actual identity probe required.'}
 foreach($field in @('ordinary_user','token_is_elevated','job_probe_ok','in_host_job')){if($Identity.$field -isnot [bool]){throw 'Identity boolean evidence is missing or invalid.'}}
 if($Identity.ordinary_user -ne $true -or $Identity.token_is_elevated -ne $false -or $Identity.token_elevation_type -notin @(1,3) -or $Identity.integrity_sid -cne 'S-1-16-8192' -or $Identity.integrity_rid -ne 8192 -or $Identity.job_probe_ok -ne $true -or $Identity.in_host_job -ne $false -or $Identity.user -ine 'WIN-2JQ66JE4HTQ\a9builder'){throw 'Every phase requires the approved ordinary non-elevated Medium user outside Host Job.'}
}
function Assert-ManagedR3Caller($Identity,[string]$Sid,[int]$Session) {
 Assert-ManagedR3Identity $Identity
 if($Sid -cne 'S-1-5-21-3031939772-989444280-3099258187-1005' -or $Session -ne 3){throw 'Exact approved ordinary desktop SID/Session required before creation.'}
}
function Assert-ManagedR3RetryApproval {
 $registry=Get-Content -LiteralPath (Join-Path $control 'managed-r3-approved-registry.json') -Raw -Encoding UTF8|ConvertFrom-Json
 $entries=@($registry.controller_retries|Where-Object{$_.id -ceq 'A9-31-managed-r3-controller-r2'})
 if($entries.Count -ne 1){throw 'Unique controller-r2 approval required.'}
 $a=$entries[0]
 if($a.status -cne 'APPROVED_FOR_CONTROLLED_BUILD_LAUNCH' -or $a.source_commit -cne '10114503a1e79706131ea4a11a5b96bd2958807a' -or $a.kit_sha256 -cne '0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1' -or $a.creation_flags -ne 16 -or $a.caller_requires_no_host_job -isnot [bool] -or $a.caller_requires_no_host_job -ne $true -or $a.request_limit -ne 2 -or $a.validity_minutes -ne 60 -or $a.launcher_file -cne 'launch-managed-r3-controlled-build-r2.ps1' -or $a.launch_record_file -cne 'managed-r3-controlled-launch-r2.json' -or $a.retained_failure_sha256 -cne 'c7a5b14ffffde3cd67175ddbc17f1c13b811f4ccb189a6174b30232c8973e4ea'){throw 'Controller-r2 approval contract mismatch.'}
 $self=Get-Item -LiteralPath $PSCommandPath -Force
 if($self.Name -cne $a.launcher_file -or $self.DirectoryName -cne $control -or ($self.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0 -or $self.Length -ne $a.launcher_size -or (Get-FileHash -LiteralPath $self.FullName -Algorithm SHA256).Hash.ToLowerInvariant() -cne $a.launcher_sha256){throw 'Controller-r2 approved bytes mismatch.'}
 $oldFailure=Join-Path $control 'managed-r3-controlled-launch.json'
 if((Get-FileHash -LiteralPath $oldFailure -Algorithm SHA256).Hash.ToLowerInvariant() -cne $a.retained_failure_sha256){throw 'Original failure changed or missing.'}
 $r=Get-Content -LiteralPath $oldFailure -Raw -Encoding UTF8|ConvertFrom-Json
 if($r.status -cne 'FAIL' -or $r.error_message -cne 'Same-user breakaway creation failed code 5' -or $r.native_build -cne 'NOT_PERFORMED'){throw 'Original failure identity mismatch.'}
 $review=$a.independent_review
 if($null -eq $review -or $review.status -cne 'PASS' -or $review.p0 -ne 0 -or $review.p1 -ne 0 -or $review.p2 -ne 0 -or [string]::IsNullOrWhiteSpace($review.independent_reviewer) -or [string]::IsNullOrWhiteSpace($review.implementation_author) -or $review.independent_reviewer -ceq $review.implementation_author -or $review.report_sha256 -cnotmatch '^[a-f0-9]{64}$'){throw 'Independent controller-r2 review required.'}
 $reviewPath=Join-Path $control 'managed-r3-controller-r2-independent-review.md'
 if((Get-Item -LiteralPath $reviewPath -Force).Attributes.HasFlag([IO.FileAttributes]::ReparsePoint) -or (Get-FileHash -LiteralPath $reviewPath -Algorithm SHA256).Hash.ToLowerInvariant() -cne $review.report_sha256){throw 'Controller-r2 report snapshot mismatch.'}
}
if($env:COMPUTERNAME -cne 'WIN-2JQ66JE4HTQ'){throw 'Approved host required.'}
foreach($name in @('managed-r3-controlled-launch-r2.json','managed-r3-controlled-controller-ready.json','managed-r3-controlled-Probe-result.json','managed-r3-controlled-controller-failure.json','managed-r3-controlled-controller-completed.json','managed-r3-controlled-BuildA-result.json','managed-r3-controlled-BuildB-result.json','managed-r3-BuildA-request.json','managed-r3-BuildB-request.json','managed-r3-BuildA-console.log','managed-r3-BuildB-console.log')) {
 if(Test-Path -LiteralPath (Join-Path $control $name)){throw 'Prior retry/control/build identity exists; preserve it and stop.'}
}
Assert-ManagedR3PathNoReparse $control
Assert-ManagedR3Approval $ApprovedRegistryCommit $ApprovedRegistrySha256
Assert-ManagedR3RetryApproval
Add-Type -TypeDefinition @'
using System;using System.Runtime.InteropServices;using System.Text;
public static class A9ManagedR3DesktopR2 {
 [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] public struct SI {public int cb;public string reserved,desktop,title;public int x,y,xSize,ySize,xChars,yChars,fill,flags;public short show,reserved2;public IntPtr reservedPtr,input,output,error;}
 [StructLayout(LayoutKind.Sequential)] public struct PI {public IntPtr process,thread;public uint pid,tid;}
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool CreateProcessW(string app,StringBuilder command,IntPtr processAttributes,IntPtr threadAttributes,bool inherit,uint flags,IntPtr environment,string directory,ref SI startup,out PI process);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern uint WaitForSingleObject(IntPtr process,uint timeout);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool GetExitCodeProcess(IntPtr process,out uint exitCode);
 [DllImport("kernel32.dll",SetLastError=true)] public static extern bool TerminateProcess(IntPtr process,uint exitCode);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
'@
$r=[ordered]@{schema_version=2;controller_revision='r2';status='FAIL';caller_pid=$PID;caller_started_at=(Get-Process -Id $PID).StartTime.ToUniversalTime().ToString('o');caller_sid=[Security.Principal.WindowsIdentity]::GetCurrent().User.Value;caller_session=(Get-Process -Id $PID).SessionId;captured_at=[DateTime]::UtcNow.ToString('o');creation_flags=16;child_created=$false;credentials_used=$false;settings_changed=$false;native_build='NOT_PERFORMED';source_commit='10114503a1e79706131ea4a11a5b96bd2958807a';kit_sha256='0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1';approved_registry_commit=$ApprovedRegistryCommit;approved_registry_sha256=$ApprovedRegistrySha256;retained_failure_sha256='c7a5b14ffffde3cd67175ddbc17f1c13b811f4ccb189a6174b30232c8973e4ea'}
$pi=New-Object A9ManagedR3DesktopR2+PI
$stream=[IO.File]::Open($record,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
try {
 $lines=New-Object 'Collections.Generic.List[string]';$probeError=$null
 try {& 'D:\A9-A31-V26-MANAGED-20261003\build-r3-a\build.ps1' -TestBuildIdentityOnly | ForEach-Object {$lines.Add([string]$_)}}catch{$probeError=$_}
 if($lines.Count -gt 0){$r.caller_identity=($lines -join [Environment]::NewLine)|ConvertFrom-Json}
 if($null -ne $probeError){throw $probeError}
 Assert-ManagedR3Caller $r.caller_identity $r.caller_sid $r.caller_session
 Assert-ManagedR3Approval $ApprovedRegistryCommit $ApprovedRegistrySha256
 Assert-ManagedR3RetryApproval
 $si=New-Object A9ManagedR3DesktopR2+SI;$si.cb=[Runtime.InteropServices.Marshal]::SizeOf($si);$si.flags=1;$si.show=0
 $app=Join-Path $PSHOME 'powershell.exe'
 $cmd=New-Object Text.StringBuilder(('"'+$app+'" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File "D:\A9-A31-V26-MANAGED-20261003\control\serve-managed-r3-controlled-build.ps1" -ApprovedRegistryCommit '+$ApprovedRegistryCommit+' -ApprovedRegistrySha256 '+$ApprovedRegistrySha256))
 if(-not [A9ManagedR3DesktopR2]::CreateProcessW($app,$cmd,[IntPtr]::Zero,[IntPtr]::Zero,$false,16,[IntPtr]::Zero,$control,[ref]$si,[ref]$pi)){throw ('Same-user ordinary desktop creation failed code '+[Runtime.InteropServices.Marshal]::GetLastWin32Error())}
 $r.child_created=$true;$r.pid=$pi.pid
 $deadline=[DateTime]::UtcNow.AddSeconds(20)
 while(-not(Test-Path -LiteralPath $result)){
  if([A9ManagedR3DesktopR2]::WaitForSingleObject($pi.process,0) -eq 0){$code=[uint32]0;$null=[A9ManagedR3DesktopR2]::GetExitCodeProcess($pi.process,[ref]$code);$r.exit_code=$code;throw 'Controller exited before ready identity record.'}
  if([DateTime]::UtcNow -gt $deadline){throw 'Controller ready wait timed out; no build request issued.'}
  Start-Sleep -Milliseconds 200
 }
 $ready=Get-Content -LiteralPath $result -Raw -Encoding UTF8|ConvertFrom-Json
 Assert-ManagedR3Caller $ready.identity $ready.sid $ready.session_id
 if($ready.status -cne 'WAITING_FOR_APPROVED_BUILD_REQUEST' -or $ready.approved_registry_commit -cne $ApprovedRegistryCommit -or $ready.approved_registry_sha256 -cne $ApprovedRegistrySha256 -or $ready.pid -ne $pi.pid -or $ready.kit_sha256 -cne $r.kit_sha256 -or $ready.source_commit -cne $r.source_commit -or $ready.request_limit -ne 2 -or $ready.validity_minutes -ne 60){throw 'Controller-r2 child ready binding invalid.'}
 $r.status='CONTROLLER_READY_REQUIRES_APPROVED_REQUEST'
}catch {
 $r.error_type=$_.Exception.GetType().FullName;$r.error_message=$_.Exception.Message
 if($pi.process -ne [IntPtr]::Zero){
  $wait=[A9ManagedR3DesktopR2]::WaitForSingleObject($pi.process,0)
  if($wait -eq 258){$r.termination_succeeded=[A9ManagedR3DesktopR2]::TerminateProcess($pi.process,1);$wait=[A9ManagedR3DesktopR2]::WaitForSingleObject($pi.process,5000)}
  $r.cleanup_wait_result=$wait;$r.cleanup_state=if($wait -eq 0){'CONTROLLER_EXIT_CONFIRMED'}else{'UNKNOWN'}
  $r.other_child_cleanup='UNKNOWN_NOT_A_PROCESS_TREE_PROOF'
 }
}finally {
 if($pi.thread -ne [IntPtr]::Zero){$null=[A9ManagedR3DesktopR2]::CloseHandle($pi.thread)}
 if($pi.process -ne [IntPtr]::Zero){$null=[A9ManagedR3DesktopR2]::CloseHandle($pi.process)}
 try{$bytes=(New-Object Text.UTF8Encoding($false)).GetBytes(($r|ConvertTo-Json -Depth 8));$stream.Write($bytes,0,$bytes.Length);$stream.Flush()}finally{$stream.Dispose()}
}
$r|ConvertTo-Json -Depth 8 -Compress
if($r.status -cne 'CONTROLLER_READY_REQUIRES_APPROVED_REQUEST'){exit 1}
```

## Python 调度器草稿

仅在明确补充路径授权后提取，不修改原 dispatcher。UTF-8 无 BOM、LF、末尾一个 LF，
SHA-256 `5bbacf048062393749613fdc323cee7c2380d45481e0222280d1ed155a5b8b15`，size `13685` bytes；同值登记 controller_retries.dispatcher_sha256。

```python
import datetime, hashlib, importlib.util, json, pathlib, re, subprocess, time
import remote

BASE = remote.BASE
ROOT = BASE.parents[2]
SOURCE = '10114503a1e79706131ea4a11a5b96bd2958807a'
KIT = '0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1'
SID = 'S-1-5-21-3031939772-989444280-3099258187-1005'
FIRST_FAILURE = 'c7a5b14ffffde3cd67175ddbc17f1c13b811f4ccb189a6174b30232c8973e4ea'
NEW_LAUNCH = 'managed-r3-controlled-launch-r2.json'
OLD_LAUNCH = 'managed-r3-controlled-launch.json'
REVIEW = 'docs/reports/2026-10/a9_31_managed_r3_controller_r2_independent_review_2026-10-03.md'
BIND = None
ORIGINAL_DISPATCH_SHA = '05bfd2cbf98882c32d798bbeeed6e27f803c79a18833be0bd253a683d16c57c4'
TRANSPORT_SHA = 'f3f4f86757b2f824772e00c311422a226d3d7d94623e6d0ed017dabe271cc609'
if hashlib.sha256((BASE / 'dispatch-and-collect.py').read_bytes()).hexdigest() != ORIGINAL_DISPATCH_SHA:
    raise RuntimeError('Original dispatch dependency drift')
spec = importlib.util.spec_from_file_location('managed_r3_original_dispatch', BASE / 'dispatch-and-collect.py')
original = importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)

def save_new(name, value):
    with (BASE / name).open('x', encoding='utf-8', newline='\n') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write('\n')

def head_gate():
    proof = json.loads(subprocess.check_output(['python3', str(BASE / 'control-scripts/verify-managed-r3-registry-head.py')], cwd=ROOT))
    if BIND is not None and proof != BIND:
        raise RuntimeError('Approval HEAD changed; stop')
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT).strip():
        raise RuntimeError('Clean approved HEAD required')
    registry = json.loads((ROOT / 'release/win7-product-v3/a9-v26-approved-build-kits.json').read_bytes())
    entries = [a for a in registry.get('controller_retries', []) if a.get('id') == 'A9-31-managed-r3-controller-r2']
    if len(entries) != 1:
        raise RuntimeError('Unique approved controller-r2 required')
    a = entries[0]
    if hashlib.sha256((BASE / 'remote.py').read_bytes()).hexdigest() != TRANSPORT_SHA:
        raise RuntimeError('Transport dependency drift')
    expected = dict(status='APPROVED_FOR_CONTROLLED_BUILD_LAUNCH', source_commit=SOURCE, kit_sha256=KIT,
                    launcher_file='launch-managed-r3-controlled-build-r2.ps1', creation_flags=16,
                    launch_record_file=NEW_LAUNCH, retained_failure_sha256=FIRST_FAILURE,
                    request_limit=2, validity_minutes=60, caller_requires_no_host_job=True,
                    original_dispatcher_sha256=ORIGINAL_DISPATCH_SHA, local_transport_sha256=TRANSPORT_SHA)
    if any(a.get(k) != v for k, v in expected.items()):
        raise RuntimeError('Controller-r2 approval contract mismatch')
    r = a.get('independent_review', {})
    if (r.get('status') != 'PASS' or any(r.get(k) != 0 for k in ('p0', 'p1', 'p2'))
        or not r.get('independent_reviewer') or not r.get('implementation_author')
        or r.get('independent_reviewer') == r.get('implementation_author') or r.get('report') != REVIEW):
        raise RuntimeError('Independent controller-r2 review missing')
    report = ROOT / REVIEW
    if (hashlib.sha256(report.read_bytes()).hexdigest() != r.get('report_sha256')
        or subprocess.check_output(['git', 'show', proof['approved_registry_commit'] + ':' + REVIEW], cwd=ROOT) != report.read_bytes()):
        raise RuntimeError('Exact reviewed report HEAD bytes required')
    launcher = BASE / 'control-scripts' / a['launcher_file']
    if len(launcher.read_bytes()) != a.get('launcher_size') or hashlib.sha256(launcher.read_bytes()).hexdigest() != a.get('launcher_sha256'):
        raise RuntimeError('Reviewed local R2 launcher drift')
    if hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest() != a.get('dispatcher_sha256'):
        raise RuntimeError('Reviewed R2 dispatcher drift')
    return proof

def snapshot():
    ps = r"""$ErrorActionPreference='Stop';$c='D:\A9-A31-V26-MANAGED-20261003\control';$rows=@();$pending=@();foreach($n in @('managed-r3-controlled-launch.json','managed-r3-controlled-launch-r2.json','managed-r3-controlled-Probe-result.json','managed-r3-controlled-controller-ready.json','managed-r3-controlled-controller-failure.json','managed-r3-controlled-controller-completed.json','managed-r3-controlled-BuildA-result.json','managed-r3-controlled-BuildB-result.json')){$p=Join-Path $c $n;if(Test-Path -LiteralPath $p){if((Get-Item -LiteralPath $p).Length -eq 0){$pending+=$n;continue};try{$raw=Get-Content -LiteralPath $p -Raw -Encoding UTF8 -ErrorAction Stop;$v=$raw|ConvertFrom-Json -ErrorAction Stop;$rows+=[ordered]@{file=$n;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant();value=$v}}catch [IO.IOException]{if(($_.Exception.HResult -band 65535) -in @(32,33)){$pending+=$n}else{throw}}}};$ready=$rows|Where-Object{$_.file -ceq 'managed-r3-controlled-controller-ready.json'};$live=$null;if($null -ne $ready){$proc=Get-CimInstance Win32_Process -Filter ('ProcessId='+$ready.value.pid);if($null -ne $proc){$owner=Invoke-CimMethod -InputObject $proc -MethodName GetOwnerSid;$live=[ordered]@{pid=$proc.ProcessId;session=$proc.SessionId;sid=$owner.Sid;creationDate=(Get-Process -Id $proc.ProcessId).StartTime.ToUniversalTime().ToString('o');parentPid=$proc.ParentProcessId}}};[ordered]@{records=$rows;readsInProgress=$pending;controllerProcess=$live;capturedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 10 -Compress"""
    r = remote.ssh(ps)
    if r.returncode:
        raise RuntimeError('R2 read-only observation failed: ' + r.stderr.decode('cp936', errors='replace')[-500:])
    return json.loads(r.stdout.decode('utf-8-sig'))

def records(data):
    return {r['file']: r['value'] for r in data['records']}

def retained_failure_gate(data):
    old = [r for r in data['records'] if r['file'] == OLD_LAUNCH]
    if (len(old) != 1 or old[0].get('sha256') != FIRST_FAILURE or old[0]['value'].get('status') != 'FAIL'
        or old[0]['value'].get('error_message') != 'Same-user breakaway creation failed code 5'
        or old[0]['value'].get('native_build') != 'NOT_PERFORMED'):
        raise RuntimeError('Original retained failure changed or missing')

def identity_gate(v):
    if not isinstance(v, dict) or v.get('identity_schema_version') != 1 or v.get('identity_probe') != 'win32-process-token':
        raise RuntimeError('Complete Win32 identity required')
    expected = dict(ordinary_user=True, token_is_elevated=False, job_probe_ok=True, in_host_job=False)
    if any(type(v.get(k)) is not bool or v[k] is not value for k, value in expected.items()):
        raise RuntimeError('Ordinary/non-elevated/no-Job booleans required')
    if (v.get('integrity_rid') != 8192 or v.get('integrity_sid') != 'S-1-16-8192'
        or v.get('token_elevation_type') not in (1, 3) or v.get('user', '').lower() != 'win-2jq66je4htq\\a9builder'):
        raise RuntimeError('Exact ordinary Medium identity required')

def utc_ticks(text):
    if not isinstance(text, str):
        raise RuntimeError('UTC timestamp missing')
    m = re.fullmatch(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?(Z|\+00:00)', text)
    if not m:
        raise RuntimeError('Exact UTC timestamp format required')
    whole = datetime.datetime.strptime(m.group(1), '%Y-%m-%dT%H:%M:%S').replace(tzinfo=datetime.timezone.utc)
    return int(whole.timestamp()) * 10_000_000 + int((m.group(2) or '').ljust(7, '0'))

def controller_gate(data, binding):
    retained_failure_gate(data)
    rows = records(data)
    for name, value in rows.items():
        if name == OLD_LAUNCH:
            continue  # Only this exact hashed first failure is retained historical evidence.
        if name.endswith('failure.json') or value.get('status') == 'FAIL':
            raise RuntimeError('New controller/worker failure: ' + name)
    if data.get('readsInProgress'):
        raise RuntimeError('Controller record incomplete; no dispatch')
    launch = rows[NEW_LAUNCH]
    ready = rows['managed-r3-controlled-controller-ready.json']
    live = data.get('controllerProcess')
    if not live or launch.get('status') != 'CONTROLLER_READY_REQUIRES_APPROVED_REQUEST' or ready.get('status') != 'WAITING_FOR_APPROVED_BUILD_REQUEST':
        raise RuntimeError('Live R2 controller readiness required')
    if (launch.get('schema_version') != 2 or launch.get('controller_revision') != 'r2' or launch.get('creation_flags') != 16
        or launch.get('child_created') is not True or launch.get('retained_failure_sha256') != FIRST_FAILURE
        or launch.get('caller_sid') != SID or launch.get('caller_session') != 3):
        raise RuntimeError('R2 caller/child facts mismatch')
    identity_gate(launch.get('caller_identity'))
    identity_gate(ready.get('identity'))
    if (launch.get('pid') != ready.get('pid') or live.get('pid') != ready.get('pid')
        or live.get('sid') != SID or ready.get('sid') != SID or live.get('session') != 3 or ready.get('session_id') != 3
        or live.get('parentPid') != launch.get('caller_pid') or ready.get('request_limit') != 2 or ready.get('validity_minutes') != 60):
        raise RuntimeError('Controller process/parent/Session identity mismatch')
    for v in (launch, ready):
        if (v.get('source_commit') != SOURCE or v.get('kit_sha256') != KIT
            or v.get('approved_registry_commit') != binding['approved_registry_commit']
            or v.get('approved_registry_sha256') != binding['approved_registry_sha256']):
            raise RuntimeError('Source/kit/approval binding mismatch')
    created = utc_ticks(live['creationDate'])
    caller_started = utc_ticks(launch['caller_started_at'])
    captured = utc_ticks(ready['captured_at'])
    now = utc_ticks(data['capturedAt'])
    if created < caller_started or captured < created or now < captured or now >= captured + 60 * 60 * 10_000_000:
        raise RuntimeError('Controller creation/time window mismatch or expired')
    return ready, live['creationDate']

def collect_available(phase):
    name = 'build-r3-a' if phase == 'BuildA' else 'build-r3-b'
    ps = "$ErrorActionPreference='Stop';$p='D:\\A9-A31-V26-MANAGED-20261003\\" + name + "\\result';[ordered]@{directoryExists=(Test-Path -LiteralPath $p -PathType Container)}|ConvertTo-Json -Compress"
    r = remote.ssh(ps)
    if r.returncode:
        raise RuntimeError('Return-presence query failed; preserve observation and stop')
    presence = json.loads(r.stdout.decode('utf-8-sig'))
    if not presence['directoryExists']:
        save_new('controller-r2-' + phase + '-native-return-not-present.json', presence)
        return None
    return original.collect(phase)

def run():
    global BIND
    BIND = head_gate()
    save_new('controller-r2-registry-head-binding.json', BIND)
    original.BIND = BIND
    original.head_gate = head_gate
    print('WAITING_FOR_APPROVED_R2_ORDINARY_DESKTOP_CONTROLLER', flush=True)
    deadline = time.monotonic() + 1800
    while True:
        data = snapshot()
        retained_failure_gate(data)
        rows = records(data)
        failed = [n for n, v in rows.items() if n != OLD_LAUNCH and (n.endswith('failure.json') or v.get('status') == 'FAIL')]
        if failed:
            save_new('controller-r2-first-failure.json', data)
            raise RuntimeError('New R2 startup failed; no build request issued')
        if not data.get('readsInProgress') and NEW_LAUNCH in rows and 'managed-r3-controlled-controller-ready.json' in rows:
            ready, process_started = controller_gate(data, BIND)
            save_new('ordinary-controller-r2-identity-live.json', data)
            break
        if time.monotonic() >= deadline:
            save_new('controller-r2-start-wait-timeout.json', data)
            raise RuntimeError('No R2 controller observed; native build NOT_PERFORMED')
        time.sleep(5)
    for phase in ('BuildA', 'BuildB'):
        head_gate()
        current = snapshot()
        _, start = controller_gate(current, BIND)
        if start != process_started:
            raise RuntimeError('Controller PID reused; no next dispatch')
        original.dispatch(phase, ready)
        deadline = time.monotonic() + 1800
        while True:
            data = snapshot()
            retained_failure_gate(data)
            rows = records(data)
            result = rows.get('managed-r3-controlled-' + phase + '-result.json')
            if result is not None:
                save_new('controller-r2-' + phase + '-final.json', data)
                returned = collect_available(phase)
                if (result.get('status') != 'BUILD_COMMAND_COMPLETED_REQUIRES_RETURN_REVIEW'
                    or result.get('build_exit_code') != 0 or returned is None or returned['buildResult'].get('status') != 'PASS'):
                    raise RuntimeError(phase + ' failed; evidence preserved; no downstream dispatch')
                print(phase + ' RETURNED_NATIVE_PASS_REQUIRES_INDEPENDENT_REVIEW', flush=True)
                break
            if any(n != OLD_LAUNCH and (n.endswith('failure.json') or v.get('status') == 'FAIL') for n, v in rows.items()):
                save_new('controller-r2-' + phase + '-first-failure.json', data)
                raise RuntimeError('New controller failure; stop')
            if time.monotonic() >= deadline:
                save_new('controller-r2-' + phase + '-observation-timeout.json', data)
                raise RuntimeError('Observation timeout; no downstream dispatch')
            time.sleep(8)
    print('TWO_R2_RETURN_PACKAGES_COLLECTED_NOT_YET_RELOCKED', flush=True)

if __name__ == '__main__':
    run()
```

## 草稿检查首失败保留

Python 调度草稿正例首次因本机 Python 的 ISO 时间解析拒绝 .NET 七位小数而失败；首失败 JSON 与完整输入快照保留。
已改为严格 UTC 格式转 100ns 整数 tick，保留第七位；PID 创建身份仍比较完整原字符串，不截断重绑。
此修复仅调整本文件内草稿，尚未提取/部署/派发；需按准确新哈希复核。

R2本地依赖精确继承：原 dispatch-and-collect.py SHA-256 `05bfd2cbf98882c32d798bbeeed6e27f803c79a18833be0bd253a683d16c57c4`；remote.py SHA-256 `f3f4f86757b2f824772e00c311422a226d3d7d94623e6d0ed017dabe271cc609`。
新增 controller_retries 元数据也登记这两个哈希；依赖字节漂移拒绝派发。

## 实现方已执行的草稿检查（2026-10-03）

- Win10 PS5.1 Desktop 5.1.19041.6456：完整14330字节 PowerShell草稿 ParseInput PASS、18项纯caller身份正负例 PASS；未执行整段启动代码、未创建控制器或远端文件。
- Python最终调度草稿：27项状态/身份/哈希/时间/PID/写入中记录及未登记HEAD的正负例 PASS；无远端dispatch、未构建。首失败输入/报告保留。
- Node20.17文档检查 PASS（233文件/48任务，ADR追加后的最终记录另存）；git差异/UTF-8 LF检查按最终字节执行。
- 原始结果：`.acceptance/a9-31-developer/native-kit-r3/controller-r2-full-draft-parseinput-20261003T043345Z.json`、`controller-r2-draft-caller-predicates-20261003T043455Z.json`、`controller-r2-draft-dispatch-gates-r2-20261003T044507Z.json`。
- 新控制输入独立复核 NOT_PERFORMED、登记/远端部署/双构建 NOT_PERFORMED。草稿检查不替代这些门。

## 2026-10-03 负责人批准与执行登记

负责人在本轮明确回复“批准”，授权本材料列出的两个本地R2实施路径、ADR-0157、
独立 Luna/high 只读复核，以及P0/P1/P2=0后四路径本地登记提交和四个新增远端目标/原registry更新。
原BuildA/B的普通Medium、非提升、无Host Job、SID1005/Session3、两请求/60分钟合同继续适用。
原文草稿、旧失败、六控制输入和native kit均保留；本批准不证明真实身份或构建结果。
当前：AUTHORIZED_PENDING_INDEPENDENT_REVIEW；native/真实Electron/Win7为NOT_PERFORMED。

## 独立复核首失败及定向修复

首轮Luna/high独立复核：FAIL_NOT_APPROVED，P0=0/P1=1/P2=0。
原dispatcher SHA 5bbacf048062393749613fdc323cee7c2380d45481e0222280d1ed155a5b8b15
在result分支先接受结果，后检查新FAIL，未覆盖同期写入或轮询期间PID重用；原源码及失败保留。
已在批准的同一dispatcher路径修复：每次构建观察先保存，再扫描新FAIL和写入中记录，
逐项校验worker phase/身份/source/kit/registry。A完成须复核当前live身份/创建时间，才收包及派B；
B完成须有两worker和完整completed的PID/SID/time，live仍存在时再核对PID重用。
原server在B完结后退出；无live时只收两返回事实，退出码/进程树清理UNKNOWN，
不得凭收包签生命周期PASS或重锁。新增27项结果分支正负例通过，包括实际run在A结果+FAIL时不派B。
当前dispatcher SHA `45d5b7347549b9610733655c41faf42fe8e5be331da5b6837aa21a538bdb9445`，size `17633`；
launcher仍为原14cc7776…/14330字节。最终独立复核待执行；原代码fence保留历史，不用于新登记。


第二轮复核补充严格整数类型修复：schema/elevation/integrity拒绝bool、float或string。
45d5b734版完整源码另留作复核输入；最终dispatcher SHA `02a25bc8515781941adf8cf93ed66ad3b88cc89fbf8726fe269ec59c05365924`，size `17812`，
以下完整fence为当前待复核字节，前述首轮代码与失败原文保留。

### 修复后完整dispatcher字节

```python
import datetime, hashlib, importlib.util, json, pathlib, re, subprocess, time
import remote

BASE = remote.BASE
ROOT = BASE.parents[2]
SOURCE = '10114503a1e79706131ea4a11a5b96bd2958807a'
KIT = '0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1'
SID = 'S-1-5-21-3031939772-989444280-3099258187-1005'
FIRST_FAILURE = 'c7a5b14ffffde3cd67175ddbc17f1c13b811f4ccb189a6174b30232c8973e4ea'
NEW_LAUNCH = 'managed-r3-controlled-launch-r2.json'
OLD_LAUNCH = 'managed-r3-controlled-launch.json'
REVIEW = 'docs/reports/2026-10/a9_31_managed_r3_controller_r2_independent_review_2026-10-03.md'
BIND = None
ORIGINAL_DISPATCH_SHA = '05bfd2cbf98882c32d798bbeeed6e27f803c79a18833be0bd253a683d16c57c4'
TRANSPORT_SHA = 'f3f4f86757b2f824772e00c311422a226d3d7d94623e6d0ed017dabe271cc609'
if hashlib.sha256((BASE / 'dispatch-and-collect.py').read_bytes()).hexdigest() != ORIGINAL_DISPATCH_SHA:
    raise RuntimeError('Original dispatch dependency drift')
spec = importlib.util.spec_from_file_location('managed_r3_original_dispatch', BASE / 'dispatch-and-collect.py')
original = importlib.util.module_from_spec(spec)
spec.loader.exec_module(original)

def save_new(name, value):
    with (BASE / name).open('x', encoding='utf-8', newline='\n') as f:
        json.dump(value, f, ensure_ascii=False, indent=2)
        f.write('\n')

def head_gate():
    proof = json.loads(subprocess.check_output(['python3', str(BASE / 'control-scripts/verify-managed-r3-registry-head.py')], cwd=ROOT))
    if BIND is not None and proof != BIND:
        raise RuntimeError('Approval HEAD changed; stop')
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT).strip():
        raise RuntimeError('Clean approved HEAD required')
    registry = json.loads((ROOT / 'release/win7-product-v3/a9-v26-approved-build-kits.json').read_bytes())
    entries = [a for a in registry.get('controller_retries', []) if a.get('id') == 'A9-31-managed-r3-controller-r2']
    if len(entries) != 1:
        raise RuntimeError('Unique approved controller-r2 required')
    a = entries[0]
    if hashlib.sha256((BASE / 'remote.py').read_bytes()).hexdigest() != TRANSPORT_SHA:
        raise RuntimeError('Transport dependency drift')
    expected = dict(status='APPROVED_FOR_CONTROLLED_BUILD_LAUNCH', source_commit=SOURCE, kit_sha256=KIT,
                    launcher_file='launch-managed-r3-controlled-build-r2.ps1', creation_flags=16,
                    launch_record_file=NEW_LAUNCH, retained_failure_sha256=FIRST_FAILURE,
                    request_limit=2, validity_minutes=60, caller_requires_no_host_job=True,
                    original_dispatcher_sha256=ORIGINAL_DISPATCH_SHA, local_transport_sha256=TRANSPORT_SHA)
    if any(a.get(k) != v for k, v in expected.items()):
        raise RuntimeError('Controller-r2 approval contract mismatch')
    r = a.get('independent_review', {})
    if (r.get('status') != 'PASS' or any(r.get(k) != 0 for k in ('p0', 'p1', 'p2'))
        or not r.get('independent_reviewer') or not r.get('implementation_author')
        or r.get('independent_reviewer') == r.get('implementation_author') or r.get('report') != REVIEW):
        raise RuntimeError('Independent controller-r2 review missing')
    report = ROOT / REVIEW
    if (hashlib.sha256(report.read_bytes()).hexdigest() != r.get('report_sha256')
        or subprocess.check_output(['git', 'show', proof['approved_registry_commit'] + ':' + REVIEW], cwd=ROOT) != report.read_bytes()):
        raise RuntimeError('Exact reviewed report HEAD bytes required')
    launcher = BASE / 'control-scripts' / a['launcher_file']
    if len(launcher.read_bytes()) != a.get('launcher_size') or hashlib.sha256(launcher.read_bytes()).hexdigest() != a.get('launcher_sha256'):
        raise RuntimeError('Reviewed local R2 launcher drift')
    if hashlib.sha256(pathlib.Path(__file__).read_bytes()).hexdigest() != a.get('dispatcher_sha256'):
        raise RuntimeError('Reviewed R2 dispatcher drift')
    return proof

def snapshot():
    ps = r"""$ErrorActionPreference='Stop';$c='D:\A9-A31-V26-MANAGED-20261003\control';$rows=@();$pending=@();foreach($n in @('managed-r3-controlled-launch.json','managed-r3-controlled-launch-r2.json','managed-r3-controlled-Probe-result.json','managed-r3-controlled-controller-ready.json','managed-r3-controlled-controller-failure.json','managed-r3-controlled-controller-completed.json','managed-r3-controlled-BuildA-result.json','managed-r3-controlled-BuildB-result.json')){$p=Join-Path $c $n;if(Test-Path -LiteralPath $p){if((Get-Item -LiteralPath $p).Length -eq 0){$pending+=$n;continue};try{$raw=Get-Content -LiteralPath $p -Raw -Encoding UTF8 -ErrorAction Stop;$v=$raw|ConvertFrom-Json -ErrorAction Stop;$rows+=[ordered]@{file=$n;sha256=(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant();value=$v}}catch [IO.IOException]{if(($_.Exception.HResult -band 65535) -in @(32,33)){$pending+=$n}else{throw}}}};$ready=$rows|Where-Object{$_.file -ceq 'managed-r3-controlled-controller-ready.json'};$live=$null;if($null -ne $ready){$proc=Get-CimInstance Win32_Process -Filter ('ProcessId='+$ready.value.pid);if($null -ne $proc){$owner=Invoke-CimMethod -InputObject $proc -MethodName GetOwnerSid;$live=[ordered]@{pid=$proc.ProcessId;session=$proc.SessionId;sid=$owner.Sid;creationDate=(Get-Process -Id $proc.ProcessId).StartTime.ToUniversalTime().ToString('o');parentPid=$proc.ParentProcessId}}};[ordered]@{records=$rows;readsInProgress=$pending;controllerProcess=$live;capturedAt=[DateTime]::UtcNow.ToString('o')}|ConvertTo-Json -Depth 10 -Compress"""
    r = remote.ssh(ps)
    if r.returncode:
        raise RuntimeError('R2 read-only observation failed: ' + r.stderr.decode('cp936', errors='replace')[-500:])
    return json.loads(r.stdout.decode('utf-8-sig'))

def records(data):
    return {r['file']: r['value'] for r in data['records']}

def retained_failure_gate(data):
    old = [r for r in data['records'] if r['file'] == OLD_LAUNCH]
    if (len(old) != 1 or old[0].get('sha256') != FIRST_FAILURE or old[0]['value'].get('status') != 'FAIL'
        or old[0]['value'].get('error_message') != 'Same-user breakaway creation failed code 5'
        or old[0]['value'].get('native_build') != 'NOT_PERFORMED'):
        raise RuntimeError('Original retained failure changed or missing')

def identity_gate(v):
    if (not isinstance(v, dict) or v.get('identity_schema_version') != 1
        or v.get('identity_probe') != 'win32-process-token'
        or any(type(v.get(k)) is not int for k in ('identity_schema_version', 'token_elevation_type', 'integrity_rid'))):
        raise RuntimeError('Complete Win32 identity with integer schema/elevation/integrity evidence required')
    expected = dict(ordinary_user=True, token_is_elevated=False, job_probe_ok=True, in_host_job=False)
    if any(type(v.get(k)) is not bool or v[k] is not value for k, value in expected.items()):
        raise RuntimeError('Ordinary/non-elevated/no-Job booleans required')
    if (v.get('integrity_rid') != 8192 or v.get('integrity_sid') != 'S-1-16-8192'
        or v.get('token_elevation_type') not in (1, 3) or v.get('user', '').lower() != 'win-2jq66je4htq\\a9builder'):
        raise RuntimeError('Exact ordinary Medium identity required')

def utc_ticks(text):
    if not isinstance(text, str):
        raise RuntimeError('UTC timestamp missing')
    m = re.fullmatch(r'(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})(?:\.(\d{1,7}))?(Z|\+00:00)', text)
    if not m:
        raise RuntimeError('Exact UTC timestamp format required')
    whole = datetime.datetime.strptime(m.group(1), '%Y-%m-%dT%H:%M:%S').replace(tzinfo=datetime.timezone.utc)
    return int(whole.timestamp()) * 10_000_000 + int((m.group(2) or '').ljust(7, '0'))

def controller_gate(data, binding):
    retained_failure_gate(data)
    rows = records(data)
    for name, value in rows.items():
        if name == OLD_LAUNCH:
            continue  # Only this exact hashed first failure is retained historical evidence.
        if name.endswith('failure.json') or value.get('status') == 'FAIL':
            raise RuntimeError('New controller/worker failure: ' + name)
    if data.get('readsInProgress'):
        raise RuntimeError('Controller record incomplete; no dispatch')
    launch = rows[NEW_LAUNCH]
    ready = rows['managed-r3-controlled-controller-ready.json']
    live = data.get('controllerProcess')
    if not live or launch.get('status') != 'CONTROLLER_READY_REQUIRES_APPROVED_REQUEST' or ready.get('status') != 'WAITING_FOR_APPROVED_BUILD_REQUEST':
        raise RuntimeError('Live R2 controller readiness required')
    if (launch.get('schema_version') != 2 or launch.get('controller_revision') != 'r2' or launch.get('creation_flags') != 16
        or launch.get('child_created') is not True or launch.get('retained_failure_sha256') != FIRST_FAILURE
        or launch.get('caller_sid') != SID or launch.get('caller_session') != 3):
        raise RuntimeError('R2 caller/child facts mismatch')
    identity_gate(launch.get('caller_identity'))
    identity_gate(ready.get('identity'))
    if (launch.get('pid') != ready.get('pid') or live.get('pid') != ready.get('pid')
        or live.get('sid') != SID or ready.get('sid') != SID or live.get('session') != 3 or ready.get('session_id') != 3
        or live.get('parentPid') != launch.get('caller_pid') or ready.get('request_limit') != 2 or ready.get('validity_minutes') != 60):
        raise RuntimeError('Controller process/parent/Session identity mismatch')
    for v in (launch, ready):
        if (v.get('source_commit') != SOURCE or v.get('kit_sha256') != KIT
            or v.get('approved_registry_commit') != binding['approved_registry_commit']
            or v.get('approved_registry_sha256') != binding['approved_registry_sha256']):
            raise RuntimeError('Source/kit/approval binding mismatch')
    created = utc_ticks(live['creationDate'])
    caller_started = utc_ticks(launch['caller_started_at'])
    captured = utc_ticks(ready['captured_at'])
    now = utc_ticks(data['capturedAt'])
    if created < caller_started or captured < created or now < captured or now >= captured + 60 * 60 * 10_000_000:
        raise RuntimeError('Controller creation/time window mismatch or expired')
    return ready, live['creationDate']

def observation_gate(data):
    retained_failure_gate(data)
    failed = [n for n, v in records(data).items()
              if n != OLD_LAUNCH and (n.endswith('failure.json') or v.get('status') == 'FAIL')]
    if failed:
        raise RuntimeError('New controller/worker failure: ' + ','.join(failed))
    return not data.get('readsInProgress')

def worker_result_gate(result, phase, binding):
    expected = dict(schema_version=1, phase=phase,
                    status='BUILD_COMMAND_COMPLETED_REQUIRES_RETURN_REVIEW', build_exit_code=0,
                    sid=SID, session_id=3, source_commit=SOURCE, kit_sha256=KIT,
                    approved_registry_commit=binding['approved_registry_commit'],
                    approved_registry_sha256=binding['approved_registry_sha256'])
    if (not isinstance(result, dict) or any(result.get(k) != v for k, v in expected.items())
        or any(type(result.get(k)) is not int for k in ('schema_version', 'build_exit_code', 'session_id'))):
        raise RuntimeError('Exact successful worker result binding required: ' + phase)
    identity_gate(result.get('identity'))
    return utc_ticks(result.get('captured_at'))

def result_observation_gate(data, phase, binding, process_started, pinned_records):
    if not observation_gate(data):
        return None
    rows = records(data)
    hashes = {r['file']: r.get('sha256') for r in data['records']}
    if any(hashes.get(name) != value for name, value in pinned_records.items()):
        raise RuntimeError('Previously pinned launch/ready record drift')
    result = rows.get('managed-r3-controlled-' + phase + '-result.json')
    if result is None:
        return None
    result_time = worker_result_gate(result, phase, binding)
    if phase == 'BuildA':
        _, current_start = controller_gate(data, binding)
        if current_start != process_started:
            raise RuntimeError('Controller PID reused during BuildA; stop before BuildB')
        return 'LIVE_CONTROLLER_IDENTITY_RECHECKED'
    ready = rows['managed-r3-controlled-controller-ready.json']
    worker_result_gate(rows.get('managed-r3-controlled-BuildA-result.json'), 'BuildA', binding)
    completed = rows.get('managed-r3-controlled-controller-completed.json')
    if completed is None:
        if data.get('controllerProcess') is None:
            raise RuntimeError('Controller disappeared without complete terminal facts; lifecycle UNKNOWN')
        _, current_start = controller_gate(data, binding)
        if current_start != process_started:
            raise RuntimeError('Controller PID reused while awaiting completion')
        return None
    if (completed.get('status') != 'TWO_BUILD_COMMANDS_COMPLETED_REQUIRES_RETURN_REVIEW'
        or completed.get('pid') != ready['pid'] or completed.get('sid') != SID):
        raise RuntimeError('Exact controller completed PID/SID/status required')
    finished = utc_ticks(completed.get('captured_at'))
    captured = utc_ticks(ready['captured_at'])
    now = utc_ticks(data['capturedAt'])
    if finished < result_time or finished < captured or finished > now or finished >= captured + 60 * 60 * 10_000_000:
        raise RuntimeError('Controller terminal time binding mismatch')
    if data.get('controllerProcess') is not None:
        _, current_start = controller_gate(data, binding)
        if current_start != process_started:
            raise RuntimeError('Controller PID reused during BuildB')
        return 'COMPLETED_RECORD_AND_LIVE_IDENTITY_RECHECKED_EXIT_NOT_PROVEN'
    return 'COMPLETED_RECORD_AND_PROCESS_ABSENCE_EXIT_CODE_AND_TREE_CLEANUP_UNKNOWN'

def collect_available(phase):
    name = 'build-r3-a' if phase == 'BuildA' else 'build-r3-b'
    ps = "$ErrorActionPreference='Stop';$p='D:\\A9-A31-V26-MANAGED-20261003\\" + name + "\\result';[ordered]@{directoryExists=(Test-Path -LiteralPath $p -PathType Container)}|ConvertTo-Json -Compress"
    r = remote.ssh(ps)
    if r.returncode:
        raise RuntimeError('Return-presence query failed; preserve observation and stop')
    presence = json.loads(r.stdout.decode('utf-8-sig'))
    if not presence['directoryExists']:
        save_new('controller-r2-' + phase + '-native-return-not-present.json', presence)
        return None
    return original.collect(phase)

def run():
    global BIND
    BIND = head_gate()
    save_new('controller-r2-registry-head-binding.json', BIND)
    original.BIND = BIND
    original.head_gate = head_gate
    print('WAITING_FOR_APPROVED_R2_ORDINARY_DESKTOP_CONTROLLER', flush=True)
    deadline = time.monotonic() + 1800
    while True:
        data = snapshot()
        retained_failure_gate(data)
        rows = records(data)
        failed = [n for n, v in rows.items() if n != OLD_LAUNCH and (n.endswith('failure.json') or v.get('status') == 'FAIL')]
        if failed:
            save_new('controller-r2-first-failure.json', data)
            raise RuntimeError('New R2 startup failed; no build request issued')
        if not data.get('readsInProgress') and NEW_LAUNCH in rows and 'managed-r3-controlled-controller-ready.json' in rows:
            ready, process_started = controller_gate(data, BIND)
            save_new('ordinary-controller-r2-identity-live.json', data)
            pinned_records = {r['file']: r['sha256'] for r in data['records']
                              if r['file'] in (NEW_LAUNCH, 'managed-r3-controlled-controller-ready.json')}
            break
        if time.monotonic() >= deadline:
            save_new('controller-r2-start-wait-timeout.json', data)
            raise RuntimeError('No R2 controller observed; native build NOT_PERFORMED')
        time.sleep(5)
    for phase in ('BuildA', 'BuildB'):
        head_gate()
        current = snapshot()
        _, start = controller_gate(current, BIND)
        if start != process_started:
            raise RuntimeError('Controller PID reused; no next dispatch')
        original.dispatch(phase, ready)
        deadline = time.monotonic() + 1800
        observation_number = 0
        while True:
            data = snapshot()
            observation_number += 1
            save_new('controller-r2-' + phase + '-observation-' + str(observation_number).zfill(4) + '.json', data)
            try:
                verdict = result_observation_gate(data, phase, BIND, process_started, pinned_records)
            except Exception:
                save_new('controller-r2-' + phase + '-first-failure.json', data)
                collect_available(phase)  # Diagnostics only; never authorize the next phase.
                raise
            if verdict is not None:
                save_new('controller-r2-' + phase + '-final.json', dict(observation=data, lifecycle_verdict=verdict,
                         controller_exit_code='UNKNOWN', controller_tree_cleanup='UNKNOWN', relock='NOT_PERFORMED'))
                returned = collect_available(phase)
                if returned is None or returned['buildResult'].get('status') != 'PASS':
                    raise RuntimeError(phase + ' failed; evidence preserved; no downstream dispatch')
                print(phase + ' RETURNED_NATIVE_PASS_REQUIRES_INDEPENDENT_REVIEW ' + verdict, flush=True)
                break
            if time.monotonic() >= deadline:
                save_new('controller-r2-' + phase + '-observation-timeout.json', data)
                raise RuntimeError('Observation timeout; no downstream dispatch')
            time.sleep(8)
    print('TWO_R2_RETURN_PACKAGES_COLLECTED_CONTROLLER_LIFECYCLE_NOT_SIGNED_NO_RELOCK', flush=True)

if __name__ == '__main__':
    run()
```

最终代码定向证据：`controller-r2-strict-identity-types-20261003T052125Z.json`（16项）与
`controller-r2-final-result-gates-20261003T052158Z.json`（23项）均PASS，绑定最终02a25bc8…源码。
这些是本地谓词/模拟派发证据；远端派发、真实身份/native/Electron/Win7仍NOT_PERFORMED。

## 最终独立复核及登记就绪

独立Luna/high复核人 `/root/a9_31_controller_r2_independent_review` 回传
PASS_FOR_R2_SOURCE_REGISTRATION_ONLY，最终P0/P1/P2=0/0/0。
[复核报告](../reports/2026-10/a9_31_managed_r3_controller_r2_independent_review_2026-10-03.md)
已据回复存档，原首失败保留。负责人前述条件式四路径提交授权现已满足。
Status: AUTHORIZED_AND_INDEPENDENTLY_REVIEWED_FOR_REGISTRATION；
registry只追加controller_retries，原kits不改；双构建/实际身份/目标平台仍NOT_PERFORMED。

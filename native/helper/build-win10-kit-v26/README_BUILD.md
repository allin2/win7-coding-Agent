# A9-30 D-013 v26：离线构建与返回合同

本目录可处于未绑定源码模板或已生成套件状态。以 SOURCE_COMMIT.txt、SOURCE_COMMIT_TIMESTAMP.txt、
input-lock.json 和 PACKAGE_MANIFEST.json 的实际内容判定输入是否绑定；模板中的 NOT_LOCKED 值或缺失锁/manifest 不能用于构建。
生成套件的精确源码与输入哈希已绑定，不代表产品 helper 已构建或套件已获批准。
正式批准以干净 HEAD 中的 a9-v26-approved-build-kits.json 登记为准；隔离 TEST_ONLY 证据不能冒充真实 Windows 构建。

## 绑定与封装（源码提交获准后）

在 A9-30 分支记录准确干净源码提交及其 `%cI` 时间到 SOURCE_COMMIT.txt / SOURCE_COMMIT_TIMESTAMP.txt，执行：

```sh
node native/helper/build-win10-kit-v26/prepare-kit.cjs
node native/helper/build-win10-kit-v26/package-kit.cjs --out <新的绝对路径>/A9_30_V26_BUILDKIT_r1.zip
```

生成器校验所有 13 个原生源文件与该 Git commit 字节一致，完整校验后才写锁与快照。
封装器拒绝额外/缺失文件、符号链接、哈希错配和覆盖旧包。技术状态 READY_FOR_WIN10_BUILD 不等于批准；
新 ZIP、input-lock、PACKAGE_MANIFEST 哈希须经独立审阅加入 a9-v26-approved-build-kits.json 并获准追加提交。

## 构建机及两次独立执行

负责人指定构建机和非提升执行用户后，只读预检并审批写入目标。固定 Windows 10 x64、Windows PowerShell 5.1 Desktop、
VS2019 16.11/MSVC 14.29 v142、SDK 10.0.19041.0、静态 /MT。离线，不安装或下载组件。
身份必须实测普通角色、TokenElevation=false、ElevationType=Default/Limited、Medium SID/RID 8192 及无 Host Job；缺失或未知拒绝。
-TestBuildIdentityOnly 只输出身份并检查，不生成正式返回包；管理员角色禁用仍可能是提升令牌，不作为降权证明。
工具实际路径、版本、SHA-256 均进入证据。路径映射为 C:\a9-v26-kit，源码/对象参数为相对路径。
系统身份由实际 .NET Windows 版本与只读 HKLM CurrentVersion 交叉核对，不要求普通账户具备 WMI 权限。
必须为 Win32NT/x64、10.0、build 10240–21999，注册表产品为 Windows 10、Client，major/minor/build 与运行时一致，UBR 已知。
缺项、类型错、矛盾、Server、Windows 11 或未知版本均拒绝；探测来源及 UBR 写入 environment.json。不调整账户、WMI 或系统策略。

同一批准 ZIP 解压到两个全新目录，例如 C:\a9v26-a 和 C:\a9v26-b。目录需负责人具体授权；
脚本拒绝复用已有 work/output/evidence/result，不删除历史文件。每个目录运行：

```cmd
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build.ps1 -TestSmokeRequestOnly
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
```

v1 回归的完整性标签设置需要私有 fixture 的 WRITE_OWNER。构建机只授 Modify 时，默认入口会明确拒绝缺失前置，
不提升账户、不跳过 smoke。仅在负责人批准两个新构建目录内 `work\smoke\allowed`、
`work\smoke\cancel-allowed` 的本人、不继承、单个 WRITE_OWNER ACE 后，正式入口可增加 `-AllowV1FixtureWriteOwner`。
该标志不适用于父目录、protected、v2/v3 工作区或任意路径；目录须新建、空、无重解析点并由当前普通用户拥有。
使用 Raw CommonAce 精确写入 0x80000，拒绝额外权限、旧 ACE 字节/顺序或 owner/group/control flags 改变；
实际 WRITE_OWNER 句柄证明通过后才启动 helper。写入/验证失败停止，尝试恢复原 DACL，清理未知不标 PASS。
授权与读回记录写入已有 environment.json 并随返回包哈希绑定；helper 的恢复比较基线包括这条已批准 ACE。
v1 保留历史标签应用结构判据；回滚后仍按原标签快照比较，并要求 DACL/owner 无漂移。该目录权限标志不代表具体写入授权，需与批准记录配套。

-TestSmokeRequestOnly 保留原 v2 请求复制自检，不能替代构建。主入口完成 logic/capture/v1/v2/v3、PE/API/CRT 与 manifest。
v3 检查两秒 tick/双源、UTF-8/CP936/UTF-16LE 字节、无换行、上限、取消、暂停消费者；stdout 原始协议 bytes 先写证据，
每帧接收时间相对于单调时钟记录。输出 JSON 不等于产品脱敏证明；秘密测试只能用合成 marker，不能注入真实凭据。

PASS 返回包名 WIN7_D013_V26_HELPER_ARTIFACTS_<时间>.zip；失败只返回 DIAGNOSTICS，保留 first-failure，不能用于锁定。
两个返回 ZIP/run-id 必须独立，helper.exe 必须逐字节相同。背压导致缺失终态时，只能证明 fail-closed、有界退出；清理保持 UNKNOWN。

## 返回记录（独立复核后）

回传两份 ZIP 及各自 .sha256，先由独立复核人审阅原始证据。获负责人授权后，
在原批准 kit 的登记项追加 return_review（状态 APPROVED_FOR_INPUT_LOCK、独立复核人/实现人、reviewed_at、
复核报告 SHA-256、两组精确 run_id/ZIP SHA-256），追加提交；登记与干净 HEAD 一致后再执行：

```sh
node scripts/release/record-a9-v26-helper-input.mjs \
  --kit-zip <批准的套件ZIP> \
  --runner-zip <第一份返回ZIP> --sidecar <第一份.sha256> \
  --runner-zip-2 <第二份返回ZIP> --sidecar-2 <第二份.sha256> \
  --base-lock release/win7-product-v3/a9-27-win7-42-input-lock.json \
  --output release/win7-product-v3/a9-v26-input-lock.json
```

记录器独立验证 PE 字节及完整证据绑定、v3 协议/时序/编码、工具身份、普通用户、批准登记与 committed source。
批准登记必须是干净 HEAD 文件；CLI 无 testOnly 旁路。返回缺失、结构化 FAIL、复用 run-id/ZIP、不同 helper 或原生工件未锁定均拒绝。
新锁用于 A9-30 开发检查包，标识 A9-30-DEVELOPER-INPUTS-D013-V26；不分配 WIN7-43、不附正式 authority。
其真实性仍依赖负责人指定的独立执行/复核，脚本校验不是密码学远程证明。

## 后续实测

新锁形成后，在独立 Windows Electron 22/Node 16 数据目录完成真实链路 S01–S06、脱敏出口、审计失败、Stop、滚动/焦点和恢复。
真实 Win32、构建/双构建、实际 Electron及 Win7 目前 NOT_PERFORMED；完成本模板和本地测试不能登记 DEVELOPER_VERIFIED。

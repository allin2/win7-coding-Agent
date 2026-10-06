# A9-30 r5 源码提交、宿主预检与控制入口修复

日期：2026-10-02（Asia/Shanghai）。分支 `codex/a9-30-shell-streaming`，源码 HEAD `27a1de9501d2295c8d222a32ef83b8ffb9e1e53b`。

## 结论与证据边界

负责人批准的五路径提交已完成；未推送、合并或改写历史。r5 kit 已生成并传至批准的 control 目录，独立源码/ZIP闭包复核通过；正式 staging、双构建、返回复核、产品重锁、真实 Electron、Win7 均 `NOT_PERFORMED`。整体 `DEVELOPER_VERIFIED` 未签发。

当前账户 a9builder 的 SID 为 `S-1-5-21-3031939772-989444280-3099258187-1005`。Bitvise SSH 连接成功；同账户显式 breakaway 子进程实测普通用户、非提升、Medium RID8192、无 Host Job。未改账户、WMI ACL、UAC、服务或安全策略；未使用管理员执行正式构建。

r5 现有已提交脚本在 `VERIFY_BUILD_HOST` 使用 Get-CimInstance；该身份下 CIM 与 WMI 均拒绝访问。因此在启动正式构建前停止，不制造一个明知前置失败的构建 run。正在准备经过验证的源码修正；这不改变已冻结 r5 ZIP，也不把 WMI 失败改记为 PASS。

## 已批准提交及套件绑定

提交 `27a1de9501d2295c8d222a32ef83b8ffb9e1e53b`，提交时间 `2026-10-02T03:59:57+08:00`，五个准确路径：

- native/helper/helper.cpp
- native/helper/build-win10-kit-v26/build.ps1
- native/helper/build-win10-kit-v26/README_BUILD.md
- release/win7-product-v3/a9-v26-approved-build-kits.json
- docs/reports/2026-10/a9_30_r4_win10_first_build_failure_2026-10-02.md

r4 已撤销登记；历史源码、套件、run 与诊断均保留。r5 包为 `A9_30_V26_BUILDKIT_r5.zip`，90,660 bytes，23 文件、13 native source。2026-10-02 04:06:39，独立复核人 `/root/a9_30_r4_label_review`（gpt-6-luna/high）确认所有锁定 source/kit blobs 与此提交字节一致，source 时间及完整 manifest 闭包相符。

| 项目 | SHA-256 |
|---|---|
| ZIP | 404c39708cf396e9161d0af820c71988436d323e413abd03c462027b08d317fb |
| input-lock.json | 52ac05514ed24fc64ccaf17d58f3d436b32b415a5248aabca6cef5935c2edaa7 |
| PACKAGE_MANIFEST.json | ed1b85262395a93f63a9c40a5950f6882893c374e61d07bbad12ee63726bbc35 |

套件状态 `PACKAGE_READY_NOT_APPROVED`；原始五控制脚本复核 P0=0/P1=1/P2=2，未投放执行正式入口。原字节保存在 `.acceptance/a9-30-developer/closeout/control-scripts/r5-reviewed-original-20261002/`。

## 新宿主探测修正（尚未提交）

只修改白名单内 build.ps1、README_BUILD.md 和 v26-prepare-kit.test.mjs：实际 .NET OSVersion 与只读 HKLM CurrentVersion 交叉核对，替代 WMI 依赖。要求 Win32NT、x64、10.0、build10240–21999；registry ProductName 为 Windows10、InstallationType=Client，major/minor/build 必须与实际运行时一致，UBR 必须已知且非负整型。缺项、类型错误、矛盾、Server、Win11、旧/未知版本均拒绝；读取失败直接传播到结构化构建失败。探测来源及更新号记录到已有 environment.json。

不增加原生 API、依赖、账户权限或系统策略；v142/SDK19041、静态CRT、PE/API、身份/Job、v1/v2/v3 smoke、返回包与双构建门保持。实际SID1005无Job PS5.1测试为 1正/20负 PASS，真实宿主 Windows10Pro / 10.0.19045.0 / build19045 / UBR6466，与已知只读事实一致。此证据只证明预检函数，不证明新 helper 构建/执行。

## 控制入口修正

- stage/worker 检查批准目录及所有祖先的 Directory 与 ReparsePoint 属性，拒绝 junction/reparse 导致的写入范围逃逸。
- worker 以 CreateNew 预留控制台日志，既有首失败日志拒绝覆盖；BuildB 必须有准确相同 source/kit/SID/审批绑定的成功 A 结果。
- launcher/controller/worker 显式传递精确 registry commit/blob SHA，worker 校验实际 registry 快照字节及唯一批准 kit、source、lock、manifest、独立审查字段，结果回显绑定。
- `verify-r5-registry-head.py` 是本地只读前置：核对 registry 与 HEAD 字节/状态（主代理另行核对 A9-30 分支）、批准条目及精确源/包/锁/manifest、独立报告 SHA 与 HEAD 字节。只能将该步骤成功输出的 commit/blob SHA 用作控制参数；当前 r5 无批准登记，实际负向执行正确拒绝，不输出可用批准参数。源码修正后必须绑定新 kit，并重做对应独立复核/登记/控制入口绑定，不复用 r5 占位值。
- launcher 准备失败时仅终止自己创建的 controller，并等待该进程；其余子进程清理明确保持 UNKNOWN，不能冒充进程树证明。未发正式构建请求。

## 检查记录

| 检查 | 结果与限制 |
|---|---|
| Node20.17 v26-prepare-kit.test.mjs | 46 PASS / 0 FAIL / 2 Windows平台SKIP；当前测试/源码哈希绑定到检查摘要 |
| PS5.1 新宿主门 AST/实际执行 | 解析0；1正20负；无Job SID1005真实宿主 PASS，native NOT_PERFORMED |
| PS5.1 五控制文件 | 解析0；源码哈希与本地一致 |
| 实际普通路径 | control、build-r5-a/b 三路径门通过 |
| 控制反例 | 路径门1正3负、审批门1正19负，均 TEST_ONLY mock；不是正式审批/构建证据 |
| CreateNew 日志保护 | 真实测试日志第二次新建被拒绝，首记录 SHA 未改变，文件保留 |
| HEAD 批准前置 | 退出1，正确拒绝尚未登记的 r5；下游 NOT_PERFORMED |
| 首轮控制测试 | DirectoryInfo.Parent 缺 provider 的 PSIsContainer，错误拒绝普通祖先；r2原始失败 stderr 保留，修正为 Directory 属性位后r3通过 |

原始证据均位于 `.acceptance/a9-30-developer/closeout/`：
`r5-source-commit-approval-execution.json`、`r5-kit-binding.json`、`r5-control-and-kit-transfer-verification.json`、
`r5-nojob-host-readonly.stdout.json`、`r5-standard-os-alternate-readonly.stdout.json`、
`v26-host-gate-review-r1.stdout.json`、`r5-control-gates-review-r2.stderr.bin`、`r5-control-gates-review-r3.stdout.json`、
`r5-host-gate-and-control-checks-r1.json`、`r5-build-directories-still-unused.json`。失败、旧版本和 TEST_ONLY 事实均不删除/改判。

2026-10-02 04:16:04 只读复查，两个已批准 r5 目录仍为空、无 reparse，未消耗正式构建目录。后续新源码/kit 获批后可沿用这两项已批准目标及四个准确 v1 fixture WRITE_OWNER 范围，不扩目录或账户权限。

## 待具体授权的准确源码提交

以下四路径修改准备完成后才申请追加本地 source commit（不推送/合并）：

- native/helper/build-win10-kit-v26/build.ps1
- native/helper/build-win10-kit-v26/README_BUILD.md
- scripts/release/test/v26-prepare-kit.test.mjs
- docs/reports/2026-10/a9_30_r5_win10_host_preflight_2026-10-02.md

任务书 A9-30 §4 对源码提交另需授权。此前五路径批准已执行，不能将它静默扩大为此次不同源码差异提交。新 source 取得后按既有授权从干净checkout生成新修订 kit，经独立复核通过追加套件/批准登记，再在原批准空目录执行双构建。未提交修正不拼装进旧套件；当前不签发新输入锁或 DEVELOPER_VERIFIED。

## 最终独立增量复核

2026-10-02 04:16:10，独立只读复核人 `/root/a9_30_r4_label_review`（gpt-6-luna/high）完成 OS 门、控制修正与 HEAD 绑定步骤的增量审查：P0=0/P1=0/P2=0。复核人只读文件并复算哈希，未运行脚本、构建或远端操作；主代理实测在独立复核中为 INHERITED_EVIDENCE。结论为材料可供下一步具体审批，不能登记正式 kit/build PASS。

| 复核字节 | SHA-256 |
|---|---|
| build.ps1 | 66ba584b439ae5cffad0469d562ab584b4198a05b18eea9d8f6316fa0a1acc8a |
| README_BUILD.md | 797ef1199de5243d82f20d45f059739440d7c2f8aefcfc028d705830f1cd9fe5 |
| r5-standard-worker.ps1 | 8772a9fd1a021e18d63791abc41dc1180727a80732520740cc2a74247e9f9a89 |
| stage-r5-kit.ps1 | 1ba0d39746f9fb1ef0fa934b66c981da797f6570ff584a38dfff55ff5411b526 |
| serve-r5-controlled-build.ps1 | 0a339e37b2c1a09a541a2e527c3e283f6f48d33e18ddea057ec93f1cfa2b04a7 |
| launch-r5-controlled-build.ps1 | 9ff9b7b9e4c1c651c6af70a374d089fbdbb85df6082edc1a4fd9e2b54deaa598 |
| test-r5-input-closure.ps1 | 8272d2f98e5dfa6ae43d32aace04f4022edc85cac80486afa5b854ba13ccd030 |
| verify-r5-registry-head.py | dbdcc49ec69960050c9f43a28f27ee69cb8c31eb16fccd3d13f198d5c166993a |

控制脚本位于 closeout/control-scripts。后续新 source/kit 必须重新绑定、核对字节并独立复核，不使用目前 r5 控制参数启动修正后的正式构建。

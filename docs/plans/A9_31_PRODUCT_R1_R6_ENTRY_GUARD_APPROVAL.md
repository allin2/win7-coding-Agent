# A9-31 product r1：R6 新入口、防重复启动与历史硬停止隔离审批

```text
Status: READY_FOR_OWNER_EXACT_SCOPE_APPROVAL
Branch: codex/a9-31-background-tools
HEAD/product source: 35a19250ed6589f6a7ba35b940a784325970c111
Decision: ADR-0164 Proposed
R6 implementation / deployment / execution: NOT_PERFORMED
```

## 1. 问题、成功条件与继承边界

[本次直接证据](../reports/2026-10/a9_31_r5_manual_restart_guard_failure_2026-10-03.md)：R5 计划任务身份门失败后留下 HALTED。代理随后误给旧命令，用户启动的普通窗口 noHostJob 通过，但冻结 launch 未检查旧 final，产生另一进程的 start/ready。产品请求仍为 0。旧 R5 永不继续、覆盖或改判；当前窗口已收到原固定 stop，退出仍 UNKNOWN，先解决这项生命周期事实。

成功条件：使用新 R6 根和新 master；同一根最多取得一次控制器所有权。有旧 claim/start/ready/final/stop 或并发重复启动时，在写共享运行记录及创建任何 worker/Electron 前拒绝，不生成第二 controller 终态污染第一进程。不删除文件以恢复入口，不改变普通桌面门、捕获 UNKNOWN、失败停止或审批门。

沿用 R5 已成功预编译的 DLL，保留原编译记录与原批准来源。无需再次编译 C#、重建 helper 或打包产品。原来的源、DLL、编译、批准哈希只表示原准备事实，不改绑到 R6。R6 的普通产品阶段必须取得本轮直接证据。

## 2. 精确实施路径及格式

仍仅四处外部源：

1. `.acceptance/a9-31-developer/product-r1/control-scripts/stage-product-r1.ps1`
2. `.acceptance/a9-31-developer/product-r1/control-scripts/launch-product-r1-desktop.ps1`
3. `.acceptance/a9-31-developer/product-r1/control-scripts/serve-product-r1-desktop.ps1`
4. `.acceptance/a9-31-developer/product-r1/control-scripts/product-r1-driver.cjs`

四源 R5 冻结副本保持不变。新源仅必要 R6 根/批准绑定、入口所有权防护、原 capture-build 批准来源校验及原八组夹具定向修复，不改产品/native/C#捕获算法。

launch 在现有身份、完整性准入及派发前检查历史证据；用现有 `FileMode.CreateNew` 原子取得唯一 `evidence/dispatcher-entry-claim.json`。未取得 claim 的重复实例不得写共享 start/ready/final；失败输出只属于本次拒绝调用。claim schema1 固定字段为 schema_version、master_sha256、dispatcher_pid、creation_ticks、started_at、valid_until；生成者须持有实际 Process 实例，后续 start 与 claim 精确匹配。禁止按 PID 数字覆盖旧 claim。

master/revision/checks 的 capture_library 严格新增 `build_approval_sha256` 字段，固定为 R5 编译批准证据 SHA `bc3b6bfa7d5e301ccda81de2ec20f3ec38dada213113821690d15c2c41ff6575`。inputs 新增 `capture-build-scope-approval.json`，逐字节复制 R5 scope-approval；验证其准确 SHA、source、状态 `OWNER_APPROVED_EXACT_R5_SCOPE` 和原合同 SHA `b254c07c6557a573609eb8d0004deeea6853c4cf82e19403405ed322ccf37fd9`，并与原 capture-build.scope_approval_sha256 匹配。R6 自身 scope-approval/master/revision/registration 绑定新批准快照，不能用旧批准取代新执行批准。其他字段严格按现有 schema、额外或缺失均拒绝。

准确 DLL SHA `71a2ef1487ef021d1094506ad0acb449b5a3766a99244ecd971cb4842f1f046e`、10752 bytes；build SHA `753e66442fd17c4ce0c08b14590c4ec68fc909d3b51c6d5ea53e769b2a734a24`、MVID `7641ed56-a984-43c7-915f-ca93e08e1f70`、源/工具/参考闭包沿用原真实记录。新 loader 校验同一 DLL 字节再 Reflection.Load，不源编译或搜索回退，不调整系统执行策略。

## 3. 准确远端及停止范围

仅 `192.168.1.4 / WIN-2JQ66JE4HTQ / Win10build19045`，新根：

```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261003-R6
```

顶层只 inputs/control/requests/runs/evidence；沿用固定三 PS、四源不可变 revision 目录、严格命名检查/批准登记、九字段 requests、32 位 run-id 下五固定目录、固定输出文件。新增源路径外的内容只为本合同列明的派生输入/证据，全部 CreateNew；不复制旧 run 到新根。

R2 package/host/四输入与 R5 capture DLL/build/scope-approval 只读复用、验证全闭包。R6 inputs 内三 capture 来源文件是新准确副本，无编译目录。部署前空闲 ≥2GiB、每请求 ≥1GiB、R6根 ≤1GiB，reparse/未知余量拒绝。Administrator SSH 只传输、校验、调度及回收。

普通执行仍准确 SID1005/Session3/Medium8192/Ordinary=true/Elevated=false/noHostJob。允许经既有真实桌面 Windows Run 入口启动 R6 一次，优先代理 Computer Use；不能改用原计划任务、管理员、Session0、解绑 Job 或 SYSTEM。若 GUI 不可用，只暂停桌面动作，本地检查及已批准部署继续，不承诺无条件自动启动。

旧 R5 PID36076/creation639266265512707074 的停止仅使用已有准确 stop 或经可见桌面对该控制器窗口执行 Esc 解除控制台选择，再按正常关闭；关闭前经 SSH 绑定并跨动作持有同一 Process 实例，观察真实退出、树与旧 final 原字节。没有产品请求时也不伪造 exit0；观察不到实际退出记 UNKNOWN，不使用任意 PID/taskkill/提升权限。若原实例已经退出，只记录缺少跨退出句柄的边界及当前身份快照，不补签未知退出码。未证明旧控制器不会继续派发前，不启动 R6 产品请求。

本批准不新增计划任务、服务、注册表或账户/ACL/UAC/Bitvise/许可证操作，不强制终止未知实例。

## 4. 定向检查、冻结与执行

实施后运行 Node 语法/68 项、物理 784 产品闭包；按精确函数/调用/输入哈希判断可继承的 ASAR 八负例。实际 PS5.1 三解析、现有 237 判据、22 项实际程序集/捕获/文件用例必须针对变化重跑。

新增入口正负例：全新根单次可获得 claim；已有 claim/start/ready/final/stop 分别拒绝；两个调用并发只有一个得到 claim；失败身份终态后拒绝再启动；拒绝实例零 worker/零产品请求且既有记录 hash 不变；claim 的 master/PID/creation/有效期错配拒绝。隔离负例仅在新 run 内测试副本，不污染正式 evidence。新增 capture 原批准缺失/错误/source/contract/status、R6批准与原build批准混用、额外字段负例。真实第二次启动保护不得硬停止第一控制器或重置限额。

检查通过后登记所有实际源码、检查记录、DLL/build/两批准来源及新 master/revision SHA，冻结三 PS/安全协议/程序集。首个普通窗口前完成完整 784 产品/73 宿主检查；冻结后不热改固定脚本。八 phase、120分钟、16请求、Boot→Shell先跑及其余六组保持；ReleaseExit丢回执/取消竞态必需补充不删除。至少一次普通失败后在同 dispatcher PID/creation/master 下换已检查不可变 driver revision取得新run成功；普通夹具失败且真实树结束才继续等待。硬失败立即停止，后续根另立准确合同。

桌面首次启动后通过 SSH 发固定请求及回收证据，不要求每个普通 driver 修复由用户重启 PowerShell。启动、当前候选/运行记录和已有硬停止在每次给出指令前重新读取，不能只依赖摘要或旧准备状态。

## 5. 审批范围与排除

请求批准§1–4及ADR-0164：四源必要实施/定向修复、R6准确派生目录/输入/装配、旧R5正常停止取证、新普通桌面一次启动及八组有限测试。实际hash形成后登记，不占位；普通driver修改在同范围定向检查/不可变版本登记后重试，不另求同范围批准。

这是硬停止后的新准确合同；原R5/ADR-0163不自动授权这项动作。批准前只写文档、读取和保存现有证据，不实施R6或写其远端目录。无提交/推送/合并/发布、产品/native/锁变化、委派、Win7、WIN7-43、独立审核/DEVELOPER_VERIFIED/Alpha2/RC裁决。保留全部历史失败和UNKNOWN。


## 6. 负责人具体批准

负责人回复“批准”，批准§1–5及ADR-0164；批准前合同SHA `2c182fe41f9195923ab34a11b61255e793ee58074e71974e3f0ce19c215d7aeb`，证据 `.acceptance/a9-31-developer/product-r1/owner-r6-execution-approval.json`。实施及新准确R6部署/普通窗口按该合同执行，旧R5不复活；前文待批状态保留为历史。

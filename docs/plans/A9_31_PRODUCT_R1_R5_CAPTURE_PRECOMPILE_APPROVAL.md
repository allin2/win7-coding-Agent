# A9-31 product r1：R5 捕获代码预编译及准确桌面重试审批

```text
Status: READY_FOR_OWNER_EXACT_SCOPE_APPROVAL
Branch: codex/a9-31-background-tools
HEAD/product source: 35a19250ed6589f6a7ba35b940a784325970c111
Decision: ADR-0162 Proposed
R4: HALTED / compiler lifecycle UNKNOWN retained
R5 implementation / compilation / deployment / execution: NOT_PERFORMED
```

## 1. 具体问题与修复

[R4首失败](../reports/2026-10/a9_31_product_r1_r4_boot_compiler_capture_failure_2026-10-03.md)：普通桌面启动通过，但worker初始化Add-Type产生短命编译器的路径与捕获竞态相符，实际观察csc.exe PID33576未能持有句柄，HALTED。R4合同明确冻结PS改变、硬失败后的恢复须新具体合同。

仅把现有A31Capture的编译移动到部署准备阶段。固定C#片段来自冻结R4 serve，UTF8无BOM/LF、7700 bytes、SHA `7fe2e6db6b49247da7dc8d6c034bced5bbe88aab84889481ed9c3ec4006269b1`；不修改捕获算法、令牌/Job/API或UNKNOWN硬停止判据。普通dispatcher/worker不执行Add-Type源编译，只校验并从已校验的同一字节数组加载程序集。

编译产物仅属于外部Win10验证夹具，不是D-013 helper，不改变managed锁或产品。此合同不证明该程序集在Win7可运行，不把本机Framework4.8.1推为Win7前置；后续Win7测试入口仍须另立目标兼容合同。

## 2. 精确四源路径及准入变化

仅以下原四外部验证源；文档/ADR按仓库文档规则：

1. `.acceptance/a9-31-developer/product-r1/control-scripts/stage-product-r1.ps1`
2. `.acceptance/a9-31-developer/product-r1/control-scripts/launch-product-r1-desktop.ps1`
3. `.acceptance/a9-31-developer/product-r1/control-scripts/serve-product-r1-desktop.ps1`
4. `.acceptance/a9-31-developer/product-r1/control-scripts/product-r1-driver.cjs`

stage增加固定预编译准备模式，保留普通只读装配模式；serve移除运行时源编译，先验证master pin、范围批准、固定PS和capture程序集行，再从已读并验hash的字节加载。源片段作为派生输入，不能替换成任意C#或用户代码。launch在WAITING前和每请求核对程序集闭包；driver可登记无worker编译器的新验证元数据，沿用原八phase及普通版本修复范围。

新master/revision继续schema1，严格新增capture_library闭包行，绑定准确源SHA、编译工具/Framework参考程序集SHA、编译成功记录SHA、DLL basename/尺寸/SHA和Runtime Profile；未知/缺失/额外字段或依赖拒绝。不得从当前目录/系统其他DLL搜索回退，不通过改变PS执行策略或系统权限使装配通过。冻结后程序集与三PS/安全协议不能热改；driver修复仍定向检查并登记新不可变revision，不重置窗口限额。

## 3. 准确目标、派生文件与编译身份

仅 `192.168.1.4 / WIN-2JQ66JE4HTQ / Win10build19045`，新根：

```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261003-R5
```

准确顶层子目录仅inputs/control/requests/runs/evidence。control增加compile子目录，仅派生`capture-source.cs`、`capture-library.dll`、`compiler-stdout.txt`、`compiler-stderr.txt`、`compile-result.json`、`isolated-temp`；最后者只承载编译器临时文件，全部保留，不清理。inputs新增固定`capture-library.dll`和`capture-build.json`；其余master/revision/checks/scope-approval/registration/检查记录、control/revisions/<64位SHA>四固定basename、九字段requests、runs/<32位id>五固定子目录，沿用R4严格派生和CreateNew规则。编译副本与运行副本必须逐字节一致。

Administrator SSH仅在该compile目录执行既有Microsoft .NET编译器、持有并等待该编译器Process实例，读取实际exit/stdout/stderr和完整输出；这一动作是测试夹具准备，不是普通产品证据。输出、TEMP/TMP均绑定该目录；不安装工具或修改系统配置。普通产品仍仅SID `S-1-5-21-3031939772-989444280-3099258187-1005`、Session3、Medium8192、非提升、Ordinary=true、noHostJob；每次实际核对。沿用现有继承权限，不更改ACL/owner/账户/UAC/Job/Bitvise/许可证。

固定编译器为现有 `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`：只读预检Microsoft签名Valid、4.8.9232.0、2569696 bytes、SHA `aae1db57f898ca8bda18590c56f86ced6d0ead80c22033b76fdfe9119706f116`。参考mscorlib SHA `cbba0b14d43901ff3d92cc44efe6a79149bfcaa3006c08ca05e186b2a75b54b5`，System.Core SHA `78c77c7250b6e318e69c1162980640bf7da5e8d3303d3abcc32401a52d667139`；System.dll及编译所需其他既有Framework参考必须先只读核实并登记准确版本/签名/hash。前置缺失、漂移或需要新软件则停止准备，不猜hash或安装补齐。

只允许将上述固定C#编译为library、AnyCPU、.NET4系列，引用核验后的既有Framework程序集，不执行任意编译命令。编译实际失败保留首失败；可在同准确compile内以新32位run-id子目录、相同固定文件名/隔离temp进行必要定向重试；每次记录准确source/tool/ref/参数/真实exit/输出，选定成功DLL后再生成唯一正式inputs副本。编译器未知退出阻断冻结。产品/native/锁/完整784产品和73宿主闭包只读复用R2，不新打包或重建helper。

初次余量≥2GiB、每产品请求≥1GiB，R5根≤1GiB；拒绝reparse/旧文件覆盖，不足停止并保留全部历史证据。

## 4. 检查、冻结及自动执行

本批准申请覆盖§2四路径必要实施/定向修复、§3准确准备/编译/部署与本节新窗口执行；所有实际hash形成后登记，不用占位hash。源片段字节锁保持上述7700 bytes及SHA，不扩展C#功能。

必跑：Node语法/68请求、物理ASAR、abort正负检查；实际PS5.1三解析、schema/request/revision/期限/限额/UNKNOWN判据；实际程序集加载及12捕获/abort检查。新增缺失DLL、额外闭包字段、源/工具/参考/DLL错hash、失败编译记录、reparse、非法尺寸、错误程序集类型/版本、未经批准登记拒绝。负例不替换正式inputs，使用准确run内隔离副本。

在实际PS进程加载固定DLL、调用Token/Snapshot/捕获/Drain并结束，监督其实际树；直接验证普通worker初始化不再产生csc.exe。这是直接检查，不能仅用字符串搜索声称无编译器。其他快速进程无法绑定仍HALTED，不改成忽略或容错成功。准备阶段Administrator/API预检和普通桌面产品证据分别登记。

三PS/master/程序集/范围批准/检查记录在首正式窗口前冻结；新普通桌面一次启动、最多2小时16固定请求。Boot→Shell先跑，通过后原六组。普通夹具失败且真实持有树结束才可等待SSH新driver revision重试；至少一次同PID/creation/master下失败→新checked revision→新run成功证明复用。身份/完整性/安全/审计/生命周期未知立刻HALTED，不复活R4或R5。ReleaseExit丢回执/取消竞态原必需补充不删除。

GUI仅必要启动/真实交互，优先Computer Use确认焦点后直接键入，启动以SSH start/ready及普通身份记录为准；测试期间从SSH派发/回收。新固定PS、安全协议或硬停止后恢复仍需准确新合同，普通driver版本修复无需重复审批/人工重启。

## 5. 历史与排除范围

R4已持有worker/Electron真实exit1；csc.exe exit/creation UNKNOWN，R3及旧native P1/UNKNOWN仍保留，不改判。R5未实施前不修改冻结源/输入、不执行编译/远端写入。不得提交/推送/合并/发布、改产品/native/输入锁、扩大账户/权限或安装/启用服务；不委派、不执行Win7、不分配WIN7-43，不签独立复核、DEVELOPER_VERIFIED、Alpha2或RC。


## 6. 负责人实际批准

负责人回复“批准”，批准§1–5及ADR-0162，批准前合同SHA `b254c07c6557a573609eb8d0004deeea6853c4cf82e19403405ed322ccf37fd9`；准确证据 `.acceptance/a9-31-developer/product-r1/owner-r5-execution-approval.json`。实施/准备编译/部署和普通桌面新窗口按上述合同执行，前文待批状态保留为历史。不恢复R4或扩大范围。


## 2026-10-03 后续普通实例与旧根禁止继续

后续用户按代理给出的旧指令启动PID36076，普通/noJob身份通过，但原计划任务HALTED final仍在；冻结launch仅查start，缺少旧final/并发claim防护。未派发产品，已用固定stop，实际退出UNKNOWN。[新事实报告](../reports/2026-10/a9_31_r5_manual_restart_guard_failure_2026-10-03.md)分别保存两实例，禁止把新ready改判旧失败。R5不继续；新准确R6合同/ADR-0164仅待批材料，不扩展本次历史授权。

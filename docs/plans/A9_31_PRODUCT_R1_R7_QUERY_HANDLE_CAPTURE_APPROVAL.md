# A9-31 R7：Renderer 夹具修复与查询句柄捕获合同

日期：2026-10-03。分支 `codex/a9-31-background-tools`，产品 source `35a19250ed6589f6a7ba35b940a784325970c111`。

Status: PENDING_EXACT_CAPTURE_AND_REMOTE_APPROVAL

负责人本轮“批准批准”授权处理 [R6 首失败](../reports/2026-10/a9_31_r6_cua_errors_and_boot_capture_failure_2026-10-03.md)的 Renderer 夹具和捕获竞态。已在原精确 driver 路径完成本地表达式修复；下面新增 C# 源路径、查询 API、编译和准确远端目录是在调查后形成的具体范围，须确认本合同及 ADR-0165 后执行。不改 R6 冻结副本、HALTED、UNKNOWN 或旧证据。

## 1. 成功条件及已完成的本地修复

Full Access 的 Renderer 动作由具名函数序列化为完整 JavaScript，避免嵌套字符串消耗选择器引号；缺少准确 choice/apply 元素时结构化拒绝，不点击其他控件。冻结 R6 driver SHA `5f53949b682e76f45758ad24613a92207e2d1c862798a197052b1b9d7d4a68fb` 保留。本地修复源 SHA `d186e6f1373cfdec1ec7bab7dd1e0dba65cfc6d9e70c1fb598b7b328adef87ad`，尚绑定 R6 字面根，仅表示本地修复，不能直接部署到 R6 或用作 R7 pin。

Node20.17.0 语法检查、原68加5个实际序列化/DOM作用/缺失元素负例，共73项通过；19个完整字面 Renderer exec 参数解析通过。动态参数及真实 Electron 仍需 R7 直接证据。静态检查首轮因没有 TypeScript 而未执行，第二轮误将 SQLite member exec 当成 JavaScript；错误和新正确结果保留，没有安装依赖或修改 SQL。

## 2. 精确实现路径

仅以下五个外部测试源，UTF-8 无 BOM、LF：

1. `.acceptance/a9-31-developer/product-r1/control-scripts/stage-product-r1.ps1`
2. `.acceptance/a9-31-developer/product-r1/control-scripts/launch-product-r1-desktop.ps1`
3. `.acceptance/a9-31-developer/product-r1/control-scripts/serve-product-r1-desktop.ps1`
4. `.acceptance/a9-31-developer/product-r1/control-scripts/product-r1-driver.cjs`
5. `.acceptance/a9-31-developer/product-r1/control-scripts/capture-library.cs`（新增）

新增独立 C# 源由原 R5 精确源派生，原 source/compile/DLL/build/批准登记全部保留。四 PS/JS 源仅做新 R7 根和准入绑定、查询句柄类型适配、普通夹具修复；不把新 C# 藏入历史派生副本。新源和编译输出准确哈希在形成后登记，不填占位哈希。

## 3. 捕获及证据合同

保持 Toolhelp 枚举和已持有父实例拓扑。对新观察 PID 首先调用非继承 `OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE)`，以 `SafeHandle` 保持真实对象；不再要求 `.NET Process.Handle` 先确认进程仍运行。查询创建/退出 FILETIME、准确 PID、Session 和映像名称，校验父创建/退出时间、Session、枚举时间和 exe。对象已经真实结束但句柄仍可查询时，记录真实创建时间、退出时间及退出码；不因“已退出”主动制造 UNKNOWN。

句柄快照判据固定：已持有父创建时间 ≤ 子创建时间；子创建不晚于本次 Toolhelp snapshot 开始时间；若父已退出，子创建不晚于父退出；实际 PID/Session/exe 与记录匹配。保留对 snapshot 期间新创建而无法准确绑定的保守拒绝，不声称枚举绝无遗漏。仍持有句柄期间不按数字 PID 重新打开替换实例；原实例结束的结果继续来自该句柄。

`WaitForSingleObject(handle,0)` 的真实 signaled 状态决定是否退出，随后 `GetExitCodeProcess` 读取结果，合法 exit259 不误记 still-running。读取/等待/API错误、已销毁对象、父/Session/时间/映像错配仍留下结构化 gap 并 HALTED；不忽略 cmd/csc，不根据 PID 消失补写0，不放宽高影响、安全或生命周期门。直接查询只能修复“对象仍在但 .NET 拒绝”的路径，不能保证取得已经销毁对象的事实。

Held.Process 改为只查询/等待/Dispose 的测试对象，兼容原 PS 对 Id、Handle、SessionId、StartTime、ExitTime、HasExited、ExitCode、WaitForExit 的调用；Token 适配同一持有句柄。真正启动的 Process 对象仍由原 Process.Start 管理输出，不能以测试 wrapper 替代产品执行。关键 helper/root/child 仍须在任何 Stop/release 动作之前完成真实句柄及身份 ACK。句柄读取失败和 disposal 失败分别保留事实，Dispose 不代表进程清理成功。

新增 API 仅 kernel32 的 OpenProcess、GetProcessId、GetProcessTimes、GetExitCodeProcess、WaitForSingleObject、ProcessIdToSessionId、QueryFullProcessImageNameW；CloseHandle、Toolhelp、Token/Job查询沿用。只查询和等待，不请求 ALL_ACCESS、终止、内存写入、debug、suspend、Job assignment 或权限调整。Runtime Profile `WIN10_PS51_NET4_QUERY_HANDLE_CAPTURE_V2_TEST_ONLY`，程序集为仓库测试源码/Apache-2.0，系统 API 来自现有 Win10；不进入产品/SBOM、D-013锁或Win7前置。

官方源码解释 `.NET Handle` 的 throwIfExited 检查：[Microsoft reference source](https://github.com/microsoft/referencesource/blob/main/System/services/monitoring/system/diagnosticts/Process.cs)。对象和句柄生命周期依据：[OpenProcess](https://learn.microsoft.com/en-us/windows/win32/api/processthreadsapi/nf-processthreadsapi-openprocess)、[Process termination](https://learn.microsoft.com/en-us/windows/win32/procthread/terminating-a-process)。这些支持设计方向，不替代实际目标 API 检查。

## 4. 准确准备、编译和远端范围

仅 `192.168.1.4 / WIN-2JQ66JE4HTQ / Win10 build19045`，新准确根：

```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261003-R7
```

顶层仅 inputs/control/requests/runs/evidence/compile。沿用现有继承权限，不改 ACL、owner、账户、UAC、Job、Bitvise、许可证、任务、服务或注册表。拒绝 reparse，初次余量 ≥2GiB、每请求 ≥1GiB、R7根 ≤1GiB；任何目标已有则拒绝，不覆盖旧目录。

compile 下每次新32位run-id，仅 `capture-source.cs`、`capture-library.dll`、`compiler-out.txt`、`compiler-err.txt`、`compile-result.json`、`isolated-temp`。可在同准确 compile 下新 run 保留首失败并定向修复/重试；实际编译器句柄/退出必须取得。inputs 固定新增 source/DLL/build/scope-approval，源与正式 DLL 从已检查 run CreateNew 复制；新 capture profile/build_approval 字段绑定本合同批准，R5原编译批准不移作新编译批准。

Administrator SSH 仅准备编译、严格传输/完整性校验、固定请求及回收。编译器沿用 `C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe` 4.8.9232.0、SHA `aae1db57f898ca8bda18590c56f86ced6d0ead80c22033b76fdfe9119706f116`，准确三参考和 Valid 签名先只读核对。mscorlib SHA `cbba0b14d43901ff3d92cc44efe6a79149bfcaa3006c08ca05e186b2a75b54b5`，System SHA `af12577769e3b0c94fc8e4715cdfd21cbcf0f665bf63489f81e5a0934c94c7e4`，System.Core SHA `78c77c7250b6e318e69c1162980640bf7da5e8d3303d3abcc32401a52d667139`。仅现有 Framework/AnyCPU/.NET4 library，不安装工具，引用漂移停止。

R2准确 package/host/四输入只读复用，逐文件验证784产品/73宿主与managed锁；不重新打包或重建native。其余master、checked revision、checks、registration、三PS和派生检查/批准证据按原固定名称严格 schema/CreateNew；source、API profile、DLL/尺寸、MVID、工具/参考/编译记录、范围批准全部准确绑定。普通 worker 仅 Reflection.Load，不产生 csc.exe，不回退旧 DLL。

## 5. 检查、冻结及普通桌面验证

先执行 Node语法/73、19完整字面Renderer参数、784本地闭包；根据精确字节/调用/配置判定ASAR8项继承。实际PS5.1三解析、原271准入判据随新 capture schema重跑，旧25 capture/API/文件及22入口/并发按新组件变化重跑，不直接继承旧DLL证据。

新增直接判据：活对象最小权限非继承句柄；真实子进程退出后在已持有原对象上取得准确creation/exit及指定退出码；合法259；无权/不存在/已销毁对象仍UNKNOWN/HALTED；过晚创建、错父/Session/exe拒绝；stale row/PID重用反例；同一Held跨实际退出不重开PID；Dispose后查询拒绝、只Dispose不算清理；新wrapper Token正确；native API失败负例；新source/API profile/MVID/DLL/build/批准/工具/参考错配及原R5批准误用全部拒绝。

基础源码与所有负例检查通过后冻结PS/master/程序集。新普通窗口准确 SID1005/Session3/Medium8192/Ordinary=true/Elevated=false/noHostJob；一次启动以直接 identity/start/ready/claim为准，优先Computer Use。不恢复R6或转管理员/Session0，不新增计划任务。

八phase保持 Boot→Shell→EncodingSecurity/Background/FailureBoundaries/StopExit/ReleaseExit/Recovery，窗口120分钟16请求。ReleaseExit丢回执/取消竞态、恢复及未知副作用必需检查保留。允许一个明确登记的普通driver受控断言失败，再在同PID/creation/master上换通过检查的不可变修复revision取得新Boot成功，以证明可复用；两版保持固定请求白名单和产品原字节。其他普通driver失败保存首证据、真实树结束后可在同范围修复/登记/SSH重试，无需每次重新求批或人工启动。

安全、身份、完整性、审计、生命周期未知仍立即HALTED，原始记录全回收，后续根另立具体合同。成功记录只为本轮Win10检查，不自签独立复核/DEVELOPER_VERIFIED，不执行Win7或分配候选。GUI只做必要启动与交互；其余SSH自动调度/取证。

## 6. 请求确认及排除

请确认§2–5、ADR-0165、新第五路径及准确R7准备/编译/部署/普通窗口范围。负责人当前批准已用于原driver本地修复；新增API/C#源和准确远端写入批准缺失前，仅本地检查、文档及只读诊断继续。

不提交、推送、合并、发布、删除、改变产品/native/锁、安装或改系统设置、不委派。R3/R4/R5/R6失败及UNKNOWN、已冻结候选全部保留，不改判。A9-31仍IMPLEMENTATION_IN_PROGRESS。


## 7. 负责人具体批准

负责人回复“批准 R7 精确范围及 ADR-0165”，批准§2–5、第五路径、准确API/编译和R7远端/普通窗口范围。批准前合同SHA `dbc20ce8182fe209f0ef8bc28f84943186a7b83b958ff1ff943664518dc93ec2`，证据 `.acceptance/a9-31-developer/product-r1/owner-r7-execution-approval.json`。前文待批状态作为历史保留；当前准确范围已批准，全部硬门和排除继续。


## 8. 本范围实际执行及停止

[直接报告](../reports/2026-10/a9_31_r7_query_capture_and_snapshot_gate_failure_2026-10-03.md)：准备、编译、准入/文件/入口检查和普通桌面身份通过；唯一Boot run c26f1c3b3e2846a7bc4c432c006ecf35于子PID66612的联合绑定判据失败，worker保留UNKNOWN并HALTED，dispatcher停止。R7不恢复、不覆盖，全部55原始文件和首失败保留；同窗口成功复验及后续七组未执行。R8判据/准确新根另立材料，未批准前不实施。

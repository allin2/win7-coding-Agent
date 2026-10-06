# A9-31 R9：同步只读探测回执与原生捕获并行证明合同

日期：2026-10-03。Status: APPROVED_FOR_EXECUTION。ADR-0167 Accepted。分支 `codex/a9-31-background-tools`，产品source `35a19250ed6589f6a7ba35b940a784325970c111`。本合同获具体批准；执行证据另行追加。

## 1. 当前事实和要解决的问题

[R8直接报告](../reports/2026-10/a9_31_r8_interval_capture_and_short_lived_cmd_failure_2026-10-03.md)保留55原始文件、普通身份及7项Boot检查通过；唯一运行因cmd PID78328的OpenProcess错误87、creation/exit UNKNOWN而HALTED。源码存在同步cmd `/d /c ver` 探测，但缺少本次调用的pid/status回执，来源尚不能直接认定。R8不恢复、不改判。

成功条件：先直接证明锁定调用源的同步只读探测确实返回真实进程pid/退出status，再对本次观测做唯一关联。完整回执缺失或不能唯一关联仍停止。不能以快速退出的推断、数字PID相同、缺少进程或旧报告替代原实例证据。产品/native/锁不变，继续原八phase及同窗口普通失败→正常Boot成功复验。

## 2. 精确源、API和两类证据

仅五个现有外部测试源：

1. `.acceptance/a9-31-developer/product-r1/control-scripts/capture-library.cs`
2. `.acceptance/a9-31-developer/product-r1/control-scripts/stage-product-r1.ps1`
3. `.acceptance/a9-31-developer/product-r1/control-scripts/launch-product-r1-desktop.ps1`
4. `.acceptance/a9-31-developer/product-r1/control-scripts/serve-product-r1-desktop.ps1`
5. `.acceptance/a9-31-developer/product-r1/control-scripts/product-r1-driver.cjs`

C#仅保留R8全部原生绑定判据/API，完善未读取值UNKNOWN及提前记录已持有父事实；将现有二次同实例比较提取为实际路径使用的只读校验函数，以两个真实查询句柄和故意错配的预期metadata验证拒绝。预期metadata负例须标为受控输入，不声称真正制造Windows PID复用。最小查询权限、native image flags1、两snapshot/32768行/128诊断不变。

新增外部测试profile `WIN10_ELECTRON22_NODE16_SYNC_READONLY_PROBE_RECEIPT_V1_TEST_ONLY`。仅沿用锁定Electron22.3.27/Node16.17.1/ABI110的现有`child_process.spawnSync`、Buffer/crypto/fs及计时API，不新增程序、库、原生系统API或产品依赖。Framework系统编译器和三参考沿用R8准确hash/版本/签名；新source/DLL/MVID/build单独生成及冻结，不用旧DLL冒充新源码。Node/profile/来源/风险登记到WIN7_CONSTRAINTS；不进产品/SBOM/Win7前置。

[Node16.17.1官方接口合同](https://nodejs.org/download/release/v16.17.1/docs/api/child_process.html#child_processspawnsynccommand-args-options)定义同步返回中的pid、status、signal、error及等待子进程关闭语义。文档只能支持设计，不能代替锁定Electron/Node的本次实际调用、父实例和唯一关联证据；准入必须直接执行正负例。

只允许一个新证明例外：锁定包`resources/app/runner/dist/shell-detection.js`中准确系统cmd.exe、参数`['/d','/c','ver']`、shell=false、windowsHide=true、原timeout5000的同步只读探测。先核调用模块/物理文件hash及系统cmd文件hash/规范路径，不修改参数、环境、timeout或调用次数，不延长进程，不重放/模拟返回。

在调用原spawnSync前后记录真实父Electron实例、准确输入/来源、开始/返回UTC与单调时刻、结果pid/status/signal/error及输出计数/脱敏摘要；pid/status只取原函数返回值。固定版本schema1回执逐字节CreateNew并先落盘，最大128回执/单份16KiB/总2MiB；不得保存秘密或未脱敏输出。父pid/creation/Session取已有真实kernel pin ACK且与当前Electron匹配，不能由driver自行宣称父创建时间。

Toolhelp捕获仍先尝试原查询句柄。只有OpenQueryHandle错误87、行exe cmd.exe、父为准确已持有Electron实例，并且存在同本request/master/revision/source/调用模块/cmd hash/精确argv的唯一直接同步回执，才能形成`SYNC_READONLY_PROBE_EXIT_PROVEN`。回执须真实positive pid、整数status0、无error/signal，调用与返回区间支持本snapshot观测；字段类型/时间精度/重叠/PID多次使用使关联不唯一时拒绝。允许在既有phase期限内最多250ms等待落盘回执，超过即UNKNOWN；不得按时间接近猜测归属。

这种证据证明锁定Node同步只读调用的实际等待/退出，不证明拿到了原生查询句柄或精确OS creation ticks；该字段保持UNKNOWN，单列`resolved_sync_probe_observations`及证明种类，不虚构Held、不签kernel cleanup。首查询失败和随后的直接证明分别追加、保留原始字节。R8及历史UNKNOWN不改判。

Shell/后台/managed工具、有副作用命令、任意其他cmd参数、PowerShell、异步spawn、Chromium子进程以及无回执的行全部沿用实际查询句柄/Job/Stop/release合同。任何无法证明的生命周期仍HALTED。不用新例外接管或操作数字PID。

## 3. 远端准确范围和冻结

只在192.168.1.4/WIN-2JQ66JE4HTQ/build19045，准确新根：

```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261003-R9
```

仅inputs/control/requests/runs/evidence/compile及既有合同下的明确子路径；继承权限，不改ACL。根存在/reparse、首次不足2GiB、请求不足1GiB或根超过1GiB拒绝。复用准确R2产品/host/四输入，784产品/73宿主逐文件hash核验。

Administrator SSH仅准备、准确传输、固定csc编译、检查、请求及回收。compile/<新32hex>只允许source/DLL/compiler-out/compiler-err/compile-result/isolated-temp既有六项；失败保留新run重试。source/DLL/MVID/工具/批准/hash实际形成后记录，禁止占位。新批准不借用R8原记录。

产品执行仍SID1005/Session3/Medium8192/Ordinary/nonElevated/noHostJob。三PS、capture、回执安全逻辑和来源/允许调用/解析/证明判据全部冻结。新master/revision/checks/registration绑定新增profile及准确输入闭包，旧记录拒绝。安全逻辑不能作为普通driver修复热换；新不可变driver版本只能修原八phase的普通夹具，检查和登记后再请求。

## 4. 准入、运行和失败边界

重跑受影响Node语法/原73及新增回执对照/Renderer完整表达式、PS5.1三解析、275及新增schema、27查询/API、19区间、16文件门、22入口/并发；完整8项ASAR函数/依赖/调用/config/originalhash相同时只继承其负例。C#新增比较函数在实际生产分支使用，真实双查询句柄配错PID/creation/Session/映像预期字段均拒绝；关闭/读取错误、UNKNOWN序列化及原负例保留。

冻结前在准确R9隔离run执行实际锁定Electron/Node同步cmd-ver正例，取得原spawnSync pid/status并与真实snapshot/父kernel实例核对；也执行实际错误argv/status/error及构造缺失/重复/错属/错hash/错参数/过期/伪类型/时间不足/PID复用回执负例。没有直接证明或对照失败不装配、不启动正式有限窗口。准入管理员API检查不作为普通产品PASS。

Computer Use启动普通入口一次，最多120分钟16请求，SSH调度/回收。先受控普通Boot失败，实际树结束且没有未解生命周期后以不可变正常revision在同PID/creation/master取得Boot成功，再完成Shell、EncodingSecurity、Background、FailureBoundaries、StopExit、ReleaseExit、Recovery；release丢回执/取消竞态及恢复等原必需项不略过。

普通夹具失败可等待已检查修复；身份/安全/完整性/审计/未知生命周期立即HALTED，不恢复旧窗口、不覆盖旧证据。全部日志/数据库/截图/回执/查询失败/真实句柄身份/退出码及后飞行回收，逐hash和秘密扫描；没有真实顶层exit证据仍UNKNOWN。缺项NOT_PERFORMED，不签DEVELOPER_VERIFIED。

## 5. 具体裁决请求

请求批准§2–4及ADR-0167：五精确源、仅准确只读同步cmd-ver回执的新证明合同、准确R9准备编译/检查/冻结部署和普通有限窗口。R8 §4规定生命周期未知仍HALTED且不能恢复旧窗口；新的证明种类不在旧合同内，不能仅用原driver修复授权执行。

不提交/推送/合并/发布/删除，不改产品/native/锁/账户/ACL/UAC/Bitvise/许可/Job/任务/服务/注册表，不安装软件、不委派、不执行Win7、不分配候选、不自签独立收口。主工作区、所有历史候选/证据/UNKNOWN保留。

## 6. 2026-10-04 具体批准登记

负责人回复“批准 R9 §2–4及 ADR-0167”。原审批合同 SHA-256 `8a6ee203efe3e2c14d6afd83ba0e2b54a7a68c240985b6a73a0ace5a25d02c5b`；原文批准记录在 `.acceptance/a9-31-developer/product-r1/owner-r9-execution-approval.json`，SHA-256 `070063d745013b43c8d6f80075245b40a8746940deceee982e18739a7a2e9b8d`。仅执行上述准确范围；此前的未执行与历史UNKNOWN记录保留。

### 2026-10-04 R9 已批准计时合同的实现细化

R9 §2已批准UTC和单调计时。原生查询API/C# Profile保持V3；外部PS通过现有锁定System.dll的System.Diagnostics.Stopwatch.GetTimestamp/Frequency/IsHighResolution包住同一次Snapshot，Node沿用process.hrtime.bigint。它们复用已包含于Node/.NET运行时的QueryPerformanceCounter/Frequency，无新P/Invoke、组件、权限或系统配置。实际高分辨率/frequency及跨运行时同计数域正负例未通过时拒绝装配，不采用DateTime回退。

初版UTC每边16ms保守边界未能证明约23ms同步调用，原run不改判。拟用单调快照的包围区间与原spawnSync起止ns作严格包含，并对已锁定计数器到ns转换保留4096ns舍入余量；UTC继续用16ms作一致性检测，时间矛盾、缺失/反向/错频率/重复PID仍失败。所有新增字段和安全校验冻结于同R9新master/revision，未冻结的局部修复后重跑受影响检查；原八phase和首失败保留。

来源：[libuv1.43.0 uv_hrtime](https://raw.githubusercontent.com/libuv/libuv/v1.43.0/src/win/util.c)及[Microsoft Framework Stopwatch参考实现](https://raw.githubusercontent.com/microsoft/referencesource/main/System/services/monitoring/system/diagnosticts/Stopwatch.cs)。参考源码只说明计时实现，不能代替本批锁定二进制和实际跨运行时边界证明。初轮已验证实际Node16.17.1/uv1.43.0/Electron22.3.27/ABI110；普通桌面产品验证仍NOT_PERFORMED。

R9单调计时第二次准入保留为失败：实际调用在快照开始后创建，严格全包含拒绝，原始父/回执/三个快照及真实查询失败已保留。按R9“区间支持且唯一”的既定判据，最终实现用实际包围区间与真实调用区间的严格交集（交集两侧各4096ns舍入余量）支持观测；同一父的多回执区间与该快照相交、重复PID、无交集、UTC矛盾均拒绝。创建时间仍UNKNOWN，不能把SecondSnapshot失败或任何非OpenQueryHandle/87行转换成例外。两次准入失败不改判；尚无冻结或普通产品证据。


### 2026-10-04 执行登记

[R9交接报告](../reports/2026-10/a9_31_r9_sync_receipt_freeze_and_desktop_handoff_2026-10-04.md)已形成：五源实际编译/检查通过，master6e2131f0…6340266及受控Boot/正常补充版本准确冻结登记。实际API与普通产品证据分开；Mac锁屏、零产品request，八组/同窗口复验/独立收口/Win7 NOT_PERFORMED。release补充是原八phase普通夹具版本，固定三PS/C#/两安全片段未变，仍须实际执行；产品/native/锁及原失败不改。


### 2026-10-04 普通桌面执行与硬停止

[实际报告](../reports/2026-10/a9_31_r9_desktop_partial_pass_and_clock_boundary_halt_2026-10-04.md)已形成。同普通控制器受控Boot失败后正常Boot8项和Shell22项通过；编码54项断言通过后PowerShell创建时间比snapshot结束晚206ticks，原查询时间边界硬停止。301原始文件/hash及秘密扫描、784/73/四输入后飞行均核验；顶层exit仍UNKNOWN，原观测不改判，后续五组NOT_PERFORMED。
本合同固定源不热改、HALTED窗口不恢复。[R10具体合同](A9_31_PRODUCT_R1_R10_PRECISE_UTC_CAPTURE_APPROVAL.md)/ADR-0168只为Proposed；新增精确UTC API和准确新根需单独具体批准，尚未实施/编译/写R10。

# A9-31 R10：外部Win10捕获的精确UTC边界合同

日期：2026-10-04。Status: APPROVED_FOR_EXECUTION。ADR-0168 Accepted。
分支`codex/a9-31-background-tools`；产品source `35a19250ed6589f6a7ba35b940a784325970c111`。

## 1. 问题、成功条件与未确认项

[R9直接报告](../reports/2026-10/a9_31_r9_desktop_partial_pass_and_clock_boundary_halt_2026-10-04.md)已保留普通Boot/Shell通过和编码54项断言；PowerShell PID132888的实际creation比DateTime.UtcNow记录的snapshot返回晚20.6微秒，严格时间门HALTED。
时钟精度差异是待验证推断，不改判R9。后续实际同实例退出0也不补签首观测。
成功条件：用系统精确UTC包住同一Toolhelp调用，与实际GetProcessTimes创建时间比较；原严格边界、真实查询/父/Session/native映像、区间内双观察及退出证明继续有效，完成原八组和受控普通失败→同窗口Boot成功。
不得新增时间容差、移动结束边界到查询之后、按PID猜测、略过未知进程，或扩大只读cmd-ver回执例外。

## 2. 精确五源、唯一新增API与版本绑定

仅以下五个外部测试源；文档/ADR按仓库文档规则登记，产品实现白名单不扩大：

1. `.acceptance/a9-31-developer/product-r1/control-scripts/capture-library.cs`
2. `.acceptance/a9-31-developer/product-r1/control-scripts/stage-product-r1.ps1`
3. `.acceptance/a9-31-developer/product-r1/control-scripts/launch-product-r1-desktop.ps1`
4. `.acceptance/a9-31-developer/product-r1/control-scripts/serve-product-r1-desktop.ps1`
5. `.acceptance/a9-31-developer/product-r1/control-scripts/product-r1-driver.cjs`

新增仅`kernel32!GetSystemTimePreciseAsFileTime(out FILETIME)`只读取时；不增加进程、token、Job或写系统API。
外部测试Profile升`WIN10_PS51_NET4_QUERY_HANDLE_CAPTURE_V4_TEST_ONLY`、API合同`QUERY_LIMITED_INFORMATION_SYNCHRONIZE_SNAPSHOT_PRECISE_UTC_V4`。
实际System32 kernel32.dll只读快照：版本10.0.19041.5915、783720bytes、SHA-256 `4636f65d449b1353100578c6cb139933cf2b134f5e246119d18968873a058bed`，签名Valid；批准后执行前再次核验并将准确DLL来源/签名/导出/时钟Profile绑定构建和master/revision/checks，改变则拒绝。
[官方接口合同](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-getsystemtimepreciseasfiletime)声明最高UTC精度小于1微秒、最低Windows8。它仅用于本合同准确Win10/build19045测试宿主，Win7不可加载；不进入产品/SBOM/D-013/D-017锁或Win7前置。

精确FILETIME转DateTime UTC ticks；snapshot前后及用于同域比较的查询ticks/观测时间明确记录精确时钟Profile。读数非正、反向、转换异常或入口不可用立即结构化失败，无DateTime.UtcNow回退、时间矛盾修补或系统时间调整。
`creation > captured`继续拒绝；`started < creation <= captured`继续保留原真实查询句柄，再以最多一次额外Toolhelp及第二真实查询核对PID/creation/Session/映像和父实例，缺失/错配/关闭失败拒绝。初始父、原句柄和退出码判据不变。
每次最多两snapshot/32768行/128诊断，QueryAccess0x00101000、非继承、image flags1不变。
R9只读同步回执完整来源/调用/格式/唯一关联/4096ns交集/UTC一致性/上限/fsync及250ms等待判据保持；不能把本次PowerShell边界失败转换为同步回执例外。

## 3. 准入、准确远端范围及冻结

仅192.168.1.4/WIN-2JQ66JE4HTQ/build19045，新根：

```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261004-R10
```

准许inputs/control/requests/runs/evidence/compile及原R9相同受限子路径/生成文件合同；根存在/reparse拒绝，继承权限，不改ACL。首次至少2GiB、请求至少1GiB、根最大1GiB。当前只读查根不存在，C约4.8GB，正式准备前重查。
inputs只包含原审批/四输入绑定、master及新capture source/DLL/build/批准登记；control只含三PS、driver和按SHA命名的不可变revision/checks/registration及其准确检查输入。请求仅原九字段schema、固定八phase，run ID32hex；runs/evidence只保存本批隔离夹具、原始返回及既有有界取证文件。
compile/<新32hex>仅source/DLL/compiler-out/compiler-err/compile-result及既有isolated-temp；继续原锁定Framework csc/三参考，无安装。新增源码/DLL/MVID/工具/系统DLL/准确批准/hash实际形成后冻结，不用占位或R9 DLL冒充。
Administrator SSH仅准备、准确传输、固定编译、检查、请求和回收；产品仍准确SID1005/Session3/Medium8192/普通非提升/noHostJob。复用R2产品784/host73/四输入原hash，重核全部闭包。

准入检查：Node原73/回执88和19完整Renderer表达式；实际PS5.1三解析、315schema/27查询API/19区间/16文件/22入口及并发/77回执，版本与新增时钟字段的受影响反例扩展后记录实际总数，不为固定数字略过新增检查。ASAR8仅完整函数/依赖/调用/config与原hash相同才继承。
保留真实晚于捕获的拒绝对照（包括206ticks受控边界）、反向/缺失/错误时钟Profile、API入口缺失、clock/DLL/schema错配、父/Session/映像/二次实例/关闭失败；构造输入明确标示，不冒充重演原R9。
在新根隔离API run，使用锁定Electron/Node和准确包内helper/PowerShell：最多16个明确夹具子进程、每个最长10秒、总200次捕获/60秒，父和子都持有实际实例；记录精确/原粗UTC对照与真实GetProcessTimes，验证精确边界和实际查询/退出。原生和Node只读回执实际正负例重验；管理员API证据不能代替普通产品PASS。
全部准入通过后才冻结三PS/C#/回执安全逻辑及新master/revision/checks/registration。未批准/未锁定版本或API不匹配拒绝装配。

## 4. 普通桌面运行、增量继承与失败边界

Computer Use启动普通入口一次；两小时/最多16请求。SSH调度/取证、GUI仅必要入口和真实退出选择。
先受控普通Boot失败，实际树结束且无未知后，同一PID/creation/master正常Boot成功；再依次Shell、EncodingSecurity、Background、FailureBoundaries、StopExit、ReleaseExit、Recovery。
R9 Boot/Shell直接证据原绑定保留；时钟/捕获改变影响生命周期安全，不据文件未变跳过本合同Shell/编码/Stop/清理。未影响的产品模块定向测试按原source/组件/dependency/config/hash只记INHERITED_EVIDENCE，不重跑完整产品开发测试。
同窗口普通driver失败可经检查和新不可变版本登记后重试；三PS/C#/回执安全门冻结后不热改。身份、安全、完整性、审计或未知生命周期仍HALTED，不恢复旧控制器。
原八组、release丢回执/取消竞态和Core/SQLite/UI移交证明全部保留，模块日志不能代签产品持久化。
原始日志/SQLite/截图/实际句柄/查询失败/时钟/回执/终态回收，逐文件hash/秘密扫描及后飞行；顶层未取得真实退出码保持UNKNOWN，不以进程消失代签0。
R9和历史UNKNOWN不改，独立收口仍另外按任务合同；不提交/推送/合并/发布/删除，不改产品/native/managed锁、账户/ACL/UAC/Bitvise/Job/计划任务/系统时钟/服务或注册表，不安装、不委派、不执行Win7/分配候选。

## 5. 具体审批事项

批准本合同§2–4及ADR-0168，将仅允许上述五源、唯一新增精确UTC API及V4外部测试Profile、准确R10准备/编译/检查/冻结和普通有限八组运行。
R9 §3明确“三PS、capture、回执安全逻辑和来源/允许调用/解析/证明判据全部冻结”，§4规定未知生命周期HALTED，不恢复旧窗口；因此本次新增API与新根不能使用普通driver修复授权。具体批准前，只形成文档，不修改五源、不编译、不写R10。


## 6. 2026-10-04 具体批准登记

负责人对本合同§2–4及ADR-0168回复“批准”。原合同SHA-256 `c388ae5ea1fc3eb73cb28f4de371f8d76db0243a0986d6cce31b9cd38c1da8d3`；原文批准记录`.acceptance/a9-31-developer/product-r1/owner-r10-execution-approval.json` SHA-256 `ef47799d2506546ec7ccee62026a0d677489b7e6b6e0a2adf0414bac15cd30d6`。仅实施上述准确范围，R9 HALTED及全部历史证据保留，产品/native/锁和主工作区不改。

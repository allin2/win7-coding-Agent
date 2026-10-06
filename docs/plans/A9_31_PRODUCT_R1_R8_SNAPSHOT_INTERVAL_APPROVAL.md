# A9-31 R8：快照区间、同实例双观察与准确诊断

日期：2026-10-03。Status: APPROVED_FOR_EXECUTION（负责人回复“批准”，准确范围§2–4）。分支 `codex/a9-31-background-tools`，产品source `35a19250ed6589f6a7ba35b940a784325970c111`；ADR-0166 Accepted。原审批合同hash及批准见末尾追加；实际执行结果见[R8报告](../reports/2026-10/a9_31_r8_interval_capture_and_short_lived_cmd_failure_2026-10-03.md)。

## 1. 问题和成功条件

[R7直接报告](../reports/2026-10/a9_31_r7_query_capture_and_snapshot_gate_failure_2026-10-03.md)已收回55文件。普通SID1005/Session3/Medium/非提升/无Job门通过，真实 Full Access 表单通过，但第一次观察子PID66612于时间/Session联合判据失败。后续真实句柄事实支持 snapshot 调用期间新生子进程的推断；首失败缺失比较值，不能反向改判。R7 HALTED和全部UNKNOWN保留。

本次只修外部捕获与诊断。成功须准确区分：snapshot之前的稳定实例、调用区间内新生且获得第二次直接证明的实例、以及晚于snapshot捕获完成/PID复用/父或Session错配/证据不足。未知继续硬停止。完成原八组真实Electron及同窗口受控普通失败→不可变修复Boot成功，不能以准入测试代替产品证据。

## 2. 精确白名单与绑定判据

只允许以下五个现有外部测试源，UTF-8无BOM、LF：

1. `.acceptance/a9-31-developer/product-r1/control-scripts/capture-library.cs`
2. `.acceptance/a9-31-developer/product-r1/control-scripts/stage-product-r1.ps1`
3. `.acceptance/a9-31-developer/product-r1/control-scripts/launch-product-r1-desktop.ps1`
4. `.acceptance/a9-31-developer/product-r1/control-scripts/serve-product-r1-desktop.ps1`
5. `.acceptance/a9-31-developer/product-r1/control-scripts/product-r1-driver.cjs`

第五项仅新R8绑定、同窗口受控普通失败及原八组夹具修复；不修改产品/native/输入锁。固定PS、source/DLL/master/checked revision/检查与批准证据仍逐字节绑定、CreateNew；冻结PS和捕获门变化不得在已启动根热改。

新增测试 Profile `WIN10_PS51_NET4_QUERY_HANDLE_CAPTURE_V3_TEST_ONLY`，API合同 `QUERY_LIMITED_INFORMATION_SYNCHRONIZE_SNAPSHOT_V3`。只沿用R7已批准的kernel32查询/等待、Toolhelp、令牌/Job读取和CloseHandle；OpenProcess固定0x00101000、非继承，映像查询固定native flags1。不增加终止、debug、内存写入、suspend、Job assignment、系统设置或新API。

精确时间合同：在CreateToolhelp32Snapshot调用前记录Tbegin，成功返回后、枚举前记录Tcaptured；每行携带同一次准确区间。零/反转/未知边界拒绝。不能把枚举后或绑定后的时间冒充Tcaptured，不能静默忽略无法证明的行。

- 创建≤Tbegin：保留R7父创建/退出、Session、实际PID/exe校验及真实持有句柄。
- Tbegin<创建≤Tcaptured：先保留原真实查询句柄为 provisional，不派发任何控制；额外一次真实Toolhelp观察须再次找到同PID、同父PID及exe，并且实例创建早于第二次snapshot开始。以第二个只查询句柄核对准确PID/creation/Session/native映像与原持有对象一致，然后关闭核对句柄；不替换原对象、不根据数字PID认领新实例。父的原持有对象、创建/退出边界及Session全部仍须满足。任何缺失、错配、读取失败或关闭失败留下gap并HALTED。
- 创建>Tcaptured：仍拒绝，即使第二次看到同PID也不重新绑定这次行；PID复用/过晚创建负例必须直接证明拒绝。

每次捕获至多两个snapshot，只有区间内provisional需要第二次确认；沿用32768枚举、128诊断与既有请求/phase期限，不增加无限重试。若区间内进程在二次观察前结束、无法证明父属关系，保留UNKNOWN，不靠真实exit0免除归属门。已经验证且持有的Held跨退出仍从原对象读取结果，不重放、不接管。

捕获诊断升schema_version=2，记录判据名称、Tbegin/Tcaptured、查询时刻、实际PID/creation/Session/映像、父持有creation/Session及可证明的exit时间、二次观察/核对结果。读取成功事实与未证明归属分别标注，未知值写UNKNOWN；不得用后续drain替换首观察失败。旧诊断schema1原字节不动，master/revision原schema1通过新Profile/API/source/DLL绑定拒绝混用。

## 3. 准备和远端准确范围

仅 `192.168.1.4 / WIN-2JQ66JE4HTQ / Win10 build19045`，新根：

```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261003-R8
```

仅 inputs/control/requests/runs/evidence/compile，使用既有继承权限。原R7不重启；根已存在、reparse、初次余量不足2GiB、每请求不足1GiB或根超过1GiB均拒绝。没有账户/ACL/UAC/Bitvise/许可/Job/任务/服务/注册表变更。

Administrator SSH仅准备、现有系统编译、准确传输/完整性验证/固定请求和取证；普通产品执行只允许SID1005/Session3/Medium8192/Ordinary=true/Elevated=false/noHostJob。沿用R7锁定csc4.8.9232.0 SHA `aae1db57f898ca8bda18590c56f86ced6d0ead80c22033b76fdfe9119706f116`及三参考的完整SHA和Valid签名合同；不安装工具或重编产品native。compile/<新32hex>仍只允许capture-source.cs、capture-library.dll、compiler-out.txt、compiler-err.txt、compile-result.json、isolated-temp；首失败留档后可新run定向修复/重试。

R2准确产品/host/四输入只读复用，784产品/73宿主、ZIP/manifest/managed锁/helper全部核hash。新source/DLL/MVID/build/批准/hash形成后登记，不填占位值；R7批准不移用为新source的编译批准。沿用原固定master/revision/checks/registration/三PS/四源版本副本及九字段请求名称，诊断数据写在本批run/evidence。

## 4. 准入、有限窗口和失败

针对新字节执行Node语法/73、自身受影响Renderer表达式、784闭包、实际PS5.1三解析；275准入、27查询/API、16文件门和22入口/并发检查按变化重跑。ASAR八负例只有完整函数、依赖、调用、配置和原记录hash相同才继承。

新增正负判据必须在冻结前直接执行：准确记录snapshot调用区间；稳定实例保持原判据；真实区间新生实例需第二次证明才接受；第二次缺失、错父/exe/creation/Session、过晚创建、反转/未知时间、PID复用、读取/关闭失败均拒绝且保留具体原因。两个实际查询句柄必须同实例，不能通过已退出PID的数字相同代签。保留合法exit259、退出后真实native映像/creation/exit码、UNKNOWN/disposal/abort负例及原始首失败。普通身份与原生Job ACK门不放宽。

新普通窗口仍120分钟/16请求，八组Boot→Shell→EncodingSecurity/Background/FailureBoundaries/StopExit/ReleaseExit/Recovery；先登记一次受控普通断言失败，在真实树结束后由SSH换经检查的不可变driver版本，在同PID/creation/master取得新Boot成功。普通driver修复和新revision可在五路径与准确新根内检查/登记/重试，无需每次人工启动；三PS、capture源码或调度安全门冻结后变更及任一身份/安全/完整性/审计/生命周期未知仍HALTED，不能恢复旧窗口。旧UNKNOWN不改判。

用Computer Use启动新准确入口一次；仅普通夹具失败可继续等待。所有实际失败、日志/数据库/截图/句柄身份/退出码、秘密扫描和后飞行完整回收。缺失或失败的产品判据仍NOT_PERFORMED/FAIL；准入通过不签DEVELOPER_VERIFIED。release丢回执/取消竞态及恢复等原合同必需项不得略过。

## 5. 请求具体裁决与排除

请负责人批准§2–4及ADR-0166：五精确外部源、新诊断/时间与双观察绑定、同已登记API、准确R8根内准备编译/检查/冻结部署及普通有限窗口。R7合同§3明确要求“子创建不晚于本次Toolhelp snapshot开始时间”，本次对区间内实例采用额外直接证明，属于判据变化；§5还要求“后续根另立具体合同”。这是本次补批的具体来源，未批准前不实施该变化、不编译、不创建R8根。

不提交、推送、合并、发布、删除、不改变产品/native/锁或系统设置、不委派，不执行Win7、不分配候选、不自签独立收口。主工作区、所有历史失败/UNKNOWN/候选与证据均保留。


### 2026-10-03 — R8精确执行批准

负责人本轮回复“批准”，批准R8合同§2–4及ADR-0166。仅五精确外部源、新快照区间/同实例双观察和schema2诊断、准确R8根内准备编译/检查/冻结部署及SID1005普通桌面有限窗口；保留R7 HALTED/UNKNOWN及全部硬门，不提交/改系统/委派/执行Win7。原审批合同SHA-256 `744236b70e84c0ad795624e51e453b8ef347641ed073fabfdea77b5f552e83ec`；原始批准记录SHA-256 `51a1b77635b3d354b7e6536c9ecc74e2b26731a140cc5849ae2bd5d71a29c4d8`。实际检查和产品结论待直接证据。

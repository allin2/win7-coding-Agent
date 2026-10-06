# A9-31 R7：查询捕获已检查，普通桌面首轮生命周期硬停止

日期：2026-10-03。分支 `codex/a9-31-background-tools`；HEAD、产品 source 均为 `35a19250ed6589f6a7ba35b940a784325970c111`。没有提交、产品/native/锁或系统设置修改。A9-31 保持 `IMPLEMENTATION_IN_PROGRESS`；Win7、独立收口及同窗口失败后成功复验均 `NOT_PERFORMED`。

## 1. 批准及准备检查

负责人回复“批准 R7 精确范围及 ADR-0165”，批准 [R7 合同](../../plans/A9_31_PRODUCT_R1_R7_QUERY_HANDLE_CAPTURE_APPROVAL.md) §2–5。批准前合同 SHA `dbc20ce8182fe209f0ef8bc28f84943186a7b83b958ff1ff943664518dc93ec2`；`.acceptance/a9-31-developer/product-r1/owner-r7-execution-approval.json` SHA `08292fffd5ad0d265700e8c5669869653c71e96ac6c62098eb63f32c37eab934`。仅五个精确外部测试源、既有工具及准确 R7 根执行。

Administrator / SID500 / Session0 仅完成准备编译、传输、API/文件/协议检查及取证。这些结果不充当普通桌面产品证据。实际系统编译器和三个参考的 hash、Valid 签名与合同一致，没有安装、提升或修改账户/ACL/Job。

最终 C# source SHA `7ec6a12502df92e9607c8ff542817ff7b9f15d647b67e36be4de6b2a6859ab7b`，12738 bytes；compile run `ade4e74d5b1e48839eb671a6c5bf1ae3`。DLL SHA `15f05ce00ee162303f9c72ced5ffd1ef09badb034bf08e01624ac0433c9d6e7d`，14848 bytes，MVID `e8c1f86c-7229-429d-958e-bbe6029b0297`。原始 build SHA `5bc8622d7eb2d1a4ccbb79b90d41cbc34721e22e677ca51b5483cd74f3b48d4e`。五个原始编译返回文件逐项 hash 通过。

准备阶段首失败保留：PS 属性 getter 的异常未到达夹具 catch，改用显式严格方法；退出后 Win32 映像格式返回 error31，同一批准 API 的 native 格式实际成功，固定 flags1，未扩大查询权限；Administrator 能查询 csrss，原“必定拒绝”夹具假设错误，改用真实 System TOKEN_QUERY error5；审批文字校验多了空格，修正为准确原回复。这些修复及三次独立 compile 输入/结果全部保留。

| 检查 | 直接记录（均在 `.acceptance/a9-31-developer/product-r1/`） | 结论 |
| --- | --- | --- |
| 查询及生命周期 27 项，含活/退出对象、原对象与查询对象身份、exit23/259、真实拒绝访问、UNKNOWN/abort/disposal | `r7-query-api-r4-20261003T142843130742Z.json` | PASS；两个实际夹具退出码23/259 |
| 准入 schema 原271加4个新 API profile 负例 | `r7-schema-probe-r2-20261003T143024276919Z.json` | 275 PASS |
| 源/DLL/build/旧批准/缺失/hash/reparse/MVID 文件门 | `r7-file-gates-20261003T143139591779Z.json` | 16 PASS |
| 实际文件旧入口/claim/实例绑定、复制 launch 拒绝和两 runspace 原子竞争 | `r7-entry-gates-20261003T143207993688Z.json` | 22 PASS |
| 三份准确 PS 实际 PS5.1 ParseInput | `r7-final-parse-20261003T143024274892Z.json` | 三项 PASS |
| Node20 语法、73自检、19完整字面 Renderer 表达式、784物理文件 | `r7-local-check-records.json` | PASS |
| 物理 ASAR 校验八负例 | `r7-physical-negative-inheritance.json` | INHERITED_EVIDENCE；完整函数与原记录 hash 一致 |

## 2. 冻结、部署及真实桌面

master SHA `4d60409bf988cb3aa99846c63be85fa1ff742dba7a80ae00cb029983f86dc98c`；完整正常 driver revision SHA `c73a98fe30daa857ff14aa8a31aab773be81107caeb3e3d8c0d9d161730d2d8c`。28个新目标只写准确 R7 根，已有两份批准文件保留并核 hash。冻结后实际装配验证784产品/73宿主 PASS。产品 ZIP、manifest、managed锁、helper字节与 R2 相同。

通过 Computer Use 先将 UU 窗口全屏，再确认 CMD 位于前台，输入并执行准确 R7 命令，无需用户代输。真实 dispatcher PID `78592` / creation `639266349360687397`，SID1005、Session3、Medium8192、Ordinary=true、Elevated=false、InJob=false。start/ready/claim 与实际进程实例、master一致；两小时/16请求限制生效。记录 `r7-desktop-identity.json`。

为了按批准合同证明同窗口普通失败后可换不可变修复 revision，另形成只在 Boot 末尾加入受控断言的已检查 variant；不改变产品或安全门。driver SHA `091859c5000b8d1d2b54f3013da7d2725b6c1cfad3e34b2064ab8a8c1cbcd411`；revision SHA `bc79cf1241d00394d7f8e30d2679070fdb005af603fedbfef9bee046d3656db3`；其语法/73项自检/784文件检查及准确装配通过。

## 3. 首失败及证据边界

唯一普通 Boot request/run `c26f1c3b3e2846a7bc4c432c006ecf35`。worker PID29580、Electron PID66864均通过同样普通身份门；真实运行时 Electron22.3.27、Node16.17.1、ABI110、SQLite3.43.1。LOCKED_RUNTIME、VISIBLE_WINDOW、RENDERER_ISOLATION、INITIAL_MODE_BLOCKS_INPUT、WORKSPACE_MODE_ACTUAL_UI五项直接通过。Full Access 序列化修复已走真实产品选择表单。

受控断言尚未到达，worker在 `2026-10-03T14:37:21.4141348Z` 观察 Electron子PID66612/父66864时，于 `CreationSessionImage` 步骤报 `LIFECYCLE_PARENT_CREATION_SESSION_MISMATCH`。worker写 abort并HALTED，driver因 `LIFECYCLE_CAPTURE_FAILED` 失败，dispatcher按 `SAFETY_WORKER_HARD_GATE` 停止。没有派发正常修复 Boot 或后续七组。

该联合判据包括父创建/退出时间、Session及“子创建不晚于 snapshot 开始”。原始 gap 未记录每个比较值及 snapshot 开始时间，因此不能将首失败的具体子条件写成已直接证实。后续有界 drain 中，两监督器实际持有同PID66612，creation `639266350414071254`、Session3、exit0；父creation `639266350403881121`。这些支持“进程在 snapshot 调用区间内创建”的推断，不能补签首次 observation 的绑定或改判原 UNKNOWN。改进应先保留精确时间判据，并用额外观察证明新生实例，而非直接删除时间门。

worker的8个已持有实例、dispatcher的7个已持有实例均有真实结束和退出码；worker的首观察仍保留 UNKNOWN。顶层dispatcher自身退出码没有跨动作持有证据，保持UNKNOWN。返回时准确 R7 命令行进程快照为空，只是当前后飞行事实，不证明首观察无缺口或该退出码。

55个原始文件/6166259 bytes已回收到 `.acceptance/a9-31-developer/product-r1/controller-r7-boot-first-failure/`，全部 hash 核验，合成秘密及其 Base64 扫描0命中；原始数据库、日志、截图、请求、abort、stage、身份与终态均保留。索引 `r7-boot-first-failure-return.json` 和 `r7-boot-first-failure-return-20261003T143946142498Z-inventory.json`。

| 原始终态 | SHA-256 |
| --- | --- |
| dispatcher-final | `a45f89814330b8755df23e086e10fbe8cf5314ed786c5bc012fcda7d1de843a9` |
| worker controller-final | `e816789212b7aa6eeffc256fb6106e0bc03acc3dffb214a2a965f695618998b9` |
| driver-final | `d2b80314346017030c9599c681c60474daef7afd106b72d2d2786885b446d49f` |

## 4. 后续范围

R7合同§5要求“安全、身份、完整性、审计、生命周期未知仍立即HALTED…后续根另立具体合同”。R7不恢复、不覆盖；本次准入PASS不等于产品Boot PASS。新[快照区间及双观察合同](../../plans/A9_31_PRODUCT_R1_R8_SNAPSHOT_INTERVAL_APPROVAL.md)和ADR-0166保持 Proposed，未实施、未编译、未创建R8根。后续需要批准准确新绑定判据及目标后继续。所有历史失败、UNKNOWN、候选不变。

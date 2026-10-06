# A9-31：R6新根——Recovery重启路径修复与Win10八phase续验

日期：2026-10-05。Status: DRAFT_NOT_APPROVED（修订稿r2，仍未批准）。请求批准§1–5的新根执行与有限修复；本材料尚不构成实现、远端执行或第六根授权。

修订说明：r1（SHA256 `c608eff8adce88229f869b315b3754e786c3c36d8655e1e7f600a1ca8c1a77ef`）发出后，负责人对D1–D4作出取向裁决（见§6），本稿据此定稿；**P0尚未取得，且负责人尚未批准本草案任一版本**，裁决D1–D4不是批准。负责人此前对R5合同r3（SHA256 `540a7c614482cb13db57c45855531f5fc1898ad50b66e249857287c1066ed0d5`）的批准**不延伸**到本草案。

## 1. 基线、R5结果与准确文件范围

工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`，HEAD `ebda91123e62b225c3fd104c9c9b564a4b61c466`。产品r3 ZIP d951a89af285c4e60c5f4701efbfd54f34627fe103d8257c83636479f82ac74b、manifest 0060fffff80335d48abd75e2bb784106114af7cca92db0b98e40ad8a65357a68（784产品/73宿主文件）、native helper、锁、固定capture库及观察器C#源（SHA256 `b949ba520eb103548cfd08a578d76df1d3d48e46089045188dc7b4b1df112a7d`）**字节不变**，不恢复R4/R5任何HALTED入口或旧R10。

R5（master a3a04e288847ab9b712debf6c72aa77f40c2d69b01ce66e2e0ba2f8bd8e3b991）已在普通账户（SID1005/Session3/Medium8192/非提升/noJob，直接核验）取得下列直接证据，矩阵见`.acceptance/a9-31-developer/product-r3-retry-r5/win10-evidence-matrix-r5.json`，交接见[handoff §9](../reports/2026-10/a9_31_r5_manifest_proof_handoff_2026-10-05.md)：

| 请求 | 结果 |
|---|---|
| 受控Boot | 夹具故意失败，整树8实例结束，观察器终态核对通过 |
| Boot | PASS（9项） |
| StopExit | PASS（15项，含真实原生选择21.1秒/响应0与终态持久化） |
| ReleaseExit | PASS（32项，9.7秒/响应1，整树36实例结束；1个cmd 87缺口由原SYNC通道解析） |
| Recovery | **HALTED** `LIFECYCLE_RESTART_TIMEOUT`；dispatcher随后`LIFECYCLE_PINNED_TREE_UNKNOWN`HALTED，累计5/16请求 |

**Recovery失败原因（静态证据链，未直接证实）**：崩溃实例（退出码93）整树结束后，控制器按设计以`A9_TEST_RESTART=1`再起第二个Electron（pid 107280），其driver日志中没有任何重启实例记录，负责人报告出现JavaScript报错，该进程至今未退出。driver第118行`fs.openSync(path.join(evidence,'driver-journal.jsonl'),'wx')`在模块加载期无条件创建日志，而重启实例与崩溃实例共用同一证据目录，文件已存在；`process.on('uncaughtException',fail)`要到第304行才注册，故加载期异常走Electron默认的主进程错误对话框并使进程不退出，与上述现象一致。**待前置P0（见§6）取得对话框原文后才可当作事实**。同时，Recovery重启路径此前**从未**在Win10实际运行过（R3在StopExit即止），除journal外可能还有未知阻断；另外控制器重启子进程不传`--a9-smoke-workspace`（设计上依赖持久化的active-workspace恢复），该点亦从未被实际检验。

HALTED的R5入口不恢复（合同§5），因此续验必须在新根进行。准确新本地根`.acceptance/a9-31-developer/product-r3-retry-r6`，远端`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261005-R6`，两者须不存在。批准后先在任务书登记下列准确六源（C14），再实施：

- `.acceptance/a9-31-developer/product-r3-retry-r6/control-scripts/stage-product-r3.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r6/control-scripts/launch-product-r3-desktop.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r6/control-scripts/serve-product-r3-desktop.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r6/control-scripts/product-r3-driver.cjs`
- `.acceptance/a9-31-developer/product-r3-retry-r6/event-sources/manifest-process-observer.cs`（与R5字节相同的拷贝）
- `.acceptance/a9-31-developer/product-r3-retry-r6/event-sources/launch-manifest-observer.ps1`

## 2. 相对R5的全部变更（仅此）

1. **driver重启证据文件**：当`A9_TEST_RESTART==='1'`时journal使用`driver-journal-restart.jsonl`（常规实例仍为`driver-journal.jsonl`），其余断言、真实对话框规则、关闭修复、SYNC安全片段、九字段请求均不改。新增Node自检`--restart-evidence-self-test`：用已含崩溃实例全部证据文件名的临时目录证明（a）旧写法复现EEXIST，（b）新写法不冲突，（c）静态扫描driver全部固定名`wx`创建点，证明重启实例路径上不再与崩溃实例同名创建。现有128/88/15自检结果须原样保持。
2. **控制器读取路径**：`Assert-ObserverReady`增加以`FileShare.ReadWrite`读取`observer-events.jsonl`前至多4096字节，使普通账户读取proof所依赖的真实路径在每个请求前被实际演练，失败即`LIFECYCLE_OBSERVER_EVENTS_UNREADABLE`并硬停。R5已证明a9builder能读ready/心跳，events文件的读取路径尚未被真实使用。
3. **根绑定**：stage/launch/serve与观察器launcher仅替换为R6根及新master/scope哈希；观察器launcher中硬编码的R5根常量改为R6。其余控制器逻辑（conhost proof分支、停止握手、`Assert-ObserverFinal`、采集域规则）与R5相同。
4. **观察器重新编译**：C#源不变，在R6组件目录以固定csc重新编译，新EXE/MVID/pin单独冻结，**不冒充R5 v2字节继承**；沿用既有10个API与系统库逐hash核验，无新增依赖或系统API。
5. **编排（Python，非冻结源）**：保留“请求发布后30秒内必须出现run目录”的接单检查，并增加失败处理——未接单时立即写停止信号收尾观察器并停止，不长时间轮询；每phase保存观察器终态、controller的`resolved_manifest_proofs`与观察器记录的对账结果。
6. **入口操作规程（负责人）**：R5首个请求未被接单的原因是入口窗口被控制台选择模式挂起。启动入口后请勿在窗口内点击；若标题栏出现“选择”，按Esc一次即可恢复。

不修改产品、native、锁、capture，不修改任何Accepted ADR；批准后另行追加记录本修复的ADR。

## 3. 新根、准入与检查

- 准备前C空闲≥2GiB（当前约3.77GB，R6根约0.67GB，无需再清理旧根）；根≤1GiB/5000文件，每请求空闲≥1GiB，运行证据返回≤128MiB；无reparse；旧根R1–R5、数据库与所有历史文件保留。R5遗留的重启Electron（pid 107280）与入口窗口由负责人自行关闭，代理不结束任何旧实例。
- 观察器准入真实探针最多三轮、每轮≤60秒、总启动数≤12，先一组确认后扩展，且每轮含固定cmd与PowerShell组（沿用D1）；除conhost外的短命System32子进程出现87仍直接HALT（沿用D2，不预授权其他映像）。
- 定向检查全部重跑：schema/api/interval/entry/files-scope/sync-actual/sync-current、Node16锁定检查（128/88/15）、package-held、manifest绑定38项，另加§2第1点的重启证据自检与§2第2点的events读取检查。准备脚本须沿用R5已修复的样例绑定（重绑定脚本行size与`manifest_observer`字段）。
- 失败规则同R5：准入、身份、完整性、安全、必需审计、未知生命周期失败停止下游；允许六源内同范围局部修复并以新不可变版本重检，旧首失败不覆盖；HALTED不恢复。

## 4. 执行顺序与人工步骤

新普通入口一次，窗口120分钟、最多16请求；默认**直接重跑全部八phase**（方案B，见D1），共10个请求，其中**Recovery放最后**：

Boot → Background（normal-short最短）→ Background（normal-full）→ ready专用负例 → Shell → EncodingSecurity → FailureBoundaries → StopExit → ReleaseExit → Recovery。

理由：Recovery是唯一从未在Win10运行过的路径，放最后可避免它的未知阻断烧掉其余phase的证据；R3已直接通过Boot/Background/Shell/EncodingSecurity/FailureBoundaries与ready负例，R5已通过Boot/StopExit/ReleaseExit。不重复受控Boot（R5已取得，仅引用不继承）。

每请求：观察器就绪（含心跳、绑定、self-test、events可读）核验后才发原九字段请求；30秒接单检查；终态后由代理发停止信号，核对观察器终态、零丢失、会话停止、无遗留实例，以及controller的proof与观察器记录逐条对账；原持有树完整结束后才可发下一请求。StopExit点“停止后退出”、ReleaseExit点“留给系统后退出”，各限120秒，由负责人在真实对话框点击（本代理会话无可用的桌面控制工具），不得注入或伪造选择，不延长限时，迟到保留原FAIL。每phase逐size/SHA完整返回、秘密扫描、SQLite副本检查及输入后飞行；更新统一报告、STATUS与新矩阵r6，不建立第二套台账。

## 5. 失败与边界

任一HALTED保存全部证据，不恢复、不创建第七根，另报批准；若仅Recovery失败，其余phase证据保留，Recovery单独另报，不借此扩大权限。本批准不含：产品/native/锁/capture修改、系统/账户/ACL/服务/计划任务改动、删除、强制结束旧实例（含107280）、提交/推送/合并/发布、委派、独立验收、Win7、第七根，不自签DEVELOPER_VERIFIED（八phase均取得直接证据后向负责人报告，由负责人裁决）。全部Win10结果均**未在Win7实机验证**。

## 6. 前置、已裁决项与剩余待办

- **P0（前置，未取得）**：请提供那个JavaScript报错框的完整原文后再关闭它。若报错不是driver-journal的EEXIST，则§1的原因分析与§2第1点须先修订，再请求批准。**未取得P0前不创建六源、不新建根、不编译、不部署、不启动任何phase。**
- **D1（负责人已裁决：方案B）**：直接重跑全部八phase，共10个请求，R5的Boot/StopExit/ReleaseExit/受控Boot仅作历史引用，不作为继承证据。
- **D2（已同意）**：Recovery放最后。
- **D3（已确认）**：R5遗留入口窗口与Electron 107280由负责人自行处理；代理不结束任何旧实例。
- **D4（已确认）**：不预授权第七根；Recovery若再失败，其余phase证据保留，Recovery单独另报。
- 剩余：取得P0；负责人对修订稿（以其SHA256为准）作出明确批准。批准后按§1先登记六源C14、追加ADR，再实施。

# A9-36 — Alpha2最小补证输入与执行合同提案

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: ALPHA2_SUPPLEMENTAL_ACCEPTANCE
Target Branch: codex/a9-36-alpha2-supplement
Source Baseline: 013cf7966c1f5858e2a2c58542d6f9495e88d29e
Target Version: 0.3.0-alpha.2
Candidate: WIN7-46 (product identity supplied by owner Gate A after build); M6 rollback target WIN7-42 (frozen; read-only reuse proposed)
Phase-Gate: A9_36_DEVELOPER_VERIFIED
Win7-Validation: NOT_PERFORMED
```

## 1. 当前结论与请求批准范围

2026-10-15负责人对六路径本地实现提案回复“批准”。原提案SHA256为`00d3ee17e07086b5b0093dec0084a1fc04d6be35f536a281a2653ed4573d62ae`。本节覆盖下文DRAFT与待批准的历史表述；生效范围仅§3六路径本地实现、检查和独立复核，目标传输/执行、提交/推送/发布仍未授权。隔离工作树为`/Users/qlyf/.codex/worktrees/a9-36-alpha2-supplement/win7-coding-Agent`，分支codex/a9-36-alpha2-supplement，HEAD013cf796…。原A9-33的10件文档/驱动工作字节以逐件SHA复制为输入，原树和主树修改均保留。记录位于准备run的A9_36_INPUT_HANDOFF.json。不把输入补丁冒充HEAD已包含，不改产品或冻结候选。

2026-10-16负责人裁决以本文件为A9-36唯一生效版本（选项A，ADR-0244）。此前在`codex/a9-33-batch2-win7-acceptance`工作树维护的A9-36草案（DRAFT_READY_FOR_REVIEW，经三轮codex只读复审）已并入本文：§4.1必跑集合、§4.2隔离范围、§8（M6）、§2与§5的相应补充，ADR-0238～0243的文本与引用并入本分支。该草案不再维护。并入内容是对已批准范围的追加修订：2026-10-15对六路径M1～M5本地实现的批准、§2现有字节和§6～§7的历史记录不变。2026-10-16负责人批准按§9缺口追加实现（含M6），仍限§3六路径（ADR-0245）：M2-05已实现断言保留，M1-02加本地裸origin；实现、开发机合同与独立复审可进行，不提交，不执行目标机。新目标门A未批准，M1～M6目标执行仍`NOT_PERFORMED`。实现缺口比对见§9。

负责人已委托优先由执行代理完成验证，并指定复用Win7 agent保存的真实服务配置。当前机器和配置只读核对已完成；M1～M5目标产品验证仍NOT_PERFORMED。补证组及缺口只维护在既有[缺口处置表§7](../plans/A9_ALPHA2_GAP_DISPOSITION.md#7-只读证据对账与最小补证清单2026-10-15-utc)，本任务不另建进度台账。

现有A9-33是封闭十阶段、25用例/43断言的第二批合同。新补证需要独立调度入口；不能向原闭集塞入新模式、把旧正式授权视为未消费，或在`.acceptance`中另写未获准实现来绕过C14。本提案只申请下述六路径的本地验收输入实现、相关检查及独立复核。当前DRAFT不授予新路径实现权限。

本次申请不包括产品实现、构建新产品包、修改候选/旧证据、目标传输/目录/任务/执行、提交、推送、合并或签发。适配完成后，按准确工具字节、目标、run和有界预算形成一次完整的目标执行材料，再请求适用门A；不得先运行再补签。

## 2. 源与受保护输入

- 当前补证绑定 WIN7-46（包含 A9-37/38 的 Alpha 2 最终候选）。依据为负责人 2026-10-17 的接手授权与整合分支 ADR-0250、ADR-0251。产品身份在构建冻结后由负责人签发的门 A 授权提供：`candidate` 固定为 `WIN7-46`；source、ZIP、manifest、M6 正向持久层与原生 SHA 不在代码预填。WIN7-46 构建、冻结及新门 A 为 `NOT_PERFORMED`。本轮不构建正式候选。
- （提案时的历史输入，现由下条取代）当前任务分支HEAD为`013cf796…`。A9-33已授权M4工作字节为候选外输入：driver SHA256 `bd088ad7b39d0ada484d251aebc259e7a5767b3b8a4a4f60e8c77469a138248e`，contract-test SHA256 `98db497f8c324221f3e924f5f009314bb6c7113bd838cd5de7d2a9cf2da75d8f`，见[A9-33 §6.79](A9_33_BATCH_2_WIN7_ACCEPTANCE.md#679-alpha2补证执行委托与准备2026-10-15-utc)。批准后先核对实际ref/worktree/HEAD/dirty，保留现有全部修改；在新隔离分支明确登记基线与这两项补丁输入，不把工作字节说成HEAD已包含。
- 六路径当前字节由执行代理在开发机复算，完整清单见下表及 `outputs/a9-36-rebind-codex/final-six.sha256`。基线 HEAD 为 `013cf796…`，本树未提交。入场快照八项全部匹配；六路径匹配 §10.10 的 r7 修复后记录，未发现改绑半成品。原 §2 早期表与当前字节不同，原表保存在入场任务书副本中。详细判断见 §10.12。

| 路径 | 字节数 | SHA256 |
|---|---|---|
| `src/shell/tests/product/a9-batch2-driver-entry.cjs` | 274205 | `ddf8f134fd3591dbd1ee1bb0c9c248ffff36f5a06fe4adf72cea9874baaec354` |
| `src/shell/tests/product/a9-batch2-contract.test.ts` | 524330 | `d5b3e4fb0a2d055234a71be8b81e9297b714013f567183ee511b0f18cf2bf546` |
| `release/win7-product-v3/a9-alpha2-supplement.cjs` | 77076 | `3c32f6194f862a2d80cf81ae66818af08af3a8ae70955d59ce6f0b11f1952e0d` |
| `release/win7-product-v3/a9-alpha2-supplement-request.cjs` | 13107 | `7e5b392ac9a122def4ad098836fbae2cc62fc155649aed8e1f032cac59ddd337` |
| `release/win7-product-v3/a9-alpha2-supplement-desktop.ps1` | 6259 | `cd78d5475b7512164ca154bad06f64b7a8c589e3233fdac69ed70d4e20d5ed3b` |
| `release/win7-product-v3/A9_ALPHA2_SUPPLEMENT_VALIDATION.md` | 32182 | `b3bff7fd825558f132988c0adffe3ce67647df0688704ff01e0002b548b3add6` |

- M6回退目标保持WIN7-42冻结候选：源`94385a87d22928acc1ce5dd8f1881d89e0d4473b`，ZIP SHA256 `3b6e0b72b98de794594cd6924a1298ef75ed72bafcebacf966c86ad2382a01cf`（101454849字节）。M6只读使用其包内`state/dist/a9-persistence.js`（SHA256 `d57f1aa6fd2425f3da1ae20654fbe68782f5e0ab1e172d5579bfd615ebf8755e`）与better-sqlite3。授权须提供 `m6.w42_persistence_sha256` 并与上述完整钉相等；source、ZIP、manifest 也须逐项匹配代码中的 WIN7-42 完整钉。manifest SHA256 为 `6f7b224cdb304c9e10edf87ec9c490ffeb7dd5be42f9432ba3b6c5f3df3908c9`。正向 `m6.cand_persistence_sha256` 与 `m6.native_sha256` 只取授权值。
- M1-02的19种Git形态清单取自`release/win7-product-v3/a9-win7-42-smoke.cjs`中的`W42_GIT_FORMS`（SHA256 `1d0539c8e9a5b76541fe7ef55c59313fdc33bfadd13ffdaa765606e95c0dd6fb`）。该文件在WIN7-42源提交`94385a87…`与本任务基线`013cf796…`中字节相同（开发机`git show`复算）。清单只读引用，不修改。`a9-alpha2-supplement.cjs`内`GIT_FORMS`的19条与该清单逐条相同（开发机node比对，2026-10-16）；其源码注释所写“源文件SHA256 `3ab98528…`”与该文件SHA不符，来源`UNKNOWN`，不影响命令文本一致，见§9。
- 主工作区dirty/untracked、WIN7-45冻结目录、正式run5773470e…、旧候选、首失败与HALTED全部保护。新证据在候选外新run；准备run0daf288c…的失败和只读结果保留。

## 3. 拟批准精确允许路径

| 路径 | 最小责任 |
|---|---|
| `src/shell/tests/product/a9-batch2-driver-entry.cjs` | 复用当前真实main/preload/IPC驱动；补充入口独立显式启用，不扩张原MODE_TABLE或正式套件闭集 |
| `src/shell/tests/product/a9-batch2-contract.test.ts` | 保留原闭集回归，增加新驱动输入、判定器及假PASS反例 |
| `release/win7-product-v3/a9-alpha2-supplement.cjs` | 固定M1～M5编排、回环负例夹具、隔离工作区、结果闭包；调用既有产品/Runner/Policy，不接受任意外部执行脚本 |
| `release/win7-product-v3/a9-alpha2-supplement-request.cjs` | 独立请求/批准pin/哈希/目标/run/预算/时效校验与消费记录，不复用旧账本 |
| `release/win7-product-v3/a9-alpha2-supplement-desktop.ps1` | 普通交互桌面身份/Medium/InJob准入及固定派发/退出取证；不改变账户、系统策略或权限 |
| `release/win7-product-v3/A9_ALPHA2_SUPPLEMENT_VALIDATION.md` | 精确输入、范围、必需断言、输出、停止和恢复条件 |

2026-10-16修订追加责任（待实现批准，不新增路径）：

| 路径 | 追加责任 |
|---|---|
| `a9-alpha2-supplement.cjs` | M6：`m6-fixtures`、`m6-probe`两个子命令；§9缺口项的编排部分 |
| `a9-alpha2-supplement-request.cjs` | 追加`m6`阶段（`PHASES`、预算、账本） |
| `a9-alpha2-supplement-desktop.ps1` | `ValidateSet`追加`m6` |
| `a9-batch2-driver-entry.cjs`、`a9-batch2-contract.test.ts` | §9缺口项的产品链路断言与假PASS反例 |
| `A9_ALPHA2_SUPPLEMENT_VALIDATION.md` | §4.1的精确输入与断言、M6章节、放行规则 |

M6不新增路径：夹具生成与目标侧探针作为`a9-alpha2-supplement.cjs`的两个子命令（`m6-fixtures`、`m6-probe`）实现，源码位于上表既有路径内，不另设脚本。该文件的字节按SHA-256钉住后传输到目标机，由包内`electron.exe`以ELECTRON_RUN_AS_NODE=1执行`m6-probe`。夹具包（夹具、损坏副本、manifest、开发机基线JSON）是`m6-fixtures`在开发机的输出，按SHA-256钉住。SHA-256只证明输入身份，不替代路径白名单（AGENTS.md C14）；M4的两项工作字节本身就是既有路径内源码的交付形式，不构成在路径外编写代码的先例。

相关任务书、索引、STATUS/STATUS_LOG、既有缺口表、覆盖矩阵及必要ADR可作相应文档登记。不得修改产品main/preload/IPC/Core/Runner/Gateway/原生/依赖锁，不引入新库或运行时。若必须修改产品，保存反例并另列缺陷；本提案不授予修复权限。

## 4. 最短交付链路与成功条件

1. 固定普通驱动与编排输入，先检验原闭集不变及准确请求/消费/过期/错pin/错目标/改报告负例。当前M4开发机262 PASS和独审只作为适用输入，不计Win7结果。
2. 在真实适用Electron/Node/PowerShell上检查新输入所需能力后，形成完整哈希闭包和新运行材料。只允许复用已登记Electron22.3.27/Node16.17.1、SQLite、helper及已有目标工具；使用真实路径、身份、权限、审计与退出入口。
3. 首条目标产品链路采用最小可达M4：真实公开API→Schema拒绝，逐项核对实际payload/schema/action、请求/工具/turn/批准不增加、隔离工作区和相关状态不变、正常退出及无残留。不能构造的schema/action覆写不冒充GUI直接负例。
4. 通过后覆盖既有M1 Policy/Git、M2验证/Provider/预算、M3 Diff/撤销/漂移与M5 J1～J3；每组的必跑集合、入口和判据见§4.1，隔离范围见§4.2。M1仅新受控本地仓库，不做真实外部push；M2夹具不冒充M5真实服务。没有通过结构化测试的修改仍为unverified。
5. M5以当前已保存的HTTPS api.deepseek.com/model deepseek-v4-flash为拟绑定，实际运行前重新核对。同agent账户由产品恢复DPAPI；禁止明文导出、管理员代解密、回传vault、清空原配置或使用用户原数据库取证。隔离复制加密配置所需准确文件/权限/保留方式，须纳入目标材料。J1读规则/引用、J2真实失败→修复迭代→成功测试、J3跨文件功能→构建/测试分别保留事实。服务费用与调用次数上限在实际输入形成后明确，不以“5组”推导“5次请求”。
6. 回传并核对证据闭包、秘密扫描正控、退出与进程树事实，再独立复核和负责人裁决。仅签已证明范围；开发机/组件/夹具、Win7直接执行和INHERITED_EVIDENCE分别记录。
7. M6（2026-10-16并入修订）不调用真实服务，不依赖M1～M3与M5，建议在M4通过后、M5之前执行；步骤见§8。

### 4.1 M1～M5必跑集合与判据（并入修订，2026-10-16）

来源：缺口表§7.3、§7.5，两份影响分析报告对M1～M5的建议，A9-32 §5，ADR-0239～ADR-0243（M2-05缩减为ADR-0242，M3-04口径为ADR-0243）。入口层级：`[P]`为真实产品链路（main→preload→Schema IPC→Core/Policy→Runner），`[C]`为包内模块直接求值，只算组件级，不冒充产品链路直接证据。每项的精确输入、命令、断言和预期故障注入方式在`A9_ALPHA2_SUPPLEMENT_VALIDATION.md`固定，预期的故障注入失败与意外硬门失败分开记录。

放行规则：

1. 每组（M1、M2、M3、M5；M6见§8）的必跑项全部`PASS`，该组才可签。任一必跑项为`NOT_PERFORMED`或`UNKNOWN`，该组未完成，不放行；已发生的`FAIL`保留，不被其余断言抵消。
2. 表中标为“不执行”或“排除”的项（M2-05；M1-05的自动降级；M1-07的REVIEW、WORKSPACE_WRITE模式）不属于必跑集合，不参与聚合；它们的`NOT_PERFORMED`随结论携带。
3. 必跑项因缺前置而无法执行时（缺Git使M1-02的`refs`判据与M1-04无法执行；M2-03、M2-06的审计项没有安全注入方式），该组保持未完成。执行代理不自行把它改成排除项；是否延期由负责人另行裁决并登记ADR。

| 项 | 层级 | 内容与通过判据 |
|---|---|---|
| M1-01 | 目标机只读 | 核实Git是否存在及版本；缺失时M1-04记`NOT_PERFORMED`，不安装软件、不改PATH |
| M1-02 | [P] | 保留WIN7-39实机签发、WIN7-42回归的19种Git形态检查（A9-20 §2的12类）。清单是`W42_GIT_FORMS`（来源与哈希见§2），不属于A9-33闭集。判据同A9-20 §14：每项出现审批卡，Git绑定`origin`/`main`（清单第17项`cat11-bulk-cmd`为整条命令摘要绑定），拒绝后零执行，本地裸仓库`refs/heads/main`不变。`refs`判据需要Git，缺Git时记`NOT_PERFORMED`。限制照旧携带：POSIX形态的可执行性、PowerShell `/Command`的真实执行未测试，均在确认处被拒 |
| M1-03 | [P] | 新入口`shell`与`start_process`的目标绑定：拒绝、错目标、错摘要不产生副作用；同目标新批准才执行；Read Only零副作用 |
| M1-04 | [P] | 受控本地仓库中的Git状态、Diff、本地分支与本地提交；前后文件、索引、进程事实可核对；不做外部push |
| M1-05 | [P] | 通过产品内Shell设置显式选择CMD，执行一条构建或测试类命令：核对v3流式输出事件、退出码、取消后进程树无残留。该项是“显式选择CMD”的证据，与“PowerShell缺失时自动降级”分开记录；不修改系统制造降级条件；自动降级是排除项，`NOT_PERFORMED`随结论携带 |
| M1-06 | [P] | 超过200字符的命令的批准卡：显示完整命令与`cwd`，记录1366×768下可读性；不得截断 |
| M1-07 | [C] | F-01表征：13种启动器包装写法加4种纯数据写法共17条，在Full Access下用包内Policy求值，期望全部`allow`（规则`POLICY_FULL_ACCESS_ALLOWED`）。清单见[第一份影响分析§4](../reports/2026-10/a9_alpha2_impact_analysis_g04_g05_g07_g08_g09_2026-10-16.md)。只求值，不经Shell执行；通过只表示行为与已知限制F-01一致，不表示包装器会要求确认（ADR-0239）。REVIEW、WORKSPACE_WRITE模式不在本项内，`UNKNOWN` |
| M2-01 | [P] | 变更后未验证保持`unverified`；验证失败保持`unverified`；结构化成功验证后才`verified`；再修改使旧验证失效 |
| M2-02 | [P] | `start_process`之后`verified`回到`unverified` |
| M2-03 | [P] | `tool_output`与托管所有权事件写入失败时的硬停。故障注入方式须先写入验证文档；没有安全注入方式时记`NOT_PERFORMED`，不改产品制造 |
| M2-04 | [P] | 续跑路径新循环重载AGENTS.md、环境与预算：核对实际请求构造与输入SHA。W45摘要里的`agents_marker_present`均不为true，该项不能引用旧摘要 |
| M2-05 | — | 不执行（负责人2026-10-16裁决，ADR-0242）：不重做Provider拒绝类别（missing、length、content_filter、stop加工具调用、空流、坏JSON）与预算检查。依据是对应代码区间无改动（开发机源码比较），不是Win7证据；完整Alpha 2结论须写明这两项在WIN7-45 Win7实机上`NOT_PERFORMED` |
| M2-06 | [P] | A9-32 §5中尚无直接证据的部分：Provider失败、预算零发送、审计失败之后的再次主动尝试，每项一次，判据见下表。只记“尝试过”不能关闭本项 |
| M3-01 | [P] | 文件编辑加Shell外部修改：按轮Diff、逐文件撤销、整轮撤销。逐字节记录轮前B0、轮后含Shell外部修改的B1、撤销后B2；要求B1≠B0（修改确实发生）且B2=B0。不得用“撤销前后字节相同”判定 |
| M3-02 | [P] | 续跑回合产生的检查点：中断一个回合、主动继续、新回合改文件、撤销；核对checkpoint与回合归属 |
| M3-03 | [P] | `start_process`外部变更：后台命令写文件，回合结束，审阅，撤销。同M3-01记录B0、B1、B2，要求B1≠B0且B2=B0 |
| M3-04 | [P] | 后台晚写：回合结束、轮后基线收集完成（Diff显示完成）并记录B1之后，后台进程再次写文件得到B_late（≠B1），然后撤销。判据：撤销后文件字节仍为B_late；撤销结果把该路径列入`drifted`（或界面给出等价提示）；没有静默覆盖，没有其他路径被误撤。依据是`src/workspace/src/checkpoint-manager.ts`的`undoTurn`、`undoOne`（外部修改过的条目被跳过并计入`drifted`，不盲目覆盖）；PRD A9-F03只写“不能可靠恢复时明确标记”，没有逐字界面合同，界面措辞只记观察。负责人2026-10-16已确认以此为通过口径（ADR-0243）。晚写发生在基线收集完成之前时已被基线吸收，是另一种情形，不得替代本项；也不得由普通延迟撤销代替 |
| M3-05 | [P] | 延迟撤销可撤回、后续回合可继续；涉及重启的同一旅程复核零重放 |
| M4-01 | [P] | 本文§4第3点的公开`continueTask`负例：17种非法参数，Schema拒绝且请求、工具、回合、批准计数不增加 |
| M5-前置 | 目标机只读 | 绑定准确服务、模型与配置；记录系统提示正文SHA-256（系统提示版本标记仍是`a9-system-prompt-v3`，不能区分两版正文）；选择不依赖系统Node的项目，或先只读核实Node与npm存在，不安装软件；后台进程运行期间不修改Provider（该情况产品抛`A9_PROVIDER_MANAGED_ACTIVE`，属预期拒绝，不计失败） |
| M5-J1～J3 | [P] | 按本文§4第5点。J2收尾若只有后台执行、没有有效结构化验证，结论必须是`unverified`，不得记`verified` |

M2-06判据（三项各一次；注入方式在验证文档固定，M2-03与审计项共用同一注入方式）：

| 前置失败 | 再次主动尝试的预期 |
|---|---|
| Provider失败：回环Provider对该请求返回失败，产生记录事实的中断Turn | 失败后零自动派发。恢复Provider后点击一次：新增一个Turn，其`interruptedTurnId`指向失败Turn；请求数只在点击后增加；对旧key重复点击只返回原身份，不新增派发（A9-32 §2） |
| 预算零发送：预算设为使不可压缩内容超限 | 点击得到明确预算诊断，Provider请求数与工具数不增加，新Turn事实保留（A9-32 §2）。再次点击：条件未变则得到同类诊断且仍零发送；条件已变才产生新请求 |
| 审计失败：写入审计记录失败 | 审计阻断存在期间，再次点击（含新`recoveryRevision`）返回`A9_AUDIT_PERSISTENCE_FAILED`，请求、工具、Turn计数均不增加。依据：`src/shell/product/a9-agent-runtime.js`的`continuationBlockReason`，与开发机测试`a9-task-continue.test.ts`的检查点审计失败用例 |

没有安全注入方式的项记`NOT_PERFORMED`，M2组随之未完成（放行规则3）。

费用与调用次数上限在实际输入形成后明确，必须说明是否计入探测、网关重试、工具循环和失败重跑；缺少上限则拒绝执行M5。

### 4.2 隔离范围

1. 新run的隔离根必须同时覆盖Electron的`userData`、A9数据根、工作区和恢复目录。`app.getPath('userData')`默认指向`%LOCALAPPDATA%\Win7CodingAgent`，即真实用户数据；`main.js`发现`userData/state/agent-events-v2.db`会把它作为A8库传给运行时。启动前须核实`userData`落在隔离根内且其中没有该文件；重定向方式为子进程`LOCALAPPDATA`、`APPDATA`、`TEMP`、`TMP`指向新run并关闭`WIN7AGENT_PORTABLE`（现有实现，见验证文档§1），不修改系统环境变量，不触碰用户原数据库和旧run。
2. 补充入口使用独立bootstrap，不复用现有夹具bootstrap：后者主动配置回环Provider并取消记住密钥，与M5的真实配置冲突。
3. M5凭据：只把最小必要的密文配置复制到隔离`userData`，同账户由产品恢复；原配置只读，vault不回传；恢复失败即停，证据只保存脱敏状态和必要身份信息。
4. 证据目录放在被测Git工作区之外；不执行`git clean -fdx`；清理只针对可绑定本run的进程（PID、启动时间、命令、归属一致），归属未知的保留`UNKNOWN`并停止依赖它的下游。

## 5. 目标绑定、停止与结论上限

2026-10-15只读元数据为DCCS-CHAIZL-PC/192.168.1.3/Win7 SP1 x64，agent SID `S-1-5-21-1708701742-428676696-1831205153-1001`，活动console5；旧正式run为console2。当前Medium/InJob、真实凭据恢复与TLS请求未验证，不能填成PASS。新路径、任务名、输入哈希、角色、期限和预算全部在最终执行材料中准确绑定；本提案不以旧门A签字代替。

首个身份/完整性/安全/必需审计/未知生命周期失败即停依赖下游。相同问题连续两轮未解释时停止整批重试，先最小复现；保留原始输出，不用延长等待或减少断言修复。需要超出六路径、新组件、系统修改或扩大产品范围时停止相关实现，不扩建通用验证平台。

M4当前工具P2为：四表结果的1000行/1MiB检查发生在读取/序列化之后，不能声称峰值内存被1MiB硬限制。仅用于新建、受控的小数据根；目标输入须限制该前置条件，若需处理大/未知DB另行修复，不继承为已解决。

KL-12已接受延期，仍P1/NOT_PERFORMED。A9-34、企业CA与代理按ADR-0240登记为Alpha 2已知限制并延期到RC；G16、G17按ADR-0241处置；未知write/edit/delete的覆盖边界按缺口表§7.4携带。M5只证明本次同账户凭据恢复与请求，不关闭已延期的完整A9GW-03 DPAPI矩阵（ADR-0241），M6也不产生该证据。完整Alpha2、原第二批门B（已限定签发，本任务不扩大它）、A9-32 DEVELOPER_VERIFIED和ADR-0155不因本任务获批或局部补证通过而自动签发。


## 6. 本轮实施与证据（2026-10-15 UTC）

本轮执行位置为本任务§1登记隔离树/分支，HEAD仍013cf796…加白名单六路径工作字节。主树47项dirty/untracked和A9-33树10件工作字节均保留。产品/原生/依赖锁/冻结包不改，不构建新产品，不提交或推送。新入口在候选外，不扩张A9-33十阶段或25用例/43断言；M4最短链先于其余四组。

本地初次消费者检查因新树未有core/dist失败，记录269 PASS/2 FAIL；随后按verify:quick依赖顺序完成7模块编译/静态验证后再测试消费者。编译造成24件tracked runner/dist差异，已逐件记录生成与HEAD摘要，属于本轮生成物，不交付为产品修改，最终恢复开工前字节。源码对应检查和恢复事实分别记录，不将未构建消费者通过作为源码证明。

只读工具盘点沿用负责人此前“优先由执行代理验证”及同Win7目标只读核对授权，不是本次本地批准推导的新目标写入。第一次where.exe无匹配提示遇PowerShell Stop导致查询失败，stdout0/exit1/原始CLIXML保留；静态定位后的一次有界新查询使用原W42真实Python路径线索与固定候选路径，不搜索用户内容或递归盘点。第二次退出0、stderr0：Python `C:\acceptance\python38_mvp\python.exe`，文件版本3.8.10，SHA256 `5275c42f7359fa2c7ec473be3240e57d5ce5b9301a26bd2e98e89bb9db074581`；Git `C:\acceptance\mvp_mingit\cmd\git.exe`，2.46.2.windows.1，SHA256 `02ed65496cb0b1ccfc85a8201fc224b1fa21ab15eb4eda80316bcc346b2b50a1`；PS元数据5.1.14409.1018。只证明当前文件元数据，不证明agent可运行、版本命令结果、Medium/InJob、Electron/SQLite/DPAPI/TLS或产品PASS。

本轮证据集中在主工作区`.acceptance/runs/A9-36/`，工作字节清单REVIEW_INPUTS_R1/R2/R3.json分别保留。首次独审报告independent-review-r1.md SHA256 `7a45fb326ea6e3bf8a1dfbb3ca73e63bca50ee05190fdc761b19c4286f25e66a`发现3P1：配置原字节可能含明文秘密、M5测试/读取证据未准确绑定、缺固定按需生成入口。修复包括：严格非秘密顶层字段+白名单重建；真实tool_start/end关联callId/命令/cwd/结构化结果和固定不可改功能检查器；固定--issue经前序PASS/账本/时限检查后生成当前短效请求，PS随即--run，不预制五份。

R2报告independent-review-r2.md SHA256 `74f3d636615be8c7140390b0efe18966a65bb326ca64ace25198bdeca721d110`关闭配置复制和请求生成；读取证据仍有JSON错误被当成功的问题。已修复为解析实际read结果、拒绝error/错路径/截断/非文本，核对完整内容与SHA，并同时要求calc.py:1和:2的实际行。另由主代理发现main按LOCALAPPDATA设置userData，已在子进程绑定新run内LOCALAPPDATA/APPDATA/TEMP/TMP、禁用portable并清除额外CA入口；main加载后直接核对实际userData。测试调用真实package runtime选择逻辑；首次最小manifest夹具缺状态/gates的失败保留，补齐合法夹具后通过。

当前R3工作字节全合同276 PASS/0 FAIL/0 SKIP；语法、UTF-8无BOM/LF、docs359/51和diff检查通过。独立增量复核待结果，尚无新Gate A或目标产品执行。M1～M5均NOT_PERFORMED。新只读元数据与本地反例不冒充Win7直接结果。已接受的KL-12延期和数据库读取峰值P2等限制继续携带，其他Alpha2范围不得自动裁决。


### 6.1 增量复核关闭与最终本地结果

R3报告SHA d6f6d7bd…发现真实read编号格式误拒绝、Read Only空过及请求index类型问题。R4已关闭三项。R4/R5继续指出J1最终回答与引用内容的绑定不足。最终只取turn_completed.finalMessage，按每个引用后的片段核对对应代码行，并要求明确加减法说明。只输出行号、无说明、无代码行、行号与代码对调均拒绝。R6独审报告SHA `8fe6ea6bcc7227182804194b00a60c4de9c51472495f3b7dd2944667ad3e64c7`确认该范围问题关闭；不改KL-12和既有M4读取峰值P2。

最近完整合同R7为276 PASS/0 FAIL/0 SKIP。最终引用绑定变化以R8定向14 PASS/0 FAIL验证，其余262项未重跑，不能称R8直接276 PASS。原正式模式、25/43闭集及未变路径结果保留为INHERITED_EVIDENCE；R7与R8各自绑定原清单。初次根目录jest入口失败r5原始输出保留。最终六输入清单REVIEW_INPUTS_R6.json SHA `cad3a70634225e983a1dd2bdb4532ee030e047b2912a2aa128aec9ec84b717ed`。24件本轮生成tracked runner/dist已逐件核对built SHA后恢复HEAD，恢复摘要在GENERATED_TRACKED_DIST_RESTORED.json；不交付为产品改动。

旧A9-33十件工作输入当前逐SHA匹配交接清单。主树仍原47项dirty/untracked，HEAD23ebfa53…。冻结候选ZIP、manifest及IDENTITY清单实算均匹配。无提交、推送或目标写入。A9_36_DEVELOPER_VERIFIED仅为本地输入阶段，M1～M5仍NOT_PERFORMED。

## 7. 待负责人签发的目标门A

本地输入与独审已完成。请求负责人批准候选外准确执行材料。§1此前“批准”仅授权本地六路径，未授权本节远端动作；此门来自§1明确要求“再请求适用门A；不得先运行再补签”。

| 项 | 准确范围 |
|---|---|
| 待签材料 | 主树`.acceptance/runs/A9-36/gate-a-r4/GATE_A_REQUEST.json`；SHA256 `f1c0d968ec5365c98f93592acc3e026fb7baa0add88c19a5591540c9ef9cf283` |
| 运行载荷 | 同目录authority.pending-owner.json；SHA256 `4f2323c3a61c7737240a22c39486f98e0cbd868002ec6f11000ce8b5ac9e5c40` |
| 传输闭包 | 同目录TRANSFER_MANIFEST.json；10文件，SHA256 `29462b4746a838b8d2f9a50c323d539c2bbea0f418b2c1d7ef2dce5ffeb9ca90` |
| 目标 | 192.168.1.3 / DCCS-CHAIZL-PC / Win7 SP1 x64；普通agent SID尾号1001、session5、Medium/非提升/InJob=false均在新实际入口核验 |
| 新run | 0daf288c-7d26-4ebc-b17c-40bc9702ce13；新根`C:\A9-W43\run\0daf288c`，存在即停，不自动换根 |
| 原产品 | 原5773470e下部署目录及ZIP只读复用；source ba042757…、ZIP ae1d4bb1…；不重建、改绑或覆盖 |
| 顺序与预算 | M4→M1→M2→M3→M5，5次新请求，总墙钟5400秒，逐组新TTL≤900秒，无自动重跑；M5三轮/40 HTTPS请求/1MiB累计响应 |
| 期限 | 负责人回执后最多8小时，且不晚于2026-10-15T23:30:00Z；到期即停，不自动延长 |
| 管理动作 | 最多96次SSH控制会话、一次10文件SFTP上传及一次选定证据下载；仅新根目录/继承Modify ACL及5个准确InteractiveToken/LeastPrivilege任务。全部动作见JSON的R0～R7 |
| 回收与退出 | 下载仅evidence/identity/requests/ledger/logs，≤4096文件/128MiB；不下载work、launcher-profile/temp或vault。核对闭包、秘密扫描正控和独审。只在已确认退出、回收及准确归属后逐项删除本轮5任务；不删文件目录 |
| 保持事项 | KL-12已接受延期，仍P1/NOT_PERFORMED；M4读取峰值P2保留。其他Alpha2范围及门B不自动签发 |

五XML把启动器LOCALAPPDATA/APPDATA/TEMP/TMP也限定新run，先建准确目录再运行，保留PS预检的stdout/stderr。独立静态附注SHA `6b9a2a978dabb252677a67014b393c2abb6b6e9f55cd2a0f3c6d617138eea43d`核对十项闭包和固定命令未发现实质问题。真实cmd解析、PowerShell/Electron能力、DPAPI/TLS及五组产品仍NOT_PERFORMED。门A批准后先做实际能力与身份检查；任一失败停止下游并保留首次事实。

authority的OWNER_APPROVED是校验器所需拟执行字段，不是负责人回执。现无回执或独立pin；尚未传输、建目录/ACL、创建任务或启动产品。gate-a、gate-a-r2、gate-a-r3草稿保留但不执行。负责人确认本节GATE_A_REQUEST准确SHA后，另存回执及该材料绑定的authority pin，原字节不变。


### 7.1 门A负责人批准与执行开始（2026-10-15 UTC）

负责人对上一条准确材料回复“批准”。批准绑定GATE_A_REQUEST SHA256 f1c0d968ec5365c98f93592acc3e026fb7baa0add88c19a5591540c9ef9cf283、authority SHA256 4f2323c3a61c7737240a22c39486f98e0cbd868002ec6f11000ce8b5ac9e5c40。原载荷不改，另存execution/OWNER_GATE_A_RECEIPT.json和OWNER_GATE_A_PIN.sha256。执行代理核对六输入与十传输文件摘要一致，实际HEAD/分支和14件工作路径符合登记。有效截止2026-10-15T23:30:00Z，未延长。

当前进入R0只读预检。第一次哈希辅助函数短名H命中PowerShell内置Get-History别名，参数绑定失败，退出1/stdout0。原始CLIXML保留；未进行目标写入、任务创建或产品启动。只改只读核对命令函数名为FileSha256A36后进行一次同范围预检，不消费产品请求或重跑预算。后续按实际结果登记，不将命令入口失败认定产品缺陷。


### 7.2 R0因桌面断开停止，未进入目标写入

新门A后第二次只读预检退出0、stderr0。原始stdout为系统GB18030编码；本地首次UTF-8解析失败不重查远端，按系统编码解读同一原始字节并另存facts.json。机器/Win7 x64/SID、ZIP/manifest/electron/Python/Git准确SHA均一致。完整进程表104行，相关Electron/helper为0；五准确任务不存在，新根不存在，C盘897966469120字节可用。

实际quser显示agent会话5为“断开”，没有活动console。该状态不满足R0已批准身份/桌面条件，VALIDATION.json记FAIL并在候选外execution/HALTED_R0.json保留停止事实。没有新目标目录/ACL/上传/任务/产品执行，五组请求消费0，M1～M5均NOT_PERFORMED。SSH预算已用2/96，SFTP上传/下载均0/1。

执行代理已请求负责人在Win7切回原agent会话5的活动console。恢复不等于修改绑定或自动重试许可；原HALTED_R0不删除或改判。负责人恢复反馈后仅可在原截止和准确目标内进行新编号预检，确认全部前置后才进入R1。若恢复成其他session，不自动重绑或远程tscon/提权切换。门B和完整Alpha2不签发。


### 7.3 负责人授权切换用户，系统账户限制拒绝

负责人另行要求“你可以帮我切换用户吗”。该指令仅授权恢复既有agent会话5，不扩张验收时限。执行前只读确认机器/SID、agent Explorer在session5，两个原用户会话均为Disc。2026-10-15T23:51Z已经超过门A的23:30Z截止，原载荷和HALTED不改，不消费产品请求。

执行代理在现有管理员SSH身份下只尝试一次系统tscon 5 /dest:console /v。该调用退出1，Windows错误1327，明确回执为账户限制导致登录失败。具体是空密码/登录时段/账户策略中的哪项为UNKNOWN，不猜测。原始命令、stdout/stderr、退出和后续quser核对保存主树.acceptance/runs/A9-36/user-switch/。未提升权限、修改密码/账户/登录策略、创建SYSTEM任务或改用其他入口绕过拒绝。需要负责人在Win7本地交互登录agent。当前五组补证NOT_PERFORMED，原门A已过期，恢复桌面也不能启动过期执行。


### 7.4 负责人同意更新时间，桌面仍未恢复

负责人再次回复“批准”，按上文语境登记为同意更新过期执行时限，不解释为修改账户密码/策略或突破1327。新只读核对退出0/stderr0：机器/SID未变，agent会话5仍Disc，原Explorer仍在，新run根仍不存在。保存原证据根renewal-precheck；原停止事实不改。

执行代理已准备gate-a-renewal-r1，拟截止2026-10-16T07:45:00Z，即洛杉矶2026-10-16 00:45。原产品、四可执行输入、目标/run、预算及步骤不变；仅截止及其派生pin/XML/清单变化，十文件摘要本地核对一致。新待签请求SHA `14a9680ec70ca38e1562113e99a1160b13cab9105e0e620e1c5e47fa8f8e46d5`，authority SHA `bc6c9543c5900b147626b3a5c5d135a1af27f255fe6884eb9dccafe7cea55074`。原门A已过期，新准确pin尚未由负责人确认，故仍DRAFT_PENDING_OWNER_GATE_A，不能把本次泛指延期批准登记为新字节签发。待本机恢复agent活动console后再确认有效窗口和准确材料，当前不执行远端写入、计划任务或产品。

## 8. M6：升级与回退的持久层互读（组件级；按 R2 绑定 WIN7-46，目标执行未批准）

证据层级预期为Win7实机、组件级，绑定将要冻结的 WIN7-46 与冻结回退目标 WIN7-42。旧开发机基线来自 WIN7-45，不能作为 WIN7-46 的直接证据。新候选冻结后，须用新候选字节重新生成夹具和开发机基线。开发机已有同类SURROGATE差分（Node v20.17.0，6个场景共78项接口调用无异常），见[对照报告](../reports/2026-10/a9_alpha2_comparison_g16_g17_2026-10-16.md)；M6要回答的是同样的互读在Electron 22.3.27 / Node 16.17.1 / Windows 7上是否得到相同结果。本节经codex只读独立审核一轮（2026-10-16），6条发现已复核采纳，见[缺口表§16](../plans/A9_ALPHA2_GAP_DISPOSITION.md#16-a9-36-m6-独立审核与修订2026-10-16-utc)。

### 8.1 夹具与场景

三个基础夹具均由开发机的`m6-fixtures`调用对应包内`a9-persistence.js`生成，写入后做`wal_checkpoint(TRUNCATE)`并关闭，逐个记录SHA-256：

| 夹具 | 写入版本 | 内容 |
|---|---|---|
| F42 | WIN7-42 | 通用数据：对话、已完成任务、中断任务、checkpoint、已退出的托管句柄 |
| FCandC | WIN7-46 | 与F42相同的通用数据 |
| FCandN | WIN7-46 | FCandC加WIN7-46专有数据：`start_process`归属事件（持久化为`running`且`owned`的句柄）、`cleanupRequired:true`且`lastProbeStatus:'running_unknown'`的输入（持久层存为`cleanup_required`）、`tool_output`事件、续跑回合 |

WIN7-42不能写出专有数据，所以F42没有对应的专有数据版本。

六个正常互读场景，每个场景使用夹具的独立副本和独立数据根：

| 场景 | 夹具 | 读取版本 | 性质 |
|---|---|---|---|
| S1 | F42 | WIN7-42 | 同版本对照 |
| S2 | FCandC | WIN7-46 | 同版本对照 |
| S3 | F42 | WIN7-46 | 升级 |
| S4 | FCandC | WIN7-42 | 回退，通用数据 |
| S5 | FCandN | WIN7-42 | 回退，含专有数据（R-1、R-2） |
| S6 | FCandN | WIN7-46 | 同版本对照 |

四个损坏场景：C42是F42的前⌊长度/2⌋字节，CCand是FCandN的前⌊长度/2⌋字节；每个损坏副本由两个版本各打开一次。不使用零长度文件：开发机实测零长度文件被打开为新库，状态`ready`且文件被写入。开发机预检（Node v20.17.0）：前100字节、首页4096字节、一半长度、少一页、文件头魔数被覆盖，五种变体在两个版本上均返回`diagnostics`且主文件字节不变；除魔数覆盖外，只读探测后目录里出现`-shm`与`-wal`。

### 8.2 步骤

| 步骤 | 内容 |
|---|---|
| 1 开发机 | `m6-fixtures`生成F42、FCandC、FCandN、C42、CCand，逐个记录SHA-256；再用同一批夹具在开发机跑S1～S6与四个损坏场景，得到基线JSON并钉住哈希 |
| 2 目标准入 | 沿用M1～M5的身份、普通用户、Medium/InJob准入与退出取证。额外传输WIN7-42 ZIP（SHA256见§2）、`a9-alpha2-supplement.cjs`和夹具包到新run根并解包到隔离目录；WIN7-46 使用届时冻结并由新门 A 准确绑定的包。不启动GUI，不启动helper，不触碰用户原数据库 |
| 3 目标执行 | 对每个场景：复制夹具到独立数据根，用对应包内`electron.exe`（`ELECTRON_RUN_AS_NODE=1`）运行`m6-probe`，加载该包内持久层与better-sqlite3，打开夹具副本，调用13项接口（11读取、2修改状态），输出JSON。损坏场景只记录打开状态、打开前后主文件SHA-256和目录清单，不调用接口 |
| 4 回传比对 | 按下述比较规则比对目标机JSON与开发机基线JSON，并核对夹具包文件前后SHA-256不变 |

比较规则（第三轮复审后补）：

1. `m6-probe`的结果JSON分两部分。`env`：Node/Electron版本、平台、路径、耗时和任何取自系统时钟的值；只核对是否与目标运行时一致，不参加逐字段比较（开发机基线的Node版本必然与目标不同）。`business`：每项接口调用的成功与否与返回值；逐字段比较。
2. `business`必须含内容，不能只含条数：`listManagedProcesses`每条的`handleId`、`lastProbeStatus`、`cleanupRequired`、`ownershipState`；`listConversationFacts`每条的任务标识与目标文本（R-1、R-2的具体内容）；检查点与事件的计数。
3. `enforceRetention`由`m6-probe`传入固定的`now`，值写入验证文档，不用系统时钟。运行时生成的时间戳与自增ID若需输出，只放`env`。
4. JSON结构、字段顺序与调用顺序在验证文档固定，开发机基线与目标机用同一份`m6-probe`源码生成。

两个包的布局相同：`electron.exe`在包根，better-sqlite3在`resources/native/storage/node_modules/better-sqlite3`，`better_sqlite3.node` 在本轮不预设 SHA。两侧原生文件须匹配负责人授权的 `m6.native_sha256`；不符则在探针启动前停止。角色为 `w42` 与 `cand`。仓库内既有`RUN_WIN7_42_REPORT_VERIFY.cmd`、`RUN_A9_BATCH2_REPORT_VERIFY.cmd`已用包内`electron.exe`加ELECTRON_RUN_AS_NODE=1运行Node脚本，这是文件事实；这些脚本在Win7上的实际运行结果本次未核对。

价值说明：原 WIN7-45 与 WIN7-42 的原生引擎相同是旧证据。WIN7-46 的原生身份和持久层差异必须重新核对，不能继承该结论。M6 比较新生成的开发机基线与目标运行结果，回答 Electron 22 / Node 16 / Windows 7 上是否存在差异。负责人评审A9-36时可据此权衡是否值得占用一次Win7门A；不做M6时，完整Alpha 2结论按ADR-0241携带“M6未执行”与R-1、R-2。

### 8.3 通过判据

1. S1～S6的打开状态全部为`ready`，每个场景13项调用全部成功，共78项。
2. 目标机`business`与开发机基线`business`逐字段相同（比较规则见§8.2），`env`按该规则核对。基线包含开发机观察到的R-1（句柄`h2`的`cleanupRequired`在WIN7-42读出`false`）和R-2（续跑任务的目标在WIN7-42读出续跑提示词）。任何字段不同，M6即不通过，原始输出照存，差异由负责人裁决，不凭“已解释”放行。
3. R-1、R-2在Win7复现，等于与基线相同，满足第2条；这只说明差异在Win7同样存在，不说明回退后的产品行为正确，是否修复另行裁决。
4. 四个损坏场景全部返回`diagnostics`，没有可写的manager；实际被打开的副本主文件字节不变。意外`ready`或主文件字节变化即失败。新增的`-shm`、`-wal`等文件只记录，不单独判失败。
5. 夹具包内的原始文件前后SHA-256不变。

停止条件：身份、完整性、安全或必需审计失败即停；包内持久层无法加载或ABI不符即停并保存原始输出；相同问题连续两轮未解释时停止重试，先最小复现。

### 8.4 不含与结论上限

不含：备份生成；完整产品启动与UI恢复链路；真实进程的接管与清理；DPAPI；R-1接管后果、R-2是否进入发给模型的上下文，均仍`UNKNOWN`。G17-c的四项（DPAPI、备份生成、诊断包导出、SBOM内容适用性）按ADR-0241保持Alpha 2已知限制，M6通过也不改变。

结论上限：M6通过只证明WIN7-42与WIN7-46持久层在Win7运行时上互读夹具的行为，不证明“SQLite重启、损坏备份和旧版回退”的完整产品旅程（A9任务书§7.2）。完整旅程需要旧候选的产品驱动，不在本草案内。

R-1句柄回收前置的适用：ADR-0241要求M6开始前给出R-1句柄的回收方案。负责人选定组件级后，本方案不调用恢复入口，不按夹具PID接管或终止任何进程，夹具里的句柄只是数据库记录，没有真实进程需要回收。执行代理据此解读该前置在组件级下以“无真实进程”满足，只要求关闭数据库与探针进程并保留退出证据；评审A9-36时可否决这一解读。真实句柄回收与完整产品旅程继续`NOT_PERFORMED`。

工作量与授权面：目标侧新增传输一个约101MB的ZIP和夹具包，无服务费用；新增输入哈希与目标材料须并入最终执行材料，再请求适用门A，不以旧门A代替。

## 9. 并入后实现缺口比对（2026-10-16 UTC，只读）

范围：把§4.1必跑集合、§4.2隔离范围、§8（M6）与§2的六路径现有字节逐项比对。方法是读`a9-alpha2-supplement.cjs`、`a9-alpha2-supplement-request.cjs`、`a9-alpha2-supplement-desktop.ps1`、`A9_ALPHA2_SUPPLEMENT_VALIDATION.md`，以及驱动`a9-batch2-driver-entry.cjs`中的五个补证入口（`continueSchema`、`supplementPolicyGit`、`supplementVerification`、`supplementReview`、`supplementRealModel`）。证据层级为开发机静态阅读。没有运行驱动与合同测试，没有触碰目标机，结论是静态判断，不是行为验证。

状态：`C`已覆盖，`P`部分覆盖，`N`未覆盖，`X`超出ADR-0242缩减的已实现内容。断言编号写作“组-序号”，例如M1-A05是M1组第5条固定断言。

| 项 | 状态 | 已实现 | 缺口 |
|---|---|---|---|
| M1-01 | C | `assertActualRuntime`核对Git路径、SHA256与版本（固定2.46.2） | 无 |
| M1-02 | P | M1-A01：19条命令与`W42_GIT_FORMS`逐条相同，`shell`与`start_process`交替，审批卡、绑定摘要、零`tool_start`、审批记录 | 工作区没有本地裸`origin`，A9-20 §14的`refs/heads/main`不变判据未实现；源码注释的源文件SHA与仓库文件不符（§2） |
| M1-03 | C | M1-A02（Read Only三种入口）、A03（错摘要、错会话零执行，请求数不变）、A04（同目标批准才执行） | 无 |
| M1-04 | P | M1-A05：status、diff、add、commit，退出码与最后提交主题 | 无本地分支检查；未比对前后文件、索引、进程事实 |
| M1-05 | P | M1-A06：显式选择CMD，本地提交退出码0 | 命令不是构建或测试类；未核对v3流式输出事件；未做取消后进程树检查 |
| M1-06 | P | M1-A01第17条（270000字符）：审批卡可见，摘要绑定 | 未断言`cwd`显示、1366×768可读性、不截断 |
| M1-07 | N | 无 | 无包内Policy对17条写法的求值 |
| M2-01 | C | M2-A01五轮：未验证、结构化成功、再修改失效、大输出失败 | 无 |
| M2-02 | C | M2-A01第5轮：`start_process`后回到`unverified` | 无 |
| M2-03 | P | M2-A05：SQLite触发器令`edit`的`tool_start`写入失败，后续提交被拒 | 未覆盖`tool_output`与托管所有权事件写入失败 |
| M2-04 | P | M2-A03：两个新会话的规则标记与环境事实各出现1次 | 未覆盖续跑路径的新循环 |
| M2-05 | X | M2-A02：七种Provider结束边界；M2-A04：上下文错误只恢复一次 | ADR-0242决定不重做，但这两条已实现并属于M2的5条固定断言，去掉需改驱动与合同测试 |
| M2-06 | N | 无 | 没有`continueTask`点击路径；M2-A05的第二次提交是新Turn，不是主动继续 |
| M3-01 | P | M3-A01～A03、A06：`edit`加`write`、Diff、逐文件与整轮撤销 | 无“Shell修改已有文件”的B0、B1、B2记录 |
| M3-02 | N | 无 | 没有续跑回合 |
| M3-03 | P | M3-A05：`shell`与`start_process`新建的文件进入Diff并被撤销 | 只覆盖新建文件，未覆盖修改已有文件的B0、B1、B2 |
| M3-04 | N | M3-A04是同一保护的手工写入变体：手工改`b.txt`后撤销，`b.txt`保持，`driftReasons`含`b.txt` | 没有后台进程在轮后基线收集完成后晚写 |
| M3-05 | P | M3-A02撤回、M3-A06 `later_turn`保护与后续回合继续 | 重启后零重放沿用WIN7-45的E03、E06，未重跑 |
| M4-01 | C | M4-A01～A03：17种非法参数，Schema拒绝，计数不增 | 无 |
| M5-前置 | P | M5-A01：地址、模型、DPAPI来源、无代理、无自定义CA；J1～J3项目是Python，不依赖系统Node | 未记录系统提示正文SHA-256；未演练后台进程运行期间改Provider |
| M5-J1～J3 | C | M5-A02～A04；J2要求`verified`，J3含不可改功能检查器 | 无 |
| §4.2 第1点 | C | 子进程环境指向新run，关闭portable；driver启动即核对`userData`（`A9_36_USERDATA_NOT_ISOLATED`）并写`a2-isolated-roots.json` | 未检查隔离`userData`内无`state/agent-events-v2.db`（新run根为空） |
| §4.2 第2点 | C | M5不调用`bootstrap()`，用真实保存配置；M1～M3用夹具bootstrap | 无 |
| §4.2 第3点 | C | `copyEncryptedConfig`重建白名单非秘密配置，只复制DPAPI密文，不回传 | 无 |
| §4.2 第4点 | C | 证据在`run_root/evidence`，工作区在`work/<phase>/中文 workspace`；无`git clean -fdx`；postflight按根PID与路径前缀核对残留，不终止未知进程 | 无 |
| M6 | N | `PHASES`、预算（5请求/5400秒）、`ValidateSet`均为封闭的M4～M5 | 无`m6`阶段、两个子命令、夹具与基线、WIN7-42 ZIP传输闭包、验证文档M6章节、合同测试反例 |

合计26行：C 10行，P 10行，N 5行，X 1行。

结论：

1. 按§4.1放行规则，当前实现下M1、M2、M3、M5组都有P或N行，不能签PASS。已覆盖行可作为已实现断言的直接证据。
2. 已实现的24条固定断言（M4 3条、M1 6条、M2 5条、M3 6条、M5 4条）不作废。缺口以追加断言或追加阶段补齐。
3. 最大缺口是续跑相关项（M2-04续跑部分、M2-06、M3-02）：需要新增“制造中断任务并点击继续”的驱动场景，不能扩张A9-33原`MODE_TABLE`。
4. 全部缺口可在§3六路径内实现，不需要第七路径。
5. 旧门A（`f1c0d968…`）已过期，续期草案（`14a9680e…`）未签，其材料按旧范围（5请求、5400秒、10文件传输闭包）生成。追加缺口与M6后，须重新生成准确材料并请求新门A，不继承旧材料。
6. 源码注释的“源文件SHA256 `3ab98528…`”与仓库`a9-win7-42-smoke.cjs`（`1d0539c8…`）不符，来源`UNKNOWN`。命令文本本身逐条相同，不影响M1-A01，但注释应在下次修改该文件时更正。

负责人裁决（2026-10-16，ADR-0245）：M2-05已实现断言保留，M1-02加本地裸origin，批准按本节缺口追加实现（含M6）。下表为裁决前的问题与推荐，保留作依据：

| 问题 | 选项 | 推荐 |
|---|---|---|
| M2-05：已实现的M2-A02、A04在Win7也会运行 | a保留，作为额外直接证据；ADR-0242的携带规则随之缩小。b删除，改驱动与合同测试，ADR-0242不变 | a。夹具HTTP，不增加请求预算；删除需改代码并重跑全合同 |
| M1-02的`refs`判据 | a在M1工作区加本地裸`origin`，使“零执行”在Git层可证伪。b改判据为审批卡、绑定、零`tool_start` | a。仍无外部push；b的证据只有审计事件一个见证 |
| 是否批准按本节缺口追加实现（含M6） | 批准则实现仍只在六路径内，并重新生成门A材料 | 先裁决前两项，再批准 |

追加实现的进度与结果记录在本节之后的§10；本节比对表是实现前的静态状态，不随实现改写。不授权目标机动作，不提交。

## 10. 追加实现与独立复审结果（2026-10-16 UTC）

结论：执行代理已在 §3 六路径内完成 §9 缺口的追加实现（含 M6），开发机合同测试 319/319 通过，三轮 codex 只读复审的 P0/P1/P2 均已处理。未提交，未执行目标机，未运行 Electron，未在 Win7 实机验证。证据层级为开发机，绑定候选 WIN7-45（source `ba042757…`）、回退目标 WIN7-42（source `94385a87…`）和隔离工作树 HEAD `013cf796…`。依据 ADR-0245。

### 10.1 实现范围

固定断言共 49 条：driver 44 条（M4:3、M1:11、M2:13、M3:11、M5:6）加 M6 的 5 条。一次 driver 启动是一个 Stage，M3 新增 `restart` Stage（`reuse: main`）。Stage 表、逐断言内容、注入方法和限制见 [A9_ALPHA2_SUPPLEMENT_VALIDATION.md](../../release/win7-product-v3/A9_ALPHA2_SUPPLEMENT_VALIDATION.md) §3～§8。

| §9 项 | 关闭它的断言 |
|---|---|
| M1-01 | `assertActualRuntime`（未变） |
| M1-02 | M1-A01：19 条命令、本地裸 `origin`、本地 `main` 领先 1 个提交，`origin` 引用不变 |
| M1-03 | M1-A02、A03、A04 |
| M1-04 | M1-A05、A07 |
| M1-05 | M1-A06、A08、A09 |
| M1-06 | M1-A10 |
| M1-07 | M1-A11 |
| M2-01、M2-02 | M2-A01 |
| M2-03 | M2-A05、A07、A08、A09 |
| M2-04 | M2-A03、A10 |
| M2-05 | M2-A02、A04 保留（ADR-0245）；预算超限零发送检查仍 `NOT_PERFORMED` |
| M2-06 | M2-A10、A11、A12、A13 |
| M3-01 | M3-A01、A02、A03、A06、A07 |
| M3-02 | M3-A08 |
| M3-03 | M3-A05、A09 |
| M3-04 | M3-A10（ADR-0243 口径） |
| M3-05 | M3-A02、A06、A11（`restart` Stage） |
| M4-01 | M4-A01～A03 |
| M5 前置与旅程 | M5-A01、A05、A06；J1～J3 为 M5-A02～A04 |
| §4.2 | 编排器物理位置检查、driver 的 `userData` 隔离核对 |
| M6 | M6-A01～A05（组件级，无 driver） |

### 10.2 独立复审

执行者是 codex（只读）。每轮之后由执行代理对照源码核实再修复；codex 的输出不直接当作结论。

| 轮次 | 发现 | 处置 |
|---|---|---|
| 第一轮 | 0 个 P0、8 个 P1、9 个 P2 | 全部处理：Shell 对话框按用途应答、测试输入、撤销等待、字节写入、配置 `updatedAt`、M6 时限、settle 步骤；判据假阳性、Git 隔离、逐文件字节取证、审批内容摘要、M3-05 重启（新增 M3-A11）等 |
| 第二轮 | 0 个 P0、1 个 P1、6 个 P2 | P1：M6 与 Stage 在残留查询之后再判截止。P2：XDG 配置隔离、物理路径检查前移、撤销路径精确匹配与漂移字段必填、启动被拒时仍查询残留、合同测试与文档的一致性表述已处理。“每请求 ≤900 秒”经核对任务书 §7 与请求模块是请求有效期（TTL），不是执行时长上限，未改代码，只在验证文档 §2 写明 |
| 第三轮 | 0 个 P0、1 个 P1、2 个 P2 | P1：紧邻启动 driver 前再算窗口；P2：profile 目录与空 Git 配置文件的物理检查（含 reuse）、撤销说明按五种固定说明等值匹配。已全部处理 |
| 第四轮 | 0 个 P0、0 个 P1、0 个 P2 | 第三轮三项发现均关闭，未发现修复引入的新缺陷。复审的编排器与 driver 字节就是 §10.3 所列字节。codex 未重跑 Jest，319/319 是执行代理的结果 |
| 第五轮 | 0 个 P0、0 个 P1、2 个 P2 | 复审 §10.7 的 M4 第二次尝试之后对桌面入口的修复（用 .NET Process 启动 `electron.exe`）。P2：输出未显式按 UTF-8 解码；说明文字把未证实的根因写成事实、并把 EPIPE 记成第一次尝试。均已处理 |
| 第六轮 | 0 个 P0、0 个 P1、0 个 P2 | 第五轮两项 P2 关闭，未发现新缺陷；`Write-RawText` 的重定向、空串、参数解析均无问题，六个变异被断言挡住。结论是对 Windows PowerShell 5.1 行为的推理，目标机运行仍是 `NOT_PERFORMED`。复审输出 SHA256 `f6775918…` |
| 第七轮 | 0 个 P0、0 个 P1、2 个 P2 | 复审 §10.9 的 m4 失败之后对编排器的修复（`verifyManifestTree` 经 `original-fs` 读文件）。codex 独立复算：WIN7-45 的 ZIP 与清单的 799 个文件逐项一致，`default_app.asar` 是清单第 754 项；从 `electron.exe` 内嵌源码读到 ASAR 包装的 `statSync` 转交归档 `lstatSync`，机制成立。结论：3 秒耗时不能证明失败条目，也不能排除目标目录另有文件被改动。P2-1：执行身份复核 `self.includes('SessionId=5')` 会接受 50、51；P2-2：注释、测试标题把推断的失败条目写成事实，且 `original-fs` 加载抛错时不会得到专用错误码。均已处理，复审输出 SHA256 `cc2873f8…` |
| 第八轮 | 0 个 P0、0 个 P1、0 个 P2 | 增量复审：第七轮两项 P2 均关闭；`sessionIdOf` 的 49 组内存演算、`rawFileSystem` 的 try/catch、三处文字和新用例的四个内存变异均通过，没有新缺陷。codex 另记一处既存词法风险，不计分级、非本轮回归：组 SID 判断 `includes('S-1-16-8192')` 会命中 `S-1-16-81920`，真实令牌上的可达性未验证，本轮未改。codex 未重跑 Jest，321/321 是执行代理的结果。复审输出 SHA256 `8d098f35…` |

第三轮的修复已由第四轮复审（2026-10-17 UTC，输出 SHA256 `afb1f113…`）。另有 319 个合同测试和对每条修复的变异检查（去掉修复后对应测试失败）。codex 在第三轮明确回答：没有发现 `m1/main` 因空全局 Git 配置而提交失败的问题（M1 的提交命令自带 `-c user.name/user.email`）。

### 10.3 开发机验证

- 合同测试：`cd src/shell && npx jest --runInBand --forceExit --testPathPattern a9-batch2-contract.test.ts`，Node v20.17.0，321/321 通过（执行代理结果，codex 未重跑 Jest）。
- `node --check` 检查三份 CJS，`git diff --check`，`node scripts/check_docs.mjs` 均通过；六路径为 UTF-8 无 BOM、LF。
- 构建副作用：验证过程中 `src/runner/dist` 的 24 个已跟踪文件被构建改写，已用 `git checkout` 还原，当前不在差异中。
- 越界检查：除六路径与文档登记外，没有其他实现文件的改动；产品、原生二进制、依赖、冻结候选未动。

六路径字节（SHA-256 前 8 位）。编排器、验证文档、合同测试三行是 §10.10 的修复后字节；上一门（§10.8）为 75005 字节 `9e3397e2…`、29324 字节 `ca781e78…`、512161 字节 `cad83ad2…`：

| 路径 | 字节数 | SHA-256 |
|---|---|---|
| `release/win7-product-v3/a9-alpha2-supplement.cjs` | 76861 | `d87e76cd…` |
| `release/win7-product-v3/a9-alpha2-supplement-request.cjs` | 11839 | `adf9deee…` |
| `release/win7-product-v3/a9-alpha2-supplement-desktop.ps1` | 6259 | `cd78d547…` |
| `release/win7-product-v3/A9_ALPHA2_SUPPLEMENT_VALIDATION.md` | 30219 | `1f1198f3…` |
| `src/shell/tests/product/a9-batch2-driver-entry.cjs` | 274205 | `ddf8f134…` |
| `src/shell/tests/product/a9-batch2-contract.test.ts` | 515822 | `4874c42f…` |

### 10.4 仍未验证与未执行

以下为 driver 或编排器依赖、但开发机和 codex 都无法确认的产品或平台行为。每一项失败时的后果是对应断言 FAIL，不会产生假 PASS。

| 假设 | 影响断言 | 备注 |
|---|---|---|
| 托管输出审计失败在固定宽限与 2500 ms 最终回答延迟内被处理 | M2-A08 | Turn 先于输出帧结束则断言失败 |
| 晚写进程在 Diff 就绪时仍处于约 160 秒等待窗口 | M3-A10 | 窗口已过则等待超时 |
| Win7 重启后同一会话、文件、checkpoint 与计数与 main 结束时一致 | M3-A11 | “零请求”不含 Provider 探测请求 |
| 真实模型在 40 次请求内完成 J1～J3（探测最多占 2 次） | M5-A02～A04 | 失败时按实际原因分类，不放宽判据 |
| 1366×768 视口下命令卡片可读且不截断 | M1-A10 | 视口尺寸必须被观察到，不以设置窗口代替 |
| Node 16.17.1 在目标 NTFS 上对 Junction、大小写、8.3 短名的行为与路径检查模型一致 | 全部 Stage | 只在 `path.win32` 与 realpath 替身下验证 |
| 隔离的 Git 环境经真实 Runner 传递后，M1 的全部 Git 操作成功 | M1 | 已核对环境过滤与实际命令，未执行目标 Git |

`NOT_PERFORMED`：Electron 端到端运行、Win7 实机运行、M3-A11 的实际重启、M6 的目标机探针、新目标门 A 的请求与签发、目标传输与执行。

### 10.5 后续动作

新门 A 须在本节六路径字节确定后，按准确字节另行请求，不继承旧门 A（`f1c0d968…`）或续期草案（`14a9680e…`）。提交、推送、合并和任何目标机动作仍需负责人另行授权。ADR 编号在本分支到 0245，主检出最大为 0235，并入前须复核。

### 10.6 新门 A 请求材料（2026-10-17 UTC，待负责人签发）

以下为生成时点的状态。签发与执行记录见 §10.7。

执行代理按 §10.3 的六路径当前字节生成了新门 A 请求材料。材料未签发，未执行目标机，未提交。证据层级：开发机（macOS），基线提交 `013cf796…`。

材料目录是 `.acceptance/runs/A9-36/gate-a-r5/`，不在版本库内。负责人先读其中的 `GATE_A_OWNER_BRIEF.md`。

| 项 | 值 |
|---|---|
| 请求 | `GATE_A_REQUEST.pending-owner.json`，SHA256 `1ff2376f…` |
| 授权 | `authority.pending-owner.json`，SHA256 `73f28c0c…` |
| 传输清单 | 19 项，共 97.6 MiB，SHA256 `ac2105fd…` |
| 运行 | `40233e73-5fe0-47e3-8fd4-dd5d7eb974e6`，目录 `C:\A9-W43\run\40233e73` |
| 阶段 | m4 → m1 → m2 → m3 → m6 → m5，共 6 次请求，总墙钟 7200 秒 |
| 截止 | UTC 2026-10-17T08:50:00Z，签发晚于此刻则材料作废 |
| 本地校验 | 39 项通过，见 `LOCAL_CHECK.json`；含授权校验器、清单与夹具哈希、基线绑定、XML 逆向还原比对 |
| 合同测试 | 319/319，见 `local-checks/contract-r9.json` |
| 独立复审 | 四轮，第四轮 0 P0、0 P1、0 P2；六路径末次改动后均被至少一轮复审 |

与旧门 A（`f1c0d968…`）相比的变化：

| 项 | 旧门 A | 新门 A |
|---|---|---|
| 阶段 | 5 个（无 M6） | 6 个（m6 在 m3 之后、m5 之前） |
| 传输清单 | 10 项 | 19 项：新增 `extract.ps1`、6 个 M6 夹具文件、WIN7-42 ZIP |
| 任务时间上限 | PT90M | PT120M，与 7200 秒总墙钟一致 |
| 管理员 SSH 会话预算 | 96 | 112（执行代理提案，负责人可改） |
| R2 动作 | 上传并校验 | 另加 WIN7-42 包的一次解包，目标为新运行目录下的 `w42-extract` |
| 签字继承 | — | 不继承旧门 A，也不继承续期草案 |

任务 XML 与旧 `task-m4.xml` 的差别只有运行目录编号、授权哈希、阶段名和时间上限，本地校验器逆向还原后逐字节相等。

提案项（执行代理提出，待负责人确认）：SSH 会话预算 112；WIN7-42 包与解包目录留在目标机，不删除；截止取生成时刻后 8 小时。

仍为 `NOT_PERFORMED`：负责人签发、任何目标机动作、agent 交互控制台恢复（2026-10-15 观察为会话 5 断开，本次未重新查询）。续期只改 `expires_at`，用 `tools/` 内脚本重新派生全部哈希，不沿用本次签字。

### 10.7 门 A 签发与执行记录（2026-10-17 UTC，已在 R3 停止）

负责人于 2026-10-17 签发新门 A，请求 SHA256 `1ff2376f…`。回执在 `gate-a-r5/execution/OWNER_GATE_A_RECEIPT.json`。执行代理在 Win7 目标机 DCCS-CHAIZL-PC 上执行 R0 至 R3，在 m4 首次运行处停止。证据层级：Win7 实机，运行 `40233e73…`，被验候选 WIN7-45。不改变 §10.4 的未验证清单。

| 步骤 | 结果 | 证据（`gate-a-r5/execution/`） |
|---|---|---|
| R0 只读检查 | 通过。agent 会话 5 为 Active；候选 ZIP、清单、electron、Python、Git 哈希与请求一致；六个任务名和新目录都不存在；无 electron 或 helper 进程；空闲磁盘 896 GB | `R0/` |
| R1 建目录 | 完成。agent 在新运行目录得到 Modify（继承），未改父目录与既有路径 | `R1/` |
| R2 上传与解包 | 一次 SFTP 上传 19 项，逐项字节与 SHA-256 一致；WIN7-42 包解出 797 个文件、236713977 字节，`release-manifest.json` 哈希一致；PowerShell 5.1 解析 0 错误；三份 CJS `--check` 退出码 0 | `R2v/`、`R2x/`、`R2c2/`（`R2c/` 为首次失败：electron 吃掉了 stdin，无输出，已改用 EncodedCommand） |
| R3 注册任务 | 六个任务已注册，读回字段与固定 XML 一致。`schtasks` 和 COM 接口都因 XML 声明 `encoding='utf-8'` 判为格式错误，最终在内存中去掉声明行后注册 | `R3-create/`、`R3-create2/`（均失败，未创建任务）、`R3-create3/` |
| R3 运行 m4 | 失败。PowerShell 执行策略禁止载入入口脚本；没有身份文件、请求、ledger、阶段结果，也没有产品进程 | `P-m4/` |

已用预算：管理员 SSH 会话 10/112，SFTP 上传会话 1/1，SFTP 下载会话 0/1，阶段请求 0/6。目标机系统策略没有改动。

固定 XML 的两处缺陷来自旧门 A 的 XML：它们从未注册过，所以此前没有暴露。继续执行需要把六个任务 XML 的命令行改为带 `-ExecutionPolicy Bypass`（只作用于该进程）并去掉声明行。这超出门 A 固定的字节，执行代理已停止，并提出修订 1：`gate-a-r5/amendment-1/AMENDMENT_1.json`（SHA256 `dd0d19ef…`）。

负责人批准修订 1（截止仍为 UTC 2026-10-17T08:50:00Z）。回执在 `execution/AMENDMENT_1_RECEIPT.json`。执行代理上传 6 个 v2 XML，删除并重建六个任务，把 m4 第一次失败的日志移到 `logs\first-failure-m4\`。目标机系统策略没有改动。

| 步骤 | 结果 | 证据（`gate-a-r5/execution/`） |
|---|---|---|
| A1 上传 v2 XML | 通过，字节与 SHA-256 一致 | `A1-upload/`、`A1v/` |
| A2、A3 重建任务 | 首次脚本因 `schtasks /create` 吞掉标准输入而无输出（`A2A3/`）；只读查询 `Q1/` 确认六个任务已删、日志已移、无其他变化；改用 EncodedCommand 重建后六个任务就绪 | `A2A3/`、`Q1/`、`A3/` |
| A4 运行 m4（第二次） | 失败。入口通过全部身份检查并写出 `identity\m4.json`，`--issue` 写出了 `requests\m4.json`，随后 node 在写标准输出时 `EPIPE`，入口抛 `A9_36_REQUEST_ISSUE_FAILED`。没有 ledger、阶段结果或产品进程。只读查询 `Q2/` 确认目标机状态 | `P-m4b/`、`Q2/` |

已用预算：管理员 SSH 会话 16/112，SFTP 上传会话 2/2（修订 1 把上限提到 2），SFTP 下载会话 0/1，阶段请求 0/6。

根因是未在目标机证实的假设：`electron.exe` 是图形子系统程序，PowerShell 用 `&` 调用并赋值捕获时不等待它，也不为它保持标准输出管道。修复和新门见 §10.8。旧运行 `40233e73` 不再使用，其六个任务由新门 R0b 删除，文件保留。

仍为 `NOT_PERFORMED`：六组验收（M4、M1、M2、M3、M6、M5）的任何一次执行，证据下载，任务删除，门 B。

### 10.8 修复桌面入口与新门 A（r6）请求材料（2026-10-17 UTC，待负责人签发）

以下为生成时点的状态。签发与执行记录见 §10.9。

执行代理只在开发机修了桌面入口缺陷，并按新字节生成新门 A（r6）请求材料。材料未签发，目标机未执行，未提交。证据层级：开发机（macOS），基线提交 `013cf796…`。修复在 Win7 上的效果 `NOT_PERFORMED`。

修复范围仍在 ADR-0245 的六路径内，不增加第七个路径：

| 路径 | 变化 |
|---|---|
| `a9-alpha2-supplement-desktop.ps1` | 新增 `Invoke-Electron`：用 .NET `Process` 启动 `electron.exe`，两路输出按 UTF-8 异步读取，等待退出，再用 `Write-RawText` 按 UTF-8 字节写回。`--issue` 与 `--run` 都走它，不再用 `& $electron` 捕获 |
| `A9_ALPHA2_SUPPLEMENT_VALIDATION.md` | 命令行加 `-ExecutionPolicy Bypass`，写明两次失败与未证实的根因假设 |
| `a9-batch2-contract.test.ts` | 在原用例内新增桌面入口断言：禁止 `& $electron` 与 `Set-ExecutionPolicy`，要求 Process 启动、编码设置在启动前、等待在取结果前；合同测试 319/319（用例数不变） |

编排器、请求模块、driver 的字节与上一门相同（`9e3397e2…`、`adf9deee…`、`ddf8f134…`）。codex 第五轮、第六轮复审见 §10.2。

材料目录是 `.acceptance/runs/A9-36/gate-a-r6/`，不在版本库内。负责人先读其中的 `GATE_A_OWNER_BRIEF.md`。

| 项 | 值 |
|---|---|
| 请求 | `GATE_A_REQUEST.pending-owner.json`，SHA256 `9a13a17e…` |
| 授权 | `authority.pending-owner.json`，SHA256 `f6114fb4…` |
| 传输清单 | 19 项，共 97.6 MiB，SHA256 `fc5881c5…` |
| 运行 | `76c7f922-7c98-47c2-b6d8-737df1954c5b`，目录 `C:\A9-W43\run\76c7f922`（全新目录） |
| 阶段 | m4 → m1 → m2 → m3 → m6 → m5，共 6 次请求，总墙钟 7200 秒 |
| 截止 | UTC 2026-10-17T09:26:00Z |
| 本地校验 | 42 项通过，见 `LOCAL_CHECK.json`；含每个 XML 与修订 1 的 v2 XML 逐字节还原比对 |
| 合同测试 | 319/319，见 `local-checks/contract-r10.json` |

与门 A r5 相比的变化：

| 项 | r5 | r6 |
|---|---|---|
| 运行目录 | `40233e73` | 全新 `76c7f922`，不复用旧运行 |
| 任务 XML | 带声明行、无执行策略参数（修订 1 前） | v2 形式：无声明行，命令行带 `-ExecutionPolicy Bypass`（仅进程范围） |
| 新增目标机动作 | — | R0b：删除旧运行 `40233e73` 的 6 个计划任务（不删任何文件）；R2：用候选自带 `electron.exe` 探测一次新的进程启动写法 |
| SFTP 上传会话 | 1（修订 1 后 2） | 2，第二次只重传远端校验失败的同字节项 |
| 硬停止 | — | 新增：产品启动前（执行策略、身份、请求生成、进程启动）失败即停，不做诊断运行 |

风险：新写法在 Win7 上从未运行，根因只是假设。M4 之后还可能出现开发机看不到的缺陷，每个缺陷都需要负责人再签一次门。

仍为 `NOT_PERFORMED`：负责人签发、任何目标机动作、新写法的 Win7 运行。

### 10.9 门 A（r6）执行记录（2026-10-17 UTC，在 m4 处停止）

负责人于 2026-10-17 签发新门 A（r6），请求 SHA256 `9a13a17e…`，回执在 `gate-a-r6/execution/OWNER_GATE_A_RECEIPT.json`。执行代理在 Win7 目标机 DCCS-CHAIZL-PC 上执行 R0 至 R3、m4、R5、R7。证据层级：Win7 实机，运行 `76c7f922…`，被验候选 WIN7-45。

结论：桌面入口修复在 Win7 上生效；m4 在编排器的候选完整性检查处失败（`A9_36_CANDIDATE_CHANGED`），账本写入 `HALTED`，没有产品进程，没有断言结果。按硬停止规则停止，未重跑。

| 步骤 | 结果 | 证据（`gate-a-r6/execution/`） |
|---|---|---|
| R0 只读检查 | 通过。agent 会话 5 为 Active；候选 ZIP、清单、electron、Python、Git 哈希与请求一致；六个新任务名不存在，六个旧任务就绪；无 electron 或 helper 进程；空闲磁盘 895 GB | `R0/` |
| R0b 删旧任务 | 完成。旧运行 `40233e73` 的六个任务读回描述与运行目录后逐个删除；未动旧运行的任何文件 | `R0b/` |
| R1 建目录 | 完成。agent 在新运行目录得到继承的 Modify | `R1/` |
| R2 上传与解包 | 一次 SFTP 会话上传 19 项，远端字节与 SHA-256 全部等于清单；WIN7-42 包解出 797 个文件、236713977 字节，`release-manifest.json` 哈希等于固定值；PowerShell 5.1 解析 0 错误；三份 CJS `--check` 退出码 0 | `R2-upload/`、`R2v/`、`R2x/`、`R2c/` |
| R2 进程启动探测 | 第一次（`R2p/`）因探测脚本的辅助函数名与 PowerShell 别名 `Cp` 冲突而失败，目标机无变化；第二次（`R2p2/`）通过：已上传入口中的 `Invoke-Electron` 与 `Write-RawText` 返回退出码 0、7、0，UTF-8 文本完整，无残留进程。该探测在 SSH 管理员会话中运行，不证明普通桌面会话 | `R2p/`、`R2p2/` |
| R3 注册任务 | 六个任务各创建一次，读回字段（主体、登录类型、运行级别、命令、参数含 `-ExecutionPolicy Bypass`、工作目录、时限、触发器）与固定 XML 一致 | `R3-create/` |
| m4 运行 | 桌面入口通过全部检查，`--issue` 写出请求，`--run` 消费请求；编排器 `inspectCandidate` 约 3 秒内抛 `A9_36_CANDIDATE_CHANGED`，结果 `FAIL`，账本 `HALTED`，stdout `{"task":"A9-36","phase":"m4","status":"FAIL"}`，stderr 为空 | `P-m4/`、`evidence-r5/` |
| R5 取回证据 | 完成。一次 SFTP 会话下载 8 个文件（结果、身份、请求、账本三个、日志两个），本地字节与 SHA-256 等于远端清单 | `R5list/`、`R5-download/`、`evidence-r5/` |
| R7 删任务 | 完成。六个新任务读回后逐个删除；无 A9-A36 任务残留，无相关进程；所有文件和目录保留 | `R7/` |

已用预算：管理员 SSH 会话 12/112，SFTP 上传会话 1/2，SFTP 下载会话 1/1，阶段请求 1/6。目标机系统策略没有改动。

原因判断（开发机，尚未在目标机逐文件定位）：`verifyManifestTree` 用被 Electron 修补的 `fs`。候选和 WIN7-42 的清单都含普通文件 `resources/default_app.asar`，Electron 把以 `.asar` 结尾的路径当作归档目录，`isFile()` 为假。旁证：开发机上候选 ZIP 的 799 个文件与清单逐项一致；候选自带的 `selectPhysicalFileSystem` 在 Electron 内强制用 `original-fs`。codex 第七轮另从 `electron.exe` 内嵌源码读到 ASAR 包装的 `statSync` 转交归档 `lstatSync`。约 3 秒的耗时不能证明失败条目（`default_app.asar` 是清单第 754 项），结果文件没有记录失败条目。目标机上候选目录是否另有文件被改动：`NOT_PERFORMED`。

开发机修复（未提交，目标机未执行）：编排器的 `verifyManifestTree` 改走 `original-fs`（规则同候选的 `selectPhysicalFileSystem`，Electron 内取不到则失败，不回退），合同测试新增用例，合同 320/320。独立复审与新门 A 请求材料见 §10.10。

仍为 `NOT_PERFORMED`：m1、m2、m3、m6、m5 的任何一次执行，产品启动，门 B。

### 10.10 修复完整性检查与新门 A（r7）请求材料（2026-10-17 UTC，已作废，未签发）

状态更新：本节的 r7 请求材料已作废，见 §10.11。开发机修复（`original-fs`、会话号整数比较）与八轮复审记录继续有效。

执行代理只在开发机修了编排器，并按新字节生成新门 A（r7）请求材料。材料未签发，目标机未执行，未提交。证据层级：开发机（macOS），基线提交 `013cf796…`。修复在 Win7 上的效果 `NOT_PERFORMED`。

修复范围仍在 ADR-0245 的六路径内，不增加第七个路径：

| 路径 | 变化 |
|---|---|
| `a9-alpha2-supplement.cjs` | `verifyManifestTree` 经 `rawFileSystem()` 取 `original-fs`：Electron 内取不到（缺方法或加载抛错）即抛 `A9_36_PHYSICAL_FILESYSTEM_UNAVAILABLE`，不回退到被修补的 `fs`。`rawFileHash` 与 `contract.fileHash` 的算法一致。执行身份复核改用 `sessionIdOf`，把 WMIC 输出的 `SessionId=<数字>` 按整数比较（codex 第七轮 P2-1，不是本次失败的原因） |
| `A9_ALPHA2_SUPPLEMENT_VALIDATION.md` | 写明 `original-fs` 规则、失败条目未记录的推断，和会话号的整数比较 |
| `a9-batch2-contract.test.ts` | 新增两个用例：归档名文件按普通文件读取（模拟 Electron `fs`；标题标明是模拟）；会话号按整数比较。合同测试 321/321 |

请求模块、driver、桌面入口的字节与上一门相同（`adf9deee…`、`ddf8f134…`、`cd78d547…`）。

根因判断（推断）：m4 的 `A9_36_CANDIDATE_CHANGED` 来自被 Electron 修补的 `fs`。结果文件没有记录失败条目，约 3 秒的耗时不能证明失败条目。支持这一判断的证据是：开发机上 WIN7-45 的 ZIP 与清单的 799 个文件逐项一致；候选自带的 `selectPhysicalFileSystem` 在 Electron 内强制用 `original-fs`；codex 从 `electron.exe` 内嵌源码读到 ASAR 包装的 `statSync` 转交归档 `lstatSync`。目标机上的候选目录是否另有文件被改动：`NOT_PERFORMED`。

新门 A 因此在 R2 增加一次只读预检（`R2_PREFLIGHT_PROBE.js`，SHA256 `f9f6d29d…`）：在建任何任务之前，用候选自带 `electron.exe`（Node 模式）调用固定字节编排器的 `inspectCandidate` 与 `verifyManifestTree`，不写文件，不建请求，不启动产品。预检失败时脚本点名最多 20 个失败条目，执行代理停下并报告，不在目标机修复。开发机演算（不是 Win7 证据）：完好的两棵树返回 799、796 个文件；在候选副本的 `default_app.asar` 末尾追加 1 字节，返回 `A9_36_CANDIDATE_CHANGED` 并点名该条目。

材料目录是 `.acceptance/runs/A9-36/gate-a-r7/`，不在版本库内。负责人先读其中的 `GATE_A_OWNER_BRIEF.md`。

| 项 | 值 |
|---|---|
| 请求 | `GATE_A_REQUEST.pending-owner.json`，SHA256 `fca429ad…` |
| 授权 | `authority.pending-owner.json`，SHA256 `a4473990…` |
| 传输清单 | 19 项，共 97.6 MiB，SHA256 `586b1e5f…` |
| 运行 | `44e39fb0-1b15-49a3-9f7c-f3250f078f55`，目录 `C:\A9-W43\run\44e39fb0`（全新目录） |
| 阶段 | m4 → m1 → m2 → m3 → m6 → m5，共 6 次请求，总墙钟 7200 秒 |
| 截止 | UTC 2026-10-17T09:58:00Z |
| 本地校验 | 43 项通过，见 `LOCAL_CHECK.json`；含每个 XML 与门 A r6 的 XML 逐字节还原比对 |
| 合同测试 | 321/321，见 `local-checks/contract-r11.json` |

与门 A r6 相比的变化：

| 项 | r6 | r7 |
|---|---|---|
| 运行目录 | `76c7f922` | 全新 `44e39fb0`，不复用旧运行 |
| 任务 XML | v2 形式 | 同 r6 逐字节还原一致（只换运行编号与授权摘要） |
| R0b | 删除旧运行 `40233e73` 的 6 个任务 | 取消：旧任务已在 r6 的 R7 删除，R0 只核对没有 `A9-A36-*` 任务 |
| R2 | Process 启动探测 | 保留，并新增只读预检（见上） |
| 硬停止 | 产品启动前失败即停 | 另加：预检失败，在建任务之前停止 |
| 管理员 SSH 预算 | 112 | 112，r6 用了 12 |

风险：新写法在 Win7 上从未运行，根因是推断。编排器的运行时检查、驱动启动和各阶段还没有在目标机执行过，M4 之后可能暴露开发机看不到的缺陷，每个缺陷都需要负责人再签一次门。

已知残余：codex 第八轮记录一处既存的词法风险，不计分级，也不是本轮回归。`assertActualRuntime` 的组 SID 判断 `includes('S-1-16-8192')` 会命中 `S-1-16-81920`。Windows 的强制完整性级别 SID 只有 4096、8192、12288、16384 四个，真实令牌上的可达性未验证，本轮未改。

仍为 `NOT_PERFORMED`：负责人签发、任何目标机动作、新写法的 Win7 运行、目标机候选目录的逐文件核验。

### 10.11 R2 裁决：A9-36 改在新候选 WIN7-46 执行，r7 作废（2026-10-17 UTC）

结论：r7 门 A 材料作废，不签发。A9-36 不再在 WIN7-45 上执行，改在新候选 WIN7-46 上执行（A9-39 §6 的 R2）。

来源：负责人在“Alpha2 进展检查”会话裁决 R2（原话“r2”），该会话于 2026-10-17 UTC 转述给本会话。R2 裁决由整合分支登记为 ADR-0251（背景是 ADR-0250）。本会话没有收到负责人的直接确认；ADR-0251 登记后，以 ADR-0251 为准。

| 项 | 处置 |
|---|---|
| r7 材料目录 `.acceptance/runs/A9-36/gate-a-r7/` | 作废，未签发，原字节保留，不修改。请求 SHA256 `fca429ad…`，运行 `44e39fb0…`，截止 UTC 2026-10-17T09:58:00Z |
| r7 的候选、运行、期限与预算 | 不得用于 WIN7-46 |
| r6 的 m4 `HALTED`（Win7 实机，运行 `76c7f922…`，候选 WIN7-45） | 保留，不改 |
| r5 两次入口失败的首失败证据 | 保留，不改 |
| §10.10 的开发机修复 | 保留。`original-fs` 修复仍没有 Win7 成功证据，先做实际运行时只读准入 |

ADR 编号：整合分支已用到 ADR-0250，ADR-0251 由整合分支登记。本分支不使用 ADR-0246 至 ADR-0251；需要新 ADR 时从 ADR-0252 起，先告知整合分支会话。

仍为 `NOT_PERFORMED`：WIN7-46 的构建与冻结、WIN7-46 上的任何 A9-36 执行、门 A、门 B。


### 10.12 codex 接手候选改绑（2026-10-17）

执行代理在开发机完成候选改绑。绑定分支 `codex/a9-36-alpha2-supplement`、HEAD `013cf796…` 加本轮六路径字节。`Status` 保持 `APPROVED_FOR_IMPLEMENTATION`，不改变阶段门或 Win7 状态。

负责人原话：“A9-36 改绑交由 codex 在 a9-36 工作树接手，按已商定规则 a～f 执行并起草 ADR-0252。原会话恢复后不再写六路径。”实现仍限 ADR-0245 的 §3 六路径。整合分支 ADR-0250、ADR-0251 仅只读参考。本轮 ADR-0252 为 Proposed，待负责人接受。

入场判断：`outputs/a9-36-rebind-codex/entry-snapshot.sha256` 八项全部匹配。六路径的完整 SHA 与字节数对应 §10.3、§10.10 的 r7 修复后记录。原 §2 六行均为早期字节，不能据此认定后续修改未登记。任务书已写 §10.11 的 R2 裁决和 r7 作废；代码仍固定 WIN7-45 身份与 M6 正向钉，未发现 a～e 的改绑半成品。执行代理从入场字节继续，没有回滚原修改。

| 路径 | 本轮变化 |
|---|---|
| `a9-alpha2-supplement-request.cjs` | 授权固定候选编号 WIN7-46，候选哈希由授权提供；严格长度、小写、重复模式与退役身份拒绝；WIN7-42 四项完整钉逐项核对；请求与前序账本绑定授权原文件 SHA |
| `a9-alpha2-supplement.cjs` | M6 使用 FCandC、FCandN、CCand 和 cand；正向模块与原生 SHA 取授权值；基线绑定授权模块；模块不符在探针前停止；manifest source 与候选编号核对授权 |
| `a9-batch2-contract.test.ts` | 仅修改 A9-36 两个 describe 内的输入、请求接口、M6 名称和基线校验；增加候选哈希、退役身份、回退钉、格式与授权 SHA 反例；完整变更行见报告 |
| `A9_ALPHA2_SUPPLEMENT_VALIDATION.md` | 更新身份来源、授权字段、夹具名与 R2 只读预检，说明取消独立复核的取舍 |
| `a9-batch2-driver-entry.cjs` | 本轮零修改；第 1539 行 batch2 正式模式 WIN7-45 身份检查保留，留给 A9-39 阶段 2 |
| `a9-alpha2-supplement-desktop.ps1` | 本轮零修改；原有授权 SHA 传递继续适用 |

证据根为 `outputs/a9-36-rebind-codex/`。报告为 `REPORT.md`，完整入场核对为 `entry-comparison.json`，原字节在 `entry-bytes/`。原改绑的六路径外仅有四件文档登记变化：本任务书、ADR、ADR 索引和任务索引。原工作区与构建副作用逐件核对，不恢复其他会话修改。

授权边界：不提交、不推送、不连接远端或目标机、不构建正式候选、不安装依赖、不写其他工作树。不改产品与原生组件。r7 作废原字节、r6 HALTED 和全部首失败保留。本轮没有独立审核。Win7、Electron、WIN7-46 构建冻结、R2 实际运行时预检、门 A、门 B 均为 `NOT_PERFORMED`。


开发机检查结果（Node v20.17.0，使用 `/Users/qlyf/.nvm/versions/node/v20.17.0/bin` 绝对路径；本地监听可用）：

| 检查 | 退出码 | 结果与证据 |
|---|---|---|
| `npm run verify:quick` | 0 | 七模块按依赖顺序完成编译和静态检查；`verify-quick-final.log` |
| `cd src/shell && node node_modules/jest/bin/jest.js --config jest.config.js --runInBand tests/product/a9-batch2-contract.test.ts` | 0 | 349 PASS、0 FAIL、0 SKIP；`contract-final.log` |
| 三份 CJS 的 `node --check` | 均为 0 | 请求模块、编排器、driver；`local-scope-checks.json` |
| 六路径 UTF-8 无 BOM、LF、SHA 与范围检查 | 0 | driver 全文件字节未变；合同测试差异全在 A9-36 两个 describe 中；`local-scope-checks.json` |
| `npm run docs:check` | 0 | 362 件文档、51 件任务书；`docs-check.log` |
| `git -c core.fsmonitor=false diff --check` | 0 | `diff-check.log` |

合同计数由 §10.10 的 321 增至 349，净增 28 项，没有删除原用例。新增为：候选身份来源 1、退役身份逐项拒绝 3、候选编号拒绝 7、哈希格式与占位值 10、回退完整钉 4、请求与账本授权 SHA 1、授权原文件字节绑定 1、manifest 与授权身份一致 1。原用例内部另补 M6 缺授权/错模块和换行拒绝断言，不增加用例数。

两次完整合同均出现 Jest“完成后 1 秒尚未退出”的提示，之后自然退出 0；没有加 `--forceExit` 或删除断言。末次完整合同在最后一次代码变更后执行。首轮结果与末次结果分开保留。

§4 的本地闭集、请求拒绝反例、前组报告绑定、真实 preload 参数反例、回环 HTTP/HTTPS 预算反例和 M6 机制由完整合同覆盖。M6 使用仓库当前 state/dist 作两侧读取器，是 SURROGATE，不是冻结两包或 Win7 互读证据。§4 的真实 Electron/PowerShell 能力、M4 最短目标链路、M1～M6 目标组、真实服务、DPAPI/TLS、目标回传与独立复核均为 NOT_PERFORMED，本轮授权明确排除目标执行。

构建改写了 24 件 tracked runner/dist 文件。执行代理逐件保存本轮构建 SHA 与字节，核对入场副本等于 HEAD 后，只恢复这 24 件到入场字节，见 `dist-restored.json`。其余既有 dirty/untracked 保留。


#### 独立复审与 P2-01 修复（2026-10-17）

执行代理完成 P2-01 的开发机修复。绑定分支 `codex/a9-36-alpha2-supplement`、HEAD `013cf796…` 加下表工作字节。负责人已裁决修复 P2-01 并同步过期文档。授权沿用本节负责人 2026-10-17 原话与 ADR-0245 的六路径。

输入独立复审结论为 0P0/0P1/1P2。报告是 `outputs/a9-36-rebind-review/report-codex.md` 与 `review.md`。P2-01 指出前缀扰动可绕过周期检测。执行代理先新增反例并取得红测，再修改请求模块。本轮没有新的独立复审，不将执行代理修复结论写成独立审核结论。

| 新反例 | 修复前结果 |
|---|---|
| `source = '0'.repeat(39) + '1'` | 旧代码接受，拒绝断言 FAIL |
| `package_sha256 = '0' + 'ab'.repeat(32).slice(0, 63)` | 旧代码接受，拒绝断言 FAIL |
| `package_sha256 = '1' + 'f'.repeat(63)` | 旧代码接受，拒绝断言 FAIL |

修复前定向合同为 1 PASS、3 FAIL，349 项未执行，退出码 1。三条失败均为 `Received function did not throw`。合法随机 source 与 ZIP 哈希由 `crypto.randomBytes` 生成，再将前六位替换为零；正例在修复前后均 PASS。原始日志和结构化结果保存在 `outputs/a9-36-rebind-fix2/contract-before.log`、`contract-before.json`，不改判红测结果。

`identityHash` 在现有周期检测之外增加互不相同字符数检查，少于 8 个即拒绝。全零、全同、纯周期、非十六进制、长度和大小写检查保留。编排器与 M6 没有独立的同类占位检测函数；编排器通过请求模块校验授权，M6 的 `validateM6Baseline` 复用 `contract.identityHash`，因此同步采用同一规则。编排器本轮字节不变。

开发机使用 nvm 绝对路径 Node v20.17.0。`npm run verify:quick` 退出码 0，七模块按依赖顺序完成编译与静态检查。完整合同为 **353 PASS / 0 FAIL / 0 SKIP**，退出码 0；入场 349 项保留，新增三条拒绝反例和一条正向对照。Jest 提示完成后一秒尚未退出，随后自然退出 0，未使用 `--forceExit`。消费者读取本轮依赖构建输出；日志为 `verify-quick.log`、`contract-after.log`。

本轮六路径内仅修改请求模块和合同测试。六路径外仅有本任务书、`docs/STATUS.md` 顶部、`docs/STATUS_LOG.md` 顶条与既有缺口表 §23 门 A 行的文档登记变化。后三处统一为“r7 作废，按 ADR-0251 改在 WIN7-46 执行；改绑见任务书 §10.12”，其他历史段落保留。

下表是 P2-01 修复后的六路径字节，取代 §2 的改绑时摘要作为当前修复输入。完整清单另存 `outputs/a9-36-rebind-fix2/final-six.sha256`。

| 路径 | 字节数 | SHA-256 |
|---|---:|---|
| `src/shell/tests/product/a9-batch2-driver-entry.cjs` | 274205 | `ddf8f134fd3591dbd1ee1bb0c9c248ffff36f5a06fe4adf72cea9874baaec354` |
| `src/shell/tests/product/a9-batch2-contract.test.ts` | 525009 | `c213ca663ce94473ee4f4b1649d993c8275346c273ccf3fa01de4c81c5e7a909` |
| `release/win7-product-v3/a9-alpha2-supplement.cjs` | 77076 | `3c32f6194f862a2d80cf81ae66818af08af3a8ae70955d59ce6f0b11f1952e0d` |
| `release/win7-product-v3/a9-alpha2-supplement-request.cjs` | 13147 | `0017601fbc9e8ad22e6103a767374aa4bd6897539e367fd2cfe635b8a506e5ee` |
| `release/win7-product-v3/a9-alpha2-supplement-desktop.ps1` | 6259 | `cd78d5475b7512164ca154bad06f64b7a8c589e3233fdac69ed70d4e20d5ed3b` |
| `release/win7-product-v3/A9_ALPHA2_SUPPLEMENT_VALIDATION.md` | 32182 | `b3bff7fd825558f132988c0adffe3ce67647df0688704ff01e0002b548b3add6` |

证据集中在 `outputs/a9-36-rebind-fix2/`。四项指定命令的退出码、文件范围与构建恢复结果见该目录 `REPORT.md`。执行代理保留入场 1958 件文件摘要及全部 444 件 dist 原字节；仅恢复本轮构建造成的漂移，不恢复既有源码或文档修改。

授权边界保持：不提交、不推送、不连接远端或目标机、不安装依赖、不写其他工作树、不构建正式候选。r7 作废材料原字节、r6 `HALTED` 与全部首失败保留。ADR-0252 保持 Proposed；本轮不接受 ADR。WIN7-46（拟执行补证的新候选）的构建冻结、R2 实际运行时预检、Electron/Win7 直接执行、门 A 与门 B 仍为 `NOT_PERFORMED`。

### 10.13 ADR-0252 接受与本地提交（2026-10-17 UTC）

负责人 2026-10-17 原话：“批准 D1～D3：接受 ADR-0252；a9-36 分支本地提交；整合分支先本地提交 ADR-0250/0251 与 A9-39 第 1 阶段，再合入 a9-36 分支。不推送。”

ADR-0252 状态改为 Accepted。执行代理在本分支本地提交全部未提交内容，随后合入 `codex/a9-alpha2-integration-r2`。不推送；Win7、Electron 与新门 A 仍为 `NOT_PERFORMED`。

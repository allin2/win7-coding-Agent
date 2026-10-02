# A9 Alpha 2 推进顺序（2026-09-27）

> 负责人 2026-09-27 要求把已规划的修复与改进（含进行中的 WIN7-40）有序推进。本文件只定顺序与门禁，不构成任何任务的实现授权；
> 每项仍须单独任务书并取得 `APPROVED_FOR_IMPLEMENTATION`（AGENTS.md C14），有界面改动的先给交互 Demo。当前状态以 `docs/STATUS.md` 为准。

## 1. 推进原则

1. **一次只走一个 Win7 候选**：同一时间只有一个候选处在“冻结 → 门 A → 实机 → 门 B”流程中。
2. **产品改动在分支上并行开发，候选冻结后再并入 `codex/a9-alpha2`**：避免改变正在验收的候选范围（参照 gateway 排查的隔离做法）。
3. **只读核查可随时并行**：不改产品、不改候选的实验与调查不受上两条限制。
4. **先证据后修复**：凡是“疑似缺陷”（恢复目录误暂存、“已验证”误判），先在可重复的环境中复现并留证据，再定修复方案。
5. **每批一个换发**：一批开发完成后统一换发一个候选，沿用 A9-23/A9-25 的流程与取证做法。

## 2. 顺序

| 阶段 | 工作 | 性质 | 进入条件 | 完成标志 |
|---|---|---|---|---|
| 0 | A9-25 第 1 步：W40 验证套件实现 | 进行中 | 已批准 | 开发机门通过 |
| 0 | **恢复目录误暂存核查**：干净示例仓库中验证 `.agent_recovery/` 是否会被 `git status`/`git add -A`/`git add .` 纳入，内容是否含改动前原文，并比较三种保障（`.git/info/exclude`、移到产品数据目录并迁移、写 `.gitignore`） | 只读核查，与上项并行 | 无 | 核查报告与推荐方案 |
| 1 | **裁决 D1**：若核查确认误暂存，修复是否纳入 WIN7-40（需修订 A9-25 范围）或进入第一批 | 负责人决定 | 核查报告 | 裁决记录 |
| 1 | A9-25 第 2～8 步：预演 → 正式交接书 → 冻结 → 门 A → 实机 → 审核 → 门 B（WIN7-40） | 候选流程 | W40 开发机门通过（与 D1 结果） | 门 B 裁决 |
| 2 | **第一批：可靠性**（一个任务，里程碑依次交付）：① 复现并收紧“已验证”判定；② AGENTS.md 确定性加载；③ 输入上下文预算；④ Win7 能力信息注入；⑤ 会话中选择工作区后的历史加载修复（同步更新固定该行为的测试与 M4 旅程） | 产品改动，分支开发 | 任务书批准；可与阶段 1 并行开发，WIN7-40 冻结后并入 | 开发机门通过并并入 |
| 2 | helper v3 协议设计（Shell 实时输出的前置文档） | 文档，并行 | 无 | 设计评审通过 |
| 3 | 换发 WIN7-41，实机验收第一批（及 D1 若决定延后的修复） | 候选流程 | 第一批并入、WIN7-40 门 B 完成 | 门 B 裁决 |
| 4 | **第二批：执行能力**，按依赖顺序：① Shell 实时输出（helper v3，原生重建与 D-013 工件重锁）；② 后台进程工具（复用 ① 的输出流，安全面变化需 ADR）；③ 可恢复的继续机制（依赖第一批的历史加载与上下文预算） | 产品改动，分支开发 | 各自任务书批准；① 需原生构建环境 | 各自开发机门通过并并入 |
| 5 | 换发 WIN7-42（第二批；若 ① 周期过长，可拆分为两个候选） | 候选流程 | 第二批并入 | 门 B 裁决 |

## 3. 已知交互与风险

- **历史加载修复**会改变 W39/W40 M4 旅程依赖的行为（选择工作区后不加载过程记录，旅程以热身轮规避），`a9-w39-m4-workspace-loading.test.ts` 固定了现状；因此排在第一批最后，并在同一里程碑内更新测试与后续套件。
- **恢复目录**已随 WIN7-39 发布；核查结论出来前不对外宣称“不会误暂存”。
- **AGENTS.md 加载**：`agents-discovery.ts` 存在，但当前在 A9 运行路径中未见引用，第一批任务书需先确认实际行为。
- **Win7 能力信息**原列在第二批，因与 AGENTS.md 加载、上下文预算同在提示词组装处，调入第一批。

## 4. 变更本顺序

调整顺序、合并或拆分批次须负责人同意，并在本文件末尾追加记录，不改写上文。

## 5. 变更记录

- 2026-09-27，**D1 裁决**（负责人同意验收方建议）：依据[恢复目录误暂存核查报告](../reports/2026-09/a9_recovery_dir_git_exposure_check_2026-09-27.md)，误暂存已在开发机确认。
  修复不进入 WIN7-40（A9-25 范围不变），作为第一批的首个里程碑 ⓪，排在“已验证”判定之前：采用方案 3b，产品创建恢复目录时写入内容为 `*` 的
  `.agent_recovery/.gitignore`，打开工作区时对已有恢复目录幂等补写；须在第一批任务书中登记并追加 ADR，且纳入 WIN7-41 实机用例。
  方案二（恢复目录迁出工作区并迁移已有 checkpoint）与恢复目录保留期、清理合并为另一任务评估，不排入本顺序的现有批次。
  §3“核查结论出来前不对外宣称不会误暂存”改为：以核查报告为准，修复并通过 WIN7-41 前维持已知问题登记与手动缓解说明（见 `docs/STATUS.md`）。
- 2026-09-28，**WIN7-40 门 B 与编号顺延**（负责人裁决，ADR-0145）：WIN7-40 记为 `A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS`，A9-25 修订后以 `WIN7-41` 换发；
  阶段 1 延续至 WIN7-41 门 B。上文阶段 3 与 D1 记录中原定第一批使用的 `WIN7-41` 顺延为 `WIN7-42`（含恢复目录修复的实机用例），“WIN7-40 门 B 完成”的进入条件改为“WIN7-41 门 B 完成”。
- 2026-09-29，**第一批任务书批准**（负责人，[A9-26](../tasks/A9_26_RELIABILITY_BATCH_1.md)、ADR-0146）：阶段 2 的并入条件“WIN7-40 冻结后并入”按 ADR-0145 顺延读作“WIN7-41 冻结后并入”（WIN7-41 已于 `0f8af24` 冻结）；
  第一批范围增加产品观察 O-1（取消轮次写终态事件，并入 ①）与 O-2（超限文件原因措辞，并入 ⑤）；O-4 不并入，与按块撤销另立任务。
- 2026-09-29，**阶段 1 完成**：WIN7-41 门 B 签发 `A9_25_WIN7_41_A9_24_PASS`（负责人“按建议签发”）。阶段 2 第一批（A9-26）已于 `0fea04b` 并入；阶段 3 的进入条件（第一批并入、WIN7-41 门 B 完成）已满足，WIN7-42 换发任务书为 [A9-27](../tasks/A9_27_WIN7_42_REISSUE_AND_ACCEPTANCE.md)（草稿，待批准）。

- 2026-10-01，**第二批推进记录与草稿**（依据负责人 2026-09-30「按照表格执行推进计划」及随后「PLEASE IMPLEMENT THIS PLAN」）：
  第一批 A9-26（含 A9-28/A9-29）及阶段 3 的 WIN7-42 已由既有正式证据和负责人接受收尾，结论为 `A9_27_WIN7_42_A9_26_PASS`；本次不重跑或重签。
  阶段 2 的 helper v3 并行设计此前未完成；现新增[设计草稿](A9_HELPER_V3_STREAMING_PROTOCOL.md)、[A9-30](../tasks/A9_30_SHELL_STREAMING.md)、
  [A9-31](../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)、[A9-32](../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md)和[模拟 Demo](a9-30-shell-streaming-demo/index.html)。均待具体审批，不构成实现授权。
  默认依次完成 Shell 实时输出、后台进程工具、用户点击继续机制，整批一个候选；原生构建形成实际阻塞时才提出拆分并由负责人裁决。
  上表阶段 5 的旧编号 WIN7-42 已用于第一批，第二批暂定下一未占用编号 **WIN7-43**；冻结前再核对注册/文件/refs，已占用则顺延，禁止复用。
  远端 main 已核实为 `c14a968`，WIN7-42 已预发布；当前 alpha2 `a53c9b9` 的“未推送”描述是发布前快照，不代表远端现状。
  不切换或同步当前脏分支、不清理现有文件、不提交/推送；新增 ADR-0150～0152 为 Proposed。候选换发与门 A/B、Alpha 2 收口仍另行审批。

- 2026-10-01，**A9-30 具体实现批准**：负责人明确批准 [A9-30](../tasks/A9_30_SHELL_STREAMING.md) 和 ADR-0150，作为开始 Shell 实时输出实现的具体依据。
  A9-30 登记为 APPROVED_FOR_IMPLEMENTATION，ADR-0150 为 Accepted；按既有基线、目标分支和精确白名单推进。
  A9-31/A9-32 与 ADR-0151/0152 保持草稿/Proposed；独立安全/依赖复核、原生构建授权、提交推送和候选门 A/B 仍按各自合同执行。
  上述历史草稿记录保留；本登记不构成产品、构建或 Win7 PASS，也不改变整批候选和 Alpha 2 收口裁决边界。


- 2026-10-01，**A9-30 源码实现推进**：按负责人指令建立基于 `c14a968` 的独立干净工作树，
  分支 `codex/a9-30-shell-streaming`；原工作区保持原状。负责人补批打包运行时和合同测试两个精确路径。
  native→Runner→Core→SQLite→既有 Schema IPC→Renderer 源码及开发机定向检查已完成，
  见[源码报告](../reports/2026-10/a9_30_shell_streaming_source_validation_2026-10-01.md)。
  v26 构建返回套件/发布生产者、独立复核、实际 D-017 原生构建和重锁、真实 Electron/Win7 仍待完成。
  未提交、推送、整合或冻结；本记录不签整体开发机门，不触发 A9-31/A9-32 实现，不改历史表和验收裁决。


- 2026-10-01，**A9-30 收口交接材料就绪**：v26 套件生成/封装、返回记录器和开发检查包分支完成本地实现，
  具体证据与差异见 [收口准备报告](../reports/2026-10/a9_30_closeout_readiness_2026-10-01.md)，
  [交接包](A9_30_DEVELOPER_CLOSEOUT_HANDOFF.md)供负责人批准源码提交并指定独立复核人与 D-017 主机。
  正式 kit/helper/lock 未锁定，Windows 原生双构建和真实 Electron 未执行，不登记 DEVELOPER_VERIFIED。
  开发包使用独立 A9-30 标识，不分配 WIN7-43；第二批整批候选及整体 Alpha 2 裁决保持后续合同。


- 2026-10-01，**A9-30 源码提交/kit 绑定**：负责人批准后按精确清单追加 source `a3b6a67dbda43c41d27cedccbdf0875e1acc46d9`，
  从该提交生成未批准 v26 kit；三项哈希见 [绑定报告](../reports/2026-10/a9_30_source_commit_and_v26_kit_binding_2026-10-01.md)。
  kit/登记提交及构建机写入仍分别授权；独立复核人与 D-017 主机待指定。原生锁和真实 Electron 门尚未关闭。

- 2026-10-02，A9-30 r2因构建令牌检查P1撤销；r3已独立复核并本地登记批准，Win10构建机/专用标准账户/三个目录已批准并准备。远程标准账户子进程仍带HostJob，正式双构建/重锁 NOT_PERFORMED，等待[桌面探针](A9_30_WIN10_INTERACTIVE_BUILD_ENTRY.md)，详见[身份报告](../reports/2026-10/a9_30_win10_standard_account_identity_2026-10-02.md)。不提升开发机整体门，不占用WIN7-43，不影响后续Alpha2裁决。
- 2026-10-02，a9builder 真实桌面身份门 PASS；r3 首轮原生构建在 v1 smoke 的 ACL 恢复失败，第二轮未启动，产品重锁/真实 Electron 尚未执行。最小修复、四组合隔离探针及独立复核完成，源码提交和新 r4 构建目录待批准；见[首轮失败报告](../reports/2026-10/a9_30_r3_win10_first_build_failure_2026-10-02.md)。保留失败证据，不复用旧构建目录，不提升 DEVELOPER_VERIFIED，不占用 WIN7-43。
- 2026-10-02，r3 修复及 r4 双构建获批；source `8e2bcfc`，独立套件复核登记 `989bac9`。r4 首轮编译和静态检查通过，但 v1 smoke 的 LABEL 恢复拒绝访问，第二轮未启动。原始失败证据保留，LABEL 修复与标准用户探针继续定位，见[r4 失败报告](../reports/2026-10/a9_30_r4_win10_first_build_failure_2026-10-02.md)。未生成产品锁、未装配，不提升 DEVELOPER_VERIFIED，不占用 WIN7-43。


### A9-30 r5 宿主预检补充（2026-10-02）

负责人批准的五路径源码提交已追加为 `27a1de9`，未推送/合并；r5 kit 源码/ZIP 闭包独立复核通过，仍未登记正式批准。新 SID1005 的普通非提升Medium无Job身份通过，CIM/WMI OS查询拒绝，正式r5构建未启动。已准备只读运行时版本+HKLM交叉校验修正，实际PS5.1宿主门1正20负通过；控制入口目录/日志/批准绑定/阶段顺序修正及负例通过。修正源码提交待具体授权；两个已批准r5目录仍空，未扩权限/策略，产品锁、双构建、真实Electron/Win7及整体开发机门仍未完成。详见[宿主预检报告](../reports/2026-10/a9_30_r5_win10_host_preflight_2026-10-02.md)。


### A9-30 r6 kit registration (2026-10-02)

Exact four-path source commit: `7feae402edfb30da9adb649841d777ca82cc6e80`. New r6 ZIP SHA-256: `8c0f79bf2f5383be3b59b6542f27e159c00efb23f07eeabdc0a05477462cf406`. Independent kit/control review P0/P1/P2=0; 23 ZIP entries / 13 exact committed native source blobs. Registration commit: `3e2f6f602bf7b6aa0786b7c800c8541eff1198f4`. Exact HEAD registry/report byte binding PASS; no push/merge. The stage script now checks approval before writes; actual PS5.1 syntax and missing-approval negative check must run before staging.

Current 192.168.1.4 SSH/TCP22 connection times out. The pretransfer guard did not succeed: r6 transfer/staging/BuildA/BuildB NOT_PERFORMED. Network cause UNKNOWN; no account/permission/Bitvise/UAC/system policy changes. Resume after readonly network, SID1005 identity, host/tool and fresh build-r5-a/b checks; these existing approved targets remain the only build directories. Returned-evidence review, product relock, actual Electron and Win7 NOT_PERFORMED; DEVELOPER_VERIFIED not signed. See [r6 independent review](../reports/2026-10/a9_30_v26_r6_independent_kit_review_2026-10-02.md).


### A9-30 r6 Win10 双构建与独立返回复核（2026-10-02）

连接恢复并获负责人“开始构建”指令后，同一批准 source `7feae402edfb30da9adb649841d777ca82cc6e80` / registry HEAD `3e2f6f602bf7b6aa0786b7c800c8541eff1198f4` / r6 kit 在既有批准全新 `build-r5-a`、`build-r5-b` 完成两次普通非提升Medium无Job原生构建。run-id `16b5abc3-e4bb-4615-a5bc-12e02fcb5e17`、`33e3d3c9-bf4d-4f40-92f5-31b8915d13f9`；helper350720 bytes、SHA `c895a2f9e4abcb84ae2295d2e33ada6289cfd34c692b88e92276e7749cdc5a2b`，原始字节一致；两个返回包独立。实际PE/API/静态CRT、logic/capture、v1/v2及v3原始证据通过相应检查。最终独立只读返回复核P0/P1/P2=0，08:38:11+08。

A首轮返回触发旧consumer精确清单漏 `helper.exe.manifest`，保留原始ZIP/失败证据并暂停B；在已批准三精确路径修正清单及与kit的字节绑定，红2 FAIL/1 PASS、绿48 PASS/2 Windows平台SKIP，独立复核通过后在未消费的B目录构建。三文件修正仍未提交，未更改原生source/kit；不删返回项或放宽批准/身份门。背压只证明有界fail-closed，进程树清理UNKNOWN；返回复核登记、产品v26输入锁、打包及真实Electron、Win7未完成，DEVELOPER_VERIFIED不签发。主工作区和旧证据保留，未推送/合并，不占用WIN7-43，不改变A9-31/A9-32或Alpha2/RC。见 [双构建报告](../reports/2026-10/a9_30_v26_r6_win10_double_build_2026-10-02.md) 和 [独立返回复核](../reports/2026-10/a9_30_v26_r6_independent_return_review_2026-10-02.md)。


### A9-30 六路径授权提交与 v26 开发输入锁（2026-10-02）

负责人对准确六路径材料回复“授权”。按已审批字节追加本地提交 `9896ebffeef17b8e703d15e0933d767f99186780`，仅包含记录器/fixture/定向测试三文件、双构建和独立返回复核两报告、批准registry的 `return_review` 登记；分支 `codex/a9-30-shell-streaming`，未推送/合并。所有六路径提交blob逐项匹配批准SHA，原生source `7feae402edfb30da9adb649841d777ca82cc6e80`及r6 kit不变；其他11项工作树文件原始字节保留。

随后使用生产 `record-a9-v26-helper-input.mjs`、准确HEAD批准registry、同一r6 kit和两份原始返回包生成新 `release/win7-product-v3/a9-v26-input-lock.json`（7323 bytes，SHA-256 `2e5942b115f1e5f1ecf6a6c31d91ed5d4f9145b9e0751941a0aa566fdebda9df`）。锁ID `A9-30-DEVELOPER-INPUTS-D013-V26`，仅开发，记录两独立run/返回SHA及helper SHA `c895a2f9e4abcb84ae2295d2e33ada6289cfd34c692b88e92276e7749cdc5a2b`。原v25锁哈希/历史runner条目及全部其余继承输入一致；新锁当前未提交，未写正式候选authority，不占用WIN7-43。

生产重锁证据 `.acceptance/a9-30-developer/closeout/r6-production-development-lock-record.json`、`r6-development-lock-verification.json`；六路径审批/执行证据 `r6-receiver-commit-approval-material.json`、`r6-receiver-approved-commit-execution.json`。此前“待授权/NOT_LOCKED”原文及PENDING只读校验快照保留为历史。当前win10门 `PASS_D013_V26_RETURN_REVIEWED`仅原生返回范围；背压清理UNKNOWN，打包完整性/装配、真实Electron及Win7仍NOT_PERFORMED，整体DEVELOPER_VERIFIED/Alpha2/RC均未裁决。

### A9-30 开发包与真实启动补充（2026-10-02）

v26开发包source `9896ebf`已生成，本地与Win10完整784文件核验通过。SID1005 Session3普通非提升Medium无Job真实桌面首启动FAIL，原因是manifest开发状态与runtime历史状态检查不匹配。已在补批两精确路径完成最小修复和测试/独立局部复核，本次提交待具体批准；保留首失败包和历史原文，不改原生source/kit/helper。S01–S06、新包实机及DEVELOPER_VERIFIED未完成，Win7/Alpha2/RC未执行，WIN7-43仍未占用，A9-31/A9-32不开放。见[打包与启动报告](../reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)。


### A9-30 修复换包与真实 Electron 子集（2026-10-02）

负责人批准runtime/test准确两路径后，本地source `4318634` 的开发ZIP `b57d6806…7b232`、manifest `19d734ce…527ca`完整性与SID1005 Session3普通非提升无Job真实桌面启动PASS；原生source/kit/helper/开发锁按精确SHA继承。真实main/preload/native/Runner/Core/SQLite/IPC/Renderer路径的tick/双源/UTF-8/截断/Stop、已结束任务刷新/重启，以及回看/焦点/视图返回子集通过。CP936/UTF-16LE、40 native秘密切点、实际Runner背压及consumer失败、真实SQLite拒绝写入、协议帧故障、29秘密变体及4003直接切点另有范围明确的实机子集证据。9根310输出文件/84合成变体扫描命中0、正向对照有效，受检Electron已退出；历史native raw-pipe背压UNKNOWN不改判。

完整S01–S06和DEVELOPER_VERIFIED仍未签发：两文件运行中提示修正已完成39定向PASS及独立P0/P1/P2=0，源码提交待具体授权；失败验证撤销旧verified目标夹具已准备但未执行，编码负例、中断重启/退出交互仍待完成。UU在线而CUA远端输入无响应，坐标报noWindowsAvailable，不以SSH Session0代签。全部首失败和历史原文保留；不推送/合并、不占WIN7-43、不开放A9-31/32，不签Win7/Alpha2/RC。详见[当前包与实机矩阵](../reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)。


### A9-30 直接编码证据与待复核收口（2026-10-02 21:30 +08）

source4318634原锁定包在A9 Builder普通非提升Medium/无Job真实桌面完成r12编码完整链路及运行中正常关闭94断言PASS；11组有效/错误字节样本范围明确，UTF-16LE为外部选项、原生文件选择器UI未测。既有r4中断恢复不重绑。一次桌面启动后SSH调度、R1普通故障后正向重试通过；R1超时UNKNOWN调度缺陷保持，R2自动接管和实际UNKNOWN暂停有直接记录。r14目录准备失败未重跑，控制器HALTED，不继续派发。最新矩阵r8、新423出口文件及58控制器回传扫描0命中，首失败保留。两文件提示修正仍待具体提交授权/新包验证，新证据仍待完整独立复核。DEVELOPER_VERIFIED不签发，Win7 NOT_PERFORMED，WIN7-43不占用；A9-31/32及Alpha2/RC范围不开放。详见[打包与实机报告](../reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)。


### A9-30 提示源码提交及新包边界（2026-10-02 22:38 +08）

负责人批准后，Luna high对冻结66项/旧实机样本/准确提示差异独立只读复核0/0/0；仅两批准路径追加source32ee0b4，保护其他工作区修改，无推送/合并。Node20.17干净source生成新开发包ZIP08425b62…/manifest3afb3367…，完整性PASS；780载荷及原helper/SQLite等hash一致。首Node20.10诊断包和原历史保留，不宣称独立双包构建。此前94项绑定旧source4318634；新包实际启动、提示/输出/Stop仍NOT_PERFORMED。原R2暂停/UNKNOWN不恢复，新增只读r14无Task/Turn/工具派发事实不改判原记录。R3准确三目录和两固定阶段仅本地方案，Win部署/启动另行待批；开发机整体门不签发，Win7 NOT_PERFORMED、WIN7-43未占用。详见[当前包报告](../reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)§20和矩阵r9。

### 新包 Win10 受影响验证完成（2026-10-02 23:08 +08）

负责人指示“执行Win 10实机验证”后，新source32ee0b4开发包在a9builder SID1005 Session3普通非提升Medium/无Job真实桌面完成Boot15直接启动1项、First16实时输出交互32项PASS。新提示、退出前双源顺序、实际Stop/清理、刷新分页/视图/滚动焦点通过；307次先落盘再IPC观察含重复快照，负向对照有效。111返回文件哈希匹配，84合成秘密变体零命中及正向对照有效，8登记进程已退出。主代理一次桌面启动R3，后续SSH自动调度；两固定请求完成后控制器自动结束，原R2暂停与UNKNOWN保留。矩阵r10/报告§21绑定准确source/ZIP/manifest/run-id；此前旧包编码、协议负例和中断恢复不重绑为新包直接执行。新证据及精确继承的最终独立复核仍待，DEVELOPER_VERIFIED未签发，Win7 NOT_PERFORMED、WIN7-43未占用；本轮未提交、推送、合并、发布或重建原生。

### 最终独立复核及开发机收口裁决（2026-10-02）

负责人要求最终独立复核和裁决。Luna high只读复核28冻结项、66旧归档及111新返回，哈希/尺寸无差异，最终P0/P1/P2=0/0/0，建议DEVELOPER_VERIFIED。主代理据任务§4–5登记阶段门 `A9_30_DEVELOPER_VERIFIED`；实现授权保留APPROVED_FOR_IMPLEMENTATION。新source32ee0b4的直接Boot15/First16及准确未变组件继承满足开发机合同；原生raw-pipe缺终态的清理UNKNOWN按获批README/协议/返回校验器保留为有界失败边界，不升级清理PASS。此前怀疑其构成P1，经明确合同复裁撤回；全部旧失败/UNKNOWN及暂停原文保留。矩阵r11、独立记录 `r6-final-independent-closeout-review-r1.json`和[开发机收口裁决](../reports/2026-10/a9_30_developer_closeout_decision_2026-10-02.md)绑定完整source/产物/复核入口。Win7 NOT_PERFORMED，A9-31/32仍各自草稿，WIN7-43未占用、Alpha2/RC未裁决；本轮未提交/推送/合并/发布或执行新构建机动作。


### 第二批整批推进合同准备（2026-10-02）

负责人选择三项整批验收并要求实施推进计划。已在A9-30工作树准备收口登记、A9-31/32精确白名单与增量验证，
新增A9-33新候选待审合同、ADR-0155 Proposed；不代替具体任务/提交/套件/远端写入或门A/B批准。
[审批包](A9_BATCH_2_IMPLEMENTATION_APPROVAL.md) C1列25项准确本地登记路径，C2申请A9-31/ADR-0151及基线绑定，
C3–C5在实际source/套件/候选形成后分别申请。[增量矩阵](A9_BATCH_2_INCREMENTAL_VALIDATION.md)复用未受影响证据，
新helper/Runtime影响的共享安全、输出和退出链路重测；正式Win7全部NOT_PERFORMED。

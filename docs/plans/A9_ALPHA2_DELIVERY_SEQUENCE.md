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


### A9-31实施批准与工作树（2026-10-03）

负责人批准C1/C2，C1本地25路径提交c2b6356完成且产品字节未变；
A9-31/ADR-0151已批准，独立分支codex/a9-31-background-tools进入实施。
新原生kit/构建/远端写入、产品源码提交及整合尚未批准；A9-32/33仍草稿，Win7 NOT_PERFORMED。

### 2026-10-03 A9-31实施进度追加

C1已提交c2b6356，C2批准A9-31/ADR-0151及精确68路径后在独立分支实施。
[源码交接](A9_31_IMPLEMENTATION_HANDOFF.md)形成，本地定向与反例通过；managed工件/锁、实际Windows与独立收口待。
A9-32/33仍草稿；WIN7-43仍只暂定，不复用候选、不改旧结论，不以本地检查提前签批次Win7 PASS。

### A9-31源码与独立复核推进（2026-10-03）

r2准确51项已批准并本地提交2ecfc86；managed r1因独立P1/P2证据缺口不获批准。
修复与独立补充关闭审计matcher根因/反向竞态缺口；原kit和首FAIL保留。
修复源码r3审批、新准确kit批准/双构建/新锁仍待，未推送或整合。
见[修复交接](../reports/2026-10/a9_31_managed_review_fixes_and_source_handoff_2026-10-03.md)。
A9-31保持IMPLEMENTATION_IN_PROGRESS；A9-32/33草稿，WIN7-43未冻结，不提前裁决Win7/Alpha2/RC。

## 6. 第二批实施计划与新窗口交接（2026-10-11）

负责人本轮要求：“按照这个规划制定实施计划，并新开窗口，采用gpt-6.1 sol xhigh实施”。
新窗口使用 `gpt-6.1-sol` / `xhigh`，由该窗口主代理执行，不默认委派子代理。
目标依次为 A9-32 主动继续、第二批产品整合、A9-33 Win7 验收、完整 Alpha 2 范围裁决。
本节沿用本推进顺序及既有任务、矩阵和报告，不另建状态台账。

### 6.1 已核对基线与保护范围

| 对象 | 准确基线与用途 |
|---|---|
| 当前主工作区 | `codex/a9-alpha2@a53c9b9d861486e5923bc82ea70b31b76af1a939`；已有 dirty/untracked 和历史缺失 ZIP 保留，不在这里改产品 |
| 第二批实现起点 | `571ec550b5e09611f55557563d0cf2f1a4a40d1b`，A9-31 功能分支；已包含 A9-30 `c2b6356f…` 及 A9-31 产品源 `8d207ab1…` |
| A9-31 参考工作树 | `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`；只读参考，不复制其中全部在制修改 |
| A9-32 当前有效草稿 | 上述参考工作树 `docs/tasks/A9_32_EXPLICIT_TASK_CONTINUE.md`，7111 字节，SHA-256 `54041ffcaca6da76a32ccb6671a4e8405d80c4c862c4638fc6407fa9a093fa49`；采用其 §1–5 产品合同、精确路径和增量检查 |
| managed 原生输入锁 | 同工作树 `release/win7-product-v3/a9-v26-managed-input-lock.json`，7905 字节，SHA-256 `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e` |
| 共享验证矩阵 | 同工作树 `docs/plans/A9_BATCH_2_INCREMENTAL_VALIDATION.md`，SHA-256 `6ea33294be318f7abcc3b43ae253e5e973683509298733add0cf3a2a42106016`；实际形成新源后逐项判影响与继承 |
| 后续 A9-33 合同 | 同工作树 `docs/tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md`，SHA-256 `66c7d503dcd6d42438cbff022e5ad9058097e09cb344b6927abf3aa7fdffcd54`；仍须补具体基线、断言、命令及授权 |

2026-10-11 只读核对：PR #11 为 OPEN/Draft，头 `571ec550…`，未合 main。
WIN7-42 已发布内部预览，本地冻结 ZIP 与发布附件 SHA-256 一致；没有完整 Alpha 2 或新 RC 结论。
A9-30/31 的开发收口及既有 Win10 结论保留，均不代替新源或 Win7 直接证据。
主工作区、A9-30/31 工作树、候选、数据库、首失败、冻结输入、HALTED 和 UNKNOWN 均受保护。
ENGINEERING_02 §138 的 p17/w16 已停止，不恢复、不追加 p18/w17 或预算，不承接其远端授权。

### 6.2 本地实施范围与执行前登记

本轮直接实施指令授权新窗口推进 A9-32 的上述 §1–5 本地范围及同范围必要修复、验证。
执行代理先复核起点和合同字节，再创建或复用隔离工作树，在 `codex/a9-32-explicit-continue` 上登记。
起点使用完整 `571ec550…`，禁止从旧 alpha2/main 或 inspection source 开始，禁止覆盖同名脏工作树。
登记 A9-32 为 APPROVED_FOR_IMPLEMENTATION、ADR-0152 为 Accepted，追加本轮负责人原话、准确基线和范围。
同步该新工作树任务索引、STATUS/STATUS_LOG；保留历史草稿段落及所有 Accepted ADR 正文。
本计划 §6 作为交接输入，先写入新工作树已有推进顺序；核对治理规则差异，不批量覆盖其他分支文件。
当前分支旧 A9-31 草稿副本不作为 A9-32 产品实现合同，功能分支事实须按原证据引用。

实现仅修改以下产品与测试路径，路径外缺口先保存具体分析，停止其依赖动作：

- `src/state/src/a9-persistence.ts`。
- `src/core/src/a9-agent-loop.ts`。
- `src/shell/product/a9-agent-runtime.js`、`src/shell/product/a9-product-ipc.js`、`src/shell/product/preload.js`。
- `src/shell/product/renderer/a9-workbench.js`、`src/shell/product/renderer/a9-workbench.css`。
- `src/state/tests/a9-task-continue.test.ts`、`src/core/tests/a9-task-continue.test.ts`。
- `src/shell/tests/product/a9-task-continue.test.ts`、`src/shell/tests/product/a9-workbench-contract.test.ts`、`src/shell/tests/product/a9-lifecycle.test.ts`。

文档限本任务、推进顺序、现有矩阵、任务/方案索引、STATUS/STATUS_LOG、ADR/ADR 索引和本任务报告。
新开发证据写隔离工作树 `.acceptance/a9-32-developer/`，不得覆盖其他任务或旧 run。
不新增依赖、持久化表或原生能力，不改旧审批、Provider 网络边界、系统设置或恢复清理语义。
本轮未授权 Git 提交/推送/合并、远端写入、正式候选冻结、发布或正式门 A/B。
先完成可审阅的本地改动与检查；必要的后续动作再绑定准确文件、差异、哈希、目标及范围提交一次完整裁决。

### 6.3 实施顺序与完成条件

| 顺序 | 交付与执行 | 完成条件及后续依赖 |
|---|---|---|
| 1：A9-32 本地产品 | 先做 State 恢复事实/事务去重，再接 Runtime/Core、Schema IPC/preload、最后接继续卡与 Stop；沿用现有 UI，并先提供交互 Demo/受影响交互说明，Demo 路径在任务书登记 | 重启零自动请求；点击创建新 Turn；双击/刷新/崩溃后去重；旧批准失效；未知副作用先核查；残留/身份/预算/审计失败零新增派发；失败可再次主动尝试 |
| 2：开发验证与第二批整合准备 | 先编译依赖，再跑有效 A9-32 §5 的 State/Core/Shell 定向检查、verify:quick、docs:check 和 diff --check；按影响检查真实 Electron 的焦点、滚动、Stop、重启；核对 managed 锁及实际加载输出 | 完成允许路径内必要修复；提交改动摘要、当前源+补丁身份、直接/继承/未执行矩阵；准确本地提交/整合须另行授权，不改 main 或 PR #11 |
| 3：最短真实产品链路与受影响回归 | 新源和包身份形成后，准备准确开发打包/Win10 范围；复用 A9-31 既有普通入口和工具，先“启动→后台输出→Stop→重启零请求→主动继续→正常退出”，再补共享安全/恢复/预算回归 | 新包完整闭包和实际入口直接检查；旧原生仅按准确字节与上下游影响继承；远端动作按目标/身份/目录/调用上限/退出证明取得准确授权；不扩建 ENGINEERING_02 |
| 4：A9-33 整批 Win7 | 前三项满足后补齐具体 A9-33，纳入 S01–S06/BG/CONT/SAFE/UI 和已知限制；核号、预演、双干净构建、冻结、门 A、正式执行、独立审核、门 B 按该任务合同顺序 | WIN7-43 仅建议号；两次连续预演及双构建采用具体合同，不由通用规则额外增加；正式 Win7 PASS 绑定同一准确 source/ZIP/锁/run/环境/身份 |
| 5：完整 Alpha 2 裁决 | 沿用覆盖台账核对改动审阅、支持模式、五条核心旅程、恢复/部署要求及延期；补齐尚无证据项的处置 | 第二批 PASS 不自动成为完整 Alpha 2；A9-17 实机采样、真实 Provider/企业环境、POSIX/PowerShell /Command、≤799px 和 A9-34 分别保留未测或已批准限制，由负责人裁决 |

真实 Electron 或后续打包执行前读取两级验收流程；影响 UI 时采用适用前端 skill，不做整站重设计。
本轮实施指令不指定独立审核者；执行主代理不能自签独立复核，准备完整可复核材料后由负责人指定。
整合需要干净提交时，先完成全部已授权本地工作，再提交一次准确提交/整合范围，不因旧草稿状态重复询问本地实现。

### 6.4 停止、恢复与交付

安全、身份、完整性、必需审计或未知生命周期硬门失败，立即停止依赖派发并保存首失败。
同类失败两轮仍未闭环，停止整批重试，先最小复现和共同根因；不增加等待、弱化判据或追加工具建设。
遇到后续授权缺口，只暂停依赖动作，继续本地独立分析、矩阵、保护和可审阅材料。
恢复只能基于新的准确授权、源码/产物/run 和已满足原门；不恢复任何 HALTED，不改判旧 FAIL/UNKNOWN。
每阶段更新新工作树既有任务书、STATUS/STATUS_LOG、矩阵和本任务报告，写明可见行为、证据层级及准确身份。
最终返回已完成能力、实际检查、未执行项、可复用结果和下一项准确动作；不以断言数替代 Alpha 2 完成判断。

### 6.5 补记：真实 Electron 检查位置（2026-10-12）

负责人对 A9-32 与 A9-33 的前置矛盾选 C。§6.3 顺序 2 中“按影响检查真实 Electron”，改在顺序 3 的新 Windows 开发包上取证。
它不再是 A9-33 §6.1 路径生效的前置；A9-32 `DEVELOPER_VERIFIED` 待该取证后由负责人另行裁决。其余顺序不变。
按本文件 §4，本节只追加记录，不改写上文。依据见 [A9-33 §6.6](../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#66-1-前置修订裁决2026-10-12)。

### 6.6 补记：真实 Electron 检查位置再放宽（2026-10-12）

负责人同意：A9-32 §5 的真实 Electron 取证可由首次 Win7 预演取得，不再要求单独的 Win10 开发包轮次。§6.5 中“新 Windows 开发包”一语由此放宽为“新 Windows 开发包或首次 Win7 预演”。
预演证据保持 `REHEARSAL_NOT_ELIGIBLE`；A9-32 `DEVELOPER_VERIFIED` 仍待取证后由负责人另行裁决；预演能否覆盖 §5 全部项为 `UNKNOWN`。
到 Alpha 2 PASS 的路径因此不含单独的 Win10 往返：Win7 远端会话最少 3 次（连续两次预演加一次正式执行）。其余顺序不变。
按本文件 §4，本节只追加记录，不改写上文。同日负责人指定 codex 为 A9-33 技术独立复核者。依据见 [A9-33 §6.9](../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#69-负责人裁决登记与合同收窄2026-10-12)。

### 6.7 KL-12 延期修复与补证登记（2026-10-15 UTC）

负责人要求将真实helper启动后ready失败清理登记到后续计划修复。沿用 `KL-12 / P1-KL12-CONTRACT-COVERAGE`，放入第二批本轮实机工作之后的生命周期修复与补证计划。执行日期和后续任务编号待确定。A9-34的既有延期安排保留，本登记不改变其授权或优先级。

先做实际helper/transport最小诊断，形成有界复现、影响分析、最小修复及Win7直接补证方案。先取得适用实现与执行授权，再实施；不在冻结WIN7-45上改字节或重跑。缺失或错实例清理证明仍须硬停，不以延期弱化运行时安全要求。关闭标准见[覆盖台账§8](A9_BATCH_2_ACCEPTANCE_COVERAGE.md#8-kl-12-后续修复与补证计划2026-10-15-utc)。

WIN7-45本轮实机执行、回收和独立复核已结束，25用例/43断言PASS。KL-12仍P1/NOT_PERFORMED，门B未签；限定范围的结束口径见[交接书§11](A9_33_WIN7_45_ACCEPTANCE_HANDOFF.md#11-kl-12-延期登记与本轮结束口径2026-10-15-utc)。本次安排不签原完整合同满足、完整Alpha2或RC，也不授权新实现、目标动作、发布或推送。

### 6.8 Q2 已知限制登记（2026-10-16 UTC）

负责人对缺口表 Q2 按推荐裁决：企业 CA 与代理、POSIX Shell 与 PowerShell `/Command`、A9-17 启动与内存、≤799px、A9-34、KL-12 登记为 Alpha 2 已知限制并延期到 RC；G16、G17 先做只读对照。顺序 5 的完整 Alpha 2 裁决据此携带这六项。详见[缺口表§11](A9_ALPHA2_GAP_DISPOSITION.md#11-q2-裁决六项已知限制延期到-rcg16g17-先对照2026-10-16-utc)与 ADR-0240。本节不授权实现、目标动作、发布或推送。

### 6.9 G16、G17 只读对照已交付（2026-10-16 UTC）

对照报告已交付，G16 推荐 `N/A`，G17-b 推荐补最小 Win7 组 M6，G17-c 推荐延期，待负责人裁决。顺序 5 的完整 Alpha 2 裁决须携带该裁决结果。详见[缺口表§12](A9_ALPHA2_GAP_DISPOSITION.md#12-g16g17-只读对照已交付待负责人裁决2026-10-16-utc)。本节不授权实现、目标动作、发布或推送。

### 6.10 G16、G17 裁决登记（2026-10-16 UTC）

负责人对 G16、G17 按推荐裁决：G16 登记为 `N/A`；G17 升级与回退补最小 Win7 组 M6，DPAPI、备份生成、诊断包导出、SBOM 内容适用性登记为 Alpha 2 已知限制并延期到 RC。顺序 5 的完整 Alpha 2 裁决据此携带，并须写明 M6 的结果。M6 并入 A9-36 草案并获批准前，不进入执行。详见[缺口表§13](A9_ALPHA2_GAP_DISPOSITION.md#13-g16g17-裁决已登记2026-10-16-utc)与 ADR-0241。本节不授权实现、目标动作、发布或推送。

### 6.11 M6 并入 A9-36 草案（2026-10-16 UTC）

M6 已并入 A9-36 草案 §6，组件级，回退目标 WIN7-42，A9-36 仍待评审。§6.3 顺序 5（完整 Alpha 2 裁决）之前的补证组由 M1～M5 扩为 M1～M6。详见[缺口表§15](A9_ALPHA2_GAP_DISPOSITION.md#15-m6-已并入-a9-36-草案2026-10-16-utc)。本节不授权实现、目标动作、发布或推送。

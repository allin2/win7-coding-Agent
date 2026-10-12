# A9-33 — 第二批整批换发与 Win7 验收合同草稿

```text
Status: DRAFT_READY_FOR_REVIEW
Task Type: RELEASE_REISSUE_AND_WIN7_ACCEPTANCE
Target Branch: codex/a9-33-batch2-win7-acceptance
Source Baseline: NOT_BOUND (requires reviewed A9-30/31/32 integration commit)
Target Version: 0.3.0-alpha.2
Candidate: WIN7-43 (tentative; NOT_FROZEN)
Phase-Gate: A9_33_CONTRACT_PENDING_APPROVAL
Win7-Validation: NOT_PERFORMED
Decision: ADR-0155 (Proposed)
```

## 1. 授权与前置

2026-10-02负责人选择第二批三项整批验收并要求执行推进计划。本合同草稿不授予套件实现、
新候选冻结、构建机/目标机写入、计划任务或门A/B权限。审批顺序见 [审批包](../plans/A9_BATCH_2_IMPLEMENTATION_APPROVAL.md)。
只有A9-30/31/32开发机合同、必要原生双构建/锁及独立复核通过，并形成完整干净基线SHA后，才提交具体实现批准。
本批结论上限为第二批执行能力Win7 PASS，不签完整Alpha2或RC。

## 2. 候选与执行合同

- WIN7-43为默认建议；冻结前核对refs、注册、目录，已占用则顺延并在本任务中重新绑定。
  文件名采用batch2而非提前把w43写成已冻结身份；最终候选ID写入锁/manifest/报告/authority一致。
- 复用managed v26正式锁，保持A9-30、v25/W42及更早工件/报告字节；新版本/Profile/锁/源码错配拒绝装配。
  当前runtime将所有协议v3包限制为A9-30开发包，必须在本任务单独增加正式batch2分支；开发包继续无authority、不计正式候选。
- 审批 [增量矩阵](../plans/A9_BATCH_2_INCREMENTAL_VALIDATION.md)：S01–S06、BG、CONT、SAFE以及受影响UI直接Win7验证；
  未变能力精确继承并单列，真实Provider/企业环境等未执行不计本合同必需PASS。
- 两次连续成功Win7预演；身份标REHEARSAL_NOT_ELIGIBLE，不能计正式证据。预演失败保留，修复后重新取得连续两次。
- 同一准确源码/锁两个独立干净产品构建，正确性通过且ZIP逐字节相同后冻结。
  冻结后不能覆盖；产品或套件修复另建候选身份，不能复用旧FAIL身份改判。
- 候选外authority和独立pin由负责人门A绑定source/ZIP/manifest/helper/锁/套件/目标/run-id。
  草案无签发事实时不得注册或运行正式任务。
- Win7普通agent真实桌面运行main/preload/native/SQLite/IPC/Renderer；录令牌、Session、Job、codepage/补丁/runtime，
  SSH管理员仅管理传输/校验/调度，不代签桌面。目标前置失败相关阶段NOT_PERFORMED，不安装或改策略。
- 原始文件先落盘再判定，证据写候选外；包括日志、数据库、截图、时间线、进程身份、JSON及文件哈希。
  报告器在Win7普通用户复核，故障注入/错pin/改报告负例有效；秘密扫描及后飞行通过才送独立审核。
- 主代理执行并组装事实，负责人独立审核/门B；另设技术独立复核者须具体指定，不由实现方自签。

## 3. 拟批准精确白名单

仅装配/套件/直接交互驱动，不修后台/继续产品语义。产品缺陷回到对应任务或另立修复合同。

- 发布生产者：`scripts/release/build-a9-product-v3.mjs`。
- runtime消费：`src/shell/product/a9-package-runtime.js`；仅新增正式batch2描述符/manifest严格分支，保留所有历史分支。
- 新驱动：`src/shell/tests/product/a9-batch2-driver-entry.cjs`，通过现有产品入口，不改历史a9-06驱动判据。
- 测试：`scripts/release/test/a9-batch2-package.test.mjs`、`scripts/release/test/a9-package.test.mjs`、`src/shell/tests/product/a9-batch2-contract.test.ts`、`src/shell/tests/product/a9-package-runtime.test.ts`。
- 新发布输入/校验：`release/win7-product-v3/a9-batch2-input-lock.json`、`release/win7-product-v3/a9-batch2-package-integrity.cjs`、`release/win7-product-v3/a9-batch2-report.cjs`、`release/win7-product-v3/a9-batch2-smoke.cjs`。
- 新夹具/说明：`release/win7-product-v3/a9-batch2-fixtures.cjs`、`release/win7-product-v3/A9_BATCH2_WIN7_VALIDATION.md`；更新 `release/win7-product-v3/README.md`。
- 新入口：`release/win7-product-v3/RUN_A9_BATCH2_INTEGRITY.cmd`、`release/win7-product-v3/RUN_A9_BATCH2_SMOKE.cmd`、`release/win7-product-v3/RUN_A9_BATCH2_REPORT_VERIFY.cmd`。
- 新桌面控制器：`release/win7-product-v3/a9-batch2-desktop-controller.ps1`、`release/win7-product-v3/a9-batch2-desktop-request.cjs`。限定批准phase/目录/hash/run-id、身份硬门、期限及请求上限，不能执行任意命令。

CMD入口明确使用ASCII/CRLF；其余源码/Markdown为UTF-8无BOM/LF，PowerShell脚本显式编码读写、兼容实际批准目标版本。
套件安装/传输/账户/任务/远端新目录及候选外authority不借本白名单授权，形成精确目标材料后单独批准。
文档为本任务、索引、状态、覆盖/验证/审批合同、ADR及本批报告；不删除或重写Accepted ADR正文。

## 4. 检查与裁决

合同获批后执行：

```sh
node --test scripts/release/test/a9-batch2-package.test.mjs scripts/release/test/a9-package.test.mjs
npm test --workspace=@win7-agent/shell -- --runInBand --runTestsByPath tests/product/a9-batch2-contract.test.ts tests/product/a9-package-runtime.test.ts
npm run verify:quick
npm run docs:check
git -c core.fsmonitor=false diff --check
```

每个新判据有反例；原生锁/候选身份/错误authority/漏证据/任意控制器请求/秘密出口均拒绝。
任务批准前将phase映射、实机断言、执行命令、工具前置及证据闭集补齐为具体套件交接书，不能以本高层草稿直接冻结。
G0目标/会话 → G1包/锁完整性 → G2正式smoke → G3回传与报告核验 → G4秘密/后飞行 → 独立审核 → 门B。
门B只在本合同必需项满足且限制明确时由负责人裁决，任何缺项保持FAIL/NOT_PERFORMED。
Git提交/本地整合/推送/发布各自审批，不因为实机PASS自动执行。

## 5. 基于 A9-32 本地差异的具体化准备（2026-10-11）

仍为 DRAFT_READY_FOR_REVIEW。Source Baseline 保持 NOT_BOUND。
本轮产品输入是 `571ec550…` 加[报告](../reports/2026-10/a9_32_local_implementation_and_batch2_readiness_2026-10-11.md)所绑定的 12 文件差异。
干净新 source、开发 Profile/新包、真实 Electron 和独立审核尚未形成。
不从准备材料创建候选、authority 或正式执行入口。

| 阶段 / ID | 必须直接执行的具体断言 | 证据闭集 |
|---|---|---|
| G0 / ENV | Win7 SP1 x64、普通桌面、SID/Session/Integrity/Elevation/Job、Electron22/Node16/ABI110、Shell/codepage/补丁、空间与旧进程树 | 环境/身份、路径/哈希、句柄与退出回执；未知停止 |
| G1 / PACKAGE | 两个独立干净产品构建 ZIP 逐字节一致；准确整合 source、batch2 锁、helper/SQLite/manifest/SBOM/许可证一致；正确实际加载 | 两 build/run、ZIP/manifest/输入锁、包完整闭包、模块加载结果 |
| G2 / S01–S03 | 退出前可见 tick、stdout/stderr 稳定序列、SQLite 先落盘再 IPC；终态验证与审计失败零后续派发 | 原始协议、SQLite 事件、IPC/Renderer 观察、审计负例 |
| G2 / S04–S05 | UTF-8/CP936/UTF-16LE 跨块、CRLF/无换行；限额、跨块秘密、背压、取消、实际 Job 回收 | 原始字节/文本、截断计数、秘密负例、同实例进程树/清理结果 |
| G2 / S06 / BG | 刷新/分页/返回/重启；3 个后台可用/第4拒绝；owner/handle/cursor错属与边界；双 Stop、ready失败、release及正常退出 | 句柄归属、游标/输出事件、退出对话框/回执与退出后证据 |
| G2 / CONT-01 | 重启/刷新零 Provider/工具请求；单击/双击只一个新 Turn；旧 Turn 终态不改 | 请求计数、SQLite tasks/turns/events、Schema IPC、卡片/时间线 |
| G2 / CONT-02 | 事务前/后、Provider与工具前/后中断；旧 key 返回旧身份；新 revision 主动重试；事件保留仍去重 | 分点崩溃记录、事务/事件/Turn 身份、重启零重放 |
| G2 / CONT-03 | 旧审批不能执行；未知 write/edit/delete/Shell 先读当前事实；健康 owned 后台共存；残留/错属/revision漂移/诊断模式零派发 | 新目标审批、工具审计顺序、拒绝/后台事实、零请求证明 |
| G2 / SAFE | 当前 AGENTS/模式/Provider/环境与预算；不可压缩超限零请求；必需审计失败硬停止；未知副作用不填零 | Provider原始请求、当前规则SHA、预算诊断、SQLite失败与进程状态 |
| G2 / UI | 加载/重试、继续反馈、Enter/Space、焦点留卡、不抢滚动、视图返回、Stop、失败新卡及正常退出 | 1366×768/100%与125%、四种可达布局、较矮窗口，操作绑定截图/状态 |
| G3–G4 | 普通用户实际报告核验、错 pin/漏证据/改报告负例、秘密扫描正控、完整后飞行、独立审核 | 原始返回文件闭包、报告、scanner、签名/哈希、全部登记树与实际退出 |

预演调用路径仍采用拟批准 `RUN_A9_BATCH2_INTEGRITY.cmd` → `RUN_A9_BATCH2_SMOKE.cmd` → `RUN_A9_BATCH2_REPORT_VERIFY.cmd`。
这些文件尚未实现；命令状态为 NOT_IMPLEMENTED / NOT_PERFORMED，不能直接上机执行。
每个入口只能使用包内 electron.exe 的已声明 Node 模式，不假设系统 Node。
参数闭集是批准包根/ZIP、外部锁/authority/pin、目标身份、phase、run-id、候选外证据根。
具体 argv 和命令哈希须由 §3 实现后本地/实际运行时验证，再写交接书。
G0–G4、两次连续预演、双干净构建、冻结、门 A、正式执行、独立审核、门 B 顺序不变。

最短开发链路先覆盖启动→后台输出→Stop→中断/重启零请求→主动继续→正常退出。
拟一个普通桌面窗口，最多 2 小时/16 请求；同类失败两轮先共同根因诊断。
身份、完整性、必需审计或未知生命周期立即停止全部依赖动作。
具体目标/账户/目录、driver/version、调用数和 actual exit 仍为 UNKNOWN，须执行前准确批准。
A9-34 延期、G3 恢复 cleanup-required 无产品内处置、G4 native退出取消未测均明列限制。
不恢复 ENGINEERING_02 p17/w16，不追加工具平台、预算或远端派发。

## 6. A9-33 批准请求包（2026-10-12）

本节为开发机文档提案，绑定整合基线 `d8fd760a1c283b638996bde50c90fc7d2d139ccb`。
Status 仍为 DRAFT_READY_FOR_REVIEW；Phase-Gate 仍为 A9_33_CONTRACT_PENDING_APPROVAL。
头部 Source Baseline 的 NOT_BOUND 及 §5 保留历史时点。本节准确 SHA 是拟批准的产品整合输入，不是正式候选或已批准实现源。
父提交为 `571ec550b5e09611f55557563d0cf2f1a4a40d1b`。managed 锁为 `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e`。
正式实施前还须满足 §1 的开发合同、独立审核和完整干净基线门。
生产者实施后产生新的源码提交，执行前重新绑定完整 SHA；不得冒用 d8fd760a… 作为新实现身份。
F5 已确认，ADR-0189 补充已选 A，见 §6.5。

### 6.1 拟批准精确允许路径

路径和最小责任见 [D1 §3](../reports/2026-10/a9_33_producer_gap_analysis_2026-10-12.md#3-d1b逐文件最小变更提案)。
以下共 20 个精确路径。此提案补原 §3 的 A9-32 开发锁；原 managed 锁不改。
- `scripts/release/build-a9-product-v3.mjs`。
- `src/shell/product/a9-package-runtime.js`。
- `src/shell/tests/product/a9-batch2-driver-entry.cjs`。
- `scripts/release/test/a9-batch2-package.test.mjs`。
- `scripts/release/test/a9-package.test.mjs`。
- `src/shell/tests/product/a9-batch2-contract.test.ts`。
- `src/shell/tests/product/a9-package-runtime.test.ts`。
- `release/win7-product-v3/a9-32-input-lock.json`。
- `release/win7-product-v3/a9-batch2-input-lock.json`。
- `release/win7-product-v3/a9-batch2-package-integrity.cjs`。
- `release/win7-product-v3/a9-batch2-report.cjs`。
- `release/win7-product-v3/a9-batch2-smoke.cjs`。
- `release/win7-product-v3/a9-batch2-fixtures.cjs`。
- `release/win7-product-v3/A9_BATCH2_WIN7_VALIDATION.md`。
- `release/win7-product-v3/README.md`。
- `release/win7-product-v3/RUN_A9_BATCH2_INTEGRITY.cmd`。
- `release/win7-product-v3/RUN_A9_BATCH2_SMOKE.cmd`。
- `release/win7-product-v3/RUN_A9_BATCH2_REPORT_VERIFY.cmd`。
- `release/win7-product-v3/a9-batch2-desktop-controller.ps1`。
- `release/win7-product-v3/a9-batch2-desktop-request.cjs`。

拟批准分支仍为 `codex/a9-33-batch2-win7-acceptance`。本轮在 A9-32 树只编辑文档。
不批准后台/继续产品语义修复，不批准旧取证组件变更。缺口超出上述路径时先记录并停止相关实现。
CMD 入口沿原 §3 的 ASCII/CRLF；其他新文本 UTF-8 无 BOM、LF。
提交/推送、下载、远端目录/传输/执行、authority、冻结、门 A/B均须准确授权，不能由路径批准推导。

### 6.2 最短真实链路的阶段断言提案

下表均为计划断言，没有已执行结果。证据文件名是拟用闭集；证据根必须由负责人绑定在候选外。
先完成当前包/目标/普通身份/旧树生命周期准入，再进入链路。main/preload/IPC/State/native 必须来自当前包。

| 步骤 | 输入 | 预期可观察结果 | 拟证据文件 | 失败即停条件 |
|---|---|---|---|---|
| 1 启动 | 准确新 ZIP/manifest/锁、工作区/dataRoot、模式、批准 driver/run-id；一次普通桌面入口 | 当前产品首绘；实际 source/native/SQLite/ABI 一致；SID/Session/Integrity/Elevation/Job 满足合同 | `01-start-identity.json`、`01-package-load.json`、`01-start.png`、`product.log` | 身份或包完整性不明、加载失败、旧树退出未知、错误模式或审计失败；停止所有依赖动作 |
| 2 后台输出 | 经实际产品入口启动一个批准的有界后台夹具，记录 owner/handle | 进程结束前可见 tick/stdout/stderr；SQLite 先落盘；卡片/输出与同一 handle 绑定 | `02-background.json`、`02-output-frames.jsonl`、`state.sqlite`、`02-output.png` | 未 ready、错属/错序/缺审计、秘密出口或输出超限；保存首失败并停止链路 |
| 3 Stop | 点击该后台句柄 Stop，不传任意 PID | 卡片即时反馈；同一 Job/进程树实际退出；输出/审计终态一致，无未知残留 | `03-stop.json`、`03-held-exit.json`、`03-process-tree.json`、`03-stop.png` | cancel/终态/持有句柄退出不明，cleanup_required，审计缺失；不以 PID 消失代签退出 |
| 4 中断/重启零请求 | 在批准可恢复点中断当前任务；保留旧 Turn；重启/刷新，采集计数基线与增量 | 恢复事实卡出现；旧 Turn 终态不改；重启/刷新新增 Provider/工具请求为零 | `04-interruption.json`、`04-restart-counters.json`、`04-task-turn-events.json`、`04-card.png` | 自动派发、旧命令/审批重放、事实错属、计数缺失或未知生命周期；硬停止 |
| 5 主动继续 | 对当前 recoveryRevision 点击继续；再提交同一 key 的重复动作；原高影响动作重新审批 | 一个新 Turn 关联原任务；重复 key 仅返回同一身份；未知副作用先核查；旧批准不可执行；新 Turn 接 Stop | `05-continue-ipc.json`、`05-provider-requests.jsonl`、`05-tool-audit.jsonl`、`05-turn-dedup.json`、`05-focus-scroll.png` | 错 revision/错属放行、重复请求、旧批准复用、预算/必需审计失败或未经观察的副作用；保存并停止 |
| 6 正常退出 | 从真实产品退出入口完成已批准的可见退出选择；核对全部登记树 | 记录真实对话框选择与实际返回；产品/driver/helper/Shell 树的同实例退出码和时间可核验；证据完整回收 | `06-dialog-response.json`、`06-held-exit.json`、`06-postflight.json`、`evidence-manifest.json` | 任一身份/退出/后飞行/秘密扫描未知或失败；不以顶层退出 0 签产品 PASS |

最短链路不替代 §5 的 S01–S06/BG/CONT/SAFE/UI、正式报告负例、预演或双构建。
旧 key 的重复提交、焦点/滚动及新高影响确认须按实际入口取证；不能用 Mock 代替正式退出。

### 6.3 资源上限与批准前绑定清单

沿用 §5，拟一个普通桌面窗口、最多 2 小时/16 请求。这是资源上限提案，不是已获预算。
所有准备、重复提交与失败调用均计入实际批准调用数；实现后提供精确 phase→argv→计数表，不超过上限。

| 批准前必须由负责人绑定 | 当前值 | 必需内容 |
|---|---|---|
| Win10 目标机器与管理账户 | UNKNOWN | 主机/地址/OS；管理仅传输/校验/调度，不代签普通桌面 |
| Win7 目标机器与普通账户 | UNKNOWN | Win7 SP1 x64、机器、账户/SID、会话/权限/Job 合同 |
| Win10 普通桌面账户 | UNKNOWN | 账户/SID、实际 Session、Integrity、Elevation、InJob |
| 部署/工作区/dataRoot/证据目录 | UNKNOWN | 每个绝对根、权限、容量、候选外证据及旧树生命周期 |
| driver 版本与 SHA-256 | UNKNOWN | 新源、新包实际 driver 字节及准确命令哈希 |
| 取证/调度组件版本与 SHA-256 | UNKNOWN | 独立工具 source/artifact/构建记录、适用运行时与闭包 |
| 精确调用数与运行 ID | UNKNOWN | phase/命令闭集、run-id、重复/失败计数、时间边界 |
| 实际退出证据绑定方案 | UNKNOWN | 句柄/creation ticks、父链、退出码/时间、对话框实际返回、失败收尾 |

实际退出结果只能执行后取得。批准前由负责人绑定其采集对象与判据，不预填成功。
当前目标背景见 [D5 第6项](../reports/2026-10/a9_32_owner_decisions_2026-10-12.md#6-win10win7-目标账户与目录绑定)。
旧地址、账户或根不自动成为 A9-33 授权。ENGINEERING_02 p17/w16 不恢复，旧预算及已消费授权不借用。

### 6.4 停止、诊断与核号

身份、完整性、权限、安全、必需审计或未知生命周期失败，立即停止所有依赖派发与下游 Gate。
首失败与原始字节先保存；结果写候选外。旧 FAIL/UNKNOWN 与 HALTED 保留。
同类失败连续两轮仍未解释或闭环时，暂停整批重试，先最小复现与共同根因诊断。
此规则来自负责人本轮提供的 AGENTS.md §6；不延长等待、减少断言或弱化判据。
其他独立且已授权文档工作可继续。到达时限/请求上限停止接单，不自动续预算。
发现阻断级源码问题，只记录并上报；产品修复回到相应任务，不能扩大本提案路径。
WIN7-43 仅暂定第二批候选号。冻结前完整核对 refs、候选注册、目录、历史失败与编号占用。
核号后锁/manifest/报告/authority/pin 必须一致；此处没有冻结或执行结果。

### 6.5 负责人裁决登记（2026-10-12）

负责人在聊天中原话：“第3到6项按推荐选A”。对应 [D5](../reports/2026-10/a9_32_owner_decisions_2026-10-12.md) 第 3～6 项；第 2 项（指定独立审核者）未裁决。
本节只登记裁决，不改 Status（DRAFT_READY_FOR_REVIEW）和 Phase-Gate（A9_33_CONTRACT_PENDING_APPROVAL）。

| D5 项 | 选择 | 对本任务的效果 |
|---|---|---|
| 3 ADR-0189 | A | ADR-0189 原文保持；批准未来新增补充 ADR；编号整合前另行核对裁决 |
| 4 §6.1 路径 | A，条件批准 | 20 个路径与本地实施提案在 §1 前置满足后生效；前置当前未满足 |
| 5 Electron | A | 本地不下载；Electron 取证在获准的新 Windows 包阶段进行 |
| 6 目标绑定 | A，值未提供 | 采用本节清单和 §6.2 步骤 6 的退出取证对象；机器、账户、目录等值待负责人提供 |

§6.1 路径生效前须满足 §1：独立复核者已指定并完成复核，完整干净基线 SHA 已形成。
生效时执行代理登记前置证据，再把任务状态改为 APPROVED_FOR_IMPLEMENTATION（AGENTS.md C14）。
生效前不得创建 `codex/a9-33-batch2-win7-acceptance` 实现，不得写入 §6.1 路径。
提交/推送、下载、远端目录/传输/执行、authority、冻结、门 A/B 仍须各自准确授权。

§6.3 八项绑定的当前状态：

| 绑定项 | 当前值 | 说明 |
|---|---|---|
| Win10 目标机器与管理账户 | 候选，待负责人确认 | 文档记载 `Administrator@192.168.1.4:22`、主机 `WIN-2JQ66JE4HTQ`；ENGINEERING_02 §105 指定为可信，技术完整性 UNKNOWN；旧值不自动成为 A9-33 授权 |
| Win7 目标机器与普通账户 | UNKNOWN | 本任务文档未记载；机器、账户/SID、会话/权限/Job 合同待负责人提供 |
| Win10 普通桌面账户 | UNKNOWN | 账户/SID、Session、Integrity、Elevation、InJob 待负责人提供 |
| 部署/工作区/dataRoot/证据目录 | UNKNOWN | 每个绝对根、权限、容量待负责人提供；证据根在候选外 |
| driver 版本与 SHA-256 | UNKNOWN | 新源与新包形成后才能计算，不填占位值 |
| 取证/调度组件版本与 SHA-256 | UNKNOWN | 待独立工具 source/artifact/构建记录 |
| 精确调用数与运行 ID | UNKNOWN | 实现后提供 phase→argv→计数表，不超过 2 小时/16 请求上限提案 |
| 实际退出证据绑定方案 | 方案已定，结果 NOT_PERFORMED | 采集对象按 §6.2 步骤 6：句柄与 creation ticks、父链、退出码与时间、对话框实际返回、失败收尾 |

Win10、Win7、普通桌面入口与正式执行均 NOT_PERFORMED。ENGINEERING_02 p17/w16 不恢复，旧预算及已消费授权不借用。

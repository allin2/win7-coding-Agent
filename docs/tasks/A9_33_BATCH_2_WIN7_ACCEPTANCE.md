# A9-33 — 第二批整批换发与 Win7 验收合同草稿

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: RELEASE_REISSUE_AND_WIN7_ACCEPTANCE
Target Branch: codex/a9-33-batch2-win7-acceptance
Source Baseline: 152106f3efd41e5cb8aa6688a4fddc0df99db42a (codex/a9-32-explicit-continue; see §6.7)
Target Version: 0.3.0-alpha.2
Candidate: WIN7-43 (tentative; NOT_FROZEN)
Phase-Gate: A9_33_IMPLEMENTATION_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0155 (Proposed; not accepted by §6.7)
```

## 1. 授权与前置

2026-10-02负责人选择第二批三项整批验收并要求执行推进计划。本合同草稿不授予套件实现、
新候选冻结、构建机/目标机写入、计划任务或门A/B权限。审批顺序见 [审批包](../plans/A9_BATCH_2_IMPLEMENTATION_APPROVAL.md)。
只有A9-30/31/32开发机合同、必要原生双构建/锁及独立复核通过，并形成完整干净基线SHA后，才提交具体实现批准。
（2026-10-12 负责人裁决修订上一句中对 A9-32 的前置表述，见 §6.6；本句保留历史原文。）
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

负责人在聊天中原话：“第3到6项按推荐选A”。对应 [D5](../reports/2026-10/a9_32_owner_decisions_2026-10-12.md) 第 3～6 项；第 2 项（指定独立审核者）当时未裁决，同日已裁决，见下文补记。
本节只登记裁决，不改 Status（DRAFT_READY_FOR_REVIEW）和 Phase-Gate（A9_33_CONTRACT_PENDING_APPROVAL）。

| D5 项 | 选择 | 对本任务的效果 |
|---|---|---|
| 3 ADR-0189 | A | ADR-0189 原文保持；批准未来新增补充 ADR；编号整合前另行核对裁决 |
| 4 §6.1 路径 | A，条件批准 | 20 个路径与本地实施提案在 §1 前置满足后生效；前置当前未满足 |
| 5 Electron | A | 本地不下载；Electron 取证在获准的新 Windows 包阶段进行 |
| 6 目标绑定 | A，Win7 已指定 | 采用本节清单和 §6.2 步骤 6 的退出取证对象；Win10 确认、普通桌面账户、目录等值待负责人提供 |

§6.1 路径生效前须满足 §1：独立复核者已指定并完成复核，完整干净基线 SHA 已形成。
生效时执行代理登记前置证据，再把任务状态改为 APPROVED_FOR_IMPLEMENTATION（AGENTS.md C14）。
生效前不得创建 `codex/a9-33-batch2-win7-acceptance` 实现，不得写入 §6.1 路径。
提交/推送、下载、远端目录/传输/执行、authority、冻结、门 A/B 仍须各自准确授权。

补记（2026-10-12）：负责人对 D5 第 2 项回复“选A”，追认负责人另开的 Claude Sonnet 5.5 会话为 A9-32 的独立审核者，见 [A9-32 §7.8](A9_32_EXPLICIT_TASK_CONTINUE.md#78-独立审核者追认2026-10-12)。
对上一段 §1 前置的效果如下，Status 与 Phase-Gate 不变。

| §1 前置 | 当前状态 |
|---|---|
| A9-32 的独立复核 | 已满足（开发机，绑定 `adb9d0f0…`）；`DEVELOPER_VERIFIED` 尚未签发 |
| A9-30、A9-31 的独立复核 | 按各自任务书保持，本次未重核 |
| 完整干净基线 SHA | 未形成，§6.1 路径仍未生效 |
| A9-33 的技术独立复核者 | 未指定；本追认不覆盖 |

§6.3 八项绑定的当前状态：

| 绑定项 | 当前值 | 说明 |
|---|---|---|
| Win10 目标机器与管理账户 | 候选，待负责人确认 | 文档记载 `Administrator@192.168.1.4:22`、主机 `WIN-2JQ66JE4HTQ`；ENGINEERING_02 §105 指定为可信，技术完整性 UNKNOWN；旧值不自动成为 A9-33 授权 |
| Win7 目标机器与普通账户 | 已指定，实际身份待执行前核验 | 负责人 2026-10-12 聊天回复“用候选”：管理账户 `dccs-chaizl`，地址 `192.168.1.3`，主机 `DCCS-CHAIZL-PC`；普通账户 `dccs-chaizl-pc\\agent`，Medium、非提升（连接参数见主工作区 `docs/REMOTE_WINDOWS_CONNECTIONS.md` §3，本分支不含该文件）。SID、Session、Job 与地址有效性执行前直接核验，当前 NOT_PERFORMED；HostKeyAlias 沿用既有锁定记录，不写入本文 |
| Win10 普通桌面账户 | UNKNOWN | 账户/SID、Session、Integrity、Elevation、InJob 待负责人提供 |
| 部署/工作区/dataRoot/证据目录 | UNKNOWN | 每个绝对根、权限、容量待负责人提供；证据根在候选外 |
| driver 版本与 SHA-256 | UNKNOWN | 新源与新包形成后才能计算，不填占位值 |
| 取证/调度组件版本与 SHA-256 | UNKNOWN | 待独立工具 source/artifact/构建记录 |
| 精确调用数与运行 ID | UNKNOWN | 实现后提供 phase→argv→计数表，不超过 2 小时/16 请求上限提案 |
| 实际退出证据绑定方案 | 方案已定，结果 NOT_PERFORMED | 采集对象按 §6.2 步骤 6：句柄与 creation ticks、父链、退出码与时间、对话框实际返回、失败收尾 |

Win10、Win7、普通桌面入口与正式执行均 NOT_PERFORMED。ENGINEERING_02 p17/w16 不恢复，旧预算及已消费授权不借用。

### 6.6 §1 前置修订裁决（2026-10-12）

矛盾：A9-32 §5 要求真实 Electron 取证；D5 第 5 项把 Electron 取证放在新 Windows 包阶段；该包依赖本节 §6.1 路径；原 §1 又要求三项“开发机合同通过”后 §6.1 才生效。
负责人在聊天中回复“选C”，对应 [A9-32 §7.9](A9_32_EXPLICIT_TASK_CONTINUE.md#79-developer_verified-签发条件裁决2026-10-12)。本节取代 §1 第 3 句对 A9-32 的前置表述，不改 Status（DRAFT_READY_FOR_REVIEW）和 Phase-Gate（A9_33_CONTRACT_PENDING_APPROVAL）。

| 前置项 | 修订后要求 | 当前状态 |
|---|---|---|
| A9-30、A9-31 | 保持各自任务书的 `DEVELOPER_VERIFIED` | 保持，本次未重核 |
| A9-32 | 开发机检查与独立复核通过；不再要求已签 `DEVELOPER_VERIFIED` | 已满足：开发机 State 88、Core 221、Shell 134 通过，独立复审 PASS，绑定 `adb9d0f0…`（A9-32 §7.7、§7.8） |
| 原生双构建与锁 | 按 A9-30、A9-31 任务书保持；A9-32 不新增原生能力 | 保持，本次未重核 |
| 完整干净基线 SHA | 须形成 | **未形成**（A9-30/31/32 尚未整合；整合须提交授权，并先核对 ADR 编号）。2026-10-12 更新：已形成，见 §6.7 |
| §6.1 的 20 个路径 | 上述四项全部满足后生效 | **仍未生效**。2026-10-12 更新：已生效，见 §6.7 |

- A9-32 的 §5 真实 Electron 要求不降低。取证改在 §6.1 新增的 A9-32 开发 Profile 所构建的包上，取证结果由负责人另行裁决是否签 A9-32 `DEVELOPER_VERIFIED`。
- A9-32 `DEVELOPER_VERIFIED` 与 WIN7-43 冻结的先后，本裁决未规定，冻结前由负责人另行确定。
- A9-33 的技术独立复核者属于 §2 末项，在正式执行与审核阶段前指定，本裁决不改变；§6.5 补记表中该行含义相同。
- 本修订不改接口、数据格式、兼容性或安全模型，不新增 ADR。

### 6.7 基线登记与 §6.1 生效（2026-10-12）

负责人对“完整干净基线 SHA 怎么定”回复“选A”。执行代理把 9 个未提交文档文件提交到 `codex/a9-32-explicit-continue`（未推送），再登记本节。
按 §6.5 的规则，前置满足后由执行代理登记前置证据，并把任务状态改为 `APPROVED_FOR_IMPLEMENTATION`（AGENTS.md C14）。

| 前置项 | 证据（开发机） |
|---|---|
| 基线提交 | `152106f3efd41e5cb8aa6688a4fddc0df99db42a`，分支 `codex/a9-32-explicit-continue`，父 `4667bb02…`，未推送 |
| 工作树 | 提交后 `git status --porcelain` 输出 0 行 |
| 产品源码 | `adb9d0f0…` 到基线提交的变更全部在 `docs/` 内；`src`、`scripts`、`release` 的差异为空，产品源码与独立复审对象字节相同 |
| A9-32 开发机检查与独立复核 | State 88 / Core 221 / Shell 134 通过，独立复审 PASS，绑定 `adb9d0f0…`（A9-32 §7.7、§7.8；本次未重跑） |
| A9-30、A9-31 与原生双构建、锁 | 沿用各自任务书结论，本次未重核 |

登记后的状态与范围：

- **状态：** Status 改为 `APPROVED_FOR_IMPLEMENTATION`，Phase-Gate 改为 `A9_33_IMPLEMENTATION_AUTHORIZED`，Source Baseline 为上表基线提交。该基线取代 §6 绑定的 `d8fd760a…`；§6 中“不得冒用 d8fd760a… 作为新实现身份”仍有效。
- **授权范围：** §6.1 的 20 个路径与本地实施提案，仅限分支 `codex/a9-33-batch2-win7-acceptance`。该分支尚未创建；创建时须从含本登记的提交或其后代建立，并用 `git diff --name-only 152106f3..HEAD` 复核差异只在 `docs/`。
- **不授权：** 产品语义修复、旧取证组件变更、推送与合并、下载、远端目录/传输/执行、authority、冻结、门 A/B。这些仍须各自准确授权。
- **ADR-0155 仍为 `Proposed`，本节不接受它。** 它所依赖的增量矩阵尚未批准任何 `INHERITED_EVIDENCE`；批准前不得把继承证据计入通过。
- **未解除的事项：** A9-32 `DEVELOPER_VERIFIED` 待真实 Electron 取证；A9-33 技术独立复核者未指定；Win10 目标等 7 项绑定为 `UNKNOWN`；ADR 编号隔离树到 0237、主工作区到 0235，主线整合前须核号。

A9-33 的产品、套件实现、构建、Win10 与 Win7 均 NOT_PERFORMED。

### 6.8 本地实现进展（2026-10-12）

结论：§6.1 的 20 个路径已在本地实现，开发机的 §4 五项检查通过。全部改动未提交；真实 Electron、PowerShell、Win10、Win7 均 NOT_PERFORMED。
绑定：分支 `codex/a9-33-batch2-win7-acceptance`，HEAD `7e96f561…`（A9-32 尖端，含 §6.7 登记）。证据层级为开发机。

| §4 检查 | 结果（开发机） |
|---|---|
| `node --test` 两个包测试文件 | 119 通过、0 失败；本批新增 10 个用例（`a9-batch2-package.test.mjs` 7 个，`a9-package.test.mjs` 3 个） |
| shell jest 两个文件 | 73 通过；新增 30 个用例，原有 43 个 |
| `npm run verify:quick` | 通过 |
| `npm run docs:check` | `ok`，324 个文件 |
| `git diff --check` | 0 行输出；该命令不检查未跟踪文件，新文件另行核对无行尾空白、无 CR、无 BOM |

实现范围（均在 §6.1 路径内）：

| 部分 | 内容 |
|---|---|
| 生产者与运行时描述 | `build-a9-product-v3.mjs` 新增 batch2 与 A9-32 两个 Profile；`a9-package-runtime.js` 区分 A9-30/31、A9-32 开发锁与 batch2 正式锁；两个锁文件新建 |
| 套件 | 合同（10 阶段、27 用例、45 断言、53 个证据文件）、请求与追加账本、完整性、冒烟、产品驱动、报告复核、桌面控制器、3 个 `.cmd` 入口、验证说明、README 小节 |
| 测试 | 新增 `a9-batch2-package.test.mjs`、`a9-batch2-contract.test.ts`；`a9-package.test.mjs` 与 `a9-package-runtime.test.ts` 各增回归与拒绝用例 |

未覆盖与限制（均为 `NOT_PERFORMED` 或 `UNKNOWN`，不计入通过）：

- 驱动、冒烟、控制器只在开发机用纯函数、假进程和回环 Provider 测过，未在 Electron、PowerShell 或 Windows 上运行。驱动读取的产品 DOM 与 IPC 依据源码阅读，须经预演修正。
- 5 条断言按设计为 `NOT_PERFORMED`：B2-CONT-02 两条、B2-CONT-03 第 2 条、B2-SAFE-01、B2-UI-01。原因是产品没有故障注入接缝、上下文预算设置入口，或该旅程未被驱动。因此阶段 p06、p07、p08 在负责人裁决前不能 PASS（裁决选项：补接缝、缩小合同、保留为已知限制）。
- B2-S04 编码断言只在所选 Shell 为 PowerShell 时可观察，否则记 `UNKNOWN`。B2-CH-03 在未观察到命令进程时记 `UNKNOWN`，不记 PASS。
- 新套件的数据格式（请求、账本、阶段结果）尚无 ADR。ADR 编号隔离树到 0237、主工作区到 0235，写入前须先核号。
- `.gitattributes` 只有 `*.bat` 的换行规则，`.cmd` 没有。生产者在装配时拒绝 LF 的 `.cmd`，所以错误的检出会让装配失败，不会静默改坏入口。该文件不在 §6.1 路径内，未改。
- 被跟踪的 `src/runner/dist`（64 个文件）落后于 `src/runner/src`：`verify:quick` 重建后其中 24 个文件变化，工作树随之变脏，冻结前的干净源检查会拒绝。本次已用 `git restore` 还原这些构建产物；runner 源码未改。

本节不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不冻结候选，不签关口 A 或 B；Win10、Win7 与完整 Alpha 2 均 NOT_PERFORMED。未在 Win7 实机验证。

### 6.9 负责人裁决登记与合同收窄（2026-10-12）

结论：负责人同意放宽两条文档限制，并指定 codex 为 A9-33 技术独立复核者。合同收窄为 25 用例、42 断言、51 个证据文件；驱动已实现 B2-UI-01 与 B2-CONT-03 第 2 条。
证据层级为开发机。绑定分支 `codex/a9-33-batch2-win7-acceptance`，实现提交 `905bf760…`（父 `7e96f561…`，仅 §6.1 的 20 个路径，本地，未推送）。
负责人对“改动怎样落到分支”选 A，授权按此提交；本节与 STATUS、STATUS_LOG 的记录在随后的文档提交中。下表检查的对象与该提交的 20 个路径字节相同。

执行代理在聊天中评估了 9 条文档限制，建议放宽第 2、3 条，保留其余 7 条，并请负责人指定技术独立复核者。负责人回复“同意，独立复核者是codex”。

| 问题 | 裁决 | 影响 |
|---|---|---|
| 第 2 条：45 条断言须全部 PASS（§6.2） | 同意缩小合同（选项 A）：B2-CONT-02 两条与 B2-SAFE-01 一条移为已知限制；B2-UI-01 与 B2-CONT-03 第 2 条由驱动实现 | 合同由 27 用例、45 断言、53 个证据文件变为 25 用例、42 断言、51 个证据文件。本节取代 §6.2 中 CONT-02、SAFE-01 两行，以及 §6.8 中“5 条断言按设计为 NOT_PERFORMED”一项 |
| 第 3 条：A9-32 §5 真实 Electron 取证位置（§6.6） | 同意用首次 Win7 预演取证，不再要求单独的 Win10 开发包轮次 | 预演仍标 `REHEARSAL_NOT_ELIGIBLE`；不自动签 A9-32 `DEVELOPER_VERIFIED`，由负责人另行裁决；预演结果能否覆盖 §5 全部项为 `UNKNOWN`，须逐项对照。登记见 [A9-32 §7.10](A9_32_EXPLICIT_TASK_CONTINUE.md#710-5-真实-electron-取证位置放宽2026-10-12) |
| A9-33 技术独立复核者（§2 末项） | codex | 复核者不由实现方担任；复核对象与时点由后续请求绑定，本节不预设 |
| 其余 7 条限制 | 保留 | 白名单与 C14、两次连续 Win7 预演、双独立干净构建、每个远端动作的准确授权、批准材料合并、第二批 PASS 不等于完整 Alpha 2、复核者职责分离、ADR-0155 保持 Proposed |

本裁决只追加记录，不改既有条文，不改接口、数据格式或安全模型，不新增 ADR。

收窄后的合同：

| 阶段 | 用例与断言数 |
|---|---|
| p06-continue | B2-CONT-01（2 条）、B2-CONT-03（2 条） |
| p07-safe | B2-SAFE-02（1 条） |
| p08-ui | B2-UI-01（1 条，含 9 个子项）、B2-UI-02 |

已知限制新增两项：B2-CONT-02 的崩溃点无法从产品外部命中；B2-SAFE-01 的不可压缩超预算请求无法构造，因为 Renderer 不暴露上下文预算设置。两项只由 A9-32 的开发机测试覆盖。

驱动实现（均在 §6.1 路径内）：

| 部分 | 内容 |
|---|---|
| B2-CONT-03 第 2 条 | 5 个子观察：错误归属、修订漂移、残留、健康后台进程共存、模式诊断。前三项和共存由新模式 `continue_guards` 完成，模式诊断由 `continue_mode_guard` 完成，最后由 `continue_unknown` 汇总记录 |
| B2-UI-01 | 九个子项：卡片就绪、加载反馈、忙时焦点留在卡片、不抢滚动、忙时只派发一次、Stop 后回到可操作的新卡片、Stop 后焦点、视图返回、空格键重试再建一个新轮次。缺任何一项观察即为 `UNKNOWN` |
| 注入方式 | 错误归属、修订漂移、残留和共存用候选自带的 SQLite 写入一条中断任务，残留再写一条 `cleanup_required` 的托管进程事实并随后删除；模式诊断在工作区打开前把模式设置文件改为截断 JSON，用后还原。这些不是真实崩溃，真实崩溃由 p03 和 p06 的杀进程旅程覆盖 |

实现时发现并修正三处套件自身缺陷（均非产品缺陷）：

- `waitIdle` 以 `canStop === false` 判断空闲，但托管后台进程在运行时 `canStop` 恒为真，S06/BG 的等待在预演中会超时。现改为 `stopKind !== 'turn'`。
- 滚动探针读 `#a9-task-stream`，真实滚动容器是 `#conversation`，原探针恒为 0，“不抢滚动”会假通过。现读 `#conversation`，且滚动区不可滚动时记 `UNKNOWN`。
- `continue_unknown` 以中断时刻的请求计数取“继续后第一条 Provider 请求”，插入新模式后会取错。现以点击时刻的计数为基线。

开发机验证：

| 检查 | 结果（开发机） |
|---|---|
| `node --test` 两个包测试文件 | 119 通过、0 失败（386 秒）；代码定稿后整体重跑 |
| shell jest 两个文件 | 78 通过（原有 43，本批 35） |
| `npm run verify:quick` | 通过（退出码 0）；运行后已用 `git restore` 还原 `src/runner/dist` |
| `npm run docs:check` | ok，324 个文件 |
| `git diff --check` | 0 行输出；该命令不检查未跟踪文件，新文件另行核对无行尾空白、无 CR、无 BOM |
| 新增运行时核对 | `a9-batch2-contract.test.ts` 用驱动自己的写入函数对真实 `createA9AgentRuntime`（Node）核对：错误会话号得 `A9_CONTINUE_IDENTITY_MISMATCH`，过期修订得 `A9_CONTINUE_REVISION_MISMATCH`，残留得卡片 `canContinue=false` 与 `A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED`，删除残留后恢复，模式文件不可读得 `A9_MODE_SELECTION_REQUIRED`；全程 Provider 请求为 0 |

未覆盖与待裁决（均为 `NOT_PERFORMED` 或 `UNKNOWN`）：

- 驱动、冒烟、控制器仍未在 Electron、PowerShell、Windows 上运行。B2-UI-01 的按键、焦点、滚动只经纯函数评估器测过，真实行为须由预演观察；DOM 与 IPC 读取依据源码阅读。
- “健康后台进程共存”的运行时侧由 A9-32 生命周期测试覆盖（POSIX 夹具）；驱动侧只在预演中观察。
- 合同原文的“诊断模式”本节读作 `modeDiagnostics`（模式设置不可读时 fail-closed，错误码 `A9_MODE_SELECTION_REQUIRED`）。SQLite 不可用时的诊断运行时（`A9_DIAGNOSTICS_MODE`）未覆盖。若负责人要求覆盖后者，须另补用例。
- 新套件数据格式（请求、账本、阶段结果）仍无 ADR；写入前须先核号（隔离树到 0237，主工作区到 0235）。

本节不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不冻结候选，不签关口 A 或 B，不推送或合并。Win10、Win7 与完整 Alpha 2 均 NOT_PERFORMED。未在 Win7 实机验证。

### 6.10 codex 第一阶段复核与修复轮（2026-10-13）

结论：codex 对实现提交 `905bf760…` 的第一阶段复核结论是“不建议进入预演授权评审”：0 个 P0、8 组 P1、3 组 P2，路径白名单无越界。负责人选 A，授权开修复轮并确认 P1-6 收窄。
执行代理已在 §6.1 的 20 个路径内修复全部 11 组发现，并为每组补回归用例。修复未提交；复核者尚未重审。
证据层级为开发机。复核绑定 `905bf760…`；修复绑定未提交工作树，基线为文档提交 `d027af7d…`。真实 Electron、PowerShell、Win10、Win7 均 `NOT_PERFORMED`，未在 Win7 实机验证。

复核过程：codex 在负责人另开的无头会话中运行，会话 `01a1330d…`，只读复核，在自己的目录复算。执行代理逐条对照源码，确认 11 组发现全部属实。
codex 的 jest 有 4 项失败，原因是它的沙箱禁止回环监听（`EPERM`），不是产品缺陷；执行代理在无沙箱环境实测通过。
codex 在复核中读取了自己的 `~/.codex` 记忆与指引目录，这属于独立性披露，不影响结论的可复算性。
证据归档在 `.acceptance/a9-33-review/codex-stage1-20261013/`（被忽略，含 `SHA256SUMS.txt`）。

| 编号 | 发现 | 修复（均在 §6.1 路径内） |
|---|---|---|
| P1-1 | p09 报告阶段的请求没有 `--release-authority` 与 pin 参数，报告脚本无法启动 | `argvForRequest` 对完整性与报告两个阶段都传授权路径和 pin；`externalsNeeded` 规定报告阶段必须带授权文件，缺失或在候选内即拒绝 |
| P1-2 | B2-CH-05 第 2 条期望 `cancelled`，产品把被停止的继续轮次存为 `interrupted` | 驱动以 `retryableStopStatus` 接受 `interrupted` 或 `cancelled`；新用例用真实 `createA9AgentRuntime` 停止继续轮次，核对数据库为 `interrupted`、任务仍可继续且修订已更新 |
| P1-3 | 驱动 `ERROR` 或非零退出时，已记录 PASS 的断言仍可使阶段 PASS | `finalizePhaseResult` 在带失败类时把 PASS 降为 FAIL，首失败写入失败类 |
| P1-4 | 消费请求先校验后追加，并发或重放可重复消费 | `consumeRequest` 先用非递归 `mkdir` 独占该次尝试目录，失败返回 `A9_BATCH2_REQUEST_ALREADY_CLAIMED`；校验失败而未记录时释放空目录；崩溃遗留的占用保持索引关闭。新用例用两个并发进程验证只有一个成功 |
| P1-5 | `complete` 不核对账本，报告器接受没有消费记录的 PASS | `completeRequest` 要求同索引、阶段、运行、摘要的消费记录，只允许完成一次，PASS 需要结果文件为 PASS；报告器新增 `LEDGER_COMPLETION_ORPHAN` 与必需负例 `NEG-ORPHAN-COMPLETION` |
| P1-6 | 退出检查在进程表查询失败时返回空，树为空也能 PASS；“同实例退出码”从外部不可观测 | 见下方收窄；`finishChainEvidence` 要求退出前树已观察、非空、列表成功，否则 `UNKNOWN` |
| P1-7 | `guardRefused` 对缺失计数判相等；DOM 帧先被数据库帧过滤，先显示后落盘无法发现 | 四个计数必须是非负安全整数，否则结果为 `null`（`UNKNOWN`）；`evaluateDomAfterDb` 读存储的落盘时间，检出“先显示后落盘”、DOM 中数据库没有的帧和流区幽灵令牌 |
| P1-8 | 控制器丢弃 `IsProcessInJob` 的返回值，查询失败时按“不在 Job”处理 | 返回值进入 `$jobQueryOk`，失败写 `unknown`，身份 JSON 写 `null`；请求脚本把 `unknown` 读作 `null`，与批准的布尔值不等，请求被拒（`TARGET_MISMATCH:in_job`） |
| P2-1 | M2（UNKNOWN 晋级 PASS）与 M5（build-kit `input_lock_sha256` 改一位）反例存活 | 新用例覆盖 UNKNOWN、NOT_PERFORMED 不得使用例或阶段通过及伪造 PASS；生产者测试新增 build-kit 四个字段的变异，直接断言生产者拒绝。执行代理重放了 M2，变异被杀死；M5 未重放，只有上述直接断言 |
| P2-2 | 请求的 `bindings`、`target`、`external_files` 条目未封闭额外键 | 结构校验新增 `BINDING_UNKNOWN_FIELD`、`TARGET_UNKNOWN_FIELD`、`EXTERNAL_UNKNOWN_FIELD` |
| P2-3 | B2-UI-02 未观察继续卡，且把页面缩放称为 DPI | 驱动在各布局注入继续卡并核对其按钮可用，没有继续卡记 `UNKNOWN`；断言文字改为“页面缩放，不是 Windows DPI 缩放” |

### P1-6 收窄（负责人 2026-10-13 确认）

本小节取代 §6.2 步骤 6 中“产品/driver/helper/Shell 树的同实例退出码和时间可核验”一句。

| 项 | 原文 | 收窄后 |
|---|---|---|
| 退出码与时间 | 全部登记树的同实例退出码和时间 | 只记父进程直接启动的产品进程的退出码、信号与起止时间 |
| 子孙进程 | 同上 | 退出前树中的 driver、helper、Shell 进程，按“进程号加创建时间”核对退出后不存在，并记录观察缺席的时刻；它们的退出码从外部不可读，不声称 |
| 树的前提 | 未规定 | 退出前树必须已观察（无失败查询）、非空，且退出后进程列表成功；否则断言记 `UNKNOWN`，不记 PASS |

理由：Windows 上父进程拿不到非直接子进程的退出码，原文无法从外部满足。本收窄不放宽“无存活进程”的判据，只去掉不可观测的措辞。
覆盖范围：B2-CH-06-NORMAL-EXIT 第 2 条断言的文字与判据；不影响其他用例。

开发机验证（修复轮定稿后整体重跑，证据层级开发机）：

| 检查 | 结果 |
|---|---|
| `node --test` 两个包测试文件 | 119 通过、0 失败（621 秒）；用例数与修复前相同，新增断言在既有用例内 |
| shell jest 两个文件 | 94 通过（修复前 78，本轮新增 16 个用例） |
| `npm run verify:quick` | 通过（退出码 0）；运行后已用 `git restore` 还原 `src/runner/dist` |
| `npm run docs:check` | ok，327 个文件 |
| `git diff --check` | 0 行输出；该命令不检查未跟踪文件，新文件另行核对无行尾空白、无 CR、无 BOM |
| M2 变异重放 | 在原文件上把“UNKNOWN 视作 PASS”写入 `finalizePhaseResult`，新用例失败（期望 `UNKNOWN`，实得 `PASS`）；已还原，哈希一致 |

未覆盖与限制（均为 `NOT_PERFORMED` 或 `UNKNOWN`，不计入通过）：

- 驱动、冒烟、控制器仍未在 Electron、PowerShell、Windows 上运行。P1-8 与进程表查询的 PowerShell 2.0、`wmic` 行为只在源码层核对，运行时行为由预演观察。
- Node 16 与 PowerShell 2.0 的准确兼容性仍为 `UNKNOWN`（codex 静态检查未见禁用 API，但未在目标运行时执行）。
- 修复后未经 codex 重审；新提交的复核须新交接包，且发送给外部服务须负责人批准。

负责人 2026-10-13 对“怎样落到分支”选 A，并同意草案并入文档提交、提交后重跑 codex 第一阶段：

| 项 | 内容 |
|---|---|
| 修复提交 | `8c16ffd9…`（父 `d027af7d…`），本地，未推送；9 个文件，+574、−56，均在 §6.1 路径内 |
| 文档提交 | 随后一个本地文档提交（不推送），含本节、STATUS、STATUS_LOG、三份草案（批准材料、缺口处置表、上一轮交接包）、两处 README 登记和新交接包；该提交只改 `docs/` |
| 新交接包 | [第二轮交接包](../reports/2026-10/a9_33_independent_review_handoff_stage1_rerun_2026-10-13.md)，绑定 `8c16ffd9…`；命令在全新克隆实测一次通过（`node --test` 119 通过、jest 94 通过、`docs:check` 324 个文件） |
| 复核者 | codex，无头会话，只读复核；结果由执行代理登记，结论仍由负责人裁决 |

本节不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不冻结候选，不签关口 A 或 B，不推送或合并。Win10、Win7 与完整 Alpha 2 均 `NOT_PERFORMED`。

### 6.11 codex 第一阶段第二轮复核与第二修复轮（2026-10-13）

结论：codex 对修复提交 `8c16ffd9…` 的第二轮复核结论仍是“不建议进入预演授权评审”：0 个 P0、4 组 P1、2 组 P2；第一轮 11 组中 5 组已关闭、6 组部分关闭。负责人选 A，授权开第二修复轮。
执行代理已在 §6.1 的 20 个路径内修复 R1～R6 全部 6 组，并为每组补回归用例，提交为 `0c163c24…`。复核者尚未重审。
证据层级为开发机。复核绑定 `8c16ffd9…`；修复绑定 `0c163c24…`。真实 Electron、PowerShell、Win10、Win7 均 `NOT_PERFORMED`，未在 Win7 实机验证。

复核过程：codex 在负责人另开的无头会话中运行（fast 服务层级），只读复核，在自己的目录复算。执行代理逐条对照源码，确认 6 组发现全部属实。
codex 的 jest 有 6 项失败，原因都是沙箱禁止回环监听（`listen EPERM 127.0.0.1`），不是产品缺陷；执行代理在无沙箱环境实测通过。
codex 在复核中读取了自己的 `~/.codex` 记忆目录，仅作保护边界线索，这属于独立性披露。
证据归档在 `.acceptance/a9-33-review/codex-stage1-round2-20261013/`（被忽略，含 `SHA256SUMS.txt`）。

| 编号 | 级别 | 发现 | 修复（均在 §6.1 路径内） |
|---|---|---|---|
| R1 | P1 | 退出后进程列表的非零状态或 `error` 不抛异常，部分输出仍使 B2-CH-06-NORMAL-EXIT 第 2 条 PASS | 新增 `listProcesses`：状态非 0、带 `error` 或抛异常均记 `failed`。环境阶段、退出链证据、后飞行阶段都读 `listing_failed`；列表失败或为空时记 `UNKNOWN`，已见的残留仍记 `FAIL` |
| R2 | P1 | 驱动把 `cancelled` 也当作可重试停止，但产品只为 `interrupted` 给出恢复卡 | `retryableStopStatus` 只接受 `interrupted`；新增 `stopLeavesActionableCard`：停止后 `canContinue` 为真，且中断轮次编号与恢复修订都已更换才为真；字段缺失记 `UNKNOWN`。B2-CH-05 第 2 条使用它 |
| R3 | P1 | 占用目录含阶段名，同一索引的不同阶段可被两个进程同时消费，账本索引成为 `[1,2,2]` | `consumeRequest` 占用后检查同索引（`NN-` 前缀）的其他目录，存在即返回 `A9_BATCH2_REQUEST_ALREADY_CLAIMED` 并释放自己的空目录。两个进程可能同时被拒，向关闭方向失败，不会同时成功 |
| R4 | P1 | 流区令牌只抓 `tick` 与 `err`，漏掉 `out`；存储时间与读取结束同毫秒时放行 | `OUTPUT_TOKEN_PATTERN` 含 `out`；同毫秒的落盘时间记 `tied_same_millisecond`，结果为 `UNKNOWN`，不再放行 |
| R5 | P2 | 布局检查不看 `disabled`，禁用的继续卡可通过 | 探针读 `disabled`；`cardUsable` 要求可见、可达且 `disabled === false`；每种布局与较矮窗口都需满足 |
| R6 | P2 | M5（正式锁摘要改一位）与 M8（必需负例名单删 `NEG-ORPHAN-COMPLETION`）存活 | 包测试新增对已提交正式锁与开发锁的断言：其构建套件必须被已提交批准登记批准；`REQUIRED_NEGATIVES` 提到模块级并导出，测试要求它与封闭名单完全相等 |

交接包第 4 节第 8 项写“用后清理”有误。B2-UI-02 注入的任务、轮次、事件行在驱动结束时只关闭数据库，没有删除；它们留在一次性数据根里，不是产品数据污染。套件说明已按此改写。

开发机验证（`0c163c24…` 定稿，证据层级开发机）：

| 检查 | 结果 |
|---|---|
| `node --test` 两个包测试文件 | 120 通过、0 失败（537 秒）；比 8c16ffd9 多 1 个用例（正式锁与批准登记） |
| shell jest 两个文件 | 2 个套件、100 个用例通过（8c16ffd9 为 94；本轮净增 6 个：新增 7 个，替换 1 个） |
| `npm run verify:quick` | 退出码 0；运行后已用 `git restore` 还原 `src/runner/dist` |
| `npm run docs:check` | ok，328 个文件（该提交的内容） |
| `git diff --check` | 0 行输出 |
| 变异重放 | 8 项全部被杀死并还原，还原后哈希一致：R1 列表非零状态、R2 `cancelled`、R3 同索引互斥、R4 `out` 令牌、R4 同毫秒、R5 `disabled`、M8 必需名单、M5 正式锁 |
| 卫生检查 | 新增与改动的文本文件无 BOM、无 CR；CMD 入口未改 |

提交统计：`0c163c24…` 改 7 个文件，+235、−43；相对 `7e96f561…`，`release`、`scripts`、`src` 下累计 20 个文件，+6701、−31。

未覆盖与限制（均为 `NOT_PERFORMED` 或 `UNKNOWN`，不计入通过）：

- 驱动、冒烟、控制器仍未在 Electron、PowerShell、Windows 上运行。`wmic` 列表失败的真实触发条件、Job 查询行为只在源码层核对。
- Node 16 与 PowerShell 2.0 的准确兼容性仍为 `UNKNOWN`。
- 毫秒墙钟时间不能证明同毫秒内的先后；同毫秒按 `UNKNOWN` 处理，不按通过处理。
- Windows 文件系统上 `mkdir` 独占与同索引检查的并发行为 `UNKNOWN`。
- 修复后未经 codex 重审；第三轮复核须新交接包，且发送给外部服务须负责人批准。

负责人 2026-10-13 对第二修复轮选 A。落到分支的方式沿用 §6.10：

| 项 | 内容 |
|---|---|
| 修复提交 | `0c163c24…`（父 `46bce3a0…`），本地，未推送；7 个文件，+235、−43，均在 §6.1 路径内 |
| 文档提交 | 随后一个本地文档提交（不推送），含本节、STATUS、STATUS_LOG、README 登记和第三轮交接包；该提交只改 `docs/` |
| 新交接包 | [第三轮交接包](../reports/2026-10/a9_33_independent_review_handoff_stage1_rerun3_2026-10-13.md)，绑定 `0c163c24…` |
| 复核者 | codex，无头会话（fast 服务层级），只读复核；结果由执行代理登记，结论仍由负责人裁决 |

本节不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不冻结候选，不签关口 A 或 B，不推送或合并。Win10、Win7 与完整 Alpha 2 均 `NOT_PERFORMED`。

### 6.12 codex 第一阶段第三轮复核与第三修复轮（2026-10-13）

结论：codex 对第二修复提交 `0c163c24…` 的第三轮复核结论仍是“不建议进入预演授权评审”：0 个 P0、2 个 P1、1 个 P2。第一轮 11 组中 9 组已关闭、2 组部分关闭（P1-6、P1-7）；第二轮 R1～R6 中 4 组已关闭、2 组部分关闭（R1、R4）。负责人选 A，授权开第三修复轮。
执行代理已在 §6.1 的 20 个路径内修复 3 项发现，并为每项补回归用例，提交为 `cde53348…`。复核者尚未重审。
证据层级为开发机。复核绑定 `0c163c24…`；修复绑定 `cde53348…`。真实 Electron、PowerShell、Win10、Win7 均 `NOT_PERFORMED`，未在 Win7 实机验证。

复核过程：codex 在负责人另开的无头会话中运行（fast 服务层级），只读复核，在自己的目录复算。执行代理逐条对照源码，确认 3 项发现全部属实。
codex 规定的 14 项变异全部被拦住，哈希复原一致；6 个 jest 用例因沙箱禁止回环监听（`listen EPERM`）失败，codex 标为 `UNKNOWN`，没有用执行代理的通过结果补签。
证据归档在 `.acceptance/a9-33-review/codex-stage1-round3-20261013/`（被忽略，含 `SHA256SUMS.txt`）。

| 编号 | 级别 | 发现 | 修复（均在 §6.1 路径内） |
|---|---|---|---|
| N1 | P1 | 真实执行器把输出截到 262144 字符且不留标记。超限的合法进程列表丢掉尾部，同实例存活行消失，B2-CH-06-NORMAL-EXIT 第 2 条记 PASS。真实 Win7 是否达到该体积为 `UNKNOWN` | `realExec` 在输出超过上限时置 `truncated` 并在 `error` 写 `stdout_truncated:<长度>`；`listProcesses` 把 `truncated` 与 `error` 同样判为列表失败 |
| P2-N1 | P2 | 列表失败时 `listProcesses` 返回空行，丢掉已见的存活行；§6.11 写“已见的残留仍记 FAIL”，实际得 `UNKNOWN`。这是第二修复引入的回归 | 失败时仍解析列数完整的行（`parseWmicCsv` 新增 `completeOnly`），只作存在证据：存活或残留出现其中记 `FAIL`，否则记 `UNKNOWN`；被截断的半行丢弃。环境阶段、正常退出、后飞行三处同样处理 |
| N2 | P1 | 幽灵令牌用子串匹配：数据库有 `out 99` 时，页面显示的 `out 9` 被放行；`tick 20` 对 `tick 2` 同样 | 新增 `storedHasToken`：令牌前一字符不是字母或下划线、后一字符不是数字才算已存；令牌恰在存储文本末尾时算已存（可能仍在增长）。帧拼接不加分隔符，故前一字符为数字时允许 |

套件说明 `A9_BATCH2_WIN7_VALIDATION.md` 的“进程列表”一行已按上述语义改写。

开发机验证（`cde53348…` 定稿，证据层级开发机）：

| 检查 | 结果 |
|---|---|
| `node --test` 两个包测试文件 | 120 通过、0 失败（447 秒）；本轮未改包测试 |
| shell jest 两个文件 | 2 个套件、101 个用例通过（上一提交为 100；新增 1 个用例，令牌用例内增加断言） |
| `npm run verify:quick` | 退出码 0；运行后已用 `git restore` 还原 `src/runner/dist` |
| `npm run docs:check` | ok，329 个文件（该提交的内容） |
| `git diff --check` | 0 行输出 |
| 变异重放 | 7 项全部被杀死并还原，还原后哈希一致：N1 去掉截断标记、N1 忽略 `truncated`、P2-N1 丢弃部分行、P2-N1 保留半行、N2 去掉后一字符判断、N2 去掉前一字符判断、N2 退回子串匹配 |
| 卫生检查 | 改动的文本文件无 BOM、无 CR、无行尾空白 |

提交统计：`cde53348…` 改 4 个文件，+111、−11（父 `beac36a4…`）；相对 `7e96f561…`，`release`、`scripts`、`src` 下累计 20 个文件，+6801、−31。

未覆盖与限制（均为 `NOT_PERFORMED` 或 `UNKNOWN`，不计入通过）：

- 驱动、冒烟、控制器仍未在 Electron、PowerShell、Windows 上运行。真实 `wmic` 输出体积、失败时的部分输出、列数是否恒等于表头，只在源码层核对。
- 带未加引号逗号的可执行路径会让该行列数多于表头：完整列表沿用既有解析（该行字段错位），失败列表里则丢弃该行。这一点沿用既有解析，未改。
- 令牌判据只针对 `tick`、`out`、`err` 三种流区令牌，真实 DOM 渲染未运行。
- Node 16 与 PowerShell 2.0 的准确兼容性仍为 `UNKNOWN`；Windows 文件系统上独占占用与同索引检查的并发行为 `UNKNOWN`。
- 修复后未经 codex 重审；第四轮复核须新交接包，且发送给外部服务须负责人批准。

负责人 2026-10-13 对第三修复轮选 A。落到分支的方式沿用 §6.10：

| 项 | 内容 |
|---|---|
| 修复提交 | `cde53348…`（父 `beac36a4…`），本地，未推送；4 个文件，+111、−11，均在 §6.1 路径内 |
| 文档提交 | 随后一个本地文档提交（不推送），含本节、STATUS、STATUS_LOG、README 登记和第四轮交接包；该提交只改 `docs/` |
| 新交接包 | [第四轮交接包](../reports/2026-10/a9_33_independent_review_handoff_stage1_rerun4_2026-10-13.md)，绑定 `cde53348…` |
| 复核者 | codex，无头会话（fast 服务层级），只读复核；结果由执行代理登记，结论仍由负责人裁决 |

本节不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不冻结候选，不签关口 A 或 B，不推送或合并。Win10、Win7 与完整 Alpha 2 均 `NOT_PERFORMED`。

### 6.13 第一段独立复核终局与负责人例外裁决（2026-10-13）

结论：codex 第一段复核共四轮，结论均为“不建议进入预演授权评审”，第四轮剩 0 个 P0、0 个 P1、2 个 P2。负责人选择不再修复，把这 2 项登记为已知限制，并直接进入预演授权评审。
第一段独立复核未通过。该例外由负责人裁决，不改写 codex 的结论，也不改写其余发现的关闭状态。
证据层级为开发机。复核对象为 `cde53348…`（第三修复提交），文档提交为 `860708cd…`。真实 Electron、PowerShell、Win10、Win7 均 `NOT_PERFORMED`，未在 Win7 实机验证。

负责人原话：“把这两项登记为已知限制，不再修，直接进入预演授权评审”。执行代理在提问中已说明该选项与 codex 的结论冲突，需要例外裁决；负责人在知情下选择了它。

第一段四轮记录：

| 轮次 | 复核对象 | P0 | P1 | P2 | codex 结论 | 登记位置 |
|---|---|---|---|---|---|---|
| 一 | `905bf760…` | 0 | 8 组 | 3 组 | 不建议 | §6.10 |
| 二 | `8c16ffd9…` | 0 | 4 组 | 2 组 | 不建议 | §6.11 |
| 三 | `0c163c24…` | 0 | 2 | 1 | 不建议 | §6.12 |
| 四 | `cde53348…` | 0 | 0 | 2 | 不建议 | 本节 |

第四轮的结论补充：第三轮的 N1、N2 原反例已关闭，21 项变异全部被拦住，未发现白名单外改动。6 个 jest 用例因沙箱禁止回环监听（`EPERM`）失败，codex 标为 `UNKNOWN`，没有用执行代理的通过结果补签。
证据归档在 `.acceptance/a9-33-review/codex-stage1-round4-20261013/`（被忽略，含 `SHA256SUMS.txt`）。执行代理用只读探针复现了两项发现。

登记的已知限制（均为评审器判据缺陷，不是产品缺陷）：

| 编号 | 来源 | 现象 | 影响 | 预演中的处置 |
|---|---|---|---|---|
| KL-1 | 第四轮 P2-R1 | 进程列表失败时，`completeOnly` 只比较单元格个数，最后一列内被切断的行仍被当作完整行。例如 `ProcessId=5000` 被切成 `500`，`SessionId=10` 被切成 `1` | 可能把半行当作存在证据，造成同实例存活的误 `FAIL`；或写出错误的会话事实，使单条身份断言 A02 误 `PASS`。同一情形下 A01 为 `UNKNOWN`，整体 G0 仍被阻断。只在进程列表失败（`listing_failed=true`）时触发，真实 Win7 的触发条件与列顺序为 `UNKNOWN` | 出现 `listing_failed=true` 时，执行代理保存原始输出，该次的存在与身份断言不计入结论，按 [§6.4](#64-停止诊断与核号)停止诊断并报告 |
| KL-2 | 第四轮 P2-R2 | `storedHasToken` 对合并后的数据库文本做“后一字符不是数字”检查。令牌跨数据库帧增长（如先落盘 `tick 2`，下一帧再落盘 `0`）且页面恰在两帧之间被采样时，已落盘的令牌被报为幽灵令牌 | 误报 `dom_token` 违规，使 B2-S02、B2-S03 误 `FAIL`；不会使错误断言通过。父提交 `0c163c24…` 对同一输入通过，属第三修复引入。真实 Windows 是否触发为 `UNKNOWN` | 出现 `dom_token` 违规时，执行代理保存采样与存储帧，核对违规令牌是否为某个存储令牌的前缀。是前缀则标注为 KL-2 误报，断言仍保持 `FAIL`，不改判 `PASS`，按 §6.4 停止诊断并报告 |

另记：套件说明“进程列表”一行写的“256 KiB”，实际单位是 262144 个 JavaScript 字符，不是字节。`free_space` 等消费者只读 `stdout`、不看 `error`，是既有行为，第四轮未发现新的状态回归。两处均未改。

本裁决不改变的事项：

| 项 | 状态 |
|---|---|
| 预演授权 | 未授予。须负责人对[批准材料草案](../plans/A9_33_REHEARSAL_AND_EXECUTION_APPROVAL_DRAFT.md)Q1～Q4 作答并提供 Win7 机器名后，才有可用的授权范围 |
| 第二、三段独立复核 | 保持。预演证据与正式证据形成后，仍由负责人另开 codex 会话复核 |
| 源码 | 停在 `cde53348…`，不再为这两项改动；预演若发现 §6.1 路径内的缺陷并修复，须重新评估两项限制是否仍然存在 |
| 候选、关口、ADR | 不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并 |

Win10、Win7 与完整 Alpha 2 均 `NOT_PERFORMED`。

### 6.14 预演批准材料裁决（2026-10-13）

结论：负责人对[批准材料草案](../plans/A9_33_REHEARSAL_AND_EXECUTION_APPROVAL_DRAFT.md) Q1～Q4 作答：Q1 选 A，Q2 选 B，Q3 选 A，Q4 选 A，并同意把 §6.13 及本节的文档改动做成只改 `docs/` 的本地提交（不推送）。预演授权仍未授予，缺 Win7 机器名与普通账户确认。
证据层级为开发机。真实 Electron、PowerShell、Win10、Win7 均 `NOT_PERFORMED`，未在 Win7 实机验证。

| 问题 | 裁决 | 生效内容 |
|---|---|---|
| Q1 | A | 每次预演单独签预演授权文件，绑定预演专用 run-id、目标账户和当次包哈希；不得当作关口 A；负责人对每份文件的 SHA-256 回复同意后才可使用 |
| Q2 | B | 有限滚动批准：最多 4 次预演、总计 ≤64 请求、≤8 小时；同一失败连续两次即暂停诊断；首次预演后先报告；新包哈希传输前报备；修复只在 §6.1 路径内 |
| Q3 | A | 本批不使用 Win10 |
| Q4 | A | 负责人保证 `agent` 已登录 Win7 控制台；执行前只读核验，不符即停 |

仍缺的项：Win7 机器名（`UNKNOWN`）、普通账户是否仍为 `agent`、时间窗起点。三个本地构建输入的哈希已与输入锁核对一致（见草案 §3A），未构建。
本节不授予预演授权，不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并。Win10、Win7 与完整 Alpha 2 均 `NOT_PERFORMED`。

### 6.15 Win7 只读预检与时间窗起点（2026-10-13）

结论：负责人授权一次 Win7 只读预检，确认普通账户为 `agent`，并裁决预演时间窗从授权补齐当日起算。执行代理已于 2026-10-13 08:12:32Z 完成预检，读得机器名 `dccs-chaizl-PC`。预演授权仍未授予，缺负责人确认该机器名为批准值，以及 `agent` 的 SID 核验。
证据层级为 Win7 实机（仅只读观察，不是验收证据）。预检绑定提交 `d4a45be1…`。预演、正式执行与 Win10 均 `NOT_PERFORMED`，Win7 验收未执行。

负责人原话：“选B，授权只读预检，agent确认，时间窗从授权补齐当日起”。

执行范围：一次 SSH 会话，管理传输账户 `dccs-chaizl`，地址 `192.168.1.3`，主机键别名 `192.168.1.11`，严格核对主机键；只执行 `hostname`、`query user`、`ver`。未写文件、未改设置、未创建任务、未读取私钥内容。

| 项 | 预检读得 |
|---|---|
| 机器名 | `dccs-chaizl-PC` |
| 系统版本 | `Microsoft Windows [版本 6.1.7601]` |
| `dccs-chaizl` | 会话 1，已断开，登录于 2026-09-24 21:58 |
| `agent` | 会话名 `console`，会话 ID 2，状态“运行中”，空闲 13 天 21 小时 06 分，登录于 2026-09-24 22:29 |

解读：

- Q4 的前提表面成立：`agent` 在控制台会话 2 中运行。
- “运行中”不证明桌面未锁屏。空闲已超过 13 天，锁屏或屏保状态为 `UNKNOWN`；若桌面被锁，交互桌面里的窗口驱动可能失败。处置：预演中出现交互失败时按 [§6.4](#64-停止诊断与核号)停止诊断并报告，不改判。
- 授权文件的 `target.session_id` 以会话 2 为候选值，仍须在每次运行前再次只读核验。
- 原始输出归档在 `.acceptance/a9-33-rehearsal/preflight-20261013/`（被忽略，含 `SHA256SUMS.txt`）。

时间窗起点：补齐当日为第 1 日，连续 3 个日历日，按负责人本机时区；机器名确认与 SID 核验都完成的当日为补齐当日。目前未补齐，窗口未开始。

仍缺的项：

| 项 | 状态 |
|---|---|
| 机器名 | `dccs-chaizl-PC` 由执行代理读得，须负责人确认为批准值；执行代理不自行批准 |
| `agent` 的 SID | 未读取，须再经一次只读核验，授权文件 `target.account_sid` 必填 |

本节不授予预演授权，不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并。

### 6.16 目标绑定补齐与时间窗开始（2026-10-13）

结论：负责人确认机器名 `dccs-chaizl-PC` 为批准值，授权只读核验 `agent` 的 SID，并同意提交文档。执行代理已读得 SID，目标绑定补齐，预演时间窗于 2026-10-13T08:15:22Z 开始。写入类远端动作（R2 起）仍须先有负责人对当次预演授权文件 SHA-256 的同意，预演授权文件尚未生成。
证据层级为 Win7 实机（仅只读观察，不是验收证据）。预演、正式执行、Win10 与 Win7 验收均 `NOT_PERFORMED`。

负责人原话：“确认机器名，授权只读核验SID，同意提交文档”。

| 项 | 内容 |
|---|---|
| 批准的机器名 | `dccs-chaizl-PC` |
| 普通账户 | `agent`，本地账户（域名列等于机器名），SID `S-1-5-21-1708701742-428676696-1831205153-1001`，只读核验一行结果 |
| 会话候选 | 控制台会话 2（§6.15 预检观察）；每次运行前再核 |
| 时间窗 | 2026-10-13T08:15:22Z 至 2026-10-16T06:59:59Z：补齐当日（2026-10-13）为第 1 日，连续 3 个日历日，按开发机系统时区 PDT（UTC−7）计，终点 2026-10-15 23:59:59 PDT；若负责人所在时区不同，须负责人指出，窗口不晚于上述绝对时间 |
| 预算 | 沿用 §6.14：最多 4 次预演、≤64 请求、≤8 小时 |

SID 核验：2026-10-13 08:15:22Z，一次 SSH 会话，只读执行 `wmic useraccount where name='agent' get Domain,Name,SID`，未写文件、未改设置。同一查询在约 08:15:07Z 首次执行，输出因开发机侧管道命令写错而丢失，没有看到结果；08:15:22Z 重复同一只读查询取得结果。原始输出归档在 `.acceptance/a9-33-rehearsal/preflight-20261013/`（被忽略，含 `SHA256SUMS.txt`）。

下一步（执行代理）：

1. 在开发机构建预演包。三个输入都在本机，哈希与输入锁一致，不需要下载。
2. 传输前报备包、清单、套件、helper 的 SHA-256。
3. 生成预演授权文件（`kind` 为 `WIN7_43_RELEASE_AUTHORITY`），绑定新 run-id、上述目标和包哈希，请负责人对其 SHA-256 回复同意。
4. 同意后按 [批准材料草案](../plans/A9_33_REHEARSAL_AND_EXECUTION_APPROVAL_DRAFT.md) §4 的 R1～R8 闭集动作执行。

本节不授予写入类远端动作，不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并。

### 6.17 预演 1 执行记录与 p03 修复（2026-10-13）

结论：负责人批准预演授权文件后，执行代理在 Win7 实机完成预演 1。p01、p02 通过，p03 失败（`PHASE_RESULT_MISSING`），p04～p10 因前置未过而未执行。失败原因是冒烟脚本漏设 `process.noAsar`，修复已提交为 `5499843…`（本地，未推送），尚未在 Win7 复核。
证据层级为 Win7 实机（预演，`REHEARSAL_NOT_ELIGIBLE`），绑定源提交 `445f12e2…`、授权文件 `4b566715…`、运行编号 `0f3591ba`。Win7 验收、正式执行、Win10 均 `NOT_PERFORMED`。

负责人原话：“批准，授权文件 SHA-256 4b566715… 同意，开始 Win7 预演”；失败报告后又答：“选A，同意提交修复并构建预演2”。第一句用前 8 位加省略号，与提问时的缩写一致，该前缀只对应一份授权文件。

| 步骤 | 时间（UTC） | 结果 |
|---|---|---|
| R1 只读复核 | 08:23:51Z | 机器名 `dccs-chaizl-PC`；`agent` 在控制台会话 2 运行中；C: 剩余 884258213888 字节；`C:\A9-W43` 不存在；进程表无 Electron 与 helper |
| R2 建根 | 08:29:12Z | 新建 `C:\A9-W43\run\0f3591ba\{deploy,work,data,evidence}`，`icacls` 只授 `agent` 该根的修改权 |
| R3 传输 | 08:29:37Z～08:39:18Z | 包 ZIP（101555587 字节）、授权文件、输入锁、构建套件登记及执行代理粘合文件共 10 个文件；Win7 端 `certutil` 复算与开发机逐项相同；ZIP 上传 9 分 41 秒 |
| R4 展开 | 08:39:38Z | .NET `ZipFile` 展开到 `deploy`，800 个文件，`electron.exe` 存在 |
| R5 计划任务 | 每阶段一次 | 注册、COM 回读 11 项字段一致、运行、删除；P01、P02、P03 均已删除 |
| R6 阶段 | 08:40:28Z～08:42:51Z | 见下表 |
| R7 取回 | 08:50:36Z | 证据目录 102 个文件，取回 20 个并与 Win7 端哈希逐项一致；其余 82 个是候选运行时副本（149 MB），传输约 170 KB/s，中止取回，只留 Win7 端哈希清单 |
| R8 后飞行 | 08:50:53Z | 进程表 104 行，无 `electron`、`spike02`、`node`，与 p01 基线行数相同；运行根保留 |

| 阶段 | 结果 | 依据 |
|---|---|---|
| p01 环境与身份 | PASS，5/5 断言 | `agent` SID、Medium、会话 2、非提升、`in_job=false`；Electron 22.3.27、Node 16.17.1、ABI 110；进程 104 个无残留；空闲 883916107776 字节 |
| p02 包完整性 | PASS，4/4 断言 | 799 个清单文件与 800 个 ZIP 条目 0 处不一致；helper 与 sqlite 哈希；7 个模块在候选 Electron 里加载 |
| p03 最短链路 | FAIL | `PHASE_RESULT_MISSING`；账本 CONSUMED→COMPLETED 结果 FAIL；无 `phase-result.json` |
| p04～p10 | `NOT_PERFORMED` | 前置阶段 p03 未通过 |

p03 根因：`prepareDriverRuntime` 用 `fs.copyFileSync` 复制 `default_app.asar`（`a9-batch2-smoke.cjs`）。Electron 的 fs 包装把以 `.asar` 结尾的路径当归档根，报 `ENOENT,  not found in …default_app.asar`。证据是 `evidence\driver-electron\resources` 已建但为空。WIN7-42 冒烟脚本首行有 `process.noAsar = true;` 并写明原因，本批冒烟脚本漏了；p02 的完整性脚本用 `original-fs`，不受影响。
修复（`5499843…`，2 个文件、+45 行）：冒烟脚本加 `process.noAsar = true;`；契约测试加 2 个用例（模块加载置位；复制在虚拟化开启时失败、关闭时成功）。去掉修复后两个用例都失败。该修复在真实 Electron 上是否生效，要预演 2 才能确认，`UNKNOWN`。

计划任务合同（草案 §7 中“计划任务 XML 合同”一项，由执行代理起草，此处报备）：

| 项 | 内容 |
|---|---|
| 任务名 | `\A9W43R<运行编号前 8 位>P<阶段序号>`，每阶段一个，运行后删除 |
| 主体 | `agent` 精确 SID，`InteractiveToken`，`LeastPrivilege`，无触发器，`IgnoreNew`，`ExecutionTimeLimit` 为 `PT3H` |
| 动作 | `C:\Windows\System32\cmd.exe /d /c call "<根>\work\phase.cmd" <阶段> false`，工作目录 `<根>\work` |
| 编码 | 注册 XML 为 ASCII、无 BOM、无编码声明；`.cmd` 为 ASCII、CRLF |
| 回读 | `schtasks /query /xml` 报“无法加载列资源”（W40 起已知），改用 Task Scheduler COM 导出，核对 URI、命令、参数、工作目录、SID、登录类型、运行级别、时限、实例策略、触发器数、动作数 |
| 运行前核对 | 每次运行前只读核对机器名与 `agent` 控制台会话 2，不符即停 |

粘合文件是执行代理工具，不在候选内，也不是仓库文件，存放在隔离树 `.acceptance/a9-33-rehearsal/rehearsal-1/glue/`（被忽略）：`make-request.cjs` `e4d76403…`、`phase.cmd` `1cb12059…`、`extract.ps1` `b04dbb23…`、`sum-tree.ps1` `2cc6b80b…`、`readback.ps1` `9ae866cd…`、`binding.json` `2ae85b4b…`。
与批准材料草案 §4 R3 的差异：R3 写的是传输“阶段请求文件”。本次改由 `make-request.cjs` 在 Win7 上调用候选自己的 `createRequest` 生成请求，因为请求含 900 秒有效期，开发机与 Win7 时钟偏差会触发 `NOT_YET_VALID` 或 `EXPIRED`。请求内容仍由候选代码生成，粘合文件只读账本、不写账本。
请求目标的 `machine_name` 用控制器报告的 `DCCS-CHAIZL-PC`（大写），授权文件写的是 `dccs-chaizl-PC`；请求脚本逐字比较，两者只差大小写，Windows 机器名不区分大小写。

执行偏差与披露：

- R2 有两次无远端效果的失败尝试：本机 zsh 未拆分参数（ssh 未连接），远端 `cmd` 在括号块里遇到 `(OI)(CI)M` 而整条拒绝（随后只读核对 `C:\A9-W43` 不存在）。
- 中止 `driver-electron` 的取回时已在本机收到 7 个文件，清单见预演 1 目录 `runs/p03-chain/driver-electron-partial-listing.txt`，字节已删除。
- Win7 PowerShell 为 5.1.14409.1018，控制器的 PS 2.0 兼容性仍未验证。

开发机检查（修复后，提交 `5499843…`）：契约 jest 60 通过（含 2 个新用例）；批次包测试 8 通过；去掉修复后 2 个新用例都失败。
全量 shell jest 618 个用例中 615 通过，3 个失败都在 `a9-lifecycle.test.ts`（后台进程）；同一文件在修复前的 `445f12e2…`（临时工作树复跑）同样 3 个失败，且该文件不引用本次改动的两个文件，根因 `UNKNOWN`。完整 `node --test` 与 `verify:quick` 本次 `NOT_PERFORMED`。
预算：预演 1/4，请求 3/64（索引 1～3，p03 为失败），窗口至 2026-10-16T06:59:59Z。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并。预演 2 使用新的运行编号、新的 Win7 运行根、新构建的包，须另有负责人对新授权文件 SHA-256 的同意。

### 6.18 预演 2 执行记录与 p03 两项失败的修复（2026-10-13）

结论：预演 2 在 Win7 实机完成。p01、p02 通过，p03 的 12 个断言 8 个通过、4 个失败（`DRIVER_CHAIN_EXIT_FAILED`），p04～p10 因前置未过而未执行。两个失败的原因都在验收套件，不在产品。后台输出一项已确认根因；退出对话框一项根因 `UNKNOWN`。修复提交为 `9820934c…`（本地，未推送），尚未在 Win7 复核。
证据层级为 Win7 实机（预演，`REHEARSAL_NOT_ELIGIBLE`），绑定源提交 `efc785a8…`、授权文件 `b05f72a1…`、运行编号 `d254bfcb`。Win7 验收、正式执行、Win10 均 `NOT_PERFORMED`。

负责人原话：“批准，授权文件 SHA-256 b05f72a1… 同意，开始预演2”；失败报告后又答：“选A，同意提交修复并构建预演3”。

| 步骤 | 时间（UTC） | 结果 |
|---|---|---|
| R1 只读复核 | 10:52:25Z | 机器名 `dccs-chaizl-PC`；`agent` 在控制台会话 2 运行中；C: 剩余 883684192256 字节；新根不存在；预演 1 的根仍在 |
| R2 建根 | 10:52:51Z | 新建 `C:\A9-W43\run\d254bfcb\{deploy,work,data,evidence}`，`icacls` 只授 `agent` 该根的修改权 |
| R3 传输 | 10:53:03Z～10:55:23Z | 包 ZIP（101558808 字节）及其余 10 个文件；Win7 端 `certutil` 复算 11 个文件与开发机逐项相同；ZIP 改用 `aes128-ctr` 上传，2 分 20 秒 |
| R4 展开 | 10:55:48Z | 800 个文件；包内冒烟脚本含 `process.noAsar = true;` |
| R5 计划任务 | 每阶段一次 | 注册、COM 回读 11 项字段一致、运行、删除；P01、P02、P03 经 COM 回读均为“找不到文件”，已删除 |
| R6 阶段 | 10:56:02Z～11:00:44Z | 见下表 |
| R7 取回 | 11:13Z | Win7 端 evidence 153 个文件已算哈希；取回 54 个（账本与三个请求目录），与哈希逐项一致，0 个不一致；其余 99 个是候选运行时副本，只留哈希清单 |
| R8 后飞行 | 11:13Z | 进程表 102 行，无 `electron`、`spike02`、`node`、`powershell`、`wmic`；p03 后飞行记录的残留 `electron.exe`（pid 6084）已不存在，执行代理未强杀，结束方式 `UNKNOWN`；运行根保留 |

| 阶段 | 结果 | 依据 |
|---|---|---|
| p01 环境与身份 | PASS，5/5 断言 | `in_job=false` 一次被接受 |
| p02 包完整性 | PASS，4/4 断言 | Electron 22.3.27、ABI 110 在 Win7 上读到 |
| p03 最短链路 | FAIL，`DRIVER_CHAIN_EXIT_FAILED` | B2-CH-01（2）、B2-CH-03（2，Stop 反馈 293 ms）、B2-CH-04（2）、B2-CH-05（2）PASS；B2-CH-02（2）、B2-CH-06（2）FAIL |
| p04～p10 | `NOT_PERFORMED` | 前置阶段 p03 未通过 |

预演 1 的 `process.noAsar` 修复在 Win7 上生效：p03 运行了 3 分 9 秒，套件首次在 Win7 上驱动产品完成启动、Stop、中断重启恢复与继续。

B2-CH-02 根因（已确认，对 `state.sqlite` 与源码核实）：驱动的观测循环在“已存 6 帧或 Turn 结束”时停止。`start_process` 立即返回，`tool_end` 为 10:57:57.832Z，`turn_completed` 为 57.845Z，第一帧 `tick 1` 为 58.296Z，晚 451 ms。循环在 489 ms 的第 2 次采样遇到 `turn_completed`，此时 0 帧，随后进入 Stop。同一命令在第二个会话里正常落库 14 个 `tick` 与 14 个 `err`，间隔约 410 ms，说明产品输出链路工作。
B2-CH-06 现象：对话框标记 10:58:11.260Z 已写出，按钮三个、文字与预期一致；控制器的 UI Automation 搜索 30 秒未找到按钮，退出码 3；产品等待 150 秒后被驱动计时器终止，退出码 1。根因 `UNKNOWN`：原实现对同 PID 的每个窗口取全部后代按钮并逐字比较名称，没有留下窗口树，无法区分是控件类型、名称还是窗口归属不同。

修复（`9820934c…`，5 个文件，+280/−26，全部在 §6.1 的 20 个路径内；不改产品语义）：

| 文件 | 改动 |
|---|---|
| `a9-batch2-driver-entry.cjs` | 新增 `backgroundObservationDone`：6 帧，或 Turn 已结束且观测已满 8 秒；背景观测改用它 |
| `a9-batch2-fixtures.cjs` | `b2:bg-start` 的 tick 数由 14 改为夹具上限 `FIXTURE_BOUNDS.max_ticks`（30，Win7 的 PowerShell 夹具约 12 秒），保证 Stop 与退出对话框点击时命令仍在运行 |
| `a9-batch2-desktop-controller.ps1` | `ClickDialog` 先按同 PID 对话框窗口里的 `Button` 子窗口点击（`PostMessage` 发 `BM_CLICK`，取不到文字时对 `Button`、`Static` 用 `WM_GETTEXT`），再用 UI Automation（限定类名 `#32770`）；点击后等按钮消失并输出 `button_gone`；未找到时输出窗口、子控件、UI Automation 项（ASCII 转义，至多 7000 字符）并仍以退出码 3 结束。Win32 类型在 `ClickDialog` 内部编译，编译失败时回落到 UI Automation，不影响 `Run` |
| `a9-batch2-smoke.cjs` | 点击输出保留上限由 2000 改为 8000 字符 |
| `a9-batch2-contract.test.ts` | 新增 3 个用例（观测规则与源码绑定、夹具 tick 数、`ClickDialog` 结构与 C# 2.0 语法限制） |

开发机检查（绑定 `9820934c…` 的内容，提交前同一工作树）：契约 jest 63 通过（含 3 个新用例）；4 项变异（还原观测规则、夹具 tick 数、控制器、点击输出上限）各被一个新用例拦住；批次包测试加 A9 包测试 `node --test` 120 通过；两个 shell 测试文件共 106 通过；`verify:quick` 通过（`src/runner/dist` 已还原）；`git diff --check` 无输出。全量 shell jest 本轮 `NOT_PERFORMED`（预演 1 记录的 3 个 `a9-lifecycle` 失败仍为 `UNKNOWN` 根因的既有问题）。

未知与未验证：

- 控制器的 PowerShell 与内联 C# 没有在任何 Windows 上运行（开发机无 `pwsh`、`csc`）；Win32 点击能否命中 Electron 的退出对话框 `UNKNOWN`，要预演 3 才能确认。
- 30 个 tick 是否影响 p04 之后用到 `b2:bg-start` 的路径 `UNKNOWN`；p04～p10 从未在 Win7 运行，其中是否存在其他套件缺陷 `UNKNOWN`。
- Win7 PowerShell 为 5.1.14409.1018，控制器的 PS 2.0 兼容性仍未验证。

执行偏差与披露：

- R1 的进程表与机器名核对放在同一条 `cmd` 命令里，`if … else (…)` 链跳过了进程表；随后单独读取并记录，没有重复写类动作。
- 本节的预演 2 取回的是账本与请求目录，不含 `driver-electron`；该目录只留 Win7 端哈希清单。

粘合文件与预演 1 同属执行代理工具，不在候选内，存放在隔离树 `.acceptance/a9-33-rehearsal/rehearsal-2/glue/`（被忽略）：`make-request.cjs` `e4d76403…`（与预演 1 逐字节相同）、`phase.cmd` `81eb9db0…`、`extract.ps1` `b04dbb23…`、`sum-tree.ps1` `2cc6b80b…`、`readback.ps1` `9ae866cd…`、`binding.json` `9c2435b8…`。
预算：预演 2/4，请求 6/64（预演 2 的索引 1～3，p03 为失败），用时自 08:29Z 起约 2 小时 50 分，窗口至 2026-10-16T06:59:59Z。p03 的失败类别与预演 1 不同，不触发“同一失败两次即暂停”。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并。预演 3 使用新的运行编号、新的 Win7 运行根、新构建的包，须另有负责人对新授权文件 SHA-256 的同意。

### 6.19 预演 3 执行记录与 p03 两项剩余失败（2026-10-13）

结论：预演 3 在 Win7 实机完成。p01、p02 通过，p03 的 12 个断言 10 个通过、2 个失败（`ASSERTION_FAILED`），p04～p10 因前置未过而未执行。退出对话框点击在 Win7 上成功。剩余两项：B2-CH-06-A02 是验收套件把自身进程算作残留，已修复；B2-CH-02-A01 是产品界面在 Turn 结束后不显示后台输出，负责人裁决选 B：登记为已知限制 KL-3 并收窄断言，产品不改。两项修复提交为 `83e03bf6…`（本地，未推送）。
证据层级为 Win7 实机（预演，`REHEARSAL_NOT_ELIGIBLE`），绑定源提交 `a22fde42…`、授权文件 `d66d8bd5…`、运行编号 `79a32916`。Win7 验收、正式执行、Win10 均 `NOT_PERFORMED`。

负责人原话：“选A，同意提交修复并构建预演3”；“批准，授权文件 SHA-256 d66d8bd5… 同意，开始预演3”；预演 3 报告后答：“选B，同意提交修复与文档”。

| 步骤 | 时间（UTC） | 结果 |
|---|---|---|
| R1 只读复核 | 11:54:04Z | 机器名 `dccs-chaizl-PC`；`agent` 在控制台会话 2 运行中；C: 剩余 883108356096 字节；新根不存在；旧根 `0f3591ba`、`d254bfcb` 仍在 |
| R3 传输 | 11:54:31Z～12:22Z | 包 ZIP（101563969 字节）经 scp 三次中断，改用 sftp `reput` 续传完成；其余 10 个文件一次传完；Win7 端 `certutil` 复算 11 个文件与开发机逐项相同；中断原因 `UNKNOWN` |
| R4 展开 | 12:22:52Z | 800 个文件；包内冒烟脚本含 `process.noAsar = true;`，控制器含 `B2Dialog` |
| R5 计划任务 | 每阶段一次 | 注册、COM 回读 11 项字段一致、运行、删除；P01、P02、P03 经 COM 回读均为“找不到文件” |
| R6 阶段 | 12:22:56Z～12:25:25Z | 见下表 |
| R7 取回 | 12:25Z | Win7 端 evidence 154 个文件已算哈希；取回 55 个，与哈希逐项一致 |
| R8 后飞行 | 12:26Z | 进程表 103 行，无 `electron`、`spike02`、`node`、`powershell`、`wmic`；运行根保留 |

| 阶段 | 结果 | 依据 |
|---|---|---|
| p01 环境与身份 | PASS，5/5 断言 | — |
| p02 包完整性 | PASS，4/4 断言 | — |
| p03 最短链路 | FAIL，`ASSERTION_FAILED`，10/12 断言 PASS | B2-CH-01（2）、B2-CH-02-A02、B2-CH-03（2，Stop 反馈 290 ms）、B2-CH-04（2）、B2-CH-05（2）、B2-CH-06-A01 PASS；B2-CH-02-A01、B2-CH-06-A02 FAIL |
| p04～p10 | `NOT_PERFORMED` | 请求脚本返回 `PREREQUISITE_NOT_PASSED:p03-chain` |

预演 2 的两项修复在 Win7 上的结果：

| 修复 | Win7 结果 |
|---|---|
| 观测循环在 Turn 结束后继续 8 秒 | B2-CH-02-A02 PASS，frames=6；Stop 时命令仍在运行（`running_processes=1`） |
| `ClickDialog` 先 Win32 按钮点击 | 输出 `clicked index 0 via win32; button_gone=True`；产品退出码 0；B2-CH-06-A01 PASS（`returned_index=0`） |

剩余失败 1，B2-CH-06-A02（套件缺陷，已在工作树修复，未提交）：断言 observed 为 `exit_code=0; survivors=0; tree_before=6; listing_failed=false; residue=1`，残留为 pid 7300 的 `electron.exe`。`finishChainEvidence` 统计候选目录下的全部进程，不排除冒烟脚本自身，而冒烟脚本本身就是候选目录下的 `electron.exe`（`ELECTRON_RUN_AS_NODE=1`）。证据：7300 不在 4 个驱动 pid（3520、1408、7556、6344）之中；R8 在阶段结束后无 `electron`；预演 2 的 pid 6084 同样如此。7300 即冒烟脚本自身，是由此推断，证据里没有记录冒烟脚本的 pid，所以确认要等下一次运行的 `06-postflight.json` 新增字段 `own_pids_excluded`。修复：排除 `ctx.pid` 与父进程，与 `runPostflightPhase` 一致。

剩余失败 2，B2-CH-02-A01（产品行为缺口，不在 §6.1 路径内；负责人选 B，登记 KL-3）：原断言要求 tick、stdout、stderr 在进程结束前显示在界面。observed 为 `first_visible_ms=null; running_processes=1; stdout_has_tick=true; stderr_has_err=true; observations=22`。11 次采样中，IPC 快照的帧数从 0 增到 6，界面 DOM 的帧数始终为 0；`02-output.png` 显示卡片“工具活动 · 1 项”、“后台运行 1”，没有输出文字。原因在 `src/shell/product/renderer/a9-workbench.js`：`beginSnapshotPolling` 只在提交的 Turn 内运行；主进程推送通道 `desktop:event` 只转发 `task.event`；`tickLiveStatus` 不刷新托管进程输出。`start_process` 让 Turn 立即结束，之后产生的输出要等下一次快照刷新才显示。该断言在预演 2 与预演 3 都失败，原因不同（预演 2 是观测过早）。

开发机检查（绑定 `83e03bf6…`，提交前同一工作树）：契约 jest 65 通过，新增 2 个用例；A02 用例无修复时失败（Expected PASS，Received FAIL）、有修复时通过；A01 评估器 4 项变异（去掉运行数、去掉快照帧、要求界面帧、去掉 stderr）各被拦住；`node --test` 120 通过；`verify:quick` 退出 0；两个 shell 测试文件 108 通过；`docs:check` 通过。

负责人裁决与已知限制 KL-3（选项 B）：

| 编号 | 来源 | 现象 | 影响 | 预演与正式执行中的处置 |
|---|---|---|---|---|
| KL-3 | 预演 3 的 B2-CH-02-A01 | 启动后台进程的 Turn 结束后，渲染层不再刷新对话；输出帧已写入 SQLite 并出现在 IPC 快照，界面要等下一次刷新才显示 | 用户在该 Turn 结束后看不到后台进程的实时输出，要发下一条消息或切换对话才出现。这是产品缺口，不是套件缺陷 | A01 收窄为“输出已落库并出现在 IPC 快照，且不先于落库”；`02-background.json` 与 observed 记录 `dom_frames_max`，界面显示不作判据。B2-S01 仍检查 Turn 内的界面实时显示。Alpha 2 结论须带这一条限制，产品修复须另立任务书 |

收窄后的 A01 是否通过只取决于落库与快照事实；它不再证明“用户在 Turn 结束后能在界面看到后台输出”，该能力 `NOT_VERIFIED`，且已知缺失。`dom_frames_max` 大于 0 说明产品已改，须重新评估 KL-3。

未知与未验证：

- pid 7300 是否为冒烟脚本自身：见上，`UNKNOWN`。
- p04～p10 从未在 Win7 运行，其中是否存在其他套件缺陷 `UNKNOWN`。
- ZIP 上传三次中断的原因 `UNKNOWN`；预演 1、2 未中断。
- B2-S01 在活动 Turn 内的界面实时显示，在 Win7 上 `UNKNOWN`：p04 未运行，该断言仍以界面为判据，KL-3 不覆盖它。
- Win7 PowerShell 为 5.1.14409.1018，控制器的 PS 2.0 兼容性仍未验证。

执行偏差与披露：

- 本次 R7 与预演 2 相同，只取回账本与请求目录，不含 `driver-electron`。
- B2-CH-02-A01 在预演 2、3 各失败一次。按“同一失败出现两次即暂停”的字面读法，执行代理暂停了 Win7 动作，直到负责人裁决（选 B）。

预算：预演 3/4，请求 9/64（每次预演 3 个），用时自 08:29Z 起已过 5 小时（上限 8 小时，到 16:29Z），窗口至 2026-10-16T06:59:59Z。只剩预演 4 一次。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并。预演 4 须有新构建的包、新授权文件和负责人对其 SHA-256 的同意。

### 6.20 预演 4 执行记录与套件修复轮（2026-10-13）

结论：预演 4 在 Win7 实机完成。p01、p02、p03 通过；p04、p05、p06 失败；p07 被套件守卫拒绝；p08～p10 `NOT_PERFORMED`。6 项失败里 3 项是已确认的套件缺陷，3 项原因 `UNKNOWN`。开发机修复轮已完成并本地提交为 `f672f518…`，负责人同意提交并同意两项判定范围调整。修复未在 Win7 验证。
证据层级为 Win7 实机（预演，`REHEARSAL_NOT_ELIGIBLE`），绑定源提交 `0ed05cbb…`、授权文件 `517894f7…`、运行编号 `dbd8df63`。修复轮的验证层级为开发机，绑定 `f672f518…`。Win7 验收、正式执行、Win10 均 `NOT_PERFORMED`。

负责人原话：“批准，授权文件 SHA-256 517894f7… 同意，开始预演4”；预演 4 报告后答：“选B，同意放宽到第5次、8小时重新计时”；修复轮报告后答：“选A，同意提交，含两项判定范围调整”。

| 步骤 | 时间（UTC） | 结果 |
|---|---|---|
| R1 只读复核 | 13:37:39Z | 机器名 `dccs-chaizl-PC`；`agent` 在控制台会话 2 运行中；C: 剩余 882531594240 字节；新根不存在；旧根 `0f3591ba`、`79a32916`、`d254bfcb` 仍在 |
| R3 传输 | 13:40:09Z～14:17:45Z | 包 ZIP 经 sftp 上传，共 38 分钟，含一次误覆盖重传（见执行偏差）；Win7 端 `certutil` 复算 11 个文件与开发机逐项相同 |
| R4 展开 | 14:18:07Z | 800 个文件；冒烟脚本含 `own_pids_excluded`，驱动含 `evaluateBackgroundOutput` |
| R5/R6 阶段 | 14:18:30Z～14:26:51Z | p01～p07 各注册一个计划任务并删除，p01～p06 运行，p07 被请求脚本拒绝；见下表 |
| R7 取回 | 14:28Z | Win7 端 evidence 247 个文件已算哈希；p06 之后取回 104 个，与哈希逐项一致 |
| R8 后飞行 | 14:31Z | 进程表 102 行，无 `electron`、`spike02`、`node`、`powershell`、`wmic`；P01～P07 任务不存在；运行根 `C:\A9-W43\run\dbd8df63` 保留 |

| 阶段 | 结果 | 依据 |
|---|---|---|
| p01 环境与身份 | PASS，5/5 | — |
| p02 包完整性 | PASS，4/4 | — |
| p03 最短链路 | PASS，12/12 | B2-CH-06-A02：`own_pids_excluded=[7364,6608]`，`residue=[]`；B2-CH-02-A01（KL-3 收窄后）：`first_ipc_ms=1217; ipc_frames_max=6; dom_frames_max=0` |
| p04 流式输出 | FAIL，`DRIVER_STREAM_ENCODINGS_FAILED` | S01（首个 tick 可见 1011 ms，领先命令结束 3795 ms）、S02、S03 PASS；`stream_encodings` 抛 `A9_BATCH2_DRIVER_PRODUCT_BUSY`；S03T、S04、S05 `NOT_PERFORMED` |
| p05 会话与后台 | 第 1 次尝试被请求脚本拒绝（`TARGET_MISMATCH:in_job`，两个 `in_job` 取值都被拒）；同一路径重试 1 次通过请求，4 个断言全 FAIL | S06、BG-01、BG-02、BG-03 |
| p06 继续 | FAIL，`ASSERTION_FAILED` | B2-CONT-01（2）、B2-CONT-03-A01 PASS；B2-CONT-03-A02 的子项 `mode_diagnostics` FAIL，其余 4 个子项 PASS |
| p07 | 请求被拒，`SAME_CLASS_FAILURE_TWICE_DIAGNOSE_FIRST` | p05、p06 连续两次 `ASSERTION_FAILED`；执行代理不绕过守卫 |
| p08～p10 | `NOT_PERFORMED` | p08 未发请求；p09 要求 p04～p08 全部 PASS，p10 要求 p09 |

根因分类与修复（修复层级为开发机，未在 Win7 验证）：

| 现象 | 分类 | 依据 | 修复 |
|---|---|---|---|
| p04 `PRODUCT_BUSY` | 套件竞态，已确认 | Turn 已结束，快照 `controls.canStop` 仍为 true，驱动立即抛错 | `submit` 先等输入框可点；`runPrompt` 先等空闲 |
| B2-BG-01 `rejected=0` | 套件判据缺陷，已确认 | 产品拒绝了第 4 个启动（`status:"failed"`，上限 3）；判据对转义 JSON 里的 `status` 不匹配 | 判据读解析后的 `data.result`；真实事件上旧判据返回 false、新判据返回 true |
| B2-BG-02 `failed_flags=[false,true,false,false]` | 套件判据缺陷，已确认 | 未知句柄返回 `A9_MANAGED_HANDLE_UNKNOWN`；错误码名单没有 `UNKNOWN`，内嵌错误也未被识别 | 同上，按解析后的 `error` 与 `status` 判 |
| B2-BG-03 `residue=1` | 原因 `UNKNOWN` | 只记了个数，没记是哪一条、什么状态 | 20 s 沉降轮询；记录首次读取、每次读取、残留项（句柄、状态、归属）和全部事实 |
| B2-S06 刷新后 2 次、重启后 0 次 | 原因 `UNKNOWN` | 只有计数，无页面文字或截图；渲染器里同一文本还出现在工具结果详情 | 判定范围调整 1；等待最多 15 s 再计数；记录位置、流摘录和刷新、重启后的截图 |
| B2-CONT-03-A02 的 `mode_diagnostics` | 套件顺序缺陷，从代码确认 | 产品只在启动时读一次模式文件；驱动在启动后才截断，只走到 `A9_CONTINUE_MODE_DRIFT` | 冒烟脚本在启动该模式前损坏文件，退出后还原原字节；驱动记录启动时文件是否已损坏 |
| p05 `TARGET_MISMATCH:in_job` | 原因 `UNKNOWN` | 两个取值都被拒，说明实际值不是布尔；重试同一路径通过 | `IsProcessInJob` 重试 5 次并记录次数和 Win32 错误；拒绝时回显实际身份；`controller-identity.json` 增加两个字段 |

判定范围调整（负责人 2026-10-13 同意）：

| 项 | 原判定 | 新判定 | 依据 |
|---|---|---|---|
| B2-S06 | 整页文本里每条输出恰好 1 次 | 实时输出块 `pre.shell-live-output` 里每条输出恰好 1 次，且块数为 1；整页计数只记录 | 渲染器每个工具调用只建 1 个实时输出块；同一文本还出现在工具结果详情（`a9-workbench.js` 的 `tool_output` 与 `tool_end` 分支）。2 次的来源在 Win7 上 `UNKNOWN`，由新增位置记录确认 |
| B2-UI-02 | 四种布局的输入框、发送钮、续做卡片在所有行都可达 | 抽屉打开的行判抽屉关闭控件可达；输入框与卡片在无抽屉的行里判；窗格状态未达到的行不能判 PASS | 开发机静态页观察（浏览器窗格加桩 API，不是 Electron，也不是 Win7）：宽度 1093 px 且检查器打开时，输入框被背板遮挡，发送钮被检查器遮挡；背板与抽屉由渲染器 CSS 在 1200 px 以下启用 |

p07～p10 同类缺陷扫描（开发机，读代码）：

- p08 布局探针的窗格切换用了错误的判断条件：左栏标签相反，宽屏下检查器从未真正打开。已改用 `aria-expanded`，并在每行记录实际状态。
- p07、p08 中审计失败后的第二次提交是观测本身，保持直接点击，新增记录输入框状态。
- p09、p10 与 `canStop` 的另外 3 处等待（轮询，不是一次读取）：未发现同类缺陷，未改。
- p07～p10 从未在 Win7 运行，其中是否有其他缺陷 `UNKNOWN`。

开发机检查（绑定 `f672f518…`）：契约 jest 73 通过，其中新增 8 个用例；`node --test` 120 通过；`verify:quick` 退出 0；两个 shell 测试文件 jest 共 116 通过；`docs:check` 通过；`git diff --check` 无输出。6 项变异检查各被拦住：判据忽略解析结果、抽屉行按无抽屉行判、S06 忽略块数、残留忽略 `cleanupRequired`、冒烟脚本不还原模式文件、冒烟脚本不损坏模式文件。改动 5 个文件，+382/−48，均在 §6.1 路径内；产品代码未改。未在 Win7 实机验证。

未知与未验证：

- B2-BG-03 的残留项、B2-S06 的 2 次与 0 次、p05 `in_job` 偶发拒绝：原因 `UNKNOWN`，由预演 5 的新记录确认。
- 启动前损坏模式文件后，Win7 上产品是否返回 `A9_MODE_SELECTION_REQUIRED`：`UNKNOWN`。开发机的运行时测试已证明“先损坏、再创建运行时”会得到该结果。
- 抽屉遮挡的观察来自开发机静态页，Electron 22 与 Win7 上的命中测试结果 `UNKNOWN`。
- p07～p10 首次上 Win7 时是否暴露其他套件缺陷：`UNKNOWN`。
- KL-3 仍有效；产品修复须另立任务书。ZIP 上传中断原因 `UNKNOWN`。

执行偏差与披露：

- R3 的第一版上传脚本对 Win7 端不存在的文件用了续传命令，空转 14 次，没有字节写入。
- 上传到 25329664 字节时，大小查询的 ssh 挂起 7 分钟，执行代理手动结束；脚本把“查询失败”当成“文件不存在”，改走全新上传，覆盖了已传的部分。随后旧 sftp 进程（pid 95797）没有响应 SIGTERM，与新的续传循环同时写同一文件约 1 分钟，执行代理用 SIGKILL 结束它。脚本已重写为“仅在确认文件不存在时才新传，查询失败则重试查询”。最终以 Win7 端 `certutil` 复算为准，11 个文件逐项一致。
- p05 第 1 次因 `TARGET_MISMATCH:in_job` 被拒；账本无条目，执行代理按同一 R5/R6 路径重试 1 次，再被拒则暂停。
- p07 被守卫拒绝后，执行代理未对 p07、p08 再发请求。守卫没有“记录根因后解除”的机制，只对当次运行有效。

预算：预演 4/5（预演 5 是最后一次）；账本消耗 6 个请求，总计 15/64；8 小时自 2026-10-13T14:33:16Z 重新计时，到 22:33:16Z；其余规则不变（每次预演单独授权文件与 SHA-256 同意、每次运行 ≤16 个请求、≤7200 秒、同一失败两次暂停、修复只在 §6.1 的 20 个路径、传输前报备哈希）。窗口至 2026-10-16T06:59:59Z。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并。预演 5 须有新构建的包、新授权文件和负责人对其 SHA-256 的同意。

### 6.21 预演 5 执行记录与 p03 提交等待缺陷（2026-10-13）

结论：预演 5 在 Win7 实机完成。p01、p02 通过；p03 失败，失败类别 `DRIVER_CHAIN_A_FAILED`；p04～p10 因前置 p03 未通过为 `NOT_PERFORMED`。失败原因是套件缺陷，由预演 4 修复轮（`f672f518…`）新加的“提交前等待发送键可用”引入，不是产品断言失败。预演次数 5/5 已用完；开发机修复已本地提交为 `a4816779…`（未推送），未在 Win7 验证。
证据层级为 Win7 实机（预演，`REHEARSAL_NOT_ELIGIBLE`），绑定源提交 `767c6f3e…`、ZIP `c2475e42…`、授权文件 `72eb3b3d…`、运行编号 `82f275a9`。开发机修复的验证层级为开发机，绑定 `a4816779…`。Win7 验收、正式执行、Win10 均 `NOT_PERFORMED`。

负责人原话：“批准，授权文件 SHA-256 72eb3b3d… 同意，开始预演5”。

| 步骤 | 时间（UTC） | 结果 |
|---|---|---|
| R1 只读复核 | 15:25:21Z | 机器名 `dccs-chaizl-PC`；`agent` 在控制台会话 2 运行中；C: 剩余 881955151872 字节；新根不存在；旧根 `0f3591ba`、`79a32916`、`d254bfcb`、`dbd8df63` 仍在；进程表 103 行（含表头），无 `electron`、`spike02`、`node`、`powershell` |
| R2 建根 | 15:25:32Z | 根 `C:\A9-W43\run\82f275a9` 与子目录 `data deploy evidence work`（`work` 下 `package external tasks logs`）；`agent` 权限为修改（见执行偏差） |
| R3 传输 | 15:26:02Z～15:27:49Z | 10 个小文件经 scp；ZIP 经 sftp 一次 `put` 完成，101574774 字节，68 秒，无中断；15:28:37Z Win7 端 `certutil` 复算 11 个文件与开发机逐项相同 |
| R4 展开 | 15:28:46Z | EXTRACT_PASS，800 个文件；冒烟脚本含 `process.noAsar = true;` 与 `own_pids_excluded`，驱动含 `evaluateStreamedOnce` 与 `continueModeGuard` |
| R5/R6 阶段 | 15:29:05Z～15:31:37Z | p01～p03 各注册一个计划任务、运行、删除；每次运行前核对机器名与 `agent` 会话，计划任务回读 11 项全部相同 |
| R7 取回 | 15:33:25Z～15:41Z | Win7 端 evidence 122 个文件已算哈希（含驱动用的 electron 副本）；整棵树取回开发机并逐项复算，0 个不一致，0 个缺失 |
| R8 后飞行 | 15:41:27Z | 进程表 104 行，无 `electron`、`spike02`、`node`、`powershell`；无 A9W43 任务；`agent` 在控制台会话 2；运行根 `82f275a9` 与旧根全部保留 |

| 阶段 | 结果 | 依据 |
|---|---|---|
| p01 环境与身份 | PASS，5/5 | `stale_processes=0 of 103`；`in_job=false`；electron 22.3.27，abi 110 |
| p02 包完整性 | PASS，4/4 | 授权文件 `72eb3b3d…`；清单文件 799、ZIP 条目 800、不一致 0 |
| p03 最短链路 | FAIL，`DRIVER_CHAIN_A_FAILED` | B2-CH-01-START 的 2 个断言 PASS；其余 10 个断言 `NOT_PERFORMED`；`chain_a` 在第一次提交前异常退出，退出码 1，33881 ms；错误 `TIMEOUT:composer ready` |
| p04～p08 | `NOT_PERFORMED` | 前置 p03 未通过；请求脚本的前置检查不允许；本次没有发请求验证拒绝 |
| p09 | `NOT_PERFORMED` | 前置是 p04～p08 全部 PASS |
| p10 | `NOT_PERFORMED` | 前置是 p09 PASS |

根因（套件缺陷，从代码和证据确认）：

| 项 | 内容 |
|---|---|
| 现象 | 驱动 `submit` 在 `waitFor(composerReady, 30000)` 等了 30 秒，期间没有新的 IPC 调用，随后超时 |
| 原因 | `composerReady` 要求 `send.disabled === false`；渲染层 `canSubmit()` 要求输入框非空（`a9-workbench.js:186`～`196`）；`submit` 在输入文字之前就等待，空输入框时发送键必然禁用 |
| 为什么预演 3、4 没出现 | 预演 3、4 的旧 `submit` 没有这个等待；预演 4 记录了第一个提示的 `a9.turn.submit` |
| 为什么开发机没发现 | 契约测试 `a9-batch2-contract.test.ts:863` 只比对源码字符串，并把 `waitFor(composerReady` 固定为期望 |
| 影响 | 驱动里 16 处 `submit(...)` 调用，覆盖 p03～p08；2 处 `submitRaw('b2:s01')` 不等待，不受影响 |
| 未记录 | 超时那一刻的页面 DOM 状态没有记录，该状态 `UNKNOWN`；其他会让发送键禁用的原因（工作区、模式、Provider 探测）在预演 3、4 中不阻止提交，本次没有相反证据 |
| 不属于 | KL-1、KL-2、KL-3；同类失败 0 次 |

开发机修复（本地提交 `a4816779…`，未推送，未在 Win7 验证）：

- 提交 `a4816779…` 在 `767c6f3e…` 之上改 2 个文件，均在 §6.1 路径内：`src/shell/tests/product/a9-batch2-driver-entry.cjs`（+14/−6）、`src/shell/tests/product/a9-batch2-contract.test.ts`（+87）。产品代码未改。
- `submit` 改为三步：等输入框打开（发送键未隐藏、输入框未禁用）；输入文字并派发 input 事件；等发送键可用后点击。`composerReady` 删除；每次等待超时都带 `composer={send_hidden,send_disabled,prompt_disabled}`。
- 新测试在 vm 中运行从 `a9-workbench.js` 切出的真实 `canSubmit`、`syncComposer`、`resizeComposer`，再对同一页面运行从驱动源码切出的 `waitFor` 与 `submit`：空输入框发送键禁用、输入后可用；`submit` 对空输入框恰好点击一次；Turn 运行中先等后提交；阻塞模式不点击且超时带状态。
- 变异检查：改回“先等发送键再输入”，3 项测试失败；已还原。
- 检查（开发机，Node 20）：`node --test` 120 通过；`verify:quick` 退出 0；两个 shell 测试文件 jest 120 通过（contract 77、package-runtime 43）；`src/runner/dist` 已还原。

未知与未验证：

- p07～p10 从未在 Win7 运行，其中是否有其他套件缺陷 `UNKNOWN`；p07、p08 的点击路径（含 `stop_journey` 的 `cancel-task`）未在 Win7 运行过。
- 预演 4 遗留的 `UNKNOWN`（B2-BG-03 残留项、B2-S06 的 2 次与 0 次、p05 的 `in_job` 偶发拒绝、启动前损坏模式文件后 Win7 的行为、抽屉在 Electron 22 上的命中测试）本次没有运行到，仍为 `UNKNOWN`。
- 预演 4 修复轮的控制器改动（`in_job` 重试、拒绝时回显身份）在 p01～p03 的三次运行中读得 `in_job=false`，没有出现 `TARGET_MISMATCH`；修复轮对驱动的其余改动没有被运行到。
- KL-3 仍有效；任何 Alpha 2 结论都必须带上它。

执行偏差与披露：

- R2 建根时先授予 `agent` 完全控制，随后用 `/grant:r` 改为与预演 4 相同的修改权限，最终根目录 `agent:(OI)(CI)(M)`。原因：R2 的原始命令未留存，由预演 4 输出重建。
- R3 第一次启动的上传脚本把“空目录列表”判为查询失败，只重试查询，没有写入字节；已改为“列表带汇总行且无 zip 行才算确认不存在”后重启。
- 一条本地命令里的 `echo` 在 zsh 报错，p03 未在那次调用启动；执行代理只读核对 Win7（无任务、账本只有 p01、p02、会话正常）后单独启动 p03。没有 Win7 写动作发生在这次误操作里。
- 第一次 `certutil` 复算命令因本地引用错误只返回“参数太多”，没有读取哈希；只读命令，已重跑，结果见上表。
- 本节写成时，R1、R2、R4 的命令由预演 4 的输出重建，没有预演 4 的逐字命令留存。

预算：预演 5/5（Q2 B 放宽后的上限）已用完；账本消耗 3 个请求（p01～p03），总计 18/64；8 小时自 2026-10-13T14:33:16Z 起算，到 22:33:16Z，截至 R8 用 1 小时 8 分；窗口至 2026-10-16T06:59:59Z。再开预演 6 需要负责人另行放宽、新构建的包、新授权文件和对其 SHA-256 的同意；放宽见 §6.22。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并。

### 6.22 预演 6 放宽与计时矛盾（2026-10-13）

结论：负责人同意把预演放宽到第 6 次，并同意提交预演 5 的修复与文档。8 小时上限已在回复前到期，计时规则待负责人裁决；裁决前不做任何写类 Win7 动作。
证据层级为文档登记（开发机），不是新的 Win7 证据；绑定 `a4816779…`。

负责人原话：“同意”。该回复答的是“是否同意放宽到第 6 次预演，并提交这 5 个文件？”（5 个文件：本节所在任务书、`docs/STATUS.md`、`docs/STATUS_LOG.md` 加预演 5 修复的 2 个文件）。回复时间戳 `UNKNOWN`；执行代理在 2026-10-13T23:58:40Z 读到回复后首次取时。

| 项 | 内容 |
|---|---|
| 预演次数 | 最多 6 次；预演 6 是最后一次；已用 5 |
| 请求总数 | 上限仍为 64；已消耗 18；预演 6 最多再用 10 个，总计最多 28 |
| 每次运行 | ≤16 个请求、≤7200 秒；每次预演单独授权文件，负责人对其 SHA-256 回复同意后才可写类 Win7 动作；同一失败两次即暂停；修复只在 §6.1 的 20 个路径；传输前报备哈希 |
| 窗口 | 至 2026-10-16T06:59:59Z，不变 |
| 8 小时上限 | 预演 5 的放宽规定“自 2026-10-13T14:33:16Z 起算，到 22:33:16Z”；该时刻已过，本次回复没有重述计时 |

矛盾上报（`CLAUDE.md` 行为规则 2）：负责人批准的选项 A 要求预演 6，而 Q2 的 8 小时上限已到期。执行代理不自行延长，不就近取一。预演 6 的构建、授权文件生成和开发机完整性演练是本地动作，不受该上限限制，照常进行；R1 只读复核前不动 Win7。裁决方式：负责人在回复预演 6 授权文件 SHA-256 时，同时说明 8 小时是否自该回复时刻重新计时（预演 5 的放宽即按此办理，推荐沿用）。

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
| G2 / S04–S05 | PowerShell 下 UTF-8 跨块、CRLF/无换行（CP936/UTF-16LE 仅记录，不参与判定，KL-5）；限额、跨块秘密、背压、取消、实际 Job 回收 | 原始字节/文本、截断计数、秘密负例、同实例进程树/清理结果 |
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

### 6.23 预演 6 执行记录、第 7 次预演放宽与套件修复轮（2026-10-14）

结论：预演 6 在 Win7 实机完成后暂停。p01～p03 通过；p04、p05 失败；p06～p10 为 `NOT_PERFORMED`。5 个失败项里，4 项已确认是套件缺陷，1 项（S06 重启）原因 `UNKNOWN`。负责人选择放宽到第 7 次预演并开修复轮；修复已本地提交为 `2c06317c…`（未推送），codex 复核发现 1 个 P1、4 个 P2，第二修复轮见 [§6.24](#624-codex-复核第-1-轮结果与第二修复轮2026-10-14)。
证据层级为 Win7 实机（预演，`REHEARSAL_NOT_ELIGIBLE`），绑定源提交 `bd09b1aa…`、ZIP `3e015527…`、授权文件 `0b4ad365…`、运行编号 `37632497`。修复的验证层级为开发机，绑定 `2c06317c…`，未在 Win7 验证。Win7 验收、正式执行、Win10 均 `NOT_PERFORMED`。

负责人原话：预演 6 授权文件为“批准，授权文件 SHA-256 0b4ad365… 同意，开始预演6”（2026-10-14T00:39:37Z）；8 小时计时为“用已有做法，规则最少变动”（00:38:44Z，登记为：自负责人回复授权文件 SHA-256 时重新计时 8 小时，预演 6 到 2026-10-14T08:39:37Z）；放宽与修复为“选A，同意放宽到第7次预演并开修复轮，修复结果发送给codex进行审阅，codex采用gpt6.1Sol xhigh 非fast模式”。

| 步骤 | 时间（UTC） | 结果 |
|---|---|---|
| R1 只读复核 | 00:39:37Z | 机器名 `dccs-chaizl-PC`；`agent` 在控制台会话 2 运行中；C: 剩余 881283289088 字节；旧根 `0f3591ba`、`79a32916`、`82f275a9`、`d254bfcb`、`dbd8df63` 在，新根不存在 |
| R2 建根 | 00:39:46Z | 根 `C:\A9-W43\run\37632497`；`agent` 权限 `(OI)(CI)(M)`，一次 `/grant:r` 到位 |
| R3 传输 | 00:39:54Z～00:40:57Z | 10 个小文件经 scp；ZIP 经 sftp 一次 `put`，101577989 字节，无中断；Win7 端 `certutil` 复算与开发机逐项相同 |
| R4 展开 | 00:41:09Z | EXTRACT_PASS，800 个文件；包内驱动含三步 `submit`，`composerReady` 出现 0 次 |
| R5/R6 阶段 | 00:41:24Z～00:48:32Z | p01～p05 各注册一个计划任务、运行、删除（五个删除均成功）；p04、p05 之间是分析暂停 |
| R7 取回 | 00:48:52Z～00:49:15Z | Win7 端全树哈希 233 个文件（SUM_TREE_PASS）；开发机取回 150 个并复核，0 个不一致；83 个 `driver-electron` 文件未取回，只有 Win7 端哈希 |
| R8 后检 | 00:49:15Z | 进程表 104 行，无 `electron`、`spike02`、`node`、`powershell`、`a9-batch2` 进程；`agent` 在控制台会话 2；运行根与旧根全部保留 |

| 阶段 | 结果 | 依据 |
|---|---|---|
| p01 环境与身份 | PASS，5/5 | |
| p02 包完整性 | PASS，4/4 | 授权文件 `0b4ad365…`；清单文件 799、ZIP 条目 800、不一致 0 |
| p03 最短链路 | PASS，12/12 | 预演 5 的提交等待缺陷在 Win7 上修复生效；`B2-CH-02-A01`：`first_ipc_ms=851; ipc_frames_max=6; dom_frames_max=0`，KL-3 再现 |
| p04 流式 | FAIL，`ASSERTION_FAILED` | S01（首个 tick 可见 1016 ms，领先 3796 ms）、S02（frames=10）、S03（observations=733，violations=0）PASS；S03T、S04、S05-A01、S05-A02 FAIL |
| p05 会话与后台 | FAIL，`ASSERTION_FAILED` | BG-01、BG-02、BG-03 PASS；S06 刷新路径 PASS，重启路径 FAIL |
| p06～p08 | `NOT_PERFORMED` | p04、p05 连续两次同类失败，请求脚本的守卫 `SAME_CLASS_FAILURE_TWICE_DIAGNOSE_FIRST` 会拒绝 p06；执行代理暂停，没有发请求验证拒绝，没有绕过守卫 |
| p09 | `NOT_PERFORMED` | 前置是 p04～p08 全部 PASS |
| p10 | `NOT_PERFORMED` | 前置是 p09 PASS |

失败项分类（证据：Win7 取回的阶段证据与数据库副本；分类在开发机作出）：

| 失败项 | 观察 | 分类 | 依据 |
|---|---|---|---|
| S03T 审计 | `tool_starts=2`，请求 16→19→20 | 套件缺陷 | 审计 Turn 的 `outcome` 为 `stuck`，37 ms；夹具三次相同参数的 read 触发产品的重复调用检测（`LoopDetector`，阈值 3）。审计硬停止行为没被检验，`UNKNOWN` |
| S04 编码 | `crlf=false`，帧数 4、4、8、11 | 套件缺陷 | `runPrompt` 以对话内全部结束事件判终态，第 2 个起的提示提交后立即返回；四个提示另外共用 call id `b2-s04`。产品的编码行为 `UNKNOWN` |
| S05-A01 脱敏 | `leaks` 三处全 true | 套件缺陷 | 命令文本含密钥前 16 个字符，判据匹配全文或前 10 个字符。产品对输出的脱敏 `UNKNOWN` |
| S05-A02 取消后新增进程 | `new_processes_after_cancel=1` | 套件缺陷 | 新进程是驱动自己的进程列表命令启动的 `WMIC.exe`（pid 6292，父进程 7492 即驱动）；树 4→6→4 |
| S06 重启 | `restart_once=false`，页面 15 s 内显示 `b2:bg-ready-fail`，快照已报告被测对话为活动对话 | `UNKNOWN` | 驱动只调预加载接口切换对话；产品页面自己的切换函数还会刷新快照与事件。套件走了非用户路径，产品在“只调接口”场景的页面行为 `UNKNOWN`；第一部分同样只调接口却成功，原因 `UNKNOWN`；与 KL-3 是否同源 `UNKNOWN` |

修复轮（开发机，本地提交 `2c06317c…`，未推送，未在 Win7 验证）：

- 提交在 `bd09b1aa…` 之上改 3 个文件，均在 §6.1 路径内：`a9-batch2-fixtures.cjs`、`a9-batch2-driver-entry.cjs`、`a9-batch2-contract.test.ts`（+296/−12）。产品代码未改。
- S03T：`b2:audit-three` 读三个不同文件（`AUDIT_READ_FILES`），驱动先创建它们。
- S04：`runPrompt` 提交前先数结束事件，再等多出一个；四个提示各用独立 call id。
- S05-A01：`secret-split` 把密钥切成 4 字符一段，由 Shell 在运行时拼接（PowerShell 引号段，cmd 用 `^`）。PowerShell 与 cmd 语法只做了文本检查，没有在 PowerShell 或 cmd 上运行，`UNKNOWN`。
- S05-A02：`wmicRows` 排除“名称为 wmic.exe 且父进程是驱动自己”的行。
- S06：`activateConversation` 先点侧栏会话行并等页面标记为当前；标题不唯一或未列出时才回退到接口；`sessionRestart` 记录切换方式和前后侧栏行。
- 测试：新增 16 个用例，在 vm 中对假页面运行驱动与夹具的真实代码，并带反例；对真实源码做 8 个变异，各被至少一个用例拦住，已还原并核对逐字节相同。
- 检查（开发机，Node 20）：`node --test` 120 通过；`verify:quick` 退出 0；两个 shell 测试文件 jest 136 通过（contract 93、package-runtime 43）；`diff --check` 无输出；`src/runner/dist` 已还原。

codex 复核（第二段第一轮）：负责人要求模型 `gpt6.1Sol`、推理强度 `xhigh`、非 fast。本机 codex 配置里的模型标识是 `gpt-6.1-sol`；`codex exec --strict-config -m gpt-6.1-sol -c model_reasoning_effort="xhigh" -c service_tier="default"` 经一次只读试跑被接受。复核启动于 2026-10-14T01:23:58Z，复核根 `/private/tmp/a9-33-codex-review-root-5`，提示与交接包 `docs/reports/2026-10/a9_33_independent_review_handoff_rehearsal6_fixes_2026-10-14.md`；交接包命令在全新目录整体实测通过（384 秒）。结果见 [§6.24](#624-codex-复核第-1-轮结果与第二修复轮2026-10-14)。

未知与未验证：

- p06～p10 的驱动代码，除预演 4 运行过一次的 p06 外，从未在 Win7 运行；其中是否有其他套件缺陷 `UNKNOWN`。
- 预演 6 之前遗留的 `UNKNOWN`（启动前损坏模式文件后 Win7 的行为、抽屉在 Electron 22 上的命中测试等）本次没有运行到。
- KL-1、KL-2、KL-3 仍有效；任何 Alpha 2 结论都必须带上 KL-3。

执行偏差与披露：

- R8 的任务核验：`r8/tasks-query.txt` 的命令参数写错（`/NH` 与列表格式冲突），只返回错误，没有任务列表。预演 5 的 R8 同样如此；预演 5 记录里的“无 A9W43 任务”当时的依据只有逐阶段 `schtasks /delete` 的成功输出。预演 6 补做只读核验：`schtasks /query /fo csv` 报“无法加载列资源”；改用 COM 接口（`-EncodedCommand`，不落盘）于 00:55:17Z 列出根目录任务，共 45 个，名称以 A9W43 开头的 0 个；其余 45 个是历史遗留，未触碰。
- 8 小时计时：负责人的答复“用已有做法，规则最少变动”没有提到授权文件 SHA-256；执行代理没有把它当作对 SHA-256 的同意，等到负责人另行回复 `0b4ad365…` 后才开始写类 Win7 动作。

预算与计时：预演 6/6 已用；放宽后预演最多 7 次，预演 7 是最后一次，仍须单独授权文件和负责人对其 SHA-256 的同意；账本消耗 5 个请求（p01～p05），总计 23/64；预演 7 最多再用 10 个，总计最多 33；每次运行 ≤16 个请求、≤7200 秒；同一失败两次即暂停；修复只在 §6.1 的 20 个路径；传输前报备哈希；窗口至 2026-10-16T06:59:59Z 不变。预演 7 的 8 小时：负责人未另行说明，沿用 §6.22 的做法（自负责人对预演 7 授权文件 SHA-256 的回复起算 8 小时），请在批准授权文件时确认。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并。

### 6.24 codex 复核第 1 轮结果与第二修复轮（2026-10-14）

结论：codex 对 `2c06317c…` 的复核报告 1 个 P1、4 个 P2，执行代理逐条对源码核实，5 条全部成立。负责人选 A 开第二修复轮；修复已本地提交为 `9dd3b165…`（未推送）；codex 复审发现 2 个 P2（N1、N2），不建议进入预演 7 授权评审；负责人选 A 开第三修复轮，修复已本地提交为 `6679ef30…`（未推送）；codex 第 3 轮复审发现 1 个 P2（N1 残余），负责人回复“B”：N1 残余登记为已知限制 KL-4，不开第四修复轮，进入预演 7 授权评审。预演 7 未授权、未构建。
证据层级为开发机，绑定 `2c06317c…`（发现）与 `9dd3b165…`（修复）；读取预演 6 证据的结论为 Win7 实机（预演，非验收证据）。Win7 验收、正式执行、Win10 均 `NOT_PERFORMED`。

负责人原话：“选A，开第二修复轮，修复结果发送给codex复审”（2026-10-14）。

codex 第 1 轮：模型 `gpt-6.1-sol`，推理强度 `xhigh`，`service_tier` 为 `default`（非 fast）；2026-10-14T01:23:58Z 启动，01:57:11Z 完成，退出码 0。结论是不建议在 `2c06317c…` 上进入预演 7 授权评审。归档在 `.acceptance/a9-33-review/codex-stage2-round1-20261014/`：95 个文件，`SHA256SUMS.txt` 复核 0 个不一致；报告 SHA-256 前缀 `35f0ba0e…`。1.4 GiB 的临时复核目录与变异克隆已删除。

| 编号 | 级别 | 发现 | 执行代理核实 | 修复（`9dd3b165…`） |
|---|---|---|---|---|
| R1 | P1 | 后续驱动进程见到 Provider 已配置就不再录入密钥，S05 输出脱敏没被检验 | 成立。产品只在内存记密钥（`a9-agent-runtime.js:2258`～`2260`）；Win7 p04 库事件 129、130、134 含测试密钥前缀或全文 | `streamLimits` 以 `requireKey` 启动：快照不显示夹具地址与 `apiKey.available` 时重填表单并等密钥可用；记录不含密钥值的事实；`evaluateSecretCheck` 在密钥不可用时判 UNKNOWN |
| R2 | P2 | `runPrompt` 以最新 1000 条事件窗口内的结束事件数作基线 | 成立。`a9-persistence.ts:1488` 取最新 N 条；事件超过 1000 条后基线滑动 | 以提交前最新事件号为基线，取其后第一个 `turn_started` 命名目标 Turn，只认该 Turn 的结束事件；s02、s05-secret 改用 `runPrompt` |
| R3 | P2 | 按 `标题，` 前缀匹配侧栏行 | 成立。标题“基础”会命中“基础，附录，…”行 | 按行内标题元素的文本整体比较；页面行数与快照不符时抛 `A9_BATCH2_DRIVER_CONVERSATION_ROW_COUNT` |
| R4 | P2 | 测试桩恒返回第一次轮询，变异 M09 存活 | 成立 | 桩改为随提交和轮询增长、只返回最新 1000 条的会话 |
| R5 | P2 | UTF-8 夹具切点落在 ASCII 字节 | 成立；执行代理另核实 crlf 切点 22 也不在 CR 与 LF 之间 | `ENCODING_CUTS`：utf8 切在“文”内，utf16le 切在“文”的 UTF-16 单元内，cp936 切在“中”内，crlf 切在 CR 与 LF 之间；`selfCheck` 调用 `encodingCutProblems` |

范围决定（执行代理作出，待复审）：R1 的密钥重录入只在 `streamLimits` 启用。理由：`configureProvider` 在有后台进程或进行中的 Turn、审批时拒绝配置，并会重验已落盘的 Turn；p05～p08 的重启与恢复模式从未带着密钥重录入在 Win7 运行。夹具服务器对探测请求不计数、不写日志（`a9-batch2-smoke.cjs:315`～`323`），所以重录入不改变请求计数。

第二修复轮（开发机，本地提交 `9dd3b165…`，父 `2c06317c…`，未推送，未在 Win7 验证）：

- 3 个文件，+424/−54，均在 §6.1 路径内：`a9-batch2-fixtures.cjs`、`a9-batch2-driver-entry.cjs`、`a9-batch2-contract.test.ts`。产品代码未改。累计相对 `7e96f561…`：20 个文件，+8252/−31。
- 测试：contract 93 → 129（新增 36 个，含 R1、R2、R3、R5 的反例）；package-runtime 43 不变。
- 变异：24 个（驱动 19、夹具 5），23 个被拦住；存活的 D16 是点击前的冗余行数保护，前一步已核对行数。
- 检查（开发机，Node 20）：`node --test` 120 通过；`verify:quick` 退出 0；jest 172 通过；`diff --check` 无输出；`src/runner/dist` 已还原。交接包三个代码块在全新目录整体实测通过（397 秒）。
- 开发机另做一项核对：把四种夹具按新切点喂给 `src/runner/dist/stream-output.js` 的 `SafeOutputStream`，拼接结果均等于夹具文本，含 `\r` 与 `\n` 分在两块。

codex 第 2 轮复审（2026-10-14T02:31:30Z 启动，03:04:48Z 完成，退出码 0；参数同第 1 轮）：0 个 P0、0 个 P1、2 个 P2。R1～R5 的原问题在开发机范围均已关闭；结论仍是不建议在 `9dd3b165…` 上进入预演 7 授权评审，应先关闭 N1 并补足 N2。归档在 `.acceptance/a9-33-review/codex-stage2-round2-20261014/`：137 个文件，`SHA256SUMS.txt` 复核 0 个不一致；报告 SHA-256 前缀 `fda1d91e…`。1.4 GiB 的临时复核目录与变异克隆已删除。交接包 `docs/reports/2026-10/a9_33_independent_review_handoff_rehearsal6_fixes_round2_2026-10-14.md`（未提交）。

| 编号 | 级别 | 发现 | 执行代理核实 |
|---|---|---|---|
| N1 | P2 | `ensureProvider` 点击应用后等页面文字为 `tool_calling` 和密钥可用，两项都没有绑定本次应用结束；驱动在配置与探测完成前就返回 | 成立。运行时在探测前就设置密钥（`a9-agent-runtime.js:1616`，探测在 `:1667` 后）；重启后页面文字是恢复的旧探测结果；渲染层在 `configureProvider` 返回并刷新快照后才解除应用按钮（`a9-workbench.js:2696`～`2712`），按钮在点击同一同步段内置为禁用。codex 的探针：驱动返回时应用未完成，之后探测变为 `unavailable`。Win7 是否触发 `UNKNOWN` |
| N2 | P2 | 新的 Provider 测试桩不执行表单代码，删除 `.click()` 的变异存活（修复组 52 个用例全部通过） | 成立。桩按源码字符串识别“应用”并立即给出成功探测 |

codex 的其他结论：5 项原问题（R1～R5）的修复位置与用例成立；交接包 24 个变异加新增 6 个、另加 X1 共 31 个，30 个被拦，存活 D16（冗余保护）与 X1（即 N2）；沙箱内 jest 有 7 个用例因 `listen EPERM` 失败（交接包写 6 个，实际是 7 个，逐项列出；172 个用例在无沙箱环境通过）。R2 的退化分支（开始事件移出窗口时接受基线之后任意结束事件）是已知弱点，当前串行路径是否可达没有证据，codex 未列为缺陷，建议目标 Turn 在轮询间保留。

负责人回复“选A，开第三修复轮，修复结果发送给codex复审”。执行代理在 §6.1 的 20 个路径内完成修复，本地提交为 `6679ef30…`（父 `9dd3b165…`，2 个文件 `a9-batch2-driver-entry.cjs`、`a9-batch2-contract.test.ts`，+154/−30，未推送，产品代码和夹具未改）：

| 项 | 修复 |
|---|---|
| N1 | `ensureProvider` 点击后等应用按钮既不禁用也无 `aria-busy`，表单错误文字非空时抛出并带出文字，按钮释放后探测文字必须是 `tool_calling`；之后才核对密钥可用。等待超时消息带出表单错误与探测文字 |
| N2 | 契约测试的 Provider 桩改为小型 DOM，用 `vm` 执行驱动的真实语句：点击禁用按钮、立即登记密钥、若干次调用后才结束应用；可配置旧探测文字、新探测失败、表单错误、按钮卡住。新增 6 个用例（含 2 个反例），改写 1 个用例 |
| R2 目标 Turn 保持 | `runPrompt` 内的闭包变量 `turnId` 在首次见到开始事件时命名并保持；`targetTurnEnd(evts, baseline, turnId)` 只在没有任何一次轮询见过开始事件时才退化 |

开发机验证（绑定 `6679ef30…`）：`node --test` 120 通过；jest 180 通过（contract 137、package-runtime 43，较第二修复轮 +8 个用例）；`verify:quick` 通过；`diff --check` 无输出。32 个变异中 31 个被拦住，存活的是 E6（`busy` 去掉 `aria-busy` 条件，渲染层同时设置 `disabled` 与 `aria-busy`，判定为等价）。交接包 `docs/reports/2026-10/a9_33_independent_review_handoff_rehearsal6_fixes_round3_2026-10-14.md`（未提交）的命令在全新目录整体实测通过（382 秒）。未在 Win7 实机验证。

codex 第 3 轮复审（2026-10-14T03:54:56Z 启动，04:24:06Z 完成，退出码 0；参数同第 1、2 轮）：0 个 P0、0 个 P1、1 个 P2（N1 残余）。N2 与 R2 目标 Turn 保持已在开发机关闭，N1 部分关闭；结论仍是不建议在 `6679ef30…` 上进入预演 7 授权评审，应先关闭 N1 残余。归档在 `.acceptance/a9-33-review/codex-stage2-round3-20261014/`：167 个文件，`SHA256SUMS.txt` 复核 0 个不一致；报告 SHA-256 前缀 `20065f7a…`。1.4 GiB 的临时复核目录与变异克隆已删除。

| 编号 | 级别 | 发现 | 执行代理核实 |
|---|---|---|---|
| N1 残余 | P2 | 按钮释放不保证快照刷新成功。`refreshSnapshot()` 遇到失败响应或异常只显示全局错误并返回 `null`，`applyProvider()` 不检查返回值，`finally` 释放按钮；驱动只看按钮、表单错误和页面探测文字，后续读 Runtime 快照也只核对地址与密钥。输入“重启恢复旧成功文字、新探测失败、本次快照刷新失败”时，驱动返回且 Runtime 探测为 `unavailable`（codex 探针 `ensure_returned=true`、`page_probe=tool_calling`、`runtime_probe=unavailable`）。位置 `a9-batch2-driver-entry.cjs:552、571～577`，`a9-workbench.js:1986～2005、2704～2709` | 成立。已读源码：`refreshSnapshot` 在 `response.ok !== true` 与异常两条路径返回 `null`（`a9-workbench.js:1986～2005`），`applyProvider` 的 `await refreshSnapshot()` 不看返回值，`finally` 释放按钮（`:2704～2709`）；Runtime 快照字段 `provider.probe.classification` 存在（`a9-workbench.js:1914`）。Win7 是否触发 `UNKNOWN`；产品侧快照读取失败的发生条件未调查 |

codex 的其他结论：

| 项 | 结论 |
|---|---|
| N2 | 已关闭原问题（开发机）。E4 删除 `.click()` 后 9 项失败 |
| R2 目标 Turn 保持 | 已关闭指定弱点（开发机）。E1、E9 各失败 2 项，E8 失败 8 项，A5 失败 7 项 |
| 假设 33、35 | 成立（开发机源码） |
| 假设 34 | 不成立，即 N1 残余。假设 36 限处理器事实成立，整体耗时 `UNKNOWN` |
| 范围与白名单 | 累计 20 个路径与 §6.1 一致，本轮只改两个文件，无范围外改动 |
| 变异 | 重做 16 项（E1～E9、D16、新增 6 项），12 项被拦住，4 项存活：E6（对当前渲染层写法等价）；D16（`rows.length !== 1` 与前一次行数读取是两次异步读取，动态行漂移用例下原代码拒绝、变异点击成功，不能由前一步证明等价，需补动态行数用例，现有驱动保留严格检查）；A3（先关抽屉再等待，现有用例只核关闭次数，当前驱动未关错）；A4（`newTurnId` 取最后一个开始事件，当前串行路径第二个目标是否可达 `UNKNOWN`）。D1～D15、D17～D19、F1～F5 本轮 `NOT_PERFORMED` |
| 桩 | A6 显示：把测试桩的密钥登记移到应用结束时，只有父提交的提前返回负控失败，即桩对密钥时序不敏感；`T:2122` 仍按 snapshot 源码子串返回快照（交接包已披露） |
| 沙箱 | jest 173 通过、7 个用例因 `listen EPERM` 失败，与已知 7 个一致（604、749、782、806、1020、1607、1676 行）；修复组 60 个用例全部实际通过 |

本轮交接包把 `S05 key` 用例数写成 17→22、`S04` 写成 11→14，实际是 17→23、11→13（合计 +8 不变）；codex 启动后执行代理已更正交接包。

负责人裁决（选项 B）：执行代理提出的第四修复轮（应用结束后以 Runtime 快照的 `provider.probe.classification` 核对 `tool_calling`、补“刷新失败”反例、补 D16 动态行漂移用例）不开；codex 不做第 4 轮复审。负责人回复“B”，答的是“开第四修复轮，还是登记为已知限制直接进入预演 7 授权评审？”；回复时间戳 `UNKNOWN`。

已知限制 KL-4：

| 编号 | 来源 | 现象 | 影响 | 预演与正式执行中的处置 |
|---|---|---|---|---|
| KL-4 | codex 第 3 轮 P2（N1 残余） | 页面刷新快照失败时，`applyProvider` 仍在 `finally` 释放应用按钮；驱动只核对按钮、表单错误和页面探测文字，会接受重启后恢复的旧 `tool_calling` 文字，之后读 Runtime 快照只核对地址与密钥 | 驱动可能在 Runtime 探测为 `unavailable` 或 `chat_only` 时继续运行，后续模式的结果可能失败或失真，对各判据的影响 `UNKNOWN`。这是套件判据缺陷，不是产品缺陷。Win7 是否触发 `UNKNOWN` | 驱动不记录应用后的探测分类，该情形在报告里不能直接识别。预演 7 与正式执行中，p04～p08 出现提供方不可用类失败时，执行代理先核对页面全局错误文字与 Runtime 快照的 `provider.probe.classification`；符合则标注 KL-4，保存页面全局错误与快照，该模式的结果不计入结论，按 [§6.4](#64-停止诊断与核号)停止诊断并报告 |

未修的覆盖缺口（codex 第 3 轮信息项，不登记为已知限制，不影响已有判据）：D16（点击前行数检查与前一次行数读取是两次异步读取，缺动态行漂移用例）；A3（先关抽屉再等待，现有用例只核关闭次数）；A4（`newTurnId` 取最后一个开始事件，当前串行路径第二个目标是否可达 `UNKNOWN`）；`T:2122` 的 snapshot 桩仍按源码子串返回快照。

本裁决不改变的事项：KL-1、KL-2、KL-3 仍有效，任何 Alpha 2 结论都必须带上 KL-3；预演 7 未授权、未构建；执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。

未知与未验证：

- 两次 `Write` 之间的 400 ms 是否使产品在 Win7 上收到两个块、切点是否落在块边界 `UNKNOWN`。
- 带密钥重录入在 Win7 上是否使 `apiKey.available` 为 `true`、`revalidatePersistedTurns` 在 p04 第三个模式是否抛错 `UNKNOWN`。
- 带密钥后产品对 S05 输出的脱敏行为 `UNKNOWN`，要等预演 7 取得。
- p06～p10 的其余驱动问题 `UNKNOWN`；KL-1、KL-2、KL-3 仍有效。

预算与计时：预演 6/7 已用；预演 7 是最后一次，仍须单独授权文件和负责人对其 SHA-256 的同意；请求 23/64，预演 7 最多再用 10 个；其余条件同 §6.23；窗口至 2026-10-16T06:59:59Z。8 小时计时同 §6.23，请在批准预演 7 授权文件时确认。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并。

### 6.25 预演 7 执行记录（2026-10-14）

结论：预演 7 在 Win7 实机完成。p01、p02、p03、p05、p06 通过；p04、p07、p08 各有失败的断言（`ASSERTION_FAILED`）；p09、p10 `NOT_PERFORMED`。第 7 次预演的预算已用完，A9-33 batch-2 未取得全部通过。
证据层级为 Win7 实机（预演，`REHEARSAL_NOT_ELIGIBLE`），绑定源提交 `0722df00…`、ZIP `9ce89f06…`、授权文件 `caf9a83c…`、运行编号 `16f6af76`。套件代码为 `6679ef30…`，修复的验证层级仍是开发机。

负责人原话：“选A，同意提交文档并构建预演7包”“批准，授权文件 SHA-256 caf9a83c… 同意，开始预演7”。回复时间戳 `UNKNOWN`；执行代理 2026-10-14T05:40:39Z 首次读到批准。第二条回复没有重述 8 小时计时，执行代理按 2026-10-14 的裁决“用已有做法，规则最少变动”（自批准授权文件 SHA-256 时重新计时 8 小时）处理，截止 2026-10-14T13:40:39Z；负责人可更正。Win7 动作 R1～R8 全部在截止之前完成，最后一次是 05:51:55Z。

| 阶段 | 结果 | 要点 |
|---|---|---|
| p01 环境 | PASS，5/5 | |
| p02 完整性 | PASS，4/4 | 799 个清单文件、800 个 ZIP 条目，0 个不一致 |
| p03 最短链路 | PASS，12/12 | B2-CH-02-A01：`first_ipc_ms=654; ipc_frames_max=6; dom_frames_max=0`，KL-3 再现 |
| p04 流式输出 | FAIL | 只有 S04 失败：`utf8=true; utf16le=false; cp936=false; crlf=true`。S03T（`tool_starts=3`）、S05-A01（密钥已配置、可用、来源 memory，三处无泄漏）、S05-A02（取消后无新增进程）在 Win7 上首次通过 |
| p05 会话与后台 | PASS | S06 刷新与重启路径、BG-01/02/03 通过 |
| p06 继续 | PASS | 首次在 Win7 运行，4 条断言通过 |
| p07 安全规则 | FAIL | 首次在 Win7 运行；只有 B2-SAFE-02 一条断言，失败 |
| p08 界面 | FAIL | 首次在 Win7 运行；B2-UI-02 PASS；B2-UI-01 九项中 7 项 PASS，2 项 FAIL |
| p09 报告、p10 后检 | NOT_PERFORMED | p09 要求 p04～p08 全部通过；p07、p08 连续两次 `ASSERTION_FAILED`，套件守卫也会拒绝。p09、p10 从未在 Win7 运行 |

三项失败的归类（证据：`.acceptance/a9-33-rehearsal/rehearsal-7/r7/`，数据库副本只读）：

| 失败 | 已确认的事实 | UNKNOWN |
|---|---|---|
| p04 S04 编码 | 产品输出事件 `text=""`、`truncated=true`、`warning=A9_OUTPUT_ENCODING_ERROR`；utf16le 第一块 3 字节、cp936 第一块 4 字节就报错。PowerShell 下 stdout 解码器是严格 UTF-8（`trusted-shell-runner.ts:587`，`stream-output.ts:63～71`），cp936 默认只对 cmd，A9-30 记 UTF-16LE 为外部选项。失败与切点无关 | 打包产品能否触达 UTF-16LE 解码选项 |
| p07 B2-SAFE-02 | 注入 `tool_end` 写失败后：文件已写入，`tool_end` 事件 0 条，之后无 Provider 请求（`requests=0->1->1`），`a9.turn.submit` 返回 `A9_AUDIT_PERSISTENCE_FAILED`；库里 Turn 行 `status=active`、`outcome_json={}`，事件只到 `tool_start`，页面文字不含该错误码。判据要求错误码出现在 `outcome_json` 或页面文字 | 套件判据过窄，还是产品未把审计失败记入 Turn 与页面 |
| p08 B2-UI-01 | 按 Enter 后 8 秒内按钮没有变忙，再 1.2 秒后 continue 事件为 0；再按 Enter 与 Space 后事件为 1。其余 7 项通过（含停止、视图返回、空格重试） | 第一次 Enter 是否送达；产品是否延迟响应 |

矛盾清单（`CLAUDE.md` 行为规则 2，等负责人裁决，执行代理不自行取舍）：

1. B2-S04 的合同文字写“UTF-8、CP936 和 UTF-16LE 跨块无损解码”，而产品在 PowerShell 下只解码 UTF-8，cp936 仅在 cmd、UTF-16LE 仅为外部选项。合同、A9-30 的设计和实测三者不一致。
2. B2-SAFE-02 合同写“必需审计失败停止 Turn，未知副作用不记为零”。产品停止了派发，但 Turn 行仍是 `active`，没有记录失败原因。该合同是否要求 Turn 行与页面带审计失败标记，合同文字没有写明。

已关闭或首次得到 Win7 证据的事项：预演 6 的 p04 四项套件缺陷（子进程误计、密钥前缀误报、S04 取错 Turn、S03T）在 Win7 上不再出现；R1 的密钥重录入在 Win7 上生效（`key_available_before_prompt=true`），p04 库内没有任何事件含 `sk-TESTONLY` 前缀；p05 的 S06 重启路径通过。

未知与未验证：

- 三项失败的归类中标 `UNKNOWN` 的部分。
- p09、p10 在 Win7 上的行为 `NOT_PERFORMED`。
- KL-4 在预演 7 中是否触发 `UNKNOWN`：p04～p08 没有出现提供方不可用类失败，驱动不记录应用后的探测分类。
- KL-1、KL-2、KL-3 仍有效；KL-3 在 p03 再现（`dom_frames_max=0`）。任何 Alpha 2 结论都必须带上 KL-3。

预算与计时：预演 7/7，预算耗尽；请求 31/64；窗口至 2026-10-16T06:59:59Z。继续预演须负责人再次放宽，且需要新的授权文件。

Win7 状态：R8 后检无残留进程，无 `A9W43*` 计划任务；旧根 0f3591ba、79a32916、82f275a9、d254bfcb、dbd8df63、37632497 未改动；新根 `C:\A9-W43\run\16f6af76` 保留。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.26 预演 7 失败分类（2026-10-14，开发机只读）

结论：B2-UI-01 归为套件缺陷，B2-SAFE-02 归为套件判据过窄，B2-S04 归为合同与产品不一致。B2-SAFE-02 与 B2-S04 的原因已在源码层定位，不是 Win7 环境问题；B2-UI-01 的原因 `UNKNOWN`，Win7 环境因素（窗口焦点、输入注入）未排除。
证据层级为开发机，绑定提交 `09fd4772…`。执行代理只读分析预演 7 取回的 Win7 证据和源码，没有访问 Win7，没有改套件代码。本节不是修复授权。
标 `UNKNOWN` 的原因，只能靠再跑一次 Win7 预演确认。

| 失败 | 归类 | 已确认的事实 | UNKNOWN |
|---|---|---|---|
| B2-UI-01 `loading_feedback`、`one_dispatch_while_busy` | 套件缺陷（首选归类，原因 `UNKNOWN`）；产品侧原因与 Win7 环境因素均未排除 | ① 驱动 IPC 日志在 05:50:16.687Z 到 05:50:26.650Z 之间没有任何调用完成记录（日志在调用返回后写入）。点击通过守卫后会启动 500 ms 一次的快照轮询（`a9-workbench.js:2340`），这与“9.96 秒内没有通过守卫的点击”一致，但完成记录的空窗不能单独排除其他路径（点击被静默提前返回的守卫挡下、调用未完成），原因 `UNKNOWN`。② 点击通过守卫后，在第一个 `await` 之前同步把按钮改成“正在继续”（`a9-workbench.js:2280` 起，标签在 `:1015`），通过守卫的点击不存在延迟响应；`continueInterruptedTask` 的守卫（`canContinue`、`state.running`、`state.continuingTaskId`）会无声返回，按钮在渲染时为启用说明三者当时为假，之后是否变化 `UNKNOWN`。③ 全局键盘处理只拦截 Ctrl+K、Ctrl+I、抽屉内 Tab 和 Esc；输入框（`:3005`）和对话操作区（`:3020`）另有局部处理，都不挂在卡片按钮上，由原生按钮处理 Enter 与 Space。④ `press()` 只在 UI-01 使用，发送 keyDown、char、keyUp，`keyCode` 是字符串 `Enter` 或 `Space`；continue 事件出现在 26.670Z 与 27.735Z；26.670Z 由额外 Enter 或额外 Space 触发，数据无法区分，27.735Z 对应的按键未单独核对，所以 Enter 与 Space 路径都不算已验证。⑤ 页面焦点在按钮上（`focus_element=BUTTON`）。 | 第一次 Enter 没有生效的原因。假设 H1：Electron 把 `char` 事件的文本取成字符串 `Enter`，按钮收不到 Enter 的 keypress。假设 H2：第一次按键发生在窗口取得焦点之前，被丢弃。额外那次 Enter 与 Space 里哪一个触发了 26.670Z 的事件，数据无法区分。开发机没有可运行的 Electron（`node_modules/electron` 无 `dist`，本机只有 Windows 的 electron.exe 压缩包），H1、H2 都无法在开发机验证 |
| B2-SAFE-02 | 套件判据过窄，另有一条产品观察 | ① `a9.turn.submit` 两次都返回 `ok=false`、错误码 `A9_AUDIT_PERSISTENCE_FAILED`（05:49:35.770Z、05:49:37.550Z，`driver-safe_rules.json`）。② `tool_end` 事件 0 条，文件已写入，Provider 请求 `0→1→1`，发送键被禁用。③ `presentAuditFailure` 只设置内存状态 `auditFailureBlock` 与 `agentStatus='failed'`，把错误码放进 IPC 返回值（`a9-agent-runtime.js:1861`），不写 Turn 行。④ 渲染层显示 `error.message`，不显示错误码（`a9-workbench.js:123`）。⑤ 驱动判据 `audit_flag_visible` 在 `outcome_json` 与整页文字里找错误码或 `auditIncomplete`，没有读 IPC 返回值；合同文字只写“必需审计失败停止 Turn，未知副作用不记为零”，没有要求这个标记。其余判据项全部满足 | 页面实际显示的文字（驱动没有保存 `dom.visible`，p07 没有截图）。Turn 行停在 `active` 是设计还是遗漏。应用重启后该 Turn 如何收尾 |
| B2-S04 `utf16le`、`cp936` | 合同与产品不一致 | ① 产品在 PowerShell 下把 stdout 按严格 UTF-8 解码（`trusted-shell-runner.ts:587`），非法字节得到 `A9_OUTPUT_ENCODING_ERROR`，与切点无关。② CP936 默认只对 cmd 生效，UTF-16LE 在 A9-30 中记为外部选项。③ A9-30 对 CP936、UTF-16LE 解码器的证据是模块级的（Win7，Session 0），不是经 PowerShell 的端到端 | 能否通过产品设置选 cmd 来覆盖 CP936：`a9-agent-runtime.js:1181～1215` 读取 `shellOptions`，设置入口未查，`UNKNOWN` |

处置选项（等负责人裁决；套件修复都在 [§6.1](#61-拟批准精确允许路径) 的 20 个路径内，不需要新路径；产品修改不在 §6.1 内）：

| 编号 | 失败 | 选项 | 影响 |
|---|---|---|---|
| U-A | UI-01 | 套件修复：`press()` 的 `char` 事件改发字符（Enter 发 `\r`，Space 发空格）；页面里装按键记录器，记录 keydown、keypress、click 与 `defaultPrevented`；Enter 没有送达时判 `UNKNOWN`，不重按 | 改驱动与合同测试。开发机只能验证逻辑，效果要等下一次 Win7 预演；记录器让 H1、H2 在下一次运行中变成已记录的事实 |
| U-B | UI-01 | 登记已知限制，Enter 路径不验收 | 去掉 `loading_feedback` 与 `one_dispatch_while_busy` 的覆盖，键盘可达性证据缺 Enter |
| S-A | SAFE-02 | 套件修复：判据改读 `a9.turn.submit` 的 IPC 返回值（`ok=false` 与错误码），保留文件已写入、`tool_end` 0 条、无新 Provider 请求、Turn 非 `completed`；页面文字与 Turn 行状态写入证据，不参与判定 | 判据与合同文字一致。Turn 行停在 `active` 记为产品观察，不阻断 |
| S-B | SAFE-02 | 产品任务：要求审计失败后 Turn 行标记失败、页面显示错误码 | 需要新任务书。失败标记要写入已经失败的持久化，设计需 ADR。不在 A9-33 授权路径内，Alpha 2 时间窗内不可行 |
| S-C | SAFE-02 | 登记已知限制，保持判据不变 | 该断言保持 FAIL，Alpha 2 不能通过 |
| E-A | S04 | 收窄合同并登记 KL-5（草案见下） | 端到端编码覆盖只剩 UTF-8 与 CRLF；用例数 25、断言数 42 不变 |
| E-B | S04 | 保持合同，开产品任务接入 CP936、UTF-16LE 解码 | 需要新任务书与 ADR，不在 §6.1 内，Alpha 2 时间窗内不可行 |

推荐：U-A、S-A、E-A。三项修复都只改套件和文档；修复后须再做 codex 独立复核，并需要预演 8（新授权文件、新构建、负责人批准 SHA-256 和 8 小时计时说明）。p09、p10 从未在 Win7 运行，预演 8 可能暴露新失败。

S04 收窄草案（E-A，未生效）：

1. 夹具里 S04 断言文字（`a9-batch2-fixtures.cjs`）与任务书第 89 行，由“UTF-8、CP936 和 UTF-16LE 跨块无损解码；CRLF 与无换行末行保留”改为“PowerShell 下 UTF-8 文本跨块无损解码；CRLF 与无换行末行保留”。
2. 判定只用 `utf8` 与 `crlf`。`utf16le`、`cp936` 仍执行，结果写入 `s04-encoding.json` 并标 `INFORMATIONAL`，不参与 PASS 或 FAIL。预期值是 `A9_OUTPUT_ENCODING_ERROR`；产品日后支持这两种编码时，证据里会出现差异。
3. 登记 KL-5：产品在 PowerShell 下只按严格 UTF-8 解码 Shell 输出。CP936 与 UTF-16LE 输出得到 `A9_OUTPUT_ENCODING_ERROR`，不是无损解码。批次 2 只验收 PowerShell 下的 UTF-8 与 CRLF。CP936、UTF-16LE 解码器只有 A9-30 的模块级证据。任何 Alpha 2 结论必须带上 KL-5。
4. 改动位置：夹具、驱动 `stream_encodings`（`a9-batch2-driver-entry.cjs:997` 附近）、合同测试，以及本任务书、覆盖计划 [A9_BATCH_2_ACCEPTANCE_COVERAGE.md](../plans/A9_BATCH_2_ACCEPTANCE_COVERAGE.md)。

未知与未验证：

- 表中标 `UNKNOWN` 的原因与观察。
- U-A、S-A、E-A 的效果：未在 Win7 实机验证。
- p09、p10 在 Win7 上的行为 `NOT_PERFORMED`。

本节不开修复轮，不提交代码，不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.27 第四修复轮裁决与 KL-5（2026-10-14）

结论：负责人批准 U-A、S-A、E-A，开第四修复轮，修复结果送 codex 复审，提交 4 个分类文档，并登记 KL-5。
证据层级为开发机，绑定提交 `09fd4772…`。本节记录裁决，不含实现结果。

负责人原话：“批准”。所答问题是：“是否批准 U-A、S-A、E-A，开第四修复轮（修复结果送 codex 复审），同时提交这 4 个分类文档，并登记 KL-5”。回复时间戳 `UNKNOWN`。

本裁决包括：

1. U-A：`press()` 的 `char` 事件改发字符，页面装按键记录器，Enter 没有送达时判 `UNKNOWN`，不重按。
2. S-A：B2-SAFE-02 判据改读 `a9.turn.submit` 的 IPC 返回值，页面文字与 Turn 行状态写入证据，不参与判定。
3. E-A：B2-S04 收窄为 PowerShell 下 UTF-8 与 CRLF；`utf16le`、`cp936` 仍执行并标 `INFORMATIONAL`。
4. 修复范围限于 [§6.1](#61-拟批准精确允许路径) 的 20 个路径内的套件文件，以及本任务书与覆盖计划；不改产品代码。
5. 修复结果送 codex 复审，codex 用 gpt-6.1-sol、`xhigh`、非 fast 模式（沿用前三轮）。
6. 提交 4 个分类文档（任务书、STATUS、STATUS_LOG、草案）。
7. 登记 KL-5。

本裁决不包括：预演 8 的预算放宽、授权文件、构建与任何 Win7 动作。预算仍是 7/7 耗尽，请求 31/64；修复与复审完成后，执行代理另行向负责人提问。

已知限制 KL-5：

| 编号 | 来源 | 现象 | 影响 | 预演与正式执行中的处置 |
|---|---|---|---|---|
| KL-5 | 预演 7 的 B2-S04（合同与产品不一致） | 产品在 PowerShell 下只按严格 UTF-8 解码 Shell 输出；CP936 与 UTF-16LE 输出得到 `A9_OUTPUT_ENCODING_ERROR`，不是无损解码 | 批次 2 只验收 PowerShell 下的 UTF-8 与 CRLF，不验收 CP936 与 UTF-16LE 的端到端解码。CP936、UTF-16LE 解码器只有 A9-30 的模块级证据（Win7，Session 0） | `utf16le`、`cp936` 仍执行并写入 `s04-encoding.json`，标 `INFORMATIONAL`，不参与 PASS 或 FAIL。任何 Alpha 2 结论必须带上 KL-5 |

KL-1、KL-2、KL-3、KL-4 仍有效；任何 Alpha 2 结论都必须带上 KL-3 与 KL-5。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.28 第四修复轮的 codex 复核（2026-10-14）

结论：codex 对 `1a2b2783…` 报告 0 个 P0、1 个 P1、1 个 P2，不建议进入预演 8 的授权评审。执行代理逐条在已提交代码上复现，两条发现成立；它们都是套件判据误通过，没有证明产品或 Win7 回归。
证据层级为开发机，绑定提交 `1a2b2783…`（上一代码提交 `6679ef30…`）。codex 用 gpt-6.1-sol、`xhigh`、非 fast 模式，未改仓库，未访问 Win7。

过程：2026-10-14T06:44:59Z 的第一次运行在 07:16:45Z 以“Selected model is at capacity”失败，没有最终报告（中途消息不作为报告；其小文件存档在 `.acceptance/a9-33-review/codex-stage2-round4-attempt1-20261014/`）。07:39:41Z 在全新复核根重试，08:05:23Z 完成，退出码 0。最终报告与证据存档在 `.acceptance/a9-33-review/codex-stage2-round4-20261014/`，92 个文件有 `SHA256SUMS.txt`。

| 编号 | 级别 | 发现 | 执行代理的复现（开发机，已提交代码） |
|---|---|---|---|
| N1 | P1 | B2-SAFE-02 的 `dispatchStopped` 只比较 `after_next_submit === after_turn`，首轮请求增量不参与判定；第二次 `a9.turn.submit` 是否到达 IPC 也不是必要条件 | `evaluateAuditHardStop`：首轮 `0→2→2` 得 PASS；只有一次 submit 记录也得 PASS。预演 7 的真实样本 `0→1→1`、两次记录仍得 PASS（预期） |
| N2 | P2 | `one_dispatch_while_busy` 只读第一次 Enter 的到达情况；额外 Enter 与 Space 都没有到达页面时，仍可 PASS | `evaluateUiJourney`：`extra_enter.delivered=false`、`extra_space.delivered=false` 时 `one_dispatch_while_busy` 与整体都是 PASS |

codex 的其余结论（信息）：

1. U-A 部分关闭：`\r` 构造、首次按键绑定和不重按通过；Electron 22 对该 `char` 事件的映射 `UNKNOWN`。到达记录不绑定元素：BODY 上的 keydown 与 keypress 13 也使 `delivered=true`，`pressKey` 之前的焦点返回值（`activeElement === button`）被忽略，所以 `delivered` 只证明页面收到事件，不证明指定按钮收到 Enter。
2. S-A 的错误码定位已关闭，完整硬停止判据部分关闭（N1）。E-A 按 KL-5 已关闭，开发机。
3. 16 个变异中 13 个被拦，3 个存活：A1（`enter_delivery` 绑定到额外 Enter）、A2（`ipcFrom` 移到 `submit` 之后）、A3（判定项编码也吞异常）。它们在驱动闭包内，当前接线正确，但 `enter_journey`、`safeRules`、`streamEncodings` 没有闭包级行为用例。
4. 契约测试：沙箱内 185 通过、7 个因 `listen EPERM 127.0.0.1` 为 `UNKNOWN`（与前几轮相同的 7 个）；包测试 120 通过；`docs:check` 333 个文件。
5. 假设 37、38、39 为 `UNKNOWN`，40、41 成立（限预演 7 样本）。
6. 范围：累计恰为 §6.1 的 20 个路径，本轮只改 3 个套件文件。

对本任务书 §6.26 的更正（codex 指出，执行代理核实）：

- 原文“产品侧原因已排除”过强。驱动 IPC 日志在调用返回后写入，没有记录不等于没有调用进入；点击处理有静默提前返回的守卫，旧证据不能排除“点击发生但被守卫返回”。归类改为套件缺陷（首选），产品侧剩这一条路径。本轮新增的记录器记录 `click` 事件，下一次运行可区分“没有点击”与“点击后被守卫返回”。
- 原文“渲染层只拦截四种键”过宽：另有输入框与对话操作区的局部键盘处理，都不挂在卡片按钮上。
- 已提交的 `ec546e5…` 与 STATUS_LOG 中的原句保留不改，更正以本节为准。

建议的修复（等负责人裁决，未实施）：

1. N1：夹具固定首轮应有的请求数为 1，判据要求 `after_turn − before === 1`；第二次 `a9.turn.submit` 必须被观察到，缺失则 `UNKNOWN`；第二次的错误码仍只是观察。
2. N2：`one_dispatch_while_busy` 要求额外 Enter 与 Space 的 `keydown` 被页面记录；缺失则 `UNKNOWN`。不要求 disabled 按钮产生 click，不重按。
3. U-A 加固：记录第一次 Enter 前的焦点返回值和 keydown 的目标元素；目标不是按钮则判 `UNKNOWN` 并写明目标。
4. 为 `safeRules`、`streamEncodings`、`uiContinue` 的 `enter_journey` 增加闭包级行为用例，覆盖 A1、A2、A3。

未知与未验证：

- Electron 22 下 `\r` 的 `char` 事件是否产生 keypress 13 并点击按钮（假设 37）：`UNKNOWN`，需下一次 Win7 预演。
- 上述修复的效果：未在 Win7 实机验证。
- 预算仍是 7/7 耗尽，预演 8 未授权。

本节不开修复轮，不提交代码，不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.29 第五修复轮裁决（2026-10-14）

结论：负责人选 A，开第五修复轮，并提交 §6.28 及相关文档。
证据层级为开发机，绑定提交 `1a2b2783…`。本节记录裁决，不含实现结果。

负责人原话：“选A，开第五修复轮并提交这些文档”。所答问题是：“是否开第五修复轮，还是登记已知限制后直接评审预演 8”；选项 A 的内容见 [§6.28](#628-第四修复轮的-codex-复核2026-10-14) 的“建议的修复”四条。回复时间戳 `UNKNOWN`。

本裁决包括：

1. N1：夹具固定首轮应有请求数为 1，判据要求 `after_turn − before === 1`；第二次 `a9.turn.submit` 未被观察到时判 `UNKNOWN`。
2. N2：`one_dispatch_while_busy` 要求额外 Enter 与 Space 的 `keydown` 被页面记录，缺失判 `UNKNOWN`；不重按。
3. U-A 加固：记录第一次 Enter 前的焦点返回值和 `keydown` 的目标元素，目标不是按钮判 `UNKNOWN`。
4. 为 `safeRules`、`streamEncodings`、`uiContinue` 的 `enter_journey` 增加闭包级行为用例，覆盖 A1、A2、A3。
5. 修复限于 [§6.1](#61-拟批准精确允许路径) 的 20 个路径内的套件文件，以及本任务书与覆盖计划；不改产品代码。
6. 修复结果送 codex 复审（gpt-6.1-sol、`xhigh`、非 fast 模式，沿用前几轮）。
7. 提交 §6.28 及相关文档（任务书、STATUS、STATUS_LOG、草案、第四修复轮交接包）。

本裁决不包括：预演 8 的预算放宽、授权文件、构建与任何 Win7 动作。预算仍是 7/7 耗尽，请求 31/64；修复与复审完成后，执行代理另行向负责人提问。
KL-1～KL-5 仍有效；任何 Alpha 2 结论必须带上 KL-3 与 KL-5。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.30 第五修复轮实现与 codex 第 5 轮复核（2026-10-14）

结论：第五修复轮已按 §6.29 实现并提交，codex 复核后对 `c8d9113b…` 报告 0 个 P0、2 个 P1、2 个 P2，不建议进入预演 8 的授权评审。
证据层级为开发机，绑定提交 `c8d9113b1261fc112d6a804ee0782f70786501d0`（上一被复核提交 `1a2b2783…`，中间文档提交 `9fbb68aa…`）。codex 用 gpt-6.1-sol、`xhigh`、非 fast 模式，未改仓库，未访问 Win7。

实现（执行代理，开发机）：本地提交 `c8d9113b…`，只改 2 个套件文件（+317/−21，累计相对 `7e96f561…` 为 20 个文件 +9008/−31，路径仍是 §6.1 的 20 个）。内容：N1 首轮请求数固定为 1 且第二次 `a9.turn.submit` 必须被观察；N2 额外 Enter 与 Space 的 `keydown` 必须被页面记录；U-A 加固（`keydown_target` 为按钮且 `focus()` 返回值为真）；为 `safeRules`、`streamEncodings`、`uiContinue` 增加 11 个闭包用例。验证：contract 161 通过、package-runtime 43 通过、`node --test` 120 通过、`tsc --noEmit` 退出码 0、`docs:check` 334 个文件。23 个变异最终全部被拦（S1 首次存活，补桩后拦住）。

过程：2026-10-14T08:47:17Z 启动，09:15:46Z 完成，退出码 0。最终报告与证据存档在 `.acceptance/a9-33-review/codex-stage2-round5-20261014/`，131 个文件有 `SHA256SUMS.txt`。交接包为 `docs/reports/2026-10/a9_33_independent_review_handoff_rehearsal7_fixes_round2_2026-10-14.md`，执行代理试跑 401 秒，退出码 0。

| 编号 | 级别 | 发现 | 性质 | 执行代理的核实（开发机） |
|---|---|---|---|---|
| R1 | P1 | B2-S03T 的 PASS 条件只有 `starts === 3 && !completed && c2.requests === c1.requests && laterShell === 0`。第二次 `a9.turn.submit` 是否到达 IPC 不是条件，请求计数不要求是整数 | 既有套件缺陷，本轮首次发现；与 N1 同类 | 读源码确认：驱动 `s03t-terminal-audit` 记录处只有上述条件；`counters()` 在响应体为空时返回 `{}`，`undefined === undefined` 为真。codex 的探针未重跑 |
| R2 | P1 | 重启检查 `zeroAdded` 直接比较三份 `requests`，不检查存在性；`B2-CONT-01` 第 2 项比较旧 Turn 状态，两次都查不到（`null`）也得 PASS。`guardRefused` 已有整数检查，这里遗漏 | 既有套件缺陷，本轮首次发现；与 N1 同类 | 读源码确认：`zeroAdded` 与 `old_turn_status` 比较均无存在性检查；共用的 `zeroAdded` 还影响 `B2-CH-04` 第 2 项。codex 的探针未重跑 |
| R3 | P2 | `one_dispatch_while_busy` 先要求 `extrasReached === true`。额外键发送前已观察到 2 条 continue 事件，额外键丢失仍判 `UNKNOWN`，原先是 `FAIL` | 第五修复轮引入的回归 | 在 `c8d9113b…` 的真实评估器上复现：`events_busy=2`、两个额外键 `keydown=false` 得 `UNKNOWN`。`1a2b2783…` 没有额外键条件，计数 2 不等于 1，读源码为 `FAIL` |
| R4 | P2 | 首轮固定增加 1 个请求，会把合法的网络重试判成硬停止失败 | 第五修复轮引入的误判风险 | 读源码确认：Gateway 对 `ECONNRESET`、`ETIMEDOUT`、5xx 等最多重试 5 次（`openai-compatible.ts:210～265`，`transport/index.ts:99～103`）；夹具在服务器侧计数每个非探测请求（smoke `requestCount += 1`）。仅当首个请求已被服务器计数、响应随后丢失时才出现 2；预演 7 是否发生过这种故障 `UNKNOWN`（样本为 `0→1→1`）。codex 的探针未重跑 |

codex 的其余结论（信息）：

1. N1、N2、目标元素信息项、A1、A2、A3 的原反例已在开发机关闭；23 个交接包变异全部重做且被拦；codex 另试 7 个，B2（`warnings` 取全部 `tool_output`，不按 `toolCallId` 过滤）与 C1（删掉真实 `b.focus()`）存活。原因：`uiContinue` 的桩按代码子串返回 `buttonFocused`，不执行 DOM；`streamEncodings` 的桩每次只有一个 `toolCallId`。当前源码调用正确，属覆盖盲点。
2. 假设 42 在无条件表述下不成立；43、45 为 `UNKNOWN`；44 在标准 DOM 事件模型下成立，Electron 22 的实际落点 `UNKNOWN`。
3. 契约测试在沙箱内 197 通过、7 个因 `listen EPERM 127.0.0.1` 为 `UNKNOWN`（与前几轮相同的 7 个）；包测试 120 通过；`docs:check` 334 个文件；范围恰为 §6.1 的 20 个路径。
4. 闭包用例未覆盖：真实 IPC 在调用返回后记录而桩在 `submit` 内同步记录（晚到答复的时序）、SQLite 触发器的实际创建与删除、`exec` 内的 DOM 动作、多 `toolCallId` 的警告归属。

对文档措辞的更正（codex 第 5 轮指出，执行代理核实）：

- 本任务书 §6.26 原文“三项都不是 Win7 环境问题”过强，已改为只对 B2-SAFE-02 与 B2-S04 成立，B2-UI-01 的原因 `UNKNOWN`、Win7 环境因素未排除。
- §6.26 与第四轮交接包原文“所以这 9.96 秒内没有通过守卫的点击”已改为“与之一致，但不能单独排除其他路径”。
- §6.26 与第四轮交接包原文“Space 经同一函数两次成功”已改为：26.670Z 的事件由额外 Enter 或额外 Space 触发，数据无法区分，27.735Z 对应的按键未单独核对。
- `docs/STATUS_LOG.md` 中“点击没有发生”的已提交旧句（B2-UI-01 条目）保留不改，更正以本节为准。

建议的修复（等负责人裁决，未实施；全部在 §6.1 的 20 个路径内，不改产品代码）：

1. R1：B2-S03T 要求请求计数为非负整数，并用与 B2-SAFE-02 相同的 IPC 基线方法确认第二次 `a9.turn.submit` 到达；缺失则 `UNKNOWN`。不固定请求总数。
2. R2：`zeroAdded` 要求三份请求计数和两份工具事件计数都是整数，旧 Turn 状态前后都非空；缺失则 `UNKNOWN`。
3. R3：`one_dispatch_while_busy` 先看计数：任一计数大于 1 即 `FAIL`，与额外键是否到达无关；只有计数都等于 1 且 Enter 与额外键都到达才 `PASS`；其余 `UNKNOWN`。
4. R4：B2-SAFE-02 不再用“首轮增量恰好为 1”，改为读 Provider 日志（每条请求有 `tool_messages` 字段）：窗口内没有任何请求带工具结果，且次轮提交后计数不增；这个替代判据本身需 codex 复审。
5. 覆盖盲点：`uiContinue` 的桩真正执行 `focus()`，使删掉 `b.focus()` 的变异被拦；`streamEncodings` 增加含两个 `toolCallId` 的用例。

未知与未验证：

- Electron 22 下 `\r` 的 `char` 事件、已禁用按钮后额外键的派发、`focus()` 的落点（假设 37、43、45）：`UNKNOWN`，需下一次 Win7 预演。
- 上述修复与第五修复轮的效果：未在 Win7 实机验证。
- 预算仍是 7/7 耗尽，预演 8 未授权；Win7 授权窗口 `2026-10-16T06:59:59Z` 结束。

本节不开修复轮，不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.31 第六修复轮裁决（2026-10-14）

结论：负责人选 A，开第六修复轮，并提交 §6.30 相关文档。
证据层级为开发机，绑定提交 `c8d9113b…`；§6.30 相关文档已提交为 `a94b9658…`。本节记录裁决，不含实现结果。

负责人原话：“选A，开第六修复轮并提交这些文档”。所答问题是：“冻结前是否再修一轮套件”；选项 A 的内容见 [§6.30](#630-第五修复轮实现与-codex-第-5-轮复核2026-10-14) 的“建议的修复”五条。回复时间戳 `UNKNOWN`。

本裁决包括：

1. R1：B2-S03T 要求计数为非负整数，并确认第二次 `a9.turn.submit` 到达 IPC，缺失判 `UNKNOWN`，不固定请求总数。
2. R2：重启检查的请求计数、工具事件计数和旧 Turn 状态缺失判 `UNKNOWN`。
3. R3：`one_dispatch_while_busy` 先判计数，任一计数大于 1 即 `FAIL`。
4. R4：B2-SAFE-02 不再固定首轮请求数，改读 Provider 日志，窗口内带工具结果的请求数必须为 0。
5. 覆盖盲点：UI 闭包的桩在假页面里执行驱动自己的 `focus()` 脚本；S04 闭包增加带自己警告的第二个工具调用。
6. 修复限于 [§6.1](#61-拟批准精确允许路径) 的 20 个路径内的套件文件，以及本任务书与覆盖计划；不改产品代码。
7. 修复结果送 codex 复审（gpt-6.1-sol、`xhigh`、非 fast 模式，沿用前几轮）。
8. 提交 §6.30 相关文档（已提交为 `a94b9658…`）。

本裁决不包括：预演 8 的预算放宽、授权文件、构建与任何 Win7 动作。预算仍是 7/7 耗尽，请求 31/64；修复与复审完成后，执行代理另行向负责人提问。
Win7 授权窗口 `2026-10-16T06:59:59Z` 结束；窗口不足时由负责人另行裁决延长。
KL-1～KL-5 仍有效；任何 Alpha 2 结论必须带上 KL-3 与 KL-5。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.32 第六修复轮实现与 codex 第 6 轮复核（2026-10-14）

结论：第六修复轮已按 §6.31 实现并提交，codex 复核后对 `1a2bd02f…` 报告 0 个 P0、0 个 P1、1 个 P2，不建议进入预演 8 的授权评审，直到该 P2 关闭。
证据层级为开发机，绑定提交 `1a2bd02f65d558381458cc750577cb6b2c2b5fbc`（上一被复核提交 `c8d9113b…`，中间文档提交 `a94b9658…`）。codex 用 gpt-6.1-sol、`xhigh`、非 fast 模式，未改仓库，未访问 Win7。

实现（执行代理，开发机）：本地提交 `1a2bd02f…`，只改 2 个套件文件（+421/−62，累计相对 `7e96f561…` 为 20 个文件 +9367/−31，路径仍是 §6.1 的 20 个）。内容：R1 `evaluateTerminalAudit`；R2 `evaluateRestartCounts`、`evaluateOldTurnUnchanged`、`evaluateInterruptRecords` 与 `recordInterruptChecks`；R3 `duplicateSeen`；R4 B2-SAFE-02 改读 Provider 日志；C1、B2 的闭包桩补强；12 个新用例。验证：contract 173 通过、package-runtime 43 通过、`node --test` 120 通过、`tsc --noEmit` 退出码 0、`docs:check` 335 个文件；43 个变异全部被拦（0 个存活）；交接包试跑 387 秒，退出码 0。

过程：2026-10-14T10:19:00Z 启动，10:44:14Z 完成，退出码 0。最终报告与证据存档在 `.acceptance/a9-33-review/codex-stage2-round6-20261014/`，168 个文件有 `SHA256SUMS.txt`。交接包为 `docs/reports/2026-10/a9_33_independent_review_handoff_rehearsal7_fixes_round3_2026-10-14.md`。

| 编号 | 级别 | 发现 | 性质 | 执行代理的核实（开发机） |
|---|---|---|---|---|
| N1 | P2 | UI-01 旅程已观察到两条继续事件（重复派发）后，截图或 `keyRecords()` 抛错，`facts.enter` 保持 `null`，`one_dispatch_while_busy` 由 `FAIL` 变成 `UNKNOWN` | 既有闭包缺口，本轮首次确认；R3 部分关闭 | 读源码确认：`enter_journey` 在 `screenshot()` 之前不赋值，`keyRecords()` 在赋值的对象字面量里调用；`step()` 只记录错误。codex 的探针未重跑。执行代理补充：`duplicateSeen` 要求两个计数都是整数，所以第二次读事件之前抛错同样会丢掉已观察到的 `eventsBusy` |

codex 的其余结论（信息）：

1. R1、R2、R4、C1、B2 的指定反例已在开发机关闭；R3 的评估器反例已关闭，闭包仍丢计数（N1）。
2. 交接包 43 个变异全部重做且被拦；codex 另试 6 个，X3（`oldStatusAfter` 提前到 `waitIdle` 之前读取）、X5（删掉 `pending === null`）、X6（Provider 日志提前到第二次提交之前读取）存活。原因：桩的 `turnStatus`、`pending`、第二次提交都是固定值。当前源码的顺序与条件正确，属覆盖盲点。合计 49 个变异，46 个被拦。
3. 假设 46 在泛化表述下不成立（未执行、截断、校验或策略拒绝的调用也生成工具回执），在 `b2:audit-write` 的新对话首请求下成立；47、49 成立；48 为 `UNKNOWN`（单一 Win7 样本）。
4. 契约测试在沙箱内 209 通过、7 个因 `listen EPERM 127.0.0.1` 为 `UNKNOWN`（与前几轮相同的 7 个）；包测试 120 通过；`docs:check` 335 个文件；范围恰为 §6.1 的 20 个路径。
5. 闭包仍未覆盖：真实 SQLite 触发器的创建与删除、IPC 在调用返回后记录的晚答时序、真实 DOM 的双击与节点选择、完整 `chainRecover`、`B2-CH-05` 第 1 项的请求比较（已披露未改）。

建议的修复（等负责人裁决，未实施；全部在 §6.1 的 20 个路径内，不改产品代码）：

1. `enter_journey` 逐步写入 `facts.enter`：先建对象，每读到一项就写入；截图与 `keyRecords()` 放在计数之后，失败只记入 `notes.errors`，不丢已写入的事实。
2. `evaluateUiJourney`：任一整数计数大于 1 即 `duplicateSeen`，不要求两个计数同时存在；两个计数都存在才允许签 `PASS`。
3. 闭包用例：重复派发已观察到后，截图抛错、`keyRecords` 抛错、第二次读事件抛错三种情形都判 `FAIL`。
4. 补强三个存活变异：桩的 `turnStatus` 在 `waitIdle` 前后返回不同值；`interruptRig` 增加 `pending` 非空的用例；第二次提交时 Provider 日志增长，使提前读取被拦。

未知与未验证：

- Electron 22 下 `\r` 的 `char` 事件、已禁用按钮后额外键的派发、`focus()` 的落点（假设 37、43、45）：`UNKNOWN`，需下一次 Win7 预演。
- 上述修复与第六修复轮的效果：未在 Win7 实机验证。
- 预算仍是 7/7 耗尽，预演 8 未授权；Win7 授权窗口 `2026-10-16T06:59:59Z` 结束。

本节不开修复轮，不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.33 第七修复轮裁决 B 与 KL-6（2026-10-14）

结论：负责人选 B，不开第七修复轮，把 codex 第 6 轮的 P2（N1）和三个存活变异登记为已知限制 KL-6，直接进入预演 8 的授权评审。
证据层级为开发机，绑定提交 `1a2bd02f65d558381458cc750577cb6b2c2b5fbc`。本节记录裁决与登记，不含实现，不改套件代码。

负责人原话：“B”。所答问题是：“待裁决：是否开第七修复轮？……你是否选 A（含停止规则），并同意提交这些文档？”选项 B 的内容是“登记 KL-6，不修，直接进预演 8 授权评审”。回复时间戳 `UNKNOWN`。
负责人的回复没有单独回答“同意提交这些文档”。执行代理不把“B”当作提交授权；§6.31、§6.32、本节、第六轮交接包和相关状态文档仍在工作树，未提交，等负责人另行同意。

已知限制 KL-6：

| 编号 | 来源 | 现象 | 影响 | 预演与正式执行中的处置 |
|---|---|---|---|---|
| KL-6a | codex 第 6 轮 P2（N1） | UI-01 的 `enter_journey` 在截图与 `keyRecords()` 都成功之后才给 `facts.enter` 赋值。驱动已读到两条继续事件（重复派发）后，若截图、`keyRecords()` 或第二次读事件抛错，`facts.enter` 保持 `null`，`one_dispatch_while_busy` 由 `FAIL` 变成 `UNKNOWN`。`duplicateSeen` 要求两个计数同时是整数，第二次读事件之前抛错会同样丢掉第一次计数 | 重复派发在该情形下记为 `UNKNOWN`，不会记为 `PASS`。Win7 是否触发 `UNKNOWN` | 报告里 B2-UI-01 出现 `UNKNOWN` 时，执行代理先查 `notes.errors` 是否有截图或键记录错误，并核对 `ui01-interaction` 阶段证据里的继续事件计数；有重复派发迹象时保存证据并向负责人报告，报告判定仍是 `UNKNOWN`，不自行改判 |
| KL-6b | codex 第 6 轮变异 X3 | `oldStatusAfter` 提前到 `waitIdle` 之前读取的变异存活：闭包桩的 `turnStatus` 是固定值 | 当前源码顺序正确；若日后改动该顺序，现有用例不会报警。对本次判据无影响 | 不处置；列入覆盖缺口 |
| KL-6c | codex 第 6 轮变异 X5 | 删掉 `pending === null` 条件的变异存活：`interruptRig` 没有 `pending` 非空的用例 | 同上 | 同上 |
| KL-6d | codex 第 6 轮变异 X6 | Provider 日志在第二次提交之前读取的变异存活：第二次提交时桩的日志不增长 | 同上 | 同上 |
| KL-6e | 第五修复轮已披露、第六修复轮未改 | `B2-CH-05-CONTINUE` 第 1 项用 `afterDup.requests === heldCounters.requests` 比较，没有先检查两个计数是整数；`chainRecover` 没有闭包用例（`a9-batch2-driver-entry.cjs:1072`） | 两个计数都缺失时比较为真。`counters()` 读 Provider 夹具的计数端点，该端点的响应恒含数值 `requests`（`a9-batch2-smoke.cjs:353`），实际触发条件 `UNKNOWN` | 不处置；Win7 报告核对该项的 `requests_held` 与 `requests_after_duplicate` 都是整数 |

KL-6 不改变的事项：已有判据不因 KL-6 放宽；KL-6a 只会让 `FAIL` 变成 `UNKNOWN`，KL-6b～KL-6d 只是覆盖盲点，KL-6e 是一处未加守卫的比较。
合计 49 个变异中 46 个被拦；3 个存活项即 KL-6b～KL-6d。codex 另列的闭包未覆盖项（真实 SQLite 触发器、IPC 晚答时序、真实 DOM 双击与节点选择、完整 `chainRecover`）本节不登记，已在 [§6.32](#632-第六修复轮实现与-codex-第-6-轮复核2026-10-14) 披露。

对独立复核的影响：关口 B 的独立复核者可能把 KL-6a 再次作为发现提出，因为 codex 第 6 轮建议先关闭该项。这一风险由本裁决接受。

本裁决不包括：预演 8 的预算放宽、授权文件、构建、提交文档与任何 Win7 动作。预算仍是 7/7 耗尽，请求 31/64；窗口 `2026-10-16T06:59:59Z` 结束。
KL-1～KL-6 仍有效；任何 Alpha 2 结论必须带上 KL-3、KL-5 与 KL-6a。

本节不开修复轮，不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.34 预演 8 放宽、文档提交与构建授权（2026-10-14）

结论：负责人批准放宽到第 8 次预演（最后一次）、提交待提交文档并构建预演 8 包。
证据层级为开发机，绑定套件代码 `1a2bd02f…`。本节记录裁决；预演 8 的 Win7 动作仍是 `NOT_PERFORMED`，授权文件尚未生成。

负责人原话：“选A，同意放宽到第8次预演、提交文档并构建预演8包”。所答问题是：“你是否选 A（放宽到第 8 次预演、同意提交这 5 个文档、同意构建预演 8 包）？”回复时间戳 `UNKNOWN`。

本裁决包括：

1. 预演最多 8 次，预演 8 是最后一次。
2. 请求总数上限仍是 64，已用 31；预演 8 每次运行 ≤16 个请求、≤7200 秒，累计最多 47。
3. 同一失败连续两次即暂停诊断；修复只在 [§6.1](#61-拟批准精确允许路径) 的 20 个路径内；每个新包哈希在传输前报备；窗口 `2026-10-16T06:59:59Z` 不变。
4. 执行代理提交待提交文档（本地，不推送），含本节。
5. 执行代理从该文档提交构建预演 8 包；套件代码是 `1a2bd02f…`，文档提交不改源码。
6. 执行代理为预演 8 单独生成授权文件（`WIN7_43_RELEASE_AUTHORITY`，新 run-id），传输前报备全部哈希。

本裁决不包括：预演 8 授权文件的批准、任何 Win7 动作（含 R1 只读复核）。授权文件的 SHA-256 须由负责人在聊天里回复同意，执行代理才开始 R1～R8；该回复同时用来说明 8 小时计时。
8 小时计时：负责人本次回复没有说明。沿用 [§6.22](#622-预演-6-放宽与计时矛盾2026-10-13) 的做法，自负责人回复预演 8 授权文件 SHA-256 起算 8 小时；请在批准授权文件时确认或更正。
KL-1～KL-6 仍有效；任何 Alpha 2 结论必须带上 KL-3、KL-5 与 KL-6a。

预算与计时：预演 7/7 已用，批准后预演 8 为第 8 次、最后一次；请求 31/64；预演 8 失败后再预演须负责人再次放宽并另有授权文件。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.35 预演 8 执行记录与 p10 失败分类（2026-10-14）

结论：预演 8 在 Win7 实机完成。p01～p09 全部通过，42 个断言中 41 个通过；p10 的秘密扫描判 `FAIL`（`SECRET_FOUND`，14 个文件命中）。执行代理在开发机只读核对，14 处命中全是误报，原因是扫描正则没有左边界，属套件缺陷。第 8 次预演的预算已用完，A9-33 batch-2 未取得全部通过。
证据层级为 Win7 实机（预演，`REHEARSAL_NOT_ELIGIBLE`），绑定源提交 `60d0d95c…`、ZIP `c7f40efc…`、授权文件 `9ee43679…`、运行编号 `ea67b2c0`。套件代码为 `1a2bd02f…`；p10 失败的分类在开发机作出。

负责人原话：“选A，同意放宽到第8次预演、提交文档并构建预演8包”“批准，授权文件 SHA-256 9ee43679… 同意，开始预演8”。回复时间戳 `UNKNOWN`；执行代理 2026-10-14T11:34:29Z 首次读到批准。第二条回复没有重述 8 小时计时，执行代理按上一条报备和 2026-10-14 的裁决“用已有做法，规则最少变动”处理，截止 2026-10-14T19:34:29Z；负责人可更正。Win7 动作 R1～R8 全部在截止之前完成，最后一次是 11:49:11Z。

| 阶段 | 结果 | 要点 |
|---|---|---|
| p01 环境 | PASS，5/5 | |
| p02 完整性 | PASS，4/4 | 799 个清单文件、800 个 ZIP 条目，0 个不一致 |
| p03 最短链路 | PASS，12/12 | B2-CH-02-A01：`first_ipc_ms=847; ipc_frames_max=4; dom_frames_max=0`，KL-3 再现 |
| p04 流式输出 | PASS，7/7 | S03T：`tool_starts=3; requests=17->21->21; submit_calls=2`；S04：`utf8=true; crlf=true`，`utf16le`、`cp936` 仅记录（KL-5） |
| p05 会话与后台 | PASS | S06 刷新与重启路径、BG-01/02/03 通过 |
| p06 继续 | PASS | 4 条断言通过 |
| p07 安全规则 | PASS | B2-SAFE-02：`requests=0->1->1; requests_with_tool_result=0`，提交返回 `A9_AUDIT_PERSISTENCE_FAILED` |
| p08 界面 | PASS | B2-UI-01 九项全部 PASS；B2-UI-02 `layouts=8; unusable=0` |
| p09 报告 | PASS | `verified=8/8 phases`，8 个负例全部 PASS；首次在 Win7 运行 |
| p10 后检 | FAIL | A01 FAIL：`files_scanned=250; findings=14; positive_control_detected=true`；A02 PASS：`residue=0; processes_total=104` |

p10 失败分类（证据：`.acceptance/a9-33-rehearsal/rehearsal-8/r7/`，开发机只读）：

| 命中 | 数量 | 已确认的事实 |
|---|---|---|
| 11 个 JSON 证据文件（p03、p06、p08 的请求目录） | 17 处 | 匹配的是 `task-<13 位数字>-<6 位>` 编号里的 `sk-…`，前一字符是 `a`。`sk-` 之后有 20 个字符（13 位数字、连字符、6 位），刚好达到正则 `sk-[A-Za-z0-9_-]{20,}` 的下限 |
| 3 个 `driver-electron` 二进制 | 23 处 | `electron.exe`、`vk_swiftshader.dll`、`vulkan-1.dll` 里的 Vulkan 符号名（以 `Mask` 结尾的名字，后接连字符和 20 个以上字符）。三个文件与本机 Electron ZIP 同名条目的大小和 SHA-256 逐项相同 |
| `configured-secret-literal`、`bearer-token` | 0 处 | 扫描结果只含 `api-key-prefix`；开发机对 245 个取回文件搜索 `sk-TESTONLY`，0 个文件命中 |

根因：`a9-batch2-smoke.cjs:224` 的正则没有左边界，任何以 `sk-` 结尾的单词加 20 个以上字符都命中；扫描范围包含 Electron 运行时副本。p03 的证据含任务编号，所以按当前扫描器，p10 在这类证据上判 `FAIL`。该缺陷此前不可见，因为 p10 从未在 Win7 执行。
未取回的 83 个 `driver-electron` 文件中，除上述 3 个外，Win7 扫描器没有报告命中。

已关闭或首次得到 Win7 证据的事项：第四到第六修复轮的结果首次整体上 Win7；B2-S03T、B2-SAFE-02、B2-UI-01 在 Win7 通过；假设 37、43、45（Electron 22 的 `
` 字符事件、已禁用按钮后的额外按键、`focus()` 落点）各自是否被这些观察单独证实 `UNKNOWN`；p09 的 8 个负例和 p10 的 A02 在 Win7 通过。KL-6a 未触发（UI-01 全 PASS）。

未知与未验证：

- 修复扫描器后 p10 在 Win7 是否通过 `UNKNOWN`，要靠下一次 Win7 运行取得。
- p10 的 A01 在 Win7 上从未 PASS。
- B2-SAFE-02 的 `page_shows_code=false`、`outcome_json_has_code=false` 仍是观察项，产品没有把审计失败记入 Turn 行与页面（[§6.25](#625-预演-7-执行记录2026-10-14) 矛盾 2，已由 [§6.27](#627-第四修复轮裁决与-kl-52026-10-14) S-A 收窄判据）。
- B2-UI-02 `below_800=NOT_VERIFIED`；KL-1～KL-6 仍有效，任何 Alpha 2 结论都必须带上 KL-3、KL-5 与 KL-6a。

建议的修复（等负责人裁决，未实施；全部在 [§6.1](#61-拟批准精确允许路径) 的 20 个路径内，不改产品代码）：

1. `api-key-prefix` 正则加左边界：`/(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/`；开发机 Node 20 验证 `task-` 加 13 位数字、连字符、6 位字符的任务编号不命中；Win7 的 Electron 22（Node 16.17.1）支持该语法，仍需在 Win7 取得。
2. 契约测试：`task-` 编号、`…Mask-…` 符号名不命中；`sk-TESTONLYBATCH2…`、`"apiKey":"sk-…"`、`Bearer sk-…`、`=sk-…` 命中；正控仍检出。
3. 开发机回放：用修复后的扫描器扫预演 8 取回的 245 个文件和 3 个 ZIP 条目，期望 0 个命中。
4. 修复结果送 codex 复审（范围限扫描器差异）。
5. 修复后再放宽一次预演（第 9 次，授权文件与 SHA-256 同意照旧），让 p10 在 Win7 取得首个 PASS；不放宽则 p10 的首次 Win7 通过推迟到正式执行。

预算与计时：预演 8/8，预演预算耗尽；请求 41/64；窗口至 2026-10-16T06:59:59Z。继续预演须负责人再次放宽，且需要新的授权文件。

Win7 状态：R8 后检无残留进程，无 `A9W43*` 计划任务；旧根 0f3591ba、16f6af76、37632497、79a32916、82f275a9、d254bfcb、dbd8df63 未改动；新根 `C:\A9-W43\run\ea67b2c0` 保留。

本节不开修复轮，不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.36 扫描器修复轮与第 9 次预演裁决（2026-10-14）

结论：负责人选 A，开扫描器修复轮并送 codex 复审，放宽到第 9 次预演（最后一次），并提交 §6.35 相关 4 个文档。
证据层级为开发机，绑定提交 `60d0d95c…`（套件代码 `1a2bd02f…`）。本节记录裁决，不含实现结果。

负责人原话：“A”。所答问题是：“你是否选 A（开扫描器修复轮并送 codex 复审、放宽到第 9 次预演、提交这 4 个文档）？”回复时间戳 `UNKNOWN`。

本裁决包括：

1. 扫描器修复轮：`api-key-prefix` 正则加左边界，补闭包用例，用预演 8 取回的 245 个文件和 3 个 ZIP 条目回放；仅限 [§6.1](#61-拟批准精确允许路径) 的 20 个路径，不改产品代码。
2. 修复结果送 codex 复审（gpt-6.1-sol、`xhigh`、非 fast 模式，沿用前几轮），范围限扫描器差异。
3. 预演最多 9 次，预演 9 是最后一次；请求总数上限仍是 64，已用 41；预演 9 每次运行 ≤16 个请求、≤7200 秒，常规路径 10 个请求，累计最多 57。
4. 同一失败连续两次即暂停诊断；每个新包哈希在传输前报备；窗口 `2026-10-16T06:59:59Z` 不变。
5. 提交 §6.35 相关 4 个文档（本地，不推送），含本节。

本裁决不包括：预演 9 包的构建、预演 9 授权文件的批准、任何 Win7 动作。codex 复审完成后，执行代理另行向负责人提问；授权文件 SHA-256 须由负责人在聊天里回复同意，8 小时计时沿用 [§6.22](#622-预演-6-放宽与计时矛盾2026-10-13) 的做法。
KL-1～KL-6 仍有效；任何 Alpha 2 结论必须带上 KL-3、KL-5 与 KL-6a。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.37 扫描器修复轮的 codex 复核（第 7 轮，2026-10-14）

结论：codex 对 `15b93e3b…` 报告 0 个 P0、1 个 P1、1 个 P2，不建议进入预演 9 的授权评审，直到该 P1 关闭。执行代理已独立复现 P1。
证据层级为开发机，绑定提交 `15b93e3b0deb7e3a9fa1caa6b094ddb6d530027a`（测试检出 `7ea9acb0…`）。codex 用 gpt-6.1-sol、`xhigh`、非 fast 模式，未改仓库，未访问 Win7。

过程：2026-10-14T12:48:23Z 启动，13:15:20Z 完成，退出码 0。最终报告与证据存档在 `.acceptance/a9-33-review/codex-stage2-round7-20261014/`，125 个文件有 `SHA256SUMS.txt`，复核 0 个不一致；报告 SHA-256 前缀 `d542190a…`。交接包为 `docs/reports/2026-10/a9_33_independent_review_handoff_scanner_fix_2026-10-14.md`，交接包四个代码块在全新目录整体试跑 418 秒，退出码 0。

| 编号 | 级别 | 发现 | 执行代理的核实（开发机） |
|---|---|---|---|
| N1 | P1 | 新正则按序列化后的原始字节判断左边界。JSON 里的换行、制表符、回车、换页、退格、NUL 写成 `\n`、`\t`、`\r`、`\f`、`\b`、`\u0000`，密钥紧随其后时前一字符是 `n`、`t`、`0` 等字母或数字，被新正则排除。URL 里的 `%20` 同理。codex 用不同于夹具密钥的合成值，经真实 `scanRun` 与 `runPostflightPhase` 复现：旧正则 A01 `FAIL`、阶段 `FAIL`，新正则 A01 `PASS`、阶段 `PASS`（误通过）。位置 `a9-batch2-smoke.cjs:225`，测试缺口 `a9-batch2-contract.test.ts:592` | 成立。执行代理用独立探针复现：JSON 转义（含双重转义）、`\u001b`、`%20`、`%0A`、`\x0a` 共 11 种形态，旧正则命中、新正则不命中。配置字面量检查不受影响，所以已知夹具密钥仍被发现；任意其他密钥在这些形态后会漏检。这是修复引入的安全门误通过回归；预演 8 的 p10 判 `FAIL`，且取回的 245 个文件里没有配置密钥，不能据此说预演 8 泄密 |
| N2 | P2 | 三个存活变异：密钥尾部字符集删去 `_`；删去 `-`；`scanRun` 跳过 `.exe`。当前源码能检出这些输入，是测试覆盖缺口 | 成立，需补用例 |

codex 的其余结论（信息）：

1. p10 根因和指定的 14 个误报：同意并独立复算，14 个文件集合与 Win7 的 `g4-secret-scan.json` 一致，三个二进制的大小和哈希与 Win7 记录相同；开发机已关闭。扫描器整体安全闭环：部分关闭（N1）。
2. 范围：20 个路径一致，两个检出共 40 个文件与提交树逐字节相同；`60d0d95c…`、`ccf3cb7…` 只改 `docs/`。
3. 假设 50 成立；51 成立（限 `scanRun` 的判定：未取回的 80 个文件中 22 个原本可扫描，由子集关系证明，58 个 `.pak` 本来就被跳过）；52 成立（限列出的配置密钥形态）；53（Electron 22 编译后行断言）、54（修复后 Win7 p10 通过）为 `UNKNOWN`。
4. 重点复核点：交接包把 `(?<!…)` 称为“前瞻”不准确，应为后行断言。`a9-batch2-smoke.cjs` 被 p01、p03～p08、p10 共八个阶段加载，语法错误会使这些阶段在入口前中止。构建期载荷扫描 `build-a9-product-v3.mjs:2371` 仍是无边界规则，本轮未改。UTF-16 文本里的密钥不被扫描，是旧盲点，本轮未加重。
5. 变异：交接包的 14 个全部被拦；另试三个（X1～X3）存活；恢复后 `a9-batch2-smoke.cjs` 的 SHA-256 前缀 `fe5eba22…` 与提交一致。
6. 在 `15b93e3b…` 上跑包测试有 4 个失败（任务书里的两处字面量触发 `A9_SENSITIVE_PAYLOAD_PROHIBITED`）；`7ea9acb0…` 改词后 120 通过。预演包必须从通过包测试的提交构建，`7ea9acb0…` 的结果不能补签 `15b93e3b…`。
7. 沙箱内 jest 210 通过，7 个用例因 `listen EPERM 127.0.0.1` 为 `UNKNOWN`（与前几轮相同的 7 个）；新增用例通过。

建议的修复（等负责人裁决，未实施；全部在 [§6.1](#61-拟批准精确允许路径) 的 20 个路径内，不改产品代码）：

1. 左边界允许转义结尾：字母或数字作前驱时，只有当它是 JSON 转义（`\n`、`\t`、`\r`、`\f`、`\b`）、`\uXXXX`、`\xXX` 或 `%XX` 的最后一个字符时仍判命中。其他字母数字前驱仍不命中，任务编号和符号名仍被排除。
2. 开发机探针（临时脚本，未写入仓库）：23 个情形全部符合预期。11 种转义或百分号编码后的密钥命中；任务编号（含换行转义之后的）、两种符号名、字母、数字、`n`、`t` 作前驱不命中。
3. 补用例：六种 JSON 转义、`\u0000`、`%20`、`%0A`、`\x0a`、双重转义后的密钥命中；任务编号在换行转义之后不命中；尾部含 `_`、`-` 的密钥命中（关 X1、X2）；带密钥的 `.exe` 被扫描（关 X3）。
4. 用修复后的扫描器重新回放预演 8 的证据，期望仍是 0 个命中；重做 14 个旧变异并加新变异。
5. 修复结果送 codex 第 8 轮复审，范围限本修复。
6. 预演 9 包必须从通过包测试的提交构建；任务书与交接包里不写形态匹配构建期载荷扫描的字面量。

未知与未验证：

- 其他编码（base64、UTF-16、HTML 实体）里的密钥不被扫描：旧盲点，未加重。
- 修复在 Electron 22、Win7 上能否编译并通过 p10：`UNKNOWN`，要靠预演 9。
- 上述修复的效果：未在 Win7 实机验证。

预算与计时：预演 8/9 已用；请求 41/64；预演 9 包未构建，授权文件未批准；窗口 `2026-10-16T06:59:59Z` 不变。KL-1～KL-6 仍有效；任何 Alpha 2 结论必须带上 KL-3、KL-5 与 KL-6a。

本节不开修复轮，不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.38 第二个扫描器修复轮（2026-10-14）

结论：执行代理已按负责人裁决开第二个扫描器修复轮，关闭 codex 第 7 轮的 N1（P1）和 N2（P2），并修正这次修复自带的一个耗时问题。修复提交为 `b192007e55c680e2054d3cf6ceaa79d15daca4a9`（转义边界）和 `d6d11fb50b7a6c829f41d08d7144b1fbef078d86`（先匹配字面量），待送 codex 第 8 轮复核；复核结论未出，预演 9 包未构建。
证据层级为开发机（Node 20.17.0），绑定提交 `d6d11fb5…`。修复后的扫描器没有在 Electron 22、Win7 上运行，`NOT_PERFORMED`。未在 Win7 实机验证。

裁决记录：负责人 2026-10-14 回复“选A，含停止规则，同意提交这些文档”。§6.37 等文档已提交（`4b6efb9…`）。
停止规则：codex 第 8 轮若只剩 P2 及以下，执行代理登记 KL-7，不开第三个扫描器修复轮。第 8 轮若有 P0 或 P1，执行代理不自行开新轮，报告负责人裁决。

改动（全部在 [§6.1](#61-拟批准精确允许路径) 的 20 个路径内，不改产品代码）：

| 路径 | 改动 |
|---|---|
| `release/win7-product-v3/a9-batch2-smoke.cjs` | `api-key-prefix` 的前驱判断：字母或数字作前驱时仍不命中，除非它是完整转义的最后一个字符。完整转义指 `\n`、`\t`、`\r`、`\f`、`\b`、`\uXXXX`、`\xXX` 与 `%XX`。正则先写字面量，再在其后用后行断言检查前驱。其余正则、正控、遍历、哈希清单不变 |
| `src/shell/tests/product/a9-batch2-contract.test.ts` | 新增 1 个用例：七种 JSON 转义字符、双重转义、十三种前驱形态命中；十一种不完整前驱不命中；任务编号和符号名在转义之后仍不命中；密钥主体含 `_`、`-` 的命中，含 `.` 的不命中；耗时不超过纯字面量搜索的 10 倍加 100 毫秒；`scanRun` 对 `.exe`、`.dll`、`.json`、`.txt`、无扩展名文件不跳过，对五种媒体扩展名跳过 |

范围：相对 `7e96f561…` 仍是 20 个路径。

对 codex 第 7 轮发现的对应：

| 编号 | 处理 | 开发机依据 |
|---|---|---|
| N1（P1） | 左边界允许完整转义结尾 | 新用例覆盖 JSON.stringify 写出的 `\n \t \r \f \b \u0000 \u001b`、双重转义、`%20 %0A %0d %7C`、`\x0a \x1B`、`\u000a \u00E9`；任务编号与符号名在转义之后仍不命中；独立探针 23 个情形 0 个不符 |
| N2（P2） | 补三个存活变异的用例 | 尾部字符集删去 `_`（M31）、删去 `-`（M32）、`scanRun` 跳过 `.exe`（M38）均被新用例拦住 |

转义形态的依据：本套件的序列化器是 `JSON.stringify`（写 `\n \t \r \f \b \uXXXX`）、`util.inspect`（写 `\n \t \r \f \b \xXX`）和 URL 编码（写 `%XX`）。执行代理在 Node 20.17.0 上对 12 个控制字符与扩展字符逐个核对了这三种输出。`\v`、`\0`、`\a`、八进制和 `\u{…}` 不是这三个序列化器的输出，不在枚举内；这是开发机依据，Electron 22 的 Node 16.17.1 未核对。

耗时问题与处理：第一版修复（`b192007e…`）把前驱断言写在字面量之前，引擎要在每个位置求值。执行代理在开发机对 157.6 MB 的 `electron.exe` 实测：旧正则 23 毫秒，第一版 1593 毫秒，约 70 倍；p10 在 Win7 上会扫这个文件。改写为先匹配字面量 `sk-`，再在其后用后行断言检查前驱：同一文件 22 毫秒，与旧正则相同。两种写法在 40 万与 60 万个随机文本上逐项一致，0 个差异。新用例加了耗时断言。Win7 上的实际耗时：`UNKNOWN`，要靠预演 9。

验证（开发机，执行代理）：

| 项 | 结果 |
|---|---|
| 新用例与既有扫描用例（jest 按 secret、api-key-prefix 过滤） | 17 通过，连跑 3 次稳定 |
| shell jest（contract、package-runtime） | 2 个套件、218 个用例通过（contract 175、package-runtime 43） |
| `tsc --noEmit`（`src/shell`） | 退出码 0 |
| `node --test`（两个包测试文件） | 120 通过、0 失败，360 秒（两个代码文件已是 `d6d11fb5…` 的内容） |
| 变异 | 45 个，全部被拦，变异后文件与备份逐字节相同。覆盖：三类转义各自删除、字符集缺一个、位数多一位或少一位、大小写、缺反斜杠或百分号、边界字符集缩小、旧正则、第 7 轮正则、慢写法、密钥主体字符集、长度下限 19/21/30、条目删除、字面量前缀改动、`scanRun` 跳过五种扩展名 |
| 回放预演 8 取回的证据 | 修复后的扫描器：229 个可扫描文件 0 个命中，正控检出；三个 `driver-electron` 二进制 0 个命中。旧正则：11 个 JSON 文件、3 个二进制命中，与 Win7 的 `g4-secret-scan.json` 一致 |

未知与未验证：

- 修复后的扫描器在 Electron 22、Win7 上能否编译、耗时多少、是否通过 p10：`UNKNOWN`，要靠预演 9。`a9-batch2-smoke.cjs` 被 p01、p03～p08、p10 共八个阶段加载，语法错误会使这些阶段中止。
- 其他编码（base64、UTF-16、HTML 实体）里的密钥不被扫描：旧盲点，未加重。
- 构建期载荷扫描 `build-a9-product-v3.mjs:2371` 仍是无边界规则，本轮未改。
- 预演 8 未取回的 80 个 `driver-electron` 文件的回放：`NOT_PERFORMED`。

预算与计时：预演 8/9 已用；请求 41/64；预演 9 包未构建，授权文件未批准；窗口 `2026-10-16T06:59:59Z` 不变。预演 9 包必须从通过包测试的提交构建。KL-1～KL-6 仍有效；任何 Alpha 2 结论必须带上 KL-3、KL-5 与 KL-6a。

本节不构建预演包，不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.39 codex 第 8 轮复核与第三个扫描器修复轮（2026-10-14）

结论：codex 对 `d6d11fb5…` 报告 0 个 P0、1 个 P1、2 个 P2，不建议进入预演 9 的授权评审。执行代理已按负责人的新裁决直接开第三个扫描器修复轮，修复提交 `fc5211fd80602978895d35aa4a956d5263320876`，待送 codex 第 9 轮复核；复核结论未出，预演 9 包未构建。
证据层级为开发机（Node 20.17.0），绑定提交 `fc5211fd…`。修复后的扫描器没有在 Electron 22、Win7 上运行，`NOT_PERFORMED`。未在 Win7 实机验证。

过程：codex 2026-10-14T14:13:22Z 启动，14:40:00Z 完成，退出码 0；报告与证据存档在 `.acceptance/a9-33-review/codex-stage2-round8-20261014/`，243 个文件有 `SHA256SUMS.txt`，复核 0 个不一致；报告 SHA-256 前缀 `c9dc46d1…`。codex 在自己的复核根里做了 49 个变异、63 万项等价检验和 42 种形态探针，细节见存档。

负责人裁决（2026-10-14，codex 第 8 轮运行期间，原话）：

1. “若有 P0 或 P1，直接进行修复，并经过codex审批；然后继续进行验证”
2. “若有 P0 或 P1，直接进行修复，并经过codex审批；然后继续进行预演；修复，预演均无需审批，直接开始”
3. “预演 9 出现失败：预算已满，再预演也无需审批直接增加上限”

执行代理的理解（负责人可纠正）：

| 项 | 内容 |
|---|---|
| 不再逐步等批准 | 修复、构建预演包、授权文件、R1～R8 预演。授权文件的哈希先在聊天报告，不等批准回复 |
| 8 小时计时 | 从各次授权文件生成时刻起算 |
| 预演次数上限 | 取消 |
| 仍有效 | 请求总数 64（已用 41，每次预演上限 16），窗口 `2026-10-16T06:59:59Z`，同一类失败连续两次先诊断再暂停，修复只在 [§6.1](#61-拟批准精确允许路径) 的 20 个路径，Win7 动作限闭集 R1～R8，单次运行不超过 7200 秒，不装软件、不改系统与安全设置、不动旧根、不读私钥、不用真实 Provider |
| 仍不做 | 推送或合并、冻结、关口 A 或 B、接受 ADR-0155、签 A9-32 `DEVELOPER_VERIFIED`、下载、碰 Win10 |

codex 第 8 轮发现与执行代理的核实：

| 编号 | 级别 | 发现 | 核实与处理（开发机） |
|---|---|---|---|
| N3 | P1 | 序列化叠加使含明文密钥的 p10 误通过：URL 编码后的 JSON 换行（`%5Cn`）、URL 编码后的 `util.inspect` 输出、两次 URL 编码的换行或空格，当前枚举都不认 | 成立。执行代理独立复现 8 种叠加形态：旧正则全命中，`d6d11fb5…` 全不命中。根因是“枚举完整转义”的做法无法覆盖叠加。改为逐层还原序列化后再判断前驱字符，见下 |
| N4 | P2 | 转义例外重新误报合法路径和编码后的普通单词：`C:\t` 加密钥形态的目录名；`%61`、`\u0061` 解码后是普通字母 | 部分成立。`%61`、`\u0061`（及 `\x61`、`%41`、`%39`）现在按解码后的字母处理，不再报告。目录名形态与转义的制表符无法区分，保持报告，登记 KL-7（见下） |
| N5 | P2 | 两个存活变异：只扫描文件前 1024 字节；跳过以点开头的文件 | 成立，是测试缺口。新用例补：隐藏文件、隐藏目录、偏移 2 MiB 之后的密钥；两个变异均被拦 |

修复（全部在 20 个路径内，不改产品代码）：

| 路径 | 改动 |
|---|---|
| `release/win7-product-v3/a9-batch2-smoke.cjs` | `api-key-prefix` 不再是单个正则，改为函数：先按字面量 `sk-` 加后随 20 个密钥字符找候选；对每个候选取其前 96 个字符，逐层还原 JSON（`\n \t \r \f \b \uXXXX`）、`util.inspect`（`\xXX`）与 URL（`%XX`）的序列化，最多 6 层；任一层的最后一个字符不是字母或数字，即判为密钥起点；还原后仍是字母或数字则不报告；超过 6 层仍无法判定时报告。不再使用后行断言。其余正则、正控、遍历、哈希清单不变 |
| `src/shell/tests/product/a9-batch2-contract.test.ts` | 同一用例扩充：叠加形态 10 种；解码为字母的 7 种不报告；五层 URL 编码下的字母不报告、八层时报告；组合检验（5 种序列化器、最多 3 层、156 种序列、每种 25 个前驱字符，共 3900 个情形，期望由“还原后的前驱字符”决定）；已接受的目录名形态；稠密候选耗时断言；隐藏文件、隐藏目录、偏移 2 MiB 之后的密钥 |

KL-7（本节登记）：p10 对“反斜杠、`n t r f b` 之一、`sk-`、不少于 20 个密钥字符”形态的路径分量，在原始文本和 JSON 文本里都会判 `SECRET_FOUND`，属于过度报告。原因：该形态与转义的换行、制表符等无法区分。方向是多报，不会漏报。预演中若出现，执行代理先核对命中位置再分类。预演 8 的 229 个取回文件和 3 个二进制回放 0 个命中。

验证（开发机，执行代理）：

| 项 | 结果 |
|---|---|
| 扫描相关用例（jest 按 secret、api-key-prefix 过滤） | 17 通过 |
| shell jest（contract、package-runtime） | 2 个套件、218 个用例通过（contract 175、package-runtime 43） |
| `tsc --noEmit`（`src/shell`） | 退出码 0 |
| `node --test`（两个包测试文件） | 120 通过、0 失败，378 秒（两个代码文件已是 `fc5211fd…` 的内容） |
| 变异 | 65 个，全部被拦，变异后文件与备份逐字节相同。第一次运行有 4 个存活（3 层上限、3 个等价的转义项）：补了“五层下的字母不报告”用例，并删去 3 个对判定无影响的还原项（`\\`、`\"`、`\/`），重跑后全部被拦 |
| 随机性质检验 | 80 万个随机文本：命中必是旧无边界正则的命中；第 7 轮正则的命中一个不丢；与第一版（`b192007e…`）无差异 |
| 回放预演 8 取回的证据 | 229 个可扫描文件 0 个命中，正控检出；三个 `driver-electron` 二进制 0 个命中。旧正则：11 个 JSON 文件、3 个二进制命中，与 Win7 的 `g4-secret-scan.json` 一致 |
| 耗时 | 157.6 MB 的 `electron.exe` 整个 `scanBytesForSecrets`：91～108 毫秒（纯字面量搜索 22 毫秒）；15 万个被拒绝的候选 4.35 MB：32 毫秒 |

未知与未验证：

- 修复后的扫描器在 Electron 22、Win7 上的耗时与 p10 结果：`UNKNOWN`，要靠预演 9。`a9-batch2-smoke.cjs` 被 p01、p03～p08、p10 共八个阶段加载。新写法不含后行断言，只用字面量正则、前瞻和 `String.prototype.replace` 回调，Node 16.17.1 的兼容风险比上一版小；仍是 `UNKNOWN`。
- 还原的形态限于 JSON、`util.inspect`、URL 三种序列化；HTML 实体、`\v`、`\0`、八进制、base64、UTF-16 里的密钥不被还原或扫描：旧盲点，未加重。
- 构建期载荷扫描 `build-a9-product-v3.mjs:2371` 仍是无边界规则，本轮未改。
- 预演 8 未取回的 80 个 `driver-electron` 文件的回放：`NOT_PERFORMED`。

预算与计时：预演 8 次已用，上限已取消；请求 41/64；预演 9 包未构建；窗口 `2026-10-16T06:59:59Z` 不变。预演包必须从通过包测试的提交构建。KL-1～KL-7 有效；任何 Alpha 2 结论必须带上 KL-3、KL-5、KL-6a 与 KL-7。

本节不构建预演包，不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.40 codex 第 9 轮复核与第四个扫描器修复轮（2026-10-14）

结论：codex 对 `fc5211fd…` 报告 0 个 P0、1 个 P1、2 个 P2，不建议进入预演 9 的授权评审。执行代理按负责人 2026-10-14 的裁决直接开第四个扫描器修复轮，修复提交 `c869661e4c7528a2ac87d66daa6ba1104770133c`，待送 codex 第 10 轮复核；复核结论未出，预演 9 包未构建。
证据层级为开发机（Node 20.17.0），绑定提交 `c869661e…`。修复后的扫描器没有在 Electron 22、Win7 上运行，`NOT_PERFORMED`。未在 Win7 实机验证。

过程：codex 2026-10-14T15:08:46Z 启动，15:32:07Z 完成，退出码 0；报告与证据存档在 `.acceptance/a9-33-review/codex-stage2-round9-20261014/`，313 个文件有 `SHA256SUMS.txt`，复核 0 个不一致；报告 SHA-256 前缀 `20c99797…`。codex 在自己的复核根里做了 69 个变异、40 万个随机文本和 20306 个组合检验，细节见存档。

同类提示（执行代理的停止规则，负责人 2026-10-14 回复“同意停止规则，继续推进”）：第 7、8、9 轮的 P0/P1 都落在“密钥前一个字符的判定”这一类上（N1、N3、N6）。执行代理先诊断共同根因再修，没有叠加第四个补丁；若第 10 轮仍有这一类的 P0 或 P1，执行代理暂停并向负责人报告，不开第五个修复轮。

根因诊断：第 8 轮实现取“密钥前 96 个字符”作上下文，再逐层还原。固定窗口产生两个缺陷：

1. 转义链比窗口长时，窗口截掉链的起点，剩下的全是字母和数字，函数把它当作普通单词返回“不是密钥起点”，不会走“超限报告”分支（N6）。
2. 窗口里同一行的其他字段也被还原，无关的八层编码耗尽层数，普通任务编号被判为超限而报告（N7）。

codex 第 9 轮发现与执行代理的核实：

| 编号 | 级别 | 发现 | 核实与处理（开发机） |
|---|---|---|---|
| N6 | P1 | 48 层及以上 URL 编码的换行或空格，前缀 97 个字符；96 字符窗口截掉最左的 `%`，p10 误通过 | 成立。执行代理复现：1 至 47 层命中，48、49、50、60、100、300、511、600 层全部漏检，外包 JSON 同样漏检。修复见下，现 1 至 600 层全部命中 |
| N7 | P2 | 同一行里无关字段的八层 URL 编码耗尽层数，任务编号 `task-…` 和 Vulkan 符号名被误报 | 成立。执行代理复现任务编号与符号名两种误报。现 1、7、8、9、50 层的无关字段后，任务编号、符号名、`ask-…` 都不报告，同一行的真密钥仍报告 |
| N8 | P2 | 层数上限 6 改为 5 的变异存活，现有用例只覆盖 5 层和 9 层 | 成立，是测试缺口。用例补 `%61` 外包 1、2、5、6 层不报告，7、8、9 层报告。上限 5 和上限 7 的变异都被拦 |

修复（全部在 20 个路径内，不改产品代码）：

| 路径 | 改动 |
|---|---|
| `release/win7-product-v3/a9-batch2-smoke.cjs` | 去掉固定窗口。上下文是“紧贴候选、由转义字符组成的连续一段”加上它前面的一个字符。转义字符是十六进制数字、`%`、反斜杠、`u`、`x`、`n`、`t`、`r`（`f`、`b` 已含在十六进制数字内）；这一段向左取到第一个不是转义字符的位置，转义链因此不会被截断，其他字段也进不来。连续长度到 `KEY_MAX_RUN`（1024）时不判断，直接报告。逐层还原（最多 6 层，第 7 次变化时报告）、候选查找、正控、遍历、哈希清单不变 |
| `src/shell/tests/product/a9-batch2-contract.test.ts` | 同一用例扩充：6 层边界（1、2、5、6 层不报告，7、8、9 层报告）；N6（1 至 600 层的换行，48、50、100 层的空格以及外包和内含 JSON 的形态）；N7（无关字段 1、7、8、9、50 层，三类普通词与真密钥并存）；长度上限（1023 个不报告，1024 个报告，有无前导字符各一）；紧贴密钥的字母 `g`、`Z`、`q`、`zz`、`%g` 不报告；由两个转义拼出换行的 `%5C%6E` 与 `\x5c\x6e`；长转义段的耗时断言 |

KL-7 追加边界 b（与第 8 轮登记的路径分量边界 a 同方向，都是过度报告，不会漏报）：紧贴 `sk-` 加不少于 20 个密钥字符的前面，如果有连续 1024 个及以上的转义字符，p10 判 `SECRET_FOUND`。清洁证据里这种形态的概率很低；预演 9 若出现，执行代理先核对命中位置再分类。KL-7 的携带规则不变：任何 Alpha 2 结论必须带上 KL-3、KL-5、KL-6a 与 KL-7（含边界 a、b）。

验证（开发机，执行代理）：

| 项 | 结果 |
|---|---|
| 扫描相关用例（jest 按 secret、api-key-prefix 过滤） | 17 通过 |
| shell jest（contract、package-runtime） | 2 个套件、218 个用例通过 |
| `tsc --noEmit`（`src/shell`） | 退出码 0 |
| `node --test`（两个包测试文件） | 120 通过、0 失败（404 秒，2026-10-14T15:52:54Z～15:59:38Z，执行代理） |
| 变异 | 84 个，全部被拦，变异后文件与备份逐字节相同。第一次运行有 2 个存活（`%`、反斜杠不算转义字符）：原因是用例里没有“转义链含两个起点符号”的形态，补 `%5C%6E`、`\x5c\x6e` 后重跑，2 个都被拦。含层数上限 5 和 7、转义段上限 1023 和 1025、改回旧的 96 字符窗口 |
| 组合检验 | 156 种序列 × 27 个前驱字符 × 7 种包装（无包装、无关 8 层字段、无关 50 层字段、整体再 URL 编码 40 层和 60 层、整体再 JSON 两层、长十六进制前缀），共 29484 个情形：漏报密钥 0 个；整体 URL 编码 40 层、60 层时字母前驱各有 304 个被报告（超过 6 层按设计报告，方向是多报） |
| 随机性质检验 | 80 万个随机文本：命中必是旧无边界正则的命中；第 7 轮正则的命中一个不丢（0 个例外） |
| codex 第 9 轮探针脚本重跑 | 1 至 60 层 60 项全部命中；URL 48 层、50 层的 p10 为 FAIL（`SECRET_FOUND`），第 8 轮为 PASS；无关深层字段加任务编号为 PASS；负面形态的命中集合与 codex 报告一致（KL-7 路径、编码后的标点、`Lw/sk-…` 形态，第 9 轮报告已列） |
| 回放预演 8 取回的证据 | 229 个可扫描文件 0 个命中，正控检出；三个 `driver-electron` 二进制 0 个命中。旧正则：11 个 JSON 文件、3 个二进制命中，与 Win7 的 `g4-secret-scan.json` 一致 |
| 耗时 | 157.6 MB 的 `electron.exe` 整个 `scanBytesForSecrets`：127 毫秒；15 万个被拒绝的候选 4.35 MB：22 毫秒；用例里加了候选前有 500 个转义字符的 20000 个候选，断言阈值 1500 毫秒 |

线性耗时论证：每个候选的转义段在第一个非转义字符处停止，而候选自带的 `s`、`k`、`-` 都不是转义字符，所以相邻候选的转义段互不重叠，总耗时与文本长度成正比；单个候选的转义段上限 1024。

未知与未验证：

- 修复后的扫描器在 Electron 22、Win7 上的耗时与 p10 结果：`UNKNOWN`，要靠预演 9。`a9-batch2-smoke.cjs` 被 p01、p03～p08、p10 共八个阶段加载。新增 `Uint8Array` 查表、`String.prototype.charCodeAt`，均为长期存在的 API，Node 16.17.1 兼容风险低；仍是 `UNKNOWN`。
- 还原的形态限于 JSON、`util.inspect`、URL 三种序列化；HTML 实体、旧式 `%uXXXX`、`\v`、`\0`、八进制、base64、UTF-16 里的密钥不被还原或扫描：旧盲点，未加重。
- 构建期载荷扫描 `build-a9-product-v3.mjs:2371` 仍是无边界规则，本轮未改。
- 预演 8 未取回的 80 个 `driver-electron` 文件的回放：`NOT_PERFORMED`。

预算与计时：预演 8 次已用，上限已取消；请求 41/64；预演 9 包未构建；窗口 `2026-10-16T06:59:59Z` 不变。预演包必须从通过包测试的提交构建。KL-1～KL-7 有效。

本节不构建预演包，不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.41 codex 第 10 轮复核结论与进入预演 9（2026-10-14）

结论：codex 对 `c869661e…` 报告 0 个 P0、0 个 P1、0 个新 P2，N6、N7、N8 已关闭，建议进入预演 9。按 [§6.40](#640-codex-第-9-轮复核与第四个扫描器修复轮2026-10-14) 的停止规则和负责人 2026-10-14 的裁决，不开新的修复轮；执行代理把 codex 报告的一条信息项登记为 KL-7 边界 c，然后构建预演 9 包。
证据层级为开发机（macOS、Node 20.17.0），绑定代码提交 `c869661e…`。对预演 8 证据的读取结论是 Win7 实机（预演，非验收证据）。修复后的扫描器在 Electron 22、Win7 上的运行与 p10 结果仍是 `NOT_PERFORMED` 与 `UNKNOWN`。未在 Win7 实机验证。

过程：codex 2026-10-14T16:23:51Z 启动，16:44:00Z 完成，退出码 0；报告与证据存档在 `.acceptance/a9-33-review/codex-stage2-round10-20261014/`，362 个文件有 `SHA256SUMS.txt`，复核 0 个不一致；报告 SHA-256 前缀 `12cf277d…`。检出 `66d7092b…`，交接包第 2 节各预期全部一致。

codex 第 9 轮发现的关闭情况：

| 编号 | 结论 | codex 依据 |
|---|---|---|
| N6（P1） | 已关闭 | 换行、空格的 URL 编码 1 至 600 层，原文、外包 JSON、内含 JSON 共 3600 项漏检 0；四层以内 781 种序列 × 27 个前驱共 21087 项与期望不符 0；真实 `scanRun` 与 `runPostflightPhase`：URL 48 层、600 层为 FAIL（`SECRET_FOUND`），无关深层字段加任务编号为 PASS |
| N7（P2） | 已关闭（限原跨字段形态） | 无关字段 1、7、8、9、50 层，分别配任务编号、两种 Vulkan 符号、`ask-…`，共 20 项不报告；同一行真密钥仍报告 |
| N8（P2） | 已关闭 | 层数上限 6 改 5 在第六层断言失败，改 7 在第七层断言失败 |

codex 的独立检查（开发机）：

| 项 | 结果 |
|---|---|
| 范围 | `PATHS_MATCH`；`20 files changed, 9618 insertions(+), 31 deletions(-)`；本轮 2 个文件 `56 insertions(+), 16 deletions(-)`；60/60 白名单文件与提交对象逐字节一致 |
| 包测试 | `node --test` 120 通过、0 失败 |
| shell jest | 211 通过、7 个用例因沙箱禁止回环监听（`listen EPERM`）失败，标 `UNKNOWN`（沙箱）；扩充的扫描用例通过。执行代理在无沙箱环境的 218 个全通过结果不变 |
| 变异 | 84 个指定变异加 4 个额外变异（X01～X04），全部被行为断言拦住；X04 与 C09 行为等价，codex 不称为独立盲点 |
| 性质 | 40 万加 1 万个随机文本：命中必是旧无边界正则的命中，第 7 轮正则的命中一个不丢，0 个反例 |
| 耗时 | 157.6 MB 的 `electron.exe` 整个 `scanBytesForSecrets` 135～156 毫秒（纯字面量搜索 53～68 毫秒）；每段 500 字符的 2 万与 4 万个候选 56～70 毫秒与 107～118 毫秒，线性；三项耗时断言通过 |
| 回放 | 预演 8 取回的证据：229 个文件 0 个命中，正控检出；三个二进制 0 个命中；旧正则 11 个 JSON 文件与 3 个二进制命中 |

信息项，登记为 KL-7 边界 c（与边界 a、b 同属 p10 过度报告，方向是多报，不会漏报）：紧贴 `sk-` 的转义段里，如果含有超过六层仍在变化的编码链，即使真实前驱是普通单词也会报告。codex 的例子是整串 URL 编码 48 层的“空格加任务编号”：当前报告，`fc5211fd…` 不报告；7、8 层时两版都报告。清洁证据里这种形态的概率很低；预演 9 若出现，执行代理先核对命中位置再分类。

KL-7 现含边界 a（路径分量 `C:\t` 加密钥形态）、边界 b（连续 1024 个及以上转义字符）、边界 c（紧贴的超六层编码链）。任何 Alpha 2 结论必须带上 KL-3、KL-5、KL-6a 与 KL-7（含边界 a、b、c）。

未知与未验证：

- 修复后的扫描器在 Electron 22、Win7 上的耗时与 p10 结果：`UNKNOWN`，要靠预演 9。codex 从仓库内文件确认 Electron 22.3.27、Node 16.17.1、ABI 110，没有记录 V8 精确补丁版。
- 80 个未取回的 `driver-electron` 文件（22 个可扫描、58 个 `.pak` 被跳过）的逐字节回放：`NOT_PERFORMED`。codex 与执行代理都只做了源码推断：当前规则是旧无边界规则的子集，遍历与其他规则未变。
- 还原的形态限于 JSON、`util.inspect`、URL 三种序列化；HTML 实体、旧式 `%uXXXX`、`\v`、`\0`、八进制、base64、UTF-16 里的密钥不被还原或扫描：旧盲点，未加重。
- 构建期载荷扫描 `build-a9-product-v3.mjs:2371` 仍是无边界规则，本轮未改。

下一步（负责人 2026-10-14 裁决：修复与预演均无需审批、预演次数上限取消）：执行代理从通过包测试的文档提交构建预演 9 包，生成授权文件并在聊天里先报哈希，再依 R1～R8 上 Win7。请求总数 41/64，单次预演上限 16；若某次预演的请求数会使总数超过 64，先暂停报告。窗口 `2026-10-16T06:59:59Z` 不变。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

### 6.42 预演 9 执行记录与分类（2026-10-14）

结论：预演 9 的 10 个阶段、25 个用例、42 条断言在 Win7 上全部 PASS，p10 秘密扫描通过，是第 1 次连续成功预演。它不是验收证据。
证据层级为 Win7 实机（预演，非验收证据），绑定源提交 `0af45d36…`、套件代码 `c869661e…`、run `d1d1274e…`、授权文件 SHA-256 `3b70c99d…`、ZIP `f3edefcb…`。执行者是执行代理，目标 `dccs-chaizl-PC`，账户 agent，SID 与授权文件一致。

执行（UTC，2026-10-14；原始记录在 `.acceptance/a9-33-rehearsal/rehearsal-9/`，该目录不入库）：

| 步骤 | 时间 | 结果 |
|---|---|---|
| R1、R2 | 16:48:50Z～16:49:03Z | 只读检查；创建运行根 `C:\A9-W43\run\d1d1274e` |
| R3 | 16:49:16Z～17:00:09Z | 上传 ZIP 与 11 个粘合文件；certutil 复核 11/11 哈希与开发机相同 |
| R4 | 17:00:19Z | Win7 本机解压，800 个文件，`EXTRACT_PASS` |
| R5、R6 | 17:00:44Z～17:08:05Z | 10 个阶段顺序运行，阶段间任务门禁均为 `PASS []`，每个阶段任务运行后删除 |
| R7 | 17:08:27Z | Win7 本机 `SUM_TREE_PASS files=328`；取回 245 个文件，0 个哈希不一致，0 个缺失；83 个 `driver-electron` 文件不取回 |
| R8 | 17:09:20Z～17:09:21Z | 无 electron、spike02、node.exe、powershell、a9-batch2 残留进程；`A9W43*` 计划任务 0 个；agent 仍在 console 会话 2 |

结果（执行代理读取取回的证据）：

| 项 | 结果 |
|---|---|
| 阶段 | p01～p10 全部 PASS，失败 0 |
| 用例与断言 | 25 个用例、42 条断言全部 PASS（上次 p10 秘密扫描 FAIL，断言 41/42） |
| 报告校验 | p09 统计到 p08：8 个阶段、23 个用例、39 条断言；8 个负例 NEG-* 全部被拒绝且类别匹配；失败尝试 0 |
| 请求账本 | 10 次 CONSUMED、10 次 COMPLETED，全部 PASS；本次 10 个请求，累计 51/64 |
| p10 | 扫描 250 个文件，命中 0；正控检出 api-key-prefix、configured-secret-literal、bearer-token 三类；后检残留 0；整个 p10 阶段 2.5 秒 |

已知限制观察：

1. KL-3：B2-CH-02 的第一个 IPC 帧在 1408 毫秒，DOM 帧最大 0，按设计只记录不断言。
2. KL-5：S04 的 UTF-8 与 CRLF 通过；UTF-16LE 与 CP936 为 `INFORMATIONAL`，未通过。
3. KL-6a：UI-02 实测 8 个布局，宽度 1368 与 1094，页面缩放 1 与 1.25，不是 Windows DPI 缩放；800 以下宽度为 `NOT_VERIFIED`。
4. KL-7 边界 a、b、c：本次证据里没有出现。

未知与未验证：

- 83 个 `driver-electron` 文件的逐字节扫描回放：`NOT_PERFORMED`。
- UTF-16、base64、HTML 实体等编码里的密钥：不被扫描，旧盲点，未加重。
- 构建期载荷扫描 `build-a9-product-v3.mjs:2371` 仍是无边界规则，本轮未改。
- 两次连续成功是冻结前的条件（[§2](#2-候选与执行合同)的预演要求）；本次是第 1 次，第 2 次尚未运行。

下一步（负责人 2026-10-14 裁决：预演无需审批、预演次数上限取消）：执行代理用同一个 ZIP（`f3edefcb…`，字节不变）生成预演 10 的新授权文件和新 run，在聊天里先报授权文件哈希，再依 R1～R8 上 Win7。预演 10 若出现失败，连续计数归零，按 [§6.4](#64-停止诊断与核号) 先诊断。请求总数 51/64，预演 10 的 10 个请求使累计达到 61/64；若还需要预演 11，累计会超过 64，先暂停报告。窗口 `2026-10-16T06:59:59Z` 不变。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。KL-3、KL-5、KL-6a 与 KL-7（含边界 a、b、c）仍有效。未在 Win7 验收通过。

### 6.43 预演 10 失败、驱动残留进程与第 5 个驱动修复（2026-10-14）

结论：预演 10 在 Win7 上失败，连续成功计数归零。p01～p06 通过，p07、p08 以 `PHASE_RESULT_MISSING` 失败，p09、p10 被套件守卫拒绝。原因是套件缺陷：p06 终止驱动后遗留一个 Electron 网络服务孤儿进程，占用 `driver-electron\electron.exe`，后续阶段复制该文件报 `EBUSY`。预演 9 的全部通过含时序运气。
证据层级为 Win7 实机（预演，非验收证据），绑定源提交 `0af45d36…`、套件代码 `c869661e…`、run `6c90a56e…`、授权文件 SHA-256 `f49a9e7e…`、ZIP `f3edefcb…`（与预演 9 字节相同）。修复是开发机，绑定代码提交 `14d1f43c…`。执行者是执行代理，目标 `dccs-chaizl-PC`，账户 agent，SID 与授权文件一致。

执行（UTC，2026-10-14；原始记录在 `.acceptance/a9-33-rehearsal/rehearsal-10/`，该目录不入库）：

| 步骤 | 时间 | 结果 |
|---|---|---|
| R1、R2 | 17:16:05Z～17:16:15Z | 只读检查无残留；创建运行根 `C:\A9-W43\run\6c90a56e` |
| R3 | 17:16:16Z～17:19:30Z | 上传 ZIP 与 11 个粘合文件；certutil 复核 11/11 哈希与开发机相同 |
| R4 | 17:19:31Z | Win7 本机解压，800 个文件，`EXTRACT_PASS` |
| R5、R6 | 17:19:42Z～17:27:12Z | p01～p06 PASS；p07、p08 FAIL；p09、p10 被拒绝 |
| R8（先于 R7 执行） | 17:28:12Z | 残留 1 个 electron 进程（见下）；`A9W43*` 计划任务 0 个；agent 仍在 console 会话 2 |
| R7 | 17:28:49Z | Win7 本机 `SUM_TREE_PASS files=275`；取回 192 个文件，0 个哈希不一致，0 个缺失；83 个 `driver-electron` 文件不取回 |

结果（执行代理读取取回的证据）：

| 项 | 结果 |
|---|---|
| p01～p06 | PASS，20 个用例、36 条断言 |
| p07、p08 | FAIL，`PHASE_RESULT_MISSING`，各用时不到 1 秒，没有 `phase-result.json` |
| p09、p10 | 被 `SAME_CLASS_FAILURE_TWICE_DIAGNOSE_FIRST` 与 `PREREQUISITE_NOT_PASSED` 拒绝，不计请求 |
| 请求账本 | 8 次 CONSUMED、8 次 COMPLETED；本次 8 个请求，累计 59/64 |
| 控制器错误 | p07、p08 相同：`EBUSY: resource busy or locked, copyfile …\deploy\…\electron.exe -> …\evidence\driver-electron\electron.exe` |

根因（执行代理推断，已用 Win7 取回证据核对，待 codex 独立复核）：

1. p06 的 `continue_unknown_interrupt` 由驱动 PID 4988 运行，被 `taskkill /T /F` 终止（`killed_by=marker`，17:24:12.998Z）。
2. 同一时刻 `product.log` 记录 `Network service crashed, restarting service`（17:24:12.958Z）。重启出的网络服务子进程 PID 4736 不在 `taskkill /T` 一次枚举的子进程列表里，主进程消失后成为孤儿，一直映射着 `driver-electron\electron.exe`，17:29:41Z 复查仍在运行。
3. p07、p08 的 `prepareDriverRuntime` 每个阶段都把整个运行时重新复制一遍，复制被映射的可执行文件时 Windows 返回 `EBUSY`，控制器抛错，没有阶段结果。
4. 对照：预演 9 同一步骤（驱动 PID 3104）的 `product.log` 没有网络服务崩溃记录，R8 无残留，p07、p08 通过。

执行代理的偏差：顺序脚本只在“阶段启动或等待出问题”时停止，p07 失败后没有停下，p08 因此多消耗 1 个请求，p09、p10 各发出 1 个被拒绝的请求（不计账本）。预演 11 起，脚本在任何阶段 FAIL 时停止。

修复（代码提交 `14d1f43c…`，开发机；只改 20 个路径中的 2 个）：

| 文件 | 变更 |
|---|---|
| `release/win7-product-v3/a9-batch2-smoke.cjs` | `copyRuntimeFile`：目标内容相同则不复制，被映射的可执行文件不再报错；`sweepDriverStrays`：套件终止驱动（`marker` 或 `timeout`）后，清扫从本次运行 `driver-electron` 目录运行的进程，两轮列表为空才算完成，列表失败不算空，每次清除记入 `driver-launches.json`；`runDriverPhase`：运行时复制失败时以 `DRIVER_RUNTIME_PREPARE_FAILED` 结束阶段并写出阶段结果；清扫没有清干净的启动记 `DRIVER_STRAY_PROCESS_NOT_REMOVED` |
| `src/shell/tests/product/a9-batch2-contract.test.ts` | 新增 6 个用例 |

开发机验证（执行代理，绑定 `14d1f43c…`）：jest 224 个全部通过，`tsc` 通过，`node --test` 120 个通过，`docs:check` 340 个文件通过，`git diff --check` 无输出。25 个变异中 23 个被拦、1 个等价（去掉大小比较，仍是哈希比较）；M13（`remaining` 条件）与 `observed` 重复，已简化删除。累计范围仍是 20 个路径，`20 files changed, 9887 insertions(+), 31 deletions(-)`。

未知与未验证：

- 修复后的清扫在 Win7 上的行为：`NOT_PERFORMED`。`wmic process get ExecutablePath` 对孤儿进程是否返回完整路径：`UNKNOWN`（执行代理查孤儿用的是 `CommandLine`）。
- 孤儿进程可否被 `taskkill /PID /T /F` 终止：`NOT_PERFORMED`。
- 更晚才出现的孤儿（清扫结束之后才重启的辅助进程）：由 p10 残留检查兜底，未实测。
- 预演 10 遗留的 PID 4736 仍在运行，终止它不在 R1～R8 闭集内，等负责人裁决。

待裁决：请求上限 64，已用 59，预演 11 的常规路径需要 10 个，累计 69；PID 4736 是否终止。两项见 2026-10-14 聊天中的问题 1、2，执行代理按字面保守处理，未自行提高上限，未终止进程。
codex 第 11 轮复核已于 2026-10-14T17:46:43Z 启动（`gpt-6.1-sol`、`xhigh`、非 fast 模式）。交接包 `docs/reports/2026-10/a9_33_independent_review_handoff_stray_sweep_2026-10-14.md`。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。KL-3、KL-5、KL-6a 与 KL-7（含边界 a、b、c）仍有效。未在 Win7 验收通过。

### 6.44 codex 第 11 轮复核结论与第 6 个驱动修复（2026-10-14）

结论：codex 对 `14d1f43c…` 报告 0 个 P0、1 个 P1（N1）、2 个 P2（N2、N3），不建议进入预演 11。执行代理按负责人 2026-10-14 的裁决直接修复，修复提交 `00fd643b…` 已送 codex 第 12 轮复审。第 12 轮结果出来之前，不构建预演 11 包，不上 Win7。
证据层级为开发机（macOS、Node 20.17.0）。原缺陷的读取结论是 Win7 实机（预演，非验收证据）。修复后的清扫在 Win7 上的运行是 `NOT_PERFORMED`。未在 Win7 实机验证。

过程：codex 2026-10-14T17:46:43Z 启动，18:11:00Z 完成，退出码 0。报告与证据存档在 `.acceptance/a9-33-review/codex-stage2-round11-20261014/`，46 个文件有 `SHA256SUMS.txt`，复核 0 个不一致；报告 SHA-256 前缀 `084ea940…`。检出 `14d1f43c…`，范围核对 `PATHS_MATCH`，源码 40/40 份与提交对象一致。

发现与修复：

| 编号 | 级别 | 发现 | 修复（`00fd643b…`） |
|---|---|---|---|
| N1 | P1 | 清扫只看 `listing.failed`。空输出、只有表头、非 CSV 文本、缺 `ExecutablePath` 列的表被累计成两轮干净；在假 exec 的控制流探针里，空输出使 `ui_interrupt` 之后继续执行 `ui_continue`、`ui_layouts`，阶段 PASS | 新增 `usableProcessListing`：表须含 `ProcessId`、`ParentProcessId`、`Name`、`ExecutablePath` 四列，且至少一行 `ProcessId` 为正数，否则按失败列表处理，不算干净轮并重置计数 |
| N2 | P2 | 两个存活变异：删除发现残留后的 `clean=0`（X02）；最大轮数 8 改 7（X03） | 补两个用例：`[干净, 残留, 干净, 干净]` 需要 4 次列表；6 轮残留后 2 轮干净需要第 8 轮 |
| N3 | P2 | `removed` 在发出 kill 后立即追加，顽固进程同时出现在 `removed` 与 `remaining` | 返回 `attempted`、`removed`、`remaining` 三项；`removed` 只含在最近一次可用列表里已不在的进程，失败列表使该判断失效 |

codex 的独立检查（开发机，绑定 `14d1f43c…`）：

| 项 | 结果 |
|---|---|
| 范围 | `20 files changed, 9887 insertions(+), 31 deletions(-)`；本轮 2 个文件 `275 insertions(+), 6 deletions(-)` |
| 包测试 | `node --test` 120 通过、0 失败 |
| shell jest | 216 通过、8 个用例因沙箱禁止回环监听（`listen EPERM`）失败，标 `UNKNOWN`（沙箱）；执行代理在无沙箱环境的 224 个全通过结果不变。其中新增的清扫用例经 `ProviderFixture.listen`，所以交接包写的“只用临时目录和假 exec”不准确 |
| 变异 | 指定 24 个中 23 个被拦、M03 存活（codex 认可限定等价）；另试 X01 被拦，X02、X03 存活（即 N2） |
| 复制耗时 | 自造 157,602,304 字节文件，每次两读、零复制，三次 232～273 毫秒，最高 RSS 约 336.5 MiB；真实 Win7 耗时与内存 `UNKNOWN` |
| 根因 | 孤儿与 `EBUSY` 在同一驱动副本，网络服务重启日志紧邻 marker 终止，强烈支持归因；因果确证、`wmic` 对该孤儿返回完整 `ExecutablePath`、`taskkill /T /F` 对该孤儿的效果都是 `UNKNOWN` |

对 §6.43 与第 11 轮交接包的更正：`driver-launches.json` 的 `strays` 只含 `pid`、`parent_pid`、`name`，没有路径字符串；六个驱动阶段的 `fixtures.evidenceForPhase` 都不含 `driver-launches.json`，既有的递归扫描与清单仍纳入它。§6.43 写的“新增 6 个用例”现为 7 个。

修复的开发机验证（执行代理，绑定 `00fd643b…`）：

| 项 | 结果 |
|---|---|
| shell jest | 225 个全部通过；`driver runtime copy and the sweep` 组 7 个 |
| 类型检查 | `tsc --noEmit` 通过 |
| 包测试 | `node --test` 120 个通过 |
| 变异 | 34 个中 33 个被拦、1 个等价（M03）；含 codex 的 X02（M26）、X03（M16）与 N1、N3 相关的 M27～M34 |
| 范围 | 累计 `20 files changed, 9958 insertions(+), 31 deletions(-)`；相对 `14d1f43c…` 为 `2 files changed, 97 insertions(+), 26 deletions(-)`；仍是 §6.1 的 20 个路径 |

另一处连带修改：既有用例 `the smoke corrupts the mode settings before the unresolved-mode mode starts and restores the original bytes afterwards` 原来给清扫一个空进程表，现在空表属于不可用，该用例改为提供可用的进程表和清扫钩子。

未知与未验证：

- 修复后的清扫在 Win7 上的行为：`NOT_PERFORMED`。
- 清扫结束之后才出现的孤儿：由 p10 残留检查兜底，未实测；清扫的观察窗口是有限的，更晚出现的孤儿 `UNKNOWN`。
- `killTree` 带 `/T`，对树外进程的实际影响：`UNKNOWN`。
- 真实 Win7 上整文件哈希 157 MB 两次的耗时与内存：`UNKNOWN`。
- 83 个 `driver-electron` 文件未取回，扫描回放 `NOT_PERFORMED`；构建期载荷扫描 `build-a9-product-v3.mjs:2371` 未改。

待裁决（仍未回复，执行代理按字面保守处理）：请求上限 64，已用 59，预演 11 的常规路径需要 10 个，累计 69；预演 10 遗留的 Win7 PID 4736 是否终止。预演 11 前，执行代理还要把顺序脚本改为任何阶段 FAIL 即停止。

codex 第 12 轮复核已于 2026-10-14T18:27:28Z 启动（`gpt-6.1-sol`、`xhigh`、非 fast 模式），交接包 `docs/reports/2026-10/a9_33_independent_review_handoff_stray_sweep_2026-10-14.md`（已更新为绑定 `00fd643b…`）。处理规则：有 P0 或 P1，直接修复并送 codex 复审；只剩 P2 及以下，登记已知限制，构建预演 11 包。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。KL-3、KL-5、KL-6a 与 KL-7（含边界 a、b、c）仍有效。未在 Win7 验收通过。

### 6.45 codex 第 12 轮复核结论与第 7 个驱动修复（2026-10-14）

结论：codex 对 `00fd643b…` 报告 0 个 P0、1 个 P1（N1 未关闭）、0 个新的独立 P2，N2 与原 N3 已关闭，不建议进入预演 11。执行代理按负责人 2026-10-14 的裁决直接修复，修复提交 `52bcfb88…` 已送 codex 第 13 轮复审。第 13 轮结果出来之前，不构建预演 11 包，不上 Win7。
证据层级为开发机（macOS、Node 20.17.0）。原缺陷的读取结论是 Win7 实机（预演，非验收证据）。修复后的清扫在 Win7 上的运行是 `NOT_PERFORMED`。未在 Win7 实机验证。

过程：codex 2026-10-14T18:27:28Z 启动，18:49:31Z 完成，退出码 0。报告与证据存档在 `.acceptance/a9-33-review/codex-stage2-round12-20261014/`，286 个文件有 `SHA256SUMS.txt`，复核 0 个不一致；报告 SHA-256 前缀 `be8cf200…`。检出 `00fd643b…`，范围核对 20 个路径逐一匹配，源码 40/40 份与提交对象一致。

发现与处置：

| 编号 | 级别 | 状态 | 依据 |
|---|---|---|---|
| N1 | P1 | 未关闭 | 第 11 轮的六种不可用表已拒绝，但新校验只看首行是否有四个键、某一行 `ProcessId` 为正。CSV 解析给缺失的单元格补空串，也不报告未闭合的引号，所以三种不完整表仍被认作干净：最后一个单元格缺失的短行；正常行之后追加的短行 `HOST,date`；含 driver 路径与 PID 但引号未闭合的行。假 exec 的 `runDriverPhase` 探针里三者都执行 `ui_interrupt`、`ui_continue`、`ui_layouts` 并 PASS；真实 `runPostflightPhase` 在两个不完整表下也是 PASS |
| N2 | P2 | 已关闭 | 补的 4 次查询与第 8 轮用例有效，M26、M16 被拦 |
| 原 N3 | P2 | 已关闭 | 顽固进程为 `attempted=[4736]`、`removed=[]`、`remaining=[4736]`、`observed=false` |
| 原缺陷 | 开发机部分关闭 | | 同字节不覆盖、准备异常生成具名阶段结果有效；清扫仍受 N1 影响 |

codex 的其他独立检查（开发机，绑定 `00fd643b…`）：

| 项 | 结果 |
|---|---|
| 范围 | `20 files changed, 9958 insertions(+), 31 deletions(-)`；本轮 2 个文件 `97 insertions(+), 26 deletions(-)` |
| 包测试 | `node --test` 120 通过、0 失败 |
| shell jest | 217 通过、8 个用例因沙箱禁止回环监听（`listen EPERM`）失败，标 `UNKNOWN`（沙箱）；执行代理在无沙箱环境的 225 个全通过结果不变 |
| 变异 | 指定 M01～M34 共 34 个：33 个被拦，M03 存活（认可限定等价）；另试 3 个新变异全部被拦 |
| 观察窗口 | 500 毫秒、最多 8 轮、连续 2 轮干净；第三轮才出现残留的探针实际只查询 2 次，不能声称覆盖任意更晚的重启 |
| 产品残留 | 清扫只在套件终止驱动之后进行；链路后检和 p10 残留检查保留；`killTree` 的 `/T` 对目录外子孙的影响 `UNKNOWN` |
| 根因 | 同上两轮：强支持，因果确证 `UNKNOWN` |

N1 是第二次未关闭。第 11 轮之后，执行代理只补了第 11 轮列出的坏表形态，漏掉了根因：进程表读取靠宽松的 CSV 解析，坏行被补齐或重新拼合，读取函数无从发现。本轮不再逐个补形态，改读取方式。

修复（代码提交 `52bcfb88…`，开发机；只改 20 个路径中的 2 个）：

| 位置 | 变更 |
|---|---|
| `parseCsvLineStrict` | 严格读一行：引号只能开在单元格开头，带引号的单元格必须闭合且后面只能是逗号或行尾，无引号的单元格里出现引号即读不出，返回 `null` |
| `readWmicTable` | 按行读表：表头名为空或重复、任一行读不出或单元格数与表头不同、没有数据行、输出为空，整张表 `intact=false` 并给出不含输出内容的 `problem`；读得出的完整行照常返回，仍是“有进程”的证据 |
| `listProcesses` | 用 `readWmicTable`；命令失败、有错误、输出被截断或表不完整时 `failed=true`。清扫、环境检查（G0）、链路后检、p10 后检共用它，所以四处对坏表一致地给 `UNKNOWN` 或失败 |
| `usableProcessListing` | 清扫另外要求每行有四列、`ProcessId` 与 `ParentProcessId` 是数字、`Name` 非空，且至少一行 `ProcessId` 为正 |
| 测试文件 | 新增 4 个用例：严格读取单元用例；12 种坏表、3 种形状不对的表、7 种完整表（含 `CR CR LF` 行尾、字节序标记、带引号的逗号、空路径）；固定种子随机破坏 7 种方式各 40 次；环境检查、p10、`runDriverPhase` 的整合用例 |

开发机验证（执行代理，绑定 `52bcfb88…`）：

| 项 | 结果 |
|---|---|
| shell jest | 229 个全部通过（`driver runtime copy and the sweep` 组 11 个） |
| 类型检查 | `tsc --noEmit` 通过 |
| 包测试 | `node --test` 120 个通过 |
| 变异 | 54 个中 53 个被拦、1 个等价（M03）；两个原先存活的变异（`rows.length === 0` 重复判断、结尾逗号特例）是多余代码，已删除；列名中的引号用例补在测试里 |
| 范围 | 累计 `20 files changed, 10150 insertions(+), 31 deletions(-)`；相对 `00fd643b…` 为 `2 files changed, 205 insertions(+), 13 deletions(-)`；仍是 §6.1 的 20 个路径 |
| 既有用例 | 第 12 轮以前的 182 个用例在严格读取下全部通过，没有改夹具 |

未知与未验证：

- 修复后的清扫在 Win7 上的行为：`NOT_PERFORMED`。
- 套件那张表（`ProcessId,ParentProcessId,Name,ExecutablePath,SessionId,CreationDate`）的原始输出从未取回：路径含逗号、行尾形式、无引号这三点在真实 Win7 上 `UNKNOWN`。严格读取在表里有路径含逗号时会把整张表判为不完整，清扫记 `DRIVER_STRAY_PROCESS_NOT_REMOVED`，G0 记 `UNKNOWN`，方向是关闭。旁证：`R10/r1`、`R9/r1`、`R10/r8` 三份真实输出（102、102、104 行，用的是带命令行列的另一个查询）里没有路径含逗号的行。
- 表完整、形状对、但孤儿那一行的路径为空：清扫看不到它。这是第 12 轮记的既有 `UNKNOWN`，没有加“自身进程必须有非空路径”的自检，因为它在真实 Win7 上的行为没有证据，误判会让每次清扫失败。
- 整行被删，或最后一个单元格被截短但个数对：与“进程不存在”无法区分，不属于缺陷。
- `problem` 只在内存里返回，不写入证据；Win7 上要看原因时用 R1 的只读 `wmic` 命令重取。
- 真实 Win7 上整文件哈希 157 MB 两次的耗时与内存：`UNKNOWN`。

待裁决（仍未回复，执行代理按字面保守处理）：请求上限 64，已用 59，预演 11 的常规路径需要 10 个，累计 69；预演 10 遗留的 Win7 PID 4736 是否终止。预演 11 前，执行代理还要把顺序脚本改为任何阶段 FAIL 即停止（脚本已改，未用）。

codex 第 13 轮复核已于 2026-10-14T19:09:35Z 启动（`gpt-6.1-sol`、`xhigh`、非 fast 模式），交接包 `docs/reports/2026-10/a9_33_independent_review_handoff_process_table_strict_2026-10-14.md`。处理规则：有 P0 或 P1，直接修复并送 codex 复审；只剩 P2 及以下，登记已知限制，构建预演 11 包。

本节不冻结候选，不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。KL-3、KL-5、KL-6a 与 KL-7（含边界 a、b、c）仍有效。未在 Win7 验收通过。

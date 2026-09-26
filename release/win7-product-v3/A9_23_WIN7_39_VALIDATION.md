# A9-23 WIN7-39 验证套件说明

> 本文件由执行方按《A9-23 W39 验证套件修复交接书》§3.1 S-1 与 §3.4 编写，属于候选验证套件的一部分。
> 执行方只交付代码、测试与事实说明，不签发任何验收结论。

## 1. 候选与命令

- 候选：`WIN7-39`（任务 A9-23，ADR-0142）；kit：`A9_23_VALIDATION_KIT.json`；输入锁：`a9-23-win7-39-input-lock.json`。
- 完整性命令：`RUN_A9_23_W39_INTEGRITY.cmd`；报告命令：`RUN_WIN7_39_REPORT_VERIFY.cmd`。
- smoke：`validation/a9-win7-39-smoke.cjs`（机械派生自 `a9-win7-37-smoke.cjs`，见 §2）。
- driver：`validation/a9-win7-39-driver.cjs`（构建期由 `writeCandidateDriver` 从仓库 `src/shell/tests/product/a9-06-driver-entry.cjs` 重基线派生）。

## 2. 派生差异（W39 smoke 相对 W37 smoke 的全部非身份差异）

身份替换仅为：`W37→W39`、`win7-37→win7-39`、`WIN7_37→WIN7_39`、`WIN7-37→WIN7-39`、`A9_19→A9_23`、`A9-19→A9-23`（含大小写变体）。以下为全部非身份差异：

| # | 差异 | 理由 |
|---|---|---|
| D-1 | 文件头注释重写：声明从 W37 smoke 机械派生，并保留"A9-15 断言 ID 与 W28-H0x 交接标签有意保留"的说明 | 派生来源诚实标注；W39 继承 W37（从而 W28）验收合同 |
| D-2 | 运行根改为 `自动 运行 w39-<ts>`；原 `data`、`stop workspace`、`stop-data`、`negative workspace`、`negative-data`、`live workspace`、`live-data` 分别更名为 `数据 data root`、`停止 …`、`负例 …`、`实时 …` | W39-02 要求运行根、各工作区与数据根都含非 ASCII 字符与空格；W37 只有首个工作区满足 |
| D-3 | 新增 8 个阶段目录对（`启动 startup …`、`git …`、`m1 …`、`m1b …`、`m2 …`、`m3 …`、`m4 …`），每个 w39 工作区写入 `calc.ts` | S-1 追加阶段；workspace.select 公共前置等待 `calc.ts` |
| D-4 | m1b 工作区写入 `small.txt`（`alpha`）与 `hex-baseline.dat`（`'0123456789abcdef'`×65536 = 1 MiB）；m2 工作区写入 `m2-target.txt`；m3 工作区写入 `counter.ts`（`// v0`） | §3.7/§3.8/§3.9 夹具要求 |
| D-5 | `baseEnv` 增加 `A9_SMOKE_REQUIRE_PRODUCT_MAIN: '1'` | §3.3 S-2：驱动门控，缺失入口变量即 `A9_W39_DRIVER_PRODUCT_MAIN_REQUIRED`，不回落仓库布局 |
| D-6 | `runElectron` 增加可选 `timeoutMs` 参数（默认 240000 不变）；w39_git/w39_m3/w39_m4 用 900000，其余 w39 阶段用 600000 | W37 阶段超时不变；w39 长旅程（19 个 git 形态、60 轮 M3、2500 事件 M4）超出 240 s |
| D-7 | 追加 8 个阶段：`w39_startup`、`w39_git`、`w39_m1_small`、`w39_m1_large`、`w39_m1b`、`w39_m2`、`w39_m3`、`w39_m4`，每阶段结束后再做一次残留检查（内部断言 `W39-PHASE-RESIDUE-*`） | S-1/S-3 |
| D-8 | Git 形态远端准备：运行根下建本地裸仓库 `git 裸仓库 origin` 与带 `origin` 的工作区仓库；先创建工作区仓库目录，再写 README、执行 `git init`。按 `--git-exe`、`C:\acceptance\mvp_mingit\cmd\git.exe`、`where git` 的顺序选择完整可执行文件路径并探测版本；均不可用时远端判定记 `NOT_PERFORMED_NO_GIT`。Git 目录不加入产品或驱动进程的 PATH；证据记录实际路径、来源、版本、ref 对照与准备错误 | §9.2 R3-8、§11.2 R4-2；预演确认 MinGit 存在但 agent 用户 PATH 不含它，工作库目录缺失导致 README 写入 ENOENT |
| D-9 | M1/M4 种子函数：require 候选内 `resources/app/state/dist/a9-persistence.js` 的 `A9PersistenceManager.open`、`resources/app/core/dist/index.js` 的 `canonicalizeWorkspacePath` 与候选 `resources/native/storage/node_modules/better-sqlite3`；仅用公开方法（`saveSession`/`activateConversation`/`upsertTask`/`upsertTurn`/`recordModelEvent`/`recordToolEvent`），不手写建表或 INSERT。M4 每个种子任务还写入 `conversation.request`（`schemaVersion:1`、`taskId`、`requestPrompt`）以生成产品对话事实 | §3.6/§3.10 与 §9.2 R3-6 |
| D-10 | M1b 口令扫描：随机口令只在 fixture 闭包与阶段环境变量中使用；扫描 `a9-state.db` 的 `payload_json`（候选 better-sqlite3 只读）、数据根全部 ≤8 MiB 文本文件与该阶段驱动报告；证据只记命中数，不记口令 | §3.7：口令零命中 + 至少一处产品脱敏形式；口令不得写入证据 |
| D-11 | 断言聚合：`A9-W39-M1-TARGETED-RECOVERY` 与 `A9-W39-M1-STARTUP-TIMING-RECORDED` 由 smoke 聚合两阶段驱动报告后各记录一次；driver 内记录阶段作用域 ID（`W39-M1-RECOVERY-SMALL/LARGE`、`W39-M1-TIMING-SMALL/LARGE`） | 保持 W37 的"必需断言恰好出现 1 次"计数语义（同 ID 跨两阶段记录会破坏计数） |
| D-12 | `phases` 与 `w39Phases` 合计 13 个阶段；状态判定增加 `w39Phases.length === 8`，阶段报告汇总用两组进程记录共同查找；必需断言清单追加 33 项 W39 ID；`evidence_files` 追加 w39 阶段报告与证据摘录 | 追加阶段的合同化；R5-1 修复 K12 |
| D-13 | 追加证据摘录文件（§4 文件名固定）与 `w39-case-index.json`（S-5）；`A9-W39-FINAL-NO-RESIDUE` 及 `w39-15-residue.json` | 交接书 §3.3 S-3/S-5 与 §3.4 |
| D-14 | W39-01 不在 smoke 内执行：case index 记 `VERIFIED_BY_RUN_A9_23_W39_INTEGRITY_CMD_NOT_SMOKE` | W39-01 是包完整性用例，由 `RUN_A9_23_W39_INTEGRITY.cmd` 承载 |
| D-15 | `runElectron` 在启动每个阶段前检查传入环境变量的每个值不超过 32,767 字符；Git 形态清单写入运行根 `w39-git-forms.json`，环境变量只传其路径 | §7.2 W2，避免第 11 类超长载荷超过 Windows 环境变量上限；`w39-git` 驱动读取并校验 JSON 清单 |
| D-16 | M4 种子改为 10 个 Turn、每轮 250 条种子事件；淘汰轮夹具改为最多 20 步并要求本轮产品事件不少于 50 条 | §7.2 W5 与 §9.2 R3-6；保持 2,500 条种子事件、每轮低于 450，并避开产品每轮 30 步上限 |
| D-17 | M1b 夹具先 `read small.txt` 再 `edit`；M3 每轮先 `read counter.ts` 再 `edit` | §9.2 R3-4/R3-5；符合产品先读后写规则 |
| D-18 | 必需断言汇总将未出现与出现但未通过分别写为 `MISSING`、`PRESENT_NOT_PASSED` | §9.2 R3-7；预演报告曾把两种情况都写成 MISSING |
| D-19 | M4 fixture 增加一轮 `load m4 history` 只读 search 热身；驱动等该轮完成、对话流顶部可点击的“加载更早记录”出现后再分页。热身轮 ID 与产品查询所得事件数写入驱动报告和 `w39-14-collection-bounds.json`，注明计入已接收总数、排除于淘汰轮 E；集合提示只选择对话流的直接子节点 | §11.2 R4-4；保留产品选择工作区后只刷新快照、轮次结束才加载过程记录的行为，不调用内部加载器 |
| D-20 | 阶段报告汇总抽出 `validatePhaseReports` 并导出供开发机重放；直接运行脚本时仍执行 `main`。判定从 `phases.concat(w39Phases)` 查找 13 个进程记录，其他阶段条件不变 | 主线 `cc496ad` 交接书 §13.2 R5-1，修复 K12 |

W37 全部既有机制逐项保留（改名后）：五个阶段（`first`/`second`/`retry`/`stop`/`live`）、运行时自检（Win32、Electron 22.3.27、ABI 110、`ELECTRON_RUN_AS_NODE=1`）、证据目录不得位于候选内、中文空格工作区、`relatedProcessSnapshot`（排除 smoke 自身 PID）与"必需断言恰好出现 1 次"计数、两个候选内真实 Electron 反例、投影协议 fixture 核对与 `PROJECTION-ARTIFACTS-REPORT-PARSEABLE`（依赖 W39 报告脚本新增的投影解析导出，该段自 W37 报告脚本移植、错误码重基线为 `A9_W39_*`）。

驱动另由 `writeCandidateDriver` 从仓库历史旅程派生：WIN7-39 构建时将九个 `A9-W37-` 的 live/rail/header `record(` 断言 ID 精确重基线为 `A9-W39-`，每个旧 ID 的源出现次数必须恰为 1；仓库源码中的 W37 旅程保持原样。开发机门在打包产物中核对必需清单每个 ID 均由打包驱动或 smoke 的 `record(` 调用承载。

## 3. W39-04/05/06 → W37 断言映射

| W39 用例 | 阶段 | 继承断言 ID（A9-15/A9F1/A9F2/A9F6 族，改动仅候选前缀） |
|---|---|---|
| W39-04 任务闭环（read/edit/shell） | `first` | `A9F1-TOOL-JOURNEY`、`A9F1-SHELL-EVENT-DTO-UI`、`A9-15-PROGRESS-EVENT-ORDER`、`A9-15-PROGRESS-RENDERED-ONCE` |
| W39-05 Diff 与 checkpoint | `first` | `A9F1-DIFF`、`A9F1-SNAPSHOT-FACTS` |
| W39-06 审批拒绝 / 停止 / 重启恢复 | `first`/`second`/`retry`/`stop` | `A9F1-APPROVAL-CARD-TRUE-TARGET`、`A9-15-DENY-ZERO-TARGET-SIDE-EFFECT`、`A9F6-STOP-TURN-CANCELLED`、`A9F2-RESTORE-ACTIVE-WORKSPACE`、`A9-15-QUERY-FAILURE-VISIBLE-RETRY` |

## 4. W39-01～15 → 断言 ID → 证据文件

| 用例 | 断言 ID | 证据文件 |
|---|---|---|
| W39-01 | 包完整性（`manifest_files_checked`/`zip_entries_checked`/`mismatches` 计数） | `integrity-output.txt`、`a9-package-integrity.json` |
| W39-02 | `A9-W39-CHINESE-SPACE-PATHS` | `w39-02-paths.json` |
| W39-03 | `A9-W39-STARTUP-WITHIN-60S` | `w39-03-startup.png`、`w39-03-startup.json` |
| W39-04 | §3 映射（first） | `w39-04-task-flow.json` |
| W39-05 | §3 映射（first） | `w39-05-diff.png`、`w39-05-diff.json` |
| W39-06 | §3 映射（first/second/retry/stop） | `w39-06-approval-stop-restart.json` |
| W39-07 | `A9-W39-GIT-FORM-01`…`06`（CMD：对照、`/c"`、`/C"`、路径化、`/s/c`、`/R`） | `w39-07-09-git-forms.json` |
| W39-08 | `A9-W39-GIT-FORM-07`…`12`、`18`、`19`（PowerShell：`-co`/`-Com`//Command/相连/EncodedCommand ×2/位置参数 ×2） | `w39-07-09-git-forms.json` |
| W39-09 | `A9-W39-GIT-FORM-13`…`16`（POSIX）+ `17`（>256 KiB CMD 兜底）；无 POSIX 壳时"能否执行"记 NOT_PERFORMED | `w39-07-09-git-forms.json` |
| W39-10 | `A9-W39-M1-TARGETED-RECOVERY`、`A9-W39-M1-STARTUP-TIMING-RECORDED` | `w39-10-startup-recovery.json` |
| W39-11 | `A9-W39-M1B-FREEZE-DURATION`、`A9-W39-M1B-URL-REDACTED` | `w39-11-m1b-hex-redaction.json` |
| W39-12 | `A9-W39-M2-TRUNCATED-WITH-WARNINGS`、`A9-W39-M2-TOOL-NOT-EXECUTED`、`A9-W39-M2-NEXT-TURN-OK` | `w39-12-output-limits.json` |
| W39-13 | `A9-W39-M3-COUNT-MATCHES-DB`、`A9-W39-M3-OLDER-PAGES-CONTINUOUS`、`A9-W39-M3-OLDER-DIFF` | `w39-13-checkpoint-paging.png`、`w39-13-checkpoint-paging.json` |
| W39-14 | `A9-W39-M4-CAP-NOTICE`、`A9-W39-M4-RELEASED-COUNT-ACCURATE`、`A9-W39-M4-RENDERER-MEMORY-SAMPLED` | `w39-14-collection-bounds.json` |
| W39-15 | `A9-W39-FINAL-NO-RESIDUE` | `w39-15-residue.json` |

## 5. 断言来源与判定口径（R4）

- 全部判定只读阶段结束后的产品产物：驱动报告（含 `productMainLoaded`）、产品写入的 SQLite（`a9-state.db`：M3 checkpoint 计数与全集、M1b `payload_json` 扫描）、工作区文件（M2 目标哈希）、诊断快照（M1 `checkpointRecoveryDiagnostics`）、DOM（M3 计数文案 `#a9-checkpoint-count`、checkpoint 列表、M4 顶部说明、审批卡）。脚本自身步骤成功（建目录、写种子、启动 fixture）一律不作为通过条件；必需断言不得以字面量 `true` 记录（开发机门 §4 第 3 项以正则拦截）。
- A9-20 形态通过条件 = 审批卡出现，卡片 ID 文本恰为 `approval: <pendingApproval.approvalId>`，卡片 `bindingDigest` 与快照待批准项一致；`origin-main` 形态必须有 `gitBinding.remote='origin'`、`gitBinding.branch='main'`，`summary` 兜底形态必须有 `gitBinding`、无 `remote` 与 `branch` 属性，且 `gitBinding.commandSha256` 与 `bindingDigest` 都为 64 位十六进制。报告逐项注明绑定路径。审批卡 DOM 文本不参与 Git 绑定判定。审批边界事件与产品库 `a9_approvals` 均以快照 `pendingApproval.approvalId` 查询，不把带前缀的 DOM 文本当 ID。拒绝后以 `approval_required` 的 `callId` 为边界，要求同一调用无后续 `tool_start`；同一调用若有 `tool_end`，每项均须 `denied=true`、`sideEffects=0`；产品库中该审批必须为拒绝且会话一致。三项同时成立才记未执行。有 Git 时裸仓库 `refs/heads/main` 前后相同（直接读文件）。
- 所有 `w39_*` 阶段的本轮终态由产品事件决定：提交前取事件游标，提交后找游标之后的新 `turn_started` 及其 `turnId`，再等待该 `turnId` 的 `turn_completed` 或 `turn_failed`；不使用分页快照的对话事实条数推断结束。M1b/M3 的 read/edit 顺序由夹具驱动；M3 60 轮按各轮独立的事件终态推进。
- M2 先等待本轮终态，再查询该 `turnId` 的 `turn_completed`、截断说明与工具事件；截断和未执行两条断言均要求非空终态 `turnId`。
- M3 点击最旧 checkpoint 后等待 `#a9-diff` 与点击前文本不同，并要求结果含 `counter.ts`，排除占位文本与“此 checkpoint 没有文件变更。”。
- M1b 冻结耗时仍为提交到本轮事件终态，要求 `<10000 ms`；结局接受 `completed` 或 `completed_with_warnings`。使用产品库 `a9_checkpoints WHERE turn_id = ?` 核对本轮终态的 `turnId`，报告保留该行的 `turn_id`、`session_id`、`created_at`，不以快照 checkpoint 总数替代本轮行存在。
- M4 淘汰轮要求本轮 `turn_completed` 且本轮产品事件数 E ≥ 50。释放数判定方法：从产品提示读取 N；从产品事件查询按淘汰轮终态 `turnId` 计得 E。要求 `200 < N ≤ 200 + E`。淘汰后提示不含“已达界面上限”时必须出现可点击的“加载更早记录”按钮；含该文案时不得出现该按钮。报告写入 N、E、区间上下界、提示原文、按钮存在/文案/禁用状态及计算方法。轮询分批到达时不使用一次性精确释放数公式（交接书 §7.4 裁决）。开发机门经真实运行时打开种子库，核对 10 条对话事实与 2,500 条种子事件的连续分页。
- M4 分页前必须先完成只读热身轮，并等对话流顶部按钮可点击；热身事件参与产品加载与计数，不从集合中剔除，不进入 E。开发机 VM 加载真实 `a9-workbench.js`，保留其默认集合上限与加载时序：选择工作区后查询次数为 0，热身仍在运行时为 0，终态后查询最近 300 条且包含热身事件，顶部按钮出现。产品侧“选择工作区不加载历史过程”观察保留，不在本套件改动范围内。
- 阶段报告汇总覆盖 13 个阶段：5 个继承阶段与 8 个 `w39_*` 阶段的进程记录合并查找。每个报告仍须存在，且对应进程退出码为 0、未超时，报告 `mode` 匹配、`status=PASS`、有至少一条 `cases` 且全部通过、无 `error`。开发机用第三次预演只读提取的最小字段夹具重放此判定；该重放不改变原预演的 `FAIL` 状态或结论。
- `A9-W39-REQUIRED-ASSERTIONS-PRESENT` 的失败 detail 分列 `MISSING`（缺少 ID）和 `PRESENT_NOT_PASSED`（ID 存在但 `passed !== true`）；开发机门逐项检查打包驱动或 smoke 的 `record(` 调用覆盖必需清单。
- M1b 脱敏标记：产品 `redactSecrets`/`redactUrlUserinfo` 将 `scheme://user:pass@host` 替换为 `***redacted***@host`；本套件核对脱敏形式 `***redacted***@example.invalid/x` 至少出现一处，口令本身零命中。
- M1 启动定向恢复口径：`checkpointRecoveryDiagnostics.rejectedTurns` 恰好含种子中断 Turn 且 `status='missing'`；其余 Turn 经会话事实查询可见（按种子 completed Turn 数核对）。是否"不随历史线性增长"由审核方依据两阶段耗时判断，驱动不下结论。

## 6. 待验证项（Win7 预演）

1. 预演确认 Win7 有 `C:\acceptance\mvp_mingit\cmd\git.exe`，但当时 agent 用户 PATH 不含它；新路径选择与本地仓库准备仍待重跑预演验证。
2. PowerShell 5.1 对 `/Command` 与第 8 类（EncodedCommand，UTF-16LE Base64）的实际执行行为。
3. `.cmd` 在中文空格路径下的参数传递（`RUN_A9_23_W39_INTEGRITY.cmd` / `RUN_WIN7_39_REPORT_VERIFY.cmd`）。
4. M3 60 轮在 Win7 上的实际耗时（阶段超时已放宽到 900 s；若仍超时由验收方决定是否调整轮数）。
5. M1b 冻结阈值 10000 ms 在 Win7 的实测值；M2 1.1 MiB 响应在 Win7 的截断行为。

## 7. 运行状态声明

w39* 旅程与 smoke 在开发机（macOS，无 Windows 版 Electron 22.3.27）**未运行，待 Win7 预演**。开发机门覆盖的是构建前可静态验证的缺陷形态（见交接书 §4 与 `scripts/release/test/a9-package.test.mjs` 新增用例）。

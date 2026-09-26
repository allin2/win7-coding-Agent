# A9-23 W39 验证套件修复交接书

> 执行方：外部执行 Agent（或新会话）。验收方：发出本交接书的会话。执行方只交代码、测试和事实报告，不自行宣布验收通过。
> 授权依据：[A9-23](../tasks/A9_23_WIN7_39_REISSUE_AND_ACCEPTANCE.md) §3、§5 R1～R8、§6 第 1 步；ADR-0142。
> 本交接书只覆盖套件修复与开发机门。**不做**：候选冻结、authority、Win7 部署或预演（预演另出交接书）。

## 1. 背景

WIN7-38 在 Win7 实机 G2 失败，审查结论见
[a9_22_win7_38_acceptance_review_2026-09-26.md](../reports/2026-09/a9_22_win7_38_acceptance_review_2026-09-26.md)。与本任务直接相关的事实：

- W38 smoke（`release/win7-product-v3/a9-win7-38-smoke.cjs`，566 行）不是从 W37 smoke（695 行）机械改名，而是手写派生。它丢了：
  - `A9_SMOKE_PRODUCT_MAIN`：导致驱动回落到仓库布局 `path.resolve(__dirname,'../../../..')/src/shell/product/main.js`，产品从未加载；
  - W37 的运行时自检（Win32、Electron 22.3.27、ABI 110、`ELECTRON_RUN_AS_NODE=1`）、证据目录不得位于候选内的检查、
    `中文 空格 workspace` 工作区、`retry` 与 `live` 两个阶段、`relatedProcessSnapshot` 的自身 PID 排除与结构化残留记录、
    必需断言"恰好出现 1 次"的计数语义。
- W38 断言问题（审查报告 §4 K2～K6）：M1 在种子写入成功时即记通过，且写的是自建的 `turns/checkpoints` 表而不是产品的 `a9_*` 表；
  A9-20 三个用例只要出现 Shell 审批卡就通过；M1b 只测一次 `snapshot()` 耗时；M2 只要结果含 `completed` 就通过；M3/M4 只要
  `queryEvents` 返回 `ok` 就通过。
- 开发机没有 Windows Electron，旅程只能在 Win7 跑。开发机门必须把 W38 那类缺陷挡在构建前（§5）。

## 2. 基线、分支与允许路径

- 基线：`codex/a9-alpha2` 上本交接书所在提交，或其后只含文档改动的提交；报告写明实际基线。
  在新分支 `codex/a9-23-w39-kit` 上工作（git worktree），完成后本地提交，**不推送、不合并**。
- 工作树可符号链接主工作区 `node_modules`；各包 `dist` 在本工作树内用 `tsc` 构建，不得链接主工作区的 `dist`。
- 允许修改或新增的文件，仅限：
  - `scripts/release/build-a9-product-v3.mjs`
  - `scripts/release/test/a9-package.test.mjs`
  - `release/win7-product-v3/` 下新增：`a9-23-win7-39-input-lock.json`、`a9-package-integrity-w39.cjs`、`a9-win7-39-report.cjs`、
    `a9-win7-39-smoke.cjs`、`RUN_A9_23_W39_INTEGRITY.cmd`、`RUN_WIN7_39_REPORT_VERIFY.cmd`、`A9_23_WIN7_39_VALIDATION.md`，
    以及文件名含 `w39` 的夹具；更新该目录 `README.md`
  - `src/shell/tests/product/a9-06-driver-entry.cjs`：只新增 `w39*` 模式、旅程与辅助函数，以及 §3.3 S-2 中由
    `A9_SMOKE_REQUIRE_PRODUCT_MAIN` 门控的入口检查；变量未设置时既有模式行为不变
  - `src/shell/tests/product/**` 下新增测试或夹具
- 不得修改：任何产品源码（`src/**` 中除 `src/shell/tests/product/**` 外的全部文件）、WIN7-38 及更早的发布文件、驱动中 `w38` 与更早旅程
  及历史断言键、`package.json`、锁文件、文档（报告里写说明即可，文档由验收方更新）。
- 不新增依赖，不联网。发现产品缺陷时停止并在报告中说明，不得顺手修复。

## 3. 实现要求

### 3.1 管线（`build-a9-product-v3.mjs`）

- **P-1 Profile**：新增 `A9-23-INPUTS-WIN7-39`：`task: 'A9-23'`、`candidate: 'WIN7-39'`、`lockFile: 'a9-23-win7-39-input-lock.json'`、
  `kitFile: 'A9_23_VALIDATION_KIT.json'`、`validationDoc: 'A9_23_WIN7_39_VALIDATION.md'`、`integrityCommand: 'RUN_A9_23_W39_INTEGRITY.cmd'`、
  `reportCommand: 'RUN_WIN7_39_REPORT_VERIFY.cmd'`、`integrityScript: 'a9-package-integrity-w39.cjs'`、`reportScript: 'a9-win7-39-report.cjs'`、
  `extraValidationScripts: ['a9-win7-39-smoke.cjs']`、`evidenceDirectory: 'a9-win7-39-evidence'`。
- **P-2 集合登记**：凡列出 `'WIN7-38'` 的候选集合与判断（`A915_CANDIDATES`、`A915_DIRECT_SMOKE_CANDIDATES`、残留守卫、
  `writeCandidateDriver`、ZIP 闭包、投影契约等，用 `grep -n "WIN7-38"` 逐处核对）都加入 `'WIN7-39'`；报告里列出每一处。
- **P-3 残留守卫**：WIN7-39 的派生脚本中出现以下任一即构建失败：`A9_W38_*`、`WIN7_38_RELEASE_AUTHORITY`、`APPROVED_FOR_WIN7_38_VALIDATION`、
  `'W38-NN-…'`、`A9_22_VALIDATION_KIT`，以及 W37 的同类字面量（W39 从 W37 派生，两代残留都要挡）。
- **P-4 驱动重基线**：`writeCandidateDriver` 对 WIN7-39 做与 WIN7-38 相同的替换，外加把 W39 新增错误码的前缀固定为 `A9_W39_`；
  每个替换源仍须恰好出现 1 次。
- **P-5 Kit**：新增 `createWin39ValidationKit`，15 项用例 `W39-01`～`W39-15`，每项的 `assertions` 列出 §3.4 表中的断言 ID；
  用例名与 A9-23 §4 对应。
- **P-6 输入锁**：三项输入（Electron zip、D-013 v25 helper、A6 SQLite zip）与 W38 输入锁相同，只改任务、候选与文件身份字段。

### 3.2 完整性与报告脚本

- 从 W38 版本派生（这两者在 WIN7-38 G1 实际通过），重基线为 W39。
- **I-1**：`a9-package-integrity.json` 增加逐文件核对计数：`manifest_files_checked`、`zip_entries_checked`、`mismatches`（数组，正常为空），
  供审核复核 W39-01；不得只输出用例级 `PASS`。

### 3.3 smoke（`a9-win7-39-smoke.cjs`）

- **S-1 机械派生**：以 `a9-win7-37-smoke.cjs` 为起点，只做 `W37→W39`、`A9-19→A9-23`、`A9_19→A9_23`、`WIN7_37→WIN7_39`、`win7-37→win7-39`
  这类身份替换，保留 W37 的全部阶段（`first`、`second`、`retry`、`stop`、`live`）、全部必需断言（改名为 W39）、运行时自检、证据目录检查、
  中文空格工作区、`relatedProcessSnapshot` 与计数语义。之后只**追加** W39 阶段与断言。
  在 `A9_23_WIN7_39_VALIDATION.md` 附"派生差异"一节：列出与 W37 的每处非身份差异及理由。
- **S-2 产品入口**：`baseEnv.A9_SMOKE_PRODUCT_MAIN = <candidateRoot>\resources\app\product\main.js`；启动任何子进程前检查文件存在，
  否则以 `A9_W39_PRODUCT_MAIN_MISSING` 失败。smoke 对所有阶段额外设置 `A9_SMOKE_REQUIRE_PRODUCT_MAIN=1`：驱动在该变量为 `1` 时
  (a) 缺少 `A9_SMOKE_PRODUCT_MAIN` 即以 `A9_W39_DRIVER_PRODUCT_MAIN_REQUIRED` 失败，不回落仓库布局；(b) 在报告中写
  `productMainLoaded`（实际 `require` 的绝对路径）。smoke 校验该路径位于候选根下，否则该阶段不合格。
  变量未设置时驱动行为与现状逐字节等价，历史 profile 不受影响。
- **S-3 残留**：沿用 W37 的负向探针后残留检查；每个阶段结束后与 smoke 结束前再各做一次，结束前的记为
  `A9-W39-FINAL-NO-RESIDUE`，detail 带结构化快照（进程名、PID、父 PID、可执行路径、命令行截断到 1000 字符）。
  smoke 不得自行强杀后再报告"零残留"：若需强杀，先记录残留并判该断言失败。
- **S-4 断言来源（R4）**：smoke 侧断言只能读取阶段结束后的产品产物（驱动报告、产品写入的 SQLite、工作区文件、诊断文件）。
  禁止以任何脚本自身步骤（建目录、写种子、启动 fixture）成功作为通过条件。
- **S-5 用例索引**：smoke 结束时写 `w39-case-index.json`：每个用例 → 断言 ID、结果、证据文件相对路径，作为交接书 §6 证据清单的来源（R7）。
  下文要求的证据文件名固定，不得改名。

### 3.4 W39 阶段与断言

每个阶段使用独立的工作区与数据根（路径含中文与空格），独立的回环 fixture。表中"判定"必须全部来自产品运行后的观察。

| 用例 | 阶段 / 位置 | 断言 ID | 判定 | 证据文件 |
|---|---|---|---|---|
| W39-02 | 全部阶段 | `A9-W39-CHINESE-SPACE-PATHS` | smoke 检查运行根、各工作区与数据根的实际路径都含非 ASCII 字符与空格，且各阶段 `productMainLoaded` 有效；是否在中文空格路径下解压候选由 Win7 交接书保证并在报告中记录 `candidateRoot` | `w39-02-paths.json` |
| W39-03 | 新阶段 `w39_startup` | `A9-W39-STARTUP-WITHIN-60S` | 驱动记录从进程启动到工作台可见、工作区选择完成的毫秒数 < 60000，无未捕获异常；截图 | `w39-03-startup.png`、`w39-03-startup.json` |
| W39-04～06 | `first`/`second`/`retry`/`stop` | 沿用 W37 断言（改名 W39） | 与 W37 相同；在验证说明中给出 W39-04/05/06 → 具体断言 ID 的映射表 | `w39-04-task-flow.json`、`w39-05-diff.json`、`w39-05-diff.png`、`w39-06-approval-stop-restart.json`（由对应阶段报告摘录生成） |
| W39-07～09 | 新阶段 `w39_git` | `A9-W39-GIT-FORM-<序号>`，每个形态一个 | 见 §3.5 | `w39-07-09-git-forms.json` |
| W39-10 | 新阶段 `w39_m1_small`、`w39_m1_large` | `A9-W39-M1-TARGETED-RECOVERY`、`A9-W39-M1-STARTUP-TIMING-RECORDED` | 见 §3.6 | `w39-10-startup-recovery.json` |
| W39-11 | 新阶段 `w39_m1b` | `A9-W39-M1B-FREEZE-DURATION`、`A9-W39-M1B-URL-REDACTED` | 见 §3.7 | `w39-11-m1b-hex-redaction.json` |
| W39-12 | 新阶段 `w39_m2` | `A9-W39-M2-TRUNCATED-WITH-WARNINGS`、`A9-W39-M2-TOOL-NOT-EXECUTED`、`A9-W39-M2-NEXT-TURN-OK` | 见 §3.8 | `w39-12-output-limits.json` |
| W39-13 | 新阶段 `w39_m3` | `A9-W39-M3-COUNT-MATCHES-DB`、`A9-W39-M3-OLDER-PAGES-CONTINUOUS`、`A9-W39-M3-OLDER-DIFF` | 见 §3.9 | `w39-13-checkpoint-paging.json`、`w39-13-checkpoint-paging.png` |
| W39-14 | 新阶段 `w39_m4` | `A9-W39-M4-CAP-NOTICE`、`A9-W39-M4-RELEASED-COUNT-ACCURATE`、`A9-W39-M4-RENDERER-MEMORY-SAMPLED` | 见 §3.10 | `w39-14-collection-bounds.json` |
| W39-15 | smoke 结束 | `A9-W39-FINAL-NO-RESIDUE` | 见 S-3；秘密扫描由 Win7 交接书规定，不在 smoke 内 | `w39-15-residue.json` |

### 3.5 A9-20 形态（W39-07～09）

- 形态清单取自 [A9-20](../tasks/A9_20_GIT_CONFIRMATION_CLASSIFIER_HARDENING.md) §2：第 1 类（对照）、第 2～8 类、第 11 类、第 12 类，每个具体写法一项
  （例如第 2 类有 `cmd /c"…"` 与 `cmd /C"…"` 两项，第 6 类有 `-co`、`-Com`、`/Command` 三项；第 8 类用
  `git push origin main` 的 UTF-16LE Base64；第 11 类构造总长 > 262144 字符的引号包裹 CMD 载荷）。第 9、10 类（bash/sh）在 Win7 无 POSIX 壳时，
  仍提交命令以检查分类与确认，但"能否执行"记 `NOT_PERFORMED`。
- 远端：smoke 在运行根下准备本地裸仓库与带 `origin` 的工作区仓库。Win7 是否有 `git` **待验证**：smoke 先检测 `git`；
  没有 Git 时工作区不是仓库，仍逐形态检查确认，只把远端相关判定记为 `NOT_PERFORMED`。
- 每个形态通过条件（全部满足）：
  1. 出现审批卡，且快照或 IPC 中的待批准项携带 Git 外部写绑定；可精确解析的形态绑定目标含 `origin` 与 `main`，
     G04 兜底形态为整条命令摘要（按 A9-20 §8 第 1 条区分，报告中逐项注明走哪条路径）。
  2. 驱动点击拒绝后：本轮对该工具调用无执行事件（从 `a9_events` 核对）；有 Git 时，裸仓库 `refs/heads/main` 文件内容（直接读文件，不依赖 git）
     拒绝前后相同。
- 只检查"出现 Shell 审批卡"不算通过（这正是 W38 的缺陷）。

### 3.6 M1 启动定向恢复（W39-10）

- 种子由 smoke 在启动产品前写入：用候选内 `resources/app/state/dist/a9-persistence.js` 的 `A9PersistenceManager.open`
  （`databasePath=<dataRoot>\a9-state.db`，SQLite 取候选 `resources/native/storage`），通过其公开方法创建会话、任务与 Turn；
  工作区路径用候选内 `resources/app/core/dist` 的 `canonicalizeWorkspacePath` 规范化，与运行时一致。**不得**直接 `CREATE TABLE` 或手写 SQL 插入。
- `w39_m1_small`：约 5 个历史 Turn；`w39_m1_large`：≥100 个，其中恰好 1 个 `interrupted` 且无 checkpoint 行、无磁盘清单。两者均含同样的这 1 个中断 Turn。
- 判定：
  - `A9-W39-M1-TARGETED-RECOVERY`：产品启动后，快照中的 `checkpointRecoveryDiagnostics.rejectedTurns` 恰好含该 Turn 且 `status='missing'`；
    其余 Turn 仍可经会话事实查询看到。
  - `A9-W39-M1-STARTUP-TIMING-RECORDED`：两阶段各记录"进程启动→运行时就绪快照"毫秒数，均 < 60000。是否"不随历史线性增长"由审核方依据两数判断，
    驱动不自行下结论。

### 3.7 M1b 冻结与脱敏（W39-11）

- 工作区放 1 MiB 单行十六进制文件（`'0123456789abcdef'` 重复 65536 次）与一个小文件；fixture 让模型调用编辑工具修改小文件，使产品冻结基线并写 checkpoint。
- `A9-W39-M1B-FREEZE-DURATION`：从提交到本轮结果出现的毫秒数，与本轮 checkpoint 行存在一并记录；阈值 < 10000 ms（开发机与 Win7 结果都写进报告，审核方可复核）。
- `A9-W39-M1B-URL-REDACTED`：smoke 每次运行生成随机口令 `P`，fixture 让 `https://w39user:P@example.invalid/x` 同时出现在模型说明与 Shell 工具输出中
  （如 `echo`）。阶段结束后 smoke 扫描 `a9-state.db` 的 `a9_events.payload_json`、数据根下全部文本文件与该阶段驱动报告：`P` 零命中，
  且至少一处出现产品的脱敏形式（具体标记以 `a9-agent-runtime.js` 的 `redactSecrets` 实际输出为准，在报告中注明）。`P` 本身不得写入任何证据文件。

### 3.8 M2 输出上限（W39-12）

- fixture 单响应返回 > 1 MiB 的内容，在上限之后再给出一个修改目标文件的工具调用；随后第二个提示正常返回。
- 判定：`a9_turns` 中该轮 `status='completed_with_warnings'`，`model_note` 事件内容含截断说明（文案以 A9-21 M2 交接书 §3 与产品代码为准）
  → `A9-W39-M2-TRUNCATED-WITH-WARNINGS`；目标文件哈希不变且无该工具的执行事件 → `A9-W39-M2-TOOL-NOT-EXECUTED`；
  下一轮 `status='completed'` → `A9-W39-M2-NEXT-TURN-OK`。界面截断说明的 DOM 文本一并记录。

### 3.9 M3 checkpoint 分页（W39-13）

- 由 fixture 驱动 ≥60 个真实 Turn，每轮对工作区文件做一次小修改，使每轮产生真实 checkpoint 与清单（不用种子，保证更早记录可 Diff）。
  Win7 上耗时需记录；若超过阶段超时，先在报告里给出实测，由验收方决定是否调整轮数，不得私自降到 60 以下。
- 判定：`#a9-checkpoint-count` 文本形如 `最近 N / 共 M`，M 等于该会话 `a9_checkpoints` 行数 → `A9-W39-M3-COUNT-MATCHES-DB`；
  反复点击"加载更早的 … 条"按钮直到消失，收集到的 turnId 无重复、总数等于 M、按时间连续 → `A9-W39-M3-OLDER-PAGES-CONTINUOUS`；
  对最早一条执行 Diff（界面或 `getDiff`），返回成功且内容非空 → `A9-W39-M3-OLDER-DIFF`。

### 3.10 M4 集合上限（W39-14）

- 启动前经 `A9PersistenceManager` 的公开事件写入方法（`recordModelEvent`/`recordToolEvent`）为一个会话写入 ≥2500 条事件；
  启动后反复点击"加载更早记录"直到按钮消失，再用 fixture 跑一个产生 ≥50 条事件的轮次，触发淘汰。
- 判定：对话流顶部出现 `已达界面上限 2000 条` 的说明 → `A9-W39-M4-CAP-NOTICE`；
  说明中的释放数 N 与驱动独立计算的值一致（计算方法写进报告，例如"已接收的不同 eventId 数 − 当前界面持有数"）→ `A9-W39-M4-RELEASED-COUNT-ACCURATE`；
  在约 1000 条与淘汰后各用 `app.getAppMetrics()` 采样一次 Renderer 进程内存，两次数值都记录 → `A9-W39-M4-RENDERER-MEMORY-SAMPLED`
  （只要求采到且为正数；是否"有界"由审核方判断）。

## 4. 开发机门（R8）

在 `a9-package.test.mjs` 新增，全部须通过：

1. W39 smoke 源码中 `baseEnv` 含 `A9_SMOKE_PRODUCT_MAIN`，且其值拼出的相对路径在 W39 构建闭包中存在。
2. W39 smoke 的残留快照排除 `process.pid`。
3. W39 smoke 与驱动 `w39*` 代码中，`A9-W39-` 断言不得以字面量 `true` 记录（正则检查 `record\(\s*'A9-W39-[^']+'\s*,\s*true\b`）。
4. W39 smoke 保留 W37 的五个阶段名与运行时自检；删掉任一项的注入反例必须失败。
5. 反例：把 W38 smoke 的缺陷形态注入 W39 副本（去掉产品入口变量、加入恒真断言、去掉 PID 排除），测试各自失败。
6. 驱动在候选布局下解析产品入口：用临时目录模拟 `<candidateRoot>\validation` 与 `<runRoot>\driver-app`，断言设置
   `A9_SMOKE_PRODUCT_MAIN` 时解析到候选内路径；`A9_SMOKE_REQUIRE_PRODUCT_MAIN=1` 而缺入口变量时以稳定错误码失败；两个变量都不设时解析结果与现状相同。
7. M1/M4 种子构建函数的单测：用开发机的 better-sqlite3 与 `src/state/dist` 写种子，再用 `A9PersistenceManager.open` 打开，
   `findInterruptedWorkspaceTurnsNeedingCheckpoint` 恰好返回那 1 个 Turn，事件数 ≥2500。
8. W39 残留守卫对注入的 W38、W37 字面量报错。

另须通过：`src/shell` 与 `src/state` 受影响测试、`npm run verify:quick`、`npm run docs:check`、`git diff --check`。
驱动的 `w39*` 旅程无法在开发机运行，报告中明确写"未运行，待 Win7 预演"。

## 5. 交付与报告

- 本地提交（可多个），不推送、不合并。报告包括：
  1. 基线提交、分支、提交列表与改动文件清单；
  2. §3.1 P-2 逐处登记位置；
  3. 派生差异摘要（与验证说明一致）；
  4. W39-01～15 → 断言 ID → 证据文件的映射表；
  5. §4 每项测试的命令与原样输出摘要（通过/失败条数），反例在未修复代码上失败的证据；
  6. 待验证项：Win7 上 `git` 是否存在、PowerShell `/Command` 与第 8 类在 PowerShell 5.1 的实际行为、`.cmd` 在中文空格路径下的参数传递、
     M3 60 轮在 Win7 的耗时；
  7. 发现的产品缺陷（如有），附复现方式，未修改。
- 不得在报告中宣布"验收通过"。

## 6. 验收方检查清单（执行方知悉即可）

验收方会：核对改动只在 §2 路径内；逐行比对 W39 smoke 与 W37 smoke 的差异是否都在派生差异清单里；逐个检查 §3.4 断言的数据来源；
在未修复代码上复跑 §4 反例；自行构建一次 W39 候选（非冻结）检查 ZIP 闭包与残留守卫；通过后再出 Win7 预演交接书。

# A9-25 W40 验证套件交接书

> 执行方：外部执行 Agent。验收方：发出本交接书的会话。执行方只交代码、测试和事实报告，不自行宣布验收通过。
> 授权依据：[A9-25](../tasks/A9_25_WIN7_40_REISSUE_AND_ACCEPTANCE.md) §3、§4、§5 第 1 步；ADR-0144。
> 本交接书只覆盖套件实现与开发机门。**不做**：候选冻结、authority、Win7 部署或预演（预演另出交接书）。

## 1. 起点

- W39 套件是本任务的派生基线：它经五轮返工、三次 Win7 预演，并在 WIN7-39 正式运行中 13 个阶段、181 条断言全部通过。
  过程与教训见 [W39 套件修复交接书](A9_23_W39_KIT_REPAIR_HANDOFF.md) §7～§14（审批 ID 取快照、先读后写、轮次终态按事件、M4 热身、阶段汇总覆盖全部阶段等），W40 必须全部保留。
- 被测功能：[A9-24](../tasks/A9_24_REVIEW_MODE.md) 改动审阅（§3 设计、§5.1 兼容约束）。界面入口：检查器“改动”页签（`#inspector-tab-changes`）、
  `#a9-checkpoint-list` 的轮次行与 `.review-file*`、对话流 `.change-summary`、`#a9-undo-state`；宿主响应 `a9.diff.get` 的 `review` 与撤销响应的 `driftReasons`。

## 2. 基线、分支与允许路径

- 基线：`codex/a9-alpha2` 上本交接书所在提交或其后只含文档改动的提交。新分支 `codex/a9-25-w40-kit`（git worktree），本地提交，**不推送、不合并**。
  `node_modules` 用符号链接复用主工作区；各包 `dist` 在本工作树内构建。Node 20.17。
- 允许修改或新增的文件仅限 A9-25 §3。不得修改产品源码（`src/**` 中除 `src/shell/tests/product/**` 外的全部文件）、WIN7-39 及更早的发布文件、
  驱动中 `w39` 与更早旅程及历史断言键、`package.json`、锁文件、文档。不新增依赖，不联网。发现产品缺陷时停止并报告，不得顺手修复。

## 3. 实现要求

### 3.1 管线与派生

- **P-1 Profile**：新增 `A9-25-INPUTS-WIN7-40`（`task: 'A9-25'`、`candidate: 'WIN7-40'`、`a9-25-win7-40-input-lock.json`、`A9_25_VALIDATION_KIT.json`、
  `A9_25_WIN7_40_VALIDATION.md`、`RUN_A9_25_W40_INTEGRITY.cmd`、`RUN_WIN7_40_REPORT_VERIFY.cmd`、`a9-package-integrity-w40.cjs`、`a9-win7-40-report.cjs`、
  `extraValidationScripts: ['a9-win7-40-smoke.cjs']`、`evidenceDirectory: 'a9-win7-40-evidence'`）。
- **P-2 集合登记**：凡列出 `'WIN7-39'` 的候选集合与判断都加入 `'WIN7-40'`（`grep -n "WIN7-39"` 逐处核对，报告列出每一处）。
- **P-3 机械派生**：W40 的 smoke、完整性、报告、输入锁与两个 `.cmd` 从 W39 同名文件派生，只做身份替换（`W39→W40`、`win7-39→win7-40`、`WIN7_39→WIN7_40`、
  `WIN7-39→WIN7-40`、`A9_23→A9_25`、`A9-23→A9-25`、`w39→w40`，含大小写变体）；之后只**追加** W40 新阶段与断言。
  `A9_25_WIN7_40_VALIDATION.md` 列出相对 W39 的全部非身份差异及理由。输入锁三项输入与 W39 相同。
- **P-4 驱动重基线**：打包驱动中，被 W40 使用的继承旅程的阶段名与断言 ID 由 `writeCandidateDriver` 重基线为 `w40_*` / `A9-W40-*`，仓库驱动中的 `w39` 旅程保持原样；
  替换须可审计（每个源片段的出现次数有断言），实现方式在验证说明中写明。
- **P-5 残留守卫**：W40 派生文件与打包驱动中出现以下任一即构建失败：`A9-W39-`、`A9_W39_`、`WIN7_39_RELEASE_AUTHORITY`、`APPROVED_FOR_WIN7_39_VALIDATION`、
  `'W39-NN-…'` 用例 ID、`A9_23_VALIDATION_KIT`，以及 W37/W38 的同类字面量。
- **P-6 Kit**：`createWin40ValidationKit`，用例 `W40-01`～`W40-22`，每项列出断言 ID；W40-01～15 的用例名与判定口径与 W39 相同。

### 3.2 两处收紧

- **T-1（W40-06）**：新增 `w40_stop` 阶段：fixture 让模型运行一个持续输出的长命令，驱动记录 Shell 子进程 PID，点击“停止任务”后每 100 ms 检查该 PID 是否存活
  （`process.kill(pid, 0)`），记录消失毫秒数；`A9-W40-STOP-CHILD-EXIT-WITHIN-5S` 要求 ≤ 5000 ms 且本轮终态为 `cancelled`。证据 `w40-06-stop-exit.json`。
- **T-2（W40-05/13）**：截图前确保检查器已打开且“改动”页签选中、对应轮次行已展开并显示文件 Diff（DOM 断言后再截图）。W40-05 的截图取自 §3.3 的 `w40_review` 阶段，
  W40-13 取自 M3 阶段最旧轮次 Diff 之后。证据 `w40-05-diff.png`、`w40-13-checkpoint-paging.png` 文件名不变。

### 3.3 A9-24 用例（W40-16～22）

新增阶段 `w40_review` 与 `w40_review_restart`（同一数据根与工作区，第二阶段为重启后复核），另可按需新增 `w40_review_mode`（W40-21 的 `review` 设置检查，独立数据根）。
全部判定来自产品运行后的观察（DOM、IPC 响应、工作区文件哈希、产品库）；fixture 只负责让模型发出工具调用。

| 用例 | 断言 ID | 做法与判定 | 证据 |
|---|---|---|---|
| W40-16 | `A9-W40-REVIEW-SUMMARY-CARD` | 第 1 轮：修改 `calc.ts`、新建 `notes.md`。轮次终态后等待 `.change-summary[data-turn-id=<turnId>]`；卡片文件数与 `+a −d` 与 `a9.diff.get(turnId).review` 一致；截图 | `w40-16-summary.json`、`w40-16-summary.png` |
| W40-17 | `A9-W40-REVIEW-UNDO-RECALL`、`A9-W40-REVIEW-UNDO-FILE`、`A9-W40-REVIEW-UNDO-PERSISTED` | 对 `notes.md` 点“撤销此文件”，2 秒内点“撤回”：文件哈希不变。再次撤销并等待到时：`notes.md` 不存在（新建文件撤销为删除），状态“已撤销”。`w40_review_restart` 中该文件仍显示“已撤销”，再次撤销结果为“此前已撤销”且文件系统不变 | `w40-17-undo.json` |
| W40-18 | `A9-W40-REVIEW-EXTERNAL-DRIFT` | 第 2 轮修改 `a.txt`、`b.txt`；驱动随后直接改写 `b.txt`（模拟外部编辑）。撤销本轮全部：`a.txt` 恢复到轮前哈希；`b.txt` 内容保持外部改写后的哈希，`driftReasons` 为 `external`，界面显示外部修改文案 | `w40-18-external.json` |
| W40-19 | `A9-W40-REVIEW-LATER-TURN` | 第 3 轮再改 `calc.ts`。撤销第 1 轮的 `calc.ts`：被拒绝，`driftReasons` 为 `later_turn` 且 `laterTurnId` 为第 3 轮，文件哈希不变。撤销第 3 轮的 `calc.ts` 后再撤销第 1 轮的 `calc.ts`：成功，哈希等于第 1 轮前 | `w40-19-later.json` |
| W40-20 | `A9-W40-REVIEW-COMMAND-CHANGES` | 工作区预置 3 MiB 文件 `big.bin`（超过 Shell 基线单文件上限 2 MiB）。第 4 轮让模型运行一个命令：新建 `gen.txt` 并改写 `big.bin`。改动视图中 `gen.txt` 可撤销且撤销后不存在；`big.bin` 以“无法撤销”列出并含“超过备份上限”。若在 Win7 上该项无法触发，记 `NOT_PERFORMED` 并写原因 | `w40-20-command.json` |
| W40-21 | `A9-W40-REVIEW-NON-BLOCKING`、`A9-W40-MODE-TWO-OPTIONS`、`A9-W40-REVIEW-MODE-FAIL-CLOSED` | 有未撤销改动时输入框可用且能立即提交下一轮并完成；权限对话框只有 `full_access`、`read_only` 两个选项；另一数据根经 `A9PersistenceManager.setWorkspaceMode` 设为 `review` 后启动，fixture 发出写工具调用：结构化拒绝、目标文件不存在或哈希不变、不出现 Full Access 行为 | `w40-21-mode.json` |
| W40-22 | `A9-W40-REVIEW-LAYOUT` | 打开“改动”页签并展开一轮与一个文件：`document.documentElement.scrollWidth <= clientWidth`；“撤销此文件”“撤销本轮全部”“撤回”按钮的包围盒在视口内且可聚焦；记录 `innerWidth/innerHeight/devicePixelRatio`；截图。`devicePixelRatio` 不为 1.25 时在报告中注明 125% 未覆盖 | `w40-22-layout.json`、`w40-22-layout.png` |

### 3.4 用例索引与报告

- smoke 结束时写 `w40-case-index.json`（W40-01～22 → 断言 ID、结果、证据文件）；`A9-W40-REQUIRED-ASSERTIONS-PRESENT` 覆盖全部新断言。
- 阶段汇总（`validatePhaseReports`）覆盖全部继承与新增阶段；总状态核对各组阶段数量。

## 4. 开发机门

在 `a9-package.test.mjs` 新增并全部通过：

1. W40 派生文件与 W39 的差异只包含身份替换与验证说明登记的追加项（逐文件比对测试）。
2. 残留守卫对注入的 W39、W38、W37 字面量报错；打包驱动中无 `A9-W39-`。
3. `A9-W40-` 断言不得以字面量 `true` 记录；新增阶段的判定读取产品产物（源码检查：W40-16～22 判定引用 `getDiff`/DOM/文件哈希/产品库）。
4. 阶段汇总：用最小夹具证明新增阶段缺报告或失败时总状态为 FAIL，全部通过时为 PASS。
5. 新增旅程的纯函数（计数比对、漂移判定解析、布局判定、PID 消失计时）有单测，并各有注入反例失败。
6. 用 `vm` + 假 DOM 加载真实 `a9-workbench.js`（沿用 `a9-change-review-workbench.test.ts` 的方式）验证驱动使用的选择器与文案在当前界面存在：
   `.change-summary`、`.review-file-toggle`、“撤销此文件”“撤销本轮全部”“撤回”、`#a9-undo-state` 的外部修改与后续轮次文案。

另须通过：`src/shell` 全量 Jest、`npm run verify:quick`、`npm run docs:check`、`git diff --check`。驱动 `w40*` 旅程无法在开发机运行，报告写明“未运行，待 Win7 预演”。

## 5. 交付与报告

本地提交后报告：基线、分支、提交与改动文件清单；P-2 逐处登记；派生差异摘要；W40-01～22 → 断言 ID → 证据文件映射表；§4 每项测试命令与结果，反例失败证据；
待验证项（W40-20 能否在 Win7 触发、W40-22 的 DPI、`w40_stop` 的命令在 PowerShell 5.1 下的行为）；发现的产品缺陷（如有，未修改）。不得宣布“验收通过”。

## 6. 裁决记录

### 6.1 2026-09-27：执行方开工前的两项合同矛盾

执行方在开工前提出两项矛盾，验收方核实均属实，裁决如下。本节优先于上文 §2、§3.1 P-3 与 §4 第 1 项中与之冲突的措辞。

**R-1 发布目录内的文档。** §2 所说“不得修改……文档”指 `docs/**`（由验收方维护），不包括 A9-25 §3 已授权的发布目录文件。允许：
新增 `release/win7-product-v3/A9_25_WIN7_40_VALIDATION.md`；更新 `release/win7-product-v3/README.md`，只追加 WIN7-40 条目，WIN7-39 及更早的条目不改。`docs/**` 仍然禁止修改。

**R-2 派生文件中的候选谱系陈述。** 除身份替换与追加外，允许第三类非身份差异“谱系更正”，范围只限于描述候选来源的事实陈述及其配套校验：

1. 输入锁 `provenance`：`task`、`previous_candidate`（`WIN7-39`）、`previous_candidate_result`（`A9_23_WIN7_39_A9_20_A9_21_PASS`）、`change_scope`、`rule`。
   `rule` 须如实写明：产品源码相对 WIN7-39（`7ec9db7`）已变更，列出变更文件，以 `git diff 7ec9db7..<基线> -- src` 排除测试目录后的实际结果为准；
   A9-24 改动审阅是本候选的被测功能；暂存区式 Review 模式按 ADR-0143 保持 fail-closed；Shell 运行中输出仍关闭。
   原生输入、版本与能力集标识未变的陈述，须以哈希或 A9-25 §2 第 1 条为据，不能照抄。
2. 派生文件头部的来源注释（例如 `DERIVED FROM THE FROZEN WIN7-38 ARTIFACT`），改为如实说明 W40 从 WIN7-39 冻结文件派生。
3. 校验上述字段的代码（例如 W39 完整性脚本第 135～136 行对 `previous_candidate` 的检查），必须与第 1 项同步更正，检查强度不得降低。

限制：不得借谱系更正改变任何判定逻辑、阈值、断言语义或用例口径。每处更正都要在验证说明中逐条登记（文件、W39 原文、W40 文本、理由）；
§4 第 1 项的逐文件比对测试按“身份替换 + 已登记追加 + 已登记谱系更正”三类精确放行，未登记的差异必须导致测试失败。
执行方须在全部派生文件中检索其他谱系陈述，一并登记并在交付报告中列出。若某处更正需要改动 WIN7-39 文件或产品源码，停止并报告。

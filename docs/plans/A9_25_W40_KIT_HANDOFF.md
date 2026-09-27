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

### 6.2 2026-09-27：派生 smoke 中与新用例编号冲突的行内注释

执行方报告：`a9-win7-40-smoke.cjs` 中两处 ADR-0136 行内注释经身份替换后写作 `W40-16/17` 与 `W40-20/21`，而这四个编号在 W40 中已分配给 A9-24 用例。
验收方核实：两处注释源自 WIN7-37 smoke（A9-19 用例编号 16/17、20/21），W39 派生时已被机械改成 `W39-*`（W39 用例只到 15，当时没有冲突）。

裁决：允许把这两处注释更正为指向其历史出处，作为 §6.1 R-2 “谱系更正”的补充，只改注释文字：

1. 写法说明其为 A9-19 / WIN7-37 的用例编号（例如“A9-19 延迟流式用例，WIN7-37 编号 16/17”），不写成 `W37-NN` 或 `W40-NN` 形式，以免与 W40 用例编号或残留守卫字面量混淆；
2. 在验证说明中逐条登记（文件、W39 原文、W40 文本、理由），并纳入逐文件比对测试的精确放行清单；
3. 不改残留守卫；若更正后的文字仍触发守卫，停止并报告，不得放宽守卫。

同类问题的一般规则：身份替换后与 W40 新编号或新断言 ID 冲突的**注释**，一律按本条更正并登记；若冲突出现在代码、断言 ID 或证据文件名中，停止并报告。

## 7. 第一次预演（`20260927-1741`）复核与第二轮返工

### 7.1 复核结论

预演按[预演交接书](A9_25_W40_REHEARSAL_HANDOFF.md)执行，全部证据 `REHEARSAL_NOT_ELIGIBLE`；验收方已把目录复制到主工作区 `.acceptance/rehearsals/A9-25-W40/20260927-1741/`，
`SHA256SUMS.txt` 2389 条复算一致。构建源 `7fce103`，ZIP `05e53092…55c5`；计划任务回读走 COM 后备，七字段一致；`agent` Medium；后飞行无 Electron、helper 或测试 Shell 残留（停止用例 PID 776 已不存在）。
秘密扫描命中全部来自扫描规则自身、夹具源码模板或二进制片段，运行证据中无真实秘密。

- 继承的 13 个阶段（`first`～`live`、`w40_startup`～`w40_m4`）退出码 0、报告 `PASS`；W40-01～15 的重基线在 Win7 实跑有效。
- 新增 4 个阶段中，W40-16～19 的产品观察符合预期：摘要卡“2 个文件 · +3 −1”与 `review` 一致；撤回 4 ms、哈希不变；外部修改与后续轮次两种 `driftReasons` 正确；重启后“已撤销”，再次撤销为“此前已撤销，未重复执行”。
- 执行方登记的 K-01～K-04 均属实；两项“疑似产品问题”经复核**均为套件问题**，改编为 K-05、K-06。本次预演**未发现产品缺陷**。

| 编号 | 事实与根因 | 证据 |
|---|---|---|
| K-01 | 驱动 `captureVisual` 截图前关闭检查器，W40-05/13/22 截图均无“改动”页签与 Diff；`A9-W40-DIFF-SCREENSHOT`、`A9-W40-M3-DIFF-SCREENSHOT` 只在截图前检查 DOM，截图不符时仍为 `true` | `w40-05-diff.png`、`w40-13-checkpoint-paging.png`、`w40-22-layout.png` |
| K-02 | 产品把超过基线上限的文件记为 `kind=modified`，`reason` 含 `too_large`；驱动按 `kind==='too_large'` 匹配，误记 `NOT_PERFORMED`。`unrecoverableText` 取自点击后立即读取的行文本，未等待展开渲染 | `w40-20-command.json` |
| K-03 | 工作区为 `review` 时产品界面按设计禁用发送并弹出权限对话框（文案“此工作区保存了不可用的 Review 模式，写入仍会被拒绝”），驱动经界面提交而等待 `turn_started` 超时 | `w40_review_mode.json`、产品库 0 轮次 |
| K-04 | 阶段报告无耗时字段 | `automatic-smoke.json` |
| K-05（原 P-01） | 产品取消路径按现有设计不写终态事件（`finalize` 不带事件类型），终态只在 `a9_turns` 与界面 `#a9-turn-outcome`；继承的 `stop` 旅程即按界面判定。驱动等待 `turn_cancelled` 等事件超时，且 PID 计时结果只在等待之后写出，因超时丢失 | `w40_stop.json`、产品库 `a9_turns.status=cancelled` |
| K-06（原 P-02） | 窗口宽 1079 < 1200 时检查器为抽屉（`translateX(100%)`，打开有 0.18 s 过渡）。由于 K-01 抽屉被关闭，再次打开后立即测量，按钮坐标落在抽屉滑入途中（`file.left=1118 > innerWidth=1079`）；纵向超出为列表未滚动到位 | `w40-22-layout.json`、`a9-workbench.css:452-459` |

产品侧观察（不是缺陷，不返工，登记待议）：
- **O-1** 取消的轮次不写终态事件，事件流与 `a9_turns` 的终态表达不一致；如后续功能依赖事件流判断终态，需另议。
- **O-2** 超过基线上限的 Shell 变化以 `kind=modified` 记录，界面对 `too_large` 的“超过备份上限”映射在此路径不可达，原因文字会带出内部标记（如“缺少原始内容（轮前基线未覆盖（too_large）…）”）。满足 A9-24 CR-06“无法撤销并给原因”，措辞改进可并入第一批。

### 7.2 返工要求（第二轮）

分支、允许路径与禁止项同 §2（含 §6.1、§6.2）；继承旅程与 `captureVisual` 不得修改；另起提交，不 amend。

1. **K-01**：新增 W40 专用截图辅助函数：确保检查器已打开且“改动”页签选中、目标轮次与文件 Diff 展开，等待抽屉过渡结束（检查器包围盒完全在视口内）后截图；
   **截图后**再次读取 DOM，确认检查器仍打开、Diff 可见，才记录 `A9-W40-DIFF-SCREENSHOT`、`A9-W40-M3-DIFF-SCREENSHOT`。W40-05、W40-13、W40-22 改用该函数；W40-16 仍用对话流截图。
2. **K-02**：按 `path === 'big.bin'` 且（`kind === 'too_large'` 或 `reason` 含 `too_large`）匹配；等待 `.review-unrecoverable` 渲染后读取其文本。
   **W40-20 判定口径裁决**：界面文本含“无法撤销”、`big.bin` 与原因（“超过备份上限”或含 `too_large` 的原因文字之一），原文记入证据；不再要求必须出现“超过备份上限”（见 O-2）。
3. **K-03 与 W40-21 review 模式判定口径裁决**：改为两部分，全部满足才记 `A9-W40-REVIEW-MODE-FAIL-CLOSED`：
   (a) 界面：启动后权限对话框可见，文案含“不可用的 Review 模式”与“写入仍会被拒绝”，只有 `full_access`、`read_only` 两个选项，发送按钮禁用，`snapshot.mode` 仍为 `review`；
   (b) 后端：直接调用产品的 `window.win7Agent.a9.submitTurn(...)`，原样记录响应；若启动了轮次，按 `a9_turns` 与事件等待其结束。要求 `review-denied.txt` 始终不存在、
   模式未变为 `full_access`，且响应为结构化拒绝，或该轮写工具结果含 `REVIEW mode requires a review staging backend`。不得调用 `setMode` 或以其他方式绕过产品设置。
4. **K-04**：每个阶段记录 `started_at`、`ended_at`、`duration_ms`（阶段记录只增字段，在验证说明登记为追加）。
5. **K-05**：`w40_stop` 在计时循环结束后**立即**把 `pid`、`childGone`、`elapsedMs` 写入报告与 `w40-06-stop-exit.json`；终态按继承 `stop` 旅程的口径读取
   `#a9-turn-outcome` 含 `cancelled` 与 `snapshot.agentStatus === 'cancelled'`，另记录产品库 `a9_turns` 该轮状态，不再等待终态事件。
6. **K-06**：布局测量前确认检查器抽屉过渡结束（包围盒在视口内且 `transform` 为无位移），逐个按钮 `scrollIntoView({ block: 'nearest', inline: 'nearest' })` 后测量；
   记录检查器包围盒；“撤回”在同一抽屉状态下测量。判定仍为页面无横向滚动、三个按钮完整在视口内且可聚焦。
7. **开发机门**：§4 全部检查重跑；为 K-01、K-02、K-03、K-05、K-06 各新增纯函数或夹具测试并有注入反例（截图后检查器关闭、`kind=modified` 含/不含 `too_large`、
   模式被改为 `full_access` 或文件被写出、终态读取超时时 PID 观察仍已落盘、抽屉滑入途中的几何）。以本次预演真实产出的 JSON 作只读夹具重放 K-02、K-05、K-06 的判定。
8. 交付报告另列：每项返工与对应测试、反例失败证据、验证说明新增的登记项。返工通过后做第二次预演。

### 7.3 第二轮返工（`2f14d69`）复核与第三轮返工

复核通过的部分：改动只涉及允许路径；驱动相对 `ae25dd0` 的非新增改动仍只有两处工作区选择判断，`captureVisual` 与继承旅程逐字节不变；
K-01、K-02、K-05、K-06 的实现符合 §7.2；新增预演夹具 `a9-w40-rehearsal-20260927-1741-observations.json` 属允许的 `w40` 夹具。验收方复跑 `a9-package.test.mjs` 77/77。

需返工两处（均在 smoke 中所有阶段共用的 `runElectron`，以及 W40-21 判定）：

1. **R3-1 不得改写驱动原始报告，计时不得影响阶段执行。** 现实现在子进程 `close` 回调中读取驱动报告、合并计时字段后写回同一文件：
   报告不是合法 JSON 时 `readJson` 返回 `{status:'NO_REPORT'}` 并**覆盖**驱动原始输出，证据被破坏；`w40PhaseTiming` 在墙钟回拨时抛出异常，
   位于回调内会使该 Promise 永不完成、smoke 挂起（Win7 运行中发生时间同步是可能的）。要求：驱动报告文件保持驱动写出的原始字节；
   计时只写入 smoke 自身的阶段记录与总报告（或独立的 `<阶段>.timing.json`）；`duration_ms` 用单调时钟（`process.hrtime.bigint()` 或 `performance.now()`），
   `started_at`/`ended_at` 仍取墙钟；计时异常只记录为字段，不抛出。新增测试与反例：损坏的驱动报告在阶段结束后字节不变；墙钟回拨时阶段仍正常完成且 `duration_ms` 非负。
2. **R3-2 W40-21 的“结构化拒绝”口径。** 现 `rejected` 分支要求错误码含 `REVIEW` 或消息含特定文案，窄于 §7.2 第 3 项。
   改为：`ok === false` 且 `error.code` 为非空字符串即视为结构化拒绝，原样记录 `code` 与 `message`；其余条件（界面层、零写入、模式不变）不变。补对应正例与反例。

以上两处之外不再扩大范围。另起提交，不 amend；§4 全部检查重跑。通过后做第二次预演。

登记（不返工）：**O-3** 第二轮交付时 shell 全量 Jest 首次运行中 `a9-lifecycle.test.ts:945`（外部变化路径含秘密时本轮应失败）一次观察到 `turn.ok === true`；
执行方单测与全量重跑、验收方单独重复 15 次均未复现。该用例由后台进程写文件，疑为后台写入与轮后变化收集之间的时序竞争；属于产品测试或产品行为，不在本套件范围，另行核查。

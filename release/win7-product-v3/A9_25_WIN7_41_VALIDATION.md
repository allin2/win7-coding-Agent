# A9-25 / WIN7-41 验证套件说明

本文件只说明验证套件的派生与开发机检查，不签发候选结论。WIN7-40 按 ADR-0145 记为 `A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS`；其冻结文件、authority 和实机证据保持不可变。W41 的 22 项判定口径与 W40 一一对应。`w41*` 旅程待 Win7 预演。

## 1. 派生边界

从修复 R6 后的 W40 文件生成 `a9-25-win7-41-input-lock.json`、`a9-package-integrity-w41.cjs`、`a9-win7-41-report.cjs`、`a9-win7-41-smoke.cjs`、`RUN_A9_25_W41_INTEGRITY.cmd`、`RUN_WIN7_41_REPORT_VERIFY.cmd`。身份替换为 `WIN7_40→WIN7_41`、`WIN7-40→WIN7-41`、`win7-40→win7-41`、`W40→W41`、`w40→w41`；任务号 `A9-25`、`A9_25` 保持不变。源文件 W40 发布件相对 `033844a` 不改。打包驱动从仓库驱动生成，重基线 `w39/W39/w40/W40` 到 `w41/W41`，每个源片段计数固定；仓库的旧旅程不改。

### 非身份差异登记

| 文件与位置 | W40 | W41 | 理由 |
|---|---|---|---|
| 输入锁 `provenance.previous_candidate` | `WIN7-39` | `WIN7-40` | 前序候选身份 |
| 输入锁 `provenance.previous_candidate_result` | `A9_23_WIN7_39_A9_20_A9_21_PASS` | `A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS` | ADR-0145 结论 |
| 输入锁 `provenance.change_scope` | `A9_24_CHANGE_REVIEW_WIN7_40_VALIDATION` | `A9_25_R6_TIMING_REPAIR_WIN7_41_VALIDATION` | R6 修复与换发 |
| 输入锁 `provenance.rule` | W40 从 W39 派生，产品源码较 W39 有变化 | W41 从修复后的 W40 套件派生，产品源码较 WIN7-40 `64fd3a7` 未变 | `git diff` 核对与 ADR-0145 |
| 完整性脚本 `verifyLock` | 校验 W39 前序三字段 | 校验 W40 前序三字段 | 与输入锁一致，不降低检查强度 |
| 完整性、报告器、smoke 首部注释 | W39 为直接来源、ADR-0144 | W40 为直接来源、ADR-0145 | 谱系事实 |
| 完整性、报告器、报告命令中的 Kit 文件名 | `A9_25_VALIDATION_KIT.json` | `A9_25_W41_VALIDATION_KIT.json` | 避免与 W40 文件名冲突 |
| 完整性、报告器 Kit ID | `A9-25-WIN7-40-20260926-01` | `A9-25-WIN7-41-20260928-01` | 新套件身份 |
| Kit `decision` / `historical_candidate` / `result_on_complete` | ADR-0144 / W39 PASS / W40 A9-24 PASS | ADR-0145 / W40 套件缺陷不通过 / `A9_25_WIN7_41_A9_24_PASS` | 历史结论与新结论上限 |
| 报告种类 | `A9_25_WIN7_40_A9_24_ACCEPTANCE` | `A9_25_WIN7_41_A9_24_ACCEPTANCE` | 新报告身份 |

输入锁三项外部输入的哈希保持与 W40 一致。W41 仍在 `0.3.0-alpha.1`、`WIN7-CODING-AGENT-A9-ALPHA1` 能力集标识下运行；不据此推断 Win7 结果。历史 v24 helper 与 W37 投影解析器来源是历史描述，未改判。

## 2. R6 时序修复

`a925OpenFileDiff` 在点击前建立 `#a9-diff` MutationObserver；只在该节点确实更新、目标轮次 DOM 重绘、完整 Diff 含目标路径，且展开状态与按钮状态相隔至少 300 ms 保持一致后决定是否展开。展开后再次等待目标 Diff 和“撤销此文件”按钮同时存在。`a925ClickUndo` 的按钮与确认按钮、`queueNoteUndo` / `recallNoteUndo` 的按钮和结果、截图前 DOM、Stop 子进程与取消控件、Review 模式恢复、重启后的撤销行文字均经带最后观察的等待。超时诊断写入阶段报告 `w40WaitTimeouts` 并附在错误信息中，单条上限 2048 字符。

W40-20 的 `big.bin` 无法恢复项已经等待该轮 `.review-unrecoverable` 文本；保持此项等待，不改变 `NOT_PERFORMED` 判定。独立的产品回执、文件哈希和最终断言仍按 W40 原口径读取，避免用套件自报代替产品证据。

## 3. 开发机与实机边界

开发机验证运行 `scripts/release/test/a9-package.test.mjs`、`src/shell` 全量 Jest、`npm run verify:quick`、`npm run docs:check`、`git diff --check`；注入反例应使竞争旧写法、无最后观察、未登记派生差异和残留字面量失败。WIN7-40 正式实机 JSON 只读重放既有判定。W41 预演、冻结、authority、正式实机及验收均不在本文件授权范围；`w41*` 旅程待 Win7 预演。

只读重放夹具逐字节复制自 `.acceptance/runs/A9-25-W40/81c7a234-4745-4c79-8554-8c1a4b9f407e/evidence/smoke/自动 运行 w40-1790527291597/`：`w40_review.json` → `a9-w41-physical-review.json`，SHA-256 `0bc9cdbb…d1e28`；`w40_review_mode.json` → `a9-w41-physical-review-mode.json`，`f406e796…0ecc`；`w40_stop.json` → `a9-w41-physical-stop.json`，`66050b41…1eafb`。测试以完整哈希固定三份副本，重放失败前四条审阅断言、Review 模式与 Stop 判定；这不把 W40 的失败阶段转为通过，也不替代 W41 实跑。

## 4. 用例到断言和证据映射

Kit 中的 `runtime_assertions` 与 `evidence` 如下；smoke 运行时还会给 W41-06 增补 `w41-06-stop-exit.json`，W41-20 的过大文件若目标环境未触发则按既有口径记 `NOT_PERFORMED`。

| 用例 | 断言 ID | 证据文件 |
|---|---|---|
| W41-01 | `manifest_files_checked`, `zip_entries_checked`, `mismatches` | `integrity-output.txt`, `a9-package-integrity.json` |
| W41-02 | `A9-W41-CHINESE-SPACE-PATHS` | `w41-02-paths.json` |
| W41-03 | `A9-W41-STARTUP-WITHIN-60S` | `w41-03-startup.png`, `w41-03-startup.json` |
| W41-04 | `A9F1-TOOL-JOURNEY`, `A9F1-SHELL-EVENT-DTO-UI`, `A9-15-PROGRESS-EVENT-ORDER`, `A9-15-PROGRESS-RENDERED-ONCE` | `w41-04-task-flow.json` |
| W41-05 | `A9F1-DIFF`, `A9F1-SNAPSHOT-FACTS`, `A9-W41-DIFF-SCREENSHOT` | `w41-05-diff.png`, `w41-05-diff.json` |
| W41-06 | `A9F1-APPROVAL-CARD-TRUE-TARGET`, `A9-15-DENY-ZERO-TARGET-SIDE-EFFECT`, `A9F6-STOP-TURN-CANCELLED`, `A9F2-RESTORE-ACTIVE-WORKSPACE`, `A9-15-QUERY-FAILURE-VISIBLE-RETRY`, `A9-W41-STOP-CHILD-EXIT-WITHIN-5S` | `w41-06-approval-stop-restart.json`, `w41-06-stop-exit.json` |
| W41-07 | `A9-W41-GIT-FORM-01`～`06` | `w41-07-09-git-forms.json` |
| W41-08 | `A9-W41-GIT-FORM-07`～`12`, `18`, `19` | `w41-07-09-git-forms.json` |
| W41-09 | `A9-W41-GIT-FORM-13`～`17` | `w41-07-09-git-forms.json` |
| W41-10 | `A9-W41-M1-TARGETED-RECOVERY`, `A9-W41-M1-STARTUP-TIMING-RECORDED` | `w41-10-startup-recovery.json` |
| W41-11 | `A9-W41-M1B-FREEZE-DURATION`, `A9-W41-M1B-URL-REDACTED` | `w41-11-m1b-hex-redaction.json` |
| W41-12 | `A9-W41-M2-TRUNCATED-WITH-WARNINGS`, `A9-W41-M2-TOOL-NOT-EXECUTED`, `A9-W41-M2-NEXT-TURN-OK` | `w41-12-output-limits.json` |
| W41-13 | `A9-W41-M3-COUNT-MATCHES-DB`, `A9-W41-M3-OLDER-PAGES-CONTINUOUS`, `A9-W41-M3-OLDER-DIFF`, `A9-W41-M3-DIFF-SCREENSHOT` | `w41-13-checkpoint-paging.png`, `w41-13-checkpoint-paging.json` |
| W41-14 | `A9-W41-M4-CAP-NOTICE`, `A9-W41-M4-RELEASED-COUNT-ACCURATE`, `A9-W41-M4-RENDERER-MEMORY-SAMPLED` | `w41-14-collection-bounds.json` |
| W41-15 | `A9-W41-FINAL-NO-RESIDUE` | `w41-15-residue.json` |
| W41-16 | `A9-W41-REVIEW-SUMMARY-CARD` | `w41-16-summary.json`, `w41-16-summary.png` |
| W41-17 | `A9-W41-REVIEW-UNDO-RECALL`, `A9-W41-REVIEW-UNDO-FILE`, `A9-W41-REVIEW-UNDO-PERSISTED` | `w41-17-undo.json` |
| W41-18 | `A9-W41-REVIEW-EXTERNAL-DRIFT` | `w41-18-external.json` |
| W41-19 | `A9-W41-REVIEW-LATER-TURN` | `w41-19-later.json` |
| W41-20 | `A9-W41-REVIEW-COMMAND-CHANGES` | `w41-20-command.json` |
| W41-21 | `A9-W41-REVIEW-NON-BLOCKING`, `A9-W41-MODE-TWO-OPTIONS`, `A9-W41-REVIEW-MODE-FAIL-CLOSED` | `w41-21-mode.json` |
| W41-22 | `A9-W41-REVIEW-LAYOUT` | `w41-22-layout.json`, `w41-22-layout.png` |

## 5. R6-3 一次性查询与抛错普查

| 位置 | 处理 | 理由 |
|---|---|---|
| `a925OpenFileDiff` 的轮次按钮、重绘、文件行查询 | 改为三段等待；Diff mutation 与 DOM 重绘、300 ms 稳定、按钮可见 | 消除 WIN7-40 已复现的旧 DOM 竞争 |
| `a925ClickUndo` 的撤销及确认按钮 | 改为等待并在同一 Renderer 查询中点击 | 控件未生成或禁用时保留最后观察，不再立即抛错 |
| `a925CaptureDiff` 的截图前 `SCREENSHOT_DOM_NOT_READY` | 改为 `a925WaitFor`；检查器页签点击后另有等待 | 过渡中的 DOM 不再立即失败；截图后仍做独立复核 |
| `runW40StopProcess` 的 `STOP_CHILD_NOT_RUNNING` | 改为取消控件和 PID 同时就绪等待 | 进程标记与界面控件出现可有先后 |
| `runW40ReviewProcess` 的 `queueNoteUndo` / `recallNoteUndo` | 改为按钮可用、待撤回/已撤回状态分别等待 | 点击与渲染分离，不以同步返回的旧 DOM 作结果 |
| W40-20 `big.bin` 行文本 | 保留已存在的 `a925WaitFor` | K-02 已等待该轮 `.review-unrecoverable` 文案；按产品结果判定 |
| `runW40ReviewRestartProcess` 的撤销后行文字 | 改为等待“已撤销” | 重启恢复与列表渲染可能异步 |
| `runW40ReviewModeProcess` 的 `REVIEW_MODE_NOT_RESTORED` | 改为模式快照等待 | 启动快照恢复可能晚于驱动读取 |
| `a925InspectorState` / `a925DiffState` 的单次 DOM 采样 | 保留采样函数，调用点已分别通过 `a925WaitFor` 等待 | 每次采样保持同一时刻的几何与文件状态 |
| `a925MeasureControls` 与布局几何采样 | 保留；先完成 Diff 展开和检查器过渡等待，缺控件使布局断言为 false | 几何快照须反映同一布局状态，失败会留原始量测 |
| Stop 点击、Review 模式配置与直接产品 IPC 的 `exec` | 保留一次性动作；前置控件已有等待或产品回执/终态由后续证据判定 | 重复点击/提交/撤销会造成实际副作用，不能以轮询重放 |
| `a925WaitFor` 超时抛错；截图目录、Stop 证据路径、提交轮次终态、重启 turnId 前置抛错 | 保留 | 超时附最后观察；其他是缺失环境、证据路径或终态的硬失败，不属于可等待的 DOM 竞争 |

## 6. P-2 集合与候选分支登记

`scripts/release/build-a9-product-v3.mjs` 在七处原列出 `WIN7-40` 的集合/数组中追加 `WIN7-41`：`A915_CANDIDATES`、`A915_DIRECT_SMOKE_CANDIDATES`、候选投影键守卫、`writeCandidateDriver` 可重基线候选表及其晚载入错误码表、发布阶段拷贝投影契约的候选表、manifest 的投影契约候选表。另在 W41 专属分支登记 profile、残留守卫（validation 与 stage 根）、驱动重基线、Kit 生成、任务书契约拷贝、A9-20/A9-21 契约拷贝、输入锁谱系校验。WIN7-40 专属逻辑保留；W41 分支不修改历史候选生成规则。

W41 打包驱动源片段计数：`w39` 133、`W39` 76、`w40` 58、`W40` 35；其余继承的 W37/W38 断言和动作替换仍逐片段要求恰好一次。源计数变化会使打包失败。W41 残留守卫覆盖 `A9-W40-`、`A9_W40_`、`WIN7_40_RELEASE_AUTHORITY`、`APPROVED_FOR_WIN7_40_VALIDATION`、引号内 W40 用例键、旧 `A9_25_VALIDATION_KIT`、W40 旧结论及 W37～W39 与 `A9_20_A9_21` 同类字面量。合法历史只在输入锁的 `previous_candidate_result`、`rule` 固定语句、完整性脚本的精确校验及 Kit `historical_candidate` 中描述；守卫只精确遮蔽前三处，额外出现旧结论即构建失败，均不作为当前结论。

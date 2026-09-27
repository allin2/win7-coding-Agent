# A9-25 / WIN7-40 验证套件说明

本文件记录套件实现的派生边界和待运行项目，不签发候选验收结论。基线为 `codex/a9-alpha2` 的 `ae25dd08502949f86348ab2141ed1b73aa678f4f`；W40 从冻结的 WIN7-39 套件派生，依据 ADR-0144 与 A9-25 任务书。WIN7-39 及更早发布文件不变。

## 1. 派生规则与输入

六个文件分别从 W39 同类文件派生：`a9-25-win7-40-input-lock.json`、`a9-package-integrity-w40.cjs`、`a9-win7-40-report.cjs`、`a9-win7-40-smoke.cjs`、`RUN_A9_25_W40_INTEGRITY.cmd`、`RUN_WIN7_40_REPORT_VERIFY.cmd`。身份替换为 `WIN7_39→WIN7_40`、`WIN7-39→WIN7-40`、`win7-39→win7-40`、`A9_23→A9_25`、`A9-23→A9-25`、`a9-23→a9-25`、`W39→W40`、`w39→w40`。由 `A9_23_...` 或 `a9-23-...` 组成的文件名也按候选身份更新。其余差异只属于下表已登记的追加或 §2 的谱系更正；逐文件测试用精确登记的内容哈希拒绝任何额外差异。

三个正式输入与 W39 锁的 `inputs.electron_zip`、`inputs.runner_return_zip`、`inputs.storage_return_zip` 精确相同，包括包与必需入口 SHA-256。`version` 仍是 `0.3.0-alpha.1`，`release_id` 仍是 `WIN7-CODING-AGENT-A9-ALPHA1`（A9-25 §2.1）。这些是锁和任务书的事实，不代表新的 Win7 验证。

| 文件 | 已登记的非身份追加或收紧 | 理由 |
|---|---|---|
| 输入锁 | 无；仅 §2 谱系更正 | 输入与能力标识不变 |
| 完整性脚本 | kit 用例数 15→22，ID 范围扩至 W40-22，必需用例名追加 W40-16～22 | 新用例必须进入完整性闭包；原有判定和阈值不变 |
| 报告器 | 用例数 15→22，预期用例名追加 W40-16～22，说明文字同步 | 新用例必须由正式报告核对；原有规则不变 |
| smoke | 追加停止命令、改动审阅与 Review 模式 fixture；追加 `w40_stop`、`w40_review`、`w40_review_restart`、`w40_review_mode` 阶段；工作区、数据根、种子、残留检查、证据文件、必需断言与 W40-16～22 索引 | T-1 与 A9-24 用例；判定读取产品进程、DOM、IPC、文件哈希或产品库 |
| smoke | W40-05 的截图与证据改由已展开文件 Diff 的 `w40_review` 获取；W40-13 改由 M3 最旧轮次已展开文件 Diff 获取；阶段汇总与总状态计入新增 4 阶段及 22 用例 | T-2 与 §3.4；旧五阶段及 W39 八阶段仍全部执行 |
| smoke | W40-20 对 `big.bin` 的 `too_large` 若产品运行未触发，索引写 `NOT_PERFORMED` 与具体原因，`gen.txt` 的可撤销观察仍单独记录；W40-22 只记录当前 DPI 与 125% 覆盖状态 | 不修改产品或系统 DPI，不将夹具准备记为产品 PASS |
| smoke | 两处 ADR-0136 行内注释改为 A9-19 / WIN7-37 历史用例编号，见 §2 | 避免与新增 W40-16/17/20/21 用例混淆；仅文字谱系更正 |
| 两个 `.cmd` | 无；仅身份替换 | 入口与参数合同沿用 W39 |

仓库驱动只新增 `w40*` 分派、旅程与 `a925*` 辅助函数。打包 W40 驱动时，`writeCandidateDriver` 先核对仓库源中 `w39` 恰有 133 处、`W39` 恰有 76 处，再只在输出副本替换为 `w40`/`W40`；九个继承 live 断言与一个 live 错误码逐项要求源出现恰好一次，再转为 W40。W40 包内另外精确替换一次 M3 按钮文案 `查看 Diff→查看改动`（A9-24 当前 UI），并精确替换一次 M3 截图调用以先断言检查器、轮次和文件 Diff。仓库内 W39 及更早旅程、历史断言键不改。

构建期残留守卫检查 W40 完整性脚本、报告器、smoke、打包驱动、输入锁和两个 `.cmd` 中 W37/W38/W39 的当前候选作用域字面量；旧前缀注入任一派生入口均须失败。W40 kit 的每个用例另外列出 `runtime_assertions`，直接对应 §3 的运行断言 ID。

## 2. 谱系更正逐条登记（R-2）

下列 W39 原文指冻结 W39 文件的实际文本，W40 文本指本套件目标文本。身份替换后仍需修改的每处事实均列在此处。头部说明的纯用例数量扩展列于 §1。

| 文件与位置 | W39 原文 | W40 文本 | 理由 |
|---|---|---|---|
| 输入锁 `provenance.previous_candidate` | `WIN7-38` | `WIN7-39` | W40 直接从已冻结 W39 派生 |
| 输入锁 `provenance.previous_candidate_result` | `A9_22_WIN7_38_VALIDATION_KIT_DEFECT_NOT_PASS` | `A9_23_WIN7_39_A9_20_A9_21_PASS` | 按 W39 正式结论记录前序身份 |
| 输入锁 `provenance.change_scope` | `A9_23_VALIDATION_KIT_REPAIR` | `A9_24_CHANGE_REVIEW_WIN7_40_VALIDATION` | 被测新增功能是 A9-24 改动审阅 |
| 输入锁 `provenance.rule` | `WIN7-39 repairs the WIN7-38 validation kit defect (ADR-0142, A9-23): the smoke derives mechanically from WIN7-37, passes the product entry, and adds W39 journeys for A9-20 and A9-21 with product-observation assertions. Product source, native inputs, version and capability set are unchanged; Review and Shell streaming stay closed. WIN7-38 and all earlier candidates and external evidence remain unchanged.` | `WIN7-40 derives its validation kit from frozen WIN7-39 and tests A9-24 change review (ADR-0143/0144). Product source changed since WIN7-39 commit 7ec9db7: src/shell/product/a9-agent-runtime.js, src/shell/product/renderer/a9-workbench.css, src/shell/product/renderer/a9-workbench.js, src/shell/product/renderer/workbench.html, src/workspace/src/checkpoint-manager.ts. Native input bytes retain the WIN7-39 lock hashes; version and capability-set identifier remain 0.3.0-alpha.1 and WIN7-CODING-AGENT-A9-ALPHA1 per A9-25 section 2. Staging-style Review mode remains fail-closed under ADR-0143; Shell running output remains closed. WIN7-39 and earlier candidates and external evidence remain immutable.` | 产品源码已改变，不能沿用 W39 的“源码未变”；原生输入和标识经锁与任务书核对；保留 Review 与运行中 Shell 输出边界 |
| 完整性脚本头部 1～3 行 | `DERIVED FROM THE FROZEN WIN7-38 ARTIFACT … validation kit repair, ADR-0142`；`WIN7-38's G1 passed on the real machine … rebaselined from the W38 artifact` | `DERIVED FROM THE FROZEN WIN7-39 ARTIFACT … validation kit, ADR-0144`；`WIN7-39 passed on the real machine; this script retains its integrity contract and rebases candidate identity` | 纠正派生来源和 ADR，不宣称修改完整性逻辑 |
| 完整性脚本 `lock.provenance` 校验 | `previous_candidate !== 'WIN7-38'`；`previous_candidate_result !== 'A9_22_WIN7_38_VALIDATION_KIT_DEFECT_NOT_PASS'`；`change_scope !== 'A9_23_VALIDATION_KIT_REPAIR'` | `previous_candidate !== 'WIN7-39'`；`previous_candidate_result !== 'A9_23_WIN7_39_A9_20_A9_21_PASS'`；`change_scope !== 'A9_24_CHANGE_REVIEW_WIN7_40_VALIDATION'` | 与新锁同步，仍逐字段精确校验 |
| 报告器头部 1～2 行 | `DERIVED FROM THE FROZEN WIN7-38 ARTIFACT … validation kit repair, ADR-0142`；`identity semantics unchanged` | `DERIVED FROM THE FROZEN WIN7-39 ARTIFACT … validation kit, ADR-0144`；`inherited checks retain their semantics` | 纠正来源；新增用例后仅继承部分语义保持原样 |
| smoke 头部 1～9 行 | `MECHANICALLY DERIVED FROM a9-win7-37-smoke.cjs … ADR-0142`；`W37→W39 …`；`WIN7-39 inherits the WIN7-37 …`；`W39 additions after the five W37 journeys …` | `MECHANICALLY DERIVED FROM THE FROZEN a9-win7-39-smoke.cjs … ADR-0144`；身份及差异指向本说明；说明 W39 八阶段重基线与 W40 四阶段追加 | W40 直接派生于 W39；W37 是更早祖先，不能写成直接来源 |
| smoke ADR-0136 延迟流式 fixture 注释 | `// ADR-0136 / W39-16、W39-17：延迟流式 fixture。第一步先用约 3 秒逐块输出说明，再发起约 4 秒的 ping；` | `// ADR-0136 / A9-19 延迟流式用例（WIN7-37 编号 16/17）：第一步先用约 3 秒逐块输出说明，再发起约 4 秒的 ping；` | W39 的 16/17 指 A9-19 历史用例；机械身份替换会误指 W40 Review 新用例 |
| smoke ADR-0136 第五阶段注释 | `// ADR-0136：第五阶段——延迟流式下的运行过程实时可见（W39-16/17），并核对头部文案与左栏保持（W39-20/21）。` | `// ADR-0136：第五阶段——A9-19 / WIN7-37 编号 16/17 的延迟流式运行过程实时可见，并核对编号 20/21 的头部文案与左栏保持。` | W39 的 16/17、20/21 都指历史用例；W40 相同编号分配给 A9-24 Review |

已检索六个派生文件中的 `derived`、`source`、`previous_candidate`、`provenance`、`WIN7-37/38/39`、ADR、`W40-16`～`W40-22` 等谱系和编号文字。输入锁的原生 helper 来源、历史 v24 helper、报告器中 W37 投影解析器来源、`.cmd` 参数、W39 继承合同描述均与事实一致；除上述各处无其他需要更正的谱系陈述，代码、断言 ID 和证据文件名没有同类新编号冲突。完整性与报告器的“15→22”是新增用例的合同扩展，见 §1。

`git diff --name-status 7ec9db7..ae25dd0 -- src ':!src/**/tests/**'` 的实际结果：

```text
M src/shell/product/a9-agent-runtime.js
M src/shell/product/renderer/a9-workbench.css
M src/shell/product/renderer/a9-workbench.js
M src/shell/product/renderer/workbench.html
M src/workspace/src/checkpoint-manager.ts
```

## 3. 用例、断言与证据索引

`w40-case-index.json` 在 smoke 结束时列出每项实际断言结果及下列证据。所有路径均相对于候选外证据根。

| 用例 | 断言 ID | 证据文件 |
|---|---|---|
| W40-01 | 完整性计数、零 mismatch、独立 authority pin（非 smoke 断言） | `integrity-output.txt`、`a9-package-integrity.json` |
| W40-02 | `A9-W40-CHINESE-SPACE-PATHS` | `w40-02-paths.json` |
| W40-03 | `A9-W40-STARTUP-WITHIN-60S` | `w40-03-startup.json`、`.png` |
| W40-04 | `A9F1-TOOL-JOURNEY`、`A9F1-SHELL-EVENT-DTO-UI`、`A9-15-PROGRESS-EVENT-ORDER`、`A9-15-PROGRESS-RENDERED-ONCE` | `w40-04-task-flow.json` |
| W40-05 | `A9F1-DIFF`、`A9F1-SNAPSHOT-FACTS`、`A9-W40-DIFF-SCREENSHOT` | `w40-05-diff.json`、`.png` |
| W40-06 | `A9F1-APPROVAL-CARD-TRUE-TARGET`、`A9-15-DENY-ZERO-TARGET-SIDE-EFFECT`、`A9F6-STOP-TURN-CANCELLED`、`A9F2-RESTORE-ACTIVE-WORKSPACE`、`A9-15-QUERY-FAILURE-VISIBLE-RETRY`、`A9-W40-STOP-CHILD-EXIT-WITHIN-5S` | `w40-06-approval-stop-restart.json`、`w40-06-stop-exit.json` |
| W40-07 | `A9-W40-GIT-FORM-01`～`06` | `w40-07-09-git-forms.json` |
| W40-08 | `A9-W40-GIT-FORM-07`～`12`、`18`、`19` | `w40-07-09-git-forms.json` |
| W40-09 | `A9-W40-GIT-FORM-13`～`17` | `w40-07-09-git-forms.json` |
| W40-10 | `A9-W40-M1-TARGETED-RECOVERY`、`A9-W40-M1-STARTUP-TIMING-RECORDED` | `w40-10-startup-recovery.json` |
| W40-11 | `A9-W40-M1B-FREEZE-DURATION`、`A9-W40-M1B-URL-REDACTED` | `w40-11-m1b-hex-redaction.json` |
| W40-12 | `A9-W40-M2-TRUNCATED-WITH-WARNINGS`、`A9-W40-M2-TOOL-NOT-EXECUTED`、`A9-W40-M2-NEXT-TURN-OK` | `w40-12-output-limits.json` |
| W40-13 | `A9-W40-M3-COUNT-MATCHES-DB`、`A9-W40-M3-OLDER-PAGES-CONTINUOUS`、`A9-W40-M3-OLDER-DIFF`、`A9-W40-M3-DIFF-SCREENSHOT` | `w40-13-checkpoint-paging.json`、`.png` |
| W40-14 | `A9-W40-M4-CAP-NOTICE`、`A9-W40-M4-RELEASED-COUNT-ACCURATE`、`A9-W40-M4-RENDERER-MEMORY-SAMPLED` | `w40-14-collection-bounds.json` |
| W40-15 | `A9-W40-FINAL-NO-RESIDUE` | `w40-15-residue.json` |
| W40-16 | `A9-W40-REVIEW-SUMMARY-CARD` | `w40-16-summary.json`、`.png` |
| W40-17 | `A9-W40-REVIEW-UNDO-RECALL`、`A9-W40-REVIEW-UNDO-FILE`、`A9-W40-REVIEW-UNDO-PERSISTED` | `w40-17-undo.json` |
| W40-18 | `A9-W40-REVIEW-EXTERNAL-DRIFT` | `w40-18-external.json` |
| W40-19 | `A9-W40-REVIEW-LATER-TURN` | `w40-19-later.json` |
| W40-20 | `A9-W40-REVIEW-COMMAND-CHANGES`；未观察到 `too_large` 时用例索引为 `NOT_PERFORMED` 并写原因 | `w40-20-command.json` |
| W40-21 | `A9-W40-REVIEW-NON-BLOCKING`、`A9-W40-MODE-TWO-OPTIONS`、`A9-W40-REVIEW-MODE-FAIL-CLOSED` | `w40-21-mode.json` |
| W40-22 | `A9-W40-REVIEW-LAYOUT` | `w40-22-layout.json`、`.png` |

## 4. 判定与待预演

- 新断言读取产品运行后的 DOM、IPC 响应、文件字节哈希、产品库事件和状态；fixture 只发工具调用。`A9-W40-REQUIRED-ASSERTIONS-PRESENT` 要求新 ID 各出现一次且 `passed === true`，并区分 `MISSING` 与 `PRESENT_NOT_PASSED`。
- `w40_stop` 记录 PID 与停止后每 100 ms 的生存检查；≤5000 ms 消失且本轮产品终态为 `cancelled` 才通过。W40-17 在 2 秒内执行撤回并等原倒计时到时后核对哈希；W40-22 另起一次待撤销状态量测“撤回”，量测文件与整轮按钮时先使用未禁用状态。W40-05/13 截图前断言改动页签、轮次与文件 Diff 已在 DOM 中呈现。
- 阶段汇总覆盖继承五阶段、W39 八阶段和 W40 四阶段，缺报告、退出错误、状态失败或断言失败均导致总状态 FAIL。W40-20 的不可触发分支会在用例索引另记 `NOT_PERFORMED`；不得据 smoke 状态把该子项解释为已通过。
- W40-22 记录运行时 `devicePixelRatio`，仅为 1.25 时覆盖 125%；不修改系统 DPI。W40-20 的 Win7 `too_large` 可触发性、`w40_stop` 命令在 PowerShell 5.1 的行为，以及所有 `w40*` 旅程均待 Win7 预演；开发机未运行这些旅程。

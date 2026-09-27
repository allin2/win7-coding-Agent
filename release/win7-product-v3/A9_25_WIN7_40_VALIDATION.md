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
| 报告器 `REPORT_KIND` | `A9_23_WIN7_39_A9_20_A9_21_ACCEPTANCE` | `A9_25_WIN7_40_A9_24_ACCEPTANCE` | 报告身份对应 A9-25 对 A9-24 的当前候选验证；旧 A9-20/A9-21 标签不再适用 |
| 报告器 `verifyReport` 的 PASS 处置 | 字面量 `A9_23_WIN7_39_A9_20_A9_21_PASS` | `kit.scope.result_on_complete`（Kit 为 `A9_25_WIN7_40_A9_24_PASS`）；缺失或空字符串时报 `A9_W40_KIT_RESULT_ON_COMPLETE_REQUIRED` | 处置由候选 Kit 合同提供，不回退硬编码旧标签；非 PASS 仍回传原状态 |
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
- W40-22 的“撤销此文件”“撤销本轮全部”两个按钮，其包围盒与可聚焦数据取自排队撤销前的可用状态；“撤回”按钮及 `scrollWidth` 取自排队撤销后的状态。两次观察都读取产品 DOM，不把排队后暂时禁用的原按钮误判为不可用。
- W40-21 的 review 模式 fixture 仅请求写入，并将产品返回的工具结果转述为最终文案；拒绝文案由产品快照的 `finalMessage` 观察。`review-denied.txt` 在调用前后均不存在、产品库中该轮 `tool_start` 与 `tool_end` 均为零，才判定零写入与 fail-closed。
- 阶段汇总覆盖继承五阶段、W39 八阶段和 W40 四阶段，缺报告、退出错误、状态失败或断言失败均导致总状态 FAIL。W40-20 的不可触发分支会在用例索引另记 `NOT_PERFORMED`；不得据 smoke 状态把该子项解释为已通过。
- W40-22 记录运行时 `devicePixelRatio`，仅为 1.25 时覆盖 125%；不修改系统 DPI。W40-20 的 Win7 `too_large` 可触发性、`w40_stop` 命令在 PowerShell 5.1 的行为，以及所有 `w40*` 旅程均待 Win7 预演；开发机未运行这些旅程。

## 5. 第二轮返工登记（交接书 §7，基线 `7d8458e`）

本节追加并替代 §4 中涉及 K-01～K-06 的旧操作口径；WIN7-39 派生原文、历史证据及其结论均不回写。第一次预演 `20260927-1741` 保持 `REHEARSAL_NOT_ELIGIBLE`；§7.1 已把原 P-01/P-02 裁定为 K-05/K-06 套件问题，未发现产品缺陷。O-1 取消不写终态事件、O-2 `modified` 原因含 `too_large` 仅登记，不修改产品。

| 登记 | 文件、范围与非身份差异 | 依据、判定与证据 |
|---|---|---|
| R2-01 / K-01 | 仓库驱动 W40 辅助区新增 `a925CaptureDiff`、检查器/文件 Diff 状态与截图后判定；修改 W40 的 M3、Review、布局截图调用 | W40-05/13/22 截图前打开检查器、选中改动页签、展开指定轮次文件；包围盒在视口内且 transform 无位移后截图；截图后再读 DOM，仍打开且文件 Diff 可见才记断言。记录 before/after、实际 PNG 路径与尺寸。`captureVisual` 与全部继承旅程原文不变；W40-16 仍用对话流截图 |
| R2-02 / K-02 | 驱动 W40 Review 的 big.bin 匹配与文本读取、判定替换 | 按 path 且 kind=too_large 或 reason 含 too_large；打开该轮文件并等待 `.review-unrecoverable` 渲染。口径为“无法撤销”、big.bin 与“超过备份上限”或含 too_large 的原因；原文记入 `w40-20-command.json`。未触发时仍保留 NOT_PERFORMED，不用夹具准备替代产品观察 |
| R2-03 / K-03 | 驱动 W40 Review-mode 替换界面提交路径；smoke 的 W40 Review-mode fixture 追加产品请求中工具结果采集 | 界面必须同时观察权限对话框可见、不可用 Review 文案、写入仍会拒绝文案、两个选项、发送禁用、mode=review。后端直接调用已有 `window.win7Agent.a9.submitTurn`，原样保留响应；有轮次则读取只读 a9_turns 与产品事件到结束。文件哈希在调用前、调用中每 50ms、调用后及库终态观察后采样，均须不存在；模式仍 review。结构化 Review 拒绝或该轮 write 工具结果含产品拒绝文案才满足后端部分；不调用 setMode。`w40-21-tool-results.json` 只保存产品 provider 请求中实际 tool 消息，不生成拒绝字面量。主观察仍在 `w40-21-mode.json` |
| R2-04 / K-04 | W40 派生 smoke 的 `runElectron`、总报告阶段条目只追加 `started_at`、`ended_at`、`duration_ms` 字段；追加 `w40PhaseTiming` | 从真实阶段进程启动前与 close 后的时钟取值；阶段 JSON 与总报告都保存相同三字段。不改退出码、超时、阶段有效性、阈值或原有断言。负时长拒绝；不以 M3 journey_ms 或文件时间代替阶段耗时 |
| R2-05 / K-05 | 驱动 W40 Stop 计时之后立即持久化；终态读取替换；smoke 追加固定证据路径环境参数 | 计时循环后立即把 pid/childGone/elapsedMs 写入阶段报告和 `w40-06-stop-exit.json`；即使后续 UI 终态读取超时也保留。按继承 stop 的 `#a9-turn-outcome` 含 cancelled 与 snapshot.agentStatus=cancelled 读取；绑定本轮 started turn 后另记只读 a9_turns 状态，要求该轮 cancelled，避免陈旧 UI。仍要求 PID ≤5000ms 消失；不等待终态事件 |
| R2-06 / K-06 | 驱动 W40 布局量测与布局纯判定替换，新增 `a925MeasureControls` | 量测前等待检查器包围盒完整在视口内、transform 无位移；逐个按钮 scrollIntoView(nearest) 后读取包围盒并聚焦。记录检查器几何；file/turn 在排队前，recall 在同一已打开抽屉排队后测量；scrollWidth 在排队后读取。仍要求无页面横向滚动、三个按钮完整在视口内且可聚焦；不调整 DPI 或窗口 |
| R2-07 / 开发机门 | 包测试追加 K-01～K-06 六项测试与继承驱动字节保护；更新现有 W40 观察源码检查、布局正例和 smoke 精确派生摘要 | 每项修复均有注入反例；反例分别为截图后关闭、删除 reason 匹配、允许 full_access、移除时长字段、延迟 PID 落盘、忽略抽屉位移。§4.1 仍逐文件精确摘要放行；本轮 smoke 摘要变更仅对应 R2-03/04/05 及新证据列表，未登记追加继续拒绝 |
| R2-08 / 只读重放 | 新增 `a9-w40-rehearsal-20260927-1741-observations.json` | 从主工作区第一次预演只读提取 K-02 review.unrecoverable/旧行文本、K-05 真实 PID/继承 stop 观察/库轮次与事件类型、K-06 原始几何；登记六个来源相对路径与 SHA-256。旧行文本仍不满足新文本口径，旧几何仍被拒绝；不把合成的修复后正例写成 Win7 新观察，不回写 `.acceptance/rehearsals` |

仓库驱动相对 `7d8458e` 的改动限于已存在的 W40 分派/旅程及新增 W40 辅助函数。排除 W40 分派和辅助/旅程区后，继承源码 SHA-256 仍为 `2eb11b5012c426ef046e286f3ffc8040cc889324c57f367fb0ffb2e3d90a23a2`，测试精确锁定并注入删除 `const selected` 的反例。已登记的两处 `W39_WORKSPACE_SELECT_MODES` 加入 `A925_WORKSPACE_SELECT_MODES` 在 `7d8458e` 已存在，本轮没有再改；所有其他历史函数与断言键逐字节不变。

本轮没有改变重基线规则或残留守卫。源码 `w39`/`W39` 出现次数仍为 133/76；每个原有精确重基线源片段仍检查出现一次。新增阶段计时仅在 W40 smoke 副本追加，WIN7-39 文件不变。

开发机门重跑全部 §4 检查；运行输出及六项进程级注入反例位于套件工作树 `.acceptance/w40-rework-r2/`。全部 w40* 旅程在开发机未运行，**待第二次预演**；开发机夹具与纯函数结果不构成当前 Win7 证据。

## 6. 第三轮返工登记（交接书 §7.3，套件基线 `2f14d69`）

§7.3 从主工作区 `15722fc` 的交接书只读查阅；按负责人更正，套件分支保持 `2f14d69` 为基线，不 merge/rebase，也不复制该文档。本节仅替代 R2-03 中结构化拒绝的错误码限制与 R2-04 中阶段计时的保存位置及算法；其他登记与判定不变。

| 登记 | 文件与本轮差异 | 判定、证据与测试 |
|---|---|---|
| R3-1 | W40 smoke 新增 `w40PhaseClock`；替换 `w40PhaseTiming`、`runElectron` 的时钟采集及 close 回调；总报告阶段条目只追加可选 `timing_error` | 删除对 `A9_SMOKE_OUT` 的读取与写回，驱动原始报告（包括损坏 JSON 与非 UTF-8 字节）保持原字节。耗时仅在 smoke 阶段记录与总报告中保存，`duration_ms` 来自 `process.hrtime.bigint()` 差值，墙钟仅生成 started_at/ended_at；墙钟回拨不改变耗时与阶段结束。时钟读取或数值异常保存 timing_error 与未知字段 null，不抛出，不以 0 伪造未知耗时。现有 K-04 测试按此裁决更新；新增损坏报告、回拨/时钟异常的真实 runElectron VM 测试，注入旧写回和回拨抛出分别使测试失败。精确 smoke 派生摘要更新为 `59b798686b5bf00797a2600a1515254334566b746fc963f578111d67e0720f7e`，未登记差异仍拒绝 |
| R3-2 | 仓库驱动只替换 `a925ReviewModeMatches` 的 rejected 条件；包测试同步 K-03 并新增结构化拒绝测试 | response.ok=false 且 error.code 为长度大于零的字符串即为结构化拒绝；不要求码或 message 含 REVIEW。驱动原有 response 原样保存路径不改，保留原 code/message；界面层、hashSamples 零写入、mode=review、write 工具拒绝备用路径均不变。任意非空错误码正例；无 code/空 code/非字符串、文件写出、full_access 反例。注入旧窄错误码条件及放宽零写入/模式/缺码条件使相应测试失败 |

驱动相对 `2f14d69` 仅上述一处非新增改动，无历史旅程、`captureVisual`、工作区模式判断或其他 W40 代码改动。smoke 的非新增改动仅 R3-1 所列：计时函数、runElectron 启动采集、close 回调、总报告 timing_error 字段。WIN7-39 及更早文件、产品与 docs 不改，重基线与残留守卫不变。

本轮开发机门与注入反例原始输出位于套件工作树 `.acceptance/w40-rework-r3/`。w40* 产品旅程未运行，**待第二次预演**；O-3 历史秘密路径测试时序观察仅保留登记，不在本轮修复。

## 7. 第四轮返工登记（交接书 §7.4，代码比对基线 `91df808`）

套件分支由 `5a20663` 按授权快进到 `2ed3cf3`（中间只有文档提交），开始编辑前工作树干净；本轮仅 R4-1～R4-3。第二次预演 `20260927-2019` 原件只读，不回写。所有新增辅助函数只属于 W40；仓库驱动的历史 `waitFor`、`captureVisual`、w39 与更早旅程保持原字节。

### 7.1 R4-1：1 CSS 像素视口边界容差

- `a925InspectorReady` 与 `a925LayoutMatches` 中四边改为 `left/top >= -1`、`right <= innerWidth + 1`、`bottom <= innerHeight + 1`。有限数、正尺寸、无位移 transform、可见与聚焦、页面无横向滚动等条件不变。
- `a925InspectorState` 及 `w40Layout` 的 DOM 量测追加 `clientWidth/clientHeight` 和 `visualViewport: {width,height}`；无 visualViewport 时记录 null。保留原 innerWidth/innerHeight、物理截图大小、devicePixelRatio，不用新字段替换旧判定。
- 测试用合成小数几何 `right=1079.2, innerWidth=1079`，并实际执行读取原值的 Renderer 表达式；恰好 1 像素的边界被接受，超过 1 像素的四方向反例被拒绝。第一次预演真实 `file.left=1118.2000732421875` 仍被拒绝。注入无容差或 2 像素容差均破坏对应测试；合成几何不是第二次预演新观察。

### 7.2 R4-2：阶段错误、前置缺失与最终汇总

`runElectron` 只追加 spawn error 事件处理；`w40RunElectron` 捕捉启动前环境异常/Promise 拒绝并记录非零退出与 execution_error，不修改 `A9_SMOKE_OUT`。原始驱动报告仍保持原字节，计时仍用单调时钟；损坏 JSON、非对象或非法 cases 形状只在 smoke 内形成 NO_REPORT/ERROR 观察，不写回。

依赖与阻断规则（BLOCKED 不运行子进程，不生成伪造的阶段驱动文件；started_at/ended_at/duration_ms/exit_code 为 null）：

| 阶段 | 前置与阻断原因 |
|---|---|
| second | first 提供完整五字段批准绑定和包含四个字符串/两个事件 ID 的 projectionSeed；缺少时记录原因 |
| retry | second 提供 retryTarget.conversationId；缺少时记录原因 |
| w40_m1_small / w40_m1_large | 各自公开持久化 API 种子；模块缺失、open 非 ready 或准备异常形成各自 BLOCKED |
| w40_m4 | 自身公开事件 API 种子；模块缺失、open 非 ready 或准备异常形成 BLOCKED |
| w40_review_restart | w40_review 报告为 PASS 且完整 w40TurnIds.first 存在；Review 阶段错误或缺 turnId 时记录原因 |
| w40_review_mode | 自身公开持久化 API 保存 review 模式；准备错误仅阻断本阶段，不依赖 w40_review |
| 需要本地 fixture 的各阶段 | 各自 fixture listen 错误仅阻断对应阶段；close 错误形成 smoke 内部失败断言 |

Git 设置的失败原本已被本地 catch 捕获；改为显式错误字段与短路后续 Git 设置，不再 throw。阶段退出、报告错误及上述阻断均继续后续独立阶段。总报告追加 17 项 `phase_summary` 和 `phases[].status/blocked_reason`（运行异常时另有 execution_error），用例索引补齐各项 result：所需阶段 BLOCKED 则 BLOCKED 并给原因；所需阶段错误/缺失则 FAIL。W40-01 仍由候选外完整性门负责；W40-20 实际不可触发时的 NOT_PERFORMED 口径不变。阶段缺失/阻断使总状态 FAIL。用例索引装配异常只记录 case_index_errors 并使总状态 FAIL，不提前退出。

新增 `a9-w40-rehearsal-20260927-2019-stage-errors.json` 是两份实际阶段报告的只读提取，登记原相对路径与 SHA-256，无几何补造。开发机 VM 执行真实 smoke main，仅模拟子进程与持久化接口：重放实际 w40_review/w40_m3 ERROR 后，w40_review_mode 仍调用，restart 为 BLOCKED，17 阶段汇总、22 用例索引与总报告存在且总状态 FAIL。另覆盖 first 产物缺失、种子 require 异常及 Review fixture listen 异常。注入旧的缺首轮 throw、忽略依赖阻断或忽略种子错误均破坏对应检查。

保留的全部显式 throw（无第一个子进程启动后的 main throw）：

| 所在函数与错误 | 保留理由 / 调用位置 |
|---|---|
| w40ResolveGitExecutable / A9_W40_GIT_EXE_NOT_ABSOLUTE | 显式 Git 参数须绝对路径；解析移动到任何阶段启动前 |
| copyTree / A9_W40_DRIVER_RUNTIME_SPECIAL_FILE | 拒绝特殊运行时文件；仅 prepareDriverRuntime 在阶段前调用 |
| prepareDriverRuntime / A9_W40_DRIVER_CONTRACT_SOURCE_MISSING | 阶段前候选依赖闭包检查 |
| prepareDriverRuntime / A9_W40_DRIVER_CONTRACT_HASH_MISMATCH | 阶段前契约复制哈希检查 |
| w40AssertEnvironmentLengths / A9_W40_ENV_VALUE_TOO_LONG | 每次子进程启动前环境长度检查；若已进入 smoke 的阶段序列，由 w40RunElectron 转为该次运行错误，继续汇总 |
| main / A9_W40_SMOKE_RUNTIME_INVALID | 任何阶段前 Win7/Electron/ABI/运行方式环境门 |
| main / A9_W40_SMOKE_EVIDENCE_INSIDE_CANDIDATE | 任何阶段前候选外证据路径门 |

### 7.3 R4-3：W40 等待的最后观察

新增 `a925WaitFor` 包裹原历史 waitFor；10 处 W40 新增等待全部使用该函数。原值读取与 ready 谓词分离，超时时不把未满足条件的实际状态丢成 null。超时立即追加 `report.w40WaitTimeouts[]`（label、last_observation、error）并写阶段报告；last_observation 为原观察 JSON 的前 2048 字符、error 前 1024 字符，观察读取异常记录前 512 字符并保留错误。错误信息同步包含相同的 last_observation。历史 waitFor 行为与继承调用不改。

| 等待 | 最后观察来源（不改成功条件） |
|---|---|
| 轮次行 | turnId、rowFound、buttonFound、rowText（前 500 字符） |
| 文件 Diff | 实际页签选择、detailVisible、toggleFound、diff/full、轮次与路径 |
| 撤销结果 | #a9-undo-state 原文本 |
| 抽屉过渡 | a925InspectorState 原几何、transform、open、视口原值 |
| 子进程 PID | 标记路径、存在性、标记文本（前 100 字符）、PID 值 |
| 取消终态 | #a9-turn-outcome 原文本 |
| 摘要卡 | 节点存在性、匹配状态、实际文本、计数与文件路径 |
| 无法撤销条目 | .review-unrecoverable 原文本 |
| review 模式探针 | #a9-provider-probe-state 原文本 |
| review 模式库终态 | 产品 a9_turns 原行或 null |

VM 超时测试确认最后一次小数几何/closed 状态同时进入落盘报告与错误文本且截断；观察 IPC 报错也有诊断。注入丢弃 lastState 破坏测试。文件 Diff 的 toggle 存在性保留为原成功条件，缺 toggle 反例和移除该条件的注入均受测试约束。保留 K-05 注入终态等待异常的测试，PID 观察仍已先落盘。

### 7.4 相对 `91df808` 的全部非新增修改位置

| 文件 / 原有位置 | 本轮替换与理由 |
|---|---|
| 仓库驱动 a925InspectorReady、a925LayoutMatches | 四边容差（R4-1） |
| 仓库驱动 a925OpenFileDiff 两处 wait、a925ClickUndo wait | 分离原观察与谓词，接入诊断（R4-3） |
| 仓库驱动 a925InspectorState、a925WaitInspector | 追加视口原值；不丢弃不满足 ready 的状态（R4-1/3） |
| 仓库驱动 runW40StopProcess 两处 wait | PID 原标记状态、取消 UI 原文本进入诊断；先落盘 PID 顺序与终态口径不变（R4-3） |
| 仓库驱动 runW40ReviewProcess 摘要/无法撤销两处 wait、geometry | 原文本/摘要状态进入诊断；追加两种视口原值（R4-1/3） |
| 仓库驱动 runW40ReviewModeProcess 探针/库终态两处 wait | 保留 raw 状态而非仅 null，接入诊断（R4-3） |
| smoke readJson | malformed/非对象/非法 cases 只形成 smoke 内错误观察，避免阶段错误在汇总时抛出（R4-2） |
| smoke runElectron | spawn error 的完成与诊断，原 close 正常路径和驱动字节保留（R4-2） |
| smoke main 的所有子进程入口 | 改为 w40RunElectron 捕获启动错误；第二、重试、live 增阻断检查与 BLOCKED 报告读取（R4-2） |
| smoke Git 参数解析与 Git 设置 | 参数解析移到第一个阶段前；Git 设置 throw 改为局部错误/短路；正常命令参数与顺序不变（R4-2） |
| smoke runW40Phase 与 M1/M4 准备、调用 | 前置错误 BLOCKED；准备异常捕获，仅阻断依赖种子的阶段（R4-2） |
| smoke 各 fixture listen/close 与 URL 读取 | 各阶段本地准备错误/关闭错误记录，独立阶段继续（R4-2） |
| smoke runA925Phase 与 stop/review/restart/mode 调用 | BLOCKED 分支；移除缺首轮 throw；Review 模式种子异常仅阻断 mode（R4-2） |
| smoke product_main_by_phase、reports 中 retry/live 读取 | 用 smoke 内 BLOCKED 记录表达未运行阶段，不伪造驱动文件（R4-2） |
| smoke addCaseAssertion、最终 report / phases、exports | 索引装配异常变诊断；最终用例结果、阶段汇总及错误/阻断字段；导出新增纯辅助供测试（R4-2） |

两处已登记的 W39_WORKSPACE_SELECT_MODES 包含 A925_WORKSPACE_SELECT_MODES 判断在 `91df808` 已存在，本轮均未修改；剔除 W40 分派/辅助区后的历史驱动 SHA-256 仍锁定 `2eb11b5012c426ef046e286f3ffc8040cc889324c57f367fb0ffb2e3d90a23a2`。本轮不修改产品、历史断言键、重基线或残留守卫。测试同步 K-02 wait 调用名称、K-05 VM 装入新增辅助函数、§4.5 布局反例由 101 改为 101.01（恰好一像素现属正例）、R3 VM 子进程支持新增 error 监听并验证 spawn error 完成且原报告字节不变；精确派生门仅更新登记的 smoke 摘要为 `a57e7fc468aed21401ed7845defedf7f2f2a27f5ae382f00cc37f026e2bfa4d4`，其他五个派生文件摘要不变，未登记差异仍拒绝。

开发机检查与各项注入反例输出位于套件工作树 `.acceptance/w40-rework-r4/`。w40* 旅程在开发机未运行，**待第三次预演**；开发机模拟主入口执行与只读夹具重放不构成当前 Win7 产品证据。本轮未发现需修复的产品缺陷。

## 8. 第五轮返工登记（交接书 §7.6，基线 `45581e2`）

本轮只更正报告器两处结论谱系残留，原文、目标文本与理由逐项见 §2。`verifyReport` 在 Kit 基本形状检查后额外要求 `scope.result_on_complete` 为非空字符串；状态为 PASS 时原样采用该字段。逐文件精确比对只更新报告器摘要为 `9a0ffd2c916def3be94e35beb54deae529c5c368c52eb3253a3efac1de52d392`；另五个派生文件的摘要不变，未登记差异仍被拒绝。

构建残留守卫的 W40 分支新增 `A9_20_A9_21`。精确放行仅两处：输入锁 `provenance.previous_candidate_result` 的冻结 W39 结论，以及完整性脚本对此字段的原样校验；各仅遮蔽首个完整语句，其他位置（包括报告器和打包驱动）一律报 `A9_CANDIDATE_STALE_TOKEN`。构建脚本 `scope.historical_candidate` 仍记 W39 原有正式结论，仅用于 Kit 的历史说明；它不属于派生文件或打包驱动，故无需守卫豁免，也不改变 W39 结论。W40 Kit 的 `scope.result_on_complete` 仍为 `A9_25_WIN7_40_A9_24_PASS`。

六个派生文件与构建脚本 W40 Kit 分支的结论名、任务号、ADR 号复查：报告器两处旧 A9-20/A9-21 标签已按 §2 更正；输入锁和完整性脚本各一处 W39 正式结论是前序来源；Kit `historical_candidate` 一处 W39 结论是历史说明。`does_not_reissue` 中 A9-14、A9-15、A9-16、A9-19 的结论是明确排除重签范围；W40-07～09 的 A9-20 用例名及说明指继承 Git 形态回归；smoke 的 A9-15 断言 ID 与 ADR-0121/0136、A9-19 历史注释均指原有继承检查；输入锁 WIN7-22 原生输入来源及 ADR-0143 fail-closed、ADR-0144 当前任务、构建脚本同名引用均与来源相符。两个 `.cmd` 无旧结论或旧 ADR；未发现其他须更正的结论、任务或 ADR 标签。

开发机正例与注入反例见包测试 `W40 §4.1`、`W40 §4.2`、`W40 R5`：旧 `REPORT_KIND` 被 schema 拒绝，旧 PASS 字面量与缺 Kit 字段被测试识别，旧标签注入报告器、打包驱动、锁的非豁免字段被残留守卫拒绝。仓库驱动与 smoke 相对 `45581e2` 均无改动；本轮不重跑 Win7 产品旅程，目标机结果留待新候选正式验证。

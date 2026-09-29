# A9-25 — WIN7-40 换发与实机验收（A9-24 改动审阅）

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: RELEASE_REISSUE_AND_WIN7_ACCEPTANCE
Target Branch: codex/a9-alpha2
Source Baseline: codex/a9-alpha2 @ 本任务书批准提交（A9-24 已于 c136d12 并入）
Candidate: WIN7-40（A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS，已关闭）→ WIN7-41（§9 修订）
Phase-Gate: A9_25_W41_KIT_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0144, ADR-0145
```

> 2026-09-27 负责人批准本任务书，§6 Q1～Q3 按建议（保留预演；不改验收机 DPI 设置；W40-01～15 全量回归）。批准本任务书不等于候选外 authority 或实机 PASS。
> 流程、硬门与取证沿用 [A9-23](A9_23_WIN7_39_REISSUE_AND_ACCEPTANCE.md) 已验证的做法（ADR-0141/0142 与 WIN7-39 实机交接书附录 A、B）。

## 1. 背景

- [A9-24](A9_24_REVIEW_MODE.md)（ADR-0143）“先写后审”的改动审阅已在开发机通过（`A9_24_DEVELOPER_VERIFIED`，`c136d12`）；真实 Electron 与 Win7 为 `NOT_PERFORMED`。
- WIN7-39（`7ec9db7`）已签发 `A9_23_WIN7_39_A9_20_A9_21_PASS`，并记录已知限制：W39-06 Stop 后子进程退出时间未直接记录；W39-05/13 截图未显示 Diff 与 checkpoint 视图。
- 本任务以当前主线换发 WIN7-40，在 Win7 实机验证 A9-24，同时对 WIN7-39 的 15 项做回归，并补上上述两项取证缺口。

## 2. 身份与边界

1. 编号 `WIN7-40`；版本与能力集标识沿用 `WIN7-CODING-AGENT-A9-ALPHA1` / `0.3.0-alpha.1`（与 WIN7-37/39 相同，不据此宣称 Alpha 2 PASS）。
2. **不做产品改动**。实机或开发机暴露产品缺陷时，停止并报告，另立任务修复。
3. 结论上限 `A9_25_WIN7_40_A9_24_PASS`（覆盖 §4 全部用例，可部分签发）；不改判 WIN7-39 及更早候选的结论。
4. 硬门与 WIN7-39 相同：双独立干净工作树构建、ZIP 逐字节一致；候选外 authority 与独立 SHA-256 pin；普通用户 `agent` Medium 非提升；
   证据结构化带哈希；秘密扫描零命中；后飞行零残留，不得依赖人工终止。
5. WIN7-39 及更早的发布文件、`w39` 与更早驱动旅程、历史断言键一律不改。

## 3. C14 允许路径

- 发布管线：`scripts/release/build-a9-product-v3.mjs`（新增 `A9-25-INPUTS-WIN7-40` profile 与候选集合登记）、`scripts/release/test/a9-package.test.mjs`。
- `release/win7-product-v3/` 下新增：`a9-25-win7-40-input-lock.json`、`a9-package-integrity-w40.cjs`、`a9-win7-40-report.cjs`、`a9-win7-40-smoke.cjs`、
  `RUN_A9_25_W40_INTEGRITY.cmd`、`RUN_WIN7_40_REPORT_VERIFY.cmd`、`A9_25_WIN7_40_VALIDATION.md`，以及文件名含 `w40` 的夹具；更新该目录 `README.md`。
- 实机驱动：`src/shell/tests/product/a9-06-driver-entry.cjs` 只新增 `w40*` 旅程及其辅助函数；`w39` 与更早旅程不变。驱动单测与夹具只在 `src/shell/tests/product/**` 新增。
- 文档：本任务书、`docs/tasks/README.md`、`docs/STATUS.md`、`docs/STATUS_LOG.md`、`docs/DECISIONS.md`（ADR-0144）、`docs/DECISIONS_INDEX.md`、
  `docs/plans/A9_25_*`、`docs/reports/2026-09/**`、A9-24 任务书的状态记录段。

## 4. 用例（W40）

W40-01～15 由 W39-01～15 机械派生（判定口径不变，编号与候选前缀重基线），另有两处收紧；W40-16～22 为 A9-24 新增。

| 编号 | 判定要点（均来自产品运行后的观察） |
|---|---|
| W40-01～15 | 同 W39-01～15 |
| W40-06（收紧） | 新增 `w40_stop` 旅程：点击 Stop 后轮询进程表，记录 Shell 子进程 PID 消失的毫秒数，要求 ≤ 5000 ms（补 WIN7-39 已知限制 6） |
| W40-05/13（收紧） | 截图须显示检查器“改动”页签中的对应轮次与文件 Diff，不再以对话流截图代替 |
| W40-16 | 真实轮次（本地 fixture 模型：修改 1 个、新建 1 个文件）结束后出现改动摘要卡；文件数与增删计数与 `a9.diff.get` 的 `review` 一致；截图 |
| W40-17 | 逐文件撤销与撤回：点击撤销后 5 秒内撤回，文件哈希不变；再次撤销并等待到时，文件恢复到本轮前哈希，状态“已撤销”；重启后仍为“已撤销”，再次撤销不重复作用 |
| W40-18 | 整轮撤销遇外部修改：驱动在轮后直接改写其中一个文件，整轮撤销后该文件内容不变并显示“外部修改”文案，其余文件恢复 |
| W40-19 | 后续轮次修改：第 2 轮再改同一文件，撤销第 1 轮该文件被拒绝并显示“第 2 轮又被修改”，零写入；撤销第 2 轮后再撤销第 1 轮成功 |
| W40-20 | 命令产生的变化：Shell 生成的可恢复文件列入该轮改动并可撤销；无法恢复项若能在不改产品的前提下触发，则须以“无法撤销”与原因显示，否则标 `NOT_PERFORMED` 并写明原因 |
| W40-21 | 不阻断与模式：有未撤销改动时可立即开始下一轮；权限对话框只有 Full Access / Read Only；工作区设置为 `review` 时写操作结构化拒绝、零写入 |
| W40-22 | 布局：实机窗口下“改动”页签与摘要卡无页面横向滚动、按钮可见可达（DOM 几何量测 + 截图）；验收机当前 DPI 为 125% 时同时记录，否则 125% 标 `NOT_PERFORMED`，不得为此修改系统设置 |

## 5. 执行步骤与门

1. **套件实现**（新会话，按套件交接书）：W40 套件从 W39 套件机械派生（`writeCandidateDriver` 重基线 W39→W40，残留守卫覆盖 W39 字面量），
   新增 `w40*` 旅程与断言；开发机门：打包测试、shell 全量、`verify:quick`、`docs:check`、`git diff --check`，外加 W40-16～22 与两处收紧的注入反例。
2. **Win7 套件预演**：非正式构建，以 `agent` 运行 G2 smoke，结果标 `REHEARSAL_NOT_ELIGIBLE`，只用于修正套件（沿用 A9-23 §7 Q1 的条件）。
3. **正式实机交接书**：以 WIN7-39 实机交接书（含附录 A 路径勘误与附录 B 报告校验）为模板，候选根为 `<W>\package\Win7CodingAgent-0.3.0-alpha.1-win7-x64\`，计划任务 XML 以 CP936 注册。
4. **候选冻结**：同一提交两个独立干净工作树构建，ZIP 逐字节一致，候选自带校验拒绝错误哈希与错误 pin。
5. **门 A**：负责人签发候选外 `WIN7_40_RELEASE_AUTHORITY` 与独立 pin。
6. **实机执行** → 7. **审核**（组装正式报告并在 Win7 以 `agent` 复核）→ 8. **门 B**：负责人裁决；更新本任务书、A9-24、STATUS 与 STATUS_LOG。

## 6. 开放问题

- **Q1 是否预演**：建议保留第 2 步（WIN7-39 的套件经三次预演才稳定）；若负责人希望缩短周期，可在第 1 步开发机门通过后直接进入第 3 步，风险是套件缺陷在正式运行中暴露、消耗候选编号。
- **Q2 W40-22 的 DPI**：不修改验收机系统设置；是否需要另行安排 125% DPI 的会话，由负责人决定。
- **Q3 回归范围**：建议 W40-01～15 全量回归（自动运行，增量成本低）；替代方案是只跑 A9-24 相关用例，但会失去对 A9-20/A9-21 在新候选上的回归证据。

## 7. 候选身份（2026-09-27 冻结，门 A 已签发）

| 项 | 值 |
|---|---|
| 源码提交 | `64fd3a7490a320ae8d185089da946ba8d68a5fdb`（`source_dirty=false`、`external_acceptance_eligible=true`） |
| ZIP | `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip`，101,441,102 B，SHA-256 `f14b7992370032d77daf042a23fd3b093c963522b2c401aace4f5276074158fb` |
| manifest SHA-256 | `4d499d7390bfd9748e2ae89b5ff16e925ae1a1b14ed24b1f358f62d81ebe888f`（790 文件） |
| input lock SHA-256 | `cadf215a19bc0d1c45fe63139bb0a8864305ed61733a1a6660315c92d0d82a20`（与仓库同名文件及包内副本逐字节一致） |
| Kit | `A9-25-WIN7-40-20260926-01`，22 项，`A9_25_VALIDATION_KIT.json` SHA-256 `353bb9a3c6a1362a7181e82a0a3b87523fea1d4a7b4729e9d0ae19a6795b998f`，`result_on_complete` 为 `A9_25_WIN7_40_A9_24_PASS` |
| 冻结位置 | 本机 `.acceptance/candidates/WIN7-40/`（只读；`IDENTITY.sha256`、`DOUBLE_BUILD.json`）；门 A 前撤回的 `3a2ecdb` 冻结保留于 `.acceptance/candidates/_superseded/WIN7-40-3a2ecdb/` |
| authority | `.acceptance/runs/A9-25-W40/81c7a234-4745-4c79-8554-8c1a4b9f407e/authority/release-authority.json`，SHA-256 `b17ab35f05594163d8bd76b0984115dc637ba10f529f43b6c4a5869266365618`（独立 pin 同目录 `.sha256`）；run-id `81c7a234-4745-4c79-8554-8c1a4b9f407e`，目标 `192.168.1.3`；负责人签发 `2026-09-27T15:38:29Z` |

## 8. 执行记录

- 2026-09-27：负责人批准；发出 [W40 套件交接书](../plans/A9_25_W40_KIT_HANDOFF.md)（第 1 步）。
- 2026-09-27：执行方开工前提出两项合同矛盾（发布目录文档、派生文件谱系陈述）及一处派生注释编号冲突，验收方裁决见[套件交接书](../plans/A9_25_W40_KIT_HANDOFF.md) §6.1、§6.2。
- 2026-09-27：**第 1 步开发机门通过**。执行方交付 `b99336f`（分支 `codex/a9-25-w40-kit`，基线 `ae25dd0`），验收方审计发现一处越界：继承旅程 `runWorkspaceSelectionProcess`
  被删去 `const selected` 绑定，`workspace_select` 旅程运行时会抛 `ReferenceError`（包测试与 Jest 未覆盖），违反交接书 §2；返工 `8ce1bc3` 恢复原文，
  新增执行该旅程的回归测试（删去绑定即失败），驱动相对基线的非新增改动只剩两处工作区选择模式判断。验收方复跑：`a9-package.test.mjs` 70/70、
  shell Jest 458/458、`verify:quick`、`docs:check`、`git diff --check` 均通过；负向对照（未登记派生差异、放宽 PID 阈值到 6000 ms）各使对应测试失败；
  W40 输入锁原生输入哈希与 W39 一致。于 `762e2d3` 并入 `codex/a9-alpha2`。`w40*` 旅程未运行，待第 2 步 Win7 预演；`Phase-Gate` 不变。
- 2026-09-27：发出 [W40 预演交接书](../plans/A9_25_W40_REHEARSAL_HANDOFF.md)（第 2 步，套件 `7fce103`，结果标 `REHEARSAL_NOT_ELIGIBLE`）。
- 2026-09-27：第一次 Win7 预演（`20260927-1741`，`REHEARSAL_NOT_ELIGIBLE`，构建源 `7fce103`）复核：继承 13 个阶段全部通过，W40-16～19 的产品观察符合预期；
  新增阶段暴露 6 项套件问题（K-01～K-06，其中执行方登记的两项疑似产品问题复核为套件问题），未发现产品缺陷；另登记产品侧观察 O-1、O-2（不返工）。
  第二轮返工要求与 W40-20、W40-21 判定口径裁决见[套件交接书 §7](../plans/A9_25_W40_KIT_HANDOFF.md)，返工通过后做第二次预演。
- 2026-09-27：套件第二轮返工 `2f14d69`（K-01～K-06）与第三轮 `91df808`（驱动原始报告不再改写、计时用单调时钟且不抛出；W40-21 接受任意结构化错误码）经验收方复核通过，
  包测试 80/80，负向对照有效；于 `5a20663` 并入 alpha2。按[预演交接书附录 A](../plans/A9_25_W40_REHEARSAL_HANDOFF.md)做第二次 Win7 预演。
- 2026-09-27：第二次 Win7 预演（`20260927-2019`，`REHEARSAL_NOT_ELIGIBLE`，构建源 `5a20663`）复核：K-05 已消除（停止后子进程 106 ms 消失）；检查器等待因 125% DPI 下小数视口与无容差判定而超时，
  且一个阶段失败使 smoke 中止、总报告与用例索引未生成；K-02、K-03、K-06 未到达。第四轮返工见[套件交接书 §7.4](../plans/A9_25_W40_KIT_HANDOFF.md)，通过后做第三次预演。
- 2026-09-27：套件第四轮返工 `a7bb5cc`（视口 1 CSS 像素容差、阶段失败不再中止 smoke、等待超时记录最后观察）经验收方复核通过，包测试 84/84，负向对照有效；
  于 `0ca5a81` 并入 alpha2。按[预演交接书附录 B](../plans/A9_25_W40_REHEARSAL_HANDOFF.md)做第三次 Win7 预演。
- 2026-09-27：第三次 Win7 预演（`20260927-2224`，`REHEARSAL_NOT_ELIGIBLE`，构建源 `0ca5a81`）复核：smoke `PASS`，17 阶段、227 条断言、W40-02～22 全部通过，K-01～K-06 均已消除，
  **套件无待修问题，第 2 步完成**；登记产品侧观察 O-4（命令产生文件的 Diff 为空）。下一步起草第 3 步正式实机交接书。见[套件交接书 §7.5](../plans/A9_25_W40_KIT_HANDOFF.md)。
- 2026-09-27：第 3 步：起草[正式实机交接书](../plans/A9_25_WIN7_40_ACCEPTANCE_HANDOFF.md)（`DRAFT_PENDING_FREEZE_AND_GATE_A`，§3 待冻结与门 A 后填写），并入 WIN7-39 附录 A 路径勘误与三次 W40 预演做法。下一步第 4 步双构建冻结。
- 2026-09-27：第 4 步从 `3a2ecdb` 双构建一致并通过开发机预检，但发现候选内报告器残留 W39 结论标签（`A9_20_A9_21`，与 Kit 结论 `A9_25_WIN7_40_A9_24_PASS` 不一致）；
  门 A 前撤回该冻结（移至 `.acceptance/candidates/_superseded/WIN7-40-3a2ecdb/`，不消耗候选编号），第五轮套件返工见[套件交接书 §7.6](../plans/A9_25_W40_KIT_HANDOFF.md)，修复后重新冻结。
- 2026-09-27：套件第五轮返工（`9bca1f5`、`f355e0c`：报告种类改为 A9-24 口径，PASS 处置取自 Kit `result_on_complete`，残留守卫增加 `A9_20_A9_21`）经验收方复核通过，
  包测试 85/85，负向对照（处置改回字面量）有效；于 `908f0f2` 并入 alpha2。从本记录所在提交重新双构建冻结。
- 2026-09-27：第 4 步完成：从 `64fd3a7` 在两个独立干净工作树（`win7-w40-freeze-a`/`-b`，detached）构建，三项输入哈希与输入锁一致，ZIP 与构建结果逐字节一致，冻结于 `.acceptance/candidates/WIN7-40/`（§7）。
  包内 smoke、完整性脚本、报告器、两个 `.cmd` 与输入锁与仓库逐字节一致，报告种类为 `A9_25_WIN7_40_A9_24_ACCEPTANCE`。开发机预检（草稿 authority，非签发件）：身份与全树核对零差异（790/791），
  运行时 ABI 项因开发机 Node ABI 115 按预期失败；错误 pin 报 `A9_W40_AUTHORITY_PIN_MISMATCH`，篡改 ZIP 与错误候选绑定报 `A9_W40_RELEASE_AUTHORITY_BINDING_INVALID`；报告器 `init` 正确 pin 生成 22 项模板、错误 pin 被拒。以上不是 Win7 结果。下一步第 5 步门 A。
- 2026-09-27：第 5 步门 A：负责人在对话中签发 `WIN7_40_RELEASE_AUTHORITY`（`approved_at` 2026-09-27T15:38:29Z，SHA-256 `b17ab35f…5618`），绑定源码 `64fd3a7`、ZIP、manifest、输入锁、
  原生构建审批登记、Kit（22 项）、目标主机 `192.168.1.3` 与 run-id `81c7a234-…`。候选自带校验对签发版 authority 身份与全树核对通过，草稿 pin 被拒，报告器 `init` 生成 22 项模板（开发机预检）。
  [实机交接书](../plans/A9_25_WIN7_40_ACCEPTANCE_HANDOFF.md)改为 `READY_FOR_EXECUTION`，下一步第 6 步实机执行。
- 2026-09-28：第 6 步实机执行（run-id `81c7a234`）：G1 `PASS`；G2 `w40_review` 因驱动时序缺陷失败，执行方按 §7 停止。第 7 步审核见[审核报告](../reports/2026-09/a9_25_win7_40_acceptance_review_2026-09-28.md)。
- 2026-09-28：第 8 步门 B：负责人按审核建议裁决 WIN7-40 为 `A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS`（ADR-0145），不做部分签发；修订本任务继续，见 §9。

## 9. 修订：WIN7-40 不通过后换发 WIN7-41（2026-09-28，ADR-0145）

> 负责人 2026-09-28 裁决“按建议裁决，修订 A9-25 继续”。本节优先于 §1～§6 中与之冲突的内容；§2 的身份与边界（不做产品改动、硬门、W39 及更早不改）继续有效。

1. **身份**：新候选 `WIN7-41`；版本与能力集标识仍为 `WIN7-CODING-AGENT-A9-ALPHA1` / `0.3.0-alpha.1`；结论上限 `A9_25_WIN7_41_A9_24_PASS`（可部分签发），用例 W41-01～22 与 W40-01～22 一一对应、判定口径不变。
2. **套件修复（R6）**：修复 `a925OpenFileDiff` 读取未重绘 DOM 的问题（等待产品完成 `showDiff` 后的重绘再判断展开状态）；`a925ClickUndo` 及 W40 旅程中其余一次性“查询即抛错”的操作改为带最后观察诊断的等待；
   普查全部 `w40*` 旅程中的同类写法并逐处登记。以 WIN7-40 实机证据（`.acceptance/runs/A9-25-W40/81c7a234-…/`）作只读夹具重放。
3. **W41 派生**：从修复后的 W40 派生文件机械派生 W41 文件（身份替换 `W40→W41`、`win7-40→win7-41`、`WIN7_40→WIN7_41`、`WIN7-40→WIN7-41`、`w40→w41` 及大小写变体；任务号 `A9-25` 不变），
   谱系陈述按 ADR 与事实更正并登记（前序候选 `WIN7-40`，结论 `A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS`）；打包驱动按 W40 的做法重基线；残留守卫覆盖 W40 字面量。
   Kit 文件名不得与 W40 的 `A9_25_VALIDATION_KIT.json` 冲突，具体命名在套件交接书中确定。
4. **C14 允许路径**（在 §3 基础上追加）：`release/win7-product-v3/` 下新增 `a9-25-win7-41-input-lock.json`、`a9-package-integrity-w41.cjs`、`a9-win7-41-report.cjs`、`a9-win7-41-smoke.cjs`、
   `RUN_A9_25_W41_INTEGRITY.cmd`、`RUN_WIN7_41_REPORT_VERIFY.cmd`、`A9_25_WIN7_41_VALIDATION.md` 与文件名含 `w41` 的夹具；`src/shell/tests/product/a9-06-driver-entry.cjs` 中 `w40*` 旅程与 `a925*` 辅助函数可为 R6 修改；
   构建脚本新增 `A9-25-INPUTS-WIN7-41` profile 与集合登记。WIN7-40 的发布文件（`*w40*`、`*win7-40*`、`A9_25_WIN7_40_VALIDATION.md`）不再修改。
5. **步骤**：① R6 修复与 W41 派生（新套件交接书）→ 开发机门；② Win7 连续预演至少 2 次，全部 `PASS` 后才进入下一步，任一失败回到①；③ 以 WIN7-40 实机交接书为模板写 WIN7-41 实机交接书，
   增加“执行方修正自产文件一律另存新文件名”；④ 双构建冻结；⑤ 门 A；⑥ 实机；⑦ 审核与 Win7 报告校验；⑧ 门 B。
6. **Win7 目录**：WIN7-40 运行根 `C:\A9-W40\验收 目录\81c7a234` 与暂存目录保留至 WIN7-41 门 B 之后，再由负责人决定是否清理。
- 2026-09-28：§9 第 ① 步：发出 [W41 套件交接书](../plans/A9_25_W41_KIT_HANDOFF.md)（R6 时序修复与 W41 派生，分支 `codex/a9-25-w41-kit`）。
- 2026-09-28：W41 套件第一轮交付（`b29acb6`、`d3f0711`）复核：范围与 R6 修复符合要求，包测试 91/91；竞争测试未覆盖“已缓存且已展开”的实际前置状态，要求补测 R6-5（[W41 套件交接书 §6](../plans/A9_25_W41_KIT_HANDOFF.md)）。
- 2026-09-28：W41 套件补测 R6-5（`cef673b`，已缓存且已展开的竞争场景）经验收方复核通过：删去“已更新且已重绘”条件后当前驱动测试失败，包测试 94/94；
  W41 套件于 `5d671bc` 并入 alpha2，§9 第 ① 步完成。发出 [W41 预演交接书](../plans/A9_25_W41_REHEARSAL_HANDOFF.md)（第 ② 步，同一构建连续两次预演）。
- 2026-09-28：W41 连续两次预演（`20260928-1848`，`REHEARSAL_NOT_ELIGIBLE`）复核：两次结果一致，`w41_m3`、`w41_review` 因驱动以 `#a9-diff` 内容变化判断 `showDiff` 完成而超时（内容相同时 Blink 不产生 DOM 变更），
  属套件缺陷，未发现产品缺陷。第二轮返工 R7 见 [W41 套件交接书 §7](../plans/A9_25_W41_KIT_HANDOFF.md)，通过后重新做连续两次预演。
- 2026-09-28：W41 套件 R7 返工（`b2df83c`：以轮次行替换加产品重置后的收起状态判断 `showDiff` 完成，假 DOM 与 Blink 一致，预演 `last_observation` 原值夹具重放）经验收方复核通过，
  包测试 97/97，负向对照（加回 `updated` 条件使 R7-3 两项失败）有效；于 `e846366` 并入 alpha2。按 [W41 预演交接书附录 A](../plans/A9_25_W41_REHEARSAL_HANDOFF.md) 重新做连续两次预演。
- 2026-09-28：W41 第二轮连续两次预演（`20260928-2128`，`REHEARSAL_NOT_ELIGIBLE`）复核：R7 生效（`w41_m3` 两次通过、重绘超时消除）；两次结果一致，`w41_review` 同点失败于 R6 返工引入的必达“确认撤销”等待
  （原版为可选，写工具文件不出现确认卡），套件缺陷，未发现产品缺陷。R8 返工见 [W41 套件交接书 §8](../plans/A9_25_W41_KIT_HANDOFF.md)，通过后第三次连续两次预演。
- 2026-09-29：W41 套件 R8 返工（`717e849`：“确认撤销”恢复为可选，R6 全部改动逐处对照原版可选语义，写工具与 Shell 基线两种撤销测试及预演夹具重放）经验收方复核通过，
  包测试 101/101，负向对照（只认 `clicked` 使 R8-3 失败）有效；于 `f77de6d` 并入 alpha2。按 [W41 预演交接书附录 B](../plans/A9_25_W41_REHEARSAL_HANDOFF.md) 第三次连续两次预演。
- 2026-09-29：W41 第三轮连续两次预演（`20260929-0748`，`REHEARSAL_NOT_ELIGIBLE`，构建源 `f77de6d`）复核：两次原值均为 `status=PASS`，21 个用例成立（W41-01 留待完整性入口），W41-18～22 首次在 Win7 跑完；
  未发现套件问题或产品缺陷。偏差：`agent` 会话“断开”致窗口尺寸不同（DEV-1），执行方远程尝试 `tscon`（DEV-2，失败、无效果）。见 [W41 套件交接书 §9](../plans/A9_25_W41_KIT_HANDOFF.md)，待负责人裁决后进入第 ③ 步。
- 2026-09-29：负责人认定 §9 第 ② 步完成，并确认 DEV-2 的授权来自负责人。进入第 ③ 步起草 WIN7-41 实机交接书。

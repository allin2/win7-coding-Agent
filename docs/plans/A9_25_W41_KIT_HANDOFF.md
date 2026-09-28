# A9-25 W41 验证套件交接书（R6 修复与 W41 派生）

> 执行方：外部执行 Agent。验收方：发出本交接书的会话。执行方只交代码、测试和事实报告，不自行宣布验收通过。
> 授权依据：[A9-25](../tasks/A9_25_WIN7_40_REISSUE_AND_ACCEPTANCE.md) §9（ADR-0145）第 1～5 项中的第 ① 步。本交接书**不做**：候选冻结、authority、Win7 部署或预演（预演另出交接书）。
> 背景：WIN7-40 实机 G2 因驱动时序缺陷失败，见[审核报告](../reports/2026-09/a9_25_win7_40_acceptance_review_2026-09-28.md) §3。

## 1. 起点

- W40 套件的派生规则、谱系更正与五轮返工教训见 [W40 套件交接书](A9_25_W40_KIT_HANDOFF.md) §3、§6、§7，W41 必须全部保留（精确比对放行、残留守卫、阶段失败不中止、视口 1 CSS 像素容差、等待诊断、结论取自 Kit）。
- WIN7-40 实机证据（只读夹具来源）：`/Users/qlyf/Developer/win7-coding-Agent/.acceptance/runs/A9-25-W40/81c7a234-4745-4c79-8554-8c1a4b9f407e/`。

## 2. 基线、分支与允许路径

- 基线：`codex/a9-alpha2` 上本交接书所在提交或其后只含文档改动的提交。在套件工作树 `/Users/qlyf/Developer/win7-coding-agent-w40-kit` 中从该基线新建分支 `codex/a9-25-w41-kit`
  （工作树须先干净；`codex/a9-25-w40-kit` 分支保留不动）。本地提交，**不推送、不合并**。Node 20.17。
- 允许修改或新增的文件仅限 A9-25 §3 与 §9 第 4 项。特别注意：
  - WIN7-40 的发布文件（`release/win7-product-v3/` 下文件名含 `w40`、`win7-40` 的文件与 `A9_25_WIN7_40_VALIDATION.md`）**不得修改**；
  - 驱动中 `w39` 与更早旅程、`captureVisual`、历史断言键不得修改；`w40*` 旅程与 `a925*` 辅助函数只可为 R6 修改；
  - 不得修改产品源码、`package.json`、锁文件、`docs/**`。发现产品缺陷时停止并报告。

## 3. 实现要求

### 3.1 R6 时序修复（驱动 `src/shell/tests/product/a9-06-driver-entry.cjs`）

1. **R6-1 `a925OpenFileDiff`**：点击“查看改动”后，必须等产品完成 `showDiff` 的异步取 Diff 与重绘，再判断文件展开状态。可接受的判据由执行方选定并在验证说明写明，例如：
   `#a9-diff` 已显示该轮内容，且目标文件行的 `aria-expanded` 与“撤销此文件”按钮存在性在相隔至少 300 ms 的两次观察中保持一致。展开后再次确认按钮存在才返回。
2. **R6-2 一次性操作改为等待**：`a925ClickUndo`、`queueNoteUndo`、`recallNoteUndo`、W40-20 中点击该轮行按钮后立即读取行文本等“查询一次即判定或抛错”的写法，改为经 `a925WaitFor` 等待目标控件可用后再操作；
   超时须按 R4-3 记录最后一次观察（含目标行的 `aria-expanded`、按钮是否存在与 `disabled`、`#a9-undo-state` 文本）。
3. **R6-3 普查**：逐处列出全部 `w40*` 旅程与 `a925*` 辅助函数中的一次性 `exec` 与 `throw`，说明保留或修改的理由（初步清单：`a925ClickUndo` 的 `UNDO_BUTTON_UNAVAILABLE`、`a925CaptureDiff` 的 `SCREENSHOT_DOM_NOT_READY`、
   `runW40StopProcess` 的 `STOP_CHILD_NOT_RUNNING`、`runW40ReviewModeProcess` 的 `REVIEW_MODE_NOT_RESTORED`、`queueNoteUndo`/`recallNoteUndo`、W40-20 的行文本读取）。
4. **R6-4 复现测试**：用 `vm` + 假 DOM 加载真实 `a9-workbench.js`，让 `a9.getDiff` 延迟返回，复现“驱动读到未重绘 DOM → 文件被折叠 → 按钮消失”的竞争：
   修复前的驱动写法须失败并得到 `A9_W40_UNDO_BUTTON_UNAVAILABLE`（或等价错误），修复后通过；另测 `getDiff` 立即返回与延迟返回两种时序都通过。

### 3.2 W41 派生

1. **Profile**：新增 `A9-25-INPUTS-WIN7-41`（`task: 'A9-25'`、`candidate: 'WIN7-41'`、`a9-25-win7-41-input-lock.json`、Kit 文件名 `A9_25_W41_VALIDATION_KIT.json`、`A9_25_WIN7_41_VALIDATION.md`、
   `RUN_A9_25_W41_INTEGRITY.cmd`、`RUN_WIN7_41_REPORT_VERIFY.cmd`、`a9-package-integrity-w41.cjs`、`a9-win7-41-report.cjs`、`extraValidationScripts: ['a9-win7-41-smoke.cjs']`、`evidenceDirectory: 'a9-win7-41-evidence'`）。
   凡列出 `'WIN7-40'` 的候选集合与判断都加入 `'WIN7-41'`，逐处登记。
2. **机械派生**：W41 的 smoke、完整性、报告、输入锁与两个 `.cmd` 从 R6 修复后的 W40 同名文件派生，只做身份替换（`W40→W41`、`win7-40→win7-41`、`WIN7_40→WIN7_41`、`WIN7-40→WIN7-41`、`w40→w41`，含大小写变体）；
   任务号 `A9-25`、`A9_25` 不变。输入锁三项输入与 W40 相同。
3. **谱系更正**（按 W40 交接书 §6.1 R-2 的方式逐条登记）：输入锁 `provenance`（前序 `WIN7-40`、结论 `A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS`、`change_scope`、`rule` 如实写明 R6 修复与“产品源码相对 WIN7-40 `64fd3a7` 未变”——以 `git diff` 实际结果为准）、
   派生文件头部来源注释、校验这些字段的代码；Kit `result_on_complete` 为 `A9_25_WIN7_41_A9_24_PASS`，`historical_candidate` 如实记录 WIN7-40 结论；报告种类 `A9_25_WIN7_41_A9_24_ACCEPTANCE`。
4. **打包驱动重基线**：W41 打包驱动中，被使用的继承旅程与 `w40*` 旅程的阶段名、断言 ID 重基线为 `w41_*` / `A9-W41-*`；仓库驱动保持 `w40*` 名称。替换可审计（每个源片段出现次数有断言）。
5. **残留守卫**：W41 派生文件与打包驱动中出现 `A9-W40-`、`A9_W40_`、`WIN7_40_RELEASE_AUTHORITY`、`APPROVED_FOR_WIN7_40_VALIDATION`、`'W40-NN-…'`、`A9_25_VALIDATION_KIT`（W40 的 Kit 名）
   以及 W37/W38/W39 与 `A9_20_A9_21` 同类字面量即构建失败；合法的谱系引用精确放行并说明。
6. **Kit**：用例 `W41-01`～`W41-22`，用例名与判定口径与 W40 相同。

## 4. 开发机门

1. R6-1～R6-4 的测试与注入反例（修复前写法失败、修复后通过；超时诊断含最后观察）。
2. W41 派生文件与 R6 修复后的 W40 文件差异只含身份替换与登记项（逐文件精确比对）；W40 派生文件自身相对 `033844a` 未改（测试断言）。
3. 残留守卫对注入的 W40/W39/W38/W37 字面量报错；打包驱动中无 `A9-W40-`、`w40_`。
4. 以 WIN7-40 实机证据的真实 JSON 作只读夹具，重放 W41 对应判定（至少覆盖 `w40_review` 失败前的四条断言与 `w40_review_mode`、`w40_stop` 的判定）。
5. 包测试全部通过，另须通过 `src/shell` 全量 Jest、`npm run verify:quick`、`npm run docs:check`、`git diff --check`。

## 5. 交付与报告

本地提交后报告：基线、分支、提交与改动文件清单；R6-3 普查清单；P-2 式集合登记；W41 派生差异与谱系更正逐条；W41-01～22 → 断言 ID → 证据文件映射；§4 每项命令、结果与反例失败证据；
驱动相对基线的全部非新增改动逐处清单（应只含 R6 涉及的 `w40*`/`a925*` 代码）。`w41*` 旅程无法在开发机运行，写明“待 Win7 预演”。不得宣布验收通过。

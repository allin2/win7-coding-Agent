# A9-24 — 改动审阅（Alpha 2，取代 A9-16 R01–R05 的暂存区式 Review，ADR-0143）

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: ALPHA2_PRODUCT_FEATURE
Target Branch: codex/a9-alpha2
Source Baseline: codex/a9-alpha2 @ 本任务书批准提交
Target Version: 0.3.0-alpha.2
Phase-Gate: A9_24_DEVELOPER_VERIFIED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0143
```

> 2026-09-27 负责人决定：Review 要么接近一线体验、要么不做；批准把 A9-16 R01–R05 改为“先写后审”的改动审阅（ADR-0143）。
> 2026-09-27 负责人确认 Demo 与 §6 建议，批准实施（“我觉得可以，给我实施方案”）。实现只能在 §5 允许路径内进行（AGENTS.md C14）。交互 Demo：[a9-24-review-demo](../plans/a9-24-review-demo/index.html)。
> 同日第一版草稿（暂存区式 Review 模式）已被本版取代，见 git 历史 `4019c02`。

## 1. 目标体验

Agent 直接写入工作区，所以能运行测试、自我修正；每轮结束后用户看到“这一轮改了什么”，不满意时按文件或整轮撤销。
审阅是可选的：不审阅就等于保留，不阻断下一轮。权限模式对用户只有 Full Access 与 Read Only；高影响操作确认不变。

## 2. 现状（2026-09-27 核实）

| 能力 | 现状 | 缺口 |
|---|---|---|
| 每轮 checkpoint | Full Access 每轮记录文件级变化（新建/修改/删除、原始内容 blob、Shell 入口基线、不可恢复外部变化） | — |
| 按文件撤销 | `CheckpointManager.undoFile` 带漂移保护、`undoAppliedAt` 持久化防重复；IPC `a9.checkpoint.undoFile` 与 preload `undoFile` 已贯通 | 界面未暴露 |
| 整轮撤销 | `undoTurn` 已在界面，Shell 基线未收集完时走一次性确认 | 结果以 `restored=… · errors=…` 显示，面向开发者 |
| Diff | `a9.diff.get` 按轮返回逐文件 `path/action/diffText` | 检查器里是一整段纯文本；没有逐文件增删计数、撤销状态、不可恢复项说明 |
| checkpoint 列表 | 检查器列出 Turn ID、“查看 Diff”“撤销”“复制 ID” | 面向开发者，不是面向改动 |
| Review 模式 | `review` 值在 schema 与运行时存在；未配置暂存后端时写操作结构化拒绝 | 按 ADR-0143 保留为 fail-closed，不做入口 |

## 3. 设计（Demo 所示，2026-09-27 负责人确认）

- **C1 本轮改动摘要**：每轮结束且有文件变化时，在对话流中该轮结论下方显示摘要卡：“第 N 轮改动了 K 个文件 +a −d”，列出文件，点击任一文件或“审阅”在检查器中定位。
- **C2 检查器“改动”页签**：取代现有 checkpoint 列表视图。按轮分组，最新在上；每轮显示增删计数、未撤销文件数与“撤销本轮全部”；
  每个文件显示操作类型、增删计数与状态（未撤销/即将撤销/已撤销），展开显示该文件 Diff 与“撤销此文件”。Turn ID 与复制保留在“更多”或诊断中。
- **C3 延迟撤销**：点“撤销”后 5 秒内可“撤回”，到时才调用后端；撤销后状态持久（沿用 `undoAppliedAt`），重启后仍显示“已撤销”。
- **C4 漂移时拒绝并说人话**：文件在本轮之后被更晚的轮次修改时，说明“在第 M 轮又被修改，先撤销第 M 轮对它的修改”；
  被外部（编辑器等）修改时，说明已拒绝以免覆盖用户修改、工作区未改动。均为零写入。
- **C5 命令产生的变化如实标注**：Shell 造成、可随基线恢复的变化正常列出；不可恢复的（超过备份上限、工作区外等）标“命令产生 · 无法撤销”并给原因；
  Shell 基线待确认时，沿用现有一次性确认，以明确的确认卡呈现而不是错误文本。
- **C6 不阻断**：有未审阅的改动时可以直接开始下一轮；没有“待审”计数或强制流程。
- **C7 模式与确认**：权限对话框只提供 Full Access / Read Only；`review` 保留值继续 fail-closed。高影响操作确认不变（R04）。
- **C8 第二步（不在本任务）**：按块（hunk）撤销，另立任务。

## 4. 验收用例（开发机先行；Win7 由后续换发任务承担）

| 编号 | 可观察条件 |
|---|---|
| CR-01 | 有文件变化的轮次结束后出现摘要卡，文件数与增删计数与该轮 Diff 一致；无变化的轮次不出现 |
| CR-02 | “改动”页签按轮分组、最新在上；逐文件 Diff 与后端 `a9.diff.get` 一致 |
| CR-03 | 撤销此文件：5 秒内撤回则后端未被调用、文件不变；到时后文件恢复到本轮前，状态“已撤销”，重启后仍为“已撤销”，再次点击不重复作用 |
| CR-04 | 撤销本轮全部：本轮全部可撤销文件恢复；其中任一文件漂移时，该文件拒绝并说明原因，其余文件的处理结果逐一如实显示 |
| CR-05 | 更晚轮次修改过的文件、外部修改过的文件：撤销被拒绝、零写入，提示文字区分两种原因 |
| CR-06 | 不可恢复的命令产生变化以“无法撤销”列出并给原因；Shell 基线待确认时显示确认卡，确认后才撤销 |
| CR-07 | 有未审阅改动时可立即开始下一轮 |
| CR-08 | 权限对话框无 Review 入口；把 `review` 写入工作区设置时写操作被结构化拒绝、零写入，不降级为 Full Access |
| CR-09 | 高影响操作确认行为与文案不变；A9-16 U01–U07、A9-19 布局与实时过程用例不回退；新增控件键盘可达、`aria` 完整 |
| CR-10 | 摘要卡、改动页签与撤销提示不含秘密内容（沿用现有脱敏） |

## 5. C14 允许路径（冻结）

实现在独立工作树与分支 `codex/a9-24-change-review`（自 `codex/a9-alpha2` 批准提交创建）进行，只允许修改或新增：

- `src/workspace/src/checkpoint-manager.ts`：**只新增只读查询**，不改任何撤销、持久化或漂移判定语义；
- `src/workspace/tests/unit/**`：本任务新增测试；
- `src/shell/product/a9-agent-runtime.js`：Diff 与撤销响应的只增字段、漂移原因分类；不新增 IPC 通道；
- `src/shell/product/renderer/workbench.html`、`a9-workbench.css`、`a9-workbench.js`；
- `src/shell/tests/product/**`：新增测试；既有测试只允许因文案变更而更新断言，不得删除用例或放宽断言。**不得修改** `a9-06-driver-entry.cjs`。

不得修改：Core、State（含 schema）、`a9-product-ipc.js`、preload、`main.js`、native、发布脚本与 `release/**`、文档（文档由验收方维护）。
若实现需要触碰清单外文件，停止并报告。

### 5.1 兼容约束（W37/W39 驱动与既有契约依赖）

- `#a9-checkpoint-list` 内每轮一行 `li.checkpoint-row`；行内 `.checkpoint-id` 显示**完整** Turn ID（可缩小、弱化，但须可见且 `title` 为完整 ID），
  保留“复制 ID”；行内**第一个按钮**仍把该轮 Diff 写入 `#a9-diff`（文本含 `--- <path> (<action>)` 行）。
- `#a9-checkpoint-count` 文案格式（“最近 N / 共 M”或“共 M”）与“加载更早…”分页按钮保持不变；`#a9-undo-state` 保留，改为人话结果。
- `a9.diff.get` 响应的 `diff` 数组保持原结构，新增字段放在同级；撤销响应的 `outcome` 保持原结构。

## 6. 裁决结果（2026-09-27）

- Q1：撤销延迟 5 秒，期间可撤回；延迟期内切换对话、切换工作区或退出应用时不执行。
- Q2：原 checkpoint 列表由按轮分组的改动视图取代；因 §5.1，完整 Turn ID 与复制保留为行内次要信息。
- Q3：按块撤销在本任务验收后另立任务。
- Q4：开发机完成后另立换发任务出 WIN7-40，沿用 A9-23 的门 A/门 B 流程。

## 7. 验证矩阵

开发机（macOS，Node 20.17）必须全部通过后才能交付：

1. `src/workspace` 全量 Jest；`src/shell` 全量 Jest（含新增测试）；
2. `npm run verify:quick`、`npm run docs:check`、`git diff --check`；
3. `node --test scripts/release/test/a9-package.test.mjs`（证明驱动与发布套件未受影响）；
4. 负向对照：把延迟撤销改为立即调用、把漂移分类恒定为 `external`、删除 `.checkpoint-id` 完整 ID，各自至少一个新增测试失败。

真实 Electron（Windows）与 Win7 实机：`NOT_PERFORMED`，由 WIN7-40 换发任务承担，不得宣称通过。

## 8. 非目标

- 暂存区式 Review 模式、写入前审批（ADR-0143 已决定不做）。
- Shell 运行中输出（S01–S06，另立任务，先写 helper v3 协议设计）。
- 会话中选择工作区后过程记录不加载的产品侧观察（另议）。

## 9. 执行记录

- 2026-09-27：负责人确认 Demo 与 §6 建议，批准实施；实现交接书 [A9_24_CHANGE_REVIEW_HANDOFF.md](../plans/A9_24_CHANGE_REVIEW_HANDOFF.md)。
- 2026-09-27：执行方交付 `a086626`（分支 `codex/a9-24-change-review`，基线 `2248074`）。验收方复核通过：相对基线 10 个文件均在 §5 允许路径内；
  `getTurnReview` 只读，宿主响应只增字段（`review`、`driftReasons`），`later_turn` 判定按升序 checkpoint 取更晚轮次；界面全部 `textContent`，
  延迟撤销在切换对话、切换工作区与页面卸载时取消，generation/epoch 防止旧响应串台，历史摘要限最近 10 轮、并发 2；§5.1 兼容点保留。
  复跑 workspace 216/216、shell 458/458、`a9-package.test.mjs` 60/60，`verify:quick`、`docs:check` 通过；验收方负向对照（立即撤销、恒判 external、截短 Turn ID）
  分别使新增测试 1、1、2 项失败，还原后工作区干净。于 `c136d12` 并入 `codex/a9-alpha2`，`Phase-Gate` 改为 `A9_24_DEVELOPER_VERIFIED`。
  观察（不返工）：`getDiff` 同时计算旧 Diff 与审阅投影，大文件有重复开销；漂移路径靠解析 `path (原因)` 文本；Diff 截断时增删计数偏小且摘要卡不提示；
  真实 Electron 画面与 1366×768/125% DPI 布局未实测。真实 Electron 与 Win7 为 `NOT_PERFORMED`，由 WIN7-40 承担。
- 2026-09-28：WIN7-40（A9-25）记为 `A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS`（套件时序缺陷，非产品缺陷；ADR-0145）；本任务的 Win7 结论改由 WIN7-41 取得，仍为 `NOT_PERFORMED`。

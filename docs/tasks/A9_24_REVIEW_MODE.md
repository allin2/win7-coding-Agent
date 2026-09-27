# A9-24 — 改动审阅（Alpha 2，取代 A9-16 R01–R05 的暂存区式 Review，ADR-0143）

```text
Status: DRAFT_PENDING_OWNER_REVIEW
Task Type: ALPHA2_PRODUCT_FEATURE
Target Branch: codex/a9-alpha2
Source Baseline: codex/a9-alpha2（批准时以批准提交为准）
Target Version: 0.3.0-alpha.2
Phase-Gate: NOT_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0143
```

> 2026-09-27 负责人决定：Review 要么接近一线体验、要么不做；批准把 A9-16 R01–R05 改为“先写后审”的改动审阅（ADR-0143）。
> 本文件是草稿，**不构成实现授权**（CLAUDE.md 行为规则 1、AGENTS.md C14）。交互 Demo：[a9-24-review-demo](../plans/a9-24-review-demo/index.html)。
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

## 3. 设计（Demo 所示，待负责人确认）

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

## 5. 实现范围草案（批准后冻结为 C14 允许路径）

- 界面：`src/shell/product/renderer/workbench.html`、`a9-workbench.css`、`a9-workbench.js` 与 `src/shell/tests/product/a9-workbench-contract.test.ts`。
- 产品宿主：`src/shell/product/a9-agent-runtime.js`（Diff 响应增加逐文件增删计数、撤销状态、不可恢复项与漂移原因分类；不新增 IPC 通道为首选）及其测试。
- Workspace：`src/workspace/src/checkpoint-manager.ts` 仅新增只读查询（撤销状态、不可恢复项），不改撤销语义；及其测试。
- 不改 schema（沿用 ADR-0138 不引入迁移的取向）；不改 Core。
- 文档：本任务书、`docs/tasks/README.md`、STATUS/STATUS_LOG、`docs/plans/a9-24-review-demo/**`。

## 6. 开放问题（批准前需负责人裁决）

- **Q1 撤回时长**：建议 5 秒；是否改为撤销前弹确认（更稳但多一步）。
- **Q2 旧 checkpoint 列表**：建议由“改动”页签取代，Turn ID 与复制收进“更多”；是否保留原列表视图。
- **Q3 按块撤销**：建议本任务验收后立即另立任务（需要反向补丁与块级漂移检测，是新后端能力）。
- **Q4 Win7 验收**：开发机完成后另立换发任务出 WIN7-40，沿用 A9-23 的门 A/门 B 流程。

## 7. 非目标

- 暂存区式 Review 模式、写入前审批（ADR-0143 已决定不做）。
- Shell 运行中输出（S01–S06，另立任务，先写 helper v3 协议设计）。
- 会话中选择工作区后过程记录不加载的产品侧观察（另议）。

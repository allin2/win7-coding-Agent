# A9-24 改动审阅实现交接书

> 执行方：外部执行 Agent。验收方：发出本交接书的会话。授权依据：[A9-24](../tasks/A9_24_REVIEW_MODE.md)（`APPROVED_FOR_IMPLEMENTATION`，ADR-0143）。
> 目标体验与验收用例以任务书 §1、§3、§4 为准；交互参照 [Demo](a9-24-review-demo/index.html)。本文只给实现方案、分步与交付要求。

## 1. 起点与约束

- 在主工作区外新建工作树：`git worktree add ../win7-coding-agent-a9-24 -b codex/a9-24-change-review codex/a9-alpha2`；
  `node_modules` 用符号链接复用主工作区（根目录与各 `src/*`），各包 `dist` 在本工作树内构建。Node 20.17。
- 只在任务书 §5 允许路径内修改；§5.1 兼容约束必须保持。本地提交，**不推送、不合并**。不下载、不安装、不联网。
- 发现文档之间或与代码现状矛盾、或需要清单外文件时，停止并列出清单等待裁决。

## 2. 现有能力（实现前自行核对）

- `CheckpointManager`（`src/workspace/src/checkpoint-manager.ts`）：`getTurnDiff(turnId)` 返回 `{path, action, diffText}[]`；
  `getTurnChanges(turnId)` 返回含 `undoAppliedAt` 的 `FileChangeRecord[]`；`undoFile`/`undoTurn` 带漂移保护并返回 `{restored, errors, drifted}`；
  checkpoint 的 `unrecoverable` 记录不可恢复的外部变化；`externalBaseline.collectionStatus` 未完成时撤销需一次性确认。
- 宿主（`src/shell/product/a9-agent-runtime.js`）：`getDiff`、`undoFile`、`undoTurn`（含 `needsConfirmation`/`confirmationId` 流程）、
  `listCheckpoints`（分页）；preload 已暴露 `getDiff`、`undoFile`、`undoTurn`、`listCheckpoints`。
- 界面（`renderer/a9-workbench.js`）：`renderCheckpoints`、`showDiff`、`undoTurn`；检查器“变更”页签含 `#a9-diff`、`#a9-checkpoint-list`、`#a9-undo-state`。

## 3. 实现方案

### M1 只读查询（Workspace）

在 `CheckpointManager` 新增 `getTurnReview(turnId)`，不写磁盘、不改任何既有方法：

```text
{
  turnId,
  files: [{ path, action, originalKind, newKind, undone: boolean, additions, deletions, diffText, diffTruncated }],
  unrecoverable: [{ path, kind, reason }],
  externalBaselineStatus: 'none' | 'pending' | 'awaiting_confirmation' | 'complete'
}
```

- `additions`/`deletions` 由 `buildContentDiffPreview` 的统一 Diff 行计数（以 `+`/`-` 开头、排除 `+++`/`---` 头）；目录项计 0。
- `undone` 取自 `undoAppliedAt`。未找到 checkpoint 返回 `null`。

### M2 宿主响应（只增字段）

- `getDiff(turnId)`：保持 `diff` 数组原样，同级新增 `review: getTurnReview(turnId)`。
- `undoFile`/`undoTurn`：保持 `outcome` 原样，同级新增 `driftReasons: [{ path, kind: 'later_turn' | 'external', laterTurnId? }]`。
  分类方法：对 `outcome.drifted` 中的每个路径（剥离括号说明得到相对路径），按当前会话 checkpoint 列表（`persistence.listCheckpoints`，按 `createdAt`）
  找出晚于目标轮、`getTurnChanges` 含该路径且 `undoAppliedAt` 为空的最早一轮，命中记 `later_turn` 并给 `laterTurnId`，否则记 `external`。
- 不新增 IPC 通道；不改 `a9-product-ipc.js` 与 preload。

### M3 界面：改动视图（检查器“变更”页签，文案改为“改动”）

- **按轮分组**：沿用 `#a9-checkpoint-list` 与分页；每行 `li.checkpoint-row` 改为轮次卡片：标题“第 N 轮”（N 取该 turnId 在当前对话事实中的序号；取不到时显示“更早的轮次”）、
  `+a −d`、“K 个文件未撤销”、按钮顺序为 **[查看改动] [撤销本轮全部] [复制 ID]**；`.checkpoint-id` 以小号等宽字体显示完整 Turn ID（`title` 同值）。
  “查看改动”保持现有行为（把整轮 Diff 写入 `#a9-diff`），同时在行内展开文件列表。
- **文件列表**：数据来自 `getDiff(turnId).review`，按 turnId 缓存，撤销后失效重取。每个文件：操作类型（修改/新建/删除/目录）、路径、`+a −d`、状态（未撤销/即将撤销/已撤销）；
  展开显示该文件 `diffText`（有界、可滚动）与“撤销此文件”。`unrecoverable` 项以“命令产生 · 无法撤销”列出并显示 `reason` 的中文说明。
- **延迟撤销**：点击后进入“即将撤销”，显示 5 秒倒计时与“撤回”；撤回则不调用后端；到时才调用 `undoFile`/`undoTurn`。
  延迟期内切换对话、切换工作区或页面卸载时取消（不执行）。同一文件或同一轮同时只能有一个待执行撤销。
- **结果与漂移**：`#a9-undo-state` 改为人话，例如“已撤销 src/calc.ts”；`driftReasons` 为 `later_turn` 时显示“在第 M 轮又被修改，先撤销第 M 轮对它的修改”，
  为 `external` 时显示“在本轮之后被外部修改，为避免覆盖已拒绝撤销，工作区未改动”；`errors` 原文作为补充显示。整轮撤销逐文件显示结果。
- **Shell 基线确认**：响应含 `needsConfirmation` 时，在该轮卡片内显示确认块（说明已重新收集当前状态、可先查看改动），按钮“确认撤销”携带 `confirmationId` 再次调用；不再只显示错误文本。
- **本轮改动摘要卡**：轮次终态（`turn_completed`/`turn_failed`/`turn_cancelled`）且该轮 checkpoint 有文件变化时，在该轮结论后插入 `.change-summary` 卡（`data-turn-id`）：
  “第 N 轮改动了 K 个文件 +a −d”、文件名标签、“审阅”按钮；点击打开检查器“改动”页签并展开对应轮与文件。历史对话只为最近 10 个有 checkpoint 的轮次懒加载摘要，
  同时最多 2 个请求、结果缓存；无变化或 Read Only 轮次不显示。卡片随撤销状态更新（已撤销文件加删除线）。
- **不阻断**：任何审阅状态都不禁用输入框或发送按钮。
- **可访问性**：新增按钮有明确 `aria-label`；展开控件有 `aria-expanded`/`aria-controls`；倒计时区域 `aria-live="polite"`；Tab 顺序与视觉一致。

### M4 权限对话框

确认对话框仍只有 Full Access / Read Only（现状已是如此），补测试锁定；不改 `review` 保留值的运行时行为。

## 4. 测试要求（任务书 §7）

- Workspace 单测：`getTurnReview` 的计数、`undone` 在 `undoFile` 后变为 true、`unrecoverable` 列出、调用前后工作区与恢复区文件哈希不变。
- 宿主测试：`getDiff` 的 `diff` 数组与改动前逐字节相同且新增 `review`；`driftReasons` 在“后一轮又改同一文件”时为 `later_turn`+正确 `laterTurnId`，
  在“外部改写”时为 `external`；两种情况工作区零写入。
- 界面测试（沿用 `a9-w39-m4-workspace-loading.test.ts` 的 `vm` + 假 DOM 方式加载真实 `a9-workbench.js`，用假 `a9` 接口计数调用）：
  摘要卡在有变化时出现、无变化时不出现；延迟撤销在 5 秒内撤回时 `undoFile` 调用次数为 0、到时为 1；延迟期内切换对话取消；
  `later_turn`/`external` 文案；`needsConfirmation` 确认块携带 `confirmationId`；§5.1 兼容点（第一个按钮写 `#a9-diff`、`.checkpoint-id` 完整 ID、计数文案）；
  输入框在有未撤销改动时仍可用；权限对话框只有两项。
- 回归与负向对照按任务书 §7 执行。

## 5. 交付与报告

本地提交后交回：新提交哈希；相对基线的改动文件清单（须全部在允许路径内）；M1～M4 各自的修改位置；新增测试名与结果；各项回归测试摘要；
负向对照说明（改回什么、哪条测试失败）；未完成项与偏离。开发机结果不得写成 Win7 或真实 Electron 通过。

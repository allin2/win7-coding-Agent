# A9-24 — Review 模式（Alpha 2，A9-16 R01–R05）

```text
Status: DRAFT_PENDING_OWNER_REVIEW
Task Type: ALPHA2_PRODUCT_FEATURE
Target Branch: codex/a9-alpha2
Source Baseline: codex/a9-alpha2 @ c54c649（批准时以批准提交为准）
Target Version: 0.3.0-alpha.2
Phase-Gate: NOT_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: 待批准时新增 ADR（§6 Q1、Q2）
```

> 2026-09-27 负责人决定：A9-16 的 Alpha 2 剩余范围拆为两个任务，先做 Review（本任务），Shell 运行中输出（S01–S06）另立任务、先写 helper v3 协议设计。
> 本文件是草稿，**不构成实现授权**（CLAUDE.md 行为规则 1、AGENTS.md C14）。交互 Demo：[a9-24-review-demo](../plans/a9-24-review-demo/index.html)。

## 1. 需求来源

[A9-16](A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md) §2 R01–R05 与 §20 修订（Review 暂缓期间隐藏页签；R01 不静默降级不变）。本任务不改写这些条文，只把它们落到可实现、可验收的设计。

## 2. 现状盘点（2026-09-27，`c54c649`）

| 层 | 已有 | 缺口 |
|---|---|---|
| Core | `a9-agent-loop.ts` 已定义 `A9ReviewStagingPort`；Review 模式下 write/edit/copy/move/delete 走 `executeStagedWrite`，未配置后端时以结构化错误拒绝、零写入；shell 在 Review 模式需审批 | 同一轮内读取已暂存路径仍读正式工作区（多次编辑同一文件会基于旧内容） |
| State | `a9_workspaces.permission_mode` 允许 `review`；schema v4 | 没有 Review 集与逐文件决定的表 |
| Workspace | A8 `review-staging.ts`（1123 行）：ReviewSet、确定性哈希、逐文件决定、`ReviewApprovalLedger`（绑定、TTL、一次性消费）、全有或全无 Apply（preflight/backup/write/verify/rollback）、`restoreRecovery`、内容寻址私有 blob、编码/EOL、秘密拦截 | A8 资产未接入 A9；复用前须逐项核对 A9 IPC、SQLite 与权限边界，不能直接宣称继承 A8 结论 |
| 产品宿主 | `a9-agent-runtime.js` 的 `setMode` 接受 `review` | 未向 Core 提供 `reviewStaging`；没有 Review 的 IPC、快照字段与恢复 |
| 界面 | A9-19 L05：Review 页签隐藏，权限对话框说明未开放 | 待审改动面板、逐文件决定、应用卡、三类卡片区分 |

## 3. 设计决定（Demo 所示，待负责人确认）

- **D1 Review 集粒度**：一轮一个 Review 集。同一轮内每次暂存使修订号 +1；轮次结束后进入“待决定”（READY）。
- **D2 同轮读取暂存内容**：Review 模式下，同一轮内对已暂存路径的 read/search 返回暂存后的内容（覆盖视图），正式工作区不变；否则模型第二次编辑会基于旧内容。
- **D3 Review 模式的 Shell**：保留 Core 现有合同，每条命令单独“命令确认”；卡片明确提示命令在正式工作区运行、看不到暂存改动。
- **D4 逐文件决定与应用**：每个文件“接受/拒绝”；全部决定后才能“应用已接受（N）”。应用确认卡（Review 卡）绑定 Review 集、修订、工作区基线、预览与接受集合哈希，5 分钟有效、一次性消费。
  应用前重验基线，任一文件漂移则整批拒绝、零写入，状态转“基线已变化”，可“重新比对”（新基线、新修订、决定清空）。应用成功后生成 checkpoint，可撤销；已拒绝文件丢弃。
- **D5 未处理时的阻断**：同一对话有未应用、未丢弃的 Review 集时，不允许开始新一轮，也不允许切换权限模式（R05）；左栏与检查器页签显示待审计数。
- **D6 恢复**：Review 集、修订与逐文件决定持久化；重启后恢复到原状态。应用确认卡不跨重启恢复（需重新发起）。应用写入中断时，重启后按 A8 备份回滚到应用前状态并标“需要恢复”，用户确认后可重新应用。
- **D7 三类卡片**：“应用待审改动”（Review 专属，紫）、“命令确认”（Review 模式 Shell，灰蓝）、“高影响操作确认”（Full Access，琥珀），标题、颜色、说明与审计类型均不同；Full Access 下不出现 Review 卡、不进入准备区（R03/R04）。
- **D8 fail-closed**：Review 后端未就绪、存储损坏或身份不一致时，写工具以结构化错误拒绝，界面显示原因，绝不降级为 Full Access（R01）。

## 4. 验收用例（开发机先行，Win7 由后续换发任务承担）

| 编号 | 可观察条件 |
|---|---|
| RV-01 | 三种模式可选；Review 后端不可用时写操作结构化拒绝、正式工作区零写入（R01） |
| RV-02 | Review 模式写入只进准备区：工作区文件哈希在应用前不变；同轮读取返回暂存内容（D2） |
| RV-03 | 逐文件接受/拒绝；应用只写已接受文件，已拒绝文件工作区不变；应用生成 checkpoint 且可撤销（R02） |
| RV-04 | 应用前外部修改任一文件：整批拒绝、零部分写入、状态“基线已变化”；重新比对后可再次应用（R02） |
| RV-05 | 应用确认过期、重复使用、跨 Review 集或跨修订使用均被拒绝；不能在 Full Access 或 Read Only 下使用（R05） |
| RV-06 | Full Access 的普通读写不产生 Review 卡、不进准备区；高影响操作确认仍逐次生效且标题为“高影响操作确认”（R03/R04） |
| RV-07 | 未处理的 Review 集阻止新一轮与模式切换（D5） |
| RV-08 | 重启后 Review 集与决定恢复；应用中断后回滚到应用前状态并提示恢复（D6） |
| RV-09 | 三类卡片在 DOM 上可区分（类名、标题、审计类型），键盘可达、`aria` 完整；A9-16 U01–U07 与 A9-19 布局用例不回退 |
| RV-10 | 秘密内容不得进入准备区 blob、事件、SQLite 或界面（沿用 A8 秘密拦截并在 A9 路径复测） |

## 5. 实现范围草案（批准后冻结为 C14 允许路径）

- Core：`src/core/src/a9-agent-loop.ts`（D2 覆盖读取；审计类型）及其测试。
- Workspace：新增 A9 Review 服务（适配 A8 `review-staging.ts`，不改其既有行为语义）与测试。
- State：`src/state/src/a9-persistence.ts`（Review 集与决定的持久化，见 Q1）与测试。
- 产品宿主：`src/shell/product/a9-agent-runtime.js`、`main.js`、preload 的 Review IPC 与快照字段。
- 界面：`src/shell/product/renderer/workbench.html`、`a9-workbench.css`、`a9-workbench.js` 与契约测试。
- 文档：本任务书、`docs/tasks/README.md`、STATUS/STATUS_LOG、新增 ADR、`docs/plans/a9-24-review-demo/**`。

## 6. 开放问题（批准前需负责人裁决）

- **Q1 持久化方式**：建议新增 `a9_review_sets`、`a9_review_items` 两表并把 schema 升到 v5（带迁移与回退测试，新增 ADR）；
  替代方案是把 Review 集写成 `a9_events` 的结构化事件（不改 schema，但查询与恢复更复杂）。
- **Q2 Review 模式的 Shell**：建议保留“每条命令确认”（D3）；替代方案是 Review 模式禁用 Shell（更严格，但无法跑测试验证暂存改动）。
- **Q3 粒度**：建议一轮一个 Review 集（D1）；替代方案是一个对话累积一个集，允许多轮后统一应用（基线管理更复杂）。
- **Q4 按块（hunk）接受**：本任务只做逐文件（R02 原文）；按块接受列为后续。
- **Q5 Win7 验收**：开发机完成后，另立换发任务出 WIN7-40 并做实机验收（沿用 A9-23 的门 A/门 B 流程）。

## 7. 非目标

- Shell 运行中输出（S01–S06，另立任务）；交互式终端与 stdin。
- 会话中选择工作区后过程记录不加载的产品侧观察（2026-09-27 记录，另议）。
- 修改 A8 既有 Review 结论或 WIN7-39 及更早候选。

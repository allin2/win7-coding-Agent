# WIN7-27 复核 F1–F4 修复追踪与交回状态

日期：2026-09-10
依据：`docs/plans/WIN7_27_ACCEPTANCE_GAPS_REPAIR_PLAN.md`、ADR-0121、A9-15 §15
基线：`32c5f6b0443a1f82eb4c24179378bca7ec954d69`（`codex/ui-optimization`）
复核报告：`/tmp/a9-w27-review-upl8xm/REVIEW.md`，反例脚本同目录 `review-probes.cjs`

结论：**本轮未完成，不得认定闭环。** 治理授权、共享投影契约与失败基线已完成并落库；F1/F2 的判定逻辑
已在开发机上实现并通过定向验证，但因 F4 所需 fixture 前提无法在当前产品边界内满足，实现整体未达到
可交付状态，已按"保留绿色提交树"原则回滚驱动侧改动。以下逐项说明可复现事实与剩余工作。

## 1. 失败基线（已复现并归档）

`env -u NODE_OPTIONS /usr/local/bin/node /tmp/a9-w27-review-upl8xm/review-probes.cjs`
输出归档：`/tmp/a9-w28-baseline/review-probes-baseline.json`（归档副本见候选外交付目录）。

在 `32c5f6b` 上逐项确认了复核全部四项缺口：

| 探针 | 结果 |
|---|---|
| 原始归档投影附件 | ACCEPTED（正确） |
| DOM `displayed_outcome` 与报告字段矛盾 | **ACCEPTED（应拒绝）** |
| DOM `latest_persisted_turn_id` 指向旧失败 | **ACCEPTED（应拒绝）** |
| DOM 文本与查询完全无关（ID/turn/类型保留） | **ACCEPTED（应拒绝）** |
| DOM 结果与 turn 字段缺失 | **ACCEPTED（应拒绝）** |
| 缺行 / 倒序 / 重复 / 跨会话（对照） | REJECTED（正确） |
| driver 文本变异 | `identityAssertionPassed=true`、`contentAssertionPassed=true`、同一负向套件全 true |

归档 smoke 观察值同时确认 F3/F4：`A9-15-APPROVAL-ORDER-BEFORE-RESUME` 的 `laterActivities` 只有
`model_chunk`（event 28），无恢复后 `tool_start`；`A9-15-OLDER-FAILURE-NEWER-SUCCESS-RESTART` 的
`olderLoad` 为 `FULL_HISTORY_ALREADY_LOADED`、`hasControl=false`、`changed=false`；无任何 retry 用例。

## 2. 逐项状态

| 缺口 | 状态 | 事实与依据 |
|---|---|---|
| F1 DOM 结果与最新 turn 身份参与判定 | 逻辑已实现，**未随候选交付** | 已实现 `parseDomExport` 强制校验 `displayed_outcome` / `latest_persisted_turn_id` / `stage`，并在 `validateInspectorProjection`、`validateOutcomeProjection` 中与查询最新终态、snapshot 独立采集的 turn 身份交叉比较；报告平行字段改为须等于附件推导值。因整体回滚，未进入提交。 |
| F2 独立推导的逐行内容核对 | 契约已交付并有定向验证，**驱动侧未交付** | 共享契约 `release/win7-product-v3/a9-projection-contract.cjs` 已提交：`expectedRowLabel` 仅由查询事实推导、`rowsMatchQuery` 为正向与负向共用的唯一判定、`rowMutationSamples` 含 `foreignContent` / `swappedText` / `wrongDetail` / `otherTurnLabel` 四类内容变异。已用真实归档 DOM 文本核对语义一致（见 §3）。 |
| F3 审批恢复顺序与四项旧要求 | **未完成** | 未新增"批准后真实执行"场景；`A9-15-DENY-ZERO-TARGET-SIDE-EFFECT` 仍只检查存在性；非零退出/工具错误/取消/清理未确认未分项；历史查询失败重试未执行。 |
| F4 真实旧事件补载 | **未完成（阻塞）** | 见 §4。`A9-15-OLDER-EVENT-PAGINATION` 在实现尝试中返回 `NO_LOAD_MORE_CONTROL`：首屏仅 111 条事件 `< 300`，产品不显示"加载更早记录"，分页动作无从发生。 |
| R4 历史 profile 协议运行回归 | **未完成** | 仍只有构建/报告级回归，无 W23/W24/W25 真实 fixture/driver 协议运行记录。 |

## 3. F2 契约的独立验证（已完成部分）

以归档真实 DOM 文本（`projection-dom-export.json`）反查共享契约的标签推导，逐类型一致：

| 事件类型 | 契约推导 | 真实 DOM 文本（剥离时间前缀） |
|---|---|---|
| `turn_started` | 任务开始 | 任务开始 |
| `turn_failed` | 任务失败 · \<error 前 120 字符\> | 任务失败 · Server returned status 503: … |
| `tool_start` | \<headline\> … | 读取 calc.ts … |
| `tool_end` | \<headline\> | 读取 |
| `turn_completed` | 任务完成 · \<outcome\> | 任务完成 · completed |
| `approval_required` | 请求批准 · \<toolName\> | 请求批准 · delete |
| `approval_resolved` | 审批已拒绝/已批准 · \<toolName\> | 审批已拒绝 · delete |
| 其他（`mode.set` 等） | 原类型字符串 | mode.set |

同一次尝试中的开发机 smoke 显示：加入内容变异后
`A9-15-INSPECTOR-ASSERTION-NEGATIVE-CHECKS` 的 `foreignContent` / `swappedText` / `wrongDetail` /
`otherTurnLabel` 四项均为 `true`（被拒绝），而基线四项对照同样为 `true` —— 即内容错绑已能被正向判定
所用的同一函数捕获。`residue` 一项首次失败，已定位为契约内探针使用了范围之内的 event ID
（`event_id: 1`），已修正为明确的外部 ID（`99999999`）；该修正随契约模块交付。

## 4. F4 阻塞点（精确诊断）

产品首屏加载最近 **300** 条事件（`a9-workbench.js`：`a9.queryEvents({ limit: 300 })`），Inspector 最多
显示最近 60 行；只有当总事件数 ≥ 306 时旧失败终态才会落在首屏之外。

尝试经真实产品链路生成足量事件：5 个批量轮次，每轮请求 26 次 `read` 工具往返。实测每轮仅产生
**9 条事件**（1 `turn_started` + 4 `tool_start` + 4 `tool_end`），即每轮实际只执行 **4 次工具调用**，
与请求的 26 次不符。5 轮后总计 100 条事件，仍远低于 306。

最可能原因：批量轮次每轮都请求**完全相同**的工具调用（`read calc.ts`），产品的 agent loop 对重复
相同调用存在守卫/去重，在第 5 次左右终止该轮。**这不是产品缺陷，而是 fixture 设计问题。**

下一步（最小改动，无需产品改动）：让批量轮次的每次工具调用携带**递增且合法**的参数，例如
`search` 使用 `pattern: 'probe-<i>'`，使调用不再重复；或改为 30+ 个轮次 × 4 次调用。修正后需重新验证
`firstPageHasMore=true` 且旧失败不在首批，再执行真实"加载更早记录"。

## 5. 未满足的方案要求（不得宣称已完成）

- F1/F2 未进入提交，因此无法作为候选证据；驱动器内 `MAX_ARGS_FIELD` 等常量在 renderer 求值字符串中
  一度未插值（已定位并修正），说明该路径必须重新跑通后才能声称可信。
- F3 四项子场景与 F4 分页均无正向执行证据；清理未确认（`residueRisk`）与历史查询故障两项缺乏安全接缝，
  按要求应记 `NOT_PERFORMED` 并单列最小测试侧方案与所需授权。
- WIN7-28 的 lock / kit / integrity / report / smoke / CMD / 验收说明与双干净构建**均未建立**。
- 外部独立放行与普通用户非提升 Win7 验收**未执行**；`WIN7_28_NOT_PERFORMED` 保持。

## 6. 本轮已交付内容

- `docs/DECISIONS.md`：ADR-0121（修复范围与 WIN7-28 新候选授权）。
- `docs/tasks/A9_15_UI_PROGRESS_FEEDBACK.md`：§15（范围/可观察成功条件/允许路径/边界/用例）。
- `docs/tasks/README.md`、`docs/STATUS.md`、`release/win7-product-v3/README.md`：阶段与候选登记。
- `release/win7-product-v3/a9-projection-contract.cjs`：共享投影契约模块（driver 与报告器共用同一
  行判定与期望标签推导；投影附件 schema v2 常量；含内容类负向变异样本）。
- 本文件与失败基线归档。
- 未改动的既有能力：WIN7-25/26/27 冻结产物、驱动与 smoke 均已回滚到 `32c5f6b` 状态，测试树保持绿色。

自检结论：`BLOCKED_PENDING_FIXTURE_FOR_F4`。不得写"已由独立模型验收"或任何 Win7/Alpha/RC PASS。

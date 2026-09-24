# 方案与交接索引

本目录存放实现方案、候选合同提案、修复交接书和设计参照。方案不构成实现授权；授权只来自
`docs/tasks/*.md` 中状态为 `APPROVED_FOR_IMPLEMENTATION` 的任务书（AGENTS.md C14）。

文件保持原路径，不移入归档子目录：既有 Accepted ADR 与任务书按路径引用这些文件，而
Accepted ADR 正文不得改写。下表“当前处置”为 2026-09-24 整理时的结论，当前状态以
[STATUS.md](../STATUS.md) 为准。

## 进行中或仍有效

| 文件 | 文档自述状态 | 当前处置 |
|---|---|---|
| [A9_19_WIN7_37_REISSUE_PROPOSAL.md](A9_19_WIN7_37_REISSUE_PROPOSAL.md) | `APPROVED_FOR_IMPLEMENTATION` | A9-19 / WIN7-37 换发合同（ADR-0136），实施中 |
| [A9_19_WIN7_37_ACCEPTANCE_HANDOFF.md](A9_19_WIN7_37_ACCEPTANCE_HANDOFF.md) | `DRAFT_PENDING_CANDIDATE` | A9-19 Win7 实机验收交接书（外部执行模型执行 §4–§7，审核方复核）；待 WIN7-37 换发合同批准与候选冻结后启用 |
| [WIN7_MEMORY_BASELINE_MEASUREMENT_PLAN.md](WIN7_MEMORY_BASELINE_MEASUREMENT_PLAN.md) | `IMPLEMENTED`（测量工具，非验收任务书） | 仍有效：配套脚本 `scripts/mvp_acceptance/a9_win7_memory_baseline.ps1`；Win7 采样未执行 |
| [A9_16_UI_ZCODE_REFERENCE_SUGGESTIONS.md](A9_16_UI_ZCODE_REFERENCE_SUGGESTIONS.md) | `SUGGESTION_INPUT_ONLY` | A9-16 U01–U07 已据此实现；Review/Shell streaming 后续设计仍可参照 |
| [a9-16-ui-demo/](a9-16-ui-demo/index.html) | 静态演示 | A9-16 设计输入，保留 |

## 已完成（历史记录）

| 文件 | 文档自述状态 | 当前处置 |
|---|---|---|
| [A9_16_WIN7_36_REISSUE_PROPOSAL.md](A9_16_WIN7_36_REISSUE_PROPOSAL.md) | `APPROVED_FOR_IMPLEMENTATION`（2026-09-23） | 已执行：WIN7-36 取得 UI 子集 PASS（ADR-0133） |
| [WIN7_29_CANDIDATE_CONTRACT_PROPOSAL.md](WIN7_29_CANDIDATE_CONTRACT_PROPOSAL.md) | `PROPOSAL_NOT_FROZEN` | 已被 ADR-0125 冻结的 WIN7-29 取代；该候选判定为构建缺陷 |
| [UI_PROGRESS_IMPLEMENTATION_PLAN.md](UI_PROGRESS_IMPLEMENTATION_PLAN.md) | `READY_FOR_ASSIGNMENT` | 已由 A9-15 实施，WIN7-28 UI 集成 PASS |
| [ui-progress-reference/](ui-progress-reference/UI-DESIGN-V2.md) | 设计参照 | A9-15 设计输入，保留 |
| [WIN7_25_VALIDATION_GAP_REPAIR_PLAN.md](WIN7_25_VALIDATION_GAP_REPAIR_PLAN.md) | 修复方案 | 已由后续候选收口 |
| [WIN7_27_ACCEPTANCE_GAPS_REPAIR_PLAN.md](WIN7_27_ACCEPTANCE_GAPS_REPAIR_PLAN.md) | `PROPOSED_FOR_ASSIGNMENT` | 已由后续候选收口 |

### WIN7-28 交接链

三份文件依次衔接、内容不重复，按顺序阅读：

1. [WIN7_28_REPAIR_HANDOFF.md](WIN7_28_REPAIR_HANDOFF.md)：`55d9d5f` 独立复核后的 5 项修复目标（`HANDOFF_FOR_ASSIGNMENT`）。
2. [WIN7_28_REPAIR_HANDOVER.md](WIN7_28_REPAIR_HANDOVER.md)：上一份的执行交接单，记录已修复项、剩余项与下一步命令。
3. [WIN7_28_FOLLOWUP_REPAIR_HANDOFF.md](WIN7_28_FOLLOWUP_REPAIR_HANDOFF.md)：第二次续修交接与独立验收约定。

结果：WIN7-28 取得 A9-15 UI 集成 PASS（见 [收口报告](../reports/2026-09/a9_win7_28_ui_integration_closeout_2026-09-11.md)）。

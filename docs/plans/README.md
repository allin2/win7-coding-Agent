# 方案与交接索引

本目录存放实现方案、候选合同提案、修复交接书和设计参照。方案不构成实现授权；授权只来自
`docs/tasks/*.md` 中状态为 `APPROVED_FOR_IMPLEMENTATION` 的任务书（AGENTS.md C14）。

文件保持原路径，不移入归档子目录：既有 Accepted ADR 与任务书按路径引用这些文件，而
Accepted ADR 正文不得改写。下表“当前处置”为 2026-09-24 整理时的结论，当前状态以
[STATUS.md](../STATUS.md) 为准。

## 进行中或仍有效

| 文件 | 文档自述状态 | 当前处置 |
|---|---|---|
| [A9_ALPHA2_DELIVERY_SEQUENCE.md](A9_ALPHA2_DELIVERY_SEQUENCE.md) | 顺序与历史裁决 | 2026-10-01 追加第一批/W42 收尾及第二批候选编号说明；不构成实现授权 |
| [A9_BATCH_2_ACCEPTANCE_COVERAGE.md](A9_BATCH_2_ACCEPTANCE_COVERAGE.md) | `DRAFT_PLANNING_ONLY` | 第二批候选与 Alpha 2 需求覆盖台账；不生成任何 PASS |
| [A9_BATCH_2_INCREMENTAL_VALIDATION.md](A9_BATCH_2_INCREMENTAL_VALIDATION.md) | `DRAFT_READY_FOR_REVIEW` | 精确继承、受影响必跑项、真实桌面自动化与失败恢复合同 |
| [A9_BATCH_2_IMPLEMENTATION_APPROVAL.md](A9_BATCH_2_IMPLEMENTATION_APPROVAL.md) | `READY_FOR_OWNER_REVIEW_NOT_APPROVED` | A9-30收口登记25路径及A9-31具体实现批准材料；构建与候选各自审批 |
| [A9_33_REHEARSAL_AND_EXECUTION_APPROVAL_DRAFT.md](A9_33_REHEARSAL_AND_EXECUTION_APPROVAL_DRAFT.md) | `DRAFT_FOR_OWNER_REVIEW` | A9-33 预演与正式执行批准材料草案：八项绑定、预算、远端动作闭集；不是授权 |
| [A9_33_WIN7_43_ACCEPTANCE_HANDOFF.md](A9_33_WIN7_43_ACCEPTANCE_HANDOFF.md) | `FORMAL_EXECUTED_REVIEW_P1_PENDING_OWNER` | A9-33 / WIN7-43 正式实机验收交接书：冻结候选身份、关口 A、正式运行结果（10 阶段全 PASS）、codex 复核结论（1 个 P1，待负责人裁决）；不是授权 |
| [A9_33_WIN7_45_ACCEPTANCE_HANDOFF.md](A9_33_WIN7_45_ACCEPTANCE_HANDOFF.md) | `FORMAL_EXECUTED_REVIEW_P1_PENDING_OWNER` | 实机执行、回收与独审已结束；25用例/43断言PASS。负责人要求KL-12延期修复，P1/NOT_PERFORMED保留；§11备妥限定范围的待签口径，门B未签 |
| [A9_ALPHA2_GAP_DISPOSITION.md](A9_ALPHA2_GAP_DISPOSITION.md) | `DRAFT_FOR_OWNER_REVIEW` | 完整 Alpha 2 缺口处置表（17 行）；第二批通过只关闭其中 4 行；不批准继承 |
| [A9_HELPER_V3_STREAMING_PROTOCOL.md](A9_HELPER_V3_STREAMING_PROTOCOL.md) | `APPROVED_FOR_A9_30 / A9_31_RELEASE_DRAFT` | A9-30/ADR-0150 已批准；后台 release 及 A9-31/A9-32 仍待批准，模拟 Demo 不构成产品证据 |
| [A9_22_WIN7_38_ACCEPTANCE_HANDOFF.md](A9_22_WIN7_38_ACCEPTANCE_HANDOFF.md) | `DRAFT_READY_FOR_FREEZE` | A9-22 / WIN7-38 Win7 实机验收交接书（外部执行模型执行，审核方复核，负责人签发与裁决） |
| [A9_19_WIN7_37_REISSUE_PROPOSAL.md](A9_19_WIN7_37_REISSUE_PROPOSAL.md) | `APPROVED_FOR_IMPLEMENTATION` | A9-19 / WIN7-37 换发合同（ADR-0136），已完成：WIN7-37 于 2026-09-25 签发 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS` |
| [A9_19_WIN7_37_ACCEPTANCE_HANDOFF.md](A9_19_WIN7_37_ACCEPTANCE_HANDOFF.md) | `CLOSED` | A9-19 Win7 实机验收交接书（外部执行模型执行，审核方复核；含补跑附录 A/B 与报告校验附录 C）；2026-09-25 签发后关闭 |
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

- [A9-30 开发机收口交接包](A9_30_DEVELOPER_CLOSEOUT_HANDOFF.md)：DEVELOPER_VERIFIED，v26双构建/重锁、新开发包与Win10受影响交互及最终独立复核完成；[裁决](../reports/2026-10/a9_30_developer_closeout_decision_2026-10-02.md)，Win7 NOT_PERFORMED。

- [A9-31源码交接与构建前置](A9_31_IMPLEMENTATION_HANDOFF.md)：批准范围内本地实现，精确差异提交待具体批准；不等于开发机/Win7收口。

A9-32 交互说明：[主动继续 Demo](a9-32-explicit-continue-demo/index.html)，演示非验收证据。

开发机文档与只读分析，绑定 d8fd760a…（2026-10-12）：[D1 生产者缺口](../reports/2026-10/a9_33_producer_gap_analysis_2026-10-12.md)、[D2 批准请求](../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#6-a9-33-批准请求包2026-10-12)、[D3 已知限制](../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#71-已知限制后续再修2026-10-12)。A9-33 保持 DRAFT_READY_FOR_REVIEW。
[D4 独立审核交接](../reports/2026-10/a9_32_independent_review_handoff_2026-10-12.md)、[D5 待裁决](../reports/2026-10/a9_32_owner_decisions_2026-10-12.md)；F5/ADR-0189 待负责人确认，真实 Electron/Win10/Win7/指定独立审核 NOT_PERFORMED。

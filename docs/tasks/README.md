# 任务书索引

## 当前任务

| 任务书 | 类型 | 状态 | Phase-Gate | Win7 验证 |
|--------|------|------|------------|-----------|
| [PHASE_03](PHASE_03_MODEL_GATEWAY.md) | FORMAL_PHASE | APPROVED_FOR_IMPLEMENTATION | APPROVED_FOR_IMPLEMENTATION | NOT_PERFORMED |
| [PHASE_04](PHASE_04_WORKSPACE_WRITE.md) | FORMAL_PHASE | APPROVED_FOR_IMPLEMENTATION | APPROVED_FOR_IMPLEMENTATION | NOT_PERFORMED |
| [PHASE_05](PHASE_05_STATE_AUDIT.md) | FORMAL_PHASE | APPROVED_FOR_IMPLEMENTATION | APPROVED_FOR_IMPLEMENTATION | NOT_PERFORMED |
| [PHASE_06](PHASE_06_AGENT_CORE_RUNNER.md) | FORMAL_PHASE | APPROVED_FOR_IMPLEMENTATION | APPROVED_FOR_IMPLEMENTATION | NOT_PERFORMED |
| [PHASE_07](PHASE_07_DESKTOP_SHELL.md) | FORMAL_PHASE | APPROVED_FOR_IMPLEMENTATION | APPROVED_FOR_IMPLEMENTATION | NOT_PERFORMED |
| [SPIKE_01](SPIKE_01_WIN7_RUNTIME_BASELINE.md) | SPIKE | APPROVED_FOR_IMPLEMENTATION | N/A (SPIKE) | NOT_PERFORMED |
| [SPIKE_02](SPIKE_02_TERMINAL_CONTAINMENT.md) | SPIKE | APPROVED_FOR_IMPLEMENTATION | N/A (SPIKE) | NO_GO_INTERACTIVE_WINPTY; WIN7_PASS_FOR_LOW_RISK_NONINTERACTIVE_RUNNER |
| [SPIKE_03](SPIKE_03_GIT_ADAPTER.md) | SPIKE | APPROVED_FOR_IMPLEMENTATION | N/A (SPIKE) | NOT_PERFORMED |
| [SPIKE_04](SPIKE_04_STORAGE_INDEX.md) | SPIKE | APPROVED_FOR_IMPLEMENTATION | N/A (SPIKE) | WIN7_PASS |
| [INTEGRATION_01](INTEGRATION_01_ROBUSTNESS_HARDENING.md) | INTEGRATION_HARDENING | APPROVED_FOR_IMPLEMENTATION | IMPLEMENTED_FOR_A3R_SLICE | A3_REAL_MODEL_PUBLIC_NETWORK_PASS |
| [INTEGRATION_02](INTEGRATION_02_WIN7_NONINTERACTIVE_EXECUTION.md) | INTEGRATION_HARDENING | APPROVED_FOR_IMPLEMENTATION | COMPLETE | A4_D013_A5_T05_AND_H3_WIN7_PASS |
| [INTEGRATION_03](INTEGRATION_03_A4_A6_A5_CLOSEOUT.md) | INTEGRATION_CLOSEOUT | COMPLETE | A7_GATE_PASS_FOR_WIN7_V1_RC | NO_NEW_WIN7_EXECUTION |
| [RC_01](RC_01_WIN7_RELEASE_CANDIDATE.md) | RELEASE_CANDIDATE | COMPLETE | RC_PASS | PASS |
| [A8](A8_AGENT_FIRST_PRODUCT_EXPERIENCE.md) | PRODUCT_EXPERIENCE | APPROVED_FOR_IMPLEMENTATION | A8_IMPLEMENTATION_AUTHORIZED | NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE |
| [A9](A9_TRUSTED_AGENT_RUNTIME.md) | PRODUCT_RUNTIME | APPROVED_FOR_IMPLEMENTATION | A9_07_IN_PROGRESS | WIN7_10_REVIEW_FAIL_PRESERVED_RESUME_AT_J4 |
| [DOCS_01](DOCS_01_DOCUMENTATION_BASELINE.md) | DOCUMENTATION_GOVERNANCE | APPROVED_FOR_IMPLEMENTATION | READY_FOR_REVIEW | N/A |
| [MVP_01](MVP_01_WIN7_REAL_MACHINE_ACCEPTANCE.md) | MVP_ACCEPTANCE_HARDENING | MVP_ACCEPTED_WITH_DEFERRALS | MVP_ACCEPTED | OWNER_ACCEPTED_FOR_MVP |
| [PROTOTYPE](PROTOTYPE_FULL_AGENT_SKELETON.md) | ARCHITECTURE_PROTOTYPE | APPROVED_FOR_IMPLEMENTATION | APPROVED_FOR_IMPLEMENTATION | N/A |

> SPIKE 任务书只按正式证据同步验证状态。SPIKE_02 的受限结论只开放低风险非交互 Runner；A7 已完成该 Profile 的 RC 装配和验收。交互 winpty、网络隔离、任意 Shell、高风险及未知 Profile 继续 fail-closed。MVP 独立实测结果见 `validation/README.md`、`docs/STATUS.md` 和 `docs/status/latest-validation.json`，不会把 MVP 证据冒充正式任务 Gate。

> A7 已以非快进整合进入 main；任务状态为 `COMPLETE / RC_PASS / Win7 PASS`。
> 该结论只适用于 manifest 锁定的唯一 RC，不开放交互 winpty、任意 Shell、高风险或未知 Profile。

> A8 以负责人确认的 Agent-first 产品需求合同 v1 为唯一产品体验输入，从干净 main 单独启动
> `0.2.0-alpha.1`。A8 不修改或继承 A7 RC 的产品 PASS；完成开发机、Win10、Win7 新候选三层验收前，
> 仍不得写成 `COMPLETE / A8_RC_PASS`。A8-00 已按
> [`A8-00 冻结合同`](../prds/A8_00_PRODUCT_ARCHITECTURE_AND_DATA_CONTRACT.md)取得文档 Gate PASS；
> A8-01 已取得 `A8_01_CONVERSATION_PASS`；A8-02 已取得
> `A8_02_WORKSPACE_SESSION_CONTEXT_PASS`；A8-03 已取得 `A8_03_REVIEW_APPLY_PASS`；A8-04 已取得
> `A8_04_RUNNER_TERMINAL_BROWSER_SETTINGS_DIAGNOSTICS_PASS`；A8-05 已取得
> `A8_05_PERSISTENCE_RECOVERY_MIGRATION_PASS`；当前串行阶段 A8-06 已达到
> `A8_DEVELOPER_COMPLETE_VALIDATION_READY / A8_06_PACKAGE_AND_VALIDATION_READY`，状态为
> `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE`；Review 准备区进度见
> [`a8_03_review_staging_progress_2026-08-20.html`](../reports/2026-08/a8_03_review_staging_progress_2026-08-20.html)，真实 Electron 移交入口见
> [`a8_03_electron_review_validation_handoff_2026-08-21.html`](../reports/2026-08/a8_03_electron_review_validation_handoff_2026-08-21.html)。A8-04 边界 Gate 与执行包见
> [`a8_04_terminal_browser_settings_gate_2026-08-21.html`](../reports/2026-08/a8_04_terminal_browser_settings_gate_2026-08-21.html) 和
> [`a8-04-boundary-validation-kit-20260821.json`](../status/a8-04-boundary-validation-kit-20260821.json)。A8-05 持久化 Gate 与锁定执行包见
> [`a8_05_persistence_recovery_migration_gate_2026-08-21.html`](../reports/2026-08/a8_05_persistence_recovery_migration_gate_2026-08-21.html) 和
> [`a8-05-persistence-validation-kit-20260821.json`](../status/a8-05-persistence-validation-kit-20260821.json)。A8-06 打包检查点与外部执行包见
> [`a8-06-developer-checkpoint-20260821.json`](../status/a8-06-developer-checkpoint-20260821.json) 和
> [`a8-06-package-validation-kit-20260821.json`](../status/a8-06-package-validation-kit-20260821.json)；这些 Gate 只表示开发机候选和验收准备完成，不代表 A8 三层产品验收通过。

> A9 由 ADR-0089、ADR-0096 和负责人确认的
> [`Windows 7 Trusted Coding Agent 产品需求合同 V1`](../prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md)
> 授权，从最新干净 A8 代码基线创建 `codex/a9-trusted-agent-runtime`，目标版本 `0.3.0-alpha.1`。
> A9 复用 A8 UI/Core/State/打包资产，但采用可信工作区 Full Access、通用 PowerShell/CMD Shell、直接文件
> 写入、真实 Git 和开放 OpenAI-compatible Provider。A8 的历史证据保持不变且不构成 A9 PASS。
> A9-00 已取得 `A9_00_DESIGN_AND_GAP_PASS`；A9-01～A9-06 开发机 Gate 已完成，包含真实 Provider、
> 真实模型 J1～J3、真实 Git/SQLite 副作用旅程和 Electron 22 三进程 38/38。A9-07 现为
> `IN_PROGRESS`：提交 `dce391c` 修复 Electron ASAR 虚拟文件系统造成的物理哈希假失败；新候选
> `37c3e51c…60080` 已在 Win7 独立 `WIN7-03` 证据目录通过 Gate 3 完整性。Win7 Gate 4～10、Win10 与
> `A9_ALPHA1_PASS` 均为 `NOT_PERFORMED`。随后 WIN7-10 在 Gate 4 取得 Full Access/Read Only 局部 PASS，
> 但 Review 因无 staging 后端正式 FAIL；证据保持原样、不追溯改判。ADR-0096 将 Alpha 1 收敛为
> Full Access + Read Only，并将 Review 移入 `0.3.0-alpha.2`。该文档范围调整不改变 WIN7-10 字节，故
> 不要求重打包或重跑已完成的同候选项目；现场从 J4 继续。J1～J3 的外置证据仍须补齐，所有剩余硬门槛
> 完成前 Alpha 1 不得签发 PASS。

MVP-20260802-14 已由项目负责人按 ADR-0055 以 `OWNER_ACCEPTED_FOR_MVP` 收口，并完成真实 Electron 产品入口的启动、Renderer 诊断和正常退出实测；延期项不改变各正式任务状态，也不解除 Phase 1/2、SPIKE_02/04 或 E7 的正式 Gate。

## 待 Win7 验收

| 任务书 | 说明 |
|--------|------|
| [PHASE_01](PHASE_01_CAPABILITY_PROBE.md) | 待 Win7 E1/E2 验收 |
| [PHASE_02](PHASE_02_READONLY_CODE_ANALYSIS.md) | 待 Win7 实机验收 |

## 生命周期目录

- `completed/`：已完成且不再实施的任务书。
- `superseded/`：被新任务或 ADR 取代的任务书。

任务书文件路径保持稳定；生命周期状态通过元数据和本索引表达，不通过目录移动表达。

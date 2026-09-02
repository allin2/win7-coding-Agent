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
| [A9](A9_TRUSTED_AGENT_RUNTIME.md) | PRODUCT_RUNTIME | COMPLETE | A9_ALPHA1_PASS | WIN7_19_GO_FOR_ALPHA |
| [A9-08](A9_08_POST_REVIEW_HARDENING.md) | PRODUCT_HARDENING | APPROVED_FOR_IMPLEMENTATION | FIX_BEFORE_ALPHA | WIN7_20_NOT_PERFORMED |
| [A9-09](A9_09_D013_TRUSTED_SHELL_PROFILE.md) | NATIVE_RUNTIME_HARDENING | APPROVED_FOR_IMPLEMENTATION | A9_09B_READY_FOR_WIN10_DOUBLE_BUILD | WIN7_20_NOT_PERFORMED |
| [A9-10](A9_10_TEXT_READ_HARDENING.md) | PRODUCT_HARDENING | APPROVED_FOR_IMPLEMENTATION | A9_10_DEVELOPER_VERIFIED_PENDING_WIN7 | WIN7_20_NOT_PERFORMED |
| [A9-11](A9_11_POST_V25_USABILITY_SECURITY_HARDENING.md) | PRODUCT_HARDENING | APPROVED_FOR_IMPLEMENTATION | A9_11_DEVELOPER_VERIFIED_PENDING_WIN7 | WIN7_20_NOT_PERFORMED |
| [A9-12](A9_12_POST_REVIEW_RECOVERY_AND_UI_HARDENING.md) | PRODUCT_HARDENING | APPROVED_FOR_IMPLEMENTATION | A9_12_DEVELOPER_VERIFIED_PENDING_WIN7 | WIN7_20_NOT_PERFORMED |
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
> A9-09 按 ADR-0102/0103 绑定 Win10 原始返回证据、完整闭包及 clean-HEAD 批准清单；候选外信任根
> P1 已按 ADR-0104 增加独立批准 pin、正式锁和 PE 结构验证，五参数文档 P2 也获独审关闭；最新复审新增
> 已知秘密值/NODE_* 漏拦两项 P1，ADR-0105 整改已获独审关闭；该轮新增的生成器/有序字典两项构建
> 脚本 P1 已按 ADR-0106 本地修复，待再次独审及 Windows PowerShell 5.1 自测。
> 当前批准清单仍未提交，故生产记录保持 fail-closed，阶段仍为 `FIX_BEFORE_ALPHA`。
> A9 复用 A8 UI/Core/State/打包资产，但采用可信工作区 Full Access、通用 PowerShell/CMD Shell、直接文件
> 写入、真实 Git 和开放 OpenAI-compatible Provider。A8 的历史证据保持不变且不构成 A9 PASS。
> A9-00～A9-06 开发机 Gate 已完成；A9-07 最终候选 WIN7-19 来自干净提交
> `781b20e3da277570f85c28286d7ea5bbbdd5fa28`，双构建字节一致，并在 Windows 7 SP1 x64 完成候选身份、
> 5/5 完整性、正式 Electron 生命周期、审批 P0 增量复验和后飞行。四个新 Turn 的审批身份均不同，拒绝
> 与变更目标零执行，快速重复点击只执行一次；无 P0/P1。其余七组未受影响能力按 ADR-0097 使用可追溯
> 继承证据，WIN7-10 Review FAIL 仍保留并按 ADR-0096 延期到 Alpha 2。ADR-0099 已签发
> `A9_ALPHA1_PASS / GO_FOR_ALPHA`；Win10 同候选 smoke 仍须在 RC 前补齐。

> ADR-0100 保留 WIN7-19 与 ADR-0099 的历史现场事实，同时根据合并前独立代码审查开启 A9-08。
> 当前综合状态为 `FIX_BEFORE_ALPHA`，按审批/IPC、秘密/Provider/TLS、进程和 checkpoint/迁移四批修复；
> 全量验证、第二轮独审和 WIN7-20 增量实机复验通过前，PR #3 不得合并。

> A9-08 授权范围内修复、1482 项开发机验证和三路独立复核已通过；ADR-0101/A9-09 保留 v24 历史
> Profile，并已在提交 `7d10032` 完成 v25/协议 v2/Current-User Profile、产品装配、锁定双构建记录器和
> WIN7-20 增量套件。A9-09A 原生逻辑、发布测试、7 模块 1490 tests 及 docs/diff 检查通过；当前为
> 旧 r4～r10 套件继续保持撤销；r11 两次全新 Win10 构建全部 PASS 且 helper 字节一致，正式 v25
> input lock 已生成，当前为 `A9_09B_WIN10_DOUBLE_BUILD_PASS_INPUT_LOCKED`。
> 产品装配与 WIN7-20 实机复验未完成前，
> 状态仍为 `FIX_BEFORE_ALPHA`。

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

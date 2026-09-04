# 验收与审计报告

本目录存放项目验收、审计和架构评估报告，按年月组织。

报告是不可变时间点证据，不是当前项目状态的唯一来源。每份报告应能追溯到基线 commit、执行环境和生成日期；最新状态见 [../STATUS.md](../STATUS.md)。

## 2026-08

| 报告 | 日期 | 类型 |
|------|------|------|
| [A9 Alpha 1 WIN7-19 收口报告](2026-08/a9_alpha1_win7_19_closeout_2026-08-28.md) | 08-28 | WIN7-19 候选身份、审批 P0 增量复验、ADR-0097 继承证据、P2/延期项与 `GO_FOR_ALPHA` 裁决 |
| [a8_06_candidate_provenance_reissue_2026-08-21](2026-08/a8_06_candidate_provenance_reissue_2026-08-21.html) | 08-21 | A8-06 从远端可达源码提交重新签发候选：两次确定性构建、schema v2 smoke、普通证据提交与旧不可达候选取代关系 |
| [a8_06_independent_review_followup_2026-08-21](2026-08/a8_06_independent_review_followup_2026-08-21.html) | 08-21 | A8-06 后续独立审查五项发现逐条复核：运行阻断已关闭，补齐 validation 相对模块闭包测试与 schema v1 surrogate/schema v2 正式证据分层 |
| [a8_06_validation_repair_2026-08-21](2026-08/a8_06_validation_repair_2026-08-21.html) | 08-21 | A8-06 独立复核修复：Electron ABI 110 执行、evidence schema v2、完整 manifest/同一候选绑定、dirty candidate fail-closed 与干净候选重建 |
| [a8_06_package_validation_ready_2026-08-21](2026-08/a8_06_package_validation_ready_2026-08-21.html) | 08-21 | A8-06 独立输入哈希闭包、确定性 ZIP、manifest/SBOM/许可证、A8-03/A8-04/A8-05 验证包与生命周期模板；开发机候选完整性 PASS，Win10/Win7/RC 未执行 |
| [a8_04_terminal_browser_settings_gate_2026-08-21](2026-08/a8_04_terminal_browser_settings_gate_2026-08-21.html) | 08-21 | A8-04 Runner/Terminal/Browser/Settings/Diagnostics 开发机实现 Gate：8-case 真实 Electron surrogate、CSP/Preload/IPC/RunnerLog 边界；只解除 A8-05，不构成三层或 RC PASS |
| [a8_05_persistence_recovery_migration_gate_2026-08-21](2026-08/a8_05_persistence_recovery_migration_gate_2026-08-21.html) | 08-21 | A8-05 持久化/恢复/迁移开发机实现 Gate：结构化 SQLite seam、Review 重开漂移、活动任务中断、A7 白名单迁移与敏感值 fail-closed；只解除 A8-06，不构成三层或 RC PASS |
| [a8_03_review_apply_gate_2026-08-21](2026-08/a8_03_review_apply_gate_2026-08-21.html) | 08-21 | A8-03 开发机实现 Gate：A8R-01～07/A8C-01/02 追踪、真实 Electron surrogate 8-case、1051 项回归；只解除 A8-04，不构成三层或 RC PASS |
| [a8_03_electron_review_validation_handoff_2026-08-21](2026-08/a8_03_electron_review_validation_handoff_2026-08-21.html) | 08-21 | A8-03 真实 Electron Review 的锁定执行入口、8 项矩阵、独立哈希核验与故障回收说明；执行仍为 NOT_PERFORMED |
| [A8-03 Renderer Review 交互浏览器证据](../status/a8-03-renderer-interactive-qa-20260821.json) | 08-21 | Chromium DOM/srcdoc Harness 完整 Review 旅程；Preload/IPC stub，仅部分 A8C-02 证据，不构成 Electron/Win7 Gate |
| [A8-03 Renderer 静态浏览器证据](../status/a8-03-renderer-static-qa-20260821.json) | 08-21 | 仅静态页面视口证据；1280×720 / 1024×720 无水平溢出，不构成 Electron/Win7 Gate |
| [a8_03_review_staging_progress_2026-08-20](2026-08/a8_03_review_staging_progress_2026-08-20.html) | 08-20 | A8-03 Review 准备区实现进度、需求追踪、开发机证据与未完成门禁；不构成 Gate PASS |
| [a8_03_review_staging_development_plan_2026-08-20](2026-08/a8_03_review_staging_development_plan_2026-08-20.html) | 08-20 | A8-03 多文件准备区、Review、批量应用与验证闭环开发计划；含需求追踪、WBS、关键路径、风险与 A8R Gate |
| [a8_02_workspace_session_context_gate_2026-08-20](2026-08/a8_02_workspace_session_context_gate_2026-08-20.html) | 08-20 | A8-02 工作区、多会话、Goal、上下文引用、只读代码查看器与 A8S-01～04 Gate |
| [a8_01_conversation_gate_2026-08-20](2026-08/a8_01_conversation_gate_2026-08-20.html) | 08-20 | A8-01 对话主界面、直接/计划模式、原始流审计、确定性聚合与工具卡片 Gate |
| [a8_00_design_gate_2026-08-20](2026-08/a8_00_design_gate_2026-08-20.html) | 08-20 | A8-00 信息架构、事件聚合、会话状态、多文件准备区、A7 迁移与串行测试合同 |
| [a1_a3_acceptance_closeout_2026-08-04](2026-08/a1_a3_acceptance_closeout_2026-08-04.html) | 08-04 | A1/A2 MVP、A3 受控 Gateway/公网真实模型/DPAPI 边界总览，以及 Win7 最终保留与清理记录 |
| [a3r_deepseek_public_model_acceptance_2026-08-04](2026-08/a3r_deepseek_public_model_acceptance_2026-08-04.html) | 08-04 | Desktop Alpha 3.1 DeepSeek 公网真实模型：TLS、流式、三轮只读工具、取消、脱敏与 Win7 清理 |
| [a3_controlled_gateway_acceptance_2026-08-04](2026-08/a3_controlled_gateway_acceptance_2026-08-04.html) | 08-04 | Desktop Alpha 3 受控 Gateway/TLS/SSE/CONNECT 纵向切片；Win7 W01–W15（含 A3-W13 独立审批重验） |
| [a3_w13_write_approval_acceptance_2026-08-04](2026-08/a3_w13_write_approval_acceptance_2026-08-04.html) | 08-04 | A3-W13 独立两次写入审批、撤销恢复与 Win7 SHA-256 闭环 |
| [win7_mvp_acceptance_report](2026-08/win7_mvp_acceptance_report.html) | 08-02 | Win7 MVP 实机验收、替代项与 WorkBuddy 交叉勘误 |
| [win7_remaining_constraints_acceptance_plan](2026-08/win7_remaining_constraints_acceptance_plan.html) | 08-02 | C01–C20 剩余约束覆盖矩阵、执行包、证据接口与停止条件 |
| [a4_automated_acceptance_orchestration_2026-08-05](2026-08/a4_automated_acceptance_orchestration_2026-08-05.html) | 08-05 | A4 AUTO-00～07 fail-closed 编排方案与 A4-20260805-123467 Win7 14/14 自动执行结果；独立 Gate 不计入 PASS |
| [A4-20260806-140606 补充验收审计](../../spikes/02-terminal-containment/acceptance/evidence/A4-20260806-140606/remaining-acceptance-audit.html) | 08-06 | Win7 C02 Job fail-closed、C03 Restricted Token 边界失败、C05 loopback 可达性及正式网络环境缺失分类 |
| [A7 Agent 交接快照](2026-08/A7_AGENT_HANDOFF_20260816.md) | 08-16 | A7 当前候选、v3 Windows 返回证据、RC-05 fail-closed 根因、剩余 RC 门禁与接手顺序 |

## 2026-07

| 报告 | 日期 | 类型 |
|------|------|------|
| [agent_verification_loop_audit](2026-07/agent_verification_loop_audit_2026-07-31.html) | 07-31 | 验收循环审计 |
| [agent_verification_loop_modification_plan](2026-07/agent_verification_loop_modification_plan_2026-07-31.html) | 07-31 | 修改计划 |
| [codex_benchmark_module_verification](2026-07/codex_benchmark_module_verification_2026-07-31.html) | 07-31 | 模块验证 |
| [context_engineering_acceptance](2026-07/context_engineering_acceptance_2026-07-30.html) | 07-30 | 上下文工程验收 |
| [context_engineering_modification_plan](2026-07/context_engineering_modification_plan_2026-07-30.html) | 07-30 | 修改计划 |
| [architecture_acceptance_comparison (HTML)](2026-07/win7_coding_agent_architecture_acceptance_comparison_2026-07-30.html) | 07-30 | 架构验收对比 |
| [architecture_acceptance_comparison (DOCX)](2026-07/win7_coding_agent_architecture_acceptance_comparison_2026-07-30.docx) | 07-30 | 同上 Word 版（归档） |

## 状态说明

- 2026-07-30 报告记录的是 685 项测试的历史快照。
- 2026-07-31 报告记录了后续 837、853 或 885 等不同阶段的快照。
- 这些数字不可直接合并；重新验证后应写入 `docs/status/latest-validation.json`，并绑定最终代码 commit。

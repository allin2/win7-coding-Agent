# 验收与审计报告

本目录存放项目验收、审计和架构评估报告，按年月组织。

报告是不可变时间点证据，不是当前项目状态的唯一来源。每份报告应能追溯到基线 commit、执行环境和生成日期；最新状态见 [../STATUS.md](../STATUS.md)。

## 2026-08

| 报告 | 日期 | 类型 |
|------|------|------|
| [win7_mvp_acceptance_report](2026-08/win7_mvp_acceptance_report.html) | 08-02 | Win7 MVP 实机验收、替代项与 WorkBuddy 交叉勘误 |
| [win7_remaining_constraints_acceptance_plan](2026-08/win7_remaining_constraints_acceptance_plan.html) | 08-02 | C01–C20 剩余约束覆盖矩阵、执行包、证据接口与停止条件 |

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

# 项目文档入口

本目录按“规则、决策、任务、当前状态、证据、历史资料”分层。文档只在所属层维护事实，其他页面通过链接引用。

## 阅读顺序

1. [../AGENTS.md](../AGENTS.md)：最高项目约束与实现授权规则。
2. [WIN7_CONSTRAINTS.md](WIN7_CONSTRAINTS.md)：Win7 平台红线、Runtime Profile 与依赖登记。
3. [STATUS.md](STATUS.md)：当前 Git 基线、工作项结论与阻断项；逐条历史见 [STATUS_LOG.md](STATUS_LOG.md)。
4. [PROJECT_CHARTER.md](PROJECT_CHARTER.md)、[ARCHITECTURE.md](ARCHITECTURE.md)、[ROADMAP.md](ROADMAP.md)：目标、架构和阶段顺序。
5. [tasks/README.md](tasks/README.md)：任务书索引与任务生命周期。
6. [reports/README.md](reports/README.md)：带日期的审计和验证证据。

## 文档职责

| 内容 | 唯一维护位置 |
|---|---|
| 平台约束 | `AGENTS.md`、`WIN7_CONSTRAINTS.md` |
| 架构决策 | `DECISIONS.md`（索引：`DECISIONS_INDEX.md`） |
| 当前状态 | `STATUS.md`、`status/latest-validation.json` |
| 状态时间线（历史流水） | `STATUS_LOG.md` |
| 实现授权与验收合同 | `tasks/*.md` |
| 增量构建、实机验收与发版工作规范 | [acceptance/ACCEPTANCE_AND_RELEASE_WORKFLOW.md](acceptance/ACCEPTANCE_AND_RELEASE_WORKFLOW.md) |
| 当前风险 | `ROBUSTNESS_AUDIT.md` |
| 待裁决事项 | `PENDING_CONFIRMATIONS.md` |
| 面向负责人的输出规范 | [OUTPUT_STYLE.md](OUTPUT_STYLE.md) |
| 状态词与流程名词 | [GLOSSARY.md](GLOSSARY.md) |
| 方案与交接（非授权） | `plans/`（索引：`plans/README.md`） |
| 历史证据 | `reports/YYYY-MM/` |
| 本机证据位置、本机外归档与取回 | `acceptance/EVIDENCE_ARCHIVE_RETRIEVAL.md` |
| 历史 PRD | `prds/archive/` |

历史报告是时间点快照，不覆盖当前状态；当前状态必须绑定明确的 Git commit 和执行环境。

WIN7-28 修复证据的用途、目录位置与检索方式见[本机历史修复证据索引](acceptance/EVIDENCE_ARCHIVE_RETRIEVAL.md#本机历史修复证据索引)。

## 本地治理入口（ADR-0192）

实施资格见 [任务索引](tasks/README.md)的当前工作分区。规则同步和检查结果见[统一执行记录](plans/GOVERNANCE_OPTIMIZATION_EXECUTION_RECORD.md)。

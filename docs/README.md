# 项目文档入口

本目录按“规则、决策、任务、当前状态、证据、历史资料”分层。文档只在所属层维护事实，其他页面通过链接引用。

## 阅读顺序

1. [../AGENTS.md](../AGENTS.md)：最高项目约束与实现授权规则。
2. [WIN7_CONSTRAINTS.md](WIN7_CONSTRAINTS.md)：Win7 平台红线、Runtime Profile 与依赖登记。
3. [STATUS.md](STATUS.md)：当前 Git 基线、验证状态与阻断项。
4. [PROJECT_CHARTER.md](PROJECT_CHARTER.md)、[ARCHITECTURE.md](ARCHITECTURE.md)、[ROADMAP.md](ROADMAP.md)：目标、架构和阶段顺序。
5. [tasks/README.md](tasks/README.md)：任务书索引与任务生命周期。
6. [reports/README.md](reports/README.md)：带日期的审计和验证证据。

## 文档职责

| 内容 | 唯一维护位置 |
|---|---|
| 平台约束 | `AGENTS.md`、`WIN7_CONSTRAINTS.md` |
| 架构决策 | `DECISIONS.md` |
| 当前状态 | `STATUS.md`、`status/latest-validation.json` |
| 实现授权与验收合同 | `tasks/*.md` |
| 当前风险 | `ROBUSTNESS_AUDIT.md` |
| 待裁决事项 | `PENDING_CONFIRMATIONS.md` |
| 历史证据 | `reports/YYYY-MM/` |
| 历史 PRD | `prds/archive/` |

历史报告是时间点快照，不覆盖当前状态；当前状态必须绑定明确的 Git commit 和执行环境。

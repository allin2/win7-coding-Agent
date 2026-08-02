# DOCS_01 — 文档基线与一致性检查

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: DOCUMENTATION_GOVERNANCE
Target Branch: codex/integrated-robustness
Phase-Gate: READY_FOR_REVIEW
Win7-Validation: N/A
```

## 目标

建立稳定的任务书路径、当前状态单一来源、报告快照标识和本地文档一致性检查，避免并行窗口再次覆盖共享状态。

## 允许路径

- `AGENTS.md`
- `README.md`
- `docs/**`
- `spikes/README.md`
- `spikes/*/README.md`
- `scripts/check_docs.mjs`
- 根目录 `package.json` 的文档检查脚本字段

## 验收标准

- 现行文档中的本地链接全部可解析。
- 任务书元数据完整且索引路径一致。
- 当前状态绑定明确 commit；历史报告不冒充当前状态。
- Accepted ADR 正文不被改写。
- 检查脚本不修改工作区，只返回结构化失败结果和非零退出码。

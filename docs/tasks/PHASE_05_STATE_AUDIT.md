# PHASE_05 — 状态、事件与审计任务书（STATE_AUDIT）

> 实现前必读：`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、`docs/DECISIONS.md`（ADR-0012/0026/0027）、本文档。
> 编号遵守 ADR-0012（阶段 5）。本文档为规划任务书，处于 DRAFT。

## 0. 实现授权（ADR-0011 / C14）

```
Status: DRAFT
Task Type: FORMAL_PHASE
Target Branch: phase/05-state-audit
Phase-Gate: NOT_APPROVED
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Pending PC-003 ruling and SPIKE_04 Go
```

前置：PC-003 裁决 + SPIKE_04 Go（WAL 批量写吞吐达标）。

### 0.1 路径白名单（获批后生效）

- `src/state/**`、`tests/state/**`、本文档 §13 验证记录。

禁止路径：其他阶段目录、`src/win7_agent/**`（legacy 冻结）、已 Accepted ADR 正文。

## 1. 目标

高吞吐 EventStore 与审计：WAL + 批量事务写入、背压 + 有界队列、保留与滚动清理、
任务恢复、审计导出、schema 版本化迁移。契约继承 Phase 2 §3 事件 schema 与 Replay
语义（ADR-0026/0029，逐条对账，不复制代码）。

## 2. 非目标

- 不实现 Agent 状态机（PHASE_06 消费本层）；不实现 UI 审计视图（PHASE_07）。
- 不引入外部数据库服务（SQLite 本地单文件，ADR-0027 第 7 条）。

## 3. Runtime Profile（C15）

- 运行时：Electron 内嵌 Node 16.17.1；SQLite 绑定 D-014（WAL + FTS5，SPIKE_04 锁定）。
- 库文件本地磁盘（禁网络盘，P10）；每库 `schema_version` 表。
- 吞吐目标引用 PERFORMANCE_BUDGET #6/#7（不内联数值）。

## 4. 关键机制

- **批量写入**：事件进有界队列，按批提交事务；队列满触发背压（上游节流而非丢弃）。
- **落盘策略**：关键事件（状态转移、审批、结果）同步；非关键事件可异步合并
  （SPIKE_04 No-Go 时的降级路径，须标注非等价性）。
- **保留与清理**：单库达 #7 上限滚动清理，清理不得断裂任务恢复链与审计链。
- **任务恢复**：崩溃后由事件重建任务状态；`trace_complete` 语义可判定（ADR-0026）。
- **迁移**：schema 版本化，升级迁移在 Win7 上验证；不追溯改历史 schema。

## 5. 错误模型

| 错误码 | 触发 | 处理 |
|--------|------|------|
| `EVENTSTORE_BACKPRESSURE` | 队列满 | 上游节流，不丢事件 |
| `PAYLOAD_BUDGET_EXCEEDED` | 事件载荷超预算 | 结构化不可重放结果或失败，禁止静默截断后仍声明可重放（ADR-0026） |
| `SCHEMA_MIGRATION_FAILED` | 迁移失败 | 停在旧版本，不半迁移 |
| `RECOVERY_INCONSISTENT` | 恢复时事件链断裂 | 明确报告，不猜测补全 |

## 6. 测试矩阵

- 吞吐：批量写 QPS（映射 #6）；背压触发与恢复。
- 崩溃恢复：写入中途杀进程后重建任务状态一致；`trace_complete` 判定。
- 清理：达上限滚动清理后恢复链/审计链完整（映射 #7）。
- 迁移：跨 schema 版本升级；导出格式稳定。
- 契约对账：Phase 2 事件 schema/错误码/退出码逐条覆盖。
- 静态门禁 G1~G10。

## 7. 验收（E5/E6）

- E5：干净 Win7 长会话写入-清理-恢复闭环。
- E6：中文+空格路径库文件；缺失工具不影响写入。
- Win7 实机验收前 Phase-Gate 至多 `READY_FOR_WIN7_VALIDATION`。

## 13. 验证记录（占位）

```
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Target environment unavailable
```

# A8-05 持久化、恢复与迁移合同

Status: `FROZEN_FOR_A8_05_IMPLEMENTATION`

Stage: `A8-05`

Gate: `A8_05_PERSISTENCE_RECOVERY_MIGRATION_PASS`

Source: `docs/prds/A8_00_PRODUCT_ARCHITECTURE_AND_DATA_CONTRACT.md` §3、§5、§7、§8

Decision: `ADR-0083`

## 1. 范围

A8-05 将 A8-02 的 storage-neutral Session/Goal catalog 接入锁定 D-014 SQLite 句柄，补齐版本化
实体、Review/Validation 摘要、恢复检查和 A7→A8 白名单迁移。它不新增模型、Runner、Terminal、Browser、
网络目标或自动续跑能力；恢复只重建事实/UI，并将未干净活动任务标记为 `INTERRUPTED`。

## 2. 持久化边界

- 只接受已经由 D-014 校验过的 `SqliteDatabase`；schema marker 必须是 `a8_schema_version: 1`，未知未来
  版本整体进入只读 Diagnostics，不部分读取。
- `a8_workspaces`、`a8_sessions`、`a8_goals`、`a8_turns`、`a8_tasks`、`a8_runs`、`a8_session_facts`
  保存 Session/Goal/Turn/Task/Run 与事实的结构化字段；Review/Validation 使用显式主键、revision、状态、
  三个摘要哈希和受限 payload 摘要字段。
- 每个 catalog mutation 先构造并校验下一快照，再在一个 SQLite transaction 中更新实体和事实；写入失败
  时内存 catalog 回到旧快照，不能出现“事件已写、实体未写”或反向状态。
- 所有快照、Review/Validation 摘要具有 `schemaVersion: 1`、UTF-8 JSON 大小上限和 SHA-256；已知凭据值
  在写入前阻断并只记录 `SENSITIVE_DATA_BLOCKED`。

## 3. 恢复合同

启动顺序为：schema/migration marker → catalog/entity hash 与引用 → SQLite event ledger continuity →
workspace recovery marker → 活动任务 `PLANNING | EXECUTING | VERIFYING | APPLYING` 原子转
`INTERRUPTED` → Review 目标基线重新验证。任一未知版本、JSON/DB 损坏、seq 缺口或 hash 漂移都会返回
`READ_ONLY_RECOVERY_REQUIRED`，不得只跳过坏会话继续写其他会话。

恢复不调用模型、Runner、Terminal、Browser 或 Apply；UI 只能提供查看、重新计划、重试或放弃。

## 4. A7→A8 迁移

- A7 事件库只读校验并登记为归档元数据；不导入活动 Session/Goal/Review。
- 只接受版本化工作区白名单（规范路径、显示名、最后打开时间）和非敏感设置白名单（provider/model/mode/
  Gateway URL/CA/显示偏好）；缺失输入是成功 no-op。
- API key、Authorization、代理密码、`credentials.v1.json`、WAL/SHM、临时和 Runner work 均不读取、不复制。
- 迁移使用独立 A8 数据根、唯一 lock、临时目录、fsync + 原子 rename 和 `migration-report.v1.json`；失败时
  A7 保持原样、A8 保持未初始化并保留脱敏报告，下一次可重试。

## 5. 必须通过的检查点

| ID | 必须证明 |
|---|---|
| A8P-01 | 关闭/重开 SQLite 后 Session、Goal、Turn/Task/Run 事实与 projection 一致，零自动执行 |
| A8P-02 | 活动 Task 重启原子变为 `INTERRUPTED`，无模型/Runner/Apply 调用 |
| A8P-03 | Review 恢复重新计算目标基线，漂移进入 `STALE`，Apply 继续拒绝 |
| A8P-04 | 未知 schema、损坏 JSON/DB、seq gap、实体 hash drift 整体进入只读恢复模式 |
| A8M-01 | A7 只有 EventLedger/credential file 时零工作区导入、事件只读登记、凭据零命中 |
| A8M-02 | 合法 workspace/settings fixture 只导入白名单，marker/report/hash 一致 |
| A8M-03 | 未知 source、篡改 source、迁移中断保持 A7 不变、A8 无半迁移状态且可重试 |
| A8C-01 | 已知 secret 与字段名在 DB、Review、Validation、migration report 前阻断 |

开发机 Gate 只解除 A8-06 实现准备；Electron 22.3.27、Win10、Win7 和最终 RC 仍需同一候选执行。

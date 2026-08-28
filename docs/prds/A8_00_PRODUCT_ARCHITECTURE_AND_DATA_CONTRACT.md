# A8-00 — 产品信息架构、事件、会话、准备区与迁移合同

Status: `FROZEN_FOR_A8_01`

Gate: `A8_00_DESIGN_PASS`

Frozen-At: `2026-08-20`

Target-Version: `0.2.0-alpha.1`

Source-PRD: `docs/prds/WIN7_AGENT_FIRST_PRODUCT_REQUIREMENTS_V1.md`

Source-Task: `docs/tasks/A8_AGENT_FIRST_PRODUCT_EXPERIENCE.md`

Decision: `ADR-0075`

本合同是 A8-01～A8-05 的实现输入。它冻结信息架构、标识关系、事件聚合、会话与任务状态、
多文件准备区、数据迁移和测试口径；若实现需要改变字段、状态、聚合关闭条件、迁移白名单或审批绑定，
必须先新增 ADR，并把 A8-00 Gate 重新置为待复审。A8-00 不交付应用代码，也不继承 A7 的产品 PASS。

## 1. 范围、现状证据与非目标

### 1.1 A8-00 交付范围

| ID | 交付 | 冻结结论 |
|----|------|----------|
| IA-01 | 日常产品信息架构 | 左侧工作区/会话/Goal，中间对话，右侧按需检查器；工作区四标签与两个全局入口 |
| EV-01 | 原始事件与展示投影 | 原始 V2 事件不可变；展示投影可重建、无副作用、不是审计事实 |
| EV-02 | 流式聚合 | 只聚合连续的 `gateway.delta`；键、顺序、关闭条件和上限见 §4 |
| SS-01 | 会话、任务与恢复状态 | 版本化实体、单前台任务、异常退出转 `INTERRUPTED`、不自动续跑 |
| RV-01 | 多文件准备区与 Review | 逐文件决定，显式批量应用，目标清单哈希与一次性审批精确绑定 |
| MG-01 | A7 → A8 迁移 | 独立数据根；只迁移白名单内的工作区列表和非敏感设置；旧事件只读归档 |
| TM-01 | A8-01～A8-05 测试矩阵 | 确定性正向、负向、损坏、漂移、凭据与恢复用例 |

### 1.2 现状证据

- `src/state/src/event-protocol.ts` 已定义 schema version 2 的不可变事件、Thread 内连续 `seq`、
  幂等 `eventId` 和可重建投影。
- `src/state/src/sqlite-event-ledger.ts` 已实现 D-014 的本地 SQLite/WAL、事件指纹、64 KiB 单事件、
  100,000 条容量与序列缺口失败关闭；物理表名仍为 `rc_events_v2`。
- `src/core/src/runtime-types.ts` 已区分 `sessionId/threadId/turnId/taskId/runId`，但产品会话与 Review
  还没有完整持久化合同。
- `src/workspace/src/plan.ts` 与 `apply.ts` 已具备多文件计划、基线 SHA-256、备份、原子替换、验证与
  故障回滚；A8 需要在其前面增加准备区、逐文件决定和精确批量审批。
- `src/shell/product/desktop-host.js` 的 Session catalog 仍是进程内 `Map`；A7 SQLite 只证明审计事件
  跨重启，不证明完整会话恢复。
- `src/shell/product/renderer/event-queue.js` 只做事件去重、顺序和有界队列，尚未把 Gateway delta
  合并成连续 Assistant 消息。

### 1.3 非目标

A8-00 不授权或设计绕过任意 Shell、Git 写操作、Agent 控制的用户终端、多 Agent、后台并发队列、
任意网页自动化、插件市场、自动更新、未登记模型、高风险 Runner 或无审批写入。准备区不是工作区，
展示投影不是审计账本，迁移也不是把 A7 数据原地升级为 A8。

## 2. 信息架构合同

### 2.1 页面骨架

```text
┌──────────────┬────────────────────────────────────┬──────────────────────┐
│ 工作区/会话  │ Agent · Review · Terminal · Browser│ 按需检查器           │
│              ├────────────────────────────────────┤ Code / References    │
│ 工作区切换   │ 当前模型 · 连接状态 · 直接/先计划  │ Change / Validation  │
│ 会话列表     │                                    │                      │
│ 当前 Goal    │ 用户 / Assistant 连续对话          │ 默认关闭，不占主流程 │
│              │ 计划/工具/测试/审批/错误卡片       │                      │
│ Settings     │                                    │                      │
│ Diagnostics  │ 输入框 · 上下文 · 提交/停止        │                      │
└──────────────┴────────────────────────────────────┴──────────────────────┘
```

### 2.2 导航与职责

| 区域 | 默认内容 | 可执行动作 | 明确禁止 |
|------|----------|------------|----------|
| 左侧 | 当前工作区、会话列表、当前 Goal | 切换工作区/会话、创建/归档会话、编辑 Goal | 显示 lease、State 序号、协议字段 |
| Agent | 连续对话、结构化计划、工具卡片、Composer | Enter 提交、Shift+Enter 换行、停止、重试、批准计划 | 暴露 Gateway URL、CA、API Key |
| Review | 准备区文件、Diff、验证与未验证项 | 逐文件接受/拒绝、显式应用已接受集合 | Diff 内编辑、未批准写入 |
| Terminal | 能力状态或独立用户控制路径 | 仅在新 Profile 通过后接受用户输入 | Agent/模型注入 stdin；复用旧 winpty No-Go |
| Browser | 可信本地预览、登记内网目标、系统浏览器动作 | 用户显式打开获准目标 | EOL Electron 打开任意网页 |
| 右侧检查器 | 当前消息或卡片关联的代码/引用/Diff/验证 | 搜索、跳转、选区加入上下文 | 直接读文件、写文件、起进程或联网 |
| Settings | Provider、连接、安全存储与显示设置 | 经 IPC/Policy 保存设置 | 把凭据回显到 Renderer 或日志 |
| Diagnostics | 能力、错误、审计、迁移与验收开发入口 | 导出脱敏诊断、查看 A7 只读归档 | 把验收术语放回日常任务页 |

### 2.3 交互不变量

1. 选中工作区即进入最后活动会话；没有会话时创建空会话，不出现“开始固定场景”的前置步骤。
2. 一个会话同一时间最多一个非终态前台任务；A8 v1 还使用产品级单活动任务锁，因此切换到其他会话时
   可以阅读历史但不能再提交任务。没有后台排队，也没有跨会话并发。切换会话不取消当前任务，运行状态
   必须在列表中显示；退出应用时按 §5.3 标记中断。
3. Composer 在任务活动期间保留草稿但提交按钮变为“停止”；失败卡片在原消息位置提供重试。
4. “先计划”必须先展示目标、拟读取/修改文件、验证方式和风险，用户批准后才能执行；“直接执行”仍经过
   Policy、工具审批和 Review，不等于无审批自动写入。
5. 右侧检查器由当前选择驱动；关闭检查器不丢失上下文引用或 Review 决定。

## 3. 标识、所有权与版本合同

### 3.1 标识关系

```text
Workspace 1 ── * Session 1 ── 1 Thread 1 ── * Turn 1 ── 1 Task 1 ── * Run
                              │                           │
                              ├── 0..1 active Goal        ├── 0..1 ReviewSet
                              └── * EventEnvelopeV2       └── * ValidationRun
```

| 标识 | 生成与作用域 | 约束 |
|------|--------------|------|
| `workspaceId` | A8 首次登记时生成的随机 UUID；不从路径或用户名推导 | 路径变更需显式重新绑定；规范路径另存并做 Win7 边界校验 |
| `sessionId` | 创建会话时随机 UUID | 全局唯一；归档后不复用 |
| `threadId` | 创建会话时随机 UUID | A8 v1 与 Session 一对一且不可变；不以 `sessionId` 字符串代替 |
| `turnId` | 每次用户提交生成 | 属于一个 Session；按 `ordinal` 严格递增 |
| `taskId` | 接受一次提交后生成 | 一个 Turn 一个 Task；重试不创建新 Task |
| `runId` | 每次首次执行或重试生成 | 属于同一 Task；用于区分尝试和 Gateway 请求 |
| `requestId` | Gateway 每次模型请求生成 | 属于一个 Run；流式聚合的关键字段 |
| `reviewId` | 首次形成准备区时生成 | 属于一个 Task；修改提案提升 `revision`，不静默复用审批 |
| `validationRunId` | 每次登记测试/验证时生成 | 精确绑定 `reviewId + revision + acceptedSetHash` |

所有持久化对象和 IPC DTO 使用数字 `schemaVersion`；事件 Envelope 保持 `schemaVersion: 2`。
数据库格式使用 `a8_schema_version: 1`。未知版本一律进入 Diagnostics 恢复模式，不能部分读取后继续任务。

### 3.2 物理数据边界

- A8 使用独立版本目录与独立 `userData`，不得打开 A7 数据库进行写入。
- A8 产品数据库继续使用锁定 D-014 Runtime Profile。A8 schema v1 复用当前 `rc_events_v2` 物理表作为
  不可变事件账本，并新增产品实体表；物理旧名仅是兼容细节，不出现在 UI/IPC。
- 展示投影缓存可以删除并从事件重建；Session、Goal、Review 决定与迁移记录是权威产品状态，必须与关联
  事件在同一 SQLite 事务提交。
- 准备区内容位于 A8 私有本地数据根的 content-addressed blob 目录，不进入目标工作区；数据库只保存
  路径、大小、编码、EOL、SHA-256 与 blob reference。`APPLIED`、`REJECTED` 或用户明确放弃后立即清理
  blob；`READY`、`STALE` 和 `RECOVERY_REQUIRED` 为恢复而保留。清理失败必须进入 Diagnostics 并审计，
  不能把遗留敏感内容当作成功清理。

### 3.3 A8 schema v1 逻辑表

| 表/存储 | 权威字段与约束 |
|---------|----------------|
| `a8_schema_migrations` | `version` 主键、`appliedAt`、合同文件 SHA-256、迁移报告 SHA-256；相邻版本单向迁移 |
| `a8_workspaces` | `workspaceId` 主键、schema version、规范路径、Windows 比较键唯一、显示名、创建/最后打开/归档时间 |
| `a8_sessions` | `sessionId` 主键、`workspaceId` 外键、唯一 `threadId`、title、lifecycle、active Goal/Task、最后事件 seq、时间戳 |
| `a8_goals` | `goalId` 主键、`sessionId` 外键、revision、text、status、时间戳；每 Session 最多一个 ACTIVE |
| `a8_turns` | `turnId` 主键、`sessionId` 外键、唯一 `(sessionId, ordinal)`、mode、用户消息事件、`taskId`、时间戳 |
| `a8_tasks` | `taskId` 主键、`turnId` 唯一外键、Session、state、current Run/Review、最后事件 seq、时间戳 |
| `a8_runs` | `runId` 主键、`taskId` 外键、唯一 `(taskId, attempt)`、state、结构化 error code、开始/结束时间 |
| `a8_plan_steps` | `stepId` 主键、Task、ordinal、版本化结构化目标/文件/验证/风险、state；Task 内 ordinal 唯一 |
| `a8_context_refs` | `contextRefId` 主键、Turn、ordinal、kind、相对路径/范围、内容 SHA-256；不保存凭据适配器值 |
| `rc_events_v2` | 复用 A7 已验收物理结构；Event Envelope V2、唯一 event ID、唯一 `(threadId, seq)` 与指纹 |
| `a8_review_sets` | §6.1 的 ReviewSet 字段、状态与三个摘要哈希；`taskId` 唯一 |
| `a8_review_files` | `reviewId + comparisonKey` 主键、revision、操作、before/after 元数据、Diff/blob hash 与文件决定 |
| `a8_validation_runs` | validation ID、Review/revision、validated-set hash、Profile/argv 摘要、结果、输出摘要与适用文件 |
| `a8_projection_checkpoints` | 可删除缓存；Thread、投影版本、source seq/fingerprint、projection hash，不参与权限或恢复裁决 |
| `a8_migration_runs` | source/target version、manifest/report hash、导入/跳过计数、状态与时间；不保存凭据或原始事件正文 |
| `settings.v1.json` | 仅 §7.1 白名单内的非敏感设置；原子替换和文件 SHA-256。凭据继续使用独立 DPAPI vault |

所有外键在写入时启用；同一产品事务先校验，再提交实体变化与对应事件。展示 JSON、计划详情等可使用
版本化 bounded JSON 字段，但不能用无 schema 的大对象替代上表的归属、状态、哈希或唯一约束。

## 4. 原始事件与流式聚合合同

### 4.1 原始事件

Gateway 每个流块必须先写入不可变 `EventEnvelopeV2`，类型固定为 `gateway.delta`，payload schema 为：

```json
{
  "schemaVersion": 1,
  "taskId": "uuid",
  "requestId": "uuid",
  "index": 0,
  "chunk": "text",
  "isFinal": false,
  "finishReason": null
}
```

- `index` 从 0 开始，在单个 `requestId` 内严格连续；空字符串 chunk 只允许携带 `isFinal=true`。
- `taskId` 必须与 Envelope 的 Session/Thread/Turn/Run 所属关系一致；主进程在写入前校验。
- 单事件继续满足 64 KiB UTF-8 payload 上限；超限由 Gateway 拆块，不能截断后伪装原始事实。
- 原始事件的 `eventId`、payload、指纹和 Thread `seq` 不因 UI 聚合而修改。Diagnostics 与审计导出读取原始
  事件，日常 Agent 页面只读取展示投影。

### 4.2 确定性聚合键与段

展示投影是无副作用纯函数，输入为已校验且 Thread `seq` 连续的事件，输出
`AssistantMessageProjectionV1`。文本段的唯一聚合键为 `taskId + requestId`，下一个可接受 delta 同时满足：

1. 与当前活动段属于同一 `taskId` 和 `requestId`；
2. `index == previousIndex + 1`，首块必须为 0；
3. 在 Thread `seq` 中紧邻上一块，中间没有非 delta 事件；
4. 追加后没有超过段与消息预算。

投影 DTO 至少包含：`schemaVersion`、确定性 `messageId`、`taskId`、`status`、有序 `blocks`、
`sourceSeqFrom/sourceSeqTo`、`projectionRevision` 和 `warnings`。每个 text block 包含 `requestId`、
`indexFrom/indexTo`、`text`、`closedBy`、`truncated` 与来源 seq 范围。

### 4.3 段关闭条件

以下任一条件先关闭当前段，随后再处理触发事件：

| 关闭原因 | 投影行为 |
|----------|----------|
| `NON_DELTA_EVENT` | 关闭文本段，再投影计划、工具、审批、验证或错误卡片 |
| `TASK_SWITCH` / `REQUEST_SWITCH` | 关闭旧段；新请求只有 index 0 才能开启新段 |
| `INDEX_GAP` / `OUT_OF_ORDER` | 关闭并增加可见的流顺序异常 warning；不跨缺口拼接 |
| `FINAL_FLAG` / `TASK_TERMINAL` | 正常关闭；终态后到达的 delta 只保留审计并产生 late-event warning |
| `SEGMENT_LIMIT` | 256 KiB UTF-8 后关闭，下一连续块创建 continuation text block |
| `MESSAGE_LIMIT` | Assistant 消息累计 1 MiB UTF-8 后关闭并标记 `truncated=true`；后续块只审计不展示正文 |
| `PROJECTION_RESET` | IPC 重连或缓存失效时丢弃临时段，从最后已校验 seq 重新投影 |

相同 `eventId` 且指纹相同由 EventLedger 幂等返回；相同 `requestId + index` 但不同 event 或内容视为冲突，
不能“最后写入胜出”。投影缓存记录 `sourceSeqTo + sourceFingerprint`，不匹配即删除缓存并重建；重建仍有
缺口时 fail-closed 到 Diagnostics 恢复模式。

### 4.4 卡片映射

| 原始事实 | 日常投影 |
|----------|----------|
| `turn.started` | 用户消息 |
| `model.plan` / 结构化计划事实 | 计划卡片，显示目标、文件、验证与风险 |
| `tool.call.started` → delta → finished | 单个可折叠工具卡片，显示状态、耗时、摘要和截断 |
| Runner/verification 事实 | Runner 或测试卡片；原始 stdout/stderr 不作为普通聊天文本 |
| `approval.requested/resolved` | 与精确对象绑定的审批卡片 |
| `gateway.delta` | 连续 Assistant text block |
| `runtime.error` / `error.raised` | 原位置错误卡片；保留已有对话与准备区 |

## 5. 会话、Goal、Turn、Task 与 Run 状态

### 5.1 Session 与 Goal

Session lifecycle 只有 `ACTIVE` 与 `ARCHIVED`。归档要求无活动 Task；归档不删除事件或 Review。
一个 Session 同时最多一个 `ACTIVE` Goal，Goal 状态为 `ACTIVE | ACHIEVED | ABANDONED`，每次编辑提升
`revision` 并写事件。Session title 可由用户或模型建议修改，但 title 不参与权限判断。

### 5.2 产品 Task 状态机

```text
CREATED
  └─> PLANNING
       ├─> AWAITING_PLAN_APPROVAL ──approve──> EXECUTING
       └────────────────direct──────> EXECUTING
EXECUTING ──changes prepared──> VERIFYING ──> AWAITING_REVIEW
AWAITING_REVIEW ──accepted set changed/retest──> VERIFYING ──> AWAITING_REVIEW
AWAITING_REVIEW ──explicit apply──> APPLYING ──byte verified──> COMPLETED

任意非终态 ──user stop──> CANCELLED
任意活动态 ──recoverable error──> FAILED
PLANNING / AWAITING_PLAN_APPROVAL / EXECUTING / APPLYING / VERIFYING
  ──unclean shutdown──> INTERRUPTED
```

- `AWAITING_REVIEW` 可跨重启保留，但恢复后必须重新计算全部目标基线；漂移则 Review 进入 `STALE`。
- `VERIFYING` 只对私有准备区或与 accepted subset 对应的隔离验证工作区运行已登记低风险 Profile；没有
  可用 Profile 时记录 `NOT_RUN` 并进入 Review。Apply 后的字节一致性校验属于 `APPLYING`，不把尚未执行
  的语义测试伪装成写入验证。
- `FAILED`、`CANCELLED`、`INTERRUPTED`、`COMPLETED` 是一次 Run 的终态，也是没有后续 Run 时的 Task
  投影状态。用户“重试”在同一 Task 下创建新 Run，并把 Task 投影转回允许的活动态；原 Run 事实不可
  改写，且只有明确的可重试错误允许重试。
- `APPLYING` 崩溃先走 Workspace 恢复清单；未证明回滚或提交完整时锁定该 Review 与工作区写入，不得
  直接转回 `AWAITING_REVIEW`。
- Core 现有 `AgentState` 是执行状态输入；A8 产品状态是持久化编排合同。实现必须建立显式映射并测试，
  不得用 UI 字符串推断状态。

### 5.3 恢复顺序

启动恢复固定执行：

1. 校验本地盘、SQLite 版本/compile options、`quick_check`、schema version 与 migration marker；
2. 校验全部事件指纹、Thread seq 连续性、外键、实体哈希和 blob 哈希；
3. 完成或锁定 Workspace 原子写恢复；
4. 把未干净结束的活动 Run 原子标记为 `INTERRUPTED` 并追加中断事件；
5. 对 `AWAITING_REVIEW` 重新验证目标清单基线；
6. 只恢复事实与 UI，不自动调用模型、Runner、Terminal、Browser 或 Apply；
7. 向用户提供“查看”“重新计划”“重试”或“放弃”，动作继续经 IPC/Policy/审计。

任一步未知、损坏、缺口、哈希漂移或版本不支持，整个产品状态进入只读 Diagnostics 恢复模式；不能只跳过
坏会话后继续写其他会话。

## 6. 多文件准备区与 Review 合同

### 6.1 ReviewSetV1

ReviewSet 的权威字段为：

- `schemaVersion: 1`、`reviewId`、`revision`、`workspaceId`、`sessionId`、`taskId`；
- `status: DRAFT | READY | STALE | APPLYING | APPLIED | REJECTED | FAILED | RECOVERY_REQUIRED`；
- `workspaceBaseHash`、`previewHash`、`acceptedSetHash`；
- 有序文件项、验证记录、未验证项、创建/更新时间和最后事件 seq。

每个文件项包含规范化工作区相对路径、Windows 大小写折叠唯一键、操作
`CREATE | MODIFY | DELETE`、before/after 是否存在、字节数、SHA-256、显式编码与 EOL、Diff hash、
blob reference、决定 `PENDING | ACCEPTED | REJECTED` 与决定事件 ID。二进制文件首个 MVP 只允许只读
展示并必须拒绝写入；混合 EOL 必须显式显示，不能静默规范化。

### 6.2 基线与摘要哈希

`workspaceBaseHash` 不是全仓库哈希，而是本 Review 目标清单的确定性哈希：对按 Windows 大小写折叠键
排序的 `{relativePath, operation, beforeExists, beforeSha256}` canonical JSON 做 SHA-256。这样既能发现所有
将被写入目标的漂移，又不会因无关文件变化造成误阻断。

`previewHash` 对同一 revision 的有序 `{path, operation, beforeSha256, afterSha256, diffSha256}` 求哈希。
`acceptedSetHash` 对已接受文件的上述记录和决定求哈希。任何内容、顺序、决定或 validation binding 改变
都提升 revision、废止旧审批并重新计算哈希。

### 6.3 用户决定与应用

1. Agent 只能向私有准备区写提案，不能直接写正式工作区。
2. 用户逐文件接受或拒绝；决定只改变 Review 状态，不产生工作区副作用。
3. 所有文件都完成决定后才显示“应用已接受变更”。全拒绝将 Review 置为 `REJECTED`，不请求写审批。
4. 显式应用生成一次性审批，精确绑定 `sessionId + taskId + reviewId + revision + workspaceBaseHash +
   previewHash + acceptedSetHash + subject + expiresAt`。
5. 应用前再次逐文件校验真实路径/reparse 边界、before 存在性与 SHA-256；任何一个漂移使整个 accepted
   subset 进入 `STALE`，零文件写入。
6. accepted subset 作为一个 `WritePlan` 执行。任一文件备份、替换、验证或清理失败，回滚整个 subset；
   不能把部分写入报告成部分成功。回滚未确认则 `RECOVERY_REQUIRED` 并锁定后续写入。
7. rejected 与 pending 文件从不进入 WritePlan；应用成功后保留决定与哈希事实，按策略清理 blob。

### 6.4 验证绑定

每个 ValidationRun 记录已登记 Runner profile、结构化 argv 摘要、开始/结束、结果
`PASS | FAIL | CANCELLED | NOT_RUN`、输出截断与适用文件集合。首次准备区验证绑定 Review revision 和
完整 `previewHash`；逐文件决定完成后，只有 validated-set hash 与最终 `acceptedSetHash` 相同的结果才覆盖
已接受集合。部分拒绝、后续提案或接受集合变化会把不再等价的结果标为 `STALE`，用户可在 Review 内对
accepted subset 重跑；不能重跑时必须显示未验证项。测试失败或未验证是否阻断 Apply 由冻结 Task
acceptance/Policy 决定，并必须包含在审批摘要中，不能静默放行。模型声明“已测试”不能创建 PASS；只有
真实 Runner/远程验证适配器的审计事实才能创建 PASS。

### 6.5 凭据与内容安全

- Gateway API key、Authorization、代理密码、DPAPI 明文或匹配的已知凭据值不得进入事件 payload、聊天、
  Review 数据库、blob、Diff、验证输出或报告。
- 在持久化/展示/导出前同时执行字段名和已知值扫描；发现命中时拒绝该持久化动作、清理临时内容并记录
  不含原值的 `SENSITIVE_DATA_BLOCKED` 事件。
- A8 不承诺识别仓库中所有未知秘密，因此模型上下文、Diff 与验证输出仍遵循最小范围和用户可见；任何
  凭据适配器取得的值必须作为 tainted value 全链路禁止落普通存储。

## 7. A7 → A8 迁移合同

### 7.1 数据分类与白名单

| A7 数据 | A8 处置 | 理由 |
|---------|---------|------|
| `0.1.0-rc.1` 安装目录、ZIP、manifest、证据 | 原地只读冻结，不复制进 A8 产品目录 | 保持已验收字节与回退能力 |
| `agent-events-v2.db` / `rc_events_v2` | 不导入 A8 活动数据库；经指纹/序列校验后登记为 Diagnostics 只读归档 | A7 没有完整持久 Session，不能伪装为可恢复对话 |
| 进程内 Session catalog、Task、Gateway settings | 不可迁移 | 退出后不存在持久事实 |
| 已存在的版本化工作区列表 | 仅导入规范路径、显示名、最后打开时间；缺失视为合法空列表 | 满足 PRD，且不从事件猜测路径 |
| 非敏感设置 | 只导入已登记 provider ID、model ID、连接模式、获准 Gateway URL、CA 路径与显示偏好 | 白名单、schema 与网络策略复核 |
| `credentials.v1.json`、API key、代理密码、Authorization | 不读取明文、不复制、不迁移；A8 要求用户重新确认/录入 | 防止跨数据根和错误策略继承 |
| A2 recovery、临时、Runner work、WAL/SHM、缓存 | 不迁移 | 运行期或恢复专用数据不能成为新事实 |

当前 A7 代码没有持久工作区列表，Gateway settings 也是进程内数据；因此真实 A7 首次迁移通常是“零条导入
+ 登记只读事件归档”。这是成功的确定性 no-op，不得从旧事件 payload 猜测或重建工作区列表。

### 7.2 原子迁移流程

1. 只在 A8 独立数据根尚未完成 migration marker 时运行；获取单实例 migration lock。
2. 验证 A7 source root、候选 manifest/版本、SQLite `quick_check`、事件指纹与 Thread seq；全程只读打开。
3. 读取明确的版本化 source files；未知字段忽略并记录，未知 source version 拒绝，不启发式解析。
4. 对白名单记录执行路径、URL、Provider、CA 与敏感值扫描；无效记录逐条跳过并生成脱敏 disposition。
5. 在 A8 数据根的临时目录创建 schema v1 数据库、blob 根和 `migration-report.v1.json`；执行完整恢复校验。
6. `fsync` 文件与父目录后以原子 rename 发布；写入 marker，包含 source version、source manifest hash、
   imported/skipped counts、目标 schema 和报告 hash，不包含凭据。
7. 失败时关闭数据库并删除/隔离临时目录，A7 保持原样，A8 保持未初始化；下次可重试。若临时目录清理
   未确认则进入 Diagnostics，不允许用半迁移数据启动。

迁移不修改注册表、服务、PATH、网络、路由、防火墙或 A7 安装目录。A8 卸载的 retain/purge 只作用于 A8
数据根；不得借 purge 删除 A7 归档。

### 7.3 A8 内部 schema 演进

- schema 迁移按相邻版本注册，不允许跳级或降级；未知未来版本只读失败关闭。
- 每次升级先创建同盘备份及 SHA-256 sidecar，再在单个 SQLite transaction 执行，随后跑 `quick_check`、
  FK、事件指纹/seq、实体/Review/blob 哈希检查。
- 迁移成功原子更新 marker 后才允许删除旧备份；失败恢复备份并保留脱敏报告。
- 事件 Envelope v2 不追溯改写。未来事件 payload 升级通过新 payload schema 或新事件类型表达，旧 Reader
  遇到未知类型只在投影层警告，但存储损坏/版本未知仍失败关闭。

## 8. A8-01～A8-05 确定性测试矩阵

| ID | 阶段 | 场景 | 必须证明 |
|----|------|------|----------|
| A8E-01 | A8-01 | 中文逐字 delta `index 0..n` | 合并为一个 Assistant text block；原始事件数量不变 |
| A8E-02 | A8-01 | 英文 token delta、request 切换 | 每个 request 独立连续段，顺序与文本精确 |
| A8E-03 | A8-01 | 非 delta 插入 | 先关闭文本段，再显示对应工具/计划卡片 |
| A8E-04 | A8-01 | 缺口、乱序、重复冲突、终态迟到 | 不跨缺口拼接；warning 可见；原始审计完整 |
| A8E-05 | A8-01 | 256 KiB 段、1 MiB 消息边界 | continuation 与最终截断确定，内存有界 |
| A8E-06 | A8-01 | IPC 重连/缓存指纹错误 | 从原始 seq 重建相同投影，不以缓存覆盖事实 |
| A8S-01 | A8-02 | 一个工作区多个会话 | Session/Thread/Turn/Task 归属与事件隔离正确 |
| A8S-02 | A8-02 | 同会话重复提交 | 第二个前台任务在创建前拒绝，不进入后台队列 |
| A8S-03 | A8-02 | Goal 编辑/完成/放弃 | revision 与事件原子提交，重启投影一致 |
| A8S-04 | A8-02 | 中文、空格、盘符、MAX_PATH/reparse | 规范化和边界错误结构化，Renderer 无文件能力 |
| A8R-01 | A8-03 | create/modify/delete 多文件 Review | Diff、编码、EOL、before/after hash 与排序确定 |
| A8R-02 | A8-03 | 部分接受、部分拒绝 | 只生成 accepted subset；拒绝文件零副作用 |
| A8R-03 | A8-03 | 内容或决定变化 | revision 提升，旧 approval/validation 失效 |
| A8R-04 | A8-03 | 应用前任一目标漂移 | 整组 `STALE`，零文件写入，要求重新计划 |
| A8R-05 | A8-03 | 中途写入/字节验证/回滚故障 | 全 accepted subset 回滚；未确认则锁定恢复 |
| A8R-06 | A8-03 | UTF-8 BOM、UTF-16、GBK、CRLF、mixed EOL | 支持项逐字节往返；不支持/二进制明确拒绝 |
| A8R-07 | A8-03 | 验证失败、取消、截断、提案变化 | 真实状态与未验证项准确，不把模型文本计为 PASS |
| A8P-01 | A8-05 | 正常重启 | Session/Goal/Review/事件与投影一致恢复，零自动执行 |
| A8P-02 | A8-05 | 活动任务异常退出 | 原子转 `INTERRUPTED`，只提供用户动作 |
| A8P-03 | A8-05 | Review 恢复时基线漂移 | Review 转 `STALE`，Apply fail-closed |
| A8P-04 | A8-05 | schema 未知、JSON/DB 损坏、seq 缺口、hash 漂移 | 整体进入只读 Diagnostics 恢复模式 |
| A8M-01 | A8-05 | 真实 A7 数据只有 EventLedger/credential file | 零工作区导入；事件只读登记；凭据文件不复制 |
| A8M-02 | A8-05 | 合法工作区/安全设置 fixture | 只导入白名单字段，marker/report/hash 一致 |
| A8M-03 | A8-05 | 未知 source version、篡改 source、迁移中断 | A7 不变、A8 未初始化、可重试且无半迁移状态 |
| A8C-01 | A8-01～05 | API key/Authorization/代理密码已知值注入各通道 | 事件、DB、blob、Diff、日志和报告均无命中 |
| A8C-02 | A8-01～05 | Renderer 调用文件/进程/凭据/网络与未登记 IPC | 全部拒绝并记录，不产生副作用 |

所有测试都必须同时断言原始事件事实、用户投影和副作用边界。开发机通过只解除对应串行实现 Gate；A8
整体仍需同一候选的开发机、Win10、Win7 三层产品旅程，不能把本矩阵冒充 `A8_RC_PASS`。

## 9. 需求追踪与 Gate 结论

| 需求 | 设计证据 | 状态 | 后续实现阶段 |
|------|----------|------|--------------|
| PRD §2 对话、模式、流式、卡片、错误保留 | §2、§4、§5 | `DESIGNED` | A8-01 |
| PRD §3 信息架构 | §2 | `DESIGNED` | A8-01/A8-02/A8-04 |
| PRD §4 上下文、代码、准备区、Review | §2、§6 | `DESIGNED` | A8-02/A8-03 |
| PRD §5 Runner/Terminal/Browser 边界 | §2.2、§2.3、§6.4 | `DESIGNED_BOUNDARY_ONLY` | A8-03/A8-04 |
| PRD §6 会话、Goal、恢复、凭据、旧版本 | §3、§5、§7 | `DESIGNED` | A8-02/A8-05 |
| Task §4 事件、状态与安全不变量 | §3～§7 | `DESIGNED` | A8-01～A8-05 |
| Task §3 A8-00 测试矩阵 | §8 | `DESIGNED` | A8-01～A8-05 |

A8-00 的结论为 `A8_00_DESIGN_PASS`：上述合同对 PRD 的 A8-00 范围已覆盖，数据格式、聚合关闭条件、
状态恢复、写入审批、迁移白名单与安全失败模式没有未决项。下一可进入阶段是 A8-01；A8-02～A8-06
仍受串行 Gate 约束。

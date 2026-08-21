# A8 — Agent-first 产品体验与 Win7 MVP 闭环

## 0. 实现授权（ADR-0011 / C14）

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_EXPERIENCE
Target Branch: codex/a8-agent-first-product
Target Version: 0.2.0-alpha.1
Phase-Gate: A8_IMPLEMENTATION_AUTHORIZED
Developer-Validation: A8_DEVELOPER_COMPLETE_VALIDATION_READY
Win10-Validation: NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE
Win7-Validation: NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE
Blocking-Reason: WIN10_WIN7_EXTERNAL_ENV_REQUIRED
```

授权依据：项目负责人于 2026-08-20 完成四轮需求决策并明确确认
`docs/prds/WIN7_AGENT_FIRST_PRODUCT_REQUIREMENTS_V1.md`。本任务只授权该合同定义的 Agent-first
产品体验与完整 MVP 闭环；不授权扩大任意 Shell、高风险 Runner、Git 写操作、任意公网浏览、模型控制
用户终端、多 Agent、自动更新或无审批完全自主模式。

### 0.1 允许路径

- `src/shell/product/**`：Agent-first 桌面入口、Renderer、Preload、IPC host、设置与诊断装配。
- `src/shell/tests/product/**`：产品交互、IPC、安全边界、恢复与回归测试。
- `src/core/src/**`、`src/core/tests/**`：仅限会话 Turn、结构化计划、Goal、工具摘要和恢复合同。
- `src/workspace/src/**`、`src/workspace/tests/**`：仅限上下文引用、只读代码视图与准备区基线接口。
- `src/state/src/**`、`src/state/tests/**`：仅限带版本的会话/Goal/Review 持久化与 fail-closed 恢复。
- `src/gateway/src/**`、`src/gateway/tests/**`：仅限已登记内网 Provider 的流式消息与错误恢复合同。
- `src/runner/src/**`、`src/runner/tests/**`：只允许复用/展示已验收低风险非交互 Profile；不得新增命令面。
- `src/git-adapter/src/**`、`src/git-adapter/tests/**`：仅限既有隔离适配器上的只读状态、Diff 和历史。
- `release/win7-product-v2/**`、`scripts/release/**`：A8 确定性打包、生命周期和三层验收工具。
- `docs/prds/**`、`docs/tasks/**`、`docs/status/**`、`docs/reports/**`、`docs/STATUS.md`、
  `docs/DECISIONS.md`、`docs/ARCHITECTURE.md`、`docs/SECURITY.md`、`docs/EVALUATION.md`、
  `docs/WIN7_CONSTRAINTS.md`：合同、设计、风险、状态和证据。

禁止通过路径白名单顺带重构无关 Phase 1/2 代码、改写已接受证据或修改 `0.1.0-rc.1` 长期归档。
新增依赖、原生组件、网络目标、系统 API 或运行时前，必须先满足 C15/C16 并更新约束登记。

## 1. 冻结输入与不可继承结论

| 输入 | 固定边界 |
|------|----------|
| Git 基线 | A7 已合入且 main 干净的授权提交；A8 从该提交单独建 branch/worktree |
| 历史 RC | `0.1.0-rc.1` / ZIP SHA-256 `39eecb6a683f90dea12e58dbeee070ec0bc4dd1706a08bd4f1967343e28040c9`，只读冻结 |
| Runtime | Electron `22.3.27` x64、Node `16.17.1`、Win7 SP1 x64；不因 A8 自动升级 |
| Runner | D-013 v24 低风险非交互 Profile；交互 winpty 继续 `NO_GO` |
| Storage | D-014 本地 NTFS SSD Profile；旧 EventLedger PASS 不等于完整会话恢复 PASS |
| 模型 | Provider 接口可扩展，但 A8 首发只承诺经登记并实测的内网模型 |

A4～A7 的开发机/Win10/Win7 PASS 只证明锁定输入资格。任何 A8 文件或包字节变化都必须产生新的分层
结论，不得把旧 RC 的 `RC_PASS` 写成 A8 PASS。

## 2. 产品合同

### 2.1 日常工作流

1. 用户选择工作区并进入会话。
2. 用户输入自然语言；`Enter` 提交，`Shift+Enter` 换行。
3. “直接执行”立即进入受控读取/计划；“先计划”先展示结构化步骤并等待执行确认。
4. Assistant 消息持续聚合流式 delta；工具、计划、Runner、测试和错误以可折叠卡片显示。
5. Agent 形成多文件准备区；Review 显示 Diff、验证和未验证项，用户逐文件接受或拒绝。
6. 批准后才写入正式工作区；失败原地恢复，重启后恢复事实但不擅自继续任务。

### 2.2 页面与能力边界

- 工作区页面：`Agent / Review / Terminal / Browser`。
- 全局页面：`Settings / Diagnostics`。
- Terminal 是用户能力，必须与 Agent Runner 输入隔离；旧 winpty No-Go 不得绕过。A8-04 在形成新的
  Runtime Profile、威胁模型和 Win7 证据前，只能实现清晰的 disabled/fail-closed 状态或经批准的
  独立用户控制路径，不能宣称嵌入式交互终端 PASS。
- Browser 只允许可信本地预览、用户显式系统浏览器和管理员登记内网目标；Renderer 继续无 Node、
  context isolated、sandboxed、deny-by-default navigation/window/permission。
- Gateway/CA/API Key 离开主任务页面；凭据只能走已批准的安全存储与 IPC，日志和数据库必须脱敏。

## 3. 实施阶段与串行 Gate

| 阶段 | 交付 | 进入下一阶段的硬门槛 |
|------|------|----------------------|
| A8-00 | 合同、信息架构、事件/状态/数据迁移设计、测试矩阵 | 文档一致；无未决安全或数据格式决策 |
| A8-01 | 对话主界面、Enter 提交、直接/计划模式、流式聚合、工具卡片 | 中文逐字/英文 token/request 切换/截断/失败回归通过；原始审计不变 |
| A8-02 | 工作区、多会话、Goal、上下文引用、只读代码查看器 | 中文/空格路径、会话隔离、上下文上限与只读边界通过 |
| A8-03 | 多文件准备区、Review、逐文件接受/拒绝、真实测试闭环 | 基线漂移、部分拒绝、失败回滚、编码/EOL/路径用例通过 |
| A8-04 | Runner 展示、Terminal/Browser、Settings/Diagnostics | C17/C19 负向测试；Terminal 新 Profile 未通过则保持 disabled |
| A8-05 | 会话/Goal/Review 持久化、中断与恢复、旧设置迁移 | schema/version、损坏、序列缺口、凭据扫描、重启恢复通过 |
| A8-06 | `0.2.0-alpha.1` 打包、开发机/Win10/Win7 产品旅程 | 新哈希/manifest/SBOM/许可证/唯一租约；三层分别记录 |

同一提交只允许一个阶段处于 `IN_PROGRESS`。前一阶段测试未通过，不得以 UI 演示代替 Gate 进入后续阶段。

### 3.1 A8-00 Gate 记录（2026-08-20）

```text
Stage: A8-00
Status: COMPLETE
Gate: A8_00_DESIGN_PASS
Next-Stage: A8-01
Next-Stage-Status: AUTHORIZED_NOT_STARTED
```

A8-00 的冻结实现输入为
[`A8_00_PRODUCT_ARCHITECTURE_AND_DATA_CONTRACT.md`](../prds/A8_00_PRODUCT_ARCHITECTURE_AND_DATA_CONTRACT.md)，
关键数据与安全裁决为 ADR-0075，追踪与一致性报告为
[`a8_00_design_gate_2026-08-20.html`](../reports/2026-08/a8_00_design_gate_2026-08-20.html)。该合同已明确：

- 左侧工作区/会话/Goal、中间对话、右侧按需检查器，以及 `Agent / Review / Terminal / Browser`
  与 `Settings / Diagnostics` 的职责和权限边界；
- 原始 Event Envelope V2 不变，`gateway.delta` 按 `taskId + requestId + index` 连续聚合，包含全部关闭
  条件、256 KiB 段上限、1 MiB 消息上限和缓存重建语义；
- Session/Thread/Turn/Task/Run 标识关系、产品级单活动任务锁、Goal、异常中断和 fail-closed 恢复；
- 多文件 Review 的目标清单哈希、逐文件接受/拒绝、一次性批量审批、基线漂移和全组回滚；
- A7 独立只读归档、工作区/非敏感设置迁移白名单、凭据排除、原子迁移与 schema 演进；
- A8-01～A8-05 的 26 条确定性测试。A8-01 的实现与验证结论见下一节，A8-00 Gate 本身仍只代表设计冻结。

### 3.2 A8-01 Gate 记录（2026-08-20）

```text
Stage: A8-01
Status: COMPLETE
Gate: A8_01_CONVERSATION_PASS
Next-Stage: A8-02
Next-Stage-Status: AUTHORIZED_NOT_STARTED
```

A8-01 已把 A7 固定场景控制台替换为对话优先工作台：左侧工作区/会话/Goal，中间连续对话与底部
Composer，右侧只读文件检查器；固定验收场景只保留在 Diagnostics。`Enter` 提交、`Shift+Enter` 换行、
IME composing 不误提交；任务运行时主动作切换为停止，错误卡片保留上下文并可重试。

直接模式沿用受控 Runtime；计划模式在首个工具调用前生成结构化计划并进入独立审批检查点。计划批准和
拒绝复用既有 Schema 校验 IPC 信封，审批 ID 绑定完整可见计划 SHA-256；拒绝零工具副作用，批准恢复原
检查点，后续 workspace-write 仍需单独精确审批。Gateway 每个 chunk 与 final marker 先写不可变
`gateway.delta` V2 事实，再进入纯展示投影；Renderer 不把原始 chunk 列表当普通聊天内容。

确定性测试 `A8E-01`～`A8E-06` 全部通过，覆盖中文逐字、英文 token、request/非 delta 切换、重复/
冲突/缺口/乱序/迟到、256 KiB/1 MiB 上限和重建一致；额外覆盖 Composer、计划审批前零工具调用、
批准/拒绝、原始 Gateway 审计和 IPC scope。仓库级 `npm run verify` 通过，静态 Chromium 布局检查无
遮挡或溢出。证据见
[`a8_01_conversation_gate_2026-08-20.html`](../reports/2026-08/a8_01_conversation_gate_2026-08-20.html)。
本 Gate 只解除 A8-02 开发，不代表 A8 整体开发机旅程、Win10、Win7 或 RC PASS。

### 3.3 A8-02 Gate 记录（2026-08-20）

```text
Stage: A8-02
Status: COMPLETE
Gate: A8_02_WORKSPACE_SESSION_CONTEXT_PASS
Next-Stage: A8-03
Next-Stage-Status: AUTHORIZED_NOT_STARTED
```

A8-02 已实现同一工作区多会话、Session/Thread 一对一随机 UUID、产品级单活动任务锁、归档不删除、
Goal 修订/达成/放弃，以及版本化事实快照的确定性恢复投影。Goal 状态和 `goal.updated` 事实只在全部
校验通过后一起提交；冲突修订不改变状态或事件数。该快照合同仍是存储中立的 A8-02 seam，不冒充
A8-05 的 SQLite 完整持久化。

Renderer 继续无文件系统能力。产品专用 IPC 对会话、Goal、目录列表和文件读取使用拒绝额外字段的
精确校验；主进程只暴露有界 `list/read` 结果。用户可添加文件、目录和文本附件，每轮最多 24 项、
总计 64 KiB，文件单项最多 500 行；主进程重新读取并记录相对路径、范围和内容 SHA-256。右侧只读
查看器提供行号、文件内查找、跳转、选区以及“解释/修复/加入上下文”，本轮工具实际读取的文件独立
显示。归档会话允许读历史但不能提交或修改 Goal；运行任务期间可切换查看其他会话，但第二次提交在
创建 Turn/Task/Run 前拒绝且不排队。

`A8S-01`～`A8S-04` 全部通过，覆盖多会话归属/隔离、重复前台提交、Goal 原子修订与恢复投影、中文/
空格/盘符/MAX_PATH/reparse 越界、上下文上限和 Renderer IPC 能力边界。仓库级 `npm run verify`
通过（7 模块 1010 项）；本地 Chromium 在 1280×720 三栏布局下横纵溢出均为 0，代码查看器 380 px
宽、310 px 高。证据见
[`a8_02_workspace_session_context_gate_2026-08-20.html`](../reports/2026-08/a8_02_workspace_session_context_gate_2026-08-20.html)。
本 Gate 只解除 A8-03 开发；完整 A8 开发机旅程、Win10、Win7 与 RC 仍为 `NOT_PERFORMED`。

### 3.4 A8-03 执行计划

A8-03 在开始实现前采用
[`a8_03_review_staging_development_plan_2026-08-20.html`](../reports/2026-08/a8_03_review_staging_development_plan_2026-08-20.html)
作为需求—代码追踪与执行计划。计划将工作拆为基线保护、ReviewSet/哈希、私有准备区、逐文件决定、
批量应用、验证绑定和 Gate 收口七个串行工作包，并逐项绑定 `A8R-01`～`A8R-07`、`A8C-01/02`。
实现已按计划进入 `IMPLEMENTATION_IN_PROGRESS`；当前逐项结果、开发机证据和剩余门禁记录在
[`a8_03_review_staging_progress_2026-08-20.html`](../reports/2026-08/a8_03_review_staging_progress_2026-08-20.html)。
该进度不签发 `A8_03_REVIEW_APPLY_PASS`，也不授权新增 Runner Profile、依赖、网络目标或跨入 A8-04/A8-05。

2026-08-21 的最新机器可读检查点为
[`a8-03-developer-checkpoint-20260821.json`](../status/a8-03-developer-checkpoint-20260821.json)：ADR-0079 与
[`A8_03_SYSTEM_PROMPT_CONTRACT.md`](../prds/A8_03_SYSTEM_PROMPT_CONTRACT.md) 已冻结真实 Provider 的
Review staging 提示词，受控 Provider 和已知凭据持久化前阻断回归通过；全量 1051 项通过。当前真实
Electron Review 旅程因本地 GUI 审批服务用量限制保持 `NOT_PERFORMED_LOCAL_GUI_APPROVAL_UNAVAILABLE`，
所以此前 Gate 记录保持未签发，直到真实 Electron 8-case 完成。现已形成开发机实现 Gate
`A8_03_REVIEW_APPLY_PASS`（仅解除 A8-04）；Electron 22/Win10/Win7 与最终 RC 仍未完成。

### 3.5 A8-03 Gate 记录（2026-08-21）

```text
Stage: A8-03
Status: COMPLETE_FOR_DEVELOPER_IMPLEMENTATION_GATE
Gate: A8_03_REVIEW_APPLY_PASS
Next-Stage: A8-04
Next-Stage-Status: AUTHORIZED_NOT_STARTED
External-Validation: NOT_PERFORMED
```

A8R-01～07、A8C-01/02 的开发机实现证据已闭合；真实 Electron 8-case 生产旅程与 1280×720 截图见
[`a8_03_review_apply_gate_2026-08-21.html`](../reports/2026-08/a8_03_review_apply_gate_2026-08-21.html) 和
[`a8-03-electron-review-qa-20260821.json`](../status/a8-03-electron-review-qa-20260821.json)。该运行使用
Electron 41.7.1 macOS arm64，证据等级为 `DEVELOPER_SURROGATE_ELECTRON`；它只解除 A8-04 实现，不替代
锁定 Electron 22.3.27 x64、Win10、Win7 或 A8-06 三层验收。

### 3.6 A8-04 Gate 记录（2026-08-21）

```text
Stage: A8-04
Status: COMPLETE_FOR_DEVELOPER_IMPLEMENTATION_GATE
Gate: A8_04_RUNNER_TERMINAL_BROWSER_SETTINGS_DIAGNOSTICS_PASS
Next-Stage: A8-05
Next-Stage-Status: AUTHORIZED_NOT_STARTED
External-Validation: NOT_PERFORMED
```

A8T-01、A8B-01、A8R-08/09、A8D-01/02、A8C-03/04 的静态、IPC 负向、RunnerLog 和真实生产
Electron 证据已闭合。8 项真实 Electron case、Diagnostics 截图与独立 10 文件哈希复算见
[`a8_04_terminal_browser_settings_gate_2026-08-21.html`](../reports/2026-08/a8_04_terminal_browser_settings_gate_2026-08-21.html)、
[`a8-04-boundary-electron-qa-20260821.json`](../status/a8-04-boundary-electron-qa-20260821.json) 和
[`a8-04-boundary-validation-kit-20260821.json`](../status/a8-04-boundary-validation-kit-20260821.json)。该运行使用
Electron 41.7.1 macOS arm64，证据等级为 `DEVELOPER_SURROGATE_ELECTRON`；Terminal 仍 disabled，Browser
仍 deny-by-default，项目 Runner 仍只显示未登记状态。该 Gate 只解除 A8-05 实现，不替代锁定 Electron
22.3.27 x64、Win10、Win7 或 A8-06 三层验收。

### 3.7 A8-05 Gate 记录（2026-08-21）

```text
Stage: A8-05
Status: COMPLETE_FOR_DEVELOPER_IMPLEMENTATION_GATE
Gate: A8_05_PERSISTENCE_RECOVERY_MIGRATION_PASS
Next-Stage: A8-06
Next-Stage-Status: AUTHORIZED_NOT_STARTED
External-Validation: NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE
```

A8-05 已冻结 [`A8_05_PERSISTENCE_RECOVERY_MIGRATION_CONTRACT.md`](../prds/A8_05_PERSISTENCE_RECOVERY_MIGRATION_CONTRACT.md)
与 ADR-0083，并完成 D-014 `SqliteDatabase` seam 的结构化 Session/Goal/Turn/Task/Run/事实表、版本
marker、单事务快照回滚、Review 文件哈希投影、Validation 摘要、活动任务中断和 A7→A8 白名单迁移。
Desktop Host 会在启动时恢复持久 Session/Task/Review 投影；恢复不会调用模型、Runner、Terminal、Browser
或 Apply，`AWAITING_REVIEW` 只在用户显式 Review 操作后占用前台。重建的 Review 会重新校验目标基线，
漂移直接变为 `STALE`，Apply 继续拒绝。

`A8P-01`～`A8P-04`、`A8M-01`～`A8M-03`、`A8C-01` 的开发机证据见
[`a8-05-developer-checkpoint-20260821.json`](../status/a8-05-developer-checkpoint-20260821.json)；可在
D-014 目标包执行的锁定入口、精确命令、报告 Schema、哈希和回收规则见
[`a8-05-persistence-validation-kit-20260821.json`](../status/a8-05-persistence-validation-kit-20260821.json)。
当前开发机使用确定性 fake SQLite driver 加上真实 Workspace/Host 重开测试，不能替代 better-sqlite3
8.7.0、SQLite 3.43.1、Electron 22.3.27 x64、Win10 或 Win7 证据。该 Gate 只解除 A8-06 实现准备。

### 3.8 A8-06 Gate 记录（2026-08-21）

```text
Stage: A8-06
Status: A8_DEVELOPER_COMPLETE_VALIDATION_READY
Gate: A8_06_PACKAGE_AND_VALIDATION_READY
Next-Stage: EXTERNAL_PRODUCT_ACCEPTANCE
Next-Stage-Status: BLOCKED_EXTERNAL_ENV_UNAVAILABLE
External-Validation: NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE
```

A8-06 已冻结 [`A8_06_DETERMINISTIC_PACKAGE_AND_VALIDATION_CONTRACT.md`](../prds/A8_06_DETERMINISTIC_PACKAGE_AND_VALIDATION_CONTRACT.md)
与 ADR-0084。独立构建器只接受输入锁定中的 Electron 22.3.27、D-013 v24 和 D-014 8.7.0/SQLite
3.43.1 哈希与必需 ZIP entry；缺失、改变、CRC/路径错误或候选 payload 中出现私钥、`.env`、缓存、
winpty/node-pty 时，在发布 ZIP 前 fail-closed 并清理临时工作树。应用 JS 与 native helper/SQLite
严格分置于 `resources/app` 与 `resources/native`，`rc-runtime.json`、manifest、CycloneDX SBOM、
许可证、输入锁和确定性 ZIP sidecar 随候选交付；Terminal、任意 Shell、Browser 导航和 Git 写入仍不在
能力清单内。

开发机已通过 A8K-01～A8K-05：3 个打包测试覆盖缺失输入、禁止 payload、重复构建 byte-identical、
manifest 双向哈希、native 外置和生命周期说明；真实锁定输入已完成一次候选装配与包内 A8-05 fake
SQLite 结构 smoke。候选 manifest 只写入 `developer_package_integrity: PASS`，product/Win10/Win7/RC
全部保持 `NOT_PERFORMED`。同一候选的 A8-03/A8-04 Electron smoke、A8-05 D-014 smoke、安装/并存/
升级/回滚/卸载命令和证据 Schema 由 `A8_06_VALIDATION_KIT.json` 锁定，禁止以旧 A7 RC 或 Replay/截图
代替真实旅程。

开发机检查点与实际包/manifest SHA-256 见
[`a8-06-developer-checkpoint-20260821.json`](../status/a8-06-developer-checkpoint-20260821.json)，
外部执行模板见 [`a8-06-package-validation-kit-20260821.json`](../status/a8-06-package-validation-kit-20260821.json)。
由于当前环境没有可执行的 Win10/Win7 目标层和 Electron 22 Windows native 执行环境，三层状态必须保持
`NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE`；这不解除最终 `A8_RC_PASS`。

2026-08-21 的独立复核发现首版 A8K-04 存在本地缺陷：D-014 由普通 Node 而不是 Electron ABI 110
执行，三份报告未共同绑定 manifest，且证据写入候选目录。ADR-0085 已完成修复：统一 schema v2、完整
manifest 复算、候选外 evidence、包内 Electron Node-mode 和 evidence-set 联合校验；相关开发机负向与
合同测试通过。首版 dirty 候选及其结论已被修复检查点取代；ADR-0086 进一步把需要回填候选哈希的 current
status 与构建后报告留在候选外，消除 manifest 自引用。修复已固定在干净提交
`7ccaed6b98e4ebb9f77d993d22c3ed136bdeb8c0`，不带 `--allow-uncommitted` 的两次真实输入构建字节一致：ZIP
SHA-256 `d1e8dbbe5e9a09e8d50fc1411c11e48de6d0bb734d7bce1d957bb42d3f45aef9`，manifest SHA-256
`85c874843947478307515de4a56391fc7cbee2689fbffb5b7af8508e3873087c`，`source_dirty: false` 且
`external_acceptance_eligible: true`。A8-06 开发机 Validation Ready 已重新签发；唯一剩余工作是同一候选的
Electron 22/Win10/Win7 正式执行和负责人 RC 复核。

后续独立审查提出的 P0-01/P0-02/P1-01/P1-02/P2-01 已逐条复核。前三项和 dirty-source 项属于修复前
快照；本轮新增 validation 全量相对模块闭包扫描，并把旧 A8-03/A8-04 source kit 明确标为仅供 schema v1
surrogate 归档、正式执行由包内 schema v2 命令接管。原始历史报告不回填虚假的候选绑定。新锁定候选及
逐项结论见 [`a8-06-independent-review-followup-20260821.json`](../status/a8-06-independent-review-followup-20260821.json)。

根据 ADR-0087，验证套件全面改用包内 Electron 22.3.27 的 Node 模式（`set ELECTRON_RUN_AS_NODE=1&& .\electron.exe`）
作为脚本宿主，彻底消除外部 `node.exe` 假设，`preflight` 与所有 smoke 入口不再依赖系统 PATH 中的 Node；
自动化合同测试增加了“无系统 Node 仍可执行验证套件”的强校验。

## 4. 事件、状态与安全不变量

- Gateway 原始 chunk 继续逐项审计；Renderer 仅在展示投影层按 `taskId + requestId + 连续 index` 聚合。
- 任一非 delta 事件、request 切换、index 缺口、任务终态或长度上限必须关闭当前聚合段。
- 所有持久化对象具有 schema version；未知版本、损坏、哈希漂移和不连续序列 fail-closed。
- Renderer 不直接获得文件系统、进程、凭据或任意网络能力；所有动作经 Schema IPC、Policy、批准与审计。
- Agent 不得向用户 Terminal 注入输入；终端输出按不可信数据处理。旧 D-011 工件不得进入 A8 包。
- Git 只读仍必须关闭 hooks、filters、textconv、pager、credential/SSH helper、fsmonitor 和外部 diff。
- 不修改目标机网络、路由、防火墙、PATH、服务或系统策略，也不以“试用”为由放松这些边界。

## 5. MVP 非目标

完整代码编辑器、Diff 内编辑、任意 Shell、Git 写操作、多 Agent、后台并发队列、任意浏览器自动化、
插件市场、自动更新、无审批全自动模式、未登记模型、高风险和未知 Runner Profile不在本任务范围内。

## 6. 验证矩阵与完成条件

### 6.1 开发机

- 全量 `npm run verify`，所有模块 lint/build/test 与新增交互/持久化/安全回归通过。
- 真实 Renderer 自动化覆盖输入、计划、流式消息、工具卡片、Review、恢复、Terminal/Browser 边界。
- 所有跟踪 JSON 解析；`git diff --check`、路径白名单、依赖、TODO/Mock、私钥、缓存和
  `node_modules` 跟踪检查通过。

### 6.2 Win10

- 精确工具链和锁定原生闭包；产品入口、长会话、多文件 Review、真实测试、恢复和生命周期通过。
- 新 ZIP、manifest、ASAR 外置、PE/API/CRT、SBOM、许可证与 sidecar 双向哈希一致。

### 6.3 Win7

- 新唯一租约下执行需求合同 §8 的十二条真实用户旅程。
- 上传前后本地 SHA-256 与 `certutil` 双向核对；轮前轮后 Bitvise、22 端口、相关进程和系统状态符合
  既有协调纪律。
- 安装、并行共存、升级、故障回滚、卸载和零残留通过；不得修改网络、路由、防火墙、PATH、服务或重启。

### 6.4 完成裁决

只有开发机、Win10、Win7 三层均绑定同一候选且分别 PASS，任务才可从
`APPROVED_FOR_IMPLEMENTATION` 升为 `COMPLETE / A8_RC_PASS`。任何单层或 harness PASS 都不得冒充
产品 MVP PASS。

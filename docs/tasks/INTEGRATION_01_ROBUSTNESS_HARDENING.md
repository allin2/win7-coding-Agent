# INTEGRATION_01 — Phase 3–7 整合与健壮性修复

> 实现前必读：`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、`docs/DECISIONS.md`
> （ADR-0011/0027/0029/0030/0036/0037）以及 Phase 3–7 任务书。

## 0. 实现授权（ADR-0011 / C14）

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: INTEGRATION_HARDENING
Target Branch: codex/integrated-robustness
Authorization: Project owner request, 2026-07-30
Phase-Gate: IMPLEMENTING
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: SPIKE_01~04 and Win7 SP1 x64 end-to-end validation remain outstanding
```

本文档是整合授权与验收合同，不是当前测试结果日志。执行结果、测试数量和环境快照统一记录在
[`docs/STATUS.md`](../STATUS.md) 与 [`docs/reports/README.md`](../reports/README.md) 指向的日期报告中。

本任务由项目负责人在 2026-07-30 明确要求：“整合项目代码；修复相关问题；同步更新
`docs/ROBUSTNESS_AUDIT.md`；删除不必要的文件；评估是否重写 Phase 1、2、3。”
本文档把该请求固化为可审计的跨阶段整合授权，不修改任何已 Accepted ADR 正文，
也不扩大 Phase 3–7 各自的产品范围。

### 0.1 路径白名单

- `src/gateway/**`
- `src/workspace/**`
- `src/state/**`
- `src/core/**`
- `src/runner/**`
- `src/git-adapter/**`
- `src/shell/**`
- `tests/gateway/**`
- `tests/workspace/**`
- `tests/state/**`
- `tests/core/**`
- `tests/runner/**`
- `tests/shell/**`
- `tests/integration/**`
- 根目录 `.gitignore`、`package.json`（仅限整合验证入口，不新增运行时依赖）
- `scripts/verify_integration.mjs`（仅限结构化调用各模块验证命令）
- 本任务文档、`docs/ROBUSTNESS_AUDIT.md`
- 为消除状态冲突而必须同步的 `README.md`、`docs/ROADMAP.md`、
  `docs/PROJECT_CHARTER.md`、`docs/ARCHITECTURE.md`
- `docs/DECISIONS.md` 仅允许追加新 ADR，不得改写已 Accepted ADR 正文

禁止路径：

- `src/phase1-2/win7_agent/**`（Phase 1/2 Python legacy 冻结，ADR-0029）
- `native/helper/**` 与真实进程 containment 实现（等待 SPIKE_02）
- 交互终端宿主、winpty/node-pty 定稿实现（等待 SPIKE_02）
- 任何未在上方列出的应用代码路径

## 1. 基线与整合来源

整合必须保留 Git 历史，不得复制分支工作树或把 `dist`/`node_modules` 当作源码：

| 模块 | 权威来源 |
|---|---|
| Gateway | `phase/03-model-gateway` |
| Workspace | `phase/04-workspace-write` |
| State/Audit | `phase/05-state-audit` |
| Core/Runner/Git Adapter | `phase/06-agent-core-runner` |
| Desktop Shell | `phase/07-desktop-shell` |
| Phase 1/2 legacy | 保留原分支与验证标签，不整体迁移 |

整合分支以 Phase 6 为基础，合并 Phase 5 与 Phase 7；Phase 6 已继承 Phase 3/4。
Phase 5、6、7 为从 Phase 4 分出的并行分支，不能把当前工作树中缺少某目录解释为
“源码丢失”。

## 2. 目标

1. 形成同时包含 Phase 3–7 权威 TypeScript 源码的可审查整合基线。
2. 修复已复现且影响安全、数据一致性、可恢复性或用户交互的缺陷。
3. 统一关键错误语义，使 UI 能给出可操作的失败原因、重试建议和恢复状态。
4. 提供根级验证入口，避免用户逐个猜测模块命令。
5. 重写健壮性审计，使每项结论包含源码位置、复现/测试证据、适用分支和状态。
6. 清理工作树中的派生物与平台垃圾文件，并用忽略规则阻止再次污染。

## 3. 非目标与安全边界

- 不宣称 Phase 3–7 完成；Win7 实机、企业代理/CA、原生依赖和安装包验证仍是硬门槛。
- 不在 SPIKE_02 前实现或模拟“安全 containment”；真实 Runner 继续 fail-closed。
- 不实现 full-access 本地模式，不把 workspace-write 描述为沙箱（ADR-0030）。
- 不把 Electron 22 的 EOL 风险包装成已解决；Renderer 不加载不可信远程内容。
- 不重写 Phase 1/2 legacy，不把 Python 源码自动翻译或整体复制到 Node Core。
- 不用 Mock 组件冒充默认生产路径或完成端到端能力。

## 4. 必修缺陷

### 4.1 Gateway

- 重试次数、总时限和退避配置必须真正生效，禁止递归无限重连。
- 默认网络栈必须是生产网络栈；Mock 只允许测试显式注入。
- Provider 与网络栈使用同一 TLS 配置；生产路径仅允许 HTTPS、TLS 1.2+、证书校验开启。
- HTTP/代理/TLS/协议版本/流截断错误映射为任务书定义的结构化错误。
- SSE 增量解析保留内容空格，支持跨 chunk 事件；无完成信号的流不得合成成功。
- 并发请求的数据与错误事件必须按 request id 隔离；断开连接须中止在途请求。
- Node 网络栈边接收边交付数据，不得等待整个响应结束才模拟“流式”。

### 4.2 State/Audit

- WAL 事务必须 all-or-none；部分写入失败不得把事务标记成已回滚却保留事件。
- backlog drain 失败时不得丢事件，成功后才移除队列项。
- 存储错误必须使用结构化错误类型；内存实现设置明确容量上限。

### 4.3 Core/Runner/Git

- Approval Mode 与 ADR-0030 一致，不暴露 full-access。
- 结构化 argv 中的普通元字符不得被误判为 Shell 拼接；Shell 宿主和间接执行面仍须拒绝。
- SPIKE_02 前真实 Runner 明确返回 capability unavailable，不得降级为不受控 `spawn`。
- Core 的用户可见错误包含建议动作，并区分“能力尚未验证”和“执行失败”。

### 4.4 Shell/Updater

- IPC 同步/异步处理契约明确；Listener 异常不得静默吞掉。
- 审批消息携带可稳定绑定预览与执行的摘要/基线；diff 明示编码、EOL、截断状态。
- Updater 必须先验签/验哈希再应用；使用同卷目录切换与可验证回滚，回滚失败不得显示
  “已回滚”。
- 大文件使用流式哈希；错误包含恢复建议，避免只展示内部异常。

## 5. 用户体验与交互验收

- 首次运行或能力缺失时展示“为什么不可用、用户可做什么、是否可安全重试”，不能只给错误码。
- 流式响应不得吞首空格、串线、静默截断或在失败后显示为成功。
- 审批页面展示精确目标、工作区基线和预览摘要；批准内容变化后必须重新审批。
- 更新失败明确区分“未应用”“已自动回滚”“回滚失败需人工恢复”三种状态。
- 根级验证命令应输出模块名、失败命令、退出码和下一步，不要求用户搜索各目录 README。

## 6. 删除与保留规则

允许删除：

- 各模块 `node_modules/`、`dist/` 等可从锁文件和源码再生的派生物；
- `.DS_Store` 等平台垃圾文件；
- 与权威分支源码逐字等价、且仅由错误切分工作树遗留的重复文件。

必须保留：

- 未提交但具有独立断言价值的测试，直到纳入测试集或明确证明重复；
- 锁文件、Schema、fixture、Win7 实机证据；
- 任一分支上唯一存在的手写源码和测试；
- Phase 1/2 验证标签与历史分支。

删除前必须用精确路径核对；禁止对仓库根目录或未解析变量执行递归删除。

## 7. 验证矩阵

1. 每个修改模块执行 TypeScript 编译、lint 和单元测试。
2. Gateway 增加：有限重试、总时限、HTTPS/TLS fail-closed、协议不兼容、
   跨 chunk SSE、并发隔离、流截断、取消与 HTTP 状态映射测试。
3. State 增加：批量中途失败零落盘、backlog 失败不丢失、容量上限测试。
4. Shell 增加：异步 IPC 误用、Listener 异常审计、更新校验失败、
   应用失败回滚成功/失败三态测试。
5. 执行 Phase 1/2 可在当前宿主运行的回归，结论只代表现代开发机，不代替 Win7。
6. 扫描工作树，确认无未忽略 `node_modules`、`dist`、`.DS_Store`。

## 8. 完成门槛

- 整合分支同时包含 Phase 3–7 权威源码，来源可追溯。
- 本任务 §4 的修复有自动化回归证据；未修项在审计中明确为 Open/Blocked。
- `docs/ROBUSTNESS_AUDIT.md` 不再把分支隔离、未检出或生成物当成源码事实。
- Phase 1/2/3 重写评估写入审计，包含理由、风险、成本和建议动作。
- 所有开发机验证通过后，Phase-Gate 最多更新为 `READY_FOR_WIN7_VALIDATION`；
  未完成 Win7 实机验证前不得标记 `COMPLETE`。

## 9. 当前验证记录

开发机验证结果：

- 根级验证结果以最终代码基线重新执行后写入 [`docs/status/latest-validation.json`](../status/latest-validation.json)；本任务书不再复制随时间变化的测试总数。
- Phase 1 开发机回归：20 个单元测试 + 2 个集成测试通过。
- Phase 2 从 `phase/02-readonly-agent` 导出的独立工作树回归：81 个测试通过。
- 清理检查：工作区不保留模块级 `node_modules/`、`dist/` 与非 `.git` 的 `.DS_Store`。
- 上述结果来自现代 macOS 开发环境，不替代 Win7 SP1 x64 实机验收。

```text
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: SPIKE_01~04、真实 Runner/containment、跨模块产品 E2E 与 Win7 SP1 x64 实机证据尚未完成
```

## 10. Agent 设计闭环增补（2026-07-30）

项目负责人在架构验收报告
`docs/reports/2026-07/win7_coding_agent_architecture_acceptance_comparison_2026-07-30.*`
形成后明确要求“修复 Agent 设计问题”。本节将该指令固化为当前整合任务的 P0
设计闭环授权；路径白名单仍严格沿用 §0.1，不授权 Electron 产品入口、真实
containment、原生依赖或 Win7 实机结论。

### 10.1 原子需求与验收

| ID | 可测试要求 | 当前基线 | 本轮动作 | 验收证据 |
|---|---|---|---|---|
| DG-01 | 当前 Node Core 提供可运行的单 Agent 纵向 Loop；模型、工具、事件与验证依赖显式注入，Mock/Replay 不得成为隐式生产默认值 | 缺失 | 新增确定性 Runtime 编排 | 正常、Policy 拒绝、工具失败、验证失败集成测试 |
| DG-02 | Core 不得从执行态直接进入完成态；只有 Verification Gate 通过并生成可校验 `EvidenceBundle` 后才能完成 | 偏离 | 增加 `VERIFYING` 状态、验证门与证据摘要 | 状态机负向测试 + Evidence 摘要稳定性测试 |
| DG-03 | 工具必须来自版本化 `ToolSpec` 注册表；上下文必须输出带预算、选择结果、截断原因和摘要的 `ContextManifest` | 缺失 | 新增 Tool Registry 与有界 Context Manager | 未注册工具拒绝、预算截断与确定性测试 |
| DG-04 | workspace-write 审批必须绑定精确执行请求与工作区基线；执行前重新校验，内容变化、过期、重放均 fail-closed | 部分 | 新增审批记录、指纹与一次性消费 | 篡改、过期、重放负向测试 |
| DG-05 | `applyPlan` 必须强制接收 workspace root，在备份、建目录、替换和写后阶段重复校验最终路径；回滚失败不得冒充成功 | 偏离 | 收紧 Apply 契约和结果状态 | `..`、绝对越界、祖先 symlink、回滚失败测试 |
| DG-06 | Git Adapter 不得直接调用 `child_process`；所有 Git 执行须进入注入的 Runner，未配置或 containment 不可用时 fail-closed | 偏离 | 删除直接 spawn 路径，改为 Runner 端口 | 源码扫描、请求映射、无 Runner/Runner 失败测试 |
| DG-07 | 事件必须具备同一 Session 内稳定顺序以及 Run/Thread 关联；相同 ID 的同内容重试幂等、冲突内容拒绝 | 部分 | 增加事件身份与存储幂等语义 | 顺序、幂等重试、冲突重放测试 |

### 10.2 明确延期项

- SQLite/FTS 持久化、崩溃后 Thread 恢复等待 SPIKE_04 精确 ABI 与 Win7 实机结论；
  本轮只关闭事件身份、顺序与幂等的设计缺口，不冒充持久化完成。
- 真实 Runner/Job Object、MinGit G10 和交互终端继续分别等待 SPIKE_02/03；
  本轮必须保持 fail-closed。
- Electron main/preload/renderer 与可视化五视图等待 SPIKE_01；本轮只建立可被 App
  Server 调用的 Core 契约，不构造未验收桌面壳。
- 企业代理/CA、DPAPI、安装与更新交付仍属环境/工件验收，不由 Mock 测试替代。

### 10.3 完成门槛

1. DG-01~DG-07 各自具备自动化正向和负向证据。
2. 根级验证与所有受影响模块 lint/build/test 通过。
3. 静态扫描确认 Git Adapter 无 `child_process`，Workspace Apply 无不带根目录的写入口。
4. `docs/ROBUSTNESS_AUDIT.md` 更新追踪状态；未完成项保持 Open/Blocked。
5. 即使本节全部通过，阶段状态仍至多为 `READY_FOR_WIN7_VALIDATION`，不得宣称
   Win7 或生产交付完成。

### 10.4 实施结果

DG-01~DG-07 已在开发机证据边界内关闭：

- Core 已形成模型规划、ContextManifest、ToolSpec、Policy、审批暂停/精确恢复、工具执行、
  Verification Gate、EvidenceBundle 和完成态的纵向闭环；所有外部能力均需显式注入。
- workspace-write 能力令牌绑定会话、调用 ID、工具名、规范化请求、预览摘要和基线摘要；
  无验证器、跨会话、内容漂移、过期或重放均 fail-closed。
- Workspace Apply、Runner 和 Git Adapter 在最终执行点再次消费同一类审批绑定；Git Adapter
  不再拥有直接进程启动入口。
- EventStore 为事件补齐 Run/Thread/Session sequence，并对同内容重试幂等、冲突重放拒绝。
- 根级验证新增 5 项不可绕过的静态设计门，防止完成态、审批消费和 Git 执行入口回退。

尚未关闭的产品装配、持久化、原生 containment、桌面 UI 和 Win7 证据继续按 §10.2
保持 Open/Blocked；这些属于明确的阶段/环境门禁，不再与本轮已修复的 Agent 设计缺陷混淆。

## 11. Win7 MVP 产品装配增量 1（ADR-0055）

项目负责人于 2026-08-02 授权 Codex 对剩余实机问题作出 MVP 裁决并继续开发。本节在既有
§0.1 路径白名单内授权第一阶段真实产品装配，不授权真实 containment、交互终端或未登记依赖。

### 11.1 本增量实现范围

- 在 `src/shell/**` 建立可由锁定 Electron 22.3.27 直接启动的 main/preload/renderer 本地入口。
- BrowserWindow 必须启用 `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true`；
  禁止导航、新窗口、权限请求和非白名单 Session 出站。
- preload 只暴露版本、运行模式和只读诊断；任务执行、终端输入、文件写入与凭据能力不得暴露。
- UI 必须明确展示 `Runner=不可用（fail-closed）`、`State=内存模式`、`Gateway=未配置/Replay`
  等延期能力，不能把演示状态冒充生产连接。
- 增加可自动关闭的 smoke 模式，供 Win7 实机验证启动、Renderer 就绪、诊断回传和退出。

### 11.2 本增量完成门槛

1. Shell lint/build/test 和根级验证通过。
2. 静态测试证明 BrowserWindow 权限、导航、出站和 preload 暴露面不可放宽。
3. 在 Win7 的新部署目录及隔离 userData 下启动真实入口，回收结构化 smoke 报告并正常退出。
4. 不修改网卡、路由、防火墙、Bitvise、机器 PATH、注册表或系统服务。
5. 完成本增量只关闭“无真实 Electron 入口”缺口；安装器、完整五视图、真实任务执行和正式
   W7C/E5/E6/E7 仍按各自 Gate 推进。

## 11.3 Win7 MVP Desktop Alpha 1 只读纵向切片（ADR-0056）

项目负责人于 2026-08-02 进一步授权在本任务既有白名单内实施 Desktop Alpha 1。
本节覆盖真实 Electron 产品入口中的一条只读产品链路：
`Shell → Core → State → Workspace → Replay`。它是 MVP 产品装配增量，不改变
Phase 1/2 冻结合同，也不把 Replay 或 Mock 描述为真实模型。

### 授权路径

- `src/shell/**`
- `src/core/**`，仅限缺少公共只读装配接口时修改
- `src/state/**`，仅限缺少有界内存事件适配接口时修改
- `src/workspace/**`，仅限缺少只读端口或显式编码读取适配时修改
- 上述目录中的对应测试
- `scripts/mvp_acceptance/build_desktop_alpha1.mjs`
- 本任务书与仅用于 A1 验收的状态/脚本文档

### 允许的产品能力

- 单工作区、单活动任务、并发固定为 1。
- 系统目录选择器选择并规范化工作区路径。
- 内存 Session Service、会话与工作区一对一绑定，以及创建/列出/关闭会话。
- 确定性 Replay Model Adapter；Replay 必须实际经过 Core Runtime 和 Workspace
  `list_directory`、`search_text`、`read_text` 工具，再由 State V2 事件投影驱动 UI。
- 运行中的取消、结构化错误、能力诊断和有限事件队列。
- Renderer 仅通过白名单 Preload API 发送用户意图和接收产品视图事件；产品入口只加载可信
  本地资源，默认拒绝出站、导航、新窗口和权限请求。
- State 使用有容量上限的内存事件存储；重启恢复、SQLite、FTS 和正式持久化不在本节内。
- 只读工作区显式支持 UTF-8、显式 `gbk` 和 CRLF 行解析；未知编码继续 fail-closed。

### 明确禁止

- 真实 Gateway/模型、Runner/containment、winpty/node-pty、交互终端、Git 子进程、工作区写入、
  Diff/审批执行、SQLite/原生依赖、凭据和任意网络。
- Renderer 直接访问 Node、文件系统、进程、凭据或通用 IPC。
- 伪造完成事件、在取消后继续产生 `task.completed`，或把延期能力显示成可点击的伪功能。
- 当前分支切换、提交或推送；不要求、不执行 Git 写操作。

### A1 验收门槛

1. IPC 请求、事件和错误经过版本化 Schema；未知字段、未知消息、伪造 session、越权任务和
   非法工作区路径被拒绝并留下可检查的审计记录。
2. Shell、Core、State、Workspace 的 lint/build/test 与根级 `npm run verify` 通过。
3. 开发机跨模块测试证明 Replay → Core → Workspace → State 的事件顺序、`list/search/read`
   调用顺序、重复事件处理和取消竞态。
4. Electron 产品 smoke 证明启动、Renderer 就绪、诊断回传和正常退出；Win7 A1-W01～W12
   仍需在目标实机用独立 MVP ID、工件哈希、文件前后哈希和进程清理证据验收，开发机结果不得替代。
5. 完成 A1 只允许标记为“只读 Replay Alpha”；不宣称完整 Coding Agent、真实模型、正式发布
   或 Win7 正式任务 Gate 通过。

## 11.4 Desktop Alpha 2 受控单文件修改闭环（ADR-0057）

项目负责人于 2026-08-02 授权在 A1 只读 Replay 纵向切片之上实施 Desktop Alpha 2。
本节只授权一次一个文本文件的“意图 → 可信计划/Diff → 显式审批 → 原子写入 → 校验/回滚”
闭环；不授权真实模型、Runner、Git、终端、Gateway、SQLite、凭据或多文件事务。

### 授权路径

- `src/core/**`：仅限 `ToolCallPreparationPort`、可信写入计划的审批挂起/恢复与对应测试。
- `src/workspace/**`：仅限单文件计划、Diff、编码/EOL 检测、原子应用、回滚、恢复清单与对应测试。
- `src/state/**`：仅限 A2 写入/审批/回滚事件的内存投影与对应测试；不得引入 SQLite。
- `src/shell/**`：仅限 Desktop Host IPC、Diff/审批/恢复 UI、撤销计划与对应测试。
- `scripts/mvp_acceptance/**`：A2 便携包构建、一次性工作区探针和证据收集脚本。
- 本任务书、`docs/DECISIONS.md`、`docs/acceptance/**`、`docs/status/**`、`docs/STATUS.md`。

不得新增运行时依赖；不得触碰 Phase 1/2 legacy、真实 containment、交互终端、Git 子进程、
网络或系统配置路径。

### A2 合同

- 只允许既有 UTF-8、UTF-8 BOM 文本文件，单文件、单次、唯一精确锚点 `str_replace`。
- 明确拒绝 GBK、二进制、编码不确定、超大文件、Diff 截断、重复/缺失锚点及路径边界逃逸。
- 模型只能提交修改意图；主进程 TrustedWritePreparer 必须重新读取文件并生成不可变
  `WritePlan`、Diff、基线/目标哈希、编码、BOM、EOL 和唯一锚点。模型提供的哈希不得成为可信依据。
- Core 审批挂起只保存可信计划身份；批准同时绑定 Core workspace-write 能力令牌和 Workspace
  一次性 ApprovalLedger。拒绝、过期、取消、关闭会话、跨 Session/Turn、内容漂移和重放均 fail-closed。
- Workspace 执行边界必须重新校验工作区、计划 TTL、基线哈希和一次性审批；写入只能经过
  `applyPlan`，采用备份、临时文件、同卷原子替换、重读校验和失败恢复。
- 回滚失败必须锁定该工作区后续写入并展示人工恢复指引；不得显示“已回滚”。撤销必须作为
  新计划重新预览并再次审批。
- 恢复清单必须版本化；启动时只识别并展示未完成事务，不得静默继续写入。A2 状态仍为内存模式，
  不得宣称会话跨重启恢复。

### A2 完成门槛

1. A1 Win7 W01～W12 已有 `OWNER_ACCEPTED_FOR_MVP` 证据；A2 只使用一次性测试工作区。
2. 开发机具备可信计划、审批、写入、漂移、回滚、恢复、撤销和 UI 的正负向自动化测试。
3. Win7 GUI 完成 A2-W01～W15：计划/Diff、拒绝、批准写入、漂移拒绝、伪造拒绝、编码边界、
   故障回滚、回滚锁定、重启恢复识别、撤销、清理和系统/网络不变。
4. 未经批准目标文件哈希不变；批准内容与最终写入内容精确绑定；无 `.tmp`、`.bak`、产品进程
   或未声明网络活动残留。
5. A2 只能标记为 `Desktop Alpha 2 PASS`（MVP 实机口径）；不改变正式 Phase/发布 Gate，
   不把 Runner、Git、终端、Gateway 或 SQLite 记为可用。

### A2 开发机实施记录（2026-08-02）

- 已实现 Core `ToolCallPreparationPort`、Workspace `TrustedWritePreparer`、双重一次性审批、
  原子写入/校验/回滚、版本化恢复清单、撤销新计划，以及 Desktop Host/IPC/Renderer 审批与恢复 UI。
- A2 Host 自动化覆盖可信 Diff 尚未写入、批准写入、用户拒绝、基线漂移拒绝和撤销重新审批：4 项通过。
- 受影响模块结果：Workspace 79 项、Core 225 项、Shell 87 项测试通过；Shell lint/build 通过。
- 已生成 `outputs/desktop-alpha2/` 便携包，包含锁定 Electron 22.3.27；包内 `manifest.sha256` 已生成。
- 根验证的 Gateway 本地 HTTP 集成测试在当前 macOS 沙箱因 `listen EPERM` 受环境限制；这不改变
  A2 本地写入结论，需在允许 loopback 的环境重跑整仓验证。
- 2026-08-02 Win7 增量实机证据：A2-W03“用户拒绝”通过；修复包运行于
  `C:\Win7CodingAgent\desktop-alpha2`，测试工作区为
  `C:\Win7CodingAgent\A2-test-workspace`。用户界面显示“用户拒绝了这次大文件修改，Replay
  保持工作区不变”；SSH 只读核验确认 `src\hello.ts` 内容保持为
  `export const hello = "world";`，SHA-256 为
  `ae93b90c9787a544f9712c9a9cfa7328d91cf83201adecfb46f8d4707090f1fb`。
- 同日 A2-W04“显式批准后写入”通过；用户在 Win7 GUI 批准后，SSH 只读核验确认
  `src\hello.ts` 内容为 `export const hello = "world";  // A2 Replay edit`，目标
  SHA-256 为 `10cf3c196905e83f984d5980e06da21fa210345386f31049d101553445832fac`，
  与 UTF-8/CRLF 预期字节一致，且未发现 `.tmp` 或 `.bak` 残留。
- 当前仍为 `Win7-Validation: NOT_PERFORMED`；未取得 Win7 A2-W01～W15 原始证据前，不标记 A2 PASS。

## 11. Agent Loop 第一讲验收闭环（ADR-0039）

### 11.1 需求追溯

| ID | 原子要求 | Core 实施证据 | 状态 |
|---|---|---|---|
| AL-01 | Thread/Turn/Step 分层；Turn 管预算和取消，Step 管模型重试 | `RuntimeRequest.threadId/turnId`、`RuntimeModelInput.step/attempt`、版本化事件身份 | Implemented |
| AL-02 | Turn 只有完成、待审批、预算耗尽、取消、卡死、失败六类结局 | `TurnOutcome` 六值枚举及六分支行为测试 | Implemented |
| AL-03 | 工具结果返回模型，由模型决定下一 Step | `AgentRuntime` 模型→工具→模型循环；工具消息进入下一 Step | Implemented |
| AL-04 | Step、Token、墙钟时间、工具调用四维预算 | `TurnBudget`、`TurnUsage`、四维独立边界测试 | Implemented |
| AL-05 | 预算耗尽时执行一次无工具收尾，失败时仍有本地摘要 | `toolChoice=none` 收尾 Step、独立宽限与确定性回退测试 | Implemented |
| AL-06 | 模型失败仅在当前 Step 内有界重试，工具不自动重放 | `callModelWithRetry` 与重试次数/事件断言 | Implemented |
| AL-07 | 连续相同工具名与规范化参数触发 STUCK | `LoopDetector` 的稳定 SHA-256 签名与重复任务测试 | Implemented |
| AL-08 | Policy DENY、工具失败、预算和取消均保持 tool call/result 配对 | `ToolExecutionResult.status`、拒绝/失败/未执行/取消配对测试 | Implemented |
| AL-09 | 审批挂起可序列化并从原点恢复，不重规划、不重置预算 | `RuntimeCheckpoint 2.0` 保存事件锚点、计划、用量和验证要求；消息由 State V2 投影恢复 | Implemented / SQLite persistence Blocked |
| AL-10 | 取消传播到模型、验证器和工具；有副作用工具清理不明时 fail-closed | AbortSignal、Executor `cancel` 契约、`CANCELLATION_FAILED` 负向测试 | Core Implemented / Win7 Runner Blocked |
| AL-11 | 所有结局和关键分支事件化 | `turn.started/suspended/resumed/finished`、Step、预算、审批、Policy、工具、验证和错误事件 | Implemented |
| AL-12 | COMPLETED 只能来自无待决工具的最终模型响应且 Verification Gate 通过 | 最终响应、状态机和 EvidenceBundle 正负向测试 | Implemented |

### 11.2 验证与环境边界

- Core 定向测试覆盖正常循环、验证失败、非法工具、工具异常、审批挂起/恢复、模型重试、
  Policy DENY、STUCK、四维预算、预算收尾、模型/验证/工具取消和清理失败。
- 当前开发机证据仅证明 TypeScript/Node 逻辑合同；真实 Job Object 进程树终止继续等待
  SPIKE_02，Checkpoint 的 SQLite 崩溃恢复继续等待 SPIKE_04。
- 未完成 SPIKE_01~04 和 Win7 SP1 x64 实机验证前，本节不得解释为 Win7 产品验收通过。

### 11.3 第一讲附带缺陷复核（ADR-0040）

| ID | 验收报告缺陷 | 复核结果 | 修复与自动化证据 |
|---|---|---|---|
| AL-F1 | STUCK、运行中取消、取消清理失败会遗留同批孤儿 tool calls | Confirmed | 三条路径统一配对后续未启动调用；分别增加批次负向测试 |
| AL-F2 | EventSink 失败会误报模型错误并在收尾二次抛出 | Confirmed | 新增三阶段存储故障、`traceComplete`、`EVENT_STORE_FAILED`；覆盖 startup/running/finalizing 及审批挂起失败 |
| AL-F3 | Turn 建立前入参校验抛泛型错误 | Confirmed | 上下文、TurnBudget 与 Checkpoint 版本错误统一为 `RUNTIME_INPUT_INVALID` |
| AL-F4 | 未知内部异常误报 `MODEL_FAILED`，Run 序号缓存不释放 | Confirmed | 新增 `INTERNAL`；终态释放 per-Run 序号/故障状态，审批挂起保留到恢复完成 |

以上均为 Node Core 开发机合同修复。真实 EventStore 持久化继续等待 SPIKE_04，真实
Win7 进程树取消继续等待 SPIKE_02；本节不改变 `Win7-Validation: NOT_PERFORMED`。

## 12. 第二讲状态、事件与协议修复（ADR-0041）

### 12.1 验收缺口与实施范围

本任务将 State 的 V2 事件信封、确定性投影与多订阅队列纳入本分支：事件必须具备 Thread 内稳定序号、Thread/Turn/Run 关联、UTC 时间和 schema version；消息、文件变化与工具结果为投影，禁止把它们作为平行持久化真相。`started` 无 `finished` 的工具调用必须在投影中安全收口为 `interrupted`。未知事件类型不得阻塞旧消费者，必须跳过并留下结构化警告。

工具输出 delta 可以按订阅者背压合并；所有事实事件不得静默丢弃。`compaction.applied` 只记录摘要覆盖关系，原始事件始终保留。重试分类改为数据表驱动，具体调用边界将在 Core 适配时消费该表。

### 12.2 明确不在本节声称完成的事项

- SQLite、WAL 崩溃注入、断电原子性、跨进程重启恢复与真实 Restore/Re-execute 决策继续受 SPIKE_04 约束；内存账本和单进程测试不是该项替代证据。
- 文件系统实际写入与 `file.changed` 的生产事务适配必须在 Workspace/Core 接入后进行；本节先提供同批事件合同与投影测试。
- Win7 SP1 x64 验证、真实 containment 和桌面 UI 仍分别受既有 SPIKE/阶段门禁约束。

### 12.3 验收报告复核与修复追溯（ADR-0043）

| ID | 报告问题 | 复核状态 | 修复证据 | 剩余边界 |
|---|---|---|---|---|
| SE-F1 | Core Checkpoint 把 messages 当持久状态，恢复不消费投影 | Implemented（开发机合同） | `RuntimeCheckpoint 2.0` 删除 messages；`RuntimeMessageProjector` 成为恢复必需端口；投影优先级和无投影拒绝测试 | SQLite/kill-9 跨进程加载仍由 SPIKE_04 阻塞 |
| SE-F2 | Core、State V1、State V2 三套事件未连接且有双 seq 权威 | Implemented（V2 接入） | `RuntimeEventLedgerSink` 类型映射、确定性事件 ID、V2 Thread seq；工具生命周期/幂等/冲突测试 | State V1 仅保留历史兼容，不再作为 Core 恢复入口 |
| SE-F3 | `compaction.applied` 不改变 messages 投影 | Implemented | 活动 range 摘要替换、supersedes DAG、原始事件保留测试；Core context overflow 记录压缩事实后重试 | 压缩策略和持久事实来源由生产装配提供 |
| SE-F4 | Core 对所有模型异常一律重试 | Implemented | `MODEL_RETRY_POLICY` 与分类端口；认证错误一次失败、网络错误重试、context overflow 压缩后重试测试 | 供应商新增错误码须按协议增量登记 |
| SE-F5 | 缺少统一 `submit/subscribe` 门面 | Implemented（Core 合同） | `AgentRuntimeProtocol` 支持 run/resume/cancel 与独立事件订阅；取消和重复 Run 测试 | Electron/CLI 产品装配仍 Open |
| SE-F6 | State 无持久化落地 | Blocked | 内存实现继续明确标注非持久恢复 | 等待 SPIKE_04 SQLite/WAL/FTS 与 Win7 实机证据 |

## 13. 第三讲工具执行与命令契约修复（ADR-0042）

### 13.1 本轮授权与验收

本节将命令执行边界升级为 Runner V2：请求必须声明总超时、空闲超时、独立 stdout/stderr
字节上限、绝对工作目录、受控环境覆盖和关闭的 stdin；结果必须以 `status` 联合区分
正常退出、总超时、空闲超时、取消、启动失败、策略拒绝、能力不可用与清理失败。预期失败
必须结构化返回，不得以 Promise rejection 作为业务分支。输出必须持续计数并在越限后保留
头尾片段和遗漏字节数。

Git Adapter 的 Runner 映射必须同步采用该契约：Git 不持有 `child_process` 入口，隔离环境
以 `envOverlay` 进入 Runner，未注入受控 Runner 时 fail-closed。验收包含 Runner/Git Adapter
的类型检查、结构化负向结果、独立双流截断、路径与 stdin 校验，以及对 Git Adapter 的
`child_process` 静态扫描。

### 13.2 延期边界

本节不授权真实进程启动、Job Object、Restricted Token、CP936/控制台编码探测、进程树终止
或交互终端。`UnavailableRunner` 是生产路径上的明确拒绝，不是执行降级；上述能力只能在
SPIKE_02 实机 Go 结论、原生 helper 哈希/SBOM 登记和对应任务书完成后接入。

## 14. 第四讲上下文工程修复（ADR-0044）

### 14.1 授权与验收

本节授权在既有 §0.1 白名单内实现 Context Harness：模型输入只能使用受保护的最终投影；
摘要必须绑定内容、顺序和工具目录；规则 root→cwd 分层；工作记忆始终位于尾部且硬约束不可由
模型删除；工具观察有界、可折叠；达到 75% 水位批量压缩并预留至少 20% 输出空间。

验收必须覆盖：同长度内容变化导致摘要变化、未选上下文不可见、受保护预算溢出 fail-closed、
AGENTS 冲突顺序、模型无法删除约束、工具输出截断与可逆折叠、稳定前缀摘要及 20+ Step 无漂移
场景。Core/State/Gateway 的开发机测试不构成 SQLite、Win7 或生产交付结论。

### 14.2 延期边界

- 可执行 Skill/MCP/Hooks 宿主继续按 ADR-0035 延期至 v1.1；本节只实现常驻规则与数据式指令边界。
- 持久化观察内容、跨进程恢复与 Win7 上下文性能实测继续等待 SPIKE_04/对应实机验收。
- 不引入 embedding、向量数据库或未登记的运行时依赖；仓库上下文保持 Agentic Retrieval 主路径。

### 14.3 实施结果（2026-07-31）

- Core 模型边界只接收受保护投影、固定排序 ToolSpec 和 ContextUsage；内容、工具描述与
  Schema 均进入摘要。显式模型窗口在 75% 水位执行一次批量压缩、保留 20% 输出空间，
  压后仍超线则 fail-closed。
- Runtime Bootstrap 接收结构化环境快照，并在运行入口调用用户规则与 repo root→cwd
  `AGENTS.md` 发现；规则使用 realpath 边界、UTF-8 字节上限和 protected stable prefix。
  Electron/CLI 产品宿主仍须在对应阶段把实际环境/Git Adapter 快照传入。
- `agent.update_plan` 是 Harness 内部控制工具，只能更新 plan/currentStep/findings；
  goal 和来源约束不可提交修改。工作记忆带 revision，始终位于模型消息尾部，Checkpoint
  保存其快照以支持审批恢复。
- Workspace 提供浅层 list、有界 read/search，Core 提供固定 ToolSpec、端口路由和执行适配；
  当前库级闭环已验证，Electron/CLI 的最终组合根仍属阶段装配工作。
- 工具观察保留完整事实事件，但模型投影严格有界并携带摘要、截断状态与 SHA-256；
  旧观察按 8 条一批折叠，最近 4 条保留完整。默认确定性压缩器生成可恢复引用，
  State 只替换投影、不删除原始事实。
- 开发机验证：Core 20 suites / 210 tests、Workspace 8 suites / 69 tests、
  State 16 suites / 217 tests 全部通过。24 次 `update_plan` + 最终响应的 25-Step
  Replay 保持目标和硬约束。以上不替代真实 Gateway token/KV 指标、产品 E2E 或 Win7 实机验收。

## 15. 第三讲 ACI 复核增补（ADR-0045）

### 15.1 问题真实性与处置

| ID | 报告问题 | 复核 | 本轮处置 | 验收 |
|---|---|---|---|---|
| ACI-01 | Runner 缺少双超时、结构化失败和字节级有界输出 | 已由 ADR-0042 修复 | 保持 Runner V2，不重复实现 | Runner 45 项开发机测试 |
| ACI-02 | 没有真实安全 Runner | 真实，但受门禁阻断 | 继续返回 `capability_unavailable` | SPIKE_02 + Win7 实机 |
| ACI-03 | ToolSpec 参数缺少 description/enum/default | Confirmed | ToolSpec V2 强制参数说明，校验 enum/default，并在执行前应用默认值 | Registry 注册/克隆/归一化/Runtime 执行测试 |
| ACI-04 | Workspace 没有锚文本替换及高质量零/多命中反馈 | Confirmed | 新增精确锚替换计划前端；仍输出原有 SHA 绑定 `WritePlan` | 唯一、零、多命中、BOM/CRLF、编码与大小测试 |
| ACI-05 | diff 只有文件状态，Apply 成功不回传内容级预览 | Confirmed | 所有新计划生成有界内容 preview；Shadow diff 和 Apply result 携带同一 preview | added/modified/deleted、截断、Apply 回传测试 |
| ACI-06 | Phase 2 报错笼统，search 无总命中/context，read 工具重叠 | Confirmed 于冻结分支 | 当前任务禁止修改 `src/phase1-2/win7_agent/**`；记录为 legacy 已知限制，Node 继承时不得复制该偏差 | Phase 2 任务书变更或后续 Node 工具任务 |
| ACI-07 | 输出侧 CP936、真实 idle timeout、进程组和树清理未验证 | Confirmed | 不在 Mock/Node 合同层伪造完成 | SPIKE_02 精确工件与 Win7 证据 |

### 15.2 收紧后的工具与编辑合同

- ToolSpec 升级为 `schemaVersion: 2.0`。每个参数必须声明类型和非空描述；可选
  `enum/default` 在注册时自校验，Runtime 在 Policy 与执行前生成不修改模型原始调用的
  归一化副本。
- `createTextReplacePlan` 只接受既有、可明确解码的 UTF-8 文件和唯一非空锚文本；零命中
  返回最相似文本及行号，多命中返回次数和首批行号。大文件与未知编码明确拒绝并给出后续动作。
- 锚替换不建立旁路写入口。成功结果仍进入 `WritePlan → 精确预览/基线审批 → applyPlan
  最终复核 → 原子替换/回滚` 链。
- 内容 diff 使用版本化、哈希绑定和字节上限；非 UTF-8 内容只报告 binary 标记及前后哈希，
  不猜编码。

### 15.3 不变边界

本节不修改 Phase 2 冻结 Python 工具、不实现真实进程执行、不宣称 GBK/CP936 或 Win7
进程树验收通过。`taskkill` 仍不得作为 Job Object 等价安全证明。

## 16. Node 只读工具语义收口（ADR-0046）

### 16.1 Phase 2 负面需求的 Node 继承

在不修改冻结 Python legacy 的前提下，本节关闭 ACI-06 在新 Node 基线中的对应缺口：

| ID | 可测试合同 | 实施 |
|---|---|---|
| ACI-N1 | 一个 `read_text` 同时支持完整起始位置和行数限制，不再拆分 full/range 两个重叠工具 | `readText` 使用 `startLine/maxLines`，始终返回总行数、实际范围与行号 |
| ACI-N2 | 文件/目录错误给出具体错误码、当前路径要求、相似候选和下一步 | `PATH_NOT_FILE/PATH_NOT_DIRECTORY` + parent candidates |
| ACI-N3 | 搜索输出达到 match/byte 上限后继续在扫描预算内计数 | `totalMatches/returnedMatches/totalMatchesExact` 分离 |
| ACI-N4 | 搜索命中携带可调上下文，所有限制均显式 | `before/after`、扫描/文件/输出/编码截断原因 |
| ACI-N5 | 模型能从 Schema 得知默认值和数值范围 | ToolSpec V2 增加 `minimum/maximum` 并登记三个 Workspace 工具 |
| ACI-N6 | 中文/空格路径、CRLF、未知编码、二进制、超长行和越界路径 fail-closed | Workspace 定向测试 |

### 16.2 安全和装配边界

- `readText/searchText` 仅使用文件 API，不写文件、不启动进程、不跟随 symlink 目录遍历。
- 未知编码不猜测；搜索遇到二进制、不可读或预算外文件时将 `totalMatchesExact=false`，
  不把预算内下界冒充完整总数。
- `workspace.str_replace` 仍只生成审批绑定计划；模型可见 ToolSpec 不授予执行能力。
- 当前实现提供 Core 目录注册工厂与 Workspace 服务，产品 Executor 装配仍属于跨模块 E2E，
  不在本节宣称桌面产品已经可用。

## 17. Sandbox / Approval 分离复核（ADR-0048）

### 17.1 问题真实性与处置

| ID | 报告问题 | 复核 | 处置与证据 |
|---|---|---|---|
| SA-01 | 敏感路径仅在 Policy 原始字符串层拦截，可被旁路或符号链接绕过 | Confirmed | Workspace `validatePath` 在词法路径和 realpath 祖先上拒绝 `.git/.env*`；安全测试覆盖直接访问与 symlink |
| SA-02 | ToolSpec capability 是任意字符串，Policy 难以穷举 | Confirmed | 收敛为 `ToolCapability` 联合；新增能力必须通过编译期与 Policy 评审 |
| SA-03 | 审批弹窗不显示命中规则，拒绝原因未回流模型 | Confirmed | IPC 强制 `ruleId` 与非空拒绝原因；Runtime 从原 Checkpoint 恢复时生成 `POLICY_USER_REJECTED`、`approval.resolved` 和配对 denied ToolResult |
| SA-04 | 缺少会话 Git 基线、session diff 与回滚兜底 | Confirmed | `GitSessionGuard` 仅在干净 worktree 建立 HEAD 基线，提供 binary diff/status；跟踪文件回滚仍需精确审批，未跟踪文件不静默删除并显式报告 incomplete |
| SA-05 | 应增加“本会话始终允许该类写操作” | Divergent | 不实施。宽泛会话授权会绕过 DG-04/ADR-0038 的请求、预览和基线一次性绑定；当前只能批准一次或带原因拒绝 |
| SA-06 | 应立即开放命令三清单、runas 与子进程网络代理 | Blocked | `terminal.exec` 继续 fail-closed；真实进程、Restricted Token、Job Object 与 Win7 网络边界等待 SPIKE_02，不用 Mock 冒充 |

### 17.2 安全边界

- Git 会话回滚不会调用 `git clean`、`reset --hard` 或删除未跟踪文件；这类不可恢复操作必须
  由 Workspace 精确删除计划单独预览和审批。
- `GitSessionGuard` 只定义 Adapter/Runner 后面的可测试协议；`UnavailableRunner` 仍是生产
  默认，开发机 Mock 不能证明 MinGit、containment 或 Win7 实机可用。
- Shell IPC 合同已能携带 rule/reason，但 Electron 产品装配仍属于
  `docs/ROBUSTNESS_AUDIT.md` H-04，未宣称桌面端已经形成完整 E2E。

## 18. Git Session Guard 的 Runtime 协议接入（ADR-0049）

二次复核确认 `GitSessionGuard` 已实现但未进入任何 Runtime 生命周期，此项为真实装配缺口。
`AgentRuntimeProtocol` 现接受结构兼容的 `RuntimeSessionSafetyPort`；Bootstrap 声明
`git.repository=true` 时该端口为强制依赖，遗漏即在 Turn 启动前 fail-closed：

- 配置该端口且 Bootstrap 声明当前目录为 Git 仓库时，首个 Turn 在模型/工具执行前自动
  `begin(sessionId, cwd)`；无法建立干净基线时 Turn 不启动。
- 同一 Session 后续 Turn 复用同一基线并在每次返回前执行 `inspect`，结果通过
  `sessionSafety` 携带，产品层可直接展示 session diff。
- 同一 Session 改绑另一个 cwd 必须返回 `RUNTIME_INPUT_INVALID`；不得把旧基线用于新仓库。
- `closeSession` 在释放基线前进行最后一次 inspect；检查失败时不静默丢弃基线。
- Session 仍有活动 Run 时不得关闭或释放 Git 基线。
- Core 仅依赖结构端口，不直接依赖 Git Adapter 包。真实 Runner 未通过 SPIKE_02 时，
  `GitSessionGuard.begin` 仍会 fail-closed，不能用 Mock 结果冒充产品可用。

复核报告关于 capability 仍为自由字符串的结论已过时：当前 `ToolSpec.capability` 是
`ToolCapability` 联合类型。报告建议的会话级宽泛写授权继续按 SA-05/ADR-0048 拒绝。

## 19. 验证失败修复闭环与 Gate 熔断（ADR-0051）

本节关闭“Verification Gate 失败即终止、且完成条件由模型计划提供”的 Core 装配缺口。
实现只能位于 §0.1 已列出的 Core/State 源码与测试路径，继续禁止真实 Runner、Shell
字符串、containment 模拟和任何 Win7 完成宣称。

| ID | 可测试要求 | 实施与验收证据 |
|---|---|---|
| VL-01 | TaskAcceptance 由 Runtime 请求侧提供稳定的完成检查；缺失或重复检查 ID 在模型/工具启动前 fail-closed | Runtime 输入负向测试；模型调用数为零 |
| VL-02 | 模型计划不得定义完成条件；Verification Gate 只依据 TaskAcceptance 生成 EvidenceBundle | 计划含不同验证建议时的 Gate 归属测试 |
| VL-03 | Gate 失败在同一 Gate 未达三次时必须生成结构化反馈，`VERIFYING → EXECUTING` 并供下一次模型调用消费 | 状态机、Runtime 和消息历史测试 |
| VL-04 | 同一 Gate 第三次失败必须以 `VERIFICATION_STUCK` 结束，保留三次失败摘要；不同 Gate 计数隔离 | 三次同 Gate 与跨 Gate 计数测试 |
| VL-05 | 验证反馈及失败摘要进入 State 事件协议与消息投影，replay 后保持相同修复上下文 | Event adapter/projector 正反向测试 |
| VL-06 | 本轮不执行验证命令、不新增 Runner 或依赖；生产路径仍由现有 fail-closed 能力边界约束 | 静态审查与既有 Runner 回归 |

完成门槛：VL-01~VL-06 都有自动化证据；Core 与 State 受影响模块通过 lint、编译和测试。
开发机结果仅证明确定性合同，不替代 SPIKE_02 或 Win7 SP1 x64 实机验证。

# ROADMAP — 阶段划分

本路线图落实 ADR-0027：唯一固定客户端条件为 Windows 7 SP1 x64。Python-only、stdlib-only、禁止 Node.js/Electron、最终仅 CLI、完全离线、禁止后台进程/插件/并发等项目级限制不再决定未来阶段。

路线图只表达顺序、依赖与产品目标，**不构成实现授权**。任何代码、Spike、原型或依赖引入都必须有独立任务文档，状态为 `APPROVED_FOR_IMPLEMENTATION`，并遵守分支与路径白名单（AGENTS.md C14）。

> 阶段编号继续遵守 ADR-0012：Model Gateway 为阶段 3。Phase 1/2 是历史冻结合同；ADR-0027 不追溯修改其运行时、网络、只读或验收约束。

## 当前状态总览

| 工作项 | 状态 | 实现授权 |
|---|---|---|
| 阶段 0：工程基线 | 进行中 | 文档/ADR 可维护 |
| 阶段 1：Capability Probe | 进行中 | 仅现有 Phase 1 任务书白名单 |
| 阶段 2：只读代码分析 Agent | 进行中 | 仅现有 Phase 2 分支与白名单 |
| SPIKE_01~04（Win7 兼容性验证，见下） | 分项收口：SPIKE_02 低风险非交互 PASS/交互 No-Go；SPIKE_04 本地 SSD PASS；SPIKE_01/03 保持既有证据口径 | 各 Spike 任务书白名单 |
| 阶段 3–7 | 按各阶段任务书与整合任务推进；A7 `RC_PASS` 不等于各独立 Phase/E5/E6/E7 Gate 关闭 | 各阶段任务书 + `INTEGRATION_01/02/03` |
| A7 Win7 v1 RC | `RC_PASS`；已完成三层验证、RC-01～RC-10 和 main 整合 | `RC_01_WIN7_RELEASE_CANDIDATE.md` |
| A8 Agent-first | `A8_DEVELOPER_COMPLETE_VALIDATION_READY`；历史 Review-first 候选，外部三层未完成 | `A8_AGENT_FIRST_PRODUCT_EXPERIENCE.md` |
| A9 Trusted Agent Runtime | WIN7-10 Gate 4 Review FAIL 已保留；ADR-0096 将 Review 延期 Alpha 2；同一候选从 J4 继续，J1～J3 证据待归档 | `A9_TRUSTED_AGENT_RUNTIME.md` |

对标 Codex 的整体裁决记录于 ADR-0028~0035，并已由 ADR-0036 接受（附 Spike 条件）；
性能口径统一引用 `docs/PERFORMANCE_BUDGET.md`（ADR-0033）。

## 阶段 0 — 工程基线（进行中）

- 产出：AGENTS.md、CLAUDE.md、README.md、docs/ 文档体系、ADR 与任务授权机制。
- 当前工作：把项目级目标切换到 ADR-0027 的 Win7-only 固定条件，消除文档中的旧全局禁令。
- 完成标准：权威文档互相引用一致；活动约束、历史冻结合同与候选设计可以清晰区分；无越权实现代码。

## 阶段 1 — Capability Probe（APPROVED_FOR_IMPLEMENTATION）

- 任务文档：`docs/tasks/PHASE_01_CAPABILITY_PROBE.md`。
- 冻结产出：CPython 3.8.10 标准库 `win7_agent.probe`，探测任务书规定的能力并输出结构化 JSON。
- 实现可在现代开发环境 + Python 3.8.10 上回归；未完成 E1/E2（Win7 SP1 x64）验收前不得标记完成。
- 完成标准：任务书 §8。
- ADR-0027 不允许在该任务白名单内增加 Electron、Node.js、GUI 或其他新客户端实现。

## 阶段 2 — 正式只读代码分析 Agent（APPROVED_FOR_IMPLEMENTATION，ADR-0025）

- 任务文档：`docs/tasks/PHASE_02_READONLY_CODE_ANALYSIS.md`。
- 冻结产出：只读 Agent 状态机、Policy、六个只读工具、工作区边界、EventStore、Mock/Replay、CLI 与固定只读 Git 子进程。
- 实现分支：`phase/02-readonly-agent`；只能按任务书迁移矩阵选择性吸收原型，不得整体合并/cherry-pick 原型分支。
- 通用 Runner、目标代码写入、真实网络/模型、桌面客户端仍不在本阶段授权内。
- 完成标准：任务书 §7/§10/§13；Win7 实机验收前 Phase-Gate 至多为 `READY_FOR_WIN7_VALIDATION`。

## Phase 1/2 收口状态（对标计划 WS5 状态标注，不改代码/不改门禁）

本节仅记录截至对标 Codex 计划落地时 Phase 1/2 的收口状态与剩余门槛。`Phase-Gate` /
`Win7-*` 状态行只能由架构师按各自任务书规则流转；本对标计划不修改 Phase 1/2 代码，
不解除任何门禁，ADR-0027/0029 均不追溯改写其冻结合同。

| 阶段 | 当前 Phase-Gate | Win7 验收 | 收口剩余门槛 |
|---|---|---|---|
| 阶段 1 Capability Probe | `REPAIR_REQUIRED_BEFORE_E1`（任务书 §0.1） | `NOT_PERFORMED` | §0.3 修复项 R1~R8 全部关闭 → 架构师核对后解除门禁改回 `READY_FOR_E1`（ADR-0017）→ Win7 E1/E2 实机验收 |
| 阶段 2 只读代码分析 Agent | `APPROVED_FOR_IMPLEMENTATION`（任务书 §0.1） | `NOT_PERFORMED` | 保持 `PYTHON38_VALIDATED`（提交 `fd40ad2`，标签 `phase2-py38-validated`）→ Win7 环境就绪后按 §10.4/§10.5 走 `READY_FOR_WIN7_VALIDATION` → Win7 验收 → 按 ADR-0029 冻结为 legacy（此后只修缺陷、不演进为正式 Core） |

- 唯一硬阻塞：Win7 SP1 x64 实机环境（PC-002，现为"部分解除；待 Win7 E1/E2 验收环境执行"）。
  两阶段的 Win7 验收可与 SPIKE_01 共用同一台 Win7 SP1 x64 VM/实机，优先级最高。
- Python 资产去向：Phase 2 §3 契约、错误码、事件 schema、退出码与 §7 F 编号测试矩阵，
  作为 Node Core 的规范来源逐条对账继承（ADR-0029；对账清单见 `docs/tasks/PHASE_06_AGENT_CORE_RUNNER.md`）。

## 架构验证轨 — 四个 Win7 Spike（已授权，按分项证据裁决）

这是新客户端立项前的阻断门槛，不占用 ADR-0012 冻结的阶段编号（ADR-0034）。每个 Spike
有独立任务书（`docs/tasks/SPIKE_NN_*.md`）、独立分支 `spike/*`、白名单限 `spikes/**`，
产出 Win7 实机证据 + Go/No-Go 报告：

| Spike | 验证对象 | No-Go 后果（已在 ADR 预声明） |
|---|---|---|
| SPIKE_01_WIN7_RUNTIME_BASELINE | Electron 22.3.27 冷启动/内存/GPU 降级（P17）/中文空格路径/单实例/Renderer 隔离与出站阻断/崩溃日志/干净卸载；测预算 #1/#2/#3/#9/#10 | 切换 .NET 4.8 WPF（D-015）重跑本 Spike（ADR-0028 降级阶梯） |
| SPIKE_02_TERMINAL_CONTAINMENT | **受限收口**：D-013 v24 低风险非交互 Runner 与 H3 只读日志为 Win7 PASS；交互 winpty 为 `NO_GO_INTERACTIVE_WINPTY` | Win7 v1 采用非交互命令 + 只读流式日志；任意 Shell、高风险、未知 Profile 和网络隔离声明继续拒绝 |
| SPIKE_03_GIT_ADAPTER | MinGit 2.46.2 隔离配置下 G10 恶意仓库负向矩阵（hooks/filters/textconv/pager/helper/fsmonitor 零逃逸） | Git 降级只读观测，写操作远程化（ADR-0032） |
| SPIKE_04_STORAGE_INDEX | **Win7 PASS**：D-014 在 `E22-SQLITE343-LOCAL-SSD` Profile 完成 WAL/FTS5、S01～S08、F01～F06、P08 与预算 #5～#8 | 仅支持本地 NTFS SSD 证据；HDD、网络盘和未知介质不继承结论，生产装配由 A7 完成 |

四个 Spike 相互独立、可并行。Spike 的通过只决定技术 Profile 是否可进入正式设计，
不自动授权生产 Desktop Shell，也不改变 Phase 1/2。

## 阶段 3 — Model Gateway（按任务书实施）

- 任务书：`docs/tasks/PHASE_03_MODEL_GATEWAY.md`（分支 `phase/03-model-gateway`）。
- 范围：版本化远程协议、模型/工具请求、流式事件、鉴权、代理、CA、超时、重试、幂等与断线恢复。
- 门槛：阶段 1 相关探测、网络/安全/交付模式获批，以及真实 Win7 TLS/代理验收方案；不适合 Win7 本地承载的高风险能力通过 Gateway 远程化，精确运行时和依赖按任务书与 Spike 结果冻结。

## 阶段 4 — Workspace 与文件工具（按任务书实施）

- 任务书：`docs/tasks/PHASE_04_WORKSPACE_WRITE.md`（分支 `phase/04-workspace-write`）；前置：SPIKE_04 Go。
- 范围：编码感知读取/搜索、未知编码策略、CRLF/LF 保持、工作区根边界、junction/reparse 防逃逸，以及独立风险门控的写入、验证和恢复。
- 完成门槛：Schema、差异预览、用户确认、原子替换、备份/快照、验证和回滚均有任务书验收项。

## 阶段 5 — 状态、事件与审计（按任务书实施）

- 任务书：`docs/tasks/PHASE_05_STATE_AUDIT.md`（分支 `phase/05-state-audit`）；前置：SPIKE_04 Go。
- 范围：版本化状态/事件 Schema、任务恢复、操作审计、导出、保留/清理策略和一致性边界。
- D-014 本地 SSD Profile 的证据只证明技术 Profile；生产 EventStore、迁移、升级和跨重启恢复仍须按产品任务书验收。

## 阶段 6 — Agent Core、Policy 与 Runner（按任务书实施）

- 任务书：`docs/tasks/PHASE_06_AGENT_CORE_RUNNER.md`（分支 `phase/06-agent-core-runner`）；前置：SPIKE_02/03 Go + 阶段 3/4/5 完成，并按 ADR-0029 对账 Phase 2 契约。
- 范围：任务状态机、上下文、工具编排、Policy/Broker、权限确认、Runner、测试验证、取消与恢复。
- 硬边界：结构化参数、时限/软时长告警、输出上限、取消、进程树终止、工作区边界和审计；A9 TrustedShell 的固定 deadline 按 ADR-0089，不能省略取消、上限和清理报告。交互终端与 Agent 非交互执行隔离；交互 winpty、任意 Shell、高风险和未知 Profile 必须另立任务并重新验收。

## 阶段 7 — Desktop Shell、集成与交付（按任务书实施）

- 任务书：`docs/tasks/PHASE_07_DESKTOP_SHELL.md`（分支 `phase/07-desktop-shell`）；前置：SPIKE_01 Go + 阶段 6 完成；W7C-01～13 验收。
- 范围：任务/会话 UI、流式事件、差异、审批、终端、设置、诊断和降级提示；Electron 22.3.27 仅按 ADR-0036/0055 的条件范围使用。
- 完成门槛：自包含交付的版本/来源/哈希/SBOM、前置检查、升级/回滚，以及干净 Win7、普通用户、中文/空格路径、代理/断网、崩溃恢复和核心端到端工作流证据。

## Phase 3–7 整合基线

- 任务书：`docs/tasks/INTEGRATION_01_ROBUSTNESS_HARDENING.md`。
- A4/A5/A6 收口基线 `793cc47` 已进入 main；A7 从该基线完成产品装配、发布闭包和三层验收。
- 开发机测试数量、逐次失败和候选哈希不在路线图中维护；以 [`docs/STATUS.md`](STATUS.md)、
  [`docs/status/latest-validation.json`](status/latest-validation.json) 及对应任务/报告为准。
- A7 `RC_PASS` 不自动关闭 Win7 E1/E2/E5/E7、企业代理/CA、正式发布治理或其他独立 Phase Gate。

## A7 — Windows 7 v1 发布候选（RC_PASS）

- 基线：A4/A5/A6 收口提交 `793cc47`；工作分支 `codex/a7-release-candidate`。
- 目标：只装配已验收的 D-013 v24 低风险非交互 Runner 与 D-014 本地 SSD Storage，生成自包含 Win7 x64 RC，并完成 ASAR 外置、manifest、SBOM、许可证、安装、升级/回滚和卸载闭包。
- 当前裁决：唯一 RC 为 `RC_PASS`；详细候选、签名租约、历史 FAIL 和原始证据只在 [`docs/STATUS.md`](STATUS.md)、[`RC_01_WIN7_RELEASE_CANDIDATE.md`](tasks/RC_01_WIN7_RELEASE_CANDIDATE.md) 与状态 JSON 中维护。

## A9 — Trusted Agent Runtime（APPROVED_FOR_IMPLEMENTATION）

- 决策：ADR-0089、ADR-0096；需求：
  [`WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1`](prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md)；
  任务书：[`A9_TRUSTED_AGENT_RUNTIME`](tasks/A9_TRUSTED_AGENT_RUNTIME.md)。
- 基线与版本：从最新干净 A8 代码基线创建 `codex/a9-trusted-agent-runtime`，目标 `0.3.0-alpha.1`；
  A8 的 Review-first 产品合同与证据保留为历史，不自动进入 A9 评分。
- 目标：可信工作区 Full Access、PowerShell 5.1/CMD 通用 Shell、直接文件工具、测试/构建、真实 Git、
  OpenAI-compatible Provider、checkpoint/撤销、SQLite 重启恢复和轻量桌面 UI。
- Alpha 1 支持范围：Full Access 与 Read Only。Review staging、逐文件决定、审批 Apply 与恢复延期到
  `0.3.0-alpha.2`；WIN7-10 中仍可选择但只会 fail-closed 的 Review 作为已知限制，不计入 Alpha 1 PASS。
- 串行顺序：A9-00 文档/差距 → A9-01 模式/工具 → A9-02 Shell → A9-03 文件/checkpoint →
  A9-04 Provider → A9-05 Loop/Git → A9-06 UI/State → A9-07 包与 Win7 五旅程。
- 当前摘要：WIN7-10 的 Full Access 与 Read Only 通过；Review 在 Gate 4 `FAIL` 且 fail-closed，原始证据保持不变。ADR-0096 不改变候选字节；同一候选从 J4 继续，J1～J3 外置证据归档前保持 `EVIDENCE_PENDING`。
- 非目标：Office 专用能力、内置 IDE/LSP、交互终端、Browser 自动化、多 Agent、插件市场、自动更新。
- 完成门槛：同一自包含候选在干净 Win7 SP1 x64 完成五条真实 Coding Agent 旅程；开发机、Win10 或
  A8/A7 历史 PASS 不能替代。

### A9 Alpha 2 — Review staging（PLANNED / NOT_AUTHORIZED）

- 目标版本：`0.3.0-alpha.2`；实现分支和任务书待单独批准。
- 范围：A9 专用动态私有 staging、虚拟文件视图、文件级接受/拒绝、哈希绑定审批、原子 Apply、
  checkpoint/undo、SQLite 投影、重启不重放、漂移和恢复，以及正式 IPC/Renderer/Win7 证据。
- 进入条件：Alpha 1 证据保持可追溯；新增任务书状态为 `APPROVED_FOR_IMPLEMENTATION`；不得以 A8 smoke、
  mock staging、直接写工作区或自动接受替代。

## 后续扩展轨（未来待授权）

以下能力不再是架构非目标，但必须拆成可验收任务，不能借阶段 7 顺带实现：

- Skills、Hooks、MCP/企业插件及隔离插件宿主。
- 多 Agent、并发任务、工作树/工作区隔离与资源调度。
- 后台协调器、自启动、企业策略下发与集中审计。
- 远程浏览器、现代 Sandbox、代码索引服务和企业知识源连接器。

每项扩展必须定义 Manifest/协议版本、权限、来源与完整性、超时/配额、数据边界、停用/卸载和 Win7 降级。

## 阶段门槛

每个未来阶段或 Spike 开始前必须同时满足：

1. 有状态为 `APPROVED_FOR_IMPLEMENTATION` 的任务书，包含目标/非目标、允许路径、错误模型、Schema、测试矩阵和验收标准。
2. 有精确的目标 Profile：Win7 补丁、架构、运行时、第三方/原生依赖、工具、网络、权限和交付模式。
3. 新依赖已在 `docs/WIN7_CONSTRAINTS.md` §6 登记并通过评审；关键接口或安全决策已有 ADR。
4. 有现代开发环境代理测试和 Win7 SP1 x64 实机验收方案；阶段完成以 Win7 证据为准。
5. 更新 README 状态表并核对与 PROJECT_CHARTER、ARCHITECTURE、SECURITY、EVALUATION 的一致性。

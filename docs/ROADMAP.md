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
| SPIKE_01~04（Win7 兼容性验证，见下） | 已授权，尚未完成实机验证 | 各 Spike 任务书白名单 |
| 阶段 3–7 | 理论先行候选已形成；历史快照有开发机回归，当前工作树尚未建立最终验证记录 | 各阶段任务书 + `INTEGRATION_01` |

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

## 架构验证轨 — 四个 Win7 Spike（已授权，实机证据待补）

这是新客户端立项前的阻断门槛，不占用 ADR-0012 冻结的阶段编号（ADR-0034）。每个 Spike
有独立任务书（`docs/tasks/SPIKE_NN_*.md`）、独立分支 `spike/*`、白名单限 `spikes/**`，
产出 Win7 实机证据 + Go/No-Go 报告：

| Spike | 验证对象 | No-Go 后果（已在 ADR 预声明） |
|---|---|---|
| SPIKE_01_WIN7_RUNTIME_BASELINE | Electron 22.3.27 冷启动/内存/GPU 降级（P17）/中文空格路径/单实例/Renderer 隔离与出站阻断/崩溃日志/干净卸载；测预算 #1/#2/#3/#9/#10 | 切换 .NET 4.8 WPF（D-015）重跑本 Spike（ADR-0028 降级阶梯） |
| SPIKE_02_TERMINAL_CONTAINMENT | C++ helper 的 Job Object/Restricted Token 进程树必杀（P11、`IsProcessInJob` fail-closed）；node-pty 0.10.0 内置 winpty 0.4.4-dev 精确快照终端矩阵；C19 负向注入；测预算 #4 | containment 失败→高风险命令拒绝/远程；winpty 失败→非交互命令 + 流式日志视图（ADR-0030/0031） |
| SPIKE_03_GIT_ADAPTER | MinGit 2.46.2 隔离配置下 G10 恶意仓库负向矩阵（hooks/filters/textconv/pager/helper/fsmonitor 零逃逸） | Git 降级只读观测，写操作远程化（ADR-0032） |
| SPIKE_04_STORAGE_INDEX | SQLite 绑定（D-014）WAL 批量写 QPS、FTS 索引吞吐与增量延迟（机械盘）；测预算 #5/#6/#7/#8 | 关键事件同步 + 非关键异步合并；索引超限切远程索引服务（ADR-0033） |

四个 Spike 相互独立、可并行。Spike 的通过只决定技术 Profile 是否可进入正式设计，
不自动授权生产 Desktop Shell，也不改变 Phase 1/2。

## 阶段 3 — Model Gateway（理论实现与定向加固完成，待 SPIKE/E7）

- 任务书：`docs/tasks/PHASE_03_MODEL_GATEWAY.md`（分支 `phase/03-model-gateway`）；源码已进入整合分支。重试、TLS fail-closed、协议版本、流截断和并发隔离已有开发机回归。
- 目标：实现版本化远程协议、模型/工具请求、流式事件、鉴权、代理、CA、超时、重试、幂等与断线恢复。
- Win7 端实现不再限定 `http.client`/`ssl` 或标准库；任务书根据兼容性 Spike 与安全评审选择精确运行时/依赖 Profile。
- 现代 Browser Use、沙箱执行和不适合 Win7 本地承载的高风险能力通过 Gateway 远程化。
- 前置：阶段 1 的相关探测结论；网络目标、安全模型和交付模式获批；真实 Win7 TLS/代理验收方案完备。

## 阶段 4 — Workspace 与文件工具（理论实现已汇入，待 SPIKE_04/Win7）

- 规划任务书：`docs/tasks/PHASE_04_WORKSPACE_WRITE.md`（分支 `phase/04-workspace-write`）；前置：SPIKE_04 Go。
- 目标：编码感知读取/搜索、未知编码策略、CRLF/LF 保持、工作区根边界、junction/reparse point 防逃逸。
- 写能力按独立风险门控引入：补丁预览、用户确认、备份/快照、原子替换、验证和回滚。
- 与 Desktop Shell 的差异预览、文件引用协议先定义 Schema，再选择实现运行时。

## 阶段 5 — 状态、事件与审计（内存基线已汇入，SQLite/Win7 待验证）

- 规划任务书：`docs/tasks/PHASE_05_STATE_AUDIT.md`（分支 `phase/05-state-audit`）；前置：SPIKE_04 Go。
- 目标：带版本号的状态/事件 Schema、任务恢复、操作审计、导出、保留与清理策略。
- SQLite 是优先候选而非唯一强制实现；任务书必须验证所选绑定、原生依赖和升级迁移在 Win7 上可交付。
- 为多任务、后台协调器和断线恢复建立一致性边界，但不在本阶段默认开启这些产品能力。

## 阶段 6 — Agent Core、Policy 与 Runner（契约骨架已汇入，真实 Runner 被阻断）

- 规划任务书：`docs/tasks/PHASE_06_AGENT_CORE_RUNNER.md`（分支 `phase/06-agent-core-runner`）；前置：SPIKE_02/03 Go + 阶段 3/4/5 完成；含 Phase 2 契约逐条对账移植（ADR-0029）。
- 目标：任务状态机、上下文、工具编排、Policy/Broker、权限确认、通用 Runner、测试验证、取消与恢复。
- Runner 必须使用结构化参数并强制超时、输出上限、进程树终止、工作区边界和审计。
- 用户交互终端与 Agent 非交互工具执行采用隔离通道；winpty 仅在兼容性验证通过后使用。
- 并发与多 Agent 可在资源、锁和审计模型就绪后逐步启用，不再被全局禁止。
- 当前真实 Runner 在 SPIKE_02 前 fail-closed；Mock 仅用于测试，尚无可交付的完整 Agent 编排循环。

## 阶段 7 — Desktop Shell、集成与交付（最小真实入口已通过 Win7 MVP smoke，完整产品待装配）

- 规划任务书：`docs/tasks/PHASE_07_DESKTOP_SHELL.md`（分支 `phase/07-desktop-shell`）；前置：SPIKE_01 Go + 阶段 6 完成；W7C-01~13 全量验收。
- 目标：任务/会话 UI、流式事件、差异、审批、终端、设置、诊断和可访问的降级提示。
- Electron 22.3.27 方向已由 ADR-0036 条件接受；ADR-0055 增量已实现最小权限 main/preload/renderer 本地入口，并在 Win7 完成启动、诊断回传和退出 smoke。当前仍缺完整五视图、跨模块用户任务、安装器和正式 W7C/E5/E6/E7，不能称为完整桌面客户端。
- 交付模式可为自包含离线包、企业内网安装或受控更新；任务书必须固定版本、来源、哈希/SBOM、前置检查、升级和回滚。
- 完成标准必须覆盖干净 Win7 安装、普通用户启动、中文/空格路径、代理/断网、崩溃恢复与核心端到端工作流。

## Phase 3–7 整合基线

- 任务书：`docs/tasks/INTEGRATION_01_ROBUSTNESS_HARDENING.md`。
- 分支：`codex/integrated-robustness`；以 Phase 6 为基础，保留历史合并 Phase 5/7，
  Phase 3/4 由祖先关系继承。
- 开发机证据和测试数量不在路线图中维护；请以 [`docs/STATUS.md`](STATUS.md) 和
  [`docs/status/latest-validation.json`](status/latest-validation.json) 中绑定 commit 的验证记录为准。
- 仍缺：四项 SPIKE 的正式合同收口、Win7 E1/E2/E5/E7、企业代理/CA、原生依赖闭包、
  真实 Runner、完整五视图与端到端用户任务。最小 Electron 入口已不再是缺失项。

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

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
| Win7 Desktop Compatibility Spike | 未开始 | **无；必须新建任务书** |
| 阶段 3 及以后 | 未开始 | **无；逐阶段新建任务书** |

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

## 架构验证轨 — Win7 Desktop Compatibility Spike（未开始、未授权）

这是新客户端立项前的阻断门槛，不占用 ADR-0012 冻结的阶段编号。开始任何 Spike 代码前必须新建专用任务书并获批，至少声明：

- 精确 Win7 SP1 x64 补丁基线、测试镜像与普通用户/管理员场景。
- 候选 Electron 22.3.27、其嵌入运行时、独立 Node.js 候选、原生模块 ABI 和完整依赖闭包。
- 最小桌面壳：启动、Unicode/中文路径、单实例、IPC、Renderer 隔离、实际出站/权限阻断、
  崩溃日志和干净卸载。
- 候选终端链路：非交互 Runner 与 winpty 交互终端分别验证；明确 ConPTY 不可用，并验证
  模型不能向用户终端注入 stdin、恶意 VT/OSC 被限制。
- Git Adapter：使用隔离配置/环境和命令白名单，负向验证 hooks、filters、textconv、pager、
  helper、fsmonitor 与未评审 Git LFS/GCM 不能旁路 Runner。
- 打包、签名/哈希、安装、升级、失败回滚、代理/TLS/CA 与断网启动。
- 性能基线：冷启动、空闲内存、长会话、日志增长和多个任务/Runner 的资源上限。
- Win7 实机证据和 Go/No-Go 报告；失败时评估原生 Win32/.NET Framework Shell 或浏览器式轻客户端。

Spike 的通过只决定技术 Profile 是否可进入正式设计，不自动授权生产 Desktop Shell，也不改变 Phase 1/2。

## 阶段 3 — Model Gateway（未开始、未授权）

- 目标：实现版本化远程协议、模型/工具请求、流式事件、鉴权、代理、CA、超时、重试、幂等与断线恢复。
- Win7 端实现不再限定 `http.client`/`ssl` 或标准库；任务书根据兼容性 Spike 与安全评审选择精确运行时/依赖 Profile。
- 现代 Browser Use、沙箱执行和不适合 Win7 本地承载的高风险能力通过 Gateway 远程化。
- 前置：阶段 1 的相关探测结论；网络目标、安全模型和交付模式获批；真实 Win7 TLS/代理验收方案完备。

## 阶段 4 — Workspace 与文件工具（未开始、未授权）

- 目标：编码感知读取/搜索、未知编码策略、CRLF/LF 保持、工作区根边界、junction/reparse point 防逃逸。
- 写能力按独立风险门控引入：补丁预览、用户确认、备份/快照、原子替换、验证和回滚。
- 与 Desktop Shell 的差异预览、文件引用协议先定义 Schema，再选择实现运行时。

## 阶段 5 — 状态、事件与审计（未开始、未授权）

- 目标：带版本号的状态/事件 Schema、任务恢复、操作审计、导出、保留与清理策略。
- SQLite 是优先候选而非唯一强制实现；任务书必须验证所选绑定、原生依赖和升级迁移在 Win7 上可交付。
- 为多任务、后台协调器和断线恢复建立一致性边界，但不在本阶段默认开启这些产品能力。

## 阶段 6 — Agent Core、Policy 与 Runner（未开始、未授权）

- 目标：任务状态机、上下文、工具编排、Policy/Broker、权限确认、通用 Runner、测试验证、取消与恢复。
- Runner 必须使用结构化参数并强制超时、输出上限、进程树终止、工作区边界和审计。
- 用户交互终端与 Agent 非交互工具执行采用隔离通道；winpty 仅在兼容性验证通过后使用。
- 并发与多 Agent 可在资源、锁和审计模型就绪后逐步启用，不再被全局禁止。

## 阶段 7 — Desktop Shell、集成与交付（未开始、未授权）

- 目标：任务/会话 UI、流式事件、差异、审批、终端、设置、诊断和可访问的降级提示。
- Desktop 技术栈由 Compatibility Spike 的 Go/No-Go 结论与独立正式任务书决定；Electron 22 候选不能直接从路线图进入实现。
- 交付模式可为自包含离线包、企业内网安装或受控更新；任务书必须固定版本、来源、哈希/SBOM、前置检查、升级和回滚。
- 完成标准必须覆盖干净 Win7 安装、普通用户启动、中文/空格路径、代理/断网、崩溃恢复与核心端到端工作流。

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

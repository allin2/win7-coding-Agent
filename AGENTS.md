# AGENTS.md — win7-coding-agent 最高项目约束（单一事实来源）

> 本文件是本仓库所有 Coding Agent（Claude、其他 LLM Agent、人类工程师）的**最高约束文档**。
> 任何其他文档、注释、口头约定与本文件冲突时，以本文件为准。
> 修改本文件必须在 `docs/DECISIONS.md` 中新增一条 ADR 说明理由。

## 1. 文档优先级（冲突裁决顺序）

1. `AGENTS.md`（本文件）
2. `docs/WIN7_CONSTRAINTS.md`（兼容性红线）
3. `docs/tasks/PHASE_XX_*.md`（当前阶段任务文档）
4. `docs/ARCHITECTURE.md` / `docs/SECURITY.md`
5. 其余文档

## 2. 项目一句话定义

构建一个运行在 **Windows 7 SP1 x64** 上的企业内部通用 Coding Agent 执行端与客户端；目标端可以使用经评审、固定版本并通过 Win7 实机验证的 Python、Node.js、Electron、.NET Framework、Win32 原生组件及第三方依赖。模型推理默认在远程/内网服务器完成，Win7 端负责交互界面、代码读取、受控修改、命令执行、测试验证、状态保存与审计（ADR-0027）。

## 3. 当前阶段（必须先确认再动手）

- 当前并行推进四条受控轨道：**阶段 0 文档基线**、**阶段 1/2 冻结合同的 Win7 收口**、
  **阶段 3–7 整合候选**以及 **SPIKE_01~04 实机验证**。当前分支
  `codex/integrated-robustness` 的直接任务书为
  `docs/tasks/INTEGRATION_01_ROBUSTNESS_HARDENING.md`、
  `docs/tasks/DOCS_01_DOCUMENTATION_BASELINE.md` 与
  `docs/tasks/MVP_01_WIN7_REAL_MACHINE_ACCEPTANCE.md`；后者仅授权 MVP 实机验收
  harness、证据与文档收口，不扩大任何生产功能或 Phase 1/2 冻结合同（ADR-0054）。
  状态以 `docs/STATUS.md` 和 `docs/tasks/README.md` 为准。
- 阶段 1 任务文档：`docs/tasks/PHASE_01_CAPABILITY_PROBE.md`，状态 `APPROVED_FOR_IMPLEMENTATION`（允许路径见该文档 §0.2）。
- **阶段 2（ADR-0025）**：任务文档 `docs/tasks/PHASE_02_READONLY_CODE_ANALYSIS.md`（Task Type: FORMAL_PHASE，状态 `APPROVED_FOR_IMPLEMENTATION`，允许路径见该文档 §8）。实现仅在 `phase/02-readonly-agent` 分支上进行；目标工作区全程只读、不接入真实模型、不修改用户代码；原型成果只能按该文档 §5 迁移矩阵选择性吸收，禁止整体合并/cherry-pick 原型分支。Win7 实机验收前不得宣称阶段 2 完成。
- 阶段 0/1 主线**不接入大模型、不修改用户代码**；阶段 2 的只读 Agent Loop 仅在其任务书授权范围内实现（Mock/Replay 驱动，同样禁止真实模型与网络）。
- 阶段边界以 `docs/ROADMAP.md` 为准；不得跨阶段实现未来功能。
- **独立原型线（ADR-0023）**：`prototype/full-agent-skeleton` 分支上另有一条架构原型线，授权载体为 `docs/tasks/PROTOTYPE_FULL_AGENT_SKELETON.md`（Task Type: ARCHITECTURE_PROTOTYPE，状态 `APPROVED_FOR_IMPLEMENTATION`，允许路径见该文档 §8）。该授权**仅在原型分支上生效**；原型不替代 Phase 1、不得触碰 Phase 1 产物、不得整体合并 main、不接入真实模型、不修改目标用户代码。在 main 与其他分支上，本条不构成任何实现授权。
- **新架构基线（ADR-0027）**：Python-only、stdlib-only、禁止 Node/Electron、最终仅 CLI 等项目级限制已经废止。Phase 1、Phase 2 与既有原型任务书仍按各自冻结合同执行；ADR-0027 不扩大其路径白名单，也不授权在当前分支实现桌面客户端。新的 Win7 客户端、运行时 Spike 或依赖栈必须另建 `APPROVED_FOR_IMPLEMENTATION` 任务书。
- **PC-003 裁决（ADR-0036，2026-07-29）**：Win7 兼容性为基本要求，技术选型以程序最优化为目标。ADR-0028\~0035 方向获批（附条件：四项 SPIKE 实机验证通过后正式生效）。
- **Phase 3-7 与 SPIKE 1-4 任务书授权升级**：`docs/tasks/PHASE_03_MODEL_GATEWAY.md` \~ `PHASE_07_DESKTOP_SHELL.md` 及 `SPIKE_01_WIN7_RUNTIME_BASELINE.md` \~ `SPIKE_04_STORAGE_INDEX.md` 可从 `DRAFT` 升级为 `APPROVED_FOR_IMPLEMENTATION`。实施策略：非终端/containment 模块可基于理论分析先行实现；终端层（winpty/node-pty）和进程 containment 模块须等 `SPIKE_02_TERMINAL_CONTAINMENT.md` 实机验证结论后定稿。

## 4. 有效约束与历史编号（逐条可测试）

| # | 约束 | 验证方式 |
|---|------|----------|
| C01 | 目标运行环境为 Windows 7 SP1 x64 | 在 Win7 SP1 x64 实机/VM 上跑通验收用例 |
| C02 | **项目级已废止（ADR-0027）**：不再把 CPython 3.8.10 设为全项目唯一运行时；编号仅保留给 Phase 1/2 冻结合同解释 | 新任务不得把 C02 当作全局 Python 限制；历史任务仍按原文验收 |
| C03 | **项目级已废止（ADR-0027）**：不再限制为 Python 标准库；编号仅保留给 Phase 1/2 冻结合同解释 | 新任务允许经 C16 评审的第三方依赖；历史任务仍按原文验收 |
| C04 | **项目级已废止（ADR-0027）**：不再禁止 Node.js / Electron；编号仅保留给 Phase 1/2 冻结合同解释。Docker/WSL 仍不能作为 Win7 本地运行能力 | 新任务可选择兼容运行时；历史任务仍按原文验收 |
| C05 | **项目级已废止（ADR-0027）**：Python 3.9+ 禁用清单不再约束非历史组件；编号仅保留给 Phase 1/2 冻结合同解释 | 新任务按 C15 的组件 Profile 验收；历史任务仍按 Python 3.8.10 验收 |
| C06 | Win7 目标端禁止依赖 Windows 10+ 专属 API；构建端或远程服务不受此项限制 | 见 `docs/WIN7_CONSTRAINTS.md` §4 能力矩阵 |
| C07 | 运行时下载、安装或更新只在任务书明确授权时允许，且必须版本锁定、完整性验证、失败回滚；默认优先自包含交付 | 断网启动测试或受控更新测试；验证签名/哈希与回滚 |
| C08 | Agent 发起的非交互命令必须有超时、输出上限和进程树终止；用户交互终端必须有取消、背压、会话上限和强制终止机制。无法建立可靠 containment 时，高风险命令必须拒绝或远程执行，`taskkill` 降级不得冒充安全隔离 | 代码审查 + `docs/EVALUATION.md` 进程生命周期测试项 |
| C09 | Agent 工具禁止执行模型拼接的 Shell 字符串；默认使用结构化 argv/`execFile`。固定脚本或交互终端只能通过经任务书批准的 Runner/终端适配器 | 跨语言静态扫描 + Runner/终端集成测试 |
| C10 | 路径逻辑必须兼容中文路径、空格路径、Windows 盘符/反斜杠 | 测试矩阵含中文、空格、混合路径用例 |
| C11 | 文本 I/O 必须显式声明编码；未知或需保持原样的内容按字节处理，禁止依赖系统默认编码 | 各语言静态检查 + 中文/CP936/UTF-8/CRLF 往返测试 |
| C12 | 每个任务必须声明交付模式（自包含离线包、企业内网安装或受控更新）和全部运行前置；禁止未声明的在线依赖 | 干净 Win7 环境安装、启动、升级和回滚验收 |
| C13 | 不得假设目标机已安装任何未声明工具；必需工具必须随包交付或列为可探测前置，可选能力缺失时必须降级而非崩溃 | 干净环境与缺失能力矩阵测试 |
| C14 | 实现代码采用**任务授权机制**：默认禁止编写实现代码；仅当当前任务文档标注 `Status: APPROVED_FOR_IMPLEMENTATION` 时方可实现，且实现文件只能位于该任务文档列出的允许路径内（ADR-0011） | 核对任务文档状态与路径白名单；白名单外出现实现文件即打回 |
| C15 | 每个新组件必须声明 Runtime Profile：精确版本、目标架构、Win7 补丁前置、构建/运行边界、系统 API、降级路径和实机证据 | 核对 Profile、版本锁、二进制元数据与 Win7 实机报告 |
| C16 | 运行时、框架、第三方库、原生模块和外部程序均可使用，但必须在 `docs/WIN7_CONSTRAINTS.md` §6 登记，锁定完整依赖树并记录来源、哈希、许可证、EOL 风险和交付闭包 | 依赖清单/SBOM、缓存工件、签名或哈希及干净环境安装验证 |
| C17 | 桌面 Renderer 不得直接获得文件、进程、凭据或任意网络权限；浏览器自身的 `fetch`/WebSocket/导航/权限请求也必须受 CSP 与会话级白名单约束。高权限操作必须经 Schema 校验的 IPC、Policy、批准与审计 | Electron/桌面安全配置、实际出站连接与 IPC 越权测试 |
| C18 | Win7 不具备的强隔离、现代浏览器或运行时能力必须明确降级或移至受维护的内网服务，不得以兼容层名义虚构等价安全性 | 能力矩阵、威胁模型和端到端降级测试 |
| C19 | 用户交互终端与 Agent Runner 必须保持输入能力隔离：模型不得向用户终端注入按键、粘贴或控制序列；终端输出按不可信数据处理并限制剪贴板、链接和窗口控制序列 | 能力路由检查 + 恶意 VT/OSC、粘贴、链接与模型注入负向测试 |
| C20 | Git 必须通过专用适配器运行；仅结构化 argv 不足以阻止 hooks、filters、textconv、external diff、pager、credential/SSH helper、fsmonitor 等间接执行，任务书必须定义配置隔离、命令白名单和高风险操作策略 | 恶意仓库配置/属性/Hook 负向测试 + 进程与网络审计 |

## 5. Agent 工作流程规则

任何 Coding Agent 在本仓库工作时必须：

1. **先读**：`AGENTS.md` → `docs/WIN7_CONSTRAINTS.md` → 当前阶段 `docs/tasks/PHASE_XX_*.md`。
2. **只做当前阶段任务**。发现任务文档缺失或与本文件矛盾时，停止实现并在输出中列出矛盾，不得自行取舍。
3. **实现授权检查**：动手写实现代码前，确认当前任务文档状态为 `APPROVED_FOR_IMPLEMENTATION`，且目标文件路径在该文档的允许路径清单内；文档与 ADR 文件的修改不受实现路径清单限制，但仍遵循本文件的文档规则。**禁止以“临时豁免某个目录”等任何方式绕过 C14**（ADR-0011）。
4. **新增依赖**（运行时、框架、第三方库、高风险系统 API、原生模块和外部可执行文件）必须先在 `docs/WIN7_CONSTRAINTS.md` §6 登记评审记录，通过后方可使用。
5. **关键设计决策**（影响接口、数据格式、兼容性、安全模型的决策）必须写入 `docs/DECISIONS.md`（ADR 风格），不允许只体现在代码里。
6. **不得删除或改写已接受（Accepted）ADR 的正文**，只能新增 ADR 并将旧 ADR 状态行标记为 Superseded。
7. 所有新写的 Markdown 和文本源码使用 UTF-8（无 BOM）编码、LF 换行；目标为 `.bat/.cmd` 等必须使用其他换行或编码时，由任务书显式声明。
8. 输出物必须在其声明的交付模式与运行时 Profile 下完成 Win7 SP1 x64 验证，凡是"在我的机器上能跑"的验证一律不算通过；允许在现代开发环境开发与回归，但阶段完成标记以 Win7 验收为硬门槛（见 `docs/EVALUATION.md`）。

## 6. 通用实现规则

- 运行时级别：Phase 1/2 与既有原型的 Python 源码继续以 CPython 3.8.10 为门槛；新组件按任务书声明的 Node.js、Electron、Python、.NET Framework 或原生工具链版本编译、测试并验证 Win7 兼容性。
- 子进程统一通过经任务书批准的 Runner/终端适配器调用；业务代码和 UI 不得绕过 Policy、权限 Broker 与审计直接执行进程。
- GUI、协议和文件使用 Unicode/UTF-8；直连 Win7 conhost 的输出由控制台 Profile 负责 CP936、VT 和非 ASCII 降级，历史 Phase 1/2 CLI 继续保持 ASCII-only。
- 所有持久化数据格式必须有版本号字段。
- 每个模块必须可独立测试，失败必须产生结构化错误（见各阶段任务文档的错误模型）。

## 7. 明确禁止事项（全局）

- Agent 工具调用默认禁止等待 stdin；用户直接操作的交互终端必须由独立任务书授权，并与 Agent Runner 隔离，不能被模型用来绕过 Policy、批准或审计。
- 禁止未声明的注册表、服务、提权和系统配置修改；确有需要时必须由任务书、权限策略和用户确认共同授权，并提供回滚。
- 禁止访问任务书未声明的网络目标；Phase 1/2 的零网络合同继续有效。
- 禁止生成"占位式"文档或 TODO 空章节——每条规则必须可执行、可测试。
- 禁止静默吞异常：捕获后必须记录到结构化输出。

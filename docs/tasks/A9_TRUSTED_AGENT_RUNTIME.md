# A9 — Trusted Agent Runtime 与现实可用 Coding Agent 闭环

## 0. 实现授权（ADR-0011 / C14 / ADR-0089）

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_RUNTIME
Target Branch: codex/a9-trusted-agent-runtime
Target Version: 0.3.0-alpha.1
Phase-Gate: A9_IMPLEMENTATION_AUTHORIZED
Requirements: docs/prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md
Developer-Validation: NOT_PERFORMED
Win10-Validation: NOT_PERFORMED
Win7-Validation: NOT_PERFORMED
```

项目负责人于 2026-08-22 完成 GrillMe Q1～Q179 并确认需求合同、A9 阶段、分支、版本、取代范围、
实施顺序和验收口径。本任务授权在最新干净 A8 代码基线之上实现 A9；不得修改 A7/A8 已接受证据或将其
PASS 继承为 A9 PASS。

### 0.1 允许路径

- `src/core/src/**`、`src/core/tests/**`：权限模式、工具目录、Agent Loop、指令、上下文、预算与完成状态。
- `src/workspace/src/**`、`src/workspace/tests/**`：Full Access 文件工具、编码、ignore、checkpoint、Diff、撤销与恢复。
- `src/runner/src/**`、`src/runner/tests/**`：TrustedShellRunner、Shell 探测、前后台进程、输出和取消。
- `src/gateway/src/**`、`src/gateway/tests/**`：OpenAI-compatible Provider、能力探测、代理/CA/Header、流式、重试与取消。
- `src/git-adapter/src/**`、`src/git-adapter/tests/**`：结构化只读展示与 Trusted Git 状态投影；不得删除历史隔离模式。
- `src/state/src/**`、`src/state/tests/**`：A9 模式、任务、checkpoint、后台句柄、迁移、日志保留和恢复事实。
- `src/shell/product/**`、`src/shell/tests/product/**`：A9 Desktop Host、Preload/IPC、Renderer、设置、审批和诊断。
- `src/shell/src/**`、`src/shell/tests/**`：仅限 A9 需要的通用 IPC/安全/生命周期合同。
- `release/win7-product-v3/**`、`scripts/release/**`：A9 自包含包、输入锁、manifest、验证工具和确定性构建。
- `docs/prds/**`、`docs/tasks/**`、`docs/status/**`、`docs/reports/**`、`docs/acceptance/**`、
  `docs/STATUS.md`、`docs/DECISIONS.md`、`docs/ROADMAP.md`、`docs/ARCHITECTURE.md`、
  `docs/SECURITY.md`、`docs/EVALUATION.md`、`docs/WIN7_CONSTRAINTS.md`、`docs/PERFORMANCE_BUDGET.md`、
  `README.md`、`AGENTS.md`：合同、状态、风险、依赖与证据。
- 根 `package.json`、各 `src/*/package.json`、对应 lockfile：仅在 A9 已登记依赖或脚本需要时修改。

禁止修改 `src/phase1-2/**`、A7/A8 归档包、历史 acceptance 原始证据或使用路径白名单顺便重构无关阶段代码。
新增依赖、外部程序、系统 API 和 Runtime Profile 仍须先完成 C15/C16 登记。

### 0.2 交付模式

Alpha 1 交付 Windows 7 SP1 x64 自包含 ZIP，普通用户解压即用；不自动下载运行时、不自动安装 WMF、
不修改 PATH/服务/注册表/防火墙，不要求系统 Node.js。用户数据默认在
`%LOCALAPPDATA%\Win7CodingAgent\a9\`；Portable 模式显式选择后才写入包旁数据根。

### 0.3 冻结输入与证据继承

| 输入 | A9 处理 |
|---|---|
| Electron 22.3.27 / Node 16.17.1 | 复用锁定运行时和 A8 打包经验；A9 必须重新装配和实机验收 |
| D-013 v24 helper | 复用 Job Object、输出和取消协议；新增 TrustedShell Profile 后重新做 Win7 进程矩阵 |
| D-014 better-sqlite3 8.7.0 / SQLite 3.43.1 | 复用本地 SSD Profile、结构化会话和 EventLedger；A9 schema 独立迁移 |
| A8 Desktop UI | 复用会话、Goal、对话、工具卡片、代码查看器、Settings、Diagnostics 与响应式布局 |
| A8 Review staging | 保留为 Review 模式；Full Access 不强制经过 staging |
| A8 Gateway | 复用流式/tool_calls/取消/DPAPI；取代 DeepSeek 固定 URL/模型与 Replay 默认 |
| A8 产品证据 | 只证明输入和可复用行为；不构成 A9 Full Access/Shell/Git/五旅程 PASS |

## 1. 范围与非目标

### 1.1 必须交付

1. Full Access、Review、Read Only 三模式和工作区级记忆设置；
2. `list/read/search/write/edit/copy/move/delete/shell/update_plan` 工具；
3. PowerShell 5.1 优先、CMD 降级、完整命令字符串、取消、日志和后台进程句柄；
4. 直接多文件编辑、编码/EOL 保持、checkpoint、Diff、撤销、删除恢复和冲突检测；
5. 任意 Base URL 的 OpenAI-compatible Chat Completions + SSE + tool calls；
6. 真实模型驱动的 Agent Loop、测试/构建迭代和诚实完成状态；
7. Git 状态/Diff UI + Trusted Shell Git 工作流及外部操作确认；
8. SQLite 会话、事件、模式、checkpoint、中断恢复和 A8 白名单迁移；
9. 最小桌面 UI 改造、自包含包和五条 Win7 真实旅程。

### 1.2 明确非目标

Office 专用格式、完整 IDE/LSP/调试器、用户交互终端、Browser 自动化、多 Agent、插件市场、自动更新、
云同步、移动端、后台 Agent 守护和任意来源网页渲染不在 A9 Alpha 1。

## 2. A9 局部取代合同

本任务只在 A9 分支和版本内执行 ADR-0089：

- C09：允许模型生成完整 Shell 字符串，但只能经 TrustedShellRunner；
- C08：允许无固定硬 deadline 的长命令，但软提示、取消、输出上限和进程清理为硬门槛；
- C20：允许 Full Access 使用真实 Git；结构化 Adapter 继续为 UI 提供状态/Diff；
- ADR-0030：A9 提供 Full Access，但明确不是沙箱；
- A8 Review-first：Full Access 直接写，Review 仍复用准备区；
- A8 Replay-first：正式产品默认真实 Provider，Replay 只用于测试。

不允许 Renderer、Preload、普通 UI 或业务模块直接调用 `child_process`、`fs`、凭据或任意网络；所有能力
仍经版本化 IPC、Core、Tool Host 与 EventLedger。

## 3. 实施阶段与串行 Gate

| 阶段 | 交付 | 进入下一阶段的硬门槛 |
|---|---|---|
| A9-00 | PRD、ADR、任务书、差距矩阵、Runtime Profile 与测试合同 | 文档一致；需求均有稳定 ID、代码状态和验收项 |
| A9-01 | 三模式、A9 ToolSpec、System Prompt V2、Full Access Policy | Read Only/Review 不回归；Full Access 不再被旧 Policy 拒绝 |
| A9-02 | TrustedShellRunner、PowerShell/CMD 探测、取消、输出、后台进程 | Shell 正/负向矩阵和 helper 生命周期开发机测试通过 |
| A9-03 | 文件工具、ignore、编码、checkpoint、Diff、撤销与删除恢复 | 多文件、外部变化、冲突、崩溃恢复和工作区外标识通过 |
| A9-04 | OpenAICompatibleProvider、探测、DPAPI、代理/CA/Header、模型切换 | 至少两个兼容 fixture + 一个真实 Provider 工具闭环通过 |
| A9-05 | Agent Loop、测试/构建、Git、完成判定与无进展暂停 | 开发机五旅程通过；副作用不重放；Git 确认绑定通过 |
| A9-06 | Desktop UI、SQLite A9 迁移、诊断、保留策略与多窗口锁 | 真实 Electron 用户旅程、重启恢复、模式与审批 UI 通过 |
| A9-07 | v3 自包含包、Win10 smoke、Win7 五旅程与候选签发 | 同一候选完整性、生命周期和 Win7 核心旅程全部通过 |

同一时间最多一个阶段处于 `IN_PROGRESS`。文档 Gate 不能冒充功能 PASS；开发机或 Win10 不能冒充 Win7。

### 3.1 A9-00 Gate 记录（2026-08-22）

```text
Stage: A9-00
Status: COMPLETE
Gate: A9_00_DESIGN_AND_GAP_PASS
Next-Stage: A9-01
Next-Stage-Status: AUTHORIZED_NOT_STARTED
Implementation: NOT_STARTED
Win7-Validation: NOT_PERFORMED
```

本 Gate 冻结产品需求 V1、ADR-0089、A9 实现授权、D-019 TrustedShell Profile、需求—代码差距矩阵、
串行阶段和五条产品旅程。`npm run docs:check` 通过 96 个文档文件/20 个任务书，HTML 可解析且 29 个相对链接
全部存在，`npm run verify:quick` 通过七个 TypeScript 模块编译/静态门。以上只证明 A9 可以合法进入 A9-01，
不证明 Full Access、Shell、文件工具、Provider、Git 或任何 Win7 产品旅程已经实现。

## 4. 关键实现合同

### 4.1 权限与工具

- 将 `ApprovalLevel` 扩展为 `read_only / review / full_access`，历史 `workspace_write` 数据可读迁移。
- Full Access 工具无需每次能力令牌；始终确认操作仍使用目标绑定、一次性审批。
- Read Only 工具目录不包含写、删除或 Shell；Review 写操作只进入 staging。
- 工具名和 JSON Schema 与 PRD A9-T01 一致，Gateway alias 必须双向无碰撞。

### 4.2 TrustedShellRunner

- 新增独立于历史结构化 Profile Runner 的 A9 Profile；保留旧 Runner 测试和入口。
- 请求至少包含 shell kind/version、command text、cwd、environment overlay、output limits、后台标记和可选 deadline。
- PowerShell 使用 `-EncodedCommand`；CMD 使用 `/d /s /c` 并对命令边界做确定性编码。
- stdout/stderr 先按字节捕获，编码探测至少覆盖 UTF-8/CP936；原始日志和模型预览分离。
- 普通调用关闭 stdin；后台进程使用显式 start/poll/stop handle，不提供模型交互 stdin。
- helper/host Job 约束、无法回收、PID 重用和应用退出选择都必须有测试。

### 4.3 文件与 checkpoint

- 文件操作共享 canonical path、reparse、编码和冲突检测逻辑；Full Access 的越界不是拒绝，但必须标识。
- 每轮在首个副作用前冻结基线；结束或中断时记录本轮变化。
- Agent 自己写入使用原子替换；Shell/项目工具写入通过基线 Diff 进入恢复清单。
- 回收站能力需要独立 Win32 API Profile；未就绪前使用产品恢复区，不得永久删除冒充可恢复删除。

### 4.4 Gateway 与 Prompt

- 将 `DeepSeekOpenAIProvider` 泛化为 vendor-neutral Provider，移除固定 URL、固定模型联合类型和供应商专用 payload。
- 首版只承诺 Chat Completions，不在同阶段扩展 Responses API。
- Provider 能力探测是真实最小请求；`/models` 失败可手工模型 ID。
- System Prompt V2 描述可信开发者 Agent、当前模式、Shell 方言、指令层级和诚实验证，不再要求模型拒绝
  实际提供的写/Shell/Git 能力。

### 4.5 Git

- Git Adapter 的隔离模式和历史测试继续保留，不在原类上静默改变语义。
- A9 UI 状态/Diff 可以调用结构化 Adapter；模型的真实 Git 命令走 `shell` 并由行为策略分类外部/破坏性操作。
- 外部操作审批显示 remote、branch、force 和删除目标；批准后请求变化必须重新确认。

### 4.6 State 与恢复

- 新增 A9 schema/namespace；迁移只读打开 A8 数据并采用白名单字段。
- 活动任务、后台进程、审批、checkpoint 和模型请求具有版本化状态；重启只恢复事实，不自动执行。
- 日志保留和空间清理由状态层记录决定，不依赖用户手工清目录。

## 5. 开发机测试矩阵

| ID | 验收行为 |
|---|---|
| A9M-01 | 首次工作区模式选择、记忆、切换和 Read Only/Review 负向 |
| A9T-01 | A9 工具 Schema、未知字段、alias 和顺序工具循环 |
| A9SH-01 | PowerShell 5.1 探测与 EncodedCommand/退出码；PS 缺失降级 CMD |
| A9SH-02 | 管道、重定向、中文/空格 cwd、环境覆盖、非交互提示和取消 |
| A9SH-03 | 后台 start/poll/stop、上限、崩溃探测、PID 重用和退出选择 |
| A9F-01 | UTF-8/UTF-16/CP936/BOM/CRLF/LF/末尾换行往返 |
| A9F-02 | create/edit/copy/move/delete、工作区外标识、junction 环和大文件分段 |
| A9F-03 | 基线漂移拒绝、轮 checkpoint、Shell 外部变化、撤销和恢复失败 |
| A9GW-01 | 任意 Base URL、手工模型、自定义 Header、CA、代理与 TLS 默认验证 |
| A9GW-02 | SSE delta/tool_calls/usage、取消、三次适用重试和副作用不重放 |
| A9GW-03 | DPAPI 保存/清除/损坏/账户不匹配、日志和事件敏感值扫描 |
| A9A-01 | AGENTS 优先级、按需探索、ignore、上下文压缩和模型切换重建 |
| A9A-02 | 测试失败自主修复、三次无进展暂停、预算、完成/警告/阻塞三态 |
| A9G-01 | status/diff 展示、真实 hooks/helper、fetch/pull、本地写和非 Git 降级 |
| A9G-02 | push/force/delete/reset/clean 审批绑定、变化失效和拒绝零副作用 |
| A9S-01 | SQLite A9 迁移、活动任务中断、checkpoint、损坏只读恢复和保留策略 |
| A9UI-01 | 1366×768、100%/125% DPI、中文 UI、紧凑工具卡、Diff 和停止 |
| A9PKG-01 | 自包含 ZIP、无系统 Node、manifest/SBOM/licenses、双构建一致和回退 |

## 6. 五条产品旅程

### J1 项目解释

在未知代码库中读取 `AGENTS.md` 和项目配置，按需搜索/读取，回答架构问题并提供真实文件引用；不预加载全仓库。

### J2 缺陷修复

真实模型定位缺陷，修改一个或多个文件，运行相关测试，根据失败继续修复，输出 Diff 和已验证完成状态。

### J3 小功能

真实模型规划并实现跨文件小功能，允许安装项目依赖和运行项目脚本；不做无关全仓库重构。

### J4 Shell 与 Git

在 PowerShell 5.1 和 CMD 降级路径执行构建/测试，查看 Git 状态与 Diff，完成用户明确要求的本地分支/提交；
外部 push 使用目标绑定审批。

### J5 撤销与恢复

撤销本轮文件变化；模拟应用中断后重启，恢复会话、事实和 checkpoint，不自动重放模型、Shell、Git 或旧审批。

## 7. Windows 验收

### 7.1 Win10 非阻塞 Alpha smoke

Win10 用于锁定 Electron/native ABI、包入口和真实 UI 快速回归。内部 Alpha 可以先进入 Win7 验收，
但 RC 前必须补齐 Win10 同候选证据。

### 7.2 Win7 硬门槛

同一不可变候选在干净 Win7 SP1 x64 普通用户环境执行：

- 解压、首次启动、Provider 配置和退出/重启；
- J1～J5 全部通过；
- PowerShell 5.1 与 CMD 降级；
- 中文/空格路径、CP936/UTF-8/CRLF、可选 Git/Python/Node 缺失降级；
- 取消后的进程树/残留检查；
- SQLite 重启、损坏备份和旧版回退；
- 包前后 SHA-256、manifest 全树和证据目录分离。

### 7.3 完成裁决

只有 A9-00～A9-07 对应开发机 Gate 通过、同一候选 Win7 J1～J5 全部通过且无数据损坏/不可解释残留，
才能标记 `A9_ALPHA1_PASS`。未执行项保持 `NOT_PERFORMED`；Best Effort 降级不得冒充正式支持。

## 8. 当前起点差距

权威差距矩阵见
[`A9 Trusted Agent 差距与交付计划`](../reports/2026-08/a9_trusted_agent_gap_and_delivery_plan_2026-08-22.html)。
摘要：A8 UI/Core/State/DPAPI/打包可复用；Full Access、通用 Shell、完整文件工具、开放 Provider、真实 Git、
每轮 checkpoint 和五旅程为 A9 主要缺口。

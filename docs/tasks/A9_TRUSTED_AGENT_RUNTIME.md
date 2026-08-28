# A9 — Trusted Agent Runtime 与现实可用 Coding Agent 闭环

## 0. 实现授权（ADR-0011 / C14 / ADR-0089）

```text
Status: COMPLETE
Task Type: PRODUCT_RUNTIME
Target Branch: codex/a9-trusted-agent-runtime
Target Version: 0.3.0-alpha.1
Phase-Gate: A9_ALPHA1_PASS
Requirements: docs/prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md
Developer-Validation: A9_01_TO_A9_06_PASS
Formal-Serial-Gate: A9-07_COMPLETE
Current-Stage: A9-07
Current-Stage-Status: COMPLETE_WIN7_19_GO_FOR_ALPHA
Win10-Validation: DEFERRED_REQUIRED_BEFORE_RC
Win7-Validation: WIN7_19_GO_FOR_ALPHA
Scope-Amendment: ADR-0096
Scope-Revalidation: ADR-0097_CURRENT_CANDIDATE_RECHECK_PLUS_INHERITED_EVIDENCE
Acceptance-Decision: ADR-0099
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
| A8 Review staging | Alpha 1 不装配；完整 Review 模式延期至 `0.3.0-alpha.2`，A8 历史证据保持不变 |
| A8 Gateway | 复用流式/tool_calls/取消/DPAPI；取代 DeepSeek 固定 URL/模型与 Replay 默认 |
| A8 产品证据 | 只证明输入和可复用行为；不构成 A9 Full Access/Shell/Git/五旅程 PASS |

## 1. 范围与非目标

### 1.1 必须交付

1. Full Access、Read Only 两模式和工作区级记忆设置；Review 完整工作流延期至 Alpha 2；
2. `list/read/search/write/edit/copy/move/delete/shell/update_plan` 工具；
3. PowerShell 5.1 优先、CMD 降级、完整命令字符串、取消、日志和后台进程句柄；
4. 直接多文件编辑、编码/EOL 保持、checkpoint、Diff、撤销、删除恢复和冲突检测；
5. 任意 Base URL 的 OpenAI-compatible Chat Completions + SSE + tool calls；
6. 真实模型驱动的 Agent Loop、测试/构建迭代和诚实完成状态；
7. Git 状态/Diff UI + Trusted Shell Git 工作流及外部操作确认；
8. SQLite 会话、事件、模式、checkpoint、中断恢复和 A8 白名单迁移；
9. 最小桌面 UI 改造、自包含包和五条 Win7 真实旅程。

### 1.2 明确非目标

Review staging/文件级决定/Apply、Office 专用格式、完整 IDE/LSP/调试器、用户交互终端、Browser 自动化、
多 Agent、插件市场、自动更新、云同步、移动端、后台 Agent 守护和任意来源网页渲染不在 A9 Alpha 1。
Review 由 ADR-0096 移入 `0.3.0-alpha.2`，开始实现前必须另立任务书。

## 2. A9 局部取代合同

本任务只在 A9 分支和版本内执行 ADR-0089：

- C09：允许模型生成完整 Shell 字符串，但只能经 TrustedShellRunner；
- C08：允许无固定硬 deadline 的长命令，但软提示、取消、输出上限和进程清理为硬门槛；
- C20：允许 Full Access 使用真实 Git；结构化 Adapter 继续为 UI 提供状态/Diff；
- ADR-0030：A9 提供 Full Access，但明确不是沙箱；
- A8 Review-first：Alpha 1 不继承 Review 产品工作流；Full Access 直接写，Review 延期至 Alpha 2；
- A8 Replay-first：正式产品默认真实 Provider，Replay 只用于测试。

不允许 Renderer、Preload、普通 UI 或业务模块直接调用 `child_process`、`fs`、凭据或任意网络；所有能力
仍经版本化 IPC、Core、Tool Host 与 EventLedger。

## 3. 实施阶段与串行 Gate

| 阶段 | 交付 | 进入下一阶段的硬门槛 |
|---|---|---|
| A9-00 | PRD、ADR、任务书、差距矩阵、Runtime Profile 与测试合同 | 文档一致；需求均有稳定 ID、代码状态和验收项 |
| A9-01 | Alpha 1 支持模式、A9 ToolSpec、System Prompt V2、Full Access Policy | Read Only 不回归；Full Access 不再被旧 Policy 拒绝；Review 缺后端时 fail-closed 且不得静默提权 |
| A9-02 | TrustedShellRunner、PowerShell/CMD 探测、取消、输出、后台进程 | Shell 正/负向矩阵和 helper 生命周期开发机测试通过 |
| A9-03 | 文件工具、ignore、编码、checkpoint、Diff、撤销与删除恢复 | 多文件、外部变化、冲突、崩溃恢复和工作区外标识通过 |
| A9-04 | OpenAICompatibleProvider、探测、DPAPI、代理/CA/Header、模型切换 | 至少两个兼容 fixture + 一个真实 Provider 工具闭环通过 |
| A9-05 | Agent Loop、测试/构建、Git、完成判定与无进展暂停 | 开发机五旅程通过；副作用不重放；Git 确认绑定通过 |
| A9-06 | Desktop UI、SQLite A9 迁移、诊断、保留策略与多窗口锁 | 真实 Electron 用户旅程、重启恢复、受支持模式与审批 UI 通过；Review 缺后端零写入 |
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

### 3.2 A9-01～A9-06 实现检查点（2026-08-23）

```text
Implementation-Coverage: A9-01_TO_A9-06_PRESENT_IN_WORKTREE
Developer-Fixture: PASS
Developer-Electron-22-Smoke: PASS
Formal-Serial-Gate: A9-07_IN_PROGRESS
A9-07: IN_PROGRESS_WIN7_GATE3_PACKAGE_INTEGRITY_PASS_REMAINING_GATES_NOT_PERFORMED
Win10-Validation: NOT_PERFORMED
Win7-Validation: PARTIAL_GATE3_PACKAGE_INTEGRITY_PASS_ONLY
```

A9-01～A9-06 对应代码和开发机 Gate 均已取得 PASS。ADR-0096 只调整 Alpha 1 验收范围，不修改产品实现，
所以不使这些证据失效，也不单独触发新候选。A9-04 使用真实 DeepSeek Provider 完成 SSE、
原生 tool calling、真实修复/测试与取消；A9-05 使用同一真实模型完成 J1～J3，fixture J4/J5 使用真实
Git/审批与 SQLite/子进程；A9-06 当前工作树的真实 Electron 22 三进程产品入口 38/38 通过。
A9-07 已开始并完成 v3 开发候选的输入锁、装配、全树 manifest、敏感信息排除和双构建一致性；该候选
来自未提交工作树，明确为 `external_acceptance_eligible=false`，不能进入 Windows 正式评分。干净源码候选、
Win10、Win7 和 `A9_ALPHA1_PASS` 均未执行。机器可读检查点见
[`a9-trusted-agent-runtime-latest.json`](../status/a9-trusted-agent-runtime-latest.json)。

### 3.3 A9-04 真实 Provider Gate 记录（2026-08-23）

```text
Stage: A9-04
Status: COMPLETE
Gate: A9_04_REAL_PROVIDER_PASS
Provider: https://api.deepseek.com / deepseek-v4-flash
Credential: USER_SUPPLIED_EPHEMERAL_NOT_RECORDED
Next-Stage: A9-05
Next-Stage-Status: IN_PROGRESS_REAL_MODEL_J1_J3
```

首次完整工具目录请求暴露了 fixture 未发现的兼容缺陷：Core 工具参数 shorthand 缺少真实 Provider 要求的
顶层 `type: object`。Provider wire 边界统一补齐后，Gateway 241 项回归通过，真实闭环达到
`completed / verified`，执行五次工具调用和真实 `node test.js`，取消也得到 `cancelled`。脱敏原始结论见
[`a9-04-real-provider-deepseek-20260823.json`](../status/a9-04-real-provider-deepseek-20260823.json)。

### 3.4 A9-05 Agent Loop/Git Gate 记录（2026-08-23）

```text
Stage: A9-05
Status: COMPLETE
Gate: A9_05_REAL_MODEL_AND_FIVE_JOURNEYS_PASS
Real-Model-J1-J3: PASS
Behavioral-J4-J5: PASS_WITH_REAL_GIT_SQLITE_AND_PROCESS_SIDE_EFFECTS
Next-Stage: A9-06
Next-Stage-Status: COMPLETE
```

DeepSeek `deepseek-v4-flash` 在隔离临时项目中实际读取 `AGENTS.md`、项目配置和源码并引用证据（J1），
完成真实缺陷修复与 `node test.js`（J2），完成范围受控的三文件小功能与真实项目脚本（J3）。J4/J5
继续由行为化 fixture 驱动，但 Git pull/commit/push、审批绑定、拒绝零副作用、SQLite 中断恢复和无重放
均为真实本地实现与副作用。证据见
[`a9-05-real-model-journeys-deepseek-20260823.json`](../status/a9-05-real-model-journeys-deepseek-20260823.json)。

### 3.5 A9-06 Desktop/State Gate 与 A9-07 授权（2026-08-23）

```text
Stage: A9-06
Status: COMPLETE
Gate: A9_06_DESKTOP_STATE_AND_LIFECYCLE_PASS
Electron-22-Product-Entry: PASS_38_OF_38
Repository-Validation: PASS_1302_OF_1302
Next-Stage: A9-07
Next-Stage-Status: AUTHORIZED_NOT_STARTED
Win10-Validation: NOT_PERFORMED
Win7-Validation: NOT_PERFORMED
```

三次独立 Electron 22.3.27 产品入口进程覆盖模式、Provider、工具旅程、Diff、审批真实目标、拒绝零副作用、
重启事实、无模型重放、旧审批精确拒绝，以及 UI Stop 后真实 Shell PID 回收和零活动生命周期。A9-01～
A9-06 开发机 Gate 汇总见
[`a9-01-to-a9-06-developer-gates-20260823.json`](../status/a9-01-to-a9-06-developer-gates-20260823.json)。
A9-07 只获得开始打包与 Windows 验收的授权，不表示已有任何 Windows/Alpha PASS。ADR-0096 不改变候选
字节；只有实现或关键环境发生变化时，才重跑受影响的开发机或 Windows Gate。

### 3.6 A9-07 v3 开发候选检查点（2026-08-23）

```text
Stage: A9-07
Status: IN_PROGRESS
Developer-Package-Integrity: PASS
Deterministic-Double-Build: PASS
Source-Dirty: true
External-Acceptance-Eligible: false
Win10-Validation: NOT_PERFORMED
Win7-Validation: NOT_PERFORMED
Alpha1: NOT_PERFORMED
```

v3 构建器已装配 A9 正式 `main.js`/Preload/Renderer、Core/Gateway/Runner/State/Workspace 和此前 v2
遗漏的 `git-adapter`，并通过包内 `a9-runtime.json` 自动绑定外置 Electron ABI 110 SQLite。默认 A9 数据
根为 `%LOCALAPPDATA%\Win7CodingAgent\a9`，仅显式 `--portable` 使用包旁数据；完整性工具只使用包内
`electron.exe` Node mode。真实锁定输入双构建字节一致，但因源码未提交只能作为开发替代证据；实际哈希
只记录在候选之外的进展文件，避免把构建结果循环写回候选输入。进展记录见
[`a9-07-developer-package-progress-20260823.json`](../status/a9-07-developer-package-progress-20260823.json)。

### 3.7 Win7 Gate 3 物理 ASAR 完整性修复（2026-08-24）

```text
Stage: A9-07
Status: IN_PROGRESS
Previous-Win7-Evidence: WIN7-02 / GATE3_FAIL_PRESERVED
Repair-Commit: dce391c492a64a1e119d841ca1c41b18b2e3f60c
Replacement-ZIP-SHA256: 37c3e51c3092fc022592be177969247e025c2c8a4357e76fc76300a37ad60080
Replacement-Manifest-SHA256: 63801337df6fd75a2ccede17a954fd7c278c0f370e354294154a17e0a671b626
Win7-Gate3-Package-Integrity: PASS
Win7-Gate4-To-Gate10: NOT_PERFORMED
Alpha1: NOT_PERFORMED
```

`WIN7-02` 首次完整性运行在 `resources/default_app.asar` 报告 Full Tree mismatch，但随后使用系统物理
文件 API 复核时 size/hash 与 manifest 一致。根因不是文件自恢复，而是 A9 校验器在 Electron Node mode
下误用被 ASAR hook 接管的 `fs` 读取物理 `.asar`。修复后的校验器强制使用 Electron `original-fs`、
缺失时 fail-closed，并在启动脚本中清除外部 `NODE_OPTIONS`。新候选来自干净源码且两次构建字节一致，
在 Win7 SP1 x64 的独立 `WIN7-03` 目录重跑 Gate 3 后，ZIP、manifest、Full Tree、native/ABI 与无系统
Node 五项全部 PASS。旧失败证据未覆盖；Gate 4～10、普通用户、PowerShell 5.1、真实 Git 与 J1～J5
仍未执行或受阻，不能签发 `A9_ALPHA1_PASS`。随后已在 `C:\A9验收\工作区\中文 空格项目-03`
准备不依赖系统 Node/Python 的一次性 CMD 项目，并确认其基线测试按设计真实失败，可供 J1～J3 使用；
该目录未执行 `git init`，J4 继续等待用户明确授权和 Git 前置。机器可读记录见
[`a9-07-win7-gate3-integrity-repair-20260824.json`](../status/a9-07-win7-gate3-integrity-repair-20260824.json)。

### 3.8 WIN7-10 Review 失败与 Alpha 1 范围调整（2026-08-25）

```text
Candidate: WIN7-10-GLOBAL-MODE-CLEAN
Source-Commit: f6cc12984f59745cd0edcd16f387080d603ba553
Win7-Full-Access: PASS
Win7-Read-Only: PASS
Win7-Review: FAIL_REVIEW_STAGING_BACKEND_NOT_CONFIGURED
Historical-Disposition: PRESERVE_FAIL_NO_RETROACTIVE_REJUDGMENT
Scope-Decision: ADR-0096_REVIEW_DEFERRED_TO_0.3.0-alpha.2
Candidate-Continuation: WIN7-10_UNCHANGED_RESUME_AT_J4
```

WIN7-10 在正式 Desktop Runtime 中持久化 `review` 后，写工具得到结构化 fail-closed 错误，正式工作区零写入，
但不存在 staging、文件级决定、审批或 Apply。原始失败证据保持在
`C:\A9验收\证据\WIN7-10\gate4-review-staging-failure-20260825-01.txt`，SHA-256 为
`F5CEA1D1B08797AFA846E7A63032CAD0000660DFF0FA3786310BABE38A99F571`。ADR-0096 将 Review 移入
Alpha 2；WIN7-10 不改判。由于该决定只修改文档和验收范围，不改变 WIN7-10 产品字节，同一候选从现场
实际检查点 J4 继续；Review 仍可见是 Alpha 1 已知限制，进入后只能 fail-closed，继续写入旅程前必须由用户
显式切回 Full Access。状态记录见
[`a9-alpha1-review-deferral-20260825.json`](../status/a9-alpha1-review-deferral-20260825.json)。

| 要求 | 当前证据状态 | 继续动作 | 确定性验收 |
|---|---|---|---|
| A9-M01 Alpha 1 支持模式 | `pass`：Full Access/Read Only 已实机通过 | 保留既有证据 | 不因 Review 延期重跑 |
| A9-M01 `review` 已知限制 | `fail-closed`：零写入，旧 Gate 4 FAIL 永久保留 | 发布说明标注；写入旅程前显式切回 Full Access | 不计 Alpha 1 PASS，也不静默提权 |
| A9-M04 Alpha 2 Review | `out-of-scope` | Alpha 1 不实现；另立 Alpha 2 任务书 | Alpha 1 不签 Review PASS |
| A9-AC01 开发机 | `pass` | 无实现变化，无需重跑 | 已归档 A9-01～A9-06 证据 |
| A9-AC02 Win7 | `in-progress`：现场报告已到 J4 | 补归档 J1～J3，再从 J4 继续 | 同一 WIN7-10 完成剩余 Gate |

2026-08-25 只读核对 `C:\A9验收\证据\WIN7-10` 时，只看到候选身份、完整性和 Review 失败五个文件；
J1～J3 的执行事实尚未写入候选外证据目录。因此当前以操作者报告记录“已到 J4”，但 J1～J3 在最终裁决前
保持 `EVIDENCE_PENDING`。应优先从现有应用审计、任务记录、工作区文件、测试输出和 Diff 补档，不做无意义重跑。

### 3.9 WIN7-19 Alpha 1 收口（2026-08-28）

```text
Candidate: WIN7-19
Source-Commit: 781b20e3da277570f85c28286d7ea5bbbdd5fa28
ZIP-SHA256: 824a10cd213534aca87c348d8304b053d27a5bd896831daf528ed13b1c1c72b0
Manifest-SHA256: b483e9b0bcab19cf96114bda39e5d8a9ef8a48842c9aaabbaabfa7e87af12c26
Manifest-Files: 780
State-Schema: 4
Current-Candidate-Rechecks: PASS
Inherited-Evidence: PASS_BY_ADR_0097_TRACEABILITY
P0/P1: NONE
Disposition: A9_ALPHA1_PASS / GO_FOR_ALPHA
```

WIN7-18 的复合 CMD/绝对 `git.exe push` 审批绕过由 WIN7-19 关闭。四个新 Turn 分别生成新的单次审批身份；
拒绝、旧卡、重复点击和变更目标均未产生额外执行。候选还完成身份与 5/5 完整性、正式 Electron
启动/退出/重启、普通用户正常关闭/历史恢复、后飞行零残留及秘密扫描。未受本次三文件修复影响的七组能力
按 ADR-0097 继承 WIN7-17/18 证据；报告校验器因 schema 无 `INHERITED_EVIDENCE` 值而保留
`EVIDENCE_PENDING`，不得误写成 WIN7-19 全量现场重跑。权威摘要见
[`a9-alpha1-win7-19-acceptance-20260828.json`](../status/a9-alpha1-win7-19-acceptance-20260828.json) 和
[`A9 Alpha 1 WIN7-19 收口报告`](../reports/2026-08/a9_alpha1_win7_19_closeout_2026-08-28.md)。

## 4. 关键实现合同

### 4.1 权限与工具

- Alpha 1 对用户提供 `read_only / full_access`；内部 `review` 枚举和缺后端 fail-closed 路径可保留用于兼容与纵深保护。
- Full Access 工具无需每次能力令牌；始终确认操作仍使用目标绑定、一次性审批。
- Read Only 工具目录不包含写、删除或 Shell；Alpha 1 UI 不得允许选择 Review。
- 历史 `review` 设置不得静默变成 Full Access；必须显示 Alpha 2 延期诊断并要求显式选择可用模式。
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
- A9 schema v4 将工作区与对话分离：每个工作区最多 16 个未归档对话，支持新建、切换、重命名、归档和
  恢复；对话隔离任务、Turn、Run、审批、checkpoint、草稿和 Provider 文本上下文。
- 活动任务、后台进程、审批、checkpoint 和模型请求具有版本化状态；重启恢复活动工作区、活动对话和完整
  可见历史，但只向 Provider 提供最近 20 个完整文本轮次且最多 32,000 字符，不自动执行或重放副作用。
- 旧工作区派生 Session 迁移为“历史对话”；迁移前创建可读备份和 SHA-256，失败事务回滚并进入 diagnostics。
- 草稿由 Electron `safeStorage`/Windows DPAPI Current User 加密，SQLite 只保存 Base64 密文；不可用或解密
  失败时仅内存并向用户提示，草稿不进入事件、日志、checkpoint、审批或模型。
- 活动 Turn、待审批或托管后台进程存在时禁止切换工作区或对话。审批与 checkpoint 必须绑定完整对话和
  Turn 身份，旧卡、重启卡或身份漂移卡不可执行。
- 日志保留和空间清理由状态层记录决定，不依赖用户手工清目录。

## 5. 开发机测试矩阵

| ID | 验收行为 |
|---|---|
| A9M-01 | Full Access/Read Only 选择、记忆和切换；Review 缺后端 fail-closed、零写入且不静默提权 |
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
- Full Access 与 Read Only 正/负向通过；Review 缺后端时零写入并作为 Alpha 2 延期/Alpha 1 已知限制；
- J1～J5 全部通过；
- PowerShell 5.1 与 CMD 降级；
- 中文/空格路径、CP936/UTF-8/CRLF、可选 Git/Python/Node 缺失降级；
- 取消后的进程树/残留检查；
- SQLite 重启、损坏备份和旧版回退；
- 包前后 SHA-256、manifest 全树和证据目录分离。

后续修复候选按 ADR-0097 执行影响范围增量复验：候选身份、完整性、启动绑定和后飞行每轮必做；历史失败、
BLOCKED、证据不足及本次变更直接影响项必须重验。已有充分证据且未受影响的项目改为
`INHERITED_EVIDENCE / OPTIONAL_REGRESSION`，保留原候选和证据路径，不要求机械重跑，也不得冒充当前候选
现场 PASS。影响范围无法证明时必须扩大复验。

### 7.3 完成裁决

只有 A9-00～A9-07 对应开发机 Gate、ADR-0096 的 Review 延期处置、ADR-0097 要求的当前候选必验项通过、
其余硬能力具有可追溯继承证据，且无数据损坏、不可解释残留或未处置硬失败，才能标记
`A9_ALPHA1_PASS`。该 PASS 只覆盖 Full Access 与 Read Only，不能写成 Review PASS。报告必须区分
`CURRENT_CANDIDATE_PASS`、`INHERITED_EVIDENCE` 与 `OPTIONAL_REGRESSION_NOT_RUN`；Best Effort 降级不得
冒充正式支持。

WIN7-19 已按上述口径满足完成条件并由 ADR-0099 标记 `A9_ALPHA1_PASS / GO_FOR_ALPHA`。该结论不是
Review PASS 或 RC PASS；Win10 同候选 smoke 仍须在 RC 前补齐。

## 8. 当前起点差距

权威差距矩阵见
[`A9 Trusted Agent 差距与交付计划`](../reports/2026-08/a9_trusted_agent_gap_and_delivery_plan_2026-08-22.html)。
摘要：A8 UI/Core/State/DPAPI/打包可复用；Full Access、通用 Shell、完整文件工具、开放 Provider、真实 Git、
每轮 checkpoint 和五旅程为 A9 主要缺口。

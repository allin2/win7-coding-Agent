# 待确认清单

本清单记录阶段 1 实现中发现、但实现工程师无权自行裁决的任务书矛盾；不改变任何已接受 ADR 或冻结架构原则。

## PC-001：包根文件与实现路径白名单冲突

- 状态：已裁决（2026-07-27，ADR-0017）：`src/win7_agent/__init__.py` 已加入 PHASE_01 §0.2 白名单，仅允许包含 `__version__ = "0.1.0"`。本条关闭。
- 发现位置：`docs/tasks/PHASE_01_CAPABILITY_PROBE.md` §0.2 与 §4.1。
- 事实：§4.1 要求创建 `src/win7_agent/__init__.py`，但 §0.2 的唯一源码白名单为 `src/win7_agent/probe/**`，不包含该文件。
- 当前处理：已创建 `src/win7_agent/__init__.py`，且内容严格限定为 `__version__ = "0.1.0"`。
- 需要裁决：无。

## PC-002：开发环境未提供 CPython 3.8.10

- 状态：部分解除；待 Win7 E1/E2 验收环境执行。
- 事实：早期开发环境仅有 CPython 3.9.6；此后开发机已完成正式 CPython 3.8.10 验证（Phase 2 Gate `PYTHON38_VALIDATED`，提交 `fd40ad2`，标签 `phase2-py38-validated`；原型线另见 `prototype-r1-py38-verified`）。仍缺失的只有 Win7 SP1 x64 实机环境。
- 当前处理：Phase 1/2 代码均已在 CPython 3.8.10 下通过编译与测试矩阵；代码仅采用 Python 3.8 可用的语法和标准库 API。
- 需要裁决：无；请在 Win7 实机 E1/E2 使用 CPython 3.8.10 执行各任务书验收矩阵，并按 `docs/EVALUATION.md` §5 留存验收记录。

## PC-003：Win7 对标 Codex 计划的关键架构裁决（ADR-0028~0035 提议态）

- 状态：已裁决（2026-07-29，项目负责人）。裁决结果：ADR-0028~0035 及下列关键项**全部批准**，状态转 Accepted；授权按规划实施，前提为"Win7 支持"——即各组件仍须通过对应 Win7 SP1 x64 实机 Spike/验收方可宣称满足 Win7，Spike No-Go 时按 ADR-0028 降级阶梯以补充 ADR 修订。随裁决生效：SPIKE_01~04 任务书转 `APPROVED_FOR_IMPLEMENTATION`（脚手架可在现代构建机先行编写，`Win7-Validation` 保持 `NOT_PERFORMED` 直至实机执行）；PHASE_03~07 保持 `DRAFT`，待对应 Spike Go 后逐阶段解锁。
- 定位（重要）：ADR-0027 及既有架构文档继续作为 **Win7 平台架构与安全宪法**；ADR-0028~0035 是收窄其上的 **Electron 首选实施 Profile**。裁决使这些 ADR 转 `Accepted`，含义是**决策方向锁定、授权推进验证与实施**，**不等于"已满足 Win7 的可交付产品"**——当前仍判定为"Win7 首选实施方案，等待 Spike 验证"；四项 Win7 实机 Spike 通过前，不得将技术栈**表述为"已满足 Win7/ 已可交付"**。
- 事实：`docs/DECISIONS.md` 的 ADR-0028~0035 已于 2026-07-29 由项目负责人裁决通过、状态转 **Accepted**；SPIKE_01~04 任务书据此转 `APPROVED_FOR_IMPLEMENTATION`，PHASE_03~07 仍为 `DRAFT` 待对应 Spike Go 后解锁。
- 评审已纳入的修正（2026-07-29，随文档更新）：
  1. Core 固定为独立 `utilityProcess`（main 仅编排、Renderer 最小权限），关闭 `runAsNode` fuse、不用 `ELECTRON_RUN_AS_NODE`。
  2. "唯一原生例外"改为"唯一自研原生组件"；winpty/node-pty、SQLite 绑定、MinGit 均为原生工件，按 §6 登记版本/SHA-256/ABI/编译选项/VC Runtime/ASAR/加载验证。
  3. WPF/Win32/CLI 降级各档须另配独立 Core 宿主，否则属重写而非降级。
  4. workspace-write 的网络控制为 best-effort，**非安全边界**；强制断网走 WFP/企业防火墙或远程隔离。
  5. TLS 需先定型网络栈（Electron `net` / Node `https` / WinHTTP）再分别实测；`DefaultSecureProtocols`/KB3140245 仅对 WinHTTP 有效。
  6. 性能预算数值为 `PROPOSED/NOT_MEASURED`，Spike 实测 + ADR 转 Accepted 前不作 Win7 硬门槛。
  7. ADR-0029 理由更正为"统一运行时、减少双栈维护"，非"Python 结构性无法达标"。
- 需要裁决的关键项（可分项裁决）：
  1. **技术栈单栈化**（ADR-0028）：Electron 22.3.27 承载 Shell + Core（独立 utilityProcess 内嵌 Node 16.17.1），一个自研 C++ helper；降级阶梯 Electron → WPF → Win32 → CLI+App Server → CLI-only，各档另配独立 Core 宿主。
  2. **Python 资产冻结 legacy**（ADR-0029）：Phase 1/2 在 Win7 验收后只修缺陷；Node Core 按契约对账继承，不整体移植。
  3. **取消 full-access 本地等价**（ADR-0030）：仅 read-only / workspace-write 两档自动化 + 逐条审批/远程执行，不伪装本地沙箱；本地网络限制为 best-effort 非隔离。
  4. **`.gitignore` 引入与 PRD 纳入版控**（已随 WS0 提交生效；如负责人反对可回退该提交）。
  5. 其余 ADR-0031/0032/0033/0034/0035（终端隔离、Git Adapter、性能预算、功能三分级、插件边界）为上述裁决的配套细化，建议一并裁决。
- 当前处理：Spike 任务书可先行编写（文档态），但其状态停留在 `DRAFT`；任何 `spike/*` 分支实现代码等待本条裁决 + 对应任务书获批。

# AGENTS.md — win7-coding-agent 执行入口

> 本文件是仓库级最高约束入口。详细规范由下列权威文档承载；发生冲突时按优先级裁决。修改本文件必须在 `docs/DECISIONS.md` 新增 ADR。

## 1. 项目定义与文档优先级

项目是在 **Windows 7 SP1 x64** 上运行的企业内部通用 Coding Agent 执行端与客户端；模型默认在远程或内网服务推理，Win7 端负责受控交互、文件与命令操作、验证、状态和审计。

冲突优先级：

1. `AGENTS.md`
2. `docs/WIN7_CONSTRAINTS.md`
3. 当前任务书（`docs/tasks/*.md`）
4. `docs/ARCHITECTURE.md`、`docs/SECURITY.md`
5. 其余文档

规则缺失、任务书未授权或文档冲突时，停止相关实现并报告；不得自行扩大范围。

## 2. 当前阶段：A9-09 D-013 TrustedShell Current-User Profile

- 当前任务：`docs/tasks/A9_09_D013_TRUSTED_SHELL_PROFILE.md`，状态 `APPROVED_FOR_IMPLEMENTATION`；
  A9-08 授权范围内修复、全量验证和三路独立复核已经 PASS，但其最终阶段签发被 D-013 合同阻断。
- 交付分支：`codex/a9-trusted-agent-runtime`；版本：`0.3.0-alpha.1`；目标候选：WIN7-20。
  WIN7-19 仍是不可变历史验收里程碑，但后置独立审查发现未覆盖 P1，当前综合状态为
  `FIX_BEFORE_ALPHA`，PR #3 在 A9-09 与 WIN7-20 Gate 完成前不得合并。
- ADR-0096 将 Alpha 1 支持范围收敛为 Full Access 与 Read Only；完整 Review 工作流延期至
  `0.3.0-alpha.2`。WIN7-10 中仍可见但无后端的 Review 是已知限制，只能 fail-closed，不能算 Alpha 1
  支持能力或 Review PASS，也不得静默提升为 Full Access。
- 当前状态：ADR-0101 已授权独立的 D-013 v25 / 协议 v2 /
  `a9-trusted-shell-current-user-v1`，保留 v24 Low-Risk Profile 和全部历史证据。完成锁定构建、产品装配、
  独立复核和 WIN7-20 增量实机复验后，才能恢复 `GO_FOR_ALPHA`。最新事实见
  `docs/STATUS.md` 与 `docs/tasks/README.md`。
- A9 在可信工作区提供 Full Access、TrustedShell 和真实 Git；这不是安全沙箱。A9 对 C08/C09/C20 的局部替代仅以 ADR-0089 和 A9 任务书为准，不外推至历史任务或其他分支。
- A9 仍必须经过 Schema IPC、Core/Policy、目标绑定批准与审计，并保留取消、输出上限、进程树清理、凭据脱敏、TLS 默认验证、checkpoint、Renderer 隔离和 Win7 实机硬门槛。

## 3. 开始任务前必须读取

1. 所有任务先读本文件。
2. 写、改、审查或调试实现前，再读 `docs/WIN7_CONSTRAINTS.md` 和当前任务书；A9-09 工作同时读
   `docs/tasks/A9_09_D013_TRUSTED_SHELL_PROFILE.md`、`docs/tasks/A9_08_POST_REVIEW_HARDENING.md` 与
   `docs/tasks/A9_TRUSTED_AGENT_RUNTIME.md`。
3. 按任务需要读取架构、安全、评估、PRD、ADR 或状态文档；不要无条件加载全部历史资料。
4. 处理历史阶段时，按 `docs/tasks/README.md` 定位其任务书和分支合同；A9 授权不适用。

已读取且未变化的大文件不重复读取。摘要不能替代当前任务所必需的原始约束。

## 4. 实现授权与允许路径

- **C14：默认禁止编写实现代码。** 只有当前任务书状态为 `APPROVED_FOR_IMPLEMENTATION`，当前分支符合任务书，且目标文件位于任务书允许路径内，才可实现。不得通过修改白名单、临时豁免或借用其他阶段授权绕过检查。
- 文档和 ADR 修改不受实现路径白名单限制，但仍受本文件的文档规则及用户任务范围约束。
- 新运行时、框架、库、原生模块、外部程序或高风险系统 API，必须先按 `docs/WIN7_CONSTRAINTS.md` §6 登记并锁定版本、来源、哈希、许可证、风险和交付闭包（C15/C16）。
- 影响接口、数据格式、兼容性或安全模型的决定必须新增 ADR。不得删除或改写 Accepted ADR 正文；只能新增 ADR，并在需要时将旧 ADR 状态标为 Superseded。

## 5. 安全与兼容性红线

- **Win7 SP1 x64 是硬门槛。** 新组件必须声明 Runtime Profile、前置条件、构建/运行边界、系统 API、降级路径与实机证据；不得依赖未声明工具或 Windows 10+ 专属 API。开发机通过不等于 Win7 通过。
- 路径必须兼容中文、空格、盘符和反斜杠。文本 I/O 显式指定编码；未知内容按字节处理。新 Markdown 和文本源码使用 UTF-8 无 BOM、LF；其他编码或换行仅限任务书明确授权的文件。
- 持久化格式必须版本化。交付模式和全部运行前置必须声明；下载、安装、更新、注册表、服务、提权或系统配置修改仅在任务书明确授权、可审计且可回滚时允许。
- 业务代码和 UI 不得绕过批准的 Runner、TrustedShellRunner、Policy 或审计执行进程。Agent 工具默认不等待 stdin；交互终端须独立授权并与 Agent Runner 隔离。
- 进程必须有输出控制、用户取消和进程树清理；A9 是否使用固定 deadline 按 ADR-0089。不得把 `taskkill` 或 Full Access 描述成安全隔离。
- Renderer 不得直接获得文件、进程、凭据或任意网络权限；高权限操作必须经 Schema IPC 和授权链。终端输出按不可信数据处理，模型不得向用户终端注入输入或控制序列。
- 网络仅按任务书和 ADR 授权。A9 可继承用户网络且不设域名白名单，但外部写入、破坏性或高影响操作仍须执行目标绑定确认；不得关闭 TLS 默认验证，秘密不得进入日志、事件或快照。
- 禁止静默吞异常和占位式规范。失败必须留下结构化、经过脱敏且不过量的诊断信息。

## 6. 最小修改与验证

- 先确认仓库、分支、任务状态和工作区；默认留在当前分支。保护用户已有改动，只修改当前请求需要的文件，不顺带重构、改名、格式化或清理。
- 先定义可观察的成功条件，再做最小改动和与风险相称的验证。优先目标测试或局部静态检查；不默认运行全量测试。
- 仅在修改 UI、布局、视觉交付物或用户明确要求时做浏览器、截图、渲染或视觉 QA。
- 阶段完成和兼容性结论必须以任务书要求的证据为准；未执行的 Win7 实机验证必须明确标为未验证。

## 7. Auto Review 与工具成本控制

- workspace 内普通读取、授权范围内编辑和相关的非破坏性本地检查直接执行，不为同一安全操作重复请求批准。
- 仅在任务确需跨越沙箱、访问网络、启动外部应用、写外部系统、执行破坏性操作或扩大范围时申请批准；批准必须绑定具体目标和动作。
- 普通代码或文档修改不自动启动浏览器、GUI、截图、HTML 渲染、外部应用或全量测试。优先使用 workspace 内可完成的安全路径。
- 限制工具输出，只保留结论、失败位置和必要上下文；不重复执行已成功且输入未变化的检查，也不重复读取未变化的大文件。
- Auto Review 拒绝后，不用命令变体反复尝试；改用实质上更安全的路径，否则停止并请求用户决定。
- 不得为了减少审批而扩大权限、启用 Full Access、合并不相关操作、弱化审计或跳过必要确认。

## 8. 权威文档与历史入口

| 主题 | 权威来源 |
|---|---|
| Win7、C01–C20、Runtime Profile、依赖登记 | `docs/WIN7_CONSTRAINTS.md` |
| A9 当前实现授权、范围与验收 | `docs/tasks/A9_09_D013_TRUSTED_SHELL_PROFILE.md`、`docs/tasks/A9_TRUSTED_AGENT_RUNTIME.md` |
| A9 产品需求与 Full Access 裁决 | `docs/prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md`、ADR-0089 |
| 当前状态与任务索引 | `docs/STATUS.md`、`docs/tasks/README.md` |
| 架构、安全与评估 | `docs/ARCHITECTURE.md`、`docs/SECURITY.md`、`docs/EVALUATION.md` |
| 历史阶段、A8、Phase、Prototype、Spike | `docs/STATUS.md`、`docs/tasks/README.md` 及对应任务书 |

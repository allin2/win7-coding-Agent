# A9-08 — WIN7-19 后置独立审查修复与 WIN7-20 增量复验

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_HARDENING
Target Branch: codex/a9-trusted-agent-runtime
Target Version: 0.3.0-alpha.1
Source Baseline: WIN7-19 / 781b20e3da277570f85c28286d7ea5bbbdd5fa28
Current Stage: A9-08
Current Stage Status: A9_08D_CHECKPOINT_STATE_PASS
Target Candidate: WIN7-20
Win7 Validation: NOT_PERFORMED_FOR_WIN7_20
Decision: ADR-0100
```

## 1. 背景与裁决

WIN7-19 在当时执行和继承的验收范围内取得 `GO_FOR_ALPHA`，该候选、哈希和原始证据保持不可变。
随后项目负责人要求在合并前独立审查审批、状态迁移、进程停止、checkpoint 和秘密保护。审查与隔离动态
复现发现新的 P1：Shell 变体可绕过 `git push` 审批，已知秘密可进入事件/SQLite WAL/Renderer 快照，
以及 Provider、遗留 IPC、进程和恢复路径的其他硬缺陷。因此当前交付状态转为 `FIX_BEFORE_ALPHA`，
但不追溯篡改 WIN7-19 的现场执行事实。

本任务只修复已确认的后置审查缺陷并补齐相应回归；不实现 Alpha 2 Review，不重构无关 A8/A7 历史代码，
不修改 WIN7-19 ZIP、manifest、candidate identity 或候选外证据。

## 2. 实现授权与允许路径

- `src/core/src/**`、`src/core/tests/**`：Shell/Git 高影响分类与审批绑定。
- `src/shell/product/**`、`src/shell/tests/product/**`：A9 IPC、秘密边界、Provider 配置、退出和 Stop。
- `src/gateway/src/**`、`src/gateway/tests/**`：TLS/CA 与 Provider 凭据传输合同。
- `src/runner/src/**`、`src/runner/tests/**`：D-013 helper、进程树结果和并发停止。
- `src/workspace/src/**`、`src/workspace/tests/**`：checkpoint 身份、目录漂移、快照完整性和 undo 持久化。
- `src/state/src/**`、`src/state/tests/**`：跨工作区对话边界、迁移事务与 A8 物理数据库导入。
- `release/win7-product-v3/**`、`scripts/release/**`：WIN7-20 验证和确定性构建。
- `docs/**`、`AGENTS.md`、`README.md`：授权、状态、追踪、验收和发布说明。

不新增依赖、Runtime Profile、服务、注册表、PATH、防火墙或 TLS/SSH 弱化设置。不得删除或改写历史
Accepted ADR 和 WIN7-19 证据。

## 3. 需求追踪矩阵

| ID | 要求 | 当前状态 | 最小修复 | 开发机验收 | WIN7-20 必验 |
|---|---|---|---|---|---|
| A9R-01 | CMD/PowerShell 包装、转义或动态调用中的外部 Git 写入不得绕过审批 | implemented | 无法可靠静态解析时对可疑 Git push fail-closed；正确解析带值选项目标 | 分类器与 Policy 负向矩阵 PASS | CMD/PS 5.1 真实拒绝/批准/变目标 |
| A9R-02 | Alpha 1 Renderer 不得调用延期的 A8 Review 写入链 | implemented | A9 产品入口不暴露、不注册遗留 mutation IPC | Preload/main IPC 边界测试 PASS | Read Only/Full Access 下遗留动作零写入 |
| A9R-03 | 已知秘密不得进入事件、审批、SQLite、WAL、日志、checkpoint 或快照 | implemented | 在统一事件/审批持久化与展示边界递归脱敏 | 全 dataRoot 与 snapshot 扫描 PASS | 普通用户秘密扫描 |
| A9R-04 | Provider 凭据绑定目标；Base URL 改变不得复用旧 Key | implemented | origin 改变时清除内存/DPAPI Key，空 Key 不继承 | 双 Provider 捕获测试 PASS | Provider 切换负向 |
| A9R-05 | TLS 验证不得关闭；CA 缺失必须 fail-closed | implemented | 主进程拒绝 insecure 配置，Provider 拒绝缺失 CA | TLS/IPC 合同测试 PASS | TLS/CA 负向 |
| A9R-06 | 正式 A9 Shell 使用已锁定 D-013 helper；清理结果不得虚报 | implemented | 接入 helper transport；无法证明整树清理时报告 residue | 正式 composition 与进程树测试 PASS | 双 Stop、崩溃、退出零残留 |
| A9R-07 | 无法清理时保留可操作窗口和锁，用户可重试/选择退出 | implemented | 关闭前完成退出决策；阻断时不销毁唯一窗口 | Electron 生命周期测试 PASS | recovered PID/退出锁 |
| A9R-08 | checkpoint undo 不得恢复错对象或删除 Turn 后数据 | implemented | 目录树哈希、无碰撞快照身份、漂移拒绝、undo 持久化 | 目录/重启/篡改测试 PASS | checkpoint/undo 增量矩阵 |
| A9R-09 | 对话操作必须受当前工作区约束 | implemented | restore/rename 验证 canonical workspace | 跨工作区负向测试 PASS | 对话隔离抽样 |
| A9R-10 | v2→v4 迁移整体原子，真实 A8 物理库只读白名单导入 | implemented | 单一恢复边界或失败自动还原；显式 A8 source path | 故障注入与物理布局迁移测试 PASS | v3→v4/回滚/fail-closed |

## 4. 批次和 Gate

1. `A9-08A_APPROVAL_IPC_PASS`：A9R-01～02。
2. `A9-08B_SECRET_PROVIDER_TLS_PASS`：A9R-03～05。
3. `A9-08C_PROCESS_LIFECYCLE_PASS`：A9R-06～07。
4. `A9-08D_CHECKPOINT_STATE_PASS`：A9R-08～10。
5. `A9-08E_DEVELOPER_REVIEW_PASS`：全量验证和第二轮独立审查无 P0/P1。
6. `A9-08F_WIN7_20_GO_FOR_ALPHA`：按 ADR-0097 完成候选必验项及所有直接受影响项。

每批独立提交并推送；后一批不得把前一批失败掩盖为完成。开发机 PASS 不冒充 Win7 PASS。

### 4.1 A9-08A 审批与 IPC 检查点（2026-08-28）

- CMD caret、PowerShell backtick、CMD `%VAR%` 和 PowerShell call-operator 形式的 `git push` 均进入
  `always_confirm`，原始完整命令仍绑定 SHA-256；`-o/--push-option/--repo` 不再错位显示 remote/branch。
- 正常 A9 Preload 不暴露延期的 A8 Review mutation API；主进程 A8 IPC 同时拒绝 mutation action，
  只有显式历史 A8 smoke 参数可以启用，A9 仍可复用有界 workspace read DTO。
- Core 定向测试 26/26、Shell 定向测试 8/8、Core TypeScript noEmit 和 Shell TypeScript/Node syntax 通过。
- 本检查点只证明开发机合同；WIN7-20 的 CMD/PowerShell 审批和 A8 旁路零写入仍为必验。

### 4.2 A9-08B 秘密、Provider 与 TLS 检查点（2026-08-29）

- Agent Loop 事件、审批持久化和 Renderer 投影统一递归脱敏；已知秘密的原文、URL 编码与 Base64
  形式不得进入 timeline、SQLite/WAL、checkpoint 或快照，内部执行对象仍保留原始目标用于摘要绑定。
- API Key 只可在同一 Provider origin 内复用；切换 origin 且未输入新 Key 时，同时清除内存与 DPAPI
  旧值，双 fixture 捕获证明新端点未收到旧 Authorization。
- Workbench 与旧 Renderer 发送路径不再提供 insecure TLS 字段；IPC、Runtime 和 Gateway 分层拒绝关闭
  证书验证，缺失 CA 路径在发起网络请求前 fail-closed。
- Gateway 合同 14/14、Shell Provider/生命周期/IPC/Workbench 合同 53/53 通过；相关 TypeScript 构建、
  JavaScript 语法和 diff 检查通过。此结果不替代 WIN7-20 的普通用户秘密、Provider 切换与 TLS/CA 负向复验。

### 4.3 A9-08C 进程生命周期检查点（2026-08-29）

- 正式包从已校验的 `a9PackageRuntime.runnerHelper` 构造 `StdioHelperTransport`；缺少 helper 时 packaged
  composition fail-closed。前台 Shell 与托管后台 Shell 均复用 D-013 v24 的 Job Object 和绑定
  requestId cancel 回执，后台 Stop 只有在 containment/input-detached 得到证明后才报告成功。
- 非 helper Windows 回退在 `taskkill /T` 前通过 Win7 自带 WMIC 捕获递归后代 PID，并在结束后逐一核验；
  无法枚举或仍有任一 PID 存活时报告 residue，不再只凭根 PID 消失声称整树已回收。
- 托管后台进程的重复 Stop 共享同一 in-flight 操作；shutdown 等待该操作，不并发重复终止。
- Electron 在唯一窗口 `close` 阶段先执行 runtime shutdown；残留未确认时阻止窗口销毁并保留工作区锁与
  可操作 UI，正常清理后才允许窗口关闭/应用退出。
- Runner 定向合同 32/32、Shell 生命周期/产品/窗口/包合同 43/43、Runner TypeScript 与 Shell
  JavaScript/diff 检查通过。Win7 上 helper 前后台、双 Stop、崩溃恢复、recovered PID 和退出零残留仍为必验。

### 4.4 A9-08D checkpoint 与状态迁移检查点（2026-08-29）

- Checkpoint 清单升级为 v4：目录快照使用相对路径 SHA-256 身份，保存并校验确定性目录树哈希；创建目录
  出现 Turn 后数据、目录漂移或快照篡改时拒绝自动覆盖/删除。undo 成功身份持久化，重启或重复点击不会
  再次作用于文件系统。工作区外变化只保存显式 `outside/unrecoverable` 事实，不从可篡改清单自动恢复外部路径。
- 对话重命名与恢复在持久化层同时验证当前 canonical workspace；仅知道其他工作区的 conversationId
  不足以修改或激活该对话。
- v2→v3→v4 使用单一 SQLite transaction，后段故障会连同前段 DDL 和 schema marker 一起回滚；正式
  Runtime 显式传入 `userData/state/agent-events-v2.db`，以只读连接从真实 A8 物理库只导入工作区白名单，
  不导入会话、任务、审批、Provider 或秘密，也不写回 A8。
- Workspace 全包 17 suites / 142 tests、State 全包 20 suites / 269 tests 通过；Shell 受影响产品入口
  22 tests 通过，Shell 全包在补齐构建前置后累计 290 tests 通过。相关 TypeScript、JavaScript syntax、
  diff 检查通过。此结果不替代 WIN7-20 的 checkpoint/undo、跨对话隔离与迁移回滚实机复验。

## 5. 完成条件

- 全部 A9R-01～10 具有连接真实产品入口的确定性回归证据；
- `npm run verify`、`npm run docs:check` 和包级验证通过；
- 第二轮独立审查没有未处置 P0/P1；
- WIN7-20 来自干净源码、双构建一致，在 Win7 SP1 x64 普通用户完成 ADR-0097 必验及影响项；
- 只有上述条件满足后才能恢复 `GO_FOR_ALPHA` 并合并 PR #3。

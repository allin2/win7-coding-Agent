# A9-08 — WIN7-19 后置独立审查修复与 WIN7-20 增量复验

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_HARDENING
Target Branch: codex/a9-trusted-agent-runtime
Target Version: 0.3.0-alpha.1
Source Baseline: WIN7-19 / 781b20e3da277570f85c28286d7ea5bbbdd5fa28
Current Stage: A9-08
Current Stage Status: A9_08E_BLOCKED_D013_CONTRACT
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
| A9R-03 | 已知秘密不得进入事件、审批、SQLite、WAL、日志、checkpoint 或快照 | implemented | 统一递归脱敏；恢复区识别 UTF-8/UTF-16LE/CP936，在路径/内容入口阻止已知秘密 | 全 dataRoot、snapshot、`.agent_recovery` 扫描 PASS | 普通用户秘密扫描 |
| A9R-04 | Provider 凭据绑定目标；Base URL 改变不得复用旧 Key | implemented | 精确 Base URL 改变时清除内存/DPAPI Key，并为所有对话推进持久化 context generation | 同源不同路径/跨 origin 负向 PASS | Provider 切换负向 |
| A9R-05 | TLS 验证不得关闭；CA 缺失必须 fail-closed | implemented | 主进程拒绝 insecure 配置，Provider 拒绝缺失 CA | TLS/IPC 合同测试 PASS | TLS/CA 负向 |
| A9R-06 | 正式 A9 Shell 使用与 Full Access 相符的 D-013 helper；清理结果不得虚报 | blocked | Runner 侧严格校验回执、持久化清理不确定事实；现有 v24 Low Integrity/白名单协议需新授权修订 | Runner 回执/进程树合同 PASS；正式 Profile 不兼容 | 双 Stop、崩溃、退出零残留 |
| A9R-07 | 无法清理时保留可操作窗口和锁，用户可重试/选择退出 | partial | 关闭前完成退出决策；阻断时不销毁唯一窗口；显式“留给系统”可退出 | Electron 生命周期合同 PASS；ready handshake 仍缺失 | recovered PID/退出锁 |
| A9R-08 | checkpoint undo 不得恢复错对象或删除 Turn 后数据 | implemented | 角色绑定快照、漂移拒绝、undo 持久化；pending 基线对账后签发持久化单次确认身份 | 目录/重启/篡改/两阶段恢复 PASS | checkpoint/undo 增量矩阵 |
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
- API Key 和 Provider context 只可在同一精确 Base URL 内复用；路径、origin 或端口改变且未输入新 Key 时，
  同时清除内存与 DPAPI 旧值，并为当前工作区所有对话推进持久化 generation。同源不同路径与双 origin
  fixture 均证明新端点未收到旧 Authorization/上下文。并发配置由单一 in-flight 锁拒绝，手工 probe 的
  即时 IPC 返回也按 API Key/Header/代理秘密递归脱敏。
- Workbench 与旧 Renderer 发送路径不再提供 insecure TLS 字段；IPC、Runtime 和 Gateway 分层拒绝关闭
  证书验证，缺失 CA 路径在发起网络请求前 fail-closed。
- Gateway 合同 14/14、Shell Provider/生命周期/IPC/Workbench 合同 53/53 通过；相关 TypeScript 构建、
  JavaScript 语法和 diff 检查通过。此结果不替代 WIN7-20 的普通用户秘密、Provider 切换与 TLS/CA 负向复验。

### 4.3 A9-08C 进程生命周期检查点（2026-08-29）

- 正式包从已校验的 `a9PackageRuntime.runnerHelper` 构造 `StdioHelperTransport`；缺少 helper 时 packaged
  composition fail-closed。Runner 只接受字段集合、类型、Base64 长度和 requestId 均严格绑定的 D-013 回执；
  前台、后台和 NativeRunner 复用同一 Job/token/ACL rollback 完整证明，任一矛盾即保持 residue。后台启动
  PID/cleanupRequired 事实在返回 Renderer 前写入 SQLite；畸形 JSON 或字符串型布尔值均不能证明清理。
- 非 helper Windows 回退在 `taskkill /T` 前通过 Win7 自带 WMIC 捕获递归后代 PID，并在结束后逐一核验；
  无法枚举或仍有任一 PID 存活时报告 residue，不再只凭根 PID 消失声称整树已回收。
- 托管后台进程的重复 Stop 共享同一 in-flight 操作；shutdown 等待该操作，不并发重复终止。
- 后台进程已 spawn 后若 SQLite 状态持久化失败，立即进入受控 Stop；仅在清理证明成功时报告 reaped，
  否则返回 residueRisk/cleanupRequired，异步终态回调异常不得逃逸到事件循环。
- Electron 在唯一窗口 `close` 阶段先执行 runtime shutdown；残留未确认时阻止窗口销毁并保留工作区锁与
  可操作 UI；用户也可显式选择将进程留给系统后退出。`cleanup_required` 异步终态写回 SQLite，重启后
  仍保留 Stop/退出裁决，不因 helper PID 消失而伪造整树清理。
- Runner 定向合同 32/32、Shell 生命周期/产品/窗口/包合同 43/43、Runner TypeScript 与 Shell
  JavaScript/diff 检查通过。Win7 上 helper 前后台、双 Stop、崩溃恢复、recovered PID 和退出零残留仍为必验。

### 4.4 A9-08D checkpoint 与状态迁移检查点（2026-08-29）

- Checkpoint 清单升级为 v4：目录快照使用相对路径 SHA-256 身份，保存并校验确定性目录树哈希；创建目录
  出现 Turn 后数据、目录漂移或快照篡改时拒绝自动覆盖/删除。undo 成功身份持久化，重启或重复点击不会
  再次作用于文件系统。工作区外变化只保存显式 `outside/unrecoverable` 事实，不从可篡改清单自动恢复外部路径。
- 对话重命名与恢复在持久化层同时验证当前 canonical workspace；仅知道其他工作区的 conversationId
  不足以修改或激活该对话。
- v2→v3→v4 和最终 schema/index 创建使用单一 SQLite transaction，任一后段故障会连同前段 DDL 和
  schema marker 一起回滚；正式
  Runtime 显式传入 `userData/state/agent-events-v2.db`，以只读连接从真实 A8 物理库只导入工作区白名单，
  不导入会话、任务、审批、Provider 或秘密，也不写回 A8。
- Workspace 全包 17 suites / 176 tests、State 全包 20 suites / 280 tests 通过；Shell 全包
  36 suites / 302 tests 通过。相关 TypeScript、JavaScript syntax、
  diff 检查通过。此结果不替代 WIN7-20 的 checkpoint/undo、跨对话隔离与迁移回滚实机复验。

### 4.5 A9-08E 开发机闭环与剩余阻断（2026-08-29）

- 审批身份加入每次签发的随机 nonce；相同 Turn/callId/args 的再次请求也产生新卡，旧卡、消费卡、重复点击
  和改变目标均无法复用。CMD delayed expansion、PowerShell call operator/环境变量及转义后的 `git push`
  均 fail-closed 到 `always_confirm`。
- Provider 按精确 Base URL 使用持久化单调 generation，而非毫秒 wall-clock；endpoint 变化时同步推进所有
  对话，重启只恢复当前 generation 的文本历史。秘密递归脱敏覆盖 externalChanges、任意合法混合 percent
  encoding、Base64/Base64URL、前后台流式日志、SQLite/WAL、checkpoint 和即时 Renderer IPC 投影。
- checkpoint v4 工件绑定到 Turn/路径/角色；直接工具的轮初原件与 Shell-entry baseline 使用独立角色，旧
  v2/v3 自动 undo 安全拒绝，旧式未绑定 v4 按 Turn 隔离且不阻塞新任务。Shell 副作用前持久化有界文件
  内容、目录存在性及 skipped 事实；轮后收集未完成时，首次显式 Undo 只对账并生成 Diff/持久化单次确认身份，
  第二次请求必须携带该身份才实际恢复；崩溃或无令牌重试只会再次展示预览。恢复区按 UTF-8/UTF-16LE/
  CP936 检查所有 caller-controlled 路径/内容，新密钥配置也会重新验证既有工件；轮后秘密内容只留安全哈希。
  restore swap 删除 backup/stage 前先原子隔离并重验身份。v4 物理库检查列类型、NOT NULL/
  default、PK/CHECK、AUTOINCREMENT 与非 partial 索引；A8 同时验证正式 PK/CHECK/UNIQUE 和 Windows 路径身份。
- 最终开发机全量验证为 Gateway 241、Workspace 176、State 280、Core 306、Runner 120、Git Adapter 56、
  Shell 303，共 1482 tests，7 个模块 lint/build/test 全通过；`docs:check` 与 `git diff --check` 通过。
- 安全、进程、checkpoint/状态三路最终独立复核均为 P0/P1/P2=0，**授权范围内修复闭环 PASS**。
  `A9-08E_DEVELOPER_REVIEW_PASS` 作为阶段签发仍被 D-013 合同阻断：锁定的
  `D-013-v24-low-risk-noninteractive` helper 只允许
  System32 低风险白名单、强制 Restricted Token + Low Integrity、缺少 PowerShell/当前用户 Full Access、
  `envOverlay`、真实无 deadline 与 managed ready acknowledgement。修复需要新增 ADR/任务并授权
  `native/helper/**`、协议版本与 input lock；A9-08 当前白名单不得越权修改。因此不构建 WIN7-20，当前综合
  裁决保持 `FIX_BEFORE_ALPHA`。

## 5. 完成条件

- 全部 A9R-01～10 具有连接真实产品入口的确定性回归证据；
- `npm run verify`、`npm run docs:check` 和包级验证通过；
- 第二轮独立审查没有未处置 P0/P1；
- WIN7-20 来自干净源码、双构建一致，在 Win7 SP1 x64 普通用户完成 ADR-0097 必验及影响项；
- 只有上述条件满足后才能恢复 `GO_FOR_ALPHA` 并合并 PR #3。

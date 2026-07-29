# Win7 Coding Agent v1.0 — 产品与总体架构设计提案

> [!WARNING]
> **历史方案：`SUPERSEDED_BY_ADR-0027`**
>
> 本 v1.0 PRD 已由 [`ADR-0027`](../DECISIONS.md) 取代，仅保留用于历史追溯。正文中的
> Python-only、stdlib-only、禁止 Node.js/Electron、CLI-only，以及“完全离线是唯一交付模式”
> 等假设，均不再是未来实现的项目级基线；后续技术栈、产品形态与交付模式以
> `AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、ADR-0027 和新任务书为准。
>
> Phase 1、Phase 2 的冻结历史合同不受本次废止影响，仍按各自任务书执行。本提示及历史正文
> 均不构成新的实现授权，也不扩大任何现有任务书的路径白名单。

> 文档状态：`SUPERSEDED_BY_ADR-0027`
>
> 文档版本：`1.0`
>
> 创建日期：`2026-07-29`
>
> 废止日期：`2026-07-29`
>
> 需求清晰度：`93/100`
>
> 澄清轮次：`0`（现有项目章程、约束、路线图和 Phase 2 任务书已提供足够基线）

## 0. 文档定位与约束

本文是面向项目负责人的产品与总体架构提案，用于统一最终 Agent 的设计方向。它不是新的实现任务书，不授予任何实现路径，也不改变当前 Phase Gate。

发生冲突时仍严格按以下优先级裁决：

1. [`AGENTS.md`](../../AGENTS.md)
2. [`WIN7_CONSTRAINTS.md`](../WIN7_CONSTRAINTS.md)
3. 当前阶段任务书
4. 已接受 ADR
5. 本提案

本提案中的关键决策只有在追加 ADR、创建对应阶段任务书并获得
`APPROVED_FOR_IMPLEMENTATION` 后才能进入实现。当前目标平台继续冻结为：

- Windows 7 SP1 x64；
- CPython 3.8.10 x64；
- Win7 客户端只使用 Python 标准库；
- 普通用户权限；
- 无 Node.js、Electron、Docker、WSL；
- 不依赖 PowerShell、Git、Visual Studio、.NET SDK 或在线安装；
- 控制台 ASCII-only，文件和协议显式使用 UTF-8；
- Win7 端不运行本地模型。

用户所说“除 Python 环境外其他条件都可以”，本提案解释为：远程模型服务器的技术栈可以自由选择；Win7 客户端仍遵守仓库最高约束。如需放宽“仅标准库”或其他红线，必须先修改最高约束并新增 ADR，不能在实现中静默放宽。

## 1. Why 与 Simpler

### 1.1 为什么做

目标用户处于无法升级的工业、办公或专用软件环境，现有 Coding Agent 普遍依赖新版 Windows、Node/Electron、新版 Python 或在线安装，无法在这些机器上稳定部署。

本项目要解决的不是“让 Win7 承担模型推理”，而是：

> 让 Win7 成为一个最小、确定、限权、可审计、可回滚的代码操作执行端。

### 1.2 能否更简单

最简单且风险最低的产品形态是：

- Win7 端：一次任务一个 CLI 进程，只做本地工具执行和安全裁决；
- 远程端：负责模型调用、厂商适配和重型推理；
- 不做 GUI、后台服务、插件系统、本地模型、多任务并发；
- 写入和命令执行采用“先计划、后批准、再执行”，不允许模型临时扩大权限；
- 所有外部能力缺失时显式降级，不以未捕获异常结束。

这条路线最大限度复用已完成的 Phase 2 垂直切片，并避免在 EOL 平台上引入新的运行时和依赖。

## 2. 目标用户与使用场景

### 2.1 目标用户

- 必须维护 Win7 上存量 Python、批处理或其他文本型项目的开发/运维人员；
- 需要在隔离内网或离线环境中审查、修改和验证代码的工程师；
- 需要完整操作留痕、可回滚和可人工复核的受控环境。

### 2.2 核心场景

1. **只读分析**：解释代码结构、定位实现、查找缺陷并引用真实文件和行号。
2. **变更规划**：模型提出待修改文件、补丁预览、风险和验证命令，Win7 端不执行写入。
3. **受控应用**：用户批准计划哈希后，客户端执行确切补丁并生成备份。
4. **测试验证**：只运行预先登记的命令别名，收集退出码、限长输出和耗时。
5. **失败回滚**：补丁、校验或测试失败时按批准策略恢复原始字节。
6. **审计导出**：导出任务状态、模型请求摘要、策略决定、文件哈希、命令结果和回滚结果。
7. **能力降级**：Git、网络或进程树终止能力缺失时关闭对应工具并说明原因。

## 3. 产品目标与非目标

### 3.1 最终态目标

Win7 执行端应具备：

1. Capability Probe 和启动前能力门控；
2. 编码感知的文件树、读取、范围读取和文本搜索；
3. 工作区内的结构化补丁、写前备份、原子替换和回滚；
4. 受限、非交互式命令执行；
5. 测试执行与结构化验证；
6. SQLite 任务状态、事件轨迹、变更日志和审计导出；
7. 通过内网 HTTPS 与厂商无关模型网关通信；
8. 计划哈希审批和最小权限策略；
9. 复制目录即可运行的离线交付与哈希自校验。

### 3.2 v1 明确非目标

- Win7 本地模型推理；
- GUI、系统托盘、Windows 服务或常驻进程；
- 浏览器 localhost 控制台；
- 多 Agent、多任务并发或分布式调度；
- 动态插件、动态加载第三方代码；
- 任意 Shell 字符串执行；
- 工作区外写入、注册表写入、提权和系统配置修改；
- 自动提交、推送或发布代码；
- 在一次批准后允许模型任意扩大文件或命令范围；
- 对任意未知编码做概率式猜测。

## 4. 推荐总体架构

### 4.1 结论

采用“远程大脑 + Win7 安全执行端”：

```text
---------------------------+       HTTPS / JSON v1       +---------------------------+
| Win7 CLI 执行端           | --------------------------> | 内网模型网关               |
| CPython 3.8.10 stdlib-only| <-------------------------- | 任意现代服务端技术栈       |
|                           |                              |                           |
| Runtime / Policy          |                              | Provider adapters         |
| Workspace / Tools         |                              | Model API credentials     |
| Change journal / Audit    |                              | Token/context management  |
+---------------------------+                              +---------------------------+
           |
           | argv-only, bounded local operations
           v
+---------------------------+
| 用户指定工作区            |
| 源码 / 测试 / 可选 Git     |
+---------------------------+
```

模型网关不拥有本地工具权限。所有读、写、执行和审计决定都由 Win7 客户端完成；远程模型只能提出厂商无关的工具请求。

### 4.2 方案比较

| 方案 | 优点 | 主要问题 | 结论 |
|---|---|---|---|
| Win7 直连模型厂商 API | 少一层服务 | API 密钥落在 EOL 主机；证书、代理、协议和厂商格式耦合 | 不推荐 |
| Win7 连接内网模型网关 | 客户端协议稳定；厂商密钥留服务端；可统一审计和限流 | 需要一台可控服务端 | **推荐** |
| Win7 本地模型 | 无网络 | 依赖、性能、内存和驱动均不符合当前约束 | 排除 |
| 远程 Agent 直接操作共享盘 | Win7 客户端更薄 | 本地权限边界、进程和实际工作区状态不可控 | 排除 |

## 5. Win7 客户端分层

```text
cli
  -> application/runtime
      -> context
      -> gateway -> models
      -> policy
      -> tool registry
          -> workspace
          -> fs
          -> runner
      -> verification
      -> storage/audit
  -> probe
```

依赖规则：

- `cli` 只负责参数、ASCII 摘要和退出码；
- `runtime` 是状态和预算的唯一写入者；
- `gateway` 只能返回厂商无关 `ModelResponse`；
- `policy` 必须先于任何工具执行；
- 文件写入只能经过 `fs`；
- 子进程只能经过 `runner` 私有边界；
- 业务模块禁止直接 `open(..., write mode)`、`subprocess.Popen` 或网络调用；
- 所有关键结果先持久化，再进入下一状态。

### 5.1 现有可复用基线

Phase 2 已提供：

- 厂商无关数据契约；
- Runtime 状态机、Turn 和工具预算；
- READ_ONLY Policy；
- 工作区词法与 realpath 双边界；
- 六个只读工具；
- SQLite EventStore；
- Mock/Replay Provider；
- 证据验证和 CLI 退出码。

这些能力应演进，不应另建一套平行 Runtime。

### 5.2 新增模块

| 模块 | 职责 | 禁止旁路 |
|---|---|---|
| `gateway/` | HTTPS、协议校验、认证、超时、幂等和响应上限 | 其他模块不得发网络请求 |
| `fs/` | 编码/EOL 检测、结构化补丁、备份、原子写、回滚 | 工具不得直接写文件 |
| `runner/` | 命令别名解析、argv 执行、超时、截断、进程树终止 | 业务代码不得直接 Popen |
| `approval/` | 计划哈希、授权范围和批准验证 | 模型不得自行批准 |
| `audit/` | 审计导出、敏感字段过滤、完整性检查 | 日志不得记录凭据 |

## 6. Agent 运行流程

### 6.1 只读分析

```text
CLI 校验
  -> Probe/能力门控
  -> 建立 Run + run.created
  -> 工作区发现
  -> 编译有限上下文
  -> Gateway/Mock/Replay
  -> Policy
  -> 只读工具
  -> Verification
  -> COMPLETED / FAILED / CANCELLED
  -> 审计与 RESULT
```

### 6.2 写入与执行：Plan/Apply 双阶段

v1 不采用交互式确认，也不让模型在执行中扩大权限。

#### 阶段 A：Plan

`plan` 全程只读，输出：

- `change-plan.v1.json`；
- 人类可读补丁预览；
- 将触碰的相对路径；
- 每个原文件的 SHA-256；
- 文件编码和换行风格；
- 将运行的命令别名；
- 最大迭代、超时和输出预算；
- 风险与回滚策略；
- 整份计划文件的 SHA-256。

#### 阶段 B：Apply

用户以计划文件和计划哈希启动 `apply`。客户端必须：

1. 验证计划版本和 SHA-256；
2. 验证工作区身份和所有 base SHA-256；
3. 验证路径、权限、编码、文件大小和磁盘空间；
4. 一次性建立完整备份与变更日志；
5. 应用计划中已批准的确切变更；
6. 只运行计划列出的命令别名；
7. 验证文件哈希、测试结果和审计完整性；
8. 按计划决定保留变更或回滚；
9. 若需要新文件或新命令，停止并返回 `REPLAN_REQUIRED`，不得临时扩权。

这个模型牺牲少量自主性，换取可审查、可脚本化和可证明的安全边界。

## 7. Model Gateway 设计

### 7.1 信任边界

- 模型输出永远不可信；
- 服务端无权覆盖本地 Policy；
- 服务端不接收本地系统凭据；
- 模型厂商密钥只存在服务端；
- Win7 客户端只持有用户指定的网关凭据文件；
- 客户端只连接配置中唯一允许的 `scheme + host + port`；
- 禁止 HTTP 重定向、Cookie 和任意 URL 工具。

### 7.2 传输

推荐：

- `http.client.HTTPSConnection`；
- `ssl.SSLContext`；
- 用户显式指定的 CA bundle；
- `Content-Type: application/json; charset=utf-8`；
- 独立 connect/read/overall timeout；
- 请求与响应字节上限；
- 失败时禁止静默关闭证书校验。

HTTP 明文只能作为明确启用的受控内网降级模式，并必须输出高风险警告和审计事件。默认配置应拒绝明文。

### 7.3 协议 v1

请求最小字段：

```json
{
  "protocol_version": 1,
  "request_id": "uuid",
  "run_id": "uuid",
  "turn": 1,
  "messages": [],
  "tools": [],
  "capabilities": {},
  "limits": {
    "max_response_bytes": 8388608
  }
}
```

响应最小字段：

```json
{
  "protocol_version": 1,
  "request_id": "uuid",
  "server_trace_id": "opaque",
  "content": "",
  "tool_calls": [],
  "finish_reason": "STOP",
  "usage": {}
}
```

协议要求：

- 未知必填字段或不支持的版本直接拒绝；
- `request_id` 全链路一致；
- 客户端用当前 Phase 2 指纹模型验证 Replay；
- 同一 `request_id` 的重试必须幂等；
- v1 使用完整请求/响应，不做流式传输；
- 仅对尚未获得有效响应的幂等模型请求重试；
- 不把原始凭据、全量环境变量或无关文件内容放入请求。

### 7.4 数据最小化

- 只发送模型明确请求且本地 Policy 允许的相对路径和片段；
- 项目说明文件作为数据处理，不能提升本地权限；
- 默认拒绝 `.env`、私钥、证书私钥、凭据文件和用户配置目录；
- 每次出站记录相对路径、字节数和内容哈希，不在普通日志复制完整源码；
- Replay/EventStore 可能包含模型响应和源码片段，必须标记为敏感交付物。

## 8. 文件修改引擎

### 8.1 编码策略

标准库条件下不承诺概率式识别所有编码。采用确定性顺序：

1. BOM：UTF-8 BOM、UTF-16 LE/BE；
2. 严格 UTF-8；
3. 严格 GBK/CP936；
4. 仍不唯一或失败时返回 `ENCODING_AMBIGUOUS` / `ENCODING_UNSUPPORTED`；
5. 用户可通过项目配置显式指定编码。

每次写入必须保留原编码和 CRLF/LF 风格。含 NUL 的文件默认按二进制拒绝。

### 8.2 结构化变更

执行格式使用结构化变更，不让客户端解析模型生成的任意 Shell 或第三方 patch 命令。每项变更至少包含：

- 相对路径；
- 操作类型（v1：create/update；delete/rename 延后评审）；
- `base_sha256`；
- 编码；
- 换行风格；
- 有界的行范围或完整新内容；
- 预期结果 SHA-256。

人类预览可用标准库 `difflib.unified_diff` 生成，但执行以结构化数据为准。

### 8.3 写入事务

多文件系统无法提供真正的跨文件原子事务，因此采用可恢复日志：

1. 全部预检通过；
2. 把所有原始字节备份到用户指定的本地状态目录；
3. 在 SQLite 写 `PREPARED` 日志；
4. 每个文件在同目录创建临时文件、写入、flush/fsync、`os.replace`；
5. 写入后重新读取并校验 SHA-256；
6. 每步写事件；
7. 任何失败按逆序恢复已改文件；
8. 回滚失败时标记 `RECOVERY_REQUIRED`，禁止继续运行。

## 9. 受限命令执行

### 9.1 命令别名

模型不提交任意命令行，只能请求用户配置中有版本的命令别名，例如：

```json
{
  "schema_version": 1,
  "commands": {
    "unit_tests": {
      "argv": ["{python}", "-m", "unittest", "discover", "-s", "tests"],
      "cwd": "{workspace}",
      "timeout_s": 120,
      "max_stdout_bytes": 1048576,
      "max_stderr_bytes": 1048576
    }
  }
}
```

规则：

- 始终使用 argv 列表；
- `stdin` 关闭；
- 禁止 `shell=True`；
- 默认不允许参数追加；
- 需要参数时按字段、类型和允许值逐项校验；
- 环境变量采用最小允许清单；
- `.bat` 只能作为用户显式登记的命令别名，通过固定
  `cmd.exe /d /s /c <approved-bat-path>` 执行；
- 模型不得生成 `cmd /c` 字符串；
- 超时使用单一 monotonic deadline；
- 后台线程持续排水并按字节截断；
- 超时先 `taskkill /T /F`，失败降级 `Popen.kill()` 并留痕。

### 9.2 测试结果

结构化结果至少包含：

- 命令别名；
- 实际 argv 的安全摘要；
- cwd 相对工作区表示；
- 启动/结束时间和耗时；
- 退出码；
- timeout/tree-kill/truncated；
- stdout/stderr 保存字节数与 SHA-256；
- 有界文本摘要；
- 执行前 Policy 和计划批准证据。

## 10. 权限模型

| 权限 | 默认处理 | 授权边界 |
|---|---|---|
| `READ_ONLY` | 自动允许 | 工作区内、忽略敏感文件 |
| `WORKSPACE_WRITE` | 默认拒绝 | 仅经批准计划中的确切路径和 base hash |
| `PROCESS_EXECUTION` | 默认拒绝 | 仅经批准的命令别名和预算 |
| `GATEWAY_NETWORK` | 配置允许 | 唯一网关 endpoint |
| `EXTERNAL_WRITE` | 永久拒绝 | 不提供覆写开关 |
| `DESTRUCTIVE` | v1 永久拒绝 | 删除/重命名需未来 ADR |
| `ADMIN_OR_SYSTEM` | 永久拒绝 | 注册表、服务、提权、系统目录 |

`DENY` 是策略正常工作，不是 Runtime 崩溃。被拒绝的动作必须计入预算、写 `tool.denied`，并确保实现调用次数为 0。

## 11. 状态、审计与恢复

### 11.1 存储

所有耐久数据放在用户显式指定的本地 `--state-dir`，禁止放网络驱动器。建议布局：

```text
state/
  state.sqlite3
  runs/<run_id>/
    plan/
    backups/
    artifacts/
    logs/
```

工作区本身不创建隐藏状态目录，避免污染用户项目。

### 11.2 Schema 演进

Phase 2 `schema_version = 1` 保持可读。未来写入和审批需要新版本迁移，至少增加：

- plans；
- approvals；
- artifacts；
- change_journal；
- command_results。

迁移必须：

- 显式版本；
- 在副本上先验证；
- 失败不破坏旧库；
- 支持审计导出；
- 不在启动时静默做不可逆升级。

### 11.3 崩溃恢复

启动时若发现 `PREPARED` 或 `APPLYING` 变更：

1. 禁止开始新任务；
2. 验证备份清单和当前文件哈希；
3. 只提供 `recover` 或只读审计；
4. 恢复成功后写 `RECOVERED`；
5. 任何歧义要求人工处理，不猜测覆盖。

## 12. CLI 与配置

### 12.1 CLI

保留现有入口，并按阶段增加：

```text
python -m win7_agent.probe
python -m win7_agent.cli analyze
python -m win7_agent.cli plan
python -m win7_agent.cli apply
python -m win7_agent.cli recover
python -m win7_agent.cli audit-export
```

要求：

- 一次调用一个短命进程；
- 不使用交互式子进程；
- v1 不依赖控制台交互确认；
- stdout/stderr 仅 ASCII；
- 详细中文内容写 UTF-8 文件；
- 所有成功、失败、取消、配置和审批错误都有冻结退出码；
- `--help` 为 0，参数/配置错误不建立 Run。

### 12.2 配置

使用标准库可解析格式：

- `agent.ini`：endpoint、CA、timeout、state dir、credential path；
- `policy.json`：权限和敏感路径规则；
- `commands.json`：命令别名；
- `project.json`：显式编码和项目级验证命令。

全部带 `schema_version`，全部使用 UTF-8。凭据内容单独放在用户指定文件，不写入日志、SQLite、报告或示例。

## 13. 远程模型服务器职责

远程端技术栈不受 Win7 客户端限制，可使用现代 Linux、容器和任意语言。它负责：

- 模型厂商 API 适配；
- 模型凭据；
- 请求限流和重试；
- 上下文窗口与 token 管理；
- 把厂商响应规范化为协议 v1；
- `request_id` 幂等；
- 服务端审计和健康监控。

它不得：

- 直接访问 Win7 工作区；
- 伪造本地 Policy 允许；
- 要求客户端执行未声明工具；
- 要求客户端关闭 TLS 校验；
- 把厂商专有字段泄漏进本地核心契约。

## 14. 离线交付与升级

### 14.1 v1 交付假设

目标机已安装 CPython 3.8.10 x64。应用包不在运行期安装任何内容。

完整交付包建议包含：

```text
win7-coding-agent-<version>/
  src/
  scripts/
  config/
  docs/
  VERSION
  MANIFEST.sha256
  LICENSES/
```

排除：

- `.git`、IDE 状态、缓存和 pyc；
- 测试生成物；
- 真实凭据；
- 用户数据库和源码；
- 开发机虚拟环境。

### 14.2 首次运行

1. 解压到本地 NTFS 短路径；
2. 用 Python 标准库校验 `MANIFEST.sha256`；
3. 运行 Capability Probe；
4. 校验配置但不联网；
5. 在允许联网的 Phase 3 场景做网关 TLS 握手；
6. 先运行只读分析，再开放 Plan/Apply。

### 14.3 升级与回滚

- 版本目录并存，不做原地覆盖；
- 状态目录独立于程序目录；
- 升级前复制配置和状态库；
- Schema 迁移单独执行并生成备份；
- 失败时恢复旧程序目录和兼容的旧状态库；
- 禁止运行时自更新。

## 15. 分阶段交付路线

### Gate 2-W7：先完成当前 Win7 验收

目标：

- 核销 Phase 2 的十项 Win7 待验清单；
- 保持目标工作区只读；
- 形成 E1/E2 验收记录。

未通过前只能声明 `PROVISIONAL / NOT_PERFORMED`，不得宣称 Phase 2 完成。

### Phase 3：Model Gateway

交付：

- `GatewayProvider`；
- HTTPS + 显式 CA；
- 协议 v1；
- 认证、超时、上限、幂等；
- Mock HTTP server 和受控真实内网服务验证；
- 真实模型驱动的只读分析。

必须先评审 D-006 CA bundle。

### Phase 4：文件系统变更层

交付：

- 确定性编码识别；
- CRLF/LF 保持；
- 结构化 ChangeSet；
- 备份、原子写和回滚；
- 仍由 Mock/Replay 驱动，不接任意命令执行。

### Phase 5：生产级状态与审计

交付：

- Phase 2 EventStore 的兼容演进；
- 计划、批准、变更日志和 artifacts；
- 审计 JSON 导出；
- 崩溃恢复；
- 保留和清理策略。

### Phase 6：受限 Runner 与完整 Agent

按任务书里程碑顺序交付：

1. 通用但受限的 argv Runner；
2. 命令别名和测试验证；
3. Plan/Apply 批准；
4. 真实模型 + 读/写/执行闭环；
5. 失败回滚和二次规划。

### Phase 7：离线包装

交付：

- 可复现 zip；
- 哈希清单和自校验；
- CRLF `.bat` 启动器；
- 配置模板；
- 安装、升级、回滚和现场诊断手册；
- 断网 Win7 E1/E2 端到端验收。

## 16. 验收标准

### 16.1 功能验收

- [ ] 在 Win7 E1/E2 上完成只读分析并引用真实路径/行号。
- [ ] Gateway 只连接配置 endpoint；证书错误明确失败。
- [ ] Plan 阶段对工作区零写入、零命令执行。
- [ ] Apply 对计划哈希或 base hash 不匹配一律拒绝。
- [ ] 多文件变更中注入故障后，所有已写文件恢复原 SHA-256。
- [ ] 未批准路径、命令或权限的实现调用次数为 0。
- [ ] 测试命令超时后父/孙进程均终止或明确标记降级。
- [ ] Git 缺失时核心 Agent 可继续运行。
- [ ] 审计可重建每次模型、Policy、工具、变更、命令和回滚顺序。
- [ ] 复制交付包后无需联网安装即可运行。

### 16.2 质量门槛

- [ ] CPython 3.8.10 `compileall` 通过。
- [ ] 仅标准库 import。
- [ ] 零 `shell=True`、`os.system`、`os.popen`。
- [ ] 所有文本 I/O 显式编码。
- [ ] 控制台逐字节 ASCII。
- [ ] 中文、空格、`%`、`#`、盘符、反斜杠和长路径错误全部覆盖。
- [ ] 所有持久化和协议带版本。
- [ ] E1/E2 无未捕获异常、残留进程或未声明文件。
- [ ] 所有完成声明有 `docs/acceptance/` 证据和 SHA-256。

### 16.3 安全验收

- [ ] Win7 端不监听端口。
- [ ] 除网关外无其他网络目标。
- [ ] 明文 HTTP 默认拒绝。
- [ ] 证书校验不可静默关闭。
- [ ] 模型厂商密钥不进入 Win7。
- [ ] 凭据不进入日志、SQLite、JSON 或错误文本。
- [ ] 敏感文件默认拒绝读取和上传。
- [ ] 工作区外写入、注册表、管理员操作永久拒绝。

## 17. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| Win7/Python 3.8 EOL | 平台漏洞不可修复 | 最小网络面、短命进程、部署方风险确认 |
| CA 和 TLS 差异 | 无法连接网关 | 自带/企业 CA 文件、真实 Win7 握手验收、禁止绕过 |
| 编码误判 | 源码损坏 | 确定性识别、base hash、字节备份、歧义即拒绝 |
| 多文件非原子 | 半完成变更 | 预检、变更日志、逐项 hash、逆序回滚、恢复模式 |
| 子进程树残留 | 机器状态污染 | taskkill + kill 降级、活动进程登记、实机验证 |
| 模型越权 | 文件/命令风险 | 本地 Policy、计划哈希、命令别名、最小权限 |
| 源码/密钥泄漏 | 合规与安全风险 | 数据最小化、敏感路径拒绝、出站审计 |
| SQLite 无加密 | 审计内容可被本地读取 | 本地受控状态目录、最少内容、交付说明；不伪称加密 |
| 文档状态漂移 | 错误阶段判断 | 任务书作为唯一状态源，README 只同步摘要 |

## 18. 需要新增 ADR 的决策

进入实现前至少需要逐项裁决：

1. Gateway 协议 v1 和信任边界；
2. CA bundle、认证、明文降级和重试/幂等策略；
3. 确定性编码识别顺序；
4. ChangeSet、计划哈希和 Plan/Apply 批准模型；
5. 命令别名与通用 Runner 边界；
6. 写入事务、备份目录和恢复状态；
7. EventStore Schema 演进与迁移策略；
8. 敏感文件默认拒绝规则；
9. Phase 7 是否只交付应用，还是额外携带 Python 安装材料；
10. 最终退出码与新错误码。

## 19. 当前文档漂移

本次核对发现以下问题，但本提案不直接修改这些权威文档：

1. `README.md` 仍称 Phase 2 等待独立架构复审；实际任务书已记录
   `REVIEW_PASSED + PYTHON38_VALIDATED`，仅 Win7 待验。
2. `PROJECT_CHARTER.md` 仍把当前范围写为 Phase 0/1。
3. `ARCHITECTURE.md` 当前实现章节尚未纳入 Phase 2，且拓扑仍把 Gateway 标为阶段 5，
   与 ADR-0012 的阶段 3 冲突。
4. `PENDING_CONFIRMATIONS.md` 的 PC-002 仍称开发机无 Python 3.8.10，与 Phase 2 正式验证记录不一致。
5. `EVALUATION.md` 对 E2 是“阶段 1 至少一次”还是“每阶段强制”存在措辞不一致。

建议先用一个纯文档治理任务统一这些状态，再创建 Phase 3 任务书；任何修改已接受 ADR 正文的做法仍被禁止。

## 20. 默认假设

为避免阻塞设计，v1 采用以下默认值：

- 单用户、单工作区、单任务串行；
- CLI 是唯一正式产品入口；
- CPython 3.8.10 x64 已安装；
- 网关由部署方控制，模型厂商密钥不下发；
- 目标项目以文本源码为主；
- Git 是可选能力；
- 写入使用 Plan/Apply，两阶段之间允许人工查看文件；
- v1 不删除或重命名文件；
- 测试只通过预登记命令别名运行；
- 真实 Win7 E1/E2 是每个阶段完成的硬门槛。

若这些假设有变化，应先更新本提案并把关键变化写入 ADR，再进入实现。

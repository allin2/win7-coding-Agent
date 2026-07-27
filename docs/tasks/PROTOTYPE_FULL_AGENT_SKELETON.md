# PROTOTYPE — Full Agent Skeleton 架构原型任务书

> 实现前必读：`AGENTS.md` → `docs/WIN7_CONSTRAINTS.md` → 本文档 → `docs/DECISIONS.md`（ADR-0011、ADR-0023）。
> 本文档是原型线的完整设计与唯一实现授权。实现工程师**不需要也不允许**再做设计层面的决策；
> 发现设计缺陷时，回到本文档修订（经授权人批准）或记入 `docs/prototype/INTERFACE_RISKS.md`，
> 不得在代码里自行变通。

## 0. 授权与定位（ADR-0011 / ADR-0023）

### 0.1 状态块

```
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: ARCHITECTURE_PROTOTYPE
Target Branch: prototype/full-agent-skeleton
Base Phase: Phase 1 remains independent and unchanged
Phase-Gate: READY_FOR_PROTOTYPE_REVIEW
Review-Round: 1
Review-Status: REPAIR_REQUIRED
```

（2026-07-27 项目负责人批准建立独立原型线，见 ADR-0023。授权范围仅限本文档 §8 白名单路径，
且**仅在 `prototype/full-agent-skeleton` 分支上生效**；在 main 与其他分支上本授权无效。）

（2026-07-27 架构师审查轮 1：独立审查结论 `KEEP_READY_FOR_PROTOTYPE_REVIEW_AND_REPAIR`，
审查对象为实现终点 `31d1bda`。Phase-Gate 保持 `READY_FOR_PROTOTYPE_REVIEW` 不变，
**不标记 `PROTOTYPE_ACCEPTED`**；修复要求与门控见 §18，语义裁决见 ADR-0024。）

### 0.2 原型线定位（与 Phase 1 的关系）

- 本原型线与阶段主线（Phase 1 Capability Probe 修复/验收）**并行且相互独立**。
- 不替代 Phase 1；不改变 Phase 1 的 `Status`/`Phase-Gate`/验收标准/修复项。
- **禁止将本分支整体合并到 main**（任何形式的全量 merge / squash-merge / rebase 上 main 均属违例）。
- 只用于验证接口、模块边界和最小 Agent 闭环；后续正式阶段（Phase 2~6）只能**选择性吸收**
  原型设计或代码，吸收须经对应正式阶段任务书重新授权与审查（见 §16 原型代码处理规则）。
- 原型不是生产级 Win7 Agent，**不得宣称已完成任何正式阶段验收**（含 Win7 E1/E2 实机验收）。

### 0.3 Phase-Gate 状态机（原型专属）

```
APPROVED_FOR_IMPLEMENTATION
  → IMPLEMENTING                    （首个里程碑提交后由实现方更新）
  → READY_FOR_PROTOTYPE_REVIEW      （§14 完成标准全部自查通过后）
  → READY_FOR_PYTHON38_VALIDATION   （审查轮修复项全部关闭并复审确认，条件见 §18.5）
  → PROTOTYPE_ACCEPTED              （3.8.10 干净解释器验证档通过后由架构师裁决）
  或
  → PROTOTYPE_REJECTED              （架构师评审否决，附原因）
```

- 审查轮以状态块中的 `Review-Round`（第几轮）与 `Review-Status` 标注：
  `REPAIR_REQUIRED`（存在未关闭修复项）→ `REPAIR_VERIFIED`（架构师复审确认全部关闭）。
  审查轮期间 `Phase-Gate` 保持 `READY_FOR_PROTOTYPE_REVIEW`，不回退、不前进。
- `PROTOTYPE_ACCEPTED` **不代表**任何正式阶段通过，**不解除** Win7 E1/E2 硬门槛，
  **不允许**整体合并 main。
- `Phase-Gate` 与 `Review-Status` 行只能由架构师/授权人修改（`IMPLEMENTING` 一档除外）。

### 0.4 流程偏差追认（Review Round 1）

- 偏差事实：§0.3 规定 `Phase-Gate` 行只能由架构师/授权人修改（`IMPLEMENTING` 除外），
  但实现方在完成 §14 自查后自行将 Phase-Gate 更新为 `READY_FOR_PROTOTYPE_REVIEW`。
- 追认：架构师**书面追认**该次变更有效。本次追认只确认审查入口有效（审查轮 1 据此
  启动），**不改变规则本身**——此后任何 `Phase-Gate` / `Review-Status` 修改仍必须由
  架构师/授权人执行，实现方仅可设置 `IMPLEMENTING`。
- 本追认随本节进入版本控制，不构成后续同类偏差的先例。

## 1. 目标

构建一个完整但受约束的 Coding Agent 架构原型，使以下闭环能在 **MockProvider** 下纵向运行：

```
用户提交代码分析任务
→ 创建 Run
→ RunController 驱动状态机
→ ContextCompiler 生成模型请求
→ MockProvider 返回只读工具调用
→ PolicyEngine 判断权限
→ ToolRuntime 执行只读工具
→ 工具结果返回 MockProvider
→ MockProvider 生成最终分析
→ VerificationEngine 判断证据是否充分
→ Runtime 决定 COMPLETED 或 FAILED
→ EventStore 保存完整执行轨迹
→ CLI 输出最终结果和执行摘要
```

量化验证目标：

- G1 模块边界：§4 九个模块各自独立成包、可独立单测，模块间只经 §5 数据模型交互。
- G2 接口关系：全链路只使用厂商无关数据结构（§5），任何模块不 import 其他模块的私有实现。
- G3 状态控制：Run 状态只能由 Runtime 修改（§4.1），模型/工具/CLI 均无法直接设置状态。
- G4 工具权限：PolicyEngine 对全部非 READ_ONLY 请求显式 DENY（§4.4）。
- G5 工作区隔离：目标工作区全程只读，路径穿越/越界/链接逃逸全部被拒（§4.5、§6）。
- G6 事件持久化：EventStore 能完整还原一次 Run 的执行轨迹（§4.7）。
- G7 Mock 与 Replay 测试能力：MockProvider 闭环 + ReplayProvider 重放均可用（§4.2）。

## 2. 非目标（冻结清单，实现任何一项即验收否决）

- 文件修改（任何写工具）。
- apply_patch。
- 删除文件。
- 任意命令执行（通用 shell / run_command 类工具）。
- 编译和测试执行（不实现 build/test 工具）。
- 真实模型接入（OpenAI / Anthropic / 任何内外网真实推理服务）。
- 网络访问（含 DNS、localhost 连接）。
- MCP。
- Skill。
- Subagent。
- 多 Agent。
- 向量数据库。
- GUI。
- Git Worktree。
- 自动依赖安装。
- 生产级 Sandbox。
- 自动恢复（断点续跑/崩溃恢复）。
- 长期记忆。
- 与 Phase 1 合并（本分支不得整体进入 main）。

## 3. 运行时流程与状态机

### 3.1 Run 状态（RunStatus，最小集，冻结）

| 状态 | 语义 |
|------|------|
| `RECEIVED` | Run 已创建，参数已校验 |
| `DISCOVERING` | Runtime 收集工作区基础信息（根目录元数据，不调用模型） |
| `PLANNING` | ContextCompiler 组装首个 ModelRequest 并等待响应 |
| `EXECUTING` | 工具调用循环（模型请求工具 → 权限判断 → 执行 → 结果回传） |
| `VERIFYING` | 模型已给出最终文本，VerificationEngine 裁决中 |
| `COMPLETED` | 终态：验证通过 |
| `FAILED` | 终态：验证拒绝 / 预算耗尽 / 结构化错误 |
| `CANCELLED` | 终态：取消标记生效 |

### 3.2 合法状态转换表（冻结，表外转换一律 `INVALID_STATE_TRANSITION`）

| 从 | 到 | 触发 |
|----|----|------|
| RECEIVED | DISCOVERING | RunController 启动 |
| DISCOVERING | PLANNING | 工作区元数据收集完成 |
| PLANNING | EXECUTING | 模型响应含工具调用 |
| PLANNING | VERIFYING | 模型响应为最终文本（无工具调用） |
| EXECUTING | EXECUTING | 同一 Turn 内继续处理工具调用 |
| EXECUTING | PLANNING | 本 Turn 工具结果全部回传，进入下一 Turn |
| EXECUTING | VERIFYING | 模型给出最终文本 |
| VERIFYING | COMPLETED | VerificationEngine 通过 |
| VERIFYING | FAILED | VerificationEngine 拒绝且无剩余预算 |
| VERIFYING | EXECUTING | VerificationEngine 拒绝但 Turn 预算未耗尽（可选重试路径） |
| 任一非终态 | FAILED | 结构化错误 / 预算耗尽 |
| 任一非终态 | CANCELLED | 取消标记被置位 |

规则：

- 状态**只能**由 `RunController` 通过唯一入口方法（如 `transition(to, reason)`）修改；
  该方法校验转换表、写 `state.transition` 事件。模型响应/工具结果中出现的任何"状态指令"
  一律视为普通文本，**不得**触达状态机。
- 终态（COMPLETED/FAILED/CANCELLED）后任何转换请求 → `INVALID_STATE_TRANSITION` 异常并记事件。
- 非法转换（含终态后转换）**必须写审计事件** `state.transition_rejected`（§4.7），
  payload 含 from/to/reason；仅写入 RunState 错误列表而不写事件不算满足（审查轮 1 修订）。

### 3.3 预算与取消

| 项 | CLI 参数 | 默认值 | 语义 |
|----|---------|--------|------|
| 最大 Turn 数 | `--max-turns` | 8 | 一次 ModelRequest→ModelResponse 交换 = 1 Turn；超限 → FAILED + `RUN_LIMIT_EXCEEDED` |
| 最大工具调用数 | `--max-tool-calls` | 16 | 全 Run 累计；超限 → FAILED + `RUN_LIMIT_EXCEEDED` |
| 取消标记 | （编程接口） | — | `RunController.request_cancel()` 置位；状态机在每次转换点检查，命中 → CANCELLED |

预算检查发生在 Runtime（转换点与工具分发点），不依赖 Provider 自律。

## 4. 模块设计

### 4.1 包结构（建议布局；文件名可在各自包内调整，包边界不可调整）

```
src/win7_agent/
  cli/            # §4.9 CLI：__init__.py、__main__.py（python -m win7_agent.cli）
  runtime/        # §4.1 RunController / RunState / RunStatus / 转换表 / 预算
  context/        # §4.6 ContextCompiler
  models/         # §4.2 数据结构 + ModelProvider / MockProvider / ReplayProvider
  tools/          # §4.3 ToolSpec / ToolRegistry / 六个只读工具 / 私有子进程辅助
  policy/         # §4.4 PermissionType / PolicyEngine / PolicyDecision
  workspace/      # §4.5 WorkspaceContext / ShadowWorkspace 接口
  verification/   # §4.8 VerificationRule / VerificationEngine / 内置规则
  storage/        # §4.7 EventStore（SQLite）
```

- `src/win7_agent/__init__.py` **不在白名单内，不得修改**（其内容由 Phase 1 授权限定）。
- 模块依赖方向（只允许自上而下）：`cli → runtime → {context, models, tools, policy,
  verification, storage}`；`tools → workspace`；`context → workspace`。禁止反向依赖、
  禁止循环依赖。
- 每个包的 `__init__.py` 只允许导出公共符号，不得含业务逻辑。

#### Runtime（`runtime/`）必须实现

- `RunController`：创建 Run、驱动状态机、分发工具调用、检查预算与取消标记、
  处理完成/失败/取消（终态处理必须写 `run.final` 事件并回传 CLI）。
- `RunState`：run_id、当前状态、turn 计数、工具调用计数、取消标记、错误列表（只读快照对外）。
- `RunStatus`：§3.1 八状态常量（字符串常量或 `enum.Enum`，3.8 兼容）。
- 状态转换规则：§3.2 表驱动实现，非法转换抛结构化异常。

### 4.2 Model abstraction（`models/`）

厂商无关数据结构（§5.1）+ Provider 抽象：

- `ModelProvider`：抽象接口，唯一方法形如 `generate(request: ModelRequest) -> ModelResponse`。
- `MockProvider`：确定性脚本化 Provider，按 Turn 序号返回预设响应（§10 演示脚本）。
  必须无随机性：同一输入序列产生同一输出序列。
- `ReplayProvider`：从先前 Run 的事件库（`--replay` 指定路径）重放录制的响应。
  一致性语义由 ADR-0024 裁决，全部强制：
  - **只读打开**：必须以 SQLite URI `file:<path>?mode=ro`（`uri=True`）打开事件库；
    路径不存在时**不得创建文件**，直接报错。
  - **初始化错误归类**：Schema 缺失/不匹配、Run 不存在、录制序列破损等加载期错误
    一律转 `ProviderError`，由 CLI 捕获并以退出码 3 结束（不创建 Run，不写任何事件库）。
  - **请求指纹**：录制时每个 `model.request` 事件必须保存请求的**规范化 SHA-256 指纹**
    （`request_fingerprint` 字段：对消息序列 role/content/tool_call_id、工具名清单、turn
    的确定性 JSON 序列化——`sort_keys=True`、`ensure_ascii=True`、紧凑分隔符——取
    `hashlib.sha256` 十六进制摘要）。
  - **严格重放验证**：重放时逐 Turn 验证 ① turn 序号一致；② 当前请求指纹与录制指纹一致；
    ③ 请求与响应严格配对（每个 `model.request` 对应恰好一个 `model.response`，顺序一致）。
    请求不一致、响应缺失、顺序错乱、录制耗尽均 → 结构化错误 `REPLAY_MISMATCH`，
    Run 进入 FAILED（CLI 退出码 1）。
  - **威胁模型声明**：指纹机制只防意外不一致（工作区变化、代码漏洞、手误篡改），
    **不承诺抵抗攻击者协调修改数据库与指纹**；此声明必须同步写入
    `docs/prototype/INTERFACE_RISKS.md`。
- **禁止**接入真实 OpenAI、Anthropic 或其他模型 API；`models/` 包内不得 import
  `socket`/`http.client`/`urllib`/`ssl`。

### 4.3 Tool Runtime（`tools/`）

必须实现：

- `ToolSpec`：工具名、描述、参数 schema（名称/类型/必填，纯 Python 字典描述即可）、
  所需权限类型（§4.4）。
- `ToolRegistry`：注册/查询 ToolSpec 与实现函数；未注册工具 → `TOOL_NOT_FOUND`。
- `ToolRequest` / `ToolResult`：§5.2。
- 参数验证：按 ToolSpec 校验缺参/多参/类型错误 → `INVALID_TOOL_ARGUMENT`，不执行工具。
  **类型校验必须拒绝 `bool` 充当 `int` 参数**（Python 中 `isinstance(True, int)` 为真，
  需先行排除 bool；审查轮 1 修订）。
- 输出截断：见下表上限；截断时 `ToolResult.truncated = true` 并保留前缀。
- 结构化错误：工具内部异常一律转 `ToolResult(status="error", error={code, message, ...})`，
  禁止异常穿透到 Runtime。

只读工具清单（冻结，共 6 个；实现其他工具即验收否决）：

| 工具 | 参数 | 行为 | 上限 |
|------|------|------|------|
| `list_directory` | `path`（工作区相对路径，默认根） | 列出条目名/类型/大小，应用忽略目录配置 | 最多 2000 条目 |
| `read_file` | `path`, `encoding`（默认 `utf-8`，错误策略 `replace`） | 读全文 | 256 KiB（262144 字节），超限截断 |
| `read_file_range` | `path`, `start_line`, `end_line`, `encoding` | 读行区间（1 起始，含端点），结果带行号 | 单次最多 500 行 |
| `search_text` | `pattern`（字面量子串，不做正则）, `path`（可选子目录）, `max_matches`（默认 200，上限 500） | 逐文件逐行搜索，跳过忽略目录与判定为二进制的文件（含 `\x00` 即二进制） | 每匹配行截断 500 字符；另见下方扫描预算 |
| `git_status` | 无 | `git status --porcelain`（argv 列表） | stdout 1 MiB |
| `git_diff` | `path`（可选） | `git diff -- <path>`（argv 列表） | stdout 1 MiB |

`search_text` 扫描预算（审查轮 1 新增，防大工作区无界扫描）：

- 最多扫描 2000 个文件；
- 单文件最多读取 1 MiB（超出部分不扫描）；
- 结果总输出上限 256 KiB；
- 触及任一上限 → 停止扫描，`truncated = true`，已有匹配正常返回。

Git 工具强制行为：

- **argv 列表 + `subprocess`，禁止 `shell=True`**，`stdin=subprocess.DEVNULL`，
  `cwd=工作区根`，超时默认 10 秒，超时后 `kill()` 并回收，结果记 `TOOL_TIMEOUT`。
  `kill()` 后的二次 `wait()` 必须捕获 `subprocess.TimeoutExpired`（不得向调用方穿透）；
  stdout/stderr 管道在 `finally` 中显式关闭（审查轮 1 修订）。
- `shutil.which("git")` 找不到 git → `ToolResult(status="error", code="GIT_UNAVAILABLE")`，
  **降级而非崩溃**（AGENTS.md C13）。
- 子进程输出读取必须防管道死锁（达到上限后继续读取并丢弃）。
- `tools/` 包内实现一个**私有**子进程辅助函数（超时 + 输出上限 + 强制终止 + DEVNULL stdin）。
  **边界声明**：该辅助是原型私有实现，不是阶段 2 通用 Runner 的接口承诺；此点必须写入
  `docs/prototype/INTERFACE_RISKS.md`。

所有路径参数在执行前必须经 `workspace/` 边界检查（§4.5）；拒绝结果作为结构化错误返回。

### 4.4 Policy Engine（`policy/`）

权限类型（冻结枚举）：

- `READ_ONLY`
- `WORKSPACE_WRITE`
- `PROCESS_EXECUTION`
- `EXTERNAL_WRITE`
- `DESTRUCTIVE`

当前原型策略（冻结）：

- `READ_ONLY` → 可以 `ALLOW`。
- 其余四类 → **必须显式 `DENY`**，`PolicyDecision` 带拒绝理由与所请求权限。
- **不得用"未实现异常"（NotImplementedError 等）替代权限拒绝**——DENY 是一等决策结果，
  必须写 `policy.decision` 事件。
- 注意：`git_status`/`git_diff` 虽启动子进程，但其 ToolSpec 声明的权限为 `READ_ONLY`
  （只读语义由工具白名单 + argv 固定保证）；`PROCESS_EXECUTION` 权限类保留给未来的
  通用命令执行，本原型内任何请求它的工具都不存在，若出现即 DENY。

每次工具调用的顺序固定：`ToolRequest → PolicyEngine.evaluate → (ALLOW) → ToolRuntime 执行`；
DENY 时工具**不执行**，DENY 结果以 `ToolResultMessage` 形式回传 Provider 并记事件。

DENY 语义（ADR-0024 裁决，审查轮 1 修订）：

- DENY 表示**安全策略成功拦截**，是系统正常工作的证据，**不是 policy violation**。
- DENY 后工具实现**绝对不能执行**（实现函数调用次数必须为 0，测试可验）。
- 事件使用 `tool.denied`（§4.7），**不使用正常 `tool.result` 表示执行**；
  `tool.result` 仅保留给真实执行过的工具。
- 拒绝结果可以作为结构化观察（`ToolResultMessage`，`error.code = PERMISSION_DENIED`）
  返回模型；Run **可以继续**，寻求只读替代方案，DENY 本身不强制 Run 失败。
- Verification 层的 `NoPolicyViolationRule` 只拒绝“没有匹配 ALLOW 却实际执行”的情况（§4.8）。
- **未注册工具**：Runtime 分发时发现工具未注册 → 直接以 `TOOL_NOT_FOUND` 回传，
  **不得为其产生 ALLOW `policy.decision`**（不得默认按 READ_ONLY 评估；审查轮 1 修订）。

### 4.5 Workspace（`workspace/`）

必须实现 `WorkspaceContext`：

- 构造：工作区根（CLI `--workspace`），构造时 `os.path.realpath` 规范化并校验存在。
- 路径规范化：相对路径相对工作区根解析；统一处理 `/`、`\`、盘符、大小写
  （Windows 上比较前 `os.path.normcase`）。
- 边界检查 `resolve(path) -> 绝对路径 | 结构化拒绝`：
  - `..` 穿越出根 → `PATH_TRAVERSAL_DENIED`。
  - 工作区外绝对路径 → `PATH_OUTSIDE_WORKSPACE`。
  - **符号链接 / Junction 逃逸的保守处理**：对目标做 `os.path.realpath`，realpath 结果
    不在根的 realpath 之下 → 拒绝（`PATH_OUTSIDE_WORKSPACE`）。无法判定时保守拒绝。
- 忽略目录配置：默认 `[".git", "__pycache__", ".svn", "node_modules"]`，构造参数可覆盖；
  `list_directory`/`search_text` 必须应用。
- 只读模式：`WorkspaceContext.read_only` 恒为 `True`；不提供任何写 API。
- 兼容中文路径、空格路径、中文+空格混合路径（§12 测试矩阵覆盖）。

`ShadowWorkspace`：只允许定义接口（抽象类：`prepare()` / `apply()` / `discard()` 签名与
文档字符串），**不得实现**真实文件复制、修改或合并；不得被 Runtime 实例化。接口存在的唯一
目的是验证未来写路径的模块边界形状，此点记入 `docs/prototype/FULL_AGENT_SKELETON.md`。

### 4.6 Context Compiler（`context/`）

输入（全部显式传参，不读全局状态）：

- 用户任务文本。
- 项目指令：目标工作区根下 `AGENTS.md` 若存在则读取，**使用字节预算**：以二进制读取
  前 4096 字节后以 UTF-8 `errors="replace"` 解码（避免文本模式 `read(4096)` 读 4096 个
  字符导致多字节字符下超预算；审查轮 1 修订）；不存在则空。
- 当前 Run 状态快照（状态、turn 计数、剩余预算）。
- 最近工具结果：最多最近 5 条，每条内容截断 8 KiB。
- 当前预算（剩余 Turn / 剩余工具调用数，写入 system 内容供模型知晓）。

输出：`ModelRequest`（§5.1）。

规则：

- **不得把整个项目内容一次性放入上下文**——只允许放入工具结果已返回的片段。
- 组装逻辑必须是纯函数式（同输入同输出），便于 Replay 与单测。

### 4.7 EventStore（`storage/`，标准库 `sqlite3`）

Schema（`schema_version = 1`，版本号必须写入 meta 表）：

```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- 必写行：('schema_version','1'), ('prototype_version','0.1.0'), ('created_at', ISO8601)
CREATE TABLE runs (
  run_id         TEXT PRIMARY KEY,
  created_at     TEXT NOT NULL,          -- ISO8601 带本地时区偏移
  workspace_path TEXT NOT NULL,
  task_text      TEXT NOT NULL,          -- 截断 16 KiB
  final_status   TEXT                    -- COMPLETED/FAILED/CANCELLED，运行中为 NULL
);
CREATE TABLE events (
  run_id     TEXT    NOT NULL,
  seq        INTEGER NOT NULL,           -- 同一 Run 内从 1 起严格递增，EventStore 内部分配
  ts         TEXT    NOT NULL,
  event_type TEXT    NOT NULL,
  payload    TEXT    NOT NULL,           -- JSON（ensure_ascii=False），字段级截断见下
  PRIMARY KEY (run_id, seq)
);
```

事件类型（冻结；`tool.denied` 与 `state.transition_rejected` 为审查轮 1 经 ADR-0024 新增）：

| event_type | 触发点 | payload 要点 |
|------------|--------|--------------|
| `run.created` | Run 创建 | 参数快照（workspace、task、预算、provider 类型） |
| `state.transition` | 每次状态转换 | from/to/reason/turn |
| `state.transition_rejected` | 非法转换请求被拒（含终态后） | from/to/reason；状态不变 |
| `model.request` | 发出 ModelRequest | **元数据**：turn、消息条数、各角色字符数、工具声明数、`request_fingerprint`（§4.2，不存全文） |
| `model.response` | 收到 ModelResponse | 元数据 + 内容（截断）+ tool_calls + finish_reason + usage |
| `tool.requested` | Provider 请求工具 | tool_call_id、工具名、参数 |
| `policy.decision` | PolicyEngine 裁决 | ALLOW/DENY、权限类型、理由 |
| `tool.denied` | DENY 后回传拒绝观察 | tool_call_id、工具名、权限类型、理由；**不代表执行** |
| `tool.result` | 工具**真实执行**完成 | status、内容（截断）、truncated、error |
| `verification.result` | 验证引擎裁决 | 各规则结果、CompletionDecision |
| `run.final` | 终态 | 最终状态、最终分析文本（截断）、统计 |

强制要求：

- 有 Schema 版本（meta 表）；打开已有库时校验 `schema_version`，不匹配 → `EVENT_STORE_FAILED`。
- 稳定事件序号：`seq` 由 EventStore 在单连接内分配，同一 Run 内严格递增无空洞。
- 保持同一 Run 内事件顺序：读取接口按 `(run_id, seq)` 排序返回。
- 限制长度：payload 中任何消息/工具输出文本字段截断至 64 KiB，截断处记
  `"...[TRUNCATED_FOR_STORAGE]"` 后缀与 `payload_truncated: true`。
- **不保存凭据**：不写入环境变量全量、不写入任何形如 token/key/password 的配置值；
  `model.request` 只存元数据不存消息全文（消息全文可由 Replay 从响应+工具结果重建，
  原型不要求逐字重建请求）。
- 能够读取并重建一次 Run 的执行轨迹：提供 `load_run(run_id) -> (run 行, 事件有序列表)`
  与轨迹摘要函数（供 CLI `--replay` 与测试使用）。
- `sqlite3.connect(path, timeout=5.0)`；写入用显式事务；连接关闭走 `try/finally`。
- 初始化（建表/Schema 校验）失败时必须关闭已建立的连接后再抛 `EVENT_STORE_FAILED`，
  不得泄漏连接（审查轮 1 修订）。
- 存储故障下的事件完整性声明：EventStore 写入中途失败时，**数据库可能只保留完整事件
  的前缀**（已提交事件逐条事务化，不会出现半条事件，但后续事件与 `run.final`/
  `final_status` 可能缺失）；消费方不得假定每个 Run 行都有 `final_status`（§7）。

### 4.8 Verification（`verification/`）

数据结构：

- `VerificationRule`：抽象接口 `evaluate(run_snapshot, event_trace, final_text) -> VerificationResult`。
- `VerificationResult`：rule_id、passed（bool）、reasons（列表）。
- `CompletionDecision`：`COMPLETE` 或 `REJECT` + 汇总 reasons。

内置规则（冻结）：

- `RequiredEvidenceRule`：最终分析文本必须引用**至少一个**本 Run 内真实执行过
  `read_file`/`read_file_range` 的文件路径，且包含行号引用；否则 REJECT
  （"模型返回最终文本 ≠ 任务完成"的落地点）。
- `NoPolicyViolationRule`（语义由 ADR-0024 裁决，审查轮 1 修订）：**只拒绝“没有匹配
  ALLOW 决策却实际执行”的情况**，即：存在 `tool.result`（真实执行痕迹）而无同
  tool_call_id 的先行 ALLOW `policy.decision`，或同一 tool_call_id 在 DENY 后仍出现
  `tool.result` → REJECT。`tool.denied` 事件是拦截成功的证据，**不构成违规**，
  不得因存在 DENY/`tool.denied` 而 REJECT。

引擎：`VerificationEngine`（或等价 `MockVerifier`）串行执行全部规则，任一 REJECT 则
`CompletionDecision = REJECT`。**只有 VerificationEngine 通过后，RunController 才能设置
COMPLETED**；REJECT 且无剩余预算 → FAILED + `VERIFICATION_REJECTED`。

### 4.9 CLI（`cli/`）

```
python -m win7_agent.cli analyze --workspace PATH --task TEXT
                                 [--max-turns N] [--max-tool-calls N]
                                 [--event-db PATH] [--replay PATH]
```

| 参数 | 默认 | 说明 |
|------|------|------|
| `--workspace PATH` | 必填 | 目标工作区根（只读） |
| `--task TEXT` | 必填 | 用户任务文本 |
| `--max-turns N` | 8 | §3.3 |
| `--max-tool-calls N` | 16 | §3.3 |
| `--event-db PATH` | 见 §6 | 事件库路径；未指定时写入系统临时目录下本次运行目录 |
| `--replay PATH` | — | 指定先前事件库，改用 ReplayProvider 重放 |

规则：

- 默认使用 MockProvider；**不存在任何接入真实模型的参数或代码路径**。
- `argparse` 解析（不用 3.9+ 特性）；`--help` 退出码 0；参数错误退出码 3。
  **必须使用自定义 `ArgumentParser` 子类覆盖 `error()`**，使缺参/非法值等参数错误
  返回 3（argparse 默认 `error()` 退出码为 2，与 CANCELLED 冲突；审查轮 1 修订）；
  `--max-turns` / `--max-tool-calls` 小于 1（含 0）同属参数错误 → 3。
- 退出码（ADR-0024 裁决，冻结）：`0` = COMPLETED；`1` = Run 失败（FAILED，含运行期
  `REPLAY_MISMATCH`/`EVENT_STORE_FAILED` 等导致的失败）；`2` = Run 取消（CANCELLED）；
  `3` = 参数、配置、Replay 初始化（`ProviderError`）及 CLI 基础设施错误
  （WorkspaceError、事件库无法创建等 Run 尚未启动的错误）。
- 控制台输出 ASCII-only（ADR-0006 沿用）：**按 EventStore 事件顺序输出逐事件 ASCII
  摘要行**（每事件一行：`seq`、`event_type` 与关键元数据，如状态 from/to、工具名、
  裁决结果），然后输出最终
  `RESULT status=... turns=N tool_calls=N event_db=<ascii 转义路径>`；
  摘要行**不得输出完整模型内容或文件内容**（审查轮 1 修订）；
  含非 ASCII 的内容（中文路径等）以 backslashreplace 转义显示，完整信息在事件库中。
- `--event-db` 指向目标工作区内部时：允许（用户显式指定，§6），但必须在控制台
  输出一行 ASCII 提示（如 `NOTE event-db is inside the target workspace`），避免
  事件库污染工作区快照而用户无感知（审查轮 1 修订）。

## 5. 数据模型（冻结；全部厂商无关，允许 `dataclasses`，类型标注用 `typing.List` 等 3.8 形式）

### 5.1 模型侧

| 结构 | 必备字段 |
|------|----------|
| `Message` | `role`（`"system" | "user" | "assistant" | "tool"`）、`content: str`、`tool_call_id`（tool 角色时必填） |
| `ModelRequest` | `messages: List[Message]`、`tools: List[ToolSpec 摘要]`、`turn: int`、`budget: {remaining_turns, remaining_tool_calls}` |
| `ModelResponse` | `content: str`（可空）、`tool_calls: List[ToolCall]`、`finish_reason: FinishReason`、`usage: Usage` |
| `ToolCall` | `tool_call_id: str`、`tool_name: str`、`arguments: dict` |
| `ToolResultMessage` | `tool_call_id`、`status`、`content: str`（截断后）、`truncated: bool`、`error`（可空） |
| `Usage` | `prompt_chars: int`、`completion_chars: int`（原型以字符数代替 token 数） |
| `FinishReason` | 枚举：`STOP`（最终文本）、`TOOL_CALLS`、`ERROR` |

### 5.2 工具侧

| 结构 | 必备字段 |
|------|----------|
| `ToolSpec` | `name`、`description`、`parameters`（参数名 → {type, required}）、`permission: PermissionType` |
| `ToolRequest` | `tool_call_id`、`tool_name`、`arguments`、`run_id` |
| `ToolResult` | `tool_call_id`、`status`（`"ok" | "error"`）、`content: str`、`truncated: bool`、`error`（§7 错误对象，可空）、`duration_ms: int` |

### 5.3 决策与验证侧

| 结构 | 必备字段 |
|------|----------|
| `PolicyDecision` | `decision`（`"ALLOW" | "DENY"`）、`permission: PermissionType`、`reason: str` |
| `VerificationResult` | `rule_id`、`passed: bool`、`reasons: List[str]` |
| `CompletionDecision` | `decision`（`"COMPLETE" | "REJECT"`）、`reasons: List[str]` |

所有可持久化结构必须提供 `to_dict()`（JSON 可序列化）；含版本演进可能的持久化格式
（事件库）已由 `schema_version` 覆盖。

## 6. 权限与运行时边界

必须区分两层，不得混淆：

**A. Codex 开发时**（修改本仓库原型源码）：受 §8 白名单与 §9 禁止路径约束。

**B. 原型 Agent 运行时**（`analyze` 命令操作目标工作区）：

- 目标代码工作区必须**只读**；不得修改目标项目文件；不得删除文件。
- 不得执行任意命令（唯一子进程是白名单内的 `git status --porcelain` / `git diff`，
  argv 固定）。
- 不得安装依赖；不得访问网络；不得调用真实外部模型。
- 只允许读取目标工作区内文件（经 §4.5 边界检查）。
- EventStore 只允许写入用户显式指定的 `--event-db` 路径。
- 临时运行数据只允许写入系统临时目录（`tempfile`）或用户显式指定的运行目录；
  未指定 `--event-db` 时，事件库落在系统临时目录下本次运行专属目录
  （前缀 `w7a_proto_`），路径打印给用户。
- **不得将 EventStore 写入目标代码工作区**，除非用户以 `--event-db` 明确指定该路径。

测试自证：§12 P07 要求端到端跑完后对目标工作区做前后快照比对（文件清单 + mtime + 大小），
必须零变化。

## 7. 错误处理原则与错误码

- 结构化错误对象（对齐 Phase 1 风格）：`{code, message, exception_type?, traceback_tail?}`。
- 禁止静默吞异常：捕获后必须转结构化错误并写事件（AGENTS.md §7）。
- 工具异常止于 `ToolResult`；Provider 异常止于 Runtime（Run → FAILED）；
  EventStore 写入失败 → 尽力在 stderr 打一行 ASCII 错误，Run → FAILED + `EVENT_STORE_FAILED`。
- EventStore 故障处理细则（审查轮 1 修订）：
  - Runtime 必须**单独捕获 `EventStoreError`**（不得落入 `UNEXPECTED` 兜底），
    RunResult 错误列表中的错误码必须为 `EVENT_STORE_FAILED`。
  - 存储已故障时，终态处理的 `run.final` 写入与 `finalize_run` 均为 **best-effort**：
    二次失败必须被捕获，**不得覆盖原始错误、不得向控制台输出 traceback**，
    RunResult 仍正常返回（错误列表保留首次失败）。
  - 文档约定：存储故障时数据库可能只保留完整事件的前缀（§4.7）。
- 禁止 `except: pass`；traceback 全文不上控制台（只留 `traceback_tail` 末 5 行进事件库）。

错误码枚举（冻结，新增须修订本文档）：

| code | 含义 |
|------|------|
| `INVALID_TOOL_ARGUMENT` | 工具参数缺失/多余/类型错误 |
| `TOOL_NOT_FOUND` | 请求了未注册工具 |
| `TOOL_TIMEOUT` | 工具（git 子进程）超时 |
| `GIT_UNAVAILABLE` | git 不存在（降级） |
| `SUBPROC_SPAWN_FAILED` | git 子进程无法启动 |
| `FILE_NOT_FOUND` | 目标文件/目录不存在 |
| `FILE_TOO_LARGE` | 超出读取上限且无法截断语义（一般用截断而非本码） |
| `NOT_A_TEXT_FILE` | search/read 命中二进制判定 |
| `PATH_TRAVERSAL_DENIED` | `..` 穿越出工作区 |
| `PATH_OUTSIDE_WORKSPACE` | 工作区外绝对路径 / 链接逃逸 |
| `PERMISSION_DENIED` | PolicyEngine DENY |
| `RUN_LIMIT_EXCEEDED` | Turn / 工具调用预算耗尽 |
| `INVALID_STATE_TRANSITION` | 非法状态转换请求 |
| `REPLAY_MISMATCH` | Replay 序列与当前请求不匹配 |
| `EVENT_STORE_FAILED` | 事件库创建/写入/Schema 校验失败 |
| `VERIFICATION_REJECTED` | 验证引擎拒绝且预算耗尽 |
| `CANCELLED` | 取消标记生效 |
| `UNEXPECTED` | 未预期异常（兜底） |

## 8. 实现路径白名单（Allowed implementation paths）

### 8.1 实现代码

- `src/win7_agent/cli/**`
- `src/win7_agent/runtime/**`
- `src/win7_agent/context/**`
- `src/win7_agent/models/**`
- `src/win7_agent/tools/**`
- `src/win7_agent/policy/**`
- `src/win7_agent/workspace/**`
- `src/win7_agent/verification/**`
- `src/win7_agent/storage/**`

### 8.2 测试代码

- `tests/unit/runtime/**`
- `tests/unit/context/**`
- `tests/unit/models/**`
- `tests/unit/tools/**`
- `tests/unit/policy/**`
- `tests/unit/workspace/**`
- `tests/unit/verification/**`
- `tests/unit/storage/**`
- `tests/unit/cli/**`
- `tests/integration/prototype/**`
- `tests/fixtures/sample_project/**`

### 8.3 原型文档和演示脚本

- `docs/prototype/**`
- `docs/tasks/PROTOTYPE_FULL_AGENT_SKELETON.md`（本文件，修订须经授权人批准）
- `scripts/run_prototype_demo.bat`（≤5 行，CRLF——已有 `.gitattributes` 的 `*.bat` 规则覆盖，无需改动该文件）
- `scripts/run_prototype_tests.py`（统一测试入口，审查轮 1 新增授权，规格见 §18.4）
- `scripts/run_prototype_tests.bat`（CRLF，调用上述 Python 脚本，审查轮 1 新增授权）
- `README.md`（**仅允许追加**原型运行说明章节，且该章节必须以 `Prototype` 明确标记，
  不得改动既有内容与 Phase 1 状态描述）

### 8.4 白名单规则

- 实现文件只能出现在上述路径内；白名单外出现实现文件即验收打回（AGENTS.md C14 / ADR-0011）。
- 本白名单**仅在 `prototype/full-agent-skeleton` 分支上有效**。
- 禁止以任何"临时豁免"方式扩大白名单；需要新路径时先修订本文档并经授权人批准。
- `docs/DECISIONS.md` 的 ADR 新增仍按 AGENTS.md 文档规则执行，不占用本白名单。

## 9. 明确禁止修改路径（Forbidden paths，触碰即验收打回）

- `src/win7_agent/probe/**`
- `src/win7_agent/__init__.py`（内容由 Phase 1 授权限定）
- `tests/unit/probe/**`
- `tests/integration/probe/**`
- `tests/win7/**`
- `docs/tasks/PHASE_01_CAPABILITY_PROBE.md`
- Phase 1 已冻结（Accepted）的 ADR 正文（ADR-0001 ~ ADR-0022；只能新增 ADR，不得改写）
- Capability Probe 的 JSON Schema（PHASE_01 §6）
- Capability Probe 的退出码约定（ADR-0010）与阶段状态（Status / Phase-Gate 行）
- `scripts/run_probe.bat`、`scripts/run_tests.bat`、`.gitattributes`
- **main 分支**（本任务一切提交只落在 `prototype/full-agent-skeleton`）

若原型实现过程中发现 Phase 1 接口存在问题（命名、数据结构、错误码等任何层面），
**只能**记录在 `docs/prototype/INTERFACE_RISKS.md`，不得直接修改 Phase 1 任何产物。

## 10. 演示流程（端到端脚本，MockProvider 剧本冻结）

在 `tests/fixtures/sample_project/` 创建最小示例项目，至少包含：

- 一个含目标函数的 Python 源文件（若干行，函数名固定，供剧本搜索）。
- 一个子目录与一个非目标文件（验证 list/search 的过滤与选择）。
- 一个中文名文件与一个含空格的目录（供 §12 P20 复用）。

MockProvider 剧本（按 Turn 顺序，必须完成）：

1. Turn 1：请求 `list_directory`（根目录）。
2. Turn 2：请求 `search_text` 搜索目标函数名。
3. Turn 3：请求 `read_file_range` 读取命中文件的相关行区间。
4. Turn 4：返回最终分析（`finish_reason=STOP`），**内容必须包含真实文件路径和行号**。
5. VerificationEngine 验证存在必要证据（RequiredEvidenceRule + NoPolicyViolationRule 均通过）。
6. RunController 设置 COMPLETED。
7. EventStore 可以还原完整事件轨迹（`load_run` 重建后与运行时记录一致）。

`scripts/run_prototype_demo.bat`：对 `tests/fixtures/sample_project` 执行一次
`python -m win7_agent.cli analyze ...` 演示（≤5 行，CRLF，无 cmd 高级特性）。

## 11. 技术约束（全部继承自 AGENTS.md / WIN7_CONSTRAINTS，违例即打回）

- 兼容 CPython 3.8.10；`python -m compileall -q src tests` 零错误为最低门槛。
- 只能使用 Python 标准库；禁止第三方库 import（含 vendoring）。
- 禁止 Python 3.9+ 语法和 API（`match`、`dict |=`、`str.removeprefix/removesuffix`、
  `list[str]` 内置泛型标注、`zoneinfo`、`graphlib`、`functools.cache` 等，
  完整清单见 WIN7_CONSTRAINTS §3）。
- 禁止 Node.js、Electron、Docker、WSL。
- 禁止 `shell=True`、`os.system`、`os.popen`、`subprocess.getoutput`。
- 禁止运行时下载依赖；原型代码内禁止任何网络 API 调用。
- 所有 subprocess 必须有超时和输出限制，`stdin` 关闭/重定向。
- 所有文本读写显式指定编码（`open(` 无 encoding 即打回，二进制模式除外）。
- 所有路径逻辑兼容 Windows、中文和空格路径。
- 不得要求 PowerShell；不得使用 Windows 10 专属 API；不写注册表、不要求管理员权限。
- 控制台输出 ASCII-only（ADR-0006）。
- 所有测试使用 `unittest`（标准库）。
- 高风险标准库模块（`ctypes`、`winreg` 等）未经 WIN7_CONSTRAINTS §6 评审登记不得使用；
  本原型**不需要**它们。

## 12. 测试矩阵（最低覆盖，全部 `unittest`；单元测试放 §8.2 对应目录，端到端放 `tests/integration/prototype/`）

| # | 用例 | 预期 |
|---|------|------|
| P01 | 合法状态转换（§3.2 表内逐条） | 全部成功且各写一条 `state.transition` 事件 |
| P02 | 非法状态转换（表外若干条 + 终态后转换） | `INVALID_STATE_TRANSITION`，状态不变 |
| P03 | 最大 Turn 限制 | 第 N+1 Turn 前 Run → FAILED + `RUN_LIMIT_EXCEEDED` |
| P04 | 最大工具调用限制 | 超限的调用不执行，Run → FAILED + `RUN_LIMIT_EXCEEDED` |
| P05 | 模型不能直接修改 Run 状态 | 构造含"状态指令"文本的响应，状态机不受影响；RunState 无公开可变入口 |
| P06 | 取消标记 | 置位后下一转换点 Run → CANCELLED，CLI 退出码 2 |
| P07 | 端到端后目标工作区零变化 | 运行前后文件清单/mtime/大小快照一致 |
| P08 | 路径穿越拒绝 | `../` 系列参数 → `PATH_TRAVERSAL_DENIED` |
| P09 | 工作区外绝对路径拒绝 | 系统路径/其他盘符 → `PATH_OUTSIDE_WORKSPACE` |
| P10 | 符号链接/Junction 逃逸保守处理 | 平台支持时创建指向工作区外的链接 → 拒绝；无法创建链接的平台该子用例 skip 并注明 |
| P11 | READ_ONLY 允许 | 六个只读工具均 ALLOW 且有 `policy.decision` 事件 |
| P12 | 其他权限拒绝 | 构造请求 WORKSPACE_WRITE/PROCESS_EXECUTION/EXTERNAL_WRITE/DESTRUCTIVE 的 ToolSpec → 全部显式 DENY，非异常 |
| P13 | 工具参数错误 | 缺参/类型错 → `INVALID_TOOL_ARGUMENT`，工具未执行 |
| P14 | 工具输出截断 | 超上限文件 → `truncated=true`，内容长度 ≤ 上限 |
| P15 | Git 工具超时与 Git 不存在 | 模拟慢 git → `TOOL_TIMEOUT` 且进程被回收；清 PATH → `GIT_UNAVAILABLE`，不崩溃 |
| P16 | MockProvider 完整闭环 | §10 剧本走通，终态 COMPLETED，CLI 退出码 0 |
| P17 | ReplayProvider 重放 | 用 P16 事件库重放得到相同终态与相同事件类型序列；篡改后重放 → `REPLAY_MISMATCH` |
| P18 | EventStore 事件顺序 | 同一 Run 内 seq 严格递增无空洞，读取按序 |
| P19 | EventStore Run 重建 | `load_run` 重建轨迹与写入序列一致；payload 截断标记正确 |
| P20 | Verification 拒绝缺少证据的完成声明 | 构造"直接给结论、无 read 工具调用"的剧本 → REJECT，Run → FAILED + `VERIFICATION_REJECTED` |
| P21 | CLI 端到端演示 | `run_prototype_demo.bat` 等价命令行退出码 0，控制台 ASCII-only |
| P22 | 中文和空格路径 | 工作区根与文件名含中文/空格时 P16 全流程通过 |
| P23 | Capability Probe 不受影响 | `tests/unit/probe/**` 与 `tests/integration/probe/**` 原样全部通过；`src/win7_agent/probe/**` 无 diff |
| P24 | CPython 3.8.10 compileall | `python -m compileall -q src tests` 零错误 |
| P25 | 完整 unittest | 全部单元 + 集成用例一次性通过 |

审查轮 1 新增用例（P26–P42，全部必做，对应 §18 修复项）：

| # | 用例 | 预期 |
|---|------|------|
| P26 | CLI 缺必填参数（如无 `--task`） | 退出码 3（非 argparse 默认的 2） |
| P27 | `--max-turns 0` / `--max-tool-calls 0` | 退出码 3 |
| P28 | `--replay` 指向不存在路径 | 退出码 3，且**不创建任何文件** |
| P29 | `--replay` 指向无表 SQLite 库 / 有表但无 Run 的库 | 均退出码 3（ProviderError） |
| P30 | Replay 时当前请求指纹与录制指纹不一致（如任务文本改变） | `REPLAY_MISMATCH`，Run FAILED，退出码 1 |
| P31 | Replay 录制中响应缺失 / 多余响应（配对不完整） | `REPLAY_MISMATCH` |
| P32 | CLI 标准输出包含逐事件 ASCII 摘要行（按 seq 顺序）后接 RESULT 行 | 摘要存在、有序、ASCII-only，无全文内容 |
| P33 | EventStore 中途写入失败（注入故障） | Run FAILED，错误码 `EVENT_STORE_FAILED`，无异常穿透，无 traceback 上控制台 |
| P34 | DENY 后工具实现调用次数 | 实现函数调用次数为 0，事件为 `tool.denied` 而非 `tool.result` |
| P35 | DENY 后模型改用只读工具并给出带证据结论 | Run COMPLETED（DENY 不阻断 Run） |
| P36 | 构造“无 ALLOW 却存在 `tool.result`”的轨迹 | `NoPolicyViolationRule` REJECT |
| P37 | 未注册工具请求 | 直接 `TOOL_NOT_FOUND`，轨迹中无对应 ALLOW `policy.decision` |
| P38 | `True`/`False` 传入 `int` 参数（如 `start_line`） | `INVALID_TOOL_ARGUMENT`，工具不执行 |
| P39 | 终态后调用 `transition()` | 拒绝且写 `state.transition_rejected` 事件，状态不变 |
| P40 | Git 超时且进程拒不退出（模拟） | 无未捕获 `TimeoutExpired` 穿透，管道已关闭，结果 `TOOL_TIMEOUT` |
| P41 | `search_text` 预算：文件数/单文件字节/总输出字节分别超限 | 均停止扫描且 `truncated=true`，已有匹配返回 |
| P42 | 统一入口 `python scripts/run_prototype_tests.py` | 单命令执行全部原型 + Probe 测试，全绿退出 0，任一失败非零 |

## 13. 里程碑提交（顺序冻结，禁止合并为巨型 Commit）

每个里程碑一次（或一组小的）提交，提交信息前缀固定；每个里程碑完成时仓库必须处于
可编译（P24）+ 已有测试全绿状态：

| # | 提交信息 | 内容 |
|---|----------|------|
| M1 | `prototype: add core domain models and state machine` | `models/` 数据结构（§5.1）、`runtime/`（状态机/预算/取消）、对应单测 |
| M2 | `prototype: add readonly tools and policy engine` | `workspace/`、`tools/`（六工具 + 私有子进程辅助）、`policy/`、对应单测 |
| M3 | `prototype: add mock and replay providers` | `context/` ContextCompiler、`models/` 三 Provider、对应单测 |
| M4 | `prototype: add event store and verification` | `storage/` EventStore、`verification/`、对应单测 |
| M5 | `prototype: add end-to-end CLI demonstration` | `cli/`、`tests/fixtures/sample_project/**`、`scripts/run_prototype_demo.bat`、`docs/prototype/FULL_AGENT_SKELETON.md`、README 原型章节 |
| M6 | `prototype: add tests and architecture findings` | 补全 §12 测试矩阵、`docs/prototype/PROTOTYPE_FINDINGS.md`、`docs/prototype/INTERFACE_RISKS.md` |

## 14. 原型完成标准（全部满足才能进入 READY_FOR_PROTOTYPE_REVIEW）

1. MockProvider 完整闭环成功（P16）。
2. CLI 演示成功（P21）。
3. ReplayProvider 可以重放（P17）。
4. EventStore 可以还原完整执行轨迹（P18/P19）。
5. 状态完全由 Runtime 控制（P01/P02/P05）。
6. PolicyEngine 拒绝所有非只读行为（P11/P12）。
7. 目标工作区没有发生文件修改（P07）。
8. 不存在任意命令执行能力（代码审查：`tools/` 外无 subprocess，`tools/` 内仅 git 两命令且 argv 固定）。
9. 不存在网络访问（静态扫描：原型各包内 `socket`/`http.client`/`urllib`/`ssl` 零 import）。
10. 全部 unittest 通过（P25）。
11. Capability Probe 未被修改和破坏（P23）。
12. 按 §13 六个里程碑分别提交（git log 可核验）。
13. 原型发现与风险文档完整（§15 三份文档，无占位空章节）。
14. **未声称达到 Win7 正式验收标准**（全部原型文档与 README 章节均含 Prototype 免责声明）。

## 15. 原型文档要求（`docs/prototype/`，UTF-8 无 BOM，LF，禁止占位空章节）

| 文档 | 内容 |
|------|------|
| `FULL_AGENT_SKELETON.md` | 原型架构说明：模块图、数据流、状态机图（文本形式）、各接口签名摘要、ShadowWorkspace 等"仅接口"能力清单 |
| `PROTOTYPE_FINDINGS.md` | 已验证的架构接口；只是 Stub 或 Mock 的能力；不建议进入正式主线的代码清单（附理由）；对正式 Phase 2—Phase 6 的影响逐阶段列出；仍需 Win7 实机验证的部分 |
| `INTERFACE_RISKS.md` | 发现的接口冲突（含与 Phase 1 产物的任何张力，如私有子进程辅助 vs 阶段 2 Runner）；每条含：现象、影响面、建议裁决方，不含对 Phase 1 的直接修改 |

## 16. 原型代码处理规则

1. 原型代码只存在于 `prototype/full-agent-skeleton`（及其派生原型分支）；禁止整体合并 main。
2. 正式阶段吸收原型成果的唯一途径：对应正式阶段任务书（PHASE_02+）显式授权 + 架构师审查，
   按文件/按设计逐项吸收，吸收时按正式标准重写测试与文档。
3. `PROTOTYPE_ACCEPTED` 的含义仅为"架构验证结论可信"，不构成任何正式阶段的完成、
   不解除 Win7 E1/E2 验收硬门槛、不使原型代码获得进入 main 的资格。
4. 原型线冻结或否决（`PROTOTYPE_REJECTED`）后，分支保留作历史参考，不再演进。
5. 本文档修订与新增 ADR 均须经授权人批准；对 Accepted ADR 只能新增取代、不能改写。

## 17. Codex 实现前阅读顺序

1. `AGENTS.md`（最高约束；§3 已登记本原型线）
2. `docs/WIN7_CONSTRAINTS.md`（兼容性红线，§3/§4 禁用清单、§5 编码路径规则）
3. 本文档（`docs/tasks/PROTOTYPE_FULL_AGENT_SKELETON.md`）全文
4. `docs/DECISIONS.md`（重点 ADR-0011 授权机制、ADR-0023 原型线、ADR-0024 审查轮 1 语义裁决、ADR-0005/0006 子进程与控制台惯例）
5. `docs/SECURITY.md`、`docs/ARCHITECTURE.md`（安全模型与架构背景）
6. `docs/tasks/PHASE_01_CAPABILITY_PROBE.md`（**只读**：理解禁改边界、错误模型与文档风格）
7. `docs/ROADMAP.md`（正式阶段编号，PROTOTYPE_FINDINGS 对 Phase 2—6 的影响需按此编号书写）

## 18. 审查轮 1（Review Round 1）—修复要求与门控（本节为本轮修复的唯一授权依据）

独立审查结论：`KEEP_READY_FOR_PROTOTYPE_REVIEW_AND_REPAIR`（审查对象 `31d1bda`）。
本节列出的修复项均已反映到正文各节（标注“审查轮 1 修订/新增”）；正文与本节
冲突时以正文为准。语义级裁决（退出码、Replay 一致性、Policy DENY）见 ADR-0024。

### 18.1 必修项（Blocker / High）

| # | 修复项 | 落地节 |
|---|--------|--------|
| B1 | 自定义 `ArgumentParser` 覆盖 `error()`，参数错误（含缺参、`--max-turns 0`）返回 3 | §4.9 |
| B2 | Replay 以 SQLite URI `mode=ro` 只读打开；不存在路径不创建文件；加载期错误转 `ProviderError`，CLI 捕获并返回 3 | §4.2、§4.9 |
| H1 | CLI 按 EventStore 顺序输出逐事件 ASCII 摘要后输出 RESULT；不得输出完整模型/文件内容 | §4.9 |
| H2 | `EventStoreError` 单独捕获；RunResult 错误码 `EVENT_STORE_FAILED`；`run.final`/`finalize_run` best-effort；二次失败不覆盖原始错误、不出 traceback；文档化前缀保证 | §7、§4.7 |
| H3 | 落实 `tool.denied` 与新 `NoPolicyViolationRule` 语义（DENY = 拦截成功，非违规；工具实现 0 次调用；Run 可继续） | §4.4、§4.7、§4.8 |
| H4 | 录制侧新增 `request_fingerprint`；重放侧严格验证 turn/指纹/请求响应配对，不一致均 `REPLAY_MISMATCH` | §4.2、§4.7 |

### 18.2 同批修复项（Medium）

| # | 修复项 | 落地节 |
|---|--------|--------|
| M1 | 非法状态转换（含终态后）写 `state.transition_rejected` 审计事件 | §3.2、§4.7 |
| M2 | 未注册工具直接 `TOOL_NOT_FOUND`，不产生 ALLOW | §4.4 |
| M3 | 参数校验拒绝 `bool` 充当 `int` | §4.3 |
| M4 | Git 超时后二次 `wait()` 捕获 `TimeoutExpired`；`finally` 关闭 stdout/stderr 流 | §4.3 |
| M5 | `search_text` 增加最大文件数 2000、单文件扫描 1 MiB、总输出 256 KiB 预算 | §4.3 |
| M6 | ContextCompiler 读 AGENTS.md 改为字节预算（4096 字节二进制读 + UTF-8 replace 解码） | §4.6 |
| M7 | EventStore 初始化失败时关闭已建立连接 | §4.7 |
| M8 | `--event-db` 位于目标工作区内时输出一行 ASCII 提示 | §4.9 |

### 18.3 本轮新增测试要求

§12 P26–P42 全部实现并通过；既有 P01–P25 不得回退；Probe 测试（P23）仍须原样全绿。

### 18.4 统一测试入口规格（新增授权，§8.3）

背景：仓库根目录 `python -m unittest discover` 发现 0 个用例（子包布局不被默认
发现规则命中），必须提供单命令入口。

- `scripts/run_prototype_tests.py`：仅标准库（`unittest`、`os`、`sys` 等），
  **不得依赖 pytest**。依次用 `unittest.defaultTestLoader.discover` 加载以下目录
  （将 `src` 与仓库根加入 `sys.path`）：全部原型单测目录（§8.2 的 `tests/unit/*`）、
  `tests/integration/prototype`、`tests/unit/probe`、`tests/integration/probe`；
  合并为单个 suite 运行，**任一失败/错误/加载失败返回非零**，全绿返回 0；
  控制台输出 ASCII-only。只读加载 Probe 测试不违反 §9（§9 禁的是修改）。
- `scripts/run_prototype_tests.bat`：CRLF（`.gitattributes` 既有 `*.bat` 规则覆盖），
  ≤5 行，无 cmd 高级特性，调用上述 Python 脚本并透传退出码。

### 18.5 进入 `READY_FOR_PYTHON38_VALIDATION` 的条件（全部满足，由架构师复审后更新 Gate）

1. §18.1 B1/B2/H1–H4 与 §18.2 M1–M8 全部关闭，实现与正文各节一致。
2. §12 P01–P42 全部通过；`python scripts/run_prototype_tests.py` 单命令全绿。
3. `python -m compileall -q src tests scripts` 零错误（仍禁 3.9+ 语法）。
4. 修复提交仅触及 §8 白名单路径；`src/win7_agent/probe/**` 与 Probe 测试零 diff。
5. 三份原型文档（§15）同步本轮语义变更（tool.denied、指纹、威胁模型声明等）。
6. 架构师复审确认后，由架构师将 `Review-Status` 更新为 `REPAIR_VERIFIED` 并将
   `Phase-Gate` 更新为 `READY_FOR_PYTHON38_VALIDATION`；实现方不得自行修改（§0.4）。

`READY_FOR_PYTHON38_VALIDATION` 的含义：在干净的 CPython 3.8.10 解释器上执行
统一测试入口与演示脚本验证；该验证通过后方可由架构师裁决 `PROTOTYPE_ACCEPTED`。
它仍**不是** Win7 E1/E2 实机验收，不解除 §0.2 的任何限制。

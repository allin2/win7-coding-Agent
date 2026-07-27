# PHASE_02 — 正式只读代码分析 Agent 任务书（READONLY_CODE_ANALYSIS）

> 实现前必读：`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、本文档。
> 本文档是阶段 2 的完整设计与唯一实现授权载体（ADR-0011 / ADR-0025）。
> 实现工程师**不需要也不允许**再做设计层面的决策；发现设计缺陷时，回到本文档修订并补 ADR，
> 而不是在代码里自行变通。

## 0. 实现授权（ADR-0011 / ADR-0025）

### 0.1 状态块

```
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: FORMAL_PHASE
Target Branch: phase/02-readonly-agent
Phase-Gate: APPROVED_FOR_IMPLEMENTATION
Review-Round: 0
Review-Status: NONE
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Target environment unavailable
```

（2026-07-27 项目负责人批准创建本任务书与授权链；批准范围仅限 §8 白名单路径，
且实现只能发生在 `phase/02-readonly-agent` 分支上。`Phase-Gate` / `Review-Round` /
`Review-Status` / `Win7-*` 各行只能由架构师修改，唯一例外：实现方开始首个里程碑时可将
`Phase-Gate` 更新为 `IMPLEMENTING`。Win7 实机验收前，`Win7-Validation` 必须保持
`NOT_PERFORMED`，本阶段不得宣称 Win7 已通过。）

### 0.2 授权链与证据基线

- 授权 ADR：`docs/DECISIONS.md` ADR-0025（阶段 2 重定义 + 原型契约收编 + 编号保留说明）。
- 原型证据基线（只读参考，不构成合并授权）：
  - 原型实现冻结提交：`9b6461d0fd3380babcc56a842571eb4b4dc77660`
  - 验证标签：`prototype-r1-py38-verified`
  - Gate 提交：`d1d38fd2ba22dae4ef1feb486fc66d857cdd2caf`
  - 验证记录提交：`714ec90`
  - macOS CPython 3.8.10：compileall PASS、104/104 tests PASS、CLI COMPLETED、
    `trace_complete=true`、退出码 0
  - Win7：`BLOCKED_ENVIRONMENT` / `NOT_PERFORMED`
- 原型分支 ADR-0024（退出码 / Replay 一致性 / DENY 语义）与原型任务书 §19 三项精确定义
  （EventStore 生命周期、`executed` 字段、动态测试发现门槛）经 ADR-0025 收编为主线正式契约，
  **规范文本以本任务书 §3 为准**；本任务书与原型文本冲突时以本任务书为准并须补 ADR 说明。
- **ADR-0024 历史定位声明**：ADR-0024 仅为原型分支历史决策，不属于 main 的正式规范；
  其全部需继承语义已完整写入本任务书 §3 与 ADR-0025。实现方（Codex）实施阶段 2 时
  **无需也不得**以读取原型分支 ADR-0024 或原型任务书为前提；任何未写入本任务书的原型文本
  要求均不构成阶段 2 的隐藏要求。正式规范授权链（冻结）：ADR-0025 → 本任务书 →
  AGENTS.md §3 当前阶段登记 → ROADMAP 阶段 2 定义。
- **旧排期取代声明**：ADR-0025 supersedes the previous Phase 2 scheduling description.
  Phase 2 is the formal read-only code analysis agent. The general subprocess runner is
  deferred and is not authorized by this phase.（历史文档中任何"阶段 2 = 通用子进程
  Runner"的描述均为已被取代的历史计划，不构成本阶段任何实现要求。）

### 0.3 与原型线的关系（强制）

1. **禁止**将 `prototype/full-agent-skeleton` 分支整体 merge 进 main 或 `phase/02-readonly-agent`。
2. **禁止** cherry-pick 任何原型提交（原型提交粒度与 §5 迁移矩阵不对齐）。
3. 原型代码只能按 §5 迁移矩阵逐项裁决后**人工选择性移植**（copy-adapt），每次移植的提交信息
   必须注明来源 `ported from prototype 9b6461d (matrix item <编号>)`，并在 Phase 2 分支重新
   通过 §7 测试与架构师审查。
4. 原型分支保持只读参考状态，本阶段不得向其追加提交。

## 1. 目标

建立正式的只读代码分析 Agent：CLI 一次性进程接收分析任务，在 Mock/Replay Provider 驱动下
执行"指令 → 只读工具调用 → 验证 → 终态"的闭环，全程受工作区边界、权限策略与事件审计约束。

量化闭环（全部满足才算达成目标）：

1. 受工作区边界约束的只读文件分析：目录列表、文件读取、文件范围读取、字面文本搜索。
2. 受限只读 Git 观测：`git status`、`git diff`（固定只读命令，非通用 Runner）。
3. 结构化 Runtime 状态机（§3.1），状态只能由 Runtime 写入。
4. Policy 先于执行（§3.5）：无 ALLOW 不执行，DENY 记 `tool.denied`。
5. `ToolResult.executed` 语义（§3.4）。
6. EventStore 审计轨迹（§3.8）：顺序、带版本、可按执行序重建。
7. Mock/Replay 双 Provider 测试（§3.9），Replay 具备请求指纹一致性验证。
8. CLI 只读分析闭环：`python -m win7_agent.cli analyze` 在样例工程上以 `COMPLETED`、
   `trace_complete=true`、退出码 0 结束。

## 2. 非目标（冻结清单，出现即打回）

- 文件写入、`apply_patch`、删除、重命名、任何形式的目标工作区变更。
- 任意 Shell 执行；`shell=True`（AGENTS.md C09）；除 §3.7 固定 Git 命令外的任何子进程。
- 真实模型网络接入（Phase 3）；任何网络访问。
- MCP、多 Agent、自动修复、后台守护进程、注册表、管理员权限。
- 通用子进程 Runner API（ADR-0025：延后至需要通用命令执行的阶段另行授权）。
- 交互式子进程；所有子进程 stdin 必须关闭或重定向（AGENTS.md §7）。

## 3. 正式契约（冻结）

本节为主线规范文本。修改本节任何条目必须补 ADR。

### 3.1 状态机

`RunStatus`（冻结）：`RECEIVED, DISCOVERING, PLANNING, EXECUTING, VERIFYING,
COMPLETED, FAILED, CANCELLED`；终态为 `COMPLETED / FAILED / CANCELLED`。

合法转换表（冻结）：

| from | to | 触发 |
|------|----|------|
| RECEIVED | DISCOVERING | Run 建立后开始工作区发现 |
| DISCOVERING | PLANNING | 上下文编译完成 |
| PLANNING | EXECUTING | 首次模型响应 |
| EXECUTING | VERIFYING | Provider 声称完成（无工具调用的终结响应） |
| VERIFYING | COMPLETED | VerificationEngine 通过 |
| VERIFYING | FAILED | VerificationEngine 拒绝且无剩余预算 |
| VERIFYING | EXECUTING | VerificationEngine 拒绝但 Turn 预算未耗尽（重试路径） |
| 任一非终态 | FAILED | 结构化错误 / 预算耗尽 |
| 任一非终态 | CANCELLED | 取消标记 |

- 状态只能由 Runtime（RunController）写入；Provider、工具、验证器均无权直接改状态。
- 非法转换请求（含终态后的任何转换）拒绝并写 `state.transition_rejected` 事件，状态不变，
  错误码 `INVALID_STATE_TRANSITION`。
- `COMPLETED` 只能由 VerificationEngine 裁决产生，Provider 的"完成声明"仅触发 VERIFYING。

### 3.2 Turn 与工具预算

- CLI 参数 `--max-turns`（默认 8）与 `--max-tool-calls`（默认 32）。
- 预算检查发生在 Runtime 的转换点与工具分发点，不依赖 Provider 自律。
- **计数口径（冻结）**：模型发起的每一次工具调用尝试均计入 `--max-tool-calls`，
  无论结局是执行成功、执行失败、DENY 还是 `TOOL_NOT_FOUND`。
- 预算耗尽 → `RUN_LIMIT_EXCEEDED` → FAILED。

### 3.3 数据模型

- `Message(role, content)`；`ModelRequest(messages, tools, turn)`；
  `ModelResponse(content, tool_calls, finish_reason, usage)`；
  `FinishReason ∈ {STOP, TOOL_CALLS, ERROR}`。
- `ToolCall(tool_call_id, name, arguments)`；`ToolRequest`；
  `ToolResult(status, executed, content, truncated, error)`。
- 所有契约为厂商无关纯数据类，禁止携带任何传输/厂商细节（Phase 3 的 Gateway 自行适配）。
- 所有持久化结构带版本字段（EventStore `schema_version = 1`）。

### 3.4 `executed` 字段语义（冻结矩阵）

| 情形 | 事件 | executed | 约束 |
|------|------|----------|------|
| 工具真实执行（成功或执行中失败） | `tool.result` | `true` | 必须存在先行同 `tool_call_id` 的 ALLOW（`policy.decision`） |
| 执行前失败（`TOOL_NOT_FOUND`、`INVALID_TOOL_ARGUMENT` 等） | `tool.result` | `false` | 不要求 ALLOW；工具实现函数调用次数为 0 |
| Policy DENY | `tool.denied` | 不适用 | 绝对不产生 `tool.result`；实现函数调用次数为 0 |
| 未来新增执行前错误码 | `tool.result` | `false` | 自动归入执行前失败类，但新增错误码必须修订本任务书 |

### 3.5 Policy 先于执行与 DENY 语义

- `PolicyEngine` 在工具分发前裁决；本阶段权限模型冻结为：仅 `READ_ONLY` 可 ALLOW，
  其余权限类型（含 `WORKSPACE_WRITE`、`PROCESS_EXECUTION` 等声明值）一律显式 DENY。
- DENY = 安全策略成功拦截，**不是** policy violation；拒绝观察以结构化内容回传模型，
  Run 可继续寻求只读替代方案。
- `NoPolicyViolationRule` 只依据四项事实裁决：存在 `tool.result(executed=true)` 却无先行
  同 `tool_call_id` ALLOW → REJECT；`tool.denied` 本身不构成违规；`executed=false` 不要求
  ALLOW；事实核对基于事件轨迹而非错误码白名单。
- `TOOL_NOT_FOUND`：未注册工具名 → `tool.result(executed=false)`，不新增事件类型，
  计入工具预算。

### 3.6 工作区边界

- 目标工作区在 CLI 启动时指定，全程只读；边界校验 = 词法校验（拒绝 `..` 上溯）+
  `os.path.realpath` 实路径校验（拒绝符号链接逃逸），比较使用 `os.path.normcase`。
- 越界 → `PATH_OUTSIDE_WORKSPACE`；上溯 → `PATH_TRAVERSAL_DENIED`；均为工具级结构化错误，
  不中断 Run。
- 路径处理必须兼容中文、空格、`%`、`#`、Windows 盘符与反斜杠（AGENTS.md C10）；
  超长路径按 `errno.ENAMETOOLONG` 常量或 `winerror == 206` 识别，报 `PATH_TOO_LONG`
  （WIN7_CONSTRAINTS P08，禁止硬编码整数 errno）。

### 3.7 只读工具契约（六工具，冻结）

| 工具 | 参数 | 语义要点 |
|------|------|----------|
| `list_directory` | `path`（可选） | 列目录项与大小，跳过忽略目录 |
| `read_file` | `path`，`encoding`（可选，默认 utf-8） | 文本读取；含 `\x00` 判为二进制 → `NOT_A_TEXT_FILE` |
| `read_file_range` | `path`，`start_line`，`end_line`，`encoding`（可选） | 带行号的范围读取 |
| `search_text` | `pattern`（字面量，非正则），`path`（可选），`max_matches`（默认 200，上限 500） | 逐文件逐行搜索，跳过忽略目录与二进制文件 |
| `git_status` | 无 | 固定只读命令 `git status --porcelain` |
| `git_diff` | `path`（可选） | 固定只读命令 `git diff --no-color [-- <path>]` |

`search_text` 四类预算（冻结）：单文件最多扫描 1 MiB（超限只扫前 1 MiB，**继续**后续文件）；
文件数上限 2000；总输出上限 256 KiB；`max_matches` 上限。仅当整体预算耗尽才置
`truncated=true` 并停止扫描；每匹配行截断 500 字符。

Git 工具约束：仅上述两条固定 argv 命令；`git.exe` 缺失 → `GIT_UNAVAILABLE` 结构化降级
（AGENTS.md C13）；子进程必须超时 + 输出上限 + 强制终止（C08）：超时先 `taskkill /PID <pid>
/T /F`（D-002），失败降级 `Popen.kill()` 并在 `error` 详情记录降级；stdin 关闭；后台线程
边读边截断（WIN7_CONSTRAINTS P02）；管道关闭竞态记为截断而非线程错误。子进程实现为
`tools` 包私有模块，业务代码不得直接 `subprocess.Popen`（AGENTS.md §6 对本模块的豁免仅限
该私有模块自身）。

### 3.8 EventStore 生命周期与 `trace_complete`

事件类型（冻结，`schema_version = 1`）：`run.created`、`state.transition`、
`state.transition_rejected`、`model.request`、`model.response`、`tool.requested`、
`policy.decision`、`tool.denied`、`tool.result`、`verification.result`、`run.final`。
`model.request` 只存元数据与 `request_fingerprint`，不存消息全文。

生命周期三阶段故障矩阵（冻结）：

| 阶段 | 边界 | 故障处置 | 退出码 |
|------|------|----------|--------|
| 1 建立前 | `run.created` 与 `runs` 行在同一显式事务中成功持久化之前 | 不留半初始化轨迹；无 RESULT 行 | 3 |
| 2 运行中 | Run 已建立，必要事件写入失败 | Run → FAILED，错误码 `EVENT_STORE_FAILED`，`trace_complete=false`；持久化先行三步（先写事件、再转状态、后回传） | 1 |
| 3 收尾 | 仅 `run.final` / finalize 写入失败 | 业务终态不回滚；`trace_complete=false` | 按业务终态 0/1/2 |

- `trace_complete` 为 `RunResult` 权威布尔值，RESULT 行永远展示；`run.final` payload 中的
  值仅反映截至写入时。
- EventStore 只允许写入用户显式指定路径或系统临时目录；轨迹必须可按执行序完整重建，
  存储失败声明只允许"完整前缀"语义。

### 3.9 Replay 一致性

- 事件库以 SQLite URI `file:<path>?mode=ro` 只读打开；路径不存在不得创建文件。
- Schema、Run 或录制序列错误 → `ProviderError` → CLI 退出码 3。
- 录制时每个 `model.request` 保存 `request_fingerprint`：对消息序列、工具名清单与 turn 的
  确定性 JSON 序列化取 `hashlib.sha256`。
- 重放时验证 turn、请求指纹与请求响应配对；请求不一致、响应缺失、响应多余、顺序错误或
  录制耗尽均为 `REPLAY_MISMATCH` → Run FAILED → 退出码 1。
- 威胁模型声明（冻结）：指纹只防意外不一致，不承诺抵抗攻击者协调修改数据库与指纹。

### 3.10 CLI 与退出码

- 入口：`python -m win7_agent.cli analyze --workspace <dir> --task <text>
  [--provider mock|replay] [--events <db>] [--replay-from <db>] [--max-turns N]
  [--max-tool-calls N]`。
- 退出码（冻结）：`0` = COMPLETED；`1` = FAILED（含 `REPLAY_MISMATCH`、
  `EVENT_STORE_FAILED`）；`2` = CANCELLED；`3` = 参数、配置、Replay 初始化及 CLI 基础设施
  错误（argparse 经自定义 `error()` 归入 3；Run 未建立的错误一律 3，无 RESULT 行）。
- RESULT 行（机器可读，ASCII）：`RESULT status=<S> trace_complete=<true|false>
  turns=<N> tool_calls=<N>`；仅 Run 建立后输出。

### 3.11 错误码（冻结枚举）

`PATH_OUTSIDE_WORKSPACE, PATH_TRAVERSAL_DENIED, PATH_TOO_LONG, PERMISSION_DENIED,
TOOL_NOT_FOUND, INVALID_TOOL_ARGUMENT, NOT_A_TEXT_FILE, TOOL_TIMEOUT, GIT_UNAVAILABLE,
SUBPROC_SPAWN_FAILED, RUN_LIMIT_EXCEEDED, INVALID_STATE_TRANSITION, VERIFICATION_REJECTED,
REPLAY_MISMATCH, EVENT_STORE_FAILED, UNEXPECTED`

`PATH_TOO_LONG` 为本阶段相对原型新增（WIN7_CONSTRAINTS P08 / ADR-0022 形态识别规则）。
新增任何错误码必须修订本任务书并核对 §3.4 executed 归类。

### 3.12 控制台与文件输出

- stdout/stderr 只输出 ASCII（AGENTS.md §6，Win7 cmd CP936）；完整信息（含非 ASCII 路径）
  写 UTF-8 文件或事件库。
- 所有文本 I/O 显式 `encoding=`（C11）；程序自产文件 UTF-8 无 BOM。

### 3.13 验证引擎

- `RequiredEvidenceRule`：最终分析必须引用真实读取过的文件路径与行号（引用证据必须能在
  事件轨迹中找到对应 `tool.result(executed=true)`），仅有结论句 → `VERIFICATION_REJECTED`。
- `NoPolicyViolationRule`：见 §3.5 四项事实。
- 验证结论写 `verification.result` 事件；COMPLETED 只能经验证产生（§3.1）。

## 4. 包结构与模块职责

```
src/win7_agent/
  models/        # 契约数据类 + MockProvider / ReplayProvider（§3.3, §3.9）
  runtime/       # RunController / RunState / RunStatus / 转换表 / 预算（§3.1, §3.2）
  context/       # 纯函数上下文编译（工作区发现摘要 + 任务 → ModelRequest 素材）
  policy/        # PolicyEngine / PermissionType / PolicyDecision（§3.5）
  tools/         # ToolSpec / ToolRegistry / 六只读工具 / 私有受限 Git 子进程（§3.7）
  workspace/     # WorkspaceContext 边界校验（§3.6）
  verification/  # VerificationEngine 与两规则（§3.13）
  storage/       # EventStore（SQLite，§3.8）
  cli/           # argparse 入口 / RESULT 行 / 退出码（§3.10）
```

- `context/` 编译器为纯函数；读取 `AGENTS.md` 类项目说明文件时按字节预算截断。
- 模块间依赖单向：`cli → runtime → (models, tools, policy, verification, storage,
  context, workspace)`；禁止反向依赖与循环依赖。
- 每个模块可独立测试；失败产生 §3.11 结构化错误（AGENTS.md §6）。

## 5. 原型迁移矩阵（逐项裁决，冻结）

裁决值：`ADOPT`（原样吸收）/ `ADOPT_WITH_CHANGES`（人工移植+修改+重测）/
`REIMPLEMENT`（仅参考语义，代码重写）/ `DEFER`（延后到指定阶段）/ `REJECT`（不吸收）。

| # | 原型模块 | 裁决 | 原因与可复用接口 | 不得直接吸收的实现 | Phase 2 新增测试 | Win7 风险 |
|---|----------|------|------------------|--------------------|------------------|-----------|
| M-01 | `models`（契约数据类） | ADOPT_WITH_CHANGES | 厂商无关契约已验证；`Message/ModelRequest/ModelResponse/ToolCall/Usage/FinishReason` 接口可复用 | provider 实现不随契约一起移植（见 M-12/M-13） | F45 移植等价回归 | 低 |
| M-02 | `runtime/state`（状态机） | ADOPT_WITH_CHANGES | 转换表与 Runtime 独占写权已冻结（§3.1）；`RunStatus`/转换表可复用 | 与原型 runner 耦合的入口代码 | F01–F04 | 低 |
| M-03 | `runtime/runner`（RunController） | REIMPLEMENT | 原型自证"缺正式恢复/确认/能力门控"（PROTOTYPE_FINDINGS），仅语义可参考：持久化先行、预算检查点、验证触发 | `runner.py` 整体（原型文档明确不推荐直接吸收） | F01–F04, F26–F30, F37–F38 | 中：终态收尾与子进程交互路径需 Win7 复验 |
| M-04 | `policy` | ADOPT_WITH_CHANGES | DENY 语义与 `policy.decision` 审计已冻结（§3.5）；`PermissionType`/`PolicyDecision` 可复用 | 无 | F20–F21 | 低 |
| M-05 | `tools/registry` | ADOPT_WITH_CHANGES | `ToolSpec` 参数校验（含 bool 冒充 int 拒绝）已验证 | 无 | F22–F25 | 低 |
| M-06 | `tools/readonly`（六工具） | ADOPT_WITH_CHANGES | 六工具契约与 `search_text` 四预算已冻结（§3.7） | 与原型私有 Git helper 的耦合点 | F10–F19 | 中：NTFS/CP936/长路径行为未在 Win7 验证 |
| M-07 | `tools/subproc`（Git helper） | REIMPLEMENT | 原型自证"窄 Git 契约，非 Phase 2 进程 API"（PROTOTYPE_FINDINGS）；可参考双超时排水与管道竞态语义 | `subproc.py` 整体；原型仅 `kill()`，正式版必须 taskkill 进程树终止 + 降级记录（§3.7, D-002） | F17–F19（含 taskkill 降级） | 高：进程树终止、tasklist/taskkill 行为必须 Win7 实测 |
| M-08 | `workspace` | ADOPT_WITH_CHANGES | 词法 + realpath + normcase 边界已验证（§3.6）；`WorkspaceContext` 接口可复用 | 无 | F05–F09（新增 PATH_TOO_LONG） | 中：符号链接/junction、260 限制需 Win7 复验 |
| M-09 | `context` | ADOPT_WITH_CHANGES | 纯函数编译 + 字节预算读取已验证 | 无 | F44 关联回归 | 低 |
| M-10 | `storage/EventStore` | ADOPT_WITH_CHANGES | schema v1、同事务 Run 建立、生命周期矩阵已冻结（§3.8）；正式审计保留策略与迁移属 Phase 5 | 无 | F26–F30 | 中：SQLite URI 只读模式与本地盘约束（P10）需 Win7 复验 |
| M-11 | `verification` | ADOPT_WITH_CHANGES | 两规则与四项事实已冻结（§3.13） | 无 | F36 | 低 |
| M-12 | `MockProvider` | ADOPT_WITH_CHANGES | 确定性脚本驱动可复用为 Phase 2 默认/测试 Provider；本阶段无真实模型 | 字符计数式 usage 不得宣称为 token 口径（注释与文档必须标明） | F31 关联（Mock 主链路） | 低 |
| M-13 | `ReplayProvider` | ADOPT_WITH_CHANGES | 指纹 + mode=ro 一致性模型已冻结（§3.9） | 重放格式不得承诺为对外协议（Phase 3 另定义） | F31–F35 | 中：SQLite URI 含中文/空格/%/# 路径需 Win7 复验 |
| M-14 | `CLI` | ADOPT_WITH_CHANGES | 退出码冻结、自定义 argparse `error()`、RESULT 行可复用（§3.10） | 原型演示文案 | F37–F39 | 中：CP936 控制台 ASCII 纪律需 Win7 复验 |
| M-15 | 原型测试（84 项原型专属用例） | ADOPT_WITH_CHANGES | 覆盖语义（P01–P55 对应场景）是 §7 矩阵的基础 | 禁止整目录复制；按 §7 编号与正式断言风格重写，逐条映射 | 全部 F 编号 | 低 |
| M-16 | 原型文档（docs/prototype/**、原型任务书） | REJECT | 仅作原型分支上的只读参考输入；Phase 2 产出自己的文档与验证记录 | 不迁移任何原型文档到 main | 不适用 | 不适用 |
| M-17 | `ShadowWorkspace` 抽象（无实现） | DEFER（Phase 4） | 写路径边界属文件系统阶段 | 全部 | 不适用 | 不适用 |

计数冻结（与上表逐行对账，修改任一行必须同步本行）：合计 **17 项** =
ADOPT_WITH_CHANGES **13 项**（M-01、M-02、M-04、M-05、M-06、M-08、M-09、M-10、
M-11、M-12、M-13、M-14、M-15）+ REIMPLEMENT **2 项**（M-03、M-07）+
DEFER **1 项**（M-17）+ REJECT **1 项**（M-16）；ADOPT 本阶段 0 项。

## 6. 兼容性门槛（持续生效）

- CPython 3.8.10；所有 `.py` 通过 `python3.8 -m compileall -q`（C02/C05）。
- 仅标准库（C03）；本任务书未新增任何 WIN7_CONSTRAINTS §6 需评审依赖
  （`sqlite3` D-001、`taskkill.exe` D-002、`git.exe` D-003 均已批准）。
- 禁 Python 3.9+ 语法/API（WIN7_CONSTRAINTS §3）；禁 Node/Docker/WSL（C04）；
  禁 `shell=True`/`os.system`/`os.popen`（C09）；禁真实网络访问（§2）。
- Win7 状态声明（冻结，写入所有验证记录）：

```
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Target environment unavailable
```

在 Win7 SP1 x64 实机验收（E1/E2 语义）完成前，本阶段所有验证结论仅证明语言级兼容与
开发机行为，不构成 Win7 验收（AGENTS.md §5.8）。

## 7. 测试矩阵与质量门禁

### 7.1 测试矩阵（编号冻结；实现测试文件时逐条映射）

| 编号 | 场景 | 断言要点 |
|------|------|----------|
| F01 | 全部合法状态转换 | 按 §3.1 表逐条通过 |
| F02 | 非法转换（含终态后） | 拒绝 + `state.transition_rejected` + 状态不变 |
| F03 | Turn 预算耗尽 | `RUN_LIMIT_EXCEEDED` → FAILED，退出码 1 |
| F04 | 工具预算计数口径 | 成功/失败/DENY/`TOOL_NOT_FOUND` 均计数 |
| F05 | `..` 上溯 | `PATH_TRAVERSAL_DENIED` |
| F06 | 工作区外绝对路径 | `PATH_OUTSIDE_WORKSPACE` |
| F07 | 符号链接逃逸（可测平台） | realpath 后拒绝 |
| F08 | 超长路径 | `PATH_TOO_LONG`，按 errno 常量/winerror 206 识别 |
| F09 | 中文、空格、`%`、`#` 路径 | 六工具与 Replay URI 均正确处理 |
| F10 | `list_directory` / `read_file` / `read_file_range` 正常路径 | 内容与行号正确 |
| F11 | 二进制文件 | `NOT_A_TEXT_FILE` |
| F12 | 显式编码读取 | `encoding` 参数生效，无裸 open（C11） |
| F13 | `read_file_range` 边界（越界行号、start>end） | `INVALID_TOOL_ARGUMENT` |
| F14 | 工具参数类型校验（含 bool 冒充 int） | `INVALID_TOOL_ARGUMENT`，executed=false |
| F15 | `search_text` 四类预算逐项耗尽 | 单文件 1 MiB 后继续后续文件；仅整体耗尽置 truncated |
| F16 | `search_text` 跳过二进制与忽略目录 | 匹配行 500 字符截断 |
| F17 | Git 缺失 | `GIT_UNAVAILABLE` 降级，Run 不崩溃（C13） |
| F18 | Git 子进程失败 / 非零退出 | 结构化错误，stderr 截断入 error |
| F19 | Git 超时与双超时排水 | 先 taskkill /T /F，失败降级 kill() 且降级入 error；管道竞态记截断 |
| F20 | 非 READ_ONLY 权限请求 | DENY + `tool.denied`，实现调用 0 次 |
| F21 | DENY 后 Run 继续 | 拒绝观察回传模型，可继续只读路径 |
| F22 | executed=true 有先行 ALLOW | `policy.decision` 与 `tool.result` 配对 |
| F23 | executed=true 无 ALLOW（构造轨迹） | `NoPolicyViolationRule` REJECT |
| F24 | executed=false 情形 | 不要求 ALLOW，实现调用 0 次 |
| F25 | `TOOL_NOT_FOUND` | `tool.result(executed=false)`，计入预算 |
| F26 | 阶段 1 故障（Run 建立前） | 退出码 3，无 RESULT 行，无半初始化轨迹 |
| F27 | 阶段 2 故障（必要事件失败） | FAILED + `EVENT_STORE_FAILED` + trace_complete=false + 退出码 1 |
| F28 | 阶段 3 故障（仅收尾失败） | 终态不回滚，trace_complete=false，退出码按终态 |
| F29 | 事件轨迹按执行序重建 | 顺序、schema_version=1、完整前缀语义 |
| F30 | trace_complete 权威性 | RESULT 行永远展示；与 run.final payload 差异语义正确 |
| F31 | Replay 正常重放 | 与录制结论一致 |
| F32 | Replay 响应缺失 / 录制耗尽 | `REPLAY_MISMATCH` → FAILED |
| F33 | Replay 响应多余 | `REPLAY_MISMATCH` → FAILED |
| F34 | 请求指纹不匹配 | `REPLAY_MISMATCH` → FAILED |
| F35 | Replay 初始化错误（库不存在 / 空 runs / schema 错） | `ProviderError` → 退出码 3，不创建文件（mode=ro） |
| F36 | 验证规则 | 仅结论句 REJECT；引用真实读取路径+行号 PASS |
| F37 | CLI 退出码 0/1/2/3 全覆盖 | 含 argparse 错误经自定义 error() 归 3 |
| F38 | RESULT 行格式 | 机器可读、ASCII、仅 Run 建立后输出 |
| F39 | 控制台 ASCII | stdout/stderr 捕获逐字节 < 0x80 |
| F40 | 统一入口发现 0 项 / 低于门槛 | 非零退出（§7.2） |
| F41 | 统一入口 ImportError / 目录不可读 | 记失败、非零退出 |
| F42 | 嵌套目录新测试自动被发现 | 递归发现 + 稳定排序 |
| F43 | CPython 3.8.10 compileall | 全部 `.py` 零错误 |
| F44 | Phase 1 回归 | probe 全部既有测试通过、零修改 |
| F45 | 原型迁移等价回归 | 每个 ADOPT_WITH_CHANGES 移植项至少一条语义等价断言（对照 §3 契约） |

### 7.2 统一测试入口与最低发现门槛

- 唯一入口：`scripts/run_agent_tests.py`（unittest，禁 pytest），递归动态发现
  `tests/unit/**/test_*.py` 与 `tests/integration/**/test_*.py`（含 Phase 1 probe 测试），
  `os.path.normcase` 排序保证稳定顺序，输出 `TOTAL tests run: N`（ASCII）。
- 门禁：发现 0 项、实际执行数低于最低门槛、任何用例失败、任何模块 ImportError 或
  目录不可读 → 非零退出；禁止 "Ran 0 tests, OK"。
- 最低门槛机制（防漏测，不以数量替代覆盖）：初始门槛 = M1 里程碑时统计的 Phase 1
  实际发现数（冻结记录在入口脚本常量与 M1 提交信息）；此后每个里程碑完成时将门槛
  上调为当时实际发现数；门槛只升不降；最终基线写入 §13 验证记录。
- `scripts/run_agent_tests.bat`：不超过 5 行的 CRLF 启动包装（`.gitattributes` 已约束
  `*.bat` CRLF）。

### 7.3 质量门禁（每个里程碑提交必须全绿）

1. `python3.8 -m compileall -q src tests scripts` 零错误。
2. 统一入口全绿且不低于当前门槛。
3. 静态扫描零命中：`shell=True`、`os.system`、`os.popen`、无 `encoding` 的文本 `open(`、
   WIN7_CONSTRAINTS §3 禁用 API。
4. `git diff` 确认未触碰 §9 禁止路径。

## 8. 实现路径白名单（C14；仅在 `phase/02-readonly-agent` 分支生效）

- `src/win7_agent/models/**`
- `src/win7_agent/runtime/**`
- `src/win7_agent/context/**`
- `src/win7_agent/policy/**`
- `src/win7_agent/tools/**`
- `src/win7_agent/workspace/**`
- `src/win7_agent/verification/**`
- `src/win7_agent/storage/**`
- `src/win7_agent/cli/**`
- `tests/unit/models/**`、`tests/unit/runtime/**`、`tests/unit/context/**`、
  `tests/unit/policy/**`、`tests/unit/tools/**`、`tests/unit/workspace/**`、
  `tests/unit/verification/**`、`tests/unit/storage/**`、`tests/unit/cli/**`
- `tests/integration/agent/**`
- `tests/fixtures/**`（仅样例工程夹具；禁止放入真实用户代码或敏感内容）
- `scripts/run_agent_tests.py`、`scripts/run_agent_tests.bat`、`scripts/run_analysis_demo.bat`
- 文档（不受实现白名单限制但按 AGENTS.md 文档规则）：本任务书、`docs/DECISIONS.md`（仅追加
  ADR）、`README.md` 阶段状态表（M6）、`docs/ARCHITECTURE.md` 分层同步（架构师执行）。

## 9. 禁止路径（出现改动即打回）

- `src/win7_agent/probe/**`；`src/win7_agent/__init__.py`（内容冻结为版本行，PHASE_01 §0.2）
- `tests/unit/probe/**`、`tests/integration/probe/**`、`tests/win7/**`
- `scripts/run_probe.bat`、`scripts/run_tests.bat` 及其他既有脚本
- `docs/tasks/PHASE_01_CAPABILITY_PROBE.md`、`docs/tasks/PROTOTYPE_FULL_AGENT_SKELETON.md`
- 已 Accepted ADR 正文（只可追加新 ADR）；`AGENTS.md`（仅架构师凭 ADR 修改）
- `.gitattributes`
- `prototype/full-agent-skeleton` 分支（只读参考，不得追加提交）
- Probe JSON Schema、Probe 退出码及任何 Phase 1 对外契约

Phase 1 接口问题只能记入独立文档（沿用 `docs/prototype/INTERFACE_RISKS.md` 机制的主线
对应物：在 `docs/PENDING_CONFIRMATIONS.md` 登记），禁止顺手修改 Phase 1 产物。

## 10. 实现治理

### 10.1 分支与提交

- 实现分支：`phase/02-readonly-agent`，自 main 当前 HEAD 创建；禁止直接向 main 提交实现。
- 提交信息前缀 `phase2: `；移植提交按 §0.3 注明来源与矩阵条目。
- **禁止** merge 或 cherry-pick 原型分支任何提交（§0.3）；只允许人工选择性移植。

### 10.2 里程碑提交顺序（冻结；每个里程碑满足 §7.3 门禁）

| 里程碑 | 提交内容 | 关键测试 |
|--------|----------|----------|
| M1 | `phase2: add unified test entry and phase1 baseline` — 统一入口 + `.bat` + Phase 1 发现基线冻结 | F40–F44 |
| M2 | `phase2: add core contracts and state machine` — models 契约、runtime/state、预算 | F01–F04, F45 |
| M3 | `phase2: add workspace boundary and readonly tools` — workspace、tools（registry/readonly/私有 Git 子进程）、policy | F05–F25 |
| M4 | `phase2: add event store and verification` — storage、verification | F26–F30, F36 |
| M5 | `phase2: add providers cli and analysis loop` — context、Mock/Replay、runtime/runner、cli、fixtures、演示脚本 | F31–F39 |
| M6 | `phase2: record python38 validation evidence` — 门槛终值、README 状态表、验证记录（§13 格式） | 全量 |

M1 边界与停止点（冻结）：

- M1 交付物仅限：`scripts/run_agent_tests.py`、`scripts/run_agent_tests.bat`、
  入口自身的单元测试（F40–F42）、Phase 1 回归加载与发现基线冻结（F44）、compileall
  入口（F43）、静态扫描与禁止路径零 Diff 的检查执行记录（§7.3），以及 M1 提交信息中的
  门槛基线记录（§7.2）。
- M1 **不得**提前实施任何 M2–M5 产物：models 契约、Runtime 状态机、workspace、
  只读工具、EventStore、Provider、CLI 闭环、Git 子进程实现均属后续里程碑。
- **每个里程碑完成后实现方必须停止**，等待架构师核对确认后方可进入下一里程碑；
  M1 完成后不得自动继续 M2。

### 10.3 角色与权限

- **Codex（实现方）**：仅在实现分支、仅 §8 白名单内实现；可将 `Phase-Gate` 置
  `IMPLEMENTING`；不得修改其他状态行、不得修改 §3 契约、不得新增依赖或错误码；
  发现设计缺陷时停止并报告，不得代行裁决。
- **Claude（架构师独立复审）**：复审范围 = §3 契约逐条符合性、§5 迁移矩阵执行情况
  （抽查移植来源标注）、§7 覆盖完整性、§9 禁止路径零 diff、安全纪律（C08–C11、ASCII、
  零网络）；复审产出记入本任务书新增章节；Gate 状态迁移仅架构师执行（§0.1 唯一例外除外）。
- **项目负责人**：批准 Gate 进入验证与验收环节；裁决矛盾上报。

### 10.4 Phase-Gate 状态机（冻结）

```
APPROVED_FOR_IMPLEMENTATION
  → IMPLEMENTING                      （实现方，开始 M1）
  → READY_FOR_PHASE_REVIEW            （架构师，M6 完成后）
  → REPAIR_REQUIRED | REVIEW_PASSED   （架构师复审裁决；REPAIR 后回到 IMPLEMENTING 修复）
  → READY_FOR_PYTHON38_VALIDATION     （架构师，复审通过）
  → PYTHON38_VALIDATED                （干净 CPython 3.8.10 验证档记录后）
  → READY_FOR_WIN7_VALIDATION         （等待 Win7 SP1 x64 环境）
  → PHASE_ACCEPTED | PHASE_REJECTED   （仅在 Win7 E1/E2 实机验收后可达）
```

- Win7 环境不可用期间，终点停在 `READY_FOR_WIN7_VALIDATION` +
  `Win7-Validation: NOT_PERFORMED`；**任何人不得在缺少 Win7 证据时置 `PHASE_ACCEPTED`**
  （AGENTS.md §5.8 硬门槛）。

## 11. 安全边界（对本阶段生效）

- 目标工作区全程只读；Agent 不监听端口、不发起网络连接、不写注册表、不要求管理员权限。
- EventStore 与报告只写用户显式指定路径或系统临时目录。
- 子进程仅 §3.7 固定 Git 命令 + 测试自用 `sys.executable`；全部受超时/截断/终止约束。
- 事件与日志不采集环境变量全量、不落真实凭据（SECURITY.md §3）。

## 12. 开放问题

无。本任务书为决策完备文本；实现中发现的缺陷回到本文档修订并补 ADR。

## 13. 验证记录格式（M6 及后续验证填写）

```
Implementation commit: <hash>
Gate commit: <hash>
Validation platform: <os>
Interpreter: CPython 3.8.10
Compileall: PASS|FAIL
Unified tests: <passed>/<total> (minimum <baseline>)
CLI demo: PASS|FAIL (RESULT status=..., trace_complete=..., exit=...)
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Target environment unavailable
```

Win7 验收完成前，上述 `Win7-*` 三行不得改写为任何"已通过"表述。

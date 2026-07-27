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
Phase-Gate: IMPLEMENTING
Review-Round: 1
Review-Status: REPAIR_REQUIRED
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Target environment unavailable
```

（2026-07-27 项目负责人批准创建本任务书与授权链；批准范围仅限 §8 白名单路径，
且实现只能发生在 `phase/02-readonly-agent` 分支上。`Phase-Gate` / `Review-Round` /
`Review-Status` / `Win7-*` 各行只能由架构师修改，仅有两个例外：其一，实现方开始首个
里程碑时可将 `Phase-Gate` 更新为 `IMPLEMENTING`；其二，在 §10.5 无人值守执行窗口内
完成 M6 且全部自动门禁通过后，实现方可将 `Phase-Gate` 更新为
`READY_FOR_PHASE_REVIEW`（仅此一个目标状态，见 §10.5.4）。Win7 实机验收前，
`Win7-Validation` 必须保持 `NOT_PERFORMED`，本阶段不得宣称 Win7 已通过。）

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
- Setup / Provider 装载错误（ADR-0026 冻结清单：replay CLI 必填参数缺失；数据库
  不存在或无法打开；SQLite/schema 不合法；没有可选择 Run；录制载荷损坏或无法
  反序列化；录制格式版本不受支持）→ `ProviderError` → CLI 退出码 3；
  可成功装载但与当前运行不匹配的一切情形均不属于本类。
- 录制时每个 `model.request` 保存 `request_fingerprint`：对消息序列、工具名清单与 turn 的
  确定性 JSON 序列化取 `hashlib.sha256`。
- 重放时验证 turn、请求指纹与请求响应配对；请求不一致、响应缺失、响应多余、顺序错误或
  录制耗尽均为 `REPLAY_MISMATCH` → Run FAILED → 退出码 1。
- 运行期不匹配判定含消费完整性检查（ADR-0026）：Run 正常结束前必须验证录制响应
  已全部消费，多余响应 → `REPLAY_MISMATCH` → 退出码 1；不得在初始化阶段把数量差异
  一律归为 setup 错误。
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

- CPython 3.8.10；所有 `.py` 在 CPython 3.8.10 解释器下通过 `-m compileall -q`
  （C02/C05）；解释器按 §7.3 的解析规则确定，不得假定其命令名固定为 `python3.8`。
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

1. 当前执行解释器门禁（无条件）：使用当前有效执行解释器（即实际调用统一测试入口
   的解释器）完成 `-m compileall -q src tests scripts`，结果必须零错误；不得假定
   解释器命令固定为 `python3.8`。
2. 统一入口全绿且不低于当前门槛。
3. 静态安全扫描（冻结范围与分类规则）：
   - 禁止模式至少包括：`shell=True`、`os.system`、`os.popen`、`subprocess.getoutput`、
     任意 Shell 执行、未授权网络调用、无 `encoding` 的文本 `open(`、
     WIN7_CONSTRAINTS §3 禁用的 Python 3.9+ 语法/API、目标工作区写操作。
   - 扫描范围：生产实现路径（`src/win7_agent/**` 与 `scripts/*.py` 生产脚本）中的
     禁止调用必须零命中；任何未经解释的生产实现命中即判定该项门禁失败
     （非零退出 / BLOCKED）。
   - 测试（`tests/**`）、夹具（`tests/fixtures/**`）与文档中用于验证禁止模式的字面
     字符串不构成生产违规，但必须逐条分类记录（文件、行号、类别、理由）并附入门禁
     执行记录；未分类的命中一律按失败处理。
   - 字符串零命中仅为必要条件：不得以简单字符串搜索零命中替代 §10.3 架构师复审中的
     安全纪律审查；本分类规则不弱化任何安全门禁。
4. `git diff` 确认未触碰 §9 禁止路径。

真实 CPython 3.8.10 门禁（条件门禁，解析规则冻结）：

- 可解析到真实 CPython 3.8.10 解释器时，必须使用该解释器执行
  `-m compileall -q src tests scripts`、`scripts/run_agent_tests.py` 及当前里程碑
  要求的其他 Python 3.8.10 验证，并全部通过。
- 候选解析顺序（必须依次主动检查，命中即用）：`.conda-py3810/bin/python`、
  `python3.8`、`py -3.8`、任务书或环境中其他可验证为 CPython 3.8.10 的实际路径；
  不得仅因 `python3.8` 不在 PATH 中即判定目标解释器不存在。当前开发机已知可能
  存在 `.conda-py3810/bin/python`，实现方必须主动检查该路径，不得直接跳过。
- 使用前必须执行 `<resolved-python> --version` 版本检查，实际输出为
  Python 3.8.10（CPython）方可作为目标解释器证据。
- 确实无法解析时：如实记录 `NOT_PERFORMED` 及已检查的候选路径/命令清单，不得
  伪造 PASS；已在该解释器下执行并通过时必须记录 PASS，不得记录 `NOT_PERFORMED`。
  是否允许继续后续里程碑按既有 Gate 规则执行（本项为条件门禁，目标解释器不可用
  本身不构成无条件阻塞）；正式 `READY_FOR_PYTHON38_VALIDATION` /
  `PYTHON38_VALIDATED` 仍仅由架构师按 §10.4 依据干净 CPython 3.8.10 验证档流转。

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
- **默认交互式执行时，每个里程碑完成后实现方必须停止**，等待架构师核对确认后方可
  进入下一里程碑；交互模式下 M1 完成后不得自动继续 M2。
- **唯一例外**：在 §10.5 授权的无人值守执行窗口内，且该里程碑的全部自动门禁
  （§10.5.2）通过时，实现方可不等待人工回复继续下一里程碑。无人值守授权**不等于**
  架构审查通过；实现方仍必须保持每里程碑独立提交与完整可审查性（§10.5.3）。
  本条不删除、不弱化交互模式，仅为其增加一个受 §10.5 严格约束的例外。

### 10.3 角色与权限

- **Codex（实现方）**：仅在实现分支、仅 §8 白名单内实现；可将 `Phase-Gate` 置
  `IMPLEMENTING`；在 §10.5 无人值守窗口内完成 M6 且门禁全绿后可将 `Phase-Gate` 置
  `READY_FOR_PHASE_REVIEW`（§10.5.4，仅此一个额外状态）；不得修改其他状态行、
  不得修改 §3 契约、不得新增依赖或错误码；发现设计缺陷时停止并报告，不得代行裁决。
- **Claude（架构师独立复审）**：复审范围 = §3 契约逐条符合性、§5 迁移矩阵执行情况
  （抽查移植来源标注）、§7 覆盖完整性、§9 禁止路径零 diff、安全纪律（C08–C11、ASCII、
  零网络）；复审产出记入本任务书新增章节；Gate 状态迁移仅架构师执行（§0.1 两个
  例外除外）。
- **项目负责人**：批准 Gate 进入验证与验收环节；裁决矛盾上报。

### 10.4 Phase-Gate 状态机（冻结）

```
APPROVED_FOR_IMPLEMENTATION
  → IMPLEMENTING                      （实现方，开始 M1）
  → READY_FOR_PHASE_REVIEW            （架构师；或实现方在 §10.5 无人值守窗口内
                                        完成 M6 且门禁全绿后，§10.5.4）
  → REPAIR_REQUIRED | REVIEW_PASSED   （架构师复审裁决；REPAIR 后回到 IMPLEMENTING 修复）
  → READY_FOR_PYTHON38_VALIDATION     （架构师，复审通过）
  → PYTHON38_VALIDATED                （干净 CPython 3.8.10 验证档记录后）
  → READY_FOR_WIN7_VALIDATION         （等待 Win7 SP1 x64 环境）
  → PHASE_ACCEPTED | PHASE_REJECTED   （仅在 Win7 E1/E2 实机验收后可达）
```

- Win7 环境不可用期间，终点停在 `READY_FOR_WIN7_VALIDATION` +
  `Win7-Validation: NOT_PERFORMED`；**任何人不得在缺少 Win7 证据时置 `PHASE_ACCEPTED`**
  （AGENTS.md §5.8 硬门槛）。

### 10.5 无人值守执行窗口（Unattended execution window，一次性授权）

（**状态：已失效**。2026-07-27 本窗口随 M6 完成且 `Phase-Gate` 置
`READY_FOR_PHASE_REVIEW` 按 §10.5.6 自动失效；不得恢复或复用。审查轮 1 修复窗口
另见 §10.6，与本窗口无继承关系。以下原文保留供审计。）

（2026-07-27 项目负责人授权。本节为本次 Phase 2 实施的**一次性**无人值守执行授权，
仅适用于 `phase/02-readonly-agent` 分支上的 M1–M6 实施；不构成对后续阶段、其他分支或
其他任务的任何授权先例。无人值守授权**不替代**架构师独立复审、CPython 3.8.10 验证与
Win7 实机验收；全部既有门禁与硬约束（AGENTS.md C01–C14、本任务书 §2/§3/§8/§9）
在窗口内继续全部生效。）

#### 10.5.1 授权范围

本次 Phase 2 实现允许 Codex 在一次无人值守执行窗口中，按依赖顺序连续实施：

```
M1 → M2 → M3 → M4 → M5 → M6
```

不得跳过、不得乱序、不得并行实施多个里程碑。

#### 10.5.2 自动继续的前提（每个里程碑必须全部满足，缺一即停）

1. 改动严格处于该里程碑对应的 §8 白名单范围内（M1 同时受 §10.2 M1 边界约束）；
2. 该里程碑的目标测试（§10.2 关键测试列对应 F 编号）全部通过；
3. 统一入口全量测试（§7.2）全绿；
4. 实际执行测试数不低于当前冻结门槛（§7.2，门槛只升不降）；
5. 使用当前有效执行解释器完成 `-m compileall -q src tests scripts`，结果必须零错误；
   不得假定解释器命令固定为 `python3.8`（§7.3.1，无条件门禁）；
6. 按 §7.3.3 冻结范围执行静态安全扫描；生产实现中的禁止调用必须零命中。
   测试、夹具和文档中用于验证禁止模式的字面字符串必须按 §7.3.3 分类，
   不得因简单字符串搜索产生误判，也不得将零字符串命中替代完整安全审查；
7. `git diff --check` 通过；
8. §9 禁止路径零 Diff（§7.3.4）；
9. 可解析到真实 CPython 3.8.10 解释器时（按 §7.3 冻结的候选解析顺序与
   `--version` 检查主动解析，含 `.conda-py3810/bin/python`；不得仅因 `python3.8`
   不在 PATH 中即判定不存在），对应验证（compileall + 统一入口及当前里程碑要求的
   其他 Python 3.8.10 验证）在该解释器下通过；确实无法解析时按 §7.3 如实记录
   `NOT_PERFORMED` 与已检查候选清单，不得伪造 PASS（条件门禁）；
10. 不存在任何需要架构师裁决的新问题（含设计缺陷、契约歧义、§12 之外的开放问题）。

上述 10 项全部通过时，不再要求 Codex 在该里程碑后等待人工回复，可直接继续下一里程碑。

#### 10.5.3 每个里程碑的强制动作（无人值守不豁免）

- 形成独立 Commit，**禁止**将多个里程碑压缩为一个提交；
- 使用 §10.2 冻结的提交信息（含 `phase2: ` 前缀与移植来源标注，§0.3）；
- 推送到 `phase/02-readonly-agent`（仅常规 push；禁止 force push）；
- 在提交信息或随提交记录中记录：测试总数、当前门槛、各项门禁验证结果；
- 完成后重新读取下一里程碑的 §10.2 范围与 §8 白名单，再开始实施。

#### 10.5.4 最终状态边界（冻结）

窗口内 Codex **可以**：

- 开始实施时将 `Phase-Gate` 从 `APPROVED_FOR_IMPLEMENTATION` 更新为 `IMPLEMENTING`；
- 完成 M1–M6 且全部自动门禁通过后，将 `Phase-Gate` 更新为 `READY_FOR_PHASE_REVIEW`；
- 按 §13 格式填写客观验证证据（提交哈希、平台、测试计数、compileall 结果等）。

窗口内 Codex **禁止**设置以下任何状态（均仅限架构师/项目负责人按 §10.4 流转）：

- `REVIEW_PASSED`、`REPAIR_REQUIRED`
- `READY_FOR_PYTHON38_VALIDATION`、`PYTHON38_VALIDATED`
- `READY_FOR_WIN7_VALIDATION`
- `PHASE_ACCEPTED`、`PHASE_REJECTED`

独立复审仍必须由 Claude（架构师）与项目负责人完成；`Review-Round` / `Review-Status`
各行 Codex 不得触碰。Win7 状态三行在窗口内必须保持不变：

```
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Target environment unavailable
```

#### 10.5.5 强制停止条件（遇任一即停）

1. 任务书存在歧义或契约冲突（含 §3 内部、§3 与 AGENTS.md/WIN7_CONSTRAINTS 之间）；
2. 需要修改当前里程碑白名单外的文件；
3. 需要修改 Phase 1 代码、测试或接口（§9；只能登记 `docs/PENDING_CONFIRMATIONS.md`）；
4. 需要修改已 Accepted ADR；
5. 需要作出任务书未冻结的架构决策；
6. 目标测试或全量测试失败，且无法在当前里程碑白名单内解决；
7. 实际执行测试数相对已冻结门槛下降；
8. 只能通过删除、跳过（skip）或弱化断言来使测试通过；
9. 发现安全边界问题（§11、SECURITY.md 范畴，含越权读写、网络行为、凭据落盘）；
10. 发现 Python 3.8.10 不兼容（语法、标准库 API 或行为差异）；
11. 发现必须依赖 Win7 实机结果才能继续的决策点；
12. 本地分支、远程分支或工作区状态异常（含非预期提交、脏工作区、分支偏离）；
13. 需要 force push、历史重写或整体合并原型分支（§0.3 绝对禁止）。

停止时必须：

- 不提交失败或不完整的实现；
- 保留最后一个已通过全部门禁并已推送的里程碑 Commit 作为可审查基线；
- 输出 BLOCKED 报告：触发的停止条件编号、完整事实描述、最后通过的里程碑与提交哈希、
  未完成的里程碑清单、当前测试计数与门槛；
- 不继续任何后续里程碑，等待架构师裁决。

#### 10.5.6 窗口失效

本窗口在以下任一情形后自动失效，后续恢复 §10.2 默认交互模式：

- M6 完成且 `Phase-Gate` 置为 `READY_FOR_PHASE_REVIEW`；
- 触发 §10.5.5 任一停止条件；
- 架构师或项目负责人以任何方式介入并取消授权。

后续如需再次无人值守执行（例如 REPAIR_REQUIRED 后的修复轮），必须由项目负责人
重新授权并修订本节，不得沿用本次一次性授权。

### 10.6 审查轮 1 修复窗口（Review Round 1 Repair Window，一次性授权）

（2026-07-27 项目负责人授权，依据 §14 审查轮 1 裁决 REPAIR_REQUIRED 与 ADR-0026。
本窗口为**一次性**授权，仅允许处理审查报告 R-01～R-17（§14.2）；不得恢复或复用
已失效的 §10.5 窗口，不得重新开放 M1–M6 全量范围。修复窗口基线：
`f266d183be8f5cb5e0c2a791de480a10af8ba457`。）

#### 10.6.1 修复顺序（冻结，2026-07-27 修订）

（顺序修订说明：原冻结顺序 RP1→RP2→RP3→RP4→RP5→RP6 存在执行死锁——每个 RP 的
§10.6.9 门禁要求直接运行裸命令 `<python> scripts/run_agent_tests.py`，而审查轮 1
已独立证明：在修复基线 `f266d18` 上，未设置 PYTHONPATH 时该裸命令因
`No module named 'win7_agent'` 必然失败（R-05）；修复该缺陷的合同恰是 RP4，且
RP1 不得提前实施 RP4 内容，导致第一个修复包无法合法完成。为消除该死锁，本次
修订将 RP4 提前为首个执行包。Repair ID 与 R 编号映射保持不变，不重命名任何 RP；
各 RP 白名单、禁止路径与完成标准不变；不降低任何测试或安全门槛；不扩大任何允许
修改路径；不改变 R-01～R-17 的修复范围与最终 Gate 状态。该顺序调整**不代表**
RP4 的缺陷级别高于 BLOCKER（R-01/R-02 仍为本轮最高级别缺陷），仅代表 RP4 是
后续自动验证的执行依赖。）

```
RP4 unified test entry and evidence reproducibility   (bootstrap)
  → RP1 EventStore runtime failure
  → RP2 Replay recording and replay completion
  → RP3 Replay error taxonomy and CLI setup errors
  → RP5 runner retry and policy-denial observation
  → RP6 coverage completion, demo launcher and evidence correction
  → final repair verification
  → READY_FOR_PHASE_REVIEW
```

RP4 是本轮修复窗口**唯一**允许优先执行的基础设施（bootstrap）修复包；除本节
冻结的这一处顺序调整外，其余任何 RP 不得提前、乱序或并行。每个 RP 必须：
独立 Commit（前缀 `phase2: repair-r1 `）、推送到 `phase/02-readonly-agent`、
全量测试通过（§10.6.9 门禁）后才能继续下一个 RP；禁止将多个 RP 压缩为一个提交。

#### 10.6.2 RP1 — EventStore 运行期故障（R-02 / F27，BLOCKER）

允许修改：`src/win7_agent/runtime/state.py`、`src/win7_agent/runtime/runner.py`、
`tests/unit/runtime/test_runner.py`、必要的 CLI 集成测试（`tests/integration/agent/**`）。

要求：

- 持续性 EventStore append 故障不得以未结构化异常逃逸；
- RunResult 为 FAILED，错误码 `EVENT_STORE_FAILED`，`trace_complete=false`；
- CLI 退出码 1，RESULT 行仍输出（§3.8 阶段 2）；
- 再次写审计事件失败时，结构化错误必须保留在内存 errors 中，不得静默丢弃。

#### 10.6.3 RP2 — Replay 录制与重放闭环（R-01 / F31，BLOCKER）

允许修改：`src/win7_agent/runtime/runner.py`、`src/win7_agent/models/provider.py`、
`tests/unit/models/test_provider.py`、`tests/integration/agent/test_cli.py`。

要求（Replay 载荷修复原则，冻结）：

- `model.response` 事件必须记录重放所需的完整 vendor-neutral `ModelResponse`，
  至少包括 `content`、`tool_calls`、`finish_reason` 与正式允许的 metadata；
- `schema_version` 仍为 1，不新增事件类型；本项属修复既有 Replay 契约（§3.9 /
  ADR-0026），不需另建 ADR；
- 超过 EventStore 载荷预算时不得静默截断后仍声明可重放，必须产生结构化
  不可重放结果或失败；
- 录制 COMPLETED 后，同任务、同工作区重放必须 COMPLETED / 退出码 0，新增
  正常录制→重放终态一致测试；`tool_calls`、`finish_reason` 等正式字段可重建；
- 原名为 F31 但实际只测试 Mock 主链路的测试必须更正命名与 F 映射。

#### 10.6.4 RP3 — Replay 错误分类与 CLI setup 错误（R-03、R-04、R-09 / F32–F35、F37）

允许修改：`src/win7_agent/models/provider.py`、`src/win7_agent/cli/__main__.py`、
`tests/unit/models/test_provider.py`、`tests/unit/cli/**`、
`tests/integration/agent/test_cli.py`。

要求（按 ADR-0026）：

- 缺少 `--replay-from` → setup 错误 / 退出码 3，无 traceback；
- 数据库不存在 / 坏 schema → 退出码 3；
- 响应耗尽 → `REPLAY_MISMATCH` / FAILED / 退出码 1；
- 响应缺失 → `REPLAY_MISMATCH` / FAILED / 退出码 1；
- 多余响应 → Run 完成前消费完整性检查失败，退出码 1；
- 指纹不匹配 → 退出码 1；
- 上述每个场景均新增独立测试（F32–F35 逐项对应，F37 退出码全覆盖补齐）。

#### 10.6.5 RP4 — 统一测试入口与证据可复现性（R-05、R-17 / F40–F43，bootstrap，首个执行）

（按 §10.6.1 修订顺序，RP4 作为 bootstrap 包首个执行。内容边界保持最小：仅允许
处理 R-05（统一测试入口无法裸命令运行）与 R-17（历史验证证据夸大或不可按原命令
复现），**不得**实现 RP1、RP2、RP3、RP5、RP6 的任何内容。）

允许修改：`scripts/run_agent_tests.py`、`tests/unit/runtime/test_run_agent_tests.py`、
本任务书 §13 验证记录追加区。

要求：

- `scripts/run_agent_tests.py` 必须自行解析仓库根目录，并在测试发现前将
  `<repo>/src` 加入 `sys.path`，不得依赖外部 PYTHONPATH；
- `<python> scripts/run_agent_tests.py` 在没有 PYTHONPATH 的干净环境中直接运行：
  当前解释器与 `.conda-py3810/bin/python`（真实 CPython 3.8.10）均须裸命令通过；
- 必须新增测试：验证外部环境未设置 PYTHONPATH 时统一入口仍能导入 `win7_agent`；
- 不得修改 Phase 1（§9）；
- 旧提交与旧验证记录不得重写，只能追加纠正记录：新验证记录如实记录真实命令与
  结果，并以书面记录明确纠正旧提交信息中的证据夸大（§14.4），不修改旧提交历史；
- RP4 完成后形成独立 Commit 并推送（§10.6.1 通则）。

RP4 门禁（bootstrap 前后区分，冻结）：

- RP4 修改前的裸命令失败是已知审查缺陷（R-05），**不作为**修复窗口的启动阻断；
- RP4 实现完成后，必须以裸命令（§10.6.9 两组命令，无 PYTHONPATH）验证通过，
  才能提交 RP4 并继续 RP1；
- **不得**以 `PYTHONPATH=src` 环境下的运行结果作为 RP4 的完成证据。

#### 10.6.6 RP5 — Runner 重试与 DENY 观察回传（R-06、R-07 / F01、F21）

允许修改：`src/win7_agent/runtime/runner.py`、`tests/unit/runtime/test_runner.py`。

要求：

- Verification REJECT 且预算仍可继续时，执行 VERIFYING→EXECUTING 重试（§3.1）；
  预算耗尽时 FAILED；
- DENY 观察以结构化结果加入下一轮模型请求（§3.5）；DENY 后允许继续只读分析
  并完成；
- 上述各路径增加独立测试。

#### 10.6.7 RP6 — 覆盖补齐、演示启动器与证据纠正（R-08、R-10～R-16）

允许修改：`tests/unit/runtime/test_runner.py`、`tests/unit/models/test_provider.py`、
`tests/unit/context/test_compiler.py`、`tests/unit/cli/**`、
`tests/integration/agent/test_cli.py`、`tests/unit/tools/test_readonly.py`、
`scripts/run_analysis_demo.bat`；`src/win7_agent/runtime/runner.py` 仅限处理 R-12；
`src/win7_agent/tools/readonly.py` 仅限处理 R-13；本任务书 §13 验证记录追加区。

要求：

- F28、F34 独立测试；F26 CLI 退出码 3 且无 RESULT 行；F30 RESULT 行与
  `trace_complete` 权威性；F37 退出码 0/1/2/3 全覆盖；F38 RESULT 完整字段与
  Run 未建立时不输出；F24 executed=false 规则侧；F45 context 与 Replay 等价断言；
  F09 特殊路径与 Replay URI；F12 非 UTF-8 编码；F13 `start<1`；F16 500 字符
  行截断；
- 补 `scripts/run_analysis_demo.bat`：CRLF、cmd 兼容、PYTHONPATH 自包含、
  退出码透传；
- 非 Replay 的 RunFailure 不得统一标记 `REPLAY_MISMATCH`（R-12）；
- 删除未经授权的 `read_file_range` 500 行硬上限（R-13，§3.7 无此约束）；
- 不修改、不弱化既有测试。

#### 10.6.8 禁止范围（对本窗口全程生效）

- Phase 1 全部路径（§9）；已有 Accepted ADR 正文；原型任务书与原型文档；
- `workspace`、`policy`、`verification`、`storage`、`tools/registry`、
  `tools/subproc`、`tools/contracts`、`models/contracts`，除非上述 RP 明确列入；
- 既有测试断言不得删除、skip 或弱化；
- 不得整体 merge / cherry-pick 原型分支；不得引入网络、写工具、通用 Shell 或
  通用 Runner；不得开始 Phase 3。

#### 10.6.9 自动门禁（每个 RP 提交前必须全部通过）

当前解释器：

```
<current-python> -m compileall -q src tests scripts
<current-python> scripts/run_agent_tests.py
<current-python> scripts/run_agent_tests.py --static-scan
```

真实 CPython 3.8.10：

```
.conda-py3810/bin/python -m compileall -q src tests scripts
.conda-py3810/bin/python scripts/run_agent_tests.py
.conda-py3810/bin/python scripts/run_agent_tests.py --static-scan
```

同时：`git diff --check` 通过；当前 RP 白名单检查；§9 禁止路径零 Diff；测试数量
只升不降；0 tests / ImportError / 不可读目录 / 失败非零保护继续通过；
Replay record→replay Demo COMPLETED / 退出码 0（RP2 起）；Mock CLI Demo
COMPLETED / 退出码 0；工作区干净；本地与远程同步。

裸命令生效边界（与 §10.6.1 修订顺序配套，冻结）：

- 本节所有命令均为**裸命令**，不设置 PYTHONPATH；
- RP4（首个执行包，bootstrap）实现完成前，裸命令失败是已知审查缺陷（R-05），
  不作为修复窗口的启动阻断；RP4 自身必须以修复后的裸命令通过本节门禁方可提交
  （见 §10.6.5 RP4 门禁）；
- 自 RP1 起（即 RP4 之后的全部修复包 RP1、RP2、RP3、RP5、RP6），本节裸命令门禁
  **无条件**生效，不得再以设置 `PYTHONPATH=src` 的方式规避入口问题。

#### 10.6.10 状态边界（冻结）

- 开始修复时允许：`Phase-Gate: REPAIR_REQUIRED → IMPLEMENTING`；
- 全部 RP 完成并通过 §10.6.9 门禁后允许：`Phase-Gate: IMPLEMENTING →
  READY_FOR_PHASE_REVIEW`；
- 禁止设置：`REVIEW_PASSED`、`READY_FOR_PYTHON38_VALIDATION`、
  `PYTHON38_VALIDATED`、`READY_FOR_WIN7_VALIDATION`、`PHASE_ACCEPTED`、
  `PHASE_REJECTED`；`Review-Round` / `Review-Status` 各行修复方不得触碰；
- Win7 三行保持不变（`PROVISIONAL` / `NOT_PERFORMED` /
  `Target environment unavailable`）；
- 本窗口在全部 RP 完成、触发任一 §10.5.5 同款停止条件（按本窗口范围适用）或
  架构师/项目负责人介入后自动失效；失效后恢复默认交互模式。

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
Current interpreter: <command or path> (<version>)
Compileall (current interpreter): PASS|FAIL
Unified tests (current interpreter): <passed>/<total> (minimum <baseline>)
CPython 3.8.10 interpreter: <resolved path> | NOT_RESOLVED (checked: <candidate list>)
Compileall (CPython 3.8.10): PASS|FAIL|NOT_PERFORMED
Unified tests (CPython 3.8.10): <passed>/<total> | NOT_PERFORMED
CLI demo: PASS|FAIL (RESULT status=..., trace_complete=..., exit=...)
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Target environment unavailable
```

填写规则：`CPython 3.8.10` 各行按 §7.3 真实 CPython 3.8.10 门禁填写——解析失败时如实
记 `NOT_RESOLVED`/`NOT_PERFORMED` 并列出已检查候选，不得伪造 PASS；已在该解释器下
执行并通过时必须记 PASS，不得记 `NOT_PERFORMED`。本记录仅为客观证据；
`READY_FOR_PYTHON38_VALIDATION` / `PYTHON38_VALIDATED` 的流转仍仅由架构师按 §10.4
执行，不因本记录自动发生。

Win7 验收完成前，上述 `Win7-*` 三行不得改写为任何"已通过"表述。

### M6 unattended validation record (2026-07-27)

```
Implementation commit: d82d4eee72f8a1b620b94903f3bda1f1bf125969
Gate commit: pending final state commit
Validation platform: macOS development environment
Current interpreter: python3 (Python 3.9.6)
Compileall (current interpreter): PASS
Unified tests (current interpreter): 60/60 (minimum 60)
CPython 3.8.10 interpreter: .conda-py3810/bin/python (Python 3.8.10)
Compileall (CPython 3.8.10): PASS
Unified tests (CPython 3.8.10): 60/60
CLI demo: PASS (RESULT status=COMPLETED, trace_complete=true, exit=0)
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Target environment unavailable
```

Static production scan: PASS.  The only literal matches for network-module
names are the scanner's own rule strings in `scripts/run_agent_tests.py`; they
are not imports or runtime calls.  Phase 1 code and tests have zero diff from
the unattended baseline.  The prototype branch was not merged or cherry-picked.

### Review Round 1 RP4 bootstrap evidence correction (2026-07-27)

RP4 is the first package authorized by §10.6.1.  It corrects R-05 by making
`scripts/run_agent_tests.py` resolve the repository source root itself, before
discovery/import, so the documented bare commands do not depend on an external
`PYTHONPATH`.  The new record uses those bare commands for both interpreters.

The historical 60/60 count remains a factual execution snapshot only.  It did
not demonstrate F01--F45 coverage, and the old command form did not provide a
self-contained test-entry import path.  Later RP records supersede its coverage
claims without rewriting historical commits or records.

## 14. Review Round 1 Findings（2026-07-27，架构师独立复审）

### 14.1 审查基线与裁决

```
Review baseline: 3fb620d5e2c73dd4dae5daf051ed38153dfaf257
Review HEAD:     f266d183be8f5cb5e0c2a791de480a10af8ba457
Gate recommendation: REPAIR_REQUIRED
Adopted: Phase-Gate REPAIR_REQUIRED / Review-Round 1 / Review-Status REPAIR_REQUIRED
```

审查方式：提交链逐 Commit 白名单核对、F01–F45 逐项证据矩阵、双解释器复跑、
CLI Demo 复跑、静态安全审查。Phase 1 路径零 Diff；未发现整体 merge /
cherry-pick 原型分支。

### 14.2 问题清单 R-01～R-17（严重级别冻结）

| ID | 级别 | F 关联 | 问题摘要 | 修复合同 |
|----|------|--------|----------|----------|
| R-01 | BLOCKER | F31 | `model.response` 事件未记录完整可重放 ModelResponse，录制→重放闭环无法达成；现有 F31 命名测试实测 Mock 主链路 | RP2 |
| R-02 | BLOCKER | F27 | 持续性 EventStore append 故障未按 §3.8 阶段 2 处置（FAILED + `EVENT_STORE_FAILED` + `trace_complete=false` + 退出码 1），无独立测试 | RP1 |
| R-03 | HIGH | F32–F33 | Replay 响应耗尽/缺失/多余无独立测试，多余响应无消费完整性检查 | RP3 |
| R-04 | HIGH | F35、F37 | Replay setup 错误（缺 `--replay-from`、库不存在、坏 schema）未统一归退出码 3，无独立测试 | RP3 |
| R-05 | HIGH | F40–F43 | 统一入口依赖外部 PYTHONPATH，裸命令不可复现，证据链可复现性不成立 | RP4 |
| R-06 | MEDIUM | F01 | VERIFYING→EXECUTING 重试转换（§3.1 表行）未实现/未测试 | RP5 |
| R-07 | MEDIUM | F21 | DENY 观察未以结构化结果回传下一轮模型请求，DENY 后继续路径未证明 | RP5 |
| R-08 | MEDIUM | F28 | 仅收尾（finalize）失败的阶段 3 故障无独立测试 | RP6 |
| R-09 | MEDIUM | F34、F37 | 指纹不匹配无独立测试；退出码 0/1/2/3 未全覆盖 | RP3 |
| R-10 | MEDIUM | F26、F30 | 阶段 1 故障（退出码 3 且无 RESULT 行）与 `trace_complete` 权威性无直接断言 | RP6 |
| R-11 | MEDIUM | F24、F38 | executed=false 规则侧与 RESULT 行完整字段/未建立不输出无测试 | RP6 |
| R-12 | LOW | F27/F32 边界 | 非 Replay 的 RunFailure 被统一标记 `REPLAY_MISMATCH`，错误码归因失真 | RP6 |
| R-13 | LOW | F10/F13 边界 | `read_file_range` 存在未经授权的 500 行硬上限（§3.7 无此约束） | RP6 |
| R-14 | EVIDENCE_GAP | F09、F12、F13、F16 | 特殊路径/非 UTF-8 编码/`start<1`/500 字符行截断仅部分覆盖 | RP6 |
| R-15 | MEDIUM | §8 M5 交付物 | `scripts/run_analysis_demo.bat` 缺失 | RP6 |
| R-16 | EVIDENCE_GAP | F45 | context 与 Replay 移植项缺语义等价断言 | RP6 |
| R-17 | EVIDENCE_GAP | F26–F31 证据 | 旧提交信息宣称 "F26-F31 PASS" 与实际测试证据不符（见 §14.4） | RP4 |

级别汇总：BLOCKER = R-01、R-02；HIGH = R-03、R-04、R-05；MEDIUM = R-06、R-07、
R-08、R-09、R-10、R-11、R-15；LOW/EVIDENCE_GAP = R-12、R-13、R-14、R-16、R-17。

### 14.3 裁决与后续路径

- 本轮裁决：`REPAIR_REQUIRED`；修复按 §10.6 一次性修复窗口执行（执行顺序按
  §10.6.1 2026-07-27 修订冻结为 RP4→RP1→RP2→RP3→RP5→RP6，RP4 为 bootstrap 包）。
- 修复完成后 Gate 至多回到 `READY_FOR_PHASE_REVIEW`，进入审查轮 2；
  `REVIEW_PASSED` 及以后状态仍仅由架构师/项目负责人按 §10.4 流转。
- Win7 硬门槛不变：本轮及修复轮均不构成 Win7 验收证据。

### 14.4 证据纠正声明（冻结）

实施提交链中的旧提交信息（含 M4 `d0a821e`、M5 `d82d4ee` 等宣称 "F26-F31 PASS"
的记录）**不得视为有效最终证据**：经独立复审，F27、F28、F31（Replay 闭环口径）、
F32–F35 均无充分独立测试证据，相应 PASS 宣称属证据夸大。本声明为正式纠正记录，
不修改旧提交历史；后续一切证据引用以 §10.6 修复窗口产出的新验证记录为准。
§13 既有 "M6 unattended validation record" 保留作为历史快照，其中测试计数
（60/60）为真实执行结果，但不构成 F01–F45 全覆盖证明。

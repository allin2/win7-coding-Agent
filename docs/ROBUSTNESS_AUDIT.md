# win7-coding-agent 健壮性与交互审计

- **复核日期**：2026-07-31
- **审计基线**：历史候选工作树；当前状态见 [`STATUS.md`](STATUS.md)
- **授权任务**：`docs/tasks/INTEGRATION_01_ROBUSTNESS_HARDENING.md`
- **决策依据**：ADR-0029、ADR-0030、ADR-0036、ADR-0037、ADR-0038、ADR-0039、ADR-0040、ADR-0042、ADR-0045、ADR-0051
- **Win7 实机状态**：`NOT_PERFORMED`

## 1. 结论先行

当前代码已经从“分散阶段分支 + 生成物残留”整理为可追溯的 Phase 3–7 整合基线。
已复现的无限重试、流截断误报成功、WAL 部分提交、backlog 丢事件、IPC 静默异常、
Updater 误导性回滚和结构化 argv 误拒绝等问题已经修复，并增加回归测试。

Agent 设计修复后，需要同时保留两个不同结论：

- **源码健壮性：B+（历史开发机代理证据）**。历史候选工作树曾完成模块类型检查、构建和回归；
  精确测试数量不在本风险登记表重复维护，统一引用 [`status/latest-validation.json`](status/latest-validation.json)。Core 已具备显式
  依赖注入的单 Agent 纵向闭环，完成态、审批、写入和 Git 执行入口均为 fail-closed。
- **产品交付状态：MVP ENTRY VERIFIED / FORMAL RELEASE NOT READY**。最小 Electron
  main/preload/renderer 已在 Win7 完成启动、诊断和退出 smoke；完整五视图、跨模块产品装配、
  真实 Runner/containment、SPIKE 正式 Gate 和 Win7 正式端到端证据仍未完成。

旧报告给出的“C、59 项问题”不能继续作为事实基线：其中包含分支视角误判、引用不存在
路径、重复计数和与项目约束相反的建议。本版只保留可定位、可复现或能明确证明缺口的结论。

## 2. 审计方法与源码范围

### 2.1 权威来源

| 组件 | 权威分支/提交 | 整合方式 |
|---|---|---|
| Phase 2 legacy | `phase/02-readonly-agent` / `fd40ad2` | 不合并实现；保留契约、测试与验证标签 |
| Gateway | `phase/03-model-gateway` / `f011e18` | 由 Phase 4/6 祖先历史继承 |
| Workspace | `phase/04-workspace-write` / `1afa6bf` | 由 Phase 6 祖先历史继承 |
| State/Audit | `phase/05-state-audit` / `7a10d51` | 保留历史合并 |
| Core/Runner/Git | `phase/06-agent-core-runner` / `ebdb1d8` | 整合分支基点 |
| Desktop Shell | `phase/07-desktop-shell` / `ecd8b67` | 保留历史合并 |

Phase 5、6、7 是从 Phase 4 分出的并行分支。任何一个阶段分支的工作树都不会同时出现
全部模块；“当前目录没有源码”不能直接推导为“仓库源码丢失”。

### 2.2 证据等级

- **Verified**：已复现，修复后有自动化回归。
- **Open**：源码检查确认仍存在，且当前授权内未完成。
- **Blocked**：需要 Win7、企业网络或原生依赖证据，当前环境不能诚实关闭。
- **Incorrect**：旧报告结论引用错误分支、不存在路径或错误技术前提。

## 3. 已修复问题

| ID | 原问题与用户影响 | 修复结果 | 主要回归证据 |
|---|---|---|---|
| R-01 | Gateway 重试控制器忽略用户配置，重连时重置计数并递归 `send`，请求可无限等待 | 改为循环、有界次数和总时限；耗尽返回 `GATEWAY_UNREACHABLE` | bounded retry 测试 |
| R-02 | Provider 默认使用 Mock 网络栈，正常调用会得到伪响应后解码失败 | 默认使用 Node HTTPS 栈；Mock 只允许显式测试注入 | Provider 全套测试 |
| R-03 | Provider 声称 TLS 1.2/验签，但注入网络栈可关闭验证或使用明文 | Provider 拒绝非 HTTPS；Node 栈拒绝关闭证书验证和 TLS 1.2 以下配置 | TLS fail-closed 测试 |
| R-04 | HTTP 401/407/429/5xx 被当作普通正文解码 | 映射为认证、代理认证、限流和服务端结构化错误 | Transport 状态映射 |
| R-05 | SSE 使用 `trim()` 吞掉文本首空格，跨 chunk 事件无法可靠解析 | 仅移除 SSE 规定的一个可选空格；增量缓冲完整事件 | `" World"` 与跨块测试 |
| R-06 | 流没有 `done` 仍合成 `finishReason=stop`，用户看到错误成功 | 没有完成信号返回 `STREAM_INTERRUPTED`；`[DONE]` 才允许合成完成 | truncated stream 测试 |
| R-07 | 协议协商函数未使用，`99.0.0` 响应可被接受；必填字段缺失降级为空串 | 响应必须携带兼容 `protocolVersion`，并校验 id/content/finish reason | incompatible version 测试 |
| R-08 | 全局 data/error listener 导致并发请求串线；断开不取消在途请求 | 事件按 request id 隔离；增加 AbortController、`cancel` 与 disconnect 传播 | 并发边界/取消测试 |
| R-09 | Node 栈收完整响应后才交付，所谓“流式”只是整包回调 | 使用 `StringDecoder` 按 UTF-8 chunk 交付；流式路径不缓存整包正文 | HTTP/UTF-8 测试 |
| R-10 | API key 放入 JSON 请求体，容易进入网关业务日志或录制数据 | 凭据改走 Authorization header；payload 与重试跟踪不再保存 key；拒绝控制字符 | Provider header/payload 断言 |
| R-11 | WAL 逐条 append，中途失败却标记 rolled back，前序事件仍可见 | `appendBatch` 先完整校验再发布；失败后 store 为零写入 | atomic WAL 测试 |
| R-12 | backlog 先 `shift` 再 append，失败事件永久丢失 | 原子批量 append 成功后才清队列；失败可无损重试 | failed drain 测试 |
| R-13 | EventStore 无容量上限、按字符而非 UTF-8 字节计预算、约束异常多为泛型 Error | 增加容量上限、UTF-8 字节预算和结构化 `StateError` | capacity/UTF-8 测试 |
| R-14 | UI/Policy 把参数中的 `|`、`;`、`$()` 都当 Shell 注入，合法文件名和搜索式被拒 | 结构化 argv 将其视为数据；真正拒绝 Shell 宿主和 commandLine/script 字符串 | Runner/Policy 测试 |
| R-15 | 类型层暴露 `FULL_ACCESS`，与 ADR-0030 的产品承诺冲突 | 本地枚举仅保留 read-only/workspace-write；外部 `full_access` fail-closed | Approval 测试 |
| R-16 | 未验证 containment 时可能诱导继续实现普通 `child_process` Runner | 新增 `UnavailableRunner`，在 SPIKE_02 前返回可操作的能力不可用错误 | fail-closed 测试 |
| R-17 | IPC 同步 API 可调用 async handler 并提前报告成功；listener 异常静默吞掉 | 同步/异步误用返回明确错误；异常进入有界诊断记录并可订阅 | IPC channel 测试 |
| R-18 | 审批只绑定 task/approval id，预览变化后仍可能沿用批准 | IPC v1 增加 plan/preview/base hash 与精确 targets；diff 明示编码/EOL/截断 | IPC Schema 测试 |
| R-19 | Updater 未强制先校验就应用，逐文件混合替换，失败文案总称“已回滚” | 流式 SHA-256、payload 绑定、同卷目录切换；状态区分 not_applied/rolled_back/rollback_failed | Updater 测试 |
| R-20 | Jest `--forceExit` 隐藏资源泄漏；各模块验证入口分散 | 移除强制退出；根级 `npm run verify` 输出失败模块和下一步 | 7 模块整合验证 |
| R-21 | Core 缺少可执行的单 Agent 纵向 Loop，模块之间只有孤立接口 | 新增显式依赖注入 Runtime，贯通计划、上下文、ToolSpec、Policy、执行、事件和验证；无隐式生产 Mock | Runtime 正常/拒绝/失败测试 |
| R-22 | `EXECUTING` 可直接进入 `COMPLETED`，没有可复算的完成证据 | 增加 `VERIFYING` 与 `VerificationGate`；只有版本化 `EvidenceBundle` 通过才允许完成 | 状态机与证据门负向测试 |
| R-23 | 能力令牌可宽泛授权写操作，未绑定具体会话、请求、预览与基线 | Broker/Policy 绑定全部审批维度；无验证器、跨会话、内容漂移、过期与重放均拒绝 | Broker/Policy/Runner 审批测试 |
| R-24 | Workspace Apply 没有强制根目录，缺失目标的祖先 reparse 与回滚失败语义不完整 | 强制显式 workspace root，多阶段 realpath/reparse 复核，回滚状态和错误单独返回 | 越界、祖先 symlink、回滚失败测试 |
| R-25 | Git Adapter 可直接启动 `child_process`，绕过 Runner/containment | 删除直接进程能力，只接受注入 Runner；未装配 Runner 或写审批时 fail-closed | Adapter 映射/失败测试 + 静态门 |
| R-26 | 事件缺少稳定 Run/Thread 身份与 Session 顺序，重试可能重复写或覆盖冲突内容 | 增加关联 ID/sequence；同 ID 同内容幂等，冲突内容拒绝 | State 顺序、幂等、冲突测试 |
| R-27 | 审批后若重新向模型规划，实际执行内容可能偏离用户看到的计划 | 恢复同一 Run 时要求 Context digest 一致并复用已批准计划；事件序号跨恢复连续 | Runtime 恢复与上下文漂移测试 |
| R-28 | 同一模型 Step 的工具批次在 STUCK、运行中取消或取消清理失败时遗留未配对调用 | 终局前把后续未启动调用配对为 denied/cancelled，保持 assistant tool_calls 与 tool results 合法闭合 | 三类中途终局批次测试 |
| R-29 | EventSink 写入失败被误报为模型故障，错误收尾二次 append 可使 `run()` 裸拒绝 | 按 startup/running/finalizing 分类；前两阶段结构化失败，最终事件失败保留业务结局并标记 `traceComplete=false`；审批挂起失败 fail-closed | 四类 EventSink 故障测试 |
| R-30 | Turn 建立前预算、上下文或 Checkpoint 校验抛泛型错误 | 统一转换为 `RUNTIME_INPUT_INVALID` 的 `AgentError`，保持 fail-fast 且不污染事件历史 | 非法 TurnBudget 测试 |
| R-31 | 未分类 Core 异常冒充 `MODEL_FAILED`，终态 per-Run 序号缓存不释放 | 未分类异常改为 `INTERNAL`；终态释放序号和故障记录，审批恢复期间继续保留 | Policy 异常分类与序号释放测试 |
| R-32 | Runner 只有单一超时/输出上限，预期失败以异常表达，调用方无法区分超时、取消、启动失败和清理未知 | Runner V2 使用版本化状态联合、总/空闲超时、独立双流字节上限和关闭 stdin；预期失败统一结构化返回 | Runner 45 项：状态、路径、审批、头尾截断与 UTF-8 字节测试 |
| R-33 | Git Adapter 的 Runner 映射无法传递空闲超时、受控环境、双流上限与结构化失败 | 适配器映射 V2 请求/结果，隔离环境经 `envOverlay` 注入，未注入 Runner 保持 fail-closed | Git Adapter 41 项：映射、审批、隔离与失败测试；源码扫描无进程入口 |
| R-34 | Core Checkpoint 复制 messages，恢复绕过事件投影并可能采用过时快照 | `RuntimeCheckpoint 2.0` 删除 messages；恢复必须装配 State V2 消息投影，无投影 fail-closed | Core Checkpoint、投影优先级与恢复负向测试 |
| R-35 | Core RuntimeEvent 与 State V2 未连接，两个模块各自分配权威序号 | 新增 Runtime→V2 适配器；Core 序号仅生成幂等 ID，V2 ledger 分配 Thread seq | State 生命周期映射、幂等冲突与消息投影测试 |
| R-36 | Compaction 只维护 ID，不替换消息视图 | 活动压缩用 summary 替换明确 seq range；二次压缩 supersedes 旧摘要，原始事实不删除 | State 压缩 DAG/消息顺序测试 |
| R-37 | Core 模型错误不分类，认证/TLS/请求错误也重复调用 | Core 使用显式重试矩阵；未知错误 fail-closed；context overflow 仅在压缩事实落盘后重试 | Core 可重试/不可重试/压缩后重试测试 |
| R-38 | Core 缺少 UI 可替换的 Submission/Event 双门面 | 新增 run/resume/cancel 的 `submit` 和独立 `subscribe`，并保持现有 Runtime 内部实现可替换 | Core 多订阅、取消与重复 Run 测试 |
| R-39 | ToolSpec 仅声明扁平类型，模型看不到参数说明、枚举和默认值，默认值也不会进入执行请求 | ToolSpec V2 强制参数 description，验证 enum/default/数值范围，并由 Runtime 生成带默认值的执行副本 | Core Registry/Runtime 210 项测试 |
| R-40 | Workspace 只有整文件计划与状态级 diff，锚文本失败不能自我纠错，Apply 成功不回传内容位置 | 新增唯一锚计划、最相似/多命中反馈、大小与编码门；计划/Shadow/Apply 携带有界内容 diff 和哈希 | Workspace replace/diff/plan/apply 69 项测试 |
| R-41 | 冻结 read 工具重叠、路径错误不可纠正，search 截断后不知总数且无上下文 | Node `readText` 合并范围语义并返回总行数；`searchText` 分离 returned/total/exact、携带上下文和预算原因；错误给相似候选 | Workspace 只读 ACI 测试；Phase 2 本体未改 |
| R-42 | 初始上下文无环境 Builder，AGENTS 发现器未进入 Runtime | 新增结构化 Bootstrap；Runtime 调用用户规则与 repo root→cwd 发现，使用 realpath、UTF-8 字节上限和 protected stable prefix | Core Bootstrap/AGENTS 顺序、日期和越界测试；产品宿主待阶段装配 |
| R-43 | 中文沿用 `chars/4` 导致水位明显低估 | fallback 改为 ASCII run + 非 ASCII UTF-8 字节的保守估算；显式 provider 估算仍可注入 | 中英文估算与 provided source 测试 |
| R-44 | Working Memory 只有 kind/placement，无 update_plan、revision 和约束所有权 | 新增 Harness 内部 `agent.update_plan`；仅 plan/currentStep/findings 可写，goal/constraints 由来源控制；最新版始终尾部复诵并进入 Checkpoint | 约束字段拒绝、revision 冲突、24 次更新/25-Step Replay |
| R-45 | Agentic read/search 未装配且缺少浅层 list | Workspace 新增浅层有界 list；Core 提供固定 read/search/list ToolSpec、结构化端口和只读执行路由 | Workspace 69 项、Core 装配测试；Electron/CLI 组合根待阶段装配 |
| R-46 | 工具观察缺少结构化截断和陈旧输出折叠 | 模型观察携带 originalChars/SHA-256/truncated/state；8 条一批折叠，最近 4 条保留，State 原始事实不删除 | 工具观察严格上限、可恢复 fold、State 投影测试 |
| R-47 | 水位只亮标志且 compactContext 无生产提供者 | 默认确定性压缩器接入；完整模型投影在显式窗口 75% 触发批量压缩、保留 20%，压后仍超线 fail-closed；ToolSpec description 纳入摘要 | 水位预压缩、压后复核、provider overflow 回退与 24-Step 测试 |
| R-48 | 敏感路径拒绝只在 Policy 字符串层；审批 rule/reject 原因与 Git 会话兜底未闭环 | Workspace realpath enforcement 拒绝 `.git/.env*`；IPC 强制 ruleId/reason，Core 将拒绝回流为 denied ToolResult；GitSessionGuard 提供干净基线、session diff 与审批绑定的 tracked rollback | Workspace safety、Core Runtime、Shell Schema、Git Session Guard 定向测试 |
| R-49 | GitSessionGuard 仅导出未接入 Runtime，调用方遗漏时会话无基线和 diff | Git 仓库 Turn 缺失 SessionSafetyPort 时 fail-closed；配置后自动建立/复用基线、逐 Turn inspect、cwd 改绑拒绝、活动 Run 禁止关闭、close 前最终 inspect | Runtime Protocol 缺失端口、自动接入、复用、改绑、活动 Run 与关闭测试 |
| R-50 | 验收条件由模型计划提供，验证失败立即终止，无法让模型根据证据修复，重复失败也没有稳定熔断 | 请求侧 `TaskAcceptance` 成为唯一完成条件；验证失败以 State 可投影的 system 反馈回流，`VERIFYING → EXECUTING`；同一 Gate 三次失败返回 `VERIFICATION_STUCK` 并保留摘要 | Core 可信验收、反馈回流、三次熔断与 Gate 归属测试；State 事件投影测试 |

## 4. 旧报告的关键误报与失效建议

| 旧结论 | 复核结果 |
|---|---|
| “Phase 2 Agent 循环完全未实现” | **Incorrect**。源码在 `phase/02-readonly-agent`，官方测试入口运行 81 项通过；它是冻结 legacy，不在 Phase 3 工作树。 |
| “core/workspace/runner/git-adapter 源码完全缺失” | **Incorrect**。分别存在于 Phase 4/6 权威分支，现已汇入整合分支。 |
| “state/shell 只有 dist 无源码” | **Incorrect**。源码分别在 Phase 5/7；旧报告审查的是跨分支残留生成物。 |
| 引用 `src/phase1-2/win7_agent/policy/policy.py`、`tools/executor.py`、`context/manager.py` | **Incorrect**。这些路径在审计基线中不存在，不能形成代码级结论。 |
| “Phase 1 检查超时只记录备注” | **Incorrect**。当前实现返回结构化 ERROR/非零退出，已有回归。 |
| “Win7 路径统一加 `\\?\` 即可修复” | **Invalid advice**。长路径策略必须按运行时、API、UNC/reparse 和实机 Profile 验证，不能盲加前缀。 |
| “新文本应使用 UTF-8 BOM” | **Contradicts policy**。`AGENTS.md` 要求 Markdown/文本源码使用 UTF-8 无 BOM、LF。 |
| “`fs.rmSync` 不兼容 Node 16” | **Incorrect**。Node 16.17.1 支持；实际问题是更新算法和回滚语义。 |
| 4 组完全重复问题分别计数 | **Incorrect counting**。旧 M-01/M-23、L-04/L-18、L-05/L-17、L-06/L-16 是重复项。 |
| “无递归深度限制”但目标代码没有递归 | **Incorrect**。不能把通用检查清单当成已发现缺陷。 |

旧报告中真正成立的 WAL、Updater、IPC、Gateway 重试/解码/流式问题已经移入本版 R-01~R-20，
不再保留失真的 59 项总数。

## 5. 仍开放或被阻断的问题

### 5.1 Blocker

| ID | 状态 | 问题 | 对用户的直接影响 | 关闭条件 |
|---|---|---|---|---|
| B-01 | Open | 最小权限 Electron 入口已实现并通过 Win7 smoke，但五视图与跨模块用户任务尚未装配 | 用户可以启动桌面入口并查看诊断，仍不能完成任务、diff、审批和恢复 | 在现有入口装配五视图与 Replay E2E，再逐步恢复受 Gate 保护的能力 |
| B-03 | Blocked | 真实 Runner、Job Object/Restricted Token helper 和 winpty 未实现 | 用户只能只读/Mock，不能安全执行测试或命令 | SPIKE_02 Win7 Go；失败则保持拒绝或远程执行 |
| B-04 | Blocked | Win7 MVP 已由 ADR-0055 接受且 SPIKE_03/产品入口有实证；SPIKE 正式合同、企业 E7 和 E1/E2/E5 正式 Gate 仍未闭合 | 可以继续 MVP 产品装配，但不能声明正式发布或启用原生 Runner/SQLite | 补齐原生构建链、企业环境和各正式 Go/No-Go 报告 |

### 5.2 High

| ID | 状态 | 问题 | 建议 |
|---|---|---|---|
| H-01 | Blocked | Gateway 的 Node 栈仅实现显式 HTTP CONNECT；PAC、HTTPS 代理、代理凭据流转和企业 CA 真实握手未验证 | 在 E7 对三种网络栈做实测；不满足时只替换 Transport Adapter，不重写 Provider/Protocol |
| H-02 | Open | Updater 没有受控下载、签名验证和解包器；当前只负责“已准备 payload”的安全应用 | 完成 D-016 manifest 签名、下载限额、解包防穿越和企业发布链 |
| H-03 | Blocked | State 仍是内存实现，进程崩溃后无持久恢复；没有 SQLite WAL/FTS、迁移和清理 | 完成 SPIKE_04 后实现持久 Store，并复用当前原子接口测试 |
| H-04 | Open | Core 纵向 Runtime 已闭环，但 Gateway/Workspace/State/Runner/Shell 尚未装配成一次真实跨模块用户任务 | 增加产品装配 E2E：连接/Replay→计划→预览→审批→Mock 执行→审计→恢复 |
| H-06 | Blocked | Electron 22/Chromium 108/Node 16 及部分测试依赖均 EOL | 锁定来源/哈希/SBOM、只加载本地可信 UI、企业网络隔离并制定退役窗口 |

### 5.3 Medium

| ID | 状态 | 问题 | 建议 |
|---|---|---|---|
| M-01 | Open | Gateway 响应已校验关键字段，但 tool_calls、usage 和所有嵌套对象尚无完整运行时 Schema | 为协议 v0.1 增加无新依赖的显式校验或已评审 Schema 库 |
| M-02 | Open | Gateway/Core/State/Shell 使用不同错误域，UI 尚无统一的标题、恢复动作、重试策略映射 | 保留模块错误码，在 Shell 建立版本化 `UserFacingError` 映射，避免强行合并枚举 |
| M-03 | Open | API key 只存在内存已优于落盘，但 DPAPI 凭据存储仍未实现；代理凭据也缺完整生命周期 | 完成 D-017/任务书登记后实现 DPAPI adapter、清除与轮换 |
| M-05 | Open | Phase 2 F 编号契约到 Node Core 测试仍未形成逐项机器可查的 traceability | 在 Phase 6 任务书维护“继承/有据变更/不适用”矩阵并绑定测试名 |
| M-06 | Open | 各模块独立安装依赖，根目录没有统一锁文件；新成员首次验证步骤仍偏长 | 保持模块锁文件权威，增加不改锁的受控 bootstrap/离线缓存说明 |

## 6. 用户旅程复核

| 用户旅程 | 当前体验 | 本轮改善 | 仍缺 |
|---|---|---|---|
| 启动与环境检查 | Win7 可启动真实 Electron MVP 入口并显示只读运行时/能力诊断 | 产品入口 smoke 2/2、运行时/补丁采集 8 PASS + 1 OWNER ACCEPTED | 未整合到安装器；正式 E1/E2 仍冻结 |
| 连接模型 | 桌面入口显示 Gateway 未配置/Replay；Gateway 可作为库调用 | HTTPS/TLS fail-closed、有限重试、认证/代理错误可区分 | Gateway 与 Shell 装配、企业代理/CA、取消按钮 |
| 查看流式回答 | 无 Renderer | 不再吞首空格、串请求或把截断显示为成功 | UI 滚动、暂停、重连与无障碍体验 |
| 预览并审批修改 | Core、Workspace、Runner 与 IPC 已有可组合契约 | 预览包含编码/EOL/截断；审批精确绑定会话/请求/预览/基线并在执行点消费 | Electron UI 展示与跨模块装配 E2E |
| 执行测试/命令 | 真实 Runner 不可用 | 明确 fail-closed；合法元字符参数不再被误拒 | SPIKE_02、进程树、取消、输出背压和用户终端 |
| 更新与恢复 | 没有可交付更新链 | 更新结果区分未应用/已回滚/回滚失败，错误给出下一步 | 签名、下载、解包、外部 updater helper 与 Win7 占用文件场景 |
| 故障诊断 | 模块各自返回内部错误 | IPC listener/handler 错误可观察，Core/Runner/Updater 增加恢复建议 | 统一诊断页、日志导出、隐私脱敏与关联 ID |

最重要的体验判断是：**当前应被展示为“开发中的受限预览”，不能展示成可用桌面 Coding
Agent**。在 B-01、B-03 关闭前，UI 若提前出现，必须明确标注只读/Mock/不可执行状态。

## 7. Phase 1、2、3 是否重写

| 阶段 | 结论 | 理由 | 建议动作 |
|---|---|---|---|
| Phase 1 | **不重写** | Probe 边界清晰、无网络、标准库、22 项开发机回归通过；ADR-0029 已将其定位为安装前 legacy 检查器 | 保持冻结，只修复可复现缺陷；补 Win7 E1/E2 和安装器调用 |
| Phase 2 | **不重写、不整体迁移** | 权威分支官方入口 81 项通过；状态机、事件、Replay 和错误契约仍有规范价值；ADR-0029 禁止自动翻译/文件复制 | 冻结 Python 实现，保留分支/标签；把契约和 F 矩阵逐条在 Node Core 重实现 |
| Phase 3 | **不推倒重写，继续定向重构** | Provider/Protocol/Transport 分层和大部分测试可复用；主要缺陷集中在网络边界，本轮已修复关键逻辑 | 先跑 E7/SPIKE_01；若 Node HTTPS 不满足 PAC/CA/Win7，只替换 Transport Adapter |

Phase 6 已完成开发机可验证的单 Agent 纵向切片，Phase 7 仍接近“尚未实现完成”。
下一步应先做跨模块产品装配，再根据 E2E 与 Win7 证据决定局部替换，避免把缺实现误称为重写。

## 8. 验证记录

| 范围 | 命令/入口 | 结果 | 证据边界 |
|---|---|---|---|
| Phase 3–7 | `npm run verify`；Gateway 回环测试在沙箱外定向重跑 | 历史候选快照的模块回归记录 | macOS 开发机；不替代当前代码基线或 Win7 实机证据 |
| Core Agent Loop 附带缺陷修复 | `npm test -- --runInBand` + `npm run lint`（`src/core`） | 12 suites / 178 tests passed；`tsc --noEmit` passed | macOS 开发机；覆盖 ADR-0040，不替代 Win7 或 SQLite 实机证据 |
| Phase 1 | `unittest discover`（unit/probe + integration/probe） | 20 + 2 tests passed | Python 3.11 开发机，不是 CPython 3.8/Win7 |
| Phase 2 | 从 `phase/02-readonly-agent` 导出后运行 `scripts/run_agent_tests.py` | 81 tests passed | Python 3.11 开发机；权威分支未被整合修改 |
| 文档/补丁 | `git diff --check` | passed | 仅检查空白与补丁格式 |
| Runner V2 | `npm run lint && npm test -- --runInBand && npm run build`（`src/runner`） | 3 suites / 45 tests passed；`tsc --noEmit`、build passed | macOS 开发机；Mock 协议证据，不是 Win7 containment/编码证据 |
| Git Adapter V2 | `npm run lint && npm test -- --runInBand && npm run build`（`src/git-adapter`） | 3 suites / 41 tests passed；`tsc --noEmit`、build passed | macOS 开发机；无 Runner 直接进程入口 |
| ToolSpec V2 | `npm run lint && npm test -- --runInBand && npm run build`（`src/core`） | 14 suites / 195 tests passed；默认值进入 Runtime 执行请求 | macOS 开发机；仅证明 Core 合同 |
| 验证修复闭环（ADR-0051） | `npm run lint && npm test -- --runInBand`（`src/core`） | 20 suites / 225 tests passed；TaskAcceptance、失败反馈与三次同 Gate 熔断均有回归 | macOS 开发机；Mock 验证证据，不执行真实命令，不替代 Win7/Runner 证据 |
| 验证反馈事件投影（ADR-0051） | `npm run lint && npm test -- --runInBand`（`src/state`） | 16 suites / 218 tests passed；反馈投影为 system message | macOS 开发机；内存 ledger 不等于持久恢复 |
| Workspace ACI | `npm run lint && npm test -- --runInBand && npm run build`（`src/workspace`） | 8 suites / 68 tests passed；含锚替换、内容 diff、统一读取与搜索统计 | macOS 开发机；未替代 Win7 文件系统实机验证 |
| Win7 / Spike / E7 | 未执行 | **Blocked** | 禁止据此宣称阶段完成 |

Jest 脚本已移除 `--forceExit`，上述测试在自然退出条件下通过。Gateway 慢响应测试也会在
连接关闭时清理计时器，不再用强制退出掩盖开放句柄。

## 9. 清理记录

已删除并加入忽略规则：

- 7 个模块的 `node_modules/`，约 494 MiB，可由各模块 `package-lock.json` 再生；
- 所有模块的 `dist/`；其中 Runner 原先误提交的 20 个编译产物已从版本基线删除；
- 仓库内容目录中的 4 个 `.DS_Store`；
- 开发机 Python 回归生成的 `__pycache__/` 与 `*.pyc`。

已保留并纳入回归：

- `src/core/tests/context.test.ts`、`errors.test.ts`、`types.test.ts`；
- `src/state/tests/backlog.test.ts`、`store.test.ts`、`wal.test.ts`。

这些测试不是生成物，且包含原分支测试集没有完全覆盖的断言，不能以“清理”为由删除。

## 10. 下一步优先级

1. 把已闭环的 Core Runtime 装配到 Gateway/Workspace/State/Runner/Shell，完成一个
   Mock/Replay 驱动的跨模块 E2E：任务→流式→计划→diff→审批→Apply→审计→恢复。
2. 在已通过 Win7 smoke 的最小 Electron main/preload/renderer 上装配五视图，并把不可用能力、
   恢复建议、进度和取消做成真实交互。
3. 优先执行 SPIKE_01/02；SPIKE_02 结论决定本地执行和终端是否可进入产品。
4. 在企业 E7 验证 Gateway 代理/CA；只在证据否定 Node HTTPS 时替换 Transport。
5. 执行 SPIKE_04 后把 `IEventStore.appendBatch` 落到 SQLite WAL，保留本轮原子性测试。

在这五项完成前，不应新增插件、多 Agent、自动 PR 或 full-access 等范围。

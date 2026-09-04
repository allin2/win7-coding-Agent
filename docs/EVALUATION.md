# EVALUATION — 验证与评估方法

本文件规定“什么叫做完成”。实现必须按组件声明的 Runtime Profile 在 Windows 7 SP1 x64
实机或等价 VM 验证；现代开发机上的通过不能替代目标平台验收。Phase 1/2 继续使用其冻结的
Python 3.8.10 验收口径。

## 1. Runtime Profile 与验证环境

### 1.1 Runtime Profile 必填项

每个目标端组件在获批任务书中至少声明：

- Profile ID、组件名称和组件版本；
- 语言/运行时/框架的精确版本、架构与构建标识；
- 第三方库、原生模块和外部程序的完整依赖闭包；
- Windows 7 SP1 补丁前置、文件系统和控制台假设；
- 交付模式：自包含离线包、企业内网安装或受控更新；
- 网络目标、认证方式和离线/断连行为；
- 可选能力及其降级路径；
- 编译、静态扫描、Win7 实机和安全测试命令；
- 包来源、哈希/签名、SBOM/许可证与回滚方式。

一个产品可以包含多个 Profile，例如桌面 UI、Agent Core、原生 Runner、终端适配器和 Git
工具包。每个 Profile 独立验收，随后再执行产品级集成验收。

### 1.2 历史阶段环境（标识保持不变）

| 环境 | 定义 | 用途 | 是否强制 |
|------|------|------|----------|
| E1 | Windows 7 SP1 x64 + CPython 3.8.10 x64 + Git for Windows 2.46.2 + 普通用户 + 外网断开 | Phase 1 正向能力基准；Phase 2 按任务书复用其 Win7/Python 语义 | Phase 1/2 强制 |
| E2 | Windows 7 SP1 x64 + 普通用户 + 安装/工作路径含中文及空格 + Git 不在 PATH 或未安装 + 外网断开 | Phase 1 降级路径；Phase 2 按任务书复用其边界语义 | Phase 1/2 强制 |
| E3 | Win10/11 或其他现代环境 + CPython 3.8.10 | Phase 1/2 开发期快速回归 | 推荐；不能代替 E1/E2 |
| E4 | 开发机（macOS/Linux/Windows） | 文档、静态扫描和不依赖 Win7 的测试 | 仅限非目标平台验证 |

Phase 1 的 32 位进程探测仍建议在 E2 机器上使用 CPython 3.8.10 x86 补充运行。上述定义是
冻结合同，不因新组件允许其他运行时、依赖或网络而改变。

### 1.3 新组件与客户端环境

| 环境 | 定义 | 用途 | 是否强制 |
|------|------|------|----------|
| E5 Win7 Clean | 干净 Windows 7 SP1 x64 VM + 任务书声明的最低补丁 + 普通用户；只安装或解压待验交付包 | 验证依赖闭包、首次启动、核心功能、卸载/清理 | 每个新目标端 Profile 强制 |
| E6 Win7 Edge | Windows 7 SP1 x64 + 中文/空格/长路径场景 + 可选工具缺失 + 受限权限；网络按任务场景断开或故障注入 | 验证兼容适配和明确降级 | 每个新目标端 Profile 强制 |
| E7 Enterprise | Windows 7 SP1 x64 + 声明的企业代理、证书、内网模型/更新服务和权限策略 | 验证联网、认证、更新及组织策略 | 仅对声明相关能力的 Profile 强制 |
| E8 Modern Dev | 受支持的现代开发/CI 环境 + 与 Profile 一致的工具链 | 构建、单元测试、静态扫描和快速回归 | 推荐；不能代替 E5/E6/E7 |

规则：

- Win7 实机/VM 验收是所有目标端组件完成的硬门槛；必须记录 OS 版本、补丁、运行时、架构和
  包哈希。
- E5/E6 只允许使用交付包或任务书明确列出的前置，不得利用验收机偶然安装的开发工具。
- Docker、WSL 或现代浏览器可用于构建、CI 或远程服务验证，但不能代替 Win7 本地客户端验收。
- 无网络能力的 Profile 可将 E7 标记为“不适用”，但必须说明依据；不得把未执行写成通过。

## 2. 静态检查

### 2.1 Phase 1 冻结检查 S1～S7

以下编号和语义保持不变，以满足 `PHASE_01_CAPABILITY_PROBE.md` 的既有引用：

| 检查 | 方法 | 通过标准 |
|------|------|----------|
| S1 语法级别 | CPython 3.8 `python -m compileall -q src/` | 零错误 |
| S2 shell=True | 全库文本搜索 `shell=True`、`os.system`、`os.popen` | Phase 1 实现零命中 |
| S3 裸 open | 搜索文本模式 `open(` 并人工核对 encoding 参数 | Phase 1 文本模式全部显式 encoding |
| S4 3.9+ API | 按 Phase 1 冻结的 Python 3.8.10 清单逐项搜索 | Phase 1 实现零命中 |
| S5 第三方 import | 提取 Phase 1 全部 import 并对照 3.8 标准库清单 | Phase 1 全部属于标准库 |
| S6 未评审依赖 | 对照 `WIN7_CONSTRAINTS.md` §6 登记表 | 使用的高风险模块/外部工具均为批准状态 |
| S7 控制台非 ASCII | 搜索 Phase 1 `print(` 调用中的非 ASCII 字面量 | Phase 1 CLI 零命中（写文件除外） |

S1～S7 不应被用于推导“全项目只能 Python/标准库/ASCII CLI”。新组件执行下列通用检查。

### 2.2 新组件通用检查 G1～G10

| 检查 | 方法 | 通过标准 |
|------|------|----------|
| G1 Profile 一致性 | 读取二进制/包元数据并与任务书和锁文件比对 | 版本、架构、入口和依赖完全一致 |
| G2 语法与加载 | 使用 Profile 的实际编译器、解释器或打包器执行编译/加载 | 零错误，未使用超出 Profile 的语法/API |
| G3 进程执行汇点 | 扫描各语言进程 API，并核对 Runner/TrustedShellRunner/终端适配器调用链 | 历史 Profile 无模型拼接 Shell；A9 完整命令只进入 TrustedShellRunner；无 Renderer/UI 绕过 Policy/审计的敏感调用 |
| G4 编码与路径 | 扫描文本 I/O、IPC 和路径边界代码 | 显式编码或字节保持；覆盖中文、空格、盘符、UNC/reparse 风险 |
| G5 Win7 API | 导入表、最低系统版本、运行时 API 和依赖文档复核 | 不依赖 Win10+ 本地 API；可选能力有可测降级 |
| G6 依赖闭包 | 对照锁文件、打包清单、SBOM、许可证、来源和哈希 | 无未登记或运行期临时获取的依赖 |
| G7 Electron/UI 隔离 | 检查 BrowserWindow、preload、IPC、CSP、Session 请求过滤、权限处理器、导航与网络配置 | 满足 `SECURITY.md` §4；不加载不可信远程网页，Renderer 无未声明出站能力 |
| G8 数据与审计 | 检查持久化 schema、错误模型、脱敏和版本字段 | 数据可迁移；异常不静默；敏感信息不进入普通日志 |
| G9 授权范围 | 比对任务书状态、分支和允许路径 | 满足 `AGENTS.md` C14，零越界实现 |
| G10 Git 间接执行 | 分层检查历史隔离 Git Adapter 与 A9 Trusted Git | 历史 Profile 的 hooks/filters/helpers 不能旁路；A9 真实 Git 必须经 TrustedShell、显示非隔离状态并对破坏性/远端写操作执行目标绑定审批 |

不适用项必须在任务书和验收记录中写明理由；不能直接删除检查项。

## 3. 动态验证要求

### 3.1 Phase 0/1 文档与 Phase 1 Probe

- 文档交叉引用有效，章节号和 ADR 编号真实存在。
- Phase 1 任务书规定的章节、Schema、测试矩阵和错误模型完整。
- 在 E1 执行 Probe：退出码符合约定；JSON 可被 `json.load` 解析且符合任务书 Schema。
  `tool.git` 在 Git 2.46.2 可用时为 pass，缺失时可 degraded；Git 状态不构成核心能力失败。
- 在 E2 的中文+空格路径执行成功；Git 缺失时仍完整产出 JSON。
- 执行并留存 `PHASE_01_CAPABILITY_PROBE.md` 的全部适用用例；Phase-Gate 未解除时不得启动
  E1/E2 验收。

### 3.2 Phase 2 冻结验收

Phase 2 继续遵循 `PHASE_02_READONLY_CODE_ANALYSIS.md` 的测试矩阵和 E1/E2 语义：目标工作区
只读、Mock/Replay 驱动、无真实模型和网络。ADR-0027 不改变其完成门槛。

### 3.3 新组件通用动态用例

每个目标端 Profile 至少验证：

- 干净 E5 环境安装/解压、首次启动、重复启动、正常退出和重新启动；
- 中文、空格、CRLF、UTF-8、CP936、长路径边界、盘符和 UNC 的适用场景；
- 每个子进程的正常结束、超时、stdout/stderr 截断、强制终止和进程树残留；
- 宿主已在 Job Object、无法创建可靠 containment 时，高风险 Agent 命令在启动前拒绝或
  转远程；获批低风险 `taskkill` 降级仍需验证实际无残留并记录非等价性；
- 可选运行时、Git、终端能力、代理或服务缺失时的声明降级；
- 恶意 Git 仓库配置、`.gitattributes`、hooks、filter、textconv、pager、credential/SSH
  helper 与 fsmonitor 不得触发未授权进程、凭据读取或网络；
- 模型/Core/插件不能向用户交互终端写 stdin；终端对 OSC 52、OSC 8、窗口/标题控制、
  外部协议、超量/深层控制序列和静默粘贴安全拒绝或确认；
- 内网服务正常、超时、断连、错误证书、认证失败和恢复；
- 写操作的边界拒绝、用户确认、审计记录、失败回滚和崩溃恢复；
- 安装包/更新包哈希或签名失败时拒绝执行，更新失败后可回滚；
- CPU、内存、磁盘、句柄和日志增长在任务书预算内。

性能类动态用例统一映射 `docs/PERFORMANCE_BUDGET.md`（ADR-0033，唯一权威口径），
在指定 Spike/阶段于 Win7 实机执行；不得内联复制数值，不得纸面达标：

| 用例 | 预算条目 | 执行者 |
|------|----------|--------|
| 冷启动计时（重启后首次，3 次中位数） | #1 | SPIKE_01 |
| Shell/Core 空闲常驻内存采样（10 分钟均值） | #2 / #3 | SPIKE_01 |
| Runner/终端宿主峰值内存（长输出命令） | #4 | SPIKE_02 |
| FTS 首次全量索引吞吐（机械盘、混合中英文样本仓库） | #5 | SPIKE_04 |
| EventStore WAL 批量写压测（60s 持续） | #6 | SPIKE_04 |
| 库体积上限与滚动清理后功能完整性 | #7 | SPIKE_04 |
| 检索延迟 P95（3 万文件库、100 次查询） | #8 | SPIKE_04 |
| 并发 2 任务下各预算复测 | #9 | SPIKE_01 + PHASE_06 |
| 最重负载总内存峰值占比 | #10 | SPIKE_01 + PHASE_07 |

### 3.4 Win7 桌面客户端兼容性验收

采用 Electron 或其他 GUI 技术的 Win7 客户端，除通用用例外至少执行：

| ID | 场景 | 通过标准 |
|----|------|----------|
| W7C-01 | 干净 E5 首次启动 | 不访问未声明网络，不请求未声明运行时或管理员权限 |
| W7C-02 | 中文/空格安装目录与工作区 | UI、文件打开、状态保存和日志路径均正确 |
| W7C-03 | Unicode 与控制台适配 | GUI 正确显示 Unicode；CP936/VT 不可用时终端明确降级 |
| W7C-04 | 无 ConPTY/现代系统 API | 客户端不崩溃；终端使用已声明兼容后端或标记能力不可用 |
| W7C-05 | Renderer 隔离 | Node 集成关闭、上下文隔离和沙箱开启、preload API 最小化；在 Win7 上动态验证越权尝试被拒绝 |
| W7C-06 | 导航、网络与权限策略 | 拒绝远程脚本、未知导航、新窗口、外部协议、未声明 HTTP(S)/WebSocket 出站和设备权限；现代网页转远程服务 |
| W7C-07 | IPC 权限 | 未登记通道和畸形参数被拒绝；敏感操作经过 Policy/批准/审计 |
| W7C-08 | 模型/网关断连 | UI 保持响应，状态清晰，可取消或重试，不丢失本地审计 |
| W7C-09 | Runner containment | 历史 Profile 在超时后进程树清零；A9 Shell 在取消/deadline 后清理并报告残留，回收不确定时停止后续自动执行且不得虚报隔离 |
| W7C-10 | 包完整性与回滚 | 篡改包被拒绝；失败安装/更新可恢复上一版本 |
| W7C-11 | 缺失可选工具 | Git、终端或插件缺失时给出能力状态，不导致客户端整体退出 |
| W7C-12 | 长时运行与退出 | 句柄/内存/日志无失控增长；退出无残留受管进程 |
| W7C-13 | 用户交互终端边界 | 模型/插件无法注入 stdin；恶意 VT/OSC、链接、剪贴板与粘贴策略生效；winpty/shell/孙进程可回收 |

未实现的桌面功能可以标为“不适用”，但任务书必须证明它不属于该阶段交付范围。

## 4. 安全抽查

每个阶段按声明能力执行：

1. 记录所有实际网络连接并与任务书网络合同比对；A9 Full Access 可无域名白名单但须区分 Provider 与
   Shell/项目工具出站，Phase 1/2 必须保持零网络。
2. 对比运行前后文件、进程、注册表、服务和系统配置；除获批变更外无残留。
3. 日志、报告、崩溃文件和 IPC 中无凭据、完整环境变量、证书正文或未授权源码。
4. 注入越界路径、畸形 IPC、危险参数、恶意 Git 配置/属性/Hook、终端 VT/OSC、错误证书、
   篡改包和权限拒绝，验证安全失败模式。
5. Electron 客户端验证 `SECURITY.md` §4 的隔离项及实际出站阻断；现代 Browser Use 在远程
   受支持环境验收。

## 5. 验收记录格式

验收记录存放在 `docs/acceptance/`，命名为
`YYYYMMDD_<phase-or-component>_<environment>.md`，至少包含：

- 执行人、日期、任务书/ADR、Git 提交和 Profile ID；
- OS/SP/补丁、运行时/框架/架构、外部工具版本；
- 交付包、锁文件和关键二进制 SHA-256；
- 执行的静态、动态、安全检查与原始结果位置；
- 不适用项及依据、失败/降级项与处置；
- 网络和权限配置、回滚结果、残留检查；
- 最终结论：`PASS`、`FAIL` 或 `CONDITIONAL_PASS`。

`CONDITIONAL_PASS` 只允许用于任务书预先定义的非关键降级，不能用于跳过 Win7 实机验证、
安全边界或 C14 授权。

## 6. 质量红线

以下任一情况使对应组件或阶段不通过：

1. 未在任务书要求的 Win7 环境执行，却声称目标端完成。
2. 出现未捕获异常、UI 无响应、受管进程残留或资源无限增长。
3. 使用未登记运行时/依赖/网络目标，或依赖验收机偶然存在的工具。
4. 模型可绕过 Policy、权限模式、必要确认或审计直接执行进程；历史/Review 模式可越界写文件，或 A9
   Full Access 的工作区外操作未醒目标识。
5. 交付包完整性失败仍继续安装/运行，或不可恢复的更新失败。
6. 文本编码/路径处理破坏用户文件，或持久化数据缺少版本。
7. 适用的静态、安全或动态检查失败。
8. 实现超出 C14 任务授权、分支或路径白名单。
9. 声称完成但没有可追溯验收记录。
10. 历史隔离 Profile 无可靠 containment 仍执行高风险命令；或 A9 在回收不确定后继续自动执行、未报告残留，
    或把 `taskkill` 降级报告为等价沙箱。
11. Git/终端/Renderer 可绕过对应 Profile 的 Runner、Policy 或审计；A9 Trusted Git 的 hooks/helpers 未被
    如实标识，或 push/force/delete 等外部/破坏性操作绕过确认。

对 Phase 1，另保持原有红线：S1～S7 必须全部通过，Probe 不得留下文件/进程残留，JSON
必须可解析且包含 Schema 必填字段，E1/E2 验收记录不可缺失。

## 7. A8 串行产品 Gate

A8 的阶段不得并行跳过。完整原子测试 ID 与断言见
[`A8-00 产品架构与数据合同 §8`](prds/A8_00_PRODUCT_ARCHITECTURE_AND_DATA_CONTRACT.md#8-a8-01a8-05-确定性测试矩阵)。

| Gate | 最低确定性证据 | 不能替代的证据 |
|------|----------------|----------------|
| A8-00 | PRD 追踪完整；信息架构、事件/状态/准备区/迁移字段冻结；JSON/HTML/链接与文档一致 | UI 草图或口头决定 |
| A8-01 | A8E-01～06；中文/英文连续流、request 切换、非 delta、缺口/乱序/迟到、上限和缓存重建 | 原始 chunk 列表或单次视觉演示 |
| A8-02 | A8S-01～04；标识归属、单活动任务锁、Goal、中文/空格/路径与只读边界 | 仅创建一个内存 Session |
| A8-03 | A8R-01～07；多文件决定、审批哈希、漂移零写入、全组回滚、编码/EOL、真实验证 | 单文件 Diff 或模型声称已测试 |
| A8-04 | C17/C19 负向测试、Runner 展示、Settings/Diagnostics；Terminal 无新 Profile 时 disabled | 旧 winpty 工件或开发机 Shell 可用 |
| A8-05 | A8P-01～04、A8M-01～03、A8C-01～02；恢复、损坏、凭据扫描和原子迁移 | 只证明 EventLedger 可重开 |
| A8-06 | 同一候选的开发机、Win10、Win7 十二条产品旅程，新 manifest/SBOM/许可证/哈希与唯一租约 | A7 RC PASS 或某一层 harness PASS |

每个实现 Gate 必须同时检查权威事实、用户投影与副作用。A8-00 的文档 Gate 可以在开发机完成；它只解除
A8-01 的进入条件，不是 A8 开发机产品 PASS，更不是 Win10、Win7 或 RC PASS。

2026-08-20 A8-01 记录：`A8E-01`～`A8E-06` 与 Composer、计划审批零副作用、原始 Gateway 事实回归
通过，仓库级 `npm run verify` 通过，Gate 为 `A8_01_CONVERSATION_PASS`。该结果只解除 A8-02 的
进入条件；完整 A8 开发机十二旅程和 Windows 分层仍为 `NOT_PERFORMED`。

2026-08-20 A8-02 记录：`A8S-01`～`A8S-04` 通过，覆盖标识归属/事件隔离、第二前台提交在实体创建前
拒绝、Goal 修订与事实原子性/快照恢复一致，以及中文、空格、Win7 盘符/MAX_PATH、reparse 越界、
24 项/64 KiB/500 行上下文上限和精确只读 IPC。仓库级 `npm run verify` 为 7 模块 1010 项 PASS，
Gate 为 `A8_02_WORKSPACE_SESSION_CONTEXT_PASS`。只解除 A8-03；A8-05 完整持久化和三层产品验收未执行。

2026-08-21 A8-03 检查点：A8R-01～06 的开发机行为、A8R-07 的诚实 `NOT_RUN` 语义、受控 Gateway
Provider Review、A8 System Prompt V1 和已知凭据持久化前阻断均通过；仓库级 7 模块 1051 项、Shell
169 项通过。真实 Electron Review 8-case 旅程虽已形成可复用执行器、外层工件哈希核验和合同测试，但本地 GUI 审批服务因用量限制拒绝
本轮启动，状态曾为 `NOT_PERFORMED_LOCAL_GUI_APPROVAL_UNAVAILABLE`。随后在 GUI 审批恢复后，真实生产
Electron 8-case 已 PASS（证据等级 `DEVELOPER_SURROGATE_ELECTRON`），因此开发机实现 Gate
`A8_03_REVIEW_APPLY_PASS` 已签发，仅解除 A8-04；不构成 Electron 22、Win10、Win7 或 RC PASS。证据见
[`a8_03_review_apply_gate_2026-08-21.html`](reports/2026-08/a8_03_review_apply_gate_2026-08-21.html) 和
[`a8-03-electron-review-qa-20260821.json`](status/a8-03-electron-review-qa-20260821.json)。

## 8. A9 Trusted Agent Runtime Gate

A9 的原子测试、阶段和五条旅程以
[`A9_TRUSTED_AGENT_RUNTIME`](tasks/A9_TRUSTED_AGENT_RUNTIME.md) §5～§7 为权威。最低产品 Gate：

| Gate | 最低证据 | 不能替代的证据 |
|---|---|---|
| A9-00 | PRD/ADR/任务书/差距矩阵一致；需求有稳定 ID、代码状态和验收项 | 口头确认或 A8 文件名 |
| A9-01 | Alpha 1 Full Access/Read Only、ToolSpec、System Prompt V2；Review 缺后端时 fail-closed、零写入、不静默提权 | 把 Review 失败冒充功能 PASS |
| A9-02 | PowerShell 5.1/CMD、管道/重定向、中文编码、取消、后台进程和残留矩阵 | 结构化 MockRunner |
| A9-03 | 多文件工具、编码/EOL、基线冲突、checkpoint、外部变化和撤销 | A8 单文件或 staging Apply |
| A9-04 | 两个兼容 fixture + 一个真实 Provider 的 SSE/tool_calls/取消/DPAPI | Replay 或固定 DeepSeek URL |
| A9-05 | 开发机 J1～J5、Git 确认、副作用不重放和诚实完成三态 | 模型文字声称测试通过 |
| A9-06 | 真实 Electron 支持模式/工具/Diff/恢复旅程、Review 零写入、SQLite A9 迁移和多窗口锁 | 静态 HTML 或内存 catalog |
| A9-07 | 同一候选 ZIP/manifest/SBOM/许可证、Win7 J1～J5、生命周期和残留 | A7/A8 PASS、Win10 或开发机 |

A9 Alpha 1 允许 Win10 smoke 在内部 Alpha 阶段非阻塞，但 Win7 五旅程、数据恢复和干净包必须全部通过；
进入 RC 前补齐同一候选 Win10 证据。按 ADR-0096，Alpha 1 Review 为延期项而不是 PASS 项；WIN7-10 的
Review 必须保持 fail-closed、零写入且不会静默 Full Access，并作为已知限制披露。Office、IDE/LSP、交互终端、Browser、
多 Agent 和插件为不适用项。

# SECURITY — 威胁模型与安全规则

## 1. 安全定位

Win7 端 Agent 是能够读取代码、修改文件、执行命令并与远程/内网模型通信的本地程序。
部署场景是企业内部。历史/A8 模式将模型输出、仓库内容、工具返回值、依赖包和更新包作为不可信输入，
以最小权限和隔离为核心；A9 Trusted Full Access 则由用户明确选择可信工作区和当前账户，优先现实可用，
以**权限如实披露、完整留痕、可取消、可回滚和外部操作确认**为核心，不宣称本地强沙箱。

Windows 7 是唯一固定客户端平台。Python、Node.js、Electron、.NET Framework、原生组件
与第三方依赖均可在获批 Runtime Profile 中使用；任何运行时选择都不能降低本文件的安全
边界，也不能绕过 `AGENTS.md` C14。

## 2. 信任边界与威胁模型

| 威胁 | 场景 | 基线对策 |
|------|------|----------|
| T1 模型或仓库内容诱导越权 | Prompt Injection 要求读取/修改工作区外文件 | 路径规范化与工作区边界校验；越界访问需策略许可和用户确认 |
| T2 危险命令或参数注入 | 模型拼接 Shell 字符串，或借终端绕过工具权限 | 工具调用使用结构化 argv/`execFile`；统一经过 Policy、权限 Broker、Runner 和审计 |
| T3 子进程失控 | 死循环、进程树残留、超大输出耗尽资源 | 超时、输出上限、强制终止和残留进程检查（`AGENTS.md` C08） |
| T4 敏感信息外泄 | 源码、凭据、环境变量或证书内容发送到未授权服务 | 网络目标白名单、最小化采集、发送前策略检查、传输与工具调用审计 |
| T5 传输被窃听或篡改 | 内网明文、错误证书或旧 TLS 栈 | HTTPS/受保护内网通道、证书校验；禁止静默关闭验证；失败时显式阻断或按获批方案降级 |
| T6 依赖或交付包被篡改 | 共享盘、U 盘、内网源或更新服务中的包被替换 | 固定版本、来源登记、哈希/签名验证、SBOM/许可证清单、失败回滚 |
| T7 审计被绕过 | UI、插件或业务模块直接调用进程/文件/网络 API | 敏感能力只通过受控服务暴露；跨边界 IPC 使用白名单和版本化结构 |
| T8 旧浏览器引擎承载不可信网页 | Win7 兼容 Electron 内核已停止安全维护 | Electron 仅渲染打包的本地 UI；现代网页和 Browser Use 远程化 |
| T9 EOL 漏洞利用 | Win7 或冻结运行时存在已知、无法修补的漏洞 | 网络分段、普通用户运行、减小攻击面、固定包和风险接受记录 |
| T10 Git 间接执行 | 恶意仓库配置、属性或 Hook 通过 filter、textconv、pager、credential/SSH helper 启动程序或联网 | 专用 Git Adapter、隔离配置/环境、命令白名单、危险特性预检与拒绝/远程化 |
| T11 终端控制序列与输入串线 | 工具输出用 VT/OSC 操作剪贴板/链接，或模型向用户终端注入按键/粘贴 | 用户输入通道与 Agent 工具隔离；限制控制序列；负向测试和清晰来源标识 |

## 3. 工具执行与文件边界

1. 历史/隔离 Agent 工具不得执行模型拼接的 Shell 字符串。A9 TrustedShellRunner 可按 ADR-0089
   执行完整 PowerShell/CMD 文本，但请求仍须通过 schema、模式、工作目录、日志和审计边界。
2. Agent Runner 与用户交互终端是两个权限域。交互终端必须由独立获批任务书实现，不能成为
   模型绕过 Policy、批准或审计的后门。
3. Agent 发起的非交互命令必须设置 stdout/stderr 字节上限并能取消和终止进程树；历史隔离 Profile
   继续使用硬超时，A9 长命令可以使用软时长提示和可选 deadline；用户
   交互终端必须具备取消、背压、会话上限与强制终止。Win7 能力不足时必须采用已验证适配器
   或明确降级，不能把“父进程已退出”等同于“进程树已清理”。
4. 历史/Review 模式默认工作区内访问。A9 Full Access 可访问当前用户有权访问的工作区外显式路径并醒目
   标识；永久/批量删除、注册表、服务、提权和系统配置修改仍须任务书、策略和用户确认，并提供恢复路径。
5. 路径校验必须覆盖盘符、UNC、中文/空格、`..`、大小写、短文件名、符号链接、junction 和
   reparse point，避免仅凭字符串前缀判断边界。
6. 历史隔离 Profile 在 Job Object 无法可靠建立时必须拒绝高风险命令或远程执行。A9 Trusted Full Access
   可在用户确认的可信环境继续，但必须报告 containment 缺失、停止后续自动执行并指导残留检查；
   `taskkill /T /F` 不能被报告为与 Job Object、独立低权限账户或远程沙箱等价。
7. 历史/隔离 Git 只能经专用适配器调用。适配器必须使用隔离的 system/global 配置和净化环境、固定
   命令/选项，覆盖或拒绝仓库级 `core.hooksPath`、filter、textconv、external diff、pager、
   editor、credential/SSH/askpass 与 remote helper 等可执行入口。A9 Full Access 可经 TrustedShell 使用
   用户真实 Git 环境，结构化 Adapter 只负责状态/Diff；该路径的 hooks/helpers 明确具有当前用户执行权。
   Git LFS 仍不是随包前置。
8. 用户交互终端的 stdin 只接受明确的用户输入事件；模型、插件与普通工具结果不得获得该
   能力。终端输出视为不可信，禁用或确认 OSC 52 剪贴板、OSC 8 链接、窗口控制、文件传输和
   等价扩展；粘贴需显示来源并避免被模型静默触发。

## 4. Electron 与桌面客户端安全基线

Electron 可作为 Win7 桌面外壳，但只能承载随包分发的本地 UI，不得把它当作通用互联网
浏览器或不可信 HTML 沙箱。Electron Runtime Profile 至少满足：

- `nodeIntegration: false`、`contextIsolation: true`、渲染器沙箱开启；
- 使用最小化 preload API，所有 IPC 通道白名单化、参数 schema 化并记录敏感操作；
- 严格 Content Security Policy；`connect-src` 仅允许任务书声明目标，不加载远程脚本、
  插件、iframe 或任意 `file://` 路径；
- 拒绝非预期导航、弹窗、新窗口、下载和外部协议；确需打开链接时交给受控策略处理；
- 使用会话级请求过滤和权限处理器阻断未声明 HTTP(S)、WebSocket、媒体、地理位置、通知、
  剪贴板等访问；不能把 `nodeIntegration: false` 误认为浏览器网络已经关闭；
- 渲染进程不直接持有模型凭据、文件系统、子进程或任意网络权限；
- 主进程的文件、网络和执行能力必须通过与其他客户端一致的 Policy/权限 Broker/审计层；
- 打包及更新固定完整依赖闭包，安装前验证哈希或签名，更新失败可回滚。

依赖现代 Chromium 安全能力的 Browser Use、网页自动化、OAuth 登录或外部站点访问应在受支持
的远程主机执行。Win7 客户端只接收结构化结果、截图或经授权的交互流，不直接用 EOL
Electron 内核打开不可信网页。

## 5. 网络、模型与凭据

- 网络不是全局禁止项。历史/受控 Gateway 必须声明目标；A9 Full Access 的 Shell/项目工具继承用户网络且
  不设域名白名单，外部写操作执行尽力行为确认。Provider 仍须记录协议、认证、重试、代理、脱敏和失败模式。
- 模型推理默认位于企业内网或受控远程服务。发送上下文遵循最小必要原则，并记录文件范围、
  工具名称和决策结果，不在普通日志中记录完整源码或提示词载荷。
- 凭据由专用配置或凭据适配器提供；不得写入源码、版本库、JSON 报告、SQLite 事件正文或
  普通日志。错误信息必须脱敏。
- 禁止静默禁用 TLS/证书校验。若 Win7 的 TLS 能力无法满足服务要求，应通过获批网关或远程
  代理终止现代 TLS，而不是在客户端接受无验证连接。
- 内网安装和受控更新可以被任务书授权；不得在普通 Agent 运行中临时下载并执行未固定版本的
  运行时、依赖或脚本。

## 6. EOL 平台与运行时风险接受

Windows 7 以及为兼容 Win7 而冻结的 Python、Node.js、Electron/Chromium 或其他运行时可能
均已停止安全维护。项目无法通过应用代码消除平台级漏洞，因此每个生产 Runtime Profile
必须记录：

1. 精确版本、架构、补丁前置、来源和校验值；
2. EOL 状态、已知关键风险和业务风险接受人；
3. 允许的网络区域、服务端目标与阻断策略；
4. 普通用户/服务账户权限、工作区与缓存目录权限；
5. 升级、回滚、下线和远程替代方案；
6. Win7 实机安全验收结果。

部署默认采用网络分段、最小入口、普通用户权限和完整包交付。是否离线、企业内网安装或受控
更新由任务书声明；“完全离线”不再是全项目强制条件，但仍可作为具体 Profile 的安全控制。

## 7. Phase 1/2 冻结安全合同

ADR-0027 不追溯放宽已批准任务：

- Phase 1 Capability Probe 保持零网络、零系统改动、Python 3.8.10 标准库和固定探测命令
  白名单；TLS 检查只读取本地能力，不建立连接。
- Phase 1 报告不包含环境变量全量、用户文件列表、网络配置详情或证书完整内容；JSON 使用
  临时文件加原子替换。
- Phase 2 保持目标工作区只读、Mock/Replay 驱动、无真实模型、无网络、无用户代码修改。
- Phase 1/2 之外的新能力必须先取得 C14 任务授权，不得借 ADR-0027 写入既有白名单。

## 8. 安全相关开发纪律

- 所有异常路径必须结构化留痕；禁止 `except: pass` 或等价的静默吞错。
- 删除和覆盖前必须按任务风险提供备份、事务或可恢复操作；清理失败也必须记录。
- 持久化协议和审计事件必须带版本号；解析不可信数据时设置大小、深度和字段限制。
- 每个阶段按 `docs/EVALUATION.md` 执行与其 Runtime Profile 对应的安全测试。

## 9. A8 会话、投影、准备区与迁移安全合同

A8-00 的完整合同见
[`A8_00_PRODUCT_ARCHITECTURE_AND_DATA_CONTRACT.md`](prds/A8_00_PRODUCT_ARCHITECTURE_AND_DATA_CONTRACT.md)，
并由 ADR-0075 冻结。A8-01～A8-05 还必须满足：

1. 原始 `gateway.delta` 先经过主进程 schema、归属、大小和序列校验并写入 EventLedger；Renderer 的
   聚合投影不能修改、删除或替代原始审计事实。
2. 投影必须有 256 KiB 段上限、1 MiB Assistant 消息上限、来源 seq/指纹和缺口关闭语义；迟到、乱序、
   冲突或缓存漂移不能静默拼接。
3. Renderer 只接收版本化展示 DTO 和最小动作 API。文件、blob、SQLite、凭据、进程和网络继续位于
   main/Core/Adapter 边界之后；Review 视觉上的“接受”不等于写能力。
4. Apply 的一次性授权必须绑定 Session、Task、Review revision、目标基线、预览与 accepted-set 哈希；
   内容或决定变化、超时、主体变化和基线漂移全部废止授权。
5. Gateway API key、Authorization、代理密码和 DPAPI 明文作为 tainted value；字段名与已知值扫描覆盖
   事件、聊天、Review DB、blob、Diff、验证输出、日志和报告。命中时拒绝持久化，不记录原值。
6. A7 source 只读打开；迁移代码不得解密或复制 `credentials.v1.json`，不得从旧事件推测工作区或会话，
   不得操作 A7 安装目录、注册表、服务、PATH、网络、路由或防火墙。
7. 未知 schema、事件序列缺口、指纹/实体/blob 哈希错误、Workspace 恢复不确定或半迁移临时目录清理
   未确认时，产品只能进入只读 Diagnostics，不得部分加载后继续模型、Runner 或写入。
8. A8-02 的产品专用 IPC 使用精确 action/payload 字段白名单并拒绝额外属性；只读文件接口最多返回
   500 行/128 KiB，单轮上下文最多 24 项/64 KiB。文件和目录由主进程重新读取并计算 SHA-256，Renderer
   传入的路径、内容哈希或范围不能直接成为权威事实。Win7 未形成长路径 Profile，达到 MAX_PATH 时
   结构化拒绝；reparse 祖先越界同样 fail-closed。
9. 真实 Gateway 使用 ADR-0079 的版本化 System Prompt，但提示词不产生 capability。已知 API key、代理
   密码及其 Bearer/base64 形式在用户 prompt、Workspace 工具结果、Provider chunk/响应/工具参数进入
   EventLedger、聊天投影或普通报告前阻断；错误只保留安全分类和不含原值的说明。

## 10. A9 Trusted Full Access 风险接受

A9 的安全合同由 ADR-0089 和
[`Windows 7 Trusted Coding Agent 产品需求合同 V1`](prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md)
定义。首次启用 Full Access 必须清楚说明：

1. Agent、Shell、Git hooks、项目脚本和依赖安装拥有当前 Windows 用户的真实权限；
2. Win7、Electron 22、PowerShell 5.1、Git 2.46.2 和项目工具均可能 EOL，产品不提供现代沙箱等价；
3. Shell 网络不隔离，仓库内容可能触发项目命令的间接执行；
4. checkpoint、Diff、回收区、审计和审批降低误操作风险，但不能保证所有副作用可逆；
5. 用户应在受信项目、受限账号、可恢复工作副本和合适网络分段中使用 Full Access。

A9 仍禁止 Renderer 直接获得 Node/fs/进程/凭据/任意网络，禁止模型向用户交互终端注入 stdin，禁止自动提权，
默认验证 TLS，并对 Provider 凭据强制 DPAPI/内存保存和日志脱敏。可用性优先不等于关闭这些产品边界。

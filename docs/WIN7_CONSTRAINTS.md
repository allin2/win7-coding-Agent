# WIN7_CONSTRAINTS — Windows 7 兼容矩阵与依赖评审

本文件是 Win7 目标端兼容性的**单一事实来源**，优先级仅次于 `AGENTS.md`。
自 ADR-0027 起，唯一固定客户端平台是 Windows 7 SP1 x64；本文件不再把某一种语言、
标准库、CLI 或完全离线交付误写成 Win7 自身限制。

本文使用三类规则：

- **平台红线**：Win7 目标端确实不具备或不能可靠依赖的能力。
- **Runtime Profile**：某个组件主动选择的精确运行时、依赖、补丁和降级合同。
- **历史合同**：Phase 1/2 与既有原型已经冻结的 Python 3.8.10 规则，只在这些任务范围内继续有效。

兼容性登记或架构准入不等于实现授权；所有实现仍须满足 `AGENTS.md` C14。

## 1. 目标环境基线

| 项 | 固定性与要求 |
|----|--------------|
| 操作系统 | **固定**：Windows 7 SP1 x64（build 7601） |
| 处理器架构 | 正式交付默认 x64；若增加 x86 组件，必须建立独立 Profile 与验收矩阵 |
| 系统补丁 | 不假设天然存在。各 Profile 必须声明前置并由安装前检查验证；签名与 TLS 常用基线见 §4 |
| 运行时 | **不全局固定**。Python、Node.js、Electron、.NET Framework、Win32 原生组件及第三方依赖均可作为候选 |
| 控制台 | 典型环境为 conhost + `cmd.exe`，中文系统常见 CP936；不得假设 ANSI/VT 或现代伪终端 |
| 文件系统 | 典型为 NTFS；不得假设启用 Win10 长路径策略，按传统 `MAX_PATH` 风险设计 |
| 权限 | 不全局固定为普通用户或管理员；每项能力必须声明最低权限并遵循最小权限原则 |
| 网络 | 可选择完全离线、企业内网或受控更新；不得假设公网、代理、企业 CA 或 DNS 一定可用 |
| 构建环境 | 可使用受维护的现代 Windows/Linux CI；Win7 只要求运行已打包产物并完成目标端验收 |

## 2. 不得隐式假设的环境能力

除任务书和 Runtime Profile 明确列出的随包组件或安装前置外，不得假设目标机已安装：

- Python、Node.js、.NET Framework、PowerShell、Visual Studio、.NET SDK、VC Runtime；
- Git、Git LFS、OpenSSH、浏览器、包管理器、`py.exe`、可联网的 `pip`/`npm`；
- `winget`、Chocolatey、Windows Terminal、现代 WebView2；
- 企业 CA、可用公网、特定代理、GPU 加速或管理员权限。

Win7 本地不能提供 WSL2、Docker Desktop、Windows Sandbox、ConPTY、MSIX/WinUI 3；
它们可存在于构建机或内网服务，但不得成为目标端本地运行前置。必需能力必须随包交付或
由安装器进行可解释的前置检查；可选能力缺失时必须结构化降级，不能崩溃。

## 3. 历史 Python 3.8 标准库 Profile

Profile ID：`PY38-STDLIB-FROZEN`

本节不是全项目语言上限。它只适用于：

- `docs/tasks/PHASE_01_CAPABILITY_PROBE.md`；
- `docs/tasks/PHASE_02_READONLY_CODE_ANALYSIS.md`；
- 明确继承该 Profile 的既有原型或新任务。

新组件可以选择其他可在 Win7 运行的 Python、Node.js、Electron、.NET Framework 或
原生运行时，但必须按 §6 登记并在 Win7 实机验证。对于
`PY38-STDLIB-FROZEN`，CPython 3.8.10 x64 与仅标准库仍是冻结任务合同。

**语法：**
- `match` / `case` 结构模式匹配（3.10）
- 带括号的多项 `with`（3.9 语法容忍，3.10 正式）——统一禁止
- `except*`（3.11）
- 类型标注使用内置泛型：`list[str]`、`dict[str, int]`（3.9）→ 用 `typing.List` 等
- `X | Y` 类型联合标注（3.10）→ 用 `typing.Union` / `typing.Optional`

**标准库 API：**
- `str.removeprefix` / `str.removesuffix`（3.9）
- `dict |` / `dict |=` 合并运算（3.9）
- `zoneinfo`、`graphlib`（3.9）
- `functools.cache`（3.9）→ 用 `functools.lru_cache(maxsize=None)`
- `math.lcm`、`math.nextafter`（3.9）
- `random.randbytes`（3.9）
- `subprocess` 的 `Popen(..., pipesize=)`（3.10）
- `pathlib.Path.readlink`（3.9）、`Path.hardlink_to`（3.10）
- `argparse` 的 `BooleanOptionalAction`（3.9）
- `ast.unparse`（3.9）

**允许但需注意（3.8 存在）：** 海象运算符 `:=`、`f"{x=}"`、`typing.Literal/Protocol/TypedDict`、`importlib.metadata`。

**该 Profile 的强制门槛：** 其范围内所有 `.py` 必须通过 CPython 3.8.10 的
`python -m compileall -q`；仅语法检查不够，API 使用还需按本清单核查。

## 4. Win7 系统能力矩阵

| 能力 | Win7 结论 | 目标端处理 |
|------|-----------|------------|
| ANSI/VT 控制台 | conhost 不可靠支持 | 直连控制台使用兼容输出；GUI 终端通过专用适配器 |
| UTF-8 系统 ACP | 不支持 Win10 的全局 UTF-8 ACP 模式 | 内部 Unicode/UTF-8，控制台边界显式转码 |
| `LongPathsEnabled` | 不支持 Win10 1607+ 策略 | 预警/限制路径；`\\?\` 方案需单独 Profile 与测试 |
| `CreatePseudoConsole` / ConPTY | 不支持，最低为 Win10 1809 | 可选 `winpty` 兼容模式；核心 Agent 命令不依赖 PTY |
| AppContainer / LPAC | Win7 不支持现代 AppContainer | Restricted Token、Low Integrity、ACL、独立低权限账户或远程沙箱 |
| WSL2 / Docker Desktop / Windows Sandbox | 不支持 | 移至现代构建机、内网 VM 或容器执行服务 |
| UWP、MSIX、WinUI 3 | 不支持 | Electron、WPF/WinForms、Qt/Win32、NSIS/MSI/ZIP 等兼容方案 |
| Windows Terminal / Win10 Toast | 不支持 | 内置终端兼容层、托盘气泡、任务栏闪烁或应用内通知 |
| 当前版 Chromium/WebView2 | 不支持受维护的新版本 | 本地仅加载可信 UI；开放网页/Browser Use 移至受维护服务或外部浏览器 |
| Job Object | 支持，但 Win7 不支持嵌套 Job | 启动时探测；失败时高风险命令拒绝/远程执行，只有历史或获批低风险命令可显式降级为 PID 树/`taskkill` |
| Restricted Token / ACL / Low Integrity | 支持 | 可用于减权，但不得宣称等价于现代强沙箱 |
| DPAPI | 支持 | 可保存当前用户凭据；仍需定义轮换、清除和审计 |
| Task Scheduler 2.0 | 支持 | 可用于明确授权的定时任务或启动项 |
| `taskkill` / `where` / `cmd` / `findstr` | Win7 自带 | 使用前仍探测；不得依赖 Win10 自带的 `winget`、`curl`、`tar` |

建议的签名/TLS 系统基线为 KB4490628、最新 KB4474419、KB3140245；需要
Schannel 密码套件增强时可加入 KB3042058。KB3140245 本身不等于 WinHTTP 已默认启用
TLS 1.2；相关 Profile 还必须声明 `DefaultSecureProtocols` 配置或由应用显式选择协议，
并执行真实握手验证。这些补丁与配置不是未声明即可假设存在的全局前提，而是相关
Runtime Profile 必须检测、安装/配置或提供明确失败说明的前置条件。补丁检测必须接受
微软声明的累计更新取代关系，不能只因某个原始 KB 编号未列出就误判为缺失。

## 5. 强制编码与路径规则

1. 每种语言的文本 I/O 都必须显式声明编码；未知编码或必须原样保持的文件按字节处理。
   `PY38-STDLIB-FROZEN` 范围继续执行“文本 `open()` 必须有 `encoding=`”检查。
2. 程序自产的协议、报告、日志和配置统一 UTF-8 无 BOM；GUI 内部使用 Unicode。
   直连 Win7 conhost 时由控制台 Profile 负责 CP936、不可表示字符和 VT 降级。
3. 需要保持用户文件换行时必须关闭隐式换行转换；编辑后不得无关地改写整文件换行或 BOM。
4. 路径必须使用对应运行时的路径 API 组合与规范化，禁止用字符串猜测盘符、UNC 或分隔符语义。
5. 测试至少覆盖：中文、空格、中文+空格、`%`、`#`、相对/绝对路径、盘符、UNC，以及接近
   `MAX_PATH` 的边界。
6. 工作区边界检查必须解析 Junction、Symbolic Link、Mount Point 等 Reparse Point；
   只做字符串前缀比较不构成安全边界。
7. Agent 命令默认使用结构化 argv/`execFile`；需要固定 Shell 脚本或用户交互终端时，必须经过
   批准的适配器并记录 Shell、编码、工作目录和完整审计。
8. 原生 Windows 边界使用宽字符 API（例如 `CreateProcessW`）；不得把 CP936 字节串当成通用路径协议。
9. 控制台 ASCII-only 仅属于历史 Phase 1/2 CLI 合同，不再限制桌面 GUI、IPC、数据库或日志。

## 6. 依赖评审登记表

**规则：** 任何新的运行时、框架、第三方库、原生模块、系统 API 或外部可执行文件，
必须先登记。第三方依赖是允许项，不是默认禁用项。

每次评审至少回答：

1. 精确版本、x64 工件、Runtime/ABI 与传递依赖是什么？
2. Win7 SP1 x64 的证据来自官方说明、源码边界还是项目实测？
3. 需要哪些 KB、VC Runtime、管理员权限、代理、CA 或硬件前置？
4. 构建机与目标机分别需要什么？目标机是否会执行在线依赖解析？
5. 缺失或失败如何降级、回滚或拒绝启动？
6. 工件来源、哈希/签名、许可证、SBOM、EOL 与漏洞回补责任是什么？
7. 需要哪些 Win7 实机用例，验收证据保存在哪里？

“架构候选”只表示可以进入任务设计，不构成 C14 实现授权；真正使用时仍须由任务书冻结版本、
允许路径和测试。

| ID | 依赖 / Profile | 用途 | Win7 结论与交付边界 | 降级 / 风险 | 状态 | ADR |
|----|----------------|------|----------------------|-------------|------|-----|
| D-001 | Python `sqlite3` | Phase 1/2 状态与审计 | CPython 3.8.10 自带 SQLite 3.31 | 历史 Schema 不追溯修改 | 历史批准 | ADR-0002 / ADR-0027 |
| D-002 | `taskkill.exe` | Phase 1/2 进程树终止 | Win7 System32 自带 | `Popen.kill()` 仅杀直接进程并记录降级 | 历史批准 | ADR-0005 / ADR-0027 |
| D-003 | `git.exe` | Phase 1 版本探测 | 不假设存在 | Phase 1 缺失时降级；新客户端见 D-012 | 历史批准（仅探测） | ADR-0007 / ADR-0027 |
| D-004 | `where.exe` | 可执行文件定位 | Win7 自带 | Python Profile 可用 `shutil.which` | 批准（备用） | — |
| D-005 | Python `ctypes` | 历史候选 Job Object 绑定 | Win7 可用但 Phase 1/2 未准入 | 历史实现继续使用 `taskkill` | 历史未批准 | — |
| D-006 | CA bundle / 企业 CA | HTTPS 证书验证 | 可随包携带或部署到受信任存储 | 校验失败必须拒绝连接，禁止关闭 TLS 验证 | 架构候选；任务待定 | — |
| D-007 | `tasklist.exe` | Phase 1 进程存活验证 | Win7 System32 自带 | 子步骤记 degraded | 历史批准 | ADR-0005 |
| D-008 | Python `winreg` | Phase 1 只读 OS 版本探测 | 只读固定键；禁止历史任务写注册表 | 来源失败时继续其他探测 | 历史批准（限定用途） | ADR-0015 |
| D-009 | Electron 22.3.27 x64 | Codex-like 桌面 Shell | 最后支持 Win7 的 Electron 主版本最终补丁；内含 Chromium 108 / Node 16.17.1 | 全栈 EOL；只加载可信本地 UI，开放网页远程化 | 架构候选；未获实现授权 | ADR-0027 |
| D-010 | Node.js 12.22.12 portable x64 | 可选独立 CLI、Agent Host 或旧插件宿主 | Node 12 最终版；上游最后正式测试 Win7 为 12.14.1，必须实机复验 | EOL；Electron 客户端无需因此额外安装 Node 12 | 架构候选；未获实现授权 | ADR-0027 |
| D-011 | `node-pty` 0.10.0 + `winpty` 0.4.3 x64 | 可选交互终端兼容模式 | Win7 无 ConPTY；需固定预编译 ABI | 全屏 TUI、Unicode、resize、Ctrl 与回收均需实测 | 架构候选；未获实现授权 | ADR-0027 |
| D-012 | Git for Windows 2.46.2 x64（优先 MinGit/裁剪包） | Git / Worktree 正式能力 | 最后支持 Win7/8 的 Git for Windows 系列最终补丁候选 | 已停止获得后续安全修复；隔离配置，默认移除/禁用 Git LFS、GCM 等未独立评审组件 | 架构候选；未获实现授权 | ADR-0027 |
| D-013 | Win32 Runner（Job Object / Restricted Token / ACL） | 进程树、限额、减权执行 | Win7 API 可用；推荐 C++ x64 原生辅助程序 | Job 不可嵌套；同用户减权不等价强沙箱 | 架构候选；未获实现授权 | ADR-0027 |
| D-014 | Runtime 专用 SQLite 绑定 | 桌面状态、事件与审计 | 必须固定 SQLite/ABI，并在现代构建机预编译 | 数据库放本地盘；迁移和恢复需版本化 | 架构候选；未获实现授权 | ADR-0027 |
| D-015 | Win7 x64 上的 .NET Framework 4.8 | 可选 WPF/WinForms 客户端或辅助程序 | Win7 SP1 可安装的最高 .NET Framework；在 Win7 上已无厂商支持 | 需要独立安装前置与 EOL 风险评审 | 架构候选；未获实现授权 | ADR-0027 |
| D-016 | 自定义 fail-closed Updater | 企业内网或离线更新 | 使用 Authenticode/WinVerifyTrust 或内置公钥签名清单 + 包哈希 | 不得在验签错误时继续安装；必须旁路安装和回滚 | 架构候选；未获实现授权 | ADR-0027 |

## 7. 已知兼容性陷阱（实现时必须规避）

| # | 陷阱 | 规避 |
|---|------|------|
| P01 | 普通超时/kill 往往只结束直接子进程，孙进程残留 | Phase 1/2 用 D-002；新 Runner 优先 D-013，并验证整棵进程树 |
| P02 | stdout/stderr 管道不持续消费会死锁或耗尽内存 | 并发读取、按字节背压与截断；不可先无限等待再读取 |
| P03 | `dir`、`echo` 等是 `cmd.exe` 内置命令 | 只在批准适配器中显式调用 `cmd.exe /d /s /c`；Agent 默认走结构化 argv |
| P04 | CP936 conhost 可能无法表示 Unicode，且不支持现代 VT 行为 | GUI/日志使用 Unicode/UTF-8；控制台适配器显式转码和降级 |
| P05 | Win7 根证书与 Schannel/WinHTTP 默认协议可能陈旧 | 检查补丁、证书链、TLS 1.2 与代理；自带或部署企业 CA，禁止跳过验证 |
| P06 | 跨平台运行时可能暴露 Win7 不存在的 API | 以 Win7 实机/API 扫描为准，不能用现代开发机通过替代目标端证据 |
| P07 | 平台相关时间格式、时区和夏令时行为不同 | 持久化 UTC ISO 8601；显示层再按明确时区转换 |
| P08 | 260 字符路径限制：临时目录 + 深层中文目录易超限；超限异常在 CPython 3.8/Win7 上有两种形态——`OSError.errno == errno.ENAMETOOLONG` 或 `OSError.winerror == 206`（`ERROR_FILENAME_EXCED_RANGE`），且不得用硬编码整数（如 POSIX 值 36）比较 errno | 测试路径深度受控；识别逻辑必须同时匹配 `errno.ENAMETOOLONG` 常量与 `winerror == 206` 两种形态，命中任一即报 `PATH_TOO_LONG` 结构化错误（ADR-0022） |
| P09 | 只读属性、ACL、占用句柄会使删除/替换失败 | 不强行吞错；报告原因，经 Policy 批准后调整属性或安排重启替换 |
| P10 | SQLite 数据库放网络驱动器锁不可靠 | 状态库路径必须是本地盘；Probe 报告磁盘类型不做强校验但记录 |
| P11 | Win7 Job Object 不支持嵌套，企业启动器可能已把客户端放入 Job | 用 `IsProcessInJob` 探测；无法可靠 containment 时拒绝/远程执行高风险命令，PID 树/`taskkill` 仅用于获批低风险兼容回收 |
| P12 | Electron 22 / Chromium 108 已 EOL，不能作为不可信网页的安全边界 | Renderer 只加载签名本地资源；严格 CSP、隔离上下文、禁导航/新窗口；Browser Use 远程化 |
| P13 | 通用自动更新库在 Win7 上可能因 PowerShell/签名检查失败而 fail-open | 使用 D-016；任何验签异常必须 fail closed，不得安装 |
| P14 | Junction/Reparse Point 可让规范化前的“工作区内路径”越界 | 在最终句柄/真实路径层校验边界；写入前后二次检查并审计 |
| P15 | Electron ABI、Node ABI、VC Runtime 与原生 `.node`/DLL 不匹配会在目标机加载失败 | 在现代 CI 为精确目标重建；随包带齐依赖并在干净 Win7 x64 验证 |
| P16 | Node 12.22.12 是最终版但不是上游最后正式测试 Win7 的版本 | 不把“同一 major”当证据；对目标精确版本执行完整 Win7 回归 |
| P17 | 老显卡驱动可能导致 Electron 黑屏或 GPU 崩溃 | 提供早期禁用硬件加速的安全启动模式，并纳入恢复测试 |
| P18 | Win7 SHA-2/TLS 补丁安装常需重启，半完成状态会造成误判 | 安装前后检测精确 KB/版本与 pending reboot，给出可恢复流程 |
| P19 | Git 即使使用结构化 argv，仍可经仓库配置、`.gitattributes`、hooks、filter、textconv、pager、credential/SSH helper 或 fsmonitor 间接执行 | 使用专用 Git Profile：隔离配置/环境、命令白名单、危险入口预检与负向测试；无法证明安全时拒绝或远程执行 |
| P20 | winpty/node-pty 只解决兼容性，不隔离终端输入或恶意控制序列 | 模型无用户终端 stdin 能力；限制 OSC/外部协议/剪贴板/粘贴并测试 shell 与孙进程回收 |

## 8. 本清单的维护

- 新增平台陷阱或 Runtime Profile：直接追加并注明证据类型（官方文档、源码边界、Win7 实测）。
- 放宽真正的平台红线或修改依赖准入模型：必须新增 ADR；调整候选精确版本也必须留下评审记录。
- 历史任务引用的编号、Profile 与错误语义不得静默改义；需要变更时通过新 ADR 或任务书修订说明。
- 每个实现任务都要生成“适用项清单”，不要求无关组件机械满足其他 Profile。
- Win7 实机验收报告是最终证据；现代 CI、兼容模式或“在同一主版本可运行”只能作为前置证据。

## 9. 候选 Profile 的上游依据

- [Electron：22 是最后支持 Windows 7/8/8.1 的主版本](https://www.electronjs.org/blog/windows-7-to-8-1-deprecation-notice)
- [Electron 22.3.27 的 Chromium / Node / V8 版本](https://releases.electronjs.org/release/v22.3.27)
- [Electron 安全检查清单](https://www.electronjs.org/docs/latest/tutorial/security)
- [Node.js 12.22.12 发布说明](https://nodejs.org/en/blog/release/v12.22.12)
- [Microsoft：`CreatePseudoConsole` 最低系统要求](https://learn.microsoft.com/en-us/windows/console/createpseudoconsole)
- [Microsoft：Job Object 行为与版本差异](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)
- [Microsoft：Nested Job 从 Windows 8 / Server 2012 开始支持](https://learn.microsoft.com/en-us/windows/win32/procthread/nested-jobs)
- [Microsoft：.NET Framework 系统要求](https://learn.microsoft.com/en-us/dotnet/framework/get-started/system-requirements)
- [Microsoft：Win7 SHA-2 代码签名支持要求](https://support.microsoft.com/en-us/topic/2019-sha-2-code-signing-support-requirement-for-windows-and-wsus-64d1c82d-31ee-c273-3930-69a4cde8e64f)
- [Git：attributes 可配置 filter / textconv 等行为](https://git-scm.com/docs/gitattributes)
- [Git：Hook 执行模型](https://git-scm.com/docs/githooks)
- [Git for Windows：版本与平台支持发布记录](https://github.com/git-for-windows/build-extra/blob/main/ReleaseNotes.md)

上游依据用于筛选候选，不替代本项目在 Win7 SP1 x64 上对精确工件的验收。

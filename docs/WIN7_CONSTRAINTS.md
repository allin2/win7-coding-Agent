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
Schannel 密码套件增强时可加入 KB3042058。**KB3140245 + `DefaultSecureProtocols` 主要作用于
使用 WinHTTP 默认协议标志的程序**，它本身不等于全系统 TLS 1.2 就绪，**也不能证明 Electron
`net`（Chromium 网络栈）或 Node `https`（随包 OpenSSL）的 TLS 1.2 可用**——后两者走各自的
库实现，与 WinHTTP 注册表基线无关。因此相关 Runtime Profile 必须先声明所用网络栈，再据此
声明 `DefaultSecureProtocols`（仅 WinHTTP 路径）或由应用/库显式选择协议，并对每条栈执行真实
握手验证。这些补丁与配置不是未声明即可假设存在的全局前提，而是相关
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
7. Agent 命令默认使用结构化 argv/`execFile`。A9 TrustedShell Profile 可按 ADR-0089 接受完整
   PowerShell/CMD 字符串，但必须经过批准的 TrustedShellRunner，并记录 Shell、版本、编码、工作目录、
   输出、取消和完整审计；历史任务与隔离 Runner 继续禁止模型拼接 Shell。用户交互终端仍须独立授权。
8. 原生 Windows 边界使用宽字符 API（例如 `CreateProcessW`）；不得把 CP936 字节串当成通用路径协议。
9. 控制台 ASCII-only 仅属于历史 Phase 1/2 CLI 合同，不再限制桌面 GUI、IPC、数据库或日志。

### 5.1 A9 TrustedShell Win7 兼容合同

- 启动时探测 `powershell.exe` 与 `$PSVersionTable.PSVersion`；Windows PowerShell 5.1 为首选，缺失或低于
  正式基线时自动降级 `cmd.exe`。WMF 5.1 不随 Alpha 1 自动安装。
- PowerShell 2～4 仅为用户显式启用的 Best Effort；PowerShell 7、Windows Terminal、ConPTY、`curl`、
  `tar` 和 Git Bash 均不得假设存在。
- PowerShell 5.1 命令使用 UTF-16LE `-EncodedCommand`、`-NoProfile`、`-NonInteractive`，并归一化
  `$LASTEXITCODE`；不能依赖 `Out-File`/`>` 的默认编码写源码。
- CMD 命令明确记录系统 OEM/ANSI code page，stdout/stderr 先按字节捕获，再按 UTF-8/CP936 Profile 解码。
- 普通调用关闭 stdin；开发服务器使用独立后台句柄。没有固定硬 deadline 的命令仍必须可取消、限制输出、
  记录软时长警告并报告进程树清理结果。

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
| D-011 | `node-pty` 0.10.0 + 其内置 `winpty` 0.4.4-dev 精确快照 x64 | 历史交互终端候选 | A5 在 Win7 实测交互输入不可用；工件只保留为 No-Go 证据 | 上游均停维护；v1 不交付、不进入生产路径 | No-Go（ADR-0067） | ADR-0027 / ADR-0063 / ADR-0067 |
| D-012 | Git for Windows 2.46.2 x64（优先 MinGit/裁剪包） | Git / Worktree 正式能力 | 最后支持 Win7/8 的 Git for Windows 系列最终补丁候选 | 已停止获得后续安全修复；隔离配置，默认移除/禁用 Git LFS、GCM 等未独立评审组件 | 架构候选；未获实现授权 | ADR-0027 |
| D-013 | Win32 Runner（Job Object；按 Profile 选择 Restricted Token 或 Current User） | 进程树、限额、取消和清理证明 | v21 已在 A4/A5 的独立租约下通过 containment/T05；V24（SHA-256 `7f86dac8...0d1c134`）又在 `D013-RUNNER-20260811-020000` 完成产品 L01～L10 `WIN7_PASS`，H3 r2 只读日志与取消界面验收通过；A9-09 新增 v25 Current-User Profile，尚未构建或实机验证 | Job 不可嵌套；v24 同用户减权不等价强沙箱；v25 明确不减权且不提供文件/网络隔离；两个 Profile 的协议、工件和证据不得混用 | v24=`CONTAINMENT_READY_FOR_LOW_RISK_NONINTERACTIVE_RUNNER`；v25=`APPROVED_FOR_IMPLEMENTATION / WIN7_NOT_PERFORMED` | ADR-0027 / ADR-0065 / ADR-0067 / ADR-0071 / ADR-0072 / ADR-0101 |
| D-014 | `better-sqlite3` 8.7.0 + 内嵌 SQLite 3.43.1（FTS5） | 桌面状态、事件、审计与代码检索索引 | 在 D-017 构建机按 Electron 22 ABI 110 重编译；固定 `ENABLE_FTS5`、`ENABLE_COLUMN_METADATA`、`THREADSAFE=2` | 数据库只放本地盘；迁移和恢复版本化；旧 SQLite 漏洞由项目回补 | SPIKE_04 已授权；生产未授权 | ADR-0027 / ADR-0033 / ADR-0064 |
| D-015 | Win7 x64 上的 .NET Framework 4.8 | 可选 WPF/WinForms 客户端或辅助程序 | Win7 SP1 可安装的最高 .NET Framework；在 Win7 上已无厂商支持 | 需要独立安装前置与 EOL 风险评审 | 架构候选；未获实现授权 | ADR-0027 |
| D-016 | 自定义 fail-closed Updater | 企业内网或离线更新 | 使用 Authenticode/WinVerifyTrust 或内置公钥签名清单 + 包哈希 | 不得在验签错误时继续安装；必须旁路安装和回滚 | 架构候选；未获实现授权 | ADR-0027 |
| D-017 | Windows 10 x64 + VS 2019 `[16.0,17.0)` / MSVC v142 14.2x + Windows SDK 10.0.19041.0（目标 Win7 SP1 x64） | 构建 D-013 原生 helper 与 D-011 winpty 宿主 | 仅构建机依赖，目标机不安装；产物须静态链接 CRT 或随包携带经登记的 VC Runtime | CPython 3.8.10 AMD64、实际 VS/MSVC 补丁版本和 PE/API/CRT 证据必须记录 | SPIKE_02 已授权；A9-09 仅授权 D-013 v25 生产构建 | ADR-0028 / ADR-0063 / ADR-0101 |
| D-018 | Electron 22.3.27 `safeStorage`（Windows DPAPI / Current User） | A3.2 API key 静态加密持久化 | 复用 D-009 随包 Electron，不新增模块或目标机前置；只在 main 进程、`app.ready` 后使用同步 `isEncryptionAvailable/encryptString/decryptString`，密文绑定当前 Windows 登录凭据 | 不可用、密文损坏或账户不匹配时 fail-closed 并降级为仅内存；不能防御同一用户上下文中的恶意进程；Electron 22 EOL 风险继续适用 | 批准（仅 A3.2 API key） | ADR-0062 |
| D-019 | A9 TrustedShell Profile：Windows PowerShell 5.1 / `cmd.exe` / 用户显式 Shell + D-013 v25 协议 v2 | A9 完整命令、测试、构建与托管后台进程 | `cmd.exe` 为 Win7 自带保底；PowerShell 5.1 需 WMF 5.1 探测，不由 Alpha 自动安装；显式 Shell 绑定 canonical path/文件身份/哈希/版本；执行宿主继续为 Electron 22/Node 16 + D-013 | 当前用户真实权限且不构成沙箱；PS 2～4 Best Effort；网络不隔离；无可靠回收时明确残留并停止后续自动执行；v24 不得冒充本 Profile | ADR-0101 已授权实现；WIN7-20 尚未执行 | ADR-0089 / ADR-0101 |
| D-020 | Electron 22.3.27 `safeStorage`（Windows DPAPI / Current User）A9 草稿 Profile | 按对话加密保存未发送草稿 | 复用 D-009/D-018 随包能力，不新增依赖或目标机前置；主进程加密后只把 Base64 密文写入 A9 SQLite | DPAPI 不可用、密文损坏或账户不匹配时仅内存且明确提示；草稿不进入事件、checkpoint、日志、审批或模型，除非用户主动发送 | A9 Alpha 1 批准，Win7 增量实机待 WIN7-17 | ADR-0098 |

### 6.1 架构候选依赖的 C16 评审档案（七问）

以下档案回答 §6 七问中的来源、哈希、许可证、SBOM 与 EOL 责任。**哈希锁定规则：**
工件 SHA-256 在对应 Spike 首次入库时锁定并登记于本节与 SBOM 清单；锁定前状态为
`待锁定`，任何构建不得使用未锁定哈希的工件。

| ID | 工件来源（官方渠道） | 许可证 | 哈希 | SBOM/传递依赖 | EOL 与漏洞回补责任 | Win7 实机用例 |
|----|----------------------|--------|------|----------------|--------------------|----------------|
| D-009 | github.com/electron/electron releases v22.3.27（win32-x64） | MIT（含 Chromium/Node 第三方许可证包） | 待锁定（SPIKE_01） | Electron 自带 third-party 清单随包归档 | 上游已 EOL；本项目自担：不处理不可信网页内容，开放内容远程化（ADR-0028） | SPIKE_01 全项 |
| D-010 | nodejs.org/dist/v12.22.12（win-x64，可选） | MIT | 待锁定（若启用） | 无原生附加依赖 | 上游 EOL；仅作 CLI 宿主备选，默认不交付 | 启用时另立用例 |
| D-011 | node-pty 0.10.0 npm 归档 + 其内置 winpty 0.4.4-dev 精确派生快照（ADR-0063） | MIT | node-pty TGZ `03b59d30068544160ab822a86bdbfe764e822d633273732d95cba5995206bf69`；内置 winpty ZIP `751e974babb4448ea707151e7a8cc0dc83cac925a46797e1bb0770159475b4c0`；构建 tooling lock `85061e78b5cf181e7ea554d81d4a6eb455d0dc5ce8f7ebf9fddcc1e582602458` | Electron ABI 110 重编译；96 个构建期 npm 组件见 `spikes/02-terminal-containment/build-win10/kit/compliance/npm-sbom.cdx.json`，不进入目标运行时 SBOM | 上游停维护；项目自担，输出按 C19 不可信过滤；audit 风险见包内 `RISK_REGISTER.md` | SPIKE_02 终端矩阵 |
| D-012 | Git for Windows 2.46.2 MinGit x64（github.com/git-for-windows/releases/download/v2.46.2.windows.1/MinGit-2.46.2-64-bit.zip） | GPLv2 | `MinGit-2.46.2-64-bit.zip` SHA-256=`0dca60869825ceb8b6108be69f0c536174fbca45e11300f2c14c34632d8238ed`；`cmd/git.exe` SHA-256=`02ed65496cb0b1ccfc85a8201fc224b1fa21ab15eb4eda80316bcc346b2b50a1` | MinGit 裁剪包内容清单归档；确认不含 LFS/GCM（仅便携 git 子系统） | 上游该系列停止 Win7 修复；靠 ADR-0032 隔离配置收敛攻击面 | SPIKE_03 G10 矩阵 |
| D-013 | 本项目自研 C++ helper（源码在本仓库，D-017 工具链构建） | Apache-2.0 | v24 哈希保持历史锁定；v25 构建产物哈希须进入独立 A9 input lock 与发布清单 | 仅 Win32 API + CRT；v24 协议 v1 与 v25 协议 v2 分别登记 | 本项目全责；v25 仍为 argv/command + JSON over stdio，不加载插件、不监听网络 | SPIKE_02 containment 矩阵；A9-09 Win10/Win7 前后台/取消/残留矩阵 |
| D-014 | better-sqlite3 8.7.0 + 内嵌 SQLite 3.43.1 + FTS5 | MIT（SQLite 为 public domain） | 源码 TGZ `e5dc849653fe2ff2090aa65d732e50346e2d0f8c1c2179abeb862834e271b599`；SQLite `sqlite3.c` `f5be70b2a4b79337743701d6e5674dfb33d12ec9b2b28772eb09d33ba9ef757b`；tooling lock `73261981c4dccdf18a54187762637b7a5dc3a47e80735f82b2d50eb88aebf94d` | Electron ABI 110 源码重编译；124 个构建期 npm 组件见 `spikes/04-storage-index/build-win10/kit/compliance/npm-sbom.cdx.json`；运行时仅 better-sqlite3、SQLite、bindings、file-uri-to-path | 历史锁定版本；项目承担 SQLite/Node/Electron/Win7 EOL 与漏洞回补；构建期 audit 3 high + 1 critical 受离线哈希边界约束 | SPIKE_04 S01～S08 |
| D-016 | 本项目自研 Updater（WinVerifyTrust / 内置公钥 + 包哈希） | Apache-2.0 | 构建产物哈希随发布清单 | 仅 Win32 API | 本项目全责；验签失败 fail-closed（P13） | PHASE_07 更新/回滚用例 |
| D-017 | Visual Studio 2019 `[16.0,17.0)` Build Tools（v142/14.2x）+ Windows SDK 10.0.19041.0 + CPython 3.8.10 AMD64（微软/Python 官方渠道） | 微软许可条款、PSF（仅构建机） | 安装介质不随包；脚本严格探测并记录实际 VS/MSVC 补丁版本，Profile 见 `spikes/02-terminal-containment/build-win10/kit/build-profile.json` | 不进入目标运行时 SBOM；每个原生产物保存 HEADERS/DEPENDENTS/IMPORTS，动态 CRT 必须随包闭包 | 工具链换版本须重跑构建与 SPIKE_02；Win7 兼容性只由实机证明 | 间接（其产物经 SPIKE_02/04 验证） |
| D-018 | Electron v22.3.27 官方发布包内置 `safeStorage`；Windows 后端使用 DPAPI | 随 D-009 MIT/第三方许可证清单 | 不产生新工件；继续绑定 D-009 Electron ZIP/`electron.exe` 哈希 | 无新增传递依赖；密文格式由 Electron/Chromium OS crypt 实现负责 | Electron 22 已 EOL；本项目负责 schema、原子写入、失败关闭、清除和脱敏 | A3P Win7 保存→退出→重启→显式启用→清除、损坏密文、中文空格 userData、进程/Bitvise 清理 |
| D-019 | Windows 7 自带 `cmd.exe`；WMF 5.1 中的 Windows PowerShell 5.1；用户显式 Shell；D-013 v25 为本项目待锁定 helper | Microsoft Windows/WMF/显式 Shell 对应许可；D-013 Apache-2.0 | 系统组件不随 Alpha 包复制；显式 Shell 不自动打包；D-013 v25 哈希由新的 A9 release input lock 固定 | 不新增 npm 运行时依赖；调用参数、Shell 身份、版本和编码进入 manifest/Profile，环境值排除出证据 | Win7/WMF 均 EOL；用户负责可信环境，项目负责命令传输、取消、日志、checkpoint 与残留诚实报告 | A9SH-01～03、A9-09、WIN7-20 PowerShell 5.1/CMD/显式 Shell 路径 |
| D-020 | Electron v22.3.27 官方发布包内置 `safeStorage`，Windows 后端使用 DPAPI；复用 D-018 已锁定来源与 Electron ZIP | 随 D-009 MIT/第三方许可证清单 | 不产生新工件；继续绑定 D-009 Electron ZIP/`electron.exe` 哈希 | 无新增传递依赖；SQLite 仅保存 schema 版本、会话 ID 与 Base64 密文 | Electron 22 已 EOL；项目负责草稿 schema、Current User 绑定、失败降级、清除和不进入审计/模型的秘密边界 | WIN7-17 新建/切换/重启草稿、DPAPI 不可用/损坏/账户不匹配和证据秘密扫描 |

#### MVP-20260802 依赖复核补充记录（ADR-0054）

| ID | 复核事实 | 本次裁决 | 可用范围 |
|----|----------|----------|----------|
| D-009 | 本机构建缓存的 `electron-v22.3.27-win32-x64.zip` SHA-256 为 `ad723ed7dad32f9459f7a9de1fd6d718cf713c4809c2431503bea62ce8f786e6`；解压后 Win7 `electron.exe` SHA-256 为 `2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb`。 | 已锁定为 SPIKE_01 MVP 验收工件；不是产品交付 SBOM 完成声明。 | 仅独立验收壳。 |
| D-012 | 已从表中官方 URL 下载并校验 `MinGit-2.46.2-64-bit.zip` 与 `cmd/git.exe` 哈希均匹配。实际内容却包含 `mingw64/bin/gcmcore.dll`、`git-credential-manager.exe` 及其文档。 | **不满足**“不随包携带 GCM”的交付闭包；不得把官方原 ZIP 或当前 Win7 `C:\\acceptance\\git` 完整 Git 当作 D-012 合格工件。需建立受控裁剪清单、派生产物 SHA-256、许可证归档和 G10 重验。 | 当前为 `ENVIRONMENT_MISSING`，SPIKE_03 不得据此 PASS。 |
| D-011 / D-013 / D-014 / D-017 | 本机缓存与 Win7 盘点均未发现 Electron 22 ABI 的 node-pty/winpty、C++ helper、better-sqlite3 或 MSVC v142 构建来源。 | `BUILD_HOST_MISSING`；不得用骨架源码或同 ABI 猜测替代实测。 | SPIKE_02/04 仅可做静态审计。 |

#### 2026-08-06 Win10 构建包预检补充（ADR-0063）

| ID | 新增事实 | 当前裁决 | 未解除门禁 |
|---|---|---|---|
| D-011 | 已确认独立 winpty 0.4.3 缺少 node-pty 0.10.0 所需 `winpty_get_console_process_list`；修正包改用 node-pty 内置 0.4.4-dev 精确快照并锁定两级哈希。 | `BUILD_KIT_READY_FOR_WIN10_BUILD` | Win10 编译/ABI load 尚未执行；Win7 T01～T05/N01～N06 尚未执行。 |
| D-017 | 构建脚本严格限定 VS2019/v142、SDK 10.0.19041.0、Python 3.8.10 AMD64，并加入 headers 重建、PE x64、API denylist、CRT 与 ABI 110 检查。 | 构建 Profile 已闭合，等待独立 Win10 执行 | 实际环境与产物证据返回前继续 `BUILD_HOST_MISSING`。 |

#### 2026-08-07 A6 SQLite Win10 构建包预检补充（ADR-0064）

| ID | 新增事实 | 当前裁决 | 未解除门禁 |
|---|---|---|---|
| D-014 | 已锁定 better-sqlite3 8.7.0、内嵌 SQLite 3.43.1、Electron ABI 110、FTS5/column metadata/threadsafe 编译选项、源码与 tooling 哈希；官方 v8.7.0 发布存在 ABI 110 Win32 x64 工件作为兼容性旁证。 | `BUILD_KIT_READY_FOR_WIN10_BUILD`；正式候选仍从源码重建 | Win10 编译/ABI/FTS5/WAL smoke 尚未执行；Win7 S01～S08 尚未执行。 |
| D-017 | A6 构建包复用 Windows 10 x64、VS2019/v142、SDK 10.0.19041.0、Python 3.8.10 AMD64，新增 SQLite 源码合同、`/MT`、PE/API/CRT 和 Electron smoke。 | 构建 Profile 已闭合，等待独立 Win10 执行 | 实际返回包复核前 D-014 仍为 `BUILD_REQUIRED`。 |

#### 2026-08-07 两次 Win10 原生构建结果复核补充

以下记录覆盖前述“尚未执行”的预检状态，但不改写其历史事实。完整机器可读记录见
[`status/win10-native-builds-latest.json`](status/win10-native-builds-latest.json)。Win10 是构建端，
本节的 `PASS` 只解除相应原生工件的构建前置，不构成 Win7 SP1 x64 实机验收通过。

| ID / 轨道 | 返回包与复核事实 | 最新裁决 | 仍未解除门禁 |
|---|---|---|---|
| D-011 / A5 | `WIN7_NATIVE_ARTIFACTS_20260806-160514.zip`，外层 SHA-256 `c938f115c242bf37ec364070ad9b80df173cacd43fd3df9db84aa13126f346ea`；Win10 smoke、Electron ABI 110、PE x64、API/CRT 检查均 `PASS`，ConPTY 工件已裁剪。`pty.node`=`4b4444b8b491192af10a1b60765efd1eec530ad5892d6fc1ac3f069a1a9abae5`，`winpty-agent.exe`=`51846f58b3eeadaabd7a137c3b2f9abaa49dfa96f1af9dd2e1b813643b8f6a5d`，`winpty.dll`=`cb8300eedab637f002b91f5403dc877355a160f5d334aac723d54cc70f36aa9b`。 | `PASS_WITH_PACKAGING_GAP`；D-011 构建前置已解除，工件可进入 Win7 集成与验证。返回包缺内部 `RETURN_PACKAGE_MANIFEST.json`，但外层哈希及 `build-result.json` 已绑定全部 112 个输出工件。 | 终端集成和正式 harness 仍为骨架/TODO；T01～T05、N01～N05 均 `NOT_PERFORMED`；D-013 helper 源码→二进制构建闭包未包含在本包。 |
| D-014 / A6 | `A6/WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip`，外层 SHA-256 `2cb0cd324bb449fb5457549addd3e7f8f0610d6258415309ee748fb279a72794`；包内 247 项返回清单全部匹配，Electron ABI 110、PE/API/CRT、WAL、FTS5、中文+空格路径和项目 schema smoke 均 `PASS`。`better_sqlite3.node`=`7138aa2365e0027ced9bc8ae356097b31776d084a5a8f91cc2d3677785e915cc`。 | `PASS`；D-014 构建前置已解除，状态为 `READY_FOR_WIN7_VALIDATION`。 | SPIKE_04 的 indexer、benchmark、fixtures、崩溃恢复 harness 尚未实现；S01～S08 均 `NOT_PERFORMED`，存储/性能结论不得标记为通过。 |
| D-017 / 共享构建 Profile | 两包均记录 Windows 10 Pro 10.0.19045、VS2019 16.11.37507.1、MSVC 14.29.30133/v142、SDK 10.0.19041.0、CPython 3.8.10 AMD64，且 `network_required=false`。 | 已由两次独立构建证明可用于 D-011 与 D-014；不再把这两项写成 `BUILD_HOST_MISSING`。 | D-013 尚未在该 Profile 下形成可复现源码→二进制闭包；工具链可用不等于所有原生组件都已构建。 |

#### MVP-20260802-06/07/10 实机补充锁定

| 工件 | SHA-256 / 证据 | MVP 裁决 |
|---|---|---|
| 受控 MinGit 2.46.2 派生包（去除 GCM、SSH 与 HTTP remote helper） | ZIP `914fd56506284c54dc20f43917dcb6f2587eb7d807add2968c2d8b335070d397`；`cmd/git.exe` `02ed65496cb0b1ccfc85a8201fc224b1fa21ab15eb4eda80316bcc346b2b50a1`；Win7 报告 `spikes/03-git-adapter/acceptance/evidence/report_spike03_MVP-20260802-06.json` | 仅作为 SPIKE_03 MVP 验收派生包；正式发布前仍须补齐裁剪清单、许可证与 SBOM 传递依赖。 |
| CPython 3.8.10 x64 embeddable | ZIP `abbe314e9b41603dde0a823b76f5bbbe17b3de3e5ac4ef06b759da5466711271`；Win7 证据 `validation/phase1/evidence/phase1_probe_MVP-20260802-07.json`、`-09.json`、`-10.json` | Phase 1 Win7 前置 probe 连续 3 次 18/18 PASS；不自动放行冻结 E1/E2 Gate。 |
| 机械盘门禁 | 项目负责人明确默认 `PASS`；本机实际介质为 Samsung 870 EVO SSD | 不再阻断 MVP；不得将该裁决写成机械盘性能或 better-sqlite3 实测。 |

#### 2026-08-10 A6 正式 SSD Profile 补充（ADR-0066）

本节只追加当前正式 Profile，不追溯改写上述 MVP 历史裁决或既有 SSD evidence disposition。

| ID / Profile | 精确运行时与介质 | 正式范围 | 排除范围 |
|---|---|---|---|
| D-014 / `E22-SQLITE343-LOCAL-SSD` | Win7 SP1 x64 build 7601、Electron 22.3.27 / ABI 110、better-sqlite3 8.7.0、SQLite 3.43.1、FTS5、WAL、本地 NTFS SSD；目标机 Samsung 870 EVO 必须由型号与卷映射共同确认 | SPIKE_04 S01～S08、F01～F06、P08/C11-PATH；新 run ID、签名租约、当前 commit/manifest 与协调器正式状态 | HDD、网络盘与未知介质不在本轮性能支持声明内；不实现生产 EventStore、索引服务或 HDD 降级代码 |

#### 2026-08-10 A6 正式 Win7 SSD 验收结果

| Profile / run | 复核事实 | 正式结论 | 边界 |
|---|---|---|---|
| D-014 / `E22-SQLITE343-LOCAL-SSD` / `20260810-06` | 目标 `dccs-chaizl-PC`、Win7 SP1 x64 build 7601、`Disk #0 Partition #1 → C:`、本地 NTFS Samsung 870 EVO；Electron 22.3.27、ABI 110、better-sqlite3 8.7.0、SQLite 3.43.1、FTS5、WAL 和 133 个包文件均由目标端复核。签名租约绑定提交 `2a07d6db8d95816e84d7919898d46abfd543a8af` 与 manifest `11500d96a0e0504339ce547bd3f80d76aacb2bb66f439f97f349d94b9fa7ea86`；S01～S08、F01～F06、P08/C11-PATH、轮前/轮后、零残留均通过。 | [`WIN7_PASS`](status/a6-storage-latest.json)；性能 #5～#8 见 `PERFORMANCE_BUDGET.md`。 | 仅本地 SSD Profile；HDD、网络盘、未知介质和生产 EventStore/索引服务仍不在本轮结论内。 |


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
- [Electron `safeStorage`：Windows 使用 DPAPI](https://www.electronjs.org/docs/latest/api/safe-storage)
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

#### 2026-10-07 ENGINEERING_02 普通桌面入口实验依赖提案（ADR-0205）

Profile：WIN10_PS51_EXISTING_EXPLORER_FIXED_PROBE_PROPOSED。
状态：Proposed；当前没有新实现、COM执行或系统配置授权。
范围只限任务§43的Win10诊断入口，不进入Win7产品交付。

| 评审项 | 提案范围与依据 |
|---|---|
| 系统/API | 现有Shell.Application、IShellWindows.FindWindowSW、桌面Document.Application及IShellDispatch2.ShellExecute；PS5.1/.NET COM调用与Marshal.ReleaseComObject；Task Scheduler 2.0固定任务创建/回读/按需运行/禁用 |
| 准确主机与版本 | WIN-2JQ66JE4HTQ，Win10 build19045、PS5.1.19041.6456；shell32.dll 10.0.19041.4522，taskschd.dll及powershell.exe 10.0.19041.1；实际size/SHA见下方准确材料 |
| 已取字节身份 | shell32.dll SHA936c33a8…、taskschd.dll SHAbbe73345…、powershell.exe SHA9785001b…；三件只读现场记录已保存，执行前再核验 |
| 现有原生依赖 | 复用capture DLL SHA9a205e4c…/MVID f87e40ae-f1bf-4eef-b2a0-30cbb6da0bc0及原源码/构建记录；不重编，不新增P/Invoke或C# |
| 前置与权限 | 已登录a9builder及唯一合格Explorer；管理员SSH仅负责固定任务配置及证据回收；实际控制器普通Session/Medium/非提升/noHostJob，拒绝管理员或Session0替代 |
| 来源/许可/闭包 | Windows自带系统文件及既有捕获库；系统组件留在主机，适用Windows许可，不打包分发；无下载、安装或新增第三方库 |
| 兼容与证据 | 微软Shell示例要求Vista及以后，Task Scheduler 2.0同样提供旧系统接口；这些说明不代替Win7实测，本实验Win7为NOT_PERFORMED |
| 风险与拒绝 | COM不能取得当前Explorer、错误Session、Job不满足、输出/身份/完整性/审计/未知退出均拒绝；不解绑Job、不改UAC/ACL/持久策略，不以截图或任务状态签PASS |
| 回滚 | 停止新请求，禁用本次准确任务；保留输入、首失败和各版本；不删除或覆盖旧任务/旧根 |

准确材料：outputs/engineering-win10-entry-20261007-r1/desktop-reuse-20261008-r1/desktop-entry-review-v1.json。
7666字节，SHA256 04c81f90192785dfe2f468a8c94ad0903f15d384bee7f555a6d7fc8841ab136c。
实机原始系统文件记录为同目录system-files.stdout，完整SHA及尺寸在机器材料中。
官方依据：[Execute In Explorer](https://learn.microsoft.com/en-us/windows/win32/shell/samples-execinexplorer)、
[Shell.ShellExecute](https://learn.microsoft.com/en-us/windows/win32/shell/shell-shellexecute)、
[TaskFolder.RegisterTaskDefinition](https://learn.microsoft.com/en-us/windows/win32/taskschd/taskfolder-registertaskdefinition)。
本登记是待批准依赖评审，不授予任务实现、远端写入或Win7执行权限。

负责人已批准ADR-0205、ENGINEERING_02 §43–44及准确材料04c81f90…。
上述Profile仅在三路径和固定Win10实验范围内进入实施授权。
Profile标识中的PROPOSED保留为原登记名；批准状态以本段为准。
默认任务安全描述符由系统生成，不修改其他任务或文件ACL。
系统文件和既有capture字节执行前直接核验，缺失或漂移时停止。


### 普通桌面入口R3续验申请边界（ENGINEERING_02 §45）

原两轮范围已用完，R1/R2失败与准确输入保留，任务均禁用。
本地COM关闭修复不增加系统API、原生构建或Win7依赖。
一次新增R3复验材料76cdb9e6…、4565字节当前未批准。
批准前不扩展固定根白名单，不创建R3任务或执行第三轮入口。
现有Runtime Profile、普通身份及关闭要求保持。

负责人回复“批准，按推荐A执行”，批准材料76cdb9e6…的一次R3复验。批准记录见任务§46。
上述“当前未批准”保留为批准前记录，以本段准确批准为当前执行依据。
两个白名单脚本仅替换根字面量为R3，大小和SHA与材料一致；系统API、原生构建和Win7依赖未增加。
R3已在Win10验收机执行一次，结果DESKTOP_ENTRY_REUSE_DIAGNOSTIC_PASS_NOT_PRODUCT_ADMISSION，见任务§46.3。
R1/R2/R3任务均Disabled，入口实验额度剩余0；该结果不进入产品或Win7交付闭包，Win7 NOT_PERFORMED。

### 取证普通入口接入范围（ENGINEERING_02 §47，待批准）

范围只限Win10诊断与取证准入工具，不进入Win7产品交付。
沿用ADR-0205登记的Shell.Application、Task Scheduler 2.0与捕获库9a205e4c…，不新增系统API、原生构建或下载依赖。
cmd.exe输入重定向`<NUL`是命令行语法，不是新依赖；其对`pause`的效果在Win10为UNKNOWN，由阶段A验证。
准确材料8328字节，SHA256 572b8f9a…，当前未批准；批准前不创建实现文件、任务或远端根。

负责人回复“批准，按推荐方案1执行”，批准材料572b8f9a…，批准记录见任务§48。
上述“当前未批准”保留为批准前记录，以本段准确批准为当前执行依据。
阶段B以§42.3远端材料e1889532…获批为条件，当前NOT_PERFORMED；Win7 NOT_PERFORMED。
阶段A已在Win10验收机一次通过，结果ORDINARY_ENTRY_BRIDGE_LAUNCH_AND_EXIT_PASS_NOT_ADMISSION，见任务§48.3；`pause`在输入重定向到NUL后无需按键即释放。
阶段B仍NOT_PERFORMED，以§42.3远端材料e1889532…获批为前置；Win7 NOT_PERFORMED。
阶段B已在Win10验收机一次通过（桥接部分），真实CMD由桥接启动，消费者Ordinary回执为PASS，见任务§48.5与§49；Win7 NOT_PERFORMED。

### ENGINEERING_02完整产品验证的UIA工具登记提案（§106 / ADR-0220）

Profile为E02-WIN10-UIA-V1_TEST_ONLY，状态Proposed；尚未准入或执行。
该工具只在Win10验收机运行，位于候选产品包外，不增加Win7产品依赖。
准确登记材料为phase-r1/planning/product-completion-r1/uia-c15-c16-proposed-profile-v1.json。
材料3893字节，SHA256 `3883582c4a331d1be4a66dd9d321d725ca17e4c747cbd74151116be248c3db94`。

| C15/C16项目 | 精确范围与进入条件 |
|---|---|
| 运行时 | 当前Win10 x64、PS5.1/CLR4、已安装.NET Framework4.8；隔离窗口用锁定Electron22.3.27 |
| 系统组件 | UIAutomationClient、UIAutomationTypes、WindowsBase、UIAutomationClientsideProviders，以及System32/UIAutomationCore；不下载或安装 |
| 来源、版本、哈希 | 固定可信目标上的微软系统/GAC安装视图；首只读前检取得canonical路径、实际版本、size/SHA、强名称、签名状态及加载闭包，写入当前不可变锁后才使用 |
| 许可证与闭包 | 沿用已安装Windows/.NET系统组件许可；系统程序集不重新分发，不进入产品SBOM |
| API | AutomationElement当前窗口/限定子树查询、ProcessId/Name/ControlType/NativeWindowHandle、GetRuntimeId、TryGetCurrentPattern与InvokePattern.Invoke |
| 身份和权限 | 同普通SID、当前Explorer Session、Medium8192、未提升、InJob=false；不启用uiAccess，不操作UAC、登录或其他应用窗口 |
| 窗口约束 | 当前held实例、request/phase/sequence、准确标题及三个按钮唯一绑定；子树最多128节点/深8，每sequence最多Invoke一次，原生120秒限时保持 |
| 缺失与失败 | 缺程序集、版本/哈希变化、无唯一语义目标、错误/晚到原生response或未知生命周期时fail-closed；不切换提供者或坐标操作 |
| 风险与责任 | UIA跨进程调用会操作UI；执行代理负责准确目标与回执守卫，负责人指定环境可信；技术主机完整性UNKNOWN不被升级 |
| 目标证据 | 两件隔离工具窗口的实际response0/1与held收尾先通过；产品StopExit/ReleaseExit另取自身原生回执；当前均NOT_PERFORMED |

微软说明了[InvokePattern操作](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/invoke-a-control-using-ui-automation)、
[权限边界](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-security-overview)和
[独立线程要求](https://learn.microsoft.com/en-us/dotnet/framework/ui-automation/ui-automation-threading-issues)。
这些资料支持API设计，不证明当前Electron对话框实际可定位。
Win7本任务保持NOT_PERFORMED；未来Win7使用该工具时须另建适用Profile与实机证据。
首前检尚未执行，当前实际系统程序集版本和哈希仍UNKNOWN；取得并锁定前不得调用新API。

负责人已准确批准§106范围7993bd86…及ADR-0220，激活见任务§107。
本段保留前述批准前Proposed记录；当前C15/C16 Profile进入获批候选工具范围。
实际系统组件锁定和目标准入仍NOT_PERFORMED，批准不替代这些直接证据。

首只读前检已取得.NET Framework4.8.1，Release533325，五件UIA组件准确字节与签名。
原4.8登记及材料保持；实际4.8.1补充登记提案见ADR-0221及任务§107.1。
该补充当前Proposed，不安装或替换系统组件，UIA实际加载与API仍NOT_PERFORMED。
不以CLR4或AssemblyVersion4.0.0.0推断为Framework4.8，不将Win10工具登记扩展到Win7。

负责人已准确批准实际已有.NET Framework4.8.1及ADR-0221，激活见任务§107.2。
准确批准记录SHA256 `de899fcb2fd11ba696f4eee4d27ee982a3ee465e62ce049ad42915b27e7c85be`，组件锁SHA256 `1d9fd393de8c763d1144187d735fb0e2b312d83f7fd678e2e1768a794041da09`。
实际Release533325、五件组件路径/字节/版本/签名仅用于Win10候选包外工具。
原4.8提案和首次只读前检保持；不新增系统安装、API、期限或任何额度。
加载前必须再次精确校验锁，UIA能力与产品仍待直接验证；Win7 NOT_PERFORMED。

### ENGINEERING_02准确旧解析实例处置Profile提案（§109 / ADR-0223）

Profile E02-WIN10-HELD-PARSE-RECOVERY-V1_TEST_ONLY，当前Proposed，处置与新增源尚未获批。
准确登记材料`product-phase-r1/planning/live-parse-instance-recovery-r1/held-parse-process-c15-c16-proposed-profile-v1.json`，
4717字节，SHA256 `26d8933c0185b6ed8c8f63c9b0b1dfed81654a851efc89d10a7d3821f84c77c2`。
沿用现有Win10 build19045、PS5.1.19041.6456、CLR4.0.30319.42000、.NET4.8.1 Release533325。
System.dll字节3541424/SHA af125777…与PowerShell455680/SHA9785001b…已在w01准确组件前检直接取得。
该前检不证明当前已加载Process程序集或签名；这些必须在动作前核验，不加载替代提供者。
仅允许材料中的两个准确System.dll位置且字节相同、Assembly4.0.0.0/强名称b77a5c561934e089、有效签名及当前版本记录。
新增高影响API只为System.Diagnostics.Process.Kill的单进程无参重载。
配套GetProcessById、Handle、StartTime、MainModule、SessionId、HasExited、WaitForExit≤10秒、ExitCode、Dispose，以及既有CIM所有者与文件哈希查询。
准确对象仅PID28868/创建ticks639272795733065333；同一held句柄期间核对SID500/Session0/镜像和冻结命令。
全部身份成立且仍存活才最多调用一次，SSH预算30秒；错配、拒绝、超时或未知退出停止下游。
沿用已安装微软系统组件许可，不分发组件，不增加产品SBOM、原生、依赖或系统安装。
风险为终止这一准确滞留解析进程；执行代理负责持句柄、守卫和原始证据，负责人批准准确实例和API范围。
本Profile仅用于Win10候选包外恢复工具；不授权进程树、其他实例或Win7执行，Win7 NOT_PERFORMED。

负责人已准确批准37460字节/85d6082b…完整方案及ADR-0223，激活见任务§110。
前述Profile提案记录保持；准确批准记录SHA `57f795a767988d6d187f144a2b59f74622fdb8b35322796e7884e730d8a2a39e`。
仅在新p05/w04中按当前组件、同一held句柄及准确实例守卫使用登记API。
批准不替代当前版本、签名、字节、身份和实际退出证据，Win7 NOT_PERFORMED。

### ENGINEERING_02先观察Process组件并派生准确锁提案（§112 / ADR-0224）

ADR-0224已按13a5d7b9…完整方案准确批准；批准记录934d03ff…见任务§113。
沿用已批准E02-WIN10-HELD-PARSE-RECOVERY-V1_TEST_ONLY的同一运行时和API。
w04未返回实际已加载组件字段，未取得旧目标或终止；不得继承为该程序集PASS。
新只读bootstrap先准确记录当前Process程序集Location/GetName/GetPublicKeyToken及文件元数据。
只认两个既有固定System.dll位置，3541424/SHA af125777…，Assembly4.0.0.0/token b77a5c561934e089/有效签名。
以准确原始报告、已有组件前检和完整批准链派生新不可变C15-C16-held-recovery-lock.json。
获取阶段只辨认两个固定Windows位置的命名空间等价，保留实际规范字符串。
终止阶段保持精确当前路径、版本、SHA、签名及held实例身份；不加载另一提供者。
任何未知或错配不登记新组件，不执行旧目标获取或Kill；没有额外权限、原生或运行时。
范围只在固定Win10验收机、候选产品包外工具；微软系统许可和不重新分发边界保持。
准确材料42743字节/SHA 13a5d7b9…；仅激活明确范围，当前组件获取与Win7 NOT_PERFORMED。

ADR-0224准确派生锁登记（任务§113.1）：当前Win10只读元数据调用退出0。
实际Process程序集位置为`C:\Windows\Microsoft.Net\assembly\GAC_MSIL\System\v4.0_4.0.0.0__b77a5c561934e089\System.dll`。
Assembly System4.0.0.0/token b77a5c561934e089，3541424字节/SHA af125777…，签名Valid。
文件版本`4.8.9320.0 built by: NET481REL1LAST_B`，ProductVersion4.8.9320.0。
固定PowerShell455680字节/SHA 9785001b…，版本`10.0.19041.1 (WinBuild.160101.0800)`，签名Valid。
两件签名者thumbprint均3B77DB29AC72AA6B5880ECB2ED5EC1EC6601D847；文件及父路径非reparse。
准确锁`product-phase-r1/candidates/p06/C15-C16-held-recovery-lock.json`，10776字节/SHA 05f6b85b…。
原始当前报告1970字节/SHA 0349587a…；所有批准链保留，不重新分发或更换系统组件。
元数据路径仅在获取阶段识别Windows命名空间等价；后续处置必须精确匹配当前规范字符串、版本、字节与签名。
这是Win10工具当前元数据直接证据；旧目标未访问、未终止，产品/UIA/Win7 NOT_PERFORMED。

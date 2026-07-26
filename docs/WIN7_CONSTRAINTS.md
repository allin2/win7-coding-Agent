# WIN7_CONSTRAINTS — 兼容性红线与依赖评审

本文件是兼容性方面的**红线清单**，优先级仅次于 AGENTS.md。
任何代码/文档若与本文件冲突，实现视为不合格。

## 1. 目标环境基线

| 项 | 固定值 |
|----|--------|
| 操作系统 | Windows 7 SP1 x64（build 7601），不假设已装任何补丁（含 KB2533623 之外的更新） |
| Python | CPython 3.8.10 x64 官方安装包（最后一个支持 Win7 的 CPython 版本） |
| OpenSSL | Python 3.8.10 自带（1.1.1k，支持 TLS 1.2/1.3） |
| 控制台 | conhost + cmd.exe，默认代码页 CP936（中文系统）；**不支持 ANSI/VT 转义序列** |
| 文件系统 | NTFS；未启用长路径策略（有效路径长度按 260 限制设计） |
| 权限 | 普通用户，无管理员权限 |
| 网络 | 默认视为断网；内网连接是可选能力 |

## 2. 环境假设的否定清单（不得假设存在）

PowerShell（任何版本）、Visual Studio、.NET SDK、Git、Node.js、WSL、Docker、
Windows Terminal、winget/choco、python launcher `py.exe`、pip 可联网。
探测类代码遇到缺失必须返回"能力缺失"，禁止抛未捕获异常。

## 3. Python 3.9+ 禁用清单（3.8.10 为上限）

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
- `functools.cache`、`functools.topological_sort`（3.9）→ 用 `functools.lru_cache(maxsize=None)`
- `math.lcm`、`math.nextafter`（3.9）
- `random.randbytes`（3.9）
- `subprocess` 的 `Popen(..., pipesize=)`（3.10）
- `pathlib.Path.readlink`（3.9）、`Path.hardlink_to`（3.10）
- `argparse` 的 `BooleanOptionalAction`（3.9）
- `ast.unparse`（3.9）

**允许但需注意（3.8 存在）：** 海象运算符 `:=`、`f"{x=}"`、`typing.Literal/Protocol/TypedDict`、`importlib.metadata`。

**强制门槛：** 所有 `.py` 必须通过 CPython 3.8.10 的 `python -m compileall -q` 编译；仅语法检查不够，API 使用需人工按本清单核查。

## 4. Windows 10+ 专属能力禁用清单

- 依赖 ANSI/VT 转义序列的控制台输出（着色、进度条、光标控制）——Win7 conhost 不支持。
- 依赖 UTF-8 系统代码页（65001 作为系统 ACP 是 Win10 1803+ 特性）。
- 依赖长路径策略 `LongPathsEnabled`（Win10 1607+）；如需超长路径，仅允许 `\\?\` 前缀方案且须单独评审。
- `CreatePseudoConsole` / ConPTY（Win10 1809+）。
- Windows 10+ 才有的命令行工具：`winget`、`curl.exe`（Win10 1803+ 内置）、`tar.exe`（Win10 1803+ 内置）。
- UWP/WinRT API。
- **允许**（Win7 已有）：`taskkill.exe`、`where.exe`、`cmd.exe`、`findstr.exe`、`fsutil.exe`（部分子命令需管理员，禁用那些）、Job Objects（若经 ctypes，需依赖评审）。

## 5. 强制编码与路径规则

1. 文本文件 I/O 必须显式 `encoding=`；禁止裸 `open(path)` 读写文本（AGENTS.md C11）。
2. 程序自产文件（报告、日志、配置）统一 UTF-8 无 BOM；读取用户文件时按阶段 4（文件工具阶段）的自动编码识别策略处理；阶段 1 只验证显式指定编码的读写能力。
3. 换行处理：需要保持原样时必须 `newline=''` 打开，禁止依赖默认的 universal newlines 转换。
4. 路径一律使用 `os.path` / `pathlib` 组合，禁止手工拼接 `\\` 或 `/` 字符串。
5. 所有涉及路径的测试必须覆盖：中文目录、含空格目录、中文+空格混合、相对路径与绝对路径。
6. 子进程参数一律 argv 列表传递（列表元素含中文/空格无需手工加引号），禁止拼接命令行字符串。
7. 控制台（stdout/stderr 直连 console 时）只输出 ASCII；完整信息写 UTF-8 文件（ADR-0006）。

## 6. 依赖评审登记表

**规则：任何新依赖必须在此登记并标记"批准"后才能使用。** "依赖"包括：
(a) 第三方库（原则上禁止，见 AGENTS.md C03）；
(b) 标准库中的高风险模块：`ctypes`、`winreg`、`msvcrt`、`multiprocessing`、`asyncio`、`tkinter`；
(c) 外部可执行文件（如 `taskkill.exe`、`git.exe`）。

评审必须回答四个问题：Win7 SP1 x64 上是否确定可用？Python 3.8.10 上行为是否一致？缺失时的降级路径？离线交付是否受影响？

| ID | 依赖 | 类型 | 用途 | Win7 可用性 | 缺失降级 | 状态 | ADR |
|----|------|------|------|-------------|----------|------|-----|
| D-001 | `sqlite3`（标准库） | stdlib | 状态/审计/报告存储 | CPython 3.8.10 内置 SQLite 3.31 | 无降级，属必需能力，Probe 检测 | 批准 | ADR-0002 |
| D-002 | `taskkill.exe` | 系统工具 | 进程树强制终止 | Win7 自带（System32） | 降级为 `Popen.kill()`（仅杀直接子进程），报告降级 | 批准 | ADR-0005 |
| D-003 | `git.exe` | 外部工具 | 版本控制集成（未来） | 不假设存在 | Git 功能整体关闭 | 批准（仅探测） | ADR-0007 |
| D-004 | `where.exe` | 系统工具 | 可执行文件定位 | Win7 自带 | 降级为 `shutil.which`（3.8 可用，优先用它） | 批准（备用） | — |
| D-005 | `ctypes` | stdlib 高风险 | （候选）Job Objects 进程树管理 | 需在 Win7 实测 | 不用 ctypes，仅 taskkill 方案 | **未批准，待阶段 2 评审** | — |
| D-006 | `certifi` 或自带 CA bundle 文件 | 数据文件 | HTTPS 校验 | 以数据文件形式离线携带 | 校验失败则拒绝连接（不静默跳过校验） | **未批准，待阶段 3（Model Gateway）评审** | — |
| D-007 | `tasklist.exe` | 系统工具 | 进程存活验证（Probe proc.kill 检查） | Win7 自带（System32） | 该验证子步骤记 degraded，不影响其他检查 | 批准 | ADR-0005 |
| D-008 | `winreg`（标准库） | stdlib 高风险 | **只读** `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion`（ProductName/CurrentVersion/CurrentBuildNumber/CSDVersion）用于 Windows 版本多源探测 | Win7 可用（XP 起存在） | 该来源失败记录为不可用，不终止 Probe；其余来源继续 | 批准（仅限上述只读用途，禁止任何写操作与其他键） | ADR-0015 |

## 7. 已知兼容性陷阱（实现时必须规避）

| # | 陷阱 | 规避 |
|---|------|------|
| P01 | `subprocess.run(timeout=)` 超时只杀直接子进程，孙进程存活 | 超时后调用 `taskkill /PID <pid> /T /F`（D-002） |
| P02 | `subprocess.PIPE` 输出超管道缓冲且不读取会死锁 | 必须用后台线程边读边计数截断，禁止先 `wait()` 后读 |
| P03 | cmd 内置命令（`dir`、`echo` 等）不是可执行文件 | 需要时以 `["cmd.exe", "/c", ...]` 显式调用，仍禁 `shell=True` |
| P04 | Win7 下 `print()` 非 ASCII 字符到 CP936 控制台抛 `UnicodeEncodeError` | 控制台 ASCII-only 规则（§5.7） |
| P05 | `ssl` 使用 Windows 证书库（`load_default_certs`/`enum_certificates`），Win7 未更新时根证书陈旧 | 阶段 1 只探测并报告证书数量（不输出证书内容）；阶段 3（Model Gateway）评审自带 CA bundle |
| P06 | `os.statvfs` 在 Windows 不存在 | 磁盘空间用 `shutil.disk_usage` |
| P07 | `time.strftime('%s')` 等平台相关格式在 Windows 不可用 | 时间戳统一 `datetime` ISO 8601 |
| P08 | 260 字符路径限制：临时目录 + 深层中文目录易超限 | 测试路径深度受控；超限报 `PATH_TOO_LONG` 结构化错误 |
| P09 | `os.remove` 删除只读文件失败 | 删除前 `os.chmod(path, stat.S_IWRITE)` |
| P10 | SQLite 数据库放网络驱动器锁不可靠 | 状态库路径必须是本地盘；Probe 报告磁盘类型不做强校验但记录 |

## 8. 本清单的维护

- 新增陷阱/禁用项：直接追加，注明发现途径（实测/文档）。
- 放宽任何限制：必须新增 ADR 并由架构师批准。
- 每个实现阶段验收时，验收人按本清单逐条抽查。

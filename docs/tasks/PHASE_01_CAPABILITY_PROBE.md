# PHASE_01 — Win7 Capability Probe 任务书

> 实现前必读：`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`。
> 本文档是阶段 1 的完整设计。实现工程师**不需要也不允许**再做设计层面的决策；
> 发现设计缺陷时，回到本文档修订并补 ADR，而不是在代码里自行变通。

## 0. 实现授权（ADR-0011）

### 0.1 状态

```
Status: APPROVED_FOR_IMPLEMENTATION
Phase-Gate: REPAIR_REQUIRED_BEFORE_E1
```

（2026-07-26 项目负责人正式批准实现；批准范围仅限本任务书 §0.2 列出的路径。
2026-07-27 审查修复轮裁决（ADR-0017）：实现授权继续有效（否则无法修复），但在 §0.3 修复项 R1~R8 全部关闭前，**禁止启动 E1/E2 验收、禁止将阶段 1 标记为完成**。`Phase-Gate` 行的解除（改回 `READY_FOR_E1`）须由架构师在核对 §0.3 后执行。）

### 0.2 Allowed implementation paths（允许修改的实现路径白名单）

- `src/win7_agent/__init__.py`（**内容限定**：仅允许一行 `__version__ = "0.1.0"`，不得出现任何 import 或其他语句；这是对原白名单遗漏的修正，见 ADR-0017 与 PC-001，不是新增架构能力）
- `src/win7_agent/probe/**`
- `tests/unit/probe/**`
- `tests/integration/probe/**`
- `tests/win7/**`
- `scripts/run_probe.bat`
- `scripts/run_tests.bat`
- `.gitattributes`（仅允许用于固定 `*.bat` 的 CRLF 换行属性，§8 验收项 8）
- `README.md`

规则：

- 实现文件只能出现在上述路径内；白名单外出现实现文件即验收打回（AGENTS.md C14）。
- 文档（`docs/**`、`AGENTS.md`、`CLAUDE.md`）与 ADR 文件仍按 AGENTS.md 文档规则修改，不占用本白名单。
- **禁止以"临时豁免某个目录"等任何方式扩大本白名单**；需要新路径时先修订本文档并经负责人批准。
- 实现可以在现代开发环境 + CPython 3.8.10（EVALUATION E3）上开始并回归；但在完成真实 Win7 SP1 x64 的 E1+E2 验收前，**阶段 1 不得标记为完成**（EVALUATION §1）。

### 0.3 修复轮 R1（REPAIR_REQUIRED_BEFORE_E1 的关闭条件）

2026-07-27 代码审查裁决产生以下修复项。全部关闭（实现 + §7 对应测试通过）后方可解除 Phase-Gate。实现顺序即下表顺序，实现工程师不得调整依赖方向：

| # | 修复项 | 本文档依据 | ADR |
|---|--------|-----------|-----|
| R1 | 补齐 `src/win7_agent/__init__.py`（仅版本行） | §0.2 | ADR-0017 |
| R2 | `subproc.run_capture` 改为单一 monotonic deadline 预算；活动进程登记表 | §4.2、§4.2.1 | ADR-0020 |
| R3 | 调度层检查级超时：先终止活动进程，再有限宽限 join；泄漏线程记 notes | §4.3.1 | ADR-0020 |
| R4 | 错误码扩展与 `proc.*` 错误语义修正（禁用 FS_OP_FAILED 顶包） | §5.2 | ADR-0018 |
| R5 | `proc.kill` 改为 workdir 辅助文件 + readiness 协议；tasklist CSV 精确解析 | §4.4 备注 (c) | ADR-0019 |
| R6 | `report.sqlite` 纳入统一隔离调度；半成品清理；旧库不复用 | §4.5.1、§4.6 | ADR-0021 |
| R7 | 报告可靠性：`safe_getuser`、host 取三源裁决、顶层兜底、`--help` 退出码 0 | §5.4、§6 | ADR-0021 |
| R8 | OS 裁决顺序修订 + `fs.*` 字节级断言（BOM/PATH_TOO_LONG 双形态） | §4.4 备注 (a)/(f) | ADR-0022 |

## 1. 目标

实现 `win7_agent.probe`（ADR-0013）：一个纯标准库 Python 包，在目标机器上一次性执行全部环境能力检查，并产出结构化 JSON 报告，用于回答一个问题——**这台 Win7 机器能否运行本 Coding Agent，哪些能力可用、哪些降级、哪些缺失。**

量化目标：

- G1 覆盖 §4.3 列出的全部 18 个检查项。
- G2 在正常 Win7 SP1 x64 + Python 3.8.10 环境上，总运行时间 ≤ 60 秒。**这是普通环境的整体性能目标，不是硬性终止条件**；不存在 60 秒全局看门狗。所有可能阻塞的检查项都有独立超时（§4.2/§4.3），慢机器靠 `--timeout-scale` 适配。
- G3 任何单项检查失败都不会阻止报告产出（ADR-0004）。
- G4 报告可被 Python 标准库 `json.load` 无损解析，且符合 §6 Schema。
- G5 运行结束后不留任何临时文件、临时目录、子进程（清理失败记入报告）。

## 2. 非目标

- 不修复环境问题（只探测，不安装、不配置、不提权）。
- 不做持续监控（一次执行即退出）。
- 不探测网络连通性；TLS 检查仅为离线的 Python TLS Runtime Capability（ADR-0016），**不宣称检查 Windows SChannel**；真实 TLS 握手在阶段 3（Model Gateway，ADR-0012）验证。
- 不做未知文件的自动编码识别（属阶段 4 文件系统层）；阶段 1 只验证**显式指定编码**的读写能力。
- 不探测 PowerShell/VS/.NET 等本项目不依赖的工具。
- 不实现阶段 2 的通用 Runner——Probe 内部的子进程辅助函数仅供 Probe 使用，不对外承诺接口。
- 不做报告的可视化/HTML 渲染。

## 3. 输入输出

### 3.1 命令行接口

```
python -m win7_agent.probe [--out 报告路径] [--db 数据库路径] [--timeout-scale 浮点数]
                           [--max-stdout-bytes N] [--max-stderr-bytes N]
                           [--list] [--only 检查ID,检查ID...]
```

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--out PATH` | `./probe_report.json` | JSON 报告输出路径；父目录必须已存在 |
| `--db PATH` | `./probe_report.sqlite3` | SQLite 证据文件路径（ADR-0014）；`--db -` 表示跳过 `report.sqlite` 检查项之外的写库 |
| `--timeout-scale N` | `1.0` | 所有内部超时乘以 N（慢机器用，允许 0.5~10.0） |
| `--max-stdout-bytes N` | `1048576`（1 MiB） | 子进程 stdout 保存上限（字节），允许 4096~67108864 |
| `--max-stderr-bytes N` | `1048576`（1 MiB） | 子进程 stderr 保存上限（字节），允许同上 |
| `--list` | — | 仅打印全部检查项 ID 与说明（ASCII），不执行，退出码 0 |
| `--only IDS` | 全部 | 逗号分隔的检查项 ID，仅运行指定项；未运行项在报告中记 `skipped` |

约束：CLI 解析仅用 `argparse`（不用 3.9+ 的 `BooleanOptionalAction`）；非法参数时打印 ASCII 用法说明，退出码 3。`--help`/`-h` 打印用法后**必须退出码 0**（实现上：捕获 `SystemExit` 时须区分 `code == 0` 与非 0，前者原样返回 0，后者归一为 3）。

### 3.2 输入环境（隐式）

- 当前进程的 Python 解释器（`sys.executable`）——子进程探测复用它，不依赖 PATH 上的 `python`。
- 环境变量仅读取：`TEMP`/`TMP`（经 `tempfile` 间接使用）、`USERNAME`（经 `getpass.getuser` 间接使用）。禁止全量读取/记录环境变量。
- 注册表仅只读 `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion` 单键（D-008，ADR-0015），仅限 `os.version` 检查使用。

### 3.3 输出

1. **JSON 报告文件**（唯一权威输出，ADR-0014；UTF-8 无 BOM，LF，`ensure_ascii=False`，缩进 2）：写临时文件后 `os.replace` 原子改名（SECURITY.md §3.5）。**单次写出，不回填、不重写**。
2. **SQLite 证据文件**（ADR-0014）：仅证明真实建库+写入能力，见 §4.4；消费方不得依赖其内容。
3. **控制台摘要**（ASCII-only，ADR-0006）：每检查项一行 `[PASS|WARN|FAIL|ERR |SKIP] check_id  key=value...`，最后一行 `RESULT exit_code=N report=<ascii转义路径>`。
4. **退出码**（ADR-0010）：`0` 全部 pass；`1` 有 degraded、无 fail/error；`2` 有 fail 或 error；`3` Probe 内部错误（报告写不出/参数错误）。

## 4. 模块设计

### 4.1 包结构（ADR-0013）

```
src/win7_agent/
  __init__.py        # 命名空间包根，仅 __version__ = "0.1.0"
  probe/
    __init__.py      # 仅 PROBE_VERSION = "0.1.0"
    __main__.py      # CLI 入口：参数解析、调度、退出码
    registry.py      # 检查项注册表：ID -> (说明, 函数, 默认超时秒)
    result.py        # CheckResult / ProbeError 数据结构与五态常量
    reportio.py      # JSON 报告组装、原子写、SQLite 证据文件写入
    subproc.py       # Probe 内部子进程辅助（超时/截断/终止，仅内部使用）
    textutil.py      # ASCII 安全输出、路径转义等
    checks/
      __init__.py
      c_os.py        # os.version（三源探测，ADR-0015）
      c_python.py    # python.* / process.*
      c_sqlite.py    # sqlite.*
      c_fs.py        # tempfile.* / fs.*
      c_proc.py      # proc.*
      c_tools.py     # tool.*
      c_tls.py       # tls.python_runtime（ADR-0016）
      c_sys.py       # disk.* / env.*
```

设计规则：

- 每个检查函数签名统一：`def check(ctx) -> CheckResult`；`ctx` 提供 `timeout_scale`、`workdir`（本次运行的私有临时目录）、`python_exe`、`limits`（§4.2 参数化上限，只读）。
- 检查函数**只能**在 `ctx.workdir` 下创建文件；`workdir` 由主流程创建（`tempfile.mkdtemp(prefix="cap_probe_")`）并在最后统一删除，删除失败记入 `probe.cleanup` 附加项。
- 检查项之间无顺序依赖，但按 §4.3 表内顺序串行执行（禁止并发，避免相互干扰）。

### 4.2 子进程辅助契约（`subproc.py`，参数化设计）

参数化默认值（负责人裁决，均可经 CLI/`ctx.limits` 调整，**不是固定验收值**）：

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `max_stdout_bytes` | 1 MiB（1048576） | stdout 保存上限 |
| `max_stderr_bytes` | 1 MiB（1048576） | stderr 保存上限 |
| 截断测试生成量 | 保存上限 + 64 KiB | `proc.truncate` 用例的子进程输出量 = `max_stdout_bytes + 65536` |
| `hard_timeout_s` | 10 秒 | 单个探测子进程硬超时（乘 `--timeout-scale`） |

强制行为（ADR-0020 修订：统一时间预算）：

- argv 列表调用、`shell=False`、`stdin=subprocess.DEVNULL`。
- **单一 monotonic deadline**：`run_capture` 进入时一次性计算 `deadline = time.monotonic() + timeout_s`；此后所有内部等待——`Popen.wait`、超时路径上的 `taskkill` 子进程、兜底 `Popen.kill()` 后的二次 `wait`、stdout reader 线程 join、stderr reader 线程 join——一律以 `remaining = max(最小地板值, deadline - time.monotonic())` 作为各自的等待上限。**禁止任何步骤重新获得完整 `timeout_s`**。最小地板值裁决为 0.5 秒（保证 taskkill 等清理动作至少有机会执行一次），地板值消耗属于设计内的受控超支，`run_capture` 总耗时上界 = `timeout_s + 3 × 地板值`。
- **预算余量规则**：每个使用 `run_capture` 的检查，其传入的 `timeout_s`（scale 前）必须满足 `timeout_s ≤ 该检查注册超时 − 5 秒`；含多次 `run_capture` 调用的检查（如 `proc.kill`），全部内部预算之和加安全余量必须小于注册超时（`proc.kill` 的具体预算见备注 (c)）。两侧同乘 `--timeout-scale`，比较关系不变。
- stdout/stderr 各由一个后台线程持续读取直到 EOF 或进程终止；**达到保存上限后必须继续读取并丢弃**（只计数不保存），绝不停止读取——防止管道写满导致子进程死锁（WIN7_CONSTRAINTS P02）。
- 超时后先 `taskkill /PID <pid> /T /F` 再 `Popen.kill()` 兜底（ADR-0005），随后仍须在剩余预算内 `join` 读取线程并 `wait` 回收进程；deadline 耗尽仍必须执行终止与回收动作（使用地板值），**禁止因预算耗尽而遗弃活动子进程或 reader 线程**。
- 每次子进程执行的结果结构必须包含以下字段（进入相关检查项 `details`）：

| 字段 | 含义 |
|------|------|
| `bytes_read_stdout` / `bytes_read_stderr` | 实际从管道读取的字节数（含被丢弃部分） |
| `bytes_saved_stdout` / `bytes_saved_stderr` | 实际保存的字节数（≤ 上限） |
| `truncated_stdout` / `truncated_stderr` | 是否发生截断 |
| `exit_code` | 退出码（超时被杀则可为 null） |
| `timed_out` | 是否触发硬超时 |
| `kill_ok` | 超时/终止路径下是否成功终止（进程确认消失） |

#### 4.2.1 活动进程登记表（Probe 私有，ADR-0020）

`subproc.py` 内维护一个**线程安全**（`threading.Lock` 保护）的模块级活动进程登记表，仅登记 Probe 自己启动的探测子进程：

- `run_capture` 在 `Popen` 成功后立即登记 `(pid, Popen 对象)`；在进程与两个 reader 线程**彻底回收后**（`wait` 返回且线程 join 完成）移除。`finally` 保证异常路径也移除。
- 提供 `terminate_all_active(budget_s)`：对登记表快照中的每个进程执行 `taskkill /PID <pid> /T /F`（缺失则 `Popen.kill()` 兜底），供调度层在检查级超时时调用（§4.3.1）。
- 检查串行执行（§4.1），因此检查级超时发生时登记表中的活动进程必然属于当前超时检查，无归属歧义。
- **边界声明**：该登记表是 Probe 私有实现细节，不对外承诺接口，不是阶段 2 通用 Runner 的雏形（§2 非目标不变）；阶段 2 Runner 另行设计。

### 4.3 检查项通用契约

- 每项有独立超时（默认值见 §4.4，乘 `--timeout-scale`）。超时视为该项 `error`，错误码 `CHECK_TIMEOUT`。
- 状态语义：
  - `pass`：能力完整可用。
  - `degraded`：能力缺失/受限，但 Agent 可降级运行（如无 Git）。
  - `fail`：Agent 必需能力不可用（如 SQLite 无法建库、无法确认 Win7 SP1）。
  - `error`：检查自身异常（环境意外或代码缺陷），按 fail 参与退出码汇总。
  - `skipped`：被 `--only` 排除，或该子项在当前平台无意义（如非 Windows 下的 `enum_certificates`）。
- 每项必须填 `details`（探测到的事实）与 `duration_ms`；非 pass 必须填 `error` 对象（§5）。

#### 4.3.1 检查级超时的处置（ADR-0020）

检查函数在含超时的独立线程中执行。检查线程 join 超时后，调度层必须按以下固定顺序处置，**不得静默遗弃活动子进程**：

1. 调用 `subproc.terminate_all_active(...)` 终止当前活动子进程（终止预算 5 秒 × scale，不从检查预算扣除——此时检查预算已耗尽）。
2. 对检查线程做**有限宽限 join**：5 秒 × scale。
3. 宽限后线程已退出：该项记 `error` + `CHECK_TIMEOUT`（与原语义一致）。
4. 宽限后线程仍未退出：该项仍记 `error` + `CHECK_TIMEOUT`，且**必须**向 `probe.notes` 追加一条 `"CHECK_THREAD_LEAKED: <check_id>"`（ASCII）；线程为 daemon，不阻塞 Probe 退出。

**已知限制声明（设计内取舍）**：纯 Python 无法强制终止线程（CPython 无公开安全 API）。本阶段的风险控制边界是：(1) 检查线程只做标准库调用与有限本地 IO，无网络、无锁竞争源；(2) 泄漏线程可能持有的唯一外部资源是子进程，已由第 1 步先行终止；(3) Probe 是一次性短命进程，daemon 线程随进程退出消亡；(4) 泄漏事实必须体现在报告 `notes` 中，供 E1 验收人判断。不引入 `ctypes`/信号等未批准手段。

### 4.4 检查项清单（共 18 项，必需性列决定 fail/degraded 归类）

| # | ID | 检查内容 | 方法（标准库） | 必需性 | 超时(s) |
|---|----|----------|---------------|--------|---------|
| 1 | `os.version` | Windows 版本、SP、build、系统架构——**三个只读来源交叉探测**（ADR-0015，见备注 a） | ① `sys.getwindowsversion()`；② `platform.win32_ver()`；③ `winreg` 只读 `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion` 的 `ProductName`/`CurrentVersion`/`CurrentBuildNumber`/`CSDVersion`（D-008）。架构判定见备注 b | 必需（判定规则见备注 a：Win7 无法确认 SP1 为 **fail**） | 5 |
| 2 | `python.runtime` | Python 版本/实现/编译架构 | `sys.version_info`、`platform.python_implementation()`、`platform.architecture()[0]` | 必需（≠3.8.10 记 degraded 并给出实际值） | 5 |
| 3 | `process.bitness` | 当前进程 32/64 位 | `struct.calcsize("P") * 8` | 必需 | 5 |
| 4 | `sqlite.basic` | 建库、建表、写入、读回、**事务回滚**、关闭后文件删除 | `sqlite3`：INSERT 后 `rollback()`，断言行数为 0；再 INSERT+commit 断言为 1 | 必需（fail） | 10 |
| 5 | `tempfile.basic` | 临时文件/目录创建、写读、删除 | `tempfile.NamedTemporaryFile(delete=False)`、`mkdtemp`；显式删除并断言不存在 | 必需（fail） | 10 |
| 6 | `fs.unicode_paths` | 中文目录/文件、空格路径、中文+空格混合的创建/写/读/删 | 在 `ctx.workdir` 下建 `中文目录/测 试 文件.txt` 等三组路径，UTF-8 写读断言一致，删除断言不存在 | 必需（fail） | 10 |
| 7 | `fs.encodings` | **显式指定编码**的写读往返，共五种：UTF-8、UTF-8 BOM（`utf-8-sig`）、GBK/CP936、UTF-16 含 BOM（`utf-16`）、**UTF-16LE 无 BOM（显式 `utf-16-le`）** | 固定样本串（含中文、ASCII、全角符号），每种编码写→读→比对；GBK 额外验证"GBK 不可表示字符"抛 `UnicodeEncodeError` 的行为符合预期。不做任何自动编码识别（属阶段 4） | 必需（fail） | 10 |
| 8 | `fs.crlf_preserve` | CRLF 写入后字节级保持 | `open(..., "w", newline="")` 写 `"a\r\nb\r\n"`，二进制读回断言含 `b"\r\n"` 且无 `b"\r\r\n"`；再验证 `newline=""` 读取不转换 | 必需（fail） | 10 |
| 9 | `proc.exec` | 非交互式子进程执行 | `[sys.executable, "-c", "print('ok')"]`，经 §4.2 辅助执行，断言退出码 0、stdout 含 `ok` | 必需（fail） | 15 |
| 10 | `proc.timeout` | 子进程硬超时触发 | 子进程 `time.sleep(30)`，用 2 秒硬超时（<10s 默认值，专为本项设置）；断言 `timed_out=true`、`kill_ok=true`、进程已不存在 | 必需（fail） | 20 |
| 11 | `proc.capture` | stdout/stderr 分流捕获 | 子进程分别向两流写不同标记，断言各自捕获正确、互不混入，且 `bytes_read/saved` 字段一致 | 必需（fail） | 15 |
| 12 | `proc.truncate` | 输出超限截断（参数化，无管道死锁） | 子进程向 stdout 写 `max_stdout_bytes + 64 KiB` 字节；断言 `bytes_saved_stdout <= max_stdout_bytes`、`truncated_stdout=true`、`bytes_read_stdout >= 生成量`（子进程未死锁、正常退出） | 必需（fail） | 30 |
| 13 | `proc.kill` | 进程终止 + 进程树终止（workdir 辅助文件 + readiness 协议，ADR-0019） | 在 `ctx.workdir` 生成 `parent.py`/`child.py`/`run_tree.cmd`，经 `cmd.exe` 启动进程树；ready 后 `taskkill /PID <cmd_pid> /T /F`；`tasklist` CSV 精确验证父与孙均消失（完整协议见备注 (c)） | 必需；仅 `taskkill`/`cmd`/`tasklist` 缺失时 degraded；三工具齐备但行为失败一律 **fail**（ADR-0018） | 45 |
| 14 | `tool.git` | Git 存在性与版本 | `shutil.which("git")`；存在则 `git --version`（§4.2 辅助，10s 硬超时） | 可选（缺失 degraded，ADR-0007） | 15 |
| 15 | `tls.python_runtime` | **Python TLS Runtime Capability（纯离线，ADR-0016）**：① `ssl` 可导入；② `ssl.OPENSSL_VERSION`；③ 默认客户端 `SSLContext` 创建（`ssl.create_default_context()`）；④ `ssl.get_default_verify_paths()`；⑤ `ssl.HAS_SNI`；⑥ `ssl.HAS_ALPN`；⑦ TLS 常量（`HAS_TLSv1_2`/`HAS_TLSv1_3`/`PROTOCOL_TLS_CLIENT`）；⑧ Windows 下 `ssl.enum_certificates("ROOT")` 可否调用及**证书数量**（不输出证书内容） | 全部 `ssl` 模块内省，零 socket、零网络（禁令见备注 d） | 可选（异常 degraded；无 TLS1.2 记 degraded 并高亮） | 10 |
| 16 | `disk.space` | 报告目录与 TEMP 所在盘剩余空间 | `shutil.disk_usage`（P06）；`free < 500MB` 记 degraded | 必需 | 5 |
| 17 | `env.user_temp` | 当前用户名、临时目录路径及其可写性 | `getpass.getuser()`、`tempfile.gettempdir()`、在其中试写删一个文件 | 必需（临时目录不可写为 fail） | 10 |
| 18 | `report.sqlite` | 能否创建 SQLite 证据文件并写入先行 17 项快照 | 按 §4.5 建表并写入；成功后保留文件（这是唯一允许保留的非 JSON 产物） | 可选（失败 degraded，JSON 仍为唯一权威，ADR-0014） | 15 |

备注：

- (a) `os.version` 判定规则（ADR-0022，取代 ADR-0015 的判定顺序语义）：
  - 任一来源失败：记录该来源 `available: false` 与失败原因，**不终止 Probe**，其余来源继续。
  - 三来源的**原始值全部保留**进 `details.sources`（不做归一化覆盖）。
  - **裁决顺序（严格按序判定，命中即止）**：
    1. 所有可用来源均未给出 Windows 7（major=6, minor=1），含零个可用来源：`degraded` + `NON_TARGET_OS`（即使非 6.1 来源之间互相不一致，如 10.0/10.0/6.3，仍判 `NON_TARGET_OS`）。
    2. 至少一个来源给出 6.1，且另有来源给出不同 (major, minor)：`degraded` + `OS_SOURCE_CONFLICT`，控制台 WARN。
    3. 全部可用来源一致为 6.1，但无法确认 SP1（含确认无 SP）：**fail** + `SP_UNCONFIRMED`，message 说明“无法确认 SP1”。**不得伪装为已通过**。
    4. 全部可用来源一致为 6.1 且至少一个来源确认 SP1（`service_pack_major>=1` 或 `CSDVersion` 含 "Service Pack 1" 或 build ≥ 7601）：该维度通过。
  - `details` 必须新增 `verdict` 对象（最终裁决结果，供 `host` 直接消费，§6）：`{"is_windows7": bool, "sp1_confirmed": bool, "os_build": str, "os_service_pack": "SP1" | "unconfirmed", "os_caption": str, "os_arch": "64bit" | "32bit" | "unknown"}`。`os_build`/`os_caption` 取自可用来源中按固定优先级 `getwindowsversion → registry → win32_ver` 的第一个；`os_service_pack` 仅在裁决确认 SP1 时为 `"SP1"`，否则 `"unconfirmed"`。
- (b) 系统架构判定逻辑必须写死为：64 位进程 → 系统必为 64 位；32 位进程 → 读 `platform.machine()`，若仍不能判定则记 `os_arch: "unknown"` 并 degraded。禁止调用 Win10+ API。
- (c) `proc.kill` 协议（ADR-0019，取代旧“嵌套 list2cmdline + python -c + 固定 0.5 秒终止”方案，后者**禁止继续使用**）：
  - **辅助文件**（全部只能位于 `ctx.workdir`，由本检查创建，随 workdir 统一清理）：
    - `child.py`：`time.sleep(300)`。
    - `parent.py`：用 `sys.executable` 启动 `child.py`（`Popen`）；将自身 PID 与孙进程 PID（各一行，ASCII 十进制）写入临时名 PID 文件后 `os.replace` 为 `pids.txt`（原子可见）；随后用 `os.open(..., O_CREAT | O_EXCL)` **原子创建** `ready.flag`；最后 `time.sleep(300)`。
    - `run_tree.cmd`：内容为纯 ASCII（CRLF），通过环境变量引用解释器：`@"%CAP_PROBE_PYTHON%" "%~dp0parent.py"`。
  - **解释器传递**：Python 可执行文件路径通过环境变量 `CAP_PROBE_PYTHON` 传入，该变量**仅对本次 `cmd.exe` 子进程生效**（`Popen(env=副本+追加)`），不修改 Probe 自身环境；中文/空格路径由 cmd 双引号引用覆盖。
  - **执行步骤**（全部预算 × scale，总和 40 秒 < 注册超时 45 秒，保留 5 秒安全余量）：
    1. `Popen([cmd.exe, "/d", "/c", run_tree.cmd 绝对路径])`（argv 列表，无嵌套命令行拼接）；`Popen` 失败 → fail + `SUBPROC_SPAWN_FAILED`。
    2. **readiness 轮询**：每 0.1 秒检查 `ready.flag`，独立准备超时 10 秒；超时未 ready（或 `pids.txt` 无法解析出两个 PID）→ fail + `SUBPROC_BEHAVIOR_MISMATCH`，终止已启动的进程树后返回。
    3. ready 后对 `cmd.exe` 进程（`Popen.pid`）执行 `taskkill /PID <pid> /T /F`（预算 5 秒）。
    4. **验证**：轮询总预算 10 秒（间隔 0.5 秒），每轮用 `tasklist /FI "PID eq <pid>" /FO CSV /NH`（每次调用预算 5 秒，计入验证总预算）分别确认 `parent.py` PID 与孙进程 PID 消失；**CSV 解析必须用标准库 `csv` 模块解析后取 PID 列做字符串精确相等比较**，禁止子串包含判断（防 1234 误匹配 12345）。
    5. 回收：`Popen.wait` + reader join（剩余预算，至少地板值）。
  - **结果字段**：`parent_gone`、`child_gone`、`tree_kill` 必须**始终为 bool**（初始化 false，仅在确认消失后置 true），禁止用 `null` 表达最终结论；另记 `parent_pid`、`child_pid`、`cmd_pid`、`ready_within_s`。`tree_kill = parent_gone and child_gone and taskkill 退出码 0`。
  - **状态裁决**（ADR-0018）：`taskkill`/`cmd.exe`/`tasklist` 任一缺失 → `degraded` + `CAPABILITY_LIMITED`（details.`missing_tools` 列出缺失项）；三工具齐备时，启动失败、readiness 超时、PID 无法获得 → `fail`（`SUBPROC_SPAWN_FAILED` / `SUBPROC_BEHAVIOR_MISMATCH`）；父进程未消失、孙进程未消失或树终止失败 → `fail` + `PROCESS_TREE_TERMINATION_FAILED`。
- (d) `tls.python_runtime` 五项禁令（ADR-0016，违反即验收否决）：不访问公网；不连接真实模型服务；不验证企业代理；不进行 SChannel 网络握手；不输出证书完整内容（`details` 只允许数量、布尔与版本字符串）。非 Windows 环境 `enum_certificates` 子项记 `skipped`。
- (e) 检查 4~13 的所有文件均创建于 `ctx.workdir`；检查 17 在系统 TEMP 中创建的文件必须以 `cap_probe_` 前缀命名并在检查内删除。
- (f) `fs.*` 字节级断言（ADR-0022）：`fs.encodings` 除文本往返比对外，必须二进制读回并断言：① 每种编码的文件字节 == `样本.encode(该编码)`；② `utf-8-sig` 文件以 `EF BB BF` 开头；③ `utf-16` 文件以 `FF FE` 或 `FE FF` 开头（真实 BOM）；④ `utf-16-le` 文件**不以**上述任一 BOM 开头；⑤ GBK/CP936 文件含关键字节（样本中“中”字的 GBK 编码 `D6 D0`）。每种编码的 details 增记 `bytes_ok` 与 `bom_ok`（bool）。仍仅验证显式指定编码的读写，**不实现未知编码自动识别**（属阶段 4）。
- (g) `PATH_TOO_LONG` 识别（ADR-0022）：必须同时识别两种形态——`OSError.errno == errno.ENAMETOOLONG`（用常量，禁止硬编码数字；Windows 上为 38，非 POSIX 的 36）与 `getattr(exc, "winerror", None) == 206`（ERROR_FILENAME_EXCED_RANGE）；任一命中即记 `PATH_TOO_LONG`。

### 4.5 SQLite 证据文件表结构（ADR-0014）

```sql
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
-- 必写行：('schema_version','1'), ('report_version','1'), ('probe_version', ...), ('generated_at', ISO8601)
CREATE TABLE checks (
  id          TEXT PRIMARY KEY,   -- 检查项 ID
  status      TEXT NOT NULL,      -- pass/degraded/fail/error/skipped
  duration_ms INTEGER NOT NULL,
  details     TEXT NOT NULL,      -- 该项 details 的 JSON 字符串
  error       TEXT                -- 错误对象 JSON 字符串，可空
);
```

语义：`checks` 表只含**先行 17 项**的快照；`report.sqlite` 自身结果只存在于 JSON。该文件是"建库能力证据"，任何消费方不得依赖其内容。

#### 4.5.1 `report.sqlite` 执行与可靠性要求（ADR-0021）

- **统一隔离调度**：`report.sqlite` 必须与其他 17 项一样经调度层隔离执行（独立线程 + 异常兜底 + §4.3.1 超时处置），检查级超时 15 秒 × scale，超时记 `error` + `CHECK_TIMEOUT`；`duration_ms` 必须是真实测量值（禁止固定 0）。
- **异常转结构化结果**：`sqlite3.Error`/`OSError` → `degraded` + `SQLITE_OP_FAILED`；序列化异常（`json.dumps` 抛 `TypeError`/`ValueError`）与其他意外异常 → 由调度层兜底为 `error` + `UNEXPECTED`。两种情形均不得向外抛。
- **明确的 SQLite 超时**：`sqlite3.connect(path, timeout=5.0)`（乘 scale）；事务显式 `BEGIN`/`commit`，不依赖隐式自动提交语义。
- **已有数据库处理**：`--db` 路径已存在时**禁止静默复用未知旧 Schema**；裁决为覆盖式输出（与 `--out` 同语义）：不读取旧内容，先 `os.remove` 旧文件（删除前 `os.chmod(S_IWRITE)`，P09）再建新库；删除失败 → `degraded` + `SQLITE_OP_FAILED`。details 记 `preexisting_db_replaced: bool`。
- **半成品清理**：记录本次是否新建了库文件；写入失败后尽力关闭连接，并删除**本次新建**的半成品数据库（含 `-journal`/`-wal` 伴生文件，尽力而为，删除失败记入 details）。
- **不阻断 JSON**：`report.sqlite` 任何失败（含超时、序列化异常）都不得阻止 JSON 报告生成（ADR-0014 不变）。

### 4.6 执行流程（`__main__.py`）

```
解析参数 → 建 workdir → 按注册表顺序执行检查 1~17（每项独立 try/except + 超时，§4.3.1）
→ 若 --db 有效：执行 report.sqlite 检查（同样经调度层隔离，§4.5.1；写入先行 17 项快照）
→ 清理 workdir（结果记入 cleanup_ok / notes）
→ 汇总全部 18 项 summary 与退出码 → 组装**含 cleanup 状态**的报告字典 → 单次原子写 JSON（不回填）
→ 打印 ASCII 摘要 → sys.exit(exit_code)
```

顺序裁决（本轮纠错）：workdir 清理必须发生在报告组装与写出**之前**，使 `probe.cleanup_ok` 与清理失败 notes 能进入单次写出的 JSON；旧版“先写 JSON 后清理”的流程描述作废。

与旧设计的差异（ADR-0014）：`report.sqlite` 在 JSON 写出**之前**执行，JSON 一次写出即含全部 18 项最终状态；**取消"写库后回填并重写 JSON"的双写流程**。

## 5. 错误模型

### 5.1 错误对象结构（JSON 中 `error` 字段）

```json
{
  "code": "CHECK_TIMEOUT",
  "message": "check exceeded 20.0s",
  "exception_type": "TimeoutError",
  "traceback_tail": "最后 5 行 traceback，可空"
}
```

### 5.2 错误码枚举（冻结，新增需修订本文档）

| code | 含义 | 典型状态 |
|------|------|----------|
| `CHECK_TIMEOUT` | 检查项整体超时 | error |
| `SUBPROC_TIMEOUT` | 探测子进程硬超时（对 proc.timeout 而言这是预期结果，不算错） | 视语义 |
| `SUBPROC_SPAWN_FAILED` | 子进程无法启动 | fail/error |
| `SUBPROC_BEHAVIOR_MISMATCH` | 子进程正常启动，但输出、退出码或行为不符合检查断言（ADR-0018；`proc.exec`/`proc.capture`/`proc.truncate` 的行为断言失败**必须**用本码，禁止继续使用 `FS_OP_FAILED`） | fail |
| `PROCESS_TREE_TERMINATION_FAILED` | `taskkill`/`cmd` 均存在，但无法确认父进程与孙进程全部终止（ADR-0018） | fail |
| `TOOL_NOT_FOUND` | 外部工具不存在（git/taskkill） | degraded |
| `ENCODING_MISMATCH` | 编码往返内容不一致（含字节/BOM 断言失败，备注 (f)） | fail |
| `CRLF_NOT_PRESERVED` | 换行被意外转换 | fail |
| `FS_OP_FAILED` | 文件/目录创建、读写、删除失败（**仅限真实文件系统操作失败**，禁止用于子进程行为断言，ADR-0018） | fail |
| `PATH_TOO_LONG` | 路径超长（P08；识别双形态见备注 (g)） | fail |
| `SQLITE_OP_FAILED` | SQLite 操作失败（含回滚断言失败） | fail |
| `TLS_UNAVAILABLE` | ssl 模块缺失或 SSLContext 创建失败 | degraded |
| `SP_UNCONFIRMED` | 判定为 Windows 7 但无法确认 SP1（ADR-0022） | fail |
| `OS_SOURCE_CONFLICT` | 至少一源给出 6.1 且另有源给出不同版本（ADR-0022） | degraded |
| `NON_TARGET_OS` | 所有可用来源均未给出 6.1（ADR-0022；含开发回归环境） | degraded |
| `LOW_DISK_SPACE` | 剩余空间低于阈值 | degraded |
| `CAPABILITY_LIMITED` | 能力存在但受限（如仅能 kill 直接子进程） | degraded |
| `UNEXPECTED` | 未预期异常（兜底） | error |
| `CLEANUP_FAILED` | workdir 清理失败（记在 probe 层，不属于检查项） | 不影响退出码，但报告必须体现 |

### 5.3 分层错误处理规则

1. 检查函数内部：预期失败 → 返回带 error 的 CheckResult；不自己捕获 `KeyboardInterrupt`。
2. 调度层：捕获检查函数逃逸的一切 `Exception` → 该项 `error` + `UNEXPECTED`；捕获超时 → `CHECK_TIMEOUT`（处置顺序见 §4.3.1）。
3. 顶层：报告写出失败 → stderr 打 ASCII 错误一行，退出码 3；这是唯一允许无 JSON 报告退出的路径。
4. 全程禁止 `except: pass`；禁止把 traceback 全文打到控制台（进 `traceback_tail`）。

### 5.4 报告可靠性要求（ADR-0021）

1. **`safe_getuser()`**：封装 `getpass.getuser()`，捕获**任何异常**（含 `KeyError`/`OSError` 等）均返回 `"unknown"`；`env.user_temp` 与 `host.username` 统一经由它取值。
2. **host 取三源裁决**：`host.os_caption`/`os_build`/`os_service_pack`/`os_arch` 必须直接取自 `os.version` 检查 `details.verdict`（备注 (a)）；**禁止**在报告组装层重新从单一 `sys.getwindowsversion()`/`platform.platform()` 推断。`os.version` 被 skip 或无 verdict 时，对应字段取 `"unknown"`/`"unconfirmed"`。
3. **顶层兜底**：报告组装、序列化与原子写出三段统一包在顶层 `try/except Exception` 内；任何异常 → stderr 一行 ASCII 错误 + 退出码 3。
4. **无半截 JSON**：写出失败（含序列化中途异常）时临时文件必须被删除，目标路径不得出现半截文件（临时文件 + `os.replace` 不变）。
5. **退出码**：参数错误或报告无法写出 → 3；`--help`/`-h` → 0（§3.1）。

## 6. JSON 报告 Schema

`report_version: 1`。顶层结构（伪 JSON Schema，`?` 表示可空）：

```json
{
  "report_version": 1,
  "probe_version": "0.1.0",
  "generated_at": "2026-07-26T12:00:00+08:00",
  "duration_ms": 41250,
  "host": {
    "os_caption": "Windows-7-6.1.7601-SP1",
    "os_build": "7601",
    "os_service_pack": "SP1 | unconfirmed",
    "os_arch": "64bit | 32bit | unknown",
    "python_version": "3.8.10",
    "python_implementation": "CPython",
    "python_executable": "C:\\...\\python.exe",
    "process_bitness": 64,
    "username": "user1",
    "temp_dir": "C:\\Users\\user1\\AppData\\Local\\Temp",
    "cwd": "D:\\工作 目录\\agent"
  },
  "invocation": {
    "argv": ["--out", "..."],
    "timeout_scale": 1.0,
    "max_stdout_bytes": 1048576,
    "max_stderr_bytes": 1048576,
    "report_path": "…\\probe_report.json",
    "db_path": "…\\probe_report.sqlite3 | null"
  },
  "checks": [
    {
      "id": "sqlite.basic",
      "status": "pass | degraded | fail | error | skipped",
      "duration_ms": 120,
      "details": { "任意键值，见各检查项 details 约定": "…" },
      "error": { "code": "…", "message": "…", "exception_type": "?", "traceback_tail": "?" }
    }
  ],
  "summary": {
    "total": 18, "pass": 15, "degraded": 2, "fail": 0, "error": 0, "skipped": 1,
    "exit_code": 1,
    "agent_runnable": true,
    "blocking_check_ids": []
  },
  "probe": { "cleanup_ok": true, "notes": [] }
}
```

约定：

- `agent_runnable` = （`fail` 与 `error` 数均为 0）。`blocking_check_ids` 列出全部 fail/error 项 ID。
- `checks` 数组包含全部 18 项（含 skipped），顺序与 §4.4 表一致。
- `os.version` 的 `details.sources` 必须完整保留三来源原始值，形如：`{"getwindowsversion": {"available": true, "raw": {...}}, "win32_ver": {...}, "registry": {"available": true, "raw": {"ProductName": "...", "CurrentVersion": "...", "CurrentBuildNumber": "...", "CSDVersion": "..."}}}`；`host.os_*` 字段**必须逐字段取自** `details.verdict`（三源裁决结果，备注 (a)），禁止从单一来源重新推断（§5.4）。
- `tls.python_runtime` 的 `details` 至少含：`ssl_importable`、`openssl_version`、`default_context_ok`、`default_verify_paths`、`has_sni`、`has_alpn`、`has_tlsv1_2`、`has_tlsv1_3`、`root_cert_count`（或 `enum_certificates_ok: false` / `skipped`）。禁止出现证书内容字段。
- `proc.*` 各项 `details` 必含 §4.2 的六类子进程结果字段。
- 时间戳一律 ISO 8601 带本地时区偏移（P07）。
- 报告中的路径按原样存储（UTF-8 JSON 可含中文）；ASCII 化仅用于控制台。

## 7. 测试矩阵

单元测试用 `unittest`（标准库），放 `tests/unit/probe/`（纯逻辑）与 `tests/integration/probe/`（跑真实子进程/文件系统）；Win7 实机验收清单放 `tests/win7/`。E1/E2/E3/E4 指 EVALUATION.md §1 环境。

| 用例 | 内容 | 环境 | 预期 |
|------|------|------|------|
| T01 | 全量运行（默认参数） | E1 | 退出码 0 或 1；JSON 通过 Schema 自检；无残留文件 |
| T02 | 全量运行（32 位 CPython 3.8.10，补充运行，见 §10 O1） | E2 机器 + x86 Python | `process_bitness=32`，`os_arch` 为 `64bit` |
| T03 | `--list` | E1/E3 | 打印 18 行 ASCII，退出码 0，不产生任何文件 |
| T04 | `--only sqlite.basic` | E1/E3 | 仅该项非 skipped；报告仍含 18 项 |
| T05 | 报告路径在中文+空格目录 | E2 | `--out "D:\中文 目录\r.json"` 正常写出可解析 |
| T06 | 报告父目录不存在 | E1/E3 | 退出码 3，stderr 一行 ASCII 错误，无半截文件 |
| T07 | sqlite 回滚断言 | E1/E3 | `sqlite.basic.details.rollback_verified=true` |
| T08 | 五种显式编码往返 | E1 | `fs.encodings` pass，details 含 `utf-8`/`utf-8-sig`/`gbk`/`utf-16`/`utf-16-le` 每种的 `roundtrip_ok` |
| T09 | GBK 不可表示字符 | E1/E3 | details 记录 `gbk_strict_raises=true`，不导致整项 fail |
| T10 | CRLF 保持 | E1 | `fs.crlf_preserve` pass，二进制断言通过 |
| T11 | 子进程硬超时 | E1 | `proc.timeout` pass；`timed_out=true`、`kill_ok=true`；`tasklist` 确认无残留进程 |
| T12 | 参数化截断（默认 1 MiB 上限，生成 1 MiB+64 KiB） | E1 | `proc.truncate` pass；`bytes_saved_stdout<=1048576`、`truncated_stdout=true`、`bytes_read_stdout>=1114112`（无死锁） |
| T13 | 进程树终止（readiness 协议） | E1 | `proc.kill` pass；`ready_within_s` 记录；父与孙 PID 在 tasklist CSV 精确匹配下均消失；`parent_gone`/`child_gone`/`tree_kill` 均为 bool true |
| T14 | 无 git 环境 | E2（天然无 git）；E3 用临时清 PATH 模拟 | `tool.git` degraded + `TOOL_NOT_FOUND`；退出码 1；JSON 完整含 18 项 |
| T15 | 模拟无 taskkill（临时清 PATH 后子进程运行 Probe） | E3 | `proc.kill` degraded + `CAPABILITY_LIMITED`，`missing_tools` 含 taskkill，`tree_kill=false`（bool） |
| T16 | 磁盘空间字段 | E1 | `disk.space.details.free_bytes` 与 `fsutil volume diskfree`（人工）同数量级 |
| T17 | Python TLS Runtime 离线探测 | E1（断网） | `tls.python_runtime` 完成且**零网络流量**（断网环境天然验证）；details 含 §6 全部必填键；`root_cert_count` 为非负整数；无证书内容字段 |
| T18 | SQLite 证据文件 | E1 | `report.sqlite` pass；用 Python 读回 `checks` 行数 = **17**（先行项快照，ADR-0014） |
| T19 | 证据文件内容抽查 | E1/E3 | 证据文件中各项 status 与 JSON 中先行 17 项一致；库中**不含** `report.sqlite` 自身行 |
| T20 | 检查项注入异常（测试挂钩：monkeypatch 某检查函数抛 RuntimeError） | E3 | 该项 `error/UNEXPECTED`，其余项正常，退出码 2，报告完整 |
| T21 | 静态检查 S1~S7 | E4 | 全部通过（EVALUATION.md §2） |
| T22 | `--timeout-scale 0.5 / 10` 边界与非法值 `0 / 100 / abc`；`--max-stdout-bytes` 边界与非法值 | E3 | 合法值生效（报告 `invocation` 如实记录）；非法值退出码 3 + ASCII 用法 |
| T23 | 版本来源冲突模拟（monkeypatch 使 ② 与 ③ 结论不同） | E3 | `os.version` degraded + `OS_SOURCE_CONFLICT`；`details.sources` 保留全部原始值 |
| T24 | Win7 无法确认 SP1 模拟（monkeypatch 三源均无 SP 信息，版本 6.1） | E3 | `os.version` fail + `SP_UNCONFIRMED`，message 含"无法确认 SP1"语义（ASCII 摘要行为 FAIL）；报告仍完整产出 |
| T25 | 单一版本来源失败（monkeypatch winreg 抛 OSError） | E3 | Probe 不终止；`details.sources.registry.available=false`；其余来源正常参与判定 |
| T26 | 三工具齐备但树终止失败（monkeypatch 使父与孙 PID 始终在 tasklist 中可见） | E3 | `proc.kill` **fail** + `PROCESS_TREE_TERMINATION_FAILED`；退出码 2 |
| T27 | 父消失但孙进程存活（monkeypatch 仅孙 PID 可见） | E3 | `proc.kill` fail + `PROCESS_TREE_TERMINATION_FAILED`；`parent_gone=true`、`child_gone=false`（均 bool） |
| T28 | tasklist CSV 精确匹配单元测试 | E3/E4 | PID `1234` 不被 `12345` 的 CSV 行误判为存活；含引号/逗号字段的 CSV 正确解析 |
| T29 | proc.kill 辅助文件在中文+空格 workdir 下 | E2；E3 用自定义 TEMP 模拟 | 协议正常完成；辅助文件全部位于 workdir 内且随之清理 |
| T30 | PATH_TOO_LONG 双形态（分别构造 errno.ENAMETOOLONG 与 winerror 206） | E3 | 两种形态均识别为 `PATH_TOO_LONG`，不落入 `FS_OP_FAILED` |
| T31 | `getpass.getuser` 抛异常（monkeypatch） | E3 | `host.username="unknown"`；`env.user_temp` 不因此 error；报告完整产出 |
| T32 | `run_capture` 超时与活动进程回收 | E3 | 超时后无残留进程；reader 线程已 join；活动进程登记表为空；总耗时 ≤ timeout_s + 3×地板值 |
| T33 | 检查级超时处置（注入永不返回的检查 + 活动子进程） | E3 | 子进程被终止；宽限后未退出则 `notes` 含 `CHECK_THREAD_LEAKED: <check_id>` |
| T34 | `report.sqlite` 超时与序列化异常（分别 monkeypatch 慢写入与不可序列化 details） | E3 | 分别记 `error/CHECK_TIMEOUT` 与 `error/UNEXPECTED`；`duration_ms>0`；JSON 报告仍产出 |
| T35 | `report.sqlite` 半成品清理与旧库替换 | E3 | 新建库写入失败后磁盘无半成品库文件；预先放置旧文件时 `preexisting_db_replaced=true` 且旧内容不被复用 |
| T36 | JSON 组装异常与原子写失败（分别 monkeypatch build_report 抛异常、os.replace 抛 OSError） | E3 | 退出码 3；stderr 一行 ASCII；目标路径无半截 JSON，临时文件无残留 |
| T37 | OS 三源 10.0/10.0/6.3（monkeypatch） | E3 | `os.version` degraded + `NON_TARGET_OS`（非 OS_SOURCE_CONFLICT） |
| T38 | OS 来源 6.1 与 10.0 冲突（monkeypatch） | E3 | `os.version` degraded + `OS_SOURCE_CONFLICT` |
| T39 | 编码字节级断言 | E1/E3 | `utf-8-sig`/`utf-16` 文件含真实 BOM，`utf-16-le` 无 BOM，GBK 含 `D6 D0`；各编码 `bytes_ok`/`bom_ok` 为 true |
| T40 | 报告 Schema 与算术自检 | E3 | 18 项顺序与 §4.4 一致；`summary.total=18` 且等于五态计数之和；`exit_code` 与状态集合对应；`host.os_*` 与 `verdict` 逐字段一致 |
| T41 | `--help` | E3 | 退出码 0，输出 ASCII 用法，不产生任何文件 |
| T42 | CPython 3.8.10 `compileall` + 全量 `unittest` | E3/E4 | `python -m compileall -q src tests` 零错误；全部单元/集成用例通过 |

## 8. 验收标准

全部满足才算阶段 1 完成：

1. 实现**可以**在 E3（现代开发环境 + CPython 3.8.10）上开始并回归，但 T01~T25 中标注 E1/E2 的用例必须在真实 Win7 SP1 x64 断网环境执行；**E1+E2 验收是阶段完成硬门槛**（EVALUATION §1），未完成前阶段 1 不得标记为完成。验收记录按 EVALUATION.md §5 归档。
2. 静态检查 S1~S7 零违例。
3. `python -m win7_agent.probe` 在 E1 上重复运行 3 次，报告除时间戳/耗时外内容稳定（无随机波动的状态）。
4. 运行前后 `tasklist` 对比无残留进程；`%TEMP%` 与 workdir 无 `cap_probe_` 残留。
5. 报告含全部 18 个检查项且顺序、字段符合 §6；`os.version` 三源原始值俱全。
6. 代码中出现的每个外部工具（taskkill/tasklist/git/cmd）均在 WIN7_CONSTRAINTS §6 有"批准"记录；`winreg` 使用严格限于 D-008 批准的只读单键。
7. 无任何网络 API 调用（`socket.connect`、`http.client` 等在 `win7_agent.probe` 包内零出现，`import socket` 仅允许为间接依赖）。
8. 交付包内附 `scripts/run_probe.bat` 与 `scripts/run_tests.bat`（各 ≤5 行，ADR-0013），在中文/空格安装路径下可直接双击运行 `run_probe.bat`；**两个 `.bat` 文件必须使用 CRLF 换行**（cmd.exe 对 LF-only 批处理存在已知解析风险；验收时二进制抽查，仓库需配套 `.gitattributes` 固定 `*.bat text eol=crlf`）。
9. 实现文件全部位于 §0.2 白名单路径内（AGENTS.md C14 / ADR-0011）。
10. §0.3 修复项 R1~R8 全部关闭并由架构师解除 `Phase-Gate: REPAIR_REQUIRED_BEFORE_E1` 后，方可启动 E1/E2 验收。

## 9. 明确禁止事项（阶段 1 专属，叠加 AGENTS.md §7）

1. 禁止任何网络连接（含 DNS 查询、localhost 连接）。TLS 检查越界联网即验收否决（ADR-0016 五禁令：不访问公网、不连真实模型服务、不验证企业代理、不做 SChannel 网络握手、不输出证书完整内容）。
2. 禁止 `ctypes`、`msvcrt`（未获依赖批准）。`winreg` **仅允许** D-008 批准的用途：只读 `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion` 单键的四个值；任何写操作或读取其他键均属违例。
3. 禁止修改 `ctx.workdir` 与系统 TEMP 之外的任何文件系统位置。
4. 禁止读取或记录全量环境变量、已装软件列表、硬件序列号。
5. 禁止 `shell=True`、`os.system`、`os.popen`、`subprocess.getoutput`。
6. 禁止向控制台输出非 ASCII 字节（ADR-0006）。
7. 禁止吞掉清理失败（必须体现在 `probe.cleanup_ok` / `notes`）。
8. 禁止实现本文档未列出的检查项或"顺手"实现阶段 2 的通用 Runner 接口、阶段 4 的自动编码识别。
9. 禁止在检查之间共享可变全局状态（`ctx` 只读传入）。
10. 禁止第三方库 import（含 vendoring）。
11. 禁止在 §0.2 白名单之外创建/修改实现文件（ADR-0011）。
12. 禁止停止读取子进程 stdout/stderr（达到保存上限后必须继续读取并丢弃，防管道死锁，§4.2）。

## 10. 开放问题与裁决记录

已裁决（保留记录，不再开放）：

| # | 问题/矛盾 | 裁决 |
|---|-----------|------|
| Q1 | "探测 TLS/CA" 与 "完全离线" 的张力 | 纯离线 Python TLS Runtime Capability，真实握手在阶段 3（ADR-0016，负责人批准） |
| Q2 | JSON 与 SQLite 的权威性 | JSON 唯一权威、单次写出；SQLite 仅证据文件（ADR-0014，负责人批准） |
| Q3 | C14 与阶段 1 实现的解禁机制 | 任务授权机制（Status + 路径白名单），否决目录豁免（ADR-0011，负责人裁决）；本文档 §0 即授权 |
| Q4 | `platform.win32_ver()` 可能返回空 SP | 三个只读来源交叉探测；Win7 无法确认 SP1 判 fail（ADR-0015，负责人裁决） |
| Q5 | 是否覆盖无 BOM 的 UTF-16LE | 覆盖：显式 `utf-16-le` 读写纳入 `fs.encodings`（负责人裁决）；自动识别留阶段 4 |
| Q6 | 60 秒目标与 5MB 截断用例的冲突 | 截断参数化（默认 1 MiB + 64 KiB 生成量）；60 秒改为性能目标非硬终止（负责人裁决） |
| Q7 | 是否包含 SChannel 能力 | 阶段 1 只检查 Python TLS Runtime，不宣称检查 SChannel（负责人裁决）；SChannel 相关验证随阶段 3 真实握手 |

仍开放（待负责人裁决，不阻塞实现开始）：

| # | 问题 | 现状 | 建议 |
|---|------|------|------|
| O1 | 32 位 Python 验证（T02）未包含在 E1/E2 环境定义内，是否升为强制验收项 | EVALUATION §1 已注明"建议在 E2 机器上补充用 CPython 3.8.10 x86 运行一次" | 维持"建议补充运行"；若目标机群存在只装 x86 Python 的机器，再升为强制 |
| O2 | 精简版 Win7 上三源可能全部无法证实 SP1（实际已装 SP1），保守 FAIL 是否需要人工覆核通道 | ADR-0015 已声明属设计内取舍 | E1 实测后若出现误判，再议"人工确认 + 记录覆核人"的旁路，不在阶段 1 实现 |

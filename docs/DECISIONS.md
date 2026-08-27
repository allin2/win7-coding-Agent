# DECISIONS — 架构决策记录（ADR）

格式：每条 ADR 含「状态 / 背景 / 决策 / 后果」。
状态取值：Proposed（提议）、Accepted（已接受）、Superseded by ADR-XXXX（被取代）。
**已 Accepted 的 ADR 不得修改或删除**，只能被新 ADR 取代（AGENTS.md §5.6）。

---

## ADR-0001 目标平台冻结为 Win7 SP1 x64 + CPython 3.8.10，仅标准库

- 状态：Superseded by ADR-0027（2026-07-29；Phase 1/2 已冻结任务合同继续按其任务书执行）
- 背景：部署目标为无法升级的 Win7 存量机器；CPython 3.8.10 是最后一个官方支持 Win7 的版本；目标机器断网，无法 pip 安装。
- 决策：全项目冻结在 CPython 3.8.10 x64 + 标准库；第三方依赖原则性禁止，例外走 WIN7_CONSTRAINTS §6 评审。
- 后果：放弃 3.9+ 语言便利与生态库；换来零依赖离线交付与确定性兼容。平台 EOL 风险由 SECURITY.md §4 声明。

## ADR-0002 状态、审计与 Probe 报告持久化选用 SQLite（标准库 sqlite3）

- 状态：Superseded by ADR-0027（2026-07-29；历史 Python 实现与既有数据契约不变）
- 背景：需要零部署、单文件、支持事务的本地存储；不允许外部数据库服务。
- 决策：所有结构化持久化用 `sqlite3`；库文件必须位于本地磁盘（WIN7_CONSTRAINTS P10）；每个库带 `schema_version` 表。SQLite 可用性本身是阶段 1 探测项。
- 后果：并发写受限（单进程模型下可接受）；获得事务回滚与崩溃安全。

## ADR-0003 Probe 报告的主输出为 JSON 文件（UTF-8 无 BOM），SQLite 报告库为可选副产物

- 状态：Superseded by ADR-0014（2026-07-26）
- 背景：需求同时提到"输出结构化 JSON"与"创建 SQLite 报告数据库"，两者关系需裁决。
- 决策：JSON 文件是**唯一权威报告**（机器与人共同消费）；SQLite 报告库的创建本身是一个探测项（验证真实建库能力），成功后写入同一份报告数据作为副本，失败不影响 JSON 报告产出。
- 后果：消费方只需解析 JSON；SQLite 写入路径得到真实验证；报告双写的一致性以 JSON 为准。

## ADR-0004 Probe 采用"检查项永不中断整体"的隔离执行模型

- 状态：Accepted（2026-07-26）
- 背景：探测目的就是发现坏环境；坏环境必然触发异常，若异常导致 Probe 崩溃则报告无法产出，探测失去意义。
- 决策：每个检查项在独立的 try/except 边界内执行，结果为五态之一：`pass / degraded / fail / error / skipped`；单项失败只影响该项状态。仅"报告文件本身无法写出"允许以非零内部错误码退出。
- 后果：Probe 主流程简单可靠；代价是每个检查项必须自带清理逻辑（不能依赖全局 finally）。

## ADR-0005 子进程终止方案：`taskkill /PID <pid> /T /F` 为主，`Popen.kill()` 为降级

- 状态：Superseded by ADR-0027（2026-07-29；Phase 1/2 的既有子进程合同不变）
- 背景：Python 3.8 的 `subprocess` 超时只终止直接子进程，Windows 上孙进程存活（WIN7_CONSTRAINTS P01）；Job Objects 需 `ctypes`（高风险模块，未批准 D-005）。
- 决策：进程树终止统一使用 Win7 自带的 `taskkill.exe`（依赖 D-002）；`taskkill` 不可用时降级 `Popen.kill()` 并在结果中标记 `tree_kill: false`。阶段 1 的 Probe 负责实测 `taskkill` 可用性。
- 后果：不引入 ctypes；接受降级模式下孙进程可能残留的已知限制（记录在报告中）。

## ADR-0006 控制台输出 ASCII-only，完整信息写 UTF-8 文件

- 状态：Superseded by ADR-0027（2026-07-29；历史 CLI 仍按其任务书保持 ASCII 输出）
- 背景：Win7 cmd 默认 CP936 且不支持 VT 序列；直接 print 非 ASCII（乃至 GBK 无法表示的字符）会乱码或抛 `UnicodeEncodeError`（WIN7_CONSTRAINTS P04）。
- 决策：所有直连控制台的输出仅使用 ASCII 字符集（含检查项 ID、状态、文件路径提示中的转义形式）；任何含非 ASCII 的内容仅写入 UTF-8 文件。路径含中文时控制台以 `ascii` 转义（backslashreplace）显示。
- 后果：控制台可读性下降（可接受）；杜绝一类最常见的 Win7 运行时崩溃。

## ADR-0007 Git 是可选能力：只探测、不依赖

- 状态：Superseded by ADR-0027（2026-07-29；Phase 1 Probe 的 Git 探测语义不变）
- 背景：AGENTS.md C13 规定不得假设开发工具存在；但需求要求探测 Git。
- 决策：Git 探测项使用 `shutil.which("git")` 定位 + `git --version` 子进程验证；未找到时状态为 `degraded`（能力缺失）而非 `fail`。未来阶段所有 Git 相关功能以此探测结果为开关。
- 后果：无 Git 环境下 Agent 仍完整可用（丧失版本控制集成）。

## ADR-0008 TLS 探测为纯离线探测，不发起任何网络连接

- 状态：Superseded by ADR-0016（2026-07-26；离线方向获负责人批准，范围定义由 ADR-0016 细化取代）
- 背景：需求要求探测 TLS/SSL 能力与 CA 证书信息，但 C12（离线交付）与 SECURITY.md §3.1（Probe 零网络）禁止联网。
- 决策：TLS 探测仅包含：`ssl.OPENSSL_VERSION`、支持的协议常量（TLS 1.2/1.3）、`SSLContext` 创建与默认证书加载（`load_default_certs`）后 `cert_store_stats()` 统计、`ssl.get_default_verify_paths()`。不建立任何 socket 连接。
- 后果：无法验证"真实握手成功"；真实连通性验证推迟到阶段 5（在用户明确配置服务器后进行）。

## ADR-0009 Probe 交付形态为 Python 包目录，入口 `python -m capability_probe`

- 状态：Superseded by ADR-0013（2026-07-26；包目录形态保留，包名与入口改变）
- 背景：候选形态有单文件脚本与包目录。单文件难以按模块测试；包目录复制即用，符合离线交付。
- 决策：`src/capability_probe/` 包 + `__main__.py` 入口；运行方式 `python -m capability_probe [选项]`（需将 `src` 加入 `PYTHONPATH` 或在 `src` 目录下运行，交付包提供 `run_probe.cmd` 一行启动脚本，脚本内不使用任何 cmd 高级特性）。
- 后果：模块可独立单测；多一个启动脚本文件（3 行以内，属交付物而非业务代码）。

## ADR-0010 退出码约定：0=全部通过，1=存在降级，2=存在失败，3=Probe 内部错误

- 状态：Accepted（2026-07-26）
- 背景：后续阶段与运维脚本需要不解析 JSON 即可判断环境是否可用。
- 决策：退出码固定四值；`error` 状态的检查项按 `fail` 参与汇总；`skipped` 不影响退出码。JSON 报告中 `summary.exit_code` 字段与真实退出码一致。
- 后果：调用方可用 `if errorlevel` 简单分支；语义冻结后不可复用这些码位。

## ADR-0011 实现代码采用任务授权机制（Status + 允许路径白名单）

- 状态：Accepted（2026-07-26，项目负责人裁决）
- 背景：原 C14 为一揽子禁令，阶段 1 进入实现需要解禁；曾提议"临时豁免某个目录"（原 PHASE_01 Q3），被负责人否决——豁免机制无审计边界、易扩散。
- 决策：C14 改为任务授权机制：默认禁止编写实现代码；仅当当前任务文档标注 `Status: APPROVED_FOR_IMPLEMENTATION` 时方可实现；任务文档必须明确列出允许修改的路径清单；Agent 不得修改允许路径以外的实现文件；禁止以"临时豁免某个目录"等任何方式绕过本机制。文档与 ADR 文件仍按 AGENTS.md 文档规则修改，不占用允许路径配额。
- 后果：实现授权可逐任务追溯（状态行 + 路径白名单都在版本控制内）；每个新阶段开工前必须先修订其任务文档。

## ADR-0012 路线阶段编号冻结：Model Gateway 固定为阶段 3

- 状态：Accepted（2026-07-26，项目负责人裁决）
- 背景：初版 ROADMAP 将远程通信（Model Gateway）排在阶段 5，多份文档曾以"阶段 5"指代真实 TLS 握手验证时点，与负责人冻结的路线不一致。
- 决策：阶段编号冻结为：0 基线、1 Capability Probe、2 命令执行 Runner、**3 Model Gateway（远程模型通信，真实 TLS 握手在此验证，D-006 CA bundle 在此评审）**、4 文件系统层（文件工具，含未知文件自动编码识别）、5 状态与审计存储、6 Agent Loop、7 打包交付。全部文档必须使用同一编号。
- 后果：ROADMAP 为编号权威；任何文档再出现旧编号即属缺陷，须按本 ADR 修正。

## ADR-0013 Probe 包布局为 `src/win7_agent/probe/`，入口 `python -m win7_agent.probe`（取代 ADR-0009）

- 状态：Accepted（2026-07-26）
- 背景：ADR-0009 的 `src/capability_probe/` 是孤立顶层包；后续阶段（runner/gateway/fs/state/agent）需要统一命名空间，且授权路径白名单（ADR-0011）要求实现路径边界清晰。
- 决策：Probe 位于 `src/win7_agent/probe/`，入口 `python -m win7_agent.probe`；测试位于 `tests/unit/probe/`、`tests/integration/probe/`、`tests/win7/`；启动脚本为 `scripts/run_probe.bat`、测试脚本 `scripts/run_tests.bat`（各 ≤5 行，不使用 cmd 高级特性）。包目录形态、复制即用的离线交付原则沿袭 ADR-0009。
- 后果：全项目单一命名空间 `win7_agent`；ADR-0009 中的 `run_probe.cmd` 更名为 `scripts/run_probe.bat`。

## ADR-0014 JSON 是 Probe 唯一权威输出；SQLite 仅为被探测能力的证据文件（取代 ADR-0003）

- 状态：Accepted（2026-07-26，项目负责人批准 JSON 唯一权威方向并细化）
- 背景：ADR-0003 已确立 JSON 权威，但仍把 SQLite 库定位为"报告副本"，并要求写库后回填状态、重写一次 JSON——双写增加了不一致面。
- 决策：JSON 报告是唯一权威输出，**单次原子写出，不做回填重写**。SQLite 建库检查项（`report.sqlite`）的目的只是验证"真实建库+写入能力"，其产物是**证据文件**而非报告副本：库中仅写入执行到该项为止的先行 17 项快照，`report.sqlite` 自身结果只存在于 JSON。任何消费方不得依赖 SQLite 文件内容。
- 后果：消除双写一致性维护；SQLite 文件语义降级后，T19"双写一致性"类验收改为"证据文件可读且行数正确"。

## ADR-0015 Windows 版本与 SP 采用三个只读来源交叉探测，无法确认 Win7 SP1 判 FAIL

- 状态：Superseded by ADR-0022（2026-07-27；三源只读探测、D-008 授权、原始值全部保留等原则继续有效并由 ADR-0022 重述；判定顺序与 host 字段来源语义由 ADR-0022 取代）
- 背景：`platform.win32_ver()` 在部分精简版/本地化 Win7 上返回空 SP 字符串（原 PHASE_01 Q4），单一来源不可靠；SP1 是兼容性硬要求（无 SP1 缺少 3.8.10 所需系统更新）。
- 决策：`os.version` 检查使用三个只读来源：① `sys.getwindowsversion()`；② `platform.win32_ver()`；③ `winreg` 只读 `HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion` 的 `ProductName`/`CurrentVersion`/`CurrentBuildNumber`/`CSDVersion`（依赖 D-008，仅限只读）。规则：任一来源失败不终止 Probe，记录该来源不可用；各来源原始值全部保留进报告；来源间冲突输出 WARN（状态 degraded，错误码 `OS_SOURCE_CONFLICT`）；判定为 Windows 7 但无法确认 SP1 时**不得伪装通过**，按兼容性硬要求判 `fail`，错误码 `SP_UNCONFIRMED`，message 说明"无法确认 SP1"。
- 后果：引入 winreg（D-008 批准，只读单键）；版本判定可审计（原始值俱在）；精简版 Win7 上可能出现"实际有 SP1 但三源都无法证实"的保守 FAIL，属设计内取舍。

## ADR-0016 阶段 1 TLS 检查定名 Python TLS Runtime Capability，纯离线、八项探测、五项禁令（取代 ADR-0008）

- 状态：Accepted（2026-07-26，项目负责人批准）
- 背景：ADR-0008 确立离线方向获批准，但名称（`net.tls`）与描述会让人误以为覆盖 Windows SChannel/系统级 TLS；负责人裁决阶段 1 只检查 Python TLS Runtime，不宣称完整检查 SChannel。
- 决策：检查项更名 `tls.python_runtime`（Python TLS Runtime Capability），离线探测内容固定为八项：① `ssl` 模块可导入；② `ssl.OPENSSL_VERSION`；③ 可否创建默认客户端 `SSLContext`（`ssl.create_default_context()`）；④ `ssl.get_default_verify_paths()`；⑤ `ssl.HAS_SNI`；⑥ `ssl.HAS_ALPN`；⑦ TLS 相关常量可用性（`HAS_TLSv1_2`/`HAS_TLSv1_3`/`PROTOCOL_TLS_CLIENT`）；⑧ Windows 下 `ssl.enum_certificates("ROOT")` 是否可调用及返回证书数量。五项禁令：不访问公网、不连接真实模型服务、不验证企业代理、不进行 SChannel 网络握手、不输出证书完整内容（只记数量与探测事实）。真实 TLS 握手验证安排在阶段 3（Model Gateway，ADR-0012）。
- 后果：探测结论的适用边界诚实（只代表 Python 运行时）；`enum_certificates` 为 Windows 专有 API，非 Windows 环境该子项记 skipped。

## ADR-0017 阶段门控状态 REPAIR_REQUIRED_BEFORE_E1 与实现路径白名单遗漏修正

- 状态：Accepted（2026-07-27，架构师审查修复轮裁决）
- 背景：阶段 1 首轮实现的代码审查发现多处设计级缺陷（ADR-0018~0022），需要一个既不撤销实现授权（否则无法修复）、又能阻止带缺陷交付进入 E1 验收的状态机制；同时 PC-001 确认 §0.2 白名单遗漏了 §4.1 自身要求的 `src/win7_agent/__init__.py`，属任务书内部矛盾。
- 决策：（1）任务文档状态块在 `Status` 行之外新增 `Phase-Gate` 行；`Phase-Gate: REPAIR_REQUIRED_BEFORE_E1` 表示实现授权（C14/ADR-0011）继续有效，但 E1/E2 验收与阶段完成标记被封禁，直到任务书 §0.3 修复项全部关闭并由架构师解除。（2）白名单补入 `src/win7_agent/__init__.py`，内容限定为单行 `__version__ = "0.1.0"`；这是对既有 §4.1 设计的遗漏修正，不是新增架构能力，不构成“临时豁免”先例。（3）白名单同步补入 `.gitattributes`，仅限固定 `*.bat` CRLF 属性。
- 后果：修复轮可在原授权下进行；验收门槛可审计（Phase-Gate 行在版本控制内）；PC-001 关闭。

## ADR-0018 错误码扩展：SUBPROC_BEHAVIOR_MISMATCH 与 PROCESS_TREE_TERMINATION_FAILED，proc.kill 状态裁决收紧

- 状态：Accepted（2026-07-27，架构师裁决；属外部报告接口变更）
- 背景：审查发现 `proc.exec`/`proc.capture`/`proc.truncate` 的行为断言失败被错误归入 `FS_OP_FAILED`（语义错误，消费方无法区分文件系统故障与子进程行为异常）；`proc.kill` 在工具齐备但树终止失败时误记 degraded，掩盖了 Agent 必需能力的真实失败。
- 决策：错误码枚举（PHASE_01 §5.2，report_version 保持 1，属枚举扩展而非结构变更）新增：`SUBPROC_BEHAVIOR_MISMATCH`（子进程正常启动但输出/退出码/行为不符预期）与 `PROCESS_TREE_TERMINATION_FAILED`（taskkill/cmd 均存在但无法确认父与孙全部终止）。裁决：① `taskkill` 或 `cmd` 缺失（含验证工具 `tasklist` 缺失，同属工具缺失类，与 D-007 降级路径一致）→ `proc.kill = degraded` + `CAPABILITY_LIMITED`；② 工具齐备但启动失败、父进程未消失、孙进程未消失、PID 无法获得或树终止失败 → `proc.kill = fail`；③ `proc.exec`/`proc.capture`/`proc.truncate` 行为断言失败一律用 `SUBPROC_BEHAVIOR_MISMATCH`，`FS_OP_FAILED` 收缩为仅限真实文件系统操作失败。
- 后果：报告消费方获得可区分的失败语义；`proc.kill` 在真实 Win7 上的树终止失败将正确阻断 `agent_runnable`；存量测试断言需同步更新。

## ADR-0019 proc.kill 采用 workdir 辅助文件 + readiness 协议，废除嵌套命令行与固定延时终止

- 状态：Accepted（2026-07-27，架构师裁决）
- 背景：首轮实现用 `list2cmdline` 嵌套 `python -c` 拼接命令行（违反 WIN7_CONSTRAINTS §5.6 精神，引号转义脆弱），并以固定 0.5 秒后终止——慢机器上孙进程可能尚未启动，导致结果随机；`tasklist` 验证用子串包含判断，存在 PID 前缀误匹配。
- 决策：协议固定为（完整规格见 PHASE_01 §4.4 备注 (c)）：在 `ctx.workdir` 生成 `parent.py`/`child.py`/ASCII `run_tree.cmd`；解释器路径经仅对子进程生效的环境变量 `CAP_PROBE_PYTHON` 传入；`parent.py` 启动 `child.py`，将父/孙 PID 写入 PID 文件（临时名 + `os.replace` 原子可见）后以 `O_CREAT|O_EXCL` 原子创建 ready 文件；Probe 带独立准备超时轮询 ready，ready 后才对 `cmd.exe` 执行 `taskkill /T /F`；验证用 `tasklist /FO CSV /NH` 经标准库 `csv` 解析后对 PID 列精确相等比较；`parent_gone`/`child_gone`/`tree_kill` 始终为 bool，禁止 `null` 表达最终结论；全部辅助文件只能位于 `ctx.workdir`。`proc.kill` 注册超时重算为 45 秒，内部预算总和 40 秒（readiness 10 + taskkill 5 + 验证 10 + 回收 5 + 余量）。
- 后果：终止时机由事件驱动（ready）而非猜测延时，慢机器上确定性提升；新增三个辅助文件随 workdir 统一清理，不改变 G5 无残留目标。

## ADR-0020 subproc 统一 monotonic 时间预算与 Probe 私有活动进程登记机制

- 状态：Accepted（2026-07-27，架构师裁决）
- 背景：首轮实现中 `run_capture` 的启动等待、taskkill、`Popen.wait`、两个 reader join 各自重新获得完整 timeout，最坏情况总耗时可达标称超时的数倍，可能穿透检查级超时；检查级超时后检查线程与其子进程被静默遗弃。
- 决策：（1）`run_capture` 使用单一 `time.monotonic()` deadline，所有内部等待共享同一预算，地板值 0.5 秒仅保障清理动作执行，总耗时上界 = timeout + 3×地板值；检查内部预算必须 ≤ 注册超时 − 5 秒。（2）`subproc` 维护线程安全的活动进程登记表：`Popen` 成功后登记，彻底回收后移除；检查级超时时调度层先终止全部活动进程（串行执行保证归属无歧义），再对检查线程做 5 秒×scale 宽限 join；仍未退出则在 `probe.notes` 记录 `CHECK_THREAD_LEAKED: <check_id>`，禁止静默遗弃。（3）已知限制：纯 Python 无法强制终止线程；风险控制边界为“先杀子进程 + daemon 线程 + 短命进程 + 报告留痕”（PHASE_01 §4.3.1）。（4）该登记表是 Probe 私有能力，不是阶段 2 通用 Runner 的接口承诺。
- 后果：检查耗时上界可证明；不再有孤儿子进程；代价是 `proc.kill` 等检查的预算分配需逐项显式设计。

## ADR-0021 report.sqlite 纳入统一隔离调度；报告组装与写出的可靠性兜底

- 状态：Accepted（2026-07-27，架构师裁决）
- 背景：首轮实现中 `report.sqlite` 在调度器外内联执行（无超时、`duration_ms` 恒为 0、序列化异常可穿透至顶层）；`CREATE TABLE IF NOT EXISTS` + `DELETE` 会静默复用未知旧 Schema；`host` 字段绕过三源裁决从单一来源重新推断；`getpass.getuser()` 无兜底；`--help` 被误归为退出码 3。
- 决策：（1）`report.sqlite` 与其他 17 项同经调度层隔离（15 秒检查级超时、真实 `duration_ms`、异常转结构化结果）；`sqlite3.connect(timeout=5.0)`；已存在库文件一律先删除重建（禁止静默复用旧 Schema）；写入失败后尽力关闭连接并删除本次新建的半成品；任何失败不阻断 JSON。（2）新增 `safe_getuser()`，任何异常返回 `"unknown"`。（3）`host.os_*` 逐字段取自 `os.version` 的 `details.verdict`（ADR-0022），禁止单源重推。（4）报告组装、序列化、原子写出统一顶层兜底：异常 → stderr ASCII 一行 + 退出码 3，不留半截 JSON。（5）`--help`/`-h` 退出码 0，参数错误/报告无法写出为 3。（6）执行顺序修正为：全部检查 → 清理 workdir → 组装含 cleanup 状态的报告 → 单次原子写 JSON。
- 后果：JSON 报告在任意单点异常下仍可产出或以退出码 3 干净失败；证据库语义不变（ADR-0014）；旧证据库文件会被覆盖，消费方本就不得依赖其内容。

## ADR-0022 OS 版本裁决顺序与 host 字段来源；文件系统断言精确化（取代 ADR-0015）

- 状态：Accepted（2026-07-27，架构师裁决）
- 背景：ADR-0015 未规定冲突判定与非目标系统判定的优先级，首轮实现在三源均非 6.1 但互不一致时（如 10.0/10.0/6.3）误报 `OS_SOURCE_CONFLICT`；`host` 字段绕过裁决从单一来源重推；另有 `fs.*` 断言精度缺陷（errno 36 硬编码、编码断言无字节级验证）。
- 决策：（1）保留 ADR-0015 的三源只读探测、D-008 授权、任一源失败不终止、原始值全部保留、不得伪装通过等全部原则。（2）裁决顺序重定为严格四步（命中即止）：① 所有可用来源均未给出 6.1（含零可用源）→ `NON_TARGET_OS`/degraded；② 至少一源 6.1 且另有源给出不同版本 → `OS_SOURCE_CONFLICT`/degraded；③ 一致 6.1 但 SP1 无法确认 → `SP_UNCONFIRMED`/fail；④ 一致 6.1 且 SP1 确认 → 通过。（3）`details` 新增 `verdict` 裁决结果对象，`host.os_build`/`os_service_pack`/`os_caption`/`os_arch` 必须取自 verdict（来源优先级 getwindowsversion → registry → win32_ver）。（4）`PATH_TOO_LONG` 同时识别 `errno.ENAMETOOLONG`（常量，非硬编码）与 `winerror 206`；`fs.encodings` 增加字节级断言（utf-8-sig/utf-16 真实 BOM、utf-16-le 无 BOM、GBK 关键字节 `D6 D0`）；仍不实现未知编码自动识别（阶段 4）。
- 后果：E3 环境（Win10/11 或非 Windows）稳定得到 `NON_TARGET_OS` 而非误报冲突；host 字段与检查结论不可能分叉；字节级断言使“假往返成功”（如编码实现退化为 UTF-8）可被检出。

## ADR-0023 建立独立架构原型线 prototype/full-agent-skeleton（Task Type: ARCHITECTURE_PROTOTYPE）

- 状态：Accepted（2026-07-27，项目负责人裁决）
- 背景：Phase 1 Capability Probe 仍在正式质量主线上修复与验收；负责人决定额外建立一条独立原型线，快速验证完整 Coding Agent 架构（Runtime 状态机、模型抽象、只读工具、权限引擎、工作区隔离、事件持久化、验证引擎、CLI）能否在 MockProvider 下纵向贯通。C14/ADR-0011 的任务授权机制原本仅覆盖正式阶段任务书，需要为原型线提供同等可审计的授权载体，而不是绕过授权机制。
- 决策：（1）新增任务类型 `ARCHITECTURE_PROTOTYPE`，授权载体为 `docs/tasks/PROTOTYPE_FULL_AGENT_SKELETON.md`（Status: APPROVED_FOR_IMPLEMENTATION），其 §8 路径白名单与 §9 禁止路径清单具有与正式任务书同等的 C14 效力，但**仅在 `prototype/full-agent-skeleton` 分支上生效**。（2）原型线与 Phase 1 相互独立：不替代 Phase 1、不改变 Phase 1 的状态与验收标准、禁止触碰 `src/win7_agent/probe/**`、probe 测试、PHASE_01 任务书、已冻结 ADR、Probe JSON Schema 与退出码；发现 Phase 1 接口问题只能记入 `docs/prototype/INTERFACE_RISKS.md`。（3）禁止将原型分支整体合并 main；正式阶段（Phase 2~6）只能经各自任务书授权后选择性吸收原型设计或代码。（4）原型专属 Phase-Gate：`APPROVED_FOR_IMPLEMENTATION → IMPLEMENTING → READY_FOR_PROTOTYPE_REVIEW → PROTOTYPE_ACCEPTED | PROTOTYPE_REJECTED`；`PROTOTYPE_ACCEPTED` 不构成任何正式阶段通过，不解除 Win7 E1/E2 实机验收硬门槛。（5）原型运行时权限边界冻结：目标工作区只读、仅六个只读工具、PolicyEngine 对非 READ_ONLY 显式 DENY、禁网络、禁真实模型、EventStore 只写用户显式指定路径或系统临时目录。（6）AGENTS.md §3 据本 ADR 登记原型线（该节原“不实现 Agent Loop、不接入大模型”表述仅约束正式阶段主线，不适用于本原型分支；原型仍禁止接入真实模型与修改用户代码）。
- 后果：架构风险（模块边界、状态控制、权限模型、事件溯源、Replay 测试）可在进入正式 Phase 2~6 前低成本暴露；代价是维护一条不进 main 的长期参考分支，且原型结论仍需 Win7 实机复验。授权范围按分支隔离，主线 C14 语义不受影响。

## ADR-0025 阶段 2 重定义为正式只读代码分析 Agent；原型冻结契约收编主线；ADR-0024 编号保留

- 状态：Accepted（2026-07-27，架构师裁决，项目负责人授权创建 Phase 2 任务书与授权链）
- 背景：原型线（ADR-0023）已完成审查轮 1、残余修复与正式 CPython 3.8.10 验证：实现冻结提交 `9b6461d0fd3380babcc56a842571eb4b4dc77660`（标签 `prototype-r1-py38-verified`），Gate 提交 `d1d38fd2ba22dae4ef1feb486fc66d857cdd2caf`，验证记录提交 `714ec90`；macOS CPython 3.8.10 下 compileall PASS、104/104 测试通过、CLI COMPLETED、`trace_complete=true`、退出码 0；Win7 验证状态 `BLOCKED_ENVIRONMENT` / `NOT_PERFORMED`。原 ROADMAP 阶段 2 定义为"子进程 Runner"，与经原型验证后的最优正式化路径（先建立只读分析闭环）不再匹配；ROADMAP 明确阶段顺序调整须记 ADR。另外，ADR-0024（退出码 / Replay 一致性 / Policy DENY 语义裁决）仅在 `prototype/full-agent-skeleton` 分支的 DECISIONS.md 中 Accepted，main 上不存在该编号。
- 决策：（1）**阶段 2 重定义**为"正式只读代码分析 Agent"，任务书 `docs/tasks/PHASE_02_READONLY_CODE_ANALYSIS.md`（Task Type: FORMAL_PHASE，Status: APPROVED_FOR_IMPLEMENTATION），实现仅在 `phase/02-readonly-agent` 分支、仅该任务书 §8 白名单路径内进行（C14）。原"子进程 Runner"独立阶段撤销：阶段 2 仅实现固定只读 Git 命令（`git status --porcelain` / `git diff --no-color`）的私有受限子进程模块（超时 + 输出上限 + taskkill 进程树终止 + 降级记录）；**通用命令执行 Runner 延后**至首个需要任意命令执行的阶段（阶段 6 Agent Loop 之前）另行任务书授权。阶段 3 Model Gateway 编号维持不变（ADR-0012 继续有效）。（2）**原型冻结契约收编主线**：原型分支 ADR-0024 的三项裁决（CLI 退出码 0/1/2/3、Replay 请求指纹一致性模型与 mode=ro 只读打开、Policy DENY 语义与 `tool.denied`/`state.transition_rejected` 事件）以及原型任务书 §19 三项精确定义（EventStore 生命周期三阶段故障矩阵与 `trace_complete`、`ToolResult.executed` 语义矩阵、动态测试发现与最低门槛机制）收编为主线正式契约，规范文本以 PHASE_02 任务书 §3 为准；阶段 2 相对原型新增错误码 `PATH_TOO_LONG`（WIN7_CONSTRAINTS P08 / ADR-0022 识别形态）。（3）**编号保留**：ADR-0024 编号视为已被原型分支占用，main 永久跳过该编号不再另用；主线引用其结论一律以本 ADR 与 PHASE_02 任务书 §3 为载体。（4）**原型吸收纪律**：禁止整体 merge `prototype/full-agent-skeleton`、禁止 cherry-pick 原型提交；只能按 PHASE_02 任务书 §5 迁移矩阵（ADOPT_WITH_CHANGES / REIMPLEMENT / DEFER / REJECT 逐项裁决）人工选择性移植，移植提交须注明来源提交与矩阵条目，并在 Phase 2 分支重新通过测试与架构师复审。（5）AGENTS.md §3 与 ROADMAP 阶段 2 条目据本 ADR 同步登记；`docs/ARCHITECTURE.md` §2/§5 的分层与目录规划与阶段 2 包结构的同步修订由架构师在阶段 2 复审前完成，属文档同步不属新决策。（6）阶段 2 完成硬门槛不变：Win7 SP1 x64 实机验收前 Phase-Gate 至多到 `READY_FOR_WIN7_VALIDATION`，Win7 状态必须保持 `Win7-Compatibility: PROVISIONAL` / `Win7-Validation: NOT_PERFORMED` / `Blocking-Reason: Target environment unavailable`，不得宣称 Win7 已通过。
- 后果：正式线获得一条已被原型验证过的最短闭环路径（只读分析），避免先建通用 Runner 带来的过度设计；代价是阶段编号语义变化（"阶段 2 = Runner"的旧引用以本 ADR 为准失效），且原型代码不能批量复用，须逐项移植与重测。ADR-0024 编号在 main 上留白是双分支决策历史的代价，由本 ADR 的编号保留条款消除歧义。Win7 证据缺口被显式携带在任务书状态块与验证记录格式中，防止验收口径漂移。

## ADR-0026 Replay setup errors and runtime mismatches（Replay 装载错误与运行期不匹配的边界冻结）

- 状态：Accepted（2026-07-27，架构师裁决，Phase 2 审查轮 1）
- 背景：Phase 2 审查轮 1（审查基线 `3fb620d5e2c73dd4dae5daf051ed38153dfaf257`，审查 HEAD `f266d183be8f5cb5e0c2a791de480a10af8ba457`）发现 PHASE_02 任务书 §3.9 对 "Schema、Run 或录制序列错误 → 退出码 3" 的表述与 "响应多余/耗尽 → `REPLAY_MISMATCH` → 退出码 1" 之间存在分类边界歧义：实现可能在初始化阶段将录制数量差异一律判为 setup 错误（退出码 3），或将装载失败误归为运行期不匹配（退出码 1），导致 F32–F35 测试口径无法唯一裁决（审查发现 R-03、R-04）。
- 决策：（1）**Setup / Provider 装载错误（退出码 3，`ProviderError`，Run 不建立、无 RESULT 行）**冻结为以下六类：replay CLI 必填参数缺失；数据库不存在或无法打开；SQLite/schema 不合法；没有可选择 Run；录制载荷损坏或无法反序列化；录制格式版本不受支持。（2）**Runtime replay mismatch（Run FAILED，错误码 `REPLAY_MISMATCH`，退出码 1）**冻结为以下五类：当前模型请求没有对应响应；响应耗尽；请求指纹不匹配；当前执行结束后仍存在多余响应；可加载录制与当前运行请求序列不一致。（3）**划分原则**：可加载但不匹配当前执行 → `REPLAY_MISMATCH`/退出码 1；无法建立合法 ReplayProvider → setup 错误/退出码 3。（4）多余响应必须在运行结束前通过**消费完整性检查**判定（Run 正常结束前验证录制响应已全部消费）；不得在初始化阶段把所有数量差异一律归为 setup 错误。（5）PHASE_02 任务书 §3.9 据本 ADR 同步修订；`model.response` 事件记录完整 vendor-neutral ModelResponse（content、tool_calls、finish_reason 及正式允许 metadata）属修复既有 Replay 契约的实现缺陷（schema_version 仍为 1，不新增事件类型），不需另建 ADR；超过 EventStore 载荷预算时不得静默截断后仍声明可重放，必须产生结构化不可重放结果或失败。
- 后果：F32–F35、F37 的测试口径获得唯一裁决依据，修复窗口（PHASE_02 §10.6 RP2/RP3）可无歧义实施；代价是 setup/运行期两张冻结清单未来新增情形时必须修订本 ADR 或另补 ADR，不得在实现中自行归类。本 ADR 不修改任何已 Accepted ADR 正文。

## ADR-0027 唯一固定客户端平台为 Windows 7；运行时、依赖与产品形态改用兼容性 Profile

- 状态：Accepted（2026-07-29，项目负责人明确裁决）
- 背景：项目此前把“Windows 7 SP1 x64、CPython 3.8.10、仅标准库、完全离线、禁止 Node.js/Electron、最终仅 CLI”绑定为同一组全局红线。项目负责人进一步澄清：唯一固定条件只有 Windows 7；Node 12、Electron、原生辅助程序、第三方依赖、GUI、后台进程和内网服务，只要能够在 Win7 上运行并经过验证，均可作为候选方案。旧约束把特定实现路线误写成了操作系统本身的限制，阻断了 Codex-like 桌面客户端、交互终端、Worktree、插件和并行任务等可行能力。
- 决策：（1）全项目唯一不可替换的客户端平台约束为 **Windows 7 SP1 x64（build 7601）**；每个交付组件必须声明并锁定自己的运行时 Profile、架构、补丁前置、依赖清单和 Win7 实机证据，但不再全局固定编程语言或标准库。（2）Python、Node.js、Electron、.NET Framework、Win32 原生程序及第三方库均允许使用；Node.js/Electron 不再是禁止项。构建机可使用受支持的现代系统，目标机只需运行已打包并通过 Win7 验收的产物。（3）GUI、CLI、App Server、后台调度、交互终端、Git/Worktree、多 Agent、Skills、Hooks、MCP 和插件框架均属于允许设计范围；本 ADR 只解除全局禁令，不构成任何实现授权，具体代码仍须遵守 C14/ADR-0011 和对应任务书路径白名单。（4）Win7 不具备的 WSL2、ConPTY、Windows Sandbox、现代 AppContainer、MSIX/WinUI 3 等能力不得被伪装为可用；必须使用 winpty、Restricted Token、ACL、Job Object、内网 VM/容器或其他经验证的降级方案。（5）交付模式不再强制“完全断网”；离线包、企业内网安装或受控更新均可由任务书选择。任何运行时下载或更新必须有版本锁定、完整性验证、失败回滚和明确授权，默认仍优先自包含交付。（6）ASCII-only 不再约束 GUI、结构化协议和 UTF-8 日志；只有直连 Win7 `cmd.exe`/conhost 的历史 CLI 或兼容适配器需要按其运行时 Profile 处理 CP936、非 ASCII 和 VT 降级。（7）SQLite 仍是首选本地状态引擎，但绑定方式由组件 Profile 决定，不再限定 Python 标准库 `sqlite3`。未来 Runner 优先使用 Win32 Job Object/受限令牌等原生能力；`taskkill` 保留为兼容降级。Git 可作为随包交付的正式能力，不再只能“探测但不依赖”。（8）ADR-0001、ADR-0002、ADR-0005、ADR-0006、ADR-0007 的项目级未来约束由本 ADR 取代；它们已经进入 Phase 1/2 的行为、Schema、测试、验收记录和冻结任务合同不作追溯修改。（9）`docs/tasks/PHASE_01_CAPABILITY_PROBE.md`、`docs/tasks/PHASE_02_READONLY_CODE_ANALYSIS.md` 与原型任务书继续作为各自分支/阶段的历史合同；本 ADR 不允许在这些白名单中混入 Node/Electron 客户端实现。新的客户端或运行时 Spike 必须另建任务书和授权路径。（10）`docs/WIN7_CONSTRAINTS.md` 改为运行时兼容矩阵；依赖准入必须记录 Win7 可用性、精确版本、构建/运行边界、EOL 风险、安装前置、降级路径和实机验收项。
- 后果：项目可以构建接近 Codex 的 Win7 桌面客户端并使用适合 Win7 的旧版运行时，不再被 Python-only 或 CLI-only 人为限制；历史 Phase 1/2 证据仍可复现。代价是需要同时治理多种 EOL 运行时与原生二进制，建立精确版本锁、SBOM/许可证清单、签名校验、企业网络边界和 Win7 实机回归。Electron 22、Node 12、固定 Git 等候选均已停止常规维护，不能作为处理不可信远程内容的安全边界；开放互联网浏览和高风险执行应优先卸载到受维护的内网服务。

## ADR-0028 技术栈统一：Electron 22.3.27 单栈承载 Shell 与 Core；降级阶梯冻结

- 状态：Accepted（2026-07-29，项目负责人裁决通过，见 PENDING_CONFIRMATIONS PC-003；Win7 可交付结论仍以对应 Spike/阶段的 Win7 SP1 x64 实机验证为准，未通过前不得表述为"已满足 Win7"）
- 背景：ADR-0027 解除全局运行时禁令后，Codex-like 客户端存在多条可行路线（Electron、WPF、Win32 原生、本地服务+浏览器、纯 CLI）。多栈并行会成倍放大 EOL 运行时治理、SBOM 与 Win7 实机验收成本；"本地服务 + 系统浏览器"在 Win7 上意味着 IE11，完全不达标；随包便携 Chromium 同为 EOL 内核却失去 Electron 的 contextIsolation/IPC/Session 治理基线（SECURITY.md §4 与 W7C 验收项均按 Electron 设计）。另经核实：Electron 22.3.27 内嵌 Node 16.17.1（D-009），Agent Core 可作为独立 **utilityProcess** 在同一运行时闭包内承载（Electron 22 已支持 `utilityProcess`，其 stdin 默认关闭，适合 Core 隔离），无需额外交付独立 Node 12（D-010 降级为可选 CLI 宿主备选）。**不采用 `ELECTRON_RUN_AS_NODE`**：Electron 官方安全指南建议关闭 `runAsNode` fuse、改用 utility process 承载 Node 逻辑，避免绕过沙箱与 fuse 的攻击面。本 ADR 为 Electron 首选实施 Profile 的裁决，其"可交付 Win7"结论以 SPIKE_01 实机为准，未通过前不得表述为"已满足 Win7"。
- 决策：（1）v1 客户端统一为 **Electron 22.3.27 x64 单栈**，进程边界固定为三层：**Electron main** 只负责窗口、生命周期与进程编排（不承载 Agent 逻辑）；**Agent Core = 独立 `utilityProcess`**，运行时为内嵌 Node 16.17.1，`runAsNode` fuse 关闭、不使用 `ELECTRON_RUN_AS_NODE`；**Desktop Shell = Renderer（最小权限，C17）**——即使关闭 Node，Renderer 仍有浏览器网络/导航/Chromium 攻击面，须持续执行 CSP、Session 网络白名单、禁导航、新窗口限制与 IPC Schema 校验，不加载不可信内容。（2）**唯一自研原生组件**为一个 **C++ x64 helper**（Job Object / Restricted Token / winpty 宿主，D-013），接口冻结为 argv + JSON over stdio，不加载插件、不监听网络；须澄清这并非"唯一原生工件"——`winpty`/`node-pty`（D-011）、SQLite Node 绑定（D-014）、MinGit（D-012）均含原生工件，全部按 WIN7_CONSTRAINTS §6/§6.1 登记（精确版本、SHA-256、Electron ABI、SQLite/FTS5 编译选项、VC Runtime 或 `/MT` 策略、ASAR 解包方式、Win7 加载验证）。（3）**降级阶梯**冻结为：Electron 22.3.27 →（SPIKE_01 No-Go）.NET Framework 4.8 WPF（D-015）→ Win32 原生 → CLI + 本地 App Server → CLI-only 保底；每档切换仅由对应 Spike 的 Go/No-Go 判据触发并记补充 ADR。**关键约束**：Electron 整体失败时，内嵌 Node 16 与 utilityProcess 一并消失，因此 WPF/Win32/CLI 各档必须各自另配**独立 Core 宿主**（独立 Node、.NET 实现或 CLI Core），并在切换 ADR 中固定——否则该档不是可切换降级，而是一次 Core 重写，须如实标注。（4）**淘汰**"本地服务 + 系统浏览器"与"随包便携 Chromium"路线，理由如背景所述，不再复议。（5）本 ADR 不构成实现授权；Electron 可行性以 SPIKE_01（Win7 实机）为准。
- 后果：治理面收敛到单一 EOL 运行时闭包 + 一个自研原生组件（其余原生依赖单独登记）；main/Core/Renderer 三层边界与关闭 `runAsNode` 消除 RUN_AS_NODE 旁路；WPF 及以下各档的功能损失（终端保真、UI 能力）与其独立 Core 宿主要求已预先声明，避免 No-Go 时重新开设计争论或误把重写当降级。代价是对 Electron 22 实机表现（老显卡黑屏 P17、内存、出站控制）形成单点依赖，由 SPIKE_01 前置化解。

## ADR-0029 Phase 1/2 Python 资产冻结为 legacy；契约与测试矩阵作为 Node Core 规范来源继承

- 状态：Accepted（2026-07-29，项目负责人裁决通过，见 PENDING_CONFIRMATIONS PC-003；Win7 可交付结论仍以对应 Spike/阶段的 Win7 SP1 x64 实机验证为准，未通过前不得表述为"已满足 Win7"）
- 背景：Phase 2 Python 实现当前存在若干**实现层面**的性能瓶颈，不利于桌面客户端的持续会话模型：`src/win7_agent/storage/event_store.py:90-102` 每事件 `SELECT MAX` + fsync 落盘；`src/win7_agent/tools/readonly.py:166-201` 无索引全树扫描（最坏读整棵 2GiB 工作区）；`src/win7_agent/cli/__main__.py` 一次性进程模型（每任务冷启动、无连接池、无流式 HTTP）。须澄清：这些是当前设计/实现选择的问题（批量事务、索引、常驻进程与流式 IO 在 Python 内同样可优化），**并非 Python 语言本身结构性无法达标**。选择 Node 的真正理由是：与 Electron/Core 统一为单一运行时闭包、消除长期 Python+Node 双栈的治理与 SBOM 维护成本，而非"Python 不可能优化"。
- 决策：（1）Phase 1/2 Python 代码在各自 Win7 实机验收完成后**冻结为 legacy**：此后只修缺陷，不新增能力、不迁移到新运行时。（2）Phase 1 Probe 转型为**安装前检查器**随新客户端安装包交付（只读探测语义不变），转型属打包集成，不改 Probe 代码合同。（3）Phase 2 的 §3 契约（事件 schema、错误码、退出码、Replay 语义含 ADR-0026 冻结清单）与 §7 F 编号测试矩阵作为 Node Core 的**规范来源**：PHASE_06 任务书必须包含逐条对账清单（继承 / 有据变更 / 不适用三态，逐项注明理由），不允许隐式丢弃。（4）Phase 2 代码**不整体移植**：禁止自动转译或按文件复制到 Node 侧；只继承契约文本与测试口径。
- 后果：避免长期双栈维护成本，运行时与 Shell 统一；Phase 2 的验证投资以契约与测试矩阵形式保全。代价是 Node Core 需重新实现全部逻辑并重新通过等价测试矩阵，对账清单是防止语义漂移的唯一防线。

## ADR-0030 Approval Mode 三档冻结：read-only / workspace-write / 无 full-access 本地等价

- 状态：Accepted（2026-07-29，项目负责人裁决通过，见 PENDING_CONFIRMATIONS PC-003；Win7 可交付结论仍以对应 Spike/阶段的 Win7 SP1 x64 实机验证为准，未通过前不得表述为"已满足 Win7"）
- 背景：Codex 的 full-access 模式依赖强 OS 沙箱兜底；Win7 无 Windows Sandbox / 现代 AppContainer / WSL2，同用户 Restricted Token + Job Object 减权不构成等价安全边界（WIN7_CONSTRAINTS §7、ADR-0027 第 4 条）。伪装提供 full-access 会让用户误信不存在的隔离。
- 决策：（1）Approval Mode 冻结为三档：**read-only**（只读工具 + 白名单只读命令，无写入无网络）；**workspace-write**（写入限工作区 + Plan/Apply 审批，命令执行经 C++ helper：Restricted Token + Job Object + 工作区外 ACL 拒绝 + argv 白名单 + **尽力限制网络**）；**不提供 full-access 本地等价**——超出 workspace-write 边界的操作一律逐条显式审批执行，或路由到远程隔离环境（Gateway）。（2）helper 启动时以 `IsProcessInJob` 探测宿主 Job 占用（P11 Job 不可嵌套）；探测失败或已在不可嵌套 Job 内时 **fail-closed**：拒绝执行高风险命令并向 UI 报告降级原因，禁止用 `taskkill` 冒充 containment（C08/C18）。（3）三档语义与 UI 文案必须一致：不得把 workspace-write 描述为"沙箱"。（4）**网络边界澄清**：Job Object + Restricted Token + ACL 控制的是权限、文件与进程树，**不会自动阻断 Winsock 网络访问**；因此"尽力限制网络"是同用户减权下的 best-effort，**不构成安全边界，不得标注为硬隔离/禁网**。真正的强制断网须由企业防火墙 / WFP（Windows Filtering Platform）或远程隔离执行承担；鉴于目标为企业内网，v1 接受本地 best-effort 网络限制，但必须在 UI 与文档如实说明其非隔离性质，需要强制断网的场景一律走远程隔离。
- 后果：安全承诺与 Win7 实际能力对齐，消除虚假沙箱与"本地禁网即隔离"的预期；代价是部分 Codex 工作流（放任式全权执行）在 v1 本地不可用，须走审批或远程路径。containment 实际强度与本地网络实际可达性由 SPIKE_02 实测裁决。

## ADR-0031 交互终端：独立 winpty 宿主进程；模型输入与用户输入硬隔离

- 状态：Superseded by ADR-0067（2026-08-10；历史正文与 A5 原始证据保持不变）
- 背景：Win7 无 ConPTY，交互终端只能经 winpty 0.4.3（D-011）。pty 天然合并输入输出通道，若 Agent 可写终端 stdin，模型输出注入按键即成为权限旁路；终端回显含不可信数据（命令输出、仓库内容），VT/OSC 序列可攻击渲染端（C19）。
- 决策：（1）交互终端由**独立 winpty 宿主进程**承载（C++ helper 的终端模式），每会话唯一 pty，宿主不复用于 Agent Runner。（2）pty stdin **仅接受 Renderer 用户键盘输入事件通道**；Agent Core / 模型输出没有任何通往 pty stdin 的 IPC 路径（结构性缺失，而非策略过滤）。（3）Agent 的命令执行（Runner）一律无 pty、stdin 关闭、非交互。（4）终端输出按不可信数据处理：进入 Renderer 前过滤/白名单 VT 与 OSC 序列（尤其 OSC 52 剪贴板、标题注入、DECRQSS 应答类）；xterm.js 渲染层禁用回应答特性。（5）终端会话具备取消、背压、输出上限与强制终止（进程树回收经 Job Object）。
- 后果：终端保真度受 winpty 限制（全屏 TUI/Unicode/resize 由 SPIKE_02 实测，No-Go 时降级为非交互命令 + 流式日志视图）；换来模型注入按键攻击面的结构性消除。C19 负向用例（恶意 VT/OSC、模型尝试写 stdin 必须失败）为 SPIKE_02 硬门槛。

## ADR-0032 Git/Worktree Adapter：MinGit 隔离配置、命令白名单与攻击面封堵

- 状态：Accepted（2026-07-29，项目负责人裁决通过，见 PENDING_CONFIRMATIONS PC-003；Win7 可交付结论仍以对应 Spike/阶段的 Win7 SP1 x64 实机验证为准，未通过前不得表述为"已满足 Win7"）
- 背景：Git 升级为随包正式能力（ADR-0027 第 7 条，D-012 MinGit 2.46.2）。Git 存在大量可被恶意仓库触发任意进程执行的配置面（hooks、filter、textconv、pager、editor、credential helper、fsmonitor、remote helper），对 Coding Agent 是首要供应链攻击面（C20/G10）。
- 决策：（1）所有 Git 操作经**专用 Adapter**执行，禁止任何组件直接拼 git 命令。（2）Adapter 使用随包 MinGit 2.46.2，运行时强制：`GIT_CONFIG_NOSYSTEM=1`、`HOME`/`XDG_CONFIG_HOME` 指向受控空目录、净化环境变量、`-c` 显式注入全部所需配置。（3）**命令白名单**：读类（`status`、`diff`、`log`、`show`、`branch`、`worktree list`）自动执行；写类（`add`、`commit`、`worktree add`）需经 Approval 审批；白名单外命令一律拒绝。（4）**显式封堵**：`core.hooksPath` 指向空目录、禁用所有 filter/textconv/pager/editor/askpass/credential helper/SSH 变体/remote helper/fsmonitor（`-c` 逐项覆盖 + 环境变量双保险）；不随包携带 Git LFS 与 Git Credential Manager。（5）网络类 Git 操作（fetch/push/clone）v1 不在本地白名单内，留待远程化或后续 ADR。（6）G10 恶意仓库负向矩阵（构造触发上述每个攻击面的仓库，验证零进程/零网络逃逸）为 SPIKE_03 硬门槛；No-Go 时 Git 降级为只读观测（沿用 Phase 2 语义），写操作远程化。
- 后果：获得 Codex 级 Git/Worktree 能力且攻击面收敛为可枚举清单；代价是部分依赖 hooks/filter 的仓库工作流（如 lint hook、LFS 仓库）在 Agent 内不可用，需在 UI 明示。

## ADR-0033 性能预算基线：docs/PERFORMANCE_BUDGET.md 为唯一权威

- 状态：Accepted（2026-07-29，项目负责人裁决通过，见 PENDING_CONFIRMATIONS PC-003；Win7 可交付结论仍以对应 Spike/阶段的 Win7 SP1 x64 实机验证为准，未通过前不得表述为"已满足 Win7"）
- 背景：Win7 目标机资源有限（机械盘、4~8GB 内存、老显卡），Electron + Node 栈内存占用显著；缺乏统一预算会导致各任务书各自宣称"性能可接受"而无法验收。
- 决策：（1）新建 `docs/PERFORMANCE_BUDGET.md` 作为性能指标**唯一权威**，初始 10 项预算：冷启动 ≤8s；Shell 常驻 ≤300MB；Core ≤180MB；Runner ≤60MB/实例；索引吞吐 ≥120 文件/s（上限 3 万文件）；事件批量写 ≥300 QPS；单库 ≤512MB 滚动清理；检索 P95 ≤1.2s；任务并发上限 2；应用总内存 ≤55% 物理内存。（2）**这些数值当前状态为 `PROPOSED`（工程估计目标），不是已接受的 Win7 门槛**：每项须绑定参考硬件口径（CPU/RAM/机械盘或 SSD/冷热缓存/统计方法如中位数或 P95），并在被指定 Spike/阶段于 Win7 实机实测前保持 `NOT_MEASURED / 未实测` 状态位，**禁止纸面达标**。数值随本 ADR（Proposed）一并待裁决；Spike 实测 + 本 ADR 转 Accepted 后，方成为可验收的 Win7 硬门槛。（3）每行预算必须标注：测量方法、负责实测的 Spike/阶段、Go/No-Go 阈值。（4）任何任务书引用性能指标只准引用该文件，不得内联复制数值；预算修订须更新该文件并注明依据。
- 后果：性能验收有单一口径，Spike No-Go 判据可机械执行；同时如实区分"提议目标"与"已验收门槛"，避免把未实测数字当成 Win7 承诺。代价是预算数字在首轮实测前是工程估计，可能触发修订流程。

## ADR-0034 Codex 功能面三分级；Spike 不占用 ADR-0012 阶段编号

- 状态：Accepted（2026-07-29，项目负责人裁决通过，见 PENDING_CONFIRMATIONS PC-003；Win7 可交付结论仍以对应 Spike/阶段的 Win7 SP1 x64 实机验证为准，未通过前不得表述为"已满足 Win7"）
- 背景：对标 OpenAI Codex 需要明确哪些能力在 Win7 本地实现、哪些远程化、哪些 v1 明确不做，防止范围蔓延；同时新增 Spike 类任务需要与 ADR-0012 冻结的阶段编号共存。
- 决策：（1）功能面三分级冻结：**Win7 本地实现** = 会话式任务、流式输出、代码检索（SQLite FTS 增量索引 + 有界扫描回退）、diff 预览与审批、受控命令执行、Git/Worktree（隔离 Adapter）、AGENTS.md 项目指令、状态恢复与审计、有上限并发（默认 2）、数据式 Skills；**远程化（Gateway 对端）** = 模型推理、Browser Use/网页自动化、OAuth/外部登录、超大仓库语义索引、不可信代码强隔离执行、远程 MCP；**v1 明确不做** = full-access 本地沙箱等价、ConPTY 级终端保真、本地 WSL/Docker/Sandbox、MCP/Hooks 插件宿主（推迟 v1.1，边界见 ADR-0035）、多 Agent 编排、自动 PR、插件市场、后台常驻守护。（2）**编号规则**：正式阶段任务书严守 ADR-0012 编号（3=Model Gateway、4=Workspace Write、5=State Audit、6=Agent Core+Runner、7=Desktop Shell）；Spike 任务书使用 `SPIKE_NN_*` 独立命名，不占用阶段编号，分支 `spike/*`、白名单限 `spikes/**`。（3）"v1 不做"清单的任何项进入实现前必须先补 ADR。
- 后果：范围有可执行边界，阶段编号历史引用不失效；代价是部分 Codex 能力显式承认缺席，需在产品口径中如实说明。

## ADR-0035 插件宿主（MCP/Skills/Hooks）信任边界原则冻结；实现推迟 v1.1

- 状态：Accepted（2026-07-29，项目负责人裁决通过，见 PENDING_CONFIRMATIONS PC-003；Win7 可交付结论仍以对应 Spike/阶段的 Win7 SP1 x64 实机验证为准，未通过前不得表述为"已满足 Win7"）
- 背景：MCP/Skills/Hooks 是可扩展执行入口，同时放大安全面（任意子进程、任意网络）与验收面（每个插件都是新依赖）。v1 周期内无法承担其治理成本，但边界原则须先冻结以免后续设计漂移。
- 决策：（1）v1 仅支持**数据式 Skills**（纯声明性 markdown/JSON，无执行体，由 Core 解释）。（2）可执行插件宿主推迟 v1.1，届时须遵守本 ADR 冻结的边界原则：插件一律运行于**受限令牌独立子进程**（复用 D-013 containment）；插件包必须有**版本化 Manifest**（声明能力、命令、文件与网络需求）并经用户显式授权安装；本地仅允许 **stdio 传输的 MCP**（不开本地网络端口）；远程 MCP 一律经 Gateway 代理并复用其鉴权与审计。（3）Hooks（生命周期钩子执行用户命令）视同插件执行体，同受上述约束，v1 不提供。（4）v1.1 启动插件宿主前必须另立任务书与补充 ADR，本 ADR 仅冻结边界不授权实现。
- 后果：v1 安全面与验收面可控，Skills 先行满足轻量定制需求；代价是 v1 生态扩展性有限，与 Codex 的 MCP 能力差距显式记录于 ADR-0034 三分级。

## ADR-0036 PC-003 裁决——Win7 Electron 首选实施技术栈获批

- 状态：Accepted（2026-07-29，项目负责人裁决）
- 背景：PC-003 记录了从纯 Python 技术栈切换到 Electron 22.3.27 + Node 16.17.1 的架构决策需求。ADR-0028~0035 以 Proposed 状态起草，涵盖技术栈单栈化、Python 资产冻结、Approval Mode、终端隔离、Git Adapter、性能预算、功能三分级与插件边界，需项目负责人裁决。
- 决策：（1）Win7 SP1 x64 兼容性为基本要求，技术选型以程序最优化为目标。（2）ADR-0028~0035 方向获批，状态从 Proposed 转为 Accepted（附条件）。（3）附条件：四项 Win7 实机 SPIKE（SPIKE_01~04）验证通过后正式生效；如 SPIKE 结论为 No-Go，需按 ADR-0028 降级阶梯以补充 ADR 重新评估受影响条目。（4）实施策略：非终端/containment 模块可基于理论分析先行实现；终端层（winpty/node-pty）和进程 containment 模块须等 SPIKE_02 实机验证结论后定稿。
- 证据（网络调研证据摘要）：
  - Electron 22.3.27：官方最后支持 Win7 的版本，2023-10-09 发布，EOL 同日。
  - Chromium 108：完全兼容 Win7（Chromium 109 是最后支持 Win7 的版本）。
  - Node.js 16.17.1：经 Electron 适配后兼容 Win7。
  - MinGit 2.46.2：最后支持 Win7 的 Git 版本。
  - node-pty：需锁定 1.0.x/1.1.0-beta（最新版已移除 winpty 支持）。
  - SQLite WAL + FTS5：完全兼容 Win7。
  - DPAPI：完全可用。
  - Job Object：不支持嵌套（Win8+ 才有），containment 保持 best-effort。
- 后果：Phase 3-7 和 SPIKE 1-4 任务书可从 DRAFT 升级为 APPROVED_FOR_IMPLEMENTATION（SPIKE 先行，Phase 待对应 Spike Go 后逐阶段解锁）；所有组件均已 EOL 或到达支持边界，需严格版本锁定与 SBOM 治理；终端层和 containment 层存在实机验证后返工风险（独立模块，成本可控）。

## ADR-0037 Phase 3–7 采用保留历史的整合基线；Phase 1/2 不重写，Phase 3 定向重构

- 状态：Accepted（2026-07-30，项目负责人明确要求整合、修复、清理并评估重写）
- 背景：Phase 3→4 形成连续历史，Phase 5、6、7 则从 Phase 4 分支并行开发；因此任一阶段分支的工作树都不会同时出现全部模块。旧版 `docs/ROBUSTNESS_AUDIT.md` 在 Phase 3 工作树中检查目录，并把其他权威分支上的源码判为缺失；工作树还残留约三万项 `node_modules`/`dist` 派生物，进一步混淆了源码事实。ADR-0029 已冻结 Phase 1/2 Python legacy，Phase 6 应继承其契约与测试而不是复制实现。现有 Phase 3 协议抽象可保留，但重试、TLS、流式解析、并发隔离和错误映射存在已复现缺陷。
- 决策：（1）新增 `INTEGRATION_01_ROBUSTNESS_HARDENING` 任务书承载跨阶段授权；整合分支固定为 `codex/integrated-robustness`，以 Phase 6 为基础并合并 Phase 5、Phase 7，借 Phase 6 已有祖先获得 Phase 3/4，禁止复制工作树或提交生成物来“补齐”模块。（2）Phase 1 不重写，继续作为安装前 legacy Probe，只做经验证的缺陷修复；Phase 2 不重写、不整体迁移，保留历史分支/标签，契约与测试矩阵继续作为 Node Core 的规范来源。（3）Phase 3 不推倒重写：保留 Provider/Protocol/Transport 分层及既有测试资产，对 Transport/Provider 进行边界清晰的定向重构；若实机 SPIKE 证明 Node `https` 无法满足企业代理、CA 或 Win7 TLS 要求，再以补充 ADR 切换网络栈。（4）Phase 4–7 只修复已证实的安全、原子性、恢复和交互契约问题；真实进程 containment 与交互终端仍等待 SPIKE_02，不以不受控降级换取表面可运行。（5）清理可再生派生物并补根级忽略规则；未证明重复的手写测试必须保留。（6）审计结论必须标注分支/提交、证据类型与状态，未执行的测试不得写成失败，开发机通过不得写成 Win7 通过。
- 后果：项目获得可追溯、可测试的单一整合基线，同时保留各阶段审查历史；Phase 1/2 的已验证资产不会因重写而失效，Phase 3 的修复成本集中在网络边界而非全部重建。整合基线仍不等于可交付产品：Phase 6 缺真实 containment、Phase 7 缺完整桌面入口、SPIKE 1–4 与 Win7 端到端证据仍是完成门槛。

## ADR-0038 Agent 完成态、审批绑定与本地执行入口统一收口

- 状态：Accepted（2026-07-30，项目负责人在架构验收后明确要求“修复 Agent 设计问题”）
- 背景：当前整合基线具备 Gateway、Workspace、State、Core、Runner、Git Adapter 与 Shell 的模块级实现，但没有把它们收口为可证明完成的 Agent 闭环。状态机允许 `EXECUTING` 直接进入 `COMPLETED`；审批只比较级别，未绑定预览与工作区基线；Workspace Apply 没有强制根目录参数；Git Adapter 虽声明“通过 IRunner”，实际直接 `child_process.spawn`。这些缺口会分别造成错误完成、批准后内容漂移、工作区越界和绕过 containment，属于 Agent 设计问题，不是 Win7 平台限制。
- 决策：（1）Node Core 的单 Agent Loop 采用依赖注入边界连接模型、工具执行、事件与验证；Mock/Replay 仅由测试或显式装配使用，不提供隐式生产默认。（2）任务执行结束先进入 `VERIFYING`；Verification Gate 按声明的检查项核验，生成版本化、内容摘要可复算的 `EvidenceBundle`，只有通过后才能转入 `COMPLETED`。（3）所有工具经版本化 `ToolSpec` 注册表解析；上下文编排必须生成带预算、已选/省略项、截断原因和稳定摘要的 `ContextManifest`。（4）workspace-write 审批记录绑定会话、工具、规范化请求指纹、预览摘要、工作区基线、有效期和一次性消费状态；执行边界重新计算并核对，变化、过期或重放一律拒绝。（5）`applyPlan` 强制接收 workspace root，在任何备份/写入前、创建目录后和替换后校验真实路径边界；回滚结果显式区分完成与失败，不静默吞掉恢复错误。（6）Git Adapter 删除直接进程启动能力，只接受结构上兼容 `IRunner` 的注入端口；缺少 Runner 或 Runner fail-closed 时 Git 同样拒绝。（7）事件身份增加 Run/Thread 关联和 Session 内稳定序号；相同 ID、相同内容的重试幂等返回既有事件，相同 ID 的冲突内容拒绝。（8）SQLite、真实 containment、MinGit G10、Electron UI 和 Win7 结论仍由对应 SPIKE/阶段门禁决定，本 ADR 不允许用内存实现或 Mock 证据冒充生产完成。
- 后果：完成态、审批、文件写入和 Git 进程入口获得同一套 fail-closed 语义，Core 可以用显式 Mock/Replay 做纵向确定性回归。代价是 `applyPlan`、Git Adapter、workspace-write Runner 请求与 Event Schema 出现有意的收紧式接口变更；调用方必须提供根目录、Runner 和绑定审批，旧的“只传计划/直接执行”调用会在编译或运行时失败。目标端可交付性仍取决于 SPIKE_01~04 和 Win7 实机验证。

## ADR-0039 Agent Loop 的 Turn/Step 边界、六类结局与取消配对

- 状态：Accepted（2026-07-30，项目负责人依据 Agent Loop 第一讲验收结论要求修复）
- 背景：ADR-0038 建立了“规划→工具→验证”的纵向闭环，但 Core 仍只调用模型一次并批量执行固定计划，工具结果不会返回模型继续决策；同时缺少 Turn/Step 作用域、四维预算、预算收尾、Step 级重试、重复调用检测和运行中取消配对。该实现属于可验证流水线，不满足生产 Agent Loop 的边界合同。
- 决策：（1）Thread 由 `threadId` 关联历史与恢复，Turn 由 `turnId` 承载预算和取消，Step 是一次逻辑模型调用及其工具结果，模型重试只发生在同一 Step 内。（2）Turn 结局穷举为 `COMPLETED`、`NEEDS_APPROVAL`、`BUDGET_EXCEEDED`、`CANCELLED`、`STUCK`、`FAILED`；审批是带版本化 `RuntimeCheckpoint` 的可序列化挂起点，恢复时继承消息、预算消耗与验证要求，不重新生成已批准计划。（3）Turn 同时限制 Step、Token、单调墙钟时间和工具调用次数；预算耗尽时给模型一次有独立短宽限、强制 `toolChoice=none` 的收尾机会，失败则由事件轨迹生成确定性本地摘要。（4）模型调用采用有界 Step 级重试；工具调用不自动重放。连续三次相同工具名与规范化参数摘要触发 `STUCK`。（5）Policy DENY、工具校验失败、预算阻止、取消和执行失败均生成与 `toolCallId` 配对的结构化 `tool.result` 并进入模型历史；只有审批挂起发生在工具启动前且不伪造执行结果。（6）取消信号贯穿模型、验证器和 Tool Executor；有副作用工具取消后必须由 Executor 报告进程树终止与清理完成，无法确认时以 `CANCELLATION_FAILED` fail-closed，不得返回成功取消。（7）Core 只定义 Win7 兼容的取消端口，不实现或模拟 containment；生产 Executor 必须由 SPIKE_02 通过后的 Job Object/Restricted Token helper 承载，`taskkill` 不得冒充安全等价物。（8）完成态仍必须经过 ADR-0038 的 Verification Gate。
- 后果：`RuntimeModel` 改为接收完整 Step 输入（消息、步号、重试次数、工具选择和 AbortSignal），`RuntimeToolExecutor` 改为接收 deadline/AbortSignal 并可实现显式清理，现有调用方必须适配新接口。Core 可在现代开发机确定性验证全部 Loop 分支，但 Win7 生产取消、SQLite Checkpoint 持久化、Electron 装配和实机结论仍分别受 SPIKE_02、SPIKE_04、SPIKE_01 与 Phase 6/7 门禁约束。

## ADR-0040 Agent Loop 工具批次配对与 EventSink 三阶段故障语义

- 状态：Accepted（2026-07-30，项目负责人提交第一讲验收缺陷并要求核验、优化）
- 背景：ADR-0039 已要求工具调用与结果合法配对，但同一模型 Step 返回多个调用时，若中途发生 STUCK、运行中取消或副作用取消清理失败，当前调用有结果而后续未启动调用没有配对结果。另一方面，`RuntimeEventSink.append` 异常会被误归为 `MODEL_FAILED`，错误收尾时再次写事件还会让 `run()` 裸拒绝；这与 ADR-0025 收编的 EventStore 三阶段故障合同和“完整前缀”语义不一致。Turn 建立前的预算、上下文与 Checkpoint 校验仍抛泛型 `TypeError/Error`，未知编排异常也会冒充模型故障。
- 决策：（1）模型在一个 Step 中声明的全部工具调用，除未执行即进入审批挂起的调用外，必须各有一个 `tool.result`；STUCK、运行中取消和 `CANCELLATION_FAILED` 在结束前，将同批后续调用配对为未启动的 `denied/cancelled` 结果。（2）EventSink 故障分为 `startup`、`running`、`finalizing`：启动或运行阶段必要事件失败时，Turn 返回 `FAILED + EVENT_STORE_FAILED + traceComplete=false`；仅最终 `turn.finished` 失败时保留已经形成的业务结局，同时返回 `storageFailureStage=finalizing` 和独立 `eventStoreError`。（3）`turn.suspended` 是 Checkpoint 可恢复性的必要证据，不属于可降级的最终收尾；写入失败必须 fail-closed，且不得向调用方返回未持久化的 Checkpoint。（4）状态转移采用持久化先行：先接受 `state.transition` 事件，再更新内存状态；事件序号仅在 append 成功后推进。终态释放 Runtime 内的 Run 序号与存储故障记录，审批挂起则保留至恢复结束。（5）Turn 建立前非法输入统一抛 `RUNTIME_INPUT_INVALID` 的 `AgentError`；未归入已有错误域的编排异常统一为 `INTERNAL`，不得冒充 `MODEL_FAILED`。
- 后果：`RuntimeResult` 新增权威 `traceComplete`、可选 `storageFailureStage` 与 `eventStoreError`；EventSink 失败不再造成二次异常裸逃逸，调用方能区分业务失败与仅审计收尾不完整。Core 仍只定义持久化失败协议，没有因此完成 SQLite/崩溃恢复；具体存储引擎、断电一致性和 Win7 工件证据继续受 SPIKE_04 门禁约束。

## ADR-0041 状态以不可变事实为准，视图由事件投影生成

- 状态：Accepted（2026-07-30，项目负责人要求按状态、事件与协议验收标准修复）
- 背景：现有 State 模块已有内存追加和基础幂等，却仍将消息、运行时检查点与事件轨迹并列为事实来源；事件未统一携带 Turn 边界，孤儿工具启动、文件变化、压缩历史和多订阅背压没有可验证合同。这会使重放、恢复与审计结果依赖调用顺序或易失内存，而不是可排序的事实。
- 决策：（1）新增 V2 事件信封：`eventId`、`schemaVersion`、Thread 内稳定 `seq`、`sessionId`、`threadId`、`turnId`、`runId`、UTC 时间、`type` 与 JSON payload 均为不可变字段。（2）消息、工具结果、文件变更、用量与 UI 状态一律由事件投影生成；`*.started` 没有配对 `*.finished` 时，投影必须产生安全的 `interrupted` 工具结果。（3）文件成功写入必须与 `file.changed` 事实同批提交；任一阶段失败均不得把轨迹标为完整。（4）压缩以 `compaction.applied` 事实和 `supersedesCompactionIds` 构成可追溯 DAG，原始事件不得删除。（5）事件入口使用 `submit`，读取使用可独立退订的 `subscribe`；订阅者背压只可合并或丢弃 delta，永不得丢弃事实事件。（6）重试策略改为数据驱动错误矩阵；未知事件按版本前向兼容原则跳过并输出警告。（7）SQLite、断电原子性与跨进程恢复继续由 SPIKE_04 决定，内存实现只作为协议与开发机合同实现，不得作为持久化完成证据。
- 后果：State V2 与投影、订阅队列可在开发机进行确定性回归，Core/Workspace 后续必须改为向该边界提交事实，禁止再把可重建消息数组作为恢复权威。协议有意接受新增事件类型，旧消费者会记录告警并跳过未知事件；生产 SQLite、崩溃注入与 Win7 实机结果仍保持未完成。

## ADR-0042 命令执行采用 Runner V2 联合结果与字节级有界输出

- 状态：Accepted（2026-07-30，项目负责人要求按工具设计与命令执行标准修复）
- 背景：现有 Runner 只使用单一超时、单一字符串输出上限与异常拒绝表达预期执行失败；
  Git Adapter 的请求映射也无法表达 stdin、空闲超时和独立流上限。这使 Agent、UI 和审计
  无法可靠地区分“未启动”“已取消”“已超时”与“清理未知”，且截断后的输出缺少可操作的
  上下文。
- 决策：（1）Runner 请求冻结为 V2：`timeoutMs`、`idleTimeoutMs`、独立
  `maxStdoutBytes/maxStderrBytes`、绝对 `workDir`、受控 `envOverlay` 和固定
  `stdinPolicy=closed` 为必填执行合同。（2）结果使用版本化 `status` 联合；所有预期的
  拒绝、超时、取消、启动与 containment 不可用结果都 resolve 为结构化错误，仅编程缺陷
  才允许 Promise rejection。（3）每个输出流按字节累计；超过保留上限后继续由底层 transport
  排空，同时保存首尾片段、总读取量、保留量、遗漏量、解码替换数与明显的截断提示。
  （4）通用 Runner 禁止 Shell host，argv 中的元字符仅作为数据；Agent stdin 永远关闭。
  （5）Git Adapter 仅把隔离后的结构化请求交给注入 Runner，并映射 V2 结果，不恢复直接
  进程启动。（6）真实执行、Job Object、CP936 解码、取消后树清理和交互终端不由 Mock
  声称完成；SPIKE_02 未 Go 前生产 Runner 固定返回 `capability_unavailable`。
- 后果：所有调用方需要迁移旧 `timeout/maxOutput/env` 字段和扁平结果；获得可审计且可复测
  的失败语义与有限输出上下文。Mock 覆盖只能证明协议，不证明 Win7 containment、编码或
  真实进程清理，后续原生 helper 仍须按 SPIKE_02 的实机证据接入。

## ADR-0043 Core 恢复以 State V2 投影为权威，Checkpoint 只保存恢复锚点

- 状态：Accepted（2026-07-30，项目负责人要求复核并继续修复第二讲验收缺口）
- 背景：ADR-0041 已规定消息是事件投影，但 Core 的 `RuntimeCheckpoint 1.0` 仍复制完整 messages 数组，Core RuntimeEvent 与 State V2 也没有适配器。进程中断后即使日志中存在孤儿工具启动事实，Core 恢复仍可能采用过时消息快照，违背单一事实来源。
- 决策：（1）新增结构化 `RuntimeEventLedgerSink`，将 Core 生命周期事件映射到 State V2；V2 ledger 是 Thread 序号唯一分配者，Core 序号仅作为确定性幂等事件 ID 的来源。（2）`RuntimeCheckpoint 2.0` 删除 messages，只保留身份、最后事件序号、待审批计划、预算用量和验证要求；恢复时未装配事件消息投影器必须 fail-closed。（3）Core 新 Turn 在装配投影器时忽略调用方 messages 快照，历史从事件投影生成；`turn.started` 事实携带当前用户 prompt，模型计划与工具结果分别投影为 assistant/tool 消息，孤儿 Started 投影为 interrupted 工具消息。（4）`compaction.applied` 使用消息序号范围、摘要和 supersedes DAG；只有活动压缩替换消息视图，原始事实永不删除。（5）Core 模型错误按数据矩阵分类；上下文超限只有在显式压缩端口成功并接受压缩事实后才重试。（6）Core 提供 `submit(run/resume/cancel)` 与 `subscribe()` 门面，UI/CLI 不依赖内部 Loop 调用形态。（7）SQLite、断电一致性、kill-9 后跨进程加载与 Win7 实机证据仍受 SPIKE_04 约束，本 ADR 不以进程内 ledger 冒充持久恢复。
- 后果：Core/State 在类型和开发机行为层形成一条事件事实→投影→模型历史链，审批 Checkpoint 不再制造第二份消息真相；旧 `RuntimeCheckpoint 1.0` 是有意拒绝的收紧式协议变更。生产恢复仍必须等待 SPIKE_04 的持久 Store，并在同一适配边界接入。

## ADR-0044 上下文工程采用受保护投影、内容绑定摘要与尾部工作记忆

- 状态：Accepted（2026-07-30，项目负责人要求按上下文工程验收计划修复）
- 背景：现有 `ContextManager` 只按优先级筛选元数据，摘要未绑定内容，`RuntimeModelInput` 又可访问含原始 `contextItems` 的请求；因此预算与审批漂移检测可被绕过。项目还缺少最小 Bootstrap、分层 `AGENTS.md`、工作记忆、工具观察折叠和缓存友好的水位控制。
- 决策：（1）模型只能接收 `ContextProjection`，不得访问原始 `RuntimeRequest.contextItems`、审批令牌或未选历史；Manifest 摘要绑定最终顺序、每项内容 SHA-256、系统提示版本和固定排序的 ToolSpec 目录。（2）上下文分为 stable prefix、protected constraints、rolling history 与 tail working memory；protected 条目过大时 fail-closed，模型只能更新计划、当前步骤与发现，不能删除 system/user/policy/project 约束。（3）默认在模型窗口 75% 时批量压缩，至少保留 20% 输出空间；原始 State 事实不删除，折叠只替换投影。（4）初始投影仅包含环境、分层规则、用户任务和固定工具目录；规则按用户配置路径、repo root 到 cwd 顺序加载，README、目录树和源码只能经工具按需获得。（5）产品 v1 只治理常驻 AGENTS 规则与数据式 Skills 的边界；可执行插件/Skill 宿主继续受 ADR-0035 的 v1.1 任务书约束。
- 后果：RuntimeModelInput、ContextManifest 与 Checkpoint 发生收紧式升级；旧摘要或无法容纳的受保护上下文必须明确拒绝。新合同只证明 Node 开发机行为，工具实际输出、SQLite 恢复、Win7 性能与实机验证仍分别受对应任务和 Spike 约束。

## ADR-0045 ToolSpec V2 与锚文本编辑共用既有审批写入链

- 状态：Accepted（2026-07-30，项目负责人要求复核并修复第三讲 ACI 报告中的真实问题）
- 背景：Runner V2 已关闭命令契约的大部分缺口，但 Core ToolSpec 的参数仍只是扁平类型，
  模型看不到参数语义、枚举和默认值；Workspace 只有整文件 `WritePlan`，diff 只报告文件
  状态，无法对锚文本零命中、多命中和误改位置提供有效反馈。
- 决策：（1）ToolSpec 升级为 V2；每个参数强制非空 description，可声明 enum/default，
  注册时验证描述、类型、枚举和默认值一致性，Runtime 在 Policy 与 Executor 之前应用默认值，
  且不修改模型原始调用。（2）Workspace 增加精确锚替换的计划前端；只允许既有、大小受控、
  可明确识别的 UTF-8 文件和唯一锚，零命中返回最相似片段/行号，多命中返回次数/首批行号。
  （3）锚替换只生成带 `baseSha256` 的既有 WritePlan，不获得直接写能力；漂移、审批、路径
  复核、原子替换和回滚继续由原链路负责。（4）WriteOperation、Shadow diff 与 Apply 成功
  结果携带版本化内容 preview；preview 有字节上限、前后 SHA-256、变更行范围和截断标志。
  非 UTF-8/二进制不猜测内容，只展示哈希与明确标记。（5）Phase 2 Python 工具为冻结 legacy，
  当前整合任务不得修改；其错误、搜索统计和 read 工具重叠问题记录为后续 Node 工具继承的
  负面需求。（6）真实 Runner、CP936、Job Object 与进程树证据继续受 SPIKE_02 阻断。
- 后果：模型获得更清晰、可执行的工具参数合同，锚编辑具备能自我纠错的失败反馈和审批前
  内容证据。代价是 ToolSpec 调用方必须迁移到 schemaVersion 2.0 和参数描述对象；内容 preview
  会增加有界的计划体积。开发机测试不能替代 Win7、真实进程或历史 Phase 2 的验收。

## ADR-0046 Node 只读工具合并读取语义并区分完整总数与预算下界

- 状态：Accepted（2026-07-31，项目负责人要求继续修复第三讲 ACI 报告问题）
- 背景：冻结 Phase 2 工具把完整读取和范围读取拆为两个行为不一致的入口，路径错误使用
  `UNEXPECTED`，搜索达到返回上限后立即停止，既没有上下文行，也无法区分真实总命中数和
  已返回数量。ADR-0045 已要求 Node 继承时不得复制这些偏差，但尚无实际 Node 只读服务。
- 决策：（1）Node 只保留一个 `workspace.read_text` 语义，以 `startLine/maxLines` 同时服务
  首次读取和后续范围读取，始终返回总行数、实际范围、行号和截断原因。（2）文件或目录
  不存在时返回专用错误码、工具前置要求和同目录相似候选。（3）`workspace.search_text`
  使用字面量搜索，命中携带可调上下文；达到返回条数或输出字节上限后，在文件数、扫描字节
  与单文件预算内继续计数。（4）结果分别报告 `returnedMatches`、`totalMatches` 和
  `totalMatchesExact`；任何不可读、未知编码、二进制、超大文件或扫描预算中断都会把 exact
  标为 false，并列出结构化截断原因。（5）只读遍历跳过 symlink 和固定生成物目录，所有入口
  复用 Workspace realpath 边界；未知编码不猜测。（6）ToolSpec V2 增加 number 的
  minimum/maximum 注册与调用校验，并提供 `read_text/search_text/str_replace` 的稳定目录
  注册工厂。（7）这些服务和 Schema 不等于产品 Executor 已装配；跨模块用户任务仍需独立 E2E。
- 后果：模型能用一个读取工具逐步收窄范围，搜索能够根据完整计数或明确的预算下界决定下一步，
  错误也能直接驱动纠正调用。代价是扫描为了得到总数会继续消耗已声明预算；调用方必须区分
  `totalMatchesExact=false`。Phase 2 代码、真实 Runner、CP936 与 Win7 实机结论保持不变。

## ADR-0047 Policy 三态裁决与参数敏感 Git 分类

- 状态：Accepted（2026-07-31，Sandbox 与审批分离验收修复）
- 背景：布尔 `allowed` 不能区分“应请求审批”和“必须拒绝”，导致审计与 UI 容易把两类状态混同；通用 `terminal.exec` 在尚无获批命令配置文件时仍可被标为只读。Git 的 `branch`、`tag` 也曾只按命令名分类，使删除、创建和重命名形式错误继承读权限。
- 决策：（1）PolicyDecision 新增 `allow/ask/deny` verdict 与稳定 ruleId，保留 `allowed` 仅作兼容投影；Policy 提供只消费已给事实的 `evaluateFacts`，令牌读取留在 Broker 适配层。（2）Runtime 在进入审批分支前记录每个真实裁决，ASK 与无效审批均产生可关联的 `policy.decision` 事实。（3）无获批命令配置文件时通用 `terminal.exec` fail-closed；`.env`、`.git`、Windows SAM/SECURITY/SYSTEM 与 Unix 密码数据库禁止走通用文件工具。（4）Git `branch/tag` 只把零参数或明确的纯列表 flag 视为 READ，其余形式一律按 WRITE 处理并要求精确审批；未知形式不再获得隐式只读分类。（5）Runner 拒绝 Agent 通过 envOverlay 传递 token、secret、password、credential、API/private key 或 SSH agent socket。
- 后果：调用方可稳定显示“需要批准”与“被拒绝”，审计可按 ruleId 聚合；少数以前被宽松接受的只读命令或路径会明确失败并要求专用 Adapter/配置文件。该收紧不构成真实 containment、凭据管理或 Win7 实机验证；它们仍受 SPIKE_02/03 与 C15/C16 门禁约束。

## ADR-0048 会话 Git 安全网与拒绝审批回流保持精确绑定

- 状态：Accepted（2026-07-31，Sandbox / Approval 分离复核修复）
- 背景：单次 Workspace 原子写与审批绑定不能提供会话开始基线、会话 diff 或跨操作恢复视图；同时 Shell 虽有拒绝消息字段，Core 没有把用户原因变成模型可消费的配对 ToolResult。审计建议增加会话级“始终允许”，但这会与 ADR-0038 的精确请求、预览、基线及一次性消费相冲突。
- 决策：（1）Git Session Guard 仅在 worktree 干净时记录不可变 HEAD 基线；已有用户变更必须显式处理，禁止自动 stash/commit。（2）会话检查固定输出 porcelain status、binary diff、未跟踪路径和截断状态。（3）回滚跟踪文件使用绑定到精确 Runner 请求的一次性审批；不得调用 `git clean` 或静默删除未跟踪文件，残留时返回 `complete=false`。（4）Workspace enforcement 在词法路径和 realpath 结果上统一拒绝 `.git/.env*`。（5）ToolSpec capability 收敛为编译期词表。（6）审批请求强制携带 Policy ruleId，拒绝必须包含原因；Core 只接受原 Checkpoint 中待决调用的拒绝，记录 `approval.resolved` 并向模型提供 `POLICY_USER_REJECTED` 的 denied ToolResult。（7）不增加宽泛“本会话始终允许写操作”；后续若要减少审批疲劳，只能在不削弱每次内容绑定的独立 ADR 中设计。
- 后果：用户能看到会话范围变化并安全恢复受跟踪内容，拒绝原因进入同一事件与模型反馈链；系统不会以便利性为由吞掉既有改动或未跟踪文件。真实 MinGit、Job Object、Restricted Token、低权限进程和网络控制仍由 SPIKE_02/03 与 Win7 实机验证决定。

## ADR-0049 Runtime 协议自动建立并持有 Git 会话基线

- 状态：Superseded by ADR-0050（2026-07-31）
- 背景：ADR-0048 已提供 GitSessionGuard，但它只作为导出的模块存在；若产品装配忘记调用，Turn 可以在没有会话基线和结束 diff 的情况下运行，安全网不会实际生效。Core 又不应直接依赖 Git Adapter 包。
- 决策：（1）AgentRuntimeProtocol 增加结构化 SessionSafetyPort；配置端口且 Bootstrap 确认是 Git 仓库时，首个 Turn 必须在 Runner 调用前建立干净基线。（2）每个 Turn 完成或挂起后必须检查相同基线并在协议结果中携带 sessionSafety 证据。（3）一个 Session 只能绑定一个 cwd，切换工作区 fail-closed。（4）并发首轮共享同一个基线建立 Promise，避免重复快照竞态。（5）关闭 Session 时先完成最终检查，再释放进程内基线；检查失败不得静默清除。（6）Core 仅声明结构端口，由产品组合根注入 GitSessionGuard；未注入时保持历史兼容，Electron/CLI 最终组合和持久 Session 仍属于 H-04/SPIKE-04。
- 后果：在正确配置安全端口的产品组合中，Git 基线不再依赖调用者自觉，session diff 成为每个 Turn 的结构化证据；旧调用方不配置端口时行为不变。真实 Git 执行仍取决于受控 Runner 与 SPIKE_02/03，当前接入不扩大进程权限。

## ADR-0050 Git 仓库 Turn 缺少 SessionSafetyPort 时必须 fail-closed

- 状态：Accepted（2026-07-31，收紧 ADR-0049 的可选装配缺口）
- 背景：ADR-0049 将 SessionSafetyPort 设为可选以兼容旧调用方，但 Bootstrap 已明确声明 `git.repository=true` 时，继续运行会让产品组合根通过“忘记注入”绕过 Git 会话基线，未真正关闭装配缺口。
- 决策：（1）RuntimeRequest 的 Bootstrap 声明当前 cwd 是 Git 仓库时，AgentRuntimeProtocol 必须已配置 SessionSafetyPort；缺失时在模型或工具启动前返回 `RUNTIME_INPUT_INVALID`。（2）非 Git 工作区和未提供 Git Bootstrap 的历史测试/调用保持兼容。（3）端口存在时继续沿用 ADR-0049 的自动 begin、逐 Turn inspect、cwd 单绑定、并发基线复用和 close 前最终检查。（4）Session 存在活动 Run 时不得释放基线。
- 后果：Git 仓库产品路径无法再因遗漏组合依赖而静默失去安全网；代价是产品组合根必须显式注入 GitSessionGuard。真实 Runner 不可用时基线建立同样 fail-closed，仍不构成 Win7 实机可用结论。

## ADR-0051 验证失败必须反馈修复并对同一 Gate 有界熔断

- 状态：Accepted（2026-07-31，验证闭环修复）
- 背景：ADR-0038 已使完成态经过 Verification Gate，但当前 Gate 的需求由模型计划提供，失败即直接进入 `FAILED`。这会把“模型声称已完成”误当为可信验收输入，也缺少把可行动的失败事实反馈给模型修复的闭环；反复失败还会消耗 Turn 预算而没有稳定的终止语义。
- 决策：（1）验证目标由请求侧的 `TaskAcceptance` 声明，包含稳定的 checkId 和描述；模型计划只可提出验证建议，不得定义完成条件。（2）最终响应进入 `VERIFYING` 后，Gate 必须基于 TaskAcceptance 与收集的证据生成可复算摘要；每项失败必须带稳定 Gate 标识、状态和面向模型的修复反馈。（3）未达到同一 Gate 的失败上限时，Runtime 记录 `verification.feedback`，从 `VERIFYING` 合法回到 `EXECUTING`，将反馈作为 system 消息进入下一次模型调用；不伪造工具结果或执行真实命令。（4）同一 Gate 连续失败三次时返回结构化 `VERIFICATION_STUCK`，并保留三次失败的证据摘要；不同 Gate 的失败计数彼此隔离。（5）验证反馈与失败历史必须进入事件协议和消息投影，以便 checkpoint/replay 保持相同的修复上下文。（6）本 ADR 只建立 Core 合同与确定性 Mock 证据；可信命令来源、Runner 回执绑定、基线 red/green 与真实执行均继续受 SPIKE_02、C08/C09/C20 及后续任务书约束。
- 后果：完成条件不再由模型自证，验证失败成为可恢复的、可审计的修复循环，且同一问题不会无限重试。调用方须提供 TaskAcceptance；缺失时 Runtime 在模型或工具启动前 fail-closed。该变更不增加进程权限、网络能力或 Win7 已验证结论。

## ADR-0052 文档职责分层与任务书稳定路径

- 状态：Accepted（2026-07-31，项目负责人要求按当前基线执行文档整理）
- 背景：多窗口并行优化把任务授权、实施结果、测试数字、历史报告和当前状态写入同一批共享文档；任务书移动到 `active/` 后又造成现行引用和历史引用分裂。当前候选快照还处于工作区，不能把历史报告数字直接当作 HEAD 状态。
- 决策：（1）规则、ADR、任务合同、当前状态、风险和历史证据分别由 `AGENTS.md`/`WIN7_CONSTRAINTS.md`、`DECISIONS.md`、`docs/tasks/*.md`、`docs/STATUS.md` 与 `docs/status/latest-validation.json`、`docs/ROBUSTNESS_AUDIT.md`、`docs/reports/YYYY-MM/` 维护。（2）任务书路径保持稳定，生命周期状态由任务元数据和 `docs/tasks/README.md` 表达，不通过移动到 `active/` 表达。（3）当前测试结果必须绑定最终代码 commit 和执行环境；README、ROADMAP 和任务合同不得重复维护动态测试总数。（4）历史报告保留为时间点证据，不得覆盖当前状态；Accepted ADR 正文不因整理而改写。（5）共享状态文档由整合窗口统一更新，模块窗口只提交模块代码、测试和独占证据。
- 后果：文档迁移和并行窗口不会再通过路径变化或重复数字制造多个事实来源；代价是每次代码基线变更后必须重新生成验证记录，并由整合窗口更新状态索引。

## ADR-0053 Phase 1/2 源码归档到独立目录且历史 ADR 保持不可变

- 状态：Accepted（2026-07-31，文档基线修复）
- 背景：整合候选快照把 Phase 1/2 Python legacy 从 `src/win7_agent/**` 与 `tests/unit/probe/**` 迁入 `src/phase1-2/win7_agent/**` 与 `tests/phase1-2/**`，以免与 Node 新客户端源码混在同一顶层。整理过程中曾直接改写 ADR-0013、0017、0023、0029 的历史路径，违反 Accepted ADR 不可改写规则。
- 决策：（1）ADR-0013、0017、0023、0029 恢复为其接受时的原始正文，作为历史决策记录；本 ADR 仅取代这些 ADR 中关于当前物理路径的条款，不改变其运行时、权限、冻结、分支或验收语义。（2）当前 Phase 1/2 物理路径以任务书为权威：实现位于 `src/phase1-2/win7_agent/**`，Phase 1 单元测试位于 `tests/phase1-2/probe/**`，其余集成与 Win7 验收路径沿用任务书。（3）迁移不得改变 Python 包名 `win7_agent`、CLI 入口、Schema、退出码或 Win7 验收合同。（4）后续路径迁移必须新增 ADR 或更新尚未接受的任务文档，不得重写既有 Accepted ADR 正文。（5）`AGENTS.md` 的当前阶段摘要改为并列列出阶段 0、Phase 1/2 收口、Phase 3–7 整合候选和 SPIKE 实机验证，并明确当前整合分支的直接任务书，避免把历史冻结阶段误读为唯一活动范围。
- 后果：历史记录恢复可审计，当前路径仍有明确权威来源；文档检查器可将 HEAD 中已接受 ADR 的非状态正文作为不可变基线进行比较。

## ADR-0054 未提交 MVP 基线与 Win7 实机验收受控收口

- 状态：Accepted（2026-08-02，项目负责人授权）
- 背景：当前 `codex/integrated-robustness` 工作区包含尚未提交的 MVP 演进，现有 SPIKE
  任务分别绑定专用分支，而 WorkBuddy 的局部运行报告又与正式任务书和状态页存在冲突。
  若直接在当前工作区补验收 harness，会违反 C14；若只保留旧报告，则无法形成可追溯、可复跑
  的 MVP 实机结论。
- 决策：（1）新增 `MVP_01_WIN7_REAL_MACHINE_ACCEPTANCE` 任务，目标仅为当前整合分支上的
  MVP 基线、验收 harness、原始证据、交叉论证和状态收口；不要求创建 Git commit，改以
  MVP ID、工作区清单与 SHA-256 指纹绑定证据。（2）该任务只授权 `spikes/*/acceptance/**`、
  `validation/**`、验收/状态文档和专用验收脚本；生产实现仍严格受既有 Phase/Integration
  任务书白名单约束，Phase 1/2 冻结路径和 Gate 不被扩大或绕过。（3）历史 WorkBuddy 证据
  保持不可变；任何哈希、覆盖范围或判定修正以勘误和独立交叉论证追加，不覆写原始报告。
  （4）实机自动化结果可同步当前状态和任务书的客观验证记录；但要求架构师 Gate、人工视觉、
  干净环境、物理断网、机械盘或企业环境的项目必须显式标为 PARTIAL、替代验证或环境阻断，
  不得写成正式通过。（5）Win7 网络测试保留 SSH 管理通道，不得改变网卡、路由、防火墙或
  Bitvise 服务；仅允许应用层阻断、临时本地监听和被动证据。
- 后果：项目可以在不损坏用户 dirty 工作区的情况下获得连续、可复现的 MVP 证据链；代价是
  MVP 结论与正式发布 Gate 明确分离，未获真实环境支撑的条件不能被状态页或 README 包装为
  完成。

## ADR-0055 Win7 MVP 负责人接受、延期边界与桌面装配启动

- 状态：Accepted（2026-08-02，项目负责人明确授权 Codex 对剩余问题作出决策或按 MVP 默认接受，并继续推进开发）
- 背景：MVP-20260802-12/14 已证明 Win7 SP1 x64、Electron 22.3.27、CPython 3.8.10、
  受控 MinGit、关键补丁、Renderer/IPC 边界、崩溃证据、中文路径和 Git 隔离；但正式发布所需的
  重启冷启动、人工视觉、物理断网、企业 E7、原生 containment、SQLite ABI 和完整安装包仍缺外部
  条件。若把这些缺口伪写成实测 PASS 会破坏证据链；若继续把它们作为 MVP 阻断，又无法进入真实
  产品装配。
- 决策：（1）当前实机结论定为 `OWNER_ACCEPTED_FOR_MVP`，客观用例原状态和正式发布 Gate
  保持不变；负责人接受不是正式 `PASS`。（2）SPIKE_01 T03 接受 Electron 22 在 Win7 上的
  NUL-like stdin 语义：父侧不存在 `utility.stdin`、诊断期间无数据进入，故可作为 MVP 的“父侧
  不可注入输入”证据；后续产品 Core 仍应显式关闭或隔离 stdin 并补负向测试。（3）SPIKE_02
  延期期间，真实本地 Runner、交互终端和高风险命令必须 fail-closed，不得以 `spawn`、`taskkill`
  或 Mock 冒充 containment；MVP 可提供只读、Replay/演示和诊断能力。（4）SPIKE_04 延期期间使用
  有容量上限的内存状态实现，不承诺重启恢复、FTS5 或 SQLite 性能；机械盘门禁按负责人决定接受，
  SSD 数据不得改写为机械盘实测。（5）视觉、窗口焦点、受控重启、严格干净系统、物理断网、企业
  代理/CA/模型/更新服务均作为正式发布延期项；MVP 分别沿用 `OWNER_ACCEPTED_FOR_MVP`、
  `E5_SURROGATE_PASS` 和 `MVP_NETWORK_SURROGATE`。（6）在当前
  `codex/integrated-robustness` 分支启动第一阶段产品装配：实现只加载可信本地资源、默认拒绝出站、
  `nodeIntegration=false`、`contextIsolation=true`、`sandbox=true` 的 Electron main/preload/renderer
  最小入口；未验证能力必须在 UI 中明确显示不可用，不得隐藏或绕过 Gate。
- 后果：Win7 实机验收在 MVP 口径下完成，项目可以进入真实桌面入口与跨模块装配；正式发布仍需
  补齐被延期的原生构建链、持久化、企业网络、人工视觉、重启、物理离线和完整交付证据。任何延期
  项进入生产默认路径前，必须恢复其原任务书验收并获得真实 PASS。

## ADR-0056 Desktop Alpha 1 采用只读 Replay 纵向切片

- 状态：Accepted（2026-08-02，项目负责人授权 A1 产品装配）
- 背景：ADR-0055 已允许启动可信本地 Electron 入口，但当前产品仍只有启动和诊断页面，
  尚未把 Shell、Core、State 和 Workspace 接成用户可操作的闭环。一次性开放真实模型、Runner、
  终端或持久化会同时引入 Win7 运行时、权限和原生依赖风险，无法形成可审计的最小产品证据。
- 决策：（1）A1 固定为单工作区、单活动任务、并发 1 的只读 Replay Alpha；Replay Model Adapter
  必须通过现有 Core AgentRuntime/AgentRuntimeProtocol，实际调用 Workspace 的
  `list_directory`、`search_text`、`read_text`，Core 事件通过 State V2 ledger、bounded stream
  和 message projection 到达产品 UI。（2）Session Service 只保存有容量上限的进程内状态，重启
  不恢复；工作区根由主进程目录选择器取得并用 realpath 规范化，Renderer 不获得文件系统或
  通用 IPC。（3）所有桌面请求、产品事件和用户可见错误使用版本化 Shell Schema；每个任务事件
  带稳定事件 ID、序号和任务关联，重复事件幂等、乱序/过量输入有界处理，取消后禁止完成事件。
  （4）A1 只提供 UTF-8、显式 GBK 与 CRLF 的只读展示；未知编码、越界路径、敏感路径、Runner、
  Git、终端、真实 Gateway、写入、SQLite、凭据和网络继续 fail-closed。（5）便携验收目录和
  Win7 W01～W12 证据另行绑定 MVP ID；开发机通过不改变正式 Phase/SPIKE/Win7 Gate。
- 后果：用户可以在真实 Electron 窗口内选择工作区、创建会话、提交只读分析、查看工具活动和
  Replay 流式结果并取消任务；产品装配风险和测试边界被限制在现有 TypeScript 模块与 Electron
  22.3.27。代价是没有真实模型、命令执行、终端、Git、重启恢复或正式发布能力，所有延期项在 UI
  中必须明确显示不可用。

## ADR-0057 Desktop Alpha 2 采用可信单文件写入计划与双重一次性审批

- 状态：Accepted（2026-08-02，项目负责人授权 A2 受控单文件修改闭环）
- 背景：A1 已证明真实 Electron Shell 可以把只读 Replay 经 Core、State 和 Workspace 展示给用户，
  但 `workspace.str_replace` 若直接从模型调用进入写入边界，会让模型自报的预览哈希、基线哈希或
  内容摘要成为审批依据，无法证明“用户批准的内容”就是“最终写入的内容”。同时，单纯依赖 Core
  审批不足以覆盖 Workspace 执行边界的重放、内容漂移和进程异常恢复。
- 决策：（1）模型只提交结构化 WriteIntent；TrustedWritePreparer 在主进程读取当前文件，
  复用 Workspace 的编码、EOL、唯一锚点、Diff 和 SHA-256 能力，生成不可变 WritePlan。所有
  模型提供的哈希和预览摘要均忽略或拒绝。（2）WritePlan 绑定 Session、Task、Turn、Call、
  规范化工作区/相对路径、base/content/preview 哈希、编码/BOM/EOL、锚点、创建时间和 TTL；
  同时只允许一个活动写计划。（3）批准需要 Core workspace-write 能力令牌与 Workspace
  一次性 ApprovalLedger 两层绑定；令牌仅对精确 plan/call/session/turn 生效，拒绝、过期、取消、
  关闭、漂移、跨作用域和重放均失效。（4）Workspace 在最终执行点重新验证工作区边界、计划状态、
  基线哈希和审批消费，使用备份、临时文件、同卷原子替换、重读校验和失败回滚；回滚失败锁定
  工作区，不得冒充成功。（5）撤销是重新生成的反向 WritePlan，必须再次预览和审批。（6）进程
  崩溃/断电只通过版本化写事务恢复清单识别未完成阶段；启动不自动续写，用户只能选择恢复原文件
  或导出诊断。A2 继续使用内存 State，不启用 SQLite、Runner、Git、终端、Gateway 或真实模型。
- 后果：用户批准的单文件内容与实际写入形成可验证的双重绑定，内容漂移和审批重放在两个边界都
  fail-closed，失败可自动恢复且回滚失败会阻断继续写入。代价是每次写入都需要新的可信计划和审批，
  只支持 UTF-8/UTF-8 BOM 文本、唯一锚点和单文件事务；A2 的 Win7 实机证据仍不能替代正式发布 Gate。

## ADR-0058 项目原创成果采用 Apache License 2.0

- 状态：Accepted（2026-08-02，项目负责人明确选择 Apache License 2.0）
- 背景：仓库已经公开并计划申请 Codex for Open Source，但此前没有根许可证文件，自有 npm 包也
  未声明许可证，外部使用者无法获得明确的复制、修改、分发和贡献授权。项目同时包含多种第三方
  依赖、EOL 运行时与验收材料，不能用项目许可证覆盖它们原有的许可和归属要求。
- 决策：（1）项目原创代码、文档和项目自研构建产物统一采用 Apache License 2.0，根目录保存
  Apache Software Foundation 发布的标准许可证全文。（2）所有项目自有 `package.json` 及其根包
  lockfile 元数据声明 SPDX 标识 `Apache-2.0`。（3）除非贡献者明确另行声明，主动提交并被接纳的
  Contribution 按许可证第 5 条纳入。（4）第三方依赖、运行时、外部二进制、引用材料和既有归属
  声明继续适用各自条款；发布时仍须按 C16 生成 SBOM、许可证清单并满足再分发义务。
- 后果：外部使用者和贡献者获得明确且包含专利授权的开源许可，GitHub 与包工具可以识别
  `Apache-2.0`。项目仍不提供商标授权或质量保证；许可变更不放宽 Win7 安全边界、实现任务授权、
  第三方依赖审查或正式发布 Gate。

## ADR-0059 Desktop Alpha 3 受控 Gateway 联机纵向切片

- 状态：Accepted（2026-08-04，项目负责人授权 A3 规划、实施与 Win7 验收）
- 背景：Desktop Alpha 2 已形成 Replay 驱动的只读/受控写入产品闭环，但 Gateway 仍未接入
  Desktop Host 与 Core RuntimeModel 端口。需要验证真实 Node HTTPS/TLS/SSE/取消/重试/协议失败
  以及凭据脱敏，同时不能把企业 E7、真实模型、DPAPI 或未验证的本地执行能力伪装成已完成。
- 决策：（1）A3 默认保持 Replay，Gateway 仅由显式设置启用；配置、连接、取消和状态事件全部经
  版本化 Schema IPC、main/Core 和审计边界。（2）Gateway 采用已登记的 Electron 22.3.27 内嵌
  Node 16.17.1 `https`/OpenSSL 栈，只允许 HTTPS、TLS 1.2+、CA/主机名验证和 fail-closed；不新增
  依赖，不允许 HTTP 降级或 `rejectUnauthorized=false`。（3）API key 与代理凭据仅驻留进程内存，
  不落盘、不进日志/报告；DPAPI 另立任务书。（4）SSE 真实边接收边解析，必须有兼容协议版本与
  完成信号；请求按 request id 隔离，取消后无迟到事件；重试、总 deadline 与退避有界。（5）A3
  只把确定性受控 Gateway 响应接入 Core 的只读 Workspace 工具和 UI，不启用 Runner、Git、终端、
  SQLite、Updater、插件或真实模型。（6）Win7 仅允许新验收目录与隔离 userData；Mac 临时 TLS/代理
  fixture 结束即关闭，受控结果标记 `A3_CONTROLLED_GATEWAY_PASS`/`MVP_NETWORK_SURROGATE`，不改变
  企业 E7 与正式 Phase 3 Gate。
- 后果：项目获得一条可审计的受控联机纵向切片及明确的降级路径；代价是企业代理/PAC/CA、真实模型、
  DPAPI、生产服务和正式 E7 仍需独立环境与任务书，A3 不能扩大解释为完整 Coding Agent 或正式发布。

## ADR-0060 Desktop Alpha 3 接受显式 HTTP Gateway 配置

- 状态：Accepted（2026-08-04，项目负责人明确授权默认接受 HTTP Gateway）
- 背景：Win7 当前受控 Gateway 部署可能位于内网明文 HTTP 端点；原 ADR-0059 只允许 HTTPS，导致
  用户明确配置的 `http://` Gateway 在 Schema、Desktop Host 和 Node transport 三层被拒绝，无法进行
  目标机联机验收。该授权只改变 Gateway URL 的允许协议，不改变 Replay 默认、Renderer 权限、凭据
  生命周期、Runner/Git/终端/SQLite/Updater/插件范围或正式 E7 Gate。
- 决策：（1）Gateway URL 允许用户显式选择 `http://` 或 `https://`，不做隐式协议降级或自动升级；Replay
  仍是产品默认，只有设置提交后才建立 Gateway provider。（2）HTTPS 继续强制 TLS 1.2+、CA/主机名验证
  与 fail-closed，绝不设置 `rejectUnauthorized=false`。（3）HTTP 仅作为用户明确接受的内网明文路径，
  其请求/响应仍经过同一 Schema、Core、审计和脱敏边界；不把 HTTP 结果解释为 TLS 或企业 E7 安全证据。
  （4）A3 受控 fixture 增加 HTTP 正向请求证据，并保留 HTTPS/错误证书负向证据；PAC、企业代理、真实
  模型、DPAPI 和 Win7 W01-W15 仍分别按原状态记录。
- 后果：A3 可连接当前内网 HTTP Gateway，同时保持 HTTPS 的严格验证；代价是明文传输风险由部署者承担，
  生产或企业 E7 仍应使用 HTTPS，并必须在报告中明确记录协议与网络边界。

## ADR-0061 Desktop Alpha 3.1 显式接入 DeepSeek 公网真实模型

- 状态：Accepted（2026-08-04，项目负责人明确授权仅为验收使用公网、发送隔离样例并承担少量费用）
- 背景：ADR-0059 的“无公网、无真实模型”用于限定受控 fixture 证据，不能证明真实模型服务与 Win7
  产品链路可用。项目负责人提供 DeepSeek OpenAI-compatible 端点和模型选择，并澄清公网并非产品禁令，
  只是此前环境不可用；真实验收仍必须避免把凭据写入命令、文件、日志或证据。
- 决策：（1）新增显式 `deepseek-openai` 模式，只允许 HTTPS `api.deepseek.com:443`，不自动探测、重定向、
  降级或放开任意 OpenAI-compatible 主机；Replay 仍是默认。（2）使用 Electron 22 内嵌 Node 16 网络栈实现
  OpenAI Chat Completions、SSE 与 Tool Calls 映射，不新增运行时依赖；TLS 1.2+、证书/主机名验证、取消、
  总 deadline、有界重试和代理 fail-closed 继续适用。（3）API key 必须由用户在 Win7 UI 临时输入，仅驻留
  主进程内存；禁止进入 argv、环境变量、userData、日志、事件、报告或自动化工具调用。（4）只允许隔离、
  无敏感数据的验收工作区发送至 DeepSeek；UI 明示公网、数据外发和可能计费。（5）模型只能调用既有
  Workspace 只读工具；Runner、Git、终端、SQLite、Updater、插件、PAC、DPAPI 和写入自动授权继续关闭。
  （6）成功状态限定为 `A3_REAL_MODEL_PUBLIC_NETWORK_PASS`，不等于企业 Gateway/E7、企业 CA/代理或正式发布。
- 后果：项目可以获得真实公网模型驱动 Core/Workspace/UI 的 Win7 证据，同时保持凭据和能力边界；代价是
  验收依赖账户余额、服务可用性、地区与公网条件，且每次新进程都需要用户重新输入 key。

## ADR-0062 Desktop Alpha 3.2 使用 Electron safeStorage / Windows DPAPI 持久化 API key

- 状态：Accepted（2026-08-04，项目负责人明确授权优先实现 API key 持久化）
- 背景：A3.1 已证明 Win7 上真实 DeepSeek 纵向链路可用，但每次进程重启都必须重新输入 API key。
  项目面向企业内部使用，需要在不把 key 暴露给 Renderer、普通配置、日志或验收报告的前提下，提供
  当前 Windows 用户范围的静态加密保存。现有 Gateway 已有 `InMemoryCredentialStore`，持久化应由
  平台 Shell 管理，不能把 Windows API 耦合进 vendor-neutral Gateway/Core。
- 决策：（1）A3.2 只持久化 API key，必须由用户显式勾选；Replay 仍为默认，存在密文不会自动联网。
  （2）Electron main 在 `app.ready` 后使用锁定 Electron 22.3.27 的同步 `safeStorage`，Windows 后端为
  DPAPI Current User；不新增原生模块、系统配置或运行时依赖，不允许明文降级。（3）版本化
  `credentials.v1.json` 只保存有界 Base64 密文与非敏感元数据，采用同目录临时文件和原子替换；
  DPAPI 不可用、密文损坏、未知版本或解密失败均结构化 fail-closed。（4）启动只报告“已保存”状态；
  用户显式应用 Gateway/DeepSeek 后，Shell 才解密并注入现有 `InMemoryCredentialStore`。Renderer、IPC
  返回、诊断、事件、日志、argv、环境和报告永不获得 key 或密文。（5）提供显式清除动作，同时清除
  当前 Provider 内存凭据和密文文件；代理凭据继续仅内存。（6）DPAPI 只防护其他 Windows 用户和离线
  磁盘读取，不防御同一用户上下文的恶意进程；服务端轮换/注销仍由用户负责，旧密文备份不会自动失效。
- 后果：用户可以在同一 Win7 登录账户下跨重启复用 API key，同时保留默认 Replay、Renderer 最小权限和
  日志脱敏。代价是增加一个本地版本化密文文件及其损坏/迁移处理；切换账户、用户配置不可用或 DPAPI
  失败时必须重新输入。A3.2 PASS 不代表企业密钥托管、DPAPI-NG、TPM、代理/PAC 或企业 E7 完成。

## ADR-0063 SPIKE_02 采用 node-pty 内置 winpty 精确快照并收紧 Win10 构建闭包

- 状态：Accepted（2026-08-06，项目负责人要求复核并实施推荐裁决）
- 背景：原 D-011 把 `node-pty 0.10.0` 与独立 `winpty 0.4.3` 组合。源码复核确认
  node-pty 0.10.0 的 Windows binding 直接调用 `winpty_get_console_process_list`；0.4.3
  没有该 API 的声明或实现，而 node-pty npm 归档内置的 `winpty 0.4.4-dev` 同时提供两者。
  原 Win10 构建候选脚本覆盖为 0.4.3，构成确定性编译阻断。候选包还以预解压 headers 作为实际输入，
  未严格限定 VS2019、SDK 版本，也未形成 PE/API/CRT 与 C16 闭包。
- 决策：（1）D-011 改为 `node-pty 0.10.0 + 其 npm 归档内置 winpty 0.4.4-dev 精确源码快照`，
  不再混用独立 0.4.3；node-pty TGZ 与派生 winpty ZIP 分别锁定 SHA-256，构建前验证版本、头文件声明、
  实现和调用合同。（2）实际 Electron headers 必须在 Win10 上从已校验 tar.gz 重新解压，已校验 x64
  `node.lib` 随后复制，并对最终编译目录逐文件记录 SHA-256；禁止使用未绑定的预解压目录。
  （3）D-017 构建 Profile 固定为 Windows 10 x64、Visual Studio 2019 `[16.0,17.0)`、v142/14.2x、
  Windows SDK `10.0.19041.0`、CPython 3.8.10 AMD64 和离线 Node 16.17.1；记录实际 VS/MSVC 补丁版本。
  （4）所有 `.node/.dll/.exe` 必须执行 `dumpbin /HEADERS`、`/DEPENDENTS`、`/IMPORTS`，验证 PE x64、
  Win10+ API denylist 和 CRT 闭包；动态 CRT 未随结果包携带时 fail-closed。Electron smoke 必须实际加载
  ABI 110 模块并强制 `useConpty:false`。（5）构建包随附 CycloneDX SBOM、npm 完整性、许可证归档、
  audit 时间点报告、EOL/漏洞风险记录及 package-lock 自身哈希。构建工具链 audit 风险仅在所有归档已
  哈希锁定、离线且位于专用目录时接受，不能处理任意外部归档。（6）修正后的包只可标为
  `BUILD_KIT_READY_FOR_WIN10_BUILD`；Win10 实际报告复核前不解除 `BUILD_HOST_MISSING`，Win7
  SPIKE_02 实测前继续为 `NOT_PERFORMED/PARTIAL`。
- 后果：消除 0.4.3 API 缺失这一确定性编译阻断，并把构建输入、工具链、ABI、PE、API、CRT 与合规
  证据绑定为单一闭包。代价是采用停止维护且非独立正式 release 的 0.4.4-dev 内置快照，本项目承担
  漏洞回补责任；是否真正兼容 Win7 仍只能由 SPIKE_02 T01～T05/N01～N06 实机矩阵证明。

## ADR-0064 SPIKE_04 锁定 better-sqlite3 8.7.0 / SQLite 3.43.1 并建立 A6 Win10 构建闭包

- 状态：Accepted（2026-08-07，项目负责人要求制定 A6 Win10 构建方案并按 A5 材料类型打包）
- 背景：D-014 只登记了“候选 better-sqlite3 + FTS5”，没有具体 better-sqlite3/SQLite 版本、源码
  哈希、Electron ABI 工件或离线构建闭包，SPIKE_04 因此仍为 `BUILD_HOST_MISSING`。A5 已证明
  Windows 10 + VS2019/v142 + SDK 10.0.19041.0 + Python 3.8.10 的离线 Electron ABI 110 构建链
  可用，但其回传包不包含 SQLite 原生模块。
- 决策：（1）D-014 锁定 `better-sqlite3 8.7.0 + 内嵌 SQLite 3.43.1`；该版本官方发布包含
  Electron ABI 110 的 Win32 x64 工件作为兼容性旁证，正式候选仍从 npm 官方源码归档重建。
  （2）源码合同固定 better-sqlite3、SQLite amalgamation 关键文件哈希，并强制
  `SQLITE_ENABLE_FTS5`、`SQLITE_ENABLE_COLUMN_METADATA`、`SQLITE_THREADSAFE=2`；许可证更正为
  better-sqlite3 MIT、SQLite public domain。（3）复用 D-017 工具链，目标固定 Electron 22.3.27
  ABI 110、x64、`WINVER/_WIN32_WINNT=0x0601`、Release `/MT`；生成工程必须锁定 v142 和 SDK 19041。
  （4）输出必须执行 PE x64、Win10+ API denylist、CRT 导入检查；Electron smoke 必须实际加载模块，
  证明 ABI 110、SQLite 3.43.1、FTS5、WAL、中文+空格数据库路径和 SPIKE_04 schema。（5）构建包
  随附输入锁、包 manifest、实际 headers、完整 transcript、文件哈希、CycloneDX SBOM、许可证、
  npm audit 和风险记录；Win10 端正常构建不得联网。（6）构建包只标记
  `BUILD_KIT_READY_FOR_WIN10_BUILD`；返回工件经 Mac 复核后最多进入 `READY_FOR_WIN7_VALIDATION`，
  SPIKE_04 S01～S08 和 Win7 兼容性仍必须在目标机完成。
- 后果：A6 可以与 A5 Win7 验收并行在同一类 Win10 构建主机产出工件，且 A7 可按固定哈希复用，
  不再需要在 Win7 现场安装或编译 npm 原生模块。代价是锁定历史 SQLite/Node/Electron/Win7 组合，
  项目承担 EOL 与漏洞回补；`unicode61` 只证明 FTS5 基础能力，不等价于中文分词质量，仍需 S05 裁决。

## ADR-0065 验收协调器控制面：签名租约、轮前/轮后检查、证据分级与 fail-closed 正式状态

- 状态：Accepted（2026-08-07，项目负责人裁决：协调器定位、A5 自追加、A6 证据处置、实施顺序）
- 背景：现有 Win7 验收证据由各 SPIKE harness 自报——A6 `--win7-validated` 直接把
  `win7_validation: VALIDATED` 盖进证据 JSON（`harness/benchmark/benchmark.js:65,203,243`）；
  A5 `--lease-granted`/`WIN7_LEASE_GRANTED` 只做环境标志门禁（`acceptance/a5/a5-run.js:200`）；
  A4 `GATE-WIN7-LEASE` 仅回显不执行（`run_d013_win7.mjs`，且 `PENDING_WIN10_BUILD` 哨兵放行
  REM-D01，见 `:231`）。DECISIONS.md 此前 63 条 ADR 均无租约签发者、证据分级或状态更新控制面
  条目。这使"开发机/缩短参数/SSD 结果"与"正式 Win7 实机通过"边界模糊，违反 AGENTS.md
  C08/C19 与证据分级纪律。
- 决策：
  1. **控制面身份**：验收协调器是**整合窗口（ADR-0052）的工具延伸**，不是新实体，不新建任务书。
     其代码位于 `scripts/mvp_acceptance/win7_coordinator/**`（MVP_01 §2 第 27 行已含
     `scripts/mvp_acceptance/**`），正式状态写 `docs/status/**` 沿用 MVP_01 §2 第 31 行 +
     ADR-0052 的整合窗口写权限。本 ADR 不扩张任何既有任务白名单。
  2. **唯一租约**：状态机 `REQUESTED→GRANTED→RUNNING→RETURNED→RELEASED`，异常
     `RUNNING→RECOVERY_REQUIRED`；任一时刻最多一个 `GRANTED`/`RUNNING`。租约绑定 commit、
     工件 manifest SHA-256、目标机标识、scope、期限与非ce。协调器用 Ed25519 对租约原始字节
     签名；公钥随 Runner 交付，私钥仅存协调器本机 Git 之外，禁止上传 Win7、禁止进仓库/ZIP/日志。
  3. **Worker 信任边界**：Worker 只输出 `DEV_PASS` 或 `CANDIDATE_EVIDENCE`；移除自报
     `--win7-validated`、`--lease-granted`；正式 `WIN7_PASS` 仅由协调器证据校验器计算。Worker
     公共状态文档修改从候选提交排除。
  4. **轮前/轮后检查**：每轮强制 BvSshServer `RUNNING`、SSH 22 探针、零残留、上一租约 `RELEASED`、
     租约签名/commit/scope/目标/工件 manifest 全匹配；不满足即 `PREFLIGHT_BLOCKED`，不上传、不
     启动、不改系统。轮后在 `finally` 执行并按 PID/父子关系核对；禁止宽泛 `taskkill` 冒充 Job
     containment；残留或后置失败 → `RECOVERY_REQUIRED`，不自动发下一份租约。
  5. **双向 SHA-256**：上传与返回均以 `certutil -hashfile <file> SHA256` 与本地计算对账，逐文件
     核对关键 EXE/DLL/NODE；缺项只能 `HASH_PENDING`，不得进入 PASS。
  6. **证据分级**：`DEVELOPMENT` / `SURROGATE` / `CANDIDATE_EVIDENCE` / `WIN7_PASS`。Mock、
     缩短压测、SSD 替代机械盘只能进 `DEVELOPMENT`/`SURROGATE`；机械盘证据 fail-closed（无法
     确认介质即不 PASS）。
  7. **A6 既有证据**：真实 Win7 SSD 执行且已提交，保留原始 `win7_validation: VALIDATED` 字段与
     哈希不变，仅**追加** `REJECTED_AS_FORMAL_EVIDENCE` / `SSD_SURROGATE` disposition，新证据
     使用新 run ID。
  8. **A5 任务书自追加**：保留 A5 分支对 `docs/tasks/SPIKE_02_TERMINAL_CONTAINMENT.md` §9 的
     自追加（SPIKE_02 §0.2 白名单授权），属于验证记录而非正式状态；正式状态仍由协调器统一写
     `docs/status/**`。
  9. **实施顺序**：A4（D-013 helper 执行边界/哈希/租约/回滚）→ A6（正式参数 + 证据分级）→
     A5（基于 D-013 合入更新 T05）；A5 必须晚于 D-013 合入，任一时刻单一租约。
- 后果：Win7 验收从"per-harness 自报"收敛为"协调器签发的受控流水线"，正式状态与证据分级有单一
  事实来源，开发机/缩短/SSD 结果不再可能冒充正式实机通过。代价是新增一个签名/校验工具面与人工
  配合项（Win10 D-013 构建、Win7 交互观察、机械盘环境、企业启动器环境、私钥位置），且轮前检查
  不满足时本轮拒绝执行（不自行启动服务/改防火墙/重启）。

## ADR-0066 A6 以本地 SSD 作为唯一正式存储 Profile

- 状态：Accepted（2026-08-10，项目负责人决定取消机械盘 Gate 并推进正式 SSD 验收）
- 背景：ADR-0065 为防止历史 SSD 结果冒充机械盘性能证据，将 SSD 限定为替代证据，并要求 A6
  正式证据确认机械盘。当前唯一正式目标机 `dccs-chaizl-PC` 的系统盘为 Samsung 870 EVO，本轮
  项目目标也已明确为该实际部署 Profile；继续寻找 HDD 不再提供与正式部署相符的验收价值。
- 决策：（1）A6 唯一正式存储 Profile 固定为 `E22-SQLITE343-LOCAL-SSD`：Win7 SP1 x64 build
  7601、Electron 22.3.27、better-sqlite3 8.7.0、SQLite 3.43.1、FTS5、WAL、本地 NTFS SSD。
  （2）本 ADR 仅取代 ADR-0065 第 6 条中“SSD 只能是 SURROGATE/正式证据必须确认机械盘”的 A6
  介质规则，以及 SPIKE_04 的机械盘测量要求；ADR-0065 的签名租约、Worker 不自报 PASS、证据
  分级、双向哈希、轮前/轮后 fail-closed、单一租约和 A4→A6 实施顺序继续有效。（3）性能预算
  #5～#8 的数值与 Go/No-Go 阈值保持不变，只把测量介质改为本地 SSD。（4）历史 SSD evidence
  与 `REJECTED_AS_FORMAL_EVIDENCE` / `SSD_SURROGATE` disposition 字节及哈希保持不变；只有当前
  代码、新 run ID、当前包 manifest 和有效签名租约的重新执行，才可由协调器定为 `WIN7_PASS`。
  （5）目标机固定为 `dccs-chaizl@192.168.1.11:22`；验收不得修改网络、Bitvise、服务、PATH 或
  系统配置。SSD 身份必须由型号、本地 NTFS 卷与物理盘映射共同确认，不得只凭 WMIC 的通用
  `Fixed hard disk media` 字段。（6）HDD、网络盘与未知介质不在本轮性能支持声明内；不得由 SSD
  结果外推其性能，也不在 A6 实现生产 EventStore、索引服务或 HDD 降级代码。
- 后果：A6 可以在真实部署介质上形成正式证据，且不降低任何既有性能与完整性阈值；证据仍由
  协调器单独定级。项目对 HDD、网络盘或未知介质不作本轮性能承诺，如未来纳入支持范围，必须
  新增 Profile、任务授权和独立实测。

## ADR-0067 Win7 v1 放弃 winpty 交互终端，采用受控非交互 Runner 与只读日志

- 状态：Accepted（2026-08-10，项目负责人批准 A5 后续实施计划）
- 背景：A5 在 Win7 SP1 x64 上实测 `node-pty 0.10.0 + winpty 0.4.4-dev` 可启动并读取
  conout，但向交互 conin 写入 CRLF、CR 或命令均无响应，T01～T04 因
  `WINPTY_INTERACTIVE_INPUT_DEFECT` 失败。继续交付交互终端会形成不可用能力，也会扩大 C19
  输入注入面；D-013 v21 已在 A4-20260810-000004 的 ADR-0065 签名租约下取得 `WIN7_PASS`，
  A5 仍须以独立签名租约完成 T05 回收复验后才能解除生产迁移门禁。
- 决策：（1）Win7 v1 不交付 winpty/node-pty 交互终端，不提供 Renderer 终端输入、粘贴、发送按键
  或模型到终端 stdin 的路径；D-011 和 A5 仅作为历史 No-Go 证据保留。（2）命令能力改为无 PTY、
  stdin 关闭的非交互 Runner；只有产品注入的可信可执行 profile 可执行，Shell 宿主、任意路径和
  模型拼接命令一律拒绝。（3）Runner 输出经 `task.event` 的 `runner.started/stdout/stderr/truncated/finished`
  投影到只读有界日志，清理危险 VT/OSC，不复用模型流事件。（4）D-013 的 Restricted Token、Low
  Integrity、ACL、Job Object 与清理关键项以及 A5 T05 在各自签名租约下通过前，产品默认继续使用
  `UnavailableRunner`；高风险命令始终拒绝或路由远程，本地 containment 不宣称网络隔离。
  （5）实现、迁移和验收由 `INTEGRATION_02_WIN7_NONINTERACTIVE_EXECUTION.md` 授权，正式状态仅由
  ADR-0065 协调器签发。
- 后果：v1 失去交互 TUI，但获得可审计、可取消、有界且不暴露键盘注入面的执行基础；生产 Runner
  的启用仍受 D-013 Win7 正式证据门禁约束，未通过时 UI 必须如实显示能力不可用。


## ADR-0068 A5 门禁解除并采用签名清单注入生产 NativeRunner

- 状态：Accepted（2026-08-10，依据项目负责人已批准的 ADR-0067 实施计划与 A5 正式证据）
- 背景：A5-20260810-153300 已在独立 ADR-0065 签名租约下完成 T05；协调器评级 `WIN7_PASS`，
  Restricted Token、Low Integrity、临时 ACL 回滚、Job 进程树回收、轮前/轮后零残留和租约释放
  均已验证。生产迁移门禁因此满足，但产品仍需防止模型、Renderer 或可变环境把任意路径注册为命令。
- 决策：（1）生产迁移以 D-013 v21 源码为基线，单请求 helper 协议增加 request ID、总/空闲超时和
  结构化双流结果；（2）`NativeRunner` 只解析产品注入的 profile ID，并在每轮执行前复核可执行文件
  规范路径与 SHA-256；Shell、高风险、未知、路径越界或哈希不符全部拒绝；（3）产品注入必须使用
  外部固定 SHA-256 的版本化 Runner manifest，manifest 再锁定 helper 与 profile 工件，装配失败即
  回退 `UnavailableRunner`；（4）Runner 只作为固定内部适配器或验收动作装配，不注册模型可调用的
  `terminal.exec`，`terminal.input` 兼容消息永久返回 `CAPABILITY_UNAVAILABLE`；（5）输出仅经
  `task.event` 投影至有界只读日志并清理 VT/OSC、剪贴板序列和危险链接。
- 后果：低风险非交互执行可进入产品 L01～L10 实机验收；升级后的 helper 在锁定 D-017 工具链重新
  构建、绑定哈希并取得 Win7 正式结果前仍是候选，不得把开发机单测或既有 v21 二进制替代为产品通过。
  C05 继续不提供网络隔离，高风险与未经验证的 Git profile 仍拒绝或路由远程。

## ADR-0069 Win7 Electron 宿主 Job 只允许经验证的 breakaway

- 状态：Accepted（2026-08-11，依据 ADR-0067/0068 的 fail-closed 产品验收要求）
- 背景：A5-20260810-152500 已实证，从 Win7 Electron 主进程直接派生 D-013 helper 会返回
  `HOST_ALREADY_IN_JOB`；v22 生产 Helper 仍对任何宿主 Job 无条件拒绝。它在独立 Win10 会话的
  构建与 smoke 虽然通过，却不能证明 Electron 产品路径可用。使用 WMI → CPython 的 A5 T05
  独立宿主路径只适合 containment 复验，不能替代生产 `NativeRunner` 路径。
- 决策：（1）保留 Win7 禁止嵌套 Job 的边界；helper 只在当前 Job 的扩展限制明确包含
  `BREAKAWAY_OK` 或 `SILENT_BREAKAWAY_OK` 时尝试 child breakaway。（2）restricted child 必须
  suspended 创建；显式模式使用 `CREATE_BREAKAWAY_FROM_JOB`，随后先以
  `IsProcessInJob(child, NULL)` 证明已离开宿主 Job，再分配至 helper 自建 Job 并再次验证。
  （3）响应携带 `hostJob.detected/breakaway/limitFlags/childJobAssignmentVerified`；产品
  `NativeRunner` 把该审计纳入 containment 判定。（4）无 breakaway flag、查询失败、child 未
  脱离或重新分配失败均 fail-closed；不允许通过 `--no-sandbox`、无 Job 执行或生产 WMI 绕过。
- 后果：v22 Win10 PASS 包定性为 `REJECTED_AS_PRODUCT_CANDIDATE`，必须重建 v23。Win7 L01 必须
  从真实 Electron 产品路径证明 breakaway 与新 Job 归属；若 Electron Job 不允许 breakaway，
  本地 Runner 维持不可用，后续只能另行批准外部 Broker 架构或远程执行。

## ADR-0070 验收中途目标 IP 迁移只允许签名恢复，不允许复用执行租约

- 状态：Accepted（2026-08-11，项目负责人通知 Win7 IP 从 `192.168.1.11` 变更为
  `10.49.123.40`，并授权恢复精确的 `work\l08` 空目录）
- 背景：`D013-RUNNER-20260811-010000` 已绑定旧 IP 并进入 `RECOVERY_REQUIRED`，随后目标机 IP
  发生变化。直接把新地址写成旧租约目标会改写签名事实；永久保留活动恢复租约又会阻塞所有后续
  正式验收。新地址提供的 ECDSA/RSA SSH 主机公钥与旧 known-hosts 记录逐字节一致，hostname、
  Win7 build、架构、Bitvise 和锁定工件亦可独立复核。
- 决策：（1）旧租约不得在新 IP 恢复执行、重跑用例或评级；仅允许 `recover-relocated` 完成清理
  状态闭环。（2）迁移恢复必须同时证明新快照零残留、工件哈希匹配、hostname 相同、严格主机
  指纹检查启用且 `HostKeyAlias` 指向旧租约 IP，并携带项目负责人明确授权记录。（3）协调器以
  现有 Ed25519 私钥签名 `RECOVERY_TARGET_RELOCATION` attestation，将旧/新 IP、hostname、旧
  指纹别名和干净快照哈希写入状态历史；任一不匹配即拒绝。（4）恢复完成后旧租约只能
  `RETURNED→RELEASED`；过期租约也只允许完成 `recover`/`recover-relocated` 和最终 `release`，
  不得重新执行、返回或评级。任何后续执行必须以 `10.49.123.40`、新 commit/manifest 和新期限
  签发全新租约。
- 后果：IP 迁移不会被伪装成原租约内执行，也不会绕过残留门禁；协调器可以在同一物理主机严格
  身份连续性成立时关闭恢复状态。旧地址记录作为审计别名保留，不修改 Win7 网络、服务或防火墙。

## ADR-0071 NativeRunner 取消必须由 Helper 协作确认 ACL 回滚

- 状态：Accepted（2026-08-11，依据首轮 L08 正式证据的 fail-closed 修复）
- 背景：v23 产品传输层在收到 `AbortSignal` 后直接终止 helper。Windows Job 的
  `KILL_ON_JOB_CLOSE` 确实回收了 `ping.exe`，但 helper 进程同时失去执行 Low Integrity ACL
  回滚的机会，导致 `work\l08` 留下 `Low Mandatory Level`。仅凭 helper 进程退出就把取消标记为
  cleanup confirmed 是错误的安全结论。
- 决策：（1）每个 helper 进程只接受一条执行请求；取消只能通过同一 stdin 的第二条
  `{schema_version:1,type:"cancel",requestId}` 控制消息触发，request ID 不匹配或控制消息畸形均
  fail-closed。（2）helper 检测取消后终止自建 Job、等待 child 退出、排空双流并恢复此前捕获的
  DACL/Integrity Label；只有所有恢复验证通过才返回 `canceled=true`。（3）产品等待结构化取消
  响应；5 秒未确认才强制终止 helper，此时一律 `cleanup_failed`，不得假定 ACL 已恢复。
  （4）L10 和协调器 postflight 都必须独立扫描验收 `work` 根的 Low Integrity 残留，不能只信任
  Worker 响应。（5）该协议升级为 v24，必须重新通过 D-017 构建、Win10 粘包取消 smoke 和 Win7
  L01～L10；v23 不得复用。
- 后果：取消反馈需要一次 helper 协作往返，最坏情况下在 5 秒后失败关闭，但不会再把“child 已被
  Job 杀死”误报为“ACL 已恢复”。Renderer/模型仍没有 child stdin 或任意进程输入能力；控制消息
  仅存在于产品 transport 与单请求 helper 之间。

## ADR-0072 只读 Runner Profile 不修改工作目录 Integrity Label

- 状态：Accepted（2026-08-11，依据 H3 普通桌面会话的 fail-closed 结果与 r2 实机复验）
- 背景：D-013 V24 的 L09 已在正式签名租约下证明临时 Low Integrity Label 可应用、验证并回滚。
  但首个 H3 UI 包把同一变更无条件用于只读 ping profile；在普通交互式桌面会话创建的 `work\h3`
  上，label restore 返回 `ACCESS_DENIED`，产品正确报 `cleanup_failed`。H3 只验证有界只读日志和
  取消反馈，child 不需要写工作区；把工作区标签变更混入该 profile 增加了无关权限要求。
- 决策：（1）Restricted Primary Token 的 Low Integrity 与工作目录 Mandatory Label 是两个独立
  控制面，不得用后者是否启用判断 child 是否减权。（2）只读且不写工作区的可信 profile 将
  `apply_low_integrity_to_work_dir` 固定为 `false`；helper 仍必须验证 child 为 Low Integrity、stdin
  关闭、Job 归属和进程树清理，路径、argv、哈希与风险策略不变。（3）只有明确需要 Low Integrity
  child 写入指定工作目录的 profile 才可启用临时 label；启用时必须具备轮前权限证明、逐轮精确
  回滚和独立 postflight，任一步不确定仍返回 `cleanup_failed`。（4）H3 r2 必须在 Win7 普通桌面
  会话验证日志、截断、滚动和合作取消，并在窗口关闭后取得零进程/ACL 残留快照。
- 后果：只读 Runner 不再为无写入需求修改用户工作区安全描述符，降低普通桌面会话的失败面，但不
  放宽 child containment。需要本地写入的未来 profile 不能借用本 ADR 绕过临时 label 与回滚门禁；
  任意 Shell、高风险命令、未登记程序和交互式终端继续拒绝。

## ADR-0073 RC v1 采用清单绑定的产品装配与 SQLite V2 事件账本

- 状态：Accepted（2026-08-12，依据 `RC_01_WIN7_RELEASE_CANDIDATE.md` 的 RC-04 授权）
- 背景：A4/A5 已证明 D-013 受控非交互 Runner 的 Win7 边界，A6 已证明 D-014
  `better-sqlite3 8.7.0 / SQLite 3.43.1` 的正式存储 Profile；但既有桌面宿主仍以开发期的条件注入
  和内存 EventLedger 运作，不能证明安装候选真正装配了锁定原生工件、持久状态和 fail-closed
  启动路径。RC-04 必须把两条已验收能力接入同一产品入口，同时保持 Win10、Win7 和 RC 验收门禁
  相互独立。
- 决策：（1）当安装包内存在 `rc-runtime.json` 时，Electron 主进程必须在创建 Renderer 前完成
  RC composition；它逐文件复核 release manifest、D-013 helper、D-014 native binding 和
  `better-sqlite3` 包版本，任何缺失、哈希或 ABI/Profile 不匹配均拒绝启动。（2）RC v1 只注册一个
  manifest 锁定的低风险 `whoami.exe` 非交互 Runner profile，工作目录位于私有 RC 数据根；交互
  终端、任意 Shell、网络盘和 HDD 性能声明保持关闭。（3）状态层采用 schema version 1 的 SQLite
  EventLedger，事件协议保持 V2；固定 SQLite 3.43.1、FTS5、WAL、`quick_check`、单线程模式和
  ABI 110，写入使用原子事务，事件不可变且按线程连续编号，并执行 64 KiB 单事件与 100,000 条
  容量上限。（4）启动恢复必须验证全部已存事件指纹及线程序列，损坏或缺口 fail-closed；正常关闭
  执行 WAL truncate checkpoint 并关闭数据库。（5）持久化范围仅为审计事件事实；现有桌面 session
  catalog 继续为进程内状态，不得把“重启后事件仍可读取”扩大为完整会话恢复承诺。（6）开发机的
  结构、单测与确定性打包只能形成 `DEVELOPMENT_PASS`；Win10 产品 smoke、Win7 唯一租约验收和
  RC 总体结论必须分别执行并记录，禁止相互替代。
- 后果：RC 安装候选拥有单一、可审计且失败关闭的 D-013/D-014 产品装配入口，原生工件与运行配置
  由同一 release manifest 绑定；代价是启动时增加完整性与恢复扫描，数据库 schema 或持久化范围
  的未来变化必须提升版本并另行设计迁移。RC-04 的 Windows product smoke 未完成前仍是部分收口，
  本 ADR 不签发 Win7 租约，也不授权交互终端或新增产品能力。

## ADR-0074 A8 采用 Agent-first 产品模型并冻结 A7 RC

- 状态：Accepted（2026-08-20，依据负责人确认的 Agent-first 产品需求合同 v1）
- 背景：A7 `0.1.0-rc.1` 已证明 Electron、受控非交互 Runner、SQLite EventLedger、确定性发布闭包和
  Win7 生命周期可以在锁定候选上通过，但其主界面仍以固定场景、显式“开始任务”、Gateway 配置和原始
  事件时间线为中心。真实试用暴露 `gateway.delta` 被逐 chunk 渲染成独立行等问题；现状是可验收的
  控制台，不是开发者可持续使用的 Coding Agent。负责人明确要求学习 Codex/ZCode 的对话优先、Goal、
  工具卡片、Review 与按需上下文体验，同时保持 Win7、内网模型和受控执行边界。
- 决策：（1）冻结 A7 RC 的源码标签、候选字节、证据和长期归档；A8 从干净 main 以
  `codex/a8-agent-first-product` 和 `0.2.0-alpha.1` 独立开发，任何 A8 PASS 必须绑定新候选。（2）产品
  入口改为工作区+多会话+自然语言输入，支持直接执行/先计划；固定场景降为提示词模板，验收场景移入
  Diagnostics。（3）Gateway chunk 保持原始审计，Renderer 按 task/request/index 连续性聚合为 Assistant
  消息；计划、工具、Runner、测试、审批和错误成为可折叠卡片。（4）Agent 只生成带基线哈希的多文件
  准备区，用户在 Review 逐文件接受/拒绝后才写入；完整会话、Goal、Review 和中断事实采用版本化持久化，
  恢复时重新验证基线且不自动续跑。（5）首发只承诺登记的内网模型、D-013 低风险非交互 Runner 与
  D-014 本地 SSD Profile；Terminal 与 Agent Runner 输入隔离，旧 winpty No-Go 保持有效；Browser 只
  允许可信本地预览、系统浏览器和登记内网目标。（6）完整编辑器、Git 写操作、任意 Shell、多 Agent、
  后台并发、任意浏览器自动化、插件市场、自动更新和无审批全自动模式不进入 A8 MVP。（7）开发机、
  Win10、Win7 的真实产品旅程分别验收，旧 RC 或 harness PASS 不得替代。
- 后果：A8 可以围绕开发者工作流重构，而不用破坏已验证回退基线；代价是产品状态、会话恢复、Terminal
  和 Browser 需要新的设计与实机证据，版本从 `0.2.0-alpha.1` 重新进入发布周期。Electron 22 缺少现代
  强隔离的事实必须显式呈现，不能以体验对标为由取消 C08、C17～C20 或虚构安全等价性。

## ADR-0075 A8-00 冻结产品投影、会话恢复、准备区与迁移合同

- 状态：Accepted（2026-08-20，A8-00 串行设计 Gate）
- 背景：ADR-0074 已确定 Agent-first 产品方向，但 A7 的物理现状仍是 V2 审计事件持久化、进程内
  Session catalog、单文件审批式产品入口和逐事件 Renderer 时间线。若不先冻结标识关系、流式聚合、
  完整会话状态、准备区批量审批与 A7 数据处置，A8-01 的 UI 很容易变成新的事实来源，A8-03/A8-05
  也会被迫追认不兼容的数据格式。
- 决策：（1）A8 信息架构固定为左侧工作区/会话/Goal、中间对话、右侧按需检查器；工作区入口为
  `Agent / Review / Terminal / Browser`，全局入口为 `Settings / Diagnostics`。A8 v1 使用产品级单活动
  任务锁，不实现后台排队或跨会话并发。（2）权威审计继续采用不可变 Event Envelope V2；每个
  `gateway.delta` 原样持久，展示投影才按 `taskId + requestId + 连续 index` 聚合。非 delta、任务或请求
  切换、index 缺口/乱序、终态、256 KiB 段上限或 1 MiB 消息上限关闭当前段；缓存只可重建，不能覆盖
  原始事实。（3）Session 与 Thread 在 A8 v1 一对一但使用不同随机 ID；Turn 对应一次用户提交，Task
  对应其产品目标，重试创建新 Run。异常退出把活动 Run 标记为 `INTERRUPTED`，Review 恢复重新校验
  基线，任何未知 schema、序列缺口、指纹/哈希漂移均进入只读 Diagnostics，不自动续跑。（4）Agent
  只写 A8 私有准备区；Review 对文件逐项决定，显式 Apply 一次性绑定 `session/task/review/revision`、
  目标清单基线、预览与 accepted-set 哈希。真实测试在私有准备区或 accepted subset 的隔离验证工作区
  执行并精确绑定 validated-set hash；测试结果在 Apply 审批前可见。应用前任一目标漂移则零写入；
  应用中任一写入或字节验证失败回滚整个 accepted subset，回滚未确认即锁定恢复。（5）A8 使用独立
  userData。A7 EventLedger 只读归档且不
  导入活动数据库；只迁移明确版本化的工作区列表与非敏感设置。凭据、旧 Session 推测、恢复目录、
  临时文件和 Runner work 一律不迁移。迁移在临时目录验证后原子发布，失败不产生半迁移状态。
  （6）精确字段、状态、哈希、白名单和测试矩阵以
  `docs/prds/A8_00_PRODUCT_ARCHITECTURE_AND_DATA_CONTRACT.md` 为冻结合同；变更上述合同必须新增 ADR
  并重开 A8-00 Gate。
- 后果：A8-01 可以在不改变审计事实或提前实现写入的前提下构建对话主界面，A8-03/A8-05 也拥有可测试
  的准备区和迁移目标。代价是投影必须维护来源 seq/指纹，Session/Review 状态需与事件原子提交，A7
  凭据需要用户在 A8 重新确认；A8-00 通过只授权进入 A8-01，不构成任何开发机、Win10、Win7 或 RC PASS。

## ADR-0076 A8-02 采用存储中立会话目录与精确只读产品 IPC

- 状态：Accepted（2026-08-20，A8-02 串行实现 Gate）
- 背景：A8-00 已冻结 Session/Thread/Turn/Task/Run、Goal 与上下文引用合同，但 A7 Desktop Host 使用
  自增派生 ID、关闭即删除的进程内 Map，也没有 Goal、上下文引用或 Renderer 可用的只读代码视图。
  若在 A8-02 直接扩展通用 Shell IPC 或提前绑定 SQLite，会分别越过 C14 路径白名单和 A8-05 的恢复/
  迁移 Gate；若把文件读取放进 Renderer，则违反 C17。
- 决策：（1）State 增加 schema version 1 的存储中立 A8 Session catalog：全局随机 UUID、一个 Session
  一个 Thread、递增 Turn ordinal、归档不删除、单个 Goal 的 ACTIVE/ACHIEVED/ABANDONED 修订，以及
  追加事实和严格版本/序列/reference 校验的 snapshot/restore seam。（2）Goal 的下一状态和
  `goal.updated` 事实在全部输入与 revision 校验后一起提交；冲突不产生任何变更。（3）Desktop Host
  继续持有运行期 Task/Runner/审批对象，并在任何 Turn/Task/Run 创建前执行产品级单活动任务锁；任务
  运行时允许查看其他会话但不排队。（4）新增产品专用 `product:a8-request`，只允许 session.get、
  goal.set/resolve、workspace.list/read，逐 action 使用拒绝额外字段的精确校验并复核 Renderer sender。
  Renderer 仍无 Node/fs。（5）文件、目录和文本上下文按轮最多 24 项/64 KiB，文件最多 500 行；主进程
  重新读取相对路径并记录范围与内容 SHA-256，不信任 Renderer 自报哈希。（6）Win7 v1 没有长路径
  Runtime Profile，达到 MAX_PATH 即结构化拒绝；Workspace 的 canonical/reparse 边界继续 fail-closed。
- 后果：A8-02 可以验证多会话、Goal、上下文和只读代码查看器，而不扩大 Renderer 权限或提前宣称
  生产持久化。代价是 A8-02 的 snapshot 只证明投影可恢复；A8-05 仍必须把同一逻辑纳入 SQLite 原子
  transaction、损坏隔离、启动恢复和迁移实测，之后才能承诺重启后的完整会话恢复。

## ADR-0077 A8-03 以结构化 Review tool 进入私有 staging，Apply 继续由精确审批控制

- 状态：Accepted（2026-08-20，A8-03 实现阶段；不代表 A8-03 Gate PASS）
- 背景：A8-00 已冻结“Agent 只能写私有准备区、用户逐文件决定、一次性 Apply”的边界。若继续让
  `submitTask` 直接调用 Host 准备区，Agent/Replay 的工具事实会与 Review 事实脱节；若把 staging
  工具声明成普通工作区写入，又会把尚未进入正式工作区的私有字节误计为已批准写入。
- 决策：（1）Core 增加独立的 `workspace.review_prepare` ToolSpec，使用结构化 JSON/base64 提案，
  `READ_ONLY` 审批级别和现有 `workspace.read` capability；它只把有界提案交给可信 Product Host，
  不获得 `workspace.str_replace` 或任意文件写入能力。Policy 工具白名单显式登记该名称，Replay 与
  受控 Gateway 均只能通过注册的 ToolSpec 调用。（2）Host 在每个 session/task 的私有 staging 根中
  创建 content-addressed blobs，重新验证相对路径、reparse 边界、before bytes、编码/EOL、敏感值和
  三个摘要 hash；Renderer 只能经 `product:a8-request` 的 Review action 读取/决定/审批/Apply，
  不获得 fs、process、credential 或 arbitrary network 权限。（3）Apply 前必须完成全部决定并消费一次性
  `session/task/review/revision/workspaceBase/preview/acceptedSet/subject/expiry` 精确绑定；漂移返回
  `STALE` 且零写入，故障回滚不确定返回 `RECOVERY_REQUIRED` 并锁定。（4）ValidationRun 记录
  `previewHash`、revision、validated-set hash、profile/argv 摘要和 PASS/FAIL/CANCELLED/NOT_RUN；
  没有经 C15/C16 登记的真实项目 Profile 时只记录 `NOT_RUN`，模型文本不能创建 PASS。新依赖、Runner
  Profile、网络目标和 A8-04/A8-05 能力均不在本 ADR 授权内。
- 后果：Agent/Replay 的准备事实与 UI Review 事件形成同一条可审计链，同时正式工作区仍只有在
  精确审批后才会发生副作用；代价是当前产品只能以 Replay/注入提案演示闭环，真实项目验证、Renderer
  自动化、Win10/Win7 和 A8-03 Gate 仍需独立验收，不能由本 ADR 或开发机测试替代。

## ADR-0078 A8-03 终态清理、身份绑定与 Review 事件脱敏

- 状态：Accepted（2026-08-21，A8-03 实现收口；不代表 A8-03 Gate PASS）
- 背景：A8-00/ADR-0077 要求私有 blob 不在 Review 终态长期残留、审批必须绑定完整任务身份，且
  `workspace.review_prepare` 的 base64 提案不能进入事件事实。此前实现虽在 Host 扫描已知凭据，仍可能
  在 Runtime 原始 `tool.request/model.plan/approval.requested` 事件中保留提案正文；全部拒绝也需要通过
  一个被 UI 禁用的 Apply 路径才能结束任务。
- 决策：（1）`ReviewApprovalBindingV1` 与 Apply request 明确包含 `sessionId + taskId`，Ledger 校验两者并
  在 revision/validation 变化时撤销旧审批；（2）最后一个文件被拒绝后 Review 立即进入 `REJECTED`，
  Host 发出 `task.completed`，并清理 blobs/transactions；成功 `APPLIED` 同样清理私有字节，ReviewSet
  只保留哈希、决定和状态事实；（3）State RuntimeEvent 适配器对所有嵌套的
  `workspace.review_prepare` 调用替换 `proposalsJson` 为有界摘要（数量/字节数/脱敏标记），覆盖工具、
  模型计划和审批事实，避免可逆 base64 内容进入 V2 ledger 或 Renderer 投影；（4）非完整 accepted-set
  的验证结果标记 `stale` 并保留未验证项；记录新 ValidationRun 会撤销先前 Apply approval，要求重新审批。
- 后果：终态和事件边界符合 A8C-01/A8R-02/A8R-03/A8R-07 的 fail-closed 语义；跨重启持久化、真实
  Runner、Electron/Chromium、Win10/Win7/RC 验收仍不在本 ADR 范围内，不能据此签发 A8-03 Gate。

## ADR-0079 A8 采用版本化 System Prompt V1 描述私有 Review staging

- 状态：Accepted（2026-08-21，A8-03 真实 Gateway/Provider 行为收口）
- 背景：A3 遗留 Gateway 提示词把模型固定描述为纯只读 Agent，并要求永不请求任何写能力；A8-03
  已通过 ADR-0077 授权 `workspace.review_prepare` 把有界多文件提案写入 A8 私有 staging。该工具不写
  正式工作区，仍使用 READ_ONLY ToolSpec，但旧提示词会让真实模型把合法 Review 路径误判为禁止能力。
  Replay 可以绕过这类模型语义冲突，因此不能作为真实 Provider 行为证据。
- 决策：（1）冻结 `docs/prds/A8_03_SYSTEM_PROMPT_CONTRACT.md` 的
  `a8-system-prompt-v1`；提示词只允许使用请求中实际提供的 ToolSpec，并明确区分私有 Review staging
  与正式工作区写入。（2）当 `workspace.review_prepare` 实际出现在工具集合时，提示词允许模型生成
  有界 CREATE/MODIFY/DELETE 提案，但明确要求逐文件决定和一次性 Apply 审批，模型不能自行接受、批准
  或应用。（3）模型不能把文字、推测或 Replay 声明为测试 PASS；只有可信 Runner/远程验证适配器事实
  可以形成 PASS。（4）进程、Terminal、任意 Shell、Git 写操作、任意网络、凭据和未提供能力继续禁止。
  （5）主进程对固定 UTF-8 提示词计算 SHA-256，并随版本供测试、诊断和验收绑定；安全语义变化必须提升
  版本并新增 ADR。（6）ToolSpec、Policy、Broker、Host、IPC、审批与审计仍是唯一赋权边界，提示词不
  产生 capability，也不放宽 A8-00 的状态、数据格式或安全合同，因此无需重开 A8-00 Gate。
- 后果：真实 Provider 能在不获得正式工作区写能力的前提下使用 A8 Review 工具，且提示词字节可追踪；
  代价是后续 Prompt 修改必须显式版本化并重跑 Provider 行为测试。真实模型/内网 Provider、Electron、
  Win10 和 Win7 证据仍须单独执行，本 ADR 本身不签发 A8-03 Gate。

## ADR-0080 A8-03 对 Review 验证证据执行敏感值 fail-closed 清理

- 状态：Accepted（2026-08-21，A8-03 安全负向矩阵收口；不代表 A8-03 Gate PASS）
- 背景：ADR-0078 已覆盖提案正文脱敏、终态 blob 清理和审批身份绑定，但验证摘要/来源也是 Review
  的持久化证据通道；若已知 API key、代理密码或 DPAPI 载入值意外出现在其中，单纯返回错误会留下
  私有 blob、旧审批或仍活动的任务，无法证明后续 Apply 不会消费半清理状态。另有风险是 Renderer
  伪造 `taskId` 把 Review action 绑定到非 Review 场景任务。
- 决策：（1）Desktop Host 在创建 Review 时同时扫描已配置 Gateway provider 与 Windows DPAPI
  credential vault 当前可见的已知值；验证 summary/source 命中时，Workspace staging 撤销全部审批、
  清理 blobs/transactions、将 Review 置为 `FAILED` 并拒绝后续 Apply。（2）Host 只发出不含原值的
  `review.security_blocked` 与 `task.failed` 事件，释放单活动任务锁；Renderer 收到安全事件先刷新
  Review 失败事实，再由终态事件结束任务。（3）所有 Review action 必须绑定 `scenario === 'review'`
  的 Task；非 Review Task 直接返回结构化 `REVIEW_TASK_REQUIRED`，不创建 staging 或写入事实。
  （4）DPAPI 值只在进程内作为 tainted scanner 输入使用，绝不进入事件、Review DTO、日志或报告。
- 后果：已知敏感值命中和跨场景伪造均 fail-closed，Review 不会以“错误已返回”掩盖残留状态；代价是
  用户需要重新提交一笔 Review 任务。未知秘密识别、完整持久化恢复、真实 Runner、Electron/IPC、
  Win10/Win7/RC 验收仍不在本 ADR 范围内。

## ADR-0081 A8-03 Renderer 按 Task 边界重建事件队列并刷新恢复动作

- 状态：Accepted（2026-08-21，A8-03 真实 Electron Review 收口）
- 背景：产品事件序列在每个 Task 内从 1 开始。真实 Electron 逐任务 Review 旅程发现，上一任务终态后
  新 `task.accepted` 若沿用旧 Renderer 队列会被误判为 `out_of_order`；另外 `review.apply_failed` 先于
  `task.failed` 到达时，恢复按钮会在任务仍运行期间被禁用，终态事件若只切换运行标记则不会重新计算按钮状态。
- 决策：（1）Renderer 在队列入列前只接受“旧任务已终态 + 新 Task 的 `task.accepted`”作为队列重建边界，
  其余跨 Task 事件继续拒绝；（2）`task.accepted` 是权威活动任务事实，负责恢复 `taskRunning` 和当前
  session 绑定；（3）`task.failed` 清除运行标记后，若当前 Review 为 `RECOVERY_REQUIRED`，重新渲染 Review
  控件，让恢复动作按终态可用；（4）不改变 Event Envelope、Task 标识、审批绑定或 Host 权限，仍由
  Preload/IPC/Policy/审批执行所有副作用校验。
- 后果：同一会话的连续 Review 任务不会被旧序列污染，回滚不确定时用户能看到且只能显式执行恢复；新增
  Renderer contract 与真实 Electron 8-case 证据覆盖上述边界。该 ADR 不扩大 Terminal、Runner、网络或
  持久化授权，也不构成 Win10/Win7/RC PASS。

## ADR-0082 A8-04 以边界状态优先交付 Terminal/Browser 与诊断入口

- 状态：Accepted（2026-08-21，A8-04 开始实现）
- 背景：A8 产品合同要求显示 `Agent / Review / Terminal / Browser` 与 `Settings / Diagnostics`，但旧
  winpty 结论仍为 `NO_GO`，且 Electron 22 不能作为任意不可信网页的安全边界。若为了“看起来可用”放开
  交互输入或远程导航，会直接违反 C17/C19，并把未验证能力误报为 MVP。
- 决策：（1）A8-04 先冻结 `docs/prds/A8_04_TERMINAL_BROWSER_BOUNDARY_CONTRACT.md`，Terminal 与
  Browser 通过真实 Renderer 明确 disabled/fail-closed 状态；（2）Runner 只复用已登记低风险非交互
  Profile，结果经有界日志/ANSI 与危险链接清理，不新增命令面；（3）Settings/Diagnostics 继续由精确
  IPC、CSP、Policy 与敏感值扫描保护，凭据只显示保存元数据；（4）任何新 Terminal Profile、远程网页、
  网络目标或第三方依赖必须另有 C15/C16 评审和负责人授权，不能借 A8-04 合同隐式启用。
- 后果：A8-04 可在当前环境完成产品边界与负向证据，真实用户不会误以为 Terminal/Browser 已经安全可用；
  代价是两项能力在新 Profile/Win7 证据前保持 disabled，A8-05/A8-06 仍需独立 Gate。

## ADR-0083 A8-05 以 SQLite 结构化实体和 fail-closed 恢复接入 A8 Session catalog

- 状态：Accepted（2026-08-21，A8-05 开发实现开始）
- 背景：A8-02 的 `A8SessionCatalog` 只提供 storage-neutral snapshot/restore，Desktop Host 当前仍以进程内
  Map 保存 Session、Goal、Task 和 Review；A7 的 SQLite EventLedger 只证明事件事实可重开，不能证明完整
  产品实体、Review 决定和迁移状态可恢复。若直接把整个 Map 写成无 schema JSON，字段约束、外键、Goal revision
  和损坏隔离都会失去可测试边界；若在启动时跳过坏会话，又会违反 A8-00 的整体只读恢复要求。
- 决策：（1）新增 `A8PersistentCatalog` 使用已经通过 D-014 检查的 `SqliteDatabase`，在同一数据库中创建
  `a8_schema_migrations`、`a8_workspaces`、`a8_sessions`、`a8_goals`、`a8_turns`、`a8_tasks`、`a8_runs`、
  `a8_session_facts`、Review/Validation 和迁移表；Session/Goal/Turn/Task/Run 的权威字段使用结构化列，
  仅对受限 Review/Validation 细节使用带 schema、大小上限和 SHA-256 的 JSON 摘要。（2）catalog mutation
  先在内存构造/验证下一 snapshot，再通过单个 SQLite transaction 替换结构化实体和事实；失败时恢复旧
  snapshot，禁止实体与事实分裂。（3）启动 `A8RecoveryCoordinator` 校验版本、marker、引用、snapshot/hash
  与活动 Task 状态；未知版本、损坏、seq gap 或 hash drift 整体返回 `READ_ONLY_RECOVERY_REQUIRED`，活动
  Task 只可原子标记 `INTERRUPTED`，不自动调用模型、Runner、Terminal、Browser 或 Apply。（4）迁移只读打开
  A7 source，工作区/非敏感设置按显式 schema 白名单导入；凭据、旧 Session 推测、WAL/SHM、临时与 Runner
  work 永不读取，采用独立锁、临时目录、fsync、原子 rename、marker/report，失败保留 A7 原样并允许重试。
  详细字段与 A8P/A8M 口径冻结在 `docs/prds/A8_05_PERSISTENCE_RECOVERY_MIGRATION_CONTRACT.md`。
- 后果：A8-05 可以在开发机用结构化 fake SQLite 和真实 D-014 接口验证重启/损坏/迁移负向，而不伪造 Win7
  SQLite 工件 PASS；代价是持久化接入必须等待 A8-05 Gate，旧 in-memory fallback 只能作为未启用持久化的
  开发机诊断状态，Electron 22/Win10/Win7 和 A8-06 三层产品验收仍需同一候选执行。

## ADR-0084 A8-06 以输入哈希闭包和确定性 ZIP 形成独立 A8 候选

- 状态：Accepted（2026-08-21，A8-06 打包与验收准备开始）
- 背景：A8-03～A8-05 的源码和开发机证据已在 dirty worktree 中形成，但 Electron 22、D-013 helper、D-014
  native binding 和 Win10/Win7 环境当前不可用。直接复制 A7 release builder 或复用 A7 ZIP 会把旧
  `0.1.0-rc.1` 的 PASS 误继承到 A8；无输入时生成“看起来完整”的 package 又会隐藏运行时闭包缺口。
- 决策：（1）冻结 `docs/prds/A8_06_DETERMINISTIC_PACKAGE_AND_VALIDATION_CONTRACT.md` 与独立
  `release/win7-product-v2/a8-06-input-lock.json`，构建器只接受精确 Electron 22.3.27/ABI 110、D-013
  v24、D-014 8.7.0/SQLite 3.43.1 输入；缺失或哈希不一致在写候选前 fail-closed。（2）候选输出使用独立
  `0.2.0-alpha.1` 目录和新 release ID，应用 JS、native 外置布局、`rc-runtime.json`、manifest、SBOM、
  许可证、ZIP sidecar 和验证包全部由源字节确定性生成，重复构建必须 byte-identical。（3）manifest
  初始只允许 `developer_package_integrity: PASS`，产品装配、Win10、Win7、RC 在真实执行前保持
  `NOT_PERFORMED`；禁止打开 A7 DB、修改网络/服务/PATH/注册表或下载依赖。（4）A8-06 证据模板必须包含
  A8-03/A8-04/A8-05 锁定命令、双向 SHA-256、生命周期故障回收和 `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE`
  枚举，不能用 harness 或静态截图代替用户旅程。
- 后果：当前环境仍可完成 builder 设计、fixture 重复性、输入负向和验证包准备而不伪造 Win7 PASS；
  真实输入工件或目标环境缺失时只能停止在 `VALIDATION_READY`，待负责人提供同一锁定候选和外部执行后再
  解除 A8_RC 门禁。

## ADR-0085 A8-06 外部证据以 Electron ABI、完整 manifest 和候选外目录三重绑定

- 状态：Accepted（2026-08-21，A8-06 复核缺陷修复）
- 背景：复核发现首版 A8-06 验证包用普通 Node 16.17.1 加载为 Electron ABI 110 构建的 D-014
  `better_sqlite3.node`，该入口会在到达 SQLite 检查前因 ABI 不匹配失败；A8-03/A8-04 报告也未实现验证包
  声明的统一字段，三份报告只使用调用者提供的标签而没有共同绑定 `release-manifest.json`。此外首版命令把
  报告写入 manifest 保护的候选目录，使“同一不可变候选”在执行验证后不再成立。上述均是 A8K-04 的本地
  交付缺陷，不能记为外部环境不可用。
- 决策：（1）D-014 只由包内 `electron.exe` 在 `ELECTRON_RUN_AS_NODE=1`、`NODE_OPTIONS` 清空的子进程中
  加载；正式报告必须证明 Electron 22.3.27、Node 16.17.1、ABI 110、Win32 x64。（2）A8-03/A8-04/A8-05
  报告统一使用 evidence schema v2，必含 `candidate_id`、`candidate_manifest_sha256`、运行时、操作者、回收和
  外部层状态；验证前逐文件复算 manifest 全树，缺失、改变、额外文件或错误 Electron 路径均 fail-closed。
  （3）报告和截图只能写入候选的兄弟 evidence 目录；`verify-a8-evidence-set.mjs` 必须确认三份报告的候选
  ID、manifest SHA-256、目标层和 required cases 完全一致。（4）`source_dirty: true` 的包继续允许开发机
  fixture/smoke，但设置 `external_acceptance_eligible: false`，正式 Win10/Win7 工具在启动产品前拒绝；生成
  `out/` 本身由 A8 目录内 `.gitignore` 排除，不污染后续干净源码检查。
- 后果：A8K-04 只能在 ABI、证据格式、manifest 和候选不可变性同时成立时签发；首版 dirty 候选及其
  `VALIDATION_READY` 记录被后续修复检查点取代，不能进入正式外部评分。修复不改变产品权限、D-014 二进制、
  A7 只读 RC 或 Win10/Win7 的 `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE` 状态。

## ADR-0086 A8 构建后状态证据与不可变候选分离

- 状态：Accepted（2026-08-21，A8-06 候选证据闭包补充）
- 背景：`a8-agent-first-product-latest.json` 和构建后验收报告需要记录最终 ZIP/manifest 哈希。如果把这些文件
  同时复制进受 manifest 保护的候选，它们只能记录构建前状态；回填最终哈希又会改变 manifest，形成自引用，
  也会使候选在生成完成时立即携带过期状态。
- 决策：A8 候选只携带签发前已冻结的合同、阶段检查点和可执行验证工具。需要回填最终候选哈希的 current
  status、构建后验收报告及外部执行产物必须写在候选目录外，并通过 `candidate_id +
  candidate_manifest_sha256` 绑定。构建器明确排除 `a8-agent-first-product-latest.json`；包测试必须防止回归。
- 后果：候选字节和 manifest 保持不可变且无自引用；仓库中的 current status 可以在构建后如实签发，不会
  改变已锁定候选。外部验收仍只能针对同一 manifest 哈希进行，不能因证据位于包外而跳过完整树校验。

## ADR-0087 A8 验证套件全面采用包内 Electron 22.3.27 Node 模式消除外部 Node 依赖

- 状态：Accepted（2026-08-21，A8-06 验证宿主自包含改造）
- 背景：首版 A8-06 验证套件在 `A8_06_VALIDATION_KIT.json` 与运行指令中假设目标环境已在 PATH 安装 `node.exe`（`where node`、`node validation\...`）。在干净 Windows 7 SP1 x64 或 Windows 10 验证机上，未安装外部 Node.js 时将无法直接运行验证套件，违反了 C13（不得假设未声明工具）与 C07/C12（离线自包含交付）约束。
- 决策：（1）验证套件（`preflight`、`a8_03`、`a8_04`、`a8_05`、`verify_set`）全面改用包内 `electron.exe` 以 Node 模式（`set ELECTRON_RUN_AS_NODE=1&& .\electron.exe`）作为脚本执行宿主，彻底消除外部 `node.exe` 依赖。（2）`preflight` 命令移除 `where node` 与 `node --version`，改为通过 `set ELECTRON_RUN_AS_NODE=1&& .\electron.exe -v` 探测运行时，并校验 `electron.exe`、`release-manifest.json` 与 `better_sqlite3.node` 的 SHA-256。（3）A8-03 与 A8-04 真实 Electron 界面 Smoke 脚本在拉起子 Electron 界面进程前显式清除子环境中的 `ELECTRON_RUN_AS_NODE`，确保 GUI 窗口与 IPC 正常初始化。（4）增补“无系统 Node 仍可执行验证套件”的自动化合同测试，锁定命令前缀、环境净化与模块闭包。
- 后果：目标机在无系统 Node 的干净环境下解压即可完整执行三层验收命令集；不引入新的外部依赖或提权操作，保持 A8 候选包自包含与不可变性。

## ADR-0088 A8 候选完整性校验使用 Electron 物理文件系统视图

- 状态：Accepted（2026-08-21，Win10 A8-03 现场假阴性修复）
- 背景：候选 `5b24fe7e…ae6e` 在 Win10 19045 完成 ZIP、manifest、Electron 与 native binding 预检后，
  A8-03 在绑定候选时误报 `resources/default_app.asar` 缺失。现场以 `certutil` 复算的物理文件大小和
  SHA-256 均与 manifest 一致；根因是 ADR-0087 引入的 Electron Node-mode 宿主会让普通 `node:fs` 通过
  ASAR 虚拟文件系统观察 `.asar`，将物理归档文件报告为目录。
- 决策：（1）候选 manifest、payload 哈希和完整目录树只能通过 Electron 内建 `original-fs` 的物理视图读取；
  非 Electron 开发机测试继续使用 `node:fs`。（2）Electron 环境无法取得具备 `existsSync`、`statSync`、
  `readFileSync`、`readdirSync` 的 `original-fs` 时以 `A8_PHYSICAL_FILESYSTEM_UNAVAILABLE` fail-closed，禁止
  回退到 ASAR 感知视图或用 `certutil` 手工结果绕过正式入口。（3）回归测试必须包含 manifest 内物理
  `resources/default_app.asar`、Electron 选择物理接口、接口缺失拒绝和打包后验证模块合同。
- 后果：候选完整性验证仍复算 manifest 全树，但不会把合法物理 ASAR 当成缺失文件；产品运行时的 ASAR
  行为、Policy、Broker、IPC 与审批边界均不改变。旧候选的 Win10 A8-03 保持 FAIL，后续项保持 NOT_RUN；
  只有包含本裁决并从远端可达干净源码提交重建的新候选才可重新进入外部验收。

## ADR-0089 A9 采用可信环境 Full Access 与通用 Shell，现实可用性优先

- 状态：Accepted（2026-08-22，项目负责人完成 GrillMe Q1～Q179 并确认全部产品决策）
- 背景：A8 已建立对话、会话、上下文、Review、SQLite 恢复、DPAPI 和确定性打包基线，但其产品合同继续
  禁止 Full Access、任意 Shell、直接工作区写入、真实 Git 工作流和开放 OpenAI-compatible Provider。
  这些限制来自“Win7 无现代强沙箱，所以本地能力必须默认拒绝”的安全优先模型。项目负责人明确目标不是
  在 Win7 上虚构强安全边界，而是在用户自行选择可信工作区、账号和网络环境的前提下，快速交付可以阅读、
  编写、管理文件、运行项目命令、测试和 Git 的现实 Coding Agent。继续在 A8 上叠加例外会同时违反
  A8 任务书、C09/C20 和 Review-first 数据合同，且会让大多数正常开发任务保持不可用。
- 决策：（1）建立 A9 Trusted Agent Runtime，版本 `0.3.0-alpha.1`，分支
  `codex/a9-trusted-agent-runtime`，需求合同为
  `docs/prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md`，实现授权为
  `docs/tasks/A9_TRUSTED_AGENT_RUNTIME.md`；A8 冻结为历史 Review-first 产品线，不继续投入旧产品形态的
  功能开发，也不继承其未完成的 Win10/Win7/RC 结论。（2）权限模式改为 Full Access、Review、Read Only；
  可信工作区推荐 Full Access，使用当前 Windows 用户权限，允许直接文件写入、工作区外显式路径、项目依赖、
  真实 Git 配置和本地网络能力；不自动提权。外部写、破坏性 Git、永久/批量删除和系统级操作继续要求绑定
  可见目标的一次性确认，但该策略是防误操作行为边界，不宣称 Shell 级强隔离。（3）为 A9 局部取代 C09：
  模型可调用 `shell` 提交完整 PowerShell/CMD 命令字符串、管道、重定向和项目脚本；所有执行仍必须经过
  TrustedShellRunner、IPC Schema、审计、输出上限、取消和进程生命周期管理，Renderer/业务 UI 不能直接
  `child_process`。（4）Shell 自动选择工作区覆盖 → PowerShell 5.1 → CMD；WMF 5.1 推荐但不是硬前置，
  PowerShell 2～4 Best Effort，Git Bash 仅用户可选。普通 Shell 调用关闭 stdin 且每次独立进程；支持有界
  托管后台开发进程。（5）为 A9 局部取代 C08 的固定硬超时要求：普通命令可以没有任意短硬 deadline，但必须
  有软时长提示、可取消、输出上限、进程树终止和残留状态；任务或用户仍可设置 deadline。（6）为 A9 局部
  取代 C20/ADR-0032：结构化 Git Adapter 继续服务状态、Diff 和历史展示，Trusted Full Access 允许 Shell
  使用真实 Git、hooks、filters、helpers 和用户凭据环境；push/force push/远端删除始终确认。（7）Provider
  首版统一为任意 Base URL 的 OpenAI-compatible Chat Completions + SSE + 原生 tool calls；正式 UI 默认真实
  Provider，Replay 只留测试；API Key 继续 DPAPI/内存保存。（8）Full Access 直接写工作区并建立每轮 checkpoint、
  Diff 与撤销；Review 继续复用 A8 staging，Read Only 继续拒绝写入。Shell/外部程序造成的文件变化也进入轮前/
  轮后审计。（9）Electron Renderer 隔离、窄 IPC、凭据脱敏、TLS 默认验证、原子写入、SQLite 版本化、取消、
  输出控制、进程清理和 Win7 实机证据继续保留；不得把“可用性优先”写成“无审计、无恢复或无边界”。
  （10）Office 专用能力、内置 IDE/LSP、交互终端、Browser 自动化、多 Agent、插件市场和自动更新不进入
  A9 Alpha 1；首先完成五条真实 Coding Agent 旅程。
- 后果：A9 可以覆盖真实开发项目依赖的 Shell、Git 和直接编辑能力，不再因 Win7 缺乏现代沙箱而把产品锁成
  只读/Review 控制台。代价是 Full Access 与 Shell 拥有当前用户的真实副作用，Git hooks、项目脚本、网络和
  仓库内容不再被强隔离；产品必须在首次启用时如实告知，并依赖用户选择可信环境、checkpoint/撤销、审计和
  外部操作确认降低误操作风险。Phase 1/2、A7、A8 与其历史候选继续按旧合同解释，本 ADR 不追溯改写其证据。

## ADR-0090 A9 工作区权限模式存储键绑定 canonical 路径哈希

- 状态：Accepted（2026-08-22，A9 R1 修复轮）
- 背景：v1 模式设置以 `path.basename(workspaceRoot)` 作为文件键，两个绝对路径不同、末级目录同名的工作区
  （如 `/one/project` 与 `/two/project`）会共用 `workspace-modes/project.v1.json`，第二个工作区首次打开即静默
  继承第一个工作区的 `full_access`，违反 A9-M01“首次打开必须显式选择”与 fail-closed 原则。
- 决策：（1）v2 存储键为 canonical absolute workspace path 的 SHA-256（`ws-<hex>.json`），canonical 合同为：
  统一分隔符（win32 反斜杠/其他正斜杠）、绝对化、去末尾分隔符（保留根）、win32 盘符小写且整路径大小写不敏感
  （含 UNC），POSIX 大小写敏感。（2）文档 v2 含 canonical `workspaceRoot`、`permissionMode`、`selectedAt` 与
  有界 `auditTrail`；加载时验证文档工作区与当前工作区一致，不一致返回 `workspace_mismatch` 的
  `needs_selection`，绝不读取其模式值。（3）v1 basename 文档仅在内部 `workspaceRoot` 与当前工作区精确匹配时
  迁移到 v2 键；不匹配、损坏、未知 schema 一律 `needs_selection`，不默认 Full Access。（4）SQLite 侧的
  `a9_workspaces` 同步改用 canonical 路径作主键。（5）模式切换写入 JSON `auditTrail` 与 SQLite 事件双审计。
- 后果：同名目录工作区彻底隔离；Windows 长路径/非法字符不再影响文件名；旧数据只能通过精确匹配迁移，
  其余进入显式选择流程。POSIX 开发机上大小写不同的路径是不同工作区（与平台语义一致）。

## ADR-0091 A9 审批使用不可变绑定对象并在 IPC v2 携带摘要

- 状态：Accepted（2026-08-22，A9 R2 修复轮）
- 背景：NEEDS_APPROVAL 只向产品层暴露 boolean 恢复接口，SQLite `a9_approvals` 在恢复执行后才补记
  `tool_name="unknown"`、`binding_json={}`；无法证明审批与实际执行目标一致，也无法表达“参数变化后旧审批失效”。
- 决策：（1）Core 在 NEEDS_APPROVAL 时构造不可变 `A9ApprovalRequest`：`approvalId`（turn+call+digest 短哈希）、
  `turnId`、`callId`、`toolName`、canonical args、人类可读 `summary`、`bindingDigest`
  （sha256(callId+toolName+canonicalArgs+summary)，别名规范化与默认值填充后计算）、shell 为 git 操作时的
  remote/branch/force/deleteTarget/commandSha256 绑定。（2）`onApprovalPending` 钩子在等待用户前把 pending
  审批持久化；SQLite 记录一律来自该原始 pending 对象。（3）恢复接口改为
  `{ approvalId, decision, bindingDigest }`（IPC `a9.turn.resumeApproval`，schema v2）；Core 在消费前用与挂起时
  相同的规范化管道重算摘要并比对，同时校验 `approvalId`；通过后先清空挂起再执行（一次性消费，重复/伪造/
  跨 Turn 一律结构化拒绝）。（4）turnId 增加进程内序号保证跨 Turn 唯一。
- 后果：审批记录可审计到确切目标；目标、参数或摘要变化即失效；Renderer 旧 boolean 协议不再可用（IPC 未发布，
  无兼容负担）。拒绝路径保持零副作用并已记录真实目标。

## ADR-0092 Shell 与外部工具的工作区变化进入同一 Checkpoint 与诚实验证语义

- 状态：Accepted（2026-08-22，A9 R3 修复轮）
- 背景：Shell 执行（如 `printf changed > via-shell.txt`）真实修改工作区后，getDiff(turnId) 为空、
  undoTurn 报未找到 Checkpoint、Turn 被标 completed/not_applicable；同时任何 shell 成功（含 `echo`）
  都可能把未验证的修改标成 verified。
- 决策：（1）A9AgentLoop 通过 A9ExternalChangePort（由 A9WorkspaceService 实现）在本轮第一个潜在副作用
  工具前冻结有界内容基线（遵循 ignore；文件数 2000/单文件 2 MiB/总量 40 MiB 上限），并在每次 shell 执行后
  （成功、失败、取消或 residueRisk）扫描轮前/轮后变化：created → undo 删除；modified/deleted（有基线 blob）→
  恢复原内容；同哈希 delete+create 对识别为 rename；超限、备份失败、无基线的目标显式写入
  `unrecoverable` 清单，不静默遗漏。（2）外部变化与工具写入共用同一 checkpoint 记录（schema v3 增加
  `unrecoverable`，v2 可读兼容），Diff、undo、SQLite 事实与 UI 使用同一份记录；外部变化同时使既有验证
  失效并计为副作用。（3）收集不携带用户取消信号——取消后仍必须如实记录已发生的变化。（4）诚实验证语义：
  `isNonVerifyingCommand` 将纯输出/查看类命令（echo/printf/ls/cat/type 等，且不含 node/python/npm/jest/
  git 等运行器）排除在验证证据之外；只有验证候选命令成功（exitCode 0）且发生在最后一次源码修改之后才
  标记 verified；验证后再次修改（工具或外部）即回到 unverified。
- 后果：Shell/Git/项目脚本造成的文件变化全部可审计、可恢复（或显式标记不可恢复）；`echo tests passed`
  不再能把代码修改标成已验证。基线冻结有界，大仓库按上限截断并显式标记。

## ADR-0093 A9 Provider 非秘密配置版本化持久化与 DPAPI 秘密分离

- 状态：Accepted（2026-08-22，A9 R4 修复轮）
- 背景：A9 Provider 配置与 API Key 只存于进程内存，重启后 provider.configured=false；
  产品路径未接既有 DPAPI credential-vault；切换模型直接丢弃 loop 会话。
- 决策：（1）非秘密配置（baseUrl、模型 ID、自定义 Header 名、CA 路径、代理主机/端口/协议/用户名、
  allowInsecureTLS、keyRemembered、probe 结论）持久化为 `a9-provider-config.v1.json`
  （schemaVersion=1，临时文件+原子替换；损坏/未知 schema fail-closed 进入诊断，不覆盖）。
  （2）秘密一律不进该文件：API Key 经 `a9-vault-apikey`、Header 值与代理密码合并经
  `a9-vault-secrets`，两者都是既有 createDpapiCredentialVault 实例（Electron safeStorage /
  Windows DPAPI Current User）；DPAPI 不可用时降级仅内存并在快照如实显示未记住。
  （3）vault 支持 platform 注入仅供开发/测试以 fake safeStorage 验证 DPAPI 成功/失败/损坏/账户
  不匹配合同，不得据此宣称真实 Windows DPAPI PASS；密文损坏 fail-closed 保留诊断证据不删除。
  （4）保存配置时用短超时专用 Provider 实例执行最小真实 Tool Calling probe，分类
  tool_calling/chat_only/unavailable 并持久化与审计；unavailable/chat_only 拒绝 Agent Turn，
  无可靠 tool_calls 只标聊天能力，不自动回退 Replay。（5）模型切换时保留 loop 会话历史并
  restoreConversationHistory 重建，不丢已完成工具结果；API Key/Authorization/代理密码经
  redactSecrets 不进入事件、日志、快照或错误文本。
- 后果：Provider 配置跨重启恢复且密钥永不明文落盘；探针结论与密钥记忆状态可审计；
  本机（非 Windows）证据为注入式 fake DPAPI 合同验证。

## ADR-0094 A9 SQLite Schema v3 保存真实 failed Turn 并统一提交/审批恢复终态

- 状态：Accepted（2026-08-23，A9 F5/F6 缺陷修复轮）
- 背景：A9 Schema v2 的 `a9_turns.status` CHECK 不允许 `failed`，Provider 或运行时失败只能被错误映射为
  `blocked`，或在写终态时触发约束错误并留下 active 行。`submitTurn` 与 `resumeApproval` 还使用不同的状态
  收尾路径：首次审批后的第二次审批可能被清空，checkpoint 未覆盖每次恢复结果，旧审批错误退化为通用
  Desktop 错误。正常关闭后的重启证据若只检查 interruptions 是数组，也会把伪中断漏过。
- 决策：（1）`A9_SCHEMA_VERSION` 升为 3，Turn 状态增加真实 `failed`。打开 v1/v2 数据库时先在 dataRoot
  写迁移前备份，再在单个 SQLite transaction 内重建 `a9_turns` CHECK、复制全部行并恢复该表已有显式索引；
  任一步失败全部回滚并进入 diagnostics，未知未来版本继续拒绝覆盖。（2）`submitTurn` 与
  `resumeApproval` 共用唯一结果持久化汇点，同步 task/turn/run、agentStatus、当前审批和 checkpoint；
  `needs_approval` 保持同一组实体 active 并保存返回的最新审批，只有非审批终态才清空。连续审批、批准和
  拒绝始终复用同一 task/turn/run。（3）每次 submit/resume 结果覆盖 checkpoint，payload
  `schemaVersion=1`，保存 outcome、verification、工具计数、外部变化和最小 pending 审批事实；旧 payload
  仍可读取但不得自动重放。（4）Provider 初始化、请求或审批恢复期间的 Provider 失败落真实 `failed`
  task/turn/run；用户取消保持 `cancelled`。输入校验或已消费/未知审批返回精确结构化错误且不得终止当前合法
  pending 状态。（5）开发机 Electron 重启证据必须断言 `interruptions.length === 0`；真实 crash 的
  active→interrupted 仍由独立子进程用例证明，任何恢复都只恢复事实、不重放模型或工具。
- 后果：失败、取消、挂起审批和重启中断在 SQLite、快照及 checkpoint 中具有一致且可查询的语义；迁移前
  旧库有可恢复备份，迁移失败不会半改表。代价是旧 v1/v2 数据库首次打开需要一次事务迁移并生成备份；
  Schema v3 应用仍不能打开未知未来版本。该裁决不改变 Provider IPC 字段形状，也不授权 A9-07、真实
  Provider、PowerShell/CMD 或 Win10/Win7 验收。

## ADR-0095 根 AGENTS.md 收敛为当前执行入口并按需加载详细规范

- 状态：Accepted（2026-08-24，项目负责人明确要求降低常驻上下文与不必要 Auto Review 成本）
- 背景：根 `AGENTS.md` 同时复制当前状态、C01–C20 详细解释、验证方法和 A8、Phase、Prototype、
  Spike 等历史叙述，修改前为 14,441 字节、103 行。其内容与 `docs/WIN7_CONSTRAINTS.md`、当前
  任务书、`docs/STATUS.md`、`docs/tasks/README.md` 和既有 ADR 重复；每个任务常驻加载会增加
  上下文，宽泛的读取、验证和审批表述还可能带来不必要的工具调用与 Auto Review。ADR-0044 已采用
  分层规则与按需上下文，ADR-0052 已明确规则、决策、任务合同和状态文档的职责。
- 决策：（1）根 `AGENTS.md` 只保留文档优先级、当前 A9 入口、开始任务的读取条件、C14、Win7 与
  安全硬约束、最小修改/验证规则及成本控制；详细定义继续由既有权威文档承载。（2）A8、A7、
  Phase 1–7、Prototype 和 Spike 的状态、背景与合同不删除、不改写，改为通过
  `docs/STATUS.md`、`docs/tasks/README.md` 及对应任务书按需读取。（3）C01–C20 的完整解释和
  验证矩阵继续以 `docs/WIN7_CONSTRAINTS.md` 为准；根入口明确保留 C14、允许路径检查、C15/C16
  依赖登记、Win7 SP1 x64 硬门槛，以及 A9 对 C08/C09/C20 的有限替代。（4）workspace 内已授权的
  普通读取、编辑和非破坏性局部检查无需重复请示；默认不执行无关的 GUI、浏览器、截图、渲染或全量
  测试，并限制输出和重复读取。只有越过沙箱、网络、外部应用/系统、破坏性操作或任务范围时才申请
  目标绑定批准；拒绝后不得用变体命令反复重试。（5）本裁决不修改 ADR-0089、A9 任务书、Accepted
  ADR、安全模型、权限边界、Win7 兼容要求或 C14 实现授权语义，也不以降本为由启用 Full Access、
  合并不相关操作或弱化审计。
- 后果：所有任务获得更短的高密度执行入口，预计减少重复上下文、无关工具输出和不必要的
  Auto Review；需要详细兼容性、阶段状态或历史合同的任务必须读取对应权威文档。按需加载改变的是
  信息装载时机，不是授权或安全语义；外部 GUI、网络、沙箱外写入、破坏性操作及长会话仍可能产生
  较高审批与上下文成本。

## ADR-0096 A9 Alpha 1 收敛为 Full Access 与 Read Only，Review 延期至 Alpha 2

- 状态：Accepted（2026-08-25，项目负责人基于 WIN7-10 Gate 4 正式失败明确裁决）
- 背景：A9 Alpha 1 候选 `WIN7-10-GLOBAL-MODE-CLEAN`（源码提交
  `f6cc12984f59745cd0edcd16f387080d603ba553`，ZIP SHA-256
  `afbc68f7ab0a6b23975fc5ee5d07b35f0cbc26580e6775f5f22b9b54bc034399`，manifest SHA-256
  `fa6ba75906d170d12ee695e0ec0a4a3bb51172e18c3eaa780e6e1a9ff7600adb`）在 Win7 Gate 4 证明
  Full Access 与 Read Only 行为符合预期，但 Review 写入因正式 Desktop Runtime 未注入
  `reviewStaging` 后端而按设计 fail-closed；正式工作区零写入，也没有 staging、文件级决定、审批或 Apply
  状态。失败证据为
  `C:\A9验收\证据\WIN7-10\gate4-review-staging-failure-20260825-01.txt`，SHA-256
  `F5CEA1D1B08797AFA846E7A63032CAD0000660DFF0FA3786310BABE38A99F571`。完整修复需要同时补齐动态
  staging、A9 状态、IPC、UI、checkpoint 和重启恢复，已超出当前 Alpha 1 的时间预算。
- 决策：（1）`0.3.0-alpha.1` 的受支持权限模式收敛为 Full Access 与 Read Only；完整 Review staging、逐文件
  接受/拒绝、审批绑定、Apply、漂移检测和重启恢复移入 `0.3.0-alpha.2`，开始实现前必须另立状态为
  `APPROVED_FOR_IMPLEMENTATION` 的任务书。（2）WIN7-10 继续按当时有效的三模式合同保持 Gate 4 FAIL，
  不追溯改判、不覆盖证据，也不把 Review 记为 Alpha 1 PASS。（3）本次只修改验收范围和文档，不修改
  WIN7-10 产品字节；因此无需仅为延期 Review 重打包。候选身份未变化且现场条件连续时，已经完成的同候选
  证据继续有效，验收从实际检查点 J4 继续。（4）WIN7-10 中仍可选择的 Review 必须作为 Alpha 1 已知限制
  明示；进入该模式时 Core 缺少 staging 的 fail-closed 拒绝和零写入行为继续作为纵深保护，绝不能通过直写、
  空 mock、自动接受或降级为 Full Access 绕过。要继续写入旅程，操作者必须显式切回 Full Access。（5）现场
  报告 J1～J3 已执行并推进到 J4，但 `C:\A9验收\证据\WIN7-10` 尚无对应外置归档；最终裁决前必须从应用
  审计、任务记录、文件/Git/Test/Diff 事实中补齐证据索引。缺证据时只能标记 `EVIDENCE_PENDING`，不得推断
  PASS，也不要求无意义重跑。（6）仅当候选文件、源码实现、用户数据迁移逻辑或关键环境事实变化时，才需要
  新候选或重跑受影响 Gate。（7）Alpha 2 Review 仍须复用或等价实现 A8 的私有 staging、基线哈希、文件级决定、
  目标绑定审批、原子 Apply、恢复与秘密阻断，并通过 A9 专用 IPC/SQLite/UI 和 Win7 同候选验收。
- 后果：Alpha 1 可以集中验证现实可用的直接开发闭环和安全只读分析，预计减少约 8～14 人日的当前阶段
  工作；代价是 Alpha 1 不提供 Review 工作流，产品和发布说明必须如实标注。ADR-0089 中“三模式”和
  “Review 继续复用 A8 staging”对 Alpha 1 的要求由本 ADR 局部取代，对 A8 历史产品线和 Alpha 2 目标
  不作删除或弱化。范围缩减不豁免任何其余 Alpha 1 硬门槛，也不自动签发 `A9_ALPHA1_PASS`。

## ADR-0097 A9 Win7 后续候选采用影响范围增量复验

- 状态：Accepted（2026-08-27，项目负责人明确要求已验证内容不再默认重复、改为可选回归）
- 背景：WIN7-10～WIN7-15 的正式验收已经对权限、Provider/DPAPI、J1～J5、Shell/编码、路径和部分生命周期
  积累了可追溯实机证据。为修复局部缺陷而生成新候选时，从零机械重跑全部旅程会显著增加现场时间，也不能
  提高未受影响能力的判定质量；但旧候选事实不能被改写成新候选的“现场执行 PASS”，包身份、变更影响和
  历史失败仍必须明确绑定。
- 决策：（1）每个新候选仍必须执行不可变身份、ZIP/manifest/全树完整性、启动绑定、候选前后哈希和后飞行
  残留检查；这些项目不能继承。（2）历史失败、BLOCKED、证据不足项，以及本次实现、状态 Schema、依赖、
  Runtime Profile、权限/审批、进程、安全或恢复路径直接影响的项目必须重验。（3）其余已有充分原始证据且
  环境前置未发生实质变化的项目，默认记为 `INHERITED_EVIDENCE / OPTIONAL_REGRESSION`，保留原候选 ID、
  哈希和证据路径，不冒充当前候选现场 PASS；操作者可按时间和风险选择抽样。（4）每个候选必须保存变更影响
  矩阵，列出源码范围、需求 ID、必验项、继承项和理由；影响无法可靠收敛时扩大复验，不得以“可选”为由跳过
  安全或数据风险。（5）最终 Alpha 1 裁决允许由“当前候选必验项 PASS + 可追溯继承证据 + 无未处置硬失败”
  组成，不再要求所有历史旅程在每个修复候选上重复执行。（6）任何环境工具、Windows 用户、权限、Provider
  能力、数据迁移或候选交付边界变化都会使相关继承失效。（7）ADR-0096 的 Review 延期保持不变；Review 仍
  只能记 `DEFERRED_TO_ALPHA2 / KNOWN_LIMITATION`，不得继承或推断为 PASS。
- 后果：后续 Win7 轮次集中验证变更影响和历史缺陷，既有 J/C/G/U 证据可按矩阵复用；代价是最终报告必须
  区分 `CURRENT_CANDIDATE_PASS`、`INHERITED_EVIDENCE` 与 `OPTIONAL_REGRESSION_NOT_RUN`，不能再用单一
  “同候选全量重跑”概括证据。该裁决不降低完整性、恢复、残留、秘密保护或 fail-closed 门槛。

## ADR-0098 A9 Alpha 1 同工作区多对话、恢复上下文与 DPAPI 草稿

- 状态：Accepted（2026-08-27，项目负责人完成 GrillMe Q1～Q40 并确认实施）
- 背景：WIN7-14 暴露三个相互关联的产品缺口：Checkpoint 身份在窄面板被截断；重启只恢复工作区和权限，
  不恢复可见对话；托管后台进程在 Turn 结束后缺少可达 Stop。WIN7-16 已修复这三个局部问题，但 A9 Runtime
  仍以工作区路径哈希作为唯一 Session ID，恢复历史上线后用户无法在同一工作区主动新建、切换或归档对话，
  所有任务会无限累积在单一上下文中。底层 A8 Session 目录不能直接冒充 A9 模型上下文、审批和 checkpoint
  的隔离身份。
- 决策：（1）工作区继续作为文件、权限和单写锁边界；每个工作区最多 16 个未归档 A9 对话，对话成为模型
  文本上下文、任务、Turn、Run、审批、checkpoint 和草稿的隔离身份。Alpha 1 只支持单窗口、单活动对话、
  单执行任务，不引入后台多对话并发。（2）支持新建、切换、重命名、归档和恢复，不支持永久删除。运行任务、
  待审批或托管后台进程存在时禁止切换对话和工作区。归档当前对话时切到最近的未归档对话；若不存在则创建
  空对话。恢复归档对话后激活它。（3）重启恢复上次工作区、上次活动对话和完整本地可见历史；只把最近
  20 个完整用户/助手文本轮次且最多 32,000 字符重建为 Provider 上下文。工具调用、审批、Shell/Git 命令
  和副作用不恢复为可执行上下文，不自动重放；被排除的旧历史保留可见并明确提示。（4）现有工作区派生
  Session 确定性迁移为“历史对话”；缺失的旧请求、草稿或上下文不反推、不编造。schema 迁移前必须创建
  事务一致备份和 SHA-256，失败回滚并进入 diagnostics，不覆盖唯一 live 数据。（5）草稿按对话保存；生产
  Windows 使用 Electron `safeStorage`/DPAPI Current User 加密，SQLite 只存 Base64 密文。DPAPI 不可用或
  解密失败时仅内存并明确提示，草稿不进入事件、日志、checkpoint、审批或模型，除非用户主动发送。
  （6）Checkpoint 显示、复制、Diff 和撤销绑定完整 Turn ID；审批卡绑定当前对话/任务/Turn/Approval/目标，
  点击后显示处理中，旧卡和重启前卡不可执行。（7）主 Composer 与左侧 CURRENT TASK 同时提供权威 Stop；
  只有任务终态、后台句柄终态、进程树归零、审批消失且 `canStop=false` 才显示清理完成。正常退出等待清理，
  无法确认时保留错误，不能冒充零残留。（8）Review 继续按 ADR-0096 延期；Win7 后续按 ADR-0097 只重验
  候选身份/完整性/启动/后飞行和本 ADR 直接影响项，未受影响的充分证据标为继承而非当前候选现场 PASS。
- 后果：A9 Alpha 1 获得可理解、可恢复且不会跨上下文串审批的多对话工作台；代价是 A9 schema 升级、一次
  迁移备份、更多 IPC/Renderer 状态以及 WIN7-17 的数据、审批、Stop、DPI 和秘密保护增量实机验证。任何
  数据丢失、上下文串用、陈旧审批可执行、Stop 后残留或退出清理失败均为本轮硬失败。

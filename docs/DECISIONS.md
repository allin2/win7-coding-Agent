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

- 状态：Proposed（2026-07-29，待项目负责人裁决；登记于 PENDING_CONFIRMATIONS PC-003）
- 背景：ADR-0027 解除全局运行时禁令后，Codex-like 客户端存在多条可行路线（Electron、WPF、Win32 原生、本地服务+浏览器、纯 CLI）。多栈并行会成倍放大 EOL 运行时治理、SBOM 与 Win7 实机验收成本；"本地服务 + 系统浏览器"在 Win7 上意味着 IE11，完全不达标；随包便携 Chromium 同为 EOL 内核却失去 Electron 的 contextIsolation/IPC/Session 治理基线（SECURITY.md §4 与 W7C 验收项均按 Electron 设计）。另经核实：Electron 22.3.27 内嵌 Node 16.17.1（D-009），Agent Core 可作为独立 **utilityProcess** 在同一运行时闭包内承载（Electron 22 已支持 `utilityProcess`，其 stdin 默认关闭，适合 Core 隔离），无需额外交付独立 Node 12（D-010 降级为可选 CLI 宿主备选）。**不采用 `ELECTRON_RUN_AS_NODE`**：Electron 官方安全指南建议关闭 `runAsNode` fuse、改用 utility process 承载 Node 逻辑，避免绕过沙箱与 fuse 的攻击面。本 ADR 为 Electron 首选实施 Profile 的裁决，其"可交付 Win7"结论以 SPIKE_01 实机为准，未通过前不得表述为"已满足 Win7"。
- 决策：（1）v1 客户端统一为 **Electron 22.3.27 x64 单栈**，进程边界固定为三层：**Electron main** 只负责窗口、生命周期与进程编排（不承载 Agent 逻辑）；**Agent Core = 独立 `utilityProcess`**，运行时为内嵌 Node 16.17.1，`runAsNode` fuse 关闭、不使用 `ELECTRON_RUN_AS_NODE`；**Desktop Shell = Renderer（最小权限，C17）**——即使关闭 Node，Renderer 仍有浏览器网络/导航/Chromium 攻击面，须持续执行 CSP、Session 网络白名单、禁导航、新窗口限制与 IPC Schema 校验，不加载不可信内容。（2）**唯一自研原生组件**为一个 **C++ x64 helper**（Job Object / Restricted Token / winpty 宿主，D-013），接口冻结为 argv + JSON over stdio，不加载插件、不监听网络；须澄清这并非"唯一原生工件"——`winpty`/`node-pty`（D-011）、SQLite Node 绑定（D-014）、MinGit（D-012）均含原生工件，全部按 WIN7_CONSTRAINTS §6/§6.1 登记（精确版本、SHA-256、Electron ABI、SQLite/FTS5 编译选项、VC Runtime 或 `/MT` 策略、ASAR 解包方式、Win7 加载验证）。（3）**降级阶梯**冻结为：Electron 22.3.27 →（SPIKE_01 No-Go）.NET Framework 4.8 WPF（D-015）→ Win32 原生 → CLI + 本地 App Server → CLI-only 保底；每档切换仅由对应 Spike 的 Go/No-Go 判据触发并记补充 ADR。**关键约束**：Electron 整体失败时，内嵌 Node 16 与 utilityProcess 一并消失，因此 WPF/Win32/CLI 各档必须各自另配**独立 Core 宿主**（独立 Node、.NET 实现或 CLI Core），并在切换 ADR 中固定——否则该档不是可切换降级，而是一次 Core 重写，须如实标注。（4）**淘汰**"本地服务 + 系统浏览器"与"随包便携 Chromium"路线，理由如背景所述，不再复议。（5）本 ADR 不构成实现授权；Electron 可行性以 SPIKE_01（Win7 实机）为准。
- 后果：治理面收敛到单一 EOL 运行时闭包 + 一个自研原生组件（其余原生依赖单独登记）；main/Core/Renderer 三层边界与关闭 `runAsNode` 消除 RUN_AS_NODE 旁路；WPF 及以下各档的功能损失（终端保真、UI 能力）与其独立 Core 宿主要求已预先声明，避免 No-Go 时重新开设计争论或误把重写当降级。代价是对 Electron 22 实机表现（老显卡黑屏 P17、内存、出站控制）形成单点依赖，由 SPIKE_01 前置化解。

## ADR-0029 Phase 1/2 Python 资产冻结为 legacy；契约与测试矩阵作为 Node Core 规范来源继承

- 状态：Proposed（2026-07-29，待项目负责人裁决；登记于 PENDING_CONFIRMATIONS PC-003）
- 背景：Phase 2 Python 实现当前存在若干**实现层面**的性能瓶颈，不利于桌面客户端的持续会话模型：`src/win7_agent/storage/event_store.py:90-102` 每事件 `SELECT MAX` + fsync 落盘；`src/win7_agent/tools/readonly.py:166-201` 无索引全树扫描（最坏读整棵 2GiB 工作区）；`src/win7_agent/cli/__main__.py` 一次性进程模型（每任务冷启动、无连接池、无流式 HTTP）。须澄清：这些是当前设计/实现选择的问题（批量事务、索引、常驻进程与流式 IO 在 Python 内同样可优化），**并非 Python 语言本身结构性无法达标**。选择 Node 的真正理由是：与 Electron/Core 统一为单一运行时闭包、消除长期 Python+Node 双栈的治理与 SBOM 维护成本，而非"Python 不可能优化"。
- 决策：（1）Phase 1/2 Python 代码在各自 Win7 实机验收完成后**冻结为 legacy**：此后只修缺陷，不新增能力、不迁移到新运行时。（2）Phase 1 Probe 转型为**安装前检查器**随新客户端安装包交付（只读探测语义不变），转型属打包集成，不改 Probe 代码合同。（3）Phase 2 的 §3 契约（事件 schema、错误码、退出码、Replay 语义含 ADR-0026 冻结清单）与 §7 F 编号测试矩阵作为 Node Core 的**规范来源**：PHASE_06 任务书必须包含逐条对账清单（继承 / 有据变更 / 不适用三态，逐项注明理由），不允许隐式丢弃。（4）Phase 2 代码**不整体移植**：禁止自动转译或按文件复制到 Node 侧；只继承契约文本与测试口径。
- 后果：避免长期双栈维护成本，运行时与 Shell 统一；Phase 2 的验证投资以契约与测试矩阵形式保全。代价是 Node Core 需重新实现全部逻辑并重新通过等价测试矩阵，对账清单是防止语义漂移的唯一防线。

## ADR-0030 Approval Mode 三档冻结：read-only / workspace-write / 无 full-access 本地等价

- 状态：Proposed（2026-07-29，待项目负责人裁决；登记于 PENDING_CONFIRMATIONS PC-003）
- 背景：Codex 的 full-access 模式依赖强 OS 沙箱兜底；Win7 无 Windows Sandbox / 现代 AppContainer / WSL2，同用户 Restricted Token + Job Object 减权不构成等价安全边界（WIN7_CONSTRAINTS §7、ADR-0027 第 4 条）。伪装提供 full-access 会让用户误信不存在的隔离。
- 决策：（1）Approval Mode 冻结为三档：**read-only**（只读工具 + 白名单只读命令，无写入无网络）；**workspace-write**（写入限工作区 + Plan/Apply 审批，命令执行经 C++ helper：Restricted Token + Job Object + 工作区外 ACL 拒绝 + argv 白名单 + **尽力限制网络**）；**不提供 full-access 本地等价**——超出 workspace-write 边界的操作一律逐条显式审批执行，或路由到远程隔离环境（Gateway）。（2）helper 启动时以 `IsProcessInJob` 探测宿主 Job 占用（P11 Job 不可嵌套）；探测失败或已在不可嵌套 Job 内时 **fail-closed**：拒绝执行高风险命令并向 UI 报告降级原因，禁止用 `taskkill` 冒充 containment（C08/C18）。（3）三档语义与 UI 文案必须一致：不得把 workspace-write 描述为"沙箱"。（4）**网络边界澄清**：Job Object + Restricted Token + ACL 控制的是权限、文件与进程树，**不会自动阻断 Winsock 网络访问**；因此"尽力限制网络"是同用户减权下的 best-effort，**不构成安全边界，不得标注为硬隔离/禁网**。真正的强制断网须由企业防火墙 / WFP（Windows Filtering Platform）或远程隔离执行承担；鉴于目标为企业内网，v1 接受本地 best-effort 网络限制，但必须在 UI 与文档如实说明其非隔离性质，需要强制断网的场景一律走远程隔离。
- 后果：安全承诺与 Win7 实际能力对齐，消除虚假沙箱与"本地禁网即隔离"的预期；代价是部分 Codex 工作流（放任式全权执行）在 v1 本地不可用，须走审批或远程路径。containment 实际强度与本地网络实际可达性由 SPIKE_02 实测裁决。

## ADR-0031 交互终端：独立 winpty 宿主进程；模型输入与用户输入硬隔离

- 状态：Proposed（2026-07-29，待项目负责人裁决；登记于 PENDING_CONFIRMATIONS PC-003）
- 背景：Win7 无 ConPTY，交互终端只能经 winpty 0.4.3（D-011）。pty 天然合并输入输出通道，若 Agent 可写终端 stdin，模型输出注入按键即成为权限旁路；终端回显含不可信数据（命令输出、仓库内容），VT/OSC 序列可攻击渲染端（C19）。
- 决策：（1）交互终端由**独立 winpty 宿主进程**承载（C++ helper 的终端模式），每会话唯一 pty，宿主不复用于 Agent Runner。（2）pty stdin **仅接受 Renderer 用户键盘输入事件通道**；Agent Core / 模型输出没有任何通往 pty stdin 的 IPC 路径（结构性缺失，而非策略过滤）。（3）Agent 的命令执行（Runner）一律无 pty、stdin 关闭、非交互。（4）终端输出按不可信数据处理：进入 Renderer 前过滤/白名单 VT 与 OSC 序列（尤其 OSC 52 剪贴板、标题注入、DECRQSS 应答类）；xterm.js 渲染层禁用回应答特性。（5）终端会话具备取消、背压、输出上限与强制终止（进程树回收经 Job Object）。
- 后果：终端保真度受 winpty 限制（全屏 TUI/Unicode/resize 由 SPIKE_02 实测，No-Go 时降级为非交互命令 + 流式日志视图）；换来模型注入按键攻击面的结构性消除。C19 负向用例（恶意 VT/OSC、模型尝试写 stdin 必须失败）为 SPIKE_02 硬门槛。

## ADR-0032 Git/Worktree Adapter：MinGit 隔离配置、命令白名单与攻击面封堵

- 状态：Proposed（2026-07-29，待项目负责人裁决；登记于 PENDING_CONFIRMATIONS PC-003）
- 背景：Git 升级为随包正式能力（ADR-0027 第 7 条，D-012 MinGit 2.46.2）。Git 存在大量可被恶意仓库触发任意进程执行的配置面（hooks、filter、textconv、pager、editor、credential helper、fsmonitor、remote helper），对 Coding Agent 是首要供应链攻击面（C20/G10）。
- 决策：（1）所有 Git 操作经**专用 Adapter**执行，禁止任何组件直接拼 git 命令。（2）Adapter 使用随包 MinGit 2.46.2，运行时强制：`GIT_CONFIG_NOSYSTEM=1`、`HOME`/`XDG_CONFIG_HOME` 指向受控空目录、净化环境变量、`-c` 显式注入全部所需配置。（3）**命令白名单**：读类（`status`、`diff`、`log`、`show`、`branch`、`worktree list`）自动执行；写类（`add`、`commit`、`worktree add`）需经 Approval 审批；白名单外命令一律拒绝。（4）**显式封堵**：`core.hooksPath` 指向空目录、禁用所有 filter/textconv/pager/editor/askpass/credential helper/SSH 变体/remote helper/fsmonitor（`-c` 逐项覆盖 + 环境变量双保险）；不随包携带 Git LFS 与 Git Credential Manager。（5）网络类 Git 操作（fetch/push/clone）v1 不在本地白名单内，留待远程化或后续 ADR。（6）G10 恶意仓库负向矩阵（构造触发上述每个攻击面的仓库，验证零进程/零网络逃逸）为 SPIKE_03 硬门槛；No-Go 时 Git 降级为只读观测（沿用 Phase 2 语义），写操作远程化。
- 后果：获得 Codex 级 Git/Worktree 能力且攻击面收敛为可枚举清单；代价是部分依赖 hooks/filter 的仓库工作流（如 lint hook、LFS 仓库）在 Agent 内不可用，需在 UI 明示。

## ADR-0033 性能预算基线：docs/PERFORMANCE_BUDGET.md 为唯一权威

- 状态：Proposed（2026-07-29，待项目负责人裁决；登记于 PENDING_CONFIRMATIONS PC-003）
- 背景：Win7 目标机资源有限（机械盘、4~8GB 内存、老显卡），Electron + Node 栈内存占用显著；缺乏统一预算会导致各任务书各自宣称"性能可接受"而无法验收。
- 决策：（1）新建 `docs/PERFORMANCE_BUDGET.md` 作为性能指标**唯一权威**，初始 10 项预算：冷启动 ≤8s；Shell 常驻 ≤300MB；Core ≤180MB；Runner ≤60MB/实例；索引吞吐 ≥120 文件/s（上限 3 万文件）；事件批量写 ≥300 QPS；单库 ≤512MB 滚动清理；检索 P95 ≤1.2s；任务并发上限 2；应用总内存 ≤55% 物理内存。（2）**这些数值当前状态为 `PROPOSED`（工程估计目标），不是已接受的 Win7 门槛**：每项须绑定参考硬件口径（CPU/RAM/机械盘或 SSD/冷热缓存/统计方法如中位数或 P95），并在被指定 Spike/阶段于 Win7 实机实测前保持 `NOT_MEASURED / 未实测` 状态位，**禁止纸面达标**。数值随本 ADR（Proposed）一并待裁决；Spike 实测 + 本 ADR 转 Accepted 后，方成为可验收的 Win7 硬门槛。（3）每行预算必须标注：测量方法、负责实测的 Spike/阶段、Go/No-Go 阈值。（4）任何任务书引用性能指标只准引用该文件，不得内联复制数值；预算修订须更新该文件并注明依据。
- 后果：性能验收有单一口径，Spike No-Go 判据可机械执行；同时如实区分"提议目标"与"已验收门槛"，避免把未实测数字当成 Win7 承诺。代价是预算数字在首轮实测前是工程估计，可能触发修订流程。

## ADR-0034 Codex 功能面三分级；Spike 不占用 ADR-0012 阶段编号

- 状态：Proposed（2026-07-29，待项目负责人裁决；登记于 PENDING_CONFIRMATIONS PC-003）
- 背景：对标 OpenAI Codex 需要明确哪些能力在 Win7 本地实现、哪些远程化、哪些 v1 明确不做，防止范围蔓延；同时新增 Spike 类任务需要与 ADR-0012 冻结的阶段编号共存。
- 决策：（1）功能面三分级冻结：**Win7 本地实现** = 会话式任务、流式输出、代码检索（SQLite FTS 增量索引 + 有界扫描回退）、diff 预览与审批、受控命令执行、Git/Worktree（隔离 Adapter）、AGENTS.md 项目指令、状态恢复与审计、有上限并发（默认 2）、数据式 Skills；**远程化（Gateway 对端）** = 模型推理、Browser Use/网页自动化、OAuth/外部登录、超大仓库语义索引、不可信代码强隔离执行、远程 MCP；**v1 明确不做** = full-access 本地沙箱等价、ConPTY 级终端保真、本地 WSL/Docker/Sandbox、MCP/Hooks 插件宿主（推迟 v1.1，边界见 ADR-0035）、多 Agent 编排、自动 PR、插件市场、后台常驻守护。（2）**编号规则**：正式阶段任务书严守 ADR-0012 编号（3=Model Gateway、4=Workspace Write、5=State Audit、6=Agent Core+Runner、7=Desktop Shell）；Spike 任务书使用 `SPIKE_NN_*` 独立命名，不占用阶段编号，分支 `spike/*`、白名单限 `spikes/**`。（3）"v1 不做"清单的任何项进入实现前必须先补 ADR。
- 后果：范围有可执行边界，阶段编号历史引用不失效；代价是部分 Codex 能力显式承认缺席，需在产品口径中如实说明。

## ADR-0035 插件宿主（MCP/Skills/Hooks）信任边界原则冻结；实现推迟 v1.1

- 状态：Proposed（2026-07-29，待项目负责人裁决；登记于 PENDING_CONFIRMATIONS PC-003）
- 背景：MCP/Skills/Hooks 是可扩展执行入口，同时放大安全面（任意子进程、任意网络）与验收面（每个插件都是新依赖）。v1 周期内无法承担其治理成本，但边界原则须先冻结以免后续设计漂移。
- 决策：（1）v1 仅支持**数据式 Skills**（纯声明性 markdown/JSON，无执行体，由 Core 解释）。（2）可执行插件宿主推迟 v1.1，届时须遵守本 ADR 冻结的边界原则：插件一律运行于**受限令牌独立子进程**（复用 D-013 containment）；插件包必须有**版本化 Manifest**（声明能力、命令、文件与网络需求）并经用户显式授权安装；本地仅允许 **stdio 传输的 MCP**（不开本地网络端口）；远程 MCP 一律经 Gateway 代理并复用其鉴权与审计。（3）Hooks（生命周期钩子执行用户命令）视同插件执行体，同受上述约束，v1 不提供。（4）v1.1 启动插件宿主前必须另立任务书与补充 ADR，本 ADR 仅冻结边界不授权实现。
- 后果：v1 安全面与验收面可控，Skills 先行满足轻量定制需求；代价是 v1 生态扩展性有限，与 Codex 的 MCP 能力差距显式记录于 ADR-0034 三分级。

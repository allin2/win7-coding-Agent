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

## ADR-0099 A9 Alpha 1 以 WIN7-19 增量证据收口并进入内部交付

- 状态：Accepted（2026-08-28，项目负责人确认 WIN7-19 可作为 Alpha 1 交付并要求阶段 PR）
- 背景：WIN7-18 暴露复合 CMD 中绝对 `git.exe push` 未被高影响分类器识别、审批身份可复用的 P0。
  修复提交 `781b20e3da277570f85c28286d7ea5bbbdd5fa28` 仅改变 Git 命令分词/分类和对应回归测试，并签发
  WIN7-19。候选 ZIP SHA-256 为 `824a10cd213534aca87c348d8304b053d27a5bd896831daf528ed13b1c1c72b0`，
  manifest SHA-256 为 `b483e9b0bcab19cf96114bda39e5d8a9ef8a48842c9aaabbaabfa7e87af12c26`，
  `source_dirty=false`、780 文件、state schema v4、双构建字节一致。
- 决策：（1）按 ADR-0097，WIN7-19 重新执行候选身份、包完整性、正式启动/退出/重启、直接受影响的审批
  分类/身份/单次消费/变更目标零执行以及后飞行检查；其余七组未受影响能力采用 WIN7-17/18 可追溯继承
  证据，不冒充 WIN7-19 现场重跑。（2）四个新 Turn 分别生成不同审批身份；三个拒绝 Turn 均为
  `approval_required=1 / tool_start=0`，快速重复点击已批准卡仅产生一次 `tool_start`，变更目标重新出卡且
  拒绝后零执行。已批准 push 只到达 Git 一次，并被 Git `safe.directory` 所有权保护阻止；bare remote
  保持空，不能把它写成成功推送证据，但足以关闭审批绕过 P0。（3）正式 Electron 生命周期、包完整性
  5/5、报告八个 case 结构校验、零受管进程残留、候选哈希不变和秘密扫描零命中通过；无 P0/P1，裁决为
  `A9_ALPHA1_PASS / GO_FOR_ALPHA`。（4）报告校验器 schema 不支持 `INHERITED_EVIDENCE`，所以七个继承
  case 仍显示 `EVIDENCE_PENDING`；此为证据表达限制，不追溯改成当前候选 PASS。（5）A9 实现任务收口，
  根 `AGENTS.md` 改为已交付基线；Alpha 2 Review 必须另立任务书，Win10 同候选 smoke 在 RC 前补齐。
- 后果：`0.3.0-alpha.1` 可供内部 Alpha 使用，支持 Full Access 与 Read Only，不支持完整 Review。接受的
  P2 包括 1366×768 对话列表拥挤、普通用户 PATH 无 Git、复用管理员所有仓库触发 `safe.directory`、
  Bitvise Session 0 的可见 DPAPI/GPU 降级。该裁决不授权关闭 TLS/SSH 校验、修改系统 PATH/注册表/服务，
  也不是公开发布或 RC PASS。

## ADR-0100 WIN7-19 后置独立审查触发 A9-08 修复 Gate，历史候选保持不可变

- 状态：Accepted（2026-08-28，项目负责人要求保留 WIN7-19 阶段基线并按独立审查结论执行修复）
- 背景：WIN7-19 在 ADR-0097 当时定义的增量范围内完成现场验收并由 ADR-0099 裁决
  `GO_FOR_ALPHA`。在合并 PR 前新增的独立代码审查覆盖审批、状态迁移、进程停止、checkpoint 和秘密
  保护，并动态复现：（1）CMD caret、PowerShell backtick/动态调用可使 `git push` 未进入始终确认；
  （2）含已配置秘密的 prompt 可进入 `turn_started`、SQLite WAL 与 Renderer timeline。审查还确认
  Provider 跨目标 Key 复用、A8 mutation IPC 可达、D-013 未接入正式 A9、checkpoint/迁移等 P1。
  这些是 WIN7-19 原验收未覆盖的存量缺陷，不是候选身份错位，也不得通过改写历史证据消除。
- 决策：（1）WIN7-19 源码提交、ZIP、manifest、candidate identity、外置证据和 ADR-0099 当时的现场
  结论保持不可变，作为可回退里程碑；PR #3 在新 Gate 完成前不合并。（2）新增
  `A9_08_POST_REVIEW_HARDENING`，状态 `APPROVED_FOR_IMPLEMENTATION`，继续使用
  `codex/a9-trusted-agent-runtime` 和 `0.3.0-alpha.1`，只修复独审确认的问题。（3）当前综合交付状态为
  `FIX_BEFORE_ALPHA`；这补充而非追溯伪造 WIN7-19 的已执行范围。（4）修复按审批/IPC、秘密/Provider/TLS、
  进程生命周期、checkpoint/状态迁移四批提交；每批补行为回归并可独立回退。（5）仓库最高安全红线优先：
  A9 不再接受关闭 TLS 验证；PRD 中允许显式 insecure TLS 的低优先级条款由本 ADR 对 Alpha 1 取代。
  （6）全部修复经全量验证和第二轮独立审查后构建 WIN7-20；按 ADR-0097 重验候选必验项及所有直接
  受影响项，未受影响的 WIN7-19 证据只标为继承。（7）WIN7-20 重新取得 `GO_FOR_ALPHA` 后才允许合并。
- 后果：风险通过不可变基线、小提交和增量实机复验控制，不靠把已知 P1 提前合并进 `main`。修复可能扩大
  WIN7-20 的复验范围，特别是审批、秘密、Provider/TLS、进程、checkpoint 和迁移；开发机通过不能替代
  Win7。Alpha 2 Review 继续不在本任务范围。

## ADR-0101 A9 TrustedShell 使用 D-013 Current-User Full Access Profile 与协议 v2

- 状态：Accepted（2026-08-29，项目负责人批准按独立 Profile 解除 A9-08 的 D-013 合同阻断）
- 背景：A9-08 已关闭授权范围内的审批、秘密、Provider/TLS、进程真实性、checkpoint 和迁移缺陷，开发机
  1482 项验证与三路独立复核均通过；但锁定的 `D-013-v24-low-risk-noninteractive` 只允许 System32
  低风险白名单，强制 Restricted Token、Low Integrity 和固定总超时，协议也没有 A9 要求的
  `envOverlay`、真实无 deadline 与托管后台 ready acknowledgement。直接让 A9 使用 v24 会出现“产品宣称
  Full Access、底层仍按低权限 Runner 执行”的合同冲突；移除 Job、取消或清理证明又会违反 ADR-0089 和
  仓库进程安全红线。A9-08 没有修改 `native/helper/**`、原生协议或 release input lock 的授权，不能以
  JavaScript 回退或伪造 helper 回执绕过阻断。
- 决策：（1）D-013 v24、协议 v1、既有哈希和 A7/A8/WIN7-19 历史证据保持不可变，继续只解释为
  `low-risk-noninteractive` Profile；新增 D-013 v25、协议 v2 和
  `a9-trusted-shell-current-user-v1` Profile，专用于 A9 TrustedShell。新 Profile 使用当前 Windows 普通
  用户 Primary Token，不创建 Restricted Token、不降为 Low Integrity、不修改工作目录 DACL/Integrity
  Label；继续建立独立 Job Object、关闭 child stdin、有界捕获双流并管理整棵进程树。回执必须如实声明
  `tokenMode=current_user`、`restrictedToken=false`、`lowIntegrity=false`、`workDirAclModified=false`，
  不得复用 v24 的减权证明字段冒充成功。（2）自动 Shell 只接受规范化的 Windows PowerShell 或
  `%SystemRoot%\\System32\\cmd.exe`；工作区显式 Shell（包括可选 Git Bash）必须由用户设置产生，绑定
  canonical executable path、文件身份/哈希和版本，模型或 Renderer 不能在单次工具参数中注册任意宿主。
  helper 只验证已绑定 Shell 宿主，不把完整命令内容伪装成可执行文件白名单；Shell 内命令、项目脚本、Git
  hooks/helpers 和网络副作用继续按 ADR-0089 的当前用户 Full Access 风险解释，并经过 Schema IPC、Policy、
  目标绑定审批、审计和 checkpoint。（3）协议 v2 请求至少包含 `requestId`、`profileId`、Shell 身份、
  `command`、canonical `cwd`、`envOverlay`、双流上限、`managed`、`deadlineMode=none|fixed` 和可选
  `timeoutMs/idleTimeoutMs`。默认继承当前用户环境并叠加受验证的工作区设置；Provider/API Key 不注入
  Shell，环境值不得进入回执、事件、日志、SQLite、checkpoint 或诊断包，且必须拒绝弱化 TLS、Electron/
  Node 边界的控制变量。（4）`deadlineMode=none` 表示不存在人为总/空闲 deadline，不能映射为一小时或
  其他固定上限；输出预算、软时长提示、用户 Stop、应用退出裁决和 Job 回收仍为硬门槛。显式 deadline
  使用单调时钟，并与取消、最终结果和清理证明区分。（5）托管后台启动采用同一 stdio 控制通道的多消息
  协议：helper 只有在 child 已创建、stdin 已断开、双流捕获已就绪且 child Job 归属已复核后，才返回严格
  绑定 `requestId` 的 `execution_started`；产品收到并持久化该消息前不得显示“已启动”。25ms 固定等待或
  仅凭 PID 存在均不是 ready 证明；最终 `execution_result`、合作取消和重复 Stop 继续绑定同一身份。
  （6）v25 保留 ADR-0069 的 Win7 Electron Job/breakaway 检查和 ADR-0071 的合作取消；无法确认 Job 分配、
  双流状态、整树退出或最终回执时一律 `cleanup_required`，窗口与工作区锁按 ADR-0100 保持可操作，禁止
  虚报零残留。当前用户 Full Access 不宣称文件系统、网络或权限隔离，不自动提权，也不授权修改系统 PATH、
  服务、注册表、防火墙、TLS/SSH 校验或安装 WMF。（7）新增
  `A9_09_D013_TRUSTED_SHELL_PROFILE`，授权 `native/helper/**`、Runner/Shell 适配、D-017 锁定构建、A9
  input lock、打包与验证套件的最小修改；不新增运行时依赖，不实现交互终端、Alpha 2 Review 或无关重构。
  D-013 v25 必须由锁定的 VS2019/v142/SDK 10.0.19041 Profile 形成源码到 PE x64/CRT/API/哈希闭包，旧 v24
  工件和候选不得原地覆盖。（8）Win10 双构建一致与静态/协议 smoke 通过后才能签发 WIN7-20；Win7 SP1 x64
  普通用户必须验证 PowerShell 5.1/CMD/显式 Shell、中文空格/junction/近 MAX_PATH、环境覆盖、前后台、
  无 deadline、双 Stop、崩溃恢复、recovered PID、退出锁、零残留和秘密扫描。按 ADR-0097 仅继承未受
  影响的 WIN7-19 证据；WIN7-20 重新取得 `GO_FOR_ALPHA` 前 PR #3 仍不得合并。
- 后果：A9 可以在不虚构 Win7 沙箱的前提下真正使用当前普通用户权限运行 Shell，同时保留 Job、取消、
  输出、审批、checkpoint 和诚实残留报告。代价是增加一个原生 Profile、协议版本、构建工件和实机矩阵；
  v24 与 v25 必须分别锁定和解释。本 ADR 仅针对 A9 Current-User Profile，局部取代 ADR-0067“任意 Shell
  始终拒绝”和 ADR-0068“仅低风险固定程序 Profile”的限制；ADR-0067/0068/0069/0071/0072 对历史
  Low-Risk Profile、A7/A8 与既有候选继续有效，不追溯改写其证据。

## ADR-0102 A9-09 独立复审后的候选与原始返回证据绑定

- 状态：Accepted（2026-08-30，项目负责人要求修复 D-013 v25 独立审查问题；仅收紧 ADR-0101 已授权门禁）
- 背景：自报 PASS、独立文件哈希和版本标签不足以证明候选闭包或实际执行宿主；独立审查发现开发候选
  可被 WIN7-20 verifier 接受、返回包可缺少 PE/原始 smoke 证据、显式 Shell 结果可沿用自动探测版本。
- 决策：（1）显式 Shell 选择配置以 schemaVersion 2 保存 canonical path、稳定文件身份、SHA-256 和
  测量版本；旧配置无完整绑定时必须重新选择。协议 v2 和执行结果使用同一已验证身份，不接受 Renderer
  版本标签。（2）WIN7-20 报告使用独立 schema 2；W17 继承项绑定不可变 WIN7-19 disposition/ledger/report
  哈希与 case pointer，W20 直接项绑定本候选与 Win7 普通用户机器证据。入口必须拒绝 dirty/ineligible
  候选，并验证原始确定性 ZIP、内外 manifest、验收 kit、native 哈希与解压物理全树一致。
  （3）v25 返回记录以仓库预批准 kit ZIP/hash 为信任根，拒绝重复返回 ZIP/hash 或 run ID；新增 schema 1
  `validation-binding.json`，将批准 Profile 所列全部原始证据和退出码绑定到 run ID、source commit、
  Profile 与最终 helper SHA-256。记录器独立解析 PE32+/AMD64/Win7 console、导入表、静态 CRT 和嵌入
  asInvoker/Win7 manifest，交叉检查原始 PE 分析、v1/v2 smoke、ready/cancel、逻辑测试和捕获自测。
  缺件、解析不支持或任何矛盾一律拒绝；不自动修补返回证据。
- 后果：新合同只用于后续 v25/WIN7-20，不改写协议 v1/v24、WIN7-19 或旧 r4 ZIP。r4 保持撤销，修复提交
  前不得生成虚构 source commit 或可批准的新套件；没有批准项时记录器保持阻断。开发机可验证结构与
  fail-closed 行为，不能签发 Win10/Win7 PASS。文件绑定不是对恶意构建机或人工报告的远程证明，仍须
  独立双构建、真实 Win7 实机证据及最终复审。本决策不新增运行时依赖、不扩大实现路径或系统操作权限。

## ADR-0103 A9-09 正式产品闭包与批准清单必须独立于候选自报

- 状态：Accepted（2026-08-30，项目负责人要求检查并修复最新 D-013 v25 独立审查问题）
- 背景：ADR-0102 已绑定候选 ZIP/manifest/物理树与 Win10 原始返回证据，但“树等于 manifest”仍允许
  候选把自身裁剪成五个文件并同步改写 manifest；仓库批准清单也尚未证明来自已提交 HEAD，存在同一工作
  树本地加入批准条目的自批准路径。这两点不能构成独立发布信任根。
- 决策：（1）WIN7-20 候选入口内置 0.3.0-alpha.1 的不可省略产品闭包，覆盖 Electron 入口和许可证、
  `a9-09-input-lock.json`、Shell Product/Preload/Renderer、Core/Gateway/Git/Runner/State/Workspace 完整运行时
  JavaScript、离线依赖、Runner manifest、helper/SQLite、SBOM、验证脚本与 verifier。入口解析 input lock、
  runtime、Runner manifest、SBOM 和 kit，绑定 source commit、三份输入、D-013 v25 Profile/协议、native
  哈希、Electron ABI 与 Gate；候选自报 manifest 不能删除或替换该集合。（2）生产记录器只从固定仓库路径
  读取批准清单；清单必须存在于当前 `HEAD`，工作树字节与 `git show HEAD:<path>` 完全一致，且该路径无
  staged/unstaged/untracked 状态。新 input lock 记录批准清单的 HEAD commit、路径和 SHA-256。
  （3）测试清单仅允许 `testOnly=true` 的编程接口，正式 CLI 不暴露注入参数；测试身份明确写为 TEST_ONLY。
- 后果：当前未跟踪的批准清单会安全阻断正式记录，直到用户授权提交完整整改；提交后仍必须另行生成新
  revision、登记精确哈希并独立批准。固定闭包随产品版本维护，新增/移除运行时文件必须显式更新合同与测试。
  本决策不改写 v24、WIN7-19、旧 r4 或历史正式锁，也不把开发机结构校验解释为 Win10/Win7 PASS。

## ADR-0104 WIN7-20 候选外批准 pin 与正式输入来源绑定

- 状态：Accepted（2026-08-30，项目负责人要求检查并修复最新 D-013 v25 独立审查问题）
- 背景：ADR-0103 的固定文件集合和包内交叉一致性仅证明内部自洽，不能证明发布来源。把自造 input lock
  移到候选外也不能自动成为权威输入，真实 native 配合伪造 JavaScript 同样不能被视为正式产品。
- 决策：（1）WIN7-20 integrity/report 入口必须接收候选外只读使用的正式 `a9-09-input-lock.json`、批准
  清单和 schema 1 `WIN7_20_RELEASE_AUTHORITY` 记录，并要求显式传入独立批准渠道发布的记录 SHA-256。
  不提供默认 pin，不从候选/sidecar/传入文件本身推导批准，不自动创建批准记录。记录状态为
  `APPROVED_FOR_WIN7_20_VALIDATION`，绑定 formal input lock SHA-256、批准清单 commit/SHA-256、产品
  ZIP/manifest SHA-256 及产品 source commit。批准是在锁定双构建、正式输入审查和产品独立复核后发生的
  外部信任动作；它不是 Win7/Alpha PASS。（2）包内 lock 与候选外正式 lock 必须逐字节一致；lock 的
  approval_registry 必须匹配外部批准，build_kit 必须匹配清单中的精确批准项，两个 reproducible_builds
  必须具有不同 ZIP/hash、合法且不同 run ID、不同 evidence binding SHA-256；拒绝 TEST_ONLY 身份。
  原始 Win10 evidence binding 内容仍由记录器在写正式 lock 前验证，不在 Win7 重放构建。（3）三个原生
  入口必须绑定正式输入的 entry hash，并检查 PE/COFF、PE32+、AMD64、executable/DLL 类型和 section
  原始字节边界；不把 PE 结构替代 PE/API/CRT/协议 smoke 或实际加载证据。完整 ZIP/manifest 外部 pin
  同时绑定全部 JavaScript、依赖、kit 与验证脚本。（4）candidate identity 与 integrity/report 保存批准
  记录、正式 lock 和批准清单的哈希身份；CMD 增加必需参数，缺失或不匹配即 fail-closed。产品源码提交
  与 helper 构建源码提交分别绑定产品批准与 build kit，不能把后续批准清单/lock 提交伪装为 helper 来源。
- 后果：增加候选外只读批准记录和独立 hash 交接步骤。现场没有 Git/系统 Node 前置；应先在可信开发机
  用仓库 verifier 完成预飞行，再运行包内 Electron 检查。信任根仍是独立批准与可信校验器，不防御被攻陷
  的批准渠道、宿主或伪造全部输入的操作者。测试 pin 仅在临时夹具生成，不签发正式证据；旧 v24、WIN7-19
  和已撤销 r4 不变，不新增依赖或系统 API，不授权提交、批准新候选或远程操作。

## ADR-0105 A9 Shell 已知秘密值过滤与旧环境配置失效

- 状态：Accepted（2026-08-30，项目负责人要求检查并修复最新 D-013 v25 独立审查问题）
- 背景：仅按变量名过滤会让已知 Provider/API/Header/代理秘密借普通名字进入 child 和明文配置；
  精确 Node 名称表还遗漏 NODE_DEBUG 等控制项。最新复审为 P0=0/P1=2/P2=0，撤销上一轮 A9-09A
  通过结论；不得进入锁定 Win10 双构建。
- 决策：（1）复用进程内 knownSecrets（含本进程已轮换旧值），继承环境删除命中项，overlay 在选择、
  保存和执行前拒绝命中项；匹配原文、嵌入值、Base64/Base64URL（含无 padding）、percent/form 编码与
  混合大小写 percent hex。错误和证据不回显键值。（2）Shell 探测、前台、后台及 v2 native helper
  启动均使用净化环境，不再重新合并原始 process.env。helper 不接收秘密清单；只继承已净化快照并执行
  原生名称过滤。v1 传输与历史工件不变。（3）JS/C++ 同步拒绝全部 NODE_*、ELECTRON_*，继续保留
  既有秘密/TLS 控制规则。（4）Shell 设置文档升级 schemaVersion 3，沿用专用文件名；schema 2 读取时
  原位迁移且复验全部工作区。任一旧 overlay 命中，移除该工作区整个 overlay 并持久化
  environmentRejected=true；不保留含秘密的明文备份。启动和 Provider 凭据新增/变化时复验；当前工作区
  被拒绝后必须显式重新保存设置才能执行，不能静默改用空环境。正常非秘密设置及 Shell 身份保留。
- 后果：被拒绝的覆盖需要用户重新输入；原子替换失败时保持 fail-closed，不签发“已清除”结论。
  这是已知秘密保护，不是未知密钥识别或磁盘安全擦除；历史外部副本、备份、已经运行的进程不能被追溯
  清除。不新增依赖、网络调用或系统 API，不把开发机或结构测试冒充 Windows PASS；仍须再次独审、
  新提交套件及 WIN7-20 环境/重启/轮换直接证据。

## ADR-0106 A9-09 构建生成器入口与 Windows PowerShell 请求自测

- 状态：Accepted（2026-08-30，项目负责人要求检查并修复最新 D-013 v25 独立审查问题）
- 背景：ADR-0105 环境修复获独审关闭，但生成器仍精确匹配旧四项数组，扩展后的九项 smoke 无法封装；
  正式 smoke 对 OrderedDictionary 调用 Hashtable.Clone，导致真实 Windows PowerShell 路径失败。
- 决策：（1）生成器对 smoke 名称按必需集合校验，允许顺序变化和增项，缺项失败；隔离 TEST_ONLY Git
  夹具执行真实 prepare-kit 入口，核对提交源码、input lock 和 manifest 哈希，禁止触碰工作树正式锁。
  （2）有序请求逐项复制并替换 overlay；新增构建脚本专用 `-TestSmokeRequestOnly`，仅在 Windows
  PowerShell 5.1 Desktop 执行同一复制函数并校验源请求未变。该分支在构建、文件写入及外部进程前退出，
  不产生可交付返回包。非 Windows 自动测试显式跳过，不能以静态检查代替目标宿主执行。
- 后果：不改变 helper 协议、产品运行时或交付依赖；自测开关只验证请求构造，不是 Win10/Win7 Gate。
  当前仍须再次独审、授权提交、新 revision 及双构建；不改写 v24、WIN7-19 或已撤销 r4 的锁和工件。

## ADR-0107 A9 文件显式编码与有界流式读取

- 状态：Accepted（2026-08-30，项目负责人确认在独立读取修复范围内直接实施）
- 背景：A9 read 在显式解码前先拒绝自动识别不明的文件；binary 请求反而进入文本分支；8 MiB 限制
  在行范围处理前生效。当前 A9-09 不授权 Workspace/Core，故新增 A9-10 独立任务与 AGENTS 入口。
- 决策：显式编码优先、binary 仅元数据；用 64 KiB 异步分块扫描替代同步整文件加载，完整哈希/行数
  与最多 2000 行/128 KiB UTF-8 预览分离。严格流式解码保持跨块字符；可选 truncationReasons 说明
  line_limit/byte_limit，不改变既有结果字段含义。不向模型暴露取消信号，内部复用 Agent Loop 信号。
  完整读取并确认句柄/路径身份与 stat 稳定后才发布基线；错误/取消不留下新基线，不改变后续写入裁决。
- 后果：内存有界但完整统计/哈希仍为 O(文件大小)，自动 GBK 可能需要重扫。无 BOM UTF-16LE 不保证
  自动识别，须显式指定；超长单行只提供带截断标记的预览。无新增依赖/系统 API，沿用 Electron 22 /
  Node 16 fs 与 ICU。只授权任务白名单和当前基线 detached 工作区，不授权提交/推送或修改历史工件；
  Win7 实机与 A9-09 Gate 保持未完成。

## ADR-0108 D-013 v25 后置独审缺口按独立 A9-11 合同修复

- 状态：Accepted（2026-08-30，项目负责人要求核对后直接修复独立审查确认的问题）
- 背景：A9-10 已修复 Agent 读取链，但同一 D-013 v25 独审任务仍复现八项跨模块缺口：只读 Git 投影可
  执行 textconv/fsmonitor，活动 Full Access Loop 可在 UI 已切为 Read Only 后继续写，Git 投影和拆分的
  `model_chunk` 可泄漏已知秘密，SSE Buffer 分块可损坏中文，Core/Renderer 的 Shell 事件 DTO 不一致且
  长任务期间不刷新，显式读取编码未绑定 edit，A9 Viewer 固定调用 legacy UTF-8 读取。A9-09 与 A9-10
  各自白名单均不足以完整修复，不能借既有授权越界。
- 决策：（1）新增 A9-11 及精确路径白名单；Git 投影禁用所有会执行仓库配置的观察回调，并在产品边界
  递归脱敏。（2）活动 Turn/审批/cleanup-required 进程期间拒绝模式切换；模型 chunk 先跨事件聚合脱敏，
  再进入 timeline 和 SQLite。（3）SSE 采用 Node 16 可用的有状态 UTF-8 解码；Core 发布 schema 1 Shell
  结果投影，Renderer 活动期轮询并按 DTO 展示。（4）显式 read 的 encoding/BOM 进入稳定写基线，edit
  严格复用；A9 IPC 升级为 v5 并提供自身有界 read，Viewer 提供自动/显式编码选择，不再依赖 legacy A8
  read。（5）全部改动只形成开发机修复证据，不改 v1/v2 native 协议、D-013 v24/v25 锁、WIN7-19 或
  候选身份，不签发 Win10/Win7 PASS。
- 后果：只读投影不再完全复现用户 Git callback 的显示效果，但真实 Git Shell 行为不变；连续模型文本可能
  在工具/Turn 边界批量出现，以换取秘密不会跨事件泄漏。A9 IPC v5 要求同包 main/preload/Renderer 一致，
  旧 schema fail-closed。显式错误编码仍拒绝写入；Win7/Electron 真实体验须纳入 WIN7-20 直接复验。

## ADR-0109 D-013 v25 后置恢复、配置与用户流按独立 A9-12 合同修复

- 状态：Accepted（2026-08-31，项目负责人要求继续核对并直接修复独立审查确认的问题）
- 背景：A9-11 完成八项源码修复后，独审继续定位十项不在原白名单内的缺口：Viewer 手工编码跨文件
  泄漏、Electron smoke 没有正式 Explorer 会话、首次 Undo 被严格对象校验拒绝、IME 组合输入提前发送、
  Provider 二次保存丢失高级配置或秘密、审批恢复长任务没有 Stop、残留退出提示自身抛错、snapshot 同步
  重复探测 Shell、崩溃持有者锁固定阻塞，以及 Runtime 初始化失败诊断在 Renderer 不可见。
- 决策：（1）新增 A9-12 并限于 Shell Product/测试与 State 工作区锁；Viewer 每次新文件回到 auto，Smoke
  通过真实 picker IPC 建会话，Undo 保持严格 schema 但 confirmationId 可选，IME 兼容 composition 与
  keyCode 229。（2）Provider snapshot 只公开非秘密高级元数据；字段省略表示保留、显式空值表示清除，
  endpoint 变化始终丢弃旧 API/Header/代理秘密；Renderer 不回填秘密。（3）审批恢复进入同一 running/
  Stop/轮询生命周期；退出残留文本有界且不吞 cleanup 风险；自动 Shell 探测按 Runtime 缓存并在设置变化
  后失效。（4）持久层只在 owner 精确为 `main-<pid>` 且 PID 检查明确 `ESRCH` 时事务接管；未知、权限错误、
  PID 复用或其他不确定状态保持 fail-closed。同一 Runtime 未持锁时后续入口会重试。（5）初始化失败把
  已脱敏、有界的 code/detail 明确显示到 Renderer 与诊断抽屉，不把未 ready 误报为“请选择模式”。
- 后果：Provider UI 可以安全修改非秘密字段并显式清除旧设置，但 endpoint 变化后用户必须重新输入秘密；
  PID 复用可能保守延迟锁接管，不能把 PID 检查描述为身份认证。开发机测试与 Electron smoke 均不替代
  Win10/Win7 实机证据。本决策不改 native 协议、v24/v25 正式锁、WIN7-19 工件或候选身份，不授权提交、
  推送、正式构建或解除 `FIX_BEFORE_ALPHA`。

## ADR-0110 既有 WIN7-19 schema v4 精确兼容与 WIN7-21 全新候选

- 状态：Accepted（2026-09-03，项目负责人要求修复、独立审查并从 G0 重建新候选）
- 背景：WIN7-20 在 Win7 普通用户启动时发现 WIN7-19 已写入的合法 schema v4 profile 与后置严格
  物理校验器不兼容：历史 `a9_sessions.last_activated_at` 声明可为空且 `title_source` 默认值为
  `legacy`，当前规范要求 `NOT NULL` 与默认值 `auto`。校验发生在备份和迁移前，使产品进入诊断模式。
- 决策：（1）schema marker 保持 v4，不新增业务字段或依赖。当前规范 v4 和历史 profile 都必须精确
  匹配 CREATE TABLE、必需索引与零触发器合同；历史 profile 不允许额外索引，当前规范 v4 仅兼容
  旧版本迁移已保留的非唯一、非 partial、命名列、BINARY/ASC 只读索引，拒绝会改变写入语义的索引；
  只有除上述两项物理声明外，表、列、约束、显式索引和零触发器均完全相同的
  `WIN7_19_LEGACY_V4` 才能进入自动重建；任何其他旧 profile 偏差继续 fail-closed。（2）精确旧
  指纹先经只读探测，再在写连接复核；任何写入、journal mode 变化前以 `VACUUM INTO` 创建并校验事务
  一致备份。单一事务重建 `a9_sessions`，逐字段保留会话、草稿密文和元数据，空活动时间仅按
  `updated_at`、`created_at`、当前时间补齐，重建索引并执行完整规范 v4 校验；失败整体回滚且备份保留。
  （3）新增 A9-13 独立白名单和正负向真实 SQLite 回归。实现验证与独立审查分开记录，独审关闭后才能
  冻结源码。（4）WIN7-20 的失败证据、身份和裁决不可变；新源码从 G0 重新双构建，生成新身份
  `a9-13-win7-21-input-lock.json`、manifest、ZIP、release authority、Win7 部署目录、直接证据与最终裁决；
  新锁可引用仍获批准的原生输入哈希，但构建器必须拒绝历史 `a9-09-input-lock.json` 作为 WIN7-21 正式锁，
  候选编号为 WIN7-21。
- 后果：符合精确历史指纹的用户数据首次启动会产生可恢复备份并规范化；已规范 v4 不重复备份。任意未知
  或畸形 v4 仍拒绝启动。开发机和 Win10 结果不构成 Win7 PASS；WIN7-21 必须直接证明旧 profile 启动、
  数据保持、迁移原子性、生命周期和受影响产品旅程。本决策不修改 WIN7-19/WIN7-20 工件、原生协议、
  Provider、Runner、权限或历史验收结论。

## ADR-0111 D-013 CMD payload 原样装配与 WIN7-22 门禁继承边界

- 状态：Accepted（2026-09-03，项目负责人授权修复并生成 WIN7-22，从 G0 重走受影响门禁）
- 背景：WIN7-21 在 Win7 D-013 CMD 当前候选用例中，PowerShell 已成功创建含中文和空格的工作区与环境
  变量，但 helper 返回后目标文件不存在；同一 `cmd.exe /d /s /c` payload 经管理通道直启成功。协议 v2
  已把 CMD 的 command 与 `argv[3]` 精确绑定，Runner 直启也使用 Windows verbatim 参数；helper 仍把整个
  argv 交给 CRT 引号算法，令 payload 内部双引号变成反斜杠加双引号。CMD 不采用 CRT 的反斜杠转义规则，
  因而命令语义被改变。该问题属于候选源码/原生字节缺陷，不是现场脚本或宿主能力缺失。
- 决策：（1）仅在协议 v2、`shellKind=cmd` 且 TrustedShell host 校验已确认 executable 身份、固定
  `/d /s /c`、`argv[3] == command` 后，helper 使用已引用 executable、固定开关和未经 CRT 二次转义的
  command payload 构造 Windows 命令行。PowerShell、其他批准 shell 与 v1 保持通用 argv 构造；协议、
  环境过滤、权限、审批、Job、取消和输出合同不变。（2）纯逻辑测试覆盖内部引号、环境变量、中文空格、
  重定向和 `&`；Win10 双构建 smoke 与 Win7 D-013 当前用例必须真实创建、读取目标 marker，并在文件断言
  前保存 helper 原始响应。（3）新增 A9-14 白名单和冻结前独审；WIN7-21 工件、证据及失败裁决不可变。
  WIN7-22 必须重跑 G0～G3、G5～G7，G4 只可对不受候选影响的稳定宿主事实轻量复核。A9-13 schema v4
  迁移/回滚与历史未受影响能力仅在精确源码、模块、夹具和证据哈希不变时标记
  `INHERITED_EVIDENCE_UNAFFECTED_EXACT_HASH`，不得写成当前候选直接 PASS。
- 后果：CMD 命令继续由用户/模型的已批准 command 交给 `cmd.exe` 解释，本修复不新增安全隔离，也不允许
  绕过目标绑定。通用 argv 构造仍不适用于 CMD `/c` payload；未来新增 CMD 启动入口必须复用该显式语义。
  helper 字节改变，因此旧 Win10 helper lock、WIN7-21 产品 lock/ZIP/authority 都不能用于 WIN7-22。
  开发机逻辑测试和继承证据不构成 Win10/Win7 PASS；任何受影响 Gate 失败继续 fail-closed。

## ADR-0112 WIN7-22 收口补录与开发构建基线分离

- 状态：Accepted（2026-09-07，负责人授权按已审查顺序修复构建基线、整合 PR #5 并同步状态）
- 背景：WIN7-22 候选外 2026-09-04 最终裁决已通过，仓库入口仍停在 G0；main 提交的 Runner
  dist 过期且不完整，整仓按模块 build/test 交错执行，使 Gateway 提前读取尚未构建的运行模块。
- 决策：补录绑定 `1c04644` 与 ZIP `5cc07f35…c4e8` 的 `A9_14_WIN7_22_GO_FOR_ALPHA`，更新
  AGENTS、状态页与 A9-14 任务索引；保留历史失败记录、4 直接与 9 继承的边界及 RC 前置。
  按本次明确授权在独立分支修复验证编排并补交 Runner dist，不改变 Runner 源码或冻结候选。
- 后果：新的源码提交不是 WIN7-22 候选身份；开发机测试不新增 Win7 PASS。Runner 运行 JS 与
  冻结 ZIP 比较只差 source-map 尾注，因此本次构建治理不触发候选重打包。验收原件继续存放在候选外，
  哈希与范围见 [核对报告](reports/2026-09/a9_win7_22_closeout_and_build_baseline_2026-09-07.md)。

## ADR-0113 执行指令按需加载与验证范围校准

- 状态：Accepted（2026-09-07，负责人授权先修三个高优先级 skill、精简全局加载、收拢仓库历史状态并处理重复 skill；仅本地修改和验证）
- 背景：全局执行手册与入口重复加载；部分 skill 带有无关技术栈、固定评分门槛和过宽工作流要求。
  仓库 AGENTS 的历史授权摘要重复当前状态与任务合同，增加读取与解释成本。
- 决策：仓库入口保留当前阶段、历史定位与不可变候选边界，状态详情集中在 STATUS，历史合同按任务索引定位；
  纯文档维护按相关治理要求读取。验证按风险与项目必需检查选择，通过后仅因新变更、失败或具体风险扩展。
  在已有授权内完成交付与必要修复；阻塞仅暂停依赖动作，但前置 Gate 失败仍停止全部下游 Gate。
- 边界：不修改 C14、C15/C16、实现允许路径、Accepted ADR 正文或历史任务书；不重开 A9-09～A9-14，
  不修改产品代码、冻结候选及验收材料，不产生新的 Win7 PASS，也不提交或推送。
  全局及共享 skill 变更在仓库外单独维护与备份，受实际文件写入权限约束；本 ADR 不声明其安装已完成。
- 验证：仓库运行 docs:check 与 diff/编码检查；规则通过小文档、局部 bug、UI 小修、Win7 验收四类隔离场景观察。
  文件精简量、场景观察、当前会话加载和新会话实际生效分别记录，不以字符减少推断费用或行为改善。

## ADR-0114 UI 过程反馈事件与投影扩展

- 状态：Accepted（2026-09-08，负责人授权依据 `docs/plans/UI_PROGRESS_IMPLEMENTATION_PLAN.md` 在 `codex/ui-optimization` 分支实施 UI 优化）
- 背景：Alpha 1 工作台对话流只呈现请求与最终结果，模型中间说明、工具活动、审批留痕与等待事实
  均不可见；Inspector 时间线按技术事件名显示；重启或轮询后过程不可回看。实现方案（用户已认可的
  修正版 Demo 为视觉基线）要求补上真实、及时、可回看的 Agent 过程反馈并重构工作台视觉。
- 决策：（1）core loop 新增事件类型 `model_note`：当本轮响应含 content 且发起 toolCalls 时，在执行
  工具队列前 emit，data=`{content, step}`，为步骤完整语义段（非逐 chunk），承载中间自然语言说明；
  最终答案仍只在 `turn_completed.finalMessage` 呈现一次。（2）`tool_start`/`tool_end` data 增加
  `callId`（provider 工具调用 ID，稳定配对身份）与 `step`。（3）事件身份以 `a9_events` 行 id
  （AUTOINCREMENT）为 `eventId`/`sequence`，跨重启稳定；运行时先持久化后入内存 timeline，持久化
  失败则该事件不进入 UI 投影（fail-closed）。（4）运行时在审批决定落库后补发 `approval_resolved`
  时间线事件（批准/拒绝均留痕，data 含 approvalId/decision/decidedAt/toolName）。（5）新增 IPC 动作
  `a9.events.query`，信封 schemaVersion 5→6，payload `{conversationId, turnId?, beforeEventId?,
  limit?}`，limit 默认 200、上限 1000，按 id 升序返回并带 `hasMore`；跨会话请求拒绝。（6）SQLite
  表结构不变（a9_events 版化 schema v4 校验沿用），新事件经版本化 payload 扩展。（7）脱敏边界不变
  （整步骤内容统一脱敏，沿用跨 chunk 累积语义）；Renderer 显示上限：单条说明 16 KB、单条工具输出
  8 KB，截断明示。（8）渲染安全：说明/路径/命令/输出一律 textContent，禁止 innerHTML 注入不可信
  文本。
- 边界：不修改 native helper、Runner/Policy 安全语义、Git 适配器与冻结 `release/**`；不新增依赖、
  运行时或权限模式；CSP 与 Renderer 单文件结构不变，不引入远程字体/新框架。
- 后果：旧记录无事件时 UI 明示"历史记录未包含过程"，不虚构回填。开发机测试不构成 Win7 PASS；
  真实 Provider 多工具任务、Win10 双构建、Win7 实机与打包发布均为 NOT_PERFORMED。验收以
  [A9-15 任务书](tasks/A9_15_UI_PROGRESS_FEEDBACK.md) 为准。

## ADR-0115 A9-15 WIN7-23 新候选与直接实机验收边界

- 状态：Accepted（2026-09-09，负责人授权提交 A9-15 范围改动、不推送，建立新候选合同并继续 Win7 实机验收）
- 背景：A9-15 已通过开发机定向测试与 Electron smoke，但未提交源码不能形成
  `external_acceptance_eligible=true` 的正式候选；WIN7-22 绑定旧源码与既有裁决，不得重绑或改判。
  A9-15 改动覆盖 Core 事件、State 查询、Shell IPC/Runtime 与 Renderer，因此需要当前候选直接证据，
  不能把开发机或管理员 SSH 预检写成 Win7 PASS。
- 决策：（1）候选编号 WIN7-23，沿用产品版本 `0.3.0-alpha.1`，但使用新的源码提交、input lock、验证 kit、
  ZIP/manifest 哈希、部署目录、release authority 和证据根。（2）Electron 22.3.27、D-013 v25 helper、
  better-sqlite3 8.7.0/ABI 110 均按 WIN7-22 已批准输入的精确哈希复用；native 源码、字节、协议与 Profile
  未变化，不重跑 native 双构建，也不继承其产品/Win7 结论为 WIN7-23 直接 PASS。（3）两个干净源码
  工作树独立装配完整产品并要求 ZIP 字节一致；候选哈希确定后必须由候选外独立批准记录和 SHA-256 pin
  放行，不能从候选或 sidecar 自签。（4）Win7 以普通用户、非提升令牌运行正式 Electron main/preload/
  schema IPC/renderer，八项当前候选用例覆盖身份/完整性/启动、过程事件、历史分页、审批与失败顺序、
  等待/Stop/清理、搜索/焦点/视觉、真实 Provider 多工具任务及后飞行。fixture smoke 不能满足真实 Provider。
- 后果：完成只能签发 `A9_15_WIN7_UI_INTEGRATION_PASS`，不重签或扩大
  `A9_14_WIN7_22_GO_FOR_ALPHA`，也不是 RC PASS。历史 WIN7-19～22 候选、失败与证据全部不可变。
  管理 SSH 仅用于严格主机密钥校验下的盘点、传输、哈希与证据回收；普通用户 GUI 证据仍需当前桌面会话。
  不推送，不纳入 `.trae/**`、连接资料、秘密、状态数据库或临时数据。

## ADR-0116 WIN7-23 验证启动失效、Win7 字体清晰度修复与 WIN7-24 新候选

- 状态：Accepted（2026-09-09，负责人要求修复验证启动方式、优化截图所示字体清晰度，提交后建立
  WIN7-24；明确禁止修改或重判 WIN7-23）
- 背景：WIN7-23 已通过双干净构建、候选/包完整性和普通用户令牌门，但自动 smoke 的外层 Electron
  Node 模式脚本再次执行打包 `electron.exe <driver.cjs>` 时，子进程固定加载 `resources/app`，没有执行
  driver 或生成 phase 报告；目标机截图还显示 Segoe UI 优先回退、9～11px 辅助文字和偏浅 muted 色令
  中文在 Win7 上偏细发虚。上述事实使 WIN7-23 后续验收 fail closed，不能用可见窗口或退出码补判。
- 决策：（1）WIN7-23 全部身份、工件、部署和证据冻结。WIN7-24 使用新源码提交、lock、kit、ZIP/
  manifest、候选外 authority、部署目录和证据根。（2）smoke 外层仍由候选 Electron Node 模式执行，
  但在候选外 run root 建立只含锁定 Electron 运行文件、`default_app.asar` 和验证 app/driver 的临时运行
  副本；副本不复制正式 `resources/app`，driver 通过显式环境变量加载候选内正式 main，继续覆盖真实
  preload/IPC/renderer。（3）汇总器要求 first/second/stop 三份报告存在、mode 精确、每项断言 PASS，
  journey/stop fixture 都收到请求；stop 新数据根先绑定正式工作区。（4）CSS 只调整离线 Win7 字体栈、
  整数基础字号、最小辅助字号和 muted 对比度，不引入字体、依赖、权限、网络或 CSP 变化。（5）复用
  WIN7-22 已批准的 Electron 22.3.27、D-013 v25 与 SQLite/ABI 110 精确输入；双干净构建后仍需独立
  authority hash pin 才能运行正式 WIN7-24 门禁。
- 后果：验证副本和其数据属于候选外临时证据运行目录，不是交付产品入口，也不能替代 package integrity；
  产品源码仍以候选内正式 main/preload/IPC/renderer 为被测入口。WIN7-24 自动 fixture smoke 不能满足真实
  Provider 用例，开发机或管理员结果不能替代普通用户非提升证据。完成结论仍最多为
  `A9_15_WIN7_UI_INTEGRATION_PASS`，不是新的 Alpha/RC PASS；不推送。

## ADR-0117 Alpha 2 Review、运行中输出与自适应工作台需求基线

- 状态：Accepted（2026-09-09，负责人明确将 Shell 中间输出、完整 Review 和左右栏自适应改进移入 Alpha 2；
  本裁决只接受需求方向，不授权实现）
- 背景：WIN7-24 真实 Provider 检查已显示任务运行状态、等待时长与工具活动，但 Shell stdout/stderr 仍在
  工具结束后批量进入 UI，不是运行中增量输出。当前左栏的工作区卡、导航、任务与信任提示挤压对话目录，
  常见目标机视口只能看到 1～2 条；右侧 Inspector 在桌面宽屏固定占列，左右栏关闭后也没有完整的主区
  四态重排合同。Review 已由 ADR-0096 延期到 `0.3.0-alpha.2`。
- 决策：（1）以 [A9-16](tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md) 冻结 Alpha 2 需求，任务状态
  `PLANNED_NOT_AUTHORIZED`；实现前须另行批准分支、基线、允许路径与验证合同。（2）完整 Review 包含私有
  staging、逐文件接受/拒绝、revision/基线/预览/accepted-set 哈希绑定、原子 Apply、漂移拒绝和无重放恢复；
  Review 后端缺失继续零写入 fail-closed。（3）Review 审批卡只属于 Review；Full Access 普通写入不进入
  Review，也不显示 Review 卡。ADR-0089 的删除、外部写入、push、提权等高影响操作一次性目标绑定确认继续
  保留，并以不同名称和审计类型呈现；移除该安全边界需另行明确授权和 ADR。（4）Shell stdout/stderr 必须
  在进程仍运行时由 helper/Runner 贯通 Core、持久化/IPC 和 Renderer；跨块编码、顺序、背压、有界输出、
  脱敏、取消和清理均为合同的一部分，前端切片最终输出不得冒充实时。（5）左侧对话目录优先获得剩余高度；
  1366×768、100% DPI 默认态至少完整显示 4 条普通对话。桌面左右栏均可独立开关，主区覆盖四种组合并
  使用释放空间；窄屏抽屉、键盘/焦点、滚动/草稿/活动状态与 100%/125% DPI 纳入验收。
- 后果：Alpha 2 需要跨 native helper 协议、Runner、Core、State、IPC/Renderer、Review staging 和恢复链的
  新实施任务与独立审查，并在新候选上完成开发机、Win10 与普通用户非提升 Win7 验收。本 ADR 不修改
  Alpha 1 产品字节，不重开 A9-15，不改判或重签 WIN7-19～24，也不产生任何新 PASS。

## ADR-0118 WIN7-24 重启历史投影修复与 WIN7-25 新候选

- 状态：Accepted（2026-09-09，负责人确认按完整修复、回归、本地提交、双干净构建和 Win7 复验方案继续）
- 背景：WIN7-24 普通用户真实 Provider 多工具任务已完成并以正常退出码关闭。重启后中央对话恢复且未观察
  到模型或工具重放，但 Inspector 活动为空并显示 idle，单一全局结果错误停留在较早的
  `failed · not_applicable`，而最新轮次应为 `completed · verified`。管理通道只读打开目标状态库并设置
  `query_only` 后确认 133 条事件仍在，最新 task、turn、checkpoint 与 terminal event 均一致完成并验证；
  因而是显示投影缺陷，不是持久化损坏、数据丢失或重放。
- 决策：（1）Renderer 为当前会话维护按 eventId 去重的 Inspector 事件投影；实时 snapshot 与持久化
  `queryEvents` 共用该投影，切换会话先清空再并入，Inspector 只显示当前会话最近有界事件。（2）轮次结果卡
  继续按各轮次事实/事件投影；单一全局结果不再由每个卡片的增量更新副作用写入，而在完整事实序列渲染后
  明确取最新轮次结果。（3）增加回归覆盖无 turnId 的会话事件、重启查询事件进入 Inspector，以及旧失败
  轮次重新渲染时不能覆盖最新成功结果；IPC、SQLite schema、Runtime、权限、Runner/Policy 和秘密边界均
  不变。（4）WIN7-24 永久冻结为 `FIX_BEFORE_WIN7_25_VALIDATION`。WIN7-25 使用新源码提交、lock、kit、
  ZIP/manifest、候选外 authority、部署目录和证据根；双干净工作树构建必须字节一致，受影响用例必须由
  普通用户非提升正式产品入口重验。
- 后果：WIN7-25 可按精确哈希继承未变化的 WIN7-22 Electron 22.3.27、D-013 v25 和 SQLite/ABI 110
  输入，但不能继承 WIN7-24 的失败用例为 PASS，也不能修改或重判 WIN7-23/24。开发机测试、构建一致性和
  管理只读诊断均不构成 Win7 PASS；最终结论最多仍为 `A9_15_WIN7_UI_INTEGRATION_PASS`，不是 Alpha/RC
  重签。本决策不授权 Alpha 2 的 Review、Shell 实时输出或布局需求实现，也不授权推送。

## ADR-0119 WIN7-25 验证缺口修复与 WIN7-26 可执行投影合同

- 状态：Accepted（2026-09-10，负责人要求按已形成方案直接修复，并延续本地提交、双干净构建与实机流程）
- 背景：WIN7-25 的 Renderer 修复经同输入行为对照有效，但对应 Jest 只分别验证结果 helper 与源码位置，
  没有执行旧失败事件补载触发的连续渲染；恢复旧卡片写全局结果的副作用后测试仍通过。正式 Electron 重启
  场景最后未在退出前形成旧失败→较新成功。WIN7-25 kit 的用例仅从 W24 替换编号，没有把 Inspector 当前
  会话持久事件恢复和旧失败不得覆盖较新成功设为明确签发条件。
- 决策：（1）不重写已验证有效的 Renderer 产品实现；Renderer 契约测试以最小 DOM 替身执行真实
  `renderConversation`/结果卡连续调用，先显示旧失败与较新成功事实，再补载旧失败详情，断言最新卡签名和
  全局 `completed · verified` 不变；测试内恢复旧副作用时必须观察到失败。（2）正式 Electron fixture 通过
  Provider HTTP 失败形成旧 `failed · not_applicable`，再经真实 edit+Shell 验证形成较新
  `completed · verified`；第二进程绑定 query event ID、turn ID、Inspector DOM 导出和最新持久化事实，
  同时保留审批拒绝、无重放、旧审批拒绝和 Stop 清理断言。（3）WIN7-26 kit 新增稳定用例
  `W26-03-INSPECTOR-PERSISTED-RESTART` 与 `W26-04-LATEST-OUTCOME-PROJECTION`；报告器要求结构化
  `projection_evidence` 及其候选外 DOM 文件哈希。新增 assertion 缺失、状态非 PASS、投影证据缺失或身份/
  顺序/DOM 不一致均拒绝签发。（4）WIN7-25 的源码提交、out-a/out-b、ZIP、manifest、kit、lock、authority、
  构建树和复核证据全部冻结。WIN7-26 使用新源码提交、lock、kit、ZIP/manifest、独立 authority、部署目录
  和证据根；W23/W24/W25 profile 与合同保持原样。
- 后果：开发机真实 Electron fixture 可证明正式 main/preload/IPC/Renderer 的受影响链路，但不能满足真实
  Provider 或普通用户非提升 Win7 证据。候选哈希形成后仍须独立 authority pin；未完成当前候选实机门前
  保持 `WIN7_26_NOT_PERFORMED`。本决策不开放 ADR-0117/A9-16 的 Alpha 2 范围，也不授权推送或修改历史候选。

## ADR-0120 WIN7-26 投影验证四项 P2 修复与 WIN7-27 可执行投影合同

- 状态：Accepted（2026-09-10，负责人要求以 `2e5a534` 为修复基线补齐四项 P2、逐项复核后按既有授权
  本地提交不推送，并建立 WIN7-27 合同、双干净构建、外部放行与普通用户非提升 Win7 验收）
- 背景：WIN7-26 的只读复核确认产品投影修复与构建一致性成立，但发现四项 P2。（R1）报告器只核对投影
  附件的存在、位置与哈希，`projection_evidence` 是手填平行字段；提供哈希正确但内容非 JSON、属于另一
  会话、事件为空或结果不符的 DOM 附件仍能通过，同一 turn ID 同时充当旧失败与新成功也被接受。
  （R2）Electron driver 的新断言只检查 Inspector 行数大于零并包含"任务失败"/"任务完成"，未逐行绑定
  event ID、未验证内容与顺序等于查询、未证明切换会话无残留，替换观察值后仍通过。（R3）WIN7-26 kit 用
  `LATEST-OUTCOME-PROJECTION` 替换了 `APPROVAL-FAILURE-ORDER`，实际 kit 不再要求审批先于恢复的
  tool_start、拒绝零目标副作用、失败/取消/清理未确认不得标记成功、历史查询失败后的可见重试且无重复。
  （R4）共享 driver 无条件发送 `record expected provider failure` 并等待 `failed · not_applicable`，
  构建器仍把同一 driver 复制进 W23/W24/W25/W26 profile，而只有新候选 fixture 为该提示返回 503；
  历史 profile 的构建因而只是"闭包存在"，不是协议兼容。
- 决策：（1）机器可读投影导出成为唯一事实来源。正式 driver 必须导出 `A9_PROJECTION_QUERY_EXPORT`
  与 `A9_PROJECTION_DOM_EXPORT`（schema_version 1）JSON 附件；报告器必须实际解析附件字节并与报告字段
  交叉核对，覆盖会话身份、event/turn ID、查询顺序、去重、显示范围规则与终端结果。附件格式错误、会话
  矛盾、缺行、乱序、重复、额外行、结果不符，或旧失败与新成功的 turn ID 相同，均拒绝签发。
  （2）Electron driver 按 Inspector 有界显示范围（`LAST_60_BY_EVENT_ID_ASC`）逐行核对 event ID、turn ID、
  文本与顺序；增加切换会话后无上一会话残留并切回后逐行复原的检查；对缺行、乱序、重复、跨会话残留做
  观察值层面的负向敏感性检查，负向检查必须失败，正向必须通过。（3）保留审批决定先于恢复 tool_start、
  拒绝零目标副作用、失败/取消/清理未确认不得标记成功、历史查询失败后可见重试且无重复四项原有签发
  要求，并在其基础上追加投影用例；新增用例必须由同一 kit 的 assertion 数量与 verifier 约束共同强制，
  不得以替换编号的方式移除既有要求。（4）新 driver 协议（故障轮次、较新成功轮次与投影导出）只在显式
  启用该协议的 WIN7-27 与开发机 fixture 生效；历史 W23/W24/W25 profile 在未启用时走兼容路径，
  构建器不得无条件把新协议强加给历史 profile，并须有 fixture/协议级回归证明，不以文件闭包存在代替
  协议兼容。（5）WIN7-26 的源码提交、out-a/out-b、ZIP、manifest、kit、lock、authority、构建树和复核
  证据全部冻结，本决策不修改或重判 WIN7-25/26。WIN7-27 使用新源码提交、lock、kit、ZIP/manifest、
  候选外独立 authority、部署目录与证据根，并复用未变化的 Electron 22.3.27、D-013 v25 与 SQLite/ABI 110
  精确输入哈希。修改和新增限定在 A9-15 §14 列出的路径内，本地提交不推送。
- 后果：四项 P2 的关闭需要开发机正负向测试、历史 profile 回归、真实 Electron smoke 与静态检查共同
  支撑，并由独立复核逐项确认；任何一项未复核前不得声称 WIN7-26 已具备完整可执行验收闭环。候选哈希
  形成后仍须候选外独立 authority pin；在普通用户非提升 Win7 完成当前候选验证前保持
  `WIN7_27_NOT_PERFORMED`，结论最多为 `A9_15_WIN7_UI_INTEGRATION_PASS`，不重签 Alpha/RC，也不开放
  ADR-0117/A9-16 的 Alpha 2 范围。

## ADR-0121 WIN7-27 复核四项验收缺口修复与 WIN7-28 新候选

- 状态：Accepted（2026-09-10，负责人要求按 `docs/plans/WIN7_27_ACCEPTANCE_GAPS_REPAIR_PLAN.md` 实施
  F1～F4 修复，完成自检后交独立模型复验；本 ADR 记录的是修复范围与新候选授权，不构成该方案文件的批准）
- 背景：`32c5f6b`（ADR-0120）有实质改进，但仍存在四项 P2 级验收逻辑缺口。（F1）DOM 附件的
  `displayed_outcome` 与 `latest_persisted_turn_id` 被解析后丢弃，报告只比较自身平行字段；把附件结果改成
  `failed · not_applicable`、把最新 turn 指向旧失败或删除两个字段并重算哈希后仍判 PASS。（F2）逐行核对
  只验证 event ID、turn、行数、去重，文本仅要求非空，附加断言只匹配四类事件标签；保留 ID 与标签而替换
  全部实际内容仍通过，查询导出也未携带重建文字所需的 payload/时间事实。（F3）`approval_resolved` 先于
  恢复 `tool_start` 的断言对混合活动列表做 `.every(...)`，不要求任何恢复工具活动存在，空列表即满足；
  且历史查询失败后可见重试、非零退出/工具错误/清理未确认等场景没有被实际执行。（F4）fixture 只有 40 条
  事件而产品首次加载最近 300 条，`FULL_HISTORY_ALREADY_LOADED` 无按钮、无请求也被判 PASS，无法捕获
  只发生在 `beforeEventId` 补载合并后的结果回退。
- 决策：（1）以附件为唯一事实来源：DOM 附件必须保留并由报告器强制校验 `displayed_outcome`、
  `latest_persisted_turn_id` 与阶段标识，与查询导出的最新终态、正式 snapshot 独立采集的 turn 身份交叉
  比较；报告平行字段只能由附件推导，附件之间会话、阶段与候选绑定必须一致；结果不符、turn 不符、字段
  缺失、类型错误、阶段或会话错绑、旧新轮次共用 turn ID 一律拒绝。（2）逐行内容改为独立推导后核对：
  查询导出携带重建规范化显示文本所需的最小脱敏事实，期望行表示由查询事实推导、实际行只从 DOM 观察，
  driver 与报告器采用同一证据契约（共享契约模块，避免两套规则漂移）；保留 ID 与标签但替换关键内容、
  交换两行文字、替换时间或另一轮次内容，均须由正向判定所用同一函数拒绝；切回与补载复用同一判定。
  （3）F3 恢复真实执行证据：使用能产生恢复后工具活动的受控审批场景，按同一 approval/turn 绑定并强制
  `tool_start` 存在且决定更早；拒绝场景记录目标前后存在性与字节哈希；非零退出、工具错误、取消、清理
  未确认分项覆盖；历史查询失败后可见重试且无重复。无可安全制造的子项在隔离实例内以记录清楚的测试替身
  执行或记 `NOT_PERFORMED`，不以其他场景代替、不修改冻结源码、不降低真实清理保证。（4）F4 构造旧失败
  终态位于首次查询范围之外的受控会话，证明 `hasMore=true`、真实发出 `beforeEventId` 分页请求、旧失败经
  分页加入已加载历史且较新成功结果不变；查询附件保存真实 `limit`/`beforeEventId`/`hasMore`/返回范围，
  不得硬编码 `has_more=false`，不得以按钮存在、等待结束或行数相同替代加载成功。（5）WIN7-27 的源码身份、
  ZIP、manifest、kit、lock、authority、构建树与复核证据全部冻结；修复以 WIN7-28 为新候选，使用新源码
  提交、lock、kit、ZIP/manifest、候选外独立 authority、部署目录与证据根，并复用未变化的 Electron
  22.3.27、D-013 v25 与 SQLite/ABI 110 精确输入哈希。修改限定在 A9-15 §15.2 列出的路径内，本地提交不推送。
- 后果：本轮闭环需要 F1～F4 的正负向测试、历史 profile 协议运行回归、真实 Electron 流程与静态检查共同
  支撑，并由独立复验重新构造 F1/F2 的语义变异、核对 F3 的恢复工具事件与 F4 的真实分页，而不是只读
  "全部通过"汇总。任何一项未独立复验前不得声称 WIN7-27 已具备完整可执行验收闭环。开发机 PASS 不升级为
  Win7/Alpha/RC PASS；在普通用户非提升 Win7 完成当前候选验证前保持 `WIN7_28_NOT_PERFORMED`。本决策不
  开放 ADR-0117/A9-16 的 Alpha 2 范围。

## ADR-0122 WIN7-28 投影证据格式治理与阶段/分页/时间深度交叉约束

- 状态：Accepted（2026-09-11，负责人确认按 WIN7_28_FOLLOWUP_REPAIR_HANDOFF 方案闭环 RF01～RF04 并作为新候选规范）
- 背景：WIN7-28 独立复核及后续交接确认四项深度缺口：（RF01）正式产品 smoke 流程未把查询失败可见重试作为独立 `retry` 阶段编排，且对关键断言（包含重试目标绑定、投影协议和报告可解析性）未执行全集 fail-closed；（RF02）Electron driver 在多轮次和阶段切换中未能把各阶段的即时观察快照（`restartObserved`、`olderLoadObserved`、`sessionSwitch`）直接穿透绑定至投影导出与断言，存在被后续重新取样掩盖的风险；（RF03）分页链式事实（`validatePagingChain`）及报告器交叉核验对五类极端语义反例（旧失败从实际成员移除、自造不存在于查询导出的 turn ID、`has_more=false` 后继续请求、DOM 观察与已加载摘要矛盾、忽略实际请求观察）缺乏深度约束；（RF04）独立时间基准探针使用固定偏移在跨夏令时（DST，如纽约 EDT/EST）场景下存在 1 小时偏差风险，缺乏显式 `time_zone` 驱动的日期感知时区转换。
- 决策：（1）RF01 烟测独立阶段与断言强制全闭环：`a9-win7-28-smoke.cjs` 在 `second` 与 `stop` 之间新增独立的 `retry` 阶段执行，严格消费第二进程上报的 `second.retryTarget.conversationId` 并记录 `A9-W28-RETRY-TARGET-BOUND`；要求 10 项关键断言全量存在且 PASS（`A9-W28-REQUIRED-ASSERTIONS-PRESENT`），任一断言缺失或失败则整体判定 FAIL。（2）RF02 阶段即时观察快照穿透与防掩盖：`a9-06-driver-entry.cjs` 将 `restartObserved`、`olderLoadObserved` 的即时 DOM 观察结果直接供 `runProjectionAcceptance` 断言消费；DOM 导出 schema 升级为 3，各阶段严格绑定阶段独立的 `latest_persisted_turn_id`；即时观察快照损坏立即引发断言失败，后续重新采样不得掩盖。（3）RF03 分页链事实与报告器深度交叉约束：`a9-projection-contract.cjs` 中的 `validatePagingChain` 强制验证：请求必须实际被观察到（`request_observed === true`）、布尔值 `has_more=false` 后不得存在后续页、各页终态事件必须严格包含在 `event_ids` 成员中、旧失败必须包含在第一页或响应页的 `event_ids` 中、DOM 事实与加载摘要必须一致；`a9-win7-28-report.cjs` 强制将报告级旧失败及分页终态与独立 `query.events` 的 turn ID 及事件类型严格交叉校验，拒绝自造 turn ID。（4）RF04 显式时区与夏令时（DST）日期感知基准：时间基准引入 `probe_version: 2` 与显式 `time_zone` 字段；`deriveTimeBaseline` 与 `timestampsConsistent` 基于 `Intl.DateTimeFormat` 独立推导具体事件时间戳所在日期的真实 UTC 偏移，精确区分纽约夏令时（EDT UTC-4）与冬令时（EST UTC-5），并保留对固定偏移（如 Asia/Shanghai UTC+8）及旧版 probe_version 1 的兼容回退；时区非法或与探针冲突时 fail-closed。（5）治理与版本冻结：本 ADR 承载于 A9-15 授权范围内；不改动 Accepted ADR-0121，不影响未提交的 Alpha 2 ADR-0117 草案；所有修改限定于 A9-15 允许路径内，本地修改不推送；开发机验证通过不等于 Win7 实机通过，实机验收前保持 `WIN7_28_NOT_PERFORMED`。
- 后果：解决了即时快照掩盖、分页反例穿透、夏令时漂移及 smoke 重试断言缺失四大风险，使投影验收链具备真正的语义抗篡改能力；代价是 DOM 导出格式与契约校验更为严格，任何不匹配即刻 fail-closed。开发机测试通过不构成 Win7 PASS；未完成当前候选实机门前保持 `WIN7_28_NOT_PERFORMED`。

## ADR-0123 A9 启动测量与有限历史投影

- 状态：Accepted（2026-09-12，负责人在启动优化评估后明确要求实施）
- 决策：按 [A9-17](tasks/A9_17_STARTUP_MEMORY_OPTIMIZATION.md) 修正测量口径，先显示可信本地窗口、以共享初始化屏障保护 IPC；首屏非必要数据按需加载，新增有限历史投影与分页，模型上下文不受 UI 分页影响。兼容旧调用默认合同，新增分页字段/动作明确版本；不改变数据库物理格式、安全模型或原生依赖。
- 后果：窗口显示不等于执行就绪，初始化失败保持拒绝执行并可诊断；恢复、退出和旧历史必须回归。采样单位、归因修正后的数据不得与旧错误口径直接比较；没有 Win7 同候选测量不承诺内存降幅。本授权不开放 A9-16 其他功能，不授权提交、推送或部署。

## ADR-0124 A9-16 UI 子集实施授权与 Review 延期

- 状态：Accepted（2026-09-14，负责人指令：实现左侧对话区与响应式 UI，完整 Review 暂缓）
- 背景：ADR-0117 只冻结 Alpha 2 需求方向，并把 [A9-16](tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md)
  保持在 `PLANNED_NOT_AUTHORIZED`，要求实现前另行批准分支、基线、允许路径与验证合同。负责人于
  2026-09-14 要求先落地 U01–U07 的左侧对话区与响应式四态，把完整 Review（R01–R05）与 Shell
  运行中输出（S01–S06）留在后续授权。
- 决策：（1）以 A9-16 §7 冻结本轮授权：分支 `codex/a9-alpha2`、基线 `7d06789`、允许路径限于
  `renderer/workbench.html`、`renderer/a9-workbench.css`、`renderer/a9-workbench.js`、
  `tests/product/a9-workbench-contract.test.ts` 及任务/状态/报告/设计文档。（2）桌面与抽屉断点
  沿用既有 1200px / 800px；桌面四态由 `.workbench` 的 `rail-closed`/`inspector-closed` 状态类驱动，
  只切类不重建 DOM（U05）；抽屉态（`.open` + backdrop）与桌面折叠态是两个互不复用的状态机，
  跨断点缩放只允许做收敛清理与 `aria-expanded` 重推，不得在桌面断点上折叠侧栏。（3）左侧对话
  目录按 `activity` 展示「进行中 / 更早」组头，行密度为单行「标题 + 状态·时间」；信任注记默认折叠。
  （4）侧栏状态维持会话内，不做跨重启持久化。（5）R01–R05 与 S01–S06 本轮明确不实现：权限模式
  维持 Alpha 1 的 Full Access / Read Only，Review 入口继续 disabled 且 fail-closed（ADR-0096 不变）。
- 后果：U01–U07 可在产品渲染层落地，并由契约测试与左栏静态高度预算模型约束（U02 的"至少 4 条"
  以固定 chrome 合计锁定，任何撑大左栏或组头的改动会直接失败）。代价是左栏密度、断点行为与状态
  机边界被钉进契约，调整需同步更新预算模型。本 ADR 不重开 A9-15，不改判或重签 WIN7-19～28 任何
  候选与证据，不签发 Alpha 2 PASS / Win7 PASS；真实 Electron 视觉与 1366×768、125% DPI 实机回归
  保持 `NOT_PERFORMED`。不授权提交、推送或部署。

## ADR-0125 A9-16 UI 子集 WIN7-29 候选合同与 A9-17 候选豁免

- 状态：Accepted（2026-09-14，负责人指令：先冻结候选、候选粒度分开、A9-17 不建产品候选、
  放宽唯一超时项）
- 背景：ADR-0124 只给 A9-16 §4 U01–U07 实现授权，未授权候选、提交或实机验收；ADR-0123 对
  A9-17 同样只给实现授权。两份任务书均为 `Win7-Validation: NOT_PERFORMED`，`RELEASE_PROFILES`
  止于 `WIN7-28`，仓库内不存在任何 `WIN7-29` 引用。更关键的是 A9-16 §7 的允许路径白名单只含
  3 个 renderer 文件、1 个契约测试与若干文档，零命中 `release/win7-product-v3/**` 与
  `scripts/release/**`；而该构建器对每个候选都有硬编码分支，新增候选必然要改 profile 条目、
  `A915_CANDIDATES`/`A915_DIRECT_SMOKE_CANDIDATES` 集合、驱动与 kit 内容分支、
  `createA915ValidationKit()` 的 ADR 映射与历史候选链与用例开关、`copyContractEvidence()` 与
  `validateA9Lock()` 的 provenance 判定。据 AGENTS.md §4，白名单扩展必须由负责人指令发出，
  不得自行扩写后据以实施。故在负责人裁决前无法合法产出候选。
- 决策：（1）候选粒度按负责人裁决"分开"：本轮只建立单一候选 `WIN7-29`，范围限于 A9-16 §4
  U01–U07 的 renderer 改动（`workbench.html`、`a9-workbench.css`、`a9-workbench.js`）；
  Review（R01–R05）与 Shell 运行中输出（S01–S06）不进入候选，Review 入口维持 disabled 且
  fail-closed。（2）A9-17 按负责人裁决不并入 WIN7-29，也不单独建立产品候选；其 Win7 采样沿用
  A9-17 §5 的自身授权与 `scripts/mvp_acceptance/a9-startup-baseline/**` 执行包，须绑定源码与
  工件哈希，不得以 WIN7-29 的结论代替。（3）版本与能力集保持 Alpha 1：`validateA9Lock()` 硬校验
  `release_id === 'WIN7-CODING-AGENT-A9-ALPHA1'` 与 `version === '0.3.0-alpha.1'`，本候选沿用该
  组合；Review 未启用，权限模式维持 Full Access / Read Only（ADR-0096 不变），不得据 WIN7-29
  改判或宣称 Alpha 2 PASS。（4）按 A9-15 §15.2 先例扩展 A9-16 允许路径：`scripts/release/
  build-a9-product-v3.mjs` 仅新增 `A9-16-INPUTS-RESPONSIVE-UI-WIN7-29` profile 与对应候选分支、
  验收用例、provenance 判定；`scripts/release/test/a9-package.test.mjs` 增加 WIN7-29 正负向回归
  与历史 profile 兼容检查；`release/win7-product-v3/` 下新增 WIN7-29 的 input lock、validation
  kit、integrity/report/smoke 脚本、CMD 包装、`A9_16_WIN7_29_VALIDATION.md` 与 `README.md` 候选
  说明；`docs/DECISIONS.md` 仅新增本 ADR。WIN7-22～28 的 profile 行为、冻结 release 文件与既有
  证据不得改写。（5）唯一未闭合门禁项按负责人裁决放宽超时：`a9-product-contract.test.ts` 的
  "delivers explicit Chinese encodings, binary metadata and large-file ranges" 真实耗时 5～9 秒，
  触发 jest 默认 5000ms 上限，加 `--testTimeout=120000` 复跑断言全部通过；为该用例显式声明更长
  超时并在此记录理由。不得为通过而删改断言、跳过用例或弱化其余门禁。（6）候选须来自两个独立
  干净工作树的逐字节一致构建，`external_acceptance_eligible` 必须为 true；`--allow-uncommitted`
  不得用于正式候选。候选哈希形成后由候选外独立 `WIN7_29_RELEASE_AUTHORITY` 与 SHA-256 pin 收口。
  （7）允许把本轮改动冻结为本地提交；不推送、不打标签。未在普通用户非提升 Win7 完成当前候选
  验证前保持 `WIN7_29_NOT_PERFORMED`。
- 后果：A9-16 的 UI 子集首次获得可执行、可验收的候选身份，Win7 实机验收从"治理阻塞"转为"待执行"；
  1366×768 × 125% 真实 DPI 回归、桌面四态切换不溢出、跨断点只做状态机收敛、左栏行容量等既有
  `NOT_PERFORMED` 项成为可观测验收目标。代价是发布管线再次增加一个候选分支，构建器与
  `a9-package.test.mjs` 的历史兼容负担上升，必须由回归测试守住 WIN7-22～28 的既有行为。本 ADR 不
  重开 A9-15，不改判或重签 WIN7-19～28 任何候选、证据与结论，不签发 Alpha 2 PASS / Win7 PASS，
  也不改变 A9-17 的授权边界。放宽单条用例超时不构成对断言强度或安全模型的放松。

## ADR-0126 WIN7-29 构建缺陷判定与 WIN7-30 修正候选换发

- 状态：Accepted（2026-09-14，负责人指令：换发新标签、保留 WIN7-29 为失败构建、补残留守卫）
- 背景：ADR-0125 冻结 `WIN7-29` 后，候选外预检阶段发现 `release/win7-product-v3/
  a9-package-integrity-w29.cjs` 有 5 处字面量未从 W28 重基线：`gates.win7` 仍为
  `NOT_PERFORMED_WIN7_28`（候选 input lock 实为 `NOT_PERFORMED_WIN7_29`）、`provenance.task`
  仍为 `A9-15`（实为 `A9-16`）、`provenance.previous_candidate` 仍为 `WIN7-27`（实为 `WIN7-28`）、
  `provenance.previous_candidate_result` 仍为 `ACCEPTANCE_GAP_REPAIR_REQUIRED`（实为
  `A9_15_WIN7_UI_INTEGRATION_PASS`）、`provenance.change_scope` 仍为
  `DOM_OUTCOME_TURN_IDENTITY_ROW_CONTENT_PAGINATION_AND_APPROVAL_EXECUTION`（实为
  `RESPONSIVE_LEFT_CONVERSATION_PANE_DESKTOP_FOUR_STATE_AND_BREAKPOINT_REGRESSION`），另有
  `approved.kind`/`approved.status` 仍为 `WIN7_28_RELEASE_AUTHORITY` /
  `APPROVED_FOR_WIN7_28_VALIDATION`，与 `A9_16_WIN7_29_VALIDATION.md` 与 `README.md` 所载的
  `WIN7_29_RELEASE_AUTHORITY` / `APPROVED_FOR_WIN7_29_VALIDATION` 契约相互矛盾。以符合文档契约的
  候选外 authority、真实 input lock 与真实 registry 调用包内 `verifyAcceptanceCandidate()`，实测
  以 `A9_W29_INPUT_LOCK_CONTRACT_INVALID` 被拒，即候选自带的校验器拒绝候选自身携带的 input lock，
  Win7 实机验收无法通过第一条命令；且不存在可用的标签组合（provenance 校验先于 authority 校验
  失败）。该文件被 `release-manifest.json` 哈希绑定并随 ZIP 发布，包外补丁不可行。根因是 W29 派生
  时的残留守卫只覆盖连字符形式（`W28-`、`W28PKG-`），未覆盖下划线形式 `WIN7_28_`；而
  `a9-package.test.mjs` 的 WIN7-29 用例只核对 `KIT_ID` 与用例数，未核对 provenance/authority
  字面量，故缺陷未被回归捕获。构建期 `developer_package_integrity: PASS` 只走 `verifyFullTree()`
  与闭包检查，不调用 `verifyLock()`，因此该缺陷只在实机验收路径上暴露。
- 决策：（1）按既有修复先例换发新标签：`WIN7-29` 判定为**构建缺陷**并保留为失败构建，其冻结身份
  （commit `4bdf87b`、ZIP `a69d92c4…`、manifest `46f11c0d…`）与证据原样留档；不得复用 `WIN7-29`
  标签或哈希改判，也不得据此声称任何 Win7 结论。（2）修正候选为 `WIN7-30`，修正范围严格限于上述
  5 处字面量使其与 input lock 逐项一致，不得借修复扩大候选范围、变更用例集或弱化任何断言。
  （3）补残留守卫，两处：`scripts/release/test/a9-package.test.mjs` 新增"派生脚本的
  gates/provenance/authority 字面量必须与对应 input lock 逐项一致"的断言；
  `scripts/release/build-a9-product-v3.mjs` 在派生后增加残留扫描，覆盖下划线形式
  （`WIN7_28_`、`APPROVED_FOR_WIN7_28_`）等连字符守卫覆盖不到的形式，命中即构建失败。
  （4）候选范围、版本与能力集与 §8 一致：仍限于 A9-16 §4 U01–U07 的 renderer 改动，版本组合仍为
  `WIN7-CODING-AGENT-A9-ALPHA1` / `0.3.0-alpha.1`，Review 与 Shell 运行中输出不开放，Alpha 权限
  模式维持 Full Access / Read Only（ADR-0096 不变）。（5）允许路径按 A9-16 §9 扩展：
  `scripts/release/build-a9-product-v3.mjs`、`scripts/release/test/a9-package.test.mjs`、
  `release/win7-product-v3/` 下 WIN7-30 的 input lock、kit、integrity/report/smoke 脚本、CMD 包装与
  `A9_16_WIN7_30_VALIDATION.md`、`README.md` 候选说明与失败构建记录，以及 `docs/DECISIONS.md`
  （仅新增本 ADR）、`docs/STATUS.md`、`docs/tasks/README.md`。WIN7-22～29 的 profile 行为与冻结
  release 文件不得改写。（6）候选须来自两个独立干净工作树的逐字节一致构建，
  `external_acceptance_eligible` 必须为 true，`--allow-uncommitted` 不得用于正式候选；哈希形成后由
  候选外独立 `WIN7_30_RELEASE_AUTHORITY` 与 SHA-256 pin 收口。（7）允许把本轮改动冻结为本地提交；
  不推送、不打标签。未在普通用户非提升 Win7 完成 WIN7-30 验证前保持 `WIN7_30_NOT_PERFORMED`。
- 后果：候选校验链路恢复自洽，Win7 实机验收重新具备可执行前提，且"派生脚本未重基线"这一类缺陷由
  回归测试与构建期扫描双重拦截，不再依赖人工逐字核对。代价是发布管线再增一个候选分支与一层派生
  守卫，`a9-package.test.mjs` 的历史兼容负担继续上升。本 ADR 不改写 ADR-0125 正文，不重开 A9-15，
  不改判或重签 WIN7-19～29 任何候选、证据与结论，不签发 Alpha 2 PASS / Win7 PASS，也不改变 A9-17
  的授权边界。`WIN7-29` 的失败记录不得被删除或改写。

## ADR-0127 WIN7-30 实机 G2 失败与 WIN7-31 修复候选换发

- 状态：Accepted（2026-09-14，负责人指令：批准修复与换发新候选）
- 背景：WIN7-30（source `640571ea11a402b4b827cf31175d849ec729d970`，ZIP SHA-256
  `1ec123e4f73dbb6607007e34460350164a06a6dd9035f4c031ff4782fc74af90`）在 `10.211.42.40`
  以普通用户 `dccs-chaizl-pc\agent`、Medium/non-elevated 令牌执行 run
  `add716dd-c45e-4a18-ab5f-0ba1fc19d6c3`。G1 包完整性通过；G2 自动 smoke 的四个 Electron 阶段均
  退出 0、fixture 共 325 次请求，但 75 项中两项直接失败并引起必需断言汇总失败：（1）候选内
  `a9-win7-30-driver.cjs` 与共享 `a9-06-driver-entry.cjs` 逐字节相同，仍发布 `W28-03`、`W28-09`、
  `W28-10` 和 `A9_W28_PROJECTION_EVIDENCE_PACKAGE`，而 W30 smoke 按 `W30-09` 读取，触发
  `Cannot read properties of undefined (reading 'projection_evidence')`；（2）对话搜索过滤与已归档结果
  正常，但桌面左栏处于 `.rail-closed` 时 Ctrl+K 对不可见 input 调用 `focus()`，观察值 `focused=false`。
  硬门失败后真实 Provider 未执行；原 ZIP 复核哈希不变，结束后无残留 Electron 进程。
- 决策：（1）WIN7-30 固定为 `G2_FAILED`，其包、authority、run 与候选外证据原样保留，不得补丁改包、
  重签、删除或复用哈希改判。（2）换发 `WIN7-31`；修复范围仅为：构建时从共享 driver 精确替换上述
  三个投影 case key 与 evidence package kind 为 W31，且每个源字面量必须恰好出现一次；Ctrl+K 在
  `focus()` / `select()` 前先调用既有 `openNavigation()`，使桌面折叠态与窄屏抽屉态均先恢复可见。
  （3）原残留守卫移到 candidate driver 与 validation kit 生成后执行；WIN7-31 起扫描 validation 脚本
  与 driver 中引号内的 03/09/10 投影对象键，任何非 W31 前缀均以 `A9_CANDIDATE_STALE_TOKEN` 拒绝。
  测试须包含正向键对齐与注入 W28 键的负向构建失败，并覆盖折叠左栏下 Ctrl+K 的展开、焦点与全选。
  （4）允许路径按 A9-16 §10；W23～W30 的冻结 release 脚本和候选字节不得改写。不改 native helper、
  Runner/Policy、IPC、SQLite schema、权限模式或秘密边界，不新增依赖，不开放 Review 或 Shell 运行中
  输出；15 项用例、`WIN7-CODING-AGENT-A9-ALPHA1` / `0.3.0-alpha.1` 保持不变。（5）允许本地提交及
  两个独立干净工作树的逐字节一致构建，不推送、不打标签；未知 ZIP 哈希形成后仍须候选外独立
  `WIN7_31_RELEASE_AUTHORITY` 与 SHA-256 pin，本指令不预先批准未知哈希。
- 后果：WIN7-31 在不扩大能力范围的前提下同时修复候选证据命名断链和隐藏控件焦点问题，并把此前因
  扫描时序过早而漏掉 driver 的缺陷变为构建硬失败。开发机测试、双干净构建或包完整性均不能代替
  当前候选的普通用户非提升 Win7 证据；authority 签发和实机验收前保持 `WIN7_31_NOT_PERFORMED`。
  本 ADR 不改写 ADR-0125/0126，不改判 WIN7-19～30，不签发 Alpha 2 PASS、Win7 PASS 或 RC PASS。

## ADR-0128 WIN7-31 实机 G3 真实 125% DPI 容量失败与 WIN7-32 换发

- 状态：Accepted（2026-09-15，负责人指令：“下面开始实际验收”）
- 背景：WIN7-31（source `ac4ed5048a6a2d4ed2f223c61ed06108a4a07d4b`，ZIP SHA-256
  `79aec61da2046727ae89d94ccb4c9341ca5fb07aff17a72291479d1372ffa16a`）在 `10.134.115.40`
  以普通用户 `dccs-chaizl-pc\agent`、Medium/non-elevated 令牌执行 run
  `cdc35c14-abee-4f8e-bd4a-5759559ba0c8`。G1 包完整性 PASS，G2 自动 smoke 75/75 PASS；G3 在真实
  1366×768、120 DPI（125%）、1 running + 8 older + 1 archived 且 Stop 可见的最坏形态下，只观察到
  1 条完整 36px 对话行，低于 `W31-11-A03` / `W31-15-A02` 要求的 4 行硬门。候选正常关闭后
  Electron/helper 零残留，postflight 完整性与秘密零命中通过，但不得据此签发 UI 集成 PASS。根因是
  源码契约只预算 768 CSS px 默认态，没有覆盖 125% DPI 下约 540 CSS px 内容高，也漏算运行中 Stop；
  产品 CSS 与 validation kit 的真实 DPI 硬门不同步。
- 决策：（1）WIN7-31 固定为 `G3_FAILED`，其 ZIP、manifest、authority、run 与候选外证据原样保留，
  不得补丁改包、重签、删除或复用哈希改判。（2）换发 `WIN7-32`；修复范围只是在
  `max-height: 650px` 下压缩左栏固定 chrome：任务/Review 与任务状态/Stop 分别横排，目录固定控制和
  装饰收紧；对话行仍为 36px，Stop、两个产品入口、可信工作区、设置和诊断继续可达。开发机同引擎在
  1093×540 CSS px 最坏形态量测为列表 197px、4 条完整行、页面横纵溢出均为 0，并以 540 CSS px 静态
  高度预算守卫锁定；这不是物理 Win7 PASS。（3）候选范围、15 项用例、版本与能力集不变：仍为
  `WIN7-CODING-AGENT-A9-ALPHA1` / `0.3.0-alpha.1`，Review disabled + fail-closed，Shell 运行中输出不
  开放；不改 native helper、Runner/Policy、IPC、SQLite schema、权限或秘密边界，不新增依赖。
  （4）允许路径按 A9-16 §12；W23～W31 的冻结 release 脚本和候选字节不得改写。（5）允许本地提交及
  两个独立干净工作树逐字节一致构建，不推送、不打标签；`source_dirty=false` 与
  `external_acceptance_eligible=true` 为硬门。（6）未知 ZIP 哈希不由本指令预先批准；哈希形成后仍须
  候选外独立 `WIN7_32_RELEASE_AUTHORITY` 与 SHA-256 pin，方可在 `10.134.115.40` 开始普通用户复验。
- 后果：WIN7-31 的真实 DPI 失败被转化为候选级可回归修复，WIN7-32 可在身份冻结后重新进入 G1→G2→
  G3→报告链路；W32-11/W32-15 必须在同样真实 125% DPI 最坏形态下直接证明至少 4 条完整行与四态无
  页面溢出。双构建、包完整性和开发机 Electron 均不能代替该实机证据；authority 前保持
  `WIN7_32_NOT_PERFORMED`。本 ADR 不改写 ADR-0125～0127，不改判 WIN7-19～31，不签发 Alpha 2、Win7
  或 RC PASS。

## ADR-0129 WIN7-32 实机 GPU 合成首绘失败与 WIN7-33 换发

- 状态：Accepted（2026-09-15，负责人指令：“修复并走验证”）
- 背景：WIN7-32（source `916fe8240e73d6efa956eacf485652075639dbcb`，ZIP SHA-256
  `639063b70a1f7fb5dd422870708cb8cb457c405df8752668a5e43f8220a92ea2`）在 `10.134.115.40` 的物理
  Win7 上以普通用户 `dccs-chaizl-pc\agent`、Medium/non-elevated 令牌执行 run
  `6e5c315d-cf59-4a5c-bb9f-1f58a2df366c`。G1 PASS、G2 75/75 PASS，但 G3 正常启动和一次普通重启均
  持续白屏；主/GPU/网络/renderer 进程存活且 responding，无同期 Application 崩溃。打开 DevTools
  重建合成表面后已加载 DOM 立即显示；最小化/恢复与一像素 resize 无效。同一冻结候选仅加
  `--disable-gpu` 后直接正常首绘，故原因收敛为 Electron 22 在该 Win7 环境的 GPU 合成路径。
- 决策：（1）WIN7-32 保持 `G3_FAILED / FIX_BEFORE_REISSUE`，候选、authority、run 和证据不可变。
  （2）换发 WIN7-33，仅在 Windows 主进程 `app.ready` 前调用 `app.disableHardwareAcceleration()`；
  非 Windows 不变，不修改 renderer、Runner/Policy、IPC、SQLite、权限、秘密、网络或依赖。
  （3）新增启动顺序测试，要求 Windows 调用发生在 `app.whenReady()` 前，非 Windows 不调用；候选包测试
  必须确认正式 `resources/app/product/main.js` 携带同一策略。（4）沿用 15 项用例、Alpha 1 版本与能力集，
  先证明无参数启动与正常重启直接可见，再继续真实 Provider、Stop、四态和真实 125% DPI 容量。
  （5）允许修改 A9-16 §13 白名单中的主进程、测试、WIN7-33 release 与治理文件；允许本地提交和双独立
  干净构建，不推送、不打标签。（6）未知 ZIP 哈希不预批；哈希形成后仍须候选外
  `WIN7_33_RELEASE_AUTHORITY` 与独立 SHA-256 pin。
- 后果：修复以物理 Win7 A/B 判别证据为依据，不把 DevTools 或命令行诊断参数冒充产品入口。软件渲染
  会牺牲 GPU 加速，但产品只加载可信本地 UI，且 Win7 Profile 不保证 GPU；此取舍比保留已实测白屏的
  硬件路径更符合可用性合同。双构建和开发机验证不能替代 WIN7-33 的普通用户实机证据；authority 前
  保持 `WIN7_33_NOT_PERFORMED`。本 ADR 不改判 WIN7-19～32，也不签发 Alpha 2、Win7 或 RC PASS。

## ADR-0130 WIN7-33 实机 G2 失败与渲染策略就绪守卫换发 WIN7-34

- 状态：Accepted（2026-09-15，负责人指令：“对问题进行修复”“现在就推进换发”）
- 背景：WIN7-33（source `d6c6a3e5d908ff3ffe72d14d1c64bb7ba968e718`，ZIP SHA-256
  `ab885f43c5285ebe81351ca5841f33399cb58b750b16cb8367fd2c760b08984c`）在 `10.134.115.40` 的物理
  Win7 上以普通用户 `dccs-chaizl-pc\agent`、Medium/non-elevated 令牌（Session 11，真实
  1366×768 / 120 DPI）执行 run `15f2c247-d5e1-4c82-8d9f-c34759cf9a4f`。G0 宿主预检与 G1 包完整性
  均 PASS，但 **G2 自动产品 smoke 硬失败**：四个驱动阶段全部抛
  `Error: app.disableHardwareAcceleration() can only be called before app is ready`，抛点在候选内
  `resources/app/product/main.js:21`，触发点是候选自家驱动在 `app.whenReady().then(main)` 之内才
  `require` 产品入口。两个本机回环 fixture 的请求计数均为 0，批准目标未删除，无任何投影附件产出；
  按 fail-closed，G3 与 15 项用例全部 `NOT_PERFORMED`，正式 verifier `status=FAIL`。
- 根因：ADR-0129 的修复为恢复 Win7 首绘而在 `main.js` **模块顶层无条件**调用
  `app.disableHardwareAcceleration()`，而该调用只在 `app.ready` 之前合法。打包入口在 ready 前加载
  `main.js`，生产路径正确；验收驱动却在 ready 之后加载同一模块，于是该调用必然违法并抛错。非
  Windows 平台跳过该调用，因此开发机双构建逐字节一致与候选外 verifier 预检都无法发现——与
  WIN7-32 的白屏同属“只能在物理 Win7 暴露”的一类。
- 决策：（1）WIN7-33 保持 `G2_FAILED / FIX_BEFORE_REISSUE`，候选、run、报告与全部原始证据不可变。
  （2）把该调用改为**按就绪状态守卫**：`if (process.platform === 'win32' && !app.isReady())
  app.disableHardwareAcceleration();`。打包入口行为与 WIN7-33 完全一致（ready 前加载必生效）；
  此后加载本模块的 harness 不再能把一次非法迟到调用变成产品启动失败。非 Windows 策略不变，不修改
  renderer、Runner/Policy、IPC、SQLite、权限、秘密、网络或依赖。（3）新增两条启动顺序回归用例：
  ready 之后加载不得做出非法迟到渲染调用；只要 ready 前加载，Windows 策略必须照旧生效。候选包测试
  必须确认正式 `resources/app/product/main.js` 携带同一守卫形态且调用点早于 `app.whenReady()`。
  （4）换发 WIN7-34，沿用 15 项用例、Alpha 1 版本与能力集，并继承 WIN7-32 的 renderer 容量修复与
  短高度左栏布局；（5）允许修改 A9-16 §14 白名单中的主进程、测试、WIN7-34 release 与治理文件；
  允许本地提交和双独立干净构建，不推送、不打标签。（6）未知 ZIP 哈希不预批；哈希形成后仍须候选外
  `WIN7_34_RELEASE_AUTHORITY` 与独立 SHA-256 pin。
- 后果：把“合法的初始化调用”与“harness 的加载时机”解耦，使候选自身的强制性 G2 门不再因验收机制
  而假失败；生产路径的渲染策略与 ADR-0129 完全等价，因此本 ADR 不重新裁决 Win7 首绘问题，WIN7-34 仍
  必须由普通用户在物理 Win7 上先通过 G2 再证明 G3 首绘。双构建与开发机验证不能替代实机证据；
  authority 前保持 `WIN7_34_NOT_PERFORMED`。本 ADR 不改判 WIN7-19～33，也不签发 Alpha 2、Win7 或
  RC PASS。

## ADR-0131 W34-13-A03 收窄到可达最窄视口，≤799px 抽屉分支登记为产品内不可达

- 状态：Accepted（2026-09-16，负责人选择「规格收窄」）
- 背景：WIN7-34 实机量测表明 A9-16 的 `W34-13-A03`（「799px 以下不能残留零宽 rail 状态」）在真实产品内
  **不可达**：`src/shell/product/policy.js:19` 的 `minWidth: 860`（DIP）把渲染视口下限顶在 **847 CSS px**
  （实测：请求内容宽 700 → 实际 847，`innerWidth = 847`，`zoomFactor = 1`，`devicePixelRatio = 1.25`）。
  判决代码是活的而非孤立 CSS：`a9-workbench.js:1881`
  `navigationIsDrawer() { return root.innerWidth < 800; }` 与 `a9-workbench.css:436`
  `@media (max-width: 799px)`（约 20 条规则的窄屏压缩层：rail/inspector 改 fixed 抽屉、navigation-backdrop、
  header 压到 68px、composer 收窄、`send/stop min-width: 82px`、suggestions 单列、approval-actions 换行、
  composer-guidance 隐藏）。`innerWidth < 800` 恒假 ⇒ 该分支永不命中，子项既不能 PASS（无观察对象）
  也不能 FAIL（无失败证据），WIN7-34 冻结报告据此记 `NOT_PERFORMED`，总状态停在 `EVIDENCE_PENDING`。
- 决策：
  （1）该子项收窄为**可达最窄视口上的断言**：在 847 CSS px 下端折叠 rail 不得产生零宽对话列，也不得横向
  溢出；≤799 的移动抽屉分支**保留，但登记为「产品内不可达 / 未验证」**。
  （2）证据由候选外 `floor-app` harness 产生（只用产品自身入口与自身面板开关，不使用 DevTools、远程调试、
  zoom 代理或外部强推窗口）：请求 700×700 → 实际 847×700；四态量测中 `rail-closed` 时网格为
  `0px 847.2px`、rail 宽 0 且 `visibility: hidden`、`.conversation-pane` 宽 **847.2 px（非 0）**、
  `scrollWidth == clientWidth == 847`、`matchMedia('(max-width: 799px)') === false`、rail 计算位置 `static`；
  四项断言全部 PASS。
  （3）报告以**修订版**重签：新 evidence root，逐条复用原冻结证据的路径与 SHA-256；原报告与全部原始证据
  保持不可变并标注为被修订。不修改任何产品源码。
  （4）若将来下调 `minWidth`、放宽窗口下限或需要窄屏/并排支持，必须换发候选并按新 ADR 重新实测该分支；
  不得据本 ADR 主张 ≤799 抽屉态已验证。
- 后果：WIN7-34 的 15 项用例首次全部 PASS，并以文件级登记消除了「死代码被当作已交付能力」的歧义。
  本 ADR 不改变 WIN7-19～33 的任何结论，也不签发 Alpha 2 或 RC PASS。

## ADR-0132 WIN7-34 验收链路偏差与 WIN7-35 Driver 生命周期、退出码修复授权

- 状态：Accepted（2026-09-22，负责人批准修复规划、委派实施并由主代理最终验收）
- 背景：WIN7-34（源码 `2f6d3fd2ee8817922cf771300e3f348e541dfaf6`，ZIP SHA-256
  `d0b8528fccef905dce2d420d1b231251fac017d29f1505dbc10a6f20d9a93ead`）已在物理 Win7 上完成修订后
  15/15 直接当前候选证据，裁决为 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`。但 WIN7-34 的
  实现是在产品入口用 `app.isReady()` 守卫跳过非法的迟到渲染策略调用；候选验收 Driver
  仍在 `app.whenReady().then(main)` 之后才加载产品入口，与正式打包入口的 ready 前加载顺序
  不同。WIN7-33 失败还暴露了另一套合同漏洞：阶段 JSON 已为 `ERROR` 且 `cases=[]`，
  Electron 子进程却可能返回退出码 0。因此 WIN7-34 的实机 PASS 不被改判，但不能代替对
  Driver 生命周期与操作系统退出码的修复。
- 决策：
  （1）WIN7-34、其 authority、原始/修订报告和全部候选外证据继续冻结；新修复只能以
  `WIN7-35` 新身份交付，不得覆盖、重签或回填 WIN7-34。
  （2）WIN7-35 Driver 必须在 Electron ready 前先安装候选外 `dialog` / `ipcMain.handle`
  故障注入与观察接缝，然后首次加载正式 `product/main.js`；`app.whenReady()` 之后只执行
  窗口和 first/second/retry/stop 旅程。若 Driver 首次加载产品入口时 `app.isReady()`
  已为 true，必须用稳定错误码 `A9_W35_DRIVER_PRODUCT_ENTRY_LATE_LOAD` fail-closed。
  （3）`src/shell/product/main.js` 现有 `app.isReady()` 守卫作为产品级防御保留；本授权不允许
  移除或修改该产品入口，也不改 renderer、Runner/Policy、IPC schema、SQLite、权限、网络或依赖。
  （4）阶段退出合同以可观察结果为准：报告必须先完整落盘；`PASS` 必须返回 0；
  `FAIL` / `ERROR` / 报告缺失或不可解析必须返回非 0。产品运行时已启动时不得绕过
  `before-quit` 与 `a9RuntimeInstance.shutdown()`；具体退出实现须由可执行反例证明，本 ADR
  不预先绑定未验证的 `will-quit` / `app.exit()` 方案。父 smoke 必须同时核验真实退出码、
  JSON `status`、`cases` 与 `error`，两者矛盾时 fail-closed。
  （5）实施必须提供两个原始反例：ready 后首次加载被明确拒绝；受控阶段 `ERROR`
  的 JSON 可读、子进程实际退出码非 0，且 Electron/helper/Shell 子孙无残留。单纯字符串顺序
  断言、macOS 模拟或开发机 PASS 不构成 Win7 运行证据。
- 后果：A9-16 进入 `A9_16_WIN7_35_IMPLEMENTATION_AUTHORIZED`。实施 Agent 必须先交付未提交补丁和
  开发机证据供主代理独立验收；通过后方可形成一个本地实施提交并执行两个独立干净工作树
  构建。未知 ZIP 哈希不被本 ADR 预先批准；候选形成后仍须负责人按精确 SHA-256 签发
  候选外 `WIN7_35_RELEASE_AUTHORITY`，才能在 `10.134.115.40` 执行 G1→G2→G3→报告。不推送、
  不打标签，也不因本修复签发 Alpha 2 或 RC PASS。

## ADR-0133 WIN7-35 真实 125% DPI 容量失败与 WIN7-36 换发

- 状态：Accepted（2026-09-23，负责人批准 WIN7-36 换发合同、C14 范围与实机目标）
- 背景：WIN7-35 ZIP SHA-256
  `0d1474fddbd05c28e2109f2b7d70eb78d7e4ac786cadf2418175c7504b73749c` 已在
  `10.110.237.40` 的 run `9ffae420-fd2c-4c5f-93ef-c56584fe1ca4` 通过 G1、排除旧实例后的
  G2 及正式入口首绘，但在真实 1366×768 / 125% DPI 的 1079×540 CSS px 可用视口下，
  最坏形态列表仅 178px，36px 普通行只完整显示 3 条，W35-11/W35-15 的 G3 UI 硬门失败。
  旧源码的 `.conversation-directory-note` 规则未命中仅带 `quiet` class 的真实 `<p>`，默认段落
  外边距和换行占去约 29px；此前静态预算未核查选择器实际绑定。窗口最小尺寸钳大到 584px 后
  出现 5 行并不能代表物理可用视口。W35-12/W35-13 节点身份观察存在轮询干扰，尚未隔离裁决。
- 决策：（1）WIN7-35 与其候选外 FAIL 证据不可变，修复只以 WIN7-36 新身份换发。
  （2）产品变更限定在 A9-16 §7 已授权 HTML/CSS/契约测试，保证注记样式命中、单行、零外边距，
  保留 36px 行高、Stop/归档可达和 4 态；实际视口 1079×540 的可重放探针必须给出 4 行，
  584px 钳大判无效，选择器失效反例判失败。开发机结果不等于 Win7 PASS。
  （3）按任务书 §17 的新增 C14 白名单建立 WIN7-36 独立 lock、打包 profile、校验器、
  smoke、报告器和 Kit；保留 WIN7-35 Driver ready 前加载、迟到加载及 ERROR 非零退出合同，
  所有候选作用域令牌须重基线且有旧键反例。Runner/Policy、IPC、SQLite、依赖、权限、网络与
  `product/main.js` 均不变。
  （4）W36-12/W36-13 的 DOM 身份须把侧栏切换与运行中目录轮询分离观察，不以混杂现象直接
  判 PASS 或产品缺陷；≤799px 抽屉态仍为不可达、未验证。
- 后果：允许本地实施提交与两个独立干净工作树构建 WIN7-36，不推送、不打标签。形成新 ZIP
  后，负责人仍须按源码、input lock、manifest 与 ZIP 精确哈希单独签发候选外
  `WIN7_36_RELEASE_AUTHORITY` 和独立 pin，方可在 `10.110.237.40` 普通用户非提升桌面身份
  执行 G1→G2→G3→报告。未知哈希未预先获批；本 ADR 不签 Alpha 2 或 RC PASS。

## ADR-0134 AGENTS.md 与 CLAUDE.md 不再写死“当前任务”，改为引用 STATUS.md 与任务索引

- 状态：Accepted（2026-09-24，负责人批准）
- 背景：2026-09-24 文档整理发现三处入口文档与实际进度矛盾：（1）`AGENTS.md` §2 仍称
  “当前 A9-14 任务……已为 `COMPLETE`”，§8 把 A9-14 任务书列为“A9 当前实现授权、范围与验收”的
  权威来源，而实际在制任务为 A9-16（`APPROVED_FOR_IMPLEMENTATION`，WIN7-36 UI 子集 PASS 后
  Review/Shell streaming 暂缓）与 A9-17；（2）`CLAUDE.md`“开工前必读”仍称现有正式任务是
  Phase 1/2 两份任务书，并要求任何代码或文档修改前都读取它们，与 `AGENTS.md` §3“纯文档或规则
  维护只读相关文档”冲突；（3）`CLAUDE.md`“当前阶段速查”停在 2026-08-02，缺 A7～A9。
  根因是入口文档按阶段手工写死“当前任务”，每次换阶段都需同步，且 `AGENTS.md` 的修改又须 ADR，
  实际未随进度更新。`docs/STATUS.md` 已于同日拆分为当前快照（逐条时间线移至
  `docs/STATUS_LOG.md`），`docs/tasks/README.md` 已维护每个任务书的授权状态。
- 决策：（1）`AGENTS.md` §2 删除“当前 A9-14 任务”的写死表述，改为：当前工作项、候选结论与阻断项
  只以 `docs/STATUS.md` 为入口，任务定位与实现授权状态以 `docs/tasks/README.md` 为准；
  “A9-09～A9-14 实现范围不重新开放”、WIN7-22 冻结裁决、ADR-0096、Full Access 非沙箱等既有
  约束原样保留。（2）`AGENTS.md` §8 “A9 当前实现授权、范围与验收”行改为指向
  `docs/tasks/README.md` 中状态为 `APPROVED_FOR_IMPLEMENTATION` 的任务书，并保留
  `A9_TRUSTED_AGENT_RUNTIME.md` 总合同与 A9-09～A9-14 历史合同入口。（3）`CLAUDE.md`
  “开工前必读”改为服从 `AGENTS.md` §3 的按需读取规则，当前任务书经 `STATUS.md` 与任务索引定位；
  “当前阶段速查”删除易过时的阶段状态，只保留长期有效约束（ADR-0027 架构基线、Phase 1/2
  CPython 3.8.10 冻结合同、禁止整体合并/cherry-pick 原型分支），当前状态一律引用 `STATUS.md`。
  （4）C14 实现授权机制、任务书白名单、Win7 实机硬门、文档优先级顺序及其余 AGENTS.md 条款不变；
  本 ADR 不授予任何实现授权，不改变任何任务书状态或候选结论。
- 后果：入口文档不再随阶段推进失效，“当前”事实只在 `STATUS.md` 与 `tasks/README.md` 两处维护；
  代价是读者必须多跳一次链接才能知道当前任务，且 `STATUS.md` 当前工作项一览与任务索引须在
  每次状态变化时同步更新（`STATUS.md` 状态使用规则已写明）。本 ADR 被接受前，`AGENTS.md` 与
  `CLAUDE.md` 的对应修改不得提交。

## ADR-0135 运行中模型输出以内存预览实时呈现，累积脱敏并保留尾部

- 状态：Accepted（2026-09-24，负责人批准）
- 背景：负责人反馈运行中的工具调用与中间状态要到最终结果才出现。核查发现，除渲染端运行中轮次绑定缺陷
  （A9-19 F1）外，模型流式 chunk 被运行时累积到轮次结束才合并落盘（A9-19 F2），而模型调用正是最长的
  静默期。A9-16 §3、A9-15 与 ZCode 参照文档曾把“模型 token 级输出”列为非目标；该排除与“可观察进展”
  直接冲突。直接逐 chunk 暴露又会让跨 chunk 的秘密前缀先于脱敏进入 IPC/UI。
- 决策：（1）模型输出实时预览纳入 Alpha 2 范围（A9-19 P02）。（2）预览只存在于运行时内存，经快照可选字段
  `liveModelPreview: { turnId, text, updatedAt }` 提供给渲染端；不进入 `timeline`、`a9_events`、SQLite 或日志。
  （3）每次更新对“当前轮次已累积全文”执行 `redactSecrets`，并保留末尾 `holdBack` 个字符不暴露；
  `holdBack` 取全部已知秘密及其编码变体的最大长度，下限 64。（4）`model_note`、`turn_completed`、
  `turn_failed` 或取消时清空预览；持久化仍沿用现有 `flushModelChunks` 语义，最终文本只落盘一次。
  （5）不改 IPC 既有字段与 SQLite schema；交互式终端、stdin 注入与 Shell 增量输出（A9-16 S01–S06）不在本 ADR 内。
- 后果：模型调用期间用户可见正在生成的文本，末尾最多滞后 `holdBack` 个字符；重启后不恢复未完成的预览。
  代价是运行时每次 chunk 需对累积全文重跑脱敏（按轮次上限有界）。本 ADR 被接受前，不得实现预览。

## ADR-0136 A9-19 以 WIN7-37 新候选进入 Win7 实机验收，实机执行可交由外部执行模型

- 状态：Accepted（2026-09-25，负责人批准）
- 背景：A9-19（运行过程实时可见与工作台布局二期，`b4c138b`、`9d82ed1`）已在开发机验证，并在 Win7 上完成一次非验收的
  探索性运行，确认运行中过程在落盘后 ≤1.1 s 出现在界面，同时发现并修复切换后桌面左栏被收起。WIN7-36 冻结候选不含 A9-19，
  不能以叠加方式改判；正式结论必须来自新的冻结候选。负责人另提出把实机执行交给外部模型，由本审核方做最终审核。
- 决策：（1）以新编号 `WIN7-37` 换发候选，版本与能力集沿用 `0.3.0-alpha.1`，产品源码为 A9-19 已提交内容，换发过程不新增产品改动。
  （2）用例为继承的 W37-01～15 加新增 W37-16～21；W37-16/17 在 G2 以延迟流式 fixture 做确定性自动断言，并在 G3 以真实 Provider 复核。
  （3）C14 允许路径、执行门与结论上限以 [WIN7-37 换发合同](plans/A9_19_WIN7_37_REISSUE_PROPOSAL.md) 为准。（4）Win7 实机执行可由
  外部执行模型按 [交接书](plans/A9_19_WIN7_37_ACCEPTANCE_HANDOFF.md) 完成；执行方只交原始证据与事实报告，不裁决；审核方基于原始证据
  给出建议，负责人裁决。（5）候选外 `WIN7_37_RELEASE_AUTHORITY` 仍须在 ZIP 精确哈希确定后由负责人单独签发。
- 后果：A9-19 获得独立、可追溯的实机结论路径；实时性由自动断言兜底，不依赖单次真实 Provider 的时序。代价是一轮完整换发
  （管线、双构建、授权、实机）；外部执行模型引入执行偏差风险，由“只交原始证据、禁止裁决、审核方复算哈希并逐项核对”控制。
  本 ADR 被接受前不得修改 §3 列出的发布管线文件。

## ADR-0137 Git 外部写确认分类器：壳载荷不可精确解析时 fail-closed

- 状态：Accepted（2026-09-25，负责人按建议批准，A9-20 §11 开放问题同时裁决）
- 背景：Full Access 下 `git push` 等外部写入的目标绑定确认依赖 `classifyGitCommand`，其返回 `null` 即放行。
  2026-09-25 在 `c8691e3` 上复现：CMD 开关与引号相连（`cmd /c"git push …"`）、开关簇（`/s/c`）、`/R`、
  PowerShell 参数前缀（`-co`/`-e`/`-ec`）、相连形态与位置参数形态（`powershell "git push …"`）、POSIX 壳（`bash -c`/`-lc`）和引号包裹的超 256 KiB 载荷均被判为“无 Git”。
  分类器自 `e80b8c8` 未变，WIN7-22、WIN7-37 等候选同源。A9-18 工作树曾部分修复但未提交、基线已分叉。
  根因是解包只认精确拼写、兜底不解包、“超出分析能力”与“无 Git”同值。
- 决策：按 [A9-20](tasks/A9_20_GIT_CONFIRMATION_CLASSIFIER_HARDENING.md) 执行。（1）分析结果改为三态：无 Git / Git 决定 / 超出分析能力；
  超出能力且已见 Git 相关 token 时按保守决定要求确认。（2）已知壳宿主（CMD、PowerShell/pwsh、bash/sh/dash/zsh）的载荷按开关前缀、
  开关簇、相连形态与 PowerShell 位置参数解包（PowerShell 以 `command`/`encodedcommand` 任意前缀识别，不复刻版本歧义规则）；无法精确提取时对去引号整段扫描可执行 Git token，命中即确认，已知散文汇聚点豁免不变。
  （3）超过单一常量 `MAX_ANALYZABLE_GIT_COMMAND_BYTES`（256 KiB）的 Shell 命令在 `policy.ts` 层一律要求确认，不依赖 loop 层守卫；Win7 命令行上限使其预计不可启动，此条为纵深防御。
  （4）壳宿主命令只有在载荷解包成功、无 Git 决定且非纯输出时才可计为验证证据。（5）不改 IPC、审批摘要格式、Runner 与 Renderer。
- 后果：部分此前静默执行的 Shell 命令会出现确认；深嵌套纯散文不因深度耗尽而误报。分类器仍是常见 Git 外部写入的确认闸而非安全边界，
  ADR-0089 的可信工作区定位不变。本 ADR 不改判 WIN7-22、WIN7-37 或任何已签结论，也不授权候选换发；Win7 上的修复结论须来自另行批准的新候选。

## ADR-0138 A9-18 成果按评估择优移植，不引入 schema 迁移，移植后删除工作树

- 状态：Accepted（2026-09-25，负责人按建议批准）
- 背景：A9-18 只存在于未提交工作树，基线 `7d06789`，两轮独立审查 `FAIL_FIX_REQUIRED` 后自报返修完成但未复审；工作树内各包测试全绿。
  主线实测（[承接台账 §7.1](plans/A9_17_A9_18_CARRYOVER_LEDGER.md)）表明，启动时全量加载并整读全部历史 checkpoint 快照，
  耗时随历史线性增长（100 Turn 约 4 s）。主线还存在模型输出无上限、渲染端事件集合无界、快照每次带出全部 checkpoint 列表等问题。
  A9-18 的 schema v5/v6 事实投影只针对 5,000 轮时 Main 约 34 MiB 的残余成本，却带来不可回退的迁移，4 项审查缺陷也出在这里。
- 决策：按 [A9-21](tasks/A9_21_A9_18_SALVAGE_PORT.md) 移植启动定向恢复、模型输出上限、checkpoint 列表分页、渲染端集合上限，
  均在 schema v4 下实现；不移植事实投影表、缓存字节账本、受控重载、禁用默认菜单、实验矩阵。A9-18 工作树的 ADR-0124～0130
  不进入主线，其编号只在被删除的工作树内有效。移植提交并验证后，删除工作树 `win7-coding-agent-memory-optimization` 与分支
  `codex/a9-memory-optimization`。
- 后果：启动耗时不再随历史总量增长，内存无界点得到上限；不改变数据库格式，Alpha 1 数据库无需迁移。放弃的项目若在 Win7 实测中
  证明必要，需另立任务重新设计。删除后 A9-18 原始代码不可恢复，取舍理由以承接台账为准。

## ADR-0139 性能预算 #3 改按 Main 进程计量

- 状态：Accepted（2026-09-25，负责人按建议批准）
- 背景：`PERFORMANCE_BUDGET.md` #3 按 ADR-0028 定义为“独立 utilityProcess 中的 Agent Core”，但 A9 实际把 Agent Core 与状态层运行在
  Electron Main 进程内，没有独立 utility 进程。A9-17 测量计划把 #3 映射到 `shell.utility`，按此采样会得到空值；#2 又把 Main 计入 Shell。
- 决策：#3 改为“Main 进程常驻内存（含 Agent Core 与 A9 状态层）”，采样类别 `shell.main`；#2 改为 `shell.gpu`+`shell.renderer`；
  `shell.utility` 保留为通用分类，正常应为空。阈值（Go ≤ 180MB / No-Go > 280MB）与“未实测”状态不变。ADR-0028 正文不改；
  将来若把 Core 移入 utilityProcess，须另立 ADR 恢复原口径。
- 后果：A9-17 的 Win7 采样（K17-1）可以得到有意义的 #2/#3 数据；与旧口径的历史数字不可直接比较。

## ADR-0140 A9-20 实施中对 Git 确认分类器与验证记账的两处收紧

- 状态：Accepted（2026-09-25，在 A9-20 负责人授权的“按推荐优化需求”范围内做出）
- 背景：按 ADR-0137 实施时发现三点。（1）动态 push 检测只在整条命令没有任何 Git 决定时运行，
  `git status && powershell -c "$g='git'; & $g push …"` 因此被判为 `autonomous`。（2）6 层及以上嵌套 `powershell -e` 在深度上限处
  仍是 Base64，按 ADR-0137 决策（1）“已见 Git 相关 token 才保守”会放行。（3）ADR-0137 决策（4）只处理 Shell 宿主，
  而 `git` 本身在验证运行器名单中，`git push` 与被解包后的 `bash -lc "git push"` 都会被记为验证证据。
- 决策：（1）对每个没有静态 Git 决定的分段单独做动态 push 检测，已静态分类的 Git 命令不重复判定。
  （2）到达深度或体积上限时，剩余文本含 Git 词或仍含未解开的 Shell 宿主（cmd/powershell/pwsh/bash/sh/dash/zsh）即保守确认。
  （3）含 Git 外部写（`always_confirm`）的命令不计为验证证据。
- 后果：关闭上述三类旁路。超过深度上限的纯文本 Shell 嵌套也会要求确认；直接执行的 `git push` 不再使一轮变为 verified。
  ADR-0137 其余决策不变。

## ADR-0141 以当前主线换发 WIN7-38，在 Win7 实机验收 A9-20 与 A9-21

- 状态：Accepted（2026-09-26，负责人授权实机验收）
- 背景：A9-20（Git 确认分类器绕过修复）与 A9-21（启动定向恢复、脱敏正则线性化、模型输出上限、checkpoint 分页、事件与被拦截请求上限）
  均已在开发机完成并并入 `codex/a9-alpha2`，已发布候选（至 WIN7-37）都不含这些改动。A9-21 §5 第 6 项要求真实 Electron 回归，
  而开发机 Electron 包已缺失；Win7 验收机经 2026-09-26 只读检查可达。
- 决策：（1）以本决策所在的 `codex/a9-alpha2` 换发新候选 `WIN7-38`，版本与能力集沿用 `0.3.0-alpha.1`，本次换发不做产品改动。
  （2）在 Win7 实机验收 A9-20 与 A9-21 的用例，结论上限 `A9_22_WIN7_38_A9_20_A9_21_PASS`；流程、硬门与证据要求沿用 WIN7-37（ADR-0136）。
  （3）A9-21 §5 第 6 项由 WIN7-38 的 Win7 实机运行取代，不再单独在开发机下载 Electron 运行。
  （4）构建输入沿用 WIN7-37 输入锁；缺失的 A6 SQLite 返回包经负责人同意从私有加密归档恢复，按原哈希核对。
- 后果：实施入口为 [A9-22](tasks/A9_22_WIN7_38_REISSUE_AND_ACCEPTANCE.md)。候选冻结后仍须负责人签发候选外 authority，实机结论经审核后由负责人裁决。
  开发机 gateway 偶发失败排查与 WIN7-38 互不阻塞。

## ADR-0142 WIN7-38 记为验证套件缺陷不通过，新建 A9-23 修复套件后换发 WIN7-39

- 状态：Accepted（2026-09-26，负责人按审查报告方案 (a) 裁决）
- 背景：WIN7-38（A9-22，ADR-0141）在 Win7 实机 G2 失败。审查报告
  [a9_22_win7_38_acceptance_review_2026-09-26.md](reports/2026-09/a9_22_win7_38_acceptance_review_2026-09-26.md) 确认：
  候选内 `a9-win7-38-smoke.cjs` 未传 `A9_SMOKE_PRODUCT_MAIN`，产品入口从未加载；W38 的 A9-20/M1～M4 断言多为恒真或不覆盖判定要点；
  残留检测未排除自身 PID。套件打包在候选内，修复必然改变 ZIP 哈希，不能沿用 WIN7-38 编号与 authority。
- 决策：（1）WIN7-38 结论为不可变的 `A9_22_WIN7_38_VALIDATION_KIT_DEFECT_NOT_PASS`，不是产品缺陷结论；候选、authority 与证据保留，
  不得复用改判。W38-01 候选完整性虽有证据支持，不单独签发。A9-22 关闭。
  （2）新建 [A9-23](tasks/A9_23_WIN7_39_REISSUE_AND_ACCEPTANCE.md)：从 W37 smoke 机械派生 W39 套件，按任务书 §5 R1～R8 修复，
  不做产品改动，换发 `WIN7-39`，结论上限 `A9_23_WIN7_39_A9_20_A9_21_PASS`；流程与硬门沿用 ADR-0141/ADR-0136。
  （3）A9-21 §5 第 6 项与 A9-20 的 Win7 结论改由 WIN7-39 覆盖；ADR-0141 其余内容不变。
- 后果：A9-20 维持 `A9_20_DEVELOPER_VERIFIED`，已发布候选的已知缺陷登记不变。WIN7-39 冻结前是否在 Win7 做非正式套件预演，
  由负责人按 A9-23 §7 Q1 另行裁决。

## ADR-0143 Alpha 2 的 Review 改为“先写后审”的改动审阅，不做暂存区式 Review 模式

- 状态：Accepted（2026-09-27，负责人批准修订 A9-16 R01–R05）
- 背景：A9-16 §2 R01–R05 要求 Review 模式“写入只进私有准备区、逐文件决定后原子应用”。A9-24 草稿按此设计后评估发现三处
  与一线编码 Agent 体验冲突的结构性问题：未处理的暂存改动会阻断后续轮次；Shell 在正式工作区运行、看不到暂存改动，Agent 无法测试
  自己的修改；只能整文件决定并需额外应用确认。负责人判断 Review 要么接近一线体验、要么不做。另核实 A9 已具备按文件撤销：
  `CheckpointManager.undoFile`（带漂移保护与撤销幂等）经 IPC `a9.checkpoint.undoFile` 贯通到 preload，界面仅暴露整轮撤销。
- 决策：（1）不实现暂存区式 Review 模式；权限模式对用户只提供 Full Access 与 Read Only。`review` 作为保留值继续存在于 schema 与运行时，
  维持 fail-closed（写操作结构化拒绝、零写入），界面不提供入口；R01 “绝不静默降级为 Full Access”仍然适用。
  （2）以“改动审阅”取代 R02/R03/R05：Agent 直接写入工作区，每轮结束后给出本轮改动摘要与按轮分组的改动列表，用户可逐文件查看 Diff 并撤销，
  也可撤销整轮；撤销延迟执行并可撤回；不审阅不阻断下一轮。按块撤销列为后续步骤。
  （3）R04 不变：Full Access 高影响操作的一次性目标绑定确认继续有效，名称为“高影响操作确认”。
  （4）实施由 [A9-24](tasks/A9_24_REVIEW_MODE.md) 承担，须另经 `APPROVED_FOR_IMPLEMENTATION`；A9-16 已取得的结论不改判。
- 后果：没有“写入前审批”能力；对要求“未批准不得改动工作区”的场景，只能使用 Read Only。A8 `review-staging.ts` 不接入 A9，保留为历史资产。

## ADR-0144 以当前主线换发 WIN7-40，在 Win7 实机验收 A9-24 改动审阅

- 状态：Accepted（2026-09-27，负责人批准 A9-25）
- 背景：A9-24（ADR-0143）已在开发机通过并并入 `codex/a9-alpha2`（`c136d12`），真实 Electron 与 Win7 未执行。WIN7-39 已签发，但记录了
  Stop 后子进程退出时间与改动视图截图两项取证缺口。
- 决策：新建 [A9-25](tasks/A9_25_WIN7_40_REISSUE_AND_ACCEPTANCE.md)，以当前主线换发 `WIN7-40`，不做产品改动；W40 套件由 W39 机械派生，
  W40-01～15 回归 WIN7-39 用例并收紧 W40-05/06/13，W40-16～22 覆盖 A9-24；流程、硬门与取证沿用 ADR-0141/0142 与 WIN7-39 实机交接书附录 A、B。
  结论上限 `A9_25_WIN7_40_A9_24_PASS`。
- 后果：WIN7-39 及更早候选结论不变；A9-24 的 Win7 结论由 WIN7-40 取得。

## ADR-0145 WIN7-40 记为验证套件缺陷不通过，修订 A9-25 修复套件后换发 WIN7-41

- 状态：Accepted（2026-09-28，负责人按审核报告建议裁决）
- 背景：WIN7-40（A9-25，ADR-0144）在 Win7 实机 G1 通过、G2 失败。审核报告
  [a9_25_win7_40_acceptance_review_2026-09-28.md](reports/2026-09/a9_25_win7_40_acceptance_review_2026-09-28.md) 确认：
  `w40_review` 阶段因驱动 `a925OpenFileDiff` 读取未重绘的旧 DOM、`a925ClickUndo` 一次性查询无等待，在“撤销此文件”处报 `A9_W40_UNDO_BUTTON_UNAVAILABLE`；
  产品未发生错误写入或错误撤销，属套件时序缺陷，不是产品缺陷。套件打包在候选内，修复必然改变 ZIP 哈希，不能沿用 WIN7-40 编号与 authority。
- 决策：（1）WIN7-40 结论为不可变的 `A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS`；候选、authority 与证据保留，不得复用改判，不做部分签发。
  （2）不新建任务，修订 [A9-25](tasks/A9_25_WIN7_40_REISSUE_AND_ACCEPTANCE.md)（§9）：修复驱动时序缺陷并普查同类写法，从修复后的 W40 套件机械派生 W41 套件，
  换发 `WIN7-41`，结论上限 `A9_25_WIN7_41_A9_24_PASS`；冻结前在 Win7 连续预演至少 2 次且全部通过。
  （3）仓库驱动中的 `w40*` 旅程与辅助函数允许为修复而修改（WIN7-40 已关闭，其冻结 ZIP 保留）；WIN7-40 及更早的发布文件、`w39` 与更早旅程仍不改。
  （4）推进顺序中原定第一批使用的 `WIN7-41` 顺延为 `WIN7-42`。
- 后果：A9-24 的 Win7 结论改由 WIN7-41 取得；WIN7-39 及更早候选结论不变。执行方修正自产文件须另存新文件名，写入下一份实机交接书。

## ADR-0146 第一批可靠性（A9-26）：恢复目录自忽略、验证证据收紧、项目说明与环境事实注入、输入上下文预算

- 状态：Accepted（2026-09-29，负责人批准 [A9-26](tasks/A9_26_RELIABILITY_BATCH_1.md)，§7 全部按建议）
- 背景：推进顺序阶段 2 的第一批；D1 裁决（方案 3b）；W41 预演证据中编辑后只执行 `Write-Output` 即被记为 `verified`；
  System Prompt 声明 AGENTS.md 优先级但运行时从不加载；进程内对话历史无总量控制；目标 OS 为写死的默认值；选择工作区后过程记录不加载。
- 决策：
  1. 恢复根创建时写入内容为 `*` 的 `.agent_recovery/.gitignore`，打开工作区时幂等补写；已存在的文件不改写；写入失败不阻断，发结构化诊断 `A9_RECOVERY_GITIGNORE_WRITE_FAILED`。
     `git clean -fdx` 下的保护、迁出工作区与清理另议。
  2. 验证证据按“验证类 / 中性类 / 变更类”三分类，只有验证类成功才记 `verified`，无法判断归变更类；清除 `verified` 的条件改为相对上一次收集出现新变化。
     `turn_completed.data` 只增 `verificationEvidence`（脱敏命令 ≤200 字符与退出码），结论卡显示依据。具体分类以复现结果定稿，写入任务书执行记录。
  3. 每轮加载工作区根 `AGENTS.md`（≤32 KiB，UTF-8），作为 System Prompt 之后的独立消息且每轮替换，不进入对话事实与恢复历史；
     失败原因以 `turn_started.data.projectInstructions.status` 表达。System Prompt 升为 `a9-system-prompt-v3`，只声明实际加载的来源。
  4. Provider 请求按字符预算组装（默认 96,000，可在 Provider 配置选填 `contextBudgetChars`，不加界面）：固定前缀 → 当前轮 → 历史完整轮次；
     当前轮超限时以占位替换最早的工具结果并保持 `tool_calls`/`tool` 成对；可识别的超长错误以半预算重试一次。`turn_started.data` 只增 `context` 统计。
  5. 环境事实只注入不启动进程即可探测的事实与对应的 Win7 注意事项（≤1.5 KB），非 Win7 环境不写 Win7。
  6. 取消轮次发 `turn_completed`（`outcome=cancelled`），不新增事件类型、不改 State；改动审阅响应只增 `reasonCode`。
  7. 选择或切换工作区后立即加载活动对话的过程记录，未加载轮次的 `.legacy-note` 语义保持。
- 后果：事件与响应只增字段，持久化格式不变；W39～W41 驱动与旅程不改，WIN7-42 套件去掉 M4 热身轮。
  O-4（命令产生文件的 Diff）不在本批，与按块撤销另立任务。Win7 结论由 WIN7-42 取得，此前为 `NOT_PERFORMED`。

## ADR-0147 批准 A9-27：以 WIN7-42 验收 A9-26 第一批可靠性

- 状态：Accepted（2026-09-30，负责人在当前对话批准任务书及验证后合入 main 的流程）
- 背景：WIN7-41 已签发 A9-24 PASS，其冻结源码不含 A9-26；A9-26 仅取得开发机门，Windows Git、真实 Electron 与 Win7 仍未执行。
- 决策：（1）批准 [A9-27](tasks/A9_27_WIN7_42_REISSUE_AND_ACCEPTANCE.md)，只实现其 §4 中的 W42 验证套件与发布装配，不改产品、native 或历史候选。
  （2）ADR-0146 中“WIN7-42 套件去掉 M4 热身轮”按新增 W42-27 无热身旅程落实，继承的 w39/M4 旅程保持原样。
  （3）继承夹具两处纯输出验证命令改用目标机既有 Python 执行 check.py，列为登记派生差异，驱动断言不变；目标解释器和 Git 在 agent 下核实路径、版本、哈希与可执行性，不安装软件。
  （4）W42-01～22 全量回归，新增 W42-23～28；连续两次 Win7 预演、双独立干净构建、候选外 authority/独立 pin、agent 控制台 Medium、秘密扫描与后飞行均保持。
  （5）维持 0.3.0-alpha.1 能力集标识，结论上限 A9_27_WIN7_42_A9_26_PASS，不宣称完整 Alpha 2 或新 RC。任务批准不代替门 A 与门 B 签发。
- 后果：执行和证据审核分离；实机/预演暴露产品缺陷时按任务书停止相关下游并另立任务；验证和合并前审查通过后按负责人授权合入 main，保留历史与既有工作区修改。

## ADR-0148 A9-28 修复失败验证大输出与不可压缩上下文预算遗漏

- 状态：Accepted（2026-09-30，负责人明确批准 A9-28，修复后继续）
- 背景：冻结前开发机 Core 入口复现失败验证大输出仍保留 verified；有效大小项目说明的固定前缀突破请求预算。见 [复核报告](reports/2026-09/a9_27_premerge_contract_review_2026-09-30.md)。
- 决策：（1）批准 [A9-28](tasks/A9_28_RELIABILITY_CONTRACT_GAPS.md)，按其允许路径最小修复；验证判定读取截断前结构化执行结果，验证失败、异常或无法判定清除旧验证依据，中性查看保留既有成功验证。
  （2）预算组装后仍超限时，在 Provider 发送前结构化失败，超限请求零发送；不得裁剪用户输入、最后工具结果或拆散配对；半预算重试同样适用。
  （3）补强 W42-24 大输出失败与 W42-26 不可压缩超预算验证，保留既有 28 项判据；修复开发机通过及独立审核后重新预演，未经目标环境验证仍 NOT_PERFORMED。
- 后果：不引入依赖、schema 或 IPC；不借此修复 A9-29 的必需审计/Provider 完整性风险，后者独立批准；原候选与既有证据不改。

## ADR-0149 A9-29 必需审计故障与 Provider 响应完整性修复

- 状态：Accepted（2026-09-30，负责人明确批准 A9-29，修复后继续）
- 背景：冻结前开发机真实 Runtime/SQLite 与 Gateway→Core 入口复现必需审计故障后仍编辑、未正常结束的工具流仍执行；为继承安全阻断，非 Win7 现场事件。
- 决策：（1）批准 [A9-29](tasks/A9_29_AUDIT_AND_PROVIDER_COMPLETENESS.md) 允许范围；必需持久化审计与观察回调分离，tool_start 写入失败零 dispatch，tool_end 失败停止后续工具，最终审计失败明确返回不完整状态并保留副作用事实。
  （2）保留 Provider 真实结束原因，工具执行需明确 tool_calls 原因及 DONE 或正常 EOF；缺失或矛盾结束、length/content_filter 均零工具执行，空流不虚构完成。兼容有明确结束原因但无 DONE 的服务，不自动重试异常工具响应。
  （3）W42 扩为 30 项，新增审计故障与 Provider 完整性，保留原 01～28 判据与 A9-28 补强。开发机、独立审核和目标环境证据分别记录，门 A/B 不因任务批准而省略。
- 后果：不改持久化格式、依赖或网络权限；按隔离分支追加提交，修复通过后恢复预演及原验收/合并流程，历史候选不改。

## ADR-0150 helper v3 和 A9-30 Shell 运行中输出

- 状态：Accepted（2026-10-01，负责人明确批准 A9-30 和 ADR-0150，作为开始 Shell 实时输出实现的具体依据；原生构建另行授权）
- 背景：WIN7-42 完成第一批可靠性；现 helper 只发送启动和最终输出，S01–S06 尚未覆盖。
- 决策：[helper v3](plans/A9_HELPER_V3_STREAMING_PROTOCOL.md)采用 requestId/序号/双源字节帧、独立有界 writer、可等待输出回调及跨块解码脱敏；先持久化再发布版本化 tool_output，SQLite 表 schema 保持。
  新 D-013 v26/协议 v3/Current User Profile 独立登记，D-017 双独立干净构建和新锁；历史 v24/v25、输入锁和候选不改。
  [A9-30](tasks/A9_30_SHELL_STREAMING.md)给出已批准的精确文件和验证合同；不启用后台 release 或继续。
- 后果：A9-30 可按批准分支、基线和精确白名单开展实现；新 Profile/API 依赖登记及独立安全复核仍须完成。本机 Demo 和 docs 检查不构成原生或 Win7 PASS。构建、提交推送、候选门 A/B 分别授权；ADR-0151/0152 仍为 Proposed。

## ADR-0151 A9-31 后台进程模型工具与显式释放提案

- 状态：Accepted（2026-10-03，负责人批准C2：A9-31修订任务书、精确白名单、增量检查及C1实际提交基线绑定；原生构建另行批准）
- 背景：现有 BackgroundProcessManager 不等于完整模型工具面；helper KILL_ON_JOB_CLOSE 使 dispose(false) 不能证明 Win7 进程留给系统。
- 提案：[A9-31](tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)复用输出流，增加 start_process/read_process_output/stop_process；句柄/游标绑定工作区、对话和原启动身份，最多三个，禁止任意 PID。
  保留高影响目标确认、Stop 和切换限制。释放仅用于用户明确选择“留给系统后退出”，先审计，再 request-bound release/回执、Job 位回读和退出后实测；错误/回执缺失不写成功。
  release 扩展须另一次 v26 原生 revision、依赖评审、双构建和重锁；不能全局关闭 Job 崩溃回收。
- 后果：重启只探测旧事实，不重放/接管；安全审阅和目标平台存活证据独立，具体任务批准不代替候选裁决。
- 2026-10-02待审补充：managed升级v3，不从旧v2或直接spawn静默回退；启动/归属/输出/release意图必需审计。
  managed kit及runtime消费逐项授权，新helper影响的Shell/背压/脱敏/清理按 [增量矩阵](plans/A9_BATCH_2_INCREMENTAL_VALIDATION.md)重测。仍Proposed。
- 2026-10-03批准登记：上述“仍Proposed”为待审历史时点，现以负责人C2具体批准为准；
  基线c2b6356f83ef8502a34516010924547c57a3bec2，实际原生锁/构建、独立复核和Win7结论不由本批准代签。

## ADR-0152 A9-32 用户主动继续中断任务提案

- 状态：Accepted（2026-10-11，本轮负责人直接实施指令）
- 背景：用户已选择“用户点击继续”，第一批历史加载和预算基础已完成。
- 提案：[A9-32](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md)在严格身份/revision与SQLite事务去重后创建关联的新Turn；恢复事实摘要并重核模式、Provider、AGENTS.md、当前文件和预算。
  未完成工具结果标未知，先读现状；旧Shell/工具调用/审批不重放；重启零自动请求。新事件payload版本化，无表迁移。
- 后果：按钮不提升权限；双击、崩溃、审计/Provider/预算失败可追溯。本提案不是完整Alpha2或RC通过结论。
- 2026-10-02待审补充：绑定A9-31已审核整合SHA/managed锁；未改native可提议精确继承，
  Runtime/Core/State/Renderer的继续、审计/预算/恢复仍直接检查。仍Proposed。


- 2026-10-11批准依据：负责人要求“按照这个规划制定实施计划，并新开窗口，采用gpt-6.1 sol xhigh实施”。
  本轮批准 A9-32 §1–5 本地范围、准确基线 571ec550b5e09611f55557563d0cf2f1a4a40d1b 及同范围修复/验证。
  不代签独立审核、真实 Electron、Win7、完整 Alpha2、Git提交/推送、远端或候选门。

## ADR-0153 A9-30 v26 开发检查包及独立返回复核登记

- 状态：Proposed（2026-10-01；本地实现依据负责人已授权的 A9-30 收口计划，正式套件和返回批准仍待独立复核）
- 背景：A9-30 需先取得原生与真实 Electron 开发证据，不能复用 WIN7-42 或提前占用 WIN7-43；技术 PASS 不能替代独立返回复核。
- 提案：新增独立 A9-30-DEVELOPER-INPUTS-D013-V26 锁和 A9_30_DEVELOPER_CHECK.json，使用 Alpha 2 / 协议 v3 / Current User v2，
  无正式 authority 或历史验收结论。套件登记与 committed HEAD 绑定，return_review 另绑定独立复核人、实现人、报告 SHA、时间及两组 run-id/ZIP SHA；
  原生记录器与装配生产者都拒绝缺失或错配。v25/W42 保持逐字节原合同；未知清理不签 PASS。
- 后果：批准源码实现不等于批准正式 kit、返回复核、构建机动作或开发 Gate；具体交接和负例见 [A9-30 收口交接包](plans/A9_30_DEVELOPER_CLOSEOUT_HANDOFF.md)。

## ADR-0154 A9-30 v26 构建身份事实校验

- 状态：Proposed（2026-10-02；依据已批准的非提升构建合同修复身份门，未自行 Accepted）
- 背景：Win10 实测受限令牌管理员角色为 false，但 TokenElevation=true、High RID 12288。r2 仅按角色判定，已撤销且未构建。
- 提案：environment 身份字段版本 1，直接查询进程令牌的提升标志、提升类型、Integrity SID/RID 和 Host Job；仅接受普通角色、非提升、Default/Limited 类型、Medium SID/RID 8192 及明确无 Job。构建与返回记录器都拒绝缺失或未知。
- 后果：诊断入口只输出身份，不生成正式证据；历史 v25 合同不变。重发独立复核的新 kit，保留失败探针及 r2 历史登记。

## ADR-0155 第二批增量证据与独立新候选验收提案

- 状态：Proposed（2026-10-02；负责人要求准备整批推进，未批准具体套件或候选）
- 背景：A9-30完成开发机收口，A9-31/32将改变共享调用链；逐次重跑稳定宿主浪费，但仅比文件hash不足以证明行为未受影响。
- 提案：[增量矩阵](plans/A9_BATCH_2_INCREMENTAL_VALIDATION.md)将源码/工件/依赖/配置/调用行为/原报告run-id与身份一并绑定；
  新接口和共享安全入口直接检查，未受影响且具体获批的记录才标INHERITED_EVIDENCE。
  [A9-33](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md)另立正式v3装配/套件合同，不能套A9-30开发包authority；
  新候选连续双预演、双干净产品构建、冻结/门A/普通Win7桌面执行/独立审核/门B，历史失败不覆盖。
- 后果：不放宽C14、权限、安全或Win7硬门；当前Win7未执行，完整Alpha2/RC不纳入本批裁决。

## ADR-0156 A9-31 managed 构建烟测的 OS 进程身份证据

- 状态：Accepted（2026-10-03；负责人批准ADR-0156、已形成六路径修复合同及本地定向检查；提交/构建另行授权）
- 背景：managed r2 独立复核发现P1。协议childPid与同字段派生的smoke root_pid互相对照，不能独立证明实际helper/root/marker child的父子关系；release自然退出未绑定真实退出码。原r2为FAIL_NOT_APPROVED。
- 提案：仅构建机捕获器增加只读Toolhelp进程快照（CreateToolhelp32Snapshot/Process32FirstW/Process32NextW/CloseHandle），绑定实际helper句柄/PID/creation、root/child句柄/PID/creation/父PID，在相关父进程存活时完成钉住后才发control。任何未知/不符停止该smoke，不提升权限或回退WMI。来源为构建机系统Kernel32，不进入产品DLL或目标Win7运行时。
- 格式：仅尚未批准managed返回证据v26-managed.json升schema_version=2，必需实际helper/父子身份、时间与真实退出码；release两组须固定根/子进程自然退出且exit0；cancel两组须根退出码与协议终态一致。旧证据不升级或重绑，A9-30/v1/v2锁和native协议不变。
- 结果：批准后只在[精确修复材料](plans/A9_31_MANAGED_IDENTITY_REPAIR_APPROVAL.md)六项白名单内实施；源码提交、新kit批准/双构建、远端写入和候选门仍分别具体授权。当前原生/真实Electron/Win7均NOT_PERFORMED。

## ADR-0157 A9-31 控制器调用者身份与不可覆盖的重试记录

- 状态：Accepted（2026-10-03；负责人批准R2精确控制输入、独立只读复核、复核通过后四路径本地登记提交及既有范围内远端部署/普通用户双构建；原生与目标平台结论仍依据实际证据）
- 背景：managed r3 首次启动在 CreateProcessW 的 breakaway 创建处返回 code 5，未记录调用者 Job/令牌；重复运行被已有失败记录阻断。只读查询确认当前 WorkBuddy 进程在 Job，普通桌面 CMD/Explorer 不在 Job；不能据此还原已退出的失败进程身份。
- 提案：[R2 补批材料](plans/A9_31_MANAGED_R3_CONTROLLER_RETRY_APPROVAL.md)只增加固定启动入口及本地调度器。调用者先实测普通角色、非提升、Medium、SID1005/Session3、无 Job，再以 CREATE_NEW_CONSOLE 创建同令牌子进程；子进程沿用原 worker 再检查完整身份。未知或失败停止，不请求脱离 Job、不修改系统设置或提升权限。
- 格式：原启动失败 JSON 保持原名/字节；新增 launch-r2 记录 schema_version=2，绑定调用者 PID/启动时间/SID/Session/完整令牌与 Job、实际创建结果、source/kit/批准登记及保留失败哈希。批准登记 schema_version=1 只追加 controller_retries 元数据，历史 kits 数组不改；缺失具体批准/独立报告/准确输入或依赖哈希拒绝启动和派发。
- 后果：保持原两固定请求、60分钟和 BuildA→BuildB，原 native源码/23文件kit/六控制/构建目录及权限不变。调度器只把精确哈希的原首失败作为历史事实；任一新 FAIL/漂移/未知生命周期停止。实际输入部署与本地登记提交需具体授权，原生/真实Electron/Win7仍 NOT_PERFORMED，不自行签收口。

## ADR-0158 A9-31 准确原生双返回的有限离线重锁裁决

- 状态：Accepted（2026-10-03；负责人对准确审批包§1–6及ADR-0158回复“批准”，允许准确两个返回离线重锁和十路径/五路径两次本地提交；UNKNOWN和独立P1保留）
- 背景：准确 managed r3 在普通 SID1005/Session3/Medium/非提升/无 Host Job 的 Win10 桌面完成两次独立干净构建。两返回原生证据、helper字节、输入闭包及工具一致性通过；R2控制器完成后未持有句柄记录其实际退出码/完整子树，后飞行和Security4688/4689只读补查不能补足，仍为UNKNOWN。ADR-0157现行硬门因此停止重锁/装配，不能事后伪造清理PASS。
- 提案：仅当负责人批准且独立报告确认没有原生身份、审计、安全或managed根/子生命周期缺口时，允许离线登记并重锁[具体材料](plans/A9_31_MANAGED_R3_RETURN_RELOCK_APPROVAL.md)绑定的两个不可变返回。source `10114503a1e79706131ea4a11a5b96bd2958807a`；kit SHA `0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1`；BuildA run `3abe9a16-449b-4900-956e-6d0fb4c40fe2` / ZIP `251674103e519b4e642c46b38d2b8af29929732a209613cfc5d3721daba47a40`；BuildB run `33514a91-c5e8-4bb0-9176-135782175c88` / ZIP `ce8679187e120d8c0c9896fd201f37dfb1187e87d58702c3529f24b73737ff44`。除此以外不调整ADR-0157的停止规则。
- 格式与证据：registry schema1仅向managed r3追加独立return_review；kit登记编号与已锁定manifest原生revision分别核对，后者固定`a9-31-managed-r1`，源/完整manifest/输入及返回哈希保持严格绑定。新managed输入锁单独生成，provenance明确controller退出码/树清理UNKNOWN、负责人裁决与开发用途；原报告/返回/首失败/超时不改判。原生pipe背压缺失终态保持既有有界失败边界，不写清理PASS。
- 失败与范围：批准前或独立报告发现上述原生缺口时继续阻断。该一次裁决不证明controller生命周期、不恢复旧控制器、不允许新增远端执行或改变账户/ACL/UAC/Job；后续产品装配/真实Electron/Win7仍按各自合同和新控制器证据准入。新执行入口必须预先形成句柄退出码与生命周期取证合同。源码/登记提交与新锁生成/提交按准确十路径、后续五路径范围另行批准；不推送/合并/发布，不签DEVELOPER_VERIFIED、Alpha2/RC或Win7 PASS。

## ADR-0159 A9-31 新产品验证控制器的持有句柄生命周期合同

- 状态：Accepted（2026-10-03；负责人具体批准执行合同§1–6、四个准确外部验证路径、新profile根和8phase/2小时16请求；旧UNKNOWN/P1保留）
- 背景：managed r3原生双返回已有限离线重锁，旧控制器实际exit/tree UNKNOWN及独立P1=1保留。产品实机需新控制器，旧A9-30/到期入口不可复用；SID1005实际profile带主机后缀，不能猜同名profile或扩大ACL。
- 提案：[具体执行合同](plans/A9_31_PRODUCT_R1_WIN10_VALIDATION_APPROVAL.md)绑定source35a1925、ZIPaae71bb0…d2f10c0/manifestdf70fa5b…97e7b9/managed锁7593e758…461d3e、SID1005/Session3与实际profile下全新隔离根。四个精确外部脚本在C14补充批准后实施，固定8phase/2小时/16请求及不可变hash pin。监督器持有controller句柄，controller持有实际Electron/helper/root/child句柄与PID/creation/parent，记录真实exit和树；不以消失补签清理。
- 失败与范围：普通夹具失败只有已证明生命周期结束才可等待新请求；身份/完整性/安全/审计/未知生命周期立即HALTED。release真实存活与自然退出分开，不造零残留。沿用已有令牌/Job/Toolhelp/.NET捕获，不改变产品依赖/API/数据schema、账户/ACL/UAC/Bitvise/服务；新根使用用户现有继承权限。批准前不编写四个未在白名单的脚本、不写远端。
- 后果：本包技术/用户审批不代替真实Electron、最终独立收口或Win7证据；旧UNKNOWN/P1不改。原生不重编、不复活旧控制器、不签Alpha2/RC，不默认提交/推送/合并/发布或委派。

## ADR-0160 A9-31 有限桌面调度窗口与不可变 driver 修复版本

- 状态：Accepted（2026-10-03；负责人对R3具体合同§1–6及ADR-0160明确回复“批准”；同四路径及准确R3目标内实施/检查/冻结/执行获准，原硬门不变）
- 背景：R2 在实际普通桌面启动，但外部 driver 误用 ASAR 感知 fs，Boot 原错误与持有实例 exit1 已保存。按 ADR-0088 的本地修复通过；冻结 driver 不可覆盖，旧入口不能执行新字节。每次修复都重新人工启动阻碍验证。
- 提案：[R3 具体合同](plans/A9_31_PRODUCT_R1_R3_REUSABLE_DESKTOP_APPROVAL.md)在同四项 C14 外部测试源路径实现有限桌面调度窗口，固定2小时/16请求/原八phase/同 source 与包/目标/身份。三PS与捕获/安全门冻结；同范围 driver 修复可定向检查、CreateNew登记新不可变 revision pin/四文件副本，由 SSH 派发新 run；不替换在执行的副本。master/revision/范围登记均版本1，九字段请求绑定准确 script digest 与 pin。
- 兼容：只读复用 R2 锁定输入、包及 Electron，R3 写准确隔离新根；不改变 native/产品/SQLite/IPC 格式，物理 ASAR 校验使用已登记内建 original-fs。保持普通 SID1005/Session3/Medium/非提升/无Host Job，既有API和权限，不加入服务、自动登录或任意命令接口。
- 失败：普通 driver 失败且持有的真实树全部结束可 WAITING；身份/完整性/安全/必需审计/未知生命周期立即停止，不复活旧 HALTED，不用新 revision 改判旧失败。到期/到限不重置，三PS或安全合同变动需新具体裁决。
- 边界：批准前仅既有授权下的 ASAR 源修复/本地检查及文档完成；新调度实现与R3远端写入 NOT_PERFORMED。不授权提交、发布、原生重编、账户/ACL、Win7或开发收口。ADR-0159 持有实例/退出证明和硬停止合同继续适用；只有本提案 Accepted 后，R3 的调度/普通修复版本部分采用本准确新合同。

## ADR-0161 A9-31 R4 捕获与失败收尾的准确新合同

- 状态：Accepted（2026-10-03；负责人对R4合同§1–5及ADR-0161回复“批准上述 R4 合同与 ADR-0161”；只批准新R4，不改变历史UNKNOWN）
- 背景：R3普通桌面身份通过，准确Boot run979976d3260e49a7a316bf8c0e604971先出现权限选择前测试焦点的夹具失败；两监督器又在Toolhelp观察后绑定PID13524失败，HALTED且若干实例退出码UNKNOWN。原始快照未含Exe/底层原因，不能靠后来PID消失补签清理。
- 提案：[R4准确合同](plans/A9_31_PRODUCT_R1_R4_CAPTURE_RETRY_APPROVAL.md)仅四外部测试源，把同次观察/持句柄步骤移入既有C#捕获层，保留失败观察与完整异常信息；硬失败保持HALTED，同时有界记录已经持有实例的实际退出。新窗口/根和master须负责人具体批准，不复活R3或忽略无法绑定进程。
- 格式：新增schema1捕获诊断绑定master/revision/request/观察PID/父/Exe/步骤/异常/已持有实例及unresolved_observations；本次controller-abort固定五字段，仅两种已有生命周期原因，driver核对后走既有真实产品Stop/等待/关闭链，不接受任意命令/PID。不新增系统API或产品权限，未绑定观察保留UNKNOWN，即使其余句柄退出也不改判。
- 后果：只在批准后的准确Win10普通SID1005/Session3/Medium/无HostJob桌面执行，同R2锁定产品和八phase、2小时16请求、冻结三PS和master、逐版driver登记、完整性/审计/身份/生命周期硬门继续。所有旧输入、首次失败和UNKNOWN保持；Win7、独立收口和任何提交/系统改变不包含。

## ADR-0162 A9-31 R5 捕获程序集的准备编译与运行准入

- 状态：Accepted（2026-10-03；负责人回复“批准”，批准R5合同§1–5及ADR-0162；R4硬停止及UNKNOWN保留）
- 背景：R4普通桌面启动通过；Boot run01e5a8be22e9473fae4da8b1059eb46a在worker初始化观察csc.exe PID33576但已无法取得句柄，编译器creation/exit UNKNOWN。冻结serve每进程Add-Type源编译的路径与该父关系/时间相符。增加轮询速度不能保证持有短命编译器。
- 提案：[R5准确合同](plans/A9_31_PRODUCT_R1_R5_CAPTURE_PRECOMPILE_APPROVAL.md)仅原四外部测试源，将现有7700 bytes/7fe2e6db…6269b1捕获C#移到准备阶段编译为单独DLL。固定已安装Microsoft Framework编译器与参考hash，实际编译句柄/exit与输出登记；普通dispatcher/worker在完整批准/PS/master/程序集准入后从校验的同一字节加载，不回退源编译或搜索DLL。编译器仍不可忽略，其他未绑定观察仍HALTED。
- 格式与运行：外部schema1 master/revision新增严格capture_library闭包，绑定源、工具、参考、成功编译记录、准确DLL尺寸/hash与Win10测试Runtime Profile；缺失/额外/错配/reparse拒绝。不是产品依赖或D-013重锁，不改变SQLite/IPC/原生。该Framework预检不声明Win7前置或兼容PASS。
- 范围：准确R5根与派生编译/输入/控制文件、普通SID1005/Session3/Medium/非提升/noHostJob、2小时16请求/八phase、冻结三PS/master/程序集及新checked driver版本按具体合同。Administrator仅准备/传输，不代替普通产品证据；原12捕获/abort、协议判据及程序集准入负例和实际无worker编译器检查必跑。
- 后果：负责人具体批准前只读与文档；R3/R4/旧native P1及UNKNOWN保留。硬停止后另立合同，不恢复旧窗口，不改账户/权限/Job/UAC/Bitvise/许可证，不提交/推送/整合/发布/委派，不执行Win7或自签开发收口。

## ADR-0163 A9-31 R5 fixed interactive scheduled desktop entry

- Status: Accepted (2026-10-03; the current user explicitly approved the exact no-manual-PowerShell plan).
- Contract: [approved entry plan](plans/A9_31_R5_SCHEDULED_DESKTOP_START.md). Register only root task `\A9-A31-R5-Desktop-20261003` with TASK_CREATE, never overwrite. Principal SID1005, InteractiveToken, LeastPrivilege; fixed system PowerShell, exact frozen R5 launcher and master arguments. No triggers, no automatic restart, IgnoreNew, demand start only.
- Administrator SSH performs configuration and dispatch only; product execution must prove SID1005/Session3/Medium8192/non-elevated/noHostJob. No password, automatic logon, service or account changes.
- Verify exact task XML and tool hashes before Run; require real start/ready and token evidence rather than Task State or LastTaskResult. Repeated Run must not create another instance. Retain original bounded R5 stop/lifecycle rules. If identity or Job gate fails, stop downstream and disable this task; do not detach Job or weaken the gate.
- Scope: existing ADR-0162 source/product/eight phases/two hours/sixteen requests and all hard gates remain. Only this exact task setup, launch verification and failure-disable rollback are added. Frozen script changes and new product inputs require their existing authorization. Current R5 product acceptance and Win7 remain unconfirmed. No commit, push, merge or release.

### ADR-0163 direct result (2026-10-03)

Registration/readback succeeded; actual scheduled launch inherited a Host Job and failed the unchanged R5 noHostJob gate before any product request. Approved rollback disabled the exact task. ADR-0163 authorization is not an acceptance PASS. [Evidence](reports/2026-10/a9_31_r5_scheduled_desktop_entry_failure_2026-10-03.md); R5 remains HALTED, no restart or manual-command fallback.

## ADR-0164 A9-31 R6 入口所有权与历史硬停止隔离

- 状态：Accepted（2026-10-03；负责人回复“批准”，批准R6合同§1–5及ADR-0164；旧R5硬停止和UNKNOWN保留）。
- 背景：R5计划任务曾因InJob=true HALTED；之后普通手动实例虽身份通过，却因冻结入口只检查旧start而与旧final并存。代理没有复查最新硬停止即给旧命令，未派发产品请求；停止实际退出仍UNKNOWN，旧final保留。
- 合同：[R6准确审批](plans/A9_31_PRODUCT_R1_R6_ENTRY_GUARD_APPROVAL.md)仅四外部测试源和新准确R6根。入口拒绝已有claim/start/ready/final/stop，CreateNew取得独占claim；未取得者零worker、不写共享终态，禁止重启污染。普通桌面/noHostJob、捕获与UNKNOWN判据继续。
- 来源：只读沿用准确R5预编译DLL及原build，capture_library严格增加build_approval_sha256、固定capture-build-scope-approval.json，区分原编译批准与新执行批准，原记录不改绑。精确字段、两批准来源及重复/并发/硬停止负例按合同检查后才能冻结。
- 边界：原R5永久保留，不再执行；旧窗口正常stop/GUI关闭须跨动作持有准确实例，退出不可证明仍UNKNOWN。R6仅批准后普通桌面一次启动、原八phase/两小时16请求及checked driver可复用调度；不新增系统API/任务/账户/权限，不改产品/native/锁，不提交/委派/执行Win7或自签收口。

## ADR-0165 A9-31 R7 查询句柄捕获与 Renderer 动作序列化

- 状态：Accepted（2026-10-03；负责人回复“批准 R7 精确范围及 ADR-0165”，批准合同§2–5及精确新增源/API/编译/远端范围）。
- 背景：R6普通桌面门通过，但权限选择表达式引号转义导致Renderer语法失败；独立的短命cmd在取得.NET Handle时已退出，dispatcher HALTED。已有53文件原始回收与UNKNOWN不改判。
- 合同：[R7准确范围](plans/A9_31_PRODUCT_R1_R7_QUERY_HANDLE_CAPTURE_APPROVAL.md)。普通driver具名函数序列化已在原精确路径修复、73检查通过。新增第五外部C#源，使用最小查询/等待权限非继承真实句柄，查询原实例创建/退出时间、PID/Session/映像及signaled/真实退出码，替代依赖.NET非退出Handle属性；已经销毁、错身份/拓扑/时间、API失败仍UNKNOWN/HALTED。
- 接口：新WIN10_PS51_NET4_QUERY_HANDLE_CAPTURE_V2_TEST_ONLY捕获profile和严格source/API/DLL/MVID/build/批准闭包，仅外部夹具。新增kernel32查询API先按WIN7_CONSTRAINTS登记并具体批准；不进产品/SBOM/D-013锁，不声明Win7实机兼容，不调整Job/权限或使用debug/终止API。
- 边界：新准确R7根、准备编译与有限普通窗口须确认；R6不复用，只有树真实结束的普通driver失败可同窗口不可变版本重试。原八phase、2小时16请求、所有安全/生命周期硬门保持，不提交、改系统、委派、执行Win7或自签收口。

## ADR-0166 A9-31 R8 快照区间内实例的双观察绑定与准确诊断

- 状态：Accepted（2026-10-03；负责人本轮回复“批准”，批准R8合同§2–4及ADR-0166的准确范围）。
- 背景：R7普通身份通过，唯一Boot在子PID66612的父创建/退出、Session、snapshot开始联合判据失败。后续实际持有同子实例的creation/Session/exit支持调用区间内创建的推断，但首gap缺少边界，不能改判UNKNOWN；R7已HALTED。
- 提案：[R8合同](plans/A9_31_PRODUCT_R1_R8_SNAPSHOT_INTERVAL_APPROVAL.md)仅同五个精确外部源记录CreateToolhelp调用前和成功返回后的准确区间。创建早于开始保持旧判据；区间内先保留真实查询句柄、禁止派发，以额外一次Toolhelp同PID/父/exe及第二只查询句柄的PID/creation/Session/native映像证明同实例，关闭核对句柄而不替换原对象。过晚创建、缺失第二次证明、任何错配/查询/关闭失败仍gap及HALTED；每次捕获最多两个snapshot，不扩权限/API。
- 格式：仅外部测试Profile/API合同升V3，捕获diagnostic schema2保留精确边界、比较值和证明状态；未知保持UNKNOWN，历史schema1/首失败不改。产品/native/输入锁/SQLite/IPC不变；准备编译仍用已锁定系统csc/三参考和具体批准。
- 范围：未批准前不实施、不编译、不创建R8。批准后仅准确R8根、SID1005普通桌面八phase/两小时16请求、受控普通失败与同实例不可变driver修复重试。身份/安全/完整性/审计/生命周期未知仍停止，固定PS/capture安全门冻结后不可热改。无提交/系统设置/委派/Win7或收口授权。ADR-0165及R7时间门仍为历史合同，不用本提案改判旧run。

## ADR-0167 A9-31 R9 同步只读系统探测的真实退出回执

- 状态：Accepted（2026-10-04；负责人回复“批准 R9 §2–4及 ADR-0167”，批准准确五源、证明合同及R9执行范围）。
- 背景：[R8直接报告](reports/2026-10/a9_31_r8_interval_capture_and_short_lived_cmd_failure_2026-10-03.md)中普通身份和7项Boot检查通过，cmd PID78328被Toolhelp观察后OpenQueryHandle返回87，creation/exit UNKNOWN，窗口HALTED。源码有同步cmd-ver只读探测；缺少该次调用回执，来源不能直接认定。区间双观察不能补造已经无法取得的句柄。
- 提案：[R9 §2–4](plans/A9_31_PRODUCT_R1_R9_SYNC_PROBE_RECEIPT_APPROVAL.md)仅五外部源，在锁定Electron/Node原spawnSync调用记录真实pid/status/error和来源、准确argv、系统cmd及模块hash、父kernel pin、调用区间。只对唯一准确只读cmd-ver、status0且无error/signal的直接同步回执定义SYNC_READONLY_PROBE_EXIT_PROVEN；仍须证明与当前观测唯一关联，精度/复用/缺失/错属或其他执行全部UNKNOWN/HALTED。
- 证据边界：新回执证明Node同步调用的实际等待/退出，不等同取得原生查询句柄或精确OS creation。单列证明种类与原失败，不虚构Held/kernel cleanup，不改R8及历史UNKNOWN。有副作用/managed/异步工具及其他子进程继续原句柄/Job/Stop/release硬门。
- 范围：新外部测试profile及准确R9根、普通有限八phase/同窗口普通失败后正常Boot复验；准备编译仍用锁定系统csc/三参考，新source/DLL闭包独立锁定。未批准前不实施/编译/创建R9；不提交/改产品/native/锁或系统/委派/Win7/自签收口。ADR-0166及R8全部原始证据保持。

## ADR-0168 A9-31 R10 外部Win10捕获的精确UTC边界

- 状态：Accepted（2026-10-04；负责人回复“批准”，批准R10合同§2–4的准确范围）。
- 背景：[R9实际报告](reports/2026-10/a9_31_r9_desktop_partial_pass_and_clock_boundary_halt_2026-10-04.md)中同窗口Boot和Shell通过；编码54项断言通过后，实际PowerShell creation比DateTime.UtcNow记录的snapshot返回晚206ticks。原严格边界HALTED；后续同实例退出0不改首观测UNKNOWN。不同UTC精度是待实测假设。
- 提案：[R10 §2–4](plans/A9_31_PRODUCT_R1_R10_PRECISE_UTC_CAPTURE_APPROVAL.md)仅同五外部测试源，新增kernel32!GetSystemTimePreciseAsFileTime读取精确UTC包围同一Toolhelp调用。外部Profile/API升V4，准确系统DLL版本/hash/签名/入口与新source/DLL/MVID/master/revision/checks绑定；API不可用、时钟反向、类型或边界错配立即拒绝，无粗UTC回退/时间容差/移动边界。
- 不变判据：creation晚于捕获仍拒绝，区间内须原句柄及第二snapshot/查询的同实例证明；QueryAccess、非继承、native映像、父/Session/退出、两snapshot上限和R9准确只读cmd-ver回执安全合同保持。对照明确区分真实API与受控metadata；无数字PID清理或旧UNKNOWN改判。
- 兼容：该API最低Windows8，仅准确Win10/build19045外部测试，不进入产品/native/SBOM/Win7前置；未来Win7取证需独立合同，不加载此V4 DLL。官方依据：[精确UTC接口](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-getsystemtimepreciseasfiletime)。
- 范围：准确新R10根、锁定系统csc/三参考、只读API准入及普通有限八组/同窗口复验。R9不恢复，所有原证据/失败保留；未批准前只形成文档。不提交/改产品/native/锁或系统/委派/Win7/自签收口。

## ADR-0169 增量验收与发版工作规范

- 状态：Accepted（2026-10-04，负责人要求总结流程问题、改进验收过程并作为后续验收规范）
- 背景：[Win10流程复盘](reports/2026-10/acceptance_workflow_retrospective_2026-10-04.md)确认测试工具运行时差异、
  旧dist、被Mock掩盖的Windows路径语义、取证边界和过细交接造成重复返工。R1～R10不等于十次原生重建；
  同窗口普通夹具重试已有成功证据，安全硬停止仍必要，不能靠降低判据节省验收。
- 决策：采用[增量验收与发版工作规范](acceptance/ACCEPTANCE_AND_RELEASE_WORKFLOW.md)，并在AGENTS.md、
  EVALUATION和文档入口建立按需阅读入口。先构建依赖并测试实际加载产物；新改测试工具先在实际环境准入；
  优先最短真实产品链路，再按影响完成回归。分别绑定产品、原生、夹具与取证版本，满足完整适用条件才继承证据。
  同类失败连续两轮未闭环先最小诊断，不继续整批重试。复用现有普通桌面/SSH调度能力，
  新合同一次写清可预见同范围修复/重试，避免相同授权重复求批。候选稳定后按任务完成正式目标验收和发布。
- 适用：作为新任务/新方案工作规范；既有任务不冲突处立即采用。修改固定执行顺序、必跑范围、冻结安全组件
  或具体授权仍按原合同裁决，不改写Accepted ADR正文，不自动批准当前A9-31打包/远端重验。
  本决策不扩大C14白名单、不授权系统/账户变更、提交推送或发版，也不改变旧候选/失败/UNKNOWN。
- 后果：以用户功能、首个失败类别及受影响范围报告进展；复用现有矩阵和日志，不新增通用验证平台或强制全量检查。
  文档维护仅做文档/差异检查，产品/Win10/Win7结论不因本规范签发。ADR-0153～0168已用于并行工作树，
  本分支使用0169避免编号冲突，不因此导入或裁决那些工作项。

## ADR-0170 A9-31 Shell永久删除的本地Policy确认修复

- 状态：Accepted（2026-10-04；负责人回复“审批同意并检查有无类似问题”，批准准确三路径合同原§1–3）。
- 背景：r2实际Win10完整后台run `1c1848e6c2d446438f0e6ab355c2dfbb`在Full Access下未确认便派发Remove-Item；原FAIL、已停止根及r2包不改。
- 决定：仅`src/core/src/policy.ts`复用既有tokenize边界，识别明显非Git永久删除执行及支持的Shell包裹/复合形态；纯输出/注释为数据，删除执行歧义保守ASK。沿用原approvalId/完整command及args摘要、pending持久化与一次性消费；删除检查不得被自主Git提前返回跳过。不声称解析任意脚本或建立安全沙箱。
- 验证：仅policy.test.ts和a9-background-tools.test.ts新增实际反例、删除家族/纯文本及拒绝/错绑定零managed派发测试；离线Node20.17.0直接本地检查，不执行删除/网络/系统命令。既有合同Core八组/Shell九组及静态门消费当前构建，保护dist与工作区。
- 边界：[准确批准材料](plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)。其他高影响分类只读核查，三路径外/非删除实现另报；不改Runner/IPC/SQLite/native/锁，不打包、提交、远端重启或恢复R10，不签独立/Win7/DEVELOPER_VERIFIED。主仓已有ADR-0169，本工作树不占用该号，也不改其Accepted正文。

## ADR-0171 A9-31 非Git高影响复合命令分类与完整可见审批

- 状态：Accepted（2026-10-04；负责人要求“检查同类问题，如果确实存在请修复”，当前纯求值/源码已确认缺口）。
- 背景：删除修复后的当前源码仍有发布/系统8漏确认2误确认；自主Git提前返回、后缀/参数/转义拼写和全文正则导致漏报/误报。审批参数已完整digest绑定，但UI只显示summary，长命令截断或复合命令只含Git摘要不满足完整可见操作。
- 决定：在原有界Shell识别入口聚合非Git删除、包发布/上传、明确全局安装和reg/net user/sc/icacls系统变更，先于Git自主裁决；支持明显执行/宿主/控制流，区分纯数据/注释，歧义保守确认。审批summary包含完整原command及显式cwd，同时保留Git信息；digest算法、目标/参数变化失效和一次性流程不变。维持PRD尽力识别，不宣称通用解析或沙箱。
- 范围与验证：[修复材料§7](plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)准确四路径及原一行夹具保留；Node20.17.0离线先红后修、编译后Core九组/Shell九组和静态/文档/diff。仅纯求值和受控派发端口；本地结果不能代签真实Windows/UI/SQLite和目标平台。
- 边界：原898ee945、r2包/首FAIL/停止根和历史保持；不改原ADR-0170正文，不引入模块/依赖/API或改Runner/State/native/IPC格式；不打包、提交、远端操作、恢复R10、委派或自签独立/Win7/DEVELOPER_VERIFIED。

## ADR-0172 A9-31 短命进程的manifest精确字段补证提案

- 状态：Proposed（2026-10-04；独立manifest诊断已另获批准并完成，普通控制器接入仍未批准）。
- 事实：已批准独立经典ETW诊断在Win10取得12 cmd/12 conhost完整Start/End，零丢失且自有会话停止；但事件时间与OS创建时间不同，当前镜像只有basename。此结果不满足原实例身份合同，原R4及conhost78648的UNKNOWN不改判。
- 提案：按[准确补证材料](plans/A9_31_CONHOST_MANIFEST_FIELDS_APPROVAL.md)，独立验证manifest provider的CreateTime/ExitTime/ImageName；先在持有真实句柄的cmd上逐字段相等验证，再检查conhost的同PID+CreateTime、唯一父实例、Session、完整系统映像及真实End状态。缺失或矛盾保持NOT_PROVEN，不用事件头时间代替OS创建时间，不因父退出推断子退出。
- proof schema v1仅为候选：绑定source/run/机器/OS/provider版本、父与目标实例、准确创建与退出事实、会话零丢失和停止状态及组件hash/MVID；实际验证前不作为现有控制器可接受的新分支。新增EnableTraceEx2、TdhGetEventInformation及固定C:只读QueryDosDeviceW仅拟用于独立Win10测试，不进入Win7产品。
- 边界：本条不修改任何Accepted ADR，不授权恢复R4、普通第五根、正式PASS、产品/native/capture/控制器修改或权限配置。诊断通过后须另行批准具体普通接入与执行合同。

同日直接结果：准确诊断批准原文1f61d8b2…fac15171，manifest v3实际12 cmd/12 conhost、精确CreateTime/ExitTime与根句柄相等、Start完整系统映像、同实例End退出0、零丢失且session停止；36项真实报告反例通过。Stop仅basename，完整映像只来自Start，旧R4 UNKNOWN不改。[R5具体接入与执行草案](plans/A9_31_MANIFEST_PROOF_R5_EXECUTION_APPROVAL.md)已形成但未批准，须先复核其握手/最终收尾设计，不把本诊断PASS当作普通产品或新proof自动准入。

## ADR-0173 A9-31 manifest conhost proof的有限普通取证接入

- 状态：Accepted（2026-10-04；负责人回复“批准”，批准[R5合同r3](plans/A9_31_MANIFEST_PROOF_R5_EXECUTION_APPROVAL.md)§1–5，原文SHA256 540a7c614482cb13db57c45855531f5fc1898ad50b66e249857287c1066ed0d5）。ADR-0172 保持Proposed历史记录，不改写；其候选proof schema由本条在下列范围内采用。
- 背景：R4受控Boot因短命conhost快照后OpenQueryHandle返回87而HALTED，原creation/session/完整映像/exit为UNKNOWN且不改判；Win10隔离诊断已直接证明manifest provider可给出精确CreateTime/ExitTime、Start完整系统映像及同PID+CreateTime的End退出码。
- 决定：新增proof_kind `MANIFEST_CONHOST_INSTANCE_EXIT_V1`，仅放行“conhost.exe、OpenQueryHandle原生错误87、同PID+CreateTime的Start/End、准确System32路径、Session3、exit0、父为已证明cmd或PowerShell实例”这一分支；其余进程类别与错误类别继续原硬门，默认不预授权其他映像。观察器以Administrator持有独立自有会话，普通产品账户权限不变；停止信号仅由代理发出，phase PASS须等会话停止、零丢失、观察器exit0与最终清单一致。时间比较按DateTime→FILETIME固定换算并用16毫秒容差，同PID多候选一律HALTED。
- 边界：不恢复R4/R10，不改原query-failure与UNKNOWN字段，不修改产品/native/锁/capture，不新增系统配置；事件会话为Win10测试路径，不进入Win7产品，Win7实机验证未执行。独立验收、DEVELOPER_VERIFIED、Win7均不由此签发。

## ADR-0174 A9-31 Recovery重启实例证据文件命名修复

- 状态：Accepted（2026-10-05；负责人回复“批准”，批准[R6合同r2](plans/A9_31_R6_RECOVERY_RESTART_AND_REMAINING_PHASES_APPROVAL.md)§1–5，原文SHA256 97d402a37c7f0b8876d2a8c0bb56cedf4ac997c57556fa6f6bda9da5e6a7826f）。
- 背景：R5 Recovery在崩溃实例退出码93后由控制器再起重启Electron，该实例在模块加载期以`'wx'`打开已存在的`driver-journal.jsonl`，抛出`EEXIST`并弹出Electron主进程错误框（负责人提供原文），进程未退出，控制器`LIFECYCLE_RESTART_TIMEOUT`，dispatcher HALTED。该路径此前从未在Win10实际运行。
- 决定：仅外部driver，当`A9_TEST_RESTART==='1'`时journal、截图、post-final事件使用重启专用文件名，常规实例文件名不变；新增Node自检复现旧写法冲突并证明新写法与崩溃实例证据文件集不相交；另增控制器每请求前以普通账户读取观察器events文件的实际路径检查。观察器源字节不变并重新编译。
- 边界：不改产品/native/锁/capture、断言、真实对话框规则、SYNC、九字段请求；R5 HALTED入口与证据不改判、不恢复；不新增系统API；Win7实机未验证；不签DEVELOPER_VERIFIED/独立验收。

## ADR-0175 A9-31 控制器conhost proof父进程种类按NT设备路径判定

- 状态：Accepted（2026-10-05；负责人回复“批准”，批准[R7合同](plans/A9_31_R7_CONTROLLER_PARENT_KIND_REPAIR_APPROVAL.md)§1–5，原文SHA256 73646d58787a1fee7062a74bddfffb37114b1a7d4e816ed8cbb164d62ab5fa4e）。
- 背景：R6 EncodingSecurity遇conhost OpenQueryHandle 87缺口时，观察器记录完整，但控制器以`C:\Windows\System32\cmd.exe`比较持有树`Binding.Image`；该字段实际是NT设备路径（R6全部185个真实条目均如此），种类为空而未放行，`LIFECYCLE_OBSERVED_CHILD_NOT_PINNED`硬停并使入口HALTED。
- 决定：仅控制器`Resolve-ManifestObservation`：先取观察器ready记录的`c_device_mapping`（须匹配`^\\Device\\HarddiskVolume[0-9]+$`），父进程`Binding.Image`仅在与`<映射>\Windows\System32\cmd.exe`或`<映射>\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`大小写不敏感精确相等时才判为cmd/PowerShell，其余走原硬门；控制器新逻辑的检查夹具须取自真实证据格式，并增加真实缺口回放准入检查。
- 边界：不改产品/native/锁/capture、观察器源与proof判据、断言、真实对话框规则、SYNC、九字段请求；不放宽任何未知生命周期门；R4/R5/R6 HALTED入口与证据不改判；Win7实机未验证；不签DEVELOPER_VERIFIED/独立验收。

## ADR-0176 A9-31 原生退出对话框人工点击流程

- 状态：Accepted（2026-10-05；负责人回复“批准”，批准[R8合同r2](plans/A9_31_R8_EXIT_PHASES_AND_CLICK_PROTOCOL_APPROVAL.md)§1–5，原文SHA256 eb9b1c76e0b87fc8626ca14c8272ec6e7d2bce3ffa8e5a738586e45c8590e21b）。
- 背景：R7 StopExit三次均未通过：两次人工点击在对话框弹出后160.5/263.7秒才发生，超120秒限时判FAIL；第三次点击3.8秒返回`response=1`（要求0），`ACTUAL_NATIVE_EXIT_CHOICE`失败触发`SAFETY_DRIVER_HARD_GATE`，入口HALTED。对话框在控制器启动后约5.2秒弹出并保持打开，按钮为`[停止后退出] [留给系统后退出] [取消]`，`defaultId=0`、`cancelId=2`。
- 决定：不改任何代码或断言，把人工点击固化为流程：就位确认与提前量、每次只报一个目标按钮、“不确定就不点”、超时（FAIL、非HALT）可在同一入口重试且每个点击phase最多3次、点错按钮或Esc/取消按HALT处理且不重试；弹出→点击耗时与`response`一律由证据计算。
- 边界：不放宽对话框断言、不延长120秒限时、不降级错误选择、不伪造选择；不改产品/native/锁/capture、控制器/driver/观察器源；Win7实机未验证；不签DEVELOPER_VERIFIED/独立验收。

## ADR-0177 A9-31 R8独立复核缺口的候选外本地修复

- 状态：Accepted（2026-10-05；负责人在Codex独立复核四项发现后要求“帮我修复这个问题”，仅本地修复）。
- 背景：复核脚本会创建/删除临时文件；重启自检检查了命名辅助函数而实际post-final-event仍使用原名；新增点击脚本删除/覆盖旧输出且未登记；R8冻结状态残留R7标签。R8已冻结，不覆盖或重绑原输入和证据。
- 决定：在任务书登记的`r8-review-repair-r1`中形成修复版本。晚到日志实际创建点使用restartAware，离线检查执行提取的实际entry函数并保留原实现同名冲突反例；只读验证器不运行写盘自检、不把未执行项计为PASS。点击提前量固定45秒，输出独占创建，失败保留且不继续发布后续动作。冻结工具明确R8身份并拒绝已冻结根。
- 边界：本决策只覆盖候选外本地修复与检查，不改变ADR-0176的原执行输入/断言/120秒限时/重试与停止规则，不把新driver冒充R7仅换绑或继承原准入；不改产品/native/锁/capture/观察器/proof/九字段协议。无远端连接、普通入口、请求、删除或第九根授权；新执行版本仍须满足准确范围、准入和冻结合同。Win10/Win7/DEVELOPER_VERIFIED仍不签。

## ADR-0178 A9-31 R8采用复核修复版driver的新不可变revision

- 状态：Accepted（2026-10-05；负责人回复“批准”，批准[R8修订](plans/A9_31_R8_DRIVER_REVISION_AMENDMENT_APPROVAL.md)，原文SHA256 5a928e2a22e47ac3b822acd164633f5f84f1609265999d02d27c2f8f09f46e6f）。
- 背景：Codex开跑前复核发现driver实际创建`post-final-event-N.json`未用重启命名（崩溃实例与重启实例同名时重启实例会`EEXIST`），并经我独立核实成立；R8已冻结、入口未启动。master的`initial_driver_sha256`仅校验格式、不与revision driver比较，SYNC安全摘要新旧driver相同（=master的`driver_safety_sha256`），故可在不变master下新增不可变driver revision。
- 决定：仅新建一个`normal-short`新revision（修复版driver，SHA256 cbeea557…），StopExit/ReleaseExit/Recovery统一使用；旧四个revision保持已登记不变、不用于请求；新revision须在Win10锁定Electron-as-Node 16.17.1完成driver五项自检、绑定新revision夹具的schema检查及完整闭包stage后方可使用，失败不回退旧revision。点击脚本只允许normal-short，固定45秒、独占创建日志。
- 边界：不改master、观察器、控制脚本、根、输入、对话框断言、120秒限时、点击重试/停止规则、九字段请求；不改产品/native/锁/capture；Win7实机未验证；不签DEVELOPER_VERIFIED/独立验收；不创建第九根。

## ADR-0179 A9-31 R9：Recovery按“保留清理未知”修订driver预期并单独续验

- 状态：Accepted（2026-10-05；负责人回复“批准”，批准[R9合同r2](plans/A9_31_R9_RECOVERY_RETAINED_UNKNOWN_APPROVAL.md)原文SHA256 f6ed73d5dd269c9a03f6790bfca581ab994f43a58e42ba9cef35e04fa358abbe，及[R9修订](plans/A9_31_R9_ADMISSION_REVISIONS_AMENDMENT.md)原文SHA256 b29a0bff156d9bde13b679b8881408bee840b58962977eb94b4ed8c9229768ab）。
- 背景：R8 Recovery第13项`BACKGROUND_FACTS_ONLY`期望`exited`，产品重启后按设计保留`cleanup_required`；负责人裁决D1=C（[裁决材料r2](plans/A9_31_R8_RECOVERY_EXPECTATION_RULING.md)）：driver预期有误，产品处置出口另由A9-34处理。
- 决定：driver以复核修复版cbeea557…为基础，只改重启分支断言（保留未知、OS层已退出、Stop被拒、切换与正常关闭被阻断）、重启实例以`app.exit(0)`结束并写`normal_product_exit=BLOCKED_BY_DESIGN_NOT_PERFORMED`、重启实例失败直接`app.exit(1)`，并新增离线自检；四个revision按R8机械变换派生，仅`normal-short`用于请求；新根R9只跑Recovery一个请求，失败不重试。既有重启证据自检中锚定重启分支文本的一处字符串随分支改写同步更新，输出不变。
- 边界：不改产品/native/锁/capture、控制器逻辑、观察器源；不放宽其他断言或生命周期门；R9 Recovery PASS不表示崩溃后产品可正常关闭；不预授权第十根；Win7实机未验证；不签DEVELOPER_VERIFIED/独立验收。

## ADR-0180 A9-31 整批Win10跨根证据：先补正式评审再组合

- 状态：Accepted（2026-10-05；负责人回复“批准”，批准[跨根组合裁决材料r2](plans/A9_31_WIN10_BATCH_CROSS_ROOT_RULING.md)原文SHA256 6847b87ea6b6b6ce08bed205957fb0d8e6d58ce2f1db14b8ca530d33884c614e，D1=A9-34推迟到第二批之后，D2=B，D3/D4按该稿§9）。
- 背景：八个Win10 phase分布在R5–R9通过；被测产品输入各根完全相同，测试工具差异只落在重启、观察器读检查与conhost proof路径；R5–R7的PASS phase缺正式评审结论文件。
- 决定：在R5–R7各自目录，以该根原样评审脚本和按规则选定的入口身份记录，对已回收证据补跑正式评审（只新增文件、不改既有文件、无远端动作）；全部通过时组合结论记为`WIN10_CROSS_ROOT_COMBINED_PASS_WITH_LIMITS`并逐条附限制；任一不通过则该phase记NOT_PASS另报。
- 边界：不是DEVELOPER_VERIFIED、独立验收或Win7结论；不改判任何HALTED；A9-34推迟意味着A9-33须列“后台进程运行中崩溃后对话与正常退出被永久阻断”为已知限制；Win7实机未验证。

## ADR-0181 A9-31 Shell Policy：引号与控制流歧义的保守求值（ADR-0171补充）

- 状态：Accepted（2026-10-05；负责人回复“批准”，批准[P1修复材料](plans/A9_31_POLICY_P1_REPAIR_APPROVAL.md)原文SHA256 e0dc01e23289d3f536f5d148376518002949be42a2a8ad4d2e8de9ae5408e9ae，含D1–D3）。
- 背景：Codex独立复核发现两项P1并经我方复现：PowerShell/cmd中把`\"`当转义致后续发布/系统/删除命令被当作输出数据放行；未执行分支内的字面赋值被当作确定值致变量调用的发布命令放行。
- 决定：PowerShell/cmd段切分不再把`\`当引号转义；命令含“反斜杠紧接双引号”时按转义与不转义两种解释求值，任一得出高影响即取之。嵌套块/控制流内的字面赋值作为候选值追加，任一候选解析出高影响即取之。接受由此产生的少量误确认（如`bash -c`载荷中的合法`\"`）。
- 边界：只改`src/core/src/policy.ts`及其测试；不改审批摘要/digest、Read Only、其他工具或非Policy路径；不扩展为任意脚本求值；提交、新包、Win10/Win7另行批准；Win7实机未验证。

## ADR-0182 A9-31 Shell Policy：进入当前作用域的赋值效果只追加候选（ADR-0181补充）

- 状态：Accepted（2026-10-05；负责人回复“批准”，批准[P1修复修订r2](plans/A9_31_POLICY_P1_REPAIR_R2_AMENDMENT.md)原文SHA256 9359f34478ed17c3ff7186038b2a220075652829d20993ed4f589000371bbec8）。
- 背景：Codex聚焦复核发现ADR-0181实现丢弃条件块内的非字面赋值（引入回归），且cmd无括号`if … set`、双引号`$()`与点调用带回当前作用域的赋值未计入。
- 决定：条件段非字面赋值追加“未知”候选（解析时还原为原变量记号，走修复前保守检查）；`if`/`do`/`else`载荷与双引号`$()`中的赋值求值后作为条件候选并入当前变量表；点调用段把本命令中出现过的块内赋值重新并入。均只追加、不移除候选；不求解任意表达式。
- 边界：只改`src/core/src/policy.ts`及其测试；提交、新包、Win10/Win7另行批准；Win7实机未验证。

## ADR-0183 A9-31 Shell Policy：变量调用遇控制结构一律保守确认（替换ADR-0181的F2与ADR-0182）

- 状态：Accepted（2026-10-05；负责人回复“批准”，批准[P1修复修订r3](plans/A9_31_POLICY_P1_REPAIR_R3_AMENDMENT.md)原文SHA256 207617b72fa11333320d2b0edb1957237221712bd6198e56175e46cc24bf32f3）。ADR-0181的F2部分与ADR-0182的G1–G4由本条替换，二者原文保留不改；ADR-0181的F1继续有效。
- 背景：逐项追踪赋值候选的两轮实现各自引入HEAD ASK→ALLOW回归，组合场景不收敛。
- 决定：在HEAD `ebda911`的Shell Policy上只做两处只增不减的改动：F1（原转义读法原样保留，含`\"`时另加不转义读法）；R（以变量作为命令名的段，若该层文本含控制结构且出现高影响词，即按无法完整分析的潜在高影响Shell确认）。由构造保证HEAD为ASK的输入新版必为ASK；接受由此产生的误确认。
- 边界：只改`src/core/src/policy.ts`及其测试；提交、新包、Win10/Win7另行批准；Win7实机未验证。

## ADR-0184 A9-31 Shell Policy：R判定条件修订与P1修复收敛标准（ADR-0183补充）

- 状态：Accepted（2026-10-05；负责人回复“批准，采用收敛标准”，批准[P1修复修订r4](plans/A9_31_POLICY_P1_REPAIR_R4_AMENDMENT.md)原文SHA256 9e9b58108e034c74804ca46fd343a16de37946520472be4c002e8a1230cea15c）。ADR-0183原文不改。
- 背景：Codex第四轮确认r3对HEAD不放宽，但R漏掉多种变量调用形式、递归时丢失外层上下文（HEAD同样漏报），并对条件变量、`${}`、单引号数据与注释产生误确认。
- 决定：R的变量记号判定去除cmd `@`与转义、接受任意`$`/`%…%`/`!…!`记号（排除`$true`/`$false`/`$null`）并文本检查`& ${…}`；PowerShell仅`&`引出或带参数时视为调用；控制结构与高影响词随递归向内传递（宿主自身名称不计）；控制结构在去掉`${}`、单引号字符串、注释后的文本上判定。仍只增加确认。
- 收敛标准：阻断＝HEAD为ASK而修复版非ASK、已报告反例未修复、修复引入的明显影响普通开发命令的误确认；HEAD与修复版均放行且不属已报告类别的新写法登记为已知限制并转后续任务。
- 边界：只改`src/core/src/policy.ts`及其测试；提交、新包、Win10/Win7另行批准；Win7实机未验证。

## ADR-0185 A9-31 Shell Policy：r4独立复核四项P1的有限修复（ADR-0184补充）

- 状态：Accepted（2026-10-05；负责人明确要求建立6.1sol xhigh修复对话，修复四项P1后交原对话独立只读复核；本对话受领相同三文件与本地验证范围）。ADR-0183/0184原文保留。
- 背景：r4将条件/循环/赋值表达式误认作变量调用，原文调用正则扫描数据，漏掉点调用及括号包裹的花括号变量；四层EncodedCommand进入子表达式时深度守卫丢失外层风险。
- 决定：R单独使用尊重字符串/注释、保留任意花括号变量的增量分段读法；区分表达式操作符与调用参数，识别`&`/`.`及其括号操作数。在原深度守卫前应用继承上下文的R判定，递归/解码上限保持不变。HEAD求值段切分、赋值记录、变量解析及原深度守卫保持原读法；不恢复候选值追踪。
- 验证：先保存r4失败和红测试；复用两组5,122/13,878构造、32原反例及1–4层编码的两入口模拟；检查普通开发ALLOW、回退变红和任务§5必需项。证据新增`policy-p1-repair-r5/`，不覆盖r1–r4。
- 边界：沿用ADR-0184收敛标准。仅三个源码/测试文件及原报告/必要治理记录；无子代理、网络、远端、危险命令执行、提交、打包或发布；Windows/Win10/Win7仍NOT_PERFORMED。

## ADR-0186 A9-31 r4开发包与Win10单根全量重验

- 状态：Accepted（2026-10-06；负责人回复“批准，D1同意，D2选B，D3重跑”，批准[r4包与Win10重验材料](plans/A9_31_PRODUCT_R4_PACKAGE_WIN10_APPROVAL.md)原文SHA256 f784fa4a226ccc8393a71a94f481e59fc2a86349b2114308730996ed27dd06a8）。
- 背景：源码由`ebda911`提交为`8d207ab`（Shell Policy P1修复），既有Win10证据绑定旧包，对新源码失去直接绑定。
- 决定：由`8d207ab`干净检出、以与r3相同的生产者/锁/离线输入装配r4包；新远端根`A9-A31-Product-R4-20261006-R1`使用R9现行测试工具，仅换根、批准、source、包哈希与观察器重编绑定（反向换绑须与R9逐字相同），另加在Win10 Node16上加载新包Policy模块的准入检查；一个入口跑全部10个phase请求（含Boot），全部正式评审PASS记为单根通过。D2：普通phase非HALT的FAIL可在同一入口重试至多1次；点击phase沿用ADR-0176；HALT即停。
- 边界：不改产品/native/锁/capture、driver与控制器功能逻辑、判据、限时；不推送/合并/发布；不委派；不预授权新根之外的根；Win7、独立验收、DEVELOPER_VERIFIED不在内。Win7实机未验证。

## ADR-0187 A9-31 r4 Win10重验：新根R2同源重编取证组件并换绑其构建批准（ADR-0186补充）

- 状态：Accepted（2026-10-06；负责人回复“批准，D1用R2，D2同意”，批准[取证组件重编修订](plans/A9_31_PRODUCT_R4_CAPTURE_REBUILD_AMENDMENT.md)原文SHA256 da7c6341bbd11878a0e625aa195ada1fc57c822fa9eb16c6a9942ddbb59d4f33）。ADR-0186原文不改。
- 背景：R1根准入因取证组件构建记录绑定`ebda911`且控制器写死r3构建批准（`37cd8d4b…`/ADR-0168/`dd64e5bf…`）而停止；改写来源不可接受。
- 决定：新根`A9-A31-Product-R4-20261006-R2`；以`stage -PrepareCapture`用同一C#源/编译器/参考程序集重编取证组件并绑定`8d207ab`；R2批准记录采用r3八字段格式（合同=本修订SHA，decision=ADR-0187）兼作构建批准；换绑表增加r3取证构建批准常量与旧组件绑定；准入在R2全部重做。R1保留不删、不复用其检查。
- 边界：不改产品/native/锁、取证源与判据、控制器/driver功能逻辑；Win7实机未验证。

## ADR-0188 A9-31 登记 `A9_31_DEVELOPER_VERIFIED`（带已知限制）

- 状态：Accepted（2026-10-06；负责人回复“批准，D1选B，D2同意”，批准[登记材料](plans/A9_31_DEVELOPER_VERIFIED_REGISTRATION.md)原文SHA256 166ee45d9742a48ab77e06a9655db9a0ccad689d018457df8a5fbe2c815d5d39；按D1=B，Codex对[R2证据聚焦复核请求](reports/2026-10/a9_31_developer_verified_r2_evidence_review_request_2026-10-06.md)（SHA256 bd3fbacc…）只读复核P0/P1/P2=0/0/0，建议登记）。
- 依据：裁决r2（ADR未另编号的D1=B/D2/D3）链完成——G1 Codex首轮P1经Policy r1–r6按ADR-0184收口；G2 r6全量绑定`8d207ab`源码树；r4包Win10 R2 `WIN10_SINGLE_ROOT_PASS`（ADR-0186/0187）；managed native独立复核0/0/0。Codex另以按键/文本位置还原补足master、四revision与准入输入的反向换绑证明（原生成过程仅正向）。
- 决定：A9-31阶段门登记为`A9_31_DEVELOPER_VERIFIED`，源码为本地提交`8d207ab`（未推送）。
- 已知限制：G3重启后`cleanup_required`无产品内处置（A9-34推迟，A9-33须列明）；G4 Esc/取消未实测；Shell Policy静态识别边界（ADR-0184）；conhost证明仅解除“普通环境未真实触发cmd父分支”一项，不扩大到PowerShell父分支、重复可靠性、原生QueryHandle成功或Win7，原查询`UNKNOWN`保留。
- 边界：不签发独立验收、Win7（`Win7-Validation`保持`NOT_PERFORMED`）、Alpha2/RC、推送/合并/发布或A9-32/33/34任何状态；未在Win7实机验证。

## ADR-0189 A9-32 继续前观察缺失路径、目录与路径身份（ADR-0152补充）

- 状态：Accepted（2026-10-11；负责人在本聊天明确要求修复 F1～F3，并追加此观察规则决定）。本批准只绑定本轮隔离树修复。A9-32 §6 的原始授权来源待负责人确认，不据此扩大原批准。
- 决定：`read` 的 ENOENT 可以确认精确路径不存在。Core 再核验工作区真实边界与当前不存在事实。精确目录的成功 `list` 可以确认目录当前可读；父目录或其他目录不能代替。Workspace 的扫描错误可能被吞掉，Core 额外要求该目录 `readdir` 成功。
- 安全：只有持久化 `tool_end` 成功后才消除对应观察门。权限、越界、取消、超时、其他读取错误、残留和审计失败仍阻断。异常入口清零观察标记。失效或不可核验的软链接不按不存在处理。后续副作用仍经原 Policy 与新目标绑定审批。
- 路径：仅内存比较使用工作区相对键。对应平台 path API 接受工作区内绝对路径，折叠点段并保留越界拒绝。win32 统一分隔符并默认折叠大小写；POSIX 保留字面反斜杠和大小写。`recoveryPathPlatform` 与 `recoveryPathCaseInsensitive` 可注入，默认继承宿主平台；支持的 Win7 NTFS 宿主因此默认不区分大小写。不改变持久化路径、schema 或 recoveryRevision 哈希输入。
- 原目标：继续生成提示只进入 `turn_started` 审计，不新增 `conversation.request`。普通/分页投影过滤既存继续请求。继续 checkpoint 使用原目标；原请求被清理后恢复返回 `A9_RECOVERY_GOAL_UNAVAILABLE`，不从继续提示或 checkpoint 推导新原目标。
- 编号：0189 是此隔离树的下一个空号。主工作区治理编号已漂移，存在整合编号冲突风险；整合前核号并按裁决处理。此次不改主工作区或 ADR-0152 既有正文。
- 证据：基线 `571ec550…` 加本轮未提交差异。开发机 State 84、Core 212、Shell 133 项 PASS。8 个反例均为断言失败，逐项绑定与恢复 SHA 见 `.acceptance/a9-32-developer/mutation-results-r4.json`。win32 路径用例是开发机模拟，Win7 实机 NOT_PERFORMED。真实 Electron、打包、远端和阶段签发不在本轮范围。

## ADR-0190 面向负责人的输出规范、术语表与 HTML 解说边界

- 状态：Accepted（2026-10-06，负责人回复“按你的建议裁决，四层都做”）
- 背景：负责人的主要工作已转为审阅和裁决，但 DECISIONS 约 2,500 行、STATUS_LOG 约 1,300 行，
  STATUS 单页出现约 20 种状态词，仓库没有术语表。负责人要求借鉴“受控语言写作、图解、HTML 页面”的方法提高可读性。
  AGENTS.md §7 规定普通修改不自动做 HTML 渲染，与“输出 HTML 便于理解”存在字面冲突，需要裁决。
- 决策：（1）新增 [输出规范](OUTPUT_STYLE.md)：受控中文规则 W01～W12、图解适用场景、HTML 演示与解说材料的标注和存放；
  只约束写给人读的输出，不改机器读取格式、历史文档或 Accepted ADR 正文。
  （2）新增 [术语表](GLOSSARY.md)，统一证据层级、单项结果、任务书/ADR 状态与流程名词；只描述既有语义，不新增或改写状态值。
  （3）裁决冲突：生成 HTML 或图解文件不等于启动浏览器或渲染；AGENTS.md §6、§7 的渲染限制保持不变。
  解说材料默认写入被忽略的 `outputs/`，标注“非事实来源，非验收证据”，与 Markdown 不一致时以 Markdown 为准。
  （4）AGENTS.md 只增加指针和上述边界；Claude 专用的按需生成方式放在本机 skill 与 memory，不入库。解说视频暂不采用。
- 后果：不改变任何任务授权、C14 白名单、验收判据、候选或证据结论；不要求回改历史文档。
  ADR-0153～0189 已用于并行工作树，本分支使用 0190 避免编号冲突，不因此导入或裁决那些工作项。

## ADR-0191 输出规则自动加载与新报告模糊词检查（ADR-0190 补充）

- 状态：Accepted（2026-10-06，负责人回复“全部都做”）
- 背景：ADR-0190 只在 AGENTS.md 放了指针，W01～W12 正文不在任何自动加载位置；模型不主动读取 OUTPUT_STYLE.md 时规则不生效，也没有机器检查。
- 决策：（1）AGENTS.md §7 与 CLAUDE.md 各写入五条核心规则的压缩版（W01、W02、W04、W05、W06），完整规则仍以 [输出规范](OUTPUT_STYLE.md) 为准。
  （2）Claude 本机增加 output style，每轮注入受控中文规则；文件放在被忽略的 `.claude/`，不入库。
  （3）批准 [DOCS_05](tasks/DOCS_05_REPORT_VAGUE_WORDING_CHECK.md)：`check_docs.mjs` 对日期不早于 2026-10-06 的报告检查 W05 词表，
  跳过代码、引用行和中文引号内的原文引用。
- 后果：历史文档不检查、不回改。其他分支合入日期不早于 2026-10-06 的报告时，可能需要按 W05 修改措辞。
  词表只收复合词，漏检的模糊表达仍靠人工审阅。不改变任务授权、合同判据或证据结论。

## ADR-0192 文档检查完整性、任务实施入口分区与本地治理同步

- 状态：Accepted（2026-10-06，负责人直接要求先修检查器，再同步规则和生命周期，随后收敛审批材料，最后处理空间维护）
- 背景：检查器遗漏英文 Accepted ADR，且没有校验 ADR 索引。历史任务批准与当前任务混列；新治理规则只存在于一个工作区。
- 决策：[DOCS_06](tasks/DOCS_06_GOVERNANCE_CHECK_AND_LIFECYCLE.md)修复中英文 ADR 正文保护，校验索引的编号、标题与状态。未知状态返回失败。索引标题按正文对齐，不改写 Accepted 正文。
- C14 补充：只有任务索引“当前工作与待批准任务”分区内的任务，才可进入原有 Status、分支和白名单判定。“历史合同与保留事项”保留原批准和未关闭合同义务，不授权新实施；“已关闭任务”仅列 Status 为 COMPLETE 的任务。不通过分区把历史失败改为 PASS。
- 同步：四个本地活跃工作树分别登记本任务，定向同步既有 ADR-0169/0190/0191 规范与修复后的检查器。冻结、绑定和检查快照不改动。各工作树保留独立产品合同和已有修改；不把本地 dirty 写成提交、远端或候选状态。
- 执行记录：本轮及后续同范围迭代写入已有任务和[统一执行记录](plans/GOVERNANCE_OPTIMIZATION_EXECUTION_RECORD.md)。程序性记录不自动生成 ADR；接口、格式、兼容性、安全模型和 AGENTS 变更仍按原 ADR 规则。历史批准材料保留原路径及正文。
- 边界：不授权产品实现、远端写入、提交、推送、合并、发布或空间删除。空间维护先复用已有归档索引并形成逐项计划，具体删除仍须确认。结果只属于开发机治理，不改变任何 Win10/Win7 或候选结论。

## ADR-0193 候选外参数化报告校验试点格式

- 状态：Proposed（2026-10-07，本地试点；未接管正式候选）
- 背景：负责人要求按工程优化方案实施。历史报告器固定候选标识，复制派生容易残留旧绑定。
- 决策草案：按 [ENGINEERING_01](tasks/ENGINEERING_01_VERIFICATION_ENTRY_AND_REPORT_PILOT.md)实现候选外校验库。
  合同 `schema_version: 1` 包含候选标签、kit 标识、报告种类、要求的用例、完成结论和工具版本/哈希。
  必需用例、普通用户 Win7 环境、断言、附件哈希与秘密拒绝规则不得配置关闭。
  调用者必须先独立验证候选 ZIP、manifest、锁与 authority，并向校验器传入该身份。
  合同本身必须由调用者按批准哈希绑定，不从待验报告推导合同或身份。
- 试点边界：离线样本对照 W42 的通过/拒绝语义。新增拒绝重复合同项、未知字段、符号链接逃逸。
  不修改历史 W42 源码、候选或证据，不生成新的 Win7 PASS。正式接入须在新候选任务中裁决本草案。
- 工程摘要：统一检查入口输出 `schema_version: 1`、环境、组选取、组状态、命令数及耗时。
  这是开发机运行摘要，不是正式产品验收报告。全部要求组成功才返回成功。

## ADR-0194 Win10 验证工具的分层输入与产品取证双身份

- 状态：Accepted（2026-10-07；负责人明确批准ENGINEERING_02 §3–7与本ADR，仅限本地实现和定向检查）
- 问题：旧派生可能复制历史PID、creation ticks、receipt及run。旧capture和observer消费者将产品source与组件来源合成一个字段。
  产品更新因此要求换构建批准或重编组件。改写旧build来源不可接受。
- 范围：仅[ENGINEERING_02](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md)的候选外工具。
  首个消费者是不变r4开发包；不改产品、helper、原生锁或历史工具。

### 输入格式草案

新绑定为schema_version 2。静态与运行输入分别严格校验。
原build、批准、pin及九字段请求保持原schema和原字节含义。
旧校验器不接新格式，新校验器不隐式接受未知格式。

| 分层 | 字段及约束 |
|---|---|
| product_identity | 准确source、ZIP/manifest/锁/helper、size、运行版本及实际加载；直接复算 |
| tool_identity | 新版本、准确源码快照清单及SHA；HEAD只定位仓库 |
| components | 每组件ID、source_snapshot、artifact SHA/size/MVID、真实build/批准SHA、compiler/refs/arguments、API/Profile、legacy_source_binding |
| deployment | 当前准确根及部署映射；历史build中的目录保持原值 |
| policy | 固定phase、预算、时钟与安全判据；不能关闭硬门 |
| runtime | 当前fresh run/request、PID+creation ticks、用户/Session/提升/Job、master/revision、当前回执及SHA；逐请求独占创建 |

大整数用十进制字符串跨JS/PS。静态模板不含旧运行事实。
sync-current以本根sync-actual生成；manifest五参数从本轮pin/admission取得。
Base64载荷与脚本定义须解码核对；派发前再次确认文件和实例绑定。
组件build.source保留原值，不重写为新产品source。
组件未在某Git提交内时以真实源码快照证明来源，不伪造提交归属。

### 消费者与完整性门

- stage核验产品闭包与组件构建闭包，再核验本轮批准允许的组合。
- serve的Capture-Build/BuildApproval分别检查原组件来源/批准及本轮关联批准。
  compiler/三引用/参数、源码、artifact、MVID、API/clock及build SHA继续核验。
- observer launcher核验组件pin/build与本轮部署；ready/final.source核对原组件legacy绑定。
  产品source由新运行核验，request/master/revision、当前父实例和proof闭包不能缺失。
- driver的request.source保持为产品source；SYNC及原生回执绑定当前请求、父实例和工具版本。
- input-binding在冻结与派发前检查准确必需结果集合，不以状态含PASS或顶层exit0放行。

双身份不等于只删除source比较，不允许任意产品配任意组件。
复用须满足字节、依赖/参数/配置、相关上下游及新合同适用性。
构建证据继承单列INHERITED_EVIDENCE；新运行准入和产品执行取得直接证据。
离线不同source正例不计实际跨产品兼容PASS。

### 真实入口与停止规则

Renderer执行最终序列化字符串。重启执行真实journal/final/截图/晚到事件创建点。
NT路径、短命实例与时钟边界保持原判据，不扩大其他卷或其他进程放行。
退出只接受原生showMessageBox实际response：StopExit=0、ReleaseExit=1。
语义提供者未验证或未授权时拒绝点击，120秒、错选/取消HALTED和晚到观察语义保持。
新增UIA/API、C#源或外部工具先取得C15/C16及准确范围批准。

身份、完整性、安全、必需审计、生命周期未知或丢事件失败立即停止下游。
不热替换冻结组件，不恢复旧HALTED，不改旧FAIL/UNKNOWN。
历史Accepted ADR正文保留，本草案不对旧运行追溯生效。
旧同source合同与新格式的差异由新任务批准，不绕过旧files-scope门。

### 当前状态与授权

本轮只完成开发机文档。原observer EXE字节本地未取得，部署BLOCKED。
实际Win10运行时、编译、UI、普通产品与Win7均NOT_PERFORMED。
负责人批准ENGINEERING_02本地范围后方可登记Accepted并进入C14实现。
远端、GUI、组件编译、Git交付与合并不包含在该本地批准中。


2026-10-07：负责人已准确批准本ADR及ENGINEERING_02本地范围。批准前正文与两个SHA已核对。
当前只进入本地实施，不授予远端、GUI、组件编译或Git交付。此前准备状态作为历史记录保留。

## ADR-0195 Win10 真实新构建与当前桌面执行绑定

- 状态：Accepted（2026-10-07；负责人批准ENGINEERING_02 §15及本ADR；原批准前材料保留）
- 范围：[ENGINEERING_02 §15](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#15-新构建与当前桌面绑定的待裁决材料)。只改原九件工具/测试路径，不改产品、C#、API、依赖或历史记录。
- 问题：Win10独立编译已产生真实新EXE，SHA 3ae30252…、MVID 77def7b9…。
  新build关联真实scope_sha256，旧消费者要求旧pin_sha256及旧EXE身份。
  当前只找到管理员Session1桌面。历史Session3不能充当当前普通桌面事实。
- 原批准：ENGINEERING_02本地范围及ADR-0194已批准。
  负责人随后批准同目标独立编译、工具准入及不变r4验证。
  本草案保留该授权，不把组件编译scope当作产品执行批准。

### 拟议格式

新增严格schema3执行绑定；schema2保持本地回放用途。
顶层字段及runtime字段以任务§15.2为精确范围。
历史master/build/pin/批准原字节放入historical_reference。
当前observer单独绑定真实源码、build、scope、入口、EXE/MVID、compiler、依赖及参数。
当前消费者不把scope改名为旧pin，不改历史build的来源、目录或SHA。
capture原DLL/build/批准可按精确字节保留，构建证据单列INHERITED_EVIDENCE。
它的当前实际加载、身份及访问证据须直接取得。

implementation_approval保留原本地批准。
execution_scope另绑定当前机器、新根、产品、组件、工具闭包、角色与预算。
本轮批准关联可引用任务§12的真实负责人回复，不生成不存在的批准。
schema3的registration/checks及消费者投影不得冒用旧OWNER_APPROVED状态。
准确必需结果集合、文件SHA/size与实际identity全部核验后才派发。
只读诊断、38项CLR自检和12组定向检查不构成完整ETW或产品PASS。

### 当前桌面与硬门

普通身份继续固定为SID尾1005、Medium、非提升、Ordinary=true、InJob=false。
普通Session必须由该账户的真实桌面实测取得，并逐run固定。
dispatcher、worker、产品、observer请求的目标Session及SYNC回执须一致。
Session缺失、变化、错父实例、管理员身份或InJob=true均拒绝。
管理员Session0只用于锁定取证准入，不能代替普通产品。
普通桌面未满足时，负责人先登录原普通账户；执行代理不改账户或系统权限。

新接口、记录字段和Session绑定规则在本ADR Accepted前不得实施。
原ADR-0194正文保留；本ADR不追溯改变其本地检查或历史结果。
NT设备路径、短命进程、时钟边界、事件丢失、response及收尾判据保持。
语义提供者未获准时不点击真实退出窗口。
现有同目标运行意图不扩展为新API、服务、许可、账户或网络配置授权。

### 远端边界与验收

只在任务§12的R2根使用准确新版本和当前run。
原工具根、候选、首失败、HALTED/UNKNOWN保持只读。
不重试已被自动审批拒绝的完整历史绑定上传。
新运行绑定只包含获裁决且消费者必需的合同字段与明确组件记录。
工具审批独立生效；不能靠减少字段或更换命令绕过具体拒绝。
先完成真实中央CLI、全部消费者及自有ETW准入。
再核验跨账户访问和普通dispatcher，进入最短产品链路与受影响回归。
新增拒绝反例及准确停止/回滚条件见任务§15.3。
Win7、合并、提交、推送、发布、删除和系统权限动作不因本草案获批。

## ADR-0196 Win10 取证组件的进程代次与明确非父子关系

- 状态：Accepted（2026-10-07；仅12路径本地实现和定向检查，远端未批准）
- 范围：[ENGINEERING_02 §19](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#19-pid复用问题的待批准修复计划)。拟保留九路径，另增两件C#源码及独立构建入口，共12路径。
- 证据：R2七项工具准入和Boot直接检查PASS；短Background run f49752aa…触发生命周期硬门。
  capture看到SogouCloud.exe早于当前固定父实例约200秒；旧父身份UNKNOWN。
  observer另报DUPLICATE_START_PID，未持久化的拒绝事件身份UNKNOWN。
- 差异：ADR-0195仅允许九路径、原C#及R2根。本提案需要改取证组件判据、组件字节和新根。
  当前批准不覆盖这些动作，Accepted ADR正文保持。

### 拟议决定

capture在真实保留句柄、两次快照和两次身份查询一致时，单独记录明确非父子关系。
排除只依据子创建早于已固定父实例，不能按程序名忽略、猜测旧父或操作外部进程。
准确新记录字段及反例见任务§19.2；它不证明外部进程退出。
缺身份、查询失败、时钟未知和真实子生命周期未知仍HALTED。

observer以PID＋创建FILETIME区分代次。
开始、结束、父子关联、conhost证明和终态按同一实例核验。
合法新代次不能借用旧证明；真正重复、错误代次、模糊父代次和丢事件仍拒绝。
不补造本轮未写入的历史事件，不把NOT_PROVEN改成PASS。

两组件从原准确源码开始，用原锁定CLR4编译器及引用独立构建。
新build关联真实source/build/scope/artifact/MVID，不伪造旧来源或复用旧准入。
组件仅用于Win10取证，不纳入Win7产品包，不新增API、依赖或系统权限。

### 实施与远端边界

任务§19是准确待批准计划，未扩大当前白名单。
建议先批准12路径本地修复和定向检查。
远端仍待准确新文件/SHA清单形成后另行批准。
拟用R3新根，当前未创建、写入或批准；R2及旧根保留只读。
不变r4先走Boot和短Background，再进入受影响矩阵。
身份、完整性、审计、丢事件、归属未知立即停止下游。
单实例强制退出只作收尾恢复，不构成产品正常退出或修复PASS。
本提案不批准真实语义点击、Win7、Git交付、合并、发布或删除。

### 本地批准记录

2026-10-07，负责人回复“批准，并继续A＋r4，先修取证组件”。
批准范围为ENGINEERING_02 §19的12路径本地实现与定向检查。
远端仍待准确文件/SHA清单及另行批准；本次不批准R3连接、写入、编译或运行。
§19保留原方案，实际执行在同任务§20登记。

## ADR-0197 Win10报告字段比较与构建验证器身份分离

- 状态：Accepted（2026-10-07；负责人回复“批准”；仅本地报告绑定修复）
- 范围：[ENGINEERING_02 §22](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#22-报告比较与构建验证器身份修复2026-10-07)。
- 依据：R3两组件真实编译、自检和14件回收文件的size/SHA为PASS。
  原绑定器按对象字段顺序误拒四件编译输出。
  原build scope准确绑定原验证器990f1331…，不能改签为新工具。

### 决定

file、size、sha256记录按字段值核验，忽略JSON对象成员顺序。
字段集、类型、精确size和SHA、重复键及原始字节门保持。
不改变数组顺序、签名记录字节、canonical输入或其他合同的比较方式。

修复后运行工具使用engineering-02-v4。
组件在新绑定中增加版本化build_provenance，标为INHERITED_EVIDENCE。
该字段包含原构建验证器的准确file、size、SHA及原始字节。
仅允许本轮两份不可变R3 build及scope的精确SHA。
原验证器只校验字节，不执行或冒充当前运行工具。
原C#、生产者、编译器、参数、依赖、工件及MVID须继续匹配。
任何差异停止继承，不能补造、重排或改写原始build。

新运行工具的文件闭包和SHA独立绑定。
原build scope的validator继续指向原构建验证器，不指向新运行工具。
旧v3绑定仍按旧合同核验；不能给它添加v4继承字段。
继承只适用于组件构建证据，不继承R2工具准入或产品PASS。
产品r4身份保持；执行范围仍关闭，roles为空。

### 授权与验证

本地只改既有12路径中的绑定器、两件PS消费者及两份既有测试。
不修改两件C#、构建生产者、产品、helper或退出脚本。
用本轮原始报告验证成功，保留原拒绝反例和损坏输入反例。
本地结果不构成PS5.1、Node16或当前Win10工具准入PASS。
本次不连接远端，不重编，不替换R3冻结输入。
新远端动作须先形成准确载荷和实际准入范围。
不恢复R2 HALTED，不提交、推送、合并、发布、删除或改系统权限。

## ADR-0198 Win10取证实际能力准入与产品执行权限分离

- 状态：Accepted（2026-10-07；负责人回复“批准”；仅七路径本地实现与定向检查）
- 范围：[ENGINEERING_02 §24](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#24-当前取证工具实际能力准入计划2026-10-07)。
- 依据：当前v4的Win10解析和只读CLI PASS；实际能力准入仍NOT_PERFORMED。

### 问题

R3取证版本的中央门固定拒绝实际执行，roles为空。
现有observer入口共用管理员角色，不能据此只开放Admit。
serve的LibraryOnly跳过执行门，不能借此证明新组件已获运行批准。
旧capture-probe字段只检查身份和快照数量，不能证明新排除和时钟合同。
当前构建证据绑定R3，运行迁移不能改签旧scope或伪造新构建。

### 拟定决定

新增engineering-02-v5-admission，只开放取证能力准入的准确角色/操作。
管理员角色只允许固定查询、自有observer Admit及四件canary操作。
普通角色只允许受控自身子进程查询与四件canary操作。
ORDINARY_PRODUCT、产品request、Boot及后台派发继续拒绝。
observer在新上下文中只允许Admit；Build、Run、Stop拒绝。
新LibraryOnly上下文也须先过中央角色/操作门。
旧v2/v3/v4输入、执行语义和字节不由本决定改签。

新执行根为A9-Engineering-Win10-Entry-20261007-R4。
它是运行目录，不是新产品构建编号。
原native构建根、报告、validator、参数和工件仍绑定R3原始字节。
继承仍按ADR-0197准确build/scope及组件条件核验。
新运行工具、根、scope、run及能力回执分别绑定，不重新构建未变C#。
新版本准确字段集版本化；未知、重复、缺失和旧回执拒绝。
原七项ADMISSION_CASES不减少，部分能力回执不冒充admission.json全PASS。

实际调用保留serve的查询、排除、身份与输出链。
observer保留真实ETW、代次日志、conhost证明、丢事件与自身会话收尾。
历史失败回放先做；构造记录只能是SURROGATE。
真实PID、原生creation ticks、当前token和回执来自本run。
普通桌面探针由a9builder一次固定启动，不借管理员或计划任务替代。
管理员与普通证据分别记录，组件准入不替代产品或Win7。

### 范围、批准与停止

准确本地范围只限任务§24.2七路径。
不改C#、构建生产者、产品driver、stage、产品launcher或退出脚本。
不新增API、依赖、安装、服务、账户或权限。
本提案及准备批准均不属于实现批准。
本地实现通过后才形成准确size/SHA及远端动作材料。
远端执行须绑定那些实际文件、目标、实例、会话和收尾预算。
不提前批准抽象ETW运行、产品执行或未来任意字节。

一次初始能力批次后，仅普通夹具/编排允许一次有界同范围修复重试。
须先证明旧run结束，生成新不可变工具输入/run并核验准确哈希。
身份、完整性、审计或未知生命周期立即停止全部依赖动作。
停止后保留证据，不删除新根，不恢复R2 HALTED或改判旧FAIL/UNKNOWN。
产品进入范围、Win7、Git交付、合并、发布和删除均需其适用授权。

### 准确本地批准记录

2026-10-07，负责人回复“批准”。
批准ENGINEERING_02 §24.2–24.5七路径本地实现与定向检查。
不批准Win10连接、上传、ETW、产品、Win7或其他远端运行。
本次批准不改签既有构建或执行输入，也不扩大七路径。
实际执行登记在同任务§25；原准备计划保持历史状态。

## ADR-0199 Win10取证最小诊断后的单次恢复

- 状态：Accepted（2026-10-08；负责人回复“批准”；仅准确材料的一次Win10能力恢复）
- 范围：[ENGINEERING_02 §28.4](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#284-待裁决的准确下一步)。
- 依据：Win10验收机当前d906de71…工具、a672ce19…闭合输入的五项只读检查PASS。

### 问题

ADR-0198的一次初始批次与一次修复重试均在完整性门FAIL。
原失败已保留，原实例已结束，整批停止。
消费者对新目录和新记录类型仍使用旧规则。
目录修复已越过原门，scope读取器已在真实PS5.1最小验证通过。
只读PASS不能授权超出原次数的实际能力批次。

### 提案

仅当负责人批准§28.4准确机器材料后，允许一次恢复。
固定目标为WIN-2JQ66JE4HTQ的原R4。
工具固定为d906de71…准确十一件闭包，不重新上传或修改。
准备输入a672ce19…保持闭合，不覆盖或重签。
真实批准后按原中央五字段转换生成新不可变输入和紧凑scope。
准确size/SHA登记后才外发两件派生输入，原构建身份保持。
仅派生execution_scope的批准状态、远端批准和既有两个取证角色。
其余字段及product_execution_authorized=false保持。

固定顺序为AdminQuery、Observer Admit、CanaryCreate、Ordinary和CanaryVerify。
每个Mode至多一次，前项PASS且实例结束后才进入下一项。
普通角色只能由当前a9builder的Explorer一次普通打开固定CMD进入。
仍使用实际PID、creation ticks、token、Session、fresh run和当前回执。
全部断言、原七项准入集合和15/8/45/30秒预算保持。
180秒控制器回收上限不改变阶段门。

本提案只增加这份准确材料绑定的一次恢复，不改写ADR-0198正文。
不自动授予同范围第二次重试或未来任意字节运行权限。
任何新身份、完整性、必需审计或未知生命周期失败立即停止下游。
先保存首失败，客户端超时记UNKNOWN，未知实例不自动强制结束。
回滚仅停止派发并保留全部新旧版本与证据。

### 未开放范围

本提案与本轮只读批准不属于新实现批准或当前远端执行批准。
不新增角色、系统API、依赖或原生构建。
不伪造R3构建来源，不弱化完整性门或减少准入集合。
部分能力PASS不构成完整admission.json、产品或Win7 PASS。
产品、重编、系统权限、ACL、账户、服务、计划任务、安装、Win7和Git交付均未开放。
旧R2/R3、首失败、HALTED与UNKNOWN不覆盖、不改判。


### 准确恢复批准记录

2026-10-08，负责人回复“批准”。
准确材料为ENGINEERING_02 §28.4的ec6fafdf…机器材料，18636字节。
批准一次固定Win10取证能力恢复，不扩大本地实现路径。
批准记录首次UTC观察为01:06:27，有效至03:06:27。
新不可变输入为3db7f49a…，紧凑scope为9b30fdc7…。
只外发两件派生输入，共255988字节，当前d906de71…工具保持。
每固定Mode至多一次，任何新失败停止依赖下游，不自动重试。
产品、Win7、系统变更、重编和Git交付均未批准。
实际执行沿用ENGINEERING_02 §29及原状态入口。

## ADR-0200 Win10普通取证入口的进程执行策略

- 状态：Accepted（2026-10-08；负责人回复“批准”；仅两路径本地修复与定向检查）
- 范围：[ENGINEERING_02 §30](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#30-普通取证入口过程策略修复计划2026-10-08)。
- 依据：Win10当前d906de71…工具与3db7f49a…输入的真实查询、ETW PASS，以及普通-File入口执行策略FAIL。

### 问题

管理员CurrentUser RemoteSigned没有覆盖普通a9builder账户。
普通固定CMD实际打开后在PowerShell脚本加载前被拒绝。
没有普通claim或回执，普通实际能力未执行。
原批准禁止系统条件修改且新失败停下游，不能直接改策略或重试。

### 提案

准确本地范围为原白名单中的forensic-admission.ps1和win10-entry.test.mjs。
固定普通探针命令显式使用-ExecutionPolicy RemoteSigned。
它只为此PowerShell进程声明条件，不持久写注册表。
执行前核验实际Process与有效策略，并在组件加载或claim前拒绝不匹配。
强制组策略不匹配时拒绝，不覆盖或绕过。
保留原参数及输入、工具、实例、Explorer、Session、Job、回执与收尾门。
不使用Bypass、Unrestricted、Set-ExecutionPolicy、Unblock-File或其他运行条件绕过。
不切账户、修改ACL、用户或机器策略、组策略、服务、计划任务、信任或安装。
原组件构建身份、C#、DLL/EXE与产品r4保持。

当前只申请上述两路径本地实现及定向检查。
本提案、计划和原白名单不属于这项新条件的实现批准。
不批准远端过程策略设置、外发新字节或重新打开CMD。
本地通过后才冻结新工具、新闭合输入并形成准确有界远端材料。
旧ADR-0199批次、旧CMD与失败证据不重启、不覆盖。
原查询与ETW证据仅在完整适用条件满足时标INHERITED_EVIDENCE。
不以工件哈希相同替代新工具入口准入，不减少原七项集合。
新失败停止依赖下游，回滚仅停止派发并保留全部版本和证据。
产品、Win7、系统变更与Git交付未开放。


### 准确本地批准记录

2026-10-08，负责人回复“批准”。
批准ENGINEERING_02 §30及准确材料b1adc696…，4383字节。
实施仅限forensic-admission.ps1和win10-entry.test.mjs两路径。
允许本地定向检查并准备后续准确远端材料。
不批准Win10连接、外发、Process策略执行、普通CMD重试或产品。
不修改账户、机器、注册表、组策略、权限、服务、计划任务或安装。
原ADR-0199已停止批次及旧失败保持，实际交付在原任务§31续记。

## ADR-0201 普通取证探针的捕获首失败诊断

- 状态：Accepted（2026-10-08；负责人回复“批准”；仅两路径本地诊断及定向检查）
- 范围：[ENGINEERING_02 §32.5](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#325-仅本地最小诊断提案待负责人裁决)。
- 依据：bea1ec92…工具、b36841e0…输入、Ordinary run 5f2d4797…的Win10直接FAIL。

### 问题

真实a9builder普通身份及Explorer链已通过入口门。
自己的测试子进程捕获断言产生LIFECYCLE_OWN_CHILD_CAPTURE。
原失败回执只保存错误及owned_lifecycle UNKNOWN。
它没有保存当时Added、Gaps、Excluded的数量和条目。
现在两件测试实例已结束，但不能补签失败瞬间的退出值或捕获结果。
新增延迟或重新打开原CMD不能解释这个失败。

### 提案

仅在forensic-admission.ps1及win10-entry.test.mjs实施本地诊断。
在真实Capture返回后、Accept-Capture及原断言之前保存一个候选外诊断文件。
格式为schema_version=1，status为OWN_CHILD_CAPTURE_DIAGNOSTIC_V1_NOT_ADMISSION。
诊断绑定当前输入SHA、工具digest、run、父子PID、creation ticks和Session。
记录实际Added、Gaps、Excluded数量及相关字段。
只复制固定字段，不序列化QueryProcess、句柄、凭据、环境或CommandLine。
每类最多128项，UTF-8无BOM，输出不超过262144字节，CreateNew写入。
超限或保存失败继续fail closed，不减少原断言。
保留实际Capture调用、原8秒子进程预算、身份、完整性、回执及原退出门。
不伪造缺少的原始快照，不把后续新观察冒充失败瞬间的数据。
原回执和首失败不改写，后续收尾观察另行记录。

定向测试覆盖零条、正确一条、错误PID、多条、gap及exclusion反例。
这些本地反例标SURROGATE，不计PS5.1或普通桌面能力PASS。
原C#、DLL/EXE、构建来源、MVID、中央绑定合同和r4产品不变。
不新增依赖、原生API、角色或完整准入PASS。

### 批准与恢复边界

当前仅申请上述两路径本地实现和定向检查。
本提案不授权实现、远端外发、普通入口重试或产品启动。
本地完成后冻结准确新字节，另行形成远端最小诊断材料。
负责人批准该材料、相关实例结束且准确输入适用后，才可进入新run。
旧输入、claim、CMD和批次不恢复，不延长原预算。
回滚为停止派发并保留全部新旧证据，不删除目录或改变系统权限。
产品、CanaryVerify、Win7、系统配置及Git交付保持原停止边界。

### 准确本地诊断批准记录

2026-10-08，负责人回复“批准”。
批准ENGINEERING_02 §32.5及准确材料f471f7b8…，3134字节。
原提案正文SHA为1cc9f631…，批准记录独立保存。
实施仅限forensic-admission.ps1和win10-entry.test.mjs。
允许本地定向检查、冻结新工具及闭合输入、准备准确远端诊断材料。
不批准Win10连接或外发、新普通入口、CanaryVerify、产品、原生重编或Git交付。
原普通FAIL、UNKNOWN和停止批次保持，实际交付在原任务§33续记。

## ADR-0202 普通取证的完整自有捕获集合合同

- 状态：Accepted（2026-10-07，负责人时区；负责人批准四路径本地修复和定向检查）
- 范围：[ENGINEERING_02 §35](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#35-普通捕获集合合同的本地修复提案2026-10-07待负责人裁决)。
- 依据：工具3731ea93…、输入317d1a04…、Ordinary run a6ac0a9c…的Win10直接诊断。

### 问题与真实反例

真实Capture返回两条已证明后代：自己PowerShell7752及其conhost26240。
两条Session均为2，NT设备卷一致，父子PID和creation ticks准确绑定。
Added=2、Gaps=0、Excluded=0、两个Ownership均PROVEN。
原生CaptureRows返回完整后代集合，原harness及中央消费者仅接受总数1。
因此当前错误是夹具/回执合同的单进程假设，原生缺陷尚无证据。
原普通FAIL和owned_lifecycle UNKNOWN保持，后来三个实例结束另行记录。
旧没有诊断的失败不补签成本次原因，不从部分捕获证明推导完整准入PASS。

### 拟议决定

仅申请任务§35列出的四件PS/CJS及检查源码本地实现。
根必须是准确自己启动的PowerShell一件，可选后代只允许其直接conhost零或一件。
完整集合逐件分类和证明，不丢条目、不改成Count>=1、不按名称宽泛放行。
其他条目、多根、重复代次、额外conhost、未知/错父实例或错Session/卷/路径全部拒绝。
根继续以原held句柄证明同实例，conhost绑定准确根PID/ticks及完整同卷NT路径。
两类均以原始Capture Ownership及实际句柄证明，原闭包与依赖哈希门保持。

ordinary-probe增加schema_version=1的capture_set完整集合证明。
显式记录原始总数、根数、conhost数、gap/exclusion数及全部逐实例字段。
child.capture_added保持真实总数，中央验证总数=准确根1+console0或1。
中央消费者核验全部实例、捕获/父子/时间证明、真实退出码/ticks及held_query_after_exit。
当前新合同拒绝旧无版本化capture_set形状，旧报告字节不迁移、不改签。
原外层source/pin/scope/tool/component/run、普通身份、Explorer、Job和canary门保持。
原断言前诊断CreateNew、固定字段与输出上限保持。

原8秒共同预算保持，分类通过才写release，按剩余预算证明根及全部conhost退出。
每件原held查询句柄保留到真实退出取证后关闭，所有异常路径保持清理。
未知、超时、非零退出、输出/关闭错误继续FAIL，不能延时、强杀或补PASS。
产品、C#、DLL/EXE、MVID、原构建验证器、依赖、API和系统权限不变。

### 授权、验收与回滚

本提案尚未批准，不修改Accepted ADR-0201，不授权实现或新Win10运行。
获准后先本地回放当前真实两条反例，再检查新生产合同和真实中央消费者。
覆盖数组倒序及逐实例/计数/时间/退出/身份/字节字段篡改拒绝。
回放明确SURROGATE，本地检查不代表Win10或Win7直接PASS。
本地完成后冻结无远端角色的新输入，再形成准确下一远端材料。
完整七项准入不减少，产品须后续单独准确授权并从最短真实链路进入。
新字节、合同冲突或硬门失败停止依赖动作，旧批次不恢复。
回滚为停止新派发、保护外来修改并按保存字节恢复本地源码，保留全部失败和版本。
不删除、不重编原生、不改系统配置，不提交、推送、合并或发布。

### 准确本地合同修复批准记录

负责人回复“批准四路径本地修复和定向检查”。
批准ENGINEERING_02 §35及5682字节准确材料628e4803…。
原提案SHA 4cda34d0…保持于独立批准记录，已签旧ADR正文不改写。
仅限本任务四件PS/CJS及检查源码、本地定向检查和新闭合输入准备。
不批准Win10连接、上传、新运行、原生重编、产品、Win7或Git交付。
当前停止批次、旧FAIL及UNKNOWN保持，实际结果沿用任务§36。

## ADR-0203 自有取证子进程的有界输出首失败诊断

- 状态：Accepted（2026-10-07，负责人时区）
- 背景：ENGINEERING_02 §37普通run已证明PowerShell/conhost全部零退出，但结果FAIL：OWN_CHILD_STDERR。回执未保存两流文本、长度或hash，具体内容UNKNOWN。当前803593bf…批次已按要求停止。
- 决策：提议仅按任务§38两路径本地范围，在现有自有子进程两流drain后、原输出断言前CreateNew保存schema1有界诊断。绑定当前输入、工具、组件、run、parent与child。明确为UTF8 StreamReader解码文本及其UTF-8重编码摘要，不能冒称原管道字节。
- 后果：诊断只用于定位，不构成普通能力PASS。原4096字符/流、8秒共同预算、非空stderr拒绝及全部held证明保持。产品、原生构建来源及中央回执合同不变。当前未批准、未实施，无远端或产品授权。

### 精确范围、验收与恢复

仅forensic-admission.ps1及win10-entry.test.mjs，准确当前SHA见任务§38材料。
固定文件child-stream-before-assert.json，schema_version=1。
状态OWN_CHILD_STREAM_DIAGNOSTIC_V1_NOT_ADMISSION。
每流最多4096个UTF-16 code unit，不拆代理对；总JSON上限262144字节。
记录保存文本长度、重编码字节数及SHA；截断时完整解码文本SHA为UNKNOWN。
不读取环境、凭据或其他进程输出；不改子fixture、参数、解码或drain。
诊断开销计入原8秒，保存后复核；progress/error非空仍拒绝。
本地反例明确SURROGATE，不能代签PS5.1或普通输出事实。
完成后另冻结无角色/无远端批准的新输入，再形成准确目标材料。
此次提案不授权连接、上传、目标新运行、原生重编、产品、Win7或系统/Git交付。
Accepted ADR-0202正文及全部旧FAIL/UNKNOWN/HALTED保持。
恢复须负责人批准准确材料与§38，源码/任务/分支门满足后实施。
回滚停止派发，保护外来修改后恢复本地保存源码，保留全部证据。

### 准确两路径本地批准记录

负责人回复“批准”，批准ENGINEERING_02 §38和4891字节准确材料d30bbbdc…。
原提案及准确源码已保存至resume-21/before-local-stream。
执行代理仅实施两路径输出诊断、定向检查和未来目标材料准备。
本次不连接Win10、不上传、不执行目标新run、原生重编、产品或Win7。
先前批次已停止，旧FAIL、UNKNOWN和HALTED保持。
实现及检查结果沿用任务§39，开发机证据不签目标PASS。

## ADR-0204 固定自有取证子fixture的进度偏好

- 状态：Accepted（2026-10-07，负责人时区）
- 背景：ENGINEERING_02 §40.2当前普通run的两流已直接取证。stdout为固定标记，根及conhost全部零退出；stderr仅含一条Completed CLIXML progress记录，原非空stderr门导致FAIL。原管道字节及乱码原文UNKNOWN。
- 决策：提议仅按§41两路径本地范围，在自己的固定PowerShell子fixture第一句设置ProgressPreference为SilentlyContinue。此作用域只属于自有测试子进程。父进程不丢弃或过滤stderr，中央消费者不放宽任何成功判据。
- 后果：原fixture会变化，需当前准确新批准；不能借用ADR-0203的诊断范围。若子进程仍有stderr，仍FAIL OWN_CHILD_STDERR。原8秒、4096上限、版本化诊断、身份、held退出/关闭和产品/原生身份保持。

### 范围、检查与边界

仅forensic-admission.ps1及win10-entry.test.mjs。
原Accepted ADR-0203正文保持，本提案只针对未来自有fixture的前置语句。
不改变真实产品、任意执行命令、argv、StreamReader解码或ReadToEndAsync。
本地反例覆盖真实fixture首句、作用域及原错误/CLIXML非空拒绝。
实际PS5.1行为须后续准确目标材料确认，不先承诺修复PASS。
本地完成后生成新无角色/无远端批准输入，准备另行目标准入。
本提案未批准，不实施，不连接、上传、执行新目标run、原生重编或产品/Win7。
当前8c372d3e…批次已停止；旧FAIL、UNKNOWN、HALTED与构建来源保持。
源码、任务/分支及新批准匹配后才恢复实施。
回滚只在保护外来修改后恢复保存源码，不删除证据或修改系统。

### 准确两路径本地批准记录

负责人回复“批准”，批准ENGINEERING_02 §41和3972字节材料b2372099…。
原提案及准确源码保存至resume-23/before-local-progress。
执行代理仅修自有子fixture首句进度偏好及对应检查。
本次允许冻结无角色输入并准备另行准确目标材料。
本次不连接Win10、不上传、不执行新目标run、原生重编、产品或Win7。
旧批次停止，FAIL、UNKNOWN、HALTED及构建来源保持。
实现结果沿用任务§42，开发机检查不签目标PASS。

## ADR-0205 普通桌面诊断入口的 Explorer 启动与有限复用

- 状态：Accepted（2026-10-07，负责人时区）
- 背景：负责人要求开始验证无需反复手动CMD的普通桌面入口。Win10只读查询确认普通Explorer仍在，当前无普通PowerShell调度器。历史直接计划任务启动FAIL_HOST_JOB，不能恢复旧流程。
- 提案：仅按ENGINEERING_02 §43准确材料，新增三路径诊断工具。固定InteractiveToken/LeastPrivilege按需任务在普通会话请求现有Explorer启动有限控制器。实际控制器仍直接核对Explorer父链、普通身份、Session、Medium、非提升和noHostJob。
- 后果：需要新增Shell COM使用及固定计划任务配置授权。当前尚未批准，不实施或注册。不能把启动请求成功、任务状态或旧ready文件当成当前普通入口PASS。

完整范围见[任务§43](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#43-普通桌面入口复用调查与实验提案2026-10-07)。
准确机器材料7666字节，SHA256 04c81f90192785dfe2f468a8c94ad0903f15d384bee7f555a6d7fc8841ab136c。
最多两次入口：首次及一次原因明确、全部旧树结束的普通修复重试。
每次15分钟、最多三固定请求：成功、预设失败、新请求成功。
预设失败保留FAIL；同控制器继续不构成产品修复证明。
身份、完整性、安全、必需审计和UNKNOWN生命周期失败硬停止。
禁止解绑Job、breakaway、伪造父进程或放宽普通控制器noHostJob。
计划任务只作普通会话bootstrap，不作为准入控制器或产品进程。
完成须证明同实例请求、全部捕获进程及控制器的实际退出和句柄关闭、任务禁用、回收字节闭合。
新API按WIN7_CONSTRAINTS提案Profile登记；不编译或下载新组件。
此次不改变§42冻结工具/输入或其远端提案，不运行产品、新取证Modes或Win7。
不修改Accepted ADR正文，不扩大历史授权，不提交、推送、发布或删除。
批准本节具体范围后，普通实施、外发和有界重试不逐步补批。

### 准确范围批准记录

负责人回复“批准”，批准ENGINEERING_02 §43及材料04c81f90…。
任务§44登记三条新增实现路径、固定任务与新根，以及最多两轮实验。
允许完成本地实现、准确字节冻结、Win10执行和有界普通修复重试。
原提案中的“当前未批准”保留为批准前记录，以本段准确批准为当前执行依据。
身份、完整性、安全、审计和UNKNOWN生命周期硬门保持，不执行产品或Win7。

## ADR-0206 Win10 取证普通入口接入自动入口

- 状态：Accepted（2026-10-07，负责人时区）
- 背景：ADR-0205 的固定诊断入口已在 Win10 验收机通过一次完整复验，见任务§46.3。取证准入链上剩下的唯一人工动作是§42.3第6步：负责人在a9builder的Explorer打开CanaryCreate生成的CMD。
- 提案：新增三路径桥接工具，由固定按需任务请求现有Explorer，以cmd.exe启动该CMD。CMD字节、forensic-admission.ps1及整套冻结工具、中央批准与有效窗口均不改。启动用的cmd.exe输入重定向到NUL，使CMD末行`pause`不等按键；该效果在Win10为UNKNOWN，由阶段A实测。
- 后果：需要新增固定按需任务与三条实现路径的授权。不增加系统API，不重编原生组件。桥接不提供任何授权，只替换启动者；消费者的PASS或FAIL原样记录。当前未批准，不实施或注册。

完整范围见[任务§47](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#47-取证普通入口接入自动入口的范围提案2026-10-07待负责人裁决)。
准确机器材料8328字节，SHA256 572b8f9ae4c6315c256d6f4b0c7b91f11b5d7fa3ae19904ed7170011a8fc8a51。
阶段A用自有CMD夹具，最多两次入口；阶段B启动真实CMD，一次且不重试，以§42.3远端材料e1889532…获批为前置。
桥接启动前核对CMD路径、578字节大小、command_sha256、按pin与run id重算的文本及有效窗口。
身份、完整性、安全、审计和UNKNOWN生命周期失败硬停止，不自动重试。
桥接失败时，§42.3第6步的人工双击继续有效，任何门都不放宽。
禁止改动冻结工具与CMD字节，禁止绕过或放宽中央批准，禁止运行AdminQuery、Observer、CanaryVerify、产品或Win7。
不修改Accepted ADR正文，不扩大历史授权，不提交、推送、发布或删除。

### 准确范围批准记录

负责人回复“批准，按推荐方案 1 执行”，批准ENGINEERING_02 §47及材料572b8f9a…。
任务§48登记三条新增实现路径、固定任务与新根，阶段A最多两次入口，阶段B以§42.3远端材料e1889532…获批为条件的一次入口。
允许完成本地实现、准确字节冻结、Win10阶段A执行和有界普通修复重试。
原提案中的“当前未批准”保留为批准前记录，以本段准确批准为当前执行依据。
阶段B不因本批准自动执行：§42.3远端材料获批前保持NOT_PERFORMED。
身份、完整性、安全、审计和UNKNOWN生命周期硬门保持，不执行产品或Win7。

## ADR-0207 Win10 B2单次普通取证入口的范围绑定

- 状态：Accepted（2026-10-08，负责人时区）
- 背景：ADR-0206的B1已在Win10直接证明普通入口和pause自然退出。B1、c5ee27ad…普通claim已消耗。当前源码只接受A1/A2/B1，不能直接用作新不可变批次。
- 提案：仅按ENGINEERING_02 §52两路径本地范围，使未来新桥接只接受固定B2根和phaseB。新固定范围SHA绑定manifest及真实批准记录。四处唯一替换可反向恢复原源，不开放任意根或追加重试。
- 后果：新增B2不在原准确批准中，需要本节准确裁决。旧A1/A2/B1及Accepted ADR正文不改。此次只申请本地实施、检查、冻结及另行目标材料准备，远端与产品权限均关闭。

准确范围见[任务§52](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#52-b2新批次自动入口的准确本地提案2026-10-08待负责人裁决)。
机器材料8559字节，SHA2f97c195…；固定范围3749字节，SHA80f38afb…。
两件当前源与四处拟替换的完整SHA见材料，不以计划字节冒充实现结果。
新固定范围与外层机器材料分别绑定，避免源码/材料自引用哈希或伪造旧572b批准。
不改十一件冻结工具、CMD字节、中央消费者、身份、8秒、4096和held退出/关闭。
不新增系统API/运行时/依赖，不重编原生，不改产品r4及其构建身份。
未来B2须另获准确Win10根/任务/外发和一次运行授权，本地批准不替代它。
完整七项及真正当前中央验证完成后，产品须沿最短链路和原回归合同推进。
新pin/run/claim不可变，旧成功与失败不改绑，UNKNOWN/HALTED保持。
回滚先停派发，保护外来修改后恢复保存本地源码，不删除证据。
当前未批准，未实施，不连接或上传，不运行产品或Win7，不执行Git交付。

### 准确两路径本地批准记录

负责人回复“批准”，批准§52及8559字节材料2f97c195…。
固定范围3749字节，SHA80f38afb…，真实批准沿用resume-27/owner-local-approval.json。
本次只允许两路径本地改造、定向检查、字节冻结和后续准确目标材料准备。
原提案及准确两件源码保存至resume-27/before-local-b2。
不连接Win10、不上传、不创建或启动任务，不执行新Mode、产品或Win7。
原B1、冻结工具及Accepted ADR-0206正文保持，不借用原执行者权限。
实际结果沿用任务§53，开发机结果不签新Win10入口或完整准入PASS。

## ADR-0208 B3普通取证入口与完整目录的共同前检

- 状态：Accepted（2026-10-08，负责人时区；真实回复“批准”，仅两路径本地）
- 关联任务：[ENGINEERING_02 §56](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#56-b3与完整目录共同入口前检的本地提案2026-10-08待裁决)

### 问题

实际B2准备漏建signals，Preflight未提前拒绝。
任务已运行Bootstrap后，信号写入失败。
B2已Disabled，原失败和退出码UNKNOWN保持。
原代码拒绝旧entry记录，不能补目录后续跑原B2。

### 提案

仅在任务§56两路径本地范围改为唯一B3根与新真实scope。
共同Read-BridgeManifest先要求四个plain目录存在。
目录为control、inputs、evidence、signals。
目录门先于manifest读取、原生加载和任务注册。
它覆盖Preflight、Supervise、Bootstrap，不自动mkdir。

准确本地材料4660字节，SHAe0691ca2…。
固定范围1951字节，SHAe501d574…。
批准时新PS仅计算，25714字节、SHAe095e034…，未实施。
原中央工具、两件原生、产品、8秒、身份与held门保持。
源码变异与现有五套件验证共同调用点及拒绝反例。
开发机不签新B3或完整准入PASS。

### 授权与后果

负责人已批准准确材料e0691ca2…，只允许两路径本地实施和定向检查。
后续准确目标材料准备不等于远端批准。
B3根/任务不得在本提案下创建或运行。
不修改原B2、候选、冻结工具或UNKNOWN证据。
不连接、上传、重编原生、执行产品/Win7、Git交付或删除。
Accepted ADR-0207及先前正文不改写。
准确材料本身不授予权限；本次授权依据是保存的负责人真实回复。

## ADR-0209 普通入口失败收尾的信号异常隔离与退出证明

- 状态：Accepted（2026-10-08，负责人时区；真实回复“批准 §60 与 ADR-0209，仅限上述两路径本地修复”）
- 关联任务：[ENGINEERING_02 §60](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#60-失败收尾的两路径本地修复提案2026-10-08待裁决)

### 问题

开发机检查桥接e095e034…发现失败收尾缺口。
catch先写abort，再查询held退出；信号写异常可跳过查询。
B2历史Win10记录确实含空exit_proofs，原UNKNOWN保持。
ADR-0208共同目录门已防初始缺目录，未隔离后续写入异常。
负责人选择继续A＋r4，先补失败收尾，暂停直接执行v3。
该路线选择不登记为本提案准确实现范围的批准。

### 提案

仅修改桥接脚本及其对应测试，完整路径见任务§60。
仅隔离停止信号异常，保留首个error并逐件尝试已有held对象。
单个查询失败记录UNKNOWN，继续处理后续对象。
取证尝试之后才关闭句柄，保留任务禁用与COM关闭结果。
不按当前PID重开实例补证，不以收尾错误替换首失败。
本轮最终记录使用schema_version=2及signal_errors数组。
原字段含义保持；收尾失败不签正常PASS。
桥接固定review字段改绑本准确scope；B3根及共同目录门保持。

机器材料3130字节、SHAe748751e…，固定范围2988字节、SHA5e7b3fc5…。
本地先保存反例首红，再修复并完成受影响定向检查。
开发机替代控制流检查标SURROGATE，目标PS5.1为NOT_PERFORMED。
后续材料补绑B1固定模板，并列清两类调用方式。
新实现实际冻结后，重新准备准确目标材料。

### 边界与后果

已批准并实施，结果见[任务§61](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#61-失败收尾两路径本地执行2026-10-08)；目标PS5.1行为NOT_PERFORMED。
不改十一件中央工具、CMD、产品r4、两件原生和原预算。
不连接、上传、创建或运行任务，不执行产品、Win7或原生重编。
不删除、强制结束、改权限或执行Git交付。
原v2/v3、候选、冻结工具、首失败、HALTED和UNKNOWN保留。
原Accepted ADR正文不改写，不将旧批准重绑到新字节。
本ADR只授予本地两路径修复，不授予远端权限。

## ADR-0210 Win10 产品执行合同 v6：取证准入与有限产品派发

- 状态：Accepted（2026-10-08，负责人时区；真实回复“批准 ADR-0210 和 S1 七路径本地实现，选项 A”；实施前发现路径不足，已增补九路径并完成本地实现，见任务 §65、§66）
- 关联任务：[ENGINEERING_02 §64](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#64-最短产品链路的分阶段范围提案2026-10-08待裁决)

### 问题

v5 取证准入只开放两个取证角色，产品角色与产品请求被中央门拒绝。
驱动器对 v3/v4/v5 取证版本抛 SCOPE_FORENSIC_EXECUTION_CONTRACT。
旧产品版本 v2 校验旧 observer 源码，不接受已准入的新原生组件。
结果：B3 七项 PASS 之后，现有工具仍无法派发产品。

### 提案

新增 engineering-02-v6-product，保留 v5 的全部取证操作。
在同一版本内为 ORDINARY_PRODUCT 开放有限操作：SYNC 回执、Boot（normal-short）、短 Background。
其余 phase、Build、任意请求和未知操作一律拒绝。
执行范围分两级：本地准备（不授权产品）与准确批准（仅三请求、固定 pin、固定 run、固定窗口）。
驱动器与 observer 只在 v6 批准范围内放行；对取证版本的拒绝保持。
产品 r4、两件原生组件、桥接脚本和 ADR-0209 合同不变。
工具字节变化使工具摘要变化，旧摘要下的七项 PASS 不继承，须在 v6 摘要下重跑。

### 范围、边界与后果

仅七路径本地实现与定向检查，路径见任务 §64.3。
先保存原实现上的失败反例；本机无 PowerShell，控制流检查标 SURROGATE。
需要七路径之外的文件时停止并报告。
不连接、上传、执行产品、Win7、原生重编、Git 交付、删除或改系统权限。
S2（v6 摘要下重跑七项）与 S3（三请求产品链路）各需另行准确的远端批准。
真实退出对话框与其余 6 个 phase 不在最短链路内，S3 PASS 后另行裁决。
Accepted ADR-0194 至 ADR-0209 正文不改写。

## ADR-0211 桥接自动入口扩展到 B4/B5 与 dispatcher 目标

- 状态：Accepted（2026-10-08，负责人时区；真实回复“批准 ADR-0211 两路径本地修改，选项 A”；本地实现见任务 §69）
- 关联任务：[ENGINEERING_02 §68](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#68-负责人无法手动打开-cmd桥接自动入口-b4b5-提案2026-10-08待裁决)

### 问题

负责人无法在 Win10 普通桌面手动打开 CMD，§67 的 E1 人工入口不可用。
S2 跨账户检查与 S3 dispatcher 都需要 Explorer 祖先且不在 Job 中的普通进程。
现有桥接只接受已用过的 B3 根和 ORDINARY 目标。

### 提案

桥接根门改为恰好 B4（ORDINARY，原合同）与 B5（新 DISPATCHER 目标）。
DISPATCHER 的 CMD 按原模板对 v6 工具根下 launch-product-desktop.ps1 重算并逐字节比对。
监督窗口：ORDINARY 15 分钟，DISPATCHER 60 分钟；其余门、预算与 ADR-0209 收尾不变。
BridgeReviewSha 改绑新的固定范围文件。

### 范围与后果

仅两路径本地实现与定向检查；不连接、不上传、不执行产品或 Win7。
桥接不在十一件工具闭包内，v6 工具摘要不变。
§67 材料 v1 作废，实施后改编 v2，须另行批准。
Accepted ADR 正文不改写。

## ADR-0212 桥接根目录改为 B6/B7

- 状态：Accepted（2026-10-09，负责人时区；负责人直接指示将Win10实机验证作为最高优先项推进，承接上一条已呈现的两路径诊断范围v2；执行记录见任务§82）
- 关联任务：[ENGINEERING_02 §79](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#79-原地清理路线与桥接根目录-b6b7-提案2026-10-09待裁决)

### 问题

v6 批次已建立 B4、B5 两个桥接根目录和同名计划任务，按规则保留不删。
桥接脚本只接受 B4、B5，且要求根目录全新，续跑无法再进入普通入口。

### 提案

根门改为恰好 B6（ORDINARY，原 B4 合同）与 B7（DISPATCHER，原 B5 合同）；B4、B5 改为拒绝。
BridgeReviewSha 改绑新的固定范围文件；其余门、窗口、预算与 ADR-0209/0211 行为不变。

### 范围与后果

仅两路径本地实现与定向检查；不连接、不上传、不执行产品或 Win7。
桥接不在十一件工具闭包内，工具摘要 7102b3f2… 不变。
2026-10-09修订：负责人已批准当前主机仅作诊断路线，见ADR-0213与任务§81。
准确本地范围为诊断v2（3508字节、5e7b954e…）；原v1保留。
本地实施不依赖主机可信裁决；正式验收的环境可信门保持关闭。
实施后编制诊断材料v7，新远端范围与窗口须另行批准。
Accepted ADR 正文不改写。

## ADR-0213 当前 Win10 主机的诊断路线与验收证据边界

- 状态：Superseded by ADR-0219（2026-10-10，仅当前目标后续验收环境的可信裁决；原诊断正文与历史证据边界保留）
- 关联任务：[ENGINEERING_02 §81](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#81-当前主机诊断路线批准与准确范围准备2026-10-09负责人时区)

### 决定

负责人批准当前Win10主机继续诊断路线，原地清理路线暂停。
这不是主机可信裁决，也不授予正式验收PASS。
本次批准允许准备诊断合同和准确实施、远端材料。
ADR-0212两路径实施、新窗口及第三次helper-sync仍须准确范围批准。
旧v6窗口与绑定不复用；原失败、UNKNOWN、HALTED保持。

### 证据与执行边界

该机2026-05-26以后的历史结果与新诊断观察均保持主机完整性UNKNOWN。
可分别保存原始退出码和功能观察，不将其登记为正式工具准入或产品验收PASS。
正式验收下游继续停止，等待可信环境及适用合同。
后续诊断仍保持目标身份、哈希、审计、输出预算与进程收尾门。
新身份、哈希、审计或未知生命周期失败停止其依赖诊断动作。
不授予系统清理、提权、权限或安全配置变更、删除、原生重编、Win7或Git交付。
不改Accepted ADR-0194至ADR-0211正文，ADR-0212仍为Proposed。

## ADR-0214 B8/B9完整本地消费者接入与新派发器CMD路径

- 状态：Accepted（2026-10-09，负责人时区；准确13路径本地范围6b05106a…获批准，仅本地）
- 关联任务：[ENGINEERING_02 §91](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#91-获批win10只读前检与新源码解析完成2026-10-09负责人时区)

### 问题

新桥接15a795f3…和新库36d35783…已在实际Win10 PS5.1解析通过。
旧调用器和清单工厂仍锁定B6/B7及旧SHA，不能直接调用新源。
原R4派发器CMD仍存在，521字节、dcd8c75e…，与保留的v7字节匹配。
其旧pin窗口已消费，原批次HALTED，不能覆盖该CMD换新pin。

### 提案

生成完整本地消费者副本，共13个准确新实现路径。
新桥接副本仅再改本地范围SHA和目标CMD文件名。
新CMD路径为原R4下的run-product-dispatcher-v6-b9.cmd。
本地工厂、编排器和调用表统一绑定该新文件名与新桥接/库SHA。
生产辅助目录使用新的admission-v6-v5，旧辅助源保持。
旧库复制改为新库准确上传描述，原生与proof五件仍按未变哈希引用。
身份观察内部等待改为90秒，外层120秒不变，避免内部等待超过调用预算。
原身份、held、清单、审计、收尾、stdin NUL与15/60分钟入口预算保持。

### 授权与证据边界

准确范围见任务§91.3的consumer-chain-local-scope-v2.json。
负责人准确批准该范围后，才能加入13路径实施白名单并接受本ADR的本地提案。
批准不含远端、另一次SYNC、任务创建、入口或产品执行。
本地完成后，按全部冻结输入编制一批新的准确Win10诊断材料，再另行取得远端批准。
实际源15a795f3…的解析不能作为新增CMD目标源的直接PS5.1证据。
未变库与原生可按字节及相关行为标INHERITED_EVIDENCE；新改消费者须直接检查。
原CMD、原桥接、旧证据、原FAIL/HALTED和UNKNOWN全部保留。
主机完整性UNKNOWN；当前主机继续ADR-0213诊断路线，正式验收门保持关闭。
十一件工具闭包7102b3f2…、r4产品与原生不改，不重建、不执行Win7、不清理或Git交付。

### 拟议调用链

以下为未实施的本地方案。

```mermaid
flowchart LR
  A[新的准确批准与输入] --> B[本地编排器与固定调用表]
  A --> C[清单工厂与事实校验]
  C --> B
  B --> D[新桥接与B9专用CMD路径]
  D --> E[已实测的不可变新库]
```

## ADR-0215 ENGINEERING_02完整工具修复阶段授权

- 状态：Accepted（2026-10-10，负责人时区；负责人准确回复“批准完整阶段方案及 ADR-0215”，范围62e30081…；真实批准记录见任务§98）
- 关联任务：[ENGINEERING_02 §97](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#97-完整工具修复阶段授权方案2026-10-09待一次批准)

### 问题与选择

旧合同分别批准新文件副本、准确源码和单次远端批次。
同范围消费者修复仍需重新批准，阻断完整工具链交付。
负责人要求一次批准本地范围、新副本、同范围修复和固定Win10有界验证。
继续逐批审批会保留这项阻断；本提案选择完整阶段授权。

### 提案

阶段准确材料为现有证据目录phase-r1/planning/phase-authorization-scope-v3.json。
负责人一次批准该材料及本ADR后，任务§97的有限白名单生效。
允许39类工具/测试源的六组准确新路径；三类原生相关源只能逐字节复制。
允许在声明职责与既有证明判据内修复当前缺陷和本次修复引起的失败。
现有产品包、原生源码/工件/协议、依赖与系统权限保持。
未冻结副本可修复；冻结或执行后只能使用下一组新路径。
最多六个冻结工具版本、六轮本地实现返工、三轮Win10验证。

固定目标为Administrator@192.168.1.4:22、WIN-2JQ66JE4HTQ。
三个普通/dispatcher根对为B10/B11、B12/B13、B14/B15。
每轮最多52项主调用、5项最小诊断调用和12次只读SFTP。
每项只调用一次；每轮新两小时窗口，阶段有效期为真实批准后七天。
一轮最多一次runtime-SYNC，内120秒/外180秒；阶段最多三次。
产品请求始终0；当前主机只按ADR-0213取得诊断证据。

阶段批准绑定职责、有限路径、目标、动作和上限。
执行代理在准确字节形成后，冻结实际源码、产物、调用表和哈希。
每轮执行绑定由真实阶段批准派生，注明来源，不能伪造新的人工批准。
现有中央输入格式所需response字段只代表该阶段批准的派生执行绑定。
源批准、阶段材料SHA、工具版本、run、目标、窗口和全部参数必须可追溯。
同范围新哈希或新副本不重新求批；实际调用仍经工具沙箱正常审核。
不接受任意未来源码、任意API、任意目录或任意远端命令。

### 修复、重试与停止

普通编排、模式合同、编码、发布、报告和测试故障可在本阶段修复。
同类失败连续两轮未闭环，先停整批重试，做一次最小共同根因诊断。
取得新根因与修复证据，且实际新进程树已结束，才可使用下一轮。
旧HALTED、消费过的claim、旧窗口和首失败保持，不恢复旧控制器。
范围、次数、期限、大小或时间上限耗尽，停止依赖动作并请求裁决。
新的身份、完整性、权限、安全、必需审计或未知生命周期失败立即硬停止。
不靠延长等待、减少断言、放宽绑定、换命令或换root绕过失败。

### 生效与兼容边界

本提案只改变任务§97的授权粒度和来源记录，不改变产品Schema IPC或原生协议。
阶段元数据schema_version为1；批准与派生执行绑定分别记录。
批准前不创建工具新副本、真实窗口、owner/run/pin/revision，不连接目标。
批准后只对本阶段取代ADR-0214的逐路径/逐批新增批准要求。
ADR-0214与全部旧授权正文、历史结果和拒绝边界保持。
ADR-0213的主机UNKNOWN和正式验收关闭边界继续生效。
Win7、正式工具准入、产品执行、提交、推送、发布和删除不在本阶段。
完成本阶段不自动将ENGINEERING_02整体标为COMPLETE。

## ADR-0216 ENGINEERING_02未派发首轮的不可变替代运行

- 状态：Accepted（2026-10-10，负责人准确批准ec0c51f3…及ADR-0216；执行记录见任务§100）
- 关联任务：[ENGINEERING_02 §99](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#99-未派发首轮的有界替代方案2026-10-10待裁决)

### 问题与选择

ADR-0215的三个准确run目录均已生成，当前全部HALTED。
r01在本地renderer引用检查处停止，SSH、远端claim和入口均为0。
r02及r03的Prepare取得held退出1，未启动普通入口、调度器或产品。
执行代理在前两版接入中遗漏了摘要引用；首失败及错误源码保留。
Win10最小诊断确认r03的证据生成器仍绑定旧中央源码SHA。
c05在同范围修复准确引用，开发机24/47/77项检查PASS。
当前只有两个实际Win10主批次；三个旧run不能恢复或覆盖。
选择新增一个准确r04，替代从未远端派发的r01。
不将旧HALTED改为可运行，不复用旧claim或窗口。

### 有界提案

只有负责人批准任务§99的准确增补材料后才生效。
使用现有最后源槽位c06，来源为冻结c05；原生相关源逐字节复制。
使用全新phase-r1/run-r04、r04 producer和r04 dispatcher CMD。
目标根仍为原方案未派发的B10/B11，先验证全新路径和任务。
完整52项各限一次，45 SSH及7上传，另最多10次只读SFTP。
保留条件上传、报告门、普通S2、runtime-SYNC与S3正常停止合同。
只允许一次仍未派发的第四次SYNC，内120秒、外180秒。
本增补没有新的最小诊断批次或自动重试。
本轮上传不超过2097152字节，复制不超过524288字节。
原阶段207会话、7077888上传、1572864复制、三次SYNC总上限保持。
实际Win10主批次总上限仍为三次，本地源版本总上限仍为六个。
新增一个两小时窗口；生成窗口总上限为四个、28800秒。
原r01窗口没有远端派发，保留原记录并记本地停止。
阶段有效期仍截止真实原批准的七天期限，不重新起算或延长旧窗口。

### 来源与停止门

新增批准只绑定准确替代范围；与原阶段批准组成可追溯授权链。
实际c06源码、prepared、调用表、命令、pin和run哈希在冻结后派生。
实际字节未形成前不使用未来哈希，不伪造新的人工回复。
职责、依赖、原生接口、证明判据、工具预算和主机诊断边界保持。
任何失败停止该批；若剩余源槽位或准确范围不足，再请求裁决。
新安全硬门立即停止全部依赖动作；原HALTED和历史UNKNOWN始终保持。
产品请求0，不执行产品、Win7、清理、删除、提交、推送或系统修改。

## ADR-0217 ENGINEERING_02完整非子进程排除证明与有界追加轮次

- 状态：Accepted（2026-10-10，负责人准确批准4b4d12e6…及ADR-0217；执行见任务§102）
- 关联任务：[ENGINEERING_02 §101](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#101-捕获排除证明合同与有界增补提案2026-10-10待裁决)

### 当前事实与合同问题

r04使用c06，当前Win10 Prepare/AdminQuery/Observer/CanaryCreate通过。
B10静默Preflight与实际报告核验通过，supervisor取得held退出1。
首失败为LIFECYCLE_ENTRY_CAPTURE，原结果和HALTED保持。
实际capture有两件Added、零Gaps及一件Excluded。
Excluded记录为CHILD_CREATED_BEFORE_PINNED_PARENT，ownership为EXCLUDED_NOT_CHILD_OF_PINNED_PARENT。
旧Adobe进程创建早于新CMD；原生以第二次观测与双方held实例证明排除。
桥接、公共库及ordinary取证消费者一律拒绝非空Excluded，中央JSON合同也固定计数0。
现有诊断序列化只保留部分证明字段，旧记录的缺失字段继续UNKNOWN。
六条held查询取得退出0；任务停用，COM、handle、signal和disable错误为空。
普通S2未通过，canary消费者结果UNKNOWN，SYNC、B11和产品NOT_PERFORMED。

### 完整证明合同提案

仅在新不可变工具版本中接入现有原生ProveNonChild结果。
每条排除必须验证准确原生类型、原因、ownership、完整第二次快照及双方实例字段。
子进程创建早于父实例；快照/查询顺序、PID、创建时间、Session及image逐项绑定。
两次观测中的子实例与父实例各自必须相同；排除进程不计入owned tree。
所有Gap、UNKNOWN、缺失、重复、伪造标签、时间矛盾、实例错配或未知排除仍拒绝。
原生源码、DLL、ABI、API和构建产物不变，不过滤Adobe或按名称跳过进程。
完整排除证明按新版本JSON合同保存，并由中央消费者独立校验。
旧v1继续要求排除计数0；新v2真实计数和证明数组一致，旧结果不改判。
现有身份、Added形状、held退出、审计、停止、输出上限及全部安全反例保持。
先运行开发机反例，再在实际PS5.1 Preflight中检验同一谓词和拒绝反例。
随后才允许新普通入口；最短链路失败则停止全部下游。

### 有界追加提案

只新增c07的42类明确路径，来源为冻结c06；其中三类原生相关源逐字节复制。
只新增一次run-r05、r05 producer/CMD及全新B16/B17根和任务。
52项各一次，45 SSH、7上传，另最多10次只读SFTP，无新最小诊断批次。
上传不超过2097152字节，复制不超过524288字节，命令仍不超过7899字符。
仅一次仍未派发的第四次SYNC，内120秒、外180秒，产品请求0。
本地源版本上限六增至七，实际Win10主批次上限三增至四。
新增一个两小时窗口；已生成窗口上限四增至五，36000秒。
实际远端窗口上限三增至四，28800秒；原七天截止不延长。
147 SSH、24上传、36只读SFTP、207会话、7077888上传及1572864复制总上限不增。
同范围冻结前修复直接完成；冻结后不覆盖，新批任何失败HALTED。
没有c08、r06、额外诊断、自动重试、旧run恢复或预算重置权限。
主机完整性UNKNOWN，只取得诊断证据，不执行产品、Win7或正式验收。
全部旧源、首失败、未知、claim、窗口、任务和证据保留，不删除或清理。
只有负责人对任务§101准确材料批准后才实施本提案。

## ADR-0218 ENGINEERING_02成功r05普通原始证据有界补收集

- 状态：Accepted（2026-10-10，负责人准确批准cb42dd9b…及ADR-0218；执行见任务§104）

### 事实与阻断

c07/r05固定Win10的52项主调用全部通过，五组94件取证完整下载。
B16普通入口、中央CanaryVerify/Finalize、第四次runtime-SYNC及B17身份/正常停止通过。
B16/B17 held退出0、任务停用，错误数组为空，产品请求0。
冻结S2收集器遗漏实际ordinary-probe目录；本地仅有当前context/result的摘要引用。
普通原始context、capability、capture和stream四件文件未下载。
主调用技术结论保留；完整证据与阶段完成不能由摘要引用替代。
r05没有HALTED，旧run的HALTED和首失败保持。
本轮10次只读SFTP已用完，新增补收集越过该项上限，不能借用剩余SSH或上传额度。

### 提案

不改c07、不重跑任何主调用，仅补收集实际普通run的四件固定JSON。
固定目标Administrator@192.168.1.4:22，两个只读SFTP会话各一次。
先30秒准确四文件ls前检，确认普通文件、名称和单件262144字节界限。
然后90秒准确四文件get，总内容不超过1048576字节；本地再次检查实际大小与SHA。
当前context/result必须匹配已经由Win10中央验证的准确摘要。
冻结中央v2工具独立核验能力、实例、时间、身份、owned退出和完整排除证明。
原capture/stream以当前run、pin、source和实例字段绑定，不能补填未知值。
本轮只读SFTP上限10增至12，会话62增至64；原累计36只读SFTP、207会话不增。
批准后生成仅供补收集的30分钟只读授权有效期，仍在原七天截止以内。
这是现有成功run的证据补收集；没有新主批次、源版本或两小时执行窗口。
原r05窗口、pin、revision、运行结果、claim及所有冻结输入不重绑。
新增权限仅用于准确两个会话，不成为新通用收集器或未来重试权限。
失败停止，无自动重试；保留失败、原结果及四文件原始字节，不覆盖旧证据。
不上传、不复制远端文件、不写远端、不执行源码/任务/入口/SYNC/产品，不改系统或清理删除。
主机完整性UNKNOWN，结论仍仅诊断；整体ENGINEERING_02、正式Win10与Win7不据此完成。

## ADR-0219 负责人指定当前 Win10 为可信验收环境

- 状态：Accepted（2026-10-10，负责人时区；负责人直接指示“将win10设为可信”）
- 关联任务：[ENGINEERING_02 §105](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#105-负责人指定当前win10为可信验收环境2026-10-10负责人时区)

### 决定与依据

负责人指定固定目标Administrator@192.168.1.4:22为可信Win10验收环境。
预期主机为WIN-2JQ66JE4HTQ；实际连接仍须直接核对当前身份。
本裁决满足ENGINEERING_02后续工具准入与r4产品验证的环境信任选择。
ADR-0213对该目标后续仅允许诊断的限制由本ADR取代。
执行代理继续准备剩余完整验证阶段，不以诊断工具阶段完成结束整体任务。

可信依据为负责人的环境裁决，技术主机完整性仍为UNKNOWN。
本次没有新的远端安全检查，不声称系统修复或恶意程序已清除。
准确负责人记录为phase-r1/planning/win10-owner-trust-20261010/owner-win10-trust-decision-v1.json。
记录3772字节，SHA256 `02e04da37ee78e1b193f98f1a982dd6ecd2c217b8b427525212b9bbfbec9dda0`。

### 执行与证据边界

本裁决只改变后续验收环境的信任依据，不签发工具或产品PASS。
c07/r05和全部历史诊断结果不改判，旧主机UNKNOWN、首失败与HALTED保留。
新验证须使用适用的准确范围、不可变输入、新run与当前身份核验。
ADR-0215至ADR-0218的源槽位、轮次、调用、字节和期限不重置。
本裁决没有新增实现路径、远端调用、产品请求或UI操作额度。
剩余工具消费者、完整矩阵与实际退出操作纳入一次完整阶段方案。
身份、输入完整性、权限、必需审计或未知生命周期硬门继续生效。
发现当前安全异常时停止其依赖动作并保留证据，再请求负责人裁决。
不授予系统清理、提权、安全配置变更、删除、原生重编或Git交付。
Win7保持NOT_PERFORMED；ENGINEERING_02整体仍未完成，最终接受另由负责人签发。

## ADR-0220 ENGINEERING_02完整产品验证阶段与退出语义工具

- 状态：Accepted（2026-10-10，负责人准确批准7993bd86…及ADR-0220；激活见任务§107）
- 关联任务：[ENGINEERING_02 §106](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#106-完整产品验证阶段方案2026-10-10待裁决)

### 问题与方案

负责人已在ADR-0219指定当前Win10为可信验收环境。
c07/r05只完成诊断工具阶段，整体产品链路和完整回归尚未执行。
c07的产品合同只开放Boot/Background、normal-short与三个请求。
退出动作模块只有契约校验，没有实际语义提供者。
原评审脚本写死历史Session3，不能直接评审当前入口。

采用一次完整阶段授权，覆盖新消费者合同、同范围修复与有界Win10验证。
保留不变r4产品、原生锁、helper、capture和observer字节，不重建产品或原生。
新增52类明确工具/测试路径，三个不可变源只复制，最多三个源版本。
在新product-phase-r1内生成p01、p02、p03；执行最多两轮w01、w02。
旧phase-r1及其槽位、限额、首失败、claim、窗口与HALTED不改。

### 产品合同与实际退出动作

新engineering-02-v7-product-complete合同按准确phase/revision元组拒绝越界。
完整顺序为Boot、短Background、完整Background、ready负例、Shell、EncodingSecurity、
FailureBoundaries、StopExit、ReleaseExit和Recovery。
前两项就是最短链路，先核验真实输出、Stop、持久化和held收尾，再派发第三项。
四个revision均直接检查；controlled-boot仍供工具反例，不插入十请求主矩阵。
ready负例须取得预期失败和完整树退出证明，不按产品成功或普通重试登记。
Recovery保留原崩溃/重启判据及正常产品退出受阻的已知限制，不改A9-34。

新UIA工具限Win10候选包外，登记E02-WIN10-UIA-V1_TEST_ONLY。
先用当前已安装的微软系统/.NET组件锁定实际路径、版本、SHA和加载闭包。
哈希未取得或锁定不一致时禁止加载与API使用，不下载或安装组件。
先用两件隔离Electron工具窗口检查真实原生response0/1与owned收尾。
随后只定位当前产品PID+creation、请求、sequence、标题和三个准确按钮。
在独立MTA普通用户进程中对唯一按钮执行一次InvokePattern.Invoke。
执行代理核对产品自身的ACTUAL_NATIVE_API_RETURNED，不能写入或伪造产品response。
StopExit要求0，ReleaseExit要求1和逐句柄移交证明；错误、取消或晚到不计成功。
无语义能力时停止依赖动作，不切换坐标、SendKeys、提权或另一提供者。

### 有界授权提案

只对固定Administrator@192.168.1.4:22及当前普通SID1005执行。
最多三次本地实施/源版本、两轮Win10和两个新两小时窗口；批准有效七天。
每轮112 SSH、12上传、48只读SFTP，全部按冻结调用表单次claim。
阶段上限224 SSH、24上传、96只读SFTP，共344会话。
每轮上传准确r4 ZIP 101330419字节，工具和新输入不超过2097152字节。
阶段上传不超过206855142字节；独占组件复制不超过1048576字节。
每轮最多16请求，包含一次SYNC、十件主矩阵及最多五件非HALT额外请求。
阶段最多两次新runtime-SYNC，各内120秒/外180秒，不重标历史第四次SYNC。
新窗口、源码、命令、组件锁及run哈希仅在真实批准和实际冻结后派生。

普通非HALT失败每项最多重试一次；点击非HALT超时每项最多三次尝试。
全部额外请求共用五件额度，必须先证明当前树已结束，再用新request。
达到总限、两轮同类失败、越界或安全硬门时停止依赖并请求负责人裁决。
已HALTED不恢复；身份、完整性、必需审计、未知生命周期、错误原生response仍硬停止。
范围内普通修复、准入、派发、回收与收尾在批准后直接完成，不逐步重批。

### 证据与接受边界

准确范围323008字节，SHA256 `7993bd86071b2c786a704ae3d7d299d9fcab7c1a57340596dd2cce7ce39019f1`。
材料及52类源、156条新路径见任务§106；C15/C16提案同时供负责人批准。
旧诊断结果不升级；新的Win10结果直接绑定准确新工具、当前身份和原始报告。
执行代理的评审消费者验证不自称独立审核；最终接受仍由负责人签发。
全部冻结输入、历史首失败、缺口、UNKNOWN与HALTED保留。
不改产品/原生/依赖字节，不执行系统修复、提权、清理、删除、Win7或Git交付。
本ADR为提案；ADR-0219的环境信任指示不等于本阶段执行批准。

## ADR-0221 ENGINEERING_02登记当前Win10已有.NET Framework 4.8.1

- 状态：Accepted（2026-10-10，负责人准确批准270978c7…及ADR-0221；激活见任务§107.2）
- 关联任务：[ENGINEERING_02 §107.1](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#1071-首次win10只读前检与实际net版本边界)

### 事实与精确差异

完整阶段7993bd86…已批准；w01第一次SSH只读前检退出0。
固定主机、管理员Session0、五件UIA组件有效签名及新P1/P2路径不存在直接取得。
当前.NET注册表Release为533325，对应4.8.1；CLR为4.0.30319.42000。
四件托管程序集AssemblyVersion为4.0.0.0，file_version为4.8.9316.0，NET481REL1LAST_C。
原准确Profile登记.NET Framework4.8；相同CLR不代替准确运行时范围。
首前检只读取元数据，没有加载UIA程序集、使用UIA或执行产品。

### 提案与保持边界

仅将候选包外UIA Profile实际运行时补充为已安装的.NET Framework4.8.1。
锁定本次五件准确路径、大小、SHA、版本、强名称和签名状态。
不安装、下载、替换或修改任何系统组件，不改变UIA API列表。
目标、156源路径、三个源版本、两轮Win10、344会话、上传、请求、SYNC和截止均不增。
原完整阶段、Profile提案、前检claim/结果与全部历史证据原字节保留。
实际加载前再次核验当前锁，缺失或变化继续fail-closed。
Win10准入、fixture和产品必须取得新的直接结果；不签Win7兼容或产品依赖。
本裁决只约束UIA依赖动作，已批准的本地合同、测试和消费者修复继续。

准确材料4863字节，SHA256 `270978c7680b3643bd63b55237d103b19c4348175bce82dcf12487e84ff0dc0c`。
真实原始前检2753字节，SHA256 `9e004fa443e12cd1a398f00fc49f193e3236a0ceb5df2119a51dea2e725c0181`。
当前方案未批准，不由执行代理将4.8静默解释成4.8.1。

## ADR-0222 ENGINEERING_02 Text传输修复与最后源版本的完整替代方案

- 状态：Accepted（2026-10-10，负责人准确批准f238e444…完整替代方案；激活见任务§108）
- 关联任务：[ENGINEERING_02 §107.4](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#1074-win10解析超时与完整替代裁决)

### 已证事实

ADR-0220与ADR-0221保持Accepted。p01、p02、p03源槽位均已使用并保留。
p02/w01在本地时间格式校验停止，没有新增远端调用。
p03/w02的`ps51-parse-current`在60秒后超时，退出为本地客户端-9，标准输出0字节。
远端进程没有在读入前记录PID与创建时间，实际退出保持UNKNOWN。
输入876177字节；没有进入源码解析通过门、部署、UIA、产品或窗口生成。

当前冻结调用器使用`Console.ReadLine`，未沿用2026-10-09已成功的
`-InputFormat Text`与PowerShell `$input`通道。旧成功调用先输出PID/创建时间，
准确52963字节输入和两件源码解析退出0。它只构成历史传输证据，不能证明新载荷通过。
传输实现回归为源码事实；本次超时共同根因仍待目标诊断，不将推断写成确认。
本次输入重复嵌套Base64放大；替代方案改为直接单行JSON与逐源Base64。

### 一次完整增补提案

仅增加p04的同52件源路径和一个隔离w03/P3/B22/B23替代目录。
源版本及本地实现周期上限3→4；远端轮次目录上限2→3。
只有w03可进入剩余产品主链；w01/w02的HALTED永不恢复。
七天截止、最多两件实际主窗口、原累计会话/字节/请求/SYNC上限保持。

先完成同范围本地传输、启动实例帧、时间格式与消费者修复和定向拒绝检查。
冻结后进行两件各30秒只读诊断：准确旧解析命令的当前生命周期观察；
未来准确长度的公开Text载荷诊断。第二件不发送源码，不写远端文件，不执行产品。
缺失、模糊、当前实例仍存活或适用生命周期仍UNKNOWN时停止依赖动作。
不终止旧进程，不用当前PID缺失证明历史退出。

仅在通道与当前生命周期门闭合后，继续原完整产品阶段：实际PS5.1解析，
独占原包/工具与不可变原生复制，当前普通S2/UIA、四revision、SYNC、S3、
十请求/八phase原始取证和正常停止。每个准确调用先冻结并一次claim，失败停止。
实际执行源码与外发源码保持不可变；执行代理不签负责人验收或Win7结果。

准确材料以`product-phase-r1/planning/text-ingress-replacement-r1/text-ingress-complete-replacement-scope-v2.json`为准，
29581字节，SHA256 `f238e4449b0238487cd771afa4b8753cd69e7b41c2cdf9aba34809b2e83f5e84`。
v1原字节保留且不派发。v2明确目录枚举替代与实际窗口不增的关系。
新消费者同时绑定原阶段与准确增补，不将新材料替换整个原批准链。
未来公开载荷与源码载荷在准确新源冻结后派生，不提前推定源码哈希。
原首失败、冻结输入、UNKNOWN、HALTED与155件保护文件复核保留。
这份提案不授权新源实现、额外远端动作、系统修改、清理、删除或Git交付。

## ADR-0223 ENGINEERING_02准确旧解析实例处置与完整替代验证

- 状态：Accepted（2026-10-10，负责人时区；准确批准见任务§110）
- 关联任务：[ENGINEERING_02 §109](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#109-准确旧解析实例处置与完整替代方案待裁决)

### 直接证据与停止原因

ADR-0222获准确批准后，p04完成开发机检查并冻结。
Win10一次只读诊断退出0，Text入口先记录PID与创建时间。
当前目标仍有准确旧w02解析实例：PID28868，创建ticks639272795733065333。
镜像为System32的powershell.exe，SID为获批管理员，Session0。
原冻结EncodedCommand指纹直接匹配；旧实例实际退出仍UNKNOWN。
生命周期消费者拒绝继续，w03 HALTED原字节保留。
公开Text载荷、全部源码解析、远端写入、UIA、产品和主窗口均NOT_PERFORMED。
阶段累计五次SSH；其余新阶段额度消费均0。

### 完整增补提案

一次30秒SSH，仅处置上述准确旧解析实例。
先验证固定主机、管理员、实际系统版本及准确镜像SHA。
用同一held句柄核对PID、创建时间、Session与镜像。
当前CIM所有者与冻结EncodedCommand必须准确匹配。
只有全部身份成立且同一实例仍存活时，调用一次Process.Kill。
同一句柄最多等10秒，并直接查询HasExited与ExitCode。
PID缺失或复用不替代为其他目标，不推定历史退出。
缺失、错配、拒绝访问、超时或未知退出停止下游。
本动作不终止进程树，不操作服务、任务、文件或系统配置。
仅登记现有.NET4.8.1的准确测试用Process接口，不新增组件或安装。

新增同52类p05源路径与全新w04/P4/B24/B25。
源及本地周期上限4→5，轮次目录3→4；不含p06。
旧w01/w02/w03 HALTED均不恢复，p01至p04全部冻结源保持。
处置后完成一次只读生命周期观察与一次等长公开Text诊断。
全部适用门闭合后，直接完成原完整Win10工具及十请求产品链路。
每轮stop类别最多三次，包含本次准确处置及最多两次正常新实例收尾。
其他类别及原累计会话、上传、复制、请求、SYNC和两窗口上限保持。
七天截止2026-10-18T00:01:08.277195Z不延长。
源码、调用、记录与批准链须冻结，失败停止，无自动重试。

准确材料`product-phase-r1/planning/live-parse-instance-recovery-r1/complete-live-instance-recovery-and-replacement-scope-v3.json`，
37460字节，SHA256 `85d6082bd225ccbe0fd5149be648f6c292719c2dd68b5f3e8a931b6686d4994f`。
依据是ADR-0222明确排除终止旧进程并未枚举p05/w04。
本ADR不构成当前执行批准。开发机与Win10证据层级保持，负责人验收和Win7不签发。

C15/C16准确旧解析实例Profile材料为`held-parse-process-c15-c16-proposed-profile-v1.json`，
4717字节，SHA256 `26d8933c0185b6ed8c8f63c9b0b1dfed81654a851efc89d10a7d3821f84c77c2`。
该材料已绑定既有Win10二十件组件前检；处置前必须另核当前已加载System.dll的路径、SHA、强名称、版本和有效签名。
不加载替代程序集；任何错配停止，先前v1提案保持。

本地准确方案复核17项通过；保护快照583件SHA保持。
前述v1/v2提案均保留，当前待裁决材料为v3；未新增远端动作或p05源码。

## ADR-0224 ENGINEERING_02先观察实际Process组件锁并完整替代验证

- 状态：Accepted（2026-10-10，负责人时区；负责人准确批准13a5d7b9…完整方案，真实批准记录934d03ff…；原提案正文保留）
- 范围：ENGINEERING_02 §111–112；固定Win10工具及原完整产品阶段

w04当前已加载Process程序集守卫在取得目标句柄前失败。
Win10直接回执为INTEGRITY_RECOVERY_LOADED_ASSEMBLY，终止次数0。
原错误未返回实际Location、版本、token、SHA或签名；根因保持UNKNOWN。
不得将路径大小写推测当作实际根因，不重试或恢复w04 HALTED。
仅组件守卫失败后的依赖动作停止；本地证据归档和准确方案继续。

本提案一次包含先观察、准确锁、单次恢复与完整替代验证。
新增52类p06主源和材料中一条准确只读bootstrap源。
该bootstrap独立冻结，一次30秒SSH，只观察当前已加载程序集与既有系统组件。
先保存实际字段、错误和准确哈希，不取得旧PID或执行任何终止。
只在已安装.NET4.8.1/PS5.1和两个固定System.dll位置的既有准确字节成立时派生不可变锁。
元数据获取按Windows命名空间识别两个既有位置，并保存实际规范字符串。
后续处置必须按实际锁的准确字符串、版本、字节、签名再次核验；不放宽高影响动作身份。
没有新组件、新提供者、新.NET版本、下载、安装或系统设置。

主源在当前元数据和定向本地检查通过后冻结。
新增唯一w05/P5/B26/B27；源及本地周期5→6、轮次目录4→5。
一次新held处置仍只绑定PID28868/创建ticks639272795733065333。
身份和准确冻结命令全部成立，最多一次Kill/同句柄等待10秒。
随后两只读门、当前PS5.1、完整工具/S2/SYNC/UIA/S3、十产品请求与正常停止全部保留。
原累计会话、上传、复制、请求、SYNC、两实际窗口和七天截止不增加。
不含p07、自动重试、进程树、旧HALTED恢复、系统修改、清理删除、Git或Win7。
失败、未知或越界仍停止依赖链并请求准确裁决。

准确材料42743字节，SHA256 13a5d7b933a1337c51f65895aa1af7aeb20802ca1182e9dc732b3995bc9b7782，
位于product-phase-r1/planning/loaded-process-profile-recovery-r1/complete-component-lock-and-replacement-scope-v1.json。
本地18项材料核对、1053件保护哈希通过；这不替代当前组件或产品证据。
新增批准依据是ADR-0223单次处置已消费且明确排除p06，以及实际组件硬门未闭合。
此ADR为完整可复核提案，不构成执行批准；主机信任、技术UNKNOWN与Win7边界保持。

## ADR-0225 ENGINEERING_02完整准确数据闭包修复及未派发恢复替代验证

- 状态：Accepted（2026-10-10，负责人时区；准确批准记录047e3faa…，任务§116）
- 范围：ENGINEERING_02 §114–115；已批准固定Win10工具及完整产品阶段

p06当前组件观察和准确锁通过，本地必需检查完成后源已冻结。
真实恢复消费在本地validate_spec拒绝两件已批准的数据文件，尚无恢复claim或SSH。
authority合并源路径时遗漏扩展data_only，缩减的本地正例没有覆盖真实完整行集合。
首失败ed6e777c…和w05 HALTED保留，不将本地验证错误描述为目标组件失败。
不得覆盖p06或恢复w05；当前旧PID状态与历史退出UNKNOWN，不推断Kill。

本提案一次批准原52类p07–p09的156条完整工具/测试副本及准确数据消费修复。
三个顺序槽位明确为w06/P6/B28/B29、w07/P7/B30/B31、w08/P8/B32/B33。
只合并Accepted范围列明的闭合数据名，保留准确路径、字节、哈希、reparse、批准与范围拒绝。
冻结前以生产真实源→载荷→spec/catalog→validate_spec路径检查完整恢复数据行，不派发网络或claim。
保留全部原113/75/21及128/88/31/33检查与安全反例，新增完整正例和陌生/缺失/错配数据拒绝。
既有准确C15锁和bootstrap锁保持原字节、当前原始观察和完整批准链，不重跑元数据获取。
没有新运行时、提供者、组件、系统设置或权限；三类原生相关源只复制，原产品包不改。

源/本地周期6→9、轮次目录5→8；最多三个新版本，原实际窗口上限仍两件，所有旧版本与HALTED保持。
仅普通工具失败已定位并定向修复、前轮实际进程树已结束或未启动时进入下一槽位。
两次同类未闭环先最小诊断；身份、完整性、必需审计、权限和未知生命周期仍停止并裁决。
不重复已消费调用，不恢复HALTED，无p10/w09。
整个阶段只允许一次30秒准确恢复和最多一次Kill，仅PID28868/创建ticks639272795733065333；准确组件/镜像/所有者/冻结命令成立才同句柄等待最多10秒。
后续普通替代只可精确继承已完成该动作的直接证据，并重新取得当前只读生命周期，不再次Kill。
每个实际新轮的两只读门、实际PS5.1、完整工具/普通S2/SYNC/UIA/调度器S3、十请求与正常停止保留。
原344会话、206855142上传字节、32请求、2SYNC、两实际窗口及七天截止不增。
已消费7SSH，其余0；原组件观察保留，未派发恢复只能由新轮明确替代，不重用旧spec。
准确材料155143字节/SHA ef9eab85a28acebefae18a2c9c18b3b2979a0e1648c19739850695b48af8168a，
位于product-phase-r1/planning/complete-data-catalog-replacement-r1/complete-data-catalog-repair-and-replacement-scope-v3.json。
未提交v1/v2保留；三个新源/新轮未创建，1518件保护及准确范围复核通过，不能升级为目标产品或Win7证据。
ADR-0224明确排除p07，当前源上限6已消费，因此此新增版本与轮次需要准确负责人裁决。
批准后范围内动作直接完成；仅越界、到限或适用安全硬门再裁决，主机信任和技术UNKNOWN边界保持。

## ADR-0226 ENGINEERING_02完整归档消费者修复及有界剩余产品阶段

- 状态：Accepted（2026-10-10，负责人时区；准确批准记录5b2b5e11…，任务§119；原提案正文保留）
- 范围：ENGINEERING_02 §117–118；固定Win10工具及不变r4完整产品阶段

w08当前PS5.1、环境及新部署前序通过，归档包装器退出1。
原始stderr只含ARCHIVE_STAGE_FAILED，准确子身份、held退出与具体错误UNKNOWN。
开发机冻结源码探针确认类型和当前根消费缺口，不能代替目标根因。
p07至p09三个获批源槽位已用完，原w06至w08 HALTED保持。
ADR-0225明确无p10/w09，不能借用其范围继续新实施或远端调用。

本提案一次覆盖完整剩余工具修复、失败取证和不变产品验证。
明确p10至p15的六组52类工具与测试副本，共312条路径。
另有一条当前归档实例及既有ZIP只读前检源，共313条实施路径。
47类工具与测试在冻结前同范围修复，五类库/proof/原生相关源只复制。
保留113/92/21和128/88/31/33全部检查及原安全反例。
新增真实完整spec/catalog、当前归档索引、全部哈希消费与子失败取证检查。
新索引schema_version为2，准确绑定类型、当前根、阶段批准和现有ZIP来源。
新Windows路径用实际单反斜杠值绑定，原输入字节不回改。
不修改产品、原生组件、运行时或既有准确组件锁。

顺序槽位为p10/w09/P9/B34/B35至p15/w14/P14/B44/B45。
每个producer和CMD均按材料准确枚举。
源/本地周期9→15、轮次目录8→14；最多三个实际新部署根。
原实际执行窗口仍最多两次，每次两小时。
源码槽位不授予额外窗口或重置累计限额。
普通失败已定位并闭合实际生命周期，才可进入下一槽位。
两次同类未解释失败先最小诊断，全部适用安全硬门保持。
无p16/w15、重复claim或旧HALTED恢复。

所有新写入前，唯一一次60秒SSH只读观察当前归档生命周期和P8准确原始文件。
核对固定主机、管理员、原组件锁、准确旧自身6504/ticks639272877649043514及冻结归档命令。
核对匹配旧Electron镜像和StageArchive参数的当前实例集合。
只有完整当前观察证明全部匹配实例不存在，才允许新根后续动作。
字段缺失、不可访问、身份错配或仍存活均停止，无终止或收养权限。
这是新当前生命周期门，不补造旧held退出，不改判历史失败。
新Kill额度0，原w06唯一准确Kill与旧超时UNKNOWN均保留。

已有P8 ZIP作为只读来源，每次使用前重验准确字节。
101330419字节/e96fdf96…；不重新上传或复制ZIP。
每个全新根独占展开784件产品文件和73件宿主文件。
准确产品与宿主总量466979510字节，最多三根1400938530字节。
宿主来自同一刚核验的新产品闭包，并逐件复核复制SHA。
原原生及proof复制上限独立保持，既有P8和旧证据不写入或清理。
新包装器在失败前保留有界原始输出及准确子PID、ticks、命令、镜像与held等待结果。
当前未知生命周期仍停止，失败输出不丢弃，不以退出0替代完整证据。

后续完整工具准入、普通S2、直接报告、最短产品链路、十请求/八phase、SYNC、UIA和调度器S3均保留。
完成真实退出按钮、正常停止、原始文件核验与当前技术复核。
负责人验收与Win7证据不由执行代理签发。
当前25会话、102144334上传字节及177787原生与输入复制字节不重置。
原344会话、206855142上传字节、1048576原生与输入复制字节保持。
原32请求、2SYNC、两窗口及2026-10-18T00:01:08.277195Z截止不增。
所有逐项claim、字节、身份、审计、预算和期限门继续适用。

准确材料266023字节，SHA256 cafa7ced87edddee155d0fca7d85e4e1cf5b1cc443281f9a0e6068e98db4e87a，
位于product-phase-r1/planning/archive-consumer-recovery-phase-r1/complete-archive-consumer-recovery-phase-scope-v2.json。
开发机749项方案核对、4657件历史保护文件哈希PASS；未提交v1保持。
新源码与新轮尚未创建，本Proposed ADR不构成执行批准。
批准后范围内直接完成，仅越界、到限、期限或适用安全硬门再请求裁决。
不增加系统修改、组件、终止、清理删除、Git或Win7权限。
主机信任裁决保持，技术主机完整性UNKNOWN及全部首失败保留。

## ADR-0227 ENGINEERING_02空输出Hash修复与当前归档生命周期准确裁决

- 状态：Accepted（2026-10-10，负责人时区；准确材料aff010e6…，负责人准确批准，任务§121）
- 范围：ADR-0226完整剩余阶段中的w10当前未知生命周期硬门；原产品和组件不变

p11实际PS5.1解析和新P10部署通过，归档生产器写出809字节完整784/73报告。
包装器最终诊断Hash空缓冲触发ComputeHash重载歧义，未留下子创建ticks及held退出。
原CALL_FAILED、w10 HALTED、报告PID21280与UNKNOWN保持。
现有完整阶段明确当前未知生命周期须准确裁决，不能直接进入下一源槽位。

本提案仅增加一个准确只读源路径及一次60秒SSH观察，不重复原完整阶段授权。
材料绑定21476/ticks639272915003213634、报告PID21280及冻结命令/镜像/组件/原始文件SHA。
新只读有效期为批准后30分钟，原2026-10-18截止和全部累计限额不增。
先记录自身实例、解析固定源，最多256项powershell/electron完整当前观察。
只读核验已有P8 ZIP、P10准确生产器、索引和原始结果；无新Kill、收养、远端写入或产品。
存活匹配、字段缺失、访问失败、复用歧义或完整性错配继续停止，无重试。
只有完整当前匹配实例为空，才允许原已批准p12–p15和剩余两新根继续。
这只建立新的当前生命周期结论，不能补造历史held退出或恢复w10。

同范围修复保留空UTF8 Byte[]为单一数组对象，显式拒绝null并使用准确Byte[] ComputeHash。
准确两个函数替换和完整拟议源已提供为JSON可审查数据，冻结p11不修改。
实际PS5.1先测试当前冻结真实函数的空/非空缓冲与准确SHA，再启动归档消费者。
该夹具每轮最多一次30秒，计入既有每轮会话上限。
原52类消费者、47可编辑/五不可变类、208剩余源路径、四槽位均不增加。
保留全部原安全反例、首失败、冻源、UNKNOWN和HALTED。
随后在原限额内完成全工具、普通S2、SYNC、最短链路、十请求/八phase、UIA和正常停止。
后续未知生命周期等硬门仍须裁决，本提案不是全局豁免。

当前32SSH、3上传、3只读，共38会话；请求、SYNC和窗口均0。
原344会话、206855142上传字节、1048576复制字节、32请求、2SYNC和两实际窗口不增。
源版本15、实际新根三及原期限不增，不创建p16或恢复任何旧轮。
准确材料55748字节/aff010e63ab979501addc97272485e09d62f3339492ecde6868aa2efb15f6ec1。
开发机19项核对、5786件保护哈希PASS；拟议源未创建、未派发，不构成目标证据或执行批准。
Win7、系统设置、清理、删除、产品/原生改动和Git交付不在范围内。

## ADR-0228 ENGINEERING_02生产器摘要修复及一次额外部署根

- 状态：Accepted（2026-10-10，负责人时区；准确材料1c223268…，直接负责人回复“批准”，记录73f81df9…，任务§123；原提案正文保留）
- 范围：ENGINEERING_02 §121.4–122；仅增补已用完的部署根额度，原完整产品阶段和目标保持

p13/w12已在实际Win10完成23源解析、空/非空SHA与完整字符捕获夹具、784件产品及73件宿主归档合同和工具校验。
mode-prepare因冻结生产器保留旧十二工具摘要而拒绝，准确master摘要与批准时间仍有效。
原始1278字节/04ef141c…记录子28212/ticks639272944710167788同held句柄exit1及退出ticks，关闭错误为空。
准确第11行拒绝先于内部Node第17行启动；产品、普通入口、UIA和SYNC均未执行。
首失败、冻结p13、w12 HALTED、原窗口与全部历史UNKNOWN保持。

原ADR-0226批准三个新部署根，P10/P11/P12已使用；源槽位和剩余窗口不授予第四根。
本提案只将这项根上限3→4，最多新增一根。
相应产品/宿主展开总上限1400938530→1867918040字节，每根仍准确466979510字节。
既有P8 ZIP只读重验，无新ZIP上传或复制，不改产品和原生字节。
原生/proof/输入独占复制预算独立保持1048576字节；新增一根和两个桥接共290913，累计1002061，余46515。

原p14/p15的104条工具与测试路径、47可编辑/五不可变类、源上限15及目录14不增。
p14已在原本地范围修复生成顺序：准确当前摘要同步生产器后，才冻结上传SHA和完整源清单。
保持其他时间、review、版本、身份、政策、审计和完整性判据及全部反例。
实际PS5.1同一30秒夹具新增完整生产器条件提取，验证当前值及七个拒绝反例；只构造内存条件数据，不生成真实批准或窗口。
现有生命周期诊断加入本次父/子准确实例与冻结命令，当前存活、字段未知或复用歧义继续停止，新Kill为0。

首选p14/w13/P13/B42/B43；p15/w14/P14/B44/B45仅可在前者未消费新增根和剩余窗口、普通失败解释且准确生命周期闭合后替代。
两槽位合计最多一个新增根及原最后一个两小时主窗口。
无第五根、第三窗口、p16/w15、自动重试、重复claim或旧HALTED恢复。
同类两次未解释失败先最小诊断；适用安全硬门继续裁决。
批准后在已有源路径绑定准确新增额度材料和真实批准哈希，再完成定向检查并冻结实际源字节。
原Accepted材料和原三根值不修改，生效额度只由准确新增批准覆盖。
每项新claim绑定被冻结的额度守卫及真实增补批准，先核验全阶段、当轮、类别和剩余字节预算。

当前57SSH、6上传、3只读SFTP，共66会话；上传104904124字节、独占复制711148字节，主窗口1、SYNC与请求0。
原344会话、206855142上传、1048576独占复制、32请求、2SYNC、两实际窗口和2026-10-18T00:01:08.277195Z截止不增。
继续原完整工具、普通S2、S3、SYNC、最短产品链路、十请求/八phase、真实退出按钮、UIA、原始审计与正常停止。
负责人最终验收、Win7及发版仍单独保持NOT_PERFORMED。

准确材料66689字节，SHA256 1c2232689ab6f651706493f1c2dca87d9ca8633fde110b91aea919802e777be1，位于product-phase-r1/planning/producer-digest-and-last-root-amendment-r1/complete-producer-digest-and-one-root-completion-scope-v1.json。
开发机116/106/21项检查通过，四组128/88/31/33按准确未变字节标INHERITED_EVIDENCE；6830件保护哈希PASS。
p14未冻结，额外根、新调用及新真实窗口未执行；当前原三根拒绝门仍有效。
只有这项准确增补获批才继续额外远端部署，范围内动作直接完成。
不新增组件、终止、系统修改、清理删除、Git或Win7权限；全部冻结输入、首失败、UNKNOWN和HALTED保留。

## ADR-0229 ENGINEERING_02报告父目录修复与准确P13物理闭包复用

- 状态：Accepted（2026-10-11，负责人准确结构化批准）
- 范围：ENGINEERING_02 §123.2–124；当前bootstrap硬门、最后p15源槽位和一次新增控制窗口

p14实际Win10完整生产器八条件夹具通过，旧摘要拒绝闭合。
784件产品及73件宿主归档合同、实际PS5.1与Node16工具校验通过。
mode-prepare当前错误为tool-checks父目录缺失；冻结目录创建清单遗漏，而生产器Plain/Save要求先存在。
入口23084/ticks639272967918633659和子16692/ticks639272967928399981绑定原始1457字节/76c62ae3…。
子同held句柄exit1及退出ticks准确、关闭错误为空；原失败与w13 HALTED保留。
前原生内部Node检查的PID/ticks/独立held退出未发布，仍UNKNOWN；静态后续错误位置不能补造当前实例记录。

ADR-0228允许的第四根和最后原主窗口均已使用，并排除消费之后的p15替代。
本提案不增加物理根，改用准确已展开P13中的867件不变产品/宿主/原生与输入文件。
原产品、宿主、输入、旧工具、批准、窗口、CMD、producer及证据保持只读。
新p15/w14/B44/B45只在准确新工具摘要/producer/bridge/pin/报告/证据路径执行；所有目的必须不存在。
原p15物理P14映射仅在本次准确批准后覆盖为P13，旧Accepted材料及历史映射原文保持。
新任务为A9-E02-Product-P13-B44/B45，producer为admission-v7-w14，CMD为run-product-dispatcher-v7-w14.cmd。
产品/宿主不重新展开，不上传或复制ZIP；原生/输入不再复制到根。
仅两桥接复制113126字节，累计1002061≤1048576，既有字节预算不增。

固定Administrator@192.168.1.4，先唯一60秒当前只读生命周期、组件、867文件、精确目录计数、空间和新命名空间门。
当前匹配集合包含准确父/子、冻结外层命令及P13内部Node authorize-admission-start参数，最多256项完整powershell/electron观察。
只认完整可访问当前集合为空及准确主机/SID/运行时/大小/SHA/非reparse；仍存活、复用歧义、UNKNOWN或错配停止。
第一次写入时新门最多早于300秒；历史bootstrap独立实例UNKNOWN、首失败和HALTED不回改。
无新Kill、收养、组件登记/替换、系统修改或安全豁免。
只读源以现有p15生成器派生的transport数据创建，不增加第53条实现路径。

在原52路径、47可修复/五不可变类内修复报告父目录及完整消费者映射。
前原生失败先发布实际bootstrap retained PID/ticks/held退出/关闭错误，再保留原错误拒绝；正常成功回复保持。
原摘要同步、八条件拒绝、空/非空/null/ASCII/中文/多缓冲区夹具与全部身份/审计/生命周期/路径反例保持。
同一30秒PS5.1夹具新增真实Plain/Hash/Save目录验证：缺父目录拒绝、准确创建顺序、两件公开UTF8/SHA记录及重复创建拒绝。
只写固定tool-checks-layout-fixture-w14内最多三目录/两文件8192字节；无原生加载、子进程、产品或删除。
新只读物理消费者严格绑定准确源/批准/原报告/867件文件，旧StageArchive和schema反例保留且不派发覆盖旧闭包。
完整目录、生产器及真实spec/catalog、新旧tuple和全部52类消费者在冻结前检查；源版本上限15、目录14不增，无p16/w15。

签发主窗口上限2→3，仅新增一次两小时；签发总时长14400→21600秒。
实际完整产品批次上限2仍保持；旧窗口均保留消耗，原累计不重置。
四物理根上限、344会话、206855142上传、1048576独占复制、32请求、2SYNC和2026-10-18T00:01:08.277195Z截止保持。
本轮仍最多112SSH/12上传/48只读及172会话；当前83，完整本轮保守累计255≤344。
原普通S2/S3、SYNC120/180、最短两请求、十请求/八phase、隔离UIA、真实退出按钮、原始审计/进程树与正常停止全部必跑。
任何边界、预算、期限或安全硬门停止；无自动重试、旧claim重发、HALTED恢复、第五根或第四窗口。
技术报告不签发负责人最终验收、Win7或发版结论。

准确材料45671字节，SHA256 25ed0d3a9d80a3d87ee6165fe62773ff21401778b9658ea42cda270378fa757a，位于product-phase-r1/planning/producer-parent-closure-reuse-recovery-r1/complete-report-parent-and-reused-root-completion-scope-v1.json。
目录缺口已用冻结真实创建器本地复现，867件复用表按当前master和索引生成；7713件历史保护哈希PASS。
p15和新的当前门/命名空间/窗口未创建或派发；JSON材料及本Proposed ADR不是执行批准。
所需准确裁决是新复用tuple、第三控制窗口和当前bootstrap生命周期进入条件，主机信任与原产品范围不重批。
批准后这项准确阶段内动作直接完成；所有冻结输入、首失败、UNKNOWN与HALTED保持。

## ADR-0230 ENGINEERING_02冻结前只读变量合同与完整P13替代阶段

- 状态：Accepted（2026-10-11，负责人准确结构化批准）
- 范围：ENGINEERING_02 §125.2–126；准确新p16/w15、冻结前有界解析合同与原剩余完整技术验证

p15在原52路径完成父目录、前原生取证、只读物理消费者及预算守卫；开发机118项Node、116项消费者、21项审查测试及四组驱动自检通过。
52源一次冻结3c9e5d10…/087fdbb1…；原产品、原生、组件和五类不可变源未改。
w14唯一实际只读门因赋值$host触发PowerShell只读Host错误，是本次主代理生成代码缺陷。
入口35944/ticks639273006773611955、81字节stdout和979字节stderr绑定首失败，HALTED不可恢复。
没有新远端写入、上传、窗口、产品或SYNC；完整当前门未发布，不能将部分执行或开发机检查登记为Win10 PASS。
当前入口独立held退出UNKNOWN及全部历史UNKNOWN保持。累计84会话、四新根、两窗口消耗不重置。
ADR-0229排除p16/w15；最后源及单次门已消费，不能覆盖冻结源或重发原调用。

只新增原52类的准确p16路径、47可修复/五不可变复制，以及w15/B46/B47/P13映射；源/本地15→16、目录14→15。
新producer为admission-v7-w15、CMD为run-product-dispatcher-v7-w15.cmd；旧p15/w14、P13工具和证据只读保留。
全范围冻结前必要修复及全部安全/身份/审计/路径/哈希/生命周期反例继续；无p17/w16或新工具、产品、原生、运行时/API。

先最多两次固定Win10解析合同mini-attempt，各30秒、各限一次，完整52源JSON快照及所有原始首失败独立保存。
实际PS5.1只解析输入语法及Assignment/ForEach/Parameter目标，按当前Constant/ReadOnly变量名称检查大小写与作用域。
输入源和负例不执行，只有固定null语言sink探针在内存运行；不访问旧PID、写远端、加载UIA/原生或启动子进程/产品。
原w14完整Host反例必须拒绝，普通任务变量和合法null赋值必须通过。
只有准确普通语法/只读目标失败、正常有界结束和完整结构化原始材料才允许同范围修复后进入第二独立mini-attempt。
任何未知stderr、超时、身份、安全、审计或未知生命周期立即停止；第二次失败到限停止。
成功后最终52源必须同字节才冻结一次，不继承变更逻辑。仅明确验证的当前parser实例/命令SHA和批准/路径配置数据可后续派生。
唯一60秒当前门loader再次检查其准确最终AST，再观察准确w13/w14/所有parser命令与实例、867件闭包、组件、状态、空间和新路径。
当前匹配必须为空，历史UNKNOWN不回改，第一次写入距完整当前门不超过300秒。
原哈希/字符捕获/生产器八条件/真实目录读写夹具、只读物理消费者、完整新源/批准/spec/catalog绑定仍必跑。
P13产品/宿主/原生/输入不重新展开或根复制，仅新工具与Bridge/证据命名空间；两Bridge复制累计1002061≤1048576。

仅当轮diagnosis上限2→3、UIA8→7，仍45准入/6启动/48请求/3停止，合计112 SSH；12上传/48只读/172会话上限保持。
原344会话、206855142上传、1048576组件复制、32请求、2SYNC、两实际完整产品批次和2026-10-18T00:01:08.277195Z截止均不增。
ADR-0229三签发窗口/21600秒上限不增，目前只消费2；只能使用原剩余第三两小时窗口。
新物理根0、总新根4不增；既有w08/P8归档源按原合同独立保留，不混入本增补的新根计数。
普通S2/S3、SYNC120/180、最短两请求优先、十请求/八phase、隔离UIA/真实退出按钮、原始审计/进程树和正常停止全部继续。
技术结果不替代负责人最终验收、Win7或发版；无Kill、系统/ACL/组件改动、清理删除、Git或Win7。

准确v2材料58716字节，SHA256 1cf6211c5101723dc8b7002a52f03c66b3e70169a8671df184328645f64e424d，位于product-phase-r1/planning/readonly-variable-contract-completion-r1/complete-ps51-readonly-variable-contract-and-reused-root-completion-scope-v2.json。
9435件历史与当前首失败保护快照b9e7e7f5…；只读修复与parser以JSON数据提案保存，未创建新实现或调用。
旧未提交v1的说明/计数/类别矛盾已在批准前修正，原v1保留且不派发。
本Proposed ADR不授予执行；只需一次准确完整阶段批准。批准后范围内直接完成，仅越界、到限、期限或安全硬门再裁决。

## ADR-0231 ENGINEERING_02当前容量门失败后的一次只读容量诊断

- 状态：Accepted（2026-10-11，负责人准确批准一次30秒容量只读诊断；不恢复w15）
- 范围：ENGINEERING_02 §128–129；固定目标的一次30秒只读补证，冻结p16/w15保持

ADR-0230准确批准后，p16完成同范围Error参数改名；第二次实际PS5.1合同通过26件输入与全部负例，52源同字节冻结。
w15唯一当前门随后返回CURRENT_REUSE_FREE_SPACE；C盘低于既定4294967296字节，准确剩余字节未输出。
入口37784/ticks639273030950218840独立held退出UNKNOWN；原始stderr、CALL_FAILED及首HALTED保持，完整生命周期/物理闭包不改判PASS。
本轮3SSH，无上传、远端文件写入、主窗口、普通入口、UIA、产品或SYNC。累计87会话、四新根、两窗口及所有历史不重置。
原§126–127三次诊断、唯一当前门已消费，p16已冻结、w15已HALTED；新只读查询和bootstrap尚未获准。

仅提出一次30秒SSH容量观察，固定Administrator@192.168.1.4/StrictHostKeyChecking=yes，批准后30分钟内且原七天截止不延长。
先记录自身PID/创建时间，核验固定主机/SID/Session0、已有PS5.1/.NET4.8.1与准确组件锁，然后读取Get-PSDrive C可用/已用字节。
唯一可执行源为材料绑定的固定容量观察及既有Text包装器；不执行产品、原生、冻结p16输入源码或任意外部源。
不访问旧PID，不枚举产品目录，不授予当前准入或产品结论；历史及当前入口独立held退出UNKNOWN保持。
只新增一个明确本地bootstrap路径product-phase-r1/planning/space-capacity-hard-gate-r1/readonly-capacity-probe.py，批准前不创建。
历史w15仅用于一次补证，诊断3→4；当轮112SSH和全阶段224SSH/344会话上限不增，其他HALTED链路不恢复。
stdin≤1048576、命令≤7899字符、原始双输出≤65536字节；准确claim先于启动，任何失败/超时/未知stderr或身份/完整性/运行时硬门立即停止，无重试。
原4GiB门继续有效，不降低或绕过；无上传、远端写入、任务/入口/UIA/SYNC/产品/Kill、系统/ACL修改、清理删除、Git或Win7。
无p17/w16、主源码版本、主轮次、主窗口或物理根增补。全部冻结、首失败、HALTED和历史UNKNOWN保留。

准确材料once-current-capacity-readonly-judgment-scope-v3.json为4186字节/SHA256 c688502b88f6771789708951301d482782bf82ac962ff7036b2f2ce2eba7340e，位于product-phase-r1/planning/space-capacity-hard-gate-r1。
19项本地材料检查通过；旧未批准v1/v2保留且不派发，9435件历史及68件当前保护对象哈希通过。
本Proposed ADR不授予执行权限；仅在负责人准确批准后创建bootstrap及一次诊断claim。观测结果用于下一步具体容量裁决，不能恢复w15。

## ADR-0232 ENGINEERING_02停止工具扩建并保留唯一产品收口机会

- 状态：Proposed（2026-10-11，投入方向及§131.1冻结判据已由负责人指定；未来唯一执行范围未批准）
- 范围：ENGINEERING_02 §131–131.1；本地只读分析与方向记录，不授权实现或远端

负责人要求停止扩建验证工具，仅保留一个工作日内、一次替代主批次的产品收口机会。
先从真实普通桌面入口完成Boot与Background两项请求，身份/审计/退出证据通过后才继续原十请求/八阶段和完整收口。
安全、完整性、必需审计、生命周期和Win7实机硬门不弱化；字节未变的合法继承证据不冒充新产品PASS。
p16已冻结、w15 HALTED；当前C盘缺原4GiB入口门229416960字节，88会话和全部历史不重置。
原单轮工具/复制/证据预算合计539081190字节；临时目录与物理分配的真实增长UNKNOWN，不以上限代替实测需求。
已有资料没有身份/大小/保留/恢复依据齐备的非关键C盘可删目标，删除清单为空。
现有冻结前入口仅覆盖PS5.1合同；必要目录/hash与隔离UIA实际能力依赖后续冻结/准入/master pin。
将它们全部前移需改动编排准入，当前没有同合同的无扩建已验证路径。因此建议暂停派发，不为此继续建设工具。
必要改动若需架构、依赖、权限、新检查种类或原预算增长，就保持暂停，不拆成新建设阶段。
输入、首失败、HALTED、UNKNOWN、源码、用户数据、数据库、候选和全部证据保留；不代填清理权限或降低4GiB门。
若前置缺口日后具体闭合且不需新建设，仅一份完整准确范围可激活保留的一次p17/w16选项；不逐文件/调用求批。
投入上限为8工作小时、一次主批次、一次最终冻结和最多2小时主窗口；再次工具缺陷保留首失败后停止，不自动追加版本/轮次/预算。
准确合并材料single-product-closure-decision-material-v1.json为25127字节/SHA7ded23de4ef61dadf28a0691a444582b8e5b77409d705d45fd793c00d2b3683a，位于product-phase-r1/planning/last-product-closure-strategy-r1。
材料标记执行未就绪；本Proposed ADR不授予新实现、远端、删除、冻结或替代批次权限。

2026-10-11后续判据澄清：负责人允许未改动的UIA、当批身份与退出动态准入在源码冻结后、首个真实产品请求前执行。
已知工具修复及其受影响的实际运行时检查仍须在最终冻结前完成；上述基于全部检查前移的编排暂停理由不再适用，原分析不覆盖。
该澄清不授权实现、远端、容量处理或替代批次；当前剩余前置缺口为准确非关键容量对象及保留/恢复依据，不能提交泛化删除授权。
19件既有源/测试/数据只表示新绑定消费者数量，不是19项新缺陷；不据此扩建工具。若容量处置不能具体闭合，则不派发产品。
已知报告目录修复的既有实际PS5.1夹具仍须最终冻结前完成；动态准入澄清不豁免这一项。只允许准确安排现有检查的必要顺序，若须重做架构、增加依赖或权限则停止。
真实判据记录638字节/5e6655d4…；更新同目录single-product-closure-decision-material-v2.json为26724字节/SHA256 e56c812785320ce3802f684838c546c99d906ccec5f9de87d9cf08b1076b7dba。
v2仅解除冻结顺序方面的建设要求，容量对象仍未就绪；后续唯一准确方案须合并容量处理、最小既有消费者绑定、必要检查、新不可变输入与完整产品链路。

## ADR-0233 ENGINEERING_02唯一收口前的只读容量对象硬门裁决

- 状态：Accepted（2026-10-11，负责人准确结构化批准v2一次只读盘点；无下游删除或主批次权限）
- 范围：ENGINEERING_02 §132；一次固定目标只读查询，不是新工具建设或主批次

负责人要求执行完整收口方向，但准确容量对象为空且最近原4GiB门FAIL；此前“新远端动作在准确材料获批前不执行”的限制保持。
只补一次必要事实：固定Administrator@192.168.1.4，复用p16冻结Text/有界捕获和已登记.NET4.8.1准确组件锁。
唯一60秒SSH观察C盘可用/已用空间及固定普通账户Local目录下A9-Engineering项目产物元数据；最多32根/16384条/深度16/正文25秒，不跟随reparse、不读项目内容。
无上传、远端写入、删除、移动、归档、旧PID查询、Kill、任务、入口、UIA、SYNC或产品；未知已分配/回收量保持UNKNOWN，不能自动选择删除对象。
批准后30分钟内一次、无重试；原阶段截止与总限不增，最多新增1SSH使88会话→89，不借旧w15已消费调用或诊断额度。
新claim在同任务planning命名空间记录，并纳入后续全阶段累计；不消费候选、主轮次或最后两小时窗口。
输入24989字节/源码18592字节/命令7382字符、双输出上限262144；原保护边界和全部历史保留。
准确材料once-capacity-object-gate-scope-v2.json为4177字节/SHA256 8f4da9af1f826affd5ae04c18f4201bb34c289aa2827a7c3be3e61901e0a4264，位于product-phase-r1/planning/last-product-closure-strategy-r1/capacity-object-gate-r1。
12项本地核对PASS；批准时新源码实际PS5.1检查、查询与产品NOT_PERFORMED。本批准只激活上述准确v2一次只读查询，下游删除和产品范围不激活。

## ADR-0234 ENGINEERING_02容量通过后的唯一完整产品收口阶段

- 状态：Accepted（2026-10-11，负责人准确批准§134/v2最后完整阶段；仅准确范围）
- 范围：ENGINEERING_02 §133.1–134；一次p17/w16、复用P13、原合同真实产品证据优先

ADR-0233唯一只读盘点已完成，Win10可用15301918720字节，原4GiB容量观察PASS。容量处置清单为空；全部25根KEEP，无清理或删除。
原累计89会话、p16冻结、w15 HALTED、请求/SYNC0和全部首失败/UNKNOWN保留。原日志与任务为唯一状态入口。
负责人允许未变UIA/当批身份/退出动态准入冻结后、首个产品前；已知修复与受影响实际运行时检查仍须冻结前完成。
现有目录/Hash夹具只需前置同合同调度；另有开发机直接复现的当前observed_at七位UTC消费缺口，仅两处复用校验/300秒比较精确保留100ns，不重写全局时间库。
新p17的52路径明确枚举，22件消费者/测试只做上述窄改与新tuple/准确批准/累计计数绑定，30件准确复制。产品、原生、运行时、依赖、组件锁、权限和检查种类保持。
使用新w16/B48/B49/admission-v7-w16/CMD，全部新命名空间排他；旧P13产品/宿主/原生867文件当前直接核验，无新根或ZIP展开。
已知修复、本地消费者及一次30秒语法/只读合同、一次60秒当前生命周期/物理/容量门、一次30秒已有目录/Hash夹具完成后，52同字节最终冻结一次。
目录夹具准确3目录/2公开JSON至多8192字节；其余动态准入按原安全判据在产品前直接验证。不允许任意冻结前EXEC或新增通用工具。
普通桌面先Boot/normal-short、Background/normal-short，两项身份/审计/实际退出证据通过后才继续十请求/八阶段、SYNC120/180、UIA真实退出与正常停止；首两项包含在十项内。

批准后上限8小时且不超原2026-10-18T00:01:08.277195Z，一次替代主批次、一次源版本/轮次/最终冻结、一次剩余第三主窗口至多2小时。源16→17、目录15→16，除此不扩预算。
新主批次111SSH/12上传/48只读至多171会话，与已消费准备SSH1合计原112SSH/172会话；原累计最多344会话与224SSH/24上传/96只读保持。
最坏累计260会话、上传108117177/复制1002061字节、请求16/SYNC1，均在原206855142/1048576字节、32请求/2SYNC内；四物理根、三签发窗口/21600秒、两实际完整产品批次不增。
固定Administrator@192.168.1.4/StrictHostKeyChecking=yes；现有准确.NET4.8.1/PS5.1及C15/C16锁保留，可信选择不等于技术主机完整性PASS。
任何硬门、工具自身缺陷再次失败、时间/预算/期限到限或需要架构/依赖/权限/新检查种类，都保存首失败并停止，不自动追加p18/w17、重试、预算或建设任务。
范围内动作获批准后直接完成，只在越界/到限/硬门裁决；不逐文件或调用审批。无Kill、系统/产品/原生修改、清理、删除、Git或Win7。

准确材料single-final-product-closure-phase-scope-v2.json为89474字节/SHA256 44c7f94c3be3e9022c91887a51404ee55f935c2962e65ee6c3ca5b63fc46430d，位于原product-phase-r1/planning/last-product-closure-strategy-r1/final-closure-stage-r1。
24项材料核对与71件准确引用/保护哈希PASS；未批准v1保留且不派发。三项实际运行时检查、新源及产品NOT_PERFORMED。
本Proposed ADR不授予执行。既有ADR-0230明确排除p17/w16，ADR-0233只含已消费只读盘点；负责人此前要求准确材料批准后才执行新远端及替代批次。
Win10阶段PASS仍不替代Win7实机、负责人最终验收或发布，整体COMPLETE按原任务合同裁决。

## ADR-0235 ENGINEERING_02同一最后阶段的三处本地测试输出绑定修正

- 状态：Accepted（2026-10-11，负责人准确批准同一阶段三件测试输出绑定修正；原截止和预算不增）
- 范围：ENGINEERING_02 §136；同一p17/w16完整阶段，不增版本、批次、时间或预算

ADR-0234已准确批准唯一完整阶段；p17/w16只有本地准备，实际三门、最终冻结、主窗口与主批次未消费。
原52源分类漏掉三件本地输出消费者：win10-input-binding.test.mjs写死p16/node，win10-entry.test.mjs和win10-contract.test.mjs写死p03/node。
Node118有6个CLI因SCOPE_OUTPUT失败，首输出保留；124消费者、21报告及原四组驱动检查通过。当前只复制约束不允许自动改源，不能扩展输出权限、增加重定向工具、跳过必跑项或冒称继承PASS。
仅拟将三件各一行输出目录改为既有w16/local-checks/node-fixtures；输入、断言、行为和检查种类不变。
52路径不增，22→25窄改、30→27准确复制；无新工具、架构、依赖、API或权限，原生、产品、宿主与组件锁不改。
仍同一p17/w16/B48/B49、P13、唯一主批次与一次冻结，普通入口两请求优先和完整十请求/八阶段要求不变。
原8小时截止2026-10-12T07:29:00.005280+00:00不重发，111SSH/12上传/48只读、累计344会话及所有字节/请求/SYNC/物理根/窗口上限不增。
若不批准，建议暂停ENGINEERING_02，不追加版本、批次、预算、时间或建设任务；任何实际工具门失败、硬门或到限仍保存首失败停止。
准确完整修正版single-final-product-closure-phase-scope-v3.json为97195字节/SHA256 06e7ed5b381d632d6264cbdd2dd6884ae828b66a35cba969562282bc77dd42f3，位于原product-phase-r1/planning/last-product-closure-strategy-r1/final-closure-stage-r1。
准确原/新行和字节身份记录9182字节/e2c73213…；40项材料核对与70引用保护哈希PASS，三源未修改，远端0。
本Proposed ADR不授予执行权限；仅负责人准确批准同阶段修正后继续原完整阶段，不逐文件或调用求批。

## ADR-0236 A9-32 未知 Shell 观察门只由已核验目录列表解除，ENOTDIR 按路径不存在处理（ADR-0189 补充）

- 状态：Accepted（2026-10-12；负责人在聊天中对 F6 与 ENOTDIR 选择“独立复核前修复”方案 A，并批准新增此补充 ADR）。ADR-0189 正文保持原字节。
- 背景：F6 是已知限制。未知 Shell 之后，任何已核验的 `read`（包括读不存在的无关路径）都会清除 opaque 观察门。ENOTDIR 是另一条已知限制：路径某一级是文件时，核验函数只接受 ENOENT，ENOTDIR 会使观察门无法解除。
- 决定一：opaque 门只由持久化 `tool_end` 成功后的、已核验精确目录的 `list` 解除。`read` 只消除与其路径键相同的待核查路径，不解除 opaque 门。
- 决定二：ENOENT 与 ENOTDIR 都表示精确目标当前不存在。Core 对二者使用同一核验：工作区边界、软链接和未知目的地规则不变。父级是指向工作区外文件的软链接时，仍按越界阻断。
- 不变：其他读取错误、越界、取消、超时、残留和审计失败仍阻断。表 schema、recoveryRevision 哈希输入、IPC 和后续 Policy 与新目标绑定审批不变。
- 残余限制：本决定收窄 F6，没有消除它。未知 Shell 的影响范围未知，任何一个已核验目录的 `list` 仍可解除 opaque 门，包括无关目录。彻底解决需要与基线比较，另立任务。
- 编号：0236 取自核号结果。主工作区含未提交改动的 `DECISIONS.md` 最大编号 ADR-0235，其他本地与远端分支最大编号 ADR-0189。整合前须再次核号，被占用时按负责人裁决改号并统一引用。
- 证据（开发机，基线 `571ec550…` 加本轮未提交差异）：State 84、Core 218、Shell 133 项 PASS，`verify:quick` 退出 0。两个反例均断言失败：回退本决定一时 3 项用例变红，回退决定二时 2 项用例变红；原字节与恢复字节 SHA 相同，见 `.acceptance/a9-32-developer/mutation-results-r5.json`。ENOTDIR 在 Win7 NTFS 上的实际错误码 NOT_PERFORMED，真实 Electron、打包和 Win7 实机均 NOT_PERFORMED。

## ADR-0237 A9-32 前台 Shell 带 residueRisk 结束时，继续仍按未知结果处理（ADR-0189、ADR-0236 补充）

- 状态：Accepted（2026-10-12；负责人在聊天中对独立审核发现 R-01 选 B，并回复“B，补用例，登记并提交”）。ADR-0189 与 ADR-0236 正文保持原字节。
- 背景：前台 Shell 在清理进程树未确认时，以 `residueRisk: true` 写入 `tool_end`。`getTaskRecovery` 见到 `tool_end` 就清除该调用，不再计入 `unknownResults`。后果：该 Shell 可能仍在改文件，而继续没有启动观察门，副作用工具不被拦截。此缺陷来自 `d8fd760a…`，不是 ADR-0236 引入。
- 决定一：副作用工具（`shell`、`write`、`edit`、`delete` 等 `sideEffects` 集合内的工具）的 `tool_end` 带 `residueRisk: true` 时，`getTaskRecovery` 保留其 `tool_start`，继续计为 `result_unknown`。
- 决定二：保留后的条目沿用既有观察规则。`shell` 无路径，按 opaque 处理，只由已核验目录的 `list` 解除（ADR-0236）。带路径的副作用工具保留其路径，由对应路径的核验解除（ADR-0189）。
- 不变：只读工具（如 `read`）带 `residueRisk` 不计未知；无 `residueRisk` 的 `tool_end` 照旧清除。表 schema、`recoveryRevision` 哈希输入、IPC、Core 观察门逻辑不变。失败方向仍是阻断。
- 残余限制：与 ADR-0236 相同，任何已核验目录的 `list` 仍可解除 opaque 门，包括无关目录。
- 编号：0237 紧接 ADR-0236。整合前须再次核号，规则同 ADR-0236。
- 证据（开发机，macOS，Node 20.17.0，基线 `62a73f78…` 加本轮未提交差异）：State 88、Core 221、Shell 134 项 PASS，`verify:quick`、`docs:check`、`git diff --check` 均通过。新增用例：State 4（`it.each` 覆盖 shell/edit 带残留保持未知、无残留与只读带残留不计）、Core 3（R-03）、Shell 1（端到端：残留 Shell 之后写入被拦，`read` 不解除，`list` 后放行）。4 个反例均断言失败并恢复同一 SHA：回退本决定时 State 2 项与 Shell 1 项变红；审核者留下的 3 个存活反例（悬空软链接保护移除、`stat` 检查反转、`search` 解除 opaque 门）各使 1 项 Core 用例变红。见 `.acceptance/a9-32-developer/mutation-results-r6.json`。真实 Electron、打包、Win10、Win7 均 NOT_PERFORMED。

## ADR-0238 A9-33 WIN7-45 门 B：限定已直接证明范围签发，KL-12 作为排除项（A9-33 补充）

- 状态：Accepted（2026-10-16；负责人在聊天中回复“门B选A1：限定已直接证明范围签发，KL-12 列为排除项、保持 NOT_PERFORMED。”）。ADR-0155 保持 Proposed，本决定不引用它。
- 背景：WIN7-45 正式运行在 Win7 实机直接 PASS 25 用例/43 断言。独立复核结论 0P0/1P1/0P2，其 `recommend_gate_B=false` 针对未缩小的合同：A9-33 第 5 节第 90 行把真实 helper 启动后 ready 失败清理列为必须直接执行，第 4 节第 74 行要求缺项保持 FAIL/NOT_PERFORMED。负责人此前已明确接受 KL-12 延期。
- 决定一：门 B 按交接书第 11 节口径限定范围签发，结论为 `A9_33_WIN7_45_BATCH2_PASS_WITH_KNOWN_LIMITS`，绑定 source `ba042757…`、ZIP `ae1d4bb1…`、run `5773470e…`。
- 决定二：KL-12（`P1-KL12-CONTRACT-COVERAGE`）从本次门 B 裁决范围中排除，仍为 P1 / NOT_PERFORMED，按推进顺序第 6.7 节与覆盖台账第 8 节进入后续修复与补证。不声明原完整合同全部满足。
- 不变：独立复核原文与其 `recommend_gate_B=false`、原 43 条 PASS、全部历史 FAIL/UNKNOWN/HALTED 均保持。KL-3、KL-5、KL-6a、KL-7（含 a、b、c 边界）和其他适用限制继续随结论携带。运行时的未知生命周期、清理、身份、审计硬门不因本决定放宽。
- 未签：完整 Alpha 2、RC、ADR-0155、A9-32 `DEVELOPER_VERIFIED`。不授权合并、推送、发布和新的目标机或产品执行。
- 对缺口表的影响：G01、G02、G03、G06 的 D 码前置“批次 2 在 Win7 PASS 且门 B 签发”已满足。这四行各自的 L 限制随结论携带，是否关闭由完整 Alpha 2 对账裁决，本决定不自动关闭。
- 编号：0238 紧接本分支 ADR-0237。主工作区最大编号 ADR-0235。整合前须再次核号，被占用时按负责人裁决改号并统一引用。
- 证据（Win7 实机，WIN7-45 run `5773470e…`；回执在候选外）：`authority/OWNER_GATE_B_RECEIPT.json`，SHA-256 `e026583a…`，聊天消息精确时间 UNKNOWN，记录时间 2026-10-16T12:56:00Z。

## ADR-0239 Alpha 2 登记已知限制 F-01：Full Access 下 13 种启动器包装命令不再要求确认（ADR-0171 补充）

- 状态：Accepted（2026-10-16；负责人在聊天中回复“F-01 选 A：登记为已知限制，不在验收前修复。”）。ADR-0155 保持 Proposed，本决定不引用它。
- 背景：Q1 影响分析（开发机，在 Node v22.23.1 上对两个冻结 ZIP 内的 `core/dist/policy.js` 求值）发现，WIN7-42 到 WIN7-45 之间命令策略从“全文正则匹配”改为“只识别每个命令段的首个命令”。`start npm publish`、`cmd /c start reg add …`、`xargs npm publish`、`nohup npm publish`、`time npm publish`、`npx npm publish`、`npm exec -- npm publish`、`conhost reg add …`、`wmic process call create "reg add …"`、`start /b npm publish`、`start reg add …`、`start icacls …`、`cmd /c start npm publish` 共 13 种写法，WIN7-42 判确认，WIN7-45 判 `allow`（规则 `POLICY_FULL_ACCESS_ALLOWED`）。ADR-0171 写明“不宣称通用解析或沙箱”，但没有登记“包装器不确认”，所以该行为变化此前未登记。
- 决定一：登记 F-01 为 Alpha 2 已知限制。内容：Full Access 下，模型用上述 13 种写法发起发布、注册表或权限变更时，不出现一次性确认。
- 决定二：不在 Alpha 2 验收前修复。不改 `policy.ts`，不产生新候选，冻结的 WIN7-45 不变。修复是否做、何时做未裁决，本决定不授权任何实现。
- 决定三：随结论携带。完整 Alpha 2 结论（若负责人签发）必须写明 F-01，不得省略。携带方式与 ADR-0238 对 KL-3、KL-5 等限制的处理一致。
- 不变：ADR-0238 的门 B 结论与 43 条 PASS 不改。F-01 不是 A9-33 的 25 个用例失败，是相对 WIN7-42 的行为差异，由影响分析发现。ADR-0171 原文不改。新版新增的 21 种确认与 4 种纯数据放行（`echo npm publish` 等）不受影响。
- 编号：F-01 不属于 A9-33 套件，不占用 KL 编号；KL-13 起仍留给套件发现的限制。
- 证据层级：开发机，SURROGATE。运行环境是 Node v22.23.1，不是目标机的 Electron 22 / Node 16，也不是 Win7。语料不穷举。证据文件在候选外 `preparation/alpha2-impact-analysis-20261016-01/policy-diff-result.json`，SHA-256 `bea4153a…`。
- 未知：这 13 种写法在 Win7 实机上的实际判定 `NOT_PERFORMED`；其他包装写法 `UNKNOWN`；REVIEW、WORKSPACE_WRITE 模式的求值 `UNKNOWN`；实际危害与出现概率 `UNKNOWN`；WIN7-42 的 19 种 Git 形态原始清单未取回，`UNKNOWN`。
- 编号核对：0239 紧接本分支 ADR-0238。主工作区最大编号 ADR-0235。整合前须再次核号，被占用时按负责人裁决改号并统一引用。

## ADR-0240 Alpha 2 登记六项已知限制并延期到 RC，G16、G17 先做只读对照（ADR-0131、ADR-0238、ADR-0239 补充）

- 状态：Accepted（2026-10-16；负责人在聊天中回复“Q2 按推荐裁决：G10 企业 CA/代理、G13、G15、≤799px、A9-34、KL-12 登记为 Alpha 2 已知限制并延期到 RC；G16 和 G17 先做只读对照再定。请登记 ADR 和缺口表。”）。ADR-0155 保持 Proposed，本决定不引用它。
- 背景：缺口处置表 Q2 询问 L/S 类范围项是否登记为 Alpha 2 已知限制。执行代理在聊天中给出了逐项选项与推荐。证据层级为开发机与现有文档，绑定候选 WIN7-45（source `ba042757…`，ZIP `ae1d4bb1…`）。
- 决定一：以下六项登记为 Alpha 2 已知限制，延期到 RC。RC 另立合同，届时逐项重新裁决；本决定不预先承诺 RC 范围。
  1. 企业 CA 与代理（G10 的一部分）：在 Win7 上未验证，`NOT_PERFORMED`。普通真实 Provider 不在本决定内，仍属补证组 M5。
  2. POSIX Shell 与 PowerShell `/Command`（G13）：实际执行未验证。W41 只验证了确认拦截。Win7 上 Shell 检测只列出 PowerShell 与 CMD，`sh` 只出现在非 Windows 开发机。
  3. 启动与内存（G15，A9-17）：Alpha 2 不宣称启动与内存收益，Win7 与 Win10 采样 `NOT_PERFORMED`。
  4. ≤799px：沿用 ADR-0131，抽屉分支产品内不可达、未验证。
  5. A9-34 崩溃后清理出口：后台进程运行时应用崩溃，重启后该句柄保持待清理，Stop 被拒、退出被取消、对话与模式切换被阻断，产品内没有处置出口。触发条件须写入 Alpha 2 说明。手工恢复办法 `UNKNOWN`。A9-34 草案保持 `DRAFT_READY_FOR_REVIEW`，本决定不批准它。
  6. KL-12：沿用 ADR-0238 的排除项，P1 / `NOT_PERFORMED`，修复排在 Alpha 2 之后。
- 决定二：G16（A8-06 历史外部验收）和 G17（部署、回退、数据库备份、DPAPI、SBOM）先做一次只读对照，再由负责人裁决。对照范围：G16 为 A8-06 条款对 Alpha 2 的适用性；G17 为 A9 合同 Win7 硬门（SQLite 重启、损坏备份、旧版回退）对现有证据的覆盖，含 WIN7-42 数据升级到 WIN7-45 与回退的兼容性（两版 schema 版本均为 4，旧版读新版写入数据的容错 `UNKNOWN`）。对照完成前两项保持 `NOT_PERFORMED` / `UNKNOWN`。
- 决定三：对照完成前，Alpha 2 候选保持冻结的 WIN7-45。本决定不授权改产品字节。G17 对照若发现需改产品字节，须另行报告并由负责人裁决。
- 携带规则：完整 Alpha 2 结论（若负责人签发）必须写明上述六项，不得省略。携带方式与 ADR-0238、ADR-0239 一致。
- 不变：ADR-0238 的门 B 结论与 43 条 PASS、ADR-0239 的 F-01、KL-3、KL-5、KL-6a、KL-7（含 a、b、c）和其他既有限制均保持。
- 未签：完整 Alpha 2、RC、ADR-0155、A9-32 `DEVELOPER_VERIFIED`。不授权实现、补证执行、目标机动作、合并、推送或发布。M1～M5 与 A9-36 仍待后续批准。
- 编号核对：0240 紧接本分支 ADR-0239。主工作区最大编号 ADR-0235。整合前须再次核号，被占用时按负责人裁决改号并统一引用。

## ADR-0241 Alpha 2 登记 G16 为 N/A，G17 升级回退补 M6，四项延期到 RC（ADR-0240 补充）

- 状态：Accepted（2026-10-16；负责人在聊天中回复“G16 按推荐登记为 N/A；G17 按推荐：升级回退补最小 Win7 组 M6，DPAPI、备份生成、诊断包导出、SBOM 内容适用性延期到 RC 并登记已知限制。请登记 ADR 和缺口表。”）。ADR-0155 保持 Proposed，本决定不引用它。
- 背景：ADR-0240 要求对 G16（A8-06）和 G17（部署、回退、备份、DPAPI、SBOM）先做只读对照。执行代理出具[对照报告](reports/2026-10/a9_alpha2_comparison_g16_g17_2026-10-16.md)，证据层级为开发机，绑定候选 WIN7-45（source `ba042757…`，ZIP `ae1d4bb1…`）；独立审核由 codex 完成一轮，8 条发现经执行代理复核后采纳。
- 决定一：G16 登记为 `N/A`。依据：ADR-0089 已冻结 A8 且不继承其 Win10、Win7、RC 结论；A8-06 的对象是 `0.2.0-alpha.1`；A9 有 A9PKG-01 与任务书 §7.2。`N/A` 只关闭 A8 的历史验收行，A8 三层验收仍 `NOT_PERFORMED`，不表示 A9 的同类义务已全部覆盖。并行共存、卸载说明、SBOM“来源”字段、验证套件内容在 A9 侧未找到对应条目或未核对（报告观察 O-03），保持 `UNKNOWN`，本决定不把它们登记为限制。
- 决定二：G17 拆为三段处置。
  1. 包闭包、普通用户加载、SBOM 与许可证文件存在、双构建：已有证据（包闭包与加载为 Win7 实机，双构建为 macOS 开发机记录），不重测。
  2. 升级、回退与损坏库只读恢复：补最小 Win7 组 M6，列入 Alpha 2 补证清单。M6 范围：WIN7-42 数据由 WIN7-45 打开；WIN7-45 数据由旧目录打开，核对历史内容与续跑任务的目标（R-2）、`start_process` 句柄的状态与回收（R-1）；损坏库的只读恢复。M6 不含备份生成。M6 开始前须先指定回退目标，并给出 R-1 句柄的回收方案（受 A9-34 限制）。M6 尚未批准执行，其任务书条目待并入 A9-36 草案，A9-36 仍为 `DRAFT_READY_FOR_REVIEW`。
  3. 以下四项登记为 Alpha 2 已知限制，延期到 RC。RC 另立合同，届时逐项重新裁决；本决定不预先承诺 RC 范围。
     - DPAPI（A9GW-03：保存、清除、损坏、账户不匹配、日志扫描）：在 WIN7-45 上 `NOT_PERFORMED`。旧实机证据来自 Alpha 1 候选 WIN7-17/18，不是当前候选直接证据。继承须 ADR-0155 批准并逐项核对原报告、组件、运行时、配置和调用链；条件未满足前保持 `NOT_PERFORMED`。
     - 备份生成：迁移备份只在内嵌 A8 数据、旧 schema 版本或 `win7_19_legacy` 配置时触发；同为 v4 的 WIN7-42 与 WIN7-45 互相重开不触发。备份生成在 WIN7-45 上 `NOT_PERFORMED`。
     - 诊断包导出：PRD A9-D02 第三条要求“导出本地脱敏诊断包”，对照时在 `src/shell/product/*.js` 未检索到导出入口，是否存在 `UNKNOWN`。应用内诊断显示存在，Win7 现场 `UNKNOWN`。
     - SBOM 内容适用性：`SBOM.cdx.json`（9 个组件）与 `THIRD_PARTY_LICENSES.md` 文件存在已校验；是否覆盖实际运行闭包、是否满足 D-012 的许可证闭包语义，未审查，`UNKNOWN`。
- 决定三：回退差异 R-1 与 R-2 作为 M6 的核对项保留，不改产品。R-1：持久化为 `running` 且 `owned` 的 `start_process` 句柄，WIN7-45 判需要清理，WIN7-42 判不需要，但 WIN7-42 恢复入口仍按 PID 接管。R-2：续跑过的任务，WIN7-42 把续跑提示词当作任务目标，WIN7-45 保留原目标。二者均为开发机 SURROGATE 发现（Node v20.17.0，不是 Electron 22 / Node 16），Win7 `NOT_PERFORMED`，后果 `UNKNOWN`。是否修复未裁决。
- 决定四：Alpha 2 候选保持冻结的 WIN7-45。本决定不授权改产品字节。M6 或后续核对若发现需改产品字节，须另行报告并由负责人裁决。
- 携带规则：完整 Alpha 2 结论（若负责人签发）必须写明第二项第 3 点的四项、G16 `N/A` 的含义，以及 M6 的结果；M6 未执行时写 `NOT_PERFORMED` 并携带 R-1、R-2。携带方式与 ADR-0238、ADR-0239、ADR-0240 一致。
- 不变：ADR-0238 的门 B 结论与 43 条 PASS、ADR-0239 的 F-01、ADR-0240 的六项已知限制、KL-3、KL-5、KL-6a、KL-7（含 a、b、c）和其他既有限制均保持。
- 未签：完整 Alpha 2、RC、ADR-0155、A9-32 `DEVELOPER_VERIFIED`。不授权实现、补证执行（含 M6）、目标机动作、合并、推送或发布。M1～M5、M6 与 A9-36 仍待后续批准。
- 编号核对：0241 紧接本分支 ADR-0240。主工作区最大编号 ADR-0235。整合前须再次核号，被占用时按负责人裁决改号并统一引用。

## ADR-0242 Alpha 2 补证 M2 缩减：不重做 Provider 拒绝与预算检查，保留续跑后的再次主动尝试（ADR-0240 补充）

- 状态：Accepted（2026-10-16；负责人在聊天中回复“M2-05 采纳影响分析的缩减：不重做 Provider 拒绝与预算检查，保留 M2-06 的再次主动尝试。请只改文档并登记，A9-36 仍为草案。”）。ADR-0155 保持 Proposed，本决定不引用它。
- 背景：缺口表 §7.3 的 M2 原范围含 Provider 正常响应与 missing、length、content_filter、stop 加工具调用、空流、坏 JSON 的拒绝，以及可达预算恢复边界。[G04 影响分析](reports/2026-10/a9_alpha2_impact_analysis_g04_g05_g07_g08_g09_2026-10-16.md)（开发机，对 WIN7-42 与 WIN7-45 冻结 ZIP 的源码与编译产物比较）发现：`a9-agent-loop.ts` 虽改 174 行，但旧文件 754～853 行（Provider 发送、预算超限、重试减半、输出预算）、919～931 行（`length`、`content_filter`、工具调用不完整的拒绝）、946～954 行（终态 `verified` 与 `unverified` 判定）、1622 与 1644 行（审计失败置位与硬停）均无改动；`gateway` 包 10/10 同字节。A9-36 草案审核（缺口表 §17）把此项缩减留给负责人裁决。
- 决定一：A9-36 的 M2-05 不再执行，即不在 Win7 上重做 Provider 拒绝类别与预算检查。M2-05 的“Provider 正常响应”一项由 M5 的真实服务请求和 WIN7-45 既有回环夹具覆盖，不单列。
- 决定二：M2-06 保留。A9-32 §5 中尚无直接证据的 Provider 失败、预算零发送、审计失败之后的再次主动尝试，每项一次，仍必跑。M2-01～M2-04 不变。
- 携带规则：完整 Alpha 2 结论（若负责人签发）必须写明：Provider 拒绝类别与预算边界在 WIN7-45 的 Win7 实机上 `NOT_PERFORMED`，依据只有开发机的源码区间比较，不是 Win7 证据，也不是经 ADR-0155 批准的继承。本决定不把这两项写成 PASS。
- 不变：ADR-0238 的门 B 结论与 43 条 PASS（其中 E04 `s03t`、E07 `safe02` 已覆盖终态审计与 `tool_end` 审计）、ADR-0239 的 F-01、ADR-0240 的六项已知限制、ADR-0241 的 G16/G17 处置。
- 未签：完整 Alpha 2、RC、ADR-0155、A9-32 `DEVELOPER_VERIFIED`。A9-36 仍为 `DRAFT_READY_FOR_REVIEW`。不授权实现、补证执行、目标机动作、合并、推送或发布。
- 编号核对：0242 紧接本分支 ADR-0241。主工作区最大编号 ADR-0235。整合前须再次核号，被占用时按负责人裁决改号并统一引用。

## ADR-0243 Alpha 2 补证 M3-04 通过口径：晚写后撤销保持晚写字节并列入 drifted（ADR-0240、ADR-0242 补充）

- 状态：Accepted（2026-10-16；负责人在聊天中回复“M3-04 按该口径确认：撤销后字节保持晚写内容、路径列入 drifted。A9-36 仍暂不批准，请只改文档登记。”）。ADR-0155 保持 Proposed，本决定不引用它。
- 背景：A9-36 的 M3-04 检查后台进程在回合结束后再次写文件、随后撤销的情形。第三轮复审（缺口表 §19）指出原判据保护的是“撤销之后产生的字节”，约束不到本次撤销。PRD A9-F03 只写“不能可靠恢复时明确标记”，没有逐字界面合同；`src/workspace/src/checkpoint-manager.ts` 的 `undoTurn`、`undoOne` 把当前字节与轮后哈希不符的条目跳过并计入 `drifted`，不盲目覆盖。
- 决定：M3-04 的通过口径为：轮后基线收集完成并记录 B1 之后，后台进程晚写得 B_late（≠B1）；撤销后文件字节仍为 B_late，撤销结果把该路径列入 `drifted`（或界面给出等价提示），没有静默覆盖，没有其他路径被误撤。界面具体措辞只记观察，不作通过条件。晚写发生在基线收集完成之前时已被基线吸收，不能替代本项；普通延迟撤销也不能替代。
- 范围：本决定只固定验收判据，不修改产品，不扩大 PRD 合同。M3-04 通过只表示漂移保护生效，不表示界面提示已满足某个未写明的产品要求。
- 不变：ADR-0238 的门 B 结论、ADR-0239 的 F-01、ADR-0240 的六项已知限制、ADR-0241 的 G16/G17 处置、ADR-0242 的 M2-05 缩减。
- 未签：A9-36 仍为 `DRAFT_READY_FOR_REVIEW`，负责人明确暂不批准。完整 Alpha 2、RC、ADR-0155、A9-32 `DEVELOPER_VERIFIED` 未签。不授权实现、补证执行、目标机动作、合并、推送或发布。
- 编号核对：0243 紧接本分支 ADR-0242。主工作区最大编号 ADR-0235。整合前须再次核号，被占用时按负责人裁决改号并统一引用。

## ADR-0244 Alpha 2 补证 A9-36 以隔离分支任务书为唯一生效版本，并入必跑集合、隔离范围与 M6（ADR-0241、ADR-0242、ADR-0243 补充）

- 状态：Accepted（2026-10-16；负责人在聊天中回复“以 a9-36 工作树为准（选项 A）：把草案的 §4.1、§4.2、§6 与 ADR-0238～0243 引用并入，M4 字节改钉现有字节，再比对已实现代码缺口并报告。只改文档，不实现，不提交。”）。ADR-0155 保持 Proposed，本决定不引用它。
- 背景：核对分支发现 A9-36 有两份分叉。2026-10-15 负责人对六路径 M1～M5 本地实现回复“批准”，任务书在 `codex/a9-36-alpha2-supplement` 工作树改为 `APPROVED_FOR_IMPLEMENTATION`，六路径已实现（开发机合同 R7 276 PASS，独审 R6），门 A 已批准但过期，R0 因 agent 会话 5 断开停止。`codex/a9-33-batch2-win7-acceptance` 工作树的同名草案状态为 `DRAFT_READY_FOR_REVIEW`，写有“六路径尚未生效”，并含 §4.1 必跑集合、§4.2 隔离范围和 M6，经三轮 codex 复审。两份在 M4 字节（草案钉 `bd088ad7…`、`98db497f…`，现有 `4ddcac3b…`、`ce45b72a…`）、章节与 ADR 编号上不一致。此前给负责人的“A9-36 未批准”说法基于草案。
- 决定一：以 `codex/a9-36-alpha2-supplement` 工作树的 A9-36 任务书为唯一生效版本。2026-10-15 对六路径 M1～M5 本地实现的批准、`APPROVED_FOR_IMPLEMENTATION` 状态和现有字节不变。
- 决定二：a9-33 草案并入该任务书：§4.1、§4.2 保持原编号，M6（原 §6）并为 §8；ADR-0238～0243 的文本并入本分支；M4 字节改钉六路径现有字节（见任务书 §2）。草案不再维护。
- 决定三：并入内容是对已批准范围的追加修订。追加实现、M6 和新目标门 A 均未批准。已实现代码与并入要求的缺口比对写在任务书 §9（26 行：已覆盖 10、部分覆盖 10、未覆盖 5、超出 ADR-0242 缩减 1）。
- 不变：ADR-0238 的门 B 结论、ADR-0239 的 F-01、ADR-0240 的六项已知限制、ADR-0241 的 G16/G17 处置、ADR-0242 的 M2-05 缩减、ADR-0243 的 M3-04 口径；2026-10-15 门 A 已过期、续期草案未签的事实不变，旧材料不继承。
- 未签：完整 Alpha 2、RC、ADR-0155、A9-32 `DEVELOPER_VERIFIED`。不授权追加实现、补证执行、目标机动作、提交、推送或发布。
- 编号核对：0244 紧接 ADR-0243。本分支原到 ADR-0237，ADR-0238～0243 为从 a9-33 分支复制的同文。主工作区最大编号 ADR-0235。整合前须再次核号，被占用时按负责人裁决改号并统一引用。

## ADR-0245 Alpha 2 补证 A9-36 追加实现批准：按 §9 缺口补齐并实现 M6，保留 M2-05 已实现断言，M1-02 加本地裸 origin（ADR-0242、ADR-0244 补充）

- 状态：Accepted（2026-10-16；负责人在聊天中回复“批准按 A9-36 §9 缺口追加实现（含 M6），仍限六路径。M2-05 已实现断言保留，M1-02 加本地裸 origin。请先登记 ADR，再实现并独立复审，不提交，不执行目标机。”）。ADR-0155 保持 Proposed，本决定不引用它。
- 背景：[A9-36 §9](tasks/A9_36_ALPHA2_SUPPLEMENTAL_ACCEPTANCE.md#9-并入后实现缺口比对2026-10-16-utc只读) 静态比对 26 行：已覆盖 10、部分覆盖 10、未覆盖 5（M1-07、M2-06、M3-02、M3-04、M6）、超出 ADR-0242 缩减 1（M2-05）。负责人在 §9 末表的三个问题上已裁决。
- 决定一：批准按任务书 §4.1、§4.2、§8、§9 追加实现，含 M6。实现路径仍限任务书 §3 的六路径，不新增第七路径，不改产品 main、preload、IPC、Core、Runner、Gateway、原生与依赖锁，不引入新库或运行时（AGENTS.md C14、C15）。
- 决定二：M2-05 已实现断言保留，即驱动中 M2-A02（七种 Provider 结束边界）和 M2-A04（上下文错误只恢复一次）继续属于 M2 的固定断言，作为 Win7 直接证据。ADR-0242 正文不改；其决定一“不再执行”与携带规则按下述缩小：Provider 拒绝类别与可达上下文重试恢复，在 M2 组 PASS 时由补证直接覆盖，不再携带为 `NOT_PERFORMED`。不可压缩预算超限的零发送检查（驱动内标 `DEFERRED_NOT_RUN`）仍不执行，仍携带为 `NOT_PERFORMED`。
- 决定三：M1-02 在 M1 工作区增加本地裸 `origin`，由执行入口在工作区外建立，仅用本地路径，没有外部 push。19 种 Git 形态拒绝后须核对裸仓库 `refs/heads/main` 不变。
- 决定四：交付物限于实现、开发机合同、独立复审。不提交，不推送，不执行目标机传输、目录、任务和产品。旧门 A（`f1c0d968…`）已过期、续期草案（`14a9680e…`）未签，实现完成后按准确字节另行请求新门 A。
- 实现中保持：开发机合同和静态检查不冒充 Win7 结果。无法在开发机验证的产品链路行为（Electron、真实桌面、真实 Provider）保持 `NOT_PERFORMED`，由独立复审审查场景设计。
- 不变：ADR-0238 至 ADR-0244 的各项处置；2026-10-15 对六路径 M1～M5 本地实现的批准。
- 未签：完整 Alpha 2、RC、ADR-0155、A9-32 `DEVELOPER_VERIFIED`、新目标门 A。
- 编号核对：0245 紧接 ADR-0244。主工作区最大编号 ADR-0235。整合前须再次核号，被占用时按负责人裁决改号并统一引用。

## ADR-0246 A9-37将checkpoint已知秘密判定与日志启发式脱敏分离

- 状态：Accepted（2026-10-15，负责人明确要求定位并修复本次误报；本地实施范围见A9-37）
- 范围：checkpoint秘密判定；不改变权限、持久化格式或已知秘密保护
- 编号：编号于 2026-10-16 经负责人批准由 0238 改为 0246，整合到主线前须再核号。

日志脱敏是保守投影，可以改变源码中的`authorization: token`及演示URL文本。它的文本变化不能证明内容是实际秘密。
checkpoint需要保存原字节用于恢复，不能把上述启发式变更当作已知秘密。拆出共享的已知秘密替换函数；日志继续叠加URL userinfo和Authorization启发式，checkpoint只检测已知值替换是否变化。
已知集合仍包含Provider API key、代理密码、自定义头及当前进程保留的旧值，原文、Base64/URL-safe/去padding/percent等变体和UTF-8/UTF-16LE/GBK解码保持。
真实已知秘密仍fail-closed；不跳过文件、不保存脱敏替代原文、不伪造完整撤销。恢复缓存和Provider新增已知值的重校验继续使用相同已知秘密检查。
未登记的真实Authorization/URL凭据也不再凭字段形态阻断checkpoint；这是明确的行为变化。通用脱敏本来不覆盖未登记数据库口令、JSON头或任意秘密，不能作为通用秘密识别保证。工作区应按既有方式将真实凭据移出源码或纳入忽略规则，本修复不自动改用户文件。
该取舍只修复误报，并保留可证实的已知秘密不入快照保护；不声称所有未登记秘密均安全，也不改变日志投影的保守处理。
本次不创建新候选、不覆盖WIN7-45、不开远端验收。开发机与目标实机证据分开记录。

2026-10-16 范围澄清：项目说明外发门不在本 ADR 放宽范围内，仍用保守判据：`redactSecrets` 变化即视为敏感，保留原有 UTF-8/UTF-16LE/GBK 解码逻辑。含未登记 Authorization 或 URL userinfo 凭据的项目说明继续 `secret_blocked`，不得将原文发送给 Provider。这是对原 ADR 范围的澄清，不是新放宽；checkpoint 与 A9WorkspaceService 继续按已知秘密判定。

## ADR-0247 A9-37 登记 `A9_37_DEVELOPER_VERIFIED`（带已知限制）

- 状态：Accepted（2026-10-16；负责人在聊天中批准，原话如下）。

> 批准 A9-37 签 A9_37_DEVELOPER_VERIFIED（开发机，603323e2…）。请登记 ADR 并准备整合方案，整合后重跑 A9-32 §5。

- 编号：当前分支在 ADR-0246 后追加本号。2026-10-16 本地核对 a9-36 分支工作树最大编号为 ADR-0245。整合前须再核号，不能以本次核对代替整合时核对。
- 依据：开发机、Node 20.17.0，绑定分支 `codex/a9-37-checkpoint-secrets`、基线 `013cf796…` 及下列未提交文件字节。三套 Jest 共 118 PASS/0 FAIL，分别为 lifecycle 46、redaction 46、Provider persistence 26。`verify:quick`、`docs:check`、`git -c core.fsmonitor=false diff --check` 均通过。执行证据见[报告第二轮修复](reports/2026-10/a9_37_checkpoint_secret_classification_repair_2026-10-15.md#第二轮修复2026-10-16)。

| 绑定文件 | 完整 SHA-256 |
|---|---|
| `src/shell/product/a9-agent-runtime.js` | `603323e25273eaf0a20a9987f0568d720a20d898d1fd8ef0dc40d9ace580b390` |
| `src/shell/tests/product/a9-lifecycle.test.ts` | `1912076361d13f36f8cd53a6a5adf9326f6cd583340f216b83827aa2cd70b842` |

独立审核报告均位于候选外 `outputs/a9-37-checkpoint-secrets/`。报告原文与首轮结论保留，文件哈希经本次复算。

| 独立审核 | 报告文件 | 报告 SHA-256 前 8 位 | 审核产品 | 原结论 |
|---|---|---|---|---|
| codex 第一轮 | `independent-review-codex-2026-10-16.md` | `d09d4adb…` | `426bb327…` | 0P0/1P1/2P2 |
| codex 第二轮 | `independent-review-round2-codex-2026-10-16.md` | `72021ebf…` | `603323e2…` | 0P0/0P1/0P2 |
| Claude | `independent-review-2026-10-16.md` | `271f4ae8…` | `426bb327…` | 0P0/1P1/3P2 |

Claude R-01 与 codex 首轮 P1 是同一项目说明外发门问题。第二轮产品已修复，codex 第二轮确认关闭。第二轮零发现只指该轮差异，不关闭下列已知限制。

- 决定：A9-37 阶段门登记为 `A9_37_DEVELOPER_VERIFIED`，随下列 L1–L6 已知限制签发。L1、L2 由后续单独任务处理，本 ADR 不授权该任务。

| 编号 | 已知限制 |
|---|---|
| L1 | Claude 审核 R-02：已登记代理密码以 HTTP Basic 组合 `base64(用户名:密码)` 形式出现时，不匹配任何已知变体，checkpoint 不再阻断。修复前仅靠 Authorization 启发式附带阻断。已知秘密保护结论不覆盖此组合形式。 |
| L2 | 既有缺陷，非 A9-37 引入：日志启发式对 `Authorization: Basic <凭据>` 只替换 `Basic` 一词，凭据留在日志与投影中。 |
| L3 | GBK 解码分支无新增直接检查，代码未改。 |
| L4 | 复验必须使用 Node 20.17.0。Node 22 下 better-sqlite3 ABI 不匹配，会进入诊断模式。 |
| L5 | KL-12 仍为 P1/NOT_PERFORMED，本 ADR 不关闭。 |
| L6 | POSIX 进程夹具为 SURROGATE，不提供 Windows 原生身份或进程树清理证明。 |

- 边界：不签 Win7，`Win7-Validation` 保持 `NOT_PERFORMED`；不签 Electron/Win10、新候选、Alpha2/RC、推送/合并/发布。A9-37 产品改动不在 WIN7-45（第二批正式验收候选）中，未在 Win7 实机验证。当前文件未提交。
- 后续：整合方案见[本地报告](reports/2026-10/a9_37_checkpoint_secret_classification_repair_2026-10-15.md#整合方案与复验边界)。整合后重跑 A9-32 §5；本次只准备方案，不执行整合或该轮复验，也不签 A9-32 状态。

## ADR-0248 A9-38 将代理 Basic 组合纳入已知秘密并修正 Authorization 单令牌脱敏

- 状态：Accepted（2026-10-16；负责人批准 A9-38 任务书，原话“批准”；Q1 取 B、Q2 取 A 按推荐项登记）
- 范围：ADR-0247 L1、L2；补充 ADR-0246，不改其已知秘密与启发式分离原则
- 编号：2026-10-16 核对全部本地工作树与分支，最大为 ADR-0247。整合到主线前须再核号。

L1 决定：已知秘密集合增加“代理用户名:密码”组合。组合只保存在进程内存，与已知单值同生命周期；代理清除、改名或改密后旧组合继续保留。重启后只由持久化的当前代理配置恢复。组合的原文、base64、URL-safe、去 padding 与 percent 变体按单值相同规则匹配，checkpoint、恢复区重校验、日志投影与实时预览保留长度共用该集合。

L1 边界：只覆盖已登记用户名的组合。同一密码配其他用户名的 Basic 编码不识别；按字节对齐检测密码片段的方案对短密码误报不可控，不采用。checkpoint 仍不使用任何字段名启发式。

L2 决定：日志启发式中，`Authorization` 字段值若为“方案名 + 空格/制表符 + 令牌”，方案名与令牌整体替换为 `***redacted***`。方案名覆盖 Basic、NTLM、Negotiate 等任意 token 字符方案；方案名后不跨换行。`Bearer` 既有规则不变。`Proxy-Authorization` 因包含字段名同样适用。

L2 边界：`Digest` 的逗号分隔参数只替换首个参数，其余参数不保证脱敏。已写入 SQLite 的历史投影不迁移、不回洗。投影可能多替换源码中字段后的单词，属保守方向；项目说明外发门阻断集合不缩小。

不改接口、Schema、持久化格式、vault、权限或 UI。结论限开发机；不创建新候选，不改 WIN7-45，Win7 为 NOT_PERFORMED。

2026-10-16 审核处置补充：项目经理经负责人授权裁决独立审核 4 项 P2。补充内容如下，不改上文决定。

- Shell 环境覆盖校验、自动 Shell 选择与 Runner 敏感值读取改用同一组敏感值：已知单值、代理组合，以及 Latin-1 组合的 base64。
- 组合含 U+0080～U+00FF 且无更高码位时，同时登记 UTF-8 与 Latin-1 两种 base64；网关以 `btoa` 生成代理头即为 Latin-1 形式。码位高于 U+00FF 时 `btoa` 抛错，代理不可用，该缺陷属网关，不在本 ADR 范围。
- 新增已知限制：带引号值（`Authorization: "Basic …"`）与 JSON/字典键形式（`{"Authorization":"Basic …"}`）的凭据不脱敏。该缺陷早于 A9-38，本 ADR 不修。

## ADR-0249 A9-38 登记 `A9_38_DEVELOPER_VERIFIED`（带已知限制）

- 状态：Accepted（2026-10-16；负责人对下列问题回复原话“批准”）。

> A9-38 是否按选项 A 带已知限制签 A9_38_DEVELOPER_VERIFIED，并本地合入整合分支

- 编号：本分支已有 ADR-0248。2026-10-16 只读核对 a9-36 分支工作树最大编号为 ADR-0245，a9-33 为 ADR-0243，整合工作树为 ADR-0247。整合前须再核号，本次核对不代替整合时核对。
- 依据：开发机、Node 20.17.0，绑定分支 `codex/a9-38-basic-credential-redaction`、基线 `234e3dfb…` 及下列未提交文件字节。三套 Jest 共 150 PASS/0 FAIL，分别为 lifecycle 78、redaction 46、Provider persistence 26。`verify:quick`、`docs:check`、`git -c core.fsmonitor=false diff --check` 均通过。原始检查见[报告 §9.4](reports/2026-10/a9_38_basic_credential_redaction_2026-10-16.md#94-检查)。本次文档登记沿用第三轮和聚焦复核的开发机产品检查，标为 `INHERITED_EVIDENCE`；不重跑产品检查。

| 绑定文件 | 完整 SHA-256（本次复算） |
|---|---|
| `src/shell/product/a9-agent-runtime.js` | `1809d4a559eb7fd7d35548d0a5412ca91d78a590224a451f478cb9013234924b` |
| `src/shell/tests/product/a9-lifecycle.test.ts` | `34b9036c93ac25a931bfe8f1a08f0256584c1d444e14193550773830875020a8` |

审核报告均位于候选外。原文与各轮结论保留，报告哈希经本次复算。

| 独立审核 | 报告文件 | 报告 SHA-256 前 8 位 | 审核产品 | 原结论 |
|---|---|---|---|---|
| Claude | `/Users/qlyf/Library/Application Support/Claude/side-session-notes/local_53e0058b-d6de-450d-b89e-6dbe006dcf67/a9-38-independent-review-2026-10-16.md` | `c09d52cc…` | `d744db2d…` | 0P0/0P1/4P2 |
| codex 复审 | `outputs/a9-38-basic-credential-redaction/codex-review/run-20261017T015206Z/review.md` | `856e4cd4…` | `bc3ed2b2…` | 0P0/0P1/1P2 |
| codex 聚焦复核 | `outputs/a9-38-basic-credential-redaction/codex-review/recheck/review.md` | `71c19a43…` | `1809d4a5…` | 0P0/0P1/0P2 |

Claude P2-1、P2-3 已补测试，P2-4 已修复；P2-2 按裁决保留为 K7。codex 复审 P2-01 已修复，聚焦复核确认关闭。零发现不关闭下列已知限制。

- 决定：A9-38 阶段门登记为 `A9_38_DEVELOPER_VERIFIED`，随下列已知限制签发。完整编号沿用[报告 §5](reports/2026-10/a9_38_basic_credential_redaction_2026-10-16.md#5-已知限制)与[§8.4](reports/2026-10/a9_38_basic_credential_redaction_2026-10-16.md#84-已知限制更新)；K1 已关闭，其余保持。

| 编号 | 限制与当前状态 |
|---|---|
| K1 | 已关闭：第二轮以 fake safeStorage 补启动恢复组合登记的直接测试，不提供真实 DPAPI 或 Win7 证据。 |
| K2 | 未登记用户名的 Basic 组合不识别。 |
| K3 | `Digest` 逗号分隔参数只替换首个参数，后续参数不保证脱敏。 |
| K4 | 已写入 SQLite 的历史投影不迁移、不回洗。 |
| K5 | GBK 解码分支无组合形式的直接测试，仍为 `NOT_VERIFIED`。 |
| K6 | POSIX 进程夹具为 `SURROGATE`，不提供 Windows 原生身份或进程树清理证明。 |
| K7 | 带引号值与 JSON/字典键形式的 Authorization 凭据不脱敏，该缺陷早于 A9-38。 |
| K8 | 代理凭据含高于 U+00FF 的码位时，网关 `btoa` 抛错使代理不可用，不在本任务允许路径。 |

数字/符号开头文本会多替换后续单词，属保守脱敏边界。POSIX 夹具仍为 `SURROGATE`。KL-12（真实 helper 启动后 ready 失败清理）仍为 P1/NOT_PERFORMED，本 ADR 不关闭。

- 边界：不签 Win7，`Win7-Validation` 保持 `NOT_PERFORMED`；不签 Electron/Win10、新候选、Alpha2/RC、推送、合入 main 或发布。A9-38 产品改动不在 WIN7-45（第二批正式验收候选）中，未在 Win7 实机验证。
- 后续：负责人已同意本地合入整合分支。本轮只登记文档，未提交、未整合、未推送、未连接远端。下一步为本地提交并快进合入 `codex/a9-alpha2-integration-r2`；整合前再核号，整合后按既有方案重跑 A9-32 §5。上述提交、整合与整合后复验本轮均为 `NOT_PERFORMED`，不签 A9-32 状态。

## ADR-0250 Alpha 2 范围纳入 A9-37、A9-38；WIN7-45 不再是 Alpha 2 最终候选

- 状态：Accepted（2026-10-16；负责人原话如下）。

> A9-37、A9-38 列入 Alpha 2 范围。请按整合分支准备新 Win7 候选的门 A 材料，并说明与 A9-36 在 WIN7-45 上执行的关系。

- 依据：开发机只读核对，整合分支 `codex/a9-alpha2-integration-r2` 的 HEAD 为 `4a62b24c…`。提交链为 `013cf796…` → A9-37 `234e3dfb…` → A9-38 `4a62b24c…`。当前产品文件 SHA-256 为 `1809d4a5…`，完整绑定见 [A9-39 §2](tasks/A9_39_ALPHA2_FINAL_CANDIDATE.md#2-实际基线与事实复核)。本轮未在 Win7 实机验证。
- 决定：Alpha 2 最终 Win7 候选须包含 `234e3dfb…`、`4a62b24c…` 的产品字节。WIN7-45（第二批正式验收候选）不含这两项改动，不能再作为 Alpha 2 最终候选。
- 证据后果：WIN7-45 已有 Win7 证据保留原源码、ZIP、run 和身份绑定。用于 Alpha 2 时，须逐项写明是原候选直接证据，还是经批准的准确 `INHERITED_EVIDENCE`。不得将其重绑为新候选直接 PASS；ADR-0155 仍为 Proposed。
- 候选号：新候选拟用 WIN7-46（含 A9-37/38 的 Alpha 2 最终候选提案）。冻结前须重新核对 refs、登记和候选目录；当前未占号、未构建、未冻结。
- 待裁决：A9-36 继续在 WIN7-45 执行，还是改到新候选，见 [A9-39 §6 待裁决](tasks/A9_39_ALPHA2_FINAL_CANDIDATE.md#6-待裁决a9-36-与新候选的关系)。本 ADR 不修改 A9-36 §2 合同，不替负责人选方案。
- 授权边界：A9-39 保持 `DRAFT_READY_FOR_REVIEW`。本决定只确定 Alpha 2 范围与材料准备方向，不批准实现、构建、提交、目标执行或门 A/门 B。KL-12 仍为 P1/NOT_PERFORMED，不签 Alpha 2/RC。
- 编号：本轮只读核对 a9-33 最大 ADR-0243、a9-36 最大 ADR-0245、本分支最大 ADR-0249，追加 0250。整合前须再核号；本次核对不替代整合时核对。

## ADR-0251 Alpha 2 补证采用方案 R2：A9-36 改在 WIN7-46 执行，WIN7-45 的 A9-36 r7 门 A 不签发

- 状态：Accepted（2026-10-16；负责人对 A9-39 §6“选方案 R1 还是方案 R2”的回复原话如下）。

> r2

- 决定：采用方案 R2。A9-36 产品绑定由 WIN7-45（第二批正式验收候选）改为 WIN7-46（含 A9-37/38 的 Alpha 2 最终候选提案）。M6 正向版本随之改为 WIN7-46，回退目标仍为 WIN7-42（第一批可靠性候选）。本条补充 ADR-0250 的待裁决事项，原 Accepted 正文保留。
- 旧材料处置：不签发、不执行现有 WIN7-45 的 A9-36 r7 门 A 材料。r7 原字节保留，其 candidate、run、期限与预算不复用。r6 的 `HALTED` 与首失败保留，不恢复旧账本、不改判旧结果。
- 前置顺序：A9-36 执行者先固定最终六路径字节并完成最终复审。获负责人批准后提交，并合入 `codex/a9-alpha2-integration-r2`。之后，获准的 A9-39 执行者才能修改共享的 `a9-batch2-driver-entry.cjs` 与 `a9-batch2-contract.test.ts`。不得从未提交工作树取中途字节打包。
- 候选与门 A：构建、冻结 WIN7-46 后，重新生成准确门 A 材料，仍由负责人签发。一个 Win7 窗口覆盖原 25 用例/43 断言、A9-36 M1～M6 与 A9-37/38 新用例，各自独立账本。共同候选、调度顺序、实际输入、总预算和真实服务范围须准确绑定，不复用已消费授权。
- 编号：A9-36 分支已获知不得使用 ADR-0246～0251，新 ADR 从 0252 起。整合前再核号。
- 证据与版本：本次为开发机文档修订，绑定整合分支 HEAD `4a62b24c…`。独立审核 r1 绑定草稿 SHA-256 `2b323191…`，发现 0P0/2P1/5P2；本次处置见 [A9-39 r2 §10](tasks/A9_39_ALPHA2_FINAL_CANDIDATE.md#10-独立审核-r1-处置)。本条不产生 Win7 实机证据。
- 授权边界：本裁决不批准 A9-39 实施，不授权本轮构建、提交、整合或目标执行。A9-39 保持 `DRAFT_READY_FOR_REVIEW`。不签发门 A/门 B、Win7、Alpha 2/RC；KL-12 仍为 P1/NOT_PERFORMED。

## ADR-0252 A9-36 候选身份改由负责人签发的门 A 授权提供，代码不钉最终候选

- 状态：Accepted（2026-10-17）。负责人 2026-10-17 原话：“批准 D1～D3：接受 ADR-0252；a9-36 分支本地提交；整合分支先本地提交 ADR-0250/0251 与 A9-39 第 1 阶段，再合入 a9-36 分支。不推送。” 实现依据是负责人本轮授权和 ADR-0245。
- 负责人授权原话：“A9-36 改绑交由 codex 在 a9-36 工作树接手，按已商定规则 a～f 执行并起草 ADR-0252。原会话恢复后不再写六路径。”
- 前置裁决：整合分支 ADR-0250 将 A9-37/38 纳入 Alpha 2；ADR-0251 采用 R2，A9-36 改在 WIN7-46 执行，M6 回退目标保留 WIN7-42。两条原文只读参考，不复制或改写。本分支不使用 ADR-0246～0251。

提议：代码只固定候选编号 `WIN7-46`。候选 source、ZIP、manifest、M6 正向持久层和原生 SHA，由负责人在构建冻结后签发的门 A 授权提供。请求记录授权原文件 SHA。生成、消费与前序账本核对该 SHA，不能将请求换到另一份授权。

校验：source 必须为 40 位，其余 SHA 为 64 位小写十六进制。全同字符、全零、短周期重复、占位文本、长度错误和大写均拒绝。逐项拒绝已退役 WIN7-45 的 source、ZIP、manifest。候选编号为 WIN7-42 时拒绝。M6 的 WIN7-42 source、ZIP、manifest、持久层完整钉保留在代码，授权逐项相等才准入。夹具改名为 `FCandC`、`FCandN`、`CCand`，角色为 `cand`。

放弃的保证：代码对候选身份的独立二次核对。过去代码内的最终候选常量能拒绝一份填错身份的授权；改后只按授权核对实际字节。负责人签入错误但格式合法的身份时，代码无法据独立常量发现。不得据此声称安全性不变。

补偿措施：请求与消费账本绑定负责人确认的授权原文件 SHA。R2 在建任务前，用候选自带 `electron.exe` 的 Node 模式只读运行固定编排器，核对 ZIP、manifest、source、候选编号和 manifest 完整树。文件读取经 `original-fs`；失败即停。该预检核对授权与实际包的一致性，不能替代负责人准确签发。WIN7-46 尚未构建，R2 新材料及目标运行仍为 `NOT_PERFORMED`。

范围：仍限 [A9-36 §3](tasks/A9_36_ALPHA2_SUPPLEMENTAL_ACCEPTANCE.md#3-拟批准精确允许路径) 六路径及文档登记。原 batch2 正式模式的 WIN7-45 身份检查留给 A9-39 阶段 2。本轮不提交、不推送、不写其他工作树、不连接远端、不构建正式候选、不安装依赖。不签门 A、门 B、Win7、Alpha 2 或 RC。r7 作废原字节、r6 `HALTED` 与全部首失败证据保留。

证据：开发机 macOS，分支 `codex/a9-36-alpha2-supplement`，HEAD `013cf796…` 加本轮六路径字节。入场判断、完整摘要与检查见 [A9-36 §10.12](tasks/A9_36_ALPHA2_SUPPLEMENTAL_ACCEPTANCE.md#1012-codex-接手候选改绑2026-10-17)。执行代理没有兼任本轮独立审核。

## ADR-0253 B2-A37-01 源码样本期望改由驱动对齐候选脱敏；新建候选 WIN7-47 取代 WIN7-46

- 状态：Accepted（2026-10-21）。负责人原话：“批准路线 A：改驱动期望，不改产品，新建候选 WIN7-47；按推荐同时备定向取证包和新的恢复下载设计。”
- 事实：预演 3 重试 run d35a55d2…（候选 WIN7-46，Win7 实机，REHEARSAL_NOT_ELIGIBLE）在 p07-safe 的 B2-A37-01 失败。驱动 `a9-batch2-driver-entry.cjs` 把源码样本的期望投影写死为 `const headers = { authorization: ***redacted*** };`，候选日志脱敏（`a9-agent-runtime.js`，ADR-0248 L2）实际输出 `const headers = { authorization: ***redacted***;`。header 与 URL 样本一致。开发机静态复算可重复，Provider 只见 s001～s004，与流程在源码×UTF-8 样本停止相符。Win7 原始证据 `a37-01.json` 尚未取回，根因在其证实前记为 UNKNOWN。
- 依据：ADR-0246 规定日志脱敏是保守投影，可以改变源码中的 `authorization: token`；ADR-0248 L2 边界写明投影可能多替换源码中字段后的单词，属保守方向。候选行为在已接受的 ADR 范围内，驱动的精确期望比 ADR 更严。此前开发机的 B2-A37-01 PASS 使用手写投影，没有经过候选脱敏函数，没有发现该差异。
- 决定：（1）改驱动期望，使源码样本的期望等于候选的保守投影；不改产品代码、权限、持久化格式或脱敏正则。（2）新增开发机测试，把驱动对九个固定样本的期望与候选脱敏函数的真实输出逐项比对，防止手写投影再次漂移。（3）套件在 ZIP 内，驱动改动必须产生新候选，新候选编号为 WIN7-47，取代 WIN7-46 成为 Alpha 2 最终候选提案。WIN7-46 的冻结包、其预演 1～3 的结果与首失败原样保留。（4）A9-39 允许路径仍为任务书 §3 的十条，不扩大。（5）恢复下载改进（有界超时 600 秒、小文件优先、对与候选内字节完全相同的 `electron.exe` 副本去重）和一次 1～4 个小文件的定向取证，各自随下一个预演包和独立取证包办理，需要负责人逐字确认后才连接目标机。
- 放弃的保证：驱动不再要求源码样本的投影保留 `}`。若以后改动脱敏正则，开发机新增测试会在驱动期望处报告差异，由改动者同步期望。
- 边界：本条不批准提交、构建、预演、门 A/门 B，不改既有 Accepted ADR，不产生 Win7 证据。提交与构建须负责人另行批准。KL-12 仍为 P1/NOT_PERFORMED。

## ADR-0254 预演改走 Win7 开发通道；正式门 A 不变（ADR-0253 补充）

- 状态：Accepted（2026-10-21）。负责人原话：“采用方案 B：开平 Win7 开发通道并精简预演，正式门 A 不变。先起草任务书和常设授权文本给我审，重试 1 暂停。”批准原话：“批准 ENGINEERING_03 任务书。签发 Win7 开发通道常设授权 r1。Q1～Q5 按推荐。”
- 事实：A9-39 预演结果上限为 `REHEARSAL_NOT_ELIGIBLE`（任务书 §11.6）。已定根因的实机停止全部在候选外工具或驱动期望（任务书 §11.8.16～§11.8.51）。开发机桩不执行真实 PowerShell 2.0，这类缺陷只在实机暴露。
- 决定：（1）在 Win7 验收机开开发通道，根为 `C:\A9-DEV\`，按负责人签发的常设授权运行，授权文本见 ENGINEERING_03 §7。（2）A9-39 预演改在开发通道内逐阶段进行，不再逐次备一次性包、两段逐字确认和多路独立审核。（3）开发通道进程判据改为映像路径前缀，不做 PID、创建时间、属主三重核对。（4）正式门 A、门 B 规则与 A9-39 §7、§8 不变。
- 与既有 ADR 的关系：ADR-0253 决定（5）要求随“下一个预演包”办理恢复下载改进，并在负责人逐字确认后才连接目标机。本条生效后，该要求只适用于正式门 A 的执行包；开发通道内的连接改由常设授权覆盖。ADR-0253 正文不改。
- 放弃的保证：开发通道结果不绑定一次性包 SHA；单次动作不再由负责人逐次确认；开发根内残留只按路径识别。
- 边界：开发通道结果一律标 `DEV_CHANNEL`，不计入覆盖矩阵、门 B、Alpha 2 或 RC。本条不批准提交、推送、冻结或门 A。

## ADR-0255 产品 IPC 对异步方法的拒绝按结构化错误返回；新建候选 WIN7-48 取代 WIN7-47

- 状态：Accepted（2026-10-21）。负责人原话：“批准选项 A：A9-39 允许路径增加 src/shell/product/a9-product-ipc.js 及其回归测试文件，产品 IPC 改为 return await，登记 ADR-0255，换发 WIN7-48；codex 实现，Sonnet 审核。不推送。”
- 事实：WIN7-47 在 Win7 开发通道（`DEV_CHANNEL`）的 p07-safe 于 B2-A37-03 失败。`a9-product-ipc.js` 在 `try` 内直接 `return runtime.X(...)`，未 `await`；异步方法的拒绝越过 `catch`，渲染进程收到异常，而不是 `{ok:false,error}`。开发机最小复现：异步抛错返回拒绝，同步抛错返回 `{ok:false}`。开发根内诊断补丁 d2（21 处改为 `return await`）下 p03～p10 全部 PASS（A9-39 任务书 §11.8.56）。
- 决定：（1）`a9-product-ipc.js` 对 runtime 方法的返回改为 `return await`，使同步与异步错误都经同一 `serializeError` 返回；不改动作集合、Schema、权限、持久化格式或错误码。（2）新增开发机回归测试，覆盖异步拒绝返回 `{ok:false,error.code}`。（3）A9-39 允许路径增加 `src/shell/product/a9-product-ipc.js` 与回归测试文件 `src/shell/tests/product/a9-product-contract.test.ts`。（4）产品字节改变，必须新建候选 WIN7-48，取代 WIN7-47 成为 Alpha 2 最终候选提案；WIN7-47 的构建、证据与首失败原样保留。
- 放弃的保证：渲染进程不再以 Promise 拒绝感知产品异步错误；依赖拒绝的调用方改为检查 `ok`。
- 边界：本条不批准提交、构建、门 A/门 B，不改既有 Accepted ADR，不产生 Win7 证据。提交须负责人另行批准。

## ADR-0256 写者静止门把搜狗输入法 SGTool.exe 记为环境进程，不阻塞静止门与 R8

- 状态：Accepted（2026-10-21）。负责人原话：“批准选项 A：写者登记对映像位于 C:\Program Files (x86)\SogouInput\ 下、名为 SGTool.exe 的进程记为环境进程，写入证据但不阻塞静止门与 R8；登记 ADR-0256，由 codex 修改并加测试，然后继续彩排。”
- 事实：WIN7-48 开发模式彩排 run `df78b459…`（Win7 实机，`DEV_CHANNEL`）中，p03 产品结果 PASS，收尾写者静止门与 R8 报 `WRITERS_NOT_QUIESCENT`。唯一未退出的已登记写者是 `C:\Program Files (x86)\SogouInput\16.7.0.4673\SGTool.exe`，父进程为 p03 的驱动 Electron GUI，存活超过 60 秒后自行退出（A9-39 任务书 §11.8.61）。常设授权 r1 禁止修改目标机系统设置与输入法。
- 决定：（1）A9-39 执行包的写者登记把同时满足“映像路径位于 `C:\Program Files (x86)\SogouInput\` 之下”与“映像文件名为 `SGTool.exe`”（不区分大小写）的进程记为环境进程。（2）环境进程照常登记 PID、创建时间、映像、父进程与退出观测，写入证据，但不计入写者静止判定与 R8 残留判定。（3）不满足两项条件的任何进程，判定不变。（4）适用于开发模式与正式模式。
- 放弃的保证：不再证明该进程在封存期间没有写入证据根；其映像位于运行根之外。
- 边界：本条只改候选外执行包，不改候选、产品与驱动，不批准门 A/门 B、提交或推送。

## ADR-0257 A9-36 补证编排器的机器名比较改为不区分大小写

- 状态：Accepted（2026-10-21）。负责人原话：“批准选项 A：A9-39 允许路径增加 release/win7-product-v3/a9-alpha2-supplement.cjs，只把第 353 行机器名比较改为不区分大小写，并在 a9-batch2-contract.test.ts 加回归测试；登记 ADR-0257；codex 实现，Sonnet 审核，提交另行批准。不推送。”
- 事实：WIN7-48 补证开发通道预跑 run `a33144b9…`（Win7 实机，`DEV_CHANNEL`）中，m4 以 `A9_36_EXECUTOR_IDENTITY` 失败。主会话在开发通道以 agent 身份逐项重放编排器 `assertActualRuntime`：其余各项符合，唯一不符是 `os.hostname()` 返回 `dccs-chaizl-PC`，而编排器第 353 行严格比较授权的 `target.machine`，请求模块第 91 行又把它钉为 `DCCS-CHAIZL-PC`（A9-39 任务书 §11.8.64）。
- 决定：（1）A9-39 允许路径增加 `release/win7-product-v3/a9-alpha2-supplement.cjs`，只改第 353 行：机器名按不区分大小写比较。（2）`src/shell/tests/product/a9-batch2-contract.test.ts` 增加回归测试。（3）请求模块对 `target.machine` 的钉值不变。（4）编排器不在候选 ZIP 内，不换发候选；补证授权按新的编排器 SHA 绑定。
- 放弃的保证：机器名不再按字节区分大小写；Windows 计算机名本身不区分大小写。
- 边界：不改 SID、会话、完整性、工具钉与其他身份检查；不批准提交、推送、门 A/门 B。

## ADR-0258 A9-36 补证编排器组内 postflight 按 ADR-0256 规则把 SGTool.exe 记为环境进程

- 状态：Accepted（2026-10-21）。负责人原话：“批准：A9-39 允许范围扩展到 a9-alpha2-supplement.cjs 的 postflight 函数，对映像为 C:\Program Files (x86)\SogouInput\ 下 SGTool.exe 的进程按 ADR-0256 同一规则记为环境进程、写入证据但不计入 related；登记 ADR-0258，codex 实现并加回归测试，Sonnet 审核，提交另行批准。不推送。”
- 事实：WIN7-48 补证开发通道预跑 run `df8593e1…`（Win7 实机，`DEV_CHANNEL`）中，m4 三条断言全部 PASS，组状态 FAIL；编排器 `postflight` 的 `related` 只有 `SGTool.exe`，父进程为该组产品进程（A9-39 任务书 §11.8.65）。ADR-0256 只覆盖执行包外层。
- 决定：（1）A9-39 允许范围扩展到 `release/win7-product-v3/a9-alpha2-supplement.cjs` 的 `postflight` 函数。（2）映像路径位于 `C:\Program Files (x86)\SogouInput\` 之下（按路径段判定）且文件名为 `SGTool.exe`（均不区分大小写）的进程，记入环境进程列表并写入证据，不计入 `related`。（3）其余进程判定不变；映像未知的进程仍计入 `related`。（4）回归测试写入 `src/shell/tests/product/a9-batch2-contract.test.ts`。（5）编排器不在候选 ZIP 内，不换发候选。
- 放弃的保证：与 ADR-0256 相同，不再证明该进程未写入证据根。
- 边界：不改 `postflightClean` 对其他进程与 `failed` 的判据；不批准提交、推送、门 A/门 B。

## ADR-0259 驱动经界面刷新同步批准结果；编排器环境进程分类拒绝命令行推断的映像；新建候选 WIN7-49 取代 WIN7-48

- 状态：Accepted（2026-10-21）。负责人原话：“批准选项 A：驱动所有直接调用 resumeApproval 的位置在返回后调用一次 window.win7AgentA9Workbench.refreshSnapshot() 并加回归测试；顺带按审核建议要求 postflight 的 ImageSource 不为 command_line；登记 ADR-0259，换发 WIN7-49；codex 实现，Sonnet 审核。审核通过后批准本地提交（含 ADR-0257/0258 编排器修改）与双干净构建。不推送。”
- 事实：WIN7-48 补证开发通道定向诊断 run `4c4cc2b6…`（Win7 实机，`DEV_CHANNEL`）证实：驱动直接调用 `window.win7Agent.a9.resumeApproval`，后端已终态且无待批，界面缓存仍停在待批准，输入框禁用；一次 `refreshSnapshot()` 后恢复（A9-39 任务书 §11.8.66）。ADR-0258 的独立审核另指出：编排器 `postflight` 的映像在 `ExecutablePath` 为空时回退为命令行首段，可能被误分类为环境进程。
- 决定：（1）驱动 `src/shell/tests/product/a9-batch2-driver-entry.cjs` 中所有直接调用 `resumeApproval` 的位置，在调用返回后调用一次 `window.win7AgentA9Workbench.refreshSnapshot()`；不改断言判据与超时。（2）`a9-batch2-contract.test.ts` 增加回归测试。（3）编排器 `postflight` 的环境进程分类额外要求映像来源 `ImageSource` 不为 `command_line`。（4）驱动在候选 ZIP 内，新建候选 WIN7-49，取代 WIN7-48 成为 Alpha 2 最终候选提案；WIN7-48 的构建、证据与首失败原样保留；产品代码不变。（5）审核通过后批准本地提交（含 ADR-0257、ADR-0258 的编排器修改）与双干净构建。
- 放弃的保证：驱动不再逐字模拟“只调接口、不经界面”的路径；真实用户路径仍经界面处理器。
- 边界：不改产品代码、脱敏、权限、持久化格式；不批准推送、冻结、门 A/门 B。

## ADR-0260 驱动在后台进程状态变化后经界面刷新；页面滞后登记为 KL-13 并延期到 RC；新建候选 WIN7-50 取代 WIN7-49

- 状态：Accepted（2026-10-22）。负责人原话：“选 A：驱动 stopAllManaged 返回前与 newConversation 等待前调用一次 refreshSnapshot()，加回归测试；页面滞后登记为已知限制，产品修复延期到 RC；登记 ADR-0260，换发 WIN7-50；codex 实现，Sonnet 审核，审核通过后批准本地提交与双干净构建。不推送。”
- 事实：WIN7-49 补证开发通道定向诊断 run `4cf5c6db…`（Win7 实机，`DEV_CHANNEL`）证实：第五轮托管后台进程自然退出后，后端 `canSwitch:true`，页面“新建会话”按钮仍禁用 20 秒；一次 `refreshSnapshot()` 后恢复。renderer 快照轮询只在请求期间运行（A9-39 任务书 §11.8.69）。
- 决定：（1）驱动 `a9-batch2-driver-entry.cjs` 的 `stopAllManaged` 在返回前、`newConversation` 在开始等待按钮前，各调用一次 `window.win7AgentA9Workbench.refreshSnapshot()`；刷新失败使驱动失败；不改判据与超时。（2）合同测试增加回归。（3）页面滞后登记为 KL-13：托管后台进程自然退出后，页面在下一次提交、停止或切换前仍显示停止按钮并禁用新建会话；后端门禁正确，无越权或数据风险；产品修复延期到 RC。KL-13 写入套件 `KNOWN_LIMITS`。（4）驱动与套件在候选 ZIP 内，新建候选 WIN7-50 取代 WIN7-49；WIN7-49 构建与证据保留；产品代码不变。（5）审核通过后批准本地提交与双干净构建。
- 放弃的保证：Alpha 2 不保证后台进程自然退出后页面即时更新。
- 边界：不改产品代码、权限、持久化格式；不批准推送、冻结、门 A/门 B。

## ADR-0261 M2 Provider 完整性断言读取同 turn 持久化结果；新建 WIN7-51

- 状态：Accepted（2026-10-22）。负责人在本会话对“按最小修复方案换发WIN7-51，由pi实施、Codex独审，审核后本地提交、双构建并复验”的明确提议回复原话：“批准”。批准范围以该提议和 `outputs/a9-39-w50-package-prep/supplement/M2_FIRST_FAILURE_ANALYSIS.md` 为准。
- 事实：WIN7-50 Win7实机开发补证run `9bc099eb-ad69-4a8c-838f-49c35db2fbd2` 的M2 A02 FAIL。驱动supplementTurn返回终态事件data，A02却要求其中outcome为failed；实际失败事件不含该字段。同run隔离数据库只读取证确认六种异常响应的持久化status/outcome均failed、tool_start为0，原证据确认无文件写入。原HALTED及FAIL不改判。
- 决定：仅修驱动M2 A02取证与判定，从同一turnId的持久化记录读取status/outcome，并核终态事件为turn_failed；保留异常零工具、无文件副作用与正常正控，补齐缺失、错配、矛盾与副作用反例。不以事件名替代持久化结果。由pi实现、Codex独立审核，只报P0/P1；审核通过后本地提交、两个干净目录构建，并在开发通道复验。
- 身份：驱动属于包内字节，新建WIN7-51，沿A9-39既有允许路径同步候选身份及候选外开发/补证输入；WIN7-50的包、首失败与原始证据全部保留，禁止原地覆盖或重用已消耗run。目标先核status，再以新不可变run执行最短真实链路及受影响合同项。
- 边界：不改产品、Core、Gateway、权限、持久化格式、超时或安全判据；不批准推送、冻结、门A/门B，不解除M5实际配置/凭据读取禁令；KL-13产品修复延期RC及其他UNKNOWN保持。

## ADR-0262 M2 Runner 控制管道异步错误有界失败；新候选 WIN7-52

- 状态：Accepted（2026-10-22）。负责人对M2_RUNNER_REPAIR_PROPOSAL.md明确范围回复“批准按提案实施”；提案及SHA见A9-39 §11.8.97。
- 事实：WIN7-51 Win7 DEV真实audit_output Stage在SQLITE_CONSTRAINT_TRIGGER后观察到未处理EPIPE；开发机相同Runner的真实OS管道最小反例堆栈指向取消stdin.end。具体Win7写点UNKNOWN，M2旧FAIL/HALTED保持。
- 决定：A9-39新增native-transport.ts、native-transport.test.ts与a9-audit-integrity.test.ts三条精确路径。首次写入前处理stdin异步错误，保留首个审计失败，request/cancel/release统一fail-closed且有界结算；不以kill或stdin关闭证明清理。主代理实现、独立审核；通过后本地提交、双干净构建拟WIN7-52并在既有开发通道范围内复验。新候选创建前核号，WIN7-51包/首失败/历史证据不改。
- 边界：不改协议、权限、持久化格式、原生组件、依赖及正式判据。不批准推送、发布、冻结或门A/B；不解除M5禁令。DEV结果不能提升为正式PASS。

## ADR-0263 M4后检将准确直接映像SogouExe记录为环境进程

- 状态：Accepted（2026-10-23）。负责人对M4_ENVIRONMENT_CLASSIFICATION_PROPOSAL.md完整提案回复“批准按提案实施”；收据及提案SHA见A9-39 §11.8.108。
- 事实：WIN7-52开发通道单次run3529c0f5的M4三业务断言PASS、GUI自然退出0，组FAIL。与原postflight相同WMIC列表直接确认两related实例为C:\Program Files (x86)\SogouInput\SogouExe\SogouExe.exe、ImageSource=executable_path，PID/父PID/创建时间/会话已保存并与前退树一致。旧19b28f78原映像UNKNOWN及全部FAIL不改判。
- 决定：只扩展a9-alpha2-supplement.cjs的postflight，名称为SogouExe.exe、直接来源executable_path、ExecutablePath和ImagePath均准确等于上述单一路径（名称/路径不区分大小写），且PID/父PID、非空DMTF创建时间、与授权目标一致的会话有效时，记入environment而不计related；保存原映像、PID/父PID、会话、创建时间和来源。缺失、命令行回退、错名/路径/会话、非法身份均不豁免。原SGTool规则、完整后代遍历、未知子孙与helper判据及failed失败门不变。合同反例在a9-batch2-contract.test.ts。
- 验证与执行：主代理实施，授权一个只读子代理独审本次变更和关键证据；审核通过后用新不可变输入/run、同一WIN7-52，在ENGINEERING_03常设授权内先M4，再M1与开发总控。编排器在候选外，以新SHA绑定，不重建候选或原生。安全/身份/完整性/未知生命周期失败停止下游，同类未闭环连续两轮先最小诊断。
- 放弃的保证：不再证明该准确环境进程在封存期间没有写入证据根；仍保存其身份和环境分类证据。此取舍仅覆盖上述单一映像，不扩大到目录内其他文件名或其他输入法。
- 边界：不批准提交、推送、冻结、正式门A/B、M5、系统设置或根外进程终止；原ADR-0256/0258/0259正文保留，旧失败和UNKNOWN保持。

## ADR-0264 开发总控使用受控实例清理；固定夹具的三个系统映像获有界终止例外

- 状态：Accepted（2026-10-23）。负责人对 CONTROLLER_SCOPED_CLEANUP_REPAIR_PROPOSAL.md 回复“批准选项 A（推荐）”。完整范围与提案 SHA 见 OWNER_SCOPED_CLEANUP_APPROVAL.json。
- 事实：WIN7-52 的 M4/M1 开发复验 PASS。原总控必跑中断使用 taskkill /T，release 清理也未限定映像；ENGINEERING_03 §7 禁止根外终止。新总控 b513a6ab 仅完成本地绑定与63项合同检查，实际执行 NOT_PERFORMED。
- 决定：仅开放 smoke、driver、batch2 合同测试的受控清理修复，以及既有候选身份同步。取消无边界树终止。根内实例重新核对身份；根外只允许本 run 固定 batch2 Shell 夹具准确绑定的 C:\Windows\System32\cmd.exe、C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe 和 C:\Windows\System32\PING.EXE。run/阶段/夹具摘要、工具调用或handle、PID/父PID/创建时间、SID、会话和直接映像须齐全，终止前重读；未知或错配即停止。不能凭父进程、名称、命令行推断映像或树差异授权。间接退出须纳入守卫；搜狗、其他映像和其他run不获批准。
- 执行：主代理实施，复用一个只读子代理独审。通过后本地提交任务相关明确路径、双干净构建新候选；先真实运行时守卫准入，再原中断/release短链，再原37场景/67断言与R0～R8。新编号创建前核号。候选字节和原FAIL/HALTED不覆盖。
- 放弃的保证：ENGINEERING_03 根外禁止仅对上述明确绑定的三个夹具映像产生例外；有效期仍至2026-10-28T00:00:00Z。WMI重读与按PID终止之间非原子，不能声明原子身份保证。边界无法确认时不派发或停止下游，不以等待或放宽断言替代清理证明。
- 边界：不改业务、Runner、原生、依赖、协议和原阶段判据。不批准推送、发布、冻结、M5、真实配置/凭据读取、系统设置/服务或正式门A/B。DEV结果不提升为正式PASS。原Accepted ADR及ENGINEERING_03正文保留。

## ADR-0265 候选外总控退出观察先校验再提交

- 状态：Accepted（2026-10-23 UTC）。负责人对CONTROLLER_EXIT_OBSERVATION_REPAIR_PROPOSAL.md回复“批准”。提案SHA为944a237d67832618d97f9e08591041e65c880d54a41f959a187587d98f2492b7。
- 事实：WIN7-54/source9b38524的原p06/p05开发短链PASS；完整DEVa46f89ee首因writer-registry.ps1:228解引用空ExitTime。原p04后续独立写出六用例PASS，不能改判该总控HALTED。
- 决定：只在新候选外包.acceptance/a9-39/w54-dev-controller-package-r2修复tools/writer-registry.ps1，必要时同步trace-contract.cjs和environment-process.test.cjs，增加writer-exit-observation.test.cjs、writer-exit-selfcheck.ps1；新包工具清单、SHA、传输及运行绑定同步。一次捕获并校验准确实例退出时间/码后，再记录及提交观察状态。null、异常、1601、早于创建时间和未知码保持UNKNOWN；仅有完整同PID/创建时间的WMI缺席或代际替换证明时记录代际结束，不伪造OS退出时间/码或自然退出0。写入失败保持阻断，不能制造零写者。既有零线程终态的严格身份条件不弱化。
- 执行：主代理实施，复用一个只读子代理独审。开发机窄检查及实际Win7 PS2能力/故障准入通过后，同一WIN7-54先原p04短链及生命周期，再新run完整37用例67断言和R0～R8开发复验。独立M1～M4/M6在写入者身份重新核验后顺序继续，M6仍限组件跨读。
- 边界：不改原包r1、候选ZIP、产品、原生、分类或终止权限；无Terminate/Stop-Process/taskkill回退。不提交、推送、冻结、发布、M5、正式门A/B或系统修改。期限、严格SSH、单写者、普通agent/SID/会话及C:\A9-DEV边界沿用。原首败、HALTED和UNKNOWN保留。

## ADR-0266 原总控候选外退出拒绝原因诊断

- 状态：Accepted（2026-10-23 UTC）。负责人对GPU_EXIT_DIAGNOSTIC_SCOPE_PROPOSAL.md回复“批准按提案实施（推荐）”；提案SHA eee747c30e07d52da6afd04ceb3e9a7953cba3031293b14eb2c1e61fa85a8860。
- 事实：WIN7-54 M2原6 Stage/13断言DEV PASS；完整c609e0e6因GUI OS退出事实UNKNOWN在原GPU门HALTED。最小PS2/PS5均取得有效事实；两轮单GUI诊断未证明原缺口原因。原r2已执行且不可覆盖。
- 决定：以原r2精确94件封存字节建立新.acceptance/a9-39/w54-dev-controller-package-r3；只修改writer-registry.ps1的Capture固定拒绝枚举及原generation-end行的同次拒绝字段，同步writer-exit-observation.test.cjs、writer-exit-selfcheck.ps1和必要工具清单/SHA/传输/输入/运行绑定。trace-contract.cjs仅在字段合同确需时适配。枚举限提案16个拒绝值，有效值仍VALIDATED_HANDLE_EXIT；不输出原值或异常文本。
- 不变项：原属性读取次数及顺序、有效性谓词、WMI完整证明、ExitFacts/ExitSeen提交顺序、代际结束后的Dispose、原环境、GPU/R7判据、分类和终止边界。其余执行组件逐字节保持；不在代际结束后保留observer或追加采样。
- 执行：主代理实施，复用同一只读独审。窄验证、实际PS2和默认PS5自检通过后，仅一个新不可变原总控DEV run，原37用例67断言和时间预算不变，GPU门通过才继续p03～p10。失败即停止依赖项、保留准确拒绝与原始事实并回收；无自动整批重试。
- 边界：同一WIN7-54/source9b385246/ZIP3737852a，不改产品、原生、候选ZIP、捕获器或profile。无提交、推送、冻结、发布、M5、正式门A/B、系统或账户修改、根外进程终止。严格SSH、单写者、C:\A9-DEV、普通agent/SID1001/session2及原期限不变。旧输入与首败/HALTED/UNKNOWN均保留；诊断不等于修复或正式PASS。

## ADR-0267 原绑定 Process 缓存刷新与零等待信号准入

- 状态：Accepted（2026-10-23 UTC）。负责人对GPU_EXIT_CACHE_REPAIR_PROPOSAL.md回复“批准按提案实施（推荐）”，提案SHA1e8bd63c0547289a7e52fce28b5afcd8e90e9a76cb2d041a4db846101dec92a6。
- 事实：WIN7-54原M2开发实机13断言PASS；r3唯一总控4adca5c3在GPU门HALTED，GUI5164同次终态与trace准确记录EXIT_TIME_1601，生成机制仍UNKNOWN。R8进程/任务/环境列表空，旧输入及首败不可变。
- 决定：以封存r3的94件精确字节建立新.acceptance/a9-39/w54-dev-controller-package-r4，仅开放tools/writer-registry.ps1的Capture局部修复、writer-exit-observation.test.cjs、writer-exit-selfcheck.ps1及必要清单/SHA/传输/输入/运行绑定。在同一已绑定Process对象上，先Refresh，再要求WaitForExit(0)严格bool true，然后原HasExited/Id/StartTime/ExitTime/ExitCode各一次及全部原谓词。新增固定拒绝仅OBSERVER_REFRESH_THROW、EXIT_SIGNAL_READ_THROW、EXIT_SIGNAL_NOT_CONFIRMED；失败保持UNKNOWN，不能按PID重绑。
- 不变项：WMI完整代际证明、写后提交ExitFacts/ExitSeen、Dispose时点、LiveKeys、Wait-Writers、Close-Observers、GPU/R7、profile、捕获器、分类、终止及全部时间预算逐字节保持。不保留代际结束后的observer、不新增原生API或组件。
- 执行：主代理实施，复用同一只读独审。窄合同及实际Win7 PS2/默认PS5故障/自然退出/原句柄保持自检通过，并记录PS/CLR/System.Diagnostics程序集身份后，仅一个新不可变原总控DEV run，原37用例67断言及R0～R8，GPU仍是前置。失败即停并回收，不自动重试或增加单GUI入口。
- 边界：不改产品、原生、候选ZIP或依赖；不延长等待、减少断言或改判旧HALTED。无提交、推送、冻结、发布、M5、正式门A/B、账户/系统/服务修改或终止扩权。原目标、严格SSH、C:\A9-DEV、普通agent SID1001/session2、单写者及原期限保持。公开源码仅为假设依据，不能替代目标CLR或实机结果。

## ADR-0268 M5 两文件隔离密文例外与候选外费用准入

- 状态：Accepted（2026-10-23 UTC）。负责人对M5_DEV_ADMISSION_PROPOSAL.md回复“批准按提案实施（推荐）”；提案SHA2981f0752161372649a15764974d6e1400a263a033e9bed48b65ff6c7ce34e33，回执m5-admission-r1/OWNER_APPROVAL.json。
- 决定：仅普通agent在本run内读取固定provider配置及API-key DPAPI record两文件，验证物理路径/65536字节/白名单后，在新隔离根重建配置并复制密文；不读其他vault，不写原配置/数据库，不解密或回传。由候选产品同账户safeStorage恢复。此为ENGINEERING_03 §7两文件的单轮例外，其他禁止不变。
- C14：新.acceptance/a9-39/w54-dev-m5-package-r1仅开放提案§5逐项文件和必要同SHA输入、绑定/传输清单；主代理实现，原driver字节/两Stage/六断言/超时保持，新bootstrap先安装仅拒绝的费用守卫再加载原driver。配置复制函数仅收窄两文件并增加固定错误/物理路径/大小检查。
- 费用与模型：US$1发送准入，40HTTPS/3Turn/1MiB不变；每请求按已核官方容量/高峰费率预留US$0.786432，最多一个未结算；直接核原SSE usage，未知/错误保留预留并停止，不借Gateway缺失默认0，不增加请求参数。保留deepseek-v4-flash请求字面量，接受当前V4.1-Flash-1017公开路由；精确权重不能证明时UNKNOWN。价格/映射执行前再核，变化即停。
- 执行：主代理窄验证、一个只读独审及实际Electron22/Node16无网络自检通过，fresh身份/候选完整闭包/日额度准入后，仅一轮原M5 rehearsal→main DEV。总墙钟3600秒，原600/1800秒Stage，执行窗口≤8小时且不越常设授权期限；失败即停并按既有边界收尾，不重试M5或重跑37/67。前组证据仅INHERITED_EVIDENCE，不伪造同run正式消费。
- 边界：同一WIN7-54/source9b385246/ZIP3737852a，不改产品、原生、原driver断言、候选ZIP或依赖，不提交、推送、冻结、发布、正式门A/B、系统/服务/账户、原用户数据或终止扩权。旧Accepted ADR及所有首败/HALTED/UNKNOWN保留。结果上限Win7 DEV，不签Alpha2/RC PASS。

## ADR-0269 M5 profile 密钥恢复的条件例外与复验

- 状态：Accepted（2026-10-23 UTC）。负责人对M5_SAFE_STORAGE_PROFILE_REPAIR_PROPOSAL.md及完整批准选项回复“批准”；准确SHA13ac240b328b6eb3d684a1f4aa08638951733b857dcb21b4bd32737e0b202a07，回执m5-admission-r1/OWNER_PROFILE_REPAIR_APPROVAL.json。
- 事实：WIN7-54的M5 runc506ff62在A01恢复处FAIL，真实模型请求0，旧首败及输入封存。Electron22.3.27/Chromium108的safeStorage使用OSCrypt profile AES key，由Local State的os_crypt.encrypted_key经Current User DPAPI包封；同SID不足以证明跨profile恢复。此为D-018/ADR-0062机制补充，不改保护方式、schema或旧Accepted正文。实际原因仍须目标对照证明。
- C14：仅开放新.acceptance/a9-39/w54-dev-m5-package-r2内提案§5列出的supplement、profile-key-copy及测试、restore-diagnostic及测试、dev-entry、capability-selfcheck、evidence-scan及测试、prepare/identity/launch/inventory、准确绑定和传输清单。r1守卫/bootstrap/原driver及规定同SHA依赖不改。主代理实施与目标操作，复用同一只读独审。
- 例外与顺序：原两个固定文件普通agent只读一次形成同字节隔离副本；第一组无网络诊断须准确证明记录/路径/vault/保护可用且CREDENTIAL_DECRYPT_FAILED、网络0及自然退出，才可读取固定C:\Users\agent\AppData\Local\Win7CodingAgent\Local State，限65536字节、逐级物理路径及held-fd稳定验证。仅提取规范DPAPI前缀Base64的os_crypt.encrypted_key密文字段，其他字段不使用/复制/回传；不调用解密API或读取明文。字段是profile级敏感key材料，不称普通配置。第二组新profile及后续main仅在Electron初始化前CreateNew写入最小Local State，第一组不预置。
- 执行：窄验证、独审、实际Node16合成无网络自检通过后，最多两组各120秒诊断；其余环境保持。第二组正常产品恢复key/source dpapi、无诊断且网络0/路径匹配/自然退出，经同一只读独审后，仅一轮原M5两Stage/六断言DEV。任一条件失败即停，不增第三组或自动再跑。US$1、40HTTPS/3Turn/1MiB、600/1800秒Stage、3600秒总墙钟及600秒准备含诊断/复核，原截止2026-10-23T15:01:04.321725Z保持。
- 回收：目标下载前使用既有扫描器、内存正控；白名单普通文件集合须与扫描/封存inventory/传输集合精确相等，逐层拒绝链接、未知及额外项，扫描前后身份/大小/SHA与inventory绑定，回收只下载封存且复核一致的集合；不自动纳入未扫描新报告，不形成循环hash。真实credential literal扫描NOT_PERFORMED，不为扫描取得明文。r1漏接下载前扫描的缺口不追补PASS。
- 边界：WIN7-54/source9b385246/ZIP3737852a、产品/native/原driver/环境/终止边界不变。固定源Local State不适用或恢复失败时不搜索其他profile、不启动原profile。不改原配置/用户库，不读其他vault、cookie或profile；不提交/推送/冻结/发布/正式A/B/系统修改或根外终止扩权。旧FAIL/HALTED/UNKNOWN保留；DEV不等于正式验收。

## ADR-0270 复用隔离恢复材料的新M5有界窗口

- 状态：Accepted（2026-10-23 UTC）。负责人批准M5_FRESH_WINDOW_PROPOSAL.md，回复“批准新窗口提案（推荐）”，准确SHA21812a596c76a6c2babb816eac7fa8831d90ad8da50e92b45f486c8ce592c535；回执OWNER_FRESH_WINDOW_APPROVAL.json。
- 事实：r2实际恢复两组PASS、网络0、自然退出、目标扫描/回收及独审PASS；M5在600秒准备门前停止、NOT_PERFORMED、请求0。旧run不重计时，原r1 A01 FAIL保持。
- C14：仅新增.acceptance/a9-39/w54-dev-m5-dispatch-r3内提案§5逐项路径和规定同SHA输入；主代理实施/目标操作，同一只读独审。r2产品/native/ZIP/driver/费用守卫/原Stage/环境/分类/终止不改。只改main继承材料准入/预置接线及准确调度绑定。
- 材料：仅普通agent读取旧6857d9bb隔离根下提案§4准确九件，有界普通物理路径/held-fd检查；三件材料CreateNew复制到新root，其他四件配置/密文仅同字节核对，两stamp用于原三个源metadata稳定性复核。原用户三个源文件内容不再打开，不重新提取Local State、不解密或取得明文，不复制其他profile/vault/数据库。九件内容/聚合值不持久化或输出hash/size，内部字节比较仅投影固定布尔；源metadata不回传。
- 窗口：新run首次新目标准备起3600秒总额，准备最多300秒，原rehearsal600/main1800/恢复600不增。新准备前原绝对截止2026-10-23T15:01:04.321725Z须完整容纳3600；派发M5前实际必须余3000秒，未知/不足即停。新window只一轮原M5两Stage/六断言，US$1/40HTTPS/3Turn/1MiB及费用守卫保持。不重跑两组或37/67，不再开窗口或自动重试。
- 执行：本地窄验证/独审→目标本地逐SHA复制26件非秘密执行输入及少数新输入→实际Node16合成新准入→普通agent旧材料适用性/三件复制→原扫描/严格回收/同一只读复审→fresh时间/身份/额度/费率→唯一原M5→扫描回收/自然退出。继承旧准入准确标INHERITED_EVIDENCE，新结果单独绑定新run及父输入/结果SHA。
- 边界：新run/root批准后生成，旧root/输入/结果不改。管理账户不读任何work/data/profile。不新增库/原生/系统API、配置/服务/账户改动、提交/推送/冻结/发布/正式A/B或终止扩权。DEV不提升正式PASS，旧首败/HALTED/UNKNOWN保留。

## ADR-0271 M5 Python 模块导入的零模型最小诊断

- 状态：Accepted（2026-10-23 UTC）。负责人对M5_PYTHON_MODULE_DIAGNOSTIC_PROPOSAL.md准确SHA266d467e8748af3071232d91c118797759f9c8b1cb614954aef1f706511cb5d3回复“批准仅零模型导入诊断（推荐）”；回执OWNER_PYTHON_DIAGNOSTIC_APPROVAL.json。
- C14：仅开放.acceptance/a9-39/w54-dev-m5-python-diagnostic-r1内提案§4准确输入和同SHA依赖，主代理实施/目标操作，同一只读独审；旧r3和候选不可覆盖。
- 读取：普通agent仅对旧12fb889e中文workspace下calc.py/test_calc.py查询metadata/realpath；仅两个固定解释器旁python._pth/python38._pth可各≤65536字节held-fd读取并投影固定事实。内容/值/路径列表/hash不回传；不读原三个用户源、密文/profile/数据库。管理账户只处理非秘密输入。
- 执行：新run/root，一次300秒窗，诊断最多60秒，最多三Python调用各10秒/输出合计65536字节；首探针按原PATH核规范化sys.executable和固定exe SHA，后两调用用该准确绝对exe，测试原fixture与单进程sys.path插入对照。只观察自然退出，不终止根外进程；身份/完整性/生命周期未知即停。解释器路径不匹配不回退或找其他工具。
- 证据：本地窄检查及只读独审后，实际Electron22/Node16先合成自检，再一次诊断，目标扫描/正控/严格清单回收和收尾。仅证明同解释器导入行为，不直接证明原产品Runner修复或M5通过。
- 边界：零模型请求/费用新增0；原M5 A03 FAIL、11请求及未结算预留保持。WIN7-54/source9b385246/ZIP3737852a不变，不修改系统/PATH/_pth/产品/native/原driver/费用守卫/模型/预算，不重跑M5/37/67，不提交/推送/冻结/发布/正式A/B或扩大终止权限。

## ADR-0272 隔离 Python 运行时与实际 Runner 零模型短链

- 状态：Accepted（2026-10-23 UTC）。负责人对M5_PYTHON_RUNTIME_RUNNER_CHAIN_PROPOSAL.md准确SHA ddb58d5c4fa3a527f5d3beccb0b8ae2a3759746dae308448256b3f6518f5c8cc回复批准，限提案固定路径、一次登记ZIP上传展开、一次零模型请求短链与900秒窗口；回执OWNER_PYTHON_RUNTIME_CHAIN_APPROVAL.json。
- 事实：ADR-0271实机对照证实固定嵌入式CPython 3.8.10因python38._pth使脚本目录不在sys.path；产品TrustedShellRunner继承进程PATH。产品Runner路径下的红→绿结果UNKNOWN。
- C14：仅开放.acceptance/a9-39/w54-dev-python-runner-chain-r1内提案§4所列路径及规定同SHA依赖；主代理实施与目标操作，同一只读独审。产品/native/候选ZIP/原M5 driver断言/费用守卫/预算不改。
- 运行时：登记ZIP abbe314e…经通道cand上传展开到C:\A9-DEV\cand\abbe314e9b41603d\expanded\；新根C:\A9-DEV\m5-pychain\<run前8位>\py38\按inventory逐文件核SHA复制31件，并放入开发机生成、SHA绑定的本run python38._pth。不读取或修改C:\acceptance\python38_mvp；git沿用r3 SHA核对、--version与PATH。
- 执行：本地窄检查/独审→实际Electron22/Node16合成准入→一次loopback夹具短链（身份→原测试业务失败→固定修复→OK→build PASS→acceptance_check到达缺multiply）→目标扫描/严格回收/自然退出。900秒窗、一次、失败即停；非probe夹具请求8、Node层非loopback连接0，Chromium网络栈NOT_PERFORMED。
- 边界：模型请求0；不重跑M5/37/67/M1～M4，不改1MiB/US$1/40请求/3Turn，不读凭据/profile/用户配置，不改系统/服务/账户/共享工具，不提交/推送/冻结/正式A/B/发布或终止根外进程。原M5 A03 FAIL、11请求及786432000 nanoUSD未结算预留保持；DEV结果不提升正式PASS。

## ADR-0273 隔离 Python 的新 M5 单轮 DEV 执行与累计费用承诺

- 状态：Accepted（2026-10-23 America/Los_Angeles）。负责人在三项推荐方案列明后回复“继续推进”。绑定 M5_R4_EXECUTION_PROPOSAL.md 修订 r3，SHA256 8fecf897bda482485b446a07766f5a8f61ada38f7cb886ce8167e3d74242c237；回执 OWNER_M5_R4_APPROVAL.json。
- 裁决：D1=B2，仅本 DEV run 累计原始响应上限 8,388,608 字节。单帧缓冲 1,048,576、prompt 容量和每请求预留公式不变。不改 release 合同或 Accepted ADR，本轮 DEV 结果不等于 1MiB 合同结果，正式 M5 上限另裁。D2=甲，保留旧 run US$0.8036853 承诺上界与费用 UNKNOWN，新 run 独立 US$1，接受两轮累计承诺上界 US$1.8036853。累计台账只作记录，不替代发送守卫。D3=原 US$1/40 HTTPS/3 Turn，仅一轮 rehearsal→main。
- C14：仅开放 .acceptance/a9-39/w54-dev-m5-dispatch-r4/ 内提案 §9 所列明确文件与规定同 SHA 依赖。包生成器、派发器、解析探针、封存、回执、累计台账及证据沿用 outputs/a9-39-w52-package-prep/m5-admission-r1/。主代理实施和目标操作，同一只读审核者核对新实现、实际材料准入及结果。
- 运行时：复用已登记 cand/abbe314e…展开目录，核 32 件集合，31 件逐 SHA 复制至新根 py38；本 run 生成的三行 UTF-8 无 BOM/CRLF/末行换行 _pth 绑定 main 中文空格工作区。不读取或修改共享 python38_mvp；git 仍按原固定 SHA/版本/PATH。产品、native 与 WIN7-54/源9b385246/ZIP3737852a不改。
- 材料：仅普通 agent 在窗口内准入读取旧6857d9bb根的九件固定材料并 CreateNew 复制三件；原三个用户源只核 metadata，不读内容、不重新提取或解密，不输出材料值/hash/size。管理账户不触碰旧 work/data/profile。缺件或 stamp 不符即停、窗口作废、模型请求0、重新提案，不另找材料。
- 窗口：首次新目标准备起3600秒，准备最多300秒，派发前足额余3000秒；原rehearsal600/main1800/回收600。批准有效期最多8小时且不晚于2026-10-28T00:00Z，本run采用更短固定截止，见回执。首次准备距UTC日界至少3900秒，运行当日与授权日一致。只一次，失败即停，不自动重试或另开窗口。
- 顺序：本地窄检查→实现独审→窗口前状态/实际PS2只解析预检/非秘密输入metadata/派生driver上传→prepare→实际Node16合成准入与Python闭包→普通agent材料门→目标扫描/严格回收/同一只读复审→fresh时间/日界/身份/额度/官方费率门→唯一M5→扫描/回收/自然退出/结果独审。身份、完整性、审计或生命周期 UNKNOWN 停止全部下游。
- 排除：不重跑37/67、M1～M4、M6或短链；不改六项断言、系统/服务/账户/共享工具、TLS或终止权限；不提交/推送/冻结/发布或签正式门A/B。原FAIL/HALTED/UNKNOWN与旧不可变输入和证据保持。

## ADR-0274 A04 零模型失败调用取证

- 状态：Accepted（2026-10-23 America/Los_Angeles）。负责人对提案r4回复“批准”。准确SHA256为b66ac0fa9d1592286c591fbef1610c56467290e7f362c01496226d1698859474，回执OWNER_A04_DIAGNOSTIC_APPROVAL.json。
- C14：仅开放.acceptance/a9-39/w54-dev-a04-event-diag-r1内提案§4逐项列明文件。本地生成器、派发器、解析/元数据探针及证据沿用outputs/a9-39-w52-package-prep/m5-admission-r1/A04_*；原始回收写outputs/win7-dev/m5-a04-diag/<run前8位>/。旧输入不覆盖。
- 执行：主代理实施和目标操作，同一只读审核者。新根一次900秒，准备/Stage/回收各300秒，派发前须完整剩余600秒。最多一个Turn、三次固定Python调用、四个非probe HTTP请求和一个probe HTTP请求。合成准入不得额外执行Python --version。
- 范围：固定夹具仅把add修为加法、测试新增未实现multiply导入。实际WIN7-54产品与TrustedShellRunner执行身份/编码白名单、原命令失败、子进程UTF-8对照。保留过滤前事件及资格排除原因。旧r4根因始终UNKNOWN，不补签旧事件或改判旧FAIL。
- 运行时：复用登记cand/abbe314e…展开源，缺件即停不另找或上传展开。新Python副本31件逐SHA复制，并生成本run三行_pth。普通agent/session2/Medium/非管理员执行；不读取旧work/data/profile、配置、密文或Local State。git仅沿用固定SHA/版本/PATH例外。
- 硬门：身份、完整性、权限、必需审计、协议或生命周期失败停止下游；未知退出不启动扫描。自然退出后fresh status、目标下载前扫描/正控/phase2正控、集合相等和逐size/SHA回收。不得重置计时或自动重试。
- 边界：真实模型请求0，不重跑M5、37/67或其他旅程。不改产品/native/ZIP、原M5提示词/断言、费用守卫、系统/服务/账户/共享工具或终止权限。旧费用UNKNOWN与未结算预留保持。不提交/推送/冻结/发布或签正式门A/B。

## ADR-0275 A04 模式顺序修复与一次新取证窗口

- 状态：Accepted（2026-10-23 America/Los_Angeles）。负责人对准确SHA875da75d6def2383570852231521c5806485c17cf7c4a3cbef5d938da488af3c的提案回复“批准”。回执A04_R2_OWNER_APPROVAL.json，继承原b66ac0fa…提案§3～§7的全部边界。
- C14：仅开放.acceptance/a9-39/w54-dev-a04-event-diag-r2内与r1相同19文件。本地工具/证据限既有m5-admission-r1/A04_R2_*。新run/根/期限/绑定/三行_pth/封存，r1全部输入、seal、失败与窗口保持。
- 修复：仅重排新driver的SUPPLEMENT_MODES末两项，使其与表项顺序一致；严格顺序guard不改。新准入从准确派发driver源码提取实际数组、表键和guard，执行完整表通过/缺项拒绝/额外拒绝/乱序拒绝；保留原61项。准入与seal须绑定该driver SHA，不符即拒绝。
- 执行：主代理实施与目标操作，同一只读独审；本地窄检查→独审→窗口前预检→新prepare→实际Node16准入/准确模式guard→唯一三步诊断→自然退出/fresh status→目标扫描/严格回收→结果复核。900秒、一个Turn、最多三Python调用、四非probe加一probe请求，无额外Python探测。
- 边界：失败即停，不自动重试或延长/重置计时，不读取旧work/data/profile。其余身份、Python来源、网络、审计、回收、费用与终止边界继承ADR-0274；旧r4根因UNKNOWN，不补签旧事件。产品/native/ZIP/原M5提示词及断言不改，无新M5/真实模型/系统修改/提交/推送/冻结/正式A/B。

## ADR-0276 原命令编码配置的一次实机验证

- 状态：Accepted（2026-10-23 UTC）。负责人回复“批准本轮一次实机验证”，绑定M5_A04_ENCODING_OVERLAY_VALIDATION_PROPOSAL.md/r2，SHA256 0fa3761d650905e0ac6bdb6d3f6ec28e1bcc58fb170a8ce539e23c061af5d6c6。回执A04_OVERLAY_OWNER_APPROVAL.json；提案只读复核0P0/0P1/0P2，A04_OVERLAY_PROPOSAL_REVIEW.json。
- C14：仅开放.acceptance/a9-39/w54-dev-a04-encoding-overlay-r1内提案§4同19文件。本地生成器/派发器/检查/回执/证据限既有m5-admission-r1/A04_OVERLAY_*；新run/根/固定期限见批准回执，旧输入保持。
- 验证：通过现候选公开configureShell设置PYTHONIOENCODING=utf-8。启动进程清除固定两项继承编码变量，只核不存在；不改持久环境。一个Turn最多两次Python：准确身份且两标准流UTF-8门→原python test_calc.py可读业务失败、完整事件与原命令资格→安全/审计/生命周期完整且idle时恢复空配置。失败或恢复未完成不能PASS。
- 执行：主代理实施与目标操作，同一只读独审；本地窄检查/独审→窗口前预检→新prepare→实际Node16准入/driver SHA模式guard→唯一短链→自然退出/fresh status→目标扫描/严格回收→结果复核。一次900秒、准备/Stage/回收各300秒，派发前足额余600秒；最多3非probe加1probe HTTP，无额外Python探测。
- 边界：沿用ADR-0274/0275身份、运行时、网络、审计、扫描/回收和终止硬门。无自动重试、真实模型或新M5；不改产品/native/ZIP、原M5提示词/断言、共享工具或系统。旧r4根因UNKNOWN、原M5 FAIL、费用与预留保持。无构建、提交/推送/冻结/发布或正式A/B。

## ADR-0277 M5 编码配置及引用澄清持续推进

- 状态：Accepted（2026-10-23 UTC）。负责人原话“窗口费用都没关系，持续推进”。具体执行合同M5_R5_EXECUTION_CONTRACT.md/r1，SHA256 349ac37b7a3d7b3ddc09ff0e9a05eb9ede70d4361fc21a0d32fb51d62f54753c；回执R5_OWNER_APPROVAL.json。当前执行参数采用原有有界预算，不解释为无限消费。
- C14：仅开放合同§3的r5及条件满足时r6包各同31件及同节明确本地工具/证据路径。只改M5公开工作区UTF-8设置/恢复、A02通用引用说明及对应绑定/拒绝检查/固定新证据名；原六断言、3Turn、命令、资格函数和费用守卫保持。产品/native/ZIP不改。
- 预算：最多2个新run，每run独立US$1/40HTTPS/3Turn/3600秒，原准备300/派发余3000/rehearsal600/main1800/回收600保持。累计响应8MiB只属DEV，单帧1MiB和原预留公式不变。已记录承诺871663800 nanoUSD保持，本批新增上限2000000000，总2871663800；旧费用UNKNOWN/预留不清零，每日计数从35起核验。
- 顺序：本地和实际Node16新工具准入、同一只读实现/材料/结果审核后执行。旧6857d9bb九材料/三复制只由窗口内普通agent处理；管理账户不触碰旧work/data/profile。r79配置结果仅同包同配置继承，本run仍核公开入口和真实命令。
- 重试：只允许一次有证据支持的同范围普通夹具/提示词/配置接线修正，须旧进程全部自然结束及硬门完整，用新不可变r6/run。无未知原因盲重试；同类连续两轮未闭环先诊断。身份/权限/完整性/安全/审计/未知生命周期失败停止下游。
- 边界：旧失败和费用保持；不改系统/共享运行时/秘密来源或终止权限，不提交/推送/冻结/发布，不执行正式A/B。

## ADR-0278 正式 M5 采用 r5 工具版本并登记 KL-14

- 状态：Accepted（2026-10-23 UTC）。负责人2026-10-23T14:47:08Z选定选项甲：“正式 M5 采用 r5 工具版本（工作区编码配置、A02 澄清、8MiB），并以已知限制登记”。随后批准WIN7_54_FORMAL_M5_FREEZE_GATE_A_PROPOSAL.md r3，SHA256 5add0194b3b47605a2cbf503d80c240a05187cfe90f8c1d550973f15009bb983，按其§10批准文本登记；回执OWNER_FREEZE_GATE_A_APPROVAL.json，审核回执FREEZE_GATE_A_PROPOSAL_REVIEW.json。
- 决定：正式 M5 的判据以修订后的 `A9_ALPHA2_SUPPLEMENT_VALIDATION.md` 为准。累计原始响应上限由 1,048,576 字节改为 8,388,608 字节；单个 SSE 帧缓冲仍为 1,048,576 字节；40 次 HTTPS、3 个 Turn、每 run US$1 准入、预留公式和六项断言不变。工作区编码配置、验收环境、A02 提示词说明按合同 §6 与 §3 执行。补充组总墙钟由7200秒改为9000秒，M5请求开始时剩余须≥3600秒。
- KL-14：按合同 §8 的实测与推断两栏登记；产品默认修复延期到 RC，退出条件见提案 §5。
- C14：`release/win7-product-v3/A9_ALPHA2_SUPPLEMENT_VALIDATION.md` 只开放补丁所列七处：第 3 行状态句、§2 第 43 行补充组预算、§3 M5-A02 行备注列、§6 第 1 段末句、§6 第 2 段上限句、§6 新增的验收环境与编码配置两段、§8 新增 KL-14 一条；其余内容不改。另开放 `.acceptance/a9-39/w54-gate-a-package/**` 与 `.acceptance/a9-39/w54-formal-supplement-package/**`，生成器与检查脚本放在 `outputs/a9-39-w52-package-prep/` 下。任务书 §3 允许路径表同步登记。
- 准备工作：从 source 9b385246 重跑双构建补记录，产物须与 ZIP 3737852a 逐字节相同，否则停止；本地冻结 WIN7-54；文档与合同一次本地提交、不推送。正式 M5 的 Python 经门 A 运输登记 ZIP，凭据按 ADR-0268/0269 在正式 run 内读取。正式总控 1 次。按允许差异清单比对后，M1～M4、M6 开发模式各彩排一次，M5 彩排一次，然后执行 close。
- 可比性：修订后的正式 M5 结果不等于原 1MiB 合同的结果；原条款对此前所有 run 仍有效，旧 FAIL/UNKNOWN 不改判。本 ADR 只修订正式判据，不扩展 ADR-0277 只属 DEV 的授权。
- 边界：不改产品、native、候选 ZIP；ADR-0268、0269、0270、0272、0273、0276、0277 不修改。正式执行仍须门 A 签发，门 B 另行裁决；不推送、不发布。

## ADR-0279 收紧 M5 J1 提示词以降低 A02 重复引用失败

- 状态：Accepted（2026-10-24 UTC）。负责人原话：“选乙：收紧 J1 提示词、判据不变，登记新 ADR 与合同 §3 A02 备注，派生驱动新 SHA 经审核后再做一次 M5 DEV 彩排（独立 US$1/40/3 Turn），然后 close 与门 A 材料。”
- 背景：G9 补充组彩排 run 4424c5f7 中 A02 FAIL，J1 回答第 3 处 `calc.py:2` 未附完整原行；r4 run ff6c400e 的 A02 首败同类，r5 run d951c847 通过。正式 M5 无自动重跑。
- 决定：J1 提示词在 ADR-0278 原文基础上增加“`calc.py:1`、`calc.py:2` 各只写一次，此后以‘第1行’‘第2行’指代，不再写 `calc.py:` 加数字”。A02 判据（每次出现 `calc.py:行号` 都须附完整原行、必须读取 AGENTS.md/README.md/calc.py、须含原句）与其余五项断言、8 MiB/1 MiB/40/3 Turn、编码设置与恢复不变。
- C14：`release/win7-product-v3/A9_ALPHA2_SUPPLEMENT_VALIDATION.md` 只改 §3 M5-A02 行备注列；`.acceptance/a9-39/w54-formal-supplement-package/**` 内派生驱动只改 J1 提示词字符串，并同步合同副本、拒绝集（补入已消耗 run）、DEV 授权的累计口径与封存清单。
- 预算：新增一次 M5 DEV 彩排，独立 US$1/40 HTTPS/3 Turn。记录承诺上界由 1,002,585,300 增至不超过 2,002,585,300 nanoUSD；旧费用 UNKNOWN 与 786,432,000 未结算预留保持；执行日计数按当日台账核对，上限 200 次/UTC 日。
- 边界：不改产品、native、候选 ZIP、A02 判据或其他断言；单次 PASS 只说明改善，不证明稳定。正式门 A/B 另行签发与裁决；不推送、不发布；ADR-0278 不修改。

## ADR-0280 正式门 A 执行允许经 Tailscale 中继

- 状态：Superseded by ADR-0284（2026-10-25 UTC；原 Accepted 2026-10-24 UTC）。负责人原话：“允许正式门 A 执行走 Tailscale 中继：给总控包也改为按字节换算超时，经中继做一次总控 DEV 彩排后再生成门 A 材料。”
- 背景：开发机不在验收机局域网。经 Tailscale（Win7 100.80.221.58，relay hkg，往返约 0.4～0.5 秒，上传约 230 KB/s）的三次补充组上传两次成功、一次中途被远端重置；run 61811bb0 经中继完成六组 PASS。
- 决定：正式执行的 SSH/SFTP 目标地址限白名单两个值：局域网 192.168.1.9 与 Tailscale 100.80.221.58；每个 run 选定一个并写入描述符、授权与证据。HostKeyAlias=192.168.1.11 严格核对、目标机器名/SID/会话与 R1 目标网卡含 192.168.1.9 的身份检查均不变。
- 总控包：SSH 目标从白名单选取；SFTP 上传与回收下载超时按计划字节与文件数换算（不低于原值），总墙钟等预算在预算合同内同步调整并逐项披露；生成门 A 材料前经中继做一次总控 DEV 彩排。补充包保持修复轮 5 字节不变，正式执行以环境变量指定同一目标地址，执行记录写明。
- 风险（负责人已知）：中继中途掉线会使正式 run HALTED，正式 run 无自动重跑；tailnet 访问策略为默认全放行，节点 win-2jq66je4htq 身份 UNKNOWN，由负责人另行处理，本 ADR 不改。
- 边界：不改产品、native、候选 ZIP 或任何判据；不改 Win7 防火墙、Tailscale、Bitvise 设置；正式门 A 仍须负责人签发，门 B 另行裁决；不推送、不发布。

## ADR-0281 中继传输的有界续传

- 状态：Accepted（2026-10-24 UTC）。负责人原话：“继续走中继：给两个包的 SFTP 传输加有界续传（reput/reget，按 SHA 核对），审核后重做两包的 DEV 彩排。”
- 背景：经 Tailscale 中继（DERP hkg，未建立直连）的 4 次大文件上传 2 次成功、2 次中途断开（536 秒 reset、172 秒 closed）。ADR-0280 已允许正式执行经中继。
- 决定：总控包与补充包的 SFTP 上传/下载批次在且仅在传输层失败（sftp/ssh 退出 255、连接关闭或重置）时，用新会话以 reput/reget 续传，每批最多 3 个会话（首次加至多 2 次续传）。完整性不符、身份/主机键失败、远端协议错误不续传。续传完成后逐件核对大小与 SHA，上传由远端核验、下载由本机核验，任一不符即停。每次尝试单独留证，会话数与时间预算在各包合同中同步上调并披露。
- 不变：阶段级零自动重跑；SSH 控制会话（R1、R2、R4～R8 等）断线不重试，保持现有失败与生命周期 UNKNOWN 规则；身份、主机键、判据、清理权限不变。
- 预算：重做补充组 DEV 彩排含一次 M5，独立 US$1/40 HTTPS/3 Turn；记录承诺上界由 1,077,530,700 增至不超过 2,077,530,700 nanoUSD；执行日计数按台账核对，上限 200 次/UTC 日；M5 须在当日 UTC 22:55 前启动。
- 风险（负责人已知）：远端阶段执行期间 SSH 会话须保持连接，中继在此期间断线仍会使 run HALTED，续传不覆盖；tailnet 访问策略风险同 ADR-0280。
- 边界：不改产品、native、候选 ZIP 或判据；不改 Win7 设置；正式门 A 仍须负责人签发；不推送、不发布。

## ADR-0282 中继传输超时下限降为 40 KB/s

- 状态：Accepted（2026-10-24 UTC）。负责人原话：“把两包的超时下限从 150 KB/s 降到 40 KB/s，重算预算并审核；测速门槛同步降到 50 KB/s，达标即彩排。”
- 背景：ADR-0280/0281 的 SFTP 超时按 150,000 B/s 下限换算；2026-10-24 实测中继上传 54～230 KB/s，07:13Z 测速 59,549 B/s。总控中继彩排 run d62f471f 在续传中因单次超时被本机终止。
- 决定：总控包与补充包的 SFTP 单次超时公式中的速度下限由 150,000 B/s 改为 40,000 B/s（总控含每文件 2 秒项不变），续传规则（每批最多 3 会话、仅传输层断开、SHA 核对）不变。总墙钟、负责人窗口、传输总预算等按新公式在各包预算合同中重算闭合并逐项披露旧值→新值。中继彩排开跑前测速门槛由 200 KB/s 改为 50 KB/s。
- 影响：单次执行用时与预算封顶值约放大到原来的 3.75 倍；降低下限只覆盖慢速，不覆盖链路停滞，停滞仍会超时失败。正式门 A 的执行窗口在门 A 材料中由负责人确认。
- 边界：不改产品、native、候选 ZIP、判据、身份与主机键核对；阶段级零重跑与控制会话不重试不变；正式门 A 仍须负责人签发；不推送、不发布。ADR-0280、0281 不修改。

## ADR-0283 补充组合同负责人窗口改为 18 小时

- 状态：Accepted（2026-10-24 UTC）。负责人原话：“把补充组合同第 43 行‘负责人窗口≤8小时’改为‘≤18小时（ADR-0282）’，登记新 ADR 与 C14，只改这一处。”
- 背景：ADR-0282 把 SFTP 超时速度下限降为 40 KB/s 后，补充包按每批 3 次尝试的最坏情况重算，运输总预算 57600 秒、授权窗口 64800 秒（18 小时），与合同第 43 行“负责人窗口≤8小时”冲突。
- 决定与 C14：`release/win7-product-v3/A9_ALPHA2_SUPPLEMENT_VALIDATION.md` 只改第 43 行“负责人窗口≤8小时”为“负责人窗口≤18小时（ADR-0282）”，其余不改。补充包内合同副本与总控包中记录的合同 SHA 同步更新并重新封存。
- 边界：9000 秒总墙钟（自首个请求消费起）、每请求有效期 ≤900 秒、M5 请求开始时 ≥3600 秒门、六组闭集与全部判据不变；不改产品、native、候选 ZIP；ADR-0278～0282 不修改；正式门 A 仍须负责人签发，不推送、不发布。

## ADR-0284 正式执行与彩排固定走局域网；正式执行失败须先定位再重试

- 状态：Accepted（2026-10-25 UTC）。负责人原话：“采纳甲：现在做 1～3，4～9 写进 RC 任务书。”甲的内容见下文“决定”与 ENGINEERING_04。
- 事实（开发机只读统计 Win7 实机记录，候选 WIN7-54，源码 `9b385246…`）：
  1. WIN7-54 门 A 准备期共 14 个总控包修复轮：包缺陷 1 个（1），适配中继 9 个（2～10），登记拒绝集 3 个（11～13），正式执行失败后重生成输入 1 个（14）。
  2. 改走中继的 24 小时（2026-10-24T03:08Z～10-25T03:13Z）内，总控彩排 6 次全部 HALTED 于 R3 上传或 R7 回收；回到局域网后 DEV run 1099daa6 一次 37/67 PASS。
  3. 局域网 DEV 32a41046（10-23T17:15Z 结束）与 1099daa6（10-25T03:42Z 结束）两次 PASS 相隔 34 小时，总控在目标机运行合计 201 分钟。
  4. 正式执行 eaa7fc92 于 10-25T14:08Z 在 R6-p05-session-bg HALTED；修复轮 14 未定位原因即重生成输入，正式执行 8b4df730 于 14:41Z 同一步同原因 HALTED。
  5. 根因已定位：候选内 `validation/a9-batch2-smoke.cjs` 在非 `c:\a9-dev\` 根下对 `release_exit`、`continue_unknown_interrupt` 一律抛 `A9_BATCH2_CLEANUP_AUTHORITY_MISMATCH`（ADR-0264 只授权开发总控）。正式远端根 `C:\A9-W46\run\<run>` 必然触发。证据见 `outputs/a9-39-p05-formal-root-cause/REPORT.md`。
- 决定：
  1. 正式执行与彩排只经局域网直连 192.168.1.9。局域网不可用时等待，不为链路修改执行工具、预算或合同。ADR-0280 的中继许可由本 ADR 取代；白名单值 100.80.221.58 停止使用。已实现的按字节超时与有界续传代码（ADR-0280～0282）不回退，回退会引入新的修复轮。
  2. 正式执行 HALTED 或 FAIL 后，先读回收证据，定位到具体代码或环境条件；原因未确认前，不发起下一次正式执行，也不请负责人确认新载荷。只重生成输入、不改原因所在字节的重试不算定位。ADR-0169“同类失败连续两轮先诊断”对正式执行收紧为一次。
  3. p05 按决定 2 处理，根因已按事实 5 定位。修复路径（候选换发、授权范围或合同口径）另行提交负责人裁决；裁决前不再发起 WIN7-54 正式执行。
  4. 建议 4～9（拒绝集外置、驱动与夹具移出候选、彩排用正式目录布局、大件预置、两包共用传输层、审核分级）写入 `docs/tasks/ENGINEERING_04_RC_ACCEPTANCE_TIME_REDUCTION.md`，状态 `DRAFT_READY_FOR_REVIEW`，不构成实现授权。
- 放弃的保证：开发机不在局域网时无法推进目标机执行，等待时间计入工期。
- 边界：不改产品、native、候选 ZIP、执行工具、预算与任何判据；不新增正式执行授权；不签门 A/B；不推送、不发布。ADR-0264、ADR-0281～0283 正文与状态不变。

## ADR-0285 ADR-0264 夹具清理例外扩到正式执行；到期改读阶段请求 expires_at

- 状态：Accepted（2026-10-25 UTC）。负责人原话：“批准 WIN7-55 最小修复提案 r3。”
- 事实：ADR-0264 只授权开发总控在 `c:\a9-dev\` 根下绑定三个夹具映像的清理；候选 `release/win7-product-v3/a9-batch2-smoke.cjs` 对非 `c:\a9-dev\` 根下的 `release_exit`、`continue_unknown_interrupt` 一律抛 `A9_BATCH2_CLEANUP_AUTHORITY_MISMATCH`。正式远端根 `C:\A9-W46\run\<run>` 必然触发，导致 WIN7-54 正式执行两次（eaa7fc92、8b4df730）在 R6-p05-session-bg 以同一步、同根因 HALTED。根因证据见 `outputs/a9-39-p05-formal-root-cause/REPORT.md`。
- 决定：
  1. 夹具清理准入的正式/开发分支统一：正式根下 `release_exit`、`continue_unknown_interrupt` 不再被直接拒绝；只允许终止 ADR-0264 绑定的三个夹具映像实例，其余 ADR-0264 规则不变。
  2. 到期判断从写死 `CLEANUP_EXPIRES`（2026-10-28T00:00:00Z）改为读阶段请求自带的 `expires_at`（每请求 900 秒），删除常量 `CLEANUP_EXPIRES`。
  3. 按最小修复提案 r3 只改 `release/win7-product-v3/a9-batch2-smoke.cjs` 3 处；测试在 `src/shell/tests/product/a9-batch2-contract.test.ts` 加 2 个正例（正式根下 `release_exit`、`continue_unknown_interrupt` 完成绑定夹具终止），既有反例保持。
  4. 换发候选编号为 WIN7-55，身份同步照 `git show 9b38524` 同范围身份文件；退役清单加入 WIN7-54。
- 执行顺序：登记 ADR → 实施改动与测试 → 独立审核 diff（只报 P0/P1）→ 本地提交与两次干净构建、核号后冻结 WIN7-55 → 两包改绑 WIN7-55（只改身份）、拒绝集按现行规则加入已用 run（含 eaa7fc92、8b4df730）→ 局域网开发根 DEV 总控彩排一次（37/67）→ 门 A 材料交负责人确认后正式执行总控与补充组。
- 边界：不改产品业务代码、Runner、原生、驱动 `a9-batch2-driver-entry.cjs`、判据；不在总控包侧绕开（把正式远端根改到 `C:\A9-DEV\`、跳过 `release_exit`/`continue_unknown_interrupt`、放宽判据、改阶段计划均不批准）；不执行 r2 的正式布局彩排、常设授权 r2、工具分支清单与补充组重做彩排；不推送、不发布；正式门 A/B 仍须负责人签发。ADR-0264、ADR-0281～0284 正文与状态不变。

## ADR-0286 WIN7-55 门 B：限定已直接证明范围签发

- 状态：Accepted（2026-10-26 UTC）。负责人在聊天中回复“签发”（门 B 签发材料见 `outputs/a9-39-w55-proposal/GATE_B_MATERIAL.md`）。
- 背景：WIN7-55 正式执行 PASS。总控 run `f9ae2982`（FORMAL_GATE_A_EXECUTION）11 阶段全 PASS、37 用例/67 断言/0 失败、28 SSH 全 exit 0、R7 verified 1584、R8 tasks_remaining=0；补充组 run `cdb82d32`（DEV_CHANNEL）m1/m2/m3/m4/m6/m5 全 PASS，M5 付费真实请求 sent=22/settled=22（deepseek-v4-flash，spent 69,612,000 nano-USD ≤ 预算 1,000,000,000，日额台账 2026-10-26 total=22）。正式执行后独立审核 `PASS_NO_P0P1`（`outputs/a9-39-w55-proposal/GATE_B_INDEPENDENT_REVIEW.json`）。
- 决定一：门 B 按限定已直接证明范围签发，结论为 `A9_39_WIN7_55_BATCH2_PASS_WITH_KNOWN_LIMITS`，绑定 source `b4ce2be42cc9448142b831612dc7d5bc3a4df3cd`、ZIP `7de63dd8db0fde0f7c76aafa48f44ce6c9841c651c03b93215e175ad3792824a`、manifest `13f1f892…`、kit `72787c91…`、总控 run `f9ae2982…`、补充 run `cdb82d32…`。
- 决定二：门 B 限定范围不含完整 Alpha 2/RC；ADR-0096 完整 Review 延期至 `0.3.0-alpha.2`，WIN7-10 可见但无后端的 Review fail-closed，不计入支持能力或 Review PASS。现有运行时的未知生命周期、清理、身份、审计硬门不因本决定放宽。
- 未签：完整 Alpha 2、RC、ADR-0155、推送、发布与新的目标机或产品执行。门 A 已签发（release-authority SHA `4368342b…`）。

## ADR-0287 WIN7-55 对外发布 0.3.0-alpha.2 内部预览版

- 状态：Accepted（2026-10-26 UTC）。负责人在聊天中明确指示“对外发布 0.3.0-alpha.2 的内部预览版本”，并确认发布形态为 tag `v0.3.0-alpha.2-win7-55` + 冻结 ZIP 附件 + pre-release（沿用 WIN7-42 先例）。
- 背景：WIN7-55 已完成双干净构建冻结（w55-build-3/4 逐字节一致，ZIP SHA `7de63dd8…2824a`，source `b4ce2be…`）、门 A 签发（`4368342b…`）、正式执行 PASS（总控 `f9ae2982`、补充 `cdb82d32`）、门 B 签发（ADR-0286 `A9_39_WIN7_55_BATCH2_PASS_WITH_KNOWN_LIMITS`）。发布对象为整合分支 `codex/a9-alpha2-integration-r2` HEAD `78b19c6`（含 r103 门 B 元数据，源码 `b4ce2be` 为其祖先）。
- 决定一：分支 `codex/a9-alpha2-integration-r2` 推送至 origin（`dc8cdec..78b19c6`，18 提交）。推送提交不含 `outputs/`、`.acceptance/`、密钥类文件（均 gitignore）。
- 决定二：创建 annotated tag `v0.3.0-alpha.2-win7-55`（指向 `78b19c6`）并推送 origin。
- 决定三：创建 GitHub Release（repo `allin2/win7-coding-Agent`），pre-release 标记，附件为冻结 ZIP `Win7CodingAgent-0.3.0-alpha.2-win7-x64.zip`（SHA `7de63dd8…2824a`，下载复核一致）+ `.sha256`；发布说明如实声明限定范围（内部试用预发布版，不代表完整 Alpha 2、RC 或稳定版；ADR-0096 Review 延至后续迭代）。
- 未签：完整 Alpha 2、RC、ADR-0155、新的目标机或产品执行；完整 Review 仍按 ADR-0096 延期。

## ADR-0288 Alpha 阶段节奏与验收执行准则

- 状态：Accepted（2026-10-25 UTC）。负责人原话：“现阶段是alpha阶段，产品需要快速迭代，而不是大量时间花费在过度设计的防御性设计中”；“具体实现交给其他agent，这个对话主要是对总的准则进行修改”。
- 编号：ADR-0236～0285 已在整合分支 `codex/a9-alpha2-integration-r2` 使用（其中 0285 预留给 WIN7-55），本条在主工作区登记，合并时两侧编号均保留。
- 背景（开发机只读统计整合分支的 Win7 实机记录）：WIN7-54 门 A 准备期总控包 14 个修复轮中，适配中继 9 个、登记拒绝集 3 个；两次局域网 DEV PASS 相隔 34 小时，总控在目标机运行 201 分钟；正式执行两次在 p05 HALTED，根因是候选内只在正式根生效的清理分支从未在彩排中执行。整合分支 ADR-0284 已就该候选作出局域网与失败定位的决定。
- 决定：写入 `AGENTS.md` §6、`CLAUDE.md` 与 `docs/acceptance/ACCEPTANCE_AND_RELEASE_WORKFLOW.md`：
  1. Alpha 阶段以产品迭代为先。新增检查、彩排、授权、审核或工具，须写明它能抓住哪种现有验证抓不住的失败；写不出就不加，或列入 RC 阶段任务书（验收规范 §1）。
  2. 修复提案先给修掉根因的最小改动与最少验证；附带防护、额外彩排或新授权单列为 RC 候选，不与修复捆绑审批（验收规范 §5）。
  3. 正式执行失败一次即停止重试，先读原始证据定位原因；外层标签不等于原因，只重新生成输入不算定位（验收规范 §5）。
  4. 目标机执行只经局域网直连；链路不达标时等待或改期，不为链路改工具、预算或合同（验收规范 §6）。
  5. 候选内代码不按开发根、正式根或证据类别切换行为；确需切换时，正式分支须在彩排中实际执行过（验收规范 §3.2）。
  6. 已用 run、主机地址、拒绝集这类登记数据不写进需要重钉的执行工具字节或测试；新设计照此执行，既有执行包在 RC 阶段调整（验收规范 §6）。
- 延期：只改数据的轮次以自动校验代替独立审核，依赖决定 6 落地，留到 RC 阶段。
- 边界：不改 §5 安全红线、证据分级、C14、任何合同判据、已签授权与既有执行包；不授予实现、目标机、提交或推送权限。准则同步到整合分支由执行该分支的 agent 负责。
- 改号：原登记为 ADR-0286，与整合分支已发布的 ADR-0286（WIN7-55 门 B）重号。负责人 2026-10-26 裁决 K1 选 A，改为 ADR-0288；其余各条未改，“编号”一条保留登记时的原文。

## ADR-0289 开发级运行与正式验收分开

- 状态：Accepted（2026-10-26 UTC）。负责人原话：“按推荐整体采纳 ADR-0289：状态改为 Accepted，写入 DECISIONS、索引、AGENTS.md、CLAUDE.md、验收规范和术语表，跑 docs:check，不提交。”
- 编号：登记前核对 main 最大为 ADR-0288，整合分支 `e596c58a…` 最大为 ADR-0287，314e 工作树无 ADR-0289。
- 背景（开发机只读统计，绑定 main `6a938993…` 与整合分支 `f06e6db9…`）：
  A9-39 九天换发 10 个候选（WIN7-46～55），同期产品非测试代码只改 81 行。
  每个候选都做双干净构建、冻结与门 A 材料准备；执行记录 178 条，其中负责人批准 41 次。
  WIN7-54 两次可用 PASS 相隔 34 小时，目标机只运行 201 分钟。
  Win7 上发现的 2 个产品缺陷（ADR-0255、0262）都在产品代码里，与候选是否冻结无关。
  验收规范 §7 规定预演、双构建、独立审核与门 A/B 次数以具体任务为准；负担来自任务合同。
- 决定：写入 `AGENTS.md` §6、`CLAUDE.md`、验收规范 §3.4（新增）、§5、§6、§7 与术语表。
  1. **两级运行。** 开发级运行：在开发通道或其后继环境，对开发构建或候选执行，结果标
     `DEV_CHANNEL`，只作诊断。正式验收：门 A 授权下对冻结候选执行，结论由门 B 签发。
  2. **开发构建。** 开发级运行使用开发构建：从一个提交单次构建的 ZIP，以提交号和 ZIP SHA
     标识。开发构建不分配 `WIN7-NN`，不做双干净构建，不冻结。候选编号只在版本进入发布冻结时分配。
  3. **开发级运行的要求。** 不要求执行包封存、拒绝集、签名授权载荷、独立审核与负责人逐次确认。
     仍须：每次新 run UUID；自动账本记录输入 SHA、动作与结果；开发根路径限定；单写者锁；
     下载秘密扫描；遵守开发通道常设授权的全部禁止项。
  4. **正式验收每个版本一次。** 冻结候选须先在开发级运行中全阶段通过一次，才进入门 A。
     正式执行的候选内代码与驱动字节与该次开发级运行相同，只多签名载荷和证据类别。
     正式执行失败按 ADR-0288 决定 3 先定位；修复回到开发级运行，再换发候选。
  5. **版本范围授权。** 负责人每个版本签一份范围授权，写明任务书与分支、本地提交、开发构建、
     开发级运行、模型请求与目标机时间预算、停止条件。范围内执行代理自行推进，不逐次请示。
     以下三类仍逐次请负责人批准：新增权限或系统修改；超出预算；门 A、门 B 签发与推送、发布。
  6. **独立审核只用于正式验收。** 门 A 材料审核一次，门 B 结果审核一次。
     开发级运行的修复，以开发机测试和下一次开发级运行的结果为依据。
  7. **验收工具止损。** 候选外驱动、夹具或编排的同一问题，连续 2 轮开发级运行未闭环，
     执行代理停止加固，提交删减提案：删哪项检查、此后不覆盖什么。负责人裁决后登记为已知限制。
     未经裁决，仍不得减少断言或放宽判据（验收规范 §3.2）。
- 适用范围：本 ADR 转为 Accepted 后新建的任务书，含 RC 阶段任务书。
  既有任务改用本 ADR 时，按验收规范 §9 列出差异，经负责人批准。
  任务书要加回正式流程，须按 ADR-0288 决定 1 写明它能抓住的失败。
- 边界：不改 AGENTS.md §5 红线、证据分级、C14 与合同判据；不改写既有任务书、ENGINEERING_03 §6、
  已签授权与已封存执行包。开发级结果不得写成 Win7 PASS，不计入覆盖矩阵、门 B、Alpha 或 RC 结论。
  本 ADR 不授予实现、目标机连接、提交或推送权限；这些权限分别来自任务书、开发通道常设授权与版本范围授权。
  开发通道常设授权 r2 只覆盖整合工作树，且不批准提交与冻结；RC 阶段另行签发，不在本 ADR 内。
- 复盘：RC 第一个版本门 B 签发后，执行代理按四项指标对比 A9-39 基线：目标机利用率 9.9%；
  WIN7-54 门 A 修复轮 14 轮；负责人批准九天 41 次；工作区空间三天增加 12.2 GB。
  任一项变差，由负责人决定是否修订本 ADR。


## ADR-0290 已确认范围内连续交付与本轮工程落地

- 状态：Accepted（2026-10-26 America/Los_Angeles）。负责人本轮明确授权直接优化研发交付、修改 C14 和项目规则、必要脚本/测试/构建及一个已复现小 bug、本地提交、有效开发通道与预算内验证、既有私有仓库加密归档；删除须准确清单集中确认。
- 决定：C14 从逐任务分支加穷举路径白名单，改为索引内一份已确认需求/版本范围记录。记录结果、实际分支、行为和外部动作边界、必要验证及停止条件；执行代理连续完成范围内普通修复与验证。不按目录判低风险，不开放无关产品功能或全部历史草案。
- 替代关系：替代 ADR-0192 的新实施必须穷举路径与逐任务审批机制，以及 CLAUDE 中同类限制；保留其历史/关闭任务不授权新实施的规则。替代 ADR-0288“不改 C14”、ADR-0289“不扩大 C14/仅新建任务”的限制，仅限本条范围授权机制；其开发与正式分层、目标预算、安全和证据规则继续有效。旧合同只在阻挡本轮已授权治理、日常验证、一个小 bug 和归档时由本条替代，不恢复旧 HALTED 运行。
- 日常入口：复用 verify_integration，允许按模块和测试文件选择，按依赖构建当前输出再测消费者。日常集合明确列出慢测试移出范围及集成触发；全量入口保留。没有实测基线则耗时 UNKNOWN，不添加强制时限、CI/钩子、度量平台或例行独审。
- 协作：新功能/明显交互/关键歧义先最小交互 demo；明确 bug 直接复现修复。最终负责人验收不替代基础测试。数据损坏、秘密泄露、越权、失控进程、Win7 无法运行阻断依赖交付；非阻断缺陷逐项说明后交负责人接受。
- 文档：STATUS 只写当前事实，旧流水原文转入 STATUS_LOG；任务索引保留状态和历史链接，旧批准不视为本轮范围。沿用已有记录与归档索引，不新增通用平台。
- 保留：Win7 SP1 x64、Renderer 隔离、真实权限边界、TLS/SSH 校验、凭据保护、取消/树清理、必要审计、候选和证据不可变。重大方向/权限语义、系统修改、超预算、产品推送/发布和正式签发仍由负责人决定。准确删除清单批准后逐项执行；不改全局配置、其他项目或 Git 历史。
- 本轮范围与结果：[ENGINEERING_05](tasks/ENGINEERING_05_ALPHA_DELIVERY.md)。未授权产品推送和发布，未调整正式候选判据或撤销有效安全断言。

## ADR-0291 日常验证二次收敛与入口去旧

- 状态：Accepted（2026-10-26 America/Los_Angeles）。依据负责人 2026-10-26 本轮同一指令（复核并继续 ENGINEERING_05），属 ADR-0290 授权范围内的规则与工具调整；不扩大产品范围。
- 背景：开发机实测日常集合 168.99 秒，其中 Shell 121.72 秒；单个用例组“A9-39 phase 2 fixed secrets contract”的逐行逐字段变异占 91.6 秒。默认 Node 22 下根目录 better-sqlite3（Node 20 ABI）无法加载，Shell 合同测试出现 186 项与改动无关的失败。tracked 的 `src/runner/dist` 仅 64 个旧文件，当前构建产出 68 个，每次构建产生 24 个改动，历史记录多次手工还原。
- 决定一：日常集合移出 Shell“required fields reject absence and wrong types before comparison”12 个用例；断言、样本与判定器不变。它只检验 A9-39 验收判定器的穷举字段反例，修改该判定器或其夹具、集成回归和正式门 A 前运行；`npm test` 与 `--test-file` 定向运行始终包含。
- 决定二：日常入口在运行 gateway/state/shell 测试前加载 better-sqlite3；失败即停止并指明 Node ABI 原因，不计为产品失败。仓库新增 `.nvmrc`（20.17.0）声明开发机 Node。
- 决定三：`src/runner/dist` 停止 Git 跟踪，与 `.gitignore` 的 `dist/` 一致；本机文件与历史提交保留。消费者由日常入口从源码构建；打包仍用锁定的 runner 输入。
- 决定四：AGENTS §2 不再以当前态陈述 Alpha 1 / WIN7-22 历史裁决；保留不改判、证据保留、继承规则与 Review fail-closed 约束。历史原文见 STATUS_LOG 与对应任务书。
- 不变：§5 红线、Win7 证据分级、正式判据、已签结论与全部 Accepted ADR 正文。结果见 [ENGINEERING_05](tasks/ENGINEERING_05_ALPHA_DELIVERY.md)。

## ADR-0294 A9-34 重启恢复“清理未确认”后台事实的用户确认处置出口

- 状态：Accepted（2026-10-27 America/Los_Angeles；负责人在聊天中对“是否批准 A9-34 方案 U 实施，Q1～Q3 都按推荐执行？”回复“批准”）。
- 背景：ADR-0240 决定一第 5 项登记的已知限制仍存在。执行代理在开发机静态核对 main `3f675f93…`：恢复事实带回 `cleanupRequired=true` 后，Stop 被拒、退出取消、工作区锁不释放、对话与模式切换被阻断，产品内无处置出口。证据见 [A9-34](tasks/A9_34_RECOVERED_CLEANUP_DISPOSITION.md) §2。
- 决定一：采用方案 U。新增 strict IPC 动作 `a9.managed.dismissRecovered`，payload 仅 `{conversationId, handleId, recoveryRevision}`；新增版本化事件 `managed_process_disposition`（schemaVersion 1，`disposition: 'user_attested_after_restart'`）；事实行 `last_probe_status` 新值 `user_dismissed`。数据库 schema v4 与表结构不变。资格判定、事务与内存收口按任务书 §4。
- 决定二：Q1 本批只做工作台卡片；Q2 方案 E 不在本批，后续另立任务；Q3 确认框采用任务书 §8 Q3 选项 A 文案。
- 决定三：实施范围按 ADR-0290 登记于任务书 §1、§5、§6.1 与任务索引。执行代理在独立工作树实现，主会话审核后本地提交 main。
- 兼容性：历史驱动 factsFinished、normalCloseState 只接受四种终态，本任务不改它们；后续正式合同须区分“已处置”与“清理已证明”。
- 未授权：Win7 开发通道运行（任务书 §8 Q4；常设授权 r2 不覆盖 main 工作区）、候选号、门 A/B、推送、发布、方案 E。
- 不变：Stop 保守清理判据、helper v3 语义、WIN7-55 结论（ADR-0286）及 ADR-0240 已知限制登记。

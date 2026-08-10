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

- 状态：Superseded by ADR-0066（2026-08-10；历史正文与 A5 原始证据保持不变）
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

## ADR-0066 Win7 v1 放弃 winpty 交互终端，采用受控非交互 Runner 与只读日志

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

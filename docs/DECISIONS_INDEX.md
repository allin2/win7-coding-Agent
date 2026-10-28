# ADR 索引

> 由 [DECISIONS.md](DECISIONS.md) 各 ADR 标题与首条“状态”行整理（2026-09-24），不替代 ADR 正文；
> 状态以正文为准。新增 ADR 时在本表末尾追加一行。ADR-0024 编号在正文中未使用。

| ADR | 标题 | 状态 |
|---|---|---|
| ADR-0001 | 目标平台冻结为 Win7 SP1 x64 + CPython 3.8.10，仅标准库 | Superseded by ADR-0027 |
| ADR-0002 | 状态、审计与 Probe 报告持久化选用 SQLite（标准库 sqlite3） | Superseded by ADR-0027 |
| ADR-0003 | Probe 报告的主输出为 JSON 文件（UTF-8 无 BOM），SQLite 报告库为可选副产物 | Superseded by ADR-0014 |
| ADR-0004 | Probe 采用"检查项永不中断整体"的隔离执行模型 | Accepted |
| ADR-0005 | 子进程终止方案：`taskkill /PID <pid> /T /F` 为主，`Popen.kill()` 为降级 | Superseded by ADR-0027 |
| ADR-0006 | 控制台输出 ASCII-only，完整信息写 UTF-8 文件 | Superseded by ADR-0027 |
| ADR-0007 | Git 是可选能力：只探测、不依赖 | Superseded by ADR-0027 |
| ADR-0008 | TLS 探测为纯离线探测，不发起任何网络连接 | Superseded by ADR-0016 |
| ADR-0009 | Probe 交付形态为 Python 包目录，入口 `python -m capability_probe` | Superseded by ADR-0013 |
| ADR-0010 | 退出码约定：0=全部通过，1=存在降级，2=存在失败，3=Probe 内部错误 | Accepted |
| ADR-0011 | 实现代码采用任务授权机制（Status + 允许路径白名单） | Accepted |
| ADR-0012 | 路线阶段编号冻结：Model Gateway 固定为阶段 3 | Accepted |
| ADR-0013 | Probe 包布局为 `src/win7_agent/probe/`，入口 `python -m win7_agent.probe`（取代 ADR-0009） | Accepted |
| ADR-0014 | JSON 是 Probe 唯一权威输出；SQLite 仅为被探测能力的证据文件（取代 ADR-0003） | Accepted |
| ADR-0015 | Windows 版本与 SP 采用三个只读来源交叉探测，无法确认 Win7 SP1 判 FAIL | Superseded by ADR-0022 |
| ADR-0016 | 阶段 1 TLS 检查定名 Python TLS Runtime Capability，纯离线、八项探测、五项禁令（取代 ADR-0008） | Accepted |
| ADR-0017 | 阶段门控状态 REPAIR_REQUIRED_BEFORE_E1 与实现路径白名单遗漏修正 | Accepted |
| ADR-0018 | 错误码扩展：SUBPROC_BEHAVIOR_MISMATCH 与 PROCESS_TREE_TERMINATION_FAILED，proc.kill 状态裁决收紧 | Accepted |
| ADR-0019 | proc.kill 采用 workdir 辅助文件 + readiness 协议，废除嵌套命令行与固定延时终止 | Accepted |
| ADR-0020 | subproc 统一 monotonic 时间预算与 Probe 私有活动进程登记机制 | Accepted |
| ADR-0021 | report.sqlite 纳入统一隔离调度；报告组装与写出的可靠性兜底 | Accepted |
| ADR-0022 | OS 版本裁决顺序与 host 字段来源；文件系统断言精确化（取代 ADR-0015） | Accepted |
| ADR-0023 | 建立独立架构原型线 prototype/full-agent-skeleton（Task Type: ARCHITECTURE_PROTOTYPE） | Accepted |
| ADR-0025 | 阶段 2 重定义为正式只读代码分析 Agent；原型冻结契约收编主线；ADR-0024 编号保留 | Accepted |
| ADR-0026 | Replay setup errors and runtime mismatches（Replay 装载错误与运行期不匹配的边界冻结） | Accepted |
| ADR-0027 | 唯一固定客户端平台为 Windows 7；运行时、依赖与产品形态改用兼容性 Profile | Accepted |
| ADR-0028 | 技术栈统一：Electron 22.3.27 单栈承载 Shell 与 Core；降级阶梯冻结 | Accepted |
| ADR-0029 | Phase 1/2 Python 资产冻结为 legacy；契约与测试矩阵作为 Node Core 规范来源继承 | Accepted |
| ADR-0030 | Approval Mode 三档冻结：read-only / workspace-write / 无 full-access 本地等价 | Accepted |
| ADR-0031 | 交互终端：独立 winpty 宿主进程；模型输入与用户输入硬隔离 | Superseded by ADR-0067 |
| ADR-0032 | Git/Worktree Adapter：MinGit 隔离配置、命令白名单与攻击面封堵 | Accepted |
| ADR-0033 | 性能预算基线：docs/PERFORMANCE_BUDGET.md 为唯一权威 | Accepted |
| ADR-0034 | Codex 功能面三分级；Spike 不占用 ADR-0012 阶段编号 | Accepted |
| ADR-0035 | 插件宿主（MCP/Skills/Hooks）信任边界原则冻结；实现推迟 v1.1 | Accepted |
| ADR-0036 | PC-003 裁决——Win7 Electron 首选实施技术栈获批 | Accepted |
| ADR-0037 | Phase 3–7 采用保留历史的整合基线；Phase 1/2 不重写，Phase 3 定向重构 | Accepted |
| ADR-0038 | Agent 完成态、审批绑定与本地执行入口统一收口 | Accepted |
| ADR-0039 | Agent Loop 的 Turn/Step 边界、六类结局与取消配对 | Accepted |
| ADR-0040 | Agent Loop 工具批次配对与 EventSink 三阶段故障语义 | Accepted |
| ADR-0041 | 状态以不可变事实为准，视图由事件投影生成 | Accepted |
| ADR-0042 | 命令执行采用 Runner V2 联合结果与字节级有界输出 | Accepted |
| ADR-0043 | Core 恢复以 State V2 投影为权威，Checkpoint 只保存恢复锚点 | Accepted |
| ADR-0044 | 上下文工程采用受保护投影、内容绑定摘要与尾部工作记忆 | Accepted |
| ADR-0045 | ToolSpec V2 与锚文本编辑共用既有审批写入链 | Accepted |
| ADR-0046 | Node 只读工具合并读取语义并区分完整总数与预算下界 | Accepted |
| ADR-0047 | Policy 三态裁决与参数敏感 Git 分类 | Accepted |
| ADR-0048 | 会话 Git 安全网与拒绝审批回流保持精确绑定 | Accepted |
| ADR-0049 | Runtime 协议自动建立并持有 Git 会话基线 | Superseded by ADR-0050 |
| ADR-0050 | Git 仓库 Turn 缺少 SessionSafetyPort 时必须 fail-closed | Accepted |
| ADR-0051 | 验证失败必须反馈修复并对同一 Gate 有界熔断 | Accepted |
| ADR-0052 | 文档职责分层与任务书稳定路径 | Accepted |
| ADR-0053 | Phase 1/2 源码归档到独立目录且历史 ADR 保持不可变 | Accepted |
| ADR-0054 | 未提交 MVP 基线与 Win7 实机验收受控收口 | Accepted |
| ADR-0055 | Win7 MVP 负责人接受、延期边界与桌面装配启动 | Accepted |
| ADR-0056 | Desktop Alpha 1 采用只读 Replay 纵向切片 | Accepted |
| ADR-0057 | Desktop Alpha 2 采用可信单文件写入计划与双重一次性审批 | Accepted |
| ADR-0058 | 项目原创成果采用 Apache License 2.0 | Accepted |
| ADR-0059 | Desktop Alpha 3 受控 Gateway 联机纵向切片 | Accepted |
| ADR-0060 | Desktop Alpha 3 接受显式 HTTP Gateway 配置 | Accepted |
| ADR-0061 | Desktop Alpha 3.1 显式接入 DeepSeek 公网真实模型 | Accepted |
| ADR-0062 | Desktop Alpha 3.2 使用 Electron safeStorage / Windows DPAPI 持久化 API key | Accepted |
| ADR-0063 | SPIKE_02 采用 node-pty 内置 winpty 精确快照并收紧 Win10 构建闭包 | Accepted |
| ADR-0064 | SPIKE_04 锁定 better-sqlite3 8.7.0 / SQLite 3.43.1 并建立 A6 Win10 构建闭包 | Accepted |
| ADR-0065 | 验收协调器控制面：签名租约、轮前/轮后检查、证据分级与 fail-closed 正式状态 | Accepted |
| ADR-0066 | A6 以本地 SSD 作为唯一正式存储 Profile | Accepted |
| ADR-0067 | Win7 v1 放弃 winpty 交互终端，采用受控非交互 Runner 与只读日志 | Accepted |
| ADR-0068 | A5 门禁解除并采用签名清单注入生产 NativeRunner | Accepted |
| ADR-0069 | Win7 Electron 宿主 Job 只允许经验证的 breakaway | Accepted |
| ADR-0070 | 验收中途目标 IP 迁移只允许签名恢复，不允许复用执行租约 | Accepted |
| ADR-0071 | NativeRunner 取消必须由 Helper 协作确认 ACL 回滚 | Accepted |
| ADR-0072 | 只读 Runner Profile 不修改工作目录 Integrity Label | Accepted |
| ADR-0073 | RC v1 采用清单绑定的产品装配与 SQLite V2 事件账本 | Accepted |
| ADR-0074 | A8 采用 Agent-first 产品模型并冻结 A7 RC | Accepted |
| ADR-0075 | A8-00 冻结产品投影、会话恢复、准备区与迁移合同 | Accepted |
| ADR-0076 | A8-02 采用存储中立会话目录与精确只读产品 IPC | Accepted |
| ADR-0077 | A8-03 以结构化 Review tool 进入私有 staging，Apply 继续由精确审批控制 | Accepted |
| ADR-0078 | A8-03 终态清理、身份绑定与 Review 事件脱敏 | Accepted |
| ADR-0079 | A8 采用版本化 System Prompt V1 描述私有 Review staging | Accepted |
| ADR-0080 | A8-03 对 Review 验证证据执行敏感值 fail-closed 清理 | Accepted |
| ADR-0081 | A8-03 Renderer 按 Task 边界重建事件队列并刷新恢复动作 | Accepted |
| ADR-0082 | A8-04 以边界状态优先交付 Terminal/Browser 与诊断入口 | Accepted |
| ADR-0083 | A8-05 以 SQLite 结构化实体和 fail-closed 恢复接入 A8 Session catalog | Accepted |
| ADR-0084 | A8-06 以输入哈希闭包和确定性 ZIP 形成独立 A8 候选 | Accepted |
| ADR-0085 | A8-06 外部证据以 Electron ABI、完整 manifest 和候选外目录三重绑定 | Accepted |
| ADR-0086 | A8 构建后状态证据与不可变候选分离 | Accepted |
| ADR-0087 | A8 验证套件全面采用包内 Electron 22.3.27 Node 模式消除外部 Node 依赖 | Accepted |
| ADR-0088 | A8 候选完整性校验使用 Electron 物理文件系统视图 | Accepted |
| ADR-0089 | A9 采用可信环境 Full Access 与通用 Shell，现实可用性优先 | Accepted |
| ADR-0090 | A9 工作区权限模式存储键绑定 canonical 路径哈希 | Accepted |
| ADR-0091 | A9 审批使用不可变绑定对象并在 IPC v2 携带摘要 | Accepted |
| ADR-0092 | Shell 与外部工具的工作区变化进入同一 Checkpoint 与诚实验证语义 | Accepted |
| ADR-0093 | A9 Provider 非秘密配置版本化持久化与 DPAPI 秘密分离 | Accepted |
| ADR-0094 | A9 SQLite Schema v3 保存真实 failed Turn 并统一提交/审批恢复终态 | Accepted |
| ADR-0095 | 根 AGENTS.md 收敛为当前执行入口并按需加载详细规范 | Accepted |
| ADR-0096 | A9 Alpha 1 收敛为 Full Access 与 Read Only，Review 延期至 Alpha 2 | Accepted |
| ADR-0097 | A9 Win7 后续候选采用影响范围增量复验 | Accepted |
| ADR-0098 | A9 Alpha 1 同工作区多对话、恢复上下文与 DPAPI 草稿 | Accepted |
| ADR-0099 | A9 Alpha 1 以 WIN7-19 增量证据收口并进入内部交付 | Accepted |
| ADR-0100 | WIN7-19 后置独立审查触发 A9-08 修复 Gate，历史候选保持不可变 | Accepted |
| ADR-0101 | A9 TrustedShell 使用 D-013 Current-User Full Access Profile 与协议 v2 | Accepted |
| ADR-0102 | A9-09 独立复审后的候选与原始返回证据绑定 | Accepted |
| ADR-0103 | A9-09 正式产品闭包与批准清单必须独立于候选自报 | Accepted |
| ADR-0104 | WIN7-20 候选外批准 pin 与正式输入来源绑定 | Accepted |
| ADR-0105 | A9 Shell 已知秘密值过滤与旧环境配置失效 | Accepted |
| ADR-0106 | A9-09 构建生成器入口与 Windows PowerShell 请求自测 | Accepted |
| ADR-0107 | A9 文件显式编码与有界流式读取 | Accepted |
| ADR-0108 | D-013 v25 后置独审缺口按独立 A9-11 合同修复 | Accepted |
| ADR-0109 | D-013 v25 后置恢复、配置与用户流按独立 A9-12 合同修复 | Accepted |
| ADR-0110 | 既有 WIN7-19 schema v4 精确兼容与 WIN7-21 全新候选 | Accepted |
| ADR-0111 | D-013 CMD payload 原样装配与 WIN7-22 门禁继承边界 | Accepted |
| ADR-0112 | WIN7-22 收口补录与开发构建基线分离 | Accepted |
| ADR-0113 | 执行指令按需加载与验证范围校准 | Accepted |
| ADR-0114 | UI 过程反馈事件与投影扩展 | Accepted |
| ADR-0115 | A9-15 WIN7-23 新候选与直接实机验收边界 | Accepted |
| ADR-0116 | WIN7-23 验证启动失效、Win7 字体清晰度修复与 WIN7-24 新候选 | Accepted |
| ADR-0117 | Alpha 2 Review、运行中输出与自适应工作台需求基线 | Accepted |
| ADR-0118 | WIN7-24 重启历史投影修复与 WIN7-25 新候选 | Accepted |
| ADR-0119 | WIN7-25 验证缺口修复与 WIN7-26 可执行投影合同 | Accepted |
| ADR-0120 | WIN7-26 投影验证四项 P2 修复与 WIN7-27 可执行投影合同 | Accepted |
| ADR-0121 | WIN7-27 复核四项验收缺口修复与 WIN7-28 新候选 | Accepted |
| ADR-0122 | WIN7-28 投影证据格式治理与阶段/分页/时间深度交叉约束 | Accepted |
| ADR-0123 | A9 启动测量与有限历史投影 | Accepted |
| ADR-0124 | A9-16 UI 子集实施授权与 Review 延期 | Accepted |
| ADR-0125 | A9-16 UI 子集 WIN7-29 候选合同与 A9-17 候选豁免 | Accepted |
| ADR-0126 | WIN7-29 构建缺陷判定与 WIN7-30 修正候选换发 | Accepted |
| ADR-0127 | WIN7-30 实机 G2 失败与 WIN7-31 修复候选换发 | Accepted |
| ADR-0128 | WIN7-31 实机 G3 真实 125% DPI 容量失败与 WIN7-32 换发 | Accepted |
| ADR-0129 | WIN7-32 实机 GPU 合成首绘失败与 WIN7-33 换发 | Accepted |
| ADR-0130 | WIN7-33 实机 G2 失败与渲染策略就绪守卫换发 WIN7-34 | Accepted |
| ADR-0131 | W34-13-A03 收窄到可达最窄视口，≤799px 抽屉分支登记为产品内不可达 | Accepted |
| ADR-0132 | WIN7-34 验收链路偏差与 WIN7-35 Driver 生命周期、退出码修复授权 | Accepted |
| ADR-0133 | WIN7-35 真实 125% DPI 容量失败与 WIN7-36 换发 | Accepted |
| ADR-0134 | AGENTS.md 与 CLAUDE.md 不再写死“当前任务”，改为引用 STATUS.md 与任务索引 | Accepted |
| ADR-0135 | 运行中模型输出以内存预览实时呈现，累积脱敏并保留尾部 | Accepted |
| ADR-0136 | A9-19 以 WIN7-37 新候选进入 Win7 实机验收，实机执行可交由外部执行模型 | Accepted |
| ADR-0137 | Git 外部写确认分类器：壳载荷不可精确解析时 fail-closed | Accepted |
| ADR-0138 | A9-18 成果按评估择优移植，不引入 schema 迁移，移植后删除工作树 | Accepted |
| ADR-0139 | 性能预算 #3 改按 Main 进程计量 | Accepted |
| ADR-0140 | A9-20 实施中对 Git 确认分类器与验证记账的两处收紧 | Accepted |
| ADR-0141 | 以当前主线换发 WIN7-38，在 Win7 实机验收 A9-20 与 A9-21 | Accepted |
| ADR-0142 | WIN7-38 记为验证套件缺陷不通过，新建 A9-23 修复套件后换发 WIN7-39 | Accepted |
| ADR-0143 | Alpha 2 的 Review 改为“先写后审”的改动审阅，不做暂存区式 Review 模式 | Accepted |
| ADR-0144 | 以当前主线换发 WIN7-40，在 Win7 实机验收 A9-24 改动审阅 | Accepted |
| ADR-0145 | WIN7-40 记为验证套件缺陷不通过，修订 A9-25 修复套件后换发 WIN7-41 | Accepted |
| ADR-0146 | 第一批可靠性（A9-26）：恢复目录自忽略、验证证据收紧、项目说明与环境事实注入、输入上下文预算 | Accepted |
| ADR-0147 | 批准 A9-27：以 WIN7-42 验收 A9-26 第一批可靠性 | Accepted |
| ADR-0148 | A9-28 修复失败验证大输出与不可压缩上下文预算遗漏 | Accepted |
| ADR-0149 | A9-29 必需审计故障与 Provider 响应完整性修复 | Accepted |
| ADR-0150 | helper v3 和 A9-30 Shell 运行中输出 | Accepted |
| ADR-0151 | A9-31 后台进程模型工具与显式释放提案 | Accepted |
| ADR-0152 | A9-32 用户主动继续中断任务提案 | Accepted |
| ADR-0153 | A9-30 v26 开发检查包及独立返回复核登记 | Proposed |
| ADR-0154 | A9-30 v26 构建身份事实校验 | Proposed |
| ADR-0155 | 第二批增量证据与独立新候选验收提案 | Proposed |
| ADR-0156 | A9-31 managed 构建烟测的 OS 进程身份证据 | Accepted |
| ADR-0157 | A9-31 控制器调用者身份与不可覆盖的重试记录 | Accepted |
| ADR-0158 | A9-31 准确原生双返回的有限离线重锁裁决 | Accepted |
| ADR-0159 | A9-31 新产品验证控制器的持有句柄生命周期合同 | Accepted |
| ADR-0160 | A9-31 有限桌面调度窗口与不可变 driver 修复版本 | Accepted |
| ADR-0161 | A9-31 R4 捕获与失败收尾的准确新合同 | Accepted |
| ADR-0162 | A9-31 R5 捕获程序集的准备编译与运行准入 | Accepted |
| ADR-0163 | A9-31 R5 fixed interactive scheduled desktop entry | Accepted |
| ADR-0164 | A9-31 R6 入口所有权与历史硬停止隔离 | Accepted |
| ADR-0165 | A9-31 R7 查询句柄捕获与 Renderer 动作序列化 | Accepted |
| ADR-0166 | A9-31 R8 快照区间内实例的双观察绑定与准确诊断 | Accepted |
| ADR-0167 | A9-31 R9 同步只读系统探测的真实退出回执 | Accepted |
| ADR-0168 | A9-31 R10 外部Win10捕获的精确UTC边界 | Accepted |
| ADR-0169 | 增量验收与发版工作规范 | Accepted |
| ADR-0170 | A9-31 Shell永久删除的本地Policy确认修复 | Accepted |
| ADR-0171 | A9-31 非Git高影响复合命令分类与完整可见审批 | Accepted |
| ADR-0172 | A9-31 短命进程的manifest精确字段补证提案 | Proposed |
| ADR-0173 | A9-31 manifest conhost proof的有限普通取证接入 | Accepted |
| ADR-0174 | A9-31 Recovery重启实例证据文件命名修复 | Accepted |
| ADR-0175 | A9-31 控制器conhost proof父进程种类按NT设备路径判定 | Accepted |
| ADR-0176 | A9-31 原生退出对话框人工点击流程 | Accepted |
| ADR-0177 | A9-31 R8独立复核缺口的候选外本地修复 | Accepted |
| ADR-0178 | A9-31 R8采用复核修复版driver的新不可变revision | Accepted |
| ADR-0179 | A9-31 R9：Recovery按“保留清理未知”修订driver预期并单独续验 | Accepted |
| ADR-0180 | A9-31 整批Win10跨根证据：先补正式评审再组合 | Accepted |
| ADR-0181 | A9-31 Shell Policy：引号与控制流歧义的保守求值（ADR-0171补充） | Accepted |
| ADR-0182 | A9-31 Shell Policy：进入当前作用域的赋值效果只追加候选（ADR-0181补充） | Accepted |
| ADR-0183 | A9-31 Shell Policy：变量调用遇控制结构一律保守确认（替换ADR-0181的F2与ADR-0182） | Accepted |
| ADR-0184 | A9-31 Shell Policy：R判定条件修订与P1修复收敛标准（ADR-0183补充） | Accepted |
| ADR-0185 | A9-31 Shell Policy：r4独立复核四项P1的有限修复（ADR-0184补充） | Accepted |
| ADR-0186 | A9-31 r4开发包与Win10单根全量重验 | Accepted |
| ADR-0187 | A9-31 r4 Win10重验：新根R2同源重编取证组件并换绑其构建批准（ADR-0186补充） | Accepted |
| ADR-0188 | A9-31 登记 `A9_31_DEVELOPER_VERIFIED`（带已知限制） | Accepted |
| ADR-0189 | A9-32 继续前观察缺失路径、目录与路径身份（ADR-0152补充） | Accepted |
| ADR-0190 | 面向负责人的输出规范、术语表与 HTML 解说边界 | Accepted |
| ADR-0191 | 输出规则自动加载与新报告模糊词检查（ADR-0190 补充） | Accepted |
| ADR-0192 | 文档检查完整性、任务实施入口分区与本地治理同步 | Accepted |
| ADR-0193 | 候选外参数化报告校验试点格式 | Proposed |
| ADR-0194 | Win10 验证工具的分层输入与产品取证双身份 | Accepted |
| ADR-0195 | Win10 真实新构建与当前桌面执行绑定 | Accepted |
| ADR-0196 | Win10 取证组件的进程代次与明确非父子关系 | Accepted |
| ADR-0197 | Win10报告字段比较与构建验证器身份分离 | Accepted |
| ADR-0198 | Win10取证实际能力准入与产品执行权限分离 | Accepted |
| ADR-0199 | Win10取证最小诊断后的单次恢复 | Accepted |
| ADR-0200 | Win10普通取证入口的进程执行策略 | Accepted |
| ADR-0201 | 普通取证探针的捕获首失败诊断 | Accepted |
| ADR-0202 | 普通取证的完整自有捕获集合合同 | Accepted |
| ADR-0203 | 自有取证子进程的有界输出首失败诊断 | Accepted |
| ADR-0204 | 固定自有取证子fixture的进度偏好 | Accepted |
| ADR-0205 | 普通桌面诊断入口的 Explorer 启动与有限复用 | Accepted |
| ADR-0206 | Win10 取证普通入口接入自动入口 | Accepted |
| ADR-0207 | Win10 B2单次普通取证入口的范围绑定 | Accepted |
| ADR-0208 | B3普通取证入口与完整目录的共同前检 | Accepted |
| ADR-0209 | 普通入口失败收尾的信号异常隔离与退出证明 | Accepted |
| ADR-0210 | Win10 产品执行合同 v6：取证准入与有限产品派发 | Accepted |
| ADR-0211 | 桥接自动入口扩展到 B4/B5 与 dispatcher 目标 | Accepted |
| ADR-0212 | 桥接根目录改为 B6/B7 | Accepted |
| ADR-0213 | 当前 Win10 主机的诊断路线与验收证据边界 | Superseded by ADR-0219 |
| ADR-0214 | B8/B9完整本地消费者接入与新派发器CMD路径 | Accepted |
| ADR-0215 | ENGINEERING_02完整工具修复阶段授权 | Accepted |
| ADR-0216 | ENGINEERING_02未派发首轮的不可变替代运行 | Accepted |
| ADR-0217 | ENGINEERING_02完整非子进程排除证明与有界追加轮次 | Accepted |
| ADR-0218 | ENGINEERING_02成功r05普通原始证据有界补收集 | Accepted |
| ADR-0219 | 负责人指定当前 Win10 为可信验收环境 | Accepted |
| ADR-0220 | ENGINEERING_02完整产品验证阶段与退出语义工具 | Accepted |
| ADR-0221 | ENGINEERING_02登记当前Win10已有.NET Framework 4.8.1 | Accepted |
| ADR-0222 | ENGINEERING_02 Text传输修复与最后源版本的完整替代方案 | Accepted |
| ADR-0223 | ENGINEERING_02准确旧解析实例处置与完整替代验证 | Accepted |
| ADR-0224 | ENGINEERING_02先观察实际Process组件锁并完整替代验证 | Accepted |
| ADR-0225 | ENGINEERING_02完整准确数据闭包修复及未派发恢复替代验证 | Accepted |
| ADR-0226 | ENGINEERING_02完整归档消费者修复及有界剩余产品阶段 | Accepted |
| ADR-0227 | ENGINEERING_02空输出Hash修复与当前归档生命周期准确裁决 | Accepted |
| ADR-0228 | ENGINEERING_02生产器摘要修复及一次额外部署根 | Accepted |
| ADR-0229 | ENGINEERING_02报告父目录修复与准确P13物理闭包复用 | Accepted |
| ADR-0230 | ENGINEERING_02冻结前只读变量合同与完整P13替代阶段 | Accepted |
| ADR-0231 | ENGINEERING_02当前容量门失败后的一次只读容量诊断 | Accepted |
| ADR-0232 | ENGINEERING_02停止工具扩建并保留唯一产品收口机会 | Proposed |
| ADR-0233 | ENGINEERING_02唯一收口前的只读容量对象硬门裁决 | Accepted |
| ADR-0234 | ENGINEERING_02容量通过后的唯一完整产品收口阶段 | Accepted |
| ADR-0235 | ENGINEERING_02同一最后阶段的三处本地测试输出绑定修正 | Accepted |
| ADR-0236 | A9-32 未知 Shell 观察门只由已核验目录列表解除，ENOTDIR 按路径不存在处理（ADR-0189 补充） | Accepted |
| ADR-0237 | A9-32 前台 Shell 带 residueRisk 结束时，继续仍按未知结果处理（ADR-0189、ADR-0236 补充） | Accepted |
| ADR-0238 | A9-33 WIN7-45 门 B：限定已直接证明范围签发，KL-12 作为排除项（A9-33 补充） | Accepted |
| ADR-0239 | Alpha 2 登记已知限制 F-01：Full Access 下 13 种启动器包装命令不再要求确认（ADR-0171 补充） | Accepted |
| ADR-0240 | Alpha 2 登记六项已知限制并延期到 RC，G16、G17 先做只读对照（ADR-0131、ADR-0238、ADR-0239 补充） | Accepted |
| ADR-0241 | Alpha 2 登记 G16 为 N/A，G17 升级回退补 M6，四项延期到 RC（ADR-0240 补充） | Accepted |
| ADR-0242 | Alpha 2 补证 M2 缩减：不重做 Provider 拒绝与预算检查，保留续跑后的再次主动尝试（ADR-0240 补充） | Accepted |
| ADR-0243 | Alpha 2 补证 M3-04 通过口径：晚写后撤销保持晚写字节并列入 drifted（ADR-0240、ADR-0242 补充） | Accepted |
| ADR-0244 | Alpha 2 补证 A9-36 以隔离分支任务书为唯一生效版本，并入必跑集合、隔离范围与 M6（ADR-0241、ADR-0242、ADR-0243 补充） | Accepted |
| ADR-0245 | Alpha 2 补证 A9-36 追加实现批准：按 §9 缺口补齐并实现 M6，保留 M2-05 已实现断言，M1-02 加本地裸 origin（ADR-0242、ADR-0244 补充） | Accepted |
| ADR-0246 | A9-37将checkpoint已知秘密判定与日志启发式脱敏分离 | Accepted |
| ADR-0247 | A9-37 登记 `A9_37_DEVELOPER_VERIFIED`（带已知限制） | Accepted |
| ADR-0248 | A9-38 将代理 Basic 组合纳入已知秘密并修正 Authorization 单令牌脱敏 | Accepted |
| ADR-0249 | A9-38 登记 `A9_38_DEVELOPER_VERIFIED`（带已知限制） | Accepted |
| ADR-0250 | Alpha 2 范围纳入 A9-37、A9-38；WIN7-45 不再是 Alpha 2 最终候选 | Accepted |
| ADR-0251 | Alpha 2 补证采用方案 R2：A9-36 改在 WIN7-46 执行，WIN7-45 的 A9-36 r7 门 A 不签发 | Accepted |
| ADR-0252 | A9-36 候选身份改由负责人签发的门 A 授权提供，代码不钉最终候选 | Accepted |
| ADR-0253 | B2-A37-01 源码样本期望改由驱动对齐候选脱敏；新建候选 WIN7-47 取代 WIN7-46 | Accepted |
| ADR-0254 | 预演改走 Win7 开发通道；正式门 A 不变（ADR-0253 补充） | Accepted |
| ADR-0255 | 产品 IPC 对异步方法的拒绝按结构化错误返回；新建候选 WIN7-48 取代 WIN7-47 | Accepted |
| ADR-0256 | 写者静止门把搜狗输入法 SGTool.exe 记为环境进程，不阻塞静止门与 R8 | Accepted |
| ADR-0257 | A9-36 补证编排器的机器名比较改为不区分大小写 | Accepted |
| ADR-0258 | A9-36 补证编排器组内 postflight 按 ADR-0256 规则把 SGTool.exe 记为环境进程 | Accepted |
| ADR-0259 | 驱动经界面刷新同步批准结果；编排器环境进程分类拒绝命令行推断的映像；新建候选 WIN7-49 取代 WIN7-48 | Accepted |
| ADR-0260 | 驱动在后台进程状态变化后经界面刷新；页面滞后登记为 KL-13 并延期到 RC；新建候选 WIN7-50 取代 WIN7-49 | Accepted |
| ADR-0261 | M2 Provider 完整性断言读取同 turn 持久化结果；新建 WIN7-51 | Accepted |
| ADR-0262 | M2 Runner 控制管道异步错误有界失败；新候选 WIN7-52 | Accepted |
| ADR-0263 | M4后检将准确直接映像SogouExe记录为环境进程 | Accepted |
| ADR-0264 | 开发总控使用受控实例清理；固定夹具的三个系统映像获有界终止例外 | Accepted |
| ADR-0265 | 候选外总控退出观察先校验再提交 | Accepted |
| ADR-0266 | 原总控候选外退出拒绝原因诊断 | Accepted |
| ADR-0267 | 原绑定 Process 缓存刷新与零等待信号准入 | Accepted |
| ADR-0268 | M5 两文件隔离密文例外与候选外费用准入 | Accepted |
| ADR-0269 | M5 profile 密钥恢复的条件例外与复验 | Accepted |
| ADR-0270 | 复用隔离恢复材料的新M5有界窗口 | Accepted |
| ADR-0271 | M5 Python 模块导入的零模型最小诊断 | Accepted |
| ADR-0272 | 隔离 Python 运行时与实际 Runner 零模型短链 | Accepted |
| ADR-0273 | 隔离 Python 的新 M5 单轮 DEV 执行与累计费用承诺 | Accepted |
| ADR-0274 | A04 零模型失败调用取证 | Accepted |
| ADR-0275 | A04 模式顺序修复与一次新取证窗口 | Accepted |
| ADR-0276 | 原命令编码配置的一次实机验证 | Accepted |
| ADR-0277 | M5 编码配置及引用澄清持续推进 | Accepted |
| ADR-0278 | 正式 M5 采用 r5 工具版本并登记 KL-14 | Accepted |
| ADR-0279 | 收紧 M5 J1 提示词以降低 A02 重复引用失败 | Accepted |
| ADR-0280 | 正式门 A 执行允许经 Tailscale 中继 | Superseded by ADR-0284 |
| ADR-0281 | 中继传输的有界续传 | Accepted |
| ADR-0282 | 中继传输超时下限降为 40 KB/s | Accepted |
| ADR-0283 | 补充组合同负责人窗口改为 18 小时 | Accepted |
| ADR-0284 | 正式执行与彩排固定走局域网；正式执行失败须先定位再重试 | Accepted |
| ADR-0285 | ADR-0264 夹具清理例外扩到正式执行；到期改读阶段请求 expires_at | Accepted |
| ADR-0286 | WIN7-55 门 B：限定已直接证明范围签发 | Accepted |
| ADR-0287 | WIN7-55 对外发布 0.3.0-alpha.2 内部预览版 | Accepted |
| ADR-0288 | Alpha 阶段节奏与验收执行准则 | Accepted |
| ADR-0289 | 开发级运行与正式验收分开 | Accepted |
| ADR-0290 | 已确认范围内连续交付与本轮工程落地 | Accepted |
| ADR-0291 | 日常验证二次收敛与入口去旧 | Accepted |
| ADR-0294 | A9-34 重启恢复“清理未确认”后台事实的用户确认处置出口 | Accepted |
| ADR-0295 | 提前修复后台任务进展显示与结束同步（A9-40） | Accepted |
| ADR-0296 | 从 WIN7-55 恢复开发构建的锁定 helper | Accepted |
| ADR-0297 | A9-34/A9-40 开发驱动采用准确 SGTool 环境进程分类 | Accepted |

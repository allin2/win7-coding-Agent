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

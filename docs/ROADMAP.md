# ROADMAP — 阶段划分

每个阶段有独立任务文档（`docs/tasks/PHASE_XX_*.md`）与完成标准。
**禁止跨阶段实现未来功能**（AGENTS.md §3）。阶段顺序只能由架构师调整并记录 ADR。

> 阶段编号已按 ADR-0012 冻结：**Model Gateway 固定为阶段 3**。全部文档引用阶段号时以本文件为准。

## 阶段 0 — 工程基线（进行中）

- 产出：AGENTS.md、CLAUDE.md、README.md、docs/ 全套文档骨架、ADR 机制。
- 完成标准：文档相互引用一致；矛盾清单已记录；无实现代码。

## 阶段 1 — Capability Probe（APPROVED_FOR_IMPLEMENTATION）

- 任务文档：`docs/tasks/PHASE_01_CAPABILITY_PROBE.md`（含实现授权状态与允许路径）
- 产出：`win7_agent.probe` 标准库纯 Python 包，探测环境能力并输出结构化 JSON 报告。
- 实现可在现代开发环境 + Python 3.8.10 上开始；**未完成 E1/E2（Win7 SP1 x64）验收前不得标记为完成**。
- 完成标准：见任务文档 §8 验收标准。
- 价值：后续所有阶段的功能开关都以 Probe 报告为依据（能力降级机制的地基）。

## 阶段 2 — 正式只读代码分析 Agent（APPROVED_FOR_IMPLEMENTATION，ADR-0025）

- 任务文档：`docs/tasks/PHASE_02_READONLY_CODE_ANALYSIS.md`（含实现授权状态、契约冻结、原型迁移矩阵与允许路径）。
- 产出：只读代码分析 Agent 闭环（Runtime 状态机、Policy 先于执行、六只读工具、工作区边界、EventStore 审计、Mock/Replay 测试、CLI）；含固定只读 Git 命令的私有受限子进程模块。
- 原"子进程 Runner"独立阶段撤销（ADR-0025）：只读 Git 子集并入本阶段；通用命令执行 Runner 延后至阶段 6 之前另行任务书授权。
- 实现分支：`phase/02-readonly-agent`；禁止整体合并/cherry-pick 原型分支，只能按任务书 §5 迁移矩阵选择性移植。
- 完成标准：任务书 §7/§10/§13；Win7 实机验收前 Phase-Gate 至多到 `READY_FOR_WIN7_VALIDATION`（`Win7-Validation: NOT_PERFORMED`）。

## 阶段 3 — Model Gateway（远程模型通信客户端，未开始）

- 产出：内网 HTTP/HTTPS 客户端（仅 `http.client`/`ssl` 标准库）、自带 CA bundle 方案（需依赖评审 D-006）、请求/响应协议定义。
- **真实 TLS 握手验证在本阶段进行**（阶段 1 仅做离线 Python TLS Runtime 探测，ADR-0016）。
- 前置：阶段 1 TLS 探测结论。

## 阶段 4 — 文件系统层（文件工具阶段，未开始）

- 产出：编码感知的读写模块（含**未知文件的自动编码识别**，阶段 1 只验证显式编码读写）、换行风格保持（CRLF/LF）、写前备份与回滚、路径安全校验（工作区边界）。

## 阶段 5 — 状态与审计存储（未开始）

- 产出：SQLite 状态库 schema（带 schema_version）、操作日志写入、审计导出（JSON）。

## 阶段 6 — Agent Loop（未开始）

- 产出：任务编排循环：接收指令 → 工具调用（读/写/执行）→ 结果回传；权限与确认模型见 SECURITY.md。

## 阶段 7 — 打包与离线交付（未开始）

- 产出：离线交付包构建脚本（在开发机运行）、交付包自校验（哈希清单）、安装即 Probe 的首跑流程。

## 阶段间纪律

- 每阶段开始前：编写/评审该阶段任务文档，格式对齐 PHASE_01（目标/非目标/输入输出/模块设计/错误模型/Schema/测试矩阵/验收标准/禁止事项）。
- 每阶段结束时：在 Win7 SP1 x64 环境完成验收，更新 README 状态表，关键决策补 ADR。

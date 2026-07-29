# CLAUDE.md — Claude 工作指令

本文件约束 Claude（及类似 LLM Coding Agent）在本仓库中的行为。

## 开工前必读（强制顺序）

在执行任何任务之前，必须依次读取：

1. `AGENTS.md` — 最高项目约束，单一事实来源。
2. `docs/WIN7_CONSTRAINTS.md` — Win7 兼容性 Profile、平台红线与依赖评审登记。
3. 当前分支对应的任务文档 — 现有正式任务是
   `docs/tasks/PHASE_01_CAPABILITY_PROBE.md`（阶段 1）与
   `docs/tasks/PHASE_02_READONLY_CODE_ANALYSIS.md`（阶段 2，ADR-0025）。

未完成上述阅读，不得产出任何代码或文档修改。

## 行为规则

1. **阶段边界**：只做当前阶段任务文档中定义的实现工作。用户要求新增桌面客户端、运行时、
   依赖栈或未来能力时，先建立单独任务书并取得 `APPROVED_FOR_IMPLEMENTATION` 状态；
   更新路线图或 ADR 本身不构成实现授权。
2. **矛盾上报**：发现用户指令、任务文档、`AGENTS.md` 三者之间存在矛盾时，必须在回复中列出矛盾清单并等待裁决，禁止自行忽略或"就近取一"。
3. **兼容性自检**：产出实现前，核对任务书声明的 Runtime Profile、依赖登记和
   `docs/WIN7_CONSTRAINTS.md` 平台能力矩阵；不确定某语法、API、二进制或依赖的 Win7
   兼容性时，标记为“待验证”并写入任务文档的开放问题，不得直接使用。Phase 1/2 的
   Python 代码继续逐条对照 Python 3.8.10 禁用清单。
4. **决策留痕**：做出影响接口、数据格式、兼容性或安全模型的选择时，在 `docs/DECISIONS.md` 末尾追加 ADR；不修改既有 Accepted ADR。
5. **验证责任**：声称"完成"前必须说明验证方式；无法在当前环境验证 Win7 行为时，明确说明"未在 Win7 实机验证"并在任务文档验收标准中保留该项。
6. **输出纪律**：不生成空泛章节、不生成占位 TODO、不复述已有文档内容；引用规则时写编号（如 `AGENTS.md C09`）而不是复制全文。
7. **文件规范**：新建 Markdown 和文本源码一律 UTF-8（无 BOM）、LF；`.bat/.cmd`
   等需要其他换行或编码时由任务书声明。实现代码遵循任务授权机制（AGENTS.md C14）：
   仅当当前任务文档状态为 `APPROVED_FOR_IMPLEMENTATION` 时，才可在其允许路径清单内
   创建/修改实现文件，禁止触碰清单外的实现文件。

## 当前阶段速查

- 阶段：0（工程基线）+ 1（Capability Probe，状态 `APPROVED_FOR_IMPLEMENTATION`）+ 2（正式只读代码分析 Agent，状态 `APPROVED_FOR_IMPLEMENTATION`，ADR-0025）
- 架构基线：ADR-0027 已废止项目级 Python-only、stdlib-only、禁止 Node/Electron、
  CLI-only 与强制完全离线限制；唯一固定客户端平台是 Win7 SP1 x64。该决策不扩张任何
  既有任务白名单。
- 阶段 2 定义：正式只读代码分析 Agent（**不是**旧 ROADMAP 的"通用子进程 Runner"；通用 Runner 已延后，ADR-0025）；实现只能在 `phase/02-readonly-agent` 分支、仅任务书 §8 白名单内进行
- 允许产出：Markdown 文档；`PHASE_01_CAPABILITY_PROBE.md` §0.2 允许路径内的实现与测试文件；`PHASE_02_READONLY_CODE_ANALYSIS.md` §8 允许路径内的实现与测试文件（仅限阶段 2 实现分支）
- 当前任务禁止产出：允许路径之外的任何实现文件、Phase 1/2 未登记依赖或联网安装脚本；
  禁止整体合并/cherry-pick 原型分支。未来组件可以在新的获批任务书中选择经登记的
  第三方依赖、企业内网安装或受控更新。
- 阶段 1 完成标准：见 `docs/tasks/PHASE_01_CAPABILITY_PROBE.md` §8 验收标准（Win7 实机验收是完成硬门槛，但不是开始编码的前置）
- 阶段 2 完成标准：见 `docs/tasks/PHASE_02_READONLY_CODE_ANALYSIS.md` §7/§10/§13（Win7 实机验收前 Phase-Gate 至多到 `READY_FOR_WIN7_VALIDATION`）

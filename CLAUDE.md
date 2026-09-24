# CLAUDE.md — Claude 工作指令

本文件约束 Claude（及类似 LLM Coding Agent）在本仓库中的行为。

## 开工前必读

1. `AGENTS.md` — 最高项目约束，单一事实来源；其 §3 规定按任务类型读取的范围。
2. 写、改、审查或调试实现前，再读 `docs/WIN7_CONSTRAINTS.md` 与当前任务书。当前任务书经
   `docs/STATUS.md`（当前工作项）与 `docs/tasks/README.md`（授权状态）定位，本文件不写死
   具体任务（ADR-0134）。

未完成 `AGENTS.md` §3 要求的阅读，不得产出任何代码或文档修改。

## 行为规则

1. **阶段边界**：只做当前阶段任务文档中定义的实现工作。用户要求新增桌面客户端、运行时、
   依赖栈或未来能力时，先建立单独任务书并取得 `APPROVED_FOR_IMPLEMENTATION` 状态；
   更新路线图或 ADR 本身不构成实现授权。
2. **矛盾上报**：发现用户指令、任务文档、`AGENTS.md` 三者之间存在矛盾时，必须在回复中列出矛盾清单并等待裁决，禁止自行忽略或"就近取一"。
3. **兼容性自检**：产出实现前，核对任务书声明的 Runtime Profile、依赖登记和
   `docs/WIN7_CONSTRAINTS.md` 平台能力矩阵；不确定某语法、API、二进制或依赖的 Win7
   兼容性时，标记为"待验证"并写入任务文档的开放问题，不得直接使用。Phase 1/2 的
   Python 代码继续逐条对照 Python 3.8.10 禁用清单。
4. **决策留痕**：做出影响接口、数据格式、兼容性或安全模型的选择时，在 `docs/DECISIONS.md` 末尾追加 ADR；不修改既有 Accepted ADR。
5. **验证责任**：声称"完成"前必须说明验证方式；无法在当前环境验证 Win7 行为时，明确说明"未在 Win7 实机验证"并在任务文档验收标准中保留该项。
6. **输出纪律**：不生成空泛章节、不生成占位 TODO、不复述已有文档内容；引用规则时写编号（如 `AGENTS.md C09`）而不是复制全文。
7. **文件规范**：新建 Markdown 和文本源码一律 UTF-8（无 BOM）、LF；`.bat/.cmd`
   等需要其他换行或编码时由任务书声明。实现代码遵循任务授权机制（AGENTS.md C14）：
   仅当当前任务文档状态为 `APPROVED_FOR_IMPLEMENTATION` 时，才可在其允许路径清单内
   创建/修改实现文件，禁止触碰清单外的实现文件。

## 长期有效约束速查

当前阶段、任务状态、候选结论与阻断项一律以 [`docs/STATUS.md`](docs/STATUS.md) 为准，
任务授权状态见 [`docs/tasks/README.md`](docs/tasks/README.md)；本节只列不随阶段变化的约束。

- 架构基线：ADR-0027 已废止项目级 Python-only、stdlib-only、禁止 Node/Electron、CLI-only 与
  强制完全离线限制；唯一固定客户端平台是 Win7 SP1 x64。该决策不扩张任何既有任务白名单。
- Phase 1/2 为 Python 历史冻结合同（CPython 3.8.10），相关代码继续逐条对照 Python 3.8.10 禁用清单；
  阶段 2 是正式只读代码分析 Agent，不是通用子进程 Runner（ADR-0025）。
- 独立原型线 `prototype/full-agent-skeleton`（ADR-0023）禁止整体合并或 cherry-pick。
- 任何实现只能在状态为 `APPROVED_FOR_IMPLEMENTATION` 的任务书允许路径内进行（AGENTS.md C14）；
  未登记依赖、联网安装脚本与白名单外实现文件一律禁止。
- Win7 实机验收是完成硬门槛，但不是开始编码的前置；开发机结果不等于 Win7 通过。

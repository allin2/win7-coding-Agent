# A9-26 — 第一批：可靠性（恢复目录自忽略、验证判定、项目说明、上下文预算、环境事实、历史加载）

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: RELIABILITY_HARDENING
Target Branch: codex/a9-alpha2（开发在独立工作树与分支 codex/a9-26-reliability）
Source Baseline: codex/a9-alpha2 @ 本任务书批准提交（WIN7-41 已于 0f8af24 冻结）
Target Version: 0.3.0-alpha.2
Phase-Gate: A9_26_IMPLEMENTATION_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0146
```

> 依据：[A9 Alpha 2 推进顺序](../plans/A9_ALPHA2_DELIVERY_SEQUENCE.md) 阶段 2 与 §5 的 D1 裁决、ADR-0145 编号顺延记录。
> 2026-09-29 负责人批准本任务书与 ⑤ 交互 Demo（[a9-26-history-loading-demo](../plans/a9-26-history-loading-demo/index.html)），§7 全部按建议裁决（“同意”）。
> 实现只能在 §4 允许路径内进行（AGENTS.md C14）；实现交接书 [A9_26_RELIABILITY_HANDOFF.md](../plans/A9_26_RELIABILITY_HANDOFF.md)。
> §2 中的代码事实均为 2026-09-29 在 `0997760` 上的开发机核实结果，未在 Win7 验证。

## 1. 目标与进入条件

一次交付六个里程碑（⓪～⑤），按顺序在同一分支完成，每个里程碑独立提交、独立可回退；全部通过开发机门后一次并入 `codex/a9-alpha2`，再由换发任务出 WIN7-42。

进入条件：WIN7-41 已冻结（`0f8af24`），并入不改变其候选字节。若 WIN7-41 实机暴露产品缺陷，修复以冻结提交为基线另行处理，不从本分支取改动。

## 2. 里程碑

### ⓪ 恢复目录自忽略（D1 方案 3b）

**现状**：`.agent_recovery/` 由 `CheckpointManager` 在工作区根创建（`src/workspace/src/checkpoint-manager.ts:115-118`、`:296`），不写任何 Git 排除规则；
未忽略它的仓库中 `git add -A`/`git add .` 会暂存改动前原文与绝对路径，`git clean -fd`、`git stash -u` 会删掉或收走它使撤销失效（[核查报告](../reports/2026-09/a9_recovery_dir_git_exposure_check_2026-09-27.md)）。

**做法**：

1. 恢复根被创建时，在其中原子写入 `.agent_recovery/.gitignore`，内容 `*` 加 LF，UTF-8 无 BOM。
2. 打开工作区（`A9WorkspaceService` 构造）时，若恢复根已存在而 `.gitignore` 缺失则补写；已存在的 `.gitignore` 不改写（幂等，见 Q1）。
3. 写入失败不阻断 Agent，但发结构化诊断 `A9_RECOVERY_GITIGNORE_WRITE_FAILED`（路径脱敏），并在诊断页可见；不静默吞掉。
4. 该文件不进入 checkpoint、外部变化收集与工作区扫描（沿用 `rel.startsWith('.agent_recovery')` 跳过）。

| 编号 | 可观察条件 |
|---|---|
| R0-01 | 干净示例仓库（无 `.gitignore`）跑一次编辑轮与一次 Shell 轮后：`git status --porcelain -uall` 不含 `.agent_recovery`；`git add -A`、`git add .`、`git add :/` 暂存数为 0 个恢复文件 |
| R0-02 | 同上，`git clean -fd` 与 `git stash -u` 后恢复目录仍在，撤销 turn-1 成功（`git clean -fdx` 仍会删除，作为已知限制写入 STATUS 手动缓解说明） |
| R0-03 | 先用旧版本产生无 `.gitignore` 的恢复目录，再以新版本打开工作区：补写一次；再打开不重复写、不改写用户已有的 `.gitignore` |
| R0-04 | 工作区为仓库子目录（`pkg/`）时同样生效 |
| R0-05 | 负向对照：删掉补写调用，R0-03 的测试失败 |

### ① “已验证”判定的复现与收紧

**现状**（`src/core/src/a9-agent-loop.ts:163-199`、`:1080-1100`、`:1249-1280`）：有副作用后，任一“非纯输出”的 Shell 命令以退出码 0 结束即记 `verified`；
纯输出名单只有 `echo/ls/cat/type/dir…`，运行器名单含 `git`、`cmd`、`powershell`、`bash`。每次 Shell 调用后按**轮前基线**收集外部变化，有变化即清除 `verified`。

**现成素材**：W41 第三轮预演 `.acceptance/rehearsals/A9-25-W41/20260929-0748/R1/evidence/win7-tree/smoke/projection-query-export.json`：
轮次 `turn-1790640065965-2` 为 `read` → `edit calc.ts` → `shell: Write-Output 'smoke-verified'`，结局记为 `completed / verified`——
`Write-Output` 只是输出，这是**假阳性**。同一导出中 2 个 `completed_with_warnings` 分别为无验证的删除审批轮与输出截断轮（W41-12），符合设计。
WIN7-40 实机运行 `81c7a234` 的证据未跑到这些阶段。因此“未验证/有警告”方向是否存在误判，目前只有下列代码推断，须先复现。

**待复现假设**（先写失败测试固定现状，再修；复现不了的如实记录，不修）：

| 编号 | 方向 | 假设 |
|---|---|---|
| H1 | 假阳性 | PowerShell 输出/查看类 cmdlet（`Write-Output`、`Write-Host`、`Get-Content`、`Get-ChildItem`、`Get-Location`、`Select-String` 等）不在纯输出名单，成功即 `verified`（已由上述素材证实一例） |
| H2 | 假阳性 | 运行器名单按“出现即算”：`git status`/`git diff`/`git log`、`node -v`、`npm -v`、`python --version` 成功即 `verified` |
| H3 | 假阴性 | 外部变化按轮前基线**累计**比较：验证成功后再跑任一 Shell 命令（如 `type x`、`dir`），会把本轮早先的同一批变化再报一次并清除 `verified`，而查看类命令不会恢复它 |
| H4 | 假阴性 | Shell 本身产生的变化（如 `node gen.js` 生成文件）之后，即使紧接着跑 `npm test`，结论取决于命令顺序与分类细节，需要逐例确认 |

**收紧方向**（复现后定稿，写入 ADR-0146）：

1. 命令分三类：**验证类**（测试、构建、类型检查、lint、运行项目脚本或源文件，如 `npm test`、`npm run <script>`、`npx jest`、`pytest`、`tsc`、`dotnet build/test`、`node <文件>`、`python <文件>`）、
   **中性类**（查看、输出、版本查询、Git 只读），**变更类**（其余）。只有验证类成功才记验证；中性类既不证明也不清除；无法判断的归变更类（宁可记“未验证”）。
2. 清除 `verified` 的条件改为“与**上一次收集**相比出现新变化”，而不是“与轮前基线相比有变化”。
3. `turn_completed.data` 只增字段 `verificationEvidence`：验证命令（脱敏、≤200 字符）与退出码；界面结论卡显示“依据：`npm test` 退出码 0”（见 Q3）。

| 编号 | 可观察条件 |
|---|---|
| R1-01 | H1～H4 各有表驱动测试，修复前与现状一致的用例在提交历史中可见（先红后绿） |
| R1-02 | 编辑后只跑 `Write-Output`/`echo`/`git status`/`node -v` → `unverified`；编辑后 `npm test` 退出码 0 → `verified`；之后再跑 `type x` → 仍 `verified` |
| R1-03 | 验证之后又经 `edit` 或 Shell 产生新变化 → `unverified`；验证命令失败（非 0）→ `unverified` |
| R1-04 | PowerShell 与 CMD 宿主包裹（`powershell -Command "…"`、`cmd /c …`）按实际载荷分类，与 ADR-0137 的载荷展开一致；无法展开 → 不计验证 |
| R1-05 | 用 W41 预演素材中的事件序列构造回放测试，结论从 `verified` 变为 `unverified` |
| R1-06 | 负向对照：恢复“出现运行器即算”，R1-02 至少一例失败 |

### ② AGENTS.md 确定性加载

**现状**：System Prompt 声明优先级第 3 条为 “AGENTS.md and detected project instructions (CLAUDE.md, etc.)”（`src/core/src/system-prompt.ts:66`），
但 A9 运行路径从不读取任何 AGENTS.md；`discoverAgentsRules`（`src/core/src/agents-discovery.ts`）只被旧的 `runtime.ts`/`context-bootstrap.ts` 使用。模型被告知有项目说明，实际没有。

**做法**：

1. 每轮开始读取**工作区根** `AGENTS.md`（仅此一个文件，见 Q4）；上限 32 KiB；UTF-8，去 BOM；解码失败、超限、含已知秘密时**不加载**并给出原因，不使本轮失败。
2. 以独立消息放在 System Prompt 之后，包裹为 `<project_instructions source="AGENTS.md" sha256="…">…</project_instructions>`；每轮替换而不是追加，历史中只存在一份。
3. 不写入对话事实、不进入恢复给 Provider 的历史（`buildPersistedTextContext`）；改动 AGENTS.md 后下一轮生效。
4. `turn_started.data` 只增字段 `projectInstructions: { status: loaded|absent|too_large|decode_error|secret_blocked|outside, bytes, sha256 }`；过程记录显示一行“已加载 AGENTS.md（3.2 KB）”或原因。
5. System Prompt 第 3 条改为只声明实际加载的来源；版本号升为 `a9-system-prompt-v3`。

| 编号 | 可观察条件 |
|---|---|
| R2-01 | 有 AGENTS.md：Provider 请求中恰有一份说明且位于 System Prompt 之后；连续三轮仍只有一份 |
| R2-02 | 两轮之间修改 AGENTS.md：第二轮请求中为新内容、`sha256` 变化 |
| R2-03 | 缺失、超过 32 KiB、非 UTF-8、含已知秘密：各自的 `status`，本轮正常进行，请求中无说明内容，秘密不进入请求、事件与日志 |
| R2-04 | 中文与空格路径的工作区可加载；`AGENTS.md` 为指向工作区外的符号链接或联接点时拒绝（`status=outside`） |
| R2-05 | 重启后恢复历史中不含说明文本；负向对照：去掉“替换”改为追加，R2-01 失败 |

### ③ 输入上下文预算

**现状**：启动恢复有上限（20 轮、32,000 字符，`a9-agent-runtime.js:2352`），但进程内 `conversationHistory` 跨轮保留全部 assistant `tool_calls` 与 tool 结果；
单次工具结果上限 16 KiB（`a9-agent-loop.ts:398`）、每轮最多 30 步，**没有总量控制**；超出 Provider 窗口时请求失败即 `turn_failed`，没有降级。

**做法**：

1. 每次 Provider 请求前按预算组装：固定部分（System Prompt、②、④）→ 当前轮全部消息 → 历史轮次从新到旧按**完整轮**取，直到预算用尽。
2. 当前轮自身超预算时，从最早的工具结果开始替换为占位（`[较早的工具输出已省略：N 字符，完整输出见工具日志]`），不删消息，保证 `tool_calls` 与 `tool` 结果成对。
3. 预算以字符计（中文按 1 字符计，偏保守），默认值与可配置方式见 Q5。
4. Provider 返回可识别的“上下文超长”错误时，以一半预算重试一次；仍失败则 `turn_failed`，说明“对话过长，已尝试压缩仍超出模型上限”。
5. `turn_started.data` 只增字段 `context: { budgetChars, estimatedChars, includedRounds, omittedRounds, elidedToolResults }`；诊断页现有 `contextWindow` 同步显示。

| 编号 | 可观察条件 |
|---|---|
| R3-01 | 构造 50 轮、每轮 30 步 × 16 KiB 的历史：每次请求估算字符 ≤ 预算，且消息序列通过 OpenAI 协议的 `tool_calls`/`tool` 配对校验 |
| R3-02 | 被省略的是最早的完整轮次；当前轮用户输入与最后一次工具结果永远保留 |
| R3-03 | 模拟 Provider 首次返回超长错误：第二次请求预算减半并成功；两次都失败时结局 `turn_failed` 且原因可读 |
| R3-04 | 预算充足时请求内容与现状逐字节一致（不引入无谓变化） |
| R3-05 | 负向对照：去掉成对保护，R3-01 的配对校验失败 |

### ④ Win7 能力信息注入

**现状**：System Prompt 只有 `Target Environment: Windows 7 SP1 x64`（写死的默认值，不是探测结果）与 Shell 种类/版本；模型不知道 Win7 没有系统 `curl.exe`/`tar.exe`、`MAX_PATH` 260、PowerShell 版本相关的 cmdlet 差异等。

**做法**：

1. 由宿主用**不启动新进程**的方式收集事实：`os.release()`/架构、既有 Shell 探测结果（种类、版本、是否为用户显式 Shell）、按 `PATH` 只做文件存在检查的常用工具（`git`、`node`、`python`、`npm`，不取版本）。
2. 按事实拼出“环境事实”块（≤1.5 KB），附固定的 Win7 注意事项（取自 `docs/WIN7_CONSTRAINTS.md`：无系统 `curl`/`tar`、路径长度、中文路径与编码、PowerShell 2～4 缺少的 cmdlet 只在检测到对应版本时提示）。
3. **不虚构**：开发机或非 Win7 上注入实际探测到的系统，不写 Win7；探测失败的项写“未知”。
4. 与 ② 同位于固定前缀，计入 ③ 的固定部分。

| 编号 | 可观察条件 |
|---|---|
| R4-01 | 注入块只含探测事实与对应注意事项，长度 ≤1.5 KB；探测不到的项为“未知” |
| R4-02 | 模拟 PowerShell 2.0 与 5.1、CMD 三种 Shell：注意事项随之不同；5.1 下不出现 2.0 的限制 |
| R4-03 | 在 macOS 开发机上运行：注入内容不含“Windows 7” |
| R4-04 | 收集过程不产生子进程（测试中 `child_process` 调用计数为 0） |

### ⑤ 会话中选择工作区后的历史加载

**现状**：`chooseWorkspace`（`src/shell/product/renderer/a9-workbench.js:1967`）只刷新快照和文件树，不调用 `loadConversationEvents`；
已有历史的终态轮次显示“历史记录未包含过程。”（实为“未加载”），须切换对话或完成一轮后才出现过程记录（WIN7-39 产品侧观察）。
`src/shell/tests/product/a9-w39-m4-workspace-loading.test.ts` 固定了这一现状；W39～W41 的 M4 旅程用热身轮规避。

**做法**（以 Demo 为准）：

1. 选择或切换工作区后，若活动对话已有历史，立即按切换对话的同一路径加载最近 300 条过程事件（沿用 `historyGeneration` 防串台）。
2. 加载中在对话流顶部显示“正在加载过程记录…”，轮次块不显示“历史记录未包含过程。”；失败显示“过程记录加载失败”与“重试”，已有请求与结果保留。
3. 超出已加载窗口的更早轮次仍显示 `.legacy-note`（驱动以其存在判断“未加载”，见 §4），顶部“加载更早记录”不变。
4. 连续快速切换两个工作区：只渲染最后一个的结果。
5. 同一里程碑内改写 M4 测试为新行为（加载在选择后即发生，无需热身轮），并保留负向对照。

| 编号 | 可观察条件 |
|---|---|
| R5-01 | 选择有 2,500 条历史的工作区后，未提交任何轮次即调用 `queryEvents` 一次，加载 300 条，顶部出现“加载更早记录” |
| R5-02 | 加载期间显示加载提示；完成后提示消失；失败显示原因与“重试”，重试成功后正常显示 |
| R5-03 | 快速切换 A→B：A 的迟到响应不渲染；B 的历史正确 |
| R5-04 | 空工作区（无历史）不发请求或请求返回空，显示空状态，不显示错误 |
| R5-05 | A9-16 U01–U07、A9-19 实时过程、A9-24 改动审阅用例不回退；新提示 `aria-live` 可读、键盘可达 |
| R5-06 | 负向对照：删掉选择后的加载调用，R5-01 失败 |

## 3. 产品观察 O-1、O-2、O-4 的评估

| 观察 | 事实（2026-09-29 核实） | 建议 |
|---|---|---|
| O-1 取消没有终态事件 | 三处取消路径调用 `finalize` 时不传事件类型（`a9-agent-loop.ts:612-619` 等），事件流无终态，`a9_turns` 有 | **并入 ①**：同一文件、同属“结局如实”。取消时发 `turn_completed`（`outcome=cancelled`），渲染端把“任务完成 · cancelled”改为“已停止”；不新增事件类型、不改 State |
| O-2 超限文件原因措辞 | 渲染端按 `change.kind` 取原因，`kind=modified` 时落到“缺少原始内容”，再拼上后端原文“轮前基线未覆盖（too_large）…”（`a9-workbench.js:1353`） | **并入 ⑤**：改动审阅响应只增字段 `reasonCode`（`too_large/outside/backup_failed…`，来自 checkpoint 已记录的事实，只读），渲染端按它显示“超过备份上限（2 MiB）”，不再露出内部标记。Demo 含此卡片 |
| O-4 命令产生文件 Diff 为空 | Shell 新建的文件只记 `newHash`，不保存轮后内容，Diff 无从生成，显示 `+0 −0` | **不并入**：需要保存或回读轮后内容，并处理大小上限、秘密门与漂移，属于改动审阅功能而非可靠性；建议与 A9-24 C8“按块撤销”合为一个后续任务 |

## 4. C14 允许路径（批准后冻结）

实现在独立工作树与分支 `codex/a9-26-reliability`（自 `codex/a9-alpha2` 批准提交创建）进行，只允许修改或新增：

- `src/workspace/src/checkpoint-manager.ts`：⓪ 恢复根创建时写 `.gitignore`；O-2 的只读字段。不得改撤销、持久化格式或漂移判定语义；
- `src/workspace/src/a9-workspace-service.ts`：⓪ 打开时补写；
- `src/core/src/a9-agent-loop.ts`、`src/core/src/system-prompt.ts`、`src/core/src/index.ts`（仅导出）；
- 新增 `src/core/src/a9-verification-evidence.ts`、`a9-project-instructions.ts`、`a9-context-budget.ts`、`a9-environment-facts.ts`；
- `src/shell/product/a9-agent-runtime.js`：注入 ②④ 与预算配置、只增事件字段；不新增 IPC 通道；
- `src/shell/product/renderer/a9-workbench.js`、`workbench.html`、`a9-workbench.css`；
- 测试：`src/core/tests/**`、`src/workspace/tests/unit/**`、`src/shell/tests/product/**`（新增测试；`a9-w39-m4-workspace-loading.test.ts` 允许按 ⑤ 改写；
  其余既有测试只允许因文案变更更新断言，不得删用例或放宽断言）。

不得修改：State（含 schema）、`a9-product-ipc.js`、preload、`main.js`、Runner、`git-command-policy.ts`（只读调用其导出）、native、发布脚本与 `release/**`、
`src/shell/tests/product/a9-06-driver-entry.cjs`、W39～W41 驱动与旅程。触碰清单外文件即停止并报告。

兼容约束：`.legacy-note` 类名与“历史记录未包含过程。”文本对**未加载**轮次保持不变（`a9-06-driver-entry.cjs:1383-1386` 依赖）；A9-24 §5.1 全部兼容点保持；
事件与响应只增字段不改既有字段；`A9_SYSTEM_PROMPT_VERSION` 变化须在 ADR-0146 中说明。

## 5. 验证矩阵

开发机（macOS，Node 20.17）全部通过后才能交付：

1. `src/core`、`src/workspace`、`src/shell` 全量 Jest；
2. `npm run verify:quick`、`npm run docs:check`、`git diff --check`；
3. `node --test scripts/release/test/a9-package.test.mjs`（证明发布与驱动套件未受影响）；
4. 各里程碑的负向对照（R0-05、R1-06、R2-05、R3-05、R5-06）各至少一个新增测试失败，还原后工作区干净；
5. ⓪ 另在真实 Git（开发机 Apple Git 与 Windows Git for Windows 各一次，后者可在 Win10 开发机）上跑 R0-01～04。

真实 Electron 画面与 Win7 实机：`NOT_PERFORMED`，由换发任务 WIN7-42 承担（⓪ 实机用例按 D1 裁决必须纳入），不得宣称通过。

## 6. 非目标

- 恢复目录迁出工作区、保留期与清理（D1 已决定另立任务评估）；`git clean -fdx` 下的保护。
- O-4 与按块撤销；Shell 运行中输出（helper v3）、后台进程工具、可恢复的继续机制（第二批）。
- 嵌套目录的 AGENTS.md、CLAUDE.md 等其他说明文件；模型自身的 token 精确计数。
- 左栏“进行中”分组滞后、checkpoint 往返校验分片（A9-19 残留，另立任务）。

## 7. 裁决结果（2026-09-29，负责人全部按建议）

**矛盾与需确认的前提**（CLAUDE.md 行为规则 2）：

- C1：推进顺序 §2 阶段 2 的并入条件写的是“WIN7-40 冻结后并入”；2026-09-28 的顺延记录只改了阶段 3 与 D1 的编号，没有改这一条。
  **裁决**：按“WIN7-41 冻结后并入”执行，已在推进顺序 §5 追加记录。
- C2：并入 O-1、O-2 属于调整批次范围。**裁决**：同意，已在推进顺序 §5 追加记录；O-4 不并入。

**设计问题**（均采纳建议）：

- Q1 ⓪ 已存在但内容不是 `*` 的 `.agent_recovery/.gitignore`：**建议不改写**，只在诊断页提示；备选为强制改写为 `*`。
- Q2 ⓪ 写入失败：**建议不阻断**、诊断可见；备选为该工作区禁止写操作直到修复。
- Q3 ① 结论卡是否显示验证依据（命令与退出码）：**建议显示**，只增字段，Demo 未画（不影响布局，只在结论卡多一行小字）。
- Q4 ② 只读工作区根 `AGENTS.md`：**建议是**；嵌套目录与 CLAUDE.md 以后按需求另议。
- Q5 ③ 默认预算：**建议 96,000 字符**，在 Provider 配置中可选填 `contextBudgetChars`（不加界面）；备选为按 Provider 探测的模型窗口自动推算（需要额外探测，暂不建议）。
- Q6 O-1、O-2 并入，O-4 另立：**建议如 §3**。
- Q7 ⑤ Demo 确认，本任务书同时进入 `APPROVED_FOR_IMPLEMENTATION`。

## 8. 执行记录

- 2026-09-29：验收方起草本任务书与 ⑤ 交互 Demo，交负责人审阅。
- 2026-09-29：负责人批准（C1、C2、Q1～Q7 全部按建议），追加 ADR-0146 与推进顺序 §5 记录；发出实现交接书 [A9_26_RELIABILITY_HANDOFF.md](../plans/A9_26_RELIABILITY_HANDOFF.md)。
- 2026-09-29：执行方建立工作树（基线 `6acbb14`）后按交接书停止报告两点：⓪ 所引恢复根创建位置有误、① 首个测试提交口径与 R1-01 不一致。验收方核实属实，
  裁决见交接书附录 A（统一恢复区建目录入口；`it.failing` 先红后绿），不改本任务书范围与允许路径。
- 2026-09-29：执行方再报 Q1 与交接书“不读取、不比较”冲突；验收方以任务书为准，裁决见交接书附录 A3（只读检查、不改写、非阻断诊断）。
- 2026-09-29：验收方自查交接书与任务书，发现 ⑤ 加载期间移除 `.legacy-note` 与 §4 兼容约束冲突，预先裁决见交接书附录 A4（加载期间保留，Demo 骨架占位不实现）；未发现其他冲突。
- 2026-09-29：执行方于 `9d30719`（⓪～⑤ 已提交，Core 482/482、Workspace 230/230，Shell 3 项失败）停止报告既有测试冲突。验收方核实：两项生命周期失败源于实现把变更类命令本身计为副作用（偏离 ①），
  须改实现、测试不动；产品合同用例特许只改输入为真实验证命令、断言不变，并新增旧输入的新语义用例。见交接书附录 A5。

## 9. ADR

ADR-0146（已写入 `docs/DECISIONS.md`）：恢复目录自写 `.gitignore`；验证证据三分类与“相对上次收集的新变化”失效规则、`verificationEvidence` 字段；
工作区根 AGENTS.md 每轮加载且不入历史、`a9-system-prompt-v3`；输入上下文字符预算与超长一次降级重试；环境事实只注入探测结果；取消轮次发终态事件；改动审阅 `reasonCode` 只增字段。

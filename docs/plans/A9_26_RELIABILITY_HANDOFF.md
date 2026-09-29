# A9-26 第一批可靠性实现交接书

> 执行方：外部执行 Agent。验收方：发出本交接书的会话。授权依据：[A9-26](../tasks/A9_26_RELIABILITY_BATCH_1.md)（`APPROVED_FOR_IMPLEMENTATION`，ADR-0146）。
> 目标、验收用例（R0-01～R5-06）与允许路径以任务书 §2、§4 为准；⑤ 的交互参照 [Demo](a9-26-history-loading-demo/index.html)。本文只给实现方案、顺序与交付要求。

## 1. 起点与约束

- 在主工作区外新建工作树：`git worktree add ../win7-coding-agent-a9-26 -b codex/a9-26-reliability codex/a9-alpha2`；
  `node_modules` 用符号链接复用主工作区（根目录与各 `src/*`），各包 `dist` 在本工作树内构建。Node 20.17。
- 只在任务书 §4 允许路径内修改，保持 §4 兼容约束。本地提交，**不推送、不合并**。不下载、不安装、不联网。
- 里程碑按 ⓪→⑤ 顺序，**每个里程碑至少一个独立提交**，提交信息以 `A9-26 ⓪`…`A9-26 ⑤` 开头；① 先提交固定现状的测试，再提交修复。
- 测试产生的恢复目录、Git 仓库与工作区一律放在 `os.tmpdir()` 下并在结束时删除；不得在源码树内生成 `.agent_recovery/`。
- 发现文档之间或与代码现状矛盾、或需要清单外文件时，停止并列出清单等待裁决。

## 2. 实现方案

### ⓪ 恢复目录自忽略

- 在 `CheckpointManager` 中新增内部方法 `ensureRecoveryIgnore()`：恢复根存在时，若 `<恢复根>/.gitignore` 不存在，先写临时文件再 `renameSync` 为 `.gitignore`，内容 `'*\n'`（UTF-8 无 BOM）。
  已存在即返回，不读取、不比较、不改写。
- 在恢复根首次创建处（`checkpoint-manager.ts:296` 附近的 `mkdirSync`）之后调用；`A9WorkspaceService` 构造时对已存在的恢复根调用一次。
- 写入失败：捕获后把 `{ code: 'A9_RECOVERY_GITIGNORE_WRITE_FAILED', detail }`（detail 不含绝对路径）放入该服务可读取的诊断列表，宿主在诊断快照中透出；不抛出、不阻断。
  宿主透出只允许在 `a9-agent-runtime.js` 既有诊断结构中增加字段，不新增 IPC 通道。
- R0 测试用真实 `git`（`child_process.execFileSync('git', …)`，只在测试中）在临时仓库执行；机器上无 Git 时测试标记跳过并在报告中说明。

### ① 验证判定

1. **先固定现状**：新增 `src/core/tests/a9-verification-evidence.test.ts`，对 H1～H4 各写用例，断言**当前**行为（如编辑后 `Write-Output` → `verified`），单独提交。
   复现不了的假设在报告中写明“未复现”及所用序列，不修。
2. 新建 `src/core/src/a9-verification-evidence.ts`，导出 `classifyShellCommandForVerification(command): 'verify' | 'neutral' | 'mutating'`：
   - 先用 `expandShellHostPayloads`（只读调用 `git-command-policy.ts`）展开宿主包裹，展开失败 → `mutating`；
   - 按 `| && || ;` 拆段；任一段为变更类 → `mutating`；否则任一段为验证类 → `verify`；否则 `neutral`；
   - 中性类：`echo/printf/type/cat/dir/ls/pwd/cd/where/which/findstr/more/sort`、PowerShell 的 `Write-Output/Write-Host/Get-Content/Get-ChildItem/Get-Location/Get-Item/Select-String/Test-Path/Measure-Object` 及常用别名、
     `git status/diff/log/show/branch/rev-parse/ls-files`、任何命令仅带 `-v/--version/-h/--help`；
   - 验证类：`npm test`、`npm run <任意>`、`npm t`、`yarn/pnpm test|run`、`npx <jest|vitest|mocha|tsc|eslint>`、`jest/vitest/mocha/pytest/py.test/tsc/eslint`、
     `dotnet build|test`、`msbuild`、`mvn`、`gradle`、`make`、`cargo build|test|check`、`go build|test|vet`、`node|python|py <脚本文件>`；
   - 其余一律 `mutating`。名单写成常量表并在测试中逐条覆盖。
3. 在 `a9-agent-loop.ts` 中：
   - 用上述分类替换 `isNonVerifyingCommand` 的使用处（保留该导出以免外部引用断裂，可标注已弃用）；`neutral` 不改变 `verifiedAfterMutation`，`verify` 且退出码 0 才置真；
   - `collectExternal` 记录上一次收集结果的“路径 → 新哈希/种类”签名，只有出现新路径或同一路径签名变化时才置 `mutations=true` 并清除 `verifiedAfterMutation`；
   - 验证命令本身产生新变化（H4）：先按新变化清除，再按本次命令分类判定；即验证类命令即使产生文件，退出码 0 仍记验证。若复现结果显示需要别的口径，停止并报告；
   - `finalize` 的 `turn_completed` 数据与结果只增 `verificationEvidence: { command, exitCode }`（命令经既有脱敏，截断到 200 字符），只在 `verified` 时出现。
4. **O-1**：三处取消路径（`a9-agent-loop.ts:612`、`:675`、`:881` 附近）调用 `finalize` 时传 `'turn_completed'`，数据 `{ outcome: 'cancelled', finalMessage }`。
   渲染端 `a9-workbench.js:564` 的活动文案对 `cancelled` 显示“已停止”；结论卡同样显示“已停止”。确认宿主与持久化对 `outcome=cancelled` 的 `turn_completed` 不会记成成功（写测试）。
5. 结论卡在 `verificationEvidence` 存在时加一行小字“依据：<命令> 退出码 0”（`textContent`）。

### ② AGENTS.md

- 新建 `src/core/src/a9-project-instructions.ts`：`loadProjectInstructions(workspaceRoot, { containsSensitiveData })` 返回 `{ status, bytes, sha256, content? }`。
  `lstat` 后 `realpath`，结果不在工作区内 → `outside`；>32 KiB → `too_large`；`TextDecoder('utf-8', { fatal: true })` 失败 → `decode_error`；去 BOM；已知秘密命中 → `secret_blocked`（不返回内容）。
- 宿主把 `containsSensitiveCheckpointData` 传入；`A9AgentLoop` 在 `runTurn` 开始时调用（可通过配置注入加载函数以便测试），把消息 `{ role: 'system', content: '<project_instructions …>' }`
  放在 System Prompt 之后：历史中已有同类消息则**原位替换**，没有则插入；`restoreConversationHistory` 与 `getConversationHistory` 导出时剔除该消息。
- `turn_started.data` 增加 `projectInstructions`（不含内容）；渲染端过程记录显示一行“已加载 AGENTS.md（N KB）”或原因。
- `system-prompt.ts`：版本升为 `a9-system-prompt-v3`；第 3 条改为“Project instructions from the workspace-root AGENTS.md when provided below.”，同步更新固定旧文本的测试断言。

### ③ 输入上下文预算

- 新建 `src/core/src/a9-context-budget.ts`：纯函数 `assembleWithinBudget(messages, { budgetChars, fixedPrefixCount })` 返回 `{ messages, stats }`，不修改入参。
  按“轮”分组（`user` 消息起到下一个 `user` 前）；保留固定前缀与当前轮，历史轮次从新到旧整轮加入；当前轮仍超限时，从最早的 `tool` 消息起把 `content` 换成占位文本，直到不超或只剩最后一个工具结果。
  字符数按 `content` 与 `tool_calls` 参数字符串长度累加。
- `A9AgentLoop` 在每次 `sendStreamRequest` 前调用，只影响本次请求，不改 `conversationHistory`；`turn_started.data.context` 记录首个请求的统计。
- 超长重试：Provider 错误满足下列任一条件时，以 `budgetChars/2` 重组后重试一次：HTTP 400/413 且错误文本含 `context_length_exceeded`、`maximum context length`、`too many tokens`、`prompt is too long`（不区分大小写）。
  重试仍失败 → `turn_failed`，`error` 为“对话过长，已尝试压缩仍超出模型上限”。
- 宿主：预算来自持久化 Provider 配置文档的选填字段 `contextBudgetChars`（整数，限定 16,000～1,000,000，超出或非法取默认 96,000 并记诊断）；
  `saveProviderConfig` 时沿用已有值，不因保存设置而丢失。不改设置界面与 IPC。诊断页现有 `contextWindow` 增加 `budgetChars`。

### ④ 环境事实

- 新建 `src/core/src/a9-environment-facts.ts`：`buildEnvironmentFacts({ platform, release, arch, shell: { kind, version, explicit }, pathDirs, exists })` 纯函数，返回 ≤1.5 KB 文本；
  宿主用 `os.platform()/os.release()/os.arch()`、既有 Shell 探测结果、`process.env.PATH` 与 `fs.existsSync` 提供输入（Windows 下检查 `git.exe/node.exe/python.exe/npm.cmd`）。
- `release` 以 `6.1.` 开头且平台为 `win32` 时写“Windows 7 SP1（NT 6.1）”并附 Win7 注意事项：系统无 `curl.exe`/`tar.exe`；路径超过 260 字符可能失败；中文路径注意编码；
  PowerShell 版本 < 3 时列出不可用的 `Invoke-WebRequest/ConvertFrom-Json/Get-FileHash` 等，版本 ≥ 5 不列；CMD 时提示使用 CMD 语法。其他系统只写实际探测值。
- `A9AgentLoop` 接收该文本并放在 System Prompt 之后、② 之前（同样原位替换、不入历史）；`buildA9SystemPrompt` 的 `targetOs` 默认值不再写死为 Win7，改由宿主传入实际值。

### ⑤ 历史加载与 O-2

- `a9-workbench.js` `chooseWorkspace`：`refreshSnapshot()` 之后，若 `state.activeConversationId` 存在且快照 `conversation` 非空，递增 `state.historyGeneration`、清空已加载事件，再 `await loadConversationEvents()`。
  加载期间 `state.eventsLoading=true`，对话流顶部显示 `role="status"` 的“正在加载过程记录…”，终态轮次在加载期间不显示 `.legacy-note`；加载结束后未加载轮次恢复现行 `.legacy-note` 文本与类名。
- 失败：沿用 `state.eventsError`，在顶部显示带“重试”按钮的 `role="alert"` 提示，按钮再次调用 `loadConversationEvents()`。
- 空对话不发请求，显示现有空状态。
- 改写 `a9-w39-m4-workspace-loading.test.ts`：`chooseWorkspace()` 后 `queryEvents` 调用 1 次、`inspectorEvents.size === 300`、顶部“加载更早记录”可用，且无需提交轮次；
  新增迟到响应丢弃、失败重试、空工作区用例；负向对照为删除该加载调用。
- **O-2**：`CheckpointManager.getTurnReview` 的 `unrecoverable` 项只增 `reasonCode`：从 checkpoint 已记录的不可恢复事实中取原因码（`too_large/outside/backup_failed/…`，基线跳过原因即 `skippedFact.reason`），
  取不到为 `undefined`。若现有持久化记录中没有可解析的原因码，只允许从已存 `reason` 文本中按 `（<code>）` 模式解析，**不改持久化格式**。
  渲染端优先按 `reasonCode` 映射（`too_large` → “超过备份上限（单文件 2 MiB），轮前未保存原内容”），无 `reasonCode` 时沿用现行映射；显示文本不再包含英文原因码。

## 3. 测试要求

- 各里程碑按任务书 R 编号写用例，测试名以编号开头（如 `R1-02 …`），便于验收方逐条对照。
- 核心与工作区单测放在 `src/core/tests/`、`src/workspace/tests/unit/`；界面测试沿用 `vm` + 假 DOM 方式加载真实 `a9-workbench.js`。
- ② ③ ④ 需要一条集成测试：用假 Provider 捕获请求，断言一次请求中的消息顺序为 System Prompt → 环境事实 → 项目说明 → 历史 → 当前轮，且连续三轮后各固定块仍只有一份。
- 回归：任务书 §5 第 1～3 项全部通过；负向对照按 §5 第 4 项执行后还原。

## 4. 交付与报告

本地提交后交回：各里程碑提交哈希；相对基线的改动文件清单（须全部在允许路径内）；① 的复现结论（H1～H4 各自复现与否、所用序列）；
各 R 用例对应测试名与结果；回归测试摘要；负向对照说明（改回什么、哪条测试失败）；未完成项与偏离。开发机结果不得写成 Win7 或真实 Electron 通过。

## 附录 A 裁决（2026-09-29，执行方首次停止报告）

本附录取代正文中对应条目；正文其余部分不变。

**A1 ⓪ 恢复根的创建入口（取代 §2 ⓪ 第 2 条）。** 正文所引 `checkpoint-manager.ts:296` 有误：该处只拼接撤销交换路径。恢复根实际由写入恢复区的多处
`fs.mkdirSync(..., { recursive: true })` 顺带创建（基线 `6acbb14` 上为第 219、273/275、346、385、432、755、846、874 行附近；第 443 行写工作区，不属此列）。裁决：**统一入口**。

- 新增私有方法 `ensureRecoveryDir(dir: string)`：先 `mkdirSync(this.recoveryRoot, { recursive: true })`，再调用 `ensureRecoveryIgnore()`（实例内以布尔标志只执行一次），最后 `mkdirSync(dir, { recursive: true })`；
- 上述每一处**目标位于恢复根内**的 `mkdirSync` 都改为调用 `ensureRecoveryDir`，不改其他逻辑；`mkdirSync(target)`（第 275 行这种非递归、依赖“已存在即失败”语义的调用）保留原调用，只在其前面加 `ensureRecoveryDir(path.dirname(target))`；
- 新增测试：以源码文本检查 `checkpoint-manager.ts` 中除 `ensureRecoveryDir` 内部与写工作区的那一处外，不再有直接 `mkdirSync` 指向恢复区路径（按变量名 `recoveryRoot/blobsRoot/snapshotsRoot/manifestsRoot/swapRoot` 等判断，允许清单写在测试里）；
- `A9WorkspaceService` 构造时的补写不变（只在恢复根已存在时调用 `ensureRecoveryIgnore`）；
- 负向对照增加一项：让 `ensureRecoveryDir` 不调用 `ensureRecoveryIgnore`，R0-01 失败。

**A2 ① 首个测试提交（取代 §2 ① 第 1 步）。** 任务书 R1-01 的“先红后绿”优先于正文“断言当前行为”。裁决：

- 首个提交按**目标行为**写 H1～H4 用例，对当前代码会失败的用例用 Jest 29 的 `it.failing(...)` 标注，使套件保持通过，同时每个 `it.failing` 本身证明缺陷在现状下存在；
- 某条假设在现状下不失败（即未复现）时，改为普通 `it` 断言现状并在测试名中加“未复现”，报告中写明序列，不修；
- 修复提交把对应的 `it.failing` 改为 `it`，不得改动断言内容；验收方以两次提交之间断言文本不变、标注由 `failing` 变为普通为“先红后绿”的证据。

**A3 ⓪ 已存在的 `.gitignore`（取代 §2 ⓪ 第 1 条中“不读取、不比较”）。** 任务书 Q1（已存在时不改写，内容不是 `*` 时在诊断页提示）优先。裁决：允许只读检查，仍不改写。

- `ensureRecoveryIgnore()` 对已存在的路径先 `lstat`：不是普通文件（目录、符号链接、联接点等）→ 不读取、不跟随，记诊断 `A9_RECOVERY_GITIGNORE_CUSTOM`；
- 普通文件且 ≤4 KiB：按 UTF-8 读取，去 BOM、CRLF 归一，忽略空行与 `#` 注释行；**存在一行恰为 `*` 且没有以 `!` 开头的行**即视为有效，不提示；否则记 `A9_RECOVERY_GITIGNORE_CUSTOM`；
- 大于 4 KiB 按 `A9_RECOVERY_GITIGNORE_CUSTOM` 处理；读取失败记 `A9_RECOVERY_GITIGNORE_UNVERIFIED`；
- 以上诊断均不阻断、不含文件内容与绝对路径，与 `A9_RECOVERY_GITIGNORE_WRITE_FAILED` 走同一诊断通道；检查与写入一样每实例只执行一次；
- 测试覆盖：恰为 `*`、`*` 加注释与 CRLF、`*` 加 `!keep.txt`、其他内容、空文件、目录、符号链接、超过 4 KiB，各自是否提示且文件字节不变。

**A4 ⑤ 加载期间的 `.legacy-note`（取代 §2 ⑤ 第 1 条中“终态轮次在加载期间不显示 `.legacy-note`”；验收方自查发现，预先裁决）。** 任务书 §4 兼容约束优先：
`a9-06-driver-entry.cjs:1383-1386` 以 `.legacy-note` 消失判断“该轮已加载”，加载期间提前移除会造成误判。裁决：加载期间未加载轮次的 `.legacy-note` 元素、类名与文本**保持不变**，
只在对话流顶部增加“正在加载过程记录…”提示；事件真正进入已加载历史后才按现行逻辑移除。Demo 中加载期间的骨架占位不实现。补一条测试：加载请求未返回时 `.legacy-note` 仍在。

**A5 ① 变更类命令的作用与三个既有 Shell 测试（执行方第三次停止报告，`9d30719`）。**

- **A5-1 实现纠正（取代 `fa564d0` 中“变更类命令即置 `mutations=true`”）。** 任务书 ① 只规定变更类命令**清除**验证证据，没有规定它本身构成副作用。
  变更类命令只执行 `verifiedAfterMutation=false` 与清空 `verificationEvidence`，**不**设置 `turnStats.mutations`。副作用仍只来自三处：Full Access 文件写工具、相对上次收集的新外部变化、
  `classifyGitCommand(command).mutatesWorktree`（恢复原有 Git 规则，只读调用 `git-command-policy.ts`）。
  `a9-lifecycle.test.ts` 中“persists a managed background process…”与“restores completed conversation facts after restart…”**不得修改**，改正实现后须原样通过（该轮只启动后台进程、未改文件，应为 `completed`）。
  新增 Core 用例：只执行变更类命令且无文件变化 → `completed` / `not_applicable`；变更类命令产生文件 → 经外部变化记为 `unverified`；改工作树的 Git 命令无外部变化时仍计副作用。
- **A5-2 `a9-product-contract.test.ts`“full fixture round”（特许例外）。** 原输入 `node -e "console.log('verified')"` 在新规则下实为输出类命令，记 `unverified` 是正确结果；该用例的本意是端到端覆盖“修复后验证”的路径。
  允许只改**输入**：轮次开始前在工作区写入 `check.js`（内容 `console.log('verified')`），夹具命令改为 `node check.js`；**全部断言不改**（仍为 `completed`/`verified`）。
  同时新增一条宿主用例固定旧输入的新语义：`edit` 后执行 `node -e "console.log('verified')"` → `completed_with_warnings` / `unverified`，且 `verificationEvidence` 不存在。
- 除上述之外，§4“既有测试只允许因文案变更更新断言”不变。

**A6 打包测试 K-02、K-05（执行方第四次停止报告，`90c9796`）。** 验收方核实：基线 `36c08ba` 上 `a9-package.test.mjs` 101/101 通过；在 `90c9796` 上全量运行只有 K-02 失败，K-05 单独连跑 5 次与全量运行均通过。

- **A6-1 K-02 根因在渲染端（改实现，白名单内）。** 回放数据来自旧后端，没有 `reasonCode`，`reason` 为“轮前基线未覆盖（too_large），无法恢复原内容”；现实现去掉 `（too_large）` 后落到“缺少原始内容”，
  既不含“超过备份上限”也不含 `too_large`，旧 checkpoint 在真实使用中也会得到这种退化的文案。裁决（取代 §2 ⑤ O-2 中“无 `reasonCode` 时沿用现行映射”）：
  渲染端在没有可用 `reasonCode` 时，先从 `reason` 文本按 `（<code>）` 解析原因码，解析到已知原因码即按原因码映射；解析不到才沿用按 `kind` 的现行映射。
  补一条界面测试：无 `reasonCode`、`reason` 含 `（too_large）` 时显示“超过备份上限”且不含 `too_large`。
- **A6-2 K-02 负向对照特许更新（白名单外，仅此一处）。** `scripts/release/test/a9-package.test.mjs` 的 K-02 中，
  `assert.equal(h.a925UnrecoverableTextMatches(rendered.replaceAll('too_large', 'missing'), 'big.bin'), false);` 一行改为两行：
  `assert.ok(!rendered.includes('too_large'));` 与 `assert.equal(h.a925UnrecoverableTextMatches(rendered.replaceAll('超过备份上限', '缺少原始内容'), 'big.bin'), false);`。
  原负向对照依赖界面露出英文原因码，与 O-2 的目标相反；新对照仍证明判据依赖原因文字。该文件其余内容、`a9-06-driver-entry.cjs` 及全部冻结驱动**不得修改**。
  验收方已在临时副本中试验 A6-1 与 A6-2：K-02、K-05 均通过（该副本缺各包 `dist`，其余构建类用例不作数）。
- **A6-3 K-05 不授权任何修改。** 该用例只读取驱动源码与静态预演数据，不涉及产品代码，验收方无法复现。若执行方再次观察到失败，交回精确命令、工作目录、`git status`、完整输出以及
  驱动文件的换行形式（`file src/shell/tests/product/a9-06-driver-entry.cjs`），不得修改驱动或测试。

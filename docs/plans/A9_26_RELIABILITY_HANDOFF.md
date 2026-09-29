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

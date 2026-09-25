# A9-21 M2 交接书：模型输出端到端上限

> 执行方：外部执行 Agent。验收方：发出本交接书的会话。执行方只交代码、测试和事实报告，不自行宣布验收通过。
> 授权依据：[A9-21](../tasks/A9_21_A9_18_SALVAGE_PORT.md) §2 M2、ADR-0138；需求细化见本文 §3，已同步写入任务书。

## 1. 背景

A9 运行时通过 `OpenAICompatibleProvider`（`a9-agent-runtime.js:527`）以流式 SSE 调用模型，不传 `max_tokens`。
Gateway 与 Core 目前对单次响应、工具参数和单个 Turn 的输出都没有上限：异常或恶意的模型端点可以让内容、工具参数、
SSE 行缓冲和运行时累积文本无限增长。

A9-18 工作树（`/Users/qlyf/Developer/win7-coding-agent-memory-optimization`，未提交，基线 `7d06789`）有一版实现，
**只作参考，不得整文件复制或 cherry-pick**（基线已分叉，且 Core 文件在主线已被 A9-20 修改）。参考位置：
`src/gateway/src/provider/openai-compatible.ts`、`sse-parser.ts`、`src/gateway/src/types/index.ts`、`src/core/src/a9-agent-loop.ts`，
测试见 `src/gateway/tests/openai-compatible-contract.test.ts` 的 `A9-18: streaming output and tool call limits (P0-4)`
与 `src/core/tests/a9-agent-loop.test.ts` 中 `BUDGET_EXCEEDED`/`truncated` 相关用例。该实现有已知缺陷，见 §4。

## 2. 基线、分支与允许路径

- 基线：`codex/a9-alpha2` @ `7ba5ec1`（已含 M1b 合并；2026-09-25 修订，原为 `25c89d3` 或其后只含文档改动的提交），
  或其后只含文档改动的提交；报告中写明实际基线。M1b 只改运行时脱敏函数，与本任务文件不重叠。在新分支 `codex/a9-21-m2` 上工作
  （可用 git worktree），完成后本地提交，**不推送、不合并**。
- 工作树可用符号链接复用主工作区的 `node_modules`，但**各包 `dist` 必须在本工作树内独立构建**，不得链接主工作区的 `dist`：
  本任务要 `tsc` 构建 gateway/core，共享 `dist` 会把未验收代码写进主工作区。
- 允许修改的文件，仅限：
  - `src/gateway/src/provider/openai-compatible.ts`
  - `src/gateway/src/provider/sse-parser.ts`
  - `src/gateway/src/types/index.ts`
  - `src/core/src/a9-agent-loop.ts`（只改输出预算与截断处理；不得改动 A9-20 的验证记账与 Git 分类调用）
  - `src/gateway/tests/**`、`src/core/tests/a9-agent-loop.test.ts`
- 不得修改：`deepseek-openai.ts`（只被 `desktop-host.js` 使用，不在 A9 路径上）、运行时、渲染端、State、IPC、发布脚本、文档。
- 不新增依赖；上限数值为代码常量，不做成配置项。

## 3. 实现要求

### Gateway（`OpenAICompatibleProvider.sendStreamRequest` 与 `sse-parser.ts`）

- **G-1 单响应内容上限 1 MiB（UTF-8 字节）**：用**增量**计数器记录已保留字节；不得在每个 chunk 上重新计算整段累积内容的字节数
  （A9-18 的写法，1 MiB 小 chunk 时是二次复杂度）。超限时按 UTF-8 字符边界截断，不产生 U+FFFD；之后不再保留内容，只累计被拒字节下界。
- **G-2 截断粘性**：一旦截断，`finishReason` 固定为 `LENGTH`，后续 `stop`/`tool_calls` 帧不得覆盖；响应带
  `truncated: true` 与 `truncation: { reason, retainedBytes, limitBytes, droppedAtLeastBytes }`，`reason` 取
  `'response_content_limit' | 'tool_call_limit'`。`droppedAtLeastBytes` 是下界，不得写成精确总量。
- **G-3 截断后停止接收**：命中内容上限后立即以截断结果结算并中止 HTTP 请求。结算必须幂等，且先于连接销毁落定，
  不能被销毁触发的 `STREAM_INTERRUPTED` 覆盖。经 `onChunk` 发出的内容总和不得超过保留内容。
- **G-4 工具调用累积上限**：单个调用参数 512 KiB、函数名 4 KiB、调用槽位 64 个。参数或函数名超限的调用标记
  `truncated: true`；槽位溢出时整个响应按 `tool_call_limit` 截断。**被截断的响应不携带任何 `toolCalls`**。
- **G-5 SSE 行缓冲上限**：`SseParser` 中尚未遇到换行的待处理数据超过 2 MiB 时，以现有 `GatewayError` 结构化失败
  （可用 `ErrorCode.INVALID_FRAME`，消息说明单行超限），不得静默丢弃或无限增长。换行查找只扫描新到达的数据，
  不得每次 `feed` 都对整个缓冲区重新 `split`（长行分片到达时同样是二次复杂度）。
- **G-6 畸形事件样本**：`malformedEvents` 最多保留 20 条样本，另计总数；现有错误消息中的计数改用总数。

### Core（`A9AgentLoop`）

- **C-1 单 Turn 输出预算 2 MiB**：按响应逐次**累加**（不是取最大值）：经 `onChunk` 到达的内容字节 + 未以 chunk 到达的内容字节
  + 该响应全部工具参数字节，每字节只计一次。预算在审批挂起与恢复之间保持，只在新 Turn 开始时清零。超出时发出 `turn_failed`，
  以 `TurnOutcome.BUDGET_EXCEEDED` 结束，不执行该响应的工具调用。
- **C-2 截断响应**：`response.truncated === true` 时，不执行该响应中的任何工具调用；发出一条 `model_note`，
  `data.content` 为给用户看的中文说明（渲染端只显示 `data.content`，例如“模型输出超过 1 MiB 已被截断，本轮未执行其中的工具调用。”），
  另附 `truncated`、`reason`、`limitBytes`、`retainedBytes`、`droppedAtLeastBytes` 结构化字段。
- **C-3 单个截断的工具调用**：`toolCall.truncated === true` 的调用不执行，向对话历史追加一条说明参数被截断、无法执行的工具结果。
- **C-4 诚实结果**：本轮出现过截断时，`turn_completed` 带 `outputTruncated: true`，结果不得是 `COMPLETED`，改为
  `COMPLETED_WITH_WARNINGS`（已是更差结果时保持不变）。
- **C-5 类型**：Gateway `ModelResponse`/`ToolCall` 与 Core 模型端口类型同步新增可选字段；旧调用方不受影响。

### 不移植

A9-18 的 `usage.totalTokensDerived`、SQLite/渲染端的截断标记、loop 层超长 shell 守卫（已由 A9-20 G06 在策略层实现）都不在本范围。

## 4. A9-18 实现的已知问题（移植时必须避开）

1. 每个 chunk 调用 `Buffer.byteLength(accumulatedContent)`：二次复杂度（对应 G-1）。
2. `SseParser` 缓冲与重复 `split` 未处理（对应 G-5）。
3. 截断的 `model_note` 没有 `content` 字段，渲染端会显示空行（对应 C-2）。
4. 截断轮次仍可能以 `COMPLETED` 结束（对应 C-4）。
5. 在 A9-18 移植试验中，gateway 测试 10 次运行里出现过 1 次失败，未捕获用例名；本次交付前须连续运行 gateway 全量 20 次，
   如有失败必须定位原因并在报告中说明，不得以重跑掩盖。

## 5. 测试要求

Gateway（真实回环 SSE，沿用 `openai-compatible-contract.test.ts` 的服务端夹具）：
1. 700 KiB + 700 KiB 内容后再发 `finish_reason: "stop"` 与 `[DONE]`：内容恰为 1 MiB，`finishReason` 为 `length`，`truncated` 与 `truncation` 字段正确。
2. 截断后到达 `tool_calls` 帧：响应无 `toolCalls`，截断不被清除。
3. 多字节字符跨越上限：保留部分是原文的精确字符前缀，无 U+FFFD。
4. 命中上限后服务端继续发送：客户端在上限后停止读取（例如服务端观察到连接关闭或写入失败），结果不是 `STREAM_INTERRUPTED`。
5. 1 MiB 内容以 16 字节小 chunk 到达：总耗时显著低于二次复杂度（以 2 s 为上限断言，并在报告中给出实测值）。
6. 工具参数 512 KiB、函数名 4 KiB、第 65 个槽位三类超限。
7. 单行无换行持续发送超过 2 MiB：得到结构化错误；长行分片到达时耗时线性。
8. 超过 20 条畸形事件：样本数为 20，计数为真实总数。

Core：
9. 跨多个响应累计的工具参数超过 2 MiB：`BUDGET_EXCEEDED`，超限响应的工具未执行（覆盖“取最大值”这一旧错误）。
10. 审批挂起后恢复：预算不清零，恢复后继续累计能触发上限。
11. 截断响应中的工具调用不执行；发出带 `content` 的 `model_note`；结果为 `COMPLETED_WITH_WARNINGS` 且带 `outputTruncated`。
12. 单个 `truncated` 工具调用不执行，历史中有对应说明。
13. A9-20 的现有用例（验证记账、Git 确认）全部继续通过。

负向对照：把新测试放在 `25c89d3` 的代码上运行，记录失败清单（可为缺失的新导出补等价旧行为的桩）。
如用进程级超时终止卡住的用例，必须终止整个进程组（不能只杀 `npx` 包装进程），并在报告前确认没有遗留 jest/node 进程：
遗留进程占满 CPU 会使其他时序敏感用例（如 `a9-lifecycle.test.ts` 的后台写文件用例）失败。

## 6. 验证命令（Node 20.17）

```bash
cd src/gateway && npx tsc --noEmit && npx tsc && npx jest
```

```bash
cd src/gateway && for i in $(seq 1 20); do npx jest --silent 2>&1 | grep -E '^Tests:'; done
```

```bash
cd src/core && npx tsc --noEmit && npx tsc && npx jest
```

```bash
cd src/shell && npx jest --runInBand
```

```bash
npm run verify:quick
```

```bash
git diff --check
```

Shell 全量用于确认运行时与新 Gateway/Core 构建的集成未回归，须在 gateway、core 都 `tsc` 构建之后运行。

## 7. 交付

- 分支 `codex/a9-21-m2` 上的提交哈希，提交信息说明各上限、截断语义与避开的 A9-18 缺陷。
- 事实报告：改动文件清单；§3 每条要求对应的实现位置与测试名；各包测试输出摘要；gateway 连续 20 次运行结果；
  §5.5 与 §5.7 的实测耗时；负向对照失败清单；偏离本交接书之处及原因；未完成项。
- 不写“验收通过”“已修复”等结论性措辞。

## 8. 验收方将检查

1. 改动只在 §2 允许路径内；`a9-agent-loop.ts` 中 A9-20 的代码未被改动。
2. 逐条核对 §3 要求，并在验收方环境复跑 §5 的关键用例与性能用例。
3. 注入旧写法（每 chunk 重算整段字节、预算取最大值、截断后仍携带工具调用）应使对应测试失败。
4. 各包全量测试、gateway 20 次运行、负向对照结果与报告一致。

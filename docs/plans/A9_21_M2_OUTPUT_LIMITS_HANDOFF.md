# A9-21 M2 交接书：模型输出端到端上限

> 执行方：外部执行 Agent。验收方：发出本交接书的会话。执行方只交代码、测试和事实报告，不自行宣布验收通过。
> 授权依据：[A9-21](../tasks/A9_21_A9_18_SALVAGE_PORT.md) §2 M2、ADR-0138；需求细化见本文 §3，已同步写入任务书。
>
> **第 2 版（2026-09-25）**：第一轮交付 `e118f2b` 验收不通过。§1～§8 保持不变并继续有效，返工要求、测试与验收项见 §9，
> 与 §1～§8 冲突时以 §9 为准。
> **第 3 版（2026-09-25）**：第二轮交付 `df0405a` 有条件通过，剩余两项测试条件见 §10（只改测试）。

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

## 9. 第一轮验收结论与返工要求

### 9.1 第一轮结论（`e118f2b`，基线 `87ca18f`，不通过）

范围、构建、各包全量测试（gateway 255、core 367、shell 423）、gateway 连续 20 次、G-1～G-4、G-6、C-1、C-3、C-5 均符合；
注入“截断仍带 toolCalls / 每 chunk 重算 / note 无 content / 预算取最大值”均被测试抓住。四项偏离（用例 5 载荷 1 MiB+64、
负向对照未用进程级超时、单项截断调用保留在 `toolCalls` 中、`dist` 本树构建）均接受。阻断与其余问题：

- **B1 G-5 仍是二次复杂度**：`drain` 找不到换行时不推进 `scanFrom`，每次 `feed` 从头重扫待处理行。16 字节分片实测
  256 KiB 3.9 s、512 KiB 16 s、1 MiB 63 s；到 2 MiB 触发结构化错误前需数分钟。仅把 `scanFrom` 推到末尾仍不够：
  `buffer +=` 后按下标读字符会让 V8 每次展平整个字符串，验收方实测 0.5/1/2 MiB 为 0.8/2.9/10.6 s。用例 7 用 64 KiB 分片且只断言绝对耗时，测不出。
- **B2 截断后历史协议失效**：C-2 分支向历史追加 `{role:'tool', toolCallId:'truncation-notice'}`，其前一条 assistant 消息没有
  `tool_calls`；历史跨 Turn 保留，之后每轮请求都带着这条孤立 tool 消息，严格的 OpenAI 兼容服务返回 400（见 `openai-compatible.ts`
  `buildOpenAIMessages` 注释）。验收方已用真实 `A9AgentLoop` 与 `buildOpenAIMessages` 复现。
- **N1** `tool_call_limit` 时 `truncation.limitBytes` 填了槽位数 64；`model_note` 在该原因下仍写“超过 1 MiB”。
- **N2** G-5 按 JS 字符数计，交接书要求 2 MiB（UTF-8 字节），报告未声明。
- **N3** 缺少“单项截断调用 + 后续最终回答”的结果断言：关闭 C-4 降级后 core 全部测试仍通过。
- **N4** 删除了 `sse-parser.ts`、`openai-compatible.ts` 中与本任务无关的既有注释（AGENTS.md §6）。
- **N5** 未声明的行为变化：`content: ""` 的事件不再触发 `onChunk`（基线会）；单独的 `\r` 被当作行结束（基线 `split(/\r?\n/)` 不会）。
- **N6** `droppedAtLeastBytes += 0;` 死代码。
- **风险 R**：单项截断调用的参数（最长 512 KiB 的不完整 JSON）原样留在历史 `tool_calls` 中，此后每轮请求重发。

### 9.2 返工要求

在 `codex/a9-21-m2` 上、`e118f2b` 之后追加提交，不改写已有提交；基线仍为 `87ca18f`；允许路径与 §2 相同。**不推送、不合并。**

- **R-1（B1、N2、N5 换行）**：`SseParser` 的待处理数据改为分段保存（例如字符串数组 + 已累计长度），每次只在**新到达的文本**上用
  `indexOf('\n')` 查找换行；找到时才把分段拼成一行，并去掉行尾一个 `\r`。行切分语义必须与基线 `split(/\r?\n/)` 一致
  （`\n` 与 `\r\n` 结束一行，单独 `\r` 留在行内），`final` 时残余数据照旧作为最后一行。待处理上限按 **UTF-8 字节**增量计数
  （每段只算一次），超过 2 MiB 时照旧以 `GatewayError`（`INVALID_FRAME`）失败。验收方已验证该做法：16 字节分片 1/2/4 MiB 为 7/9/19 ms，
  5 万条随机分片与 `split(/\r?\n/)` 0 差异。
- **R-2（B2）**：截断响应只向历史追加**一条** assistant 消息（`content` 为保留内容，可在末尾附截断说明），不得追加 `role: 'tool'`
  消息或第二条 assistant 消息。`model_note`、`turn_completed` 与结果字段保持第一轮做法。
- **R-3（风险 R）**：写入历史的 assistant `toolCalls` 中，`truncated === true` 的调用保留 `id` 与 `name`，`arguments` 改为 `'{}'`；
  对应的 tool 说明消息照旧追加，保证调用与结果一一对应。
- **R-4（N1）**：`tool_call_limit` 时 `limitBytes` 取单响应内容上限 1 MiB（与 `retainedBytes` 同为内容字节口径），另加可选字段
  `limitSlots: 64`（Gateway `TruncationInfo` 与 Core 端口类型同步，均为可选）。`model_note.data.content` 按原因区分：
  `response_content_limit` 为“模型输出超过 1 MiB 已被截断，本轮未执行其中的工具调用。”；`tool_call_limit` 为
  “模型单次响应的工具调用超过 64 个，响应已被截断，本轮未执行其中的工具调用。”
- **R-5（N5 onChunk）**：恢复基线行为：`event.content !== null`（含空字符串）即触发 `onChunk`；空串计 0 字节。
- **R-6（N4、N6）**：逐字恢复被删的既有注释；删除死代码。其余与返工无关的行不做改动。

### 9.3 补充测试

1. **G-5 线性**：用 16 字节分片分别送入约 0.5 MiB 与 2 MiB 的待处理数据后再送换行，断言 2 MiB 用时不超过 0.5 MiB 用时的 8 倍
   （线性约 4 倍，二次约 16 倍；两者都很小时以 50 ms 为下限）；16 字节分片持续送入直到触发 2 MiB 错误，1 s 内完成。报告两组实测毫秒。
2. **G-5 字节口径**：3 字节中文字符组成、约 70 万字符（约 2.1 MB）且无换行的数据触发错误；约 60 万字符（约 1.8 MB）不触发。
3. **行切分等价**：固定种子（不得用 `Math.random`）生成不少于 1 万条含 `\r`、`\n`、`\r\n` 的文本并随机切片送入，
   得到的行与基线 `split(/\r?\n/)` 一致。
4. **历史协议**：用一个校验函数检查送往模型的消息（经 `buildOpenAIMessages` 转换后），要求每条 tool 消息的 `tool_call_id` 都出现在
   紧邻的前一条带 `tool_calls` 的 assistant 消息中。覆盖三种情形：内容截断后的下一轮、槽位溢出截断后的下一轮、单项截断调用
   之后的下一次请求；后者还要断言历史中该调用的 `arguments` 为 `'{}'`。
5. **C-4**：响应一含单项截断调用，响应二为最终文本：结果为 `COMPLETED_WITH_WARNINGS` 且 `outputTruncated: true`。
6. **R-4 / R-5**：`tool_call_limit` 的 `limitBytes`、`limitSlots` 与 note 文案；`content: ""` 事件触发 `onChunk`。

负向对照：新增测试放在 `e118f2b` 上运行，记录失败清单（预期 1、2、4、5、6 失败，3 中单独 `\r` 相关用例失败）；
进程级超时须终止整个进程组，报告前确认无遗留 jest/node 进程。

### 9.4 验证与交付

- 验证命令同 §6（gateway 连续 20 次仍需执行）。
- 事实报告在 §7 基础上增加：R-1～R-6 的实现位置与测试名；§9.3 第 1 项两组毫秒数；相对 `87ca18f` 与相对 `e118f2b` 的改动文件清单。

### 9.5 验收方将检查

1. 相对 `87ca18f` 只有 §2 允许路径；相对 `e118f2b` 的差异只涉及 R-1～R-6。
2. 验收方以 16 字节分片测 1/2/4 MiB 待处理数据，耗时随长度线性；中文字节口径正确。
3. 截断（内容、槽位）与单项截断之后的下一轮请求没有孤立 tool 消息；关闭 C-4 降级、恢复孤立 tool 消息、恢复字符口径的注入都会使测试失败。
4. §8 原有各项继续成立。

## 10. 第二轮验收结论与通过条件

### 10.1 第二轮结论（`df0405a`，有条件通过）

B1、B2 已关闭：16 字节分片 0.5/1/2 MiB 待处理为 6/9/16 ms；中文字节口径正确；3 万条随机分片流与 `87ca18f` 的解析器输出一致
（仅少了流末多余的 `ignore` 结果，唯一调用方本就跳过）；内容截断、槽位溢出、单项截断、预算超限之后的下一轮请求均无孤立 tool 消息。
R-1～R-6 符合；gateway 266、core 368、shell 423 项通过，gateway 连续 20 次通过。偏离 ②③④ 接受，偏离 ① 需按 C1 补证据。

未满足 §9.5.3 的两处测试缺陷：

- **C1**：§9.3.5 用例的第一次响应含一个执行成功的 `write`，A9-20 的“修改后未验证”规则本身就会得出 `COMPLETED_WITH_WARNINGS`，
  因此关闭 C-4 降级（`if (this.outputTruncated && outcome === TurnOutcome.COMPLETED)` 不生效）后 core 测试仍全部通过。
  实现本身正确：无成功 `write` 时 `df0405a` 得 `completed_with_warnings`，关闭降级后得 `completed`。
- **C2**：§9.3.4 的历史协议用例在 gateway 测试中 `require('../../core/dist/index.js')`。按 §6 顺序（先 gateway 测试后 core 构建），
  全新检出时整套因找不到模块失败；core 有旧 `dist` 时则测的是旧代码，可能假通过。

### 10.2 通过条件（只改测试）

在 `codex/a9-21-m2` 上、`df0405a` 之后追加提交；只允许修改 `src/core/tests/a9-agent-loop.test.ts` 与
`src/gateway/tests/a9-21-output-limits.test.ts`，产品代码不改。**不推送、不合并。**

- **C1**：§9.3.5 用例去掉会修改文件的成功调用（改为 `read` 等只读调用，或只保留截断调用），使结果只能由 C-4 降级得出。
- **C2**：把 §9.3.4 的三个用例移入 `src/core/tests/a9-agent-loop.test.ts`，直接校验 Core 送往模型的消息：每条 `role: 'tool'` 消息的
  `toolCallId` 都出现在紧邻的前一条带 `toolCalls` 的 assistant 消息中；单项截断情形同时断言历史中该调用的 `arguments` 为 `'{}'`。
  Core 历史与 `buildOpenAIMessages` 输出一一对应，校验等价。gateway 测试中删除对 core 的引用及这三个用例，其余用例不动。
- 可一并修正（非条件）：`types/index.ts` 中说明 `limitBytes` 的注释移到 `limitBytes` 上；`ToolCallAccumulator` 文档注释补回
  “顺序执行也不丢失与 assistant 消息的对应”。如修正，只允许在 `src/gateway/src/types/index.ts`、`src/gateway/src/provider/sse-parser.ts`
  中改这两处注释。

### 10.3 证明与交付

1. 注入对照（在临时副本中）：关闭 C-4 降级 → C1 用例失败；恢复孤立 tool 消息、恢复截断调用原参数 → core 中对应用例失败。
   记录每项失败的用例名。
2. 全新副本（`git archive` 导出、不带任何 `dist`）按 §6 顺序运行：gateway 测试不再因缺少 core 构建而失败。
3. §6 全部验证命令，含 gateway 连续 20 次。
4. 报告：新提交哈希；相对 `df0405a` 的改动文件清单；上述三项结果；各包套数/项数/失败项。

### 10.4 验收方将检查

相对 `df0405a` 只改 §10.2 允许的文件；验收方自行复做 10.3 第 1、2 项；§8、§9.5 其余各项继续成立。

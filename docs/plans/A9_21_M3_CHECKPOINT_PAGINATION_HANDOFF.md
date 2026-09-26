# A9-21 M3 交接书：checkpoint 列表分页

> 执行方：外部执行 Agent。验收方：发出本交接书的会话。执行方只交代码、测试和事实报告，不自行宣布验收通过。
> 授权依据：[A9-21](../tasks/A9_21_A9_18_SALVAGE_PORT.md) §2 M3、ADR-0138；界面方案经负责人 2026-09-26 按演示
> （`outputs/a9-21-m3m4-demo/`，非验收证据）确认。
>
> **第 2 版（2026-09-26）**：第一轮交付 `106e650` 有条件通过，剩一项测试条件见 §9（只改测试）。

## 1. 背景

运行时每次生成快照（渲染端约 500 ms 轮询一次）都调用 `persistence.listCheckpoints(a9SessionId)`，把当前会话的全部 checkpoint
带给渲染端（`a9-agent-runtime.js:2055`）；该查询没有 `LIMIT`，只按 `created_at` 排序，同一时刻的记录顺序不稳定
（`a9-persistence.ts:959-962`）。界面只显示最近 10 条，更早的 checkpoint 无法查看 Diff 或撤销。`a9.checkpoint.list` 通道已存在，
但它直接返回整个快照的 `checkpoints`，也不校验请求参数（`a9-product-ipc.js:155-156`；`preload.js:70` 不传参数）。

A9-18 工作树（`/Users/qlyf/Developer/win7-coding-agent-memory-optimization`）有一版实现，只作参考，不得整文件复制或 cherry-pick。
它的 IPC 用扁平的 `beforeCreatedAt`/`beforeTurnId` 两个字段，曾出现游标在层间丢失、第二页静默退回第一页的缺陷（台账 R12）；
本任务改用单个 `before` 对象，并要求用真实 IPC 证明第二页不同于第一页。

## 2. 基线、分支与允许路径

- 基线：`codex/a9-alpha2` 上本交接书所在提交，或其后只含文档改动的提交；报告中写明实际基线。在新分支 `codex/a9-21-m3` 上工作
  （用 git worktree），完成后本地提交，**不推送、不合并**。
- 工作树可用符号链接复用主工作区的 `node_modules`；各包 `dist` 必须在本工作树内用 `tsc` 构建，不得链接主工作区的 `dist`。
- 允许修改的文件，仅限：
  - `src/state/src/a9-persistence.ts`
  - `src/shell/product/a9-agent-runtime.js`
  - `src/shell/product/a9-product-ipc.js`
  - `src/shell/product/preload.js`
  - `src/shell/product/renderer/a9-workbench.js`
  - `src/shell/product/renderer/workbench.html`（预计不需要；如改动须说明理由）
  - 测试：`src/state/tests/**`、`src/shell/tests/product/**`
- 不得修改：`a9-agent-panel.js`（旧面板，只在冒烟模式加载，已知局限见任务书 §8）、`main.js`、CSS、其他包、文档、`package.json`、锁文件。
- 不改 SQLite schema（保持 v4，不新增表或索引），不新增依赖、IPC 通道或 Chromium 开关。

## 3. 实现要求

### 状态层（`a9-persistence.ts`）

- **S-1 稳定顺序**：所有 checkpoint 列表查询按 `(created_at, turn_id)` 排序，同一 `created_at` 时以 `turn_id` 决定先后。
- **S-2 最近 N 条与总数**：提供按会话取最近 N 条（结果按旧→新排列，与现有快照顺序一致）与总数（`COUNT(*)`）的查询；
  不得先取全部再在 JS 里截取。
- **S-3 游标分页**：提供游标查询：`before = { createdAt, turnId }` 时只返回严格早于该游标的记录，即
  `created_at < ? OR (created_at = ? AND turn_id < ?)`；按新→旧取 `limit` 条，返回时再按旧→新排列，并给出 `hasMore`、
  `nextBefore`（本页最旧一条的 `{ createdAt, turnId }`，没有更多时为 `null`）与 `total`。
- **S-4 保留旧接口**：现有 `listCheckpoints(sessionId)` 的签名与“返回全部、旧→新”的行为保持不变，供不带分页参数的旧调用使用。

### 运行时（`a9-agent-runtime.js`）

- **R-1 快照瘦身**：快照的 `checkpoints` 改为当前会话最近 50 条（旧→新），另加 `checkpointsTotal`（整数）。其余快照字段不变。
- **R-2 分页方法**：新增 `listCheckpoints(input)`，只查当前会话（`a9SessionId`）：
  - `input.conversationId` 可选；给出且不等于当前会话时以 `A9_CHECKPOINT_CONVERSATION_MISMATCH` 拒绝（与 `queryEvents` 的做法一致）；
  - 不带 `before` 与 `limit` 时保持旧行为：返回全部 checkpoint（旧→新），同时附 `total`；
  - 带 `limit` 或 `before` 时走 S-3，`limit` 缺省 20；
  - 返回 `{ ok: true, conversationId, checkpoints, total, hasMore, nextBefore }`（旧行为下 `hasMore: false`、`nextBefore: null`）。
- **R-3 降级运行时**：`ELECTRON_SQLITE_UNAVAILABLE` 与 `A9_DIAGNOSTICS_MODE` 两个降级运行时对象同样提供 `listCheckpoints`，返回各自的结构化错误，
  与同文件其他方法一致。

### IPC 与预加载

- **I-1 请求校验**（`a9-product-ipc.js`）：`a9.checkpoint.list` 用 `exactObject(payload, [], 'A9_PAYLOAD_INVALID', ['conversationId', 'before', 'limit'])`；
  `conversationId` 给出时须为非空字符串；`before` 给出时须为只含 `createdAt`、`turnId` 两个键的对象，两者都是非空字符串
  （缺一个、多键、空串、非字符串一律 `A9_PAYLOAD_INVALID`）；`limit` 给出时须为 1～100 的安全整数。校验通过后调用 `runtime.listCheckpoints(payload)`，
  不再返回 `runtime.getSnapshot().checkpoints`。IPC schema 版本号不变（新增均为可选字段）。
- **P-1 预加载**（`preload.js`）：`listCheckpoints: (options) => a9Request('a9.checkpoint.list', options || {})`，不做字段改名或拆分，
  原样透传 `before` 对象。

### 渲染端（`a9-workbench.js`，按已确认的演示实现）

- **W-1 首屏与计数**：首屏显示最近 10 条（新→旧）。计数：还有未显示的记录时为 `最近 X / 共 Y`，全部显示时为 `共 Y`；`Y` 取
  `snapshot.checkpointsTotal`，字段缺失时退回为已知列表长度。
- **W-2 加载更早**：列表末尾（所有 checkpoint 行之后）放一个按钮 `加载更早的 N 条（还有 M 条）`，每次加 20 条：先用快照中已有但未显示的，
  用完后以当前已知最旧一条的 `{ createdAt, turnId }` 为 `before`、`limit: 20`、带当前 `conversationId` 调用 `a9.listCheckpoints`。
  加载中按钮禁用并显示 `加载中…`；失败显示结构化错误并可重试；全部显示后按钮消失。
- **W-3 合并与去重**：快照中的最近 50 条与已加载的更早页按 `(createdAt, turnId)` 去重合并，按新→旧显示；新 checkpoint 出现时列表连续，
  不得出现缺口或重复。
- **W-4 作用域**：工作区或当前对话改变时清空已加载的更早页，回到首屏 10 条；请求返回时若作用域已变，丢弃该结果。
- **W-5 行为不变**：每行的“查看 Diff / 撤销 / 复制 ID”与现有行为一致，对加载出来的更早记录同样可用。

## 4. 已知局限（不在本任务处理）

- 旧面板 `a9-agent-panel.js` 以 `snapshot.checkpoints.length` 作总数，M3 后最多显示 50；它只在冒烟模式加载。
- 同一 Turn 被 `INSERT OR REPLACE` 重写时 `created_at` 会更新，该记录会移到列表最新位置；这是现有行为，不改。

## 5. 测试要求

状态层（`src/state/tests/**`）：
1. 180 条 checkpoint：最近 50 条与总数正确；连续按 `nextBefore` 翻页，所有页拼起来恰好是全部 180 条，无重复、无遗漏，顺序正确。
2. 多条记录 `created_at` 完全相同：按 `turn_id` 稳定排序，翻页跨过同一时刻时不重复、不遗漏。
3. 只取本会话：另一会话的 checkpoint 不出现在列表和总数里。
4. `listCheckpoints(sessionId)` 旧行为不变。

运行时与 IPC（`src/shell/tests/product/**`，用真实 `createA9AgentRuntime` 与真实 IPC 处理函数）：
5. 快照 `checkpoints` 为最近 50 条、`checkpointsTotal` 为真实总数（至少 60 条数据）。
6. **R12 反例**：经 IPC 取第一页，再用返回的 `nextBefore` 原样作为 `before` 取第二页：第二页与第一页没有交集，且紧接第一页最旧一条之后。
7. 请求校验：半个游标、多余键、空串、非字符串、`limit` 为 0/101/小数、未知顶层字段都得到 `A9_PAYLOAD_INVALID`；
   `conversationId` 不匹配得到 `A9_CHECKPOINT_CONVERSATION_MISMATCH`；不带参数的旧调用仍返回全部。
8. 预加载透传：`preload.js` 的 `listCheckpoints(options)` 把 `before` 对象原样送到 `a9.checkpoint.list`。

渲染端（`src/shell/tests/product/**`，沿用 `a9-workbench-contract.test.ts` 的 `vm` + 假 DOM 方式加载真实 `a9-workbench.js`）：
9. 首屏 10 条与计数文本；点击后先用快照内记录（不发请求），快照内用完才发请求且参数为最旧一条；连续加载到全部后按钮消失、计数为 `共 Y`。
10. 新 checkpoint 在加载过更早页之后出现：列表连续、无缺口无重复。
11. 切换对话后已加载页清空；作用域改变后才返回的旧请求结果被丢弃。
12. 加载失败显示错误并可重试。
13. 现有用例（含 `a9-06-driver-entry.cjs` 点击第一个 checkpoint 按钮、`a9-workspace-binding` 隔离用例）全部继续通过。

负向对照：新测试放在本任务基线的代码上运行，记录失败清单；如需进程级超时，必须终止整个进程组，交报告前确认没有遗留 jest/node 进程。

## 6. 验证命令（Node 20.17，better-sqlite3 需要 ABI 115）

```bash
cd src/state && npx tsc --noEmit && npx tsc && npx jest
```

```bash
cd src/shell && npx tsc --noEmit && npx jest --runInBand
```

```bash
npm run verify:quick
```

```bash
git diff --check
```

shell 测试须在 state 构建之后运行（运行时加载 `state/dist`）。不要并行运行两个包的全量 jest。

## 7. 交付

- 分支 `codex/a9-21-m3` 上的提交哈希，提交信息说明分页契约（快照 50 条 + 总数、`before` 游标、旧调用行为不变）。
- 事实报告：相对实际基线的改动文件清单；§3 每条要求对应的实现位置与测试名；各包测试摘要（套数/项数/失败项）；负向对照失败清单；
  偏离本交接书之处及原因；未完成项。
- 不写“验收通过”“已修复”等结论性措辞。

## 8. 验收方将检查

1. 改动只在 §2 允许路径内；schema、IPC 通道、依赖未变。
2. 逐条核对 §3，并在验收方环境复跑 §5 关键用例；自行用 1,000 条以上 checkpoint 翻页全量核对，并确认快照生成耗时不随总数增长。
3. 注入旧写法（IPC 返回快照列表、游标丢失或改名、排序不含 `turn_id`、渲染端不去重）应使对应测试失败。
4. 各包全量测试、负向对照结果与报告一致。

## 9. 第一轮验收结论与通过条件

### 9.1 第一轮结论（`106e650`，基线 `08b3365`，有条件通过）

范围、构建与各包测试（state 305、shell 432）符合；验收方用 1,200 条 checkpoint 经真实 IPC 以 100、37、1 三种页长翻页，
结果与数据库完整顺序逐条一致、无重叠、无跨会话；快照固定 50 条；10 种非法请求与会话不匹配均按要求拒绝。注入“IPC 返回快照列表”
“预加载拆开游标”“运行时丢掉游标”“渲染端不去重”均被测试抓住；负向对照与报告一致。偏离（未改 `workbench.html`、负向对照临时类型转换）接受；
真实 Electron 冒烟未执行，列为 A9-21 §5.6 的任务级开放项。

未满足 §8.3 的一处测试缺陷：

- **C1**：排序去掉 `turn_id`（两处 `ORDER BY created_at DESC, turn_id DESC` 改为 `ORDER BY created_at DESC`）后，
  `src/state/tests/a9-21-checkpoint-pagination.test.ts` 仍全部通过。原因是测试把同一时刻的记录按 `turn_id` 顺序插入，SQLite 对相同
  `created_at` 按插入顺序返回，恰好一致。验收方以 300 条、同一时刻 3 条、Turn ID 大小写混用的数据复现：注入后翻页静默丢失 20 条；交付代码 300 条无缺失无重复。

另记（不属本条件）：快照耗时随总数增长来自既有的 `listConversationFacts`（6,000 行约 5.7 ms），不是 M3 引入；§8.2 “快照生成耗时不随总数增长”
的表述超出 M3 范围，以“快照中的 checkpoint 列表不随总数增长”为准。

### 9.2 通过条件（只改测试）

在 `codex/a9-21-m3` 上、`106e650` 之后追加提交；只允许修改 `src/state/tests/**`，产品代码不改。**不推送、不合并。**

- **C1**：同一 `created_at` 的记录按与 `turn_id` 字节序不同的顺序插入（例如倒序插入，或 Turn ID 大小写混用使字节序不同于插入顺序），
  并用小页长（如 1 或 7）连续翻页，断言结果与按 `(created_at, turn_id)` 字节序的完整列表逐条一致、无重复、无遗漏。

### 9.3 证明与交付

1. 注入对照（临时副本）：两处排序去掉 `turn_id` 后，C1 用例失败；记录失败的用例名与失败信息。
2. state 与 shell 全量测试（§6 命令），`git diff --check`。
3. 报告：新提交哈希；相对 `106e650` 的改动文件清单；上述结果；各包套数/项数/失败项。

### 9.4 验收方将检查

相对 `106e650` 只改 `src/state/tests/**`；验收方自行复做 9.3 第 1 项；§8 其余各项继续成立。

### 9.5 第二轮结论（2026-09-26，`ab5e792`，通过，已并回）

- 相对 `106e650` 只改 `src/state/tests/a9-21-checkpoint-pagination.test.ts`：同一时刻 7 条记录按字节序逆序插入，页长 1 与 3 连续翻页逐条核对。
- 验收方复测：两处排序去掉 `turn_id`、或只去掉分页查询的 `turn_id`，该用例均失败；state 305、shell 432 项通过。
- 以 `--no-ff` 合并入 `codex/a9-alpha2`（`6dc75d0`），合并后 state 构建与全量测试、shell 全量测试、`verify:quick` 通过。
  真实 Electron 冒烟与 Win7 实机未执行。

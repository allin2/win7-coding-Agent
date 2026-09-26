# A9-21 — A9-18 有效成果移植与工作树清理

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: RUNTIME_MEMORY_AND_STARTUP_HARDENING
Target Branch: codex/a9-alpha2
Source Baseline: A9-20 完成后的 codex/a9-alpha2
Target Version: 0.3.0-alpha.2
Phase-Gate: A9_21_IMPLEMENTATION_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0138, ADR-0139
```

> 2026-09-25 起草；同日负责人按建议批准，ADR-0138/0139 同时接受，§7 开放问题按建议裁决（A9-20 先行）。
> 实现仅限 §4 允许路径（AGENTS.md C14），在 A9-20 完成后开工。取舍依据见
> [承接台账 §7](../plans/A9_17_A9_18_CARRYOVER_LEDGER.md)。

## 1. 目标

把 A9-18 未提交工作树中经评估有效的部分，在当前主线上重新落地，随后删除该工作树与分支。
参考来源是工作树 `win7-coding-agent-memory-optimization`（基线 `7d06789`）中的代码与测试；
不整体合并，不沿用其 ADR 编号，不接受其自报的审查结论。

## 2. 范围

- **M0 预算 #3 口径（K17-5）**：按 ADR-0139 修订 `PERFORMANCE_BUDGET.md` #3 与测量计划映射（#2 = `shell.gpu`+`shell.renderer`，
  #3 = `shell.main`，`shell.utility` 正常应为空），同步 `a9_win7_memory_baseline.ps1` 头部注释。阈值与“未实测”状态不变。
- **M1 启动定向恢复（P0-1）**：启动时只对 SQLite 中本工作区 `interrupted` 且缺 checkpoint 记录的 Turn 读取 manifest，
  不再枚举和加载全部历史；`loadCheckpoint` 返回 `undefined` 记为缺失，不计入有效集（R06）；历史 Turn 在 diff/undo 使用前
  照常经 `loadCheckpoint` 完整校验。密钥轮换触发的 `revalidatePersistedTurns` 保持全量校验，但校验结果不写入缓存。
- **M1b 脱敏正则线性化（2026-09-25 负责人指示增补）**：URL 凭据正则的协议名改为 `{0,31}` 次，消除二次复杂度，脱敏输出不变。
  实施细节与验收项见 [M1b 交接书](../plans/A9_21_M1B_REDACTION_REGEX_HANDOFF.md)。
- **M2 模型输出上限（P0-4）**：Gateway 单响应 1 MiB、单工具参数 512 KiB，Core 单 Turn 累计 2 MiB（逐响应累加）；
  超限即停止接收并标记截断，截断状态不被后续 `finish_reason` 覆盖；截断或未收全的工具调用一律不执行；
  截断以运行事件告知用户；按 UTF-8 字符边界截断；跨 chunk 脱敏不退化。2026-09-25 细化（见
  [M2 交接书](../plans/A9_21_M2_OUTPUT_LIMITS_HANDOFF.md) §3）：字节计数必须增量进行；SSE 待处理行缓冲上限 2 MiB 并结构化失败；
  畸形事件样本上限 20 条；截断说明写入 `model_note.data.content`；出现截断的轮次结果为 `COMPLETED_WITH_WARNINGS`。
- **M3 checkpoint 列表分页（P0-3）**：快照只带最近 50 条及总数；`a9.checkpoint.list` 走独立分页查询，游标为
  `before: { createdAt, turnId }`；界面可加载更早记录；会话与工作区绑定检查不变。
- **M4 集合上限（P2-1）**：渲染端 `inspectorEvents`、`turnEvents` 与 Main 进程 `blockedRequests` 设条数与字节上限，淘汰最旧并释放引用，
  界面显示被省略的真实数量；与 A9-19 实时过程改动合并，不回退其行为。（2026-09-26 负责人裁决：`blockedRequests` 位于
  `main.js` 而非渲染端，M4 允许路径增补该文件，限其 `blockedRequests` 相关代码。）
- **M5 清理**：移植提交后删除工作树 `win7-coding-agent-memory-optimization` 与本地分支 `codex/a9-memory-optimization`；
  删除前核对 §1 参考文件已无未移植的需要项，并在台账 §7.3 记录删除时间与最后 HEAD。

不在范围：P0-2 schema 迁移与事实投影表、缓存字节账本与 pin、受控重载、禁用默认菜单、懒加载测量、实验矩阵
（理由见台账 §7.2）。Git 分类器以 A9-20 为准。

## 3. 兼容性

不改 SQLite schema（保持 v4），不新增依赖、Runtime Profile、IPC 通道或 Chromium 开关；分页字段为新增可选字段，旧调用默认行为不变。
Electron 22.3.27/Node 16 目标不变。输出上限数值在 Win7 企业模型服务下是否过紧为**待验证**。

## 4. 允许路径（C14）

- M0：`docs/PERFORMANCE_BUDGET.md`、`docs/plans/WIN7_MEMORY_BASELINE_MEASUREMENT_PLAN.md`、`scripts/mvp_acceptance/a9_win7_memory_baseline.ps1`（仅头部注释）
- M1：`src/shell/product/a9-agent-runtime.js`、`src/state/src/a9-persistence.ts`、`src/workspace/src/checkpoint-manager.ts`
- M1b：`src/shell/product/a9-agent-runtime.js`、`src/shell/product/renderer/a9-workbench.js`（仅该正则）
- M2：`src/gateway/src/provider/openai-compatible.ts`、`src/gateway/src/provider/sse-parser.ts`、`src/gateway/src/types/index.ts`、`src/core/src/a9-agent-loop.ts`（仅输出预算）
- M3：`src/state/src/a9-persistence.ts`、`src/shell/product/a9-agent-runtime.js`、`src/shell/product/a9-product-ipc.js`、`src/shell/product/preload.js`、`src/shell/product/renderer/a9-workbench.js`、`src/shell/product/renderer/workbench.html`
- M4：`src/shell/product/renderer/a9-workbench.js`；`src/shell/product/main.js`（仅 `blockedRequests` 的声明、写入与计数上报，2026-09-26 增补）
- 测试：`src/state/tests/**`、`src/workspace/tests/**`、`src/gateway/tests/**`、`src/core/tests/a9-agent-loop.test.ts`、`src/shell/tests/product/**`
- 文档：本任务书、`docs/DECISIONS.md`（仅 ADR-0138/0139）、`docs/DECISIONS_INDEX.md`、`docs/tasks/README.md`、`docs/STATUS.md`、`docs/STATUS_LOG.md`、承接台账

M5 的删除动作限于上述工作树与分支，不触碰其他工作树、分支或 `outputs/`。

## 5. 验证（开发机）

1. M1：以台账 §7.1 的方法对比移植前后启动耗时（100 Turn），并有缺失、损坏、跨工作区 manifest 的单测；负向对照在旧实现上失败。
2. M2：超限截断、后续 `stop` 不覆盖截断、截断工具调用不执行、跨响应累计预算、UTF-8 边界、跨 chunk 秘密不泄漏。
3. M3：多页不重复、同时间稳定排序、半游标拒绝、总数正确；真实 IPC 取第二页不等于第一页（R12 反例）。
4. M4：超上限后 Map 大小与字节受控，省略计数正确，A9-19 实时过程用例继续通过。
5. 受影响包 lint/build/全量 jest，`npm run verify:quick`、`npm run docs:check`、`git diff --check`；
   追查 A9-18 移植试验中 gateway 的偶发失败，定位前不声称通过。
6. 真实 Electron 启动与一次完整任务回归。

## 6. Win7 与候选

只到开发机验证（`Phase-Gate` 至多 `A9_21_DEVELOPER_VERIFIED`）。Win7 结论随后续候选换发另行批准；M0 完成后即可按 A9-17
执行包进行 K17-1 采样，两者互不阻塞。

## 7. 开放问题与裁决（2026-09-25，均按建议）

1. **顺序**：建议 A9-20 先行，A9-21 在其之后开工（两者都改 `a9-agent-loop.ts`）。
2. **输出上限数值**：建议沿用 A9-18 的 1 MiB / 512 KiB / 2 MiB，暂不做成配置项。
3. **删除时机**：建议 M1～M4 提交且验证通过后立即执行 M5；如需更早删除，须先把参考代码另存为补丁文件。

## 8. 实施记录

### M0 预算 #3 口径（2026-09-25，完成）

- `PERFORMANCE_BUDGET.md` #3 改为“Main 进程常驻内存（含 Agent Core 与 A9 状态层）”，按 `shell.main` 采样；阈值与“未实测”不变。
- 测量计划：#2 映射改为 `shell.gpu`+`shell.renderer`，#3 改为 `shell.main`；`shell.utility` 说明为正常应为空；汇报口径同步。
  原稿借用 A9-18 工作树的 X03 修订，ADR 引用改为主线的 ADR-0139；A9-18 同一处新增的实验矩阵一节不移植（ADR-0138）。
- `a9_win7_memory_baseline.ps1` 只改头部注释，仍为纯 ASCII、LF；采样逻辑与进程分类未变。源码契约检查
  `a9-memory-baseline-tests.mjs` 通过。脚本 SHA-256 由 `61082726…dd95`（A9-17 §5 记录值）变为
  `198bdac3fe857be8d75210d4a3dd97fae042154745adaaf5a4e69a344bf0d0b6`，K17-1 采样须绑定新值。
- 未改：`ARCHITECTURE.md`、SPIKE_01/02、PHASE_03/06 中按 ADR-0028 描述的 utilityProcess 设计，属历史设计陈述，不是预算口径，也不在本任务允许路径内。

### M1 启动定向恢复（2026-09-25，完成）

- 状态层新增 `findInterruptedWorkspaceTurnsNeedingCheckpoint`：只列出本工作区 `interrupted` 且没有 checkpoint 行的 Turn，
  按 `(created_at, turn_id)` 排序；只用 v4 既有表。
- 运行时启动只对上述 Turn 读取 manifest：校验失败记 `quarantined`，清单不存在记 `missing`（诊断 ≤300 字符），都不进入对账；
  SQLite 不认识的磁盘清单不再扫描，保持原状，undo 以 `A9_CHECKPOINT_NOT_FOUND` 拒绝。其余历史在 diff/undo 调用
  `loadCheckpoint` 时照常完整校验。
- `CheckpointManager`：拆出不写缓存的 `readValidatedCheckpoint`；`revalidatePersistedTurns`（密钥轮换）仍逐个校验全部清单，
  但结果不写入缓存。
- 测试：状态层 1 项（候选范围、跨工作区、已对账后移出）；workspace 新文件 `a9-21-revalidate-cache.test.ts` 2 项；
  lifecycle 新增定向恢复用例（有效/损坏/缺失/他工作区），并把原“启动隔离旧 v4 清单”用例改为新行为。
- 负向对照（新测试放在 `c759790` 代码上）：workspace 缓存用例失败，lifecycle 两项失败，状态层因方法不存在编译失败；
  “复核仍拦截已知秘密”用例新旧都通过（行为保持）。
- 全量：state 303、workspace 213、shell 39 套 377 项通过，各包 `tsc --noEmit` 通过。
- 启动对比（开发机 M4，Node 20.17，真实 `createA9AgentRuntime`，300 个 16 KiB 类代码文件的工作区、100 个历史 Turn、
  恢复目录 480 MiB，各 3 次）：旧代码 8,051～8,272 ms、堆增量 17.3 MiB；新代码 35～51 ms、堆增量 4.4 MiB。
  旧值约为台账 §7.1 的两倍，是因为运行时路径还对每个快照做敏感内容扫描。未在 Win7 上测。

### M1 期间发现的范围外缺陷（待负责人裁决，未修改）

`redactSecrets` 中检测 URL 内嵌凭据的正则 `([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@` 在连续的字母、数字或 `+.-` 上是二次复杂度：
64 K 字符约 2 s，256 K 约 30 s（开发机）。它出现在 `a9-agent-runtime.js:72`、`:391` 与渲染端 `a9-workbench.js:117`，
经 `containsSensitiveCheckpointData` 作用于每个 checkpoint 快照、工具输出和事件。常见源码与 Base64 被标点打断，只需几毫秒；
长的十六进制或纯字母串（数据文件、单行生成物）会让基线冻结、启动或脱敏卡住。修法是给协议名加长度上限（如 `{0,31}`），
但它改动的是脱敏行为，不属于 M1 的启动恢复范围，需另行授权。→ 已由负责人增补为 M1b。

### M1b、M2 执行方式（2026-09-25）

负责人决定 M1b、M2 交由外部执行 Agent 按交接书实施，本会话负责验收。执行方分别在 `codex/a9-21-m1b`、`codex/a9-21-m2`
（基线 `25c89d3`）上本地提交，只交代码、测试与事实报告；验收通过后由验收方并入 `codex/a9-alpha2` 并更新本任务书与状态文档。
两项改动文件不重叠，可以并行。

### M1b 第一轮验收（2026-09-25，不通过，返工中）

- 交付 `codex/a9-21-m1b` @ `a78d928`（基线 `c3c7bc1`）：范围、测试（shell 40 套 398 项）、1 MiB 性能（75～80 ms）与负向对照均符合。
- 不通过：`{0,31}` 在 `://` 前 32 字符内无字母时不匹配，旧正则仍会脱敏（如 `v1.2.3.…15://user:pass@host`），新实现留下明文。
  缺陷在交接书第 1 版的修法，不在执行方。
- 负责人裁决：改为与旧正则等价的线性扫描实现，渲染端恢复原样（输入已截到 500 字符）。交接书已修订为第 2 版，执行方在原分支追加提交。

### M1b 第二轮验收（2026-09-25，通过，已并回）

- 交付 `d67979a`（在 `a78d928` 之上追加，基线 `c3c7bc1`）：`redactUrlUserinfo` 按交接书第 2 版 §2.2 改为线性扫描，渲染端恢复原样；
  相对基线只改运行时与新增测试两个文件。
- 验收方复测：与旧正则差分 160 万条 0 差异；1 MiB 各最坏输入 ≤ 7.4 ms，4 MiB 约为 1 MiB 的 4 倍；行为路径凭据在开头、中间、
  反例协议名三种布局均脱敏且不超过 600。shell 40 套 423 项、`tsc`、`verify:quick` 通过。
- 负向对照：新测试在 `a78d928` 上 6 项失败（反例与差分），性能全过；在 `25c89d3` 上等价性通过，7 项 25 s 进程级超时、2 项超 1 s 门限。
- 以 `--no-ff` 合并入 `codex/a9-alpha2`（`3e73b5e`），合并后 shell 全量复测通过。未在 Win7 实机验证。
- 旁注：`a9-lifecycle.test.ts` 的“recursively redacts secret-bearing external change paths”依赖后台命令先于 checkpoint 扫描写出文件，
  CPU 高负载下会稳定失败（本轮负向对照遗留进程占满 CPU 时复现，清理后连续通过）。属测试时序敏感，不是 M1b 回归，未修改。

### M2 第一轮验收（2026-09-25，不通过，返工中）

- 交付 `codex/a9-21-m2` @ `e118f2b`（基线 `87ca18f`）：范围、各包全量测试（gateway 255、core 367、shell 423）、gateway 连续 20 次、
  G-1～G-4、G-6、C-1、C-3、C-5 符合。
- 不通过：SSE 待处理行查找仍是二次复杂度（16 字节分片 1 MiB 约 63 s）；截断响应在历史中留下没有对应 `tool_calls` 的 tool 消息，
  此后每轮请求都会被严格的 OpenAI 兼容服务拒绝。另有口径、文案、测试缺口与未声明行为变化若干。
- 交接书修订为第 2 版（§9 返工要求），同时按验收方建议把单项截断调用在历史中的参数改为 `{}`。执行方在原分支追加提交。

### M2 第二轮验收（2026-09-25，有条件通过）

- 交付 `df0405a`（在 `e118f2b` 之上追加）：长行查找改为分段缓冲，16 字节分片 2 MiB 约 16 ms；截断后历史不再残留孤立 tool 消息；
  gateway 266、core 368、shell 423 项通过，gateway 连续 20 次通过。
- 剩两处测试缺陷（交接书 §10）：C-4 降级用例被 A9-20 规则掩盖，删掉降级也通过；历史协议用例从 gateway 测试引用 core 的构建产物，
  全新检出按验证顺序运行会失败。只改测试，补齐并复查后再并回。

### M2 第三轮验收（2026-09-26，通过，已并回）

- 交付 `3bc8815`：补齐交接书 §10 两处测试条件，产品代码未改。注入对照、全新副本运行、各包全量测试（gateway 263、core 371、shell 423）
  与 gateway 连续 20 次均通过。
- 以 `--no-ff` 合并入 `codex/a9-alpha2`（`de851be`），合并后复测通过。未在 Win7 实机验证；输出上限数值在企业模型服务下是否过紧仍待验证（§3）；
  A9-18 试验中的 gateway 偶发失败在累计 60 次连续运行中未复现，原因未定位。
- 旁注（范围外）：gateway 的 `a9-05-journeys.test.ts` 依赖 `state/dist`，§5 的验证顺序不构建 state，全新检出时该套测试会失败。

### M3、M4 开工前裁决（2026-09-26）

- 矛盾：M4 要求限制 `blockedRequests`，但它在 Main 进程 `src/shell/product/main.js`（声明、`onRequestBlocked` 写入、诊断计数），
  不在原允许路径内。负责人裁决：M4 允许路径增补 `main.js`，只限 `blockedRequests` 相关代码；§2 标题改为“集合上限”。
- M3 无矛盾：`a9.checkpoint.list` 通道已存在（`a9-product-ipc.js`、`preload.js`），分页为既有通道新增可选参数，不违反 §3。
- 已知局限（不改）：旧面板 `a9-agent-panel.js` 以 `snapshot.checkpoints.length` 显示总数，M3 后最多显示 50。该面板只在
  `--a8-review-smoke-*`、`--a8-boundary-smoke-*` 冒烟模式加载，且不在允许路径内。
- 执行方式：M3、M4 交外部执行 Agent，本会话验收；先以真实 workbench 代码加桩数据做界面 Demo，负责人确认后再出交接书。
  两者都改 `a9-workbench.js`，M3 先行，M4 以 M3 并回后的主线为基线。

### M3 交接（2026-09-26）

- 负责人按演示确认界面方案：快照带最近 50 条与 `checkpointsTotal`；界面首屏 10 条，每次加载更早 20 条，先用快照内记录，
  用完后以 `before: { createdAt, turnId }` 调用既有 `a9.checkpoint.list`；不带参数的旧调用仍返回全部。
- 交接书：[M3 交接书](../plans/A9_21_M3_CHECKPOINT_PAGINATION_HANDOFF.md)，分支 `codex/a9-21-m3`，本会话验收。M4 待 M3 并回后另出交接书。

### M3 第一轮验收（2026-09-26，有条件通过）

- 交付 `codex/a9-21-m3` @ `106e650`（基线 `08b3365`）：1,200 条经真实 IPC 全量翻页一致，快照固定 50 条，请求校验与会话绑定符合；
  state 305、shell 432 项通过。
- 条件：同一时刻记录的稳定排序没有被测试覆盖（去掉 `turn_id` 排序后翻页会丢记录，但测试仍通过），补测试后复查再并回（交接书 §9）。
- 另记：快照耗时随 checkpoint 总数增长来自既有 `listConversationFacts`（每次读全部 checkpoint 行并解析载荷，6,000 行约 5.7 ms），
  不属 M3，未处理；真实 Electron 冒烟未执行，保留为 §5.6 开放项。

### M3 第二轮验收（2026-09-26，通过，已并回）

- 交付 `ab5e792`：补齐同一时刻记录的稳定排序测试，去掉 `turn_id` 排序的注入会使其失败；产品代码未改。
- 以 `--no-ff` 合并入 `codex/a9-alpha2`（`6dc75d0`），合并后 state 305、shell 432 项通过。真实 Electron 冒烟与 Win7 实机未执行。

### M4 交接（2026-09-26）

- 按演示确认的规则：渲染端事件全局 2000 条 / 4 MiB、每轮 500 条，按 eventId 淘汰最旧的并一次降到 90%；“加载更早记录”到上限即停，
  不挤掉较新记录；轮询带回的已淘汰事件不再收回；`blockedRequests` 500 条 / 1 MiB，诊断保留总数并新增淘汰数。
- 交接书：[M4 交接书](../plans/A9_21_M4_COLLECTION_LIMITS_HANDOFF.md)，分支 `codex/a9-21-m4`，本会话验收。
- 遗留（不在裁决范围内）：`main.js` 的 `deniedPermissions` 同样没有上限，保持不变。

### M4 第一轮验收（2026-09-26，不通过，返工中）

- 交付 `codex/a9-21-m4` @ `e1c6956`（基线 `0ea5707`）：上限、`blockedRequests`、重置与 A9-19 行为符合，shell 442 项通过。
- 不通过：淘汰后“加载更早记录”跳过已释放的记录，界面留下断档且释放计数无法减少；“收回已淘汰事件”的回归测不出来。
  负责人决定同时把逐 ID 记录的 `releasedEventIds`（随对话无限增长）改为计数。交接书修订为第 2 版（§9），执行方在原分支返工。

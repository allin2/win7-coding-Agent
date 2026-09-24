# A9-19 — 运行过程实时可见与工作台布局二期

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_EXPERIENCE
Target Branch: codex/a9-alpha2
Source Baseline: 6adaaf0
Target Version: 0.3.0-alpha.2
Phase-Gate: A9_19_WIN7_37_AUTHORIZED_READY_FOR_WIN7
Win7-Validation: NOT_PERFORMED
Decision: ADR-0135
```

> 2026-09-24 负责人批准实现，ADR-0135 同时接受，§10 开放问题按建议裁决；实现仅限 §7 允许路径（AGENTS.md C14）。“A9-18”曾被
> 2026-09-13 的独立审查轮非正式使用（`outputs/a9-18-*`），为免混淆本任务编号为 A9-19。

## 1. 负责人反馈

2026-09-24 负责人反馈：Agent 运行时，中间的工具调用和中间状态要到最终结果出现时才一起打印，
使用者无法观察进展；同时要求结合既有截图优化页面布局，并授权对不合理的需求与标准按推荐直接修订。

## 2. 根因（开发机代码核查与复现，2026-09-24，`6adaaf0`）

| # | 根因 | 证据 | 影响 |
|---|---|---|---|
| F1 | **运行中轮次的事件挂不到对话流**。运行中任务在 `a9_tasks` 中为 `active`，对话事实投影为 `outcome='active'`、`turnId=null`（`a9-persistence.ts` `listConversationFacts`/分页查询）；渲染端 `resolveTurnId` 只在 `outcome` 为 `running`/`needs_approval` 时绑定 `activeTurnId`，于是运行中轮次拿到空事件列表。提交时的本地请求卡也会在事实出现后立即被移除（`a9-workbench.js` `renderConversation`）。 | 用真实渲染函数复现：`outcome='active'` 渲染 0 个事件，只有 REQUEST；改为 `running` 立即出现“运行命令 … 执行中”工具卡。WIN7-36 实机截图 `wait-stop-before-v2.png`：Shell 已运行 12 秒，对话流只有 REQUEST，只有底部状态条（走另一条路径）显示“正在执行工具”。 | **主因**：工具卡、模型说明全部要等轮次结束、事实取得 `turnId` 后才一次性出现 |
| F2 | 模型流式输出被整体压后：Gateway 与 Core 已按 chunk 发出 `model_chunk`，运行时却累积到 `turn_completed`/`turn_failed` 才合并落盘（`a9-agent-runtime.js` `pendingModelChunks`/`flushModelChunks`）；`model_note` 也只在一步模型响应完整返回后才发出。 | 代码核查；A9-15 只读验证报告（`outputs/a9-15-live-feedback-verification-2026-09-11.html`）探针中 20 个 chunk 持续到达但 UI 不可见 | 每次模型调用期间（通常是最长的等待）界面静默 |
| F3 | 主进程事件循环被同步全树哈希独占：`freezeTurnBaseline`、`collectExternalChanges` 虽为 `async`，内部是同步 `readdirSync`/`statSync`/逐文件 SHA-256（`a9-workspace-service.ts`），每轮至少两次（首个副作用工具前、每次 Shell 后）。 | A9-15 报告实测：6000 文件时独占 0.83 s（macOS 热缓存，Win7 更慢） | 独占期间渲染端 500 ms 轮询拿不到新事件，表现为“卡住后一串出现” |
| F4 | 等待提示需空闲 ≥10 s 才出现。 | `a9-workbench.js` 等待反馈逻辑 | 前 10 s 无任何“在等什么”的提示 |
| F5 | Shell 输出只随 `tool_end` 一次性带出：直接 `spawn` 路径把 stdout/stderr 缓冲到退出；Win7 使用的 D-013 native helper 协议 v2 在完成后返回整段 `stdoutBase64`。 | `trusted-shell-runner.ts` 两条路径 | 长命令运行期间看不到输出（A9-16 S01–S06 未授权实现） |
| F6 | 验收标准只断言顺序，不断言时效：WIN7-28 的 W28-02 等用例只要求“说明先于其工具、最终答案恰好一次”，证据为完成态截图。 | A9-15 只读验证报告 §4 | 上述问题在已签发 PASS 下不可见 |

布局问题（WIN7-36 实机截图，1366×768 / 125% DPI，实际内容视口 1079×540 CSS px）：

| # | 问题 | 证据 |
|---|---|---|
| G1 | **左栏对话行看不到标题**。行为两列网格 `minmax(0,1fr) minmax(0,auto)`，右列是状态加完整 `toLocaleString()` 时间（如“空闲 · 2026/9/15 09:36:48”），在约 230 px 宽的左栏内占满全行，标题列被压到 0。U02 只要求“≥4 条完整行”，未要求标题可见，因此该缺陷在 PASS 下存在。 | `w36r1-15-real-dpi.png`、`G3-restart-t10000ms.png`：所有行只显示“空闲 · 日期” |
| G2 | 头部与卡片混用英文和内部术语：`AGENT /`、`REQUEST`、`CONVERSATIONS`、`INSPECTOR`、`tool_calling`、`Runtime 就绪`、`not_applicable`；头部 4 个状态胶囊中两个是诊断信息。 | 同上 |
| G3 | 540 px 高度下对话流只占约 300 px：状态条、Composer 与两行常驻说明（“任务正在执行；可随时停止…”、“草稿已由 Windows DPAPI…”）共占约 250 px。 | `wait-stop-before-v2.png` |
| G4 | 左栏与 Composer 各有一个“停止任务”；Review 暂缓期间左栏仍常驻禁用的 Review 页签；“重命名/归档”常驻一整行。 | `w36r1-01-initial-worst-form.png` |
| G5 | 工具活动折叠为“工具活动 · 1 项”，运行中也不展开，看不到正在执行的命令。 | `G3-restart-t10000ms.png` |

## 3. 需求修订（负责人授权按推荐直接修订）

1. **模型输出实时预览纳入范围**：A9-16 §3 末段、A9-15 与 ZCode 参照文档 §4 把“模型 token 级输出”列为
   非目标。由于模型调用是最长的静默期，该排除与“可观察进展”的目标直接冲突，改为纳入本任务（P02），
   以 ADR-0135 约束安全边界。交互式终端与 stdin 注入仍不做。
2. **补时效性验收**：过程可见必须以时间断言验收（P06），不再只断言完成后的顺序。
3. **对话行必须显示标题**：在 U02“≥4 条完整行”之上增加“标题可见”（L01），行数达标但无标题不算通过。
4. **Review 暂缓期间隐藏左栏 Review 页签**（L05）：A9-16 §7 原决定为“disabled + fail-closed 文案”常驻；
   修订为左栏不展示，权限对话框中的 Review 选项继续 fail-closed 展示并说明未开放，R01“不静默降级”不变。

上述修订以追加说明方式登记到 A9-16 §3/§4 与 ZCode 参照文档，不改写 WIN7-36 据以验收的原条文。

## 4. 需求

### 4.1 运行过程实时可见（本任务交付）

| ID | 可观察成功条件 |
|---|---|
| A9-19-P01 | 运行中轮次（任务状态 `active`，或 `outcome` 为任一非终态）的 `model_note`、`tool_start`、`tool_end`、审批等事件在落盘后 ≤1 s 出现在对话流对应轮次中；本地请求卡与持久化事实交接时不丢失、不重复过程卡 |
| A9-19-P02 | 模型流式返回期间，对话流在当前轮次内显示“正在生成”的文本预览，刷新间隔 ≤1 s；预览只来自运行时内存，按 ADR-0135 做累积脱敏与尾部保留，不写入 SQLite/日志；轮次结束后由持久化的最终文本替换，预览不重复出现 |
| A9-19-P03 | 基线冻结与外部变化收集分片执行并让出事件循环：开发机 6000 文件夹具下单次占用 ≤50 ms；运行期间快照轮询的响应延迟不因哈希超过 250 ms。结果（文件集合、哈希、外部变化报告）与现实现逐字节一致 |
| A9-19-P04 | 进入模型等待或工具执行即显示等待对象与计时（从 0 s 起），不再要求空闲 ≥10 s |
| A9-19-P05 | 运行中的工具卡默认展开，显示命令/目标与已运行时长；Shell 运行中明确标注“输出将在命令结束后显示”，不虚构实时输出；结束后折叠为摘要行 |
| A9-19-P06 | 受控用例（模型分 ≥2 步、每步流式 ≥3 s，中间有耗时 ≥3 s 的工具）中：首个预览文本、首个工具卡的 DOM 可见时刻均早于 `turn_completed` ≥3 s；逐事件记录“落盘时刻 → DOM 可见时刻”，全部 ≤1.5 s |

### 4.2 工作台布局二期（本任务交付）

| ID | 可观察成功条件 |
|---|---|
| A9-19-L01 | 对话行以标题为主（单行省略），状态用圆点，时间用相对短格式（刚刚 / `HH:mm` / `M月D日`）；1079×540 CSS px 下每行至少可见 6 个中文字符的标题，且 U02 的 ≥4 条完整行继续成立 |
| A9-19-L02 | 用户可见文案中文化：`REQUEST`→“你”，`CONVERSATIONS`→“对话”，`INSPECTOR`→“检查器”，`AGENT / 工作区` 改为工作区面包屑，`not_applicable` 等内部值改为中文或隐藏；头部只保留“权限模式”与“运行状态”两个胶囊，Provider 分类与 Runtime 状态移入诊断（Runtime 受限时仍以错误条提示） |
| A9-19-L03 | 1079×540 CSS px 下对话流可视高度 ≥ 视口高度的 55%：等待状态条并入 Composer 顶部一行，常驻说明文字移入 Composer 的说明提示（悬停/焦点可见），Composer 空闲高度压缩 |
| A9-19-L04 | 运行中只保留 Composer 的“停止任务”；左栏只显示状态。左栏关闭、Inspector 打开、窄屏抽屉各态下 Stop 均可达（U05 不弱化） |
| A9-19-L05 | Review 暂缓期间左栏不显示 Review 页签；“重命名/归档”收进当前对话行的“更多”菜单，键盘可达并有 `aria-haspopup`/`aria-expanded` |
| A9-19-L06 | A9-16 U01–U07 全部继续满足（四态、≥4 行、抽屉/桌面状态机、键盘焦点、aria），现有契约测试不删减 |

### 4.3 延后（本任务不交付）

- **Shell 真正增量输出（A9-16 S01–S06）**：Win7 走 D-013 native helper，需把 helper 协议从 v2 升级为
  带序号的 chunk 流（v3），涉及原生重建、D-013 锁定工件更新与依赖登记，另立任务授权。本任务只做 P05 的诚实标注。
- Review（R01–R05）、侧栏状态跨重启记忆、全局搜索。

## 5. 设计

1. **F1 修复（渲染端）**：`resolveTurnId` 把任一非终态事实（含 `active`）绑定到当前 `activeTurnId`；
   本地请求卡在事实接管时把已渲染的过程节点迁移给事实块，而不是丢弃重建。以真实渲染函数加入契约用例，
   覆盖 `active`/`running`/`needs_approval` 三种非终态与本地卡交接。
2. **P02 预览（运行时 + 渲染端，ADR-0135）**：运行时为当前轮次维护内存预览：每收到 chunk，对“已累积全文”
   执行现有 `redactSecrets`，并保留末尾 `holdBack` 个字符（取全部已知秘密及其 base64/百分号等编码变体中的最大长度，下限 64；`redactSecrets` 按已知值与编码变体匹配）
   暂不暴露，以免跨 chunk 的秘密前缀先出现在预览里。快照新增 `liveModelPreview: { turnId, text, updatedAt }`，
   不入 `timeline`、不落盘；`model_note`/`turn_completed` 到达时清空。现有 `flushModelChunks` 的持久化
   语义不变。
3. **P03 让出事件循环（workspace）**：`freezeTurnBaseline`/`collectExternalChanges` 改为使用
   `fs.promises` 读取目录与文件，每处理 N 个文件或累计超过 25 ms 即 `await setImmediate` 让出；遍历顺序、
   忽略规则、大小上限与哈希算法不变，以前后结果逐字节比对的测试锁定。不引入 worker 线程与新依赖。
4. **P04/P05（渲染端）**：等待条在 `tool_start`/模型请求开始即显示；运行中的工具项脱离折叠组单独展开。
5. **布局（渲染端）**：以 `a9-workbench.js/css/html` 实现 L01–L05；行内时间改为相对短格式并给标题列
   优先宽度（时间列 `max-content` 且上限 5 个字宽）；以状态类驱动，不重建 DOM（沿用 U05 纪律）。

## 6. 兼容性

- Electron 22.3.27（Chromium 108 / Node 16.17.1）既有能力内完成：`fs.promises`、`setImmediate`、
  CSS Grid 均可用；不新增依赖、原生模块或系统 API，无需 C15/C16 登记。
- 不改 IPC schema 的既有字段，只在快照中新增可选字段 `liveModelPreview`；不改 SQLite schema。
- 脱敏：预览在累积全文上脱敏并保留尾部，未脱敏片段不进入 IPC/UI；持久化路径不变（ADR-0135）。
- 未在 Win7 实机验证前，不得宣称 Win7 可用；Win7 验收需另行冻结新候选（见 §9）。

## 7. 允许路径（批准后生效，C14）

- `src/shell/product/renderer/a9-workbench.js`、`a9-workbench.css`、`workbench.html`
- `src/shell/product/a9-agent-runtime.js`（仅 P02 预览与其快照字段）
- `src/workspace/src/a9-workspace-service.ts`（仅 P03 分片让出）
- 测试：`src/shell/tests/product/a9-workbench-contract.test.ts`、`src/shell/tests/product/a9-product-contract.test.ts`、
  `src/workspace/tests/unit/a9-f2-baseline-safety.test.ts`，以及新增 `src/shell/tests/product/a9-19-live-progress.test.ts`、
  `src/workspace/tests/unit/a9-19-baseline-yield.test.ts`
- 证据与文档：`docs/reports/2026-09/a9-19-evidence/**`、本任务书、`docs/tasks/README.md`、`docs/STATUS.md`、
  `docs/STATUS_LOG.md`、`docs/DECISIONS.md`（仅 ADR-0135 状态）、`docs/DECISIONS_INDEX.md`

不得修改 Core、Runner、native helper、Gateway、State、IPC schema、发布脚本或任何历史候选与证据。

## 8. 验证矩阵（开发机）

1. 定向单测与契约：F1 复现用例（修复前失败、修复后通过）、预览脱敏跨 chunk 用例（秘密被拆在两个 chunk
   中也不出现在任何预览快照里）、P03 前后结果逐字节一致与单片耗时。
2. Shell 包 lint/build、workspace 包测试、`npm run verify:quick`、`npm run docs:check`、`git diff --check`。
3. 真实 Electron 22.3.27 + 脚本化流式 Provider 夹具：按 P06 记录逐事件“落盘 → DOM 可见”时刻；
   1079×540 与 1366×768 视口下按 L01–L06 与 U01–U07 量测几何（标题可见字符数、对话流高度占比、≥4 行、
   四态无横向溢出），截图归档到 `docs/reports/2026-09/a9-19-evidence/`，输出目录遵守 DOCS_03 隔离规则。
4. 负向对照：F1 与 G1 的修复分别在旧实现上复现失败。

## 9. Win7 与候选

本任务只到开发机验证（`Phase-Gate` 至多 `A9_19_DEVELOPER_VERIFIED`）。Win7 实机验收需另行冻结新候选
（建议 WIN7-37：继承 WIN7-36 用例集，新增 P06 时效与 L01/L03 几何用例），其换发合同、authority 与实机目标
按既有流程单独批准；本任务不授权构建、打包或远程执行。

## 10. 开放问题与裁决（2026-09-24，均按建议）

1. **预览是否落盘**：建议不落盘，只作运行中内存预览；最终文本沿用现有持久化。重启后不恢复预览（未完成的
   模型输出本就不可恢复）。
2. **L05 隐藏 Review 页签**：建议隐藏（见 §3-4）；若希望保留入口，则改为左栏底部的“即将推出”说明，不占页签位。
3. **Shell 增量输出（helper v3）**：建议在本任务开发机验证通过后立即另立任务，因其需要 Win10 原生构建与
   D-013 工件重锁，周期较长。
4. **P03 采用分片让出而非 worker 线程**：建议分片让出，改动小、无跨线程序列化与生命周期风险；若 Win7 实测
   仍有明显卡顿，再评估 worker。

## 11. 实施结果（2026-09-24，开发机）

| 需求 | 结果 | 证据 |
|---|---|---|
| P01 运行中轮次过程实时可见 | 达成。`resolveTurnId` 把任一非终态事实绑定当前活动轮次（不与已绑定的其他任务冲突） | 契约用例覆盖 `active`/`running`/`needs_approval`，并内置负向对照：恢复旧判定后 `active` 轮次渲染 0 个事件 |
| P02 模型输出实时预览 | 达成（ADR-0135）。运行时只记录步边界，读快照时按需对当前步累积文本脱敏并保留尾部；渲染端在本轮末尾显示“模型正在输出” | `a9-19-live-progress.test.ts` 2/2（真实运行时 + 延迟流式夹具）；负向对照：保留长度改为 0 时预览出现秘密前缀，用例失败 |
| P03 扫描让出事件循环 | **部分达成**。扫描阶段最长独占 550 ms → 27 ms、收集 175 ms → 43 ms，结果逐字节一致；残留见下 | `a9-19-baseline-yield.test.ts` 3/3、`p03-compare-result.json` |
| P04 等待说明从 0 秒起 | 达成；空闲 ≥10 s 仅追加强调样式 | 渲染探针 `waitingLabelAtStart` |
| P05 运行中工具卡展开、时长与诚实说明 | 达成；完成后自动展开的组折叠 | 契约用例；截图 |
| P06 时效断言 | 达成（开发机渲染层）：工具卡、时长、Shell 说明相对事件 0 ms 可见，预览首段 600 ms，首个工具卡早于完成 8.0 s | `probe-summary.json` |
| L01 对话行标题可见 | 达成：1079×540 下前 6 行可见 9–11 个中文字符，时间为短格式 | 同上；负向对照为 0 宽 |
| L02 文案中文化、头部精简 | 达成：头部只剩权限与运行状态（Provider 异常、运行时受限时仍显示） | 同上 |
| L03 对话流高度 ≥55% | 达成：1079×540 运行中 60.5%（旧 43.7%） | 同上 |
| L04 单一 Stop | 达成：左栏 Stop 元素保留但不显示 | 同上 |
| L05 隐藏 Review 页签、“更多”菜单 | 达成：重命名/归档收进 `conversation-more` 菜单，Esc 关闭并回焦 | 同上 |
| L06 U01–U07 不回退 | 达成：工作台契约 34/34（原 32 + 新增 2），DOCS_03 几何闸门 PASS | — |

- 设计偏差（登记）：P03 未改用 `fs.promises`，而是保留原同步调用与遍历顺序，只按 25 ms 时间片 `await setImmediate`
  让出；这样结果天然逐字节一致，取消也能在扫描中途生效。
- **残留**：`freezeTurnBaseline` 末尾 `CheckpointManager.persistExternalBaseline` → `loadCheckpoint` 对全部恢复 blob 同步往返校验，
  本机 2000 个文件约 0.4 s，每轮一次。`checkpoint-manager.ts` 不在本任务白名单内，未修改；建议另立任务把该校验分片或移出主线程。
- 验证：Shell lint/build，Shell 全量 39 套件 375 项，workspace 全量 211 项，`npm run verify:quick`，`npm run docs:check`，
  `git diff --check`，DOCS_03 几何闸门均通过。开发机渲染证据为无头 Chrome（非 Electron 22），见
  [`a9-19-evidence/README.md`](../reports/2026-09/a9-19-evidence/README.md)。
- 未执行：真实 Electron 22.3.27 运行（本机无 Electron 二进制，下载需负责人批准）、Win10 打包预检、Win7 实机。

## 12. Win7 探索性运行（2026-09-24，非验收）

- 性质：负责人批准的探索性运行，**不是验收，不签发任何 PASS**。包为 WIN7-36 冻结包（ZIP SHA-256 `8f730c5a…`）的副本
  叠加 A9-19 改动的 5 个文件；叠加前 5 个文件哈希与冻结 ZIP 一致，叠加后与 `b4c138b` 一致，`electron.exe` 与锁定条目一致。
  目录 `C:\A9-X19\x19-20260924-2213-458698`（`192.168.1.3`，同一物理 Win7，主机键按 `192.168.1.11` 固定键严格核对），
  以 `dccs-chaizl-pc\agent` Medium 非提升令牌、已保存的真实 Provider 在隔离工作区跑一轮（ping 约 7 秒 → 读文件 → 中文总结）。
  候选外证据在本机 `.acceptance/runs/A9-19-EXPLORE/x19-20260924-2213-458698/`。
- 观察（真实 Electron 22 + D-013 helper + 真实 Provider，1079×579 CSS px，DPR 1.25）：
  - 模型说明与 ping 工具卡在落盘的同一采样（1.6 s）出现在对话流，运行中显示“已运行 N 秒 · 执行中”与 Shell 诚实说明，持续约 7 s；
  - 后续两个工具在落盘后 ≤1.1 s 出现；最终回答流式期间对话流可见 166 字符预览（快照 296 字符），早于轮次完成；
  - 头部只显示权限与运行状态，无横向溢出；轮次结束后原工作区已恢复，无 Electron 残留。
- 新发现：
  1. **切换/新建对话与选择工作区会收起桌面左栏**：`a9-workbench.js` 在对话操作与工作区选择后无条件调用 `closeNavigation()`
     （A9-19 前已存在，同样 5 处），该调用原为窄屏抽屉设计；A9-16 引入桌面折叠态后，在桌面宽度下会把左栏收起。与 A9-16 U05 冲突。
  2. 预览出现后等待条最多滞后约 1 s 才切换为“模型正在输出”（等待条按 1 s 计时刷新）。
- 处置（2026-09-25，负责人要求修复发现 1）：新增 `dismissNavigationDrawer()`，对话操作与工作区选择后只在窄屏抽屉打开时收起，
  桌面宽度保持用户当前的左栏状态；其余 3 处 `closeNavigation()`（断点收敛、手动开关、Esc 关闭抽屉）不变。契约用例覆盖桌面/抽屉
  四种情形并含负向对照（旧写法在桌面宽度下折叠）；Shell 全量 376/376、开发机渲染探针与 DOCS_03 闸门通过。Win7 复核待下一次上机
  （2026-09-25 复跑时 `192.168.1.3` 不可达，TCP 22 与 ping 均超时，未发生远程写入）。发现 2 影响小，暂不处理。

## 13. WIN7-37 换发授权（2026-09-25，负责人批准）

负责人批准 [WIN7-37 换发合同](../plans/A9_19_WIN7_37_REISSUE_PROPOSAL.md)，决策 ADR-0136。本节扩展本任务的 C14 允许路径，仅用于换发：

- 发布管线：`scripts/release/build-a9-product-v3.mjs`、`scripts/release/test/a9-package.test.mjs`；`release/win7-product-v3/` 新增
  `a9-19-win7-37-input-lock.json`、`a9-package-integrity-w37.cjs`、`a9-win7-37-report.cjs`、`a9-win7-37-smoke.cjs`、
  `RUN_A9_19_W37_INTEGRITY.cmd`、`RUN_WIN7_37_REPORT_VERIFY.cmd`、`A9_19_WIN7_37_VALIDATION.md`，并更新该目录 `README.md`。
- G2 实时性断言：`src/shell/tests/product/a9-06-driver-entry.cjs`（仅新增 W37 实时性旅程）。
- 文档：合同与交接书、本任务书、任务索引、`docs/STATUS.md`、`docs/STATUS_LOG.md`、ADR-0136、`docs/DECISIONS_INDEX.md`、`docs/reports/2026-09/**`。
- 不新增产品改动；不得修改 WIN7-36 及更早的发布文件。版本 `0.3.0-alpha.1`；结论上限 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`。
- 执行门：管线与开发机门 → 单一本地提交（不推送、不打标签）→ 双独立干净工作树构建逐字节一致 → 冻结 → 负责人按精确哈希签发候选外
  `WIN7_37_RELEASE_AUTHORITY` → 按交接书实机执行 → 审核方基于原始证据给建议 → 负责人裁决。

## 14. WIN7-37 管线与候选冻结（2026-09-25）

- 管线提交 `dd6cb1a9aeebb366478e155267996ea03653667b`（单一本地提交，未推送、未打标签），只含 §13 允许路径：新增 profile `A9-19-INPUTS-LIVE-PROGRESS-WIN7-37`、
  input lock、21 项 Kit、完整性/报告/smoke、两个 CMD 与验证说明；共享驱动只新增 `live` 旅程。开发机门：package 37/37（含 W37 闭包与
  注入 W36 残留的反例）、Shell 376/376、workspace 211/211、`verify:quick`、`docs:check`、`git diff --check`、开发机渲染探针与 DOCS_03 闸门。
  G2 `live` 阶段需要 Electron 22，只能在 Win7 G2 实际执行。
- 双独立干净工作树（依赖以 APFS 克隆逐字节复制）从同一提交构建，ZIP 逐字节一致（`cmp`），101,369,111 B：

| 项 | SHA-256 |
|---|---|
| 候选 ZIP `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip` | `4d70063254212ca581b7b3dac9f89edc81a2ba31a53b51a6b1c1d65667f167cf` |
| `release-manifest.json` | `bad63b4ce9f881d42bfd4426ccd5bdae58916ea7c284b5c1bbc8cc17e08ea27c` |
| input lock `a9-19-win7-37-input-lock.json` | `a64a8b6833d6d7f6b1db603416a7e7e27ddad354f5a54a00c6b3be115aa04cbe` |
| approval registry `a9-v25-approved-kits.json`（commit `e1b6f4bf30ad2ae7576aa958317e0aea6f4338d3`） | `d9cfea73c2f89c01a33a2bbef1d65c27eb995cd3681c71a939183348744917b7` |

- manifest `source_dirty=false`、`external_acceptance_eligible=true`，788 个文件；Kit `A9-19-WIN7-37-LIVE-PROGRESS-20260925-01`（21 项）。
  开发机预检以候选自带 `verifyAcceptanceCandidate` 对完整文件树与测试夹具 authority 接受正确绑定，并拒绝错误 ZIP 哈希
  （`A9_W37_RELEASE_AUTHORITY_BINDING_INVALID`）与错误 pin（`A9_W37_AUTHORITY_PIN_MISMATCH`）；测试夹具不构成批准。
- 冻结于本机 `.acceptance/candidates/WIN7-37/`（含 `IDENTITY.sha256`），双构建输出在 `.acceptance/builds/WIN7-37/dd6cb1a-reissue/`，临时工作树已移除。
- 当前停在候选外 `WIN7_37_RELEASE_AUTHORITY` 门：负责人按上表精确哈希与实际 Win7 地址签发 authority 与独立 SHA-256 pin 之前，
  Win7 G1/G2/G3 均 `NOT_PERFORMED`。

## 15. WIN7-37 候选外授权（2026-09-25，负责人批准）

负责人按 §14 的精确哈希批准 WIN7-37，目标主机 `192.168.1.3`。候选外 `release-authority.json` 绑定源码 `dd6cb1a`、ZIP、manifest、
input lock、批准清单、目标主机与 run-id `85476889-099d-46b6-b8a4-666e8e0b5d77`，SHA-256 `0d8d4f9456f42da4692fea7d27c03edcd4f91df3ba6985b623233e095a9d0616`，独立 pin 与锁文件同存于本机
`.acceptance/runs/WIN7-37/85476889-099d-46b6-b8a4-666e8e0b5d77/authority/`。冻结候选自带 `verifyAcceptanceCandidate` 已接受该真实 authority。
交接书改为 `READY_FOR_EXECUTION`；Win7 G1/G2/G3 仍 `NOT_PERFORMED`，由外部执行方按交接书执行，审核方复核原始证据后给建议，负责人裁决。

# WIN7-28 第二次续修交接与独立验收约定

日期：2026-09-11

状态：HANDOFF_FOR_ASSIGNMENT（续修建议及交回要求；不新增或扩大实现授权）

分工：负责人将本文交给另一位 agent 实施与自检；完成后将材料交回原审查对话，由原审查 agent 对实际代码和原始证据做后续独立验收。执行 agent 不替代审查方签发结论。

## 1. 当前基线与本轮目标

- 仓库：`/Users/qlyf/Developer/win7-coding-Agent`。
- 分支：`codex/ui-optimization`。
- HEAD：`55d9d5f7bec009c62a1f508c8b7bed0946ba6aae`；本轮审查对象是其上的未提交修复，不是只审 HEAD。
- 当前有效任务：`docs/tasks/A9_15_UI_PROGRESS_FEEDBACK.md`，`APPROVED_FOR_IMPLEMENTATION`，重点为 §14、§15 和 ADR-0121；实施前按 `AGENTS.md` 读取适用原始约束。
- 前序交接：`docs/plans/WIN7_28_REPAIR_HANDOFF.md`；本文只补充新发现，不取消仍适用的 H01～H08、F1～F4 要求。
- 最新审查：`/tmp/a9-w28-current-review-JZWepr/REVIEW.md`。
- 最新反例：`/tmp/a9-w28-current-review-JZWepr/review-probes.cjs`。
- 原始执行证据：`/Users/qlyf/a9-evidence/win7-28-h09-20260910/`，其中 run2 报告确为 84/84 PASS，52 个索引文件哈希一致；这不代表验收判据没有遗漏。

本文编写时重新核对过 6 个修复文件的 SHA-256，全部等于最新审查报告 §6。接手时先复核实际内容；不能因 HEAD 相同就假定 dirty 字节未变。临时审查路径如失效，依本文反例重建，并从原始证据的稳定副本恢复所需输入，不省略反例。

已证实有效的部分应保留：外置契约搬移及哈希检查、projection 缺契约拒绝、legacy 不加载契约、正式 fixture 的新增路由、非空其他会话无残留判定，以及现有 F1 / event_type / 空 pages / 固定时区统一错时负向检查。

本轮成功条件：下面 RF01～RF04 的原反例均被正确拒绝，合法场景通过，开发机与正式验收入口保持同一语义要求；交回可复验材料并准确列出未执行项。不能以 84/84、更多 PASS、测试退出码为 0 或已有“独立复验 PASS”文档替代它。

## 2. 范围与保护边界

1. 继续在现有 A9-15 §15 授权范围内修验收工具，不重开产品投影算法，不修改 Runner/Policy、native helper、生产 IPC 契约、SQLite schema、权限或 Alpha 2，不新增运行时依赖。
2. 当前 11 个跟踪修改包含 6 个验收工具文件和 5 个此前保留的文档修改。**不得按 `W28_INDEPENDENT_REVIEW.md` 中“提交 11 个文件”的建议整批暂存。** 特别是 `docs/DECISIONS.md` 的现有差异包含 Alpha 2 的 ADR-0117，不是本轮时间契约 ADR。
3. 保留既有 `docs/DECISIONS.md`、`docs/README.md`、`docs/STATUS.md`、`docs/prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md`、`docs/tasks/README.md` 的未提交内容；保留全部未跟踪的 Alpha 2、内存测量、远程连接、`.trae/` 和历史交接材料。需要在同一文档追加本轮内容时只改相关片段，不覆盖其他人的修改。
4. WIN7-25/26/27 及其他历史冻结候选、release 合同、构建树和证据均保持原身份/原字节，不覆盖、不改判。新 W28 是否已冻结必须在接手时核实；不能因为本次是验收工具修复就重绑冻结候选。
5. 本次交接不代替提交、推送、部署或外部放行授权。提交与构建依当前用户分配和有效合同执行，不推送、不代签；只暂存任务相关精确路径或必要片段，不使用 `git add -A`，不清理工作区换取 clean HEAD。
6. 仅需补治理或缺目标环境时，暂停依赖该项的动作，继续其他已授权修复。普通本地修复不以前置要求完成正式构建或 Win7 PASS；审查也可基于明确哈希的未提交快照进行。

## 3. 续修矩阵

RF 编号只用于本次交接，对应最新审查报告 R1～R4，不与历史 R4 协议兼容项混用。

| ID | 优先级 / 状态 | 主要修改面 | 最低关闭条件 |
|---|---|---|---|
| RF01 | P1 / missing | `a9-win7-28-smoke.cjs`、编排回归测试 | 正式入口必跑独立 retry，并对缺阶段/缺必需用例 fail-closed |
| RF02 | P2 / divergent | `a9-06-driver-entry.cjs`、阶段附件合同与测试 | 判定与导出直接使用正确时点的原始快照，错误即时状态不能被较晚重采样覆盖 |
| RF03 | P2 / partial | `a9-projection-contract.cjs`、`a9-win7-28-report.cjs`、driver、测试 | 分页成员、终态、查询身份、hasMore、观察详情及摘要一致；矛盾反例拒绝 |
| RF04 | P2 / divergent | 时间契约、采集端、报告器、测试及新增 ADR | 按事件日期处理受测时区偏移；冬夏正确时间通过、错一小时拒绝 |

建议顺序：先保存反例 → 明确最小证据字段变更 → RF01/RF02 → RF03/RF04 → 正负向和实际集成验证 → 交回原审查 agent。各步骤是执行顺序，不是完成一个就停止。

## 4. RF01：正式 smoke 接入 retry，按必需集合判定

### 根因

`release/win7-product-v3/a9-win7-28-smoke.cjs` 只编排 first、second、stop。共享 driver 已把查询故障重试移到 `A9_SMOKE_MODE=retry`，开发机 runner 已启动该进程，但正式脚本没有对应调用或报告校验。对“已有用例全部通过”的遍历不能发现整个 retry 用例缺失。

### 修复建议

- 在 second 完整退出后读取并校验 `second.retryTarget.conversationId`，以同一专用 dataRoot 和显式目标会话启动独立 retry 进程；fixture 在所有依赖阶段完成前保持可用，使用新的独立输出文件。
- 沿用现有测试侧一次性故障注入，不增加产品接口，不改真实故障/清理语义；不要移回同进程无限刷新方案。
- 把 retry 纳入正式阶段报告集合，检查文件存在、可解析、mode/protocol/目标绑定、进程退出码及报告状态。
- 显式要求关键 assertion（至少 `A9-15-QUERY-FAILURE-VISIBLE-RETRY`）存在且结果通过；缺失、重复或错绑不得因空数组 `.every()` 或 `allCases` 不完整而通过。以适用必需集合验证，不硬编码“最终一定 84 项”。
- 保留 developer runner 的同等要求；如果修正其汇总也发现缺报告可通过，一并在允许路径内修复，不以开发机路径较完整为由免检。

### 必须提供的证据

1. 正式编排的最窄行为测试：能观察到 first → second → retry 的依赖顺序，retry 目标来自 second，相关资源未提前关闭。可使用隔离进程替身/虚拟文件系统，不需要为这项单元检查绕过 win32 硬门。
2. 必须拒绝：不启动 retry、缺报告、错误 mode、缺 assertion、重复 assertion、零注入、错误会话、失败退出、重试未成功。
3. 实际开发机 retry 保留“一次命中→错误可见→真实点击→成功响应→恢复后无重复及内容正确”的原始记录。
4. 如尚无合规 Windows 候选运行环境，正式入口接线与编排行为可完成自检，但正式 Windows smoke 仍标 NOT_PERFORMED，不能用替身或开发机报告填成目标平台 PASS。

## 5. RF02：使用即时快照，禁止重新采样掩盖失败

### 根因与原反例

`runSecondProcess()` 已采集 `restoredEvents.restartObserved/restartBaseline` 和 `olderLoadObserved`，但 `runProjectionAcceptance()` 不读取它们：分页后重采样当作 restart，切换会话再切回后重采样当作 older_load。

实际函数的隔离反例中，将这两份即时快照设为空行、错误结果，较晚 UI 观察保持正确，全部断言仍通过且导出 60 行成功结果。必须修消费路径，不只是再增加字段或改注释。

### 修复建议

- restart 的断言、时间基准、DOM outcome/turn/逐行核对及导出，直接消费分页前采集的同一快照。
- older_load 同样直接消费最后一次相关分页完成、产品消化响应后且任何会话切换前的同一快照；不要在验收函数中再次读取当前 UI 替换该阶段值。
- resume/other_conversation 单独采集并绑定各自身份；最新持久化 turn ID 应来自该阶段实际 snapshot，不默认从 restart 复制到其他阶段。
- 采用最小、清晰的阶段记录，至少能关联 run/进程、conversation、stage、采集顺序、实际 rows/outcome/latest turn 和时间基准。采集时刻与导出时刻区分，不把写文件时间冒充观察时间。
- 缺阶段、无效阶段、采集失败或快照内容错误时保留诊断并失败；不得通过自动重新采样把错误观察抹掉。允许重试整个隔离场景，但要产生新 run，保留失败运行。
- 查询参考事实与该阶段必须相容；如一个会话在后续阶段真的新增了事件，明确各阶段的查询/终态边界，不能让变化后的全量事实反向替换旧阶段事实。

### 验收

- 用带区分标记的合法阶段快照证明输出来源是对应快照，而不是最后一次采样；不要求三个阶段的文字必须不同。
- 分别单改 restart、older_load、resume 的行、outcome、turn、阶段/会话绑定并重绑哈希，同一正向判定应拒绝。
- 特别保留“即时快照错误、后续 UI 已恢复正确”反例：不能通过，不能输出成功附件。
- 实际运行保存观察顺序：重启快照 → 真实分页响应 → 补载即时快照 → 会话切换/切回快照。UI 最近 60 行可以不变，不能以其变化代替分页完成。

## 6. RF03：分页事实之间必须交叉约束

### 根因

`validatePagingChain()` 只在 `terminal_events` 找旧失败，未确保该终态属于同页 `event_ids`。报告器又只比较报告与 paging 自己的身份，未交叉核对 `query.events`；部分字段缺失被视为“不是 false”，DOM 详情和 hasMore 也未完整参与判定。

### 修复建议

1. **成员与终态**：每个 terminal event 的 ID 必须属于该页完整成员集合；同页终态不能重复或与成员类型/turn 不符。旧失败的 event/turn/type 必须与独立查询的同一事件一致，不允许 paging 与报告同时自报一个不存在的 turn。
2. **首屏与页范围**：以该阶段完整参考查询核对首屏最新 300 个 ID、返回页范围及成员；若参考查询声明完整且时点一致，可直接计算给定 beforeEventId 应返回的页。测试的 query.events 只有 9 条、分页却自报 600 条的矛盾夹具应修正，而不是声明“真实数据天然一致”。
3. **计数与顺序**：所有必需计数/范围/布尔字段强类型校验，页大小不得超窗口；ID 升序、唯一、无跨页重复，游标严格连续且向旧事件推进。
4. **hasMore**：每页必须有真实布尔值；只有上一页 `has_more=true` 才能继续下一页。若已找到旧失败，可在 hasMore 仍为 true 时正常停止，不强迫无关的全历史耗尽；若声称已耗尽，需与参考数据一致。
5. **真实请求**：`request_observed` 必须显式为 true，缺失不能通过；保留实际 request/response 关联和采集顺序。观察边界名称只是声明，不能替代对应的观察记录。
6. **DOM 与摘要**：由绑定旧失败 task/turn 的 before/after 原始观察推导“补载前未加载、补载后已加载”。`blockFound=false`、仍有 legacy note、目标错绑等必须拒绝，即使便利布尔值声称成功。
7. **保持正确产品语义**：Provider 503 旧失败可以没有工具活动组；已加载判据不能硬要求工具子节点。沿用既有与该轮次绑定的有效语义信号，并交叉核对原始详情，而不是单独相信推导布尔值。
8. **共享判定**：driver 正向/负向、开发机 smoke、正式 smoke 及正式报告器走同一完整语义约束。语法 parse 和哈希验证仍需保留，但不能当作语义验证。

### 本轮必须拒绝的五个具体反例

| 反例 | 保留的伪成功信号 | 期望 |
|---|---|---|
| 从响应 `event_ids` 删除旧失败 ID 6，调整 count/pageCount | terminal_events 仍写旧失败 | 拒绝成员矛盾 |
| 修改 paging/proof/终态摘要的旧失败 turn，query 不变 | 三份自报 turn 相互一致 | 拒绝独立查询身份不符 |
| 第一补载页设 `has_more=false`，后面仍有三页 | 游标与 ID 仍升序连续 | 拒绝无后续页却继续的链 |
| after.olderObservable 设 blockFound=false、hasLegacyNote=true | older_failure_loaded_observable=true | 拒绝 DOM 与摘要矛盾 |
| 删除所有页的 request_observed | click_observed=true | 拒绝缺失实际请求证据 |

另保留空 pages、零条响应、失败页、旧失败在首屏、重复游标/ID、错会话、错误窗口、只用端点 ID 冒充成员集合、错误便利字段等已有反例。涉及附件变异时更新合法哈希绑定；不能只因旧 schema 或坏哈希被拒绝就算语义缺口修好。

## 7. RF04：时间基准按事件日期计算

### 根因与原反例

固定在 2026-01-15 的基准只能得到当日偏移，不能正确解释其他季节事件。`America/New_York` 的 `2026-09-10T10:15:20Z` 应显示 `6:15:20 AM`，当前判据拒绝正确值，却接受错一小时的 `5:15:20 AM`。

### 优先建议

- 从受测运行时按每个事件的 `timestamp_ms` 计算该时刻实际 UTC 偏移，绑定 event ID、timestamp、run/阶段；保留独立 12/24 小时格式信息。可评估使用该日期的 `Date#getTimezoneOffset()` 等已具备能力，不读取待验 DOM 来反推偏移。
- 或采用显式时区 ID、日期相关且可独立复算的基准合同。选择最小完整方案，明确由哪一侧计算、来源与校验边界，不能默认审查机和产品机同一时区。
- 不能只把固定一月改成“今天”：历史事件或同一次回看可能跨 DST 转换，仍需按事件时间处理。
- 不能通过允许 ±1 小时、放宽字符串比较、禁用时间验证、只测中国时区或强制修改机器时区消除失败。
- 期望值只从查询事实及独立运行时基准推导，不调用产品 Renderer 的标签格式化函数，不复制 DOM 文本作为期望。

### 验收矩阵

- 中国/固定 UTC 偏移：正确值通过，统一 +1 秒、+1 小时、单行错时拒绝。
- 纽约冬季与夏季：同一时区不同日期的正确值都通过；两季偏移互换均拒绝，必须保留上述实际反例。
- DST 转换前后：用明确 UTC timestamp 定义事件，覆盖跳时及重复本地小时，不能仅靠本地时间文字区分事件身份。
- 同一组历史事件跨季节/跨日、12/24 小时制、缺基准/无效基准/错事件或阶段绑定均有正负向检查。
- 测试使用显式 timeZone 或独立测试子进程环境，不修改系统时区或安装新依赖；目标 Win7 的运行时证据依旧单列。

## 8. 格式治理、历史回归与未执行项

### 格式治理

DOM schema 已由 2 改为 3，但当前只在注释引用 ADR-0122，未找到对应正式 ADR。继续修改必填字段或语义前，核对可用 ADR 编号，按现有任务授权记录实际技术决定；不能把现有 Alpha 2 ADR 草稿当成本轮记录，也不能改写 Accepted ADR-0121 正文。

明确新的字段/版本/兼容政策，并同步共享契约、采集端、报告器、正负向夹具和 W28 验收说明。若 RF02/RF04 引入后续格式变更，按项目规则处理，不为了让旧附件继续通过而静默改变旧版本含义。旧证据保留其原版本和历史结论。

`scripts/release/gen-w28-report.cjs` 可能重写 W28 报告器；不要盲目运行覆盖修复。如继续使用生成链，核对该路径授权并验证生成结果保留全部修复，不把文件已存在当作白名单许可。

### H07/H08 与外部 Gate

- H07 现有证据只证明 W25 提示路由的 macOS first/second 兼容，不等于 W23/W24 全部运行。对缺失 profile 补最窄的隔离协议回归；不修改历史 release 文件。目标平台不可用时分别列出未执行 profile 和运行边界，不扩写为全通过。
- H08 无安全接缝时继续 NOT_PERFORMED，并说明影响哪个用例/签发条件；不通过故意留下失控进程、削弱 containment 或增加生产旁路制造证据。
- 双干净候选构建、候选外独立 authority/pin、正式 Windows smoke、普通用户非提升 Win7 当前候选验收仍与本轮开发机修复分开。没有执行就不签发 PASS，不自行改判历史候选。
- 原始审查和执行报告保留；用新交回材料更正过高的关闭结论，不抹除先前 84/84 或失败记录，不继续使用“11 文件一起提交”的建议。

## 9. 执行验证与交回材料

先把本轮反例落成可维护的回归，再修实现。`/tmp/.../review-probes.cjs` 是诊断脚本，其退出码 0 只表示探针执行成功；必须读取 `accepted`、阶段来源及 DST 正反向结果。移植时明确写出应接受/应拒绝断言，不将脚本正常退出当作缺口关闭。

按改动风险执行定向检查；相关共享契约/profile 变更完成后执行一次 package suite 回归，成功且输入未变不重复跑。已知入口：

```sh
node --test --test-name-pattern='WIN7-28' scripts/release/test/a9-package.test.mjs
node --test scripts/release/test/a9-package.test.mjs
node --check release/win7-product-v3/a9-projection-contract.cjs
node --check release/win7-product-v3/a9-win7-28-report.cjs
node --check release/win7-product-v3/a9-win7-28-smoke.cjs
node --check src/shell/tests/product/a9-06-driver-entry.cjs
node --check src/shell/tests/product/run-a9-06-electron-smoke.mjs
npm run docs:check
git diff --check
```

对真实 Electron 场景和正式编排行为另行取证，按脚本实际参数保留证据根并使用新的输出路径，不覆盖 run2。保持本机审批/沙箱限制；不要照抄旧材料清除安全 shim 的命令。先读实际运行时版本/ABI；本次审查宿主为 Node 20.17.0 / ABI 115、NODE_OPTIONS 未设置，不应盲目认定只有旧交回材料中的 Node 20.10.0 才能运行。Electron 及原生模块仍按锁定兼容合同匹配，不因此升级依赖。

完成后在新的候选外稳定目录保存材料，交回本对话：

1. 实际分支、起止 HEAD、修复文件的前后 SHA-256、最终 git status、任务相关 diff/提交；声明未触碰哪些受保护内容。
2. `RF01-RF04-TRACEABILITY.md`：逐项列函数、测试名、修复前反例、修复后正负向结果、实际场景及未执行项。
3. 可一条命令复现的回归及原始 stdout/退出码，包含“当前有效 schema + 合法重绑哈希”的语义反例；新 schema 不兼容旧格式本身不能代替反例。
4. 正式编排测试的实际启动顺序、目标传递、缺阶段/缺 assertion 拒绝记录；实际运行的 first/second/retry/stop 报告分别保留。
5. 分页前/即时补载/切回各阶段的原始快照、时间基准、查询和分页请求响应；提供 run/会话/阶段/时间或顺序关联及附件哈希索引。
6. 固定时区、DST 正反向和事件日期绑定的可复算样本；无需泄露用户数据、完整 payload 或秘密。
7. H07 各 profile 的实际覆盖清单，H08/构建/authority/目标平台未执行项及具体原因；自检结论只说明完成范围，不自称已获原审查方独立验收。

## 10. 原审查 agent 的后续独立验收

执行完成后把交回路径、源码 diff/提交和未执行清单发回原对话。原审查 agent 将重新核对实际字节和证据，不只读执行总结或另一份 PASS 文档。

独立验收重点：

| 项 | 原审查方将独立验证 |
|---|---|
| RF01 | 从正式入口省略 retry 或必需 assertion 时必须失败；正常编排和目标绑定有效 |
| RF02 | 错误即时快照 + 正确后续 UI 仍必须失败；导出的内容确实来自对应时点 |
| RF03 | 逐一重构本轮五个矛盾样本，重绑合法引用后仍拒绝；真实合法页链通过 |
| RF04 | 正确夏令时时间通过、错误冬令时偏移拒绝；跨季节历史组与原统一错时反例无回归 |
| 不回退 | H01/H02/H05、F1 和现有安全/兼容边界保留，Alpha 2/冻结候选未被混改 |
| 证据口径 | 测试替身、开发机、候选构建、外部放行、普通用户 Win7 各层不混用；未执行项未改写为 PASS |

RF01～RF04 全部通过且相关回归有效后，可以确认本轮验收工具修复通过独立复核；H07/H08 或目标平台证据仍缺时应在同一结论中明确列出，不自动升级为整个 F3/F4、Win7、Alpha 或 RC PASS。审查发现新问题时继续交回具体反例，而不是要求机械提高测试数量。

## 11. 可复制给执行 agent 的任务文字

请依据 `/Users/qlyf/Developer/win7-coding-Agent/docs/plans/WIN7_28_FOLLOWUP_REPAIR_HANDOFF.md`，在当前 A9-15 §15 有效授权内继续修复 WIN7-28 的 RF01～RF04：正式 smoke 接入独立 retry 并校验必需集合；将正确时点快照接入真实判定与导出；补齐分页成员/终态/查询/hasMore/DOM 观察一致性；按事件日期处理时区与夏令时。先核对 dirty 基线和文件哈希，保留已有效修复、Alpha 2 草稿、内存测量材料及全部历史冻结资产，不扩大到生产运行时或权限改造。保存原反例并完成正负向回归及适用集成验证，补齐实际格式治理记录，纠正 H07 覆盖和整批提交建议；H08/目标平台无条件时如实保留 NOT_PERFORMED。不要只修 PASS 摘要、修改断言名称或放宽错误判据。完成后按本文 §9 交回代码差异、哈希、原始证据和未执行项给原审查对话，由原审查 agent 做后续独立验收，不自行代签或推送。

# WIN7-28 验收工具修复交接书（55d9d5f 独立复核后）

日期：2026-09-10

文档状态：HANDOFF_FOR_ASSIGNMENT（供负责人交给其他 agent；本文件不是新增实现批准记录）

目标：修复本次独立复核发现的 5 项问题，继续完成查询失败重试及适用的历史协议回归；保留所有未执行项，形成可独立复验的代码、原始证据与交付清单。不得以增加 PASS 数量、删除用例、降低断言或重命名状态代替修复。

## 1. 接手结论与事实基线

- 仓库：`/Users/qlyf/Developer/win7-coding-Agent`。
- 分支：`codex/ui-optimization`。
- 本文核对的 HEAD：`55d9d5f7bec009c62a1f508c8b7bed0946ba6aae`。
- 当前任务：`docs/tasks/A9_15_UI_PROGRESS_FEEDBACK.md`，状态 `APPROVED_FOR_IMPLEMENTATION`，Phase-Gate 为 `A9_15_WIN7_28_ACCEPTANCE_GAP_REPAIR_AUTHORIZED`；重点读 §14、§15。
- 前序方案：`docs/plans/WIN7_27_ACCEPTANCE_GAPS_REPAIR_PLAN.md`。本文是对该方案在 `55d9d5f` 上的继续交接，不替换其仍有效的验收要求。
- 独立复核报告：`/tmp/a9-w28-review-0CwOcR/REVIEW.md`。
- 独立反例脚本：`/tmp/a9-w28-review-0CwOcR/review-probes.cjs`。
- 现有开发机 smoke：`/tmp/a9-06-w28-smoke.json`，独立复核读取确认 `FAIL`、78/79；失败项为 `A9-15-QUERY-FAILURE-VISIBLE-RETRY`。
- 本次复核对应附件目录：`/var/folders/3z/wj46qg4j2pn2fwgtccdj093m0000gn/T/a9-el-smoke-1AVcqn/projection-evidence`。
- 提交者提供的历史尝试归档：`/Users/qlyf/.codex/a9-release/20260910-32c5f6b/w28-attempts/`；按原始材料保留，不覆盖。其内容并未在本轮文档编写中逐份重审。

上述临时路径只是证据入口，不是持久可用保证。接手后先检查存在性，将必要证据复制到新的候选外稳定目录并建立哈希索引；临时文件失效时，依据下文的具体反例在基线副本中重建，不删除相应验收要求。不要将历史失败附件直接改成修复后的“成功附件”。

已有修复应保留：错误 DOM outcome、错误 latest turn ID、缺失 `event_type` 已能被对应语义校验拒绝。审批/拒绝/非零退出/工具错误已有开发机场景，需保持其有效性并补齐正式入口；不能据此宣布整个 F3 关闭。

## 2. 授权、文件保护与非目标

接手时重新核对实际分支、HEAD、dirty 状态、任务状态、允许路径及是否已有新候选冻结。正文行号以 `55d9d5f` 为准，后续按函数定位。

1. 按 `AGENTS.md` 读取 `docs/WIN7_CONSTRAINTS.md`、当前任务书和适用 ADR-0121。原方案将 WIN7-28 写为待批准建议的历史描述，已由后来的 A9-15 §15 明确授权取代；不要仅凭旧方案重复申请同一候选编号。
2. 本次用户只要求编写交接文档；接手 agent 在负责人分配实施任务后，按现有有效合同完成范围内修复。本文不扩大 C14 白名单，也不为已获准的普通编辑添加新的批准前置条件。
3. 保留当前已有修改：`docs/DECISIONS.md`、`docs/README.md`、`docs/STATUS.md`、`docs/tasks/README.md`、`docs/prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md`；保留未跟踪的 `.trae/`、`docs/REMOTE_WINDOWS_CONNECTIONS.md`、两份 WIN7-25/WIN7-27 修复方案及 `docs/tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md`。这些不是可清理内容，不混入修复提交。
4. 不重写已验证的 Renderer 投影算法；不修改 native helper、Runner/Policy、生产 IPC 契约、SQLite schema、权限、秘密边界或 Alpha 2 功能，不新增运行时依赖。
5. WIN7-25/26/27 及其他冻结候选的源码身份、ZIP、manifest、kit、lock、authority、构建树和原始证据均保持不可变；历史 W23/W24/W25 `release/**` 合同保持原字节。共享 driver 的兼容修复不得靠修改历史合同解决。
6. 提交者表示 WIN7-28 尚未正式构建；本文未重新盘点全部外部构建目录。接手时核实后，未冻结的 W28 验收工具继续在现有授权下修复；若已产生冻结候选，保护其身份并报告后续候选决策，不覆盖或自行改判。
7. 提交与构建按当前用户分配和任务书已有授权执行；本地提交不得混入 Alpha 2，不推送，不 `git add -A`，不以丢弃修改换取干净 HEAD。外部 authority/pin 不由执行 agent 自行签署；Win7 部署和普通用户实机验收依适用授权与 Gate 执行。

## 3. 工作项索引与关闭标准

下列 H 编号只用于本次交接，不替换任务书 F1～F4 或历史 R4。

| ID | 优先级 / 当前状态 | 对应合同及位置 | 必须交付的可观察结果 |
|---|---|---|---|
| W28-H01 | P1 / missing | 外置 driver 依赖闭包；smoke、driver、builder | 脱离源码树的外置启动可解析全部依赖；legacy 不被 projection 模块强制依赖破坏 |
| W28-H02 | P1 / missing | F3/F4；正式与开发机 fixture | 正式 W28 fixture 能驱动全部新增场景，与 driver 提示协议一致 |
| W28-H03 | P2 / divergent | F2；共享契约、DOM/查询导出、报告器 | 时间由独立运行时基准核对，统一错时不再被吸收为时区偏移 |
| W28-H04 | P2 / partial | F4；分页采集、报告器 | UI 实际分页请求/响应与旧失败成员身份绑定，不能靠摘要布尔值通过 |
| W28-H05 | P2 / divergent | F2 / W28-03；会话切换断言 | 其他会话自己的非空行通过，任何原会话残留行被拒绝 |
| W28-H06 | P2 / partial，已有 FAIL | F3 / W28-04；查询故障与重试 | 实际失败一次、错误及重试入口可见、UI 重试成功且无重复/内容错绑 |
| W28-H07 | 必需回归 / unverifiable | 历史 R4；W23/W24/W25 legacy 协议 | 当前共享 driver 与历史 fixture 的实际运行协议兼容，非仅构建成功 |
| W28-H08 | 保留缺口 / unverifiable | F3；cleanup 未确认 | 有安全接缝则分项取证；没有则明确 NOT_PERFORMED 与受影响 Gate，不伪造 PASS |

## 4. W28-H01：外置 driver 的完整依赖闭包

当前根因：`a9-win7-28-smoke.cjs` 的 `prepareDriverRuntime()` 仅把 driver 复制到 `runRoot/driver-app/main.cjs`，未复制共享契约。`a9-06-driver-entry.cjs` 的 `loadProjectionContract()` 在模块初始化无条件执行，只寻找自身同级或源码仓库相对路径。构建器将契约放在候选 `validation/` 并不足以保证外置运行可用。

基线反例：用实际准备函数及 driver 初始化片段模拟正常外置目录，projection 和 legacy 都报 `A9_PROJECTION_CONTRACT_UNAVAILABLE`。这是内存布局/模块加载复现，不是 Windows 运行记录。

实施要求：形成显式、可核对的依赖搬移/解析合同。可以按协议按需加载，或采用授权范围内的其他最小完整方案；不要通过搜索任意本机路径、依赖开发仓库存在或修改历史 release 文件掩盖缺失。

验收至少包括：

- projection 外置目录具备相符契约，脱离源码树可加载；缺契约时明确 fail-closed，不能回退成 legacy 而跳过验收。
- 缺省 legacy 不需要不存在的 projection 依赖；历史协议运行仍有效。
- 候选 `validation/` 与候选外 `driver-app/` 两层闭包都被检查，复制后的文件有哈希核对。
- 先完成纯布局/模块加载回归，再在适用环境运行外置 Electron 入口；开发机路径模拟不能标成 Win7 PASS。

## 5. W28-H02：正式 fixture 与新增场景一致

位置：`release/win7-product-v3/a9-win7-28-smoke.cjs:createJourneyFixture`，对照 `src/shell/tests/product/run-a9-06-electron-smoke.mjs`。

正式 fixture 当前只识别 cleanup、verify again、produce latest verified。以下四个新提示在基线纯路由探针中均回落为 `read calc.ts`，而非要求的操作：

| 提示 | 正式 fixture 必须产生的行为 |
|---|---|
| `run failing shell command` | 通过受批准 Runner 执行 Windows 兼容的确定性非零退出命令；记录实际 exit code |
| `trigger tool error` | 在测试专用目标上产生可重复的工具错误，独立于 Provider 503 与非零退出 |
| `approve the high impact operation` | 为预先创建的 `approve-target.tmp` 产生精确审批，实际批准后执行恢复工具活动 |
| `generate bulk history events` | 不同参数的只读工具活动，足以形成首次 300 条范围之外的旧失败 |

补齐正式工作区输入；批准/拒绝目标分开创建、逐项清点，经真实目标绑定审批处理，不操作用户文件。拒绝的存在性/字节哈希/大小检查、审批决定与恢复工具的 conversation/task/turn/工具目标绑定及顺序均保留。

批量历史必须等待每轮真实终态并绑定新 turn ID；以实际首屏 `limit=300`、`hasMore` 与旧失败是否被排除来判定前提，不以较大的取证 limit 或硬编码总条数判断。不可降低产品循环守卫；不同只读参数用于构造有区分的测试事件，不作为绕过真实业务守卫的方法。

正向同时覆盖开发机和正式 fixture 的协议路由；负向覆盖未知提示误回退、缺输入目标、未产生恢复工具事件、错误轮次/目标/顺序、失败被显示成 verified success。不能以 HTTP 200 或源码存在某字符串认定场景执行。

## 6. W28-H03：时间的独立核对

位置：`release/win7-product-v3/a9-projection-contract.cjs:timestampsConsistent/rowsMatchQuery`，以及 driver 导出和 `a9-win7-28-report.cjs` 的附件解析。

基线反例：查询事实保持不变，将 restart、older_load 的全部实际 DOM 时间统一加 1 秒，保留 ID/turn/type/标签并重算附件哈希，`validateOutcomeProjection()` 仍接受。首行反推 offset 只能证明相对时间自洽，不能证明显示时间正确。

实施要求：从受测运行时独立记录时区/格式化基准，结合持久化 `timestamp_ms` 推导期望时间；不能从待验 DOM 首行自我校准，也不能假定审查机与产品机同一时区。基准需绑定 run/阶段及相应事件；跨日、12/24 小时制和时区转换的处理需明确，避免将格式差异误判为语义错误。

若新增必填字段或改变附件语义，按项目规则版本化并新增 ADR；driver、正式报告器、测试和说明同时更新，不改写 Accepted ADR。既有 F1 和逐行类型/标签判定保持有效。

同一正向函数必须拒绝：整列加 1 秒、整列加 1 小时、仅一个阶段错时、单行样本错时、时间缺失和无效时间；正向覆盖正确时区转换及跨日。负向使用当前有效 schema 并重新绑定哈希，不能仅靠旧 schema 失效证明修复。

## 7. W28-H04：实际分页证据闭环

位置：`a9-06-driver-entry.cjs` 的 pagingFacts；`a9-win7-28-report.cjs:parseQueryExport/validatePagingProjection`。

当前缺口有两层：driver 点击按钮后另用独立 cursor 调用 `api.queryEvents()`，并未采集按钮实际响应；报告器主要信任摘要，只检查存在首屏 hasMore 和非空游标。现有 query.pages 的 1000+228 全历史读取，与 paging.pages 的 300/300/300/28 是不同查询链。

实施要求：

1. 通过隔离测试实例中的既有 IPC 观察边界记录 Renderer 发出的真实分页请求及对应响应；不修改生产 IPC/Renderer API，不绕过审批，不把观察行为变成产品高权限接口。
2. 显式区分独立全历史参考查询与产品 UI 分页请求，不能把两者字段混写为同一证据。绑定 request/run/conversation/阶段，保持可关联的因果顺序。
3. 从逐页实际响应推导计数、返回 ID 集合、首尾范围、limit、beforeEventId、hasMore 和成功/失败；校验页内顺序与唯一性、严格向旧事件推进、游标连续性及去重合并。
4. 首屏确为产品 300 条窗口且 `hasMore=true`，旧失败不在首屏；旧失败 event/turn/type 必须属于后续实际成功响应，并进入产品已加载历史或可观察的对应旧轮次内容。仅知道数据库里存在旧失败不够。
5. 首次重启状态在分页前采集；补载即时状态在会话切换/其他重载前采集；随后单独采集切换及切回状态。字段名 `stage` 不能替代真实采集时序。
6. Inspector 只显示最新 60 行，补载旧页时它可以完全不变。不要等“最近 60 行变化”或“按钮消失”作为每页成功的唯一信号；按实际请求完成/新增历史事实判断，避免空等与多消费一页。
7. `pageHasOlderFailure`、`controlConsumed`、`pageCount` 等便利字段只能由已验证的事实推导或与其一致，不是可独立填 PASS 的事实源。无法形成观察证据时该用例不得通过。

必须拒绝的反例：

- 清空 paging.pages/pageEventIds、pageRounds=0，仅保留原 PASS 摘要。
- 返回计数为 0、首尾 ID 为 null，仅保留 hasMore 和游标。
- 响应页 `ok=false`、无旧失败，但摘要宣称成功。
- 点击未发请求、重复游标、页范围不推进、跨会话响应、旧失败不属于补载页、仅端点 ID 冒充完整成员集合。
- 页计数/范围/hasMore 与实际响应矛盾，重复合并事件，补载后最新结果回退，或把切回后的状态冒充补载即时状态。

所有反例须走 driver 正向断言及正式报告签发所使用的语义验证路径。语法可解析、附件哈希一致、单独 API 能查询到旧记录均不能替代本项。

## 8. W28-H05：会话残留判定

位置：`a9-06-driver-entry.cjs` 的 `noResidue`，共享契约 `crossSessionResidue()`。

当前 helper 判断“是否有不在 allowedEventIds 中的行”，调用方却把原会话 ID 当 allowed 并取反。结果：其他会话只显示原会话行时误通过，显示自己的新 ID 时误拒绝，空会话则掩盖错误。正式报告器另一处“不与原会话 ID 相交”的检查方向正确，应保留。

修复以“其他会话 DOM 与原会话 ID 无交集”为目标，明确 helper 的语义与调用场景，不随意反转所有调用。正向使用非空第二会话，负向注入原会话行、混合残留行与缺失身份行，随后切回验证原会话完整内容和结果恢复。保留空会话作为边界样本，但不能以它单独证明隔离。

## 9. W28-H06～H08：剩余集成项

### H06：查询失败后的可见重试

现有失败证据：`injectedCount=0`、`errorVisible=false`、`clickedRetry=false`，即使 `recovered=true` 也没有经历真实恢复。源码中同会话 `refreshSnapshot()` 不保证重新查询历史；绕过 Renderer 直接调用 IPC 不会自动写入其私有 `eventsError`。没有证据证明 F3 与 F4 在产品上必然互斥，当前是用例共享状态/执行顺序的问题。

优先方案：为 retry 使用独立测试进程，在前一进程完全关闭后复用专用测试数据集；在加载产品入口前安装一次性、绑定目标 conversation 的查询失败替身，对 Renderer 初次历史加载触发失败。随后实际点击“重试加载”，确认第二次查询成功、错误消失、事件无缺失/重复、内容与最新结果正确。另一可行方案可由执行 agent 自行选择，但必须产生同等证据且不新增产品接口。

必须记录：注入点、目标、命中次数、请求/响应顺序、失败前后 UI、真实点击、恢复结果和对照查询；标注 `TEST_DOUBLE_NOT_REAL_OS_FAILURE`。不通过“缺少控件就跳过”、写入私有状态、无限刷新或关掉断言修复。负向包括零命中、重试仍失败、未点击、重复事件和恢复内容错绑。

### H07：历史 R4 协议运行回归

至少覆盖任务书要求的 W23/W24/W25 缺省 legacy 路径：当前共享 driver 从外置运行目录启动，与未改动的历史 fixture 协议交互，记录实际提示序列、fixture 响应和关键断言；不得发送 projection 专用提示。其他受共享初始化变更影响的 profile 按实际依赖增加最窄回归。

可以在新的隔离 fixture/候选副本中验证兼容性，不对冻结候选重签 PASS。模块加载通过、历史 profile 构建通过或字符串扫描都不等于协议运行通过。环境缺失时记 NOT_PERFORMED，明确缺少什么，不编造兼容结论。

### H08：cleanup 未确认

先检查既有安全测试接缝。若能在隔离实例中构造清理未确认，单独证明诊断/持久化/UI 不被标 verified success，标清替身证据等级。不能用正常取消、Provider 失败或 shell 非零退出替代未知清理。

如无安全接缝，按 A9-15 §15 保留 NOT_PERFORMED，说明缺少的接缝、最小建议与所需授权，仅暂停依赖该证据的签发动作；继续其余已授权修复。不得因此自行修改生产清理保证、开高权限测试接口，或将整个 F3 宣告关闭。

## 10. 修改面与执行顺序

主要文件均以任务书允许范围为准：

- `src/shell/tests/product/a9-06-driver-entry.cjs`、`run-a9-06-electron-smoke.mjs`：采集、协议、场景与断言。
- `release/win7-product-v3/a9-projection-contract.cjs`、`a9-win7-28-report.cjs`、`a9-win7-28-smoke.cjs`：共享语义、正式校验与外置运行。
- `scripts/release/test/a9-package.test.mjs`、`scripts/release/build-a9-product-v3.mjs`：正负向回归、新 W28 闭包与合同。
- W28 验收说明、lock/integrity/CMD、必要任务补充和新增 ADR：只在实际合同变化时同步，不顺带改历史文件。

注意：仓库存在 `scripts/release/gen-w28-report.cjs`，它会从 W27 模板重写 W28 报告器。不要默认运行它覆盖手工修复；如继续维护该生成链，先核对其路径授权，并保证生成结果不会恢复旧缺口。文件已经存在不自动构成扩大白名单的许可。

执行次序：

1. 接手快照与失败基线；将本文反例纳入可维护的定向测试，保留修复前误接受/启动失败记录。
2. H01/H02：先打通完整外置启动与正式场景协议。
3. H03/H04/H05：确定最小版本化证据契约，再同步 driver、报告器和正负向测试。
4. H06/H07/H08：隔离 retry，完成历史协议运行；清理未确认按安全接缝处理。
5. 对真实新产出的附件执行完整适用语义校验，不以单独 parse 函数作为验收结果；fixture 身份验证与正式 authority 验证明确分开。
6. 完成适用检查、候选构建前核对，再按有效授权推进干净构建和独立复验。切片是顺序，不是第一项通过就停止；实际阻塞只暂停依赖动作。

若负责人安排多个执行 agent，先划分文件所有权：共享契约/schema、driver/两个 fixture、report/builder/tests 是有耦合的修改面，不应分别无协调地更改同一文件。主集成人确定字段合同，保留其他 agent 修改，再统一集成验证；本文件不要求必须多 agent。

## 11. 验证与证据分层

以下命令在仓库根执行。修改后执行相关命令；成功且输入未变不重复运行。不因本交接文档本身启动 GUI 或全量产品测试。

```sh
git status --short
git branch --show-current
git rev-parse HEAD
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

上面的完整 package suite 是共享 driver/builder/profile 改动后的受影响回归，不是整个产品全量测试。shell lint/契约测试按实际改动及任务书补充。真实 Electron、外置正式 smoke、历史协议运行各有独立场景记录；检查本机实际 Electron 22.3.27 / ABI 110 及原生输入，复用现有兼容 runtime，不顺便升级依赖。运行前读取脚本当前参数，使用 `--keep-root=1` 等已有证据保留选项和新的输出路径，避免覆盖旧报告。

取证时区分：

| 层级 | 能证明什么 | 不得替代 |
|---|---|---|
| 纯函数/模块/布局回归 | 判据拒错、协议路由和依赖解析 | 实际 Electron、Windows 行为 |
| 开发机真实 Electron fixture | 实际 main/preload/IPC/Renderer 链路及替身场景 | 真实 Provider、Win7 当前候选 |
| 干净双构建与完整性 | 源码/输入/产物绑定、闭包和可重现性 | 产品行为或普通用户实机 PASS |
| 外部放行和普通用户 Win7 | 当前精确候选的适用目标平台验收 | 历史候选重判、Alpha/RC 越级结论 |

基线复核只重跑过 1 个匹配的 WIN7-28 顶层测试（16 个跳过），以及 docs:check；78/79 是读取既有 smoke，不是复核重新跑出的 GUI 结果。接手后的结果另列 run ID、实际命令、环境、PASS/FAIL/SKIP 数量与退出码。

## 12. 交回材料与最终口径

将原始输出保存在新的候选外稳定目录，提供绝对路径、SHA-256 和索引；不要将日志、数据库或截图随意装入候选。

1. 起止 HEAD、分支、最终 git status、任务相关 diff/提交清单；明确未动的 Alpha 2 和历史资产。
2. `W28-H01`～`H08` 逐项映射到函数、测试、基线反例、修复后结果及原始证据。保留 F1 正向及负向回归，不能因本轮未新增 F1 问题就移除原要求。
3. 可单命令复现的正负向测试，特别是统一错时、空/失败分页、会话残留、外置缺契约和 retry 零命中。
4. 真实查询/snapshot/DOM、阶段顺序、分页请求响应、审批/目标前后事实、retry 命中与恢复证据；脱敏、有界、身份完整。
5. 开发机与正式 fixture 协议结果、外置运行记录、legacy 实际协议回归、正式报告器对真实附件的语义验证结果。
6. 所有检查结果及 NOT_PERFORMED 的原因、影响和具体下一步。不得把“有文件”“可解析”“recovered=true”直接改写为场景 PASS。
7. 已获准并执行构建时：两份独立干净来源、源码提交、输入锁、ZIP/manifest/kit 哈希、闭包及一致性结果；外部 authority 与普通用户 Win7 项目单列，不代签。

关闭口径：H01～H07 必须有对应成功证据，H08 只有实际覆盖后才可关闭；若其按合同保持 NOT_PERFORMED，明确交付是“已完成哪些工具修复、仍缺哪些验收证据”，不能写“全部 F1～F4 完成”或“仅剩一个问题”。提交/构建完成同样不代表 Win7 或 Alpha/RC PASS。执行 agent 的自检不替代独立复验。

## 13. 可直接交给接手 agent 的任务文字

请依据 `/Users/qlyf/Developer/win7-coding-Agent/docs/plans/WIN7_28_REPAIR_HANDOFF.md`，继续修复 `55d9d5f` 独立复核发现的 WIN7-28 验收工具问题。先核对当前仓库、分支、任务书及冻结状态，在 A9-15 §15 有效授权和允许路径内实施，保护 Alpha 2 未提交修改与历史候选。先保存反例，再修复外置依赖闭包、正式 fixture、时间独立核对、真实分页证据绑定、会话残留方向，并隔离完成查询失败重试与历史 legacy 协议运行回归。清理未确认没有安全接缝时保留 NOT_PERFORMED 并说明影响，不扩大生产权限或篡改守卫。不要只修 PASS 摘要、放宽判据或删掉失败用例。按本文 §12 交回可复现代码和原始证据，准确区分开发机、构建、外部放行与普通用户 Win7 结果。提交和构建遵守当前有效授权，不推送、不代签、不改判历史候选；遇到实际阻塞只暂停依赖工作，其余已授权修复继续。

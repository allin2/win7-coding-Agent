# WIN7-27 复核 F1–F4 修复追踪与交回状态

日期：2026-09-10（第二轮）
依据：`docs/plans/WIN7_27_ACCEPTANCE_GAPS_REPAIR_PLAN.md`、ADR-0121、A9-15 §15
基线：`32c5f6b0443a1f82eb4c24179378bca7ec954d69`（`codex/ui-optimization`）
复核报告：`/tmp/a9-w27-review-upl8xm/REVIEW.md`，反例脚本同目录 `review-probes.cjs`
方案第 9 节基线：`/tmp/a9-w28-baseline/review-probes-baseline.json`（归档见候选外交付目录）

状态：**F1/F2/F3（除"查询失败后重试"一项）/F4 已实现并有真实执行证据；WIN7-28 候选合同文件已生成
但未做双干净构建；不得认定闭环。** 全部自检完成后按方案第 9 节交回独立验收。

## 1. 失败基线（已复现并归档）

`32c5f6b` 上逐项确认复核四项缺口成立：5 个语义破坏探针被 ACCEPTED（DOM 结果矛盾、最新 turn 指向旧
失败、DOM 文本完全无关、结果与 turn 字段缺失），4 个对照正确 REJECTED；driver 身份/内容断言在全部文本
被替换后仍为 true；归档 smoke 中审批恢复无 `tool_start`、`olderLoad` 为 `FULL_HISTORY_ALREADY_LOADED`
且无按钮无变化、无 retry 用例。

## 2. 已交付实现

| 文件 | 作用 |
|---|---|
| `release/win7-product-v3/a9-projection-contract.cjs` | 共享投影契约（driver 与报告器同一实现）：`rowsMatchQuery` 为正向断言与全部负向变异共用的唯一函数；`expectedRowLabel` 仅由查询事实推导；`timestampsConsistent` 以首行推导本机偏移后要求逐行时间自洽；`rowMutationSamples` 含内容类、时间类与身份类变异 |
| `release/win7-product-v3/a9-win7-28-report.cjs` | WIN7-28 报告器（由 `scripts/release/gen-w28-report.cjs` 从 W27 锚点式生成）：投影附件 schema v2；强制校验 DOM `displayed_outcome`/`latest_persisted_turn_id`/`stage`；逐行内容与时间核对；新增 W28-10 分页校验 |
| 同上其余 WIN7-28 文件 | `a9-15-win7-28-input-lock.json`、`a9-package-integrity-w28.cjs`、`a9-win7-28-smoke.cjs`、`RUN_A9_15_W28_INTEGRITY.cmd`、`RUN_WIN7_28_REPORT_VERIFY.cmd`、`A9_15_WIN7_28_VALIDATION.md`（验收说明为初稿） |
| `src/shell/tests/product/a9-06-driver-entry.cjs` | 接入共享契约；导出 schema v2 附件（含 `display` 脱敏事实、`pages` 真实查询事实、`stage`）；失败类型分项；拒绝字节哈希；批准路径恢复工具活动；真实分页；IPC 主进程一次性故障注入接缝 |
| `src/shell/tests/product/run-a9-06-electron-smoke.mjs` | fixture 支持投影协议新场景；批量轮次使用互不相同的只读 `search` 参数 |
| `scripts/release/build-a9-product-v3.mjs` | WIN7-28 profile、候选集合、kit（10 用例）、provenance、共享契约模块随候选打包 |
| `scripts/release/test/a9-package.test.mjs` | WIN7-28 用例：正向 PASS + 17 项语义负向 |

### F1 关键实现
`parseDomExport` 强制要求 `stage`（须等于槽位）、`displayed_outcome`（非空字符串）、
`latest_persisted_turn_id`（字符串或 null）；`validateInspectorProjection` / `validateOutcomeProjection`
把它们与查询导出的最新终态、snapshot 独立采集的 turn 身份交叉比较；报告平行字段必须等于附件推导值。

### F2 关键实现
契约 `expectedRowLabel` 由查询事实（类型、time、turn/call/step 及被显示的 payload 字段）独立推导；
`rowsMatchQuery` 逐行比较 event ID、turn ID、event_type、文本内容与顺序、去重，并对时间做偏移自洽校验。
已用归档真实 DOM 文本逐类型核对一致（`任务失败 · Server returned status 503…`、`读取 calc.ts …`、
`审批已拒绝 · delete`、`任务完成 · completed`、默认类型回退等）。

## 3. 真实执行结果（开发机 Electron smoke，macOS）

**78/79 PASS**，四阶段 `workspace_select`/`first`/`stop` 均 PASS。

| 用例 | 结果 | 关键观察值 |
|---|---|---|
| INSPECTOR-PERSISTED-EVENTS | PASS | 逐行等于查询有界范围 |
| INSPECTOR-ROW-CONTENT | PASS | 内容由查询事实独立推导后逐行一致 |
| INSPECTOR-ASSERTION-NEGATIVE-CHECKS | PASS | 缺行/乱序/重复/跨会话残留 + 内容替换/交换文字/替换工具摘要/挪入他轮标签/错误时间/丢失 event_type 共 10 项全部被同一函数拒绝 |
| DOM-OUTCOME-TURN-IDENTITY | PASS | DOM 结果与最新 turn 身份与查询一致 |
| APPROVAL-ORDER-BEFORE-RESUME | PASS | 批准路径真实出现恢复后的 `tool_start`，且决定更早、绑定同一 turn 与工具目标 |
| DENY-ZERO-TARGET-SIDE-EFFECT | PASS | 目标存在性、字节哈希、大小前后不变 |
| FAILURE-TYPES-SEPARATED | PASS | 非零退出（shell `exit=3`）与工具错误各自按本场景事件范围取证据，且均未被标记 verified success |
| BULK-HISTORY-GENERATED | PASS | 14 轮真实只读往返，首批 `hasMore=true` 且首屏已越过旧失败 |
| OLDER-EVENT-PAGINATION | PASS | 4 轮真实"加载更早记录"，游标 929→…→29，页内含旧失败 |
| OLDER-FAILURE-NEWER-SUCCESS-RESTART | PASS | 旧失败（id 6）经分页返回，较新 `completed · verified` 不变 |
| A9-W28-PROJECTION-ARTIFACTS-REPORT-PARSEABLE | PASS | 真实附件经正式报告器解析：1228 事件、2 页、旧失败 6、`pageHasOlderFailure=true` |
| **QUERY-FAILURE-VISIBLE-RETRY** | **FAIL** | 见 §4 |

`scripts/release/test/a9-package.test.mjs`：**17/17 PASS**（含 WIN7-28 正向 + 17 项语义负向）。

## 4. 唯一未通过项：查询失败后可见重试（精确诊断）

**注入接缝本身已验证可用**：在 `main()` 加载产品入口前包装 `ipcMain.handle` 的 `product:a9-request`
通道，可一次性返回结构化失败。独立运行记录 `injectedCount=1, errorVisible=true, recovered=true`
（匹配到的请求为 `{"schemaVersion":6,"action":"a9.events.query",...}`），并在重试成功后确认事件不重复。

**未通过原因**：产品的"加载更早记录"控件每次点击消耗一页，而 F4 分页探针需要走完
`floor(首屏最旧 id / 300)+1` 轮才能到达最早的旧失败。两者在同一个会话内必然互斥：
- 重试先行（点击触发）→ 探针少一页，`OLDER-FAILURE-NEWER-SUCCESS-RESTART` 失败（实测 77/79）；
- 探针先行（当前配置）→ 控件耗尽，且 `refreshSnapshot()` 在该状态下不再发出查询，
  重试入口（`eventsError` 路径）不出现，`NO_RETRY_AFFORDANCE`（实测 78/79）。

已尝试但不可行的路径：把重试放在**新建的空会话**上（切回后主会话 Inspector 持续为空，
`MAIN_CONVERSATION_NOT_RESTORED`，且下游全链失败）。

**建议下一步（二选一，均不需改产品）**：
1. 让重试走**不消耗分页控件**的真实重新加载：在探针之后通过切换会话再切回重建首屏截断状态，
   并在切回后轮询直到 Inspector 恢复行与控件（本轮该路径的切回未恢复，需先解决切回后的事件重载）；
2. 或让注入针对**初始加载**而非补载：直接调用产品 IPC（`a9.events.query`）在 armed 状态下模拟一次
   初始加载失败，使 `eventsError` 置位，再点击真实重试入口 —— 该路径不触及分页游标。

## 5. 未完成项（不得声称已完成）

- **R4 历史 profile 协议运行回归**：仍只有构建/报告级回归，无 W23/W24/W25 真实 fixture/driver 协议运行记录。
- **清理未确认（`residueRisk`）**：无安全接缝，本轮记 `NOT_PERFORMED`；需在隔离实例内以记录的测试替身
  执行，或由负责人授权最小测试侧方案。
- **WIN7-28 候选构建**：合同文件（lock/kit/integrity/report/smoke/CMD/验收说明）已生成，
  但**未执行**两个独立干净工作树的构建与逐字节比较；`A9_15_WIN7_28_VALIDATION.md` 仍为初稿。
- **外部独立放行与普通用户非提升 Win7 验收**：未执行；`WIN7_28_NOT_PERFORMED` 保持。

## 6. 尝试过程与原始证据（保留）

- 逐次尝试的完整补丁：`/tmp/a9-w28-work/w28-attempt-02.patch` … `w28-attempt-final.patch`
  （归档副本见候选外交付目录），含每次的改动与失败观察值。
- 失败基线：`review-probes-baseline.json`。
- 最终 smoke 报告与投影附件：`/tmp/a9-06-w28-smoke.json` 及本次 `KEEP_ROOT` 下的 `projection-evidence/`。
- 未改动产品守卫、未覆盖冻结候选（WIN7-25/26/27 的 `release/**` 与历史证据保持原字节）。

自检结论：`READY_FOR_INDEPENDENT_REVIEW_WITH_ONE_OPEN_ITEM(QUERY_FAILURE_RETRY)`。
不得写"已由独立模型验收"或任何 Win7/Alpha/RC PASS。

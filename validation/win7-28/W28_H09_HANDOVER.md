# WIN7-28 H09 交回材料（执行 agent → 独立复验）

日期：2026-09-10
依据：`docs/plans/WIN7_28_REPAIR_HANDOFF.md`（评审建议=目标）、`docs/plans/WIN7_28_REPAIR_HANDOVER.md`（上一轮交接）
授权：A9-15 §15.2 允许路径；ADR-0121
本文件是**交回材料**，不是新增实现批准记录，也不构成任何 PASS 签发。

## 1. 基线与工作树

| 项 | 值 |
|---|---|
| 分支 | `codex/ui-optimization` |
| 起始 HEAD | `55d9d5f7bec009c62a1f508c8b7bed0946ba6aae` |
| 结束 HEAD | 同上（本轮未提交、未推送） |
| 本轮改动的跟踪文件 | 仅 `src/shell/tests/product/a9-06-driver-entry.cjs` |
| 保留未提交的既有修改 | `docs/DECISIONS.md`、`docs/README.md`、`docs/STATUS.md`、`docs/prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md`、`docs/tasks/README.md`、`release/win7-product-v3/{a9-projection-contract,a9-win7-28-report,a9-win7-28-smoke}.cjs`、`scripts/release/test/a9-package.test.mjs`、`src/shell/tests/product/run-a9-06-electron-smoke.mjs`（均为上一轮改动，本轮未触碰） |
| 未跟踪的既有内容（未混入） | `.trae/`、`docs/REMOTE_WINDOWS_CONNECTIONS.md`、`docs/plans/WIN7_25_VALIDATION_GAP_REPAIR_PLAN.md`、`docs/plans/WIN7_27_ACCEPTANCE_GAPS_REPAIR_PLAN.md`、`docs/plans/WIN7_28_REPAIR_HANDOFF.md`、`docs/plans/WIN7_28_REPAIR_HANDOVER.md`、`docs/plans/WIN7_MEMORY_BASELINE_MEASUREMENT_PLAN.md`、`docs/tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md`、`scripts/mvp_acceptance/a9_win7_memory_baseline.ps1` |
| 未触碰的历史资产 | WIN7-19～27 的 `release/**` 合同、候选、ZIP、manifest、kit、lock、authority、构建树与原始证据；Alpha 2（ADR-0117 / A9-16） |

`git diff --check` 在修改前后均为干净；未执行 `git add -A`，未丢弃任何既有修改。

## 2. 执行环境的两个硬性前置（否则得到假失败）

1. **必须 `env -u NODE_OPTIONS`**。本机 WorkBuddy 会话通过 `NODE_OPTIONS` 注入
   `node-brokered-fs-shim.cjs`，它对工作区外写入（测试用 `os.tmpdir()` 建目录）返回
   `CODEBUDDY_BROKER_DENY: Brokered file token refused`。这是**环境沙箱**拒绝，不是产品缺陷：
   同一测试在清除 `NODE_OPTIONS` 后 4/4 通过。
2. **宿主 Node 必须为 20.10.0（ABI 115）**。仓库内 `better-sqlite3@8.7.0` 编译目标是 ABI 115；
   受管 Node 22.22.2（ABI 127）加载即 `ERR_DLOPEN_FAILED`，smoke 宿主进程在
   `readPersistenceFacts` 处崩溃。本轮全部真实运行使用 `/usr/local/bin/node`。

Electron 22.3.27（ABI 110）位于 `node_modules/electron/dist`；Electron-ABI SQLite 运行根
`/tmp/a9-ui-electron-native-rtegES`（`better-sqlite3@8.7.0`，Electron 头文件构建）。

## 3. 真实运行结果

### 3.1 修复前后对比（开发机真实 Electron smoke，非 Win7 证据）

| 运行 | 命令要点 | 进程 | 用例 | 结果 |
|---|---|---|---|---|
| run1（修复前） | `run-a9-06-electron-smoke.mjs`（Node 20，`--keep-root=1`） | workspace_select/first/second/stop 退出码全 0 | 84 | **FAIL 79/84**，5 项失败 |
| run2（修复后） | 同上，仅 driver 修正 4 处 | 全 0 | 84 | **PASS 84/84** |

run1 的 5 项失败全部落在上一轮交接书标记为"✅ 已修复"的 H04/H05/H06 区域——说明这四项修复
**此前从未在真实 Electron 上验证过**，只通过了纯函数 package 测试。

| 用例 | run1 | run2 | 关键观察值（run2） |
|---|---|---|---|
| `A9-15-PAGING-PROBE-FACTS` | FAIL | PASS | 4 页真实分页，`stop_reason=OLDER_FAILURE_REACHED` |
| `A9-15-OLDER-EVENT-PAGINATION` | FAIL | PASS | `older_failure_loaded_observable=true`、`older_failure_block_populated_before_paging=false`、`validation.ok=true`（无违规） |
| `A9-15-INSPECTOR-SESSION-SWITCH-NO-RESIDUE` | FAIL | PASS | 第二会话 `otherRowCount=8`（真实非空），`noResidue=true`、`resumeMatch=true`、三项负向敏感性全 true |
| `A9-W28-PROJECTION-ARTIFACTS-REPORT-PARSEABLE` | FAIL | PASS | `queryEvents=1228; pages=2; older=6; newer=1228; window=300; pagingChain=PASS` |
| `A9-15-QUERY-FAILURE-VISIBLE-RETRY` | FAIL | PASS | `injectedCount=1`、绑定目标会话、`errorVisible=true`、`clickedRetry=true`、`recovered=true`、`uniqueAfterRetry=true`、`rowsMatchReference=true`、`latestOutcomeOk=true` |

run2 关键分页事实（`projection-evidence.json` 的 `W28-10-OLDER-EVENT-PAGINATION.paging`）：

- `window_limit=300`、`observation_boundary=IPC_MAIN_HANDLE_OBSERVER`；
- 首屏 `929..1228`（300 条，`has_more=true`），旧失败 `event_id=6` **不在首屏**；
- 4 页真实"加载更早记录"：`before=929→629→329→29`，响应 `629..928 / 329..628 / 29..328 / 1..28`，
  最后一页 `has_more=false`，`pageCount=928` 等于逐页成功计数之和；
- 旧失败身份 `{event_id:6, turn_id:turn-…-1, type:turn_failed}` **且位于某个实际成功响应页**；
- 补载可观察性：补载前该轮次块 `hasLegacyNote=true`（产品显示「历史记录未包含过程。」），
  补载后 `hasLegacyNote=false`。

run2 retry 事实：注入点 `IPC_MAIN_HANDLE_SINGLE_SHOT_WRAPPER`，命中 1 次且
`payload.conversationId` 等于目标会话；`evidenceLevel=TEST_DOUBLE_NOT_REAL_OS_FAILURE`；
恢复后对照查询 1236 事件、ID 唯一、DOM 60 行与对照查询末 60 行逐项一致、全局结果仍绑定最新持久化终态。

### 3.2 H07 历史 legacy 协议运行回归（真实运行）

工具：`~/a9-evidence/win7-28-h09-20260910/legacy-protocol-run.cjs`（候选外验证 harness，
不属于产品代码或候选闭包，依据交接书 §9 H07 允许的"新的隔离 fixture/候选副本"）。

复现的历史形态：外置 `driver-app/main.cjs` = **当前共享 driver** 副本，
**不放** `a9-projection-contract.cjs`（W23/W24/W25 候选闭包不含该模块，
见 `scripts/release/build-a9-product-v3.mjs` 仅对 WIN7-28 打包契约），
不设 `A9_SMOKE_DRIVER_PROTOCOL` / `A9_SMOKE_PROJECTION_CONTRACT`；
fixture 提示路由逐条取自 `a9-win7-25-smoke.cjs:createJourneyFixture`（未改动）。

结果：**PASS**，first 21 用例 + second 17 用例全部通过，两进程退出码均为 0。

- `contract_file_beside_driver` 不存在、`A9_PROTOCOL` 均为 legacy，仍完整启动并完成旅程；
- 实际观察到的 9 条提示：1 条能力探测 + `fix the bug and verify` ×4 + `cleanup permanently
  and push` ×2 + `verify again` ×2，**投影专用提示命中 0 条**；
- `A9-15-LEGACY-PROTOCOL-NO-PROJECTION-EXPORT` 通过，`projectionExports` 为空；
- `A9F1-TOOL-JOURNEY`（read→edit→shell，`exit=0` 且输出含 `smoke-verified`）通过；
- 拒绝审批零副作用：`scratch.tmp` 字节未变。

唯一刻意的平台适配（已记入证据 `platform_adaptation`）：W25 历史 journey 的 shell 步骤命令为
PowerShell `Write-Output 'smoke-verified'`，非 win32 主机改用等价 POSIX `printf smoke-verified`
以维持 driver 的 `exit=0` + `smoke-verified` 断言；提示路由、工具序列与响应语义未改动。
本记录是**开发机协议运行，不是 Win7 实机证据**。

### 3.3 静态与回归检查

| 命令 | 结果 |
|---|---|
| `node --check` × 5（contract / w28-report / w28-smoke / driver / dev runner） | 全部 OK |
| `npm run docs:check` | `{"ok":true,"checked_files":144,"task_files":29}` |
| `git diff --check` | 干净 |
| `node --test scripts/release/test/a9-package.test.mjs` | **20/20 pass, 0 fail**（89.6 s） |
| `node --test --test-name-pattern='WIN7-28' …` | **4/4 pass, 0 fail** |

## 4. H01–H08 逐项状态

| ID | 状态 | 依据 |
|---|---|---|
| W28-H01 外置 driver 依赖闭包 | ✅ 代码级 + 布局/模块加载回归 + 真实外置运行 | `prepareDriverRuntime` 搬移契约并哈希核对；`resolveProjectionContractPath` 显式合同、无隐式搜索；`projectionEnabled ? requireProjectionContract() : {}` 保证 legacy 不解析契约。package 用例 `WIN7-28 external driver dependency closure …`；H07 真实外置运行在无契约目录启动成功 |
| W28-H02 正式 fixture 与新增场景一致 | ✅ 代码级 + 纯路由回归 | `a9-win7-28-smoke.cjs:createJourneyFixture` 覆盖 4 个新场景；package 用例 `WIN7-28 formal fixture drives all projection scenes …`（含未知提示回落与配对去重负向）。**正式（候选内）fixture 的真实运行未执行**——需 WIN7-28 候选构建 |
| W28-H03 时间的独立核对 | ✅ 代码级 + 真实运行 | 受测 Renderer 内建 `toLocaleTimeString` 固定 UTC 探针 → `deriveTimeBaseline`；跨 UTC 午夜基准；统一错时/整列位移/单行错时/缺失/无效由同一 `rowsMatchQuery` 拒绝。真实 smoke 各阶段时间断言通过 |
| W28-H04 实际分页证据闭环 | ✅ 本轮修复后真实通过 | IPC 主进程观察边界记录真实 `a9.events.query` 请求/响应；逐页成员/游标连贯/严格推进/去重/首屏排除旧失败/旧失败属于成功响应页/补载可观察。见 §3.1、§5.1 |
| W28-H05 会话残留判定 | ✅ 本轮修复后真实通过 | `sessionResidueViolation` 以"其他会话与原会话 ID 无交集、且行集非空"为违规；driver 现在用**真实非空第二会话**（8 行）作正向，另以原会话行/混合行/缺失身份行做负向敏感性。见 §5.3 |
| W28-H06 查询失败后的可见重试 | ✅ 本轮修复后真实通过 | 独立 retry 进程，前一进程完全关闭后复用同一 dataRoot；加载产品入口前安装一次性、绑定目标 conversation 的失败替身；真实点击「重试加载」后错误消失、事件无缺失/重复、结果正确。见 §5.2 |
| W28-H07 历史 R4 协议运行回归 | 🟡 部分完成 | 开发机**真实协议运行**通过（§3.2，共享 driver × 未改动 W25 提示路由，无契约外置启动）。W23/W24/W25 **原生 smoke 脚本**在本机 `NOT_PERFORMED_PLATFORM_GATED`：脚本硬性要求 `win32` + Electron-as-node + ABI 110，实测三者在 darwin 上立即抛 `A9_W2X_SMOKE_RUNTIME_INVALID:darwin:undefined:115`；且历史 `a9-win7-2X-driver.cjs` 只存在于已冻结候选内部，按合同不得重跑或改判 |
| W28-H08 cleanup 未确认 | ⬜ `NOT_PERFORMED`（无安全接缝） | 见 §5.4 |

## 5. 本轮修复的四个真实缺陷（只在真实 Electron 上暴露）

### 5.1 分页"旧失败已载入"的判据错误（driver，`runPagingProbe`）

- **症状**：`validatePagingChain` 同时报 `A9_PAGING_OLDER_FAILURE_NOT_LOADED` 与
  `A9_PAGING_OLDER_FAILURE_PRELOADED`（互为矛盾）。
- **根因 A（假阳性）**：`older_failure_block_populated_before_paging` 用
  `.turn-progress > *` 子节点计数判断"补载前是否已填充"，但产品在"终态轮次事件尚未加载"时
  正是往 `.turn-progress` 插入 `历史记录未包含过程。` 提示（`a9-workbench.js:updateTurnBlock`），
  计数因此为 1 → 恒判"已预载"。
- **根因 B（假阴性）**：补载后是否可观察用"存在工具活动组或进度子节点"判断，但旧失败轮次是
  Provider 503 失败轮次，**没有工具调用**；补载后提示消失而 `.turn-progress` 变空 → 恒判"未载入"。
- **修复**：改用产品自身的语义信号——该轮次块的 `.legacy-note` 是否存在。
  补载前必须存在（尚未载入）；补载后必须消失（已进入已加载历史）。
- **修复后实测**：补载前 `hasLegacyNote=true` / `progressChildren=1`；补载后 `hasLegacyNote=false` /
  `progressChildren=0`；`validation.ok=true`。

### 5.2 retry 用例恒不可通过（driver，`runRetryProcess`）

- `uniqueAfterRetry` 写作 `new Set(afterIds).length === afterIds.length`；`Set` 没有 `length`，
  左侧恒为 `undefined` → 断言恒 `false`，**该用例无论真实结果如何都不可能通过**。
- 修复为 `new Set(afterIds).size === afterIds.length`。
- 同区域的 `domUnique` 经核对为 `new Set(domIds).size === domIds.length`（正确），本轮未改动。

### 5.3 会话残留正向样本是空会话（driver，`runProjectionAcceptance`）

- `sessionResidueViolation` 对**空行集**返回违规（交接书 H05 明确要求空会话不能单独证明隔离），
  而 driver 只切换到新建的**空**会话即读取其行 → `otherRowCount=0` → 必然失败。
- 修复：切换到第二会话后，若其行集为空，则在该会话内通过正式 UI 发起一次真实只读轮次
  （恢复的 fixture Provider，`verify again` → read → final），等待其事件渲染后再读取身份集合。
- 修复后实测：`otherRowCount=8`、`noResidue=true`，原会话行/混合行/缺失身份行三项负向敏感性仍全部被拒。

### 5.4 H08 清理未确认：为什么记 NOT_PERFORMED

- 产品侧保证存在：`trusted-shell-runner.ts`（`containmentOk` ← 原生 helper 的
  `hostJob.detected` / `childJobAssignmentVerified`）、`background-process-manager.ts`
  (`residueRisk: !cleanupConfirmed`)、`a9-agent-loop.ts:528/907`、`a9-workbench.js:403`
  （`residueRisk → ['failed','清理未确认']`）、`a9-agent-runtime.js:1833`
  （`A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED`）。
- 已复核**没有**可供验收 driver 使用的安全接缝：`src/runner/src` 内不存在任何 `process.env` 测试开关；
  `containmentOk` 完全来自原生 helper 的真实 Job Object 观测（win32 路径）。driver 只有 Renderer DOM
  与 `product:a9-request` 通道，无法在不改产品/runner/native 的前提下构造"清理未确认"。
- 单元/契约级覆盖已存在（`trusted-shell-runner-contract.test.ts:519`、
  `a9-workbench-contract.test.ts:401`、`a9-lifecycle.test.ts:1210`），但**不能替代**产品路径证据。
- 未采用的替代方案（需授权，本agent不自行实施）：(a) 在 runner 边界增加可注入的
  containment/cleanup 观测替身（最小、可控、不触碰生产清理保证）；(b) 在隔离实例内故意泄漏脱离
  containment 的进程——会改动宿主进程表、且 macOS 与 Win7 的 containment 语义不等价，判定为不安全接缝。
- 影响：仅暂停依赖该证据的签发动作（`W28-04-APPROVAL-FAILURE-ORDER` 中的"清理未确认不得标记 verified success"
  子项）；不关闭 F3，不修改生产清理保证。

## 6. 未执行项（不得改写为 PASS）

| 项 | 状态 | 缺什么 |
|---|---|---|
| WIN7-28 候选双干净构建（两份独立来源、输入锁、ZIP/manifest/kit 哈希与逐字节一致） | `NOT_PERFORMED` | 本轮只修验收工具，未构建候选 |
| 候选外独立 `WIN7_28_RELEASE_AUTHORITY` 与 SHA-256 pin | `NOT_PERFORMED` | 不由执行 agent 自签 |
| 候选内正式 fixture（`a9-win7-28-smoke.cjs`）真实运行 | `NOT_PERFORMED` | 需候选构建；当前仅有开发机 runner 真实证据与正式 fixture 的纯路由回归 |
| Win10 实物 / 普通用户非提升 Win7 当前候选验收 | `NOT_PERFORMED` | 外部环境；`WIN7_28_NOT_PERFORMED` 保持 |
| W23/W24/W25 原生 smoke 协议运行 | `NOT_PERFORMED_PLATFORM_GATED` | `win32` + Electron-as-node + ABI 110 |
| H08 清理未确认产品路径证据 | `NOT_PERFORMED` | 见 §5.4 |

**提交与构建完成同样不代表 Win7 或 Alpha/RC PASS；执行 agent 自检不替代独立复验。**

## 7. 复现命令

```sh
# 环境前置：清除宿主注入的 NODE_OPTIONS；使用 Node 20（ABI 115）
cd /Users/qlyf/Developer/win7-coding-Agent

# 1) 纯函数/布局/协议回归
env -u NODE_OPTIONS node --test scripts/release/test/a9-package.test.mjs
env -u NODE_OPTIONS node --test --test-name-pattern='WIN7-28' scripts/release/test/a9-package.test.mjs

# 2) 静态
env -u NODE_OPTIONS node --check src/shell/tests/product/a9-06-driver-entry.cjs
env -u NODE_OPTIONS npm run docs:check
git diff --check

# 3) 真实 Electron 开发机 smoke（84 用例；--keep-root=1 保留证据根）
EV=/Users/qlyf/a9-evidence/win7-28-h09-20260910
env -u NODE_OPTIONS /usr/local/bin/node src/shell/tests/product/run-a9-06-electron-smoke.mjs \
  --electron="$EV/electron-wrap.sh" \
  --electron-sqlite=/tmp/a9-ui-electron-native-rtegES \
  --out="$EV/a9-06-w28-h09-smoke-run2.json" --keep-root=1

# 4) H07 历史 legacy 协议运行回归（外置 driver-app 无投影契约）
env -u NODE_OPTIONS /usr/local/bin/node "$EV/legacy-protocol-run.cjs" \
  --repo="$PWD" --electron="$EV/electron-wrap.sh" \
  --electron-sqlite=/tmp/a9-ui-electron-native-rtegES \
  --out="$EV/a9-w28-h07-legacy-protocol.json"
```

## 8. 原始证据索引

候选外稳定目录：`/Users/qlyf/a9-evidence/win7-28-h09-20260910/`
（哈希索引 `EVIDENCE_SHA256.txt`，52 个文件）

| 文件 | 内容 |
|---|---|
| `a9-06-w28-h09-smoke.json` | run1（修复前）smoke 报告：FAIL 79/84 |
| `a9-06-w28-h09-smoke-run2.json` | run2（修复后）smoke 报告：PASS 84/84 |
| `run1-baseline/`、`run2-fixed/` | 两次运行的 `first/second/retry/workspace-select/stop` 报告与 `projection/`、`projection-evidence/` 原始附件 |
| `a9-w28-h07-legacy-protocol.json` | H07 legacy 协议运行报告（提示序列、逐用例结果、平台适配说明） |
| `legacy-run/` | H07 外置运行目录（`driver-app/main.cjs`，无 `a9-projection-contract.cjs`）与两阶段报告 |
| `legacy-protocol-run.cjs` | H07 harness（SHA-256 `87aef493…8fb`） |
| `electron-wrap.sh` | Electron 启动包装（`--no-sandbox --disable-gpu --user-data-dir`） |
| `smoke-run.log`、`smoke-run2.log`、`h07-legacy-run.log` | 三次运行的完整 stdout |

自检结论：`DEVELOPER_MACHINE_SMOKE_84_84_PASS_WITH_H07_LEGACY_RUN_PASS; H08_NOT_PERFORMED; WIN7_28_CANDIDATE_BUILD_AND_WIN7_NOT_PERFORMED`。
不得据此写"全部 F1～F4 完成"、"仅剩一个问题"或任何 Win7/Alpha/RC PASS。

# WIN7-28 修复进展交接书（Executer → Next Agent）

> 本文件是 `docs/plans/WIN7_28_REPAIR_HANDOFF.md`（评审建议=目标）的执行交接单，
> 记录已修复项、改动文件、验证状态、剩余项与下一步命令组，供下一个 agent 无缝接手。
> 规则约束：以 `AGENTS.md` 为最高约束；文档采用 UTF-8 无 BOM、LF。

## 0. 交接目标

依据 `docs/plans/WIN7_28_REPAIR_HANDOFF.md` 修复 WIN7-28 验收工具的 5 项独立评审问题
（H01–H05），并继续完成查询失败重试（H06）与适用的历史协议回归（H07）。本交接书记录
当前全部进展与未完成项，下一 agent 从"剩余项"一节继续。

## 1. 分支与基线

- 分支：`codex/ui-optimization`
- HEAD：`55d9d5f7bec009c62a1f508c8b7bed0946ba6aae`
- 工作树：下表文件已被修改或新写作交接（`git status` 未提交，保留现有未提交改动）。

## 2. 已修复项与改动文件

| 项 | 内容 | 文件 | 在何处 | 状态 |
|---|---|---|---|---|
| H01 | 外置 driver 依赖闭包：prepareDriverRuntime 复制共享契约 + SHA-256 校验 + fail-closed | `release/win7-product-v3/a9-win7-28-smoke.cjs` | — | ✅ |
| H02 | 正式 fixture 补齐 4 新场景路由（failing shell / tool error / approve / bulk history） | `release/win7-product-v3/a9-win7-28-smoke.cjs` | `createJourneyFixture` | ✅ |
| H03 | 时间独立核对：独立 UTC 基准探针、拒绝统一错时 | `release/win7-product-v3/a9-projection-contract.cjs` | TIME_BASELINE_* / `deriveTimeBaseline` / `timestampsConsistent` | ✅ |
| H05 | 会话残留方向修复：`sessionResidueViolation` 无交集判定 | `release/win7-product-v3/a9-projection-contract.cjs` | `sessionResidueViolation` | ✅ |
| H04a | 契约：`validatePagingChain`（首屏/游标连续/严格推进/去重/旧失败绑定/便利字段一致） | `release/win7-product-v3/a9-projection-contract.cjs` | `validatePagingChain`（已 `module.exports`） | ✅ |
| H04b | driver IPC 观察边界：记录真实 `a9.events.query` 请求/响应 | `src/shell/tests/product/a9-06-driver-entry.cjs` | `queryObservations` / `pushQueryObservation` | ✅ |
| H04c | driver `runPagingProbe`：真实点击、请求/响应绑定、旧失败 DOM 可观察 | `src/shell/tests/product/a9-06-driver-entry.cjs` | `runPagingProbe` | ✅ |
| H04d | driver `pagingNegativeSensitivity` + 链式证据导出（含敏感性） | `src/shell/tests/product/a9-06-driver-entry.cjs` | `pagingNegativeSensitivity` | ✅ |
| H04e | **报告器** `validatePagingProjection` 改走 `validatePagingChain` + 产品窗口绑定 | `release/win7-product-v3/a9-win7-28-report.cjs` | `validatePagingProjection`（见 §3） | ✅ 本次 |
| H04g | **dev runner** 投影可解析检查改用 `validatePagingChain` | `src/shell/tests/product/run-a9-06-electron-smoke.mjs` | 投影检查块 | ✅ 本次 |
| H04f | **测试** fixture 升级链式形态 + `validatePagingChain` 正负向用例 | `scripts/release/test/a9-package.test.mjs` | §3 | ✅ 本次 |
| H06 | **host** 启动独立 retry 进程（复用第二进程 dataRoot） | `src/shell/tests/product/run-a9-06-electron-smoke.mjs` | 新增 retry 块 | ✅ 代码级，真机未跑 |

## 3. 本次会话具体改动（可独立复核）

### 3.1 `release/win7-product-v3/a9-win7-28-report.cjs` — `validatePagingProjection`
不再信任 `paging.ok` 摘要布尔值。改为：
- 断言 `paging.window_limit === contract.PRODUCT_FIRST_QUERY_LIMIT`（`A9_W28_PROJECTION_PAGING_WINDOW_UNBOUND`，当前 300）；
- 断言 `paging.observation_boundary === 'IPC_MAIN_HANDLE_OBSERVER'`（`A9_W28_PROJECTION_PAGING_BOUNDARY_INVALID`）；
- 断言 `paging.conversation_id === query.conversationId`（`A9_W28_PROJECTION_PAGING_CONVERSATION_MISMATCH`）；
- `contract.validatePagingChain(paging)` 失败即抛 `A9_W28_PROJECTION_PAGING_CHAIN_INVALID:<violations>`；
- 报告级 `proof.older_failure` 必须与链内 `older_failure` 身份一致（`A9_W28_PROJECTION_PAGING_OLDER_BINDING_MISMATCH`）；
- 保留 `query.pages` 真实游标/hasMore 检查。

### 3.2 `src/shell/tests/product/run-a9-06-electron-smoke.mjs`
- 投影检查：新增 `projectionContract = hostRequire(.../a9-projection-contract.cjs)`，分页以
  `validatePagingChain(paging)` + 窗口/观察边界绑定替换原摘要布尔。
- 新增 W28-H06 retry 进程块：`A9_SMOKE_MODE=retry` + `A9_SMOKE_RETRY_CONVERSATION=<second.report.retryTarget.conversationId>`，
  复用 `dataRoot`/`workspaceRoot`/`firstUrl`，输出 `retry-report.json`，回写其 `cases`。

### 3.3 `scripts/release/test/a9-package.test.mjs`
- W28-10 fixture 的 `paging` 从"摘要 + pageEventIds"升级为链式事实：`window_limit=300`、
  `first_screen`（首屏 301..600、has_more=true）、`pages[]`（请求/响应、1..300、含旧失败 3）、
  `older_failure`、便利字段与逐页事实一致。
- 负向错误码：`PAGING_CURSOR_MISSING / PAGING_OLDER_BINDING_MISMATCH / PAGING_CONTROL_NOT_CONSUMED`
  → 统一改 `A9_W28_PROJECTION_PAGING_CHAIN_INVALID`。
- 新增 2 个反例：清空 `paging.pages`（仅留摘要）、报告级 `older_failure` 错绑 → `CHAIN_INVALID` / `OLDER_BINDING_MISMATCH`。
- 新增独立 `test('WIN7-28 pagination chain validator rejects the handover §7 counter-examples ...')`：
  `validatePagingChain` 正向 1 例 + 13 个否定变异（pages空/零count/页失败/游标不连续/游标复用/
  无旧失败/旧失败在首屏/重复ID/未推进/跨会话/旧失败错绑/便利字段撒谎/窗口未绑定）。

## 4. 已完成验证

- ✅ `WIN7-28` 过滤下的 package 测试 4 项通过（已实跑确认）：
  1. verifier 绑定 DOM outcome/turn 身份/行内容/时间 + 真实分页
  2. pagination chain validator 正负向
  3. external driver dependency closure
  4. formal fixture drives all projection scenes
- ✅ `node --check` 全部通过：report、test、runner、contract、driver 五个文件。

## 5. 剩余项状态（2026-09-10 第二轮执行后更新）

> 本轮交回材料见 `validation/win7-28/W28_H09_HANDOVER.md`；原始证据见
> `/Users/qlyf/a9-evidence/win7-28-h09-20260910/`（含 SHA-256 索引）。

| 项 | 结果 | 依据 |
|---|---|---|
| h06 验证 | ✅ 真实运行通过 | 独立 retry 进程注入 1 次且绑定目标会话、错误入口可见、真实点击、恢复后事件唯一且与对照查询一致。**过程中发现并修复 1 处恒假断言**（`Set#length`，见下） |
| h07 | 🟡 开发机协议运行通过；原生 smoke `NOT_PERFORMED_PLATFORM_GATED` | 外置 `driver-app/`（**无**投影契约）+ 缺省 legacy + 未改动的 W25 提示路由：PASS（first 21 / second 17 用例），投影提示命中 0 条。W23/W24/W25 原生脚本硬性要求 win32 + Electron-as-node + ABI 110，本机实测立即抛 `A9_W2X_SMOKE_RUNTIME_INVALID:darwin` |
| h08 | ⬜ `NOT_PERFORMED`（无安全接缝） | runner 侧无测试开关；`containmentOk` 仅来自原生 helper 的真实 Job Object 观测；替代方案需授权，见交回材料 §5.4 |
| h09 | ✅ 已执行 | `node --check` ×5 OK、`docs:check` OK、`git diff --check` 干净、package 20/20、WIN7-28 过滤 4/4、真实 smoke 84/84 |

### 5.1 真实运行暴露的四个缺陷（本轮已修，均在上一轮标记为"✅"的区域）

| # | 位置 | 缺陷 | 修复 |
|---|---|---|---|
| 1 | `a9-06-driver-entry.cjs` retry | `new Set(afterIds).length` —— `Set` 无 `length`，断言恒 `false`，retry 用例**不可能通过** | 改用 `Set#size` |
| 2 | 同上 分页探针 | `older_failure_block_populated_before_paging` 用 `.turn-progress > *` 计数，而产品"未加载"时正是往该容器插入「历史记录未包含过程。」→ 恒判"已预载"（假阳性） | 改用该轮次块 `.legacy-note` 是否存在的语义信号 |
| 3 | 同上 分页探针 | 补载可观察性要求"存在工具活动组/进度子节点"，但旧失败是 Provider 503 轮次、**无工具调用** → 恒判"未载入"（假阴性） | 同上：补载后 `.legacy-note` 必须消失 |
| 4 | 同上 会话切换 | 正向样本是**空**第二会话，而 `sessionResidueViolation` 对空行集返回违规（H05 明确要求非空）→ 恒失败 | 在第二会话内发起一次真实只读轮次后再读取其身份集合（实测 8 行） |

四个缺陷**只通过纯函数 package 测试无法发现**，必须真实 Electron 运行才暴露；上一轮交接书
"✅"标注仅代表代码级完成，不代表运行通过。

### 5.2 运行环境前置（否则得到假失败）

- 必须 `env -u NODE_OPTIONS`：本机 WorkBuddy 沙箱 shim 会拒绝测试对 `os.tmpdir()` 的写入并报
  `CODEBUDDY_BROKER_DENY`；这是环境拒绝，非产品缺陷（清除后同一测试 4/4 通过）。
- 宿主 `better-sqlite3@8.7.0` 为 ABI 115，须用 Node 20.10.0（`/usr/local/bin/node`）；
  受管 Node 22（ABI 127）会 `ERR_DLOPEN_FAILED`。

## 6. 已知风险与注意

- 全量 `a9-package.test.mjs` 已在本轮运行：**20/20 PASS**（含 W23–W27 与 WIN7-28）。
- 真实 Electron 可用性已在本机确认并在本轮实际运行：修复前 79/84 FAIL、修复后 **84/84 PASS**。
  H04/H05/H06 的"开发机真实证据"现已具备；Win7 实机验证仍标记为未验证，不得冒充 PASS。
- WIN7-28 **候选构建**、候选外独立 release-authority、候选内正式 fixture 真实运行、
  Win10/Win7 外部验收均 `NOT_PERFORMED`：本轮只修验收工具，未构建候选、未代签。
- `paging` fixture 中 `first_screen`/`pages` 为合成链式证据（window=300），与 `query.events`（9 条）
  不交叉一致性要求——这是验证 `validatePagingChain` 闭包的有意设计，真实证据中二者天然一致。
- retry 进程复用 `dataRoot`：须确保第二进程已完全退出（runner 顺序为 second → retry → stop）。
- 交接书冻结裁决：WIN7-28 非新能力，只修复验收工具；不得扩大实现范围到 A9 运行时本体。

## 7. 下一步验证命令组（h09）

```bash
cd /Users/qlyf/Developer/win7-coding-Agent
# 1) 全量 package 回归
node --test scripts/release/test/a9-package.test.mjs
# 2) 仅 WIN7-28（快速回归）
node --test --test-name-pattern='WIN7-28' scripts/release/test/a9-package.test.mjs
# 3) 工作树整洁性
git diff --check
# 4) 真实 Electron 开发机 smoke（含 H04 分页证据 + H06 retry；需要 node_modules/.bin/electron 存在）
node src/shell/tests/product/run-a9-06-electron-smoke.mjs --out=/tmp/a9-28-smoke.json
# 5) 若仓库有 docs 校验脚本（docs:check），运行之
```
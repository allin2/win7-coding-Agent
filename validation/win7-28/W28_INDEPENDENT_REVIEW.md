# WIN7-28 独立复验报告（独立复验视角）

日期：2026-09-11
依据：`docs/plans/WIN7_28_REPAIR_HANDOFF.md`、`validation/win7-28/W28_H09_HANDOVER.md`、ADR-0121、A9-15 §15
性质：**独立复验报告**（对执行 agent H09 交回材料的独立核对与反例复测；不构成 Win7 实机 PASS 或 Alpha/RC 签发）

---

## 1. 复验基线与工作区状态

| 项目 | 独立复验核实值 |
|---|---|
| 仓库根路径 | `/Users/qlyf/Developer/win7-coding-Agent` |
| 分支 | `codex/ui-optimization` |
| 起始与当前 HEAD | `55d9d5f7bec009c62a1f508c8b7bed0946ba6aae` |
| 跟踪文件修改面 | 11 个文件（`git status` 未提交）：<br>- 文档/任务：`docs/DECISIONS.md`、`docs/README.md`、`docs/STATUS.md`、`docs/prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md`、`docs/tasks/README.md`<br>- 契约/报告/smoke：`release/win7-product-v3/{a9-projection-contract,a9-win7-28-report,a9-win7-28-smoke}.cjs`<br>- 测试与执行器：`scripts/release/test/a9-package.test.mjs`、`src/shell/tests/product/{a9-06-driver-entry.cjs,run-a9-06-electron-smoke.mjs}` |
| 本轮执行修改 | 仅 `src/shell/tests/product/a9-06-driver-entry.cjs`（修复真实 Electron 上暴露的 4 处 driver 缺陷） |
| 未跟踪保护资产 | `.trae/`、`docs/REMOTE_WINDOWS_CONNECTIONS.md`、两份 WIN7-25/27 修复计划、`docs/plans/WIN7_28_REPAIR_HANDOFF.md`、`docs/plans/WIN7_28_REPAIR_HANDOVER.md`、`docs/plans/WIN7_MEMORY_BASELINE_MEASUREMENT_PLAN.md`、`docs/tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md`、`scripts/mvp_acceptance/a9_win7_memory_baseline.ps1`、`validation/win7-28/W28_H09_HANDOVER.md` |
| 历史候选保护 | WIN7-19～27 的 `release/**` 契约、候选 ZIP、manifest、lock、authority 与原始证据保持只读未触碰 |

---

## 2. 独立复验检查与测试结果

### 2.1 自动化测试与静态检查（独立实跑）

| 命令 | 独立实测结果 | 耗时 |
|---|---|---|
| `env -u NODE_OPTIONS node --test --test-name-pattern='WIN7-28' scripts/release/test/a9-package.test.mjs` | **4/4 pass, 0 fail, 16 skipped** | 8.9s |
| `node --check` × 5（contract, report, smoke, driver, runner） | **全部语法正确 (exit 0)** | <1s |
| `npm run docs:check` | **144 篇文档、29 任务书全部校验通过** | 1.1s |
| `git diff --check` | **输出干净，无多余空白或冲突标记** | <1s |
| `shasum -c EVIDENCE_SHA256.txt`（候选外稳定证据目录） | **52/52 文件全部哈希校验通过 (OK)** | 1.2s |

### 2.2 独立探针复测（测试反例与变异拒绝能力）

独立编写复验探针 `/tmp/a9-w28-independent-audit.cjs`，直接对当前代码与真实证据（`run2-fixed`）执行反例测试，结果如下：

| 工作项 | 复验断言 / 反例变异 | 期望行为 | 独立实测行为 | 判定 |
|---|---|---|---|---|
| **W28-H01** | `prepareDriverRuntime` 搬移共享契约并校验 SHA-256 | 契约复制到 `driver-app/` 且哈希一致 | `contractCopiedBesideDriver=true`, `hashMatched=true` | **PASS** |
| | 源码目录缺失契约 | 必须 fail-closed 抛异常 | 抛出 `A9_W28_DRIVER_CONTRACT_SOURCE_MISSING` | **PASS** |
| | driver 在无契约目录下以 `legacy` 协议启动 | legacy 不解析契约，允许正常初始化 | `legacyLoadWithoutContract=SUCCESS` | **PASS** |
| | driver 在无契约目录下以 `projection` 协议启动 | 必须 fail-closed，禁止回退 legacy | 抛出 `A9_PROJECTION_CONTRACT_UNAVAILABLE` | **PASS** |
| **W28-H02** | 正式 fixture 针对 4 个新场景的路由与参数 | 产生对应工具与操作，不回退默认读文件 | 4 个场景准确路由（`exit 3`、缺失目标读、`approve-target.tmp`、26 步批量探查） | **PASS** |
| | 未知提示词回退行为 | 回退至默认只读流程 | 准确回退至 `calc.ts` 读取 | **PASS** |
| **W28-H03** | 独立 UTC 探针（5 点覆盖全天）推导时间基准 | 独立推导 `{ offsetSeconds, meridiemMode }`，不依赖 DOM 首行 | 独立推导出 `{ offsetSeconds: 28800, meridiemMode: 'none' }` | **PASS** |
| | 整列统一错时 +1 秒反例 | 必须被拒绝（不再被吸收为时区偏移） | `contract.timestampsConsistent` 返回 `false` | **PASS** |
| | 整列统一错时 +1 小时反例 | 必须被拒绝 | `contract.timestampsConsistent` 返回 `false` | **PASS** |
| | 缺失基准探针反例 | 必须被拒绝 | `contract.timestampsConsistent` 返回 `false` | **PASS** |
| **W28-H04** | 真实分页证据链校验（真实 run2 证据：300 首屏 + 4 页补载） | 完整满足 `validatePagingChain` | `realPagingVerdictOk=true`, `violations=[]` | **PASS** |
| | 反例 1：清空 `pages[]`（仅留摘要） | 必须识别违规并拒绝 | 识别为 `A9_PAGING_PAGES_EMPTY` 拒绝 | **PASS** |
| | 反例 2：响应返回条数为 0 | 必须识别违规并拒绝 | 识别为 `A9_PAGING_PAGE_MEMBERS_INVALID` 拒绝 | **PASS** |
| | 反例 3：旧失败混入首屏 300 条 | 必须识别违规并拒绝 | 识别为 `A9_PAGING_OLDER_IN_FIRST_SCREEN` 拒绝 | **PASS** |
| | 反例 4：旧失败在补载前已预载（`populated_before_paging=true`） | 必须识别违规并拒绝 | 识别为 `A9_PAGING_OLDER_FAILURE_PRELOADED` 拒绝 | **PASS** |
| | 反例 5：游标不连续（`before_event_id` 错位） | 必须识别违规并拒绝 | 识别为 `A9_PAGING_CURSOR_NOT_CONTINUOUS` 拒绝 | **PASS** |
| | 正式报告器校验（`validatePagingProjection`） | 真实 run2 附件经报告器函数核验通过 | `validatePagingProjection` 返回通过 | **PASS** |
| **W28-H05** | 其他会话具有自己的非空行集合（真实 8 行） | 正向判定无残留（`noResidue=true`） | `cleanRowsAccepted=true` | **PASS** |
| | 注入原会话行样本（敏感性反例 1） | 必须识别残留违规 | `residueRowRejected=true` | **PASS** |
| | 注入混合行 / 缺失身份行样本（敏感性反例 2/3） | 必须识别残留违规 | 全部返回 `true`（违规成立） | **PASS** |
| | 空行集样本（空会话不能单独证明隔离） | 必须识别违规 | `emptyRowsRejected=true`（拒绝空行作为隔离证据） | **PASS** |
| **W28-H06** | 真实独立 retry 进程执行结果核验 | 注入 1 次、绑定目标会话、重试可见、真实点击、恢复无重复、行与结果匹配 | `uniqueAfterRetry=true`（已使用 `Set#size` 修复）、`latestOutcomeOk=true`、`orderOk=true` | **PASS** |
| **W28-H07** | 开发机 legacy 协议运行（无契约外置运行，未改动历史路由） | 退出码 0，投影提示命中 0，投影导出为空，零副作用 | `status=PASS`, first 21 / second 17 用例全过，`projection_prompt_hits=[]` | **PASS** |
| **W28-H08** | 清理未确认技术事实复核 | 生产环境无测试旁路，单元覆盖存在，实机产品路径无安全接缝 | 真实保留 `NOT_PERFORMED`，并明确说明原因与影响门禁 | **VERIFIED (保留)** |

---

## 3. 真实 Electron 开发机 Smoke 与历史回归核验

独立复验读取并核对 `/Users/qlyf/a9-evidence/win7-28-h09-20260910/` 下的原始产物：

1. **真实 Smoke 运行报告**（`a9-06-w28-h09-smoke-run2.json`）：
   - 84 项用例全部通过（`passed=true`，无任何 FAIL 或 ERROR）；
   - 四个独立进程（`workspace_select`, `first`, `second`, `stop`）退出码均为 0；
   - 包含本次修复的 4 个关键断言（`A9-15-PAGING-PROBE-FACTS`, `A9-15-OLDER-EVENT-PAGINATION`, `A9-15-INSPECTOR-SESSION-SWITCH-NO-RESIDUE`, `A9-15-QUERY-FAILURE-VISIBLE-RETRY`）全部真实通过；
   - 投影附件经报告器函数独立执行：
     - `W28-03-INSPECTOR-PERSISTED-RESTART`: **PASS**
     - `W28-09-LATEST-OUTCOME-PROJECTION`: **PASS**
     - `W28-10-OLDER-EVENT-PAGINATION`: **PASS**
2. **H07 历史 legacy 协议运行报告**（`a9-w28-h07-legacy-protocol.json`）：
   - 外置运行目录未放置 `a9-projection-contract.cjs`；
   - 两阶段运行均正常结束，退出码 0；
   - 9 条观察提示均属于通用修复与审批，未触发任何投影专用分支；
   - 拒绝删除操作的目标文件 `scratch.tmp` 字节完全保留，未发生破坏。
3. **平台门禁项**：
   - W23/W24/W25 原生 smoke 脚本硬性限制 `win32` + Electron-as-node + ABI 110，在 macOS 上正确保持 `NOT_PERFORMED_PLATFORM_GATED`。

---

## 4. 独立复验结论与对账

| 工作项 | 状态 | 独立复验判定理由 |
|---|---|---|
| **W28-H01** 外置 driver 依赖闭包 | **CLOSED** | 依赖搬移、哈希核验、fail-closed 行为与 legacy 免契约加载均经独立探针确认。 |
| **W28-H02** 正式 fixture 场景同步 | **CLOSED** | 4 个新场景路由、参数与工作区输入均已完整对齐，独立路由探针通过。 |
| **W28-H03** 时间独立核对 | **CLOSED** | 独立 UTC 探针基准建立，能可靠拒绝整列错时、跨阶段错时与缺失变异。 |
| **W28-H04** 实际分页证据闭环 | **CLOSED** | 真实 IPC 观察记录完整（首屏 300 + 4 页推进 + 游标连续 + 旧失败落地），5 种结构破坏反例均被可靠拒绝。 |
| **W28-H05** 会话残留方向修复 | **CLOSED** | 判据修正为无交集，使用真实非空第二会话（8 行）作为正向样本，注入反例均能准确捕获。 |
| **W28-H06** 查询重试可见与恢复 | **CLOSED** | 独立 retry 进程链路闭环，`Set#size` 修复后真实 Electron 运行通过，未发现断言降级。 |
| **W28-H07** 历史协议运行回归 | **CLOSED (开发机)** | 开发机外置 legacy 协议运行完整通过，原生 smoke 正确保持平台门禁标记。 |
| **W28-H08** 清理未确认 | **NOT_PERFORMED** | 依既定合同与安全边界合法保留，未伪造测试结果，仅限制对应子项签发。 |

**独立复验裁决**：
`DEVELOPER_ACCEPTANCE_TOOLS_REPAIR_VERIFIED_PASS`
执行 agent 交回材料中所述的工具修复与开发机证据全部真实有效，反例复测与静态回归完全通过。

---

## 5. 未执行项与下一步推进指引

### 5.1 当前明确的未执行项（不可代签、不可伪造）

1. **WIN7-28 候选双干净工作树构建**（`NOT_PERFORMED`）：
   - 当前工作树存在 11 个修改文件（尚未执行本地提交），故工作树尚未处于 `clean HEAD` 状态；
   - 构建器 `build-a9-product-v3.mjs` 要求提交后的确定性源码、两个独立目录逐字节一致比对及 manifest `source_dirty=false`。
2. **候选外独立 release authority 签署与 SHA-256 pin**（`NOT_PERFORMED`）：
   - 须在候选构建生成确定性 ZIP 及 manifest 后由外部独立签署，不可由 agent 自签。
3. **候选内正式 fixture 实机运行与 Win10/Win7 验收**（`NOT_PERFORMED`）：
   - 须部署至目标 Windows 平台执行。

### 5.2 下一步推进动作（执行次序）

1. **第一步（本地提交）**：
   在 `codex/ui-optimization` 分支上，将已验证的 11 个修改文件及本次任务文档加入暂存并提交（注意：**不得**使用 `git add -A`，严格排除 Alpha 2 及未跟踪资产，不得推送远程仓库），形成用于 WIN7-28 候选构建的确定性 `source_commit` HEAD。
2. **第二步（双干净工作树构建 WIN7-28 候选）**：
   依据 ADR-0121 与 `release/win7-product-v3/README.md`，使用锁定输入（Electron 22.3.27、D-013 v25、SQLite ABI 110）在两个隔离目录执行确定性双构建，生成 `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip` 并比对逐字节一致性。
3. **第三步（更新状态与准备外部放行材料）**：
   同步 `docs/STATUS.md` 与构建输出结果，准备交付外部 authority 签署及目标机验收。

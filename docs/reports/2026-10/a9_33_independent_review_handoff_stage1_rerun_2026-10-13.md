# A9-33 独立审核交接包（第一段复核第二轮，2026-10-13，绑定修复提交 8c16ffd9…）

本包供 codex 对 A9-33 的修复提交 `8c16ffd941b5ac57d133b2039bfa01b8bd24ffd1` 做第一段复核的第二轮。上一轮对 `905bf760…` 的结论是“不建议进入预演授权评审”（0 个 P0、8 组 P1、3 组 P2），见 [A9-33 §6.10](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#610-codex-第一阶段复核与修复轮2026-10-13)。
证据层级为开发机。驱动、冒烟、桌面控制器没有在 Electron、PowerShell、Win10、Win7 上运行过，全部 NOT_PERFORMED。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由负责人决定是否登记。负责人已于 2026-10-13 批准把本提交发给 codex 复核。

## 0. 审核会话启动说明

审核者是负责人另开的新会话，不带执行代理的上下文，也不是实现方。
审核者只读本文件和第 1 节列出的提交，不写原隔离树、主工作区和已有 `.acceptance`。
审核者在自己的空目录复算，把结论写进自己目录的 `review-conclusion.md`，并向负责人报告。
不联网、不下载、不启动 Electron、不访问 Win10 或 Win7、不提交、不推送。
结论按 P0、P1、P2、信息分级。每条写 `文件:行`、依据和复现方式。没有发现时，写明检查了什么。
最后给出一句话：是否建议在该提交上进入预演授权。

复核分三段，本包只覆盖第一段的第二轮：

| 段 | 对象 | 时点 |
|---|---|---|
| 一 | 实现提交的源码与开发机检查（本包为第二轮） | 现在 |
| 二 | 预演产生的证据和驱动修正（若有） | 预演之后，负责人另行提供 |
| 三 | 正式执行的原始证据与报告核验 | 正式执行之后、门 B 之前 |

## 1. 对象与保护边界

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送 |
| 复核对象 | `8c16ffd941b5ac57d133b2039bfa01b8bd24ffd1`（父 `d027af7d3277c2e0a0027e5247def93c185705ad`）。本提交改 9 个文件，+574、−56 |
| 提交链 | `7e96f561…`（A9-32 尖端）→ `905bf760…`（上一轮复核对象，20 个文件）→ `d027af7d…`（只改 `docs/`）→ `8c16ffd9…`（本轮复核对象） |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下共 20 个文件，+6509、−31，与 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径)的 20 个路径一致 |
| 任务书与合同 | [A9-33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §3、§6.1、§6.2、§6.9、§6.10；[A9-32](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md) §5、§7.10 |
| 保护边界 | 不得改动旧取证组件和产品语义。20 个路径之外的非 `docs/` 文件必须没有差异 |

必须从提交取得文件，不能拿工作区文档对照。`8c16ffd9…` 之后的提交只改 `docs/`，不属于源码复核对象。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d /private/tmp/a9-33-independent-review.XXXXXX)
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -C "$REVIEW_DIR" -c core.fsmonitor=false checkout -q 8c16ffd941b5ac57d133b2039bfa01b8bd24ffd1
git -C "$REVIEW_DIR" -c core.fsmonitor=false rev-parse HEAD
MAIN=/Users/qlyf/Developer/win7-coding-Agent
for mod in . $(cd "$MAIN" && echo src/*); do
  [ -d "$MAIN/$mod/node_modules" ] || continue
  mkdir -p "$REVIEW_DIR/$mod/node_modules"
  for entry in "$MAIN/$mod/node_modules"/* "$MAIN/$mod/node_modules/.bin" "$MAIN/$mod/node_modules/.package-lock.json"; do
    [ -e "$entry" ] || continue
    [ "$(basename "$entry")" = "@win7-agent" ] && continue
    ln -s "$entry" "$REVIEW_DIR/$mod/node_modules/$(basename "$entry")"
  done
done
```

预期：`rev-parse` 输出 `8c16ffd941b5ac57d133b2039bfa01b8bd24ffd1`。依赖搭建不链 `@win7-agent`；模块清单由主工作区目录展开，不依赖当前目录。
这里用本地克隆而不是 `git archive`，因为包测试和 `docs:check` 需要 `.git`。克隆只读本地仓库，不联网。

第二步：核对路径清单。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 8c16ffd941b5ac57d133b2039bfa01b8bd24ffd1 | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
cat > ../a9-33-expected-paths.txt <<'EOF'
release/win7-product-v3/A9_BATCH2_WIN7_VALIDATION.md
release/win7-product-v3/README.md
release/win7-product-v3/RUN_A9_BATCH2_INTEGRITY.cmd
release/win7-product-v3/RUN_A9_BATCH2_REPORT_VERIFY.cmd
release/win7-product-v3/RUN_A9_BATCH2_SMOKE.cmd
release/win7-product-v3/a9-32-input-lock.json
release/win7-product-v3/a9-batch2-desktop-controller.ps1
release/win7-product-v3/a9-batch2-desktop-request.cjs
release/win7-product-v3/a9-batch2-fixtures.cjs
release/win7-product-v3/a9-batch2-input-lock.json
release/win7-product-v3/a9-batch2-package-integrity.cjs
release/win7-product-v3/a9-batch2-report.cjs
release/win7-product-v3/a9-batch2-smoke.cjs
scripts/release/build-a9-product-v3.mjs
scripts/release/test/a9-batch2-package.test.mjs
scripts/release/test/a9-package.test.mjs
src/shell/product/a9-package-runtime.js
src/shell/tests/product/a9-batch2-contract.test.ts
src/shell/tests/product/a9-batch2-driver-entry.cjs
src/shell/tests/product/a9-package-runtime.test.ts
EOF
diff ../a9-33-expected-paths.txt ../a9-33-changed-paths.txt && echo PATHS_MATCH
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 8c16ffd941b5ac57d133b2039bfa01b8bd24ffd1 -- release scripts src
git -c core.fsmonitor=false diff --name-only 905bf760b6f32f023fdf76f9f45b629098f0d7bd d027af7d3277c2e0a0027e5247def93c185705ad | grep -v '^docs/' | wc -l
git -c core.fsmonitor=false diff --shortstat 8c16ffd941b5ac57d133b2039bfa01b8bd24ffd1^ 8c16ffd941b5ac57d133b2039bfa01b8bd24ffd1
```

预期：输出 `PATHS_MATCH`；第一条统计含 `20 files changed, 6509 insertions(+), 31 deletions(-)`；`905bf760…` 到 `d027af7d…` 的非 `docs/` 文件数为 `0`；最后一条统计为 `9 files changed, 574 insertions(+), 56 deletions(-)`。
清单与改动路径有任何差异，即为 P0：提交越过了 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的白名单。

第三步：开发机检查。同一 shell 中执行。顺序有意义：先构建七个模块并还原被改写的受跟踪产物，再跑包测试和 jest。包测试要求 `src/*/dist` 已在本检出里构建，且受跟踪文件干净。

```sh
cd "$REVIEW_DIR"
export PATH=/Users/qlyf/.nvm/versions/node/v20.17.0/bin:$PATH NPM_CONFIG_OFFLINE=true
node --version
npm run verify:quick
git -c core.fsmonitor=false restore src/runner/dist
node --test scripts/release/test/a9-batch2-package.test.mjs scripts/release/test/a9-package.test.mjs
npm test --workspace=@win7-agent/shell -- --runInBand --runTestsByPath tests/product/a9-batch2-contract.test.ts tests/product/a9-package-runtime.test.ts
npm run docs:check
git -c core.fsmonitor=false diff --check
git -c core.fsmonitor=false status --short | wc -l
```

预期：

| 步骤 | 预期 |
|---|---|
| `node --version` | `v20.17.0` |
| `verify:quick` | 退出码 0；会让 `src/runner/dist` 的 24 个文件变脏，随后立即还原 |
| `node --test` | 119 通过、0 失败，约 12 分钟 |
| shell jest | 2 个套件、94 个用例通过（执行代理在无沙箱环境实测）。部分用例需要回环监听；上一轮在 codex 沙箱里有 4 个用例因监听被拒（`EPERM`）失败。若本轮仍有 `EPERM` 失败，请逐个列出用例名并确认原因是沙箱拒绝监听，不要与产品缺陷混写 |
| 还原后 `status` 行数 | 0 |
| `docs:check` | `ok`，该提交的内容为 324 个文件 |
| `diff --check` | 无输出 |

被跟踪的 `src/runner/dist` 落后于源码是已知问题，`verify:quick` 会改写它。必须还原，不能提交。
包测试要在不被改动的检出里整体运行，测试期间不要改动该目录。

实测说明（2026-10-13，执行代理，开发机，Node 20.17.0）：第 2 节的三个 `sh` 代码块原文抽出后，在 `8c16ffd9…` 的全新克隆里从非主工作区目录一次执行，退出码 0。
结果：`rev-parse` 输出 `8c16ffd9…`；`PATHS_MATCH`；累计统计为 20 个文件、+6509/−31；`905bf760…` 到 `d027af7d…` 的非 `docs/` 文件数为 0；修复提交统计为 9 个文件、+574/−56；`verify:quick` 通过；`node --test` 119 通过、0 失败（733 秒）；shell jest 2 个套件、94 个用例通过；`docs:check` 为 `ok`、324 个文件；`diff --check` 无输出；还原后 `status` 为 0 行。

## 3. 第一轮 11 组发现与修复（请逐条确认是否真正关闭）

下表的“修复位置”由执行代理给出。请从源码和测试独立确认，不要采信本表。

| 编号 | 第一轮发现 | 修复位置与回归用例 |
|---|---|---|
| P1-1 | p09 请求缺 `--release-authority` 与 pin，报告脚本无法启动 | `a9-batch2-desktop-request.cjs` 的 `externalsNeeded`、`argvForRequest`；用例 “a report request must carry the pinned authority…” |
| P1-2 | B2-CH-05 第 2 条期望 `cancelled`，产品把被停止的继续轮次存为 `interrupted` | 驱动 `retryableStopStatus`；用例 “stopping a continuation turn leaves the task retryable…”（真实 `createA9AgentRuntime`，Node） |
| P1-3 | 驱动 `ERROR` 或非零退出时 PASS 断言仍可使阶段 PASS | `a9-batch2-fixtures.cjs` 的 `finalizePhaseResult`；用例 “a named phase failure outranks…”、“a driver ERROR or non-zero exit fails the phase…” |
| P1-4 | 消费请求先校验后追加，并发可重放 | `consumeRequest` 的独占 `mkdir`；用例 “consuming claims the attempt directory exclusively…”、“two processes consuming the same request…” |
| P1-5 | `complete` 不核对账本，报告器接受孤立 PASS | `completeRequest`；报告器 `LEDGER_COMPLETION_ORPHAN` 与 `NEG-ORPHAN-COMPLETION`；用例 “a completion needs its own consumption…”、“the report verifier rejects a completion that no consumed request produced”、包测试 “batch-2 report verifier…” |
| P1-6 | 进程表查询失败返回空、树为空仍 PASS，且“同实例退出码”从外部不可观测 | 见下方收窄；`a9-batch2-smoke.cjs` 的 `finishChainEvidence`；用例 “the normal-exit tree assertion needs an observed non-empty tree…” |
| P1-7 | `guardRefused` 对缺失计数判相等；DOM 帧先被数据库帧过滤 | 驱动 `guardRefused`、`evaluateDomAfterDb`；用例 “display before persistence is found from stored timestamps…”、“guard sub-results never turn an unobserved fact into PASS” |
| P1-8 | 控制器丢弃 `IsProcessInJob` 返回值 | `a9-batch2-desktop-controller.ps1` 的 `$jobQueryOk`；请求脚本把 `unknown` 读作 `null`；用例 “the controller never turns a failed Job query into "not in a Job"” |
| P2-1 | M2、M5 反例存活 | 用例 “an UNKNOWN or NOT_PERFORMED assertion never lets a case or a phase pass”；包测试 “batch-2 producer refuses a drifted lock…” 新增 build-kit 四个字段的变异 |
| P2-2 | `bindings`、`target`、`external_files` 条目未封闭额外键 | `structuralProblems`；用例 “bindings, target and external entries are closed to unknown keys” |
| P2-3 | B2-UI-02 未观察继续卡，且把页面缩放称为 DPI | 驱动 B2-UI-02 段；合同文字改为“页面缩放，不是 Windows DPI 缩放” |

**P1-6 收窄**（负责人 2026-10-13 确认，见 [A9-33 §6.10](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#610-codex-第一阶段复核与修复轮2026-10-13)）：
退出码和时间只记父进程直接启动的产品进程；driver、helper、Shell 子孙进程按“进程号加创建时间”核对退出后不存在，并记录观察缺席的时刻；退出前树为空、查询失败或进程列表失败时记 `UNKNOWN`。
请判断这一收窄是否放宽了“无存活进程”的判据，以及 §6.10、套件说明与合同文字（`a9-batch2-fixtures.cjs` 的 `B2-CH-06-NORMAL-EXIT`）是否一致。

## 4. 请重点复核修复引入的新风险

按风险从高到低。

1. **独占占用的语义。** `consumeRequest` 用非递归 `mkdir` 做互斥，校验失败而未记录时用 `rmdirSync` 释放空目录。请核对：释放与另一进程的占用之间是否有竞态；`EEXIST` 之外的错误码（Windows 上的 `EPERM`、`EACCES`）是否会被误当作成功；崩溃遗留的占用保持索引关闭，是否会使正常运行卡死而没有出口。
2. **完成记录的前提。** `completeRequest` 现在读结果文件判断 PASS。请核对读文件与账本追加之间的顺序，以及 `derivedResult` 路径是否仍能产生合法的 FAIL 完成项。
3. **降级是否掩盖首个失败。** `finalizePhaseResult` 在带失败类且原状态为 PASS 时降为 FAIL，并写 `first_failure`。请核对已有的首个失败不会被覆盖，`phaseResultProblems` 对降级结果的校验没有新矛盾。
4. **`retryableStopStatus` 是否过宽。** 驱动现在接受 `interrupted` 或 `cancelled` 作为“可重试的停止”。请对照产品的 `persistTurnResult` 和 A9-32 的“回到可操作的中断卡”，确认没有让不可重试的状态通过 B2-CH-05 第 2 条。
5. **落盘时间比较。** `evaluateDomAfterDb` 用 `a9_events.created_at` 与 DOM 读取结束时刻比较。请核对 `created_at` 确为插入时刻、其精度与时钟来源，以及同一毫秒的边界会判成什么。
6. **控制器的三值判断。** `$jobText` 与 `$jobJson` 的 PowerShell 2.0 写法：`[ref]` 参数、`.ToString().ToLower()`、字符串比较。该脚本在开发机无法执行，只能静态审。
7. **报告器必需负例。** `REQUIRED_NEGATIVES` 要求 8 个负例全部出现且通过。请核对没有因某个负例被跳过而静默降低要求。
8. **页面缩放与继续卡。** B2-UI-02 现在向各布局注入继续卡并核对其按钮可用；请核对注入方式与 B2-CONT-03 的注入一致，且用后清理。

## 5. 第一轮驱动假设清单的变化

第一轮 13 条驱动假设见 [上一份交接包](a9_33_independent_review_handoff_2026-10-12.md)第 4 节，其中第 8 条（`sendInputEvent` 序列）在第一轮为 UNKNOWN，仍未验证。第 5 条（停止继续轮次后的状态）已由真实运行时测试核对，结论是产品存为 `interrupted`。
本轮新增的假设：

| # | 驱动假设 | 对照产品位置 |
|---|---|---|
| 14 | `a9_events.created_at` 是事件行插入时的 ISO 时间 | `a9-persistence.ts` 的事件写入；驱动读取处 `a9-batch2-driver-entry.cjs` 约 469–472 行 |
| 15 | 流区域的输出令牌能从 DOM 读出，数据库没有的令牌即幽灵帧 | `renderer/a9-workbench.js` 的流渲染；驱动 `evaluateDomAfterDb` |
| 16 | B2-UI-02 的各布局下 `section.continuation-card button` 存在且可见 | `renderer/a9-workbench.js` 的 `updateContinuationCard`；驱动约 1245–1306 行 |
| 17 | `webContents.setZoomFactor(1.25)` 等同页面缩放 125%，不是 Windows DPI | Electron 22 行为，未验证 |

## 6. 反例

第一轮的五个反例中，M1、M3、M4 被拦住，M2、M5 存活。本轮请审核者在自己的目录重做五个，并另试下列三个。变更须在审核者自己的目录内完成并恢复。

| 变更 | 预期被哪个测试拦住 |
|---|---|
| `finalizePhaseResult` 把 `UNKNOWN` 当作 PASS | “an UNKNOWN or NOT_PERFORMED assertion never lets a case or a phase pass” |
| 把 `a9-batch2-input-lock.json` 的 managed 锁摘要改一位 | 包测试锁漂移用例新增的 build-kit 变异 |
| `consumeRequest` 的 `mkdirSync(attempt)` 改回递归创建 | “consuming claims the attempt directory exclusively…” 与双进程竞争用例 |
| `completeRequest` 去掉消费记录核对 | “a completion needs its own consumption…” |
| 报告器 `REQUIRED_NEGATIVES` 去掉 `NEG-ORPHAN-COMPLETION` | 包测试 “batch-2 report verifier…” |

## 7. 不在范围

Win7 与 Win10 的任何动作、预演与正式执行的授权、候选冻结、关口 A 与 B、ADR-0155 的接受、A9-32 `DEVELOPER_VERIFIED` 的签发、完整 Alpha 2 裁决。
本包不请求任何执行授权。复核者的结论不构成关口签署。

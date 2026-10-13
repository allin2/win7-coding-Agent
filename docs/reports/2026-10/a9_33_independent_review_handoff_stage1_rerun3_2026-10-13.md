# A9-33 独立审核交接包（第一段复核第三轮，2026-10-13，绑定第二修复提交 0c163c24…）

本包供 codex 对 A9-33 的第二修复提交 `0c163c24f6e0b6a8d693c21d83dfbd1897405304` 做第一段复核的第三轮。第二轮对 `8c16ffd9…` 的结论是“不建议进入预演授权评审”（0 个 P0、4 组 P1、2 组 P2），见 [A9-33 §6.11](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#611-codex-第一阶段第二轮复核与第二修复轮2026-10-13)。
证据层级为开发机。驱动、冒烟、桌面控制器没有在 Electron、PowerShell、Win10、Win7 上运行过，全部 NOT_PERFORMED。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由负责人决定是否登记。负责人已于 2026-10-13 批准把本提交发给 codex 复核。

## 0. 审核会话启动说明

审核者是负责人另开的新会话，不带执行代理的上下文，也不是实现方。
审核者只读本文件和第 1 节列出的提交，不写原隔离树、主工作区和已有 `.acceptance`。
审核者在自己的空目录复算，把结论写进自己目录的 `review-conclusion.md`，并向负责人报告。
不联网、不下载、不启动 Electron、不访问 Win10 或 Win7、不提交、不推送。

目录与磁盘纪律（第一轮、第二轮都因磁盘出过偏差或故障）：

1. 所有命令先执行 `export TMPDIR="$PWD/tmp"`，使包测试的夹具落在复核根内。
2. 需要再克隆时用 `git clone --no-hardlinks`，不用 `cp -R`（`node_modules` 是指向主工作区的符号链接，复制会展开成数 GB）。
3. 写最终报告前清理自己根里的 `tmp` 夹具，使复核根占用小于 3 GB。

结论按 P0、P1、P2、信息分级。每条写 `文件:行`、依据和复现方式。没有发现时，写明检查了什么。
最后给出一句话：是否建议在该提交上进入预演授权。

复核分三段，本包只覆盖第一段的第三轮：

| 段 | 对象 | 时点 |
|---|---|---|
| 一 | 实现提交的源码与开发机检查（本包为第三轮） | 现在 |
| 二 | 预演产生的证据和驱动修正（若有） | 预演之后，负责人另行提供 |
| 三 | 正式执行的原始证据与报告核验 | 正式执行之后、门 B 之前 |

## 1. 对象与保护边界

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送 |
| 复核对象 | `0c163c24f6e0b6a8d693c21d83dfbd1897405304`（父 `46bce3a001b30a0f0a904ea6bbd0fcb08f4f1c12`）。本提交改 7 个文件，+235、−43 |
| 提交链 | `7e96f561…`（A9-32 尖端）→ `905bf760…`（第一轮复核对象，20 个文件）→ `d027af7d…`（只改 `docs/`）→ `8c16ffd9…`（第二轮复核对象，9 个文件）→ `46bce3a0…`（只改 `docs/`）→ `0c163c24…`（本轮复核对象） |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下共 20 个文件，+6701、−31，与 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径)的 20 个路径一致 |
| 任务书与合同 | [A9-33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §3、§6.1、§6.2、§6.9、§6.10、§6.11；[A9-32](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md) §5、§7.10 |
| 保护边界 | 不得改动旧取证组件和产品语义。20 个路径之外的非 `docs/` 文件必须没有差异 |

必须从提交取得文件，不能拿工作区文档对照。`0c163c24…` 之后的提交只改 `docs/`，不属于源码复核对象。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -C "$REVIEW_DIR" -c core.fsmonitor=false checkout -q 0c163c24f6e0b6a8d693c21d83dfbd1897405304
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

预期：`rev-parse` 输出 `0c163c24f6e0b6a8d693c21d83dfbd1897405304`。依赖搭建不链 `@win7-agent`；模块清单由主工作区目录展开，不依赖当前目录。
这里用本地克隆而不是 `git archive`，因为包测试和 `docs:check` 需要 `.git`。克隆只读本地仓库，不联网。
`mktemp` 在当前目录（复核根）下以绝对路径创建 `review.XXXXXX`（后面的块会在检出内切换目录，相对路径会失效）；`../a9-33-*.txt` 落在复核根，这是预期的。

第二步：核对路径清单。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 0c163c24f6e0b6a8d693c21d83dfbd1897405304 | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
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
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 0c163c24f6e0b6a8d693c21d83dfbd1897405304 -- release scripts src
git -c core.fsmonitor=false diff --name-only 905bf760b6f32f023fdf76f9f45b629098f0d7bd d027af7d3277c2e0a0027e5247def93c185705ad | grep -v '^docs/' | wc -l
git -c core.fsmonitor=false diff --name-only 8c16ffd941b5ac57d133b2039bfa01b8bd24ffd1 46bce3a001b30a0f0a904ea6bbd0fcb08f4f1c12 | grep -v '^docs/' | wc -l
git -c core.fsmonitor=false diff --shortstat 0c163c24f6e0b6a8d693c21d83dfbd1897405304^ 0c163c24f6e0b6a8d693c21d83dfbd1897405304
```

预期：输出 `PATHS_MATCH`；第一条统计含 `20 files changed, 6701 insertions(+), 31 deletions(-)`；`905bf760…` 到 `d027af7d…` 的非 `docs/` 文件数为 `0`；`8c16ffd9…` 到 `46bce3a0…` 的非 `docs/` 文件数为 `0`；最后一条统计为 `7 files changed, 235 insertions(+), 43 deletions(-)`。
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
| `node --test` | 120 通过、0 失败，约 9 到 13 分钟 |
| shell jest | 2 个套件、100 个用例通过（执行代理在无沙箱环境实测）。上一轮在 codex 沙箱里有 6 个用例因回环监听被拒（`listen EPERM 127.0.0.1`）失败，用例名见下表。若本轮仍有 `EPERM` 失败，请逐个列出用例名并确认原因是沙箱拒绝监听，不要与产品缺陷混写 |
| 还原后 `status` 行数 | 0 |
| `docs:check` | `ok`，该提交的内容为 328 个文件 |
| `diff --check` | 无输出 |

上一轮的 6 个沙箱失败用例（均在 `a9-batch2-contract.test.ts`，仅作对照，不替代你在本轮的实测）：

| # | 用例 |
|---|---|
| 1 | the loopback Provider answers scripted steps, records them, holds on demand and reports counters |
| 2 | a driver phase applies driver assertions, keeps unobserved ones open and names a failed mode |
| 3 | a driver ERROR or non-zero exit fails the phase even when every assertion was already recorded as PASS |
| 4 | a kill-on-marker mode that was not killed by the marker fails the phase |
| 5 | wrong owner, revision drift, residue and unreadable mode settings each refuse a continue and send nothing |
| 6 | stopping a continuation turn leaves the task retryable: interrupted rows and a new enabled card |

被跟踪的 `src/runner/dist` 落后于源码是已知问题，`verify:quick` 会改写它。必须还原，不能提交。
包测试要在不被改动的检出里整体运行，测试期间不要改动该目录。

实测说明：见本文末尾“执行代理实测记录”。

## 3. 第一轮 11 组与第二轮 6 组发现（请逐条确认是否真正关闭）

第二轮对第一轮 11 组的结论是 5 组关闭、6 组部分关闭。下表的“修复位置”由执行代理给出，请从源码和测试独立确认，不要采信本表。

| 第一轮编号 | 第二轮结论 | 第二轮发现 | 本轮修复位置与回归用例 |
|---|---|---|---|
| P1-1、P1-3、P1-5、P1-8、P2-2 | 已关闭 | 无 | 本轮未改这些修复；请抽查它们的测试仍通过 |
| P1-6 | 部分关闭 | R1：退出后进程列表的非零状态或 `error` 不抛异常，部分输出仍使断言 PASS | `a9-batch2-smoke.cjs` 的 `listProcesses`（状态非 0、`error`、抛异常均为 `failed`），由 `collectEnvironment`、`evaluateEnvironment`、`finishChainEvidence`、`runPostflightPhase` 使用；用例 “the normal-exit tree assertion needs an observed non-empty tree…”（含非零状态、`error`、`status: null`）、“postflight fails on a leaked secret…”（三种失败列表）、“the environment phase does not call stale trees absent when the process listing failed” |
| P1-2 | 部分关闭 | R2：驱动把 `cancelled` 也当作可重试停止 | 驱动 `retryableStopStatus` 只接受 `interrupted`；新增 `stopLeavesActionableCard`（`canContinue` 为真、中断轮次编号与恢复修订都更换，字段缺失为 `UNKNOWN`）；用例 “a stopped continuation turn is retryable only as interrupted, and only when a new actionable card exists”（真实 `createA9AgentRuntime`） |
| P1-4 | 部分关闭 | R3：同一索引的不同阶段可被两个进程同时消费，账本索引成为 `[1,2,2]` | `a9-batch2-desktop-request.cjs` 的 `consumeRequest` 在占用后检查同索引的其他目录；用例 “another claim on the same index, even for a different phase, stops the consumer and leaves no claim of its own”、“two processes consuming one index for different phases at the same moment never both win” |
| P1-7 | 部分关闭 | R4：流区令牌漏掉 `out`；存储时间与读取结束同毫秒时放行 | 驱动 `OUTPUT_TOKEN_PATTERN` 含 `out`；`evaluateDomAfterDb` 同毫秒记 `tied_same_millisecond` 为 `UNKNOWN`；用例 “stream output tokens include stdout, so a never-stored out frame is a ghost and a same-millisecond persist is not proof” |
| P2-3 | 部分关闭 | R5：布局检查不看 `disabled` | 驱动 `cardUsable` 要求 `disabled === false`；`evaluateUiLayouts` 对每种布局与较矮窗口都要求可用；用例 “the layout verdict needs an enabled, visible, reachable continuation card in every layout and the shorter window” |
| P2-1 | 部分关闭 | R6：正式锁摘要改一位（M5）与必需负例名单删项（M8）存活 | 包测试 “the committed formal and developer locks name a build kit that the committed approval registry approves” 直接读已提交的两份锁；`a9-batch2-report.cjs` 的 `REQUIRED_NEGATIVES` 提到模块级并导出；用例 “the report verifier requires exactly the closed list of negative controls” |

**P1-6 收窄**（负责人 2026-10-13 确认，见 [A9-33 §6.10](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#610-codex-第一阶段复核与修复轮2026-10-13)）：
退出码和时间只记父进程直接启动的产品进程；driver、helper、Shell 子孙进程按“进程号加创建时间”核对退出后不存在，并记录观察缺席的时刻；退出前树为空、查询失败或进程列表失败时记 `UNKNOWN`。
第二轮已确认该收窄没有放宽“无存活进程”判据，且 §6.10、套件说明与 `B2-CH-06-NORMAL-EXIT` 文字一致；请确认本轮改动没有破坏这一点。

## 4. 请重点复核修复引入的新风险

按风险从高到低。

1. **同索引互斥的完整性。** `consumeRequest` 先独占自己的 `NN-<phase>` 目录，再列目录检查同前缀的其他目录。请核对：两个进程都已占用、都发现对方时是否都退出且都释放（向关闭方向失败，不双消费）；前缀匹配是否会把 `01-` 与 `010-` 之类混淆（`request_index` 的取值范围见 `structuralProblems`）；崩溃遗留的占用保持该索引关闭，是否使正常运行卡死而没有出口；校验失败的请求释放自己空目录时，是否会误删他人的目录。Windows 文件系统上的并发行为为 `UNKNOWN`。
2. **`listProcesses` 的覆盖面。** 请在源码里确认：除 `listProcesses` 外，没有其他位置直接使用 `exec('wmic_processes')` 的结果而绕过 `failed`；列表非空但被截断（部分输出）的情形是否仍有出口；`processes_total > 0` 作为“列表有效”的判据，在真实 Win7 上是否可能误判。
3. **R2 的状态组合。** B2-CH-05 第 2 条现在是 `withGuard(retryableStopStatus(newStatus), actionable)`。请核对 `actionable` 为 `null` 时断言为 `UNKNOWN` 而不是 PASS，并确认没有让停止后“任务回到空闲而不是中断卡”的情形通过。
4. **令牌模式的误报。** `OUTPUT_TOKEN_PATTERN` 现在匹配 `tick|out|err` 加数字。请核对 `_domStream` 只取流区文本，页面其他区域的 `out 1` 这类词不会进入幽灵帧判定；同时核对 B2-S02 在正常运行中仍有机会得到 PASS，而不是因同毫秒平局永远 `UNKNOWN`。
5. **布局探针的 `disabled`。** 请核对注入的继续卡在默认状态下 `disabled === false`，探针读取的是按钮本身的属性而非 `aria-disabled`，并且“没有继续卡”仍记 `UNKNOWN`。
6. **测试保护的位置。** R6 把保护移到已提交的两份锁与导出的 `REQUIRED_NEGATIVES`。请核对包测试里是否还有只变异自拟输入、不变异已提交文件的类似用例。
7. **夹具残余。** B2-UI-02 注入的任务、轮次、事件行不会被删除，留在一次性数据根（第二轮已确认）；第二轮交接包 §4.8 写“用后清理”有误，已更正。请核对套件说明 `A9_BATCH2_WIN7_VALIDATION.md` 的措辞与源码一致。
8. **第二轮未复核到的路径。** 第二轮 jest 有 6 项因沙箱失败（见第 2 节），其中 2 项涉及本轮改动（继续轮次停止、驱动阶段）。请在你的环境尽量运行它们，不能运行的列为 `UNKNOWN`，不要补签 PASS。

## 5. 驱动假设清单的变化

第一轮 13 条驱动假设见 [第一份交接包](a9_33_independent_review_handoff_2026-10-12.md)第 4 节，其中第 8 条（`sendInputEvent` 序列）仍为 UNKNOWN。第 5 条（停止继续轮次后的状态）已由真实运行时测试核对，结论是产品存为 `interrupted`。
第二轮的假设 14～17 的结论：14 成立（限源码定义，不能扩为事务提交时刻）；15 不成立（检测完整性，已由 R4 修复）；16、17 为 UNKNOWN（真实布局、Electron 22 缩放）。
本轮新增的假设：

| # | 驱动假设 | 对照产品位置 |
|---|---|---|
| 18 | S02 的 stdout 帧在流区渲染为 `out N`，与 `tick N`、`err N` 同属流区令牌 | `renderer/a9-workbench.js` 的流渲染；驱动 `OUTPUT_TOKEN_PATTERN` |
| 19 | 恢复快照的 `canContinue` 仅在存在 `interrupted` 的任务与轮次时为真，停止后会生成新的中断轮次编号与恢复修订 | `a9-persistence.ts` 的恢复事实；驱动 `stopLeavesActionableCard` |
| 20 | `wmic` 在失败时返回非零状态或 `error`，而不是抛异常；列表失败时可能仍输出部分行 | 真实执行器的返回协议（`a9-batch2-smoke.cjs` 约 61–66 行）；Windows 实际行为 `UNKNOWN` |

## 6. 反例

第二轮的 8 个反例：M1 删除 guard 请求计数相等、M2 UNKNOWN 晋为 PASS、M3 滚动容差 2→500、M4 删除 CMD CRLF 判据、M5 正式 managed 锁摘要改一位、M6 `mkdir` 改为递归、M7 删除 `complete` 消费核对、M8 必需名单删除 ORPHAN。第二轮中 M5、M8 存活，其余被拦住。
本轮请审核者在自己的目录重做这 8 个，并另试下列 6 个。变更须在审核者自己的目录内完成并恢复，并核对哈希。

| 变更 | 预期被哪个测试拦住 |
|---|---|
| `listProcesses` 去掉对 `status !== 0` 与 `error` 的判断，只保留抛异常 | “the normal-exit tree assertion needs an observed non-empty tree…”、“postflight fails on a leaked secret…” |
| `retryableStopStatus` 恢复接受 `cancelled` | “a stopped continuation turn is retryable only as interrupted…” |
| `consumeRequest` 去掉同索引 `rivals` 检查 | “another claim on the same index…”、“two processes consuming one index for different phases…” |
| `OUTPUT_TOKEN_PATTERN` 去掉 `out` | “stream output tokens include stdout…” |
| `evaluateDomAfterDb` 去掉同毫秒计数 `tied` | “stream output tokens include stdout…” |
| `cardUsable` 去掉 `disabled === false` | “the layout verdict needs an enabled, visible, reachable continuation card…” |

## 7. 不在范围

Win7 与 Win10 的任何动作、预演与正式执行的授权、候选冻结、关口 A 与 B、ADR-0155 的接受、A9-32 `DEVELOPER_VERIFIED` 的签发、完整 Alpha 2 裁决。
本包不请求任何执行授权。复核者的结论不构成关口签署。

## 执行代理实测记录

2026-10-13，执行代理，开发机，Node 20.17.0。本文第 2 节三个 `sh` 代码块用脚本原文抽出，在全新空目录里以 `bash -e` 一次执行，退出码 0，总用时 528 秒。
第一次实测在第三块的 `cd "$REVIEW_DIR"` 处失败（相对路径），已把 `mktemp` 改为绝对路径后整体重跑；下列结果均来自重跑。

| 步骤 | 实测 |
|---|---|
| `rev-parse` | `0c163c24f6e0b6a8d693c21d83dfbd1897405304` |
| 路径清单 | `PATHS_MATCH` |
| 累计统计 | 20 个文件，+6701、−31 |
| `905bf760…`→`d027af7d…` 非 `docs/` 文件数 | 0 |
| `8c16ffd9…`→`46bce3a0…` 非 `docs/` 文件数 | 0 |
| 第二修复提交统计 | 7 个文件，+235、−43 |
| `node --version` | `v20.17.0` |
| `verify:quick` | 通过 |
| `node --test` | 120 通过、0 失败（481 秒） |
| shell jest | 2 个套件、100 个用例通过；该环境无沙箱，没有 `EPERM` 失败 |
| `docs:check` | `ok`，328 个文件 |
| `diff --check` | 无输出 |
| 还原后 `status` | 0 行 |

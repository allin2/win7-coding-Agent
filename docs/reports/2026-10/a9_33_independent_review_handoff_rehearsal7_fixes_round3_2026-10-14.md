# A9-33 独立审核交接包（预演 7 修复轮，第六修复轮，2026-10-14，绑定修复提交 1a2bd02f…）

本包供 codex 对 A9-33 第六修复轮的提交 `1a2bd02f65d558381458cc750577cb6b2c2b5fbc` 做复核。
本轮输入是你对第五修复轮（`c8d9113b…`）的复核报告：0 个 P0、2 个 P1（R1、R2）、2 个 P2（R3、R4），以及两个覆盖盲点（C1、B2）。负责人于 2026-10-14 批准第六修复轮（[A9-33 §6.31](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#631-第六修复轮裁决2026-10-14)）。你的报告与执行代理的处理见 [§6.30](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#630-第五修复轮实现与-codex-第-5-轮复核2026-10-14)。
证据层级：修复本身是开发机；驱动的新代码没有在 Electron、PowerShell、Win7 上运行过，全部 NOT_PERFORMED。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由负责人决定是否登记。

## 0. 审核会话启动说明

审核者是负责人另开的新会话，不带执行代理的上下文，也不是实现方。
审核者只读本文件、第 1 节列出的提交和第 3 节列出的证据，不写原隔离树、主工作区和已有 `.acceptance`。
审核者在自己的空目录复算，把结论写进自己目录的 `review-conclusion.md`，并向负责人报告。
不联网、不下载、不启动 Electron、不访问 Win10 或 Win7、不提交、不推送。

目录与磁盘纪律：

1. 所有命令先执行 `export TMPDIR="$PWD/tmp"`，使包测试的夹具落在复核根内。
2. 需要再克隆时用 `git clone --no-hardlinks`，不用 `cp -R`。
3. 写最终报告前清理自己根里的 `tmp` 夹具，使复核根占用小于 3 GB。

结论按 P0、P1、P2、信息分级。每条写 `文件:行`、依据和复现方式。没有发现时，写明检查了什么。
最后给出一句话：是否建议在该提交上进入预演 8 的授权评审。

## 1. 对象与保护边界

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送 |
| 复核对象 | `1a2bd02f65d558381458cc750577cb6b2c2b5fbc`。上一个被你复核的代码提交 `c8d9113b1261fc112d6a804ee0782f70786501d0`；两者之间的提交 `a94b9658…` 只改 `docs/`。本轮代码改 2 个文件，421 行新增、62 行删除 |
| 上一轮复核报告 | `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-review/codex-stage2-round5-20261014/codex_final_report.md`（只读）；更早的报告在同级目录 `codex-stage2-round1-20261014` 到 `codex-stage2-round4-20261014` |
| 修复提交链 | `cde53348…` → `83e03bf6…` → `f672f518…` → `a4816779…` → `2c06317c…` → `9dd3b165…` → `6679ef30…` → `1a2b2783…` → `c8d9113b…` → `1a2bd02f…`（本轮） |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 9367 insertions(+), 31 deletions(-)` |
| 任务书与合同 | [A9-33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §3、§6.1、§6.24～§6.31；[A9-32](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md) §5、§7.10 |
| 保护边界 | 不得改动产品语义和旧取证组件。20 个路径之外的非 `docs/` 文件必须没有差异。本轮不改任何产品文件，也不改夹具 |

必须从提交取得文件，不能拿工作区文档对照。本包与之后的文档提交只改 `docs/`，不属于源码复核对象。

已知限制（不得再列为发现）：KL-1、KL-2（见 §6.13）；KL-3（产品缺口：启动后台进程的 Turn 结束后渲染层不再刷新）；KL-4（[§6.24](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md)）；KL-5（[§6.27](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#627-第四修复轮裁决与-kl-52026-10-14)：PowerShell 下产品只按严格 UTF-8 解码，CP936 与 UTF-16LE 不验收）。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q 1a2bd02f65d558381458cc750577cb6b2c2b5fbc
git -c core.fsmonitor=false -C "$REVIEW_DIR" rev-parse HEAD
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

预期：`rev-parse` 输出 `1a2bd02f65d558381458cc750577cb6b2c2b5fbc`。

第二步：核对路径清单。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 1a2bd02f65d558381458cc750577cb6b2c2b5fbc | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
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
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 1a2bd02f65d558381458cc750577cb6b2c2b5fbc -- release scripts src
git -c core.fsmonitor=false diff --name-only c8d9113b1261fc112d6a804ee0782f70786501d0 1a2bd02f65d558381458cc750577cb6b2c2b5fbc -- release scripts src
git -c core.fsmonitor=false diff --shortstat c8d9113b1261fc112d6a804ee0782f70786501d0 1a2bd02f65d558381458cc750577cb6b2c2b5fbc -- release scripts src
```

预期：输出 `PATHS_MATCH`；第一条统计为 `20 files changed, 9367 insertions(+), 31 deletions(-)`；第二条列出且只列出 `src/shell/tests/product/a9-batch2-contract.test.ts`、`src/shell/tests/product/a9-batch2-driver-entry.cjs`；最后一条统计为 2 个文件、421 行新增、62 行删除。
清单与改动路径有任何差异，即为 P0：提交越过了 §6.1 的白名单。

第三步：开发机检查。同一 shell 中执行。顺序有意义：先构建模块并还原被改写的受跟踪产物，再跑包测试和 jest。

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
| `node --test` | 120 通过、0 失败，约 5 到 13 分钟 |
| shell jest | 2 个套件、216 个用例通过（contract 173、package-runtime 43；执行代理在无沙箱环境实测）。若你的沙箱禁止回环监听，会有 7 个既有用例因 `listen EPERM 127.0.0.1` 失败（与上几轮相同的 7 个）；请逐个列出用例名，不要与产品缺陷混写 |
| 还原后 `status` 行数 | 0 |
| `docs:check` | `ok`，该提交的内容为 335 个文件 |
| `diff --check` | 无输出 |

被跟踪的 `src/runner/dist` 落后于源码是已知问题，`verify:quick` 会改写它。必须还原，不能提交。
包测试要在不被改动的检出里整体运行，测试期间不要改动该目录。

## 3. 你的第 5 轮发现与本轮修复

下表“执行代理的核对”由执行代理给出，请从源码和证据独立确认，不要采信本表。驱动指 `src/shell/tests/product/a9-batch2-driver-entry.cjs`，测试指 `src/shell/tests/product/a9-batch2-contract.test.ts`。

| # | 你的发现 | 执行代理的核对 | 修复位置（驱动） | 回归用例（测试） |
|---|---|---|---|---|
| R1（P1） | B2-S03T 不要求第二次 `a9.turn.submit` 到达 IPC，请求计数缺失也 PASS | 读源码确认。预演 7 样本 `driver-audit_stop.json` 里两次提交都在 IPC 日志（05:46:46.137Z、05:46:47.916Z），请求 `17→21→21`，新判据在该样本上为 PASS | 新增 `evaluateTerminalAudit`：计数与事件数必须是非负整数，`submit_calls` 少于 2 条为 UNKNOWN；`auditStop` 在第一次 `submit` 之前取 `ipcFrom`，不固定请求总数 | “S03T: the verdict needs integer counters …”；闭包组“S03T closure (R1)”（4 个） |
| R2（P1） | 重启检查的计数、旧 Turn 状态缺失也 PASS | 读源码确认；`B2-CH-04` 第 1 项的 Turn 状态比较同类，一并处理 | 新增 `evaluateRestartCounts`、`evaluateOldTurnUnchanged`、`evaluateInterruptRecords`；`zeroAdded` 删除；`chainRecover` 经新的 `recordInterruptChecks` 记录两项；`continueRestart` 用 `withGuard` 与 `statusOf` | “restart: missing counters …”；闭包组“restart closures (R2)”（4 个） |
| R3（P2） | 额外键门槛遮住已观察到的重复继续 | 在 `c8d9113b…` 的真实评估器上复现 | `evaluateUiJourney`：任一计数大于 1 先判 FAIL（`duplicateSeen`），其余沿用 | “UI-01 (codex round 5, R3): …” |
| R4（P2） | 首轮固定增加 1 个请求会把合法重试判失败 | 读源码确认 Gateway 重试与夹具计数 | `AUDIT_FIRST_TURN_REQUESTS` 删除；`evaluateAuditHardStop` 改读 Provider 日志：窗口内带工具结果（`tool_messages` 大于 0）的请求数必须为 0，首轮至少 1 个请求，日志行数必须等于计数差；`safeRules` 取 `providerLines()` 中 `index` 大于基线的行 | “SAFE-02: …”（重写）；闭包组“SAFE-02 closure (A2, R4)”（5 个） |
| C1 | 删掉真实 `b.focus()` 的变异存活 | 成立 | 无代码改动 | UI 闭包的 `exec` 改为在假页面里运行驱动自己的脚本，`focus()` 才会设置 `activeElement` |
| B2 | `warnings` 不按 `toolCallId` 过滤的变异存活 | 成立 | 无代码改动 | S04 闭包每个提示都带另一个工具调用及其警告 |

用例变化：contract 161 → 173（+12）；package-runtime 43 不变。25 个用例、42 条断言不变。
文档措辞：你在第 5 轮指出的 §6.26 与第四轮交接包的过强表述，已在提交 `a94b9658…` 更正（[§6.30](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#630-第五修复轮实现与-codex-第-5-轮复核2026-10-14) 记录）。`docs/STATUS_LOG.md` 的旧句保留。

## 4. 请重点复核

按风险从高到低。

1. **SAFE-02 的新判据是否可靠。** “请求里出现 `role: tool` 的消息”被当作“工具结束后的再派发”。请从产品源码判断：(a) 健康产品在 `b2:audit-write` 的首个请求之前，是否可能发出带 `role: tool` 消息的请求（例如恢复消息、系统注入）；(b) `tool_messages` 是整个请求历史里的计数，同一对话里后续的 `b2:s01` 提交若被接受，其请求是否因历史而带 `tool_messages`；这种情况会让 FAIL 的原因变成历史而不是派发，是否仍符合预期（次轮增量本来就判 FAIL）；(c) 日志行数必须等于计数差，是否会因探测请求、被挂起的请求或日志写入时序误判 UNKNOWN。
2. **S03T 的新判据是否会让真实产品结构性 UNKNOWN。** 现要求第二次提交到达 `a9.turn.submit`。若组合框被禁用，点击不会产生 IPC 调用，用例变为 UNKNOWN。预演 7 样本没有这个问题（两次提交都有记录）。请判断这是可接受的保守结果，还是应当另有证据路径。
3. **重启检查。** `evaluateRestartCounts` 要求六个计数全部是非负整数；`evaluateInterruptRecords` 把“Turn 状态未读到”与“其余条件”用 `withGuard` 合并（其余条件为假时仍是 FAIL）。请核对：`B2-CH-04` 第 1 项的 `rest` 条件（`canContinue`、按钮文字、无待批准）是否与原条件一致；`recordInterruptChecks` 只被 `chainRecover` 的一行调用，`chainRecover` 本身没有闭包用例（切片需要的桩过多），请判断这个缺口是否可接受。
4. **R3 的优先级。** 任一计数大于 1 即 FAIL，与第一次 Enter 的目标和额外键无关。请判断：`continueEventsFor` 取的是该任务全部 `task_continue_requested` 事件，旅程开始前该任务不会有继续事件，所以大于 1 即两次派发；有没有合法路径使计数大于 1。
5. **同类缺陷扫描（请求）。** 缺陷类别：(a) 判据在必要事实缺失时仍给 PASS；(b) 相对计数缺固定期望，或固定期望误判合法重试；(c) 页面动作或 IPC 调用没有确认就当作已发生。已知未改的命中点：`B2-CH-05-CONTINUE` 第 1 项的 `afterDup.requests === heldCounters.requests`（`chainRecover`，驱动第 1072 行附近）没有显式计数校验；前面的 `waitFor` 读到整数 `held`，所以缺 `requests` 字段需要夹具控制端省略它，执行代理未改。请对驱动、夹具、冒烟、控制器逐类扫描并列出命中点。
6. **闭包用例的残余盲点。** 请列出本轮仍未覆盖的闭包语句，并说明哪些会让误通过逃过。

## 5. 新增的驱动假设

| # | 驱动假设 | 对照位置 |
|---|---|---|
| 46 | 一个带 `role: tool` 消息的请求只会出现在某个工具结束之后；`b2:audit-write` 的首个请求没有这种消息 | 夹具 `providerStep` 与测试里的 `asked(0)`、`asked(1)`；产品的消息构造 UNKNOWN（请你判断） |
| 47 | Provider 日志对每个计数的请求有且只有一行，`index` 等于计数加一后的值；探测请求既不计数也不入日志 | 冒烟 `a9-batch2-smoke.cjs` 的请求处理（`isProbe` 提前返回、`requestCount += 1`、`appendFileSync`） |
| 48 | S03T 的跟随提交在 4 秒等待内产生 `a9.turn.submit` 的 IPC 记录 | 预演 7 样本两条记录相隔 1.78 秒；仅一个样本 |
| 49 | 旅程开始前，该任务没有 `task_continue_requested` 事件 | 驱动 `uiContinue` 的前置夹具（预置的中断任务）；Win7 `UNKNOWN` |

此前的假设 37～45 不变（见前两轮交接包第 5 节）。

## 6. 反例

执行代理在开发机对真实驱动做了 43 个变异，全部被至少一个用例拦住（0 个存活）；每项后用备份还原，用 `cmp` 核对与备份一致，重跑 173 个用例通过。

| 组 | 变异 | 结果 |
|---|---|---|
| S03T（R1） | 不要求第二次提交（Q1）；不要求计数是整数（Q2）；`ipcFrom` 取在第一次提交之后（Q3）；`submit_calls` 不筛 action（Q4，两处）；记录硬编码 PASS（Q5）；不要求无后续 shell（Q6） | 全部拦住 |
| 重启（R2） | 计数不校验（Q7）；只校验请求计数不校验工具计数（Q8）；旧 Turn 状态不校验（Q9）；CONT-01 第 1 项忽略计数答案（Q10）；第 2 项直接比较（Q11）；CH-04 第 1 项读第二个结论（Q12）；未读到的 Turn 状态视为稳定（Q13）；忽略未观察守卫（Q14） | 全部拦住 |
| UI（R3） | 去掉重复检查（Q15）；只查忙态计数（Q16）；只查额外键之后的计数（Q17） | 全部拦住 |
| SAFE-02（R4） | 首轮可以不派发（Q18）；允许工具结果再派发（Q19）；改回首轮恰好 1 个请求（Q20）；日志不必与计数一致（Q21）；不要求 `tool_messages` 是计数（Q22）；窗口从第一行开始（Q23）；每行都算工具结果（Q24）；容忍缺 `tool_messages` 的行（Q25） | 全部拦住 |
| 覆盖盲点 | 删掉首次 `b.focus()`（C1）；`warnings` 不按工具调用归属（B2） | 全部拦住 |
| 前几轮 | A1、A1b、A1c、A1d、A2、A3、A3b、A3c、N1b、N1c、N2、N2b、T1、T2、T3、S2 | 全部拦住 |

请在你自己的目录重做你认为重要的变异，并另试下列 6 个；变更须在审核者自己的目录内完成并恢复，并核对哈希。

| 变更 | 你判断 |
|---|---|
| `evaluateAuditHardStop` 把 `facts.tool_ends === 0` 去掉 | 哪个用例拦住 |
| `auditStop` 的 `finally` 不删除触发器 | 是否有用例观察到 `DROP TRIGGER` |
| `continueRestart` 把 `oldStatusAfter` 取在 `waitIdle` 之前 | 是否有用例覆盖取值时机 |
| `recordInterruptChecks` 的两次 `record` 调换序号 | 哪个用例拦住 |
| `evaluateInterruptRecords` 的 `rest` 去掉 `pending === null` | 哪个用例拦住 |
| `safeRules` 的 `providerLines()` 在第二次提交之前读取 | 是否有用例覆盖读取时机 |

## 7. 不在范围

Win7 与 Win10 的任何动作、预演 8 与正式执行的授权、候选冻结、关口 A 与 B、ADR-0155 的接受、A9-32 `DEVELOPER_VERIFIED` 的签发、完整 Alpha 2 裁决，以及任何产品语义改动（含 KL-3 的产品修复、SAFE-02 的 Turn 行失败标记、CP936 与 UTF-16LE 解码接入，均需另立任务书）。
本包不请求任何执行授权。复核者的结论不构成关口签署。

## 执行代理实测记录

执行代理于 2026-10-14T10:11:47Z 在全新空目录 `/private/tmp/a9-33-handoff-trial-6` 按 `set -e` 顺序整体运行本文第 2 节三个代码块，退出码 0，结束于 10:18:14Z，总耗时 387 秒。证据层级：开发机，绑定提交 `1a2bd02f…`。

| 预期 | 实测 |
|---|---|
| `rev-parse` | `1a2bd02f65d558381458cc750577cb6b2c2b5fbc` |
| 路径清单 | 输出 `PATHS_MATCH` |
| 累计统计 | `20 files changed, 9367 insertions(+), 31 deletions(-)` |
| 本轮统计 | `2 files changed, 421 insertions(+), 62 deletions(-)` |
| `node --version` | `v20.17.0` |
| `verify:quick` | 退出码 0，输出“7 个 Phase 3–7 模块完成编译/静态验证” |
| `node --test` | 120 通过、0 失败、0 取消、0 跳过 |
| shell jest | 2 个套件、216 个用例通过（无沙箱环境，无 EPERM） |
| `docs:check` | `{"ok":true,"checked_files":335,"task_files":49}` |
| `diff --check` | 无输出 |
| 还原后 `status --short` 行数 | 0 |

jest 结束后仍输出一行“Jest did not exit one second after the test run has completed”，命令以退出码 0 结束；该行在此前各轮同样出现，来源为 UNKNOWN。

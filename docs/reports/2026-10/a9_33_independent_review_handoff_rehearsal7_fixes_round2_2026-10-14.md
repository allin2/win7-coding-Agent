# A9-33 独立审核交接包（预演 7 修复轮，第五修复轮，2026-10-14，绑定修复提交 c8d9113b…）

本包供 codex 对 A9-33 第五修复轮的提交 `c8d9113b1261fc112d6a804ee0782f70786501d0` 做复核。
本轮输入是你对第四修复轮（`1a2b2783…`）的复核报告：0 个 P0、1 个 P1（N1）、1 个 P2（N2），16 个变异中 A1、A2、A3 存活。负责人于 2026-10-14 批准第五修复轮（[A9-33 §6.29](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#629-第五修复轮裁决2026-10-14)）。你的报告与执行代理的处理见 [§6.28](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#628-第四修复轮的-codex-复核2026-10-14)。
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
| 复核对象 | `c8d9113b1261fc112d6a804ee0782f70786501d0`。上一个被你复核的代码提交 `1a2b2783a6a8e5685ecbb10d543c36e208ee79b8`；两者之间的提交 `9fbb68aa…` 只改 `docs/`。本轮代码改 2 个文件，317 行新增、21 行删除 |
| 上一轮复核报告 | `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-review/codex-stage2-round4-20261014/codex_final_report.md`（只读）；更早的报告在同级目录 `codex-stage2-round1-20261014`、`codex-stage2-round2-20261014`、`codex-stage2-round3-20261014` |
| 修复提交链 | `cde53348…` → `83e03bf6…` → `f672f518…` → `a4816779…` → `2c06317c…` → `9dd3b165…` → `6679ef30…` → `1a2b2783…` → `c8d9113b…`（本轮） |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 9008 insertions(+), 31 deletions(-)` |
| 任务书与合同 | [A9-33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §3、§6.1、§6.24～§6.29；[A9-32](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md) §5、§7.10 |
| 保护边界 | 不得改动产品语义和旧取证组件。20 个路径之外的非 `docs/` 文件必须没有差异。本轮不改任何产品文件，也不改夹具（首轮请求数常量放在驱动，由用例与夹具的 `b2:audit-write` 场景绑定） |

必须从提交取得文件，不能拿工作区文档对照。本包与之后的文档提交只改 `docs/`，不属于源码复核对象。

已知限制（不得再列为发现）：KL-1、KL-2（见 §6.13）；KL-3（产品缺口：启动后台进程的 Turn 结束后渲染层不再刷新，输出只到 SQLite 与 IPC 快照；预演 7 p03 再现 `dom_frames_max=0`）；KL-4（[§6.24](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md)）；KL-5（[§6.27](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#627-第四修复轮裁决与-kl-52026-10-14)：PowerShell 下产品只按严格 UTF-8 解码，CP936 与 UTF-16LE 不验收）。上一轮你已确认 KL-5 的收窄实现忠实，本轮不再请求该项复核。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q c8d9113b1261fc112d6a804ee0782f70786501d0
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

预期：`rev-parse` 输出 `c8d9113b1261fc112d6a804ee0782f70786501d0`。

第二步：核对路径清单。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 c8d9113b1261fc112d6a804ee0782f70786501d0 | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
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
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 c8d9113b1261fc112d6a804ee0782f70786501d0 -- release scripts src
git -c core.fsmonitor=false diff --name-only 1a2b2783a6a8e5685ecbb10d543c36e208ee79b8 c8d9113b1261fc112d6a804ee0782f70786501d0 -- release scripts src
git -c core.fsmonitor=false diff --shortstat 1a2b2783a6a8e5685ecbb10d543c36e208ee79b8 c8d9113b1261fc112d6a804ee0782f70786501d0 -- release scripts src
```

预期：输出 `PATHS_MATCH`；第一条统计为 `20 files changed, 9008 insertions(+), 31 deletions(-)`；第二条列出且只列出 `src/shell/tests/product/a9-batch2-contract.test.ts`、`src/shell/tests/product/a9-batch2-driver-entry.cjs`；最后一条统计为 2 个文件、317 行新增、21 行删除。
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
| shell jest | 2 个套件、204 个用例通过（contract 161、package-runtime 43；执行代理在无沙箱环境实测）。若你的沙箱禁止回环监听，会有 7 个既有用例因 `listen EPERM 127.0.0.1` 失败（与上两轮相同的 7 个）；请逐个列出用例名，不要与产品缺陷混写 |
| 还原后 `status` 行数 | 0 |
| `docs:check` | `ok`，该提交的内容为 334 个文件 |
| `diff --check` | 无输出 |

被跟踪的 `src/runner/dist` 落后于源码是已知问题，`verify:quick` 会改写它。必须还原，不能提交。
包测试要在不被改动的检出里整体运行，测试期间不要改动该目录。

## 3. 你的第 4 轮发现与本轮修复

下表“执行代理的核对”由执行代理给出，请从源码和证据独立确认，不要采信本表。

| # | 你的发现 | 执行代理的核对 | 修复位置（驱动 `a9-batch2-driver-entry.cjs`） | 回归用例（`a9-batch2-contract.test.ts`） |
|---|---|---|---|---|
| N1（P1） | SAFE-02 不约束首轮请求数（`0→2→2` 也 PASS），也不要求第二次 `a9.turn.submit` 到达 IPC | 在 `1a2b2783…` 上复现成立。预演 7 样本为 `0→1→1`；`b2:audit-write` 场景的第一次 Provider 响应只含一次 write 调用 | `AUDIT_FIRST_TURN_REQUESTS = 1`；`evaluateAuditHardStop`：基线 `requests.before` 必须是整数；首轮增量必须等于 1，否则 FAIL；第二次提交未观察到且其余条件满足时 UNKNOWN | “SAFE-02: …”（扩展：首轮 2 与 0 个请求 FAIL、FAIL 优先于未观察、基线缺失 UNKNOWN、相对基线 3→4→4 PASS、常量与夹具场景绑定）；闭包组“SAFE-02 closure (A2)” |
| N2（P2） | 额外 Enter/Space 未到达页面时，`one_dispatch_while_busy` 仍 PASS | 在 `1a2b2783…` 上复现成立。评估器只读第一次按键的 `enter_delivery` | `evaluateUiJourney`：`extrasReached` 要求额外 Enter 与额外 Space 的 `keydown` 都被页面记录；缺失为 UNKNOWN；不重按 | “UI-01 (codex round 4): the repeated-input challenge counts only when the page saw the extra keys, …” |
| 信息 | `delivered` 不绑定目标元素（`BODY` 也算） | 成立。`delivered` 只表示页面看到了键，没有说明键给了谁 | `summarizeKeyPress` 返回 `keydown_target`；`enter_journey` 在第一次 Enter 前记录 `focus()` 之后 `document.activeElement === button` 的返回值（`button_focused`）；`enterReached` 要求 `delivered`、目标为 `BUTTON` 且 `button_focused` 为真，否则两项 Enter 断言 UNKNOWN | 同上；`summarizeKeyPress` 用例带 `keydown_target` |
| A1 | 变异存活：`enter_delivery` 改取额外 Enter | 成立，驱动闭包此前没有行为用例 | 无代码改动，补闭包用例 | 闭包组“UI-01 closure (A1)”（3 个） |
| A2 | 变异存活：`safeRules` 把 `ipcFrom` 取在 `submit` 之后 | 同上 | 无代码改动，补闭包用例 | 闭包组“SAFE-02 closure (A2)”（4 个） |
| A3 | 变异存活：`streamEncodings` 对判定项也吞掉异常 | 同上 | 无代码改动，补闭包用例 | 闭包组“S04 closure (A3)”（4 个） |

本轮用例变化：contract 149 → 161（+12：1 个 N2 与目标元素用例，11 个闭包用例）；package-runtime 43 不变。25 个用例、42 条断言不变。
闭包用例用 `vm.runInNewContext` 把 `safeRules`、`streamEncodings`、`uiContinue` 的源码片段切出，在桩环境里运行；桩代表页面、IPC 日志和 Provider 计数。切片边界取自源码中相邻函数的签名行。它们不是 Electron、Win10、Win7 证据。

预演 7 的 Win7 证据（作为本轮输入，只读）路径：`/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-7/`（`RUN_LOG.md`、`r7/evidence/`）。数据库文件先 `cp` 到你自己的目录，用 `python3 -I` 的 `sqlite3` 模块以只读方式打开；不要运行其中任何可执行文件。

## 4. 请重点复核

按风险从高到低。

1. **首轮请求数固定为 1 是否会误伤健康产品。** `evaluateAuditHardStop` 现在要求首轮恰好增加一个 Provider 请求。请从产品源码判断：健康产品在 `b2:audit-write` 的首轮是否可能合法地增加 0 个或 2 个请求（例如首轮前的探测请求、网络重试、标题或摘要请求）。如果可能，现判据会把健康产品判 FAIL；这是与 N1 相反方向的风险。预演 7 样本为 `0→1→1`，这是一个样本，不是证明。
2. **额外键的证据是否充分。** `extrasReached` 要求页面 `window` 捕获阶段记录额外 Enter 与 Space 的 `keydown`。请判断：按钮变忙并被禁用后，Chromium 对已聚焦又被禁用的按钮是否仍把 `keydown` 派发到 `window`（预期是；目标可能变成 `BODY`）；若不是，这个判据会让真实 Win7 的 `one_dispatch_while_busy` 恒为 UNKNOWN，这是可接受的保守结果，还是说明需要别的证据。
3. **第一次 Enter 的目标判定。** `enterReached` 要求 `keydown_target === 'BUTTON'` 且 `button_focused === true`。请判断：续接卡片按钮是原生 `<button>`，键盘事件的目标就是它本身；`focus({ preventScroll: true })` 在 Electron 22 上返回的 `document.activeElement === b` 是否可靠；该判定会不会把“产品不响应 Enter”误判为 UNKNOWN（预期不会：目标是按钮、keypress 13 到达而无 click 时 FAIL）。
4. **闭包用例的覆盖是否真实。** 请核对三组闭包用例：切片边界是否会因函数改名而静默变空（用例里对起止位置有断言）；桩是否隐藏了真实差异（例如桩的 `ipcLog` 在 `submit` 内写入，真实驱动在 `ipcMain.handle` 包装里写入；桩的 `pressKey` 返回的标记只用来区分调用顺序）；这些用例没覆盖的闭包语句有哪些（请列出）。
5. **同类缺陷扫描（请求）。** 本轮缺陷类别：(a) 判据在必要事实缺失时仍给 PASS；(b) 计数类判据只看相对关系，不固定期望值；(c) 假设动作已生效而没有在证据侧确认。请对驱动、夹具、冒烟、控制器逐类扫描并列出命中点，尤其是 `PASS` 分支前没有检查“事实是否被观察到”的判据，以及 `exec` 返回值未被读取的页面动作。
6. **文档措辞。** [§6.26](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#626-预演-7-失败分类2026-10-14开发机只读) 与第四轮交接包的 U-A 一行已按你的指正更正为“原因 UNKNOWN，H1、H2 两个假设未验证”；`ec546e5…` 与 `STATUS_LOG.md` 里已提交的旧句未改（它们是历史记录）。请确认当前文字没有残留过强结论。

## 5. 新增的驱动假设

| # | 驱动假设 | 对照位置 |
|---|---|---|
| 42 | 健康产品在 `b2:audit-write` 的首轮恰好增加 1 个 Provider 请求：第一次响应含一次 write 调用，审计失败使派发在 `tool_end` 处停止 | 预演 7 Win7 证据（`0→1→1`）；`src/core/src/a9-agent-loop.ts:1763`～`:1770`；夹具 `release/win7-product-v3/a9-batch2-fixtures.cjs` 的 `b2:audit-write` 场景。仅一个 Win7 样本 |
| 43 | Electron 22 上，对续接卡片按钮调用 `focus({ preventScroll: true })` 后 `document.activeElement === button` 为 true | 浏览器事件模型；开发机用桩验证，真实页面 `UNKNOWN` |
| 44 | 发往已聚焦原生按钮的键盘事件，`event.target.tagName` 为 `BUTTON` | 浏览器事件模型；Win7 `UNKNOWN` |
| 45 | 按钮变忙被禁用后，额外的 Enter 与 Space 仍在 `window` 捕获阶段产生 `keydown` 记录 | 浏览器事件模型；Win7 `UNKNOWN` |

此前的假设 37～41 不变（见第四轮交接包第 5 节）。

## 6. 反例

执行代理在开发机对真实驱动做了 23 个变异。第一批 19 个有 1 个存活（S1），补用例后重跑被拦住；第二批 4 个全部被拦住。每批结束后用备份还原，用 `cmp` 核对与备份一致，重跑 161 个用例通过。

| 编号 | 变异 | 结果 |
|---|---|---|
| A1 | `enter_delivery` 取自额外 Enter | 拦住（2 个用例） |
| A1b | `extra_enter` 取自第一次按键 | 拦住 |
| A1c | `extra_space` 取自额外 Enter | 拦住 |
| A1d | Space 重试步骤按 Enter | 拦住 |
| A2 | `ipcFrom` 取在第一次 `submit` 之后 | 拦住（2 个用例） |
| A3 | 判定项异常被吞掉 | 拦住 |
| A3b | 非判定项异常也结束用例 | 拦住 |
| A3c | 四个标签都视为判定项 | 拦住（2 个用例） |
| N1 | 首轮请求数不约束（只要不减少） | 拦住（2 个用例） |
| N1b | 不要求第二次提交被观察到 | 拦住（2 个用例） |
| N1c | 不要求第二次提交后请求数不变 | 拦住 |
| N2 | 不要求额外键的 `keydown` | 拦住 |
| N2b | 两个额外键的条件用“或”连接 | 拦住 |
| T1 | 不要求第一次 Enter 的目标是按钮 | 拦住（2 个用例） |
| T2 | 不要求 `button_focused` | 拦住（2 个用例） |
| T3 | `summarizeKeyPress` 不返回目标 | 拦住 |
| T4 | 不读取 `focus` 调用的返回值 | 拦住 |
| S1 | `submit_calls` 不过滤 `a9.turn.submit` | 首次存活（桩的 IPC 日志里没有非提交条目）；让桩的快照调用也写日志后拦住 |
| S2 | `submit_calls` 的 `ok` 恒为 true | 拦住（2 个用例） |
| X1 | 额外键缺失时 `extrasReached` 视为通过 | 拦住 |
| X2 | 首轮请求数常量改为 2 | 拦住（3 个用例） |
| X3 | 不要求请求基线 `before` 是整数 | 拦住 |
| X4 | 第一次按键缺失时 `enterReached` 视为通过 | 拦住 |

请在你自己的目录重做你认为重要的变异，并另试下列 6 个；变更须在审核者自己的目录内完成并恢复，并核对哈希。

| 变更 | 你判断 |
|---|---|
| `pressKey` 在 `hasFocus` 超时后直接返回，不发送按键 | 是否有用例观察到按键仍被发送 |
| `streamEncodings` 的 `warnings` 取自所有 `tool_output` 而不是同一 `toolCallId` | 是否有用例带两个工具调用 |
| `safeRules` 的 `finally` 不删除触发器 | 是否有用例观察到 `DROP TRIGGER` |
| `uiContinue` 的 `space_retry` 不再等待第二个 continue 事件 | 是否有用例覆盖 |
| `evaluateAuditHardStop` 把 `tool_ends` 的整数要求去掉 | 哪个用例拦住 |
| `evaluateUiJourney` 的 `deliveryText` 去掉 `keydown_target` | 是否有用例读取详情文字 |

## 7. 不在范围

Win7 与 Win10 的任何动作、预演 8 与正式执行的授权、候选冻结、关口 A 与 B、ADR-0155 的接受、A9-32 `DEVELOPER_VERIFIED` 的签发、完整 Alpha 2 裁决，以及任何产品语义改动（含 KL-3 的产品修复、SAFE-02 的 Turn 行失败标记、CP936 与 UTF-16LE 解码接入，均需另立任务书）。
本包不请求任何执行授权。复核者的结论不构成关口签署。

## 执行代理实测记录

执行代理于 2026-10-14T08:39:15Z 在全新空目录 `/private/tmp/a9-33-handoff-trial-5` 按 `set -e` 顺序整体运行本文第 2 节三个代码块，退出码 0，结束于 08:45:56Z，总耗时 401 秒。证据层级：开发机，绑定提交 `c8d9113b…`。

| 预期 | 实测 |
|---|---|
| `rev-parse` | `c8d9113b1261fc112d6a804ee0782f70786501d0` |
| 路径清单 | 输出 `PATHS_MATCH` |
| 累计统计 | `20 files changed, 9008 insertions(+), 31 deletions(-)` |
| 本轮统计 | `2 files changed, 317 insertions(+), 21 deletions(-)` |
| `node --version` | `v20.17.0` |
| `verify:quick` | 退出码 0，输出“7 个 Phase 3–7 模块完成编译/静态验证” |
| `node --test` | 120 通过、0 失败、0 取消、0 跳过 |
| shell jest | 2 个套件、204 个用例通过（无沙箱环境，无 EPERM） |
| `docs:check` | `{"ok":true,"checked_files":334,"task_files":49}` |
| `diff --check` | 无输出 |
| 还原后 `status --short` 行数 | 0 |

jest 结束后仍输出一行“Jest did not exit one second after the test run has completed”，命令以退出码 0 结束；该行在 `9dd3b165…`、`6679ef30…`、`1a2b2783…` 上同样出现，来源为 UNKNOWN。

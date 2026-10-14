# A9-33 独立审核交接包（预演 6 修复轮第三轮，2026-10-14，绑定修复提交 6679ef30…）

本包供 codex 对 A9-33 第三修复轮的提交 `6679ef300f13a2cbbbc055a097e6ef7ee1cc54f8` 做复核。
上一轮复核对象是 `9dd3b165…`（0 个 P0、0 个 P1、2 个 P2，编号 N1、N2；另有一条 R2 弱点说明）。本轮提交是对这些发现的修复。
证据层级：修复本身是开发机；预演 6 的 Win7 证据是输入，复核者只读。驱动、冒烟、控制器的新代码没有在 Win7 上运行过，全部 NOT_PERFORMED。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由负责人决定是否登记。负责人已于 2026-10-14 批准开第三修复轮并把修复结果发给 codex 复审。

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
最后给出一句话：是否建议在该提交上进入预演 7 的授权评审。

## 1. 对象与保护边界

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送 |
| 复核对象 | `6679ef300f13a2cbbbc055a097e6ef7ee1cc54f8`（父 `9dd3b165f8d7ca1a4a38d091824a53859450a188`）。本提交改 2 个文件，154 行新增、30 行删除 |
| 上一轮复核对象与报告 | `9dd3b165…`；报告 `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-review/codex-stage2-round2-20261014/codex_final_report.md`（只读，SHA-256 前缀 `fda1d91e…`）；你上一轮的探针与证据在同目录（`provider-timing-probe.cjs`、`provider-timing-probe.json`、`source-probes.cjs`、`mutation-review.py` 等） |
| 提交链（修复） | `cde53348…` → `83e03bf6…` → `f672f518…` → `a4816779…` → `2c06317c…` → `9dd3b165…` → `6679ef30…`（本轮）；相邻提交之间的其他提交只改 `docs/` |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 8376 insertions(+), 31 deletions(-)` |
| 任务书与合同 | [A9-33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §3、§6.1、§6.2、§6.19～§6.24；[A9-32](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md) §5、§7.10 |
| 保护边界 | 不得改动产品语义和旧取证组件。20 个路径之外的非 `docs/` 文件必须没有差异 |

必须从提交取得文件，不能拿工作区文档对照。本包与之后的文档提交只改 `docs/`，不属于源码复核对象。

已知限制（不得再列为发现）：KL-1、KL-2（见 §6.13）；KL-3（产品缺口：启动后台进程的 Turn 结束后渲染层不再刷新，输出只到 SQLite 与 IPC 快照；预演 6 p03 再现 `dom_frames_max=0`）。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q 6679ef300f13a2cbbbc055a097e6ef7ee1cc54f8
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

预期：`rev-parse` 输出 `6679ef300f13a2cbbbc055a097e6ef7ee1cc54f8`。

第二步：核对路径清单。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 6679ef300f13a2cbbbc055a097e6ef7ee1cc54f8 | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
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
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 6679ef300f13a2cbbbc055a097e6ef7ee1cc54f8 -- release scripts src
git -c core.fsmonitor=false diff --name-only 9dd3b165f8d7ca1a4a38d091824a53859450a188 6679ef300f13a2cbbbc055a097e6ef7ee1cc54f8
git -c core.fsmonitor=false diff --shortstat 9dd3b165f8d7ca1a4a38d091824a53859450a188 6679ef300f13a2cbbbc055a097e6ef7ee1cc54f8
```

预期：输出 `PATHS_MATCH`；第一条统计为 `20 files changed, 8376 insertions(+), 31 deletions(-)`；第二条列出且只列出 `src/shell/tests/product/a9-batch2-contract.test.ts`、`src/shell/tests/product/a9-batch2-driver-entry.cjs`（夹具文件本轮没有改动）；最后一条统计为 2 个文件、154 行新增、30 行删除。
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
| shell jest | 2 个套件、180 个用例通过（contract 137、package-runtime 43；执行代理在无沙箱环境实测）。若你的沙箱禁止回环监听，会有 7 个既有用例因 `listen EPERM 127.0.0.1` 失败（你上一轮列出的 7 个：loopback Provider、driver phase assertions、driver ERROR or non-zero exit、smoke corrupts the mode settings、kill-on-marker、wrong owner/revision drift、stopping a continuation turn），请逐个列出并说明原因，不要与产品缺陷混写。本轮新增的 8 个用例不需要回环监听 |
| 还原后 `status` 行数 | 0 |
| `docs:check` | `ok`，该提交的内容为 330 个文件 |
| `diff --check` | 无输出 |

被跟踪的 `src/runner/dist` 落后于源码是已知问题，`verify:quick` 会改写它。必须还原，不能提交。
包测试要在不被改动的检出里整体运行，测试期间不要改动该目录。

## 3. 上一轮发现与本轮修复

下表“执行代理的核对”和“修复位置”由执行代理给出，请从源码和证据独立确认，不要采信本表。

| # | 上一轮发现 | 执行代理的核对 | 修复位置 | 回归用例（`a9-batch2-contract.test.ts` 末尾 describe “A9-33 batch-2 rehearsal 6 fixes”） |
|---|---|---|---|---|
| N1 (P2) | `ensureProvider` 点击应用后等页面文字 `tool_calling` 与密钥可用，二者都不绑定本次应用结束，驱动在配置与探测完成前返回 | 成立。`a9-agent-runtime.js:1616` 在探测前设置密钥，`:1667` 才等探测；重启后页面文字是恢复的旧探测（渲染层 `a9-workbench.js:1914` 由快照写入）；`applyProvider`（`a9-workbench.js:2670`～`2712`）在点击的同步段内禁用按钮，`configureProvider` 返回并 `refreshSnapshot` 之后才在 `finally` 解除 | 驱动 `providerApplyState`、`ensureProvider` 的等待（按钮既不禁用也无 `aria-busy`，表单错误文字和探测文字带进超时消息），之后才核对密钥 | “S05 key: …”下新增与改写的用例（见下） |
| N2 (P2) | Provider 测试桩按源码字符串识别“应用”并立即成功，删除 `.click()` 的变异存活 | 成立 | 契约测试 `stageProvider` 改为小型 DOM，用 `vm` 执行驱动的真实语句；点击禁用按钮、立即登记密钥、若干次调用后才结束应用；可配置旧探测文字、新探测失败、表单错误、按钮卡住 | 同上 |
| R2 弱点（信息） | `runPrompt` 每次轮询重新命名目标 Turn，开始事件移出窗口后会退化为“基线之后任一结束事件” | 成立 | 驱动 `newTurnId`、`targetTurnEnd(evts, baseline, turnId)`、`runPrompt` 的闭包变量 `turnId`：首次见到开始事件时命名，之后保持；退化分支只用于“没有任何一次轮询见过开始事件”的提示 | “S04: …”下新增 1 个用例与 1 个反例，改写 1 个用例 |

本轮用例变化：contract 129 → 137（+8）。“S05 key”组由 17 个增为 23 个：新增 4 个（按钮释放前不返回、旧成功后新探测失败、表单错误、按钮卡住）和 2 个反例（无点击、上一提交的等待），另改写 1 个用例的名称与断言。“S04”组由 11 个增为 13 个：新增 1 个（早期轮询命名的 Turn 被保持）和 1 个反例（每次轮询重新命名），另改写 1 个用例的名称。

## 4. 请重点复核

按风险从高到低。

1. **N1 的等待条件。** 请核对：(a) `applyProvider` 在 `button.disabled = true` 之前没有 `await`（`a9-workbench.js:2670`～`2697`），所以点击之后的第一次读取一定看到忙；(b) 按钮只由 `applyProvider` 写入（执行代理对 `a9-provider-apply` 全文搜索只有 2693 行与 3062 行的监听）；(c) `refreshSnapshot` 在解除按钮之前完成，因此解除后的探测文字来自新配置的快照（`a9-workbench.js:1914`）；(d) 所有模式的首次 `bootstrap` 都经过同一等待，请核对没有模式会因等待按钮释放而新增超时（例如配置被 `A9_PROVIDER_MANAGED_ACTIVE`、`A9_PROVIDER_RECONFIGURE_BUSY` 拒绝时，驱动会等 45 秒并带出表单错误文字）；(e) `providerApplyState` 缺少元素时 `busy` 为 true，等待超时而不是通过。
2. **测试桩的忠实度。** 新桩在点击时同步登记密钥，探测在 `applyCalls` 次调用后返回；真实时间线是 IPC 往返后登记，登记和探测之间也隔着异步。请判断这个简化是否放过一种真实顺序（例如登记晚于点击后的第一次读取），以及桩的 `hidden`、`textContent` 语义与 `setFieldError`（`a9-workbench.js:150`～`155`）是否一致。
3. **R2 的目标 Turn 保持。** `turnId` 是 `runPrompt` 内的闭包变量；请核对同一 `runPrompt` 内不会出现两个目标 Turn，以及被杀进程留下“有开始、无结束”的 Turn 时命名仍正确（沿用上一轮用例）。
4. **同类缺陷扫描（请求）。** 本轮缺陷类别：(a) 以“派生信号已为真”判定一个异步操作已结束，而信号在操作结束前就为真（探测文字是旧值，密钥在探测前登记）；(b) 测试替身按源码字符串识别步骤并立即成功，不执行驱动的语句；(c) 弱化的命名在多次轮询间不保持。请对驱动、夹具、冒烟、控制器逐类扫描：驱动里所有“动作之后的 `waitFor` 条件”（例如 `ensureMode`、`selectWorkspace`、`newConversation`、取消、切换会话、模式应用）是否有同类的“提前为真”信号；契约测试里所有替身是否仍有按源码字符串识别的步骤（执行代理的自查：`stageProvider` 只对 `window.win7Agent.a9.snapshot()` 做字符串识别，S06 的 `stage` 与 S04 的 `run` 不做）。列出命中点（文件:行）；没有命中写明检查了什么。
5. **存活的变异是否确为等价。** D16（点击前 `rows.length !== 1` 改 `< 1`）：前一步已核对行数；E6（去掉 `aria-busy` 条件）：渲染层同时设置和去除 `disabled` 与 `aria-busy`。请判断两者是否等价，或需要补用例。

## 5. 新增的驱动假设

| # | 驱动假设 | 对照位置 |
|---|---|---|
| 33 | `applyProvider` 在点击处理的同步段内禁用按钮，之后才有第一个 `await` | `renderer/a9-workbench.js:2670`～`2697`；开发机源码，Win7 UNKNOWN |
| 34 | 按钮解除时快照已刷新，`a9-provider-probe-state` 文字等于新配置的探测分类 | `renderer/a9-workbench.js:1914`、`2698`～`2711`；开发机源码，Win7 UNKNOWN |
| 35 | 表单错误出现时 `#a9-provider-error` 的 `hidden` 为 false 且文字非空，成功时为空并隐藏 | `renderer/a9-workbench.js:150`～`155`、`2672`；开发机源码 |
| 36 | 回环夹具对探测请求立即应答，所以本机上的应用时间由 IPC 与探测往返决定 | `a9-batch2-smoke.cjs:315`～`323`；实际耗时 UNKNOWN |

## 6. 反例

执行代理在开发机对真实源码做了 32 个变异（驱动 27 个、夹具 5 个，含上一轮的 D 与 F 系列在新代码上的重做和本轮新增的 E 系列），31 个被至少一个用例拦住，随后还原并用 `cmp` 核对与备份逐字节相同。存活的是 E6。上一轮存活的 D16 在代码未变，没有重做。

| 编号 | 变异 | 被拦住的用例（节选） |
|---|---|---|
| E1 | `runPrompt` 每次轮询重新命名目标 Turn | “the Turn named by an early poll is kept…” |
| E2 | 应用等待不看按钮忙 | “the driver returns only after the page has let go of the apply button…” 等 5 个 |
| E3 | 去掉表单错误的抛出 | “a form error ends the wait with the error text” |
| E4 | 去掉 `.click()` | “a configured provider whose key is not available gets the form again…” 等 9 个 |
| E5 | 去掉“按钮已释放但探测文字不是 `tool_calling`”的抛出 | “a new probe that fails after an earlier success…” |
| E6 | `busy` 去掉 `aria-busy` 条件 | 存活：渲染层同时设置 `disabled` 与 `aria-busy` |
| E7 | `providerApplyState` 不读表单错误 | “a form error ends the wait with the error text” |
| E8 | `runPrompt` 的 `turnId` 初值改为固定字符串 | “the second prompt of a conversation is not ended…”等 8 个 |
| E9 | `targetTurnEnd` 有 `turnId` 时仍接受任一基线之后的结束事件 | “an end event of another Turn that arrives after the submit…” |

D1～D15、D17～D19 与 F1～F5 在新代码上全部被拦（编号含义见上一轮交接包第 6 节）。

请在你自己的目录重做你认为重要的变异，并另试下列 6 个；变更须在审核者自己的目录内完成并恢复，并核对哈希。

| 变更 | 预期被哪个测试拦住 |
|---|---|
| `ensureProvider` 在应用等待里把 `state.busy` 的读取改成只看 `disabled` 且应用结束后不核对探测文字 | “a new probe that fails after an earlier success…” |
| `providerApplyState` 的 `probe` 改读 `a9-provider-key-state` | “the driver returns only after the page has let go…”等 |
| `ensureProvider` 在表单应用之后立即关闭抽屉再等待 | 你判断：是否有用例观察关闭与等待的顺序 |
| `newTurnId` 取 `evts` 里最后一个 `turn_started` | “the second prompt of a conversation is not ended…”等 |
| `runPrompt` 在 `observeUntil` 之后才设置 `turnId` | 你判断 |
| `stageProvider` 把密钥登记改到应用结束时 | 你判断：N1 的旧写法是否因此被放过 |

## 7. 不在范围

Win7 与 Win10 的任何动作、预演 7 与正式执行的授权、候选冻结、关口 A 与 B、ADR-0155 的接受、A9-32 `DEVELOPER_VERIFIED` 的签发、完整 Alpha 2 裁决，以及任何产品语义改动（含 KL-3 的产品修复，需另立任务书）。
本包不请求任何执行授权。复核者的结论不构成关口签署。

## 执行代理实测记录

执行代理于 2026-10-14T03:47:57Z 在全新空目录 `/private/tmp/a9-33-handoff-trial-3` 按 `set -e` 顺序整体运行本文第 2 节三个代码块，退出码 0，总耗时 382 秒。证据层级：开发机，绑定提交 `6679ef30…`。

| 预期 | 实测 |
|---|---|
| `rev-parse` | `6679ef300f13a2cbbbc055a097e6ef7ee1cc54f8` |
| 路径清单 | 输出 `PATHS_MATCH` |
| 累计统计 | `20 files changed, 8376 insertions(+), 31 deletions(-)` |
| 本轮改动文件 | 只有 `a9-batch2-contract.test.ts` 与 `a9-batch2-driver-entry.cjs` |
| 本轮统计 | `2 files changed, 154 insertions(+), 30 deletions(-)` |
| `node --version` | `v20.17.0` |
| `verify:quick` | 退出码 0，输出“7 个 Phase 3–7 模块完成编译/静态验证” |
| `node --test` | 120 通过、0 失败、0 取消、0 跳过，337 秒 |
| shell jest | 2 个套件、180 个用例通过（无沙箱环境，无 EPERM） |
| `docs:check` | `{"ok":true,"checked_files":330,"task_files":49}` |
| `diff --check` | 无输出 |
| 还原后 `status --short` 行数 | 0 |

jest 结束后输出一行“Jest did not exit one second after the test run has completed”，命令仍以退出码 0 结束。上一轮交接包在 `9dd3b165…` 上的实测日志里同样有这一行，所以它先于本轮改动出现。执行代理没有调查句柄来源，来源为 UNKNOWN。

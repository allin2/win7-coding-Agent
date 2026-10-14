# A9-33 独立审核交接包（预演 7 修复轮，第四修复轮，2026-10-14，绑定修复提交 1a2b2783…）

本包供 codex 对 A9-33 第四修复轮的提交 `1a2b2783a6a8e5685ecbb10d543c36e208ee79b8` 做复核。
本轮输入不是 codex 的发现，而是预演 7 的 Win7 证据：p04 的 S04、p07 的 B2-SAFE-02、p08 的 B2-UI-01 各有失败。执行代理已在开发机分类（[A9-33 §6.26](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#626-预演-7-失败分类2026-10-14开发机只读)），负责人于 2026-10-14 批准 U-A、S-A、E-A（[§6.27](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#627-第四修复轮裁决与-kl-52026-10-14)）。
上一个代码提交 `6679ef30…`（第三修复轮）经你复核为 0 个 P0、0 个 P1、1 个 P2（N1 残余），已登记 KL-4。
证据层级：修复本身是开发机；预演 7 的 Win7 证据是输入，复核者只读。驱动的新代码没有在 Electron、PowerShell、Win7 上运行过，全部 NOT_PERFORMED。未在 Win7 实机验证。
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
| 复核对象 | `1a2b2783a6a8e5685ecbb10d543c36e208ee79b8`。上一个代码提交 `6679ef300f13a2cbbbc055a097e6ef7ee1cc54f8`；两者之间的提交 `0722df00…`、`09fd4772…`、`ec546e5…` 只改 `docs/`。本轮代码改 3 个文件，362 行新增、26 行删除 |
| 上一轮复核报告 | `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-review/codex-stage2-round3-20261014/codex_final_report.md`（只读）；更早的报告在同级目录 `codex-stage2-round1-20261014`、`codex-stage2-round2-20261014` |
| 修复提交链 | `cde53348…` → `83e03bf6…` → `f672f518…` → `a4816779…` → `2c06317c…` → `9dd3b165…` → `6679ef30…` → `1a2b2783…`（本轮） |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 8712 insertions(+), 31 deletions(-)` |
| 任务书与合同 | [A9-33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §3、§6.1、§6.24～§6.27；[A9-32](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md) §5、§7.10 |
| 保护边界 | 不得改动产品语义和旧取证组件。20 个路径之外的非 `docs/` 文件必须没有差异。本轮不改任何产品文件 |

必须从提交取得文件，不能拿工作区文档对照。本包与之后的文档提交只改 `docs/`，不属于源码复核对象。

已知限制（不得再列为发现）：KL-1、KL-2（见 §6.13）；KL-3（产品缺口：启动后台进程的 Turn 结束后渲染层不再刷新，输出只到 SQLite 与 IPC 快照；预演 7 p03 再现 `dom_frames_max=0`）；KL-4（[§6.24](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md)）；KL-5（本轮登记，见 [§6.27](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#627-第四修复轮裁决与-kl-52026-10-14)：PowerShell 下产品只按严格 UTF-8 解码，CP936 与 UTF-16LE 不验收）。KL-5 的登记本身是负责人的裁决；请复核的是收窄后的实现是否忠实于 KL-5，而不是是否应该收窄。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q 1a2b2783a6a8e5685ecbb10d543c36e208ee79b8
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

预期：`rev-parse` 输出 `1a2b2783a6a8e5685ecbb10d543c36e208ee79b8`。

第二步：核对路径清单。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 1a2b2783a6a8e5685ecbb10d543c36e208ee79b8 | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
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
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 1a2b2783a6a8e5685ecbb10d543c36e208ee79b8 -- release scripts src
git -c core.fsmonitor=false diff --name-only 6679ef300f13a2cbbbc055a097e6ef7ee1cc54f8 1a2b2783a6a8e5685ecbb10d543c36e208ee79b8 -- release scripts src
git -c core.fsmonitor=false diff --shortstat 6679ef300f13a2cbbbc055a097e6ef7ee1cc54f8 1a2b2783a6a8e5685ecbb10d543c36e208ee79b8 -- release scripts src
```

预期：输出 `PATHS_MATCH`；第一条统计为 `20 files changed, 8712 insertions(+), 31 deletions(-)`；第二条列出且只列出 `release/win7-product-v3/a9-batch2-fixtures.cjs`、`src/shell/tests/product/a9-batch2-contract.test.ts`、`src/shell/tests/product/a9-batch2-driver-entry.cjs`；最后一条统计为 3 个文件、362 行新增、26 行删除。
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
| shell jest | 2 个套件、192 个用例通过（contract 149、package-runtime 43；执行代理在无沙箱环境实测）。若你的沙箱禁止回环监听，会有 7 个既有用例因 `listen EPERM 127.0.0.1` 失败（与上一轮相同的 7 个）；请逐个列出用例名，不要与产品缺陷混写 |
| 还原后 `status` 行数 | 0 |
| `docs:check` | `ok`，该提交的内容为 333 个文件 |
| `diff --check` | 无输出 |

被跟踪的 `src/runner/dist` 落后于源码是已知问题，`verify:quick` 会改写它。必须还原，不能提交。
包测试要在不被改动的检出里整体运行，测试期间不要改动该目录。

## 3. 预演 7 的失败与本轮修复

预演 7 的 Win7 证据只读，路径在 `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-7/` 下（`RUN_LOG.md`、`r7/evidence/`）。数据库文件先 `cp` 到你自己的目录，用 `python3 -I` 的 `sqlite3` 模块以只读方式打开；不要运行其中任何可执行文件。

下表“执行代理的核对”由执行代理给出，请从源码和证据独立确认，不要采信本表。

| # | 失败（Win7 证据） | 执行代理的核对 | 修复位置 | 回归用例 |
|---|---|---|---|---|
| U-A | B2-UI-01 的 `loading_feedback`、`one_dispatch_while_busy`：第一次 Enter 后 8 秒内按钮没有变忙，continue 事件 0 条（`r7/evidence/requests/08-p08-ui/ui01-interaction.json`） | 套件缺陷（首选归类），产品侧原因未全部排除。更正（2026-10-14，codex 第 4 轮指出后）：以下两句在复核时的原文是“产品侧原因已排除”“没有任何调用”，过强。`driver-ui_continue.json` 的 IPC 日志在 05:50:16.687Z 到 05:50:26.650Z 之间没有任何调用完成记录（日志在调用返回后写入）；点击通过守卫后启动 500 ms 一次的快照轮询（`renderer/a9-workbench.js:2340`），所以这 9.96 秒内没有通过守卫的点击，但“点击发生后被静默提前返回的守卫挡下”不能排除。通过守卫的点击在第一个 `await` 之前同步把按钮改成“正在继续”（`:2280` 起）。全局键盘处理只拦截 Ctrl+K、Ctrl+I、抽屉内 Tab 和 Esc（`:3098`～`:3128`），输入框与对话操作区另有局部处理，卡片按钮没有自定义键盘处理。Space 经同一 `press()` 两次成功。原因 `UNKNOWN`：假设 H1 是 `char` 事件的文本取成字符串 `Enter`，按钮收不到 keypress 13；假设 H2 是按键发生在窗口取得焦点之前。开发机没有可运行的 Electron，H1、H2 都无法验证 | 驱动 `keyEventsFor`、`summarizeKeyPress`、`KEY_RECORDER_SOURCE`、`pressKey`、`evaluateUiJourney`、`enter_journey`、`space_retry` | “UI-01: the two Enter assertions are judged only when…”、“key input: a char event carries…”、“key recorder: …”、describe “A9-33 batch-2 key press in the UI-01 journey”（6 个） |
| S-A | B2-SAFE-02：判据要求错误码出现在 `outcome_json` 或页面文字，两处都没有（`r7/evidence/requests/07-p07-safe/safe02-audit-hard-stop.json`） | 套件判据过窄。`driver-safe_rules.json` 的 IPC 日志里 `a9.turn.submit` 两次返回 `ok=false`、错误码 `A9_AUDIT_PERSISTENCE_FAILED`（05:49:35.770Z、05:49:37.550Z）；文件已写入，`tool_end` 0 条，Provider 请求 `0→1→1`。`presentAuditFailure`（`a9-agent-runtime.js:1861`）只设内存状态并把错误码放进 IPC 返回值，不写 Turn 行；渲染层显示 `error.message`（`a9-workbench.js:123`）。合同文字只写“必需审计失败停止 Turn，未知副作用不记为零”。Turn 行停在 `active`、页面实际文字、重启后的收尾均为 `UNKNOWN`，记为产品观察 | 驱动 `evaluateAuditHardStop`、`AUDIT_FAILURE_CODE`、`safeRules` | “SAFE-02: the verdict reads the IPC answer…” |
| E-A | B2-S04 的 `utf16le`、`cp936`：产品输出事件 `text=""`、`truncated=true`、`warning=A9_OUTPUT_ENCODING_ERROR`（`r7/evidence/requests/04-p04-streaming/s04-encoding.json`） | 合同与产品不一致。PowerShell 下 stdout 按严格 UTF-8 解码（`src/runner/src/trusted-shell-runner.ts:587`，`stream-output.ts:63`～`:71`），cp936 默认只对 cmd，UTF-16LE 在 A9-30 记为外部选项；失败与切点无关。负责人裁决收窄并登记 KL-5 | 夹具 S04 断言文字与 `KNOWN_LIMITS`；驱动 `evaluateEncodingOutcomes`、`ENCODING_GATING`、`streamEncodings` | “S04 (KL-5): only UTF-8 and CRLF decide…”、“S04 (KL-5): the contract text names…” |

本轮用例变化：contract 137 → 149（+12）；package-runtime 43 不变。25 个用例、42 条断言不变。

## 4. 请重点复核

按风险从高到低。

1. **U-A 修复是否真的让 Enter 到达，以及到达判定是否可靠。** (a) `char` 事件改发 `\r` 是否在 Electron 22 的 `webContents.sendInputEvent` 里产生 `keypress` 且 `charCode` 为 13；本机无 Electron，执行代理无法验证，请给出你能从源码或文档确认的依据，没有则写 UNKNOWN。(b) `delivered` 对 Enter 要求页面看到 `keydown` 的 `key==='Enter'` 与 `keypress` 的 `charCode===13`；请判断这个判定会不会把“产品真的不响应 Enter”误判为 UNKNOWN（预期不会：keypress 到达而无 click 时判 FAIL），或把“输入没到”误判为 PASS。(c) `pressKey` 不重按；请判断额外的 Enter 与 Space（`enter_journey` 里的 `extraEnter`、`extraSpace`）在新结构下是否仍能得出 `one_dispatch_while_busy` 的有意义结论。
2. **页面侧记录器。** 监听挂在 `window` 的捕获阶段，记录 `keydown`、`keypress`、`keyup`、`click`，上限 400 条；`pressKey` 每次先调用安装脚本（已安装时直接返回）。请核对：目标按钮被禁用后（忙状态）键盘事件是否仍被记录；页面重载后记录器消失，`fromIndex` 取当前长度，是否会错位；`key_records` 只存前 60 条是否会丢掉判定需要的记录。
3. **S-A 判据的证据来源。** `ipcLog` 的 `error` 字段取 `result.error.code` 的前 80 个字符（驱动第 `ipcMain.handle` 包装处）；`submit_calls` 取 `submit('b2:audit-write')` 之前的 `ipcFrom` 之后所有 `a9.turn.submit`。请核对：第二次提交（`submitRaw('b2:s01')`）是否经 `a9.turn.submit`（预演 7 证据是）；判据是否仍能拦住真实缺陷（产品改为静默成功、继续派发、`tool_end` 被写入）；`turn_status !== 'completed'` 在 Turn 行缺失时的含义。
4. **S04 收窄是否忠实。** 只有 `utf8`、`crlf` 参与判定；`utf16le`、`cp936` 仍执行，非判定项的 `runPrompt` 异常被记录而不抛出。请判断：吞掉非判定项异常是否会掩盖产品崩溃（崩溃后判定项 `crlf` 仍要通过）；`warnings` 的取法（同一工具调用的 `tool_output` 事件的 `warning` 字段）是否与预演 7 的事件形状一致；契约文字与 `KNOWN_LIMITS` 的 KL-5 条文是否与 [§6.27](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#627-第四修复轮裁决与-kl-52026-10-14) 一致；`a9-batch2-package-integrity.cjs` 比较夹具与 kit 的 `known_limits` 是否因新条目失败（包测试预期通过）。
5. **同类缺陷扫描（请求）。** 本轮缺陷类别：(a) 假设输入已到达页面，没有在页面侧确认；(b) 判据读取的证据位置与产品实际输出位置不一致（错误码在 IPC 返回值，不在页面和库）；(c) 合同文字超出产品对该环境的承诺。请对驱动、夹具、冒烟、控制器逐类扫描并列出命中点，尤其是仍然用页面文字或 `outcome_json` 找错误码的判据，以及仍然假设某个动作已生效的 `exec` 调用。

## 5. 新增的驱动假设

| # | 驱动假设 | 对照位置 |
|---|---|---|
| 37 | 对聚焦的原生按钮，`char` 事件的 `keyCode` 为 `\r` 时产生 keypress 13，默认动作触发 click | Electron 22 行为；开发机无法验证，Win7 `UNKNOWN` |
| 38 | `win.focus()` 与 `webContents.focus()` 之后 3 秒内 `document.hasFocus()` 为 true；不满足时只记录，不阻断 | 驱动 `pressKey`；Win7 `UNKNOWN` |
| 39 | 页面 `window` 的捕获监听能看到发往焦点元素的键盘事件，包括按钮被禁用之后 | 浏览器事件模型；开发机用假窗口验证，真实页面 `UNKNOWN` |
| 40 | 审计写失败时 `a9.turn.submit` 返回 `ok=false` 与 `A9_AUDIT_PERSISTENCE_FAILED`，驱动的 `ipcLog` 记录该代码 | 预演 7 Win7 证据 `driver-safe_rules.json`（已见两次）；`a9-agent-runtime.js:1861` |
| 41 | PowerShell 下 `utf16le`、`cp936` 的输出事件带 `warning=A9_OUTPUT_ENCODING_ERROR`，之后的 `crlf` 提示不受影响 | 预演 7 Win7 证据（`crlf=true`）；`stream-output.ts:63`～`:71` |

## 6. 反例

执行代理在开发机对真实源码做了 10 个变异，全部被至少一个用例拦住，随后用备份还原并重跑 149 个用例通过。

| 编号 | 变异 | 被拦住的用例（节选） |
|---|---|---|
| M1 | `char` 事件的 `keyCode` 改回按键名 | “key input: a char event carries the typed character…” |
| M2 | SAFE-02 判据再要求页面显示错误码 | “SAFE-02: the verdict reads the IPC answer…” |
| M3 | S04 让四个标签都参与判定 | “S04 (KL-5): only UTF-8 and CRLF decide…” |
| M4 | UI 判定忽略 Enter 到达情况 | “UI-01: the two Enter assertions are judged only when…” |
| M5 | 记录器改为冒泡阶段监听 | “key recorder: …” |
| M6 | `summarizeKeyPress` 不看 `charCode` | “key input: …”与 `pressKey` 组的 keypress 用例 |
| M7 | SAFE-02 把第二次提交的错误码也设为必需 | “SAFE-02: …”（第二次答案只是观察） |
| P1 | `pressKey` 在发送之后才取基线 | “an Enter that arrives…”等 3 个 |
| P2 | `pressKey` 在按键丢失时重按 | “a press that never reaches the page…”等 2 个 |
| P3 | `pressKey` 不安装记录器 | “an Enter that arrives…” |

请在你自己的目录重做你认为重要的变异，并另试下列 6 个；变更须在审核者自己的目录内完成并恢复，并核对哈希。

| 变更 | 预期被哪个测试拦住 |
|---|---|
| `enter_journey` 在第一次 `pressKey('Enter')` 之前不调用 `installKeyRecorder` 以外的任何准备，并让 `enterDelivery` 取自额外 Enter | 你判断：是否有用例观察 `enter_delivery` 来自第一次按键 |
| `safeRules` 把 `ipcFrom` 取在 `submit` 之后 | 你判断：驱动闭包内的该语句是否被用例覆盖 |
| `streamEncodings` 对判定项也吞掉异常 | 你判断 |
| `evaluateEncodingOutcomes` 把缺失判定项当作 PASS | “S04 (KL-5): only UTF-8 and CRLF decide…” |
| `evaluateAuditHardStop` 把 `file_written` 的要求去掉 | “SAFE-02: …”失败列表 |
| `summarizeKeyPress` 对 Space 只看 `keydown` | “key input: …”的 Space 用例 |

## 7. 不在范围

Win7 与 Win10 的任何动作、预演 8 与正式执行的授权、候选冻结、关口 A 与 B、ADR-0155 的接受、A9-32 `DEVELOPER_VERIFIED` 的签发、完整 Alpha 2 裁决，以及任何产品语义改动（含 KL-3 的产品修复、SAFE-02 的 Turn 行失败标记、CP936 与 UTF-16LE 解码接入，均需另立任务书）。
本包不请求任何执行授权。复核者的结论不构成关口签署。

## 执行代理实测记录

执行代理于 2026-10-14T06:37:01Z 在全新空目录 `/private/tmp/a9-33-handoff-trial-4` 按 `set -e` 顺序整体运行本文第 2 节三个代码块，退出码 0，总耗时 390 秒。证据层级：开发机，绑定提交 `1a2b2783…`。

| 预期 | 实测 |
|---|---|
| `rev-parse` | `1a2b2783a6a8e5685ecbb10d543c36e208ee79b8` |
| 路径清单 | 输出 `PATHS_MATCH` |
| 累计统计 | `20 files changed, 8712 insertions(+), 31 deletions(-)` |
| 本轮统计 | `3 files changed, 362 insertions(+), 26 deletions(-)` |
| `node --version` | `v20.17.0` |
| `verify:quick` | 退出码 0，输出“7 个 Phase 3–7 模块完成编译/静态验证” |
| `node --test` | 120 通过、0 失败、0 取消、0 跳过 |
| shell jest | 2 个套件、192 个用例通过（无沙箱环境，无 EPERM） |
| `docs:check` | `{"ok":true,"checked_files":333,"task_files":49}` |
| `diff --check` | 无输出 |
| 还原后 `status --short` 行数 | 0 |

jest 结束后仍输出一行“Jest did not exit one second after the test run has completed”，命令以退出码 0 结束；该行在 `9dd3b165…` 与 `6679ef30…` 上同样出现，来源为 UNKNOWN。

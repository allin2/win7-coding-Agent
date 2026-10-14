# A9-33 独立审核交接包（预演 6 修复轮第二轮，2026-10-14，绑定修复提交 9dd3b165…）

本包供 codex 对 A9-33 第二修复轮的提交 `9dd3b165f8d7ca1a4a38d091824a53859450a188` 做复核。
上一轮复核对象是 `2c06317c…`（0 个 P0、1 个 P1、4 个 P2，编号 R1～R5）。本轮提交是对这 5 项的修复。
证据层级：修复本身是开发机；预演 6 的 Win7 证据是输入，复核者只读。驱动、冒烟、控制器的新代码没有在 Win7 上运行过，全部 NOT_PERFORMED。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由负责人决定是否登记。负责人已于 2026-10-14 批准开第二修复轮并把修复结果发给 codex 复审。

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
| 复核对象 | `9dd3b165f8d7ca1a4a38d091824a53859450a188`（父 `2c06317ccad767291e2bf9d55ea58bea6de9bdac`）。本提交改 3 个文件，424 行新增、54 行删除 |
| 上一轮复核对象与报告 | `2c06317c…`；报告 `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-review/codex-stage2-round1-20261014/codex_final_report.md`（只读，SHA-256 前缀 `35f0ba0e…`） |
| 提交链（修复） | `cde53348…` → `83e03bf6…` → `f672f518…` → `a4816779…` → `2c06317c…` → `9dd3b165…`（本轮）；相邻提交之间的其他提交只改 `docs/` |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 8252 insertions(+), 31 deletions(-)` |
| 任务书与合同 | [A9-33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §3、§6.1、§6.2、§6.19～§6.23；[A9-32](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md) §5、§7.10 |
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
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q 9dd3b165f8d7ca1a4a38d091824a53859450a188
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

预期：`rev-parse` 输出 `9dd3b165f8d7ca1a4a38d091824a53859450a188`。

第二步：核对路径清单。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 9dd3b165f8d7ca1a4a38d091824a53859450a188 | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
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
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 9dd3b165f8d7ca1a4a38d091824a53859450a188 -- release scripts src
git -c core.fsmonitor=false diff --name-only 2c06317ccad767291e2bf9d55ea58bea6de9bdac 9dd3b165f8d7ca1a4a38d091824a53859450a188
git -c core.fsmonitor=false diff --shortstat 2c06317ccad767291e2bf9d55ea58bea6de9bdac 9dd3b165f8d7ca1a4a38d091824a53859450a188
```

预期：输出 `PATHS_MATCH`；第一条统计为 `20 files changed, 8252 insertions(+), 31 deletions(-)`；第二条列出且只列出 `release/win7-product-v3/a9-batch2-fixtures.cjs`、`src/shell/tests/product/a9-batch2-contract.test.ts`、`src/shell/tests/product/a9-batch2-driver-entry.cjs`；最后一条统计为 3 个文件、424 行新增、54 行删除。
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
| shell jest | 2 个套件、172 个用例通过（contract 129、package-runtime 43；执行代理在无沙箱环境实测）。若你的沙箱禁止回环监听，会有 6 个既有用例因 `listen EPERM 127.0.0.1` 失败，请逐个列出并说明原因，不要与产品缺陷混写。本轮新增的 36 个用例不需要回环监听 |
| 还原后 `status` 行数 | 0 |
| `docs:check` | `ok`，该提交的内容为 330 个文件 |
| `diff --check` | 无输出 |

被跟踪的 `src/runner/dist` 落后于源码是已知问题，`verify:quick` 会改写它。必须还原，不能提交。
包测试要在不被改动的检出里整体运行，测试期间不要改动该目录。

## 3. 上一轮 5 项发现与本轮修复

下表“执行代理的结论”和“修复位置”由执行代理给出，请从源码和证据独立确认，不要采信本表。上一轮报告是你自己的输出，可只读参考。

| # | 上一轮发现 | 执行代理的核对 | 修复位置 | 回归用例（`a9-batch2-contract.test.ts` 末尾 describe “A9-33 batch-2 rehearsal 6 fixes”） |
|---|---|---|---|---|
| R1 (P1) | 后续驱动进程见到 Provider 已配置就不再录入密钥，产品进程没有已知秘密，S05 输出脱敏没被检验 | 成立。`ensureProvider` 的跳过条件只看“已配置且探测通过”；产品只在内存记密钥（`a9-agent-runtime.js:2258`～`2260`，`apiKey.available` 取 `Boolean(memoryApiKey)`）；Win7 p04 库（`r7/evidence/data/p04-streaming/a9-state.db`）事件 129、130、134 含密钥前缀或全文 | 驱动 `ensureProvider(options)`、`providerKeyFacts`、`providerReady`、`bootstrap(options)`、`evaluateSecretCheck`、`streamLimits`。只有 `streamLimits` 传 `requireKey: true`；其他模式保持原规则 | “S05 key: …”下 17 个用例（11 个 Provider 用例加 6 个 S05 判定用例），含反例 |
| R2 (P2) | `runPrompt` 以最新 1000 条事件窗口内的结束事件数为基线，事件超过 1000 条后基线滑动 | 成立。窗口语义见 `src/state/src/a9-persistence.ts:1488`（`ORDER BY id DESC LIMIT` 后翻转）。同类的 `>= 2` 两处已一并改 | 驱动 `newestEventId`、`eventBaseline`、`targetTurnEnd`、`runPrompt`；`streamLive` 的 s02 与 `streamLimits` 的 s05-secret 改用 `runPrompt` | “S04: a prompt ends at the end event of its own Turn…”下 11 个用例（本轮新增 8 个，另有原有的 call id 用例），含反例 |
| R3 (P2) | 按 `标题，` 前缀匹配侧栏行，唯一性只比精确标题 | 成立。标题“基础”会命中“基础，附录，…”行 | 驱动 `conversationRows`（新增 `title` 字段，取行内 `strong` 文本）、`switchConversationInUi`（精确匹配、行数核对、点击谓词） | “S06: …”下新增 3 个用例，含反例 |
| R4 (P2) | 测试桩 `events` 恒返回第一个轮询结果，变异 M09（提交之后才读基线）存活 | 成立 | 契约测试 S04 的 `run` 改为随提交和轮询增长的会话，只返回最新 1000 条 | 同 R2；“negative control: a baseline read after the submit never lets the prompt end” |
| R5 (P2) | UTF-8 夹具切点落在 ASCII 字节 | 成立；另核实 crlf 切点（22）也不在 CR 与 LF 之间 | 夹具 `ENCODING_CUTS`、`encodingCutProblems`（参数化，`selfCheck` 调用）、`encodingCommandPowerShell` | “S04 cuts: …”下 8 个用例，含反例 |

另有一处文字更正：上一轮交接包写“9 处 `activateConversation` 调用”，实际是 11 处（你的计数）。

## 4. 请重点复核

按风险从高到低。

1. **R1 的范围决定。** 密钥重录入只在 `streamLimits` 模式启用。理由：`configureProvider`（`a9-agent-runtime.js:1386`～`1403`）在有后台进程（`A9_PROVIDER_MANAGED_ACTIVE`）、有进行中的 Turn 或审批（`A9_PROVIDER_RECONFIGURE_BUSY`）时拒绝配置；录入密钥还会触发 `revalidatePersistedTurns()`（约 `1561`～`1569` 行）。p05～p08 的重启与恢复模式从未在 Win7 带着密钥重录入运行过，执行代理不想让它们遇到改动的 Provider。请核对：(a) 除 `streamLimits` 外没有模式的判定依赖产品已知密钥（`secretLiteral` 在驱动里只用于 `ensureProvider` 与 `streamLimits`）；(b) `streamLimits` 在 p04 的第三个模式里重录入密钥，数据根里已有前两个模式的 Turn，`revalidatePersistedTurns` 是否可能抛错；(c) 夹具服务器对探测请求不计数、不写日志（`a9-batch2-smoke.cjs:315`～`323` 在 `requestCount += 1` 之前返回），所以重录入不会改变 `counters()` 与 `provider-requests.jsonl`；(d) `providerKeyFacts` 不含密钥值；(e) `evaluateSecretCheck` 在密钥不可用时给 UNKNOWN 是否合理。
2. **R2 的 `targetTurnEnd`。** 它取基线之后第一个 `turn_started` 命名目标 Turn，只认同一 `turnId` 的结束事件；窗口不再覆盖基线时退化为“基线之后第一个结束事件”。请核对：(a) 终态事件带 `turnId`（Win7 p04 库的 `turn_completed` 行有 `turn_id`；运行时 `queryEvents` 返回的 `turnId` 来自同一列）；(b) 被杀进程留下“有开始、无结束”的 Turn 时（基线正好是它的 `turn_started`），新 Turn 仍被正确命名（用例“a conversation whose last Turn was cut off…”）；(c) 退化分支会接受前一个 Turn 的迟到结束事件，这个已知弱点是否可接受；(d) 其余 `terminalReached` 与帧数阈值调用点（驱动约 727、735、801、918、1299、1496 行）是否都在新会话或短会话里。
3. **R3 的精确匹配。** 行标题取 `strong.textContent`，`appendConversationRow`（`renderer/a9-workbench.js:1691`～`1726`）里 `strong` 含一个无文字的圆点 `span` 和标题文本节点。请核对：标题含空白、换行、过长、含特殊字符时 `textContent` 与快照 `conversations[].title`（`|| '新对话'`）是否一致；已归档对话在 `#conversation-archive-list`，不在 `#conversation-list`。
4. **契约测试桩的忠实度。** 新的会话桩是否与 `listSessionEvents`（最新 N 条、升序）和 `observeUntil` 的实际调用顺序一致；`stageProvider` 对 `exec` 的分支（按源码片段识别）是否会让错误实现也通过。
5. **R5 的切点在 Win7 上的效果。** 两次 `Write` 之间有 400 ms 的 `Start-Sleep`，产品 Helper 是否把它们作为两个块送到 `SafeOutputStream`（`src/runner/src/stream-output.ts:63`～`70`，`TextDecoder` 带 `fatal` 与 `stream: true`）是 Win7 上的事实，开发机 UNKNOWN。执行代理在开发机把四种夹具按切点喂给 `src/runner/dist/stream-output.js` 的 `SafeOutputStream`，拼接结果均等于夹具文本（含 `\r` 与 `\n` 分在两块）。
6. **同类缺陷扫描（请求）。** 本轮缺陷类别：(a) 以事件计数或窗口内容作基线；(b) 把上一个驱动进程的状态当成本进程已具备（密钥、模式、Provider）；(c) 用前缀或子串识别界面行或标题；(d) 切点没有落在目标单元里；(e) 测试桩返回常量，使时序类变异存活。请对驱动、夹具、冒烟、控制器逐类扫描，列出命中点（文件:行）；没有命中写明检查了什么。执行代理自查的结果：(a) 的剩余命中点见第 2 条 (d)；(b) 检查了 `ensureMode`（每进程核对快照）、`setFixture`（每进程设置）、`selectWorkspace`；(c) 检查了驱动全部 `startsWith(` 与 `includes(` 调用，只剩事件类型前缀判断；(d) 检查了夹具里的 `Math.floor(… / 2)`，只剩 `secret-split` 的有意对半。

## 5. 新增的驱动假设

| # | 驱动假设 | 对照位置 |
|---|---|---|
| 28 | 终态事件（`turn_completed`、`turn_failed`）带 `turnId`，与同一 Turn 的 `turn_started` 相同 | Win7 p04 库的 `a9_events.turn_id`；开发机读取 |
| 29 | 表单带密钥应用后，快照 `provider.apiKey.available` 为 `true` | `a9-agent-runtime.js:2259`；开发机源码，Win7 UNKNOWN |
| 30 | 夹具服务器不计数、不记录探测请求 | `a9-batch2-smoke.cjs:315`～`323`；开发机源码 |
| 31 | 侧栏行 `strong.textContent` 等于快照标题（空标题为“新对话”） | `renderer/a9-workbench.js:1699`～`1704`；Win7 上的真实渲染 UNKNOWN |
| 32 | PowerShell 两次 `Write` 之间的 400 ms 使产品收到两个块，且切点落在块边界 | Win7 UNKNOWN |

## 6. 反例

执行代理在开发机对真实源码做了 24 个变异（驱动 19 个、夹具 5 个），23 个被至少一个用例拦住，随后还原并用 `cmp` 核对与备份逐字节相同。

| 编号 | 变异 | 被拦住的用例（节选） |
|---|---|---|
| D1 | `settled` 退回“已配置即跳过” | “a configured provider whose key is not available gets the form again…” |
| D2 | 去掉等待密钥可用 | “a form that does not leave the key available…” |
| D3 | `evaluateSecretCheck` 不看 `key_available` | “a clean output with a key the product never held is UNKNOWN…” |
| D4 | `runPrompt` 基线改为提交之后再读 | “the second prompt of a conversation is not ended…”等 7 个 |
| D5 | `turn_started` 的比较由 `>` 改 `>=` | “a conversation whose last Turn was cut off…” |
| D6 | 去掉 `turnId` 相等条件 | “an end event of another Turn that arrives after the submit…” |
| D7 | 去掉窗口退化分支 | “when the window no longer reaches back to the baseline…” |
| D8 | s02 改回按结束事件计数 | “the second prompt in the s01/s02 and s05 journeys…” |
| D9 | 行匹配改回标签前缀 | “a title that is the start of another row label…” |
| D10 | 去掉行数核对 | “a page that shows two rows for one active title…” |
| D11 | 当前行判定不比标题 | “a page that does not follow the click fails by name…” |
| D12 | 点击谓词改为标题前缀 | 同 D9 |
| D13 | 去掉密钥字面量缺失检查 | “a driver without the secret literal stops by name…” |
| D14 | 密钥事实在秘密提示之后才取 | “the S05 journey takes the key facts before the secret prompt…” |
| D15 | `base_url_is_fixture` 恒为 true | “a provider of another address gets the form again…” |
| D16 | 点击前的行数保护 `!== 1` 改 `< 1` | 存活：前一步已核对行数，保护是冗余的 |
| D17 | 无论模式都等密钥 | “a mode that does not judge the secret does not wait for the key…” |
| D18 | `streamLimits` 不传 `requireKey` | “only the S05 limits mode asks for the key” |
| D19 | 所有模式都按密钥可用判定跳过 | “a mode that does not judge the secret leaves a configured provider alone…” |
| F1 | utf8 切点改回 9 | “the fixture check finds no problem and the self check carries it”等 |
| F2 | crlf 切点改回 22 | 同上 |
| F3 | `selfCheck` 不调用 `encodingCutProblems` | “the self check fails when a cut is moved out of its unit…” |
| F4 | utf16le 切点改为 11 | 同 F1 |
| F5 | cp936 切点改为 2 | 同 F1 |

请在你自己的目录重做上表中你认为重要的变异，并另试下列 6 个；变更须在审核者自己的目录内完成并恢复，并核对哈希。

| 变更 | 预期被哪个测试拦住 |
|---|---|
| `targetTurnEnd` 在找到 `started` 后仍接受任意基线之后的结束事件 | “an end event of another Turn…” |
| `eventBaseline` 取事件个数而不是最大 `eventId` | “a conversation with more than 1000 events…” |
| `providerReady` 不比较 `baseUrl` | “a provider of another address…” |
| `conversationRows` 的 `title` 改取 `aria-label` 全文 | “a title that is the start of another row label…” |
| `evaluateSecretCheck` 在 `truncated === false` 时给 PASS | “a missing truncation report or missing secret frames fails” |
| `ENCODING_CUTS.utf16le` 改成偶数 | “the fixture check finds no problem…” |

## 7. 不在范围

Win7 与 Win10 的任何动作、预演 7 与正式执行的授权、候选冻结、关口 A 与 B、ADR-0155 的接受、A9-32 `DEVELOPER_VERIFIED` 的签发、完整 Alpha 2 裁决，以及任何产品语义改动（含 KL-3 的产品修复，需另立任务书）。
本包不请求任何执行授权。复核者的结论不构成关口签署。

## 执行代理实测记录

2026-10-14，执行代理，开发机，Node 20.17.0。本文第 2 节三个 `sh` 代码块用脚本原文抽出，在全新空目录里以 `bash -e` 一次执行，退出码 0，总用时 397 秒（02:24:15Z～02:30:52Z）。

| 步骤 | 实测 |
|---|---|
| `rev-parse` | `9dd3b165f8d7ca1a4a38d091824a53859450a188` |
| 路径清单 | `PATHS_MATCH` |
| 累计统计 | 20 个文件，+8252、−31 |
| 本轮改动路径 | 3 个：夹具、契约测试、驱动 |
| 本轮统计 | 3 个文件，+424、−54 |
| `node --version` | `v20.17.0` |
| `verify:quick` | 通过 |
| `node --test` | 120 通过、0 失败（351 秒） |
| shell jest | 2 个套件、172 个用例通过；该环境无沙箱，没有 `EPERM` 失败 |
| `docs:check` | `ok`，330 个文件 |
| `diff --check` | 无输出 |
| 还原后 `status` | 0 行 |

另有一次在工作树里的验证（提交之前，同一内容）：`node --test` 120 通过，`verify:quick` 退出 0，jest 172 通过。

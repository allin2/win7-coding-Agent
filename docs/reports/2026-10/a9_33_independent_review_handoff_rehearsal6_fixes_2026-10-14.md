# A9-33 独立审核交接包（预演 6 修复轮，2026-10-14，绑定修复提交 2c06317c…）

本包供 codex 对 A9-33 预演 6 之后的修复提交 `2c06317ccad767291e2bf9d55ea58bea6de9bdac` 做复核。
证据层级：修复本身是开发机；预演 6 的 Win7 证据是修复的输入，复核者只读。驱动、冒烟、控制器的新代码没有在 Win7 上运行过，全部 NOT_PERFORMED。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由负责人决定是否登记。负责人已于 2026-10-14 批准开修复轮并把修复结果发给 codex 复核。

## 0. 审核会话启动说明

审核者是负责人另开的新会话，不带执行代理的上下文，也不是实现方。
审核者只读本文件、第 1 节列出的提交和第 3 节列出的预演 6 证据，不写原隔离树、主工作区和已有 `.acceptance`。
审核者在自己的空目录复算，把结论写进自己目录的 `review-conclusion.md`，并向负责人报告。
不联网、不下载、不启动 Electron、不访问 Win10 或 Win7、不提交、不推送。

目录与磁盘纪律（前几轮都因磁盘出过偏差或故障）：

1. 所有命令先执行 `export TMPDIR="$PWD/tmp"`，使包测试的夹具落在复核根内。
2. 需要再克隆时用 `git clone --no-hardlinks`，不用 `cp -R`。
3. 写最终报告前清理自己根里的 `tmp` 夹具，使复核根占用小于 3 GB。

结论按 P0、P1、P2、信息分级。每条写 `文件:行`、依据和复现方式。没有发现时，写明检查了什么。
最后给出一句话：是否建议在该提交上进入预演 7 的授权评审。

## 1. 对象与保护边界

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送 |
| 复核对象 | `2c06317ccad767291e2bf9d55ea58bea6de9bdac`（父 `bd09b1aa698aa0d90bcb66bec8ab2ffd8882d4aa`）。本提交改 3 个文件，296 行新增、12 行删除 |
| 上一轮复核对象 | `cde53348af59684f2f16ed39fdb7ac00aa56dc79`（第四轮，0 个 P0、0 个 P1、2 个 P2，负责人已登记为 KL-1、KL-2，不再修） |
| 提交链（修复） | `cde53348…` → `83e03bf6…`（预演 4 前的修复）→ `f672f518…`（预演 5 前的修复）→ `a4816779…`（预演 6 前的修复）→ `2c06317c…`（本轮复核对象）；两者之间的提交只改 `docs/` |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 7882 insertions(+), 31 deletions(-)` |
| 任务书与合同 | [A9-33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §3、§6.1、§6.2、§6.19～§6.22；[A9-32](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md) §5、§7.10 |
| 保护边界 | 不得改动产品语义和旧取证组件。20 个路径之外的非 `docs/` 文件必须没有差异 |

必须从提交取得文件，不能拿工作区文档对照。预演 6 的 RUN_LOG 与本包之后的文档提交只改 `docs/`，不属于源码复核对象。

已知限制（不得再列为发现）：KL-1、KL-2（上一轮两项 P2，见 §6.13）；KL-3（产品缺口：启动后台进程的 Turn 结束后渲染层不再刷新，输出只到 SQLite 与 IPC 快照；预演 6 p03 再现 `dom_frames_max=0`）。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q 2c06317ccad767291e2bf9d55ea58bea6de9bdac
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

预期：`rev-parse` 输出 `2c06317ccad767291e2bf9d55ea58bea6de9bdac`。

第二步：核对路径清单。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 2c06317ccad767291e2bf9d55ea58bea6de9bdac | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
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
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 2c06317ccad767291e2bf9d55ea58bea6de9bdac -- release scripts src
git -c core.fsmonitor=false diff --name-only bd09b1aa698aa0d90bcb66bec8ab2ffd8882d4aa 2c06317ccad767291e2bf9d55ea58bea6de9bdac
git -c core.fsmonitor=false diff --shortstat bd09b1aa698aa0d90bcb66bec8ab2ffd8882d4aa 2c06317ccad767291e2bf9d55ea58bea6de9bdac
```

预期：输出 `PATHS_MATCH`；第一条统计为 `20 files changed, 7882 insertions(+), 31 deletions(-)`；第三条列出且只列出 `release/win7-product-v3/a9-batch2-fixtures.cjs`、`src/shell/tests/product/a9-batch2-contract.test.ts`、`src/shell/tests/product/a9-batch2-driver-entry.cjs`；最后一条统计为 296 行新增、12 行删除。
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
| `node --test` | 120 通过、0 失败，约 7 到 13 分钟 |
| shell jest | 2 个套件、136 个用例通过（contract 93、package-runtime 43；执行代理在无沙箱环境实测）。若你的沙箱禁止回环监听，会有 6 个既有用例因 `listen EPERM 127.0.0.1` 失败，用例名见上一轮交接包第 2 节；请逐个列出并说明原因，不要与产品缺陷混写。本轮新增的 16 个用例不需要回环监听 |
| 还原后 `status` 行数 | 0 |
| `docs:check` | `ok`，该提交的内容为 330 个文件 |
| `diff --check` | 无输出 |

被跟踪的 `src/runner/dist` 落后于源码是已知问题，`verify:quick` 会改写它。必须还原，不能提交。
包测试要在不被改动的检出里整体运行，测试期间不要改动该目录。

## 3. 本轮修复与对应的预演 6 证据

预演 6（2026-10-14T00:39Z～00:56Z，Win7 实机，源提交 `bd09b1aa…`）：p01～p03 PASS，p04、p05 FAIL，p06～p10 NOT_PERFORMED（套件守卫拒绝）。完整记录在：

- `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-6/RUN_LOG.md`（只读）
- 阶段证据：同目录 `runs/<phase>/evidence-after/requests/<序号-phase>/`；Win7 端取回的数据库副本：`r7/evidence/data/p04-streaming/a9-state.db`（只读，用 `cp` 到你自己的目录后再打开；用 Python `sqlite3`，加 `-I`）。

下表的“修复位置”由执行代理给出，请从源码和证据独立确认，不要采信本表。

| # | 预演 6 失败项 | 证据（相对 `runs/`） | 执行代理的结论 | 修复位置 | 回归用例（`a9-batch2-contract.test.ts` 末尾 describe “A9-33 batch-2 rehearsal 6 fixes”） |
|---|---|---|---|---|---|
| 1 | B2-S03T-TERMINAL-AUDIT：`tool_starts=2`（期望 3） | `p04-streaming/…/s03t-terminal-audit.json`；数据库 `a9_turns` 中 Turn `turn-1791938648308-1`：`status=failed`、`outcome=stuck`，37 ms | 套件缺陷：三次相同参数的 read 触发产品的重复调用检测（`src/core/src/loop-control.ts` 的 `LoopDetector`，阈值 3）。审计触发器的硬停止行为因此没被检验，UNKNOWN | `a9-batch2-fixtures.cjs`：`AUDIT_READ_FILES`、`b2:audit-three`；驱动 `auditStop` 创建三个文件 | S03T 两个用例 |
| 2 | B2-S04-ENCODING-CROSSCHUNK：`crlf=false` | `p04-streaming/…/s04-encoding.json`：四次的 `frames` 为 4、4、8、11，`got_head` 都是第一个提示的文本 | 套件缺陷（代码确认）：`runPrompt` 用“对话内存在任一结束事件”判终态，第 2 个起的提示提交后立即返回；另外四个提示共用 call id `b2-s04`。产品的编码行为 UNKNOWN | 驱动 `runPrompt`（`terminalCount(evts) > endsBefore`）；夹具 `b2-s04-<label>` 独立 call id | S04 三个用例 |
| 3 | B2-S05-…-A01：`leaks` 三处全 true | `p04-streaming/…/s05-limits-secret.json` | 套件缺陷：命令文本含密钥前 16 个字符，判据匹配全文或前 10 个字符，命令文本出现在事件、页面、快照里。产品对输出的脱敏 UNKNOWN | 夹具 `secret-split`：密钥切成 4 字符一段，由 Shell 在运行时拼接；cmd 变体用 `^` | S05-A01 四个用例 |
| 4 | B2-S05-…-A02：`new_processes_after_cancel=1` | 同上，新进程 `WMIC.exe` pid 6292，父进程 7492 = 驱动自己 | 套件缺陷：驱动的进程列表命令自己启动的 WMIC.exe 被后一次列表计为新增 | 驱动 `wmicRows`：排除“名称为 wmic.exe 且父进程是驱动自己”的行 | S05-A02 两个用例 |
| 5 | B2-S06-REFRESH-PAGING-RESTART：`restart_once=false` | `p05-session-bg/…/s06-refresh-paging.json`、`s06-after-restart.png`、`driver-session_restart.json`（IPC 序列） | 原因 UNKNOWN：重启后驱动只调预加载接口 `a9.activateConversation`，快照已报告被测对话为活动对话，页面 15 s 内仍显示 `b2:bg-ready-fail`；产品页面自己的切换函数 `switchConversation`（`renderer/a9-workbench.js:2071`）还会调 `refreshSnapshot` 与 `loadConversationEvents`。套件走了非用户路径；产品在“只调接口”场景的页面行为 UNKNOWN；与 KL-3 是否同源 UNKNOWN | 驱动 `activateConversation`：先点侧栏会话行并等页面标记为当前；标题不唯一或未列出时回退到接口并返回 `method: 'bridge'`；`sessionRestart` 记录切换方式与前后侧栏行 | S06 五个用例 |

另外的事实：预演 6 的 p05 中 B2-BG-01、B2-BG-02、B2-BG-03 与 S06 刷新路径 PASS；p03 12/12 PASS。

## 4. 请重点复核

按风险从高到低。

1. **`activateConversation` 默认改为点击侧栏。** 驱动里共有 9 处调用。请逐处确认：(a) 目标对话已是活动对话时行为不变；(b) 需要切换时点击行是用户路径；(c) 标题取自快照 `conversations[].title`，行的 `aria-label` 以 `${title}，` 开头（`renderer/a9-workbench.js` 的 `appendConversationRow`），标题含特殊字符或被截断时是否会落到回退分支；(d) 回退到接口后行为与旧代码相同；(e) 点击后等待“页面标记当前对话”是否会让原本通过的模式因页面渲染更慢而超时（20 s）。
2. **`runPrompt` 的基线读取。** 它在提交前调用 `events(await conversationId(), 1000)`。`queryEvents` 只允许当前会话（`a9-agent-runtime.js:2321`），请确认所有 `runPrompt` 调用点此时的活动对话就是将要提交的对话；确认 `limit=1000` 是最新的 1000 条，事件数超过 1000 时基线与后续读取是否仍可比较。
3. **`wmicRows` 的排除条件。** “名称 wmic.exe 且父进程号等于驱动 pid”只来自预演 6 一次观察（驱动 pid 7492 直接是 WMIC.exe 6292 的父进程）。请核对 `spawnSync('wmic.exe', …)` 在 Windows 上是否可能经 `cmd.exe` 中转（若经中转，WMIC.exe 的父进程是 cmd.exe，条件不成立；该情形预演 6 没有出现）。请核对排除不会漏掉产品自己的 WMIC 子进程（测试里有“父进程是产品 PowerShell 的 WMIC.exe 保留”）。
4. **`secret-split` 的 Shell 语法。** PowerShell 变体 `[Console]::Out.Write(('sk-T'+'ESTO'+…))` 与 `WriteLine` 的写法、cmd 变体的 `^` 转义，均只在开发机做了文本层检查，没有在 PowerShell 或 cmd 上运行过（UNKNOWN）。请从语法上核对；并核对 `S05-A01` 的判据（全文或前 10 个字符）与脱敏产品行为是否匹配。
5. **审计场景的三个文件。** `auditStop` 不再创建 `b2-hold.txt`；请核对 p04 之后没有模式依赖 audit 阶段创建的 `b2-hold.txt`。
6. **测试对源码的“切片”依赖。** 新用例用锚点字符串从驱动源码切出函数在 vm 中运行；请核对锚点被改动时测试会失败而不是静默通过，并核对 vm 里的假页面是否过度简化（例如 `aria-current`、`disabled` 的语义是否与 `appendConversationRow` 一致）。
7. **同类缺陷扫描（请求）。** 本轮发现的缺陷类别：(a) 终态判据命中以前 Turn 的事件；(b) 只调接口改变主进程状态却期待页面跟随；(c) 驱动自己的子进程被算成产品进程；(d) 同一 Turn 内三次相同参数的工具调用；(e) 判据检查的文字同时出现在命令文本里。p06～p10 里大部分模式从未在 Win7 运行过（p06 只在预演 4 运行过一次）。请对驱动、夹具、冒烟、控制器逐类扫描，列出命中点（文件:行）；没有命中写明检查了什么。

## 5. 新增的驱动假设

| # | 驱动假设 | 对照位置 |
|---|---|---|
| 24 | 驱动用 `spawnSync('wmic.exe')` 启动的 WMIC.exe 直接以驱动为父进程 | `a9-batch2-driver-entry.cjs` 的 `wmicRows`；预演 6 一次观察，其余 UNKNOWN |
| 25 | 侧栏会话行的 `aria-label` 以 `标题，` 开头，`aria-current` 在页面完成切换后为 `true` | `renderer/a9-workbench.js` 的 `appendConversationRow`；Win7 上的真实渲染 UNKNOWN |
| 26 | PowerShell 5.1 接受 `[Console]::Out.Write(('a'+'b'))` | Win7 实机 UNKNOWN |
| 27 | 重复调用检测只看“同 Turn 内连续三次相同工具名加相同参数” | `src/core/src/loop-control.ts`；开发机源码 |

## 6. 反例

执行代理在开发机对真实源码做了 8 个变异，每个都被至少一个新用例拦住，随后还原并用 `cmp` 核对与备份逐字节相同：

| 变异 | 被拦住的用例 |
|---|---|
| `runPrompt` 判据改回 `terminalReached(evts)` | “the second prompt of a conversation is not ended…” |
| `wmicRows` 去掉自身子进程过滤 | “only the direct WMIC.exe child…” |
| `activateConversation` 不走侧栏点击 | “a unique title is opened with the row click…” |
| `switchConversationInUi` 不等页面标记当前 | “a page that does not follow the click fails by name…” |
| `secret-split` 把一半密钥写成一个字面量 | “PowerShell: the command text is clean…” |
| `b2:audit-three` 三次读同一路径 | “the three reads name three different files…” |
| `b2:s04-*` 共用 call id | “each encoding prompt gets its own scripted call id” |
| `sessionRestart` 不记录切换方式 | “the restart journey opens the streamed conversation…” |

请在你自己的目录重做这 8 个，并另试下列 6 个；变更须在审核者自己的目录内完成并恢复，并核对哈希。

| 变更 | 预期被哪个测试拦住 |
|---|---|
| `runPrompt` 基线改为提交之后再读 | “the second prompt of a conversation is not ended…” |
| `switchConversationInUi` 不检查标题唯一性 | S06 “a title shared by two conversations…” |
| `activateConversation` 在标题不唯一时直接抛错而不回退 | 同上 |
| `splitPieces` 的段长由 4 改为 12 | “no five characters of the secret stay together…” |
| `AUDIT_READ_FILES` 改成两个文件 | “the three reads name three different files…” |
| `wmicRows` 过滤条件去掉父进程号比较（所有 WMIC.exe 都被排除） | “only the direct WMIC.exe child…”（产品自己的 WMIC.exe 应保留） |

## 7. 不在范围

Win7 与 Win10 的任何动作、预演 7 与正式执行的授权、候选冻结、关口 A 与 B、ADR-0155 的接受、A9-32 `DEVELOPER_VERIFIED` 的签发、完整 Alpha 2 裁决，以及任何产品语义改动（含 KL-3 的产品修复，需另立任务书）。
本包不请求任何执行授权。复核者的结论不构成关口签署。

## 执行代理实测记录

2026-10-14，执行代理，开发机，Node 20.17.0。本文第 2 节三个 `sh` 代码块用脚本原文抽出，在全新空目录里以 `bash -e` 一次执行，退出码 0，总用时 384 秒（01:17:01Z～01:23:25Z）。

| 步骤 | 实测 |
|---|---|
| `rev-parse` | `2c06317ccad767291e2bf9d55ea58bea6de9bdac` |
| 路径清单 | `PATHS_MATCH` |
| 累计统计 | 20 个文件，+7882、−31 |
| 本轮改动路径 | 3 个：夹具、契约测试、驱动 |
| 本轮统计 | 3 个文件，+296、−12 |
| `node --version` | `v20.17.0` |
| `verify:quick` | 通过 |
| `node --test` | 120 通过、0 失败（340 秒） |
| shell jest | 2 个套件、136 个用例通过；该环境无沙箱，没有 `EPERM` 失败 |
| `docs:check` | `ok`，330 个文件 |
| `diff --check` | 无输出 |
| 还原后 `status` | 0 行 |

另有一次在主检出里的验证（修复提交之前，同一工作树内容）：`node --test` 120 通过，`verify:quick` 退出 0，jest 136 通过。

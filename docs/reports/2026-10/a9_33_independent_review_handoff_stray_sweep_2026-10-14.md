# A9-33 独立审核交接包（驱动残留进程清扫与运行时复制修复，第 2 轮，2026-10-14，绑定修复提交 00fd643b…）

本包供 codex 对 A9-33 预演 10 暴露的套件缺陷的修复提交 `00fd643bbc262624e031cb58509406392aa1f195` 做窄范围复核。
这是同一缺陷的第 2 轮复核。第 1 轮（codex 第 11 轮，对 `14d1f43c45516d163c4c539260db35fc49d976ad`）报告 0 个 P0、1 个 P1（N1）、2 个 P2（N2、N3）；本提交的修复对应这三条，见第 3.1 节。
背景输入是预演 10 在 Win7 上的失败：p07、p08 以 `PHASE_RESULT_MISSING` 失败，原因是 p06 终止驱动后遗留的 Electron 网络服务孤儿进程占用了 `driver-electron\electron.exe`，后续阶段复制该文件报 `EBUSY`。事实见第 3 节，任务书记录见 [A9-33 §6.43](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md)（本包提交后另有文档提交，记录第 1 轮结果与本轮）。
负责人裁决（2026-10-14）：有 P0 或 P1 时执行代理直接修复、经 codex 复审，修复和预演均无需审批。
证据层级：修复本身是开发机；对预演 10 证据的读取结论是“Win7 实机（预演，非验收证据）”。修复后的驱动清扫在 Win7 上没有运行过，`NOT_PERFORMED`。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由执行代理登记。

处理规则：本轮若有 P0 或 P1，执行代理直接开下一个修复轮并送 codex 复审；若只剩 P2 及以下，登记已知限制，构建预演 11 包并上 Win7。请把每条发现的级别写准：不要为了让结论好看而降级，也不要为了凑数而升级。
本轮与扫描器无关：`api-key-prefix` 扫描器（第 7～10 轮）不在本轮范围，不改、不复核。

## 0. 审核会话启动说明

审核者是负责人另开的新会话，不带执行代理的上下文，也不是实现方。
审核者只读本文件、第 1 节列出的提交和第 3 节列出的证据，不写原隔离树、主工作区和已有 `.acceptance`。
审核者在自己的空目录复算，向负责人报告。不联网、不下载、不启动 Electron、不访问 Win10 或 Win7、不提交、不推送。

目录与磁盘纪律：

1. 所有命令先执行 `export TMPDIR="$PWD/tmp"`，使包测试的夹具落在复核根内。
2. 需要再克隆时用 `git clone --no-hardlinks`，不用 `cp -R`。
3. 写最终报告前清理自己根里的 `tmp` 夹具，使复核根占用小于 3 GB。

结论按 P0、P1、P2、信息分级。每条写 `文件:行`、依据和复现方式。没有发现时，写明检查了什么。
最后给出一句话：是否建议在该提交上进入预演 11（构建预演包并上 Win7）。

## 1. 对象与保护边界

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送 |
| 复核对象（代码） | `00fd643bbc262624e031cb58509406392aa1f195`。上一个被你复核的代码提交 `14d1f43c45516d163c4c539260db35fc49d976ad`（codex 第 11 轮）；再上一个 `c869661e4c7528a2ac87d66daa6ba1104770133c`。相对 `14d1f43c…` 本轮改 2 个文件：`release/win7-product-v3/a9-batch2-smoke.cjs` 和 `src/shell/tests/product/a9-batch2-contract.test.ts`，统计 `2 files changed, 97 insertions(+), 26 deletions(-)` |
| 运行测试用的检出 | 就是 `00fd643bbc262624e031cb58509406392aa1f195`（任务书已含 §6.43，包测试通过）。本包是未提交文件，不在该提交的树里 |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 9958 insertions(+), 31 deletions(-)` |
| 保护边界 | 不得改动产品语义和旧取证组件。20 个路径之外的非 `docs/` 文件必须没有差异 |

必须从提交取得文件，不能拿工作区文档对照。

已知限制（不得再列为发现）：KL-1、KL-2（见 §6.13）；KL-3（产品缺口：启动后台进程的 Turn 结束后渲染层不再刷新）；KL-4；KL-5（只有 UTF-8 与 CRLF 决定 S04 判定）；KL-6a（UI-02 800 以下宽度 NOT_VERIFIED）；KL-7 边界 a、b、c（p10 扫描器过度报告，不会漏报）。详见任务书 §6.24、§6.27、§6.33、§6.39～§6.41。

你上一轮已列为 `UNKNOWN` 的三项仍是 `UNKNOWN`，不作为本轮缺陷：孤儿占用是 `EBUSY` 的因果确证；Win7 的 `wmic` 对该孤儿返回完整 `ExecutablePath`；`taskkill /T /F` 对该孤儿的效果。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q 00fd643bbc262624e031cb58509406392aa1f195
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

预期：`rev-parse` 输出 `00fd643bbc262624e031cb58509406392aa1f195`。

第二步：核对范围。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 HEAD | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
wc -l < ../a9-33-changed-paths.txt
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 HEAD -- release scripts src
git -c core.fsmonitor=false diff --name-only 14d1f43c45516d163c4c539260db35fc49d976ad HEAD -- release scripts src
git -c core.fsmonitor=false diff --shortstat 14d1f43c45516d163c4c539260db35fc49d976ad HEAD -- release scripts src
```

预期：第一条输出 `20`，且路径集合与 [§6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径逐一相同（由审核者自己对照）；统计为 `20 files changed, 9958 insertions(+), 31 deletions(-)`；第三条只列出 `release/win7-product-v3/a9-batch2-smoke.cjs` 与 `src/shell/tests/product/a9-batch2-contract.test.ts`；最后一条为 `2 files changed, 97 insertions(+), 26 deletions(-)`。

第三步：开发机检查。同一 shell 中执行。

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

预期（执行代理在无沙箱环境实测）：`node --version` 为 `v20.17.0`；`node --test` 120 通过、0 失败；jest 225 个全部通过（其中 `driver runtime copy and the sweep` 组 7 个）；`docs:check` 为 `{"ok":true,"checked_files":341,"task_files":49}`（对 `3ec0bb4`；本包提交后文件数会变）；`diff --check` 无输出；`status --short` 在 `npm run verify:quick` 后可能因 `src/runner/dist` 重建而非空，所以先执行 `git restore src/runner/dist`，再看应为 `0`。若你的沙箱禁止回环监听导致 jest 用例 `listen EPERM` 失败，逐个列出用例名，标 `UNKNOWN`（沙箱），不要与缺陷混写。你上一轮列出过 8 个这样的用例（其中包括经 `ProviderFixture.listen` 的清扫用例）。

第四步：只跑本轮相关用例。

```sh
cd "$REVIEW_DIR/src/shell"
npx jest tests/product/a9-batch2-contract.test.ts -t "driver runtime copy and the sweep" 2>&1 | grep -E "✓|✕|Tests:"
```

预期：7 个 `✓`，`Tests: 175 skipped, 7 passed, 182 total`。沙箱禁止回环监听时，经 `runDriverPhase` 的那个用例会因 `listen EPERM` 失败，按 `UNKNOWN`（沙箱）处理。

## 3. Win7 预演 10 的事实（只读证据）

证据层级：Win7 实机（预演，非验收证据）。根目录 `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-10/`（以下简称 R10）；对照根 `…/rehearsal-9/`（简称 R9）。不要运行其中任何可执行文件。你上一轮已逐条核对这些事实并确认一致；本轮只需抽查，不必重做。

| 事实 | 文件 | 内容 |
|---|---|---|
| p07、p08 失败 | `R10/runs/sequence.log` | 账本 `p07-safe`、`p08-ui` 都是 `FAIL`、`failure_class=PHASE_RESULT_MISSING`，各用时不到 1 秒；p09、p10 被 `SAME_CLASS_FAILURE_TWICE_DIAGNOSE_FIRST` 拒绝 |
| 失败原因 | `R10/r7/evidence/requests/07-p07-safe/controller-stderr.txt`、`08-p08-ui/controller-stderr.txt` | `EBUSY: resource busy or locked, copyfile '…\deploy\…\electron.exe' -> '…\evidence\driver-electron\electron.exe'` |
| 孤儿进程 | `R10/r8/postflight-processes.csv` | 一行：`…\evidence\driver-electron\electron.exe --type=utility --utility-sub-type=network.mojom.NetworkService`，PID 4736，父进程 4988（已不在），会话 2 |
| 父进程是谁 | `R10/r7/evidence/requests/06-p06-continue/driver-launches.json` | `continue_unknown_interrupt` 的 `pid=4988`，`killed_by=marker`，`ended_at` 17:24:12.998Z |
| 重启网络服务的时刻 | `R10/r7/evidence/requests/06-p06-continue/product.log` | 第 19 行 `[4988:…:ERROR:network_service_instance_impl.cc(521)] Network service crashed, restarting service.`，时间 01:24:12.958（Win7 本地时间，UTC+8）即 17:24:12.958Z |
| 对照（预演 9 通过） | `R9/r7/evidence/requests/06-p06-continue/product.log` | 同一步骤（驱动 PID 3104）没有网络服务崩溃行；`R9/r8/` 无残留 |
| 代码路径 | `release/win7-product-v3/a9-batch2-smoke.cjs` | `killTree`（`taskkill /PID … /T /F`）、`prepareDriverRuntime`（每个驱动阶段重新复制整个运行时）、`launchDriver` |

执行代理的推断（你已判定：强支持，因果确证 `UNKNOWN`）：`taskkill /T` 只列一次子进程；终止主进程时 Chromium 把崩溃的网络服务重启，新的子进程不在列表里，父进程消失后成为孤儿，一直映射着该目录下的 `electron.exe`；p07 的 `copyFileSync` 覆盖被映射的可执行文件，Windows 拒绝。预演 9 同一步骤没有发生重启，所以通过，是时序差异。

### 3.1 你的第 11 轮发现与本轮修复的对应

| 编号 | 级别 | 你的发现 | 本轮修复（`00fd643b…`） | 对应用例与变异 |
|---|---|---|---|---|
| N1 | P1 | 清扫只看 `listing.failed`；空输出、只有表头、非 CSV 文本、缺 `ExecutablePath` 列的表都得到 `rows=[]`、`failed=false`，被累计成两轮干净，后续模式继续执行，`p08-ui` 在空表下 PASS | 新增 `usableProcessListing`：表必须有 `ProcessId`、`ParentProcessId`、`Name`、`ExecutablePath` 四列，且至少一行 `ProcessId > 0`，否则按失败列表处理，不算干净轮，并重置干净计数。`findDriverStrays` 用它给出 `failed` | 用例 `a process table that shows nothing usable is a failed listing…`（六种不可用表加一张可用表）；`runDriverPhase` 里空表使 `ui_interrupt` 之后不再启动后续模式；变异 M27～M30、M34 |
| N2 | P2 | 两个存活变异：X02 删除发现残留后的 `clean=0`；X03 最大轮数 8 改 7 | 补两个用例：`[干净, 残留, 干净, 干净]` 需要 4 次列表；6 轮残留后 2 轮干净需要第 8 轮 | 变异 M26（对应 X02）、M16（对应 X03）被拦 |
| N3 | P2 | `removed` 在发出 kill 后立即追加，顽固进程同时出现在 `removed` 与 `remaining` | 返回 `attempted`（已发出 kill）、`removed`（在最近一次可用列表里已不在）、`remaining`；失败列表使“最近一次可用列表”失效，此时不登记任何 `removed` | 顽固进程、只在失败列表里见过的进程、变异 M21、M31～M33 |

你的信息项 (d)7 指出两处前提不准：`strays` 只含 `pid/parent_pid/name`，没有路径字符串；六个驱动阶段的 `fixtures.evidenceForPhase` 都不含 `driver-launches.json`，既有递归扫描与全局、链路清单仍纳入它。本包按你的更正叙述，第 5 节相应改写。

## 4. 本轮修复

`release/win7-product-v3/a9-batch2-smoke.cjs`（第 1 条与第 3 条沿用 `14d1f43c…`，你已复核，无发现；第 2 条是本轮重点）：

1. `copyRuntimeFile`：目标已存在、大小相同、SHA-256 相同则不复制；否则复制，复制错误照旧抛出。`prepareDriverRuntime` 的复制（顶层文件、`locales`、`swiftshader` 目录树、`default_app.asar`）都改用它；驱动 `main.cjs` 的复制不变。
2. `usableProcessListing`、`findDriverStrays`、`sweepDriverStrays`：驱动被套件终止后（`killed_by` 为 `marker` 或 `timeout`），列出进程，凡 `ExecutablePath` 以 `<运行根>\driver-electron\` 开头（不区分大小写，必须带路径分隔符，排除本进程）的都用 `killTree` 终止并记录。每轮先等 500 毫秒再列；连续 2 轮“可用且无残留”的列表才算清扫完成；失败或不可用的列表不算干净并重置计数；最多 8 轮。返回 `{ attempted, removed, remaining, observed }`，写入 `driver-launches.json` 的该次启动记录（每个进程只记 `pid`、`parent_pid`、`name`）。`observed` 为 false 时，该次启动记 `failed` 并带 `driver_error: DRIVER_STRAY_PROCESS_NOT_REMOVED`，阶段结束。正常退出（`killed_by` 为 null）不清扫。
3. `runDriverPhase`：运行时复制抛错时，写 `driver-launches.json`（含 `runtime_prepare_error`）并以 `DRIVER_RUNTIME_PREPARE_FAILED` 结束阶段，写出 `phase-result.json`，不再让控制器崩溃而没有阶段结果。

`src/shell/tests/product/a9-batch2-contract.test.ts`：新增一个 `describe`（7 个用例），位于 `the driver runtime copy and the sweep of processes the harness left behind`；既有用例 `the smoke corrupts the mode settings before the unresolved-mode mode starts and restores the original bytes afterwards` 改为提供可用的进程表和清扫钩子（空表现在属于不可用）。

## 5. 重点复核点

1. N1 是否真正关闭：清扫入口现在拒绝空表、缺列表、无正 PID 行。请自己构造至少 6 种“解析成功但不可用”的进程表（含部分行、列顺序不同、带引号、带 BOM、只有 `ProcessId=0` 的行、只有表头），说明哪些仍会被当作干净。同时核对清扫与 G0 环境检查、链路后检、p10 残留检查对空进程表的口径是否一致（你上一轮把这三处记为 `UNKNOWN`）。
2. 竞态是否闭合：500 毫秒加两轮可用且干净的列表，是否覆盖“主进程被杀后网络服务在 `close` 事件之后才重启”的时序？更晚才出现的孤儿由 p10 残留检查兜底，该兜底是否可信？你上一轮已判定此点只证明有限观察窗口，请确认本轮未使其变差。
3. 清扫是否会遮住产品残留：只在套件自己杀驱动之后清扫，且只清 `driver-electron` 目录下的进程。请再核对 `B2-CH-0x` 的后检和 p10 的残留检查是否仍能看到产品残留；驱动正常退出时不清扫，残留是否仍被后检看见。`killTree` 带 `/T`，是否会连带终止树外进程（你上一轮标 `UNKNOWN`）。
4. `attempted`、`removed`、`remaining` 三者的语义：是否在所有路径上自洽？失败列表之后 `removed` 为空是否过严，会不会让一次实际成功的清扫被判为失败（会判为 `observed=false` 的前提是什么）？
5. `copyRuntimeFile` 的语义与耗时：你上一轮已确认开发机成立；请只确认本轮没有改动它。真实 Win7 上整文件哈希 157 MB 两次的耗时和内存 `UNKNOWN`。
6. `DRIVER_RUNTIME_PREPARE_FAILED` 与“同一类失败两次即暂停”的守卫兼容：沿用上一轮结论，请确认未变。
7. 变异：第 6 节的 34 个变异，执行代理结果：33 个被拦、1 个等价（M03 去掉大小比较，结果仍是哈希比较；你上一轮已认可其限定等价性）。请你另试至少 3 个新的，重点是 N1 一类：其他能让“空或不完整的进程表”被当作干净的路径，和 N3 一类：让进程同时出现在 `removed` 与 `remaining` 的路径。
8. 证据与扫描：`driver-launches.json` 的 `strays` 只含 `pid/parent_pid/name`，`runtime_prepare_error` 可能含路径字符串，进入 p10 的秘密扫描与清单后是否引入新的误报；该文件不在六个驱动阶段的 `evidenceForPhase` 里，是否引入清单问题。

## 6. 变异清单（执行代理用的）

在你自己的克隆里执行：把下面 `M=[...]` 的内容放进一个脚本，对 `release/win7-product-v3/a9-batch2-smoke.cjs` 逐个替换（每个 `old` 恰好出现一次），运行第 2 节第四步的命令，结果含 ` failed` 即被拦。每个变异后恢复文件并核对哈希。M26 对应你的 X02，M16 对应你的 X03。

```python
M=[
 ('M01 never skip equal copy', u"same = target.isFile() && target.size === fs.statSync(from).size && sha256File(to) === sha256File(from);", u"same = false;"),
 ('M02 skip on equal size only', u"target.size === fs.statSync(from).size && sha256File(to) === sha256File(from);", u"target.size === fs.statSync(from).size;"),
 ('M03 skip on equal hash only (size dropped; equivalent)', u"target.isFile() && target.size === fs.statSync(from).size && sha256File(to)", u"target.isFile() && sha256File(to)"),
 ('M04 prefix without separator', u"const prefix = `${path.resolve(runtimeRoot).toLowerCase().replace(/[\\\\/]+$/, '')}${path.sep}`;", u"const prefix = `${path.resolve(runtimeRoot).toLowerCase().replace(/[\\\\/]+$/, '')}`;"),
 ('M05 path compare case-sensitive', u"String(row.ExecutablePath || '').toLowerCase().startsWith(prefix))\n    .map", u"String(row.ExecutablePath || '').startsWith(prefix))\n    .map"),
 ('M06 own pid not excluded', u"Number(row.ProcessId) !== process.pid && String(row.ExecutablePath", u"String(row.ExecutablePath"),
 ('M07 sweep after every exit', u"const strays = exit.killed_by ? await", u"const strays = true ? await"),
 ('M08 sweep after marker kill only', u"const strays = exit.killed_by ? await", u"const strays = exit.killed_by === 'marker' ? await"),
 ('M09 one clean round', u"const STRAY_SWEEP_CLEAN_ROUNDS = 2;", u"const STRAY_SWEEP_CLEAN_ROUNDS = 1;"),
 ('M10 a failed listing counts clean', u"    } else if (found.failed) clean = 0;\n    else clean += 1;", u"    } else clean += 1;"),
 ('M11 remaining always empty', u"remaining: observed ? [] : lastStrays, observed };", u"remaining: [], observed };"),
 ('M12 observed always true', u"const observed = clean >= STRAY_SWEEP_CLEAN_ROUNDS;", u"const observed = true;"),
 ('M13 an unobserved sweep does not fail the launch', u"if (strays && !strays.observed) {", u"if (strays && strays.remaining.length > 0) {"),
 ('M14 prepare outside try', u"  let runtime;\n  try { runtime = (hooks && hooks.runtime) || prepareDriverRuntime(ctx.candidateRoot, ctx.runRoot); }\n  catch (error) {", u"  let runtime = (hooks && hooks.runtime) || prepareDriverRuntime(ctx.candidateRoot, ctx.runRoot);\n  try { }\n  catch (error) {"),
 ('M15 sweep wait zero', u"const STRAY_SWEEP_WAIT_MS = 500;", u"const STRAY_SWEEP_WAIT_MS = 0;"),
 ('M16 seven sweep rounds (your X03)', u"const STRAY_SWEEP_ROUNDS = 8;", u"const STRAY_SWEEP_ROUNDS = 7;"),
 ('M17 one sweep round', u"const STRAY_SWEEP_ROUNDS = 8;", u"const STRAY_SWEEP_ROUNDS = 1;"),
 ('M18 prepare failure writes no launches file', u"    writeJson(path.join(ctx.attemptDir, 'driver-launches.json'), { schema_version: 1, driver_sha256: null, launches: [],\n      runtime_prepare_error: String(error && error.message ? error.message : error).slice(0, 400) });\n", u""),
 ('M19 prepare failure class renamed', u"return finishPhase(ctx, 'DRIVER_RUNTIME_PREPARE_FAILED');", u"return finishPhase(ctx, 'DRIVER_FAILED');"),
 ('M20 strays not recorded in the launch', u"        ...(strays ? { strays } : {}),\n", u""),
 ('M21 attempt not recorded', u"        if (!attempted.some((item) => item.pid === stray.pid)) attempted.push(stray);\n", u""),
 ('M22 stray not killed', u"        kill(stray.pid);\n", u""),
 ('M23 runtime asar copy bypasses idempotence', u"  copyRuntimeFile(path.join(candidateRoot, 'resources', 'default_app.asar')", u"  fs.copyFileSync(path.join(candidateRoot, 'resources', 'default_app.asar')"),
 ('M24 copyTree bypasses idempotence', u"else if (entry.isFile()) copyRuntimeFile(from, to);", u"else if (entry.isFile()) fs.copyFileSync(from, to);"),
 ('M25 top-level bypasses idempotence', u"if (entry.isFile()) copyRuntimeFile(path.join(candidateRoot, entry.name)", u"if (entry.isFile()) fs.copyFileSync(path.join(candidateRoot, entry.name)"),
 ('M26 stray found resets nothing (your X02)', u"    if (found.strays.length) {\n      clean = 0;\n", u"    if (found.strays.length) {\n"),
 ('M27 empty table counts usable', u"  if (listing.failed || listing.rows.length === 0) return false;", u"  if (listing.failed) return false;"),
 ('M28 column check dropped', u"  if (!PROCESS_LISTING_COLUMNS.every((column) => Object.prototype.hasOwnProperty.call(listing.rows[0], column))) return false;\n", u""),
 ('M29 positive pid check dropped', u"  return listing.rows.some((row) => Number(row.ProcessId) > 0);", u"  return true;"),
 ('M30 listing usability ignored', u"return { strays, failed: !usableProcessListing(listing) };", u"return { strays, failed: listing.failed };"),
 ('M31 attempted counted as removed', u"const removed = attempted.filter((item) => lastUsable !== null && !lastUsable.has(item.pid));", u"const removed = attempted;"),
 ('M32 removed without a usable listing', u"const removed = attempted.filter((item) => lastUsable !== null && !lastUsable.has(item.pid));", u"const removed = attempted.filter((item) => lastUsable === null || !lastUsable.has(item.pid));"),
 ('M33 failed listing keeps the last usable set', u"    lastUsable = found.failed ? null : new Set(found.strays.map((item) => item.pid));", u"    if (!found.failed) lastUsable = new Set(found.strays.map((item) => item.pid));"),
 ('M34 empty table does not stop the launch', u"if (strays && !strays.observed) {", u"if (strays && strays.remaining.length > 0 && strays.attempted.length > 0) {"),
]
```

## 7. 假设与范围外

假设（请逐条给出成立、不成立或 UNKNOWN；你上一轮的结论分别是 UNKNOWN、UNKNOWN、UNKNOWN）：

1. 孤儿进程占用 `electron.exe` 是 `EBUSY` 的原因（证据：第 3 节；未做独立复现，因为不能在 Windows 上运行）。
2. Win7 的 `wmic process get ExecutablePath` 对孤儿进程返回完整路径（旁证：预演 9 的 p10 残留检查读同一个 `wmic_processes` 列表，`R9/r7/evidence/requests/10-p10-postflight/g4-postflight.json` 记录 `processes_total=104`、`residue=[]`，说明该列表可读；R10 的 `r8/postflight-processes.csv` 是执行代理自己查的，列是 `CommandLine`，没有 `ExecutablePath`，所以孤儿进程的 `ExecutablePath` 在 Win7 上 `UNKNOWN`）。本轮的新补充：若 `ExecutablePath` 对该孤儿为空，则清扫找不到它，`observed` 仍可能为 true；这个路径由 p10 残留检查兜底，兜底的前提是 p10 读到同一列。
3. `taskkill.exe /PID n /T /F` 能终止这类孤儿（同一命令已用于终止驱动；对孤儿的效果在 Win7 上 `NOT_PERFORMED`）。

范围外：产品代码、`api-key-prefix` 扫描器、控制器 PowerShell、请求脚本。预演 10 遗留的 PID 4736 是否由负责人授权终止，不在本轮。

## 8. 报告要求

最终回复就是复核报告，按 P0 / P1 / P2 / 信息 分级，每条给 `文件:行`、证据和理由。报告必须包含：

(a) 你实际执行的命令清单及退出码；
(b) 第 2 节各预期是否一致；
(c) 第 3 节事实是否仍与证据一致（抽查即可），以及对根因推断的独立结论；
(d) 第 3.1 节三条（N1、N2、N3）逐条是否关闭，并说明依据；
(e) 第 5 节各重点复核点逐条结论；
(f) 第 7 节假设逐条结论；
(g) 第 6 节变异你实际做了哪些、结果如何，以及另试的至少 3 个；
(h) 是否发现范围外或白名单外改动；
(i) 本轮新发现的缺陷（含修复引入的回归），每条标明级别；
(j) 最后一句明确：是否建议 A9-33 在该提交上进入预演 11（构建预演包并上 Win7）。

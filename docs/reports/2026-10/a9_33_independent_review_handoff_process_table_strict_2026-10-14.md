# A9-33 独立审核交接包（进程表严格读取修复，第 3 轮，2026-10-14，绑定修复提交 52bcfb88…）

本包供 codex 对同一缺陷的第 3 次复核：A9-33 预演 10 暴露的驱动残留进程缺陷，修复提交 `52bcfb8800f081d495305cc0b5386ad7e683961e`。
前两轮你对该缺陷的复核：第 11 轮（对 `14d1f43c45516d163c4c539260db35fc49d976ad`）报告 N1（P1）、N2、N3（P2）；第 12 轮（对 `00fd643bbc262624e031cb58509406392aa1f195`）报告 N1 未关闭（P1），N2、N3 已关闭，没有新的独立 P2。本轮只处理 N1 的剩余部分。
这是 N1 的第二次未关闭，所以本轮没有再补第 12 轮那三种坏表，而是改了进程表的读取方式：坏行规则放在所有读取处共用的读取函数里，见第 4 节。
背景事实（Win7 预演 10 的 p07、p08 失败与根因）见第 3 节，你已两次核对，本轮只需抽查。
负责人裁决（2026-10-14）：有 P0 或 P1 时执行代理直接修复、经 codex 复审，修复和预演均无需审批。
证据层级：修复本身是开发机；对预演 10 证据的读取结论是“Win7 实机（预演，非验收证据）”。修复后的清扫在 Win7 上没有运行过，`NOT_PERFORMED`。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由执行代理登记。

处理规则：本轮若有 P0 或 P1，执行代理直接开下一个修复轮并送 codex 复审；若只剩 P2 及以下，登记已知限制，构建预演 11 包并上 Win7。请把每条发现的级别写准：不要为了让结论好看而降级，也不要为了凑数而升级。
本轮与 `api-key-prefix` 扫描器无关，不改、不复核。

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
| 复核对象（代码） | `52bcfb8800f081d495305cc0b5386ad7e683961e`。上一个被你复核的代码提交 `00fd643bbc262624e031cb58509406392aa1f195`（第 12 轮）。相对 `00fd643b…` 本轮改 2 个文件：`release/win7-product-v3/a9-batch2-smoke.cjs` 和 `src/shell/tests/product/a9-batch2-contract.test.ts`，统计 `2 files changed, 205 insertions(+), 13 deletions(-)` |
| 运行测试用的检出 | 就是 `52bcfb8800f081d495305cc0b5386ad7e683961e`。本包是未提交文件，不在该提交的树里 |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 10150 insertions(+), 31 deletions(-)` |
| 保护边界 | 不得改动产品语义和旧取证组件。20 个路径之外的非 `docs/` 文件必须没有差异 |

必须从提交取得文件，不能拿工作区文档对照。

已知限制（不得再列为发现）：KL-1、KL-2（见 §6.13）；KL-3；KL-4；KL-5；KL-6a；KL-7 边界 a、b、c。详见任务书 §6.24、§6.27、§6.33、§6.39～§6.41。
你上两轮列为 `UNKNOWN` 的三项仍是 `UNKNOWN`，不作为本轮缺陷：孤儿占用是 `EBUSY` 的因果确证；Win7 的 `wmic` 对该孤儿返回完整 `ExecutablePath`；`taskkill /T /F` 对该孤儿的效果。
你在第 12 轮记为既有 `UNKNOWN` 的一项也保持不变：表完整但某行的路径单元格为空时，清扫看不到这个进程。执行代理没有为它加检查，理由见第 5 节第 2 点；如你认为它应是缺陷，请按级别单列。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q 52bcfb8800f081d495305cc0b5386ad7e683961e
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

预期：`rev-parse` 输出 `52bcfb8800f081d495305cc0b5386ad7e683961e`。

第二步：核对范围。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 HEAD | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
wc -l < ../a9-33-changed-paths.txt
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 HEAD -- release scripts src
git -c core.fsmonitor=false diff --name-only 00fd643bbc262624e031cb58509406392aa1f195 HEAD -- release scripts src
git -c core.fsmonitor=false diff --shortstat 00fd643bbc262624e031cb58509406392aa1f195 HEAD -- release scripts src
```

预期：第一条输出 `20`，路径集合与 [§6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径逐一相同（由审核者自己对照）；统计为 `20 files changed, 10150 insertions(+), 31 deletions(-)`；第三条只列出 `release/win7-product-v3/a9-batch2-smoke.cjs` 与 `src/shell/tests/product/a9-batch2-contract.test.ts`；最后一条为 `2 files changed, 205 insertions(+), 13 deletions(-)`。

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

预期（执行代理在无沙箱环境实测）：`node --version` 为 `v20.17.0`；`node --test` 120 通过、0 失败；jest 229 个全部通过（其中 `driver runtime copy and the sweep` 组 11 个）；`docs:check` 在 `52bcfb88…` 为 `ok`，`checked_files` 为 `341`（本包提交后文件数会变）；`diff --check` 无输出；`status --short` 先执行 `git restore src/runner/dist` 再看应为 `0`。若你的沙箱禁止回环监听导致 jest 用例 `listen EPERM` 失败，逐个列出用例名，标 `UNKNOWN`（沙箱），不要与缺陷混写。你上一轮列出过 8 个这样的用例。

第四步：只跑本轮相关用例。

```sh
cd "$REVIEW_DIR/src/shell"
npx jest tests/product/a9-batch2-contract.test.ts -t "driver runtime copy and the sweep" 2>&1 | grep -E "✓|✕|Tests:"
```

预期：11 个 `✓`，`Tests: 175 skipped, 11 passed, 186 total`。沙箱禁止回环监听时，经 `runDriverPhase` 的那个用例会因 `listen EPERM` 失败，按 `UNKNOWN`（沙箱）处理。

## 3. Win7 预演 10 的事实（只读证据）

证据层级：Win7 实机（预演，非验收证据）。根目录 `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-10/`（简称 R10）；对照根 `…/rehearsal-9/`（简称 R9）。不要运行其中任何可执行文件。你已两次逐条核对这些事实并确认一致；本轮只需抽查，并读取第 5 节第 1 点用到的两份真实进程表。

| 事实 | 文件 | 内容 |
|---|---|---|
| p07、p08 失败 | `R10/runs/sequence.log` | 账本 `p07-safe`、`p08-ui` 都是 `FAIL`、`failure_class=PHASE_RESULT_MISSING` |
| 失败原因 | `R10/r7/evidence/requests/07-p07-safe/controller-stderr.txt`、`08-p08-ui/controller-stderr.txt` | `EBUSY` 覆盖 `driver-electron\electron.exe` |
| 孤儿进程 | `R10/r8/postflight-processes.csv` | PID 4736，父进程 4988（已不在），NetworkService |
| 真实进程表（带命令行列） | `R10/r1/processes-output-utf8.txt`、`R9/r1/processes-output-utf8.txt` | 执行代理在 R1 用只读 `wmic` 查询（列为 `CommandLine,Name,ParentProcessId,ProcessId,SessionId`，CSV 格式）取得的 102 行真实输出。**套件自己的命令不含 `CommandLine` 列**（`FIXED_COMMANDS.wmic_processes` 请求 `ProcessId,ParentProcessId,Name,ExecutablePath,SessionId,CreationDate`），所以这两份只能说明 Win7 上 wmic 输出的形状，不能当套件的输入；其中 `CommandLine` 列的单元格含未加引号的逗号，是 wmic 不加引号的实例 |
| 套件读取这张表的位置 | `release/win7-product-v3/a9-batch2-smoke.cjs` | 同一个读取函数 `listProcesses` 供清扫、环境检查（G0）、链路后检、p10 后检使用 |

## 3.1 你的第 12 轮发现与本轮修复的对应

| 编号 | 级别 | 你的发现 | 本轮修复（`52bcfb88…`） | 对应用例与变异 |
|---|---|---|---|---|
| N1 剩余 | P1 | 新增校验只看首行是否有四个键和某一行 `PID > 0`；成功命令的 CSV 解析给缺失单元格补空串，也不报告未闭合引号。三个反例仍被认作干净：最后一个单元格缺失的短行（`HOST,4736,4988,electron.exe` 配五列表头）；正常行之后追加短行 `HOST,date`；追加含 driver 路径与 PID 但引号未闭合的行。在 `runDriverPhase` 探针里三者都得到 `ui_interrupt → ui_continue → ui_layouts`、`PASS`；真实 `runPostflightPhase` 在两个不完整表下也是 `PASS` | 新增 `parseCsvLineStrict`（严格的单行读取）和 `readWmicTable`（按行读表）。表头名有空名或重名，或任一行读不出（引号不成对、引号在单元格中间、闭合引号后有字符）或单元格数与表头不同，或表没有数据行，或输出为空，整张表 `intact=false`。`listProcesses` 在 `intact=false` 时 `failed=true` 并给出 `problem`；读得出的完整行仍作为“有进程”的证据返回。清扫的 `usableProcessListing` 另外要求每行有四列、`ProcessId` 与 `ParentProcessId` 是数字、`Name` 非空，且至少一行 `ProcessId > 0` | 用例：严格读取单元用例；`brokenTables`（12 种）、`unshapedTables`（3 种）、完整表保持可用（7 种）；固定种子随机破坏（7 种破坏各 40 次）；环境检查、p10 后检、`runDriverPhase` 各一个整合用例。变异 N01～N22 |

## 4. 本轮修复

`release/win7-product-v3/a9-batch2-smoke.cjs`：

1. `parseCsvLineStrict(line)`：引号只能开在单元格开头；带引号的单元格必须闭合，且闭合后只能是逗号或行尾；`""` 是一个引号；无引号的单元格里出现引号、带引号的单元格未闭合或闭合后有字符，返回 `null`。结尾的逗号得到最后一个空单元格。
2. `readWmicTable(text)`：按行拆分（先按 `\r?\n` 拆，再去掉所有 `\r`，所以 Win7 的 `\r\r\n` 行尾也读得进）；去掉空白行；首行严格读取为表头，表头名空或重复即不完整；其余每行严格读取，读不出或单元格数不等于表头，记第一个 `problem`（`row_<行号>_cell_count` 或 `row_<行号>_quoting`），该行不进 `rows`；没有数据行记 `no_rows`；输出为空记 `empty_output`。返回 `{ rows, intact, problem }`。`problem` 只含类别和行号，不引用输出内容。
3. `listProcesses(exec)`：先读表，再看命令是否成功。命令失败、有错误、输出被截断，或表不完整，`failed=true`。`rows` 始终是读得出的完整行，所以完整行里的残留或幸存者仍然使对应断言 `FAIL`。
4. `usableProcessListing(listing)`：`failed` 为真则不可用；其余行规则见 3.1 表。仅清扫用它；其他读取处只用 `failed`。
5. 其余（`copyRuntimeFile`、`sweepDriverStrays` 的轮数与等待、`attempted/removed/remaining` 的语义、`runDriverPhase` 的失败类别）与 `00fd643b…` 相同。

`src/shell/tests/product/a9-batch2-contract.test.ts`：同一个 `describe` 里新增 4 个用例，共 11 个；其他用例未改。第 12 轮以前存在的 182 个用例在严格读取下全部通过，没有改夹具。

## 5. 重点复核点

1. N1 是否真正关闭，以及严格读取在真实 Win7 上是否会把完整的表误判为不完整。请自己构造至少 10 种新的坏表（不要只用本包的 12 种），说明哪些仍被认作干净，并给出每种的级别理由。关于误判：执行代理检查了 `R10/r1`、`R9/r1`、`R10/r8/postflight-processes.csv` 三份真实输出（102、102、104 行）的可执行路径，没有含逗号的路径（该检查读的是 `CommandLine` 列的第一个词，不是 `ExecutablePath`，所以不是套件那张表）；套件那张表的原始输出从未取回，是否有路径含逗号 `UNKNOWN`。一旦有，严格读取会把整张表判为不完整，清扫记 `DRIVER_STRAY_PROCESS_NOT_REMOVED`、G0 记 `UNKNOWN`，这是有意的关闭方向。请评价这个取舍是否合适，以及 `\r\r\n`、GBK 代码页的名称对严格读取的影响。
2. 读不出的残留：表完整、每行形状对，但 orphan 那一行的 `ExecutablePath` 为空，清扫仍看不见它。执行代理考虑过“当前进程自己的那行必须有非空路径”的自检，没有加，理由是它在真实 Win7 上的行为（路径形式、8.3 短名、大小写）没有证据，误判会让每次清扫失败。请评价；你认为它应是缺陷则单列。
3. 四个读取处（清扫、G0、链路后检、p10）现在共用 `listProcesses`，对坏表一致地给 `UNKNOWN` 或失败。请核对：这个一致性有没有被某个读取处的早退或另一份解析绕开（例如驱动里自己读 wmic 的地方）；你第 12 轮说 S:192、846、875 对空表是 `UNKNOWN`，现在对坏表是否也一致。
4. `attempted/removed/remaining/observed` 的语义与 `00fd643b…` 相同；请确认没有变坏，尤其“坏表之后不登记 removed”。
5. 不可检测的损坏：整行被删（进程根本不在表里）、最后一个单元格被截成少几个字符但个数对。执行代理认为这两种在原理上无法与“进程不存在”区分，不应算缺陷。请逐条给出你的判断，并说明还有没有第三类。
6. 变异：第 6 节的 54 个变异，执行代理结果：53 个被拦、1 个等价（M03 去掉大小比较，结果仍是哈希比较；你上两轮已认可）。已删除两个等价变异对应的多余代码（`parseCsvLineStrict` 里结尾逗号的特例，和 `usableProcessListing` 里 `rows.length === 0` 的重复判断）。请你另试至少 4 个新的，重点是严格读取的边界。
7. 证据与扫描：本轮没有新增证据文件或字段；`problem` 只在内存里返回，不写入证据。若你认为 `problem` 应写进 `g4-postflight.json` 等文件以便 Win7 上诊断，请标明理由与级别；执行代理的取舍是不写，Win7 上要看原因时用 R1 的只读 `wmic` 命令重取。

## 6. 变异清单（执行代理用的）

在你自己的克隆里执行：把下面 `M=[...]` 的内容放进一个脚本，对 `release/win7-product-v3/a9-batch2-smoke.cjs` 逐个替换（每个 `old` 恰好出现一次），运行第 2 节第四步的命令，结果含 ` failed` 即被拦。每个变异后恢复文件并核对哈希。M26 对应你第 11 轮的 X02，M16 对应 X03。M27 和旧版“结尾逗号”变异（N04）已随多余代码删除，编号保留空缺。

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
 ('M16 seven sweep rounds (codex X03)', u"const STRAY_SWEEP_ROUNDS = 8;", u"const STRAY_SWEEP_ROUNDS = 7;"),
 ('M17 one sweep round', u"const STRAY_SWEEP_ROUNDS = 8;", u"const STRAY_SWEEP_ROUNDS = 1;"),
 ('M18 prepare failure writes no launches file', u"    writeJson(path.join(ctx.attemptDir, 'driver-launches.json'), { schema_version: 1, driver_sha256: null, launches: [],\n      runtime_prepare_error: String(error && error.message ? error.message : error).slice(0, 400) });\n", u""),
 ('M19 prepare failure class renamed', u"return finishPhase(ctx, 'DRIVER_RUNTIME_PREPARE_FAILED');", u"return finishPhase(ctx, 'DRIVER_FAILED');"),
 ('M20 strays not recorded in the launch', u"        ...(strays ? { strays } : {}),\n", u""),
 ('M21 attempt not recorded', u"        if (!attempted.some((item) => item.pid === stray.pid)) attempted.push(stray);\n", u""),
 ('M22 stray not killed', u"        kill(stray.pid);\n", u""),
 ('M23 runtime asar copy bypasses idempotence', u"  copyRuntimeFile(path.join(candidateRoot, 'resources', 'default_app.asar')", u"  fs.copyFileSync(path.join(candidateRoot, 'resources', 'default_app.asar')"),
 ('M24 copyTree bypasses idempotence', u"else if (entry.isFile()) copyRuntimeFile(from, to);", u"else if (entry.isFile()) fs.copyFileSync(from, to);"),
 ('M25 top-level bypasses idempotence', u"if (entry.isFile()) copyRuntimeFile(path.join(candidateRoot, entry.name)", u"if (entry.isFile()) fs.copyFileSync(path.join(candidateRoot, entry.name)"),
 ('M26 stray found resets nothing (codex X02)', u"    if (found.strays.length) {\n      clean = 0;\n", u"    if (found.strays.length) {\n"),
 ('M28 column check dropped', u"const shaped = listing.rows.every((row) => PROCESS_LISTING_COLUMNS.every((column) => Object.prototype.hasOwnProperty.call(row, column))\n    && ", u"const shaped = listing.rows.every((row) => true\n    && "),
 ('M29 positive pid check dropped', u"  return shaped && listing.rows.some((row) => Number(row.ProcessId) > 0);", u"  return shaped;"),
 ('M30 listing usability ignored', u"return { strays, failed: !usableProcessListing(listing) };", u"return { strays, failed: listing.failed };"),
 ('M31 attempted counted as removed', u"const removed = attempted.filter((item) => lastUsable !== null && !lastUsable.has(item.pid));", u"const removed = attempted;"),
 ('M32 removed without a usable listing', u"const removed = attempted.filter((item) => lastUsable !== null && !lastUsable.has(item.pid));", u"const removed = attempted.filter((item) => lastUsable === null || !lastUsable.has(item.pid));"),
 ('M33 failed listing keeps the last usable set', u"    lastUsable = found.failed ? null : new Set(found.strays.map((item) => item.pid));", u"    if (!found.failed) lastUsable = new Set(found.strays.map((item) => item.pid));"),
 ('M34 empty table does not stop the launch', u"if (strays && !strays.observed) {", u"if (strays && strays.remaining.length > 0 && strays.attempted.length > 0) {"),
 ('N01 quote allowed inside an unquoted cell', u"        if (line[index] === '\"') return null;\n        cell += line[index];\n        index += 1;\n      }\n    }\n    out.push(cell);", u"        cell += line[index];\n        index += 1;\n      }\n    }\n    out.push(cell);"),
 ('N02 unclosed quote allowed', u"if (!closed || (index < line.length && line[index] !== ',')) return null;", u"if (index < line.length && line[index] !== ',') return null;"),
 ('N03 text after a closing quote allowed', u"if (!closed || (index < line.length && line[index] !== ',')) return null;", u"if (!closed) return null;"),
 ('N05 doubled quote not unescaped', u"if (line[index + 1] === '\"') { cell += '\"'; index += 2; continue; }", u""),
 ('N06 empty header names allowed', u"header.some((name) => name.trim() === '') || ", u""),
 ('N07 duplicate header names allowed', u" || new Set(header).size !== header.length) return { rows: [], intact: false, problem: 'header_invalid' };", u") return { rows: [], intact: false, problem: 'header_invalid' };"),
 ('N08 cell count not compared', u"if (!cells || cells.length !== header.length) {", u"if (!cells) {"),
 ('N09 a table without rows is intact', u"if (problem === null && rows.length === 0) problem = 'no_rows';", u""),
 ('N10 listing ignores table integrity', u"return { rows: table.rows, failed: !table.intact, problem: table.problem };", u"return { rows: table.rows, failed: false, problem: table.problem };"),
 ('N11 empty output is intact', u"if (lines.length === 0) return { rows: [], intact: false, problem: 'empty_output' };", u"if (lines.length === 0) return { rows: [], intact: true, problem: null };"),
 ('N12 process id need not be a number', u"&& DIGITS.test(String(row.ProcessId).trim()) && DIGITS.test(String(row.ParentProcessId).trim())", u"&& DIGITS.test(String(row.ParentProcessId).trim())"),
 ('N13 parent id need not be a number', u"&& DIGITS.test(String(row.ProcessId).trim()) && DIGITS.test(String(row.ParentProcessId).trim())", u"&& DIGITS.test(String(row.ProcessId).trim())"),
 ('N14 name may be empty', u" && String(row.Name).trim() !== '');", u");"),
 ('N15 shape needs only one row', u"const shaped = listing.rows.every(", u"const shaped = listing.rows.some("),
 ('N16 complete rows of a broken table dropped', u"  return { rows: table.rows, failed: !table.intact, problem: table.problem };", u"  return { rows: table.intact ? table.rows : [], failed: !table.intact, problem: table.problem };"),
 ('N17 row number off by one in the problem', u"problem = `row_${index + 2}_${cells ? 'cell_count' : 'quoting'}`;", u"problem = `row_${index + 1}_${cells ? 'cell_count' : 'quoting'}`;"),
 ('N18 problem never named', u"if (problem === null) problem = `row_${index + 2}_${cells ? 'cell_count' : 'quoting'}`;", u"if (problem === null) problem = '';"),
 ('N19 header junk allowed (header not parsed strictly)', u"const header = parseCsvLineStrict(lines[0]);\n  if (!header ||", u"const header = parseCsvLine(lines[0]);\n  if (!header ||"),
 ('N20 rows parsed leniently', u"    const cells = parseCsvLineStrict(line);\n    if (!cells || cells.length", u"    const cells = parseCsvLine(line);\n    if (!cells || cells.length"),
 ('N21 p10 ignores a failed listing', u"listing.failed || processes.length === 0 ? 'UNKNOWN'", u"processes.length === 0 ? 'UNKNOWN'"),
 ('N22 environment ignores a failed listing', u"processes_listing_failed: listing.failed,", u"processes_listing_failed: false,"),
]
```

## 7. 假设与范围外

假设（请逐条给出成立、不成立或 UNKNOWN；你上两轮的结论都是 UNKNOWN）：

1. 孤儿进程占用 `electron.exe` 是 `EBUSY` 的原因。
2. Win7 的 `wmic process get ExecutablePath` 对孤儿进程返回完整路径。若返回空，清扫看不到它，见第 5 节第 2 点。
3. `taskkill.exe /PID n /T /F` 能终止这类孤儿。
4. 新假设：套件的 `wmic_processes` 命令在 Win7 上输出的每一行，单元格数都等于表头数（即没有路径含逗号），行尾是 `\r\r\n`，没有引号。证据：无（套件那张表从未取回原文），旁证见第 3 节。

范围外：产品代码、`api-key-prefix` 扫描器、控制器 PowerShell、请求脚本、驱动文件。预演 10 遗留的 PID 4736 是否由负责人授权终止，不在本轮。

## 8. 报告要求

最终回复就是复核报告，按 P0 / P1 / P2 / 信息 分级，每条给 `文件:行`、证据和理由。报告必须包含：

(a) 你实际执行的命令清单及退出码；
(b) 第 2 节各预期是否一致；
(c) 第 3 节事实是否仍与证据一致（抽查即可），以及对根因推断的独立结论；
(d) N1 剩余部分是否关闭，并说明依据；
(e) 第 5 节各重点复核点逐条结论；
(f) 第 7 节假设逐条结论；
(g) 第 6 节变异你实际做了哪些、结果如何，以及另试的至少 4 个；
(h) 是否发现范围外或白名单外改动；
(i) 本轮新发现的缺陷（含修复引入的回归），每条标明级别；
(j) 最后一句明确：是否建议 A9-33 在该提交上进入预演 11（构建预演包并上 Win7）。

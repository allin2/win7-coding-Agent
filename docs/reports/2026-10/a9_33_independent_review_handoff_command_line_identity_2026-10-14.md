# A9-33 独立审核交接包（命令行识别修复，第 14 轮，2026-10-14，绑定修复提交 ea597905…）

本包供 codex 对预演 10 暴露的驱动残留进程缺陷做第 14 轮复核；修复提交 `ea5979059f365ae3baf0b9a35caa8e586acedb4e`，相对第 13 轮复核的 `52bcfb8800f081d495305cc0b5386ad7e683961e`。
本轮的缺陷不是你发现的。执行代理在预演 11 的 R1（Win7 实机，只读检查，未启动任何套件）里发现：预演 10 遗留的孤儿进程在套件自己的进程表里 `ExecutablePath` 为空，按路径匹配的清扫看不见它。
你在第 12、13 轮把“表完整、形状对，但孤儿那一行的路径为空，清扫看不到这个进程”记为既有 `UNKNOWN`，并要求缺陷时单列。R1 的实机数据把它变成已证实的缺陷：开发机用真实表回放现有规则，选中 0 行。
这是预演 11 前的第 8 个驱动修复（第 7 个是 `52bcfb88…`）。预演 11 的包已构建、授权文件已生成，但未在 Win7 上执行 R2 及以后步骤；因为套件代码要变，那个包和授权文件作废，修复通过后重建。
负责人裁决（2026-10-14）：有 P0 或 P1 时执行代理直接修复、经 codex 复审，修复和预演均无需审批。
证据层级：修复本身是开发机；缺陷的事实来自“Win7 实机（预演前的只读检查，非验收证据）”。修复后的清扫在 Win7 上没有运行过，`NOT_PERFORMED`。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由执行代理登记。

处理规则：本轮若有 P0 或 P1，执行代理直接开下一个修复轮并送 codex 复审；若只剩 P2 及以下，登记已知限制，重建预演 11 包并上 Win7。请把每条发现的级别写准：不要为了让结论好看而降级，也不要为了凑数而升级。
本轮与 `api-key-prefix` 扫描器无关，不改、不复核。

## 0. 审核会话启动说明

审核者是负责人另开的新会话，不带执行代理的上下文，也不是实现方。
审核者只读本文件、第 1 节列出的提交和第 3 节列出的证据，不写原隔离树、主工作区和已有 `.acceptance`。
审核者在自己的空目录复算，向负责人报告。不联网、不下载、不启动 Electron、不访问 Win10 或 Win7、不提交、不推送。
第 3 节的重放脚本只读 `.acceptance` 里的文件，输出到终端，不写文件。

目录与磁盘纪律：

1. 所有命令先执行 `export TMPDIR="$PWD/tmp"`，使包测试的夹具落在复核根内。
2. 需要再克隆时用 `git clone --no-hardlinks`，不用 `cp -R`。
3. 写最终报告前清理自己根里的 `tmp` 夹具，使复核根占用小于 3 GB。

结论按 P0、P1、P2、信息分级。每条写 `文件:行`、依据和复现方式。没有发现时，写明检查了什么。
最后给出一句话：是否建议在该提交上进入预演 11（重建预演包并上 Win7）。

## 1. 对象与保护边界

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送 |
| 复核对象（代码） | `ea5979059f365ae3baf0b9a35caa8e586acedb4e`。上一个被你复核的代码提交 `52bcfb8800f081d495305cc0b5386ad7e683961e`（第 13 轮）。相对 `52bcfb88…` 本轮改 2 个文件：`release/win7-product-v3/a9-batch2-smoke.cjs` 和 `src/shell/tests/product/a9-batch2-contract.test.ts`，统计 `2 files changed, 363 insertions(+), 65 deletions(-)` |
| 运行测试用的检出 | 就是 `ea5979059f365ae3baf0b9a35caa8e586acedb4e`。本包是未提交文件，不在该提交的树里 |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 10448 insertions(+), 31 deletions(-)` |
| 保护边界 | 不得改动产品语义和旧取证组件。20 个路径之外的非 `docs/` 文件必须没有差异 |

必须从提交取得文件，不能拿工作区文档对照。

已知限制（不得再列为发现）：KL-1、KL-2（见 §6.13）；KL-3；KL-4；KL-5；KL-6a；KL-7 边界 a、b、c；KL-8（第 13 轮登记）。详见任务书 §6.24、§6.27、§6.33、§6.39～§6.41、§6.46。
你上几轮列为 `UNKNOWN` 的几项仍是 `UNKNOWN`，不作为本轮缺陷：孤儿占用是 `EBUSY` 的因果确证；`taskkill /T /F` 对树外后代的影响（对已存在的孤儿，`taskkill /PID 4736 /F` 已实测成功，见第 3 节，但那不是 `/T`）。
“Win7 的 `wmic` 对该孤儿返回完整 `ExecutablePath`”这一项已有答案：不返回，路径为空。它不再是 `UNKNOWN`。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q ea5979059f365ae3baf0b9a35caa8e586acedb4e
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

预期：`rev-parse` 输出 `ea5979059f365ae3baf0b9a35caa8e586acedb4e`。

第二步：核对范围。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 HEAD | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
wc -l < ../a9-33-changed-paths.txt
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 HEAD -- release scripts src
git -c core.fsmonitor=false diff --name-only 52bcfb8800f081d495305cc0b5386ad7e683961e HEAD -- release scripts src
git -c core.fsmonitor=false diff --shortstat 52bcfb8800f081d495305cc0b5386ad7e683961e HEAD -- release scripts src
```

预期：第一条输出 `20`，路径集合与 [§6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径逐一相同（由审核者自己对照）；统计为 `20 files changed, 10448 insertions(+), 31 deletions(-)`；第三条只列出 `release/win7-product-v3/a9-batch2-smoke.cjs` 与 `src/shell/tests/product/a9-batch2-contract.test.ts`；最后一条为 `2 files changed, 363 insertions(+), 65 deletions(-)`。

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

预期（执行代理在无沙箱环境实测）：`node --version` 为 `v20.17.0`；`node --test` 120 通过、0 失败；jest 235 个全部通过（合同文件 192、包运行时文件 43；其中 `driver runtime copy and the sweep` 组 17 个）；`docs:check` 在 `ea597905…` 为 `ok`，`checked_files` 为 `342`（本包提交后文件数会变）；`diff --check` 无输出；`status --short` 先执行 `git restore src/runner/dist` 再看应为 `0`。若你的沙箱禁止回环监听导致 jest 用例 `listen EPERM` 失败，逐个列出用例名，标 `UNKNOWN`（沙箱），不要与缺陷混写。你上一轮列出过 8 个这样的用例。

第四步：只跑本轮相关用例。

```sh
cd "$REVIEW_DIR/src/shell"
npx jest tests/product/a9-batch2-contract.test.ts -t "driver runtime copy and the sweep" 2>&1 | grep -E "✓|✕|Tests:"
```

预期：17 个 `✓`，`Tests: 175 skipped, 17 passed, 192 total`。沙箱禁止回环监听时，经 `runDriverPhase` 的那个用例会因 `listen EPERM` 失败，按 `UNKNOWN`（沙箱）处理。

## 3. Win7 R1 的事实（只读证据）

证据层级：Win7 实机（预演 11 的 R1，只读，非验收证据）。根目录 `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-11/r1/`（简称 R1）。目标主机 `dccs-chaizl-PC`，账户 `agent`，时间 2026-10-14T23:15:52Z～23:21:49Z。不要运行其中任何可执行文件。

| 事实 | 文件（简称相对 R1） | 内容 |
|---|---|---|
| 套件自己的表命令 | `suite-columns-raw.bin`（GB18030，SHA-256 前缀 `387f2aac…`） | `wmic process get ProcessId,ParentProcessId,Name,ExecutablePath,SessionId,CreationDate /format:csv` 的原始输出：10979 字节，102 行，每行逗号数一致，没有引号，行尾为 `CR CR LF`。严格读取器判为完整、可用 |
| 孤儿在该表里的那一行 | 同上 | `DCCS-CHAIZL-PC,20261015012412.958558+480,,electron.exe,4988,4736,2`：`ExecutablePath` 为空。会话 2 的其余 24 个进程路径都非空，所以 SSH 账户不是原因 |
| 孤儿的状态 | `orphan-state-utf8.txt`（`955ccd4d…`） | `ThreadCount=1`、`HandleCount=2`、`KernelModeTime=0`、`UserModeTime=0`、`WorkingSetSize=131072`、`ExecutablePath` 为空。与“进程已创建、初始线程从未运行”一致，成因 `UNKNOWN` |
| 孤儿的命令行 | `electron-list-raw.bin`（`92b2cc99…`） | `wmic process where "Name='electron.exe'" get ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine /format:list`：命令行为 `"C:\A9-W43\run\6c90a56e\evidence\driver-electron\electron.exe" --type=utility --utility-sub-type=network.mojom.NetworkService …`，父进程 4988 已不在 |
| list 格式的整体形状 | `all-list-raw.bin`（`ff329279…`） | 102 个块，每块恰好 5 个键，`CR CR LF` 行尾，值里的逗号与引号原样保留；最长命令行 4769 个字符；52 个命令行含引号；没有非 ASCII |
| 生产命令的真实输出 | `commands-list-raw.bin`（`6629d34a…`，终止孤儿之后取得） | `wmic process get ProcessId,CommandLine /format:list`：101 个块，每块恰好 2 个键，没有不合格的行 |
| 同一进程表的带命令行 CSV | `processes-output-utf8.txt`（`edf6b616…`） | CSV 格式下命令行里的逗号没有引号，行无法按列读：这是套件的表命令不含 `CommandLine` 列的原因，也是本轮改用 list 格式取命令行的原因 |
| 终止 | `kill-4736-utf8.txt`（`dd25c042…`） | 2026-10-14T23:19:23Z 负责人授权后执行 `taskkill /PID 4736 /F`，输出“成功: 已终止 PID 为 4736 的进程”；之后该 PID 与 `electron.exe` 均无实例 |

### 3.1 重放（开发机，只读）

重放脚本在 `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-11/replay-real-table.cjs`（旧规则）和 `replay-real-fix4.cjs`（新规则）。脚本把真实原始输出用 GB18030 解码后交给被测套件的函数。

```sh
cd /Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-11
export PATH=/Users/qlyf/.nvm/versions/node/v20.17.0/bin:$PATH
# 旧规则：只看 ExecutablePath。用 52bcfb88… 的套件，或本提交的套件（读取表的函数相同）
node replay-real-table.cjs "$REVIEW_DIR/release/win7-product-v3/a9-batch2-smoke.cjs" r1/suite-columns-raw.bin
# 新规则
node replay-real-fix4.cjs "$REVIEW_DIR/release/win7-product-v3/a9-batch2-smoke.cjs"
```

预期，旧规则：`intact true problem null rows 102`；`usableProcessListing true`；`rows selected by the sweep rule (ExecutablePath prefix): 0`；行 4736 的 `ExecutablePath` 为空。
预期，新规则：`failed false problem null rows 102 usable true`；`row 4736: command_line | C:\A9-W43\run\6c90a56e\evidence\driver-electron\electron.exe" --type=utility …`；`selected by the new rule: [ '4736' ]`；`sources: {"none":2,"command_line":2,"executable_path":98}`；`production command output now: intact true problem null rows 101`。
新规则的重放把“孤儿存在时取得的 5 列 list 输出”裁成 `ProcessId`、`CommandLine` 两列，再交给 `listProcesses`；生产命令本身的输出（孤儿已终止）单独由 `readWmicList` 读，所以最后一行是 101 个块。

## 3.2 与你上几轮发现的关系

本轮不处理你的 N1（进程表读取），其修复 `52bcfb88…` 你在第 13 轮已复核。本轮是在同一个读取函数 `listProcesses` 之上增加“路径为空时的身份来源”，对象是你第 12、13 轮登记的既有 `UNKNOWN`。

## 4. 本轮修复

`release/win7-product-v3/a9-batch2-smoke.cjs`：

1. 新增固定命令 `wmic_process_commands`：`wmic.exe process get ProcessId,CommandLine /format:list`（两列、list 格式、不加过滤，所以不涉及 `where` 的引号）。
2. `readWmicList(text, keys)`：按块读 list 输出。每个块一行一个 `Key=Value`，块之间是空白行；`=` 之后的部分原样作为值（逗号、引号、等号都保留）。非空白行如果不是“请求的键 `=` 值”，或块内重复一个键，该块 `damaged`；块缺任一请求的键，该块不完整。任一坏块使整张列表 `intact=false`，`problem` 为第一个坏块的 `block_<n>_line` 或 `block_<n>_keys`；输出为空或只有空白行为 `empty_output`。完整的块仍然返回。
3. `listCommandLines(exec)`：运行 `wmic_process_commands`，用 `readWmicList` 读，`ProcessId` 必须是数字（去空白后），否则 `process_id`；命令状态非零、有错误、输出被截断，或列表不完整，都是 `failed`。结果是 `ProcessId → CommandLine` 的映射。
4. `withImagePath(rows, commandLines)`：每行得到 `ImagePath` 和 `ImageSource`。`ExecutablePath` 非空：用它（`executable_path`）。为空：用命令行去掉一个开头引号后的字符串（`command_line`）；命令行也没有则 `ImagePath` 为空（`none`）。可读路径的行完全不看命令行。
5. `listProcesses(exec)`：表命令失败或表不完整的处理与 `52bcfb88…` 相同（表命令失败时不再查命令行）；表完整时再查命令行，命令行查询失败或不完整则整个列表 `failed=true`，`problem` 为 `command_lines_<原因>`。
6. 使用方：清扫（`findDriverStrays`）、环境检查（G0 的 `stale`）、链路后检（`finishChainEvidence` 的 `residue`）、p10 后检（`runPostflightPhase` 的 `residue`）都改为按 `ImagePath` 以小写前缀匹配。stray、residue、stale 记录新增 `image_source`；G0 的 `stale` 与 p10 的 `residue` 的 `path` 取 `ImagePath` 的前 260 个字符。
7. 其余（`copyRuntimeFile`、`sweepDriverStrays` 的轮数与等待、`attempted/removed/remaining/observed` 的语义、`usableProcessListing` 的规则、`runDriverPhase` 的失败类别）与 `52bcfb88…` 相同。

`src/shell/tests/product/a9-batch2-contract.test.ts`：顶层新增 `commandLineList` 和 `answers`，让假执行器同时回答表命令和命令行命令；既有 186 个用例里受影响的假执行器全部改为 `answers(...)`，没有放宽断言，stray、residue 的期望值里加了 `image_source`。`driver runtime copy and the sweep` 组新增 6 个用例（共 17 个）：

| 用例 | 内容 |
|---|---|
| 列表读取器 | 真实形状（`CR CR LF`、空命令行、含逗号引号等号的值）读得进；LF、CR LF、只有空格的分隔行同样读得进；16 种拒绝形态各自的 `problem` 与保留的完整块数 |
| 命令行查询失败 | 8 种（非零状态、error、截断、空输出、坏块、`ProcessId` 不是数字、无结果、抛异常）都使列表 `failed`，`problem` 带 `command_lines_` 前缀，表里的完整行仍返回，清扫不记 observed；表命令失败时不查命令行；`ProcessId` 前后有空白仍能对上 |
| 随机破坏命令行列表 | 8 个块的列表，8 种破坏各 40 次，外加输出在最后一个块内被截断 40 次：每次都 `failed` |
| 路径与命令行的取舍 | 可读路径的行以路径为准（命令行即使指向别处或指向 driver 目录也不改变结果）；空路径行以命令行为准（带引号、不带引号、大小写、带参数）；命令行只是提到、属于兄弟目录、deploy 目录或别的运行目录的不算；命令行为空的不算 |
| 清扫实例 | 孤儿只靠命令行识别：找到、杀、确认移除；杀不掉则 `remaining`；命令行查询一直失败则不记 observed |
| 使用方 | G0 把 driver 目录下的空路径进程记为 `stale`；p10 记 `PROCESS_RESIDUE` 与 `FAIL`；链路后检记 residue 与 `FAIL`；命令行查询失败时 G0 的列表为 failed、p10 为 `UNKNOWN` |

另在既有的 `runDriverPhase` 整合用例里加了一段：孤儿只靠命令行识别，`ui_interrupt` 被杀后清扫杀它并确认移除，阶段继续。

## 5. 重点复核点

1. 缺陷是否真正关闭。请至少构造 10 种新的孤儿或残留形态（不要只用本包列的），说明哪些仍被认作干净，并给出每种的级别理由。执行代理已知仍看不见的：路径为空且命令行也为空；命令行以 8.3 短路径、`\\?\` 前缀、相对路径、环境变量或正斜杠开头；命令行里 driver 路径之前有 `cmd /c` 之类的前缀。R1 里只有一个孤儿样本（命令行带引号、绝对路径、反斜杠），其余形态在真实 Win7 上 `UNKNOWN`。
2. list 读取器在真实 Win7 上是否会把完整输出误判为不完整。依据：R1 的 102 个块和 101 个块都完整；`spawnSync` 用 `utf8` 解码而 Win7 控制台是 GBK，含中文的命令行会被误解码，但路径前缀和键名都是 ASCII；某条命令行含换行会使该块 `damaged`（R1 里没有）。请评价这个取舍：误判方向是关闭（清扫不记 observed、G0 记 `UNKNOWN`），代价是预演失败而不是假 PASS。
3. 两次查询之间的间隔。表和命令行是两条命令；一个进程只出现在其中之一（刚创建或刚退出）时，它在这一轮没有 `ImagePath` 或根本没有行。清扫要求连续 2 个干净轮，每轮间隔 500 毫秒，G0、链路后检、p10 是一次性读取。请评价这个窗口，以及是否存在更细的竞争。
4. 使用方一致性。请核对四个读取处是否都已经用 `ImagePath`，有没有遗留的 `ExecutablePath` 比较（包括驱动 `a9-batch2-driver-entry.cjs` 里自己读 wmic 的地方，那里不属于本轮范围，请只判断它是否会让同一孤儿漏掉）。G0 的 `watchedRoots` 只有本次运行的候选目录和 driver 目录，所以旧运行遗留的孤儿不会被 G0 报告；这是否合适？
5. 证据字段变化：`image_source` 新增在 stray、residue、stale 记录里；`path` 可能是命令行的前 260 个字符。请核对：没有其他组件（报告器、校验器、清单）依赖旧字段形状；命令行内容进入证据是否带来机密风险（命令行是套件自己启动的 driver 与 Chromium 子进程的命令行，不含 API key；证据扫描仍会扫）。
6. 变异：第 6 节的 94 个变异，执行代理结果：92 个被拦、2 个等价（M03：去掉大小比较，结果仍是哈希比较，你上几轮已认可；L15：等号在行首与 `at > 0` 等价）。G08 在 `-t` 过滤下存活，整文件运行时被拦（对应用例在组外）。请你另试至少 4 个新的，重点是 list 读取器的边界和 `withImagePath` 的取舍。
7. `taskkill` 的效果。孤儿 4736 实测被 `taskkill /PID 4736 /F` 成功终止（不带 `/T`）；清扫用的 `killTree` 带 `/T`。请评价两者对“初始线程从未运行”的进程有没有区别，以及清扫在这种进程上的行为是否可以信赖。执行代理没有在 Win7 上对新孤儿测试过 `/T`，`UNKNOWN`。

## 6. 变异清单（执行代理用的）

在你自己的克隆里执行：把下面 `M=[...]` 的内容放进一个脚本，对 `release/win7-product-v3/a9-batch2-smoke.cjs` 逐个替换（每个 `old` 恰好出现一次），运行第 2 节第四步的命令，结果含 ` failed` 即被拦。每个变异后恢复文件并核对哈希。M26 对应你第 11 轮的 X02，M16 对应 X03。M27、N04、N10 已随多余代码或旧结构删除，编号保留空缺。`M05`、`M06` 的锚点相对第 13 轮包由 `ExecutablePath` 改为 `ImagePath`，`N16` 的锚点改在 `listProcesses` 里。

```python
M=[
 ('M01 never skip equal copy', u"same = target.isFile() && target.size === fs.statSync(from).size && sha256File(to) === sha256File(from);", u"same = false;"),
 ('M02 skip on equal size only', u"target.size === fs.statSync(from).size && sha256File(to) === sha256File(from);", u"target.size === fs.statSync(from).size;"),
 ('M03 skip on equal hash only (size dropped; equivalent)', u"target.isFile() && target.size === fs.statSync(from).size && sha256File(to)", u"target.isFile() && sha256File(to)"),
 ('M04 prefix without separator', u"const prefix = `${path.resolve(runtimeRoot).toLowerCase().replace(/[\\\\/]+$/, '')}${path.sep}`;", u"const prefix = `${path.resolve(runtimeRoot).toLowerCase().replace(/[\\\\/]+$/, '')}`;"),
 ('M05 path compare case-sensitive', u"String(row.ImagePath || '').toLowerCase().startsWith(prefix))\n    .map", u"String(row.ImagePath || '').startsWith(prefix))\n    .map"),
 ('M06 own pid not excluded', u"Number(row.ProcessId) !== process.pid && String(row.ImagePath", u"String(row.ExecutablePath"),
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
 ('N11 empty output is intact', u"if (lines.length === 0) return { rows: [], intact: false, problem: 'empty_output' };", u"if (lines.length === 0) return { rows: [], intact: true, problem: null };"),
 ('N12 process id need not be a number', u"&& DIGITS.test(String(row.ProcessId).trim()) && DIGITS.test(String(row.ParentProcessId).trim())", u"&& DIGITS.test(String(row.ParentProcessId).trim())"),
 ('N13 parent id need not be a number', u"&& DIGITS.test(String(row.ProcessId).trim()) && DIGITS.test(String(row.ParentProcessId).trim())", u"&& DIGITS.test(String(row.ProcessId).trim())"),
 ('N14 name may be empty', u" && String(row.Name).trim() !== '');", u");"),
 ('N15 shape needs only one row', u"const shaped = listing.rows.every(", u"const shaped = listing.rows.some("),
 ('N16 complete rows of a broken table dropped', u"  const rows = withImagePath(table.rows, commands.byPid);", u"  const rows = withImagePath(table.intact ? table.rows : [], commands.byPid);"),
 ('N17 row number off by one in the problem', u"problem = `row_${index + 2}_${cells ? 'cell_count' : 'quoting'}`;", u"problem = `row_${index + 1}_${cells ? 'cell_count' : 'quoting'}`;"),
 ('N18 problem never named', u"if (problem === null) problem = `row_${index + 2}_${cells ? 'cell_count' : 'quoting'}`;", u"if (problem === null) problem = '';"),
 ('N19 header junk allowed (header not parsed strictly)', u"const header = parseCsvLineStrict(lines[0]);\n  if (!header ||", u"const header = parseCsvLine(lines[0]);\n  if (!header ||"),
 ('N20 rows parsed leniently', u"    const cells = parseCsvLineStrict(line);\n    if (!cells || cells.length", u"    const cells = parseCsvLine(line);\n    if (!cells || cells.length"),
 ('N21 p10 ignores a failed listing', u"listing.failed || processes.length === 0 ? 'UNKNOWN'", u"processes.length === 0 ? 'UNKNOWN'"),
 ('N22 environment ignores a failed listing', u"processes_listing_failed: listing.failed,", u"processes_listing_failed: false,"),
 ('L01 empty list output is intact', u"  if (lines.every((line) => line.trim() === '')) return { rows: [], intact: false, problem: 'empty_output' };", u""),
 ('L02 a repeated property allowed', u"if (!keys.includes(key) || block.has(key)) { damaged = true; continue; }", u"if (!keys.includes(key)) { damaged = true; continue; }"),
 ('L03 an unrequested property allowed', u"if (!keys.includes(key) || block.has(key)) { damaged = true; continue; }", u"if (block.has(key)) { damaged = true; continue; }"),
 ('L04 damage ignored', u"if (!damaged && keys.every((key) => block.has(key))) rows.push(Object.fromEntries(block));\n    else if", u"if (keys.every((key) => block.has(key))) rows.push(Object.fromEntries(block));\n    else if"),
 ('L05 missing keys ignored', u"if (!damaged && keys.every((key) => block.has(key))) rows.push(Object.fromEntries(block));\n    else if (problem === null) problem = `block_${count}_${damaged ? 'line' : 'keys'}`;", u"if (!damaged) rows.push(Object.fromEntries(block));\n    else if (problem === null) problem = `block_${count}_${damaged ? 'line' : 'keys'}`;"),
 ('L06 problem always line', u"${damaged ? 'line' : 'keys'}`;\n    block = null;", u"line`;\n    block = null;"),
 ('L07 block number not counted', u"    count += 1;\n    if (!damaged", u"    if (!damaged"),
 ('L08 last problem wins', u"    else if (problem === null) problem = `block_${count}", u"    else problem = `block_${count}"),
 ('L09 damage persists to the next block', u"    block = null;\n    damaged = false;\n  };", u"    block = null;\n  };"),
 ('L10 block not reset', u"    block = null;\n    damaged = false;\n  };", u"    damaged = false;\n  };"),
 ('L11 last block never closed', u"  finish();\n  return { rows, intact: problem === null, problem };\n}\n\nconst DIGITS", u"  return { rows, intact: problem === null, problem };\n}\n\nconst DIGITS"),
 ('L12 carriage returns kept', u"String(text || '').split('\\n').map((line) => line.replace(/\\r/g, ''));", u"String(text || '').split('\\n');"),
 ('L13 blank means exactly empty', u"    if (line.trim() === '') { finish(); continue; }", u"    if (line === '') { finish(); continue; }"),
 ('L14 a line without equals read by its last character', u"const key = at > 0 ? line.slice(0, at) : '';", u"const key = line.slice(0, at);"),
 ('L15 equals at the line start allowed (equivalent expected)', u"const key = at > 0 ? line.slice(0, at) : '';", u"const key = at >= 0 ? line.slice(0, at) : '';"),
 ('C01 a process id need not be a number', u"if (DIGITS.test(row.ProcessId.trim())) byPid.set", u"if (true) byPid.set"),
 ('C02 process id not trimmed for the digit test', u"if (DIGITS.test(row.ProcessId.trim())) byPid.set", u"if (DIGITS.test(row.ProcessId)) byPid.set"),
 ('C03 process id not trimmed as key', u"byPid.set(row.ProcessId.trim(), row.CommandLine);", u"byPid.set(row.ProcessId, row.CommandLine);"),
 ('C04 command status ignored', u"  if (result.status !== 0 || result.error || result.truncated === true) {\n    return { byPid,", u"  if (result.error || result.truncated === true) {\n    return { byPid,"),
 ('C05 command error ignored', u"  if (result.status !== 0 || result.error || result.truncated === true) {\n    return { byPid,", u"  if (result.status !== 0 || result.truncated === true) {\n    return { byPid,"),
 ('C06 command truncation ignored', u"  if (result.status !== 0 || result.error || result.truncated === true) {\n    return { byPid,", u"  if (result.status !== 0 || result.error) {\n    return { byPid,"),
 ('C07 list problem ignored', u"  return { byPid, failed: problem !== null, problem };", u"  return { byPid, failed: false, problem };"),
 ('C08 no result tolerated', u"  if (!result) return { byPid: new Map(), failed: true, problem: 'no_result' };\n", u""),
 ('C09 a throwing query tolerated', u"catch (_error) { return { byPid: new Map(), failed: true, problem: 'exec_threw' }; }", u"catch (_error) { return { byPid: new Map(), failed: false, problem: 'exec_threw' }; }"),
 ('C10 truncation named as error', u"problem: result.truncated === true ? 'truncated' : result.error ? 'command_error' : 'exit_status' };\n  }\n  return { byPid", u"problem: result.error ? 'command_error' : 'exit_status' };\n  }\n  return { byPid"),
 ('W01 command line wins over a readable path', u"    if (executable !== '') return", u"    if (false) return"),
 ('W02 the leading quote kept', u"const command = String(commandLines.get(String(row.ProcessId).trim()) || '').replace(/^\"/, '');", u"const command = String(commandLines.get(String(row.ProcessId).trim()) || '');"),
 ('W03 an empty command line still counts as one', u"ImageSource: command === '' ? 'none' : 'command_line' };", u"ImageSource: 'command_line' };"),
 ('W04 a missing command line becomes text', u"String(commandLines.get(String(row.ProcessId).trim()) || '')", u"String(commandLines.get(String(row.ProcessId).trim()))"),
 ('P02 a broken table is not named', u"  if (!table.intact) return { rows, failed: true, problem: table.problem };\n", u""),
 ('P03 command-line failure ignored', u"  return { rows, failed: commands.failed, problem: commands.failed ? `command_lines_${commands.problem}` : null };", u"  return { rows, failed: false, problem: null };"),
 ('P04 failed table keeps asking for command lines', u"    return { rows: withImagePath(table.rows, new Map()), failed: true,", u"    void listCommandLines(exec);\n    return { rows: withImagePath(table.rows, new Map()), failed: true,"),
 ('P05 failed table rows without image', u"    return { rows: withImagePath(table.rows, new Map()), failed: true,", u"    return { rows: table.rows, failed: true,"),
 ('G01 G0 reads the path only', u"    const exe = String(row.ImagePath || '').toLowerCase();\n    const name", u"    const exe = String(row.ExecutablePath || '').toLowerCase();\n    const name"),
 ('G02 chain residue reads the path only', u"roots.some((root) => String(row.ImagePath || '').toLowerCase().startsWith(root))).map((row) => ({ pid: Number(row.ProcessId), name: row.Name, image_source", u"roots.some((root) => String(row.ExecutablePath || '').toLowerCase().startsWith(root))).map((row) => ({ pid: Number(row.ProcessId), name: row.Name, image_source"),
 ('G03 p10 residue reads the path only', u"roots.some((root) => String(row.ImagePath || '').toLowerCase().startsWith(root)))\n    .map", u"roots.some((root) => String(row.ExecutablePath || '').toLowerCase().startsWith(root)))\n    .map"),
 ('G04 stale record path cut at 259', u"path: String(row.ImagePath).slice(0, 260), image_source: row.ImageSource, session", u"path: String(row.ImagePath).slice(0, 259), image_source: row.ImageSource, session"),
 ('G05 p10 residue path cut at 259', u"path: String(row.ImagePath).slice(0, 260), image_source: row.ImageSource }));", u"path: String(row.ImagePath).slice(0, 259), image_source: row.ImageSource }));"),
 ('G06 stray record without source', u"name: String(row.Name || ''), image_source: row.ImageSource }));", u"name: String(row.Name || '') }));"),
 ('G07 chain residue without source', u"name: row.Name, image_source: row.ImageSource }));\n  writeJson(path.join(ctx.attemptDir, '06-postflight.json')", u"name: row.Name }));\n  writeJson(path.join(ctx.attemptDir, '06-postflight.json')"),
 ('G08 fixed command with a filter', u"args: ['process', 'get', 'ProcessId,CommandLine', '/format:list'] }", u"args: ['process', 'get', 'ProcessId,CommandLine', '/format:csv'] }"),
]
```

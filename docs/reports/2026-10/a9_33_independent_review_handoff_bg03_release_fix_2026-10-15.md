# A9-33 独立审核交接包（B2-BG-03 修复，第 16 轮，2026-10-15，绑定修复提交 fe0cc135…）

本包供 codex 对 §6.55 的 P1 修复做第 16 轮复核；复核对象代码提交 `fe0cc1355ccdbff5bcd478fb0d0147364bf1ec12`，相对上一个被复核的代码提交 `a6c689d5b59d10b2de9253f9f134940977b11974`（冻结候选 WIN7-43 `63c6d426…` 的代码与它相同）。
背景：WIN7-43 的正式运行在 Win7 实机 10 个阶段全 PASS，但你在第三阶段复核（第 20 次调用）指出 `B2-BG-03-STOP-RELEASE-EXIT-A01` 的 PASS 没有覆盖“ready 失败清理”和“release 结束 ownership”。执行代理独立核对属实。负责人 2026-10-15 选 A′（修复后重走）：在 §6.1 的 20 个路径内修复，不改产品代码；新候选身份重新预演、冻结、签关口 A、正式运行、独立复核。旧候选 `63c6d426…` 的证据原样保留，不作为 Alpha 2 依据。
负责人裁决（2026-10-14）：冻结前有 P0 或 P1 时执行代理直接修复、经 codex 复审；修复和预演无需审批。
证据层级：本包所有结论都是开发机（macOS，Node 20.17.0）。修复后的驱动与套件在 Win10 验收机和 Win7 实机上没有运行过，`NOT_PERFORMED`。Win7 行为见第 7 节的 `UNKNOWN` 表。
本包是事实陈述和复核请求，不是批准。复核结论由执行代理登记。

处理规则：本轮若有 P0 或 P1，执行代理直接开下一个修复轮并送 codex 复审；若只剩 P2 及以下，登记已知限制，重建候选 WIN7-45 并上 Win7 预演。请把每条发现的级别写准：不要为了让结论好看而降级，也不要为了凑数而升级。
本轮与 `api-key-prefix` 扫描器无关，不改、不复核。

## 0. 审核会话启动说明

审核者是负责人另开的新会话，不带执行代理的上下文，也不是实现方。
审核者只读本文件、第 1 节列出的提交和第 3 节列出的证据，不写原隔离树、主工作区和已有 `.acceptance`。
审核者在自己的空目录复算，向负责人报告。不联网、不下载、不启动 Electron、不访问 Win10 或 Win7、不提交、不推送。
第 3 节的读取脚本只读 `.acceptance` 里的文件，输出到终端，不写文件。

目录与磁盘纪律：

1. 所有命令先执行 `export TMPDIR="$PWD/tmp"`，使包测试的夹具落在复核根内。
2. 需要再克隆时用 `git clone --no-hardlinks`，不用 `cp -R`。
3. 写最终报告前清理自己根里的 `tmp` 夹具，使复核根占用小于 3 GB。

结论按 P0、P1、P2、信息分级。每条写 `文件:行`、依据和复现方式。没有发现时，写明检查了什么。
最后给出一句话：是否建议在该提交上重建候选 WIN7-45 并进入 Win7 预演。

## 1. 对象与保护边界

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送 |
| 复核对象（代码） | `fe0cc1355ccdbff5bcd478fb0d0147364bf1ec12`。上一个被你复核的代码提交 `a6c689d5b59d10b2de9253f9f134940977b11974`。相对 `a6c689d5…` 本轮改 16 个文件：`release/win7-product-v3` 下 10 个、`scripts/release` 下 3 个、`src/shell` 下 3 个（见第 4 节）。其中 `6c8b7eae…` 是修复，`60cbe430…`、`310c4153…`、`fe0cc135…` 三个提交只补测试和把对话框事实抽成纯函数 `exitDialogFacts` |
| 运行测试用的检出 | 就是 `fe0cc1355ccdbff5bcd478fb0d0147364bf1ec12`。本包是之后提交的文档，不在该提交的树里 |
| 累计范围 | 相对 `7e96f561d3ac51e832a56928118209e604d7f2a0`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 11201 insertions(+), 31 deletions(-)` |
| 保护边界 | 不得改动产品语义和旧取证组件。20 个路径之外的非 `docs/` 文件必须没有差异 |

必须从提交取得文件，不能拿工作区文档对照。

已知限制（不得再列为发现）：KL-1、KL-2（见 §6.13）；KL-3；KL-4；KL-5；KL-6a；KL-7 边界 a、b、c；KL-8（第 13 轮登记）；KL-9（第 14 轮登记）；KL-10、KL-11；本轮新增 KL-12（见第 4 节）。详见任务书 §6.24、§6.27、§6.33、§6.39～§6.41、§6.46、§6.48、§6.57。
你在上一轮列为信息的几项仍是 `UNKNOWN` 或信息，不作为本轮缺陷，除非本轮的修复改变了它们：成因表述过度（`EBUSY` 的因果）、两条查询只按 PID 拼接、`taskkill /T` 在孤儿上的效果。

候选号说明：重走的候选编号定为 WIN7-45，不用 WIN7-44，因为 [A9_ALPHA2_GAP_DISPOSITION.md](../../plans/A9_ALPHA2_GAP_DISPOSITION.md) 的 Q1 选项 B 已把 WIN7-44 暂定给 R 类候选。重命名的范围见第 4 节“候选号”一行；引用旧候选历史的注释保持 WIN7-43。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q fe0cc1355ccdbff5bcd478fb0d0147364bf1ec12
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

预期：`rev-parse` 输出 `fe0cc1355ccdbff5bcd478fb0d0147364bf1ec12`。

第二步：核对范围。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 HEAD | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
wc -l < ../a9-33-changed-paths.txt
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 HEAD -- release scripts src
git -c core.fsmonitor=false diff --name-only a6c689d5b59d10b2de9253f9f134940977b11974 HEAD -- release scripts src
git -c core.fsmonitor=false diff --shortstat a6c689d5b59d10b2de9253f9f134940977b11974 HEAD -- release scripts src
```

预期：第一条输出 `20`，路径集合与 [§6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径逐一相同（由审核者自己对照）；统计为 `20 files changed, 11201 insertions(+), 31 deletions(-)`；第三条列出 16 个路径；最后一条为 `16 files changed, 680 insertions(+), 76 deletions(-)`。

第三步：开发机检查。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
export PATH=/Users/qlyf/.nvm/versions/node/v20.17.0/bin:$PATH NPM_CONFIG_OFFLINE=true
node --version
npm run verify:quick
git -c core.fsmonitor=false restore src/runner/dist
node --test scripts/release/test/a9-batch2-package.test.mjs scripts/release/test/a9-package.test.mjs
npm test --workspace=@win7-agent/shell -- --runInBand --forceExit --runTestsByPath tests/product/a9-batch2-contract.test.ts tests/product/a9-package-runtime.test.ts
npm run docs:check
git -c core.fsmonitor=false -c core.whitespace=cr-at-eol diff --check
git -c core.fsmonitor=false status --short | wc -l
```

预期（执行代理在无沙箱环境实测）：`node --version` 为 `v20.17.0`；`node --test` 120 通过、0 失败；jest 262 个全部通过（合同文件 219、包运行时文件 43）；`docs:check` 为 `ok`，`checked_files` 随本包提交后的文件数而定；`diff --check` 无输出（`.cmd` 文件是 CRLF，所以加 `core.whitespace=cr-at-eol`）；`status --short` 先执行 `git restore src/runner/dist`，输出 0。沙箱禁止回环监听时，部分用例会因 `EPERM` 失败，你此前几轮已列出这些用例，不作为发现。

第四步：只跑本轮相关用例。

```sh
cd "$REVIEW_DIR/src/shell"
npx jest --forceExit tests/product/a9-batch2-contract.test.ts -t "BG-03 \(WIN7-45\)|release exit|scripted Provider scenarios|driver plans cover" 2>&1 | grep -E "✓|✕|Tests:"
```

预期：全部 `✓`，没有 `✕`。

## 3. 缺口的事实（证据）

证据层级：Win7 实机（WIN7-43 正式运行，run `7af65f2d-770c-484b-bd40-7861935ed86f`，目标 `dccs-chaizl-PC`，账户 `agent`）。你的第三阶段报告是 `.acceptance/a9-33-review/codex-stage3-formal-20261015/codex_final_report.md`（`fad8d9f6…`），执行代理的核对见任务书 [§6.55](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#655-codex-第三阶段复核与-bg-03-缺口2026-10-15)。

| 事实 | 位置 | 内容 |
|---|---|---|
| 旧驱动的判据 | 提交 `a6c689d5…` 的 `src/shell/tests/product/a9-batch2-driver-entry.cjs`，`sessionBg` 的 BG-03 段 | 判据是 `stopsOk && afterStopClean && startFail.length === 1 && residue.length === 0`。`startFail.length === 1` 只数 `start_process` 的 tool_end 条数，不看这次启动是否失败 |
| 旧场景 | 提交 `a6c689d5…` 的夹具 `b2:bg-ready-fail` | 命令是 `exit 9`。产品把它当成功启动，句柄随后自然结束为 `exited` |
| 正式运行的实际结果 | 主工作区 `.acceptance/runs/A9-33-W43/7af65f2d-…/win7-retrieved/r7/evidence/requests/05-p05-session-bg/bg03-stop-release.json` | `ready_fail[0].result_status` 是 `background_started`、`failed` 为 `false`；最后一个事实是 `exited`、`cleanup_required=false`、`ownership=owned`。这条 PASS 既没有失败启动，也没有 release |
| 旧合同的断言文字 | 旧夹具 `B2-BG-03` | 写着 ready 失败与 release，但没有任何判据读取 `release_intent`/`released`，也没有点击“留给系统后退出” |

执行代理的说明：`start_process` 的就绪失败（D-013，helper 不能证明就绪）在产品里会让 `invocation.ready` 被拒绝，抛出 `A9_BACKGROUND_HELPER_START_FAILED`，句柄为 `failed`。从产品外部无法制造这个失败，所以不能把它变成 Win7 断言，登记为 KL-12。release 路径是 `dispose({stopManaged:false})` 写入 `release_intent`，helper 回 `execution_released` 后写入 `released`，句柄 `ownershipState='released'`，快照里 `lastProbeStatus` 显示为 `released`（`a9-agent-runtime.js:1026`）。

### 3.1 读取（开发机，只读）

```sh
cd /Users/qlyf/Developer/win7-coding-Agent/.acceptance/runs/A9-33-W43/7af65f2d-770c-484b-bd40-7861935ed86f/win7-retrieved/r7/evidence/requests/05-p05-session-bg
python3 -I - <<'EOF'
import json
d = json.load(open('bg03-stop-release.json'))
r = d['ready_fail'][0]
print(r['result_status'], r['failed'])
print([(f['status'], f['cleanup_required'], f['ownership']) for f in d['all_facts_after_fail']][-1])
EOF
```

预期：第一行 `background_started False`；第二行 `('exited', False, 'owned')`。

## 4. 本轮修复

提交 `6c8b7eae…` 改 16 个文件；后三个提交（`60cbe430…`、`310c4153…`、`fe0cc135…`）只改驱动文件里的 `exitDialogFacts` 和合同测试，用于杀死变异清单中先存活的 5 项。全部在 §6.1 的 20 个路径内，没有产品代码。

| 层 | 文件 | 改动 |
|---|---|---|
| 夹具 | `release/win7-product-v3/a9-batch2-fixtures.cjs` | `B2-BG-03` 拆成两条断言、5 个证据文件：`bg03-stop-release.json`、`release-exit-before.json`、`release-dialog-response.json`、`release-ownership-events.json`、`release-held-exit.json`。场景 `b2:bg-ready-fail` 改名 `b2:bg-fast-exit`；新增 `b2:bg-badcwd`（`start_process` 的 `cwd` 为 `b2-no-such-directory`）与 `b2:bg-release`；新增命令 `released-hold`（PowerShell 与 cmd 各一，最长 `FIXTURE_BOUNDS.release_hold_seconds` = 300 秒后自行结束）。新增 KL-12。断言总数 42 变 43，用例数 25 不变，证据文件 51 变 55 |
| 驱动 | `src/shell/tests/product/a9-batch2-driver-entry.cjs` | 新纯函数 `classifyFailedStart`、`evaluateBg03Facts`、`evaluateReleaseSequence`、`exitDialogFacts`（导出）。`sessionBg` 的 BG-03 段改为三个子判据：双 Stop；快速退出（`start_process` 未失败、新句柄恰好 1 个且 `lastProbeStatus==='exited'`、无需清理、稳定后零残留）；失败启动（路径记为 `refused`/`helper_start_failed`/`started`，只判新句柄终态与零残留；`started` 表示没有制造出失败，结论为 `UNKNOWN`）。新模式 `release_exit`：启动 `b2:bg-release`，退出前写 `release-exit-before.json`（进程树、命令树、句柄），对话框返回写 `release-dialog-response.json`，`will-quit` 时读 SQLite `managed_process_ownership` 事件写 `release-ownership-events.json`；该模式自己不记录断言 |
| 套件 | `release/win7-product-v3/a9-batch2-smoke.cjs` | `DRIVER_MODES.release_exit = { timeoutMs: 300000, dialogButton: 1 }`；`DRIVER_PLANS['p05-session-bg']` 增加第三个模式；每次带对话框的模式启动前删除旧的 `dialog-shown.marker`。新函数 `finishReleaseEvidence` 在 p05 的驱动循环之后判 `B2-BG-03-STOP-RELEASE-EXIT-A02`：退出码 0 且未被终止与点击状态 0、对话框按钮名与返回序号 1、归属事件顺序 owned→release_intent→released 且释放号相同、被释放的命令在退出后仍存活（进程号加创建时间）、候选与 `driver-electron` 目录下无产品进程（最多等 10 秒，每个样本保留）、套件按身份终止被释放的命令并连续两轮观察不存在。终止用新函数 `killProcess`（`taskkill /PID <n> /F`，不带 `/T`），不终止本进程和其父进程。三值判定：任何 `false` 为 `FAIL`，否则任何 `null` 为 `UNKNOWN`，否则 `PASS` |
| 测试 | `src/shell/tests/product/a9-batch2-contract.test.ts` | 新增驱动判据、归属序列、套件释放判定、p05 端到端模拟、场景与计划表的用例；计数与引用同步（25 用例、43 断言、55 证据文件） |
| 包测试与构建 | `scripts/release/build-a9-product-v3.mjs`、`scripts/release/test/a9-batch2-package.test.mjs`、`scripts/release/test/a9-package.test.mjs`、`src/shell/tests/product/a9-package-runtime.test.ts` | 候选号与计数同步 |
| 说明与锁 | `A9_BATCH2_WIN7_VALIDATION.md`、`README.md`、`a9-batch2-input-lock.json`、`RUN_A9_BATCH2_INTEGRITY.cmd` 及四个套件文件头 | 新增“退出时留给系统”一节与 KL-12；候选号 WIN7-43 改为 WIN7-45；`.cmd` 保持 CRLF |
| 候选号 | 上述文件 | WIN7-43 改为 WIN7-45：夹具合同、构建 Profile、输入锁（`candidate`、`gates.win7`、说明文字）、驱动身份检查、包内说明、测试断言。仍以 WIN7-44 作为“另一个候选”的负对照（`a9-batch2-package.test.mjs`、`a9-package-runtime.test.ts`） |

任务书记录见 [§6.57](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#657-bg-03-修复在开发机落地与候选号改为-win7-45)。

## 5. 重点复核点

1. **P1 是否真关闭。** 新 A01 与 A02 是否让“快速退出”“失败启动”“release”各自有独立判据，且不会被一个更弱的事实顶替。快速退出的 `exit 9` 在产品里是 `exited`（`background-process-manager.ts:442`，非零退出码不是 `failed`）；若 Win7 上 helper 对非零退出给出别的终态，A01 会 `FAIL`，请判断这是否合理。
2. **`evaluateBg03Facts` 的三值逻辑。** `started` 路径恒为 `UNKNOWN`，其余路径要求新句柄终态与零残留。`badTerminal` 与 `badResidue` 是否有遗漏的输入组合；`newFacts` 的计算依赖 `knownHandles`（`settleResidue` 里先算再并入），是否可能把旧句柄当新句柄或反过来。
3. **`finishReleaseEvidence` 的身份与杀进程。** 杀进程对象只来自驱动在退出前记录的命令树（`newProcesses(baselineTree, tree)` 去掉 `electron|conhost|spike02_helper`）。请判断：这个集合是否可能含非被释放命令的进程；`taskkill /PID` 对已变成孤儿的进程是否可靠；PID 在“列表→杀进程”之间被复用的窗口（毫秒级，未再复核）；`liveDescendants` 用 `CreationDate` 的文本比较是否在同机同偏移下成立。
4. **产品残留的边界。** 残留只按候选根与 `driver-electron` 根前缀判断。helper 在 release 后若仍在运行，会被计为残留并 `FAIL`；这是否是想要的判定。被释放命令的映像在系统目录，不会被计为产品残留；若命令借用候选目录里的可执行文件，会被计入，请判断是否可能。
5. **三值判定的真实性。** `aliveOk` 在树已观察且列表可用但无存活时为 `false`，其余未观察为 `null`；`residueOk` 在列表不可用且没看到残留时为 `null`；`cleanupOk` 在清理未被观察到干净且无剩余可见时为 `null`。请找一个会产生假 `PASS` 的输入。
6. **驱动 `release_exit` 的正确性（Electron 专用，开发机不能运行）。** `will-quit` 里的 SQLite 读取是否赶在产品关闭数据库之前或之后都能读到；`onDialogReturned` 里写结果文件与 90 秒后备定时器；`ownsExit = true` 与 `finish` 的相互作用；`app.exit(1)` 的几条失败路径。请读源码判断，不要求运行。
7. **p05 总时长与计划任务。** 新模式增加一次启动、一次退出、一次清理；最长 300 秒的后备时限与 `timeoutMs: 300000` 的关系；p05 作为一个请求的有效期 900 秒是否仍然够。
8. **候选号重命名是否漏改或误改。** 搜索 `WIN7-43`、`WIN7_43` 在 20 个路径里的剩余出现，应只剩历史引用与旧候选的其他套件文件（`a9-win7-4*`、`A9_2*` 等，不属于本批）。
9. **测试质量。** 变异清单见第 6 节；请再自选变异，尤其是 `finishReleaseEvidence` 的三值分支。p05 端到端模拟（`the p05 phase runs the three modes…`）是否把真实结构绑牢；`sessionBg` 的新流程只有源码级断言，没有行为测试（Electron 专用），请判断缺口是否可接受。

## 6. 变异清单（执行代理用的）

方法：脚本 `mutate_bg03.py` 逐个替换一处代码，只跑合同测试文件，有失败即“被拦”；运行后恢复原文件并核对。基线 218 个通过（第一轮），补用例后 219 个通过。第一轮 43 项中 4 项存活（D05、D06、D09、D13），补用例并新增 5 项（D19～D23）后又有 D22 先存活；全部补用例后重跑，48 项都被拦。

| 编号 | 变异 | 结果 |
|---|---|---|
| D01 | 快速退出：不要求句柄为 exited | 被拦 |
| D02 | 快速退出：忽略清理标志 | 被拦 |
| D03 | 快速退出：忽略残留 | 被拦 |
| D04 | 失败启动：started 路径也算 PASS | 被拦 |
| D05 | 失败启动：忽略残留 | 先存活；补用例后被拦 |
| D06 | 失败启动：忽略清理标志 | 先存活；补用例后被拦 |
| D07 | 路径：从不识别 helper 启动失败 | 被拦 |
| D08 | 双 Stop：不要求两次 Stop | 被拦 |
| D09 | 双 Stop：忽略第一次 Stop 失败 | 先存活；补用例后被拦 |
| D10 | release：忽略释放号相等 | 被拦 |
| D11 | release：忽略顺序 | 被拦 |
| D12 | release：把其他句柄的事件算进来 | 被拦 |
| D13 | release：不比较对话框按钮名 | 先存活；补用例后被拦 |
| D14 | release：退出前记录文件改名 | 被拦 |
| D15 | 模式表缺 release_exit | 被拦 |
| D16 | BG-03 第 1 条恒 PASS | 被拦 |
| D17 | 失败启动探针用了快速退出场景 | 被拦 |
| D18 | release：事件里丢掉释放号 | 被拦 |
| S01 | release_exit 点第一个按钮 | 被拦 |
| S02 | p05 缺 release_exit | 被拦 |
| S03 | 旧标记文件保留 | 被拦 |
| S04 | release：忽略退出码 | 被拦 |
| S05 | release：忽略终止原因 | 被拦 |
| S06 | release：忽略点击状态 | 被拦 |
| S07 | release：序号不要求恰为 1 | 被拦 |
| S08 | release：忽略对话框超时 | 被拦 |
| S09 | release：不要求命令存活 | 被拦 |
| S10 | release：树未观察时判 FAIL 而非 UNKNOWN | 被拦 |
| S11 | release：忽略产品残留 | 被拦 |
| S12 | release：不查 driver-electron 目录 | 被拦 |
| S13 | release：不等待进程关闭 | 被拦 |
| S14 | release：不要求清理成功 | 被拦 |
| S15 | 清理：可能杀本进程 | 被拦 |
| S16 | 后代：保留陈旧子进程 | 被拦 |
| S17 | killProcess 带 /T | 被拦 |
| S18 | 身份：忽略创建时间 | 被拦 |
| S19 | 状态：UNKNOWN 优先于 FAIL | 被拦 |
| S20 | release：忽略树查询失败 | 被拦 |
| S21 | release：忽略归属序列 | 被拦 |
| S22 | p05 从不判 A02 | 被拦 |
| F01 | 持有上限改为 3000 秒 | 被拦 |
| F02 | badcwd 场景改名 | 被拦 |
| F03 | badcwd 场景不带 cwd | 被拦 |
| D19 | release：返回序号固定为 1 | 被拦 |
| D20 | release：绕过对话框事实函数 | 被拦 |
| D21 | 失败启动：不判新句柄 | 被拦 |
| D22 | 快速退出：失败启动也算 | 先存活；补用例后被拦 |
| D23 | 快速退出：不要求新句柄 | 被拦 |

## 7. 未在 Win7 验证的事实（`UNKNOWN`，首次预演决定）

| 项 | 说明 |
|---|---|
| 被释放的命令在 Win7 上是否存活 | A9-31 的 Win7 签字为空。不存活时 A02 为 `FAIL`，这是产品发现 |
| release 后 helper 是否继续存活 | 若仍在候选目录下运行，A02 为 `FAIL`，这是发现，不是套件缺陷 |
| 不存在的工作目录走哪条路径 | 三种路径都被记录。若稳定为 `started`，A01 长期 `UNKNOWN`，须改用别的制造方式或登记限制 |
| p05 总时长与计划任务时限的余量 | `UNKNOWN` |
| 套件终止被释放的命令是否属 R1～R8 闭集 | 终止发生在计划任务内，对象只限驱动在退出前记录过身份的进程，与现有杂散进程清扫同类 |
| 驱动在记录身份前出错 | 被释放的命令得不到身份记录，套件不会终止它；它在 300 秒后自行结束 |
| `sessionBg` 新流程的运行时行为 | 开发机只有源码级断言与纯函数测试；Electron 里的实际流程 `NOT_PERFORMED` |

本包不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。KL-3、KL-5、KL-6a 与 KL-7（含边界 a、b、c）仍有效，任何 Alpha 2 结论必须带上它们。未在 Win7 验收通过。

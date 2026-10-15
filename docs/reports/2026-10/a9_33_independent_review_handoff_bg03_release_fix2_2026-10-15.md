# A9-33 独立审核交接包（B2-BG-03 修复第二轮，第 17 轮，2026-10-15，绑定修复提交 3d152545…）

本包供 codex 对第 16 轮发现的两个 P1 和三个 P2 的修复做第 17 轮复核；复核对象代码提交 `3d152545772e07efd54e0d4e06d6982a532c0abb`，上一个被你复核的代码提交是 `fe0cc1355ccdbff5bcd478fb0d0147364bf1ec12`（第 16 轮）。
背景和命令与第 16 轮交接包 [a9_33_independent_review_handoff_bg03_release_fix_2026-10-15.md](a9_33_independent_review_handoff_bg03_release_fix_2026-10-15.md) 相同；该包第 0 节的审核者纪律、第 1 节的保护边界与已知限制在本轮同样适用，本包只写差异。
你在第 16 轮报告（0 个 P0、2 个 P1、3 个 P2，不建议进入 Win7 预演）指出：清理丢失已观察到的子进程（P1-R1）；A02 的“存活”可由其他进程顶替句柄自己的进程（P1-R2）；`releaseStatus` 接受 `undefined`（P2-N1）；A01 把缺失事实和未识别状态当作干净终态（P2-N2）；残留未知与清理未知两个分支缺回归保护（P2-N3）。执行代理逐条核对属实，并在修复前的代码上用新测试复现（见第 3 节）。
证据层级：本包所有结论都是开发机（macOS，Node 20.17.0）。修复后的驱动与套件在 Win10 验收机和 Win7 实机上没有运行过，`NOT_PERFORMED`。Win7 行为见第 7 节的 `UNKNOWN` 表。
负责人裁决（2026-10-14）：冻结前有 P0 或 P1 时执行代理直接修复、经 codex 复审；修复和预演无需审批。本包是事实陈述和复核请求，不是批准；复核结论由执行代理登记。
处理规则：本轮若有 P0 或 P1，执行代理直接开下一个修复轮并送 codex 复审；若只剩 P2 及以下，登记已知限制，重建候选 WIN7-45 并上 Win7 预演。请把每条发现的级别写准：不要为了让结论好看而降级，也不要为了凑数而升级。
本轮与 `api-key-prefix` 扫描器无关，不改、不复核。

## 1. 对象与保护边界

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送 |
| 复核对象（代码） | `3d152545772e07efd54e0d4e06d6982a532c0abb`，父提交是文档提交 `db665710…`。相对 `fe0cc135…` 改 5 个文件：`release/win7-product-v3` 下 3 个（`A9_BATCH2_WIN7_VALIDATION.md`、`a9-batch2-fixtures.cjs`、`a9-batch2-smoke.cjs`）、`src/shell/tests/product` 下 2 个（`a9-batch2-contract.test.ts`、`a9-batch2-driver-entry.cjs`），统计 `5 files changed, 243 insertions(+), 43 deletions(-)` |
| 累计范围 | 相对 `7e96f561d3ac51e832a56928118209e604d7f2a0`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 11401 insertions(+), 31 deletions(-)`。相对 `a6c689d5…`（第 15 轮前复核过的提交）为 `16 files changed, 880 insertions(+), 76 deletions(-)` |
| 运行测试用的检出 | 就是 `3d152545772e07efd54e0d4e06d6982a532c0abb`。本包与任务书 §6.59 是之后提交的文档，不在该提交的树里 |
| 保护边界 | 不得改动产品语义和旧取证组件。20 个路径之外的非 `docs/` 文件必须没有差异 |

已知限制（不得再列为发现）：KL-1、KL-2；KL-3；KL-4；KL-5；KL-6a；KL-7 边界 a、b、c；KL-8；KL-9；KL-10；KL-11；KL-12。你在第 16 轮列为信息的几项仍是信息：第 14 项（`CreationDate` 文本比较在不同偏移下的可达性，属 KL-10 范围）、第 12 项（映像路径不可见的行，观察边界）、第 10、11 项（纯函数不核对句柄、当前调用者累计 `knownHandles`）。

## 2. 可复现命令与预期

命令与第 16 轮交接包第 2 节相同，只把提交号换成 `3d152545772e07efd54e0d4e06d6982a532c0abb`。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q 3d152545772e07efd54e0d4e06d6982a532c0abb
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

预期：`rev-parse` 输出 `3d152545772e07efd54e0d4e06d6982a532c0abb`。

第二步：核对范围。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 HEAD | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
wc -l < ../a9-33-changed-paths.txt
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 HEAD -- release scripts src
git -c core.fsmonitor=false diff --name-only fe0cc1355ccdbff5bcd478fb0d0147364bf1ec12 HEAD -- release scripts src
git -c core.fsmonitor=false diff --shortstat fe0cc1355ccdbff5bcd478fb0d0147364bf1ec12 HEAD -- release scripts src
```

预期：第一条输出 `20`，路径集合与 §6.1 的 20 个路径逐一相同；第二条 `20 files changed, 11401 insertions(+), 31 deletions(-)`；第三条列出上述 5 个路径；最后一条 `5 files changed, 243 insertions(+), 43 deletions(-)`。

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

预期（执行代理在无沙箱环境实测）：`node --version` 为 `v20.17.0`；`node --test` 120 通过、0 失败；jest 268 个全部通过（合同文件 225、包运行时文件 43）；`docs:check` 为 `ok`；`diff --check` 无输出；`status --short` 在 `git restore src/runner/dist` 后输出 0。沙箱禁止回环监听时，你第 16 轮列出的 9 个用例会因 `EPERM` 失败，不作为发现。

第四步：只跑本轮相关用例。

```sh
cd "$REVIEW_DIR/src/shell"
npx jest --forceExit tests/product/a9-batch2-contract.test.ts -t "BG-03 \(WIN7-45\)|release exit|scripted Provider scenarios|driver plans cover" 2>&1 | grep -E "✓|✕|Tests:"
```

预期：全部 `✓`，没有 `✕`；新增的 5 个 `codex round 16` 用例在其中。

## 3. 第 16 轮发现与执行代理的核对

核对方法：把 `fe0cc135…` 的驱动与套件放回工作区，运行本轮新增的用例；6 个用例失败（P1 清理、P1 身份、P2 状态、P2 路径边界、驱动的 A01 输入、A01 边界），恢复修复后全部通过。P2-N3 的两个用例在旧代码上也通过，因为旧分支本来正确，它们是回归保护，见第 6 节 G11、G12。

| 发现 | 执行代理核对 | 修复 | 新增用例 |
|---|---|---|---|
| P1-R1 清理丢失已观察到的子进程 | 属实。`removeReleasedCommand` 每轮从原始记录里取仍存活的根，再找后代；后代只进 `attempted`，根消失后下一轮不再是目标，两轮后报告清理成功 | 引入跨轮的追踪集合 `tracked`（键为进程号加创建时间）：初始为驱动记录的带创建时间的条目；每轮对存活的追踪实例找后代并加入集合；目标是集合内按身份仍存活的全部实例。无创建时间的实例记入 `unidentified`，既不终止也不算已消失，清理结论为 `UNKNOWN` | `P1 (cleanup)`：子进程在父进程被终止后仍在，清理必须继续终止并计入 `remaining`；子进程随终止消失则通过；孙进程同理 |
| P1-R2 A02 未闭合句柄到命令实例的身份链 | 属实，四种输入都得到 PASS：树查询失败时仍有条目存活；句柄进程号不在记录的树里；命令根已消失而后代存活；前后创建时间均为空 | `aliveByIdentity` 要求创建时间非空；A02 要求“句柄自己的进程”存活：`handle.pid` 在驱动记录的命令树里且带创建时间、`handle_pid_in_command_tree === true`、`wmic_failures === 0`，三者缺一为 `UNKNOWN`；根已消失且列表可用为 `FAIL`，后代存活不能代替；证据文件新增 `released_root`、`root_identified`、`root_alive_after_exit` | `P1 (identity)`：失败查询、外来进程号、无句柄、标志缺失、根消失后代存活、空创建时间各一例；对照例仍为 `PASS` |
| P2-N1 `releaseStatus` 接受 `undefined` | 属实：`releaseStatus([true, undefined])` 得到 `PASS` | 只有全部严格为 `true` 才是 `PASS`；`false` 为 `FAIL`；其余（含空数组、非数组、`undefined`、字符串）为 `UNKNOWN`；`sequence.ok` 不是布尔值时按未观察 | `P2 (status)`：八个组合与缺 `ok` 的归属记录 |
| P2-N2 A01 把缺失事实和未识别状态当作干净终态 | 属实：`not_observed` 状态、未提供的数组、没有结果字段的快速退出启动都得到 `PASS` | 三个子判据先检查输入是否给出（未给出为 `UNKNOWN`，给出且为空是观察到的零）；终态必须在产品词汇 `exited`、`stopped`、`failed`、`released` 内，未识别状态为 `UNKNOWN`，`cleanup_required` 为 `FAIL`；快速退出的启动必须读到 `background_started`，读不到结果为 `UNKNOWN`，其他状态或带错误为 `FAIL` | `codex round 16 (P2)`；原用例中 `evaluateBg03Facts({})` 的期望由 `FAIL` 改为 `UNKNOWN` |
| P2-N3 残留未知、清理未知缺回归保护 | 属实：两个单点变异存活 | 不改实现，补用例：分别构造“只有产品残留未知”“只有清理未知”“只有存活未知”，三者各为 `UNKNOWN`，其余检查均为 `true` | `P2 (regression)` |
| 信息 13 `candidateRoot-unrelated` 前缀假阳性 | 属实（信息级），顺手修 | 残留匹配改为目录边界：路径等于根，或以根加 `\` 或 `/` 开头；根先去掉末尾分隔符 | `P2 (boundary)` |

## 4. 本轮修复

提交 `3d152545…` 改 5 个文件，全部在 §6.1 的 20 个路径内，没有产品代码。

| 层 | 文件 | 改动 |
|---|---|---|
| 驱动 | `src/shell/tests/product/a9-batch2-driver-entry.cjs` | 新增 `TERMINAL_MANAGED_STATES`、`allOf`、`factsFinished`、`startedOk`；`evaluateBg03Facts` 改用它们，输入未给出为 `UNKNOWN`。`release_exit` 模式没有改动，仍记录 `handle`、`command_tree`、`handle_pid_in_command_tree`、`wmic_failures` |
| 套件 | `release/win7-product-v3/a9-batch2-smoke.cjs` | `aliveByIdentity` 拒绝空创建时间；`removeReleasedCommand` 改为跨轮追踪；`releaseStatus` 严格三值；`finishReleaseEvidence` 增加 `handlePid`、`releasedRoot`、`rootKnown`、`rootAliveAfterExit`，`aliveOk` 只看句柄根，`sequenceOk` 要求布尔，残留匹配加目录边界 |
| 夹具与说明 | `a9-batch2-fixtures.cjs`、`A9_BATCH2_WIN7_VALIDATION.md` | A02 的断言文字改为“句柄的进程及其后代”；说明文件的判定表同步 |
| 测试 | `src/shell/tests/product/a9-batch2-contract.test.ts` | 释放测试的夹具加入 `handle` 记录并支持“单次列表失败”“按进程号终止”；新增 5 个 `codex round 16` 用例和 1 个驱动用例；合同文件 219 变 225 |

任务书记录见 [§6.59](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#659-codex-第-16-轮复核与第二轮修复2026-10-15)。

## 5. 重点复核点

1. **P1-R1 是否真关闭。** `tracked` 的键、`unidentified` 的处理、`liveDescendants` 对已追踪实例的重复发现，是否仍有一种输入让“已观察到存活的实例”在后续轮次被遗忘。尤其是：根被终止后才出现的后代（父进程已死，`ParentProcessId` 仍指向它）不会被发现，这是否应作为发现；本轮认为这类进程在退出前不可见，不在“已观察到”范围内，请独立判断。
2. **P1-R2 的身份链。** `handle.pid`、命令树里的条目、退出后列表里的实例三者的对应关系是否闭合；`handle_pid_in_command_tree` 与重新在套件里查找 `command_tree` 是否冗余或矛盾；根不在 `own` 集合的前提。`handle.pid` 在 Win7 上是否就是执行循环的 shell 进程，本轮不能确认（见第 7 节），请判断判定逻辑对两种可能（`handle.pid` 为执行命令的进程，或为短命的包装进程）各给出什么结论。
3. **三值逻辑的穷举。** `aliveOk`、`residueOk`、`cleanupOk`、`sequenceOk`、`dialogOk`、`exitOk` 六个输入的全部取值组合；`releaseStatus` 的新规则；请再找一个会产生假 `PASS` 或假 `FAIL` 的输入。
4. **A01 的新输入域。** `factsFinished` 对 `null`、非对象、缺 `lastProbeStatus` 的项；`startedOk` 对没有结果字段、结果是纯文本、`ok:false` 的各形态；`allOf` 的优先级；“输入未给出为 `UNKNOWN`”与“给出且为空为观察到的零”的边界是否一致。
5. **残留匹配的目录边界。** 根去掉末尾分隔符后用 `\` 或 `/` 加前缀；大小写与 UNC 前缀；映像路径含 `..` 或短文件名（8.3）时是否会漏判，请判断。
6. **测试质量。** 变异清单见第 6 节；请再自选变异，尤其是 `removeReleasedCommand` 的轮次终止条件、`liveDescendants` 的陈旧子进程过滤与新追踪集合的交互，以及 `rootKnown` 的三个条件。p05 端到端模拟仍使用默认夹具，是否把真实结构绑牢。
7. **前几轮要点的回归。** 第 16 轮交接包第 5 节的第 6、7、8 项（Electron 专用流程的只读判断、时长、候选号重命名）本轮没有改动，如无新发现不必重复。

## 6. 变异清单（执行代理用的）

方法：脚本逐个替换一处代码，只跑合同测试文件，有失败即“被拦”；每次运行后恢复原文件。本轮在三个独立检出里并行运行（均为 `3d152545…`）。其中 31 项沿用第 16 轮清单（片段未变），17 项是片段改变后改写的同名变异，22 项针对本轮修复新增（G01～G21，另补 G01b）。

基线：未变异的检出，合同文件 225 个测试全部通过（脚本在每个分片开始前先跑一次，不通过则中止）。共 70 次运行：69 次被拦，1 次存活。存活的 G01 是等价变异：`removeReleasedCommand` 的 `roots` 已来自追踪集合，目标重建后与原目标相同，行为不变；真正的旧行为由 G01b（根只取原始记录、目标由存活的根重建）表达，被新增的 P1 清理用例拦住。所有被拦的运行都是测试失败（有具名失败用例），没有语法错误或崩溃充当拦截。

| 编号 | 变异 | 结果 | 来源 |
|---|---|---|---|
| D01 | 快速退出：不要求句柄为 exited | 被拦 | 改写 |
| D02 | 快速退出：忽略清理标志 | 被拦 | 改写 |
| D03 | 快速退出：忽略残留 | 被拦 | 改写 |
| D04 | 失败启动：started 路径也算 PASS | 被拦 | 改写 |
| D05 | 失败启动：忽略残留 | 被拦 | 改写 |
| D06 | 失败启动：忽略清理标志 | 被拦 | 改写 |
| D07 | 路径：从不识别 helper 启动失败 | 被拦 | 沿用 |
| D08 | 双 Stop：不要求两次 Stop | 被拦 | 改写 |
| D09 | 双 Stop：忽略第一次 Stop 失败 | 被拦 | 沿用 |
| D10 | release：忽略释放号相等 | 被拦 | 沿用 |
| D11 | release：忽略顺序 | 被拦 | 沿用 |
| D12 | release：把其他句柄的事件算进来 | 被拦 | 沿用 |
| D13 | release：不比较对话框按钮名 | 被拦 | 沿用 |
| D14 | release：退出前记录文件改名 | 被拦 | 沿用 |
| D15 | 模式表缺 release_exit | 被拦 | 沿用 |
| D16 | BG-03 第 1 条恒 PASS | 被拦 | 沿用 |
| D17 | 失败启动探针用了快速退出场景 | 被拦 | 沿用 |
| D18 | release：事件里丢掉释放号 | 被拦 | 沿用 |
| D19 | release：返回序号固定为 1 | 被拦 | 沿用 |
| D20 | release：绕过对话框事实函数 | 被拦 | 沿用 |
| D21 | 失败启动：不判新句柄 | 被拦 | 改写 |
| D22 | 快速退出：失败启动也算 | 被拦 | 改写 |
| D23 | 快速退出：不要求新句柄 | 被拦 | 改写 |
| S01 | release_exit 点第一个按钮 | 被拦 | 沿用 |
| S02 | p05 缺 release_exit | 被拦 | 沿用 |
| S03 | 旧标记文件保留 | 被拦 | 沿用 |
| S04 | release：忽略退出码 | 被拦 | 沿用 |
| S05 | release：忽略终止原因 | 被拦 | 沿用 |
| S06 | release：忽略点击状态 | 被拦 | 沿用 |
| S07 | release：序号不要求恰为 1 | 被拦 | 沿用 |
| S08 | release：忽略对话框超时 | 被拦 | 沿用 |
| S09 | release：不要求命令存活 | 被拦 | 改写 |
| S10 | release：树未观察时判 FAIL 而非 UNKNOWN | 被拦 | 改写 |
| S11 | release：忽略产品残留 | 被拦 | 沿用 |
| S12 | release：不查 driver-electron 目录 | 被拦 | 改写 |
| S13 | release：不等待进程关闭 | 被拦 | 沿用 |
| S14 | release：不要求清理成功 | 被拦 | 沿用 |
| S15 | 清理：可能杀本进程 | 被拦 | 改写 |
| S16 | 后代：保留陈旧子进程 | 被拦 | 沿用 |
| S17 | killProcess 带 /T | 被拦 | 沿用 |
| S18 | 身份：忽略创建时间 | 被拦 | 改写 |
| S19 | 状态：UNKNOWN 优先于 FAIL | 被拦 | 改写 |
| S20 | release：忽略树查询失败 | 被拦 | 沿用 |
| S21 | release：忽略归属序列 | 被拦 | 改写 |
| S22 | p05 从不判 A02 | 被拦 | 沿用 |
| F01 | 持有上限改为 3000 秒 | 被拦 | 沿用 |
| F02 | badcwd 场景改名 | 被拦 | 沿用 |
| F03 | badcwd 场景不带 cwd | 被拦 | 沿用 |
| G01 | 清理：目标只来自存活的根（等价变异） | 存活（等价变异，见下） | 新增 |
| G01b | 清理：根只取驱动原始记录，目标由存活的根重建（第 16 轮 P1 的旧行为） | 被拦 | 新增 |
| G02 | 清理：发现的子进程不保留 | 被拦 | 新增 |
| G03 | 清理：忽略无创建时间的实例 | 被拦 | 新增 |
| G04 | 根：不要求驱动标志 handle_pid_in_command_tree | 被拦 | 新增 |
| G05 | 根：忽略进程树查询失败 | 被拦 | 新增 |
| G06 | 根：任意条目存活都算存活（第 16 轮 P1） | 被拦 | 新增 |
| G07 | 根：接受空创建时间 | 被拦 | 新增 |
| G08 | 状态：undefined 算 PASS | 被拦 | 新增 |
| G09 | 归属记录：ok 不要求是布尔值 | 被拦 | 新增 |
| G10 | 残留：按路径前缀匹配，无目录边界 | 被拦 | 新增 |
| G11 | 残留：未观察算干净 | 被拦 | 新增 |
| G12 | 清理：未观察算已完成 | 被拦 | 新增 |
| G13 | 存活：未识别的根算存活 | 被拦 | 新增 |
| G14 | 存活：列表不可用算存活 | 被拦 | 新增 |
| G15 | 快速退出：不读启动状态 | 被拦 | 新增 |
| G16 | 失败启动：未识别状态算已结束 | 被拦 | 新增 |
| G17 | 失败启动：数组按已给出处理 | 被拦 | 新增 |
| G18 | 快速退出：数组按已给出处理 | 被拦 | 新增 |
| G19 | 双 Stop：未给出的列表也判定 | 被拦 | 新增 |
| G20 | 失败启动：cleanup_required 状态不算失败 | 被拦 | 新增 |
| G21 | 失败启动：缺失的事实算已结束 | 被拦 | 新增 |


## 7. 未在 Win7 验证的事实（`UNKNOWN`，首次预演决定）

| 项 | 说明 |
|---|---|
| `handle.pid` 是否就是执行循环的进程 | 取决于 helper 启动命令的方式。若 `handle.pid` 不在驱动记录的命令树里，A02 为 `UNKNOWN`；若它在树里但很快结束而后代继续运行，A02 为 `FAIL`，须由首次预演的证据判断是产品行为还是套件的假设错误 |
| 被释放的命令在 Win7 上是否存活 | A9-31 的 Win7 签字为空。不存活时 A02 为 `FAIL`，这是产品发现 |
| release 后 helper 是否继续存活 | 若仍在候选目录下运行，A02 为 `FAIL`，这是发现，不是套件缺陷 |
| 不存在的工作目录走哪条路径 | 三种路径都被记录。若稳定为 `started`，A01 长期 `UNKNOWN`，须改用别的制造方式或登记限制 |
| p05 总时长与计划任务时限的余量 | `UNKNOWN`；各模式上限合计 900＋180＋300＝1380 秒，计划任务时限为 3 小时，请求有效期只在阶段开始时校验 |
| 套件终止被释放的命令及其后代是否属 R1～R8 闭集 | 终止发生在计划任务内，对象只限驱动退出前记录过身份的进程和在其存活时发现的后代，与现有杂散进程清扫同类 |
| 驱动在记录身份前出错 | 被释放的命令得不到身份记录，套件不会终止它；它在 300 秒后自行结束 |
| `sessionBg` 新流程的运行时行为 | 开发机只有源码级断言与纯函数测试；Electron 里的实际流程 `NOT_PERFORMED` |

本包不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。KL-3、KL-5、KL-6a 与 KL-7（含边界 a、b、c）仍有效，任何 Alpha 2 结论必须带上它们。未在 Win7 验收通过。

# A9-33 独立审核交接包（第一段复核第四轮，2026-10-13，绑定第三修复提交 cde53348…）

本包供 codex 对 A9-33 的第三修复提交 `cde53348af59684f2f16ed39fdb7ac00aa56dc79` 做第一段复核的第四轮。第三轮对 `0c163c24…` 的结论是“不建议进入预演授权评审”（0 个 P0、2 个 P1、1 个 P2），见 [A9-33 §6.12](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#612-codex-第一阶段第三轮复核与第三修复轮2026-10-13)。
证据层级为开发机。驱动、冒烟、桌面控制器没有在 Electron、PowerShell、Win10、Win7 上运行过，全部 NOT_PERFORMED。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由负责人决定是否登记。负责人已于 2026-10-13 批准把本提交发给 codex 复核。

## 0. 审核会话启动说明

审核者是负责人另开的新会话，不带执行代理的上下文，也不是实现方。
审核者只读本文件和第 1 节列出的提交，不写原隔离树、主工作区和已有 `.acceptance`。
审核者在自己的空目录复算，把结论写进自己目录的 `review-conclusion.md`，并向负责人报告。
不联网、不下载、不启动 Electron、不访问 Win10 或 Win7、不提交、不推送。

目录与磁盘纪律（第一轮、第二轮都因磁盘出过偏差或故障）：

1. 所有命令先执行 `export TMPDIR="$PWD/tmp"`，使包测试的夹具落在复核根内。
2. 需要再克隆时用 `git clone --no-hardlinks`，不用 `cp -R`（`node_modules` 是指向主工作区的符号链接，复制会展开成数 GB）。
3. 写最终报告前清理自己根里的 `tmp` 夹具，使复核根占用小于 3 GB。

结论按 P0、P1、P2、信息分级。每条写 `文件:行`、依据和复现方式。没有发现时，写明检查了什么。
最后给出一句话：是否建议在该提交上进入预演授权。

复核分三段，本包只覆盖第一段的第四轮：

| 段 | 对象 | 时点 |
|---|---|---|
| 一 | 实现提交的源码与开发机检查（本包为第四轮） | 现在 |
| 二 | 预演产生的证据和驱动修正（若有） | 预演之后，负责人另行提供 |
| 三 | 正式执行的原始证据与报告核验 | 正式执行之后、门 B 之前 |

## 1. 对象与保护边界

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送 |
| 复核对象 | `cde53348af59684f2f16ed39fdb7ac00aa56dc79`（父 `beac36a415d297098f229350a50de7029df42425`）。本提交改 4 个文件，+111、−11 |
| 提交链 | `7e96f561…`（A9-32 尖端）→ `905bf760…`（第一轮复核对象，20 个文件）→ `d027af7d…`（只改 `docs/`）→ `8c16ffd9…`（第二轮复核对象，9 个文件）→ `46bce3a0…`（只改 `docs/`）→ `0c163c24…`（第三轮复核对象，7 个文件）→ `beac36a4…`（只改 `docs/`）→ `cde53348…`（本轮复核对象） |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下共 20 个文件，+6801、−31，与 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径)的 20 个路径一致 |
| 任务书与合同 | [A9-33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §3、§6.1、§6.2、§6.9、§6.10、§6.11、§6.12；[A9-32](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md) §5、§7.10 |
| 保护边界 | 不得改动旧取证组件和产品语义。20 个路径之外的非 `docs/` 文件必须没有差异 |

必须从提交取得文件，不能拿工作区文档对照。`cde53348…` 之后的提交只改 `docs/`，不属于源码复核对象。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -C "$REVIEW_DIR" -c core.fsmonitor=false checkout -q cde53348af59684f2f16ed39fdb7ac00aa56dc79
git -C "$REVIEW_DIR" -c core.fsmonitor=false rev-parse HEAD
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

预期：`rev-parse` 输出 `cde53348af59684f2f16ed39fdb7ac00aa56dc79`。依赖搭建不链 `@win7-agent`；模块清单由主工作区目录展开，不依赖当前目录。
这里用本地克隆而不是 `git archive`，因为包测试和 `docs:check` 需要 `.git`。克隆只读本地仓库，不联网。
`mktemp` 在当前目录（复核根）下以绝对路径创建 `review.XXXXXX`（后面的块会在检出内切换目录，相对路径会失效）；`../a9-33-*.txt` 落在复核根，这是预期的。

第二步：核对路径清单。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 cde53348af59684f2f16ed39fdb7ac00aa56dc79 | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
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
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 cde53348af59684f2f16ed39fdb7ac00aa56dc79 -- release scripts src
git -c core.fsmonitor=false diff --name-only 905bf760b6f32f023fdf76f9f45b629098f0d7bd d027af7d3277c2e0a0027e5247def93c185705ad | grep -v '^docs/' | wc -l
git -c core.fsmonitor=false diff --name-only 8c16ffd941b5ac57d133b2039bfa01b8bd24ffd1 46bce3a001b30a0f0a904ea6bbd0fcb08f4f1c12 | grep -v '^docs/' | wc -l
git -c core.fsmonitor=false diff --name-only 0c163c24f6e0b6a8d693c21d83dfbd1897405304 beac36a415d297098f229350a50de7029df42425 | grep -v '^docs/' | wc -l
git -c core.fsmonitor=false diff --shortstat cde53348af59684f2f16ed39fdb7ac00aa56dc79^ cde53348af59684f2f16ed39fdb7ac00aa56dc79
```

预期：输出 `PATHS_MATCH`；第一条统计含 `20 files changed, 6801 insertions(+), 31 deletions(-)`；`905bf760…` 到 `d027af7d…` 的非 `docs/` 文件数为 `0`；`8c16ffd9…` 到 `46bce3a0…` 的非 `docs/` 文件数为 `0`；`0c163c24…` 到 `beac36a4…` 的非 `docs/` 文件数为 `0`；最后一条统计为 `4 files changed, 111 insertions(+), 11 deletions(-)`。
清单与改动路径有任何差异，即为 P0：提交越过了 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的白名单。

第三步：开发机检查。同一 shell 中执行。顺序有意义：先构建七个模块并还原被改写的受跟踪产物，再跑包测试和 jest。包测试要求 `src/*/dist` 已在本检出里构建，且受跟踪文件干净。

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
| `node --test` | 120 通过、0 失败，约 9 到 13 分钟 |
| shell jest | 2 个套件、101 个用例通过（执行代理在无沙箱环境实测）。上一轮在 codex 沙箱里有 6 个用例因回环监听被拒（`listen EPERM 127.0.0.1`）失败，用例名见下表。若本轮仍有 `EPERM` 失败，请逐个列出用例名并确认原因是沙箱拒绝监听，不要与产品缺陷混写 |
| 还原后 `status` 行数 | 0 |
| `docs:check` | `ok`，该提交的内容为 329 个文件 |
| `diff --check` | 无输出 |

上一轮的 6 个沙箱失败用例（均在 `a9-batch2-contract.test.ts`，仅作对照，不替代你在本轮的实测；本轮新增的截断列表用例不需要回环监听）：

| # | 用例 |
|---|---|
| 1 | the loopback Provider answers scripted steps, records them, holds on demand and reports counters |
| 2 | a driver phase applies driver assertions, keeps unobserved ones open and names a failed mode |
| 3 | a driver ERROR or non-zero exit fails the phase even when every assertion was already recorded as PASS |
| 4 | a kill-on-marker mode that was not killed by the marker fails the phase |
| 5 | wrong owner, revision drift, residue and unreadable mode settings each refuse a continue and send nothing |
| 6 | stopping a continuation turn leaves the task retryable: interrupted rows and a new enabled card |

被跟踪的 `src/runner/dist` 落后于源码是已知问题，`verify:quick` 会改写它。必须还原，不能提交。
包测试要在不被改动的检出里整体运行，测试期间不要改动该目录。

实测说明：见本文末尾“执行代理实测记录”。

## 3. 前三轮发现与修复（请逐条确认是否真正关闭）

第三轮对第一轮 11 组的结论是 9 组关闭、2 组部分关闭（P1-6、P1-7）；对第二轮 R1～R6 的结论是 4 组关闭（R2、R3、R5、R6）、2 组部分关闭（R1、R4）。第三轮另列 N1、N2（P1）和 P2-N1（P2）。
下表的“修复位置”由执行代理给出，请从源码和测试独立确认，不要采信本表。

| 编号 | 第三轮结论 | 第三轮发现 | 本轮修复位置与回归用例 |
|---|---|---|---|
| P1-1、P1-2、P1-3、P1-4、P1-5、P1-8、P2-1、P2-2、P2-3、R2、R3、R5、R6 | 已关闭 | 无 | 本轮未改这些修复；请抽查它们的测试仍通过 |
| P1-6、R1 | 部分关闭 | N1：执行器无标记截断进程列表，超限的合法列表丢掉尾部，同实例存活行消失仍记 PASS。P2-N1：列表失败时丢弃已见的存活行，§6.11 写 FAIL 而实际为 UNKNOWN | `a9-batch2-smoke.cjs` 的 `STDOUT_CAP`、`realExec`（输出超限时置 `truncated` 并在 `error` 写 `stdout_truncated:<长度>`）、`parseWmicCsv` 的 `completeOnly`、`listProcesses`（失败时保留列数完整的行）；用例 “a listing cut off at the cap is a failed listing, and the complete rows of a failed listing still show presence” |
| P1-7、R4 | 部分关闭 | N2：幽灵令牌用子串匹配，`out 99` 里找得到 `out 9`，`tick 20` 里找得到 `tick 2` | 驱动 `storedHasToken`（前一字符不是字母或下划线，后一字符不是数字，或令牌在存储文本末尾）；用例 “stream output tokens include stdout, so a never-stored out frame is a ghost and a same-millisecond persist is not proof” 增加前缀断言 |

**P1-6 收窄**（负责人 2026-10-13 确认，见 [A9-33 §6.10](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#610-codex-第一阶段复核与修复轮2026-10-13)）：
退出码和时间只记父进程直接启动的产品进程；driver、helper、Shell 子孙进程按“进程号加创建时间”核对退出后不存在，并记录观察缺席的时刻；退出前树为空、查询失败、进程列表失败或被截断时记 `UNKNOWN`。
第三轮已确认该收窄没有放宽“无存活进程”判据，且 §6.10、§6.11、套件说明与 `B2-CH-06-NORMAL-EXIT` 文字一致，同时指出实现尚不满足全部判据（N1、P2-N1）。请确认本轮改动让实现与这些文字一致，并核对套件说明“进程列表”一行与 §6.12 的描述相同。

## 4. 请重点复核修复引入的新风险

按风险从高到低。

1. **失败列表保留部分行的后果。** `listProcesses` 在失败时仍返回 `rows`。三处消费者是 `collectEnvironment`、`finishChainEvidence`、`runPostflightPhase`。请核对每处在 `failed === true` 时：部分行里有存在证据则记 `FAIL`，没有则记 `UNKNOWN`；没有任何一处因 `rows` 非空而把失败列表当作已观察。尤其核对 `collectEnvironment` 里 `session_id`、父链 `own` 与 `processes_total` 取自部分行时的后果。
2. **截断标记的覆盖面。** `realExec` 对所有固定命令生效。请核对除进程列表外，是否有消费者因 `error` 现在可能是 `stdout_truncated:…` 而改变行为（例如 `free_space` 的结果直接解析 `stdout`，不看 `error`）；并核对 262144 字符的上限与 `spawnSync` 的 `maxBuffer`（4 MiB，超出时 `spawnSync` 自己报错）的关系。
3. **`completeOnly` 的判据。** 它以“单元格数等于表头列数”判断完整行。请核对：行在最后一列内被切断时仍被保留，匹配用的 `ProcessId` 与 `CreationDate` 是否都在被切断的字段之前（列顺序由命令输出的表头决定，真实 Win7 列顺序 `UNKNOWN`）；切在 `ProcessId` 列内的行是否一定因单元格数不足而被丢弃。
4. **`storedHasToken` 的边界规则。** 请核对：(a) 帧不加分隔符拼接时，真实输出的正常令牌不会被误拒（前一字符为数字时允许）；(b) 令牌恰在存储文本末尾时算已存，这是否会让 `out 9` 在数据库当前只有 `out 9`（之后可能增长为 `out 99`）时被放行，是否与“先显示后落盘”检查冲突；(c) 评估器里是否还有同类的子串匹配。
5. **测试对 `child_process.spawnSync` 的替身。** 新用例用 `jest.spyOn(require('child_process'), 'spawnSync')` 并在 `finally` 复原。请核对它不会泄漏到其他用例。
6. **前两轮遗留。** B2-UI-02 注入的任务、轮次、事件行不删除（一次性数据根），以及第 2 节的 6 项沙箱未覆盖用例：请沿用上一轮的处理，不能运行的列为 `UNKNOWN`，不要补签 PASS。

## 5. 驱动假设清单的变化

第一轮 13 条驱动假设见 [第一份交接包](a9_33_independent_review_handoff_2026-10-12.md)第 4 节，其中第 8 条（`sendInputEvent` 序列）仍为 UNKNOWN。
第 14～20 条的第三轮结论：18、19 成立（源码层，19 另有离线 Node 与 SQLite 核对）；20 成立（源码返回协议），Windows 实际行为 UNKNOWN；16、17 仍为 UNKNOWN；14 成立（限源码定义）；15 的检测完整性由 R4 与 N2 补足。
本轮新增的假设：

| # | 驱动假设 | 对照位置 |
|---|---|---|
| 21 | `wmic /format:csv` 在失败（非零退出、超时）时可能已输出部分行，且最后一行可能被截断 | `a9-batch2-smoke.cjs` 的 `listProcesses`、`parseWmicCsv`；Windows 实际行为 `UNKNOWN` |
| 22 | 真实 Win7 的进程列表输出小于 262144 字符；超过时被判为列表失败，不是无法运行 | 每行约 150 到 250 字符，若进程数为一两百，约 30 到 50 KiB；真实值 `UNKNOWN` |
| 23 | 流区的令牌由换行分隔，帧边界不会在一个令牌的字母或数字之间插入其他字符 | `a9-batch2-fixtures.cjs` 生成 `tick N`、`out N`、`err N` 行；`renderer/a9-workbench.js` 的流渲染 |

## 6. 反例

第三轮的 14 个反例：M1 删除 guard 请求计数相等、M2 UNKNOWN 晋为 PASS、M3 滚动容差 2→500、M4 删除 CMD CRLF 判据、M5 正式 managed 锁摘要改一位、M6 `mkdir` 改为递归、M7 删除 `complete` 消费核对、M8 必需名单删除 ORPHAN、M9 删除 `listProcesses` 的状态与错误判断、M10 恢复接受 `cancelled`、M11 删除同索引 `rivals` 检查、M12 令牌模式去掉 `out`、M13 删除同毫秒计数 `tied`、M14 `cardUsable` 去掉 `disabled` 判断。第三轮全部被拦住。
本轮请审核者在自己的目录重做这 14 个，并另试下列 7 个，再用第三轮自己的三个反例输入（292147 字符的截断列表、`out 99` 对 `out 9` 的前缀幽灵、失败列表里完整的存活行）重放，预期分别得到 `UNKNOWN`、违规、`FAIL`。变更须在审核者自己的目录内完成并恢复，并核对哈希。

| 变更 | 预期被哪个测试拦住 |
|---|---|
| `realExec` 去掉截断标记（`truncated` 恒为 false） | “a listing cut off at the cap is a failed listing…” |
| `listProcesses` 忽略 `result.truncated` | 同上 |
| `listProcesses` 失败时丢弃全部行 | 同上 |
| `parseWmicCsv` 的 `completeOnly` 不再丢弃不完整行 | 同上 |
| `storedHasToken` 去掉“后一字符不是数字” | “stream output tokens include stdout…” |
| `storedHasToken` 去掉“前一字符不是字母” | 同上 |
| 评估器改回 `dbJoined.includes(token)` | 同上 |

## 7. 不在范围

Win7 与 Win10 的任何动作、预演与正式执行的授权、候选冻结、关口 A 与 B、ADR-0155 的接受、A9-32 `DEVELOPER_VERIFIED` 的签发、完整 Alpha 2 裁决。
本包不请求任何执行授权。复核者的结论不构成关口签署。

## 执行代理实测记录

2026-10-13，执行代理，开发机，Node 20.17.0。本文第 2 节三个 `sh` 代码块用脚本原文抽出，在全新空目录里以 `bash -e` 一次执行，退出码 0，总用时 523 秒。

| 步骤 | 实测 |
|---|---|
| `rev-parse` | `cde53348af59684f2f16ed39fdb7ac00aa56dc79` |
| 路径清单 | `PATHS_MATCH` |
| 累计统计 | 20 个文件，+6801、−31 |
| `905bf760…`→`d027af7d…` 非 `docs/` 文件数 | 0 |
| `8c16ffd9…`→`46bce3a0…` 非 `docs/` 文件数 | 0 |
| `0c163c24…`→`beac36a4…` 非 `docs/` 文件数 | 0 |
| 第三修复提交统计 | 4 个文件，+111、−11 |
| `node --version` | `v20.17.0` |
| `verify:quick` | 通过 |
| `node --test` | 120 通过、0 失败（478 秒） |
| shell jest | 2 个套件、101 个用例通过；该环境无沙箱，没有 `EPERM` 失败 |
| `docs:check` | `ok`，329 个文件 |
| `diff --check` | 无输出 |
| 还原后 `status` | 0 行 |

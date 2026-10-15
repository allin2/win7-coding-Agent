# A9-33 独立审核交接包（进程树的陈旧父进程链接，第 15 轮，2026-10-15，绑定修复提交 a6c689d5…）

本包供 codex 对预演 11 的 p03 失败做第 15 轮复核；修复提交 `a6c689d5b59d10b2de9253f9f134940977b11974`，相对第 14 轮复核的 `ea5979059f365ae3baf0b9a35caa8e586acedb4e`。
预演 11 用重建的新包（源 `629590a3…`，套件代码与 `ea597905…` 相同）在 Win7 上执行：p01、p02 PASS，p03-chain 的断言 `B2-CH-06-NORMAL-EXIT-A02` FAIL，序列在第 3 阶段停止。
执行代理的诊断：p03 的失败是驱动的进程树把一个无关的 `explorer.exe` 当成产品 helper 的子进程，再把它报为退出后的幸存者。该 `explorer.exe`（PID 3908，会话 1，2026-09-24 创建）记录的父进程 PID 3864，在本次运行中被新的 helper 取得。产品的退出行为没有出错。
这是预演 11 后的第 9 个驱动修复（第 8 个是 `ea597905…`）。修复让 `descendantsOf` 只把“不早于父进程创建”的进程算作子进程。
负责人裁决（2026-10-14）：有 P0 或 P1 时执行代理直接修复、经 codex 复审，修复和预演均无需审批。
证据层级：缺陷的事实来自“Win7 实机（预演，非验收证据）”；修复本身是开发机。修复后的驱动在 Win7 上没有运行过，`NOT_PERFORMED`。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由执行代理登记。

处理规则：本轮若有 P0 或 P1，执行代理直接开下一个修复轮并送 codex 复审；若只剩 P2 及以下，登记已知限制，重建预演包并上 Win7。请把每条发现的级别写准：不要为了让结论好看而降级，也不要为了凑数而升级。
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
最后给出一句话：是否建议在该提交上进入预演 12（重建预演包并上 Win7）。

## 1. 对象与保护边界

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送 |
| 复核对象（代码） | `a6c689d5b59d10b2de9253f9f134940977b11974`。上一个被你复核的代码提交 `ea5979059f365ae3baf0b9a35caa8e586acedb4e`（第 14 轮）。相对 `ea597905…` 本轮改 2 个文件：`src/shell/tests/product/a9-batch2-driver-entry.cjs` 和 `src/shell/tests/product/a9-batch2-contract.test.ts`；统计 `2 files changed, 159 insertions(+), 10 deletions(-)` |
| 运行测试用的检出 | 就是 `a6c689d5b59d10b2de9253f9f134940977b11974`。本包是之后提交的文档，不在该提交的树里 |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 10597 insertions(+), 31 deletions(-)` |
| 保护边界 | 不得改动产品语义和旧取证组件。20 个路径之外的非 `docs/` 文件必须没有差异 |

必须从提交取得文件，不能拿工作区文档对照。

已知限制（不得再列为发现）：KL-1、KL-2（见 §6.13）；KL-3；KL-4；KL-5；KL-6a；KL-7 边界 a、b、c；KL-8（第 13 轮登记）；KL-9（第 14 轮登记）。详见任务书 §6.24、§6.27、§6.33、§6.39～§6.41、§6.46、§6.48。
你第 14 轮列为信息的几项仍是 `UNKNOWN` 或信息，不作为本轮缺陷，除非本轮的修复改变了它们：成因表述过度（`EBUSY` 的因果）、两条查询只按 PID 拼接、`taskkill /T` 在孤儿上的效果。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q a6c689d5b59d10b2de9253f9f134940977b11974
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

预期：`rev-parse` 输出 `a6c689d5b59d10b2de9253f9f134940977b11974`。

第二步：核对范围。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 HEAD | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
wc -l < ../a9-33-changed-paths.txt
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 HEAD -- release scripts src
git -c core.fsmonitor=false diff --name-only ea5979059f365ae3baf0b9a35caa8e586acedb4e HEAD -- release scripts src
git -c core.fsmonitor=false diff --shortstat ea5979059f365ae3baf0b9a35caa8e586acedb4e HEAD -- release scripts src
```

预期：第一条输出 `20`，路径集合与 [§6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径逐一相同（由审核者自己对照）；统计为 `20 files changed, 10597 insertions(+), 31 deletions(-)`；第三条只列出 `src/shell/tests/product/a9-batch2-contract.test.ts` 与 `src/shell/tests/product/a9-batch2-driver-entry.cjs`；最后一条为 `2 files changed, 159 insertions(+), 10 deletions(-)`。

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

预期（执行代理在无沙箱环境实测）：`node --version` 为 `v20.17.0`；`node --test` 120 通过、0 失败；jest 246 个全部通过（合同文件 203、包运行时文件 43）；`docs:check` 为 `ok`，`checked_files` 随本包提交后的文件数而定；`diff --check` 无输出；`status --short` 先执行 `git restore src/runner/dist`，输出 0。沙箱禁止回环监听时，你第 14 轮列出的 8 个用例仍会因 `listen EPERM` 失败，按 `UNKNOWN`（沙箱）处理，不要补签。

第四步：只跑本轮相关用例。

```sh
cd "$REVIEW_DIR/src/shell"
npx jest tests/product/a9-batch2-contract.test.ts -t "stale ParentProcessId|process tree helpers|S05-A02" 2>&1 | grep -E "✓|✕|Tests:"
```

预期：全部 `✓`，没有 `✕`。这些用例不使用回环监听。

## 3. Win7 p03 失败的事实（证据）

证据层级：Win7 实机（预演 11，非验收证据）。根目录 `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-11/`（简称 R11）。目标主机 `dccs-chaizl-PC`，账户 `agent`，运行 id `4314fad5-0970-498e-b414-56ce63b8d333`，时间 2026-10-15T00:26:03Z～00:27:55Z。不要运行其中任何可执行文件。

| 事实 | 文件（相对 R11） | 内容 |
|---|---|---|
| 序列与账本 | `runs/sequence.log`（`1ba4b1f9…`）、`runs/p03-chain/evidence-after/request-ledger.jsonl`（`5483fb1e…`） | p01-env、p02-integrity 为 PASS；p03-chain 的 `result=FAIL`、`failure_class=ASSERTION_FAILED`；序列在第 3 阶段停止（`STOPPED_AT_FAIL_p03-chain`），请求用量 62/80 |
| 断言结果 | `runs/p03-chain/evidence-after/requests/03-p03-chain/phase-result.json`（`fddeb78c…`） | 6 个用例中 5 个全 PASS；唯一失败的断言是 `B2-CH-06-NORMAL-EXIT-A02`：`exit_code=0; killed_by=null; dialog_click_status=0; tree_observed=true; tree_before=6; listing_failed=false; survivors=1; residue=0`。同一用例的 A01（对话框按钮和返回值）PASS |
| 幸存者是谁 | 同目录 `06-held-exit.json`（`5fb0f319…`） | `survivors` 只有一项：PID 3908，`explorer.exe`，`parent=3864`，`created=20260924215846.364600+480` |
| 树里的这一项从哪来 | 同目录 `chain-exit-tree-before.json`（`1edb5f12…`） | 驱动在退出前记录的树：`tree` 6 项，包括 `spike02_helper.exe`（PID 3864，`created=20261015082743.073720+480`）和 PID 3908 的 `explorer.exe`（`parent=3864`）。`explorer.exe` 的创建时间比 helper 早 21 天 |
| 退出本身的结果 | 同目录 `06-postflight.json`（`bc96efb4…`） | `residue=[]`；路径在本次候选和 driver 目录下的进程为 0 |
| Win7 现状（只读） | `diag-p03/query1-utf8.txt`（`a3800edd…`），`r8/tasks-query.txt` | p03 失败后的只读查询：PID 3908 仍在运行，`SessionId=1`，`ParentProcessId=3864`，`CreationDate=20260924215846.364600+480`；PID 3864 已无进程；无 `electron.exe`、无 `spike02_helper.exe`；R8 的计划任务查询里 `A9W43*` 为 0 |
| 对照：预演 9、10 的同一断言 | `../rehearsal-9/runs/p03-chain/…/phase-result.json`、`../rehearsal-10/runs/p03-chain/…/phase-result.json` | 两次 `B2-CH-06-NORMAL-EXIT-A02` 都 PASS，`tree_before=5`，`survivors=0`；树里没有 `explorer.exe` |

执行代理的解释：Windows 在父进程退出后不清除子进程记录的 `ParentProcessId`。会话 1（`dccs-chaizl`，已断开）的 `explorer.exe` 在 2026-09-24 登录时创建，它的父进程（登录进程）早已退出，PID 3864 留在它的记录里。PID 被回收：p03 的 helper 偶然取得 3864。`descendantsOf` 只按 `ParentProcessId` 建树，于是把这个 `explorer.exe` 当成 helper 的子进程，退出检查用“PID 加创建时间相同”判断幸存，这个 `explorer.exe` 当然仍然活着。
所以这个失败是撞号造成的套件误报，产品的退出行为（对话框、返回码 0、产品树全部退出）没有出错；`survivors` 里的那个进程不属于这次运行。
该机器上这类链接不止这一个：R1（重建包）的生产进程表 101 行里，82 行的父进程在且比子进程老，17 行的父进程已不存在（涉及 `explorer.exe`、`csrss.exe`、`winlogon.exe`、`wininit.exe`、`igfxEM.exe`、`igfxHK.exe`、`SynTPHelper.exe`、`BssCtrl.exe`、`Feishu.exe`、`GameViewer.exe`；会话 0 有 2 行、会话 1 有 9 行、会话 2 有 6 行；陈旧父 PID 共 12 个不同的值：376、548、2648、3108、3132、3864、4012、4616、5536、5852、6660、7320），0 行的父进程比子进程年轻。任何一个新产品进程取得这 12 个 PID 之一，旧代码都会把对应进程算作它的子进程。
证据文件 `r1b/prod-table-raw.bin`（`f6d10e72…`，GB18030）可重放这个统计。

### 3.1 读取（开发机，只读）

```sh
cd /Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-11
python3 -I - <<'EOF'
import json
d = json.load(open('runs/p03-chain/evidence-after/requests/03-p03-chain/phase-result.json'))
for c in d['cases']:
    print(c['case_id'], c['status'])
    for a in c['assertions']:
        print('   ', a['assertion_id'], a['status'], str(a.get('observed'))[:300])
h = json.load(open('runs/p03-chain/evidence-after/requests/03-p03-chain/06-held-exit.json'))
print([ (x['name'], x['pid'], x['parent'], x['created']) for x in h['tree_before'] ])
print('survivors', h['survivors'])
EOF
```

预期：`B2-CH-06-NORMAL-EXIT FAIL`，A02 的 `survivors=1`；`tree_before` 里有 `('explorer.exe', 3908, 3864, '20260924215846.364600+480')` 和 `('spike02_helper.exe', 3864, 7656, '20261015082743.073720+480')`。

## 4. 本轮修复

提交 `a6c689d5…` 只改两个文件。

`src/shell/tests/product/a9-batch2-driver-entry.cjs`：

- 新增 `WMI_STAMP` 和 `wmiStampMicros(stamp)`：把 WMI 日期时间（如 `20261015082741.448520+480`）换算成 UTC 微秒；偏移量为分钟；不符合格式的文本返回 `null`。导出供测试使用。
- `descendantsOf(rows, rootPid, stale)`：栈里存放 `{ pid, micros }`，根的 `micros` 取第一条 `ProcessId` 等于根的行的 `CreationDate`。对每个候选子进程，若父和子的时间都能读出，且子进程早于父进程，则它是陈旧链接：不进入树，也不检查它的子树；链接写入可选参数 `stale`。任一时间读不出时，链接保留。同刻（相等）保留。每一层与自己的父进程比较，不与根比较。
- `myTree()`：调用时传入 `stale` 数组，把被排除的链接按 `pid:created` 去重记入驱动级的 `staleParentLinks`。
- 取消检查原先直接调用 `descendantsOf(wmicRows(), process.pid)`，现改为 `myTree()`。
- 两个树证据文件各加一个键 `stale_parent_links`：`03-process-tree.json` 和 `chain-exit-tree-before.json`。

`src/shell/tests/product/a9-batch2-contract.test.ts`：新增 11 个用例，合同文件由 192 个增到 203 个。

| 用例 | 内容 |
|---|---|
| 陈旧链接排除 | 真实 p03 形态：`explorer.exe`（2026-09-24）挂在 helper 下，它的子进程 `ctfmon.exe` 一并排除；树为 `[3864, 7144]`；`stale` 恰有一项；`stillAlive` 对该实例为空 |
| 参数可选且非数组被忽略 | 省略、`null`、`undefined`、`{}`、`true`、`'x'` 均不抛错 |
| 根的时间取根自己的行 | 两个都比根晚、彼此乱序的子进程都保留 |
| 同刻、更晚 | 保留 |
| UTC 比较 | 不同偏移量按真实先后；`wmiStampMicros` 的绝对值：`1970-01-01` 起点、`+480`、`-1` 微秒、`-060` |
| 读不出的时间 | 9 种坏文本返回 `null`；子、父、根行缺失或不可读时链接保留；父不可读时 1970 年前的子进程保留；前后空格的有效时间等值 |
| 层级 | 每一层与自己的父进程比较 |
| 驱动里的 `myTree`（vm 切片） | 陈旧链接不在树里并记入证据，两次调用只记一项；两个不同实例（同 PID、不同创建时间）是两项 |
| 负向对照 | 去掉时间信息后，树含 `explorer.exe` 和它的子进程 |
| 证据文件和取消检查 | 源码里两个证据输出都带 `stale_parent_links`，取消检查读 `myTree()`，源码不再有 `descendantsOf(wmicRows(), process.pid)` |

开发机结果（执行代理，Node 20.17.0，绑定 `a6c689d5…`）：`tsc --noEmit` 通过；合同文件 203 个、包运行时文件 43 个，共 246 个 jest 全部通过；26 个变异先 22 个被拦、4 个存活（补用例后全部被拦，见第 6 节）。`node --test` 的结果见任务书 §6.49。

## 5. 重点复核点

1. **根因是否成立。** 第 3 节的证据能否排除其他解释：explorer 是否可能通过别的途径成为 helper 的子进程；PID 撞号是否是唯一的解释；预演 9、10 的 `tree_before=5` 与本次 6 的差别是否只有这一项。
2. **过滤语义是否正确。** 严格 `<`（相等保留）；UTC 微秒比较；读不出的时间保留链接；一个真子进程是否可能早于父进程创建（时钟被回拨、`CreationDate` 的含义、父进程欺骗属性 `PROC_THREAD_ATTRIBUTE_PARENT_PROCESS` 的取值是否会让子进程早于“父”）；若有，被误排除的真幸存者会让 A02 假 PASS，这是比误报更危险的方向，请判断级别。
3. **被排除链接的可见性。** `stale_parent_links` 是否足以让复核者发现误排除；它只写入两个树证据文件，S05 取消检查的树没有单独记录，是否需要补；`stillAlive` 与 `newProcesses` 是否还会受陈旧链接影响。
4. **其他依赖父子关系的位置。** 20 个路径里还有：套件的 `own` 祖先集合（`a9-batch2-smoke.cjs:260`，沿 `ParentProcessId` 向上扩展，陈旧父 PID 会把一个无关进程并入“自己人”，使它不被当作残留）；驱动 `wmicRows` 对 `WMIC.exe` 子进程的过滤（按 `ParentProcessId` 等于驱动 PID）；套件 `finishChainEvidence` 读驱动写的树。请逐个判断是否同类暴露，级别如何。
5. **`taskkill /PID <pid> /T /F` 与撞号。** `a9-batch2-smoke.cjs:659` 的 `killTree` 对驱动 PID 使用 `/T`。若 `taskkill /T` 按 `ParentProcessId` 展开且不核对创建时间，被杀的驱动恰好取得某个陈旧父 PID 时，`/T` 可能终止无关进程。会话 2 的 `explorer.exe`（PID 6348，父 PID 6660 已不在，账户 `agent`）就是这样一个目标。Windows 对 `taskkill /T` 是否核对创建时间 `UNKNOWN`；`agent` 为 Medium 完整性、非提升；依据 Windows 的进程访问权限规则（未在本机试过），它无法终止其他账户（会话 1）的进程，但可以终止自己会话的进程。请判断这是否需要本轮处理，以及在不改变清扫语义（路径或命令行匹配）的前提下，最小的硬化办法是什么（不是要求本轮实现）。
6. **证据形状变更。** 新增的 `stale_parent_links` 键是否会被报告器、完整性校验器或证据清单拒收；`evidence-manifest.json` 对树证据文件的哈希绑定是否仍然成立。
7. **测试质量。** vm 切片测试与真实驱动代码的绑定是否牢固（切片以 `let wmicFailures = 0;` 开始、以 `// ---- UI actions through the real DOM` 结束）；负向对照是否真正复现旧行为；是否有等价变异被误记为“拦截”。

## 6. 变异清单（执行代理用的）

方法：脚本 `mutate16.py` 在驱动文件里逐个替换一处代码，跑合同测试文件，有失败即“被拦”；运行后恢复原文件并核对。基线 201 个通过；补用例后 203 个通过。

| 编号 | 变异 | 结果 |
|---|---|---|
| D01 | 不做陈旧过滤 | 被拦 |
| D02 | 相等时间也排除 | 被拦 |
| D03 | 比较方向反了 | 被拦 |
| D04 | 忽略时区偏移 | 被拦 |
| D05 | 偏移符号反了 | 被拦 |
| D06 | 忽略微秒 | 被拦 |
| D07 | 父时间读不出时仍参与比较 | 先存活（对 1970 年前的子进程才有差别）；补用例后被拦 |
| D08 | 子时间读不出时仍参与比较 | 被拦 |
| D09 | 根的时间不读 | 被拦 |
| D10 | 不报告被排除的链接 | 被拦 |
| D11 | 被排除的链接仍进树 | 被拦 |
| D12 | 每一层都与根比较 | 被拦 |
| D13 | 时间正则去掉开头锚 | 被拦 |
| D14 | 时间正则去掉结尾锚 | 被拦 |
| D15 | 时间文本不去空格 | 被拦 |
| D16 | 被排除的链接不记入证据 | 被拦 |
| D17 | 证据键只用 PID | 先存活；补“同 PID 两个实例”用例后被拦 |
| D18 | 取消检查改读原始树 | 被拦 |
| D19 | `03-process-tree.json` 不带链接 | 被拦 |
| D20 | `chain-exit-tree-before.json` 不带链接 | 被拦 |
| D21 | 月份不减 1 | 被拦 |
| D22 | 秒字段丢失 | 被拦 |
| D23 | 根行按“父等于根”查找 | 先存活；补“根的时间取根自己的行”用例后被拦 |
| D24 | `stale` 参数只判真值 | 先存活；补“非数组被忽略”用例后被拦 |
| D25 | 不导出 `wmiStampMicros` | 被拦 |
| D26 | 微秒当毫秒 | 被拦 |

请至少抽查 10 个，并另试至少 4 个新变异（例如：偏移量取 `Number(match[8]) / 60`、`Date.UTC` 的时区、把 `micros === null` 的保留改为排除、`seen` 与 `stale` 的先后顺序）。

## 7. 未知与未验证

- 修复后的驱动在 Win7 上的运行：`NOT_PERFORMED`。
- 同一撞号再次发生的概率：`UNKNOWN`；当前有 12 个不同的陈旧父 PID，每次运行取得其中一个 PID 的概率与该机器的 PID 分配有关。
- `taskkill /T` 在撞号时是否终止无关进程：`UNKNOWN`（第 5 节第 5 点）。
- 时钟回拨导致真子进程早于父进程：`UNKNOWN`；Win7 验收机未观察到时钟调整，没有证据。
- 其余项与第 14 轮相同，没有新增。

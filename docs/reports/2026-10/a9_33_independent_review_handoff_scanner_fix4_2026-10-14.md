# A9-33 独立审核交接包（第四个扫描器修复轮，2026-10-14，绑定修复提交 c869661e…）

本包供 codex 对 A9-33 第四个扫描器修复轮的提交 `c869661e4c7528a2ac87d66daa6ba1104770133c` 做窄范围复核。
本轮输入是 codex 第 9 轮报告（0 个 P0、1 个 P1、2 个 P2，见 [A9-33 §6.40](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#640-codex-第-9-轮复核与第四个扫描器修复轮2026-10-14)）：N6（P1）深层 URL 编码使 96 字符窗口截掉转义起点，含明文密钥的 p10 误通过；N7（P2）无关字段的八层编码消耗层数，使普通任务编号和符号名重新被误报；N8（P2）层数上限 6 的边界存活变异。
负责人裁决：有 P0 或 P1 时执行代理直接修复、经 codex 复审，修复和预演均无需审批，预演次数上限取消。
证据层级：修复本身是开发机；修复后的扫描器没有在 Electron、Win7 上运行过，`NOT_PERFORMED`。对预演 8 证据的读取结论是“Win7 实机（预演，非验收证据）”。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由执行代理登记。

处理规则（负责人裁决）：本轮若有 P0 或 P1，执行代理直接开下一个修复轮并送 codex 复审；若只剩 P2 及以下，登记已知限制，构建预演 9 包并上 Win7。请把每条发现的级别写准：不要为了让结论好看而降级，也不要为了凑数而升级。
同类提示：第 7、8、9 轮的 P0/P1 都落在“密钥前一个字符的判定”这一类上（N1、N3、N6）。本轮执行代理没有再补丁，而是诊断出共同根因（固定长度的前文窗口），把窗口概念整体换掉。请重点检验新设计有没有第四种截断或消耗层数的方式。

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
最后给出一句话：是否建议在该提交上进入预演 9（构建预演包并上 Win7）。

## 1. 对象与保护边界

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送 |
| 复核对象（代码） | `c869661e4c7528a2ac87d66daa6ba1104770133c`。上一个被你复核的代码提交 `fc5211fd80602978895d35aa4a956d5263320876`（第 9 轮）。本轮代码改 2 个文件：`release/win7-product-v3/a9-batch2-smoke.cjs` 和 `src/shell/tests/product/a9-batch2-contract.test.ts`，`2 files changed, 56 insertions(+), 16 deletions(-)` |
| 运行测试用的检出 | `66d7092b559ac7262ad7d559f68bc3d3fbb6b33e`。它与 `c869661e4c7528a2ac87d66daa6ba1104770133c` 只差 `docs/` 下的 5 个文件（`docs/STATUS.md`、`docs/STATUS_LOG.md`、`docs/plans/A9_33_REHEARSAL_AND_EXECUTION_APPROVAL_DRAFT.md`、`docs/reports/2026-10/a9_33_independent_review_handoff_scanner_fix3_2026-10-14.md`、`docs/tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md`） |
| 上一轮复核报告 | `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-review/codex-stage2-round9-20261014/codex_final_report.md`（只读） |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 9618 insertions(+), 31 deletions(-)` |
| 任务书与合同 | [A9-33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §3、§6.1、§6.35～§6.40 |
| 保护边界 | 不得改动产品语义和旧取证组件。20 个路径之外的非 `docs/` 文件必须没有差异。本轮只改 `release/win7-product-v3/a9-batch2-smoke.cjs` 和 `src/shell/tests/product/a9-batch2-contract.test.ts` |

必须从提交取得文件，不能拿工作区文档对照。

已知限制（不得再列为发现）：KL-1、KL-2（见 §6.13）；KL-3（产品缺口：启动后台进程的 Turn 结束后渲染层不再刷新）；KL-4（[§6.24](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md)）；KL-5（[§6.27](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#627-第四修复轮裁决与-kl-52026-10-14)）；KL-6（[§6.33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#633-第七修复轮裁决-b-与-kl-62026-10-14)）；KL-7（[§6.39](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#639-codex-第-8-轮复核与第三个扫描器修复轮2026-10-14)，路径分量过度报告为边界 a；第 9 轮追加边界 b，见本包第 3 节）。本轮不复核第六修复轮及之前的任何内容。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q 66d7092b559ac7262ad7d559f68bc3d3fbb6b33e
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

预期：`rev-parse` 输出 `66d7092b559ac7262ad7d559f68bc3d3fbb6b33e`。

第二步：核对范围。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 HEAD | grep -v '^docs/' | LC_ALL=C sort > ../a9-33-changed-paths.txt
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
git -c core.fsmonitor=false diff --shortstat 7e96f561d3ac51e832a56928118209e604d7f2a0 HEAD -- release scripts src
git -c core.fsmonitor=false diff --name-only fc5211fd80602978895d35aa4a956d5263320876 c869661e4c7528a2ac87d66daa6ba1104770133c -- release scripts src
git -c core.fsmonitor=false diff --shortstat fc5211fd80602978895d35aa4a956d5263320876 c869661e4c7528a2ac87d66daa6ba1104770133c -- release scripts src
git -c core.fsmonitor=false diff --name-only c869661e4c7528a2ac87d66daa6ba1104770133c HEAD
```

预期：输出 `PATHS_MATCH`；下一条统计为 `20 files changed, 9618 insertions(+), 31 deletions(-)`；第三条列出且只列出 `release/win7-product-v3/a9-batch2-smoke.cjs`、`src/shell/tests/product/a9-batch2-contract.test.ts`；第四条为 `2 files changed, 56 insertions(+), 16 deletions(-)`；最后一条只列出 `docs/` 下的 5 个文件（`docs/STATUS.md`、`docs/STATUS_LOG.md`、`docs/plans/A9_33_REHEARSAL_AND_EXECUTION_APPROVAL_DRAFT.md`、`docs/reports/2026-10/a9_33_independent_review_handoff_scanner_fix3_2026-10-14.md`、`docs/tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md`）。清单与改动路径有任何差异，即为 P0：提交越过了 §6.1 的白名单。

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

预期：

| 步骤 | 预期 |
|---|---|
| `node --version` | `v20.17.0` |
| `verify:quick` | 退出码 0；会让 `src/runner/dist` 的 24 个文件变脏，随后立即还原 |
| `node --test` | 120 通过、0 失败，约 5 到 13 分钟 |
| shell jest | 2 个套件、218 个用例通过（contract 175、package-runtime 43；执行代理在无沙箱环境实测）。若你的沙箱禁止回环监听，会有 7 个既有用例因 `listen EPERM 127.0.0.1` 失败；请逐个列出用例名，不要与产品缺陷混写。本轮扩充的 1 个用例只用临时目录，不需要回环监听 |
| 还原后 `status` 行数 | 0 |
| `docs:check` | `ok`，该提交的内容为 339 个文件 |
| `diff --check` | 无输出 |

第四步：回放预演 8 的 p10 扫描。回放脚本只读预演 8 取回的证据，写入 `$TMPDIR`。

```sh
cd "$REVIEW_DIR"
REPO="$REVIEW_DIR" /Users/qlyf/.nvm/versions/node/v20.17.0/bin/node "$REPO/.acceptance/a9-33-rehearsal/rehearsal-8/replay_scan.cjs"
```

预期四行：

```text
FIXED   retrieved evidence: files_scanned=229 findings=0 positive_control_detected=true
OLD     retrieved evidence: files_with_hits=11
FIXED   three flagged binaries: files_scanned=3 findings=0
OLD     three flagged binaries: files_with_hits=3
```

脚本从主工作区的 Electron ZIP（`/Users/qlyf/Developer/win7-coding-Agent/.acceptance/deps/electron/electron-v22.3.27-win32-x64.zip`，只读）解出三个文件到 `$TMPDIR`，用 `unzip`。

## 3. 第 9 轮发现与本轮修复

| 第 9 轮发现 | 本轮处理 |
|---|---|
| N6（P1）：48 层及以上 URL 编码的换行或空格，前缀长度 97 字符，96 字符窗口截掉最左的 `%`，剩余全是字母或数字，没有完整转义，函数直接返回“不是密钥起点”，没有走“超限报告”分支，p10 误通过 | 窗口概念整体换掉。上下文不再是“密钥前 96 个字符”，而是“紧贴候选、由转义字符组成的连续一段”加上它前面的一个字符。转义字符是十六进制数字、`%`、反斜杠、`u`、`x`、`n`、`t`、`r`（`f`、`b` 已含在十六进制数字内）。这一段向左一直取到第一个不是转义字符的位置，所以转义链不会被截断。长度上限 `KEY_MAX_RUN` 为 1024：到达上限（连续 1024 个及以上）不判断，直接报告。其后的逐层还原（`KEY_MAX_DECODE_LAYERS` 为 6）不变 |
| N7（P2）：同一窗口内另一字段的八层 URL 编码用尽层数，任务编号 `task-…` 和 Vulkan 符号名被误报，p10 误拒绝清洁证据 | 同一处修复：上下文只含紧贴候选的转义段。任务编号前的段是 `ta`，符号名前的段是 `a`，与其他字段无关 |
| N8（P2）：层数上限 6 改为 5 的变异存活 | 用例补：`%61` 外包 1、2、5、6 层 URL 编码不报告，7、8、9 层报告。上限 5 和上限 7 的变异都被拦 |

KL-7 追加边界 b（与第 8 轮登记的路径分量边界 a 同方向，都是过度报告，不会漏报）：紧贴 `sk-` 加不少于 20 个密钥字符的前面，如果有连续 1024 个及以上的转义字符（十六进制数字、`%`、反斜杠、`u`、`x`、`n`、`t`、`r`），p10 判 `SECRET_FOUND`。清洁证据里这种形态的概率很低；预演 9 若出现，执行代理先核对命中位置再分类。

当前实现位置：`release/win7-product-v3/a9-batch2-smoke.cjs` 的 `KEY_MAX_RUN`、`KEY_MAX_DECODE_LAYERS`、`ESCAPE_CHARACTER_CODES`、`SERIALIZED_CHARACTER`、`decodeSerializationOnce`、`startsApiKey`、`containsApiKey`，以及 `SECRET_PATTERNS` 的第一项。

证据路径（只读）：`/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-8/`，其中 `RUN_LOG.md` 是过程记录，`r7/evidence/requests/10-p10-postflight/g4-secret-scan.json` 是扫描结果，`r7/evidence/` 是取回的 245 个文件（83 个 `driver-electron` 文件未取回，只有 Win7 端哈希，见 `r7/evidence-sums-final.txt`）。预演 8 的 14 个命中的根因已在第 7、8 轮确认，本轮不再重复。

## 4. 请重点复核

1. 新设计的完备性。转义段向左延伸到第一个非转义字符为止：是否存在一条由套件写入者（`JSON.stringify`、`util.inspect`、`encodeURIComponent`）叠加产生、其中间含非转义字符、因此被截断的链？构造至少 10 种新形态并逐个列出输入和结果；区分“不在套件写入者的输出形态内”与“确实漏检”。
2. 层数：6 层还原、第 7 层变化时报告、延伸上限 1024。检查边界（用例固定了 1023 个不报告、1024 个报告；6 层字母不报告、7 层报告），并检查 JSON 层数加倍反斜杠（`2^k` 个）与 URL 层数组合时是否有漏检。
3. 过度报告：KL-7 之外是否还有会让 p10 误拒绝清洁证据的形态。预演 8 回放仍为 0 个命中；判断这是否足以覆盖 Win7 上未取回的 80 个 `driver-electron` 文件（新实现的命中集合应为旧无边界正则命中集合的子集，请核对）。
4. 性质：当前命中必是旧无边界正则的命中；第 7 轮（单个非字母数字前驱）的命中一个不丢；相对第 8 轮的 `fc5211fd…`，命中只会减少还是也会增加？请用随机文本和你自己的构造检验，并说明差异方向。
5. 耗时：157.6 MB 的 `electron.exe` 整个 `scanBytesForSecrets`；候选极多时；候选前有长转义段时（用例有三个耗时断言，阈值各为 1500 毫秒或与纯字面量搜索的倍数）。判断是否存在二次方耗时的构造，并说明执行代理的“各候选的转义段互不重叠”论证是否成立。
6. 语法与入口：新增 `Uint8Array` 查表和 `charCodeAt`；判断在 Electron 22（V8 10.8，Node 16.17.1）上的兼容风险，只写你能从仓库内文件或已有知识确认的依据，其余写 `UNKNOWN`。`a9-batch2-smoke.cjs` 被 p01、p03～p08、p10 共八个阶段加载。
7. 测试质量：组合检验（156 种序列、3900 个情形）的期望是否仍由“还原后的前驱字符”决定；84 个变异之外你另试 3 个以上；是否还有等价变异被误当作盲点。
8. 同类缺陷扫描：`release`、`scripts`、`src/shell/tests/product` 下是否还有对证据或 Electron 运行时副本做无边界 `sk-` 匹配的代码。构建期载荷扫描 `scripts/release/build-a9-product-v3.mjs:2371` 使用同一无边界正则，本轮没有改（任务书和交接包不写形态匹配它的字面量）。
9. 旧问题（不算新发现，除非你判断本轮使其变严重）：`scanBytesForSecrets` 把字节按 `latin1` 解码，UTF-16 编码和 base64 编码的文本里的 `sk-…` 不会被看到；旧式 `%uXXXX`、八进制、`\v`、`\0`、HTML 实体不在还原范围；`scanRun` 把 `driver-electron` 也扫入证据。

## 5. 假设

| 编号 | 假设 | 执行代理的依据（你须独立核对） |
|---|---|---|
| 67 | 1 到 600 层 URL 编码的换行或空格，以及它们外包 JSON、内含 JSON 的形态，在当前实现下都命中 | 探针逐层枚举；用例固定 14 个层数 |
| 68 | 任务编号、符号名、`ask-…` 前面有 1、7、8、9、50 层无关 URL 编码字段，仍不报告；同一行的真密钥仍报告 | 用例 |
| 69 | 当前命中集合是旧无边界正则命中集合的子集，且包含第 7 轮正则的全部命中 | 随机文本检验（见实测记录） |
| 70 | 各候选的转义段互不重叠，扫描耗时与文本长度成线性 | 论证：转义段在第一个非转义字符处停止，而每个候选自带的 `s`、`k`、`-` 都不是转义字符；用例有长段耗时断言 |
| 71 | 预演 8 的 14 个误报在当前实现下仍是 0 | 回放 |
| 72 | 修复后 p10 在 Win7 通过 | `UNKNOWN` |

## 6. 反例

执行代理对 `a9-batch2-smoke.cjs` 做了 84 个变异，逐个跑 `-t "secret|api-key-prefix"`，全部被至少 1 个用例拦住（见实测记录）；变异后均已还原，并与备份逐字节核对相同。请在你自己的 review 目录内重做，并另试 3 个以上；完成后恢复并核对哈希。

| 组 | 变异 |
|---|---|
| D01～D23 | 还原表：某类转义不还原、位数多一位或少一位、只接受小写十六进制、字母转义缺一个、还原结果恒为空格或按十进制解析 |
| W01～W11 | 转义段：上限 1023、1025、96、1048576；达到上限不报告或判断；不含前一个字符；改回旧的 96 字符窗口；所有 128 以内字符都算转义字符；没有字符算转义字符；向左多走一步 |
| E01～E10 | 转义字符表缺一类：数字、小写十六进制、大写十六进制、`%`、反斜杠、`u`、`x`、`n`、`t`、`r` |
| L01～L07 | 层数上限 0、1、3、5、7；超限不报告；还原无变化时判为密钥起点 |
| B01～B06 | 单字符判定：数字不算、下划线算、连字符算、只算小写字母与数字、只算小写字母、任何字符都算 |
| C01～C11 | 候选：尾部 19、21、30 个字符；缺 `_`、缺 `-`、多收 `.`；前缀大写、缺连字符；只判第一个候选；每个候选都算密钥；删掉整个条目 |
| S01～S11 | `scanRun` 跳过 `.exe`、`.dll`、`.json`、`.txt`、`.log`、无扩展名文件；只读前 1024 字节、前 1 MiB；跳过隐藏文件、隐藏目录；删掉配置字面量检查 |

## 7. 不在范围

- 第六修复轮及之前的任何驱动、夹具、控制器、请求脚本改动。
- 已登记的 KL-1～KL-7。
- `bearer-token` 与 `private-key` 两条正则；p10 的 A02；p09 的报告验证器。
- 产品代码；Electron、PowerShell、Win7 行为（除第 4 节第 6 条的语法兼容依据）。
- 构建期载荷扫描的修改（本轮不改，只请你判断）。

## 执行代理实测记录

执行代理（开发机，Node 20.17.0）：

| 项 | 结果 |
|---|---|
| 交接包第 2 节四个代码块在全新目录整体运行 | 2026-10-14T16:07:36Z～16:16:45Z（549 秒），退出码 0；检出 `66d7092b…`；`PATHS_MATCH`；统计 `20 files changed, 9618 insertions(+), 31 deletions(-)` 与 `2 files changed, 56 insertions(+), 16 deletions(-)` 与预期一致；`verify:quick` 通过；`node --test` 120 通过、0 失败；shell jest 218 通过；`docs:check` 339 个文件；`diff --check` 无输出；还原后 `status` 0 行；回放四行输出与第 2 节第四步的预期一致 |
| `tsc --noEmit`（`src/shell`，执行代理自测，不在交接命令里） | 退出码 0 |
| 变异 | 84 个全部被拦；变异后文件与备份逐字节相同。第一次运行有 2 个存活（`%` 与反斜杠不算转义字符），原因是缺“转义链含两个起点符号”的用例；补 `%5C%6E`、`\x5c\x6e` 后重跑，2 个都被拦 |
| 组合检验 | 156 种序列 × 27 个前驱字符 × 7 种包装，共 29484 个情形：漏报密钥 0 个；整体 URL 编码 40 层、60 层时字母前驱各 304 个被报告（超过 6 层按设计报告，方向是多报） |
| 随机性质检验 | 80 万个随机文本：命中必是旧无边界正则的命中，第 7 轮正则的命中一个不丢，0 个例外 |
| 你第 9 轮的探针脚本重跑 | 1 至 60 层 60 项全部命中；URL 48 层、50 层的 p10 为 FAIL（`SECRET_FOUND`）；无关深层字段加任务编号为 PASS；负面形态的命中集合与你的第 9 轮报告一致 |
| 耗时 | 157.6 MB 的 `electron.exe` 整个 `scanBytesForSecrets` 127 毫秒；15 万个被拒绝的候选 4.35 MB：22 毫秒 |
| 回放 | 当前扫描器：取回的证据 229 个可扫描文件、0 个命中，正控检出；三个二进制 0 个命中。旧正则：11 个 JSON 文件、3 个二进制命中，合计 14，与 Win7 的 `g4-secret-scan.json` 一致 |
| 未执行 | 当前扫描器在 Electron 22、Win7 上运行与耗时 `NOT_PERFORMED`；80 个未取回的 `driver-electron` 文件的回放 `NOT_PERFORMED` |

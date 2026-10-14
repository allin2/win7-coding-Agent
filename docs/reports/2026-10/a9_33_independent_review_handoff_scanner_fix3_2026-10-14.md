# A9-33 独立审核交接包（第三个扫描器修复轮，2026-10-14，绑定修复提交 fc5211fd…）

本包供 codex 对 A9-33 第三个扫描器修复轮的提交 `fc5211fd80602978895d35aa4a956d5263320876` 做窄范围复核。
本轮输入是 codex 第 8 轮报告（0 个 P0、1 个 P1、2 个 P2，见 [A9-33 §6.39](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#639-codex-第-8-轮复核与第三个扫描器修复轮2026-10-14)）：序列化叠加（URL 编码后的 JSON 换行、两次 URL 编码等）使含明文密钥的 p10 误通过（P1）；转义例外误报合法路径和编码后的普通单词（P2）；两个存活变异（P2）。负责人裁决：有 P0 或 P1 时执行代理直接修复、经 codex 复审，修复和预演均无需审批，预演次数上限取消。
证据层级：修复本身是开发机；修复后的扫描器没有在 Electron、Win7 上运行过，`NOT_PERFORMED`。对预演 8 证据的读取结论是“Win7 实机（预演，非验收证据）”。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由执行代理登记。

处理规则（负责人裁决）：本轮若有 P0 或 P1，执行代理直接开下一个修复轮并送 codex 复审；若只剩 P2 及以下，登记已知限制，进入预演 9。请把每条发现的级别写准：不要为了让结论好看而降级，也不要为了凑数而升级。

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
最后给出一句话：是否建议在该提交上进入预演 9 的授权评审。

## 1. 对象与保护边界

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送 |
| 复核对象（代码） | `fc5211fd80602978895d35aa4a956d5263320876`。上一个被你复核的代码提交 `d6d11fb50b7a6c829f41d08d7144b1fbef078d86`（第 8 轮）。本轮代码改 2 个文件：`release/win7-product-v3/a9-batch2-smoke.cjs` 和 `src/shell/tests/product/a9-batch2-contract.test.ts`，`2 files changed, 111 insertions(+), 8 deletions(-)` |
| 运行测试用的检出 | `069c830c036898ea69072e9b81783b875a97df9c`。它与 `fc5211fd80602978895d35aa4a956d5263320876` 只差 `docs/` 下的 5 个文件（`docs/STATUS.md`、`docs/STATUS_LOG.md`、`docs/plans/A9_33_REHEARSAL_AND_EXECUTION_APPROVAL_DRAFT.md`、`docs/reports/2026-10/a9_33_independent_review_handoff_scanner_fix2_2026-10-14.md`、`docs/tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md`） |
| 上一轮复核报告 | `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-review/codex-stage2-round8-20261014/codex_final_report.md`（只读） |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 9578 insertions(+), 31 deletions(-)` |
| 任务书与合同 | [A9-33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §3、§6.1、§6.35～§6.39 |
| 保护边界 | 不得改动产品语义和旧取证组件。20 个路径之外的非 `docs/` 文件必须没有差异。本轮只改 `release/win7-product-v3/a9-batch2-smoke.cjs` 和 `src/shell/tests/product/a9-batch2-contract.test.ts` |

必须从提交取得文件，不能拿工作区文档对照。

已知限制（不得再列为发现）：KL-1、KL-2（见 §6.13）；KL-3（产品缺口：启动后台进程的 Turn 结束后渲染层不再刷新）；KL-4（[§6.24](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md)）；KL-5（[§6.27](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#627-第四修复轮裁决与-kl-52026-10-14)）；KL-6（[§6.33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#633-第七修复轮裁决-b-与-kl-62026-10-14)）；KL-7（[§6.39](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#639-codex-第-8-轮复核与第三个扫描器修复轮2026-10-14)，路径分量过度报告，见本包第 3 节）。本轮不复核第六修复轮及之前的任何内容。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q 069c830c036898ea69072e9b81783b875a97df9c
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

预期：`rev-parse` 输出 `069c830c036898ea69072e9b81783b875a97df9c`。

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
git -c core.fsmonitor=false diff --name-only d6d11fb50b7a6c829f41d08d7144b1fbef078d86 fc5211fd80602978895d35aa4a956d5263320876 -- release scripts src
git -c core.fsmonitor=false diff --shortstat d6d11fb50b7a6c829f41d08d7144b1fbef078d86 fc5211fd80602978895d35aa4a956d5263320876 -- release scripts src
git -c core.fsmonitor=false diff --name-only fc5211fd80602978895d35aa4a956d5263320876 HEAD
```

预期：输出 `PATHS_MATCH`；下一条统计为 `20 files changed, 9578 insertions(+), 31 deletions(-)`；第三条列出且只列出 `release/win7-product-v3/a9-batch2-smoke.cjs`、`src/shell/tests/product/a9-batch2-contract.test.ts`；第四条为 `2 files changed, 111 insertions(+), 8 deletions(-)`；最后一条只列出 `docs/` 下的 5 个文件（`docs/STATUS.md`、`docs/STATUS_LOG.md`、`docs/plans/A9_33_REHEARSAL_AND_EXECUTION_APPROVAL_DRAFT.md`、`docs/reports/2026-10/a9_33_independent_review_handoff_scanner_fix2_2026-10-14.md`、`docs/tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md`）。清单与改动路径有任何差异，即为 P0：提交越过了 §6.1 的白名单。

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
| `docs:check` | `ok`，该提交的内容为 338 个文件 |
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

## 3. 第 8 轮发现与本轮修复

| 第 8 轮发现 | 本轮处理 |
|---|---|
| N3（P1）：叠加序列化使含明文密钥的 p10 误通过。URL 编码后的 JSON 换行（`%5Cn`）、URL 编码后的 `util.inspect` 输出、两次 URL 编码的换行或空格，前驱字符都不在“完整转义”枚举内 | 放弃枚举。`api-key-prefix` 改为函数：先按字面量 `sk-` 加后随 20 个密钥字符找候选；对每个候选取其前 96 个字符，逐层还原 JSON（`\n \t \r \f \b \uXXXX`）、`util.inspect`（`\xXX`）和 URL（`%XX`）的序列化，最多 6 层；任一层的最后一个字符不是字母或数字，即判为密钥起点；还原后仍是字母或数字则不报告；超过 6 层仍无法判定时报告。不再使用后行断言 |
| N4（P2）：转义例外重新误报 `C:\t` 加密钥形态的目录名；`%61`、`\u0061` 解码后是普通字母 | `%61`、`\u0061`、`\x61`、`%41`、`%39` 现在按解码后的字母处理，不报告。目录名形态与转义的制表符无法区分，保持报告，登记 KL-7（过度报告，不会漏报）。用例把这个形态固定为“报告” |
| N5（P2）：两个存活变异（只扫描前 1024 字节；跳过隐藏文件） | 用例补：隐藏文件、隐藏目录、偏移 2 MiB 之后的密钥；两个变异均被拦 |

组合检验（本轮新增，用来封住“漏一种编码”这类问题）：5 种序列化器（`JSON.stringify` 字符串、`JSON.stringify` 对象、`encodeURIComponent`、`util.inspect` 字符串、`util.inspect` 对象）、最多 3 层，共 156 种序列；每种序列对 20 个分隔或控制或非 ASCII 前驱字符（期望报告）和 5 个字母或数字前驱（期望不报告）各扫一次，共 3900 个情形。期望由“还原后的前驱字符”决定，不依赖枚举。执行代理实测 0 个不符。

KL-7：p10 对“反斜杠、`n t r f b` 之一、`sk-`、不少于 20 个密钥字符”形态的路径分量，在原始文本和 JSON 文本里都会判 `SECRET_FOUND`。原因是该形态与转义的换行、制表符无法区分。预演 8 的 229 个取回文件和 3 个二进制回放 0 个命中。

当前实现位置：`release/win7-product-v3/a9-batch2-smoke.cjs` 的 `KEY_CONTEXT_CHARS`、`KEY_MAX_DECODE_LAYERS`、`SERIALIZED_CHARACTER`、`decodeSerializationOnce`、`startsApiKey`、`containsApiKey`，以及 `SECRET_PATTERNS` 的第一项。

证据路径（只读）：`/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-8/`，其中 `RUN_LOG.md` 是过程记录，`r7/evidence/requests/10-p10-postflight/g4-secret-scan.json` 是扫描结果，`r7/evidence/` 是取回的 245 个文件（83 个 `driver-electron` 文件未取回，只有 Win7 端哈希，见 `r7/evidence-sums-final.txt`）。预演 8 的 14 个命中（11 个 JSON 文件里的任务编号，3 个 Electron 二进制里的 Vulkan 符号名）的根因已在第 7、8 轮确认，本轮不再重复。

## 4. 请重点复核

1. 还原的语义是否正确且足够。检查 `decodeSerializationOnce` 的三类还原（`\uXXXX`、`\xXX`、`\n \t \r \f \b`、`%XX`）、窗口大小 96、层数上限 6、超过上限时报告。构造至少 10 种新形态，含你第 8 轮没用过的：例如 HTML 实体、JavaScript 旧式 `%uXXXX`、八进制、`\v`、`\0`、带反斜杠的 URL 编码、三层以上混合，逐个列出输入与扫描结果，并区分“不在套件写入者的输出形态内”与“确实漏检”。
2. 过度报告：KL-7 的形态之外，是否还有会让 p10 误拒绝清洁证据的形态（任务编号、符号名、路径、哈希、base64 片段、`%` 加两位十六进制恰好出现在单词里）。预演 8 回放为 0 个命中；判断这是否足以覆盖 Win7 上未取回的 80 个 `driver-electron` 文件（新实现的命中集合应为旧无边界正则命中集合的子集，请核对）。
3. 性质：当前命中必是旧无边界正则的命中；第 7 轮（单个非字母数字前驱）的命中一个不丢；与第一版修复的差异只在“解码后是字母或数字”的前驱。执行代理用 80 万个随机文本检验过，你另做独立检验。
4. 耗时：157.6 MB 的 `electron.exe` 整个 `scanBytesForSecrets`；候选极多时的耗时（用例里有稠密候选断言，阈值 1500 毫秒，实测 32 毫秒）；两个耗时断言是否会在沙箱里偶发失败。
5. 语法与入口：新实现不含后行断言，只用字面量正则、前瞻和 `String.prototype.replace` 回调；判断在 Electron 22（V8 10.8，Node 16.17.1）上的兼容风险，只写你能从仓库内文件或已有知识确认的依据，其余写 `UNKNOWN`。`a9-batch2-smoke.cjs` 被 p01、p03～p08、p10 共八个阶段加载，语法错误会使这些阶段在入口前中止。
6. 测试质量：组合检验是否真的由“还原后的前驱字符”决定期望，而不是复用实现；65 个变异之外你另试 3 个以上；是否还有等价变异被误当作盲点。
7. 同类缺陷扫描：`release`、`scripts`、`src/shell/tests/product` 下是否还有对证据或 Electron 运行时副本做无边界 `sk-` 匹配的代码。构建期载荷扫描 `scripts/release/build-a9-product-v3.mjs:2371` 使用同一无边界正则，本轮没有改（任务书和交接包不写形态匹配它的字面量）。
8. 旧问题（不算新发现，除非你判断本轮使其变严重）：`scanBytesForSecrets` 把字节按 `latin1` 解码，UTF-16 编码和 base64 编码的文本里的 `sk-…` 不会被看到；`scanRun` 把 `driver-electron` 也扫入证据。

## 5. 假设

| 编号 | 假设 | 执行代理的依据（你须独立核对） |
|---|---|---|
| 61 | 第 8 轮 N3 的叠加形态在当前实现下都命中 | 8 种叠加形态逐个命中；组合检验 3900 个情形 0 个不符 |
| 62 | `%61`、`\u0061` 等解码为字母或数字的前驱不再报告 | 用例 7 种形态；五层 URL 编码下的字母也不报告 |
| 63 | 当前命中集合是旧无边界正则命中集合的子集，且包含第 7 轮正则的全部命中 | 80 万个随机文本 0 个例外 |
| 64 | 预演 8 的 14 个误报在当前实现下仍是 0 | 回放：取回的证据 229 个文件 0 个命中，三个二进制 0 个命中 |
| 65 | 157.6 MB 的 `electron.exe` 整体扫描耗时与纯字面量搜索同量级 | 开发机实测 91～108 毫秒对 22 毫秒；Win7 耗时 `UNKNOWN` |
| 66 | 修复后 p10 在 Win7 通过 | `UNKNOWN`；A02（残留进程）在预演 8 通过，A01 的结果取决于下一次 Win7 运行 |

## 6. 反例

执行代理对 `a9-batch2-smoke.cjs` 做了 65 个变异，逐个跑 `-t "secret|api-key-prefix"`，全部被至少 1 个用例拦住；变异后均已还原，并与备份逐字节核对相同。请在你自己的 review 目录内重做，并另试 3 个以上；完成后恢复并核对哈希。

| 组 | 变异 |
|---|---|
| D01～D04 | 分别让 `\u`、`\x`、字母转义、`%` 不被还原 |
| D05～D13 | `\u`、`\x`、`%` 三组：位数多一位或少一位、只接受小写十六进制 |
| D14n～D14b | 字母转义集合缺 `n`、`t`、`r`、`f`、`b` 之一 |
| D18～D22 | 还原结果恒为空格；`%`、`\u` 按十进制解析 |
| D23n～D23b | 某个转义字母还原成它自己 |
| W01～W04 | 前驱窗口为 0、8、11 个字符；整个前文都还原 |
| L01～L05 | 层数上限 0、1、3；超过上限不报告；还原无变化时判为密钥起点 |
| B01～B06 | 单字符判定：数字不算、下划线算、连字符算、只算小写字母与数字、只算小写字母、任何字符都算 |
| C01～C11 | 候选：尾部 19、21、30 个字符；缺 `_`、缺 `-`、多收 `.`；前缀大写、缺连字符；只判第一个候选；每个候选都算密钥；删掉整个条目 |
| S01～S11 | `scanRun` 跳过 `.exe`、`.dll`、`.json`、`.txt`、`.log`、无扩展名文件；只读前 1024 字节、前 1 MiB；跳过隐藏文件、隐藏目录；删掉配置字面量检查 |

第一次运行时有 4 个存活：层数上限 3（用例没有“深层嵌套的字母不报告”）、以及 3 个对判定无影响的还原项（转义的反斜杠、引号、斜杠）。执行代理补了用例并删去这 3 个还原项，重跑 65 个全部被拦。

## 7. 不在范围

- 第六修复轮及之前的任何驱动、夹具、控制器、请求脚本改动。
- 已登记的 KL-1～KL-7。
- `bearer-token` 与 `private-key` 两条正则；p10 的 A02；p09 的报告验证器。
- 产品代码；Electron、PowerShell、Win7 行为（除第 4 节第 5 条的语法兼容依据）。
- 构建期载荷扫描的修改（本轮不改，只请你判断）。

## 执行代理实测记录

执行代理（开发机，Node 20.17.0）：

| 项 | 结果 |
|---|---|
| 交接包第 2 节四个代码块在全新目录整体运行 | 2026-10-14T15:01:12Z～15:08:16Z（424 秒），退出码 0；检出 `069c830c…`；`PATHS_MATCH`；统计 `20 files changed, 9578 insertions(+), 31 deletions(-)` 与 `2 files changed, 111 insertions(+), 8 deletions(-)` 与预期一致；`verify:quick` 通过；`node --test` 120 通过、0 失败；shell jest 218 通过；`docs:check` 338 个文件；`diff --check` 无输出；还原后 `status` 0 行；回放四行输出与第 2 节第四步的预期一致 |
| `tsc --noEmit`（`src/shell`，执行代理自测，不在交接命令里） | 退出码 0 |
| 变异 | 65 个全部被拦；变异后文件与备份逐字节相同（第一次运行 4 个存活，已补用例并删去 3 个冗余还原项后重跑） |
| 组合检验 | 156 种序列 × 25 个前驱字符，3900 个情形，0 个不符 |
| 随机性质检验 | 80 万个随机文本：命中必是旧无边界正则的命中，第 7 轮正则的命中一个不丢，与第一版无差异 |
| 耗时 | 157.6 MB 的 `electron.exe` 整个 `scanBytesForSecrets` 91～108 毫秒（纯字面量搜索 22 毫秒）；15 万个被拒绝的候选 4.35 MB：32 毫秒 |
| 回放 | 当前扫描器：取回的证据 229 个可扫描文件、0 个命中，正控检出；三个二进制 0 个命中。旧正则：11 个 JSON 文件、3 个二进制命中，合计 14，与 Win7 的 `g4-secret-scan.json` 一致 |
| 未执行 | 当前扫描器在 Electron 22、Win7 上运行与耗时 `NOT_PERFORMED`；80 个未取回的 `driver-electron` 文件的回放 `NOT_PERFORMED` |

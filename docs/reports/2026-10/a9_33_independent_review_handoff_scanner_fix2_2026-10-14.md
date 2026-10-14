# A9-33 独立审核交接包（第二个扫描器修复轮，2026-10-14，绑定修复提交 d6d11fb5…）

本包供 codex 对 A9-33 第二个扫描器修复轮的提交 `d6d11fb50b7a6c829f41d08d7144b1fbef078d86` 做窄范围复核。
本轮输入是 codex 第 7 轮报告（0 个 P0、1 个 P1、1 个 P2，见 [A9-33 §6.37](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#637-扫描器修复轮的-codex-复核第-7-轮2026-10-14)）：新左边界使 JSON 转义和 `%20` 之后的密钥漏检（P1），三个变异存活（P2）。负责人于 2026-10-14 批准第二个修复轮并设停止规则（[§6.38](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#638-第二个扫描器修复轮2026-10-14)）。
证据层级：修复本身是开发机；修复后的扫描器没有在 Electron、Win7 上运行过，`NOT_PERFORMED`。对预演 8 证据的读取结论是“Win7 实机（预演，非验收证据）”。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由负责人决定是否登记。

停止规则（负责人裁决）：本轮若只剩 P2 及以下，执行代理登记 KL-7，不开第三个扫描器修复轮；若有 P0 或 P1，执行代理报告负责人裁决。请把每条发现的级别写准。

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
| 复核对象（代码） | `d6d11fb50b7a6c829f41d08d7144b1fbef078d86`。上一个被你复核的代码提交 `15b93e3b0deb7e3a9fa1caa6b094ddb6d530027a`。两者之间有两个代码提交：`b192007e55c680e2054d3cf6ceaa79d15daca4a9`（转义边界）和 `d6d11fb50b7a6c829f41d08d7144b1fbef078d86`（先匹配字面量，见第 3 节耗时说明）。本轮代码合计改 2 个文件，2 files changed, 74 insertions(+), 2 deletions(-) |
| 运行测试用的检出 | `4a6a3599e2ff86b067d1024a1c1e6c3d2cae72f8`。它与 `d6d11fb50b7a6c829f41d08d7144b1fbef078d86` 只差 `docs/` 下的文档（`docs/STATUS.md`、`docs/STATUS_LOG.md`、`docs/plans/A9_33_REHEARSAL_AND_EXECUTION_APPROVAL_DRAFT.md`、`docs/tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md`） |
| 上一轮复核报告 | `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-review/codex-stage2-round7-20261014/codex_final_report.md`（只读） |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 9475 insertions(+), 31 deletions(-)` |
| 任务书与合同 | [A9-33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §3、§6.1、§6.35～§6.38 |
| 保护边界 | 不得改动产品语义和旧取证组件。20 个路径之外的非 `docs/` 文件必须没有差异。本轮只改 `release/win7-product-v3/a9-batch2-smoke.cjs` 和 `src/shell/tests/product/a9-batch2-contract.test.ts` |

必须从提交取得文件，不能拿工作区文档对照。

已知限制（不得再列为发现）：KL-1、KL-2（见 §6.13）；KL-3（产品缺口：启动后台进程的 Turn 结束后渲染层不再刷新）；KL-4（[§6.24](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md)）；KL-5（[§6.27](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#627-第四修复轮裁决与-kl-52026-10-14)）；KL-6（[§6.33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#633-第七修复轮裁决-b-与-kl-62026-10-14)）。本轮不复核第六修复轮及之前的任何内容。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d "$PWD/review.XXXXXX")
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q 4a6a3599e2ff86b067d1024a1c1e6c3d2cae72f8
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

预期：`rev-parse` 输出 `4a6a3599e2ff86b067d1024a1c1e6c3d2cae72f8`。

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
git -c core.fsmonitor=false diff --name-only 15b93e3b0deb7e3a9fa1caa6b094ddb6d530027a d6d11fb50b7a6c829f41d08d7144b1fbef078d86 -- release scripts src
git -c core.fsmonitor=false diff --shortstat 15b93e3b0deb7e3a9fa1caa6b094ddb6d530027a d6d11fb50b7a6c829f41d08d7144b1fbef078d86 -- release scripts src
git -c core.fsmonitor=false diff --name-only d6d11fb50b7a6c829f41d08d7144b1fbef078d86 HEAD
```

预期：输出 `PATHS_MATCH`；下一条统计为 `20 files changed, 9475 insertions(+), 31 deletions(-)`；第三条列出且只列出 `release/win7-product-v3/a9-batch2-smoke.cjs`、`src/shell/tests/product/a9-batch2-contract.test.ts`；第四条为 `2 files changed, 74 insertions(+), 2 deletions(-)`；最后一条只列出 `docs/` 下的 4 个文件（`docs/STATUS.md`、`docs/STATUS_LOG.md`、`docs/plans/A9_33_REHEARSAL_AND_EXECUTION_APPROVAL_DRAFT.md`、`docs/tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md`）。清单与改动路径有任何差异，即为 P0：提交越过了 §6.1 的白名单。

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
| shell jest | 2 个套件、218 个用例通过（contract 175、package-runtime 43；执行代理在无沙箱环境实测）。若你的沙箱禁止回环监听，会有 7 个既有用例因 `listen EPERM 127.0.0.1` 失败；请逐个列出用例名，不要与产品缺陷混写。本轮新增的 1 个用例只用临时目录，不需要回环监听 |
| 还原后 `status` 行数 | 0 |
| `docs:check` | `ok`，该提交的内容为 337 个文件 |
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

## 3. 第七轮发现与本轮修复

| 第七轮发现 | 本轮处理 |
|---|---|
| N1（P1）：`(?<![A-Za-z0-9])` 按原始字节判前驱，JSON 里的 `\n \t \r \f \b \u0000` 与 URL 的 `%20` 之后的密钥被排除，p10 误通过 | 字母或数字作前驱时，只有当它是完整转义的最后一个字符才仍判命中：`\n`、`\t`、`\r`、`\f`、`\b`、`\uXXXX`、`\xXX`、`%XX`。其他字母数字前驱仍不命中，任务编号和符号名仍被排除 |
| N2（P2）：三个存活变异（尾部字符集删 `_`；删 `-`；`scanRun` 跳过 `.exe`） | 新用例补：主体含 `_`、`-` 的密钥命中，含 `.` 的不命中；`scanRun` 对 `.exe`、`.dll`、`.json`、`.txt`、无扩展名文件不跳过 |

耗时问题（执行代理自己发现，不是第七轮发现）：第一版（`b192007e…`）把前驱断言写在字面量 `sk-` 之前。执行代理在开发机对 157.6 MB 的 `electron.exe` 实测：旧正则 23 毫秒，第一版 1593 毫秒（约 70 倍）。p10 在 Win7 上会扫这个文件。`d6d11fb5…` 改写为先匹配字面量，再用后行断言检查前驱：同一文件 22 毫秒。两种写法在 40 万和 60 万个随机文本上逐项一致，0 个差异。新用例加了耗时断言（不超过纯字面量搜索的 10 倍加 100 毫秒，取三次最快值）。

当前的 `api-key-prefix` 正则（`a9-batch2-smoke.cjs` 的 `SECRET_PATTERNS`）：字面量 `sk-`，后接五个备选后行断言之一（单个非字母数字前驱；`\` 加 `n t r f b`；`\u` 加四位十六进制；`\x` 加两位十六进制；`%` 加两位十六进制），再接至少 20 个 `[A-Za-z0-9_-]`。

证据路径（只读）：`/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-8/`，其中 `RUN_LOG.md` 是过程记录，`r7/evidence/requests/10-p10-postflight/g4-secret-scan.json` 是扫描结果，`r7/evidence/` 是取回的 245 个文件（83 个 `driver-electron` 文件未取回，只有 Win7 端哈希，见 `r7/evidence-sums-final.txt`）。预演 8 的 14 个命中（11 个 JSON 文件里的任务编号，3 个 Electron 二进制里的 Vulkan 符号名）的根因和你第七轮的复算一致，本轮不再重复。

## 4. 请重点复核

1. 转义枚举是否完整。列出 `release/win7-product-v3`、`src/shell/tests/product` 下每一个把文本写入证据文件的写入者（`JSON.stringify`、`util.inspect`、字符串拼接、PowerShell 控制器），判断它们能产生的“字母或数字结尾的转义”是否都在枚举内。执行代理在 Node 20.17.0 上核对的结论是：`JSON.stringify` 写 `\n \t \r \f \b \uXXXX`，`util.inspect` 写 `\n \t \r \f \b \xXX`，`encodeURIComponent` 写 `%XX`；`\v`、`\0`、`\a`、八进制、`\u{…}` 不在输出里。请独立复核，并检查控制器的 `.ps1` 写 JSON 或日志的方式（PowerShell 的转义不同于 Node，例如 `'`、`<`）。
2. 构造至少 8 种序列化或编码形态（含你第七轮没用过的），逐个列出输入与扫描结果，判断仍有无漏检。
3. 误报风险：放宽前驱后，任务编号、符号名、Windows 路径（含 `\t`、`\n`、`\b` 开头的目录名）、哈希、base64 片段是否会在证据或 Electron 二进制里重新命中。预演 8 证据的回放结果是 0 个命中；请判断这是否足以覆盖 Win7 上未取回的 80 个 `driver-electron` 文件（新正则相对旧正则只加了前驱条件，因此命中集合应为旧正则的子集，请核对）。
4. 等价性与耗时：第一版与当前写法是否对所有输入等价（特别是嵌套后行断言 `(?<=(?<![A-Za-z0-9])sk-)` 的含义）。耗时断言是否稳定、是否会在沙箱里偶发失败。
5. 语法兼容：后行断言需要 V8 ≥ 6.2，嵌套后行断言与备选后行断言是否在 Electron 22（V8 10.8，Node 16.17.1）有已知问题；只写你能从仓库内文件或已有知识确认的依据，其余写 `UNKNOWN`。`a9-batch2-smoke.cjs` 被 p01、p03～p08、p10 共八个阶段加载，语法错误会使这些阶段在入口前中止。
6. 测试质量：新用例是否真的区分各个备选分支；闭包是否仍有对正则或 `scanRun` 的盲点（交接包第 6 节的 45 个变异之外，你另试 3 个以上）。
7. 同类缺陷扫描：`release`、`scripts`、`src/shell/tests/product` 下是否还有对证据或 Electron 运行时副本做无边界 `sk-` 匹配的代码。构建期载荷扫描 `scripts/release/build-a9-product-v3.mjs:2371` 使用同一无边界正则，本轮没有改（任务书和交接包不写形态匹配它的字面量）。
8. 旧问题（不算新发现，除非你判断本轮使其变严重）：`scanBytesForSecrets` 把字节按 `latin1` 解码，UTF-16 编码和 base64 编码的文本里的 `sk-…` 不会被看到；`scanRun` 把 `driver-electron` 也扫入证据。

## 5. 假设

| 编号 | 假设 | 执行代理的依据（你须独立核对） |
|---|---|---|
| 55 | 第七轮 N1 的各种转义形态在当前写法下命中 | 新用例覆盖七种 JSON 控制字符转义、双重转义、十三种前驱形态；独立探针 23 个情形 0 个不符 |
| 56 | 当前写法与第一版（`b192007e…`）逐项等价 | 60 万个随机文本 0 个差异（脚本在执行代理的临时目录，未入库） |
| 57 | 预演 8 的 14 个误报在当前写法下仍是 0 | 回放：取回的证据 229 个文件 0 个命中，三个二进制 0 个命中 |
| 58 | 当前写法在 157.6 MB 的 `electron.exe` 上的耗时与旧正则同量级 | 开发机实测 22 毫秒对 23 毫秒；Win7 耗时 `UNKNOWN` |
| 59 | `\v`、`\0`、`\a`、八进制、`\u{…}` 不是本套件写入者的输出形态 | 开发机 Node 20.17.0 实测三种序列化器；控制器 `.ps1` 的写法由你核对 |
| 60 | 修复后 p10 在 Win7 通过 | `UNKNOWN`；A02（残留进程）在预演 8 通过，A01 的结果取决于下一次 Win7 运行 |

## 6. 反例

执行代理对 `a9-batch2-smoke.cjs` 做了 45 个变异，逐个跑 `-t "secret|api-key-prefix"`，全部被至少 1 个用例拦住；变异后均已还原，并与备份逐字节核对相同。请在你自己的 review 目录内重做，并另试 3 个以上；完成后恢复并核对哈希。

| 组 | 变异 |
|---|---|
| M01～M02 | 去掉前驱判断（第 7 轮前的旧正则）；只保留单个非字母数字前驱（`15b93e3b…`） |
| M03～M06 | 分别删去 `\n…` 组、`\u` 组、`\x` 组、`%` 组 |
| M07～M13 | 字母转义集合缺 `b`、`n`、`t`、`r`、`f` 之一；去掉反斜杠；接受反斜杠加任意字母 |
| M14～M25 | `\u`、`\x`、`%` 三组：位数多一位或少一位、只接受小写十六进制、去掉反斜杠或百分号 |
| M26～M30 | 单个前驱组：数字不算、下划线算、连字符算、只算小写字母与数字、只算小写字母 |
| M31～M36 | 密钥主体：缺 `_`、缺 `-`、多收 `.`；长度下限 19、21、30 |
| M37 | 删掉整个 `api-key-prefix` 条目 |
| M38～M42 | `scanRun` 跳过 `.exe`、`.dll`、`.json`、`.txt`、`.log` |
| M43 | 前驱断言写在字面量之前（第一版的慢写法） |
| M44～M45 | 字面量前缀改为大写、去掉连字符 |

## 7. 不在范围

- 第六修复轮及之前的任何驱动、夹具、控制器、请求脚本改动。
- 已登记的 KL-1～KL-6。
- `bearer-token` 与 `private-key` 两条正则；p10 的 A02；p09 的报告验证器。
- 产品代码；Electron、PowerShell、Win7 行为（除第 4 节第 5 条的语法兼容依据）。
- 构建期载荷扫描的修改（本轮不改，只请你判断）。

## 执行代理实测记录

执行代理（开发机，Node 20.17.0）：

| 项 | 结果 |
|---|---|
| 交接包第 2 节四个代码块在全新目录整体运行 | 2026-10-14T14:05:50Z～14:12:28Z（398 秒），退出码 0；检出 `4a6a3599…`；`PATHS_MATCH`；统计 `20 files changed, 9475 insertions(+), 31 deletions(-)` 与 `2 files changed, 74 insertions(+), 2 deletions(-)` 与预期一致；`verify:quick` 通过；`node --test` 120 通过、0 失败；shell jest 218 通过；`docs:check` 337 个文件；`diff --check` 无输出；还原后 `status` 0 行；回放四行输出与第 2 节第四步的预期一致 |
| `tsc --noEmit`（`src/shell`，执行代理自测，不在交接命令里） | 退出码 0 |
| 变异 | 45 个全部被拦；变异后文件与备份逐字节相同 |
| 随机等价检验 | 当前写法对第一版（`b192007e…`）：60 万个随机文本，7316 个命中，0 个差异。脚本在执行代理的临时目录，未入库 |
| 耗时 | 157.6 MB 的 `electron.exe`：旧正则 23 毫秒，第一版 1593 毫秒，当前写法 22 毫秒（开发机，Node 20.17.0，Apple 硬件）。新用例的耗时断言连跑 3 次稳定 |
| 回放 | 当前扫描器：取回的证据 229 个可扫描文件、0 个命中，正控检出；三个二进制 0 个命中。旧正则：11 个 JSON 文件、3 个二进制命中，合计 14，与 Win7 的 `g4-secret-scan.json` 一致 |
| 未执行 | 当前扫描器在 Electron 22、Win7 上运行与耗时 `NOT_PERFORMED`；80 个未取回的 `driver-electron` 文件的回放 `NOT_PERFORMED` |

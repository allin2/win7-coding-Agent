# A9-33 独立审核交接包（预演 8 的 p10 扫描器修复，2026-10-14，绑定修复提交 15b93e3b…）

本包供 codex 对 A9-33 扫描器修复轮的提交 `15b93e3b0deb7e3a9fa1caa6b094ddb6d530027a` 做窄范围复核。
本轮输入是预演 8（Win7 实机）的结果：p01～p09 通过，p10 的秘密扫描 `FAIL`（`SECRET_FOUND`，14 个文件命中），执行代理在开发机核对为全部误报。负责人于 2026-10-14 批准本修复轮、复核和第 9 次预演（[A9-33 §6.36](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#636-扫描器修复轮与第-9-次预演裁决2026-10-14)）。预演 8 的执行与分类见 [§6.35](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#635-预演-8-执行记录与-p10-失败分类2026-10-14)。
证据层级：修复本身是开发机；修复后的扫描器没有在 Electron、Win7 上运行过，`NOT_PERFORMED`。对预演 8 证据的读取结论是“Win7 实机（预演，非验收证据）”。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由负责人决定是否登记。

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
| 复核对象（代码） | `15b93e3b0deb7e3a9fa1caa6b094ddb6d530027a`。上一个被你复核的代码提交 `1a2bd02f65d558381458cc750577cb6b2c2b5fbc`；两者之间的提交 `60d0d95c…`、`ccf3cb7…` 只改 `docs/`。本轮代码改 2 个文件，37 行新增、1 行删除 |
| 运行测试用的检出 | `7ea9acb0b11716d418fb24656206276cc9e512c2`。它与 `15b93e3b…` 的差异只有 `docs/tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md` 的两处文字：`ccf3cb7…` 的任务书引用了一个任务编号和一个 Vulkan 符号名，其形态匹配构建期的载荷扫描，使打包的任务书副本被拒绝，4 个包测试失败（`A9_SENSITIVE_PAYLOAD_PROHIBITED`）。`7ea9acb0…` 把两处改成文字描述。在 `15b93e3b…` 上直接跑包测试会看到这 4 个失败，这不是代码问题 |
| 上一轮复核报告 | `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-review/codex-stage2-round6-20261014/codex_final_report.md`（只读） |
| 累计范围 | 相对 `7e96f561…`，`release`、`scripts`、`src` 下的改动路径必须仍是 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径；统计 `20 files changed, 9403 insertions(+), 31 deletions(-)` |
| 任务书与合同 | [A9-33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §3、§6.1、§6.35、§6.36 |
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
git -c core.fsmonitor=false -C "$REVIEW_DIR" checkout -q 7ea9acb0b11716d418fb24656206276cc9e512c2
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

预期：`rev-parse` 输出 `7ea9acb0b11716d418fb24656206276cc9e512c2`。

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
git -c core.fsmonitor=false diff --name-only 1a2bd02f65d558381458cc750577cb6b2c2b5fbc 15b93e3b0deb7e3a9fa1caa6b094ddb6d530027a -- release scripts src
git -c core.fsmonitor=false diff --shortstat 1a2bd02f65d558381458cc750577cb6b2c2b5fbc 15b93e3b0deb7e3a9fa1caa6b094ddb6d530027a -- release scripts src
git -c core.fsmonitor=false diff --name-only 15b93e3b0deb7e3a9fa1caa6b094ddb6d530027a HEAD
git -c core.fsmonitor=false diff 15b93e3b0deb7e3a9fa1caa6b094ddb6d530027a HEAD -- docs
```

预期：输出 `PATHS_MATCH`；下一条统计为 `20 files changed, 9403 insertions(+), 31 deletions(-)`；第三条列出且只列出 `release/win7-product-v3/a9-batch2-smoke.cjs`、`src/shell/tests/product/a9-batch2-contract.test.ts`；第四条为 `2 files changed, 37 insertions(+), 1 deletion(-)`；第五条只列出任务书一个文件；最后一条是两处文字替换。清单与改动路径有任何差异，即为 P0：提交越过了 §6.1 的白名单。

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
| shell jest | 2 个套件、217 个用例通过（contract 174、package-runtime 43；执行代理在无沙箱环境实测）。若你的沙箱禁止回环监听，会有 7 个既有用例因 `listen EPERM 127.0.0.1` 失败；请逐个列出用例名，不要与产品缺陷混写。本轮新增的 1 个用例只用临时目录，不需要回环监听 |
| 还原后 `status` 行数 | 0 |
| `docs:check` | `ok`，该提交的内容为 336 个文件 |
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

## 3. 预演 8 的 p10 失败与本轮修复

证据路径（只读）：`/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-8/`，其中 `RUN_LOG.md` 是过程记录，`r7/evidence/requests/10-p10-postflight/g4-secret-scan.json` 是扫描结果，`r7/evidence/` 是取回的 245 个文件（83 个 `driver-electron` 文件未取回，只有 Win7 端哈希，见 `r7/evidence-sums-final.txt`）。

| 事实 | 内容 |
|---|---|
| Win7 扫描结果 | `files_scanned=250; findings=14; positive_control_detected=true`；14 个文件都只有 `api-key-prefix` |
| 11 个 JSON 文件，17 处 | 任务编号 `task-<13 位数字>-<6 位>` 中的 `sk-…`，前一字符是 `a`；`sk-` 之后正好 20 个字符 |
| 3 个 `driver-electron` 二进制，23 处 | `electron.exe`、`vk_swiftshader.dll`、`vulkan-1.dll` 里的 Vulkan 符号名；三个文件与本机 Electron ZIP 同名条目的大小和 SHA-256 相同 |
| 配置密钥 | `configured-secret-literal` 与 `bearer-token` 无命中；`sk-TESTONLY` 在 245 个取回文件中 0 个文件命中 |
| 根因 | `a9-batch2-smoke.cjs` 的 `api-key-prefix` 正则 `sk-[A-Za-z0-9_-]{20,}` 没有左边界 |

修复：`release/win7-product-v3/a9-batch2-smoke.cjs` 的该正则改为 `/(?<![A-Za-z0-9])sk-[A-Za-z0-9_-]{20,}/`；`a9-batch2-contract.test.ts` 新增 1 个用例。扫描遍历（`scanRun`）、其他正则、正控、哈希清单都没有改。

## 4. 请重点复核

1. 左边界的取舍：字母和数字作前驱时不命中；下划线、连字符、引号、等号、冒号、空白、NUL、高位字节作前驱仍命中。判断这是否会漏掉真实的密钥形态（例如 JSON 值、URL 查询串、环境变量赋值、`Bearer` 之后），并列出你试过的形态。
2. 新正则是旧正则的子集（只多了一个否定前瞻限制）。确认在任何输入上，新正则的命中集合都包含于旧正则的命中集合，因此 Win7 上那 80 个未取回的 `driver-electron` 文件（旧正则已无命中）在新正则下也无命中。
3. 语法兼容：`(?<!…)` 后行断言需要 V8 ≥ 6.2。Win7 上扫描器由候选的 `electron.exe` 以 `ELECTRON_RUN_AS_NODE` 运行（Electron 22.3.27，Node 16.17.1，ABI 110）。你的依据是什么？该语法在 Win7 的实际编译 `UNKNOWN`，要等第 9 次预演；`a9-batch2-smoke.cjs` 被每个阶段加载还是只被 p10 加载？请从源码确认，并说明语法错误会造成的影响范围。
4. 测试质量：新用例是否真的区分“有左边界”和“无左边界”；闭包是否仍有对正则的盲点（交接包第 6 节的 14 个变异之外，你另试 3 个以上）。
5. 同类缺陷扫描：`release`、`scripts`、`src/shell/tests/product` 下是否还有对证据或 Electron 运行时副本做无边界 `sk-` 匹配的代码？已知的构建期载荷扫描 `scripts/release/build-a9-product-v3.mjs:2371` 使用同一无边界正则，但它扫描的是包内文本（排除 `.exe`、`.dll`、`.node`、`.pak`、`.bin`、`.dat`、`.png`、`.ico`），本轮没有改。判断它是否会在 Win7 证据以外造成误报，以及它拒绝了 `ccf3cb7…` 的任务书是否合理。
6. 扫描范围：`scanRun` 把 `driver-electron`（Electron 运行时副本）也扫入证据。本轮没有把它排除。判断保留是否合理，以及是否有未经授权缩小覆盖的风险。
7. 编码盲点（旧问题，不算新发现，除非你判断本轮使其变严重）：`scanBytesForSecrets` 把字节按 `latin1` 解码，UTF-16 编码的文本里的 `sk-…` 不会被看到。

## 5. 假设

| 编号 | 假设 | 执行代理的依据（你须独立核对） |
|---|---|---|
| 50 | 预演 8 的 14 个命中都是无左边界造成的误报 | 回放：旧正则在取回的证据里命中 11 个文件，在 3 个二进制里命中 3 个；新正则两处都是 0 |
| 51 | 新正则对 Win7 上未取回的其余 `driver-electron` 文件无命中 | 新正则是旧正则的子集，旧正则在 Win7 对这些文件无命中；未回放 |
| 52 | 新正则仍能发现配置的测试密钥形态 | 用例覆盖空白、引号、等号、冒号、换行、NUL、`Bearer `、`key_`、`x-`、缓冲区开头、高位字节前驱；`sk-` 之后 20 个字符命中、19 个不命中 |
| 53 | Electron 22（Node 16.17.1）能编译 `(?<!…)` | V8 10.x 支持；未在 Win7 运行，`UNKNOWN` |
| 54 | 修复后 p10 在 Win7 通过 | `UNKNOWN`；A02（残留进程）在预演 8 通过，A01 的结果取决于下一次 Win7 运行 |

## 6. 反例

执行代理对 `a9-batch2-smoke.cjs` 做了 14 个变异，逐个跑 `-t "secret|api-key-prefix"`，全部被至少 1 个用例拦住；变异后均已还原，并与备份逐字节核对相同。请在你自己的 review 目录内重做，并另试 3 个以上；完成后恢复并核对哈希。

| 变异 | 改动 |
|---|---|
| V1 | 去掉左边界（旧正则） |
| V2 | 数字不算边界字符 `(?<![A-Za-z])` |
| V3 | 下划线算边界字符 |
| V4 | 连字符算边界字符 |
| V5 | 用 `\b` 代替后行断言 |
| V6 | 只有小写字母算边界字符 |
| V7 | 大写字母不算边界字符 |
| V8 | 只有字母 `a` 算边界字符 |
| V9 | 删掉整个 `api-key-prefix` 条目 |
| V10 | 长度下限改为 30 |
| V11 | 长度下限改为 19 |
| V12 | 长度下限改为 21 |
| V13 | `scanRun` 跳过 `.json` |
| V14 | `scanRun` 跳过 `.dll` |

## 7. 不在范围

- 第六修复轮及之前的任何驱动、夹具、控制器、请求脚本改动。
- 已登记的 KL-1～KL-6。
- `bearer-token` 与 `private-key` 两条正则；p10 的 A02；p09 的报告验证器。
- 产品代码；Electron、PowerShell、Win7 行为（除第 4 节第 3 条的语法兼容依据）。
- 构建期载荷扫描的修改（本轮不改，只请你判断）。

## 执行代理实测记录

执行代理（开发机，Node 20.17.0）：

| 项 | 结果 |
|---|---|
| 交接包第 2 节四个代码块在全新目录整体运行 | 2026-10-14T12:41:04Z～12:48:02Z（418 秒），退出码 0；`PATHS_MATCH`；统计与预期一致；`verify:quick` 通过；`node --test` 120 通过、0 失败；shell jest 217 通过；`docs:check` 336 个文件；`diff --check` 无输出；还原后 `status` 0 行；回放四行输出与第 2 节第四步的预期一致 |
| 在 `15b93e3b…`（任务书未改词）上跑包测试 | 4 个失败，错误均为 `A9_SENSITIVE_PAYLOAD_PROHIBITED:evidence/contracts/A9_33_BATCH_2_WIN7_ACCEPTANCE.md`；原因是任务书引用了形态匹配构建期载荷扫描的字面量；改词提交 `7ea9acb0…` 后 120 通过 |
| `tsc --noEmit`（`src/shell`，执行代理自测，不在交接命令里） | 退出码 0 |
| 变异 | 14 个全部被拦；变异后文件与备份逐字节相同 |
| 回放 | 修复后的扫描器：取回的证据 229 个可扫描文件、0 个命中，正控检出；3 个二进制 0 个命中。旧正则：11 个 JSON 文件、3 个二进制命中，合计 14，与 Win7 的 `g4-secret-scan.json` 一致 |
| 未执行 | 修复后的扫描器在 Electron 22、Win7 上运行 `NOT_PERFORMED`；80 个未取回的 `driver-electron` 文件的回放 `NOT_PERFORMED` |

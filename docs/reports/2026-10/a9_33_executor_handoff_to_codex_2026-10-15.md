# A9-33 执行交接书（交给 codex 接续，2026-10-15，绑定代码提交 3d152545…）

结论：接续点是“第 17 轮独立复核尚未启动”。代码修复已在本地提交 `3d152545772e07efd54e0d4e06d6982a532c0abb`，未推送。Alpha 2 目标（第二批执行能力 Win7 PASS）`NOT_PERFORMED`，剩余步骤见第 4 节。
证据层级：本书所有结论是开发机（macOS，Node 20.17.0）。WIN7-45 没有在 Win10 验收机或 Win7 实机运行过。
负责人 2026-10-15 要求执行代理停手并写交接书，后续由负责人指派的 codex 接续；回复时间戳 `UNKNOWN`。本书是事实陈述，不是批准，不签任何关口。

## 1. 角色与独立性

| 角色 | 谁 | 约束 |
|---|---|---|
| 接续执行者 | 负责人指派的 codex | 修复、构建、预演、写记录。不得自评自己的修复 |
| 独立复核者 | 另开的新 codex 会话 | 不带执行者上下文，不是实现方，只读复核，向负责人报告 |
| 关口 A、关口 B | 负责人 | 只有负责人能签；执行代理不得代签 |

## 2. 状态一览

| 项 | 状态 | 绑定 |
|---|---|---|
| 代码 | 修复已本地提交，未推送 | `3d152545…` |
| codex 第 16 轮复核 | 完成：0 P0、2 P1、3 P2，已全部修复 | 对象 `fe0cc135…`，报告 `fc5f21e6…` |
| codex 第 17 轮复核 | `NOT_PERFORMED` | 交接包已写好 |
| 候选 WIN7-45 构建 | `NOT_PERFORMED` | — |
| Win7 预演（WIN7-45） | 0 次；需要 2 次连续成功 | — |
| 双干净构建与冻结 | `NOT_PERFORMED` | — |
| 关口 A（WIN7-45） | `NOT_PERFORMED`。旧候选 WIN7-43 的关口 A 不适用 | — |
| 正式运行、第三阶段复核、关口 B | `NOT_PERFORMED` | — |
| 推送、ADR-0155、A9-32 `DEVELOPER_VERIFIED` | 均未做，只有负责人能决定 | — |

旧候选 WIN7-43（源提交 `63c6d426…`）的正式运行在 Win7 实机 10 个阶段全 PASS，但 `B2-BG-03-STOP-RELEASE-EXIT-A01` 的 PASS 没有覆盖“ready 失败清理”和“release 结束 ownership”（任务书 §6.55）。负责人选 A′（修复后重走，§6.56）。WIN7-43 的证据原样保留，不作为 Alpha 2 依据。

## 3. 仓库与路径

| 对象 | 位置 |
|---|---|
| 工作树 | `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent`，分支 `codex/a9-33-batch2-win7-acceptance`，本地 |
| 主工作区 | `/Users/qlyf/Developer/win7-coding-Agent`（`node_modules`、旧候选、Win7 SSH 目录都在这里） |
| 旧候选 WIN7-43 | 主工作区 `.acceptance/candidates/WIN7-43/`，只读 |
| 旧正式运行证据 | 主工作区 `.acceptance/runs/A9-33-W43/7af65f2d-770c-484b-bd40-7861935ed86f/` |
| 预演记录与包 | 工作树 `.acceptance/a9-33-rehearsal/`（`builds/`、`rehearsal-N/`；`rehearsal-13/RUN_LOG.md` 是最近的完整样例） |
| codex 复核归档 | 工作树 `.acceptance/a9-33-review/`；第 16 轮在 `codex-fix-bg03-20261015/`（含提示词模板与启动脚本） |
| 临时脚本备份 | 工作树 `.acceptance/a9-33-scratch-backup-20261014/`（Win7 步骤、授权生成、粘合文件）与 `…-20261015/`（变异、未定义名字检查、交接模板） |
| 任务书 | `docs/tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md`，最新记录 §6.59 |
| 状态 | `docs/STATUS.md`、`docs/STATUS_LOG.md` |

`.acceptance/` 被 git 忽略；其中的文件只在这台机器上。

提交链（本地，自 §6.56 起）：

| 提交 | 内容 |
|---|---|
| `6c8b7eae…` | BG-03 修复本体，16 个文件（§6.57） |
| `60cbe430…`、`310c4153…`、`fe0cc135…` | 补测试，抽出纯函数 `exitDialogFacts` |
| `db665710…` | 文档：§6.58 与第 16 轮复核交接包 |
| `3d152545…` | 代码：第 16 轮 2 个 P1 与 3 个 P2 的修复 |
| 本书所在的提交 | 文档：§6.59、状态、第 17 轮交接包、本书 |

## 4. 剩余步骤

### 步骤 A：第 17 轮独立复核

1. 另开新 codex 会话作为复核者，不用接续执行者的会话。
2. 复核者读 [第 17 轮交接包](a9_33_independent_review_handoff_bg03_release_fix2_2026-10-15.md)。
3. 以 `.acceptance/a9-33-review/codex-fix-bg03-20261015/codex_prompt_round16.txt` 为模板写新提示词：对象改为 `3d152545…`，上一轮提交改为 `fe0cc135…`，交接包改为第 17 轮包，复核根改为 `/private/tmp/a9-33-codex-review-root-23`，报告增加“第 16 轮 5 条发现是否关闭”。
4. 以同目录 `launch_codex21.sh` 为模板写启动脚本，前缀改为 `codex22_`，后台运行。调用格式：`codex exec --skip-git-repo-check -s workspace-write -C <根> -m gpt-6.1-sol -c model_reasoning_effort='"xhigh"' -c service_tier='"default"' --json -o <根>/codex_final_report.md - < 提示词`。
5. 读完报告后，执行者逐条对照源码核实，再分级处理。
6. 归档报告、事件流、脚本到 `.acceptance/a9-33-review/codex-<标签>/`，写 `SHA256SUMS.txt`。

处理规则（负责人 2026-10-14 裁决，原话见任务书 §6.39）：有 P0 或 P1 时直接修复并送 codex 复审，修复无需审批；只剩 P2 及以下时登记已知限制（下一个编号 KL-13，登记在 `a9-batch2-fixtures.cjs` 的 `KNOWN_LIMITS` 与 `A9_BATCH2_WIN7_VALIDATION.md`），再进入步骤 B。

### 步骤 B：重建候选 WIN7-45 并预演

前置：步骤 A 的结论是 0 个 P0、0 个 P1。

1. 在通过包测试的文档提交上构建，命令如下：

```sh
node scripts/release/build-a9-product-v3.mjs --formal-input-lock release/win7-product-v3/a9-batch2-input-lock.json --electron-zip /Users/qlyf/Developer/win7-coding-Agent/.acceptance/deps/electron/electron-v22.3.27-win32-x64.zip --runner-zip /Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/native-kit-r3/return-BuildA/WIN7_D013_V26_HELPER_ARTIFACTS_20261003-060935.zip --storage-zip /Users/qlyf/Developer/win7-coding-Agent/.acceptance/deps/a6/WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip --output .acceptance/a9-33-rehearsal/builds/rehearsal-<N>
```

2. 生成预演授权文件。脚本是备份目录里的 `gen_authority_n.py`，调用 `python3 gen_authority_n.py <N> <上一次预演号> <源提交>`。
3. 先更新输入锁的哈希，再继续。输入锁 `a9-batch2-input-lock.json` 在 WIN7-45 的内容已变（候选号从 WIN7-43 改为 WIN7-45），SHA-256 前 12 位由 `f22f91c8ae45` 变为 `1fdbf1ae73e0`。`gen_authority_n.py` 从上一次预演复制授权文件和锁，不会更新 `formal_input_lock_sha256`，也不会换掉 `rehearsal-<N>/external/a9-batch2-input-lock.json`。不更新会让完整性检查失败（`a9-batch2-package-integrity.cjs:186`）。把授权文件里的该字段改为仓库锁文件的 SHA-256，并把仓库锁文件复制到 `rehearsal-<N>/external/`。这一步是否足够，`UNKNOWN`，以开发机干跑完整性脚本的结果为准。
4. 生成粘合文件。脚本是备份目录里的 `gen_glue.py`，用环境变量 `REH=<N>` 指定预演号；不设会按默认值 1 改写 `rehearsal-1/glue/`（预演 11 的失误记录）。
5. 在开发机干跑完整性脚本，读结果。`B2PKG-RUNTIME-ABI FAIL`（Node ABI 与 Electron 不同）是预期，其余应为 PASS。
6. 按 `rehearsal-13/RUN_LOG.md` 的 R1～R8 执行 Win7 步骤。闭集动作定义在 `docs/plans/A9_33_REHEARSAL_AND_EXECUTION_APPROVAL_DRAFT.md` §4。
7. 连续 2 次成功才算预演通过；失败不算，计数归零。同一类失败连续两次，先写根因再继续。

Win7 脚本（`w7.sh`、`cycle13.sh`、`upload13.sh`、`run_phases13.sh`、`r1_13.sh`）把执行代理旧会话的临时目录写死在变量 `S` 里，并写死了预演 13 的运行号 `67452b1e` 与 ZIP 字节数。换新预演时，用 `sed` 替换这三处，再检查。

预算：请求上限 92，旧候选的预演已用 82。负责人 2026-10-14 裁决：预算满后再预演无需审批，直接增加上限。WIN7-45 每次常规预演消耗 10 个请求，按新的预演记录重新核算。

首次预演同时回答的 `UNKNOWN`：不存在的工作目录走哪条路径；被释放的命令是否存活；`handle.pid` 是否就是执行循环的进程；release 后 helper 是否继续存活；p05 总时长余量。结果写进预演记录。

### 步骤 C：冻结、关口 A、正式运行、复核、关口 B

1. 两个独立干净工作树各构建 1 次，比对字节相同（样例见任务书 §6.52、§6.53）。新工作树必须把主工作区各 `node_modules` 链接进去，否则构建失败。
2. 冻结候选：向负责人提问，用 W11 格式（问题、选项、影响、推荐、一句提问）。
3. 准备关口 A 材料：正式授权文件草案、角色、预算（1 次、不超过 16 个请求、不超过 7200 秒）、窗口规则。请负责人确认授权文件 SHA-256 并签发。执行代理不代签。
4. 关口 A 签发后做正式运行（R1～R8，失败不自动重跑）。
5. 另开 codex 做第三阶段（正式证据）复核。
6. 关口 B 只有负责人能签。

## 5. 必须遵守的约束

| 类别 | 内容 |
|---|---|
| 阅读 | 开工前读 `AGENTS.md`（§3 范围）、`docs/WIN7_CONSTRAINTS.md`、当前任务书；未读完不得改代码或文档 |
| 允许路径 | 实现文件只能改任务书 §6.1 的 20 个路径；不改产品代码；`verify:quick` 会重建 `src/runner/dist`，跑完用 `git restore src/runner/dist` |
| 禁止（无负责人授权） | 推送、合并、签关口 A 或 B、接受 ADR-0155、签 A9-32 `DEVELOPER_VERIFIED`、下载、使用 Win10、新建 ADR |
| Win7 动作 | 只做闭集 R1～R8：目标 `dccs-chaizl-PC`，账户 `agent`；不安装，不改系统或安全设置，不碰旧 Win7 根目录，不用真实 Provider |
| 机密 | 不读不输出 Win7 SSH 私钥（`.acceptance/ssh`）和 `~/.codex/auth.json`；文档里不写形似密钥的字面量 |
| 证据分级 | 开发机结果不得写成 Win7 通过；每个结论写证据层级与绑定提交（`docs/OUTPUT_STYLE.md` W06） |
| 矛盾 | 负责人指令、任务书、`AGENTS.md` 三者矛盾时，列清单等裁决，不自行取舍 |
| 提交 | 只做本地提交，提交信息末尾加该会话要求的署名行；UTF-8 无 BOM、LF；`.cmd` 保持 CRLF |
| 写作 | 给负责人的回复用受控中文（`docs/OUTPUT_STYLE.md` W01～W12，状态词见 `docs/GLOSSARY.md`）；先写结论；不用“基本、大概、应该可以”等模糊词 |
| 已知限制 | KL-3、KL-5、KL-6a、KL-7（边界 a、b、c）必须写进任何 Alpha 2 结论；KL-8～KL-12 是测试或读取边界，不强制携带 |

## 6. 待核实（`UNKNOWN`）

| 项 | 说明 |
|---|---|
| 输入锁哈希是否只需改授权文件与锁副本 | 见步骤 B 第 3 条，以干跑结果为准 |
| `handle.pid` 是否就是执行循环的进程 | 不在记录的进程树里时 A02 为 `UNKNOWN`；在树里但很快结束而后代继续运行时 A02 为 `FAIL`，须判断是产品行为还是套件假设错误 |
| 被释放的命令在 Win7 上是否存活 | A9-31 的 Win7 签字为空 |
| release 后 helper 是否继续存活 | 仍在候选目录下运行会计为产品残留 |
| 不存在的工作目录走哪条路径 | 三种路径都被记录；稳定为 `started` 时 A01 长期 `UNKNOWN`，须改制造方式或登记限制 |
| p05 总时长余量 | 各模式上限合计 1380 秒，计划任务时限 3 小时；请求有效期只在阶段开始时校验 |
| 套件按进程号终止被释放的命令是否属 R1～R8 闭集 | 执行代理认为与现有杂散进程清扫同类；负责人可裁决为不属闭集，那就要另请授权 |
| `sessionBg` 新流程与 `release_exit` 的 Electron 实际行为 | 开发机只有源码级断言和纯函数测试，`NOT_PERFORMED` |
| 预演时间窗 | 旧候选的窗口到 2026-10-16T06:59:59Z；WIN7-45 的窗口是否相同，`UNKNOWN`，向负责人确认 |

## 7. 需要负责人知悉

1. 新候选号是 WIN7-45，不是 WIN7-44。原因：[A9_ALPHA2_GAP_DISPOSITION.md](../../plans/A9_ALPHA2_GAP_DISPOSITION.md) 的 Q1 选项 B 已把 WIN7-44 暂定给 R 类候选。
2. 所有修复只在开发机。Win7 行为全部以首次预演为准。
3. 套件新增了“按进程号终止被释放的命令及其后代”的动作，见第 6 节第 7 项。

## 8. 工具与环境注意

| 项 | 说明 |
|---|---|
| Node | 仓库检查用 `/Users/qlyf/.nvm/versions/node/v20.17.0/bin`，并设 `NPM_CONFIG_OFFLINE=true`；codex 调用用 v22.23.1 的 `codex` |
| Jest | 命令后加 `--forceExit`，否则进程不退出；回环监听被沙箱禁止时，部分用例以 `EPERM` 失败，需单列为 `UNKNOWN`（沙箱） |
| 开发机检查 | `node --test scripts/release/test/a9-batch2-package.test.mjs scripts/release/test/a9-package.test.mjs`（约 6～8 分钟，120 个）；`npm test --workspace=@win7-agent/shell -- --runInBand --forceExit --runTestsByPath tests/product/a9-batch2-contract.test.ts tests/product/a9-package-runtime.test.ts`（268 个）；`npm run verify:quick`；`npm run docs:check`；`git -c core.whitespace=cr-at-eol diff --check` |
| 变异检验 | 脚本 `mutate_bg03_r2.py`（备份目录 `…-20261015/`），用独立检出运行。检出里先跑 `npm run verify:quick` 构建 `dist`，否则对真实运行时的两个用例在基线就失败，所有“被拦”都无效；脚本现在基线不干净就中止 |
| 未定义名字检查 | `undef_check.cjs`，必须传文件参数；不传参数时输出 0 个发现，没有意义。用注入拼写错误的负对照确认它有效 |
| macOS | `sed -i` 要写 `sed -i ''`；没有 `timeout` 命令；用 Python 文本模式改写 `.cmd` 会把 CRLF 变成 LF，包测试报 `A9_BATCH2_CMD_ENCODING_INVALID` |
| 复核根磁盘 | codex 复核根用 `export TMPDIR="$PWD/tmp"`，克隆用 `--no-hardlinks`，不用 `cp -R`；写报告前清理 `tmp`，复核根小于 3 GB |
| 并行变异 | 每个分片用独立检出；不要在主工作树里运行变异脚本，它会原地改文件 |

本书不签关口 A 或 B，不接受 ADR-0155，不签 A9-32 `DEVELOPER_VERIFIED`，不推送或合并，不创建 ADR。未在 Win7 验收通过。

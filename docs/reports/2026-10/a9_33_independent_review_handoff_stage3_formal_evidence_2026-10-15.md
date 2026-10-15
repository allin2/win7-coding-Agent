# A9-33 独立审核交接包（第三阶段：WIN7-43 正式运行证据，2026-10-15，绑定冻结候选 63c6d426…）

本包供 codex 做第三阶段复核：核对 WIN7-43 的一次正式 Win7 运行是否有原始证据支撑。
冻结候选：源提交 `63c6d4264f8bd2c0f0cb8e705a631f01b43f7c91`，ZIP SHA-256 `f7538c20e5400613f4d106a1d509f074075d5f8d95141a03fe308b86829589a7`。
正式运行：run `7af65f2d-770c-484b-bd40-7861935ed86f`，授权文件 SHA-256 `dc5b1608dae82f9f8b2b896f968aad286b7d8bc8417aede298a3c7f2a6228db0`，目标 `dccs-chaizl-PC`，账户 `agent`。
执行代理在 2026-10-15 的 02:02:22Z 至 02:12:37Z 完成 R1～R8，报告 10 个阶段、25 个用例、42 条断言全部 PASS。执行代理的登记在 [A9-33 §6.54](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#654-关口-a-签发与正式运行2026-10-15)。
证据层级：Win7 实机（正式运行，待独立复核）。本包是事实陈述和复核请求，不是批准，不签关口 B。未在 Win7 验收通过。

处理规则（与第二阶段不同）：候选已冻结，正式运行已消耗。若有 P0 或 P1，执行代理不自行修复、不自行重跑，先向负责人汇报；修复需要新的候选身份、新的关口 A 和新的请求预算。若只有 P2 及以下，执行代理登记已知限制，并把报告与证据交负责人签关口 B。请把每条发现的级别写准：不要为了让结论好看而降级，也不要为了凑数而升级。

## 0. 审核会话启动说明

审核者是负责人另开的新会话，不带执行代理的上下文，也不是实现方。执行代理既是正式执行者，又是本包作者，所以本包的解释句不作为证据，只作为待核对的陈述。
审核者只读第 1 节的候选和第 2 节的证据，在自己的空目录复算，向负责人报告。

禁止项：

1. 不连接 Win7、Win10 或任何远端，不联网下载，不启动 Electron 和任何 Windows 程序。
2. 不读取 `~/.codex/auth.json`、`.acceptance/ssh` 目录和任何私钥。
3. 不写原隔离树、主工作区和已有 `.acceptance`；不提交、不推送、不合并、不改 git 配置。
4. 证据里的数据库文件先 `cp` 到自己的目录，再用 `python3 -I` 的 `sqlite3` 模块打开。

目录纪律：先执行 `export TMPDIR="$PWD/tmp"`；写最终报告前清理自己根里的 `tmp`，使复核根占用小于 3 GB。

## 1. 对象与绑定

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送；本包所在 HEAD 是文档提交，代码与 `a6c689d5…` 相同 |
| 冻结源提交 | `63c6d4264f8bd2c0f0cb8e705a631f01b43f7c91`；与 `a6c689d5b59d10b2de9253f9f134940977b11974` 之间 `release`、`scripts`、`src` 无差异；相对 `7e96f561d3ac51e832a56928118209e604d7f2a0` 仍是 [§6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的 20 个路径，`20 files changed, 10597 insertions(+), 31 deletions(-)` |
| ZIP | `Win7CodingAgent-0.3.0-alpha.2-win7-x64.zip`，`f7538c20…`，101645206 字节，800 个条目；与预演 12、13 的 ZIP 逐字节相同 |
| manifest / Kit | `495e762d…` / `2ca56ed7…`（25 个用例、42 条断言）；manifest 里 `candidate_tentative` 为 `true`（暂定标签，未占用正式身份） |
| 输入锁 / 批准登记 | `f22f91c8…` / `de75a450…`（登记提交 `dcf541892ec3ee5f5413833206f07efa3f3ee6e2`） |
| 正式授权文件 | `dc5b1608…`；`status` 为 `APPROVED_FOR_WIN7_43_VALIDATION`；内含 `authorization` 块（预算 1 次运行、≤16 个请求、≤7200 秒；有效期自负责人确认哈希起 8 小时） |
| 关口 A 回执 | `GATE_A_RECEIPT.json`：记录时刻 2026-10-15T02:01:45Z，有效至 10:01:45Z；负责人回复时间戳 `UNKNOWN`；授权块内 `approved_at` 为 01:58:13Z，早于回执 |
| 授权草案 | `0171aeea…`，`DRAFT_PENDING_OWNER_GATE_A`；不是授权 |
| Win7 运行根 | `C:\A9-W43\run\7af65f2d` |
| 收尾记录 | `FORMAL_EXECUTION_CLOSEOUT.json`（`3fe9e36f…`，执行代理写） |

已知限制（不得再列为发现）：KL-1、KL-2；KL-3；KL-4；KL-5；KL-6a；KL-7 边界 a、b、c；KL-8、KL-9、KL-10、KL-11。详见任务书 §6.13、§6.24、§6.27、§6.33、§6.39～§6.41、§6.46、§6.48、§6.50。
下列仍是 `UNKNOWN` 或 `NOT_PERFORMED`，不作为本轮缺陷，除非正式证据与它们矛盾：`taskkill /T` 在陈旧父 PID 上的效果；陈旧父链接过滤分支在真实碰撞下的 Win7 行为；跨机器构建可重复性；UTF-16、base64、HTML 实体里的密钥不被套件扫描器扫描。

## 2. 证据位置（均只读）

| 简称 | 路径 | 内容 |
|---|---|---|
| CAND | `/Users/qlyf/Developer/win7-coding-Agent/.acceptance/candidates/WIN7-43/` | 冻结候选（文件已设只读）：ZIP、`.sha256`、manifest、Kit、`A9_33_BUILD_RESULT.json`、`DOUBLE_BUILD.json`、`IDENTITY.sha256` |
| RUN | `/Users/qlyf/Developer/win7-coding-Agent/.acceptance/runs/A9-33-W43/7af65f2d-770c-484b-bd40-7861935ed86f/` | `authority/`、`GATE_A_RECEIPT.json`、`approval-at.txt`、`deadline.txt`、`FORMAL_EXECUTION_CLOSEOUT.json`、`win7-retrieved/` |
| RET | `RUN/win7-retrieved/` | 从 Win7 取回的副本：`r1`、`r2`、`r3`、`r4`、`r7`（含 `evidence/`、`evidence-sums-final.txt`、`phase-summary.json`、`local-compare.txt`、`local-secret-scan.txt`）、`r8`、`runs/`、`glue/`、`external/` |
| ORIG | `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-rehearsal/rehearsal-formal/` | 执行代理的原始工作目录：与 RET 同名子目录，另有 `RUN_LOG.md`、`local-integrity-console.json`、`local-extract/`、`replay-r1.cjs` |
| 对照 | 同级 `rehearsal-12/`、`rehearsal-13/` | 预演 12、13 的同口径证据（Win7 实机，非验收证据） |

范围说明：Win7 上 `evidence` 共 328 个文件。取回 245 个；83 个 `driver-electron` 文件按合同不取回（它们是驱动自己的 Electron 用户数据）。取回部分的哈希与大小以 Win7 本机生成的 `r7/evidence-sums-final.txt` 为准。

## 3. 可复现命令与预期

下面的脚本由执行代理写，放在 `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-review/codex-stage3-formal-20261015/verify/`（简称 V）。脚本只读证据，输出到终端；唯一写入是 `run_all.sh` 参数里的可写目录（只写 `paths20.txt`）。
审核者先读脚本再运行，也可自写等价脚本；脚本的预期输出只是执行代理的结果，不是证明。

| 文件 | SHA-256 |
|---|---|
| `run_all.sh` | `1dfdf43e…` |
| `v01_zip_vs_manifest.py` | `fdfbf343…` |
| `v02_source_to_package.py` | `af083502…` |
| `v03_evidence_sums_closure.py` | `34383cbb…` |
| `v04_kit_ledger_requests.py` | `f9a14d84…` |
| `v05_p01_p03_readout.py` | `ca8e8fd8…` |
| `v06_secret_rescan.py` | `ac156bc0…` |
| `v07_png_check.py` | `c0c610aa…` |
| `v08_p09_p10_readout.py` | `30339a0e…` |
| `expected-output.txt`（执行代理的输出，105 行） | `170aaae5…` |

```sh
export TMPDIR="$PWD/tmp"; mkdir -p "$TMPDIR"
V=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent/.acceptance/a9-33-review/codex-stage3-formal-20261015/verify
sh "$V/run_all.sh" "$TMPDIR" > "$TMPDIR/stage3-output.txt" 2>&1
diff "$TMPDIR/stage3-output.txt" "$V/expected-output.txt" && echo SAME_AS_EXECUTOR
```

`run_all.sh` 的 10 个部分和预期：

| 部分 | 检查 | 预期 |
|---|---|---|
| A | 身份哈希 | ZIP `f7538c20…`；manifest `495e762d…`；Kit `2ca56ed7…`；授权文件（RUN 与 RET 两份）`dc5b1608…`；草案 `0171aeea…`；输入锁 `f22f91c8…`；批准登记 `de75a450…`；ZIP 101645206 字节，`.sha256` 文件与之相同 |
| B | ZIP 的 800 个条目逐个对照 manifest 的 799 项（manifest 不含自身） | `missing 0`、`bad 0` |
| C | 20 个允许路径在冻结提交上的 blob 哈希对照包内文件 | `a6c689d5…..63c6d426…` 的 `release scripts src` 差异为空；20 个路径中 13 个逐字节在包内（含 `validation/a9-batch2-driver.cjs` ← `a9-batch2-driver-entry.cjs`、`validation/a9-batch2-smoke.cjs`、`resources/app/product/a9-package-runtime.js`），7 个不在包内（README、`a9-32-input-lock.json`、构建脚本、2 个包测试、2 个 shell 测试） |
| D | 取回的 245 个文件对照 `evidence-sums-final.txt` 的 328 项 | 245 匹配、0 不匹配、0 个不在清单、83 个未取回且全部是 `driver-electron/` |
| E | RET 与 ORIG 的 9 个子目录 `diff -rq` | 每项 0 行 |
| F | Kit 的 25 个用例、42 条断言对照 10 份 `phase-result.json`；账本；请求 | 25/42、全部 PASS、编号和顺序与 Kit 相同、无多余用例；账本 20 行（10 个 CONSUMED、10 个 COMPLETED PASS），`run_id` 只有 `7af65f2d-…`，每个 `result_sha256` 等于对应 `phase-result.json` 的哈希；10 份 `request.json` 的 `run_id` 相符、`max_requests` 为 16，每份请求的 `expires_at` 比 `issued_at` 晚 15 分钟；第 1 份 `issued_at` 为 02:04:42Z，第 10 份 `expires_at` 为 02:26:27Z |
| G | p01 与 p03 的原值 | p01 的 SID `S-1-5-21-1708701742-428676696-1831205153-1001`、`integrity=Medium`、`session=2`、`elevated=false`、`in_job=false`、`stale_processes=0 of 103`；p03 的 `B2-CH-06-NORMAL-EXIT-A02`：`exit_code=0`、`killed_by=null`、`tree_before=5`、`survivors=0`、`residue=0`、`stale_parent_links` 为空；树里是 3 个 `electron.exe`、1 个 `spike02_helper.exe`（PID 3236）、1 个 `powershell.exe`（PID 3216，父 3236） |
| H | p09 与 p10 的原值 | p09 有 8 个负例，全部被拒绝；p09 `through=p08-ui`，`status=PASS`；p10 `residue=0`，秘密扫描 250 个文件、命中 0、正控 3 类 |
| I | 独立的字节级秘密重扫（本机，不用套件扫描器） | `files 287`、`no hits`。模式含 `sk-` 前缀（带前置边界）、Bearer、私钥块、AWS 键、GitHub 令牌、赋值式口令；带 NUL 的文件另做 UTF-16LE 折叠。注意：不带边界的 `sk-` 会命中 `task-179…` 误报 |
| J | 9 个截图 | PNG 签名有效；尺寸 1349×675（7 张）、1710×730、1710×960；每张的解压原始字节有 256 种取值（不是纯色图） |

以上不替代审核者自己读证据。下面这些需要审核者直接读原始文件并给出结论，脚本没有覆盖。

## 4. 重点复核点

1. **断言原值来自产品的实际观察**。对 42 条断言逐条读 `observed`，判断它是产品运行后的事实，还是由套件把期望值回显。重点：p03 的 6 个用例、p04 的 6 个用例、p05 的 4 个用例、p06 的 2 个用例、p07 的 1 个用例、p08 的 UI-01 与 UI-02。
2. **p03 退出断言容忍 1 个缺失项**。`B2-CH-06-NORMAL-EXIT-A02` 的 `observed` 末尾是 `missing_evidence=evidence-manifest.json`，状态 PASS。代码在 `release/win7-product-v3/a9-batch2-smoke.cjs` 约 975 行：`missing.length > 1` 才判 FAIL。清单不列自身，所以 `evidence-manifest.json` 总是被列为缺失；预演 9、10、12、13 的同一断言值相同。请判断：容忍恰好 1 个缺失项，是否会让一个不是自引用的缺失文件也通过（假 PASS），以及这个规则是否已被前几轮覆盖。
3. **陈旧父链接过滤分支未被正式运行触发**。R1 进程表 102 行：父更老 83、时间相同 2、父不在表中 17、父更年轻 0；17 行涉及 12 个不同的陈旧父 PID，其中含预演 11 撞号的 3864。本次 helper 的 PID 是 3236，没有撞号，`stale_parent_links` 为空。请判断：正式运行的 p03 通过是否依赖运气（PID 分配），这一点是否已在 KL-10、KL-11 与 §6.54 的未知项里如实写明。
4. **授权与窗口**。核对每份请求的 `issued_at`、阶段 `started_at`、账本时刻都在回执有效期 02:01:45Z～10:01:45Z 内；`authorization.approved_at`（01:58:13Z）早于回执时刻，是否构成绑定缺陷，由审核者判断。负责人对窗口的回答是“同意”加“确认哈希并签发（推荐）”，没有给出截止时刻（原始回答在回执里）。
5. **身份链**。从源提交 → ZIP → manifest → Kit → 输入锁 → 批准登记 → 授权文件 → 请求 → 阶段结果 → 账本，每一环的哈希是否一致、有无任何一环只在执行代理的叙述里出现。`candidate_tentative=true` 与“冻结”的关系是否有歧义。
6. **证据边界**。83 个未取回的 `driver-electron` 文件，没有任何断言依赖它们？请从 Kit 的 `required_cases[].evidence` 与 `evidence_class`（25 个用例各自列出 1～5 个证据文件）和 `chain_steps[].evidence` 核对每个用例要求的证据文件，是否都在取回的 245 个里，以及 `evidence_class` 为何类的文件有没有落在未取回的 83 个里。
7. **零残留**。R8（`r8/postflight-processes.csv`、`r8/tasks-query.txt`、`r8/session-and-roots.txt`）、p10（`g4-postflight.json`，`processes_total=104`、`residue=0`）与 p01 的 `g0-processes-before.json` 三份是否互相一致；`A9W43*` 计划任务 0 个，`agent` 仍在 console 会话 2。
8. **秘密扫描覆盖**。套件扫描器（`a9-batch2-smoke.cjs` 的 api-key-prefix、configured-secret-literal、bearer-token 三类）扫描了什么、没扫什么；执行代理本机扫描的二进制部分（9 个 png、6 个 db、1 个 sqlite）没有单独留档方法，请独立判断；本包第 I 部分的重扫是否足够，漏掉了哪些类别。
9. **预算与时间**。10 个请求 ≤16；从 R1 到 R7 共约 615 秒，≤7200 秒；没有自动重跑；Win7 的 `C:\A9-W43\run` 在 R1 列出 13 个旧目录且没有 `7af65f2d`（`r1/r1-output-utf8.txt` 第 20～32 行），在 R8 列出 14 个目录，多出的一个是 `7af65f2d`（`r8/session-and-roots.txt`）。请核对两份列表，并确认 13 个旧目录的名字前后相同。
10. **报告与登记没有超出证据**。核对 [§6.54](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#654-关口-a-签发与正式运行2026-10-15)、`docs/STATUS.md`、`docs/STATUS_LOG.md` 和交接书 [A9_33_WIN7_43_ACCEPTANCE_HANDOFF.md](../../plans/A9_33_WIN7_43_ACCEPTANCE_HANDOFF.md) 里的每个数字、时间和哈希前缀，是否都能从上面的证据复现；有没有把“预演 PASS”写成“正式 PASS”、把 `UNKNOWN` 写成已知、漏写必带限制（KL-3、KL-5、KL-6a、KL-7 的 a、b、c）。
11. **KL 观察值**。KL-3：`first_ipc_ms=821`、`dom_frames_max=0`；KL-5：`utf8=true`、`crlf=true`、`utf16le=false`、`cp936=false`（后两项 INFORMATIONAL）；KL-6a：`ui02-layouts.json` 8 个布局，`zoom` 为 1 与 1.25，`below_800` 为 `NOT_VERIFIED`。请核对这些值，并判断 §6.54 对它们的描述是否准确。
12. **p09 在 Win7 上的报告校验**。8 个负例都被拒绝且类别匹配，这个检验的强度是否足以支撑“报告器能拦住被改动的证据”；它只统计到 p08，不含 p09、p10 自己。

## 5. 未执行与未知

| 项 | 状态 |
|---|---|
| 83 个 `driver-electron` 文件的逐字节扫描回放 | `NOT_PERFORMED` |
| 陈旧父链接过滤分支在真实碰撞下的 Win7 行为 | `NOT_PERFORMED`（预演 12、13 与正式运行都没有碰撞） |
| `taskkill /T` 在陈旧父 PID 上的效果 | `UNKNOWN`；负责人 2026-10-15 决定不加固 |
| 跨机器构建可重复性 | `UNKNOWN` |
| `agent` 的锁屏或屏保状态 | `UNKNOWN` |
| 关口 B、推送、合并、ADR-0155、A9-32 `DEVELOPER_VERIFIED` | `NOT_PERFORMED`，负责人专属 |

## 6. 报告要求

最终回复就是复核报告，用中文，按 P0 / P1 / P2 / 信息 分级。每条给 `文件:行`、证据（命令输出或源码引用）和理由，不把猜测写成发现；无法验证的写 `UNKNOWN`。
报告必须包含：

- (a) 第 1 节每个身份值的复核结果；
- (b) 第 3 节 `run_all.sh` 的实际输出，与预期不符处逐条列出；
- (c) 第 4 节 12 个重点复核点的逐条结论；
- (d) 42 条断言的原值抽查表（至少 20 条，p03、p05、p06、p07 必含），每条写“产品观察 / 套件回显 / 无法判断”；
- (e) 你另做的至少 3 项独立检查及结果（例如重算 `phase-result.json` 哈希、读 SQLite 里的任务与审计行、对照预演 12 与 13 的同一断言）；
- (f) 对“正式运行证据是否足以支撑第二批执行能力 Win7 PASS，供负责人在关口 B 裁决”的明确判断，并列出你认为关口 B 前必须补的证据；
- (g) 最后一句：是否建议负责人在这批证据上进入关口 B。

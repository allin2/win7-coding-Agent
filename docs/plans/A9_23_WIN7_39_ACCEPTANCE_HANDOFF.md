# A9-23 / WIN7-39 Win7 实机验收交接书（执行方：外部模型）

```text
Status: DRAFT_PENDING_FREEZE（§3 待双构建冻结与门 A 签发后填写，届时改为 READY_FOR_EXECUTION）
Scope: A9-23 WIN7-39 换发与实机验收（A9-20 Git 确认分类器绕过修复 + A9-21 运行时加固移植；W39 验证套件）
Executor: 外部执行模型（负责人指定）
Reviewer: Claude（最终审核，基于原始证据，不基于执行方摘要）
Owner: 项目负责人（签发候选外授权、最终裁决）
```

本文件不是实现授权，也不授权任何人签发 PASS。执行方只负责**按步骤执行并原样取证**；
是否通过由审核方核对原始证据后给出建议，负责人裁决。依据：[A9-23](../tasks/A9_23_WIN7_39_REISSUE_AND_ACCEPTANCE.md) §6 第 2、6 步，ADR-0142。

## 1. 分工与前史

| 工作 | 负责方 | 状态 |
|---|---|---|
| A. 换发依据（ADR-0142、A9-23 任务书、C14 路径） | 审核方起草，负责人批准 | 已完成 |
| B. W39 验证套件修复 | 外部执行方实现，审核方验收 | 已完成：五轮返工、三次 Win7 预演（`REHEARSAL_NOT_ELIGIBLE`），套件 `e0e8da6` 于 `7ec9db7` 并入 `codex/a9-alpha2`（[套件修复交接书](A9_23_W39_KIT_REPAIR_HANDOFF.md) §7～§14） |
| C. 双独立干净构建与冻结 | 审核方 | 待执行（A9-23 §6 第 4 步） |
| D. 候选外 `WIN7_39_RELEASE_AUTHORITY` 与独立 SHA-256 pin | 负责人 | 待签发（门 A） |
| **E. Win7 实机执行与取证（本文 §4～§8）** | **执行方** | 前置条件满足后开始 |
| F. 证据审核、正式报告组装与 Win7 报告校验 | 审核方；负责人裁决（门 B） | 实机执行后 |

第三次预演（`.acceptance/rehearsals/A9-23-W39/20260927-0059/`）中 13 个阶段与 181 条断言在 Win7 全部通过，仅 smoke 汇总因套件判定缺陷 K12 输出 `FAIL`；
K12 由 R5-1 修复并以该次预演的真实产出在开发机重放证明，负责人决定不做第四次预演（套件修复交接书 §13～§14）。
**预演结果不计入本次验收，本次验收的每一项都以本文的正式运行证据为准。**

## 2. 开始前必须全部满足（任一不满足即不开始）

1. 本文件 `Status` 已由审核方改为 `READY_FOR_EXECUTION`，§3 表格无空项。
2. 候选冻结在本机 `.acceptance/candidates/WIN7-39/`，其 `release-manifest.json` 为 `source_dirty=false`、
   `external_acceptance_eligible=true`，两份独立构建 ZIP 逐字节一致。
3. 本机 §3 的 authority 目录中有 4 个文件：`release-authority.json`、`release-authority.json.sha256`、
   `a9-23-win7-39-input-lock.json`、`a9-v25-approved-kits.json`；authority 由负责人签发，绑定 §3 的源码提交、ZIP、manifest、
   输入锁、目标主机与 run-id；`.sha256` 与 authority 实际哈希一致。
4. 负责人已在 Win7 控制台以 `agent` 登录（`query user` 显示 `agent` 为 `console`、状态“运行中”）。

## 3. 候选身份（由审核方在冻结与签发后填写）

| 项 | 值 |
|---|---|
| 候选 ID | WIN7-39 |
| 源码提交 | （冻结后填写） |
| ZIP 文件名 / SHA-256 / 字节数 | `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip` /（冻结后填写） |
| manifest SHA-256 | （冻结后填写） |
| input lock SHA-256 | （冻结后填写） |
| authority SHA-256 | （签发后填写） |
| run-id（已绑定在 authority 中，不得另起） | （签发后填写） |
| 本机运行目录 | `.acceptance/runs/A9-23-W39/<run-id>/`（下称 `<L>`）；authority 与锁文件在 `<L>/authority/` |
| 目标主机（已绑定在 authority 中） | `192.168.1.3`；地址变化时停止并请负责人重签 authority |
| 完整性命令 / 报告命令 / smoke | `RUN_A9_23_W39_INTEGRITY.cmd` / `RUN_WIN7_39_REPORT_VERIFY.cmd` / `validation\a9-win7-39-smoke.cjs`（候选内 `A9_23_WIN7_39_VALIDATION.md`） |
| Win7 运行根（下称 `<W>`） | `C:\A9-W39\验收 目录\<run-id前8位>`（W39-02 要求含中文与空格）；传输暂存目录 `C:\A9-W39\stage\<run-id前8位>\` |

## 4. 环境、连接与计划任务

### 4.1 连接

- 目标 Win7 SP1 x64（build 7601）。SSH 管理账户 `dccs-chaizl` 只用于传输、哈希、注册/回读/删除计划任务与取回证据；
  产品一律以普通用户 `agent`（SID `S-1-5-21-1708701742-428676696-1831205153-1001`）的 Medium 非提升令牌运行。
- 私钥 `.acceptance/ssh/id_rsa_win7accept`、known_hosts `.acceptance/ssh/known_hosts_win7`。**不得读取、输出、复制私钥内容。**
- 连接参数固定为：

  ```text
  ssh -i .acceptance/ssh/id_rsa_win7accept -o BatchMode=yes -o IdentitiesOnly=yes \
      -o StrictHostKeyChecking=yes -o UserKnownHostsFile=.acceptance/ssh/known_hosts_win7 \
      -o HostKeyAlias=192.168.1.11 -o ConnectTimeout=15 dccs-chaizl@<IP> "<cmd>"
  ```

  **主机键不匹配时立即停止，不得接受新键。** SSH 输出多为 GBK，本机按 GBK 解码后记录，原始字节另存。
- 上传与取回经 ASCII 暂存目录中转（`scp` 到 `C:\A9-W39\stage\<run-id前8位>\`，再在 Win7 上移入或移出 `<W>`），与三次预演相同。

### 4.2 计划任务（沿用预演已验证的做法）

1. `.cmd` 一律 CRLF，运行根路径由 `%~dp0` 推导，正文不写中文字面量（纯 ASCII）；唯一例外是自检 `.cmd` 为验证中文参数传递而含的中文，按 CP936 写出。
   中文路径只出现在任务 XML 的动作参数中。每个 `.cmd` 开头先把 `whoami /groups` 写入证据并检查 `S-1-16-8192`（Medium），不满足以退出码 4 结束。
2. 任务 XML 主体为上述 SID、`LogonType=InteractiveToken`、`RunLevel=LeastPrivilege`，动作 `cmd.exe /d /c call "<W>\scripts\<名>.cmd"`，
   工作目录 `C:\A9-W39`。**注册用的 XML 以 CP936（GBK）写出、无 BOM、无编码声明**（第一次预演 K7：UTF-8 会被静默按 CP936 误解码且 `schtasks` 仍报成功）。
   注册源文件原样存入 `<W>\scripts\`，`schtasks /create` 的原始输出存入 `evidence\`。
3. **回读门**（[预演交接书附录 B](A9_23_W39_REHEARSAL_HANDOFF.md)）：首选在同一 `cmd` 进程中 `chcp` → `chcp 936` → `schtasks /query /tn <名> /xml`，
   三者原始输出都保存；仍报“无法加载列资源”时走后备：保存错误原文，经 Task Scheduler COM 导出已注册 XML，逐字段精确核对任务名、
   完整 `.cmd` 路径与参数、工作目录、`agent` SID、`InteractiveToken`、`LeastPrivilege`，核对结果存 `evidence\<名>-gate-check.json`。
   任一字段不一致或乱码即停止。
4. **任务 XML 的 UTF-16 存证**（A9-23 §6 第 2 步）：回读得到的已注册 XML 另存为 UTF-16LE（带 BOM）文件 `evidence\<名>-registered.utf16.xml`，
   内容为回读所得字符串原样编码，不做任何修改；该文件与 CP936 注册源文件都列入 `SHA256SUMS.txt`，`RUN_LOG.md` 中登记两者的路径与编码。
5. **自检任务**：启动 G1 前先运行一个无害自检任务，取得实际 `agent` 身份、`S-1-16-8192` 与中文参数原样传递的证据（`evidence\selftest-*.txt`）。
6. 任务运行期间的状态查询使用回读门中可用的方式，输出写入证据文件；不依赖已报错的查询方式。
7. 每个任务名带 run-id 前 8 位，例如 `A9W39A<前8位>Selftest`、`…Integrity`、`…Smoke`。

执行方可以参照第三次预演 `.acceptance/rehearsals/A9-23-W39/20260927-0059/scripts/` 中的脚本写法，但只能**复制到 `<L>/scripts/` 后修改**，
不得改动预演目录；复制后修改过的内容在 `deviations[]` 之外单独列入报告的 `scripts_derived_from_rehearsal[]`。

## 5. 执行步骤

每一步完成后立即把时间、命令、退出码、关键输出追加到 `<L>/RUN_LOG.md`，不得事后补写。各步原始输出存 `<L>/win7-raw/` 或 `<W>\evidence\`。

1. **G0-1 本机核对**：在 `<L>/authority/` 复算 authority 的 SHA-256，须等于 `.sha256` 文件内容与 §3；复算 `.acceptance/candidates/WIN7-39/` 中 ZIP、
   manifest 与输入锁的 SHA-256，须等于 §3。结果存 `<L>/evidence/g0-local-hash.txt`。
2. **G0-2 连接、会话与进程基线（只读）**：`cmd /c ver`、`query user`、`tasklist /v`，以及
   `wmic process get ProcessId,ParentProcessId,SessionId,Name,CommandLine /format:csv`；
   确认 `agent` 为 console 活动会话、无 `electron.exe`。进程表原样存 `evidence\g0-process-baseline.csv`（**agent 会话进程基线**，
   后飞行据此判断新增进程）。
3. **G0-3 上传与 Win7 端哈希**：创建 `<W>\{original,package,evidence,scripts,authority}`；上传候选 ZIP 到 `original\`、4 个 authority 文件到 `authority\`；
   在 Win7 上用 `certutil -hashfile <文件> SHA256` 复算 ZIP 与 4 个 authority 文件，原始输出存 `evidence\g0-hash-win7.txt`，必须与 G0-1 完全一致。
   再把 ZIP 展开到 `package\`（方法与预演相同，命令记入 RUN_LOG）；为 `agent` 授予 `<W>` 的 `(OI)(CI)M` 权限，`icacls` 原始输出存证。
4. **G0-4 计划任务门**：按 §4.2 注册自检任务、回读、存 UTF-16 副本、运行自检。
5. **G1 完整性（W39-01）**：以 `agent` 经计划任务在 `<W>\package\` 运行
   `RUN_A9_23_W39_INTEGRITY.cmd "<W>\original\<ZIP>" "<W>\authority\a9-23-win7-39-input-lock.json" "<W>\authority\a9-v25-approved-kits.json" "<W>\authority\release-authority.json" <authority SHA-256>`；
   控制台输出存 `evidence\integrity-output.txt`，完整性报告写在 `<W>\a9-win7-39-evidence\a9-package-integrity.json`。要求退出码 0。
   该 `.cmd` 在中文与空格路径下接收 5 个参数，也是 A9-23 验证说明 §6 第 3 项的观察点，参数是否完整原样到达记入报告。
6. **G2 自动 smoke**：以 `agent` 经计划任务在 `<W>\package\` 设置 `ELECTRON_RUN_AS_NODE=1` 并运行
   `.\electron.exe .\validation\a9-win7-39-smoke.cjs "--evidence-root=<W>\evidence\smoke"`；控制台输出存 `evidence\smoke-console.txt`。
   要求退出码 0 且 smoke 总报告 `status=PASS`。Git 由 smoke 自动解析（参数 → `C:\acceptance\mvp_mingit\cmd\git.exe` → `where git`），不得修改任何 PATH。
   阶段超时由 smoke 自身控制，执行方不得中途终止；总时长超过 3 小时按 §7 处理。
7. **后飞行**：
   - `tasklist /v` 与 G0-2 同一条 `wmic` 命令，原样存 `evidence\postflight-processes.csv`；与基线相比不得有新增的 `electron.exe`、helper 或测试 Shell。
     有残留时记录进程名、PID、父 PID 与命令行，**不得先强杀再报零残留**（A9-23 §2 第 4 项：零残留不得依赖人工终止）。
   - 删除本次注册的全部计划任务，每条 `schtasks /delete` 的原始输出存 `evidence\task-delete-<名>.txt`。
   - 再次 `certutil` 复算 `original\` 中的 ZIP 与 `package\` 中的 `release-manifest.json`、`electron.exe`、`validation\a9-win7-39-smoke.cjs`、
     `validation\a9-win7-39-driver.cjs`，存 `evidence\postflight-hash-win7.txt`；ZIP 须与 §3 一致，其余 4 个文件须与 ZIP 内同名条目一致（本机对照后记入 RUN_LOG）。
   - `<W>` 保留在 Win7 上，待审核方决定是否清理。
8. **取回**：把 `<W>\evidence\`、`<W>\scripts\`、`<W>\a9-win7-39-evidence\` 全部取回到 `<L>/` 下同名目录，逐文件核对 Win7 端与本机哈希。
9. **秘密扫描**：对 `<L>/` 全部文本文件扫描私钥头、`BEGIN .* PRIVATE KEY`、`Authorization:`、`Bearer `、`api[_-]?key` 等形态，
   以及 M1b 口令形态（`w39user:` 后紧跟的不是 `***redacted***`）；结果存 `<L>/secret-scan.txt`（命中数与位置，不复制命中内容）。
10. **报告与清单**：写 `<L>/EXECUTOR_REPORT.json`（§8），最后生成 `<L>/SHA256SUMS.txt`，覆盖 `evidence/`、`scripts/`、`a9-win7-39-evidence/`、`authority/`、
    `win7-raw/`、`RUN_LOG.md`、`secret-scan.txt` 与 `EXECUTOR_REPORT.json` 的每个文件（清单本身除外）。

## 6. 用例与证据（W39-01～W39-15）

用例 ID 以冻结 Kit `A9_23_VALIDATION_KIT.json` 为准；断言 ID 与判定口径见候选内 `A9_23_WIN7_39_VALIDATION.md` §3～§5。
除 W39-01 外，全部证据由 G2 smoke 生成，位于 `<W>\evidence\smoke\` 下；**没有人工 UI 步骤**，执行方不得自行截图或补造文件。

| 用例 | 来源 | 证据文件 |
|---|---|---|
| W39-01-CANDIDATE-INTEGRITY | G1 | `evidence\integrity-output.txt`、`a9-win7-39-evidence\a9-package-integrity.json` |
| W39-02-CHINESE-SPACE-PATH | G2 | `w39-02-paths.json`（另见 G1 参数传递观察） |
| W39-03-STARTUP-WITHIN-60S | G2 | `w39-03-startup.json`、`w39-03-startup.png` |
| W39-04-TASK-READ-EDIT-SHELL | G2 `first` | `w39-04-task-flow.json` |
| W39-05-DIFF-AND-CHECKPOINT | G2 `first` | `w39-05-diff.json`、`w39-05-diff.png` |
| W39-06-APPROVAL-STOP-RESTART | G2 `first`/`second`/`retry`/`stop` | `w39-06-approval-stop-restart.json` |
| W39-07-A9-20-GIT-FORMS-CMD | G2 `w39_git` | `w39-07-09-git-forms.json` |
| W39-08-A9-20-GIT-FORMS-POWERSHELL | G2 `w39_git` | `w39-07-09-git-forms.json` |
| W39-09-A9-20-GIT-FORMS-POSIX-AND-BULK | G2 `w39_git` | `w39-07-09-git-forms.json`（无 POSIX 壳时“能否执行”子项由 smoke 记 `NOT_PERFORMED`） |
| W39-10-M1-STARTUP-TARGETED-RECOVERY | G2 `w39_m1_small`/`w39_m1_large` | `w39-10-startup-recovery.json` |
| W39-11-M1B-HEX-FREEZE-AND-URL-REDACTION | G2 `w39_m1b` | `w39-11-m1b-hex-redaction.json` |
| W39-12-M2-OUTPUT-LIMITS | G2 `w39_m2` | `w39-12-output-limits.json` |
| W39-13-M3-CHECKPOINT-PAGINATION | G2 `w39_m3` | `w39-13-checkpoint-paging.json`、`w39-13-checkpoint-paging.png` |
| W39-14-M4-COLLECTION-BOUNDS | G2 `w39_m4` | `w39-14-collection-bounds.json` |
| W39-15-SECRET-SCAN-AND-POSTFLIGHT | G2 + 后飞行 + 第 9 步 | `w39-15-residue.json`、`evidence\postflight-processes.csv`、`secret-scan.txt` |

另须取回 smoke 总报告、13 个阶段报告（`first`、`second`、`retry`、`stop`、`live` 与 8 个 `w39_*`）、`w39-case-index.json` 及 smoke 证据目录下全部文件。
缺失的文件在报告中列出，不补造。

## 7. 硬停止条件

出现任一即停止后续步骤；只完成可安全进行的后飞行（记录进程表、删除计划任务并存输出、取回已有证据），如实记录后交回：

- 主机键不匹配、SSH 认证失败、`agent` 未登录或令牌不是 Medium、自检任务未取得 §4.2 第 5 项证据；
- 任何哈希与 §3 或 authority 不一致；authority 缺失或 pin 不匹配；
- 回读门任一字段不一致或乱码；
- G1 退出码非 0；G2 退出码非 0、smoke `status` 不是 `PASS`，或退出码与 `status` 矛盾；
- 后飞行出现 Electron、helper 或测试 Shell 残留；
- smoke 超过 3 小时仍未结束（先记录进程表，再终止，报告写明为人工终止）；
- 需要输入任何密码或密钥，或需要以管理员身份运行产品。

停止后**不得**：修改候选、重打包、替换文件、重签授权、改写已产生的证据、重跑已执行的步骤或把失败改记为通过。
未执行的步骤一律记 `NOT_PERFORMED`。

## 8. 交回内容

1. `<L>/` 完整目录（§5 第 10 步所列全部内容与 `SHA256SUMS.txt`）。
2. `<L>/EXECUTOR_REPORT.json`，交回前须能被 JSON 解析器读入。字段固定：
   - `run_id`、`target_ip`、`host_key_ok`、`win7_run_root`、`agent_session`（用户名、会话、Medium SID、自检中文参数原文）；
   - `zip_sha256_local`、`zip_sha256_win7`、`authority_sha256`、`authority_files_win7_hash_equal`；
   - `task_readback`：每个任务的回读方式（首选/后备）、`chcp` 前后代码页、逐字段核对结果、CP936 源文件与 UTF-16 副本路径；
   - `steps[]`：`name`、`started_at`、`ended_at`、`exit_code`、`status` ∈ {`DONE`,`FAILED`,`NOT_PERFORMED`}、`evidence_files[]`；
   - `integrity`：退出码与完整性报告中的逐文件核对计数原值；中文路径下 5 个参数是否原样到达；
   - `smoke`：退出码、总报告 `status` 原值、`phases[]`（13 项：`name`、`exit_code`、`duration_ms`、`report_status`、`error`）、
     `assertions[]`（每条：`id`、`passed` 原值、`detail` 前 200 字符）、`w39-07-09-git-forms.json` 的 `git_executable`、`git_source`、`git_version`、`ref_unchanged`；
   - `postflight`：新增进程列表（相对 G0 基线）、计划任务删除结果、复算哈希是否一致；
   - `secret_scan`：各形态命中数；
   - `missing_evidence[]`、`scripts_derived_from_rehearsal[]`、`stop_reason`（未停止为 `null`）、`deviations[]`（任何与本文不同的操作，包括重试）。
3. 报告只写观察到的事实与数值；除原样引用证据中的字段值外，不使用 PASS/FAIL/通过/失败等裁决字样。

## 9. 实机之后（执行方知悉）

审核方基于原始证据独立复核：复算 `SHA256SUMS.txt` 与候选、authority 哈希；逐项对照 §6 与验证说明判定口径；核对时间线、`deviations[]` 与进程基线；
用候选内报告器 `init` 生成模板并组装正式报告，在开发机预检后，另发附录请执行方在 Win7 以 `agent` 运行 `RUN_WIN7_39_REPORT_VERIFY.cmd` 复核（与 WIN7-37 附录 C 相同）。
无法由原始证据支撑的结论按 `INSUFFICIENT_EVIDENCE` 处理。之后由负责人在门 B 裁决。

# A9-25 / WIN7-41 Win7 实机验收交接书（执行方：外部模型）

```text
Status: READY_FOR_EXECUTION（2026-09-29：候选冻结于 `0f8af24`，负责人门 A 签发 `WIN7_41_RELEASE_AUTHORITY`）
Scope: A9-25 §9 WIN7-41 换发与实机验收（A9-24 改动审阅 + W41-01～22 回归；W41 验证套件）
Executor: 外部执行模型（负责人指定；不得由本交接书的审核方兼任）
Reviewer: Claude（最终审核，基于原始证据，不基于执行方摘要）
Owner: 项目负责人（签发候选外授权、最终裁决）
```

本文件不是实现授权，也不授权任何人签发 PASS。执行方只负责**按步骤执行并原样取证**；是否通过由审核方核对原始证据后给出建议，负责人在门 B 裁决。
依据：[A9-25](../tasks/A9_25_WIN7_40_REISSUE_AND_ACCEPTANCE.md) §2、§9，ADR-0144、ADR-0145。模板为 [WIN7-40 实机交接书](A9_25_WIN7_40_ACCEPTANCE_HANDOFF.md)；
WIN7-40 实机与 W41 三轮预演暴露的做法问题（反斜杠归档条目、大归档续传、自产文件修正另存、会话状态）已并入正文。

## 1. 分工与前史

| 工作 | 负责方 | 状态 |
|---|---|---|
| A. 换发依据（ADR-0145、A9-25 §9、C14 路径） | 审核方起草，负责人批准 | 已完成 |
| B. W41 验证套件 | 外部执行方实现，审核方验收 | 已完成：R6～R8 返工、三轮连续两次 Win7 预演；最新套件于 `f77de6d` 并入 `codex/a9-alpha2`（[W41 套件交接书](A9_25_W41_KIT_HANDOFF.md) §6～§9） |
| C. 双独立干净构建与冻结 | 审核方 | 已完成（2026-09-29，本文 §3） |
| D. 候选外 `WIN7_41_RELEASE_AUTHORITY` 与独立 SHA-256 pin | 负责人 | 已签发（2026-09-29T01:07:45Z，门 A） |
| **E. Win7 实机执行与取证（本文 §4～§8）** | **执行方** | 前置条件满足后开始 |
| F. 证据审核、正式报告组装与 Win7 报告校验 | 审核方；负责人裁决（门 B） | 实机执行后 |

WIN7-40 结论为 `A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS`（ADR-0145）。第三轮连续两次预演（`.acceptance/rehearsals/A9-25-W41/20260929-0748/`）两次原值均为 `status=PASS`，
17 个阶段与 W41-02～22 全部成立（套件交接书 §9）；该轮 `agent` 会话处于“断开”，窗口可视区为 1010×579，与正式条件不同。
**预演结果不计入本次验收，本次验收的每一项都以本文的正式运行证据为准。**

## 2. 开始前必须全部满足（任一不满足即不开始）

1. 本文件 `Status` 已由审核方改为 `READY_FOR_EXECUTION`，§3 表格无空项。
2. 候选冻结在本机 `.acceptance/candidates/WIN7-41/`，其 `release-manifest.json` 为 `source_dirty=false`、`external_acceptance_eligible=true`，两份独立构建 ZIP 逐字节一致。
3. 本机 §3 的 authority 目录中有 4 个文件：`release-authority.json`、`release-authority.json.sha256`、`a9-25-win7-41-input-lock.json`、`a9-v25-approved-kits.json`；
   authority 由负责人签发，绑定 §3 的源码提交、ZIP、manifest、输入锁、目标主机与 run-id；`.sha256` 与 authority 实际哈希一致。
4. 负责人已在 Win7 控制台以 `agent` 登录（`query user` 表内 `agent` 为 `console`、状态“运行中”；该命令退出码可能为 1，以表内状态为准）。
   `agent` 显示“断开”或控制台由其他账户持有时**不开始**，交回请负责人处理；执行方不得执行 `tscon` 或任何会话切换、注销，不得改账户策略，不得以 `dccs-chaizl` 或 High 令牌运行产品。
5. 验收机显示设置保持现状（当前为 125% DPI），执行方不得修改；W41-22 以运行时实测的 `devicePixelRatio` 为准。

## 3. 候选身份（2026-09-29 冻结，门 A 已签发）

| 项 | 值 |
|---|---|
| 候选 ID | WIN7-41 |
| 源码提交 | `0f8af24d90a8e4821c02cf8de69224f630f8b807` |
| ZIP 文件名 / SHA-256 / 字节数 | `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip` / `66a4b3e4d7fd7ded791cf031bd227c5e9d227c9fba8ba4a8c58e230b83ec93b0` / 101,437,930 B（本机 `.acceptance/candidates/WIN7-41/`） |
| manifest SHA-256 | `141ef659b5f9235fc73d2674c015ac3c57a03749e1f3af2bfde9c7d8b6cd343e`（790 文件） |
| input lock SHA-256 | `5dfd5dec4a52828627090f97cd14f8c99fd62cbb8940265800d1e6f72e9f84b5` |
| authority SHA-256 | `aeaa20cf38fb2faa944d7afef81d63e483e407f377a670f47cb12c0be17ffcc8`（`release-authority.json`；独立 pin 为同目录 `release-authority.json.sha256`） |
| run-id（绑定在 authority 中，不得另起） | `318e27e4-d7ac-4c42-9530-8f973abf033f`（Win7 运行根取前 8 位 `318e27e4`） |
| 本机运行目录 | `.acceptance/runs/A9-25-W41/<run-id>/`（下称 `<L>`）；authority 与锁文件在 `<L>/authority/` |
| 目标主机（绑定在 authority 中） | `192.168.1.3`；地址变化时停止并请负责人重签 authority |
| Win7 运行根（下称 `<W>`） | `C:\A9-W41\验收 目录\<run-id前8位>`（W41-02 要求含中文与空格）；传输暂存目录 `C:\A9-W41\stage\<run-id前8位>\` |
| 候选根（下称 `<C>`） | `<W>\package\Win7CodingAgent-0.3.0-alpha.1-win7-x64\`（ZIP 含顶层目录；完整性、smoke 与报告校验都在 `<C>` 运行） |
| 完整性命令 / 报告命令 / smoke | `<C>\RUN_A9_25_W41_INTEGRITY.cmd` / `<C>\RUN_WIN7_41_REPORT_VERIFY.cmd` / `<C>\validation\a9-win7-41-smoke.cjs`（判定口径见候选内 `A9_25_WIN7_41_VALIDATION.md`） |
| 完整性报告位置 | `<W>\package\a9-win7-41-evidence\a9-package-integrity.json`（由 `.cmd` 写到 `<C>\..\a9-win7-41-evidence\`） |

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
- 上传与取回经 ASCII 暂存目录中转，与预演相同。

### 4.2 计划任务（沿用 WIN7-39 与三次 W41 预演已验证的做法）

1. `.cmd` 一律 CRLF，运行根路径由 `%~dp0` 推导，正文纯 ASCII；唯一例外是自检 `.cmd` 为验证中文参数传递而含的中文，按 CP936 写出。
   每个 `.cmd` 开头先把 `whoami /groups` 写入证据并检查 `S-1-16-8192`（Medium），不满足以退出码 4 结束。
2. 任务 XML 主体为上述 SID、`LogonType=InteractiveToken`、`RunLevel=LeastPrivilege`，动作 `cmd.exe /d /c call "<W>\scripts\<名>.cmd"`，工作目录 `C:\A9-W41`。
   **注册用的 XML 以 CP936（GBK）写出、无 BOM、无编码声明**；注册源文件原样存入 `<W>\scripts\`，`schtasks /create` 原始输出存入 `evidence\`。
3. **回读门**：首选在同一 `cmd` 进程中 `chcp` → `chcp 936` → `schtasks /query /tn <名> /xml`，三者原始输出都保存；报“无法加载列资源”时走后备：保存错误原文，
   经 Task Scheduler COM 导出已注册 XML，逐字段精确核对任务名、完整 `.cmd` 路径与参数、工作目录、`agent` SID、`InteractiveToken`、`LeastPrivilege`，结果存 `evidence\<名>-gate-check.json`。
   任一字段不一致或乱码即停止。
4. **UTF-16 存证**：回读得到的已注册 XML 原样另存为 UTF-16LE（带 BOM）`evidence\<名>-registered.utf16.xml`；与 CP936 注册源文件都列入 `SHA256SUMS.txt`，`RUN_LOG.md` 登记路径与编码。
5. **自检任务**：启动 G1 前先运行一个无害自检任务，取得实际 `agent` 身份、`S-1-16-8192` 与中文参数原样传递的证据（`evidence\selftest-*.txt`）。
6. 任务运行期间的状态查询使用回读门中可用的方式，输出写入证据文件；不依赖已报错的查询方式。
7. 每个任务名带 run-id 前 8 位，例如 `A9W41A<前8位>Selftest`、`…Integrity`、`…Smoke`。

执行方可以参照第三次预演 `.acceptance/rehearsals/A9-25-W41/20260929-0748/R1/scripts/` 中的脚本写法，但只能**复制到 `<L>/scripts/` 后修改**，不得改动预演目录；
复制后修改过的内容单独列入报告的 `scripts_derived_from_rehearsal[]`。
**执行方修正自产文件一律另存新文件名**（例如 `…-v2.json`），原文件保留不动并登记 `deviations[]`；不得同名重写任何已产生的文件；自产脚本不得与已存在的文件同名。

## 5. 执行步骤

每一步完成后立即把时间、命令、退出码、关键输出追加到 `<L>/RUN_LOG.md`，不得事后补写。各步原始输出存 `<L>/win7-raw/` 或 `<W>\evidence\`。

1. **G0-1 本机核对**：在 `<L>/authority/` 复算 authority 的 SHA-256，须等于 `.sha256` 文件内容与 §3；复算 `.acceptance/candidates/WIN7-41/` 中 ZIP、manifest 与输入锁的 SHA-256，须等于 §3。
   结果存 `<L>/evidence/g0-local-hash.txt`。
2. **G0-2 连接、会话与进程基线（只读）**：`cmd /c ver`、`query user`、`tasklist /v`，以及 `wmic process get ProcessId,ParentProcessId,SessionId,Name,CommandLine /format:csv`；
   确认 `agent` 为 console 活动会话、无 `electron.exe`。进程表原样存 `evidence\g0-process-baseline.csv`（后飞行据此判断新增进程）。
3. **G0-3 上传与 Win7 端哈希**：创建 `<W>\{original,package,evidence,scripts,authority}`；上传候选 ZIP 到 `original\`、4 个 authority 文件到 `authority\`；
   `certutil -hashfile <文件> SHA256` 复算 ZIP 与 4 个 authority 文件，原始输出存 `evidence\g0-hash-win7.txt`，必须与 G0-1 完全一致。
   再把 ZIP 展开到 `package\`（方法与预演相同，命令记入 RUN_LOG），确认 `<C>` 存在；为 `agent` 授予 `<W>` 的 `(OI)(CI)M` 权限，`icacls` 原始输出存证。
4. **G0-4 计划任务门**：按 §4.2 注册自检任务、回读、存 UTF-16 副本、运行自检。
5. **G1 完整性（W41-01）**：以 `agent` 经计划任务在 `<C>` 运行
   `RUN_A9_25_W41_INTEGRITY.cmd "<W>\original\<ZIP>" "<W>\authority\a9-25-win7-41-input-lock.json" "<W>\authority\a9-v25-approved-kits.json" "<W>\authority\release-authority.json" <authority SHA-256>`；
   控制台输出存 `evidence\integrity-output.txt`，完整性报告位于 `<W>\package\a9-win7-41-evidence\a9-package-integrity.json`。要求退出码 0；5 个参数在中文与空格路径下是否原样到达记入报告。
6. **G2 自动 smoke**：以 `agent` 经计划任务在 `<C>` 设置 `ELECTRON_RUN_AS_NODE=1` 并运行
   `.\electron.exe .\validation\a9-win7-41-smoke.cjs "--evidence-root=<W>\evidence\smoke"`；控制台输出存 `evidence\smoke-console.txt`。
   要求退出码 0 且 smoke 总报告 `status=PASS`。Git 由 smoke 自动解析（参数 → `C:\acceptance\mvp_mingit\cmd\git.exe` → `where git`），不得修改任何 PATH。
   阶段超时由 smoke 自身控制（W41 第三轮预演约 3.5 分钟），执行方不得中途终止；运行期间不操作验收机桌面、不调整窗口或 DPI；总时长超过 3 小时按 §7 处理。
7. **后飞行**：
   - `tasklist /v` 与 G0-2 同一条 `wmic` 命令，原样存 `evidence\postflight-processes.csv`；与基线相比不得有新增的 `electron.exe`、helper 或测试 Shell
     （特别核对 `w41-06-stop-exit.json` 中记录的停止用例 PID）。有残留时记录进程名、PID、父 PID 与命令行，**不得先强杀再报零残留**。
   - 删除本次注册的全部计划任务，每条 `schtasks /delete` 的原始输出存 `evidence\task-delete-<名>.txt`。
   - 再次 `certutil` 复算 `original\` 中的 ZIP 与 `<C>` 下的 `release-manifest.json`、`electron.exe`、`validation\a9-win7-41-smoke.cjs`、`validation\a9-win7-41-driver.cjs`，
     存 `evidence\postflight-hash-win7.txt`；ZIP 须与 §3 一致，其余 4 个文件须与 ZIP 内同名条目一致（本机对照后记入 RUN_LOG）。
   - `<W>` 保留在 Win7 上，待审核方决定是否清理。
8. **取回**：把 `<W>\evidence\`、`<W>\scripts\`、`<W>\package\a9-win7-41-evidence\` 全部取回到 `<L>/evidence/`、`<L>/scripts/`、`<L>/a9-win7-41-evidence/`，逐文件核对 Win7 端与本机哈希。取回清单须包含 Win7 端生成的逐文件哈希清单（如 `return-file-hashes.json`），先下载清单再展开核对。
   - Win7 上 .NET Framework 的 `ZipFile.CreateFromDirectory` 生成的归档条目名使用反斜杠，本机展开时先把条目名中的 `\` 归一化为 `/` 再写出，然后逐文件核对；
   - 约 100 MB 的证据归档用 scp 取回曾中断，可直接用带 `ServerAliveInterval` 的 sftp `reget` 续传；期望哈希一律从 certutil 原始输出程序化解析，不手工转写。
9. **秘密扫描**：对 `<L>/` 全部文件（含二进制与 SQLite）扫描私钥头、`BEGIN .* PRIVATE KEY`、`Authorization:`、`Bearer `、`api[_-]?key`、`sk-` 等形态，以及 M1b 口令形态
   （`w41user:` 后紧跟的不是 `***redacted***`）；结果存 `<L>/secret-scan.txt`（命中数与位置，不复制命中内容），**逐条**标明来源分类，至少区分“扫描规则自身”“夹具源码模板”“二进制片段”“自产脚本正则字面量”四类（只给类别计数不满足要求）。
10. **报告与清单**：写 `<L>/EXECUTOR_REPORT.json`（§8），最后生成 `<L>/SHA256SUMS.txt`，覆盖 `evidence/`、`scripts/`、`a9-win7-41-evidence/`、`authority/`、`win7-raw/`、
    `RUN_LOG.md`、`secret-scan.txt` 与 `EXECUTOR_REPORT.json` 的每个文件（清单本身除外）。

## 6. 用例与证据（W41-01～W41-22）

用例 ID 以冻结 Kit `A9_25_W41_VALIDATION_KIT.json` 为准；断言 ID 与判定口径见候选内 `A9_25_WIN7_41_VALIDATION.md`。
除 W41-01 外，全部证据由 G2 smoke 生成，位于 `<W>\evidence\smoke\` 下；**没有人工 UI 步骤**，执行方不得自行截图或补造文件。

| 用例 | 来源 | 证据文件 |
|---|---|---|
| W41-01 完整性 | G1 | `evidence\integrity-output.txt`、`a9-win7-41-evidence\a9-package-integrity.json` |
| W41-02 中文空格路径 | G2 | `w41-02-paths.json`（另见 G1 参数传递观察） |
| W41-03 启动 60 s | G2 `w41_startup` | `w41-03-startup.json`、`.png` |
| W41-04 读/改/Shell | G2 `first` | `w41-04-task-flow.json` |
| W41-05 Diff 与 checkpoint | G2 `first`、`w41_review` | `w41-05-diff.json`、`.png`（须显示检查器“改动”页签与文件 Diff） |
| W41-06 审批/停止/重启 | G2 `first`/`second`/`retry`/`stop`/`w41_stop` | `w41-06-approval-stop-restart.json`、`w41-06-stop-exit.json`（停止后子进程消失 ≤ 5000 ms） |
| W41-07～09 Git 形态 | G2 `w41_git` | `w41-07-09-git-forms.json` |
| W41-10 启动定向恢复 | G2 `w41_m1_small`/`w41_m1_large` | `w41-10-startup-recovery.json` |
| W41-11 M1b | G2 `w41_m1b` | `w41-11-m1b-hex-redaction.json` |
| W41-12 输出上限 | G2 `w41_m2` | `w41-12-output-limits.json` |
| W41-13 checkpoint 分页 | G2 `w41_m3` | `w41-13-checkpoint-paging.json`、`.png`（须显示检查器“改动”页签与最旧轮次 Diff） |
| W41-14 集合上限 | G2 `w41_m4` | `w41-14-collection-bounds.json` |
| W41-15 秘密扫描与后飞行 | G2 + 后飞行 + 第 9 步 | `w41-15-residue.json`、`evidence\postflight-processes.csv`、`secret-scan.txt` |
| W41-16 改动摘要卡 | G2 `w41_review` | `w41-16-summary.json`、`.png` |
| W41-17 逐文件撤销与撤回、重启后持久 | G2 `w41_review`、`w41_review_restart` | `w41-17-undo.json` |
| W41-18 外部修改 | G2 `w41_review` | `w41-18-external.json` |
| W41-19 后续轮次修改 | G2 `w41_review` | `w41-19-later.json` |
| W41-20 命令产生的变化 | G2 `w41_review` | `w41-20-command.json` |
| W41-21 不阻断、两种模式、review fail-closed | G2 `w41_review`、`w41_review_mode` | `w41-21-mode.json`、`w41-21-tool-results.json` |
| W41-22 布局 | G2 `w41_review` | `w41-22-layout.json`、`.png` |

另须取回 smoke 总报告 `automatic-smoke.json`、17 个阶段报告（`first`、`second`、`retry`、`stop`、`live`，8 个 `w41_*` 继承阶段，`w41_stop`、`w41_review`、`w41_review_restart`、`w41_review_mode`）、
`w41-case-index.json` 及 smoke 证据目录下全部文件。缺失的文件在报告中列出，不补造。

## 7. 硬停止条件

出现任一即停止后续步骤；只完成可安全进行的后飞行（记录进程表、删除计划任务并存输出、取回已有证据），如实记录后交回：

- 主机键不匹配、SSH 认证失败、`agent` 未登录或令牌不是 Medium、自检任务未取得 §4.2 第 5 项证据；
- 任一时刻 `agent` 不是控制台“运行中”会话（例如显示“断开”、控制台由其他账户持有）；执行方不得以会话切换等方式自行处理；
- 任何哈希与 §3 或 authority 不一致；authority 缺失或 pin 不匹配；
- 回读门任一字段不一致或乱码；
- G1 退出码非 0；G2 退出码非 0、smoke `status` 不是 `PASS`，或退出码与 `status` 矛盾；
- 后飞行出现 Electron、helper 或测试 Shell 残留；
- smoke 超过 3 小时仍未结束（先记录进程表，再终止，报告写明为人工终止）；
- 需要输入任何密码或密钥，或需要以管理员身份运行产品；
- 本文与候选实际行为不一致（例如路径、文件名、参数），先停止上报，不得自行变通。

停止后**不得**：修改候选、重打包、替换文件、重签授权、改写已产生的证据、重跑已执行的步骤或把失败改记为通过。未执行的步骤一律记 `NOT_PERFORMED`。

## 8. 交回内容

1. `<L>/` 完整目录（§5 第 10 步所列全部内容与 `SHA256SUMS.txt`）。
2. `<L>/EXECUTOR_REPORT.json`，交回前须能被 JSON 解析器读入。字段固定：
   - `run_id`、`target_ip`、`host_key_ok`、`win7_run_root`、`candidate_root`、`agent_session`（用户名、会话、Medium SID、自检中文参数原文）；
   - `zip_sha256_local`、`zip_sha256_win7`、`authority_sha256`、`authority_files_win7_hash_equal`；
   - `task_readback`：每个任务的回读方式（首选/后备）、`chcp` 前后代码页、逐字段核对结果、CP936 源文件与 UTF-16 副本路径；
   - `steps[]`：`name`、`started_at`、`ended_at`、`exit_code`、`status` ∈ {`DONE`,`FAILED`,`NOT_PERFORMED`}、`evidence_files[]`；
   - `integrity`：退出码与完整性报告中的逐文件核对计数原值；中文路径下 5 个参数是否原样到达；
   - `smoke`：退出码、总报告 `status` 原值、`phases[]`（17 项：`name`、`exit_code`、`status`、`started_at`、`ended_at`、`duration_ms`、`error`/`blocked_reason`）、
     `assertions[]`（每条：`id`、`passed` 原值、`detail` 前 200 字符）、`case_index[]`（22 项 `case_id`、`result`、`reason` 原值）、
     `w41-07-09-git-forms.json` 的 `git_executable`、`git_source`、`git_version`、`ref_unchanged`，以及 `w41-22-layout.json` 的 `devicePixelRatio`、`innerWidth`、`innerHeight`；
   - `postflight`：新增进程列表（相对 G0 基线）、计划任务删除结果、复算哈希是否一致；
   - `secret_scan`：各形态命中数与逐条来源分类；
   - `missing_evidence[]`、`scripts_derived_from_rehearsal[]`、`stop_reason`（未停止为 `null`）、`deviations[]`（任何与本文不同的操作，包括重试）。
3. 报告只写观察到的事实与数值；除原样引用证据中的字段值外，不使用 PASS/FAIL/通过/失败等裁决字样。

## 9. 实机之后（执行方知悉）

审核方基于原始证据独立复核：复算 `SHA256SUMS.txt` 与候选、authority 哈希；逐项对照 §6 与验证说明判定口径；核对时间线、`deviations[]` 与进程基线；
用候选内报告器 `init` 生成模板并组装正式报告，在开发机预检后，另发附录请执行方在 Win7 以 `agent` 运行 `RUN_WIN7_41_REPORT_VERIFY.cmd` 复核（与 WIN7-39 附录 B 相同）。
无法由原始证据支撑的结论按 `INSUFFICIENT_EVIDENCE` 处理。之后由负责人在门 B 裁决。

## 附录 A：正式报告的 Win7 校验（2026-09-29，实机执行后）

审核结论见 [审核报告](../reports/2026-09/a9_25_win7_41_acceptance_review_2026-09-29.md)。审核方已用候选内报告器 `init` 生成模板并组装正式报告 `report-w41.json`（22 项均为 PASS），
开发机上候选自带校验器结果 `status=PASS`、`verified_cases=22`、处置 `A9_25_WIN7_41_A9_24_PASS`；篡改证据字节与错误 pin 均被拒绝。**以上是开发机预检，不是 Win7 校验。** 门 B 前必须在 Win7 上以 `agent` 用候选内校验器复核一次。

### A.1 输入（审核方已钉住，执行方不得修改）

以下路径均相对于 `<L>/review/`：

- 验证包 `bundle/`：`report-w41.json`（SHA-256 `81f677d7769df27230968706e65242d14e5e6c5a7de925d902b48c81a19975ae`）与 34 个被引用证据文件，路径全部为 ASCII；清单 `BUNDLE_SHA256SUMS.txt` 共 35 行。
- 校验脚本 `report-verify-kit/RUN_REPORT_VERIFY_AS_AGENT.cmd`（由 WIN7-39 同名脚本机械派生：纯 ASCII、CRLF，路径由 `%~dp0` 推导，检查 `agent` 与 Medium，结果与 `whoami /groups` 写入
  `<W>\rv\evidence\report-verify-output.txt`，末行 `REPORT_VERIFY_EXIT=<n>`）。
- 钉住清单 `REPORT_VERIFY_KIT.sha256`：覆盖上述 `.cmd` 与 `BUNDLE_SHA256SUMS.txt`，清单自身 SHA-256 为 `2033f86b1c4c1fb53b5b0189b0a4f66ed4927868f51f9c392297ea50d3f2c18a`。

### A.2 步骤

记录以追加方式写 `<L>/report-verify/RUN_LOG.md`（每步后追加，不得整体重写）；Win7 目录为 `<W>\rv\{bundle,scripts,evidence}`，本机取回到 `<L>/report-verify/`。

1. **C1 会话与哈希（只读）**：`query user` 须显示 `agent` 为 `console`“运行中”，否则停止；`certutil` 复算 `original\` 中的 ZIP 与 `authority\` 中 4 个文件，须与 §3 一致；记录进程基线。
2. **C2 本机校验**：在 `<L>/review/report-verify-kit/` 下 `shasum -a 256 -c ../REPORT_VERIFY_KIT.sha256` 2 项 OK，复算清单自身哈希须等于 A.1；
   在 `bundle/` 下 `shasum -a 256 -c ../BUNDLE_SHA256SUMS.txt` 35 项 OK。任一不符即停止。
3. **C3 上传**：经 ASCII 暂存目录把 `bundle/` 全部内容按原相对路径放到 `<W>\rv\bundle\`，把 `.cmd` 放到 `<W>\rv\scripts\`；`certutil` 逐个复算 35 个文件与 `.cmd`，
   结果存 `<W>\rv\evidence\upload-hash-win7.txt`，须全部一致；为 `agent` 授予 `<W>\rv` 的 `(OI)(CI)M`。
4. **C4 运行**：按 §4.2 注册任务 `A9W41C318e27e4ReportVerify`（CP936 XML，动作 `cmd.exe /d /c call "<W>\rv\scripts\RUN_REPORT_VERIFY_AS_AGENT.cmd"`），
   回读门逐字段核对并存 UTF-16LE 副本；运行并等待结束（上限 15 分钟）。不需要另跑自检任务：`.cmd` 自身检查 `agent` 与 Medium。
   `report-verify-output.txt` 出现 `REPORT_VERIFY_BLOCKED_`、`_MISSING` 或没有 `REPORT_VERIFY_EXIT=` 行即停止。不得重跑。
5. **C5 后飞行与取回**：进程表相对 C1 基线无新增 Electron；删除任务并存原始输出；取回 `<W>\rv\evidence\` 与 `<W>\rv\scripts\` 到 `<L>/report-verify/`；生成 `<L>/report-verify/SHA256SUMS.txt`。
6. **C6 报告**：`<L>/report-verify/EXECUTOR_REPORT_C.json`，字段：`kit_manifest_sha256`、`kit_hash_verified_local`、`upload_hash_verified_on_win7`、`task_readback`、`steps[]`、
   `report_verify_exit_line`（原文）、`report_verify_output_status`（校验器输出中 `status` 与 `verified_cases` 原值）、`stop_reason`、`deviations[]`。只写事实，不用裁决字样。

候选、authority、`package\` 与本次实机的全部证据保持原样；硬停止条件同 §7。

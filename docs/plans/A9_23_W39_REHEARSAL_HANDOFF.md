# A9-23 W39 验证套件 Win7 预演交接书

> 执行方：新会话。审核方：发出本交接书的会话（A9-23 验收方）。执行方只交原始证据与事实报告，不对任何用例下 PASS/FAIL 结论。
> 授权依据：[A9-23](../tasks/A9_23_WIN7_39_REISSUE_AND_ACCEPTANCE.md) §6 第 3 步与 §7 Q1（负责人 2026-09-26 同意预演）；ADR-0142。

## 0. 性质与边界（先读）

- 这是**套件预演**，不是验收。构建是非正式的，**不冻结、不签发 authority、不生成 pin**；全部证据标 `REHEARSAL_NOT_ELIGIBLE`，
  不计入 WIN7-39 或任何候选的结论，不回写 PRD，不改任何任务状态。
- 目的只有两个：让 W39 套件在 Win7 真实运行一次，暴露开发机测不出的套件问题；采集 §5 的五项待验证事实。
- 预演中发现的套件问题**只记录，不修复**；修复另在套件分支进行，并须重新通过开发机门（A9-23 §7 Q1）。
- 不改产品代码，不改候选文件，不在验收机上安装软件、改系统设置、注册表或服务，不提权运行产品。

## 1. 起点

- 套件源码：分支 `codex/a9-23-w39-kit` @ `330eae7855f012e8a78ae2e8cd5b39cfbfb5218f`（工作树 `/Users/qlyf/Developer/win7-coding-agent-w39-kit`）。
  2026-09-26 验收方复核通过（套件修复交接书 §7～§8）：打包测试 47/47、shell 43 套 447 项、`verify:quick`、`docs:check` 通过。
- 构建输入（本机 `.acceptance/deps/`，哈希须与输入锁一致）：Electron `electron/electron-v22.3.27-win32-x64.zip`（`ad723ed7…`）、
  D-013 helper `d013-v25-r15/WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip`（`7485cf22…`）、A6 SQLite
  `a6/WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip`（`2cb0cd32…`）。
- 目标机与连接方式沿用 [WIN7-38 实机交接书](A9_22_WIN7_38_ACCEPTANCE_HANDOFF.md) §4：地址 `192.168.1.3`，SSH 管理账户 `dccs-chaizl` 只用于传输、
  哈希、注册与删除计划任务、取回证据；产品一律以普通用户 `agent` 的 Medium 非提升令牌经计划任务运行（任务 XML 为 UTF-16，
  `LogonType=InteractiveToken`、`RunLevel=LeastPrivilege`；每个 `.cmd` 先写 `whoami /groups` 并检查 `S-1-16-8192`，否则退出码 4）。
  **不得读取、输出、复制私钥内容；主机键不匹配立即停止。**

## 2. 本机准备

1. 预演目录：本机 `.acceptance/rehearsals/A9-23-W39/<YYYYMMDD-HHMM>/`（下称 `<R>`），含 `build/`、`evidence/`、`scripts/`、`RUN_LOG.md`。
   每一步完成后立即把时间、命令、退出码、关键输出追加到 `RUN_LOG.md`，不得事后补写。
2. 构建：在套件工作树（须干净，HEAD 为 `330eae7`）运行
   `node scripts/release/build-a9-product-v3.mjs --formal-input-lock release/win7-product-v3/a9-23-win7-39-input-lock.json --electron-zip <…> --runner-zip <…> --storage-zip <…> --output <R>/build`；
   记录退出码、`A9_23_BUILD_RESULT.json`、ZIP 与 manifest 的 SHA-256。构建失败即停止。

## 3. Win7 步骤

1. **连接与会话（只读）**：`cmd /c ver`、`query user`、`tasklist /v`；记录主机键核对结果、`agent` 会话是否在交互桌面、无 `electron.exe` 残留。
   `agent` 未登录则停止。
2. **上传与哈希**：建运行根 `C:\A9-W39\预演 目录\<YYYYMMDD-HHMM>\`，其下 `package\`、`evidence\`、`scripts\`；上传 ZIP，用
   `certutil -hashfile <zip> SHA256` 复算，须与 §2 构建记录一致，再展开到 `package\`。计划任务 XML、`.cmd` 与其原始输出都存入 `scripts\`/`evidence\`。
3. **完整性（不执行）**：候选内 `RUN_A9_23_W39_INTEGRITY.cmd` 必须传入候选外 authority 与独立 pin，预演不生成 authority，
   因此本步记 `NOT_PERFORMED`（W39-01 本就不在 smoke 内）。不得为运行它而伪造或临时生成 authority。
4. **smoke**：以 `agent` 经运行根下 `scripts\` 中的 `.cmd` 运行：在候选根目录执行
   `.\electron.exe .\validation\a9-win7-39-smoke.cjs --evidence-root=<运行根>\evidence\smoke`，`.cmd` 中设置 `ELECTRON_RUN_AS_NODE=1`（smoke 自检要求）；
   证据根必须在候选目录之外（smoke 会检查）。该 `.cmd` 在中文与空格路径下运行并传入含中文的参数，同时用于观察 §5 第 4 项。等待其自行结束，记录退出码、开始与结束时间、控制台输出。
   阶段超时由 smoke 自身控制，执行方不得中途终止；若总时长超过 3 小时仍未结束，按 §6 处理。
5. **补充观察（只读、以 `agent` 运行，结果存 `evidence\probes\`）**：
   - `where git` 与 `git --version`（§5 第 2 项）；
   - `powershell -NoProfile /Command "Write-Output w39-probe-command"` 与 `powershell -NoProfile "Write-Output w39-probe-positional"` 的输出与退出码（§5 第 3 项）；
   - 不执行任何 `git push` 或其他会写网络、写仓库的命令。
6. **后飞行**：确认 `tasklist /v` 中无 `electron.exe`、helper 或测试 Shell 残留（残留时记录进程名、PID、父 PID、命令行，**不得先强杀再报零残留**）；
   删除本次注册的全部计划任务并保存删除命令的原始输出；再次复算 ZIP 哈希。运行根保留在 Win7 上，待审核方决定是否清理。
7. **取回**：把 Win7 运行根下 `evidence\` 与 `scripts\` 全部取回到 `<R>/`，生成 `<R>/SHA256SUMS.txt`（覆盖 `evidence/`、`scripts/`、`build/A9_23_BUILD_RESULT.json`、`RUN_LOG.md`）。
8. **秘密扫描**：对 `<R>/` 全部文本文件扫描私钥头、`BEGIN .* PRIVATE KEY`、`Authorization:`、`api[_-]?key` 等形态与 M1b 口令形态（口令本身由 smoke 生成且不落盘，
   扫描 `w39user:` 后是否紧跟非 `***redacted***` 的内容）；结果存 `<R>/secret-scan.txt`。

## 4. 需要取回并在报告中列出的 smoke 产物

smoke 证据目录下的全部文件，至少包括：smoke 总报告、13 个阶段报告（`first`、`second`、`retry`、`stop`、`live`、`w39_startup`、`w39_git`、`w39_m1_small`、
`w39_m1_large`、`w39_m1b`、`w39_m2`、`w39_m3`、`w39_m4`）、`w39-case-index.json`、`w39-02-paths.json` 至 `w39-15-residue.json` 等固定文件名的证据摘录、截图。
任何缺失的文件在报告中列出，不补造。

## 5. 五项待验证事实（报告中逐项给出原始观察）

1. **w39 旅程首次实跑**：8 个 `w39_*` 阶段各自的退出码、耗时、驱动报告 `status` 与 `error`，以及每条 `A9-W39-*` 断言的原始 `passed` 值与 `detail` 摘要。
2. **Win7 上是否有 Git**：`where git` 结果；`w39-07-09-git-forms.json` 中 `git_available`、`setup_error`、`remote_check`。
3. **PowerShell 5.1 的 `/Command` 与位置参数形态**：§3 第 5 步两条探针的输出与退出码；`w39_git` 中第 9、18、19 项形态的待批准项与绑定路径原样记录。
4. **`.cmd` 在中文与空格路径下的参数传递**：smoke 启动 `.cmd` 能否在该路径下正常接收并传递 `--evidence-root`（退出码、smoke 报告中的
   `evidence_root` 与实际目录是否一致、有无乱码或路径截断）。候选自带 `RUN_*.cmd` 的同类观察留待正式验收。
5. **M3 60 轮耗时**：`w39_m3` 阶段报告中的 `journey_ms` 与阶段总耗时；若触及 900000 ms 阶段超时，原样记录，不得调整轮数。

## 6. 硬停止条件

出现以下任一，停止后续步骤，完成可安全进行的后飞行（查残留、删计划任务、取回已有证据）后交回：

- 主机键不匹配、SSH 认证失败、`agent` 未登录或令牌不是 Medium；
- 构建失败，或 Win7 上 ZIP 哈希与构建记录不一致；
- 需要输入任何密码或密钥，或需要以管理员身份运行产品；
- smoke 超过 3 小时仍未结束（记录进程表后再终止，并在报告中写明是人工终止）。

smoke 退出码非 0 或断言失败**不是**停止条件：这正是预演要观察的内容，照常完成后飞行、取回与报告。

## 7. 交回内容

1. `<R>/` 完整目录（`build/A9_23_BUILD_RESULT.json`、`evidence/`、`scripts/`、`RUN_LOG.md`、`SHA256SUMS.txt`、`secret-scan.txt`）。
2. `<R>/REHEARSAL_REPORT.json`，字段固定：`eligibility: "REHEARSAL_NOT_ELIGIBLE"`、`kit_commit`、`zip_sha256_local`、`zip_sha256_win7`、`host_key_ok`、
   `agent_session`、`steps[]`（`name`、`started_at`、`ended_at`、`exit_code`、`status` ∈ {`DONE`,`FAILED`,`NOT_PERFORMED`}、`evidence_files[]`）、
   `phases[]`（13 个阶段：`name`、`exit_code`、`duration_ms`、`report_status`、`error`）、`assertions[]`（每条：`id`、`passed` 原值、`detail_head`）、
   `pending_items[]`（§5 五项的原始观察）、`suspected_kit_issues[]`（执行方认为属于套件的问题，附证据文件）、`stop_reason`、`deviations[]`。
3. 报告只写观察到的事实与数值，不写 PASS/FAIL/通过/失败。

## 8. 预演之后（执行方知悉）

审核方基于原始证据复核：套件问题 → 回到套件分支修复并重过开发机门，必要时再预演；套件无问题 → 套件分支并入 `codex/a9-alpha2`，
按 A9-23 §6 第 2、4 步写正式实机交接书并双构建冻结，再到门 A 由负责人签发 authority。

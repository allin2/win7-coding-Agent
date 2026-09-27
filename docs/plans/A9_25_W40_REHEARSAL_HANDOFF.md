# A9-25 W40 验证套件 Win7 预演交接书

> 执行方：外部执行 Agent（新会话）。审核方：发出本交接书的会话（A9-25 验收方）。执行方只交原始证据与事实报告，不对任何用例下 PASS/FAIL 结论。
> 授权依据：[A9-25](../tasks/A9_25_WIN7_40_REISSUE_AND_ACCEPTANCE.md) §5 第 2 步、§6 Q1（负责人 2026-09-27 批准保留预演）；ADR-0144。
> 本交接书沿用 [A9-23 预演交接书](A9_23_W39_REHEARSAL_HANDOFF.md) 的做法，并把其附录 A～C 与 [WIN7-39 实机交接书](A9_23_WIN7_39_ACCEPTANCE_HANDOFF.md) 附录 A 已验证的修订直接写入正文。

## 0. 性质与边界（先读）

- 这是**套件预演**，不是验收。构建非正式，**不冻结、不签发 authority、不生成 pin**；全部证据标 `REHEARSAL_NOT_ELIGIBLE`，
  不计入 WIN7-40 或任何候选的结论，不改任何任务状态。
- 目的：让 W40 套件（尤其 4 个新阶段 `w40_stop`、`w40_review`、`w40_review_restart`、`w40_review_mode`）在 Win7 真实运行一次，暴露开发机测不出的问题，并采集 §5 的待验证事实。
- 预演中发现的问题**只记录，不修复**。套件问题回到套件分支修复并重过开发机门；疑似产品缺陷按 A9-25 §2 第 2 条另立任务，不在本流程修改产品。
- 不改产品代码与候选文件；不在验收机上安装软件、改系统设置（含 DPI）、注册表或服务，不提权运行产品。

## 1. 起点

- 套件源码：`codex/a9-alpha2` @ `7fce103`（W40 套件于 `762e2d3` 并入，其后只有文档提交）。在套件工作树 `/Users/qlyf/Developer/win7-coding-agent-w40-kit`
  执行 `git merge --ff-only 7fce103`，构建前确认工作树干净且 HEAD 为 `7fce103`。不使用主工作区构建。
- 构建输入（本机 `.acceptance/deps/`，哈希须与 `release/win7-product-v3/a9-25-win7-40-input-lock.json` 一致，该锁的原生输入与 W39 相同）：
  Electron `electron/electron-v22.3.27-win32-x64.zip`（`ad723ed7…`）、D-013 helper `d013-v25-r15/WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip`（`7485cf22…`）、
  A6 SQLite `a6/WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip`（`2cb0cd32…`）。
- 目标机与连接：沿用 WIN7-39 实机交接书 §4 与附录 A（地址、主机键别名、SSH 管理账户 `dccs-chaizl` 只用于传输、哈希、注册与删除计划任务、取回证据）。
  产品一律以普通用户 `agent` 的 Medium 非提升令牌经计划任务运行。**不得读取、输出、复制私钥内容；主机键不匹配立即停止。**

## 2. 本机准备

1. 预演目录：`.acceptance/rehearsals/A9-25-W40/<YYYYMMDD-HHMM>/`（下称 `<R>`），含 `build/`、`evidence/`、`scripts/`、`RUN_LOG.md`。
   每一步完成后立即把时间、命令、退出码、关键输出追加到 `RUN_LOG.md`，不得事后补写。
2. 构建：`node scripts/release/build-a9-product-v3.mjs --formal-input-lock release/win7-product-v3/a9-25-win7-40-input-lock.json --electron-zip <…> --runner-zip <…> --storage-zip <…> --output <R>/build`；
   记录退出码、`A9_25_BUILD_RESULT.json`、ZIP 与 manifest 的 SHA-256。构建失败即停止。

## 3. Win7 步骤

记号：运行根 `<W>` = `C:\A9-W40\预演 目录\<YYYYMMDD-HHMM>\`，其下 `package\`、`evidence\`、`scripts\`；
候选根 `<C>` = `<W>\package\Win7CodingAgent-0.3.0-alpha.1-win7-x64\`（ZIP 含顶层目录，见 WIN7-39 实机交接书附录 A.1）。

1. **连接与会话（只读）**：`cmd /c ver`、`query user`、`tasklist /v`；记录主机键核对结果、`agent` 是否为交互桌面上的活动会话（`query user` 退出码可能为 1，以表内状态为准）、
   无 `electron.exe` 残留。`agent` 未登录则停止。
2. **上传与哈希**：上传 ZIP 到 `<W>\package\`，`certutil -hashfile <zip> SHA256` 复算须与 §2 一致，再展开。
3. **计划任务注册与回读门**：
   - 任务 XML 以 **CP936（GBK）** 写出并按该编码注册（运行根含中文），同时保存 UTF-16LE 副本；`Principal` 为 `agent` 的 SID、`LogonType=InteractiveToken`、`RunLevel=LeastPrivilege`；
   - 回读先在同一 `cmd` 中 `chcp`（记录）→ `chcp 936` → `schtasks /query /tn <名称> /xml`；失败则改用 Task Scheduler COM 导出，逐字段核对任务名、完整 `.cmd` 路径与参数、工作目录、SID、
     `InteractiveToken`、`LeastPrivilege`。任一字段不一致或乱码即停止。报告注明走的是首选还是 COM 后备。
   - 每个 `.cmd` 先写 `whoami /groups` 并检查 `S-1-16-8192`，否则退出码 4。
4. **自检任务**：启动 smoke 前先运行一个无害自检任务，取得 `agent` 身份、Medium 令牌与中文参数原样传递的证据。
5. **完整性（不执行）**：`RUN_A9_25_W40_INTEGRITY.cmd` 需要候选外 authority 与 pin，预演不生成，本步记 `NOT_PERFORMED`，不得伪造或临时生成 authority。
6. **只读探针（以 `agent` 运行，结果存 `evidence\probes\`）**：
   - `powershell -NoProfile -Command "$PSVersionTable.PSVersion.ToString()"`（`w40_stop` 依赖 PowerShell 的 `$PID`）；
   - `where git`；
   - `reg query "HKCU\Control Panel\Desktop" /v LogPixels` 与 `reg query "HKCU\Control Panel\Desktop\WindowMetrics" /v AppliedDPI`（只读，不存在时如实记录）。
7. **smoke**：以 `agent` 经计划任务在 `<C>` 中设置 `ELECTRON_RUN_AS_NODE=1` 并运行
   `.\electron.exe .\validation\a9-win7-40-smoke.cjs "--evidence-root=<W>\evidence\smoke"`，控制台输出存 `evidence\smoke-console.txt`。
   Git 由 smoke 自动解析（参数 → `C:\acceptance\mvp_mingit\cmd\git.exe` → `where git`），不改任何 PATH。阶段超时由 smoke 自身控制，不得中途终止；总时长超过 3 小时按 §6 处理。
   smoke 运行期间不操作验收机桌面，不调整窗口或 DPI。
8. **后飞行**：`tasklist /v` 确认无 `electron.exe`、helper 或测试 Shell 残留（特别核对 `w40_stop` 的长命令 `powershell.exe`；残留时记录进程名、PID、父 PID、命令行，
   **不得先强杀再报零残留**）；删除本次注册的全部计划任务并保存原始输出；再次复算 ZIP 哈希。Win7 运行根保留，待审核方决定是否清理。
9. **取回与校验**：取回 `<W>\evidence\` 与 `<W>\scripts\` 到 `<R>/`，生成 `<R>/SHA256SUMS.txt`（覆盖 `evidence/`、`scripts/`、`build/A9_25_BUILD_RESULT.json`、`RUN_LOG.md`）。
10. **秘密扫描**：对 `<R>/` 全部文件（含二进制与 SQLite）检索私钥头、`BEGIN .* PRIVATE KEY`、`Authorization:`、`api[_-]?key`、`sk-` 及 M1b 口令形态
    （`w40user:` 后是否紧跟非 `***redacted***` 内容）；结果存 `<R>/secret-scan.txt`，命中逐条说明是否为扫描规则自身。

## 4. 需要取回并在报告中列出的产物

smoke 证据目录全部文件，至少包括：smoke 总报告；17 个阶段报告（`first`、`second`、`retry`、`stop`、`live`，`w40_startup`、`w40_git`、`w40_m1_small`、`w40_m1_large`、
`w40_m1b`、`w40_m2`、`w40_m3`、`w40_m4`，`w40_stop`、`w40_review`、`w40_review_restart`、`w40_review_mode`）；`w40-case-index.json`；
`w40-02-paths.json` 至 `w40-22-layout.json` 等固定文件名的证据与全部截图（含 `w40-05-diff.png`、`w40-13-checkpoint-paging.png`、`w40-16-summary.png`、`w40-22-layout.png`）。
缺失的文件在报告中列出，不补造。

## 5. 待验证事实（报告中逐项给出原始观察）

1. **17 个阶段的实跑结果**：各阶段退出码、耗时、报告 `status` 与 `error`；每条 `A9-W40-*` 断言的原始 `passed` 与 `detail` 摘要；`w40-case-index.json` 中 22 个用例的 `result`。
2. **`w40_stop`（W40-06 收紧）**：探针得到的 PowerShell 版本；产品实际选用的 Shell 类型与版本（阶段报告或产品事件中有记录则摘录，没有则写明未记录，不推测）；PID 标记文件是否写出、PID 值；
   `elapsedMs`、`childGone`、终态 `outcome`；后飞行中该 PID 是否仍存在。
3. **W40-20**：`w40-20-command.json` 的 `unrecoverableStatus`、`unrecoverable`、`unrecoverableText`、`big.bin` 前后哈希；用例索引中的 `result` 与 `reason`。
4. **W40-22**：`innerWidth`、`innerHeight`、`devicePixelRatio`、`scrollWidth`/`clientWidth`；§3 第 6 步 DPI 探针原值。`devicePixelRatio` 不为 1.25 时如实记录，不得为此改设置。
5. **W40-05/13 截图（T-2 收紧）**：对应 JSON 中 `tabSelected`、所显示的轮次与文件；截图是否可见检查器“改动”页签与文件 Diff（执行方只描述所见，判定由审核方做）。
6. **W40-16～19、21 的关键数值**：摘要卡文本与 `review` 计数；撤回耗时 `recallMs`；外部修改与后续轮次两种 `driftReasons`；重启后 `statusText` 与再次撤销的 `restored`；
   review 模式的 `toolStartCount`/`toolEndCount` 与拒绝文案摘录。
7. **继承部分**：M3 60 轮的 `journey_ms` 与阶段耗时；M4 热身轮 `turnId` 与事件数；`w40-07-09-git-forms.json` 的 `git_executable`、`git_source`、`git_version`、`ref_unchanged`。

## 6. 硬停止条件

出现以下任一，停止后续步骤，完成可安全进行的后飞行（查残留、删计划任务、取回已有证据）后交回：

- 主机键不匹配、SSH 认证失败、`agent` 未登录或令牌不是 Medium；
- 构建失败，或 Win7 上 ZIP 哈希与构建记录不一致；
- 计划任务回读门字段不一致或乱码；
- 需要输入任何密码或密钥，或需要以管理员身份运行产品；
- smoke 超过 3 小时仍未结束（记录进程表后再终止，并在报告中写明是人工终止）。

smoke 退出码非 0 或断言失败**不是**停止条件：照常完成后飞行、取回与报告。

## 7. 交回内容

1. `<R>/` 完整目录（`build/A9_25_BUILD_RESULT.json`、`evidence/`、`scripts/`、`RUN_LOG.md`、`SHA256SUMS.txt`、`secret-scan.txt`）。
2. `<R>/REHEARSAL_REPORT.json`，字段固定：`eligibility: "REHEARSAL_NOT_ELIGIBLE"`、`kit_commit`、`zip_sha256_local`、`zip_sha256_win7`、`host_key_ok`、`agent_session`、
   `readback_gate`（`preferred` 或 `com_fallback`，含 `chcp` 前后代码页）、`steps[]`（`name`、`started_at`、`ended_at`、`exit_code`、`status` ∈ {`DONE`,`FAILED`,`NOT_PERFORMED`}、`evidence_files[]`）、
   `phases[]`（17 个：`name`、`exit_code`、`duration_ms`、`report_status`、`error`）、`assertions[]`（每条：`id`、`passed` 原值、`detail_head`）、
   `pending_items[]`（§5 七项的原始观察）、`suspected_kit_issues[]`、`suspected_product_issues[]`（各附证据文件）、`stop_reason`、`deviations[]`。
3. 报告只写观察到的事实与数值，不写 PASS/FAIL/通过/失败；区分“套件问题”与“疑似产品缺陷”时写明依据，不自行修复任何一方。

## 8. 预演之后

审核方基于原始证据复核：套件问题 → 回到套件分支修复并重过开发机门，必要时再预演；疑似产品缺陷 → 按 A9-25 §2 第 2 条报告负责人，另立任务；
均无问题 → 按 A9-25 §5 第 3 步起草正式实机交接书，再双构建冻结、门 A。

## 附录 A：第二次预演（2026-09-27，套件第二、三轮返工后）

第一次预演（`20260927-1741`）的复核与返工见[套件交接书 §7](A9_25_W40_KIT_HANDOFF.md)；第二轮 `2f14d69`、第三轮 `91df808` 已通过开发机门，于 `5a20663` 并入 `codex/a9-alpha2`。
第二次预演按本交接书正文执行，以下差异优先：

1. **构建源**：在套件工作树执行 `git merge --ff-only 5a20663`，构建前确认工作树干净且 HEAD 为 `5a20663`。
2. **目录**：新的日期目录与新的计划任务名；本机预演目录改为**主工作区** `/Users/qlyf/Developer/win7-coding-Agent/.acceptance/rehearsals/A9-25-W40/<新的 YYYYMMDD-HHMM>/`，
   不再放在套件工作树内。第一次预演的本机目录（套件工作树内原件与主工作区副本）与 Win7 运行根只读保留，不得覆盖或删除。
3. **报告字段**：`REHEARSAL_REPORT.json` 增加 `previous_rehearsal: "20260927-1741"`；`phases[]` 的 `duration_ms` 取 smoke 总报告中的阶段计时（含 `timing_error` 如有）。
   `suspected_kit_issues[]` 逐条说明 K-01～K-06 本次是否仍出现，并附证据文件。
4. **重点观察**（在 §5 各项基础上补充）：
   - K-01：`w40-05-diff.png`、`w40-13-checkpoint-paging.png`、`w40-22-layout.png` 是否可见检查器“改动”页签与对应文件 Diff（只描述所见）；截图后 DOM 复核字段的原值；
   - K-02 / W40-20：`unrecoverableStatus`、匹配到的 `unrecoverable` 条目与 `.review-unrecoverable` 渲染文本原文；
   - K-03 / W40-21：界面层观察（对话框、文案、选项、发送按钮、模式）、`submitTurn` 原始响应、`w40-21-tool-results.json` 是否生成及其中写工具结果摘录、`review-denied.txt` 哈希采样；
   - K-05 / W40-06：`w40-06-stop-exit.json` 中 `pid`、`childGone`、`elapsedMs`、界面终态文本、`agentStatus`、`a9_turns` 状态；
   - K-06 / W40-22：检查器包围盒与 `transform`、三个按钮的包围盒、`innerWidth`/`innerHeight`/`devicePixelRatio`、`scrollWidth`/`clientWidth`；
   - K-04：17 个阶段的 `started_at`、`ended_at`、`duration_ms`。
5. 若本次 17 个阶段与 22 个用例均无套件问题，报告中写明；是否进入第 3 步（正式实机交接书）由审核方决定，执行方不作结论。

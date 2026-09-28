# A9-25 W41 验证套件 Win7 预演交接书（连续两次）

> 执行方：外部执行 Agent（新会话）。审核方：发出本交接书的会话（A9-25 验收方）。执行方只交原始证据与事实报告，不对任何用例下 PASS/FAIL 结论。
> 授权依据：[A9-25](../tasks/A9_25_WIN7_40_REISSUE_AND_ACCEPTANCE.md) §9 第 5 项第 ② 步（ADR-0145）：冻结前在 Win7 连续预演至少 2 次且全部通过。
> 本交接书把 [W40 预演交接书](A9_25_W40_REHEARSAL_HANDOFF.md) 正文与附录 A、B 的做法合并为正文；WIN7-40 实机失败的根因与 R6 修复见 [W41 套件交接书](A9_25_W41_KIT_HANDOFF.md)。

## 0. 性质与边界（先读）

- 这是**套件预演**，不是验收。构建非正式，**不冻结、不签发 authority、不生成 pin**；全部证据标 `REHEARSAL_NOT_ELIGIBLE`，不计入任何候选结论，不改任何任务状态。
- 目的：确认 R6 修复后的 W41 套件在 Win7 真实运行中**稳定**。本次包含**两次**完整预演（下称 R1、R2），使用同一构建、各自独立的目录与计划任务，R1 结束并完成后飞行后再开始 R2。
- 预演中发现的问题只记录，不修复；区分套件问题与疑似产品缺陷并写明依据。
- 不改产品代码、套件代码或任何文档；不在验收机上安装软件、改系统设置（含 DPI）、注册表或服务，不提权运行产品。
- **修正自产文件一律另存新文件名**（例如 `…-v2.json`），原文件保留不动，并在 `deviations[]` 登记；不得同名重写任何已产生的文件。

## 1. 起点

- 套件源码：`codex/a9-alpha2` @ `5d671bc`（W41 套件并入提交）。在套件工作树 `/Users/qlyf/Developer/win7-coding-agent-w40-kit` 执行 `git switch codex/a9-25-w41-kit` 后
  `git merge --ff-only 5d671bc`，构建前确认工作树干净且 HEAD 为 `5d671bc`。不使用主工作区构建。
- 构建输入（本机 `.acceptance/deps/`，哈希须与 `release/win7-product-v3/a9-25-win7-41-input-lock.json` 一致）：Electron `electron/electron-v22.3.27-win32-x64.zip`（`ad723ed7…`）、
  D-013 helper `d013-v25-r15/WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip`（`7485cf22…`）、A6 SQLite `a6/WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip`（`2cb0cd32…`）。
- 目标机与连接：沿用 [WIN7-40 实机交接书](A9_25_WIN7_40_ACCEPTANCE_HANDOFF.md) §4.1（地址 `192.168.1.3`、主机键别名、SSH 管理账户 `dccs-chaizl` 只用于传输、哈希、计划任务与取回）。
  **不得读取、输出、复制私钥内容；主机键不匹配立即停止。**

## 2. 本机准备（两次共用一次构建）

1. 预演目录（主工作区）：`/Users/qlyf/Developer/win7-coding-Agent/.acceptance/rehearsals/A9-25-W41/<YYYYMMDD-HHMM>/`（下称 `<R>`），含 `build/`、`R1/`、`R2/`；
   `R1/`、`R2/` 下各有 `evidence/`、`scripts/`、`RUN_LOG.md`。每一步完成后立即追加 `RUN_LOG.md`，不得事后补写。既有 A9-25-W40 预演目录与 Win7 运行根只读保留。
2. 构建：`node scripts/release/build-a9-product-v3.mjs --formal-input-lock release/win7-product-v3/a9-25-win7-41-input-lock.json --electron-zip <…> --runner-zip <…> --storage-zip <…> --output <R>/build`；
   记录退出码、构建结果 JSON、ZIP 与 manifest 的 SHA-256。构建失败即停止。

## 3. 每次预演的 Win7 步骤（R1、R2 各执行一遍）

记号：运行根 `<W>` = `C:\A9-W41\预演 目录\<YYYYMMDD-HHMM>-R<n>\`，其下 `package\`、`evidence\`、`scripts\`；候选根 `<C>` = `<W>\package\Win7CodingAgent-0.3.0-alpha.1-win7-x64\`。

1. **连接与会话（只读）**：`cmd /c ver`、`query user`（退出码可能为 1，以表内状态为准）、`tasklist /v`；确认 `agent` 为交互桌面活动会话、无 `electron.exe` 残留。`agent` 未登录则停止。
2. **上传与哈希**：上传 ZIP 到 `<W>\package\`，`certutil -hashfile` 复算须与 §2 一致，再展开。
3. **计划任务**：`.cmd` CRLF、纯 ASCII（自检除外），开头写 `whoami /groups` 并检查 `S-1-16-8192`；任务 XML 以 **CP936** 注册，`agent` SID、`InteractiveToken`、`LeastPrivilege`；
   回读先 `chcp` → `chcp 936` → `schtasks /query /xml`，失败则用 Task Scheduler COM 导出逐字段核对（任务名、完整 `.cmd` 路径与参数、工作目录、SID、`InteractiveToken`、`LeastPrivilege`），
   任一不一致即停止；回读 XML 另存 UTF-16LE 副本。任务名带 `R<n>` 与日期。
4. **自检任务**：启动 smoke 前取得 `agent` 身份、Medium 令牌与中文参数原样传递的证据。
5. **完整性**：预演不生成 authority，`RUN_A9_25_W41_INTEGRITY.cmd` 记 `NOT_PERFORMED`，不得伪造或临时生成 authority。
6. **smoke**：以 `agent` 经计划任务在 `<C>` 设置 `ELECTRON_RUN_AS_NODE=1` 并运行 `.\electron.exe .\validation\a9-win7-41-smoke.cjs "--evidence-root=<W>\evidence\smoke"`，
   控制台输出存 `evidence\smoke-console.txt`。Git 由 smoke 自动解析，不改 PATH。阶段超时由 smoke 自身控制，不得中途终止；运行期间不操作桌面、不调整窗口或 DPI；总时长超过 3 小时按 §6 处理。
7. **后飞行**：`tasklist /v` 与 `wmic process get ProcessId,ParentProcessId,SessionId,Name,CommandLine /format:csv` 确认无 `electron.exe`、helper 或测试 Shell 残留
   （特别核对 `w41-06-stop-exit.json` 中的停止用例 PID）；残留时记录，**不得先强杀再报零残留**。删除本次全部计划任务并保存原始输出；再次复算 ZIP 哈希。Win7 运行根保留。
8. **取回与校验**：取回 `<W>\evidence\` 与 `<W>\scripts\` 到 `<R>/R<n>/`，逐文件核对 Win7 端与本机哈希。

两次都完成后：
9. **秘密扫描**：对 `<R>/` 全部文件（含二进制与 SQLite）扫描私钥头、`BEGIN .* PRIVATE KEY`、`Authorization:`、`Bearer `、`api[_-]?key`、`sk-` 及 M1b 口令形态（`w41user:` 后不是 `***redacted***`），
   结果存 `<R>/secret-scan.txt`，逐条标明来源分类。
10. **清单**：生成 `<R>/SHA256SUMS.txt`，覆盖 `build/` 结果文件、`R1/`、`R2/`、`secret-scan.txt` 与报告的全部文件（清单本身除外）。

## 4. 需要取回并在报告中列出的产物（每次）

smoke 证据目录全部文件，至少包括 `automatic-smoke.json`、17 个阶段报告（`first`、`second`、`retry`、`stop`、`live`，`w41_startup`、`w41_git`、`w41_m1_small`、`w41_m1_large`、`w41_m1b`、`w41_m2`、`w41_m3`、`w41_m4`，
`w41_stop`、`w41_review`、`w41_review_restart`、`w41_review_mode`）、`w41-case-index.json`、`w41-02-paths.json`～`w41-22-layout.json` 与全部截图。缺失的文件在报告中列出，不补造。

## 5. 每次需报告的原始观察

1. smoke 退出码与总报告 `status` 原值；17 个阶段的 `exit_code`、`status`、`duration_ms`、`error`/`blocked_reason`；22 个用例的 `result`、`reason`；全部断言中 `passed` 不为 `true` 的条目原文。
2. **R6 相关**：`w41_review` 阶段是否完整结束；`w41-17-undo.json` 中逐文件撤销的消息与 `notes.md` 哈希；若出现等待超时，摘录记录的最后观察（`aria-expanded`、按钮是否存在与 `disabled`、`#a9-undo-state`）。
3. W41-06：`pid`、`childGone`、`elapsedMs`、终态；W41-20：`unrecoverableStatus` 与渲染文本；W41-21：界面层观察、`submitTurn` 响应、写工具结果；W41-22：检查器与按钮几何、`devicePixelRatio`。
4. W41-05、W41-13、W41-22 截图是否可见检查器“改动”页签与对应 Diff（只描述所见）。
5. 两次之间的差异：阶段耗时、断言结果或证据内容有任何不同时逐项列出。

## 6. 硬停止条件

出现以下任一，停止后续步骤（含未开始的 R2），完成可安全进行的后飞行后交回：主机键不匹配、SSH 认证失败、`agent` 未登录或令牌不是 Medium；构建失败或 Win7 端 ZIP 哈希不一致；
计划任务回读门字段不一致或乱码；需要输入任何密码或密钥或以管理员身份运行产品；smoke 超过 3 小时未结束（记录进程表后终止并写明人工终止）；本文与候选实际行为不一致。

**R1 的 smoke 失败不是停止条件**：R1 照常完成后飞行与取回，**仍须执行 R2**，以观察失败是否可重复。

## 7. 交回内容

1. `<R>/` 完整目录（`build/` 结果文件、`R1/`、`R2/`、`SHA256SUMS.txt`、`secret-scan.txt`）。
2. `<R>/REHEARSAL_REPORT.json`：`eligibility: "REHEARSAL_NOT_ELIGIBLE"`、`kit_commit`、`zip_sha256_local`、`host_key_ok`，以及 `runs[]`（R1、R2 各一项：`zip_sha256_win7`、`agent_session`、`readback_gate`、
   `steps[]`、`phases[]`、`assertions_not_true[]`、`case_index[]`、`pending_items[]`（§5 各项原始观察）、`postflight`、`stop_reason`）、`differences_between_runs[]`、`suspected_kit_issues[]`、
   `suspected_product_issues[]`、`deviations[]`。
3. 报告只写观察到的事实与数值，不写 PASS/FAIL/通过/失败。

## 8. 预演之后

审核方基于原始证据复核：两次均无套件问题且全部用例在两次中都成立，才进入 §9 第 ③ 步（WIN7-41 实机交接书）；任一次出现套件问题，回到套件分支修复并重过开发机门，之后重新做连续两次预演。

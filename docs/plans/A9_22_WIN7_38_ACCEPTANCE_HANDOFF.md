# A9-22 / WIN7-38 Win7 实机验收交接书（执行方：外部模型）

```text
Status: DRAFT_READY_FOR_FREEZE（待步骤 3 冻结候选并由审核方填写 §3，待步骤 4 负责人签发 authority）
Scope: A9-22 WIN7-38 换发与实机验收（A9-20 Git 确认分类器绕过修复 + A9-21 运行时加固移植）
Executor: 外部执行模型（负责人指定，例如 Gemini 3.8 Flash）
Reviewer: Claude（最终审核，基于原始证据，不基于执行方摘要）
Owner: 项目负责人（批准换发合同、签发候选外授权、最终裁决）
```

本文件不是实现授权，也不授权任何人签发 PASS。执行方只负责**按步骤执行并原样取证**；
是否通过由审核方核对原始证据后给出建议，负责人裁决。

## 1. 分工

| 工作 | 负责方 | 原因 |
|---|---|---|
| A. WIN7-38 换发依据（ADR-0141、A9-22 任务书授权、C14 路径） | 审核方起草，负责人批准 | 影响候选身份与白名单，需负责人决定 |
| B. 发布管线：WIN7-38 profile、input lock、完整性/报告/smoke 脚本、验证 Kit、回归测试、双独立干净构建 | 审核方 | 代码量大、易出错；防止旧候选字面量残留 |
| C. 候选外 `WIN7_38_RELEASE_AUTHORITY` 与独立 SHA-256 pin | 负责人 | 必须在 ZIP 哈希确定后独立批准 |
| **D. Win7 实机执行与取证（本文 §4–§7）** | **执行方** | 步骤固定、可脚本化，适合按手册执行 |
| E. 证据审核与裁决建议 | 审核方；负责人裁决 | 需要逐项对照原始证据与合同 |

执行方只能在 §2 的前置条件全部满足后开始 D。

## 2. 开始前必须全部满足（任一不满足即不开始）

1. 本文件 `Status` 已由审核方改为 `READY_FOR_EXECUTION`，§3 表格无空项。
2. 负责人已批准 WIN7-38 换发（`docs/DECISIONS.md` 中 ADR-0141 为 Accepted）。
3. 候选冻结在本机 `.acceptance/candidates/WIN7-38/`，其 `release-manifest.json` 为 `source_dirty=false`、
   `external_acceptance_eligible=true`，两份独立构建 ZIP 逐字节一致。
4. 候选外授权 `authority/release-authority.json` 与其 `.sha256` pin 已由负责人签发，绑定 §3 的精确 ZIP SHA-256 与目标 IP。
5. 负责人已在 Win7 控制台以 `agent` 登录（`query user` 显示 `agent` 为 `console`、状态“运行中”）。

## 3. 候选身份（由审核方在冻结后填写）

| 项 | 值 |
|---|---|
| 候选 ID | WIN7-38 |
| 源码提交 | 待步骤 3 冻结后填入 |
| ZIP 文件名 / SHA-256 | `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip` / 待填入（本机冻结于 `.acceptance/candidates/WIN7-38/`） |
| manifest SHA-256 | 待填入 |
| input lock SHA-256 | 待填入 |
| authority SHA-256 | 待步骤 4 签发后填入（`release-authority.json`；独立 pin 为同目录 `release-authority.json.sha256`） |
| run-id（已绑定在 authority 中，不得另起） | 待步骤 4 签发后填入 |
| authority 与锁文件位置（本机） | `.acceptance/runs/A9-22-W38/<run-id>/authority/` |
| 目标主机（已绑定在 authority 中） | `192.168.1.3`；地址变化时停止并请负责人重签 authority |
| 完整性命令 / 报告命令 / smoke 脚本 | `RUN_A9_22_W38_INTEGRITY.cmd` / `RUN_WIN7_38_REPORT_VERIFY.cmd` / `validation\a9-win7-38-smoke.cjs`（用法见候选内 `A9_22_WIN7_38_VALIDATION.md`） |
| Win7 运行根目录 | `C:\A9-W38\<run-id前8位>` |

## 4. 环境与连接

- 目标：Win7 SP1 x64（build 7601），当前地址 `192.168.1.3`。
- SSH 管理账户 `dccs-chaizl`（管理员，只用于传输、哈希、注册计划任务与取回证据）；产品一律以普通用户 `agent`
  （SID `S-1-5-21-1708701742-428676696-1831205153-1001`）Medium 非提升令牌运行。
- 私钥 `.acceptance/ssh/id_rsa_win7accept`、known_hosts `.acceptance/ssh/known_hosts_win7`。**不得读取、输出、复制私钥内容。**
- 连接参数固定为：

  ```text
  ssh -i .acceptance/ssh/id_rsa_win7accept -o BatchMode=yes -o IdentitiesOnly=yes \
      -o StrictHostKeyChecking=yes -o UserKnownHostsFile=.acceptance/ssh/known_hosts_win7 \
      -o HostKeyAlias=192.168.1.11 -o ConnectTimeout=15 dccs-chaizl@<IP> "<cmd>"
  ```

  `HostKeyAlias=192.168.1.11` 用于严格核对同一台物理机的固定主机键。**主机键不匹配时立即停止，不得接受新键。**
- 产品以计划任务在 `agent` 的交互桌面启动：任务 XML（UTF-16）主体为上述 SID、`LogonType=InteractiveToken`、
  `RunLevel=LeastPrivilege`，动作调用运行目录内的 `.cmd`，并把控制台输出重定向到 `evidence\`。每个 `.cmd` 开头必须先写
  `whoami /groups` 并检查 `S-1-16-8192`（Medium），不满足以退出码 4 结束。

## 5. 执行步骤

每一步完成后把结果追加到本机运行目录的 `RUN_LOG.md`（时间、命令、退出码、关键输出），不得事后补写。

1. **G0 连接与会话**：只读执行 `cmd /c ver` 与 `query user`；记录主机键核对结果、`agent` 会话状态、`tasklist` 中无 `electron.exe`。
2. **G0 上传与哈希**：在 Win7 创建 `C:\A9-W38\<run-id前8位>\{package,evidence,scripts,authority}`；上传候选 ZIP 与 authority；
   在 Win7 上用 `certutil -hashfile <zip> SHA256` 复算，必须与 §3 完全一致，再展开到 `package\`。
3. **G1 完整性**：以 `agent` 运行 §3 的完整性命令 `RUN_A9_22_W38_INTEGRITY.cmd`；退出码必须为 0，输出文件原样取回。
4. **G2 自动 smoke**：以 `agent` 运行 smoke `a9-win7-38-smoke.cjs`；要求退出码 0 且报告 `status=PASS`；包含 G1/G2、A9-20 绕过拦截、M1 启动定向恢复、M1b 正则与脱敏、M2 输出上限截断、M3 checkpoint 分页、M4 集合上限。
5. **G3 详细用例验证与报告**：执行 §6 用例，由候选内自带报告验证器 `RUN_WIN7_38_REPORT_VERIFY.cmd` 核验通过。
6. **后飞行**：产品全部关闭；`tasklist` 无 `electron.exe`、helper 或测试 Shell 残留；再次复算候选 ZIP 与展开目录关键文件哈希，必须不变；删除本次注册的计划任务。
7. **取回**：把 `C:\A9-W38\<run-id前8位>\evidence\` 全部取回到本机 `.acceptance/runs/A9-22-W38/<run-id>/evidence/`，并生成 `SHA256SUMS.txt`（每个文件一行）。

## 6. 用例细化（W38-01～W38-15）

| 用例 ID | 目标与步骤 | 判定要点 | 必需证据文件 |
|---|---|---|---|
| **W38-01-CANDIDATE-INTEGRITY** | 运行 `RUN_A9_22_W38_INTEGRITY.cmd`，核对候选内所有文件、ZIP 哈希、input lock、validation kit 与 authority 签名 pin | 退出码为 0，stderr 为空，所有文件哈希与 lock 逐项一致 | `evidence/integrity-output.txt` |
| **W38-02-CHINESE-SPACE-PATH** | 候选解压并放置于含中文和空格的路径（例如 `C:\A9-W38\测试 目录\<run-id>\`），从中启动验证脚本 | 路径不发生乱码报错，所有内部组件、better-sqlite3 与 helper 正常加载 | `evidence/chinese-space-path-test.txt` |
| **W38-03-STARTUP-WORKSPACE-SELECT** | 以 `agent` 普通用户首次启动，展示工作台、工作区选择对话框 | 窗口 60 秒内正常呈现，无白屏，无未捕获异常 | `evidence/w38-03-startup.png`, `evidence/w38-03-startup.json` |
| **W38-04-TASK-READ-EDIT-SHELL** | 完整任务链路：执行 `read` 读取目标文件、`edit` 应用修改、`shell` 运行测试命令验证 | 步骤依次完成，工具调用成功，产出符合预期结果 | `evidence/w38-04-task-flow.json` |
| **W38-05-DIFF-AND-CHECKPOINT** | 对话执行后产生 checkpoint，打开 Diff 视图比对文件改动 | Diff 正确呈现增删行，检查点快照与元数据持久化完整 | `evidence/w38-05-diff.png`, `evidence/w38-05-diff.json` |
| **W38-06-APPROVAL-STOP-RESTART** | 触发删除或高影响操作，用户点击拒绝；启动长时间 Shell 任务后点击 Stop；关闭产品后重新打开恢复会话 | 拒绝后被保护文件无副作用保留；Stop 后子进程 PID 立即消失；重启后历史会话与状态正常恢复 | `evidence/w38-06-approval-stop-restart.json` |
| **W38-07-A9-20-CMD-CONCAT-GIT-CONFIRM** | 模拟/执行 `cmd /c"git push origin main"` 命令 | 分类器正确识别出 Git 外部写意图，触发一次性目标绑定确认弹窗；用户拒绝后命令不执行，零副作用 | `evidence/w38-07-cmd-concat.json` |
| **W38-08-A9-20-POWERSHELL-PREFIX-GIT-CONFIRM** | 模拟/执行 `powershell -co "git push origin main"` 或 `powershell -NoProfile -c"git push origin main"` 命令 | 分类器正确解包参数前缀与相连引号，触发一次性目标绑定确认；拒绝后零副作用 | `evidence/w38-08-ps-prefix.json` |
| **W38-09-A9-20-POWERSHELL-POSITIONAL-GIT-CONFIRM** | 模拟/执行 `powershell "git push origin main"`（位置参数形式）命令 | 分类器正确将位置参数识别为待执行命令并解包，触发确认；拒绝后零副作用 | `evidence/w38-09-ps-positional.json` |
| **W38-10-M1-STARTUP-TARGETED-RECOVERY** | 在 SQLite 数据库预置 >= 100 个历史 Turn（其中包含 1 个 `interrupted` 且缺 checkpoint 的 Turn），启动产品 | 测量启动耗时（秒级以内，不随历史 Turn 数量线性增长）；中断 Turn 按 M1 规则定向处理（恢复或记为 missing/quarantined），正常 Turn 保持完整 | `evidence/w38-10-startup-recovery.json` |
| **W38-11-M1B-HEX-FREEZE-AND-URL-REDACTION** | 在工作区中预置 1 MiB 单行十六进制文件；触发基线冻结与检查点；在诊断或事件流中注入 `https://user:password@host` URL | 基线冻结耗时在秒级以内，无 CPU 卡死；诊断日志与事件流中 URL 凭据被脱敏替换，无明文密码泄露 | `evidence/w38-11-m1b-hex-redaction.json` |
| **W38-12-M2-OUTPUT-LIMITS** | 通过本地回环模型桩返回超过 1 MiB 的响应内容 | 客户端增量截断，界面可见截断说明，未收全或截断的工具调用不予执行，轮次标记为 `COMPLETED_WITH_WARNINGS`；下一轮对话可继续正常执行 | `evidence/w38-12-output-limits.json` |
| **W38-13-M3-CHECKPOINT-PAGINATION** | 在数据库预置 >= 60 条 checkpoint 记录，打开检查器查看 checkpoint 列表 | 检查器正确分页（显示最近记录及总数），加载更早记录连续稳定，能对更早记录发起 Diff 比对 | `evidence/w38-13-checkpoint-paging.json` |
| **W38-14-M4-COLLECTION-BOUNDS** | 产生或预置超过 2000 条事件记录 | 界面展示省略/释放数量提示（如“已省略更早 N 条”），过程记录流连续，渲染端内存不随事件无界增长 | `evidence/w38-14-collection-bounds.json` |
| **W38-15-SECRET-SCAN-AND-POSTFLIGHT** | 运行秘密扫描工具扫描运行目录与证据目录；检查系统进程树 | 秘密扫描零命中（无私钥、Token、API Key 泄露）；无 Electron/helper 残留进程 | `evidence/w38-15-secret-scan.txt`, `evidence/postflight-tasklist.txt` |

## 7. 硬停止条件（出现任一即停止后续步骤，如实记录后交回）

- 主机键不匹配、SSH 认证失败、`agent` 未登录或令牌不是 Medium。
- 任何哈希与 §3 或授权不一致；授权缺失或 pin 不匹配。
- G1 或 G2 失败、退出码与报告状态矛盾、出现 Electron/helper 残留。
- 产品窗口 60 秒内未出现，或任一脚本异常退出。
- 需要输入任何密码、密钥，或需要以管理员身份运行产品。

停止后**不得**：修改候选、重打包、替换文件、重签授权、改写已产生的证据或把失败改记为通过。未执行的步骤一律记 `NOT_PERFORMED`。

## 8. 交回内容与汇报格式

交回给审核方的必须是**原始证据**，不是摘要：

1. `.acceptance/runs/A9-22-W38/<run-id>/` 完整目录（`evidence/`、`scripts/`、`RUN_LOG.md`、`SHA256SUMS.txt`）。
2. `EXECUTOR_REPORT.json`，字段固定：`run_id`、`target_ip`、`host_key_ok`、`agent_session`、`zip_sha256_win7`、
   `authority_sha256`、`steps[]`（每步：`name`、`started_at`、`exit_code`、`status` ∈ {`DONE`,`FAILED`,`NOT_PERFORMED`}、`evidence_files[]`）、
   `cases[]`（每项：`id`、`observed`（原样事实，不写判断）、`evidence_files[]`）、`stop_reason`（未停止为 `null`）、
   `deviations[]`（任何与本手册不同的操作，包括重试）。
3. 执行方**不得**在报告中使用 PASS/FAIL/通过/失败 裁决任何用例；只写观察到的事实与数值。

## 9. 审核方核对清单（执行方无需执行，仅供知悉）

审核方会独立完成：复算 `SHA256SUMS.txt` 与候选、授权哈希；逐项打开截图与 JSON，对照 §6 条件；核对时间线与断言结果；检查 `RUN_LOG.md` 与 `deviations[]` 是否有未报告的重试或改动；检查报告与证据中无密钥。
任何无法由原始证据支撑的结论都会按 `INSUFFICIENT_EVIDENCE` 处理。

# A9-19 / WIN7-37 Win7 实机验收交接书（执行方：外部模型）

```text
Status: DRAFT_PENDING_CANDIDATE（候选冻结与授权完成后，由审核方填写 §3 并改为 READY_FOR_EXECUTION）
Scope: A9-19 运行过程实时可见与工作台布局二期（b4c138b + 9d82ed1）
Executor: 外部执行模型（负责人指定，例如 Gemini 3.8 Flash）
Reviewer: Claude（最终审核，基于原始证据，不基于执行方摘要）
Owner: 项目负责人（批准换发合同、签发候选外授权、最终裁决）
```

本文件不是实现授权，也不授权任何人签发 PASS。执行方只负责**按步骤执行并原样取证**；
是否通过由审核方核对原始证据后给出建议，负责人裁决。

## 1. 分工

| 工作 | 负责方 | 原因 |
|---|---|---|
| A. WIN7-37 换发合同（ADR、任务书授权节、C14 路径） | 审核方起草，负责人批准 | 影响候选身份与白名单，需负责人决定 |
| B. 发布管线：WIN7-37 profile、input lock、完整性/报告/smoke 脚本、验证 Kit、正负向回归、双独立干净构建 | 审核方 | 代码量大、易出错；WIN7-29 曾因旧候选字面量残留作废 |
| C. 候选外 `WIN7_37_RELEASE_AUTHORITY` 与独立 SHA-256 pin | 负责人 | 必须在 ZIP 哈希确定后独立批准 |
| **D. Win7 实机执行与取证（本文 §4–§7）** | **执行方** | 步骤固定、可脚本化，适合按手册执行 |
| E. 证据审核与裁决建议 | 审核方；负责人裁决 | 需要逐项对照原始证据与合同 |

执行方只能在 §2 的前置条件全部满足后开始 D。

## 2. 开始前必须全部满足（任一不满足即不开始）

1. 本文件 `Status` 已由审核方改为 `READY_FOR_EXECUTION`，§3 表格无空项。
2. 负责人已批准 WIN7-37 换发合同（`docs/DECISIONS.md` 中对应 ADR 为 Accepted）。
3. 候选冻结在本机 `.acceptance/candidates/WIN7-37/`，其 `release-manifest.json` 为 `source_dirty=false`、
   `external_acceptance_eligible=true`，两份独立构建 ZIP 逐字节一致。
4. 候选外授权 `authority/release-authority.json` 与其 `.sha256` pin 已由负责人签发，绑定 §3 的精确 ZIP SHA-256 与目标 IP。
5. 负责人已在 Win7 控制台以 `agent` 登录（`query user` 显示 `agent` 为 `console`、状态“运行中”）。

## 3. 候选身份（由审核方在冻结后填写）

| 项 | 值 |
|---|---|
| 候选 ID | WIN7-37 |
| 源码提交 | `dd6cb1a9aeebb366478e155267996ea03653667b` |
| ZIP 文件名 / SHA-256 | `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip` / `4d70063254212ca581b7b3dac9f89edc81a2ba31a53b51a6b1c1d65667f167cf`（101,369,111 B；本机冻结于 `.acceptance/candidates/WIN7-37/`） |
| manifest SHA-256 | `bad63b4ce9f881d42bfd4426ccd5bdae58916ea7c284b5c1bbc8cc17e08ea27c` |
| input lock SHA-256 | `a64a8b6833d6d7f6b1db603416a7e7e27ddad354f5a54a00c6b3be115aa04cbe` |
| authority SHA-256 | 【待负责人签发后由审核方填写】 |
| 完整性命令 / 报告命令 / smoke 脚本 | `RUN_A9_19_W37_INTEGRITY.cmd` / `RUN_WIN7_37_REPORT_VERIFY.cmd` / `validation\a9-win7-37-smoke.cjs`（用法见候选内 `A9_19_WIN7_37_VALIDATION.md`） |
| Win7 运行根目录 | `C:\A9-W37\<run-id>`（run-id 由执行方生成：8 位十六进制） |

## 4. 环境与连接

- 目标：Win7 SP1 x64（build 7601），当前地址 `192.168.1.3`（地址会变化，以负责人最新告知为准）。
- SSH 管理账户 `dccs-chaizl`（管理员，只用于传输、哈希、注册计划任务与取回证据）；产品一律以普通用户 `agent`
  （SID `S-1-5-21-1708701742-428676696-1831205153-1001`）Medium 非提升令牌运行。
- 私钥 `.acceptance/ssh/id_rsa_win7accept`、known_hosts `.acceptance/ssh/known_hosts_win7`。**不得读取、输出、复制私钥内容。**
- 连接参数固定为：

  ```text
  ssh -i .acceptance/ssh/id_rsa_win7accept -o BatchMode=yes -o IdentitiesOnly=yes
      -o StrictHostKeyChecking=yes -o UserKnownHostsFile=.acceptance/ssh/known_hosts_win7
      -o HostKeyAlias=192.168.1.11 -o ConnectTimeout=15 dccs-chaizl@<IP> "<cmd>"
  ```

  `HostKeyAlias=192.168.1.11` 用于严格核对同一台物理机的固定主机键。**主机键不匹配时立即停止，不得接受新键。**
- 产品以计划任务在 `agent` 的交互桌面启动：任务 XML（UTF-16）主体为上述 SID、`LogonType=InteractiveToken`、
  `RunLevel=LeastPrivilege`，动作调用运行目录内的 `.cmd`，并把控制台输出重定向到 `evidence\`。每个 `.cmd` 开头必须先写
  `whoami /groups` 并检查 `S-1-16-8192`（Medium），不满足以退出码 4 结束。参照模板：
  `.acceptance/runs/WIN7-36/9d9b5cab-96ec-47e2-b7b3-8102a9ab6909/scripts/`（正式验收）与
  `.acceptance/runs/A9-19-EXPLORE/x19-20260924-2213-458698/`（A9-19 探索性运行，含真实 Provider 驱动 `driver-app/main.cjs`）。

## 5. 执行步骤

每一步完成后把结果追加到本机运行目录的 `RUN_LOG.md`（时间、命令、退出码、关键输出），不得事后补写。

1. **G0 连接与会话**：只读执行 `cmd /c ver` 与 `query user`；记录主机键核对结果、`agent` 会话状态、`tasklist` 中无 `electron.exe`。
2. **G0 上传与哈希**：在 Win7 创建 `C:\A9-W37\<run-id>\{package,evidence,scripts,authority}`；上传候选 ZIP 与 authority；
   在 Win7 上用 `certutil -hashfile <zip> SHA256` 复算，必须与 §3 完全一致，再展开到 `package\`。
3. **G1 完整性**：以 `agent` 运行 §3 的完整性命令；退出码必须为 0，输出文件原样取回。
4. **G2 自动 smoke**：以 `agent` 运行 smoke；要求退出码 0 且报告 `status=PASS`；报告中的迟到加载、受控 ERROR 两个反例、
   非零退出码与零残留记录必须齐全；第五阶段 `live` 的 `A9-W37-LIVE-*`、`A9-W37-RAIL-PRESERVED-*`、`A9-W37-HEADER-AND-LABELS`
   断言必须全部存在，报告中的 `live_progress` 原样取回。
5. **G3 正式入口首绘**：以 `agent` 无参数启动产品，按 0 / 250 / 500 / 1000 / 10000 ms 截屏；正常关闭后重启再截一轮。
6. **G3 用例**：按 §6 的用例表执行，每个用例单独的计划任务与证据子目录；真实 Provider 只能使用 `agent` 已保存的配置，
   **任何密钥不得出现在命令、脚本、截图或报告中**。
7. **后飞行**：产品全部关闭；`tasklist` 无 `electron.exe`、helper 或测试 Shell 残留；再次复算候选 ZIP 与展开目录关键文件哈希，必须不变；
   删除本次注册的计划任务。
8. **取回**：把 `C:\A9-W37\<run-id>\evidence\` 全部取回到本机 `.acceptance/runs/WIN7-37/<run-id>/evidence/`，并生成
   `SHA256SUMS.txt`（每个文件一行）。

## 6. 用例（以冻结 Kit `A9-19-WIN7-37-LIVE-PROGRESS-20260925-01` 为准）

继承 WIN7-36 的 15 项（`W36-01` … `W36-15` 改为 `W37-01` … `W37-15`，语义不变），新增：

| ID | 可观察条件 | 证据 |
|---|---|---|
| W37-16-LIVE-PROCESS | 真实 Provider 轮次中，每个 `tool_start`/`model_note` 在落盘后 ≤1.5 s 出现在对话流；运行中工具卡显示“已运行 N 秒 · 执行中”；Shell 显示“输出将在命令结束后显示” | 每秒一次的“落盘事件计数 vs DOM”时间线 JSON + 每 2 秒截图 |
| W37-17-LIVE-MODEL-PREVIEW | 模型生成最终回答期间，至少一次采样中对话流出现“模型正在输出”预览且字符数 > 0，早于 `turn_completed` | 同上 |
| W37-18-ROW-TITLES | 1366×768、125% DPI 下对话行可见标题（前 6 行每行 ≥6 个中文字符宽度），时间为短格式 | DOM 量测 JSON + 截图 |
| W37-19-CONVERSATION-HEIGHT | 实际可用视口 1079×540 下，运行中对话流高度 ≥ 视口 55% | DOM 量测 JSON |
| W37-20-RAIL-PRESERVED | 桌面宽度下新建/切换对话与切换工作区后，左栏保持打开（`.workbench` 无 `rail-closed`，截图可见左栏） | 操作前后 DOM 与截图 |
| W37-21-HEADER-AND-LABELS | 头部只显示权限与运行状态；界面无 `REQUEST`/`CONVERSATIONS`/`INSPECTOR`/`tool_calling` 等文案；左栏无 Review 页签、无常驻停止按钮 | DOM 文本扫描 JSON + 截图 |

## 7. 硬停止条件（出现任一即停止后续步骤，如实记录后交回）

- 主机键不匹配、SSH 认证失败、`agent` 未登录或令牌不是 Medium。
- 任何哈希与 §3 或授权不一致；授权缺失或 pin 不匹配。
- G1 或 G2 失败、退出码与报告状态矛盾、出现 Electron/helper 残留。
- 产品窗口 60 秒内未出现，或任一脚本异常退出。
- 需要输入任何密码、密钥，或需要以管理员身份运行产品。

停止后**不得**：修改候选、重打包、替换文件、重签授权、改写已产生的证据或把失败改记为通过。未执行的步骤一律记 `NOT_PERFORMED`。

## 8. 交回内容与汇报格式

交回给审核方的必须是**原始证据**，不是摘要：

1. `.acceptance/runs/WIN7-37/<run-id>/` 完整目录（`evidence/`、`scripts/`、`RUN_LOG.md`、`SHA256SUMS.txt`）。
2. `EXECUTOR_REPORT.json`，字段固定：`run_id`、`target_ip`、`host_key_ok`、`agent_session`、`zip_sha256_win7`、
   `authority_sha256`、`steps[]`（每步：`name`、`started_at`、`exit_code`、`status` ∈ {`DONE`,`FAILED`,`NOT_PERFORMED`}、`evidence_files[]`）、
   `cases[]`（每项：`id`、`observed`（原样事实，不写判断）、`evidence_files[]`）、`stop_reason`（未停止为 `null`）、
   `deviations[]`（任何与本手册不同的操作，包括重试）。
3. 执行方**不得**在报告中使用 PASS/FAIL/通过/失败 裁决任何用例；只写观察到的事实与数值。

## 9. 审核方核对清单（执行方无需执行，仅供知悉）

审核方会独立完成：复算 `SHA256SUMS.txt` 与候选、授权哈希；逐项打开截图与 JSON，对照 §6 条件；核对时间线中每个事件的
“落盘 → DOM 可见”间隔；检查 `RUN_LOG.md` 与 `deviations[]` 是否有未报告的重试或改动；检查报告与证据中无密钥。
任何无法由原始证据支撑的结论都会按 `INSUFFICIENT_EVIDENCE` 处理。

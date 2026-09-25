# A9-19 / WIN7-37 Win7 实机验收交接书（执行方：外部模型）

```text
Status: CLOSED（2026-09-25：附录 C 的 Win7 报告校验通过，负责人签发 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`；见任务书 §17）
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
| authority SHA-256 | `0d8d4f9456f42da4692fea7d27c03edcd4f91df3ba6985b623233e095a9d0616`（`release-authority.json`；独立 pin 为同目录 `release-authority.json.sha256`） |
| run-id（已绑定在 authority 中，不得另起） | `85476889-099d-46b6-b8a4-666e8e0b5d77` |
| authority 与锁文件位置（本机） | `.acceptance/runs/WIN7-37/85476889-099d-46b6-b8a4-666e8e0b5d77/authority/`（`release-authority.json`、`.sha256`、`a9-19-win7-37-input-lock.json`、`a9-v25-approved-kits.json`） |
| 目标主机（已绑定在 authority 中） | `192.168.1.3`；地址变化时停止并请负责人重签 authority |
| 完整性命令 / 报告命令 / smoke 脚本 | `RUN_A9_19_W37_INTEGRITY.cmd` / `RUN_WIN7_37_REPORT_VERIFY.cmd` / `validation\a9-win7-37-smoke.cjs`（用法见候选内 `A9_19_WIN7_37_VALIDATION.md`） |
| Win7 运行根目录 | `C:\A9-W37\85476889`（取 run-id 前 8 位） |

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
2. **G0 上传与哈希**：在 Win7 创建 `C:\A9-W37\85476889\{package,evidence,scripts,authority}`；上传候选 ZIP 与 authority；
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
8. **取回**：把 `C:\A9-W37\85476889\evidence\` 全部取回到本机 `.acceptance/runs/WIN7-37/85476889-099d-46b6-b8a4-666e8e0b5d77/evidence/`，并生成
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

1. `.acceptance/runs/WIN7-37/85476889-099d-46b6-b8a4-666e8e0b5d77/` 完整目录（`evidence/`、`scripts/`、`RUN_LOG.md`、`SHA256SUMS.txt`）。
2. `EXECUTOR_REPORT.json`，字段固定：`run_id`、`target_ip`、`host_key_ok`、`agent_session`、`zip_sha256_win7`、
   `authority_sha256`、`steps[]`（每步：`name`、`started_at`、`exit_code`、`status` ∈ {`DONE`,`FAILED`,`NOT_PERFORMED`}、`evidence_files[]`）、
   `cases[]`（每项：`id`、`observed`（原样事实，不写判断）、`evidence_files[]`）、`stop_reason`（未停止为 `null`）、
   `deviations[]`（任何与本手册不同的操作，包括重试）。
3. 执行方**不得**在报告中使用 PASS/FAIL/通过/失败 裁决任何用例；只写观察到的事实与数值。

## 9. 审核方核对清单（执行方无需执行，仅供知悉）

审核方会独立完成：复算 `SHA256SUMS.txt` 与候选、授权哈希；逐项打开截图与 JSON，对照 §6 条件；核对时间线中每个事件的
“落盘 → DOM 可见”间隔；检查 `RUN_LOG.md` 与 `deviations[]` 是否有未报告的重试或改动；检查报告与证据中无密钥。
任何无法由原始证据支撑的结论都会按 `INSUFFICIENT_EVIDENCE` 处理。

## 10. 附录 A：G3 补跑（2026-09-25，负责人接受审核建议）

首轮审核结论见本机 `.acceptance/runs/WIN7-37/85476889-099d-46b6-b8a4-666e8e0b5d77/REVIEW_REPORT.md` 与任务书 §16：
W37-05（>10 s 等待命名条款）、06、11、12、13、14、15、18 证据不足。本附录只补这 8 项；其余 13 项的首轮证据与审核结论不变，不重跑。

### 10.1 不变量

1. 候选、authority、run-id、目标主机与 §3 完全相同；不重跑 G1/G2，不重新展开或修改 `C:\A9-W37\85476889\package\`。
2. 首轮 `C:\A9-W37\85476889\evidence\` 与本机 `evidence/` 保持原样，不得覆盖、删除或改名。补跑证据只写入
   `C:\A9-W37\85476889\supp\evidence\`，取回到本机 `.acceptance/runs/WIN7-37/85476889-099d-46b6-b8a4-666e8e0b5d77/supplement/evidence/`。
3. **执行方不得自写、修改或替换探针。** 只能使用审核方准备并钉住哈希的补跑包：本机
   `.acceptance/runs/WIN7-37/85476889-099d-46b6-b8a4-666e8e0b5d77/supplement/`，其中 `apps/` 为 7 个探针，`scripts/` 为 7 个
   `.cmd` 与 7 个任务 XML。清单 `SUPPLEMENT_KIT.sha256` 共 28 行，清单自身 SHA-256 为
   `36bf38908ab73a97ad24ae7ad19b8ea76d341a690cb7afdcd7ff29706963fe82`。任何文件哈希不符即停止。
4. 探针全部通过 `webContents.capturePage` 截取产品窗口内容，不截桌面。执行方不得额外截桌面图；
   任何交回文件不得包含 IP 配置、网络适配器或其他与用例无关的主机信息。

### 10.2 步骤、探针与用例

严格按 S1→S7 顺序执行。S2 和 S3 复制 S1 产生的数据，S2–S7 使用 S1 构建的候选外运行时 `supp\rt`（与 WIN7-36 探针
运行时相同：候选文件 + `default_app.asar`，无 `resources\app`）。上一步的任务结束、`electron.exe` 全部退出后才能开始下一步。

| 步骤 | 任务 XML / 脚本 | 探针 | 覆盖 | 主要输出（`supp\evidence\`） |
|---|---|---|---|---|
| S1 | `task-A9W37S-S1-MEASURE.xml` / `RUN_S1_MEASURE_AS_AGENT.cmd` | `measure-app` | W37-11 A01–A07、12 A01–A06、13 A01–A04、14 A01–A04、15 A01–A05、18 A01–A03 | `s1-measure-result.json`、`s1-measure-visual\*.png` |
| S2 | `…-S2-SEARCH` | `search-probe-app` | W37-06 A01/A02、W37-14 A01/A03 | `search-activity-probe-v6.json`、`search-scroll-probe.png` |
| S3 | `…-S3-REMAINING-THREE` | `remaining-three-app` | W37-12/13/15 在物理 1079×540 下的左栏 × 检查器抽屉状态 | `w37s-12-13-15-physical-responsive-probe.json`、`w37s-remaining-*.png` |
| S4 | `…-S4-RESPONSIVE-EQ` | `responsive-equivalence-app` | W37-06 A03（1079×540 响应式形态） | `w37s-06-responsive-equivalence-v2.json/.png` |
| S5 | `…-S5-ACTIVITY-FOCUS` | `activity-focus-app` | W37-06 A02、W37-14 A03（展开的活动组节点保持），使用首轮 G2 数据的副本 | `activity-focus-smoke-data.json/.png` |
| S6 | `…-S6-WAIT-STOP` | `wait-stop-app` | W37-05 A01–A04：真实 Shell 子进程，等待 ≥12 s，Stop 后 PID 消失 | `wait-stop-probe-v2.json`、`wait-stop-before-v2.png`、`wait-stop-after-v2.png` |
| S7 | `…-S7-TEXT-SAFETY` | `text-safety-app` | W37-06 A04：不可信文本按原文渲染，截断有明确标注 | `text-safety-probe-v4.json/.png` |

各步骤另有 `<step>-identity.txt`（`whoami` 与 `/groups`）和 `<step>-console.txt`（计划任务控制台输出）。

### 10.3 与 WIN7-36 探针的差异（审核方已完成，执行方不得再改）

1. 路径、标签与 run-id 已改为 WIN7-37：`W36-*` 改为 `W37-*`，事实文件 kind 为 `WIN7_37_SUPP_*`，环境变量前缀为 `A9W37S_`。
2. `wait-stop-app`：A9-19 P05（ADR-0135）把运行中工具的时长文案从“已等待 N秒”改为“已运行 N 秒”，
   对应正则改为 `^已运行 \d+`。其余条件不变：单调时钟 ≥12 s、“正在执行工具：<对象>”、不出现百分比、Stop 后 PID 消失。
3. `measure-app`：构造最坏形态时，通过产品自身的“重命名当前对话”对话框，把 10 条对话都改为中文长标题；
   新增 W37-18 A01–A03 的逐行量测：前 6 行各自可容纳的中文字数、短时间格式，以及 `aria-label` 和 tooltip 中的状态与完整时间。
   不在首屏的行只为截图而滚动，并在 W37-12 检查开始前复位。审核方已在开发机上用 stub bridge 空跑过这段量测代码
   （不是 Win7 证据）。
4. 停止按钮以 Composer 的 `#cancel-task` 为准。`#rail-stop` 按 A9-19 L04 保持隐藏（W37-21 已断言），不是缺陷。

### 10.4 执行步骤

所有记录追加到 `RUN_LOG.md` 末尾新增的“## Supplement A”一节，不得改写首轮内容。

1. **A1 连接与会话**：按 §4 连接，只读执行 `query user` 与 `tasklist`，确认 `agent` 为 console 活动会话，且没有 `electron.exe`。
   在 Win7 上复算 `C:\A9-W37\85476889\original\Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip`，SHA-256 必须等于 §3。
2. **A2 补跑包校验与上传**：
   1. 在本机 `supplement/` 目录运行 `shasum -a 256 -c SUPPLEMENT_KIT.sha256`，28 项必须全部 OK，并复算清单自身哈希（§10.1）。
   2. 在 Win7 上创建 `C:\A9-W37\85476889\supp\{apps,scripts,evidence}`，按原相对路径上传 `apps\`、`scripts\` 与清单。
   3. 在 Win7 上用 `certutil -hashfile <文件> SHA256` 逐个复算 28 个文件，结果写入 `supp\evidence\kit-hash-win7.txt`，必须与清单一致。
   4. 执行 `icacls C:\A9-W37\85476889\supp /grant "dccs-chaizl-pc\agent:(OI)(CI)M"`，让 `agent` 可以写入。
3. **A3 依次执行 S1–S7**：每一步都按以下顺序操作：
   1. 注册：`schtasks /Create /TN A9W37S-<步骤> /XML C:\A9-W37\85476889\supp\scripts\task-A9W37S-<步骤>.xml /F`。
   2. 运行：`schtasks /Run /TN A9W37S-<步骤>`。
   3. 每 15 秒轮询一次 `schtasks /Query /TN A9W37S-<步骤> /V /FO LIST`，直到任务不再处于运行状态。超时上限：S1 为 15 分钟，其余为 5 分钟。
   4. 从 `<step>-console.txt` 原样摘录最后一行 `<步骤ID>_EXIT=<n>`，记入 RUN_LOG。
   - **探针的退出码不是停止条件。** 断言不成立属于事实，照实交回后继续下一步。
   - 以下情况**是停止条件**：控制台出现 `_BLOCKED_`、`_MISSING`、`_ALREADY_EXISTS`、`_FAILED` 字样，或没有 `_EXIT=` 行，
     说明包装脚本在启动探针前就已拒绝。
   - 同一步骤不得重跑。脚本会用退出码 7 拒绝已经存在的数据目录；如确需重跑，停止并交审核方决定。
   - 超时后先 `schtasks /End /TN A9W37S-<步骤>`，记录 `tasklist`，然后停止。不得删除该步骤的数据或证据。
4. **A4 后飞行**：`tasklist` 中没有 `electron.exe`、helper 或测试 Shell，结果写入 `supp\evidence\postflight-tasklist.txt`。
   再次复算候选 ZIP，删除全部 `A9W37S-*` 计划任务。
5. **A5 取回**：把 `C:\A9-W37\85476889\supp\evidence\` 完整取回到本机 `supplement/evidence/`，不取回 `rt\` 与各数据目录。
   生成 `supplement/SHA256SUMS.txt`，覆盖 `supplement/` 下的 `evidence/`、`apps/`、`scripts/` 全部文件，每个文件一行。

### 10.5 汇报

交回 `supplement/EXECUTOR_SUPPLEMENT_REPORT.json`。字段与 §8 第 2 条相同，另加以下字段：

- `kit_manifest_sha256`
- `kit_hash_verified_on_win7`（布尔值）
- `steps[].console_exit_line`：控制台中 `_EXIT=` 那一行的原文

`cases[].observed` 的写法：

- 只能逐字引用探针 JSON 中实际存在的断言 `id` 及其 `passed`/`status` 字段和数值。
- 探针没有产出的内容写 `NOT_OBSERVED`，不得引用探针中不存在的断言 ID。
- 除原样引用探针字段外，不得使用 PASS/FAIL/通过/失败等裁决字样。

### 10.6 首轮偏差对照（本轮不得再出现）

- 自写驱动、使用不存在的选择器。
- “运行中”几何在轮次完成后才采样。
- W37-18 只量测了 2 行。
- 引用原始证据中不存在的断言 ID。
- 改写 `main_window_wait_ms` 等原始数值。
- RUN_LOG 出现裁决字样。
- 截图包含网络信息。
- `SHA256SUMS.txt` 没有覆盖脚本与探针。

### 10.7 补跑后仍需负责人裁决

- W37-06 A03、W37-12、W37-13、W37-15 的冻结 Kit 字面要求在真实 1366×768 × 125% DPI（内容 1079×540）下物理不可达，包括：
  - 三栏形态；
  - ≥1200 px 的桌面四态；
  - 双向跨越 800 px。

  WIN7-36 的同名用例由负责人按“可达响应式状态等效”裁决通过（ADR-0131；WIN7-36 证据
  `w36-12-13-15-responsive-equivalence-adjudication.md`、`w36-06-responsive-equivalence-adjudication.md`）。
  WIN7-37 需要负责人再次确认是否沿用该口径。审核方届时依据 S1（1240 px 四态，补充证据）、S3（1079×540 物理证据）和 S4 给出建议。
- `<=799px` 抽屉分支继续 `PRODUCT_UNREACHABLE / NOT_VERIFIED`。

## 11. 附录 B：S1b 单步补跑（2026-09-25，负责人接受审核建议）

附录 A 的审核结论见本机 `supplement/REVIEW_SUPPLEMENT_REPORT.md`。
W37-11 A03 与 W37-15 A02 证据不足：S1 在持久化任务行写入前就采样，最坏形态只有“更早”一个组头。本附录只补这两条断言；
附录 A 的全部证据与审核结论不变。

### 11.1 不变量

1. §10.1 的第 1、2、4 条全部适用。补跑证据只写入 `C:\A9-W37\85476889\supp-b\evidence\`，取回到本机
   `.acceptance/runs/WIN7-37/85476889-099d-46b6-b8a4-666e8e0b5d77/supplement-b/evidence/`。不得改动 `supp\` 与本机 `supplement/`。
2. 只能使用本机 `supplement-b/` 下审核方钉住哈希的 4 个文件。清单 `SUPPLEMENT_B_KIT.sha256` 自身 SHA-256 为
   `b05c1e64ada46d2ab76da17e860e602ca0afc3fd8deff075a6f4bcba1dafb801`。
3. S1b 自建候选外运行时 `supp-b\rt`，不复用 `supp\rt`。

### 11.2 与附录 A 探针 S1 的唯一差异

`measure-app` 在 Stop 可见后先等待组头出现“进行中”且组头数 ≥2，上限 30 s，然后再做初始量测。
等待结果写入 `s1b-measure-result.json` 的 `fixture.running_group_wait`（`reached`、`waited_ms`、`heads`）。超时只记录事实，量测照常继续。
其余代码与附录 A 的 S1 相同；另外仅修改了 boot 日志路径与 kind（`A9_19_WIN7_37_SUPP_B_UI_GEOMETRY_MEASUREMENT`）。
审核方已在开发机用 stub bridge 空跑等待片段，返回 `["进行中1","更早8"]`（不是 Win7 证据）。

### 11.3 执行步骤

记录追加到 `RUN_LOG.md` 末尾新增的“## Supplement B”一节。

1. **B1 连接与会话**：同 §10.4 A1，包括复算候选 ZIP。
2. **B2 校验与上传**：
   1. 本机运行 `shasum -a 256 -c SUPPLEMENT_B_KIT.sha256`，4 项必须全部 OK，并复算清单自身哈希。
   2. 在 Win7 上创建 `C:\A9-W37\85476889\supp-b\{apps,scripts,evidence}`，按原相对路径上传。
   3. 用 `certutil` 逐个复算，结果写入 `supp-b\evidence\kit-hash-win7.txt`，必须与清单一致。
   4. 执行 `icacls C:\A9-W37\85476889\supp-b /grant "dccs-chaizl-pc\agent:(OI)(CI)M"`（不加 `/T`）。
3. **B3 执行 S1b**：
   - 注册：`schtasks /Create /TN A9W37SB-S1B-MEASURE /XML C:\A9-W37\85476889\supp-b\scripts\task-A9W37SB-S1B-MEASURE.xml /F`。
   - 运行与轮询：同 §10.4 A3，超时上限 15 分钟。
   - 停止条件同 §10.4 A3；不得重跑。
4. **B4 后飞行**：`tasklist` 写入 `supp-b\evidence\postflight-tasklist.txt`，其中不得有 `electron.exe`；再次复算候选 ZIP，删除计划任务。
5. **B5 取回**：取回 `supp-b\evidence\`，不取回 `rt\` 与数据目录。生成 `supplement-b/SHA256SUMS.txt`，覆盖 `evidence/`、`apps/`、`scripts/` 全部文件。

### 11.4 汇报

交回 `supplement-b/EXECUTOR_SUPPLEMENT_B_REPORT.json`，字段同 §10.5。

- 交回前必须能被 JSON 解析器读入。自检方法：`python3 -c "import json;json.load(open('<文件>'))"`，退出码为 0。
- `cases[]` 只填 `W37-11` 与 `W37-15`，逐字引用 `s1b-measure-result.json` 的断言 `id`、`passed` 与 `detail` 原文，
  并原样给出 `fixture.running_group_wait`。
- 数值一律从原始 JSON 复制，不得换算或改写。附录 A 审核发现过把 `[847,700]` 写成 847×540 的问题。
- 不得使用裁决字样。

## 12. 附录 C：正式报告的 Win7 校验（2026-09-25，负责人沿用 WIN7-36 等效口径）

审核方已按候选内报告器 `init` 生成模板，并组装正式报告 `report-w37.json`：21 项均为 PASS，W37-06 A03、12、13、15 附负责人等效裁决。
开发机上，冻结候选自带的校验器对运行目录和验证包各运行一次，结果均为 `status=PASS`、`verified_cases=21`；
篡改一个证据字节的反例被 `A9_W37_EVIDENCE_HASH_MISMATCH` 拒绝。**以上是开发机预检，不是 Win7 校验。**
签发前，必须在 Win7 上以 `agent` 用候选内校验器复核一次。

### 12.1 输入（审核方已钉住，执行方不得修改）

- 验证包：本机 `review/bundle/`。其中有 82 个文件：`report-w37.json`（SHA-256 `f7a05f99…a96c`）与全部被引用证据，保持原相对路径；
  另有文件清单 `BUNDLE_SHA256SUMS.txt`。
- 校验脚本：本机 `supplement-c/scripts/`，含 `RUN_REPORT_VERIFY_AS_AGENT.cmd` 与 `task-A9W37R-REPORT-VERIFY.xml`。
- 清单 `supplement-c/REPORT_VERIFY_KIT.sha256`：覆盖两个脚本与 `BUNDLE_SHA256SUMS.txt`，清单自身 SHA-256 为
  `6e9976981d46a83eb62b6c1b69f42bef514d90453470de12f6743b6bcc5db565`。
- 以上路径均相对于本机 `.acceptance/runs/WIN7-37/85476889-099d-46b6-b8a4-666e8e0b5d77/`。

### 12.2 执行步骤

记录追加到 `RUN_LOG.md` 末尾新增的“## Supplement C”一节。

1. **C1 连接与会话**：同 §10.4 A1，包括复算候选 ZIP；另外确认 `C:\A9-W37\85476889\authority\` 中的 4 个文件与本机 `authority/` 哈希一致。
2. **C2 本机校验**：
   - 在 `supplement-c/` 下运行 `shasum -a 256 -c REPORT_VERIFY_KIT.sha256`，3 项全部 OK，并复算清单自身哈希。
   - 在 `review/bundle/` 下运行 `shasum -a 256 -c BUNDLE_SHA256SUMS.txt`，82 项全部 OK。
3. **C3 上传**：
   - 把 `review/bundle/` 的全部内容按原相对路径上传到 `C:\A9-W37\85476889\report-bundle\`；
     把两个脚本上传到 `C:\A9-W37\85476889\report-verify-kit\`。
   - 在 Win7 上用 `certutil` 复算 `report-bundle` 下的 82 个文件与两个脚本，结果写入 `C:\A9-W37\85476889\report-verify\upload-hash-win7.txt`，
     必须全部一致。
   - 执行 `icacls` 为 `agent` 授予 `report-bundle`、`report-verify-kit`、`report-verify` 三个目录的 `(OI)(CI)M` 权限，不加 `/T`。
4. **C4 运行**：
   - 注册任务 `A9W37R-REPORT-VERIFY`，运行并轮询，方法同 §10.4 A3，超时上限 15 分钟。
   - 控制台末行应为 `REPORT_VERIFY_EXIT=<n>`。出现 `_BLOCKED_`、`_MISSING` 或没有 `_EXIT=` 行即停止。不得重跑。
5. **C5 后飞行与取回**：
   - `tasklist` 中没有 `electron.exe`，删除计划任务。
   - 取回 `C:\A9-W37\85476889\report-verify\` 到本机 `supplement-c/report-verify/`，内容包括：
     - `report-verify.json`
     - `report-verify-stderr.txt`
     - `report-verify-console.txt`
     - `report-verify-identity.txt`
     - `upload-hash-win7.txt`
     - `postflight-tasklist.txt`
   - 生成 `supplement-c/SHA256SUMS.txt`。

### 12.3 汇报

交回 `supplement-c/EXECUTOR_REPORT_VERIFY.json`，交回前必须能被 JSON 解析器读入。

- 字段同 §10.5，另加 `verify_exit_code`，并用 `verify_stdout` 原样嵌入 `report-verify.json` 的全文。
- `stderr` 为空时写空字符串。
- 不得解读或裁决校验结果。

签发条件：Win7 上的退出码为 0，且 `report-verify.json` 为 `status=PASS`、
`disposition=A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`、`verified_cases=21`，候选身份与 §3 一致。
满足后，由审核方复核并建议签发，负责人确认。

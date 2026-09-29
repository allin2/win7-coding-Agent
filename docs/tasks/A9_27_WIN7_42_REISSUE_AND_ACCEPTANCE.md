# A9-27 — WIN7-42 换发与实机验收（A9-26 第一批可靠性）

```text
Status: DRAFT_PENDING_OWNER_REVIEW
Task Type: RELEASE_REISSUE_AND_WIN7_ACCEPTANCE
Target Branch: codex/a9-alpha2
Source Baseline: codex/a9-alpha2 @ 本任务书批准提交（A9-26 已于 0fea04b 并入）
Candidate: WIN7-42
Phase-Gate: A9_27_DRAFT
Win7-Validation: NOT_PERFORMED
Decision: ADR-0147（批准时追加）
```

> 依据：[A9 Alpha 2 推进顺序](../plans/A9_ALPHA2_DELIVERY_SEQUENCE.md) 阶段 3、ADR-0146、[A9-26](A9_26_RELIABILITY_BATCH_1.md) §5。
> 本草稿不构成实现授权，也不改变 WIN7-41 的流程与结论。流程、硬门与取证沿用 [A9-25](A9_25_WIN7_40_REISSUE_AND_ACCEPTANCE.md) §9 与 WIN7-41 实机交接书。

## 1. 进入条件与身份

1. **套件开发（第 ① 步）可以现在开始**：只改验证套件与发布文件，不改产品，不影响已冻结的 WIN7-41（`0f8af24`）。
2. **候选冻结（第 ④ 步）必须等 WIN7-41 门 B 裁决之后**（推进顺序“一次只走一个 Win7 候选”）。若 WIN7-41 暴露产品缺陷且修复进入 alpha2，本任务在冻结前同步纳入并补对应用例。
3. 编号 `WIN7-42`；版本与能力集标识沿用 `WIN7-CODING-AGENT-A9-ALPHA1` / `0.3.0-alpha.1`（见 Q4），不据此宣称 Alpha 2 PASS。
4. 结论上限 `A9_27_WIN7_42_A9_26_PASS`（可部分签发）；不改判 WIN7-41 及更早候选。
5. **不做产品改动**。实机或预演暴露产品缺陷时停止报告，另立任务。
6. 硬门同 WIN7-41：双独立干净构建且 ZIP 逐字节一致；候选外 authority 与独立 pin；`agent` 为控制台运行中会话、Medium 非提升；结构化证据带哈希；秘密扫描逐条分类零真实秘密；后飞行零残留。

## 2. A9-26 对继承旅程的影响（2026-09-29 核实，决定本任务的主要工作）

A9-26 改变了若干继承旅程赖以判定的产品行为，W42 套件不能只做机械派生：

| 影响 | 事实 | 处理 |
|---|---|---|
| **“已验证”口径收紧（①）** | 冒烟夹具以 `Write-Output 'smoke-verified'`（首轮，`a9-win7-41-smoke.cjs:219`）与 `Write-Output 'projection-verified'`（第 4 轮，`:214`）制造“已验证”成功轮；驱动在 `a9-06-driver-entry.cjs:593`、`:936`、`:949`、`:1164` 等处要求 `completed · verified`。A9-26 后这两轮如实记为 `completed_with_warnings / unverified`，上述阶段必然失败 | W42 夹具把这两条命令换成 Win7 上可用的**验证类**命令（见 Q1），驱动断言**不改**；作为登记的派生差异 |
| 取消写终态事件（O-1） | 取消轮次新增 `turn_completed`（`outcome=cancelled`）；W41 停止旅程只要求 `#a9-turn-outcome` 含 `cancelled` 与库表状态 | 继承判定不受影响；W42-28 新增正向断言 |
| 超限原因文案（O-2） | 界面显示“超过备份上限（单文件 2 MiB）”，不再含 `too_large`；W41-20 判据接受“超过备份上限” | 继承判定不受影响；W42-28 新增“不含英文原因码”断言 |
| 选择工作区即加载历史（⑤） | W39 M4 旅程以热身轮触发加载，热身在修复后仍有效；加载失败入口“重试加载”保持（A9-26 附录 B2） | M4 旅程不改（见 C1）；W42-27 新增“无热身即加载” |
| 项目说明、环境事实、上下文预算（②③④） | 冒烟工作区无 `AGENTS.md`；默认预算 96,000 字符，继承旅程的请求远小于预算 | 继承判定不受影响；W42-25、W42-26 新增 |

## 3. 用例（W42）

W42-01～22 由 W41-01～22 派生（判定口径不变；§2 第一行的夹具替换为唯一实质差异）。W42-23～28 为 A9-26 新增。

| 编号 | 判定要点（均来自产品运行后的观察） |
|---|---|
| W42-01～22 | 同 W41-01～22；W42-04/05/06/10 等依赖“已验证”成功轮的阶段，其夹具验证命令按 Q1 替换，结论仍须为 `completed · verified` 且结论卡显示“依据：…退出码 0” |
| W42-23 ⓪ | 在 Git 初始化的中文空格工作区跑一次编辑轮与一次 Shell 轮：`.agent_recovery\.gitignore` 存在且字节为 `*\n`；`git status --porcelain -uall` 与 `git add -A --dry-run` 均不含 `.agent_recovery`；`git clean -nd` 不列出它。另预置一个无 `.gitignore` 的旧恢复目录，打开工作区后补写一次、再次打开不改写。Git 按 W39 R3-8 解析器取得；无 Git 时本项 `NOT_PERFORMED` |
| W42-24 ① | 同一工作区三轮：`edit` 后只 `Write-Output` → `unverified`；`edit` 后验证类命令退出码 0 → `verified` 且结论卡显示依据；`edit` 后 `<验证命令>; Write-Output done` → `unverified`（PowerShell 5.1 无 `||`/`&&`，以 `;` 覆盖掩盖退出码的组合） |
| W42-25 ②④ | 工作区根放置 `AGENTS.md`（含中文）：过程记录显示“已加载 AGENTS.md”；夹具模型记录的请求中恰有一份 `<project_instructions>` 与一份 `<environment_facts>`，后者含“Windows 7 SP1（NT 6.1）”与**实测** PowerShell 版本；连续两轮仍各一份。另一轮 `AGENTS.md` 含夹具已知秘密 → 显示“含已知秘密，未加载”，请求、事件、日志与数据库零命中 |
| W42-26 ③ | 夹具模型对首次请求返回 HTTP 400 `context_length_exceeded`：第二次请求字符数约为一半并成功；两次都返回超长时结局 `failed`，界面显示“对话过长，已尝试压缩仍超出模型上限” |
| W42-27 ⑤ | 复用 M4 种子（2,500 条过程事件）的工作区：重启后**选择工作区即**出现过程记录，期间不提交任何轮次；`queryEvents` 调用发生在选择之后、首轮之前；顶部“加载更早记录”可用 |
| W42-28 O-1/O-2 | 停止轮次的事件流含 `turn_completed`（`outcome=cancelled`），过程记录显示“已停止”；W42-20 的 `big.bin` 显示“超过备份上限（单文件 2 MiB）”且整段文字不含 `too_large` |

## 4. C14 允许路径

- 发布管线：`scripts/release/build-a9-product-v3.mjs`（新增 `A9-27-INPUTS-WIN7-42` profile 与集合登记）、`scripts/release/test/a9-package.test.mjs`（只新增 W42 用例；既有用例不改）。
- `release/win7-product-v3/` 下新增：`a9-27-win7-42-input-lock.json`、`a9-package-integrity-w42.cjs`、`a9-win7-42-report.cjs`、`a9-win7-42-smoke.cjs`、`RUN_A9_27_W42_INTEGRITY.cmd`、
  `RUN_WIN7_42_REPORT_VERIFY.cmd`、`A9_27_WIN7_42_VALIDATION.md`、文件名含 `w42` 的夹具；更新该目录 `README.md`。WIN7-41 及更早的发布文件不改。
- 实机驱动：`src/shell/tests/product/a9-06-driver-entry.cjs` 只新增 `w42*` 旅程与 `a927*` 辅助函数；`w41` 及更早旅程与辅助函数不改。驱动单测与夹具只在 `src/shell/tests/product/**` 新增。
- 文档：本任务书、`docs/tasks/README.md`、`docs/STATUS.md`、`docs/STATUS_LOG.md`、`docs/DECISIONS.md`（ADR-0147）、`docs/plans/A9_27_*`、`docs/reports/2026-09/**`、A9-26 任务书执行记录段。
- 不得修改：产品源码（`src/*/src/**`、`src/shell/product/**`）、State schema、native、D-013 工件。

## 5. 执行步骤与门

1. **套件实现**（外部执行方，按套件交接书）：从 W41 机械派生 W42（身份替换 `W41→W42`、`win7-41→win7-42`、`WIN7_41→WIN7_42`、`A9-25→A9-27` 等，谱系陈述登记前序 `WIN7-41` 及其门 B 结论），
   夹具验证命令替换（§2）登记为派生差异，新增 `w42*` 旅程与 W42-23～28 断言。开发机门：打包测试、Shell 全量、`verify:quick`、`docs:check`、`git diff --check`，
   每个新增用例至少一个注入反例；另以 A9-26 之前的产品（`6acbb14`）运行 W42-24、W42-27 的判定，证明它们对旧行为判为失败。
2. **Win7 连续预演至少 2 次**，全部 `PASS` 才进入下一步（`REHEARSAL_NOT_ELIGIBLE`，不计入结论）。
3. **正式实机交接书**：以 WIN7-41 实机交接书为模板。
4. **候选冻结**（WIN7-41 门 B 之后）：同一提交两个独立干净工作树构建，ZIP 逐字节一致。
5. **门 A**：负责人签发 `WIN7_42_RELEASE_AUTHORITY` 与独立 pin。
6. **实机执行**（外部执行方）→ 7. **审核**（审核方组装正式报告并在 Win7 以 `agent` 复核）→ 8. **门 B**：负责人裁决；更新本任务书、A9-26、STATUS、STATUS_LOG，
   W42-23 通过后解除 STATUS 中“恢复目录可能被 Git 误暂存”的已知问题登记（保留 `git clean -fdx` 限制说明）。

## 6. 待裁决

**矛盾**（CLAUDE.md 行为规则 2）：

- C1：ADR-0146“后果”写“WIN7-42 套件去掉 M4 热身轮”；而 A9-25 §2 第 5 条与本任务 §4 规定继承旅程不改，M4 热身属于 `w39` 旅程。
  建议：继承的 M4 旅程保持原样（热身在修复后仍有效），“无热身即加载”由新增 W42-27 覆盖；在 ADR-0147 中说明对 ADR-0146 该句的执行方式（不改写 ADR-0146 正文）。
- C2：§2 的夹具验证命令替换改变了继承阶段的输入。建议按 A9-25 §9 第 3 条的做法作为**登记的派生差异**处理，驱动断言不变，包测试校验“除登记差异外 W42 与 W41 一致”。

**设计问题**：

- Q1 Win7 上的验证类命令：验收机 `agent` 账户能否使用的解释器未经核实。**建议**用验收机已有的 `C:\acceptance\python38_mvp\python.exe` 执行工作区内的 `check.py`
  （分类为验证类，退出码由脚本决定），套件在 G1 前置中记录其路径、版本与 SHA-256，不可用则相关阶段停止；备选为 `PATH` 中的 `node.exe`（是否存在未知）。
  不得为此在验收机安装任何软件。预演第一次即核实。
- Q2 W42-23 的 Git：沿用 W39 R3-8 解析器（参数、MinGit、`where`）；验收机当前可用的 Git 形态请负责人确认。无 Git 时 W42-23 记 `NOT_PERFORMED`，A9-26 §5 第 5 项（Windows Git）也继续开放。
- Q3 预演次数：**建议**与 WIN7-41 相同，连续两次全部通过。
- Q4 版本标识：**建议**维持 `0.3.0-alpha.1` 能力集标识（与 WIN7-37～41 一致），Alpha 2 版本号在 Shell 实时输出等第二批完成后统一评估。
- Q5 回归范围：**建议** W42-01～22 全量回归。

## 7. 执行记录

- 2026-09-29：审核方起草本任务书，交负责人审阅。

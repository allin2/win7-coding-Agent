# A9-23 — WIN7-39 换发与实机验收（修复 W38 验证套件，A9-20 + A9-21）

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: RELEASE_REISSUE_AND_WIN7_ACCEPTANCE
Target Branch: codex/a9-alpha2
Source Baseline: codex/a9-alpha2（本任务书所在提交；产品源码与 WIN7-38 的 874f541 相同）
Candidate: WIN7-39
Phase-Gate: A9_23_KIT_REPAIR_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0142
```

> 2026-09-26 负责人裁决：WIN7-38 实机 G2 因候选内验证套件缺陷失败，产品未运行；按审查报告 §8 方案 (a) 新建本任务，
> 修复套件后换发 WIN7-39。批准本任务书不等于候选外 authority 或实机 PASS。

## 1. 背景

- WIN7-38（A9-22，源码 `874f541`，ZIP `105531bf…0b22`，run-id `31504dc1…`）结论为不可变的
  `A9_22_WIN7_38_VALIDATION_KIT_DEFECT_NOT_PASS`。审查报告见
  [a9_22_win7_38_acceptance_review_2026-09-26.md](../reports/2026-09/a9_22_win7_38_acceptance_review_2026-09-26.md)。
- 失败根因：`a9-win7-38-smoke.cjs` 没有传 `A9_SMOKE_PRODUCT_MAIN`，驱动回落到开发仓库布局，6 次 Electron 子进程都没有加载产品入口。
  W38 smoke 是手写派生件（566 行），不是从可用的 W37 smoke（695 行）机械改名而来，所以同时丢失了 W37 的自身 PID 排除与结构化残留记录。
- 审查报告 §4 K2～K7：W38 的 A9-20/M1～M4 断言多为恒真或不覆盖任务书判定要点；交接书 §6 要求的 G3 证据文件没有任何工具会生成。
  本任务以这些缺陷为修复清单。
- A9-20 仍为 `A9_20_DEVELOPER_VERIFIED`；A9-21 §5 第 6 项（真实 Electron 回归）改由 WIN7-39 覆盖。

## 2. 身份与边界

1. 编号 `WIN7-39`；版本与能力集沿用 `WIN7-CODING-AGENT-A9-ALPHA1` / `0.3.0-alpha.1`；Review 入口继续 fail-closed，Shell 运行中增量输出不开放。
2. **不做产品改动**。实机或开发机暴露产品缺陷时，停止并报告，另立任务修复。
3. 结论上限 `A9_23_WIN7_39_A9_20_A9_21_PASS`（覆盖 §4 用例，可部分签发）。不改判 WIN7-22/37/38 的既有结论。
4. 硬门与 WIN7-37/38 相同：双独立干净工作树构建、ZIP 逐字节一致；候选外 authority 与独立 SHA-256 pin；普通用户 `agent`
   Medium 非提升；证据结构化带哈希；秘密扫描零命中；后飞行零残留（**不得依赖人工 `taskkill` 达成**）。
5. WIN7-38 及更早的发布文件、W38 驱动旅程与历史键语义一律不改。

## 3. C14 允许路径

- 发布管线：`scripts/release/build-a9-product-v3.mjs`（新增 `A9-23-INPUTS-WIN7-39` profile 与候选集合登记）、
  `scripts/release/test/a9-package.test.mjs`（W39 正向用例与 §5 R8 的反例）。
- `release/win7-product-v3/` 下新增：`a9-23-win7-39-input-lock.json`、`a9-package-integrity-w39.cjs`、`a9-win7-39-report.cjs`、
  `a9-win7-39-smoke.cjs`、`RUN_A9_23_W39_INTEGRITY.cmd`、`RUN_WIN7_39_REPORT_VERIFY.cmd`、`A9_23_WIN7_39_VALIDATION.md`；
  以及 W39 专用夹具（文件名含 `w39`）；更新该目录 `README.md`。
- 实机驱动：`src/shell/tests/product/a9-06-driver-entry.cjs`，只新增 `w39*` 旅程及其辅助函数；`w38` 与更早旅程不变。
  测试夹具与驱动单测只在 `src/shell/tests/product/**` 新增。
- 文档：本任务书、`docs/tasks/README.md`、`docs/STATUS.md`、`docs/STATUS_LOG.md`、
  `docs/plans/A9_23_W39_KIT_REPAIR_HANDOFF.md`、`docs/plans/A9_23_WIN7_39_ACCEPTANCE_HANDOFF.md`（新建）、预演交接书、`docs/DECISIONS.md`（仅 ADR-0142 及本任务需要的新 ADR）、
  `docs/DECISIONS_INDEX.md`、`docs/reports/2026-09/**`、A9-20 与 A9-21 任务书的状态记录段。

## 4. 用例（W39）

用例集与 W38 相同，编号改为 W39-01～W39-15；判定要点沿用 [A9-22 §4](A9_22_WIN7_38_REISSUE_AND_ACCEPTANCE.md)，并按下表收紧。
无法在不改产品的前提下于 Win7 触发的子项，标 `NOT_PERFORMED` 并写明原因，不得以开发机结果代替。

| 编号 | 收紧后的判定要点（均须来自产品运行后的观察，不得以夹具准备成功代替） |
|---|---|
| W39-01 | 同 W38-01；完整性报告须带逐文件核对计数，供审核复核 |
| W39-02 | 整个运行根放在含中文和空格的路径下（如 `C:\A9-W39\验收 目录\<run-id前8位>`），G1/G2 全部在该路径运行 |
| W39-03 | 首次启动 60 s 内出现工作台并完成工作区选择；驱动截图与启动 JSON 落盘 |
| W39-04～06 | 沿用 W37 `first/second/stop` 旅程与判定，结果与 W37 一致；审批拒绝目标不变、批准目标被删除、Stop 后子进程 PID 消失、重启后会话恢复 |
| W39-07～09 | 覆盖 A9-20 §2 第 2～8、11、12 类的 Windows 形态（cmd 相连/带路径/开关簇/`/R`，PowerShell 前缀/相连/EncodedCommand/位置参数，超长 CMD 载荷）；每条须：审批卡出现且 Git 目标绑定字段指向 remote/branch（G04 兜底形态为整条命令摘要）；拒绝后本地裸仓库远端 ref 哈希不变、无对应进程执行。第 9、10 类（bash/sh）在 Win7 无 POSIX 壳时标 `NOT_PERFORMED` 并记录原因 |
| W39-10 | 用候选自带的产品持久化层（真实 v4 schema）预置 ≥100 个历史 Turn，含 1 个 `interrupted` 且缺 checkpoint 的 Turn；分别以约 5 个与 ≥100 个 Turn 启动并记录耗时；中断 Turn 的恢复结果（`missing`/`quarantined`）由产品运行后读取 |
| W39-11 | 工作区含 1 MiB 单行十六进制文件时执行一次会冻结基线并生成 checkpoint 的真实 Turn，记录耗时；夹具让 `https://u:p@host` 进入模型输出与工具输出；产品运行后扫描持久化事件与诊断，明文凭据零命中且可见脱敏标记 |
| W39-12 | 夹具返回 >1 MiB 且含工具调用的响应：持久化 Turn 结果为 `COMPLETED_WITH_WARNINGS`，`model_note` 含截断说明，工具未执行（目标文件不变、无工具事件），紧接的下一轮正常完成 |
| W39-13 | 经真实 Turn 或真实 schema 预置 ≥60 条 checkpoint：`a9-checkpoint-count` 显示 `最近 N / 共 M` 且 M 与库中计数一致；加载更早记录不重复、不断档；对更早记录发起 Diff 成功 |
| W39-14 | 事件超过 2000 条：界面释放提示中的数量与实际释放数一致；过程记录连续；在约 N 与 2N 条事件时各采样一次 Renderer 内存，记录两次数值 |
| W39-15 | 秘密扫描覆盖运行目录全部文本文件；产品与驱动退出后无需人工终止即零残留，残留检测记录进程名、PID、父 PID 与命令行 |

## 5. 套件修复要求（R1～R8）

- **R1 派生基线**：W39 smoke 从 `a9-win7-37-smoke.cjs` 机械派生，W37 已有的产品入口传参、残留快照（排除自身 PID）与阶段契约原样保留，
  只追加 W39 旅程与断言。派生差异须在 `A9_23_WIN7_39_VALIDATION.md` 列出。
- **R2 产品入口**：smoke 传 `A9_SMOKE_PRODUCT_MAIN=<candidateRoot>\resources\app\product\main.js`，启动子进程前检查该文件存在；
  W39 旅程在驱动内确认已加载的入口路径位于候选根下，否则以稳定错误码失败。
- **R3 残留**：负向探针后、每阶段后与 smoke 结束前，按 W37 方式结构化采集残留；smoke 结束前等待并确认零残留，不得依赖外部清理。
- **R4 断言来源**：必需断言只能由产品运行后的观察（DOM、IPC 返回、产品写入的持久化数据、文件系统结果）产生；禁止在夹具准备、
  种子写入或脚本自身步骤成功时记为通过。
- **R5 夹具**：本地回环模型桩覆盖 W39-07～14 所需响应；A9-20 远端用候选运行目录内的本地裸仓库，不访问网络。
  Win7 上 Git 是否可用为**待验证**：驱动检测到无 Git 时，只记录分类与确认结果，"是否会真正执行 Git"子项标 `NOT_PERFORMED`。
- **R6 种子**：W39-10/13 的预置数据经候选内产品持久化模块写入真实 schema，不得自建同名或近名表。
- **R7 G3 证据**：交接书 §6 列出的每个证据文件都必须由 W39 smoke/驱动生成，或在交接书中明确为人工 UI 步骤并规定截图与记录格式。
- **R8 开发机门**：`a9-package.test.mjs` 新增：W39 smoke 传递产品入口且指向打包树中存在的文件；残留检测排除自身 PID；
  必需断言 ID 不得以字面量 `true` 记录；在构建产物目录布局下解析驱动的产品入口路径；注入 W38 形态缺陷（缺入口变量、恒真断言）的反例必须失败。
  开发机没有 Windows Electron，完整旅程只能在 Win7 运行，这一点须在验证说明中写明。

## 6. 执行步骤与门

1. **套件修复（新会话，按 [套件修复交接书](../plans/A9_23_W39_KIT_REPAIR_HANDOFF.md)）**：在 §3 路径内按 §5 实现；`node --test scripts/release/test/a9-package.test.mjs`、受影响包测试、
   `verify:quick`、`docs:check`、`git diff --check` 通过后本地提交。
2. **交接书**：写 `docs/plans/A9_23_WIN7_39_ACCEPTANCE_HANDOFF.md`，结构仿 A9-22 交接书，并补 WIN7-38 暴露的取证缺口：
   G0 与 Win7 端哈希复算、计划任务删除的原始输出存为证据文件；`SHA256SUMS.txt` 覆盖 `scripts/`、`authority/`、`RUN_LOG.md` 与报告；
   G0 记录 agent 会话进程基线；后飞行进程表带命令行与父 PID；任务 XML 按 UTF-16 保存并登记。
3. **Win7 套件预演**（负责人已同意，条件见 §7 Q1）：非正式构建，以 `agent` 运行 G2 smoke，结果不计入任何结论。
4. **候选冻结**：同一提交在两个独立干净工作树构建，ZIP 逐字节一致；记录 ZIP、manifest、输入锁等哈希，写入本任务书 §8 与交接书；
   用候选自带校验拒绝错误哈希与错误 pin。
5. **门 A**：负责人在对话中签发候选外 `WIN7_39_RELEASE_AUTHORITY`（绑定源码提交、ZIP、manifest、输入锁、用例清单、目标主机、run-id）
   与独立 pin；签发记录写入 STATUS_LOG。未签发不得部署或运行。
6. **实机执行**：按交接书执行，证据存本机 `.acceptance/runs/A9-23-W39/<run-id>/`。硬停止条件同 A9-22 交接书 §7。
7. **审核**：审核方基于原始证据独立复核，给出签发建议。
8. **门 B**：负责人裁决；裁决后更新本任务书、STATUS、STATUS_LOG，A9-20、A9-21 任务书记录 Win7 结论。

## 7. 开放问题

- **Q1 Win7 套件预演**：开发机无法运行 Windows Electron，W39 套件首次真正执行会发生在正式验收里；若再次暴露套件缺陷，又会消耗一个候选编号。
  建议：冻结前用同一源码的**非正式构建**在 Win7 以 `agent` 跑一次 G2 smoke，只用于修正套件，结果不得计入任何结论，
  不生成 authority，证据单独存放并标 `REHEARSAL_NOT_ELIGIBLE`。
  **裁决（2026-09-26）**：负责人同意预演，按上述条件执行第 3 步；证据存本机 `.acceptance/rehearsals/A9-23-W39/<日期>/`，
  预演后对套件的修改须重新通过第 1 步的开发机门。
- **Q2 构建输入**：沿用 WIN7-38 输入锁登记的三项输入（Electron zip、D-013 v25 helper、A6 SQLite zip），本机 `.acceptance/deps/` 均在；
  不需要联网。若构建发现缺失或哈希不符，停止并报告。
- **Q3 PowerShell `/Command` 形态**：A9-20 §6 标为待验证；W39 只记录分类与确认结果，Win7 PowerShell 5.1 是否真正执行该形态以实机观察为准。

## 8. 候选身份（冻结后填写）

未冻结。

## 9. 执行记录

- 2026-09-26：负责人裁决 WIN7-38 为 `A9_22_WIN7_38_VALIDATION_KIT_DEFECT_NOT_PASS`，按审查报告方案 (a) 建立本任务（ADR-0142）。
- 2026-09-26：负责人同意 §7 Q1 的 Win7 套件预演。
- 2026-09-26：编写套件修复交接书；W39-07～09 形态范围补入 A9-20 §2 第 8、11 类（Windows 可达）。

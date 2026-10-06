# A9 第二批推进审批包（2026-10-02）

```text
Status: READY_FOR_OWNER_REVIEW_NOT_APPROVED
Current Branch: codex/a9-30-shell-streaming
Current HEAD: 32ee0b48edd286c77aa543bdda9eb834fd4576aa
Product Source: 32ee0b48edd286c77aa543bdda9eb834fd4576aa
Native Source: 7feae402edfb30da9adb649841d777ca82cc6e80
Next Implementation: A9-31 / ADR-0151
Candidate: WIN7-43 (tentative; NOT_FROZEN)
```

负责人要求实施整批推进计划；本轮完成文档准备，未提交、实现A9-31/32、创建新候选或写远端。
具体审批分段执行，已批准且目标/字节/范围不变的操作不重复求批。

## C1. A9-30收口与第二批待审合同的本地登记提交

申请在现有A9-30分支、当前HEAD后追加一次本地提交，题目：
`docs(a9): register A9-30 closeout and batch-2 review contracts`。
只包含下列25个精确路径的审批快照；提交前复核SHA、差异和保护，任何字节漂移停止并说明差异。
产品/原生/脚本/历史锁不修改，唯一新release文件是已生成的生产开发输入锁。不推送、不合main、不清理。

| 组 | 精确路径 |
|---|---|
| 结论/索引 | `docs/STATUS.md`、`docs/STATUS_LOG.md`、`docs/tasks/README.md`、`docs/plans/README.md` |
| A9-30收口 | `docs/tasks/A9_30_SHELL_STREAMING.md`、`docs/plans/A9_30_DEVELOPER_CLOSEOUT_HANDOFF.md`、`docs/plans/A9_ALPHA2_DELIVERY_SEQUENCE.md`、`docs/reports/2026-10/a9_30_closeout_readiness_2026-10-01.md`、`docs/reports/2026-10/a9_30_developer_closeout_decision_2026-10-02.md`、`docs/reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md` |
| 历史交接引用闭包 | `docs/plans/A9_30_WIN10_AGENT_BUILD_PROMPT.md`、`docs/plans/A9_30_WIN10_INTERACTIVE_BUILD_ENTRY.md`、`docs/reports/2026-10/a9_30_source_commit_and_v26_kit_binding_2026-10-01.md`、`docs/reports/2026-10/a9_30_win10_build_connection_preflight_2026-10-01.md`、`docs/reports/2026-10/a9_30_win10_standard_account_identity_2026-10-02.md` |
| 生产开发锁 | `release/win7-product-v3/a9-v26-input-lock.json` |
| 待审合同/治理 | `docs/tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md`、`docs/tasks/A9_32_EXPLICIT_TASK_CONTINUE.md`、`docs/tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md`、`docs/DECISIONS.md`、`docs/WIN7_CONSTRAINTS.md` |
| 第二批矩阵/审批 | `docs/plans/A9_BATCH_2_ACCEPTANCE_COVERAGE.md`、`docs/plans/A9_BATCH_2_INCREMENTAL_VALIDATION.md`、`docs/plans/A9_BATCH_2_IMPLEMENTATION_APPROVAL.md`、`docs/reports/2026-10/a9_batch2_preparation_and_approval_2026-10-02.md` |

外部清单 `.acceptance/a9-batch2-preparation/20261002-r1/approval-files.json`逐项记录尺寸/SHA和旧Git字节，
`approval.patch`保存tracked差异，`approval-snapshot/`保存全部25项完整字节（含untracked）。
审批包自身由外部清单绑定，避免自引用哈希。

v26输入锁7323 bytes，SHA-256 `2e5942b115f1e5f1ecf6a6c31d91ed5d4f9145b9e0751941a0aa566fdebda9df`；
helper350720 bytes，SHA-256 `c895a2f9e4abcb84ae2295d2e33ada6289cfd34c692b88e92276e7749cdc5a2b`。
只登记既有生产结果，不重建、不重签返回批准、不改变Win7结论。

## C2. 下一项具体实现批准：A9-31与ADR-0151

申请批准 [A9-31修订任务书](../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md) §1–5及ADR-0151，
包含逐文件managed kit、stream writer/stream-output/runtime消费/返回fixture精确路径和增量验证合同。
批准后登记任务APPROVED_FOR_IMPLEMENTATION、ADR-0151 Accepted；目前不提前登记。
基线取C1成功提交的完整SHA；该提交必须只含C1审批字节、产品完全等于32ee0b4且收口/锁一致。
C1失败或产品变化则C2基线不成立，不开始实现。
分支codex/a9-31-background-tools，主代理执行；先核对注册，不重置或覆盖同名工作树。
本批准仅限实施及批准登记，不包含未来产品源码提交、套件批准、原生目录或远端写入。

## C3. A9-32批准与基线（后续）

[A9-32](../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md)/ADR-0152保持草稿/Proposed。
A9-31开发机、原生锁和独立复核通过后形成实际整合SHA，再申请具体批准。
分支codex/a9-32-explicit-continue；未改native时复用managed锁，共享安全/恢复仍直接验证。

## C4. managed套件、构建、独立复核与整合（后续）

固定源码差异、干净source、kit ZIP/input-lock/manifest及准确目录后申请具体提交/套件/构建动作。
历史Win10 192.168.1.4、a9builder SID1005及D-017仅作复用线索，实际身份和环境重新只读预检。
不安装或改账户/ACL/UAC/Job；新目录不能借旧build-r5-a/b授权。
独立复核由负责人或其具体指定的独立人员承担，主代理不自签、不默认启动子代理。
完成后按具体目标本地整合，不把本包批准解释为合main或推送。

## C5. 新候选与Win7批准（后续）

[A9-33](../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md)/ADR-0155保持草稿/Proposed。
实现批准须绑定实际整合source、完整phase/断言/命令、白名单、套件闭集及角色；
随后申请准确目标目录/传输/预演或桌面任务，冻结后负责人签发门A，正式执行及独立审核后门B。
历史Win7 192.168.1.3、dccs-chaizl-pc\\agent及HostKeyAlias先严验，不猜凭据、不降低SSH验证。
正式Win7当前NOT_PERFORMED；结论上限为第二批执行能力Win7 PASS。

## 当前验证与保护

仅docs:check、差异/格式、白名单/测试路径及输入证据检查，结果见 [准备报告](../reports/2026-10/a9_batch2_preparation_and_approval_2026-10-02.md)。
主工作区HEAD/dirty/untracked逐文件快照和A9-30共810个受保护tracked实现文件记录于
`.acceptance/a9-batch2-preparation/20261002-r1/protected-before.json`，完成后核对未变。
旧矩阵r11顶层文案差异在新矩阵说明，不覆盖冻结记录。

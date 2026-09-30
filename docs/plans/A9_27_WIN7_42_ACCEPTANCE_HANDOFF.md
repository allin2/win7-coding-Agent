# A9-27 / WIN7-42 正式实机验收交接书

Status: AWAITING_OWNER_GATE_A

本交接书依据 [A9-27](../tasks/A9_27_WIN7_42_REISSUE_AND_ACCEPTANCE.md) §5，沿用 [WIN7-41 实机交接书](A9_25_WIN7_41_ACCEPTANCE_HANDOFF.md) 的严格传输、普通用户、原始取证和报告复核合同。W41 的 authority、候选及证据不得复用为 W42。

角色方案待负责人在门 A 确认：本任务主代理执行及组装报告草案，负责人独立审核原始证据、签发门 B；亦可另行指定外部执行方与独立审核方。同一代理不得兼任正式执行和独立验收审核。执行方不签发 authority、不宣称 A9-26 最终 PASS。

## 1. 前置证据

`94385a8` 在 `.acceptance/rehearsals/A9-27-W42/20260930-1423/` 完成连续两次预演：25 阶段均 PASS、退出码 0；W42-02～30 均 PASS、W42-01 无 authority 为 NOT_PERFORMED。两轮各 743 个 Win7 文件逐字节及哈希相等，秘密扫描无未分类项/真实秘密，后飞行零残留，计划任务逐项移除。

这是 REHEARSAL_NOT_ELIGIBLE，不计入正式结论。首轮失败源 `c62323f` 的两轮证据保留，见[返工记录](../reports/2026-09/a9_27_w42_rehearsal_repair_2026-09-30.md)。继承函数/断言不改，W42 仅补齐冷历史种子的 checkpoint 关联、把实时说明观测与真实 model_note 配对。

## 2. 候选与门 A

2026-09-30：两个独立干净工作树构建完成，ZIP 逐字节一致，也与两次预演包逐字节一致；候选已冻结，后续只在候选外写 evidence / authority。完整记录 `.acceptance/candidates/WIN7-42/DOUBLE_BUILD.json`。

| 身份 | 准确值 |
|---|---|
| source | `94385a87d22928acc1ce5dd8f1881d89e0d4473b` |
| ZIP SHA-256 | `3b6e0b72b98de794594cd6924a1298ef75ed72bafcebacf966c86ad2382a01cf` |
| manifest SHA-256 | `6f7b224cdb304c9e10edf87ec9c490ffeb7dd5be42f9432ba3b6c5f3df3908c9` |
| 输入锁 SHA-256 | `bf0430d626301eab174a8906338e8d8bae015c0c31d94bbf5c8bc2212847d68f` |
| native 批准登记 commit / SHA-256 | `e1b6f4bf30ad2ae7576aa958317e0aea6f4338d3` / `d9cfea73c2f89c01a33a2bbef1d65c27eb995cd3681c71a939183348744917b7` |
| Kit ID / SHA-256 | `A9-27-WIN7-42-20260928-01` / `96e42f48c4e578df0622773fbda02e70c43b0a234a641705719ce54912cdc827` |
| 固定 run-id | `92d693e0-e80a-4d58-9f7f-aaff5ec69bd3` |
| 目标 | `192.168.1.3`；Win7 新根 `C:\A9-W42\验收 目录\92d693e0` |
| authority 草案 | `.acceptance/runs/A9-27-W42/92d693e0-e80a-4d58-9f7f-aaff5ec69bd3/authority/release-authority.draft.json`；SHA-256 `b4817eef17c53e1d020a902be08e4676d2bc098e361b40d733e043bd0c466d92` |

草案 status 为 DRAFT_PENDING_OWNER_GATE_A，approved_by / approved_at 均为空；草案和其校验和不构成正式 authority / 独立 pin。签发后另建正式文件，不覆盖草案或冻结候选。

门 A 必须由负责人签发候选外 `WIN7_42_RELEASE_AUTHORITY` 与独立 SHA-256 pin，准确绑定源、ZIP、manifest、输入锁、native 批准登记、Kit、目标 `192.168.1.3` 与固定 run-id。审批原 A9-27/A9-28/A9-29 不替代门 A。仅有 draft 时不得注册或运行正式任务。

## 3. 正式执行步骤

- 本机新根 `.acceptance/runs/A9-27-W42/<run-id>/`，authority 目录仅保存本轮签发文件；Win7 新根 `C:\A9-W42\验收 目录\<前8位>`，ASCII stage 为 `C:\A9-W42\stage\<前8位>`。原根事先不存在，候选外写证据。
- G0：严格 SSH 参数沿用 W41 §4.1（HostKeyAlias=192.168.1.11，StrictHostKeyChecking=yes）。保存 OS、query user、进程基线；agent 必须 console 运行中，无 Electron 残留。复算候选、authority/pin、输入锁、native 批准登记和 Kit 的哈希，Win7 certutil 原始输出与本机一致。
- G1：CP936 任务 XML，CMD CRLF；InteractiveToken、LeastPrivilege、agent 精确 SID，非提升 Medium。逐字段回读任务名、命令、完整参数、工作目录、SID、LogonType、RunLevel，保存 UTF-16LE 原文。自检中文参数、Electron 22.3.27 / ABI 110、已有 Python/Git 的执行性、版本和哈希；失败停止依赖项，不安装软件、不切换会话。
- G2：agent 执行 `RUN_A9_27_W42_INTEGRITY.cmd`，参数按冻结说明为 ZIP、候选外输入锁、native 批准登记、authority、独立 pin；完整性失败停止 smoke。不得生成临时 authority 绕过门。
- G3：agent 以包内 Electron Node 模式执行 `validation\a9-win7-42-smoke.cjs --evidence-root=<本轮根>\evidence\smoke`，完整执行 W42-02～30 及继承阶段。记录原始控制台、退出码、截图、数据库、driver JSON、case index、阶段耗时；不操作桌面、不改 DPI，不中途终止。超过 3 小时按 W41 §7 处理。
- G4：记录后飞行进程表与停止 PID；残留先留证，不先强杀再称零。逐项移除本轮任务，复算原 ZIP。取回全 evidence/scripts，拒绝越界或重复归档条目，按 Win7 清单逐文件复算字节数和 SHA-256；全部证据包含数据库、二进制与本地原始输出进行秘密扫描，逐条分类、零真实秘密。立即追加 RUN_LOG 并复算哈希，修正自产文件另存新名。

主机键、认证、会话、令牌、哈希、任务回读或完整性失败时 fail closed；保留全部证据，相关下游 NOT_PERFORMED。原候选和历史证据保持只读。

## 4. 用例与审核

冻结 Kit 的准确 30 项为准：W42-01 是当前候选完整性；W42-02～22 继承，W42-23～28 覆盖 A9-26，W42-24/26 补强 A9-28，W42-29/30 覆盖 A9-29。判据与证据闭包见候选内 `A9_27_WIN7_42_VALIDATION.md`、Kit 和 case index。所有值来自实际产品运行后观察，未执行不得填 PASS。

审核方独立核对原始证据和全部哈希、源码及产物身份、断言/用例原值、时间线、偏差、图像与零残留/秘密。正式报告用候选内报告器 init 生成模板，完整组装 30 项；开发机预检和证据篡改/错 pin 拒绝对照之后，须由 agent 在 Win7 用 `RUN_WIN7_42_REPORT_VERIFY.cmd` 复核，另立同样回读/令牌门的新任务。报告完整性通过不代替独立证据审核。

结论上限 `A9_27_WIN7_42_A9_26_PASS`（可部分签发），不是 Alpha 2 / RC。负责人门 B 之后更新 A9-26/A9-27、STATUS/STATUS_LOG；恢复目录问题仅在 W42-23 正式通过后解除登记，保留 git clean -fdx 说明。完成合并前审查后按已授权目标合入本地 main；推送未获授权。

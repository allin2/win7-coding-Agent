# 当前项目状态

> 本页只维护当前可执行摘要和历史证据索引。历史报告与 JSON 是不可变的时间点证据；逐次 Gate 日志、测试数量和候选哈希不在本页重复维护。

## Git 与证据基线

| 项目 | 当前值 |
|---|---|
| 远程默认分支 | `main` |
| A4/A5/A6 收口基线 | `793cc4799c81d9dc27d236826a344a39d86137ec`（标签 `baseline/a456-closeout-20260812`） |
| A7 主线整合输入 | main 历史快照 `63ba838` + A7 验收收口 `6ca1a5a` |
| A1～A3 历史结构化证据绑定提交 | `b2019f022f910b2b8df150ad94c3bccdefa1fa7b` |
| 候选快照 | `8b032772e0c632ec990cc6dfa75fbce4d5f2bb1c` |
| 快照标记 | `backup/integrated-snapshot-20260731` |
| 当前主线状态 | `A7_RC_INTEGRATED / RC_PASS` |
| 唯一 RC 工件 | 源码提交 `963eabe`；ZIP SHA-256 `39eecb6a…040c9`；A7 状态提交 `6ca1a5a` |
| A8 产品体验授权 | 需求合同 v1 已由负责人确认；`0.2.0-alpha.1` / `codex/a8-agent-first-product`；外部三层验证均 `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE` |
| A8 当前阶段 | `A8-06 / A8_DEVELOPER_COMPLETE_VALIDATION_READY`；文本附件/Goal 应用内对话框候选已从远端可达干净源码双构建并通过开发机 smoke，等待同一候选的 Win10/Win7 验收 |
| A9 Trusted Agent Runtime | `0.3.0-alpha.1` / `codex/a9-trusted-agent-runtime`；WIN7-10 Gate 4 Review FAIL 已保留；ADR-0096 将 Review 延期至 Alpha 2；同一候选从 J4 继续，J1～J3 外置证据待归档 |

`latest-validation.json` 是证据采集时的不可变快照，其 `head_commit` 必须是当前主线的祖先，但不应在每次文档提交后伪造重绑。当前代码 HEAD 以 Git 历史为准；表中哈希只表示已归档的结构化证据生成点。

## A9 当前活动状态（2026-08-25）

### 当前裁决

| 事项 | 状态与边界 | 证据入口 |
|---|---|---|
| 授权与版本 | `APPROVED_FOR_IMPLEMENTATION`；阶段 `A9_07_IN_PROGRESS`；目标分支 `codex/a9-trusted-agent-runtime`；版本 `0.3.0-alpha.1`；ADR-0089/ADR-0096 | [`A9_TRUSTED_AGENT_RUNTIME`](tasks/A9_TRUSTED_AGENT_RUNTIME.md)、[`A9 PRD`](prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md) |
| Alpha 1 支持范围 | 仅 Full Access 与 Read Only；完整 Review staging、文件级决定、Apply 与恢复延期到 `0.3.0-alpha.2`。Review 不得静默提权为 Full Access | A9 任务书 §1、ADR-0096 |
| WIN7-10 Gate 4 | Full Access、Read Only `PASS`；Review `FAIL_REVIEW_STAGING_BACKEND_NOT_CONFIGURED`，正式工作区零写入；原始 FAIL 永久保留，不追溯改判 | `C:\A9验收\证据\WIN7-10\gate4-review-staging-failure-20260825-01.txt`；SHA-256 `F5CEA1D1B08797AFA846E7A63032CAD0000660DFF0FA3786310BABE38A99F571` |
| 候选连续性 | `WIN7-10-GLOBAL-MODE-CLEAN`（source commit `f6cc12984f59745cd0edcd16f387080d603ba553`；ZIP `afbc68f7ab0a6b23975fc5ee5d07b35f0cbc26580e6775f5f22b9b54bc034399`；manifest `fa6ba75906d170d12ee695e0ec0a4a3bb51172e18c3eaa780e6e1a9ff7600adb`）不变；ADR-0096 为 `DOCUMENT_ONLY_NO_CANDIDATE_BYTE_CHANGE`，同一候选从现场检查点 J4 继续，不重打包或重跑已完成的同候选项目 | [`a9-alpha1-review-deferral-20260825.json`](status/a9-alpha1-review-deferral-20260825.json) |
| J1～J3 | 现场报告已推进到 J4，但候选外目录尚未归档足够的应用审计、文件、Test/Diff 事实；最终裁决前保持 `EVIDENCE_PENDING`，优先补档，不要求无意义重跑 | A9 任务书 §3.8、同上状态 JSON |
| A9-00～A9-06 | 文档/差距 Gate、实现、fixture 行为测试与 Electron 22 开发机入口保持 PASS；这些不是 Win7/Alpha 1 正式 PASS | [`a9-01-to-a9-06-developer-gates-20260823.json`](status/a9-01-to-a9-06-developer-gates-20260823.json)、A9 任务书 §3.1 |
| A9-07 / Win7-03 | 当前替代候选源码提交 `dce391c492a64a1e119d841ca1c41b18b2e3f60c`；ZIP SHA-256 `37c3e51c3092fc022592be177969247e025c2c8a4357e76fc76300a37ad60080`；manifest SHA-256 `63801337df6fd75a2ccede17a954fd7c278c0f370e354294154a17e0a671b626`；`source_dirty=false`。Gate 3 五项 `PASS`；Gate 4～10、Win10 与 `A9_ALPHA1_PASS` 仍为 `NOT_PERFORMED` | [`a9-07-win7-gate3-integrity-repair-20260824.json`](status/a9-07-win7-gate3-integrity-repair-20260824.json)、[`a9-trusted-agent-runtime-latest.json`](status/a9-trusted-agent-runtime-latest.json) |

### A9 安全与授权边界

- A9 Full Access、TrustedShell 和真实 Git 运行在可信工作区中，不是安全沙箱；外部写入、破坏性 Git、永久删除和系统级操作仍需目标绑定确认。
- Renderer/Preload 不直接获得文件、进程、凭据或任意网络权限；能力继续经版本化 Schema IPC、Core/Policy、获批 Runner/Tool Host 和审计链执行。Win7 SP1 x64、C14、允许路径及 C15/C16 仍以 [`AGENTS.md`](../AGENTS.md)、[`WIN7_CONSTRAINTS.md`](WIN7_CONSTRAINTS.md) 和 A9 任务书为准。

### 下一步与硬门槛

1. 先把 J1～J3 的现场事实归档到候选外证据目录，再从同一 `WIN7-10` 检查点 J4 继续。
2. 写入旅程前，若界面仍显示 Review，必须由用户显式切回 Full Access；Review 缺后端只能 fail-closed。
3. Win10、Win7 剩余 Gate 和 Alpha 1 完成裁决仍按 A9 任务书执行；`A9_ALPHA1_PASS` 只覆盖 Full Access/Read Only，不得写成 Review PASS。

### 当前现场阻塞

- 当前 Win7 账户仍是启用的管理员高完整性令牌；普通用户验收未解除。
- 现场仅有 PowerShell 2.0，PowerShell 5.1 路径未执行；CMD fallback 可单独验证。
- J4 真实 Git 需要有范围的 Git 前置和用户明确授权；一次性工作区尚未 `git init`。
- 1366×768 / 100%/125% DPI、Win10、Win7 Gate 4～10、真实 Windows DPAPI 与 Alpha 1 总体裁决仍为 `NOT_PERFORMED` 或待现场证据。

### A9 证据导航

- A9-00～A9-06 开发机 Gate 汇总：[`a9-01-to-a9-06-developer-gates-20260823.json`](status/a9-01-to-a9-06-developer-gates-20260823.json)。
- 真实 Provider、真实模型旅程与开发包进展：[`a9-04-real-provider-deepseek-20260823.json`](status/a9-04-real-provider-deepseek-20260823.json)、[`a9-05-real-model-journeys-deepseek-20260823.json`](status/a9-05-real-model-journeys-deepseek-20260823.json)、[`a9-07-developer-package-progress-20260823.json`](status/a9-07-developer-package-progress-20260823.json)。
- A9-07 当前替代候选、输入锁、Gate 3 与运行时摘要：[`a9-07-win7-gate3-integrity-repair-20260824.json`](status/a9-07-win7-gate3-integrity-repair-20260824.json)、[`a9-trusted-agent-runtime-latest.json`](status/a9-trusted-agent-runtime-latest.json)、[`a9-07-input-lock.json`](../release/win7-product-v3/a9-07-input-lock.json)。更早的 clean-candidate JSON 保持历史状态，不作为当前候选指针。
- 权威差距与交付计划：[`a9_trusted_agent_gap_and_delivery_plan_2026-08-22.html`](reports/2026-08/a9_trusted_agent_gap_and_delivery_plan_2026-08-22.html)。

## 历史阶段与证据索引

> 本节只保留历史阶段的裁决、边界和可追溯入口；长篇过程、原始失败和机器可读记录继续留在原路径，不因入口压缩而删除、覆盖或重新判定。

| 阶段 | 历史裁决与必须保留的负面事实 | 权威入口 |
|---|---|---|
| A1～A3 | A1 `OWNER_ACCEPTED_FOR_MVP`；A2 `DESKTOP_ALPHA_2_MVP_PASS`；A3 受控 Gateway `A3_CONTROLLED_GATEWAY_PASS`、公网真实模型 `A3_REAL_MODEL_PUBLIC_NETWORK_PASS`；A3P 保持 `PARTIAL_EVIDENCE`，A3P-10 完整重启后真实连接证据不足；PAC/企业代理、企业 CA/模型和正式 Phase 3/E7 为 `ENVIRONMENT_MISSING_OR_NOT_PERFORMED`。 | [`A1-A3-CLOSEOUT-20260804-01.json`](status/mvp-baselines/A1-A3-CLOSEOUT-20260804-01.json)、[`a1_a3_acceptance_closeout_2026-08-04.html`](reports/2026-08/a1_a3_acceptance_closeout_2026-08-04.html)、[`a3_controlled_gateway_acceptance_2026-08-04.html`](reports/2026-08/a3_controlled_gateway_acceptance_2026-08-04.html)、[`a3r_deepseek_public_model_acceptance_2026-08-04.html`](reports/2026-08/a3r_deepseek_public_model_acceptance_2026-08-04.html) |
| A4 / SPIKE_02 前置 | A4-20260806 的 C03 为 `FAIL`、正式 C05 为 `ENVIRONMENT_MISSING`；`A4-20260810-000002` 的 `FAIL_CLOSED`、`ACL_ROLLBACK_FAILED`、`RECOVERY_REQUIRED` 原始事实保留；随后 v21 在独立租约下才取得 `WIN7_PASS`。 | [`a4-execution-beta-latest.json`](status/a4-execution-beta-latest.json)、[`a4_automated_acceptance_orchestration_2026-08-05.html`](reports/2026-08/a4_automated_acceptance_orchestration_2026-08-05.html)、[`SPIKE_02_TERMINAL_CONTAINMENT`](tasks/SPIKE_02_TERMINAL_CONTAINMENT.md) |
| A5 / SPIKE_02 | D-011 Win10 构建曾为 `PASS_WITH_PACKAGING_GAP`；Win7 正式边界为 `NO_GO_INTERACTIVE_WINPTY` 与低风险非交互 Runner `WIN7_PASS`，H3 只读日志通过；交互终端、任意 Shell、高风险、未知 Profile 和网络隔离仍 fail-closed。 | [`win10-native-builds-latest.json`](status/win10-native-builds-latest.json)、[`integration-closeout-latest.json`](status/integration-closeout-latest.json)、[`SPIKE_02_TERMINAL_CONTAINMENT`](tasks/SPIKE_02_TERMINAL_CONTAINMENT.md) |
| A6 / SPIKE_04 | D-014 在 `E22-SQLITE343-LOCAL-SSD` Profile 取得 `WIN7_PASS`；结论只覆盖本地 NTFS SSD，不外推 HDD、网络盘、未知介质或生产索引服务。 | [`a6-storage-latest.json`](status/a6-storage-latest.json)、[`SPIKE_04_STORAGE_INDEX`](tasks/SPIKE_04_STORAGE_INDEX.md) |
| A7 RC | 唯一 RC `RC_PASS`；RC06-v4 原始子报告 `RC06-M01 FAIL` 保留；RC0708 首次返回的 `FAIL_CLOSED_KIT_MUTATED_EVIDENCE_INELIGIBLE`、首次租约 fail-closed 且不计分等历史事实保留；旧的 `NOT_PERFORMED` 快照不被最终 PASS 反向改写。 | [`a7-win7-rc-acceptance-latest.json`](status/a7-win7-rc-acceptance-latest.json)、[`a7-win10-rc-closeout-latest.json`](status/a7-win10-rc-closeout-latest.json)、[`a7-rc0708-lifecycle-kit-latest.json`](status/a7-rc0708-lifecycle-kit-latest.json)、[`RC_01_WIN7_RELEASE_CANDIDATE`](tasks/RC_01_WIN7_RELEASE_CANDIDATE.md)、[`A7 Agent 交接快照`](reports/2026-08/A7_AGENT_HANDOFF_20260816.md) |
| A8 Agent-first | 开发机阶段最终为 `A8_DEVELOPER_COMPLETE_VALIDATION_READY`；外部三层为 `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE`。旧候选的 `FAIL_A8_03_VALIDATION_HARNESS_ASAR_FALSE_NEGATIVE`、后续 `NOT_RUN`、本地 GUI 不可用时的 `NOT_PERFORMED_LOCAL_GUI_APPROVAL_UNAVAILABLE` 均是历史事实；A8 证据不继承为 A9 PASS。 | [`A8_AGENT_FIRST_PRODUCT_EXPERIENCE`](tasks/A8_AGENT_FIRST_PRODUCT_EXPERIENCE.md)、[`a8-06-developer-checkpoint-20260821.json`](status/a8-06-developer-checkpoint-20260821.json)、[`a8-06-package-validation-kit-20260821.json`](status/a8-06-package-validation-kit-20260821.json)、[`a8-06-asar-candidate-reissue-20260821.json`](status/a8-06-asar-candidate-reissue-20260821.json)、[`报告索引`](reports/README.md) |

## 状态维护规则

- 当前可执行事实只在本页顶部和当前 A9 段落维护；详细 Gate 事实写入现有 `docs/status/*.json` 或 `docs/reports/YYYY-MM/`，不在多个入口复制逐日叙述。
- 历史 `PASS`、`FAIL`、`NOT_PERFORMED`、`NOT_RUN`、`ENVIRONMENT_MISSING` 与 `fail-closed` 结论按候选和证据绑定解释；后续局部通过不得覆盖早期失败，也不得把开发机/Win10 结果冒充 Win7 或 Alpha PASS。
- `docs/tasks/*.md`、`docs/acceptance/`、`release/**/VALIDATION.md` 和原始证据路径保持稳定；关闭阶段后只追加关闭报告，不搬迁任务书或证据。
- 文档-only 更新不得重打包候选、伪造哈希绑定或重跑已完成 Gate；候选身份、字节和证据闭包变化必须由对应任务书与发布流程单独裁决。
- 模块窗口不得直接修改本页或任务索引、路线图、决策记录；由整合窗口在验证完成后统一更新。

详细历史报告入口：[`docs/reports/README.md`](reports/README.md)。稳定任务与生命周期入口：[`docs/tasks/README.md`](tasks/README.md)。

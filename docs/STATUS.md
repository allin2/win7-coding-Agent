# 当前项目状态

> 本页是当前状态的唯一人类可读入口。历史报告中的测试数量不自动代表当前基线。

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
| A8 当前阶段 | `A8-06 / A8_DEVELOPER_COMPLETE_VALIDATION_READY`；UI 交互修复候选已从远端可达干净源码双构建并通过开发机 smoke，Chrome Harness 因扩展未安装保持 NOT_PERFORMED，等待该复验及 Win10/Win7 验收 |

`latest-validation.json` 是证据采集时的不可变快照，其 `head_commit` 必须是当前主线的
祖先，但不应在每次文档提交后伪造重绑。当前代码 HEAD 以 Git 历史为准；表中哈希只表示
已归档的结构化证据生成点。

## A8 Agent-first 产品体验（2026-08-20）

- 负责人已确认 [`Agent-first 产品需求合同 v1`](prds/WIN7_AGENT_FIRST_PRODUCT_REQUIREMENTS_V1.md)，
  并授权 [`A8_AGENT_FIRST_PRODUCT_EXPERIENCE`](tasks/A8_AGENT_FIRST_PRODUCT_EXPERIENCE.md) 在独立
  `codex/a8-agent-first-product` 分支实现。目标是把固定场景验收控制台重构为对话优先的 Coding Agent：
  自然语言启动、直接/计划模式、连续 Assistant 消息、工具卡片、上下文引用、多文件 Review、真实测试、
  会话/Goal 恢复以及隔离的 Terminal/受限 Browser 工作区。
- ASAR 修复新候选已重新签发为 `A8_DEVELOPER_COMPLETE_VALIDATION_READY`，但不是
  `COMPLETE / A8_RC_PASS`。新候选尚未在 Win10/Win7 执行；旧候选的 Win10 A8-03
  `FAIL_A8_03_VALIDATION_HARNESS_ASAR_FALSE_NEGATIVE` 与后续 `NOT_RUN` 保留为历史现场事实。A7
  `0.1.0-rc.1` 保持只读冻结，其 `RC_PASS` 不自动传递给 A8。
- A8-00 已完成并取得文档 Gate `A8_00_DESIGN_PASS`。冻结合同为
  [`A8-00 产品架构与数据合同`](prds/A8_00_PRODUCT_ARCHITECTURE_AND_DATA_CONTRACT.md)，关键裁决为
  ADR-0075，追踪报告为
  [`a8_00_design_gate_2026-08-20.html`](reports/2026-08/a8_00_design_gate_2026-08-20.html)。信息架构、
  原始事件/展示投影、会话恢复、多文件准备区、A7 迁移白名单和 A8-01～A8-05 测试口径已冻结，
  没有应用代码或产品测试被计入本 Gate。
- A8-01 已完成并取得 `A8_01_CONVERSATION_PASS`：对话主界面、Enter/Shift+Enter、直接/计划模式、
  计划前置审批、工具卡片和原始 `gateway.delta` 审计后的确定性聚合已实现；`A8E-01`～`A8E-06`、
  Composer、计划零副作用与原始审计测试通过，仓库级 `npm run verify` 通过。证据见
  [`a8_01_conversation_gate_2026-08-20.html`](reports/2026-08/a8_01_conversation_gate_2026-08-20.html)。
  A8-02 也已取得 `A8_02_WORKSPACE_SESSION_CONTEXT_PASS`：同工作区多会话、Session/Thread/Turn/Task/Run
  隔离、产品级单活动任务锁、Goal 原子修订与恢复投影、文件/目录/文本上下文引用，以及只读代码查看器
  已实现；`A8S-01`～`A8S-04`、Shell 148 项、State 235 项和仓库级 1010 项回归通过。本地 Chromium
  1280×720 三栏布局无页面溢出。证据见
  [`a8_02_workspace_session_context_gate_2026-08-20.html`](reports/2026-08/a8_02_workspace_session_context_gate_2026-08-20.html)。
- A8-03 已取得开发机实现 Gate `A8_03_REVIEW_APPLY_PASS`：ReviewSetV1、私有 staging、逐文件决定、漂移零写入、批量回滚、验证绑定、Host/IPC/Renderer Review seam 已实现；开发机回归与未完成门禁见
  [`a8_03_review_staging_progress_2026-08-20.html`](reports/2026-08/a8_03_review_staging_progress_2026-08-20.html)。当前没有真实项目测试 Profile，Electron 22、Win10、Win7 和 RC 仍为 `NOT_PERFORMED`，不因此宣称 A8 整体 PASS。
- A8-03 最新开发检查点已冻结 `a8-system-prompt-v1`（ADR-0079，SHA-256
  `f1bdcace084d27d71383b4ddfe81cef61029796a36859995c6e9614f1cbc9160`），解除 A3 遗留纯只读提示词与
  私有 Review staging 的语义冲突；受控 Gateway Provider Review 和已知凭据在 prompt、Workspace 工具
  结果、Provider chunk/响应/工具参数中的持久化前阻断均已通过。仓库级 7 模块 1051 项、Shell 169 项和
  文档检查通过，机器可读记录见
  [`a8-03-developer-checkpoint-20260821.json`](status/a8-03-developer-checkpoint-20260821.json)。真实 Electron
  三文件 Review 自动化代码已就绪，但本地 GUI 审批服务因用量限制拒绝启动，本项保持
  `NOT_PERFORMED_LOCAL_GUI_APPROVAL_UNAVAILABLE`；随后 GUI 审批服务恢复，真实生产 Electron 8-case 已
  PASS（证据等级 `DEVELOPER_SURROGATE_ELECTRON`）。开发机实现 Gate
  `A8_03_REVIEW_APPLY_PASS` 已签发，仅解除 A8-04；可复用执行器、外层工件哈希核验、故障回收合同测试和
  Win10/Win7 移交包已就绪，不以 Chromium Harness 或入口 smoke 替代。
- 现有 `NO_GO_INTERACTIVE_WINPTY` 继续有效。A8 Terminal 必须形成新的运行时 Profile 与 Win7 证据，
  否则只能保持清晰的 disabled/fail-closed 状态；不得以缺少现代强隔离为由放开任意 Shell、模型输入、
  未登记浏览或系统配置修改。
- A8-04 已取得开发机实现 Gate `A8_04_RUNNER_TERMINAL_BROWSER_SETTINGS_DIAGNOSTICS_PASS`：生产 Renderer
  的 Terminal/Browser disabled、Runner 未登记状态、RunnerLog 64 KiB/控制序列与危险链接清理、Settings
  fake key 脱敏、Diagnostics System Prompt/hash、CSP/Preload 和 `terminal.input` fail-closed 均已通过。
  真实 Electron 8-case 与 1280×720 Diagnostics 截图证据见
  [`a8_04_terminal_browser_settings_gate_2026-08-21.html`](reports/2026-08/a8_04_terminal_browser_settings_gate_2026-08-21.html)、
  [`a8-04-boundary-electron-qa-20260821.json`](status/a8-04-boundary-electron-qa-20260821.json)；运行使用
  Electron 41.7.1 macOS arm64，属于 `DEVELOPER_SURROGATE_ELECTRON`，只解除 A8-05。Electron 22、Win10、
  Win7 与最终 RC 仍为 `NOT_PERFORMED`。
- A8-04 Gate 收口时重新执行 `npm run verify`，7 模块共 1058 项（Gateway 202、Workspace 97、State 236、
  Core 229、Runner 67、Git Adapter 51、Shell 176）全部通过；`npm run docs:check` 为 83 files / 19 task files
  PASS。该回归仍是开发机证据，不等于 Win10/Win7 或 RC PASS。
- A8-05 已取得开发机实现 Gate `A8_05_PERSISTENCE_RECOVERY_MIGRATION_PASS`：D-014 `SqliteDatabase` seam
  的版本化结构化实体、Session/Goal/Turn/Task/Run 与事实重开、Review 文件哈希投影、Validation 摘要、
  活动执行中断、`AWAITING_REVIEW` 保留、Review 基线漂移 `STALE`、损坏/缺口/引用 fail-closed 以及 A7
  白名单迁移均已实现。Host 启动只恢复事实/UI，不自动调用模型、Runner、Terminal、Browser 或 Apply；
  机器可读证据见 [`a8-05-developer-checkpoint-20260821.json`](status/a8-05-developer-checkpoint-20260821.json)，
  D-014/Electron 22/Win10/Win7 锁定执行包见 [`a8-05-persistence-validation-kit-20260821.json`](status/a8-05-persistence-validation-kit-20260821.json)。
  开发机 `npm run verify` 为 7 模块 1072 项（Gateway 202、Workspace 98、State 245、Core 229、Runner 67、
  Git Adapter 51、Shell 180），`docs:check` 为 85 files / 19 task files；外部层仍为
  `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE`，该 Gate 只解除 A8-06 实现准备。
- A8-06 已取得开发机 Gate `A8_06_PACKAGE_AND_VALIDATION_READY`，状态为
  `A8_DEVELOPER_COMPLETE_VALIDATION_READY`：输入锁定的 Electron 22.3.27、D-013 v24、D-014
  8.7.0/SQLite 3.43.1 经过真实哈希核对后完成独立 `0.2.0-alpha.1` 候选装配；缺失/错误输入和
  `.env`/私钥/缓存/winpty/node-pty payload 负向测试 fail-closed，重复构建 ZIP/manifest/SBOM/
  许可证与 sidecar 字节一致，native helper/SQLite 位于 `resources/native`，A8-03/A8-04/A8-05
  验证入口和安装/并存/升级/回滚/卸载模板已随包交付。候选 manifest 只将
  `developer_package_integrity` 写为 `PASS`，product/Win10/Win7/RC 保持 `NOT_PERFORMED`；实际
  包和 manifest 哈希、命令与剩余外部门禁见 [`a8-06-developer-checkpoint-20260821.json`](status/a8-06-developer-checkpoint-20260821.json)
  与 [`a8-06-package-validation-kit-20260821.json`](status/a8-06-package-validation-kit-20260821.json)。
- 最新 UI 交互审计修正了旧复核的证据高估：旧 Chrome Harness 没有会话关闭/取消 seam，1024 px
  检查器和 760 px 以下导航不可达；跨会话关闭会丢失活动任务句柄，提交句柄返回前切换会话会跳过自动
  取消，Host 重开后新建会话也会因未恢复工作区失败。源码提交 `7121853` 已修复并推送；标题栏关闭入口、
  活动/归档分组、窄宽导航/检查器、焦点约束与语义控件均已补齐。仓库验证实际为 1083 项 PASS，新候选
  ZIP `e76b465b…5f9ab`、manifest `c3f51f98…7eda8` 双构建一致且 schema v2 10/10 PASS。Chrome 扩展未安装，
  Chrome Harness 为 `NOT_PERFORMED_LOCAL_CHROME_EXTENSION_UNAVAILABLE`；Win10/Win7/RC 不变。证据见
  [`a8-06-ui-interaction-audit-checkpoint-20260821.json`](status/a8-06-ui-interaction-audit-checkpoint-20260821.json)。

## 验证状态

- 当前 main 开发机回归：`PASS` — 2026-08-12 在 `ec9d27a` 运行 `npm run verify`，7 个模块
  969 项全部通过（Gateway 202、Workspace 80、State 219、Core 225、Runner 65、
  Git Adapter 51、Shell 127），同时通过 TypeScript 检查、构建与静态设计门。该结果证明
  A4/A5/A6 收口后的 main 可回归，不替代 A7 RC 或新的 Win7 实机验收。
- 当前 A1～A3 收口工作区已建立最终指纹；最新证据编号为 `A1-A3-CLOSEOUT-20260804-01`（见
  `status/mvp-baselines/`），SHA-256 为
  `597eab41ee7fdedd1227ab92b9c318ce55d1965fad7e316620821e88115faf21`。历史 Win7 MVP 产品
  收口仍绑定 MVP-20260802-14；没有提交、暂存、切换或丢弃用户修改。
- 开发机回归：`PASS` — 2026-08-04 A1～A3 收口重跑 `npm run verify`，7 个模块共
  942 项测试通过（Gateway 202、Workspace 80、State 219、Core 225、Runner 46、
  Git Adapter 51、Shell 119）；各模块 lint/build 与静态设计门同时通过。
  `MVP-20260802-14` 的 889 项历史日志仍保存在
  [`validation/mvp_verify_MVP-20260802-14.txt`](../validation/mvp_verify_MVP-20260802-14.txt)，不改写为当前计数。
  Gateway 13 项 loopback 测试本次在仅允许本地临时端口的受控环境再次通过；
  历史结构化证据见 [报告](../validation/report_gateway_loopback_MVP-20260802-15.json)
  和[完整日志](../validation/gateway_loopback_MVP-20260802-15.txt)。
- Win7 SP1 x64：`OWNER_ACCEPTED_FOR_MVP` — C01 系统/补丁、Electron 22.3.27、CPython 3.8.10、受控 MinGit、机器 PATH 缺失工具检测、工件哈希和 Bitvise 状态在 MVP-20260802-14 只读采集中全部通过；真实 Electron 产品入口随后在隔离目录启动，沙箱 Renderer 加载、只读诊断回传并以退出码 0 正常退出，无对应 Electron 残留。客观 SPIKE/Phase 的正式状态没有被改写；延期边界由 ADR-0055 和负责人 disposition 单独记录。详情见 [Win7 MVP 实机报告](reports/2026-08/win7_mvp_acceptance_report.html)。
- SPIKE_03 的旧部署 `dist` 风险已由 fail-closed 修复并在受控 MinGit 派生包上重测；旧报告仍保留为历史证据，新报告绑定当前 adapter/harness SHA-256。
- 全部替代条件、命令与原始证据见 [status/latest-validation.json](status/latest-validation.json)；本页不把 MVP 替代项写成正式 Phase 或发布通过。
- MVP-20260802-12 已补充证据型 [SBOM](acceptance/MVP-20260802-12_SBOM.json) 与输入哈希清单（[manifest.sha256](acceptance/MVP-20260802-12_manifest.sha256.txt)）；两者明确标记为非正式产品发布闭包。
- MVP-20260802-14 新增 [负责人 disposition](acceptance/MVP-20260802-14_OWNER_DISPOSITION.json)、[产品/证据哈希清单](acceptance/MVP-20260802-14_product_manifest.sha256.txt)、[运行时盘点](../validation/win7_runtime_evidence_MVP-20260802-14.json)和[真实产品入口 smoke](../validation/report_product_shell_MVP-20260802-14.json)。
- Desktop Alpha 2 的 Win7 增量门禁已完成 A2-W03（用户拒绝且工作区不变）和
  A2-W04（显式批准后写入，目标 SHA-256 与 UTF-8/CRLF 预期一致，无临时/备份残留）。
  2026-08-04 又完成打包 Electron 自动证据 A2-W07～W10、W14、W15；原始报告为
  [`A2-W07-W15-20260804_auto-report.json`](acceptance/A2-W07-W15-20260804_auto-report.json)，
  报告 SHA-256 为 `a0c11b3f9db933ed591df278571e8fe813980e55228825a42ccbc9b4635473c8`，
  独立 SSH 复核确认 Win7 `certutil` 哈希一致、Bitvise PID 1780 仍运行且无本轮探针残留。
  同日 A1 product-entry smoke 2/2 与 A1 W08 security/readonly 14/14 也已在真实打包 Electron
  上通过；首次 A2-W01 GUI 检查暴露嵌套 `src` 目录下 Replay 未继续遍历的问题，已修复并以
  88 个 Shell 测试及重新部署的 Electron 包复核；用户随后确认 W01 工作区/会话/只读任务完成，
  人工记录见 [`A2-W01-20260804_gui-confirmation.json`](acceptance/A2-W01-20260804_gui-confirmation.json)。
  W02 检查又发现原 UI 未单独显示目标文件哈希，已补齐“目标 SHA-256”字段并重新部署；用户已确认
  W02 Diff 且未批准，人工记录见 [`A2-W02-20260804_gui-confirmation.json`](acceptance/A2-W02-20260804_gui-confirmation.json)。
  W13 撤销准备曾暴露 `task.undo_prepare` IPC Schema 漏登记 `sessionId`，已修复、以 90 个 Shell 测试
  复核并重新部署；新的隔离 W13 GUI 流程已完成初次批准写入，独立 SSH 核验匹配目标哈希，
  记录见 [`A2-W13-20260804_fresh-initial-approval.json`](acceptance/A2-W13-20260804_fresh-initial-approval.json)。
  随后撤销审批面板因 Renderer 任务 ID 切换竞态未显示；先前撤销计划人工记录已作废，竞态修复
  已通过 90 个 Shell 测试并部署，新的 `A2-W13-racefix-20260804` 隔离流程待重跑。
  racefix 流程现已完成 W13 初次审批、撤销审批面板、第二次审批和最终 SSH 恢复核验，记录见
  [`A2-W13-racefix-20260804-final.json`](acceptance/A2-W13-racefix-20260804-final.json)。
  W11/W12 打包探针原始报告已取回：W11 后端故障注入 `PASS`，并随后完成真实 GUI 锁定/恢复指引确认、用户恢复及 SSH 独立核验；W12 也完成真实 GUI 重启、恢复页面确认、用户点击恢复及 SSH 独立核验；原始报告为
  [`A2-W11-W12-20260804_report.json`](acceptance/A2-W11-W12-20260804_report.json)，SHA-256 为
  `b854a12c8cf370ffa53052b103f2b094dda9fb97b150e9fec27ab2c2a640e8ef`。
  W11 最终人工/SSH 收口记录为 [`A2-W11-GUI-20260804-final.json`](acceptance/A2-W11-GUI-20260804-final.json)：页面显示
  `rollback_failed`、写入锁定和人工恢复指引，未误报已回滚；最终文件恢复为原始 SHA-256，且无残留。
  W12 最终人工/SSH 收口记录为 [`A2-W12-20260804-final.json`](acceptance/A2-W12-20260804-final.json)：最终文件 SHA-256
  恢复为原始 `ce84104d3edf357a9a6bd8bf671190e05124f009a7deb77a834076bca83f17bb`，`.bak` 与恢复清单均不存在，
  Bitvise `BvSshServer` 仍为 `RUNNING`。
  详细路径、哈希和边界见
  [`INTEGRATION_01` §10](tasks/INTEGRATION_01_ROBUSTNESS_HARDENING.md)。A2-W01～W15 的 MVP 实机证据现已全部具备，
  因此 Desktop Alpha 2 仅按本次受控单文件修改 MVP 口径标记 `PASS`；这不改变正式 Phase/发布 Gate，也不表示
  Runner、Git、终端、Gateway 或 SQLite 可用。
- C01–C20 剩余门禁、前置依赖、执行顺序、证据接口和连接保护条件已形成 [剩余约束验收方案](reports/2026-08/win7_remaining_constraints_acceptance_plan.html)。

## Desktop Alpha 3 受控 Gateway 验收（2026-08-04）

- 受控结果为 `A3_CONTROLLED_GATEWAY_PASS`，结构化证据见
  [`A3-20260804-01_controlled-gateway.json`](acceptance/A3-20260804-01_controlled-gateway.json)，Win7 细项见
  [`A3-WIN7-HTTPS-20260804.json`](acceptance/A3-WIN7-HTTPS-20260804.json)，精致 HTML 报告见
  [`a3_controlled_gateway_acceptance_2026-08-04.html`](reports/2026-08/a3_controlled_gateway_acceptance_2026-08-04.html)。结果仅是受控 HTTP/HTTPS
  fixture 与 CONNECT proxy 的验收，不是企业 E7、真实模型或正式 Phase 3 PASS。
- A3-01 根验证通过：7 个模块共 909 项测试（Gateway 193、Workspace 80、State 219、Core 225、Runner 46、Git Adapter 51、Shell 95），lint/build 与设计门通过。
- A3 受控行为已通过：Replay 默认且无出站、显式 HTTP/HTTPS Gateway、HTTPS TLS 1.2 + 有效 CA、主机名/错误 CA fail-closed、SSE 协议/截断失败、3 次有界重试与 1.2 秒总 deadline、取消无迟到完成、CONNECT 成功/407 分类、凭据内存与脱敏，以及 Gateway→Core→Workspace 只读工具→UI 纵向链路。
- 已构建独立 A3 包并校验 Electron 22.3.27 SHA-256 为锁定值
  `2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb`；CA 私钥、API key、代理密码未进入仓库/报告。临时 fixture、proxy 已停止，端口检查未发现残留。
- Win7 A3 W01～W15 受控 Gateway 用例现均已有 PASS 证据：W13 使用 A3.2 独立产品包和新隔离
  工作区完成两次显式审批闭环，结构化记录见
  [`A3-W13-20260804-02.json`](acceptance/A3-W13-20260804-02.json)。初始 → 初次写入 → 撤销恢复
  的 SHA-256 依次为 `14e851…a582` → `33b305…2db5` → `14e851…a582`，无 `.tmp/.bak`；
  其他 W01～W12、W14、W15 继续引用既有原始报告。未改变网卡/路由/防火墙/服务/PATH、未重启。
- A2-W01～W15 仍按既有 Win7 MVP 实机证据与原指纹记录为 PASS；A3-W13 是 A3 范围的独立重验，
  不改写 A2 历史证据。DPAPI A3P-01～A3P-10 的整体结论仍待独立 W15 清理及其余 A3P 项收口；
  PAC/企业代理、企业 CA/模型和正式 Phase 3/E7 仍延期；公网真实模型由下述 A3.1 独立切片记录。

## Desktop Alpha 3.1 DeepSeek 公网真实模型验收（2026-08-04）

- 结果为 `A3_REAL_MODEL_PUBLIC_NETWORK_PASS`。结构化证据见
  [`A3R-DEEPSEEK-20260804.json`](acceptance/A3R-DEEPSEEK-20260804.json)，精致 HTML 报告见
  [`a3r_deepseek_public_model_acceptance_2026-08-04.html`](reports/2026-08/a3r_deepseek_public_model_acceptance_2026-08-04.html)。
  该结论只证明当前 Win7、当前 DeepSeek 账户和当前公网路径，不是企业 E7 或正式 Phase 3 PASS。
- Win7 无密钥公网探测连接 `api.deepseek.com:443`，223 ms 内完成 TLSv1.3 授权握手；证书 CN 为
  `api.deepseek.com`、Issuer 为 `TrustAsia DV TLS RSA CA 2025`，`/models` 返回预期 401 且响应正文未保存。
- 真实完成任务产生 638 个连续事件、618 个 Gateway 流增量；模型依次驱动
  `workspace.list_directory`、`workspace.search_text`、`workspace.read_text`，三组 started/completed 后
  以 `task.completed` 收口。报告 SHA-256 为
  `08b05d7f56bf6b6757dd3aa287816cfe869670fe9aed4432abec043d05c0d7be`。
- 独立真实取消任务在 48 个流增量后进入 `task.cancelling`，6 ms 后成为最终 `task.cancelled`；
  `task.completed=0`、`task.failed=0`，关闭报告前无迟到事件。报告 SHA-256 为
  `48466a13297bfc1194d54ef1a196d0c3c1f3bda4bd38daa6e4203a64ce60b575`。
- fix3 自包含包清单共 908 条，清单 SHA-256
  `8eb60ddf2c515fa4c896ea149d10a118c883f393925991ec3f77ddd8db02d3aa`；Electron 与关键 Product/Gateway
  文件均在 Win7 由 `certutil` 复核匹配。API key 仅在主进程内存，严格 key/Bearer 模式在报告、隔离
  userData/evidence 中均无值命中；退出后 Electron/Node 为 0，Bitvise 保持 `RUNNING`，SSH 22 保持连接。
- A2-W01～W15 继续按既有 Win7 MVP 证据和当前根回归标记 PASS；A3R 只暴露只读工具，未把历史
  A2 W13 冒充新的 A3 重测。A3-W13 已由 A3.2 独立记录完成。企业 Gateway/CA/代理/PAC、企业模型服务、
  正式 E7/Phase 3、Runner/Git/终端/SQLite/Updater/插件仍未完成或未启用；DPAPI 整体切片仍按 A3P
  证据单列。

## Desktop Alpha 3 A3-W13 独立写入审批重验（2026-08-04）

- 结果为 `PASS`，结构化证据见
  [`A3-W13-20260804-02.json`](acceptance/A3-W13-20260804-02.json)，精致 HTML 报告见
  [`a3_w13_write_approval_acceptance_2026-08-04.html`](reports/2026-08/a3_w13_write_approval_acceptance_2026-08-04.html)。
- A3.2 产品包在新隔离工作区完成两次独立显式审批：初次写入后文件 SHA-256 为
  `33b305c1903672e81d27ef07aa62decb62780fecb12740256765d19ade602db5`，撤销第二次审批后恢复为
  初始 `14e851741ab4d7acddef09d0dc7592d71f5e954c83c404fea2ba44bd9548a582`，无 `.tmp/.bak`。
- Renderer 当前按任务独立显示时间线；`prepareUndo` 会清空旧任务列表。本次以两个用户停点和两次
  SSH `certutil` 哈希核验形成证据，不宣称初次任务和撤销任务在一个 UI 列表中同时可见。
- 用户关闭产品窗口后，Electron/Node 进程均为 0，`BvSshServer` 为 `RUNNING`，SSH 22 仍可用；
  未改变网卡、路由、防火墙、服务、PATH，未重启。A3P 其他 DPAPI 原子项和企业 E7 仍单独处理。

## A1–A3 验收总览与 Win7 收口（2026-08-04）

- 总体口径为 `A1_A2_MVP_AND_A3_ACCEPTANCE_RECORDED_WITH_FORMAL_DEFERRALS`。A1 为
  `OWNER_ACCEPTED_FOR_MVP`，A2 为 `DESKTOP_ALPHA_2_MVP_PASS`，A3 受控 Gateway W01～W15 为
  `A3_CONTROLLED_GATEWAY_PASS`，A3R DeepSeek 公网纵向切片为
  `A3_REAL_MODEL_PUBLIC_NETWORK_PASS`。据此可以认为 A1～A3 的既定 MVP/Alpha 验收已完成，
  但不能写成正式发布、正式 Phase 3 或企业 E7 完成。
- A3P 的 Electron safeStorage / Windows DPAPI Current User 保存、重启状态识别与解密、清除、
  损坏 fail-closed 受控探针已通过；四份报告保留在 Win7 最终包中。由于 A3P-10“重启后显式
  真实连接”没有形成完整的本地归档证据，A3P 整体状态保持 `PARTIAL_EVIDENCE`，不提升为 PASS。
- 项目负责人明确批准永久删除 Win7 `C:\Win7CodingAgent` 下固定 23 个旧包、临时工作区和
  userData 目录。清理后 23 项均不存在，只保留 4 个最终包与 4 个 evidence 目录；按清理前盘点
  估算释放 `1,725,141,506` bytes（约 1.61 GiB）。最终复核 Electron/Node 均为 0，Bitvise
  `BvSshServer` 为 `RUNNING`，TCP 22 的 IPv4/IPv6 listener 均存在；临时清理脚本也已删除。
- 完整矩阵、证据 SHA-256、保留/删除清单和正式延期项见
  [`A1-A3-CLOSEOUT-20260804-01.json`](acceptance/A1-A3-CLOSEOUT-20260804-01.json) 与
  [A1–A3 Win7 验收总览报告](reports/2026-08/a1_a3_acceptance_closeout_2026-08-04.html)。

## A4 Execution Beta 非交互实机验收（2026-08-05～06）

- A4 无人值守编排 `A4-20260805-123467` 的 AUTO-00～AUTO-07 全部通过，锁定 x64 候选
  SHA-256 为 `733f549181228273afd65817b6448be1cc4beb888f8bf2caa294e4e1299ceecc`；Win7
  非交互 Helper 14/14，通过后无相关残留，`taskkill=false`，Bitvise 保持 `RUNNING`。
- 补充执行 `A4-20260806-140606` 的 REM-00～REM-06 全部通过：正式 C02 为 `PASS`；C03 为
  `FAIL`，因为 Restricted Token 进程仍能写入工作区外兄弟目录；C05 loopback TCP/UDP/DNS
  可达，但缺少批准的外部/企业端点和网络审计，因此正式 C05 保持 `ENVIRONMENT_MISSING`。
- 完整 SPIKE_02 仍为 `NO_GO_FORMAL_GAPS`：19 个原子项中直接通过 6 项（C01、C02、C06、
  C07、C08、N06）；C04 需要人工 ACL 授权。A5/D-011 的 Electron 22 ABI 工件已经由 Win10 构建
  并复核，但终端集成/harness 仍未完成，T01～T05/N01～N05 尚未执行。D-013 v15 的 Win10
  源码→二进制闭包为历史 `PASS`；`A4-20260810-000002` 已在 Win7 fail-closed：轮前、上传、smoke、
  harness 启动和后置零残留通过，但 C01/C03/C04/C05 共享 `ACL_ROLLBACK_FAILED`，REM-D07 又遇到
  空 stderr 的 `certutil 0x800703EE`。该轮 ledger 当时为 `RECOVERY_REQUIRED`，生产 Runner 未开放。
- v21 recovery 已在签名租约 `A4-20260810-000004` 下完成：REM-D01～D08、C01～C07 的九个
  必需用例、上传/回收双向 SHA-256 与后置零残留检查全部通过；ADR-0065 协调器在 commit
  `20b4480ab2ea4f53b3ccee7df39e47755ed92102` 上分级为 `WIN7_PASS`，租约已 `RELEASED`，活跃
  租约为 0。C05 仅证明 loopback 可达，正式企业/网络证据仍为 `ENVIRONMENT_MISSING`。
- 机器可读状态见 [`status/a4-execution-beta-latest.json`](status/a4-execution-beta-latest.json)，
  自动化与补充审计见 [A4 报告索引](reports/README.md)。A1～A3 已接受证据及 A4-14/A4-20/A4-21
  历史原始证据均未改写。

## Win10 原生构建与 A7 产品层进展（更新至 2026-08-20）

三条原生构建返回均已完成适用的结构、哈希、工具链、PE/API/CRT、smoke 和合规材料复核。共享 D-017
Profile 已被实际使用，但下表只说明“可以进入 Win7 集成/验证”，不代表对应 A5/A6/A7 已验收完成。
完整机器可读台账见
[`status/win10-native-builds-latest.json`](status/win10-native-builds-latest.json)。

| 轨道 / 组件 | Win10 结果 | 已解除的卡点 | 当前仍阻塞 |
|---|---|---|---|
| A4 / D-013 helper | v21 Win10 `PASS`：返回包 `5d3bdd6b…f8ef`、helper `98964fc5…ce5`、input-lock `60ddd80c…795b`；capture selftest、v142 logic、native smoke、PE/API/CRT 与开发机 containment 37/37 均 `PASS` | `A4-20260810-000004` 已由 ADR-0065 协调器分级为 `WIN7_PASS`；restricted primary、精确 SID 集合、Low Integrity、ACL rollback、C01～C07、双向哈希和后置零残留均通过，租约已释放 | D-013 已解除；C05 不提供网络隔离，交互终端、高风险和未知 Profile 继续拒绝 |
| A5 / D-011 node-pty + winpty | `PASS_WITH_PACKAGING_GAP`；返回包 `c938f115…46ea`，三项原生工件均为 x64，ABI 110 与 smoke 通过 | Win7 实测裁决为 `NO_GO_INTERACTIVE_WINPTY`；D-013 v24 低风险非交互 Runner 与 H3 只读日志已分别取得正式 `WIN7_PASS` | 交互终端不进入 Win7 v1；返回包内部总清单缺口由 A7 统一发布 manifest/SBOM 收口 |
| A6 / D-014 better-sqlite3 | `PASS`；返回包 `2cb0cd32…2794`，247 项清单全匹配，WAL/FTS5/schema smoke 通过 | D-014 已为 `READY_FOR_WIN7_VALIDATION`，不再缺 SQLite Electron ABI 工件 | 本行只记录 2026-08-07 Win10 构建前置；后续 Win7 正式结果见下文 A6 章节 |
| A7 / 发布包装 | 当前唯一 RC ZIP `39eecb6a…040c9` 已取得开发机、Win10、Win7 三层 PASS；唯一租约 `lease-A7-RC-20260820-055210` 下 RC-01～RC-10 全部通过，协调器评分 `WIN7_PASS` | D-013 v24 与 D-014 按 manifest 在 ASAR 外置装配；RC-04/05/06 产品矩阵、RC-07 升级/故障回滚、RC-08 retain/purge 卸载及 RC-09 零残留/系统不变均在 Win7 实机复核 | `RC_PASS`；交互 winpty、任意 Shell、高风险/未知 Profile 和网络隔离声明仍不包含在 RC 中 |

因此 A4/D-013 v21、A5/D-011 和 A6/D-014 的 Win10 构建前置均已完成；A4/D-013 v21 又已取得
协调器正式 `WIN7_PASS`。结合 A5 v24 非交互 Runner 与 H3 正式证据，SPIKE_02 以
`NO_GO_INTERACTIVE_WINPTY / WIN7_PASS_FOR_LOW_RISK_NONINTERACTIVE_RUNNER` 受限收口，
`A7_GATE=PASS_FOR_WIN7_V1_RC`；不得据此启用交互终端、任意 Shell、高风险 Profile 或强网络隔离声明。

## A6 正式 Win7 本地 SSD 存储验收（2026-08-10）

- A6 `20260810-06` 已获协调器正式 `WIN7_PASS`，唯一正式 Profile 为
  `E22-SQLITE343-LOCAL-SSD`：`dccs-chaizl-PC`、Win7 SP1 x64 build 7601、本地 NTFS Samsung 870 EVO、
  Electron 22.3.27 / ABI 110、better-sqlite3 8.7.0、SQLite 3.43.1、FTS5、WAL。签名租约绑定
  提交 `2a07d6db8d95816e84d7919898d46abfd543a8af` 与包 manifest
  `11500d96a0e0504339ce547bd3f80d76aacb2bb66f439f97f349d94b9fa7ea86`；Mac/Win7 双向哈希、轮前/轮后、
  BvSshServer/SSH 22 和零残留均通过。机器可读的唯一正式状态为
  [`status/a6-storage-latest.json`](status/a6-storage-latest.json)。
- 性能预算 #5～#8 全部达标：S01 60 秒 61650.86 QPS；S03 为 1312.34（3k）、1213.89（10k）、
  1089.52（30k）文件/s；S05 100 次查询 P95 183ms；S06 在 517.79MB 触发、清理后 199.60MB，
  完整性通过。S02、S04、S07、S08、F01～F06、P08/C11-PATH 也均通过。
- 原始返回证据约 1.2GB，位于本地忽略归档
  `A6/WIN7_A6_SSD_EVIDENCE_20260810-06/`；正式状态列出每个返回文件的大小和 SHA-256。历史 SSD
  evidence 与 disposition 保持不变。此结论只覆盖本地 SSD，不推断 HDD、网络盘或未知介质性能，
  也不表示生产 EventStore 或索引服务已实现。

## A5 非交互 Runner v24 构建收口（2026-08-11）

- D-013 v24 返回包 `WIN7_D013_HELPER_ARTIFACTS_20260811-105127.zip` 已独立复核为
  `BUILD PASS / candidate_eligible=true / REVIEW PASS`；外层 SHA-256 为
  `5a65a023e33addc7b06bca6956443df8dc2e3bfab67649ac6d8c3ff4472d667c`，helper SHA-256 为
  `7f86dac89862b2c61d55fe83ba00bf7cdaa69714d24d0f9d21b62f9040d1c134`。
- 返回包绑定源码提交 `78113f49db6ec94f803ae38518c42eaa740448ba` 和锁定的
  Win10/VS2019/v142/SDK 10.0.19041/x64/static CRT Profile；内部 24 项清单、logic tests、
  PE/API/CRT、严格 UTF-8 捕获、普通执行和合作取消 smoke 全部通过。取消 smoke 证明 helper
  在返回 `canceled=true` 前完成 Job 回收和 Low Integrity 的精确 SDDL 回滚。
- v23 首轮 Win7 L08 的 ACL 残留记录仍保留且该候选仍为拒绝状态。V24 已在
  `D013-RUNNER-20260811-020000`、目标 `192.168.1.11` 和新 ADR-0065 签名租约下完成 L01～L10，
  10 项全部 PASS；轮后 helper/ping 与 Low Integrity 残留均为零，工件哈希匹配，Bitvise 保持
  `RUNNING`。协调器评级为 `WIN7_PASS`，生命周期已 `RELEASED` 且无活动租约。
- A5 的生产非交互 Runner containment 核心卡点因此正式解除，结论为
  `CONTAINMENT_READY_FOR_LOW_RISK_NONINTERACTIVE_RUNNER`。交互式 winpty 继续 No-Go，任意 Shell、
  高风险本地命令与未登记 Profile 继续拒绝。
- H3 r2 已在 Win7 普通交互式桌面会话完成只读日志与取消验收：STDOUT/STDERR 分栏、滚动、
  358-byte 截断提示、`task.cancelling → runner.finished(cancelled) → task.cancelled` 反馈均通过，
  界面不存在终端输入能力。最终 postflight 为 `residues=[]`、无 Low Integrity 标签残留、Bitvise
  `RUNNING` 且 H3 工件哈希匹配。首包的标签回滚 `ACCESS_DENIED` 失败及干净恢复证据继续保留；
  ADR-0072 明确只读 profile 不修改工作目录 Integrity Label，child token 仍保持 Low Integrity。
- A5 非交互 Runner + 只读日志整合任务现为 `COMPLETE`，结论为
  `H3_READONLY_STREAMING_LOG_UI_PASS / CONTAINMENT_READY_FOR_LOW_RISK_NONINTERACTIVE_RUNNER`。

## A4/A5/A6 整合收口与 A7 Gate（2026-08-12）

- A4 `eee6219`、A5 `af589dc`、A6 `fb2084d` 已进入 `codex/integrated-robustness` 祖先链，
  收口提交 `793cc47` 又已成为当前 main `ec9d27a` 的祖先；main 与 `origin/main` 同步，本次状态
  更新开始前工作树干净。
  A6 继续使用规范 ADR-0066；A5 分支本地 ADR-0066～0071 以规范 ADR-0067～0072 导入，原始
  Win7 证据字节未重写。
- SPIKE_02 正式受限结论为 `NO_GO_INTERACTIVE_WINPTY` 与
  `WIN7_PASS_FOR_LOW_RISK_NONINTERACTIVE_RUNNER`；SPIKE_04 保持 `WIN7_PASS`，因此
  `A7_GATE=PASS_FOR_WIN7_V1_RC`。Renderer 终端输入、网络隔离、任意 Shell、高风险和未知 Profile
  均未开放。
- 中央只读归档为 `/Users/qlyf/Developer/win7-agent-artifacts/closeout-20260812/`，共 205 个文件、
  1,469,654,891 字节；`CLOSEOUT_MANIFEST.json` SHA-256 为
  `df4aa1957eb6c12a4311138424702fe92ba4d1da6a96a11734e5bda9a0327cea`。中央副本与原路径/符号链接
  的逐文件大小及 SHA-256 均一致。
- A4、A6、A5 worktree 已按顺序且不带 `--force` 移除，分支引用保留，原绝对工件路径通过只读
  符号链接继续可访问。机器可读单一事实来源为
  [`integration-closeout-latest.json`](status/integration-closeout-latest.json)。A7 已从该唯一基线启动；
  后续开发进展不会改写本次 A4/A5/A6 收口证据。

## A7 RC-04 产品装配与 Windows smoke（更新至 2026-08-13）

- 提交 `f24d9a42a915dcab9eecb1e61d0870ac11a84555` 已建立 manifest 绑定的产品 composition root：
  Electron 创建 Renderer 前逐文件校验并装配 D-013 v24 低风险 `whoami` Runner 与 D-014
  `better-sqlite3 8.7.0 / SQLite 3.43.1 / ABI 110` 状态层；交互终端、任意 Shell、网络盘和 HDD
  性能声明继续显式关闭。
- 状态层已接入 schema v1 的 SQLite V2 EventLedger，覆盖 WAL/FTS5/Profile 检查、原子批次、事件
  指纹、线程序列、容量上限、启动恢复扫描和关闭 checkpoint。当前持久化的是审计事件事实；完整
  session catalog 仍为进程内状态，不宣称重启后的完整会话恢复。
- 开发机 `npm run verify` 通过 7 个模块共 981 项测试，release/RC 合同 19/19 通过。由同一干净提交
  和锁定输入连续两次生成的 ZIP 字节一致：731 个 manifest 文件、100,877,883 字节、SHA-256
  `909166478a8766ed380221d7b349e4db841651516be42feba7db281e0678f1d5`；独立逐文件校验通过。
- 锁定候选已在 Windows x64 上完成两轮真实产品入口 smoke：Electron 22.3.27、Renderer/诊断、
  安全基线、D-013 `win7-whoami` Runner composition、D-014 SQLite 3.43.1/WAL composition
  全部通过，两轮退出码均为 0；状态库为 49,152 字节，关闭后无 `-wal`/`-shm` 残留。返回 summary
  与两轮原始 JSON 的 SHA-256 已在开发机复算，并与候选 release manifest 及 8 个关键产品文件
  逐项绑定。只读原始归档位于
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc04-windows-smoke-20260813/`。
- RC-04 限定结论为 `PASS`；在 RC-05/RC-06 工具包形成前，阶段状态曾为
  `RC04_WINDOWS_PRODUCT_SMOKE_PASS_RC0506_PENDING`。Win10 仍仅为 `PARTIAL_RC04_SMOKE_ONLY`；
  RC-05/RC-06、完整 Win10 门禁、新 Win7 租约与 RC 总体结论均未完成。
  返回报告中“State remains in-memory”是与同报告 SQLite/WAL 和数据库事实矛盾的遗留 MVP 注释，
  已记录为非阻断文案不一致且原始字节保持不变。机器可读记录见
  [`a7-rc-development-latest.json`](status/a7-rc-development-latest.json) 和
  [`a7-rc04-windows-smoke-latest.json`](status/a7-rc04-windows-smoke-latest.json)。
- RC0506 首轮 Windows 返回按 fail-closed 裁决：RC05-P02 失败，RC-06 虽报告 7/7，但由于执行前加载
  未受 KIT manifest 约束的外部 `noasar.js`，且未返回生产测试库，不能进入正式 PASS。首轮 5 个原始
  返回物已按字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-windows-attempt1-20260813/`。
- 不改动产品候选的 v2 验证包已由提交 `46ccd90` 修复：ASAR 模式由 manifest 绑定 harness 内部设置，
  禁止 `NODE_OPTIONS`/外部 preload；P02 改用实时哈希绑定的回环 `ping.exe`；失败总是生成 summary、
  fatal 且退出码为 1；返回的生产/篡改数据库由独立验证器复算。两次确定性构建均得到 12,294 字节、
  SHA-256 `3aaaa718efe68ba45e1b510cab707d147f42230a8b9fd692df014a891f108a8a`。当前状态为
  `RC04_PASS_RC0506_ATTEMPT1_FAIL_CLOSED_V2_READY`；v2 的 RC-05/RC-06 仍未执行，Win7 与 RC 均为
  `NOT_PERFORMED`。机器可读记录见
  [`a7-rc0506-validation-kit-latest.json`](status/a7-rc0506-validation-kit-latest.json)。
- v2 随后在普通 Win10 CMD 完成执行并保持 fail-closed：RC-06 的 7 项、生产数据库 `quick_check`、
  2 条连续事件、FTS 与零 WAL/SHM 残留已独立复核为 `PASS`；RC-05 的 P02 因回环 `ping.exe`
  返回 exit 1 而失败。该轮还暴露一个真实 C11 缺陷：CP936 head/tail 截断文本出现替换字符，
  但旧实现错误记录 `replacement_count=0`。返回报告写出的进程退出码 0 又与 harness 的
  `process.exit(1)` 合同冲突，因此 RC-05 与组合门禁均保持 `FAIL_CLOSED`。
- 2026-08-14 的 v3 源码修复已就绪：Runner 对截断 head/tail 分别做多字节边界对齐；RC-05
  改用 KIT manifest 绑定的本地固定字节探针，通过候选自身哈希绑定的 `electron.exe` 执行，
  不访问网络；`RUN_RC0506.cmd` 会记录并原样返回真实子进程退出码。提交 `963eabe` 已两次
  确定性重建出相同的新产品 ZIP，SHA-256 为 `39eecb6a…040c9`，包内 Runner 修复与源构建哈希
  一致。旧候选 `90916647…f1d5` 已移入只读归档；它的 RC-04/RC-06 PASS 不自动继承给新候选。
  v3 KIT 已由提交 `f47fd84` 两次确定性生成相同的 13,502 字节 ZIP，SHA-256 为
  `9cbe6be7…72b1e`，6 个 ZIP 文件和 5 个 manifest payload 全部独立复核。新候选与 KIT 已归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-v3-ready-20260814/`；当前仍需在普通 Win10
  CMD 对新候选重跑 RC-04/05/06，故不得提前声明新的 Win10 PASS。
- 2026-08-16 v3 Windows 轮已在 Win10 专业版 19045 x64（本地 NTFS SSD）完成并按 fail-closed 裁决：
  RC-04 两轮各 3/3 PASS、退出码 0、无 WAL/SHM 与进程残留；RC-06 全 7 项 PASS，生产库与篡改库
  均已返回并独立哈希绑定（`quick_check=ok`）；RC-05 的 P02/C01 因
  `CONTAINMENT_UNAVAILABLE` 失败——v3 harness 以候选 `electron.exe` 注册
  `rc05-harness-local-probe`，而 D-013 原生 helper 的 C06 allow-list（真实 System32 直属
  8 个工具）在创建 Job 前拒绝该可执行文件。helper 的拒绝本身是正确的 fail-closed 行为，
  定性为 v3 验证设计与原生安全边界不兼容，不是环境噪音。本轮 `RUN_RC0506.cmd` 真实退出码为 1，
  退出码合同首次得到履行。返回包 `return-to-dev-20260816.zip`（22,204 字节，SHA-256
  `5e02a7e5…a6a0e`）15/15 manifest 项复核一致，已按字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-windows-attempt3-v3-20260816/`。
  当前分层结论：`RC04=Windows PASS / RC05=FAIL_CLOSED / RC06=Windows PASS / WIN10=NOT_PASS /
  WIN7=NOT_PERFORMED / RC=NOT_PERFORMED`。
- v4 修复已完成并通过两次确定性构建，且不扩大产品 helper allow-list：RC-05 探针改用 helper 已允许的
  System32 `findstr.exe` 读取 harness 内生成的确定性 GBK fixture（215 字节，SHA-256
  `f1e8bf35…7da9`，正例含中文解码、截断用例压 128 字节上限验证多字节边界对齐），取消用例改用
  仅 127.0.0.1 的 System32 `ping.exe`；harness 内置 C06 allow-list 镜像并对全部 harness profile
  做执行前预检，新增 fixture 确定性与 allow-list 相容性（含 v3 electron.exe 回归负例）合同测试，
  release 合同测试由 19 项增至 22 项（RC0506 合同 9→12），全量 `npm run verify` 7 模块通过。
  产品候选字节不变（继续锁定 `39eecb6a…040c9`）。v4 KIT
  `RC0506_WINDOWS_VALIDATION_KIT_20260816-v4.zip`（14,239 字节，SHA-256 `ff5a26ef…c6d5`，
  绑定提交 `ef1486e`）两次构建字节一致，内含 README 候选哈希已修正为当前候选；已归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-v4-ready-20260816/kit/`。下一步是在普通
  Win10 CMD 以新 KIT 重跑 RC-05/RC-06（RC-04 可按同候选既有两轮 PASS 引用），通过后才可准备
  完整 Win10 分层门禁与新的 A7 RC Win7 签名租约。
- 2026-08-16 22:32 v4 Windows 轮已在同一 Win10 19045 x64 主机完成并通过：RC-05 六项中五项
  PASS、RC05-P01 按预期以 `NOT_APPLICABLE_TARGET_PROFILE_HASH` 延期（Win10 whoami 字节与
  Win7 目标 pin 不同），总评 `PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED`；RC-06 全 7 项再次
  PASS，返回数据库哈希与 v3 轮完全一致（`0070c116…9640`/`81870940…a2e`，确定性成立）。
  findstr fixture 探针实测：正例 215 字节 CP936 解码零替换字符；128 字节上限下保留
  127 字节、省略 88 字节且零替换（与开发机预测的 head 63 + tail 64 一致）；取消用例
  `ping 127.0.0.1` 以 `job_object` contain 回收，`child_job_assignment_verified` 与
  `acl_rollback_verified` 均为真。fixture SHA-256 与 harness 记录常量
  `f1e8bf35…7da9` 一致。`RUN_RC0506.cmd` 真实退出码 0（PASS 合同履行）；前后
  electron/helper 进程均为 0。开发机 `verify-rc0506-evidence.mjs` 独立复核 PASS，
  返回包 10/10 manifest 项一致（17,718 字节，SHA-256 `9c3d5bae…080d`），已按字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-windows-attempt4-v4-20260816/`。
  当前分层结论：**当前候选 `39eecb6a…040c9` 的 RC-04/RC-05/RC-06 Windows 证据齐备**；
  剩余门禁为 RC-07 升级/回滚、RC-08 卸载/零残留、最终 Win10 层的 RC-03 精确 PE/API/CRT
  总门禁，以及新的 A7 RC Win7 签名租约下的完整 RC-01～10 实机矩阵。Win7 与 RC 总体仍为
  `NOT_PERFORMED`，不得提前声明。
- 2026-08-16 深夜，RC-07/RC-08 生命周期工具 v1 已实现并两次确定性构建（提交 `e10b2a1`）：
  `RC0708_WINDOWS_LIFECYCLE_KIT_20260816-v1.zip`（18,407 字节，SHA-256 `0103998b…f1ff`，8 个
  ZIP 文件）。升级侧实现旁路 staging、严格 release-manifest 全树等值校验、由 cmd 包装器在
  harness 阶段间执行的同卷目录改名激活（阶段退出码合同 0/1/42/43）、注入式暂存文件损坏
  （激活前检出）与激活后损坏（字节级一致回滚、无混合版本）三场景，以及用户数据快照不变
  与残留审计；卸载侧实现隔离区托管卸载、`version` 文件锁探针（harness 宿主 electron.exe
  自身不可改名）、显式 retain/purge 数据保留策略与 transcript 证明的隔离区清除。产品候选
  字节不变；升级源使用上一代 `f24d9a4` 候选 ZIP（`90916647…f1d5`，只读归档）以证明真实
  版本前进。合同测试扩至 31 项（RC0708 9 项，含真实候选 ZIP 嵌套布局验证、CJK/空格路径、
  wrapper 合同与验证器正负例），全量 `npm run verify` 7 模块通过。KIT 已归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-lifecycle-kit-v1-20260816/`；
  机器可读记录见 [`a7-rc0708-lifecycle-kit-latest.json`](status/a7-rc0708-lifecycle-kit-latest.json)。
  RC-07/RC-08 的 Windows 执行仍为 `NOT_PERFORMED`，按 README 三轮升级 + 两轮卸载执行并通过
  `verify-rc0708-evidence.mjs` 独立复核后方可计入 Win10 分层门禁。
- 2026-08-18，RC-07/RC-08 的 Win10 交付已打包为**单一交付 ZIP**
  `RC0708_WIN10_DELIVERY_20260816.zip`（201,260,387 字节，SHA-256 `9b49b6a1…f008ef2`，
  两次确定性构建字节一致），内装：锁定新候选 `Win7CodingAgent-0.1.0-rc.1-win7-x64.zip`
  （`39eecb6a…040c9`，文件名保持原样——harness stage 绑定 basename）、上一代候选改名字节副本
  `…-PREVIOUS-f24d9a4.zip`（`90916647…f1d5`，与锁定旧版哈希一致，作为升级源避免同名冲突）、
  生命周期 KIT `RC0708_WINDOWS_LIFECYCLE_KIT_20260816-v1.zip`（`0103998b…f1ff`）、
  内嵌 SHA-256 清单 `RC0708_WIN10_DELIVERY_SHA256.txt` 与操作提示词
  `RC0708_WIN10_OPERATION_PROMPT.txt`（UTF-8 无 BOM/LF）。提示词规定 Win10 侧按
  哈希核对 → 目录布局（产品目录外解压 KIT）→ 五轮执行（success / corrupt-staged-file /
  activation-corruption 三轮升级 + retain / purge 两轮卸载，共用单一 evidence 根）→
  原样返回全部证据；交付包与提示词已只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-win10-delivery-20260816/`，
  机器可读记录见 [`a7-rc0708-lifecycle-kit-latest.json`](status/a7-rc0708-lifecycle-kit-latest.json)。
  RC-07/RC-08 的 Windows 执行仍为 `NOT_PERFORMED`。
- 2026-08-19，v1 返回包 `return-to-dev-20260819.zip`（14,725 字节，SHA-256
  `22134211…780e`）虽报告三轮 RC-07 与两轮 RC-08 均 PASS，但报告同时确认执行前在 KIT 目录新增
  CJS 别名、注入 `process.noAsar`、修改两个 manifest 绑定的 CMD，并新增串联 CMD；其中“CMD 不在
  KIT_MANIFEST”的说法与 v1 清单事实冲突。因此该轮正式裁决为
  `FAIL_CLOSED_KIT_MUTATED_EVIDENCE_INELIGIBLE`，对 RC-07/08 与 Win10 Gate **无推进效力**。原返回包
  与 21 个展开文件已逐字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-windows-attempt1-v1-20260819/`，不改写原始证据。
- 同日已从干净提交 `5eb2b29` 生成不可现场修补的 v2 KIT：统一 lower-hyphen 模块名、最早设置
  `process.noAsar`、把 ASCII/CRLF CMD 的准确字节纳入 manifest，并在每个阶段强制复核
  KIT_MANIFEST、精确入口哈希及额外控制文件；五份报告必须携带 `kit_provenance`，开发机验证器还须
  以 `--kit` 绑定同一 ZIP。KIT `RC0708_WINDOWS_LIFECYCLE_KIT_20260819-v2.zip`（20,952 字节，
  SHA-256 `0c3be032…55d2`，manifest SHA-256 `929c3a18…9e17`）及提交 `2f4bccf` 生成的单一交付包
  `RC0708_WIN10_DELIVERY_20260819-v2.zip`（201,263,145 字节，SHA-256 `f7ced50b…61137`）均连续
  构建两次且逐字节一致，已分别只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-lifecycle-kit-v2-20260819/` 与
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-win10-delivery-v2-20260819/`。开发机全量
  `npm run verify` 983 项通过，RC0708 合同 12 项通过；v2 Windows 五轮仍为 `NOT_PERFORMED`，
  当前 Win10 总门禁继续等待 RC-03、RC-07、RC-08，Win7/RC 仍为 `NOT_PERFORMED`。
- 2026-08-19 01:14，v2 Windows attempt 2 返回包
  `RC0708_V2_WINDOWS_RETURN_20260819-011417.zip`（17,794 字节，SHA-256 `00464f63…7ba8`）与
  sidecar 本地复核一致，ZIP 20 个证据文件完整；开发机以精确 KIT `0c3be032…55d2` 执行
  `verify-rc0708-evidence.mjs --kit` 独立复核 PASS。RC-07 success、staged corruption、activation
  corruption 三轮及 RC-08 retain/purge 两轮均 status PASS、exit code 0；五份 provenance 精确绑定
  manifest `929c3a18…9e17`，`unexpected_control_files=[]`，无生命周期或进程残留。返回包和报告已
  逐字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-windows-attempt2-v2-20260819/`。报告中的
  “未用包装脚本”按证据解释为“未用额外或修改后的包装脚本”；正式 manifest 绑定的
  `RUN_RC0708_*.cmd` 执行由报告与 transcript 共同证明，不构成阻断。
- RC-03 同日按精确字节连续性收口：唯一 RC ZIP 内仅有两个 ASAR 外置原生文件；helper
  `7f86dac8…c134` 与 D-013 v24 Win10 返回包逐字节一致（x64、静态 CRT、forbidden API/动态 CRT
  扫描和 smoke PASS），`better_sqlite3.node` `7138aa23…15cc` 与 D-014 Win10 返回包逐字节一致
  （x64、Electron ABI 110、forbidden API/动态 CRT、WAL/FTS5 PASS），且 RC-06 已在当前候选真实
  加载。该段形成 2026-08-19 的 **`WIN10_PASS`** 分层结论；2026-08-20 的 Win7/RC 正式结果见
  下节，不再沿用当时的 `NOT_PERFORMED`。Win10 机器可读收口见
  [`a7-win10-rc-closeout-latest.json`](status/a7-win10-rc-closeout-latest.json)。

## A7 Win7 RC-01～RC-10 正式验收（2026-08-20）

- 唯一候选 ZIP `39eecb6a…040c9` 在 `dccs-chaizl-PC`（Win7 SP1 x64 build 7601，
  本地 NTFS Samsung SSD 870 EVO 1TB）完成完整 RC-01～RC-10。正式租约
  `lease-A7-RC-20260820-055210` 使用 Ed25519，绑定候选提交 `963eabe…d56c`、发布 manifest
  `ff1a46ff…32d0`、RC0506-v4、RC0708-v2、Win7 内置 Shell 提取脚本、目标身份和全部 required cases。
- RC-04 两轮产品启动、RC-05 Runner、RC-06 WAL/FTS5/恢复/中文空格路径/上限/损坏与网络盘拒绝、
  RC-07 三轮升级/故障回滚、RC-08 retain/purge 两轮卸载均通过；RC0708 独立 exact-kit verifier
  对五份报告复核 PASS。
- RC06-v4 原始子报告保留 `RC06-M01` FAIL：它错误调用 Win7 PowerShell 2.0 不存在的现代 Storage
  cmdlet。其余六项均 PASS；协调器以未改写的 `Win32_DiskDrive` UTF-16 原始证据确认系统盘型号
  含 `SSD 870 EVO 1TB`，补足物理 SSD 条件后裁决 RC-06 PASS。该补充不把原始子报告伪装成 PASS。
- 轮前轮后 `BvSshServer=RUNNING`、SSH 22 可用、相关进程零残留；启动时间、Bitvise 配置、路由、
  防火墙和机器 PATH 均字节一致。64 项回收证据 manifest SHA-256 为
  `045dd72f16963c6033403eb71260c0a622ab12b43cd2461ab82a12133ac89270`；协调器评分 `WIN7_PASS`，
  租约已 `RELEASED`，活跃租约为 0。因此 A7 正式状态为 **`RC_PASS`**。
- 首次租约 `lease-A7-RC-20260820-054316` 因验收用 7za 与 Win7 不兼容，在 RC-01 前 fail-closed，
  经干净 postflight 后释放且未评分，门禁影响为 NONE。机器可读事实来源为
  [`a7-win7-rc-acceptance-latest.json`](status/a7-win7-rc-acceptance-latest.json)。
- A7 已以非快进方式进入 main `bd43c63`，且该提交已与 `origin/main` 一致。双层注释标签
  `artifact-source/win7-v0.1.0-rc.1` 绑定实际构建源 `963eabe`，
  `acceptance/win7-v0.1.0-rc.1` 绑定验收收口 `bd43c63`，两者均已推送远端。
- RC 长期只读归档为 `/Users/qlyf/Developer/win7-agent-artifacts/releases/win7-v0.1.0-rc.1/`：
  139 项、309,627,153 字节，`CLOSEOUT_MANIFEST.json` SHA-256 为
  `ec67c340d5df7ea113dd99457fef9074842ee3dd4ea6f8755b87e2657e364b95`。逐文件大小/SHA-256、
  清单 sidecar、候选 ZIP、发布 manifest、SBOM、许可证、最终 Win10 与 Win7 证据均已复核，
  且不含私钥、凭据、缓存或历史失败尝试的重复副本。

## MVP 已接受的延期项

- Electron 可运行入口已经形成 Win7 实证；完整五视图、安装器、跨模块用户任务和卸载/回滚仍是下一阶段产品装配工作。
- SPIKE_01 T03 按 ADR-0055 接受“父侧无 stdin 句柄、无数据进入”的 MVP 语义；正式合同的子侧 `readable=true` 事实保持不变，后续 Core 仍需显式关闭/隔离。
- SPIKE_02 已受限收口：交互 winpty 为 No-Go，低风险非交互 Runner 与 H3 只读日志为 Win7 PASS；C05 网络隔离、任意 Shell、高风险和未知 Profile 仍未开放。SPIKE_04 的本地 SSD Spike 已正式通过；A7 已实现生产 EventLedger 装配并于 2026-08-20 在唯一签名租约下取得完整 Win7 `RC_PASS`。机械盘门禁已由 ADR-0066 取代为正式 SSD Profile。
- 低风险登记 Profile 已在 A7 RC 中经清单装配并完成 Windows/Win7 验收；交互终端、任意 Shell、高风险和未知 Profile 继续 fail-closed。A7 的审计事件事实使用有容量上限的 SQLite EventLedger，session catalog 仍为进程内状态；`RC_PASS` 来自唯一签名租约证据，不得扩大为完整会话恢复或未登记能力通过。
- D-012 官方原 ZIP 含 GCM；本次受控派生包已完成绑定当前 SHA-256 的完整 G10 MVP 矩阵，正式交付仍需 SBOM/许可证闭包；当前远端完整 Git不能替代。
- Phase 1 的 CPython 3.8.10 与 Win7 capability probe 已补齐；Phase 1/2 仍缺架构 Gate 解除、冻结合同要求的获授权物理断网/干净环境证据，Phase 2 也没有独立 Win7 只读 Agent 入口。
- E2 中文+空格路径与 Git 缺失降级已完成客观准备性复测；探针退出码 1 是预期的 `TOOL_NOT_FOUND` 降级信号，不代表正式 E1/E2 Gate 已开放。
- Electron 两次启动均记录 `os_crypt_win.cc ... Access is denied (0x5)`；当前 MVP 不使用凭据存储，故不阻断只读入口。DPAPI 凭据生命周期在正式启用 Gateway 凭据前必须单独实现和验收。

## RC PASS 后续边界

1. A7 状态已进入 main，双层标签与长期归档已完成；这些治理动作没有改变候选字节或实机证据。
2. 交互 winpty、任意 Shell、高风险/未知 Profile、网络隔离声明和未登记在线更新继续关闭；任何开放均需新任务书、依赖评审和独立 Win7 验收。
3. 企业代理/CA/模型/更新服务具备后再执行 E7；视觉、冷重启、物理断网或严格全新 OS 证据不得从本次隔离目录验收外推。
4. 保留候选 ZIP、签名租约、64 项回收证据和稳定归档的哈希绑定；不得重写原始 RC06-v4 FAIL 子报告或 RC0708 原始报告。

ADR-0066 已将机械盘要求替换为本地 SSD 正式 Profile；D-014 构建 Gate 与 SPIKE_04 Win7 验收均已通过，
性能预算 #5～#8 已按正式证据更新。HDD、网络盘与未知介质仍没有性能支持声明。

## 状态使用规则

### A8-06 独立复核修复（2026-08-21）

- 独立复核确认首版 A8K-04 的 Windows 入口不可正式使用：普通 Node 16.17.1 不能加载 Electron ABI 110
  的 D-014 binding；A8-03/A8-04 报告不满足声明的统一字段，三份报告没有共同绑定候选 manifest；报告路径
  还会向候选目录写入未纳入 manifest 的文件。上述属于开发机可修缺陷，不是外部环境不可用。
- ADR-0085 修复已实现：A8-05 由结构化 Node 包装器启动包内 `electron.exe` Node-mode；三份报告升级为
  evidence schema v2、逐文件复算完整 manifest、记录相同 `candidate_manifest_sha256`、验证目标 ABI/操作者，
  并仅写入候选兄弟 evidence 目录；evidence-set verifier 联合检查 required cases 和同一候选。
- `source_dirty: true` 的开发包现明确为 `external_acceptance_eligible: false`，正式 Win10/Win7 工具在启动
  产品前拒绝。ADR-0086 同时把需要回填最终哈希的 current status/构建后报告移出不可变候选。修复已在
  干净提交 `7ccaed6b98e4ebb9f77d993d22c3ed136bdeb8c0` 上无 `--allow-uncommitted` 重建两次，结果字节一致：
  ZIP `d1e8dbbe5e9a09e8d50fc1411c11e48de6d0bb734d7bce1d957bb42d3f45aef9`，manifest
  `85c874843947478307515de4a56391fc7cbee2689fbffb5b7af8508e3873087c`，`source_dirty: false`、
  `external_acceptance_eligible: true`。A8-06 状态已重新签发为 `A8_DEVELOPER_COMPLETE_VALIDATION_READY`；
  Win10、Win7 和 RC 继续保持 `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE` / `NOT_PERFORMED`，A7 PASS 不继承。
- 后续独立 Agent 审查的五项结论已逐条复核：ABI wrapper、辅助模块、候选外证据路径和 clean candidate
  均已关闭；新增打包测试扫描 `validation/*.mjs` 的全部相对依赖。旧 Electron 41 schema v1 报告保留为
  不可用于正式评分的历史 surrogate，未伪造 manifest 绑定；A8-03/A8-04 source kit 已明确由 A8-06 schema v2
  正式命令取代。机器可读复核见 [`a8-06-independent-review-followup-20260821.json`](status/a8-06-independent-review-followup-20260821.json)。

### A8-06 消除外部 Node.exe 假设（ADR-0087，2026-08-21）

- 验证套件全面改用包内 Electron 22.3.27 的 Node 模式（`set ELECTRON_RUN_AS_NODE=1&& .\electron.exe`）
  作为脚本宿主，彻底消除外部 `node.exe` 假设；`preflight` 移除 `where node` 检查，改为探测
  包内 `electron.exe -v` 并校验工件哈希。
- A8-03/A8-04 在拉起真实 Electron GUI 测试窗口前净化子进程环境变量（清除 `ELECTRON_RUN_AS_NODE`）。
- 增补了“无系统 Node 仍可执行验证套件”的自动化合同测试（`scripts/release/test/a8-package.test.mjs`）。
- 修复已从远端可达的干净提交 `03c4d6e20b58a7897c9e1c6427143f75bef98a57` 重建两次，结果字节一致：
  ZIP SHA-256 `5b24fe7ead243569e12c38c947aa31c1a04091bdea1eba3e8bd4b0bb3966ae6e`，manifest SHA-256
  `8def5b3f8e3421009cf8b079fb87eaf61896ce36f82bfcefff9c8f2a60a993a7`，`source_dirty: false`、
  `external_acceptance_eligible: true`。
- 该候选取代 source commit 不在分支历史中的 `3d8f1b3…` 候选；新证据使用普通追加提交，不 amend
  `03c4d6e`。开发机 schema v2 smoke 10/10 PASS 且候选未改变，追踪见
  [`a8-06-candidate-provenance-reissue-20260821.json`](status/a8-06-candidate-provenance-reissue-20260821.json)。

### A8-06 Win10 ASAR 物理文件校验修复（ADR-0088，2026-08-21）

- Win10 19045 x64/NTFS/NVMe 现场已通过旧候选 ZIP、manifest、Electron 22.3.27 和
  `better_sqlite3.node` 哈希预检；A8-03 随后误报物理 `resources/default_app.asar` 缺失并按规则停止。
- 独立 `certutil` 复算确认该文件大小 109138、SHA-256 `db1bfd…724f4` 与 manifest 相同。根因是包内
  Electron Node-mode 的普通 `node:fs` 对 `.asar` 启用虚拟目录视图，不是候选字节损坏。
- 验证器现显式使用 Electron 内建 `original-fs` 复算候选物理树，接口不可用时结构化 fail-closed；新增
  `.asar` manifest fixture、Electron 接口选择/缺失拒绝与打包闭包测试。修复记录见
  [`a8-06-win10-asar-field-failure-20260821.json`](status/a8-06-win10-asar-field-failure-20260821.json)。
- 旧 ZIP `5b24fe7e…ae6e` 保持 Win10 A8-03 FAIL，A8-04/A8-05/联合验证为 NOT_RUN，不得用手工哈希改写为
  PASS。修复提交 `fc4e0deea9a0cfcd86037ebbbbd2bc40a4f74ff9` 已推送且从远端分支可达；干净工作区
  两次构建字节一致，新 ZIP SHA-256 `4ab0c2ce…12ad6`、manifest SHA-256 `0ab06b5c…503ea`。
- 新候选的 schema v2 开发机 smoke 10/10 PASS，执行前后 ZIP/manifest 未改变；机器可读重新签发见
  [`a8-06-asar-candidate-reissue-20260821.json`](status/a8-06-asar-candidate-reissue-20260821.json)。新候选
  Win10/Win7/RC 仍为 NOT_PERFORMED，下一步须全新解压并从 A8-03 重新执行。

模块窗口不得直接修改本页或 README、ROADMAP、DECISIONS；由整合窗口在验证完成后统一更新。

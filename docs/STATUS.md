# 当前项目状态

> 本页是当前状态的唯一人类可读入口，只保留当前快照、阻断项与边界。历史报告中的测试数量不自动代表当前基线。
> 2026-09-24 之前的逐条时间线已原文迁移到 [STATUS_LOG.md](STATUS_LOG.md)；新的时间线条目追加到该文件，本页只更新结论。

## Git 与证据基线

| 项目 | 当前值 |
|---|---|
| 远程默认分支 | `main` |
| A4/A5/A6 收口基线 | `793cc4799c81d9dc27d236826a344a39d86137ec`（标签 `baseline/a456-closeout-20260812`） |
| A7 主线整合输入 | main 历史快照 `63ba838` + A7 验收收口 `6ca1a5a` |
| A1～A3 历史结构化证据绑定提交 | `b2019f022f910b2b8df150ad94c3bccdefa1fa7b` |
| 候选快照 | `8b032772e0c632ec990cc6dfa75fbce4d5f2bb1c` |
| 快照标记 | `backup/integrated-snapshot-20260731` |
| 当前主线状态 | `A7_RC_INTEGRATED / RC_PASS`（唯一 RC 仍为 A7）。2026-09-24 经 [PR #8](https://github.com/allin2/win7-coding-Agent/pull/8)（合并提交 `8fd9d5d`）并入 `codex/a9-alpha2` 至 `f348761`：A9-15（WIN7-23～28）、A9-16 UI 子集（WIN7-29～36）与 A9-17 启动/内存代码；均非 RC、非完整 Alpha 2。此后的文档治理提交（`17761ab`～`2aeb672`）已由 [PR #9](https://github.com/allin2/win7-coding-Agent/pull/9)（合并提交 `ea24c0d`）并入 main |
| 唯一 RC 工件 | 源码提交 `963eabe`；ZIP SHA-256 `39eecb6a…040c9`；A7 状态提交 `6ca1a5a` |
| A8 产品体验授权 | 需求合同 v1 已由负责人确认；`0.2.0-alpha.1` / `codex/a8-agent-first-product`；外部三层验证均 `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE` |
| A8 当前阶段 | `A8-06 / A8_DEVELOPER_COMPLETE_VALIDATION_READY`；文本附件/Goal 应用内对话框候选已从远端可达干净源码双构建并通过开发机 smoke，等待同一候选的 Win10/Win7 验收 |
| A9 Trusted Agent Runtime | WIN7-19 历史里程碑保留；WIN7-20/WIN7-21 永久为 `FIX_BEFORE_ALPHA`；WIN7-22 已取得 A9_14_WIN7_22_GO_FOR_ALPHA；A9-15 WIN7-28 已取得 UI 集成 PASS；A9-16 WIN7-29 为构建缺陷、WIN7-30 为实机 G2 失败、WIN7-31 为实机 G3 容量失败、WIN7-32 为实机 G3 首绘失败、WIN7-33 为实机 G2 驱动加载顺序失败；WIN7-34 已取得 UI 子集集成 PASS；WIN7-35 保持实机 G3 容量 FAIL；WIN7-36 在已批准的可达响应式状态等效裁决下取得 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`；A9-19 WIN7-37 在同一等效口径下取得 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`；≤799px 分支仍不可达/未验证（均非 RC、非完整 Alpha 2） |

`latest-validation.json` 是证据采集时的不可变快照，其 `head_commit` 必须是当前主线的
祖先，但不应在每次文档提交后伪造重绑。当前代码 HEAD 以 Git 历史为准；表中哈希只表示
已归档的结构化证据生成点。

## 当前工作项一览（更新至 2026-09-24）

| 工作项 | 当前结论 | 权威依据 | 下一步 / 阻断 |
|---|---|---|---|
| A7 Win7 v1 RC | `RC_PASS`，已整合进 main | [RC_01](tasks/RC_01_WIN7_RELEASE_CANDIDATE.md)、[流水](STATUS_LOG.md#a7-win7-rc-01rc-10-正式验收2026-08-20) | 后续边界见下文“RC PASS 后续边界” |
| A8 Agent-first | `A8_DEVELOPER_COMPLETE_VALIDATION_READY` | [A8 任务书](tasks/A8_AGENT_FIRST_PRODUCT_EXPERIENCE.md) | 同一候选的 Win10/Win7 验收 `NOT_PERFORMED` |
| A9 Alpha 1 | WIN7-22 `A9_14_WIN7_22_GO_FOR_ALPHA`（`0.3.0-alpha.1` 内部 Alpha，非 RC）；WIN7-20/21 永久 `FIX_BEFORE_ALPHA` | [A9 任务书](tasks/A9_TRUSTED_AGENT_RUNTIME.md)、[A9-14](tasks/A9_14_D013_CMD_VERBATIM_AND_WIN7_22.md) | Review 按 ADR-0096 延期到 Alpha 2，入口 fail-closed |
| A9-15 UI 进度反馈 | WIN7-28 UI 集成 PASS | [A9-15](tasks/A9_15_UI_PROGRESS_FEEDBACK.md)、[收口报告](reports/2026-09/a9_win7_28_ui_integration_closeout_2026-09-11.md) | — |
| A9-16 Alpha 2 UI 子集（U01–U07） | WIN7-36 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`（可达响应式状态等效裁决）；WIN7-29～33、35 保持各自失败结论 | [A9-16](tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md)、[WIN7-36 收口](reports/2026-09/a9_16_win7_36_ui_subset_acceptance_2026-09-24.md)、ADR-0131/0133 | Review（R01–R05）与 Shell 运行中输出（S01–S06）暂缓；≤799px 分支 `PRODUCT_UNREACHABLE / NOT_VERIFIED` |
| A9-17 启动与内存优化 | `A9_17_IMPLEMENTATION_AUTHORIZED`，开发机实现与 A/B 完成 | [A9-17](tasks/A9_17_STARTUP_MEMORY_OPTIMIZATION.md) | Win7/Win10 实机采样 `NOT_PERFORMED`；未并入任何产品候选 |
| A9-19 运行过程实时可见与布局二期 | WIN7-37 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`（可达响应式状态等效口径；源码 `dd6cb1a`，ZIP `4d700632…f167cf`） | [A9-19](tasks/A9_19_LIVE_PROGRESS_AND_WORKBENCH_LAYOUT.md)、ADR-0135/0136、[WIN7-37 收口](reports/2026-09/a9_19_win7_37_live_progress_acceptance_2026-09-25.md) | ≤799px 分支 `PRODUCT_UNREACHABLE / NOT_VERIFIED`；残留：checkpoint 往返约 0.4 s、左栏“进行中”分组滞后 0.6～2.3 s；Shell 增量输出不在本候选 |
| Phase 1/2、SPIKE、Phase 3–7 | 见 [ROADMAP](ROADMAP.md) 与 [任务索引](tasks/README.md) | 各任务书 | 正式 Phase Gate 未整体关闭 |

完整 Alpha 2、Review、Shell streaming 与新的 RC 均未获任何 PASS 结论。

## 当前阻断与待办

1. **Alpha 2 剩余范围**：Review（R01–R05）与 Shell 运行中输出（S01–S06）须按 A9-16 任务书重新授权实现，并以新候选完成 Win7 实机验收。
2. **A9-17 实机证据**：执行包已就绪于 `scripts/mvp_acceptance/a9-startup-baseline/**`，Win7/Win10 采样未执行，性能收益不得外推。
3. **A8-06 外部验收**：Win10/Win7 三层验证仍 `NOT_PERFORMED`。
4. **A9-19 后续**：WIN7-37 已签发 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`。Shell 真正增量输出（helper v3）、checkpoint 往返校验分片、左栏“进行中”分组滞后需各自另立任务。

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

- 本页只维护当前结论；新的时间线条目追加到 [STATUS_LOG.md](STATUS_LOG.md) 对应工作项下，并同步更新本页“当前工作项一览”。
- 模块窗口不得直接修改本页或 README、ROADMAP、DECISIONS；由整合窗口在验证完成后统一更新。

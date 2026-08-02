# MVP_01 — Win7 实机验收与证据收口

```text
Status: MVP_ACCEPTED_WITH_DEFERRALS
Task Type: MVP_ACCEPTANCE_HARDENING
Target Branch: codex/integrated-robustness
Authorization: Project owner request, 2026-08-02
Phase-Gate: MVP_ACCEPTED
Win7-Compatibility: PROVISIONAL
Win7-Validation: OWNER_ACCEPTED_FOR_MVP
Blocking-Reason: NONE_FOR_MVP; formal release gates remain deferred under ADR-0055
```

## 1. 目标

在不提交、重置、切换或丢弃当前 dirty 工作区的前提下，形成可复跑的 Win7 MVP 证据链：
以工作区指纹绑定代码，独立复测 SPIKE_01~04 可执行部分，交叉论证 WorkBuddy 证据，并把
事实同步到当前状态、验收报告与运行手册。该任务不宣称替代任何正式 Phase 或发布验收。

## 2. 允许路径（C14）

- `spikes/01-win7-runtime-baseline/acceptance/**`
- `spikes/02-terminal-containment/acceptance/**`
- `spikes/03-git-adapter/acceptance/**`
- `spikes/04-storage-index/acceptance/**`
- `validation/**`
- `scripts/mvp_acceptance/**`
- `scripts/check_docs.mjs`（仅为兼容验收 schema v2 与现有文档校验器）
- `docs/acceptance/**`
- `docs/reports/2026-08/**`
- `docs/status/**`、`docs/STATUS.md`
- `docs/tasks/MVP_01_WIN7_REAL_MACHINE_ACCEPTANCE.md`、`docs/tasks/README.md`
- `spikes/README.md`、`spikes/*/README.md`
- `docs/DECISIONS.md`（仅追加 ADR）、`docs/WIN7_CONSTRAINTS.md`（仅追加依赖登记）
- `AGENTS.md`（仅同步本任务的当前阶段登记，且须有 ADR）

生产源码仅能在其原有已批准任务书允许路径内修改；本任务不授权 `src/phase1-2/**`、
Phase 1/2 任务合同、已 Accepted ADR 正文、真实 containment 产品实现或桌面产品功能。

## 3. 运行与安全边界

- MVP 基线以 `MVP-YYYYMMDD-NN`、当前 HEAD、dirty 清单和 SHA-256 清单识别；不得要求
  Git commit。
- Win7 写入只限 `C:\\acceptance\\` 与 `C:\\测试 目录\\`；不得删除范围外数据。
- 保留 `192.168.1.10` 与 `192.168.1.11` 的 SSH 管理通道；禁止修改网卡、路由、防火墙和
  Bitvise 配置。仅在确认自动恢复后才允许受控重启。
- 缺失依赖仅在构建机缓存、校验和登记后部署；Win7 不直接下载。新增依赖须先登记
  `docs/WIN7_CONSTRAINTS.md` §6，包含来源、哈希、许可证、EOL 风险和交付闭包。
- 人工视觉、干净系统、物理断网、机械盘和企业环境不能自动证明时使用本任务 §5 状态，
  不得伪造 PASS。

## 4. 交付物与执行顺序

1. MVP 基线 JSON、文件/工件清单及远端环境盘点。
2. 开发机回归与 SPIKE 静态缺口审计。
3. SPIKE_01 正式 T01~T11 对齐 harness 与原始证据。
4. SPIKE_03 P01~P04/N01~N10 独立 harness、进程/网络/哨兵证据。
5. Phase 1/2、SPIKE_04、SPIKE_02 与 Phase 3~7 的可运行部分；缺失依赖或生产实现时记录
   最小阻断条件。
6. WorkBuddy 交叉论证、勘误、状态同步、依赖清单和 HTML 运行手册。

## 5. 状态与验收记录

统一报告必须含 `schema_version`、`mvp_id`、suite/case、环境、工件哈希、完整命令、时间、
退出码、指标、证据路径与结论。状态只可使用：`PASS`、`FAIL`、`PARTIAL`、
`NOT_PERFORMED`、`OWNER_ACCEPTED_FOR_MVP`、`E5_SURROGATE_PASS`、
`MVP_NETWORK_SURROGATE`、`SSD_SURROGATE`、`AUTHORIZATION_BLOCKED`、
`ENVIRONMENT_MISSING`、`BUILD_HOST_MISSING`。

正式 Task Gate 仍按各自任务书流转：本任务只能记录客观实测，不得把 Phase 1/2 或任何
SPIKE 的未满足正式条件改写为完成。

## 6. 当前 MVP 实测收口（MVP-20260802-12）

- SPIKE_01：`PARTIAL`；MVP-20260802-05 的 10 分钟报告、MVP-20260802-08 的网络计数修正重测、两次 T10 清理复测及 MVP-20260802-12 的 T03 重测均已归档。最新 T03 采集到 3 个非零工作集/私有页样本，但 `process.stdin.readable=true`，因此保持 `FAIL`；网络结论为 `MVP_NETWORK_SURROGATE`，未改网卡/路由/防火墙。
- SPIKE_03：`PASS`（MVP）；受控 MinGit 派生包在 MVP-20260802-12 重跑 P01-P04/N01-N10 共 14/14，通过当前 adapter/harness 哈希绑定；正式 SBOM/许可证/抓包闭包仍未放行。
- Phase 1：CPython 3.8.10 x64 下标准树 Win7 capability probe 连续 3 次 18/18、回归 20/20；另在 `C:\测试 目录\phase1 mvp` 完成 E2 预备探针 17 PASS + 1 个预期 Git 缺失 `degraded`、无 blocking check、回归 20/20，两个部署树 `compileall` 均为 0。正式 E1/E2 仍 `AUTHORIZATION_BLOCKED`，不改写原任务书 Gate。
- SPIKE_04：机械盘门禁按项目负责人裁决默认 `PASS`；实际机器为 SSD，better-sqlite3 ABI/indexer/benchmark 缺失，因此套件仍 `BUILD_HOST_MISSING`，不生成性能通过结论。

## 7. 剩余约束验收方案

剩余 C01–C20 约束已拆分为 RC-01～RC-09，覆盖依赖/Profile/SBOM、SPIKE_01 剩余项、Phase 1/2 冻结 Gate、SPIKE_02 containment/终端、SPIKE_04 SQLite/FTS5、Phase 3–7 产品装配、W7C-01–13 和正式 E5/E6/E7 收口。完整方案见
[`docs/reports/2026-08/win7_remaining_constraints_acceptance_plan.html`](../reports/2026-08/win7_remaining_constraints_acceptance_plan.html)。

该方案不扩大生产实现授权；每个 RC 执行前仍须核对相应任务书状态、分支和允许路径。外网断开验证不得通过关闭当前 SSH 管理链路实现。

## 8. MVP-20260802-14 负责人收口

项目负责人授权 Codex 对剩余问题作出 MVP 决策或默认接受并继续开发。ADR-0055 据此完成
以下收口：

- 总体结论为 `OWNER_ACCEPTED_FOR_MVP`；客观 SPIKE/Phase 正式状态和 Gate 不改写。
- T03 接受父侧无输入句柄、无数据进入的 NUL-like 语义；后续 Core 显式关闭/隔离 stdin。
- SPIKE_02 延期期间真实 Runner/终端保持 fail-closed；SPIKE_04 延期期间使用有界内存状态。
- 人工视觉、重启、严格干净环境、物理断网与企业 E7 延期到正式版本。
- 新增只读运行时采集：C01、三个 KB、三类运行时/工具、工件哈希和 Bitvise 均通过。
- 新增真实 Electron 产品入口：Win7 上启动、可信本地 Renderer、诊断回传、正常退出与零匹配
  产品进程残留均有结构化证据。

负责人 disposition 为
[`docs/acceptance/MVP-20260802-14_OWNER_DISPOSITION.json`](../acceptance/MVP-20260802-14_OWNER_DISPOSITION.json)，
当前状态以 [`docs/status/latest-validation.json`](../status/latest-validation.json) 为准。MVP_01 至此收口；
后续产品开发继续由 INTEGRATION_01 §11 和各正式 Phase 任务书约束。

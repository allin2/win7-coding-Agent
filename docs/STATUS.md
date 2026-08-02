# 当前项目状态

> 本页是当前状态的唯一人类可读入口。历史报告中的测试数量不自动代表当前基线。

## Git 与证据基线

| 项目 | 当前值 |
|---|---|
| 远程默认分支 | `main` |
| 受控整合来源 | `codex/integrated-robustness` |
| 最新结构化证据绑定提交 | `21ffcf32f8ac0a22b04699be14569662ca571d9a` |
| 候选快照 | `8b032772e0c632ec990cc6dfa75fbce4d5f2bb1c` |
| 快照标记 | `backup/integrated-snapshot-20260731` |
| 主线整合 | `MAINLINE_INTEGRATION_2026-08-02` |

`latest-validation.json` 是证据采集时的不可变快照，其 `head_commit` 必须是当前主线的
祖先，但不应在每次文档提交后伪造重绑。当前代码 HEAD 以 Git 历史为准；表中哈希只表示
已归档的结构化证据生成点。

## 验证状态

- 当前未提交工作区已建立 MVP 指纹；最新补充证据编号为 `MVP-20260802-15`（见 `status/mvp-baselines/`），Win7 产品实机收口仍绑定 MVP-20260802-14；没有提交、暂存、切换或丢弃用户修改。
- 开发机回归：`PASS` — 2026-08-02 主线整合前重跑 `npm run verify`，7 个模块共
  907 项测试通过（Gateway 200、Workspace 79、State 219、Core 225、Runner 46、
  Git Adapter 51、Shell 87）；各模块 lint/build 与静态设计门同时通过。
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
  详细路径、哈希和边界见
  [`INTEGRATION_01` §10](tasks/INTEGRATION_01_ROBUSTNESS_HARDENING.md)；A2-W01～W15 整体仍未全部通过，
  不得由这两项增量结果推导正式 A2 Gate PASS。
- C01–C20 剩余门禁、前置依赖、执行顺序、证据接口和连接保护条件已形成 [剩余约束验收方案](reports/2026-08/win7_remaining_constraints_acceptance_plan.html)。

## MVP 已接受的延期项

- Electron 可运行入口已经形成 Win7 实证；完整五视图、安装器、跨模块用户任务和卸载/回滚仍是下一阶段产品装配工作。
- SPIKE_01 T03 按 ADR-0055 接受“父侧无 stdin 句柄、无数据进入”的 MVP 语义；正式合同的子侧 `readable=true` 事实保持不变，后续 Core 仍需显式关闭/隔离。
- SPIKE_02 缺 MSVC v142 / node-pty / winpty / 非骨架 helper；SPIKE_04 缺 Electron ABI SQLite 绑定、indexer、benchmark；机械盘门禁按负责人裁决不再阻断 MVP。
- 在上述原生能力补齐前，真实本地 Runner/终端继续 fail-closed，状态使用有容量上限的内存实现，Gateway 显示为未配置或 Replay；不得静默降级成不受控执行。
- D-012 官方原 ZIP 含 GCM；本次受控派生包已完成绑定当前 SHA-256 的完整 G10 MVP 矩阵，正式交付仍需 SBOM/许可证闭包；当前远端完整 Git不能替代。
- Phase 1 的 CPython 3.8.10 与 Win7 capability probe 已补齐；Phase 1/2 仍缺架构 Gate 解除、冻结合同要求的获授权物理断网/干净环境证据，Phase 2 也没有独立 Win7 只读 Agent 入口。
- E2 中文+空格路径与 Git 缺失降级已完成客观准备性复测；探针退出码 1 是预期的 `TOOL_NOT_FOUND` 降级信号，不代表正式 E1/E2 Gate 已开放。
- Electron 两次启动均记录 `os_crypt_win.cc ... Access is denied (0x5)`；当前 MVP 不使用凭据存储，故不阻断只读入口。DPAPI 凭据生命周期在正式启用 Gateway 凭据前必须单独实现和验收。

## 剩余约束收口顺序

1. 以已通过 Win7 smoke 的 Electron 入口装配会话、流式输出、diff/审批、诊断和 Replay 用户任务；受阻能力继续显式不可用。
2. 增加自包含离线目录/包、启动脚本、版本 manifest、升级/回滚和卸载残留验证。
3. 在现代 Windows 构建主机并行产出 SPIKE_02 的 helper/node-pty/winpty 与 SPIKE_04 的 Electron 22 ABI SQLite 工件，再恢复真实 Runner 和持久化 Gate。
4. 企业代理/CA/模型/更新服务具备后执行 E7；正式候选阶段再补视觉、重启、物理断网和严格干净环境证据。

机械盘门禁保持负责人默认 `PASS`，但不改变 SPIKE_04 当前 `BUILD_HOST_MISSING`，也不自动更新未实测的性能预算。

## 状态使用规则

模块窗口不得直接修改本页或 README、ROADMAP、DECISIONS；由整合窗口在验证完成后统一更新。

# 当前项目状态

> 本页是当前状态的唯一人类可读入口。历史报告中的测试数量不自动代表当前基线。

## Git 与证据基线

| 项目 | 当前值 |
|---|---|
| 远程默认分支 | `main` |
| 受控整合来源 | `codex/integrated-robustness` |
| 最新结构化证据绑定提交 | `b2019f022f910b2b8df150ad94c3bccdefa1fa7b` |
| 候选快照 | `8b032772e0c632ec990cc6dfa75fbce4d5f2bb1c` |
| 快照标记 | `backup/integrated-snapshot-20260731` |
| 主线整合 | `MAINLINE_INTEGRATION_2026-08-02` |

`latest-validation.json` 是证据采集时的不可变快照，其 `head_commit` 必须是当前主线的
祖先，但不应在每次文档提交后伪造重绑。当前代码 HEAD 以 Git 历史为准；表中哈希只表示
已归档的结构化证据生成点。

## 验证状态

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

## Win10 原生构建前置进展（更新至 2026-08-10）

三条原生构建返回均已完成适用的结构、哈希、工具链、PE/API/CRT、smoke 和合规材料复核。共享 D-017
Profile 已被实际使用，但下表只说明“可以进入 Win7 集成/验证”，不代表对应 A5/A6/A7 已验收完成。
完整机器可读台账见
[`status/win10-native-builds-latest.json`](status/win10-native-builds-latest.json)。

| 轨道 / 组件 | Win10 结果 | 已解除的卡点 | 当前仍阻塞 |
|---|---|---|---|
| A4 / D-013 helper | v21 Win10 `PASS`：返回包 `5d3bdd6b…f8ef`、helper `98964fc5…ce5`、input-lock `60ddd80c…795b`；capture selftest、v142 logic、native smoke、PE/API/CRT 与开发机 containment 37/37 均 `PASS` | `A4-20260810-000004` 已由 ADR-0065 协调器分级为 `WIN7_PASS`；restricted primary、精确 SID 集合、Low Integrity、ACL rollback、C01～C07、双向哈希和后置零残留均通过，租约已释放 | D-013 已解除；C05 不提供网络隔离，交互终端、高风险和未知 Profile 继续拒绝 |
| A5 / D-011 node-pty + winpty | `PASS_WITH_PACKAGING_GAP`；返回包 `c938f115…46ea`，三项原生工件均为 x64，ABI 110 与 smoke 通过 | Win7 实测裁决为 `NO_GO_INTERACTIVE_WINPTY`；D-013 v24 低风险非交互 Runner 与 H3 只读日志已分别取得正式 `WIN7_PASS` | 交互终端不进入 Win7 v1；返回包内部总清单缺口由 A7 统一发布 manifest/SBOM 收口 |
| A6 / D-014 better-sqlite3 | `PASS`；返回包 `2cb0cd32…2794`，247 项清单全匹配，WAL/FTS5/schema smoke 通过 | D-014 已为 `READY_FOR_WIN7_VALIDATION`，不再缺 SQLite Electron ABI 工件 | 本行只记录 2026-08-07 Win10 构建前置；后续 Win7 正式结果见下文 A6 章节 |
| A7 / 发布包装 | 尚无独立 Win10 PASS；开发机已从提交 `f24d9a4` 两次构建相同 RC ZIP `90916647…f1d5` | D-013 v24 与 D-014 已按发布 manifest 外置并装配；开发机 981 项回归、10 项 release/RC 合同和独立 ZIP 校验通过 | 精确 Windows 产品 smoke、Win10 分层结论、安装/升级/回滚/卸载和新 Win7 RC 租约仍未执行 |

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

- A4 `eee6219`、A5 `af589dc`、A6 `fb2084d` 已进入 `codex/integrated-robustness` 祖先链。
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

## MVP 已接受的延期项

- Electron 可运行入口已经形成 Win7 实证；完整五视图、安装器、跨模块用户任务和卸载/回滚仍是下一阶段产品装配工作。
- SPIKE_01 T03 按 ADR-0055 接受“父侧无 stdin 句柄、无数据进入”的 MVP 语义；正式合同的子侧 `readable=true` 事实保持不变，后续 Core 仍需显式关闭/隔离。
- SPIKE_02 已受限收口：交互 winpty 为 No-Go，低风险非交互 Runner 与 H3 只读日志为 Win7 PASS；C05 网络隔离、任意 Shell、高风险和未知 Profile 仍未开放。SPIKE_04 的本地 SSD Spike 已正式通过；A7 已实现生产 EventLedger 装配，但精确 Windows 与新 Win7 RC 验证尚未执行。机械盘门禁已由 ADR-0066 取代为正式 SSD Profile。
- 低风险登记 Profile 已在 A7 开发候选中经清单装配；交互终端、任意 Shell、高风险和未知 Profile 继续 fail-closed。A7 的审计事件事实使用有容量上限的 SQLite EventLedger，session catalog 仍为进程内状态；不得把开发机结构测试或持久事件扩大为 Windows 原生加载、完整会话恢复或 RC PASS。
- D-012 官方原 ZIP 含 GCM；本次受控派生包已完成绑定当前 SHA-256 的完整 G10 MVP 矩阵，正式交付仍需 SBOM/许可证闭包；当前远端完整 Git不能替代。
- Phase 1 的 CPython 3.8.10 与 Win7 capability probe 已补齐；Phase 1/2 仍缺架构 Gate 解除、冻结合同要求的获授权物理断网/干净环境证据，Phase 2 也没有独立 Win7 只读 Agent 入口。
- E2 中文+空格路径与 Git 缺失降级已完成客观准备性复测；探针退出码 1 是预期的 `TOOL_NOT_FOUND` 降级信号，不代表正式 E1/E2 Gate 已开放。
- Electron 两次启动均记录 `os_crypt_win.cc ... Access is denied (0x5)`；当前 MVP 不使用凭据存储，故不阻断只读入口。DPAPI 凭据生命周期在正式启用 Gateway 凭据前必须单独实现和验收。

## 剩余约束收口顺序

1. 以已通过 Win7 smoke 的 Electron 入口装配会话、流式输出、diff/审批、诊断和 Replay 用户任务；受阻能力继续显式不可用。
2. 增加自包含离线目录/包、启动脚本、版本 manifest、升级/回滚和卸载残留验证。
3. A7 只装配已通过的 D-013 低风险非交互 Runner 与 D-014 本地 SSD Profile；不装配 D-011 交互终端。统一锁定原生模块 ASAR 外置、manifest/SBOM/许可证及安装/升级/回滚/卸载闭包。
4. 企业代理/CA/模型/更新服务具备后执行 E7；正式候选阶段再补视觉、重启、物理断网和严格干净环境证据。

ADR-0066 已将机械盘要求替换为本地 SSD 正式 Profile；D-014 构建 Gate 与 SPIKE_04 Win7 验收均已通过，
性能预算 #5～#8 已按正式证据更新。HDD、网络盘与未知介质仍没有性能支持声明。

## 状态使用规则

模块窗口不得直接修改本页或 README、ROADMAP、DECISIONS；由整合窗口在验证完成后统一更新。

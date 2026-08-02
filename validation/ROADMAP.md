# 后续实机验证规划（Remaining Win7 Real-Machine Validations）

> 规划日期：2026-08-02
> 约束：所有验证结果不回写 `docs/tasks/*.md` 原 PRD（见 validation/README.md 原则）；证据落 `spikes/<n>-*/acceptance/evidence/`，交叉论证落 `validation/<spike>/`。
> 真机：ThinkPad T460 Win7 SP1 x64，IP 192.168.1.11，Bitvise 密钥通道（私钥 `.acceptance/ssh/id_rsa_win7accept`，已 .gitignore）。

完整 C01–C20 覆盖矩阵、RC-01～RC-09 执行包、批次依赖、证据接口与连接保护条件见
[`docs/reports/2026-08/win7_remaining_constraints_acceptance_plan.html`](../docs/reports/2026-08/win7_remaining_constraints_acceptance_plan.html)。本页保留 Spike/Phase 的快速导航。

## 0. 总览

SPIKE_01 当前为独立 harness `PARTIAL`（网络替代门禁已修正复测；冷重启、视觉、抓包和真实双任务负载仍缺）；SPIKE_03 的 MVP 独立矩阵已 14/14 通过；Phase 1 capability probe 已在同一 Win7 标准树上 18/18 连续三次通过，并在 `C:\测试 目录\phase1 mvp` 完成 E2 预备探针 17 PASS + 1 个预期 Git 缺失降级、回归 20/20、compileall 0。剩余需实机验证的阻塞项：

| 序号 | 验证项 | 对 ADR 的支撑 | 原型代码缺口 | 关键前置/阻塞 | 建议优先级 |
|---|---|---|---|---|---|
| V1 | **SPIKE_03 Git Adapter** | ADR-0032 | 当前代码和独立 harness 已完成 MVP 重测 | MVP 14/14；仅剩正式 SBOM/许可证/被动抓包和产品 Runner 集成 | 已完成 MVP，纳入发布闭包 |
| V2 | **SPIKE_04 存储/索引** | ADR-0033 | 索引器 + 压测脚本（需 better-sqlite3 FTS5 预编译） | D-017 预编译原生模块（机械盘**不再阻塞**：本机 SSD 跑基线，结果标注"非等价参考值"） | 中（不再受磁盘阻塞） |
| V3 | **SPIKE_02 终端/containment** | ADR-0030/0031 | C++ helper（Job Object/Restricted Token/ACL）+ winpty/node-pty ABI 重编译 | **Windows 构建工具链**（MSVC v142 / D-017）；最重 | 中（放最后或并行建链） |
| V4 | **Phase 1/2 E1/E2** | Phase 1/2 收口 | Phase 1 CPython 3.8.10 + capability probe 已上机；Phase 2 入口仍缺 | 架构 Gate 解除、物理断网/干净环境授权与 Phase 2 可运行入口 | 可并行（共用真机） |

按剩余阻断关系执行：依赖闭包 → V2/V3 构建产物并行 → V2/V3/V4 上机 → Phase 3–7 产品装配；V1 只需纳入正式交付闭包。

---

## V1 — SPIKE_03 Git Adapter 隔离与恶意仓库负向验证

**目标（PRD §1）**：MinGit 2.46.2 在 ADR-0032 隔离配置下，G10 恶意仓库负向矩阵零逃逸。

**需补齐的原型（`spikes/03-git-adapter/**`，已 APPROVED_FOR_IMPLEMENTATION）**：
- `adapter/`：隔离配置注入（`GIT_CONFIG_NOSYSTEM=1` + 净化 `GIT_*/SSH_*` + 全部 `-c` 显式封堵 hooksPath/filter/textconv/pager/editor/askpass/credential/sshCommand/remote helper/fsmonitor）+ 结构化 argv 白名单执行。
- `malicious/`：10 类攻击面样本仓库生成器（N01–N10）。
- `test/`：正向 P01–P04 + 负向 N01–N10 的 harness，输出 `--report=*.json`。

**监测手段**：进程创建审计（tasklist 前后比对）+ 抓包（零出站）。

**实机证据槽**：`spikes/03-git-adapter/acceptance/evidence/` → 本 agent `report_normal.json`、codex `report_codex.json`（落到同目录）。

**codex 交叉钩子**：codex 独立写 harness（建议，达成独立实现互证），同机运行，逐项比对 N01–N10 是否均零逃逸。

**Go/No-Go（PRD §5）**：P01–P04 全过 + N01–N10 零逃逸（零外部进程、零网络）= Go；任一负向逃逸且无法封堵 = 降级只读观测。

---

## V2 — SPIKE_04 存储与代码索引验证

**目标（PRD §1）**：Node 侧 SQLite 绑定（better-sqlite3 + FTS5，Electron 22 ABI 预编译）的 WAL 批量写 QPS、FTS 首次/增量索引吞吐、检索 P95，为 ADR-0033 预算 #5/#6/#7/#8 提供实测。

**需补齐的原型（`spikes/04-storage-index/**`）**：
- `schema/` 已有 SQLite schema；需补 **索引器**（批量事务 + FTS5 建索引 + 查询）+ **压测脚本**（合成事件流、样本仓库生成器：3千/1万/3万文件中英文混合）+ harness 输出 `--report=*.json`。

**⚠️ 磁盘前置（决策更新，2026-08-02）**：用户明确——机械硬盘**不作为** SPIKE_04 验证阻塞项，机械盘门禁默认通过。
- 执行方式：直接在本机 SSD 上跑 S01/S03/S05 等性能基线，证据标注"SSD 基线 / 非等价参考值"，明确不等于目标机械盘特征。
- 若后续获得机械盘，可补跑对照值，但非门禁条件。

**原生模块**：better-sqlite3 需按 Electron 22 ABI 用 D-017 工具链预编译（哈希锁定 D-014）。

**实机证据槽**：`spikes/04-storage-index/acceptance/evidence/`。

**codex 交叉钩子**：codex 独立 harness 同盘同机运行，比对 S01 QPS / S03 吞吐 / S05 P95。

**Go/No-Go（PRD §5）**：S01≥300 QPS、S03≥120 文件/s、S05 P95≤1.2s、S02/S06 数据完整性全过 = Go。

---

## V3 — SPIKE_02 终端与 Containment 验证

**目标（PRD §1）**：C++ helper 的 Job Object/Restricted Token/ACL 进程树必杀（C01–C08）+ winpty 0.4.3/node-pty 0.10.0 终端保真（T01–T05）+ C19 注入负向（N01–N06）。

**需补齐的原型（`spikes/02-terminal-containment/**`，脚手架 `helper/ winpty/ test/` 已存在）**：
- `helper/`：C++ x64（MSVC v142 / D-017），仅 Win32 API —— Job Object 创建/指派/整树终止、`IsProcessInJob` 探测、Restricted Token 减权、ACL 工作区外拒绝、argv 白名单、超时强杀、输出上限。接口冻结为 argv + JSON over stdio。
- `winpty/`：winpty 0.4.3 官方 x64 + node-pty 0.10.0 按 Electron 22 ABI 重编译。
- `test/`：C01–C08 / T01–T05 / N01–N06 harness，含抓包与 tasklist 快照。

**⚠️ 关键前置——Windows 构建工具链**：Win7 真机难以本地编译 MSVC v142 产物；需 Win10+ 构建主机或交叉编译链（D-017）。这是三项目里最重的一项。

**实机证据槽**：`spikes/02-terminal-containment/acceptance/evidence/`（含抓包、tasklist 快照、注入用例日志）。

**codex 交叉钩子**：codex 独立 harness 同机运行，比对 C01–C08 进程树必杀与 N01–N06 注入全拒。

**Go/No-Go（PRD §5）**：C01–C07 全过 + N01–N06 全拒（注入零成功）+ T05 回收全过 = Go；containment 不可靠 → ADR-0030 fail-closed（高风险命令拒绝/远程）；winpty 回收失败 → ADR-0031 降级非交互日志视图。

---

## V4 — Phase 1/2 实机收口（E1/E2）

**目标**：Phase 1 `win7_agent.probe`（Python 3.8.10）在 Win7 跑 E1/E2 环境检查；Phase 2 只读 Agent 走 `READY_FOR_WIN7_VALIDATION` → Win7 运行验收 → 冻结 legacy。

**前置**：Win7 已安装受控 CPython 3.8.10 并完成 Phase 1 capability probe 18/18 × 3；E2 中文+空格路径、Git 缺失降级、20/20 回归和 compileall 也已完成，证据见 `validation/phase1/evidence/report_phase1_MVP-20260802-12_e2.json`。与 SPIKE 共用同一真机。正式 E1/E2 仍需架构 Gate 解除、物理断网/干净环境授权，Phase 2 还需独立可运行入口。

**证据槽**：Phase 1/2 任务书 § 验证记录（由负责人手动回填，Agent 产出证据 JSON 落对应 `acceptance/evidence/`）。

---

## 1. 执行节奏建议

1. **立即**：完成 RC-01 依赖/Profile/SBOM 和离线产品包设计；准备 Phase 1 架构 Gate 复核。
2. **并行构建**：V3 搭建 Windows 构建链并产出 helper/node-pty/winpty；V2 产出 Electron 22 ABI better-sqlite3/FTS5。
3. **实机批次**：在保留 SSH 的前提下运行 V2、V3；V4 的外网断开由上游隔离、独立 VM/测试网络提供，不关闭管理网卡。
4. **产品批次**：形成真实 Electron 产品入口后运行 Phase 3–7、W7C-01–13 和完整安装/回滚/卸载验收。

## 2. 与 codex 的协作纪律（沿用原则）

- 每份证据 JSON 落 `spikes/<n>-*/acceptance/evidence/`，本 agent 与 codex 同目录、不同文件名前缀。
- 论证写 `validation/<spike>/CROSS_VERIFICATION.md`，逐项比对，结论标注"同 harness 互证"或"独立实现互证"。
- **绝不**把 PASS/FAIL 写回 `docs/tasks/*.md` 原 PRD；PRD §9 由负责人依据证据决策回填。

## 3. 开放风险

| 风险 | 说明 | 缓解 |
|---|---|---|
| 机械盘缺失 | SPIKE_04 性能项失真（已决策：不作为阻塞） | 本机 SSD 跑基线，证据标注"非等价参考值"；获机械盘可补对照 |
| Windows 构建链缺失 | SPIKE_02 C++ helper / node-pty 无法编译 | 准备 Win10+ 构建主机（D-017） |
| MinGit/better-sqlite3 哈希未锁 | C16 SBOM 登记缺口 | MinGit 哈希已锁（D-012，2026-08-02）；better-sqlite3 待 SPIKE_04 |
| 同 harness 互证强度不足 | SPIKE_01 历史报告存在共享 harness；SPIKE_03 已有独立实现 | SPIKE_02/04 继续使用独立 harness，并保留失败原始证据与交叉勘误 |

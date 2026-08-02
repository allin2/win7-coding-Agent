# Win7 SP1 x64 实机验收依赖清单（DEPENDENCY LIST）

> 编制日期：2026-08-01 ｜ 状态：**初版，供实机/VM 验收准备使用**
> 依据：`docs/EVALUATION.md`、`docs/WIN7_CONSTRAINTS.md`、`docs/PERFORMANCE_BUDGET.md`、`docs/tasks/SPIKE_01~04`、`docs/tasks/PHASE_01/02`
> 本清单回答三个问题：**实机要验什么 → 需要哪些依赖 → 每项依赖的版本/来源/状态**。哈希锁定、实机证据仍为待办（见 §8）。

## 0. 验收环境基线（每条验收记录的必填前提）

| 项 | 基线 | 备注 |
|---|---|---|
| OS | Windows 7 **SP1** x64（build 7601） | `winver` 三源确认（SP1 + x64 + COA），Phase 1 O2 要求人工复核通道 |
| 硬件参考下限 | 4 核 CPU、8GB 内存、机械盘 5400/7200rpm、无独显或仅老旧集显 | `PERFORMANCE_BUDGET` 预算按此制定；**更好硬件不得放宽验收** |
| 用户档位 | 普通用户 + 管理员各一遍（SPIKE_01）；普通用户 + 域策略（SPIKE_02） | 域策略环境为开放问题（§8） |
| 环境语义 | E1/E2 断网（零网络）｜ E5 干净 VM 只装交付包 ｜ E6 中文/空格/长路径+缺工具 ｜ E7 企业可联网 | 零网络合同仅 Phase 1/2 与 SPIKE_03 适用 |
| 可复现性 | 实机用系统还原点/磁盘镜像；VM 用快照 | T10 干净卸载、S02 崩溃安全、回滚验证隐含要求 |

---

## 1. 系统基线补丁（KB，§4 建议基线）

| KB | 用途 | 必装 | 重启 | 实机检测要点 |
|---|---|---|---|---|
| **KB4490628** | Servicing Stack Update 基线 | 建议（Profile 声明 + 装前检查，非全局前提） | 常需（P18） | 装前/装后检测精确 KB 与 **pending reboot**，半完成状态不得误判 |
| **KB4474419**（最新版） | SHA-2 代码签名支持 | 同上 | 常需（P18） | 同上；接受微软累计更新取代关系，不能因原始 KB 编号缺失而误判 |
| **KB3140245** | TLS 1.2 + `DefaultSecureProtocols`（仅 WinHTTP 栈） | 同上 | 常需（P18） | ⚠️ 它**不能证明** Electron `net` / Node `https` 的 TLS 1.2（各自走 Chromium/OpenSSL） |
| KB3042058 | Schannel 密码套件增强 | 可选（需要时） | 是 | 视 TLS 基线需要加入 |

---

## 2. 运行时与组件依赖（WIN7_CONSTRAINTS §6 / §6.1）

### 2.1 已批准 / 历史登记（Phase 1/2 冻结）

| ID | 组件 | 版本 | 用途（对应测试） | 状态 |
|---|---|---|---|---|
| D-001 | CPython `sqlite3` | 随 CPython 3.8.10（SQLite 3.31） | Phase 1/2 状态与审计 | 已批准（ADR-0002/0027） |
| D-002 | `taskkill.exe` | Win7 System32 自带 | Phase 1/2 进程树终止 | 已批准（ADR-0005） |
| D-003 | `git.exe` | 不假设存在 | Phase 1 版本探测（缺失降级） | 已批准（仅探测，ADR-0007） |
| D-004 | `where.exe` | Win7 自带 | 可执行文件定位（备用） | 已批准（备用） |
| D-007 | `tasklist.exe` | Win7 System32 自带 | Phase 1 进程存活验证 | 已批准（ADR-0005） |
| D-008 | Python `winreg` | CPython 自带 | Phase 1 只读 OS 版本探测 | 已批准（限定用途，ADR-0015） |
| — | CPython 3.8.10 x64 | 3.8.10（embed 或安装包） | Phase 1/2 全矩阵运行 | PY38-STDLIB-FROZEN 冻结 |
| — | `cmd` / `findstr` | Win7 自带 | Phase 1 探测脚本宿主 | §4 允许；使用前仍探测 |

### 2.2 架构候选 / 待锁定（均"未获实现授权"，x64）

| ID | 组件 | 精确版本 | 来源 | 用途（对应测试） | Win7 兼容 / EOL | 哈希 | 许可 |
|---|---|---|---|---|---|---|---|
| **D-009** | **Electron** | **22.3.27** win32-x64 | electron releases | **SPIKE_01 全项**（桌面方向第一道生死线） | 官方最后支持 Win7 的主版本；含 Chromium 108 / Node 16.17.1，全栈 EOL | 待锁定（SPIKE_01） | MIT |
| D-010 | Node.js | 12.22.12 portable | nodejs.org | 可选 CLI 宿主（默认不交付） | 官方最后正式测 Win7 为 12.14.1，**须实机复验（P16）** | 待锁定（若启用） | MIT |
| **D-011** | **node-pty + winpty** | 0.10.0 + 0.4.3 | npm / rprichard/winpty | **SPIKE_02 终端矩阵**（Win7 无 ConPTY） | 须按 Electron 22 ABI 预编译（D-017）；上游停维护 | 待锁定（SPIKE_02） | MIT |
| **D-012** | **Git for Windows（MinGit）** | **2.46.2** x64 受控裁剪派生包 | git-for-windows releases + MVP 裁剪清单 | **SPIKE_03 G10 恶意仓库矩阵** | 最后支持 Win7/8 系列；已停安全修复；本 MVP 派生包去除 GCM/SSH/HTTP helper；官方原 ZIP 含这些组件 | MVP 派生哈希已锁定；正式 SBOM 待补 | GPLv2（传递组件待归档） |
| **D-013** | 自研 C++ helper（Job / Restricted Token / ACL） | 本项目自研 | D-017 工具链构建 | **SPIKE_02 containment**（C01-C08 + N01-N06） | Win7 API 可用；Job 不可嵌套（C02 开放问题） | 随发布清单 | 本项目 |
| **D-014** | better-sqlite3（候选） | npm 锁定版本，须启用 FTS5 | npm | **SPIKE_04 写入/FTS 矩阵** | 须按 Electron 22 ABI 预编译；SQLite 版本一并锁定 | 待锁定（SPIKE_04） | Apache-2.0 / SQLite PD |
| D-015 | .NET Framework | 4.8（Win7 SP1 最高） | 微软官方 | **SPIKE_01 No-Go 降级阶梯**（WPF 备选） | Win7 上无厂商支持；需独立前置评审 | 不适用 | 微软许可 |
| D-016 | 自研 fail-closed Updater | 本项目自研 | 本仓库 | PHASE_07 更新/回滚 | Authenticode/WinVerifyTrust；验签失败 fail-closed（P13） | 随发布清单 | 本项目 |
| D-006 | CA bundle / 企业 CA | 待定 | 随包或受信任存储 | Phase 3 Model Gateway TLS | 校验失败必须拒绝连接，禁止关 TLS 验证 | 任务待定 | — |

> **P15 红线**：以上任何原生 `.node`/DLL 必须与 Electron 22 ABI、VC Runtime 匹配，在干净 Win7 x64 实测，不得在"同一主版本"上虚构等价证据。

### 2.3 MVP-20260802 实物复核（不改变正式准入状态）

| 组件 | 已复核的工件/事实 | MVP 结论 |
|---|---|---|
| D-009 Electron 22.3.27 | ZIP SHA-256 `ad723ed7dad32f9459f7a9de1fd6d718cf713c4809c2431503bea62ce8f786e6`；Win7 `electron.exe` SHA-256 `2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb`；Win7 启动/独立 harness 证据已归档。 | 可作 SPIKE_01 MVP 验收工件；产品闭包和正式发布仍未完成。 |
| D-012 MinGit 2.46.2 | 官方 ZIP 已校验为 `0dca60869825ceb8b6108be69f0c536174fbca45e11300f2c14c34632d8238ed`，`cmd/git.exe` 为 `02ed65496cb0b1ccfc85a8201fc224b1fa21ab15eb4eda80316bcc346b2b50a1`；但原 ZIP 实际含 GCM 文件。 | `ENVIRONMENT_MISSING`：需受控裁剪、派生哈希和组件清单；远端完整 Git 不可替代。 |
| CPython 3.8.10 / Node PATH | Win7 `where python`、`where node` 均未命中；自包含 CPython 3.8.10 已部署到 `C:\acceptance\python38_mvp`，并在标准树完成 18/18 × 3、20/20 回归。 | `PASS`（Phase 1 MVP 前置）；Node 产品闭包仍 `ENVIRONMENT_MISSING`。 |
| D-011 / D-013 / D-014 / D-017 | 未得到 ABI 工件或 MSVC v142 构建环境。 | `BUILD_HOST_MISSING`；SPIKE_02/04 不运行伪验收。 |

### 2.4 Win7 实机补充（MVP-20260802-06/07/10/12）

MVP-20260802-12 的证据型依赖清单见 [`MVP-20260802-12_SBOM.json`](MVP-20260802-12_SBOM.json)，输入与证据哈希见 [`MVP-20260802-12_manifest.sha256.txt`](MVP-20260802-12_manifest.sha256.txt)。它明确区分已在 Win7 加载的 Electron/CPython/MinGit 派生工件和仍处于 `BUILD_HOST_MISSING` 的 node-pty/winpty、C++ helper、better-sqlite3；不构成正式发布 SBOM。

| 组件 | 工件/证据 | 结论 |
|---|---|---|
| MinGit 受控派生包 | ZIP `914fd56506284c54dc20f43917dcb6f2587eb7d807add2968c2d8b335070d397`；`git.exe` `02ed65496cb0b1ccfc85a8201fc224b1fa21ab15eb4eda80316bcc346b2b50a1` | SPIKE_03 MVP 14/14 PASS；正式交付仍需 SBOM/许可证闭包 |
| CPython 3.8.10 x64 | ZIP `abbe314e9b41603dde0a823b76f5bbbe17b3de3e5ac4ef06b759da5466711271`；Phase 1 probe 3 次报告 | Win7 18/18 × 3 PASS；仅证明运行前置，不改写 Phase Gate |
| E2 中文+空格路径 | `C:\测试 目录\phase1 mvp`；MVP-20260802-12 probe 17 PASS + 1 个预期 `TOOL_NOT_FOUND/degraded`，无 blocking check；回归 20/20；标准树和 E2 树 compileall 均为 0。 | E2 准备性 `PARTIAL`；探针退出码 1 是可选 Git 缺失降级信号，不是正式 Gate 通过。 |
| 机械盘 | 负责人 MVP 裁决 `PASS`，实际为 SSD | 不再阻断 MVP；不等于机械盘或 SQLite/indexer 性能通过 |

---

## 3. 构建机工具链（不进入目标机，D-017）

| ID | 组件 | 版本 | 用途 | 备注 |
|---|---|---|---|---|
| D-017 | MSVC v142 / VS 2019 + Windows SDK 10 | 锁定入构建文档 | 构建 D-013 / D-011 / D-014 原生产物 | 目标显式设为 Win7 SP1 x64（`_WIN32_WINNT=0x0601`）；产物静态链接 CRT 或随包带登记 VC Runtime（P15） |
| — | VC Runtime / Universal CRT | 随包携带或登记（KB2999226 语境） | 原生产物运行前置 | 不得假设目标机已装（§3） |

---

## 4. 验收基础设施（非产品依赖，文档未强制、按需自备）

| 设施 | 用途 | 建议 | 备注 |
|---|---|---|---|
| SSH 服务端 | 远程触发验收脚本（由 Mac 驱动） | Bitvise / freeSSHd / MobaSSH | 属于验收基础设施，**不进入产品 SBOM**；注意"验收态/干净基线"双快照纪律 |
| 抓包工具 | SPIKE_01 T08 / SPIKE_02 C05 / SPIKE_03 零出站监测 | 自备（未点名） | C05 要记录**实际可达性**，禁宣称为"禁网/隔离" |
| 计时/采样 | 冷启动 T01、内存 #2~#4、QPS 计时 | 秒表/日志时间戳 + `tasklist`/任务管理器 | 性能数值须标"VM 或实机"环境 |
| RDP | GPU 视觉项 T04 肉眼/录屏 | Win7 自带 + Microsoft Remote Desktop | 与 SSH 互补 |
| `fsutil volume diskfree` | Phase 1 T16 磁盘空间对照 | Win7 自带 | 人工对照记录 |

---

## 5. 实机测试项 ↔ 依赖映射（速查）

| 验收对象 | 测试项 | 关键依赖 | 环境 |
|---|---|---|---|
| Phase 1 | T01/T02/T05/T08/T10-T19/T29/T39 + E1 附加（3 次稳定、无残留、CRLF 双击） | CPython 3.8.10、taskkill/tasklist、无 git 场景 | E1/E2 断网 |
| Phase 2 | 迁移矩阵 M-03/M-06/M-07/M-08/M-10/M-13/M-14 | CPython 3.8.10 | E1/E2 断网 |
| SPIKE_01 | T01 冷启动、T02/T03 内存、T04 GPU 降级、T05-T11 | **Electron 22.3.27**（D-009） | E5 干净实机 |
| SPIKE_02 | C01-C08 + N01-N06 + 终端 T01-T05 | **C++ helper（D-013）**、node-pty/winpty（D-011） | 实机，两档用户 |
| SPIKE_03 | 正向 P01-P04 + 恶意仓库 G10 N01-N10 | **MinGit 2.46.2（D-012）** | 零网络、抓包 |
| SPIKE_04 | S01-S08（WAL QPS、崩溃安全、FTS 吞吐、P95、滚动清理、CP936） | **better-sqlite3 FTS5（D-014）** | 实机机械盘、本地盘 |
| 桌面层 | W7C-01~13 | Electron（D-009）+ 各自研组件 | E5/E6 |
| 降级阶梯 | SPIKE_01 No-Go 时 | .NET 4.8（D-015）→ WPF 备选 | 仅触发时 |

---

## 6. 硬件前置条件（实机采购/准备核对）

- [ ] **机械盘**：5400/7200rpm（SPIKE_04 S01/S03/S05 性能；两档 rpm 若可得）
- [ ] **老显卡 / 无独显机型**（P17，SPIKE_01 T04 GPU 软渲染降级——VM 虚拟 GPU 失真，**必须实机**）
- [ ] **重启后首次计时**能力（T01 冷启动——VM 重启 ≠ 物理冷启动）
- [ ] 内存 ≥8GB、CPU ≥4 核（性能预算下限，实测值标注环境）
- [ ] 数据库仅本地盘，**禁网络盘**（P10）
- [ ] 可复现性：VM 快照 或 实机还原点/磁盘镜像（clean-baseline 与验收态双份）
- [ ] 机器独占性（E5 只装交付包；不得利用验收机偶然工具）

---

## 7. "实机才可验 / VM 失真"标注项（不得冒充 PASS，EVALUATION §1）

| 项 | 说明 |
|---|---|
| SPIKE_01 T04 GPU 软渲染降级 | 唯一明确硬缺口；虚拟 GPU 无意义，需物理机补或标 `NOT_PERFORMED` |
| SPIKE_01 T01 冷启动计时 | VM 数据须标注"VM 冷启动" |
| SPIKE_02 C02 企业启动器 / 嵌套 Job | 任务书 §8 开放问题；VM 可模拟但非真实企业环境 |
| SPIKE_04 S01/S03/S05 机械盘 IO | 虚拟盘测不准，数值失真，须标注 |
| Phase 1 O2 SP1 三源确认 | 精简版 Win7 可能误判，E1 实测后定人工复核通道 |

---

## 8. 待锁定 / 待办清单（下一批动手点）

**哈希待锁定（C16：锁定前任何构建不得使用）**
- [ ] D-009 Electron 22.3.27 → SPIKE_01 首次入库时锁定 SHA-256 并登记 §6.1 + SBOM
- [ ] D-010 Node 12.22.12（若启用）
- [ ] D-011 node-pty 0.10.0 / winpty 0.4.3 → SPIKE_02
- [ ] D-012 MinGit 2.46.2 → SPIKE_03（裁剪清单确认：LFS/GCM 已排除）
- [ ] D-014 better-sqlite3（含 SQLite 版本）→ SPIKE_04
- [ ] D-017 工具链版本号 → SPIKE_02

**待实机验证（按套件实际状态）**
- [ ] SPIKE_01~04 全项（阻塞原因：目标环境不可用 / PC-002）
- [x] Phase 1 E2 准备性复测（MVP-20260802-12；正式 `REPAIR_REQUIRED_BEFORE_E1` 仍未解除）
- [ ] Phase 1 正式 E1/E2（架构 Gate、物理断网、干净环境和人工授权未满足）
- [ ] Phase 2 E1/E2（停在 `READY_FOR_WIN7_VALIDATION`）

**开放问题**
- SPIKE_02 §8 企业启动器/域策略实测机会（C02）
- SPIKE_04 §8 FTS5 中文分词器选择
- Phase 1 O1（32 位 Python 是否升强制）/ O2（SP1 人工复核）
- D-006 CA bundle 任务待定
- PERFORMANCE_BUDGET 12 项数值全为 `PROPOSED` 未实测（ADR-0033 未转 Accepted，禁止纸面达标）

---

## 9. 治理要求速记（C07 / C16 / C15）

1. 下载必须**版本锁定 + 完整性校验（SHA-256）+ 失败回滚**（C07）。
2. 每个组件登记：来源 / 哈希 / 许可证 / EOL 风险 / 交付闭包（C16 §6 + SBOM）。
3. 新组件必须声明 Runtime Profile：精确版本、架构、Win7 补丁前置、降级路径、实机证据（C15）。
4. 验证唯一可信证据 = **Win7 SP1 x64 实机/可复现 VM 报告**；"Win10 能跑""同主版本可运行"仅作前置证据（P06）。
5. 验收记录按 `docs/acceptance/YYYYMMDD_<phase>_<env>.md` 归档，含 OS/补丁/运行时/架构/包哈希。

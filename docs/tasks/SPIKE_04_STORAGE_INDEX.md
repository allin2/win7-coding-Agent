# SPIKE_04 — 存储与代码索引验证（STORAGE_INDEX）

> 实现前必读：`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、`docs/PERFORMANCE_BUDGET.md`、
> ADR-0033（Accepted（附条件，ADR-0036））、本文档。不占用 ADR-0012 阶段编号（ADR-0034）。

## 0. 实现授权（ADR-0011 / C14）

### 0.1 状态块

```
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: SPIKE
Target Branch: spike/04-storage-index
Phase-Gate: N/A (SPIKE)
Win7-Compatibility: PASS_FOR_E22_SQLITE343_LOCAL_SSD
Win7-Validation: WIN7_PASS
Blocking-Reason: NONE_FOR_SPIKE; this does not authorize production EventStore, index service, HDD support, or network-drive support
```

### 0.2 路径白名单（获批后生效）

- `spikes/04-storage-index/**`（SQLite 绑定原型、索引器、压测脚本、样本仓库、证据目录）
- 本文档自身（§9 验证记录追加）

禁止路径：`src/**`、其他任务书、`AGENTS.md`、已 Accepted ADR 正文。

## 1. 目标

在 Win7 实机、本地 NTFS SSD 的正式 Profile（D-014，better-sqlite3 + FTS5）验证 Node 侧 SQLite 绑定
的 WAL 批量写吞吐、FTS 首次索引吞吐与增量延迟、检索延迟，为 ADR-0033 性能预算
#5/#6/#7/#8 提供实测证据。此 Spike 同时证伪/证实 Python Core 演进被否决的性能前提
（ADR-0029 背景）。

## 2. 非目标

- 不实现生产 EventStore/检索 API；原型只需覆盖 schema + 批量事务 + FTS 索引与查询。
- 不验证运行时基线（SPIKE_01）；SQLite ABI 按 Electron 22 预编译（D-017）。

## 3. Runtime Profile（C15）

- SQLite 绑定：better-sqlite3 锁定版本，编译内嵌 SQLite（锁定版本）+ 启用 FTS5；
  按 Electron 22 ABI 用 D-017 工具链预编译（哈希入库时锁定，§6.1）。
- 数据库位于本地磁盘（禁网络盘，P10）；WAL 模式。
- 测试机：Win7 SP1 x64，本地 NTFS SSD；正式 Profile 为 `E22-SQLITE343-LOCAL-SSD`。
- HDD、网络盘和未知介质不在本轮性能支持声明内；不得由 SSD 结果推断其性能。
- 样本仓库：混合中英文源码，规模覆盖 3 千 / 1 万 / 3 万文件三档。

## 4. 验证矩阵

| # | 用例 | 通过标准 |
|---|------|----------|
| S01 | WAL 批量事务写入 QPS（合成事件流 60s 持续） | 预算 #6（≥300，No-Go <150） |
| S02 | 崩溃安全：写入中途断电/杀进程后重开 | WAL 恢复无损坏，`trace_complete` 语义可判定 |
| S03 | FTS5 首次全量索引吞吐（3 档规模，本地 SSD） | 预算 #5（≥120 文件/s，上限 3 万文件） |
| S04 | 增量索引延迟（改动 N 个文件后再索引） | 记录延迟；增量显著优于全量 |
| S05 | 检索延迟 P95（3 万文件库、100 次代表性查询，含中文分词） | 预算 #8（P95 ≤1.2s） |
| S06 | 库体积上限与滚动清理 | 预算 #7：超 512MB 触发清理，清理后恢复/审计不断链 |
| S07 | 有界扫描回退 | 无索引或索引超限时，回退到有界目录扫描且不读满整树（对照 Phase 2 `readonly.py` 全树扫描瓶颈） |
| S08 | 中文+空格路径与 CP936/UTF-8 内容 | 索引与检索路径/内容处理正确 |

## 5. Go/No-Go 判据（ADR-0033）

- **Go：** S01≥300 QPS、S03≥120 文件/s、S05 P95≤1.2s、S02/S06 数据完整性全过。
- **No-Go(写入)：** S01<150 或 S02 数据损坏 → 关键事件同步落盘 + 非关键事件异步合并
  落盘（报告中标注与全同步的非等价性）。
- **No-Go(索引)：** S03<60 文件/s 或 S05 P95>2.5s 或库超规模上限 → 索引自动切远程
  索引服务（ADR-0034 远程化清单）。

## 6. 交付物

1. SQLite 绑定 + 索引器原型 + 压测脚本 + 样本仓库生成器（`spikes/04-storage-index/**`）。
2. Win7 实机证据包（QPS/吞吐/P95 原始数据、崩溃恢复日志、清理前后库体积）。
3. Go/No-Go 报告（含 PERFORMANCE_BUDGET #5/#6/#7/#8 状态位更新提案）。
4. D-014 哈希与 SQLite/FTS5 编译选项锁定登记（WIN7_CONSTRAINTS §6.1）。

## 7. 治理

- 失败只废弃 `spike/04-*` 分支；证据与报告以 `docs:` 提交进 main。
- 本 Spike 结论为 PHASE_04（Workspace）与 PHASE_05（State/Audit）的存储设计输入。

## 8. 开放问题

- 中文分词策略（FTS5 tokenizer 选择）对 S05 的影响，是否需要外部分词器。

## 9. 验证记录

```
Win7-Compatibility: PASS_FOR_E22_SQLITE343_LOCAL_SSD
Win7-Validation: WIN7_PASS
Win10-Native-Build: PASS
D-014: READY_FOR_WIN7_VALIDATION
Build-Kit-Archive: spikes/04-storage-index/build-win10/dist/WIN10_A6_SQLITE_BUILD_KIT_20260807-01.zip
Build-Kit-SHA256: 53fce2129987d9c09a8e78f1aeacd79b04a334c873154079e81565de371ddede
Return-Archive: A6/WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip
Return-Archive-SHA256: 2cb0cd324bb449fb5457549addd3e7f8f0610d6258415309ee748fb279a72794
Native-Artifact-SHA256: 7138aa2365e0027ced9bc8ae356097b31776d084a5a8f91cc2d3677785e915cc
Formal-Profile: E22-SQLITE343-LOCAL-SSD
Formal-Run-ID: 20260810-06
Formal-Status: WIN7_PASS (docs/status/a6-storage-latest.json)
Blocking-Reason: NONE_FOR_SPIKE; production integration remains outside this Spike authorization
```

2026-08-07 已复核 Win10 返回包：包内 247 项返回清单与实际文件的大小/SHA-256 全部匹配；
Electron 22.3.27 / ABI 110、better-sqlite3 8.7.0、SQLite 3.43.1、FTS5、column metadata、
`THREADSAFE=2`、WAL、中文+空格路径和项目 schema smoke 均为 `PASS`。`better_sqlite3.node`
为 PE32+ x64，不含禁止的 Win10+ API 或动态 CRT 依赖。因此 D-014 的 Win10 构建前置已解除。

上述 2026-08-07 表述是当时的构建前置事实。2026-08-10 的新 run ID `20260810-06` 已在
`dccs-chaizl-PC`（Win7 SP1 x64 build 7601、本地 NTFS Samsung 870 EVO SSD）完成签名租约范围内的
S01～S08、F01～F06 与 P08/C11-PATH。协调器复核租约、当前提交/manifest、Win7 端 133 文件哈希、
Electron 22.3.27 / ABI 110、better-sqlite3 8.7.0、SQLite 3.43.1、FTS5、WAL、全部标准参数、
轮前/轮后和零残留后，输出 [`WIN7_PASS`](../status/a6-storage-latest.json)。

实测：S01 60 秒 61650.86 QPS；S03 分别为 1312.34（3k）、1213.89（10k）、1089.52（30k）文件/s；
S05 的 100 次 P95 为 183ms；S06 在 517.79MB 触发清理并回落至 199.60MB，完整性通过。原始返回
证据（数据库、JSON、日志、smoke、lease、manifest）保存在本地忽略归档
`A6/WIN7_A6_SSD_EVIDENCE_20260810-06/`；其逐文件 SHA-256 清单由正式状态文件锁定。历史 SSD
evidence 与 disposition 未追溯改写。此结论仅覆盖 `E22-SQLITE343-LOCAL-SSD`，不外推到 HDD、网络盘
或未知介质，也不构成生产 EventStore/索引服务实现完成。

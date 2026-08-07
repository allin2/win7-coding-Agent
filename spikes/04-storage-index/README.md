# SPIKE 04 - 存储索引验证

## 状态

- **任务书**：`docs/tasks/SPIKE_04_STORAGE_INDEX.md`
- **状态**：APPROVED_FOR_IMPLEMENTATION
- **Win10 原生构建**：PASS；D-014 `READY_FOR_WIN7_VALIDATION`
- **Win7 实机验证**：NOT_PERFORMED（机械盘门禁按负责人裁决 PASS）
- **Harness 实现**：已完成（`harness/`，2026-08-07）
- **开发机验证**：S01–S08 全用例在 python3 sqlite3（3.43.2）后端起驱动跑通，数据仅作趋势参考
- **成果迁入**：成果已迁入 `src/state/`（待 Win7 验证；原型 `schema.sql`、`migrations.ts` 已吸收到正式模块）

> **Win7-Validation: NOT_PERFORMED** — A6 的 better-sqlite3/SQLite/FTS5 锁定工件已经在 Win10 构建并通过复核；`harness/` 已在开发机跑通 S01–S08（趋势数据）。Win7 实机 S01～S08 仍未执行，因此不能把存储功能或性能写成通过。

## Win10 离线构建包

- 构建包：`build-win10/dist/WIN10_A6_SQLITE_BUILD_KIT_20260807-01.zip`
- SHA-256：`53fce2129987d9c09a8e78f1aeacd79b04a334c873154079e81565de371ddede`
- Win10 操作说明：`build-win10/kit/README_BUILD.md`
- 完整方案：`build-win10/kit/A6_BUILD_PLAN.md`
- 已复核返回包：`A6/WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip`
- 返回包 SHA-256：`2cb0cd324bb449fb5457549addd3e7f8f0610d6258415309ee748fb279a72794`
- `better_sqlite3.node` SHA-256：`7138aa2365e0027ced9bc8ae356097b31776d084a5a8f91cc2d3677785e915cc`
- 返回清单：`PASS`（247 项全部匹配）
- Win10 smoke：`PASS`（Electron ABI 110、WAL、FTS5、中文+空格路径、项目 schema）
- 下一门禁：补齐 indexer/benchmark/fixtures/crash-recovery harness 后执行 Win7 S01～S08

## 目标

验证在 Win7 SP1 x64 上实现 SQLite + FTS5 存储索引的可行性：
- SQLite schema 设计与迁移
- FTS5 全文索引（支持中文分词）
- 批量写入性能（WAL 模式）
- 崩溃恢复能力
- 库体积控制与滚动清理

## 验证矩阵

### 性能验证（S01-S06）

| ID   | 验证项                                       | 静态检查 | Win7 实机 |
|------|----------------------------------------------|----------|-----------|
| S01  | WAL 批量写入 QPS                             | ✓        | 待验证    |
| S02  | 崩溃恢复能力                                 | ✓        | 待验证    |
| S03  | FTS5 首次全量索引吞吐                        | ✓        | 待验证    |
| S04  | 增量索引性能                                 | ✓        | 待验证    |
| S05  | 检索延迟 P95                                 | ✓        | 待验证    |
| S06  | 库体积上限与滚动清理                         | ✓        | 待验证    |

### 功能验证

| ID   | 验证项                                       | 静态检查 | Win7 实机 |
|------|----------------------------------------------|----------|-----------|
| F01  | schema_version 管理                          | ✓        | 待验证    |
| F02  | 事件表 CRUD                                  | ✓        | 待验证    |
| F03  | FTS5 查询                                    | ✓        | 待验证    |
| F04  | 结果分页                                     | ✓        | 待验证    |
| F05  | 中文分词策略                                 | ✓        | 待验证    |
| F06  | 有界扫描回退                                 | ✓        | 待验证    |

## 文件结构

```
04-storage-index/
├── schema/
│   ├── schema.sql        # 项目 schema 基线（Win10 smoke 已验证）
│   └── migrations.ts     # schema 迁移管理
├── build-win10/          # Win10 离线构建包（kit + 返回包）
└── harness/              # S01-S08 验证 harness（纯 Node，零运行时依赖）
    ├── package.json
    ├── schema/spike04.sql        # 验证专用 schema（events + files + 双 FTS 表）
    ├── lib/
    │   ├── db.js                 # 统一异步 DB 驱动（better-sqlite3 / python-bridge）
    │   ├── fixtures.js           # 样本仓库生成器（3千/1万/3万，中英文，CP936/UTF-8）
    │   ├── indexer.js            # 全量/增量索引 + 有界回退
    │   ├── query.js              # 路径/内容检索
    │   ├── bounded-scan.js       # 有界目录扫描（不读满整树）
    │   ├── crash-recovery.js     # 崩溃恢复（S02，子进程 kill 模拟断电）
    │   ├── cleanup.js            # 512MB 滚动清理（S06）
    │   ├── encoding.js / cp936.js / gbk-table.json  # CP936/UTF-8 内容处理
    │   ├── metrics.js            # P95/分位数
    │   └── disk-type.js          # 介质类型探测（SSD/HDD/unknown）
    ├── benchmark/
    │   ├── benchmark.js          # S01-S08 编排 + 结构化 JSON 输出
    │   └── cases/                # 8 个用例
    ├── test/                     # 回归测试（fixtures/indexer/crash）
    ├── evidence/                 # 运行证据（结构化 JSON + 原始指标）
    └── work/                     # 本地运行产物（gitignore，不提交）
```

## 使用方法

### 开发机验证（python3 sqlite3 后端，趋势数据）

```bash
cd harness
# 回归测试
node test/test_fixtures.js
node test/test_indexer.js
node test/test_crash_recovery.js

# 完整压测（10k 样本；S06 用 1MB 阈值验证逻辑）
node benchmark/benchmark.js --scale 10k --duration-ms 3000 --backend python-bridge --s06-limit-mb 1 --s06-target-mb 0.5

# 显式声明介质（SSD/HDD/unknown；探测失败时用 unknown，绝不默认机械盘）
node benchmark/benchmark.js --scale 30k --media ssd
```

### Win7 实机验证（锁定 better-sqlite3）

```bash
# 禁止在 Win7 现场 npm install 或编译原生模块。
# 1) 解压锁定返回包（WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip，SHA-256
#    2cb0cd324bb449fb5457549addd3e7f8f0610d6258415309ee748fb279a72794）。
# 2) 设置运行时定位 env（db.js 的 better-sqlite3 后端读取）：
set A6_BS3_ROOT=<解压目录>\runtime\node_modules\better-sqlite3
set A6_BS3_NATIVE=<解压目录>\runtime\node_modules\better-sqlite3\build\Release\better_sqlite3.node
set A6_MEDIA=ssd
# 3) 用锁定 Electron 运行时（含 Node 16.17.1）以 node 模式运行 benchmark：
set ELECTRON_RUN_AS_NODE=1
<解压目录>\runtime\electron\electron.exe benchmark\benchmark.js --backend better-sqlite3 --scale 30k
# 注意：harness 无 --runtime-root 参数（benchmark.js parseArgs 未知参数即抛错）；
# 运行时定位一律通过 A6_BS3_ROOT / A6_BS3_NATIVE 环境变量，勿传命令行。
# 生成样本（若需三档规模）：
<解压目录>\runtime\electron\electron.exe benchmark\benchmark.js --scale 3k --gen-fixtures
```

> **介质诚实性**：当前 Win7 为 SSD。任何跑出的 S01–S08 数据若介质为 SSD，必须在报告与
> 结构化 JSON 中标记 `media.type=ssd` 且注明"非机械盘数据"，不得冒充机械盘性能。
> 机械盘（5400/7200rpm）是任务书 §3 的目标测试机，但当前 Win7 实机为 SSD，机械盘
> 门禁按负责人裁决默认 PASS，不得把该裁决写成机械盘性能实测。

## Go/No-Go 报告模板

```
SPIKE 04 - Go/No-Go 报告
========================
日期: YYYY-MM-DD
Win7 版本: Windows 7 SP1 x64
SQLite 版本: x.y.z

性能验证:
  [  ] S01 - WAL 批量写入 QPS (目标: >1000 QPS)
  [  ] S02 - 崩溃恢复能力
  [  ] S03 - FTS5 全量索引吞吐 (目标: >1000 文件/秒)
  [  ] S04 - 增量索引性能
  [  ] S05 - 检索延迟 P95 (目标: <100ms)
  [  ] S06 - 库体积上限 (目标: <500MB)

功能验证:
  [  ] F01 - schema_version 管理
  [  ] F02 - 事件表 CRUD
  [  ] F03 - FTS5 查询
  [  ] F04 - 结果分页
  [  ] F05 - 中文分词策略
  [  ] F06 - 有界扫描回退

总计: __/12 通过

判定: [ GO / NO-GO ]

备注:
- 
```

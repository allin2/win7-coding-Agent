# SPIKE 04 - 存储索引验证

## 状态

- **任务书**：`docs/tasks/SPIKE_04_STORAGE_INDEX.md`
- **状态**：APPROVED_FOR_IMPLEMENTATION
- **Win10 原生构建**：PASS；D-014 `READY_FOR_WIN7_VALIDATION`
- **Win7 实机验证**：NOT_PERFORMED（机械盘门禁按负责人裁决 PASS）
- **成果迁入**：成果已迁入 `src/state/`（待 Win7 验证；原型 `schema.sql`、`migrations.ts` 已吸收到正式模块）

> **Win7-Validation: NOT_PERFORMED** — A6 的 better-sqlite3/SQLite/FTS5 锁定工件已经在 Win10 构建并通过复核；indexer、benchmark、fixtures、崩溃恢复 harness 和 Win7 S01～S08 仍未完成，因此不能把存储功能或性能写成通过。

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
│   ├── schema.sql        # SQLite schema 定义
│   └── migrations.ts     # schema 迁移管理
├── indexer/
│   ├── indexer.ts        # 文件索引器
│   └── query.ts          # 查询接口
├── benchmark/
│   ├── benchmark.ts      # 压测框架
│   └── fixtures.ts       # 样本仓库生成器
├── test/
│   └── test_crash_recovery.ts # 崩溃恢复测试
└── README.md             # 本文件
```

## 使用方法

### 静态验证（现代构建机）

```bash
# 编译 TypeScript
npx tsc

# 运行压测
node benchmark/benchmark.js
```

### Win7 实机验证

```bash
# 禁止在 Win7 现场 npm install 或编译原生模块。
# 先在 Win10 执行 build-win10/dist/ 中的离线包，回传并审查
# WIN7_A6_SQLITE_ARTIFACTS_*.zip，再使用锁定工件运行以下 harness。

# 生成样本仓库
node benchmark/fixtures.js

# 运行完整压测
node benchmark/benchmark.js

# 运行崩溃恢复测试
node test/test_crash_recovery.js
```

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

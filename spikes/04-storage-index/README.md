# SPIKE 04 - 存储索引验证

## 状态

- **任务书**：`docs/tasks/SPIKE_04_STORAGE_INDEX.md`
- **状态**：APPROVED_FOR_IMPLEMENTATION
- **Win7 实机验证**：BUILD_HOST_MISSING（MVP-20260802-06；机械盘门禁按负责人裁决 PASS）
- **成果迁入**：成果已迁入 `src/state/`（待 Win7 验证；原型 `schema.sql`、`migrations.ts` 已吸收到正式模块）

> **Win7-Validation: BUILD_HOST_MISSING** — 机械盘门禁不再阻断 MVP；但当前仅有 schema/migration 骨架，未发现 indexer、benchmark、崩溃恢复 harness 或 Electron 22 ABI better-sqlite3 工件，因此不能把存储功能或性能写成通过。

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
# 需要 Node.js 运行时
# 需要 better-sqlite3 或 sqlite3 包

npm install better-sqlite3

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

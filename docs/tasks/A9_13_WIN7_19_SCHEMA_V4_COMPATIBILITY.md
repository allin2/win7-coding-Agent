# A9-13 — WIN7-19 schema v4 profile 兼容性修复与新候选重验

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_COMPATIBILITY_AND_RELEASE_RECOVERY
Target Branch: codex/a9-win7-20-schema-v4-compat
Source Baseline: 9323cbe88b8bf70e37ec47d41e6dbcb510641d92
Superseded Candidate: WIN7-20 / FIX_BEFORE_ALPHA / IMMUTABLE
Target Candidate: WIN7-21
Phase-Gate: A9_13_G0_SOURCE_FREEZE_APPROVED
Win7-Validation: WIN7_21_NOT_PERFORMED
Decision: ADR-0110
```

## 1. 授权与目标

项目负责人于 2026-09-03 要求修复并独立审查既有 WIN7-19 schema v4 profile 的兼容性，冻结后重新
执行产品双构建并从 G0 开始新候选门禁；不得复用 WIN7-20 改判。WIN7-20 的 Runtime 初始化失败、
四项直接用例 `NOT_PERFORMED` 和 `FIX_BEFORE_ALPHA` 均作为不可变历史证据保留。

本任务只修复一个已实机复现的兼容性断裂：WIN7-19 已写入的合法 schema v4 数据库中，
`a9_sessions.last_activated_at` 的物理声明可为空且 `title_source` 默认值为 `legacy`；后置严格校验器
要求规范 v4 的 `NOT NULL` 与默认值 `auto`，导致新 Runtime 在备份或迁移之前进入受限诊断模式。

## 2. 允许路径与非目标

- `src/state/src/a9-persistence.ts`、`src/state/tests/**`：精确识别、备份、原子规范化及回归测试。
- `src/shell/tests/product/**`：仅在需要时增加真实 Runtime 启动回归，不修改产品行为。
- `release/win7-product-v3/**`、`scripts/release/**`：新候选身份、验证套件、双构建和 G0～G7 证据绑定。
- `docs/**`、`AGENTS.md`：任务授权、ADR、状态、验收与独立审查记录。

不新增依赖、Runtime Profile、系统 API、权限、IPC 或产品能力；不修改 native helper、协议 v1/v2、
Provider、Runner 或 WIN7-19/WIN7-20 原始工件与证据。不得放宽任意 schema v4 校验，不得把开发机、
Win10 或继承证据写成 WIN7-21 实机 PASS。

## 3. 修复合同

| ID | 可观察成功条件 |
|---|---|
| A9-13-01 | 仅当 schema v4 的表、列、约束、显式索引和零触发器除两项已知物理差异外完全符合历史规范时，识别为 `WIN7_19_LEGACY_V4` |
| A9-13-02 | 写入前创建事务一致且可读的备份并记录 SHA-256；备份失败时原库不变且 fail-closed |
| A9-13-03 | 单一事务重建 `a9_sessions` 为规范 v4，保留所有字段；空活动时间按 `updated_at`、`created_at`、当前时间依次补齐 |
| A9-13-04 | 迁移失败整体回滚；schema marker 保持 v4；备份保留；不得留下临时表或不完整索引 |
| A9-13-05 | 其他缺列、错类型、错约束、错索引、错默认值或数据不合法的 v4 继续进入诊断且字节不变 |
| A9-13-06 | 已规范 v4 重开不迁移、不重复备份；旧版本到 v4 的既有迁移行为不回归 |

逻辑版本继续为 schema v4：这是对同一历史 profile 的物理规范化，不引入可被旧程序误解的新业务字段。
识别与写入之间必须在写连接上复核；备份必须先于任何 schema 或 journal mode 变更。
旧版本迁移保留的安全自定义读索引必须继续保留；不认识的旧表列必须在迁移前拒绝，不能借重建静默丢弃。

## 4. 独立审查与新候选门禁

实现者验证与独立审查必须分离记录。独立审查至少复核：精确指纹、任意畸形 v4 的拒绝、数据完整保留、
备份可恢复性、事务回滚、WAL 已提交页、秘密扫描和 WIN7-19 原始失败复现。独审未完成不得冻结源码。

2026-09-03 冻结前独立审查已关闭：`P0=0 / P1=0 / P2=0`，批准进入 G0 源码冻结。实现方全量验证为
7 个模块共 1581 tests PASS、发布回归 11/11 PASS、文档检查 106 文件/26 任务 PASS；独审另行执行
State 精确迁移 54/54、WIN7-21 report、真实产品 Runtime legacy profile 启动和外置写锁回滚实验，均 PASS。
该结论不构成 G0 完成、Win10/Win7 或 Alpha PASS。

WIN7-21 从 G0 重新执行，不继承 WIN7-20 的候选身份、ZIP、manifest、input lock、release authority、
部署目录、直接用例或裁决：

新锁 `a9-13-win7-21-input-lock.json` 可以逐哈希引用仍获批准的 Electron、D-013 v25 helper 和
SQLite 原生输入，但它拥有新的 lock ID、生成时间、来源说明和 WIN7-21 gate；历史
`a9-09-input-lock.json` 的字节及其 WIN7-20 gate 仅保留为不可变历史，构建器必须拒绝它作为新候选输入。

1. G0：干净源码提交、独审关闭、新正式 input lock、输入清单与构建套件重新冻结；
2. G1：两个全新 detached 源码工作树独立构建产品候选并逐字节一致；
3. G2：绑定新的 manifest、候选 ZIP 与候选外 release authority；
4. G3：开发机预飞行验证新候选完整闭包；
5. G4：Win7 普通用户部署前身份、环境、进程与数据基线；
6. G5：包完整性与正式 Electron 生命周期；
7. G6：既有 WIN7-19 profile 启动、原子迁移、数据保留及受影响产品旅程直接实测；回滚以候选外
   SQLite `BEGIN IMMEDIATE` 写锁阻断修复事务，不能修改候选字节或启用产品内测试后门；
8. G7：后飞行、秘密扫描、候选不变性、独立最终复核与新裁决。

任何 Gate 失败均停止后续签发；只允许基于修复后的全新候选作新裁决。

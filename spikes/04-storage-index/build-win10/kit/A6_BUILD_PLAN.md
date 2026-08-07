# A6 Win10 构建方案

## 1. 目标与状态边界

本次只解除 A6 的 D-014 原生构建卡点：从锁定源码构建 Electron 22.3.27 ABI 110、Windows x64 的 `better_sqlite3.node`，并证明内嵌 SQLite 3.43.1、FTS5、WAL 和项目 schema 可在 Win10 Electron 中加载。

本次不执行 SPIKE_04 S01～S08，不连接 Win7，不声称 Win7 兼容性或性能通过。

## 2. 冻结组合

| 层 | 锁定值 |
|---|---|
| Electron / ABI | 22.3.27 / 110 |
| Electron 内嵌 Node | 16.17.1 |
| better-sqlite3 | 8.7.0，npm 官方源码归档 |
| SQLite | 3.43.1，随 better-sqlite3 源码内嵌 |
| SQLite 必选项 | `ENABLE_FTS5`、`ENABLE_COLUMN_METADATA`、`THREADSAFE=2` |
| 构建主机 | Windows 10 x64 |
| 工具链 | VS2019 `[16.0,17.0)`、MSVC v142 14.2x、SDK 10.0.19041.0 |
| Python | CPython 3.8.10 AMD64 |
| 目标 | Windows 7 SP1 x64，`WINVER/_WIN32_WINNT=0x0601` |
| CRT | Release `/MT`，并以导入表复核 |

选择 8.7.0 的理由：官方发布页存在 Electron ABI 110 的 Windows x64 工件，源码归档内嵌 SQLite 3.43.1 并明确启用 FTS5；正式候选仍从源码重建，以便锁定 Win7 目标宏、VS2019/v142、SDK 与 CRT。

## 3. 构建阶段

1. 校验包级 manifest 和 10 项关键输入 SHA-256。
2. fail-closed 探测 Windows 10、VS2019/v142、SDK 19041、Python 3.8.10。
3. 使用随包 Node 16 和 npm cache 执行完全离线 `npm ci --ignore-scripts`。
4. 从已锁定归档重新解压 Electron headers，复制已锁定 x64 `node.lib`。
5. 核对 better-sqlite3/SQLite 关键源码哈希、SQLite 版本和 FTS5 编译定义。
6. 使用 node-gyp 为 Electron 22.3.27 ABI 110 配置并构建 Release x64；生成工程强制 v142、SDK 19041、`/MT`。
7. 对 `better_sqlite3.node` 执行 PE x64、禁止 API 和 CRT 导入检查。
8. 在 Electron 中真实加载模块，验证 ABI 110、SQLite 3.43.1、FTS5、WAL、中文+空格路径和项目 schema。
9. 生成文件级哈希、构建环境、日志、SBOM、许可证、audit、风险和回传 ZIP。

## 4. Win10 回传 Mac 的材料

成功后必须同时回传：

- `WIN7_A6_SQLITE_ARTIFACTS_*.zip`
- 同名 `.sha256`

ZIP 中至少包含：

- `output/runtime/node_modules/better-sqlite3/**` 及其最小运行时依赖；
- `output/electron/**`，用于独立加载验证；
- `output/project/**` 的 schema 快照；
- `evidence/build-result.json`、实际环境、headers、工程锁定、dumpbin、smoke 和完整 transcript；
- `input-lock.json`、`build-profile.json`、`compliance/**`；
- `RETURN_PACKAGE_MANIFEST.json` 与说明。

## 5. 构建通过与后续门禁

Win10 `BUILD PASS` 需要同时满足：

- 全部输入与包 manifest 通过；
- 工具链精确匹配；
- better-sqlite3/SQLite/FTS5 源码合同通过；
- `better_sqlite3.node` 为 x64，无禁止 API、无动态 CRT；
- Electron ABI 110 smoke、SQLite 3.43.1、FTS5、WAL、路径和 schema 全部通过；
- 返回包与外层 SHA-256 已生成。

Mac 复核通过后状态可写为 `READY_FOR_WIN7_VALIDATION`。最终 A6 仍需 Win7 本地磁盘完成 S01～S08、崩溃恢复和性能证据；A7 必须将 `.node` 放在 ASAR 外部并复用已审查哈希。

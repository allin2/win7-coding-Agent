# A6 SQLite 构建来源与边界

- better-sqlite3：npm 官方归档 `better-sqlite3@8.7.0`，源码归档 SHA-256 由 `input-lock.json` 固定。
- SQLite：better-sqlite3 8.7.0 源码包内嵌 amalgamation 3.43.1；`source-contract.json` 固定源码哈希并要求 `SQLITE_ENABLE_FTS5`、`SQLITE_ENABLE_COLUMN_METADATA`、`SQLITE_THREADSAFE=2`。
- Electron：22.3.27 x64，ABI 110；headers 与 `node.lib` 从锁定的 Electron 官方归档重建。
- 构建主机：Windows 10 x64、VS2019 `[16.0,17.0)`、MSVC v142 14.2x、Windows SDK 10.0.19041.0、CPython 3.8.10 AMD64。
- 交付目标：Windows 7 SP1 x64 本地磁盘；构建机不连接 Win7，Win10 smoke 不替代 Win7 实机验收。
- 上游 v8.7.0 发布页存在 Electron ABI 110 的 Windows x64 预编译工件，仅作为版本兼容性旁证；正式候选仍由本包从源码重建。

来源 URL、大小、SHA-256、工具锁、SBOM、许可证、构建环境、实际 headers、PE 导入表和输出哈希分别保存在 `input-lock.json`、`compliance/` 与 Win10 返回包的 `evidence/` 中。

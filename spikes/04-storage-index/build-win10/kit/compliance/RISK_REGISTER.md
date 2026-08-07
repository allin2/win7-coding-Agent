# A6 SQLite 构建风险记录

| 风险 | 当前控制 | 剩余门禁 |
|---|---|---|
| Electron 22 / Node 16 / Windows 7 均已 EOL | 固定版本、离线输入、只加载可信本地代码 | 项目承担漏洞回补；不得处理不可信网页内容 |
| better-sqlite3 8.7.0 与 SQLite 3.43.1 为历史锁定版本 | 源码、SQLite amalgamation 和编译选项逐文件哈希 | 后续换版本必须重建、迁移评审并重跑 SPIKE_04 |
| npm 构建工具审计为 3 high + 1 critical，集中在 node-gyp 的 cacache/make-fetch-happen/tar 链 | 只对包级 manifest 和 SHA-256 已锁定的离线输入运行；不处理任意外部归档，也不整体进入 Win7 runtime | 修复需要不兼容的 node-gyp 13；当前按构建期受控风险保留，详见 `npm-audit.json` |
| 原生模块可能误用 Win10+ API 或动态 CRT | `_WIN32_WINNT/WINVER=0x0601`、VS2019/v142/SDK 锁定、dumpbin fail-closed | Win7 loader smoke 仍为硬门禁 |
| FTS5 编译选项可能在重建中丢失 | 源码合同 + Electron smoke 读取 `pragma compile_options` | Win7 再次验证 FTS5 查询和中文边界 |
| WAL 在网络盘或异常断电下语义不同 | Runtime Profile 限定本地磁盘，smoke 只验证 WAL 可启用 | S02 崩溃恢复必须在 Win7 实机执行 |
| 当前项目 schema 的 FTS5 同步触发器要求可信 schema | smoke 对项目自建数据库显式设置 `trusted_schema=ON`；不接受外部数据库替换内部状态库 | 生产恢复流程必须先验证数据库身份/完整性，不得把不可信数据库作为应用 schema 打开 |
| `unicode61` 不等价于中文分词器 | 本包只验证 FTS5 和 Unicode 路径，不宣称中文分词质量 | SPIKE_04 S05 与开放问题仍需产品裁决 |
| A7 ASAR 可能错误封装 `.node` | 回传说明要求 `better_sqlite3.node` 放在 ASAR 外并绑定哈希 | A7 最终发布包再次检查实际加载路径 |

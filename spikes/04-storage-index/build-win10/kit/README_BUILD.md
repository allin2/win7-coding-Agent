# A6 SQLite/FTS5 Win10 离线构建包

本包用于在独立 Windows 10 x64 构建机上，从锁定源码生成 Electron 22.3.27 ABI 110 的 `better-sqlite3 8.7.0 + 内嵌 SQLite 3.43.1 + FTS5` x64 工件。构建机不需要连接 Windows 7，也不会访问或修改 Windows 7 测试机。

## 构建机前置

- Windows 10 x64；PowerShell 5.1 或更高。
- Visual Studio 2019 `[16.0,17.0)` Build Tools，安装“使用 C++ 的桌面开发”和 MSVC v142 x64；VS2022 即使安装 v142 也会被拒绝。
- Windows SDK `10.0.19041.0`、Windows 10 自带 `tar.exe`。
- CPython 3.8.10 AMD64；其他 Python 版本会被拒绝。
- 至少 4 GB 可用磁盘空间；建议解压至短英文路径，例如 `C:\w7a6`，不要放在带空格、中文、`%` 或 `#` 的构建路径中。

Node 16.17.1、Electron 22.3.27、Electron headers/`node.lib`、better-sqlite3 源码和 npm 工具依赖均已放入包内并锁定 SHA-256。正常构建不访问网络。`PACKAGE_MANIFEST.json` 绑定包内全部材料，`input-lock.json` 另行绑定关键输入。

## 执行

1. 将 ZIP 和同名 `.sha256` 复制到 Win10。
2. 校验 SHA-256 后解压到 `C:\w7a6`，不要在 ZIP 内直接运行。
3. 以普通 PowerShell 执行；VS/Python 的预先安装可能需要管理员权限，但构建本身不要求管理员权限：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
cd C:\w7a6
.\build.ps1
```

成功时最后显示 `BUILD PASS`，并在 `result\` 生成：

- `WIN7_A6_SQLITE_ARTIFACTS_*.zip`
- 对应的 `.sha256`

请将这两个文件原样复制回 Mac，不要只回传 `.node` 文件。

## 自动检查

- 包 manifest、关键输入大小和 SHA-256；
- Windows 10、VS2019、v142/14.2x、SDK 10.0.19041.0、Python 3.8.10 AMD64；
- Electron headers 从已校验归档重新解压，实际使用文件逐项留痕；
- better-sqlite3 8.7.0 源码、SQLite 3.43.1 和 `SQLITE_ENABLE_FTS5` 源码合同；
- Electron ABI 110 x64 源码构建；
- `dumpbin /HEADERS`、`/DEPENDENTS`、`/IMPORTS`，禁止 Win10+ API 和未闭合动态 CRT；
- Electron 内真实加载 `.node`，验证 ABI 110、SQLite 3.43.1、FTS5、WAL、中文+空格数据库路径和项目 schema；
- 输出文件级 SHA-256、构建环境、日志、SBOM、许可证、审计和风险记录。

## 裁决边界

- `BUILD PASS` 只证明 Win10 源码构建闭包和 Win10 Electron smoke 通过，不等于 Win7 实机通过。
- 工件返回 Mac 并完成审查后，D-014 才可从 `BUILD_REQUIRED` 转为 `READY_FOR_WIN7_VALIDATION`。
- 后续必须在 Win7 SP1 x64 本地磁盘执行 SPIKE_04 S01～S08，包括 WAL/崩溃恢复、FTS5、中文+空格路径、体积清理和性能矩阵。
- 上游官方 ABI 110 预编译工件仅作为版本兼容性旁证，不进入本包；正式候选必须使用本包在锁定 D-017 工具链上生成的二进制。
- 输出的 `runtime/node_modules` 保留 Node 模块布局；A7 打包时必须将 `better_sqlite3.node` 放在 ASAR 外部并绑定本次哈希。

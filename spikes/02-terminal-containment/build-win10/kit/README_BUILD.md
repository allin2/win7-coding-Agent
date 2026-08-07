# Win10 原生构建包使用说明

本包用于在独立的 Windows 10 x64 构建机上，离线生成 Electron 22.3.27 ABI 的 `node-pty 0.10.0 + 内置 winpty 0.4.4-dev 精确快照` x64 工件。构建机不需要连接 Windows 7，也不会访问或修改 Windows 7 测试机。

## 构建机前置

- Windows 10 x64；PowerShell 5.1 或更高。
- Visual Studio 2019 `[16.0,17.0)` Build Tools，安装“使用 C++ 的桌面开发”和 MSVC v142 x64；VS2022 即使带 v142 也会被拒绝。
- Windows SDK `10.0.19041.0`、Windows 10 自带 `tar.exe`。
- CPython 3.8.10 AMD64；其他 Python 版本会被拒绝。
- 至少 4 GB 可用磁盘空间；建议将包解压至短英文路径，例如 `C:\w7build`。

Node 16.17.1、Electron 22.3.27、Electron 头文件/链接库、node-pty、winpty 和 npm 工具依赖均已放入包内并锁定 SHA-256。正常构建不访问网络。
`PACKAGE_MANIFEST.json` 绑定包内所有 500+ 文件；`input-lock.json` 另行绑定所有材料输入和 tooling lock。

## 执行

1. 将整个 ZIP 拷到 Win10，校验随包 `.sha256`。
2. 解压到 `C:\w7build`，不要在 ZIP 内直接运行。
3. 以普通 PowerShell 执行；Visual Studio 安装需要管理员权限，但构建本身不要求管理员权限：

```powershell
Set-ExecutionPolicy -Scope Process Bypass
cd C:\w7build
.\build.ps1
```

成功时最后显示 `BUILD PASS`，并在 `result\` 生成：

- `WIN7_NATIVE_ARTIFACTS_*.zip`
- 对应的 `.sha256`

将这两个文件拷回 Mac。证据还包括实际 headers 逐文件哈希、所有原生文件的 `dumpbin /HEADERS`、`/DEPENDENTS`、`/IMPORTS`、PE/API/CRT 汇总，以及强制 `useConpty:false`、ABI 110 的 Electron smoke。

## 裁决边界

- `BUILD PASS` 只证明 Win10 构建闭包和 Win10 smoke 通过，不等于 Win7 实机通过。
- 工件回到 Mac 后，必须使用现有 Mac → Win7 管理链路执行 SPIKE_02 的交互、取消、背压、进程树、恶意 VT/OSC 和残留进程矩阵。
- 独立 winpty 0.4.3 缺少 node-pty 0.10.0 所需 API，已由 ADR-0063 禁止。本脚本从已锁定的 node-pty 归档恢复内置 0.4.4-dev 精确快照并验证调用合同。
- 任何非 x64、Win10+ 禁止 API、未闭合动态 CRT 或 ABI 110 load 失败都会使构建 fail-closed。
- node-pty 构建产生的 `conpty*.node` 会从 Win7 派生结果中移除并记录；最终包只允许强制 winpty 后端。
- 返回包只保留 `lib/`、类型声明、许可证以及 `pty.node`、`winpty.dll`、`winpty-agent.exe`，不携带构建中间文件或 ConPTY 原生模块。
- `project/helper` 是当前仓库源码快照，其中仍有 TODO；本包不把它编译成正式 containment 工件，也不以其代替已完成的 A4 非交互实机证据。

# D-013 Helper Win10 离线构建包

本包在独立的 Windows 10 x64 构建机上，离线构建 `spike02_helper.exe`（Job Object /
Restricted Token / Low Integrity / ACL / 结构化 argv / 超时 / 输出上限 / 整树回收）。
构建机不连接 Windows 7，也不访问或修改 Win7 测试机。

## 构建机前置（严格锁定，D-017）

- Windows 10 x64；PowerShell 5.1 或更高。
- Visual Studio 2019 `[16.0,17.0)` Build Tools，含 "使用 C++ 的桌面开发" 与 MSVC v142 x64；
  VS2022 即使带 v142 也会被拒绝。
- Windows SDK `10.0.19041.0`（含 x64 `mt.exe`）、Windows 10 自带 `tar.exe`。
- 至少 2 GB 可用磁盘空间；建议解压至短英文路径，例如 `C:\w7d013`。
- **不需要 CMake、不需要 Python**：构建脚本直接用 `cl.exe`（构建闭包更小、更确定）。

正常构建不访问网络。`PACKAGE_MANIFEST.json` 绑定包内全部文件；
`input-lock.json` 另行锁定 `src/` 源码快照的逐文件 SHA-256。

## 执行

```powershell
Set-ExecutionPolicy -Scope Process Bypass
cd C:\w7d013
.\build.ps1
```

成功时最后显示 `BUILD PASS`，并在 `result\` 生成：

- `WIN7_D013_HELPER_ARTIFACTS_*.zip`
- 对应的 `.sha256`

把这两个文件拷回 Mac。返回包含 `output/helper.exe`、环境探测 `environment.json`、
`dumpbin /HEADERS`、`/DEPENDENTS`、`/IMPORTS` 与 PE/API/CRT 汇总、Win10 smoke 日志
和 `build-result.json`。

## 裁决边界

- `BUILD PASS` 只证明 Win10 构建闭包与 Win10 smoke 通过，**不等于 Win7 实机通过**。
- 返回包复核前，`STATUS.json` 保持 `READY_FOR_WIN10_BUILD`，不是构建完成声明。
- 任何非 x64、Win10+ 禁止 API、动态 CRT 依赖、manifest 嵌入失败或 smoke 失败都会 fail-closed。
- 收到 Win10 返回包后：复核外层 SHA-256 与 `build-result.json`，把
  `spike02_helper.exe` 放入 `candidate/` 并更新
  `spikes/02-terminal-containment/acceptance/d013/d013_profile.json` 的
  `candidate.sha256`，再在 `WIN7_LEASE_GRANTED` 后执行 D-013 验收编排器。
- helper 源码改动后必须重跑 `node prepare-kit.cjs` 重新生成快照/清单，再打新包。

## C02 说明

helper 在宿主已处于 Job 中时 fail-closed（`HOST_ALREADY_IN_JOB`）。若构建机 CI 本身
在 Job 内运行 smoke，JSON round-trip 会返回该错误——这是预期行为，smoke 会标记为
`SKIPPED_IN_JOB`（环境性跳过），不构成构建失败。

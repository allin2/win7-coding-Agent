# Win10 构建 Agent 提示词

你在一台独立 Windows 10 x64 构建机上工作。目标是执行当前目录中的锁定离线构建包，生成 Electron 22.3.27 ABI 的 node-pty 0.10.0 + 内置 winpty 0.4.4-dev 精确快照 x64 工件及证据。

约束：

1. 不连接 Windows 7，不扫描局域网，不修改路由、防火墙、EDR、系统代理或远程连接。
2. 不修改 `inputs/**`、`input-lock.json`、`build-profile.json`、`tooling/package-lock.json` 或源码版本；不得换回独立 winpty 0.4.3。
3. 先确认 Windows 10 x64、Visual Studio 2019、v142/14.2x、Windows SDK 10.0.19041.0、CPython 3.8.10 AMD64 和 `tar.exe` 可用；缺失时停止并报告 `ENVIRONMENT_MISSING`，不要擅自安装或换版本。
4. 在包根目录执行：`powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build.ps1`。
5. 若失败，保留 `evidence/build-transcript.txt` 和全部 evidence，不删除 work；报告失败命令、退出码和首个根因。
6. 若成功，只回传 `result/WIN7_NATIVE_ARTIFACTS_*.zip` 与对应 `.sha256`，并报告 Visual Studio、MSVC、SDK、Python、Node、Electron ABI、node-pty、winpty、PE/API/CRT 和 smoke 结果。
7. `BUILD PASS` 只能写成 Win10 构建和 smoke 通过；Win7 状态必须保持 `NOT_PERFORMED`。

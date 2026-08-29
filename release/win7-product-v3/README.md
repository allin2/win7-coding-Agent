# A9 `0.3.0-alpha.1` v3 自包含候选

本目录是 A9-09 独立打包线。它复用锁定的 Electron 22.3.27 和 D-014 better-sqlite3 8.7.0 /
SQLite 3.43.1，并要求 D-017 锁定 Win10 工具链返回的 D-013 v25 Current-User helper。D-013 v24、
WIN7-19 及其证据保持只读，不继承 A7/A8 的产品 PASS。

从仓库根目录构建：

```text
node scripts/release/build-a9-product-v3.mjs ^
  --electron-zip spikes\02-terminal-containment\build-win10\kit\inputs\electron-v22.3.27-win32-x64.zip ^
  --runner-zip D013-V25-WIN10-RETURN.zip ^
  --storage-zip A6\WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip ^
  --output release\win7-product-v3\out
```

正式候选必须来自干净、已提交源码。`--allow-uncommitted` 只生成开发机替代候选；manifest 会记录
`source_dirty: true` 和 `external_acceptance_eligible: false`，不得拿去签发 Win10、Win7 或 Alpha PASS。
构建器不下载依赖，不要求目标机安装 Node，并在发布 ZIP 前验证全树 manifest、A9 `git-adapter`
闭包、外置 Electron ABI SQLite、D-013 helper、敏感信息排除和双构建确定性。

Windows 验收必须解压同一个 ZIP 到全新目录，在包外建立证据目录。默认数据位于
`%LOCALAPPDATA%\Win7CodingAgent\a9`；只有显式传入 `--portable` 才使用包旁 `portable-data`。
先用 `record-a9-v25-helper-input.mjs` 校验两次干净 Win10 构建的两组 ZIP/sidecar，证明 helper 字节一致，
并生成一次性的 `a9-09-input-lock.json`，再构建正式候选：

```text
node scripts/release/record-a9-v25-helper-input.mjs ^
  --runner-zip D013-V25-WIN10-RETURN-A.zip --sidecar D013-V25-WIN10-RETURN-A.zip.sha256 ^
  --runner-zip-2 D013-V25-WIN10-RETURN-B.zip --sidecar-2 D013-V25-WIN10-RETURN-B.zip.sha256
```

Windows 现场先运行
`RUN_A9_09_INTEGRITY.cmd <原始 WIN7-20 ZIP 路径>` 绑定 ZIP/manifest 双哈希。Win10/Win7 未实际执行前
始终保持 `NOT_PERFORMED`。完整性工具在 Electron Node mode 下强制使用 `original-fs` 读取物理文件字节，
避免 Electron 的 ASAR 虚拟文件系统改变 `resources/default_app.asar` 的读取语义；启动脚本同时清除外部
`NODE_OPTIONS`，防止预加载代码污染哈希边界。

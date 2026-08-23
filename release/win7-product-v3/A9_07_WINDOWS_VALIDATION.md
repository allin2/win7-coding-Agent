# A9-07 Windows 同候选验收

## 候选绑定

1. 将 ZIP 和 `.sha256` 复制到 Win10/Win7，记录原始 SHA-256。
2. 解压到全新目录，不覆盖 A7/A8 或旧 A9；证据目录必须位于候选目录之外。
3. 保留原始 ZIP 在解压目录之外，执行
   `RUN_A9_07_INTEGRITY.cmd C:\候选\Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip`；工具使用包内
   `electron.exe` Node mode，现场计算 ZIP 和 manifest 双哈希，不得调用系统 Node。
4. 所有报告记录同一 `release_id`、ZIP SHA-256 和 `release-manifest.json` SHA-256。

## Win10 smoke（内部 Alpha 非阻塞，RC 前必须补齐）

- 普通用户启动正式 `electron.exe`，选择工作区并配置真实 Provider；退出后重新启动。
- 验证 Electron/native ABI、A9 状态库、Provider DPAPI 恢复、模式/Checkpoint 恢复和 Stop 清理。
- 结果只能写 `PASS`、`FAIL` 或 `NOT_PERFORMED`，不能由开发机结果推断。

## Win7 SP1 x64 硬门槛

- 解压、首次启动、Provider 配置、退出/重启；J1～J5 全部真实执行。
- PowerShell 5.1 优先和 CMD 降级；中文/空格路径、CP936、UTF-8、CRLF。
- Git/Python/项目 Node 缺失时局部降级，客户端不得整体退出。
- Stop 后检查进程树与残留；验证 SQLite 重启、损坏备份和旧版回退。
- J1～J5、数据恢复、完整性或残留任一失败，`A9_ALPHA1_PASS` 必须保持未签发。

验收时不得把 API Key 写入命令行、报告、截图文件名或候选目录。Key 只粘贴到产品 Settings 的
API Key 输入框，并启用 DPAPI 记忆（若需要验证重启恢复）。

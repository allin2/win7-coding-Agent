# A9-07 Windows 同候选验收

> Alpha 1 范围按 ADR-0096 收敛为 Full Access 与 Read Only；Review 完整工作流延期至
> `0.3.0-alpha.2`。WIN7-10 Review FAIL 保持历史原样并作为已知限制；只要候选哈希、运行树和关键环境
> 未变化，就从实际检查点 J4 继续，不重跑已经完成的同候选项目。
>
> 后续修复候选按 ADR-0097 使用影响范围增量复验：身份/完整性/启动/后飞行每轮必做，历史失败和受影响项
> 必须重验；此前已通过且未受影响的内容作为 `INHERITED_EVIDENCE / OPTIONAL_REGRESSION`，不再默认重复。

## 候选绑定

1. 将 ZIP 和 `.sha256` 复制到 Win10/Win7，记录原始 SHA-256。
2. 解压到全新目录，不覆盖 A7/A8 或旧 A9；证据目录必须位于候选目录之外。
3. 保留原始 ZIP 在解压目录之外，执行
   `RUN_A9_07_INTEGRITY.cmd C:\候选\Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip`；工具使用包内
   `electron.exe` Node mode，现场计算 ZIP 和 manifest 双哈希，不得调用系统 Node。
   校验器必须报告 `filesystem_profile=ELECTRON_ORIGINAL_FS_PHYSICAL_BYTES`；这是物理 ASAR 哈希的必要条件。
4. 所有报告记录同一 `release_id`、ZIP SHA-256 和 `release-manifest.json` SHA-256。

## Win10 smoke（内部 Alpha 非阻塞，RC 前必须补齐）

- 普通用户启动正式 `electron.exe`，选择 Full Access 或 Read Only 工作区并配置真实 Provider；退出后重新启动。
- 验证 Review 缺后端时 fail-closed、零写入且不会静默进入 Full Access；它不计入 Alpha 1 PASS。
- 验证 Electron/native ABI、A9 状态库、Provider DPAPI 恢复、模式/Checkpoint 恢复和 Stop 清理。
- 结果只能写 `PASS`、`FAIL` 或 `NOT_PERFORMED`，不能由开发机结果推断。

## Win7 SP1 x64 硬门槛

- 解压、首次启动、Provider 配置、退出/重启；J1～J5 全部真实执行。
- Full Access 与 Read Only 正/负向通过；Review 失败证据保留并按 Alpha 2 延期项处理。
- 若现场已推进到 J4，先归档 J1～J3 的应用审计、文件、测试与 Diff 事实，再从 J4 继续；缺少外置归档
  不要求重新执行，但最终裁决前状态只能是 `EVIDENCE_PENDING`。
- PowerShell 5.1 优先和 CMD 降级；中文/空格路径、CP936、UTF-8、CRLF。
- Git/Python/项目 Node 缺失时局部降级，客户端不得整体退出。
- Stop 后检查进程树与残留；验证 SQLite 重启、损坏备份和旧版回退。
- J1～J5、数据恢复、完整性或残留任一失败，`A9_ALPHA1_PASS` 必须保持未签发。

验收时不得把 API Key 写入命令行、报告、截图文件名或候选目录。Key 只粘贴到产品 Settings 的
API Key 输入框，并启用 DPAPI 记忆（若需要验证重启恢复）。

# D-013 v25 A9 Current-User Helper：锁定 Win10 构建

本套件在 Windows 10 x64 上离线构建 D-013 v25。v25 新增协议 v2 与
`a9-trusted-shell-current-user-v1`：child 使用当前用户 Primary Token，不创建 Restricted Token、
不设置 Low Integrity、不修改工作目录 ACL；同时保留 Job Object、NUL stdin、有界双流、ready 回执、
合作取消和整树回收。协议 v1 / v24 Low-Risk 兼容 smoke 仍执行，但旧工件、输入锁和 WIN7-19 证据保持只读。

## 锁定前置

- Windows 10 x64；PowerShell 5.1 或更高。
- Visual Studio 2019 16.x Build Tools，MSVC v142 14.2x x64。
- Windows SDK `10.0.19041.0`，含 x64 `mt.exe`。
- 链接固定 `/Brepro /INCREMENTAL:NO`，两次 helper 字节必须一致。
- 从 “x64 Native Tools Command Prompt for VS 2019” 运行；正常构建 `network_required=false`。
- 不需要 CMake、Python、Node，也不安装或下载任何组件。
- 每次解压到新的短英文目录；两次构建不能复用 `work/`、`output/` 或 `evidence/`。

## 两次干净构建

将同一个、SHA-256 已核对的构建套件分别解压到两个新目录，例如：

```cmd
cd /d C:\w7d013-v25-a
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build.ps1

cd /d C:\w7d013-v25-b
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
```

每个目录的 `result\` 都会产生返回 ZIP 与同名 `.sha256`：

- PASS：`WIN7_D013_V25_HELPER_ARTIFACTS_<utc-stamp>.zip`，`candidate_eligible=true`；
- PARTIAL/FAIL：`WIN7_D013_V25_HELPER_DIAGNOSTICS_<utc-stamp>.zip`，不得进入产品输入锁。

两份 PASS ZIP 和两份 sidecar 必须全部返回。Mac 端记录器会分别验证外层 sidecar、内部逐文件 manifest、
Win10/VS2019/v142/SDK 19041、PE x64、静态 CRT、逻辑测试、协议 v1/v2 smoke、捕获自测与源码提交，
并要求两次 `output/helper.exe` 的 SHA-256 完全相同：

```text
node scripts/release/record-a9-v25-helper-input.mjs \
  --runner-zip <first-return.zip> --sidecar <first-return.zip.sha256> \
  --runner-zip-2 <second-return.zip> --sidecar-2 <second-return.zip.sha256>
```

记录器只创建新的 `release/win7-product-v3/a9-09-input-lock.json`，拒绝覆盖已有文件，并把 v24 条目原样
保留为历史输入。输入锁创建后才能构建 WIN7-20；Win10 PASS 不等于 Win7 PASS。

## Smoke 与失败边界

- v1 smoke 证明 Restricted Primary Token、Low Integrity、ACL 精确回滚、Job、stdin、输出与合作取消。
- v2 smoke 证明当前用户 Primary Token、`restrictedToken=false`、`lowIntegrity=false`、工作目录 ACL 不变、
  非秘密环境覆盖、`deadlineMode=none`、ready 双流证明、取消和 `cleanupConfirmed=true`。
- host Job 不允许 breakaway、子进程创建受环境策略阻止、任何禁止 API/动态 CRT/manifest/协议错误，均只生成
  PARTIAL/FAIL diagnostics；不得改系统策略、关闭安全校验或把环境阻断写成 PASS。
- 返回包中的 raw stdout/stderr 先按字节落盘，再严格按 UTF-8 解码；秘密不得写入命令、路径或证据名称。
- helper 源码改变后必须重新运行 `node prepare-kit.cjs`，再重新封装并重做两次干净构建。

套件本身只表示 `READY_FOR_WIN10_BUILD`。只有双构建回传被记录、A9 候选完成确定性装配，并在同一
WIN7-20 候选上完成 A9-09 增量实机验收后，才可以重新裁决 Alpha。

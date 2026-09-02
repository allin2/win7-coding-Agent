# D-013 v25 A9 Current-User Helper：锁定 Win10 构建

> 当前 r8 套件绑定已提交源码 `e3e778bdf62e22777e58e9eb7370de38c3ab3926`，状态为
> `READY_FOR_WIN10_BUILD`。其 ZIP、input lock 与 package manifest 精确哈希必须命中产品批准清单；
> 已撤销的 r4/r5/r6/r7 套件继续保留历史记录，不得用于正式返回记录。

本套件在 Windows 10 x64 上离线构建 D-013 v25。v25 新增协议 v2 与
`a9-trusted-shell-current-user-v1`：child 使用当前用户 Primary Token，不创建 Restricted Token、
不设置 Low Integrity、不修改工作目录 ACL；同时保留 Job Object、NUL stdin、有界双流、ready 回执、
合作取消和整树回收。协议 v1 / v24 Low-Risk 兼容 smoke 仍执行，但旧工件、输入锁和 WIN7-19 证据保持只读。

## 锁定前置

- Windows 10 x64；PowerShell 5.1 或更高。
- Visual Studio 2019 16.11 Build Tools，MSVC v142 14.29 x64。
- Windows SDK `10.0.19041.0`，含 x64 `mt.exe`。
- 链接固定 `/Brepro /INCREMENTAL:NO`，两次 helper 字节必须一致。
- 从 “x64 Native Tools Command Prompt for VS 2019” 运行；正常构建 `network_required=false`。
- 不需要 CMake、Python、Node，也不安装或下载任何组件。
- 每次解压到新的短英文目录；两次构建不能复用 `work/`、`output/` 或 `evidence/`。

## 两次干净构建

使用新批准套件前，先在 Windows PowerShell 5.1 运行请求复制与 CMD smoke 语法自测（不需要编译器）：

```cmd
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build.ps1 -TestSmokeRequestOnly
```

预期输出 `D013_V25_SMOKE_REQUEST_SELFTEST_PASS WindowsPowerShell=5.1`，退出码为 0。
此入口与正式 overlay 拒绝 smoke 使用同一有序字典复制函数，检查副本/原始请求独立且原始请求未变。
它只额外启动系统 `cmd.exe` 验证无禁止变量时能到达最终 marker；不启动 helper、不写构建工件，也不生成
返回包，不能替代完整 Win10 smoke、双构建或 Win7 验收。
非 Windows 开发机只运行生成器夹具回归，Windows PowerShell 5.1 用例必须记为 NOT_PERFORMED。

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

两份 PASS ZIP 和两份 sidecar 必须全部返回。每次构建会生成独立 UUID `run_id`，所以两份返回 ZIP 的
SHA-256 必须不同；只有 `output/helper.exe` 必须字节一致。Mac 端记录器会分别验证外层 sidecar、内部逐文件 manifest、
Win10/VS2019/v142/SDK 19041、PE x64、静态 CRT、逻辑测试、协议 v1/v2 smoke、捕获自测与源码提交，
要求返回包内 `input-lock.json`、`PACKAGE_MANIFEST.json` 与授权套件逐字节一致，并把 `src/*` 哈希反查到
声明的 Git source commit；相同返回 ZIP 或相同 `run_id` 一律拒绝：

```text
node scripts/release/record-a9-v25-helper-input.mjs \
  --kit-zip <preapproved-build-kit.zip> \
  --runner-zip <first-return.zip> --sidecar <first-return.zip.sha256> \
  --runner-zip-2 <second-return.zip> --sidecar-2 <second-return.zip.sha256>
```

记录器只创建新的 `release/win7-product-v3/a9-09-input-lock.json`，拒绝覆盖已有文件，并把 v24 条目原样
保留为历史输入。输入锁创建后才能构建 WIN7-20；Win10 PASS 不等于 Win7 PASS。

按 ADR-0102，返回包必须包含批准 Profile 的全部 `delivery.evidence`，以及 schema 1 的
`evidence/validation-binding.json`：绑定本次 run ID、source commit、Profile、最终 helper SHA-256、
各原始证据的大小/哈希和实际退出码。记录器独立解析 helper 的 PE32+/AMD64、console/Win7 版本、
导入表、静态 CRT 和嵌入 manifest；delay/ordinal import 或无法解析的 PE 均拒绝，不能仅用 dumpbin
或 build-result 的 PASS 字段替代。v1/v2 原始回执、ready/cancel、捕获字节和逻辑测试缺失或矛盾也拒绝。
该闭包验证证明返回文件一致，不是对不可信构建机的密码学远程证明；仍须保留独立构建与人工复核。

## Smoke 与失败边界

- v1 smoke 证明 Restricted Primary Token、Low Integrity、ACL 精确回滚、Job、stdin、输出与合作取消。
- v2 smoke 证明当前用户 Primary Token、`restrictedToken=false`、`lowIntegrity=false`、工作目录 ACL 不变、
  非秘密环境覆盖、继承环境中的 Provider key 与 Node/TLS 控制项被移除、禁止 overlay 被拒绝且不回显值、
  `deadlineMode=none`、ready 双流证明、取消和 `cleanupConfirmed=true`。
- Node 拒绝采用 `NODE_*`；继承 smoke 覆盖 NODE_DEBUG、NODE_DEBUG_NATIVE、NODE_PRESERVE_SYMLINKS、
  NODE_ICU_DATA、NODE_NO_WARNINGS，overlay smoke 直接验证 NODE_DEBUG 被拒绝。helper 不接收秘密列表；
  产品 Runner 必须先按已知秘密值净化 helper 环境，该值级路径由产品/Runner 回归和 WIN7-20 验证。
- host Job 不允许 breakaway、子进程创建受环境策略阻止、任何禁止 API/动态 CRT/manifest/协议错误，均只生成
  PARTIAL/FAIL diagnostics；不得改系统策略、关闭安全校验或把环境阻断写成 PASS。
- 返回包中的 raw stdout/stderr 先按字节落盘，再严格按 UTF-8 解码；秘密不得写入命令、路径或证据名称。
- helper 源码改变后必须先提交；`prepare-kit.cjs` 会逐文件反查 `SOURCE_COMMIT`，不允许把未提交源码写入正式锁。
  然后重新封装新 revision，将 ZIP、input-lock 与 package manifest 哈希加入
  `release/win7-product-v3/a9-v25-approved-kits.json` 并经独立批准，再重做两次干净构建。

产品记录器还要求该批准清单已纳入当前仓库 `HEAD`，工作树字节与
`git show HEAD:release/win7-product-v3/a9-v25-approved-kits.json` 完全一致，且该路径没有 staged、
unstaged 或 untracked 状态；否则拒绝记录。正式 input lock 保存批准清单的 HEAD commit、路径和
SHA-256。测试夹具只能通过显式 `testOnly=true` 注入隔离清单，CLI 不提供该入口。

只有状态为 `READY_FOR_WIN10_BUILD` 且命中产品批准清单的套件可供记录器接受。只有双构建回传被记录、
A9 候选完成确定性装配，并在同一
WIN7-20 候选上完成 A9-09 增量实机验收后，才可以重新裁决 Alpha。

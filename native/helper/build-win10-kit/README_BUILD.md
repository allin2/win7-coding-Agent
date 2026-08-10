# D-013 v21 Production Helper Win10 离线构建包

本包在独立的 Windows 10 x64 构建机上，离线构建生产非交互 Runner helper（Job Object /
Restricted Token / Low Integrity / ACL / 结构化 argv / 超时 / 输出上限 / 整树回收）。
构建机不连接 Windows 7，也不访问或修改 Win7 测试机。

本修订来自 `native/helper/**`，在已验证 v21 基线上增加强制 `schema_version`/`requestId`、
`idleTimeoutMs` 和 `idleTimedOut`。旧 v21 二进制不得替代本修订的 Win10 返回工件。

## 构建机前置（严格锁定，D-017）

- Windows 10 x64；PowerShell 5.1 或更高。
- Visual Studio 2019 `[16.0,17.0)` Build Tools，含 "使用 C++ 的桌面开发" 与 MSVC v142 x64；
  VS2022 即使带 v142 也会被拒绝。
- Windows SDK `10.0.19041.0`（含 x64 `mt.exe`）、Windows 10 自带 `tar.exe`。
- 必须从 **x64 Native Tools Command Prompt for VS 2019** 启动构建，或先调用
  `VC\Auxiliary\Build\vcvars64.bat`，以准备 `INCLUDE`、`LIB` 等 x64 工具链环境变量。
- 至少 2 GB 可用磁盘空间；v21 必须解压至全新短英文路径 `C:\w7d013-v21`。
- **不需要 CMake、不需要 Python**：构建脚本直接用 `cl.exe`（构建闭包更小、更确定）。
- MSVC 显式使用 `/utf-8` 读取 UTF-8 源码，不依赖构建机的 CP936/ACP。

正常构建不访问网络。`PACKAGE_MANIFEST.json` 绑定包内全部文件；
`input-lock.json` 另行锁定 `src/` 源码快照的逐文件 SHA-256。

## 执行

```cmd
:: 在 “x64 Native Tools Command Prompt for VS 2019” 中执行
cd /d C:\w7d013-v21
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
```

构建开始前，脚本会用同一个 finalizer 自动执行一次合成
`TOKEN_CREATE_FAILED` 诊断打包自测；ZIP、sidecar、schema v3 和内部逐文件 manifest
全部通过后才进入正式编译，并清除自测包。

无论最终结果如何，`result\` 都会生成 ZIP 与对应 `.sha256`：

- `BUILD PASS`（退出码 0）：`WIN7_D013_HELPER_ARTIFACTS_*.zip`，
  `candidate_eligible=true`；
- `BUILD PARTIAL`（退出码 2）：`WIN7_D013_HELPER_DIAGNOSTICS_*.zip`，
  `candidate_eligible=false`；
- `BUILD FAIL`（退出码 1）：`WIN7_D013_HELPER_DIAGNOSTICS_*.zip`，
  `candidate_eligible=false`。

把结果对应的 ZIP 和 `.sha256` 都拷回 Mac；PARTIAL/FAIL 也必须返回，不能只报告屏幕错误。
返回包包含当前已存在的 `output/helper.exe`、环境探测 `environment.json`、
`dumpbin /HEADERS`、`/DEPENDENTS`、`/IMPORTS` 与 PE/API/CRT 汇总、Win10 smoke 日志
和 schema v3 `build-result.json`。helper 的 raw smoke stdout/stderr 在任何 JSON 解析或
合同断言之前落盘；包根的 `RETURN_PACKAGE_MANIFEST.json` 逐文件绑定返回证据。

## 裁决边界

- `BUILD PASS` 只证明 Win10 构建闭包与 Win10 smoke 通过，**不等于 Win7 实机通过**。
- 返回包复核前，`STATUS.json` 保持 `READY_FOR_WIN10_BUILD`，不是构建完成声明。
- 只有 `BUILD PASS` 且包名为 `ARTIFACTS` 的返回包才有候选资格；`PARTIAL/FAIL` 的
  `DIAGNOSTICS` 包只用于根因复核，禁止进入 Win7。
- 任何非 x64、Win10+ 禁止 API、动态 CRT 依赖或 manifest 嵌入失败都会 fail-closed。
  若构建宿主环境阻止 smoke 创建受限子进程，脚本只会产出 `BUILD PARTIAL`
  证据包，不得声明 Win10 PASS。
- Win10 smoke 只使用包内 `work\smoke` 目录；`allowed` 子目录临时施加精确的低完整性
  标签，`protected` 子目录临时施加写入 deny ACE。两条响应记录都必须证明已应用、
  精确验证且已回滚。脚本不会修改 `C:\Windows\Temp`。
- helper 若返回 `ACL_ROLLBACK_FAILED`，表示 ACL/完整性标签恢复未被证明；必须将该候选
  判定为失败并保留错误消息，不得继续进入 Win7 上传或验收。
- Win7 清除最后一条 mandatory-label ACE 后，可能把原始 `null` label ACL 物化为合法的
  `0 ACE` ACL；v16 只在 LABEL 比较中把两者视为“无显式标签”，DACL 仍逐 ACE 严格比较。
- helper 强制验证 restricted token 为 primary token，并按 Windows restricted-token
  合同通过 `CreateProcessAsUserW` 启动；禁止再走 impersonation token 或
  `CreateProcessWithTokenW` 路径；
  禁止把 impersonation token 用于该启动路径。
- v17 在子进程仍为 `CREATE_SUSPENDED` 时直接打开该实际子进程的 token，使用
  `TokenType`、`IsTokenRestricted` 与 `TokenIntegrityLevel` 验证其为 restricted primary
  Low Integrity（`S-1-16-4096`），并把结构化 `tokenAudit` 写入响应；任一查询或字段不匹配
  都在 `ResumeThread` 前终止子进程并失败关闭。受限进程中的本地化 `whoami /groups`
  只作补充文本证据，不再是 C03 的可信判据。
- v18 的 sole-World restricting SID 能让 `IsTokenRestricted` 返回 TRUE，但它会让第二次
  restricted-SID 访问检查只依赖对象上的 World allow ACE；并非所有 Windows 对象都保证
  存在该 ACE，因此 v18 在构建前复核中被判为 `NO_GO_PREBUILD_REVIEW`，未执行 Win10 构建。
- v19 从源 primary token 派生完整 restricting SID 集合：TokenUser 加全部 enabled、
  非 deny-only TokenGroups，去重并规范排序，同时排除 Administrators。实际 suspended
  child 必须在 `ResumeThread` 前证明 restricted SID 集合与派生集合精确一致、包含用户和
  World、不含 Administrators，且仍为 primary Low Integrity `S-1-16-4096 / 4096`。
- v19 的 Win10 构建和 PE/API/CRT/logic tests 均通过，但 smoke 在读取源 token 的合法空
  `TokenRestrictedSids` 时把仅含 `GroupCount=0` 的返回缓冲误判为过小；同时 Windows
  PowerShell 5.1 的 native pipeline 用控制台代码页解码 UTF-8 helper 输出，使中文错误
  消息发生乱码并破坏 JSON。该返回包为 `FAIL`/`candidate_eligible=false`，禁止进入 Win7。
- v20 接受 `TokenRestrictedSids` 空集合的 DWORD 头，同时继续对非空数组做边界检查；
  构建脚本以 `BaseStream` 并发捕获 stdout/stderr 原始字节，先 `WriteAllBytes` 落盘，再用
  throw-on-invalid-bytes 的 UTF-8 解码器转换并解析 JSON。任何无效 UTF-8 仍失败关闭，原始
  字节保留在 `DIAGNOSTICS` 包内。
- v20 的 helper 编译、logic tests 与 PE/API/CRT 据人工构建报告通过，但 PowerShell 5.1
  把两次未抑制的 `GetResult()` 结果连同 capture dictionary 一起作为函数输出，导致
  `Set-StrictMode 2.0` 下访问 `.exit_code` 失败；v20 为 `BUILD FAIL`，不是候选。
- v21 将所有 Task/process/stream 方法结果显式抑制为 `$null`，函数只返回一个
  `PSCustomObject`；三个调用点都要求输出对象数恰好为 1 且五项属性完整。正式编译前还会
  启动 Windows PowerShell 子进程，验证 11 字节 UTF-8 中英文 marker、零 stderr、严格解码
  和 raw bytes 先落盘。失败会在编译前生成不可候选 diagnostics，不会继续消耗构建时间。
- restricted token 使用 `DISABLE_MAX_PRIVILEGE`，保留 Windows 目录遍历所需的
  `SeChangeNotifyPrivilege`，并把 Administrators SID 设为 deny-only；不得把
  Everyone/World 设为 deny-only，否则可能移除 Windows 装载器所需的基础读/执行授权，
  造成子进程以 `0xC0000022 (STATUS_ACCESS_DENIED)` 在用户代码运行前退出。
- 每次构建都会先清空包内 `evidence/` 和返回 staging，避免重跑混入旧证据。
- `logic_tests.cpp` 属于 v21 锁定源码闭包；Win10 构建使用同一 v142 工具链直接编译并运行
  logic tests，失败同样必须进入 `DIAGNOSTICS` 包。
- 收到 Win10 返回包后：复核外层 SHA-256 与 `build-result.json`，把
  `spike02_helper.exe` 放入 `candidate/` 并更新
  `spikes/02-terminal-containment/acceptance/d013/d013_profile.json` 的
  `candidate.sha256`，再在 `WIN7_LEASE_GRANTED` 后执行 D-013 验收编排器。
- helper 源码改动后必须重跑 `node prepare-kit.cjs` 重新生成快照/清单，再打新包。

## C02 说明

helper 在宿主已处于 Job 中时 fail-closed（`HOST_ALREADY_IN_JOB`）。若构建机 CI 本身
在 Job 内运行 smoke，JSON round-trip 会返回该错误——这是预期行为，smoke 会标记为
`SKIPPED_IN_JOB`（环境性跳过）。某些 Agent 沙箱不在 Job 中但会阻止
`CreateProcessAsUserW` 创建受限子进程，此时 smoke 会标记为
`SKIPPED_PROCESS_CREATE_FAILED`。这些情况只允许形成 `BUILD PARTIAL` 证据包，
不构成 Win10 PASS。

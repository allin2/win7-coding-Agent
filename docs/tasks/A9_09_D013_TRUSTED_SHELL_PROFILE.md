# A9-09 — D-013 TrustedShell Current-User Profile 与 WIN7-20

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: NATIVE_RUNTIME_HARDENING
Target Branch: codex/a9-trusted-agent-runtime
Target Version: 0.3.0-alpha.1
Source Baseline: A9-08 / e80b8c8b10b349f6ea790b1e93ae47e656e6c60c
Current Stage: A9-09
Current Stage Status: A9_09A_DEVELOPER_PASS
Target Candidate: WIN7-20
Phase-Gate: A9_09B_READY_FOR_LOCKED_WIN10_BUILD
Win7-Validation: WIN7_20_NOT_PERFORMED
Decision: ADR-0101
```

## 1. 背景与目标

A9-08 已在授权范围内完成审批/IPC、秘密/Provider/TLS、进程生命周期和 checkpoint/迁移修复，开发机
全量验证及第二轮独立审查通过；唯一剩余阻断是正式 A9 Shell 仍锁定到 D-013 v24 Low-Risk Profile。
v24 的 Restricted Token、Low Integrity、System32 低风险白名单、固定超时和单终态回执不能表达
ADR-0089 要求的当前用户 Full Access、环境覆盖、真实无 deadline 与可靠后台 ready。

本任务的唯一目标是实现 ADR-0101：形成独立的 D-013 v25 / 协议 v2 / A9 Current-User Profile，完成
锁定构建、产品装配和 WIN7-20 增量实机复验。WIN7-19、D-013 v24 及其历史证据保持不可变。

## 2. 实现授权与允许路径

- `native/helper/**`：D-013 v25、协议 v2、Current-User Profile、Win10 构建套件与原生测试。
- `src/runner/src/**`、`src/runner/tests/**`：v2 请求/回执、Profile-aware 证明、无 deadline、ready/cancel。
- `src/shell/product/**`、`src/shell/tests/product/**`：正式 A9 装配、Shell 身份、环境覆盖、后台持久化与退出。
- `release/win7-product-v3/**`、`scripts/release/**`：v25 input lock、manifest/SBOM、确定性构建和 WIN7-20 套件。
- `docs/**`、`AGENTS.md`、`README.md`：合同、状态、风险、构建和验收记录。

不授权新增 npm/原生运行时依赖，不授权修改 Core 审批语义、Provider/TLS、checkpoint 数据合同或 A8/A7
历史实现。确需越出上述路径时必须先补充 ADR/任务书，不得扩大白名单自授权。

## 3. 冻结实现合同

### 3.1 Profile 与权限

- v24/协议 v1 继续命名为 `D-013-v24-low-risk-noninteractive`，旧工件、哈希和候选只读保留。
- 新增 `D-013-v25-a9-trusted-shell-current-user` 和 `a9-trusted-shell-current-user-v1`。
- child 使用当前普通用户 Primary Token；不得创建 Restricted Token、设置 Low Integrity 或修改工作目录
  DACL/Integrity Label。继续使用独立 Job Object、stdin=NUL、有界双流和整树回收。
- 当前用户模式不是沙箱，不限制当前用户本来可访问的文件或网络；产品不得显示“安全隔离”或等价承诺。
- 自动宿主仅为规范系统 PowerShell/CMD。工作区显式 Shell 必须来自用户设置，绑定 canonical path、文件
  身份/哈希和版本；模型、命令文本和 Renderer 均不能临时注册 Shell executable。

### 3.2 协议 v2

执行请求至少包含：

```text
schemaVersion=2
requestId
profileId
shellKind/shellPath/shellVersion/shellIdentity
command
cwd
envOverlay
maxStdoutBytes/maxStderrBytes
managed
deadlineMode=none|fixed
timeoutMs?/idleTimeoutMs?
```

- 未知字段、错误类型、协议降级、requestId/Profile/Shell 身份不匹配均 fail-closed。
- `deadlineMode=none` 不得转换成固定总超时或空闲超时；显式 deadline 使用单调时钟。
- 默认继承当前用户环境并叠加工作区环境。Provider/API Key 不得注入；环境值不写日志、事件、SQLite、
  checkpoint、诊断和回执；危险的 Electron/Node/TLS 控制变量必须拒绝。
- v2 回执按 Profile 验证 `tokenMode=current_user`、`restrictedToken=false`、`lowIntegrity=false`、
  `workDirAclModified=false`，同时严格证明 Job 归属、stdin 关闭、输出边界和清理结果。

### 3.3 前台、后台与取消

- 前台执行返回 `execution_started` 后继续发送有界 stdout/stderr，最终以 `execution_result` 收口。
- 后台 `execution_started` 只有在 child 已进入 helper Job、stdin 已断开、双流捕获已准备后才能发送；
  25ms 等待、仅有 PID 或 spawn 成功都不能作为 ready。
- `execution_started`、合作取消、重复 Stop 与最终结果必须绑定同一 requestId。取消超时、helper 崩溃、
  回执畸形、Job/整树状态不确定均保留 `cleanup_required`，不得降级为“已停止”。
- 应用退出继续先执行 shutdown；用户明确“留给系统”前，清理不确定时保留窗口和工作区锁。

## 4. 构建、打包与回退

- 使用 D-017 锁定的 Windows 10 x64、VS2019 16.11、MSVC v142 14.29、SDK 10.0.19041 构建 x64 helper；
  静态 CRT 或完整登记随包 CRT，禁止目标机临时安装未知组件。
- 构建包记录源码提交、全部输入哈希、实际工具链补丁、PE machine/subsystem、imports、CRT、license 和
  `network_required=false`；两次干净构建必须字节一致。
- A9 release input lock 新增 v25 独立条目和 SHA-256；不得改写 v24 条目、WIN7-19 ZIP/manifest/
  candidate identity。WIN7-20 解压到新目录，旧程序目录和用户数据备份保留以便回退。
- helper、协议或 Profile 与 manifest 任一不匹配时 packaged composition fail-closed，不回退到 JS 直启或
  无 Job 的 Shell。

## 5. 验证 Gate

### A9-09A 开发机与协议

- C++ 协议/argv/Profile 单测覆盖 v1/v2 隔离、字段类型、Shell 身份、envOverlay、无 deadline、ready、
  cancel、重复 Stop、畸形回执和秘密不回显。
- Runner/Shell 定向测试、相关 TypeScript/JavaScript 构建、`npm run verify`、`npm run docs:check` 和
  `git diff --check` 通过。
- 安全与进程独立复核无未处置 P0/P1。

### A9-09B Win10 锁定构建

- D-017 前置、源码到二进制闭包、PE x64/API/CRT、协议 smoke、前后台和取消通过。
- 两次干净构建字节一致，v25 SHA-256 写入新的 A9 input lock 和 manifest。

### A9-09C WIN7-20

- 新目录、普通用户令牌启动正式 Electron；候选身份、ZIP/manifest/full-tree/native/ABI 完整性通过。
- PowerShell 5.1、CMD 降级和一个用户显式 Shell；中文空格、CP936/UTF-8/CRLF、junction 与近 MAX_PATH。
- 当前用户工作区写入和普通非秘密环境覆盖；Provider/API Key、Authorization 及秘密变体扫描零命中。
- 前台/后台、真实无 deadline 后主动 Stop、双 Stop、崩溃恢复、recovered PID、退出锁与最终零残留。
- TLS/SSH 严格验证保持启用，不修改 PATH、服务、注册表、防火墙或系统安全设置。
- 按 ADR-0097 继承未受影响的 WIN7-19 证据；所有本任务直接影响项必须使用 WIN7-20 当前候选证据。

只有 A9-09A～C 全部通过，才可签发 `A9_09_WIN7_20_GO_FOR_ALPHA` 并解除 PR #3 合并门禁。开发机或
Win10 结果不能替代 Win7 SP1 x64 实机结论。

## 6. A9-09A 实现记录（2026-08-30）

- D-013 v25 原生实现提交为 `fdeca79`，环境继承秘密过滤修复为 `72e4d90`；正式产品、Runner、设置 UI、
  发布锁与验收套件收口提交为 `7d10032`。协议 v1/v24 保持兼容和只读，v2 绑定
  `a9-trusted-shell-current-user-v1`。
- 产品设置只允许 Renderer 提交 Shell 种类、版本和非秘密环境覆盖；显式 executable 必须由主进程原生
  文件选择器取得。按工作区保存 canonical path、文件身份与版本；snapshot 只显示环境键名，不显示值。
- 自动 Shell 绑定规范系统 PowerShell/CMD；helper 在启动前重新验证 canonical path、SHA-256、argv、cwd、
  当前用户令牌和 Job 归属。`deadlineMode=none` 不设总/空闲超时；ready、取消、双 Stop 与清理证明均绑定
  requestId。
- 开发机结果：原生 `logic_tests` PASS；发布/锁记录器 6/6 PASS；7 个 TypeScript/JavaScript 模块共
  1490 tests PASS；`npm run docs:check` 与 `git diff --check` PASS。此结果不等于 Win10 或 Win7 PASS。
- 锁定 Win10 构建套件为候选外
  `/Users/qlyf/Developer/win7-coding-Agent/.acceptance/build-kits/A9-09/WIN7_D013_V25_HELPER_BUILDKIT_20260830-r4.zip`，SHA-256
  `037213c8637544dccc58b07632e097b718c265f93015af93279ac052f0282e09`；内置原生源码提交
  `72e4d905175baa3eae7b5eb6c1f49f47f9731046`，input-lock SHA-256
  `99aecc91c8e1ff9b797cfe33e7bdc7f7ef5f656fde224e2d0997e9d838a63fb8`，package manifest SHA-256
  `35150cf85f20e73448b14b1adb60a8bb36e9a2ca8ac13d7ef1cf8d7e7829aff9`。
- 当前 Gate 为 `A9_09B_READY_FOR_LOCKED_WIN10_BUILD`。尚未执行 D-017 双干净构建，尚未生成正式
  `a9-09-input-lock.json` 或 WIN7-20 候选，也未执行 Win7 实机复验；综合状态继续为
  `FIX_BEFORE_ALPHA`。

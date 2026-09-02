# A9-09 — D-013 TrustedShell Current-User Profile 与 WIN7-20

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: NATIVE_RUNTIME_HARDENING
Target Branch: codex/a9-trusted-agent-runtime
Target Version: 0.3.0-alpha.1
Source Baseline: A9-08 / e80b8c8b10b349f6ea790b1e93ae47e656e6c60c
Current Stage: A9-09
Current Stage Status: A9_09B_R7_APPROVED_FOR_WIN10_BUILD
Target Candidate: WIN7-20
Phase-Gate: A9_09B_READY_FOR_WIN10_DOUBLE_BUILD
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

## 6. A9-09A 初始实现与独立复审整改记录（2026-08-30）

- D-013 v25 原生实现提交为 `fdeca79`，环境继承秘密过滤修复为 `72e4d90`；正式产品、Runner、设置 UI、
  发布锁与验收套件收口提交为 `7d10032`。协议 v1/v24 保持兼容和只读，v2 绑定
  `a9-trusted-shell-current-user-v1`。
- 产品设置只允许 Renderer 提交 Shell 种类和非秘密环境覆盖；Shell 版本由主进程测量的文件身份派生，
  不接受用户标签。显式 executable 必须由主进程原生
  文件选择器取得。按工作区保存 canonical path、文件身份与版本；snapshot 只显示环境键名，不显示值。
- 自动 Shell 绑定规范系统 PowerShell/CMD；helper 在启动前重新验证 canonical path、SHA-256、argv、cwd、
  当前用户令牌和 Job 归属。`deadlineMode=none` 不设总/空闲超时；ready、取消、双 Stop 与清理证明均绑定
  requestId。
- 开发机结果：原生 `logic_tests` PASS；发布/锁记录器 6/6 PASS；7 个 TypeScript/JavaScript 模块共
  1490 tests PASS；`npm run docs:check` 与 `git diff --check` PASS。此结果不等于 Win10 或 Win7 PASS。
- 旧 r4 Win10 构建套件位于候选外
  `/Users/qlyf/Developer/win7-coding-Agent/.acceptance/build-kits/A9-09/WIN7_D013_V25_HELPER_BUILDKIT_20260830-r4.zip`，SHA-256
  `037213c8637544dccc58b07632e097b718c265f93015af93279ac052f0282e09`；内置原生源码提交
  `72e4d905175baa3eae7b5eb6c1f49f47f9731046`，input-lock SHA-256
  `99aecc91c8e1ff9b797cfe33e7bdc7f7ef5f656fde224e2d0997e9d838a63fb8`，package manifest SHA-256
  `35150cf85f20e73448b14b1adb60a8bb36e9a2ca8ac13d7ef1cf8d7e7829aff9`。A9-09 v25 独立复审后该套件已
  撤销，不包含当前修复，不得再用于正式返回记录。
- 当前 Gate 为 `A9_09B_BLOCKED_PENDING_NEW_COMMITTED_BUILD_KIT`。当前修复尚未提交，因此不得伪造新的
  `SOURCE_COMMIT`、input lock、manifest 或批准 ZIP。提交后必须生成新 revision，在
  `release/win7-product-v3/a9-v25-approved-kits.json` 预登记 ZIP/lock/manifest 哈希并重新独立复核。
  尚未执行 D-017 双干净构建，尚未生成正式
  `a9-09-input-lock.json` 或 WIN7-20 候选，也未执行 Win7 实机复验；综合状态继续为
  `FIX_BEFORE_ALPHA`。
- 本轮未提交整改将 Shell 版本改为文件测量事实，修复 `spawn_failed + cleanupConfirmed` 假残留；WIN7-20
  verifier 严格绑定 Win7 SP1 build 7601 普通用户/非提升/v25 Profile、机器与候选前后身份，并只接受 kit
  锁定的 WIN7-19 disposition/ledger/report 哈希与 JSON pointer；v25 返回记录器改以仓库批准清单中的完整
  build-kit ZIP/hash 为外部信任根。开发机定向 Runner 44/44、Shell 32/32、发布 8/8、原生 logic 1/1，
  全量 7 模块 1497 tests、`docs:check` 与 `git diff --check` PASS；不等于 Win10/Win7 PASS，也不替代新的
  独立复审。

## 7. 最新独立复审整改追踪（2026-08-30，未提交）

本轮针对审查的 P1=2 / P2=1，按 ADR-0102 收紧既有入口，不改历史候选和系统权限。

| ID | 发现与最小修复 | 回归证据 |
|---|---|---|
| A9R3-1 / P1 | WIN7-20 拒绝 dirty/ineligible manifest；复验确定性 ZIP、内外 manifest、kit、native 哈希与物理全树 | `a9-package.test.mjs` 覆盖开发标志、伪 ZIP、替换 manifest/kit、改写全树 |
| A9R3-2 / P1 | 批准 Profile 声明全部必要原始证据；schema 1 validation binding 绑定 run/helper/source/退出码；独立解析 PE/API/CRT/manifest 与 v1/v2 smoke | 同文件覆盖文本 helper、缺件、错误 run/hash、失败退出码、虚假清理、捕获字节及 PE 架构/API/CRT |
| A9R3-3 / P2 | 协议和执行结果共同使用已验证文件身份；显式 Shell 不沿用自动 PowerShell 版本/原因 | `trusted-shell-runner-contract.test.ts` 覆盖显式 Bash 与自动 PowerShell 元数据隔离 |

开发机 `npm run verify`：7 模块共 1498 tests PASS；原生 `logic_tests` 1/1 PASS；发布/ZIP/报告
验证器 13/13 PASS；`docs:check`（102 文件/22 任务）与 `git diff --check` PASS。
这些证据仅证明本地逻辑/结构及 fail-closed，不证明 Windows 执行。新证据格式尚未在锁定 Win10 工具链
运行，Win7 仍为 `NOT_PERFORMED`；旧 r4 ZIP/hash 不变且保持撤销。修复未提交，正式 v25 lock/new kit 与
WIN7-20 候选仍不存在，必须先获提交授权、生成新 revision、批准套件、双构建和最终独立复审。

## 8. 最新产品闭包与批准根整改追踪（2026-08-30，未提交）

最新独立审查确认 §7 的原 P1=2/P2=1 已实质关闭，但新增 P1=2。本轮按 ADR-0103 处理：

| ID | 发现 | 状态与验收 |
|---|---|---|
| A9R4-1 / P1 | “全树等于自报 manifest”可接受五文件裁剪候选 | 部分修复：固定闭包和内部交叉绑定已完成，但最新复审确认仍缺候选外信任根；由 §9 继续处理，不签发关闭 |
| A9R4-2 / P1 | 工作树批准清单可被本地修改/自批准 | 已修复：生产路径要求固定清单是 clean HEAD 精确字节并记录 commit/hash；未跟踪、staged、unstaged 均拒绝，测试注入仅限显式 testOnly |

当前 `a9-v25-approved-kits.json` 尚未提交，所以生产记录按设计保持阻断；不能用当前测试通过代替提交后的
独立批准。旧 r4 仍只有撤销项。后续仍须提交授权、新 revision、批准记录、Win10 双构建、正式 input lock、
完整产品候选、WIN7-20 实机验收和最终 P0/P1=0 复审。

开发机回归：A8/A9 发布、ZIP、报告 verifier 18/18 PASS；7 模块 1498 tests PASS；原生
`logic_tests` 1/1 PASS；`docs:check` 为 102 文件/22 任务，`git diff --check` PASS。以上不等于
Win10 或 Win7 PASS。

## 9. 候选外信任根整改（2026-08-30，未提交）

最新独立复审为 P0=0/P1=1/P2=0：固定文件集合和内部哈希不能证明正式发布来源；纯文本原生文件曾被
正向 fixture 接受。按 ADR-0104 增加候选外 `WIN7_20_RELEASE_AUTHORITY` schema 1 及必须由独立批准渠道
提供的 SHA-256 pin。该记录绑定正式 input lock 精确字节、批准清单 commit/hash，以及整个产品 ZIP、
manifest 和产品 source commit；不能由候选、sidecar 或本地临时文件反推批准。

- 正式 lock 必须绑定已批准 build kit、两个不同返回 ZIP/run ID/evidence binding；TEST_ONLY commit 拒绝。
- Electron/helper 必须是 PE32+/AMD64 executable，SQLite `.node` 必须是 PE32+/AMD64 DLL，检查 section
  边界并绑定正式 entry hash。PE 结构通过不等于真实 Windows 执行。
- 产品 source commit 绑定外部批准候选；helper source commit 单独绑定批准 kit。二者可以因随后提交
  批准清单/正式 lock 而不同，不能伪造为同一提交。
- 正向 fixture 通过临时干净 Git 快照和正式产品构建器生成；没有“假 clean”生产参数。反例包括纯文本
  三种原生入口、x86、截断 section、错误 DLL、外置锁伪造/缺失 pin、双构建复用，以及 JS 同步伪造 ZIP。

本地整改验证：A8/A9 发布、ZIP、报告回归 18/18 PASS；补充真实 CLI init/integrity 的定向用例 PASS，
Node 开发宿主仅 closure PASS、总结果仍 FAIL（不可冒充 Electron ABI/Windows）。`npm run verify` 为
7 模块 1498 tests PASS；原生 logic 1/1、`docs:check`（102 文件/22 任务）及 `git diff --check` PASS。
v24 两份 input lock 与 HEAD 相同；WIN7-19 ZIP `824a10cd…72b0`、manifest `b483e9b0…2c26`、
candidate identity 与 780 文件身份不变，旧 r4 SHA `037213c…e09` 不变。当前仍无正式 v25 lock、批准的
WIN7-20 候选或 Windows PASS。最新独立复审为 P0=0/P1=0/P2=1，确认上述发布信任 P1 已关闭；唯一
P2 是 `A9_09_WINDOWS_VALIDATION.md` 首步仍使用旧的一参数命令签名，现已按实际五参数 fail-closed
合同修正。当轮 A9-09A 代码/安全层 P0/P1 Gate 已满足；后续 §10 新增环境 P1 撤销该通过结论，综合状态仍为
`FIX_BEFORE_ALPHA`。

## 10. 已知秘密值与 Node 环境整改（2026-08-30，未提交）

最新独立审查（任务轮次 `01a05280-699c-7d50-b5d0-0040616d6299`）为 P0=0/P1=2/P2=0。
按 ADR-0105 实施最小修复；下述环境整改随后获 §11 独审关闭，Win10 双构建仍因新增构建脚本问题为 NO_GO。

| ID | 发现与修复 | 验证边界 |
|---|---|---|
| A9R6-1 / P1 | 普通变量名携带已知秘密：继承/overlay 同时过滤值与编码变体，净化探测/前后台/helper 环境；schema 3 启动/凭据变化复验全部旧工作区，清除被拒 overlay 并留下跨重启标记 | Runner/transport 与真实 Shell Runtime/SQLite/模拟 DPAPI 回归；不等于 Win7 DPAPI 实测 |
| A9R6-2 / P1 | NODE_DEBUG 等漏拦：JS/C++ 同步拒绝 NODE_*，原生 overlay/继承共享规则；扩展 Win10 smoke 与 WIN7-20 ENV-IDENTITY 直接项 | 开发机原生逻辑与入口测试；Win10 smoke 尚未执行 |

无新依赖或系统 API；v1/v24、WIN7-19 和已撤销 r4 保持不可变。当前不生成正式 input lock、kit ZIP、
manifest 新身份或 WIN7-20 候选，不能用本地修复自签独审关闭。

本轮开发机验证：`npm run verify` 七模块 1508 tests PASS（含 Runner 134、Shell 315）；发布/ZIP/report
18/18 PASS；原生 `logic_tests` 1/1 PASS；`docs:check` 102 文件/22 任务及 `git diff --check` PASS。
回归涵盖编码变体、普通变量名、前后台/helper/探测环境、模拟 DPAPI 重启、全部旧工作区复验、Provider
轮换、写入失败时不虚报清除、v1 传输环境不变。Win10/Win7 为 NOT_PERFORMED，不包含真实 Windows
PE 执行或 DPAPI PASS。两份 v24 锁和旧 v25 锁与 HEAD 相同；WIN7-19 ZIP `824a10cd…72b0`、
manifest `b483e9b0…2c26`、candidate identity `ab5a1159…d3c` 及旧 r4 ZIP `037213c…e09` 均复核不变。

## 11. 构建脚本入口整改（2026-08-30，未提交）

独立审查轮次 `01a052a9-f458-7033-a961-49cbd15a7cc2` 确认 §10 两项环境 P1 已关闭，但新增两项
构建脚本 P1（P0=0/P1=2/P2=0）。按 ADR-0106 修复，不据本地自测签发独审或 Windows Gate。

| ID | 发现与修复 | 验证边界 |
|---|---|---|
| A9R7-1 / P1 | prepare-kit 对四变量数组的精确匹配拒绝新增 Node smoke；改为解析集合并校验九个必需名称，允许换序/扩展 | 在隔离 TEST_ONLY Git 仓库执行真实生成器，验证 source/input/manifest 哈希闭包；逐个缺项与未提交 helper 均拒绝，不改写锁 |
| A9R7-2 / P1 | `[ordered]@{}` 没有 Hashtable.Clone；同一复制函数逐项保留顺序/字段，并替换 requestId/overlay | `build.ps1 -TestSmokeRequestOnly` 在任何构建或写盘前验证一个独立有序字典及源对象未变；真实 Windows PowerShell 5.1 执行在非 Windows 明确跳过 |

真实生成器入口回归为 4 PASS / 1 SKIP（Windows PowerShell 5.1 NOT_PERFORMED）。原 §10 的原生、Runner、
Shell 代码本轮未改动；保留其 1508 项开发机验证记录，不把未重跑或 Windows 跳过项计为本轮 PASS。
本轮 A8/A9 产品打包、发布锁、ZIP、报告 verifier 与上述生成器共 22 PASS / 1 SKIP / 0 FAIL；
`docs:check`（102 文件/22 任务）、JS 语法及 `git diff --check` PASS。两份 v24 锁、旧 v25 锁和
WIN7-19 结构化记录/收口报告与 HEAD 相同；WIN7-19 ZIP、manifest、candidate identity 和旧 r4 ZIP
SHA-256 分别仍为 `824a10cd…72b0`、`b483e9b0…2c26`、`ab5a1159…d3c`、`037213c…e09`。
当前套件仍为已撤销 r4，不更新正式锁、manifest 身份或 source commit，不生成新 ZIP；待新独审与授权
提交后，才能新 revision 预登记并进入锁定 Win10 双构建。WIN7-19 和 v24 历史边界不变。

## 12. r5 已提交构建输入（2026-09-02）

项目负责人已授权提交、推送和 Win10 构建。A9-09～A9-12 修复已提交为
`c718152f0c413d2c21407eec042dc50197b6e51f`；新 r5 离线构建套件为
`WIN7_D013_V25_HELPER_BUILDKIT_20260902-r5.zip`，SHA-256
`341fb9f9d66c64e4e5b0b31eddf6899b94462e39d14ba536b2f881c31abab2c9`，input lock SHA-256
`5dd85ae7209691cc6575d320d769385852d327d4bde51db0ab49cd7d319f586b`，package manifest SHA-256
`2cc6b9b53eb1b5a8ae96596547705a66e08abb0af8928a1be2cff7d6bd6231b5`。批准清单保留 r4 撤销项，并将
r5 标记为 `APPROVED_FOR_RETURN_RECORDING`。

当前 Gate 前移至 `A9_09B_READY_FOR_WIN10_DOUBLE_BUILD`。这只批准在锁定 Win10 环境执行 D-017 两次
全新目录构建；Win10 返回包、正式 v25 产品输入锁、WIN7-20 候选和 Win7 实机结果仍不存在，均保持
`NOT_PERFORMED`，综合状态仍为 `FIX_BEFORE_ALPHA`。两项 Provider P2 经负责人决定延期，不在本轮冒充修复。

首次 Win10 执行保留了两份 FAIL 诊断：初次 SSH CMD 未加载 VS 开发环境，`cassert` 不可见；加载锁定
VS2019 环境后的 r5 在 MSVC/Windows headers 下暴露 `std::max` 与 Win32 `max` 宏冲突。后者已以
`(std::max)(...)` 最小修复提交为 `7f43dec19612bafba1bb94e5ecb261cd87508f80`。r5 随即标记撤销，不复用
失败目录；新 r6 ZIP SHA-256 为 `4d7985d4668eb902f4863efcb3fa43e29fa105371275ce2d234f540e6438922c`，
input lock 为 `104b4aca3b4cf59286ff161659a48e0c95511dc8a5df8bab06848343e825c8c5`，package manifest 为
`da90075f88bef297ab234afd7f7404d2f96e8e05c53a0c9954802ed0a578b5c8`。当时只允许 r6 进入新的双构建目录。

r6 在无 Host Job 的 WMI 启动路径完成编译、链接、PE/API/CRT 与 v1 执行，但外层检测到受保护目录回滚后
DACL 多出 `SE_DACL_AUTO_INHERITED` 控制位。Win10 独立 API 探针复现：`SetNamedSecurityInfoW` 会加入
该位，而用捕获的原始描述符调用 `SetFileSecurityW` 可恢复原 SDDL。修复提交
`9fa02c3b6503e71aae8f0c889d5dbc61e30a8776` 改为恢复原描述符并同时核对 DACL 控制位；r6 已撤销。
新 r7 ZIP SHA-256 为 `f5bf50a5e127978a59b7ffd35a40d74423efee8a23dbd16147d2fb660b8cdafb`，input lock 为
`71c7a797cbcc9bbda93ccb2b9f948446f32f8349dae4539c77299bd259c87081`，package manifest 为
`320ea758da5d49b2e4a21c83528ce643c11a85ac059c383a2210a4af4cc38f98`；当前只允许 r7 进入后续新目录。

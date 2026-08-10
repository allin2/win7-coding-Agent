# D-013 Helper 与 containment 闭包报告

> 分支 `codex/a4-d013-closure` · 2026-08-10
> 工作目录：`/Users/qlyf/Developer/win7-agent-a4`

## 1. 提交

- **BASE_COMMIT**：`86f6d69`（`chore(build): archive Win10 native review baseline`，与 main 同点）
- **IMPLEMENTATION_COMMIT**：`2e833e0`（`fix(spike02): harden D-013 helper for v15`）
  - 代码提交：`3ec201c`（`feat(spike02): D-013 helper containment closure…`）
  - 构建包修正：`6f47f50`（`fix(spike02): commit D-013 Win10 build kit…`）
  - 首版闭包报告：`17ca1f7`（`docs(spike02): D-013 closure report…`）
- **CURRENT_RECOVERY_SOURCE**：`8dbe62fbcf2cd05baec3fae1760b96f7bcf8a75d`
  （`fix(spike02): enforce PowerShell capture output contract`）

## 2. 修改文件（仅允许路径内）

| 路径 | 变更 |
|------|------|
| `spikes/02-terminal-containment/helper/helper.cpp` | 重写：非骨架 Win32 编排（Job/Token/ACL/argv/超时/输出上限/整树回收） |
| `spikes/02-terminal-containment/helper/helper.h` | 重写：结构体改为自持有字符串，新增 protectedDirectories/allowExecutables 协议字段 |
| `spikes/02-terminal-containment/helper/json_parser.h/.cpp` | 新增：平台无关 JSON 解析器（UTF-8→UTF-16，有界深度/长度） |
| `spikes/02-terminal-containment/helper/argv_builder.h/.cpp` | 新增：CommandLineToArgvW 兼容命令行构建（C10 中文/空格路径） |
| `spikes/02-terminal-containment/helper/whitelist.h/.cpp` | 新增：argv 白名单（System32 工具、cmd 仅 /d /s /c、拒绝 /k） |
| `spikes/02-terminal-containment/helper/protocol.cpp` | 新增：JSON over stdio 协议（请求解析 + base64 结果渲染 + 错误渲染） |
| `spikes/02-terminal-containment/helper/logic_tests.cpp` | 新增：平台无关单元测试（协议/引号/白名单/渲染） |
| `spikes/02-terminal-containment/helper/CMakeLists.txt` | 更新：新增源文件 + logic_tests 目标（macOS 可跑） |
| `spikes/02-terminal-containment/helper/.gitignore` | 新增：排除本地构建产物（不排除 build-win10-kit） |
| `spikes/02-terminal-containment/helper/build-win10-kit/**` | 新增：D-013 Win10 离线构建包（见 §4） |
| `spikes/02-terminal-containment/acceptance/d013/**` | 新增：D-013 专属验收 harness（见 §3） |
| `spikes/02-terminal-containment/test/test_containment.sh` | 重写：真实实现语义断言（含 N06 无 taskkill） |
| `spikes/02-terminal-containment/test/.gitignore` | 新增：排除测试输出 |

未修改：`winpty/**`、`src/**`、`docs/**`、`build-win10/**`（D-011 包内 helper 快照仍为旧骨架，已超出本任务允许路径，由新 D-013 kit 取代）。

## 3. C03 修复与 D-013 验收 harness

**C03 失败根因（已定位）**：旧骨架 `LaunchRestrictedProcess` 创建了 Restricted Token
却从未把它应用到子进程（`CreateProcessW` 使用默认 token，`hToken` 创建后即被丢弃），
子进程以完整用户权限运行，故工作区外写入成功。

**修复**：helper 现在通过 `CreateProcessAsUserW` 把受限 primary token 真正应用到子进程：
`CreateRestrictedToken(DISABLE_MAX_PRIVILEGE)` 保留 Windows 目录遍历需要的
`SeChangeNotifyPrivilege`，仅把 Administrators 组设为 deny-only，不禁用 Everyone/World，
并用 `SetTokenInformation(TokenIntegrityLevel)` 降为 Low Integrity（S-1-16-4096）；
v17 又在 `CREATE_SUSPENDED` 子进程恢复执行前直接打开该实际子进程 token，用
`TokenType`、`IsTokenRestricted` 与 `TokenIntegrityLevel` 验证其为 restricted primary
Low Integrity；但 v17 构造 token 时传入的 `RestrictedSidCount` 为 0，导致
`IsTokenRestricted()` 必然为 false，Win10 smoke 因而在 `ResumeThread` 前以
`TOKEN_CREATE_FAILED` 失败关闭。v18 用 sole-World restricting SID 修复了空集合矛盾，
但构建前复核发现这会让第二次访问检查只依赖目标对象的 World allow ACE，存在 DACL
兼容风险，故 v18 未执行 Win10 构建。v19 改为从源 primary token 派生 TokenUser 和全部
enabled、非 deny-only TokenGroups，去重排序并排除 Administrators；实际 suspended child
的 `TokenRestrictedSids` 必须与派生集合精确一致、包含用户和 World、不含 Administrators，
再与 `TokenPrimary`、`IsTokenRestricted=true`、Low Integrity SID/RID 共同构成恢复执行前
的 fail-closed 审计。
Win7 本地化 `whoami /groups` 只保留作补充文本证据。
同时给 `allowedDirectories` 打 Low-Integrity 强制标签（子进程可在工作区内写），
工作区外目录无低完整性标签 → 写被强制完整性策略拒绝。注册表读取由 SAM DACL + 删权
双重拒绝。标签与 deny ACE 均执行精确应用、验证和回滚；回滚无法证明时以
`ACL_ROLLBACK_FAILED` 失败关闭。

**D-013 harness**（`acceptance/d013/run_d013_win7.py`）：
- C01 Job 整树必杀（detached ping 残留=0）；C02 宿主在 Job → `HOST_ALREADY_IN_JOB` fail-closed；
- C03 受限 token 边界（工作区内写成功 / 工作区外写失败 / 受保护注册表读拒绝 /
  子进程低完整性 / 特权已删）；
- C04 ACL 边界：`protectedDirectories` deny ACE 应用+验证+回滚，harness 用 icacls 指纹核对
  DACL 复原；**最小授权**策略门拒绝 per-run root 之外的所有 ACL 目标；
- C05 仅记录 loopback TCP/UDP/DNS 实测，`formal_c05=ENVIRONMENT_MISSING`，不宣称隔离；
- C06 argv 白名单（notepad、cmd /k → `ARGV_REJECTED`）；C07 超时/输出上限。
- 编排器 `run_d013_win7.mjs`：`--dry-run` 零 SSH；execute 模式先检查唯一 Win7 lease，
  再检查候选 SHA-256，缺 lease、哨兵哈希或哈希失配均在 SSH 前 fail-closed；前后置检查
  还覆盖 Bitvise、TCP 22 和本轮 D-013 进程残留。

## 4. Win10 构建包（D-013）

- **路径**：`spikes/02-terminal-containment/helper/build-win10-kit/`
- **当前已验收返回 ZIP**：`WIN7_D013_HELPER_ARTIFACTS_20260810-133111.zip`（v21，保留在 Git 外）
- **ZIP SHA-256**：`5d3bdd6be432ea6781fe756aad32d62a88275bbe6ffefb9f58228f55f220f8ef`
- **helper SHA-256**：`98964fc5d73cc57a580fa2a810ef251ff7aa2b192d79d019299bac8909168ce5`
- **输入绑定**：包内 `input-lock.json` 与工作树逐字节一致，SHA-256 为
  `60ddd80cde85a23b2ed4db7f6d20a86d73a606f44887892e5a72dab3db9a795b`；构建包
  `PACKAGE_MANIFEST.json` SHA-256 为
  `636425baaca113b29cf82dbf074f4facf3f00772cec8134b166c812b41c1b710`。
- **Win10 证据**：Win10 19045、VS2019 16.11、MSVC 14.29/v142、SDK 10.0.19041.0、
  x64、静态 `/MT`、schema-v3 capture selftest、logic tests、manifest、PE/API/CRT 与 native
  smoke 全部 `PASS`；`candidate_eligible=true`。实际 suspended child 的 restricted SID 集合、
  Low Integrity `S-1-16-4096 / 4096` 和 ACL apply/verify/rollback 合同均通过。
- **分层状态**：v15 开发机与 Win10 为历史 `PASS`，Win7 为
  `FAIL_CLOSED_RECOVERY_REQUIRED`；v16 开发机与 Win10 为 `PASS`，Win7 也因 C03 缺少
  可信 Low Integrity 观测而 `FAIL_CLOSED_RECOVERY_REQUIRED`；v17 Win10 smoke 因空
  restricting-SID 列表与审计合同冲突而 `FAIL_CLOSED_TOKEN_CREATE_FAILED`；v18 为
  `NO_GO_PREBUILD_REVIEW / WIN10_NOT_PERFORMED`；v19 Win10 编译与静态闭包通过，但 native
  smoke 因空 `TokenRestrictedSids` 尺寸判断错误而 `FAIL_CLOSED`，其 diagnostics 不具候选
  资格；v20 又因 PowerShell capture 输出污染在 smoke 前失败关闭；v21 Win10 已 `PASS`，
  Win7 为 `NOT_PERFORMED`，等待 recovery 审批。不得把任一层级写成总体 PASS。

## 5. 测试命令与结果（2026-08-10，macOS 开发机 + 2026-08-09 Win10）

| 命令 | 结果 |
|------|------|
| `cmake -S helper -B helper/build-mac && cmake --build helper/build-mac --target logic_tests && ./helper/build-mac/logic_tests` | `logic_tests: ALL PASS` |
| `x86_64-w64-mingw32-g++ … -c helper.cpp json_parser.cpp argv_builder.cpp whitelist.cpp protocol.cpp` + 链接 | 5/5 编译零警告，链接出 PE32+ x86-64 exe（编译/链接检查） |
| `bash test/test_containment.sh "" helper/build-mac/logic_tests` | 通过 37 / 失败 0（新增空 TokenRestrictedSids 头与原始字节先落盘门禁） |
| `node acceptance/d013/test_d013_harness.mjs` | `D-013 harness tests: ALL PASS`（含错误 Low SID、v17 空集合、v18 sole-World、集合不匹配、Admin 混入和用户 SID 缺失负向） |
| Win10 v15 `build.ps1` + native smoke + PE/API/CRT 复核 | `PASS` |
| Win10 v16-recovery `build.ps1` + native smoke + PE/API/CRT 复核 | `PASS`；返回包与 input lock 精确匹配 |
| v17 MinGW 交叉编译 + 链接 | 5/5 编译零警告；PE32+ x86-64 链接 PASS（代理证据，不替代 Win10 v142） |
| v18 MinGW 交叉编译 + 链接 | 5/5 编译零警告；PE32+ x86-64 链接 PASS（代理证据，不替代 Win10 v142） |
| v19 ZIP 独立解包 + CMake logic tests + MinGW 交叉编译 | 20 个包文件精确匹配；`logic_tests: ALL PASS`；5/5 零警告；PE32+ x86-64；禁止文件 0 |

## 6. C01～C08/N06 覆盖情况

| # | 用例 | 实现 | 本地验证 | Win7 证据 |
|---|------|------|----------|-----------|
| C01 | Job 进程树必杀 | KILL_ON_JOB_CLOSE + TerminateJobObject + 进程/内存限制 | 静态断言 PASS | v16 `A4-20260810-000003` PASS |
| C02 | 宿主在 Job fail-closed | IsProcessInJob(self) → HOST_ALREADY_IN_JOB | 静态断言 PASS | v16 `A4-20260810-000003` PASS |
| C03 | Restricted Token 减权 | primary restricted token + DISABLE_MAX_PRIVILEGE + source-derived exact restricting SID set + actual child token audit | v21 本地正/负向与交叉编译 PASS | v16 可信 Low SID 未观测；v17 空集合 FAIL；v18 构建前阻断；v19 查询 FAIL；v20 capture FAIL；v21 Win7 待测 |
| C04 | ACL 工作区外拒绝 | Low 标签 + deny ACE + 回滚 + 授权策略门 | v16 harness 与 Win10 smoke PASS | v16 `A4-20260810-000003` PASS |
| C05 | 网络可达性实测 | 仅测量记录；不阻断、不宣称隔离 | harness loopback 就绪 | v16 loopback PASS；正式仍为 `ENVIRONMENT_MISSING` |
| C06 | argv 白名单 | System32 工具 + cmd /d /s /c + 拒绝 /k | 逻辑测试 PASS + harness | v16 `A4-20260810-000003` PASS |
| C07 | 超时/输出上限 | TerminateJobObject + 逐流截断标记 | 逻辑测试 + harness 就绪 | v16 timeout/output-cap 均 PASS |
| C08 | Runner 内存 | 设计有界（Job 内存限制 + 输出上限 64MB）；未实测 | — | `NOT_MEASURED`（A4 C09 历史 <60MB，新 helper 待测） |
| N06 | 禁止 taskkill 冒充 | 无任何 taskkill 路径（TerminateJobObject/Job close） | 静态断言 PASS | 代码评审断言成立 |

## 7. 未执行验证与阻塞

- **v15 Win7 已 fail-closed**：`A4-20260810-000002` 的轮前、上传、smoke、harness 启动与
  后置零残留检查通过；C01/C03/C04/C05 因 `ACL_ROLLBACK_FAILED` 失败，REM-D07 又遇到空
  `d013-stderr.txt` 的 `certutil 0x800703EE`。ledger 保持 `RECOVERY_REQUIRED`。
- **v15 候选与原始证据已封存**：`A4-20260810-000002` 保持历史 FAIL_CLOSED 结论，
  不得再次满足执行 Gate；Git 外归档不包含协调器私钥。
- **v16 Win10 已通过**：返回包、input lock、native smoke 与 PE/API/CRT 均已复核；
  v16 Win7 `A4-20260810-000003` 的 ACL rollback、空文件哈希、C01/C02/C04/C05/C06/C07
  与 REM-D08 均通过，但 C03 无法从 `whoami /groups` 取得 Low SID，整体仍 fail-closed。
- **v16 原始证据已封存**：签名租约、artifact manifest、ledger 快照、全部原始 evidence、
  v16 返回 ZIP 与旧候选已复制到 Git 外归档；原文件未移动或改写，私钥未归档。
- **v17 Win10 smoke 已失败关闭**：普通 CMD 复跑在 suspended child token 审计阶段返回
  `TOKEN_CREATE_FAILED`；源码确认 `RestrictedSidCount=0` 与 `IsTokenRestricted=true` 要求
  矛盾。用户未提供机器生成的 v17 返回 ZIP 或日志包，故不得虚构 native 证据。
- **新租约仍被阻止**：`A4-20260810-000003` 保持 `RECOVERY_REQUIRED`；v21 Win10 返回包
  已复核并锁定候选，但新的人工 recovery 授权完成前不得签名或连接 Win7。
- **D-011 包内 helper 快照**（`build-win10/kit/project/helper`）仍为旧骨架且禁止修改，
  已由 `helper/build-win10-kit` 取代；正式集成时以新快照为准。

公共 `docs/STATUS.md`、`docs/status/win10-native-builds-latest.json` 和正式 SPIKE_02 任务书
由整合分支协调者统一同步；A4 worktree 不直接改写这些公共状态文件。

## 8. v16 recovery 构建交接（2026-08-10）

- 修复提交：`a64f1ac5654523f684b9981f780ab0b5543939b9`。
- LABEL 回滚：仅对 `LABEL_SECURITY_INFORMATION` 接受 Win7 的 `null ⇔ 0 ACE` 无显式标签
  表示；DACL 继续严格逐 ACE 比较。
- 空证据：`certutil` 最多重试三次；仍失败时仅在远端大小严格为 0 且下载后本地 SHA-256
  等于标准空文件哈希时接受，否则 fail-closed。
- v16 构建包：`WIN7_D013_HELPER_BUILDKIT_20260810-RECOVERY-v16.zip`，SHA-256
  `33608ce194a26c01e87559f2e376d271f8f6a62dcf3695d04f42776e03a10362`。
- input lock：`6bc8708fcba0d05c9a7b54391eb9b59a7f802ebf15fb18f9bf267f63d4f7199e`；
  package manifest：`18eccff4e961357de66feffd557aec03dcafc9674af9faf1851556c06e3ffd23`。
- v16 返回包：`WIN7_D013_HELPER_ARTIFACTS_20260809-173817.zip`，SHA-256
  `daaaf36268776b534d8ddda7e82d853f80e574be63caa1b407c5950b338af5ac`；helper SHA-256
  `68c05f1c69cd2d54a50bde00ed60b52161fd3891b08ed82d597aae694935d6ba`。
- 当前历史状态：v16 Win10 `PASS`；`A4-20260810-000003` Win7
  `FAIL_CLOSED_RECOVERY_REQUIRED`，当前活跃租约为 0。

## 9. v17 trusted child-token audit 构建交接（2026-08-10）

- 触发证据：`A4-20260810-000003`；C03 中 `whoami /groups` 返回拒绝访问，无法提供
  `S-1-16-4096` 的可信观测，其余边界、ACL rollback、空文件哈希与后置检查通过。
- 原始证据归档：`/Users/qlyf/Downloads/A4-D013-archive/2026-08-10-v16-win7-recovery/A4-20260810-000003`；
  35 个内容文件逐项 SHA-256 校验通过，原件未移动或改写，协调器私钥未包含。
- 修复提交：`3619bc7cb509d5313b86cff2b28c3744cc60294d`。
- trusted audit：helper 在实际子进程仍为 suspended 时读取其 process token，精确要求
  `TokenPrimary`、`IsTokenRestricted=true`、SID `S-1-16-4096`、RID `4096`；结构化结果写入
  `tokenAudit`，任一失败均在 `ResumeThread` 前终止并失败关闭。
- 本地验证：`logic_tests: ALL PASS`；containment 静态检查 32/32；D-013 harness 正向和错误
  SID 负向全部 PASS；MinGW 5/5 编译零警告并链接 PE32+ x86-64。
- v17 构建包：`WIN7_D013_HELPER_BUILDKIT_20260810-RECOVERY-v17.zip`，SHA-256
  `1d2ba2e558772bda16d9a51ab11ed83728346019229ecbdda822025893e0a328`。
- input lock：`d74cb07cf114ca582ec429761d77fdc70900beed6631c0ffd4306bf0bbbd77b7`；
  package manifest：`b2e0f107d2e6d2dae17973730bcb3c1e61af18df53a28b8aed07eec5f26c0744`。
- Win10 结果：普通 CMD smoke 在子进程恢复前返回 `TOKEN_CREATE_FAILED`，正式状态为
  `WIN10_SMOKE_FAIL_CLOSED_SOURCE_ROOT_CAUSE_CONFIRMED`；没有机器生成的 v17 返回 ZIP，
  PE/API/CRT 结果不可用。
- 失败材料归档：`/Users/qlyf/Downloads/A4-D013-archive/2026-08-10-v17-win10-smoke-fail`；
  含 v17 输入包、sidecar、根因报告及逐文件 SHA-256 manifest，不包含协调器私钥。
- 当前状态：Win7 v17 `NOT_PERFORMED`，`A4-20260810-000003` 保持
  `RECOVERY_REQUIRED`，不得签发新租约。

## 10. v18 World restricting SID 构建交接（2026-08-10）

- 修复提交：`0c7313bc0a8fc043831fbc1e74c81476ed14eb26`。
- 修复合同：World/Everyone 保持普通 SID 启用，同时作为唯一 `SidsToRestrict` 项；实际
  suspended child token 必须满足 `TokenPrimary`、`IsTokenRestricted=true`、
  `restrictedSidCount=1`、`worldRestrictedSid=true`、Low Integrity SID `S-1-16-4096`
  与 RID `4096`，否则在 `ResumeThread` 前失败关闭。
- 本地验证：`logic_tests: ALL PASS`；containment 静态检查 33/33；D-013 harness 正向、
  错误 Low SID 与 v17 空 restricting SID 负向全部 PASS；MinGW 5/5 编译零警告并链接
  PE32+ x86-64。
- v18 构建包：`WIN7_D013_HELPER_BUILDKIT_20260810-RECOVERY-v18.zip`，SHA-256
  `9aad29ba2c7b01903accd102297f747a21a33ce212a92e24439f2f15e714f9c6`。
- input lock：`ec5ae7d1b9e1c88f06b558e116e9ffdf718b1e12a9fb0bbf33004db74ef31617`；
  package manifest：`371b790d166c969d1ed624acc21c9dfd18bbe6774f8d26a50f6ce2c608f856a1`。
- 构建前复核新增三项阻断：sole-World 的第二次 DACL 检查风险、catch 可绕过返回包
  finalizer、`logic_tests.cpp` 未进入输入闭包。
- 当前状态：`NO_GO_PREBUILD_REVIEW / WIN10_NOT_PERFORMED`；Win7 v18 也为
  `NOT_PERFORMED`。v18 未交付人工构建，当前活跃租约为 0。

## 11. v19 修复与构建交接（2026-08-10）

- 源码修复提交：`59872dc41f33339a140f6ddf7bacacf714190ff2`。
- Restricted Token：从源 primary token 派生 TokenUser 与所有 enabled、非 deny-only
  TokenGroups，规范排序去重，明确排除 Administrators；源 token 已受限、集合为空、缺少
  用户 SID 或 World 均失败关闭。实际 suspended child 必须证明集合精确相等、包含用户和
  World、不含 Administrators，并满足 `TokenPrimary`、`IsTokenRestricted=true` 和精确
  Low Integrity `S-1-16-4096 / 4096`，才能执行 `ResumeThread`。
- 结构化审计新增 `restrictedSidSetVerified`、`userRestrictedSid`、
  `administratorsRestrictedSid`；`restrictedSidCount` 为环境相关数量，不再固定为 1。
- 构建闭包：`build-result.json` 升级 schema v3；raw smoke 在解析前落盘；统一 finalizer
  为 PASS 生成 `ARTIFACTS`（退出码 0），为 PARTIAL/FAIL 生成不可候选的 `DIAGNOSTICS`
  （退出码 2/1）。正式编译前自动执行 synthetic `TOKEN_CREATE_FAILED` 打包自测。
- `logic_tests.cpp` 已进入 `src/`、input lock 和 package manifest，Win10 脚本将以 v142
  直接编译运行 logic tests。
- 本地验证：`logic_tests: ALL PASS`；containment 36/36；D-013 harness 全部 PASS，且
  dry-run 零 SSH/SCP；MinGW 五个 Win32 编译单元零警告并链接 PE32+ x64。
- v19 构建包：`WIN7_D013_HELPER_BUILDKIT_20260810-RECOVERY-v19.zip`，SHA-256
  `29a559e1cf6673e7371470012c6a756ddc0a2c0565d88d0146ead3861e43dedf`。
- input lock：`42183eaa52679965a0cc0092544b626c1131fcb68961f4e53feb73f97767eacd`；
  package manifest：`b4558a1b3b3fef7d7ddd6c36a666c34f0eada2234ba9564c974017529c45c070`。
- 独立包审计：20 个 ZIP 文件与 19 项 manifest 加 manifest 自身精确一致；14 项 input
  lock 全部匹配；从 ZIP 解出的 CMake logic tests 通过，实际源码交叉编译/链接通过；
  私钥、EXE、旧 evidence、缓存和未声明文件均为 0。
- Win10 返回：`WIN7_D013_HELPER_DIAGNOSTICS_20260810-071922.zip`，SHA-256
  `48e3a418a05661bfb55e74d656125f960f1e2998ef1d01c61067976150cfee4c`；helper SHA-256
  `8132323b418e08315bc4fc192626a4e2733b6568fd67541835bc987b4ca482e9`。
- 实际状态：编译、v142 logic tests、PE/API/CRT 为 PASS；`WIN10_SMOKE` 因空
  `TokenRestrictedSids` 查询失败，最终为 `BUILD FAIL / candidate_eligible=false`。原始证据
  已归档至 `/Users/qlyf/Downloads/A4-D013-archive/2026-08-10-v19-win10-smoke-fail`。

## 12. v20 空 restricted-SID 查询与 UTF-8 捕获修复（2026-08-10）

- 源码修复提交：`141bd832eda2287d0e4f88911b9fe091d14a1720`。
- Token 查询：合法空 `TokenRestrictedSids` 只要求 DWORD `GroupCount=0` 头；非空集合继续
  校验 `SID_AND_ATTRIBUTES` 数组边界，再进入既有源派生集合与实际 child 精确等值审计。
- PowerShell 5.1：不再通过 native pipeline 捕获 helper；改为并发读取 stdout/stderr
  `BaseStream`，先 `WriteAllBytes` 保存真实字节，再以严格 UTF-8 解码，最后解析 JSON。
  无效 UTF-8 仍失败关闭，但 diagnostics 能保留未损坏的原始证据。
- 本地验证：`logic_tests: ALL PASS`；containment 37/37；D-013 harness 全部 PASS；MinGW
  五个 Win32 编译单元零警告并链接 PE32+ x64；dry-run 零 SSH/SCP。
- v20 构建包：`WIN7_D013_HELPER_BUILDKIT_20260810-RECOVERY-v20.zip`，SHA-256
  `00128babb7ce733768cf09cb077859a8946ad87e59ee5f82fd0fe738fe67d362`。
- input lock：`ac2e15432be66871ea87138aca42a8154c85d39b0a12bb50d5582e92b102771b`；
  package manifest：`c8d61f1170e06176726ed16edfac61fb49d382f40e8f91f7a16f25ec5ada1616`。
- 独立包审计：20 个 ZIP 文件、19 项 manifest 和 14 项 input lock 精确匹配；包内源码与
  工作树逐字节一致；解包后 logic tests 与 MinGW 五单元编译/PE32+ x64 链接通过；禁止
  文件为 0。
- 人工构建报告：v20 编译、logic tests 与 PE/API/CRT 通过，但 Windows PowerShell 5.1 将
  两次裸 `GetResult()` 的 `VoidTaskResult` 与 capture dictionary 一起输出；函数变为
  `Object[]`，在 StrictMode 下访问 `.exit_code` 失败。最终为 `BUILD FAIL / 不可候选`。
- 报告中的 `WIN7_D013_HELPER_DIAGNOSTICS_20260810-094532.zip` 尚未出现在 Mac 下载目录，
  因而外层完整哈希和内部 evidence 仍待实包复核，不在此虚构 PASS。

## 13. v21 PowerShell 单对象 capture 合同（2026-08-10）

- 修复提交：`8dbe62fbcf2cd05baec3fae1760b96f7bcf8a75d`。
- 两个 Task `GetResult()` 及所有 process/stream 方法结果均显式赋给 `$null`；函数只返回一个
  `PSCustomObject`。所有调用点先物化数组，再要求数量恰好为 1、五项属性完整；禁止用
  `[-1]` 隐藏额外输出。
- 正式编译前运行 Windows PowerShell 子进程 capture 自测：以 ASCII probe 源码按 codepoint
  生成中英文 marker，精确要求 11 个 UTF-8 字节、零 stderr、严格解码、raw bytes 先落盘。
  结果进入 schema-v3 `process_capture_selftest` 字段和独立 evidence。
- 本地回归：build-script contract 当前脚本与 4 个负向变体全部 PASS；containment 37/37；
  logic tests PASS；v21 独立包的 20 个 ZIP 条目、19 项 manifest、14 项 input lock 精确匹配；
  MinGW 五单元零警告并链接 PE32+ x64；禁止文件为 0。
- v21 构建包：`WIN7_D013_HELPER_BUILDKIT_20260810-RECOVERY-v21.zip`，SHA-256
  `8c014442282a30837068ba5355d81a3105b987dd3bb73a619222af6f6f8a7e49`。
- input lock：`60ddd80cde85a23b2ed4db7f6d20a86d73a606f44887892e5a72dab3db9a795b`；
  package manifest：`636425baaca113b29cf82dbf074f4facf3f00772cec8134b166c812b41c1b710`。
- v21 返回包：`WIN7_D013_HELPER_ARTIFACTS_20260810-133111.zip`，SHA-256
  `5d3bdd6be432ea6781fe756aad32d62a88275bbe6ffefb9f58228f55f220f8ef`；helper SHA-256
  `98964fc5d73cc57a580fa2a810ef251ff7aa2b192d79d019299bac8909168ce5`，大小 268800 字节。
- 实机 Win10 结果：schema v3 `PASS/COMPLETE`、`candidate_eligible=true`；capture selftest、
  v142 logic tests、native smoke、PE/API/CRT、input lock 与包 manifest 全部通过。返回包已复制
  到 Git 外归档，ignored candidate 已锁定为上述 helper。
- 当前状态：v21 Win10 `PASS`，v21 Win7 `NOT_PERFORMED`；A4 Gate 继续
  `FAIL_CLOSED_RECOVERY_REQUIRED`，等待 `A4-20260810-000003` recovery 人工复核和新的签名
  租约，不得提前连接 Win7。

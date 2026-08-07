# D-013 Helper 与 containment 闭包报告

> 分支 `codex/a4-d013-closure` · 2026-08-07
> 工作目录：`/Users/qlyf/Developer/win7-agent-a4`

## 1. 提交

- **BASE_COMMIT**：`86f6d69`（`chore(build): archive Win10 native review baseline`，与 main 同点）
- **HEAD_COMMIT**：`176d3a1`（`docs(spike02): D-013 closure report…`）
  - 代码提交：`3ec201c`（`feat(spike02): D-013 helper containment closure…`）
  - 构建包修正：`6f47f50`（`fix(spike02): commit D-013 Win10 build kit…`）

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

**修复**：helper 现在通过 `CreateProcessWithTokenW` 把受限 token 真正应用到子进程：
全部特权删除（枚举后全部删除）、Everyone 与 Administrators 组 deny-only、
`SetTokenInformation(TokenIntegrityLevel)` 降为 Low Integrity（S-1-16-4096）；
同时给 `allowedDirectories` 打 Low-Integrity 强制标签（子进程可在工作区内写），
工作区外目录无低完整性标签 → 写被强制完整性策略拒绝。注册表读取由 SAM DACL + 删权
双重拒绝。`whoami /groups` 将显示 `S-1-16-4096`、`whoami /priv` 无 `SeDebugPrivilege`
（harness 断言）。

**D-013 harness**（`acceptance/d013/run_d013_win7.py`）：
- C01 Job 整树必杀（detached ping 残留=0）；C02 宿主在 Job → `HOST_ALREADY_IN_JOB` fail-closed；
- C03 受限 token 边界（工作区内写成功 / 工作区外写失败 / 受保护注册表读拒绝 /
  子进程低完整性 / 特权已删）；
- C04 ACL 边界：`protectedDirectories` deny ACE 应用+验证+回滚，harness 用 icacls 指纹核对
  DACL 复原；**最小授权**策略门拒绝 per-run root 之外的所有 ACL 目标；
- C05 仅记录 loopback TCP/UDP/DNS 实测，`formal_c05=ENVIRONMENT_MISSING`，不宣称隔离；
- C06 argv 白名单（notepad、cmd /k → `ARGV_REJECTED`）；C07 超时/输出上限。
- 编排器 `run_d013_win7.mjs`：`--dry-run` 零 SSH；execute 模式在候选二进制缺失时
  REM-D01 `CANDIDATE_MISSING` fail-closed（不会连接 Win7）。

## 4. Win10 构建包（D-013）

- **路径**：`spikes/02-terminal-containment/helper/build-win10-kit/`
- **传输 ZIP**：`spikes/02-terminal-containment/helper/build-win10-kit/result/WIN7_D013_HELPER_BUILDKIT_20260807.zip`
- **ZIP SHA-256**：`9cf93d0d307dc97ace1529b56c8d08bb5d9d43f09680dbf284cbe951086c4b4d`
  （`.sha256` 已随仓库提交）
- **清单闭包**：`PACKAGE_MANIFEST.json` 绑定 16 个文件（校验 0 失配）、
  `input-lock.json` 锁定 13 个源码/脚本条目（校验 0 失配）——含输入锁、环境探测
  （`build.ps1` [2/7] Win10/VS2019/v142/SDK19041 严格探测）、PE/API/CRT 检查
  （dumpbin x64 + 禁止导入 + 动态 CRT 闭合）、manifest（asInvoker + Win7 supportedOS）、
  返回包 `.sha256`。
- **状态**：`STATUS.json` = **`READY_FOR_WIN10_BUILD`**（无实际 Win10 返回包，不得宣称构建完成）。

## 5. 测试命令与结果（2026-08-07，macOS 开发机）

| 命令 | 结果 |
|------|------|
| `cmake -S helper -B helper/build-mac && cmake --build helper/build-mac --target logic_tests && ./helper/build-mac/logic_tests` | `logic_tests: ALL PASS` |
| `x86_64-w64-mingw32-g++ … -c helper.cpp json_parser.cpp argv_builder.cpp whitelist.cpp protocol.cpp` + 链接 | 5/5 编译零警告，链接出 PE32+ x86-64 exe（编译/链接检查） |
| `bash test/test_containment.sh "" helper/build-mac/logic_tests` | 通过 29 / 失败 0（含 N06 无 taskkill 断言） |
| `node acceptance/d013/test_d013_harness.mjs` | `D-013 harness tests: ALL PASS`（策略门/mock 端到端/编排器 dry-run/execute 门禁/负向校验） |
| `node acceptance/test_remaining_acceptance_audit.mjs` | PASS（基线） |
| `node acceptance/test_fup_automation.mjs` | **预存在失败**（dry-run stage 分类期望过期：期望 PASS 但现为 ENVIRONMENT_MISSING/NOT_PERFORMED；超出本任务允许修改范围，未改动） |

## 6. C01～C08/N06 覆盖情况

| # | 用例 | 实现 | 本地验证 | Win7 证据 |
|---|------|------|----------|-----------|
| C01 | Job 进程树必杀 | KILL_ON_JOB_CLOSE + TerminateJobObject + 进程/内存限制 | 静态断言 PASS | A4-20260805 非交互树杀 PASS；新 helper 待 lease 重验 |
| C02 | 宿主在 Job fail-closed | IsProcessInJob(self) → HOST_ALREADY_IN_JOB | 静态断言 PASS | A4-20260806 补充 PASS；新 helper 待重验 |
| C03 | Restricted Token 减权 | **已修复**：token 真实应用 + 低完整性 + 删权 | 逻辑测试 + harness 就绪 | **待重跑**（修复前 FAIL 根因已消除，未宣称 PASS） |
| C04 | ACL 工作区外拒绝 | Low 标签 + deny ACE + 回滚 + 授权策略门 | harness（含回滚核对）就绪 | 待执行（MANUAL_GATE 语义收敛为最小授权） |
| C05 | 网络可达性实测 | 仅测量记录；不阻断、不宣称隔离 | harness loopback 就绪 | `ENVIRONMENT_MISSING`（保持） |
| C06 | argv 白名单 | System32 工具 + cmd /d /s /c + 拒绝 /k | 逻辑测试 PASS + harness | 待执行 |
| C07 | 超时/输出上限 | TerminateJobObject + 逐流截断标记 | 逻辑测试 + harness 就绪 | 待执行 |
| C08 | Runner 内存 | 设计有界（Job 内存限制 + 输出上限 64MB）；未实测 | — | `NOT_MEASURED`（A4 C09 历史 <60MB，新 helper 待测） |
| N06 | 禁止 taskkill 冒充 | 无任何 taskkill 路径（TerminateJobObject/Job close） | 静态断言 PASS | 代码评审断言成立 |

## 7. 未执行验证与阻塞

- **未连接 Win7**：未收到 `WIN7_LEASE_GRANTED`，按指令全程未发起任何 SSH/SCP。
- **无实际 Win10 返回包**：构建包仅 `READY_FOR_WIN10_BUILD`；收到返回包后需
  复核外层 SHA-256 → 放置 `candidate/spike02_helper.exe` → 更新 `d013_profile.json` 哈希
  → lease 后执行 `run_d013_win7.mjs --execute-win7`。
- **C03/C04/C06/C07 的 Win7 实证**：待以上两步。
- **预存在基线失败**：`test_fup_automation.mjs`（gate 分类期望过期），不在允许修改范围。
- **D-011 包内 helper 快照**（`build-win10/kit/project/helper`）仍为旧骨架且禁止修改，
  已由 `helper/build-win10-kit` 取代；正式集成时以新快照为准。

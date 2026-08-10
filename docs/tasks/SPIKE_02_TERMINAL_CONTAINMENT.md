# SPIKE_02 — 终端与 Containment 验证（TERMINAL_CONTAINMENT）

> 实现前必读：`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、`docs/PERFORMANCE_BUDGET.md`、
> ADR-0030/ADR-0031（Accepted（附条件，ADR-0036））、本文档。不占用 ADR-0012 阶段编号（ADR-0034）。

## 0. 实现授权（ADR-0011 / C14）

### 0.1 状态块

```
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: SPIKE
Target Branch: spike/02-terminal-containment
Phase-Gate: N/A (SPIKE)
Win7-Compatibility: PROVISIONAL
Win7-Validation: PARTIAL
Blocking-Reason: D-013 v21 is ADR-0065 WIN7_PASS under A4-20260810-000004; formal C05 enterprise/network evidence and terminal T01-T05/N01-N05 remain open, so SPIKE_02 remains NO_GO_FORMAL_GAPS
```

### 0.2 路径白名单（获批后生效）

- `spikes/02-terminal-containment/**`（C++ helper 原型源码、winpty 集成、测试脚本、证据目录）
- 本文档自身（§9 验证记录追加）

禁止路径：`src/**`、其他任务书、`AGENTS.md`、已 Accepted ADR 正文。

## 1. 目标

在 Win7 实机验证两件事，为 ADR-0030（Approval 三档）与 ADR-0031（终端隔离）提供证据：

1. **Containment**：C++ x64 helper（D-013，D-017 工具链构建）能否可靠建立
   Job Object + Restricted Token + ACL 的减权执行环境并保证进程树必杀，
   同时**实测同用户减权下的网络实际可达性**（用于校准"尽力限制网络"的真实效果，ADR-0030）。
2. **交互终端**：node-pty 0.10.0 + 其内置 winpty 0.4.4-dev 精确快照（D-011 / ADR-0063，按 Electron 22 ABI 重编译）
   在 Win7 的终端保真度，以及 C19 注入负向防护。

## 2. 非目标

- 不实现生产 Runner/Policy/审批 UI；helper 接口只需覆盖验证所需子集（argv + JSON over stdio）。
- 不验证 Git（SPIKE_03）；不做性能预算 #4 以外的性能测量。

## 3. Runtime Profile（C15）

- helper：C++ x64，MSVC v142（D-017），静态链接 CRT 或登记 VC Runtime；仅 Win32 API。
- node-pty 0.10.0 npm 官方归档 + 其内置 winpty 0.4.4-dev 精确派生快照（Electron 22 ABI 重编译产物）；独立 winpty 0.4.3 因缺少 `winpty_get_console_process_list` 不得使用（ADR-0063）。
- 构建机 Profile：Windows 10 x64、VS2019 `[16.0,17.0)`、v142/14.2x、Windows SDK 10.0.19041.0、CPython 3.8.10 AMD64；构建和 Win7 验证相互解耦。
- 宿主：SPIKE_01 的最小验证壳（独立 `utilityProcess`，不用 `ELECTRON_RUN_AS_NODE`）。
- 测试机：Win7 SP1 x64；普通用户 + 域策略/企业启动器（若可获得）两档。

## 4. 验证矩阵

### 4.1 Containment（ADR-0030）

| # | 用例 | 通过标准 |
|---|------|----------|
| C01 | Job Object 进程树必杀 | 启动 3 层孙进程链（含 `cmd /c start`、后台驻留），终止后 `tasklist` 零残留 |
| C02 | `IsProcessInJob` 宿主探测 | 宿主已在不可嵌套 Job（模拟企业启动器）时，helper 正确报告并 fail-closed 拒绝执行（P11） |
| C03 | Restricted Token 减权 | 受限进程无法写工作区外测试目录、无法读受保护注册表键 |
| C04 | ACL 工作区外拒绝 | 对预设保护目录的写尝试全部失败并被记录 |
| C05 | 网络可达性实测（非隔离断言） | 记录受限进程 TCP/UDP/DNS 的**实际**可达情况：Job/Token/ACL 预期**不能**阻断 Winsock，此项用于量化 best-effort 限制的真实效果，若确需强制断网则结论为"须走 WFP/企业防火墙或远程隔离"（ADR-0030），**不得据此把本地宣称为禁网/隔离** |
| C06 | argv 白名单 | 白名单外可执行文件启动被 helper 拒绝 |
| C07 | 超时与输出上限 | 超时强杀整树；stdout/stderr 截断标记正确 |
| C08 | Runner 内存 | 预算 #4 |

### 4.2 终端（ADR-0031）

| # | 用例 | 通过标准 |
|---|------|----------|
| T01 | 全屏 TUI | vim/远端 htop 类应用可用性实测并记录保真缺陷 |
| T02 | Unicode/中文回显 | CP936 与 UTF-8 codepage 下中文、emoji 边界行为记录 |
| T03 | resize | 窗口缩放后行列同步，无花屏残留 |
| T04 | Ctrl 信号 | Ctrl+C/Ctrl+Break 传递正确；前台进程可中断 |
| T05 | 会话回收 | 关闭会话后 winpty 宿主、shell、孙进程全部回收（Job 兜底） |

### 4.3 C19 负向（硬门槛，全部必须失败）

| # | 攻击用例 | 要求 |
|---|----------|------|
| N01 | 模型输出/Agent Core 尝试向 pty stdin 写入 | IPC 通道结构性不存在，写入不可达 |
| N02 | 恶意 OSC 52（剪贴板注入） | 被过滤/白名单拦截，剪贴板无变化 |
| N03 | 恶意窗口标题/OSC 0/2 注入 | 标题不被不可信数据控制或被转义 |
| N04 | DECRQSS/设备应答类序列诱导终端回写 | 渲染层禁用应答，无回写进 stdin |
| N05 | 超量/深层嵌套控制序列 | 渲染不挂死，有界处理 |
| N06 | `taskkill` 冒充 containment 检查 | 代码评审断言：不存在以 taskkill 代替 Job 的路径（C08/C18） |

## 5. Go/No-Go 判据

- **Go：** C01~C07 全过 + N01~N06 全部按预期失败（注入零成功）。终端 T01~T05 允许
  记录保真缺陷，但 T05 回收必须全过。
- **No-Go(containment)：** C01/C02/C05 任一不可靠 → ADR-0030 fail-closed：本地只保留
  白名单低风险命令，高风险命令一律拒绝或远程执行。
- **No-Go(winpty)：** T05 回收失败或 T01~T04 缺陷不可接受 → ADR-0031 降级：放弃交互
  PTY，改非交互命令 + 流式输出日志视图。

## 6. 交付物

1. helper 原型源码 + winpty 集成代码（`spikes/02-terminal-containment/**`）。
2. Win7 实机证据包（含抓包、`tasklist` 快照、注入用例录屏/日志）。
3. Go/No-Go 报告（三种结论组合分别对应 ADR-0030/0031 预声明降级）。
4. D-011/D-013/D-017 哈希与工具链版本锁定登记（WIN7_CONSTRAINTS §6.1）。

## 7. 治理

- 失败只废弃 `spike/02-*` 分支；证据与报告以 `docs:` 提交进 main。
- helper 接口（argv + JSON over stdio）在本 Spike 结束时冻结提案，进 PHASE_06 任务书。

## 8. 开放问题

- 企业启动器/域策略环境能否获得实测机会（影响 C02 覆盖度）。

## 9. 验证记录

```
Win7-Compatibility: PROVISIONAL
Win7-Validation: PARTIAL (D-013 v21 WIN7_PASS; terminal matrix incomplete)
Win10-Native-Build: D-011 PASS_WITH_PACKAGING_GAP; D-013 v15/v16 PASS historical, v21 PASS current
Evidence: A4-20260805-123467, A4-20260806-140606, A4-20260810-000004, WIN7_NATIVE_ARTIFACTS_20260806-160514.zip, WIN7_D013_HELPER_ARTIFACTS_20260810-133111.zip
Result: C01/C02/C03/C04/C06/C07/C08/N06 PASS (8/19 formal atomic cases); D-013 v21 WIN7_PASS
Blocking-Reason: formal C05 enterprise/network evidence remains ENVIRONMENT_MISSING; terminal integration/harness INCOMPLETE; T01-T05/N01-N05 NOT_PERFORMED
```

A4 无人值守编排 AUTO-00～AUTO-07 和 Win7 非交互 helper 14 项矩阵均已通过；补充执行确认
C02 `PASS`、C03 `FAIL`，并只完成 C05 loopback 观测。原始证据、逐阶段日志和派生审计见
`spikes/02-terminal-containment/acceptance/evidence/`，当前正式结论仍为
`NO_GO_FORMAL_GAPS`，不解除生产 Runner 或交互终端 Gate。

2026-08-06 预检确认原 `node-pty 0.10.0 + winpty 0.4.3` 是确定性编译阻断；修正包改用内置
0.4.4-dev 精确快照，并加入实际 headers 重建、VS2019/SDK/Python 严格探测、PE/API/CRT 与
Electron ABI 110 smoke。2026-08-07 已复核返回包
`WIN7_NATIVE_ARTIFACTS_20260806-160514.zip`，外层 SHA-256 为
`c938f115c242bf37ec364070ad9b80df173cacd43fd3df9db84aa13126f346ea`；Win10 build/smoke、
三项 PE 检查和 112 个输出工件哈希均通过，D-011 构建前置已经解除。原生工件 SHA-256 为：

- `pty.node`：`4b4444b8b491192af10a1b60765efd1eec530ad5892d6fc1ac3f069a1a9abae5`
- `winpty-agent.exe`：`51846f58b3eeadaabd7a137c3b2f9abaa49dfa96f1af9dd2e1b813643b8f6a5d`
- `winpty.dll`：`cb8300eedab637f002b91f5403dc877355a160f5d334aac723d54cc70f36aa9b`

返回包缺内部 `RETURN_PACKAGE_MANIFEST.json`，因此复核状态为 `PASS_WITH_PACKAGING_GAP`；外层哈希和
`build-result.json` 仍覆盖全部运行时输出。当前仓库的 winpty 集成与正式测试 harness 仍含骨架/TODO，
所以 T01～T05/N01～N05 不能直接进入 Win7 执行；D-013 helper 也不在本次构建范围。完整 SPIKE_02
继续为 `NO_GO_FORMAL_GAPS`，但阻塞原因不再笼统记作 Win10 构建主机缺失。

2026-08-09/10 已完成 D-013 v15 返回包复核与预执行同步：返回 ZIP SHA-256 为
`1b4dc3609bd10a02f1199ef4fd18696f74d208b6ef5758e03b628146a4000d4f`，锁定 helper 为
`5689b612daf78cf746716e8aabc491bc00abd4abdc1f498c8301651c5ff10e2b`，input-lock 为
`166c4e5b5a1e269a1dcc976b01a154acd5394404b35498038856b2c55d586386`。Win10 v15 为历史
`PASS`，但 `A4-20260810-000002` 在 `192.168.1.11` 的 Win7 执行为 `FAIL_CLOSED`：C01/C03/
C04/C05 共享 `ACL_ROLLBACK_FAILED`，证据回收对空 stderr 又遇到 `certutil 0x800703EE`；后置
Bitvise、22 端口与零进程残留检查为 `PASS`。v16 recovery 仅在 LABEL ACL 中接受 Win7 的
`null ⇔ 0 ACE` 等价表示，DACL 仍严格比较，并为远端严格零字节文件增加规范空 SHA-256 fallback。
开发机 logic/harness 与静态检查 31/31 通过；构建包
`WIN7_D013_HELPER_BUILDKIT_20260810-RECOVERY-v16.zip` SHA-256 为
`33608ce194a26c01e87559f2e376d271f8f6a62dcf3695d04f42776e03a10362`。v16 Win10 返回包
`WIN7_D013_HELPER_ARTIFACTS_20260809-173817.zip` SHA-256 为
`daaaf36268776b534d8ddda7e82d853f80e574be63caa1b407c5950b338af5ac`，helper SHA-256 为
`68c05f1c69cd2d54a50bde00ed60b52161fd3891b08ed82d597aae694935d6ba`；native smoke、x64、
静态 CRT、PE/API/CRT 和 input-lock 核验均为 `PASS`。v16 Win7 仍为 `NOT_PERFORMED`。
该轮 ledger 当时保持 `RECOVERY_REQUIRED`，协调器拒绝任何新 `grant`，直到人工复核并显式转为
`RECOVERY_REVIEWED`。完整 SPIKE_02 继续为 `PARTIAL / NO_GO_FORMAL_GAPS`，不解除生产 Runner
或交互终端 Gate。

2026-08-10 已完成 v21 Win10 返回包复核：`WIN7_D013_HELPER_ARTIFACTS_20260810-133111.zip`
SHA-256 为 `5d3bdd6be432ea6781fe756aad32d62a88275bbe6ffefb9f58228f55f220f8ef`，锁定的 ignored
helper SHA-256 为 `98964fc5d73cc57a580fa2a810ef251ff7aa2b192d79d019299bac8909168ce5`；input lock 为
`60ddd80cde85a23b2ed4db7f6d20a86d73a606f44887892e5a72dab3db9a795b`，package manifest 为
`636425baaca113b29cf82dbf074f4facf3f00772cec8134b166c812b41c1b710`。schema v3、capture
selftest、v142 logic tests、native smoke、restricted token/Low Integrity/ACL audit、x64、静态
CRT 与 PE/API/CRT 均为 `PASS`，`candidate_eligible=true`。上述结论仅为 Win10 构建闭包；
v21 Win7 仍为 `NOT_PERFORMED`，`A4-20260810-000003` 仍是 `RECOVERY_REQUIRED`。人工 recovery
复核和新签名租约完成前不得连接 Win7。完整 SPIKE_02 继续为
`PARTIAL / NO_GO_FORMAL_GAPS`，不解除生产 Runner、交互终端 Gate 或强网络隔离声明。

随后在最终整合 commit `20b4480ab2ea4f53b3ccee7df39e47755ed92102` 上签发唯一 Ed25519
租约 `A4-20260810-000004`，绑定 artifact manifest
`e05af8860c8a4982e9b2c01eb7256a9936c84bbb64eadd02f77041d96fb51136` 和上述 v21 helper。
Win7 SP1 x64 build 7601 上 REM-D01～D08、C01～C07 的九个必需用例、上传与九份回收证据
双向 SHA-256、Bitvise/22 端口及后置零 D-013 残留全部通过。C03 可信 suspended-child token
观测证明 restricted primary、源派生 SID 集合精确一致、用户/World 存在、Administrators 不存在、
Low Integrity `S-1-16-4096 / 4096`；ACL label 与 deny ACE 均完成 apply/verify/rollback。
ADR-0065 协调器 grade 为 `WIN7_PASS / PASS`，租约已 `RELEASED`，活跃租约为 0。

该结果正式解除 D-013 containment helper 的 Win7 Gate，但 C05 仍只记录 loopback TCP/UDP/DNS
可达，正式企业/网络证据为 `ENVIRONMENT_MISSING`；终端 T01～T05/N01～N05 仍未执行。因此完整
SPIKE_02 继续为 `PARTIAL / NO_GO_FORMAL_GAPS`，不解除生产 Runner、交互终端 Gate 或强网络
隔离声明。正式派生记录为 `docs/acceptance/A4-D013-20260810-000004.json`，原始证据保存在 Git 外。

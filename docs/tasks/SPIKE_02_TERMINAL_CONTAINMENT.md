# SPIKE_02 — 终端与 Containment 验证（TERMINAL_CONTAINMENT）

> 实现前必读：`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、`docs/PERFORMANCE_BUDGET.md`、
> ADR-0030/ADR-0031（Proposed）、本文档。不占用 ADR-0012 阶段编号（ADR-0034）。

## 0. 实现授权（ADR-0011 / C14）

### 0.1 状态块

```
Status: DRAFT
Task Type: SPIKE
Target Branch: spike/02-terminal-containment
Phase-Gate: NOT_APPROVED
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Pending PC-003 ruling and Win7 SP1 x64 machine availability
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
2. **交互终端**：winpty 0.4.3 + node-pty 0.10.0（D-011，按 Electron 22 ABI 重编译）
   在 Win7 的终端保真度，以及 C19 注入负向防护。

## 2. 非目标

- 不实现生产 Runner/Policy/审批 UI；helper 接口只需覆盖验证所需子集（argv + JSON over stdio）。
- 不验证 Git（SPIKE_03）；不做性能预算 #4 以外的性能测量。

## 3. Runtime Profile（C15）

- helper：C++ x64，MSVC v142（D-017），静态链接 CRT 或登记 VC Runtime；仅 Win32 API。
- winpty 0.4.3 官方 release x64 + node-pty 0.10.0（Electron 22 ABI 重编译产物）。
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

## 9. 验证记录（占位，验收时填写）

```
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Target environment unavailable
```

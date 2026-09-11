# Win7 内存基线测量方案（A9 产品分进程归因）

日期：2026-09-10
文档状态：READY_FOR_ASSIGNMENT（只读测量方案；**不是**实现授权，**不是**验收任务书）
来源基线分支：`codex/ui-optimization`
保存分支：`codex/a9-win7-memory-baseline`
适用目标：Win7 SP1 x64（build 7601）普通用户非提升账户
配套脚本：`scripts/mvp_acceptance/a9_win7_memory_baseline.ps1`

## 1. 目的与边界

用户报告"Win 内存占用还是很高"。当前 `docs/PERFORMANCE_BUDGET.md` 的四条内存预算——#2（Desktop Shell
常驻 ≤300MB）、#3（Agent Core 常驻 ≤180MB）、#4（Runner 每实例 ≤60MB）、#10（应用总内存 ≤55% 物理内存）
——状态**全部是 `未实测`**，且 ADR-0033 仍为 `Proposed`。因此"高"目前**没有正式对照基准**，直接进入优化
无法证明改善。

本方案的唯一目的：在 Win7 实机上取得一次**可追溯、可复算、按进程归因**的内存基线，用于后续定位与回归对比。

明确边界：

- 本方案**不修改任何产品代码**、不 rebuild、不改白名单、不新增运行时开关。
- 本方案**不签发** Win7 PASS / Alpha PASS / 任何候选验收结论；`PERFORMANCE_BUDGET` 的状态位仍由负责人
  依据正式任务书裁决，不得由本方案直接填写。
- 采样**不构成** WIN7-27 / WIN7-28 的实机验收；也不得与正式验收跑在同一时间窗内互相污染。
- 未形成候选前取得的数字只能作为"开发趋势参考"，**不得**标注为任何候选的内存结论。

## 2. 预算口径映射

| 预算 | 口径 | 对应进程类别（脚本 category） | 取值方式 |
|---|---|---|---|
| #2 | Desktop Shell 常驻内存 | `shell.main` + `shell.gpu` + `shell.renderer` 合计 | 空闲会话 10 分钟窗口的**均值**与峰值 |
| #3 | Agent Core 常驻内存 | `core.utility` | 同上，含 SQLite 页缓存 |
| #4 | Runner/终端宿主每实例 | `runner.helper` / `runner.shell-child` / `runner.tool` | 长输出命令期间**峰值**，按单实例口径拆分 |
| #10 | 应用总内存（全部进程合计） | 全部 A9 进程（排除 `env.*`） | 最重负载场景**峰值** / `TotalVisibleMemorySize` |
| 附加 | 退出残留 | 全部 A9 进程 | 产品退出后 5 分钟内必须恒为 0 |

说明：`env.*`（如 `BvSshServer.exe`）属于环境噪声，单独记录但**不并入** A9 合计，避免把验收通道自身的内存
算到产品头上。

## 3. 环境前置（每轮开始前逐项确认）

- [ ] 候选身份已记录：候选 ZIP SHA-256、manifest SHA-256、源码提交号；未形成候选时明确标注"无候选"
- [ ] Win7 为 SP1 x64 build 7601；账户为**普通用户非提升**
- [ ] 已记录 PowerShell 版本（`$PSVersionTable`），确认脚本可执行
- [ ] 采样脚本自身 SHA-256 已记录（证据必须可追溯到脚本版本）
- [ ] 关闭屏保、睡眠、自动更新、索引重建等后台活动；电源方案固定并记录
- [ ] 记录非 A9 基线噪声：静默 10 分钟，仅采集系统与 `env.*` 进程
- [ ] 每个场景开始前确认**上一次 A9 进程已全部退出**（残留为 0），否则场景作废
- [ ] 采样期间不在同一机器上同时执行其他 Electron/Node 构建或测试

## 4. 场景清单

| 编号 | 场景 | 操作要点 | 时长 | 对应预算 | 状态 |
|---|---|---|---|---|---|
| S0 | 空载基线 | 不启动产品，静默采样 | 10 min | 环境噪声 | 待执行 |
| S1 | 冷启动后空闲 | 双击启动 → 会话可输入 → 不发起任务 | 10 min | #2 #3 #10 | 待执行 |
| S2 | 单轮只读任务 | 一次 `read` 中等文件，等待轮次终结 | 至终态 +2 min | #2 #3 | 待执行 |
| S3 | 长输出命令 | 前台 Shell 输出 ≥5000 行（或 2 秒 tick ≥30 次） | 峰值覆盖全程 | #4 #2 | 待执行 |
| S4 | 大事件量会话 | 多轮工具调用，累计事件 ≥1000（分 1000/3000 两档） | 至终态 +2 min | #2 #10 | 待执行 |
| S5 | 翻页加载更早记录 | 反复点击"加载更早记录"至控件耗尽或 5 页 | 5 min | #2 | 待执行 |
| S6 | 并发 2 任务 | 同工作区并发 2 个长任务 | 至终态 | #9 #10 | 待执行 |
| S7 | 退出后残留 | 正常关闭窗口后继续采样 | 5 min | 附加 | 待执行 |
| S8 | 重启恢复后 | 重启产品，恢复对话并渲染历史 | 至恢复完成 +2 min | #2 #3 | 待执行 |

S4 构造提示（来自既有经验）：批量轮次必须使用**互不相同的只读参数**（例如 `search pattern:'probe-<i>'`）；
重复相同工具调用会在第 5 次左右被 agent loop 守卫提前终止，无法堆出所需事件量。

## 5. 采样方法

- **采样间隔**：默认 5 秒；S3 这类短时峰值场景可降到 2 秒。
- **采样接口**：`Get-WmiObject Win32_Process`（非提升用户可用）+ `Win32_OperatingSystem`。
  不使用 `Get-Counter`，因为本地性能计数器在普通用户下常因权限不可用。
- **进程归因**：先定位无 `--type=` 参数的 `electron.exe` 主进程作为根，再按 `ParentProcessId` 构造
  后代集合；只有祖先链上有根进程的进程才计入 A9 合计。分类规则：

| 类别 | 判定 |
|---|---|
| `shell.main` | 根 `electron.exe` |
| `shell.gpu` | 命令行含 `--type=gpu-process` |
| `shell.renderer` | 命令行含 `--type=renderer` |
| `core.utility` | 命令行含 `--type=utility`（Core utilityProcess） |
| `shell.other` | 含其他 `--type=` |
| `runner.helper` | 名称含 `helper` |
| `runner.shell-child` | `cmd.exe` / `powershell.exe` |
| `runner.tool` | `git.exe` / `node.exe` 等工具子进程 |
| `a9.unclassified` | 其他 A9 后代 |
| `env.other` | 非 A9 进程（默认 `BvSshServer.exe`），**不计入 A9 合计** |

- **三点取值**：每个场景记录"首屏可交互"、"稳态窗口"、"峰值"三个时间点；预算数值取相应窗口的
  均值或峰值，并在报告中写明窗口边界。
- **字段**：`ws_bytes`（工作集）、`private_bytes`（私有字节 / PageFileUsage）、`peak_ws_bytes`（峰值工作集）、
  句柄数、线程数、CPU 秒。

## 6. 脚本用法

```powershell
# 每个场景单独一次采样；ASCII 场景编号，OutDir 可含中文
powershell -ExecutionPolicy Bypass -File .\a9_win7_memory_baseline.ps1 `
  -Scenario S1 -Label cold-idle -OutDir "C:\<验收证据根>\memory-baseline\A9-MEM-BASELINE-20260911-01" `
  -IntervalSeconds 5 -DurationSeconds 600
```

输出文件（均为 ASCII 内容，UTF-8/ASCII 无 BOM）：

| 文件 | 内容 |
|---|---|
| `samples.csv` | 逐样本逐进程：`run_id, scenario, label, ts, elapsed_s, pid, ppid, category, name, ws_bytes, private_bytes, peak_ws_bytes, handles, threads, cpu_s` |
| `system.csv` | 逐样本系统内存：`run_id, ts, elapsed_s, total_kb, free_kb, commit_total_kb, commit_free_kb` |
| `summary.csv` | 按类别与 A9 合计聚合：`run_id, scenario, metric, category, n, min, median, max` |
| `meta.txt` | 机器、OS、PowerShell 版本、参数、脚本 SHA-256、候选身份占位 |

脚本只读、不启停产品、不修改系统配置；用 `-Scenario` 区分场景，同一 `-OutDir` 下可累积多个场景，
最后统一汇总。

脚本自身哈希（编辑后必须重新登记）：`0f729f6bd8f8824024a18e9b2fb0c2f21a18918fb8e2c1ed2202eabbdc1df2e8`
（`scripts/mvp_acceptance/a9_win7_memory_baseline.ps1`，ASCII-only、UTF-8 无 BOM、LF）。
脚本刻意只用 ASCII 字符：Windows PowerShell 5.1 / 2.0 会把无 BOM 的 UTF-8 当 ANSI 读，含中文的字面量会乱码；
因此 `-Scenario` 被限制为 `A-Za-z0-9_.-`，CSV 表头也用英文，中文口径说明只保留在本文件中。

## 7. 证据落盘与命名

- 建议 kit id：`A9-MEM-BASELINE-<YYYYMMDD>-<NN>`；目录置于 Win7 验收证据根下的 `memory-baseline/<kit-id>/`。
- 每个场景目录保留原始 CSV 与 `meta.txt`，**不得只保留汇总**。
- 采样脚本 SHA-256、候选 ZIP/manifest SHA-256 必须与 CSV 一同归档，否则数据不可追溯。
- 回传仓库前需负责人确认落盘位置；本方案不授权把原始 CSV 提交为产品证据。

## 8. 判读规则

1. 先看**归因**再看总数：分别报 `shell.*` 合计、`core.utility`、`runner.*` 峰值，再报 A9 合计占物理内存比例。
2. 每个数字必须绑定预算编号（#2/#3/#4/#10），不得给出无口径的"内存占用"。
3. 区分"运行中高"与"退出后仍高"：S7 不为 0 时，结论应指向残留进程/进程树回收，而非产品堆。
4. 区分稳态与峰值：#2/#3 用稳态均值，#4/#10 用峰值，不得混用。
5. 与预算比较时明确标注该预算状态仍为 `未实测`、ADR-0033 仍为 `Proposed`，因此比较结果只是**参考**，
   不构成达标/未达标裁决。

## 9. 已知局限

- 非提升用户下无法使用本地性能计数器，缺少 `\Memory\Committed Bytes` 等计数器口径（已用 WMI 近似替代）。
- 采样本身依赖 WMI，会拉起/复用 `WmiPrvSE.exe`，带来一个小的常量内存开销；它既不计入 A9 合计，
  也会轻微影响系统可用内存读数，因此系统侧数字只能作横向对比，不作绝对值承诺。
- 脚本按进程祖先链归因；若产品进程被 Job Object 回收后重建，或存在跨用户/服务态进程，归因可能不完整。
- 采样为轮询快照，2～5 秒间隔可能错过极短峰值；S3 需单独收紧间隔。
- 单机、单次采样，不具备统计显著性；重复 3 次取中位数应作为后续要求。
- 若产品进程被 Job Object 回收后重建，或存在跨用户/服务态进程，祖先链归因可能不完整。
- Electron 22 / Node 16 / Chromium 108 均已 EOL，行为差异不得外推。

## 10. 后续动作

1. 依据本次基线确认主要贡献者，据此判断优化落点（Renderer 事件投影 / DOM / Core 缓冲 / 进程回收）。
2. 任何产品代码改动须另立任务书并取得 `APPROVED_FOR_IMPLEMENTATION`；A9-16 目前为
   `PLANNED_NOT_AUTHORIZED`，不得借用。
3. 若优化涉及 Chromium 启动开关等新运行时表面，按 `AGENTS.md` §4 与 `docs/WIN7_CONSTRAINTS.md` §6
   登记版本、来源、哈希、风险并新增 ADR，且必须实机复测。
4. A9-16 的 Shell 运行中输出会显著放大事件量，实施设计必须显式定义 chunk→event 的合并/节流粒度，
   否则本方案的 S3/S4 基线会在 Alpha 2 直接失效。

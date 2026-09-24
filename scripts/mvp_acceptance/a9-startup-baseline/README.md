# A9-17 启动 A/B 执行包（Win7 / Win10）

用于在 Windows 主机上执行 A9-17「优化前 vs 优化后」的启动与内存对照测量。
本包**只做测量编排**，不产出验收结论，也不改变任何 `PERFORMANCE_BUDGET` 状态格。

> 本包在 macOS 上只完成了 Node 侧的语法检查、夹具验证与静态检查。**PowerShell 侧未执行**
> （开发机无 PowerShell），与 A9-17 任务书 §5 的既有说明一致。首次实机运行前必须先跑 `-DryRun`。

## 1. 组成与职责

| 文件 | 运行者 | 职责 | 本机可验证性 |
|---|---|---|---|
| `run-startup-baseline.ps1` | Windows PowerShell | 编排：播种 → 启动产品 → t=0 启动采样器 → 记录 run 清单 | 仅静态检查（未执行） |
| `driver-startup.cjs` | Electron | 记录窗口创建/首屏就绪等主线程时间戳 + Electron 自报进程内存 | `node --check` + 与开发机同源实现 |
| `seed-history.cjs` | Electron | 生成 0 / 1,000 / 5,000 轮合成历史 | `node --check` |
| `analyze-startup-baseline.mjs` | Node | 计算稳态窗口中位数、前后差值与区间重叠判定 | 已用夹具实测通过 |

采样本身**不重写**：复用同目录上一级的 `a9_win7_memory_baseline.ps1`（只读 WMI 采样器，
含目标根绑定、PID 复用防护、未知值不记零、`-TestMode` 自检）。

**为什么播种也放在 Electron 里**：产品的 `better-sqlite3` 是按 Electron ABI 构建的。用普通 Node
播种会加载 ABI 不匹配的原生模块，并**静默降级**为 `A9_PERSISTENCE_DIAGNOSTICS` 受限诊断模式
（而不是报错）。开发机上就踩过这个坑：PATH 中的 Node 22 与仓库根的 Node 20 构建不匹配。

## 2. 前置条件

- Windows 7 SP1 x64 或 Windows 10，**普通用户、非提升**（采样器会把 `elevated` 写进 `meta.txt`）。
- 两个候选工作树，**使用同一个 Electron 可执行文件**（由 `-ElectronExe` 强制指定，两侧共用）。
- 每个候选工作树需要各自可用的 `node_modules` 与已构建的 `src/{core,gateway,state,workspace,runner,git-adapter,shell}/dist`
  （`dist` 全部被 gitignore，`git archive` 不会带出）。
- 不需要提权、不安装、不改注册表/服务/网络/系统设置；脚本只写 `-OutDir`。

## 3. 准备两个候选

```powershell
# 优化后：当前工作树（含 A9-17 改动）
git -C <repo> status --short          # 应看到 A9-17 的 18 改 + 6 新增

# 优化前：从改动前的提交导出（A9-17 改动未提交，故 HEAD 即优化前）
mkdir D:\cand\before
git -C <repo> archive 7d06789 | tar -x -C D:\cand\before
```

两个树都要完成构建并各自可用 `node_modules`。编排脚本会在开始时计算两侧 A9-17 关键文件的
SHA-256；**若两侧指纹相同会直接拒绝运行**，避免把"同一个树跑两遍"当成 A/B 结论。

## 4. 执行

先干跑，确认计划与采样器自检：

```powershell
powershell -ExecutionPolicy Bypass -File .\run-startup-baseline.ps1 -DryRun `
  -BeforeRepo "D:\cand\before" -AfterRepo "D:\cand\after" `
  -ElectronExe "D:\cand\after\node_modules\electron\dist\electron.exe"
```

正式执行（热启动，三档历史，每档两侧各 3 次，交替排列）：

```powershell
powershell -ExecutionPolicy Bypass -File .\run-startup-baseline.ps1 `
  -BeforeRepo "D:\cand\before" -AfterRepo "D:\cand\after" `
  -ElectronExe "D:\cand\after\node_modules\electron\dist\electron.exe" `
  -OutDir "D:\a9-ab\A9-AB-20260913-01" `
  -HistoryCounts 0,1000,5000 -Repetitions 3 -Thermal Warm `
  -DurationSeconds 60 -IntervalSeconds 1 `
  -CandidateNote "before=7d06789 after=working-tree"
```

**冷启动**：脚本无法强制冷启动，也不应该强制。冷启动由操作者控制——每次重启后只跑一次，
追加到同一个 `-OutDir`：

```powershell
powershell -ExecutionPolicy Bypass -File .\run-startup-baseline.ps1 ... -Repetitions 1 -Thermal Cold
```

冷/热必须写进 `runs.csv` 的 `thermal` 列并在分析时分列，不得混算。

## 5. 分析

```powershell
node analyze-startup-baseline.mjs "D:\a9-ab\A9-AB-20260913-01" --settle-from=45000 --settle-to=59000
```

输出每个历史档的前后中位数、分进程构成、窗口创建与首屏就绪差值、以及**两侧区间是否重叠**。
区间重叠时不构成改进结论。

## 6. 必须遵守的测量规则

1. **稳态窗口不得短于历史规模允许的长度。** 开发机实测：20–34 秒窗口对 0 / 1,000 轮足够，
   但对 5,000 轮**优化前**侧严重低估（608 MiB vs 60 秒窗口的 947 MiB）。默认用 45–59 秒，
   且只在 60 秒运行内使用；历史规模更大时必须同步延长运行时长。
2. **不同窗口长度的数字不得混用**，也不得与开发机 `app.getAppMetrics()` 口径的数字互相换算。
3. 采样器启动**先于**产品启动（编排脚本已如此安排），以覆盖产品 t=0；采样器按 PID 惰性绑定
   目标根，先启动是安全的。
4. **同一时刻只能有一个产品实例在跑。** 采样器按可执行文件路径识别目标根，若同时存在第二个
   同名进程会直接以「target root binding is ambiguous」失败——这是有意的 fail-closed。
5. **首次运行前必须核对 `-DryRun` 打印的计划**：重复之间场景与变体顺序必须真的交替。
   注意 `[array]::Reverse` 是原地修改，直接反转参数数组会把顺序泄漏到后续重复，静默破坏交替。
6. 每档每侧至少 3 次，重复内两侧背靠背、场景与变体顺序逐轮交替。
7. 中途出现 `marks.json` 缺失的运行，其时间指标不可用，但内存指标仍有效——分析器会分别处理。

## 7. 已知限制（不得据此下结论）

- **启动峰值**：Windows 采样器是外部进程，理论上可覆盖启动窗口，但 1 秒间隔会漏掉更短的峰值；
  需要峰值时必须单独降低 `-IntervalSeconds` 并说明代价（WMI 查询本身有开销）。
- 工作集合计会重复计算共享页，不是去重物理占用。
- 本包不覆盖打包产品的真实 UI 旅程；`driver-startup.cjs` 走**源码入口**，用于让两侧差异
  只来自 A9-17 代码本身。打包模式的运行只能取内存、取不到时间戳。
- 本包**不构成 Win7 PASS、不构成 RC、不改变任何 `PERFORMANCE_BUDGET` 状态格**，也不授权发布。
  实机执行需要其自身的授权，且必须绑定源码与工件的 SHA-256。

## 8. 证据目录结构

```
<OutDir>/
  ab-meta.txt          两侧路径、指纹、参数、宿主、PowerShell 版本
  runs.csv             run_id,variant,scenario,rep,thermal,marks_path,product_pid,started_at
  samples.csv          采样器逐进程样本（共享，按 scenario 列区分运行）
  system.csv           系统物理/提交内存
  summary.csv          采样器自身聚合
  meta.txt             采样器元数据（含 elevated、脚本 SHA-256）
  analysis.json        分析器输出
  <run_id>/            每个运行的 seed.json、marks.json、data/、workspace/
```

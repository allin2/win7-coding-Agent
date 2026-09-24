# A9-17 — 启动内存测量修正与启动路径优化

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: STARTUP_PERFORMANCE_HARDENING
Target Branch: codex/a9-alpha2
Source Baseline: 7d067890b1f54ab8bcde6bdbc5ea778d9e79c1ed
Target Version: 0.3.0-alpha.2
Phase-Gate: A9_17_IMPLEMENTATION_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0123
```

## 1. 授权与范围

负责人在本次对话评估后明确要求“实施”：修正测量工具，优化窗口前初始化、首屏串行工作、
历史恢复三个热点。授权本地实现、必要测试和开发机 Electron 验证；不提交、不推送、不部署，
不更改历史候选。A9-16 的完整 Review、实时 Shell 输出及布局重构仍不开放。

## 2. 实现合同

- 测量：统一 bytes，未知值不得记零；目标路径/PID/创建时间绑定，保留跨采样后代身份；
  区分 main（含 Core）与 Chromium utility；按时刻合计后统计，记录采样时长与毫秒时间。
  保留原始数据，短峰值/权限缺失/孤儿归因不确定时明确标识；修正不适用的并发场景。
- 启动：可信本地窗口先可显示；宿主初始化共享单一 Promise，IPC 等待就绪或明确失败，
  不因窗口先出现而开放未初始化的执行入口；关闭窗口时不得遗留后台初始化资源。
- 首屏：核心状态恢复与 Git/诊断/历史详情分离；后台加载失败有可重试反馈，不能阻塞输入，
  首次任务仍等待完整的权限、工作区锁和恢复检查。
- 历史：首屏返回有限的对话事实及明确分页信息，用户能加载更早记录；SQL 层限制读取，
  不只截短 DOM。模型上下文恢复独立于 UI 分页，不丢已有上下文和 Provider 边界。
- 保持 Schema IPC、Renderer sandbox/contextIsolation、TLS、DPAPI、checkpoint、撤销、
  审批与进程回收。原生输入哈希验证继续在使用前完成，不添加运行时依赖或 Chromium 开关。

## 3. 允许路径

- `scripts/mvp_acceptance/a9_win7_memory_baseline.ps1`
- `scripts/mvp_acceptance/test-a9-memory-baseline.ps1`
- `scripts/mvp_acceptance/a9-memory-baseline-tests.mjs`
- `scripts/mvp_acceptance/a9-startup-baseline/**`
- `src/shell/product/main.js`
- `src/shell/product/desktop-host.js`
- `src/shell/product/a9-agent-runtime.js`
- `src/shell/product/a9-product-ipc.js`
- `src/shell/product/preload.js`
- `src/shell/product/renderer/a9-workbench.js`
- `src/shell/product/renderer/workbench.html`
- `src/shell/product/renderer/a9-workbench.css`
- `src/shell/tests/product/**`
- `src/state/src/a9-persistence.ts`
- `src/state/tests/a9-persistence-contract.test.ts`
- 本任务对应文档、ADR、状态及任务索引。

## 4. 验证与结束条件

开发机：测量夹具覆盖单位、未知、PID 复用和退出后代；状态层分页覆盖多页、不重复、
最新结果稳定和旧上下文保留；Shell 覆盖启动等待/失败/关闭、历史回看、重试、正常任务。
完成受影响包 lint/build/定向测试、真实 Electron 启动及受影响 UI 交互、docs:check。
必要的故障注入必须使旧行为失败，不以源码字符串匹配代替真实行为。

Win7：同版本 Electron 最小窗口、产品空历史、产品真实历史三组；冷/热启动分别至少三次，
同机器/窗口/GPU/安全设置，记录首屏、可交互、首次发送、峰值和稳态。普通用户同候选验证
仍单独绑定源码与工件；未执行不声称降幅、内存达标或 Win7 PASS。

不增加新 Runtime Profile：仍使用 Electron 22.3.27/Node 16、D-013 v25、SQLite ABI 110；
采样使用既有 Windows PowerShell/WMI，只读访问，不提权、不安装、不修改系统设置。

## 5. 当前证据

本地实现已完成，开发机行为验证通过；任务保留实现授权状态，Win7 性能收益与正式候选验收为 NOT_PERFORMED。

- 状态层：57 项真实 SQLite 测试通过，含 65 条多页/同时间排序、畸形请求与旧投影一致性。
- Shell：99 项定向测试通过，含首帧前关闭、恢复期间关闭、IPC 等待/拒绝、分页重试与 Provider 惰性恢复。
- state/shell build、lint 与 docs:check 通过；git diff --check 通过。
- 开发机 Electron 22.3.27（macOS arm64，SQLite ABI 110）：完整五进程回归 86/86 PASS，报告位于
  `/tmp/a9-17-full-electron-smoke-recheck.json`，SHA-256：
  `81473e5b3bd45e814d7fb01dd4c37130cbb717a9912e899afa3b04b7658f2fa9`。
- 独立真实 UI 历史测试：初始 20 条，点击两次展开至 45 条，刷新后仍 45 条且无重复；截图已人工检查。
  证据：`/private/var/folders/3z/wj46qg4j2pn2fwgtccdj093m0000gn/T/a9-17-history-N4XClP/result.json`。
- 2026-09-24 文档整理注：上两条 `/tmp`、`/private/var/folders` 临时证据已被系统清理且未入库；仅 SHA-256 与本文记录可追溯。
- 测量脚本仅通过 Node 源码契约检查及静态审查；macOS 没有 PowerShell，新增 PS 行为夹具和 WMI 采样未执行。
  脚本 SHA-256：`61082726a2d6686ac020022e0174c6ea6eb0b746883e282d61b84718bd93dd95`。不可将源码检查当作 PowerShell 运行成功。
- Win7/Win10 执行包已按允许路径 `scripts/mvp_acceptance/a9-startup-baseline/**` 就绪，用于后续实机执行；
  采样本身复用既有只读 WMI 采样器 `a9_win7_memory_baseline.ps1`，本包只补编排、播种与对比分析。
  `run-startup-baseline.ps1`（编排，284 行）SHA-256 `6fd816ba…8239`；`driver-startup.cjs`
  SHA-256 `16fbbe1a…4c5e`；`seed-history.cjs` SHA-256 `cc587328…54c5`；
  `analyze-startup-baseline.mjs` SHA-256 `c6c1ebc8…83ea`；`README.md` SHA-256 `67fe97b0…2746`。
  Node 侧三项通过 `node --check` 与 ASCII 检查；分析器已用符合真实契约的夹具实测（稳态窗口两端
  强制、`env.other` 排除、UNKNOWN 排除并告警、跨重复聚合）。**PowerShell 侧未执行**：开发机无
  PowerShell，仅做 ASCII、PS 2.0 禁用构造与括号配平静态检查，不得视为运行成功；该静态审查已发现并
  修复一处真实缺陷（`[array]::Reverse` 原地修改参数数组，导致第 3 轮交替退化为与第 2 轮相同）。
  播种改由 Electron 执行以规避原生模块 ABI 不匹配导致的静默降级。该包不产出验收结论，不改变
  `PERFORMANCE_BUDGET`，实机执行需其自身授权并绑定源码与工件哈希。
- 优化前后 A/B 对比已完成（开发机，临时分析）：优化前侧由 `git archive HEAD` 导出（改动未提交，
  HEAD 即优化前），同一重复内两侧背靠背交替。稳态（60 秒窗口、空闲窗口 40–59 秒、各 2 次）：
  窗口创建 9,818/9,276/10,099 ms → 4,515/4,557/4,883 ms（约 −4.7～−5.3 s，各档区间不重叠）；
  空闲合计 0 轮 318.6 → 315.8 MiB（−0.9%，噪声内）、1,000 轮 471.3 → 333.1 MiB（−138.2 MiB，
  −29.3%）、5,000 轮 946.6 → 362.3 MiB（−584.4 MiB，−61.7%），收益几乎全在 Renderer。
  首屏就绪仅在 5,000 轮可判（−1,672 ms）；0/1,000 轮差值落在轮间波动内。该轮使用 Electron
  `app.getAppMetrics()` 口径且必须 `--no-sandbox`，与上文 `ps` RSS 口径不可交叉比较；20–34 秒
  空闲窗口对 5,000 轮优化前侧不足，不得沿用。详见
  [A9-17 优化前后开发机 A/B 对比](../reports/2026-09/a9_17_dev_ab_memory_2026-09-12.md)。

## 6. 限制与后续验证

开发机追加测量见 [A9-17 开发机内存实测](../reports/2026-09/a9_17_dev_memory_measurement_2026-09-12.md)：
Mac M4 / 16 GiB，两场景各三次，空历史空闲 RSS 合计中位数 321.5 MiB，1,000 轮合成历史为 340.9 MiB。
该轮仅有当前开发版本绝对占用，没有 `ps` RSS 口径的优化前基线；Win7 结论仍为 NOT_PERFORMED。
优化前后同口径基线已由 [A/B 对比](../reports/2026-09/a9_17_dev_ab_memory_2026-09-12.md) 补齐，
但口径为 Electron `app.getAppMetrics()` 且需 `--no-sandbox`，属非产品配置，不得与前一份的
RSS 数字合并或互相换算。

- 本轮削减首屏 JS/IPC/DOM 历史载荷并推迟可选工作；SQL 仍扫描和排序当前会话的元数据。
  A/B 已实测该残余成本：优化后 0 → 5,000 轮仍增长 46.5 MiB，其中 Main 进程 +33.9 MiB、
  Renderer +10.0 MiB，即数据库侧开销仍随历史增长，本优化未消除它。模型首次发送仍遵循原有
  20 个完整轮次及字符预算规则，不使用 UI 的 20 条分页结果替代模型恢复。
- Electron 固有进程底座、顶层模块导入和 checkpoint 安全恢复未移除；不承诺固定百分比内存下降。
- 首次完整回归发现历史驱动将新增对话按钮误认成事件按钮；现已分离选择器，驱动先经产品按钮展开
  对话事实再验证事件分页。复测保持原事件身份/终态检查，86 项全部通过。
- 原生 SQLite 测试副本由仓库现有 8.7.0 源码和缓存 Electron 22.3.27 头文件在临时目录构建，
  未改动 node_modules、依赖锁、正式候选。测试证据和临时副本保留；未提交、未推送、未部署。
- 下一步按测量计划在同一 Win7 普通用户环境做三组冷/热启动对照；当前只有开发机、非产品配置下的
  相对收益结论，没有 Win7 收益、内存达标或绝对占用结论。

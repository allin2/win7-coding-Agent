# A9-17 / A9-18 需求与遗留项承接台账

> 2026-09-25 建立，基线 `codex/a9-alpha2` @ `a884fff`。目的：A9-17 与 A9-18 的需求、已完成项、遗留项和已知缺陷在主线上都有登记，
> 不因 A9-18 工作树未提交而丢失。本台账只登记，不授权实现（AGENTS.md C14）；每一项的实现仍须由状态为
> `APPROVED_FOR_IMPLEMENTATION` 的任务书承接。条目关闭时在“承接”列写明任务书与提交，不删除行。

## 1. 来源与现状

| 项目 | A9-17 启动与内存优化 | A9-18 运行时端到端内存优化与恢复对账 |
|---|---|---|
| 任务书 | [A9-17](../tasks/A9_17_STARTUP_MEMORY_OPTIMIZATION.md)（主线） | `docs/tasks/A9_18_COMPREHENSIVE_MEMORY_OPTIMIZATION.md`，**仅存在于工作树** |
| 代码位置 | 已由 `3437bc1` 并入 `codex/a9-alpha2`（PR #8） | 工作树 `win7-coding-agent-memory-optimization`，分支 `codex/a9-memory-optimization`，基线 `7d06789`，**全部未提交** |
| 状态 | `APPROVED_FOR_IMPLEMENTATION` / `A9_17_IMPLEMENTATION_AUTHORIZED`，开发机实现与 A/B 完成 | 工作树内 `APPROVED_FOR_IMPLEMENTATION` / `A9_18_REPAIR_ROUND`；两份独立审查 `FAIL_FIX_REQUIRED` 后返修 8 轮，最后活动 2026-09-14 00:49 |
| Win7 | `NOT_PERFORMED` | `NOT_PERFORMED` |

A9-18 工作树内容（2026-09-25 盘点）：31 个已修改文件、32 个未跟踪项，含任务书、ADR 草案（编号 0124～0130）、
13 份 A9-18 报告、3 份早期评估、测试与执行包。另有 `src/core/src/XXZHIuFY`、`XXaKU6eX` 两个疑似编辑残留文件。
独立审查原件在主工作树 `outputs/a9-18-*`（`outputs/` 被忽略，未入库）。该工作树内 `docs:check` 当前不通过。

## 2. A9-17 遗留项

| ID | 遗留项 | 现状 | 承接 |
|---|---|---|---|
| K17-1 | Win7/Win10 实机采样：最小窗口、空历史、真实历史三组，冷/热启动各 ≥3 次 | `NOT_PERFORMED`；执行包在 `scripts/mvp_acceptance/a9-startup-baseline/**` | 待授权执行 |
| K17-2 | PowerShell 采样脚本与行为夹具从未真正执行（macOS 无 PowerShell） | 只做过静态检查 | 随 K17-1 在 Windows 上先跑夹具 |
| K17-3 | 两份开发机证据（`/tmp`、`/private/var/folders`）已被系统清理 | 只剩 SHA-256 | 不可恢复；Win7 采样须入库保存原始数据 |
| K17-4 | 数据库侧内存仍随历史增长：0→5,000 轮时 Main 进程 +33.9 MiB，SQL 仍扫描排序整个会话的元数据 | 未解决 | A9-18 P0-2 的目标，见 §3 |
| K17-5 | **预算定义矛盾**：`PERFORMANCE_BUDGET.md` #3 按 ADR-0028 定义为“独立 utilityProcess 中的 Agent Core”，实际 Core 运行在 main；A9-17 测量计划把 #3 映射到 `shell.utility`，按现口径会测到空进程 | 主线未处理；A9-18 X03 仅在工作树里改了预算与计划 | 需新 ADR 重订 #3 口径，须在 K17-1 采样**之前**完成 |

## 3. A9-18 需求（原任务书 §2 摘要）

| ID | 需求 | 工作树实现情况（自报，未经再审） | 主线现状 |
|---|---|---|---|
| P0-1 | Checkpoint 懒对账：启动只对 SQLite 中断态、缺 checkpoint 投影的 Turn 定向读 manifest；缺失/损坏/跨工作区/未知分别记录；缓存限 50 条 + 16 MiB，只淘汰已持久化对象，不恢复已撤销授权，秘密集合扩大即失效 | 已实现；R06、R07 关闭 | **未实现**；启动仍全量枚举并加载 manifest（R06 见 §4） |
| P0-2 | 历史查询与模型上下文恢复有界化：schema v5 `a9_conversation_facts` 投影表与索引、消除全会话物化、迁移前 VACUUM INTO 备份与回滚、旧程序拒绝新版本、流式 SHA-256 备份、投影缺失不得伪装成空历史、模型恢复 newest-first 预算游标（保持 20 轮 / 32,000 字符规则） | 已实现，schema 已到 v6（投影就绪表）；R01～R03、R13 关闭 | 主线 schema v4；只有 A9-17 的 UI 分页 |
| P0-3 | Checkpoint 列表与快照瘦身：SQL 层最近 50 条 + 总数 + 稳定游标；`a9.checkpoint.list` 走轻量 IPC；快照同样限 50 条；保留会话/工作区绑定 | 已实现；R09、R12 关闭 | **未实现**；`listCheckpoints` 无上限，快照全量带出 |
| P0-4 | 模型输出端到端上限：单响应 1 MiB、单工具参数 512 KiB、单 Turn 2 MiB；流式超限停止积累并带 `truncated` 元数据；截断的工具参数绝不执行；各终态清理；跨 chunk 与截断点脱敏 | 已实现；R04、R05 关闭 | **未实现**；主线无输出上限 |
| P2-1 | `blockedRequests`/`inspectorEvents`/`turnEvents` 数量与字节上限，DOM 窗口化并释放引用 | 已实现（R09） | 未实现；A9-16/A9-19 已改动同一渲染文件 |
| P2-2 | 受控重载工作台：仅空闲态开放，先确认草稿落盘，不重发任务 | 已实现（R08） | 未实现 |
| P2-3 | 早期 `Menu.setApplicationMenu(null)` 并验证文本框快捷键 | 已在 `main.js` 实现；快捷键验证未核实 | 未实现 |
| P2-4 | 测量 `gateway`/`gitAdapter` 懒加载成本 | 仅有评估报告 `a9_main_process_bundle_assessment.md`，其数字已按 R11 撤回为待验证假设 | 未实现 |
| P2-5 | 同源实验矩阵：GPU/网络/SQLite pragma 开关，未知标签 fail-closed，生效值读回（R10） | 已实现；Win7 A/B 未做 | 未实现 |
| RL | 红线：sandbox/contextIsolation/CSP/Schema IPC/TLS/DPAPI/脱敏/目标绑定审批/checkpoint/取消/进程回收不变；禁止 single-process、in-process-gpu、生产 `--no-sandbox`、V8 堆硬上限、新运行时依赖 | — | 承接任务必须原样继承 |

审查与返修索引：R01–R13、X01–X03（统一审查）、D-1～D-7（遗留缺陷分析）、R8-1～R8-4（返修轮 8 自查）。
R01–R13 与 D-3～D-7 在工作树内自报已关闭，**轮 8 之后没有独立复审**。

## 4. 影响主线的已知缺陷

| ID | 缺陷 | 主线状态 | 承接 |
|---|---|---|---|
| R06 | 启动恢复中 `loadCheckpoint` 遇到缺失 manifest 返回 `undefined` 而不抛异常，`a9-agent-runtime.js:640-642` 仍把该 Turn 计入 `validTurnIds`。主线上候选 Turn 来自 `listPersistedTurns()` 对现存 manifest 文件的枚举（`checkpoint-manager.ts:722-727`），故只有“枚举后、读取前文件被删除”的竞态可达；主要问题是启动全量枚举并加载全部 manifest（P0-1） | 存在于 `a884fff`，可达性低（代码核查，未运行复现；早于 A9-17） | 随 P0-1 修复：`undefined` 按缺失记录，不计入有效集 |
| D-1/D-2、R8-1～R8-4、ADR-0130 | Git 外部写确认分类器绕过、验证记账旁路、超长命令 fail-open | 存在 | [A9-20](../tasks/A9_20_GIT_CONFIRMATION_CLASSIFIER_HARDENING.md)、ADR-0137 |
| R05 类 | 模型输出无上限（主线没有截断，因此也没有静默截断问题；风险是内存无界） | 存在 | 随 P0-4 |

## 5. 治理问题（待负责人裁决）

1. **保全**：A9-18 工作树未提交，删除工作树或误操作即全部丢失。建议先在其自身分支 `codex/a9-memory-optimization` 上做一次
   快照提交，只保全、不合并、不推送；两个残留文件与构建产物不纳入。
2. **ADR 编号冲突**：工作树 ADR-0124～0130 与主线已接受的同号 ADR（A9-16 授权与 WIN7-29～34 候选换发）重叠；承接时须按主线顺序重新编号，
   原编号只在工作树快照内作为历史引用。
3. **承接方式**：工作树基线落后 alpha2 41 个提交，与主线有 13 个 `src/` 文件重叠。建议不整体合并，按 P0-1+R06、P0-2、P0-3、
   P0-4、P2 拆成若干新任务，在当前 alpha2 上重新实现，以工作树代码与测试为参考，并以 §3 需求和审查项作为验收输入。
4. **优先级建议**：K17-5 → P0-4 → P0-1+R06 → P0-3 → P0-2 → P2；K17-1 采样在 K17-5 后即可进行，与各 P0 并行。

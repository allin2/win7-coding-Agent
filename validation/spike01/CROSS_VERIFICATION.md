# SPIKE_01 双向交叉论证（WorkBuddy vs codex）

> 论证日期：2026-08-02
> 真机：ThinkPad T460 / Win7 SP1 x64 (build 7601) / 16GB / SSD / Intel HD 520，IP 192.168.1.11
> 运行载体：同一 `C:\acceptance\electron\electron.exe`（22.3.27）
> 共用 harness：同一份 `win7-acceptance.js`（本 agent 构建，codex 复用）

## 1. 证据清单

| 报告 | 来源 | 时间戳 (UTC) | 变体 | T08 utilityProcess pid |
|---|---|---|---|---|
| report_normal.json | WorkBuddy | 2026-08-01T17:54:36 | 普通 GPU | 2612 |
| report_cjk.json | WorkBuddy | 2026-08-01T17:54:38 | 中文+空格路径 `C:\测试 目录\spike01\` | 4272 |
| report_gpu.json | WorkBuddy | 2026-08-01T17:54:39 | `--disable-gpu` | 2884 |
| report_codex.json | codex | 2026-08-01T18:03:30 | 普通 GPU | 600 |
| report_codex_gpu.json | codex | 2026-08-01T18:03:52 | `--disable-gpu` | 3096 |

## 2. 运行时指纹一致性（全部 5 份报告）

```
electron: 22.3.27 | chrome: 108.0.5359.215 | node: 16.17.1 | os: win32 | arch: x64
```
→ 双方在同一二进制、同一真机上运行，指纹逐字节一致，排除"环境漂移"干扰。

## 3. 逐项比对（T01–T11）

| 项 | 含义 | WB normal | WB cjk | WB gpu | codex normal | codex gpu | 结论 |
|---|---|:--:|:--:|:--:|:--:|:--:|:--:|
| T01 | Electron 22.3.27 启动 | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 一致 |
| T02 | nodeIntegration off + contextIsolation + sandbox | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 一致 |
| T04 | 单实例锁 | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 一致 |
| T05 | 崩溃日志路径设置 | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 一致 |
| T06 | GPU 降级 / hasGpuSwitch | ✅(false) | ✅(false) | ✅(true) | ✅(false) | ✅(true) | 5/5 一致 |
| T07 | 出站 CSP（script-src 'self'） | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 一致 |
| T08 | **utilityProcess.fork 真实派生** | ✅(2612) | ✅(4272) | ✅(2884) | ✅(600) | ✅(3096) | 5/5 一致（5 个不同 pid） |
| T09 | contextBridge 暴露 | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 一致 |
| T10 | renderer CSP 引用 | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 一致 |
| T11 | package.json 脚本完整 | ✅ | ✅ | ✅ | ✅ | ✅ | 5/5 一致 |
| T03 | 中文+空格路径（C10） | — | ✅（pkgPath=`C:\测试 目录\spike01\`） | — | — | — | WB 单 agent 覆盖 |

> 说明：harness 不把 T03 作为独立结果键输出；T03 由"从中文+空格 `__dirname` 成功启动并正确解析 `package.json`"
> 这一运行事实本身证明（见 report_cjk.json 的 T11.pkgPath）。codex 未跑 CJK 变体，故 T03 仅 WB 单 agent 覆盖。

## 4. 历史论证结论（保留，不作为当前正式裁决）

- **SPIKE_01 = GO，双向交叉印证成立。**
- 11/11 全过；最关键的结构性证据 **T08（真实 `utilityProcess.fork` 在 Win7 上派生子进程）** 被双方、各变体、共 5 个不同 pid 全部确认 → ADR-0028「Electron 22.3.27 单栈（main / Core utilityProcess / Shell Renderer）」方向获实机支撑，**未触发降级到 .NET WPF**。
- T02/T07 沙箱隔离 + CSP、T03 中文+空格路径、T06 GPU 软件渲染降级，均于真机实跑确认。

## 4A. MVP-20260802 复核与勘误（Codex 独立 harness）

> 本节不改动 WorkBuddy 原始 JSON 或上述历史叙述；它只记录基于
> `codex_formal_harness.js` 的可审计复核结论。正式任务书
> `SPIKE_01_WIN7_RUNTIME_BASELINE.md` 的 T01--T11 与共享 harness 的结果键并不相同，
> 因而历史的“11/11”不能直接转换为任务书的“11/11 通过”。

| 历史结论/证据 | 与正式矩阵的关系 | MVP 裁决 | 理由 |
|---|---|---|---|
| Electron 22.3.27 在 ThinkPad T460 / Win7 SP1 x64 上可以启动 | T01 的部分运行时前提 | `PARTIALLY_CONFIRMED` | 未执行冷重启后的首次启动计时，不能证明 T01 的冷启动门槛。 |
| `utilityProcess.fork()` 出现子进程 | T03 的部分前提 | `PARTIALLY_CONFIRMED` | 独立 harness 还验证了实际 stdin 可读性；该项仍不等于完整的内存/输入边界验收。 |
| contextIsolation、sandbox、preload/contextBridge、CSP | T07/T08 的部分安全前提 | `PARTIALLY_CONFIRMED` | 共享 harness 主要为配置/页面探测，未覆盖任务书要求的应用层 HTTP、WebSocket、DNS 出站阻断和抓包。 |
| CJK 路径启动 | T05 的关键路径条件 | `PARTIALLY_CONFIRMED` | 该事实可复用；仍需独立 harness 的实际报告与工件哈希绑定。 |
| `--disable-gpu` 不崩溃 | T04 的部分前提 | `OWNER_ACCEPTED_FOR_MVP` | 黑屏、窗口聚焦和视觉可用性属于已获 owner 临时接受的人工项；不得标成自动化 PASS。 |
| `SPIKE_01 = GO`、Phase 3--7 可推进 | 正式 Go/No-Go | `CONTRADICTED` | 正式 T01--T11 还包括 10 分钟内存、真实崩溃、清理、双任务采样及网络证据；历史共享 harness 未逐项覆盖，且当前仅可形成 MVP 结论。 |

独立报告路径：`spikes/01-win7-runtime-baseline/acceptance/evidence/report_spike01_MVP-20260802-01_*.json`。
最终逐项状态以 `docs/reports/2026-08/win7_mvp_acceptance_report.html` 与
`docs/status/latest-validation.json` 为准；二者均会把替代条件明确标为替代条件，而不是正式通过。

## 4B. 网络门禁修正复测（MVP-20260802-05 → MVP-20260802-08）

10 分钟实机报告 [`MVP-20260802-05`](../../spikes/01-win7-runtime-baseline/acceptance/evidence/report_spike01_MVP-20260802-05_formal.json)
首次将 T08 记为 `FAIL`：renderer 已报告 WebSocket 被拒绝，但 Electron 的 session 回调只暴露了两个 HTTP 请求，旧 harness 错误地要求至少三个拦截请求。该失败原始证据保留不改写。

根因是 harness 的证据计数条件过严，不是网络请求成功。最小修复改为同时要求：renderer WebSocket 非意外成功、两个 HTTP session 请求均取消、DNS/HTTP session 探测无意外响应；并明确 session 回调不保证报告 WebSocket。10 秒受控重测 [`MVP-20260802-08`](../../spikes/01-win7-runtime-baseline/acceptance/evidence/report_spike01_MVP-20260802-08_short.json)
将 T08 记为 `MVP_NETWORK_SURROGATE`。这仍不是物理断网或 pcap 证据，且未改变管理 SSH 链路。

同一轮的首次 T10 清理报告 [`MVP-20260802-08_cleanup.json`](../../spikes/01-win7-runtime-baseline/acceptance/evidence/report_spike01_MVP-20260802-08_cleanup.json)
因 WMIC 把清理脚本自身命令行当成匹配进程而失败；脚本随后增加明确的自匹配排除，重测 [`MVP-20260802-08_cleanup_retest.json`](../../spikes/01-win7-runtime-baseline/acceptance/evidence/report_spike01_MVP-20260802-08_cleanup_retest.json)
为 `PASS`，三个明确目录均不存在且无匹配进程。失败原始证据保留。

## 5. 论证局限性（诚实记录）

- **harness 为共享件**：codex 复用本 agent 构建的 `win7-acceptance.js`，非完全独立实现。
  严格意义上属"同 harness 双 agent 互证"，强度高但非"独立 harness 双实现互证"。
- **改进建议**：后续 SPIKE_02/03/04 由 codex 各自独立编写 harness（仅共用真机与证据槽位），
  以达到"独立实现交叉印证"的最强论证级别。

## 5A. MVP-20260802-12 T03 复测勘误

MVP-20260802-12 在 Win7 同一 Electron 22.3.27 上追加了 3 次真实 utilityProcess 工作集/私有页采样；
采样值非零且进程在采样窗口内保持存活。但在 `stdio: ['ignore', 'ignore', 'ignore']` 下，子进程仍报告
`process.stdin.readable=true`、`destroyed=false`。因此 T03 当前裁决为 `FAIL`，不能用内存采样成功覆盖
stdin 默认关闭要求。原始报告为
`spikes/01-win7-runtime-baseline/acceptance/evidence/report_spike01_MVP-20260802-12_short.json`，
stdout/stderr 为同目录 `spike01_MVP-20260802-12_stdout_stderr.txt`。

根因候选是 Electron 22/Win7 的 utilityProcess stdio 映射没有把 ignore 配置呈现为关闭的 Node stdin；
尚未授权修改生产 Core，也没有把显式 `process.stdin.destroy()` 冒充为“默认关闭”。后续必须由 SPIKE_01
负责人决定：修复/封装 Core 的 stdin 边界并补负向输入测试，或正式更新 Runtime Profile 的降级策略。

随后执行的 stdio 语义诊断 [`report_spike01_stdio_MVP-20260802-12.json`](../../spikes/01-win7-runtime-baseline/acceptance/evidence/report_spike01_stdio_MVP-20260802-12.json)
显示：`stdio: 'ignore'` 和三元组 ignore 变体的父侧 `utility.stdin` 均不存在，子进程在观察窗口内没有读到数据；
尝试 pipe 变体则被 Electron 明确拒绝（`stdin value other than ignore is not supported`）。这说明实际输入通道不可注入，
但仍不能自动把严格的 `process.stdin.readable=false` 合同改写为通过，故当前保持 `FAIL/PARTIAL`，交由负责人裁决语义。

## 6. 对原 PRD 的影响（不自动回填）

- `docs/tasks/SPIKE_01_WIN7_RUNTIME_BASELINE.md` 状态块仍为 `Win7-Validation: NOT_PERFORMED`、§9 仍为占位。
- 由负责人参照本论证与 `spikes/01-win7-runtime-baseline/acceptance/GONOGO_REPORT.md` 决策后手动回填。

# A9-19 开发机证据

本目录只包含开发机证据，**不是 Win7 证据，也不是 Electron 22 证据**。Win7 实机验收需另行冻结新候选（任务书 §9）。

## 1. 渲染端时效与几何（P01/P02/P04/P05/P06，L01–L05）

- 方法：[`run-a9-19-probe.mjs`](run-a9-19-probe.mjs) 在系统临时目录组装页面：逐字节复制真实的
  `src/shell/product/renderer/{workbench.html,a9-workbench.css,a9-workbench.js}`（SHA-256 记录在摘要 `sources` 中），
  注入 [`harness/stub-bridge.js`](harness/stub-bridge.js)（桩预加载桥，按脚本推进一轮：流式预览 → 说明 + Shell 工具开始 →
  工具结束 → 第二段预览 → 完成；运行中任务按持久化真实形态暴露为 `outcome='active'`、`turnId=null`）与
  [`harness/probe.js`](harness/probe.js)（经真实 Composer 提交，逐项记录首次进入 DOM 的时刻并量测几何），
  用无头 Chrome 在 1079×540 与 1366×768 CSS px 内容视口运行。
- 结果：[`probe-summary.json`](probe-summary.json) 为 `PASS_DEV_RENDERER_NOT_WIN7`。

| 项 | 1079×540 | 1366×768 |
|---|---|---|
| 工具卡 / 已运行时长 / Shell 说明可见（相对事件） | 0 ms | 0 ms |
| 流式预览首段可见（相对预览开始） | 600 ms | 600 ms |
| 首个工具卡早于轮次完成 | 8.0 s | 8.0 s |
| 对话流高度占视口（运行中） | 60.5% | 59.9% |
| 完整可见对话行（运行中） | 5 | 7 |
| 对话行可见标题（中文字符，前 6 行） | 9–11 | 8–10 |
| 头部可见项 | 权限、运行状态、检查器开关 | 同左 |

截图：[`running-turn-1079x540.png`](running-turn-1079x540.png)（运行到第 6 秒冻结，Shell 工具执行中）。

- **负向对照**：同一脚手架以 `A9_19_RENDERER_DIR` 指向 `git show` 导出的 A9-19 之前渲染层，
  [`negative-control-summary.json`](negative-control-summary.json) 为 FAIL：工具卡与说明到轮次完成才出现（迟到 8 s），
  预览从不出现，所有对话行标题宽度为 0，出现 `REQUEST`/`CONVERSATIONS`/`tool_calling` 等文案，运行中对话流仅占 43.7%。
  截图 [`negative-control-running-turn-1079x540.png`](negative-control-running-turn-1079x540.png) 与 WIN7-36 实机截图症状一致。
- 局限：无头 Chrome 为当前稳定版 Chromium，非 Electron 22 / Chromium 108；DPR 为 1，未模拟 Windows 125% DPI；
  时间为 Chrome 虚拟时间，轮询 500 ms 与脚本时间对齐，因此多数延迟为 0。桩桥不经过运行时、Core 或 Gateway。

## 2. 运行时预览（P02，ADR-0135）

由 `src/shell/tests/product/a9-19-live-progress.test.ts` 在真实运行时（Core/Gateway/State dist + better-sqlite3）与
带延迟的流式夹具模型上验证：预览在轮次完成前可见；被拆成 3 个 chunk 的秘密及其前 10 个字符不出现在任何预览快照中；
步边界后预览重新开始；完成后预览为空、最终文本只落盘一次。负向对照：把保留长度改为 0 后，预览中出现秘密前缀
`A9-19-SPLI`，用例失败；恢复后通过。

## 3. 基线扫描让出事件循环（P03）

[`p03-compare-result.json`](p03-compare-result.json)：同一 6000 文件树上，旧实现扫描阶段最长独占 550 ms、收集 175 ms；
A9-19 为 27 ms、43 ms；基线与变化报告逐字节一致。复现：用 `git show 6adaaf0:src/workspace/...` 导出旧源码编译到临时目录，
以 `node p03-compare.cjs <旧编译目录> <新编译目录>` 运行（[`p03-compare.cjs`](p03-compare.cjs)）。

**残留**：`freezeTurnBaseline` 结束时 `CheckpointManager.persistExternalBaseline` → `loadCheckpoint` 对整份恢复 blob 做一次同步
往返校验，本机 2000 个文件约 0.4 s，每轮一次。`checkpoint-manager.ts` 不在 A9-19 白名单内，未修改；P03“单次占用 ≤50 ms”
因此仅对扫描阶段成立，整体为部分达成。

## 4. 复现

```bash
node docs/reports/2026-09/a9-19-evidence/run-a9-19-probe.mjs
```

默认只写系统临时目录；`--record` 才会覆盖本目录的 `probe-summary.json` 与截图（遵循 DOCS_03 的证据隔离规则）。

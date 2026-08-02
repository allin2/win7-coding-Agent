# 技术预研（Spikes）

本目录存放 Phase 3-7 前置技术预研产物。每个 Spike 对应一份稳定路径任务书（`docs/tasks/SPIKE_XX_*.md`）。

| 编号 | 目录 | 任务书 | 状态 | Win7 验证 | 成果去向 |
|------|------|--------|------|-----------|----------|
| 01 | `01-win7-runtime-baseline/` | `SPIKE_01_WIN7_RUNTIME_BASELINE.md` | APPROVED_FOR_IMPLEMENTATION | OWNER_ACCEPTED_FOR_MVP（正式合同仍 PARTIAL） | T03 的父侧无句柄/无数据语义已由 ADR-0055 接受；冷启动/视觉/抓包/真实双任务延期 |
| 02 | `02-terminal-containment/` | `SPIKE_02_TERMINAL_CONTAINMENT.md` | APPROVED_FOR_IMPLEMENTATION | OWNER_ACCEPTED_FOR_MVP（正式 BUILD_HOST_MISSING） | helper/ABI/构建链延期；真实 Runner 与终端必须继续 fail-closed |
| 03 | `03-git-adapter/` | `SPIKE_03_GIT_ADAPTER.md` | APPROVED_FOR_IMPLEMENTATION | PASS（MVP-20260802-12） | 受控去 GCM/SSH/远程 helper 派生包；P01-P04/N01-N10 14/14；旧残留验收进程已精确清理 |
| 04 | `04-storage-index/` | `SPIKE_04_STORAGE_INDEX.md` | APPROVED_FOR_IMPLEMENTATION | OWNER_ACCEPTED_FOR_MVP（正式 BUILD_HOST_MISSING） | MVP 使用有界内存状态；机械盘门禁 PASS；SQLite/FTS/恢复延期 |

> ADR-0055 只完成 MVP 负责人收口；四项 SPIKE 的正式合同仍须真实通过后，ADR-0028~0035 的附条件才算满足。

# 实机验证与交叉论证（Validation & Cross-Verification）

> 建立日期：2026-08-02
> 适用：SPIKE_01~04 及 Phase 1/2 的 Win7 SP1 x64 实机验收

## 0. 核心工作原则（强制）

本目录与 `spikes/<n>-*/acceptance/` 下的所有内容，遵循以下铁律：

1. **实机验证照跑不误** —— 所有 SPIKE/Phase 的 Win7 实机验收照常执行，产出结构化证据。
2. **合同、证据与当前状态分层** —— 任务书的验收合同和 Accepted ADR 正文不可覆盖；原始证据
   不得改写。依 ADR-0054，MVP 整合窗口可基于可复核证据更新任务书的客观验证记录、当前状态
   与索引，但架构师专属 Gate、未满足的正式条件和历史报告不得自动放行或改写。
3. **证据与 PRD 分离** —— 原始证据（JSON 报告、日志、抓包、录屏）一律落在
   `spikes/<n>-*/acceptance/evidence/`（贴近产出它的 harness）。
4. **交叉论证独立存放** —— 本 agent（WorkBuddy）与 **codex** 的双向论证分析统一放在 `validation/` 下，
   不污染 PRD、也不污染 harness 目录。
5. **codex 通道约定**：
   - 本 agent 报告命名：`report_normal.json` / `report_cjk.json` / `report_gpu.json`
   - 历史 codex 报告命名：`report_codex.json` / `report_codex_gpu.json`（落到同一 `evidence/` 目录）。
   - ADR-0054 后的独立报告使用 `report_<suite>_<mvp_id>_<variant>.json`，必须记录 harness SHA-256；同机可复测，但不能把共享 harness 的一致性写成独立实现互证。

## 1. 判定流转

```
实机运行 harness → 落盘 evidence/*.json ──┐
                                         ├─→ validation/<spike>/CROSS_VERIFICATION.md（双方逐项比对）
独立 harness（或明确标记的共享 harness）→ evidence/report_<suite>_<mvp>.json ──┘
                                         ↓
                        Go/No-Go 写入 spikes/<n>*/acceptance/GONOGO_REPORT.md（非 PRD）
                                         ↓
                        负责人参照证据手动回填 PRD §9（不在本自动流程内）
```

## 2. 索引

| Spike / Phase | PRD（保持 pristine） | 原始证据（evidence/） | 交叉论证（validation/） | 状态 |
|---|---|---|---|---|
| SPIKE_01 运行时基线 | docs/tasks/SPIKE_01_WIN7_RUNTIME_BASELINE.md | spikes/01-win7-runtime-baseline/acceptance/evidence/*.json | **validation/spike01/CROSS_VERIFICATION.md** | 🟢 MVP 负责人接受；正式合同仍 PARTIAL/T03 FAIL |
| SPIKE_02 终端/containment | docs/tasks/SPIKE_02_TERMINAL_CONTAINMENT.md | spikes/02-terminal-containment/acceptance/evidence/（待建） | validation/spike02/（待建） | 🟡 MVP 延期接受；正式 BUILD_HOST_MISSING、能力 fail-closed |
| SPIKE_03 Git Adapter | docs/tasks/SPIKE_03_GIT_ADAPTER.md | spikes/03-git-adapter/acceptance/evidence/report_spike03_MVP-20260802-06.json | `validation/spike03/CROSS_VERIFICATION.md` | 🟢 MVP 14/14；正式闭包待 SBOM/许可/抓包 |
| SPIKE_04 存储/索引 | docs/tasks/SPIKE_04_STORAGE_INDEX.md | spikes/04-storage-index/acceptance/evidence/（待建） | validation/spike04/（待建） | 🟡 MVP 延期接受/有界内存模式；正式 ABI/indexer/benchmark 待补 |
| MVP 产品入口 | docs/tasks/INTEGRATION_01_ROBUSTNESS_HARDENING.md | `validation/report_product_shell_MVP-20260802-14.json` | `docs/acceptance/MVP-20260802-14_OWNER_DISPOSITION.json` | 🟢 Win7 启动/Renderer 诊断/退出 PASS；完整 E2E 与安装器待开发 |
| Phase 1 | docs/tasks/PHASE_01_CAPABILITY_PROBE.md | `validation/phase1/evidence/phase1_probe_MVP-20260802-{07,09,10,12_e2}.json` + schema v1 reports | `validation/phase1/README.md` | 🟡 标准树 18/18 × 3 + 回归 20/20；E2 中文+空格树 17 PASS + 1 预期 degraded + 回归 20/20；正式 E1/E2 Gate 仍冻结 |
| Phase 2 | docs/tasks/PHASE_02_READONLY_CODE_ANALYSIS.md | （待建） | （待建） | ⬜ 未执行；仅完成共享 CPython 前置 |

## 3. 后续规划

见 **validation/ROADMAP.md** —— 剩余实机验证的快速导航；完整 C01–C20 约束矩阵、RC-01～RC-09 执行包、证据接口和停止条件见
[`docs/reports/2026-08/win7_remaining_constraints_acceptance_plan.html`](../docs/reports/2026-08/win7_remaining_constraints_acceptance_plan.html)。

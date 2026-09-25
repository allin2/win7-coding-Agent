# A9-21 — A9-18 有效成果移植与工作树清理

```text
Status: PLANNED_NOT_AUTHORIZED
Task Type: RUNTIME_MEMORY_AND_STARTUP_HARDENING
Target Branch: codex/a9-alpha2
Source Baseline: A9-20 完成后的 codex/a9-alpha2
Target Version: 0.3.0-alpha.2
Phase-Gate: A9_21_PENDING_OWNER_APPROVAL
Win7-Validation: NOT_PERFORMED
Decision: ADR-0138, ADR-0139
```

> 2026-09-25 起草，待负责人批准。批准前不构成实现授权（AGENTS.md C14）。取舍依据见
> [承接台账 §7](../plans/A9_17_A9_18_CARRYOVER_LEDGER.md)。

## 1. 目标

把 A9-18 未提交工作树中经评估有效的部分，在当前主线上重新落地，随后删除该工作树与分支。
参考来源是工作树 `win7-coding-agent-memory-optimization`（基线 `7d06789`）中的代码与测试；
不整体合并，不沿用其 ADR 编号，不接受其自报的审查结论。

## 2. 范围

- **M0 预算 #3 口径（K17-5）**：按 ADR-0139 修订 `PERFORMANCE_BUDGET.md` #3 与测量计划映射（#2 = `shell.gpu`+`shell.renderer`，
  #3 = `shell.main`，`shell.utility` 正常应为空），同步 `a9_win7_memory_baseline.ps1` 头部注释。阈值与“未实测”状态不变。
- **M1 启动定向恢复（P0-1）**：启动时只对 SQLite 中本工作区 `interrupted` 且缺 checkpoint 记录的 Turn 读取 manifest，
  不再枚举和加载全部历史；`loadCheckpoint` 返回 `undefined` 记为缺失，不计入有效集（R06）；历史 Turn 在 diff/undo 使用前
  照常经 `loadCheckpoint` 完整校验。密钥轮换触发的 `revalidatePersistedTurns` 保持全量校验，但校验结果不写入缓存。
- **M2 模型输出上限（P0-4）**：Gateway 单响应 1 MiB、单工具参数 512 KiB，Core 单 Turn 累计 2 MiB（逐响应累加）；
  超限即停止接收并标记截断，截断状态不被后续 `finish_reason` 覆盖；截断或未收全的工具调用一律不执行；
  截断以运行事件告知用户；按 UTF-8 字符边界截断；跨 chunk 脱敏不退化。
- **M3 checkpoint 列表分页（P0-3）**：快照只带最近 50 条及总数；`a9.checkpoint.list` 走独立分页查询，游标为
  `before: { createdAt, turnId }`；界面可加载更早记录；会话与工作区绑定检查不变。
- **M4 渲染端集合上限（P2-1）**：`inspectorEvents`、`turnEvents`、`blockedRequests` 设条数与字节上限，淘汰最旧并释放引用，
  界面显示被省略的真实数量；与 A9-19 实时过程改动合并，不回退其行为。
- **M5 清理**：移植提交后删除工作树 `win7-coding-agent-memory-optimization` 与本地分支 `codex/a9-memory-optimization`；
  删除前核对 §1 参考文件已无未移植的需要项，并在台账 §7.3 记录删除时间与最后 HEAD。

不在范围：P0-2 schema 迁移与事实投影表、缓存字节账本与 pin、受控重载、禁用默认菜单、懒加载测量、实验矩阵
（理由见台账 §7.2）。Git 分类器以 A9-20 为准。

## 3. 兼容性

不改 SQLite schema（保持 v4），不新增依赖、Runtime Profile、IPC 通道或 Chromium 开关；分页字段为新增可选字段，旧调用默认行为不变。
Electron 22.3.27/Node 16 目标不变。输出上限数值在 Win7 企业模型服务下是否过紧为**待验证**。

## 4. 允许路径（批准后生效，C14）

- M0：`docs/PERFORMANCE_BUDGET.md`、`docs/plans/WIN7_MEMORY_BASELINE_MEASUREMENT_PLAN.md`、`scripts/mvp_acceptance/a9_win7_memory_baseline.ps1`（仅头部注释）
- M1：`src/shell/product/a9-agent-runtime.js`、`src/state/src/a9-persistence.ts`、`src/workspace/src/checkpoint-manager.ts`
- M2：`src/gateway/src/provider/openai-compatible.ts`、`src/gateway/src/provider/sse-parser.ts`、`src/gateway/src/types/index.ts`、`src/core/src/a9-agent-loop.ts`（仅输出预算）
- M3：`src/state/src/a9-persistence.ts`、`src/shell/product/a9-agent-runtime.js`、`src/shell/product/a9-product-ipc.js`、`src/shell/product/preload.js`、`src/shell/product/renderer/a9-workbench.js`、`src/shell/product/renderer/workbench.html`
- M4：`src/shell/product/renderer/a9-workbench.js`
- 测试：`src/state/tests/**`、`src/workspace/tests/**`、`src/gateway/tests/**`、`src/core/tests/a9-agent-loop.test.ts`、`src/shell/tests/product/**`
- 文档：本任务书、`docs/DECISIONS.md`（仅 ADR-0138/0139）、`docs/DECISIONS_INDEX.md`、`docs/tasks/README.md`、`docs/STATUS.md`、`docs/STATUS_LOG.md`、承接台账

M5 的删除动作限于上述工作树与分支，不触碰其他工作树、分支或 `outputs/`。

## 5. 验证（开发机）

1. M1：以台账 §7.1 的方法对比移植前后启动耗时（100 Turn），并有缺失、损坏、跨工作区 manifest 的单测；负向对照在旧实现上失败。
2. M2：超限截断、后续 `stop` 不覆盖截断、截断工具调用不执行、跨响应累计预算、UTF-8 边界、跨 chunk 秘密不泄漏。
3. M3：多页不重复、同时间稳定排序、半游标拒绝、总数正确；真实 IPC 取第二页不等于第一页（R12 反例）。
4. M4：超上限后 Map 大小与字节受控，省略计数正确，A9-19 实时过程用例继续通过。
5. 受影响包 lint/build/全量 jest，`npm run verify:quick`、`npm run docs:check`、`git diff --check`；
   追查 A9-18 移植试验中 gateway 的偶发失败，定位前不声称通过。
6. 真实 Electron 启动与一次完整任务回归。

## 6. Win7 与候选

只到开发机验证（`Phase-Gate` 至多 `A9_21_DEVELOPER_VERIFIED`）。Win7 结论随后续候选换发另行批准；M0 完成后即可按 A9-17
执行包进行 K17-1 采样，两者互不阻塞。

## 7. 开放问题（附建议）

1. **顺序**：建议 A9-20 先行，A9-21 在其之后开工（两者都改 `a9-agent-loop.ts`）。
2. **输出上限数值**：建议沿用 A9-18 的 1 MiB / 512 KiB / 2 MiB，暂不做成配置项。
3. **删除时机**：建议 M1～M4 提交且验证通过后立即执行 M5；如需更早删除，须先把参考代码另存为补丁文件。

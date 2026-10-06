# A9-34 — 重启恢复的“清理未确认”后台事实处置出口

```text
Status: DRAFT_READY_FOR_REVIEW
Task Type: RELIABILITY_HARDENING
Target Branch: codex/a9-34-recovered-cleanup-disposition
Source Baseline: NOT_BOUND (inspection source ebda91123e62b225c3fd104c9c9b564a4b61c466)
Phase-Gate: A9_34_DESIGN_PENDING_APPROVAL
Win7-Validation: NOT_PERFORMED
Decision: 未分配（批准时追加ADR）
```

## 1. 来源与授权

2026-10-05 负责人对[A9-31 R8 Recovery 裁决材料](../plans/A9_31_R8_RECOVERY_EXPECTATION_RULING.md)裁决 D1=C：
产品重启后保留 `cleanup_required` 合乎设计，但“崩溃后无产品内处置出口”须单独立项。本文件仅为草稿，仅文档获准；
批准本任务、ADR 与准确基线绑定前，不创建分支、不改任何实现文件，A9-31 的实现授权不覆盖本任务。

## 2. 问题（依据见裁决材料 §2–§3）

崩溃时仍在运行的 helper 受管进程，在当前产品中崩溃前即派生 `cleanupRequired=true`（owned 存活进程待清理），
重启后经 `adoptRecoveredFact` 原样带回并落盘为 `cleanup_required`，与 PID 是否已死无关。此后：

- Stop 对该句柄直接拒绝（`A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED`），提示“请完成独立残留检查”，但产品没有记录检查结果的入口；
- 两种退出选择都记 unresolved，弹“无法确认安全退出”并取消退出；工作区锁不释放；
- 对话切换与权限模式切换持续被阻断。

结果是：用户在系统中确认残留已清除后，仍只能强行结束应用；下次启动同样再次锁定，没有终点。R8 Win10 实测中
句柄进程 35788 及其子进程、helper 在 OS 层均已退出，产品仍处于上述状态。

## 3. 目标与非目标

- 目标：为“重启恢复 + 清理未确认 + 进程已不存在”的句柄提供一条用户显式确认的处置出口；处置后对话、模式切换和正常退出
  恢复可用；全过程审计，界面和证据都如实写“用户确认处置，应用未证实清理”。
- 非目标：不让应用自行把 helper/PID 消失推断为进程树已清理（保持 [helper v3](../plans/A9_HELPER_V3_STREAMING_PROTOCOL.md):88
  与 A9-31 任务书 §5 的保守语义）；不发送任何信号、不结束任何进程；不改变存活句柄、release 与 PID 复用的既有规则；
  不开放给模型工具。

## 4. 方案

**方案 U（推荐）：用户确认处置。**

- 适用条件（Runtime 在执行时重新判定，任一不满足即结构化拒绝、零状态变化）：句柄属当前工作区和活动对话；是重启恢复事实；
  `cleanupRequired===true`；`ownershipState` 不属 `release_intent/release_unknown`；执行时重新探测 PID 不存活。
  PID 仍存活时拒绝并提示先在系统中处理（该情形当前同样无出口，处理后即落入本出口）。
- 交互：工作台在“后台运行”卡片上为符合条件的句柄显示“我已检查残留，解除此记录”；点击后弹应用内（DOM）确认框，
  列出 handleId、PID、启动时间、已脱敏命令及“应用无法证明该进程树已被清理”的说明；只有二次确认才发请求。
  所有权限模式下均可用（用户安全动作，与 Stop 同类），模型不可调用。
- IPC：新 strict 动作（拟名 `a9.managed.dismissRecovered`），payload `{conversationId, handleId, recoveryRevision}`，
  额外字段拒绝；`recoveryRevision` 是 Runtime 对该恢复事实生成的稳定摘要，快照中下发，防止对漂移事实误操作。
  preload 只暴露对应函数。
- 持久化：在同一 SQLite 事务内写版本化事件 `managed_process_disposition`（schemaVersion 1，含 handleId、owner、
  `disposition:'user_attested_after_restart'`、PID 探测结果与时间）并把事实行 `last_probe_status` 置为新值
  `user_dismissed`；不改表 schema。`listManagedProcesses` 对该值给 `cleanupRequired=false`，重启不再采纳。
  事务失败则零状态变化、结构化错误，不写成功。重复请求幂等返回同一结果。
- Runner：`BackgroundProcessManager` 增加只作用于上述恢复事实的移除方法，不触碰活句柄、helper 或 release 路径。

**方案 E（不推荐本批做）：证据推导自动结束。** 启动时持久化 helper 身份（PID + 创建时间），重启时若 owned 且 helper 身份
确认已退出，依据 Job `KILL_ON_JOB_CLOSE` 推断后代已被回收。需确认 Job 句柄无其他持有者、禁止 breakaway，并在 Win7 上
以原生方式取得进程创建时间——涉及 native/v26 revision 及 D-013/D-017 评审，成本与风险均高，列为开放问题。

## 5. 拟允许路径（批准时以登记为准）

- Runner：`src/runner/src/background-process-manager.ts`；测试 `src/runner/tests/background-process-manager.test.ts`。
- State：`src/state/src/a9-persistence.ts`；测试 `src/state/tests/a9-managed-process-ownership.test.ts`。
- Shell：`src/shell/product/a9-agent-runtime.js`、`src/shell/product/a9-product-ipc.js`、`src/shell/product/preload.js`、
  `src/shell/product/renderer/a9-workbench.js`、`src/shell/product/renderer/a9-workbench.css`；测试
  `src/shell/tests/product/a9-lifecycle.test.ts`、`a9-background-tools.test.ts`、`a9-preload-capability.test.ts`、
  `a9-workbench-contract.test.ts`（均在 `src/shell/tests/product/`）。
- 文档：本任务书、DECISIONS 新 ADR、任务索引、STATUS/STATUS_LOG、任务报告。不改 native、锁、release 脚本与历史批准包。

## 6. 验证

- 定向测试：PID 已死的恢复事实可处置，之后 Stop 集合为空、对话与模式可切换、`shutdown` 无 unresolved 且释放工作区锁；
  PID 存活、错属对话/句柄、漂移 revision、release 中间态、非恢复事实一律拒绝且零变化；重复处置幂等；事务/审计失败零变化；
  重启后不再采纳已处置事实；界面文字不出现“已清理/已停止”。反例：去掉执行时 PID 重探测、去掉 revision 校验、
  把处置写成 `stopped/exited`，各至少一项测试变红。
- 现有 `a9-lifecycle.test.ts:1303`（存活 PID 保留未知并阻止退出）保持通过。
- Win10 真实 Electron：在 A9-31 Recovery 场景后经工作台 DOM 完成处置并正常关闭（无原生对话框人工点击）；
  Win7 由第二批候选（A9-33）取得，开发机结果不代替。

## 7. 与第二批的关系

2026-10-05负责人裁决：**推迟到第二批之后**（见[跨根组合裁决材料](../plans/A9_31_WIN10_BATCH_CROSS_ROOT_RULING.md) D1）；本任务仍为草稿、未批准。以下为裁决前列出的两种取向，保留供参考。

本任务改变产品字节。若并入第二批（A9-33 之前），A9-31 已取得的 Win10 phase 证据（含拟议 R9 Recovery）按增量矩阵须在新包上
重跑受影响项（至少 Background、StopExit、ReleaseExit、Recovery）；若推迟到第二批之后，则 A9-33 须把“后台进程运行中崩溃后，
该对话与正常退出被永久阻断”列为已知限制。

## 8. 开放问题

1. 处置入口是否也放进退出时的“无法确认安全退出”提示（当前仅工作台卡片）。
2. 方案 E 是否作为后续独立任务评估。
3. 确认框文案由负责人定稿。

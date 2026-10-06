# A9-32 — 用户主动继续中断任务

```text
Status: DRAFT_READY_FOR_REVIEW
Task Type: EXECUTION_CAPABILITY
Target Branch: codex/a9-32-explicit-continue
Source Baseline: NOT_BOUND (requires approved A9-31 integration commit; inspection source 32ee0b48edd286c77aa543bdda9eb834fd4576aa)
Phase-Gate: A9_32_DESIGN_PENDING_APPROVAL
Win7-Validation: NOT_PERFORMED
Decision: ADR-0152 (Proposed)
```

## 1. 授权与产品语义

2026-09-30 用户选择“用户点击继续”，第二批整批候选；2026-10-01 草稿，仅文档获准。
负责人批准任务及 ADR 后，绑定先前任务整合后的准确干净 source hash，在上述独立分支实现。
依赖 A9-26/A9-28 历史加载、AGENTS.md、预算能力；不重写 ContextManager，不做自动执行。

2026-10-02 负责人要求第二批整批推进至 Win7 PASS；本任务及 ADR-0152 仍待具体批准。
实现基线必须为包含已审核 A9-30/31、managed 输入锁及整合登记的准确干净 SHA，
形成时按 [审批包](../plans/A9_BATCH_2_IMPLEMENTATION_APPROVAL.md) C3 绑定，不拿当前 inspection source 代替。

中断卡列原目标、最后已确认步骤、修改/验证、未知结果和残留；“继续”创建新 Turn，关联原 taskId/interruptedTurnId。
不改旧 Turn 终态、不重放旧 tool_call/Shell/审批，不把任意历史助手陈述当成已确认事实。

## 2. 接口、持久化与失败

- 新 strict 动作 `a9.task.continue`，payload `{conversationId, taskId, interruptedTurnId, recoveryRevision}`；
  preload 暴露 continueTask；不接收 Renderer 传 prompt/权限/工具，额外字段拒绝。
- revision 为 Runtime 对恢复事实生成的稳定摘要身份；仅当前工作区/活动对话 interrupted任务可操作。
  错属、归档、漂移 revision、已有活动 Turn/待审批、cleanup-required、数据库诊断模式均零 Provider 请求/dispatch。
  正常安全托管后台进程不被自动视为残留；继续不放宽原切换限制。
- SQLite单写锁事务内校验revision、创建新Turn、记录 `task_continue_requested` payload schemaVersion=1；
  key=(conversationId,taskId,interruptedTurnId,recoveryRevision)。重复请求返回同一 continuation身份，不二次执行。
  去重依赖现有 tasks/turns/events 及事务，不新增表，不只靠按钮或内存 bool。
- 事务后派发前崩溃仍不自动重放；新 Turn 记 interrupted。下一次主动重试基于新的 interruptedTurnId/revision，
  旧 key只返回原身份；审计失败不把未知写成零副作用。
- Runtime从持久事实生成有界继续提示：原目标、确认文本、未解决问题、路径/验证摘要及未知提示。
  不把旧工具/Shell命令/审批/秘密作为可执行授权。恢复输出只进入事实摘要，不无界送给Provider。
- 请求前重核当前文件事实、模式、Provider、AGENTS.md、环境和预算；不可压缩超限零发送，工具配对不拆。
  后续高影响动作重新目标确认；按钮不提升权限、不复用旧批准。
- tool_start无tool_end的写/删除/Shell记 result_unknown；新轮先读当前事实再决定，不能无条件重复副作用。
  Provider未配置/异常、预算、审计、规则降级、取消分别按现有合同诊断；保留已发生修改和新Turn事实。
- 重启只恢复摘要，零Provider/工具请求；可以正常输入新要求，不偷偷改成旧任务续跑。

## 3. UI

事实加载时显示加载状态/既有重试；中断卡“继续”及阻断原因可见。
点击禁用并显示“正在继续”，新Turn出现后接现有Stop；失败保留诊断，回到可操作的中断卡。
Enter/Space可触发，焦点留在任务卡，不抢滚动；视图切换/刷新不发新请求。

## 4. 拟批准精确路径

- `src/state/src/a9-persistence.ts`：恢复事实/事务及版本化事件，表schema不改。
- `src/shell/product/a9-agent-runtime.js`、`src/shell/product/a9-product-ipc.js`、`src/shell/product/preload.js`、`src/shell/product/renderer/a9-workbench.js`、`src/shell/product/renderer/a9-workbench.css`。
- `src/core/src/a9-agent-loop.ts`：新Turn关联元数据/恢复前只读核查约束，不改预算/验证分类实现。
- `src/state/tests/a9-task-continue.test.ts`、`src/core/tests/a9-task-continue.test.ts`、`src/shell/tests/product/a9-task-continue.test.ts`、`src/shell/tests/product/a9-workbench-contract.test.ts`、`src/shell/tests/product/a9-lifecycle.test.ts`。

文档仅本任务、DECISIONS 新ADR、任务/方案索引、STATUS/STATUS_LOG 和任务报告。
不改native/依赖、历史schema/候选、旧审批、Provider网络边界或系统设置。

## 5. 验证

拟批准的增量合同使用 Node20.17，直接影响 State/Core/Shell；只有本修订获批后才取代旧草稿整 workspace 命令：

```sh
npm test --workspace=@win7-agent/state -- --runInBand --runTestsByPath tests/a9-task-continue.test.ts tests/a9-persistence-contract.test.ts tests/a9-stream-output.test.ts
npm test --workspace=@win7-agent/core -- --runInBand --runTestsByPath tests/a9-task-continue.test.ts tests/a9-agent-loop.test.ts tests/a9-audit-integrity.test.ts tests/a9-verification-evidence.test.ts tests/a9-context-budget.test.ts tests/a9-project-instructions.test.ts tests/a9-permission-modes.test.ts
npm test --workspace=@win7-agent/shell -- --runInBand --runTestsByPath tests/product/a9-task-continue.test.ts tests/product/a9-workbench-contract.test.ts tests/product/a9-lifecycle.test.ts tests/product/a9-audit-integrity.test.ts tests/product/a9-mode-fail-closed.test.ts tests/product/a9-workspace-binding.test.ts tests/product/a9-preload-capability.test.ts tests/product/a9-shell-streaming.test.ts tests/product/a9-background-tools.test.ts tests/product/a9-26-context-budget-config.test.ts
npm run verify:quick
npm run docs:check
git -c core.fsmonitor=false diff --check
```
覆盖正常重启零请求→点击新Turn、事务/Provider/工具前后崩溃、双击/刷新、错属/归档/revision漂移、
旧审批失效、未知副作用先核查、残留阻断、AGENTS.md变更、预算零发送、Provider/SQLite失败、取消重试。
移除服务端去重/身份校验、恢复自动派发、旧审批重放的反例必须红，恢复源哈希。
真实Electron检查加载/焦点/Stop/重启；Win7由新候选取得。证据 `.acceptance/a9-32-developer/`，报告 docs/reports/2026-10。
当前产品实现/真实Electron/Win7均NOT_PERFORMED，开发机完成不代表完整Alpha2或RC。

真实 Electron 必须证明重启零自动请求、点击一个新 Turn、重复点击只一次、旧批准失效、
未知副作用先核查、Provider/预算/审计失败及再次主动尝试；含滚动、焦点和 Stop。
复用已锁定 A9-31 native，须核对源码、Profile、helper/锁/依赖哈希一致，且没有受变动调用行为影响的遗漏。
Runtime/Core/State/Renderer 变化后的继续与共享审计/预算/恢复不能只按 native 未变继承。
完整准入与扩测规则见 [验证矩阵](../plans/A9_BATCH_2_INCREMENTAL_VALIDATION.md)。

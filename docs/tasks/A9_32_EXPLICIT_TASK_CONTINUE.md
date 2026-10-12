# A9-32 — 用户主动继续中断任务

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: EXECUTION_CAPABILITY
Target Branch: codex/a9-32-explicit-continue
Source Baseline: 571ec550b5e09611f55557563d0cf2f1a4a40d1b
Phase-Gate: A9_32_IMPLEMENTATION_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0152 (Accepted)
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

## 6. 本轮本地实施批准与影响登记（2026-10-11）

负责人直接指令：“按照这个规划制定实施计划，并新开窗口，采用gpt-6.1 sol xhigh实施”。
执行范围以[推进顺序 §6](../plans/A9_ALPHA2_DELIVERY_SEQUENCE.md#6-第二批实施计划与新窗口交接2026-10-11)为准。
本轮批准上述 §1–5 本地实现及同范围必要修复、验证。历史待审时点保持。
原合同 SHA-256 `54041ffcaca6da76a32ccb6671a4e8405d80c4c862c4638fc6407fa9a093fa49`。
准确基线 `571ec550b5e09611f55557563d0cf2f1a4a40d1b`，已包含 A9-30/31。
隔离分支 `codex/a9-32-explicit-continue`；原两工作区 dirty/untracked 保留。

用户可见结果：中断事实卡提供主动继续；新 Turn 接现有 Stop。重启与刷新零派发。
影响 State/Core/Runtime/Schema IPC/preload/Renderer；不增加表、依赖、原生能力或权限。
先编译七模块，再执行 §5 定向检查；消费者使用本工作树当前 dist。
managed 锁保持 `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e`。
原生证据仅为可提议继承；继续、审计、预算、恢复与新包入口必须直接检查。

交互说明登记于[Demo](../plans/a9-32-explicit-continue-demo/index.html)。
继续卡列原目标、确认步骤、路径/验证摘要、未知结果及阻断原因。
按钮使用原生 button，支持 Enter/Space；点击后显示“正在继续”。
刷新更新同一卡，保持焦点与用户滚动；失败保留诊断，允许新中断 Turn 主动重试。

两工作树治理差异：隔离基线未含 2026-10-06 在制治理改动。
本轮遵守负责人提供的更严格 C14、证据与输出规则，不批量复制治理文件或脚本。
新任务索引补当前入口；旧索引内容保留为历史。Accepted ADR 正文不改写。
真实 Electron 前读取两级验收流程；GUI、打包、远端与正式候选证据分列。
未授权提交、推送、合并、远端写入、系统修改、删除、冻结、发布或门 A/B。
ENGINEERING_02 §138 的 p17/w16 HALTED 保持，不消费任何旧授权或新增预算。

## 7. 本轮本地交付与剩余门（2026-10-11）

开发机 F1～F3 修复与准确 §5 增量检查 PASS；State 84 / Core 212 / Shell 133。
准确源/消费者身份见 r2 清单；8 个最终字节行为反例均断言失败并恢复。
原 §6 授权来源待负责人确认。本轮修复直接授权不扩大 §6。
真实文件/SQLite 的只读核查后新 write、持久去重及 Stop/重试有直接开发证据。
生产页面键盘、焦点、滚动、失败与 Stop 为 SURROGATE。
真实 Electron、打包、新源 Win10、Win7、独立审核均 NOT_PERFORMED。
本任务保持 A9_32_IMPLEMENTATION_AUTHORIZED，不提前签 DEVELOPER_VERIFIED。
结果、准确源/消费者身份、首失败和待提交范围见[本轮报告](../reports/2026-10/a9_32_local_implementation_and_batch2_readiness_2026-10-11.md)。
表 schema、依赖和 native 不变。事件保留后去重仍绑定现存 Turn 元数据。
原用户目标缺失时返回 A9_RECOVERY_GOAL_UNAVAILABLE；不得使用旧继续提示嵌套。
路径不存在可以由已审计 ENOENT 观察；目录必须成功列出精确路径。
观察规则、平台键与编号冲突风险见 ADR-0189。
原任务前文的 NOT_PERFORMED 是草稿时点；当前证据以本节及报告为准。

### 7.1 已知限制，后续再修（2026-10-12）

本节仅为开发机代码/文档阅读，绑定提交 `d8fd760a1c283b638996bde50c90fc7d2d139ccb`。
负责人要求登记限制后继续文档主流程。不得自行修改以下问题代码。
| 项 | 现象与触发条件 | 影响及不阻断本轮主流程的理由 | 证据层级与绑定 |
|---|---|---|---|
| F6 | 未知 Shell 恢复时，读取无关但在工作区内的缺失路径。已审计 ENOENT 后，`src/core/src/a9-agent-loop.ts:1553` 无条件执行 `recoveryCheck.opaque = false`。 | 未知 Shell 的观察门会被清除；Shell 仍受原 Policy 与新审批约束。负责人本轮要求登记后继续文档流程。此登记不批准正式安全判据，不代表所有 Shell 副作用已核查。 | 开发机代码阅读，d8fd760a…；本轮反例实验 NOT_PERFORMED。 |
| ENOTDIR | 目标父级为文件。`a9-agent-loop.ts:1583,1586,1597` 只接受 ENOENT，ENOTDIR 会抛出。 | 对应观察门无法解除，主动继续被阻断；没有放行副作用。此边缘路径不阻断批准材料编制。实际行为状态 UNKNOWN，代码阅读，未实验。 | 开发机代码阅读，d8fd760a…；运行实验 NOT_PERFORMED。 |
| 错误码可读性 | 恢复卡存在 blockedReason 时，`src/shell/product/renderer/a9-workbench.js:1025–1026` 直接显示英文错误码。 | 影响卡片诊断可读性，不改变 IPC/Policy/审批判定；不阻断文档流程。 | 开发机代码阅读，d8fd760a…；本轮真实 Electron NOT_PERFORMED。 |
| Core 路径核验 | `a9-agent-loop.ts:1571–1600` 的 verifyRecoveryPath 直接使用 fs realpath/lstat/stat/readdir。 | 跨层职责已在 ADR-0189 说明观察规则。措辞仍待负责人确认；现有字节不在本轮修复范围。 | 开发机代码阅读，d8fd760a…；Win7 实机 NOT_PERFORMED。 |
| ADR-0189 治理 | 隔离树用 0189 追加观察规则。主工作区治理线在 DECISIONS.md:2493 声明 0153–0189 已用于并行工作树。 | 整合存在编号和引用冲突风险。当前不整合，不改 Accepted 正文；本轮文档流程可继续。措辞与编号处理待负责人确认。 | 开发机只读文档，隔离 d8fd760a…；主工作区 a53c9b9d… 加既有 dirty/untracked。 |

F5 已由负责人确认，见 §7.2；ADR-0189 措辞/编号仍待负责人确认。
真实 Electron、Win10、Win7 与指定独立审核均 NOT_PERFORMED。
批准材料见 [A9-33 §6](A9_33_BATCH_2_WIN7_ACCEPTANCE.md#6-a9-33-批准请求包2026-10-12)；限制依据见 [D1 §7](../reports/2026-10/a9_33_producer_gap_analysis_2026-10-12.md#7-已知限制后续再修d3)。

### 7.2 F5 授权来源确认（2026-10-12）

负责人在聊天中原话确认：“我授权了A9-32”。执行代理按 D5 第 1 项选项 A 登记。
确认对象：§6 引用的 2026-10-11 直接指令，以及 §6 的基线 `571ec550…` 与 §1–5 本地范围。
F5 关闭。§7 中“原 §6 授权来源待负责人确认”是 2026-10-11 时点表述，以本节为准。
本确认不扩大 §6：不含提交、推送、合并、远端写入、下载、冻结、发布和门 A/B。
本确认不签 DEVELOPER_VERIFIED；Gate 保持 A9_32_IMPLEMENTATION_AUTHORIZED。
独立审核者指定、ADR-0189 处理、A9-33 批准和目标绑定仍待负责人裁决。

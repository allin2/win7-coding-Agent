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

F5 已由负责人确认，见 §7.2；ADR-0189 补充已落为 ADR-0236，见 §7.3、§7.4。
F6 与 ENOTDIR 两行已于 2026-10-12 按负责人裁决在独立复核前修复，见 §7.4，取代上文“不得自行修改”对这两行的限制；其余三行仍是已知限制。
真实 Electron、Win10、Win7 与指定独立审核均 NOT_PERFORMED。
批准材料见 [A9-33 §6](A9_33_BATCH_2_WIN7_ACCEPTANCE.md#6-a9-33-批准请求包2026-10-12)；限制依据见 [D1 §7](../reports/2026-10/a9_33_producer_gap_analysis_2026-10-12.md#7-已知限制后续再修d3)。

### 7.2 F5 授权来源确认（2026-10-12）

负责人在聊天中原话确认：“我授权了A9-32”。执行代理按 D5 第 1 项选项 A 登记。
确认对象：§6 引用的 2026-10-11 直接指令，以及 §6 的基线 `571ec550…` 与 §1–5 本地范围。
F5 关闭。§7 中“原 §6 授权来源待负责人确认”是 2026-10-11 时点表述，以本节为准。
本确认不扩大 §6：不含提交、推送、合并、远端写入、下载、冻结、发布和门 A/B。
本确认不签 DEVELOPER_VERIFIED；Gate 保持 A9_32_IMPLEMENTATION_AUTHORIZED。
独立审核者指定仍待负责人裁决；D5 第 3～6 项的裁决见 §7.3。

### 7.3 ADR-0189 处理裁决（2026-10-12）

负责人在聊天中原话：“第3到6项按推荐选A”。D5 第 3 项登记为选项 A。
ADR-0189 保持 Accepted 原文。批准未来新增一条补充 ADR，补充 F6、ENOTDIR 与 Core fs 范围。
本轮不新增 ADR、不分配编号。编号须在整合前核对所有工作树后另行裁决。
§7.1 的 F6、ENOTDIR 仍是已知限制，本裁决不修复它们，也不改动 `src/` 代码。
第 4～6 项涉及 A9-33，见 [A9-33 §6.5](A9_33_BATCH_2_WIN7_ACCEPTANCE.md#65-负责人裁决登记2026-10-12)。
补充 ADR 编号已取 ADR-0236，见 §7.4。

### 7.4 F6 与 ENOTDIR 独立复核前修复（2026-10-12）

负责人在聊天中原话：“A选，新开审核会话”。F6 与 ENOTDIR 登记为选项 A，在独立复核前修复。
独立审核者是负责人另开的新审核会话，由负责人启动；执行代理不参与审核，也不签审核结论栏。
改动路径均在 §4 白名单内：`src/core/src/a9-agent-loop.ts`、`src/core/tests/a9-task-continue.test.ts`。文档为 ADR-0236 及索引、本任务、STATUS、STATUS_LOG。
行为见 [ADR-0236](../DECISIONS.md)：opaque 门只由已核验目录的 `list` 解除；ENOTDIR 与 ENOENT 同按路径不存在处理，软链接越界仍阻断。
不改：错误码可读性、Core fs 范围、`src/state`、`src/shell`、native、依赖、schema 和 IPC。
开发机验证：State 84、Core 218（原 212 加新增 6 项）、Shell 133 全部 PASS，`verify:quick` 退出 0。两个反例断言失败后恢复同一 SHA，见 `.acceptance/a9-32-developer/mutation-results-r5.json`。
残余限制：任何已核验目录的 `list` 仍可解除 opaque 门，包括无关目录；彻底解决需要基线比较，另立任务。
ENOTDIR 在 Win7 NTFS 上的实际错误码、真实 Electron、Win10、Win7 均 NOT_PERFORMED。
修复已提交为 `59a3f6507ecac3c0c89fdcd6fc9b8ef79ceba73c`。独立复核对象由 `d8fd760a…` 变为该提交。
审核交接包已在 `7504832a…` 重绑，新清单为 `review-bundle-manifest-r3.json`（SHA-256 `51ac0ca0…`）。原 D4 绑定的 `d8fd760a…` 和 r2 清单保留为历史。
r4 的 4 个 Core 反例在修复提交上未重跑，状态 NOT_PERFORMED，原因见交接包 §4.1。

### 7.5 独立审核结论登记与 R-01 裁决（2026-10-12）

独立审核者是负责人另开的 Claude Sonnet 5.5 会话，不是实现方。结论全文见[独立审核结论](../reports/2026-10/a9_32_independent_review_conclusion_2026-10-12.md)，原文 SHA-256 `2843769f…`。
结论：开发机 PASS，绑定 `59a3f650…`，无阻断级发现。证据层级为开发机（macOS，Node 20.17.0）；真实 Electron、Win10、Win7 均 NOT_PERFORMED。
审核者复算 State 84、Core 218、Shell 133 全部通过，并用 16 个自选反例验证，其中 3 个存活，对应 R-03。
登记依据为负责人在聊天中回复“B，补用例，登记并提交”。本登记不签 `DEVELOPER_VERIFIED`，该门另行裁决。

| 编号 | 级别 | 处置 |
|---|---|---|
| R-01 | 中 | 负责人选 B：带 `residueRisk` 的 `tool_end` 计入未知结果，按 opaque 处理。属 `d8fd760a…` 遗留，须修复并对增量再审，完成前 `59a3f650…` 的 PASS 不覆盖它 |
| R-02 | 低 | 已声明的残余限制，维持 ADR-0236 措辞，不写成“未知 Shell 的影响已核查” |
| R-03 | 低 | 负责人批准补 3 个用例：悬空软链接保护、读取报 ENOENT 但文件实际存在、`search` 不得解除 opaque 门 |
| R-04 | 低 | 登记为已知限制：一个任务的恢复事实不可用，会让整个继续卡列表退化为全部阻断，失败方向是阻断 |
| R-05 | 信息 | 登记为已知限制：核验阶段遇到 EACCES 时，回合以原始异常终止，`tool_start` 没有 `tool_end` |
| R-06 | 信息 | 登记为已知限制：`requestTaskContinuation` 的 `requestPrompt` 参数未使用；生产路径由键检查限定为 4 个字段 |
| R-07 | 信息 | 登记为已知限制：早先回合的未知结果在后续恢复中一直保留，方向保守 |

§7.1 的错误码可读性、Core 路径核验职责两行仍是已知限制，审核者确认仍存在。
审核者发现交接包 §2 的依赖搭建命令有缺陷，已修订并在全新归档上实测。

### 7.6 R-01 修复与 R-03 补用例（2026-10-12）

依据：负责人回复“B，补用例，登记并提交”（§7.5）。决策见 ADR-0237。

| 项 | 改动 | 文件 |
|---|---|---|
| R-01 | `getTaskRecovery` 对带 `residueRisk` 的副作用工具 `tool_end` 保留未知结果；只读工具和无残留不变 | `src/state/src/a9-persistence.ts` |
| R-01 用例 | State 4 项、Shell 端到端 1 项 | `src/state/tests/a9-task-continue.test.ts`、`src/shell/tests/product/a9-task-continue.test.ts` |
| R-03 用例 | 悬空软链接保护、读取报 ENOENT 但文件存在、`search` 不解除 opaque 门，共 3 项 | `src/core/tests/a9-task-continue.test.ts` |

开发机验证（基线 `62a73f78…` 加本轮差异）：State 88、Core 221、Shell 134 全部 PASS；`verify:quick`、`docs:check`、`git diff --check` 通过。较 §7.4 的 84/218/133 增加 4/3/1。
反例：4 个均由断言变红并恢复同一 SHA，见 `.acceptance/a9-32-developer/mutation-results-r6.json`。`verify:quick` 重建的 24 个 `src/runner/dist/*` 已归档并恢复，见 `generated-output-preservation-r6.json`。
范围：不改 Core 逻辑、schema、IPC、依赖、native。`59a3f650…` 的 PASS 不覆盖本修复，须对 `59a3f650…` 到修复提交的增量再审。
DEVELOPER_VERIFIED 未签。真实 Electron、Win10、Win7 均 NOT_PERFORMED。

提交（2026-10-12，负责人授权“A，提交这9个文件”）：修复提交 `adb9d0f0a5a78dd6a82917a794d0930bff6ffa60`，父提交 `62a73f78…`，未推送、未合并。上文验证基于该提交的提交前工作树，提交时字节相同。
D4 重绑（负责人授权“重绑D4并提交”）：提交 `9dea138455430a17482dff3703708592cd0603d4`，复审对象 `adb9d0f0…`，范围 `59a3f650…..adb9d0f0…`。r4 清单 SHA-256 `d00d1123…`，增量补丁 SHA-256 `acd63137…`。
D4 第 2～4 节的命令原文已在 `adb9d0f0…` 的全新归档上执行：`verify:quick` 退出 0，State 88、Core 221、Shell 134 通过，清单与三组反例核对通过，日志 `d4-doc-commands-r4.log`。增量复审 NOT_PERFORMED。

### 7.7 增量复审结论与已知限制（2026-10-12）

执行代理按负责人提供的交接书登记。负责人原话：“R-08 和 R-09 登记为已知限制，不补”。本轮不补用例，不改产品代码。
独立审核者是负责人另开的 Claude Sonnet 5.5 会话。结论为有发现项 PASS（开发机），未发现阻断、高、中级问题。
绑定提交 `adb9d0f0a5a78dd6a82917a794d0930bff6ffa60`，增量 `59a3f650…..adb9d0f0…`。证据层级为开发机（macOS，Node v20.17.0）。
原文见[增量复审结论](../reports/2026-10/a9_32_incremental_independent_review_conclusion_2026-10-12.md)，SHA-256 `561b23ce372031867ba58476f0f1dc12a0479159803bd523b3cdc4ab1974d7c1`。证据副本在 `.acceptance/a9-32-developer/independent-review-r2/`。
独立审核复算 `verify:quick` 退出 0，State 88、Core 221、Shell 134 项通过；26 个清单成员一致。41 个独立反例中 31 个变红、10 个存活，恢复 SHA 全部一致。核对点 a～e 全部 PASS。
R-01 修复与 R-03 的 3 个新增用例通过本次增量复审。§7.6 的“增量复审 NOT_PERFORMED”是复审前快照，以本节为准。

| 编号 | 已知限制（随本结论签发） | 当前代码是否正确 | 未覆盖的范围 | 证据 |
|---|---|---|---|---|
| R-08 | State 的 `sideEffects` 集合（`a9-persistence.ts:950`）中 `write`、`copy`、`start_process`、`stop_process` 4 个成员，以及 Core 观察门（`a9-agent-loop.ts:1159`）中 `start_process`、`stop_process` 2 个成员，没有仓库用例钉住 | 是。独立审核探针 SP3 对 8 个工具逐个通过 | 以后若有人从这两处清单移除上述成员，仓库用例不会变红 | 开发机，`adb9d0f0…`；反例 `s8-set-member-removed-*`、`c4-gate-drops-*` 存活 |
| R-09 | `getTaskRecovery` 的配对键 `${turn_id}:${callId}`（`a9-persistence.ts:954、956`）没有仓库用例。提供方是否在不同回合复用调用号：UNKNOWN | 是。独立审核探针 SP1 通过 | 以后若有人去掉键里的 `turn_id`，仓库用例不会变红 | 开发机，`adb9d0f0…`；反例 `s4a-key-without-turn-id` 存活 |

两项不改变该提交的运行行为，只记录回归防护缺口，不进入 Win7 验收的通过判据。
本轮登记起点为分支 `codex/a9-32-explicit-continue` 的 `4667bb02…`，不把文档 HEAD 当成复审源码对象。
执行代理只执行文档检查、差异检查与证据副本核对；本轮产品测试 NOT_PERFORMED。不改 Accepted ADR 正文，不签 `DEVELOPER_VERIFIED`，Gate 保持 `A9_32_IMPLEMENTATION_AUTHORIZED`。
真实 Electron、打包、Win10、Win7 均 NOT_PERFORMED。本次不提交、推送、合并或签发门 A/B。

### 7.8 独立审核者追认（2026-10-12）

执行代理向负责人提出：是否追认负责人另开的 Claude Sonnet 5.5 会话为 A9-32 的独立审核者（[D5 第 2 项](../reports/2026-10/a9_32_owner_decisions_2026-10-12.md#2-指定独立审核者)）。负责人在聊天中回复“选A”，按选项 A 登记。

| 项 | 内容 |
|---|---|
| 追认对象 | §7.5 对 `59a3f650…` 的独立审核，以及 §7.7 对 `adb9d0f0…` 的增量复审（增量 `59a3f650…..adb9d0f0…`） |
| 证据层级 | 开发机（macOS，Node v20.17.0）；复算 State 88、Core 221、Shell 134 项通过 |
| 不包括 | A9-33 的技术独立复核者（A9-33 §2 末项要求另行具体指定）；Win10、Win7 结论；`DEVELOPER_VERIFIED` 签发；提交、推送、合并 |

两次审核的会话是否为同一会话，文档未记录，本节不作判断。
本节只登记追认，Gate 保持 `A9_32_IMPLEMENTATION_AUTHORIZED`，Win7-Validation 保持 NOT_PERFORMED。
`DEVELOPER_VERIFIED` 是否签发、§7.8 之后的文档提交，各须负责人另行裁决或授权。

### 7.9 DEVELOPER_VERIFIED 签发条件裁决（2026-10-12）

执行代理上报一处顺序矛盾：本任务 §5 要求真实 Electron 取证；D5 第 5 项已裁决本地不下载 Electron，改在新 Windows 包阶段取证；该包依赖 A9-33 §6.1 的新开发 Profile；而 A9-33 §1 原以三项“开发机合同通过”为 §6.1 生效前置。
负责人提供三个选项（A 带限制签发、B 保持不签、C 不签并改 A9-33 前置），在聊天中回复“选C”，按选项 C 登记。

| 项 | 裁决后状态 |
|---|---|
| `DEVELOPER_VERIFIED` | 不签。Gate 保持 `A9_32_IMPLEMENTATION_AUTHORIZED` |
| §5 真实 Electron 要求 | 不变，不豁免。须证明重启零自动请求、点击一个新 Turn、重复点击只一次、旧批准失效、未知副作用先核查，含滚动、焦点和 Stop |
| 取证位置 | A9-33 §6.1 新增的 A9-32 开发 Profile 所构建的包；D5 第 5 项（本地不下载 Electron）不变 |
| 取证后动作 | 负责人另行裁决是否签 `DEVELOPER_VERIFIED`；本节不预设结果 |
| 开发机部分的用途 | State 88、Core 221、Shell 134 通过与独立复审 PASS（绑定 `adb9d0f0…`）作为 A9-33 修订后前置的 A9-32 部分，见 [A9-33 §6.6](A9_33_BATCH_2_WIN7_ACCEPTANCE.md#66-1-前置修订裁决2026-10-12) |

证据层级为开发机。真实 Electron、Win10、Win7 均 NOT_PERFORMED。本节不改产品代码，不提交、推送或合并。

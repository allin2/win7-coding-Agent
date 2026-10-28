# A9-34 — 重启恢复的“清理未确认”后台事实处置出口

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: RELIABILITY_HARDENING
Target Branch: 执行代理在独立工作树分支实现，主会话审核后合入 main
Source Baseline: 3f675f93b5ddbdc6be8aebbc39f5254b1b2a19d8
Phase-Gate: A9_34_IMPLEMENTATION_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0294
```

## 1. 结论、来源与范围记录

问题仍存在。执行代理在开发机只读核对了上述提交。
方案 U 已获负责人批准（ADR-0294）。§8 Q1～Q3 已裁决，Q4 待开发机验证通过后决定。批准记录见 §10。

2026-10-27，负责人选 A：“A9-34 崩溃后的清理出口”。
本轮只复核和修订草案。来源为 [R8 裁决材料](../plans/A9_31_R8_RECOVERY_EXPECTATION_RULING.md) D1=C。
后台进程合同见 [A9-31](A9_31_BACKGROUND_PROCESS_TOOLS.md) §2–§3。
已知限制见 [DECISIONS](../DECISIONS.md) ADR-0240 决定一第 5 项。

下表按 ADR-0290 记录范围。未来实现部分为待审内容。
负责人批准后，由主会话在任务索引登记实现范围。

| 要素 | 本轮事实与拟实施范围 |
|---|---|
| 本轮交付 | 只修订本任务书，补齐源码证据、方案边界与验证计划 |
| 实际分支与基线 | 本轮分支 `t3/fc190dd4`，HEAD 为 Source Baseline；开始时 tracked/untracked 干净 |
| 未来实现分支 | 拟用 `codex/a9-34-recovered-cleanup-disposition`，尚未创建；实施前登记实际独立工作树与分支，由主会话审核后合入 main |
| 产品交付结果 | 为符合 §4 条件的恢复事实提供用户确认处置入口；解除该事实造成的切换和退出阻断，保留未证实清理的记录 |
| 行为边界 | 仅用户动作、当前工作区和活动对话、归属完整的恢复事实；不结束进程，不改变 release，不开放模型工具，不解除其他阻断 |
| 外部动作边界 | 本轮不连接目标机、不运行产品、不安装依赖、不提交或推送；未来本地提交、开发构建与 Win7 开发级运行须纳入版本范围授权 |
| 必要验证 | 本轮仅文档和单文件差异检查；未来实现按 §6，开发级结果只记 `DEV_CHANNEL` |
| 停止条件 | 基线变化先复核受影响证据；范围扩大、新权限或系统修改先由负责人决定；身份、完整性、必需审计或未知生命周期失败，停止依赖动作 |

未来实现不借用 A9-31 历史授权。
提交、开发通道工作区范围及预算须在执行前明确。
批准后实现范围已登记于任务索引，见 §10。

## 2. 当前问题与源码证据

以下均为开发机静态证据，绑定 Source Baseline `3f675f93…`。
本轮没有运行复现。历史 R8 运行事实只引用裁决材料 §2。

| 现象 | 当前文件:行号与原文 | 与旧草案的关系 |
|---|---|---|
| 崩溃前派生待清理 | `src/runner/src/background-process-manager.ts:263`：`cleanupRequired: true`；`src/state/src/a9-persistence.ts:1397`：`An owned live process needs future cleanup; this is not a failed-cleanup status.`；`:1438`：`cleanupRequired: r.last_probe_status === 'cleanup_required'`；`:1439`：`(['starting', 'running'].includes(r.last_probe_status) && this.getManagedOwnership(r.handle_id)?.ownershipState === 'owned')` | 一致。owned 存活行保留 running/starting，读取时派生 true，不是崩溃前写成清理失败 |
| 重启采纳并落盘 | `src/shell/product/a9-agent-runtime.js:1114`：`fact.cleanupRequired === true`；`:1116`：`recordManagedHandle(loopTrustedRunner.getBackgroundManager().adoptRecoveredFact(fact.handleId, {`；`:1121`：`cleanupRequired: fact.cleanupRequired === true`；`src/runner/src/background-process-manager.ts:627`：`...(fact.cleanupRequired === true ? { cleanupRequired: true } : {})`；`src/state/src/a9-persistence.ts:1372`：`fact.cleanupRequired === true ? 'cleanup_required' : fact.lastProbeStatus ?? null` | 一致，行号已移动。PID 不存活时 recoveryStatus 为 exited，待清理标记仍带回 |
| Stop 拒绝 | `src/runner/src/background-process-manager.ts:556`：`if (entry.recoveredFact && handle.cleanupRequired === true) {`；`:559`：`), { code: 'A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED' });` | 一致，拒绝发生在后续 PID 检查之前 |
| 两种退出选择记 unresolved，正常退出被取消 | `src/runner/src/background-process-manager.ts:688`：`if (options.stopManaged) { await this.stop(id); stopped.push(id); }`；`:701`：`} else throw managedError('A9_RELEASE_UNAVAILABLE');`；`:707`：`unresolved.push(detail);`；`src/shell/product/main.js:1047`：`if (residueLines.length) throw new Error('A9_SHUTDOWN_RESIDUE:' + residueLines.join('\n'));`；`:1052`：`event.preventDefault();`；`:1063`：`dialog.showErrorBox('无法确认安全退出', '仍有 A9 任务或托管进程的清理结果无法确认。应用已取消正常退出，请在诊断中检查残留后重试。');` | 一致。窗口关闭另在 main.js:868 阻止默认关闭，:877 显示错误 |
| 工作区锁不释放 | `src/runner/src/background-process-manager.ts:674`：`entry.handle.cleanupRequired === true`；`src/shell/product/a9-agent-runtime.js:2597–2598`：`const cleanupConfirmed = !activeController && manager.getActiveCount() === 0 && result.unresolved.length === 0;`、`if (cleanupConfirmed) releaseWorkspaceLock();` | 一致，该恢复事实使释放条件不成立 |
| 对话切换被阻断 | `src/shell/product/a9-agent-runtime.js:1131`：`if (loopTrustedRunner.getBackgroundManager().getActiveCount() > 0) return '当前对话仍有托管后台进程';`；`:1139`：`err.code = 'A9_CONVERSATION_BUSY';` | 一致，同一守卫还覆盖工作区切换 |
| 权限模式切换被阻断 | `src/shell/product/a9-agent-runtime.js:2264`：`item.cleanupRequired === true`；`:2265`：`const err = new Error('A9_MODE_CHANGE_BLOCKED_MANAGED_PROCESS: 仍有活动或清理未确认的后台进程，不能切换权限模式');` | 一致；:2257 对重复选择当前模式直接返回，不属于模式切换 |

此结论只针对恢复后 `cleanupRequired=true` 的事实。
不带该标记的旧 PID 事实已有另一条出口：
`background-process-manager.ts:576–580` 在 PID 消失后允许 Stop。
现有 `a9-lifecycle.test.ts:1788` 覆盖该出口与退出重试。
它没有修复本任务的 helper 清理未确认问题。

原草案引用的 `a9-lifecycle.test.ts:1303` 已移至 `:1835`。
该用例在 `:1846` 使用存活的 `process.pid`。
它未覆盖 PID 已死后的用户处置。

## 3. 目标与非目标

目标是让用户显式处置符合条件的恢复事实。
处置后，该事实不再阻断对话切换、模式切换与正常退出。
界面和审计均写明：“用户确认处置，应用未证实清理”。

本任务不把 PID 消失推断为进程树清理完成。
保守语义继续按 [helper v3](../plans/A9_HELPER_V3_STREAMING_PROTOCOL.md) 与 A9-31 §3、§5。
本任务不发送终止信号、不接管旧进程、不改变存活句柄或 release。
本任务不增加模型工具、依赖、系统 API、权限或安装前置。
Runtime Profile 沿用 [WIN7_CONSTRAINTS](../WIN7_CONSTRAINTS.md) D-009、D-013、D-014。
Review 后端与模型权限继续 fail-closed。

## 4. 方案 U：用户确认处置

### 4.1 当前接入位置

下表均为 Source Baseline 的静态定位。
新动作、恢复事实 revision 与处置方法目前均不存在。

| 层 | 现有位置 | 拟改动 |
|---|---|---|
| Runner | `src/runner/src/background-process-manager.ts:606` adoptRecoveredFact、:641 isRecoveredFact、:646 probeProcessAlive、:663 getActiveCount、:683 dispose、:716 ownedEntry | 新增仅移除合格恢复事实的方法；复用归属检查，不调用 Stop/release |
| State | `src/state/src/a9-persistence.ts:367` a9_managed_processes、:378 a9_events、:1350 recordManagedProcess、:1378 recordManagedOwnership、:1407 getManagedOwnership、:1419 listManagedProcesses、:1474 insertEvent | 新增事务化处置写入与结果读取；保留原归属与历史事件 |
| Runtime | `src/shell/product/a9-agent-runtime.js:1076` recordManagedHandle、:1099 syncManagedProcessFacts、:1113 恢复采纳、:2278 getSnapshot、:2612 起返回接口 | 下发处置资格与 revision；协调事务、内存事实与幂等结果 |
| IPC | `src/shell/product/main.js:1021` 注册 product:a9-request；`src/shell/product/a9-product-ipc.js:11` A9_ACTIONS、:44 exactObject、:57 createA9ProductRequestHandler、:85 switch | 在既有通道新增 strict action；保留 sender 校验 |
| preload | `src/shell/product/preload.js:31` a9Request、:52 productApi.a9 | 只新增对应窄函数；保持现有 schemaVersion 7 与旧动作兼容 |
| 工作台 | `src/shell/product/renderer/a9-workbench.js:179` setTaskState、:198 activeManagedProcesses、:1976 “后台运行”状态、:2353 openDialog；`src/shell/product/renderer/index.html:30、:33、:47` 状态、Stop、DOM 对话框 | 当前只有汇总状态与统一 Stop，没有逐句柄后台卡片；新增卡片、容器与 DOM 确认框 |

### 4.2 资格、交互与 IPC

Runtime 在执行时重新判定下列条件。
任一不满足即结构化拒绝，不改变处置事实。

| 条件 | 拒绝范围 |
|---|---|
| 工作区锁有效，句柄归属当前 canonical 工作区及活动对话 | 错属或锁无效 |
| Runner 确认为恢复事实，cleanupRequired 为 true | 普通句柄、未知句柄、非恢复事实 |
| 归属完整，ownershipState 为 owned | 归属缺失、released、release_intent、release_unknown |
| recoveryRevision 匹配当前事实 | 旧卡片、事实漂移 |
| 有有效 PID，执行时探测确认该 PID 不存在 | PID 存活或复用、探测失败或结果未知 |
| 没有并发改变该事实的 Stop、shutdown 或处置 | 串行执行或拒绝，不在校验与提交间交错状态变化 |

现有 `probeProcessAlive:651–652` 将非 EPERM 异常均返回 false。
新动作不能直接用此布尔值证明 PID 不存在。
须区分不存在、存活与探测失败；未知时 fail-closed。
只复用现有探测能力；需要新系统 API 时停止并报告。
PID 不存在仍不能证明后代已清理。

卡片显示 handleId、PID、启动时间与已脱敏命令。
点击“我已检查残留，解除此记录”后，打开 DOM 确认框。
取消不发请求；只有二次确认才发处置请求。
确认期间禁用重复提交，并显示结果或错误。
确认与取消可用键盘完成，关闭后恢复焦点。
该用户安全动作不受模型权限模式限制，也不依赖 Provider 配置。
它不开放 Review 后端或任何模型执行能力。
确认框推荐文案见 §8 Q3。

新增动作拟名 `a9.managed.dismissRecovered`。
payload 仅含 `{conversationId, handleId, recoveryRevision}`。
标识必须非空、有界；revision 使用 64 位十六进制摘要。
额外字段拒绝，归属和 PID 不由 Renderer 指定。
revision 绑定原归属、requestId、PID、启动时间与待清理事实。
同一事实刷新时保持稳定；事实变化后必须失配。
不复用任务续跑卡片的 revision。

### 4.3 持久化与内存收口

同一 SQLite 事务写入 `managed_process_disposition` 事件。
事件使用 `kind='tool'`、`schemaVersion: 1`。
记录原归属、handleId、requestId、revision、处置时间及 PID 探测事实。
处置语义为 `disposition: 'user_attested_after_restart'`。
事务同时把原事实行的 last_probe_status 写为 `user_dismissed`。
不把 ownershipState 改为 released，也不伪造 stopped/exited。

提交前重新核对归属、revision 与原状态。
事务或必需审计失败时，回滚事实和事件。
内存事实保持阻断，不返回成功。
提交后同步移除 Runner 中对应的恢复事实。
移除不触发旧状态回写，不操作 helper 或进程。
提交与内存移除之间不插入异步等待。
若在此处崩溃，下次启动依据持久化处置结果收口。

相同归属、handleId 与 revision 的重试返回原结果。
重复请求不追加成功事件，也不重新操作进程。
不同 revision 不得当成幂等成功。
快照保留已处置记录及其审计语义。
只解除该记录的阻断，不宣称清理完成。
其他进程、审批、Turn 与审计失败继续按原守卫阻断。

### 4.4 schema 与读取路径核对

`user_dismissed` 与当前表结构不冲突。
`a9-persistence.ts:374` 的 last_probe_status 为 TEXT，无状态枚举 CHECK。
`:383` 的 event_type 也没有枚举约束。
新事件按 schemaVersion 1 版本化；数据库 schema v4 保持不变。
不增加表、列或索引，表签名保持不变。

当前 `listManagedProcesses:1438–1439` 对新值派生 false。
Runtime `:1114` 不会再次采纳该值。
模式、Stop、退出和工作台的活动集合也不包含它。
但 `syncManagedProcessFacts:1100–1101` 会写回所有内存句柄。
因此必须完成 §4.3 的内存移除，不能只改数据库。

旧驱动的终态读取与新值存在冲突：
`src/shell/tests/product/a9-batch2-driver-entry.cjs:663–674` 的 factsFinished
只接受 exited/stopped/failed/released，否则返回未知。
`scripts/release/validation/win10/product-driver.cjs:43–44` 的 normalCloseState
也只接受这四种值。它们不能直接用于新处置断言。
本任务使用定向开发级检查，不改历史驱动或已签判据。
后续正式合同须区分“已处置”与“清理已证明”。

方案 E 仍不纳入本次实现。
它涉及 helper 身份、Job 生命周期证明与原生边界。
是否另立任务，见 §8 Q2。

## 5. 实现定位路径（待批准）

原草案列出的源码与测试路径均存在。
原清单遗漏 `renderer/index.html` 与新增 ADR 的索引文件。
按 §4 的静态容器和 DOM 确认框方案补入下表。
路径用于定位，不替代 ADR-0290 的结果与行为边界。
本轮仍只允许修改本任务书。

| 责任 | 拟涉及路径 |
|---|---|
| Runner | `src/runner/src/background-process-manager.ts`；`src/runner/tests/background-process-manager.test.ts` |
| State | `src/state/src/a9-persistence.ts`；`src/state/tests/a9-managed-process-ownership.test.ts` |
| Runtime、IPC、preload | `src/shell/product/a9-agent-runtime.js`、`src/shell/product/a9-product-ipc.js`、`src/shell/product/preload.js` |
| 工作台 | `src/shell/product/renderer/index.html`、`src/shell/product/renderer/a9-workbench.js`、`src/shell/product/renderer/a9-workbench.css` |
| Shell 验证 | `src/shell/tests/product/a9-lifecycle.test.ts`、`src/shell/tests/product/a9-background-tools.test.ts`、`src/shell/tests/product/a9-preload-capability.test.ts`、`src/shell/tests/product/a9-workbench-contract.test.ts` |
| 批准后文档 | 本任务书、`docs/DECISIONS.md`、`docs/DECISIONS_INDEX.md`、`docs/tasks/README.md`、`docs/STATUS.md`、`docs/STATUS_LOG.md`；运行结果沿用已有记录入口 |

`main.js:1021` 已注册共享 IPC，无须修改注册代码。
若负责人选择退出提示直达入口，再评估 main.js 改动范围。
本次不修改 native、锁、release 脚本、历史驱动或批准包。
开发构建复用现有打包入口，不修改构建流程。

## 6. 根因最小改动与最少验证

根因是恢复事实没有用户处置状态及入口。
最小改动为 §4 的用户动作、事务写入和内存移除。
不修改 Stop 的保守清理判据。
本节按 ADR-0288、ADR-0289 修订旧验证计划。
执行规则引用[验收规范](../acceptance/ACCEPTANCE_AND_RELEASE_WORKFLOW.md) §1、§3.4、§5、§6。

### 6.1 开发机定向验证

先构建 State、Runner 及 Shell 消费的依赖闭包。
确认测试加载当前构建输出，再运行受影响测试文件。
复用 §5 现有文件，不增加通用套件或整批变异测试。

| 必要检查 | 最少覆盖 | 现有验证抓不住的失败 |
|---|---|---|
| 处置与持久化闭环 | owned 的已死 PID 恢复事实可处置；事件与新状态同事务；刷新、重启不再采纳；重复请求返回同一结果 | 现有生命周期用例只证明未知会阻断，没有处置路径；只改数据库会被内存快照写回 |
| 资格与原子失败反例 | 参数化覆盖 PID 存活/探测未知、错属、未知句柄、revision 漂移、归属缺失、release 中间态/已释放、非恢复事实；事务或事件故障回滚 | 旧 Stop 守卫不验证新动作；新动作可能解除错误记录，或先移除内存再丢失审计 |
| Runtime 生命周期 | 仅该记录阻断时，处置后 Stop 集合为空、对话与模式可切换、shutdown 无 unresolved 且释放锁；其他阻断仍生效 | State/Runner 局部检查不能证明共享切换守卫、退出结果和工作区锁已收口 |
| IPC 与工作台 | preload 能力测试覆盖 sender、strict payload 与窄函数；工作台覆盖取消零请求、确认绑定身份、结果提示、键盘与焦点；文案保留未证实清理 | Runtime 直调无法发现 preload/action 未接通、取消误发或 UI 误报清理成功 |

保留 `a9-lifecycle.test.ts:1835` 的存活 PID 阻断检查。
它防止新动作顺带放宽原 Stop/退出守卫。
定向检查后，执行项目必需文档和差异检查。
不机械重跑无关模块或旧 Win10 整批流程。

### 6.2 Win7 开发通道的最短真实链路

真实运行只使用 Win7 开发通道。
Win10 验收机完整性为 UNKNOWN，不作为本任务前置。
依据见 [STATUS_LOG](../STATUS_LOG.md)“Win10已确认挖矿进程已结束，主机完整性UNKNOWN（2026-10-09）”。

常设授权 r2 仍绑定已退役的整合工作树。
本工作树不在该范围内，也不继承 ENGINEERING_05 的 main 例外。
依据见 [ENGINEERING_03](ENGINEERING_03_WIN7_DEV_CHANNEL.md) §10.2–§10.4。
执行前由负责人确认后继工作区、版本范围与目标机时间预算。
本任务不需要模型请求，推荐预算 0 次；时间预算待定。
本草案不授予连接权限。

版本范围获准后，使用单次开发构建。
以源码提交、ZIP SHA 和每次新 run UUID 标识。
不分配候选号、不做双干净构建、不冻结、不封存。
不做门 A/B，也不做独立审核签发。
保留自动账本、开发根、单写者锁及下载秘密扫描。
其余准入与禁止项引用 ENGINEERING_03，不另造流程。

最短真实链路：

1. 从产品入口启动一个受管后台进程。
2. 在隔离开发根复现应用崩溃与重启。
3. 独立确认原 PID 已不存在。
4. 经工作台卡片取消一次确认。
5. 重新确认处置同一恢复事实。
6. 核对 SQLite 事件、事实行和刷新结果。
7. 切换对话与模式。
8. 正常关闭并核对锁已释放。
9. 重开产品，核对事实未再次采纳。

工具强制收尾不能证明第 8 步生效。
此链发现单元检查未覆盖的 Electron、preload、DOM、SQLite 与退出接线问题。
结果只记 `DEV_CHANNEL`，不产生 Win7 PASS。
首失败先保留原始错误，再按最小影响修复。
同类失败连续两轮未闭环，按验收规范 §5 停止整批重试。

### 6.3 RC 再议

本任务不增加整批变异测试、重复全阶段彩排或开发期独立审核。
这些流程未列出超出现有定向检查的具体失败，故不列入本批。
方案 E、旧驱动对处置状态的正式判定与全面降级兼容另行裁决。
未变化原生组件不因此重建；后续正式版本按影响分析继承。

## 7. 与已签版本的关系

WIN7-55 是已签限定范围的第二批候选。
负责人已在 ADR-0286 签发门 B。
其 Win7 实机结论为 `A9_39_WIN7_55_BATCH2_PASS_WITH_KNOWN_LIMITS`。
源码、ZIP 与运行绑定以该 ADR 为准。

A9-34 是 ADR-0240 决定一第 5 项的已知限制。
本次复核没有关闭该限制，也不改判 WIN7-55。
实现将改变产品字节，只进入后续版本。
不覆盖 WIN7-55 的候选、包、证据或签发结论。
开发级结果不能并入旧候选的正式结论。
当前事实入口继续使用 [STATUS](../STATUS.md)，不在本任务复制历史流水。

## 8. 开放问题与裁决

| 编号与问题 | 选项及影响 | 推荐与理由 | 待负责人决定 |
|---|---|---|---|
| Q1：退出失败提示是否直达处置入口？ | A：本批只做工作台卡片，退出失败后由用户返回卡片；B：退出提示直接打开卡片，增加 main/Renderer 导航交互 | 推荐 A。先完成处置出口，减少退出流程改动；B 留后续迭代 | 已裁决：A（2026-10-27） |
| Q2：是否评估方案 E？ | A：本批不启动，后续有原生证明需求时另立任务；B：本批加入自动推导，扩大 helper 与证明范围 | 推荐 A。U 不改变原生字节，E 的安全论证不能复用用户确认 | 已裁决：A（2026-10-27） |
| Q3：确认框采用什么文案？ | A：标题“解除重启恢复记录”；正文“我已在系统中检查该进程及其残留，并确认解除此记录。应用未证实进程树已清理。本操作不停止任何进程。”；按钮“确认解除记录 / 取消”；B：负责人另行定稿，等待文案后再实现确认框 | 推荐 A。明确用户责任、未证实事项和动作边界，避免误报已清理 | 已裁决：A（2026-10-27） |
| Q4：后续开发级运行如何授权？ | A：主会话审核合入 main 后，明确通道的 main 工作区差异授权及本版本范围、预算；B：为独立实现工作树单独扩展通道授权 | 推荐 A。与主会话审核合入 main 的交付方式一致；模型请求推荐 0 次，目标机时间预算 UNKNOWN，执行前由负责人确定 | 是否采用 A，并在运行前确定时间预算与有效授权范围？ |

## 9. 本轮文档复核记录

执行代理仅修改本任务书，未修改源码或测试。
源码证据为开发机静态阅读，绑定 Source Baseline。
产品运行、开发构建、Win7/Win10 连接均为 `NOT_PERFORMED`。
本轮不使用历史候选结果作为 A9-34 的直接验证。
文档检查与最终差异结果由本轮交付回复记录。

## 10. 批准与实施记录（2026-10-27）

负责人对“是否批准 A9-34 方案 U 实施，Q1～Q3 都按推荐执行？”回复“批准”。决定见 ADR-0294。

- 实施范围：§1 范围表、§4 方案 U、§5 定位路径、§6.1 开发机定向验证。
- 实施方式：执行代理在独立工作树实现；主会话审核与反证后本地提交 main。
- 未授权：§6.2 Win7 开发通道运行（Q4 待定）、候选号、门 A/B、推送、发布、方案 E。
- 停止条件沿用 §1 范围表；需新系统 API、改 native 或扩大范围时停止并报告。

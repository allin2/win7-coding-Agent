# A9-31：R8 Recovery 第13项失败的裁决材料——产品缺陷还是 driver 预期有误

日期：2026-10-05。Status: DRAFT_NOT_APPROVED（r2，记录 D1 裁决）。本材料只供负责人裁决，不授权产品/driver/控制器修改、
远端执行、新根或任何 C14 路径登记；R8 入口 HALTED 与全部旧证据不改判。整批 Win10 仍 NOT_PASS，
DEVELOPER_VERIFIED、独立验收、Win7 均未签，未在 Win7 实机验证。

修订说明（r2）：r1（SHA256 `fa88e204c215c2af3c2c7b7d9feb31bca80baa0b3fe476abe8ee4169ccb3b675`）发出后，负责人裁决
**D1=C**，并要求起草 driver 修订合同（D2）与产品处置出口任务书草案（D3）。两份草案分别为
[R9 driver 修订合同](A9_31_R9_RECOVERY_RETAINED_UNKNOWN_APPROVAL.md)与
[A9-34 任务书](../tasks/A9_34_RECOVERED_CLEANUP_DISPOSITION.md)，均 DRAFT 未批准。D1 是取向裁决，不是对任何实现、
远端执行或新根的批准。

## 1. 要裁决的问题

R8 Recovery（request `0da51c4c79134b2d904cc7ce5d51a652`）重启后第13项 `BACKGROUND_FACTS_ONLY` 失败：
driver 要求受管句柄 `lastProbeStatus==='exited'`，产品给出 `cleanup_required`。需要裁决：这是产品缺陷，
还是 driver 预期与产品设计不一致；以及裁决后 Recovery 走哪条路继续。

## 2. 直接事实（证据均在 `.acceptance/a9-31-developer/product-r3-retry-r8/return-recovery-r8-full/`，88 文件逐 SHA 一致）

- F1 崩溃前快照（`evidence/driver-crash.json` 的 `recovery.managed_handles`）：句柄 `sh-1791175540859-9aa57540`、
  pid 35788、`lastProbeStatus='running'`、**`cleanupRequired=true`**、`ownershipState='owned'`。即崩溃前产品就已把
  这个正常运行的受管进程标为“需要清理”。
- F2 崩溃整树退出由控制器在 OS 层直接证明（`evidence/controller-crash-tree-confirmed.json`，19 个实例全部
  `exited=true`、退出码为整数；driver `CRASH_OS_HANDLES_AND_EXIT_PROVEN` 通过）。其中后台夹具 root 35788
  （powershell.exe，退出码 1）、child 123372（退出码 1）、二者的父进程 67344（映像为包内
  `resources\native\runner\spike02_helper.exe`，退出码 10）均已退出；root/child 对应关系见
  `workspace/recovery-background.pids.json`。
- F3 重启后（`evidence/driver-journal-restart.jsonl` 失败详情）：同一句柄 `lastProbeStatus='cleanup_required'`、
  `recoveryStatus='exited'`、`pidReusePossible=false`、`cleanupRequired=true`。仅 `lastProbeStatus` 一项即足以使
  第13项失败；`helpers` 计数未写入失败详情。
- F4 重启实例共记录13项，前12项通过（含 `EXACT_ORIGINAL_CRASH`、`CRASH_OS_HANDLES_AND_EXIT_PROVEN` 与重启四项），
  第13项之后的 `RESTART_ZERO_PROVIDER_OR_TOOL_REPLAY`、两项 PID 复用模拟、`RESTORE_NO_REAPPEND` 及收尾
  `LIFECYCLE_PRODUCT_CLEANUP_CONFIRMED_BEFORE_NORMAL_CLOSE` 均**未执行**。
- F5 driver 失败收尾 `TIMEOUT:failure product stop`；重启产品树在 dispatcher-final 后仍存活，
  由负责人在合同流程外手动关闭（方式未细分、无对话框 response 证据）。SQLite 副本中工作区锁 `main-16064` 未释放。

## 3. 源码与设计依据（静态阅读当前 HEAD `ebda911` 源码，未运行复现）

- S1 状态来源：`src/state/src/a9-persistence.ts:1283` 注释写明“owned 的存活进程需要未来清理，不是清理失败”；
  `listManagedProcesses`（`:1324`）对 owned 且 `running/starting` 的行派生 `cleanupRequired=true`——与 F1 一致。
- S2 重启采纳：`src/shell/product/a9-agent-runtime.js:1051` 起，对 `running` 或 `cleanupRequired` 的事实调用
  `adoptRecoveredFact`；`src/runner/src/background-process-manager.ts:597` 在 PID 已死时写 `recoveryStatus='exited'`，
  但原样带回 `cleanupRequired=true`；落盘时 `a9-persistence.ts:1258` 只要 `cleanupRequired` 为真就把
  `last_probe_status` 写成 `'cleanup_required'`，覆盖 `exited`——与 F3 一致。
- S3 推论：在当前产品下，**任何在崩溃时仍运行的 helper 受管进程，重启后都必然是 `cleanup_required`**，
  与 PID 是否存活无关。driver 第13项的 `exited` 预期在当前产品上不可能满足，不是偶发。
- S4 处置出口全部关闭：`background-process-manager.ts:547` 对“重启恢复且 cleanupRequired”的句柄，Stop 直接抛
  `A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED`；`dispose` 两种退出选择都记 unresolved（`:695`）；`main.js:1031`
  据此弹退出对话框，`:1047` 抛 `A9_SHUTDOWN_RESIDUE`，`:1063`/`:877` 弹“无法确认安全退出”并取消退出；
  `a9-agent-runtime.js:1070` 持续返回“当前对话仍有托管后台进程”锁定对话。产品内没有清除该事实的入口。
  driver 失败收尾的 `win.close()` 进入 `main.js:868` 起的窗口关闭处理，同样先弹退出选择对话框等待人工，
  据此推断 R8 重启实例停在该对话框（推断，负责人关树前所见界面未记录）。
- S5 设计文档支持保守：[helper v3](A9_HELPER_V3_STREAMING_PROTOCOL.md):88“直接 kill helper 只能标 cleanup
  unknown，不能写已回收”；[任务书](../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md):105“不可证明清理时记 UNKNOWN…
  不要求夹具把 UNKNOWN 改成成功”；`src/shell/tests/product/a9-lifecycle.test.ts:1303` 测试 restart 后保留
  `cleanupRequired` 并阻止干净退出（但其种子行 pid 为测试进程自身、**存活**，未覆盖 PID 已死的本次场景）。
- S6 设计文档同时要求可处置：任务书 §3（:53 起）“exited/running_unknown/identity_mismatch 分开”“用户处理需
  新目标确认”“用户可取消退出或明确选择停止”。对重启恢复的 `cleanup_required` 事实，当前产品既不给 `exited`
  也不给用户处理路径。
- S7 driver 另一处同样不可达：重启分支（driver `:356`）在第13项之后调用 `closeAfterChecks`（`:175`），
  其 `normalCloseState`（`:38`）要求所有句柄 `cleanupRequired!==true`；控制器要求重启实例 2 分钟内退出
  （`serve-product-r3-desktop.ps1:331`，否则 `LIFECYCLE_RESTART_TIMEOUT`）。按 S3/S4，即使只改第13项，
  Recovery 仍会在正常关闭处失败并超时。失败收尾 `fail()`（`:339`）等待 `!cleanupRequired` 同理必然超时——
  F5 的超时是这一设计冲突的确定结果，不是独立故障。

**小结**：产品“保留 cleanup_required”与其设计文档一致；driver 的 `exited` 和“重启后正常关闭”两处预期
与之冲突，且从未在任何根上被实际执行到（R5 在更早处失败）。但产品同时留下一个设计内未闭合的问题：
崩溃后该对话与应用退出被永久阻断，产品内无处置出口（S4、S6）。两者不是互斥的。

## 4. 选项

| | A：判产品缺陷 | B：判 driver 预期有误 | C：B 并另立产品问题（推荐） |
|---|---|---|---|
| 结论 | 重启后 PID 已死时产品应能得出 `exited` 或给出处置路径，当前行为不合格 | 产品按设计保留未知，driver 两处预期错 | 产品保守保留未知合规；“无处置出口”作为独立产品问题另行裁决 |
| 修改范围 | 产品 Runner/State/Shell（A9-31 白名单内文件），需新增可证明清理的依据（如持久化 helper 身份或用户确认路径）+ 测试；新包、新锁 | 仅 driver（新不可变 revision）：第13项改为断言 `recoveryStatus='exited'`、`pidReusePossible=false`、`cleanupRequired=true`、Stop 被拒为 `A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED`、退出被阻断；收尾不再要求正常关闭，改为与 ready 负例相同的隔离测试退出并标 `normal_product_exit: NOT_PROVEN` | 同 B；另起草产品任务书讨论处置出口，与 Recovery 取证解耦 |
| 已有证据支持 | S6、S4 | S1、S2、S5、F1 | 全部 |
| 风险/代价 | 产品字节变化使 R5–R8 已通过各 phase 证据失去绑定，按增量矩阵须新包并重跑受影响 phase；“PID 已死”不等于后代已清理（S5），放宽需新安全论证 | 把“崩溃后永久锁定”作为已验收行为固化；控制器是否接受重启实例的非零/测试退出码**未核实**，可能还需控制器修订 | 需两份材料、两次批准；Recovery 证据只能表述为“facts-only 保留未知”，不能表述为正常关闭 |
| 下一步批准 | 新/修订任务书 + ADR + 实现授权 + 新包/新根 | driver 修订合同 + ADR + Recovery 专用新根（第九根） | 同 B；产品任务书单独走 |

## 5. 建议（推荐，不是裁决）

采用 C。理由：S1–S5 是直接的源码与设计文本，说明产品行为是有意的；driver 的两处预期从未被实际执行到，
它们与产品设计冲突是确定的（S3、S7）。而“崩溃后无处置出口”是真实的用户体验/可用性缺口（S4、S6），
但修它会使已取得的 phase 证据失效，宜单独评估，而不是为让 Recovery 通过去改产品。
若采用 B/C，起草 driver 修订前须先只读核实：控制器与 `review-phase.py` 对 Recovery 重启实例退出码的判定，
以及观察器 `no_open_instances` 在隔离测试退出下能否成立。

## 6. 本材料不证明

未运行任何复现；S3 的“必然”是静态推导。产品为何在 R8 中未退出没有直接证据（S4 只给出代码路径，负责人
关树前看到的界面未记录）。新 conhost 证明分支、Esc/取消后果、Recovery PASS、Win7 均仍未验证。

## 7. 待负责人裁决

- D1（负责人已裁决）：**C**。
- D2（负责人要求起草）：driver 修订合同草案已起草，§5 所列只读核实结果写入该草案 §1。
- D3（负责人要求起草）：A9-34 任务书草案已起草，不在 A9-31 内实现。
- D4：本材料不预授权第九根；新根仍需另行按哈希批准。

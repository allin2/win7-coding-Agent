# A9-31：R9新根——Recovery按“保留清理未知”修订driver预期并单独续验

日期：2026-10-05。Status: DRAFT_NOT_APPROVED（修订稿r2，记录D1–D4裁决，仍未批准）。请求批准§1–5；本材料尚不构成实现、C14登记、远端执行或第九根授权。

修订说明：r1（SHA256 `f34cb8d2dc8cb741bce0858953b45ecdb20e3cfba7617806bdce04e55a4ce14a`）发出后，负责人对D1–D4作出裁决（见§6），
正文§1–5未改；裁决不是批准，批准须按本稿SHA256另行明确作出。
依据[裁决材料r2](A9_31_R8_RECOVERY_EXPECTATION_RULING.md)负责人裁决D1=C：产品重启后保留`cleanup_required`
合乎设计，driver预期有误；“崩溃后无产品内处置出口”另由[A9-34](../tasks/A9_34_RECOVERED_CLEANUP_DISPOSITION.md)处理，
与本合同解耦。R8合同r2、R8修订（ADR-0176、ADR-0178）及其批准**不延伸**到本草案。

## 1. 基线与开工前只读核实结果

工作树、分支、HEAD `ebda91123e62b225c3fd104c9c9b564a4b61c466`不变；产品r3 ZIP/manifest/native/锁/capture、观察器C#源字节不变。
R8入口HALTED不恢复；R8的StopExit/ReleaseExit PASS保留，不在本根重跑。

裁决材料§5要求的只读核实（静态阅读R8冻结字节，未运行）：

- K1 控制器（`serve-product-r3-desktop.ps1`）对Recovery：崩溃实例须退出码93，随后起重启实例，限2分钟退出
  （`:331`）；phase结论只看重启实例`exit_code -eq 0`且`driver-final.status`为`PASS`，否则记
  `FIXTURE_FAILED_TREE_CONFIRMED`（不是HALT）；`driver.halt`为真才`SAFETY_DRIVER_HARD_GATE`。**控制器无需改动**即可接受
  driver以`app.exit(0)`结束重启实例。
- K2 评审脚本`review-phase.py`要求`driver-final.pid == controller-final.electron_identity.Pid`；Recovery中前者是重启实例
  （R8为16064）、后者是崩溃实例（R8为51484），**即使driver全部通过，现有评审也必然失败**。该缺口此前从未被执行到，
  须另出Recovery专用评审（§2第3点）。
- K3 观察器`no_open_instances`只要求结束时无遗留实例；重启实例以`app.exit`退出后整树结束即可满足，与ready负例以
  `app.exit(94)`结束的先例相同。

## 2. 相对R8的全部变更（仅此）

1. **driver新不可变revision（仅`normal-short`）**：以driver-r1（SHA256 `d1d05dc715874308f2a960a2ed01f31531c06f2d9210e8b12e3cca59c4e82bfe`）
   为基础，只改重启分支（`A9_TEST_RESTART==='1'`）与其失败收尾，非重启路径逐字不变：
   - a. 删去`BACKGROUND_FACTS_ONLY`，代之以`BACKGROUND_RECOVERED_UNKNOWN_RETAINED`：句柄恰1个，`handleId`与`pid`等于崩溃前
     快照（`driver-crash.json`）中的句柄；`lastProbeStatus==='cleanup_required'`、`recoveryStatus==='exited'`、
     `cleanupRequired===true`、`pidReusePossible===false`、`ownershipState==='owned'`；`report.helpers.length===0`。
   - b. 新增`BACKGROUND_RECOVERED_PID_EXITED_BY_OS`：该pid在控制器`controller-crash-tree-confirmed.json`中`exited===true`且
     退出码为整数（把“产品保留未知”与“OS层已退出”两项事实并列，不由产品推断）。
   - c. 新增`RECOVERED_UNKNOWN_STOP_REJECTED`：`window.win7Agent.a9.stop()`返回`ok===false`且错误码
     `A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED`；调用后句柄状态不变、`report.helpers`计数不变（零新原生执行）。
   - d. 新增`RECOVERED_UNKNOWN_BLOCKS_SWITCH_AND_CLOSE`：`controls.canStop===true`、`stopKind==='managed_process'`、
     `conversationControls.canSwitch===false`且`reason==='当前对话仍有托管后台进程'`、`lock.held===true`、
     `normalCloseState(snapshot)===false`。
   - e. `RESTART_ZERO_PROVIDER_OR_TOOL_REPLAY`、`PID_REUSE_SIMULATION_FACTS_UNKNOWN`、`PID_REUSE_NO_STOP_OR_ADOPTION`、
     `RESTORE_NO_REAPPEND`原样保留。
   - f. 收尾：重启分支**不再调用**`closeAfterChecks`/`win.close()`（会弹原生退出对话框等待人工，且按设计必然无法正常退出）。
     改为在`driver-final.json`写`normal_product_exit:'BLOCKED_BY_DESIGN_NOT_PERFORMED'`与
     `isolated_test_exit:{code:0,method:'app.exit',reason:'recovered cleanup_required has no in-product disposition (A9-34)'}`，
     再`finish('PASS')`并`app.exit(0)`。`app.exit`跳过产品`before-quit`，工作区锁不释放，作为事实写入证据。
   - g. 重启实例的失败收尾：不再等待注定被拒的`failure product stop`（R8即因此超时；其后`win.close()`进入产品窗口关闭处理、产品树存活——后半为源码推断）；截图、写失败、
     `app.exit(1)`，控制器据K1记`FIXTURE_FAILED_TREE_CONFIRMED`。`hardFailure`分类不变，SAFETY/IDENTITY/INTEGRITY/
     LIFECYCLE等仍置halt并由控制器硬停。
   - h. 新增离线自检`--recovery-retained-self-test`：以R8真实失败句柄JSON（`driver-journal-restart.jsonl`中的
     `BACKGROUND_FACTS_ONLY`详情）为夹具通过新断言a，并以旧`exited`谓词拒绝之作反例；断言重启分支源码不含
     `closeAfterChecks`/`win.close`、失败收尾不含`failure product stop`等待。既有五项自检输出须不变。
2. **新根控制脚本**：stage/launch/serve三份由R8字节仅改根常量派生；观察器源与R8字节相同、按R8惯例在新根重新编译
   （新EXE/MVID/pin，不冒充继承）；master随新根新生成。不改控制器逻辑。
3. **Recovery专用评审`review-phase-r9.py`**：在现有`review-phase.py`断言基础上，仅对Recovery把pid比对改为
   `controller-final.restart_identity`，并新增：`crash_exit_code==93`、崩溃树与重启树全部已退出、重启实例身份为普通账户、
   `driver-final`含§2第1点f的两个字段且值精确匹配。其他phase不使用该脚本。
4. **证据措辞**：R9的Recovery PASS只表示“崩溃后不造终态、重启只恢复事实、保留清理未知、零Provider/工具重放、
   不接管旧输出、PID复用不误停”；**不表示崩溃后产品可正常关闭**。矩阵r9须写`normal_product_exit=BLOCKED_BY_DESIGN`并指向A9-34。

## 3. 新根、准入与容量

准确新本地根`.acceptance/a9-31-developer/product-r3-retry-r9`，远端`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261005-R9`，
两者须不存在。容量：2026-10-05T05:43Z只读核对C盘空闲8.5GiB；建根前再核对须≥4GiB，其余容量与每请求门槛沿用R8合同r2 §3。
准入沿用R8新根准入全套（观察器准入至多三轮、schema等定向检查、manifest绑定、真实缺口回放、package-held），
其中driver相关Node16（Electron-as-Node 16.17.1）行换为新driver，并增加§2第1点h一行；完整闭包stage须
`PRODUCT_R3_STAGED_FRESH_FULL_CLOSURE_PASS`。开始与结束各跑一次5448文件基线（R5–R8冻结字节零变化）。任一失败即停，
不回退旧revision。

批准后、实施前，在任务书逐一登记准确C14路径（R8曾事后补登记，本根不再重复）：新driver与其revision四文件、三份派生
控制脚本、观察器两源、`review-phase-r9.py`、派生/准备/部署/冻结脚本及准入记录文件；清单以登记条目为准，未登记不得创建。

## 4. 执行

负责人启动新普通入口一次；仅一个phase：**Recovery**，一个请求（normal-short新revision）。本phase无原生退出对话框，
**无需人工点击**；入口窗口内请勿点击，标题出现“选择”按Esc一次。每请求流程沿用R8：观察器就绪核验后才发请求、30秒接单检查、
终态后由代理发停止信号并核对观察器终态与proof对账；完整逐size/SHA返回、秘密扫描、SQLite副本检查；用`review-phase-r9.py`评审。
完成后补写矩阵r8与r9、统一报告§12/§13、STATUS。

## 5. 失败与边界

任一FAIL或HALT：保存证据、停止，不在本根重试（见D3），不创建第十根，另报。本批准不含：产品/native/锁/capture修改、
A9-34任何实现、控制器逻辑修改、系统/账户/ACL/服务/计划任务改动、删除、强制结束旧实例（含107280/77944/42732与R8入口窗口100464）、
提交/推送/合并/发布、委派、独立验收、Win7、第十根；不自签DEVELOPER_VERIFIED。不修改任何Accepted ADR，批准后另行追加ADR。
若A9-34日后改变产品字节，R9 Recovery证据随之失去绑定，须按增量矩阵在新字节上重跑。全部结果**未在Win7实机验证**。

## 6. 已裁决项与剩余待办

- D1（负责人已裁决）：收尾采用§2第1点f“`app.exit(0)`+PASS+显式字段”，控制器不改。
- D2（负责人已同意）：重启实例失败收尾按§2第1点g，不等注定被拒的Stop，直接`app.exit(1)`。
- D3（负责人已裁决）：Recovery任何FAIL或HALT均不在本根重试。
- D4（负责人已确认）：不预授权第十根。
- P1（建根前，代理只读核对）：C盘空闲≥4GiB；不满足则不建根并另报。
- 剩余：负责人对本修订稿（以其SHA256为准）作出明确批准。批准后先登记C14并追加ADR，再实施；实施、准入、冻结通过后才请负责人启动入口。
- 不在本合同内：A9-34的批准及其与第二批的排序（见该任务书§7），由负责人另行裁决。

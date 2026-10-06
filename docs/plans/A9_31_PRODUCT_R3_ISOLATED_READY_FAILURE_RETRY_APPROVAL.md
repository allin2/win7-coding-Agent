# A9-31：r3预期ready故障隔离、准确残留收口与Win10续验

日期：2026-10-04。Status: APPROVED_FOR_R1_R2_EXECUTION。负责人回复“批准”，绑定原R1–R2全文SHA256 affedbc6b1ff3a24243698ac3c795bb8ed3356b1fece4b49644e76961db4d1eb；不可变原文及owner记录存product-r3-retry-r2。下文保留批准时点方案，实际结果另行登记。

## 依据与可接受性

准确源码仍为`ebda91123e62b225c3fd104c9c9b564a4b61c466`；ZIP SHA256 `d951a89af285c4e60c5f4701efbfd54f34627fe103d8257c83636479f82ac74b`，manifest `0060fffff80335d48abd75e2bb784106114af7cca92db0b98e40ad8a65357a68`。工作树及分支不变，不重编产品/native。

旧run `6ad4b353ea2f42b3b665757ea02e4ca3`最后故意丢弃真实helper的execution_started。真实产品拒绝成功/继续派发，并持久化cleanup_required；helper及已捕获root/child实际退出，而产品仍拒绝正常关闭。负责人点击后报告“无法确认安全退出”；10:39:30Z只读同creation核验4个Electron实例仍在运行。原controller/dispatcher HALTED/held_tree_ended=false保持。SQLite只读回收DB/WAL/SHM完整性ok，未清除任何未知事实。

故障注入和产品拒绝属于预期反例；不能接受的是夹具提前写PASS、污染正常关闭流程。已在C3同一driver路径实现正常关闭前无残留检查、实际will-quit后才写PASS。本地Node20和目标Node16均语法、90项自检（17项关闭判据）及88项同步回执检查自然exit0；新revision `e5222304faad54802a13ac5cb908a0b35a9fa2f863670a449f832d3d6adbb281`，driver `2513c0640befa116fda9df520fdf01f1a46e2940936d760eab346e6a5b135595`。未在HALTED入口派发。

## R1. 只结束准确隔离测试的4个已知Electron实例

机器`192.168.1.4 / WIN-2JQ66JE4HTQ`；原目标根`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R1`。Administrator仅执行本节有界残留取证/终止，不作为产品运行身份。

| 实例 | PID | creation_ticks | 实际Session / RID / Job |
|---|---:|---|---|
| 产品Electron | 67164 | 639267057591067088 | 3 / 8192 / false |
| Chromium子实例 | 30024 | 639267057600752573 | 3 / 8192 / true |
| Chromium子实例 | 127340 | 639267057600672687 | 3 / 4096 / true |
| Chromium子实例 | 88580 | 639267057600898022 | 3 / 0 / true |

四者SID均`S-1-5-21-3031939772-989444280-3099258187-1005`，非提升；子实例的低完整性/Job为Chromium内部隔离，不冒充普通产品入口。四者原父/creation/映像关系已在旧controller持有记录中证明。映像只允许原根`host\electron.exe`，157602304bytes，SHA256 `2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb`。

执行时重新用固定查询组件和持有Process句柄核对每个PID、creation、映像、SID、Session、权限及原父关系，任一漂移停止；若已不存在仅记当前不在场，不补签旧exit。只对匹配的产品实例67164发送一次受控Process.Kill，保持已匹配四实例查询句柄并等待实际exit/exitCode/exitTime。其子实例若未结束，只可在再次同实例核验后结束表内该确切实例；每个最多一次，总量4、取证窗口最多60秒。不得按名称、通配符或其他PID结束进程。所有错误与原HALTED保留；本节属于隔离故障测试的残留收口，不是产品正常退出PASS，不删除任何文件/数据库/锁/证据。

## R2. 同一r3产物在新根完成原八phase

准确新本地根：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r3-retry-r2`。

准确远端新根：`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R2`。必须原本不存在、无reparse、准备前≥2GiB空闲；根总量≤1GiB、每请求≥1GiB。只有package/host/inputs/control/requests/runs/evidence及原框架有界文件；继承权限，不改ACL。旧根只读保留，R1是唯一终止例外；不恢复其HALTED控制器/master。

批准后在任务C14登记四个精确新外部源，仅复制当前r3对应四源：

- `.acceptance/a9-31-developer/product-r3-retry-r2/control-scripts/stage-product-r3.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r2/control-scripts/launch-product-r3-desktop.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r2/control-scripts/serve-product-r3-desktop.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r2/control-scripts/product-r3-driver.cjs`

仅修改新根/新批准/master绑定、正常关闭判据及ready故障实例隔离；源码/产品/native/锁/九字段请求/schema/八phase/安全和退出判据不改。普通full Background覆盖全部正常后台与十组审批，ready失败的全部原断言在另一个不可变同phase专用driver版本执行，不减少合同覆盖、不冒充继承。新增版本先在实际Node16/PS5.1能力检查，冻结准确hash/checks/registration；不得热改执行输入。

ready专用实例只执行真实Core/preload/Renderer/SQLite/native反例：starting审计先落盘、丢execution_started、原错误/零输出/零成功、再请求被拒绝且零额外helper；真实Stop保留cleanup未确认，SQLite不能伪造tool_end/正常清理终态。在上述反例成立后，明确记录隔离故障及保留状态，以`driver-final FAIL`和有界`app.exit(94)`结束这一个测试实例，控制器用原持有句柄证明全部实际实例已退出。保留原FAIL和非零退出；只有准确专用版本、明确注入、全部安全断言、零后续派发、真实整树exit与秘密扫描均成立时，人工证据复核才记EXPECTED_NEGATIVE_CASE_PASS。任何不匹配或未知exit立即HALTED；该规则不泛化为接受未知生命周期，不在失败产品实例继续派发。

普通full实例继续使用正常关闭前无残留检查，收到真实will-quit才形成driver PASS，控制器再独立证明整树exit；二者同时成立才记正常phase PASS。StopExit/ReleaseExit仍走真实原生退出选择，不能用上述隔离崩溃代替。

产品ZIP/manifest与73文件host由原锁定本地输入重新展开并直接全闭包核验，禁止重新生产新产品字节。固定C#源、DLL、MVID及原build/原C1–C3编译批准逐字节继承并保留原来源：DLL `93f1979a8a8dbf87cf609d95f3b48ee17c7c3b9b5334dc3506c989961f253505`，MVID `29314b2e-7db0-4cd9-9654-23f9ed807361`，build `09fe18f933a08c08d28220d48a26cdbdae4f059faca53c9688dc5afbe9411305`。新根只复制、核验并加载这些准确组件；不重新编译或更改C#，不重绑原build批准。原compiler/reference/kernel32/API/Profile及SYNC安全片段、5秒交付/700ms背压合同不变。新根实际查询/区间/精确UTC/回执与夹具协议重新检查，组件字节继承和本次实际能力证据分开登记。

普通dispatcher/worker/产品须直接核验SID1005、Session3、Medium8192、非提升、InJob=false。Computer Use普通桌面入口；输入失败时沿用负责人一次手工输入协助，其余核验/派发/回收由代理执行。Administrator只准备/固定派发/查询/回收，不管理员启动产品、不计划任务或脱离Job。

新窗口仍120分钟/16请求。顺序：受控Boot失败/整树exit→正常Boot→后台最短→full Background→专用ready反例/独立树结束→Shell→EncodingSecurity→FailureBoundaries→StopExit→ReleaseExit→Recovery。最短真实链路先行；同范围普通夹具修复允许先检查、冻结新版本及有界重试，安全/身份/完整性/必需审计或非预期未知生命周期立即停止下游。原八phase合同完整覆盖后，完整inventory/逐hash回收、秘密扫描、输入后飞行和实际树退出才能形成整批Win10结论。

## 范围与批准原因

不含源码提交、推送、合并、发布、删除、产品/native/锁改变、账户/系统/ACL/UAC/Bitvise改变、子代理、独立收口或Win7。不放宽产品停止/移交/清理判据；所有历史FAIL/UNKNOWN保持。

新根写入和明确故障实例终止超出原C3准确R1根及正常退出授权。依据[A9-31任务书§6](../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)：“本任务后续源码提交、原生kit批准/双构建、远端新目录/写入、本地整合与候选门另行具体批准”。故请求一次批准本材料R1–R2；普通夹具guard实现/检查已经在原授权内完成，未因审批暂停独立工作。不是skill新增审批或Auto Review拒绝。

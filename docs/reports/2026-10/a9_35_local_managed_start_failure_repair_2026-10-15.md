# A9-35 后台启动失败本地修复（2026-10-15 UTC）

结论：9路径授权内修改了3个产品文件和2个测试文件，最终产品提交5f7c0e80a2c25ffb09b2d21fe6b154b98a12abe2。开发机Node20.17.0的runner四文件122项、产品运行时17项和verify:quick通过；第2轮独立增量复核0P0/0P1/0个新增P2产品缺陷。负责人已批准10路径清单，A9-33已本地快进至ce952760…，产品字节一致；本次不重跑产品检查，相关结论标INHERITED_EVIDENCE。未推送或远端执行，Electron、新包、Win10、Win7均NOT_PERFORMED，不能关闭BG03。

## 1. 基线、授权和首失败

批准文档基线d1b5275f6bc46253d2b16990c42f9f19ca2ee858，产品基线548ef0a65fa307a2af7932958236e0c5a7a0c932。负责人回复“批准”后，4文件文档登记提交dd7b92fd1ca4de606358b228feb822c21ef4c253，docs:check355/50通过；产品字节未变。隔离工作树为`/Users/qlyf/.codex/worktrees/a9-35-managed-start-failure/win7-coding-Agent`，分支codex/a9-35-managed-start-failure。

合同为[A9-35](../../tasks/A9_35_MANAGED_START_FAILURE.md)。只本地实现、验证、独立复核和提交，不推送，不与A9-33整合，不启动新远端执行。

预演16的原FAIL与UNKNOWN保持，见[A9-33首失败报告](a9_33_win7_45_rehearsal16_product_block_2026-10-15.md)。旧DB/WAL/SHM只读，未访问凭据。带WAL的只读分析副本确认turn active、缺tool_end、pid=NULL与cleanup_required。接口错误不能据此认定真实磁盘写入失败；具体helper原始启动结果没有被产品事件保存，仍UNKNOWN。

## 2. 最小复现与修复

先补测试再改实现。绑定旧产品代码的red-runner-corrected.log有4项行为失败：不存在cwd、cwd为文件、stat遭EACCES、错requestId的完整清理回执；red-shell.log有1项行为失败：受控ready拒绝且清理证明完整，却被运行时当成审计故障、缺正常失败结束。初次EACCES测试因对TS导入getter执行spy失败，red-runner.log保留，该次不能算行为反例；改为对真实fs模块spy后重跑。

trusted-shell-runner在后台分支进入helper与记录intent之前stat检查cwd，已知不可用或非目录返回明确未启动事实。检查不证明以后状态，检查后目录变化仍按真实helper结果保留UNKNOWN。没有增加权限、原生API、协议或依赖。

运行时只对cleanupRequired未明确为false的failed句柄保留原硬停；清理已证实的正常失败作为失败tool_end落库。持久化异常仍走原blockManagedAudit，不恢复后续派发。SQLite BEFORE INSERT触发器实际制造终态审计失败，验证新请求不再发送；原starting及late-output审计失败回归保持。

manager消费终态及ready拒绝的清理结果时，额外核对同requestId、协议版本和profile。缺证明、错请求/版本/profile或不完整清理字段保持cleanupRequired，不凭PID消失清除。补充profile反例在第一版修复仍失败（red-profile.log），随后修复并通过。

## 3. 检查与证据等级

证据根为该隔离树`.acceptance/a9-35/`；所有测试使用既有离线依赖、Node20.17.0。未安装或下载。

| 检查 | 结果与证据 |
|---|---|
| verify:quick（依赖先构建，含lint/build） | PASS，verify-quick-final.log |
| runner四文件（trusted-shell-runner、contract、background-process-manager、native-transport） | PASS 119，runner-final.log |
| a9-background-tools真实运行时与SQLite | PASS 17，shell-final3.log |
| 当前dist消费者身份 | current-build-consumer-identity.json；实际加载新runner和adapter，再恢复跟踪dist用于干净提交 |
| docs:check与diff | 提交前实际检查，结果登记任务记录 |
| Electron/实际D-013 helper/新包/Win10/Win7 | NOT_PERFORMED |

17项含3个当前dist消费者场景，实际Core→产品运行时→当前runner/adapter→manager→SQLite，但helper为受控替身。完整清理、缺清理与预启动拒绝分别断言；预启动拒绝零helper、零句柄、一次failed tool_end，turn不再active。既有健康启动、中文空格所有权、Stop/release、迟到输出和真实审计故障均回归。

中途修正测试的两类问题保留日志：shell-green2.log的结果JSON格式断言改为解析JSON；shell-final2.log暴露旧release替身遗漏profile字段，补齐协议既有字段后通过，未弱化生产校验。未将测试工具错误或夹具错误算产品反例。

## 4. 未关闭项与后续

实际native-transport对没有execution_started的v3 execution_result仍按既有协议顺序拒绝；error帧也不包含完整清理证明。本轮未修改该协议或放宽判据。因此完整ready失败清理仅为受控manager/产品消费者证据，实际helper与Win7均NOT_PERFORMED。无效cwd的预启动拒绝不能冒充BG03的启动后ready失败清理证明。

准确代码提交后全新Codex会话独立复核；形成0P0/0P1报告后，再给负责人准确修复SHA、报告和整合清单。A9-33本地整合、新目标执行与上述验收缺口裁决均待负责人批准；冻结、门A/B、正式运行和完整Alpha2未授权，旧失败不改判。

## 5. 第1轮独立复核及合法错误帧诊断修正

第1轮全新Codex会话01a13e98-98a8-7ab2-8e27-a6a5721d2f8a对4044272061a5d669e18edef7a743bf7cb5210fe9报告0P0/0P1/0P2，建议准备准确本地整合材料，不签整合；原报告与CLI回复、日志、8项自选探针、6项消费者检查及3项可编译行为变异归档于.acceptance/a9-35/review1/independent。实际ready失败证明缺口仍开放。

执行者补查发现新诊断问题：v3合法error帧按既有协议不携带profileId，新增统一profile核对误报IDENTITY_MISMATCH，遮盖原始错误消息。red-error-frame.log在4044272产品字节上具名断言失败；这不是独立报告已发现项，也不改写其原结论。修复只让合法error帧免于不适用的profile检查，仍核对requestId/版本；execution_result/released仍核对profile。新增合法帧及错requestId/版本共3例；全部保持UNKNOWN/cleanupRequired，不增加清理成功路径。

修正后开发机runner四文件122、运行时17、verify:quick通过（error-frame-runner.log/error-frame-shell.log/error-frame-verify.log）。当前dist消费者全部结束后另记error-frame-build-consumer-identity.json，原首次构建身份JSON不覆盖，才恢复tracked dist。新提交须另开全新会话增量复核；在其结束前不使用4044272的报告覆盖新字节。

## 6. 第2轮独立复核完成

全新会话01a13ea8-88d5-75d3-bd22-d22c647441a2，模型gpt-6.1-sol / xhigh / default，08:23:14Z～08:34:58Z，退出0。对5f7c0e80a2c25ffb09b2d21fe6b154b98a12abe2相对4044272…报告0P0/0P1/0个新增P2产品缺陷，建议准备准确本地整合清单，不签整合或目标执行。

详细报告SHA-256为55950b8a67fb942aace53801b07ef7b80f09ea768895ba0f202eb23923dd4d82；归档.acceptance/a9-35/review2/independent/codex_final_report.md。报告、CLI最终回复、事件、脚本、日志及新消费者夹具共98文件保留，ARCHIVE_SHA256SUMS.txt逐文件绑定。第1轮报告SHA为401bb4ab659570d19dfc07c5d9a9be754839849f02db875fa7e5bd79f9f13745，102文件归档核验一致；其未变化部分按准确字节标INHERITED_EVIDENCE，不覆盖新诊断行为。

本轮直接verify:quick、shell17、docs357/50、diff通过。runner首轮121 PASS/1时序FAIL：未变化实时流测试首块3931ms超过原3500ms；首失败保留，原因UNKNOWN。原阈值未改，隔离1项通过后原四文件完整复测122 PASS，不将首失败改判。独立5项拒绝探针及1个当前dist消费者通过，包括真实SQLite中的诊断脱敏、未知清理和零后续派发。

唯一增量变异恢复404的错误条件，编译成功后具名用例和当前dist消费者均行为失败；恢复后相关合同13项、独立探针及消费者通过。源码、runner dist及全部444构建输出逐SHA恢复一致；所有消费者结束后才恢复副本tracked dist。取证工具对分段诊断文本的误匹配单独记录，不算行为变异、不重做或削弱产品断言。实际helper、Electron/Node16、新包和目标平台仍NOT_PERFORMED。

## 7. 准确本地整合材料（待负责人批准）

目标树为`/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent`，分支codex/a9-33-batch2-win7-acceptance，当前干净HEAD dd7b92fd1ca4de606358b228feb822c21ef4c253。来源为本树codex/a9-35-managed-start-failure，产品5f7c0e80a2c25ffb09b2d21fe6b154b98a12abe2及承载本条的纯文档后继提交；批准问题绑定完整目标SHA与最终清单SHA，不用浮动分支名代替身份。

从目标HEAD至最终整合目标共10个准确路径，5个产品/测试均在A9-35授权9路径内：

1. src/runner/src/background-process-manager.ts
2. src/runner/src/trusted-shell-runner.ts
3. src/runner/tests/trusted-shell-runner-contract.test.ts
4. src/shell/product/a9-agent-runtime.js
5. src/shell/tests/product/a9-background-tools.test.ts
6. docs/STATUS.md
7. docs/STATUS_LOG.md
8. docs/tasks/A9_35_MANAGED_START_FAILURE.md
9. docs/reports/2026-10/a9_35_independent_review_handoff_2026-10-15.md
10. docs/reports/2026-10/a9_35_local_managed_start_failure_repair_2026-10-15.md

建议批准动作仅为核对目标HEAD与干净状态后，快进至批准问题中的完整SHA；身份或状态变化就停止重新核对，不覆盖/丢弃用户修改。不推送、不远端执行、不构建目标包、不冻结或签Gate，不修改BG03判据、不改A9-33的20路径实现白名单。后续产品修复仍回A9-35合同分支。

逐文件SHA及准确两端见本树.acceptance/a9-35/LOCAL_INTEGRATION_MANIFEST.json，在最终文档提交后形成；该文件不属于产品变更。315个预演16保护文件曾全部重核一致，旧失败、未知句柄生命周期、HALTED及所有候选不改判。

实际ready失败证明仍需另行形成精确范围的后续合同和目标执行材料。此处不批准协议/native/锁变化或以预启动拒绝替代原验收要求。

## 8. 负责人批准与本地整合完成

2026-10-15 负责人对准确问题回复“批准本地整合（不推送、不远端）”。批准目标为ce952760c8118b177c3570208a32c7941f0b0b8b，A9-33起点dd7b92fd1ca4de606358b228feb822c21ef4c253，10路径清单SHA-256 7f02ff06efd415511901abbfc3a15a97ef6a6c87ff113341ca9c50d12aae1b2b；这次批准仅覆盖该本地整合，不扩展实现白名单或目标执行权限。

整合前两端分支、完整HEAD、干净状态、清单本身及全部10个Git对象/源树文件哈希、独立报告哈希和祖先关系逐项核对通过。随后在A9-33执行git merge --ff-only准确目标SHA，成功快进，无冲突、无新产品编辑。整合后产品/测试字节仍与清单及复核对象一致；本条及状态记录为后继纯文档提交，不改变产品字节。

开发机runner122/运行时17、verify:quick及独立复核结论按相同源码、依赖与参数边界标INHERITED_EVIDENCE。本次只做快进、身份/完整性核验及文档检查，不运行产品测试、目标包构建、Electron或远端。原时序首失败、BG03缺口、预演16 FAIL/UNKNOWN、97/124累计请求、连续成功0次和历史HALTED均保持。

原始证据继续保留在源树`/Users/qlyf/.codex/worktrees/a9-35-managed-start-failure/win7-coding-Agent/.acceptance/a9-35/`，不搬移、不覆盖；清单为LOCAL_INTEGRATION_MANIFEST.json，完成核验另记LOCAL_INTEGRATION_RESULT.json。两轮详细报告仍分别在review1/independent与review2/independent。后续真实ready失败证明合同、目标执行、冻结、Gate A/B及正式运行未授权。

## 9. 本次 Win7 预演17首失败与套件退出观测修复

负责人指令“就在win7验证”后，在Win7 SP1 x64的DCCS-CHAIZL-PC、普通agent/console2执行了新包预演。源5a14cf70865ce4a27cc1a641c4179b94e1f12d1d，ZIP f6970165ef316df2088f69268c29bd8670da8209e2e71c713a333b747ecdf216（101679411字节）；manifest 1c3e07a3645768d8ad402dd028557a366b375324db6819cbd0dd05974ef54152，kit bc03cc96364d4a97bd5214c5a8943512f78108f524a031868412e21e85955167。授权文件SHA-256 1aa80e989ca45c1c1c3b9b5f4a64b55c26dae280a948b2b1c47d4d8278a24d73，run 4c94e8f1-8416-42e3-b34e-cd7a5c2b5b91，新根C:\A9-W43\run\4c94e8f1，窗口09:02:41Z～17:02:41Z，总截止不变。

结论为Win7实机预演FAIL（REHEARSAL_NOT_ELIGIBLE），连续成功0次。p01～p04 PASS；p05的S06、BG01、BG02及BG03-A01 PASS。无效cwd现在返回A9_BACKGROUND_CWD_INVALID，恰好一个失败start_process tool_end（event132），零新增句柄事实及零残留，Turn可正常结束。此证据确认预启动拒绝修复，不能替代真实helper启动后ready失败清理证明；后者仍NOT_PERFORMED，BG03整体不关闭。

BG03-A02 FAIL：release driver PID6844，持有命令root PID2968，句柄sh-1792055380740-1e5807ac。产品实际对话框index1点击成功，09:09:42.996Z的will-quit所有权事实按owned→release_intent→released持久化（event142/149/150；releaseId e606f4178c03a7fdee84d6e35a9a9b6d）。launcher返回code0却记killed_by=timeout，耗时306956ms；300秒released-hold夹具在最后观察时已不存活，因此exit_ok与released_alive均失败。实际Win7独立exit事件时间未记录，不反推精确退出时刻或后代退出码。09:15:11Z停止，p06～p10 NOT_PERFORMED；5 CONSUMED/5 COMPLETED，累计102/124。

R1～R4身份、完整性与10文件传输通过。09:16:17Z R8当前102进程、相关命中0、本次任务0；未追加强杀。R7回收242文件大小/哈希全匹配；173文件秘密扫描零命中且正控检出。755件原包、输入与首失败保护清单SHA-256 0817de6b09dd388480f4933e46e0823c3dbb2c77309e08e4d17bd4d3062f3b21。原始证据在A9-33树.acceptance/a9-33-rehearsal/rehearsal-17，不修改其中保护文件。

首次工具启动漏生成任务XML，09:04:52Z在注册任务/消费请求前停止。该现场、空输出目录和纠错记录已保留；只补生成未消费的新任务XML，10个已传输输入逐SHA不变后执行。该工具失误不计为产品失败或请求消费，不覆盖首停日志。

源码诊断发现launchDriver只等待close；被释放后代若保留stdio句柄，会使driver已退出后仍等待管道EOF并最终触发旧PID超时清扫。开发机Node20真实子进程最小复现为exit0在21ms、close0在1549ms，支持上述原因推断；该推断不能改判预演17。套件修复只对release_exit采用该ChildProcess实例的exit事件，取消后续计时器并只unref读管道而不关闭它。非零退出/信号/已触发timeout仍失败；普通mode继续等close，产品所有权、存活、残留及按创建身份清理判据不变。没有延长超时或改300秒夹具，没有产品/native/协议/锁变化。

两个变更文件均在A9-33 §6.1白名单：release/win7-product-v3/a9-batch2-smoke.cjs及src/shell/tests/product/a9-batch2-contract.test.ts。新增5例中，旧套件4项行为失败/1项控制通过；修复后5项通过。开发机Node20完整Shell Jest284（合同241/运行时43）、包node --test120、verify:quick通过；日志exit-close-*及编译输出身份保留，消费者全部结束后才恢复跟踪dist。沿用§6.39/6.56的同范围修复、独立复核和新不可变预演授权，不盲目重试旧run；本地提交沿用§6.64持续授权，不推送。第21轮全新独立复核后才重建新包并恢复有界Win7验证，不冻结、不签门A/B或正式运行。历史FAIL/UNKNOWN/HALTED及KL边界保持。

## 10. 第21轮关闭与Win7预演18 PASS

套件修复已沿用持续本地提交授权提交为ba042757a04f428cb3db3ccd10888a7bebe97d3b（7路径，清单SHA-256 a6716c79065c0a764904c7b4c4b1141b958cc9a143203f71be87e7a1026d9740；未推送）。第21轮全新独立会话01a13ee9-77f7-7c90-ae32-64aa365930fd，09:34:09Z～09:45:58Z正常退出0，报告0P0/0P1/0新增P2，建议准确字节重建后有界预演。报告SHA-256 f7649fd1b485d511fbd12b9f21f6978ef8e998b59b21e5b8bc1d07b378c00e52；109文件归档在A9-33树.acceptance/a9-33-review/codex-release-exit-round21-20261015/independent，原复核根/private/tmp/a9-33-codex-review-root-27保留。

复核直接构建通过，Shell完整命令275 PASS/9 listen EPERM UNKNOWN（退出1），新增5例及真实Node消费者6例通过，两个语法有效变异被具名行为断言拦截并逐SHA恢复。包120按完全相同源码、输入和68项runner编译身份继承，产品第2轮及套件第20轮只继承未改范围。真实消费者验证release在22ms返回、pipe约698ms才close且继续读取两路各524314字节；普通mode继续等close，非零/信号/实际timeout保留失败。无收尾消费者退出后后代写管道EPIPE的侧实验失败保留；实际套件在返回前await清理和身份观察，不依赖消费者退出后管道仍可用。详细夹具首失败、沙箱UNKNOWN及原时序首失败均不改判。

Win7预演18绑定同一源ba042757…，ZIP ae1d4bb109df68c2f23e08cb4b927f2168f7a1f645969643f35101bf8f9da96e（101680489字节），manifest 520bda7e34cade8c611d8d28120a46b046519b462e3df8978968efc45e07c7df，kit 64804b2fc964fb22a9b380d912c92ba3ad819ed50a8d70ca3c5a078b7c930ed1，授权5c5b54daf41a88892d219237f157a305bc523f89fa695925729b7787ac22e709，run f17a0389-cc4f-4e0a-892a-b1950bc6b365，新根C:\A9-W43\run\f17a0389。窗口09:47:43Z～17:47:43Z。新包仅5个条目与预演17不同：smoke、kit、manifest、SBOM及合同记录；产品、native、锁不变。

R1指定Win7/普通agent/精确SID/console2、空间与无Electron/helper通过；R3的10文件大小/哈希一致、R4解压manifest匹配，逐任务XML回读通过。09:49:52Z～09:57:30Z顺序执行p01～p10，全部PASS；25用例、43断言全部PASS，10 CONSUMED/10 COMPLETED，累计112/124，连续成功1次。身份仍REHEARSAL_NOT_ELIGIBLE，不计正式验收。

关键直接结果：无效cwd正常拒绝再次PASS；BG03-A02 release driver PID1748正常code0/signalNULL/killed_byNULL，4391ms退出。owned→release_intent→released同releaseId持久化；退出后root PID1544/创建时间20261015175322.838137+480同实例存活，套件按创建身份终止并确认无残留。普通Stop/快速退出、刷新分页/重启、主动继续、安全、UI、报告和运行后检查均PASS。真实helper ready失败清理仍NOT_PERFORMED，不用预启动拒绝替代。

R8于09:57:37Z当前103进程、相关命中0、本次任务0；没有追加目标终止。R7最终338项大小/SHA全部匹配：254项本次直接远端证据，84项与准确包逐文件大小及SHA-256一致的driver/runtime载荷标INHERITED_EVIDENCE。权威清单来自当前run远端sum-tree；原始run结果由逐阶段回收和R7工作区/数据回收取得，每项来源及hash写r7/reconciliation-inputs.json。不能把载荷复用写作新传输或新平台验证；目标实际加载与行为仍是本run直接证据。

工具注意：整树默认SFTP下载在大Electron文件上缓慢，另一次legacy只读下载同样保留。完整内容来源均已匹配远端清单后，仅向两个已核对PID/命令的本地SCP客户端发SIGINT，没有终止目标进程；两次传输exit1及partial目录保留，不把它们改判成功。canonical evidence在新目录用来源字节重建，338项再次逐大小/hash核验且无额外/缺失。第一次本地来源分类只允许driver-electron，误拒绝同包driver-app/main.cjs；该首停及纠错记录保留，只修来源分类，未改产品判据。其后续shell曾继续本地扫描/19准备，但19远端动作在完整R7 PASS之后才启动。此处不是Win7测试失败重试。

本机264文件扫描零命中且正控检出，不补签旧run。2029件原包/输入/账本/结果/传输记录保护清单SHA-256 e35af909a02a215d8ac14c64bdaecae7642f53c6d03f09a7aef034ee7fcf7125。预演16的315件及预演17的755件曾再次复核不变。原始FAIL/UNKNOWN/HALTED和KL-3、KL-5、KL-6a、KL-7含a/b/c及其他已登记限制保持。

## 11. 同包Win7预演19 PASS，两次连续成功已取得

结论：Win7实机工程预演18、19连续成功；每次p01～p10、25用例、43断言全部PASS。两次均绑定源ba042757a04f428cb3db3ccd10888a7bebe97d3b及ZIP ae1d4bb109df68c2f23e08cb4b927f2168f7a1f645969643f35101bf8f9da96e，目标始终DCCS-CHAIZL-PC/Win7 SP1 x64、普通agent精确SID/console2。预演19复用同一不可变包，没有重新构建或新增产品/套件变更。两次仍为REHEARSAL_NOT_ELIGIBLE，不作为正式验收证据。

预演19授权SHA-256 f62aea1209ebbeb09041958fcddba40c0bcceb614498ade3a9ffd509b10ce05a，run 2317fe31-d0f4-4c59-ad33-201000e44ac9，新根C:\A9-W43\run\2317fe31，窗口10:06:28Z～18:06:28Z；总截止2026-10-16T06:59:59Z不变。按原§6.39/6.56授权在聊天报备后把累计上限124提到156，单次16请求/7200秒保持。R1～R6身份、空间、10文件大小/哈希、manifest和逐任务回读通过。实际10:08:27Z～10:15:49Z顺序执行，10 CONSUMED/10 COMPLETED，累计122/156，连续成功2次。

第二次BG03-A01中无效cwd正常拒绝、零新句柄/零残留；BG03-A02释放driver PID7848正常code0/signalNULL/killed_byNULL，4887ms退出，对话框index1点击成功，持久化owned→release_intent→released且同releaseId。退出后root PID2968/创建时间20261015181200.886344+480同实例仍存活，套件按身份清理后确认无残留。该PID与旧run同号不能继承旧身份，证据按各自创建时间区分。Stop、快速退出、刷新分页/重启、主动继续、安全、UI、报告与运行后检查再次PASS。

R8于10:16:31Z当前103进程、相关命中0、本次任务0，没有额外目标终止。R7复用18已核实的传输方法：远端当前run SHA/大小清单、直接回收本次workspace/data/driver-app、已直接回收的逐阶段结果，以及当前包中完全同大小/SHA的运行时载荷。338项全匹配且无缺失/额外；255项本run直接证据、83项driver-electron载荷INHERITED_EVIDENCE。原始脚本未覆盖；新执行编排、diff和工具哈希保留在rehearsal-19-preparation，R8代码与既有远端动作不变。任何来源缺失、大小或哈希错误均拒绝，不用旧run的行为证据顶替。

264文件扫描零命中且正控检出。1983件原包、输入与结果保护清单SHA-256 6ff6ecc036cafb1b928e00bbd6c5b07e969a1e1423295c6bf387121800d696a7。两次逐账本COMPLETED的result_sha256复算与原phase-result一致；REHEARSAL_RESULT.json分别写在rehearsal-18、rehearsal-19根，后者绑定前次成功run与连续成功2次。原始首失败、数据库及全部旧候选保持。

已完成当前指令要求的Win7实机验证及合同两次连续预演。真实helper启动后ready失败清理仍NOT_PERFORMED，KL-12保留，预启动拒绝不替代这项证明；两次套件PASS不把该缺口关闭。KL-3、KL-5、KL-6a、KL-7含a/b/c及其他适用限制仍有效。当前新候选的双干净构建、冻结、新关口A、正式运行、第三阶段独立复核和关口B均NOT_PERFORMED；关口仅负责人可签，不借用旧签字。未推送、未碰Win10或改系统设置，后继仅本地提交任务记录。

## 12. WIN7-45 双干净构建、冻结与门 A 材料

负责人在当前会话要求按正式验收计划推进。开发机从两个独立干净分离头工作树各构建一次，源码均为ba042757…；两个ZIP与预演18/19包逐字节相同，SHA-256 ae1d4bb109df68c2f23e08cb4b927f2168f7a1f645969643f35101bf8f9da96e，101680489字节。800项内容比较零差异，生产者内置完整性检查通过。首尝试缺模块TypeScript依赖链接而失败、无ZIP，原始记录保留；补齐既有链接后以新输出目录成功，产品和依赖版本未改。两工作树共享同机依赖和三个锁定ZIP，跨机器可重复性UNKNOWN。

WIN7-45于2026-10-15T11:48:38Z冻结到主工作区.acceptance/candidates/WIN7-45，11文件与目录只读。DOUBLE_BUILD.json的SHA-256为7a10cfbde9e3e2e735fb88fc3c54bc233b1e9a07e874376391cfe2c210429c2d；本树.acceptance/a9-33-rehearsal/w45-formal-preparation保存全部命令、失败、输入、静态核对和比较。候选内校验器本地静态核对799manifest文件/800ZIP条目零不一致、25用例/43断言一致；DRAFT拒绝符合预期。自算pin仅证明结构，不能代签门A，也未运行Electron/native。冻结前24件旧候选/预演保护文件的大小和哈希核对一致。

新run为5773470e-a1c0-402b-8454-966e38a73f68；待签发载荷SHA-256 47fe7cae16961cac6124ed0aebab56f66e562550a2e025ca02a121b21d86de2d，新[交接书](../../plans/A9_33_WIN7_45_ACCEPTANCE_HANDOFF.md)给出目标、角色、16请求/7200秒、签发后8小时且不晚于2026-10-16T06:59:59Z的窗口和R1～R8闭集。载荷机器状态字段不是负责人签字；准确SHA确认和外部回执形成前不派发。正式25用例/43断言不继承预演PASS；真实helper ready失败清理仍NOT_PERFORMED（KL-12），旧限制和失败保持。

本轮未连接远端，门A、正式Win7、正式证据独立复核和门B均NOT_PERFORMED。后续需先由负责人确认准确载荷SHA及所列边界。完整Alpha2/RC、ADR-0155、DEVELOPER_VERIFIED、推送、合并和发布不在本轮范围。

## 13. 门 A 批准后的 WIN7-45 正式执行

负责人对准确载荷47fe7cae…和交接书范围回复“批准”，候选外回执及独立pin已落盘；authority与冻结ZIP原字节不变。批准首次观察11:58:37Z，消息精确时间UNKNOWN，正式窗口至19:58:37Z。正式run5773470e-a1c0-402b-8454-966e38a73f68于12:04:09Z～12:12:19.870Z执行，490.87秒，10阶段/25用例/43断言全部PASS，10请求消费和完成，结果hash闭合；没有正式重试。证据层级为Win7实机正式执行，source仍ba042757…/ZIP ae1d4bb1…，不是门B裁决。

R1准确目标/普通agent/SID/console2/空间/新根不存在/无Electron或helper通过；R2～R4仅新根、10文件两端大小/SHA和解压manifest通过；R5每个任务XML逐字段回读通过、用后逐项移除。p02确认Win7 Electron22.3.27/Node16.17.1/ABI110及模块加载；p09复算8/8阶段并拒绝8类负例。传输前外部phase.cmd的旧预演路径已留原件并仅改新run绑定；本地collector首版语法错误被compile拦截，未运行目标，修正后完成回收。冻结包和批准载荷没有改动，准备错误不算产品验证或正式重跑。

BG03-A01无效cwd在helper启动前拒绝，未覆盖真实ready失败清理，KL-12保持NOT_PERFORMED。BG03-A02所有权owned→release_intent→released、同releaseId，产品正常code0/4535ms退出且未被工具终止；被释放PID4980/创建时间20261015200803.055388+480同实例仍存活，再按身份清理无残留。原始文件为当前r7/evidence/requests/05-p05-session-bg/的release-ownership-events.json、release-held-exit.json与phase-result.json。

R8于12:13:33.256802Z观察103进程/相关0/本次任务0，无额外目标终止。R7共338项大小/SHA全部匹配：255本run直接、83相同包runtime载荷INHERITED_EVIDENCE；原远端清单、逐项来源、原始DB/WAL/SHM与阶段结果保留。264文件秘密扫描零命中且正控有效，不扩大到未扫描范围。FORMAL_EXECUTION_RESULT.json SHA-256 0870f03564ff16f754f2a03fda15094b4719d874d43f69980a17a6b3635e36f5；1989文件保护清单SHA-256 a9ab27db2fd9518f6b52d27764feeb32e3cfba463c9350b7376ee0255e39a732。冻结身份与24件旧候选/预演保护文件再次核验不变。

未参与执行的全新Codex会话已启动技术独立复核，原始请求与报告写在本树.acceptance/a9-33-review/win7-45-formal-5773470e；结论尚未形成，门B NOT_PERFORMED。KL-3/5/6a/7(a,b,c)/12与其他限制继续携带，旧FAIL/UNKNOWN/HALTED不改判。后续只有负责人可签门B；未推送、合并或发布，不签完整Alpha2/RC、ADR-0155或DEVELOPER_VERIFIED。见[A9-33 §6.74](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#674-门-a-批准win7-45-正式执行与证据回收2026-10-15-utc)。

## 14. 独立复核结论与未关闭的 KL-12

独立复核已完成：0P0/1P1/0P2，不建议按当前未缩小合同进入门B签发PASS。报告SHA-256 65cbe27f1548a9d8296fd28fbf0ecc03878470344c75054c0dc4d361330a91b3，路径本树.acceptance/a9-33-review/win7-45-formal-5773470e/independent_review.md。独立复算保护1989件、ZIP800/manifest799、338项R7及来源、25/43和56件必需直接证据、10请求/10XML/7DB/8负例一致；扩展扫描2013文件零命中/7类正控有效，9截图逐张检查。未重跑候选/目标，未逐项重建全部731个IPC时序或扩大未覆盖环境结论。

唯一既有P1剩余项为真实helper启动后ready失败清理NOT_PERFORMED。事件136只是A9_BACKGROUND_CWD_INVALID的预启动拒绝；原合同仍要求ready失败直接执行。release部分已由真实持久化与退出/同实例清理关闭，没有新增产品运行缺陷发现。阶段结果终点490.870秒与最后账本完成491.265秒分别保留；原始43PASS不改，未执行项不改为PASS或产品FAIL。

原始SyntaxError命令和工具返回已从本会话日志12:01:17～18Z、417/419/420行准确提取；来源索引SHA-256 7a26d10a241d6d2a71741950fc37e758776125489f08de965d08de53c54f7248，独立逐字节核对通过。展开字符串当时未落盘，不冒充原件；本地错误编译不发起收集，但同一调用先前部署已经在获批范围内进行。补充记录不改正式1989件保护清单。

负责人尚未选择保留原合同补证，或明确排除该项、仅裁决已覆盖范围。门B、候选正式签发与完整Alpha2/RC均NOT_PERFORMED；不自动追加远端、重试或改冻结候选。处置材料见[A9-33 §6.75](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#675-独立复核完成kl-12-p1-与负责人待裁决2026-10-15-utc)和[交接书§10](../../plans/A9_33_WIN7_45_ACCEPTANCE_HANDOFF.md#10-独立复核结论与门-b-前置处置2026-10-15-utc)。

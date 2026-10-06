# A9-31 r3源码、开发包与Win10执行（2026-10-04）

R4保持HALTED，整批Win10仍不PASS。后续已批准的manifest诊断补齐精确创建/退出FILETIME和Start完整系统映像：12 cmd/12 conhost、48事件、退出0/零丢失/自有会话停止，36项真实报告回放与反例通过，26文件264909bytes完整回收。普通控制器尚未接入；R5仅有待批草案，旧conhost78648的UNKNOWN及历史FAIL不改判。负责人现要求交接，继续入口见[最新handoff](a9_31_manifest_diagnostic_handoff_2026-10-04.md)。

## 准确基线和批准

工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`。负责人“批准”仅绑定[C1–C3原材料](../../plans/A9_31_POLICY_R3_SOURCE_PACKAGE_WIN10_APPROVAL.md)，批准原全文SHA256 `37cd8d4b7d5bea326ed225a013e2812e7ea8e6c2067e6b3ad07e317ddf9bb0cc`，不可变副本及owner记录位于本工作树`.acceptance/a9-31-developer/product-r3/`。不含推送、合并、发布、删除、native重建、锁/系统/账户改变、委派、独立或Win7。

C1准确五路径提交`ebda91123e62b225c3fd104c9c9b564a4b61c466`，父`898ee9459a9b987840e94ddef336556ea58dd389`。提交blob/源hash等于原417/117本地所测字节；提交瞬间其他46个dirty不变，index空。现有治理dirty保留，主仓只读。原本地Core417、Shell117、七模块静态证据按准确字节/依赖/配置继承，标INHERITED_EVIDENCE；新包由准确source重新编译七模块，不消费恢复过的历史tracked dist。

## C2直接包证据

干净detached source-checkout离线读取八个精确依赖链接；固定生产者、lock与三个输入档案逐hash核对，未安装/下载，未传allow-uncommitted。生成的r3 ZIP为101328814bytes，SHA256 `d951a89af285c4e60c5f4701efbfd54f34627fe103d8257c83636479f82ac74b`；manifest SHA256 `0060fffff80335d48abd75e2bb784106114af7cca92db0b98e40ad8a65357a68`。

同source verifyA9ProductZip、ZIP与展开树双向784文件闭包、实际包内模块/Profile/native/许可证/SBOM/依赖版本、24项实际包Policy纯求值PASS。当前包Policy JS SHA256 `0ce0b8fa8478a72fae961bcada74511ac7bb2db557e4cfb1b8e1389a867b771a`，AgentLoop JS `bad84bda2b2db9b0006b0dce63eafc75e4f45aa858999bf2a512ce25d24eefd3`；生产者sourceMap=false与本地测试编译参数不同，已明确实际加载字节。helper保持`2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7`。package-identity.json及package-verification-result.json为直接绑定依据。

仍为A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE，external_acceptance_eligible=false，无候选authority，不占用WIN7-43。

## C3新根与能力准入

目标`192.168.1.4 / WIN-2JQ66JE4HTQ / Windows10 Pro19045 / PS5.1`。Strict SSH只以Administrator准备/派发/回收。新根仅`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R1`，创建前不存在、无reparse、约5.19GB空闲；未修改ACL。Win10直接784产品/73宿主闭包及三源PS5.1解析通过，最新冻结根670048457bytes，低于1GiB。

固定19439byte C#源不变，固定csc/三参考/kernel32 hash与签名逐项核对。仅新根编译一次，source绑定ebda911，compilerexit0；新DLL SHA256 `93f1979a8a8dbf87cf609d95f3b48ee17c7c3b9b5334dc3506c989961f253505`，MVID `29314b2e-7db0-4cd9-9654-23f9ed807361`；原始build JSON SHA256 `09fe18f933a08c08d28220d48a26cdbdae4f059faca53c9688dc5afbe9411305`。Win10测试专用V4/Profile/API不进入Win7产品，不改旧DLL/build。

新DLL实际查询/区间/精确UTC/文件/并发claim与回执正负例PASS；336协议/schema检查PASS。三版驱动目标Node16语法、73项自检和88项同步回执自检均自然exit0；实际包消费者以持有Process句柄/creation/WaitForExit/ExitCode核验全部784文件。真实cmd-ver回执、父实例、单调时钟与实际退出保留；受控构造负例与普通产品证据明确分离。

冻结master SHA256 `3191b7faf3f87080dca02d9fe141c3832f016721df53ce5559ff03a6175cae2c`；三个检查注册revision：受控Boot `39199caca7bf41e6f5118a41a9724f6a5b2ea66474386dce5df492b25cdd3ac3`，最短链路`37eaa1166733ac184e98a6d5b26b3797889b799081f4a3f72877093c7a7126ee`，完整`5065edcc614aca2131a68804b389692fd7935f76d198d161b7b9571569ada88a`。直接stage三个revision全闭包PASS，详见frozen-admission-result.json和stage-*.json。

准备首记录全部保留：本地生成JSON转义路径错误、元数据误计为第五源导致revision_valid失败、PowerShell GUI ampersand的LASTEXITCODE未设置，以及本地原始stderr非UTF8解码错误。分别在新输入/元数据版本或读取步骤修正；原始回应保留，不属于产品通过或普通产品失败。最终包实际检查采用原有真实Process句柄方案，不能继承早期未捕获exit的回应。

## 普通八phase与收口

负责人恢复连接后Session3 Active只是会话预检。UU可见Win10桌面，但代理两次正常UI点击/键盘没有传入Windows；按既有手工协助授权请求一次普通桌面启动新入口。其后仍须代理直接检查dispatcher/worker/Electron的SID1005/Session3/Medium8192/非提升/InJob=false，才能派发。

| 阶段 | 当前直接结果 |
|---|---|
| 受控Boot失败/同dispatcher正常Boot | 预期失败和7持有实例exit；正常Boot8直接PASS |
| Background最短及完整回归/真实审批UI与SQLite | 最短28直接PASS；完整137含审批60功能PASS，阶段HALTED/真实退出未完成 |
| Shell / EncodingSecurity / FailureBoundaries | NOT_PERFORMED |
| StopExit / ReleaseExit / Recovery | NOT_PERFORMED |
| 固定停止/持有实例exit/完整回收与后飞行 | 已点击后产品拒绝安全退出，4个原Electron仍活；HALTED收口未完成 |
| 独立收口、负责人DEVELOPER_VERIFIED裁决、Win7 | NOT_PERFORMED |

只执行批准的120分钟/16请求固定八phase窗口。高影响场景只拒绝、错绑定拒绝，不执行删除/发布/全局安装/服务或注册表变更。身份、完整性、安全、必需审计或未知生命周期失败即停止下游；普通夹具允许同四源内局部修复及新不可变revision，旧记录不覆盖、不恢复已HALTED实例。当前任务保持A9_31_IMPLEMENTATION_IN_PROGRESS。

准备结束时统一状态为product-r3/win10-evidence-matrix-r1.json。准备结束后1806个其余tracked、43个其余dirty、1273个旧r2证据、642个上一轮readiness、886/590个旧修复证据及主仓21个可读dirty逐hash零不符；HEAD/branch/index及主仓HEAD符合保护边界。主仓两份进入前已缺失的历史ZIP仍保持原D，未恢复、不把其签为存在PASS。docs:check直接281文档/48任务通过，diff --check通过。

## 普通入口、最短链路与完整后台当前进展

负责人回复“已启动”后直接核验dispatcher76908/creation639267049607348338：SID1005/Session3/Medium8192/非提升/InJob=false，真实命令行绑定新launcher/master，窗口有效至2026-10-04T12:02:43Z。受控Boot4851b3b7d868487198fa971c78e5f81e预期失败且7个dispatcher持有实例实际退出；同dispatcher正常Boot888931b03b434e49a8b0d4f800023266直接8项PASS，后台最短2ed75791277a4537b4c5ec623ea89bfa直接28项PASS、归属/持久化/输出/Stop/实际退出复核。

完整后台60f94194cc6f4924baea7e83415d33ee首轮70项后出现TIMEOUT:send enabled：夹具绕过Renderer，通过直接preload IPC拒绝审批。实际SQLite integrity=ok，approval已denied、approval_resolved和turn_completed落盘；真实first-failure截图仍为旧needs_approval卡片。此为夹具UI状态更新路径问题，不是放行或缺审计；全部40个dispatcher持有实例退出。原首FAIL/截图/DB及原冻结revision保留。进度口头统计曾按部分清单报38，准确合并dispatcher清单为40，不以口头数替代证据。

仅四源中的driver改为实际拒绝按钮、等待真实审批卡隐藏及输入恢复；产品/PS/native/capture/master/锁未变。新revision3bd2e330293fb9928b8d6d6c466d8ce78e9025009977087ff820a6be2e413fee，driver d4b2802b6c1154b1ac99e7422aa9dc216531401878c9880516e924c778ee2297。本地及目标Node16语法/73/88、固定SYNC安全字节和实际stage闭包通过；未变化组件证据适用性单独登记为继承，不冒充新driver直接检查。

新run6ad4b353ea2f42b3b665757ea02e4ca3完整后台137项断言PASS，其中十组高影响命令各6项真实pending SQLite、完整command/cwd UI、错digest/变化参数/旧Turn拒绝、实际UI拒绝+audit+零helper派发共60项PASS；长参数截图人工视觉核验完整末尾目标与中文空格cwd。该时点仅driver-final PASS；真实原生退出对话框仍等待“停止后退出”，controller/dispatcher final与整树退出未取得，完整Background尚不能记阶段PASS。UU点击未传入，已按原手工协助范围请求点击；不换管理员或注入原生输入，不提前派发Shell。该时点矩阵为win10-evidence-matrix-r2.json；六个后续phase/独立/Win7仍NOT_PERFORMED。

## 固定预算失败与当前等待

10:24:59Z（北京时间18:24:59）worker直接记录HALTED_UNKNOWN_RETAINED/LIFECYCLE_PHASE_TIMEOUT，10:27:53Z dispatcher记录LIFECYCLE_WORKER_TIMEOUT；两份capture-failure原JSON和controller-abort.json先保存，均无未解决捕获观察，但诊断当时仍分别4/5个实际持有实例未退出。原生退出对话框未被手工确认；Computer Use点击/Return仍未传入，不能通过编造或消失观察补签exit。driver137/60项PASS保留为部分功能证据，完整Background阶段HALTED，后续Shell等六phase停止且零新增请求。原报告/修复版本不覆写，当前控制器不恢复。

当时请求仅在隔离测试窗口选择“停止后退出”，保持控制器窗口，代理再取得原持有句柄exit/最终HALTED及回收证据。当前仍不能给出Win10整批PASS，不提升DEVELOPER_VERIFIED/独立/Win7。准入source/包、协议/身份/native/锁保持；该时点矩阵为product-r3/win10-evidence-matrix-r3.json。后续普通夹具收尾需在请求正常关闭前主动走真实Stop与状态检查，不能延长预算或绕过原生退出门；HALTED控制器/已执行master不得恢复，进一步新根执行须形成准确合同。

## 点击后实际状态、错误可接受性与夹具修复

负责人已点击，并明确报告“无法确认安全退出”。controller在10:28:29Z、dispatcher在10:31:23Z形成最终HALTED，held_tree_ended=false。10:39:30Z只读重新取得67164/30024/127340/88580且creation与原持有记录相同、均HasExited=false；原dispatcher/worker当前无法取得不补签exit。三个Chromium子实例的低完整性及Job属于内部隔离，普通产品67164仍SID1005/Session3/Medium8192/非提升/noJob。

ready-failure主动丢execution_started，产品返回管理进程失败/下游拒绝，无输出或成功；原准确helper6484/root110352/child76684的持有实例都已实际退出（exit0/1/1）。DB/WAL/SHM以只读共享句柄两次稳定读回，保留原字节，分析副本mode=ro/query_only，integrity=ok；该handle仍持久化cleanup_required，最后事件277为其ownership，无伪造正常tool_end。源码recordManagedHandle对failed主动设置managed-failure barrier，错误界面带auditIncomplete不能单独当作SQLite损坏证据。实际问题是保守清理事实阻止产品正常退出，而夹具先写了driver PASS。

可接受并继续独立工作：远控输入失败（沿用手工协助）、已闭合Renderer审批夹具问题、本地guard自检函数作用域问题。只读inventory首轮FileInfo误作相对名、随后浏览器独占/字节锁错误均保留；锁不修改、不绕过，转为只收已完成证据。预期ready失败可以作为故障反例；当前4个Electron仍活、真实正常退出未证明，不能延期当成阶段PASS或恢复HALTED入口。此评估存error-acceptability-assessment-r1.json。

在原C3同一driver内增加实际snapshot关闭判据：canStop=false、无活动/未知/cleanup_required；真实will-quit后才写PASS。原137项断言不删，产品/native/PS/capture/锁不变。新driver2513c0640befa116fda9df520fdf01f1a46e2940936d760eab346e6a5b135595，revision e5222304faad54802a13ac5cb908a0b35a9fa2f863670a449f832d3d6adbb281；本地Node20和目标Node16语法/90自检（17关闭判据）/88回执均exit0，实际新revision stage闭包PASS、SYNC安全字节不变。该普通产品收尾尚NOT_PERFORMED，不用自检补签退出。

已回收evidence/requests及各run的evidence/signals/workspace共501文件/10713343bytes，逐尺寸/SHA零不符、合成秘密ASCII/Base64/UTF16LE扫描零命中；当前活跃DB三件另行稳定共享读并逐hash验证。浏览器活跃目录完整回收仍NOT_PERFORMED，独占锁不写0或PASS。最新根718309849bytes/1647文件，C空闲5142302720bytes；保留全部历史根及文件。

当前矩阵win10-evidence-matrix-r4.json；[准确后续R1–R2材料](../../plans/A9_31_PRODUCT_R3_ISOLATED_READY_FAILURE_RETRY_APPROVAL.md)仅请求原4实例绑定终止取证及全新Product-R3-20261004-R2根，同一准确产品包、独立ready负例有界崩溃结束和原八phase完整续验。新终止/新根写入尚NOT_PERFORMED；不恢复旧控制器，不接受未知退出，不重编产品/native/C#，不提交/推送/改系统，不签独立/Win7。

本轮保护复核：1806其余tracked、43其余dirty、1273旧r2、642 readiness、886高影响修复、590删除修复及主仓21可读dirty逐hash零不符，HEAD/branch/index/main HEAD准确；preservation-after-runtime-r1.json。新R2本地/远端根只读核验均不存在，远端仍约5.14GB空闲。docs:check为282文档/48任务PASS，diff --check通过。

## R1–R2批准、残留结束与新根准入

负责人“批准”绑定原方案R1–R2全文SHA256 `affedbc6b1ff3a24243698ac3c795bb8ed3356b1fece4b49644e76961db4d1eb`；原文及owner记录保存在`.acceptance/a9-31-developer/product-r3-retry-r2/`。HEAD、分支、产品ZIP/native/锁不变；新四源C14登记后才实现。

11:04:10Z重新核对原PID67164/30024/127340/88580的creation、映像、SID/Session/RID/Job/非提升及父实例。只对匹配主Electron67164调用一次Process.Kill，三个子实例自然随之结束；四个保持句柄均取得真实exit（主-1，子0/0/0）。记录为r1-exact-residual-end-r1.json，属于隔离故障残留结束，不是正常退出PASS，旧controller/dispatcher HALTED不改。

新远端根`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R2`在11:05:01Z创建，原不存在且无reparse、准备前空闲5122412544bytes。按原准确ZIP展开，直接核验784产品和73host文件；PS5.1解析通过。取证C#源/DLL/MVID/原build/原C1–C3批准逐字节继承，不重新编译或重绑批准，capture-inheritance.json标INHERITED_EVIDENCE。新根实际Schema/查询API/进程区间/精确UTC/并发入口/文件范围及新真实cmd-ver回执通过；目标Node16对四版分别语法、90自检与88同步回执自检均exit0，实际包消费者以保持Process句柄证明784文件和真实exit0。

文件范围夹具首轮仍引用旧compile目录，原stdout/stderr/execution保留；只修正到新根inputs的四个准确继承文件，新不可变输入及新fixture run重试通过。保留原编译批准，未使用新R1–R2批准替换。此为准备夹具输入失败，未进入普通产品入口；preparation-first-failure-assessment.json记录可接受性及实际纠正。

新master `0ac027ba6e65a9cf667d9926b45119452f50bb99bc5bbc128c12698da2d621d8`；受控Boot/最短/完整/ready专用四版revision分别`e4e3a894001d4bd662120506348e49e19c783b1a7d6d322fcf531fdc658e8c31`、`4034d50a93a2a3047e8f18615eaafa9e3f855a8a3b9fc798b85adddfbc20ab45`、`9932123dea00a9db4277e0f76db5ae11b7c8a333902b753dbf80f7fbad3c02e8`、`6882401403cbe07ba8d524ab1afbcd612ca3299c2d98b97a608efe182b543852`。四份actual stage完整闭包PASS，冻结后根669456923bytes。frozen-admission-result.json为直接准入记录，不是普通产品PASS。

UU已可见Win10桌面，但代理输入仍未传入；11:11:45Z新根dispatcher文件均不存在，Session3 Active只作会话预检。沿用负责人已授权的一次手工普通桌面启动协助，其余身份核验/派发/回收仍由代理执行。新矩阵为product-r3-retry-r2/win10-evidence-matrix-r1.json；旧全部矩阵/FAIL/HALTED保留，独立及Win7仍NOT_PERFORMED。

原准确4实例结束后，旧根剩余browser目录现已能正常只读读取；回收evidence/requests/全部run文件691个、49669334bytes，逐size/SHA零不符、合成秘密ASCII/Base64/UTF16LE零命中，old-closed-return/verified-result.json。未删除或修改任何锁/数据库/文件，不改原HALTED和正常退出未证结论。新准备后保护检查1806其余tracked、43其余dirty、1273旧r2、642 readiness、886高影响修复、590删除修复和主仓21可读dirty零不符；当前五源码等于HEAD blob，index空。记录preservation-after-r1-r2-admission.json。docs:check直接282/48通过，diff --check通过。

## R2普通入口与当前正常链路直接结果

负责人回复“已启动”后直接核验dispatcher PID56400/creation639267094974494124，与启动记录相等；SID1005、Session3、Medium8192、非提升、Ordinary=true、InJob=false，真实命令行绑定新launcher/master。窗口到2026-10-04T13:18:20.4572243Z；HEAD仍ebda911、index空。ordinary-entry-confirmed.json保存直接身份/creation/命令行，不以Session Active替代。

受控Boot run c6f01b60a5dc49a78c9fb7b893c2b9b2保留FAIL/准确CONTROLLED_ORDINARY_FIXTURE_FAILURE及7实例真实exit；同入口正常Boot32293ad3c7e2482bad236b703906554a通过9项、正常退出且所有持有实例结束。后台最短dedc8ce80f894c1db385df22e43ea75c通过29项。完整正常后台a08d6a6b03064e0f9286de43264f9e61通过133项，十组真实pending SQLite/完整command-cwd UI/错digest/变参数/旧Turn拒绝/真实UI拒绝和零native派发60项全通过；真实停止后cleanup判据通过，实际will-quit才形成driver PASS，controller/dispatcher独立持有树均取得实际exit0。对应review-Boot/Background-run.json与原观察分别保留。

ready故障全断言移至准确专用revision688240...，新run84f31119cb434171b2ae631f4f5b2cc3独立执行。正常后台133与旧包含ready的137不能仅按数量比较或宣称已完成合同；须把专用反例、真实整树结束及全回收安全检查合并复核后才形成整体Background结论。当前矩阵为product-r3-retry-r2/win10-evidence-matrix-r2.json；后续六phase/独立/Win7未执行。

## R2 ready反例、Shell、安全及故障边界

ready专用run84f31119cb434171b2ae631f4f5b2cc3的16项全通过，明确保留driver FAIL/A9_EXPECTED_READY_FAILURE与main实际exit94；controller/dispatcher为FIXTURE_FAILED_TREE_CONFIRMED，所有保持句柄exit已知。整个run65文件7516948bytes正常只读回收，逐size/SHA零不符、秘密ASCII/Base64/UTF16LE零命中。SQLite分析仅打开另行复制的副本mode=ro/query_only，integrity=ok，唯一事实pid=null/cleanup_required，无tool_output/tool_end，ownership审计保留。ready-negative-final-review-r1.json记EXPECTED_NEGATIVE_CASE_PASS，不签正常退出。

覆盖按原137断言角色逐项复核：正常133+专用16全部直接执行；只按准确新root/run映射四个Windows query变体，并把单独ready-helper的ordinal0对应原ordinal4，所有原断言角色无缺失。raw label首比较的差异及严格角色映射另行保存，未删断言或降低判据；background-coverage-review-r1.json。

Shell d51388a26d884d9492236dc88ad5d16f直接29项PASS；EncodingSecurity8a78c258f3e74998881869e4cc86d481直接71项PASS，含实际CP936/UTF16、跨块秘密脱敏、截断真实exit7、取消与180/700ms背压；FailureBoundaries162cfa055d614e8fa3a61a4adb2bcba3直接41项PASS，含7种真实native管道反例、终态缺失UNKNOWN保留及实际SQLite必需审计失败后的零下游/禁止重试。各driver实际will-quit、controller/dispatcher的普通身份及整树exit均直接确认；不以构造反例补签产品成功。

ready故障后的实际截图footer仍显示“托管后台进程仍在运行；可继续工作”，而当前cleanup_required且实际下游拒绝。该提示文字与保守状态不一致，后端安全行为正确，按负责人“可以接受且不影响主要流程则继续并记录后续”的指示记非阻断后续项；deferred-findings-r1.json及src/shell/product/renderer/a9-workbench.js:237为定位。R2限定相同产品字节，未借此修改产品或重建新包。

## R2 StopExit首失败、正常最终判据修复及重试入口

StopExit run16282e33fce14eeb8c5c4e0308f4cda1在真实原生对话框等待选择。UU回到Mac自身被控界面，未取得目标输入；沿用人工点击授权请求“停止后退出”。既定120秒后记录TIMEOUT:actual native exit dialog choice，随后driver FAIL/原错误保持；当前controller/dispatcher均FIXTURE_FAILED_TREE_CONFIRMED、main/worker真实exit0、所有持有实例实际结束，无未知exit或安全硬门。当前StopExit不PASS；stop-exit-first-failure-assessment-r1.json与原progress/observation均保留。

静态复核发现另一处同类夹具最终判据缺口：shutdownProof的will-quit回调可能在先前fail()等待modal释放期间调用finish(PASS)。在已批准正常关闭判据的同一外部driver路径增加统一finalizationStatus：任何原failing/error/halt/未执行项/失败case均不能形成PASS；原错误和FAIL保持，不改产品、native、三PS、C#、Schema、SYNC、120秒选择与120分钟/16请求。独立复核脚本也明确拒绝带原error的PASS，已有6份正常报告逐项重读均无原错误，不重跑未变化phase。

新driver7d8624a5901214a08bf0ec728542a5ce84d83ea5d4c25d9d9068ca1669bf2691，revision26fc74ae7188ffa57cfa72ffdbcac331500293dc5976c4004123a260fdf494fa；本地Node20及当前目标Node16语法/99自检（26关闭与最终判据）/88回执均exit0，实际完整stage通过。原执行revision/source/checks保留，不热改现有输入；admission-binding-r2.json追加新revision，master仍0ac027ba...。未变化组件按准确byte/依赖/参数/配置和上下游登记INHERITED_EVIDENCE，新的Node16及stage直接记录，不签普通退出。

同一普通dispatcher56400当前入口保留，可在负责人桌面操作就绪后用准确新revision与新run有界重试，无须重启dispatcher或重新审批；原120秒不延长。ReleaseExit/Recovery及本批完整回收仍NOT_PERFORMED，整批Win10不PASS。最新矩阵product-r3-retry-r2/win10-evidence-matrix-r4.json。

首轮StopExit完成run已完整回收68文件7865477bytes，逐size/SHA及秘密扫描通过；整个当前已完成runtime/evidence/requests阶段性回收1043文件79899004bytes，零尺寸/hash不符、零秘密命中。interim-closed-return-r1为阶段性返回，dispatcher final及最终三phase尚未完成，不能改称整批最终回收。普通dispatcher56400在首失败后仍同creation、同身份、实际存活且无final，C空闲4356239360bytes；有效期至北京时间2026-10-04 21:18:20，不重跑启动命令。保护复核1806其余tracked/43其余dirty/全部旧证据和主仓dirty零不符，五源码等于HEAD，原四冻结版本逐size/SHA保持；preservation-after-five-phases-r1.json。docs:check直接282/48通过，diff --check通过。当前等待负责人回复桌面已就绪，再按原120秒上限开始新run。

## R2 原生选择最短诊断与当前run

第二次StopExit run076ed5e1a9024eb0be57b410473e2ead保留原TIMEOUT/FAIL；实际main/worker exit0、12个controller实例及13个dispatcher观察实例均已退出。完整68文件7848167bytes逐size/SHA与秘密扫描通过。两次同类失败停止整批重试，stop-exit-minimal-diagnosis-r1.json确认均未形成正常will-quit断言；负责人报告见到真实对话框并点击，准确点击时间UNKNOWN，不从回复时间推断。

同一C14外部driver补充被动记录真实dialog.showMessageBox调用与实际response；不提供/注入选择，120秒、八phase、九字段、SYNC、产品/native/三PS均不改，首次错误仍保留。新driver SHA256 1c2e4c51828344222a7cf3f02a7cb2b9273a63bfea332e34cd6edc2388df150e；revision db3540f38355a0f567aa46db2f043958a7cc5b47ad8a4350b7797cc87ea24994；目标Node16语法/99自检/88同步回执及stage通过。master保持0ac027ba6e65a9cf667d9926b45119452f50bb99bc5bbc128c12698da2d621d8。

当前最短StopExit runf3158d545b6146da986b64bf74e092f5已取得native-exit-dialog-opened-1.json真实原生API调用，等待负责人点击及选择回执；当前不计PASS。ordinary dispatcher56400/creation639267094974494124/Session3/Medium/非提升/noJob仍直接核验，未重启。当前矩阵win10-evidence-matrix-r5.json；其余阶段和旧FAIL/HALTED边界保持。

## R2 原生真实点击后的判据根因、修复与完整收口

最短run f3158d545b6146da986b64bf74e092f5记录真实dialog API 11:50:35.153Z、response=0于11:51:00.699Z（约25.546秒），负责人选择“停止后退出”。driver的ACTUAL_NATIVE_EXIT_CHOICE通过，真实will-quit发生、main exit0；随后STOP_PERSISTED_TERMINAL夹具断言失败/halt=true。controller error=SAFETY_DRIVER_HARD_GATE、dispatcher error=SAFETY_WORKER_HARD_GATE/HALTED均保留；不将该run改判PASS。

实际只读回收DB/WAL/SHM后复制副本，mode=ro/query_only，integrity_check=ok；当前handle sh-1791114634033-c22b7ae0在a9_managed_processes的last_probe_status=stopped、pid_reuse_possible=0。唯一managed_process_ownership事件只有owner/request/ownershipState，不含lastProbeStatus。src/state/src/a9-persistence.ts的recordManagedOwnership在owner不变时只更新事实表，不重复追加ownership事件；src/shell/product/a9-agent-runtime.js的shutdown记录已停止事实。因此原夹具从ownership payload读终态必然错判，本轮不是产品停止缺陷。诊断：stop-exit-native-sqlite-diagnostic-r1/result.json；完整70文件7811935bytes逐size/SHA和秘密扫描通过，stop-exit-native-first-failure-return-r1。

同一已批准R2外部driver修复正常关闭判据：查询事实表并绑定全部实际usedHandles、workspace/cwd、已知PID、无PID复用及当前ownership；Stop只接受stopped/exited，未知/cleanup/无关联事实拒绝。相邻Release判据从任意事件some收紧为当前句柄表released以及同owner/request/releaseId的先intent后receipt，不能借用其他句柄；实际移交阶段仍NOT_PERFORMED。原生选择回执、原错误保护、120秒、八phase、九字段、SYNC、产品/native及三PS均不改。新driver ec5736fe1556762c24dcf62e0e49d21aa79c796980e9a80d4d09ac0063c5ce83；revision 3b0b61fa1c2aca9b8446d1eb4acb9f5c0485cad067687f6d08395bdc33152a37。直接Win10 Node16语法/128项自检（新增29终态/绑定反例）/88同步回执与stage784产品/73宿主通过。实际Node16用hash确认的本轮真实SQLite返回事实执行准确新函数：旧事件判据false、新当前终态true、Release未被推断；actual-shutdown-persistence-node-replay-r2.json。首个重放PS参数引用解析失败与输入原字节保留，新输入先PS5.1 ParseFile再执行，Node实际exit0；不是新普通StopExit PASS。

R2 dispatcher final原文件1224004bytes超过observer单文件1MiB，首INTEGRITY_RETURN_LIMIT保存；未抬高保护阈值，按既有≤128MiB完整SFTP回收原字节取得。final含11请求/245持有实例，held_tree_ended=true、全实际exit、unresolved/drain_errors均空，最终HALTED不改。当前PID56400只读不存在，不补签其历史exitCode。halted-dispatcher-final-review-r1.json与halted-dispatcher-current-absence-r1.json。首次完整返回1185文件96784648bytes；修复stage新增1文件480bytes，重新inventory证明原1185文件远端SHA/size不变，新增精确回收后所有1186文件96785128bytes本地重新hash/size与秘密扫描零不符。halted-postfix-delta-return-r1/verified-result.json不是整批PASS。

保护复核preservation-after-halted-fix-r1.json：1806其余tracked、43其余dirty、1273原r2、642 readiness、886 high-impact、590删除修复和主仓21可读dirty均零不符；五源码等于当前HEAD、index空；全部原/新增冻结版本逐size/SHA不变。无删除/提交/推送/产品或native改动、无R10恢复或委派。已有非阻断界面措辞deferred-findings-r1.json保留待后续处理。

当前矩阵win10-evidence-matrix-r6.json。原R1–R2批准绑定准确R2根且launcher拒绝已有entry/final；新R3根不自动获批。[新隔离根续验材料](../../plans/A9_31_PRODUCT_R3_FRESH_EXIT_VALIDATION_APPROVAL.md)仅DRAFT_NOT_APPROVED，绑定同r3产品、准确新R3四源/根、新master普通八phase及原有预算/保护；未创建或写入新根。只读12:04:55Z C空闲4286361600bytes、本地/远端新根均不存在。任务仍IMPLEMENTATION_IN_PROGRESS，独立/Win7未执行，WIN7-43未占用。

## R3准确批准、新根准备与普通入口

负责人回复“批准”，绑定新R3续验材料原§1–3及原文SHA256 bb2d76a525a53c11216ba887230c71b0c648fef7d0556bd259ae2524d5279269；新根不可变原文/owner/scope记录、任务实施前四源C14已登记。普通执行批准证据SHA256 83b6a0fd84304b971d54f7dadc6f7a59d3e5d686c7f89fa02dda8ce049ea86cd。新本地product-r3-retry-r3；远端C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R3。只读前置新根不存在、非reparse及4303060992bytes空闲通过，原R2只读保留、不恢复。

准备阶段发现JS转义根未更新，普通运行未启动，原本地冻结准备源/metadata整体保留到pre-admission-unescaped-root前缀；准确新ROOT和所有四版驱动重新冻结。SFTP60秒首超时保留，部分ZIP100958208bytes先与原本地精确前缀hash匹配，再reput余字节且校验完整101328814bytes/d951…；host archive读旧R2准确输入前重核其与锁定本地一致的size/SHA，复制到新R3新文件，再核验97MB/ad723…，旧文件不写。directed schema首错仅revision_valid的旧driver长度导致SCRIPT_DIGEST不符；修复构造正例准确metadata而不改变336项断言或digest判据，原失败保留。索引preparation-result-and-first-failure-index.json。

当前准确master81f2362309138c81322afe208b9cc7ea0e04a4886cd0684dd8631cb8d637a44d；四不可变revision：controlled-boot993fe55a…cff4d83d，normal-short a655dd38…962c7ec，normal-full8f6e261a…86eb4ce5，ready-negative ce9f0100…b1b0d970b。新产品784文件/73 host展开/PS parse及逐hash闭包直接通过，四版实际Node16各语法/128自检/88同步回执自然exit0；schema336、真实查询API/区间、entry并发/文件门、新实际SYNC receipt及验证器全通过。capture源/DLL/MVID/build和原编译批准精确字节继承，不重新编译C#或native。四版checks/registration与实际stage冻结全闭包通过，最大根669567295bytes。frozen-admission-result.json；这是Administrator准备证据，不是普通产品或Win7 PASS。

win10-evidence-matrix-r1.json当前R3准入PASS、八phase NOT_PERFORMED；已向负责人提供ordinary-desktop-entry-command.txt的一次普通账户Win+R准确命令，等待“dispatcher ready/已启动”，随后由代理核验普通SID/Session/Medium/非提升/noJob并完成固定请求派发、返回和复核。当前无源码提交/推送/合并/产品/native/锁/系统账户变更、无删除/委派，任务仍IMPLEMENTATION_IN_PROGRESS。

## R3普通入口、受控失败与正常Boot等待（12:59Z）

负责人“已启动”后直接核验PID107352/creation639267150930059747、SID1005/Session3/Medium8192/非提升/Ordinary=true/InJob=false；实际token/命令行/master与启动记录一致。固定窗口到2026-10-04T14:51:36.0741768Z，16请求上限不变；ordinary-entry-confirmed.json及后续查询保留。

受控Boot run1c3fd5441ecd40ed9ba388e80c7904e2保留原driver FAIL/ASSERT:CONTROLLED_ORDINARY_FIXTURE_FAILURE，8项中仅指定受控断言为false、halt=false；controller/dispatcher均FIXTURE_FAILED_TREE_CONFIRMED，7个实际持有实例exit已知、worker0，无unresolved/drain或秘密命中。review-controlled-boot记录为预期反例结论，不计普通产品PASS。

正常Boot runedef360947cf4253b06c198607250953请求原子发布/hash绑定正确；至12:59:38Z其run尚不存在，dispatcher无worker/无final、PID/creation不变。12:56:17至12:59:38两次CPU均10718.75ms，支持暂停等待诊断，但不证明具体原因。UU当前网络错误，无法查看目标；已请求负责人检查窗口末行/文字选择并按一次Esc，保持原入口、不重启。未发后续请求、未提高deadline、不恢复旧控制器。矩阵product-r3-retry-r3/win10-evidence-matrix-r2.json。

本地Python3.9首次解析.NET七位小数UTC失败，随即以已核实UTC及秒级截止重新验证通过；报告编辑首次stdin编码失败发生在解析阶段，无文件写入，改用apply_patch完成。两项仅本地工具边界问题，未修改目标执行输入。已准备独立于执行输入的Recovery原实例93/新实例0精确关系复核及原128MiB上限最终完整回收脚本，尚未执行，不作为产品证据。

负责人要求代理自己打开验证。13:01–13:04通过CUA选择准确WIN-2JQ66JE4HTQ并点击预览，UU建立新可视连接，实际看到当前R3命令及控制台标题“选择”。依次核验标题点击/Esc、双击、聚焦/Enter、全屏及新坐标、控制台右键、显式Raise/Esc；目标控制台未变化，四次目标观察仍无Boot signals。全屏只为坐标/焦点诊断，未更改远控安全、输入模式、账户或目标系统配置。cua-selection-pause-diagnostic-r1.json记录操作和目标证据边界：可以打开查看，尚不能证明自动输入送达或取消选择。沿用手工协助请求一次Esc，保持原窗口/预算；不以等待认定产品失败或恢复旧入口。


## R3前五phase、迟到选择与日志收尾修复（13:50Z）

负责人Esc实际生效，同一普通入口继续执行：Boot edef360947cf4253b06c198607250953（9项）、后台最短6725e814a6ab4322b21b19cb5bab0c4c（29项）、完整Background 66b55d2c70a3416b9a4a8550e193ddda（133项）、Shell e0caed9141434f6cabec38e1dca8b09c（29项）、EncodingSecurity aaa697b53aaa440887027165eb8ddca5（71项）、FailureBoundaries 109300da9f3d4798b4fbc79b0b1d815e（41项）直接PASS，各自持有树实际退出。ready负例4259a0a91ecb459a9548e60bcb4184e7为准确预期错误、16安全断言、main94/worker0，65文件7510757字节完整返回与秘密检查通过；独立SQLite副本integrity=ok、当前handle绑定与cleanup_required一致。各review、返回和原DB/WAL/SHM保留。

StopExit 3bb68509eae540969c4fdad7dab71168：13:23:28.868Z实际原生对话框出现，13:25:29.014Z原driver写TIMEOUT FAIL；13:26:58.370Z真实response=0写入独立sidecar，距打开209.502秒。旧driver先finish关闭journal，迟到回调随后entry写已关闭描述符；本地真实文件复现EBADF。产品close catch显示通用安全退出错误，这与sidecar有记录/journal无选择行及实际界面相符；未直接取得runtimeState中的具体异常，不把推断升级为实机EBADF文本。21:43北京时间CUA直接看见“无法确认安全退出”及后台运行1，准确正文见visible-stop-error-r1.json；后续远控点击/Return仍未消除此框。

controller原HALTED/LIFECYCLE_PHASE_TIMEOUT；完整dispatcher-final为HALTED/LIFECYCLE_WORKER_TIMEOUT，209持有实例中205实际退出，4存活，held_tree_ended=false。13:49:21Z只读重核4实例PID/creation/Session3/准确R3 host路径/原run命令一致：9768、44164、46084、87256。原worker90836已不存在，普通PowerShell107352仍停留NoExit提示符，不恢复派发。证据halted-final-review-r1.json、residual-current-identity-r1.json。

允许四源中仅driver修复终态后日志：以独立wx文件记录POST_FINAL_OBSERVATION_NOT_ACCEPTANCE，保留原FAIL、source/run/phase绑定；共享2MiB上限、最多32条、fsync、写失败仍显式抛错。迟到原生返回及will-quit检查不再访问关闭的原journal；不模拟选择、不提高120秒、不重写原final。driver SHA256 7535b7b762aec211f3f0ccab70e7798b9713ac59f942305f9f6466a6f36f767e，新revision 39cdd03b7204ce44a9ec66df499d58a631abbc85205e9fe9de3644925016dd9b。实际Win10锁定Node16.17.1语法、128原自检、88同步回执、15真实文件系统收尾测试均exit0；闭包stage通过。三个PS和SYNC安全片段精确不变，原生/capture/产品/host按精确字节继承；没有普通重试PASS。

部分返回1035文件75997380字节，1034与清单准确一致、1个活跃LevelDB LOG在返回期间变化，18个exclusive/byte-range锁文件未回收，秘密扫描零命中。因此回收结果FAIL/INCOMPLETE保留，不宣称完整返回。首次inventory未处理Windows锁错误33导致失败已保留；第二次仅把32/33均标UNKNOWN_LIVE_EXCLUSIVE_LOCK，没有绕过锁。后续需实例结束后另存不可变delta并重新核对全清单。矩阵product-r3-retry-r3/win10-evidence-matrix-r4.json；当前原授权禁止恢复HALTED入口和第四根，准确后续范围另列[残留收尾与R4续验草案](../../plans/A9_31_PRODUCT_R3_LATE_JOURNAL_R4_APPROVAL.md)。无提交、推送、删除、产品/native改动或旧控制器恢复。


## R4批准、准确残留收尾与新根准入（14:03Z）

负责人“批准”绑定[R4材料](../../plans/A9_31_PRODUCT_R3_LATE_JOURNAL_R4_APPROVAL.md)原§1–3，原文SHA256 c8a4908c407bd62c6341eb85729be2d7b546cf3e41b74161c1f5f5847fa269ca；原文/owner/scope保存在product-r3-retry-r4，实施前C14四源已登记。执行scope证据SHA256 82eef588f8c33c2aeae241ec2919bfdf4c3c69f5aad1acd466409488df782d7f。

先保存R3活动DB/WAL/SHM副本（不作为一致性证明），再分别重新核对44164/46084/87256/9768的PID/creation/Session3/镜像/完整命令/父关系，取得并持有Process.Handle；按准确批准逐实例Kill和10秒内实际等待，四者exit -1。该结果仅异常收尾，原正常退出FAIL不改判；旧PowerShell未终止。随后准确旧host路径零进程，1051文件81901301字节当前全清单返回：复用1035个准确本地文件、另回收16个delta，零size/SHA不符、零秘密命中；原第一轮锁/LOG变化/回收FAIL保留。SQLite三件套新副本只读integrity=ok，原数据库/工作区锁及所有历史文件不删除。r3-final-delta/verified-result.json记录完整范围。

R4新根C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R4；批准后创建并从准确旧输入重核hash后复制同一产品/host档案，784/73文件直接核验。只新根/批准/master与普通终态日志夹具差异，产品/native/capture不重编。新master471ff812d7f60e1da82ddb75da239777fa57228d4bf096d78e7f16e85216b2ad，四revision及脚本/checks/registration全hash见frozen-admission-result.json；根669824848bytes。

实际Win10四版各语法/128原自检/88同步回执/15终态真实文件系统测试自然exit0（Node16.17.1）。PS5.1、schema336、实际查询/区间/并发entry/文件门通过。第一次实际SYNC探针未捕捉准确status0短命令的快照，parent自然exit0，PREFLIGHT_NO_PRECISE_ACTUAL_ASSOCIATION保留；同输入重试被OLD_PROBE_RUN保护拒绝、未运行。新的不可变run实际回执唯一关联通过，并据其真实receipt再检查同步验证器通过；不增加等待或放宽判据。四版stage完整准入全部通过。

本地准备首次误选执行包装模板，在目标执行前改为原成功实际模板，旧包装模板保留；目标父目录首次Get-Item无Force未见hidden AppData，在新根创建前失败，修正为Force完成原同范围检查。两者及SYNC首失败都保留，不升级为产品问题或覆盖失败。当前无普通执行记录、八phase NOT_PERFORMED；已给负责人ordinary-desktop-entry-command.txt一次普通账户Win+R启动，等待真实token/Session/creation核验后再派发受控Boot→正常Boot→后台最短→Stop/Release/Recovery→其余回归。矩阵win10-evidence-matrix-r1.json；不恢复旧R3/R10，无提交/推送/发布/删除/系统变更/委派，独立/Win7未执行。


## R4普通入口与短命conhost硬门（14:06Z起）

负责人“已启动”后核验dispatcher106728/creation639267194907369129、SID1005/Session3/Medium8192/Elevated=false/Ordinary=true/InJob=false，准确master/完整命令一致；固定启动14:04:53.8148325Z、截止16:04:53.8148325Z、16请求不变。ordinary-entry-confirmed-r1.json。

只派发受控Boot 6b881f58a34844398588576236cf4741，revision ea557f260e845d6fb69a7a97c3b6d3eeeff15252e07cc1f2d5e570aff8d74c40。dispatcher HALTED/LIFECYCLE_OBSERVED_CHILD_NOT_PINNED:78648；controller HALTED/SAFETY_DRIVER_HARD_GATE；driver FAIL/LIFECYCLE_CAPTURE_FAILED且halt=true，8项中受控断言false。该轮因额外生命周期错误不是预期受控失败PASS，不继续派发。

缺口准确为conhost78648，parent cmd120740。快照区间639267195973734916–639267195973778526，查询639267195973806051，OpenQueryHandle原生错误87；原creation/session/image/exitUNKNOWN。cmd的持有实例creation639267195973551943及exit0、真实SYNC回执`/d /c ver`/windowsHide=true/源模块与请求绑定均明确，parent Electron119160仍准确。回执只覆盖cmd，不能推断conhost的事实。固定capture Snapshot Row仅PID/Parent/Exe/时间区间，身份靠稍后OpenQuery；源capture-source.cs:21,88–90,114–118支持该竞态边界。最小真实链路已经重现，不继续整批概率性重试。

dispatcher8个持有实例实际均exit（worker1、其余0），held_tree_ended=true，但1个unresolved仍保留；没有把此布尔值误当完整生命周期PASS。171文件8090749bytes完整SFTP返回、逐size/SHA零不符、秘密扫描零命中，原dispatcher/driver/捕获诊断/SQLite原件完整保留；stage当前输入后飞行全闭包PASS。矩阵win10-evidence-matrix-r2.json、conhost-common-cause-diagnostic-r1.json、halted-final-return-r1/verified-result.json。

普通日志修复及当前四源获批范围不包含C#/SYNC取证模型改变，第五根未授权；R4不恢复。只读官方资料表明进程ETW Start/End可能提供短命实例事件和ExitStatus，但实际创建精度/父实例闭合/零丢失尚无证据。已形成[最小取证诊断草案](../../plans/A9_31_CONHOST_CAPTURE_DIAGNOSTIC_APPROVAL.md)，仅独立Win10测试组件、隔离有界探针及准确自有临时会话，不批准普通续跑或改判旧失败。ETW尚未实现、编译或启动。正常八phase/独立/Win7仍NOT_PERFORMED，无产品/native/锁/系统改变、提交/推送/删除/委派。

## 已批准的短命进程事件诊断与剩余字段（2026-10-04）

负责人“解决”批准[最小诊断§1–3](../../plans/A9_31_CONHOST_CAPTURE_DIAGNOSTIC_APPROVAL.md)，原文SHA256 d624c814431d8321f9a6db04d007b65ff389e8f7d3b9c7edbff9038968346d80。任务书先登记两源、C15/C16先登记API和目标系统库，然后实现。执行仍是192.168.1.4的Administrator/Session0隔离诊断；不是a9builder普通产品证据。证据统一位于本工作树`.acceptance/a9-31-developer/product-r3-retry-r4/conhost-diagnostic-r1/`，远端仅原R4的`evidence\conhost-diagnostic-r1`。

三次原生尝试全部保留，预算已用完，未执行第四次：

| 版本 | 实际结果 | 分类 |
|---|---|---|
| v1 | 控制台宿主继承console，12个cmd、24事件，没有conhost事件对；会话停止、零丢失 | NOT_PROVEN / NO_CONHOST_EVENT_PAIR |
| v2 | 独立Windows GUI宿主在设置Console.OutputEncoding时抛IOException；精确Application 1026回执、无目标残留、会话查询4201 | 原始宿主失败；ETW尚未启动 |
| v3 | 改用标准输出StreamWriter；12 cmd + 12 conhost、48事件、24对，所有退出0，耗时1814ms；三个丢失计数0，stop/consumer/close均0，查询4201 | EVENT_START_END_CHANNEL_OBSERVED_OS_CREATION_NOT_OBTAINED_NOT_ACCEPTANCE |

v3源SHA256 732673463ac037572f30900995279b45a40f583fa9448124f61355ba67cd672b，EXE d6949a4cf8d5dac6b51fb1c644413e151eafa38780af0b515afe4189cd3589bd，19456bytes，MVID cadddfe2-38b1-4612-b47c-88f02c84cf8d；固定Framework64 csc及三个引用逐hash一致，/target:winexe只改变独立诊断宿主，不改产品或原capture。v3实际宿主100764/creation639267209085122939，自然exit0。丢弃1546条非目标事件仅记录计数，未输出其他进程字段、原始ETL或内核地址。

v3实际报告SHA256 6316eb329e6ebbd523f9ad2769b1d3cd0a92454a0735317ba4d225471816754f。原9项配对自检之外，新增只读纯回放验证：1实际正例+25个PID/key、重复/缺失、父/Session/镜像、opcode/时间/截断、丢失/未知、会话清理、真实根句柄/退出/时间和数量反例。checks-r1首败来自PS将JSON null赋给C# string时变空串；Win10精确复现后改为反射保留null，checks-r2/r3均26项通过。checks-r2回传后本地stderr按UTF8解码失败，远端exit0和原输出均保留；未据此重跑原生探针。检查中发现checks-r2防原生运行分支的正则转义不当，未调用该分支；checks-r3改为字面Contains且PS5.1解析通过。各冻结版不覆盖。

最终纯回放源d9d0018218dace016edb3c3bd18f8eb61ae9b506163bad090c35b3570042fb22，EXE357e0c342f21ecd2f98f021103cc6ad2d735c1b3ccc542fc8b8af87382a5b295/MVID f4d31aa8-1d15-4a2d-880b-cd7a666fe5dd，25088bytes。该版没有执行原生Run，不能替代v3的真实渠道证据。`complete-return-r2/checks-r3/validation-result.json`及`postflight-r1.json`确认回放26项、PS解析0错误、自有会话不存在和目标进程0。

`complete-return-r2/verified-result.json`确认38文件427988bytes、逐size/SHA零不符、合成秘密ASCII/Base64/UTF16零命中；先前18文件返回及所有失败原件继续保留。产品、原固定capture、四控制源及SYNC未改。当前矩阵`win10-evidence-matrix-r3.json`保留正常八phase NOT_PERFORMED和整批NOT_PASS。

**未解决字段不能降级为可接受误差**：12个cmd的事件Start时间比真实OS创建时间晚26.1–34.5微秒，两者不可互填；经典provider未提供child的OS创建FILETIME。当前记录只保存镜像basename，不能证明完整系统路径。这关系实例身份而非提示文字，仍阻断验收；原conhost78648继续UNKNOWN。下一步[manifest精确字段补证材料](../../plans/A9_31_CONHOST_MANIFEST_FIELDS_APPROVAL.md)及ADR-0172为Proposed，拟实证CreateTime/ExitTime/ImageName后再设计普通控制器接入；新增API、探针预算和新证据目录尚未批准或执行。

收尾保护复核`conhost-diagnostic-r1/preservation-r1.json`：R2/R3/R4各16冻结脚本、4个原capture组件、先前18个诊断返回及5个产品源码全部零不符；HEAD仍ebda911，index空，主仓HEAD仍a53c9b9。文档检查286文件/48任务通过；没有产品测试重跑或把纯回放当普通产品验证。

## manifest字段补证直接通过与负责人要求交接

负责人“批准”绑定[补证§1–3](../../plans/A9_31_CONHOST_MANIFEST_FIELDS_APPROVAL.md)原文SHA256 1f61d8b26a935bca8925c4273bf146172c0546f8907e66dd93f9a4a7fac15171；两源及新增三个API先C14/C15/C16登记。准确本地证据为本R4根`manifest-diagnostic-r1/`，远端仅`evidence\conhost-manifest-diagnostic-r1`，Win10 19045的Administrator/Session0隔离诊断，不是普通产品执行。

v1一组首败PAYLOAD_PARENT_ABI，固定父字段偏移与当前manifest不符；原cmd Stop CreateTime/ExitTime已与句柄相等，session停止/零丢失，原失败保存。改为TDH按字段名取PID/Parent后，v2一组直接通过；v3同源扩展12组直接通过，run f62db918def849b9aa25d54c540d325f、12 cmd/12 conhost/48事件/24对，耗时1766ms，宿主73156/creation639267229935839397自然exit0。三次原生预算用完，没有第四次。

实际Start ID1/version3、Stop ID2/version2。cmd创建/退出FILETIME逐字等于真实句柄，conhost Start完整设备映像经固定C:唯一映射到System32/conhost.exe，Session及唯一父实例生命周期闭合；Stop实际只有basename，保留原值，以同PID+CreateTime绑定Start及真实ExitTime/ExitCode，不伪造End完整映像。全部退出0、三项丢失0，stop/consumer/close均0；事件头时间仍非OS创建时间，不混用。

v3源2ecf0ee5b927fd1c8ac316e212515c62f4961002615970d27c46b5e80d0754a5；EXE1428b9f421cc86349343ee23cd2de6020082d661921c2fc7fd0a09c138a73c76/32256bytes；MVID e08a0d38-a05f-4e3d-aec5-102a2498c808；pin aed19e499c1fcf4a36f599e397ac89fe12dfcd57b48cbdeba264f39fa47b1e26。真实probe-result SHA256 0f3508466e0c889d7044bc0e3d64dc3d53005f9e21622b6d5a622b981fc3d590。固定编译器、三引用和三系统库逐hash一致，不安装依赖、不改产品/native/原capture。

7项路径/配对自检，v2及v3实际报告各36项纯回放/反例通过。`complete-return-r1/verified-result.json`确认26文件264909bytes零size/hash不符、合成秘密三编码零命中；`real-replay-postflight-r1.json`确认PS解析0错误、准确session查询4201、诊断进程0。`handoff-preservation-r1.json`确认48历史冻结脚本、4 capture组件、经典38/manifest26返回及5产品源码零不符，index空，当前/主仓HEAD未变。

当前矩阵`win10-evidence-matrix-r4.json`；精确字段缺口在独立诊断中闭合，但普通八phase仍NOT_PERFORMED/整批NOT_PASS。新[R5接入与普通续验草案](../../plans/A9_31_MANIFEST_PROOF_R5_EXECUTION_APPROVAL.md)及ADR-0172普通proof仍待批准，六源/新观察器/第五根未创建。负责人在草案形成后要求handoff，没有批准R5；[最新handoff](a9_31_manifest_diagnostic_handoff_2026-10-04.md)列明下一agent应先只读复核设计、再取得具体批准。未提交/推送/删除/恢复R10/委派/独立/Win7。

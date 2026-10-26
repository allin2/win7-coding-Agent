# 项目状态流水（历史）

## Python导入前置问题已实机复现，原M5仍FAIL（2026-10-23 UTC）

ADR-0271批准的一次零模型诊断已完成。run80c43fa0-692f-49c7-9b71-2357ca6837a0，WIN7-54/source9b385246/ZIP3737852a不变；封存16件及派发器经同一只读独审0P0/P1。实际Electron22.3.27/Node16.17.1/ABI110的27项合成自检PASS；普通agent/SID1001/session2/Medium/非管理员/实际Node无Job。

三次固定Python调用全部自然结束：PATH探针exit0且实际exe/SHA/3.8.10/cwd匹配；同exe原test_calc.py自然exit1、IMPORT_CALC_FAILED；仅进程内sys.path插入夹具目录后，同脚本自然exit1、ORIGINAL_ASSERTION_FAILURE。两条原加减断言失败可达，完整新JOURNEY_FILES不变。cwd_in_sys_path=false、isolated/no_site=true、ignore_environment=false；python._pth不存在、python38._pth存在，其条目匹配exe目录而非脚本目录、未import site。旧calc/test目前ordinary存在，仅metadata/realpath，无内容读取。

该对照支持固定解释器在该受控中文空格fixture下缺少工作目录搜索路径足以造成导入失败；不证明旧M5调用瞬间全部环境，不证明产品Runner已修复，也不建立导入异常导致累计1MiB耗尽的因果。原M5 A01/A02/A06 PASS、A03 FAIL、A04/A05断言NOT_PERFORMED；11请求/费用UNKNOWN及786432000 nanoUSD未结算预留保持。没有重跑M5、请求模型或修改共享PATH/_pth/系统。

四件3991字节目标扫描/正控/phase2正控PASS，findings=[]、精确传输集合及逐size/SHA一致；DIAG_RESULT SHAd097f0c9a651b6c3efef764171ee1e17de73a2350ecdc2b10dc019b5e69ee3a7，inventory SHA2991862a7e64a2d3940595228cdb451359fdd8a432259d72b95ba40f2b2b3439。实际结果只读复核0P0/P1。未回传_pth/profile/凭据；实际凭据字面量扫描NOT_PERFORMED。诊断约2秒/输出1171字节、客户端全窗69.6秒；父自然exit0、无forced/IO/limit/cleanup错误，最后status根进程/任务空、锁inactive，当前无远端活动。

证据PYTHON_DIAGNOSTIC_WIN7_DEV_VERIFIED.json、PYTHON_DIAGNOSTIC_TARGET_REVIEW.json、PYTHON_IMPORT_DIAGNOSTIC_REPORT.md。runtime.python_execution=NOT_PERFORMED是准入采样字段，后续三次实际调用见calls，原JSON不覆盖。下一步工程建议为先盘点并准备隔离Python运行时，再用当前候选实际TrustedShellRunner验证原命令红→绿短链；闭包及新配置/执行路径尚未授权或实现，不直接改共享_pth或自动重试M5。原37/67 DEV PASS与全部历史首败保持；正式A/B NOT_PERFORMED，无提交/推送/冻结/产品构建。

## Python导入诊断获准，本地实现待独审（2026-10-23 UTC）

负责人已批准提案SHA266d467e8748af3071232d91c118797759f9c8b1cb614954aef1f706511cb5d3，登记ADR-0271/任务r64。新run80c43fa0-692f-49c7-9b71-2357ca6837a0，仅一次零模型请求、最多三Python调用/300秒的候选外诊断。27项合成检查PASS、10份CJS语法PASS；16件封存、7同SHA依赖和8嵌入payload逐项核对通过，同一只读实现独审进行中。目标诊断NOT_PERFORMED，无远端活动。

本轮不改产品/native/ZIP、原driver/guard/M5断言或系统/_pth/PATH，不重跑M5。原A01/A02/A06 PASS、A03 FAIL/A04/A05 NOT_PERFORMED、11请求和未结算预留保持。原完整37/67 DEV PASS继承；正式A/B NOT_PERFORMED，无提交/推送/冻结。当前状态见m5-admission-r1/PYTHON_DIAGNOSTIC_CURRENT_EXECUTION_CHECKPOINT.json。下文是历史记录。

## 新M5越过恢复门，A03因响应上限FAIL，已收尾（2026-10-23 UTC）

WIN7-54/source9b385246/ZIP3737852a保持。新run12fb889e-4361-4002-9347-8133d304a017实际Node16新增34项合成准入PASS、固定九件材料适用性/三件复制PASS；原源内容未重读、恢复诊断未重跑。旧恢复只记INHERITED_EVIDENCE。封存28件seal cb59d049及派发器368d1716经同一只读独审0P0/P1，实际材料复审0P0/P1。准备174.4秒时派发唯一原M5，余3425.6秒，满足原300/3600及足额3000秒门。

| 原断言 | 本run Win7 DEV状态 | 事实 |
|---|---|---|
| A01 | PASS | 正常产品恢复key available/source dpapi，真实probe两个请求、tool_calling |
| A02 | PASS | 只读解读、严格源码行引用，未写文件或执行Shell |
| A03 | FAIL | python test_calc.py先报ModuleNotFoundError: calc；随后累计响应触M5_FEE_RESPONSE_LIMIT |
| A04 | NOT_PERFORMED | 未产出该断言；不声称每个局部driver步骤均未进入 |
| A05 | NOT_PERFORMED | 未产出该断言 |
| A06 | PASS | 运行中Provider配置被拒绝且原进程/配置未受影响 |

响应累计1,049,223字节，原上限1,048,576；含已收到随后拒绝的越界chunk。原driver及guard均按整个main累计，没有改为逐请求或放宽。已发11请求、有效usage结算10请求，后者保守费用上界US$0.0172533；保留未结算请求预留后的承诺上界US$0.8036853。费用门与实际总账单UNKNOWN，不能将缺usage当0或记费用PASS。后续driver TIMEOUT:review diff不覆盖首个A03 FAIL。

22件132839字节目标下载前扫描/正控/phase2正控PASS，逐项size/SHA一致；inventory SHA f80765b2ec6343ed2e080df0245e832c4497b51a680d7f97e6825a32c558df8d，M5_RESULT SHA04f0c5e057d1405888fe5482f4af9fa4109e3a5832507e3efb0804d50b5c5857。没有回传profile/配置/密文，实际凭据字面量扫描NOT_PERFORMED。两Stage.related=[]、父自然exit1、无强制/IO/上限/cleanup错误；rehearsal保留准确SGTool环境实例，未终止，不宣称全局环境0。09:05:23.8524002Z最终status根内进程/任务空、锁inactive，当前无远端活动。

完整核验FRESH_M5_WIN7_DEV_FAILURE_VERIFIED.json、首败FRESH_FIRST_FAILURE.json、分析M5_A03_FAILURE_ANALYSIS.md。只读分析未发现calc删除证据，但实际sys.path/_pth/调用时文件在场及导入异常与耗尽响应之间因果均UNKNOWN。下一步仅建议M5_PYTHON_MODULE_DIAGNOSTIC_PROPOSAL.md的一次零模型请求导入诊断；新诊断未授权/未实现/未连接，不自动重跑M5或修改系统。原完整37/67 DEV PASS、旧r1/r2和历史HALTED/首败保持；正式A/B NOT_PERFORMED，未提交/推送/冻结或改产品。下文是历史记录。

## 新窗口获准，r3 本地实现完成并待独审（2026-10-23 UTC）

负责人已批准准确 SHA21812a596c76a6c2babb816eac7fa8831d90ad8da50e92b45f486c8ce592c535 的 M5_FRESH_WINDOW_PROPOSAL.md，登记 ADR-0270/任务 r62。新 run12fb889e-4361-4002-9347-8133d304a017 及新根 C:\A9-DEV\m5\12fb889e 仅在本地备好，目标执行 NOT_PERFORMED。下文“新窗口待裁决”是批准前历史状态。

r3 新增隔离九件材料适用性核对/三件 CreateNew 复制；原三个用户源文件只查询 metadata，不读内容，不重跑恢复诊断。新窗口3600秒、准备最多300秒，派发前足额保留3000秒；原两Stage/六断言/US$1/40HTTPS/3Turn/1MiB/绝对截止/终止边界保持。管理 prepare 只核对旧26件非秘密执行输入并批量本地复制/写入，真实材料由实际普通 agent 准入后处理。

开发机新增30项合成拒绝门检查 PASS、20份CJS语法 PASS；只读实现审核进行中。旧恢复 PASS 标 INHERITED_EVIDENCE，不能代替新 A01。WIN7-54/source9b385246/ZIP3737852a 保持，原完整37/67 DEV PASS及旧r1 A01 FAIL/r2准备停止不可变。正式A/B NOT_PERFORMED，未提交、推送、冻结、重建产品或修改系统。当前 checkpoint：outputs/a9-39-w52-package-prep/m5-admission-r1/FRESH_CURRENT_EXECUTION_CHECKPOINT.json。

## r2 实机恢复 PASS，M5 因准备预算在派发前停止（2026-10-23 UTC）
新run6857d9bb-030d-488f-9dae-37e5b98e5b73实际Electron22.3.27/Node16.17.1/ABI110下54项无网络自检PASS，普通agent/SID1001/session2/Medium/非提升/实际Node无Job；26件输入和候选800件闭包核对。费用守卫、原driver、产品和ZIP未变，最终只读实现独审0P0/P1，绑定seal70c5068a及派发器29bdb9ca。

第一组真实产品诊断准确记录CREDENTIAL_DECRYPT_FAILED、key unavailable/source none，配置/record/dataRoot/userData/sessionData/vault/保护均正常、网络0；自然exit0/postflight.related=[]。严格满足该门后，才按批准读取固定原Local State、仅提取os_crypt.encrypted_key密文字段。第二组新profile恢复key available/source dpapi、diagnostic null，其余路径/保护正常、网络0，自然exit0/related=[]；源metadata和两组副本一致性直接核验。当前密文的profile-key依赖得到实机对照支持，不能据此推断所有历史源字节相同。两组中准确搜狗环境实例仅分类保留，未终止。

RESTORE_RESULT SHA87ba0b278e79c985cb68050560897193abee2413e2374348c5b386a00871cd4f，parent launch SHAa75fca5bfee90ac345c479d312e5436c4ff9ff6eeb706b49f84bc03fd38fb300，parent自然exit0/forced=false/process_ended=true，无IO/上限/收尾错误。同一只读目标复审0P0/P1；这只覆盖DEV恢复准入，不等于M5或正式验收PASS。

复审后在准备约575秒时调用run准入；上传非秘密复审receipt及fresh status后，profile_dispatch.py:148的600秒门拒绝，未调用M5 launcher。准确profile-actions/M5-ONCE.attempted不存在，旧actions/M5-ONCE.attempted属c506ff62历史失败。新M5 NOT_PERFORMED、实际模型请求0、费用门NOT_PERFORMED，不计产品旅程FAIL。原600秒/时间锚/输入未修改，准备方案低估了26次传输及最后预检耗时；不以延长预算或重计时绕过。

按原同SHA scanner/严格清单路径完成final回收，10件12589字节逐项size/SHA一致，目标下载前正控/phase2正控及扫描PASS、findings0，inventory SHA928170e69e5a850454b80d9ed524ec4d12c482d9bcaf0fd128d6eb4457339e46。没有下载配置、密文、profile或stamp。最终08:32:10.5794002Z status根内进程/任务空、锁inactive，根7867826404字节；本轮收尾时总耗743.7秒，当前无远端活动。证据PROFILE_RESTORE_WIN7_DEV_VERIFIED.json、PROFILE_PREPARATION_BUDGET_STOP.json、PROFILE_FINAL_RECOVERY.json及PROFILE_FINAL_TARGET_STATUS.json。

原r1 A01 FAIL、原完整DEV37/67 PASS、全部历史首败/HALTED/UNKNOWN保持；正式A/B NOT_PERFORMED，未冻结，无提交/推送/产品构建或系统修改。旧窗口不能完整容纳同步后原阶段/回收上限，未批准的延续草案有预算与marker歧义P1，已停用。

新M5_FRESH_WINDOW_PROPOSAL.md仅待裁决：新run/r3，原三个源文件内容不再读取，只复用旧隔离根精确九件核对/三件复制及已核恢复证据；不重跑诊断。新3600秒窗口含最多300秒准备，M5前足额预留3000秒阶段/回收，原US$1/40HTTPS/3Turn/1MiB/两Stage六断言/环境/终止/绝对截止保持。新r3/newrun尚NOT_PERFORMED，不新增Accepted ADR或擅自扩范围。状态继续沿用既有索引与日志。

## profile 恢复提案获准与本轮影响（2026-10-23 UTC）
负责人对完整提案回复“批准”，准确SHA13ac240b328b6eb3d684a1f4aa08638951733b857dcb21b4bd32737e0b202a07，登记ADR-0269及OWNER_PROFILE_REPAIR_APPROVAL.json。当前分支codex/a9-alpha2-integration-r2/HEAD9b385246不变，原五份dirty文档保留；原WIN7-54和原37/67 DEV PASS保持。本轮仅取证/普通编排夹具变化，不改产品/native/ZIP，不重建原生或候选。

C14准确新增.acceptance/a9-39/w54-dev-m5-package-r2内提案§5全部明确路径及必要同SHA输入；精确范围、两组条件诊断、第三文件唯一字段例外、下载前扫描和停止条件按已批准提案及ADR-0269。主代理实施与目标操作，同一只读独审；窄验证→实际Node16合成无网络准入→原两文件同字节第一诊断→满足明确解密失败才第三文件/第二诊断→独审→唯一原M5 DEV，是本轮最短真实链路。

原r1费用守卫/driver及适用检查按逐SHA保持标INHERITED_EVIDENCE；新profile提取/拒绝门/扫描/接线直接验证。产品恢复和M5目标结果仍UNKNOWN，新实现/目标执行待完成，不以文档批准记PASS。600秒准备包含诊断/中间复核、3600秒总墙钟、原截止/费用/断言/终止边界保持。原首败不可变，无提交/推送/冻结/正式A/B或系统修改。

r2封存seal70c5068a，54项本地窄检查和最终只读独审0P0/0P1通过。run6857d9bb已进入Win7实际能力自检与条件恢复对照流程，结果UNKNOWN；不并发其他目标操作。当前状态见整合树outputs/a9-39-w52-package-prep/m5-admission-r1/PROFILE_CURRENT_EXECUTION_CHECKPOINT.json。下文保留历史。

## M5 在 A01 密钥恢复处 FAIL；实际模型请求0，已收尾（2026-10-23 UTC）

WIN7-54/source9b385246/ZIP3737852a不变。ADR-0268唯一run `c506ff62-2487-47d2-abbb-1f1a70e9b783` 已结束：A06 PASS，A01因 `A9_36_SAVED_PROVIDER_NOT_READY` FAIL，A02～A05 NOT_PERFORMED。配置已加载、记住标记true，但key unavailable/source none；probe0。获批两个源文件已读取并隔离复制，不再沿用执行前的“未读”状态。

费用守卫在原driver前安装，sent0/settled0/response0、本地计价上界US$0；fee状态仍UNKNOWN，不把零请求当费用门PASS。真实TLS、服务usage及供应商账单NOT_PERFORMED。800件候选闭包及60项实际Node16无网络能力自检PASS，不替代M5行为。

两个GUI自然退出；parent exit1、forced=false、process_ended=true，无IO/上限/收尾错误。最终根内进程/任务空、锁inactive。A06保留了准确分类的SGTool环境实例，未终止；不能据此写全局环境进程0。18件28915字节逐项size/SHA核验，17件执行输入未变，原run不重跑、不改判。

精确Electron22.3.27/Chromium108源码显示safeStorage另依赖Local State中的DPAPI包封profile key。原两文件方案可能遗漏该层，实际根因仍UNKNOWN，因为旧A01没有输出详细恢复码。只读机制核对见 整合树 outputs/a9-39-w52-package-prep/m5-admission-r1/RESTORE_MECHANISM_ANALYSIS.md。新 整合树 outputs/a9-39-w52-package-prep/M5_SAFE_STORAGE_PROFILE_REPAIR_PROPOSAL.md 仅为DRAFT_READY_FOR_REVIEW；第三文件读取、新诊断和第二次M5均NOT_PERFORMED。

开发机下载后扫描19文件、正控/phase2正控PASS、findings0；目标下载前扫描NOT_PERFORMED，r1漏接扫描器的工具缺口保留，不补写R7 PASS。完整结果见 整合树 outputs/a9-39-w52-package-prep/m5-admission-r1/M5_WIN7_DEV_FAILURE_VERIFIED.json。原完整DEV37/67 PASS保持，正式A/B NOT_PERFORMED；无远端活动、提交/推送/冻结或系统修改。下文保留原时点记录。

## M5 已通过实际能力门，唯一 DEV 旅程执行中（2026-10-23 UTC）

WIN7-54/source9b385246/ZIP3737852a不变。实际Win7 Electron22.3.27 / Node16.17.1 / ABI110、Python3.8.10、Git2.46.2准入通过；普通agent/SID1001/会话2/Medium/非提升/无Job直接核验。候选完整800件与封存输入核对通过，原driver字节不变。无网络能力自检60项PASS，包含真实ClientRequest/IncomingMessage内存虚拟socket和原driver双wrapper；不作为真实TLS证据。自检后进程/任务0、锁空闲。

ADR-0268获批的唯一原M5 run c506ff62-2487-47d2-abbb-1f1a70e9b783已进入派发；保持原rehearsal→main、六断言、US$1、40HTTPS/3Turn/1MiB，第一次目标准备至派发前311秒，未超原600秒准备预算。官方计价/别名映射已重核，费用守卫在首个body bytes发送前验证Flash请求模型并先预留最坏费用，未知usage即停。

M5最终结果UNKNOWN；实际请求数、费用和两文件访问事实待本run回收核验，不写0或PASS。只观察本地控制器，不并发操作目标。原完整DEV37/67 PASS保持；不提交/推送/冻结/正式A/B或系统修改。证据沿用整合树outputs/a9-39-w52-package-prep/m5-admission-r1/。下文保留原时点记录。

## M5 精确例外已批准；候选外实现与独审完成（2026-10-23 UTC）

负责人已批准M5提案SHA2981f0752161372649a15764974d6e1400a263a033e9bed48b65ff6c7ce34e33，登记ADR-0268 / A9-39 r60。仅普通agent两个固定源文件的读取/隔离密文复制例外，US$1费用准入，保持原两Stage/六断言/40HTTPS/3Turn/1MiB，独审及实际无网络自检后唯一M5 DEV。
主代理实现候选外w54-dev-m5-package-r1；本地60项PASS，独审发现的逐请求model覆盖计费缺口已在body首次发送前关闭，复审0P0/P1。实际Node ClientRequest/IncomingMessage内存socket及原driver双wrapper检查通过，不算TLS实测。17文件seal e529ee0c1a3f23e2fe81d5abd87ac0389ec977ae17548c7a3784b74d4c8fbb65已封存，run c506ff62-2487-47d2-abbb-1f1a70e9b783正在做Win7无网络自检；M5付费旅程尚NOT_PERFORMED，真实请求0，未读原配置/凭据。
原WIN7-54完整DEV37/67 PASS保持。无提交/推送/冻结/正式A/B/系统修改。当前结果以outputs/a9-39-w52-package-prep/m5-admission-r1/CURRENT_EXECUTION_CHECKPOINT.json为准。下文保留历史。

## M5 准入提案已备；待两文件例外及费用守卫裁决（2026-10-22 America/Los_Angeles）

WIN7-54完整DEV 37/67 PASS保持（run 1f013870）。负责人要求继续推动M5。本轮完成源码入口/隔离边界审计、公开模型与计价资料核对、新严格只读目标status；agent会话2、进程/任务0、锁inactive，未读真实配置或凭据，模型请求0。
现有M5编排器必须读取并复制配置/DPAPI密文；产品没有现成的配置来源与状态根分离入口。ENGINEERING_03 §7明确禁止该动作，ADR-0267也不含M5。本轮不从“继续推动”推导凭据例外或新C14路径。
准确提案outputs/a9-39-w52-package-prep/M5_DEV_ADMISSION_PROPOSAL.md已备：仅两个固定源文件由普通agent校验/隔离复制，候选外新M5包和US$1保守费用准入，保持原两Stage/六断言/3Turn/40HTTPS/1MiB，独审及实际无网络自检后仅一轮DEV。旧请求别名继续，但当前服务映射为V4.1-Flash-1017，需明确接受；不写原配置。提案为DRAFT_READY_FOR_REVIEW，实现与M5实机NOT_PERFORMED；M5保持BLOCKED_BY_STANDING_AUTHORIZATION，正式A/B NOT_PERFORMED。无提交、推送、冻结或系统修改。证据m5-admission-r1/；下文保留历史。

## WIN7-54 原完整 Win7 DEV 37/67 PASS；M5 与正式门待准入（2026-10-23 UTC）

当前产品源 `9b385246a6fff911162e8effaf15a12de76903a8`，两份 ZIP SHA `3737852aa9525ff3f3871b9c09fce9115e2462fa31da3baa32a20f992d0f0b86`。获批候选外 r4 的唯一原总控 `1f013870-b6cf-4889-8f7d-f7f48d933631` 已完成，37 用例 / 67 断言全部 Win7 DEV PASS，原 GPU 门、R7、R8 均 PASS。GUI 原句柄和 OS 退出事实准确绑定，退出码0。1584 件 / 181447300 字节选定原始证据大小与 SHA 全部一致；233 项依原合同不下载，不计已回收。R8 进程、任务、环境列表均为空；最后只读锁 inactive。

74 项开发机窄合同、实际 PS2/默认 PS5 各59项自检通过；实际 CLR 为2.0.50727.8806/4.0.30319.42000。同一只读最终独审0 P0 / 0 P1。缓存因果保持 UNKNOWN_PRECONDITION_NOT_REPRODUCED。两ZIP及r2/r3/r4各94文件核验未变，旧 HALTED/首败/UNKNOWN保留。无第二次完整目标运行。

M2同候选原6 Stage /13断言DEV PASS；M1～M4原38断言与M6组件跨读5断言在本轮为INHERITED_EVIDENCE，未重跑。M5 BLOCKED_BY_STANDING_AUTHORIZATION，正式门A/B NOT_PERFORMED，候选未冻结。下一步为M5准入/授权缺口及新正式材料；当前无远端活动，无提交、推送、冻结或系统修改。

最终报告及核验：整合树 `outputs/a9-39-w52-package-prep/controller-w54-r4/REPORT.md`、`FULL_WIN7_DEV_VERIFIED.json`、`FINAL_IDENTITY_AND_STATUS_VERIFIED.json`、`FINAL_EVIDENCE_READONLY_REVIEW.json`；任务书§11.8.130。下文保留历史时点记录。

## WIN7-54 r4 已完成准入，唯一原总控 DEV 执行中（2026-10-23 UTC）

74项开发机窄合同、最终实际PS2/默认PS5各59项及同一只读复审0P0/0P1通过。真实CLR/程序集及原句柄保持已记录。两运行时均未复现存活时1601，缓存因果保持UNKNOWN。
获批唯一新run 1f013870-b6cf-4889-8f7d-f7f48d933631已派发，原37/67、预算、GPU/R7、WMI/Dispose和终止边界保持，结果UNKNOWN。仅观察本地进度，等待自动回收。M2原13断言DEV PASS保留；不提交、推送、冻结、M5、正式门A/B或系统修改。证据controller-w54-r4/。

## WIN7-54 r4 缓存局部修复已批准（2026-10-23 UTC）

负责人已批准GPU_EXIT_CACHE_REPAIR_PROPOSAL.md，ADR-0267 / A9-39 r59登记精确候选外路径。主代理实施，同一只读独审；窄合同及实际PS2/PS5方法、句柄和自然退出自检通过后，仅一轮原完整DEV总控。
M2同候选原13断言DEV PASS，r3 GPU拒绝EXIT_TIME_1601和HALTED保留。r4结果UNKNOWN；原37/67、预算、WMI/Dispose/GPU/R7/终止边界保持。无提交、推送、冻结、M5、正式门A/B或系统修改。证据沿用controller-w54-r4/。

## WIN7-54 r3 已定位 GPU 拒绝原因；完整 DEV 保持 HALTED（2026-10-23 UTC）

当前源9b385246a6fff911162e8effaf15a12de76903a8，WIN7-54 ZIP3737852aa9525ff3f3871b9c09fce9115e2462fa31da3baa32a20f992d0f0b86。M2原6 Stage/13断言Win7 DEV PASS；M1～M4共38断言与M6组件5断言的同候选证据保留。
获批唯一r3总控4adca5c3通过传输/逐件SHA/展开及p01/p02，在原GPU门HALTED。GUI5164原句柄绑定true，终态和同次trace准确记录EXIT_TIME_1601；该GUI无有效OS退出事实。1601生成机制仍UNKNOWN，不能以Node exit/close0改判。p03～p10 NOT_PERFORMED，完整37/67未完成。
R7保持metadata-only；固定6件诊断44355字节逐项核验，不能冒充密封R7。R8根内进程/任务/环境列表均空，最后只读锁inactive。r2/r3各94文件与两ZIP均未变。72项开发机窄合同、实际PS2/默认PS5各39项及同一只读独审通过。
新GPU_EXIT_CACHE_REPAIR_PROPOSAL.md已备并经只读独审0P0/0P1，申请仅新r4的同对象缓存刷新/零等待信号准入；待负责人裁决，r4实现与执行NOT_PERFORMED。依据AGENTS.md §4/C14和ADR-0266，现批准仅诊断且不改变读取序列。
本轮无提交、推送、冻结、M5、正式门A/B或系统修改。旧HALTED/首败/UNKNOWN保留。证据：整合树outputs/a9-39-w52-package-prep/controller-w54-r3/FULL_WIN7_DEV_FAILURE_VERIFIED.json及同目录REPORT.md。下文保留历史。

## WIN7-54 r3 原总控 DEV 已派发，结果 UNKNOWN（2026-10-23 UTC）

ADR-0266候选外固定拒绝原因诊断已实现。开发机72项窄合同、实际Win7 PS2与默认PS5各39项自检及同一只读独审0P0/0P1通过。原r2的94文件和两WIN7-54 ZIP核验未变。
获批唯一新run 4adca5c3-8419-4069-b8ac-5a07b6e3d978已派发，原完整37用例67断言及R0～R8、GPU/R7/终止边界保持；当前结果UNKNOWN。仅观察本地进度，不并发操作目标。
M2仍为原6 Stage/13断言DEV PASS；正式门A/B NOT_PERFORMED，M5 BLOCKED_BY_STANDING_AUTHORIZATION。没有提交、推送、冻结或系统变更。证据沿用controller-w54-r3/及outputs/win7-dev/formal/4adca5c3/。下文保留历史。

## WIN7-54 package-r3 固定拒绝原因诊断已批准（2026-10-23 UTC）

负责人已批准提案，ADR-0266及A9-39 r58登记新包精确范围。主代理实施，复用同一只读独审；窄合同和实际PS2/默认PS5自检后，仅一轮原完整DEV总控。原GPU/R7门、37用例67断言、预算和终止边界保持。
M2仍为WIN7-54开发实机原13断言PASS；完整37/67尚未完成。旧c609e0e6保持HALTED。产品/ZIP不变，不提交、推送、冻结、M5或正式门A/B。
当前实施及新实机结果UNKNOWN；证据沿用outputs/a9-39-w52-package-prep/controller-w54-r3/。下文保留原时点记录。

## WIN7-54 的 M2 开发实机 PASS；完整验收仍受 GPU 退出事实门阻断（2026-10-23 UTC）

当前源 `9b385246a6fff911162e8effaf15a12de76903a8`，ZIP `3737852aa9525ff3f3871b9c09fce9115e2462fa31da3baa32a20f992d0f0b86`。
原 M1～M4 的 10 Stage / 38 断言全部 Win7 DEV PASS；其中 M2 为原 6 Stage / 13 断言（run `bd937f3b`，83 件原始证据核验）。
M6 原 10 探针 / 5 断言 Win7 DEV PASS（run `37dd4628`，14 件原始证据核验），仅证明持久化组件跨读。
候选外观察器修复的 72 项开发机合同、20 项实际 PS2 自检、原 p04 的 6 用例 / 7 断言和独审 PASS。
完整 run `c609e0e6` 已通过传输/逐件 SHA/展开和 p01/p02（2 用例 / 9 断言），在 GPU 入口 OS 退出事实 UNKNOWN 处保持 HALTED；p03～p10 NOT_PERFORMED，未完成37/67。
原 GUI 已加载且 GPU 启动失败计数0；Node exit/close0不能替代 OS 退出事实。R7 保留 metadata-only，R8 根内进程/任务空，准确 SGTool 环境实例未终止。
PS2、默认 PS5 最小 Node 对照均8/8取得有效事实；未复现原缺口。自制单GUI4180e171和5b4d8659的入口失败保留；后者停在guard_return后、未ready，原65秒看门狗触发，不能证明原缺失属性原因。
已停止新增GUI/整批重试。原总控环境与隔离诊断环境存在明确非等价项，但因果仍 UNKNOWN。
新 `GPU_EXIT_DIAGNOSTIC_SCOPE_PROPOSAL.md` 已备好：申请不可变 package-r3，在原总控入口只记录固定拒绝原因，保持环境、门、终止和原37/67；待负责人裁决，r3实现及执行 NOT_PERFORMED。
最后只读 status：DCCS-CHAIZL-PC / build7601 / agent会话2、根内进程/任务空、锁inactive，根占用6112462136字节；目标生命周期仅按各原run事实理解。
两份原WIN7-54 ZIP和package-r2的94件封存文件重新核验未变。旧FAIL/HALTED、UNKNOWN、首败和全部原输入保留。
本轮无新提交、推送、冻结、发布或系统修改；M5仍BLOCKED_BY_STANDING_AUTHORIZATION，正式门A/B NOT_PERFORMED。
证据沿用整合工作树 `outputs/a9-39-w52-package-prep/controller-w54-r2/`。下文保留原时点记录。

## WIN7-54 观察器修复通过短链，完整开发总控执行中

本轮修复仅位于候选外 controller-r2，产品 ZIP、原生组件和原 r1 包未改。
源码为9b385246a6fff911162e8effaf15a12de76903a8，ZIP为3737852aa9525ff3f3871b9c09fce9115e2462fa31da3baa32a20f992d0f0b86。
72项开发机合同检查、20项实机PowerShell 2.0自检及只读独审通过。
原p04短链cb7bcf43的6用例/7断言PASS，31件原始文件核验一致。
38条有效OS退出事实与4条退出事实UNKNOWN的代际结束分别记录。
新完整DEV总控7b442abc正在执行，结果UNKNOWN；旧a46f89ee保持HALTED。
M1～M4与M6补充检查待新run；不把旧WIN7-52结果改签为当前候选PASS。
不提交、推送、冻结或发布；M5和正式门A/B未执行。
证据见整合工作树outputs/a9-39-w52-package-prep/controller-w54-r2/。
下文保留各原时点记录。

## WIN7-54 short DEV PASS; controller exit observer repair approved (2026-10-23 UTC)

Source9b385246a6fff911162e8effaf15a12de76903a8; ZIP3737852aa9525ff3f3871b9c09fce9115e2462fa31da3baa32a20f992d0f0b86, two clean builds byte-equal.
DEV026a7170 original p06/p05:6cases9assertions PASS,55rawfiles verified.
Full DEVa46f89ee remains HALTED at R6-p04. Product p04sixcases PASS; first task failure was null ExitTime at writer-registry.ps1:228.
R7 metadata-only/R8failed; later stages NOT_PERFORMED. Old candidate failures retained.
Owner approved ADR-0265 candidate-external controller-r2 repair.9 local narrow checks PASS and read-only independent0P0/0P1; actual PS2 selfcheck in progress.
Same WIN7-54 ZIP unchanged. No commit/push/freeze/M5/formal GateA/B/system settings or termination expansion.
Existing WIN7-52 M1/M2/M3/M4/M6 results retain original bindings; no re-signing as WIN7-54.
Evidence: integration worktree outputs/a9-39-w52-package-prep/controller-w54-r2/ and A9-39 section11.8.117.
Earlier entries below are historical snapshots.

## WIN7-53 短链 FAIL 已定位，WIN7-54 修正开发检查通过（2026-10-23 UTC）

WIN7-53/source068b5e7 的 DEV run cc49e091 在原 B2-CONT-03 A01 FAIL。
清理先结束 PowerShell，导致 tool_end 在 GUI 中断前落盘；隔离数据库只读证据已确认。
30 件原始证据逐项核验，旧 FAIL 和候选不覆盖。完整总控 fd0a57d8 未派发。
主代理按 ADR-0264 修正窄中断分支：准确绑定固定 PowerShell，先中断 GUI，再有界观察 Job 自然退出。
未知后代、PID 复用或超时停止，无直接终止回退；release 保留受控清理。
开发机完整合同691项、受影响打包3项 PASS，独审0P0/0P1。
WIN7-54 准备本地提交和双干净构建；新候选实机 NOT_PERFORMED。
WIN7-52 的 M1/M2/M3/M4/M6 仍绑定原候选及 run，不改签为新候选 PASS。
目标最近核验根内进程/任务空，锁 inactive；1个准确 SGTool 环境实例仍有记录。
M5、正式门A/B、冻结、推送和发布未获授权。
证据见整合工作树 A9-39 §11.8.116 与 outputs/a9-39-w52-package-prep/。
下方记录按原时点理解。

## 受控清理修复开发检查通过，准备 WIN7-53（2026-10-23 UTC）

负责人已批准 ADR-0264 的受控清理及固定夹具系统进程例外。
主代理完成 smoke、driver 和合同测试修复。
开发机完整合同684项、打包合同9项PASS。
最后worker补齐后60项受影响检查PASS；与完整合同重叠，不相加计数。
独审0P0/0P1。即将按批准范围本地提交并双构建WIN7-53。
新候选实机NOT_PERFORMED；WIN7-52的M4/M1开发PASS保留原run e1e87b62。
M2/M3/M6保持各自旧run，M6限组件跨读。
完整新候选总控与正式门A/B仍NOT_PERFORMED，M5禁令保持。
开发根保留，未终止根外实例；没有推送、冻结或发布。
准确材料见整合工作树A9-39 §11.8.113～114和outputs/a9-39-w52-package-prep/。
下方记录按原时点理解。

## WIN7-52 M4、M1 开发实机通过；完整总控待终止边界裁决（2026-10-23 UTC）

主代理完成 ADR-0263 的准确 SogouExe 分类修复。
开发机针对性合同检查 72 项 PASS，独审 0P0/0P1。
工具 SHA-256 为 6afd0549…；修复尚未提交。
候选仍为 WIN7-52/source908da8c…，ZIPf782f465…，字节未变。

Win7 DEV 新 run e1e87b62：原 M4 三项、M1 十一项 PASS。
每组 GUI 自然退出 0，postflight.related 为空。
实际 Node16.17.1 的 32 项分类合成准入先于 GUI 完成。
26 件实机原始文件逐项大小及 SHA 一致。
环境 SGTool 存活有记录，不写成全部进程为零。
旧 M4 两次 FAIL 和旧实例映像 UNKNOWN 保留。

开发机总控绑定检查和 63 项合同检查 PASS。
新 run b513a6ab 未派发，完整 R0～R8 为 NOT_PERFORMED。
必跑中断调用 taskkill /T；release 清理也未限定映像。
ENGINEERING_03 §7 明确禁止根外终止，故派发为 BLOCKED。
同一只读独审确认没有可用的固定入口安全钩子。
主代理已提出受控清理修复、新候选及严格夹具实例例外，等待负责人裁决。
见整合工作树 outputs/a9-39-w52-package-prep/CONTROLLER_SCOPED_CLEANUP_REPAIR_PROPOSAL.md。

M2/M3/M6 保留各自原 WIN7-52 DEV PASS；M6 限组件跨读。
M5 为 BLOCKED_BY_STANDING_AUTHORIZATION；正式门 A/B 为 NOT_PERFORMED。
最近已回收 status 显示开发根仍在，约 1.067GB，根内进程/任务空、锁 inactive。
开发根本轮尚未再次关闭；上轮 CLEANUP_COMPLETE 只作历史快照。
本轮未提交、推送、冻结或终止根外实例。
准确证据见 A9-39 §11.8.108～112 与 M4_M1_WIN7_DEV_VERIFIED.json。
下方记录按原时点理解。

## M4直接映像已定位，准确环境分类提案待裁决（2026-10-23 UTC）

Win7 DEV直接证据绑定WIN7-52/source908da8c…、ZIPf782f465…，新run3529c0f5。M4三业务断言PASS、GUI自然退出0；组FAIL保持。同次原WMIC列表直接确认两个related实例均为C:\Program Files (x86)\SogouInput\SogouExe\SogouExe.exe，ImageSource=executable_path，已保存PID/父PID/会话/创建时间。10件原始文件大小/SHA核验一致。旧run19b28f78原映像UNKNOWN及原FAIL保留。

准确分类超出现行ADR-0258的SGTool规则，提案待负责人明确裁决；两条实现路径尚未修改。建议只允许一个准确完整映像与有效目标身份，其他进程及failed列表继续FAIL。见整合工作树A9-39 §11.8.106～107、outputs/a9-39-w52-package-prep/M4_ENVIRONMENT_CLASSIFICATION_PROPOSAL.md及M4_DIRECT_IMAGE_VERIFIED.json。

M2/M3/M6保留原WIN7-52开发实机PASS；M1 NOT_PERFORMED，M5 BLOCKED_BY_STANDING_AUTHORIZATION，正式R0～R8及门A/B NOT_PERFORMED。开发根按本轮工作重建并保留，最近根内进程/任务0、锁inactive，约583MB；上轮关闭成功仅为历史快照。未结束根外进程，未提交、推送、冻结或发布。下方记录按原时点理解。

## M2 开发实机闭环，开发根收尾完成；M4 后检仍 FAIL（2026-10-23 UTC）

Win7 DEV直接证据绑定WIN7-52/source908da8c…、ZIPf782f465…：M2六Stage/13断言、M3两Stage/11断言、M6十场景/5断言PASS；M6限组件跨读。M4业务3/3 PASS，但原进程后检含两个SogouExe.exe，准确映像UNKNOWN，故M4组FAIL保持。M1 NOT_PERFORMED，M5 BLOCKED_BY_STANDING_AUTHORIZATION；正式R0～R8及门A/B NOT_PERFORMED。

负责人批准只对准确绑定的SGTool5372收尾。执行前该PID已自然结束，ALREADY_ENDED，Terminate调用0次；动作结果大小/SHA已核验。00:30:32.681Z原close成功，00:30:39.604Z独立status确认C:\A9-DEV不存在、root_bytes=0、根内进程/任务空、锁null，收尾CLEANUP_COMPLETE。首次close失败及原M4 FAIL保留，常设授权和M4分类未扩展。

候选/输入保持，未冻结、推送或发布。证据见整合工作树A9-39 §11.8.104～105、outputs/a9-39-w52-package-prep/BOUND_CLEANUP_AND_CLOSURE_VERIFIED.json及REPORT.md。后续缺口为M4原失败时进程映像取证；下方记录均按原时点理解。

## M2 开发实机闭环；M4 后检与开发根收尾待处理（2026-10-22 UTC）

Win7 DEV直接证据：WIN7-52/source908da8c…、ZIPf782f465…保持。M2六Stage/13断言、M3两Stage/11断言、M6十场景/5断言通过；分别42、24、14件回收资料逐项大小/SHA一致。M6限组件交叉读取，旧夹具只继承字节，不继承结果。M2修复已在当前候选开发实机闭环，正式验收未签发。

同候选M4补跑三条业务断言PASS，但进程后检记录两个尚未获准排除的SogouExe.exe，故M4组FAIL，M1 NOT_PERFORMED；没有改分类或改判。M5仍BLOCKED_BY_STANDING_AUTHORIZATION，新候选正式R0～R8、门A/B均NOT_PERFORMED。原失败和默认产品目录历史影响UNKNOWN保留。

首次close未完成，独立后检根内进程/任务0、锁null，剩约8.5KB隔离输入法文件。新查询确认SGTool5372仍存活，四文件共享冲突；未读内容或结束根外进程。单实例收尾提案已备，等待负责人明确决定；常设授权不允许自行终止该根外映像。未冻结、推送或发布。准确记录见A9-39 §11.8.100～103及整合工作树outputs/a9-39-w52-package-prep/REPORT.md。下方按原时点理解。

## WIN7-52 M2、M3 开发实机通过，M6 继续（2026-10-22 UTC）

Win7 DEV直接证据：候选WIN7-52/source908da8c…、ZIPf782f465…保持。M2原六Stage/13断言和M3 Review主流程/重启两Stage/11断言全部PASS，父/GUI自然退出0。M2回收42件、M3回收24件，逐件大小/SHA一致。原失败与默认目录历史影响UNKNOWN保留，正式验收不改判。

目标地址按负责人更新为192.168.1.9，原SSH主机键严格核对。原A07先因候选外PATH漏wbem收尾ERROR，新run补路径并做实际正反能力检查后完整通过。整组执行保留原driver与判据，只以候选外根内直接进程启动包装替代不适用常设授权的taskkill /T超时分支；实际均未触发强制终止。环境SGTool按既有ADR登记，不当作0存活。

当前继续M6十场景/五断言，输入字节按锁精确继承，实机结果重新执行；M5仍BLOCKED_BY_STANDING_AUTHORIZATION。WIN7-52新总控R0～R8与正式门A/B均NOT_PERFORMED，未冻结、未推送或发布。准确记录见整合工作树A9-39 §11.8.100～101与outputs/a9-39-w52-package-prep/。下方记录按原时点理解。

## M2 Runner 本地修复完成，WIN7-52 待实机复验（2026-10-22 UTC）

开发机：修复已提交908da8c，751项受影响检查通过，独审0P0/0P1。WIN7-52双构建逐字节一致，ZIP SHA-256 f782f465d0e5bbc4c2f21be96d7d30a52f6bed3e4d5d2374e0b2179f53d72efc。唯一产品运行时变化是Runner传输层，原生组件字节未变；旧WIN7-51保留。未推送，候选未冻结。

Win7开发通道：新run dc26b6e1的首个只读预检在SSH banner交换超时。独立TCP读取能连接22端口，仍无SSH banner。新候选上传、启动及实机复验均NOT_PERFORMED；没有产品重试，也未重启服务或修改系统设置。当前目标/开发根状态UNKNOWN，close未完成。旧17:11Z存活0快照不是当前状态。

M2实机问题尚未关闭，历史FAIL/HALTED保留，正式门A/B、M5、Alpha2/RC未签发。下一步为目标SSH/网络恢复后新status→800件闭包/身份准入→原audit_output真实窗口Stage→受影响M2与合同项。源和不可变材料已备，见整合工作树outputs/a9-39-w52-package-prep/REPORT.md及A9-39 §11.8.99。下方记录按原时点理解。

## M2 Runner 修复完成，WIN7-52 本地验证中（2026-10-22 UTC）

Win7 DEV直接证据绑定WIN7-51/source74ac9ef7…、run c61b8a27：tool_output审计SQL失败后2ms出现未处理EPIPE，原驱动结果缺失，诊断INCOMPLETE。历史600秒FAIL/HALTED保留，M2正式验收NOT_PERFORMED。回收16件大小/SHA一致；当前执行窗口存活0、unknown_creation0。默认产品目录历史影响UNKNOWN保持。

开发机真实管道最小反例堆栈指向Runner取消stdin.end。负责人“批准按提案实施”，按ADR-0262扩展三条精确路径。修复覆盖首次请求、取消及release异步管道错误，保留首审计失败与未知清理，release不发反向取消或杀进程。传输48项与Runtime/SQLite交接6项通过；真实管道修复后有界返回原审计失败，独审0P0/0P1。开发机受影响检查751项通过，较宽联跑的旧dist加载失败已定位并以当前编译产物完成定向复验。新候选尚未构建。

实际基线为codex/a9-alpha2-integration-r2@74ac9ef7…加本轮未提交修改，旧WIN7-51字节保留。拟WIN7-52，提交与双构建须在必需检查通过后执行。最短后续为新候选真实audit_output Stage，再按影响扩展M2及合同项。M5、正式门A/B、冻结、推送和发布边界保持；新候选Win7运行NOT_PERFORMED。准确材料见整合工作树outputs/a9-39-w52-package-prep/与A9-39 §11.8.97。

> 本文件承接 2026-09-24 之前 `STATUS.md` 的全部时间线条目，按原文迁移，仅做两处整理：
> WIN7-33 授权条目移到其实机条目之前；原误置于“状态使用规则”下的 A8-06 三节归入独立标题。
> 当前状态与阻断项以 [STATUS.md](STATUS.md) 为准；本文件条目是时间点记录，不自动代表当前基线。

## 十项目录移入回收站（2026-10-22 UTC）

负责人对既有十项目录方案回复“放入回收站”。执行代理按清单逐目录移动，开发机结果 PASS。
9 个 W50 TEST_ONLY 仓库和 1 个 Jest 缓存已移入 `/Users/qlyf/.Trash/win7-w50-test-dirs-20261022-r1`，未清空回收站。
每项先核身份、完整内容与打开占用，再执行一次同盘 rename，随后核恢复副本内容、同 inode 和目录结构。
10 项均完成，逻辑字节 4183105509；63 个符号链接保留且未遍历；9 个测试仓库 HEAD 保持。
移动后核验确认 12 个正式 ZIP、65 个已有修改文件、两工作区 HEAD/状态与全部工作树登记保持。
此后仅为登记结果修改 STATUS、本流水和既有清理报告；不提交、不推送、不删除、不连接远端。
恢复映射与逐项证据在 `outputs/cleanup-fixture-zips-20261021-r1/closeout-20261022-trash-r1/`；报告见原清理台账 §9。
同盘移动不计磁盘释放收益；当前 Win7 验证 NOT_PERFORMED。

## 工作收束与空间候选复核（2026-10-22 UTC）

执行代理在主工作区 `codex/a9-alpha2@23ebfa53…` 整理当前入口。
本地读取整合分支 `74ac9ef7…` 的 A9-39 §11.8.86 和原始报告索引，未重新执行 Win7。
当前边界集中到 STATUS 顶部：WIN7-51 开发主链 PASS、M2 整组 FAIL、根因 UNKNOWN，M3/M6 未执行、M5 授权阻断。
完整 Alpha 2 与正式门不签发；不把整理任务扩成下一轮产品诊断或构建。

沿用原清理台账，复核 9 个 W50 临时测试仓库与 1 个 Jest 缓存，共 4170588 KiB。
10 项元数据盘点完整，9 个仓库 HEAD/身份及干净状态与旧清单一致；当前用户 lsof 可见范围无匹配占用。
建议取得明确路径与动作确认后逐目录移入回收站；本轮未移动或删除。
候选、首失败证据、当前依赖、已有修改和所有注册工作树保留；未提交、推送或连接远端。
详见既有 `outputs/cleanup-fixture-zips-20261021-r1/space-review-20261022-report.md` §8。

## Alpha 2 第二批实施计划与新窗口交接（2026-10-11）

负责人要求按已讨论四步制定实施计划，并新开窗口采用 gpt-6.1-sol / xhigh 实施。
本轮把准确基线、A9-32 本地范围、验证和后续门写入[既有推进顺序 §6](plans/A9_ALPHA2_DELIVERY_SEQUENCE.md#6-第二批实施计划与新窗口交接2026-10-11)，不另建台账。
核对 A9-31 起点 `571ec550b5e09611f55557563d0cf2f1a4a40d1b`、A9-32 合同、managed 锁和验证矩阵字节。
主工作区与功能分支已有修改保留；新窗口在隔离 A9-32 分支登记本轮本地授权后实施。
当前产品实现、第二批 Win7、完整 Alpha 2 裁决均未因此完成，ENGINEERING_02 §138 止损保持。

## A9 Trusted Agent Runtime（2026-08-31）

- 2026-09-14，负责人指令启动 [A9-16](tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md) UI 子集（任务书 §7：状态 `APPROVED_FOR_IMPLEMENTATION`，分支 `codex/a9-alpha2`，基线 `7d06789` + 在制 A9-17，决策 ADR-0117 / ADR-0124）：实现 U01–U07 左侧对话区三段式与单行密度、桌面四态状态类切换（双侧独立开关、aria 同步、DOM 保活）、信任注记折叠与"进行中/更早"分组；**Review（R01–R05）与 Shell 运行中输出（S01–S06）按指令暂缓**，Review 入口维持 disabled fail-closed。设计输入为 [ZCode 参照建议](plans/A9_16_UI_ZCODE_REFERENCE_SUGGESTIONS.md) 与已实测的 [静态演示](plans/a9-16-ui-demo/index.html)。本轮复核补齐两处缺口：**U02 行容量不达标**（左栏固定 chrome 474.8→379.9px，列表 147.2→238.0px，完整可见行 2→5，凭静态高度预算模型并已固化进契约测试；行高仍 36px，未靠缩小行高达标）与 **U06 跨断点回归**（原 resize 监听在任何窗口缩放时折叠左右栏，改为只做状态机收敛 + aria 重推；并修 ≤799px 残留 `.rail-closed` 导致的 0 宽网格列）。随后在开发机真实 Electron 22.3.27（Chromium 108）用真实渲染层 + 桩快照做**几何量测**，另暴露并修复第三处缺口：**U02 预算模型漏算归档折叠摘要**，最坏形态（2 组头 + 归档区）实测仅 190px / 3 条完整行，二次回收后为 196px / 4 条完整行，并把归档项补进预算模型。量测确认桌面四态与 1200/800 两个断点全程 `scrollWidth`/`scrollHeight` 无溢出、`aria-expanded` 与视觉一致、Ctrl+I 关闭后焦点交还头部开关；**125% 用 Chromium 缩放代理仅 1 条完整行，是 Win7 实机 1366×768 × 125% DPI 的首要复核项**（不等于真实 DPI）。门禁：shell 37 套件 357 项全绿（含 5 项 A9-16 契约用例，另经负向对照确认修复为真实护栏）、`tsc --noEmit` + 产品 JS `node --check`、`git diff --check` 干净；`check_docs.mjs` 仅剩既有 `outputs/**` 沙箱快照噪声。几何证据见 [layout-evidence.json](reports/2026-09/a9-16-ui-evidence/layout-evidence.json)；**像素级视觉签字与真实 125% DPI、Win7 实机回归仍 `NOT_PERFORMED`**；未签发 Alpha 2 PASS；未提交/推送。详见[实现报告](reports/2026-09/a9_16_ui_implementation_2026-09-14.md)。

- 2026-09-14，A9-16 UI 子集冻结新候选 **WIN7-29**（决策 ADR-0125，任务书 §8）。候选范围限于 §4
  U01–U07 的 renderer 改动；Review（R01–R05）与 Shell 运行中输出（S01–S06）**不在候选内**，Review 入口
  维持 disabled + fail-closed。发布管线新增 `A9-16-INPUTS-RESPONSIVE-UI-WIN7-29` profile
  （`scripts/release/build-a9-product-v3.mjs`）与一整套 W29 release 工件：输入锁、validation kit
  （**15 项用例**：继承 W28 的 `W29-01`～`W29-10`，新增 `W29-11`～`W29-15` 覆盖左栏三段式与行容量、
  桌面四态 DOM 保活、跨断点收敛回归、键盘/焦点契约，以及**真实 1366×768 × 125% DPI** 布局）、
  完整性/报告/smoke 脚本与 CMD 包装、[验收说明](../release/win7-product-v3/A9_16_WIN7_29_VALIDATION.md)。
  三件锁定输入按精确哈希复核在位：Electron 22.3.27 `ad723ed7…86e6`、D-013 v25 `7485cf22…99d6d0`
  （本轮从私有归档恢复并逐级校验）、SQLite/ABI 110 `2cb0cd32…2794`。**A9-17 经负责人裁决不并入本候选、
  也不单独建立产品候选**，其 Win7 采样沿用自身授权；版本与能力集保持 Alpha 1（`0.3.0-alpha.1`，
  ADR-0096），不得据该候选宣称 Alpha 2 PASS。同日完成**双独立干净工作树构建并逐字节一致**：源码提交
  `4bdf87b40449a1a7c5488425d45604767ce8e24a`，`source_dirty=false`、
  `external_acceptance_eligible=true`，ZIP `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip`
  （101,350,978 B）SHA-256 `a69d92c434631d13019c3cfb760db907555ecc84b853f56bdd6d3dab2e0d820e`，
  manifest SHA-256 `46f11c0ddb2d2d4b2566a035914d41ae4751a7ecd2f404c4b65831e6643d5d01`。
  随后在候选外预检发现该构建**不可验收**：包内 `validation/a9-package-integrity-w29.cjs` 有 5 处字面量
  未从 W28 重基线（`gates.win7`、`provenance.task`、`provenance.previous_candidate`、
  `provenance.previous_candidate_result`、`provenance.change_scope`，以及 `approved.kind` /
  `approved.status`），以符合文档契约的候选外 authority 实测被拒 `A9_W29_INPUT_LOCK_CONTRACT_INVALID`
  ——**候选自带的校验器拒绝候选自身携带的 input lock**，Win7 实机验收无法通过第一条命令；该文件被
  `release-manifest.json` 哈希绑定并随 ZIP 发布，包外补丁不可行。**故 WIN7-29 判定为构建缺陷并保留为
  失败构建**，其哈希不得被任何 authority 引用，不得删除、改写或复用改判。

- 2026-09-14，按既有修复先例换发 **WIN7-30**（决策 ADR-0126，任务书 §9）作为 A9-16 UI 子集的修正候选：
  候选范围、15 项用例集、版本与能力集（Alpha 1）与 WIN7-29 一致，修正范围严格限于上述字面量，使其与
  `a9-16-win7-30-input-lock.json` 逐项一致。同时补两处**残留守卫**：
  `scripts/release/test/a9-package.test.mjs` 新增"派生脚本的 gates/provenance/authority/kit 字面量必须与
  input lock 逐项一致"的回归断言；`scripts/release/build-a9-product-v3.mjs` 新增构建期
  `assertNoStaleCandidateTokens()`，按 lock 与 kit 逐项比对（覆盖 `WIN7_28_`、`APPROVED_FOR_WIN7_28_`
  等下划线形式，即本轮绕过连字符守卫的形式），命中即 `A9_CANDIDATE_STALE_TOKEN` 失败。守卫经负向对照
  验证：临时解除豁免后精确命中 WIN7-29 的全部 7 处残留，恢复后无误报；发布回归 **23/23 全绿**。
  同日完成**双独立干净工作树构建并逐字节一致**（`cmp` 通过）：源码提交
  `640571ea11a402b4b827cf31175d849ec729d970`，`source_dirty=false`、`external_acceptance_eligible=true`，
  ZIP `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip`（101,352,637 B）SHA-256
  `1ec123e4f73dbb6607007e34460350164a06a6dd9035f4c031ff4782fc74af90`，manifest SHA-256
  `4c41af7501c51433ff240a14d6ebd28246716fa3884a8c12fac08a2f4d75daae`。候选外预检 12 项全 PASS
  （`verifyFullTree()` 788 文件、64 项闭包、无禁止载荷、kit 身份一致），含
  **`verifyAcceptanceCandidate()` 接受符合文档契约的 authority 与候选自带 input lock**——即 WIN7-29
  失败的那一项（该 authority 为测试夹具，不构成批准）。该结论仅为开发机包完整性
  （`A9_16_DEVELOPER_PACKAGE_INTEGRITY_PASS`），`product_assembly` / `win10` / `win7` / `alpha` 当时全部
  `NOT_PERFORMED`。随后签发候选外 authority 并在 `10.211.42.40` 以普通用户 Medium/non-elevated
  执行 run `add716dd-c45e-4a18-ab5f-0ba1fc19d6c3`：G1 通过，G2 自动 smoke 失败。四个 Electron 阶段
  均退出 0、fixture 325 次请求，但 driver 发布 W28 投影键而 W30 smoke 按 W30 键读取，且折叠左栏下
  Ctrl+K 搜索过滤成功但 `focused=false`；真实 Provider 因硬门失败为 `NOT_PERFORMED`，原 ZIP 复核
  哈希不变，结束后无 Electron 残留。**WIN7-30 固定为 `G2_FAILED`，不得重签或复用哈希改判。**

- 2026-09-14，负责人批准修复并换发 **WIN7-31**（ADR-0127，任务书 §10）。修复严格限于两项：
  （1）构建时把共享 driver 的 `W28-03` / `W28-09` / `W28-10` 与 evidence package kind 精确派生为
  W31；（2）Ctrl+K 在聚焦并全选搜索框前先展开导航。构建残留守卫改在 driver 与 kit 生成后执行，
  并拒绝 03/09/10 投影对象键出现非 W31 前缀；正向与注入旧键的负向回归均为候选前置。15 项用例、
  Alpha 1 版本和能力集保持不变。同日以源码提交 `ac4ed5048a6a2d4ed2f223c61ed06108a4a07d4b`
  完成双独立干净工作树构建，ZIP 逐字节一致、`source_dirty=false`、
  `external_acceptance_eligible=true`：`Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip`
  （101,353,790 B）SHA-256 `79aec61da2046727ae89d94ccb4c9341ca5fb07aff17a72291479d1372ffa16a`，
  manifest SHA-256 `a215217b6279a85b4c8213f561bafda07a6c529f630a6e4060c63b084cb9dbe6`；788 文件
  完整树复验通过，包内 driver 只含 W31 的 03/09/10 投影键。候选已归档到
  `.acceptance/candidates/WIN7-31/`，两个临时 Git worktree 已解除注册并移除，独立 out-a/out-b 构建结果
  保留。测试夹具 authority 仅证明校验链路可接受正确绑定，**不构成正式批准**；尚未签发
  `WIN7_31_RELEASE_AUTHORITY`，Win7 验收为 `WIN7_31_NOT_PERFORMED`。未推送、未打标签。

- 2026-09-15，WIN7-31 已取得候选外 authority 并在新确认地址 `10.134.115.40` 的同一物理 Win7 主机
  `DCCS-CHAIZL-PC` 开始普通用户 Medium/non-elevated 实机验收。run
  `cdc35c14-abee-4f8e-bd4a-5759559ba0c8` 中 G1 PASS、G2 自动 smoke 75/75 PASS；真实 Provider
  multi-tool 与 wait/cancel 直接观察通过。G3 在真实 1366×768、120 DPI（125%）的最坏形态（1 running、
  8 older、1 archived，且 Stop 可见）只完整显示 1 条 36px 对话行，低于 W31-11-A03 / W31-15-A02
  的 4 行硬门，故 **WIN7-31 固定为 `G3_FAILED`**，不签发 A9-16 UI 集成 PASS。候选正常关闭后
  Electron/helper 均为零，postflight 完整性 PASS，证据秘密扫描零命中。负责人随后批准修复；当前源码
  在 `max-height: 650px` 下压缩固定 chrome，但保持 Review disabled 入口、可信提示、设置/诊断与 Stop
  可达，36px 行高不变。新增 540 CSS px 最坏形态契约守卫，定向测试 31/31 PASS；开发机 Electron 22
  同引擎量测为列表 197px、完整 4 行、页面零溢出，shell lint/build 与 diff check 通过。该结果仅为
  `SOURCE_REPAIR_VERIFIED`；随后已按下条获得 WIN7-32 冻结与双构建授权，authority 与 Win7 重验仍须
  按候选精确哈希收口。

- 2026-09-15，负责人指示“下面开始实际验收”，据此授权换发 **WIN7-32**（ADR-0128、任务书 §12）。
  候选只承接 WIN7-31 G3 已证实的真实 125% DPI 左栏容量修复，36px 对话行、15 项用例、Alpha 1
  版本与能力集不变；Review 与 Shell 运行中输出仍不开放。允许本地提交和双独立干净工作树一致构建，
  但未知 ZIP 哈希不视为已批准；哈希形成后仍须候选外 `WIN7_32_RELEASE_AUTHORITY` 与独立 SHA-256 pin，
  方可在 `10.134.115.40` 开始普通用户复验。现已由源码提交
  `916fe8240e73d6efa956eacf485652075639dbcb` 完成双独立干净工作树构建，ZIP 逐字节一致、
  `source_dirty=false`、`external_acceptance_eligible=true`：ZIP 101,356,737 B，SHA-256
  `639063b70a1f7fb5dd422870708cb8cb457c405df8752668a5e43f8220a92ea2`；manifest SHA-256
  `03647a0e0966e27787aa28ea17f577307955e0e28d7de3d31bd7fc62f8b442f6`。788 文件完整树、15 项 kit
  闭包与测试专用 authority 全链预检通过；测试 authority 不构成批准。候选已归档到
  `.acceptance/candidates/WIN7-32/`，双构建输出保存在 `.acceptance/builds/WIN7-32/916fe824-reissue/`，
  两个临时 Git worktree 已解除注册；临时父目录删除被 Auto Review 拒绝，未绕过。当前停在正式
  `WIN7_32_RELEASE_AUTHORITY` 门前，仍为 `WIN7_32_NOT_PERFORMED`；未推送、未打标签。

- 2026-09-15，负责人按精确 ZIP SHA-256 `639063b70a1f7fb5dd422870708cb8cb457c405df8752668a5e43f8220a92ea2`
  批准 WIN7-32 候选外 authority；正式 authority SHA-256
  `4f06c80cb3c33aa9916273b26f753b5906ea8ce11e910125e5e758f6b9aa2dbe`。在 `10.134.115.40` 的物理
  Win7 主机 `DCCS-CHAIZL-PC` 以普通用户 `dccs-chaizl-pc\agent`、Medium/non-elevated 令牌执行 run
  `6e5c315d-cf59-4a5c-bb9f-1f58a2df366c`：G1 包完整性 PASS；G2 自动 smoke 75/75 PASS；显示事实为
  1366×768、120 DPI（125%）。G3 正式窗口首次启动持续白屏，四个 Electron 进程（含 renderer）均存活
  且 responding、Windows Application 日志无同期崩溃；普通 WM_CLOSE 后 Electron 清零，但同一普通用户
  正常重启仍持续白屏。仅在打开 DevTools 触发窗口失效重绘后，已经加载的 workbench DOM 才立即可见，
  关闭 DevTools 后界面继续显示；该诊断性重绘不能满足正常启动合同。因此 WIN7-32 固定为
  **`G3_FAILED / FIX_BEFORE_REISSUE`**，不签发 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`；真实 Provider、
  Stop、桌面四态、键盘与最坏形态容量复验按硬门保持 `NOT_PERFORMED`。应用随后正常关闭，postflight
  包完整性 PASS、Electron 残留 0、候选外高置信秘密扫描 0 命中；候选自带报告器接受完整 15 项集合的
  正式失败报告并返回 `status=FAIL`。候选、authority、run 与全部候选外证据保持不可变；未推送、未打标签。

- 2026-09-15，负责人指示“修复并走验证”，授权换发 **WIN7-33**（ADR-0129、任务书 §13）。补充物理
  Win7 判别实验确认：WIN7-32 最小化/恢复及一像素 resize 后仍无 renderer 内容；同一冻结候选仅以
  `--disable-gpu` 启动则无需 DevTools 即正常首绘。因此源码修复严格限定为 Windows 主进程在
  `app.ready` 前调用 `app.disableHardwareAcceleration()`，非 Windows 不变；WIN7-32 renderer 容量修复、
  15 项用例与 Alpha 1 能力集全部继承。修复源码已提交为
  `d6c6a3e5d908ff3ffe72d14d1c64bb7ba968e718`；定向启动/工作台测试、package 全集、Shell lint/build、
  仓库快速集成门和开发机包预检均 PASS。两个独立干净工作树生成逐字节一致的 101,358,703 B ZIP，
  SHA-256 `ab885f43c5285ebe81351ca5841f33399cb58b750b16cb8367fd2c760b08984c`，manifest SHA-256
  `6d9986f43135171517be34c61d85b17e9f79eae04f70be3c7c5bd6443930bd9e`；均记录
  `source_dirty=false`、`external_acceptance_eligible=true`。候选已冻结到 `.acceptance/candidates/WIN7-33/`，
  双构建输出位于 `.acceptance/builds/WIN7-33/d6c6a3e-reissue/`，临时工作树已移除。当前硬停在该精确
  ZIP 哈希的候选外 `WIN7_33_RELEASE_AUTHORITY` 与独立 pin，WIN7-33 仍为 `NOT_PERFORMED`；未推送、
  未打标签。

- 2026-09-15，WIN7-33 在 `10.134.115.40` 的物理 Win7 以普通用户 `dccs-chaizl-pc\agent`、
  Medium/non-elevated 令牌（Session 11，真实 1366×768 / 120 DPI，非 Chromium 缩放代理）执行 run
  `15f2c247-d5e1-4c82-8d9f-c34759cf9a4f`：G0 宿主预检与 G1 包完整性 PASS，**G2 自动产品 smoke 硬失败**
  ——四个驱动阶段（first / second / retry / stop）全部抛
  `Error: app.disableHardwareAcceleration() can only be called before app is ready`，抛点在
  `resources/app/product/main.js:21`，触发点是候选自家驱动在 `app.whenReady().then(main)` 之内才
  `require` 产品入口。两个本机回环 fixture 请求计数为 0、批准目标未删除、未产出任何投影附件；G3 与
  15 项用例按 fail-closed 记 `NOT_PERFORMED`，正式失败报告与候选自带 verifier 均 `status=FAIL`
  （`verified_cases=15`、`direct_current_candidate_cases=0`）。该缺陷仅 Windows 触发，因此开发机双构建
  逐字节一致与候选外 verifier 预检都无法发现。postflight 完整性复检 PASS、Electron/helper 残留 0、
  候选外高置信秘密扫描 0 命中、13 个一次性计划任务已删除。据此 WIN7-33 固定为
  `G2_FAILED / FIX_BEFORE_REISSUE`，候选、报告、run 与全部候选外证据保持不可变。

- 2026-09-15，负责人指示“对问题进行修复”“现在就推进换发”，授权换发 **WIN7-34**（ADR-0130、任务书 §14）。
  最小修复为把渲染策略调用改为按就绪状态守卫
  （`if (process.platform === 'win32' && !app.isReady()) app.disableHardwareAcceleration();`）：打包入口
  在 ready 前加载主进程，行为与 WIN7-33 完全等价；此后加载本模块的验收 harness 不再能把一次非法迟到
  调用变成产品启动失败。新增两条主进程启动顺序回归用例与一条候选包断言（ready 之后加载不得做出非法
  迟到渲染调用；ready 前加载必须照旧生效）。WIN7-34 的 integrity / report / smoke / driver / 两个 RUN
  包装与 input lock 由冻结的 WIN7-33 工件按仓库既有约定重基线候选令牌生成，构建期
  `A9_CANDIDATE_STALE_TOKEN` 守卫已实际拦下一次遗漏的 `change_scope` 未重基线。两个独立干净工作树已在提交 `2f6d3fd2ee8817922cf771300e3f348e541dfaf6` 上构建，ZIP 逐字节一致：
  101,361,365 B，SHA-256 `d0b8528fccef905dce2d420d1b231251fac017d29f1505dbc10a6f20d9a93ead`；manifest
  SHA-256 `3801430d0716ebfa3dafb65e3f123bf6d5bbdd19fc030f0e4c0dbf63a441761a`；validation kit SHA-256
  `628ef158c3bf7b9797ecffab98d732144379aae7f33b3faae67f4fcc12b80644`，两份结果均
  `source_dirty=false`、`external_acceptance_eligible=true`。候选已冻结到
  `.acceptance/candidates/WIN7-34/`，双构建输出位于 `.acceptance/builds/WIN7-34/2f6d3fd-reissue/`。
  当前硬停在该精确 ZIP 哈希的候选外 `WIN7_34_RELEASE_AUTHORITY` 与独立 pin，WIN7-34 普通用户实机仍
  `NOT_PERFORMED`；未推送、未打标签。

- 2026-09-16，WIN7-34 在 `10.134.115.40` 的物理 Win7 以普通用户完成 run
  `1910b132-1043-46f9-9b32-70b0a9ed4892`。原报告因 W34-13-A03 要求的 `<=799px` 抽屉态被产品
  `minWidth: 860` 阻断而为 `EVIDENCE_PENDING`；负责人选择「规格收窄」后，候选外 floor harness
  在可达最窄 847 CSS px 上证明折叠 rail 时对话列非零且无横向溢出。修订报告保留原报告与
  证据不变，候选自带 verifier 返回 `status=PASS`、`verified_cases=15`、
  `direct_current_candidate_cases=15`，裁决为 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`。`<=799px`
  分支继续登记为 `PRODUCT_UNREACHABLE / NOT_VERIFIED`；不据此签发 Alpha 2 或 RC PASS（ADR-0131）。

- 2026-09-22，负责人批准 **WIN7-35** Driver 生命周期与退出码修复规划（ADR-0132、任务书
  §16）。实施后经主代理独立复核，补齐了候选内真实 `electron.exe` 迟到加载/受控 ERROR
  两个反例、非零退出与 ERROR 报告双绑定、WMI 零路径相关进程残留、四阶段完整合同，
  并将 W35-13 按 ADR-0131 收窄为可达最窄 847 CSS px；`<=799px` 仍为
  `PRODUCT_UNREACHABLE / NOT_VERIFIED`。定向 Shell 47/47、package 33/33、Shell lint/build、
  `verify:quick` 与 `git diff --check` 通过；`docs:check` 仍因既有 A9-17 `/tmp` 链接及历史
  `outputs/**/input-snapshot` 缺件失败，本次未改写该历史证据。产品 `main.js`、renderer、
  Runner/Policy、IPC、SQLite、权限、网络和依赖均未改动。WIN7-35 候选、authority 和
  物理 Win7 G1→G2→G3 证据仍 `NOT_PERFORMED`，不签发 Alpha 2 或 RC PASS。

- 2026-09-23，后续 WIN7-35 实机运行 `9ffae420-fd2c-4c5f-93ef-c56584fe1ca4` 已更新上述历史时间点状态：
  精确 ZIP SHA-256 为 `0d1474fddbd05c28e2109f2b7d70eb78d7e4ac786cadf2418175c7504b73749c`，
  `10.110.237.40` 上 G1、消除旧实例干扰后的 G2、正式入口首启/重启首绘均通过；真实
  1366×768 / 125% DPI 的 1079×540 CSS px 视口下，最坏形态列表仅 178px / 3 条完整 36px 行，
  W35-11/W35-15 的 G3 UI 硬门 **FAIL**。1080×584 最小窗口钳大样本不构成通过证据；
  W35-12/W35-13 DOM 身份为待隔离风险，真实 Provider 等下游 `NOT_PERFORMED`。
  WIN7-35 保持冻结 FAIL，候选外运行证据见 `.acceptance/runs/WIN7-35/9ffae420-fd2c-4c5f-93ef-c56584fe1ca4/`。
  现有未提交修复在开发机 1079×540 探针中得到 207px / 4 行，但不构成 Win7 PASS；
  [WIN7-36 换发合同](plans/A9_16_WIN7_36_REISSUE_PROPOSAL.md) 后由负责人明确批准编号、C14
  路径及 `10.110.237.40` 目标（ADR-0133、任务书 §17）；当时尚未提交、换发或签候选外 authority。
- 2026-09-23，WIN7-36 修复在本地干净提交 `f0e80ecfabaaf8414d2778e4481f7e8d68e54f40` 冻结。
  工作台契约 32/32、package 测试 35/35、Shell lint/build、实际渲染几何门与反例、`verify:quick`
  均 PASS；`docs:check` 在干净工作树仅剩 9 处既有 A9-17 临时路径断链，未命中 W36 文件。
  两个独立干净工作树构建的 ZIP 逐字节一致，SHA-256
  `8f730c5ae9ab86d83ecbfe3033a00e32a935dd5217d3ab30e4c75710adbe2a3a`；manifest SHA-256
  `1a9fa1584cd4f99295df6c44ad5ced47cc44c5dfd2d810c09841fe0557de00e2`；正式 input lock SHA-256
  `d99c0dcf16d44cbceed41e6e6b4a6622877c856aaa40cfc6fc664d689cde676a`。manifest 为
  `source_dirty=false`、`external_acceptance_eligible=true`；冻结件在 `.acceptance/candidates/WIN7-36/`，
  双构建在 `.acceptance/builds/WIN7-36/f0e80ec-reissue/`，开发机仓库 ZIP verifier 预检 PASS。
  尚未签发候选外 `WIN7_36_RELEASE_AUTHORITY` 与独立 pin，Win7 G1/G2/G3 均 `NOT_PERFORMED`，
  不签发 Alpha 2、Review、Shell streaming 或 RC PASS。
- 2026-09-23，负责人随后按 WIN7-36 精确哈希单独批准候选外 `WIN7_36_RELEASE_AUTHORITY`、独立 pin
  及在 `10.110.237.40` 执行 G1→G2→G3；本地签发 authority SHA-256
  `9c9b61a27287782a7ed8bea677d7dd85d8fe39de8c491b13e3f600ef0d001991`，候选自带 verifier 的
  开发机纯字节与绑定接口通过。目标 TCP 22 可连接，但三次严格 SSH 连接均在服务器 banner 交换前超时，
  未到主机密钥核验或认证，也未发生远程写入。此 run 的 G1/G2/G3 仍 `NOT_PERFORMED`，当前为
  `BLOCKED_SSH_SERVER_HANDSHAKE / INSUFFICIENT_EVIDENCE`，不是候选产品 FAIL。候选外详情见
  `.acceptance/runs/WIN7-36/485927dc-d043-47e3-b12c-85df380b6e85/RUN_STATUS.md`。
- 2026-09-23，负责人将 WIN7-36 目标 IP 更正为 `10.233.193.40`；新地址完成 SSH 握手，
  ECDSA 主机密钥与原 Win7 已固定主机键一致，但现有公钥登录被拒。新候选外 authority/pin
  按更正地址独立保存在 run `9d9b5cab-96ec-47e2-b7b3-8102a9ab6909`，SHA-256
  `7d335d76184dc6676680d5b1117a5babbb200b09fbdf6f32985ab37c5cea1708`，开发机纯字节与
  绑定预检 PASS；原地址 run 与 authority 不改写。当前为 `BLOCKED_SSH_AUTHENTICATION`，
  无远程写入或执行，Win7 G1/G2/G3 继续 `NOT_PERFORMED`。见
  `.acceptance/runs/WIN7-36/9d9b5cab-96ec-47e2-b7b3-8102a9ab6909/RUN_STATUS.md`。

- 2026-09-24，上述 SSH 登录阻塞在用户重新登录后解除；同一 WIN7-36 冻结 ZIP 和新 IP authority
  于 `10.233.193.40` 的 Win7 SP1 x64 非提权普通用户会话完成 G1→G2→G3 和 15 项 UI 子集验证。
  物理 1366×768 / 125% DPI 的实际内容视口为 1079×540 CSS px，最坏形态完整可见 4 行。
  负责人明确按**可达响应式状态等效**裁决 W36-06/12/13/15：目标视口使用两列加 Inspector
  抽屉、导航栏开关 × 抽屉开关四态；不宣称在该视口看到了三列或四个桌面 class 组合。
  请求 700px 被钳至 847px，≤799px 分支及真正跨越 800px 仍为
  `PRODUCT_UNREACHABLE / NOT_VERIFIED`。冻结候选自带报告器在普通用户会话中核验
  `report-stage-v5.json`（SHA-256 `f7463691076491312c80fc83032417eb520bfede22c8be1c0edb4967a9e559e1`）
  为 `status=PASS`、`verified_cases=15`、`direct_current_candidate_cases=15`，签发
  `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`；计数表示同候选证据绑定，不表示不可达几何已直接实测。
  报告器输出 SHA-256 `05d9d00818e0b094ec18803721aa8bf228e0e929277f775a54867827447c0c4f`。
  详见[WIN7-36 实机验收收口](reports/2026-09/a9_16_win7_36_ui_subset_acceptance_2026-09-24.md)。
  候选 ZIP、kit、旧报告不变；完整 Alpha 2、Review、Shell streaming、RC 未获此结论。

- 2026-09-12，负责人授权 [A9-17](tasks/A9_17_STARTUP_MEMORY_OPTIMIZATION.md) 启动测量修正与三个启动热点优化，分支 `codex/a9-alpha2`，基线 `7d06789`。本地实现完成，状态/Shell 定向测试及开发机 Electron 86 项回归通过。当前保留 `A9_17_IMPLEMENTATION_AUTHORIZED`；未提交/部署，不改历史候选。补充开发机优化前后 A/B（`git archive HEAD` 导出优化前侧，端点对比 + 0/100/1,000/5,000 轮规模扫描 + 稳态确认，Electron `getAppMetrics` 口径、需 `--no-sandbox`）：窗口创建约 −4.7～−5.3 s；稳态空闲 1,000 轮 −138.2 MiB、5,000 轮 −584.4 MiB，空历史无变化；优化后仍随历史增长 46.5 MiB（Main +33.9），首屏就绪仅超大历史下可判改善。非产品配置，PowerShell/WMI 行为与 Win7 性能收益仍 `NOT_PERFORMED`。

- 2026-09-11，A9-15 WIN7-28 在 Windows 7 SP1 build 7601 x64 普通用户 Medium/non-elevated 桌面令牌下
  完成 10/10 当前候选直接用例；自动产品 smoke 75/75 assertions、真实 Provider `tool_calling` 多工具轮次、
  前置/后置完整性、零残留进程、本机返回证据 verifier 与目标机 verifier 全部 PASS。冻结源码为
  `d71807fa0d0f011d9c35104e7cd6dab62058ffa5`，ZIP SHA-256 为 `f1b6730…08351`，正式报告 SHA-256 为
  `cc9b422…b267`。据此签发 `A9_15_WIN7_UI_INTEGRATION_PASS`，A9-15 更新为 COMPLETE；该裁决只关闭
  WIN7-28 UI 集成合同，不重签 `A9_14_WIN7_22_GO_FOR_ALPHA`，也不构成新的 Alpha 或 RC PASS。脱敏证据见
  [收口报告](reports/2026-09/a9_win7_28_ui_integration_closeout_2026-09-11.md) 与
  [结构化状态](status/a9-15-win7-28-ui-integration-20260911.json)；原始证据、截图、SQLite 和候选二进制保存在候选外。

- 2026-09-10，WIN7-28 验收工具在真实 Electron 开发机 smoke 下复核（`55d9d5f` 工作树，未提交）：
  首次真实运行 **FAIL 79/84**，暴露上一轮标记为"✅"的分页/会话残留/重试区域四个缺陷——
  retry 去重断言用了 `Set#length` 而恒假；分页"补载前已填充"把产品自身的「历史记录未包含过程。」
  提示当成已填充（假阳性），"补载后可观察"又要求 503 失败轮次存在工具活动组（假阴性）；
  会话残留正向样本是空会话而 `sessionResidueViolation` 明确拒绝空行集。修复后同一命令
  **PASS 84/84**，package 回归 **20/20**。另建立候选外 H07 harness：外置 driver 目录**不含**
  投影契约、缺省 legacy、配上逐条未改动的 W25 历史提示路由，真实运行 PASS（投影提示命中 0 条），
  证明共享 driver 的候选打包改动未破坏历史 profile；W23/W24/W25 原生 smoke 脚本因
  `win32` + Electron-as-node + ABI 110 平台门禁记 `NOT_PERFORMED_PLATFORM_GATED`；
  cleanup 未确认因无安全接缝保留 `NOT_PERFORMED`。交回材料见
  `validation/win7-28/W28_H09_HANDOVER.md`。WIN7-28 候选双干净构建、候选外 authority 与
  普通用户非提升 Win7 验收仍 `NOT_PERFORMED`，不得据此判定 F1～F4 全部完成。

- 2026-09-10，WIN7-27（`32c5f6b`）只读复核确认四项修复有实质改进，但仍存在四项 P2 级验收逻辑缺口：
  DOM 附件的实际结果与最新 turn 身份被解析后丢弃、逐行文本仍是非空/关键词检查、审批恢复顺序断言不要求
  出现恢复后的 `tool_start`、旧事件补载未真实执行即可通过。ADR-0121 / A9-15 §15 已授权按
  `docs/plans/WIN7_27_ACCEPTANCE_GAPS_REPAIR_PLAN.md` 修复 F1～F4 并在新候选 WIN7-28 上重建合同；
  WIN7-25/26/27 候选、证据与复核材料全部冻结。当前阶段为
  `A9_15_WIN7_28_ACCEPTANCE_GAP_REPAIR_AUTHORIZED`，WIN7-28 普通用户实机仍 `NOT_PERFORMED`。

- 2026-09-10，WIN7-26 只读复核确认产品投影修复与两个干净工作树的构建一致性成立（788 文件一致、ZIP 逐字节
  一致、W25 冻结工件未变），但发现四项 P2：投影附件只核对存在与哈希而不解析内容、Electron Inspector
  断言可接受缺行/乱序/重复、新增投影用例时移除了原审批与失败顺序签发断言、共享 driver 新协议破坏
  W24/W25 profile 兼容性。ADR-0120 / A9-15 §14 已授权以 `2e5a534` 为基线修复四项并在新候选 WIN7-27
  上重建合同；WIN7-25/26 候选、证据与复核材料全部冻结。当前阶段为
  `A9_15_WIN7_27_PROJECTION_EVIDENCE_REPAIR_AUTHORIZED`，WIN7-27 普通用户实机仍 `NOT_PERFORMED`。

- 2026-09-10，WIN7-25 只读复核确认 Renderer 两处修复有效，但发现回归未执行原连续渲染触发顺序，且
  kit/report 未把 Inspector 持久事件恢复与旧失败不得覆盖新成功设为签发条件。ADR-0119 / A9-15 §13
  已授权直接修复：真实 Renderer 回归必须能拒绝故障注入，Electron 重启链绑定旧失败/新成功 turn/event ID、
  查询事件与 DOM，WIN7-26 报告器拒绝新增断言或结构化投影证据缺失/失败。WIN7-25 候选和证据全部冻结；
  当前阶段为 `A9_15_WIN7_26_VALIDATION_GAP_REPAIR_AUTHORIZED`，WIN7-26 普通用户实机仍 `NOT_PERFORMED`。

- 2026-09-09，WIN7-24 普通用户真实 Provider 多工具任务完成并正常退出后，重启虽恢复中央对话且未重放，
  Inspector 活动却为空，全局结果错误停留在较早的 `failed · not_applicable`。只读 SQLite 元数据核对确认
  133 条事件完整存在，最新 task/turn/checkpoint/terminal event 均为 `completed · verified`，故裁定为
  Renderer 投影缺陷而非数据丢失。WIN7-24 永久保持 `FIX_BEFORE_WIN7_25_VALIDATION`，不得修改或重判。
  负责人已授权 ADR-0118：修复 Inspector 持久事件投影和全局最新轮次结果，补回归、本地提交不推送，
  建立全新 WIN7-25 并完成双干净构建、独立 authority 与受影响普通用户 Win7 复验。当前阶段为
  `A9_15_WIN7_25_REPAIR_AUTHORIZED`，尚未形成 WIN7-25 候选或新 PASS。

- 2026-09-09，负责人将真实 Shell 运行中增量输出、完整 Review、扩大左侧对话区、桌面宽屏左右栏独立
  开关及主区四态自适应纳入 `0.3.0-alpha.2`。ADR-0117 / [A9-16](tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md)
  已形成需求基线，状态为 `PLANNED_NOT_AUTHORIZED`：不构成实现、候选或验收授权。Review 审批卡只属于
  Review staging/Apply；Full Access 普通写入无 Review 卡，但既有高影响操作目标绑定确认仍保留并须在
  UI 中明确区分。当前 WIN7-24 与 Alpha 1 验收事实不因此修改或升级。

- 2026-09-09，ADR-0114 / [A9-15 UI 优化与 Agent 过程反馈](tasks/A9_15_UI_PROGRESS_FEEDBACK.md) 在
  `codex/ui-optimization` 分支（基线 `72dfe22`）完成开发机实现与定向验证：按获批 Demo 暖色浅色主题重构
  工作台视觉，新增 `model_note`/`approval_resolved` 事件与 `a9.events.query`（IPC schemaVersion 6）
  过程回看；core 18/18、state 55/55、shell 87/87 合同测试与三包 lint、docs:check 全部通过（证据见
  任务书 §6）。独立检查后修复状态误判、审批记录顺序、历史分页与失败重试；不修改 native helper、Runner/Policy 安全
  语义；本轮 macOS Electron smoke 最终 57/57 PASS，另取图并查看四个场景，完整 UI
  交互矩阵仍待验证。目标机已按项目专用验收身份与锁定主机指纹严格 SSH，
  只读预检确认 Windows 7 Professional build 7601 x64；管理员 SSH 不构成普通用户 PASS。
  用户随后授权提交 A9-15 范围改动（不推送）、新增独立 WIN7-23 `release/**` 合同并继续实机验收；当前阶段进入
  `A9_15_WIN7_23_CANDIDATE_PREPARATION`。候选、候选外 release authority、普通用户执行和真实 Provider
  多工具任务尚未完成，仍不新增 Win7 PASS。

- 2026-09-09，WIN7-23 在双干净构建、候选/包完整性及普通用户非提升令牌门通过后，自动产品 smoke
  发现验证启动器实际加载候选 `resources/app` 而非 driver，三个 phase 报告未生成；该候选与失败证据已
  冻结，保持 `FIX_BEFORE_WIN7_24_VALIDATION`，不得修改或重判。负责人随后授权 ADR-0116：修复为候选外
  独立 Electron 验证副本，补齐 stop 工作区前置与反假阳性断言，并按目标机截图优化 Win7 本地字体栈、
  整数基础字号和辅助文字对比度；提交后建立全新 WIN7-24，不推送。当前仍处
  `A9_15_WIN7_24_CANDIDATE_PREPARATION`；WIN7-24 哈希、独立 authority、普通用户实机与真实 Provider
  结果尚未形成，均不得写成 PASS。

- 2026-09-07 补录 2026-09-04 的 WIN7-22 正式收口：源 `1c04644`，ZIP `5cc07f35…c4e8`，
  正式验证 13/13（4 直接、9 继承），G7 独审 P0/P1/P2=0，裁决 `A9_14_WIN7_22_GO_FOR_ALPHA`。
  下方记录为历史执行过程，不覆盖此冻结候选最终裁决；Win10 同候选 smoke 仍为 RC 前置。
  证据与构建基线边界见 [收口核对报告](reports/2026-09/a9_win7_22_closeout_and_build_baseline_2026-09-07.md)。

- 2026-09-03，WIN7-22 G0 的 r14 虽在 Win10 双构建中得到字节一致 helper，正式记录器仍因请求证据中的
  中文空格目录被 Windows PowerShell 5.1 按 CP936 误读为 `涓枃 绌烘牸` 而拒绝，未生成输入锁；r14
  已撤销且不改判。编码兼容修复提交为 `1eb02c254ffd8a4081c984da21f176671c6ce026`，改用 Unicode 码位构造
  路径；r15 ZIP、input lock、package manifest SHA-256 分别为 `2b4192cc…61a1c`、`494e8939…dd4b`、
  `2692fff9…03b`。独立审查在撤销 r14 的条件下批准 r15 进入新的 Win10 双构建。r15 随后在两个全新
  目录完成构建，run ID 为 `8cb9089e…bf6`、`7bf6be7c…593`，返回 ZIP 为 `7485cf22…d6d0`、
  `5d37a5f…e237`，字节一致 helper 为 `c8615e65…fa31`；正式记录器已生成 WIN7-22 新 input lock
  `a9750078…f7e1`。G0 helper 输入冻结完成，产品双构建与 Win7 实机 PASS 仍未执行。

- 2026-09-03，WIN7-21 在 Win7 普通用户 D-013 CMD 当前候选用例失败：native helper 对已绑定的
  `/d /s /c` command payload 再次套用 CRT argv 引号，导致内部双引号被反斜杠转义，目标文件未创建；
  同一 payload 经管理通道直启成功。独立复核结论 `P0=0 / P1=1 / P2=1`，G6 硬停止、G7 未执行，
  WIN7-21 永久保持 `FIX_BEFORE_ALPHA`。负责人已授权 ADR-0111/A9-14 在独立干净分支作最小 verbatim
  修复、独审、重新冻结和双构建，以全新 WIN7-22 重跑受 helper/候选影响的门禁；稳定宿主项仅轻量复核，
  未受影响历史能力只允许精确哈希继承。当前尚未形成新源码冻结、Win10、Win7 或 Alpha PASS。

- 2026-09-03，WIN7-20 在 Win7 普通用户正式 Electron 启动时因既有 WIN7-19 schema v4 的
  `a9_sessions.last_activated_at` 物理声明可为空而被后置严格校验器拒绝；四项直接用例均未执行，候选
  永久保持 `FIX_BEFORE_ALPHA`。负责人已授权 ADR-0110/A9-13 在独立分支从该候选源码 `9323cbe` 作
  精确兼容性修复、独立审查、重新冻结和产品双构建，并以全新 WIN7-21 从 G0 重走全部门禁。冻结前
  独立审查已以 `P0=0 / P1=0 / P2=0` 批准进入 G0；尚未形成 Win10、Win7 或 Alpha PASS。

- 2026-09-03，r11 在两个全新目录经无 Host Job 的 WMI 进程顺序构建，run ID 为
  `054a5213-58e8-4433-ae86-ce012ee0b721`、`157caea1-56b6-4ef8-97b4-062f1657931c`；两次 logic、
  capture、v1/v2 smoke、PE/API/CRT 均 `PASS`，helper.exe 均为 331776 字节且 SHA-256 同为
  `43bd9dfd…04ce`。两个返回 ZIP SHA-256 为 `5a5c433a…6864`、`42c4511f…e681`，正式记录器复核通过并
  创建 `a9-09-input-lock.json`（SHA-256 `54012613…dfc3`）。Win10 构建门槛完成；产品装配与 WIN7-20
  仍为 `NOT_PERFORMED`，两项负责人延期的 Provider P2 仍不标记关闭。
- 2026-09-03，r10 两个全新 WMI 构建再次全部 `PASS`，非 `helper.obj` 对象已一致，但 helper 对象及最终
  EXE 仍不同。COFF 符号比较定位到 MSVC lambda 内部名称仍受传入编译器的绝对源码参数影响；Win10 直接
  探针确认从各自 kit 根运行且使用相同相对 source/include/object 参数后，两个 `helper.obj` 均为
  `bf466ce7…2f14`。修复提交为 `bbbffdf73622c02aa4d36e2bc9efeb9218c86c8a`，r10 已撤销。新 r11 ZIP、
  input lock、package manifest SHA-256 分别为 `7aeceef0…378b`、`a29d6ebe…76e9`、
  `ed706a02…65eb`，等待两个全新目录复验。
- 2026-09-03，r9 两个无 Host Job 的全新 WMI 构建均为 `PASS`，但 helper SHA-256 分别为
  `7778c8f2…d6bd` 与 `b9141b85…88de`，不满足字节一致门槛。逐层比较定位到 MSVC `.obj` 中的不同绝对
  构建路径；Win10 探针确认 `/Brepro /experimental:deterministic`、把各自 kit 根映射到固定
  `C:\a9-v25-kit` 且保持相同相对对象路径后可得到相同对象。修复提交为
  `0e134d54cb4d26fb761355272b151aa785643056`，r9 已撤销。新 r10 ZIP、input lock、package manifest
  SHA-256 分别为 `9a267b4a…6583`、`3e9d4984…ec65`、`7abaa864…c28a`；当时等待两个全新目录复验。
- 2026-09-03，r8 的禁止 overlay smoke 按既有协议返回 `error: JSON_PARSE_FAILED`，但新脚本/记录器误读
  `code` 字段并由 StrictMode 拒绝。消费者与夹具修复提交为 `bc26e5835b479be7fff1a23150d07f7868baacfe`，
  r8 已撤销。新 r9 ZIP、input lock、package manifest SHA-256 分别为 `e2ceab17…4708`、
  `6ca67019…8a48`、`37da1fe1…e203`，等待全新双构建。
- 2026-09-02，r7 通过精确 ACL 回滚后暴露 CMD `if defined ... & echo` 条件链吞掉最终 marker；Win10
  直接对照已复现并确认 `if ... else if ... else echo` 语法。修复提交为
  `e3e778bdf62e22777e58e9eb7370de38c3ab3926`，PowerShell 5.1 前置自测现真实验证 marker；r7 已撤销。
  新 r8 ZIP、input lock、package manifest SHA-256 分别为 `64772425…5e35`、`0e2e2f73…22f8`、
  `005abf83…39e7`，等待全新双构建。
- 2026-09-02，r6 在无 Host Job 路径完成原生构建后发现 DACL 回滚会新增 `SE_DACL_AUTO_INHERITED`；
  Win10 API 探针证明用捕获的原始安全描述符调用 `SetFileSecurityW` 可精确恢复。修复提交为
  `9fa02c3b6503e71aae8f0c889d5dbc61e30a8776`，r6 已撤销；新 r7 ZIP、input lock、package manifest
  SHA-256 分别为 `f5bf50a5…dafb`、`71c7a797…7081`、`320ea758…8f98`，等待全新双构建。
- 2026-09-02，r5 在锁定 Win10/MSVC 环境暴露 Win32 `max` 宏与 `std::max(...)` 冲突；最小修复已提交为
  `7f43dec19612bafba1bb94e5ecb261cd87508f80`。r5 已撤销，FAIL 诊断保留；新 r6 ZIP、input lock、package
  manifest SHA-256 分别为 `4d7985d4…922c`、`104b4aca…c8c5`、`da90075f…b5c8`，当前仅 r6 获准进入
  新的 Win10 双构建目录。该修复尚不等于 Win10 或 Win7 PASS。
- 2026-09-02，A9-09～A9-12 修复提交为 `c718152f0c413d2c21407eec042dc50197b6e51f`；新 r5 Win10
  离线构建套件曾获准用于首次构建，后因上项 MSVC 失败撤销；旧 r4 撤销项也保持不变。
- 2026-09-02，项目负责人确认 Bitvise trace logging 已关闭，并决定将独立复核发现的两个 Provider P2
  延期：代理端口 `0` 静默清除及显式清空 API Key 后旧持久化凭据可能在重启时恢复。本轮获准提交并
  推送现有 A9-09～A9-12 修复、继续 v25 Win10 双构建和 WIN7-20 候选验证；两项 P2 不标记为关闭，
  最终报告必须保留风险，相关开发机证据不构成 Windows DPAPI 或完整发布 PASS。
- ADR-0109 / [A9-12 D-013 v25 后置恢复与用户流加固](tasks/A9_12_POST_REVIEW_RECOVERY_AND_UI_HARDENING.md)
  已关闭 Viewer 编码状态、正式 Explorer smoke、Undo IPC、IME、Provider 高级配置、审批恢复 Stop、退出
  残留提示、Shell 探测缓存、崩溃锁恢复和初始化诊断十项缺口。定向 State 37/37、Shell 97/97、七模块
  1563 tests、发布 17 PASS/1 Windows skip、原生逻辑和真实开发机 Electron 22 四进程 smoke 均通过；
  当前状态 `A9_12_DEVELOPER_VERIFIED_PENDING_WIN7`。Win10/Win7 未执行，不解除 `FIX_BEFORE_ALPHA`。
- ADR-0108 / [A9-11 D-013 v25 后置安全与可用性修复](tasks/A9_11_POST_V25_USABILITY_SECURITY_HARDENING.md)
  已关闭独审复现的 Git 回调/投影秘密、活动模式迁移、拆分流秘密、SSE 中文、Shell DTO/活动刷新、显式
  编码 edit 和 Viewer legacy UTF-8 八项源码缺口。七模块 1554 tests、发布 15 PASS/1 Windows skip、
  原生逻辑 PASS；后续 A9-12 合并工作树已关闭 Runtime 初始化阻塞并通过真实开发机 Electron smoke，
  状态更新为 `A9_11_DEVELOPER_VERIFIED_PENDING_WIN7`。Win10/Win7 未执行，不解除 `FIX_BEFORE_ALPHA`。
- ADR-0107 / [A9-10 中文编码与大文件读取](tasks/A9_10_TEXT_READ_HARDENING.md) 已获负责人独立授权并完成
  本地源码修复：显式 GBK/UTF-16LE、binary 元数据、64 KiB 异步分块、128 KiB 有界预览和完整基线哈希。
  Workspace/Core/真实产品组合共 535 tests PASS，状态 `A9_10_DEVELOPER_VERIFIED_PENDING_WIN7`；
  未提交、未打正式包、Win7 未执行，不解除 A9-09 或 `FIX_BEFORE_ALPHA` 门禁。
- ADR-0101 / [`A9-09 D-013 TrustedShell Current-User Profile`](tasks/A9_09_D013_TRUSTED_SHELL_PROFILE.md)
  的初始 A9-09A 开发机 Gate 随后被 v25 独立复审撤销；旧 r4 SHA-256 `037213c…e09` 不包含当前未提交
  整改，已禁止正式使用。上一轮本地整改完成 1498 项全量测试；ADR-0103 的工作树自批准问题已获复审
  关闭，但完整闭包只证明内部自洽，随后复审发现发布信任 P1=1。已按 ADR-0104 补充候选外批准记录与
  独立哈希 pin、正式 lock/批准根/双构建绑定和原生 PE 检查，本地发布回归 18/18、全量 1498 tests PASS；
  随后五参数文档 P2 也获独审关闭。但最新复审新增两项 P1：普通变量名可携带已知秘密，以及 NODE_DEBUG
  等控制项漏拦。ADR-0105 环境整改已获最新独审关闭；该轮新增生成器精确数组匹配及 OrderedDictionary.Clone
  两项构建脚本 P1，现按 ADR-0106 修复并补真实生成器入口回归。修复已提交并生成、批准 r5；当前 Gate 为
  `A9_09B_READY_FOR_WIN10_DOUBLE_BUILD`，尚未完成 D-017 Win10 双干净构建、正式 v25 input lock、
  WIN7-20 候选和 Win7 实机复验，因此综合状态继续为
  `FIX_BEFORE_ALPHA`，PR #3 仍不得合并。
- ADR-0100 已根据合并前独立代码审查开启
  [`A9-08 后置审查修复`](tasks/A9_08_POST_REVIEW_HARDENING.md)，状态
  `APPROVED_FOR_IMPLEMENTATION / FIX_BEFORE_ALPHA`。已动态确认的审批绕过和秘密持久化，以及独审确认的
  Provider、遗留 IPC、进程、checkpoint 和迁移 P1 必须修复；PR #3 暂不合并。修复完成后构建 WIN7-20，
  按 ADR-0097 执行扩大后的增量复验并重新裁决。
- A9-08A 已关闭当前已知的 Shell 转义/动态调用审批绕过和正常 A9 Renderer 的遗留 A8 Review mutation
  IPC 旁路；A9-08B 已关闭事件/审批持久化秘密泄漏、跨 Provider origin 旧 Key 复用、TLS 校验关闭和缺失
  CA 静默忽略；A9-08C 已将正式前台/后台 Shell 接入 D-013 helper，收紧整树回收真实性、双 Stop 和
  窗口销毁前退出裁决。第四批进一步完成 checkpoint v4 目录树哈希/无碰撞快照/undo 单次持久化、跨工作区
  对话操作拒绝、v2→v4（含最终 schema/index 创建）整体原子迁移与真实 A8 物理库只读白名单导入；
  轮初文件/目录快照不可覆盖、restore swap/旧 checkpoint fail-closed、物理 v4 schema 完整校验、Provider
  generation 隔离、递归秘密脱敏、崩溃后两阶段 checkpoint 对账和清理不确定事实跨重启闭环。最终开发机
  7 模块共 1482 tests、docs/diff
  检查通过。独立审查同时确认锁定的 D-013 v24 Low Integrity/低风险白名单协议不能承载 A9 Full Access，
  且缺少 envOverlay、真实无 deadline 与 managed ready acknowledgement；该修复需要新 ADR/任务授权
  `native/helper/**`。安全、进程、checkpoint/状态三路最终独立复核均为 P0/P1/P2=0，授权范围内闭环 PASS；
  A9-08 阶段记录以 `A9_08E_BLOCKED_D013_CONTRACT` 结束并移交 ADR-0101/A9-09；当前执行状态为
  `A9_09A_BUILD_REVIEW_FIXES_PENDING_INDEPENDENT_REVIEW / FIX_BEFORE_ALPHA`，尚未构建 WIN7-20。
- 产品负责人已确认
  [`Windows 7 Trusted Coding Agent 产品需求合同 V1`](prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md)
  和 ADR-0089/ADR-0096；实现任务为 [`A9_TRUSTED_AGENT_RUNTIME`](tasks/A9_TRUSTED_AGENT_RUNTIME.md)，状态
  `COMPLETE / A9_ALPHA1_PASS`，交付分支 `codex/a9-trusted-agent-runtime`，版本 `0.3.0-alpha.1`。
- 最终候选 WIN7-19 绑定源码提交 `781b20e3da277570f85c28286d7ea5bbbdd5fa28`；ZIP SHA-256
  `824a10cd…72b0`，manifest SHA-256 `b483e9b0…2c26`，780 文件、state schema v4、干净源码双构建
  字节一致。Win7 SP1 x64 上的候选身份、5/5 完整性、正式 Electron 生命周期、审批缺陷复验和后飞行
  均通过，ADR-0099 按当时范围裁决为 `GO_FOR_ALPHA`。后置独审的新证据不改写这些现场事实，但使当前
  综合交付状态转为 `FIX_BEFORE_ALPHA`。机器记录与收口报告见
  [`a9-alpha1-win7-19-acceptance-20260828.json`](status/a9-alpha1-win7-19-acceptance-20260828.json) 和
  [`a9_alpha1_win7_19_closeout_2026-08-28.md`](reports/2026-08/a9_alpha1_win7_19_closeout_2026-08-28.md)。
- WIN7-19 直接重验四个新 Turn 的独立审批身份、拒绝/旧卡/重复点击/变更目标零额外执行；批准卡只消费
  一次。其余七组未受本次 Git 命令分类修复影响的能力按 ADR-0097 继承 WIN7-17/18 证据。旧报告校验器
  不支持 `INHERITED_EVIDENCE`，因此候选报告保持 `EVIDENCE_PENDING`，不把继承项伪写为当前候选现场 PASS。
- WIN7-10 在 Gate 4 证明 Full Access 与 Read Only 通过，但 Review 因正式 Runtime 未配置 staging 后端而
  fail-closed；该失败按旧三模式合同永久保留，不追溯改判。ADR-0096 将 Alpha 1 收敛为 Full Access 与
  Read Only，并把完整 Review 移入 `0.3.0-alpha.2`。该范围调整不改变 WIN7-10 产品字节，因此不要求新候选
  或重跑已完成的同候选项目；验收从现场实际检查点 J4 继续。仍可选择但只会 fail-closed 的 Review 作为
  Alpha 1 已知限制记录，不计入 Alpha 1 PASS。机器可读范围记录见
  [`a9-alpha1-review-deferral-20260825.json`](status/a9-alpha1-review-deferral-20260825.json)。
- A9 从最新干净 A8 代码基线启动，复用对话/会话/Goal、Agent Runtime、上下文压缩、SQLite、DPAPI、
  Electron Renderer 隔离与确定性打包；A8 Review 代码只作为历史输入保留，不构成 Alpha 1 产品能力。
  A8 候选和证据保持历史原样，不继承为 A9 产品 PASS。
- A9 取代 A8 默认不可用的关键产品策略：可信工作区推荐 Full Access，允许通用 PowerShell/CMD Shell、
  直接多文件写入、工作区外显式路径、真实 Git 配置和用户网络；外部写、破坏性 Git、永久删除和系统级
  操作继续目标绑定确认。该模式不是 Win7 强沙箱。
- A9-00 文档与差距 Gate 已取得 `A9_00_DESIGN_AND_GAP_PASS`。A9-01～A9-06 对应实现、fixture
  行为测试和开发机 Electron 22 产品入口 smoke 保持 PASS；Review 的 Alpha 1 处置是范围延期和已知限制，
  不把缺失 staging 的失败改写为功能 PASS。F2/F4/F5/F6 修复检查点见
  [`a9-trusted-agent-runtime-latest.json`](status/a9-trusted-agent-runtime-latest.json)。这表示代码与开发机证据
  可供独立复核，不等于六个正式串行 Gate 已全部签发。
- A9-04 已使用 `https://api.deepseek.com` / `deepseek-v4-flash` 完成真实 SSE、tool calling、五次工具执行、
  真实修复/测试与取消，Gate 为 `A9_04_REAL_PROVIDER_PASS`。首次运行发现工具 Schema 缺少顶层
  `type: object`，统一 wire 修复后 Gateway 241 项与真实闭环均通过；凭据未写入证据。记录见
  [`a9-04-real-provider-deepseek-20260823.json`](status/a9-04-real-provider-deepseek-20260823.json)。
- A9-05 已完成：真实模型 J1 实际读取指令/配置/源码并引用路径，J2 完成真实修复和测试，J3 完成范围
  受控的跨文件功能和真实项目脚本；行为化 J4/J5 使用真实 Git/审批和 SQLite/子进程副作用。记录见
  [`a9-05-real-model-journeys-deepseek-20260823.json`](status/a9-05-real-model-journeys-deepseek-20260823.json)。
- A9-06 经 1307 项回归（含 A9-07 新增 5 项包运行时/DPAPI 宿主注入合同）和真实 Electron 22 三进程
  38/38 验证，Gate 为
  `A9_06_DESKTOP_STATE_AND_LIFECYCLE_PASS`。A9-01～A9-06 汇总见
  [`a9-01-to-a9-06-developer-gates-20260823.json`](status/a9-01-to-a9-06-developer-gates-20260823.json)。
  A9-07 历史上，Win7 `WIN7-02` 对候选 `5bee0069…d5b3` 的 Gate 3 首次 Full Tree 校验在
  `resources/default_app.asar` 失败，旧失败证据保持不变。根因是 Electron ASAR hook 改变了校验器的
  `fs` 读取语义；提交 `dce391c` 改为 `original-fs` 物理字节并清除 `NODE_OPTIONS`，新增回归后仓库
  1310 项与包测试 4/4 通过。新候选双构建一致，ZIP SHA-256 为 `37c3e51c…60080`、manifest SHA-256
  为 `63801337…1b626`，`source_dirty=false`。它已在 Win7 独立 `WIN7-03` 证据目录通过 ZIP、manifest、
  Full Tree、native/ABI 和无系统 Node 五项 Gate 3。该历史候选随后被 WIN7-10～19 迭代取代；记录见
  [`a9-07-win7-gate3-integrity-repair-20260824.json`](status/a9-07-win7-gate3-integrity-repair-20260824.json)。
  权威差距与交付计划见
  [`A9 Trusted Agent 差距与交付计划`](reports/2026-08/a9_trusted_agent_gap_and_delivery_plan_2026-08-22.html)。
- Office 专用能力不进入 A9 Alpha 1；首要交付是代码阅读、编辑、文件管理、Shell、测试、Git、Diff、
  撤销和重启恢复的五条真实 Coding Agent 旅程。

## A8 Agent-first 产品体验（2026-08-20）

- 负责人已确认 [`Agent-first 产品需求合同 v1`](prds/WIN7_AGENT_FIRST_PRODUCT_REQUIREMENTS_V1.md)，
  并授权 [`A8_AGENT_FIRST_PRODUCT_EXPERIENCE`](tasks/A8_AGENT_FIRST_PRODUCT_EXPERIENCE.md) 在独立
  `codex/a8-agent-first-product` 分支实现。目标是把固定场景验收控制台重构为对话优先的 Coding Agent：
  自然语言启动、直接/计划模式、连续 Assistant 消息、工具卡片、上下文引用、多文件 Review、真实测试、
  会话/Goal 恢复以及隔离的 Terminal/受限 Browser 工作区。
- ASAR 修复新候选已重新签发为 `A8_DEVELOPER_COMPLETE_VALIDATION_READY`，但不是
  `COMPLETE / A8_RC_PASS`。新候选尚未在 Win10/Win7 执行；旧候选的 Win10 A8-03
  `FAIL_A8_03_VALIDATION_HARNESS_ASAR_FALSE_NEGATIVE` 与后续 `NOT_RUN` 保留为历史现场事实。A7
  `0.1.0-rc.1` 保持只读冻结，其 `RC_PASS` 不自动传递给 A8。
- A8-00 已完成并取得文档 Gate `A8_00_DESIGN_PASS`。冻结合同为
  [`A8-00 产品架构与数据合同`](prds/A8_00_PRODUCT_ARCHITECTURE_AND_DATA_CONTRACT.md)，关键裁决为
  ADR-0075，追踪报告为
  [`a8_00_design_gate_2026-08-20.html`](reports/2026-08/a8_00_design_gate_2026-08-20.html)。信息架构、
  原始事件/展示投影、会话恢复、多文件准备区、A7 迁移白名单和 A8-01～A8-05 测试口径已冻结，
  没有应用代码或产品测试被计入本 Gate。
- A8-01 已完成并取得 `A8_01_CONVERSATION_PASS`：对话主界面、Enter/Shift+Enter、直接/计划模式、
  计划前置审批、工具卡片和原始 `gateway.delta` 审计后的确定性聚合已实现；`A8E-01`～`A8E-06`、
  Composer、计划零副作用与原始审计测试通过，仓库级 `npm run verify` 通过。证据见
  [`a8_01_conversation_gate_2026-08-20.html`](reports/2026-08/a8_01_conversation_gate_2026-08-20.html)。
  A8-02 也已取得 `A8_02_WORKSPACE_SESSION_CONTEXT_PASS`：同工作区多会话、Session/Thread/Turn/Task/Run
  隔离、产品级单活动任务锁、Goal 原子修订与恢复投影、文件/目录/文本上下文引用，以及只读代码查看器
  已实现；`A8S-01`～`A8S-04`、Shell 148 项、State 235 项和仓库级 1010 项回归通过。本地 Chromium
  1280×720 三栏布局无页面溢出。证据见
  [`a8_02_workspace_session_context_gate_2026-08-20.html`](reports/2026-08/a8_02_workspace_session_context_gate_2026-08-20.html)。
- A8-03 已取得开发机实现 Gate `A8_03_REVIEW_APPLY_PASS`：ReviewSetV1、私有 staging、逐文件决定、漂移零写入、批量回滚、验证绑定、Host/IPC/Renderer Review seam 已实现；开发机回归与未完成门禁见
  [`a8_03_review_staging_progress_2026-08-20.html`](reports/2026-08/a8_03_review_staging_progress_2026-08-20.html)。当前没有真实项目测试 Profile，Electron 22、Win10、Win7 和 RC 仍为 `NOT_PERFORMED`，不因此宣称 A8 整体 PASS。
- A8-03 最新开发检查点已冻结 `a8-system-prompt-v1`（ADR-0079，SHA-256
  `f1bdcace084d27d71383b4ddfe81cef61029796a36859995c6e9614f1cbc9160`），解除 A3 遗留纯只读提示词与
  私有 Review staging 的语义冲突；受控 Gateway Provider Review 和已知凭据在 prompt、Workspace 工具
  结果、Provider chunk/响应/工具参数中的持久化前阻断均已通过。仓库级 7 模块 1051 项、Shell 169 项和
  文档检查通过，机器可读记录见
  [`a8-03-developer-checkpoint-20260821.json`](status/a8-03-developer-checkpoint-20260821.json)。真实 Electron
  三文件 Review 自动化代码已就绪，但本地 GUI 审批服务因用量限制拒绝启动，本项保持
  `NOT_PERFORMED_LOCAL_GUI_APPROVAL_UNAVAILABLE`；随后 GUI 审批服务恢复，真实生产 Electron 8-case 已
  PASS（证据等级 `DEVELOPER_SURROGATE_ELECTRON`）。开发机实现 Gate
  `A8_03_REVIEW_APPLY_PASS` 已签发，仅解除 A8-04；可复用执行器、外层工件哈希核验、故障回收合同测试和
  Win10/Win7 移交包已就绪，不以 Chromium Harness 或入口 smoke 替代。
- 现有 `NO_GO_INTERACTIVE_WINPTY` 继续有效。A8 Terminal 必须形成新的运行时 Profile 与 Win7 证据，
  否则只能保持清晰的 disabled/fail-closed 状态；不得以缺少现代强隔离为由放开任意 Shell、模型输入、
  未登记浏览或系统配置修改。
- A8-04 已取得开发机实现 Gate `A8_04_RUNNER_TERMINAL_BROWSER_SETTINGS_DIAGNOSTICS_PASS`：生产 Renderer
  的 Terminal/Browser disabled、Runner 未登记状态、RunnerLog 64 KiB/控制序列与危险链接清理、Settings
  fake key 脱敏、Diagnostics System Prompt/hash、CSP/Preload 和 `terminal.input` fail-closed 均已通过。
  真实 Electron 8-case 与 1280×720 Diagnostics 截图证据见
  [`a8_04_terminal_browser_settings_gate_2026-08-21.html`](reports/2026-08/a8_04_terminal_browser_settings_gate_2026-08-21.html)、
  [`a8-04-boundary-electron-qa-20260821.json`](status/a8-04-boundary-electron-qa-20260821.json)；运行使用
  Electron 41.7.1 macOS arm64，属于 `DEVELOPER_SURROGATE_ELECTRON`，只解除 A8-05。Electron 22、Win10、
  Win7 与最终 RC 仍为 `NOT_PERFORMED`。
- A8-04 Gate 收口时重新执行 `npm run verify`，7 模块共 1058 项（Gateway 202、Workspace 97、State 236、
  Core 229、Runner 67、Git Adapter 51、Shell 176）全部通过；`npm run docs:check` 为 83 files / 19 task files
  PASS。该回归仍是开发机证据，不等于 Win10/Win7 或 RC PASS。
- A8-05 已取得开发机实现 Gate `A8_05_PERSISTENCE_RECOVERY_MIGRATION_PASS`：D-014 `SqliteDatabase` seam
  的版本化结构化实体、Session/Goal/Turn/Task/Run 与事实重开、Review 文件哈希投影、Validation 摘要、
  活动执行中断、`AWAITING_REVIEW` 保留、Review 基线漂移 `STALE`、损坏/缺口/引用 fail-closed 以及 A7
  白名单迁移均已实现。Host 启动只恢复事实/UI，不自动调用模型、Runner、Terminal、Browser 或 Apply；
  机器可读证据见 [`a8-05-developer-checkpoint-20260821.json`](status/a8-05-developer-checkpoint-20260821.json)，
  D-014/Electron 22/Win10/Win7 锁定执行包见 [`a8-05-persistence-validation-kit-20260821.json`](status/a8-05-persistence-validation-kit-20260821.json)。
  开发机 `npm run verify` 为 7 模块 1072 项（Gateway 202、Workspace 98、State 245、Core 229、Runner 67、
  Git Adapter 51、Shell 180），`docs:check` 为 85 files / 19 task files；外部层仍为
  `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE`，该 Gate 只解除 A8-06 实现准备。
- A8-06 已取得开发机 Gate `A8_06_PACKAGE_AND_VALIDATION_READY`，状态为
  `A8_DEVELOPER_COMPLETE_VALIDATION_READY`：输入锁定的 Electron 22.3.27、D-013 v24、D-014
  8.7.0/SQLite 3.43.1 经过真实哈希核对后完成独立 `0.2.0-alpha.1` 候选装配；缺失/错误输入和
  `.env`/私钥/缓存/winpty/node-pty payload 负向测试 fail-closed，重复构建 ZIP/manifest/SBOM/
  许可证与 sidecar 字节一致，native helper/SQLite 位于 `resources/native`，A8-03/A8-04/A8-05
  验证入口和安装/并存/升级/回滚/卸载模板已随包交付。候选 manifest 只将
  `developer_package_integrity` 写为 `PASS`，product/Win10/Win7/RC 保持 `NOT_PERFORMED`；实际
  包和 manifest 哈希、命令与剩余外部门禁见 [`a8-06-developer-checkpoint-20260821.json`](status/a8-06-developer-checkpoint-20260821.json)
  与 [`a8-06-package-validation-kit-20260821.json`](status/a8-06-package-validation-kit-20260821.json)。
- 最新 UI 交互审计修正了旧复核的证据高估：旧 Chrome Harness 没有会话关闭/取消 seam，1024 px
  检查器和 760 px 以下导航不可达；跨会话关闭会丢失活动任务句柄，提交句柄返回前切换会话会跳过自动
  取消，Host 重开后新建会话也会因未恢复工作区失败。源码提交 `7121853` 已修复并推送；标题栏关闭入口、
  活动/归档分组、窄宽导航/检查器、焦点约束与语义控件均已补齐。仓库验证实际为 1083 项 PASS，新候选
  ZIP `e76b465b…5f9ab`、manifest `c3f51f98…7eda8` 双构建一致且 schema v2 10/10 PASS。Chrome 扩展未安装，
  Chrome Harness 为 `NOT_PERFORMED_LOCAL_CHROME_EXTENSION_UNAVAILABLE`；Win10/Win7/RC 不变。证据见
  [`a8-06-ui-interaction-audit-checkpoint-20260821.json`](status/a8-06-ui-interaction-audit-checkpoint-20260821.json)。
- 用户提供的 Win10 长对话截图确认了新的生产 Renderer 布局缺陷：Grid/Flex 自动最小高度会让消息内容撑高
  中间列，把底部 Composer 推到窗口外，同时使页面上的滚动无法到达真实底部。源码提交 `e6b3b34` 修复
  高度与滚动链；后续 `9fe439c` 把 `A8UX-01-CONVERSATION-SCROLL` 纳入发布验证包必验清单。Shell 194 项、
  仓库 1086 项、打包合同 4/4、证据合同 5/5 与 schema v2 10/10 均通过。新候选 ZIP
  `123fe4a8…f3375`、manifest `4a84d941…a4af6` 两次构建一致；Win10/Win7/RC 对此新候选仍为
  `NOT_PERFORMED`。证据见
  [`a8-06-conversation-scroll-layout-fix-checkpoint-20260821.json`](status/a8-06-conversation-scroll-layout-fix-checkpoint-20260821.json)。
- Win10 用户反馈“＋ 文本”点击无反应后确认：文本附件和 Goal 编辑仍调用 Electron Renderer 中不可靠的
  `window.prompt()`。源码提交 `a7682b0` 已用具备标签、焦点约束、取消路径、内联错误、UTF-8 字节计数及
  64 KiB/2,000 字符边界的应用内对话框替换全部原生 prompt；禁用附件按钮也会明确显示原因。新增真实
  Electron 用例 `A8UX-02-TEXT-ATTACHMENT-DIALOG` 并纳入验证包必验清单。Shell 197 项、仓库 1089 项、
  打包合同 4/4、证据合同 5/5、schema v2 10/10 均通过。新候选 ZIP `363fbfb0…bb053`、manifest
  `92fd342f…a214c` 两次构建一致；Win10/Win7/RC 保持 `NOT_PERFORMED`。证据见
  [`a8-06-text-context-dialog-fix-checkpoint-20260821.json`](status/a8-06-text-context-dialog-fix-checkpoint-20260821.json)。

## 验证状态

- 当前 main 开发机回归：`PASS` — 2026-08-12 在 `ec9d27a` 运行 `npm run verify`，7 个模块
  969 项全部通过（Gateway 202、Workspace 80、State 219、Core 225、Runner 65、
  Git Adapter 51、Shell 127），同时通过 TypeScript 检查、构建与静态设计门。该结果证明
  A4/A5/A6 收口后的 main 可回归，不替代 A7 RC 或新的 Win7 实机验收。
- 当前 A1～A3 收口工作区已建立最终指纹；最新证据编号为 `A1-A3-CLOSEOUT-20260804-01`（见
  `status/mvp-baselines/`），SHA-256 为
  `597eab41ee7fdedd1227ab92b9c318ce55d1965fad7e316620821e88115faf21`。历史 Win7 MVP 产品
  收口仍绑定 MVP-20260802-14；没有提交、暂存、切换或丢弃用户修改。
- 开发机回归：`PASS` — 2026-08-04 A1～A3 收口重跑 `npm run verify`，7 个模块共
  942 项测试通过（Gateway 202、Workspace 80、State 219、Core 225、Runner 46、
  Git Adapter 51、Shell 119）；各模块 lint/build 与静态设计门同时通过。
  `MVP-20260802-14` 的 889 项历史日志仍保存在
  [`validation/mvp_verify_MVP-20260802-14.txt`](../validation/mvp_verify_MVP-20260802-14.txt)，不改写为当前计数。
  Gateway 13 项 loopback 测试本次在仅允许本地临时端口的受控环境再次通过；
  历史结构化证据见 [报告](../validation/report_gateway_loopback_MVP-20260802-15.json)
  和[完整日志](../validation/gateway_loopback_MVP-20260802-15.txt)。
- Win7 SP1 x64：`OWNER_ACCEPTED_FOR_MVP` — C01 系统/补丁、Electron 22.3.27、CPython 3.8.10、受控 MinGit、机器 PATH 缺失工具检测、工件哈希和 Bitvise 状态在 MVP-20260802-14 只读采集中全部通过；真实 Electron 产品入口随后在隔离目录启动，沙箱 Renderer 加载、只读诊断回传并以退出码 0 正常退出，无对应 Electron 残留。客观 SPIKE/Phase 的正式状态没有被改写；延期边界由 ADR-0055 和负责人 disposition 单独记录。详情见 [Win7 MVP 实机报告](reports/2026-08/win7_mvp_acceptance_report.html)。
- SPIKE_03 的旧部署 `dist` 风险已由 fail-closed 修复并在受控 MinGit 派生包上重测；旧报告仍保留为历史证据，新报告绑定当前 adapter/harness SHA-256。
- 全部替代条件、命令与原始证据见 [status/latest-validation.json](status/latest-validation.json)；本页不把 MVP 替代项写成正式 Phase 或发布通过。
- MVP-20260802-12 已补充证据型 [SBOM](acceptance/MVP-20260802-12_SBOM.json) 与输入哈希清单（[manifest.sha256](acceptance/MVP-20260802-12_manifest.sha256.txt)）；两者明确标记为非正式产品发布闭包。
- MVP-20260802-14 新增 [负责人 disposition](acceptance/MVP-20260802-14_OWNER_DISPOSITION.json)、[产品/证据哈希清单](acceptance/MVP-20260802-14_product_manifest.sha256.txt)、[运行时盘点](../validation/win7_runtime_evidence_MVP-20260802-14.json)和[真实产品入口 smoke](../validation/report_product_shell_MVP-20260802-14.json)。
- Desktop Alpha 2 的 Win7 增量门禁已完成 A2-W03（用户拒绝且工作区不变）和
  A2-W04（显式批准后写入，目标 SHA-256 与 UTF-8/CRLF 预期一致，无临时/备份残留）。
  2026-08-04 又完成打包 Electron 自动证据 A2-W07～W10、W14、W15；原始报告为
  [`A2-W07-W15-20260804_auto-report.json`](acceptance/A2-W07-W15-20260804_auto-report.json)，
  报告 SHA-256 为 `a0c11b3f9db933ed591df278571e8fe813980e55228825a42ccbc9b4635473c8`，
  独立 SSH 复核确认 Win7 `certutil` 哈希一致、Bitvise PID 1780 仍运行且无本轮探针残留。
  同日 A1 product-entry smoke 2/2 与 A1 W08 security/readonly 14/14 也已在真实打包 Electron
  上通过；首次 A2-W01 GUI 检查暴露嵌套 `src` 目录下 Replay 未继续遍历的问题，已修复并以
  88 个 Shell 测试及重新部署的 Electron 包复核；用户随后确认 W01 工作区/会话/只读任务完成，
  人工记录见 [`A2-W01-20260804_gui-confirmation.json`](acceptance/A2-W01-20260804_gui-confirmation.json)。
  W02 检查又发现原 UI 未单独显示目标文件哈希，已补齐“目标 SHA-256”字段并重新部署；用户已确认
  W02 Diff 且未批准，人工记录见 [`A2-W02-20260804_gui-confirmation.json`](acceptance/A2-W02-20260804_gui-confirmation.json)。
  W13 撤销准备曾暴露 `task.undo_prepare` IPC Schema 漏登记 `sessionId`，已修复、以 90 个 Shell 测试
  复核并重新部署；新的隔离 W13 GUI 流程已完成初次批准写入，独立 SSH 核验匹配目标哈希，
  记录见 [`A2-W13-20260804_fresh-initial-approval.json`](acceptance/A2-W13-20260804_fresh-initial-approval.json)。
  随后撤销审批面板因 Renderer 任务 ID 切换竞态未显示；先前撤销计划人工记录已作废，竞态修复
  已通过 90 个 Shell 测试并部署，新的 `A2-W13-racefix-20260804` 隔离流程待重跑。
  racefix 流程现已完成 W13 初次审批、撤销审批面板、第二次审批和最终 SSH 恢复核验，记录见
  [`A2-W13-racefix-20260804-final.json`](acceptance/A2-W13-racefix-20260804-final.json)。
  W11/W12 打包探针原始报告已取回：W11 后端故障注入 `PASS`，并随后完成真实 GUI 锁定/恢复指引确认、用户恢复及 SSH 独立核验；W12 也完成真实 GUI 重启、恢复页面确认、用户点击恢复及 SSH 独立核验；原始报告为
  [`A2-W11-W12-20260804_report.json`](acceptance/A2-W11-W12-20260804_report.json)，SHA-256 为
  `b854a12c8cf370ffa53052b103f2b094dda9fb97b150e9fec27ab2c2a640e8ef`。
  W11 最终人工/SSH 收口记录为 [`A2-W11-GUI-20260804-final.json`](acceptance/A2-W11-GUI-20260804-final.json)：页面显示
  `rollback_failed`、写入锁定和人工恢复指引，未误报已回滚；最终文件恢复为原始 SHA-256，且无残留。
  W12 最终人工/SSH 收口记录为 [`A2-W12-20260804-final.json`](acceptance/A2-W12-20260804-final.json)：最终文件 SHA-256
  恢复为原始 `ce84104d3edf357a9a6bd8bf671190e05124f009a7deb77a834076bca83f17bb`，`.bak` 与恢复清单均不存在，
  Bitvise `BvSshServer` 仍为 `RUNNING`。
  详细路径、哈希和边界见
  [`INTEGRATION_01` §10](tasks/INTEGRATION_01_ROBUSTNESS_HARDENING.md)。A2-W01～W15 的 MVP 实机证据现已全部具备，
  因此 Desktop Alpha 2 仅按本次受控单文件修改 MVP 口径标记 `PASS`；这不改变正式 Phase/发布 Gate，也不表示
  Runner、Git、终端、Gateway 或 SQLite 可用。
- C01–C20 剩余门禁、前置依赖、执行顺序、证据接口和连接保护条件已形成 [剩余约束验收方案](reports/2026-08/win7_remaining_constraints_acceptance_plan.html)。

## Desktop Alpha 3 受控 Gateway 验收（2026-08-04）

- 受控结果为 `A3_CONTROLLED_GATEWAY_PASS`，结构化证据见
  [`A3-20260804-01_controlled-gateway.json`](acceptance/A3-20260804-01_controlled-gateway.json)，Win7 细项见
  [`A3-WIN7-HTTPS-20260804.json`](acceptance/A3-WIN7-HTTPS-20260804.json)，精致 HTML 报告见
  [`a3_controlled_gateway_acceptance_2026-08-04.html`](reports/2026-08/a3_controlled_gateway_acceptance_2026-08-04.html)。结果仅是受控 HTTP/HTTPS
  fixture 与 CONNECT proxy 的验收，不是企业 E7、真实模型或正式 Phase 3 PASS。
- A3-01 根验证通过：7 个模块共 909 项测试（Gateway 193、Workspace 80、State 219、Core 225、Runner 46、Git Adapter 51、Shell 95），lint/build 与设计门通过。
- A3 受控行为已通过：Replay 默认且无出站、显式 HTTP/HTTPS Gateway、HTTPS TLS 1.2 + 有效 CA、主机名/错误 CA fail-closed、SSE 协议/截断失败、3 次有界重试与 1.2 秒总 deadline、取消无迟到完成、CONNECT 成功/407 分类、凭据内存与脱敏，以及 Gateway→Core→Workspace 只读工具→UI 纵向链路。
- 已构建独立 A3 包并校验 Electron 22.3.27 SHA-256 为锁定值
  `2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb`；CA 私钥、API key、代理密码未进入仓库/报告。临时 fixture、proxy 已停止，端口检查未发现残留。
- Win7 A3 W01～W15 受控 Gateway 用例现均已有 PASS 证据：W13 使用 A3.2 独立产品包和新隔离
  工作区完成两次显式审批闭环，结构化记录见
  [`A3-W13-20260804-02.json`](acceptance/A3-W13-20260804-02.json)。初始 → 初次写入 → 撤销恢复
  的 SHA-256 依次为 `14e851…a582` → `33b305…2db5` → `14e851…a582`，无 `.tmp/.bak`；
  其他 W01～W12、W14、W15 继续引用既有原始报告。未改变网卡/路由/防火墙/服务/PATH、未重启。
- A2-W01～W15 仍按既有 Win7 MVP 实机证据与原指纹记录为 PASS；A3-W13 是 A3 范围的独立重验，
  不改写 A2 历史证据。DPAPI A3P-01～A3P-10 的整体结论仍待独立 W15 清理及其余 A3P 项收口；
  PAC/企业代理、企业 CA/模型和正式 Phase 3/E7 仍延期；公网真实模型由下述 A3.1 独立切片记录。

## Desktop Alpha 3.1 DeepSeek 公网真实模型验收（2026-08-04）

- 结果为 `A3_REAL_MODEL_PUBLIC_NETWORK_PASS`。结构化证据见
  [`A3R-DEEPSEEK-20260804.json`](acceptance/A3R-DEEPSEEK-20260804.json)，精致 HTML 报告见
  [`a3r_deepseek_public_model_acceptance_2026-08-04.html`](reports/2026-08/a3r_deepseek_public_model_acceptance_2026-08-04.html)。
  该结论只证明当前 Win7、当前 DeepSeek 账户和当前公网路径，不是企业 E7 或正式 Phase 3 PASS。
- Win7 无密钥公网探测连接 `api.deepseek.com:443`，223 ms 内完成 TLSv1.3 授权握手；证书 CN 为
  `api.deepseek.com`、Issuer 为 `TrustAsia DV TLS RSA CA 2025`，`/models` 返回预期 401 且响应正文未保存。
- 真实完成任务产生 638 个连续事件、618 个 Gateway 流增量；模型依次驱动
  `workspace.list_directory`、`workspace.search_text`、`workspace.read_text`，三组 started/completed 后
  以 `task.completed` 收口。报告 SHA-256 为
  `08b05d7f56bf6b6757dd3aa287816cfe869670fe9aed4432abec043d05c0d7be`。
- 独立真实取消任务在 48 个流增量后进入 `task.cancelling`，6 ms 后成为最终 `task.cancelled`；
  `task.completed=0`、`task.failed=0`，关闭报告前无迟到事件。报告 SHA-256 为
  `48466a13297bfc1194d54ef1a196d0c3c1f3bda4bd38daa6e4203a64ce60b575`。
- fix3 自包含包清单共 908 条，清单 SHA-256
  `8eb60ddf2c515fa4c896ea149d10a118c883f393925991ec3f77ddd8db02d3aa`；Electron 与关键 Product/Gateway
  文件均在 Win7 由 `certutil` 复核匹配。API key 仅在主进程内存，严格 key/Bearer 模式在报告、隔离
  userData/evidence 中均无值命中；退出后 Electron/Node 为 0，Bitvise 保持 `RUNNING`，SSH 22 保持连接。
- A2-W01～W15 继续按既有 Win7 MVP 证据和当前根回归标记 PASS；A3R 只暴露只读工具，未把历史
  A2 W13 冒充新的 A3 重测。A3-W13 已由 A3.2 独立记录完成。企业 Gateway/CA/代理/PAC、企业模型服务、
  正式 E7/Phase 3、Runner/Git/终端/SQLite/Updater/插件仍未完成或未启用；DPAPI 整体切片仍按 A3P
  证据单列。

## Desktop Alpha 3 A3-W13 独立写入审批重验（2026-08-04）

- 结果为 `PASS`，结构化证据见
  [`A3-W13-20260804-02.json`](acceptance/A3-W13-20260804-02.json)，精致 HTML 报告见
  [`a3_w13_write_approval_acceptance_2026-08-04.html`](reports/2026-08/a3_w13_write_approval_acceptance_2026-08-04.html)。
- A3.2 产品包在新隔离工作区完成两次独立显式审批：初次写入后文件 SHA-256 为
  `33b305c1903672e81d27ef07aa62decb62780fecb12740256765d19ade602db5`，撤销第二次审批后恢复为
  初始 `14e851741ab4d7acddef09d0dc7592d71f5e954c83c404fea2ba44bd9548a582`，无 `.tmp/.bak`。
- Renderer 当前按任务独立显示时间线；`prepareUndo` 会清空旧任务列表。本次以两个用户停点和两次
  SSH `certutil` 哈希核验形成证据，不宣称初次任务和撤销任务在一个 UI 列表中同时可见。
- 用户关闭产品窗口后，Electron/Node 进程均为 0，`BvSshServer` 为 `RUNNING`，SSH 22 仍可用；
  未改变网卡、路由、防火墙、服务、PATH，未重启。A3P 其他 DPAPI 原子项和企业 E7 仍单独处理。

## A1–A3 验收总览与 Win7 收口（2026-08-04）

- 总体口径为 `A1_A2_MVP_AND_A3_ACCEPTANCE_RECORDED_WITH_FORMAL_DEFERRALS`。A1 为
  `OWNER_ACCEPTED_FOR_MVP`，A2 为 `DESKTOP_ALPHA_2_MVP_PASS`，A3 受控 Gateway W01～W15 为
  `A3_CONTROLLED_GATEWAY_PASS`，A3R DeepSeek 公网纵向切片为
  `A3_REAL_MODEL_PUBLIC_NETWORK_PASS`。据此可以认为 A1～A3 的既定 MVP/Alpha 验收已完成，
  但不能写成正式发布、正式 Phase 3 或企业 E7 完成。
- A3P 的 Electron safeStorage / Windows DPAPI Current User 保存、重启状态识别与解密、清除、
  损坏 fail-closed 受控探针已通过；四份报告保留在 Win7 最终包中。由于 A3P-10“重启后显式
  真实连接”没有形成完整的本地归档证据，A3P 整体状态保持 `PARTIAL_EVIDENCE`，不提升为 PASS。
- 项目负责人明确批准永久删除 Win7 `C:\Win7CodingAgent` 下固定 23 个旧包、临时工作区和
  userData 目录。清理后 23 项均不存在，只保留 4 个最终包与 4 个 evidence 目录；按清理前盘点
  估算释放 `1,725,141,506` bytes（约 1.61 GiB）。最终复核 Electron/Node 均为 0，Bitvise
  `BvSshServer` 为 `RUNNING`，TCP 22 的 IPv4/IPv6 listener 均存在；临时清理脚本也已删除。
- 完整矩阵、证据 SHA-256、保留/删除清单和正式延期项见
  [`A1-A3-CLOSEOUT-20260804-01.json`](acceptance/A1-A3-CLOSEOUT-20260804-01.json) 与
  [A1–A3 Win7 验收总览报告](reports/2026-08/a1_a3_acceptance_closeout_2026-08-04.html)。

## A4 Execution Beta 非交互实机验收（2026-08-05～06）

- A4 无人值守编排 `A4-20260805-123467` 的 AUTO-00～AUTO-07 全部通过，锁定 x64 候选
  SHA-256 为 `733f549181228273afd65817b6448be1cc4beb888f8bf2caa294e4e1299ceecc`；Win7
  非交互 Helper 14/14，通过后无相关残留，`taskkill=false`，Bitvise 保持 `RUNNING`。
- 补充执行 `A4-20260806-140606` 的 REM-00～REM-06 全部通过：正式 C02 为 `PASS`；C03 为
  `FAIL`，因为 Restricted Token 进程仍能写入工作区外兄弟目录；C05 loopback TCP/UDP/DNS
  可达，但缺少批准的外部/企业端点和网络审计，因此正式 C05 保持 `ENVIRONMENT_MISSING`。
- 完整 SPIKE_02 仍为 `NO_GO_FORMAL_GAPS`：19 个原子项中直接通过 6 项（C01、C02、C06、
  C07、C08、N06）；C04 需要人工 ACL 授权。A5/D-011 的 Electron 22 ABI 工件已经由 Win10 构建
  并复核，但终端集成/harness 仍未完成，T01～T05/N01～N05 尚未执行。D-013 v15 的 Win10
  源码→二进制闭包为历史 `PASS`；`A4-20260810-000002` 已在 Win7 fail-closed：轮前、上传、smoke、
  harness 启动和后置零残留通过，但 C01/C03/C04/C05 共享 `ACL_ROLLBACK_FAILED`，REM-D07 又遇到
  空 stderr 的 `certutil 0x800703EE`。该轮 ledger 当时为 `RECOVERY_REQUIRED`，生产 Runner 未开放。
- v21 recovery 已在签名租约 `A4-20260810-000004` 下完成：REM-D01～D08、C01～C07 的九个
  必需用例、上传/回收双向 SHA-256 与后置零残留检查全部通过；ADR-0065 协调器在 commit
  `20b4480ab2ea4f53b3ccee7df39e47755ed92102` 上分级为 `WIN7_PASS`，租约已 `RELEASED`，活跃
  租约为 0。C05 仅证明 loopback 可达，正式企业/网络证据仍为 `ENVIRONMENT_MISSING`。
- 机器可读状态见 [`status/a4-execution-beta-latest.json`](status/a4-execution-beta-latest.json)，
  自动化与补充审计见 [A4 报告索引](reports/README.md)。A1～A3 已接受证据及 A4-14/A4-20/A4-21
  历史原始证据均未改写。

## Win10 原生构建与 A7 产品层进展（更新至 2026-08-20）

三条原生构建返回均已完成适用的结构、哈希、工具链、PE/API/CRT、smoke 和合规材料复核。共享 D-017
Profile 已被实际使用，但下表只说明“可以进入 Win7 集成/验证”，不代表对应 A5/A6/A7 已验收完成。
完整机器可读台账见
[`status/win10-native-builds-latest.json`](status/win10-native-builds-latest.json)。

| 轨道 / 组件 | Win10 结果 | 已解除的卡点 | 当前仍阻塞 |
|---|---|---|---|
| A4 / D-013 helper | v21 Win10 `PASS`：返回包 `5d3bdd6b…f8ef`、helper `98964fc5…ce5`、input-lock `60ddd80c…795b`；capture selftest、v142 logic、native smoke、PE/API/CRT 与开发机 containment 37/37 均 `PASS` | `A4-20260810-000004` 已由 ADR-0065 协调器分级为 `WIN7_PASS`；restricted primary、精确 SID 集合、Low Integrity、ACL rollback、C01～C07、双向哈希和后置零残留均通过，租约已释放 | D-013 已解除；C05 不提供网络隔离，交互终端、高风险和未知 Profile 继续拒绝 |
| A5 / D-011 node-pty + winpty | `PASS_WITH_PACKAGING_GAP`；返回包 `c938f115…46ea`，三项原生工件均为 x64，ABI 110 与 smoke 通过 | Win7 实测裁决为 `NO_GO_INTERACTIVE_WINPTY`；D-013 v24 低风险非交互 Runner 与 H3 只读日志已分别取得正式 `WIN7_PASS` | 交互终端不进入 Win7 v1；返回包内部总清单缺口由 A7 统一发布 manifest/SBOM 收口 |
| A6 / D-014 better-sqlite3 | `PASS`；返回包 `2cb0cd32…2794`，247 项清单全匹配，WAL/FTS5/schema smoke 通过 | D-014 已为 `READY_FOR_WIN7_VALIDATION`，不再缺 SQLite Electron ABI 工件 | 本行只记录 2026-08-07 Win10 构建前置；后续 Win7 正式结果见下文 A6 章节 |
| A7 / 发布包装 | 当前唯一 RC ZIP `39eecb6a…040c9` 已取得开发机、Win10、Win7 三层 PASS；唯一租约 `lease-A7-RC-20260820-055210` 下 RC-01～RC-10 全部通过，协调器评分 `WIN7_PASS` | D-013 v24 与 D-014 按 manifest 在 ASAR 外置装配；RC-04/05/06 产品矩阵、RC-07 升级/故障回滚、RC-08 retain/purge 卸载及 RC-09 零残留/系统不变均在 Win7 实机复核 | `RC_PASS`；交互 winpty、任意 Shell、高风险/未知 Profile 和网络隔离声明仍不包含在 RC 中 |

因此 A4/D-013 v21、A5/D-011 和 A6/D-014 的 Win10 构建前置均已完成；A4/D-013 v21 又已取得
协调器正式 `WIN7_PASS`。结合 A5 v24 非交互 Runner 与 H3 正式证据，SPIKE_02 以
`NO_GO_INTERACTIVE_WINPTY / WIN7_PASS_FOR_LOW_RISK_NONINTERACTIVE_RUNNER` 受限收口，
`A7_GATE=PASS_FOR_WIN7_V1_RC`；不得据此启用交互终端、任意 Shell、高风险 Profile 或强网络隔离声明。

## A6 正式 Win7 本地 SSD 存储验收（2026-08-10）

- A6 `20260810-06` 已获协调器正式 `WIN7_PASS`，唯一正式 Profile 为
  `E22-SQLITE343-LOCAL-SSD`：`dccs-chaizl-PC`、Win7 SP1 x64 build 7601、本地 NTFS Samsung 870 EVO、
  Electron 22.3.27 / ABI 110、better-sqlite3 8.7.0、SQLite 3.43.1、FTS5、WAL。签名租约绑定
  提交 `2a07d6db8d95816e84d7919898d46abfd543a8af` 与包 manifest
  `11500d96a0e0504339ce547bd3f80d76aacb2bb66f439f97f349d94b9fa7ea86`；Mac/Win7 双向哈希、轮前/轮后、
  BvSshServer/SSH 22 和零残留均通过。机器可读的唯一正式状态为
  [`status/a6-storage-latest.json`](status/a6-storage-latest.json)。
- 性能预算 #5～#8 全部达标：S01 60 秒 61650.86 QPS；S03 为 1312.34（3k）、1213.89（10k）、
  1089.52（30k）文件/s；S05 100 次查询 P95 183ms；S06 在 517.79MB 触发、清理后 199.60MB，
  完整性通过。S02、S04、S07、S08、F01～F06、P08/C11-PATH 也均通过。
- 原始返回证据约 1.2GB，位于本地忽略归档
  `A6/WIN7_A6_SSD_EVIDENCE_20260810-06/`；正式状态列出每个返回文件的大小和 SHA-256。历史 SSD
  evidence 与 disposition 保持不变。此结论只覆盖本地 SSD，不推断 HDD、网络盘或未知介质性能，
  也不表示生产 EventStore 或索引服务已实现。

## A5 非交互 Runner v24 构建收口（2026-08-11）

- D-013 v24 返回包 `WIN7_D013_HELPER_ARTIFACTS_20260811-105127.zip` 已独立复核为
  `BUILD PASS / candidate_eligible=true / REVIEW PASS`；外层 SHA-256 为
  `5a65a023e33addc7b06bca6956443df8dc2e3bfab67649ac6d8c3ff4472d667c`，helper SHA-256 为
  `7f86dac89862b2c61d55fe83ba00bf7cdaa69714d24d0f9d21b62f9040d1c134`。
- 返回包绑定源码提交 `78113f49db6ec94f803ae38518c42eaa740448ba` 和锁定的
  Win10/VS2019/v142/SDK 10.0.19041/x64/static CRT Profile；内部 24 项清单、logic tests、
  PE/API/CRT、严格 UTF-8 捕获、普通执行和合作取消 smoke 全部通过。取消 smoke 证明 helper
  在返回 `canceled=true` 前完成 Job 回收和 Low Integrity 的精确 SDDL 回滚。
- v23 首轮 Win7 L08 的 ACL 残留记录仍保留且该候选仍为拒绝状态。V24 已在
  `D013-RUNNER-20260811-020000`、目标 `192.168.1.11` 和新 ADR-0065 签名租约下完成 L01～L10，
  10 项全部 PASS；轮后 helper/ping 与 Low Integrity 残留均为零，工件哈希匹配，Bitvise 保持
  `RUNNING`。协调器评级为 `WIN7_PASS`，生命周期已 `RELEASED` 且无活动租约。
- A5 的生产非交互 Runner containment 核心卡点因此正式解除，结论为
  `CONTAINMENT_READY_FOR_LOW_RISK_NONINTERACTIVE_RUNNER`。交互式 winpty 继续 No-Go，任意 Shell、
  高风险本地命令与未登记 Profile 继续拒绝。
- H3 r2 已在 Win7 普通交互式桌面会话完成只读日志与取消验收：STDOUT/STDERR 分栏、滚动、
  358-byte 截断提示、`task.cancelling → runner.finished(cancelled) → task.cancelled` 反馈均通过，
  界面不存在终端输入能力。最终 postflight 为 `residues=[]`、无 Low Integrity 标签残留、Bitvise
  `RUNNING` 且 H3 工件哈希匹配。首包的标签回滚 `ACCESS_DENIED` 失败及干净恢复证据继续保留；
  ADR-0072 明确只读 profile 不修改工作目录 Integrity Label，child token 仍保持 Low Integrity。
- A5 非交互 Runner + 只读日志整合任务现为 `COMPLETE`，结论为
  `H3_READONLY_STREAMING_LOG_UI_PASS / CONTAINMENT_READY_FOR_LOW_RISK_NONINTERACTIVE_RUNNER`。

## A4/A5/A6 整合收口与 A7 Gate（2026-08-12）

- A4 `eee6219`、A5 `af589dc`、A6 `fb2084d` 已进入 `codex/integrated-robustness` 祖先链，
  收口提交 `793cc47` 又已成为当前 main `ec9d27a` 的祖先；main 与 `origin/main` 同步，本次状态
  更新开始前工作树干净。
  A6 继续使用规范 ADR-0066；A5 分支本地 ADR-0066～0071 以规范 ADR-0067～0072 导入，原始
  Win7 证据字节未重写。
- SPIKE_02 正式受限结论为 `NO_GO_INTERACTIVE_WINPTY` 与
  `WIN7_PASS_FOR_LOW_RISK_NONINTERACTIVE_RUNNER`；SPIKE_04 保持 `WIN7_PASS`，因此
  `A7_GATE=PASS_FOR_WIN7_V1_RC`。Renderer 终端输入、网络隔离、任意 Shell、高风险和未知 Profile
  均未开放。
- 中央只读归档为 `/Users/qlyf/Developer/win7-agent-artifacts/closeout-20260812/`，共 205 个文件、
  1,469,654,891 字节；`CLOSEOUT_MANIFEST.json` SHA-256 为
  `df4aa1957eb6c12a4311138424702fe92ba4d1da6a96a11734e5bda9a0327cea`。中央副本与原路径/符号链接
  的逐文件大小及 SHA-256 均一致。
- A4、A6、A5 worktree 已按顺序且不带 `--force` 移除，分支引用保留，原绝对工件路径通过只读
  符号链接继续可访问。机器可读单一事实来源为
  [`integration-closeout-latest.json`](status/integration-closeout-latest.json)。A7 已从该唯一基线启动；
  后续开发进展不会改写本次 A4/A5/A6 收口证据。

## A7 RC-04 产品装配与 Windows smoke（更新至 2026-08-13）

- 提交 `f24d9a42a915dcab9eecb1e61d0870ac11a84555` 已建立 manifest 绑定的产品 composition root：
  Electron 创建 Renderer 前逐文件校验并装配 D-013 v24 低风险 `whoami` Runner 与 D-014
  `better-sqlite3 8.7.0 / SQLite 3.43.1 / ABI 110` 状态层；交互终端、任意 Shell、网络盘和 HDD
  性能声明继续显式关闭。
- 状态层已接入 schema v1 的 SQLite V2 EventLedger，覆盖 WAL/FTS5/Profile 检查、原子批次、事件
  指纹、线程序列、容量上限、启动恢复扫描和关闭 checkpoint。当前持久化的是审计事件事实；完整
  session catalog 仍为进程内状态，不宣称重启后的完整会话恢复。
- 开发机 `npm run verify` 通过 7 个模块共 981 项测试，release/RC 合同 19/19 通过。由同一干净提交
  和锁定输入连续两次生成的 ZIP 字节一致：731 个 manifest 文件、100,877,883 字节、SHA-256
  `909166478a8766ed380221d7b349e4db841651516be42feba7db281e0678f1d5`；独立逐文件校验通过。
- 锁定候选已在 Windows x64 上完成两轮真实产品入口 smoke：Electron 22.3.27、Renderer/诊断、
  安全基线、D-013 `win7-whoami` Runner composition、D-014 SQLite 3.43.1/WAL composition
  全部通过，两轮退出码均为 0；状态库为 49,152 字节，关闭后无 `-wal`/`-shm` 残留。返回 summary
  与两轮原始 JSON 的 SHA-256 已在开发机复算，并与候选 release manifest 及 8 个关键产品文件
  逐项绑定。只读原始归档位于
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc04-windows-smoke-20260813/`。
- RC-04 限定结论为 `PASS`；在 RC-05/RC-06 工具包形成前，阶段状态曾为
  `RC04_WINDOWS_PRODUCT_SMOKE_PASS_RC0506_PENDING`。Win10 仍仅为 `PARTIAL_RC04_SMOKE_ONLY`；
  RC-05/RC-06、完整 Win10 门禁、新 Win7 租约与 RC 总体结论均未完成。
  返回报告中“State remains in-memory”是与同报告 SQLite/WAL 和数据库事实矛盾的遗留 MVP 注释，
  已记录为非阻断文案不一致且原始字节保持不变。机器可读记录见
  [`a7-rc-development-latest.json`](status/a7-rc-development-latest.json) 和
  [`a7-rc04-windows-smoke-latest.json`](status/a7-rc04-windows-smoke-latest.json)。
- RC0506 首轮 Windows 返回按 fail-closed 裁决：RC05-P02 失败，RC-06 虽报告 7/7，但由于执行前加载
  未受 KIT manifest 约束的外部 `noasar.js`，且未返回生产测试库，不能进入正式 PASS。首轮 5 个原始
  返回物已按字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-windows-attempt1-20260813/`。
- 不改动产品候选的 v2 验证包已由提交 `46ccd90` 修复：ASAR 模式由 manifest 绑定 harness 内部设置，
  禁止 `NODE_OPTIONS`/外部 preload；P02 改用实时哈希绑定的回环 `ping.exe`；失败总是生成 summary、
  fatal 且退出码为 1；返回的生产/篡改数据库由独立验证器复算。两次确定性构建均得到 12,294 字节、
  SHA-256 `3aaaa718efe68ba45e1b510cab707d147f42230a8b9fd692df014a891f108a8a`。当前状态为
  `RC04_PASS_RC0506_ATTEMPT1_FAIL_CLOSED_V2_READY`；v2 的 RC-05/RC-06 仍未执行，Win7 与 RC 均为
  `NOT_PERFORMED`。机器可读记录见
  [`a7-rc0506-validation-kit-latest.json`](status/a7-rc0506-validation-kit-latest.json)。
- v2 随后在普通 Win10 CMD 完成执行并保持 fail-closed：RC-06 的 7 项、生产数据库 `quick_check`、
  2 条连续事件、FTS 与零 WAL/SHM 残留已独立复核为 `PASS`；RC-05 的 P02 因回环 `ping.exe`
  返回 exit 1 而失败。该轮还暴露一个真实 C11 缺陷：CP936 head/tail 截断文本出现替换字符，
  但旧实现错误记录 `replacement_count=0`。返回报告写出的进程退出码 0 又与 harness 的
  `process.exit(1)` 合同冲突，因此 RC-05 与组合门禁均保持 `FAIL_CLOSED`。
- 2026-08-14 的 v3 源码修复已就绪：Runner 对截断 head/tail 分别做多字节边界对齐；RC-05
  改用 KIT manifest 绑定的本地固定字节探针，通过候选自身哈希绑定的 `electron.exe` 执行，
  不访问网络；`RUN_RC0506.cmd` 会记录并原样返回真实子进程退出码。提交 `963eabe` 已两次
  确定性重建出相同的新产品 ZIP，SHA-256 为 `39eecb6a…040c9`，包内 Runner 修复与源构建哈希
  一致。旧候选 `90916647…f1d5` 已移入只读归档；它的 RC-04/RC-06 PASS 不自动继承给新候选。
  v3 KIT 已由提交 `f47fd84` 两次确定性生成相同的 13,502 字节 ZIP，SHA-256 为
  `9cbe6be7…72b1e`，6 个 ZIP 文件和 5 个 manifest payload 全部独立复核。新候选与 KIT 已归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-v3-ready-20260814/`；当前仍需在普通 Win10
  CMD 对新候选重跑 RC-04/05/06，故不得提前声明新的 Win10 PASS。
- 2026-08-16 v3 Windows 轮已在 Win10 专业版 19045 x64（本地 NTFS SSD）完成并按 fail-closed 裁决：
  RC-04 两轮各 3/3 PASS、退出码 0、无 WAL/SHM 与进程残留；RC-06 全 7 项 PASS，生产库与篡改库
  均已返回并独立哈希绑定（`quick_check=ok`）；RC-05 的 P02/C01 因
  `CONTAINMENT_UNAVAILABLE` 失败——v3 harness 以候选 `electron.exe` 注册
  `rc05-harness-local-probe`，而 D-013 原生 helper 的 C06 allow-list（真实 System32 直属
  8 个工具）在创建 Job 前拒绝该可执行文件。helper 的拒绝本身是正确的 fail-closed 行为，
  定性为 v3 验证设计与原生安全边界不兼容，不是环境噪音。本轮 `RUN_RC0506.cmd` 真实退出码为 1，
  退出码合同首次得到履行。返回包 `return-to-dev-20260816.zip`（22,204 字节，SHA-256
  `5e02a7e5…a6a0e`）15/15 manifest 项复核一致，已按字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-windows-attempt3-v3-20260816/`。
  当前分层结论：`RC04=Windows PASS / RC05=FAIL_CLOSED / RC06=Windows PASS / WIN10=NOT_PASS /
  WIN7=NOT_PERFORMED / RC=NOT_PERFORMED`。
- v4 修复已完成并通过两次确定性构建，且不扩大产品 helper allow-list：RC-05 探针改用 helper 已允许的
  System32 `findstr.exe` 读取 harness 内生成的确定性 GBK fixture（215 字节，SHA-256
  `f1e8bf35…7da9`，正例含中文解码、截断用例压 128 字节上限验证多字节边界对齐），取消用例改用
  仅 127.0.0.1 的 System32 `ping.exe`；harness 内置 C06 allow-list 镜像并对全部 harness profile
  做执行前预检，新增 fixture 确定性与 allow-list 相容性（含 v3 electron.exe 回归负例）合同测试，
  release 合同测试由 19 项增至 22 项（RC0506 合同 9→12），全量 `npm run verify` 7 模块通过。
  产品候选字节不变（继续锁定 `39eecb6a…040c9`）。v4 KIT
  `RC0506_WINDOWS_VALIDATION_KIT_20260816-v4.zip`（14,239 字节，SHA-256 `ff5a26ef…c6d5`，
  绑定提交 `ef1486e`）两次构建字节一致，内含 README 候选哈希已修正为当前候选；已归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-v4-ready-20260816/kit/`。下一步是在普通
  Win10 CMD 以新 KIT 重跑 RC-05/RC-06（RC-04 可按同候选既有两轮 PASS 引用），通过后才可准备
  完整 Win10 分层门禁与新的 A7 RC Win7 签名租约。
- 2026-08-16 22:32 v4 Windows 轮已在同一 Win10 19045 x64 主机完成并通过：RC-05 六项中五项
  PASS、RC05-P01 按预期以 `NOT_APPLICABLE_TARGET_PROFILE_HASH` 延期（Win10 whoami 字节与
  Win7 目标 pin 不同），总评 `PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED`；RC-06 全 7 项再次
  PASS，返回数据库哈希与 v3 轮完全一致（`0070c116…9640`/`81870940…a2e`，确定性成立）。
  findstr fixture 探针实测：正例 215 字节 CP936 解码零替换字符；128 字节上限下保留
  127 字节、省略 88 字节且零替换（与开发机预测的 head 63 + tail 64 一致）；取消用例
  `ping 127.0.0.1` 以 `job_object` contain 回收，`child_job_assignment_verified` 与
  `acl_rollback_verified` 均为真。fixture SHA-256 与 harness 记录常量
  `f1e8bf35…7da9` 一致。`RUN_RC0506.cmd` 真实退出码 0（PASS 合同履行）；前后
  electron/helper 进程均为 0。开发机 `verify-rc0506-evidence.mjs` 独立复核 PASS，
  返回包 10/10 manifest 项一致（17,718 字节，SHA-256 `9c3d5bae…080d`），已按字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-windows-attempt4-v4-20260816/`。
  当前分层结论：**当前候选 `39eecb6a…040c9` 的 RC-04/RC-05/RC-06 Windows 证据齐备**；
  剩余门禁为 RC-07 升级/回滚、RC-08 卸载/零残留、最终 Win10 层的 RC-03 精确 PE/API/CRT
  总门禁，以及新的 A7 RC Win7 签名租约下的完整 RC-01～10 实机矩阵。Win7 与 RC 总体仍为
  `NOT_PERFORMED`，不得提前声明。
- 2026-08-16 深夜，RC-07/RC-08 生命周期工具 v1 已实现并两次确定性构建（提交 `e10b2a1`）：
  `RC0708_WINDOWS_LIFECYCLE_KIT_20260816-v1.zip`（18,407 字节，SHA-256 `0103998b…f1ff`，8 个
  ZIP 文件）。升级侧实现旁路 staging、严格 release-manifest 全树等值校验、由 cmd 包装器在
  harness 阶段间执行的同卷目录改名激活（阶段退出码合同 0/1/42/43）、注入式暂存文件损坏
  （激活前检出）与激活后损坏（字节级一致回滚、无混合版本）三场景，以及用户数据快照不变
  与残留审计；卸载侧实现隔离区托管卸载、`version` 文件锁探针（harness 宿主 electron.exe
  自身不可改名）、显式 retain/purge 数据保留策略与 transcript 证明的隔离区清除。产品候选
  字节不变；升级源使用上一代 `f24d9a4` 候选 ZIP（`90916647…f1d5`，只读归档）以证明真实
  版本前进。合同测试扩至 31 项（RC0708 9 项，含真实候选 ZIP 嵌套布局验证、CJK/空格路径、
  wrapper 合同与验证器正负例），全量 `npm run verify` 7 模块通过。KIT 已归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-lifecycle-kit-v1-20260816/`；
  机器可读记录见 [`a7-rc0708-lifecycle-kit-latest.json`](status/a7-rc0708-lifecycle-kit-latest.json)。
  RC-07/RC-08 的 Windows 执行仍为 `NOT_PERFORMED`，按 README 三轮升级 + 两轮卸载执行并通过
  `verify-rc0708-evidence.mjs` 独立复核后方可计入 Win10 分层门禁。
- 2026-08-18，RC-07/RC-08 的 Win10 交付已打包为**单一交付 ZIP**
  `RC0708_WIN10_DELIVERY_20260816.zip`（201,260,387 字节，SHA-256 `9b49b6a1…f008ef2`，
  两次确定性构建字节一致），内装：锁定新候选 `Win7CodingAgent-0.1.0-rc.1-win7-x64.zip`
  （`39eecb6a…040c9`，文件名保持原样——harness stage 绑定 basename）、上一代候选改名字节副本
  `…-PREVIOUS-f24d9a4.zip`（`90916647…f1d5`，与锁定旧版哈希一致，作为升级源避免同名冲突）、
  生命周期 KIT `RC0708_WINDOWS_LIFECYCLE_KIT_20260816-v1.zip`（`0103998b…f1ff`）、
  内嵌 SHA-256 清单 `RC0708_WIN10_DELIVERY_SHA256.txt` 与操作提示词
  `RC0708_WIN10_OPERATION_PROMPT.txt`（UTF-8 无 BOM/LF）。提示词规定 Win10 侧按
  哈希核对 → 目录布局（产品目录外解压 KIT）→ 五轮执行（success / corrupt-staged-file /
  activation-corruption 三轮升级 + retain / purge 两轮卸载，共用单一 evidence 根）→
  原样返回全部证据；交付包与提示词已只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-win10-delivery-20260816/`，
  机器可读记录见 [`a7-rc0708-lifecycle-kit-latest.json`](status/a7-rc0708-lifecycle-kit-latest.json)。
  RC-07/RC-08 的 Windows 执行仍为 `NOT_PERFORMED`。
- 2026-08-19，v1 返回包 `return-to-dev-20260819.zip`（14,725 字节，SHA-256
  `22134211…780e`）虽报告三轮 RC-07 与两轮 RC-08 均 PASS，但报告同时确认执行前在 KIT 目录新增
  CJS 别名、注入 `process.noAsar`、修改两个 manifest 绑定的 CMD，并新增串联 CMD；其中“CMD 不在
  KIT_MANIFEST”的说法与 v1 清单事实冲突。因此该轮正式裁决为
  `FAIL_CLOSED_KIT_MUTATED_EVIDENCE_INELIGIBLE`，对 RC-07/08 与 Win10 Gate **无推进效力**。原返回包
  与 21 个展开文件已逐字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-windows-attempt1-v1-20260819/`，不改写原始证据。
- 同日已从干净提交 `5eb2b29` 生成不可现场修补的 v2 KIT：统一 lower-hyphen 模块名、最早设置
  `process.noAsar`、把 ASCII/CRLF CMD 的准确字节纳入 manifest，并在每个阶段强制复核
  KIT_MANIFEST、精确入口哈希及额外控制文件；五份报告必须携带 `kit_provenance`，开发机验证器还须
  以 `--kit` 绑定同一 ZIP。KIT `RC0708_WINDOWS_LIFECYCLE_KIT_20260819-v2.zip`（20,952 字节，
  SHA-256 `0c3be032…55d2`，manifest SHA-256 `929c3a18…9e17`）及提交 `2f4bccf` 生成的单一交付包
  `RC0708_WIN10_DELIVERY_20260819-v2.zip`（201,263,145 字节，SHA-256 `f7ced50b…61137`）均连续
  构建两次且逐字节一致，已分别只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-lifecycle-kit-v2-20260819/` 与
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-win10-delivery-v2-20260819/`。开发机全量
  `npm run verify` 983 项通过，RC0708 合同 12 项通过；v2 Windows 五轮仍为 `NOT_PERFORMED`，
  当前 Win10 总门禁继续等待 RC-03、RC-07、RC-08，Win7/RC 仍为 `NOT_PERFORMED`。
- 2026-08-19 01:14，v2 Windows attempt 2 返回包
  `RC0708_V2_WINDOWS_RETURN_20260819-011417.zip`（17,794 字节，SHA-256 `00464f63…7ba8`）与
  sidecar 本地复核一致，ZIP 20 个证据文件完整；开发机以精确 KIT `0c3be032…55d2` 执行
  `verify-rc0708-evidence.mjs --kit` 独立复核 PASS。RC-07 success、staged corruption、activation
  corruption 三轮及 RC-08 retain/purge 两轮均 status PASS、exit code 0；五份 provenance 精确绑定
  manifest `929c3a18…9e17`，`unexpected_control_files=[]`，无生命周期或进程残留。返回包和报告已
  逐字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-windows-attempt2-v2-20260819/`。报告中的
  “未用包装脚本”按证据解释为“未用额外或修改后的包装脚本”；正式 manifest 绑定的
  `RUN_RC0708_*.cmd` 执行由报告与 transcript 共同证明，不构成阻断。
- RC-03 同日按精确字节连续性收口：唯一 RC ZIP 内仅有两个 ASAR 外置原生文件；helper
  `7f86dac8…c134` 与 D-013 v24 Win10 返回包逐字节一致（x64、静态 CRT、forbidden API/动态 CRT
  扫描和 smoke PASS），`better_sqlite3.node` `7138aa23…15cc` 与 D-014 Win10 返回包逐字节一致
  （x64、Electron ABI 110、forbidden API/动态 CRT、WAL/FTS5 PASS），且 RC-06 已在当前候选真实
  加载。该段形成 2026-08-19 的 **`WIN10_PASS`** 分层结论；2026-08-20 的 Win7/RC 正式结果见
  下节，不再沿用当时的 `NOT_PERFORMED`。Win10 机器可读收口见
  [`a7-win10-rc-closeout-latest.json`](status/a7-win10-rc-closeout-latest.json)。

## A7 Win7 RC-01～RC-10 正式验收（2026-08-20）

- 唯一候选 ZIP `39eecb6a…040c9` 在 `dccs-chaizl-PC`（Win7 SP1 x64 build 7601，
  本地 NTFS Samsung SSD 870 EVO 1TB）完成完整 RC-01～RC-10。正式租约
  `lease-A7-RC-20260820-055210` 使用 Ed25519，绑定候选提交 `963eabe…d56c`、发布 manifest
  `ff1a46ff…32d0`、RC0506-v4、RC0708-v2、Win7 内置 Shell 提取脚本、目标身份和全部 required cases。
- RC-04 两轮产品启动、RC-05 Runner、RC-06 WAL/FTS5/恢复/中文空格路径/上限/损坏与网络盘拒绝、
  RC-07 三轮升级/故障回滚、RC-08 retain/purge 两轮卸载均通过；RC0708 独立 exact-kit verifier
  对五份报告复核 PASS。
- RC06-v4 原始子报告保留 `RC06-M01` FAIL：它错误调用 Win7 PowerShell 2.0 不存在的现代 Storage
  cmdlet。其余六项均 PASS；协调器以未改写的 `Win32_DiskDrive` UTF-16 原始证据确认系统盘型号
  含 `SSD 870 EVO 1TB`，补足物理 SSD 条件后裁决 RC-06 PASS。该补充不把原始子报告伪装成 PASS。
- 轮前轮后 `BvSshServer=RUNNING`、SSH 22 可用、相关进程零残留；启动时间、Bitvise 配置、路由、
  防火墙和机器 PATH 均字节一致。64 项回收证据 manifest SHA-256 为
  `045dd72f16963c6033403eb71260c0a622ab12b43cd2461ab82a12133ac89270`；协调器评分 `WIN7_PASS`，
  租约已 `RELEASED`，活跃租约为 0。因此 A7 正式状态为 **`RC_PASS`**。
- 首次租约 `lease-A7-RC-20260820-054316` 因验收用 7za 与 Win7 不兼容，在 RC-01 前 fail-closed，
  经干净 postflight 后释放且未评分，门禁影响为 NONE。机器可读事实来源为
  [`a7-win7-rc-acceptance-latest.json`](status/a7-win7-rc-acceptance-latest.json)。
- A7 已以非快进方式进入 main `bd43c63`，且该提交已与 `origin/main` 一致。双层注释标签
  `artifact-source/win7-v0.1.0-rc.1` 绑定实际构建源 `963eabe`，
  `acceptance/win7-v0.1.0-rc.1` 绑定验收收口 `bd43c63`，两者均已推送远端。
- RC 长期只读归档为 `/Users/qlyf/Developer/win7-agent-artifacts/releases/win7-v0.1.0-rc.1/`：
  139 项、309,627,153 字节，`CLOSEOUT_MANIFEST.json` SHA-256 为
  `ec67c340d5df7ea113dd99457fef9074842ee3dd4ea6f8755b87e2657e364b95`。逐文件大小/SHA-256、
  清单 sidecar、候选 ZIP、发布 manifest、SBOM、许可证、最终 Win10 与 Win7 证据均已复核，
  且不含私钥、凭据、缓存或历史失败尝试的重复副本。

## A8-06 候选修复记录（2026-08-21）

### A8-06 独立复核修复（2026-08-21）

- 独立复核确认首版 A8K-04 的 Windows 入口不可正式使用：普通 Node 16.17.1 不能加载 Electron ABI 110
  的 D-014 binding；A8-03/A8-04 报告不满足声明的统一字段，三份报告没有共同绑定候选 manifest；报告路径
  还会向候选目录写入未纳入 manifest 的文件。上述属于开发机可修缺陷，不是外部环境不可用。
- ADR-0085 修复已实现：A8-05 由结构化 Node 包装器启动包内 `electron.exe` Node-mode；三份报告升级为
  evidence schema v2、逐文件复算完整 manifest、记录相同 `candidate_manifest_sha256`、验证目标 ABI/操作者，
  并仅写入候选兄弟 evidence 目录；evidence-set verifier 联合检查 required cases 和同一候选。
- `source_dirty: true` 的开发包现明确为 `external_acceptance_eligible: false`，正式 Win10/Win7 工具在启动
  产品前拒绝。ADR-0086 同时把需要回填最终哈希的 current status/构建后报告移出不可变候选。修复已在
  干净提交 `7ccaed6b98e4ebb9f77d993d22c3ed136bdeb8c0` 上无 `--allow-uncommitted` 重建两次，结果字节一致：
  ZIP `d1e8dbbe5e9a09e8d50fc1411c11e48de6d0bb734d7bce1d957bb42d3f45aef9`，manifest
  `85c874843947478307515de4a56391fc7cbee2689fbffb5b7af8508e3873087c`，`source_dirty: false`、
  `external_acceptance_eligible: true`。A8-06 状态已重新签发为 `A8_DEVELOPER_COMPLETE_VALIDATION_READY`；
  Win10、Win7 和 RC 继续保持 `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE` / `NOT_PERFORMED`，A7 PASS 不继承。
- 后续独立 Agent 审查的五项结论已逐条复核：ABI wrapper、辅助模块、候选外证据路径和 clean candidate
  均已关闭；新增打包测试扫描 `validation/*.mjs` 的全部相对依赖。旧 Electron 41 schema v1 报告保留为
  不可用于正式评分的历史 surrogate，未伪造 manifest 绑定；A8-03/A8-04 source kit 已明确由 A8-06 schema v2
  正式命令取代。机器可读复核见 [`a8-06-independent-review-followup-20260821.json`](status/a8-06-independent-review-followup-20260821.json)。

### A8-06 消除外部 Node.exe 假设（ADR-0087，2026-08-21）

- 验证套件全面改用包内 Electron 22.3.27 的 Node 模式（`set ELECTRON_RUN_AS_NODE=1&& .\electron.exe`）
  作为脚本宿主，彻底消除外部 `node.exe` 假设；`preflight` 移除 `where node` 检查，改为探测
  包内 `electron.exe -v` 并校验工件哈希。
- A8-03/A8-04 在拉起真实 Electron GUI 测试窗口前净化子进程环境变量（清除 `ELECTRON_RUN_AS_NODE`）。
- 增补了“无系统 Node 仍可执行验证套件”的自动化合同测试（`scripts/release/test/a8-package.test.mjs`）。
- 修复已从远端可达的干净提交 `03c4d6e20b58a7897c9e1c6427143f75bef98a57` 重建两次，结果字节一致：
  ZIP SHA-256 `5b24fe7ead243569e12c38c947aa31c1a04091bdea1eba3e8bd4b0bb3966ae6e`，manifest SHA-256
  `8def5b3f8e3421009cf8b079fb87eaf61896ce36f82bfcefff9c8f2a60a993a7`，`source_dirty: false`、
  `external_acceptance_eligible: true`。
- 该候选取代 source commit 不在分支历史中的 `3d8f1b3…` 候选；新证据使用普通追加提交，不 amend
  `03c4d6e`。开发机 schema v2 smoke 10/10 PASS 且候选未改变，追踪见
  [`a8-06-candidate-provenance-reissue-20260821.json`](status/a8-06-candidate-provenance-reissue-20260821.json)。

### A8-06 Win10 ASAR 物理文件校验修复（ADR-0088，2026-08-21）

- Win10 19045 x64/NTFS/NVMe 现场已通过旧候选 ZIP、manifest、Electron 22.3.27 和
  `better_sqlite3.node` 哈希预检；A8-03 随后误报物理 `resources/default_app.asar` 缺失并按规则停止。
- 独立 `certutil` 复算确认该文件大小 109138、SHA-256 `db1bfd…724f4` 与 manifest 相同。根因是包内
  Electron Node-mode 的普通 `node:fs` 对 `.asar` 启用虚拟目录视图，不是候选字节损坏。
- 验证器现显式使用 Electron 内建 `original-fs` 复算候选物理树，接口不可用时结构化 fail-closed；新增
  `.asar` manifest fixture、Electron 接口选择/缺失拒绝与打包闭包测试。修复记录见
  [`a8-06-win10-asar-field-failure-20260821.json`](status/a8-06-win10-asar-field-failure-20260821.json)。
- 旧 ZIP `5b24fe7e…ae6e` 保持 Win10 A8-03 FAIL，A8-04/A8-05/联合验证为 NOT_RUN，不得用手工哈希改写为
  PASS。修复提交 `fc4e0deea9a0cfcd86037ebbbbd2bc40a4f74ff9` 已推送且从远端分支可达；干净工作区
  两次构建字节一致，新 ZIP SHA-256 `4ab0c2ce…12ad6`、manifest SHA-256 `0ab06b5c…503ea`。
- 新候选的 schema v2 开发机 smoke 10/10 PASS，执行前后 ZIP/manifest 未改变；机器可读重新签发见
  [`a8-06-asar-candidate-reissue-20260821.json`](status/a8-06-asar-candidate-reissue-20260821.json)。新候选
  Win10/Win7/RC 仍为 NOT_PERFORMED，下一步须全新解压并从 A8-03 重新执行。

## 文档治理（2026-09-24）

- 2026-09-24 09:55（+08:00），[PR #8](https://github.com/allin2/win7-coding-Agent/pull/8)
  “A9-16 WIN7-36 UI subset: candidate and physical acceptance” 将 `codex/a9-alpha2` 合并入 `main`，合并提交
  `8fd9d5d707005918e5ad5f0fae4fc100bb481131`，内容与 `f348761` 一致。相对原 main `72dfe22` 带入 34 个非合并提交：
  A9-15（WIN7-23～28）、A9-16 UI 子集（WIN7-29～36）及 A9-17 启动/内存实现（`3437bc1`）。合并不改变任何候选、
  authority 或实机证据；A7 仍为唯一 RC，完整 Alpha 2 未获 PASS。本节以下文档治理提交均在合并之后。
- 2026-09-24，文档整理 P0/P1 完成：修复 A9-17 临时路径断链、补齐报告索引（`17761ab`）；`STATUS.md`
  拆为当前快照与本流水、新增 ADR 与方案索引（`adad4d3`）；ADR-0134 接受，`AGENTS.md`/`CLAUDE.md`
  不再写死当前任务（`f634044`）。
- 2026-09-24，[DOCS_02](tasks/DOCS_02_DOC_CHECK_IGNORED_PATHS.md) 经负责人批准并完成：`docs:check`
  改按 `git ls-files` 枚举，跳过被忽略路径，`outputs/**` 73 处噪声失败消除，当前 `ok=true`
  （137 个文档）；新增 `scripts/test_check_docs.mjs` 7/7 PASS，负向对照确认旧实现失败。开发机工具，
  不进入 Win7 候选，`Win7-Validation: N/A`。
- 2026-09-24，[DOCS_03](tasks/DOCS_03_A9_16_PROBE_GATE_EVIDENCE_ISOLATION.md) 经负责人批准并完成：A9-16 几何探针闸门
  默认输出移至系统临时目录，拒绝写入仓库内未忽略路径，summary 记录被测源码身份（当前与 `f0e80ec` 一致）
  与归档漂移（仅报告）；开发机实跑 PASS 且归档证据哈希不变，自测 4/4 PASS，负向对照确认旧闸门会改写
  归档证据，工作台契约 32/32 PASS。开发机工具，`Win7-Validation: N/A`。
- 2026-09-24，[DOCS_04](tasks/DOCS_04_DOC_LINK_TARGETS_TRACKED.md) 经负责人批准并完成：`docs:check` 要求本地链接
  目标属于仓库（已跟踪或未跟踪未忽略），并拒绝仓库外目标与大小写不一致的链接；现有 503 个本地链接零命中，
  测试 12/12 PASS，负向对照确认旧实现放行三类链接，耗时无变化。开发机工具，`Win7-Validation: N/A`。
- 2026-09-24 16:50（+08:00），[PR #9](https://github.com/allin2/win7-coding-Agent/pull/9)
  “docs: 2026-09-24 documentation governance (STATUS split, ADR-0134, DOCS_02-04)” 将本节文档治理提交
  `17761ab`～`2aeb672`（11 个）合并入 `main`，合并提交 `ea24c0d5c94d9748812db86184bc648fe9e7a8c6`。不涉及产品代码、
  候选、authority 或 Win7 证据。

## A9-19 运行过程实时可见与布局二期（2026-09-24）

- 2026-09-24，负责人反馈运行中的工具调用与中间状态要到最终结果才出现，并要求优化布局；核查定位主因为渲染端
  运行中轮次（持久化为 `active`）绑定缺陷，另有模型 chunk 压到轮次结束、同步全树哈希独占主进程、等待提示需空闲 10 s。
  负责人批准 [A9-19](tasks/A9_19_LIVE_PROGRESS_AND_WORKBENCH_LAYOUT.md) 与 ADR-0135 并授权修订需求。
- 同日开发机实现完成（`A9_19_DEVELOPER_VERIFIED`）：运行中过程与模型输出预览实时可见，对话行显示标题，界面中文化，
  1079×540 下运行中对话区 60.5%（旧 43.7%）。扫描独占 550 ms → 27 ms，残留 checkpoint 往返校验约 0.4 s。Shell 375、
  workspace 211、`verify:quick` 通过；证据为无头 Chrome，未运行 Electron 22、Win10 或 Win7。

- 2026-09-24 22:30，A9-19 Win7 **探索性运行（非验收）**：`192.168.1.3` 上以 `agent` 普通用户、WIN7-36 冻结包叠加 A9-19 的
  5 个文件跑一轮真实 Provider 任务。运行中工具卡、已运行时长与模型输出预览均在落盘后 ≤1.1 s 出现在界面；新发现切换对话/工作区会收起
  桌面左栏（A9-19 前已存在）。不签发任何 PASS，详见 A9-19 任务书 §12。

- 2026-09-25，负责人批准 WIN7-37 换发合同（ADR-0136）；管线提交 `dd6cb1a`，双独立干净构建 ZIP 逐字节一致
  （SHA-256 `4d70063254212ca581b7b3dac9f89edc81a2ba31a53b51a6b1c1d65667f167cf`，manifest `bad63b4ce9f881d42bfd4426ccd5bdae58916ea7c284b5c1bbc8cc17e08ea27c`），`source_dirty=false`、`external_acceptance_eligible=true`，冻结于 `.acceptance/candidates/WIN7-37/`。
  开发机预检通过；待负责人签发候选外 `WIN7_37_RELEASE_AUTHORITY`，Win7 G1/G2/G3 均 `NOT_PERFORMED`。

- 2026-09-25，负责人按精确哈希批准 WIN7-37 并指定目标 `192.168.1.3`；候选外 authority SHA-256 `0d8d4f9456f42da4692fea7d27c03edcd4f91df3ba6985b623233e095a9d0616`（run-id `85476889-099d-46b6-b8a4-666e8e0b5d77`），
  冻结候选自带校验器接受。交接书转为 `READY_FOR_EXECUTION`，Win7 G1/G2/G3 仍 `NOT_PERFORMED`。

- 2026-09-25，WIN7-37 外部执行完成（run `85476889-…`）。审核方复核：身份、权限、完整性、G2 95/95 与 A9-19 实时性/左栏/文案用例通过；
  W37-05/06/11～15/18 证据不足。审核建议暂不签发，补跑 G3 UI 用例；待负责人裁决。

- 2026-09-25，负责人接受建议，按交接书附录 A 补跑 G3（S1–S7，审核方钉住哈希的探针）。审核：W37-05、06、12、13、14、18 证据充分；
  W37-11 A03 与 W37-15 A02 因测量探针在持久化任务行写入前采样而缺证（审核方探针缺陷，非产品失败）。随后按附录 B 补跑 S1b：
  最坏形态“进行中1 / 更早8 / 归档1”下完整可见 5 行，断言全部为 true。
- 2026-09-25，负责人沿用 WIN7-36 可达响应式等效口径。正式报告组装完成（21/21 PASS，附等效裁决）；开发机预检，冻结候选自带校验器返回 PASS。
  待按附录 C 在 Win7 上以 `agent` 执行报告校验后再签发 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`。

- 2026-09-25，执行方按附录 C 在 Win7 上以 `agent` 完成正式报告校验：`REPORT_VERIFY_EXIT=0`，`PASS / A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS / 21`，
  审核方独立复核通过。负责人确认签发 WIN7-37 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`（可达响应式状态等效口径；≤799px 不可达/未验证），
  A9-19 Phase-Gate 改为 `A9_19_WIN7_37_LIVE_PROGRESS_AND_LAYOUT_PASS_EQUIVALENCE`；不构成 Alpha 2 或 RC PASS。

- 2026-09-25，A9-17/A9-18 状态核查发现：Git 外部写确认分类器在 `c8691e3` 上对 `cmd /c"git push …"`、PowerShell 参数前缀与位置参数、
  `bash -c`/`-lc` 等形态返回“无 Git”，Full Access 下不触发目标绑定确认；分类器自 `e80b8c8` 未变，WIN7-22、WIN7-37 等候选同源（分类器层复现，
  Win7 端到端可达性待验证）。A9-18 工作树曾部分修复但未提交。负责人同日按建议批准 [A9-20](tasks/A9_20_GIT_CONFIRMATION_CLASSIFIER_HARDENING.md)
  与 ADR-0137，并授权按推荐优化需求；已签结论不改判，仅登记已知缺陷。

- 2026-09-25，建立 [A9-17 / A9-18 承接台账](plans/A9_17_A9_18_CARRYOVER_LEDGER.md)：登记 A9-17 遗留项 K17-1～K17-5（含预算 #3 与 ADR-0028 口径矛盾）、
  A9-18 的 P0-1～P0-4 / P2 需求、工作树自报进度与影响主线的缺陷；A9-18 工作树仍未提交，保全、ADR 重编号与拆分承接待负责人裁决。

- 2026-09-25，按负责人要求评估 A9-18 价值：主线实测启动全量加载历史 checkpoint，100 Turn 约 4 s 且线性增长，确认启动定向恢复方向正确；
  schema 事实投影性价比低不移植。起草 [A9-21](tasks/A9_21_A9_18_SALVAGE_PORT.md) 与 ADR-0138/0139（均待批准），移植完成后删除 A9-18 工作树。

- 2026-09-25，负责人按建议批准 A9-21 与 ADR-0138/0139，顺序为 A9-20 先行；A9-20 开始实现。

- 2026-09-25，A9-20 开发机完成：Git 确认分类器支持 CMD/PowerShell/POSIX 各种载荷写法，不可解析即保守确认，超长命令策略层确认，
  Git 外部写与无法解包的 Shell 宿主不计验证证据。实施中另发现并关闭两类旁路（已分类分段掩盖动态 push、深层嵌套 `powershell -e`），见 ADR-0140。
  core 362 / shell 376 项通过，旧实现负向对照 37 项失败，7 项变异全部捕获。Win7 未验证。

- 2026-09-25，A9-21 M0 完成：性能预算 #3 改按 `shell.main` 计量（ADR-0139），测量计划映射同步，采样脚本仅改注释，
  SHA-256 变为 `198bdac3…0b6`。K17-5 关闭，A9-17 的 Win7 采样（K17-1）不再被口径问题阻塞。

- 2026-09-25，A9-21 M1 完成：启动只恢复本工作区中断且缺 checkpoint 的 Turn，历史清单改为使用时校验。开发机 100 Turn 历史启动 8.0～8.3 s → 35～51 ms。
  另发现 `redactSecrets` URL 凭据正则在长字母数字串上为二次复杂度（范围外，待裁决）。

- 2026-09-25，负责人决定 A9-21 M1b（脱敏正则线性化）与 M2（模型输出上限）交由外部 Agent 实施，本会话验收；交接书见
  `docs/plans/A9_21_M1B_REDACTION_REGEX_HANDOFF.md`、`docs/plans/A9_21_M2_OUTPUT_LIMITS_HANDOFF.md`。

- 2026-09-25，A9-21 M1b 第一轮验收不通过（`a78d928`）：`{0,31}` 修法在协议名末 32 字符无字母时漏脱敏，与旧正则不等价。
  负责人裁决改为等价的线性扫描实现、渲染端恢复原样；交接书修订为第 2 版，执行方返工。

- 2026-09-25，A9-21 M1b 第二轮验收通过并并回（`d67979a`，合并 `3e73b5e`）：URL 凭据脱敏改为与旧正则等价的线性扫描，
  差分 160 万条 0 差异，1 MiB 最坏输入 ≤ 7.4 ms。渲染端保留旧正则（输入已截到 500）。Win7 未验证。

- 2026-09-25，A9-21 M2 第一轮验收不通过（`e118f2b`）：SSE 长行分片查找为二次复杂度；截断后历史残留孤立 tool 消息，会话后续请求会被拒绝。
  交接书修订为第 2 版，执行方返工。

- 2026-09-25，A9-21 M2 第二轮有条件通过（`df0405a`）：二次复杂度与截断后历史协议问题已修复；C-4 降级用例被 A9-20 规则掩盖、
  历史协议用例依赖 core 构建产物，两处只改测试，补齐复查后并回。

- 2026-09-26，A9-21 M2 第三轮验收通过并并回（`3bc8815`，合并 `de851be`）：模型输出单响应 1 MiB、单工具参数 512 KiB、单 Turn 2 MiB，
  SSE 长行查找线性，截断后对话历史符合协议。gateway 263、core 371、shell 423 项通过。Win7 未验证。

- 2026-09-26，A9-21 M3/M4 开工前裁决：`blockedRequests` 位于 `main.js`，M4 允许路径增补该文件（仅相关代码）；界面方案经演示确认。
  M3（checkpoint 列表分页）交外部 Agent 实施，交接书见 `docs/plans/A9_21_M3_CHECKPOINT_PAGINATION_HANDOFF.md`。

- 2026-09-26，A9-21 M3 第一轮有条件通过（`106e650`）：分页契约与界面符合；同一时刻记录的稳定排序缺测试，补齐复查后并回。
  另发现快照耗时随 checkpoint 总数增长源于既有 `listConversationFacts`，不属 M3。

- 2026-09-26，A9-21 M3 第二轮验收通过并并回（`ab5e792`，合并 `6dc75d0`）：快照只带最近 50 条 checkpoint 与总数，
  更早记录经 `a9.checkpoint.list` 游标分页。state 305、shell 432 项通过。Win7 未验证。

- 2026-09-26，A9-21 M4（事件集合与被拦截请求上限）交外部 Agent 实施，交接书见 `docs/plans/A9_21_M4_COLLECTION_LIMITS_HANDOFF.md`。

- 2026-09-26，A9-21 M4 第一轮验收不通过（`e1c6956`）：淘汰后“加载更早记录”跳过已释放记录并留下断档；“收回已淘汰事件”缺测试；
  `releasedEventIds` 随对话无限增长，一并改为计数。交接书修订为第 2 版，执行方返工。

- 2026-09-26，A9-21 M4 第二轮验收不通过（`7e0ebf9`）：断档与逐 ID 集合问题已解决；一页中同时含已释放与从未加载的记录时释放计数多减。
  交接书修订为第 3 版，执行方返工。

- 2026-09-26，A9-21 M4 第三轮验收通过并并回（`d38aeaf`，合并 `b146595`）：渲染端事件与 Main 被拦截请求均有上限，释放计数准确。
  A9-21 M1～M4 全部并回，各受影响包全量测试通过。下一步 M5 清理 A9-18 工作树。Win7 未验证。

- 2026-09-26，A9-21 M5 完成：负责人删除 A9-18 工作树与分支 `codex/a9-memory-optimization`（最后 HEAD `7d06789`），删除前逐文件核对见承接台账 §7.3。
  A9-21 M0～M5 全部完成；任务级待办为 gateway 偶发失败定位、真实 Electron 完整任务回归与 Win7 实机。

- 2026-09-26，清理 A9-21 M1b～M4 的外部执行工作树与已并回的本地分支；主工作区只剩 `codex/a9-alpha2`。

- 2026-09-26，A9-21 收口验证（gateway 偶发失败、真实 Electron 回归）交接给新会话，交接书见 `docs/plans/A9_21_CLOSEOUT_VALIDATION_HANDOFF.md`。

- 2026-09-26，负责人授权以当前主线换发 WIN7-38 并在 Win7 实机验收 A9-20 与 A9-21（ADR-0141，任务书 A9-22）；验收机只读连通性检查通过
  （`192.168.1.3` 返回 `6.1.7601`）。A9-21 §5 第 6 项改由 WIN7-38 覆盖，收口交接书改为只排查 gateway 偶发失败。
  构建输入中 A6 SQLite 返回包需从私有加密归档恢复。

- 2026-09-26，WIN7-38 实机执行（run-id `31504dc1-8371-4381-a2ea-67ab2b9ce411`，目标 `192.168.1.3`，外部执行方）：authority `55bf8074…584f`
  记载负责人批准时间 `2026-09-26T05:15:00Z`（签发对话记录待负责人补录）。G1 完整性 PASS（agent Medium）；G2 smoke 退出码 1，
  产品入口 `MODULE_NOT_FOUND`，5 个 `electron.exe` 残留经人工强制终止；G3 按硬停止条件未执行。
- 2026-09-26，WIN7-38 审核：根因为候选内 `a9-win7-38-smoke.cjs` 未传 `A9_SMOKE_PRODUCT_MAIN`，产品未运行；W38 断言多为恒真，残留检测未排除自身 PID。
  负责人裁决 WIN7-38 为 `A9_22_WIN7_38_VALIDATION_KIT_DEFECT_NOT_PASS`（ADR-0142），A9-22 关闭；新建 A9-23 修复套件后换发 WIN7-39。
  审查报告见 `docs/reports/2026-09/a9_22_win7_38_acceptance_review_2026-09-26.md`。
- 2026-09-26，负责人同意 A9-23 §7 Q1：WIN7-39 冻结前以非正式构建在 Win7 预演 G2 smoke，仅用于修正套件，标 `REHEARSAL_NOT_ELIGIBLE`，不计入任何结论。
- 2026-09-26，A9-23 套件修复交接书完成（`docs/plans/A9_23_W39_KIT_REPAIR_HANDOFF.md`），分支 `codex/a9-23-w39-kit`，由新会话或外部执行方实施，本会话验收。

- 2026-09-26，A9-23 W39 套件修复第一轮验收不通过（`90f840e`）：机械门与构建均通过，断言来源审查发现 6 处问题，返工要求见套件修复交接书 §7；
  Win7 预演交接书待返工通过后再出。

- 2026-09-26，A9-23 W39 套件修复第二轮验收通过（`330eae7`），发出 Win7 套件预演交接书（非正式构建，结果不计入任何结论）。

- 2026-09-26，A9-23 W39 Win7 套件预演完成：产品入口修复在实机生效，M1/M2/启动与 W37 继承阶段通过；24 条未通过断言均为套件问题，
  第三轮返工要求见套件修复交接书 §9，返工后再预演。Win7 的 MinGit 只在管理员 PATH 中，smoke 改用完整路径。

- 2026-09-26，A9-23 W39 套件第三轮返工（`28c5508`）验收通过，发出第二次 Win7 预演要求（含计划任务 XML 须 CP936 编码）。

- 2026-09-26，A9-23 第二次预演止于计划任务回读门（`schtasks /query` 在 SSH 会话报“无法加载列资源”）；裁决分层门（`chcp 936` 首选、COM 导出后备、自检任务必做），换新目录重跑。

- 2026-09-27，A9-23 第二次 Win7 预演复核：M3 60 轮等在实机通过，剩余 24 条未通过断言为套件问题 K8～K11，出第四轮返工要求（套件修复交接书 §11）。
  记录产品侧观察：会话中选择或切换到已有历史的工作区后，过程记录不加载，需切换对话或完成一轮后才显示（待定是否另立任务）。

- 2026-09-27，A9-23 W39 套件第四轮返工（`8f5e0e4`）验收通过，发出第三次 Win7 预演要求（预演交接书附录 C）。
- 2026-09-27，A9-23 第三次 Win7 预演（`20260927-0059`）：13 个阶段与 181 条断言全部通过；smoke 汇总因套件判定缺陷 K12 输出 `FAIL`，发出第五轮返工 R5-1（套件修复交接书 §13）。
- 2026-09-27，A9-23 套件第五轮返工（`e0e8da6`）验收通过；负责人决定不做第四次预演；套件分支于 `7ec9db7` 并入 `codex/a9-alpha2`，起草正式实机交接书 `A9_23_WIN7_39_ACCEPTANCE_HANDOFF.md`（待双构建冻结与门 A）。
- 2026-09-27，WIN7-39 双构建冻结：源码 `7ec9db7`，两个独立干净工作树 ZIP 逐字节一致，SHA-256 `6bf586e764f18947f52227ff9e321c60091e0410ed7a84061979e49d10cad9e5`（101,414,183 B），manifest `1388bebc…f420`，输入锁 `a3decbc5…3b48`；候选自带校验拒绝错误 pin 与错误绑定（开发机预检）；authority 草稿（run-id `b0ebcf98-1697-431d-9ca5-22ac26ff2a67`，目标 `192.168.1.3`）待负责人签发。
- 2026-09-27，门 A：负责人在对话中明确指示“签发 WIN7-39 authority”，签发 `WIN7_39_RELEASE_AUTHORITY`（`approved_at` 2026-09-26T18:36:58Z，SHA-256 `b07588e00c47dce88d9ea95e28fedf0c8db26a28900351f2770251ea336f9a09`），绑定 ZIP `6bf586e7…d9e5`、manifest `1388bebc…f420`、输入锁 `a3decbc5…3b48`、目标 `192.168.1.3`、run-id `b0ebcf98-1697-431d-9ca5-22ac26ff2a67`；A9-23 实机交接书改为 `READY_FOR_EXECUTION`。
- 2026-09-27，WIN7-39 实机第一段：G0 与 G1 完成（完整性 `PASS`，Win7 端 ABI 110），G2 前因交接书完整性报告路径写错停止；审核方裁决为交接书勘误，G1 有效，G2 按实机交接书附录 A 续跑。
- 2026-09-27，WIN7-39 G2 续跑：smoke 退出码 0、`status=PASS`，13 个阶段与 181 条断言全部通过，零残留；审核报告 `a9_23_win7_39_acceptance_review_2026-09-27.md` 建议 15 项满足，待正式报告 Win7 复核与门 B。
- 2026-09-27，负责人接受 WIN7-39 审核结论；正式报告 `report-w39.json`（`70229b79…2688`）开发机预检 `PASS`（15/15），Win7 复核按实机交接书附录 B 执行。
- 2026-09-27，WIN7-39 正式报告 Win7 校验：`agent` Medium 下候选校验器 `status=PASS`、`verified_cases=15`、`REPORT_VERIFY_EXIT=0`；待负责人门 B 裁决。
- 2026-09-27，**门 B**：负责人签发 WIN7-39 `A9_23_WIN7_39_A9_20_A9_21_PASS`（15 项，源码 `7ec9db7`，ZIP `6bf586e7…d9e5`，run-id `b0ebcf98`），接受 W39-06 Stop 后 PID 以运行结束时不存在为准；已知限制随结论记录。A9-23 关闭；A9-20 改为 `A9_20_WIN7_39_PASS`；A9-21 §5 第 6 项关闭，`Phase-Gate` 待第 5 项。
- 2026-09-26，A9-21 §5 第 5 项 gateway 偶发失败排查：独立分支 `codex/a9-21-gateway-flake`（基线 `8efd6ad`），Node 20.17.0，
  `src/gateway` 全量 Jest 空载 100 次、3 个 Node CPU 负载下 100 次，每次 263/263 通过；**未复现、原因未定位**。
  负载时段（北京时间）15:41:04～16:03:29、16:07:15～16:10:08、16:27:05～16:38:48；前两段与 WIN7-39 打包测试部分重叠，
  两次中断运行未计数。初始 6 次预检因本工作树缺 `core/dist` 导致 J5 失败，补建后重新计数；不是原偶发失败的复现。
  原始 JSON 与进程清理证据：`/tmp/a9-21-gateway-flake-evidence-20260926.tar.gz`，SHA-256
  `7af335e5e63d85d97e3721949955a5cb91dd39432516fcbf3e89c08cf30ba2b0`（临时目录可能被清理）。
  未改产品代码；是否接受未复现结论待负责人决定。`Phase-Gate` 不变，WIN7-39 实机待验证。
- 2026-09-27，A9-21 收口：负责人接受 §5 第 5 项 gateway 排查结论“未复现、原因未定位”（开发机 200 次 263/263，审核方复核原始 JSON 一致），关闭第 5 项；第 6 项已由 WIN7-39 完成。`Phase-Gate` 改为 `A9_21_DEVELOPER_VERIFIED`。证据长期保存于 `.acceptance/runs/A9-21-GWFLAKE/a9-21-gateway-flake-evidence-20260926.tar.gz`（SHA-256 `7af335e5…a0ba2b0`，自 `/tmp` 复制长期保存）。
- 2026-09-27，Alpha 2 剩余范围：负责人决定拆两任务、先做 Review；起草 A9-24 任务书（`DRAFT_PENDING_OWNER_REVIEW`）与交互 Demo `docs/plans/a9-24-review-demo/`，未授权实现。
- 2026-09-27，负责人批准 ADR-0143：不做暂存区式 Review 模式，改为“先写后审”的改动审阅（直接写入、每轮改动摘要、逐文件 Diff 与撤销、整轮撤销、不阻断）；A9-16 追加 §21 修订登记；A9-24 草稿与 Demo 按新方向重写。
- 2026-09-27，负责人确认 A9-24 Demo 与开放问题建议，批准实施（`APPROVED_FOR_IMPLEMENTATION`）；冻结 C14 允许路径与 W37/W39 驱动兼容约束，发出实现交接书 `A9_24_CHANGE_REVIEW_HANDOFF.md`。
- 2026-09-27，A9-24 实现 `a086626` 验收通过（workspace 216、shell 458、打包 60/60，三项负向对照有效），于 `c136d12` 并入 alpha2，`A9_24_DEVELOPER_VERIFIED`；起草 A9-25（WIN7-40 换发与实机验收，ADR-0144 Proposed）。
- 2026-09-27，负责人批准 A9-25（ADR-0144 Accepted；保留预演、不改验收机 DPI、W40-01～15 全量回归），发出 W40 套件交接书。
- 2026-09-27，负责人要求有序推进已规划工作；新增推进顺序文档 `A9_ALPHA2_DELIVERY_SEQUENCE.md`（一次一个 Win7 候选、产品改动分支开发冻结后并入、只读核查并行、先证据后修复）。
- 2026-09-27，恢复目录误暂存只读核查完成（[报告](reports/2026-09/a9_recovery_dir_git_exposure_check_2026-09-27.md)，开发机，未在 Win7 验证）：确认无忽略规则的仓库中 `git add -A`/`git add .` 会纳入 `.agent_recovery/`（含改动前原文、未登记秘密与绝对路径），`git clean -fd`/`git stash -u` 会使撤销失效；自 A9-03（`ff96a19`）起全部 A9 候选同源。负责人裁决 D1：修复进入第一批首个里程碑，采用方案 3b（恢复目录内写入内容为 `*` 的 `.gitignore`），WIN7-40 范围不变；迁出工作区（方案二）与恢复目录清理另立任务评估。登记为已知问题并给出手动缓解。
- 2026-09-27，A9-25 第 1 步开发机门通过：W40 套件 `b99336f` 经审计返工 `8ce1bc3`（恢复被误删的继承旅程变量绑定并加回归测试），验收方复跑包测试 70/70、shell Jest 458/458、`verify:quick`、`docs:check` 通过，于 `762e2d3` 并入 alpha2；`w40*` 旅程未运行，下一步 Win7 预演（结果标 `REHEARSAL_NOT_ELIGIBLE`）。
- 2026-09-27，A9-25 第一次 W40 Win7 预演（`20260927-1741`）复核：继承 13 阶段通过，改动审阅核心观察符合预期；6 项套件问题需返工（截图关闭检查器、`too_large` 字段匹配、review 模式经界面提交、阶段耗时、停止终态读取、抽屉过渡中测量），未发现产品缺陷；登记产品侧观察 O-1（取消无终态事件）、O-2（超限文件原因措辞）。
- 2026-09-27，A9-25 W40 套件第二轮返工（`2f14d69`）复核：K-01/02/05/06 符合要求，包测试 77/77；需第三轮小返工（共用 `runElectron` 不得改写驱动原始报告且计时不得抛出；W40-21 结构化拒绝口径放宽为任意错误码）。登记 O-3：`a9-lifecycle.test.ts:945` 偶发一次未复现，疑为时序竞争，另行核查。
- 2026-09-27，A9-25 W40 套件第二、三轮返工通过（包测试 80/80），于 `5a20663` 并入 alpha2；发出第二次 Win7 预演（预演交接书附录 A）。
- 2026-09-27，A9-25 第二次 W40 预演（`20260927-2019`）复核：停止用例 K-05 消除；检查器等待超时（125% DPI 小数视口 1079.2 对取整 `innerWidth` 1079 的无容差判定），单阶段失败导致 smoke 中止、无总报告；需第四轮套件返工（视口容差、阶段失败不中止、等待诊断），未发现产品缺陷。
- 2026-09-27，A9-25 W40 套件第四轮返工通过（包测试 84/84），于 `0ca5a81` 并入 alpha2；发出第三次 Win7 预演（预演交接书附录 B）。
- 2026-09-27，A9-25 第三次 W40 预演（`20260927-2224`）复核：smoke PASS，17 阶段与 W40-02～22 全部通过，K-01～K-06 消除，套件第 2 步完成（预演证据不计入结论）；登记 O-4（命令产生文件的 Diff 为空）。下一步起草 WIN7-40 正式实机交接书。
- 2026-09-27，A9-25 第 4 步冻结预检发现候选内报告器残留 W39 结论标签，门 A 前撤回 `3a2ecdb` 冻结（保留于 `_superseded`），发出第五轮小返工，修复后重新双构建冻结。
- 2026-09-27，A9-25 W40 套件第五轮返工通过（包测试 85/85），于 `908f0f2` 并入 alpha2；重新执行第 4 步双构建冻结。
- 2026-09-27，A9-25 第 4 步完成：WIN7-40 从 `64fd3a7` 双构建冻结（ZIP `f14b7992…58fb`，manifest `4d499d73…888f`），开发机预检通过（非 Win7 结果）；等待门 A 签发 authority。
- 2026-09-27，A9-25 门 A：负责人签发 WIN7-40 authority（`b17ab35f…5618`，run-id `81c7a234`，目标 `192.168.1.3`）；实机交接书 `READY_FOR_EXECUTION`，Win7 实机验收待执行。
- 2026-09-28，A9-25 WIN7-40 实机（run-id `81c7a234`）：G1 PASS；G2 `w40_review` 因驱动读取未重绘 DOM 与一次性点击的时序缺陷失败，执行方按 §7 停止，后飞行零残留。审核报告确认非产品缺陷；负责人门 B 裁决 `A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS`（ADR-0145），不部分签发，修订 A9-25 以 WIN7-41 换发（连续 2 次预演通过后冻结），第一批候选顺延为 WIN7-42。
- 2026-09-28，A9-25 §9 第 ① 步完成：W41 套件（R6 时序修复 + W41 派生 + R6-5 补测，包测试 94/94）于 `5d671bc` 并入 alpha2；发出 W41 连续两次 Win7 预演交接书。
- 2026-09-28，A9-25 W41 连续两次预演（`20260928-1848`）复核：两次一致失败于驱动 `showDiff` 完成判据（依赖 `#a9-diff` 内容变化，同内容赋值在 Blink 不触发变更），套件缺陷、非产品缺陷；要求 R7 返工后重新连续两次预演。
- 2026-09-28，A9-25 W41 套件 R7 返工通过（包测试 97/97），于 `e846366` 并入 alpha2；发出第二轮连续两次 Win7 预演（W41 预演交接书附录 A）。
- 2026-09-28，A9-25 W41 第二轮连续两次预演（`20260928-2128`）复核：R7 生效；两次同点失败于 R6 返工把可选的“确认撤销”改成必达等待（写工具文件无确认卡），套件缺陷、非产品缺陷；要求 R8 返工后第三次连续两次预演。
- 2026-09-29，A9-25 W41 套件 R8 返工通过（包测试 101/101），于 `f77de6d` 并入 alpha2；发出第三轮连续两次 Win7 预演（W41 预演交接书附录 B，写入反斜杠归一化与续传取回做法）。
- 2026-09-29，A9-25 W41 第三轮连续两次预演（`20260929-0748`）复核：两次全部通过（17 阶段、21 个用例，W41-01 留待完整性入口），R7/R8 生效；偏差为 agent 会话断开（窗口尺寸不同）与执行方越权尝试 `tscon`（失败）。待负责人裁决是否认定 §9 第 ② 步完成。
- 2026-09-29，负责人认定 A9-25 §9 第 ② 步完成（W41 三轮预演，套件稳定），确认 DEV-2 授权来自负责人；进入第 ③ 步 WIN7-41 实机交接书。
- 2026-09-29，A9-25 §9 第 ③④ 步：起草 WIN7-41 实机交接书；WIN7-41 从 `0f8af24` 双构建冻结（ZIP `66a4b3e4…93b0`，manifest `141ef659…343e`），开发机预检通过（非 Win7 结果）；等待门 A。
- 2026-09-29，A9-25 门 A：负责人签发 WIN7-41 authority（`aeaa20cf…ffcc8`，run-id `318e27e4`，目标 `192.168.1.3`）；WIN7-41 实机交接书 `READY_FOR_EXECUTION`，Win7 实机验收待执行。
- 2026-09-29，A9-26 第一批可靠性任务书与 ⑤ 交互 Demo 经负责人批准（C1/C2、Q1～Q7 按建议；O-1、O-2 并入，O-4 另立），追加 ADR-0146 与推进顺序记录，发出实现交接书；状态 `A9_26_IMPLEMENTATION_AUTHORIZED`。
- 2026-09-29，A9-26 首次交回（`445aaaf`）验收需返工 B1（掩盖退出码的组合被判为验证）、B2（删除“重试加载”破坏继承的 retry 旅程）；返工 `1c8fb06` 复核通过，开发机门通过，`0fea04b` 并入 `codex/a9-alpha2`，状态 `A9_26_DEVELOPER_VERIFIED`；Win7 由 WIN7-42 承担。
- 2026-09-29，WIN7-41 实机执行完成（run-id `318e27e4`，首轮因 `agent` 断开硬停止后重新发起；G1/G2 退出码 0、smoke PASS）；审核方复核原始证据支持 22 项成立，组装正式报告并开发机预检通过，待执行方 Win7 报告校验后提交门 B。
- 2026-09-29，WIN7-41 正式报告 Win7 校验完成（`agent` Medium，`status=PASS`、22 项、`REPORT_VERIFY_EXIT=0`）；审核方核对一致，建议门 B 签发 `A9_25_WIN7_41_A9_24_PASS`，待负责人裁决。
- 2026-09-29，WIN7-41 门 B：负责人“按建议签发” `A9_25_WIN7_41_A9_24_PASS`（22 项，源码 `0f8af24`，run-id `318e27e4`）；A9-25 关闭，A9-24 取得 Win7 结论；推进顺序阶段 1 完成。

- 2026-09-30，负责人批准 A9-27 / WIN7-42，授权完成 A9-26 实机验证、合并前审查并合入 main；任务状态为 `APPROVED_FOR_IMPLEMENTATION / A9_27_IMPLEMENTATION_AUTHORIZED`。候选门 A/B 仍按独立绑定签发流程执行。严格 SSH 只读预检成功，agent 为控制台运行中；实际产品验证仍为 `NOT_PERFORMED`。

- 2026-09-30，冻结前复核发现四项开发机阻断。负责人批准 A9-28 修复失败验证大输出与预算硬门遗漏，A9-29 必需审计及 Provider 完整性草案待批准；A9-27 套件继续准备，产品冻结/合并暂停。
- 2026-09-30，负责人明确批准 A9-29：修复必需审计故障与 Provider 响应完整性，W42 扩为 30 项；与 A9-28 分任务实施，实机证据仍 NOT_PERFORMED。

## A9-28 / A9-29 开发机修复整合（2026-09-30）

四项冻结前阻断已修复并独立复核，通过必要开发机检查后并入 alpha2（`186e850`）。详见[记录](reports/2026-09/a9_28_a9_29_developer_closeout_2026-09-30.md)。W42 套件补强中，Win7 为 NOT_PERFORMED，尚未冻结或合入 main。

## A9-27 WIN7-42 换发（2026-09-30）

- 负责人批准 A9-27，并分别批准 A9-28/A9-29 的四项冻结前合同修复；开发机验证和独立产品复核闭合。W42 扩为 30 项。
- 源 `c62323f` 连续两轮预演 FAIL，保留原包和全部证据。仅修 W42 冷历史种子轮次关联与实时模型说明观测，继承函数和原断言不改。
- 返工源 `94385a8` 连续两轮 Win7 预演 25 阶段及 W42-02～30 均 PASS；W42-01 无 authority 为 NOT_PERFORMED。每轮 743 文件与 Win7 哈希一致，零残留、零真实秘密。证据 `.acceptance/rehearsals/A9-27-W42/20260930-1423/`，属于 REHEARSAL_NOT_ELIGIBLE。
- 双独立干净构建逐字节一致并与预演 ZIP 相等，WIN7-42 已冻结：source `94385a87d22928acc1ce5dd8f1881d89e0d4473b`，ZIP `3b6e0b72b98de794594cd6924a1298ef75ed72bafcebacf966c86ad2382a01cf`，manifest `6f7b224cdb304c9e10edf87ec9c490ffeb7dd5be42f9432ba3b6c5f3df3908c9`。固定正式 run-id `92d693e0-e80a-4d58-9f7f-aaff5ec69bd3`，目标 `192.168.1.3`。
- [正式交接书](plans/A9_27_WIN7_42_ACCEPTANCE_HANDOFF.md)与候选外 authority 草案就绪，等待负责人门 A 签发及角色确认；正式执行、独立证据审核、门 B 和本地 main 合并均 NOT_PERFORMED，未推送。

- 2026-09-30，负责人回复“签发门 A，按上述角色继续”，批准冻结候选和上述固定目标/run-id；主代理执行，负责人独立证据审核及门 B。候选外 authority 与独立 pin 已落盘（SHA-256 `35111410302d33cacd8e042f4a4d3979d558825ce939d6b280e47d9b77fc4f79`），开始正式执行；门 B/main 合并仍 NOT_PERFORMED。

- 2026-09-30，WIN7-42 正式执行及 Win7 报告复核完成：完整性 796/797、25 阶段/275 汇总断言、30 项，退出码均 0；774+19 Win7 文件哈希相等、916 文件扫描零真实秘密、两次后飞行零残留、四任务逐项移除。三项执行偏差完整保留，见[执行与合并前检查材料](reports/2026-09/a9_27_win7_42_execution_and_premerge_2026-09-30.md)。负责人独立审核与门 B 待完成，main 未合并，未推送。

- 2026-09-30，负责人在三项执行偏差解读及接受建议后回复“接受”；按已确认角色和原合并授权，门 B 收尾记为 `A9_27_WIN7_42_A9_26_PASS`。收尾发现 W42-23 dry-run 不足以独立关闭 A9-26 全部真实 Git 原矩阵，补充当前包 Windows Git R0-01～04 全 PASS；首轮换行断言失败及第二轮逐命令固定换行后通过均保留。182 个补充文件哈希闭合，零残留，两个任务逐项移除；1,161 文件扫描零真实秘密。A9-26～29 更新验收状态，恢复目录登记在当前候选关闭，保留 fdx 与既有未测边界；开始按授权本地 main 合并，未推送。

- 2026-09-30，本地 main 在 `/Users/qlyf/.codex/worktrees/a9-main-integration/win7-coding-Agent` 干净工作树快进：`38ca46e` → `829ad39`（负责人验收收尾与已批准实现），无冲突；本条文档追加同样快进并入。冻结源/候选/正式报告未重绑，主工作树仍 alpha2，原有两处 ZIP 删除与 check.py 未改动；origin/main 未变，未推送。

## A9 第二批设计准备（2026-10-01）

依据负责人 2026-09-30 推进指令，追加第一批/WIN7-42 收尾和后续编号说明，形成
[helper v3 设计](plans/A9_HELPER_V3_STREAMING_PROTOCOL.md)、A9-30～32 三任务草稿和
[Shell 模拟 Demo](plans/a9-30-shell-streaming-demo/index.html)，ADR-0150～0152 保持 Proposed。
默认用户点击继续、第二批整批候选，暂定 WIN7-43，冻结前复查编号；构建实际阻塞才提出拆分裁决。
现有修改/删除/check.py 保留，未同步分支、提交、推送、构建或实机执行。产品实现须具体任务批准及允许路径/分支硬门。

## A9-30 实现授权登记（2026-10-01）

负责人明确指示“请批准 A9-30 和 ADR-0150，作为开始 Shell 实时输出实现的具体依据”。
据此将 [A9-30](tasks/A9_30_SHELL_STREAMING.md) 登记为 APPROVED_FOR_IMPLEMENTATION、ADR-0150 为 Accepted，
同步 helper v3 的 A9-30 设计状态及索引；范围、源码基线 c14a968、目标分支和精确白名单保持。
A9-31/A9-32、ADR-0151/0152 仍是草稿/Proposed。独立安全/依赖复核、原生构建、提交推送及候选门 A/B 不因本登记获代替授权。
本次仅更新批准记录，产品实现、原生构建、冻结和 Win7 验证尚未执行；保留现有工作区改动。

## 输出规范与术语表（2026-10-06）

负责人回复“按你的建议裁决，四层都做”。据此新增 [输出规范](OUTPUT_STYLE.md)、[术语表](GLOSSARY.md) 和 ADR-0190，
在 AGENTS.md §7、§8 和文档入口增加指针；生成 HTML 不等于渲染，渲染限制不变。
本次只修改文档，不改变任务状态、授权、候选或证据结论；保留现有工作区改动，未提交或推送。

## 输出规则自动加载与 DOCS_05（2026-10-06）

负责人回复“全部都做”。据此新增 ADR-0191：AGENTS.md §7 和 CLAUDE.md 写入五条核心写作规则，Claude 本机启用 output style；
[DOCS_05](tasks/DOCS_05_REPORT_VAGUE_WORDING_CHECK.md) 为日期不早于 2026-10-06 的报告增加 W05 模糊词检查，16/16 测试通过，任务 COMPLETE。
仅开发机执行，不涉及产品、Win7 或候选；未提交或推送。

## STATUS 第二批行修订前原文（2026-10-06）

负责人授权修正 STATUS 过期正文。执行代理改写当前工作项表 A9-30～32 行，补充功能分支状态指向；不改任何结论或证据。修订前原文：

| A9-30～32 第二批执行能力 | A9-30 `APPROVED_FOR_IMPLEMENTATION`（2026-10-01）；A9-31/A9-32 `DRAFT_READY_FOR_REVIEW`；产品实现未开始 | [A9-30](tasks/A9_30_SHELL_STREAMING.md)、[A9-31](tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)、[A9-32](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md)、[helper v3](plans/A9_HELPER_V3_STREAMING_PROTOCOL.md)，ADR-0150 Accepted，ADR-0151/0152 Proposed | A9-30 按批准基线/分支/白名单开展；独立安全/依赖复核、D-013 v26/新原生 API 登记与构建授权仍须完成。A9-31/A9-32 另行批准；第二批整批暂定 WIN7-43，冻结前核号，Win7 `NOT_PERFORMED` |

## 2026-10-06 DOCS_06 本地治理同步

检查器、规则和任务生命周期的本地结果集中于[统一执行记录](plans/GOVERNANCE_OPTIMIZATION_EXECUTION_RECORD.md)。原合同状态、候选和历史证据不改判。


## 2026-10-07：A＋r4工具改造承接材料

负责人要求按推荐继续。[ENGINEERING_02](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md)及ADR-0194草案在开发机准备。
基线codex/a9-alpha2@a53c9b9d…；r4 source 8d207ab1…/ZIP e96fdf96…。
状态DRAFT_READY_FOR_REVIEW；本轮只写文档，远端、UI、编译和产品执行NOT_PERFORMED。
原observer EXE本地未取得，部署BLOCKED，恢复路径见任务§6。原产品与候选结论不重签。

## 2026-10-07：ENGINEERING_02 本地实现与定向检查

负责人明确批准§3–7及ADR-0194的本地范围。任务登记APPROVED_FOR_IMPLEMENTATION，ADR Accepted。
codex/a9-alpha2@a53c9b9d…新增十个工具/测试文件；输入分层、双身份、四版消费者、真实Renderer和重启entry已接入。
开发机Node20.17.0最终17/17 PASS；三份CJS语法PASS。五次检查及早期输入保留。
实际SYNC预检旁路已补授权门。有当前绑定也在派发前拒绝目标动作。
任务保持APPROVED_FOR_IMPLEMENTATION，phase为ENGINEERING_02_LOCAL_CHECKS_PASS_PENDING_WIN10。
准确文件、SHA、回放、计时和恢复条件沿用[任务§11](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#11-本地实施结果与恢复条件2026-10-07)。
observer EXE本地缺字节，部署BLOCKED。Win10/PS5.1/真实UI/普通产品/Win7均NOT_PERFORMED。
历史候选、冻结工具、首失败和UNKNOWN/HALTED保持；无远端、编译、Git交付、删除或权限动作。

## 2026-10-07：ENGINEERING_02 Win10批准与连接阻断

负责人批准上一条“在Win10独立编译observer、先准入工具再验证不变r4”的建议。
执行代理保留批准，沿用原任务[§12](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#12-win10后续批准连接阻断与本地准备2026-10-07)记录准确目标、角色、新根、预算与恢复条件。
获联网权限后，原SSH入口返回No route to host；UU只读设备状态显示指定Win10主机离线。
Phase-Gate登记ENGINEERING_02_WIN10_PREFLIGHT_BLOCKED；未确认主机身份、未远端写入或启动任何Win10进程。
独立编译的原源码、编译器/引用锁与七件工具快照已在本地准备；源码未改。
编译、目标准入、产品与真实点击NOT_PERFORMED。需要负责人让同一Win10主机上线并恢复SSH可达。
同范围批准保持，恢复后从身份预检继续；不改历史PASS、首失败或HALTED/UNKNOWN。

## 2026-10-07：ENGINEERING_02 Win10上线后SSH连接拒绝

负责人报告Win10已在线。执行代理以原批准恢复严格SSH及UU只读状态核对。
UU确认指定主机在线；Administrator@192.168.1.4:22返回Connection refused，尚未获得主机身份。
原No route to host及离线记录保持；本轮结果另存resume-1，详见原任务§13。
预检仍BLOCKED。需要负责人确认同一机器当前地址/端口与Bitvise SSH Server状态。
未远端写入、编译、派发产品或修改服务/网络；同范围批准保留，Win10与Win7均NOT_PERFORMED。

## 2026-10-07：ENGINEERING_02 SSH恢复与独立构建

负责人要求重试。执行代理严格连接同一WIN-2JQ66JE4HTQ，地址仍为192.168.1.4:22。
BvSshServer直接读取为Running；未改服务、账户、网络或系统权限。
原工具链十件size/SHA匹配；新R2根中独立编译原C#快照一次。
新EXE SHA 3ae30252…、MVID 77def7b9…；38项CLR自检PASS，七件真实构建文件回收匹配。
实际PS5.1/Node16/Electron22/ABI110上的12组定向检查PASS；构造输入自检不计产品准入。
本地将真实新build代入现有消费者得到INTEGRITY_OBSERVER_BUILD，未删门或补造旧pin。
只读现有进程核对仅找到管理员Explorer：SID尾500、Session1、已提升、InJob=false。
Phase-Gate为ENGINEERING_02_WIN10_COMPONENT_AND_DESKTOP_BLOCKED。
具体材料见[原任务§14–15](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#14-win10重试编译与直接检查2026-10-07)。
ADR-0195登记Proposed；新格式及当前Session绑定规则待负责人裁决，未实施。
普通桌面须由负责人恢复；新dispatcher仍要直接核验身份及Job，不能继承Explorer结果。
自动审批拒绝完整历史绑定上传，执行代理改为本地诊断，未重试该上传。
所有错误包装与首次失败另存resume-2；原失败、HALTED/UNKNOWN及候选未改。
ETW完整准入、普通产品、真实点击、Win7及Git交付均NOT_PERFORMED。


## 2026-10-07：ENGINEERING_02 §15批准与新工具本地验证

负责人批准§15及ADR-0195，并请求帮助切换账户。批准原文及SHA保留在resume-3。
九路径接入schema3真实构建、当前Session及新运行关联；开发机22/22定向检查PASS。
原schema2、历史build/pin/批准及Native证明体保留；真实新scope未伪装为旧pin。
UU连接请求成功，但计算机控制工具拒绝访问窗口；账户登录需负责人完成。
09:13:39 UTC现有Explorer仍为SID尾500、Session1、已提升。
自动审批拒绝新七件工具及两件输入上传；没有创建新目录或上传这份载荷，没有重试该动作。
准确文件、SHA及需确认的外发范围沿用[任务§16](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#16-15批准与账户切换协助2026-10-07)。
Phase-Gate为ENGINEERING_02_WIN10_TRANSFER_AND_DESKTOP_BLOCKED。
Win10新消费者、完整ETW准入、普通产品、真实退出点击、Win7及Git交付均NOT_PERFORMED。

## 2026-10-07：ENGINEERING_02 当前普通桌面与新工具定向检查

负责人自行切换a9builder。Win10只读实测确认console Session2运行中。
实际Explorer为SID尾1005、Medium、未提升、InJob=false；新dispatcher身份仍NOT_PERFORMED。
负责人明确确认同一Win10可信及准确九件载荷外发，正常工具审批允许上传。
当前静态输入SHA822856c4…，七件源码摘要6c6fca8f…；远端九件size/SHA核验PASS。
实际PS5.1/Node16新版14组定向检查PASS，完整工具准入、产品和ETW未执行。
Phase-Gate为ENGINEERING_02_WIN10_DIRECTED_CHECKS_PASS_PENDING_ADMISSION。
准确结果、费用、权限与剩余项沿用[任务§17](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#17-普通账户实测外发确认与新版win10定向检查2026-10-07)。
原管理员诊断、审批拒绝、首失败、旧快照及全部历史结论保留。
Win7、Git交付、删除与系统权限操作均NOT_PERFORMED。


## 2026-10-07：ENGINEERING_02 七项准入、Boot与短后台硬门

Win10验收机七项直接工具准入PASS，checks SHA为8dab9887…。
实际普通dispatcher为PID15536、Session2、Medium、未提升、无Job。
真实SYNC CLI及Boot直接证据PASS；r4包和工具源码未改。
短Background run f49752aa…返回FAIL，worker和dispatcher保持HALTED。
capture发现子早于当前父约200秒；旧父身份UNKNOWN，PID复用为推断。
observer另报DUPLICATE_START_PID，终态NOT_PROVEN；自有会话已关闭。
首失败281件已回收并核验，正常收尾FAIL；单实例恢复另待负责人裁决。
当前Phase-Gate为ENGINEERING_02_R2_TOOL_ADMITTED_PRODUCT_HALTED。
准确结果及拟扩展12路径的修复方案沿用[任务§18–19](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#18-七项准入与最短产品链路执行2026-10-07)。
ADR-0196登记Proposed，未批准C#、新build或R3远端动作。
全部后续产品派发、真实退出response、Win7及Git交付均NOT_PERFORMED。
原HALTED/UNKNOWN、候选、历史结果及Accepted ADR正文保留。


2026-10-07后补收尾：负责人批准仅结束本轮测试PID5632。
执行代理重新核验准确创建时间、路径、哈希及普通身份后完成单实例强制退出。
10:48:29.993 UTC当前快照未见九个已知PID，自有会话查询为4201。
这不是正常产品收尾PASS；原FAIL、HALTED、UNKNOWN与NOT_PROVEN保持。
新组件及R3仍未批准，后续产品派发继续停止。

## 2026-10-07 — ENGINEERING_02 本地取证组件修复

负责人批准§19与ADR-0196，仅12路径本地实现和定向检查。
执行代理保留codex/a9-alpha2@a53c9b9d…及原dirty/untracked。
capture按完整双观察排除明确非父子关系；observer按PID＋创建FILETIME关联代次。
构建生产者及实际消费者绑定新来源，R3执行授权保持关闭。
开发机28/28定向检查PASS，原生编译、Win10准入与产品重试NOT_PERFORMED。
原第66项缺新父START，UNKNOWN保留；原R2 HALTED不恢复。
记录沿用[ENGINEERING_02 §20](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#20-取证组件本地修复批准与执行2026-10-07)。

## 2026-10-07 — ENGINEERING_02 R3两组件编译与自检

负责人批准准确冻结载荷的Win10组件编译与自检。
严格SSH直接核验身份、PS5.1/CLR4、十件依赖与fresh R3。
73件host复制、12件载荷核验和五件PS5.1解析PASS。
capture一次编译及真实查询1项PASS。
observer一次编译及CLR自检43项PASS。
两编译器退出码0，14件原始结果size/SHA核验PASS。
新DLL SHA为9a205e4c…；新EXE SHA为94472c18…。
开发机当前输入绑定生成FAIL；字段顺序比较误拒真实编译输出。
最小反例已保存，未改原build、scope或冻结工具。
Phase-Gate为ENGINEERING_02_R3_COMPONENT_SELF_TEST_PASS_BINDING_BLOCKED。
本轮不启动产品、ETW或GUI，不恢复R2 HALTED。
准确结果与下一步身份合同差异见[任务§21](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#21-两件组件win10编译与自检2026-10-07)。

## 2026-10-07 — ENGINEERING_02 报告绑定与构建验证器身份修复

负责人回复“批准”，仅本地修报告比较和准确构建身份合同。
ADR-0197为Accepted，原Accepted ADR正文保持。
开发机两个真实反例在原实现FAIL，修复后30项定向检查PASS。
原R3 build、scope、工件及原验证器分别绑定为INHERITED_EVIDENCE。
真实CLI生成v4输入绑定89a5b7ac…，原报告未重排或改写。
新工具digest d9c1bf26…，两件实际PS消费者识别v3/v4。
本轮未连接远端，不重编、不启动产品或ETW，不恢复R2 HALTED。
新工具目标准入和Win7均NOT_PERFORMED。
当前Phase-Gate为ENGINEERING_02_LOCAL_REPORT_BINDING_REPAIR_COMPLETE_TARGET_ADMISSION_NOT_PERFORMED。
准确本地结果、12件下一步载荷与批准边界见[任务§22](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#22-报告比较与构建验证器身份修复2026-10-07)。

## 2026-10-07 — ENGINEERING_02 新v4工具Win10解析与只读CLI检查

负责人批准准确12件657442字节上传与固定解析/CLI检查。
执行代理通过严格SSH核验可信Win10、当前Administrator身份与host字节。
只创建并写入R3的tool-checks/current-v4新目录。
12件文件执行前后size/SHA与批准清单一致。
实际PS5.1、Node16.17.1/Electron22.3.27/ABI110直接核验PASS。
五件PS解析、三件CJS语法与三项中央CLI PASS。
七件Node均exit=0，按PID/原生creation ticks复核原实例已结束。
实际状态为CURRENT_V4_PARSE_CLI_PASS_NOT_RUNTIME_ADMISSION。
roles仍为空，未启动产品、ETW、GUI或编译器，未恢复R2 HALTED。
原组件构建证据为INHERITED_EVIDENCE，不改签原build/scope或Accepted ADR。
实现源码、候选、原失败和UNKNOWN保持。
当前Phase-Gate为ENGINEERING_02_WIN10_V4_PARSE_CLI_PASS_RUNTIME_ADMISSION_NOT_PERFORMED。
当前取证工具实际能力准入、产品和Win7为NOT_PERFORMED。
准确批准与直接Win10证据见[任务§23](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#23-新v4工具win10解析与只读cli检查2026-10-07)。

## 2026-10-07 — ENGINEERING_02 当前取证实际能力准入准备

负责人批准承接§23后的具体准入准备。
执行代理形成[任务§24](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#24-当前取证工具实际能力准入计划2026-10-07)与ADR-0198 Proposed。
当前中央门仍拒绝R3实际运行，不能通过LibraryOnly跳过门证明准入。
拟改七路径，新增专用角色/操作，R4运行与原R3构建分别绑定。
产品派发继续拒绝；原七项准入不减少，旧证据与HALTED保持。
本轮只写计划和ADR，不登记新增实现批准，不连接远端。
准确远端载荷准备为NOT_PERFORMED。
实现、ETW、产品及Win7为NOT_PERFORMED。
当前直接结果仍是§23的Win10 v4解析/CLI PASS。


## 2026-10-07 — ENGINEERING_02 取证专用入口本地实施

负责人批准§24.2–24.5与ADR-0198的七路径本地范围。
执行代理完成[任务§25](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#25-当前取证专用门与编排入口本地实施2026-10-07)。
开发机Node20.17.0定向检查40项PASS，1430.804833 ms。
当前工具digest7d42665c…、准备输入SHA7c67af7d…分别冻结。
专用角色/操作、当前上下文、真实消费者与同轮回执分别绑定。
输入和工具按SHA区分，原R3构建身份与字节保持。
历史失败、首失败、HALTED、UNKNOWN与原设备证据不改判。
新准备roles为空，产品门拒绝，没有远端批准。
执行代理形成25件上传、861件只读复制及固定操作材料。
本轮Win10连接、查询、ETW、普通桌面、产品与Win7为NOT_PERFORMED。
任务保持APPROVED_FOR_IMPLEMENTATION，未登记COMPLETE。
未提交、推送、合并、发布、删除或改系统权限。


## 2026-10-08 — ENGINEERING_02 新v5工具Win10首失败与入口路径修复

负责人批准25件外发、861件只读复制及固定取证准入。
执行代理登记五字段输入，27件878206字节上传与861件来源复制PASS。
可信Win10身份、PS5.1、Node16、六件PS解析、三件CJS语法与五项CLI PASS。
真实AdminQuery在LibraryOnly的launcher目录完整性检查FAIL。
原run c56ee5173aa94c8fbb005d056a9109c3、输入5dafc766…与首FAIL保持。
原PID29652、creation ticks639269935354561850已结束，未启动ETW或产品。
执行代理在§24.2获准范围修serve与对应测试，开发机40项定向检查PASS。
新工具e3edafc9…、准备输入54189419…冻结，roles为空，远端尚未批准。
下一步为一件变化脚本、十件精确复制与新输入转换，旧版本不覆盖。
修复版Win10、普通桌面、产品和Win7为NOT_PERFORMED。
准确证据、材料与恢复条件见[任务§26](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#26-新v5工具win10首失败与入口路径修复2026-10-08)。
当前Phase-Gate为ENGINEERING_02_V5_FIRST_FAIL_LOCAL_LAYOUT_REPAIR_PASS。
未登记COMPLETE，未提交、推送、合并、发布、删除或改系统权限。


## 2026-10-08 — ENGINEERING_02 第二次入口失败与只读最小诊断

负责人批准精确材料5d8b201e…，并要求通俗说明当前工作。
执行代理用输入5ee5f5b5…完成三件外发、十件复制及875件只读复用核验。
Win10六件PS解析、三件CJS语法、五项CLI与八件Node退出0 PASS。
原launcher路径门已通过，AdminQuery在scope读取处再次FAIL。
原run36d0207ad2484f1a8442ec153a464800、0aa38d08…结果与aaf9a26a…上下文保持。
原PID24584、creation ticks639270160318753971已结束，ETW与产品未启动。
第二次同类入口失败停止整批，共同根因为新目录/记录类型与旧消费者规则冲突。
执行代理完成专用读取器本地修复，40项开发机检查PASS。
新d906de71…工具与a672ce19…准备输入冻结，roles为空，实际PS5.1行为NOT_PERFORMED。
下一步准确只读材料4fc700e4…不加载组件、不开放原生角色或第三批能力准入。
准确证据、解释与恢复条件见[任务§27](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#27-第二次真实入口失败与只读最小诊断2026-10-08)。
当前Phase-Gate为ENGINEERING_02_SECOND_ENTRY_FAIL_LOCAL_SCOPE_REPAIR_PASS。
本轮无人工桌面动作，产品和Win7为NOT_PERFORMED。
未登记COMPLETE，未提交、推送、合并、发布、删除或改系统权限。


## 2026-10-08 — ENGINEERING_02 Win10只读范围读取器通过

负责人批准准确只读材料4fc700e4…，执行代理在原R4完成检查。
新工具d906de71…、闭合输入a672ce19…绑定五项读取与拒绝检查，Win10直接PASS。
准确三件外发333160字节、十件复制367560字节及六件PS解析PASS。
正向PID12128和负例PID26780的creation ticks已绑定，均ENDED_PID_ABSENT。
最后十一件工具与两件输入size/SHA保持，roles为空、remote_approval为null。
本轮未加载取证组件、运行实际AdminQuery、ETW、普通canary或产品。
原两次FAIL保持，原一次修复重试次数已用完，整批仍停止。
执行代理提出ADR-0199及单次准确恢复材料ec6fafdf…，尚未获准。
准确执行与待裁决边界见[任务§28](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#28-win10只读范围读取器通过与单次恢复提案2026-10-08)。
当前Phase-Gate为ENGINEERING_02_WIN10_READONLY_SCOPE_READER_PASS_NATIVE_ADMISSION_NOT_PERFORMED。
本轮无人工桌面动作，产品和Win7为NOT_PERFORMED。
未登记COMPLETE，未提交、推送、合并、发布、删除或改系统权限。


## 2026-10-08 — ENGINEERING_02 ADR-0199单次恢复批准

负责人回复“批准”，批准材料ec6fafdf…及ADR-0199的一次固定能力恢复。
执行代理生成新输入3db7f49a…与scope 9b30fdc7…，两件共255988字节。
除execution_scope派生批准字段外，与准备输入一致。
原a672ce19…闭合输入、d906de71…工具与R3原构建保持。
本地初次生成因SCOPE_OUTPUT拒绝，规定outputs目录的新生成PASS。
该错误在远端连接和能力执行前发生，原错误保存，校验器未改。
准确范围见[任务§29](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#29-adr-0199单次win10能力恢复2026-10-08)。
当前Phase-Gate为ENGINEERING_02_ADR0199_ONE_NATIVE_BATCH_AUTHORIZED。
当前实际能力、ETW、普通桌面、产品与Win7为NOT_PERFORMED。
每Mode至多一次，失败即停，不自动重试。
未提交、推送、合并、发布、删除或改系统权限。


## 2026-10-08 — ENGINEERING_02查询和ETW通过，普通入口执行策略失败

负责人批准ADR-0199准确恢复，执行代理用d906de71…工具和3db7f49a…输入执行。
Win10真实AdminQuery run38195d28…和Observer Admit run98fbde26…直接PASS。
自身ETW session b80d5ef8…已关闭，丢事件为0，六个相关实例已结束。
十件原始事件和报告14163字节已收集，size/SHA一致。
CanaryCreate runc0e55366…生成两件管理员canary和548字节固定CMD。
负责人普通打开一次，截图显示PowerShell脚本执行策略拒绝，首FAIL保持。
普通claim和回执不存在，harness未进入，CanaryVerify未执行，批次已停止。
只读诊断确认管理员CurrentUser RemoteSigned，普通已加载配置无个人策略项。
普通失败进程的实际有效策略、token和PID为UNKNOWN，不借管理员证据补签。
执行代理提出ADR-0200及准确两路径本地计划b1adc696…，未获批准或实施。
准确结果见任务§29，修复计划见§30；原候选、旧失败、HALTED与UNKNOWN保持。
当前Phase-Gate为ENGINEERING_02_ADMIN_QUERY_OBSERVER_PASS_ORDINARY_POLICY_ENTRY_FAIL。
产品与Win7为NOT_PERFORMED，未提交、推送、合并、发布、删除或改系统权限。


## 2026-10-08 — ENGINEERING_02 ADR-0200两路径本地批准

负责人回复“批准”，批准材料b1adc696…及ADR-0200的本地修复与定向检查。
准确范围为forensic-admission.ps1和win10-entry.test.mjs，不连接远端。
实际分支codex/a9-alpha2@a53c9b9d…及已有dirty保持，原失败先保存。
本轮不改持久策略、原生构建、产品或系统，不重试旧普通CMD。
实际交付沿用任务§31，当前实现与定向检查NOT_PERFORMED。
当前Phase-Gate为ENGINEERING_02_ADR0200_LOCAL_POLICY_REPAIR_AUTHORIZED。


## 2026-10-08 — ENGINEERING_02普通过程策略本地修复完成

负责人批准ADR-0200两路径本地修复，执行代理完成固定CMD和加载前策略门。
开发机Node20.17.0定向检查42 PASS、0 FAIL、0 SKIP，1537.015917 ms。
原缺策略参数和缺门反例保持，PS谓词检查为SURROGATE，不计PS5.1实测。
新工具bea1ec92…、闭合输入3a7f1ad7…与scope 93c9dab0…冻结，无执行角色。
只有forensic-admission.ps1变化，20714字节、SHA c13343f8…。
产品、原组件、构建验证器及原R3报告未变，不重编或改签。
本轮未连接远端、执行实际策略、重开CMD、启动产品或Win7。
准确远端材料74cb19bf…拟三件外发276702字节、十件复制425793字节，尚未批准。
先做PS5.1实际策略正反例，再以新输入、新run进入一次有界能力批次。
准确结果与边界见任务§31，原普通入口FAIL及旧完整性FAIL、HALTED和UNKNOWN保持。
当前Phase-Gate为ENGINEERING_02_LOCAL_POLICY_REPAIR_PASS_WIN10_NOT_PERFORMED。
未登记COMPLETE，未提交、推送、合并、发布、删除或改系统权限。

## 2026-10-08 — ENGINEERING_02准确策略与取证批次批准

负责人回复“批准”，批准材料74cb19bf…的一次准确远端批次。
新批准输入b36841e0…与scope f20dc2be…仅开放两项取证角色。
有效期01:57:14至03:57:14 UTC；产品执行未开放，不自动重试或续期。
三件外发276702字节，十件工具CreateNew复制425793字节。
执行沿用任务§32，原FAIL、HALTED、UNKNOWN、旧工具及候选保持。
当前Phase-Gate为ENGINEERING_02_ONE_POLICY_CAPABILITY_BATCH_AUTHORIZED。
目标检查NOT_PERFORMED，任务未登记COMPLETE。

## 2026-10-08 — ENGINEERING_02新输入策略、查询和ETW直接通过

材料74cb19bf…准确批准后外发三件、复制十件，原875件只读字节核验PASS。
新输入b36841e0…绑定bea1ec92…工具，产品与原R3组件构建身份分开保持。
Win10六件PS5.1解析、Node16当前CLI及策略正反例PASS，相关实例已结束。
AdminQuery run 268f9ed1…与Observer run ea4e1bf4…直接PASS，原始证据和自身收尾保持。
新CanaryCreate run f4f2a768…生成578字节固定CMD，SHA 84fb1cae…，producer已结束。
已请负责人关闭旧失败窗口并从a9builder Explorer普通打开新CMD一次。
普通身份、自己的子进程和双向canary待回执；CanaryVerify NOT_PERFORMED。
准确事实见任务§32，原FAIL、HALTED和UNKNOWN不改判。
当前Phase-Gate为ENGINEERING_02_POLICY_QUERY_OBSERVER_PASS_PENDING_ORDINARY。
产品、Win7及完整七项工具准入NOT_PERFORMED，未登记COMPLETE或执行Git交付。

## 2026-10-08 — ENGINEERING_02普通身份已进入，捕获首失败停止下游

负责人确认关闭旧失败窗口并普通打开准确578字节新CMD一次。
新输入b36841e0…的Ordinary run 5f2d4797…实际绑定a9builder、Session2及Explorer链。
能力FAIL，错误LIFECYCLE_OWN_CHILD_CAPTURE，原owned_lifecycle为UNKNOWN。
当前父子实例后来只读核验均已结束，原FAIL和UNKNOWN不改判。
CanaryVerify及全部依赖下游停止，无入口重试或强制结束。
同一输入的查询、Observer与策略正反例直接PASS分别保留，不提升为完整工具准入。
失败瞬间的Capture数量和条目未记录，具体断言分支UNKNOWN。
执行代理形成ADR-0201 Proposed和任务§32.5两路径本地诊断提案，未实施或登记批准。
当前Phase-Gate为ENGINEERING_02_ORDINARY_CAPTURE_FAIL_DOWNSTREAM_STOPPED。
产品、Win7、完整七项工具准入和Git交付NOT_PERFORMED，任务未登记COMPLETE。

## 2026-10-08 — ENGINEERING_02两路径本地捕获诊断批准

负责人回复“批准”，批准材料f471f7b8…及ADR-0201的两路径本地诊断。
执行代理保存原源码、已有证据和实际分支HEAD后实施。
当前Phase-Gate为ENGINEERING_02_LOCAL_CAPTURE_DIAGNOSTIC_AUTHORIZED。
Win10新字节、普通重试、CanaryVerify、产品、原生重编及Git交付未开放。
实际交付沿用任务§33，原Win10 FAIL和UNKNOWN保持。

## 2026-10-08 — ENGINEERING_02两路径本地捕获诊断完成

负责人批准ADR-0201两路径本地诊断，执行代理完成真实调用点的固定字段记录。
原捕获断言、8秒预算、身份及完整性门保持，原生组件和r4产品不变。
开发机Node20.17.0为45 PASS、0 FAIL、0 SKIP；投影与谓词检查明确SURROGATE。
新工具3731ea93…、准备输入b4dfda8a…与scope f6872761…冻结，无执行权限。
本轮没有连接Win10，新真实PS5.1与普通诊断NOT_PERFORMED。
新材料5c2d8dfd…明确四件外发285162字节、十件副本425793字节及最小诊断顺序。
完整Encoded模板超限在本地保留，增加一件准确执行材料到未来批准范围，短派发保持7600上限。
旧查询/ETW仅适用条件继承，本拟议批次不执行AdminQuery、Observer、CanaryVerify或产品。
当前Phase-Gate为ENGINEERING_02_LOCAL_CAPTURE_DIAGNOSTIC_PASS_WIN10_NOT_PERFORMED。
实际结果见任务§33，原FAIL、UNKNOWN、旧回执及HALTED保持。
准确远端材料待裁决；未登记COMPLETE或执行Git交付、删除、重编及系统变更。

## 2026-10-07 — ENGINEERING_02准确Win10最小捕获诊断批次批准

负责人回复“批准”，绑定27603字节的材料5c2d8dfd…。
UTC授权窗口为2026-10-08T02:52:51.000Z至04:52:51.000Z，不自动续期。
负责人时区America/Los_Angeles为10月7日19:52:51至21:52:51。
批准输入317d1a04…和scope 9a2cfcb8…准确冻结，其余原字段保持。
仅开放四件外发、十件独占复制、当前运行时检查、一次CanaryCreate和一次普通Capture诊断。
先核验现场前置条件，当前新工具PS5.1及普通结果仍NOT_PERFORMED。
AdminQuery、Observer、CanaryVerify、产品及Win7不在本批执行范围。
当前Phase-Gate为ENGINEERING_02_MINIMAL_CAPTURE_DIAGNOSTIC_REMOTE_AUTHORIZED。
执行记录沿用任务§34和resume-18；旧FAIL、UNKNOWN、HALTED及Accepted ADR正文保持。

## 2026-10-07 — ENGINEERING_02最小诊断运行时前置完成，等待普通桌面

Win10新输入317d1a04…和工具3731ea93…准确上传、闭包及875件复用字节PASS。
PS5.1六件工具/固定producer解析、Node16五项CLI与完整scope核验PASS。
六件实际PS函数SURROGATE反例及上限/CreateNew检查PASS，producer准确实例已结束。
CanaryCreate仅一次，run26ac87d2…，新CMD578字节SHA b3594aef…，五件准备字节保存。
真实准备生产实例已结束；Native捕获和新普通诊断仍NOT_PERFORMED。
等待负责人关闭旧失败pause窗口，从a9builder Explorer普通打开新CMD一次。
当前Phase-Gate为ENGINEERING_02_MINIMAL_CAPTURE_DIAGNOSTIC_WAIT_ORDINARY_DESKTOP。
原判据、预算及旧FAIL/UNKNOWN保持，不执行AdminQuery、Observer、CanaryVerify或产品。
本地显示器和CMD期待值错误独立保存并按原回执修正，未重复远端操作。

## 2026-10-07 — ENGINEERING_02真实普通捕获合同首失败已解释

负责人确认关闭旧窗口并普通打开新26ac87d2…入口一次。
Ordinary run a6ac0a9c…绑定317d1a04…输入和3731ea93…工具。
真实a9builder SID1005、Session2、RID8192、普通非提升且非Job及Explorer链满足。
capability a059b70d…仍FAIL LIFECYCLE_OWN_CHILD_CAPTURE，owned_lifecycle UNKNOWN保持。
真实断言前诊断1958字节SHA 0dbde491…记录Added2、Gaps0、Excluded0。
自己的PowerShell7752和直接conhost26240均Ownership PROVEN，父代次及同卷NT路径准确。
当前harness及中央消费者都要求集合总数1，确认为本次失败分支。
原生缺陷尚无证据；旧无诊断失败不补签成当前原因。
后来只读核验父11200及两件子实例均ENDED_PID_ABSENT，未强制结束或改写原UNKNOWN。
ready存在、release及普通reference不存在；下游、产品和完整准入NOT_PERFORMED。
本批停止，不再整批重试，不恢复旧输入/claim/CMD。
本地回放当前真实诊断确认旧判据拒绝，明确SURROGATE，未修改实现。
四路径本地合同修复提案见任务§35及ADR-0202 Proposed，材料628e4803…尚未批准。
当前Phase-Gate为ENGINEERING_02_ORDINARY_CAPTURE_CONTRACT_FAIL_DOWNSTREAM_STOPPED。
原生/产品身份、Accepted ADR正文、历史证据及首失败保护保持。

## 2026-10-07 — ENGINEERING_02四路径本地捕获集合合同批准

负责人批准5682字节材料628e4803…、任务§35及ADR-0202。
四件源码及原提案准确SHA匹配，执行代理保存修改前字节和全部原证据。
当前Phase-Gate为ENGINEERING_02_LOCAL_CAPTURE_SET_CONTRACT_AUTHORIZED。
只实施本地夹具/中央回执合同及两个检查文件，不开放远端/原生重编/产品或Git交付。
当前Win10真实FAIL及UNKNOWN保持，本地检查不提升为Win10 PASS。

## 2026-10-07 — ENGINEERING_02四路径本地捕获集合合同完成

负责人批准§35与ADR-0202，执行代理完成PS夹具、中央消费者及两个检查文件。
准确PowerShell根一件、可选直接conhost零或一件，完整集合逐件身份/时间/路径及退出证明。
capture_set版本1拒绝额外进程、UNKNOWN及旧形状，原8秒预算及全部held关闭保持。
开发机v20.17.0定向47 PASS、0 FAIL、0 SKIP，1692.857375 ms；原始两条回放补值明确SURROGATE。
首轮actual_pid绑定缺口已精确修复，所有原红证据保留，不补写原Win10退出事实。
新工具a946a700…、准备输入d9bc1bd2…、紧凑scope f4f6e266…冻结，无角色/远端批准/产品权限。
本轮无远端动作，新PS5.1与真实普通生命周期NOT_PERFORMED，原生及r4产品身份不变。
准确下一材料803593bf…为20015字节，五件外发393016字节、九件副本326797字节，未批准。
拟目标运行时先行、CanaryCreate/普通一次后收集并停止，不执行AdminQuery/Observer/CanaryVerify/产品。
当前Phase-Gate为ENGINEERING_02_LOCAL_CAPTURE_SET_CONTRACT_PASS_WIN10_NOT_PERFORMED。
结果沿用任务§36及resume-19；Accepted ADR正文、首失败、UNKNOWN和历史工作树保持。
未登记COMPLETE，不提交/推送/合并/发布/删除/改变系统权限。

## 2026-10-07：ENGINEERING_02 完整捕获集合最小Win10批次获准

负责人批准准确材料803593bf…，五件外发与九件独占副本。
新输入f3d318b4…及scope 4dc07ad9…冻结，产品权限false。
执行代理只推进实际运行时检查、新CanaryCreate及普通入口一次。
有效窗口2026-10-08T03:24:17.000Z至05:24:17.000Z，不自动续期。
本批即使部分PASS也停止，不执行AdminQuery、Observer、CanaryVerify或产品。
准确边界及结果沿用[任务§37](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#37-win10完整捕获集合最小批次批准2026-10-07负责人时区)。

Win10本批解析、中央CLI与分类反例PASS；三件SURROGATE不计真实普通PASS。
CanaryCreate一次完成，生产实例9480准确代次已结束。
新run 6af78227…、CMD578字节SHA a1ed46e1…已核验。
当前Phase-Gate为ENGINEERING_02_WIN10_CAPTURE_SET_WAITING_ORDINARY_ENTRY。
负责人需从a9builder Explorer普通打开新CMD一次，管理员SSH不能代替父链。
真实普通及完整准入、产品、Win7仍NOT_PERFORMED，旧FAIL/UNKNOWN/HALTED保持。

2026-10-08T03:36:10Z只读观察：当前f3d318b4…尚无Ordinary claim/reference。
该观察没有启动或重试入口，普通运行NOT_PERFORMED。
完整目标及七项准入、产品链路、回归、退出语义的缺口核对追加于任务§37.3。
下一动作仍依赖负责人普通桌面操作；本批不扩大下游权限。

同一负责人入口阻断连续三个目标回合，目标登记BLOCKED。
首轮有实际进展，上一轮未改变下一动作；本轮未重复控制器或派发入口。
最后实机观察为03:36:10Z无当前claim/reference，不补签实时状态。
所需帮助及恢复条件见任务§37.4；完整目标保留，任务未登记COMPLETE。

## 2026-10-07：ENGINEERING_02 完整普通集合已取证，输出首失败停止

负责人确认已点击，执行代理只收集当前Ordinary回执，不重开入口。
新run b374fdb8…绑定f3d318b4…/a946a700…，真实a9builder普通身份和Explorer链满足。
PowerShell18888及conhost6876全部同实例、exit0及held证明满足。
当前结果7a0da4e9…仍FAIL：OWN_CHILD_STDERR；具体输出未保存，内容UNKNOWN。
父21804及两个自有实例均已结束，close_errors为空，无强制退出。
reference不存在，已按803593bf…批次收集后停止，全部依赖下游NOT_PERFORMED。
当前Phase-Gate为ENGINEERING_02_WIN10_ORDINARY_STDERR_DIAGNOSTIC_BLOCKED。
沿用任务§37.5–6登记事实，§38及ADR-0203 Proposed申请两路径本地有界输出诊断。
机器材料4891字节、SHA d30bbbdc…，未批准、未实施、无新远端或产品权限。
原Accepted ADR正文、源码、产品、原生构建身份及旧FAIL/UNKNOWN/HALTED保持。

## 2026-10-07：ENGINEERING_02 两路径输出诊断本地完成

负责人批准§38、ADR-0203及准确材料d30bbbdc…，ADR已登记Accepted。
执行代理保存原两件源码、原提案与当前Win10首FAIL后实施。
当前分支codex/a9-alpha2@a53c9b9d…，已有dirty/untracked保持。
诊断绑定当前输入/工具/组件/run/parent/child，仅保存自己的解码文本。
每流4096个UTF-16 code unit，不拆代理对，截断完整hash UNKNOWN。
原非空stderr、4096输出门、8秒预算及全部held退出/关闭保持。
开发机54 PASS、0 FAIL、0 SKIP，开发机无PS，不代签PS5.1。
新工具6f91b239…和无角色输入0978bd45…冻结，产品权限false。
旧Win10结果仍FAIL OWN_CHILD_STDERR，原具体文本UNKNOWN。
原产品、原生构建来源及旧FAIL/UNKNOWN/HALTED保持。
本轮未连接或上传，产品和Win7均NOT_PERFORMED。
下一准确远端材料22117字节SHA 8c372d3e…，当前未批准。
四件外发293348字节和十件副本429466字节，拟只准入及普通诊断一次。
具体结果、合同差异、停止/恢复和人工参与沿用[任务§39](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#39-两路径输出诊断本地执行2026-10-07)。
工具返工、本轮产品未执行、下一审批等待及人工打开需求分项记录。
当前Phase-Gate为ENGINEERING_02_LOCAL_STREAM_DIAGNOSTIC_PASS_WIN10_NOT_PERFORMED，整个任务不登记COMPLETE。

## 2026-10-07：ENGINEERING_02 最小输出诊断远端批准

负责人批准准确材料8c372d3e…，四件外发293348字节及十件副本429466字节。
新输入e3741db5…及scope 74503662…冻结，产品权限false。
窗口2026-10-08T04:13:18.000Z至2026-10-08T06:13:18.000Z，每项一次、收集后停止。
实际执行沿用[任务§40](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#40-win10有界输出诊断最小批次批准2026-10-07负责人时区)。
新目标检查当前NOT_PERFORMED，旧结果与产品/原生身份保持。

Win10本批实际前置、875件字节、四件外发及十件副本均PASS。
PS5.1解析、Node16五项CLI和PS5.1输出函数SURROGATE预检PASS。
三件9207字节预检原始文件已收集，准确生产实例19568已结束。
CanaryCreate一次完成，run bb4076b7…及578字节CMD fd87bd36…核验。
生产实例13632准确代次已结束，当前等待负责人普通桌面打开新CMD一次。
当前Phase-Gate为ENGINEERING_02_MINIMAL_STREAM_DIAGNOSTIC_WAIT_ORDINARY_DESKTOP。
真实普通及完整目标仍未完成，原FAIL/UNKNOWN/HALTED保持。

## 2026-10-07：ENGINEERING_02 当前普通输出已定位为CLIXML进度

负责人截图先显示旧入口claim碰撞；随后确认已开启新入口。
执行代理只读收集run e26d55f1…、输入e3741db5…及工具6f91b239…。
普通身份和Explorer链、root1/conhost1全部same-instance/exit0/held及关闭证明满足。
父12364、根11492和conhost17936准确实例后来均已结束，无强制退出。
当前结果62963754…仍FAIL OWN_CHILD_STDERR。
2483字节诊断5ba2ca1e…保存stdout标记及一件Completed CLIXML progress。
stderr376个UTF-16 code unit、重编码404字节，没有Error流对象。
原字节、乱码原文及具体发出模块UNKNOWN，不回填旧无诊断run。
原始回执、两份诊断、ready/release、四件canary和两件claim完整保存。
本批已收集后停止，不重试Mode或入口，不执行产品、Win7或原生重编。
下一§41/ADR-0204 Proposed仅申请两路径本地自有fixture进度偏好修复。
机器材料3972字节、SHA b2372099…，未批准、未实施。
原Accepted ADR、工具源码、产品/原生来源及旧FAIL/UNKNOWN/HALTED保持。
具体事实与人工/审批分类沿用[任务§40.2–3](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#402-当前普通输出首失败及收尾)。

## 2026-10-07：ENGINEERING_02 自有子fixture进度偏好本地修复

负责人批准§41、ADR-0204及3972字节材料b2372099…，仅本地两路径。
执行代理核验codex/a9-alpha2@a53c9b9d…及准确源码，保护已有修改。
新PS29780字节，SHA 0663b6b3…，只在自有固定子进程首句设置进度偏好。
其余fixture、argv、UTF8/drain、8秒、4096、非空stderr和held退出/close保持。
新增检查首红24 PASS/1 FAIL；修复后三套55 PASS/0 FAIL/0 SKIP。
新工具342d147b…及无角色输入7ada3eec…冻结，产品权限false。
开发机无PowerShell，新PS5.1和普通实际效果NOT_PERFORMED。
本轮不连接、上传、原生重编、产品或Win7。
原FAIL/UNKNOWN/HALTED、产品与原生构建来源保持。
下一准确远端材料26032字节，SHA e1889532…，尚未批准。
四件293044字节、十件副本429466字节；先固定child真实预检，再一次普通入口。
该预检属于管理员Session0，不能签普通桌面准入。
工具返工、产品执行、审批等待和人工介入沿用[任务§42](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#42-自有子fixture进度偏好的本地执行2026-10-07)。
当前Phase-Gate为ENGINEERING_02_OWN_CHILD_PROGRESS_FIX_DEVELOPER_VERIFIED。
整个任务未完成，不登记COMPLETE。

## 2026-10-08：ENGINEERING_02 本聊天批准与已执行最小批次核对

负责人回复“批准”，对应准确材料e1889532…。
执行代理发现§49已由另一记录执行者完成并停止本批。
本轮复算24件21068字节原回收数据，准确绑定c5ee27ad…和结果eaf1a26d…。
普通a9builder身份、Explorer链、root/conhost held退出及B1入口证明满足。
stdout为固定标记、stderr为空，原普通项为Win10直接PASS。
冻结verifyCapability本地重放PASS，不是新目标执行或中央回执。
首次预检策略拒绝及第二次调用成功均保留，不追认“每项一次”合同符合。
本轮未新连接、上传、实现、目标run或任务启动，不复用旧claim和B1。
当前任务元数据同步最新普通结果，原FAIL/UNKNOWN/HALTED保持。
自动新批次须准确新入口范围，完整准入及产品/Win7仍NOT_PERFORMED。
结果、恢复条件和四类工作沿用[任务§51](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#51-本聊天批准与已执行批次的核对2026-10-08)。

## 2026-10-08：ENGINEERING_02 B2单次入口准确本地方案

负责人再次回复“批准”，执行代理继续准备新入口及全准入的准确范围。
原ADR-0206不覆盖B2，当前未新增实现白名单或远端权限。
两路径本地方案及ADR-0207 Proposed沿用[任务§52](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#52-b2新批次自动入口的准确本地提案2026-10-08待负责人裁决)。
机器材料8559字节，SHA2f97c195…；固定范围3749字节，SHA80f38afb…。
桥接四处拟替换仅计算，拟25498字节，SHA00f61acc…，未写成实现源码。
只允许未来B2/phaseB，新范围哈希绑定准确批准，拒绝旧根与旧572b范围。
原源、十一件工具、CMD、DLL/EXE/MVID、产品与首失败保持。
本轮未连接、上传、建任务、目标run、原生重编、产品、Win7或Git交付。
完整七项保留，未来准确远端材料待本地检查后形成。
当前Phase-Gate为ENGINEERING_02_B2_ENTRY_LOCAL_SCOPE_PENDING_APPROVAL。

## ENGINEERING_02 B2入口的本地实施（2026-10-08）

负责人批准§52、ADR-0207和准确材料2f97c195…。
执行代理在codex/a9-alpha2@a53c9b9d…实施两路径B2精确范围。
开发机最终81 PASS、0 FAIL、0 SKIP。
前两轮80 PASS/1 FAIL因变异测试异常类型而失败。
执行代理暂停整批，在最小诊断后修复准确测试预期。
首红、两次失败、最小诊断和最终结果保留。
新PS25498字节、SHA00f61acc…，四处替换可逆重建原字节。
中央十一件工具、产品r4、原生来源、原B1和证据保持。
新Win10入口和七项准入均NOT_PERFORMED。
准确目标机器材料30637字节、SHA29313d4f…待负责人裁决。
产品registration及远端产品角色仍关闭。
本轮未连接、上传、目标执行或Git交付。
详见[任务§53](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#53-b2新批次入口的本地实施2026-10-08)。

## ENGINEERING_02 B2七项检查的只读预检停止（2026-10-08）

负责人批准29313d4f…一次批次，执行代理生成准确输入a666003f…。
三个Win10只读命令各调用一次。
当前环境与普通Explorer身份事实PASS，四件系统字节一致。
旧记录收集器FAIL于FileNotFoundException包装，结果总结UNKNOWN。
独立闭包收集器FAIL于H别名解析为Get-History，闭包核验NOT_PERFORMED。
执行代理未上传、复制、创建B2或进入七项检查。
原失败、旧输入和旧窗口保持，不自动重试。
执行代理完成两处候选外本地收集修正。
新材料35007字节、SHA80a413ba…待负责人裁决。
产品、原生重编、Win7、Git交付和人工桌面动作均NOT_PERFORMED。
详见[任务§54](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#54-b2七项工具检查的批准与执行2026-10-08)。

## ENGINEERING_02 当前Win10能力与B2布局首失败（2026-10-08）

负责人批准80a413ba…新批次，输入6fe1b807…生成。
三件准确只读收集命令各一次通过。
875文件、十一工具和四系统文件字节一致。
四case记录生成，AdminQuery/Observer当前能力PASS。
CanaryCreate和B2 Preflight通过，产品未启动。
实际外发七件309407字节、复制六件115075字节。
本地事实生成四次调用一次输出，失败及偏差保留。
B2任务注册后因缺signals导致Supervise和Bootstrap失败。
任务已Disabled，两个记录实例结束，实际退出码UNKNOWN。
Ordinary、CanaryVerify、Finalize及七项准入NOT_PERFORMED。
执行代理停止下游并完成只读回收和准确B3本地提案。
机器材料4660字节、SHAe0691ca2…，ADR-0208 Proposed，不是实现批准。
详见[任务§55–56](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#55-修正只读收集器后的b2七项工具检查2026-10-08)。

## 2026-10-08 B3两路径本地批准

负责人批准§56准确4660字节材料e0691ca2…，ADR-0208 Accepted。
仅本地两文件实施、定向检查、字节冻结和后续准确目标材料准备。
真实批准、原源码和本轮基线存于resume-30，原B2 FAIL/UNKNOWN保持。
本轮远端、产品、Win7、系统变更及Git交付未授权。
执行结果沿用[任务§57](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#57-b3两路径本地执行2026-10-08)。

## 2026-10-08 B3本地实现与准确远端材料

负责人仅本地批准e0691ca2…，执行代理完成两路径准确修改。
B3桥接25714/e095e034…，五套定向83 PASS，原中央工具和产品/原生字节保持。
首红、夹具异常类型失败、远端初稿标签/容量差异均已保存。
下一准确v2材料43094字节、SHAcef6ab94…，未获远端批准。
本轮无连接、上传、目标Mode、产品、Win7、Git交付、删除或系统变更。
结果与边界集中于[任务§57](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#57-b3两路径本地执行2026-10-08)及[§58](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#58-新b3一次win10七项工具检查材料2026-10-08未批准)。

## 2026-10-08 B3准确v2许可/禁止冲突

负责人批准43094字节v2材料cef6ab94…。
执行前发现operations允许B3，但denied[5]禁止B3任务，按AGENTS.md停止。
尚未连接或派生输入，所有目标动作和产品均NOT_PERFORMED。
准确v3只更正一个ASCII字节：禁止清单B3改为旧B2，其余字段完全不变。
v3为43094字节、SHA9fd9842c…，尚未批准；原v2与真实批准保持。
独立本地核对继续完成，无源码修改，结果见[任务§59](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#59-b3准确v2许可与禁止冲突v3待裁决2026-10-08)。

## 2026-10-08 A＋r4继续与失败收尾本地提案

负责人选择先补失败收尾，再做Win10七项，暂不直接执行v3。
执行代理完成准确两路径提案，未将路线选择登记为实现批准。
机器材料3130/e748751e…，固定范围2988/5e7b3fc5…，ADR-0209 Proposed。
开发机发现信号写异常可跳过held取证；历史B2空exit_proofs保持。
提案保留首失败，逐件尝试取证后才关闭句柄，不放宽原预算。
后续材料补绑固定模板，并明确-File与EncodedCommand步骤。
本轮只改文档；实现、新测试、Win10、产品和Win7均NOT_PERFORMED。
原v2批准、v3、冻结工具、首失败、HALTED及UNKNOWN保留。
准确范围和人工裁决点集中于[任务§60](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#60-失败收尾的两路径本地修复提案2026-10-08待裁决)。
开发机文档检查、8处材料绑定、8个链接及22项保护检查PASS。
首次保护检查的换行断言错误及修正结果均保留在resume-32。

## 2026-10-08 失败收尾本地修复与新B3材料v4

负责人批准§60与ADR-0209，仅限两路径本地修复；ADR-0209 Accepted。
执行代理保存原实现首红14 PASS/7 FAIL，修复后五套定向检查87 PASS。
桥接26433/6fd6ba63…，测试31225/cdc2863c…，信号写入错误单列并逐件取证。
本机无PowerShell，控制流检查为SURROGATE，目标PS5.1行为NOT_PERFORMED。
工厂v2对B1模板4197/3cefd3e0…做身份门；渲染器逐项写明调用方式。
新七项材料v4为59630字节、SHA 9cb601eb…，取代未执行的v3，尚未获远端批准。
本轮无连接、上传、目标Mode、产品、Win7、Git交付、删除或系统变更。
结果与边界集中于[任务§61](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#61-失败收尾两路径本地执行2026-10-08)及[§62](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#62-新b3一次win10七项工具检查材料v42026-10-08未批准)。

## 2026-10-08 新B3七项Win10工具检查

负责人批准v4材料9cb601eb…，仅限新B3一次七项工具检查。
执行代理按v4完成21次SSH与3次上传，七项案例全部PASS，中央核验为SEVEN_CURRENT_CASES_CENTRAL_VERIFIED_NOT_PRODUCT_REGISTRATION。
桥接6fd6ba63…的最终记录schema_version=2，signal_errors为空，任务已禁用。
偏差：渲染器上下文补丁一次（未消耗调用）；三次只读SFTP下载未列入v4清单。
失败收尾的目标机行为、产品、Win7均NOT_PERFORMED。
结果与边界集中于[任务§63](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#63-新b3七项工具检查执行结果2026-10-08)。

## 2026-10-08 最短产品链路范围提案

负责人选择“出最短产品链路范围提案”。
执行代理核查实际代码：v5拒绝产品角色，驱动器拒绝取证版本，旧产品版本不接受新原生组件。
提案为四阶段：S1本地v6合同七路径，S2重跑七项，S3三请求产品链路，S4回归与退出response。
ADR-0210 Proposed；机器材料6099字节、SHA 49c0d0e9…；本轮只改文档，无实现、连接或产品动作。
范围与待核实项集中于[任务§64](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#64-最短产品链路的分阶段范围提案2026-10-08待裁决)。

## 2026-10-08 S1七路径批准与实施前停止

负责人批准ADR-0210与S1七路径本地实现，选项A。
实施前核查发现stage-product.ps1与launch-product-desktop.ps1只接受R2、R3根，七路径不足。
按停止条件未做任何实现修改；增补两路径的提案为9路径，材料7121字节、SHA 1c0bb9d9…。
本轮无连接、上传、产品或Win7动作。
范围与恢复条件集中于[任务§65](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#65-s1-七路径批准与实施前停止需增补两路径2026-10-08待裁决)。

## 2026-10-08 v6产品合同九路径本地实现

负责人批准增补两路径，共9路径，选项A；执行代理完成实现。
首红87 PASS/8 FAIL，修复后五套95 PASS；六个变异中五个被拒绝，一个为等价变异。
新工具闭包摘要6bdf0666…；v5作用域摘要保持，v5仍拒绝产品角色。
发现S2与S3须共用一个已批准绑定；S2/S3准确材料待编制。
本轮无连接、上传、产品、Win7、Git交付、删除或系统变更。
结果集中于[任务§66](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#66-s1-九路径本地执行v6-产品合同2026-10-08)。

## 2026-10-08 v6产品合同S2+S3合并远端材料

负责人批准编制S2+S3合并远端材料；执行代理完成编制，未连接Win10。
编制中修复三处S1缺陷，五套定向检查96 PASS，工具闭包摘要改为9590baea…。
材料25736字节、SHA 91ca4072…：一个绑定覆盖S2与S3，外发27件787549字节，SSH 32次，负责人2次Win+R。
本地干跑为SURROGATE；产品、Win7、Git交付、删除或系统变更均未执行。
结果集中于[任务§67](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#67-s2s3-合并远端材料与-s1-补充修复2026-10-08未批准)。

## 2026-10-08 负责人无法手动入口与桥接B4/B5提案

负责人告知无法手动Win+R；§67材料v1的人工入口不可用，未执行任何远端动作。
执行代理提出扩展桥接：B4（S2普通取证CMD）、B5（S3 dispatcher CMD），ADR-0211 Proposed。
固定范围2412字节、SHA 226b3da3…；本轮只改文档与提案材料。
见[任务§68](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#68-负责人无法手动打开-cmd桥接自动入口-b4b5-提案2026-10-08待裁决)。

## 2026-10-08 桥接B4/B5实现与无人工远端材料v2

负责人批准ADR-0211两路径本地修改；执行代理完成实现，首红16 PASS/6 FAIL，修复后五套97 PASS，六个变异全部被拒绝。
桥接28105/44c2f48f…；B4承接S2普通取证CMD，B5承接S3 dispatcher CMD，全程无人工步骤。
远端材料v2为34364字节、SHA dc63f091…，待负责人批准；未连接Win10。
结果集中于[任务§69](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#69-桥接-b4b5-本地执行与无人工远端材料-v22026-10-08未批准)。

## 2026-10-08 材料v2首失败与更正版v3

负责人批准材料v2；第一个只读预检调用因渲染器函数名H与PowerShell别名h冲突而失败，未发生远端写入。
执行代理按停止规则停止全部依赖调用，渲染器v4改名并新增别名同名检查，生成材料v3（35255字节，SHA 4434a5a3…）。
v3待负责人重新批准。见[任务§70](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#70-材料-v2-首个调用失败与更正版-v32026-10-08未批准)。

## 2026-10-08 材料v3建目录失败与更正版v4

负责人批准材料v3；四项只读预检PASS，建目录调用因检查自身将创建目录的父目录而在写入前失败。
执行代理停止依赖调用，渲染器v5仅改该处，生成材料v4（36269字节，SHA 0554362f…），待重新批准。
见[任务§71](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#71-材料-v3-建目录调用失败与更正版-v42026-10-08未批准)。

## 2026-10-08 材料v4执行到Prepare失败与更正版v5

负责人批准材料v4；预检、建目录、上传、核验、PS5.1解析与Node语法全部PASS，Prepare因evidence脚本写死旧input-binding哈希而失败。
v4写入保留；执行代理更正evidence/producer、复用已核验工具根，生成材料v5（37556字节，SHA db5ea22a…），待重新批准。
见[任务§72](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#72-材料-v4-执行到-prepare-失败与更正版-v52026-10-08未批准)。

## 2026-10-09 材料v5执行到AdminQuery失败

负责人批准材料v5；预检、上传、解析与S2 Prepare PASS，AdminQuery被forensic-admission.ps1第90行v5版本门拒绝。
该文件不在九路径内，执行代理停止并请求增补第十路径；v5写入保留。见[任务§73](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#73-材料-v5-执行到-adminquery-失败需增补第十路径2026-10-09待裁决)。

## 2026-10-09 第十路径修复与材料v6

负责人批准第十路径；执行代理修复forensic-admission.ps1第90行，五套98 PASS，冻结r4（工具摘要7102b3f2…）。
材料v6（47a386aa…）已生成，等待负责人批准。见[任务§74](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#74-第十路径修复冻结-r4-与材料-v62026-10-09未批准)。

## 2026-10-09 材料v6执行到layout-b4失败

负责人批准材料v6；预检、上传、解析与S2四个模式PASS，layout-b4被B3模板的范围检查拒绝，远端无写入。
执行代理停止并提出修正案1（45f48dd3…）。见[任务§75](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#75-材料-v6-执行到-layout-b4-失败与修正案-12026-10-09待裁决)。

## 2026-10-09 S2 PASS，S3 helper-sync失败

负责人批准修正案1；B4普通入口自动完成，S2七项当前检查通过中央核验，S3前四步PASS。
helper-sync因点源清空参数失败；执行代理停止并提出修正案2（e92ee894…）。见[任务§76](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#76-修正案-1-执行s2-passs3-helper-sync-失败与修正案-22026-10-09待裁决)。

## 2026-10-09 helper-sync生命周期UNKNOWN

负责人批准修正案2；上传、核验、解析PASS，helper-sync重试120秒未退出，生命周期UNKNOWN。
执行代理停止全部依赖动作，请求批准一次只读进程查询。见[任务§77](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#77-修正案-2-执行helper-sync-生命周期-unknown依赖动作停止2026-10-09待裁决)。

## 2026-10-09 Win10验收机完整性失败

只读事件日志发现与本批次无关的隐藏PowerShell活动（Defender排除、关闭通知、防火墙放行缓存目录可执行文件）。
执行代理停止全部远端动作，未做任何处置。见[任务§77.3](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#773-事件日志查询win10-验收机完整性失败)。

## 2026-10-09 原地清理路线与ADR-0212提案

v6窗口02:11Z到期，批次关闭。负责人选择原地清理Win10验收机；执行代理备好只读核验脚本，提出ADR-0212（桥接根目录B6/B7）。见[任务§79](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#79-原地清理路线与桥接根目录-b6b7-提案2026-10-09待裁决)。

## 2026-10-08 续推材料本地核对（负责人时区）

执行代理在codex/a9-alpha2@a53c9b9d…核对两路径提案和两条只读核验命令，文件身份一致。
补正命令文件与脚本哈希的标注，记录查询错误和账户覆盖的解释边界，见[任务§80](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#80-续推材料的本地核对2026-10-08负责人时区)。
未连接Win10验收机，未改实现；ADR-0212仍Proposed，清理完成状态待负责人确认。

## 2026-10-09 当前主机诊断路线批准

负责人在获知当前机器仅可作诊断、所有结果完整性UNKNOWN后回复“批准”。
执行代理按当前主机诊断路线承接，原地清理路线暂停；未裁决主机可信。
新增ADR-0213，准备ADR-0212两路径诊断范围v2，3508字节、5e7b954e…，见[任务§81](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#81-当前主机诊断路线批准与准确范围准备2026-10-09负责人时区)。
本轮未改实现或连接远端；新窗口、第三次helper-sync及准确实施仍待批准，旧v6不恢复。

## 2026-10-09 Win10实机优先的入口修复与只读前检

负责人要求将Win10实机验证作为最高优先项。执行代理承接已呈现两路径范围v2，ADR-0212登记Accepted，桥接仅三处替换，定向检查由17 PASS/5 FAIL转为22 PASS/0 FAIL。
四份内部源码外发解析被Auto Review拒绝，未执行；拒绝原文与准确载荷保留，并单列授权问题。
不外发源码的实机查询首轮因转义丢反斜杠失败；保留首失败后用新命令修复，未延长窗口。
2026-10-09T08:18:48Z当前只读返回build19045、PS5.1.19041.6456；两份已部署修复脚本哈希匹配、解析零错误；B6/B7与R4调度固定点未占用。
当前桥接/invoke-v3解析、普通桌面及产品仍NOT_PERFORMED；主机完整性UNKNOWN，不计正式验收。见[任务§82](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#82-win10实机优先必要入口调整与只读前检2026-10-09负责人时区)。

## 2026-10-09 获批源码解析超时与输入通道最小复现

负责人明确批准两次独立单次源码解析。两次均达到60秒预算，原始失败与准确批准保留。
第二次返回PID25508及创建ticks，未返回完整载荷标记。原退出时间和退出码UNKNOWN。
执行代理按连续两次同类失败停止整批重试，完成公开标记最小诊断。
同一52963字节公开载荷：Console.ReadBlock在10秒内超时；显式Text管道在1.54秒内返回一行且哈希匹配。
新Text管道解析材料v5为901a4131…，只含两源52963字节，待单次源码外发批准。
当前源码ParseInput、普通桌面与产品均NOT_PERFORMED；主机完整性UNKNOWN，不登记正式验收。
见[任务§83](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#83-获批源码解析超时与输入通道最小复现2026-10-09负责人时区)。

## 2026-10-09 已确认挖矿实例终止及重新启动入口禁用

负责人目标为“结束恶意挖矿程序”，保持网络连接。
执行代理在Win10验收机WIN-2JQ66JE4HTQ上终止原PID18428。
第一轮观察发现RuntimeHost重新启动并拉起PID8864，原观察失败保留。
执行代理保全准确任务原XML，禁用`\Windows System Health Check`并结束PID8864。
17次只读采样覆盖327秒，挖矿/加载器进程和原外联未再出现，任务始终Disabled。
最后独立查询为2026-10-09T09:06:35Z；run为miner-stop-20261009-r1，开发机基线a53c9b9d…及受保护dirty。
没有删除文件、重启、重装或修改网络及Defender；其他持久化未清理，主机完整性UNKNOWN。
现有工程任务、源码解析授权、历史失败、HALTED和候选不改判。
见[任务§84](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#84-已确认挖矿进程终止及重新启动入口禁用2026-10-09负责人时区)。

## 2026-10-09 当前两源Win10真实PS5.1诊断解析返回

负责人明确批准901a4131…的一次Text管道解析。08:56:36Z返回完整输入标记与两源结果，SSH退出码0。
bridge 505ca76e…和invoke-v3 d89bd1f0…的真实PS5.1解析错误均为0，长度、SHA与准确scope匹配。
该结果仅为Win10诊断解析PASS，主机完整性UNKNOWN，普通桌面、产品、正式验收与Win7仍NOT_PERFORMED。
原超时和公开等长Console.ReadBlock失败保持。旧invoke-v3仍绑B4/B5和admission-v6-v3，不能直接派发B6/B7。
后续诊断材料v7须新绑定、新窗口和准确第三次helper-sync方案。见[任务§83.6](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#836-text管道批准与当前源码直接解析)。

## 2026-10-09 B6/B7真实入口诊断材料与只读前检

负责人选中B6/B7普通桌面真实入口，要求“开始推进”。
执行代理在codex/a9-alpha2@a53c9b9d…及受保护dirty完成本地准备。
Win10验收机10:06:00Z直接观察a9builder Explorer为Session2、Medium、非提升、InJob=false。
B6/B7目录和任务未占用。材料cf4eac7b…、33753字节，冻结40件输入。
本地43调用演练PASS，仅SURROGATE；当前目标入口和新调用器目标解析NOT_PERFORMED。
新批次包括一次第三次SYNC、B6入口、B7身份与正常收尾，产品请求数量0。
准确远端批准PENDING。主机完整性UNKNOWN，正式验收门及原FAIL/HALTED保持。
当前Phase-Gate为ENGINEERING_02_B6_B7_DIAGNOSTIC_REVIEW_PENDING。见[任务§85](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#85-b6b7真实入口诊断材料与只读前检2026-10-09负责人时区)。

## 2026-10-09 获批B6/SYNC通过与B7绑定失败

负责人明确批准cf4eac7b…的B6/B7单批诊断，窗口13:07:04Z至15:07:04Z。
执行代理在Win10验收机完成B6普通入口、当前七项检查与一次第三次SYNC。
当前pin为b4d87441…，SYNC实际runtime为9fd2c309…，实际外发381867字节。
B7在绑定硬门失败，任务禁用记录保存；bootstrap held退出证据UNKNOWN。
调度器身份调用TIMEOUT，正常停止和产品请求NOT_PERFORMED，批次HALTED。
主机完整性UNKNOWN，正式验收与Win7不改判。
最小共享读写诊断b93b6b8e…已备，准确新写入范围批准PENDING。
见[任务§86](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#86-获批b6通过第三次sync通过及b7绑定失败2026-10-09负责人时区)。

## 2026-10-09 单次最小共享读写诊断与新库修复材料

负责人准确批准b93b6b8e…的一次最小诊断。
执行代理于20:46:31Z在Win10实际PS5.1执行，用时1.423秒、SSH退出0。
写者关闭前的现有读取触发绑定失败；关闭后有效文件通过。
共享读句柄在写者打开时返回错误32，完整错误绑定仍拒绝。
两件公开标记共274字节，SHA与开发机重算一致。
原B7故障字节及根因UNKNOWN，原批次HALTED保持。
主机完整性UNKNOWN，产品、正式验收与Win7均NOT_PERFORMED。
当前Phase-Gate为ENGINEERING_02_RECORD_PUBLICATION_REPAIR_PENDING_B7_HALTED。
新库副本两路径本地修复材料49275403…已备，批准PENDING，实现NOT_PERFORMED。
见[任务§87](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#87-最小共享读写诊断通过与新库修复范围2026-10-09负责人时区)。

## 2026-10-09 获批两路径新库修复与目标夹具材料

负责人准确批准49275403…的两路径本地范围。
执行代理生成新库36d35783…和PS5.1夹具31f62d5b…，原库保持。
公共签名和两函数之外的字节相等，本地结构与编码检查PASS。
目标PS5.1解析与行为仍NOT_PERFORMED，没有以开发机替代。
Win10三项单批夹具范围f5c394ce…已备，准确批准PENDING。
原B7批次HALTED、根因和未知退出保持；主机完整性UNKNOWN。
当前Phase-Gate为ENGINEERING_02_RECORD_PUBLICATION_LOCAL_READY_TARGET_PENDING_B7_HALTED。
产品、正式验收与Win7均NOT_PERFORMED。
见[任务§88](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#88-新库副本两路径本地修复2026-10-09负责人时区)。

## 2026-10-09 Win10夹具调用编码复核与材料v2

执行代理在远端前发现v1文件调用没有显式指定源码解码。
夹具含中文，目标默认代码页UNKNOWN；旧f5c394ce…申请不派发。
两件源码字节保持，调用材料换为严格UTF-8与固定文件名AST执行。
新范围v2为8cf98df3…，三项调用、目录及写入预算保持。
新语法、AST文件名/自动变量绑定和实际PS5.1行为NOT_PERFORMED。
新准确远端批准PENDING；没有新增远端调用。
见[任务§88.5](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#885-显式utf-8调用材料v2)。

## 2026-10-09 获批新库Win10实际夹具返回

负责人同时批准旧v1与替代v2，执行代理只派发8cf98df3…的v2。
三个30秒预算单次调用均退出0，实际耗时1.332、0.218、2.113秒。
新库36d35783…、夹具31f62d5b…在实际PS5.1通过解析与12个场景。
11件公开文件共525275字节，返回名称、尺寸和SHA全部匹配。
AST文件名及PSCommandPath路径门通过，资源收尾错误为空。
本次仅为Win10诊断，新库普通桌面消费者NOT_PERFORMED。
远端进程held退出证明UNKNOWN。
原B7根因、原退出UNKNOWN及HALTED保持，主机完整性UNKNOWN。
新桥接B8/B9两路径本地范围2db66114…已备，批准PENDING，实现NOT_PERFORMED。
当前Phase-Gate为ENGINEERING_02_RECORD_PUBLICATION_WIN10_DIAG_PASS_BRIDGE_SCOPE_PENDING_B7_HALTED。
产品、正式验收及Win7仍NOT_PERFORMED。
见[任务§89](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#89-新库win10夹具诊断通过与新桥接接入范围2026-10-09负责人时区)。


## ENGINEERING_02 B8/B9新库桥接两路径本地接入（2026-10-09，负责人时区）

负责人准确批准2db66114…的两路径本地接入。
实际基线codex/a9-alpha2@a53c9b9d…及受保护dirty。
新桥接15a795f3…和新测试0d492c9d…已冻结，新库36d35783…保持。
准确五项桥接变换全部字节匹配，开发机22/22定向SURROGATE检查PASS。
修复前16通过/6失败的首个FAIL保留；原22项与新增旧根拒绝反例均保留。
核对发现原调用器、清单工厂仍锁定B6/B7和旧SHA；已用的R4派发器CMD路径不能直接换新pin。
新桥接实际PS5.1、普通入口与dispatcher均NOT_PERFORMED。
三项Win10只读前检/解析材料ba32f428…已备，准确远端批准PENDING。
范围限30/30/60秒单次调用与76988字节载荷；不写远端、不执行源码或产品。
旧B7保持HALTED，原故障读取字节、根因和缺失held退出UNKNOWN；主机完整性UNKNOWN。
整体目标未完成，产品、正式验收和Win7仍NOT_PERFORMED；本轮未提交、推送或删除。
详情见[任务§90](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#90-新桥接b8b9两路径本地接入2026-10-09负责人时区)。


## ENGINEERING_02获批Win10只读前检与解析完成（2026-10-09，负责人时区）

负责人准确批准ba32f428…的三项调用，派生01:21:35.730Z至01:51:35.730Z窗口。
实际基线codex/a9-alpha2@a53c9b9d…及受保护dirty；目标Administrator@192.168.1.4。
三项SSH退出0，用时0.778/1.568/1.167秒，30/30/60秒各限一次，批准已消费。
实际PS5.1解析新桥接15a795f3…与新库36d35783…零错误，长度和SHA全部匹配。
旧四个准确实例当前PID不存在；B7任务禁用，B8/B9任务和根未占用。
旧派发器CMD521字节、dcd8c75e…与保留v7副本完全匹配，旧路径不覆盖。
库查询字面量少了control，正确部署路径当前复查NOT_PERFORMED；错误和原返回保留。
当前观察不补签原B7的held退出、进程树或根因；原批次HALTED、UNKNOWN保持。
聚合结果6f868015…与逐项原始stdout/stderr、claim、真实批准均保留。
完整13路径本地消费者范围6b05106a…已准备，批准PENDING，未实施；ADR-0214 Proposed。
当前Phase-Gate为ENGINEERING_02_B8_B9_PS51_PARSE_PASS_CONSUMER_SCOPE_PENDING_B7_HALTED。
主机完整性UNKNOWN，整体目标未完成，真实入口、产品、正式验收及Win7仍NOT_PERFORMED。
本轮没有远端文件写入、源码执行、任务变更、入口、SYNC、产品、清理或Git交付。
详情见[任务§91](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#91-获批win10只读前检与新源码解析完成2026-10-09负责人时区)。


## ENGINEERING_02完整13路径本地接入完成（2026-10-09，负责人时区）

负责人准确批准6b05106a…的13路径接入及ADR-0214本地提案。
基线codex/a9-alpha2@a53c9b9d…及受保护dirty；执行代理完成并冻结13件新源码及44件输入。
新桥接3e069608…只改准确范围SHA与B9专用CMD名称，新库36d35783…保持。
新包装器、调用表、工厂与七件Python编排消费者使用B8/B9和admission-v6-v5。
开发机23项桥接SURROGATE、21项消费者链及八件Python源码编译PASS，旧反例及首失败保留。
stop状态误写STOPPED的首失败保留；按实际不变源COMPLETED修复，新夹具旧库路径遗漏packet-b1已纠正。
普通身份、held、审计、NUL、收尾和原15/60分钟预算保持，身份观察内部90秒、外层120秒。
旧两路径源、六件辅助源、十一件工具、产品、原生与旧CMD字节保持，不重建。
完整Win10材料5430bf7a…已准备，48项各一次，上传上限471763字节，复制172686字节，产品请求0。
未生成真实远端批准、窗口或run-v8；远端批准PENDING，本轮网络与远端调用0。
当前Phase-Gate为ENGINEERING_02_B8_B9_CONSUMERS_LOCAL_READY_REMOTE_DIAGNOSTIC_PENDING_B7_HALTED。
新改源PS5.1、真实入口、产品、正式验收及Win7仍NOT_PERFORMED；原B7 HALTED与UNKNOWN、主机完整性UNKNOWN保持。
整体目标未完成，本轮未清理、删除、提交或推送。
详情见[任务§92](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#92-完整13路径本地消费者接入2026-10-09负责人时区)。


## ENGINEERING_02获批B8/B9批次前段完成后停止（2026-10-09，负责人时区）

准确批准5430bf7a…后建立新pin bc0027ae…及两小时窗口，14 SSH与1上传均退出0并验证。
Win10实际PS5.1解析新invoker/wrapper通过，Node语法及Prepare/AdminQuery/Observer/CanaryCreate诊断通过。
执行代理未先登记实际canary run_id，回收器写once claim后本地KeyError，未启动只读SFTP。
首失败保存，run-v8 HALTED；剩余33项NOT_PERFORMED，禁止重跑已写claim或恢复原批次。
B8/B9布局前检、桥接解析/入口、第四次SYNC、dispatcher正常停止和产品NOT_PERFORMED；有效产品请求0。
10路径本地隔离/前置检查修复材料37e2d307…已备，批准PENDING，不含网络或远端动作。
当前Phase-Gate为ENGINEERING_02_B8_B9_BATCH_HALTED_LOCAL_CANARY_ORDER_SCOPE_PENDING_B7_HALTED。
原B7 HALTED与UNKNOWN、主机完整性UNKNOWN保持，整体目标未完成；正式验收与Win7 NOT_PERFORMED。
详情见[任务§93](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#93-获批b8b9批次前段完成canary本地顺序失败后停止2026-10-09负责人时区)。


## ENGINEERING_02 canary顺序10路径本地隔离修复完成（2026-10-09，负责人时区）

负责人准确批准37e2d307…的10路径本地范围，实施与定向验证已完成；10件新源、46件输入已冻结。
基线codex/a9-alpha2@a53c9b9d…及受保护dirty；新目录admission-v6-v6，原run-v8保持HALTED。
canary先验证execution/stdout SHA/pin并登记run_id，回收器在写claim前检查上下文与阶段前置结果。
开发机31项消费者检查PASS，原21项及旧claim耗用反例保留；真实本地文件链只替代SFTP传输，无网络。
新invoker2c9503cb…、wrapper69772b0f…；旧桥接3e069608…、库36d35783…、原生、产品及工具不变。
新材料0f2037b2…已准备：50052字节、48项单次、上传上限471763字节、复制172686字节，产品请求0。
准确远端批准PENDING，未生成真实窗口、run-v9、pin或revision；新源实际PS5.1与B8/B9入口NOT_PERFORMED。
当前Phase-Gate为ENGINEERING_02_CANARY_ORDER_LOCAL_READY_B8_B9_REMOTE_PENDING_B7_HALTED。
原B7与所有UNKNOWN、旧CMD和证据保持；主机完整性UNKNOWN，整体目标未完成，正式验收与Win7 NOT_PERFORMED。
详情见[任务§94](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#94-获批10路径canary顺序本地隔离修复2026-10-09负责人时区)。


## ENGINEERING_02新Win10批次到达B8前检后停止（2026-10-09，负责人时区）

负责人准确批准0f2037b2…的50052字节材料，批准后生成05:55:03.097Z至07:55:03.097Z窗口。
基线codex/a9-alpha2@a53c9b9d…及受保护dirty；新pin bf30c670…、revision e548bb22…、producer admission-v6-v6。
执行23项固定调用（20 SSH、3上传）与2个只读SFTP，22项结果验证通过。
canary先登记实际run_id再回收，三文件齐全；B8独占布局、五件原生/proof、桥接/库实际PS5.1解析和绑定通过。
新invoker2c9503cb…及wrapper69772b0f…实际PS5.1解析通过，未修改或重建产品/原生。
B8 Preflight子进程11224/639272087036921106 held退出0，stdout/stderr为空、close_errors为空。
冻结源码Preflight写preflight.json后静默返回，冻结validator无条件JSON解析子stdout，报Expecting value；原result_validated=false及HALTED保持。
实际原始返回和同一冻结validator只读回放确认合同错配，不重跑、不恢复，不补签实际报告字节UNKNOWN。
另25项NOT_PERFORMED；B8 supervisor/任务/普通入口、B9、第四次SYNC和产品均未执行，有效产品请求0。
实际上传377756字节，复制86343字节；旧CMD、B8新输入和全部旧证据保留。
14路径本地模式合同/直接报告Gate修复材料75c8156b…已备，13361字节，批准PENDING，14件新源尚未创建。
新副本计划B10/B11、run-v10，完整接入后本地核验并冻结，再另准备准确远端批准；本材料不含网络或入口。
当前Phase-Gate为ENGINEERING_02_B8_PREFLIGHT_RESULT_CONTRACT_HALTED_LOCAL_SCOPE_PENDING。
主机完整性UNKNOWN，原B7/v8和所有UNKNOWN保持；整体目标未完成，正式验收及Win7 NOT_PERFORMED。
本轮没有清理、删除、提交、推送、强制终止或系统安全配置修改。
详情见[任务§95](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#95-获批新win10批次到达b8前检模式返回合同失败后停止2026-10-09负责人时区)。


## ENGINEERING_02 14路径模式合同本地修复完成（2026-10-09，负责人时区）

负责人准确批准75c8156b…的本地范围；14件新源与52件输入已冻结。
基线codex/a9-alpha2@a53c9b9d…及受保护dirty保持。
开发机桥接24项、消费者41项检查PASS；原23项和31项反例保留。
Preflight静默返回只确认响应形状；当前preflight.json导出核验通过才允许supervisor。
Supervise按准确状态校验，Collect按真实文件帧校验；审批、held、预算、审计和once门保持。
原v9实际空响应经旧validator回放仍失败；原result_validated=false及HALTED不改判。
九实例生命周期首轮超长失败已保留；仅缩短变量名，观察内容和UNKNOWN保持。
46项动态命令与四项固定命令本地核验，最大7864字符；30秒预算和7900边界保持。
八件Python编译检查PASS；仅使用过期SURROGATE和本地文件，网络0。
新桥接8cccfaf4…、invoker7004a45a…、wrapper26f75e4c…与producer admission-v6-v7绑定。
库36d35783…、十一工具、六辅助源、产品、原生和旧CMD保持。
新材料b3a6b219…为56296字节、50项各限一次；44 SSH、6上传，另最多10次只读SFTP。
上传上限471800字节，独占复制172686字节；产品请求0，主机完整性UNKNOWN。
两个新增只读报告导出各120秒；第四次SYNC仍一次120/180秒，B11正常停止要求COMPLETED/requests0。
准确远端批准PENDING，真实窗口、owner/run-v10、pin和revision均未生成。
当前Phase-Gate为ENGINEERING_02_MODE_CONTRACT_LOCAL_READY_B10_B11_REMOTE_PENDING_B7_HALTED。
新源实际PS5.1、B10/B11入口、第四次SYNC、产品和Win7均NOT_PERFORMED。
原B7/v8/v9 HALTED及所有UNKNOWN保持；整体目标未完成。
本轮没有网络、远端写入、入口/SYNC/产品执行、清理、删除、提交、推送或系统安全配置修改。
文档检查PASS，207文件/51任务；git diff --check PASS。
2150件受保护文件与52件冻结输入SHA保持；历史任务与日志、ADR及索引保持。
详情见[任务§96](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#96-获批14路径模式输出合同本地修复2026-10-09负责人时区)。


## ENGINEERING_02完整工具修复阶段授权方案准备（2026-10-10，负责人时区）

负责人要求一次批准完整本地工具/测试、同范围修复、新副本和固定Win10有界验证。
执行代理沿用任务§97、STATUS、任务索引和现有证据树，新增ADR-0215 Proposed。
实际分支codex/a9-alpha2@a53c9b9d…及受保护dirty保持；本轮只改方案和治理文档。
准确材料62e30081…为192099字节，阶段批准PENDING。
39类工具/测试可修复源、三类只读原生相关副本，六组共252个准确新路径。
同范围故障可直接修复、定向测试、冻结和绑定新哈希，不按文件版本反复求批。
最多六轮本地返工/版本、三轮Win10；阶段七天，每轮新两小时窗口。
每轮52项主调用、5项最小诊断和12次只读SFTP；全阶段147 SSH、24上传、36只读SFTP。
上传总上限7077888字节、独占复制1572864字节；最多三次120/180秒runtime-SYNC，产品请求0。
B10/B11、B12/B13、B14/B15根/任务及三个run、producer、CMD和诊断目录均预先枚举。
同类失败两轮先最小诊断；新修复证据、实际树结束和全部门满足后才允许下一轮。
仅越界、次数/期限/大小/预算用尽或新的身份/完整性/安全/审计/未知生命周期硬门请求裁决。
真实执行绑定从负责人阶段批准派生，不假造新的人工批准，不用未形成哈希派发。
原b3a6b219…单批申请暂停并保持原字节；本阶段方案取代其待批准路线。
首版规划v1与文件计数复核保留，最终仅呈现v3一次批准。
当前Phase-Gate为ENGINEERING_02_TOOL_REPAIR_PHASE_AUTHORIZATION_PENDING。
本轮实施、网络、真实阶段批准/window/run/pin/revision、远端写入均NOT_PERFORMED。
原冻结输入、历史候选、原生、CMD、首失败、全部HALTED和UNKNOWN保持。
主机只作ADR-0213诊断，正式工具准入/产品执行/Win7不在本阶段，整体目标未完成。
开发机方案投影检查PASS，有限路径、调用依赖、上传catalog与总预算一致。
2542件其他受保护文件、52件冻结输入及全部旧历史保持；ADR仅新增提案与索引行。
首轮保护检查FAIL保留；复核区分获准ADR追加与受保护旧正文，v2检查PASS。
文档检查PASS，207文件/51任务；git diff --check PASS。
详情见[任务§97](tasks/ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md#97-完整工具修复阶段授权方案2026-10-09待一次批准)。

## 2026-10-10：ENGINEERING_02完整工具修复阶段获批

负责人回复“批准完整阶段方案及 ADR-0215”；scope62e30081…的有限授权生效。
ADR-0215 Accepted，任务§98及252个准确白名单路径登记；原正文和全部历史保持。
c01当前开发机桥接24、消费者与阶段门45、四件Node测试76项PASS；目标诊断尚未执行。
范围内修复、版本和Win10有界复验直接推进；仅越界、上限或新安全硬门请求裁决。

## 2026-10-10：ENGINEERING_02阶段诊断、同范围修复与run边界

阶段scope62e30081…获批后直接接入新消费者，未逐路径或逐哈希重新审批。
c01引用生成错误在SSH前停止；c02七个旧DIG引用及c03旧中央SHA均保留首失败。
两个实际Win10主批次的Prepare取得held退出1；全部旧控制器保持HALTED。
r03五项最小诊断确认中央SHA引用，原静态/组件/280项自检及12个held Node记录直接绑定c03。
c05精确修复引用，开发机24/47/77项PASS；c05 Win10 NOT_PERFORMED。
当前33会话、上传1568722字节；复制、SYNC、产品0，主机UNKNOWN保持。
三个准确run槽位已使用；新增r04准确替代材料ec0c51f3…及ADR-0216 Proposed待裁决。
原总预算、最后c06源槽位及B10/B11固定目标保持；不创建新增真实运行或恢复HALTED。

## 2026-10-10：ENGINEERING_02准确r04替代范围获批

负责人准确批准ec0c51f3…材料及ADR-0216。基线及dirty保护保持。
只激活c06和一次r04；原预算、原期限、旧HALTED和证据保持。
当前接入组合批准门和定向本地验证，Win10新调用NOT_PERFORMED。
详情见ENGINEERING_02任务§100。

## 2026-10-10：ENGINEERING_02 r04普通入口捕获合同失败，限额停止

c06开发机24/52/77项PASS；实际Win10 Prepare及三模式、B10前检/报告通过。
B10 supervisor held退出1，LIFECYCLE_ENTRY_CAPTURE及r04 HALTED保持。
Added2/Gaps0/Excluded1，现有消费者拒绝已证明非子进程排除结果，完整旧二次证明字段UNKNOWN。
六条held退出0、任务停用及全部收尾错误为空；只读回收18文件完成。
阶段累计64会话、上传2411491、复制86343字节，SYNC/产品0。
三实机批次、六源版本已用尽；准确c07/r05增补与ADR-0217 Proposed待批准。
产品、Win7、正式验收、清理、删除、提交与推送NOT_PERFORMED。
详情见ENGINEERING_02任务§100至§101。

## 2026-10-10：ENGINEERING_02 c07/r05准确增补获批

负责人准确批准4b4d12e6…及ADR-0217。基线与dirty保护保持。
仅激活42个c07源路径及一次r05/B16/B17，开始完整排除证明与中央v2合同修复。
原累计限额/七天截止/全部旧失败和HALTED保持。新远端NOT_PERFORMED。
详情见任务§102。

## 2026-10-10：ENGINEERING_02 c07/r05主调用全部通过，完整证据缺口保留

固定Win10目标、冻结c07/r05全部52主调用PASS，94件取证收集并核验。
B16普通S2中央、第四次SYNC和B17普通身份/正常停止均PASS；产品请求0。
冻结S2收集器遗漏实际普通run原始四件JSON，本轮10只读上限已到。
完整证据UNKNOWN，阶段不判完成；§103及ADR-0218仅提出两会话准确补收集，批准PENDING。
c07及r05主调用不修改或重跑，所有历史与首缺口保留。整体未完成、主机UNKNOWN。

## 2026-10-10：ENGINEERING_02两会话准确补收集获批

负责人批准cb42dd9b…及ADR-0218，只读30分钟授权记录已生成。
沿用成功r05，只补四件普通原始JSON；不重跑或更改c07主链。
预算、冻结、历史失败和首缺口保持，执行见任务§104。

## 2026-10-10：ENGINEERING_02 c07/r05诊断工具修复阶段完成

获批两会话只读补收集完成，四件普通原始JSON共9058字节，准确摘要绑定原Win10中央回执。
冻结中央c07按原报告时间在开发机回放通过，owned powershell/conhost各held退出0。
诊断阶段52主调用、12只读、98文件证据闭合；累计128会话，预算未重置。
旧v1结果和首缺口原字节保留；本地登记空claim首错误及零字节现场保留，目标调用未重试。
当前阶段完成，整体仍NOT_COMPLETE、主机UNKNOWN；产品/正式Win10/Win7及Git交付NOT_PERFORMED。
结果与保护复核见任务§104及phase-r1/r05-stage-result-v2.json。

## 2026-10-10：ENGINEERING_02负责人指定当前Win10为可信验收环境

负责人直接指示“将win10设为可信”，固定目标Administrator@192.168.1.4:22。
ADR-0219 Accepted，ADR-0213状态标记被取代，全部旧正文与诊断证据保留。
环境信任选择已解决；技术主机完整性UNKNOWN，不推导新的安全检查或清除结论。
继续准备完整产品验证阶段，整体仍未完成；本次没有新实现、远端或产品执行。
原限额、冻结输入、首失败、HALTED与UNKNOWN保持，详情见任务§105。

## 2026-10-10：ENGINEERING_02剩余完整产品验证阶段方案已准备

执行代理完成准确7993bd86…材料，承接负责人指定可信的同一Win10目标。
52类工具/测试和156新路径、三个源版本、两轮Win10、完整十请求及真实UI退出工具合并申请。
规划直接核对旧41件源、r4 ZIP和十请求元组；没有新实施、远端或产品执行。
ADR-0220及UIA C15/C16 Profile为Proposed，批准前不派发。
原阶段额度不重置；当前完整目标仍未完成，所有冻结输入、首失败、UNKNOWN与HALTED保留。
方案、预算、停止门与完成条件见任务§106。

## 2026-10-10：ENGINEERING_02完整产品验证阶段准确获批

负责人准确批准7993bd86…及ADR-0220；新阶段真实批准记录1e86d69d…已生成。
156条新实施路径、p01至p03与w01/w02在原准确限额内激活。
阶段截止2026-10-18T00:01:08.277195Z，旧阶段期限、限额和全部历史不改。
当前先实施和定向本地检查；新远端与产品尚未执行，详情见任务§107。

## 2026-10-10：ENGINEERING_02首次只读前检取得实际.NET4.8.1

固定Win10首SSH退出0，五件UIA系统组件均有有效签名，P1/P2不存在，空闲约6GiB。
已取得Release533325及准确系统字节；尚未加载UIA、上传、写远端或执行产品。
原Profile写4.8，ADR-0221及270978c7…提案补充实际已有4.8.1，额度和期限不增。
UIA依赖等待准确版本裁决，独立本地合同和测试继续；首本地准备错误及前检原字节保留。

## 2026-10-10：ENGINEERING_02实际已有.NET4.8.1登记获批

负责人准确批准270978c7…及ADR-0221，批准记录de899fcb…已保存。
p01五件系统组件锁1d9fd393…绑定首前检和批准链；不安装或修改系统。
原完整阶段额度和期限保持，继续本地接入和目标验证；UIA与产品仍NOT_PERFORMED。
详情见任务§107.2。

## 2026-10-10：ENGINEERING_02本地工具检查通过，Win10解析超时后停止

开发机p03的113项Node、52项消费者和21项原始复核检查PASS。
驱动器128/88/31/33检查按未变化字节保留，不写成目标产品PASS。
p02/w01先在本地时间格式校验停止，没有新增远端调用。
冻结p03/w02解析调用在60秒超时，标准输出0字节、远端退出UNKNOWN。
w01/w02首失败与HALTED保持；阶段累计4次SSH，其他远端额度消费均0。
UIA、产品和主窗口NOT_PERFORMED，整体未完成。
当前调用器未沿用历史成功Text通道，源码回归已确认，超时根因仍UNKNOWN。
ADR-0222及52路径p04/w03完整替代方案v2为Proposed。
准确材料29581字节、f238e444…，原累计限额、两窗口上限和七天截止保持。
尚未实施p04或派发新调用，详情见任务§107.3至§107.4。

## 2026-10-10：ENGINEERING_02完整p04/w03替代方案准确获批

负责人直接回复“批准”，绑定f238e444…准确材料及ADR-0222。
真实批准记录d4a9909b…保留批准前权威文档快照。
新52路径p04和w03/P3/B22/B23激活，原阶段和准确.NET4.8.1批准保持。
原累计额度、两窗口上限与七天截止不增；旧HALTED、UNKNOWN和首失败保持。
当前继续授权范围内工具修复和有界Win10验证，详情见任务§108。

## 2026-10-10：ENGINEERING_02新Text只读诊断确认准确旧解析实例仍存活

开发机p04完整检查PASS，52件源与494312字节准确解析/公开载荷冻结。
214件保护文件复核PASS，首轮本地红检查保持。
Win10一次只读SSH退出0，Text入口先输出PID/创建时间；准确旧w02命令匹配。
旧解析实例28868/639272795733065333仍存活，生命周期门FAIL，w03 HALTED保持。
公开canary、源码解析、部署、UIA、产品和窗口NOT_PERFORMED，阶段累计5 SSH。
未终止旧进程；原ADR-0222排除该动作，旧失败和UNKNOWN不改判。
ADR-0223及85d6082b…完整准确处置/p05/w04材料准备，等待负责人裁决。
原累计预算、两窗口上限与七天截止保持，详情见任务§108.1至§109。

### 2026-10-10 ENGINEERING_02 ADR-0223完整批准激活

负责人明确批准85d6082b…准确方案，批准记录57f795a7…；任务§110。
当前实施p05/w04及精确旧实例恢复，原累计预算/截止与全部安全门保持。
Win10余下验证、产品和Win7 NOT_PERFORMED；旧p04/w03首失败不改判。

### 2026-10-10 ENGINEERING_02 w04组件守卫首失败与完整元数据优先提案

任务§111：准确恢复调用退出1，INTEGRITY_RECOVERY_LOADED_ASSEMBLY，未取得旧目标、未Kill。
w04 HALTED；实际Location/版本/token/SHA/签名与根因UNKNOWN，新阶段累计6SSH，其余0。
首失败e3626444…与p05/全部历史保持。任务§112/ADR-0224提出先只读观察实际组件再锁定的完整p06/w05方案。
18项材料核对与1053件保护哈希通过；新源、诊断、处置、UIA、产品和Win7 NOT_PERFORMED。
当前准确材料42743字节/13a5d7b9…；等待新增范围及安全硬门裁决，没有Auto Review拒绝。

### 2026-10-10 ENGINEERING_02 ADR-0224完整准确批准激活

负责人明确批准13a5d7b9…完整观察、锁和替代验证方案，真实批准记录934d03ff…；任务§113。
52条p06主源、一条只读bootstrap与w05/P5/B26/B27激活，先当前组件观察再准确锁定和处置。
原累计限额、两窗口、七天截止不增；旧w01–w04 HALTED、首失败和UNKNOWN保持。
当前累计6SSH，其余0；产品、UIA和Win7 NOT_PERFORMED，范围内动作继续直接完成。

### 2026-10-10 ENGINEERING_02组件观察通过，p06冻结及w05本地首失败

任务§113.1：Win10元数据只读调用退出0，准确组件锁05f6b85b…，raw0349587a…。
任务§114：p06的113/75/21及128/88/31/33检查PASS，冻结7f84ce3f…；本地首红及完整源快照保留。
真实恢复在本地validate_spec拒绝两件已批准数据文件，恢复claim/SSH/目标访问/Kill均NOT_PERFORMED。
w05 HALTED及首失败ed6e777c…保持；累计7SSH，其余0，没有Auto Review拒绝。
ADR-0225/任务§115完整三槽位替代v3材料ef9eab85…为Proposed，1518件保护复核通过。
一次明确p07–p09/w06–w08的156源路径、普通失败有界替代、全阶段至多一次准确旧实例恢复；未提交v1/v2保留。
原累计预算、两实际窗口与截止保持；UIA、产品与Win7 NOT_PERFORMED，当前任务未完成。

### 2026-10-10 ENGINEERING_02 ADR-0225完整数据闭包阶段批准及执行

负责人准确批准ef9eab85…和ADR-0225，真实记录047e3faa…，任务§116。
p07冻结后，Win10单次准确恢复同句柄Kill一次，退出证明ae0ba55b…；旧超时UNKNOWN保持。
w06本地消费者缺口与w07日期模板失败均保存首失败和HALTED，再按获批条件进入下一源码槽位。
p08实际22件PS5.1解析通过；p09冻结前完成完整标识替换、哈希和日期消费修复。
开发机p09的113/92/21及128/88/31/33检查PASS，冻结20e15a4f…。
原组件锁、冻结输入和失败证据保持，不重复任何旧claim或Kill。

### 2026-10-10 ENGINEERING_02 w08归档首失败及完整剩余阶段提案

任务§117：Win10当前解析、环境、15件旧实例、新P8目录、准确复制和两次上传前序通过。
归档步骤退出1，原始20a3b175…/5f717f44…与w08 HALTED保留。
冻结包装器缺少子身份、held退出与具体错误；当前历史根因和退出UNKNOWN。
开发机b73afc72…确认类型和当前根消费缺口，SURROGATE不升级为目标根因。
累计23SSH、2上传、25会话，上传102144334字节、准确原生与输入复制177787字节。
产品、UIA、请求、SYNC、窗口和Win7 NOT_PERFORMED，整体NOT_COMPLETE。
§118/ADR-0226提出313路径、六源码槽位、最多三个新部署根及唯一60秒只读前检。
准确v2材料266023字节/cafa7ced…，749项材料核对、4657件保护复核PASS。
已有ZIP只读复用、完整十请求链路和有界失败取证一并列明；原累计限额、两窗口及截止不增。
新源和新轮未创建，Proposed等待一次负责人裁决；没有Auto Review拒绝。

### 2026-10-10 ENGINEERING_02 ADR-0226完整剩余阶段批准激活

负责人准确批准cafa7ced…完整阶段，真实记录5b2b5e11…，任务§119。
313源路径及p10至p15/w09至w14激活，先唯一只读前检再完成新工具及完整产品链路。
p10的52源/三数据按准确P09字节复制，未冻结；4657件历史保护复核PASS。
原25会话、两窗口、累计限额及截止保持，所有旧HALTED与UNKNOWN不改判。
范围内动作直接完成，产品、UIA和Win7 NOT_PERFORMED。

### 2026-10-10 ENGINEERING_02 p11完整本地修复、当前归档本体与生命周期硬门

ADR-0226准确批准后，唯一W09只读目标报告通过，已知244字节传输提示误判与HALTED保留。
p11冻结014800ed…，116/100/21及128/88/31/33本地检查通过，4657件历史保护不变。
Win10 23件PS5.1解析、Text/生命周期/环境、P10创建/复制和工具上传通过。
归档包装最终空缓冲Hash重载失败，w10 HALTED；实际错误和全部冻结输入保留。
三个原范围只读SFTP取得809字节结果48c56008…，784产品/73宿主本体报告完成。
子21280创建ticks和held退出仍UNKNOWN，产品与窗口未执行；实际累计38会话。
任务§120/ADR-0227准备一次当前只读生命周期准确裁决和原剩余阶段条件，材料aff010e6…。
19项材料核对、5786件保护PASS；新源/p12/新调用未创建或派发，硬门保持。

### 2026-10-10 ENGINEERING_02当前生命周期准确裁决获批

负责人准确批准ADR-0227及55748字节/aff010e6…；真实记录cbdf4491…，任务§121。
准确只读源cad8eea4…已生成，5786件保护哈希PASS，新增只读截止05:52:12.971922Z。
先一次60秒当前生命周期门；通过后继续原四剩余源槽位，不增加累计预算或窗口。
此时门NOT_PERFORMED，38会话；w10首失败、HALTED及历史UNKNOWN保持。

### 2026-10-10 ENGINEERING_02当前门通过、捕获修复及最后部署根用尽

ADR-0227准确当前只读门exit0、旧匹配实例为空，结果锁f141e7e8…；历史w10退出UNKNOWN保持。
p12实际空/非空SHA夹具通过，归档子29900同held句柄exit0；字符捕获隐式重载破坏JSON，原w11首失败/HALTED保留。
原范围p13冻结8c9d3476…，显式Char[]修复并先通过实际ASCII/中文/跨缓冲区完整SHA夹具。
Win10 w12完整784/73归档合同与工具解析/运行时校验通过；随后生产器旧摘要拒绝，原始1278字节04ef141c…保留。
子28212/ticks639272944710167788同held句柄exit1且关闭无错误；内部Node、普通入口、UIA、产品和SYNC未启动。
三新根已用，累计66会话、上传104904124/独占复制711148字节，主窗口1，产品请求0。
原p14本地修复116/106/21通过，四组driver按未变字节继承，6830件历史保护PASS；未冻结或发远端。
任务§122/ADR-0228一次额外根提案：根3→4及产品/宿主展开派生额度增加；原其他上限和截止不增。
材料66689字节/1c223268…，新根与新窗口NOT_PERFORMED；整体NOT_COMPLETE，依赖额外根的远端动作等待准确裁决。

### 2026-10-10 ENGINEERING_02一次额外根准确批准

负责人直接批准ADR-0228及1c223268…准确材料；真实记录73f81df9…、额度绑定72383a10…，任务§123。
批准观察06:20:11Z，原截止与累计额度不增；三根/一个窗口已用，最多一额外根及最后一个主窗口。
6830件历史保护再次PASS；源在原p14路径绑定准确批准后冻结并直接继续固定Win10完整阶段。
此时累计66会话、产品/SYNC0，全部首失败、HALTED、UNKNOWN及Win7 NOT_PERFORMED保持。

### 2026-10-10 ENGINEERING_02摘要实机闭合与报告目录首失败

p14冻结6851181a…，116/108本地直接检查与原报告/driver未变字节继承，6830件保护再次PASS。
Win10两只读门、23源解析、完整生产器八条件/空SHA/完整字符捕获夹具通过；第四P13根及完整784/73归档和工具通过。
第二主窗口06:25:54.960Z至08:25:54.960Z，master6c0399fd…；首准入上传/哈希通过。
mode-prepare缺tool-checks父目录失败，原始1457字节76c62ae3…及w13 HALTED保存。
子16692同held句柄exit1，前原生Node独立实例报告UNKNOWN；普通入口、UIA、产品、SYNC未执行。
原根4/窗口2已用；累计83会话、106020025上传/888935复制字节，历史证据不回改。
任务§124/ADR-0229提出一次60秒当前门、最后p15复用准确P13物理文件及一个新增控制窗口，材料25ed0d3a…。
保持四物理根和原其他预算/期限；7713件保护PASS，p15/新调用/窗口未创建，整体NOT_COMPLETE。

## ENGINEERING_02 ADR-0229执行与ADR-0230完整替代提案（2026-10-11）

负责人结构化批准ADR-0229；真实批准b993bf67…、绑定cc9e9c66…，任务§125。
p15完成原52路径修复和必要本地检查，冻结3c9e5d10…、源清单087fdbb1…。
实际Win10唯一只读门因主代理生成脚本赋值Host只读变量失败；w14 HALTED、首失败、原始输出和UNKNOWN保留。
本轮仅1SSH、新上传/写入/窗口/产品/SYNC0；累计84会话、四新根/两窗口。
任务§126/Proposed ADR-0230整理p16/w15完整替代阶段，先最多两次冻结前实际PS5.1合同检查，再唯一当前门和原完整链路。
原累计会话/字节/请求/SYNC/根/窗口/截止不增；准确材料58716字节/1cf6211c…待批准。
新实现与调用NOT_PERFORMED；整体NOT_COMPLETE，Win7与负责人最终验收NOT_PERFORMED。

## ENGINEERING_02 ADR-0230执行与当前容量裁决提案（2026-10-11）

负责人准确结构化批准ADR-0230，真实批准ab483d57…及绑定1d6c7296…，沿用任务§127。
p16第一次实际PS5.1合同正常拒绝Error参数；首失败/52源快照保留，同范围改为captureError。
第二次合同exit0，26件输入及完整Host等负例通过；52源同字节冻结b88a52c6…、源清单fd45f396…。
w15唯一当前门返回CURRENT_REUSE_FREE_SPACE，未输出准确剩余字节；首原始错误、HALTED及当前入口held退出UNKNOWN保留。
本轮3SSH，其余上传/写入/窗口/产品/SYNC0；累计87会话、106020025上传/888935复制字节、四新根/两窗口。
任务§128登记实际结果，§129/Proposed ADR-0231提出一次30秒容量只读观察；材料4186字节/c688502b…。
原4GiB门和所有累计上限不改，不恢复旧run、不清理删除；19项材料检查及9435历史/68当前保护哈希通过。
整体NOT_COMPLETE；下一步准确诊断、完整产品、Win7及负责人最终验收NOT_PERFORMED。

## ENGINEERING_02 ADR-0231一次容量只读取证完成（2026-10-11）

负责人真实结构化批准一次容量诊断；批准b7189740…、绑定020d3831…，任务§130–130.1。
唯一claim先于启动消费；固定Win10查询SSH退出0，C盘可用4065550336/已用173585240064字节，原4GiB门缺229416960字节。
冻结本地Python3.9收集器拒绝.NET七位小数时间戳；原CALL_FAILED与错误、原始stdout781字节4f7425f4…保留。
仅核验既有原始字节，准确100ns时间窗口和其他原合同字段通过；補核验3660字节ee6190bc…，无新远端重试，不改判原调用。
本地28项守卫及格式最小复现通过；9435历史/68当前保护哈希PASS，p16冻结、w15 HALTED、首失败和UNKNOWN不变。
当前累计88会话（77SSH/8上传/3只读SFTP），w15诊断4/4已用；字节、根、主窗口、截止不增，产品/SYNC请求0。
Gate为ENGINEERING_02_CURRENT_CAPACITY_GATE_FAILED_DIAGNOSIS_EXHAUSTED；本次只读范围已执行完，整体NOT_COMPLETE。
容量恢复、清理、系统修改及新主轮次未获本次授权；完整产品、Win7及负责人最终验收NOT_PERFORMED。

## ENGINEERING_02停止验证工具扩建并收敛最后产品机会（2026-10-11）

负责人仅授权本地只读分析和记录新方向：一个工作日、一次替代主批次，禁止继续扩建工具；沿用任务§131/Proposed ADR-0232。
复核当前分支/HEAD、p16的52源哈希及原容量/预算；累计88会话、产品/SYNC0保持，本轮远端与实现0。
原P13产品/宿主867文件闭包可只读复用，不新建物理根、不重传ZIP；c07/r05诊断PASS不替代产品/Win7。
容量原门最小缺229416960字节；原单轮工具/复制/证据预算共539081190字节，实际临时目录/物理分配需求UNKNOWN。
现有记录无合格非关键C盘可删除目标；P13/P12候选、P8冻结ZIP及全部证据KEEP，没有删除动作。
冻结前PS5.1合同已通过；目录/hash及隔离UIA实际能力路径受assert_frozen和当前pin准入约束，移到冻结前需改动编排，无直接继承证据。
据此建议暂停派发并保留一次机会，不启动新的建设任务；合并裁决材料25127字节/7ded23de…标为执行未就绪。
保留未来首两项Boot/Background为十请求中的前两项，再续八阶段与完整退出证据；上限8工作小时/一次最终冻结/一次2小时主窗口，原累计预算不增加。
首工具失败或任何硬门/越界/到限停止，不自动增加版本/轮次/预算；整体NOT_COMPLETE，Win7与负责人最终验收NOT_PERFORMED。
本轮没有候选、run、claim或窗口生成，没有远端动作、删除、Git交付或冻结字节修改。
材料15项核对、52件p16源与9435历史/68当前保护哈希PASS；文档检查207文件/51任务及diff --check通过。

## ENGINEERING_02冻结判据已澄清，下一步仅补齐容量依据（2026-10-11）

负责人允许未改动的UIA、当前身份及退出动态准入在冻结后、产品前执行；已知工具修复及受影响实际运行时检查仍须冻结前完成，任务§131.1。
真实回复记录638字节/5e6655d4…；§131及v1的原静态分析保留，冻结顺序不再构成工具改造理由。
更精确地说，解除的是未变化动态准入前移要求；已知报告目录修复的既有夹具仍须冻结前完成，尚无当前通过证据，不将其归入豁免。
更新合并材料v2为26724字节/e56c8127…，Proposed ADR-0232仍不授予实现、远端、容量删除或替代批次权限。
当前准确容量处置对象为空；最近Win10容量读数距原4GiB门缺229416960字节，514.1MiB为原可见写入预算上限，额外余量是假设，真实额外增长UNKNOWN。
下一步先补齐非关键产物身份、大小与保留/恢复依据；需要现场盘点时只提出一次有界只读范围，不扩建工具，本轮未连接远端。
然后一次准确裁决合并容量、既有绑定消费者、新不可变副本/轮次及首两项真实产品请求后的十请求/八阶段完整收口；仍限8工作小时、一次主批次及120分钟窗口。
p16冻结、w15 HALTED、首失败、历史UNKNOWN及全部候选/证据保留；88会话、产品/SYNC0与原截止不变。整体NOT_COMPLETE，Win7及最终验收NOT_PERFORMED。
本轮13项规划核对及33件引用字节检查PASS，记录3288字节/5eafa3dc…；仅改原文档与规划材料，不重复历史全量或产品验证。

## ENGINEERING_02收口执行请求与容量对象准确材料（2026-10-11）

负责人选中完整收口方向并要求“执行”；沿用原任务§132，保留准确材料先获批及4GiB/保护/生命周期硬门。
已有容量对象为空；本轮先准备一次固定目标60秒只读项目产物元数据查询，Proposed ADR-0233，不新增验证工具实现。
复用p16冻结传输/捕获和准确已有组件锁；只读C盘及固定Local下A9-Engineering项目目录，限32根/16384条/深度16/正文25秒，无reparse遍历或项目内容读取。
准确材料4177字节/8f4da9af…、源码18592/输入24989字节、命令7382字符；12项本地核对与必要引用哈希PASS。
v1路径转义与内容读取计数措辞在本地修正，原草案保留且不派发；实际PS5.1检查与新查询尚未执行。
新远端、删除、候选、主轮次、窗口、产品/SYNC均0；88会话与原累计预算/截止、p16/w15和全部历史保护不变。
Gate为ENGINEERING_02_LAST_CLOSURE_CAPACITY_OBJECT_GATE_JUDGMENT_REQUIRED；整体NOT_COMPLETE，Win7及最终验收NOT_PERFORMED。


## ENGINEERING_02一次只读盘点完成，最后完整阶段材料就绪（2026-10-11）

负责人准确批准ADR-0233/v2；唯一claim先消费，新SSH正常完成，query.result为READONLY_QUERY_COMPLETE_NOT_ADMISSION_OR_PRODUCT。
2026-10-11T14:46:26.0397461+00:00 Win10可用15301918720字节，原4GiB容量观察PASS，元数据25根/8307条完整；已分配/可回收和容量变化原因UNKNOWN。
全部25根KEEP，删除/清理/移动/归档0；查询实例20292/ticks639273267848288930独立held退出UNKNOWN，不能提升为生命周期/产品准入。
当前累计89会话（78SSH/8上传/3只读）、上传106020025/复制888935字节，产品/SYNC0，全部历史不重置。
开发机冻结复用消费者直接复现七位UTC格式拒绝，静态生产器关联确认；红证据保留，不修改p16、不生成新实机失败。
任务§134与Proposed ADR-0234合并唯一完整方案：无容量处置；新p17/w16/B48/B49必要绑定、当前observed_at精确100ns比较和既有夹具冻结前顺序；22窄改/30只复制共52源。
一次30/60/30秒冻结前门后同字节冻结；动态准入后普通入口先两真实请求证据，再合同十请求/八阶段与完整退出收口。
准确v2材料89474字节/44c7f94c…，24项本地核对、71引用对象哈希PASS；p17/w16/新窗口/实现/远端/产品均未执行。
新增上限8小时/一次主批次、一次剩余第三2小时窗口；最坏260会话，原344会话、字节、请求/SYNC及截止不增。无新物理根、ZIP、依赖、权限、架构或检查种类。
当前Gate为ENGINEERING_02_SINGLE_FINAL_PRODUCT_CLOSURE_PHASE_APPROVAL_REQUIRED；仅等待一次完整准确范围裁决，批准后不逐文件/调用求批。
再遇工具缺陷、安全/完整性/审计/未知生命周期/容量硬门或到限，保留首失败停止；不追加版本/预算/建设任务。
整体NOT_COMPLETE，Win7实机与最终负责人验收NOT_PERFORMED；全部冻结输入、首失败、HALTED与UNKNOWN保持。


## ENGINEERING_02最后完整阶段准确批准（2026-10-11）

负责人真实结构化批准ADR-0234/v2（89474字节/44c7f94c…），观察23:29:00.005280Z；8小时截止2026-10-12T07:29:00.005280Z。
已登记准确owner与binding并激活§135唯一p17/w16/52路径；当前89会话与请求/SYNC0不重置。
范围内窄修复、现有必要检查、一次最终冻结及唯一产品批次直接推进；冻结p16、w15 HALTED与全部历史保持。
批准时新调用/新窗口/产品NOT_PERFORMED；整体NOT_COMPLETE，Win7与最终负责人验收NOT_PERFORMED。


## ENGINEERING_02冻结前三处测试输出范围遗漏（2026-10-11）

p17/w16按ADR-0234本地准备，首本地绑定/哈希错误保留并修正；本阶段远端和主批次0。
124消费者、21报告及原128/88/31/33驱动检查通过；Node118有6个CLI被旧p16输出绑定拒绝，另两件只复制测试仍绑定旧p03输出。
不编辑只复制源、不跳过或绕过检查；任务§136与Proposed ADR-0235准备同一完整阶段准确修正，三件各一行输出改至w16/local-checks。
准确v3材料97195字节/06e7ed5b…，52路径/版本/批次/原截止/预算均不增，分类25窄改/27复制；三拟改源未动。40项核对、70引用保护哈希PASS。
89会话与产品/SYNC0保持，首失败、冻结p16和全部历史保留；新实际门/冻结/窗口未消费。
Gate为ENGINEERING_02_FINAL_PHASE_LOCAL_TEST_BINDING_SCOPE_JUDGMENT_REQUIRED，整体NOT_COMPLETE，Win7与产品NOT_PERFORMED；不批准则建议暂停，不追加投入。


## ENGINEERING_02同阶段测试绑定修正准确批准（2026-10-11）

负责人结构化批准ADR-0235/v3，97195字节/06e7ed5b…；观察UTC2026-10-12T00:42:13.409973Z，原07:29:00.005280Z截止不重发。
真实owner c54ca42d…/binding5424add3…已登记；同一52源中三件各一行补丁应用，25窄改/27复制保持；新远端、冻结、主窗口、产品仍0。
任务§137直接继续原唯一阶段；89会话、首失败和全部历史保持，整体NOT_COMPLETE，Win7及产品NOT_PERFORMED。

## ENGINEERING_02唯一替代部署首失败与止损收尾（2026-10-11）

ADR-0235三件绑定修正完成，118Node/124消费者/21报告及原128/88/31/33驱动检查通过。
三项实际冻结前门各一次PASS：PS5.1合同，七组件/867物理閉包/旧当前匹配空/原4GiB容量，目录/Hash夹具三目录两公开文件138字节。
同52字节p17唯一冻结43b44299…/源清单d03b378e…；部署前两门返回0，reuse-stage-namespaces于UTC2026-10-12T00:49:58.394202Z退出1。
Win10原始错误Get-Item找不到不带根的\control\versions；冻结源未括号路径拼接数组与错误一致，仅作静态推断，不重发实机或修改冻结源。
首stdout0bb0e6dc…/stderr06d89ba8…及CALL_FAILED/UNKNOWN_SSH_STDERR_RETAINED、w16 HALTED保留；PID9528/ticks639273629974042869独立held退出UNKNOWN，远端命名空间状态UNKNOWN。
本阶段6SSH、上传/复制/产品/SYNC0；累计95会话（84SSH/8上传/3只读）、上传106020025/复制888935字节、四根/两窗口保持。
新主窗口、任务/入口、首两项及完整产品、UIA退出/正常停止、Win7均NOT_PERFORMED；无新诊断、Kill、清理或Git。
按一次机会策略停止并建议暂停，不自动追加版本、轮次、预算或建设任务；剩余未签发窗口不转成重试权限。
停止材料33883字节/e089e9b3…，104冻结源及27不可变副本保护PASS；全部历史和首失败保持。
Gate为ENGINEERING_02_FINAL_SINGLE_ATTEMPT_HALTED_TOOL_PATH，整体NOT_COMPLETE；当前产品与Win7证据缺口保留。

## 工作状态与同名分支Git同步（2026-10-15 UTC）

负责人要求“同步工作状态，同步本地Git远程Git”。执行代理已在隔离A9-33分支提交当前状态、完整Alpha2缺口对账及授权记录为 `013cf7966c1f5858e2a2c58542d6f9495e88d29e`，并完成A9-30/31/32/33/35同名远程推送。本主工作区只追加3件状态入口指引，再将codex/a9-alpha2同名推送；实际ref结果保存在.acceptance/runs/A9-33-W45/5773470e-a1c0-402b-8454-966e38a73f68/preparation/git-sync-20261015-01。

主工作区原HEAD a53c9b9…，47项状态展开64件保护路径。原字节与缺失状态先核验，3件文档留原件；只暂存HEAD上的本次新增段落，原有dirty/untracked继续未提交，无stash/reset/强推/清理。主分支main与origin/main仍c14a968…，本轮不进行主线整合或发布。

WIN7-45的25用例/43断言直接PASS、独审0P0/1P1/0P2保持；KL-12已延期且P1/NOT_PERFORMED，门B与完整Alpha2/RC仍未签。详见[准确状态来源](https://github.com/allin2/win7-coding-Agent/blob/013cf7966c1f5858e2a2c58542d6f9495e88d29e/docs/STATUS.md)和[Alpha2当前待办](https://github.com/allin2/win7-coding-Agent/blob/013cf7966c1f5858e2a2c58542d6f9495e88d29e/docs/plans/A9_ALPHA2_GAP_DISPOSITION.md#6-win7-45-之后的当前待办对账2026-10-15-utc)。

### M2诊断入口失败与整合工作树状态同步（2026-10-22 UTC）

整合工作树codex/a9-alpha2-integration-r2@74ac9ef7的A9-39 §11.8.87：两次诊断未进入探针，M2未解决；默认产品数据目录影响UNKNOWN，已按ENGINEERING_03 §7停止追加上机。开发根已close并独立确认根不存在、锁null、进程/任务0。候选与旧失败不变，修正材料未派发，正式验收未通过。主工作区产品与原有修改保留。

### M2按指定workflow继续的整合工作树同步（2026-10-22 UTC）

负责人“继续推进项目”已登记整合工作树A9-39 §11.8.88。pi复用既有会话执行本地备料，主会话独审后一次隔离Node调用定位。源74ac9ef7与候选不变，默认目录影响UNKNOWN保留，当前没有新实机或正式验收结论。

### M2推进被pi模型服务阻断的状态同步（2026-10-22 UTC）

整合工作树A9-39 §11.8.89：pi本地读取后当前模型入口502，同会话恢复和极小请求均失败。没有新脚本交付或Win7动作；源74ac9ef7与候选不变，历史UNKNOWN/FAIL/HALTED保留。已准备临时pi模型选项，未切换、待负责人答复。

## M2 由 pi GLM 5.3 Max 继续备料（2026-10-22 UTC）

负责人明确要求“检查pi可用模型，使用glm5.3 max”并继续解决M2及相关实机验证。
开发机离线清单包含magpie/trae-cn/glm-5.3-max；实际请求及read/write/bash检查PASS。
CLI请求thinking=max，有效会话记录high；模型记录为trae-cn/glm-5.3-max，不将两者混同。
pi已用精简执行上下文继续原本地诊断准备，旧会话和502证据保留；全局配置未改。
主会话负责独审，通过后只执行原范围的一次Win7隔离Runtime诊断，不重跑整批。
源74ac9ef7、WIN7-51 ZIP76112a28…未改；M2仍未解决，旧FAIL/HALTED及默认目录影响UNKNOWN保持。
本段登记时，新诊断审核、目标运行和正式验收均NOT_PERFORMED。
证据在整合工作树m2-call-diagnostic-r2-pi/glm53-max-health/MAIN_VERIFICATION.json；任务记录见A9-39 §11.8.90。

## M2 诊断草稿审核退回，pi限制工具后继续（2026-10-22 UTC）

主会话发现pi执行了禁止的本地`/tmp`清理命令，已向准确绑定日志的pi进程发送SIGINT，退出130。
该命令成功执行；清理前目录内容与删除影响UNKNOWN，未清理当前残留。
原始96次工具调用中未发现目标通道或SSH/SFTP动作；没有新的Win7证据。
两份未封装草稿保留，未签READY；独审发现身份未硬门、错误方法名、观察改变异常语义等问题，已退回。
恢复同一pi会话时禁用shell，并加入调用前路径校验：只允许read/write/edit，写入限本任务diag目录。
主会话维护的工具守卫经10项本地检查及实际pi正反写入检查PASS；它不改变产品或目标安全模型。
pi继续修改诊断，主会话执行独立检查与审核；当前仍不连接Win7。
GLM5.3 Max模型保持，CLI请求max、有效thinking记录high；全局配置未改。
源74ac9ef7、WIN7-51及历史FAIL/HALTED、默认目录影响UNKNOWN保持；M2未解决，正式验收NOT_PERFORMED。
准确材料：整合工作树m2-call-diagnostic-r2-pi/PI_SCOPE_STOP.json、MAIN_PREP_REVIEW_R1.md、workflow-guard/MAIN_SMOKE_VERIFICATION.json；A9-39 §11.8.91。

## M2 单次诊断本地修订，尚未上机（2026-10-22 UTC）

开发机：pi使用配置项magpie/trae-cn/glm-5.3-max，实际请求与本地工具检查PASS。
初始CLI请求thinking=max实际记录high；长修订出现约11分钟只有读取、未交付修改。
主会话改用同一模型的thinking=off进行本地单项验证，实际完成两处修改；后续本地备料沿用该参数。
该参数由主会话选择，不冒充负责人额外指定的推理档位；全局配置与主代理档位未改。

源74ac9ef7、WIN7-51 ZIP76112a28…保持；未修改产品/Core/Runner/原生或候选。
pi实现候选外探针及PS草稿，主会话维护执行守卫并独立检查。
本地直接执行实际探针的合成入口失败检查、日志上限/返回语义检查、身份反例与清理反例已通过。
这些是开发机合成检查，不能提升为Win7、UI/IPC或M2 PASS。
父启动器曾把非零子退出误判为成功，已修正；其余回收、路径和记录问题正在修订，尚未签READY。
首个失败日志与修订结果分别保存，未以新结果覆盖旧FAIL；中断前已完成的局部修改按实际工具记录保留。
pi曾越界执行本地/tmp清理，清理前内容及删除影响UNKNOWN；原始记录保留，没有再清理该目录。
守卫现禁用shell、限制diag内写入，并在连续两次修改失败后阻断后续修改。

本轮新Win7身份查询、上传、调用定位和清理均NOT_PERFORMED；不使用旧关闭快照冒充当前状态。
默认产品目录历史影响UNKNOWN、原M2 FAIL/HALTED及根因UNKNOWN保持。
最短后续链：启动器/观察点收尾→封装与独审→新实机预检→同入口能力准入→一次合成调用→原始证据回收。
如需白名单外产品修复，先形成准确证据与最小范围提案，不自行扩大实现授权。
最终目标仍是实机验收通过；正式门A/B、M5授权、Alpha2/RC边界不变。
准确材料在整合工作树m2-call-diagnostic-r2-pi/，任务记录为A9-39 §11.8.92。

## 当前 M2 workflow 与执行模型（2026-10-22 UTC）

负责人指定主会话使用GPT-6.1-Sol/xhigh/Fast。
当前会话记录为gpt-6.1-sol/xhigh；本地service_tier配置为fast。
实际请求服务档位未在turn_context回传，不据配置推定服务端兑现。
pi执行者改用magpie/trae-cn/DeepSeek-V4-Flash-Official-max。
开发机模型请求及read工具检查PASS；不作为Win7产品证据。
主会话负责派单、独立审核、验证及原始证据核验。
pi负责候选外实现和获准的执行步骤；全局配置未改。

源74ac9ef7、WIN7-51 ZIP76112a28…保持。
当前仍为候选外诊断本地修订，未签READY，未连接本轮Win7。
GLM旧进程按日志绑定停止，退出130；该次调用没有修改工具调用。
新pi首轮因派单目录简写发生只读路径错误，原日志保留。
主会话补齐准确绝对路径后，pi在同一执行会话继续修订。
工具守卫仍只允许read/write/edit，写入限diag，连续两次修改失败即停。

后续按本地修订→独立审核→封装→新实机预检→一次隔离Runtime调用→证据回收推进。
产品源码白名单、45秒协作Stop、外层120秒、无自动整批重试保持。
M2旧FAIL/HALTED、根因及默认产品目录历史影响UNKNOWN保持。
正式验收NOT_PERFORMED；M5禁令、门A/B与冻结边界保持。
准确记录见整合工作树A9-39 §11.8.93与m2-call-diagnostic-r2-pi/deepseek-official-model-switch/。

## M2 诊断本地审核完成，Win7准备执行中（2026-10-22 UTC）

开发机诊断独立审核PASS，0 P0/P1；20项执行输入已按SHA256封装。
源74ac9ef7与WIN7-51 ZIP76112a28…保持，输入seal为74431d52…。
六项本地检查通过，覆盖实际诊断入口失败、日志上限、返回语义、身份、Stop分类和清理。
每步精确命令守卫及串行停止规则已在实际pi所用Node22运行时检查。
这些不是产品、Win7或正式M2 PASS。

新Win7只读预检PASS：DCCS-CHAIZL-PC/build7601、agent会话2，根不存在、锁null、进程/任务0。
空闲901187194880字节；该快照只用于本轮准备前准入。
pi现执行候选校验、五份固定输入上传、实际PowerShell解析和根内PowerShell能力检查。
每步串行，前一步失败后守卫阻断下游；没有任意shell或自动重试权限。
唯一一次Runtime调用、调用结果回收及生命周期收尾尚NOT_PERFORMED。

当前主会话按负责人要求使用GPT-6.1-Sol/xhigh，Fast为已核对的本地配置。
pi使用magpie/trae-cn/DeepSeek-V4-Flash-Official-max；本地执行参数thinking=off保持。
主会话负责协调、独立审核、检查及原始证据核验；pi负责候选外实现和获准执行。
复杂请求连接错误、首个语法错误和修改失败原始记录均保留；已解释的问题通过小范围修改闭环。
额外helper/callback插桩未实现；未直接观察的帧/回调详情UNKNOWN。

M2旧FAIL/HALTED、根因及默认产品目录历史影响UNKNOWN保持。
如实机证据要求Core/Runner白名单外修复，先形成准确证据和最小范围提案。
正式验收、门A/B、M5和冻结边界保持；没有提交或推送。
材料在整合工作树m2-call-diagnostic-r2-pi/MAIN_LOCAL_REVIEW.json、INPUT_SEAL.json与deepseek-official-model-switch/。

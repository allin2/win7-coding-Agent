# A9-31：manifest取证接入与R5普通桌面续验

日期：2026-10-04。Status: DRAFT_NOT_APPROVED（修订稿r3，仍未批准）。请求批准§1–5及ADR-0172的有限普通取证接入。此前manifest诊断已获批并完成；本材料尚不构成实现或远端执行授权。

修订说明：r1（SHA256 `ee801e62d49550827ea2c85a7d45da62946033117b3052d8ed2f8bce8dea0b78`）经只读可行性评估后新增§5，补写停止握手、phase与请求对应、跨账户权限、准入探针覆盖和时间容差。§5与§1–4冲突处以§5为准；未被§5提及的§1–4条款不变。r3（r2 SHA256 `8d1dd73d15905f812017228d514d3722d9f98cba3f6ce9ff08d6114421f90134`）记录负责人对D1、D2的采纳，并以对R4控制源的只读核对补正§5.2（D3）。采纳D1/D2是对草案内容的取向，不是对本草案的批准。r2/r3不改变任何边界：不放宽原未知生命周期门、不新增依赖或API、不授权任何执行。负责人此前的最后一次批准只绑定manifest补证材料§1–3，不绑定本草案任一版本。

## 1. 基线、结果与准确文件范围

工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`，HEAD ebda91123e62b225c3fd104c9c9b564a4b61c466。产品仍为r3 ZIP d951a89af285c4e60c5f4701efbfd54f34627fe103d8257c83636479f82ac74b、manifest0060fffff80335d48abd75e2bb784106114af7cca92db0b98e40ad8a65357a68，784产品/73 host文件。原固定capture源/DLL/MVID、native helper、产品和锁不变，不恢复R10或任何HALTED入口。

Win10隔离manifest诊断已直接证明12 cmd/12 conhost完整事件，cmd CreateTime/ExitTime逐FILETIME等于持有句柄，conhost Start完整系统路径、同PID+CreateTime的End及exit0，零丢失/会话停止。Start实际version3、Stop version2；Stop仅basename，完整映像事实来自Start，绝不把basename改写为End提供了完整路径。v3源2ecf0ee5b927fd1c8ac316e212515c62f4961002615970d27c46b5e80d0754a5、EXE1428b9f421cc86349343ee23cd2de6020082d661921c2fc7fd0a09c138a73c76/MVID e08a0d38-a05f-4e3d-aec5-102a2498c808；真实报告0f3508466e0c889d7044bc0e3d64dc3d53005f9e21622b6d5a622b981fc3d590。36项实际报告反例及7项路径/配对自检通过；[统一报告](../reports/2026-10/a9_31_product_r3_package_and_win10_execution_2026-10-04.md)保留全部首失败与限制。该隔离证据不是普通产品PASS。

批准后先在任务书登记下列准确六源，再实施：

- `.acceptance/a9-31-developer/product-r3-retry-r5/control-scripts/stage-product-r3.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r5/control-scripts/launch-product-r3-desktop.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r5/control-scripts/serve-product-r3-desktop.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r5/control-scripts/product-r3-driver.cjs`
- `.acceptance/a9-31-developer/product-r3-retry-r5/event-sources/manifest-process-observer.cs`
- `.acceptance/a9-31-developer/product-r3-retry-r5/event-sources/launch-manifest-observer.ps1`

四控制源只以已检查R4版本为基础，新增R5绑定、事件组件闭包/准入、准确conhost证明读取及最终收尾门；driver只适配新根/版本绑定与取证信号，不改变产品断言、真实对话框、原关闭修复或SYNC安全片段。原始query-failure独立保留，新增proof关联其observation_id，不改原unknown字段、不假造native句柄。

新事件组件从已验证manifest两源提炼，不把诊断中启动cmd的功能带入普通观察器。观察器只采集当前准确请求所启动的普通进程树；执行命令仍由原普通控制器完成。继续固定Framework64 csc/三个引用、已锁定advapi32/tdh/kernel32及10个已批准ETW/TDH/路径API，无新依赖或系统API；新source/EXE/MVID/build/pin单独冻结，不冒充诊断EXE字节继承。

## 2. 事件proof合同及权限分离

目标192.168.1.4/WIN-2JQ66JE4HTQ/Win10 19045。Administrator通过现有Strict SSH启动独立观察器并持有其实际句柄，产品/dispatcher/worker仍由a9builder SID1005、Session3、Medium8192、非提升、InJob=false运行。观察器不改变普通账户权限，不注入产品，不创建计划任务/服务，不修改ACL/UAC/注册表/系统或远控配置。

每请求只有一个新自有实时会话`A9-A31-R5-Manifest-<request_id>`。启动前验证准确普通dispatcher PID+OS creation及Session、当前master/revision/request和组件字节；观察器就绪回执到达且已核验后，代理才发布原九字段请求。只采集该新worker及其后代的Start/End，根实例、时间窗和Session必须闭合，其他事件只计数；无命令行、SID、原始ETL、内核地址或无关进程字段输出。

新增proof_kind `MANIFEST_CONHOST_INSTANCE_EXIT_V1`，以不可覆盖的JSON和size/SHA发布回执绑定source、master/revision/request、机器/build、provider/schema、观察器PID+creation/EXE/MVID、采集域和单调记录序号、原observation_id、PID/Parent、CreateTime/Session/Start完整映像、End CreateTime/ExitTime/ExitCode及原快照区间。

仅允许以下准确分支：原Snapshot的Exe为conhost.exe，OpenQueryHandle失败且原生错误87；新Start/End提供同一PID+CreateTime，Start为准确System32/conhost.exe、End镜像名一致，Session3且exit0。其父必须是当前请求的准确System32/cmd.exe实例，cmd Start/End与真实持有句柄或既有只读`/d /c ver` SYNC回执及其已持有Electron父链相符；使用SYNC时新增cmd精确创建事实来自manifest，不反写旧SYNC的UNKNOWN。conhost创建落在该唯一父真实生命周期中，原快照区间与该实例精确创建/退出区间相交且没有PID复用歧义。父进程结束不能替代conhost End。

完整路径只接受Start原完整系统路径或当前固定C:唯一设备映射；Stop若只提供basename，保留该原值并依靠同PID+CreateTime绑定，不能声称Stop含完整路径。所有其他进程/错误类别继续原句柄硬门，不扩大SYNC可接受命令或改原时间边界。

观察器输出有界、每请求≤4096事件/8MiB、≤256个发布文件，总事件证据≤32MiB；超过即停止且不PASS。只对这一新conhost proof允许最多5秒等待字段送达，仍受原phase/总窗口截止限制，不提高120秒选择时限。查询缺失、错绑定、错schema、重复/截断、时间矛盾、父复用、未知exit/丢失立即阻断。等待过程中不派发下一phase。

已有完整实例事实可被标记为本phase待最终核验的事件证明；**phase PASS和下一请求**必须等观察器停止其准确自有会话，三项丢失为0、消费者结束、观察器实际exit0、发布记录与最终清单/摘要一致，且原持有树完整结束。最终摘要由代理经持有观察器的SSH执行回执和完整返回核对；共享文件中的单个ready/End/哈希不能独立签PASS。任一收尾/完整性失败均HALTED，不恢复，不把临时记录升级为最终证据。

观察器每次硬预算不超过原worker12分钟加30秒收尾，并受普通总120分钟限制；仅准确自有session可停止，不结束其他系统会话或进程。观察器、worker或产品失去生命周期证明，立即保存失败并停止后续请求，不用taskkill或修改判据处理。

## 3. 新根、准入与有界修复

准确本地根为上述`product-r3-retry-r5`；远端新根`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R5`。两者必须不存在；无reparse，准备前C空闲≥2GiB，根≤1GiB/5000文件，每请求空闲≥1GiB，运行证据返回≤128MiB。旧根、数据库和历史文件保留。

先登记/编译新事件依赖，实际Win10检查API/schema/普通消费者加载、完整字节闭包和真实最短链路；不重复未变产品/native/capture构建。新master明确事件contract和准确组件登记，九字段请求不变。新C#字段/映射/配对、PS5.1解析/schema、Node16语法/128原自检/88 SYNC/15终态日志及新增事件绑定反例须通过；结果数量以实际输出为准，不继承旧输入下的新增消费者PASS。新增反例包括旧request/跨run/错revision、错观察器/EXE、PID+创建复用、错父/Session/映像、重复/缺失/截断、原错误非87、非conhost、非允许cmd父、丢失/未知/停止失败以及收到End但缺最终收尾。不得弱化原断言。

允许这六源内同范围局部修复，以新不可变版本重新检查；旧首失败和输入不覆盖。准入真实探针最多三轮，每轮≤60秒/≤12个固定cmd-ver，先一组确认后扩展；同类两轮失败先最小共同根因诊断。普通准入/身份/完整性/安全/必需审计/未知生命周期失败停止下游，HALTED不恢复；普通窗口过期或任何第六根另报，不借此扩大权限。

## 4. 普通退出优先与全合同收尾

准入后一次新普通桌面入口，直接核验SID/Session/Medium/非提升/noJob；新窗口120分钟、最多16请求。代理负责观察器启动/就绪/固定请求/状态/返回；普通入口若远控输入不能证明送达，仅请求负责人一次手工启动，不改用管理员产品或未验证计划任务。

顺序：受控Boot/整树结束→Boot→后台最短→StopExit→ReleaseExit→Recovery→完整Background→ready专用负例和完整回收→Shell→EncodingSecurity→FailureBoundaries。所有八phase均取得当前新根直接证据；历史R3部分PASS只作定位。真实原生对话框可由实际有效的远控点击，不能注入/伪造选择返回；输入无效时由负责人协助。Stop/Release选择仍限120秒，迟到观察保留原FAIL。

Stop需真实choice/will-quit/main exit0、准确当前handle终态和整树/事件收尾；Release需同owner/request/releaseId intent+receipt、真实移交存活及最终自然退出；Recovery保留实际93/重新打开恢复且不重放工具；ready负例保持exit94和零下游。新proof只能补足其明确限定的conhost生命周期，不替代产品/State/审计/UI断言。

最终每phase绑定当前source/产物/master/revision/run、普通身份、原始查询失败与新增精确proof、事件会话和全部持有进程实际收尾，逐size/SHA返回、秘密扫描、SQLite副本检查及输入后飞行；更新现有矩阵、STATUS和r3报告。不自签DEVELOPER_VERIFIED、独立或Win7，不占用WIN7-43。

本批准不含产品/native/锁修改或新产品包、系统/账户/ACL/服务/计划任务改动、删除、强制结束旧实例、提交/推送/合并/发布、委派、独立验收、Win7或第六根。失败如实保留，不恢复旧R10。

## 5. r2/r3修订：握手、采集域、权限、准入覆盖与时间容差

本节来自对r1的只读可行性评估（B1–B3、H1、H2）。不改变任何既有边界，仅把r1留白处写成可检查的合同。

### 5.1 观察器停止握手（取代§2中“等待观察器终态”的隐含顺序）

观察器状态机固定为`STARTING→READY→COLLECTING→STOP_REQUESTED→STOPPED_FINAL`，任何异常转`HALTED`且不可恢复。控制器不等待观察器终态，观察器不等待控制器，二者无互等：

1. 控制器在live中对§2的conhost分支只写`PROOF_PENDING_FINAL`标记并继续原phase；标记不是PASS，不得作为下一请求的发布依据。
2. 停止信号**只由代理**发出：经持有观察器的同一Administrator SSH通道，在观察器目录新建不可覆盖的`stop-<request_id>.json`，绑定request_id、观察器PID+creation、master/revision。其他任何一方（含控制器、产品）不得请求停止。
3. 发信号前提三项须同时成立，且由代理逐项核验：原持有树全部实际结束并有终态；控制器已写出该phase的终态候选（非PASS）；观察器记录序号连续且所有`PROOF_PENDING_FINAL`已有对应完整Start/End实例对，或该phase已HALTED。
4. 信号后观察器须在30秒内：停止准确自有会话、读取EventsLost与LogBuffersLost、写最终清单与摘要、exit0。超时即HALTED。观察器无响应时，允许代理仅对准确自有会话名各执行一次已批准的ControlTrace停止（不结束任何进程，不用taskkill），结果只保存为失败证据，不升级为PASS。
5. phase PASS仅由代理在最终摘要、零丢失、观察器exit0、清单与记录一致、原持有树结束全部核验后写入；下一请求发布以该PASS为前提。
6. 观察器12分钟加30秒预算是硬上限，不是常规结束路径；靠预算超时才结束视为HALTED。总时间核算为每请求“phase实际时长+≤30秒收尾+代理核验”，仍受120分钟与16请求限制；准入阶段须用实际数据复核16请求在120分钟内放得下，放不下则缩减后续phase范围另报，不压缩收尾门。

### 5.2 phase、请求与根的对应（取代§2“只采集该新worker及其后代”的歧义）

一个请求对应一个phase对应一个自有会话，不变。已对R4控制源（`serve-product-r3-desktop.ps1`与`product-r3-driver.cjs`，只读）核实逐phase根结构（D3，2026-10-04）：

- 八个phase为Boot、Background、Shell、EncodingSecurity、FailureBoundaries、StopExit、ReleaseExit、Recovery。**只有Recovery有重启**：首个Electron根以退出码93结束并经整树结束确认后，控制器以`A9_TEST_RESTART=1`再起第二个Electron根（父为控制器自身，`New-Pinned $child $PID`），写`electron-restart-pinned.json`，重启根等待上限2分钟，其后整树收尾上限15秒。其余phase均为单Electron根。
- **ReleaseExit不是单根收尾**：存在由`ack-pin-release-exit.json`绑定的3个被钉住实例，其中root与child在Electron退出后按设计继续存活（控制器要求`LIFECYCLE_RELEASE_LIVE_HANDOFF_UNPROVEN`之前必须仍存活），随后须自然退出且退出码均为0；整树收尾上限210秒。这些被释放实例的后代（含其conhost）同样须在采集域内，而其父Electron已先行结束。
- 控制器写出并被代理核验的钉住信号共四类：`worker-pinned.json`（10秒内必须出现）、`electron-pinned.json`、`electron-restart-pinned.json`、`ack-pin-<label>.json`（每个后台/释放标签一份，ReleaseExit为`ack-pin-release-exit.json`）。r2文本只列了前三类中的两类，以此为准。
- 整树收尾上限在普通phase为210秒，Recovery重启后为15秒，而观察器30秒收尾（§5.1第4条）从这些整树结束之后才开始计，二者不叠加成同一计时器。

据此，采集域规则如下（r2规则保留，补正见后两条）：

- 采集根集合只能由控制器已写出且代理已核验的pinned信号（PID+creation）登记；信号落盘前，相应根的事件只计数、不纳入采集域。
- 新根被纳入的条件：其Start事件的父是已证明的当前dispatcher或已纳入的根，且PID+creation与pinned信号相符；否则HALTED。
- 每phase根数上限写入新master的phase表，默认1，仅重启类phase允许2；超出即HALTED。该表属于master/事件contract，不增加九字段请求的任何字段。
- 补正1（Recovery）：第一个根的End或退出码93不得被观察器当作采集结束；会话必须跨越两个根保持COLLECTING，直到§5.1的代理停止信号。第二根的Start父必须是同一dispatcher，且其PID+creation与`electron-restart-pinned.json`相符，PID不得与已登记根重复（对应控制器已有的`LIFECYCLE_RESTART_PID_REUSED`）。
- 补正2（ReleaseExit）：被`ack-pin-release-exit.json`钉住的三个实例按pinned信号纳入采集域，即使其Electron父已退出；其后代的父链以ETW事件中记录的父PID+CreateTime对照已登记实例，不要求父仍存活。该phase的proof判据中“父真实生命周期”按被释放实例自身的创建至退出区间判断。
- phase表默认1个Electron根，仅Recovery为2；ReleaseExit另有3个释放实例，由pinned信号而非根数上限管理。任何未被上述信号登记的新根或实例一律HALTED。
- 不改变“一次新普通桌面入口、最多16请求”的预算；若某phase需要更多根或更多请求，须另报，不在本批准内自行放宽。

### 5.3 跨账户共享目录权限（新增准入第一项实测）

观察器由Administrator写入、控制器由a9builder读取，二者共用R5根下的握手目录，**不修改ACL**，只依赖父目录继承。新增独立失败码`ACCESS_OBSERVER_SHARED_ROOT`，不与观察器逻辑失败混用：

- 根创建后、任何产品phase前，管理员侧先做只读继承ACE查询并保存（早期指示，不据此改ACL）。
- 新普通桌面入口核验通过后、首个phase请求前，由已核验的普通dispatcher（a9builder）读取Administrator预置的固定非秘密探测文件并写回自己的探测文件，Administrator再读取该文件；四个方向（管理员写/读、普通账户写/读）全部成功才继续。
- 任一方向失败：保存证据、HALTED，不修改ACL/UAC/共享设置，不用其他账户或计划任务绕过；该失败发生在消耗任何phase请求之前。

### 5.4 准入探针覆盖PowerShell链（取代§3“固定cmd-ver”范围；负责人已采纳D1）

R4的未钉住子进程判定对任何未获放行的子进程都硬停；Shell与EncodingSecurity阶段的fixture均为PowerShell脚本，其子进程链为powershell→conhost。仅验证cmd链不能提前暴露该链路的同类问题。准入探针改为：

- 轮数与时限不变（最多三轮、每轮≤60秒、每轮总启动数≤12，先一组确认后扩展）。每轮除固定cmd-ver外，须含固定的`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe -NoProfile -NonInteractive -Command exit 0`组；比例与具体数量在任务书登记，总数仍≤12。
- 该探针启动器仅限准入阶段，不进入普通观察器，也不得带入§1所说的“普通观察器不启动命令”。
- powershell.exe与其conhost同样按§2的Start/End、同PID+CreateTime、Session、完整系统路径、父实例判据验证；PowerShell启动器路径与签名/hash纳入与既有系统库相同的只读固定核验，不安装、不修改。
- 新增反例并入§3清单：非conhost的System32短命子进程出现OpenQueryHandle 87时必须HALTED，不得被conhost分支放行；父为非cmd/非允许PowerShell实例时必须HALTED。
- **残余风险（负责人已采纳D2）**：除conhost外，若普通phase中出现其他短命System32子进程且快照时返回87，本批准没有放行路径，R5将HALTED并须另行批准。默认**不**预授权任何额外映像类别；要预授权须负责人逐类指定。

### 5.5 conhost proof时间与复用判据（取代§2的隐含容差）

- 快照区间沿用R4已有的SnapshotStartedTicks与SnapshotCapturedTicks，它们是.NET `DateTime`刻度（自0001年起），而manifest的CreateTime/ExitTime是FILETIME（自1601年起）。比较前必须按固定常量504911232000000000换算，任何混用判为不符；该常量与换算写入C#与PS检查并有反例。
- 精度沿用R4既有16毫秒（SYNC的`timestamp_precision_ms`）。判据：conhost实例的[CreateTime, ExitTime]与[SnapshotStarted−16ms, SnapshotCaptured+16ms]相交；容差以100纳秒刻度的常量写出，不借用SYNC监视时钟的4096纳秒重叠容差（二者语义不同）。
- 复用歧义：同一会话内同PID出现多于一个Start/End实例对，或存在多个满足相交的候选，一律HALTED，不择一。
- 87可能意味着“打开前进程已退出”，因此proof必须同时具备完整Start与End、ExitTime不早于CreateTime、exit0，且conhost创建落在唯一父实例真实生命周期内；不以父退出推断子退出。事件头时间永远不替代CreateTime（诊断中事件头比创建时间晚24.6–34.9微秒）。
- 新增边界反例：恰在±16毫秒边界内外各一例；CreateTime晚于快照上界、ExitTime早于快照下界；同PID重复；DateTime与FILETIME历元混用；Stop缺失或晚于phase截止。

### 5.6 已裁决项与剩余待办

- D1（已采纳）：§5.4的PowerShell准入组纳入；具体启动数量、比例与PowerShell路径核验写入任务书登记，总启动数仍≤12。
- D2（已采纳）：残余风险按“默认不预授权其他映像类别”处理；要预授权须负责人逐类指定。
- D3（已核实）：见§5.2；结论为仅Recovery双根，ReleaseExit为被释放实例的特殊收尾。核对对象是R4控制源，不是运行证据，未经Win10实际执行验证。
- 剩余待办：phase表与`ack-pin-<label>`标签清单须在实施时对照实际R5 master与控制源再次核对并写入任务书开放问题；R5控制源是R4的派生版本，若实施中改动了重启或释放路径，须同步修订本节。
- 批准前不创建六源、不编译、不部署、不启动任何phase；本节任一条款均不构成执行授权。新建ADR仅在批准后另行追加，不修改既有Accepted ADR。

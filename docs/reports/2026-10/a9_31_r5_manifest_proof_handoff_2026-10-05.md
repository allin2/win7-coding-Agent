# A9-31 R5 manifest proof接入：交接（2026-10-05）

后续更新：§1–8保留原交接时点；负责人批准后的撤回结果与当前停点见§9。原pending请求已保全式撤回，负责人手工Esc后已直接确认退出选择模式、原dispatcher恢复等待；尚未发布新请求，观察器HALTED及续验前合同缺口保留。

## 1. 准确停点

负责人已批准[R5合同r3](../../plans/A9_31_MANIFEST_PROOF_R5_EXECUTION_APPROVAL.md)§1–5与ADR-0173（原文SHA256 `540a7c614482cb13db57c45855531f5fc1898ad50b66e249857287c1066ed0d5`）。准入与冻结已全部通过，普通入口也已由负责人启动并通过身份核验；**首个普通请求（受控Boot）没有被dispatcher接单，原因未明，当前停在这里等待负责人确认入口窗口状态。** 没有任何普通phase证据，整批Win10仍NOT_PASS，A9-31仍`IMPLEMENTATION_IN_PROGRESS`，未签DEVELOPER_VERIFIED/独立/Win7。R4 HALTED与全部旧证据不改判。

| 项 | 状态 |
|---|---|
| 观察器v2（冻结） | 已编译、38项纯回放自检、三轮admission通过；admission预算（3轮）已用完，不可再跑 |
| 控制脚本（R4派生+观察器接入） | 已派生，PS5.1解析零错误，已冻结并stage通过 |
| 定向准入检查 | schema336/api27/interval23/entry22/files-scope16/sync-actual/sync-current/node16×16/package-held/manifest绑定38，全部通过 |
| 冻结admission | 4个revision完整闭包stage PASS，R5根671MB |
| 普通入口 | 负责人已启动；直接核验SID1005/Session3/Medium8192/非提升/noJob，dispatcher WAITING（PID 92564，creation ticks 639267280524271566） |
| 首个请求（受控Boot，request `8d4805e86d3947b5a08cc65ff3769273`） | 观察器就绪后已发布请求；**dispatcher未接单，无run目录**；观察器750秒到期自行HALTED（零事件/零丢失/会话已清理）；请求文件仍pending |
| 普通八phase / 整批Win10 / 独立 / Win7 | NOT_PERFORMED |

## 2. 工作树、保护与阅读入口

只在此工作树继续：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`，HEAD `ebda91123e62b225c3fd104c9c9b564a4b61c466`，index为空，大量dirty/untracked为既有，未提交/推送/合并/删除。主仓`/Users/qlyf/Developer/win7-coding-Agent`只读。

读取顺序：AGENTS.md、`docs/WIN7_CONSTRAINTS.md`（末尾R5观察器C15/C16登记）、[A9-31任务书](../../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)末尾两节（R5批准登记、观察器构建与准入）、合同r3（§5为本轮新增的握手/采集域/权限/准入覆盖/时间容差）、ADR-0173。上一份交接[manifest诊断handoff](a9_31_manifest_diagnostic_handoff_2026-10-04.md)中的R5草案哈希ee801e62…是历史版本，被批准的是540a7c61…。

保护对象：产品源码、R1–R4全部旧根及其evidence/runs（Win10上）、数据库、所有旧首失败、不可变源/EXE/MVID/pin。**不得删除任何文件**（负责人已自行清理过旧根的host/package/inputs副本以腾出空间）。

## 3. 本地与远端位置

- 本地根（gitignore）：`.acceptance/a9-31-developer/product-r3-retry-r5/`，全部脚本/记录都在其中，每个label的输入/stdout/stderr/执行回执均保留，label不可复用。
- 远端根：`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R5`（784产品/73宿主文件；`evidence\observer-components\v1|v2`；`observers\<request_id>\`）。
- 目标：192.168.1.4 / WIN-2JQ66JE4HTQ / Win10 19045；Administrator经现有Strict SSH（`remote-actions.py`，BatchMode，key `/Users/qlyf/.ssh/id_ed25519`）；Bitvise过期许可警告是已记录的非阻断警告。系统`python3`是3.9，`Path.write_text`不支持`newline=`，用`open(...,'w',newline='\n')`。

## 4. 冻结物与源的准确身份

| 对象 | SHA256 / 说明 |
|---|---|
| 批准合同r3 | 540a7c614482cb13db57c45855531f5fc1898ad50b66e249857287c1066ed0d5 |
| scope-approval.json | 804fac7c087ec0c31a47ce27420ec19ef70f16cff31090c819cdead08e90a726 |
| **master-pin** | **a3a04e288847ab9b712debf6c72aa77f40c2d69b01ce66e2e0ba2f8bd8e3b991** |
| revision controlled-boot | 6bafa971dd58b31bbd0df9ae88c0ab2a3dee4cec60147e2f7e7eae8672993cea |
| revision normal-short | ac40f8608deefc863d1905270adf32bd51a482f97f8e7528b0e621dd5bed6a31 |
| revision normal-full | 0868ddd74d6e3002c2a2d39a6e762c636287be1c8f0564c792955c17c165b13a |
| revision ready-negative | 22af0b32481fcbc390eeb51590ac59915916f058e8bd57ef7aa2140ed60dc4ed |
| serve-product-r3-desktop.ps1 | 3c4987f40d5d583dd2dbeecddfa0c134ba0e1e9bc89cb61d9b8f7a3a294b8e00 |
| launch-product-r3-desktop.ps1 | b65d05055688e198523e7674c0523a182e7d37a5b6232be0cd80e4dcd0161aef |
| stage-product-r3.ps1 | 3373cb1522335050e40cca2cb6195328e77d6dedd1dba22eacd24d0ceada73ef |
| product-r3-driver.cjs（normal-full基础） | 4168bb933a41e4c86310fefa1fc6142fc4297329f5f7780994e6153da4b32957（与R4仅根绑定不同） |
| 观察器v2 源 manifest-process-observer.cs | b949ba520eb103548cfd08a578d76df1d3d48e46089045188dc7b4b1df112a7d |
| launch-manifest-observer.ps1 | 4380aac48a5be099b5a6cf854f6a3a4e71686b71693f23b0e7ed41aed4eba54f |
| 观察器v2 EXE / MVID / pin | 21cd35311f31bb5de37f34623baed6050dceeb1a7edc3484a121b75498ba8d80（34304 bytes）/ 160fb51d-083c-49fb-89fc-d364eaa1a7f0 / f4db96d49dd19667fb8528d0b6382d2a661fe23da0b87e02d0baaae8a26e31f2 |
| 观察器v1（保留不改判） | EXE f7bf41b5…/MVID 85e3b159…/pin 1f51cd0c…；被v2取代的原因：ordinary账户无法读取管理员进程信息，v2仅加`observer-heartbeat.json`心跳 |

产品/native/capture/锁不变：r3 ZIP d951a89a…、manifest 0060ffff…、capture DLL 93f1979a…、固定csc 4.8.9232.0。

控制器改动（相对R4，均在`derive-r5-control.py`中带唯一性断言）：master/revision/checks新增`manifest_observer`块与`Observer-Schema`；`Resolve-ManifestObservation`仅放行"conhost.exe+OpenQueryHandle原生错误87+父为held的System32 cmd或WindowsPowerShell实例"，其余仍走原硬门；worker与dispatcher启动请求前调用`Assert-ObserverReady`；dispatcher要求上一请求的`observer-final.json`已closed才接下一请求；终态记录`resolved_manifest_proofs`与`manifest_proofs_pending_final`。原query-failure/UNKNOWN字段不改。

## 5. 首个请求未被接单：已知事实与未知

已知（全部只读核实）：
- 请求文件`requests\request-8d4805e8….json`写于00:28:27，之后至少12分钟`runs\8d4805e8…`不存在。
- dispatcher进程92564仍存活、响应，但连续采样CPU增量0、I/O增量0、13线程全部Wait；累计读量约1.69GB，只相当于启动时两次完整校验，**没有为该请求做第三次Assert-Master**，说明它在接单之前就静止了。
- 观察器就绪校验（含心跳、绑定、self-test 38）通过后才发请求；观察器按设计在750066ms到期，`observer-final.json`状态`NOT_PROVEN`，`stop_reason=HARD_BUDGET_EXCEEDED`，零事件、零丢失、会话已清理（`logman`查不到`A9-A31-R5`）。
- `r5-phase.py finish`因观察器已不在而在写停止信号处中止，属预期，不是新缺陷。

未知：dispatcher为何静止。最可能是入口窗口被控制台点选（QuickEdit）挂起，也不排除在等某个提示；SSH侧读不到跨会话窗口标题。**需要负责人看窗口并回报。**

重大风险：请求文件仍pending。窗口一旦解除阻塞，dispatcher会取这条请求，因对应观察器已不在而在`Assert-ObserverReady`处HALT，**烧掉R5入口**；R5根只能有一个入口，再开需要新根，不在批准范围内。因此解除阻塞前必须先处理这条请求。我已向负责人提议"把该请求文件移出`requests\`并保留本地副本与SHA256"，**负责人尚未批准，未执行**；该动作不在合同明文内，不得擅自做。

## 6. 本轮发现的偏离与待补

1. **合同§5.3的跨账户共享目录四向读写实测（`ACCESS_OBSERVER_SHARED_ROOT`）尚未执行**，却已发布了首个请求。这违反了"首个phase请求前"的顺序。该检查须在新观察器就绪后、下一个请求前补做（管理员写探测文件→普通dispatcher读并写回→管理员读）。控制器作为a9builder首次读管理员创建的ready/heartbeat文件的路径从未被真实演练。
2. 观察器硬预算750秒从观察器启动算起，而请求发布依赖dispatcher及时接单；若dispatcher慢或卡住，观察器会先到期。后续应缩短"启动观察器→发请求"间隔，并在发请求后短时检查run目录是否出现，没出现立即停止/重启观察器，而不是长时间`finish`轮询。
3. `r5-phase.py`只演练过`start`；`finish`的完整路径（停止信号→终态核对→proof与records对账→agent终审）从未在真实phase上跑通。
4. 合同§5.2的phase/根语义（仅Recovery双根、ReleaseExit有3个释放实例）是读R4控制源得出，R5控制器尚未在真实phase上验证；`ack-pin-<label>`标签清单需实施时再对照。
5. 准入探针只覆盖cmd与PowerShell两条链；D2已采纳：除conhost外的其他短命System32子进程出现87仍直接HALT，无放行路径。

## 7. 下一个agent的最短顺序

1. 只读核对HEAD/branch/index、本交接§4哈希、dispatcher是否存活、`observers\8d4805e8…`状态；不重跑admission（预算用完）。
2. 向负责人取得：入口窗口状态；是否同意撤回pending请求。**未取得前不发新请求、不解除窗口阻塞。**
3. 若入口窗口可恢复且pending请求已撤回：先做§5.3四向读写实测（独立失败码），再按`r5-phase.py start <phase> <version>`逐请求推进。顺序：受控Boot→Boot→后台最短→StopExit→ReleaseExit→Recovery→完整Background→ready专用负例→Shell→EncodingSecurity→FailureBoundaries；每请求只在观察器就绪核验后发九字段请求，终态后由代理发停止信号并核对`observer-final`与controller的proof；用`observe-runtime.py`/`review-phase*.py`/`return-one-run.py`（复用R4）复核与回收。
4. 若dispatcher已HALTED或入口不可用：保存全部证据，如实记为R5入口失败，**不恢复、不创建第六根**，另报请求批准。
5. StopExit/ReleaseExit的原生选择限120秒，不得延长、不得伪造；本会话没有可用的computer-use工具，输入无效时需负责人手工点击。

入口命令（仅供核对，已使用，不可复用）：`powershell.exe -NoProfile -NoExit -ExecutionPolicy Bypass -File "...\A9-A31-Product-R3-20261004-R5\control\launch-product-r3-desktop.ps1" -PinSha256 a3a04e288847ab9b712debf6c72aa77f40c2d69b01ce66e2e0ba2f8bd8e3b991`。

## 8. 边界

本批准不含：产品/native/锁/capture修改、系统/账户/ACL/服务/计划任务改动、删除、强制结束旧实例、提交/推送/合并/发布、委派、独立验收、Win7、第六根。所有admission与定向检查均为Administrator Session 0隔离检查，不是普通产品证据；**未在Win7实机验证**。

## 9. 批准撤回后的当前停点（2026-10-05）

负责人在本会话对“第1–3步：复核、撤回这一请求、退出选择模式并只读确认入口状态”回复“批准”。本次授权不含新请求、观察器重启或新根。工作树仍为§2所列分支与HEAD，index为空。

1. **直接复核通过。** 00:57:05（北京时间），Administrator经原Strict SSH核对目标WIN-2JQ66JE4HTQ；dispatcher仍是PID92564/creation ticks639267280524271566，SID1005/Session3/Medium8192/普通非提升/noJob，无dispatcher-final和该请求run目录。Computer use直接看到准确R5入口的标题含“选择”，支持控制台选择模式导致暂停的判断；恢复活动尚未证明。
2. **唯一请求撤回通过。** 00:59:58，将远端R5根下`requests\request-8d4805e86d3947b5a08cc65ff3769273.json`以同卷不覆盖移动方式保全到`evidence\withdrawn-request-8d4805e86d3947b5a08cc65ff3769273.json`。525bytes，移动前后及既有本地副本SHA256均为`8c8d48fc552b47f4be37e716a964697edc626ac5eb9ddc7c86094fb9bd41e1f8`；源不存在、目标存在、请求目录为空、无run、无dispatcher-final，原进程存活。未删除字节，不自动移回请求队列。
3. **窗口恢复未确认。** Computer use两次Esc尝试（第二次前点击控制台标题栏）、标题栏双击均未产生预期可见变化，标题仍含“选择”；只读检查UU菜单后已关闭，未改远控设置。01:02:13的SSH复核仍为同实例存活/Responding=true，无run、无dispatcher-final，请求目录为空且保全文件hash一致；3秒采样read/write/kernel/user增量全为0。不能把Responding=true或工具返回成功当作输入送达及恢复证据。需负责人手工聚焦该入口标题栏后按一次Esc，再由代理只读复核；不得重输入口命令。
4. **手工Esc后恢复已确认。** 负责人报告“esc生效请你检查”。01:06:50（北京时间）Strict SSH复核PID92564及creation ticks639267280524271566保持、未退出，3秒kernel/user各增加156250个100ns单位（合计CPU31.25ms，read/write仍为0）。随后computer use直接看到准确Win10/R5控制台标题不再含“选择”，新增可见输出`A9-31 reusable desktop dispatcher ready. Keep this window open (2 hours / 16 requests).`。请求目录0文件、原请求无run、无dispatcher-final，保全文件SHA256仍相等。批准的第1–3步已完成；仅证明原入口恢复等待，没有发布新请求或重启观察器。复核证据为同一本地根`owner-esc-readonly-status-20261005-r1.*`；原第3项保留为自动输入未成功的历史记录。

原120分钟窗口截止仍为2026-10-05 02:27:36（北京时间），不重置。原观察器`NOT_PROVEN / HARD_BUDGET_EXCEEDED / exit2`保留；§5.3四向读写未执行，普通phase仍NOT_PERFORMED，整批Win10仍NOT_PASS。即使窗口恢复，原合同§5.1的HALTED及下一请求终审前提仍须处理，§7原续验顺序不是本次新请求授权。

证据均在§3本地根：`withdrawal-approved-preflight-20261005-r1.*`、`withdraw-pending-approved-20261005-r1.ps1`、`withdrawal-approved-move-20261005-r2.*`、`withdrawal-after-esc-readonly-20261005-r2.*`。移动脚本SHA256为`eaf731d26e01e6b53216211b6b47928c9d17a5dbdc2430bf0b3f0c73cb8e825a`。首次移动与首次扩展状态查询均因Windows命令行过长未执行，原stderr和复查记录保留；移动使用压缩传输、远端解压后核验上述原脚本hash再执行，状态查询改为短只读查询。该传输失败不计产品失败，也不覆盖原失败。


## 9. 更新（2026-10-05 稍后）：R5入口已HALTED，取代上文§1/§5/§7的“停在首个请求”

以下为后续事实，**§1停点、§5接单失败、§7下一步已过时**（原文保留作历史）：

- 负责人确认窗口被控制台选择模式挂起，经Esc恢复，并撤回了pending请求（本地副本SHA256 `8c8d48fc552b47f4be37e716a964697edc626ac5eb9ddc7c86094fb9bd41e1f8`）；本会话只读核实了恢复、请求目录为空、无新增run。
- 此后5个请求：受控Boot（夹具故意失败，整树8实例结束）、Boot PASS、**StopExit PASS**（真实原生选择21.1秒/响应0，含`ACTUAL_NATIVE_EXIT_CHOICE`与`STOP_PERSISTED_TERMINAL`）、**ReleaseExit PASS**（9.7秒/响应1，整树36实例结束；1个cmd 87缺口由原SYNC通道解析）、**Recovery HALTED**。每phase观察器终态核对通过（18/18/34/82事件，零丢失），前四个phase完整返回逐size/SHA与秘密扫描零不符；Recovery的81文件也已完整回收。
- **Recovery失败**：崩溃实例（退出码93）整树结束后，重启Electron（pid 107280）2分钟内未退出→`LIFECYCLE_RESTART_TIMEOUT`，dispatcher随后`LIFECYCLE_PINNED_TREE_UNKNOWN`HALTED，累计5请求。负责人报告出现JavaScript报错。driver第118行`fs.openSync(...driver-journal.jsonl,'wx')`无条件创建，重启实例与崩溃实例共用证据目录，高度怀疑EEXIST；**未直接证实**（需对话框原文）。Recovery重启路径此前从未在Win10实际执行，可能还有其他阻断。
- 重启Electron 107280在查询时仍存活（报错框未关）；**未经批准不得taskkill**，由负责人关闭对话框后只读核实退出即可，退出不改判HALTED。
- 新conhost proof：已实现并通过38项定向检查，但本次所有phase均未被真实conhost 87缺口触发（`manifest_proofs=0`），真实路径未被证明；这是对§6第3点的补充，不得宣称已在普通环境验证。
- §6第1点（跨账户读写）：a9builder作为控制器真实读取了管理员观察器的ready/心跳文件（`observer_ready`出现在每个controller-final），有效读取已被证明；观察器events文件的读取路径尚未被真实缺口使用。管理员侧ACE早期指示见`acl-early-indicator-r1.json`。
- 现状：R5入口HALTED不可恢复；剩余6个phase（后台最短/完整、ready负例、Shell、EncodingSecurity、FailureBoundaries）未执行；整批Win10仍NOT_PASS；DEVELOPER_VERIFIED/独立/Win7均未签。继续需要**新根与具体批准**，第六根不在现有批准范围内。
- 建议下一步（待批准）：新材料内容——修复driver重启实例对日志文件的处理（仅外部测试脚本，不改产品/native/锁）、对Recovery重启路径先做不占请求预算的本地/隔离验证、沿用已冻结的观察器v2与控制器逻辑、剩余phase全部重跑；并把"请求发布后30秒内必须出现run目录"与观察器预算对账写入合同。矩阵：`product-r3-retry-r5/win10-evidence-matrix-r5.json`。


## 10. 更新（2026-10-05 稍后）：R6入口HALTED（取代上文关于“R6待执行”的描述）

R6新根已完成实施、准入、冻结并由负责人启动入口；直接核验普通身份通过。结果：

| phase | 结果 |
|---|---|
| Boot | PASS（9项） |
| Background 短 | PASS（29项） |
| Background 完整 | PASS（133项；1个查询缺口由原SYNC解析） |
| ready专用负例 | 按设计预期失败（`A9_EXPECTED_READY_FAILURE`，halt=false，16项0失败，隔离退出码94） |
| Shell | PASS（29项） |
| EncodingSecurity | **HALTED**（62项driver检查通过后遇conhost 87缺口，新proof未解析，入口HALTED，累计6/16请求） |
| FailureBoundaries / StopExit / ReleaseExit / Recovery | 未执行 |

**EncodingSecurity根因（我方控制器缺陷，已用真实数据直接证实）**：`Resolve-ManifestObservation`以持有树`Binding.Image`判断父进程是cmd还是PowerShell，我假定其为`C:\Windows\System32\cmd.exe`，实际为NT设备路径`\Device\HarddiskVolume3\Windows\System32\cmd.exe`，`kind`为空即`return $false`，缺口未被放行→`LIFECYCLE_OBSERVED_CHILD_NOT_PINNED`。38项定向检查的夹具同样用了`C:\`格式所以未暴露（测试与实现犯了同一错误）；R5 Recovery证据里的`\Device\...`格式当时已出现，我未意识到。观察器记录完整，对该次真实缺口只读回放`ValidateConhostProof`得到有效proof，故proof设计与观察器无误。

**R6含义**：观察器重编、driver重启文件名修复（Node16×4自检28项）、控制器events读取检查均已就位；其中重启实例从未在Win10运行，events读取检查已在每个请求前真实执行并通过。

**下一步（待负责人批准，不得擅自开第七根）**：修复需新根。建议修复只改控制器：父进程种类改为以观察器ready记录中的`c_device_mapping`拼出的准确设备路径做大小写不敏感精确比较（`<c_device_mapping>\Windows\System32\cmd.exe`、`...\WindowsPowerShell\v1.0\powershell.exe`），定向检查夹具改用真实设备路径格式并加入用真实EncodingSecurity缺口数据的回放用例与设备路径负例；新根仅需重跑EncodingSecurity、FailureBoundaries、StopExit、ReleaseExit、Recovery（Recovery仍放最后）。矩阵：`product-r3-retry-r6/win10-evidence-matrix-r6.json`。未在Win7验证。


## 11. 更新（2026-10-05 稍后）：R7入口HALTED（取代上文关于“R7待执行”的描述）

R7（master见任务书）实施、准入、冻结并由负责人启动入口，直接核验普通身份通过。结果：

| phase | 结果 |
|---|---|
| EncodingSecurity | PASS（71项；整树53实例结束；1个查询缺口由原SYNC解析；本次未遇conhost 87缺口） |
| FailureBoundaries | PASS（41项；整树51实例结束） |
| StopExit 第1次 | FAIL：对话框约5.2秒后弹出，负责人160.5秒后点击，超120秒限时 |
| StopExit 第2次 | FAIL：263.7秒后点击，超限时 |
| StopExit 第3次 | HALTED：3.8秒内点击但返回response=1（“留给系统后退出”），要求response=0（“停止后退出”），`ACTUAL_NATIVE_EXIT_CHOICE`失败触发`SAFETY_DRIVER_HARD_GATE`，dispatcher HALTED，累计5/16请求 |
| ReleaseExit / Recovery | 未执行 |

**关键事实**：原生对话框在控制器启动后约5秒弹出并保持打开，120秒限时从弹出算起；按钮从左到右为`[停止后退出] [留给系统后退出] [取消]`，默认焦点在第一个。StopExit点第一个，ReleaseExit点第二个。三份StopExit证据与另两个phase均完整回收，逐size/SHA与秘密扫描零不符；整树均已结束，观察器终态核对均通过；原FAIL与HALTED未改判。

**没有被证明的事**：修复后的manifest proof分支（按NT设备路径判父进程）只在真实缺口回放和admission中证明，普通环境中从未真正放行过一次真实缺口；Recovery重启路径从未在Win10真实重启；StopExit在最终控制器/driver字节上无通过记录（R5的StopExit PASS是旧字节）。整批Win10仍NOT_PASS，DEVELOPER_VERIFIED/独立/Win7均未签，Win7未验证。

**下一步（待负责人批准，不得擅自开第八根）**：新根只需重跑StopExit、ReleaseExit、Recovery（Recovery最后）。点击风险应在合同里写成流程而非靠人为小心：例如对话框按钮和默认键的明确口令、发布前的屏幕就位确认与提前量（本次第三次已验证提前量有效，点击仅3.8秒）；不得放宽对话框断言或把错误选择降级。矩阵：`product-r3-retry-r7/win10-evidence-matrix-r7.json`。

## 12. 更新（2026-10-05 稍后）：R8入口HALTED（取代上文关于“R8待执行”的描述）

R8（master `0450ccc6…`，请求统一钉在driver-r1新`normal-short` revision `2d38064c…`）：StopExit PASS（对话框3.557秒，response 0，driver 15项）、ReleaseExit PASS（3.28秒，response 1，driver 32项），均完整回收、评审`DIRECT_CURRENT_SOURCE_PHASE_PASS`。Recovery HALTED：真实崩溃重启首次跑通、R5的`EEXIST`未再出现，重启后12项通过，第13项`BACKGROUND_FACTS_ONLY`期望`exited`、产品按设计保留`cleanup_required`；失败收尾等待注定被拒的Stop而超时，重启产品树存活，后由负责人在合同流程外手动关闭（不作为任何按钮/Esc实测）。完整回收88文件在手动关闭后取得。负责人据[裁决材料](../../plans/A9_31_R8_RECOVERY_EXPECTATION_RULING.md)裁决D1=C：driver预期有误；崩溃后无产品内处置出口另立[A9-34](../../tasks/A9_34_RECOVERED_CLEANUP_DISPOSITION.md)。矩阵：`product-r3-retry-r8/win10-evidence-matrix-r8.json`（事后补写）。执行细节见[R8执行后交接](a9_31_r8_execution_handoff_2026-10-05.md)。

## 13. 更新（2026-10-05 稍后）：R9 Recovery通过（保留清理未知语义）

R9按ADR-0179（[合同r2](../../plans/A9_31_R9_RECOVERY_RETAINED_UNKNOWN_APPROVAL.md)+[修订](../../plans/A9_31_R9_ADMISSION_REVISIONS_AMENDMENT.md)）只跑Recovery一个请求，无人工点击。master `fd9df3e5…`，normal-short revision `c75f5734…`；准入全套与R8同口径通过（Node16 24行）。入口dispatcher PID 113308经直接核验为普通账户。

| 项 | 结果 |
|---|---|
| request `d1a04183a25a4e16afa2751491a21736` | 控制器`PHASE_PASS_REQUIRES_EVIDENCE_REVIEW`，driver PASS |
| 崩溃实例 | 16项通过，退出码93，崩溃树17实例全部已退出 |
| 重启实例 | 23项通过，含`BACKGROUND_RECOVERED_UNKNOWN_RETAINED`（句柄`cleanup_required`/`recoveryStatus=exited`/`pidReusePossible=false`/owned，零新helper）、`BACKGROUND_RECOVERED_PID_EXITED_BY_OS`（PID 123888在OS层退出码1）、`RECOVERED_UNKNOWN_STOP_REJECTED`（`A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED`）、`RECOVERED_UNKNOWN_BLOCKS_SWITCH_AND_CLOSE`（canStop/managed_process、不可切换“当前对话仍有托管后台进程”、锁持有、不可正常关闭）及零重放、PID复用不误停、不重复追加 |
| 退出 | `normal_product_exit=BLOCKED_BY_DESIGN_NOT_PERFORMED`，隔离测试`app.exit(0)`；23实例全部已退出 |
| 观察器 | `OBSERVER_FINAL_VERIFIED`，64事件，零丢失，无遗留实例，manifest proof 0 |
| 回收与评审 | 87文件/7,601,311字节逐SHA一致、秘密扫描0；`review-phase-r9.py` = `DIRECT_CURRENT_SOURCE_PHASE_PASS` |

**含义与边界**：该PASS证明崩溃后不造终态、重启只恢复事实并保留清理未知、零Provider/工具重放、不接管旧输出、PID复用不误停；**不证明崩溃后产品可正常关闭**（A9-34）。至此每个phase都至少在一个根上有PASS记录（R5/R6/R7/R8/R9，控制器/driver字节各不相同），这种跨根组合是否算整批Win10通过须负责人裁决；新conhost证明分支在R5–R9普通phase中仍从未被真实触发，Esc/取消后果未实测。DEVELOPER_VERIFIED、独立验收、Win7均未签，**未在Win7实机验证**。矩阵：`product-r3-retry-r9/win10-evidence-matrix-r9.json`。

## 14. 更新（2026-10-05 稍后）：整批Win10跨根组合通过（带限制）

R9入口经负责人批准的`stop.json`正常结束（dispatcher-final `COMPLETED`）。负责人裁决A9-34推迟到第二批之后，并按[跨根组合裁决r2](../../plans/A9_31_WIN10_BATCH_CROSS_ROOT_RULING.md)（ADR-0180）先补正式评审再组合。

| phase | 采信的根与request | 正式评审 |
|---|---|---|
| Boot | R6 `9df37ce1…`（R5 `e28f279a…`旁证） | PASS（补评审） |
| Background short / full / ready负例 | R6 `e30af278…` / `53eb4fdd…` / `39578cdd…` | PASS / PASS / 预期负例PASS（补评审） |
| Shell | R6 `38973184…` | PASS（补评审） |
| EncodingSecurity / FailureBoundaries | R7 `7f5eef0d…` / `fc75b589…` | PASS（补评审） |
| StopExit / ReleaseExit | R8 `a9599b32…` / `0de38ba0…`（R5补评审旁证） | PASS |
| Recovery | R9 `d1a04183…` | PASS（保留未知语义） |

被测产品输入R5–R9完全相同；补评审只新增文件、无远端动作，冻结基线前后0差异。结论`WIN10_CROSS_ROOT_COMBINED_PASS_WITH_LIMITS`（`.acceptance/a9-31-developer/win10-cross-root-combined.json`）。**限制**：conhost证明分支从未被真实触发；Esc/取消未实测；Recovery不证明崩溃后可正常关闭（A9-34推迟，A9-33须列已知限制）；跨根等价是对归一差异的推断而非重跑。DEVELOPER_VERIFIED、独立验收、Win7均未签，**未在Win7实机验证**。

## 15. 更新（2026-10-06）：r4包（源`8d207ab`）Win10单根通过（取代§14跨根组合作为当前源的Win10结论）

- 根`A9-A31-Product-R4-20261006-R2`（ADR-0186/0187；R1因取证组件构建绑定旧source停止、保留）。包ZIP `e96fdf96…`、manifest `d084907c…`；master `fb4adc2b…`。
- 普通入口（SID…1005/Session3/Medium8192/非提升/noJob，直接核验，pid 90920）一次，10请求全部第1次通过正式评审，无重试：Boot 9、Background短29、完整133、ready负例（预期失败，退出94）16、Shell 29、EncodingSecurity 71、FailureBoundaries 41、StopExit 15（弹出→点击2.1秒，response=0）、ReleaseExit 32（3.8秒，response=1）、Recovery 23（崩溃93、重启同会话、保留清理未知、隔离`app.exit(0)`）。每请求观察器终态核对、零丢失、完整逐SHA回收与秘密扫描通过。
- dispatcher在八个必需phase全部通过后自行`COMPLETED`（10/16请求），未用stop.json。
- **conhost证明分支已在普通环境真实触发**：Boot遇conhost OpenQueryHandle 87缺口（Session3，父为设备路径`\Device\HarddiskVolume3\Windows\System32\cmd.exe`），由`MANIFEST_CONHOST_INSTANCE_EXIT_V1`解析，观察器记录逐条对账通过——§14该项限制解除。
- 包内Policy：准入在Node 16.17.1直接加载包内Core Policy求值（ask 140/ordinary 238与HEAD一致/dispatch 11）；Shell phase经新Policy派发通过。
- 工具留痕：准入sync-current输入派生偏差已按R9流程更正；Recovery观测因根dispatcher-final（1,444,901字节）超只读观测1 MiB单文件上限，改由完整逐SHA回收的run证据组装后以原R9评审脚本评审（脚本未改）。
- 结论`WIN10_SINGLE_ROOT_PASS`（矩阵`.acceptance/a9-31-developer/product-r4-win10-r2/win10-evidence-matrix-r4-r2.json`）。剩余限制：A9-34推迟（Recovery仅保留未知语义）、Esc/取消未实测、Shell Policy识别边界（ADR-0184）。R5–R9冻结5448文件基线前后0差异。DEVELOPER_VERIFIED/独立验收未签；**未在Win7实机验证**。

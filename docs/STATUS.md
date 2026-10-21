# 当前项目状态

## A9-39 预演2清理回收完成，原运行仍 HALTED（2026-10-18 UTC）

Win7 实机清理结果为 `CLEANUP_COMPLETE`，本单按原时点 `INHERITED_EVIDENCE` 登记；候选 WIN7-46/source `dc8cdecbaa07008edb931c8e01024878e7ad3d58`，run `df9b9b24-1efc-43d5-a1be-4207155604a7`，`evidence_class=REHEARSAL_NOT_ELIGIBLE`。原运行仍 HALTED，p03 不是 PASS，门 A/门 B、Alpha 2/RC 不签发。以下旧节保留原时点准备状态，当前清理状态以本节及任务书 §11.8.14 为准。

负责人原话“确认执行预演 2 清理与回收，材料包 SHA e1c8d0c13b2eddea09cf0af78a35bd42483a50e3e1ba71627281113364737022”；确认 `09:47:00.000Z`、有效到 `10:17:00.000Z`，实际执行 `09:47:05.343Z`～`09:47:34.668Z`。C1 于目标 UTC `09:47:04.002Z` 核实主机 DCCS-CHAIZL-PC，绑定进程根 `root_exists=false`。PID 7244 已自行结束，`TERMINATION=ALREADY_ENDED`，C2 跳过，未终止任何进程。

C3 为 FULL 受限扫描、ok，任务创建/删除读回；C6 任务 0、包内相关进程 0，7244 不存在且未被复用。C5 下载 82 文件、2,494,843 字节，外层已标 `REHEARSAL_NOT_ELIGIBLE`；汇总 failures 为空。控制 SSH 累计 18/32（本轮 4/6）、上传 1/1、下载 1/1，无重试。driver-electron/workspace/observed 等副本未回收；C4 已列出的 `work/p03-chain.done` 与 `evidence/rehearsal-postflight/p03-chain.json` 内容未下载，固定控制文件仅含 p01/p02。先子后父终止循环 Win7 实机验证仍 NOT_PERFORMED。

原始证据位于 `outputs/a9-39-rehearsal-2-run/df9b9b24-1efc-43d5-a1be-4207155604a7/cleanup-r1/`，清理原字节不改。开发机只读诊断见 `outputs/a9-39-rehearsal-2-diagnosis/DIAGNOSIS.md`：列出等待与 GPU 失败的可证伪假设，不裁决根因，不执行建议的实机动作。本单未连接目标、改产品/脚本/候选、提交/推送、安装依赖、新开会话或代理。登记和验证边界见[任务书 §11.8.14](tasks/A9_39_ALPHA2_FINAL_CANDIDATE.md#11814-预演2清理回收完成登记与只读诊断2026-10-18-utc)。

## A9-39 清理回收修订包待审核，旧确认失效（2026-10-18 UTC）

清理回收材料审核修订结论限开发机：原包 SHA `838add4d20c4964b067602e337e102393143ed1135eb880eabdc8c84191b5a39` 曾获负责人原话“确认执行预演 2 清理与回收，材料包 SHA 838add4d20c4964b067602e337e102393143ed1135eb880eabdc8c84191b5a39”，但审核未通过。本次新字节不能使用旧确认，旁侧 `VOID_CLEANUP_R1_CONFIRMATION.json` 已登记失效；原确认时间未提供，保留 null/UNKNOWN，不补造时间。旧包全部原字节在 `outputs/a9-39-rehearsal-2-cleanup-r1-r2/before/` 保留。状态为“修订包已备，待重新审核与负责人逐字确认”，未生成已批准的新回执。

P1-1 已补 C2/query-common 每个终止闸门的结构合同：Get-Tree→Validate-Tree→节点数相等→逐节点 Match-Approved→逐PID新WMI记录→Match→截止→唯一 Terminate→读回。根父7040、RootCreated、MinUtc、owner_sid/name/domain/session、未知PID即throw均在真实函数块中断言，生成执行体与模板比对。按实际PS标量比较表达式实现的JS模型覆盖正控先子后父，树外PID、属主、会话、创建时间及初始树不符时Terminate调用0次。模型不是PowerShell执行，不提升目标证据等级。

P1-2 已加未在扫描清单中的 work/logs 文件，必须进 omitted 而不进 items；13:50Z确认、14:20Z到期跨绝对截止的回执须 APPROVAL_WINDOW、零SSH、无执行目录；根parent_pid≠7040须ROOT_BINDING。内置审核变异 M2、M3、M7、M8、M10、M11、M12、M13、M16、M20 共10个全部被相同闸门/行为断言判FAIL；不是依靠材料SHA不符杀变异。

两项澄清已固化。第一，本轮 cleanup-r1-finish-stdout/stderr 及同前缀日志完全排除扫描输入与下载；evidence/requests、work/logs、data 在新建scan-inputs副本中扫描，仍按原路径映射和原文件哈希核对。测试保持写句柄打开，断言这些文件没有被读取、扫描或清单化。C4仅在扫描任务与子进程结束后开始，可以哈希已关闭日志，但不下载。第二，vault/credential/credentials容器不读取、不哈希、不复制或下载；C4仅输出path/exists/omitted_reason，目录不下探。开发机严格拒绝携带bytes/sha256的凭据行，仅在omitted中记录存在。守卫IO与C4条件模型验证凭据内容读取/Hash调用0次。

新材料包 SHA `e1c8d0c13b2eddea09cf0af78a35bd42483a50e3e1ba71627281113364737022`；总控 SHA `c645f96653ff7cbd01a8fea9713d92bdf556c62e5efe74bcb2c9eab83aa6185d`。完整模板：

> 确认执行预演 2 清理与回收，材料包 SHA e1c8d0c13b2eddea09cf0af78a35bd42483a50e3e1ba71627281113364737022

材料包仍位于 `.acceptance/a9-39/w46-rehearsal-2-preparation/cleanup-r1/`。28原材料/800候选文件钉不变；新的脚本/测试/任务XML、旧确认失效记录、CLEANUP_BINDING、SHA256SUMS与模板均已重钉。EncodedCommand长度28147字符，小于32767上限；新增组合Win7实机仍NOT_PERFORMED。预算不变：起点控制14/32、上传1/1、下载0/1；正常新增5SSH（根已自行结束4）、下载1；硬上限6SSH，保留只读后飞行，不重试、不新增运输额度。原绝对签发截止2026-10-18T14:01:47.000Z不延长，跨截止在SSH前拒绝。

开发机Node20.17离线64/0（原37项加27项），全部10个内置变异被判FAIL；docs:check、diff --check、SHA256SUMS与print-template按本轮日志核验。原预演1/2、签发/回执、包与305项保护基线均保持原字节；实际目标SSH/SFTP、终止、注册任务、下载均0，不提交/推送/安装/新开会话或代理。预演2永久HALTED及首失败、当前PID状态UNKNOWN、WMI复核到Terminate非原子竞态均不改判。绑定本分支HEAD dc8cdecbaa07008edb931c8e01024878e7ad3d58；证据与文件SHA见 `outputs/a9-39-rehearsal-2-cleanup-r1-r2/REPORT_DETAILS.json`。最短真实链路仍是重新审核新包→负责人逐字确认新SHA→另行受领执行，不由本单触发。

## A9-39 预演2 HALTED，清理回收材料待审核与逐字确认（2026-10-18 UTC）

预演2实机记录（继承原时点证据）：run `df9b9b24-1efc-43d5-a1be-4207155604a7`，最终载荷 SHA `292e6006497af596eab64b0f7407b671ca8827cac69131e374a6185d80601c0d`，负责人最终确认 UTC `2026-10-18T06:06:49.703Z`。`RUN_RESULT.json` 为 HALTED / REHEARSAL_NOT_ELIGIBLE；p01-env、p02-integrity 已提交 PASS。R6-p03-chain 从 `06:09:55.112Z` 至 `06:32:56.989Z` 失败，原输出含 `TASK_DELETED_READBACK_ABSENT` 与 `BOUND_ADMIN_QUERY_OR_ACTION_FAILED`。p03 失败机制尚未诊断，不从已有现场文件推导 PASS，不重跑预演2。

R7 报 `RECOVERY_SCAN_REQUIRED`，尚未下载；R8 tasks_remaining=0，残留 powershell.exe PID 7244、父 7040、创建时间 `20261018140953.566879+480`（06:09:53.566879Z）。现时是否仍存在 UNKNOWN。运输已用控制 SSH 14/32（含两次预检）、上传 1/1、下载 0/1，剩余 SSH 18 和下载 1，不新增预算、不挪用预演1额度。原 RUN_RESULT、账本、stdout、签发/回执及原材料均保留原字节。

负责人原话“a”仅选择先准备准确清理与回收材料、审核后再逐字确认。本轮只新增 `.acceptance/a9-39/w46-rehearsal-2-preparation/cleanup-r1/`，状态“清理回收材料已备，待审核与负责人逐字确认”。C1 用 PS2 WMI 只读核 PID 树、创建时间/映像/命令行、GetOwner/GetOwnerSid、会话5；所有节点为 agent 且不早于本轮开始才允许 C2。根已自行结束则跳过终止。C2 先子后父，仅 C1 证明集合，每次终止前重读 PID+创建时间及身份/命令哈希，每次后读回消失；PID复用、新节点、非agent或残留即停，树外进程不动。

随后 C3 只允许一次普通 agent 扫描任务，C4 无编译 TreeHash，C5 一次 SFTP 下载，外层 mark-rehearsal，C6 只读后飞行。正常新增5次SSH（根已结束4次）和下载1，硬上限6次SSH/下载1，原上传1已耗尽；正常累计19/32控制SSH、1/1上传、1/1下载。新账本按原前缀逐字续写，每次启动前记 UTC/步骤/类别/序号/STARTED，结束记退出码；首失败保存，不自动重试，后飞行仍受身份、截止和预算硬门约束。新证据只写原run下cleanup-r1子目录，已存在即拒，本轮未创建该真实执行目录。

扫描使用已钉包内 scanRun/buildEvidenceManifest API 的候选外适配器，不调用产品/controller、不重跑p03。范围限定 evidence/requests、work/logs、data及固定控制文件副本，总4096文件/64MiB，扫描前后清单不变且阳性/phase2控制均通过。原清单 evidence 为116文件/231490099字节，运行时副本及未扫描路径不下载；每项缺失写 RECOVERY_PLAN。扫描启动前会话或容量不安全，只回收固定无原始日志内容的元数据并标 METADATA_ONLY；启动后失败或秘密检出则不下载，仅后飞行。不是全树备份。新PS2组合/扫描任务/终止在目标均 NOT_PERFORMED；WMI末次重读到Terminate不是原子操作，竞态仍 UNKNOWN。

材料包 SHA `838add4d20c4964b067602e337e102393143ed1135eb880eabdc8c84191b5a39`；总控 SHA `7c2e56b021459bd338df5e7062cc4a76760372a7d67fdf5e74e908423dca2995`。准确SSH/stdin命令、每步SHA、停止条件、不做清单与审批回执格式见 `cleanup-r1/CLEANUP_PACKAGE.md`。负责人新模板：

> 确认执行预演 2 清理与回收，材料包 SHA 838add4d20c4964b067602e337e102393143ed1135eb880eabdc8c84191b5a39

仅 `--print-template` 可在开发机无连接核钉；执行入口固定 `cleanup-recover.cjs --receipt=.acceptance/a9-39/w46-rehearsal-2-preparation/cleanup-r1/OWNER_CLEANUP_RECEIPT.json`。当前只有 pending-owner 模板，未生成已批准清理回执。独立清理窗口≤1800秒，入场至少剩1500秒，且不晚于原绝对签发截止2026-10-18T14:01:47.000Z；不复活产品共同截止11:11:49.703Z。审核/精确确认未到或窗口已过即不连接，过期须另行裁决，不自动延长。

开发机 Node20.17 离线桩/文件沙箱37/0；覆盖已结束、树中非agent、PID复用、终止后残留、各步首失败/只读后飞行、下载预算、原账本/载荷钉、审批/截止、扫描字节变化和受限回收。真实R8/账本夹具逐字复制并往返核对；包内真实扫描API在临时样本中检测秘密。证据、命令退出码、逐文件SHA和保护对比见 `outputs/a9-39-rehearsal-2-cleanup-r1-preparation/REPORT_DETAILS.json`。仅本地材料与桩 PASS，不代表Win7清理、恢复、产品、正式Gate或Alpha2/RC PASS。

本轮基线 codex/a9-alpha2-integration-r2 / HEAD dc8cdecbaa07008edb931c8e01024878e7ad3d58；已有四文档修改已留快照。当前改动不涉及产品/原生/锁/构建/冻结ZIP，未提交、推送、安装依赖、新开会话或代理；目标查询/终止/任务/下载连接均0。原预演1/2 HALTED及首失败不改判。最短真实链路仍需本包审核与负责人逐字确认后，才由另行受领的执行单按固定C1～C6取证和清理。

## A9-39 预演2 r4作废，r5字段修复材料待审核确认（2026-10-18 UTC）

预演2第一次签发永久作废：负责人原话“批准本次预演最终载荷SHA-256 7ff0f5c0d6f54d6ae40d8bd87b052e6931d44097619d11a449f763f100e939a0”，签入回执confirmation_utc=2026-10-18T04:59:19.757Z。总控在本地预检账本绑定处即报RUN_REHEARSAL:PREFLIGHT_LEDGER_BINDING；未activate、未SSH、未创建本地run证据目录或目标根。R1开始窗口于05:04:19.757Z过期，VOID_RUNNER_FIELD_MISMATCH.json登记原SHA/原话/时间/原因，signing-final-r4与预检四原字节保留，不以修复代码复活。

根因已复现：包装器与finalize使用exit_code=0，总控误读不存在的ssh_exit_code；真实LOCAL_RESULT原字节SHA eaa8cfc6f746264eefc9173397e5f51353addcfe06f00b2d5dac990d1253fd8a。执行原绑定表达式返回false，只改这一字段返回true，其余条件均一致。修复总控为exit_code，并抽出verifyPreflightBinding纯检查；13个LOCAL_RESULT字段、6观察字段和8字段签发投影共用developer-json-contract.cjs，封闭字段集合，不接受旧别名。

本轮将真实r4 LOCAL_RESULT、stdout/stderr、authority与FINALIZATION逐字复制到fixtures/preflight-r4作为负例/回归输入。真实原JSON同时通过finalize读取器和总控绑定检查；旧字段变异、13字段/6观察字段逐项缺失、非零/null/字符串退出码与别名反例均拒绝。总控夹具改为调用真实finalize写入签发/FINALIZATION，再消费该产物，真实activate落盘并由五次consumeDispatch读回锚值。相邻JSON的完整字段表、生产者/消费者、往返方式与结论见.acceptance/a9-39/w46-rehearsal-2-preparation/JSON_CONTRACTS.md。

r5下一轮材料已备，待审核与负责人重新逐字确认。run保持df9b9b24-1efc-43d5-a1be-4207155604a7、根保持C:\A9-W46\run\df9b9b24，因为未建任何目标对象。预检证据新outputs/a9-39-rehearsal-2-auth/win7-preflight-r5/，签发新signing-final-r5/，已存在均拒绝。不得复用r4回执/SHA/预检或T0；新T0取r5负责人答复UTC，截止=min(T0+8小时,更早指定截止)，7200秒确认与R1的300秒窗口不变。

预算预检累计2、控制SSH32（已用r4预检1+新增r5预检1+执行30）、SFTP各1、运输总34。此前实际已用仅预检四1，执行SSH/SFTP均0。旧预演1预算不挪用。运输账本导入r4为ssh序号1、新r5为2，执行从3到32号；执行额度保持30且不重试。D2更新为P1_BUDGET_REHEARSAL2_TWO_PREFLIGHTS_TOTAL34_ACCEPTED，D1=P1与D3连续全量37/67同字节/P1不计次数不变。

r5包SHA `d9177956f09a78650194d5e8a5c081a37828cc10c551c219d3d966b03bc3040d`；查询脚本未改，SHA `9c14a5ac1f0f49f4ccca1b41da6f178ff6f8a806cb28ccb0f30b09008b35b266`；草案SHA `79b16639e2b22546c52ce28c9819a07521206e931aa97e4ea0f0bcaea112d0a1`（非最终签发SHA）。负责人新模板：

> D1～D3 按建议，确认预演 2 预检材料包 r5 SHA d9177956f09a78650194d5e8a5c081a37828cc10c551c219d3d966b03bc3040d

28项execution_tools与36项库存运输清单包含共享字段模块与作废记录，SHA256SUMS覆盖57项材料。保留Bypass/Write-Output/无声明ASCII LF XML/J无损转义/R4 900秒/父目录判据，产品/原生/锁/ZIP与Win7脚本不改。开发机Node20.17：gate358/0、finalize126/0、总控164/0、InJob36/0，共684/0；总控新增30项契约验证。首次新增字段提取静态测试漏匹配sha256中的数字而失败，修正正则为[a-z0-9_]后通过；原日志保留，生产字段集合未放宽。

补核包装器SSH前脚本SHA错误的三字段JSON（ok/error/ssh_started）：finalize先按包装器非零退出停止，不进入13字段成功结果解码，不生成最终authority。现有失败锁存用例增加实际Python字面量原字节落盘/保留/不重试分支；两种失败通道均验证，测试总数不变。

本轮基线为codex/a9-alpha2-integration-r2 / HEAD dc8cdecbaa07008edb931c8e01024878e7ad3d58，已有四文档修改已留快照。直接检查为本地JSON/文件沙箱，实际SSHSFTP调用0；r4普通查询成功仅按原时点INHERITED_EVIDENCE引用。r5预检/最终签发/激活/目标执行均NOT_PERFORMED，新探针及跨启动Job竞态仍NOT_PERFORMED/UNKNOWN。最短真实链路是审核r5→负责人新模板确认/授权预检→自动新字节→最终SHA批准→R1，不由本单触发。未连接目标、不提交/推送/安装/新开代理或会话，预演1HALTED和r4VOID不改判。证据及全部文件SHA/命令退出码见outputs/a9-39-rehearsal-2-materials-r2/REPORT_DETAILS.json。

## A9-39 预演2材料已备，待审核与负责人逐字确认（2026-10-18 UTC）

负责人原话“A”已裁决采用方案B生成独立预演2材料；新run `df9b9b24-1efc-43d5-a1be-4207155604a7`，新根 `C:\A9-W46\run\df9b9b24`。材料位于 `.acceptance/a9-39/w46-rehearsal-2-preparation/`，状态“预演2材料已备，待审核与负责人逐字确认”。本单没有连接目标、执行预检、生成最终签发字节、激活或重跑预演1。

独立预算：控制SSH31=新预检1+执行30，SFTP上传1/下载1，运输总33；旧剩余额度不挪用。D1=P1，D2=P1_BUDGET_REHEARSAL2_ONE_PREFLIGHT_TOTAL33_ACCEPTED，D3=TWO_FULL_37_67_SAME_BYTES_P1_NOT_COUNTED（两次连续全量37/67同字节，P1不计次数）。新T0取本次r4答复UTC，截止取min(T0+8小时,负责人更早截止)；确认最终SHA上限7200秒、R1开始窗口300秒不变。旧T0/console/回执不迁移，pending-owner输入保持空缺。

r4预检材料包SHA `694ae189fa1afedca7f604ee36872bdead537a9f1276bbec82bba5a907defd1f`；新只读预检脚本SHA `9c14a5ac1f0f49f4ccca1b41da6f178ff6f8a806cb28ccb0f30b09008b35b266`（仅Test-Path新根绑定）。准确模板：

> D1～D3 按建议，确认预演 2 预检材料包 r4 SHA 694ae189fa1afedca7f604ee36872bdead537a9f1276bbec82bba5a907defd1f

本轮草案SHA `715b44425ecf37132797398f4e83ed0c71a72d504740d024edbb68ed3010d350`，不是最终签发SHA，不能作为执行批准。finalize输出新signing-final-r4/，预检证据新outputs/a9-39-rehearsal-2-auth/win7-preflight-r4/；总控证据新outputs/a9-39-rehearsal-2-run/<run-id>/，均已存在即拒。完整用法见新REHEARSAL_PLAN §2、§4～§6，当前只运行--print-template和本地测试。

闭包26项execution_tools、34项草案运输清单及SHA256SUMS包含同启动方式InJob探针和测试。门禁硬钉1/31/33并硬拒预演1的run与根；单字节探针篡改、同步伪造预算元数据、旧run/根复用均有负例。总控核预检结果哈希锚/签发字段后导入本轮D4计账（序号1），执行SSH从2号开始，最多31号；首失败不覆盖，R7/R8仍独立清理。

保留Bypass、Write-Output成功令牌、无声明ASCII/LF XML、J()无损TAB/JSON、R4 900秒及父目录记录。C:\A9-W46及其run由预演1创建，原R2.json哈希钉住；允许其现存普通目录并检查非reparse，新df9b9b24根必须不存在，ACL仅授新根。文件系统不能单独证明历史归属，依据原R2证据及新的只读复核。新探针/新根Win7实机NOT_PERFORMED，跨启动Job竞态UNKNOWN；冻结包内自身比较保持不变。

开发机Node20.17本轮门禁355/0（16正例、339反例，r2攻击19拒绝/3设计边界）、finalize126/0、总控134/0、InJob36/0；M1/M2/M5内置负例均判FAIL。SHA256SUMS、finalize --print-template、docs:check、diff --check的实际输出与全部文件钉见outputs/a9-39-rehearsal-2-materials-r1/REPORT_DETAILS.json。总控首轮旧夹具与新增outputs预检目录冲突EEXIST，已将软链接用例限定本轮run目录，保留原失败日志，生产路径检查未放宽。

当前分支codex/a9-alpha2-integration-r2、HEAD dc8cdecbaa07008edb931c8e01024878e7ad3d58；实际基线四文档已有修改，已留快照。仅新增候选外材料与证据、同步四文档；不改源码/原生/锁/构建/冻结ZIP，不重建产品。预演1完整目录、签发/回执、原始实机证据、旧预检、修复draft与双ZIP逐项哈希保护。历史HALTED/UNKNOWN保持；本地SURROGATE不等于目标验证、正式Gate或Alpha2 PASS。回执真伪依赖对话记录，脚本不能证明。

最短真实链路仍待审核和r4逐字确认后另行授权：新预检→最终SHA批准→一次激活→R1/R2新根→同启动探针→冻结controller自身比对→p01。当前只准备材料，不从本地测试推导目标权限。待办为审核、负责人逐字确认r4及新T0/更早截止、随后明确预检和最终SHA执行窗口；方案B/run/预算已裁决，无需重复裁决。

## A9-39 预演1 HALTED，预演2修复草案待裁决（2026-10-18 UTC）

预演1实机结论：HALTED / REHEARSAL_NOT_ELIGIBLE，run ce5b784f-040c-4054-ba4e-6ed1fa5d5de0，最终载荷SHA 261219f20431cf1b08048e74837f18883939a0d7c8fcdbce4515ccc520f4efe9。负责人原话“批准本次预演最终载荷SHA-256 261219f20431cf1b08048e74837f18883939a0d7c8fcdbce4515ccc520f4efe9”，回执confirmation_utc=2026-10-18T03:52:29.764Z。执行03:52:35.609Z～03:53:36.965Z；R0～R4与p01的R5通过，R6-p01在03:53:28.871Z首失败。包内controller拒绝TARGET_MISMATCH:in_job：父观察false/attempts1/error0，请求false；controller自身true/attempts2/last_error6。未进入包内consume，包内消费/完成均0，后四阶段未执行。预演1不重跑。

实机已证实本轮入口链的进程级Bypass、R4/R5成功令牌Write-Output、p01无声明XML注册与回读；R4在9.094秒内展开并校验801项（上限900秒）。其余四份XML只有上传SHA核验，注册/运行仍未执行。R7的TreeHash TAB/JSON修复本次成功回收14项/121101字节，R8 tasks_remaining=0且processes=[]。控制SSH8+预检3=11/33，余22；上传1/1、下载1/1均耗尽；运输合计13/35，余SSH不能挪成SFTP或自动重试。

确定的材料根因是测量对象错误：父任务的in_job不能代表新启动controller自身。Start-Process -Wait/重定向包装是Job差异的主要嫌疑，但分配Job的具体API/时序没有实机追踪，机制级根因UNKNOWN。last_error6是控制器首轮失败后保留的诊断，第二轮成功测得true，不是unknown或false。WIN7-45先例是cmd直接启动powershell；其猜bool再翻转的旧逻辑不继承。

选择B：同一powershell.exe、flags及Invoke-Logged/Wait/Hidden/双路重定向先启动候选外controller-injob-probe，记录子PID/父PID、SID/Medium/非提升/session、5次交替句柄查询与UTC。issue-request在createRequest前核父PID还等于真实issuer.ppid、身份/console/30秒新鲜度及query_ok，再使用child.in_job；父观察保留，合并观察单独版本化落盘。unknown/不匹配先停，不猜另一bool；冻结包比较未改。探针与controller仍是两个实例，跨启动竞态及新PS在Win7运行保持UNKNOWN/NOT_PERFORMED，最终controller比较仍是最后一道拒绝门。

修复仅在独立.acceptance/a9-39/w46-rehearsal-2-preparation-draft，预演1完整目录、签发/回执、原始运行证据、旧预检与双ZIP不改。草案新run df9b9b24-1efc-43d5-a1be-4207155604a7、新根C:\A9-W46\run\df9b9b24只是待裁决标识；建议新窗口控制SSH31（新预检1+执行30）、SFTP各1、总33，旧消耗另记。沿用r3的包逐字确认→新预检→最终SHA确认7200秒→R1开始300秒机制，但新包SHA/预算D2/T0/截止均须重新裁决，本单没有生成签发字节或预检包。

开发机Node20.17：定向29/0，修复版请求生成器与原门禁/原ZIP模块文件沙箱346/0（含unknown不生成请求、父false子true实际写true并通过原verifyRequest）。PS仅静态合同，沙箱为SURROGATE，不能记成修复实机PASS。当前HEAD dc8cdecbaa07008edb931c8e01024878e7ad3d58；不连接目标、不执行预检、不提交/推送/装依赖/新开会话代理。证据见outputs/a9-39-rehearsal-injob-r1/REPORT_DETAILS.json、DIAGNOSIS.md及预演2CHANGE_LIST.md。

见[A9-39 §11.8.9](tasks/A9_39_ALPHA2_FINAL_CANDIDATE.md#1189-预演1实机halted与子进程injob修复草案2026-10-18-utc)。产品Win7/冻结/门A门B/Alpha2RC结论不升级。

## A9-38 开发收口已登记，带已知限制（2026-10-16，开发机）

负责人回复“批准”，同意 A9-38 按选项 A 带已知限制签发并本地合入整合分支。执行代理以 [ADR-0249](DECISIONS.md#adr-0249-a9-38-登记-a9_38_developer_verified带已知限制) 登记 `A9_38_DEVELOPER_VERIFIED`。结论限开发机，绑定隔离分支 `codex/a9-38-basic-credential-redaction`、基线 `234e3dfb…`、产品 `1809d4a5…`、测试 `34b9036c…`。

Node 20.17.0 三套 Jest 共 150 PASS/0 FAIL，`verify:quick`、`docs:check` 和差异检查通过。产品检查沿用第三轮与聚焦复核的 `INHERITED_EVIDENCE`。Claude、codex 复审、codex 聚焦复核分别为 0P0/0P1/4P2、0P0/0P1/1P2、0P0/0P1/0P2。各轮原始失败与审核报告保留，完整身份及审核哈希见[报告 §10](reports/2026-10/a9_38_basic_credential_redaction_2026-10-16.md#10-开发收口登记2026-10-16)。

本结论带 ADR-0249 的 K2～K8 限制，K1 已关闭。K3 为 Digest 只替换首个参数；K7 为带引号值与 JSON/字典键形式不脱敏。数字/符号开头文本会多替换后续单词，属保守脱敏边界。POSIX 夹具为 `SURROGATE`；KL-12 仍为 P1/NOT_PERFORMED。

`Win7-Validation` 保持 `NOT_PERFORMED`。A9-38 产品改动不在 WIN7-45（第二批正式验收候选）中，未在 Win7 实机验证。本登记不签 Electron/Win10、新候选、Alpha2/RC、推送、合入 main 或发布。本轮未提交、未整合、未推送、未连接远端。下一步为本地提交并快进合入 `codex/a9-alpha2-integration-r2`；整合前再核号，整合后按既有方案重跑 A9-32 §5。本轮未执行这些后续动作。

## A9-37 开发收口已登记，带已知限制（2026-10-16，开发机）

负责人已批准 `A9_37_DEVELOPER_VERIFIED`，执行代理以 [ADR-0247](DECISIONS.md#adr-0247-a9-37-登记-a9_37_developer_verified带已知限制) 登记。结论限开发机，绑定隔离分支 `codex/a9-37-checkpoint-secrets`、基线 `013cf796…`、产品 `603323e2…` 与测试 `19120763…`。Node 20.17.0 三套 Jest 共 118 PASS/0 FAIL，`verify:quick`、`docs:check` 和差异检查通过。codex 第二轮独立审核为 0P0/0P1/0P2；Claude R-01 与 codex 首轮 P1 的同一项目说明外发门问题已修复。首轮 113 PASS/2 FAIL 与原失败证据保留。

普通示例可执行 Shell 并按原字节撤销，项目说明恢复保守外发门。本结论带 ADR-0247 的 L1–L6 已知限制。L1 是已登记代理密码的 HTTP Basic 组合编码不匹配。L2 是既有 Basic 凭据日志/投影脱敏缺陷。L1/L2 由后续单独任务处理，本登记不授权该任务。L3–L6 的完整边界见 ADR-0247；KL-12 仍为 P1/NOT_PERFORMED。

`Win7-Validation` 保持 `NOT_PERFORMED`。A9-37 产品改动不在 WIN7-45（第二批正式验收候选）中，未在 Win7 实机验证。Electron/Win10、新候选、Alpha2/RC 与推送/合并/发布均未签发。ADR-0246/0247 整合前再核号；[整合方案](reports/2026-10/a9_37_checkpoint_secret_classification_repair_2026-10-15.md#整合方案与复验边界)已准备，整合后重跑 A9-32 §5。整合与该轮复验均 NOT_PERFORMED，当前未提交、推送或连接远端。

## A9-36 r7 作废，按 ADR-0251 改在 WIN7-46 执行；改绑见任务书 §10.12（2026-10-17 UTC）

执行代理已在 A9-36 §3 六路径内完成 §9 缺口的追加实现（含 M6），固定断言 49 条：driver 44 条加 M6 的 5 条（ADR-0245）。开发机合同 321/321 通过；codex 八轮只读复审的 P0/P1/P2 均已处理，第八轮结论见[A9-36 §10](tasks/A9_36_ALPHA2_SUPPLEMENTAL_ACCEPTANCE.md#10-追加实现与独立复审结果2026-10-16-utc)。未提交，Win7 实机仍 `NOT_PERFORMED`（M4 之后的各阶段）。

负责人已于 2026-10-17 签发门 A（r5：`1ff2376f…`，修订 1：`dd0d19ef…`；r6：`9a13a17e…`，运行 `76c7f922…`）。r5 在 m4 因执行策略和 `EPIPE` 停止，没有启动产品。r6（Win7 实机，候选 WIN7-45）完成 R0 至 R3：桌面入口修复在目标机生效，`--issue` 与 `--run` 都完成，请求被消费；随后编排器的候选完整性检查约 3 秒内抛 `A9_36_CANDIDATE_CHANGED`，m4 结果 `FAIL`，账本 `HALTED`，没有产品进程，没有断言结果。执行代理按硬停止规则停止，取回 8 个证据文件，删除六个任务；目标机系统策略未改，文件全部保留，预算已用管理员 SSH 12/112。

原因判断（推断，没有在目标机逐文件定位）：编排器用被 Electron 修补的 `fs`，`resources/default_app.asar` 被当作归档目录。执行代理在开发机让该检查改走 `original-fs`，codex 第七、八轮复审，合同 321/321，r7 作废，按 ADR-0251 改在 WIN7-46 执行；改绑见[任务书 §10.12](tasks/A9_36_ALPHA2_SUPPLEMENTAL_ACCEPTANCE.md#1012-codex-接手候选改绑2026-10-17)。原 r7 材料的运行 `44e39fb0…`、请求 SHA256 `fca429ad…` 与原字节保留，不得用于新候选。WIN7-46 的新门 A 与 R2 实际运行时预检均为 `NOT_PERFORMED`。目标机候选目录是否另有文件被改动、新写法的 Win7 运行均为 `NOT_PERFORMED`。未提交。明细见[任务书 §10.9、§10.10](tasks/A9_36_ALPHA2_SUPPLEMENTAL_ACCEPTANCE.md#1010-修复完整性检查与新门-ar7请求材料2026-10-17-utc已作废未签发)，登记见[缺口表§23](plans/A9_ALPHA2_GAP_DISPOSITION.md#23-a9-36-追加实现与三轮独立复审已完成2026-10-16-utc)。


## A9-36 两份分叉并为一份，实现缺口已比对（2026-10-16 UTC）

负责人回复“批准”后，执行代理核对分支发现：2026-10-15 负责人已批准 A9-36 六路径 M1～M5 本地实现，该任务书在 `codex/a9-36-alpha2-supplement` 工作树，六路径已实现（开发机 R7 276 PASS），门 A 已过期，R0 因 agent 会话 5 断开停止。下文“A9-36 草案”是 a9-33 工作树的另一份分叉。负责人裁决以 a9-36 工作树为准（ADR-0244，选项 A）：[草案的必跑集合、隔离范围与 M6](tasks/A9_36_ALPHA2_SUPPLEMENTAL_ACCEPTANCE.md) 已并入，M4 字节改钉六路径现有字节。

并入后的静态比对（开发机，未运行驱动）见[任务书 §9](tasks/A9_36_ALPHA2_SUPPLEMENTAL_ACCEPTANCE.md#9-并入后实现缺口比对2026-10-16-utc只读)：26 行中已覆盖 10、部分覆盖 10、未覆盖 5（M1-07、M2-06、M3-02、M3-04、M6）、超出 ADR-0242 缩减 1（M2-05）。追加实现、M6 和新目标门 A 均未批准，仍 `NOT_PERFORMED`；旧门 A 已过期，续期草案未签。待负责人裁决：M2-05 已实现断言的保留或删除、M1-02 `refs` 判据、是否批准追加实现。登记见[缺口表§21](plans/A9_ALPHA2_GAP_DISPOSITION.md#21-a9-36-两份分叉并为一份2026-10-16-utc)。

## WIN7-45 门 B 已限定范围签发，Alpha 2 影响分析已交付，G16、G17 已裁决（2026-10-16 UTC）

负责人回复“门B选A1”：WIN7-45 第二批限定已直接证明范围签发，结论 `A9_33_WIN7_45_BATCH2_PASS_WITH_KNOWN_LIMITS`（Win7 实机，source `ba042757…` / ZIP `ae1d4bb1…` / run `5773470e…`）。KL-12 为排除项，仍 P1 / NOT_PERFORMED。不声明原完整合同全部满足；完整 Alpha 2、RC、ADR-0155、A9-32 `DEVELOPER_VERIFIED` 均未签。见 ADR-0238 与[A9-33 §6.80](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#680-门-b-限定范围签发与-q1-影响分析2026-10-16-utc)。

缺口表 Q1 选 C。[影响分析](reports/2026-10/a9_alpha2_impact_analysis_g04_g05_g07_g08_g09_2026-10-16.md)（开发机，只改文档）结论：G05、G08 的审阅与检查点代码无改动，G04 的 Provider、预算、终态验证判定代码区无改动，G09 只多一个窄入口。G07 发现 F-01：13 种启动器包装写法（如 `start npm publish`）在 WIN7-42 要确认、在 WIN7-45 直接放行，负责人选 A：登记为 Alpha 2 已知限制，不在验收前修复，不改候选（ADR-0239）；修复排期未裁决，不授权实现。

[G11、G12、G14 影响分析](reports/2026-10/a9_alpha2_impact_analysis_g11_g12_g14_2026-10-16.md)（开发机，只改文档）结论：三行都不能整行继承，未发现新的行为回归。98 种“包装器 + Git”写法新旧判定一致，F-01 不波及 Git。G14 的撤销函数与检查点管理器未改，缺续跑回合与后台进程相关的撤销证据。G11 在 Win7 上没有任何候选的真实模型存档证据，M5 保留。G12 的 CMD 降级路径在 WIN7-45 未被执行。观察 O-01：系统提示正文变了，版本标记仍是 `a9-system-prompt-v3`。

缺口表 Q2 已按推荐裁决（ADR-0240）：企业 CA 与代理、POSIX Shell 与 PowerShell `/Command`、A9-17 启动与内存、≤799px、A9-34、KL-12 登记为 Alpha 2 已知限制并延期到 RC。G16（A8-06）与 G17（部署、回退、备份、DPAPI、SBOM）先做只读对照再定。对照完成前 Alpha 2 候选保持冻结的 WIN7-45。见[缺口表§11](plans/A9_ALPHA2_GAP_DISPOSITION.md#11-q2-裁决六项已知限制延期到-rcg16g17-先对照2026-10-16-utc)。

[G16、G17 对照](reports/2026-10/a9_alpha2_comparison_g16_g17_2026-10-16.md)（开发机，只改文档）已交付，负责人按推荐裁决（ADR-0241）：G16 登记为 `N/A`；G17 升级与回退补最小 Win7 组 M6（待并入 A9-36 草案，未批准执行），DPAPI、备份生成、诊断包导出、SBOM 内容适用性登记为 Alpha 2 已知限制并延期到 RC。M6 的草案范围见[缺口表§14](plans/A9_ALPHA2_GAP_DISPOSITION.md#14-m6-草案范围2026-10-16-utc草案未批准)，已按负责人回复并入 A9-36 草案 §6（组件级，回退目标 WIN7-42，状态仍为草案，见[缺口表§15](plans/A9_ALPHA2_GAP_DISPOSITION.md#15-m6-已并入-a9-36-草案2026-10-16-utc)）。codex 对 A9-36 草案只读独立审核一轮（0 项 P0、3 项 P1、3 项 P2，全部复核采纳）：夹具与探针并入既有 `a9-alpha2-supplement.cjs`，通过判据改为与开发机基线逐字段相同，损坏库判据固定，见[缺口表§16](plans/A9_ALPHA2_GAP_DISPOSITION.md#16-a9-36-m6-独立审核与修订2026-10-16-utc)。负责人暂不批准 A9-36，并要求对 M1～M5 部分也做一轮 codex 只读审核：0 项 P0、7 项 P1、2 项 P2，全部复核采纳，A9-36 新增必跑集合与隔离范围（含 Electron `userData`），仍为草案，见[缺口表§17](plans/A9_ALPHA2_GAP_DISPOSITION.md#17-a9-36-m1m5-独立审核与修订2026-10-16-utc)。负责人随后采纳影响分析对 M2-05 的缩减（ADR-0242）：不重做 Provider 拒绝与预算检查，保留 M2-06 的再次主动尝试；这两项在 WIN7-45 Win7 实机 `NOT_PERFORMED`，依据只是开发机源码区间比较，见[缺口表§18](plans/A9_ALPHA2_GAP_DISPOSITION.md#18-m2-05-缩减已登记2026-10-16-utc)。负责人随后要求对修订后的 A9-36 全文复审，codex 只读复审一轮（0 项 P0、3 项 P1、2 项 P2，全部复核采纳）：新增放行规则（必跑项缺一项则该组未完成，排除项随结论携带）、M3 的 B0/B1/B2 字节基线与 M3-04 的 `drifted` 判据、M2-06 三项判据、M6 比较规则，并把 M1-02 的 19 种 Git 形态清单来源更正为 `W42_GIT_FORMS`，见[缺口表§19](plans/A9_ALPHA2_GAP_DISPOSITION.md#19-a9-36-全文复审与修订2026-10-16-utc)。负责人确认 M3-04 通过口径：晚写后撤销，字节保持晚写内容，路径列入 `drifted`（ADR-0243，见[缺口表§20](plans/A9_ALPHA2_GAP_DISPOSITION.md#20-m3-04-通过口径已确认2026-10-16-utc)）。A9-36 仍为草案，负责人暂不批准。对照结论如下。G16 建议登记为 `N/A`：A8 已被 ADR-0089 冻结，A8-06 对象是 `0.2.0-alpha.1`。G17 的包闭包、SBOM 与许可证文件有 Win7 实机证据，双构建是 macOS 开发机记录；升级与回退在 WIN7-45 无 Win7 实机证据，开发机跨版本数据库差分 13 项接口调用无异常，但发现两处回退差异：R-1（持久化为 `running` 且 `owned` 的 `start_process` 句柄，WIN7-45 判需要清理，WIN7-42 判不需要）和 R-2（续跑过的任务，WIN7-42 把续跑提示词当作任务目标）；DPAPI、备份生成、诊断包导出、SBOM 内容适用性建议延期。codex 独立审核一轮，8 条发现已采纳。候选仍是冻结的 WIN7-45。见[缺口表§12](plans/A9_ALPHA2_GAP_DISPOSITION.md#12-g16g17-只读对照已交付待负责人裁决2026-10-16-utc)与[§13](plans/A9_ALPHA2_GAP_DISPOSITION.md#13-g16g17-裁决已登记2026-10-16-utc)。

## Alpha2补证门A已批准，R0桌面断开阻断（2026-10-15 UTC）

负责人同意更新执行时限，续期材料已在候选外准备。最新只读核对agent会话5仍Disc，新run不存在，未执行产品。新准确材料仍待活动桌面恢复后的确认。

后续负责人授权切换既有agent会话5。系统tscon一次调用被账户限制拒绝，Windows错误1327；未更改密码、权限或策略。需要本地交互登录agent。原门A已于洛杉矶时间2026-10-15 16:30到期，当前仍未执行产品。详见[A9-36 §7.3](tasks/A9_36_ALPHA2_SUPPLEMENTAL_ACCEPTANCE.md#73-负责人授权切换用户系统账户限制拒绝)。

[A9-36](tasks/A9_36_ALPHA2_SUPPLEMENTAL_ACCEPTANCE.md)六路径在隔离分支codex/a9-36-alpha2-supplement完成。基线HEAD013cf796…加准确工作字节，产品/原生/冻结WIN7-45不改。完整开发机合同R7为276 PASS，末次引用修复的R8定向14 PASS/0 FAIL，其余262未重跑。独审R6关闭配置、请求、Read Only与J1读回/最终引用问题；本轮限定输入无未关闭问题。既有M4读取峰值P2和KL-12延期技术状态保留。

24件本轮构建生成的tracked runner/dist已恢复HEAD。旧A9-33十输入与交接SHA匹配，主树原47项修改保留；冻结ZIP/manifest/IDENTITY摘要一致。未提交或推送。此处A9_36_DEVELOPER_VERIFIED只对应本地输入阶段，不能推导目标PASS或A9-32签发。

准确门A材料及SHA见[A9-36 §7](tasks/A9_36_ALPHA2_SUPPLEMENTAL_ACCEPTANCE.md#7-待负责人签发的目标门a)。新run0daf288c…拟普通agent/session5执行M4→M1→M2→M3→M5，5请求/5400秒；真实Provider三轮、40 HTTPS请求及1MiB累计响应。旧候选只读复用，新输入/任务/profile均在新run。负责人已批准准确门A材料f1c0d968…并另存回执。R0包/工具哈希等核对一致，但agent会话5已断开，无活动console；已停止下游并保存HALTED_R0。未上传、建目标目录/任务或运行产品；M1～M5为NOT_PERFORMED。KL-12延期已接受，不重复申请接受。

已授权只读元数据确认现存Python3.8.10/MinGit2.46.2路径与SHA、PS5.1及保存的HTTPS api.deepseek.com/deepseek-v4-flash配置。Medium/InJob、DPAPI/TLS和模型旅程仍需新实际入口证明。进度继续集中在[缺口处置表§7.5](plans/A9_ALPHA2_GAP_DISPOSITION.md#75-补证执行委托与准备2026-10-15-utc)。

## Alpha2补证准备：Win7配置已只读核对，M4驱动待复核（2026-10-15 UTC）

负责人要求优先由执行代理验证，并选择M5复用Win7普通agent已保存的真实服务配置。新准备run为`0daf288c-7d26-4ebc-b17c-40bc9702ce13`。首次SSH握手超时FAIL已保存；负责人确认连接恢复后，第二次只读预检PASS：DCCS-CHAIZL-PC/Win7 SP1 x64/agent精确SID匹配，当前活动桌面是console5，旧正式run的console2绑定不可复用。新远端根不存在，未见相关Electron/helper。真实Provider非秘密配置为`https://api.deepseek.com`、`deepseek-v4-flash`、已记住密钥、无代理/自定义CA；DPAPI恢复、真实请求和M1～M5产品执行仍NOT_PERFORMED。

已在A9-33原白名单的驱动/合同测试两路径实现M4的17种公开continueTask非法参数输入；独审指出的P1已修复，开发机合同262 PASS。补充入口独立显式启用，不改变原正式模式闭集、25用例/43断言或冻结候选。新M1～M5调度需要当前白名单外入口，已备[A9-36六路径本地实现提案](tasks/A9_36_ALPHA2_SUPPLEMENTAL_ACCEPTANCE.md)，状态DRAFT_READY_FOR_REVIEW；相关新实现等待批准，未生效。新目标运行输入/身份/预算和适用门A尚未形成，不上传、启动产品或复用旧预算。详见[A9-33 §6.79](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#679-alpha2补证执行委托与准备2026-10-15-utc)与[缺口表§7.5](plans/A9_ALPHA2_GAP_DISPOSITION.md#75-补证执行委托与准备2026-10-15-utc)。

## WIN7-45 实机执行与复核已结束，KL-12 延期，门 B 待签（2026-10-15 UTC）

独立复核已完成：0P0/1P1/0P2，不建议按当前未缩小合同进入门B签发PASS。唯一既有P1剩余项为KL-12：真实helper启动后ready失败清理仍NOT_PERFORMED；无效cwd预启动拒绝不能替代，release部分已取得直接证据。新产品运行缺陷发现0，不改正式43条PASS原值，也不签原合同完整满足。独立报告SHA-256 65cbe27f…，见[交接书§10](plans/A9_33_WIN7_45_ACCEPTANCE_HANDOFF.md#10-独立复核结论与门-b-前置处置2026-10-15-utc)及[A9-33 §6.75](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#675-独立复核完成kl-12-p1-与负责人待裁决2026-10-15-utc)。

负责人本轮已明确接受KL-12延期，并要求只读证据对账。延期接受事实已登记，不再等待重复接受；该项仍为P1/NOT_PERFORMED，不改原始技术结果。本轮实机执行、证据回收和独立复核已结束；不自动派发实机动作。后续修复安排保持[推进顺序§6.7](plans/A9_ALPHA2_DELIVERY_SEQUENCE.md#67-kl-12-延期修复与补证登记2026-10-15-utc)与[覆盖台账§8](plans/A9_BATCH_2_ACCEPTANCE_COVERAGE.md#8-kl-12-后续修复与补证计划2026-10-15-utc)。

KL-12延期接受与准确限定范围口径见[交接书§12](plans/A9_33_WIN7_45_ACCEPTANCE_HANDOFF.md#12-负责人明确接受-kl-12-延期2026-10-15-utc)。当前只读对账不执行门B签发，门B仍NOT_PERFORMED；不签原合同全部满足、完整Alpha2/RC、ADR-0155或DEVELOPER_VERIFIED。前一轮同名分支Git同步已完成，本轮只读核对源码/证据并产出文档，不新增Git提交/推送或发布。

只读证据对账已完成，清单见[缺口处置表§7](plans/A9_ALPHA2_GAP_DISPOSITION.md#7-只读证据对账与最小补证清单2026-10-15-utc)。旧8类R项合并为M1 Policy/Git、M2验证/Provider/预算、M3 Diff/撤销恢复、M4继续Schema负向、M5真实模型旅程5组，不代表5次实机运行。10阶段/43断言原值及hash匹配；三个稳定组件34件包内文件同字节但未批准行为继承。A9-32仍缺部分合同对应，A9-34与其他Alpha2范围处置保留。源码、候选和原始证据不变。

负责人在当前会话对准确载荷47fe7cae…及交接书范围回复“批准”。回执首次观察时间11:58:37Z，聊天消息精确时间UNKNOWN；本轮正式窗口至19:58:37Z。run5773470e…保持，1次/16请求/7200秒、原目标/角色/限制不变。R1确认Win7 SP1 x64、agent/SID/console2、新根不存在、102进程无Electron/helper；R2新根建立，R3全部10文件大小/哈希一致，R4解压manifest一致。

唯一正式运行于12:04:09Z开始，最后阶段于12:12:19.870Z完成，490.87秒；10阶段/25用例/43断言全部PASS，10 CONSUMED/10 COMPLETED且结果hash逐一匹配。Electron22.3.27/Node16.17.1/ABI110、实际模块加载及8个报告负例直接通过。R7共338项大小/SHA全匹配（255项本run直接、83项同包runtime载荷INHERITED_EVIDENCE），本地264文件扫描零命中/正控检出；R8相关进程0/本次任务0。原始闭包和1989件保护清单均保存，正式执行结果SHA-256 0870f035…；全部旧候选/预演24件及冻结WIN7-45身份核验不变。

BG03无效cwd走预启动拒绝；release持久化owned→release_intent→released且同releaseId，产品正常code0、4535ms退出，被释放PID4980+创建时间同实例存活后按身份清理无残留。真实helper ready失败清理仍NOT_PERFORMED（KL-12）。上述直接执行事实与独审P1并存，门B不签。详见[A9-33 §6.74](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#674-门-a-批准win7-45-正式执行与证据回收2026-10-15-utc)和[交接书§9](plans/A9_33_WIN7_45_ACCEPTANCE_HANDOFF.md#9-门-a-批准与正式执行结果2026-10-15-utc)。

传输前本地核对发现phase.cmd仍含预演19根；原件保留，只改新run绑定后重新核对10文件清单及任务XML，未触碰旧根或改授权载荷。候选冻结字节保持。

负责人在当前会话要求按“双干净构建、比对、冻结、新门A、正式运行、独立复核、门B”计划推进。执行代理已完成两个独立干净工作树的构建，源ba042757…，两个ZIP与预演18/19的包逐字节相同（ae1d4bb1…，101680489字节）；开发机包闭包800项零差异，本地静态绑定799文件/800ZIP条目零不一致。WIN7-45于11:48:38Z冻结在主工作区.acceptance/candidates/WIN7-45，11文件与目录只读。首次缺模块依赖链接的构建失败无ZIP，原日志保留；补齐既有链接后用新输出目录构建通过，未改源码或依赖版本。跨机器可重复性UNKNOWN。

正式run固定5773470e-a1c0-402b-8454-966e38a73f68，已批准载荷SHA-256 47fe7cae16961cac6124ed0aebab56f66e562550a2e025ca02a121b21d86de2d；[WIN7-45交接书](plans/A9_33_WIN7_45_ACCEPTANCE_HANDOFF.md)给出准确范围，门A后续记录以上述当前段落为准。KL-12实际helper ready失败清理仍NOT_PERFORMED，不因预演PASS关闭。冻结材料见[A9-33 §6.73](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#673-win7-45-双干净构建冻结与新门-a-材料2026-10-15-utc)。

预演18/19均在DCCS-CHAIZL-PC、Win7 SP1 x64、普通agent/console2执行成功，各p01～p10、25用例、43断言全部PASS。源ba042757a04f428cb3db3ccd10888a7bebe97d3b、同一ZIP ae1d4bb1…，run分别f17a0389…和2317fe31…；无效cwd正常拒绝、release正常退出、退出后同实例存活及按身份清理均直接验证。每轮R7的338项大小/哈希匹配、扫描零命中且正控检出；R8相关进程/本次任务0。累计122/156，连续成功2次。

套件修复已通过第21轮全新独立复核（0P0/0P1/0新增P2，开发机）；产品保持5f7c0e80…字节。相同包运行时载荷按远端逐SHA标INHERITED_EVIDENCE，本次行为与身份为实机直接证据。两次均REHEARSAL_NOT_ELIGIBLE，不计正式验收。旧16/17 FAIL、UNKNOWN及HALTED保持，不推送。预演事实见[A9-33 §6.71～6.72](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#671-第21轮关闭与win7预演18-pass)与[报告§11](reports/2026-10/a9_35_local_managed_start_failure_repair_2026-10-15.md#11-同包win7预演19-pass两次连续成功已取得)，后续冻结状态以上述当前记录为准。

## A9-32 隔离实施入口（2026-10-11）

A9-32 本地实现已获准，基线 `571ec550…`，分支 `codex/a9-32-explicit-continue`。
合同见[A9-32 §6](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#6-本轮本地实施批准与影响登记2026-10-11)。
A9-30/31 原开发结论保持。F1～F3 已修复；开发机 State84/Core212/Shell133 PASS。
本轮绑定 r2 源清单，8 个最终字节反例均断言失败并恢复。F5 已于 2026-10-12 由负责人确认（[§7.2](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#72-f5-授权来源确认2026-10-12)）。
生产页面交互为 SURROGATE；真实 Electron/新包/Win7 NOT_PERFORMED。独立审核结论见下文。
A9-32 Gate 保持 IMPLEMENTATION_AUTHORIZED；[本轮报告](reports/2026-10/a9_32_local_implementation_and_batch2_readiness_2026-10-11.md)给出准确源/待提交范围。
第二批、完整 Alpha 2 与 RC 未裁决。ENGINEERING_02 §138 HALTED 保持。
2026-10-12 负责人对 D5 第 3～6 项选 A：ADR-0189 补充待核号，A9-33 路径条件批准，不下载 Electron，目标值待提供（[A9-33 §6.5](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#65-负责人裁决登记2026-10-12)）。
独立增量复审（负责人另开的 Claude Sonnet 5.5 会话）：有发现项 PASS（开发机），绑定 `adb9d0f0…`，增量 `59a3f650…..adb9d0f0…`。未发现阻断、高、中级问题，结论见[增量复审结论](reports/2026-10/a9_32_incremental_independent_review_conclusion_2026-10-12.md)。
R-01 修复与 R-03 的 3 个新增用例通过本次增量复审。负责人裁决 R-08、R-09 为已知限制，不补用例，见 [A9-32 §7.7](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#77-增量复审结论与已知限制2026-10-12)。不签 DEVELOPER_VERIFIED，A9-33 保持 DRAFT_READY_FOR_REVIEW。
2026-10-12 负责人对 D5 第 2 项选 A，追认上述 Claude Sonnet 5.5 会话为 A9-32 的独立审核者（[A9-32 §7.8](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#78-独立审核者追认2026-10-12)）。该追认不覆盖 A9-33 技术独立复核者，不签 DEVELOPER_VERIFIED；A9-33 §1 仍缺完整干净基线 SHA。
2026-10-12 负责人对顺序矛盾选 C：A9-32 不签 DEVELOPER_VERIFIED，须待新 Windows 开发包取得 §5 要求的真实 Electron 证据后另行裁决；A9-33 §1 前置改为“A9-32 开发机检查与独立复核通过”加完整干净基线 SHA（[A9-32 §7.9](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#79-developer_verified-签发条件裁决2026-10-12)、[A9-33 §6.6](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#66-1-前置修订裁决2026-10-12)）。A9-32 部分前置已满足，干净基线 SHA 未形成，§6.1 路径仍未生效。
2026-10-12 负责人对基线定义选 A：9 个文档文件已提交为 `152106f3…`（分支 `codex/a9-32-explicit-continue`，未推送），产品源码与 `adb9d0f0…` 字节相同。A9-33 §6.1 路径生效，任务登记为 APPROVED_FOR_IMPLEMENTATION；ADR-0155 仍为 Proposed，A9-33 实现、构建、Win10、Win7 均 NOT_PERFORMED（[A9-33 §6.7](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#67-基线登记与-61-生效2026-10-12)）。
2026-10-12 执行代理在分支 `codex/a9-33-batch2-win7-acceptance`（HEAD `7e96f561…`）本地实现 §6.1 的 20 个路径，全部未提交。开发机 §4 五项检查通过（包测试 119、shell jest 73、`verify:quick`、`docs:check`、`diff --check`）。驱动、冒烟、控制器未在 Electron、PowerShell、Win10、Win7 运行；5 条断言按设计为 NOT_PERFORMED，阶段 p06～p08 待负责人裁决（[A9-33 §6.8](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#68-本地实现进展2026-10-12)）。
2026-10-12 负责人同意放宽两条文档限制并指定 codex 为 A9-33 技术独立复核者，取代上文“5 条断言待裁决”与“复核者未指定”的状态：合同收窄为 25 用例、42 断言（B2-CONT-02、B2-SAFE-01 移为已知限制），A9-32 §5 真实 Electron 取证可由首次 Win7 预演取得（仍不自动签 DEVELOPER_VERIFIED）。驱动已实现 B2-UI-01 与 B2-CONT-03 第 2 条；开发机检查通过，真实 Electron、PowerShell、Win10、Win7 均 NOT_PERFORMED。负责人选 A 授权本地提交，实现提交 `905bf760…`（未推送）（[A9-33 §6.9](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#69-负责人裁决登记与合同收窄2026-10-12)）。
2026-10-13 codex 对 `905bf760…` 的第一阶段复核结论为不建议进入预演授权评审（0 个 P0、8 组 P1、3 组 P2）。负责人选 A，开修复轮并确认 P1-6 收窄；执行代理在 §6.1 路径内修复全部发现并补回归用例，修复已提交为 `8c16ffd9…`（本地，未推送），复核者尚未重审，负责人已同意重跑 codex 第一阶段。开发机检查结果见任务书；真实 Electron、PowerShell、Win10、Win7 均 NOT_PERFORMED（[A9-33 §6.10](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#610-codex-第一阶段复核与修复轮2026-10-13)）。
2026-10-13 codex 对修复提交 `8c16ffd9…` 的第二轮复核结论仍为不建议进入预演授权评审（0 个 P0、4 组 P1、2 组 P2；第一轮 11 组中 5 组关闭、6 组部分关闭）。负责人选 A，开第二修复轮；执行代理在 §6.1 路径内修复 R1～R6 并补回归用例，修复已提交为 `0c163c24…`（本地，未推送），复核者尚未重审，第三轮 codex 复核待启动。开发机检查：`node --test` 120 通过、shell jest 100 通过、`verify:quick` 与 `docs:check`（328 个文件）通过；真实 Electron、PowerShell、Win10、Win7 均 NOT_PERFORMED（[A9-33 §6.11](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#611-codex-第一阶段第二轮复核与第二修复轮2026-10-13)）。
2026-10-13 codex 对第二修复提交 `0c163c24…` 的第三轮复核结论仍为不建议进入预演授权评审（0 个 P0、2 个 P1、1 个 P2：进程列表被执行器无标记截断、幽灵令牌子串匹配、失败列表丢弃已见存活行）。负责人选 A，开第三修复轮；执行代理在 §6.1 路径内修复 3 项并补回归用例，修复已提交为 `cde53348…`（本地，未推送），复核者尚未重审，第四轮 codex 复核待启动。开发机检查：`node --test` 120 通过、shell jest 101 通过、`verify:quick` 与 `docs:check`（329 个文件）通过；真实 Electron、PowerShell、Win10、Win7 均 NOT_PERFORMED（[A9-33 §6.12](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#612-codex-第一阶段第三轮复核与第三修复轮2026-10-13)）。
2026-10-13 codex 对第三修复提交 `cde53348…` 的第四轮复核结论仍为不建议进入预演授权评审（0 个 P0、0 个 P1、2 个 P2：失败进程列表末列截断被当作完整行、令牌跨帧增长被误报为幽灵令牌）。负责人选择不再修复，将这 2 项登记为已知限制 KL-1、KL-2，并直接进入预演授权评审；第一段独立复核未通过，该例外由负责人裁决，不改写 codex 结论。预演授权未授予，待负责人对批准材料 Q1～Q4 作答并提供 Win7 机器名；真实 Electron、PowerShell、Win10、Win7 均 NOT_PERFORMED（[A9-33 §6.13](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#613-第一段独立复核终局与负责人例外裁决2026-10-13)）。
2026-10-13 负责人对预演批准材料作答：Q1 选 A（每次预演单独签预演授权文件）、Q2 选 B（有限滚动批准，最多 4 次、≤64 请求、≤8 小时）、Q3 选 A（不使用 Win10）、Q4 选 A（`agent` 已登录 Win7 控制台），并同意只改 `docs/` 的本地提交。预演授权仍未授予，缺 Win7 机器名、普通账户确认和时间窗起点；三个本地构建输入的哈希已与输入锁核对一致，未构建；真实 Electron、PowerShell、Win10、Win7 均 NOT_PERFORMED（[A9-33 §6.14](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#614-预演批准材料裁决2026-10-13)）。
2026-10-13 负责人授权一次 Win7 只读预检、确认普通账户为 `agent`，并裁决时间窗从授权补齐当日起。执行代理 08:12:32Z 完成预检（只读 `hostname`、`query user`、`ver`，未写文件、未改设置）：机器名 `dccs-chaizl-PC`，系统 6.1.7601，`agent` 在控制台会话 2 运行中，锁屏状态 UNKNOWN。预演授权仍未授予，缺负责人确认机器名和 `agent` 的 SID 核验；Win7 验收、预演、正式执行均 NOT_PERFORMED（[A9-33 §6.15](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#615-win7-只读预检与时间窗起点2026-10-13)）。
2026-10-13 负责人确认机器名 `dccs-chaizl-PC`，授权只读核验 `agent` 的 SID，并同意提交文档。执行代理 08:15:22Z 只读读得 `agent` 为本地账户，SID `S-1-5-21-1708701742-428676696-1831205153-1001`。目标绑定补齐，预演时间窗于 2026-10-13T08:15:22Z 开始，至 2026-10-16T06:59:59Z 止，预算沿用最多 4 次预演、≤64 请求、≤8 小时。写入类远端动作仍须先有负责人对预演授权文件 SHA-256 的同意，该文件尚未生成；预演、正式执行、Win7 验收均 NOT_PERFORMED（[A9-33 §6.16](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#616-目标绑定补齐与时间窗开始2026-10-13)）。
2026-10-13 负责人批准预演授权文件 `4b566715…` 后，执行代理在 Win7 实机完成预演 1（`REHEARSAL_NOT_ELIGIBLE`，绑定 `445f12e2…`）：p01 环境与身份 PASS（5/5 断言）、p02 包完整性 PASS（4/4 断言）、p03 最短链路 FAIL（`PHASE_RESULT_MISSING`），p04～p10 因前置未过 NOT_PERFORMED。根因是冒烟脚本漏设 `process.noAsar`，修复已提交为 `5499843…`（本地，未推送），尚未在 Win7 复核。Win7 上三个一次性任务已删除，进程无残留，运行根保留。预算：预演 1/4、请求 3/64。负责人已同意提交修复并构建预演 2；预演 2 须另有负责人对新授权文件 SHA-256 的同意。正式执行、Win10、Win7 验收均 NOT_PERFORMED（[A9-33 §6.17](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#617-预演-1-执行记录与-p03-修复2026-10-13)）。
2026-10-13 负责人批准预演授权文件 `b05f72a1…` 后，执行代理在 Win7 实机完成预演 2（`REHEARSAL_NOT_ELIGIBLE`，绑定 `efc785a8…`）：p01 环境与身份 PASS（5/5 断言）、p02 包完整性 PASS（4/4 断言）、p03 最短链路 FAIL（`DRIVER_CHAIN_EXIT_FAILED`，12 个断言 8 个 PASS、4 个 FAIL），p04～p10 因前置未过 NOT_PERFORMED。预演 1 的 `process.noAsar` 修复在 Win7 上生效。两个失败都在验收套件：B2-CH-02 观测循环在 Turn 结束时停止，第一帧晚 451 ms 落库（根因已确认）；B2-CH-06 控制器找不到退出对话框按钮（根因 `UNKNOWN`）。修复已提交为 `9820934c…`（本地，未推送；5 个文件，+280/−26，仅 §6.1 路径），控制器的 PowerShell 与内联 C# 未在任何 Windows 上运行，Win7 复核 NOT_PERFORMED。Win7 上三个一次性任务已删除，进程无 `electron`、`spike02`、`node` 残留，运行根保留。预算：预演 2/4、请求 6/64。负责人已同意提交修复并构建预演 3；预演 3 须另有负责人对新授权文件 SHA-256 的同意。正式执行、Win10、Win7 验收均 NOT_PERFORMED（[A9-33 §6.18](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#618-预演-2-执行记录与-p03-两项失败的修复2026-10-13)）。
2026-10-13 负责人批准预演授权文件 `d66d8bd5…` 后，执行代理在 Win7 实机完成预演 3（`REHEARSAL_NOT_ELIGIBLE`，绑定 `a22fde42…`）：p01 环境与身份 PASS（5/5 断言）、p02 包完整性 PASS（4/4 断言）、p03 最短链路 FAIL（`ASSERTION_FAILED`，12 个断言 10 个 PASS、2 个 FAIL），p04～p10 因前置未过 NOT_PERFORMED。预演 2 的两项修复在 Win7 上生效：观测循环不再提前结束（B2-CH-02-A02 PASS），退出对话框点击成功（`clicked index 0 via win32; button_gone=True`，产品退出码 0）。剩余两项：B2-CH-06-A02 是套件把自身进程算作残留，修复与 KL-3 收窄一并提交为 `83e03bf6…`（本地，未推送）；B2-CH-02-A01 是产品界面在 Turn 结束后不显示后台输出（IPC 快照 6 帧，界面 0 帧），不在 §6.1 路径内，负责人裁决选 B：登记已知限制 KL-3，断言收窄为落库与 IPC 快照，产品不改。该断言在预演 2、3 各失败一次，执行代理按暂停规则等待裁决后继续。Win7 上三个一次性任务已删除，进程无 `electron`、`spike02`、`node` 残留，运行根保留。预算：预演 3/4、请求 9/64。正式执行、Win10、Win7 验收均 NOT_PERFORMED（[A9-33 §6.19](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#619-预演-3-执行记录与-p03-两项剩余失败2026-10-13)）。
2026-10-13 负责人批准预演授权文件 `517894f7…` 后，执行代理在 Win7 实机完成预演 4（`REHEARSAL_NOT_ELIGIBLE`，绑定 `0ed05cbb…`）：p01 PASS（5/5 断言）、p02 PASS（4/4 断言）、p03 PASS（12/12 断言，预演 3 的两项修复在 Win7 上生效，KL-3 再现：界面帧 0）；p04 FAIL（套件竞态，`canStop` 仍为 true 时驱动立即抛 `PRODUCT_BUSY`）、p05 FAIL（4 个断言：BG-01、BG-02 是套件判据未解析转义 JSON，产品行为正确；BG-03 残留 1 项、S06 刷新后 2 次与重启后 0 次，原因 UNKNOWN；p05 第 1 次尝试因 `TARGET_MISMATCH:in_job` 被拒，重试通过）、p06 FAIL（`mode_diagnostics`：产品只在启动时读模式文件，驱动启动后才截断）；p07 被套件守卫 `SAME_CLASS_FAILURE_TWICE_DIAGNOSE_FIRST` 拒绝，p08～p10 NOT_PERFORMED。负责人裁决：放宽到预演 5 次（预演 5 是最后一次）、8 小时自 2026-10-13T14:33:16Z 重新计时；修复轮选 B，并同意 B2-S06 与 B2-UI-02 两项判定范围调整。开发机修复轮已本地提交为 `f672f518…`（未推送；5 个文件，+382/−48，仅 §6.1 路径，产品代码未改）：契约 jest 73 通过，`node --test` 120 通过，`verify:quick` 通过，6 项变异各被拦住；未在 Win7 验证。预算：预演 4/5，请求 15/64。正式执行、Win10、Win7 验收均 NOT_PERFORMED（[A9-33 §6.20](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#620-预演-4-执行记录与套件修复轮2026-10-13)）。
2026-10-13 负责人批准预演授权文件 `72eb3b3d…` 后，执行代理在 Win7 实机完成预演 5（`REHEARSAL_NOT_ELIGIBLE`，绑定 `767c6f3e…`，运行编号 `82f275a9`）：p01 PASS（5/5 断言）、p02 PASS（4/4 断言）、p03 FAIL（`DRIVER_CHAIN_A_FAILED`，2 个断言 PASS、10 个 NOT_PERFORMED），p04～p10 因前置 p03 未通过为 NOT_PERFORMED。失败原因是套件缺陷，由预演 4 修复轮新加的等待引入：驱动 `submit` 在输入文字之前等发送键可用，而渲染层规定输入框为空时发送键禁用，等待 30 秒后超时；契约测试曾把该写法固定为期望，开发机未发现；影响 p03～p08 的 16 处提交。开发机修复已本地提交为 `a4816779…`（2 个文件，仅 §6.1 路径，未推送）：三步 `submit`，并用真实渲染层逻辑做测试；`node --test` 120 通过，`verify:quick` 通过，jest 120 通过，变异检查 3 项失败；未在 Win7 验证。R7 取回 122 个文件，0 个哈希不一致；R8：进程表无 `electron`、`spike02`、`node`、`powershell`，无任务残留，运行根保留。预算：预演 5/5 已用完，请求 18/64；负责人回复“同意”，放宽到预演 6（最后一次），但 8 小时上限 22:33:16Z 已在回复前到期，计时规则待负责人裁决，裁决前不做写类 Win7 动作。p07～p10 从未在 Win7 运行，缺陷 UNKNOWN；KL-3 仍有效。正式执行、Win10、Win7 验收均 NOT_PERFORMED（[A9-33 §6.21](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#621-预演-5-执行记录与-p03-提交等待缺陷2026-10-13)、[§6.22](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#622-预演-6-放宽与计时矛盾2026-10-13)）。
2026-10-14 负责人批准预演授权文件 `0b4ad365…` 后，执行代理在 Win7 实机完成预演 6（`REHEARSAL_NOT_ELIGIBLE`，绑定 `bd09b1aa…`，运行编号 `37632497`）：p01 PASS（5/5）、p02 PASS（4/4）、p03 PASS（12/12，预演 5 的提交等待缺陷在 Win7 上修复生效，KL-3 再现）；p04 FAIL（S03T、S04、S05-A01、S05-A02）、p05 FAIL（BG-01、BG-02、BG-03 PASS，S06 重启 FAIL）；p04、p05 连续两次 `ASSERTION_FAILED`，套件守卫会拒绝 p06，执行代理暂停，p06～p10 NOT_PERFORMED。5 个失败项中 4 项已确认是套件缺陷（审计场景三次相同 read 触发产品重复调用检测；`runPrompt` 以对话内全部结束事件判终态加共用 call id；命令文本含密钥前缀；驱动自己的 WMIC 子进程被计为新增），S06 重启原因 UNKNOWN（驱动只调预加载接口切换对话，页面未跟随）。负责人选择放宽到第 7 次预演并开修复轮，修复结果发 codex 复核（gpt-6.1-sol，xhigh，非 fast）。开发机修复已本地提交为 `2c06317c…`（未推送；3 个文件，+296/−12，仅 §6.1 路径，产品代码未改）：`node --test` 120 通过，`verify:quick` 通过，jest 136 通过，8 项变异各被拦住；未在 Win7 验证，新的 PowerShell 与 cmd 密钥命令只做了文本检查。codex 复核（2026-10-14T01:57:11Z 完成）报告 1 个 P1、4 个 P2 并不建议进入预演 7 授权评审：后续驱动进程不再录入密钥使 S05 脱敏未被检验（P1），以及事件窗口基线、侧栏行前缀匹配、测试桩常量、UTF-8 切点落在 ASCII 字节（P2）；执行代理核实 5 条全部成立。负责人选 A 开第二修复轮，修复已本地提交为 `9dd3b165…`（未推送；3 个文件，+424/−54，仅 §6.1 路径，产品代码未改）：`node --test` 120 通过，`verify:quick` 通过，jest 172 通过，24 项变异 23 项被拦住；codex 复审（2026-10-14T03:04:48Z 完成）0 个 P0、0 个 P1、2 个 P2，R1～R5 原问题已关闭，但驱动在 Provider 配置与探测完成前就返回（N1），新测试桩不执行表单代码使“删除点击”的变异存活（N2），不建议进入预演 7 授权评审；负责人选 A 开第三修复轮，修复已本地提交为 `6679ef30…`（未推送；2 个文件，+154/−30，仅 §6.1 路径，产品代码未改）：`node --test` 120 通过，`verify:quick` 通过，jest 180 通过，32 项变异 31 项被拦住；codex 第 3 轮复审（2026-10-14T04:24:06Z 完成）0 个 P0、0 个 P1、1 个 P2：N2 与 R2 目标 Turn 保持已关闭，N1 部分关闭，页面快照刷新失败时按钮仍释放，驱动会接受旧探测成功文字；负责人回复“B”：N1 残余登记为已知限制 KL-4，不开第四修复轮，进入预演 7 授权评审。负责人批准授权文件 `caf9a83c…` 后，执行代理在 Win7 实机完成预演 7（`REHEARSAL_NOT_ELIGIBLE`，绑定 `0722df00…`，运行编号 `16f6af76`，预算 7/7 耗尽，请求 31/64）：p01、p02、p03、p05、p06 PASS；p04 FAIL（只有 S04 的 utf16le、cp936：产品在 PowerShell 下只解码 UTF-8）；p07 FAIL（B2-SAFE-02：Turn 行仍为 active 且无审计失败标记）；p08 FAIL（B2-UI-01 的 `loading_feedback`、`one_dispatch_while_busy`：第一次 Enter 无响应）；p09、p10 NOT_PERFORMED（从未在 Win7 运行）；后检无残留。2 条合同与产品不一致等负责人裁决；未在 Win7 验收通过（[A9-33 §6.25](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#625-预演-7-执行记录2026-10-14)）。R7 取回 150 个文件，0 个哈希不一致；R8 进程表 104 行无残留进程，任务经 COM 只读核验无 A9W43 任务（预演 5 的同类记录当时缺任务列表，已在 §6.23 披露）。预算：预演 6/7（预演 7 是放宽后的最后一次），请求 23/64。KL-1、KL-2、KL-3 仍有效。正式执行、Win10、Win7 验收均 NOT_PERFORMED（[A9-33 §6.23](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#623-预演-6-执行记录第-7-次预演放宽与套件修复轮2026-10-14)、[§6.24](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#624-codex-复核第-1-轮结果与第二修复轮2026-10-14)）。
2026-10-14 执行代理在开发机只读分类预演 7 的三项失败（绑定 `09fd4772…`）：B2-UI-01 套件缺陷，B2-SAFE-02 套件判据过窄，B2-S04 合同与产品不一致；处置选项与 S04 收窄草案（KL-5）见 [A9-33 §6.26](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#626-预演-7-失败分类2026-10-14开发机只读)，等负责人裁决。
2026-10-14 负责人批准 U-A、S-A、E-A，开第四修复轮（套件文件，修复送 codex 复审），登记 KL-5（PowerShell 下 CP936、UTF-16LE 不验收），见 [A9-33 §6.27](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#627-第四修复轮裁决与-kl-52026-10-14)；预演 8 未授权，预算仍 7/7 耗尽。
2026-10-14 codex 复核第四修复轮提交 `1a2b2783…`：0 个 P0、1 个 P1、1 个 P2，不建议进入预演 8 授权评审；两条套件判据误通过经复现成立，修复等负责人裁决，见 [A9-33 §6.28](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#628-第四修复轮的-codex-复核2026-10-14)。
2026-10-14 负责人批准第五修复轮（N1、N2、U-A 加固、闭包级用例；修复送 codex 复审），见 [A9-33 §6.29](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#629-第五修复轮裁决2026-10-14)；预演 8 未授权，预算仍 7/7 耗尽。
2026-10-14 第五修复轮已提交（`c8d9113b…`，仅套件文件）；codex 第 5 轮复核 0 个 P0、2 个 P1、2 个 P2，不建议进入预演 8 授权评审，见 [A9-33 §6.30](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#630-第五修复轮实现与-codex-第-5-轮复核2026-10-14)；待负责人裁决；预演 8 未授权，预算仍 7/7 耗尽。
2026-10-14 负责人批准第六修复轮（R1～R4 与两个覆盖盲点，仅套件文件；修复送 codex 复审），见 [A9-33 §6.31](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#631-第六修复轮裁决2026-10-14)；预演 8 未授权，预算仍 7/7 耗尽。
2026-10-14 第六修复轮已提交（`1a2bd02f…`，仅套件文件）；codex 第 6 轮复核 0 个 P0、0 个 P1、1 个 P2，不建议进入预演 8 授权评审，见 [A9-33 §6.32](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#632-第六修复轮实现与-codex-第-6-轮复核2026-10-14)；待负责人裁决；预演 8 未授权，预算仍 7/7 耗尽。
2026-10-14 负责人对第七修复轮选 B：不修，登记 KL-6（N1 与三个存活变异），进入预演 8 授权评审，见 [A9-33 §6.33](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#633-第七修复轮裁决-b-与-kl-62026-10-14)；文档提交未获授权；预演 8 未授权，预算仍 7/7 耗尽。
2026-10-14 负责人批准放宽到第 8 次预演（最后一次）、提交文档并构建预演 8 包，见 [A9-33 §6.34](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#634-预演-8-放宽文档提交与构建授权2026-10-14)；预演 8 授权文件未批准，Win7 动作 `NOT_PERFORMED`；请求 31/64。
2026-10-14 预演 8 已在 Win7 跑完（运行 `ea67b2c0`）：p01～p09 PASS，p10 秘密扫描 FAIL（14 处命中全是误报，正则无左边界），断言 41/42，见 [A9-33 §6.35](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#635-预演-8-执行记录与-p10-失败分类2026-10-14)；预演预算 8/8 耗尽，请求 41/64；待负责人裁决。
2026-10-14 负责人批准扫描器修复轮（送 codex 复审）、放宽到第 9 次预演（最后一次）并提交文档，见 [A9-33 §6.36](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#636-扫描器修复轮与第-9-次预演裁决2026-10-14)；预演 9 包未构建，授权文件未批准，Win7 动作 `NOT_PERFORMED`；请求 41/64。
2026-10-14 扫描器修复 `15b93e3b…` 已提交；codex 第 7 轮复核 0 个 P0、1 个 P1（JSON 转义与 `%20` 之后的密钥漏检，p10 会误通过）、1 个 P2，不建议进预演 9 授权评审，见 [A9-33 §6.37](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#637-扫描器修复轮的-codex-复核第-7-轮2026-10-14)；待负责人裁决；预演 9 包未构建，授权文件未批准。
2026-10-14 负责人批准第二个扫描器修复轮（含停止规则）；修复 `d6d11fb5…` 已提交（转义之后的密钥重新命中，45 变异全拦，回放预演 8 证据 0 命中），待 codex 第 8 轮复核，见 [A9-33 §6.38](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#638-第二个扫描器修复轮2026-10-14)；预演 9 包未构建，授权文件未批准。
2026-10-14 codex 第 8 轮复核 `d6d11fb5…`：0 个 P0、1 个 P1（序列化叠加使 p10 误通过）、2 个 P2；负责人裁决修复与预演均无需审批、预演次数上限取消；第三个扫描器修复 `fc5211fd…` 已提交（逐层还原序列化后判断前驱，65 变异全拦，3900 叠加情形无不符），待 codex 第 9 轮复核，见 [A9-33 §6.39](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#639-codex-第-8-轮复核与第三个扫描器修复轮2026-10-14)；登记 KL-7；预演 9 包未构建。
2026-10-14 codex 第 9 轮复核 `fc5211fd…`：0 个 P0、1 个 P1（深层 URL 编码使 p10 误通过）、2 个 P2；第四个扫描器修复 `c869661e…` 已提交（去掉固定窗口，改为紧贴候选的转义段；84 变异全拦，29484 组合情形漏报 0 个），待 codex 第 10 轮复核，见 [A9-33 §6.40](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#640-codex-第-9-轮复核与第四个扫描器修复轮2026-10-14)；KL-7 追加边界 b；预演 9 包未构建。
2026-10-14 codex 第 10 轮复核 `c869661e…`：0 个 P0、0 个 P1、0 个新 P2，N6、N7、N8 已关闭，建议进入预演 9；登记 KL-7 边界 c，不开新的修复轮，见 [A9-33 §6.41](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#641-codex-第-10-轮复核结论与进入预演-92026-10-14)；预演 9 包待构建。
2026-10-14 预演 9（Win7 实机预演，非验收证据）：10 个阶段、25 个用例、42 条断言全部 PASS，p10 通过，第 1 次连续成功；请求 51/64，下一步同一个 ZIP 跑预演 10，见 [A9-33 §6.42](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#642-预演-9-执行记录与分类2026-10-14)。
2026-10-14 预演 10（Win7 实机预演，非验收证据）失败：p01～p06 PASS，p07、p08 因 p06 遗留的 Electron 孤儿进程占用 `driver-electron\electron.exe` 报 `EBUSY`，连续成功计数归零；驱动修复 `14d1f43c…` 已提交（jest 224、`node --test` 120 全过），待 codex 第 11 轮复核；请求 59/64，待裁决请求上限与遗留进程，见 [A9-33 §6.43](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#643-预演-10-失败驱动残留进程与第-5-个驱动修复2026-10-14)。
2026-10-14 codex 第 11 轮复核 `14d1f43c…`：0 个 P0、1 个 P1（清扫把无效进程表当作已清洁）、2 个 P2，不建议进入预演 11；第 6 个驱动修复 `00fd643b…` 已提交（jest 225、`node --test` 120 全过，34 个变异中 33 个被拦、1 个等价），codex 第 12 轮复核进行中，预演 11 包待构建；请求 59/64，待裁决请求上限与遗留进程，见 [A9-33 §6.44](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#644-codex-第-11-轮复核结论与第-6-个驱动修复2026-10-14)。
2026-10-14 codex 第 12 轮复核 `00fd643b…`：0 个 P0、1 个 P1（N1 未关闭：不完整进程表仍被认作干净）、0 个新 P2，不建议进入预演 11；第 7 个驱动修复 `52bcfb88…` 已提交（进程表逐行严格读取；jest 229、`node --test` 120 全过，54 个变异中 53 个被拦、1 个等价），codex 第 13 轮复核进行中，预演 11 包待构建；请求 59/64，待裁决请求上限与遗留进程，见 [A9-33 §6.45](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#645-codex-第-12-轮复核结论与第-7-个驱动修复2026-10-14)。
2026-10-14 codex 第 13 轮复核 `52bcfb88…`：0 个 P0、0 个 P1、1 个新 P2，N1 剩余部分已关闭，建议进入预演 11；登记 KL-8（`CR CR LF` 用例的回归保护缺口），不开新的修复轮，见 [A9-33 §6.46](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#646-codex-第-13-轮复核结论与进入预演-112026-10-14)；预演 11 包待构建，请求 59/64，待裁决请求上限与遗留进程 PID 4736。
2026-10-14 预演 11 的 R1（Win7 实机，只读）：预演 10 遗留的孤儿 PID 4736 在套件进程表里 `ExecutablePath` 为空，现有清扫规则在真实表上选中 0 行，预演 11 暂停；第 8 个驱动修复 `ea597905…` 已提交（命令行查询作为路径为空时的身份来源；jest 235、`node --test` 120 全过，94 个变异中 92 个被拦、2 个等价），codex 第 14 轮复核待启动，预演 11 包待重建；负责人已答复请求上限 64→80 并授权终止 PID 4736（已终止），请求 59/80，见 [A9-33 §6.47](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#647-预演-11-的-r1-发现与第-8-个驱动修复2026-10-14)。
2026-10-14 codex 第 14 轮复核 `ea597905…`：0 个 P0、0 个 P1、1 个新 P2，R1 暴露的具体缺陷在开发机已关闭，建议进入预演 11；登记 KL-9（命令行列表的身份歧义：重复 PID 块、属性形状的换行），不开新的修复轮，见 [A9-33 §6.48](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#648-codex-第-14-轮复核结论与进入预演-112026-10-14)；预演 11 包待重建，请求 59/80。
2026-10-15 预演 11（重建包 `9de34768…`）在 p03-chain 失败：驱动把无关的 `explorer.exe` 当成 helper 的子进程（陈旧 `ParentProcessId` 被 helper 的 PID 重新取得），产品退出行为没有出错；第 9 个驱动修复 `a6c689d5…` 在开发机完成，等待 codex 第 15 轮复核，见 [A9-33 §6.49](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#649-预演-11-的-p03-失败与第-9-个驱动修复2026-10-15)；请求 62/80，连续成功计数 0。
2026-10-15 codex 第 15 轮复核 `a6c689d5…`：0 个 P0、0 个 P1、2 个新 P2，p03 缺陷在开发机已关闭，建议进入预演 12；登记 KL-10（创建时间倒序不能证明与本次运行无关）与 KL-11（套件按裸父 PID 排除“自己人”），不开新的修复轮，见 [A9-33 §6.50](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#650-codex-第-15-轮复核结论与进入预演-122026-10-15)；`taskkill /T` 在陈旧父 PID 上的效果 `UNKNOWN`，待负责人决定是否加固；预演 12 包待重建，请求 62/80。
2026-10-15 预演 12（Win7 实机预演，非验收证据，包 `f7538c20…`，源提交 `63c6d426…`）：10 个阶段、25 个用例、42 条断言全部 PASS，p03 退出断言通过，第 1 次连续成功；本次运行的陈旧父链接排除为 0 条，修复分支在 Win7 实机未被触发；请求 72/80，第 2 次连续成功预演会超出上限 80，开始前向负责人提问，见 [A9-33 §6.51](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#651-预演-12-执行记录与分类2026-10-15)。
2026-10-15 预演 13（Win7 实机预演，非验收证据，同一 ZIP `f7538c20…`，run `67452b1e…`）：10 个阶段、25 个用例、42 条断言全部 PASS，第 2 次连续成功；负责人裁决请求上限提到 92、不加固 `killTree`；开发机再做 2 次产品构建，ZIP 与预演 ZIP 逐字节相同；请求 82/92；冻结、关口 A、推送、ADR-0155、A9-32 `DEVELOPER_VERIFIED` 均 `NOT_PERFORMED`，须负责人裁决，见 [A9-33 §6.52](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#652-预演-13两次连续成功与双构建比对2026-10-15)。
2026-10-15 候选 WIN7-43 以源提交 `63c6d426…` 冻结（负责人回答“A”），ZIP `f7538c20…`，两个独立干净工作树各构建 1 次且字节相同；固定正式 run-id `7af65f2d…`，授权草案 `0171aeea…`，交接书状态 `AWAITING_OWNER_GATE_A`；关口 A、正式 Win7 执行、独立复核与关口 B 均 `NOT_PERFORMED`；预演时间窗 2026-10-16T06:59:59Z 结束，是否覆盖正式运行 `UNKNOWN`，见 [A9-33 §6.53](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#653-候选-win7-43-冻结与关口-a-材料2026-10-15)。
2026-10-15 关口 A 已由负责人签发（授权文件 `dc5b1608…`，回执 02:01:45Z）；WIN7-43 正式运行在 Win7 实机完成：10 个阶段、25 个用例、42 条断言全部 PASS，取回 245 个文件 0 个不一致，终态零残留；独立复核（codex）与关口 B `NOT_PERFORMED`，结论上限仍是第二批执行能力 Win7 PASS，不是 Alpha 2，见 [A9-33 §6.54](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#654-关口-a-签发与正式运行2026-10-15)。
2026-10-15 codex 第三阶段复核（正式证据）：0 个 P0、1 个 P1、0 个新增 P2，不建议进入关口 B；P1 为 `B2-BG-03-STOP-RELEASE-EXIT-A01` 的 PASS 未覆盖“ready 失败清理”和“release 结束 ownership”，执行代理独立核对相同；候选已冻结、正式运行已消耗，执行代理不自行修复或重跑，选项（A′ 修复后重走、B 缩小合同）待负责人裁决，关口 B `NOT_PERFORMED`，见 [A9-33 §6.55](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#655-codex-第三阶段复核与-bg-03-缺口2026-10-15)。
2026-10-15 负责人对 `B2-BG-03` 的 P1 选择 A′ 修复后重走：执行代理在 20 个允许路径内修复驱动、夹具和套件（不改产品代码），新候选身份重新预演、冻结、关口 A、正式运行和独立复核；候选 `63c6d426…` 的证据原样保留，不作为 Alpha 2 依据；关口 B `NOT_PERFORMED`，见 [A9-33 §6.56](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#656-负责人裁决选-a-与-bg-03-修复计划2026-10-15)。
2026-10-15 BG-03 修复在开发机落地（Jest 261、node:test 120、verify:quick 通过，未在 Win10 或 Win7 运行）：断言 42 变 43，用例仍 25；新候选编号 WIN7-45（WIN7-44 已在 GAP_DISPOSITION Q1 暂定给 R 类候选）；下一步修复交接书送 codex 复审，随后构建候选、预演、冻结；关口 A、B `NOT_PERFORMED`，见 [A9-33 §6.57](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#657-bg-03-修复在开发机落地与候选号改为-win7-45)。
2026-10-15 BG-03 修复经 48 项变异检验全部被拦、干净克隆复跑通过（开发机，绑定 `fe0cc135…`；Jest 262、node:test 120，未在 Win10 或 Win7 运行），已写成第 16 轮复核交接书送 codex；P0 或 P1 先修再审，通过后重建候选 WIN7-45 并预演；关口 A、B `NOT_PERFORMED`，见 [A9-33 §6.58](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#658-bg-03-修复的变异验证与第-16-轮复核交接2026-10-15)。
2026-10-15 codex 第 16 轮对 `fe0cc135…` 报告 0 个 P0、2 个 P1、3 个 P2，不建议进入预演；执行代理核对属实并在本地提交 `3d152545…` 修复（开发机：Jest 268、node:test 120，70 次变异 69 次被拦、1 次等价变异存活，未在 Win10 或 Win7 运行）；第 17 轮复核未启动，负责人要求停手并交接给 codex；关口 A、B `NOT_PERFORMED`，见 [A9-33 §6.59](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#659-codex-第-16-轮复核与第二轮修复2026-10-15)。
2026-10-15 UTC codex 执行代理接续；第 17 轮独立会话于 05:09:33Z 启动，绑定代码 `3d152545…`，结论尚未形成（开发机）。负责人确认 WIN7-45 沿用 `2026-10-16T06:59:59Z` 截止时间，限定身份的套件终止动作属于 R1～R8。新候选构建、Win7 预演和门 A、B 均 `NOT_PERFORMED`，见 [A9-33 §6.60](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#660-codex-接续第-17-轮启动与负责人补充裁决2026-10-15-utc)。
2026-10-15 UTC 第 17 轮完成：对 `3d152545…` 报告 0 个 P0、1 个 P1、1 个新增 P2，不建议预演。执行代理确认清理前采样丢失后代、创建时间缺失误计消失，已在 3 个白名单路径修复，尚未提交和独立复审（开发机：4 个新增用例旧实现全失败，修复后 Jest 272、包测试 120、`verify:quick` 通过）。WIN7-45 构建与 Win7 运行仍 `NOT_PERFORMED`，见 [A9-33 §6.61](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#661-第-17-轮结论与清理前采样修复2026-10-15-utc)。
2026-10-15 UTC 负责人批准7文件本地提交为 `3d19c4d…`，未推送。第18轮独立复核关闭两项发现，0个P0、0个未关闭P1、0个新增P2，建议重建并预演（开发机），见[A9-33 §6.62](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#662-本地提交与第-18-轮关闭清理发现2026-10-15-utc)。
2026-10-15 UTC WIN7-45预演14绑定 `3d19c4d…`：p01～p04 PASS，p05因驱动新会话超时停止；p06～p10 NOT_PERFORMED，release未运行，连续成功0次（Win7实机预演）。228文件回收哈希一致，当前无相关进程/任务。驱动同范围修复在开发机Jest276、包测试120、verify:quick通过；未提交、未独立复核。累计请求87/92；正式双构建、冻结、门A/B未做，见[A9-33 §6.63](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#663-win7-45-预演-14-首失败与新会话驱动修复2026-10-15-utc)。
2026-10-15 UTC 负责人授权本轮及后续同范围本地提交、不推送；执行代理提交14f2b8f…后，第19轮独立复核0P0/0P1/0新增P2（开发机，报告6abf905a…）。新WIN7-45预演15（ZIP41075834…、run b60538f9…）p01～p04 PASS，p05同类新会话超时，p06～p10 NOT_PERFORMED；228文件完整回收哈希一致、当前相关进程及本次任务0。连续成功0次，累计92/124；上限依既有授权提高，见[A9-33 §6.64～6.65](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#664-持续本地提交授权与第19轮独立复核2026-10-15-utc)。
两轮同类失败后已暂停整批重试并完成受控最小复现；旧用例的自动重绘遗漏了KL-3下目录持续陈旧的情况，实机按钮现场仍UNKNOWN。两个白名单文件修复为每个BG独立探针前复用真实页面重载，保留原按钮、守卫和20秒点击期限。开发机Jest279、包测试120、verify:quick通过，第20轮独立复核和新字节Win7运行尚未进行；正式双构建、冻结、门A/B仍NOT_PERFORMED。
2026-10-15 UTC 第20轮对548ef0a…报告0P0/0P1/0新增P2（开发机，报告85ce12d5…）。WIN7-45预演16（ZIP b2e2d423…、run b9731870…）越过新会话超时，p01～p04 PASS；p05无效cwd路径出现A9_AUDIT_PERSISTENCE_FAILED、缺tool_end和持久化cleanup_required/pid=NULL，BG03-A01 FAIL。原900秒上限触发套件树终止，未放行退出对话框；release及p06～p10 NOT_PERFORMED。234文件回收哈希一致，当前相关进程/任务0，不推断未知句柄生命周期；连续成功0次、累计97/124。已停止下游，产品修复不在A9-33白名单，新的9路径本地合同提案待负责人裁决，见[A9-33 §6.66～6.67](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#666-第20轮关闭与预演16产品路径阻断2026-10-15-utc)。
R-01 修复与 R-03 用例已提交为 `adb9d0f0…`（ADR-0237，[A9-32 §7.6](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#76-r-01-修复与-r-03-补用例2026-10-12)）；开发机 State 88 / Core 221 / Shell 134 PASS，4 个反例均变红。D4 交接包已在 `9dea1384…` 重绑到该提交，r4 清单 SHA-256 `d00d1123…`；独立审核复算 State 88 / Core 221 / Shell 134 PASS；41 个独立反例中 31 个变红、10 个存活，恢复 SHA 全部一致。本次只登记文档，未提交、推送或合并。
F6 与 ENOTDIR 已在独立复核前修复（ADR-0236，[A9-32 §7.4](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#74-f6-与-enotdir-独立复核前修复2026-10-12)）；开发机 State 84 / Core 218 / Shell 133 PASS。修复已提交为 `59a3f650…`，复核对象即该提交；审核交接包已在 `7504832a…` 重绑。
原工作树及旧候选、数据库、首失败不变。


> 本页是当前状态的唯一人类可读入口，只保留当前快照、阻断项与边界。历史报告中的测试数量不自动代表当前基线。
> 2026-09-24 之前的逐条时间线已原文迁移到 [STATUS_LOG.md](STATUS_LOG.md)；新的时间线条目追加到该文件，本页只更新结论。

## Git 与证据基线

| 项目 | 当前值 |
|---|---|
| 远程默认分支 | `main` |
| A4/A5/A6 收口基线 | `793cc4799c81d9dc27d236826a344a39d86137ec`（标签 `baseline/a456-closeout-20260812`） |
| A7 主线整合输入 | main 历史快照 `63ba838` + A7 验收收口 `6ca1a5a` |
| A1～A3 历史结构化证据绑定提交 | `b2019f022f910b2b8df150ad94c3bccdefa1fa7b` |
| 候选快照 | `8b032772e0c632ec990cc6dfa75fbce4d5f2bb1c` |
| 快照标记 | `backup/integrated-snapshot-20260731` |
| 当前主线状态 | `A7_RC_INTEGRATED / RC_PASS`（唯一 RC 仍为 A7）。2026-09-24 经 [PR #8](https://github.com/allin2/win7-coding-Agent/pull/8)（合并提交 `8fd9d5d`）并入 `codex/a9-alpha2` 至 `f348761`：A9-15（WIN7-23～28）、A9-16 UI 子集（WIN7-29～36）与 A9-17 启动/内存代码；均非 RC、非完整 Alpha 2。此后的文档治理提交（`17761ab`～`2aeb672`）已由 [PR #9](https://github.com/allin2/win7-coding-Agent/pull/9)（合并提交 `ea24c0d`）并入 main；2026-09-30，A9-20～29 的已批准实现及 WIN7-39/41/42 证据按负责人授权快进整合至本地 main（实现整合节点 `829ad39`，后续文档收尾同样并入），未推送；A9 仍非完整 Alpha 2/RC |
| 唯一 RC 工件 | 源码提交 `963eabe`；ZIP SHA-256 `39eecb6a…040c9`；A7 状态提交 `6ca1a5a` |
| A8 产品体验授权 | 需求合同 v1 已由负责人确认；`0.2.0-alpha.1` / `codex/a8-agent-first-product`；外部三层验证均 `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE` |
| A8 当前阶段 | `A8-06 / A8_DEVELOPER_COMPLETE_VALIDATION_READY`；文本附件/Goal 应用内对话框候选已从远端可达干净源码双构建并通过开发机 smoke，等待同一候选的 Win10/Win7 验收 |
| A9 Trusted Agent Runtime | WIN7-19 历史里程碑保留；WIN7-20/WIN7-21 永久为 `FIX_BEFORE_ALPHA`；WIN7-22 已取得 A9_14_WIN7_22_GO_FOR_ALPHA；A9-15 WIN7-28 已取得 UI 集成 PASS；A9-16 WIN7-29 为构建缺陷、WIN7-30 为实机 G2 失败、WIN7-31 为实机 G3 容量失败、WIN7-32 为实机 G3 首绘失败、WIN7-33 为实机 G2 驱动加载顺序失败；WIN7-34 已取得 UI 子集集成 PASS；WIN7-35 保持实机 G3 容量 FAIL；WIN7-36 在已批准的可达响应式状态等效裁决下取得 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`；A9-19 WIN7-37 在同一等效口径下取得 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`；≤799px 分支仍不可达/未验证（均非 RC、非完整 Alpha 2） |

`latest-validation.json` 是证据采集时的不可变快照，其 `head_commit` 必须是当前主线的
祖先，但不应在每次文档提交后伪造重绑。当前代码 HEAD 以 Git 历史为准；表中哈希只表示
已归档的结构化证据生成点。

2026-10-01 发布状态只读核对：远端和本地 main 为 `c14a96808d048c34f6079cc378ba12b4f60f5c62`，
WIN7-42 [预发布版](https://github.com/allin2/win7-coding-Agent/releases/tag/v0.3.0-alpha.1-win7-42)已发布；
tag 指向冻结源 `94385a8`，ZIP 摘要 `3b6e0b72…a01cf`。当前工作区仍为 alpha2 `a53c9b9`，
上表与下方收尾段中的“未推送”保留为发布前动作记录，本次未执行 push。本次只追加文档，不重签实机结论。

## 当前工作项一览（更新至 2026-10-02）

| 工作项 | 当前结论 | 权威依据 | 下一步 / 阻断 |
|---|---|---|---|
| A7 Win7 v1 RC | `RC_PASS`，已整合进 main | [RC_01](tasks/RC_01_WIN7_RELEASE_CANDIDATE.md)、[流水](STATUS_LOG.md#a7-win7-rc-01rc-10-正式验收2026-08-20) | 后续边界见下文“RC PASS 后续边界” |
| A8 Agent-first | `A8_DEVELOPER_COMPLETE_VALIDATION_READY` | [A8 任务书](tasks/A8_AGENT_FIRST_PRODUCT_EXPERIENCE.md) | 同一候选的 Win10/Win7 验收 `NOT_PERFORMED` |
| A9 Alpha 1 | WIN7-22 `A9_14_WIN7_22_GO_FOR_ALPHA`（`0.3.0-alpha.1` 内部 Alpha，非 RC）；WIN7-20/21 永久 `FIX_BEFORE_ALPHA` | [A9 任务书](tasks/A9_TRUSTED_AGENT_RUNTIME.md)、[A9-14](tasks/A9_14_D013_CMD_VERBATIM_AND_WIN7_22.md) | Review 按 ADR-0096 延期到 Alpha 2，入口 fail-closed |
| A9-15 UI 进度反馈 | WIN7-28 UI 集成 PASS | [A9-15](tasks/A9_15_UI_PROGRESS_FEEDBACK.md)、[收口报告](reports/2026-09/a9_win7_28_ui_integration_closeout_2026-09-11.md) | — |
| A9-16 Alpha 2 UI 子集（U01–U07） | WIN7-36 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`（可达响应式状态等效裁决）；WIN7-29～33、35 保持各自失败结论 | [A9-16](tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md)、[WIN7-36 收口](reports/2026-09/a9_16_win7_36_ui_subset_acceptance_2026-09-24.md)、ADR-0131/0133 | Review（R01–R05）与 Shell 运行中输出（S01–S06）暂缓；≤799px 分支 `PRODUCT_UNREACHABLE / NOT_VERIFIED` |
| A9-17 启动与内存优化 | `A9_17_IMPLEMENTATION_AUTHORIZED`，开发机实现与 A/B 完成 | [A9-17](tasks/A9_17_STARTUP_MEMORY_OPTIMIZATION.md) | Win7/Win10 实机采样 `NOT_PERFORMED`；未并入任何产品候选；预算 #3 口径已按 ADR-0139 修订（A9-21 M0），采样可以开始，须绑定脚本 SHA-256 `198bdac3…0b6` |
| A9-18 运行时端到端内存优化（非主线） | 工作树与分支已于 2026-09-26 删除（最后 HEAD `7d06789`，未提交内容按 ADR-0138 放弃）；有效部分已由 A9-21 在主线重新实现 | [承接台账](plans/A9_17_A9_18_CARRYOVER_LEDGER.md) | 评估完成（台账 §7）：启动定向恢复、输出上限、checkpoint 分页、渲染端集合上限由 [A9-21](tasks/A9_21_A9_18_SALVAGE_PORT.md) 移植（`A9_21_DEVELOPER_VERIFIED`，§5 第 5、6 项已关闭），schema 迁移等不移植；Git 分类器部分由 A9-20 承接 |
| A9-19 运行过程实时可见与布局二期 | WIN7-37 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`（可达响应式状态等效口径；源码 `dd6cb1a`，ZIP `4d700632…f167cf`） | [A9-19](tasks/A9_19_LIVE_PROGRESS_AND_WORKBENCH_LAYOUT.md)、ADR-0135/0136、[WIN7-37 收口](reports/2026-09/a9_19_win7_37_live_progress_acceptance_2026-09-25.md) | ≤799px 分支 `PRODUCT_UNREACHABLE / NOT_VERIFIED`；残留：checkpoint 往返约 0.4 s、左栏“进行中”分组滞后 0.6～2.3 s；Shell 增量输出不在本候选 |
| A9-20 Git 确认分类器绕过 | `A9_20_WIN7_39_PASS`（开发机修复 ADR-0137/0140；2026-09-27 WIN7-39 实机 19 种形态全部确认并拒绝零执行）。**已知缺陷**：开发机在 `c8691e3` 复现 `cmd /c"git push …"`、PowerShell 参数前缀、`powershell "git push …"`、`bash -c` 等形态被判为无 Git 而不触发外部写确认；WIN7-22、WIN7-37 等候选同源 | [A9-20](tasks/A9_20_GIT_CONFIRMATION_CLASSIFIER_HARDENING.md)、ADR-0137 | Win7 结论由 WIN7-39（[A9-23](tasks/A9_23_WIN7_39_REISSUE_AND_ACCEPTANCE.md)）取得；WIN7-22/WIN7-37 已签结论不改判，仅登记已知缺陷 |
| A9-21 A9-18 有效成果移植 | `A9_21_DEVELOPER_VERIFIED`（2026-09-27 负责人接受 §5 第 5 项“未复现、原因未定位”；§5 第 6 项由 WIN7-39 实机完成） | [A9-21 §8](tasks/A9_21_A9_18_SALVAGE_PORT.md) | 遗留：`deniedPermissions` 无上限、`listConversationFacts` 随 checkpoint 总数增长；gateway 偶发失败未定位，再现时另查 |
| A9-22 WIN7-38 换发与实机验收 | `A9_22_WIN7_38_VALIDATION_KIT_DEFECT_NOT_PASS`（2026-09-26 实机 G2 失败：候选内 smoke 未传产品入口，产品未运行；非产品缺陷结论；ADR-0142） | [A9-22](tasks/A9_22_WIN7_38_REISSUE_AND_ACCEPTANCE.md)、[审查报告](reports/2026-09/a9_22_win7_38_acceptance_review_2026-09-26.md) | 已关闭；候选与证据保留，不得复用改判 |
| A9-23 WIN7-39 换发与实机验收 | `A9_23_WIN7_39_A9_20_A9_21_PASS`（2026-09-27 门 B；源码 `7ec9db7`，ZIP `6bf586e7…d9e5`，run-id `b0ebcf98`；15 项，已知限制随结论记录）。**产品侧观察**（2026-09-27 记录，待定是否另立任务）：会话中选择或切换到已有历史的工作区后，过程记录不加载，需切换对话或完成一轮后才显示 | [A9-23](tasks/A9_23_WIN7_39_REISSUE_AND_ACCEPTANCE.md)、[审核报告](reports/2026-09/a9_23_win7_39_acceptance_review_2026-09-27.md) | 已关闭；限制：POSIX 可执行性与 PowerShell `/Command` 真实执行未测、真实 Provider 未覆盖、W39-06 Stop 后 PID 以运行结束时不存在为准 |
| A9-24/A9-25 改动审阅与 WIN7-41 | `A9_25_WIN7_41_A9_24_PASS`（2026-09-29 门 B；源码 `0f8af24`，ZIP `66a4b3e4…93b0`，run-id `318e27e4`；22 项，已知限制随结论记录） | [A9-24](tasks/A9_24_REVIEW_MODE.md)、[A9-25](tasks/A9_25_WIN7_40_REISSUE_AND_ACCEPTANCE.md)、[审核报告](reports/2026-09/a9_25_win7_41_acceptance_review_2026-09-29.md) | 已关闭；限制：真实 Provider 未覆盖、POSIX/`/Command` 真实执行未测、≤799px 不可达 |
| A9-26 第一批：可靠性（含 A9-28/A9-29 修复） | `A9_27_WIN7_42_A9_26_PASS`（2026-09-30 门 B 收尾；负责人回复“接受”；源 `94385a8`，ZIP `3b6e0b72…a01cf`，run-id `92d693e0`；正式 30 项/25 阶段、补充真实 Windows Git R0-01～04 全通过） | [A9-26](tasks/A9_26_RELIABILITY_BATCH_1.md)、[A9-27](tasks/A9_27_WIN7_42_REISSUE_AND_ACCEPTANCE.md)、[执行报告及裁决](reports/2026-09/a9_27_win7_42_execution_and_premerge_2026-09-30.md) | 验证已关闭，已按授权合入本地 main（实现整合节点 `829ad39`）；真实 Provider、POSIX/`/Command`、≤799px 与 `git clean -fdx` 边界保留，非完整 Alpha 2/RC |
| A9-30～32 第二批执行能力 | A9-30 DEVELOPER_VERIFIED保持；A9-31源8d207ab（2026-10-06 Shell Policy P1修复提交，父ebda911）；既有Win10证据绑定ebda911/r3包；r4包（`e96fdf96…`）新根R2（ADR-0186/0187）**Win10单根通过**：10请求全部首次正式评审PASS，含StopExit/ReleaseExit/Recovery，conhost证明真实触发（[报告§15](reports/2026-10/a9_31_r5_manifest_proof_handoff_2026-10-05.md)）；R4–R8入口HALTED、R9 Recovery PASS；旧包整批Win10曾为跨根组合通过（ADR-0180） | [A9-31](tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)、[统一报告§15](reports/2026-10/a9_31_r5_manifest_proof_handoff_2026-10-05.md)、[登记材料](plans/A9_31_DEVELOPER_VERIFIED_REGISTRATION.md)、[跨根裁决](plans/A9_31_WIN10_BATCH_CROSS_ROOT_RULING.md)、[A9-34草案（推迟）](tasks/A9_34_RECOVERED_CLEANUP_DISPOSITION.md) | A9-31 **DEVELOPER_VERIFIED**（ADR-0188，Codex R2证据复核0/0/0；限制G3/G4/Policy边界/conhost窄范围）。当前源Win10结论为R2 `WIN10_SINGLE_ROOT_PASS`（取代旧ebda911包的跨根组合，ADR-0180记录保留）。限制：Esc/取消未实测、Recovery仅保留未知语义（A9-34推迟到第二批之后，A9-33须列已知限制）、Policy识别边界、conhost仅cmd父分支真实触发。8d207ab未推送；独立验收/Win7未签，未在Win7实机验证。 |
| Phase 1/2、SPIKE、Phase 3–7 | 见 [ROADMAP](ROADMAP.md) 与 [任务索引](tasks/README.md) | 各任务书 | 正式 Phase Gate 未整体关闭 |

完整 Alpha 2、Shell streaming 与新的 RC 均未获任何 PASS 结论；A9-24 改动审阅的 Win7 结论来自 WIN7-41（`0.3.0-alpha.1` 能力集标识，非完整 Alpha 2）。

第二批文档准备与检查见[本次报告](reports/2026-10/a9_batch2_design_preparation_2026-10-01.md)，
候选/Alpha 2 收口需求见[覆盖台账](plans/A9_BATCH_2_ACCEPTANCE_COVERAGE.md)。

## 当前阻断与待办

2026-09-30 冻结前复核复现 A9-26 两项合同遗漏（失败大输出仍 verified、不可压缩前缀突破预算），随后在开发机内存整合入口复现两项继承安全阻断（SQLite 必需审计失败后仍编辑、未正常结束的 Provider 工具流仍执行）。参见[复核报告](reports/2026-09/a9_27_premerge_contract_review_2026-09-30.md)。负责人已批准 [A9-28](tasks/A9_28_RELIABILITY_CONTRACT_GAPS.md) 与 [A9-29](tasks/A9_29_AUDIT_AND_PROVIDER_COMPLETENESS.md)，两项任务均已在独立工作树修复、通过开发机检查和独立复核，整合于 `186e850`（[记录](reports/2026-09/a9_28_a9_29_developer_closeout_2026-09-30.md)），W42 扩为 30 项。A9-27 首轮两次预演 FAIL 后仅修套件；返工源 `94385a8` 连续两次 Win7 预演全部通过，双独立干净构建逐字节一致，WIN7-42 已冻结（ZIP `3b6e0b72…a01cf`）。[正式交接书](plans/A9_27_WIN7_42_ACCEPTANCE_HANDOFF.md)门 A 已由负责人签发，角色已确认；[预演记录](reports/2026-09/a9_27_w42_rehearsal_repair_2026-09-30.md)。正式 Win7 已执行（30 项 / 25 阶段，退出码 0），报告已由 Win7 agent 复核（30 项 / 退出码 0）；原始 774+19 文件哈希一致、零残留、最终 916 文件扫描零真实秘密。[执行与合并前检查材料](reports/2026-09/a9_27_win7_42_execution_and_premerge_2026-09-30.md)已形成，负责人在三项偏差解读及接受建议后回复“接受”，门 B 收尾记为 `A9_27_WIN7_42_A9_26_PASS`；收尾补齐 Windows Git R0-01～04，182 个补充文件哈希闭合，1,161 文件扫描零真实秘密。已在独立干净 main 工作树快进整合至 `829ad39`，后续文档收尾同样并入；原工作区修改保留，未推送。

推进顺序见 [A9 Alpha 2 推进顺序](plans/A9_ALPHA2_DELIVERY_SEQUENCE.md)：阶段 0 已完成（W40 套件开发机门通过并入 `762e2d3`；恢复目录误暂存核查已完成，D1 已裁决，修复进第一批，见下文第 6 项（当前候选已关闭））；阶段 1 已完成：WIN7-40 记为 `A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS`（ADR-0145）后换发 WIN7-41（`0f8af24`，ZIP `66a4b3e4…93b0`，run-id `318e27e4`），2026-09-29 门 B 签发 `A9_25_WIN7_41_A9_24_PASS`（22 项，[审核报告](reports/2026-09/a9_25_win7_41_acceptance_review_2026-09-29.md)）。阶段 2 第一批（A9-26）及阶段 3 WIN7-42 已关闭（[A9-27](tasks/A9_27_WIN7_42_REISSUE_AND_ACCEPTANCE.md)，正式验证、报告复核与门 B 收尾完成）；第二批设计及 A9-30～32 任务已形成；2026-10-01 负责人批准 A9-30 和 ADR-0150，helper v3 的 Shell 实时输出合同作为实现依据。A9-31/A9-32 与后台 release 扩展仍待各自批准，A9-30 独立原生套件/返回复核、构建授权及重锁已完成；真实产品检查仍为子集，开发机门未签发。A9-31/A9-32 的独立安全/依赖与原生扩展构建批准保持各自待办。

1. **Alpha 2 剩余范围**：2026-09-27 负责人决定拆为两个任务、先做 Review：负责人批准把 Review 改为“先写后审”的改动审阅（ADR-0143），[A9-24](tasks/A9_24_REVIEW_MODE.md) 开发机通过并已并入（`A9_24_DEVELOPER_VERIFIED`，`c136d12`）；Win7 由 [A9-25](tasks/A9_25_WIN7_40_REISSUE_AND_ACCEPTANCE.md) 换发验收：WIN7-40（`64fd3a7`）实机 G1 通过、G2 因套件驱动时序缺陷失败，记为 `A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS`（[审核报告](reports/2026-09/a9_25_win7_40_acceptance_review_2026-09-28.md)、ADR-0145，非产品缺陷）；A9-25 修订后换发 WIN7-41（§9），2026-09-29 门 B 签发 `A9_25_WIN7_41_A9_24_PASS`，A9-24 改动审阅取得 Win7 结论；Shell 运行中输出（S01–S06）另立任务，先写 helper v3 协议设计。Shell 运行中输出仍需新候选完成 Win7 实机验收。
2. **A9-17 实机证据**：执行包已就绪于 `scripts/mvp_acceptance/a9-startup-baseline/**`，Win7/Win10 采样未执行，性能收益不得外推；预算 #3 口径已按 ADR-0139 修订（K17-5 关闭），采样可开始。A9-18 需求与遗留项统一登记在[承接台账](plans/A9_17_A9_18_CARRYOVER_LEDGER.md)，已完成价值评估，有效部分由 A9-21 移植（已批准，ADR-0138/0139），移植后删除工作树。
3. **A8-06 外部验收**：Win10/Win7 三层验证仍 `NOT_PERFORMED`。
4. **A9-20 Git 确认分类器绕过**：WIN7-39 已签发 Win7 结论（[A9-23](tasks/A9_23_WIN7_39_REISSUE_AND_ACCEPTANCE.md)，2026-09-27）；WIN7-22、WIN7-37 等既有候选仍含该缺陷，已签结论不改判。
5. **A9-19 后续**：WIN7-37 已签发 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`。Shell 真正增量输出（helper v3）、checkpoint 往返校验分片、左栏“进行中”分组滞后需各自另立任务。
6. **恢复目录误暂存问题已在当前候选关闭**：A9-26 自忽略修复经 WIN7-42 W42-23、补充真实 Windows Git R0-01～04 及门 B 收尾确认；实际三种暂存均排除恢复目录，clean/stash 保留恢复内容，撤销通过。历史候选不改判，原问题见[核查报告](reports/2026-09/a9_recovery_dir_git_exposure_check_2026-09-27.md)。`git clean -fdx` 会清除忽略目录，此限制继续适用；迁出工作区与恢复目录清理仍另立任务。

## MVP 已接受的延期项

- Electron 可运行入口已经形成 Win7 实证；完整五视图、安装器、跨模块用户任务和卸载/回滚仍是下一阶段产品装配工作。
- SPIKE_01 T03 按 ADR-0055 接受“父侧无 stdin 句柄、无数据进入”的 MVP 语义；正式合同的子侧 `readable=true` 事实保持不变，后续 Core 仍需显式关闭/隔离。
- SPIKE_02 已受限收口：交互 winpty 为 No-Go，低风险非交互 Runner 与 H3 只读日志为 Win7 PASS；C05 网络隔离、任意 Shell、高风险和未知 Profile 仍未开放。SPIKE_04 的本地 SSD Spike 已正式通过；A7 已实现生产 EventLedger 装配并于 2026-08-20 在唯一签名租约下取得完整 Win7 `RC_PASS`。机械盘门禁已由 ADR-0066 取代为正式 SSD Profile。
- 低风险登记 Profile 已在 A7 RC 中经清单装配并完成 Windows/Win7 验收；交互终端、任意 Shell、高风险和未知 Profile 继续 fail-closed。A7 的审计事件事实使用有容量上限的 SQLite EventLedger，session catalog 仍为进程内状态；`RC_PASS` 来自唯一签名租约证据，不得扩大为完整会话恢复或未登记能力通过。
- D-012 官方原 ZIP 含 GCM；本次受控派生包已完成绑定当前 SHA-256 的完整 G10 MVP 矩阵，正式交付仍需 SBOM/许可证闭包；当前远端完整 Git不能替代。
- Phase 1 的 CPython 3.8.10 与 Win7 capability probe 已补齐；Phase 1/2 仍缺架构 Gate 解除、冻结合同要求的获授权物理断网/干净环境证据，Phase 2 也没有独立 Win7 只读 Agent 入口。
- E2 中文+空格路径与 Git 缺失降级已完成客观准备性复测；探针退出码 1 是预期的 `TOOL_NOT_FOUND` 降级信号，不代表正式 E1/E2 Gate 已开放。
- Electron 两次启动均记录 `os_crypt_win.cc ... Access is denied (0x5)`；当前 MVP 不使用凭据存储，故不阻断只读入口。DPAPI 凭据生命周期在正式启用 Gateway 凭据前必须单独实现和验收。

## RC PASS 后续边界

第二批最新推进：2026-10-02已按负责人选择准备三项整批Win7验收合同。
A9-30保持DEVELOPER_VERIFIED；A9-31/32仍待具体批准，A9-33候选合同新建草稿。
[审批包](plans/A9_BATCH_2_IMPLEMENTATION_APPROVAL.md)列出25项本地登记和A9-31/ADR-0151实现请求；
[增量矩阵](plans/A9_BATCH_2_INCREMENTAL_VALIDATION.md)限定继承与直接重测。
未提交、未开始A9-31/32实现、未写远端、未冻结WIN7-43；Win7全部NOT_PERFORMED。
本说明和A9-30收口行是当前入口，前述“开发机门未签发”及后续构建失败等追加段保留其历史时点，不撤销正式收口。

1. A7 状态已进入 main，双层标签与长期归档已完成；这些治理动作没有改变候选字节或实机证据。
2. 交互 winpty、任意 Shell、高风险/未知 Profile、网络隔离声明和未登记在线更新继续关闭；任何开放均需新任务书、依赖评审和独立 Win7 验收。
3. 企业代理/CA/模型/更新服务具备后再执行 E7；视觉、冷重启、物理断网或严格全新 OS 证据不得从本次隔离目录验收外推。
4. 保留候选 ZIP、签名租约、64 项回收证据和稳定归档的哈希绑定；不得重写原始 RC06-v4 FAIL 子报告或 RC0708 原始报告。

ADR-0066 已将机械盘要求替换为本地 SSD 正式 Profile；D-014 构建 Gate 与 SPIKE_04 Win7 验收均已通过，
性能预算 #5～#8 已按正式证据更新。HDD、网络盘与未知介质仍没有性能支持声明。

## 状态使用规则

- 本页只维护当前结论；新的时间线条目追加到 [STATUS_LOG.md](STATUS_LOG.md) 对应工作项下，并同步更新本页“当前工作项一览”。
- 模块窗口不得直接修改本页或 README、ROADMAP、DECISIONS；由整合窗口在验证完成后统一更新。


### A9-30 r5 宿主预检与待提交修正（2026-10-02）

五路径批准源码提交已追加 `27a1de9`，r5 ZIP 闭包独立复核通过；当前 SID1005 Bitvise 连接、普通非提升Medium无Job身份通过。WMI/CIM OS查询拒绝，正式r5双构建未启动。新白名单宿主探测修正采用运行时版本+只读HKLM交叉，实际PS5.1 1正20负通过，控制入口负例及独立增量复核P0/P1/P2=0；新增源码提交待具体批准。两个已批准r5目录仍空；未调整系统/账户/WMI权限，未重锁、装配或登记DEVELOPER_VERIFIED。后续Windows双构建/真实Electron/Win7仍NOT_PERFORMED。详见[宿主预检报告](reports/2026-10/a9_30_r5_win10_host_preflight_2026-10-02.md)。


### A9-30 r6 kit registration (2026-10-02)

Exact four-path source commit: `7feae402edfb30da9adb649841d777ca82cc6e80`. New r6 ZIP SHA-256: `8c0f79bf2f5383be3b59b6542f27e159c00efb23f07eeabdc0a05477462cf406`. Independent kit/control review P0/P1/P2=0; 23 ZIP entries / 13 exact committed native source blobs. Registration commit: `3e2f6f602bf7b6aa0786b7c800c8541eff1198f4`. Exact HEAD registry/report byte binding PASS; no push/merge. The stage script now checks approval before writes; actual PS5.1 syntax and missing-approval negative check must run before staging.

Current 192.168.1.4 SSH/TCP22 connection times out. The pretransfer guard did not succeed: r6 transfer/staging/BuildA/BuildB NOT_PERFORMED. Network cause UNKNOWN; no account/permission/Bitvise/UAC/system policy changes. Resume after readonly network, SID1005 identity, host/tool and fresh build-r5-a/b checks; these existing approved targets remain the only build directories. Returned-evidence review, product relock, actual Electron and Win7 NOT_PERFORMED; DEVELOPER_VERIFIED not signed. See [r6 independent review](reports/2026-10/a9_30_v26_r6_independent_kit_review_2026-10-02.md).

### A9-31 本地实施（2026-10-03）

负责人已批准C1准确25路径登记和C2任务/ADR-0151/68路径/增量合同。
登记提交 `c2b6356f83ef8502a34516010924547c57a3bec2`，实现分支 `codex/a9-31-background-tools`。
后台启动/有界游标读/停止、不可变归属、跨块脱敏与先审计、release意图/回执、退出选择已进入本地实现。
当前仍为 `A9_31_IMPLEMENTATION_IN_PROGRESS`；r3修复已具体批准并本地提交 `d9b5be5`。
新managed r2 ZIP `5172a895…6362c2` 独立复核为 `FAIL_NOT_APPROVED`（P1=1）：
构建smoke缺少真实helper/root/child父子身份和release退出码绑定，暂无对应产品缺陷证据。
[独立报告](reports/2026-10/a9_31_managed_r2_independent_kit_review_2026-10-03.md)和
[精确修复材料](plans/A9_31_MANAGED_IDENTITY_REPAIR_APPROVAL.md)/ADR-0156已获具体批准，六路径身份修复已实施；
[独立补充](reports/2026-10/a9_31_managed_identity_repair_independent_followup_2026-10-03.md)对静态修复P0/P1/P2=0。
最终kit90直接PASS、644项精确继承；实际PS/C#未执行。准确修复源码提交/新kit生成仍待具体批准。
旧r1/r2及失败证据保留；新kit批准/双构建/新锁、真实Electron均未执行。
本地模拟协议及POSIX进程检查不证明Windows Job；Win10/Win7新工件验证均 `NOT_PERFORMED`。
A9-32/33未批准、候选未冻结，不签发第二批Win7 PASS或Alpha2/RC。

### A9-31 managed r3 构建前置补录（2026-10-03）

准确source10114503a1e79706131ea4a11a5b96bd2958807a已按16文件批准提交；
managed r3套件已生成、独立复核P0/P1/P2=0/0/0。
[具体套件登记/Win10双构建范围](plans/A9_31_MANAGED_R3_WIN10_BUILD_APPROVAL.md)已形成待裁决材料。
原生构建、managed新锁、真实Electron及Win7 NOT_PERFORMED，A9-31保持IMPLEMENTATION_IN_PROGRESS。

managed r3具体套件登记及Win10双构建范围已获负责人批准（2026-10-03），按准确24路径追加本地提交。
范围及未执行边界见上述审批包；构建结果仍待实际普通用户执行，不由批准推导PASS。

### A9-31 managed r3实际双构建返回（2026-10-03）

R2普通桌面身份通过，准确source10114503/kit0191f61d与批准HEAD a4ec353绑定；
BuildA/BuildB实际原生返回PASS、run-id独立、helper逐字节一致（2036bf69…51e4b7）。
返回闭包和原始smoke技术检查通过；记录器编号误绑定在原白名单内修复，未提交。
控制器退出码/完整进程树清理UNKNOWN，独立返回复核与managed重锁待办，依ADR-0157暂停下游。
[事实报告](reports/2026-10/a9_31_managed_r3_native_double_build_return_2026-10-03.md)为当前补录入口；
A9-31仍IMPLEMENTATION_IN_PROGRESS、真实Electron/Win7 NOT_PERFORMED，候选及Alpha2/RC不改判。

### A9-31 managed r3独立返回复核（2026-10-03）

[独立报告](reports/2026-10/a9_31_managed_r3_independent_return_review_2026-10-03.md)
PASS_TECHNICAL_RETURN_EVIDENCE / NOT_APPROVED_FOR_INPUT_LOCK，P0/P1/P2=0/1/0。
唯一P1为控制器退出码/完整树UNKNOWN证据缺口；原生输入及双返回无缺陷发现，不重新编译。
ADR-0158 Proposed与[具体登记/重锁材料](plans/A9_31_MANAGED_R3_RETURN_RELOCK_APPROVAL.md)待负责人批准；
当前仍停止重锁/装配，正式registry不改、managed新锁NOT_LOCKED，Electron/Win7 NOT_PERFORMED。


### A9-31 managed r3有限离线重锁批准（2026-10-03）

负责人于 `2026-10-03T07:10:46.920499Z` 登记批准[具体十/五路径包](plans/A9_31_MANAGED_R3_RETURN_RELOCK_APPROVAL.md)及ADR-0158。
准确两个原生返回允许离线重锁；独立P1=1与控制器退出码/完整树UNKNOWN保留，不改历史证据。
正在执行本地登记/锁生成，未签开发机收口；新远端执行、真实Electron和Win7 NOT_PERFORMED。
A9-31仍IMPLEMENTATION_IN_PROGRESS；不推送/整合/发布，候选未分配。


### A9-31 managed r3正式重锁（2026-10-03）

准确十路径登记提交 `dcf541892ec3ee5f5413833206f07efa3f3ee6e2`，正式managed输入锁生成并回读PASS：
SHA-256 `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e`（7905 bytes）。
原生source10114503、双返回/kit和helper2036bf69…51e4b7绑定新登记HEAD；历史输入保持原字节。
[执行记录](plans/A9_31_MANAGED_R3_RETURN_RELOCK_APPROVAL.md)是本轮事实入口。
独立P1=1、controller退出码/完整树UNKNOWN保持，仅按ADR-0158批准两个返回离线准入。
新锁/执行结果只按批准五路径登记；A9-31仍IMPLEMENTATION_IN_PROGRESS，产品装配/真实Electron/Win7 NOT_PERFORMED。
后续需新的产品验证输入/控制器具体合同，不恢复旧控制器，不分配候选，不推送/合并/发布。


### A9-31开发检查包r1与Win10验证准备（2026-10-03）

source35a1925独立开发包本地完整性通过，ZIPaae71bb0…d2f10c0 / manifestdf70fa5b…97e7b9；
784项ZIP/展开树零差异，包内managed runtime描述符/helper/SQLite哈希通过，未运行Windows模块。
Strict SSH已连接Win10，a9builder SID1005/Session3在线，实际profile带主机后缀。
[报告](reports/2026-10/a9_31_product_r1_package_and_win10_preflight_2026-10-03.md)和
[新控制器执行合同](plans/A9_31_PRODUCT_R1_WIN10_VALIDATION_APPROVAL.md)/ADR-0159 Proposed准备好；
C14四测试路径/新远端根具体补充未批，控制器实现/传输/真实Electron/Win7 NOT_PERFORMED。
旧P1=1和controller exit/tree UNKNOWN保留；A9-31尚未DEVELOPER_VERIFIED，当前不提交/推送/整合/发布。


### 2026-10-03 — A9-31新产品r1验证具体批准

负责人批准精确执行合同§1–6及ADR-0159；四个外部测试路径及准确profile新根获批，开始定向实现/检查。
包字节/source35a1925/managed锁保持冻结，普通身份/实际生命周期门仍适用。
本次运行结果尚未取得，Phase-Gate不升级；旧UNKNOWN/P1保留，无提交/整合/发布或Win7动作。


### 2026-10-03 — product r1控制器首失败与R2具体重试待批

Supervisor/controller普通SID1005/Session3/Medium/非提升/noJob门通过。首个Boot在原始字段正则被误拒绝，
r1 HALTED，持有controller及子进程句柄退出1/0，runs=0，产品未派发；首失败字节保留。
四批准源路径内已修复，实际PS5.1三解析、69原始JSON检查及Node32项PASS。
R2新根和独立控制器具体合同待负责人裁决，旧r1不复活，不写远端R2；真实Electron和Win7仍NOT_PERFORMED。
Phase-Gate不升级，无提交、原生重编、账户/ACL改变、推送、整合或发布。


### 2026-10-03 — product r1 R2准确重试获批

负责人批准R2重试合同§1–5；在SID1005实际profile下新R2根部署相同冻结包与四脚本，重新实测普通桌面身份。
R1保持HALTED及原始退出/首失败证据，不复活、不删除；本次最多2小时16固定phase请求。
批准覆盖同四路径必要修复/检查及最终hash冻结，产品/native及旧锁保持；Phase-Gate不升级。
真实Electron/Win7结果尚未取得，无提交/推送/整合/发布、原生重编或账户/ACL修改。


### 2026-10-03 — product r1 R2 Boot 首失败与有限调度提案

R2 监督器/controller/实际Electron均通过普通 SID1005/Session3/Medium/非提升/noJob 门；准确 Boot run `b8e7fb02155f4f72b3b77d787e6c8685` 在外部 driver 的物理 ASAR 校验失败，未进入产品 main/工具。持有 Electron 实例真实 exit1、树结束，普通失败未冒充功能 PASS。
[首失败事实](reports/2026-10/a9_31_product_r1_r2_boot_asar_failure_2026-10-03.md)与九文件原始证据保留；按 ADR-0088 的四路径内 driver 源修复通过 Node 40检查/八完整性用例，冻结 R2 和包不改。
[R3 有限可复用窗口具体合同](plans/A9_31_PRODUCT_R1_R3_REUSABLE_DESKTOP_APPROVAL.md)及 ADR-0160 Proposed 已形成，远端 R3/修复后真实验证 NOT_PERFORMED；A9-31 Gate、旧P1/UNKNOWN、Win7/Alpha2/RC均不升级，无新提交。


### 2026-10-03 — R3有限可复用窗口获批、部署装配通过

负责人批准R3合同§1–6及ADR-0160；四准确源路径内实施完成。Node54项、物理ASAR八正负项、实际PS5.1三解析和210请求/revision/限额/未知树检查通过。
新R3根及17输入已部署，装配复核产品784项/宿主73项及登记通过；首装配参数绑定失败与同准确输入绑定后的成功均保留，冻结三PS不覆盖。
R2已批准stop并取得持有controller/Electron实例真实exit0/1和完整观察树结束，不把首轮Boot失败改为PASS。
[实施证据与准确master/revision哈希](reports/2026-10/a9_31_product_r1_r3_reusable_dispatcher_2026-10-03.md)已登记；Mac锁屏暂停Computer Use，R3尚待普通桌面一次启动，功能/复用实机证明与Win7 NOT_PERFORMED，Gate不升级，无提交/系统权限改变。


### 2026-10-03 — R3普通桌面Boot首失败、HALTED与R4准确材料

R3 dispatcher32184/worker34536/Electron4196均直接通过SID1005/Session3/Medium/普通非提升/noHostJob。Boot run979976d3260e49a7a316bf8c0e604971的实际Electron/Node/SQLite、可见窗口和Renderer隔离三项通过，权限模式未选择时的INPUT_FOCUS失败；夹具前置在原driver路径修正且语法/54检查/784物理闭包PASS，实际复验未执行。
两层捕获报告未绑定观察PID13524，HALTED；原始13文件/截图/数据库及hash已回收，未知退出不因后续PID不存在改判。R3不复活，Shell及余六phase/同窗口重试证明NOT_PERFORMED。
[首失败报告](reports/2026-10/a9_31_product_r1_r3_boot_focus_and_capture_failure_2026-10-03.md)与[R4具体合同](plans/A9_31_PRODUCT_R1_R4_CAPTURE_RETRY_APPROVAL.md)/ADR-0161 Proposed已形成；冻结PS捕获/收尾修复及新R4远端执行待具体批准。A9-31保持IMPLEMENTATION_IN_PROGRESS，Win7/独立收口NOT_PERFORMED，无提交/推送/整合/发布/系统权限改变。


### 2026-10-03 — R4准确批准、捕获修复与部署通过

负责人批准R4合同§1–5及ADR-0161。四外部源完成新捕获/失败收尾/UTF8/参数绑定和焦点前置；Node68、实际PS三解析/210判据和实际12捕获/abort API检查通过，普通产品证据不由Administrator/Session0预检替代。取证模板/编码读取首失败均保留。
R4已CreateNew传输18项，完整784产品/73宿主闭包及登记装配通过；[准确冻结与部署报告](reports/2026-10/a9_31_product_r1_r4_capture_fix_and_deployment_2026-10-03.md)绑定全部hash。UU可见桌面但键盘输入未送入CMD，SSH无R4启动记录，等待一次普通桌面启动；R3不恢复、UNKNOWN不改判。Boot及后续/同窗口复验/Win7 NOT_PERFORMED，A9-31仍IMPLEMENTATION_IN_PROGRESS，无提交/系统改变。


### 2026-10-03 — R4普通桌面已启动、编译器捕获首失败及R5材料

Computer Use通过Windows运行框直接键入并确认焦点后启动R4；dispatcher28448/worker28356/Electron34180均实际通过SID1005/Session3/Medium/普通非提升/noHostJob。Boot run `01e5a8be22e9473fae4da8b1059eb46a` 观察短命csc.exe PID33576（父worker28356）但GetProcessById失败，dispatcher HALTED；固定abort生效，worker/Electron真实exit1、持有树结束，编译器creation/exit仍UNKNOWN。全部15文件/hash与秘密扫描已回收，不以PID消失补签清理，不派发Shell或余六组。
[首失败事实](reports/2026-10/a9_31_product_r1_r4_boot_compiler_capture_failure_2026-10-03.md)及[R5预编译具体合同](plans/A9_31_PRODUCT_R1_R5_CAPTURE_PRECOMPILE_APPROVAL.md)/ADR-0162 Proposed已形成；拟部署前预编译锁定现有C#，worker仅校验加载，保留所有硬门。R5实施/编译/远端写入/重试待准确批准，NOT_PERFORMED。A9-31仍IMPLEMENTATION_IN_PROGRESS，独立收口/Win7未执行，无提交/系统权限改变，历史R3/R4 UNKNOWN不改判。


### 2026-10-03 — R5普通手动实例身份通过，但历史HALTED阻断；R6材料就绪

R5准备预编译、Node68/实际PS三解析/237判据/22实际API文件检查、784产品/73宿主装配已通过；原51文件准备索引和首失败均保留。另轮计划任务PID22728因HostJob失败，原HALTED不改判。
代理给旧指令前未复查该记录；用户普通桌面新PID36076/creation639266265512707074直接通过SID1005/Session3/Medium/非提升/noJob，但旧final仍在，不派发产品。固定stop已发送，持有30秒未退出，exit UNKNOWN；20:20快照仍在且无直接子进程，不代签清理。
[准确事实与五文件hash](reports/2026-10/a9_31_r5_manual_restart_guard_failure_2026-10-03.md)保留旧final SHA39d6b4b…147967及新start/ready分属不同实例。R6新根/入口claim防护/原编译批准来源严格校验具体合同与ADR-0164 Proposed已形成，实施/远端R6 NOT_PERFORMED；A9-31仍IMPLEMENTATION_IN_PROGRESS，产品八phase、独立收口、Win7 NOT_PERFORMED，无提交或系统权限改变。


### 2026-10-03 — R6批准、入口防护实施及271协议检查通过；容量阻断部署

负责人批准R6合同§1–5及ADR-0164；仅原四外部源完成唯一claim/旧final拒绝、实例绑定、原capture编译批准独立校验和新根绑定。Node68、784产品闭包、实际PS5.1三解析/271判据PASS，真实旧R5根被新guard只读拒绝且原final hash不变。ASAR八负例按完整函数字节/调用和原记录hash继承，原DLL/产品/native锁不重建。
[直接记录及边界](reports/2026-10/a9_31_r6_entry_guard_local_checks_capacity_block_2026-10-03.md)：C盘20:31仅1536315392 bytes、20:35仅1589366784 bytes，低于部署门2147483648；R6未创建。真实文件/并发及22项API、完整装配/冻结、新普通窗口/八产品phase NOT_PERFORMED。旧R5 PID36076仍在、固定stop后实际exit UNKNOWN，UU入口不可用；不派发、不清理或迁移目标。A9-31仍IMPLEMENTATION_IN_PROGRESS，Win7/独立收口未执行，无提交或系统改变。

### 2026-10-03 — R6容量恢复、定向检查与冻结部署通过；普通桌面待启动

容量实际恢复至6053187584 bytes后，在批准R6根完成25项实际capture/API/文件用例及22项入口/文件/并发检查。271协议、三PS解析、Node68与784本地闭包绑定相同源；两并发调用只有一个取得claim，旧claim/start/ready/final/stop拒绝且不污染共享记录。首轮准备失败保留，固定实现源未再改。
R6 master9c9812d1…172cf、初始revisionc2fb083d…ea666、checks/registration已准确冻结；21新目标CreateNew传输/哈希/ParseFile与远端784产品/73宿主装配通过，DLL及原build/批准字节不变，产品/native锁未重建。
[直接记录及桌面交接](reports/2026-10/a9_31_r6_frozen_deployment_and_desktop_handoff_2026-10-03.md)：旧R5 PID36076/creation639266265512707074在50秒实际Process持有观察结束仍存活，exit UNKNOWN、零产品request、旧final不变；21:17:39快照仍存活，R6无entry/ready/final、零产品request。UU无法连接服务器，已请用户普通桌面正常关闭旧R5并启动新R6一次；旧控制器不能派发及新SID1005普通身份未证实前不创建产品请求。八产品phase/同窗口重试/独立收口/Win7 NOT_PERFORMED，A9-31仍IMPLEMENTATION_IN_PROGRESS；无提交、账户/权限/系统变更。


### 2026-10-03 — Computer Use取得旧命令红字，R6普通身份通过但Boot生命周期硬停止

Computer Use退出UU本机被控详情后进入准确Win10桌面，读取旧R5命令导致既有dispatcher-final的IOException；随后键入准确R6入口。dispatcher PID113716/creation639266316299998155通过SID1005/Session3/Medium8192/普通非提升/noJob门，旧R5当前不存在而历史退出码仍UNKNOWN。
唯一Boot run `42a85eb4c6644abe8f3f892d7f7a9239`通过四项基础检查后出现Renderer执行失败；只读冻结表达式复现权限选择脚本引号转义SyntaxError，属于夹具缺陷。独立的cmd.exe PID48664（父Electron84472）在取得句柄前退出，dispatcher报LIFECYCLE_OBSERVED_CHILD_NOT_PINNED并HALTED。七个已持有实例实际退出0不能覆盖未持有cmd的creation/exit UNKNOWN。
[准确首失败与回收报告](reports/2026-10/a9_31_r6_cua_errors_and_boot_capture_failure_2026-10-03.md)绑定53文件/6162158 bytes，逐文件hash一致；R6不恢复、不派发后续七phase，不改冻结捕获。后续根及捕获修复须按R6合同§4另立准确合同。A9-31仍IMPLEMENTATION_IN_PROGRESS，独立收口/Win7 NOT_PERFORMED；无提交、产品/native/锁或系统配置改变。


### 2026-10-03 — R6夹具本地修复73项通过；R7查询句柄准确材料待确认

负责人“批准批准”后，在原精确外部driver路径修复Full Access表达式序列化，Node语法/73判据（原68加5个真实序列化/DOM作用/缺失元素负例）通过；19完整字面Renderer参数解析通过，动态参数仍须真实Electron。R6冻结四源及首失败不变，检查器首轮环境/分类失败保留，没有安装依赖。
[R7具体合同](plans/A9_31_PRODUCT_R1_R7_QUERY_HANDLE_CAPTURE_APPROVAL.md)及ADR-0165 Proposed已形成：拟新增第五C#源和最小权限非继承查询句柄/API、准确R7根内准备编译及普通有限桌面窗口。新路径/API/编译/远端写入须确认本合同；这些新增动作NOT_PERFORMED，不把修复方向批准冒充准确范围批准。原产品/native/锁不变，R6 HALTED/UNKNOWN不改判，A9-31保持IMPLEMENTATION_IN_PROGRESS，独立收口/Win7未执行；无提交/系统改变/委派。


### 2026-10-03 — R7定向检查和真实普通身份通过，首轮生命周期硬停止

负责人已批准R7合同§2–5及ADR-0165。五外部源完成查询捕获，Node73/19表达式/784闭包、实际PS5.1三解析、275准入、27查询/API、16文件门和22入口/并发PASS；八项ASAR负例按准确字节继承。三compile及首失败全部保留，最终DLL15f05ce0…3c9d6e7d/source7ec6a125…859ab7b和28新目标冻结，784产品/73宿主装配PASS。
Computer Use直接在A9 Builder CMD启动R7；PID78592/creation639266349360687397通过SID1005/Session3/Medium8192/普通非提升/noJob。唯一Boot run c26f1c3b3e2846a7bc4c432c006ecf35通过五项真实产品基础/Full Access表单检查，但尚未到受控断言即在子PID66612/父66864的CreationSessionImage联合判据失败。worker保留UNKNOWN并HALTED，dispatcher停止；后续实际持有该子实例/exit0不能覆盖首观察未知。
[直接报告](reports/2026-10/a9_31_r7_query_capture_and_snapshot_gate_failure_2026-10-03.md)绑定55文件/6166259 bytes全部hash核验、秘密扫描0命中。首gap缺失比较边界，snapshot调用区间内创建仅为有支持的推断。R7不恢复，正常Boot、同窗口失败后成功复验、后续七组/独立收口/Win7 NOT_PERFORMED。
[R8具体材料](plans/A9_31_PRODUCT_R1_R8_SNAPSHOT_INTERVAL_APPROVAL.md)和ADR-0166仅Proposed：同五路径、新准确根、时间区间和同实例双观察/准确诊断；具体批准前不实施/编译/写R8。A9-31仍IMPLEMENTATION_IN_PROGRESS；主工作区、产品/native/锁及历史证据保持，无提交/系统配置/委派。


### 2026-10-03 — R8精确执行：普通Boot查询缺口硬停止

负责人本轮回复“批准”，批准R8§2–4及ADR-0166。五外部源完成准确快照区间/同实例双观察/schema2诊断，锁定编译PASS；source97154a59…1c59e1c2、DLL9de64e7d…e67094b7。Node73/19表达式/784、实际PS5.1三解析、275准入、27查询/API、19区间、16文件门、22入口/并发PASS；ASAR八负例准确继承。所有探针首失败保留，不声称已制造两个合法句柄之间的PID复用/不同creation或Session。
Computer Use启动真实SID1005/Session3/Medium/非提升/noJob，dispatcher37244/creation639266379938146705。唯一Boot415b73bf23ba4648b0849e18e74c952b七项产品检查通过，受控断言也执行；worker在cmd PID78328/父Electron77368 OpenQueryHandle返回原生87、creation/exit UNKNOWN，HALTED，不能作为可重试普通失败。55文件/6259483 bytes全部hash一致、秘密扫描0。R8不恢复，正常Boot/同窗口成功复验/后续七phase/独立收口/Win7 NOT_PERFORMED。[直接报告](./reports/2026-10/a9_31_r8_interval_capture_and_short_lived_cmd_failure_2026-10-03.md)保留具体比较值及全部证据。
[R9材料](./plans/A9_31_PRODUCT_R1_R9_SYNC_PROBE_RECEIPT_APPROVAL.md)/ADR-0167只为Proposed：准确只读cmd-ver原spawnSync回执的新证明合同，尚未实施/编译/创建R9。当前源码只能支持来源推断，不能把该cmd具体绑定为已知探测。A9-31仍IMPLEMENTATION_IN_PROGRESS；产品/native/锁、主工作区及历史失败/UNKNOWN保留，无提交/系统改变/委派/Win7。

### 2026-10-04 R9 具体批准与执行起点

负责人回复“批准 R9 §2–4及 ADR-0167”，[R9合同](./plans/A9_31_PRODUCT_R1_R9_SYNC_PROBE_RECEIPT_APPROVAL.md)的原文SHA-256 `8a6ee203efe3e2c14d6afd83ba0e2b54a7a68c240985b6a73a0ace5a25d02c5b`，批准记录SHA-256 `070063d745013b43c8d6f80075245b40a8746940deceee982e18739a7a2e9b8d`。仅五个准确外部测试源及新R9范围，开始实现/检查；原R8 HALTED、历史UNKNOWN和产品source35a19250不改判。不提交、不改产品/native/锁或系统、不委派、不执行Win7。


### 2026-10-04 — R9准入、冻结与退出补充登记通过；普通桌面待启动

按具体批准完成五外部源、新source/DLL/MVID及实际锁定Electron/Node同步cmd-ver准入；原pid58684/status0、真实父kernel身份/快照与当前reader重验通过。Node73+88、Renderer19/784、PS三解析/315schema/27查询/19区间/16文件门/22入口/77回执检查PASS；ASAR8精确继承，不改绑旧报告。准入和检查编排首失败保留。
Master6e2131f0…6340266、受控Boot877845b7…9afb70a、正常退出补充revision e6c6394d…22d7501已冻结；40+8登记文件/实际784产品/73宿主hash及登记PASS。release丢回执/取消竞态补充仅准备检查，真实Core/SQLite/UI退出仍待执行。
[准确报告与交接](reports/2026-10/a9_31_r9_sync_receipt_freeze_and_desktop_handoff_2026-10-04.md)：SSH通过、A9 Builder Session3 Active；R9无entry/ready/final、零request。Mac锁屏使Computer Use无法启动，已请求解锁；不以管理员/SSH注入替代普通门。八phase/同窗口复验/独立收口/Win7 NOT_PERFORMED，A9-31仍IMPLEMENTATION_IN_PROGRESS；产品/native/锁/历史证据保留，无提交/系统改变/委派。


### 2026-10-04 — R9普通同窗口复验与Shell通过，编码时间边界硬停止

Computer Use启动R9普通A9 Builder，dispatcher121956/creation639266722749291059实际通过SID1005/Session3/Medium/非提升/noHostJob。受控Boot失败真实树结束后，同一控制器正常Boot8项和Shell22项通过；编码run9801bf8c11424d8bb7bc4746b546e887已54项断言通过，随后PowerShell132888的creation比snapshot返回晚20.6微秒，触发严格边界、worker与dispatcher HALTED。后续同实例退出0不改首gap UNKNOWN；R9不恢复。
[准确报告](reports/2026-10/a9_31_r9_desktop_partial_pass_and_clock_boundary_halt_2026-10-04.md)绑定301原始文件/30382895bytes，全部hash一致、秘密扫描0；后飞行784产品/73宿主/四输入仍锁定字节，已记录PID当前均不存在，顶层exit仍UNKNOWN。Background/FailureBoundaries/StopExit/ReleaseExit/Recovery及独立收口/Win7 NOT_PERFORMED，A9-31保持IMPLEMENTATION_IN_PROGRESS。
[R10精确UTC合同](plans/A9_31_PRODUCT_R1_R10_PRECISE_UTC_CAPTURE_APPROVAL.md)/ADR-0168 Proposed已形成；仅拟同五外部源、新Win10-only精确取时API和准确新根，不弱化时间/实例门。未批准前不实施/编译/写R10。无提交/产品/native/锁/系统改变或委派，全部历史失败保留。


### 2026-10-04 R10具体批准

负责人回复“批准”，批准[R10合同§2–4](plans/A9_31_PRODUCT_R1_R10_PRECISE_UTC_CAPTURE_APPROVAL.md)及ADR-0168。原合同SHA-256 `c388ae5ea1fc3eb73cb28f4de371f8d76db0243a0986d6cce31b9cd38c1da8d3`，原文批准SHA-256 `ef47799d2506546ec7ccee62026a0d677489b7e6b6e0a2adf0414bac15cd30d6`。仅五外部测试源、精确UTC API/V4测试Profile和准确R10准备/固定编译/准入/冻结/普通有限八组；原严格边界与全部硬门保持，不恢复R9，不改产品/native/锁或系统，不提交/委派/执行Win7。实际证据随后登记。


### 2026-10-04：R10 新捕获冻结就绪，普通桌面待启动

R10 §2–4/ADR-0168 已按负责人具体批准执行；新 capture DLL/MVID/精确 UTC、master 和两个不可变 revision 已冻结，当前准确源的本地/Win10 准入及远端产品784/宿主73闭包通过。原始准备返回163文件/3177366bytes逐文件哈希核对。Computer Use 键入/粘贴未进入CMD；普通控制器尚无启动记录，全部八组仍 NOT_PERFORMED，已交付一次性入口。R9 HALTED、首失败和 UNKNOWN 不改；A9-31不升级 DEVELOPER_VERIFIED，Win7不执行。详见 [R10冻结交接报告](reports/2026-10/a9_31_r10_precise_utc_capture_freeze_and_desktop_handoff_2026-10-04.md)。

### 2026-10-04 — R10真实桌面部分通过，后台必需归属审计失败

[现场及证据矩阵](reports/2026-10/a9_31_r10_partial_pass_and_windows_ownership_failure_2026-10-04.md)：SID1005/Session3/Medium/普通非提升/noJob，正常Boot8、Shell22、编码安全重试70直接PASS。受控Boot及编码首失败保留；后者仅按冻结driver合同增加预算内正例、保留超预算失败对照。
Background run5dee77858e484e51b7380c9bcf9fa701在helper启动前失败；真实DB只有tool_start，无managed事实。包内原方法结合实际Windows origin/fact复现同目录大小写被字符串比较拒绝；错属反例仍拒绝，本地受控复现不冒充Windows新执行。
依R10审计硬门停止后续派发，原stop合同取得dispatcher实际exit0；143树实例退出码均取得，657文件49075360bytes全hash核验、秘密出口0命中，后飞行144旧实例未见存活。raw COMPLETED只表示停止，三phase通过不代表八组通过。
[三路径本地修复材料](plans/A9_31_WINDOWS_WORKSPACE_OWNERSHIP_REPAIR_APPROVAL.md)待具体批准；产品/native/锁未改，无提交/远端新部署/委派。FailureBoundaries/StopExit/ReleaseExit/Recovery和独立收口/Win7均NOT_PERFORMED；A9-31仍IMPLEMENTATION_IN_PROGRESS，未签DEVELOPER_VERIFIED。

### 2026-10-04 — 三路径归属修复及两项同路径共性修复本地通过

负责人明确批准三路径本地修改/规定检查及共性检查。现[本地修复报告](reports/2026-10/a9_31_windows_workspace_ownership_local_repair_2026-10-04.md)登记：修复Windows canonical/display归属误拒绝、旧managed facts路径变体查回缺失，以及共享比较对POSIX大小写的错误放宽。均在原三路径内，其他身份canonical键不机械替换。
原代码反例、Jest平台属性夹具失败、首轮Stop回执/旧sibling dist失败及中断记录保留。最终State82、Shell117、verify:quick七模块build/static通过；规定检查后生成的24个Runner dist副本保全并只恢复原HEAD字节。原生/managed锁未变，无外部写入/提交/委派。
结论仅LOCAL_REPAIR_VERIFIED，源码提交和新包Windows复验待具体交付；旧R10不改判/恢复，独立收口/Win7 NOT_PERFORMED，A9-31不登记DEVELOPER_VERIFIED。


## 2026-10-04：归属修复准确源码提交完成；新开发包待具体批准

负责人批准五路径本地提交，准确source为`898ee9459a9b987840e94ddef336556ea58dd389`，父为`35a19250ed6589f6a7ba35b940a784325970c111`；五blob/SHA、提交路径和35个其余修改字节复核通过。原State82/Shell117/verify:quick所测源码与提交一致，没有重复产品检查或改绑旧Windows报告。
[提交记录](plans/A9_31_WINDOWS_WORKSPACE_REPAIR_SOURCE_COMMIT_APPROVAL.md)与[新包r2本地合同](plans/A9_31_PRODUCT_R2_LOCAL_PACKAGE_APPROVAL.md)可检索。新包装配尚未获批/执行，无推送/合并/远端写入/原生或锁变更；A9-31仍IMPLEMENTATION_IN_PROGRESS，新包Win10、独立收口与Win7均NOT_PERFORMED。

### 2026-10-04 — r2本地装配获批并通过，新Win10合同待批

负责人批准r2§1–3，准确source仍898ee945；全新干净checkout的生产者装配exit0。ZIP d7323ac4…15122c47 / manifest1c5084a4…816b6225，784文件闭包、实际包runtime/Profile/native哈希、State编译修复/JS入口/受控转发及许可证/SBOM通过，详见[本地报告](reports/2026-10/a9_31_product_r2_local_package_2026-10-04.md)。
本包仍A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE，没有authority；A9-31仍IMPLEMENTATION_IN_PROGRESS。新包Win10、独立收口和Win7 NOT_PERFORMED，旧R10不恢复/改绑；历史UNKNOWN及原生有限准入边界保留，无源码提交/远端写入/原生重建/委派。
[新Windows准确合同](plans/A9_31_PRODUCT_R2_WIN10_VALIDATION_APPROVAL.md)仅DRAFT_NOT_APPROVED：四源、新根和固定外部取证准备及普通八phase须具体批准。此前“r2待批/未生成”段落保留为历史。

### 2026-10-04 — r2 Win10获批；准备纠错与新登记通过，普通桌面输入阻塞

负责人批准[r2 Win10合同](plans/A9_31_PRODUCT_R2_WIN10_VALIDATION_APPROVAL.md)原§1–5；四源、新根784产品/73宿主、固定已有C#一次编译、新source绑定DLL及实际PS5.1/Node16准入通过。补充复核发现文件门负例曾读取旧R5批准文件，违反仅新根范围；原输入/结果/复制字节保留，未启动或写入旧控制器。新隔离run改为明确构造无效prior-scope输入，原16项门及判据保持并通过；新17记录checks绑定两个metadata revision，三PS/driver/master/DLL字节未变，目标端冻结校验通过。
[直接报告](reports/2026-10/a9_31_product_r2_win10_preparation_and_desktop_block_2026-10-04.md)与product-r2统一矩阵r2为当前入口。1067文件清单、208文件4811376bytes返回及859产品/宿主/ZIP哈希匹配；原1005文件未变，两个显式junction负例只登记、不跟随。UU远控菜单可用但目标输入无响应，工具坐标/按键/激活错误保留；旧剪贴板命令未执行。新根claim/start/ready/final均无、请求0、普通token未取得、窗口尚未开始；八phase/同窗口失败后复验/独立收口/Win7均NOT_PERFORMED。
普通入口门按合同§4保持，不改用管理员/计划任务或恢复R10。A9-31仍IMPLEMENTATION_IN_PROGRESS；无提交/推送/合并、产品/native/锁改动、系统改变或委派。上方待批记录为此前历史时点。


### 2026-10-04 — r2普通入口允许负责人一次手工协助

负责人随后表示“如果远控输入不行，我可以手工参与。”据此允许在WIN-2JQ66JE4HTQ的A9 Builder普通桌面由负责人打开全新非管理员CMD，一次执行同一冻结r2入口命令；仅替换§4的输入操作者，不变更源/包/master/revision、SID1005/Session3/Medium/非提升/noHostJob、120分钟/16请求及全部安全门。后续固定派发/取证仍由代理完成。旧窗口残留R10文本不执行，旧控制器不恢复；原批准§1–5和历史输入保留。

最近只读检查UTC 2026-10-04T06:30:43.8945785Z仍无claim/start/ready/final、正式请求0，普通token未取得；手工入口待实际启动，八phase、独立收口及Win7均NOT_PERFORMED。入口启动须先用实际进程实例/token核验，再按受控Boot失败→真实整树退出→同dispatcher正常Boot→Background最短链路的顺序推进。证据为product-r2/manual-assistance-owner-steering-r1.json和manual-entry-watch-063043241315.json。


### 2026-10-04 — r2普通入口已执行，完整后台Policy确认FAIL

负责人一次手工普通入口实际核验通过；同dispatcher受控Boot失败/真实树退出后正常Boot8项PASS，Background最短28项PASS。完整后台首错游标夹具误取历史句柄，修正匹配当前handle后通过相关游标/3-4/Stop项，但永久删除确认场景未批准即真实派发Remove-Item。SQLite+包内Policy证明产品缺口，完整Background FAIL；六个下游phase、独立与Win7 NOT_PERFORMED。固定stop取得dispatcher exit0，112个dispatcher树实例/合并116个持有实例退出与后飞行闭合；479新增文件43568598bytes回收核验，原1067文件不变。当前统一矩阵为product-r2/win10-evidence-matrix-r4.json；raw COMPLETED/Background标记只表示停止/最短范围。r2已停止不可恢复，A9-31仍IMPLEMENTATION_IN_PROGRESS。

## A9-31 R8独立复核与本地修复（2026-10-05）

R8开跑前独立复核发现四项缺口，负责人要求的候选外本地修复已完成（ADR-0177；五源`r8-review-repair-r1`），结果为LOCAL_REPAIR_VERIFIED_NOT_DEPLOYED。只读检查28/28、真实entry文件系统9/9、late-journal15/15、点击/冻结工具21/21；R5–R8 5448文件size/SHA保持。具体发现、修复与直接/未执行边界见[复核请求§6](reports/2026-10/a9_31_r8_pre_run_review_request_2026-10-05.md)。

**原R8冻结候选不开跑，不覆盖/重绑/热换driver。** 新driver只在候选外形成，尚未在目标Node16/Electron/PS5.1准入、部署或重新绑定；必须按准确执行合同形成新不可变版本后才能使用。未授权第九根、远端连接或请求；R4–R7 HALTED及历史FAIL/UNKNOWN保留。真实Recovery/conhost缺口、新根跨账户读取、独立/Win7仍NOT_PERFORMED；整批Win10 NOT_PASS，A9-31 IMPLEMENTATION_IN_PROGRESS，DEVELOPER_VERIFIED未签。

实际报告：[r2执行与Policy失败](reports/2026-10/a9_31_product_r2_win10_execution_and_policy_failure_2026-10-04.md)。具体三路径本地修复提案：[Shell删除Policy修复](plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)，DRAFT_NOT_APPROVED；不扩大本轮已执行授权，不改源码/包/native/锁，不提交/推送/委派。

**R8 driver-r1（2026-10-05）：** 负责人批准修订后，已在不变master下新增一个不可变`normal-short` revision `2d38064cb135c87dce3b303152bf227af55515a7ab5771a7e02e98146ca2d5fb`（修复版driver，`BACKGROUND_SHORT_ONLY=true`）。目标运行时准入：Win10 Electron-as-Node 16.17.1五行（`--check`/self-test/sync-receipt/late-journal/restart-evidence）退出码0、schema336项0失败、完整闭包stage PASS；R5–R8 5448文件基线0差异。**R8普通入口尚未启动、无请求发出**；StopExit→ReleaseExit→Recovery统一用该revision、点击流程用`driver-r1/click-phase.py`。仍未验证：真实Recovery重启、新conhost分支活phase放行、Esc/取消后果；整批Win10 NOT_PASS，DEVELOPER_VERIFIED/独立/Win7未签，未在Win7实机验证。详见任务书末尾条目。

**R8执行结果（2026-10-05）：** driver-r1 normal-short revision下StopExit与ReleaseExit各一次PASS（点击耗时3.557秒/3.28秒，response 0/1，均完整取回、评审通过）；Recovery HALTED——重启四项通过，`BACKGROUND_FACTS_ONLY`失败（driver期望`lastProbeStatus==='exited'`，实际`cleanup_required`，`recoveryStatus=exited`），随后failure stop超时，`dispatcher-final`=HALTED，R8入口终止、不可重试。推断（未裁决）：产品有意在重启后保留`cleanupRequired`，driver预期可能与产品设计不一致；须负责人裁决并另建任务书，不得擅自改产品或driver预期。Recovery PASS未取得，整批Win10 NOT_PASS，DEVELOPER_VERIFIED/独立/Win7未签，未在Win7实机验证；详见任务书末尾条目。

**R9执行结果（2026-10-05）：** 按ADR-0179新根只跑Recovery一个请求（request d1a04183…，normal-short revision c75f5734…，无人工点击）：控制器PHASE_PASS_REQUIRES_EVIDENCE_REVIEW、driver PASS（崩溃16项、重启23项，含保留未知/OS层已退出/Stop被拒/切换与正常关闭被阻断四项新断言），隔离测试退出码0，23实例全部已退出；入口随后经负责人批准的`stop.json`正常结束（dispatcher-final COMPLETED），观察器终态核对通过（64事件、零丢失），完整回收87文件、秘密扫描0，`review-phase-r9.py`=DIRECT_CURRENT_SOURCE_PHASE_PASS。该PASS不证明崩溃后产品可正常关闭（A9-34）。整批Win10是否通过待负责人裁决；未在Win7实机验证。

**整批Win10跨根组合（2026-10-05，ADR-0180）：** 负责人裁决A9-34推迟、选B并批准；R5–R7补正式评审10项全部通过（无远端动作，基线0差异），组合结论`WIN10_CROSS_ROOT_COMBINED_PASS_WITH_LIMITS`（`win10-cross-root-combined.json`）。这不是DEVELOPER_VERIFIED、独立验收或Win7结论；未在Win7实机验证。

开发机文档与只读分析，绑定 d8fd760a…（2026-10-12）：[D1 生产者缺口](reports/2026-10/a9_33_producer_gap_analysis_2026-10-12.md)、[D2 批准请求](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#6-a9-33-批准请求包2026-10-12)、[D3 已知限制](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#71-已知限制后续再修2026-10-12)。A9-33 保持 DRAFT_READY_FOR_REVIEW。
[D4 独立审核交接](reports/2026-10/a9_32_independent_review_handoff_2026-10-12.md)、[D5 待裁决](reports/2026-10/a9_32_owner_decisions_2026-10-12.md)；F5 已确认，第 3～6 项已选 A（第 2 项独立审核者待裁决），真实 Electron/Win10/Win7/指定独立审核 NOT_PERFORMED。


## A9-39 诊断型预演 3 材料已备，待审核与负责人逐字确认（2026-10-18 UTC，开发机）

新增总控/绑定/回执模板与测试，开发机235 PASS/0 FAIL；运输及PS模型为SURROGATE，PS2.0和Win7实机NOT_PERFORMED。包SHA bfb0fa10…；新run 233079f8-a28e-457a-b688-f8eaff7e289c，正常SSH6/各1传输、硬SSH8，总硬上限1500秒，窗口≤3000秒且入口至少余1800秒。仅pending/signed:false；未连接目标、未创建生产执行目录，不签Gate/Alpha2/RC，旧HALTED保留。入场四文档修改保留，本次只追加三文档，任务索引、单1与旧材料不改。详见[任务书 §11.8.15](tasks/A9_39_ALPHA2_FINAL_CANDIDATE.md#11815-诊断型预演-3-材料准备2026-10-18-utc开发机)及 outputs/a9-39-diagnostic-3-materials/REPORT_DETAILS.json。


### 2026-10-18 UTC：A9-39 诊断预演3首次D1停止与新run材料

首次尝试run 233079f8-a28e-457a-b688-f8eaff7e289c（包bfb0fa10…）停在D1：DIAGNOSTIC:REMOTE_JSON_LINE，D1/D7的SSH退出0但stdout/stderr均为空；SSH2/上传0/下载0。D1/D7均只读，未派发D2及其后写步骤，目标机本次无写入动作；D7未成功返回，目录/任务/残留读回保持UNKNOWN。证据层级为**Win7 实机（只读探测）+ 开发机**。根因仍是假设：powershell -Command -多行块缺少末尾空行；本轮未在目标机验证。

修复总控统一SSH stdin末尾为恰好一个空行，argv及SFTP封装逻辑不变；外层catch新增经J转义的异常类型/脚本行/消息detail（去控制字符、ASCII可打印、其他替换?、最多300字符），原样保存在步骤JSON及FIRST_FAILURE。D*/R*.ps1字节不变，query-common仅新身份三处机械替换；冻结表更新5个实际改变的工具键。 新run `83866402-d068-4e0f-a575-798be0d89149`，根 `C:\A9-W46\run\83866402`，任务 `A9-W46-DIAG3-83866402`；原df9b9b24/ce5b784f拒绝保留，加入233079f8的run及根拒绝，新根仍要求不存在。新包SHA `ce17846e…`，binding SHA `03d6a02e…`；旧回执归档由主会话完成，与不可变执行副本逐字节一致（SHA4a6d51dd…），材料目录无OWNER_DIAG_RECEIPT.json，只保留新run signed:false占位，不复用旧批准。

开发机Node20.17控制/集成265 PASS/0 FAIL，payload251 PASS/0 FAIL且字节不变；新增carrier30项，对照真实cleanup-r1的4份SSH证据，另1份SFTP按传输类别区分。去golden重放8个变异全RED，Z00为263 PASS/0 FAIL，无超时；行为桩/标量模型及静态合同均SURROGATE，PS2.0/Win7实际修复行为NOT_PERFORMED。材料已备，待审核与负责人重新逐字确认新完整SHA；本轮不连接目标/远端、不生成生产已批准回执、不提交/推送/安装依赖/新增ADR，不创建新run执行目录。完整包钉、模板、旧→新golden表和机械替换清单见 `outputs/a9-39-diagnostic-3-materials/fix1/cont3/REPORT.md`、`report.json`。 详见[任务书 §11.8.16](tasks/A9_39_ALPHA2_FINAL_CANDIDATE.md#11816-诊断型预演-3-首次只读尝试与ssh封装修复2026-10-18-utc)。


### 2026-10-19 UTC：A9-39 诊断3第二次HALTED与recover-1待审核

旧Win7实机run83866402-d068-4e0f-a575-798be0d89149（包ce17846ea143296f10538738488dd049bfb5864f9681d30859c27351b1a48117）于2026-10-19T02:17Z启动。D1约5秒，D2/D2b/D3首次真实通过；console5、ACL回读、payload_exact、task_readback为真，确认前次D1静默来自缺末尾空行。D4等540秒后TASK_WORK_TIMEOUT，rescue_complete/task_deleted为真；D5/D6跳过；D7任务/相关进程/登记残留/登记外实例四项0。SSH5/上传1/下载0，用例结果未下载；旧HALTED、首失败及证据保留。

回收包SHA f9b11c928f8d0b3e0bfb2f9f638b3c37e0c1ca99d537dfc8df3e16fdabe7bd87；binding SHA 64c95d855086938dd5ea01527a377dd14a0ddad32bcf461a73c865be299875ff。准确模板“确认执行诊断预演 3 回收，材料包 SHA f9b11c928f8d0b3e0bfb2f9f638b3c37e0c1ca99d537dfc8df3e16fdabe7bd87”，仅trim首尾后逐字相等；kind=A9_39_DIAGNOSTIC_RECOVERY_APPROVAL。仅signed:false占位，专用生产者为无CLI纯函数。唯一目标为83866402及其根；未来执行证据目录已存在即拒，本轮未创建。 R-probe/scan/inventory/get/postflight各120/480/180/120/120秒，总硬上限1020秒；正常及硬上限同为SSH4/下载1/上传0/救援0。窗口≤3000秒，入口剩余≥1320秒。残留任务/进程即HALTED，零终止、不删payload任务；扫描仅用准确一次性普通agent任务和新work/recover-1隔离区，注册/删除均读回。候选原scanRun/testOnlySecret阳性及phase2控制须检出、真实发现0；秘密阳性/未知零下载。109个准确路径，512文件/16MiB含32KiB预留，Chromium单件≤1MiB；raw精确集合/大小/SHA，分类在raw外。首失败只写一次，失败后仅尝试受硬门约束的只读后飞行，未知不写0。

Node20.17最终177/0，去字节表18变异全KILLED；冻结payload旧run硬编码静态不一致已登记，是否触发等待UNKNOWN。只追加三文档，任务索引、冻结目录和旧证据保留。本轮仅开发机准备，待审核与负责人逐字确认。授权原话“批准选项 A：只在开发机准备回收材料，审核通过前不连接目标机。”未连接目标/远端、未生成生产批准回执、未提交/推送/安装依赖/新增ADR/启动新会话或代理。PS2/.NET/WMI/排他句柄/Scheduler/目标Node16新组合及当前回收实机全部NOT_PERFORMED；本地桩/静态合同SURROGATE，历史来源INHERITED_EVIDENCE。不签门A/门B/Alpha2/RC，不关闭KL-12/K2～K8。 详见[任务书§11.8.17](tasks/A9_39_ALPHA2_FINAL_CANDIDATE.md#11817-诊断型预演-3-第二次尝试与-recover-1-材料2026-10-19-utc)及outputs/a9-39-diagnostic-3-recovery-prep/REPORT.md。


### 2026-10-19 UTC：A9-39 诊断3b第三次材料已备，待审核确认

第二次83866402实机D1/D2/D2b/D3通过，D4 TASK_WORK_TIMEOUT、救援/D7干净，D5/D6跳过且下载0；冻结payload九文件旧233079f8身份与实际XML参数不一致的静态根因已定位，任务真实启动/异常仍UNKNOWN，旧HALTED保留。第三次新run cc290b82-431d-487c-a4eb-f9ef1171183b、根C:\A9-W46\run\cc290b82，包SHA 595e42e3bbafb801f748a2da96c2aeb9bd6e4fb5025029bdc22db4bad3ccbd16，binding SHA 39fbfb8ce25e035329c4e6889f0cd4d01d6816128781bcc33bcde6c664b68dfa；完整身份对照、D4提前退出、救援双字段门后D5/D6/D7、D5固定管理员失败封存与预算已准备。

Node20.17控制/集成296/0、payload251/0；去字节表空变异94/0，12变异KILLED、2等价对照保持94/0。总上限1500秒/入口1800秒，正常SSH6/上传下载各1、硬SSH8仅额外绑定救援；仅signed:false。只在开发机，未连接目标、未生成批准回执、不提交/推送/安装依赖/开会话或代理；PS行为NOT_PERFORMED、本地桩/静态SURROGATE，不签正式Gate/Alpha2/RC。四文档入场改动保留，任务索引及冻结材料/旧证据不变。详见[任务书§11.8.18～19](tasks/A9_39_ALPHA2_FINAL_CANDIDATE.md#11818-诊断预演3第二次事实与payload身份静态根因2026-10-19-utc)和outputs/a9-39-diagnostic-3b-prep/REPORT.md。


### 2026-10-19 UTC：A9-39诊断3b F1～F8追加修订，D4两处待裁决

开发机F1～F8修订完成：参数模式、准确编译器排除、非GPU新鲜缺席UNKNOWN_EXITED、共享读取、40次/25ms有界替换及读取竞态、初始化try/done/ASCII fatal、混合100tick容差，以及原D3内逐件SHA/7份PSParser静态检查。新包 0af442754e1a1a3da7d8bec7947e3591a1e9835e85e92d4653c5141be0c25d6f，binding 9ede3dbe7f7ca32f0c2be42b1a7e39e63e66b8e069c2b2e41f16a8560616d601，run cc290b82不变；仅signed:false，旧595e…不适用本轮新字节。Node20.17控制/集成321/0、payload251/0，F1～F8各6项共48语义变异全检出，空变异18/0；PS/运输模型及静态合同SURROGATE，全部目标PS行为NOT_PERFORMED。

D4保持SHA5566853686dcbdf455f6e43b8d3349ac47a46a5b245a4ab70d31529307f46733：排队/就绪从未运行超过10秒可触发提前退出；done存在但无登记走通用管理员错误，两点仅报告建议、待负责人裁决。运输6/8 SSH+上传下载各1、1500秒总限不变。只追加三文档，README/冻结材料/旧证据不动；未连接目标、未生成生产批准回执、不提交/推送/安装/开会话或代理。任务书§11.8.20及outputs/a9-39-diagnostic-3b-prep/ADDENDUM_REPORT.md、addendum.json为本轮入口；待审核与新完整SHA逐字确认，不签正式Gate/Alpha2/RC。


### 2026-10-19 UTC：A9-39诊断3b G1～G7追加修订二，材料待审核确认

G1～G7开发机修订完成：D4等待553/共同预留105/救援95（任务540+收尾13+救援95，553+95+10=658≤660−2）；PID复用按创建时间区分且含根不放行；Terminate竞态重查、仅创建时间回读、准确登记零线程残留过滤；监督进程优先且证明原降序字节不变；State2排队排除提前退出；零存活短路保留锁/最终检查/任务删除；D5立即缓存Handle。负责人裁决State3保持失败救援、done存在无登记保留通用错误。F1～F8载荷和测试字节不变。

run cc290b82不变；新包SHA ad472dc2f98733164c0d5a999a1e94798cfea5b0cffb5de2910bf160971b57a3，binding SHA cf8d093952358413351925e95e5ba9a91362b64561b08f5614dcb027b41d0830，仅signed:false。Node20.17控制/集成366/0、payload251/0；空变异45/0，38语义变异全检出，0存活/等价/超时。正常SSH6/硬8/上传下载各1、总1500秒不变（1380+120=1500）。本轮只追加三文档，README及冻结材料/旧证据不变；未连接目标、未生成生产批准回执、不提交/推送/安装/开会话或代理。模型/静态SURROGATE、PS/Win7行为NOT_PERFORMED；一次性救援失败不可接手、PT780S整树效果、D5登记前异常残留及目标WMI/权限/时序/读锁限制见DIAG_PACKAGE W12和任务书§11.8.21，不签正式Gate/Alpha2/RC。证据outputs/a9-39-diagnostic-3b-prep/addendum2/ADDENDUM2_REPORT.md及addendum2.json，仍待审核与新完整SHA逐字确认。


### 2026-10-19 UTC：A9-39诊断3b H1～H9追加修订三，材料待审核确认

从ad472dc2…G完成版继续：worker准确登记零线程空字段残留过滤/回读、ack/claim完整性等待、ERROR有界回复、管理员共享读取、D5原1ms实例判据、CommonEnd−10救援循环截止、完整Framework编译器排除及空数组调用点已修订；H9所列语义缺口均补独立断言。监督观察句柄保持到finally，运行cc290b82不变，无新增原因码。新包SHA c1ee0246f0d33ed1e5a3ed1ea31dcb011d4aeb1a85366ed56e278c00e4120e98，binding SHA 4a265f0b3868befb6798ee250ca8474794902c0d5b208ed5e1cd2cb5512b8fe4；仅signed:false，待审核及新完整SHA逐字确认。

Node20.17控制/集成450/0、payload251/0，共701/0；空变异84/0，72语义变异全检出、1等价变异84/0。H9-03首轮存活已保留原记录，补足净化后超300的ASCII输入后最终完整重放检出。运输6/8 SSH+各1传输、1500秒不变；有效救援窗口按min(95, CommonEnd−10−此刻)扣除前置耗时。目标WMI句柄残留、WQL创建时间过滤、Replace/Delete共享与PSParser语义覆盖等UNKNOWN，全部PS2/Win7行为NOT_PERFORMED，模型/静态SURROGATE。只追加三文档，README及冻结材料/旧证据不变；未连接、未生成生产批准回执、不提交/推送/安装/开会话或代理。任务书§11.8.22与outputs/a9-39-diagnostic-3b-prep/addendum3/ADDENDUM3_REPORT.md、addendum3.json为入口；旧HALTED/首失败及正式Gate/Alpha2/RC边界保留。


### 2026-10-19 UTC：A9-39诊断3b I1修订四完成，其他残留窗口仅报告

本单只修Terminate-One两次目标PID查询：空或准确登记残留均ALREADY_ENDED，多实例PID_AMBIGUOUS，正常实例仍走Process-Record/精确匹配/原截止。旧PID_CHANGED_BEFORE_TERMINATE失去唯一出口，原合同/扫描白名单不含该码、无需删除。两种已结束返回在task走相同证明流程，但事件outcome不同，保持原语义。F/G/H及其他运行脚本原字节保留，run cc290b82不变。

新包SHA 6c03e2f6dc02e195a8725fc3f084a598380b44b078697763ed88cf5797e2f354，binding SHA a39609985482d1974b3ccad8937902e9bf4ef920c0b28449649ad6e69f4f889e，仅signed:false。Node20.17控制/集成480/0、载荷251/0，共731/0；空变异30/0，21语义变异全部检出，0等价/存活/超时。审计覆盖3处Process-Record和12处PID查询，发现Snapshot异常后fresh、管理员fresh/回读、D5 scanner残留三类条件P1，按限定只报告、不扩修，待负责人裁决；WMI列出退出残留仍UNKNOWN，PS2/Win7均NOT_PERFORMED，开发机证据SURROGATE。运输6/8 SSH+各1传输、1500秒不变。仅追加三文档，README与冻结材料/旧证据不变；未连接、未生成生产批准回执、不提交/推送/安装/开会话或代理。任务书§11.8.23与outputs/a9-39-diagnostic-3b-prep/addendum4/ADDENDUM4_REPORT.md、addendum4.json为入口；审核及逐字确认仍待办。


- 2026-10-19 UTC：A9-39诊断3b追加五J1～J4完成开发机修订；D5缓存退出码后Close并有界回读、Snapshot新鲜残留UNKNOWN、管理员救援三检查点及worker两轮已登记UNKNOWN跳过已覆盖。控制/集成570/0、载荷251/0，Z00 90/0后75语义合同变异全检出；仅SURROGATE，PS2/Win7 NOT_PERFORMED。审计3处范围外条件P1只报告（task严格UNKNOWN门、Bound-Live的cmd残留、D7未读取scanner登记）；无新原因码/时间或传输常量。包SHA 19baea99e351555fccfd19c9331b09e3bedbea9d975a5f147f6304a2d83fe792，binding 2959d4a47b7cf20043d78b6afd3d79e53bdb67509c1ed579031c29a525b2d7db，仅pending signed:false，待审核/负责人裁决及新SHA逐字确认；未连接目标/提交/推送。任务书§11.8.24，报告outputs/a9-39-diagnostic-3b-prep/addendum5/ADDENDUM5_REPORT.md。


- 2026-10-19 UTC：A9-39诊断3b追加六K1/K2完成。task全部5处快照调用对已登记同创建时间UNKNOWN统一跳过存活（false不写事件、true原事件）；管理员残留按登记身份而非进程名过滤。控制/集成680/0、载荷251/0；Z00 110/0后44去golden变异全检出。A5-O03按裁决保留POST_DOWNLOAD限制；其余同族只报告分类见W07。包SHA 559c723d258391d25ac2ad7e558dc97a7af2275bbd151c929b2d0f27d0d15b4e，binding 28ae28ad7baf7e665ebe9064f5c6289dbf11d81fbb70b64e6fb2a7d75ea9bacb；仅SURROGATE，PS2/Win7 NOT_PERFORMED，WMI残留UNKNOWN。身份/原因/事件/JSON及所有预算不变，仅pending signed:false，待审核与新SHA逐字确认；未连接目标/提交/推送。任务书§11.8.25，报告outputs/a9-39-diagnostic-3b-prep/addendum6/ADDENDUM6_REPORT.md。


- 2026-10-19 UTC：A9-39第三次诊断run cc290b82实机D1～D3返回成功；D4 2.735秒REGISTRY_UNKNOWN，R1无登记无进程、R2任务已删、D7四项0，下载0，早死原因UNKNOWN。候选WIN7-46、原3b包559c723d258391d25ac2ad7e558dc97a7af2275bbd151c929b2d0f27d0d15b4e不变。只读回收包recovery-2在开发机备好：SHA a153425391a7b4ac77a71a119abf92331c91f1c8b4a3872e309db522c366a9a9，binding 7662fc5a73ffe081366c9049c227162bb0958b50a67f892bdbb11e366b3959a1；唯一cc290b82，218活动钉自包含/历史运行，44写点/114允许路径、缺登记记missing。208/0测试，Z00 25/0后28去golden语义变异全检出；SSH4/下载1/上传0/救援0、1020秒不变。只signed:false待签，审核和逐字确认前不连接目标；PS2/目标执行NOT_PERFORMED，静态与桩SURROGATE。3b/recovery-1/旧证据/README字节保留，D4只走查留下一单（已发生TOTAL_LOSS路径见RECOVERY2_D4_NOTES.md），不提交/推送。任务书§11.8.26与outputs/a9-39-diagnostic-3b-prep/recovery2/RECOVERY2_REPORT.md为入口。


- 2026-10-19 UTC：A9-39诊断3b追加七L1已在开发机修复。第三次run cc290b82原包559c723d…实机D4 REGISTRY_UNKNOWN、下载0和HALTED保留；现在done后无登记进入TASK_DONE_WITHOUT_REGISTRY受控失败，Related/准确任务删除/回读均成功才带两项true继续D5/D6/D7；登记损坏/读失败仍闭锁。控制/集成709/0、载荷251/0，Z00 29/0后18去golden变异全检出，载荷不变。新中间包SHA 3f14fa53fc1848cc08efe3d958417111d0c8ea07d6ea702337e356dfcfb9dd40，binding b6ed1709360cb07176da09f8ef1ad4c5e839b0accc226c94ef085f50f04aa79a；cc290b82已用，换run前禁止请求确认或执行。旧已签回执原字节归档attempt-3-receipt（SHA fce216afe31aa6a5bdd3d8091f00d99f580875ead2e0749dbb7169f202a19b46），包内仅pending signed:false。D5/D6无Win7实机执行，Electron-as-Node/PS2句柄/WMI残留/sftp get等12项UNKNOWN；9步控制流审计只报告NARROW_WINDOW/POST_DOWNLOAD。传输6/8 SSH+上传/下载各1、1500秒不变；仅SURROGATE，未连接/提交/推送。recovery-1/2、payload和旧证据/README字节保留，任务书§11.8.27及outputs/a9-39-diagnostic-3b-prep/addendum7/ADDENDUM7_REPORT.md为入口。


- 2026-10-19 UTC：A9-39 §11.8.28，recovery-2实机RECOVERY_COMPLETE取回第三次13文件；runtime后64ms INITIALIZATION_OR_IO_FAILED，六例未执行，具体抛错调用UNKNOWN。M1为任务外层失败补最内层编码及两处可选ASCII detail；M2换run 7fd961d6-1612-4937-868d-4737fd030d07；M3自包含recovery-3已备。3c包SHA 245a99c4c2f2090afc6ca883af009189f047fc3831705789ea6fd0c1dc5b5787；recovery-3包SHA 023303adbc68f32334c9f4679567979953d05ffd35680cf0327904d7d25d5cf0，仅signed:false待签，待审核及各自新完整SHA逐字确认。控制/集成729/0、载荷251/0、回收218/0，共1198项；两套Z00绿后34去golden语义变异全检出。诊断SSH6/8+上传/下载各1、1500秒及回收SSH4/下载1、1020秒不变；D5/D6与新包目标行为UNKNOWN/NOT_PERFORMED，桩/静态合同SURROGATE。79807受保护文件前后哈希一致，三文档只追加、README原SHA保持；本轮未连接/提交/推送，无生产批准回执。报告outputs/a9-39-diagnostic-3b-prep/addendum8/ADDENDUM8_REPORT.md。


### A9-39 追加十：3e令牌诊断与第五次材料（2026-10-19 UTC）

仅开发机备料完成，待审核与负责人逐字确认。WIN7-46旧包245a99c4…、同run 7fd961d6…在14:24Z D1 AGENT_NOT_CONSOLE、15:03Z D1 LOGONUI_PRESENT，15:20Z完整D1～D7后仍HALTED/REHEARSAL_NOT_ELIGIBLE；SSH6/上传1/下载1，取回11+1文件，D4 TASK_DONE_WITHOUT_REGISTRY受控失败、D5/D6/D7小文件失败路径首次走通。task失败TOKEN_QUERY，detail System.Exception:240:TOKEN_QUERY；kind/Win32错误UNKNOWN，六例NOT_PERFORMED。

N1只加TokenInt错误码与token_probe，不改准入；N2新run 74d45a59-7743-431c-bb00-3ddf473f9e92，N4 recovery-4自包含兜底。3e SHA c38d566d8ed6d229b98134d873ba208b5e5248c61dc5b09a6faa3d30fb9c4551；recovery-4 SHA 82d01bab48a093fe9b19a5644c0cae4d514c7749088a9f0b37296301d810e22b。仅signed:false待签。控制/集成769、载荷251、回收225共1245 PASS/0 FAIL；30变异29检出/1等价，Z00先绿，全部本机SURROGATE，新增PS/Win32与完整用例NOT_PERFORMED。运输/时间常量不变，受保护目录和README字节保持；无目标/远端连接、提交/推送/新依赖/代理。任务书§11.8.29与outputs/a9-39-diagnostic-3b-prep/addendum10/ADDENDUM10_REPORT.md、addendum10.json记录完整边界。


### A9-39 追加十一：3f目标地址改为192.168.1.5（2026-10-20 UTC）

仅开发机备料完成，待审核与负责人逐字确认。WIN7-46第五次尝试首次执行（2026-10-20T00:40Z，3e包c38d566d…、run74d45a59…）D1因192.168.1.3 SSH超时停止，D7 Host is down；SSH2/上传0/下载0/救援0，无命令到目标，保持HALTED/REHEARSAL_NOT_ELIGIBLE。旧回执/停止证据由负责人归档后本轮只读；新根/任务不存在仅推断，D1门下次核实。

负责人告知新IP为192.168.1.5，本轮不探测。只改两个包固定HOST/独立字面/文档并重钉，HostKeyAlias192.168.1.11与严格核键/路径、同run、payload全部字节和预算保持。3f SHA d611bd8bc1ca67f6587aa88a10880c5dcd8ca99ae33dd1f76c627ccfb9a3d3b8；recovery-4 SHA 8e01803bb0866c3ae3392850a1cacea2d08135b6114e639ae4849376457a288e。仅signed:false待签；34份诊断冻结副本一致，history不改。控制/集成779、载荷251、回收235共1265 PASS/0 FAIL，Z00先绿、22变异全检出；15组真实总控桩argv旧IP0/新主机15。保护目录/README与文档原前缀保持；新地址及目标行为NOT_PERFORMED，本机SURROGATE。任务书§11.8.30和outputs/a9-39-diagnostic-3b-prep/addendum11/ADDENDUM11_REPORT.md、addendum11.json记录完整SHA/确认句/未知项。无网络探测、提交、推送、依赖或代理。


### A9-39 追加十二：3g令牌查询长度修复与recovery-5（2026-10-20 UTC）

仅开发机备料完成，待审核与负责人逐字确认。WIN7-46旧3f包d611bd8b…、run74d45a59…于01:33Z执行D1～D7，SSH6/上传1/下载1/救援0，取回11+1文件，D7全0；运行仍HALTED/REHEARSAL_NOT_ELIGIBLE。实机token_probe定位kind20传256返回err24/need4，FIRST_FAILURE为TOKEN_QUERY_K20_E24，detail System.Exception:246:TOKEN_QUERY_K20_E24，分类MAIN_PATH_DETERMINISTIC；kind25/18的256均成功，不泛化超长拒绝规则。

N1只把TokenInt/Probe的20/18长度改4（25仍256，分配仍256）并在need/value间加入size；原准入与Self-Job后字节保持。N2新run991f82e2-546e-4365-b854-c8cbe86ccb3f，HOST.5/别名.11/预算不变，拒绝集合增旧74。3g SHA c62e155b83f41af236864764c15c86fd78ed8fe3afab74d845c8448e7a91bd62；recovery-5 SHA 120bb1db45718cd7eddbd8e34c2118b521cd08ab5837751379eb9f1533b4889c；仅signed:false待签。回收新scan RECOVER5、唯一work/recover-5，114允许文件不变，保护recovery-4原字节，测试输出只写addendum12。控制/集成788、载荷251、回收242共1281 PASS/0 FAIL；Z00先绿，28语义变异全检出。本机SURROGATE，新4字节请求/准入后目标行为NOT_PERFORMED。任务书§11.8.31和outputs/a9-39-diagnostic-3b-prep/addendum12/ADDENDUM12_REPORT.md、addendum12.json记录完整SHA/确认句/审计/未知项。无网络探测、提交/推送/依赖或代理，旧证据与README保持。


### A9-39 追加十三：3g实机未登记相关进程停止与recovery-6（2026-10-20 UTC）

3g实机run991f82e2于2026-10-20T02:30Z仍HALTED/REHEARSAL_NOT_ELIGIBLE（WIN7-46）：D1～D3成功，D4/R1行305 NEW_NODE_DURING_CLEANUP，D7行399 TASK_REMAINS；6 SSH+上传1共7次传输，下载0，D5/D6未执行。3g已用完/回执归档，不得重签；recovery-5因全零探测不兼容残留停止使用但保留原字节。recovery-6在开发机备好：精确停止任务0～1、相关进程0～64只列不动、宽松登记+可信基线postflight；扫描秘密/集合/SHA及整批零下载不放宽，71写点/114文件、69事件调用/61名审计。修复轮1 397/0本地合同，Z00 78/0后39去golden/去inverse语义变异全检出；本机SURROGATE，PS2/WMI/计划任务/文件共享/目标回收NOT_PERFORMED。包SHA 66d133c641b6ca913f8dc30585e8c95fa0077e78ab9e65fb6d8c9bc9dfcea7bd、binding afcc8fbac098a433e16eb07e8c6d19ca2812206ed6160206e01f01dba4cde34e；仅signed:false，待审核及新SHA逐字确认，未连接/提交/推送/依赖/新会话或代理。任务书§11.8.32、报告outputs/a9-39-diagnostic-3b-prep/addendum13/ADDENDUM13_REPORT.md为入口；README/3g/旧包/旧证据/受保护目录字节保持。


#### 修复轮 1：F1～F4误停风险修正（开发机）

F1删除TASK_SETTING_SET，完全沿用原D3/D4的声明Setting逐项存在/值相等（ExecutionTimeLimit按时长）语义；容忍额外IdleSettings、AllowStartOnDemand、RunOnlyIfIdle、WakeToRun、Priority，保留Triggers=0、一个Action/Principal、无RestartOnFailure及主体/动作/Description检查。F2仅is_exited_residual:true可接受owner UNKNOWN，其他具体SID仍HALTED；非残留UNKNOWN仍HALTED。F3在Recovery-State内先Recovery-Table/Get-WmiObject再Recovery-Registry，新registry_parse_error固定紧随registry_status，PARSE_UNKNOWN为异常类型全名+ASCII清洗消息前120字符（引号值和路径先脱敏，含跨行），PARSED/missing为null。F4全局powershell/electron实例采集按有效CreationDate及结构性残留直接跳过，不依赖登记表；存活空命令行、空路径等仍HALTED。

Node20.17 recovery-6修复轮1全部397 PASS/0 FAIL；变异Z00 78 PASS/0 FAIL（字节等价检查不参与）后，原18容忍+12身份命名及新增9个F1～F4共39个去golden/去inverse语义变异全部检出，每个重算自身清单/绑定并记录材料SHA。首包354/0与其350/3初始日志保留为历史证据，本轮先396/0，再补跨行路径脱敏用例后397/0。无等价或golden-only检出；本机均SURROGATE，当前包Win7/PS2/WMI/计划任务/文件共享/回收NOT_PERFORMED，不形成Win7/Gate A/B/Alpha2/RC通过结论。

旧包SHA 8cc135a9ac564894ff83876059f2e1736618874315499364a3bc5be567c99230作废，不再用于活动确认句。新包SHA 66d133c641b6ca913f8dc30585e8c95fa0077e78ab9e65fb6d8c9bc9dfcea7bd，binding afcc8fbac098a433e16eb07e8c6d19ca2812206ed6160206e01f01dba4cde34e；确认句“确认执行诊断预演 3 回收，材料包 SHA 66d133c641b6ca913f8dc30585e8c95fa0077e78ab9e65fb6d8c9bc9dfcea7bd”。包内仍仅signed:false待签，原话与时间均null。原3g实机HALTED和已有证据不改判；不连接目标、不提交/推送、不改载荷/冻结副本/预算。71写点/114文件和WRITE_SITES原字节不变。修复前后15受保护目录树与README均按原算法核验；开工前的三文档前缀逐字节保持。

UNKNOWN：Win7 Task.Xml是否补默认节点仍UNKNOWN（现在已容忍）；ManagementDateTimeConverter在未做WMI调用前是否可解析UNKNOWN（现以State内先查WMI规避并留出解析诊断字段）。本轮Win7目标执行全部NOT_PERFORMED。修复轮1旧新SHA、新合同与39变异证据见outputs/a9-39-diagnostic-3b-prep/addendum13/ADDENDUM13_REPORT.md和addendum13.json的修复轮1记录。


### A9-39 追加十四：3h诊断与recovery-7备料（2026-10-20 UTC）

结论：追加十四N1～N4开发机备料完成，诊断包3h与兜底recovery-7待审核及负责人新完整SHA逐字确认。基线codex/a9-alpha2-integration-r2 / dc8cdecbaa07008edb931c8e01024878e7ad3d58，入场三文档及README已有修改保留。本轮不连接目标/远端（包括ping、ssh、sftp、ssh-keyscan及网络探测）、不提交/推送/安装/启动新会话或代理，不生成生产已批准回执。候选WIN7-46、REHEARSAL_NOT_ELIGIBLE；3h/recovery-7当前Win7全部NOT_PERFORMED。

3g包c62e155b83f41af236864764c15c86fd78ed8fe3afab74d845c8448e7a91bd62（已用完）、run991f82e2-546e-4365-b854-c8cbe86ccb3f于2026-10-20T02:30Z在Win7实机执行：令牌queries为kind25 ok/err0/need28/size256/value8192，kind20 ok/err0/need4/size4/value0，kind18 ok/err0/need4/size4/value1；admission为integrity8192/elevated false/type1/in_job false/session2。五次Self-Job、worker6424启动、首次SNAPSHOT、task/query两条observer_bound（ManagementDateTimeConverter在此调用可用）、四个profile目录、case_start、wrapper7804、首poll均有原事件。worker_spawn至query_return约1.34秒，query_start_ticks至返回约0.988秒，两个口径保留。poll101713777711至failure101713895323/f2343916约50.18ms；failure只有SUPERVISOR_OPERATION_FAILED/hard true，无detail。

现场request.tmp为序号2、SNAPSHOT/task/0/截止02:30:53.9204002Z，request.tsv仍序号1/截止52.4104002Z，response仍OK1。推断第二次Publish-File进入目标已存在的Replace分支且快速抛非IO/非Unauthorized异常；具体类型、消息及根因UNKNOWN，不将N2写成已证实修复。task约02:30:49写HALTED_CLEANUP_INCOMPLETE并退出，账本538字节仅task/query两行；wrapper7804与稍后创建的controller7452均未登记。controller约02:30:55.86握手timeout自然退出，wrapper约57.16以1返回。D4/R1在Bound-Live行305 NEW_NODE_DURING_CLEANUP，D7行399 TASK_REMAINS，D5封存/D6下载NOT_PERFORMED；原HALTED不改判，分类MAIN_PATH_DETERMINISTIC与TOTAL_LOSS。

recovery-6包66d133c641b6ca913f8dc30585e8c95fa0077e78ab9e65fb6d8c9bc9dfcea7bd（已用完）于05:21Z在Win7实机RECOVERY_COMPLETE，SSH4/上传0/下载1，取回23文件。R-probe/POSTFLIGHT原文确认精确载荷任务A9-W46-DIAG3-991f82e2仍注册、State3/LastTaskResult126，根相关进程0，登记两行PARSED。该任务与C:\A9-W46\run\991f82e2待负责人另行清理裁决；更早根目录是否残留UNKNOWN。本轮只读原3g/recovery-6证据，回收成功不提升诊断或候选结论。

N1：case非编码异常向既有FIRST_FAILURE.json与failure事件追加尾字段detail，类型全名:脚本行号:消息，消息200/总300字符，控制/非ASCII清洗，继承秘密模式与引号/路径脱敏。worker终末catch先记录failure detail、ERROR协议不变；WMI映射保留原code+inner；common Event失败沿同一bound失败文件追加detail。Publish非IO抛PUBLISH_FILE_FAILED并保留原异常与已清洗A9Detail；case/worker仍映射原SUPERVISOR_OPERATION_FAILED/QUERY_OPERATION_FAILED。准入保留原240诊断格式并加秘密屏蔽。完整24项catch/无catch文件清单说明无法安全再写的final兜底，未新增载荷文件/事件名。扫描器和contract无事件/字段白名单；真实已钉D5 scanRun/collect接受新detail，秘密阳性仍拒绝。

N2：目标存在先Delete再Move；不存在直接Move，40次/25ms/每轮deadline和IO/Unauthorized重试保持。读方缺文件/共享读IO返回空并继续；删除成功而Move失败后下轮Exists=false直接Move；竞态及失败终态保留，真实Win7共享/错误映射UNKNOWN。N3：Bound-Live/Rescue-Bound与D4/R1/R2/D7直接Related检查只等待未登记根相关进程自然退出；每轮重查，绝对20秒/250ms，不按新到进程重置，不登记、不终止、不删除这些进程。共同截止前保留D4原105秒救援、其它步骤10秒，外层cutoff取更小值，时间不足缩短等待，原错误码/已登记身份终止门保持。渲染后既有终止/删除站点与3g逐行相同。

N4：新run ab1620b7-a701-4549-a9f3-341796a96530，根C:\A9-W46\run\ab1620b7，任务A9-W46-DIAG3-ab1620b7；旧991及原全部拒绝项保留。全仓初搜只有ID文件与p17派单备份，新运行未使用；后续全树/执行位置/15运输载体复核，执行旧值0。HOST dccs-chaizl@192.168.1.5、HostKeyAlias192.168.1.11保持。recovery-7绑定RECOVER7-SCAN/work/recover-7/recover-7-scan.cjs，冻结新3h，71写点逐项比较、114允许文件集合不变；23个运行工具在身份命名逆变换后逻辑字节相等，仅拒绝集与冻结来源派生重钉单列。保留recovery-6全部397项既有检查；当前406项绿。

最终Node20.17控制/集成850、载荷251、recovery-7 406，共1507 PASS/0 FAIL（下述37条为原始第一轮历史变异）；Z00 26/0、Z00-R 1/0先绿，37个去golden/去inverse、逐个重算自身载荷清单/绑定的变异：36检出、1等价（移除消息上的提前ASCII替换，最终detail仍执行同一替换；5000向量及交换性证明），无golden-only检出。初轮字段名变异暴露断言缺口，已补断言后检出；原失败日志保留。备料还修正拒绝项顺序导致候选从REJECT_ROOTS[0]派生错误、复制测试输出根仍指addendum13两项本地问题；仅新建测试目录迁回addendum14，addendum13按原算法恢复5128d939b41353a2f4a51b939e332fa0d5fd4bce57dfe835598701829e4639cc。所有本机证据均SURROGATE；PS/.NET/Win7运行行为NOT_PERFORMED。

3h包SHA 9d80f6dd3d6691749b05bcef4884da56a48fe88a2bff423e87e830de06f9dff7，binding 838fa067140148b5549449027d0c6c8288c6f865ead822da224cf1caa33e55bf；确认句“确认执行诊断预演 3，材料包 SHA 9d80f6dd3d6691749b05bcef4884da56a48fe88a2bff423e87e830de06f9dff7”。recovery-7包SHA 2602b60b94b8abb5787aa7f2d85a625b2a0defdafb6042d2ad46500457d5d104，binding e276e3eb2f34b3bf2b9183a6595c1081254a95b339abd11214d1119a47716ab0；确认句“确认执行诊断预演 3 回收，材料包 SHA 2602b60b94b8abb5787aa7f2d85a625b2a0defdafb6042d2ad46500457d5d104”。仅signed:false待签，原话/确认UTC/到期UTC均null。诊断SSH正常6/硬8、上传1/下载1、120+60+180+60+660+120+120+60+60+60=1500秒、入口≥1800/回执窗口≤3000和D4工作常量保持；回收SSH4/上传0/下载1/救援0、1020秒/入口≥1320保持。

只报告审计见REPORT_ONLY.md：5秒握手是否足够UNKNOWN，样本1.34秒与controller相对wrapper晚1.091秒不能给出真实最坏上界；源码可等待一次甚至两次5秒请求，另有登记/observer/ack开销。controller in_job true、wrapper false符合观察入口差异的设计，具体Job成因UNKNOWN。首次路径、后续Request/Reply分支及旧任务/目录安全清理仅评估，未实现。docs/OUTPUT_STYLE.md本树不存在，按既有W01～W12样式记录。17受保护树、README原SHA4a4590881c162b8379fda14212ce50566b03ddcca775d6156146f021d903bf3e与三文档开工前前缀逐字节核验；完整证据outputs/a9-39-diagnostic-3b-prep/addendum14/ADDENDUM14_REPORT.md、addendum14.json。

#### 修复轮 1（追加十四；遗留项已由修复轮2关闭）

R1 已在 Wait-Unregistered 仅捕获 PROCESS_FIELDS_UNKNOWN，成功轮清零，末轮未知字段到期保留该码；Bound-Live 仅对该码与 NEW_NODE_DURING_CLEANUP 等待。20秒共享预算、latest/outerCutoff、终止/删除/登记语义及D4/D7/R1/R2紧邻Related复查保持。R2 将worker failure Event隔离在try/catch，ERROR Reply与exit126不受事件写入失败阻断；Reply发布失败仍原样传播。R3 补记Publish-File的File.Delete(dest)仅删除work/query/request.tsv或response.tsv（WRITE_SITES第12项，已有work/query目录，无新路径），并纠正recovery-7 W01：3g run991f82e2与recovery-6是已用完的历史Win7事实，本包仅服务尚未实机执行的3h run ab1620b7。

修复轮1历史诊断控制/集成/载荷1085/0，recovery-7为406/0；37条旧变异加R1七条/R2三条共47条：46检出、1等价（5000向量与交换性证明），Z00先绿，无golden-only。render-controller 15载体、static-audit四关键载体的可达终止/删除集合相等，recovery-7的31个tools/reuse逻辑文件本轮字节全同。首失败与重钉中间失败日志均保留。

修复轮1发现的最坏交替反例现已关闭：S1按批准原样应用，Bound-Live在Wait返回后核共享截止并休眠250毫秒，原必需交替门现为2/2。原始失败模型与日志保留在fix-round1/；当前总上界见STATIC_WAIT_PROOF.json。

F-03/F-04仅记录：20秒只能覆盖几秒级残留，leaf约40秒/Electron约68～80秒可再次丢D5/D6证据；R2开头等待最多消耗20秒救援时间，常量不改。紧邻Related重复枚举失败窗口与改前相同，概率数字UNKNOWN。未登记已退出僵尸行的Win7实际持续时间/WMI字段仍UNKNOWN（等待现已容忍）；N2第二次发布是否真正修复仍UNKNOWN；本轮Win7全部NOT_PERFORMED。

新3h包SHA `9d80f6dd3d6691749b05bcef4884da56a48fe88a2bff423e87e830de06f9dff7`，binding `838fa067140148b5549449027d0c6c8288c6f865ead822da224cf1caa33e55bf`；新recovery-7包SHA `2602b60b94b8abb5787aa7f2d85a625b2a0defdafb6042d2ad46500457d5d104`，binding `e276e3eb2f34b3bf2b9183a6595c1081254a95b339abd11214d1119a47716ab0`。仅signed:false待签，原话/确认/到期null；旧新SHA对照及完整64位确认句模板见追加十四报告修复轮2。17受保护树、README字节及三文档原开工前前缀核验见fix-round1/保护证据；不提交、不推送、不连接目标。

#### 修复轮 2（追加十四；开发机 SURROGATE，PASS）

S1按主会话（项目经理）裁决原样应用fix-round1/PROPOSED_BOUND_GUARD.patch；负责人未就该补法单独批准，负责人只对最终包 SHA 逐字确认，仅Bound-Live catch保存本次原错误码，Wait返回后核共享截止，未到期休眠250毫秒再重跑；其它异常立即重抛。Wait、终止、删除、登记、预算及常量不变。每次重试要么截止抛原码，要么至少休眠250毫秒，共享截止≤20秒，所以重试次数≤ceil(20000/250)+1=81；证明范围为可控非倒退时钟SURROGATE，实际Win7枚举耗时未知。

最终Node20.17控制/集成850/0、载荷251/0（诊断1101/0）、recovery-7 406/0，共1507/0。原必需交替门已纳入包内，2/2通过且包含在850项中；新增有限恢复、持续交替、已过期Wait成功、原码保留及其它异常不休眠测试。47旧变异+6新守卫变异=53，52检出/1等价/0 golden-only，Z00 62/0、Z00-R 1/0先绿。15载体均本地stub，四关键载体Bound守卫字面存在，可达终止/删除与3g逐行相同；回收31个tools/reuse逻辑文件本轮字节相同，冻结3h及派生绑定同步。

当前3h包SHA `9d80f6dd3d6691749b05bcef4884da56a48fe88a2bff423e87e830de06f9dff7`，binding `838fa067140148b5549449027d0c6c8288c6f865ead822da224cf1caa33e55bf`；recovery-7包SHA `2602b60b94b8abb5787aa7f2d85a625b2a0defdafb6042d2ad46500457d5d104`，binding `e276e3eb2f34b3bf2b9183a6595c1081254a95b339abd11214d1119a47716ab0`。两句完整确认句及原始第一轮/修复轮1作废SHA对照见ADDENDUM14_REPORT.md修复轮2；旧值仅历史对照，待签signed:false，原话/确认/到期均null。17受保护树、README及原开工三文档前缀保持，详见fix-round2/FILE_MANIFESTS.json、CHANGED_FILES.json与保护证明。S1～S3本地完成，材料待审核与新完整SHA逐字确认。

F-03/F-04、紧邻Related重复枚举窗口保持；概率、未登记僵尸行Win7实际持续时间/WMI字段、N2是否真正修复第二次发布均UNKNOWN；当前Win7全部NOT_PERFORMED。不提交、不推送、不连接目标或远端、不安装依赖、不生成已批准回执。


### A9-39 追加十四收口：3h 实机结果与诊断分析（2026-10-20 UTC）

当前事实：WIN7-46 的 3h 已在 2026-10-20 Win7 实机完成 D1～D7，60 个封存文件全部回收，D7 四项为 0；诊断仍为 HALTED/REHEARSAL_NOT_ELIGIBLE。本条仅收口既有实机数据的开发机分析，不形成正式门 A、门 B、Alpha 2 或 RC 结论。D1～D7 流程完成不表示六例全部执行。

3h 材料包 SHA 9d80f6dd3d6691749b05bcef4884da56a48fe88a2bff423e87e830de06f9dff7、run ab1620b7-a701-4549-a9f3-341796a96530 的回执确认于 2026-10-20T07:45:01.199Z，已执行用完，不得复用。已用回执归档 outputs/a9-39-diagnostic-3b-prep/archive/attempt-9-receipt/；包内仅 signed:false 待签文件，永不签署。recovery-7 未使用，保持 signed:false，不签署。本条与任务书 §11.8.34 更新追加十四及 §11.8.33 的待审核确认状态，保留原历史。

SSH 6/8、上传 1、下载 1；D4 182.257 秒、退出 1/PAYLOAD_HALTED，运输 result.error=false；D4 内部收尾已执行，rescue_attempted=false 指外层救援未派发。J1/J2 OBSERVED（AS_DESIGNED），G1/G2 INVALID_CASE/GRANDCHILD_EVIDENCE_INCOMPLETE（DEVIATES），X1 HALTED/QUERY_OPERATION_FAILED、timed_out=true（DEVIATES），X2 NOT_PERFORMED/HARD_GATE_LATCHED（UNKNOWN）。N1 生效，N2 序号 2 起成功，N3 是否实际等待为 UNKNOWN；3g 第二次发布失败与整批丢证据本次未复现，不外推未来。

异常完整原文为 `System.Management.ManagementException:157:??? `，对应 query-worker.ps1:157 的 Terminate(1)；根因、原始消息及错误码为 UNKNOWN。GPU 关联与既有决策边界见任务书 §11.8.34。15 项 UNKNOWN 保留；旧任务 A9-W46-DIAG3-991f82e2、目录 C:\A9-W46\run\991f82e2 与 C:\A9-W46\run\ab1620b7 的最后已知状态见该节，当前存在性均为 UNKNOWN，未清理。

负责人裁决：“批准选项 A：按现有数据收口 3h 诊断分析，不备 3i；C（Win7 残留清理包）另行提交方案再裁决。”本轮仅追加三文档与 closure-3h 核验报告；未连接目标、未改包及既有证据、未签回执、未改任务索引、未新增 ADR、未提交或推送。清理方案获准前相关目标机动作均为 NOT_PERFORMED。

下一步：3i 不备；C 清理包方案待执行代理起草、负责人裁决；A9-39 其余工作项按任务书与负责人排序。

入口：任务书 §11.8.34；outputs/a9-39-diagnostic-3b-prep/addendum14/analysis-3h/ANALYSIS_3H.md；outputs/a9-39-diagnostic-3b-run/ab1620b7-a701-4549-a9f3-341796a96530/RUN_RESULT.json；outputs/a9-39-diagnostic-3b-prep/addendum14/closure-3h/CLOSURE_REPORT.md。


### A9-39 Win7 残留清理方案裁决：暂不清理（2026-10-20 UTC）

当前事实：负责人裁决 C 暂不清理，不备料；清理方案已交付但不执行，位置 outputs/a9-39-diagnostic-3b-prep/addendum14/cleanup-plan/，详见任务书 §11.8.35。执行代理推荐的“三个目标加先取回压缩包”未采用。Win7 旧任务 A9-W46-DIAG3-991f82e2 与目录 991f82e2、ab1620b7 的当前存在性仍为 UNKNOWN，df9b9b24 根不得清理。

负责人裁决原话：“选择选项 1：C 暂不清理，不备料；等到要做 3i 或验收收尾时再启动。”

重提条件：决定做 3i 前先处理计划任务 991f82e2，或验收收尾，或负责人另行要求。本条未连接目标机、未改包与证据、未提交、未推送。

下一步：3i 不备；C 暂不启动；A9-39 其余工作项按任务书与负责人排序。


### A9-39 预演 3 材料备料完成，待预检确认（2026-10-20 UTC）

当前事实：负责人批准选项 R 后，预演 3 材料已在开发机备好，位置 .acceptance/a9-39/w46-rehearsal-3-preparation/，包 SHA256SUMS 的 SHA 为 b337dec2…，预检材料包 SHA 为 76922581…。新 run b8a87766-f43d-4d20-ae6a-fe6e2704dcfc，入口 E1 改 E2，新增 120 秒 gpu-entry-gate，预算为控制 SSH 34、上传 1、下载 1、总 19800 秒。经三轮独立静态审核与一轮修复复核，主会话独立重跑八个测试文件，208 通过、0 失败；变异 134 条由 codex 报告全部检出，主会话未逐条复跑。证据层级为开发机，候选 WIN7-46；Win7 实机 NOT_PERFORMED，UNKNOWN 32 项。预演 3 即使通过仍是 REHEARSAL_NOT_ELIGIBLE。

负责人批准原话：“批准按 R 备预演 3 材料：接受入口 E1 改 E2 与严格父链绑定、新增 gpu-entry-gate（120 秒）、预算控制 SSH 34/上传 1/下载 1/总 19800 秒（停派 18000、收尾 1800）、保留 scanRun 全范围仅计时。只在开发机备料，审核通过前不连接目标机。”

本轮未连接目标机，未执行预检，未写入负责人确认，未生成已签回执，未提交，未推送，未改任务索引与 ADR。门粒度 B 的 ADR 与 DRAFT 任务书按负责人裁决暂不起草，待预演 3 材料核验后再确认。

下一步：负责人逐字确认预检材料包后，主会话才可连接目标机执行只读预检（最多 2 次，每次 120 秒）；预检通过后再提交预演 3 签发材料。

入口：任务书 §11.8.36；outputs/a9-39-rehearsal-3-prep/REHEARSAL3_PREP_REPORT.md；outputs/a9-39-rehearsal-3-prep/FIX_R3.diff。


### A9-39 预演 3 首次预检通过但未经 finalizer，待负责人再次确认（2026-10-20 UTC）

当前事实：负责人逐字确认预检材料包 76922581… 后，主会话执行了一次 Win7 只读预检：机器 DCCS-CHAIZL-PC，SID 以 -1001 结尾，控制台会话 2，无 LogonUI，新根 C:\A9-W46\run\b8a87766 不存在，时钟偏差 5 秒，ok=true。证据层级为 Win7 实机只读预检，候选 WIN7-46；预演 3 本体 NOT_PERFORMED。

偏差：主会话直接运行了包装器，未经 tools/finalize-signing.cjs，所以该结果不能生成 release-authority.json（证据目录已存在，且预检早于 finalizer 开始时间）。已消耗预检额度 1 次，另有 1 次未用；经 finalizer 重新预检会用尽额度，且 finalizer 写入的 ordinal=1、already_consumed=0 须在记录中更正。详见任务书 §11.8.37。

下一步：负责人再次逐字确认同一句后，主会话将现有证据目录原样改名保留，再经 finalizer 预检并生成最终载荷；之后仍需负责人对最终载荷 SHA 做第二段确认，才能启动预演 3。未获确认前不连接目标机。

入口：任务书 §11.8.37；outputs/a9-39-rehearsal-3-auth/win7-preflight-r1/LOCAL_RESULT.json。


### A9-39 预演 3 最终载荷已生成，待负责人第二段确认（2026-10-20 UTC）

当前事实：负责人再次逐字确认预检材料包 76922581… 后，主会话经 finalizer 完成第二次预检（Win7 只读，ok=true，控制台会话 2，无 LogonUI，新根不存在，时钟偏差 5 秒），生成最终载荷 release-authority.json，SHA aef10661…，signed:false。预检额度 2 次均已用尽，第一次为主会话绕过 finalizer 的直接运行，不被采用，详见任务书 §11.8.37、§11.8.38。证据层级为 Win7 实机只读预检，候选 WIN7-46；预演 3 本体 NOT_PERFORMED。

下一步：负责人在 2026-10-21T01:33:21Z 前逐字回复第二段确认句（批准本次预演最终载荷SHA-256 加完整 SHA），主会话才可在其后 300 秒内启动 R1。逾期则没有预检额度重做，须另行裁决。启动后预演 3 最长约 5.5 小时，期间 Win7 控制台须保持登录，不得锁屏或重启。

入口：任务书 §11.8.38；outputs/a9-39-rehearsal-3-auth/；.acceptance/a9-39/w46-rehearsal-3-preparation/signing-final-r1/FINALIZATION.json。


### A9-39 预演 3 执行 HALTED：R3 上传缺陷，已派重试备料（2026-10-20 UTC）

当前事实：负责人批准最终载荷后，预演 3（run b8a87766…）在 Win7 实机启动，R0、R1、R2 通过，R3-upload 因包缺陷失败：R2 建目录表缺 work\preparation\payload 与 payload\diag-app，第 41 条 put 失败。产品阶段、GPU gate、控制器链路 NOT_PERFORMED，E2 与 GPU 问题没有新证据。证据层级为 Win7 实机，候选 WIN7-46，REHEARSAL_NOT_ELIGIBLE。目标机留有新根 C:\A9-W46\run\b8a87766 与 40 个已上传文件，计划任务 0 个、进程 0 个，未清理。实际控制 SSH 6 次、传输会话 7 次。详见任务书 §11.8.39。

下一步：codex 在开发机修复并重绑新 run，主会话核验并安排聚焦审核；新 run 需要负责人重新做两段逐字确认。负责人是否继续预演 3 路线由负责人裁决。

入口：任务书 §11.8.39；outputs/a9-39-rehearsal-3-run/b8a87766-f43d-4d20-ae6a-fe6e2704dcfc/RUN_RESULT.json。


### A9-39 预演 3 重试备料完成，待预检材料包确认（2026-10-21 UTC）

当前事实：旧 run b8a87766 因 R2 建目录表缺陷 HALTED 后，重试包已在开发机修复：补 R2 目录表，新 run d35a55d2…，旧 run 进拒绝集合，新增远端目录一致性测试与全链路路径审计（新缺口 0），R3 上传超时放宽到 240 秒且总预算 19800 秒不变。Sonnet 审核 B 通过，审核 A 的 1 条 P1 已在修复轮 5 修复。主会话重跑九个测试文件 215/0，保护目录 34 项 0 差异。包 SHA256SUMS 为 5a12bf15…，预检材料包 SHA 为 4308245e…。证据层级为开发机，候选 WIN7-46；新 run 在 Win7 NOT_PERFORMED，UNKNOWN 34 项。详见任务书 §11.8.40。

下一步：负责人逐字确认新预检材料包后，主会话经 finalizer（--owner-input 路径）完成预检并生成最终载荷；之后还需负责人对最终载荷 SHA 做第二段确认，才能启动新 run。目标机上旧 run 的残留（新根、ZIP、40 个文件）未清理。

入口：任务书 §11.8.40；outputs/a9-39-rehearsal-3-retry1-prep/REHEARSAL3_PREP_REPORT.md。


### A9-39 预演 3 重试预检通过，待负责人确认最终载荷 SHA（2026-10-21 UTC）

当前事实：负责人逐字确认重试预检材料包 4308245e… 后，主会话经 finalizer 完成一次 Win7 只读预检并生成最终载荷：机器 DCCS-CHAIZL-PC，SID 以 -1001 结尾，控制台会话 2，无 LogonUI，新根 C:\A9-W46\run\d35a55d2 不存在，时钟偏差 5 秒，ok=true，ssh_sessions=1。最终载荷 SHA 为 e6b64c88…，signed:false。证据层级为 Win7 实机只读预检，候选 WIN7-46；新 run 本体 NOT_PERFORMED。

下一步：负责人在 2026-10-21T02:53:17Z 前逐字发送第二段确认句“批准本次预演最终载荷SHA-256 e6b64c882515e4e06091d8d834149c8bca6a0b910e50fb4427a7b25b937a39be”；主会话收到后写入已签回执并在 300 秒内启动 R1。过期则本 run 须重新预检（额度还剩 1 次）。目标机旧 run 残留未清理。

入口：任务书 §11.8.41；outputs/a9-39-rehearsal-3-retry1-auth/win7-preflight-r1/LOCAL_RESULT.json。


### A9-39 预演 3 重试已执行，HALTED（2026-10-21 UTC）

当前事实：run d35a55d2… 在 Win7 实机执行 11 分 44 秒后 HALTED。R0～R4、p01、p02、gpu-entry-gate（PASS）、p03、p04 的计划任务全部退出码 0；p07-safe 的 B2-A37-01 失败（failure_class DRIVER_SECRETS_A37_01_FAILED，根因 UNKNOWN）。恢复下载 120 秒超时，只取回 109/461 项，缺 a37-01.json 与 p01、p03、p04 的 phase-result。R8 读回：计划任务 0、进程 0。证据层级为 Win7 实机，候选 WIN7-46，REHEARSAL_NOT_ELIGIBLE，不计入验收。

下一步：开发机分析 B2-A37-01（用已取回的 secrets/a37-01 数据与验证包源码），同时修复恢复下载的超时与排序缺陷；是否再取证、是否再跑下一个 run 待分析后由负责人裁决。目标机残留（run d35a55d2 与旧 run b8a87766）未清理。

入口：任务书 §11.8.42；outputs/a9-39-rehearsal-3-retry1-run/d35a55d2-d124-4d8b-8735-a0beadf297ec/RUN_RESULT.json。


### A9-39 B2-A37-01 开发机分析完成，待负责人裁决修复路线（2026-10-21 UTC）

当前事实：失败归属在 Win7 原始数据证实前为 UNKNOWN。开发机静态复算发现确定性不一致：驱动对源码样本写死的期望投影 `…authorization: ***redacted*** };`，与候选日志脱敏的实际输出 `…authorization: ***redacted***;` 不同（候选把 `}` 当作凭据吞掉）；header、URL 样本一致。ADR-0246 允许日志脱敏改变源码中的 `authorization: token`。若这是根因，源码样本三个编码都会失败，且与 Win7 无关。证据层级为开发机只读分析，候选 WIN7-46；a37-01.json（27,749 字节）未取回，s001～s003 的 Win7 结果 UNKNOWN。

下一步：负责人裁决修复路线（改驱动期望还是改产品正则）、是否授权一次 1 个文件的定向取证、是否采用新的恢复下载设计；修复驱动会改变包内套件，需新候选。目标机残留未清理。

入口：任务书 §11.8.43；outputs/a9-39-rehearsal-3-retry1-analysis/A37_01_ANALYSIS.md。


### A9-39 负责人批准路线 A，新建候选 WIN7-47（2026-10-21 UTC）

当前事实：负责人批准“改驱动期望，不改产品，新建候选 WIN7-47”，登记为 ADR-0253（Accepted），任务书修订 r22。WIN7-46 的预演 3 重试结果（HALTED，B2-A37-01 失败）与冻结包原样保留。证据层级为开发机，Win7 为 NOT_PERFORMED。

下一步：执行代理先备定向取证包（4 个文件、42,705 字节），经负责人逐字确认后取回 a37-01.json 等；随后修驱动期望并改绑 WIN7-47；本地提交与双干净构建须负责人另行批准。

入口：任务书 §11.8.44；docs/DECISIONS.md ADR-0253。


### A9-39 允许路径增补；定向取证包备料完成，待核验与逐字确认（2026-10-21 UTC）

当前事实：负责人批准把 A9-36 的两个文件（`a9-alpha2-supplement-request.cjs`、`A9_ALPHA2_SUPPLEMENT_VALIDATION.md`）加入 A9-39 允许路径，只改候选号为 WIN7-47。定向取证包备料完成（材料 SHA 0bb32d71…，11 个文件，测试 37/0，变异 10/10），主会话核验中；未连接目标机。证据层级为开发机。

下一步：主会话核验取证包并向负责人取包 SHA 的逐字确认句；执行代理修驱动期望并改绑 WIN7-47；本地提交与双干净构建须负责人另行批准。

入口：任务书 §11.8.45；.acceptance/a9-39/w46-recovery-a37-retrieval/RETRIEVAL_PACKAGE.md。


### A9-39 定向取证完成，B2-A37-01 归属驱动期望缺陷（2026-10-21 UTC）

当前事实：负责人逐字确认后，定向取证 1 次 SFTP 取回 4 个文件，全部校验通过。Win7 实机（WIN7-46，run d35a55d2…，REHEARSAL_NOT_ELIGIBLE）：p01、p03、p04 为 PASS；B2-A37-01 的 s001～s003 完整通过，s004 的恢复、Diff、撤销、扫描均正常，只是投影与驱动写死的期望不符，归属驱动期望缺陷。

下一步：执行代理完成驱动期望修复与 WIN7-47 改绑后，主会话核验；本地提交与双干净构建须负责人另行批准；随后备预演 4 材料（新 run、恢复下载改进）。

入口：任务书 §11.8.46；outputs/a9-39-rehearsal-3-retry1-recovery/LOCAL_RESULT.json。


### A9-39 驱动期望修复与 WIN7-47 改绑核验通过，待负责人批准本地提交（2026-10-21 UTC）

当前事实：执行代理修了驱动对源码样本的投影期望，并把候选号 WIN7-46 改为 WIN7-47（11 个文件，+138/−47）；产品代码未改。主会话开发机核验：全量合同 541/541，包测试 9/9，脱敏正则 46/46，Provider persistence 26/26，`check_docs` 通过。lifecycle 3 项失败在未改动的 HEAD 上同样失败，记为既有问题（根因 UNKNOWN）。证据层级为开发机，候选 WIN7-47（tentative），基线 HEAD 3997df16…。

未做：提交、构建、预演 4 材料、Win7 执行均为 NOT_PERFORMED；Win7 残留（`C:\A9-W46\run\d35a55d2` 等）未清理。

下一步：负责人批准本地提交后，主会话做双干净构建与比对，再备预演 4 材料；预检与最终载荷须另行逐字确认。

入口：任务书 §11.8.47；`outputs/a9-39-rehearsal-4-prep/REPORT.md`。

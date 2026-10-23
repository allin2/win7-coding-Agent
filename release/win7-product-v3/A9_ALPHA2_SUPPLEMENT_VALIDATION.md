# A9-36 Alpha2候选外补证输入

本文件描述 WIN7-54 的候选外补证合同。WIN7-54 是包含 A9-37/38 的 Alpha 2 最终候选；其构建、冻结与门 A 状态以 `docs/STATUS.md` 和冻结目录为准。source、ZIP、manifest 和 M6 正向模块及原生 SHA 在构建后由负责人签发的门 A 授权提供。执行代理不在代码中预填这些值。

M6 回退目标仍为冻结的 WIN7-42（第一批可靠性候选）。其完整钉见任务书 §2 和请求模块。本地实现仍限 ADR-0245 的六路径。改绑依据是负责人 2026-10-17 的授权和整合分支 ADR-0250、ADR-0251。取舍见 ADR-0252 草案，状态 Proposed，待负责人接受。本文件不构成门 A 或 Win7 PASS。覆盖与未完成范围只维护[既有缺口表](../../docs/plans/A9_ALPHA2_GAP_DISPOSITION.md#75-补证执行委托与准备2026-10-15-utc)。

## 1. 输入、权限和运行时

四件可执行输入，放在新run的`inputs`下并在候选外authority中逐SHA256绑定：

- `a9-alpha2-supplement.cjs`：固定六组编排、Stage计划、夹具、隔离种子、M6探针与结果校验。
- `a9-alpha2-supplement-request.cjs`：独立v1请求/批准/消费账本。
- `a9-alpha2-supplement-desktop.ps1`：普通交互桌面启动与当前token取证。
- 源`src/shell/tests/product/a9-batch2-driver-entry.cjs`原字节，目标名`a9-batch2-driver-entry.cjs`：同包Electron的候选外driver。

M6另有非可执行输入：WIN7-42的ZIP与解包树，以及`inputs\m6`下的六个夹具文件（`F42.sqlite`、`FCandC.sqlite`、`FCandN.sqlite`、`C42.sqlite`、`CCand.sqlite`、`baseline.json`）。authority的`m6`对象逐项绑定它们的SHA256、两侧持久层SHA、原生SHA、WIN7-42的source、ZIP、manifest与根路径和固定的`now`。角色固定为 `w42` 与 `cand`。

固定Runtime Profile为Win7 SP1 x64、Electron22.3.27/Node16.17.1/ABI110，包内SQLite/helper和已登记系统API。桌面入口为Windows PowerShell5.1；低版本拒绝，不安装或降级。复用已批准IsProcessInJob、WindowsIdentity、whoami/WMIC；不存在新的系统依赖。Python3.8和Git2.46.2必须在authority中绑定现存准确路径/SHA，实际版本不符即停；不隐式下载、安装或使用其他版本。开发机Node20结果不替代这些目标能力。

候选完整树和ZIP/manifest先直接复核；所有包内JS及其依赖在首次require前逐文件哈希。逐文件复核在Electron内经`original-fs`读取：Electron修补了`fs`，以`.asar`结尾的路径被当作归档目录而不是文件，候选与WIN7-42的`resources/default_app.asar`是普通文件。目标机第一次`--run`的完整性检查抛`A9_36_CANDIDATE_CHANGED`，结果没有记录失败条目；按asar机制推断失败条目可能是该文件（用`fs`时`isFile()`为假），这是由代码和包自带的`selectPhysicalFileSystem`作出的推断，未在目标机逐文件定位，目标目录是否另有文件被改动也未核验。编排器现与包自带规则一致：Electron内取不到`original-fs`（缺方法，或加载时抛错）即抛`A9_36_PHYSICAL_FILESYSTEM_UNAVAILABLE`，不回退到被修补的`fs`。执行身份复核按整数比较WMIC输出的`SessionId=<数字>`（唯一一行，5不等于50或51），缺失、重复或格式异常均拒绝。原正式mode集合、25用例/43断言、冻结目录和正式run5773470e…不修改。新driver副本仅放在新run的driver-app，使用同字节Electron运行时副本，再加载原包真实main/preload/IPC。工作区选择对话框仅在驱动进程中替换为准确隔离目录，产品操作经公开API/真实UI。

隔离范围覆盖Electron `userData`、A9数据根、工作区和恢复目录（任务书§4.2）：子进程LOCALAPPDATA、APPDATA、TEMP/TMP均指向新run，禁用portable并清除额外CA入口。main加载后driver以`evaluateUserDataIsolation`核对三项：实际`userData`等于`<LOCALAPPDATA>\Win7CodingAgent`、位于run_root内、其中没有`state\agent-events-v2.db`。任一项不成立即抛`A9_36_USERDATA_NOT_ISOLATED`，该Stage不产生任何断言。

## 2. 新批准与六个请求

authority是严格字段v1 JSON，状态必须OWNER_APPROVED，其准确SHA256由负责人独立确认并传给桌面入口。复制旧签字或把DRAFT字段改名不构成批准；ADR-0245只批准本地实现，不是目标门A。新run为UUID，run_root以其前8位结尾，candidate_root与run_root不重叠；authority必须在run_root/inputs/authority.json，所有路径是无控制字符/引号/百分号的准确本地绝对路径。

授权新增以下必需绑定。旧授权和旧夹具不能用于本轮：

| 字段 | 判据 |
|---|---|
| `candidate` | 严格等于 `WIN7-54`；回退目标 `WIN7-42` 不得作候选 |
| `source`、`package_sha256`、`manifest_sha256` | 只来自负责人授权；分别为 40、64、64 位小写十六进制；逐项拒绝已退役 WIN7-45 的三项身份 |
| `m6.cand_persistence_sha256`、`m6.native_sha256` | 64 位小写十六进制；两包原生文件均须匹配同一授权值，否则在探针启动前停止 |
| `m6.w42_source`、`m6.w42_zip_sha256`、`m6.w42_manifest_sha256`、`m6.w42_persistence_sha256` | 分别与代码中的 WIN7-42 完整钉相等 |
| 其余 SHA 字段 | runtime、四件输入、Python、Git、六件夹具均为 64 位小写十六进制 |
| 请求 `authority_sha256` | 等于负责人确认的授权原文件 SHA；生成、消费和前序账本逐项比对 |

所有授权哈希拒绝全同字符、全零、非十六进制和重复模式。重复模式指周期不超过字段半长，末尾可为不完整重复。长度错误和大写也拒绝。manifest 中的 source 与候选编号须匹配授权。

代码不再独立固定最终候选身份，授权填错仍可能签入错误字节。这是放弃的一项独立复核。补偿措施是请求绑定授权原文件 SHA，以及 R2 预检：建任务前，用候选自带 `electron.exe` 的 Node 模式只读调用固定编排器的 `inspectCandidate` 与 `verifyManifestTree`。预检核对授权身份和 manifest 完整树，经 `original-fs` 读取；失败即停。新 R2 材料在候选冻结后形成，本轮没有生成或执行。r7 原字节保留且作废，不继承候选、run、期限或预算。

请求闭集、顺序及预算：`m4 → m1 → m2 → m3 → m6 → m5`，共6次、总墙钟9000秒（ADR-0278自7200秒修订）、每请求开始前有效期≤900秒、负责人窗口≤8小时。“≤900秒”是请求生成到消费的有效期（任务书§7门A草案“逐组新TTL≤900秒”，请求模块`a9-alpha2-supplement-request.cjs`的生成与消费校验），不是单个请求的执行时长上限；执行时长由总墙钟9000秒、授权截止和各Stage超时共同限制。M5请求开始时总墙钟剩余须≥3600秒，否则不启动M5并记NOT_PERFORMED。该门须容纳M5请求内全部阶段上限：材料门与条件诊断≤240秒、rehearsal≤600秒、main≤1800秒、扫描与回收≤600秒，合计3240秒，另留360秒给材料核对与复核；各阶段上限不因剩余时间压缩。M6放在付费真实服务组之前。没有自动重跑预算。每个请求先写CONSUMED，不覆盖；前组须有同run/包/phase且SHA匹配的PASS结果。重复、并发锁、超时、改输入/报告、错目标或HALTED均拒绝。CONSUMED原文另存后才更新COMPLETED；任何非PASS结果产生HALTED，未知生命周期不自动清理或继续。

目标材料须准确绑定机器/SID/session、Medium、非提升、InJob=false。只读配置观察曾为DCCS-CHAIZL-PC、agent SID `S-1-5-21-1708701742-428676696-1831205153-1001`、console5；实际token准入仍由当前桌面进程直接检查，不能沿用旧run的console2。Node执行器另核对自己的SID/Session/完整性/机器。管理员SSH只按准确批准传输、固定调度和回收，不作为普通用户产品结果。

批准后桌面入口逐组调用哈希绑定编排的`--issue`入口，只生成当前组的新短效请求；校验前组PASS、账本与时限后才创建，禁止预制后续请求。请求生成后立即调用`--run`消费。桌面入口形式如下，所有占位值仅为参数说明，不是可执行授权材料：

```powershell
powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -File <new-run>\inputs\a9-alpha2-supplement-desktop.ps1 -AuthorityFile <new-run>\inputs\authority.json -AuthoritySha256 <owner-confirmed-sha256> -Phase m4
```

`-ExecutionPolicy Bypass`只作用于该PowerShell进程，不修改机器或用户的执行策略。Win7默认策略拒绝运行未签名脚本，目标机第一次尝试因此被阻断。目标机第二次尝试在`--issue`写出路径时发生EPIPE（node写标准输出时管道已断），桌面入口随后抛出`A9_36_REQUEST_ISSUE_FAILED`。根因是未在目标机证实的假设：`electron.exe`是GUI子系统程序，用`&`调用并赋值捕获时，PowerShell不等待它，也不为它保持标准输出管道。桌面入口因此改用.NET `Process`启动`electron.exe`：重定向两路输出并按UTF-8解码，等待进程退出，再把输出原样按UTF-8字节写回自己的标准输出和标准错误。该写法在目标机的运行结果为`NOT_PERFORMED`。

本文件不授予创建计划任务、目录、传输、运行或删除权限；这些目标动作将在准确执行包中逐项列明。未形成真实工具哈希与实际运行时检查前，不称可进入正式产品验收。

## 3. Stage计划与断言

一个Stage是一次driver启动：独立的数据根、工作区、profile和夹具请求日志。带`reuse`的Stage在同一数据根上重启产品，继续前一Stage留下的事实。组内Stage按表顺序运行，首个非PASS的Stage使整组停止，后续Stage不启动。`STAGE_PLAN`是闭集。一致性由三处各自保证：driver启动时核对自己的模式表键与内部模式列表（不一致抛`A9_36_SUPPLEMENT_MODE_TABLE`，不读取`STAGE_PLAN`）；合同测试逐Stage核对`STAGE_PLAN`的模式、断言id与driver函数文本，并检查Stage函数顶层没有无条件`return`/`throw`（启发式，不证明控制流可达）；编排器收到driver结果后核对该Stage的断言id恰好各一次且全部PASS。

| 组 | Stage（driver模式） | 断言id（`<组>-A<nn>`） | 数据根 |
|---|---|---|---|
| m4 | main（`supplement_continue_schema`） | A2-M4-CONTINUE-SCHEMA-A01～A03 | 夹具种子 |
| m1 | main（`supplement_policy_git`） | A2-M1-POLICY-GIT-A01～A11 | 夹具种子，Git工作区加本地裸`origin` |
| m2 | main（`supplement_verification`） | A2-M2-VERIFICATION-A01～A06 | 夹具种子 |
| m2 | audit_output（`supplement_audit_output`） | A2-M2-VERIFICATION-A07 | 新夹具种子 |
| m2 | audit_managed（`supplement_audit_managed`） | A2-M2-VERIFICATION-A08 | 新夹具种子 |
| m2 | audit_ownership（`supplement_audit_ownership`） | A2-M2-VERIFICATION-A09 | 新夹具种子 |
| m2 | continue（`supplement_continue`） | A2-M2-VERIFICATION-A10、A11 | 新夹具种子 |
| m2 | budget（`supplement_budget`，`reuse: continue`） | A2-M2-VERIFICATION-A12、A13 | 同continue数据根，预算16000字符 |
| m3 | main（`supplement_review`） | A2-M3-REVIEW-A01～A10 | 夹具种子 |
| m3 | restart（`supplement_review_restart`，`reuse: main`） | A2-M3-REVIEW-A11 | 同main数据根；读main留下的`a2-m3-end-state.json` |
| m6 | 无driver；编排器逐场景启动探针 | A2-M6-PERSISTENCE-A01～A05 | 每场景夹具副本 |
| m5 | rehearsal（`supplement_provider_guard`） | A2-M5-JOURNEY-A06 | 夹具种子，夹具Provider |
| m5 | main（`supplement_real_model`） | A2-M5-JOURNEY-A01～A05 | 旅程种子，真实服务 |

Stage PASS需同时满足：driver状态`DONE`、断言id与该Stage的闭集完全一致且各出现一次、全部PASS、进程退出码0、无超时终止或启动错误、完整进程查询无失败且无相关残留。组PASS需要全部Stage按序PASS。

### 3.1 逐断言内容

| 断言 | 内容 | 证据层级与边界 |
|---|---|---|
| M4-A01～A03 | 17种可达`continueTask`非法身份/revision逐项Schema拒绝；Provider/四表内容摘要/工作区无变化；Renderer无raw IPC/进程暴露 | 不可由公开API构造的错schema/action/额外字段仍是开发机边界。新小数据根，不声称全盘零副作用 |
| M1-A01 | 原W42的19条命令原文（含270000字符段）交替经`shell`/`start_process`，准确绑定后拒绝，零`tool_start`；Git绑定的`remote`/`branch`为`origin`/`main`（第17条整条命令摘要绑定，无remote/branch）；本地裸`origin`的`for-each-ref`在19条前后相同且等于初始`main`提交；本地`main`比`origin/main`多1个未推送提交，19条前后该提交与差值不变（真正执行的push会移动`origin`的ref，被检出） | 无外部remote。POSIX文本只证明分类/批准，不证明POSIX执行 |
| M1-A02 | Read Only分别收发write/shell/start_process，按call_id绑定不可用回执，零`tool_start`/`tool_end`，文件不变 | |
| M1-A03 | 错摘要、错会话的批准被拒，请求数不变，文件不变，原批准仍待决 | |
| M1-A04 | 同目标新批准才执行重置，文件恢复 | |
| M1-A05 | 真实status/diff/add与目标绑定批准的本地commit，最后提交主题为`A2-local` | |
| M1-A06 | 产品内显式选择CMD（文件选择对话框按用途应答：目录选择给工作区，Shell可执行文件选择给`System32\cmd.exe`，其他用途抛`A9_36_UNEXPECTED_OPEN_DIALOG`），先确认配置结果为`cmd`再做本地commit，退出码0；配置失败时记录FAIL并停止Stage | 显式CMD不等于PowerShell缺失时自动fallback，后者`NOT_PERFORMED` |
| M1-A07 | 本地分支：列分支、切换、add、批准的本地commit；前后`HEAD`、分支、索引、文件、进程均核对；`main`与`origin/main`不动；无新进程 | 无外部push |
| M1-A08 | 显式CMD下运行测试类命令：运行前driver把`probe.txt`置为`value test`（`check.py`只在内容以`value `开头时退出0），v3输出帧、顺序、退出码与Turn结束一致 | |
| M1-A09 | 构建类命令流式输出中取消：取消前至少2帧，取消后无新帧，Turn终态为取消，进程树无新增残留，进程查询无失败 | |
| M1-A10 | 超过200字符的命令的批准卡在1366×768：完整命令绑定、DOM摘要含完整命令、`cwd`显示可解析到工作区、摘要未被样式截断、按钮在视口内、截图留存 | 观察1366×768，不外推到其他尺寸 |
| M1-A11 | [C]包内Policy引擎对17条F-01写法在Full Access下求值，全部`allow`（`POLICY_FULL_ACCESS_ALLOWED`），2条正控仍要求批准，求值前后`tool_start`计数不变 | 组件级；不证明包装写法会弹出确认。登记的已知限制见ADR-0239。Review与Workspace Write模式`UNKNOWN` |
| M2-A01 | 五轮验证状态：未验证、结构化成功、再变更失效、大失败输出、`start_process`后失效 | |
| M2-A02 | 七种Provider结束边界（`tool_calls`、缺失、`length`、`content_filter`、`stop`、空流、坏JSON）：仅`tool_calls`写文件 | 夹具HTTP只供确定性测试，不能代替M5 |
| M2-A03 | 两个新会话的规则标记与环境事实各出现1次 | |
| M2-A04 | 可达context错误只恢复一次，请求数+2 | 不可压缩预算延期 |
| M2-A05 | `edit`的`tool_start`写入失败：文件不变，后续提交被拒，后续零派发 | |
| M2-A06 | 请求体中的AGENTS.md与磁盘一致（SHA256+包含性），系统提示词在多次请求中同一SHA256 | 只记哈希，不记请求体 |
| M2-A07 | 触发器令shell的`tool_output`写入失败（硬停）：Turn不完成，后续提交返回`A9_AUDIT_PERSISTENCE_FAILED`，无后续派发；对已中断任务点击继续两次（两个revision）均返回同码，请求、事件、回合、`tool_start`数均不增 | 审计失败后的主动继续只在本断言取证 |
| M2-A08 | 触发器令`start_process`的托管输出帧写入失败：活动Turn被中止，后续提交同上返回审计失败码，最终回答被扣留的请求不再产生后续派发。Turn在`start_process`后等待`settle.py`（哨兵文件加3秒宽限）并叠加2500ms最终回答延迟，使Turn在输出帧到达时仍活动 | |
| M2-A09 | 触发器令`managed_process_ownership`写入失败：同上，第二个工具不执行 | |
| M2-A10 | 已中断任务、`AGENTS.md`在中断后改写、Provider注入401：点击继续一次，新循环请求含新规则标记（旧标记不在内）、环境1次、系统提示词SHA256等于基线、原目标进入提示词；请求未超预算；失败后任务仍可继续（新`interruptedTurnId`与revision） | |
| M2-A11 | 同一任务：失败后等待3秒请求数不增（无自动重试）；Provider恢复后再点一次，请求数+新Turn，`continue`事件数正确，旧`interruptedTurnId`被引用；对旧revision重复提交返回`duplicate`且零请求、零新事件 | |
| M2-A12 | 保存的预算为16000字符（重启后快照读回），AGENTS.md填满后点击继续：零Provider请求，`turn_failed`携带`A9_CONTEXT_BUDGET_EXCEEDED`、`budgetChars=16000`、`estimatedChars>16000`，任务仍可继续 | 预算由数据根配置设定，不改产品 |
| M2-A13 | 同条件第二次点击仍零请求；缩小AGENTS.md后第三次点击发出一次请求，请求字符数≤16000，Turn结束 | |
| M3-A01 | 按轮真实Diff与UI | |
| M3-A02 | 延迟撤销可撤回，字节不变 | |
| M3-A03 | 逐文件撤销：普通撤销在5秒倒计时后自行执行；“确认撤销”按钮只在产品要求确认（崩溃后基线核对）时出现，driver只在它真实出现时点击 | |
| M3-A04 | 外部漂移保留并列入`driftReasons` | |
| M3-A05 | `shell`/`start_process`新建文件进入checkpoint并撤销；Turn在`start_process`后等待`settle.py`，使后台写入先于产品收集 | 产品只在`shell`/`start_process`调用后收集外部变更，最终回答不触发收集 |
| M3-A06 | 后续轮`later_turn`保护、整轮撤销、恢复目录排除文件 | 重启后零重放见M3-A11 |
| M3-A07 | Shell改写已有文件：记录B0、B1、B2；B1≠B0，Diff含该文件；逐文件撤销的响应无错误、列出该文件为已恢复，且撤销后该文件字节=B0、另一文件仍为B1（整轮撤销之前取证）；整轮撤销后B2=B0 | 所有撤销响应的`outcome.errors`必须为空，每个文件必须被某次撤销列为已恢复 |
| M3-A08 | 续跑回合：主动继续后的新回合改文件，checkpoint属于新回合而非旧回合，撤销后字节恢复 | |
| M3-A09 | `start_process`改写已有文件：B0、B1、B2同上；Turn在`start_process`后等待`settle.py`确认文件内容为`bg1`再继续 | 夹具脚本以字节写入，不受Windows文本换行转换影响 |
| M3-A10 | 后台晚写：回合结束、Diff显示后，后台进程再写得到B_late≠B1；撤销后文件字节保持B_late，路径列入`driftReasons`，工作区其余文件不变 | ADR-0243。界面文案只观察，原需求无逐字文案 |
| M3-A11 | 同旅程重启：在main的数据根上重启产品，启动与3秒等待后Provider请求数为0；Turn/工具开始/批准/checkpoint/托管进程计数与main结束时相同；工作区文件与main结束时相同；首个Turn的Diff仍可读且文件集相同；对已撤销的首个Turn再撤销只返回“此前已撤销”、无错误无漂移、文件不变；之后新Turn正常完成 | 对应M3-05“涉及重启的同一旅程复核零重放”；重启零请求另见WIN7-45 E03/E06 |
| M6-A01～A05 | 见§5 | 组件级 |
| M5-A06 | 夹具Provider：后台进程存活时配置变更被拒（`A9_PROVIDER_MANAGED_ACTIVE`），进程、Provider配置、请求数均不变 | 真实服务组的前置演练，不使用真实服务 |
| M5-A01 | 产品从隔离数据恢复DPAPI，配置匹配；恢复的配置不含探测记录，页面在首个Turn前经自己的探测控件探测一次（真实请求，计入40次），分类须为`tool_calling` | 复制配置只重建白名单非秘密字段（接受产品保存的`updatedAt`，不复制它和`probe`） |
| M5-A02 | J1：核对实际read路径AGENTS/README/calc.py、产品行号格式/完整行数/源SHA及最终回答中`calc.py:1`/`calc.py:2`实际代码行和加减法缺陷说明；无写入类工具 | J1提示另要求：全文每次出现源码`文件:行号`引用都附完整原行（ADR-0278）；判据不变 |
| M5-A03 | J2：相同cwd的准确`python test_calc.py`工具start/end绑定证明先红后绿，种子测试不改，`verified` | |
| M5-A04 | J3：三文件新功能与4+测试、准确`python build.py`、不可改`acceptance_check.py`的真实功能检查、UI Diff；请求≤40次、TLS全部authorized | |
| M5-A05 | 真实请求的系统提示词体按SHA256逐请求取证：同一模型、同一哈希，且与候选`core/dist/system-prompt.js`的版本常量一同记录 | 只记哈希；版本常量不能区分两个提示词体，哈希可以 |

## 4. 注入方法与夹具

所有方法只作用于新建的隔离数据根，不改产品、不改用户数据库。

| 项 | 方法 |
|---|---|
| 审计写入失败（M2-A05、A07～A09） | 在隔离数据库建SQLite触发器：`BEFORE INSERT ON a9_events WHEN <条件> BEGIN SELECT RAISE(FAIL, …)`。条件分别为`tool_start`且`$.data.toolName='edit'`；`tool_output`且`toolName='shell'`；`tool_output`且`toolName='start_process'`；`managed_process_ownership`。断言结束后`DROP TRIGGER`。故障持续到产品重启 |
| 已中断任务 | 以A9-32生命周期测试相同的行写入`insertInterruptedTask`（任务、回合、会话请求事件）；目标文本用夹具可识别的提示词。重载页面后卡片出现。该任务是注入事实，不是真实崩溃 |
| Provider失败 | 夹具HTTP的`providerFail`状态返回401，只对非探针请求生效；恢复后清除 |
| 规则变更 | 直接改隔离工作区`AGENTS.md`；夹具读该文件求SHA256并判请求体是否包含其内容 |
| 预算 | 在隔离数据根写入保存的16000字符预算配置，产品重启后读回；`AGENTS.md`填至约24000字符使请求超预算；产品代码不改 |
| 后台晚写 | `late_write.py`最多等待约160秒的`late.go`，出现后写`late_target.txt`；driver在Diff显示后创建`late.go` |
| 后台效应先于收集 | 产品只在`shell`/`start_process`调用之后收集外部变更。`a2-ext:bg`、`a2-review:3`、`a2-audit-managed`在`start_process`之后增加一个前台`python settle.py <文件> [内容|-] [宽限秒]`步骤（最多等20秒，超时退出1），确认后台写入已落盘再让产品收集 |
| 最终回答延迟 | 夹具在`a2-audit-managed`的最终回答前再等待2500ms，使Turn在托管输出帧到达时仍活动 |
| 字节写入 | 夹具Python脚本用`write_bytes`写文件；Windows上`Path.write_text('…\n')`会转为CRLF，与Stage中的精确LF比较不符 |
| Git隔离 | 设置与Stage子进程不继承`GIT_*`环境变量，`GIT_CONFIG_NOSYSTEM=1`，`HOME`与`XDG_CONFIG_HOME`指向Stage内目录，`GIT_CONFIG_GLOBAL`指向Stage内的空文件（继承的`XDG_CONFIG_HOME`不再被读取）；本地`main`比`origin/main`多一个未推送提交 |
| 夹具请求日志 | 每个Stage一个`fixture-requests.jsonl`：请求序号、提示词、规则标记、环境事实、字符数、系统提示词SHA256、AGENTS.md SHA256与包含性、工具消息数。不记录请求体 |

## 5. M6：升级与回退的持久层互读（组件级）

M6不启动GUI，不启动helper，不触碰用户原数据库。编排器对每个场景把夹具复制到独立数据根，用对应包内`electron.exe`（`ELECTRON_RUN_AS_NODE=1`）运行本文件`--m6-probe`子命令，加载该包内持久层与better-sqlite3，打开副本。

- 场景：S1～S6为正常互读（F42/WIN7-42、FCandC/WIN7-54、F42/WIN7-54、FCandC/WIN7-42、FCandN/WIN7-42、FCandN/WIN7-54）；X1～X4为损坏副本（C42、CCand各由两个版本打开一次）。
- 正常场景按固定顺序调用13项接口：11项读取与2项状态修改（`markInterruptionsOnRestart`、`enforceRetention`，后者传入固定`now`）。损坏场景只记录打开状态、打开前后主文件SHA256与目录清单，不调用接口。
- `now`固定为`2026-10-16T12:00:00.000Z`，由authority的`m6.now`绑定；请求模块拒绝其他值。运行时生成的时间戳与自增ID只出现在`env`部分。
- 开发机生成：`m6-fixtures`在新目录生成五个夹具（拒绝覆盖），`m6-baseline`对同一批夹具跑全部十个场景两轮，两轮一致才写出`baseline.json`。夹具字节在不同次生成间不同，因此夹具与基线必须作为同一批固定并逐个记录SHA256（见A9-36 §10）。
- 比较：`business`逐字段比较（键排序后的规范化JSON）；`env`只核对Node 16.17.1、Electron 22.3.27、ABI 110、win32、x64。
- 基线绑定：探针运行前先核对`baseline.json`自身的固定时钟、五个夹具SHA256、两个持久层SHA256与十个场景名，不符即抛`A9_36_M6_BASELINE_BINDING`。
- 时限：每个探针的超时取90秒、授权截止前剩余时间、总墙钟（自第1个请求起算）剩余时间的最小值；剩余不足1秒不再启动下一个场景。残留进程查询之后再判一次时限：授权截止或总墙钟已过的组记FAIL（`deadline_exceeded`），即使十个探针都已正常结束。必要的残留查询照常执行。

| 断言 | 内容 |
|---|---|
| A2-M6-PERSISTENCE-A01 | S1～S6全部`ready`，每个场景13项调用按固定标签顺序全部成功，共78项 |
| A2-M6-PERSISTENCE-A02 | S1～S6的`business`与基线逐字段相同 |
| A2-M6-PERSISTENCE-A03 | X1～X4全部为`diagnostics`、无manager、主文件字节不变，且与基线相同 |
| A2-M6-PERSISTENCE-A04 | 十个场景的`env`等于目标运行时；夹具前后字节不变；两个包的ZIP、manifest、全部manifest文件、`electron.exe`、持久层与原生模块哈希等于钉住值 |
| A2-M6-PERSISTENCE-A05 | R-1（句柄`h2`的`cleanupRequired`在WIN7-42读出`false`）与R-2（续跑任务目标读出续跑提示词）在目标机与基线相同 |

M6通过只证明两版持久层在Win7运行时上互读夹具的行为。不含备份生成、完整产品启动、真实进程接管、DPAPI；R-1接管后果与R-2是否进入模型上下文仍`UNKNOWN`。本方案不调用恢复入口，不按夹具PID接管或终止进程，夹具里的句柄只是数据库记录。

## 6. 真实服务组（M5）

M5只复制经校验的非秘密配置和DPAPI密文到新数据根，不复制用户数据库或草稿。产品safeStorage还依赖profile的DPAPI包封密钥，因此另在main启动前预置只含`os_crypt.encrypted_key`密文字段的最小Local State（ADR-0269）；材料来源与读取例外以当轮获准的执行材料为准。源保存配置必须无代理、无自定义CA/Headers且URL/模型匹配；变化即停，另行确认准确配置。密文不回传本机。密钥只由同agent账户内的产品safeStorage恢复，驱动只取可用性和来源，不调用解密API、不记录凭据值。

恢复的配置不含探测记录，M5-A01在首个Turn前经页面探测控件探测一次，其请求同样经过下述计数旁路。真实请求旁路仅计数与限制，保留原`https.request`/TLS验证，拒绝自定义CA/agent/checkServerIdentity和其他目标；最多40次HTTPS请求、累计原始响应体≤8388608字节（单个SSE帧缓冲仍≤1048576字节）、3次用户Turn。超限中断并FAIL。累计上限由ADR-0278自1048576字节修订，依据是WIN7-54 DEV run d951c847的实测累计1983647字节。该字节上限不等于供应商计费额度或最大生成token保证，成本以实际服务为准。旁路对请求体只计算系统消息的SHA256与长度，不保存或记录请求体。

同一HTTPS `api.deepseek.com`/`deepseek-v4-flash`。不可用、能力不足、模型未完成或断言不符均保留FAIL/NOT_PERFORMED，不换回放模型冒充。

验收环境（ADR-0278）：Python用登记的CPython 3.8.10嵌入式闭包（ZIP `abbe314e…`）在本轮根内的副本，并为本轮生成`python38._pth`（`python38.zip`、`.`、main工作区绝对路径三行，UTF-8无BOM、CRLF）；不读不改共享解释器。启动进程的环境不得含`PYTHONIOENCODING`或`PYTHONUTF8`，否则停止。M5启动时距下一个UTC 00:00须至少3900秒。

工作区编码配置（ADR-0278）：

- J1前，产品Shell须为`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`，记录其SHA，工作区环境覆盖为空。
- 经产品公开`configureShell`把工作区环境覆盖设为仅`PYTHONIOENCODING=utf-8`；设置后覆盖键恰为该一项，Shell路径与SHA与设置前相同。
- 恢复条件：三个Turn均为completed；每个Shell工具的start与end成对、状态exited、未超时、进程树已回收；无工具错误；页面空闲，无运行中Turn、无待批准、托管进程均已结束且无需清理。满足后把覆盖恢复为空，恢复后覆盖为空、Shell路径与SHA与设置前相同。
- 证据：main Stage目录的`a2-m5-encoding.json`，含设置前/设置后/恢复后的Shell事实与覆盖键、完成的Turn数、恢复门结果与状态。
- M5的PASS另须该证据状态为PASS且恢复为PASS；设置、恢复或任一条件未通过即FAIL。
- 本轮不另测Python标准流编码，沿用DEV run cd904535对同一配置的直接测量（stdout/stderr均为utf-8），证据层级写为继承。该配置是用户可用的公开设置，不是产品默认行为，见KL-14。

## 7. 回传、复核与失败保护

每组新证据目录为`evidence\<phase>`：Stage子目录保存`driver-result.json`、`fixture-requests.jsonl`、断言事实与截图；M6保存`probes\<场景>.json`；组根保存`phase-result.json`。另有原始请求、身份、账本及进程查询；成功或失败均绑定哈希。driver退出前保存进程树和查询错误，查询失败不写零残留。运行外层超时按Stage上限、总预算、批准截止的最小值停止，不能延长等待替代修复。任何身份、完整性、安全、必需审计或未知生命周期失败停止其依赖下游；保留首次原始输出和CONSUMED，不恢复旧run。

回传范围限`evidence`、请求/身份、账本及输入摘要。不要复制`work/*/data`、vault或加密配置。先保存原始事实，再做秘密扫描正控、文件大小/SHA闭包核对及独立复核；未完成回收与扫描时，产品组PASS不等于正式验收通过。原KL-12 P1/NOT_PERFORMED及其他已披露限制继续携带，完整Alpha2/RC、门B、ADR-0155和A9-32签发仍由准确范围与负责人裁决决定。

## 8. 本地检查与目标能力边界

在实际Node环境先运行语法、合同与反例检查：错批准pin/字段/目标、过期、重复消费、并发锁、前组改报告、少断言/错断言/UNKNOWN/超时、真实preload负例及正向边界、原19形态摘要、隔离种子真实Python红绿、密文复制不覆盖、真实HTTPS旁路的TLS/请求/响应预算反例，以及每个新断言判据的纯函数正反例、F-01语料对仓库Policy引擎的求值、M6机制（用仓库状态dist作为W42/cand两侧读取器，证据为 SURROGATE）。依赖输出先构建，检查消费者加载当前输出。

实际Win7 Electron/PowerShell解析、token准入、SQLite加载、HTTPS/DPAPI、六组真实行为及Electron驱动的各Stage必须在获准新目标材料下执行。开发机无法替代的项保持`NOT_PERFORMED`；不因本地语法通过省掉目标能力门。开发机是macOS，不能运行Electron，因此各Stage的driver代码只经纯判据函数、语法/静态检查、合同测试与独立审核验证，没有端到端运行。

已知限制：

- 预算重启读回以保存的16000字符配置经快照读回为证，不单独模拟配置界面。
- Stage的截止与启动：Stage在首次写入前、以及准备完成后紧邻启动driver时，各算一次窗口（授权截止与总墙钟二者较小者）；不足1秒（含截止时间无法解析）则不启动（`A9_36_WINDOW_EXHAUSTED`），启动超时取准备之后剩余的窗口；残留进程查询之后窗口已耗尽的Stage记FAIL。启动被拒绝（Promise拒绝）时仍查询残留，原错误保留；残留查询本身失败记为`failed`，不算干净。
- 撤销结果的路径按等值匹配：路径本身，或路径加检查点管理器写入的五种说明之一（`(此前已撤销，未重复执行)`、`(已移除新建文件)`、`(检测到此前已完成恢复)`、`(已恢复原始目录)`、`(已恢复原始版本)`），合同测试逐条核对这五种说明与`checkpoint-manager.ts`一致；`ext_shell.txt.evil (…)`、`ext_shell.txt (other).txt (…)`之类不算恢复了`ext_shell.txt`；判为无漂移的撤销响应必须同时带有`driftReasons`与`outcome.drifted`且均为空数组，缺字段不算无漂移。
- M3-A11的“零重放”以重启窗口内的请求数、计数与文件为证；“零请求”不含Provider探测请求（编排器排除探测），不能解释为零HTTP请求；main结束时的状态由main写入的`a2-m3-end-state.json`提供，不是产品自带的重启前快照。
- 隔离的物理位置：编排器在首次创建、复制或写入之前，对`evidence/<组>`、`work/<组>`、各Stage目录（含`profile-local`、`profile-roaming`、`temp`、`profile-home`，reuse Stage也检查）和M6目录逐级检查：已存在的每一级必须是真实目录（不是符号链接或Junction、不是普通文件）且解析后在run根内（`A9_36_PATH_LINK`、`A9_36_PATH_NOT_DIRECTORY`、`A9_36_PATH_OUTSIDE_RUN_ROOT`）；空的全局Git配置文件`gitconfig-empty`必须是普通文件且长度为0（`A9_36_GIT_CONFIG_NOT_EMPTY`）；driver启动后再对`userData`、数据根、工作区解析一次（`A9_36_USERDATA_NOT_ISOLATED`）；Git`HOME`隔离不改变产品对`USERPROFILE`的使用。
- 已中断任务是注入的数据库事实；真实崩溃恢复沿用WIN7-45的直接证据。
- 预演（M5-A06）使用夹具Provider，不覆盖真实服务的配置变更。
- 审计失败后的主动继续只在M2-A07取证，M2-A08与A09不重复。
- M4四表序列化结果限1000行/1MiB，但限制在取行之后，仍保留读取峰值P2；该驱动只用于新受控数据根，不能应用到未知大数据库。
- KL-14（ADR-0278）：实测（WIN7-54，DEV run 128e19fb与cd904535）：隔离CPython 3.8.10在该目标上stdout/stderr为gbk；`python test_calc.py`的241字节stderr被产品判为`A9_OUTPUT_ENCODING_ERROR`，文本投影为空并标`truncated`；设置`PYTHONIOENCODING=utf-8`后同一命令输出完整可读。推断：触发内容为含中文路径的Traceback，未解码核实；其他Python安装与其他子进程未测，UNKNOWN。M5靠公开配置规避，产品默认行为未改。

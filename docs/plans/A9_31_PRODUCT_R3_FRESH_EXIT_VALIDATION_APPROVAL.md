# A9-31：停止终态夹具修复后的新隔离根续验

日期：2026-10-04。Status: APPROVED_FOR_R3_FRESH_EXIT_VALIDATION。负责人回复“批准”，绑定原§1–3及原文SHA256 bb2d76a525a53c11216ba887230c71b0c648fef7d0556bd259ae2524d5279269；不可变原文及owner记录存product-r3-retry-r3。以下保留批准时点范围，执行结果另记。

## 依据、已完成工作与不能恢复的入口

工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`，HEAD `ebda91123e62b225c3fd104c9c9b564a4b61c466`。产品ZIP SHA256 `d951a89af285c4e60c5f4701efbfd54f34627fe103d8257c83636479f82ac74b`，manifest `0060fffff80335d48abd75e2bb784106114af7cca92db0b98e40ad8a65357a68`；产品与native字节不改。

R2前五phase及专用ready反例已有准确当前源证据。两个StopExit超时FAIL保留；第三个最短run `f3158d545b6146da986b64bf74e092f5`取得真实原生response=0、实际will-quit/main exit0，但夹具错误从ownership事件读取不存在的lastProbeStatus，触发STOP_PERSISTED_TERMINAL断言。真实只读SQLite integrity=ok，准确当前handle表终态stopped；该失败是夹具语义错误，不改判原FAIL。控制器和dispatcher均HALTED，245个持有实例全部真实退出，无unresolved/drain错误；当前PID56400已不存在，不补签其历史exitCode。

既有R2四源授权内已修复正常关闭判据：Stop读取当前handle的a9_managed_processes终态，并核对workspace、PID、ownership；Release同时要求当前handle表released、准确同owner/request/releaseId的先intent后receipt事件，不能借用其他句柄。真实dialog API调用/选择回执和原错误保护保留；不注入选择、不延长120秒。冻结R2修复driver SHA256 `ec5736fe1556762c24dcf62e0e49d21aa79c796980e9a80d4d09ac0063c5ce83`，revision `3b0b61fa1c2aca9b8446d1eb4acb9f5c0485cad067687f6d08395bdc33152a37`；Win10 Node16语法/128自检/88同步回执及全闭包stage通过。目标Node16以逐hash返回的真实SQLite事实重放实际修复函数，原事件判据false、新当前终态判据true、移交不被推断，已通过；这不是新的普通StopExit PASS。

R2 master/入口及所有失败不可覆盖或重绑。既有launcher明确在存在dispatcher-entry/start/ready/final或stop时抛INTEGRITY_OLD_DISPATCHER_ENTRY。原R1–R2批准仅绑定准确R2根；因此新根另行具体批准，不恢复R2、旧r3/R1、历史r2或R10。

## 1. 同一产物与固定取证组件的新根

机器`192.168.1.4 / WIN-2JQ66JE4HTQ`。Administrator仅准备、固定请求发布、只读取证和回收；产品由`WIN-2JQ66JE4HTQ\a9builder`普通桌面Session3运行，SID1005、Medium8192、非提升、InJob=false直接核验。禁止管理员入口、计划任务、脱离Job或账户/系统/ACL/UAC/Bitvise改变。

准确新本地根：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r3-retry-r3`。

准确新远端根：`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R3`。必须原本不存在、无reparse，准备前≥2GiB空闲；根总量≤1GiB，每请求≥1GiB。只使用package/host/inputs/control/requests/runs/evidence及现有框架有界文件，继承权限；旧根只读保留。

只从原锁定本地r3 ZIP重新展开784文件、73文件host并逐hash核验，不重新生产产品、native或锁字节。固定capture源/DLL/MVID/build/原编译批准保持原字节：DLL `93f1979a8a8dbf87cf609d95f3b48ee17c7c3b37628f7cfd339cb`，MVID `29314b2e-7db0-4cd9-9654-23f9ed807361`，build `09fe18f933a08c08d28220d48a26cdbdae4f059faca53c9688dc5afbe9411305`。直接复制并确认字节、原来源及许可证，标INHERITED_EVIDENCE；不调用编译器、不改C#/API/clock/系统组件。新根重新检查实际查询/区间/精确UTC/schema与SYNC回执，产品/host/各输入直接做准入和后飞行。

## 2. 准确四源、不可变版本及普通八phase

获批后先在任务书登记以下准确C14四源，然后从现有已检查四源复制：

- `.acceptance/a9-31-developer/product-r3-retry-r3/control-scripts/stage-product-r3.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r3/control-scripts/launch-product-r3-desktop.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r3/control-scripts/serve-product-r3-desktop.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r3/control-scripts/product-r3-driver.cjs`

允许差异仅新根/批准/master绑定，以及已确认的正常最终判据/当前表终态与真实原生选择回执。新master和所有版本依新批准记录生成、冻结并独立核验；保留R2 master与每个旧版本。既有九字段请求、八phase、C#取证、持有句柄/关系/身份/安全/审计/关闭门、SYNC安全片段和全部预算不改。先实际Node16/PS5.1能力检查及checks/registration/stage，再进入普通桌面。

新窗口120分钟、最多16请求。继续原八phase合同：受控Boot失败/整树结束→正常Boot→后台最短→full Background→ready专用反例独立实例/完整返回→Shell→EncodingSecurity→FailureBoundaries→StopExit→ReleaseExit→Recovery。新根路径/执行绑定变化，按原框架重新完成八phase；不以R2通过替代本次新根普通运行。组件未变化的原生构建和已充分验证的独立静态检查继承，不重复双构建。

StopExit/ReleaseExit均使用真实原生对话框，负责人在明确出现信号后分别选择“停止后退出”/“留给系统后退出”；仍为120秒，不自动输入或模拟选择。当前表终态/原生真实回执、actual will-quit和独立全部持有进程exit同时成立才记普通PASS；Release另证明实际root/child移交时存活且最后自然exit0；Recovery证明实际exit93崩溃树结束及同源恢复，不重放工具/Provider。原预期ready负例保持精确专用版本、原全部安全断言、exit94、零下游派发/全返回后才复核EXPECTED_NEGATIVE_CASE_PASS，不能泛化。

普通输入若远控不能进入目标，沿用一次人工普通桌面启动；其余核验/派发/回收由代理执行。普通同范围夹具缺陷允许在上述准确四源内修复、实际运行时检查、冻结新不可变版本及有界重试，不重复请求同范围批准；两次同类失败先停止整批重试并最小诊断。身份/完整性/安全/必需审计/未知生命周期立即停止下游；HALTED入口不恢复，本材料不授权第四个新根或其他范围。

## 3. 回收、结论与保护

按既有完整inventory、逐size/SHA回收和秘密扫描，根≤1GiB、最多5000文件、runtime返回总量≤128MiB；可复用完整返回后只取已核验不变基线外的准确新增文件，不能遗漏或绕过exclusive lock。中间observer单文件1MiB保护保持；实际dispatcher final超过该上限时只通过已批准的完整SFTP回收路径取得原字节并核验，不提升observer阈值。最终全输入后飞行、普通身份和全部持有实际exit必须齐全，矩阵在现有r3统一报告/STATUS集中更新，保留所有首失败和历史索引。

不含提交/推送/合并/发布/删除、native/依赖/锁/C#或产品修改、子代理、独立收口/DEVELOPER_VERIFIED裁决、Win7或占用WIN7-43。全部工作区、历史dirty、旧包/候选/证据/数据库/锁保留，不把开发Win10通过升级为Win7兼容或正式交付。

## 请求批准的依据

[A9-31任务书§6](../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)：“本任务后续源码提交、原生kit批准/双构建、远端新目录/写入、本地整合与候选门另行具体批准”。原R1–R2材料准确允许R2根，现HALTED；新R3目录/新四源/新master普通执行超出该准确范围。需要批准本材料§1–3后才执行新根；现有R2修复、检查和原始证据回收已在原授权内完成。不是skill新增审批或Auto Review拒绝。

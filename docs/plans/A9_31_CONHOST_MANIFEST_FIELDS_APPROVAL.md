# A9-31：conhost精确创建时间与映像补证

日期：2026-10-04。Status: APPROVED_FOR_MANIFEST_DIAGNOSTIC。负责人回复“批准”，绑定原§1–3及原文SHA256 1f61d8b26a935bca8925c4273bf146172c0546f8907e66dd93f9a4a7fac15171；原文与owner记录独立保留。本材料只补齐前轮诊断缺失的字段，不恢复R4、不批准普通第五根；原经典探针三次预算已经用完，本材料另授权最多三次manifest探针。

## 1. 已知事实与准确新增范围

沿用A9-31工作树、分支codex/a9-31-background-tools和source ebda91123e62b225c3fd104c9c9b564a4b61c466。前轮v3取得12 cmd/12 conhost完整事件，零丢失且停止；但经典ETW时间不等于OS创建FILETIME，镜像只保留basename。旧R4 HALTED和原conhost78648 UNKNOWN不改判。完整事实见[r3统一报告](../reports/2026-10/a9_31_product_r3_package_and_win10_execution_2026-10-04.md)。

批准后先登记C14/C15/C16，再仅新增两源：`.acceptance/a9-31-developer/product-r3-retry-r4/manifest-diagnostic-sources/conhost-manifest-probe.cs`和同目录`conhost-manifest-probe.ps1`。当前未创建或实现这些源。固定Win10 build19045/x64/PS5.1/CLR4、Framework64 csc及mscorlib/System/System.Core继续逐hash核验；不安装新工具。准确新远端证据目录为`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R4\evidence\conhost-manifest-diagnostic-r1`，创建前必须不存在且无reparse，继承权限，≤64文件/32MiB。

沿用原7个已登记ETW/TDH API，新增advapi32!EnableTraceEx2（启用目标provider）、tdh!TdhGetEventInformation（只读核验目标事件字段名称/类型/版本）、kernel32!QueryDosDeviceW（仅只读查询固定C:设备映射，转换目标完整映像路径）。不枚举其他盘符或设备。系统库必须等于前轮已核验版本/字节，否则停止；kernel32继续绑定原capture登记的10.0.19041.5915/783720bytes/SHA256 4636f65d449b1353100578c6cb139933cf2b134f5e246119d18968873a058bed。Profile为WIN10_TEST_ONLY_NOT_PRODUCT_NOT_WIN7_EVIDENCE。仅启用Microsoft-Windows-Kernel-Process provider `{22fb2cd6-0e7b-422b-a0c7-2fad1fd0e716}` 的Process Start/Stop；事件ID、version和类型必须被显式检查，未知schema停止。使用新自有普通实时会话`A9-A31-Conhost-Manifest-Diagnostic`，不能接管旧会话；不启用Analytic日志、不改变日志配置。

## 2. 有界诊断和可审核事实

192.168.1.4/WIN-2JQ66JE4HTQ，Administrator仅启动独立探针；a9builder权限及普通入口保持。最多3次独立60秒探针、每次最多12个锁定cmd `/d /c ver`，每调用5000ms；GUI宿主避免继承控制台，持有宿主和cmd的真实句柄，实际读取creation/session/exit。不得执行其他业务命令、恢复HALTED调度或强制结束其他进程。未知退出或会话停止失败立即停止，不批量重试。

事件只在内存有界消费、按本探针准确父实例和时间窗过滤；仅对目标读取CreateTime、ParentProcessID、SessionID、ImageName和End的CreateTime/ExitTime/ExitCode。无原始ETL、完整命令行、SID、其他进程字段或内核地址输出。非目标只累计丢弃计数；若目标筛选与隐私边界无法成立则不运行。停止准确自有句柄，检查EventsLost/LogBuffersLost/RealTimeBuffersLost均0、消费者结束及会话查询不存在。

候选proof schema v1（尚不能被普通控制器使用）：绑定source/run、机器与OS build、provider/event版本、探针和父进程PID+OS creation、目标PID+CreateTime、Session、完整映像、Start/End事件时间、ExitTime/ExitCode、采集会话和三项丢失/停止事实及源/二进制/hash/MVID。要求：

- cmd的CreateTime必须与持有句柄的OS FILETIME准确相等，ExitTime/ExitCode与实际自然退出一致；不得加容差、取事件头时间或填UNKNOWN后判PASS。
- conhost Start/Stop按同PID+准确CreateTime配对，父PID匹配唯一持有cmd实例；创建时间落在该父真实生命周期内，Session一致且End不可早于Start。
- ImageName须在当前系统实际提供完整路径并指向准确System32的cmd/conhost；设备路径只按本次QueryDosDeviceW取得的固定C:唯一映射和完整路径边界转换，再与锁定系统路径比较。映射不唯一、其他设备或只有basename均NOT_PROVEN。只读固定映像文件hash不能单独证明实际加载身份。
- 缺失/重复/错PID或CreateTime、父PID复用、错Session/映像、未知schema/截断、时间矛盾、未知exit/丢事件和停止失败全部拒绝。先实际最短链路，再回放定向反例；同类两轮失败先最小根因分析。

## 3. 收尾与下一授权边界

每版source/EXE/MVID/pin不可变，保留首失败；逐size/SHA完整回收、秘密扫描与准确会话/进程收尾核验，更新现有矩阵和r3报告。确认所需事实全部可得才形成控制器接入补丁范围及新普通执行合同；本材料不提前接受事件proof替代原句柄合同，不批准第五根、正式PASS或独立验收。

不含产品/native helper/Runner/State/固定capture/四控制脚本/SYNC修改、新产品包、依赖安装、ACL/账户/服务/注册表/日志配置改变、删除、提交/推送/发布、委派或Win7。原工作区、数据库、候选及证据保留，WIN7-43未占用。

## 资料依据与不确定性

Microsoft的[provider生成定义](https://github.com/microsoft/Tx/blob/master/Generated/Microsoft_Windows_Kernel_Process.cs)列出Start的CreateTime/ParentProcessID/SessionID/ImageName及Stop的CreateTime/ExitTime/ExitCode；这是选择诊断路径的依据，不证明当前19045的实际版本、时间相等或完整路径。新API使用边界见[EnableTraceEx2](https://learn.microsoft.com/en-us/windows/win32/api/evntrace/nf-evntrace-enabletraceex2)、[TdhGetEventInformation](https://learn.microsoft.com/en-us/windows/win32/api/tdh/nf-tdh-tdhgeteventinformation)和[QueryDosDeviceW](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-querydosdevicew)。ADR-0172保持Proposed；批准本诊断不自动接受普通验收模型变化。

## 已执行结果与交接

三次原生探针已完成：v1保留固定父字段偏移失败，v2按字段名读取后最短一组通过，v3扩展12 cmd/12 conhost直接通过。精确创建/退出FILETIME、Start完整系统映像、同PID+CreateTime的End及exit0/零丢失/session停止得到实证；Stop只含basename，未伪造完整路径。36项真实报告回放/反例及7项自检通过，26文件264909bytes完整回收，详情见[统一报告](../reports/2026-10/a9_31_product_r3_package_and_win10_execution_2026-10-04.md)和[handoff](../reports/2026-10/a9_31_manifest_diagnostic_handoff_2026-10-04.md)。本材料预算用完，不再原生重试；R5普通接入仍待其具体合同批准。

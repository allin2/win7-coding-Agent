# A9-31：短命conhost生命周期取证的最小诊断批准

日期：2026-10-04。Status: APPROVED_FOR_MINIMAL_DIAGNOSTIC。负责人回复“解决”，授权执行前述§1–3；批准原文SHA256 d624c814431d8321f9a6db04d007b65ff389e8f7d3b9c7edbff9038968346d80。仅诊断与可行性验证，不批准第五根或恢复R4。

## 事实与授权缺口

工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`，HEAD ebda91123e62b225c3fd104c9c9b564a4b61c466。R4 master471ff812d7f60e1da82ddb75da239777fa57228d4bf096d78e7f16e85216b2ad，受控Boot run6b881f58a34844398588576236cf4741。

当前实际cmd120740已持有并exit0，准确SYNC回执证明`cmd /d /c ver`及普通parent119160；其快照子conhost78648在OpenQuery前消失（原生错误87）。conhost的creation/session/image/exit仍UNKNOWN，不能由cmd退出推断。dispatcher8个持有实例均结束，但1个原观察未证明，HALTED保持。171文件8090749bytes完整回收零不符/零秘密，输入后飞行闭包通过。

固定capture的Toolhelp Row只提供PID/Parent/Exe和快照时间区间，创建身份与退出码靠之后OpenQuery获得，短命子进程已退出时无法补证。原SYNC安全合同准确限制cmd.exe，扩大到conhost会改变取证模型，超出[R4批准](A9_31_PRODUCT_R3_LATE_JOURNAL_R4_APPROVAL.md)不改C#/SYNC的范围。增加轮询或整批重试不能解决已失去的事实。

## 1. 准确隔离诊断源和构建

批准后在任务书与C15/C16先登记两源：

- `.acceptance/a9-31-developer/product-r3-retry-r4/diagnostic-sources/conhost-event-probe.cs`
- `.acceptance/a9-31-developer/product-r3-retry-r4/diagnostic-sources/conhost-event-probe.ps1`

允许独立Win10测试用C# ETW进程Start/End最小观察器；不修改固定capture源/DLL、四原控制脚本、产品、native helper、输入锁或历史候选。新组件Runtime Profile明确WIN10_TEST_ONLY_NOT_PRODUCT_NOT_WIN7_EVIDENCE，目标build19045、PS5.1/CLR4/x64；只用现有锁定Framework64 C#编译器和框架引用，编译前逐hash复核，独立冻结source/DLL/MVID/build登记。不安装外部工具/依赖，不借用旧capture编译批准。

准确新远端子目录`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R4\evidence\conhost-diagnostic-r1`；必须不存在、无reparse，继承现有权限，≤64文件/32MiB。本地同R4根独立诊断目录。旧R4 HALTED入口保持，不启动普通产品，不派发phase。

## 2. 一次有界真实探针及终止边界

机器192.168.1.4/WIN-2JQ66JE4HTQ；Administrator仅在此隔离探针启动临时ETW观察，不改变a9builder权限或产品入口。最多3次独立60秒以内最小探针，每次最多32个现有锁定`cmd /d /c ver`调用、5000ms调用预算；真实Process.Handle持有probe/root、自然退出，超过预算停止后续，未知如实保留。无真实业务命令。

目标先只读查询事件会话状态。只创建自有、固定名称`A9-A31-Conhost-Diagnostic`的临时会话；名称或所需kernel logger已被其他会话占用、现有API/权限不支持则fail closed，不停止、更新或接管其他会话，不修改注册表/服务/账户/ACL/UAC/日志配置。使用新建会话返回句柄证明所有权；finally仅停止此准确自有会话，核验已停止，失去所有权/停止无法确认立即记录失败，不继续重试。

仅采集进程Start/End所需内存事件，不输出原始系统ETL、完整命令行、其他用户进程/SID或内核地址；按准确probe父实例和时间范围过滤。其他进程事件仅累计丢弃计数。原始event用于唯一关联的字段在内存中核验，输出目标PID/父PID/Session/脱敏镜像/时间及退出状态，UniqueProcessKey只输出域内hash。buffer有界；EventsLost/LogBuffersLost/RealTimeBuffersLost非零或无法确认均不PASS。内核事件范围无法被上述界限控制时不启动。

## 3. 验证和后续结论

真实目标probe进程Start/End必须与持有句柄得到的PID/creation/Session/实际exit一致；准确cmd真实返回与事件相符。真实conhost Start/End须同一域内唯一实例，父链/Session/镜像/时序闭合，明确检查PID/key复用、重复/缺失/错父/乱序/截断/丢事件反例。缺失创建精度、父实例绑定或exit事实不得补写UNKNOWN或推断PASS。这是取得新证据渠道的可行性验证，不直接改判既有conhost78648或R4。

完成后逐size/SHA回收、秘密扫描、保留全部首失败/数据库/旧根，集中更新原r3报告/STATUS。如果事件API无法提供合同所需的事实，明确NOT_PROVEN，停止整批；若探针可行，先另行形成具体取证proof schema/ADR和新普通执行材料，再请求纳入控制器及第五根的批准。本材料不授权该纳入或续跑。

不含产品/native helper/Runner/State修改、依赖安装、持久系统配置、既有事件会话变更、删除、提交/推送/发布、强制终止其他进程、委派、独立验收或Win7；WIN7-43不占用。

## 官方资料与尚未实证的假设

Microsoft [Process_V2_TypeGroup1](https://learn.microsoft.com/en-us/windows/win32/etw/process-v2-typegroup1)定义进程Start/End、UniqueProcessKey、父PID、Session与ExitStatus，并明确PID复用风险。事件渠道可能提供短命进程事实，但创建时间精度、实际schema版本和父实例闭合仍须目标验证，不能由文档判PASS。

[StartTraceW](https://learn.microsoft.com/en-us/windows/win32/api/evntrace/nf-evntrace-starttracew)声明会话资源/权限及停止义务；[EVENT_TRACE_PROPERTIES](https://learn.microsoft.com/en-us/windows/win32/etw/event-trace-properties)提供事件/缓冲丢失计数。相关新API及权限范围必须按本材料先批准登记；批准原文与owner记录已独立保留，执行结果另记。

## 执行结果（2026-10-04）

已完成所批三次尝试及纯回放反例/完整回收。v3实际取得12 cmd/12 conhost Start/End和exit0、三项丢失0、自有会话停止；26项真实报告回放与反例通过。38文件427988bytes零size/hash不符，详见[r3统一报告](../reports/2026-10/a9_31_product_r3_package_and_win10_execution_2026-10-04.md)。OS创建时间与完整映像仍NOT_PROVEN，故不进入控制器或第五根。新增[manifest字段补证](A9_31_CONHOST_MANIFEST_FIELDS_APPROVAL.md)与ADR-0172为Proposed，不延长本材料已用完的原生预算。

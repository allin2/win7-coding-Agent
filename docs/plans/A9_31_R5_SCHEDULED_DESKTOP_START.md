# 无需人工输入PowerShell：R5普通桌面按需启动任务审批方案

状态：READY_FOR_OWNER_DECISION；计划任务注册/执行均 NOT_PERFORMED。此文件是可审阅提案，不是实现授权或实机PASS。

## 1. 成功条件

用户无需复制、粘贴或输入任何PowerShell命令，也无需回复“已启动”。代理通过严格SSH触发一个固定的Windows计划任务；启动成立以R5真实start/ready、SID/Session/Medium/非提升/noHostJob及准确master绑定为准。随后按原R5批准范围派发测试及回收证据。

## 2. 已核实输入

本轮只读连接已确认WIN-2JQ66JE4HTQ（192.168.1.4），A9 Builder console Session3 Active。执行查询的是Administrator/SID500/Session0，不是产品执行身份。Schedule.Service可读；根目录中名称匹配A9/CodingAgent的任务为空，\A9文件夹不存在；不推断其他目录没有任务。

R5启动器已部署，当前无dispatcher-start.json。启动器远端SHA与本地冻结源码一致：cb7a88b966b714254bd0960e7e048b2dbcb3ffee44cab2e70b67e233139b1bda。
master应从固定inputs\master-pin.json读取，准确SHA：54ffcf006e29b095b3566f455cb901b1d5c3773fa8bcb9b83a2612185719d8be。只读盘点首轮另探测的inputs\master-<SHA>.json不是实际文件名，返回不存在；这不是缺失实际master的结论。注册前须核对正确固定路径及完整R5闭包。

## 3. 一次设置的精确范围

建议批准新增一个根目录任务：\A9-A31-R5-Desktop-20261003。不存在才注册，不覆盖同名任务，不改其他任务。

执行主体：A9 Builder，准确SID S-1-5-21-3031939772-989444280-3099258187-1005。LogonType=InteractiveToken（只使用已登录交互会话）；RunLevel=LeastPrivilege。不保存密码、不启用自动登录、不使用SYSTEM或管理员运行产品。

唯一执行动作：C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe，参数固定为：

```text
-NoProfile -ExecutionPolicy Bypass -File "C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261003-R5\control\launch-product-r1-desktop.ps1" -PinSha256 54ffcf006e29b095b3566f455cb901b1d5c3773fa8bcb9b83a2612185719d8be
```

工作目录为准确R5 control目录。ExecutionPolicy参数仅本次进程沿用原批准入口，不修改持久策略。

仅按需运行，无登录触发、定时触发、自动重启。AllowStartOnDemand=true、MultipleInstances=IgnoreNew。任务不额外设置强制终止期限，保留原R5两小时/16请求和stop合同，不通过任务终止进程绕过退出证据。

新增工具面仅现有Task Scheduler 2.0 COM Schedule.Service的任务注册/读取/固定任务按需Run，来源Windows系统，测试范围仅Win10现有构建机。注册前记录OS和服务状态、导出的准确任务XML及SHA；用InteractiveToken/LeastPrivilege匹配官方文档。AGENTS.md C15/C16适用的新控制工具登记需在此准确方案获批后按治理要求追加，不修改Accepted ADR正文。

远端写入只包含这个准确任务配置以及既有R5批准证据目录中的新唯一schema1启动取证文件；不修改冻结PS、产品、master、账户、ACL、UAC、Bitvise、服务或旧证据。不授权提交、推送、合并、发布、Win7或改判UNKNOWN。

## 4. 验证和自动启动

1. 注册前检查任务确实不存在、准确R5闭包及master/launcher SHA匹配、A9 Builder已登录；如果旧R5已经启动、HALTED或过期则不再次启动本入口。
2. 注册后只读回读Principal、动作、参数、工作目录、触发器、重启和重复实例设置，逐项匹配提案并保存XML。
3. 通过SSH调用该准确任务Run，不经UU键盘。有限轮询读取实际start/ready、创建时间、PID与进程令牌；Task State或LastTaskResult不能单独当作桌面启动PASS。
4. 必须实测SID1005/Session3/Medium8192/非提升/noHostJob以及正确master。计划任务可能附加Job或产生不同启动环境，若不满足原门则方案FAIL，不改Job、提升权限或降级门绕过。
5. 只有通过原始身份/完整性/生命周期门才按R5八phase合同开始请求；失败停止下游并保存诊断，不让用户代输PowerShell。
6. 验证重复启动保护不创建第二控制器；验证原stop流程或原限定窗口自然退出的实际状态。保留注册任务，默认禁用须作为本次允许的回滚动作登记；不删除任务，删除另按逐项目确认规则。

若任务注册权限不足或不能取得符合原合同的普通桌面，则只报告这个具体失败及剩余诊断。该方案不保证用户退出登录或锁屏时仍能做真实可见UI验收。

## 5. 为什么需要一次设置授权

原R5合同只批准四测试源路径、准确目录部署和真实桌面入口，未批准新增计划任务；项目AGENTS.md §5要求系统配置修改“仅在任务书明确授权、可审计且可回滚时允许”。因此本轮已经完成只读盘点和准确方案，但尚未注册任务。批准本方案后由代理完成注册、启动和验证，用户无需执行命令；普通操作不重复求批。

这是当前R5的一次准确入口设置，不能自动接受未来新产品或冻结PS。未来入口变更仍需准确授权，但可以由代理更新已批准的执行目标，用户无需再手工输入命令。

## 6. 当前用户准确批准

2026-10-03，当前用户对本方案回复“批准”。批准快照 SHA-256 为 `e4dadd24c60210659c2bfb6c811ad5893352bcbea22cf2c33d1ecb6e0797646d`（准确完整值以本轮 owner-approval.json 为准）；本节不改变批准前正文。准入记录为 ADR-0163。批准覆盖准确任务注册、启动核验及失败禁用回滚，原 R5 测试合同继续适用；不得改变冻结脚本或恢复 HALTED 入口。实际执行证据写在主工作区 `.acceptance/manual-intervention-solution-20261003/scheduler-execution/`，前文待批/未执行为历史状态。

## 7. Actual registration, gate failure and rollback

2026-10-03: exact task registration and 14-field readback passed. SSH Run launched SID1005/Session3/Medium/non-elevated PID22728, but InJob=true. Original R5 identity gate halted before any request (requests=0); no ready was issued. The exact task is disabled, not deleted. R5 is HALTED and must not be restarted. [Full evidence and limits](../reports/2026-10/a9_31_r5_scheduled_desktop_entry_failure_2026-10-03.md). This scheduled entry FAILED its acceptance; do not request manual command input as a fallback.


## 2026-10-03 后续普通实例与旧根禁止继续

后续用户按代理给出的旧指令启动PID36076，普通/noJob身份通过，但原计划任务HALTED final仍在；冻结launch仅查start，缺少旧final/并发claim防护。未派发产品，已用固定stop，实际退出UNKNOWN。[新事实报告](../reports/2026-10/a9_31_r5_manual_restart_guard_failure_2026-10-03.md)分别保存两实例，禁止把新ready改判旧失败。R5不继续；新准确R6合同/ADR-0164仅待批材料，不扩展本次历史授权。

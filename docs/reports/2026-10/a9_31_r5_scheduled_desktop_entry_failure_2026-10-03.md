# R5 无需人工命令的计划任务入口：实测失败与回滚

日期：2026-10-03（Asia/Shanghai）。合同：[准确入口方案](../../plans/A9_31_R5_SCHEDULED_DESKTOP_START.md)，当前用户回复“批准”，ADR-0163 Accepted。

## 结论

用户没有输入 PowerShell。代理通过 SSH 注册并启动了准确任务，但实际进程 `InJob=true`，不满足原 R5 的 `noHostJob` 硬门。结论为 **FAIL_HOST_JOB**。固定任务已禁用回滚并保留，不删除；R5 保持 HALTED，不再从 GUI 或任务重启同一入口。

产品请求数为 0，无新的产品阶段结果；真实 Electron 功能、同窗口普通失败后复用及 Win7 均为 `NOT_PERFORMED`。不修改冻结脚本、账户、UAC、原有任务或安全判据，不解绑 Job。

## 执行事实

| 项目 | 结果与直接证据 |
|---|---|
| 目标和配置身份 | `192.168.1.4 / WIN-2JQ66JE4HTQ / Win10 10.0.19045`；Administrator/SID500/Session0 仅做配置、调度及取证 |
| 前置闭包 | 原 R5 stage 复核产品 784 文件、宿主 73 文件、master/revision，PASS |
| 固定任务 | `\A9-A31-R5-Desktop-20261003`，TASK_CREATE；14 项 COM 配置回读通过：准确 SID、InteractiveToken、LeastPrivilege、唯一固定动作、零触发器、零重启、IgnoreNew、按需启动等 |
| 实际启动 | `2026-10-03T11:37:01Z`，实例 `{067A8CD4-4C25-44AD-AE38-BD9A4E2605E8}`，实际 PowerShell PID22728 |
| 实际身份 | A9 Builder SID1005、Session3、Medium8192、Ordinary=true、Elevated=false，但 **InJob=true** |
| 硬门行为 | `IDENTITY_ORDINARY_DESKTOP_REQUIRED`，dispatcher-final 为 HALTED，requests=0，无 dispatcher-ready |
| 回滚 | `2026-10-03T11:37:56Z` 禁用准确任务；独立读取 Enabled=false / State=1，未删除 |
| 产品下游 | requests 无请求文件、dispatcher-result 数为 0；runs 有一个目录，不能将目录数写成 0 或据此推断产品执行 |
| 生命周期边界 | LastTaskResult=1、后来 PID 不存在；未跨退出持有 dispatcher 句柄，不把这些事实升级为完整进程树清理 PASS |

master SHA：`54ffcf006e29b095b3566f455cb901b1d5c3773fa8bcb9b83a2612185719d8be`。
launcher SHA：`cb7a88b966b714254bd0960e7e048b2dbcb3ffee44cab2e70b67e233139b1bda`。
重新读取的任务 XML 文本按 UTF-8 编码 SHA：`d020ab9308babdba26b5899790921c04c14c449e3eab1b345e27fe2df3e82ce9`。

Task Scheduler 重新加载时将 Principal SID 解析为账户名 `a9builder`，XML 省略默认字段；初次本地断言因此失败。随后用 NTAccount.Translate 核对准确 SID，并直接读取 COM 字段验证默认值，任务配置未改。原始回读及本地失败保留。最终有效 XML 按其声明以 UTF-16 导出，JSON 中的文本哈希明确按 UTF-8 计算。

## 原始证据

准确目录：主工作区 `.acceptance/manual-intervention-solution-20261003/scheduler-execution/`。

- `owner-approval.json`：批准文本、方案 SHA 与动作。
- `precheck.json`、`r5-closure.json`：机器、会话、工具签名/哈希与闭包。
- `registration.json`、`definition-readback.json`、`registered-task-readback-utf16.xml`：任务及 14 项检查。
- `launch.json`、`rollback.json`、`disabled-task-utf16.xml`：自动启动、失败与回滚。
- `return-files.json`：两份原始远端文件逐项尺寸/SHA 匹配。
- `remote-dispatcher-final.json`：1125 bytes，SHA `39d6b4b13ae0f9f53a4497c7866d7d74c5e071119fdebd2c492568cd5c147967`。
- `remote-scheduler-disabled-after-host-job-20261003.json`：3510 bytes，SHA `77798e21c2a5524f32f490bd16e4cc08da2e93f0301fbcf18e479a55c817d5c8`。

## 后续诊断

只读用原锁定捕获程序集查询现有 Explorer PID32136、creation ticks639265681539954537：SID1005/Session3/Medium/普通非提升，**InJob=false**，见 `desktop-parent-diagnostic.json`。这是桌面父进程身份事实，没有通过它执行命令，也没有实测另一自动启动路线。

下一入口须经既有普通桌面执行链启动并重新证明 noHostJob；不能以成功注册签入口可用，也不能放宽 Gate。桌面 Shell 调度、固定快捷方式或新控制器根均须具体方案与适用授权，本轮不执行未批准变更。用户无需为本失败代输 PowerShell。

本轮没有产品修改、提交、推送、合并或发布；原 R4/原生 UNKNOWN 与全部失败证据保留。

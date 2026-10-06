# A9-31 R5：手动启动身份通过，但历史硬停止阻断后续

日期：2026-10-03（Asia/Shanghai）。分支 `codex/a9-31-background-tools`，HEAD/product source `35a19250ed6589f6a7ba35b940a784325970c111`。

## 结论与边界

R5 新窗口的普通桌面身份直接通过，不能据此恢复同一根中已 HALTED 的入口。产品请求为 0，Boot、Shell、其他六组和 Win7 均 `NOT_PERFORMED`。

本次代理给出启动命令前没有复查已追加的计划任务首失败登记，导致用户再次启动旧 R5。冻结 launch 只检查 dispatcher-start 是否已存在，没有先拒绝已有 dispatcher-final，因而在原失败终态旁产生了另一进程的 start/ready。这是外部夹具的重启准入缺陷，不是产品功能失败；新 start/ready 与旧 final 不属于同一次执行，禁止合并为有效执行证据。

未发送产品请求，也未修改冻结脚本、原 final、原生锁或产品。通过已有固定 stop 协议发送停止信号；跨 30 秒持有实际 dispatcher Process 实例后仍未退出，结果保留 `UNKNOWN`。不以稍后的 PID 快照替代实际退出码，不强制 taskkill，不改 Job 或账户。

## 已核实的 R5 准备闭包

R5 原批准合同及 ADR-0162 已实施，结果不能被计划任务或本次入口失败改成未实施：

- 固定 C# 7700 bytes，SHA `7fe2e6db6b49247da7dc8d6c034bced5bbe88aab84889481ed9c3ec4006269b1`，在准确准备目录编译。持有编译器 PID30972/creation639266223629434349，实际 exit0；Administrator/SID500/Session0 仅作准备。
- DLL 10752 bytes，SHA `71a2ef1487ef021d1094506ad0acb449b5a3766a99244ecd971cb4842f1f046e`，assembly `capture-library`，MVID `7641ed56-a984-43c7-915f-ca93e08e1f70`。
- 原 compile-result/capture-build SHA `753e66442fd17c4ce0c08b14590c4ec68fc909d3b51c6d5ea53e769b2a734a24`。既有 Microsoft csc SHA `aae1db57f898ca8bda18590c56f86ced6d0ead80c22033b76fdfe9119706f116`，固定三参考的 Ordinal digest `7a6ae1f2bd4b0f548b479a11b289cd308cbaabc884f64e360a37d1536a22b922`。
- Node 语法/68 项、三份实际 PS5.1 解析、237 项协议及准入、22 项实际程序集/捕获/文件正负例通过；这些是定向预检，Administrator/API 预检不代替普通产品阶段。
- 物理产品 784 文件和宿主 73 文件闭包直接检查通过；物理 ASAR 八负例按函数、调用行为及输入准确哈希登记为 `INHERITED_EVIDENCE`。
- 首轮检查失败、摘要规范化差异和修复后检查均保留。51 文件/817744 bytes 的准备索引 `.acceptance/a9-31-developer/product-r1/r5-preparation-evidence-index.json`，SHA `1546905bc2f389fb556a8686c133e6c423acf3786e3c20fcb1b819b86a562f01`。

准确 master SHA `54ffcf006e29b095b3566f455cb901b1d5c3773fa8bcb9b83a2612185719d8be`，revision SHA `cba83ef68a88842deb2e90fc96b8b04236b40ba0232f67098a93dd59ecd4c786`，checks SHA `c285cd022c54a40b6b70e61f345b8a1e2c56538808f227abc242b2e295f18116`。冻结清单见 `.acceptance/a9-31-developer/product-r1/frozen-control-r5-bindings.json`。

## 两次入口必须分别判断

| 入口 | 实际事实 | 判断 |
|---|---|---|
| 19:37:01 计划任务 | PID22728/creation639266242182579740，SID1005/Session3/Medium/非提升，但 InJob=true | `HALTED / IDENTITY_ORDINARY_DESKTOP_REQUIRED`；原任务已禁用；原 final 保留 |
| 20:15:54 用户按指令启动 | PID36076/creation639266265512707074，SID1005/Session3/Medium8192/Ordinary=true/Elevated=false/InJob=false | 身份通过；旧根已有 HALTED，后续不派发 |
| 20:19:23 停止观察 | 向原固定 requests/stop.json 写入准确 master；持有 PID36076 实例等待 30 秒未退出 | `STOP_SIGNAL_SENT_EXIT_UNKNOWN`；实际退出码 `UNKNOWN` |
| 20:20:48 只读快照 | 同 creation 的 PID36076 仍在，直接子进程快照为空；requests 只有 stop.json；runs 保留一处 API 探针目录 | 不把快照提升为完整树清理 PASS，不把 runs 数写成 0 |

20:17 读取的 ready/start 只属于 PID36076，旧 final 属于 PID22728。20:19–20:20 原 final 仍为 1125 bytes、SHA `39d6b4b13ae0f9f53a4497c7866d7d74c5e071119fdebd2c492568cd5c147967`，没有覆盖或改判。

stop 文件 94 bytes、SHA `b7c47feb8acad827442be137cb5f3cd66b6ad8da53203eba8332f009d4db99b7`。停止观察 1209 bytes、SHA `064377529cb5cd9a88779511e8465df39f118c39f4396916dca5ae1482884537`。

## 原始证据与下一步

五文件逐项尺寸/SHA 校验后回收至 `.acceptance/a9-31-developer/product-r1/r5-manual-restart-observation/`，index SHA `5e39fb76d41d1c726382b854fc3fc8250ed0c2292b13e1825223d48108e9b1df`。SSH stdout/stderr 原始字节保留。计划任务原报告见 [计划任务入口首失败](a9_31_r5_scheduled_desktop_entry_failure_2026-10-03.md)。UU 当前不能取得目标桌面，仅作环境阻断，不能代签窗口退出。

继续测试需要新准确根及防重启准入，见 [R6 审批材料](../../plans/A9_31_PRODUCT_R1_R6_ENTRY_GUARD_APPROVAL.md)。只准备文档；未改实现、未创建远端 R6。旧进程未确认结束时，不启动新产品测试。A9-31 保持 `IMPLEMENTATION_IN_PROGRESS`；没有提交、推送、合并、发布、独立收口或候选分配。

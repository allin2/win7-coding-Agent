# A9-31：R3准确残留收尾与终态日志修复后的R4续验

日期：2026-10-04。Status: APPROVED_FOR_R4_LATE_JOURNAL_VALIDATION。负责人回复“批准”，绑定原§1–3及原文SHA256 c8a4908c407bd62c6341eb85729be2d7b546cf3e41b74161c1f5f5847fa269ca；不可变原文和owner记录存product-r3-retry-r4。

## 已完成与批准原因

A9-31工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`，source `ebda91123e62b225c3fd104c9c9b564a4b61c466`。统一证据见[r3报告](../reports/2026-10/a9_31_product_r3_package_and_win10_execution_2026-10-04.md)。R3前五phase和ready负例通过；StopExit原FAIL/HALTED保留，真实点击209.502秒超过120秒。终态日志修复仅普通夹具：driver `7535b7b762aec211f3f0ccab70e7798b9713ac59f942305f9f6466a6f36f767e`，revision `39cdd03b7204ce44a9ec66df499d58a631abbc85205e9fe9de3644925016dd9b`，实际Win10 Node16语法/128/88/15和stage闭包通过。尚无修复后的普通退出证据。

原[R3批准§2](A9_31_PRODUCT_R3_FRESH_EXIT_VALIDATION_APPROVAL.md)明确：“HALTED入口不恢复，本材料不授权第四个新根或其他范围。”原批准也没有对这4个存活实例的强制终止授权。因此本材料请求下述准确收尾及新根续验，不来自skill附加审批。

## 1. R3四个准确实例的收尾和完整证据回收

机器`192.168.1.4 / WIN-2JQ66JE4HTQ`；准确旧根`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R3`；run `3bb68509eae540969c4fdad7dab71168`，master `81f2362309138c81322afe208b9cc7ea0e04a4886cd0684dd8631cb8d637a44d`。

13:49:21Z直接核对仍存活、Session3、镜像均为准确旧根`host\electron.exe`：

| PID | 创建UTC ticks | 原角色/父关系 |
|---|---|---|
| 9768 | 639267170060455361 | 原run主Electron，parent90836 |
| 44164 | 639267170070096309 | GPU，parent9768 |
| 46084 | 639267170070178750 | network utility，parent9768 |
| 87256 | 639267170070346295 | renderer，parent9768 |

批准后首先再次逐项检查PID、creation、Session、镜像路径及当前命令与原证据相等，取得并持有真实Process.Handle；任一不符停止对应动作。若已自然结束，仅记录不存在，不补签历史exitCode。先保存可读证据和DB/WAL/SHM当前副本，标明活动快照不保证一致；原件不写。

允许Administrator仅使用上述准确持有实例的Process.Kill()终止残留（每个明确目标分别执行，不按名称、通配符或递归进程树杀死），最多10秒等待每个持有实例退出并记录实际exitCode。先三个子实例，再主实例；每次重新核验仍为原实例。该异常收尾不是产品正常退出PASS；可能丢失测试实例尚未落盘的瞬时状态，原有持久化与全部文件保留。普通PowerShell107352、其他任务/旧根及系统进程不终止，不删除workspace锁文件。

终止后新清单核对原返回的1034准确文件；新/变更文件及18个原锁文件另存不可变delta，逐size/SHA复核、秘密扫描、SQLite副本integrity。前次LOG变化及回收FAIL保持。所有未知/不符均如实记录，不能以成功终止改判原StopExit或原dispatcher。不得恢复R3入口。

## 2. 同一产品的新R4根及准确四源

本地新根：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r3-retry-r4`。
远端新根：`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R4`。

必须原本不存在、无reparse且准备前C空闲≥2GiB；根总量≤1GiB、≤5000文件，每请求空闲≥1GiB，运行证据返回≤128MiB。Administrator只准备/固定请求发布/取证收尾；普通产品必须a9builder SID1005、Session3、Medium8192、非提升、InJob=false直接核验。保持原SSH/TLS、账户、ACL、系统及远控配置。

批准后任务书登记准确新四源：

- `.acceptance/a9-31-developer/product-r3-retry-r4/control-scripts/stage-product-r3.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r4/control-scripts/launch-product-r3-desktop.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r4/control-scripts/serve-product-r3-desktop.ps1`
- `.acceptance/a9-31-developer/product-r3-retry-r4/control-scripts/product-r3-driver.cjs`

从已检查R3四源复制，仅新根/批准/master绑定及已验证终态后独立有界日志修复。新master/版本/检查/注册全部不可变冻结；保持九字段请求、八phase、原关闭判据、身份/审计/安全/持有句柄/取证/SYNC合同及预算。实际Node16/PS5.1、查询/区间/回执和完整stage准入后才普通执行。

产品ZIP `d951a89af285c4e60c5f4701efbfd54f34627fe103d8257c83636479f82ac74b`、manifest `0060fffff80335d48abd75e2bb784106114af7cca92db0b98e40ad8a65357a68`、784产品/73 host文件准确复用重校验；不重新构建产品、native或锁。capture DLL `93f1979a8a8dbf87cf609d95f3b48ee17c7c3b9b5334dc3506c989961f253505`及源/MVID/build/原批准、原生、host、SYNC安全片段依准确字节/参数/上游适用性继承，不编译C#。

## 3. 最短退出链路优先，再完成新根全合同

新普通入口固定120分钟、最多16请求。顺序调整为受控Boot/整树退出→Boot→后台最短→StopExit→ReleaseExit→Recovery，再完整Background→专用ready负例完整返回→Shell→EncodingSecurity→FailureBoundaries。前五phase因新根变化仍完成本轮直接证据，R3通过只保留历史定位、不替代R4直接PASS。先解决用户可见退出阻塞，再扩展回归。

Stop/Release仍是真实原生对话框，出现信号后负责人分别选择“停止后退出”/“留给系统后退出”；代理提前通知负责人准备并持续读取信号，不模拟选择或延长120秒。每轮窗口只有1个当前请求；原始FAIL不被后到观察改写。Stop须准确当前handle终态、真实choice、actual will-quit/main exit0、全部持有树结束；Release另证准确intent/receipt和移交root/child存活及最终自然exit0；Recovery实际93崩溃树结束/同源恢复、不重放工具。ready专用错误、exit94、零下游和完整返回保持。

允许上述四源内同范围普通夹具修复、实际运行时检查、新不可变版本及原预算内重试；同类失败两轮先共同根因最小诊断；身份/完整性/安全/审计/未知生命周期停止下游，HALTED不恢复。此批准不含第五根；不得借用旧R10或其他历史控制器。远控输入不生效时沿用一次人工普通入口和真实对话框协助，其他检查/派发/返回由代理完成。

最终全输入后飞行、每个普通phase准确身份/产物/run/实际exit、全文件逐size/SHA与秘密扫描；原始超时/异常/未执行保留。集中更新原报告/STATUS，不自签DEVELOPER_VERIFIED。没有提交/推送/合并/发布/删除、产品/native/依赖/锁/C#/账户/系统改动、委派、独立验收或Win7授权，WIN7-43不占用。

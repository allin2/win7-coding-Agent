# A9-31 manifest补证完成后的交接（2026-10-04）

## 1. 准确停点

负责人要求写handoff，由其他agent继续。本次只完成交接、事实核对和状态补录，不增加实现或远端授权。

**短命conhost的精确创建时间、完整系统映像和真实结束事件已在Win10独立探针中补齐；尚未接入普通控制器，整批Win10仍不PASS。R4保持HALTED，R5仅有待批草案。**

负责人最后一次“批准”只绑定[manifest补证材料§1–3](../../plans/A9_31_CONHOST_MANIFEST_FIELDS_APPROVAL.md)，不是批准随后才写出的R5草案。原批准合同SHA256为`1f61d8b26a935bca8925c4273bf146172c0546f8907e66dd93f9a4a7fac15171`；三个manifest原生探针名额已经全部使用。不得再运行当前诊断的run.py、补第四轮、恢复R4或直接创建R5。

| 工作 | 当前状态 |
|---|---|
| A9-30 | DEVELOPER_VERIFIED保持 |
| A9-31 | APPROVED_FOR_IMPLEMENTATION / IMPLEMENTATION_IN_PROGRESS；未签DEVELOPER_VERIFIED |
| 产品源码与r3开发包 | source ebda911，已有准确包和历史部分Win10证据 |
| 经典ETW诊断 | 事件渠道已证明；精确创建/完整映像缺口由后续manifest诊断补齐 |
| manifest诊断 | `MANIFEST_EXACT_FIELDS_DIAGNOSTIC_PASS_NOT_PRODUCT_ACCEPTANCE` |
| 新proof普通接入、R5根/八phase | DRAFT_NOT_APPROVED / NOT_PERFORMED |
| 独立验收、Win7 | NOT_PERFORMED；WIN7-43未占用 |

原[首次交接](a9_31_continuation_handoff_2026-10-04.md)的898ee945/r2待批是历史时点，不应覆盖本交接。当前集中状态为[STATUS](../../STATUS.md)、[r3统一执行报告](a9_31_product_r3_package_and_win10_execution_2026-10-04.md)及本交接。

## 2. 工作树、保护与阅读入口

只在以下工作树继续：

```text
/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent
branch: codex/a9-31-background-tools
HEAD: ebda91123e62b225c3fd104c9c9b564a4b61c466
parent: 898ee9459a9b987840e94ddef336556ea58dd389
```

主仓`/Users/qlyf/Developer/win7-coding-Agent`只读，最后直接核对HEAD为`a53c9b9d861486e5923bc82ea70b31b76af1a939`。当前工作树有大量既有文档修改/untracked，index为空；本轮没有提交、推送、合并、删除或清理。默认主代理直接做，不自动启动子代理。

按需读取当前工作树AGENTS.md、[WIN7_CONSTRAINTS](../../WIN7_CONSTRAINTS.md)、[A9-31任务书](../../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)、[任务索引](../../tasks/README.md)，以及跨项目`/Users/qlyf/.codex/guidance/ACCEPTANCE_AND_RELEASE_WORKFLOW.md`。项目验收流程当前只在主仓的`/Users/qlyf/Developer/win7-coding-Agent/docs/acceptance/ACCEPTANCE_AND_RELEASE_WORKFLOW.md`存在（182行），本A9-31工作树无该副本；从主仓只读读取即可，不切换执行工作树或擅自复制治理文件。新API/源路径在批准后先C14/C15/C16登记；完整合同的原文不能由本摘要代替。

保护源码、用户工作区、DB/WAL/SHM、候选、所有旧根/首失败和不可变源/EXE/MVID/pin。禁止恢复旧R10控制器；当前合法固定capture组件的字节继承不等于恢复R10。授权内普通局部动作无需重复求批；新根、取证模型/源白名单和明确新范围仍以具体批准为准。

交接前`15:13:36Z`保全核验：R2/R3/R4各16份冻结控制脚本、4个capture组件、经典诊断38个返回文件、manifest诊断26个返回文件、当前提交5个产品源码全部零不符，HEAD/index不变。记录位于下述manifest证据根`handoff-preservation-r1.json`。

## 3. 用户可见问题与历史失败

用户要求检查修复同类问题并使Win10实机通过；可接受不影响主流程的小问题记录后继续，身份/完整性/安全/审计/未知生命周期硬门不能因此降级。用户不希望反复手工输入命令；代理负责准备、派发、核验和回收。远控可看画面但多次输入未能证明送达，必要时用户愿意一次启动普通入口或点击真实对话框。

R3已直接通过Boot/Background/Shell/EncodingSecurity/FailureBoundaries及专用ready负例。StopExit实际选择在打开后209.502秒返回，超出120秒；原driver先关闭journal，迟到回调再写造成退出阻塞。实际屏幕为“无法确认安全退出”；EBADF有真实文件系统复现和源码/回执链支持，但没有直接导出产品runtimeState中的同名异常。外部driver已修复终态后独立有界观察日志，Win10 Node16的128/88/15检查通过，原FAIL不改判。

随后负责人准确批准R3四个残留实例收尾和新R4；四实例均实际终止，完整返回1051文件/81901301bytes，旧证据和数据库保留。R4普通dispatcher106728、creation639267194907369129，曾直接证明SID1005/Session3/Medium8192/非提升/InJob=false；这是历史身份，不可当作当前仍存活或可复用的入口。

R4受控Boot run`6b881f58a34844398588576236cf4741`遭遇`LIFECYCLE_OBSERVED_CHILD_NOT_PINNED:78648`。cmd120740实际持有/exit0，conhost78648快照后OpenQuery返回87，原creation/session/full image/exit UNKNOWN。8个持有实例均结束，但1个原观察仍未证明；R4 HALTED不可恢复。171文件8090749bytes完整回收、输入后飞行通过。新诊断不能追溯改判该conhost或R4。

## 4. 最新manifest直接证据

本地R4证据根：

```text
/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r3-retry-r4
```

其下最新诊断根为`manifest-diagnostic-r1/`；前轮经典诊断为`conhost-diagnostic-r1/`。最新整体矩阵为R4根的`win10-evidence-matrix-r4.json`，保留普通八phase NOT_PERFORMED和整批Win10 NOT_PASS。

准确远端诊断根：

```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R4\evidence\conhost-manifest-diagnostic-r1
```

目标192.168.1.4 / WIN-2JQ66JE4HTQ / Win10 Pro19045；实际执行为Administrator SID尾号500、Session0的隔离测试，不是a9builder普通产品证据。

| 版本 | run ID | 结果 |
|---|---|---|
| v1，1组 | 5d93e381262d4c7690ca1aba4756d632 | NOT_PROVEN，PAYLOAD_PARENT_ABI；固定父字段偏移不适用于当前schema。cmd Stop的CreateTime/ExitTime已等于句柄；原失败保留 |
| v2，1组 | f1258b00de8440b6acaf0850d10ef10e | 改为TDH按字段名取PID/Parent；1 cmd + 1 conhost、4事件、精确字段直接通过 |
| v3，12组 | f62db918def849b9aa25d54c540d325f | 12 cmd + 12 conhost、48事件、24实例对，精确字段直接通过 |

三轮自有session均确认停止，三项丢失计数均0，宿主和cmd自然exit0。v3耗时1766ms，宿主73156/creation ticks639267229935839397，自然exit0。实际Start ID1/version3、Stop ID2/version2。cmd的CreateTime/ExitTime和真实句柄逐FILETIME相等；事件头时间仍比创建时间晚24.6–34.9微秒，不能代替CreateTime。

Start实际提供完整设备路径，经只读固定C:映射`\Device\HarddiskVolume3`，得到`c:\windows\system32\cmd.exe`及`conhost.exe`；Stop实际仅为`cmd.exe`/`conhost.exe`。保持Stop原值，以同PID+CreateTime绑定Start，不能声称Stop自身提供完整路径。conhost创建位于唯一cmd父实例真实生命周期内，Session相符，End实际exit0。

最新v3身份：

| 项目 | 值 |
|---|---|
| C# source SHA256 | 2ecf0ee5b927fd1c8ac316e212515c62f4961002615970d27c46b5e80d0754a5 |
| EXE SHA256 / bytes | 1428b9f421cc86349343ee23cd2de6020082d661921c2fc7fd0a09c138a73c76 / 32256 |
| MVID | e08a0d38-a05f-4e3d-aec5-102a2498c808 |
| pin SHA256 | aed19e499c1fcf4a36f599e397ac89fe12dfcd57b48cbdeba264f39fa47b1e26 |
| 真实probe-result SHA256 | 0f3508466e0c889d7044bc0e3d64dc3d53005f9e21622b6d5a622b981fc3d590 |
| owner-approval SHA256 | 31426c5320fbf6a26177d374898c0a640859c9961b7520b34d68e6a36f635952 |

关键原件均在`manifest-diagnostic-r1/`内：

- `approved-contract.md`、`owner-approval.json`：准确批准原文和范围。
- `preflight.json`：目标身份/build、新根不存在、约2.85GB空闲及三系统库签名/hash。
- `complete-return-r1/v1|v2|v3/`：各版源/PS/EXE/pin/build/attempt/真实结果；v3额外含v2真实报告回放输入与验证结果。
- `complete-return-r1/inventory.json`和`verified-result.json`：26文件264909bytes，逐size/SHA零不符，合成秘密ASCII/Base64/UTF16零命中。
- `real-replay-postflight-r1.json`：v3真实报告36项回放/反例通过，PS5.1解析0错误，自有session查询4201、诊断进程0；没有第四次原生执行。
- `handoff-preservation-r1.json`：交接前本地保护核验。

v2实际报告在v3组件上36项回放亦通过。36项为1真实正例+35反例，覆盖PID/CreateTime复用、缺失/重复、父/Session/映像、schema/截断、时间/退出、丢失/未知、session清理及真实根句柄事实；另有7项路径/配对自检。它们是诊断组件检查，不可冒充普通产品断言或独立验收。

## 5. 源、工具及不可重复执行项

本轮已获C14批准且已实现的仅两源：

```text
.acceptance/a9-31-developer/product-r3-retry-r4/manifest-diagnostic-sources/conhost-manifest-probe.cs
.acceptance/a9-31-developer/product-r3-retry-r4/manifest-diagnostic-sources/conhost-manifest-probe.ps1
```

二者当前字节均等于v3 pin。原固定capture、四控制源、产品/native/锁未改。C#的P/Invoke、精确字段校验和纯回放在此；PS的Build/Run/Validate核验pin、准确账号/Session/build并保存不可覆盖结果。当前Run仅为诊断，包含固定cmd-ver启动，不可直接当作普通观察器加载使用。

固定编译器`C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe`4.8.9232.0，SHA256 aae1db57f898ca8bda18590c56f86ced6d0ead80c22033b76fdfe9119706f116；只用原mscorlib/System/System.Core，/target:winexe /platform:x64。完整引用/系统库锁见各pin/build及任务约束登记，不安装依赖。

已批准API为原7个ETW/TDH API，加EnableTraceEx2、TdhGetEventInformation、仅固定C:的QueryDosDeviceW；自有session名`A9-A31-Conhost-Manifest-Diagnostic`。没有启用Analytic日志或改系统配置。普通接入新session/持续采集仍需下述R5批准。

本地编排脚本位于诊断根：`prepare.py`、`run.py`、`return.py`、`verify-return.py`。**三次原生已用完，不再次执行prepare.py/run.py；返回/复核脚本也有不可覆盖标签，不能原名重跑。**需要只读复核时读既有结果，或使用新标签且不调用Run。

R4根`remote-actions.py`封装现有SSH/SFTP，严格`BatchMode=yes`、`StrictHostKeyChecking=yes`、`IdentitiesOnly=yes`，目标`Administrator@192.168.1.4`，既有key路径`/Users/qlyf/.ssh/id_ed25519`，不读取/输出私钥。PowerShell通过UTF16LE EncodedCommand传入；每次label必须新值，输入/stdout/stderr/执行回执均保留。Bitvise过期许可文字是已记录的非阻断警告，不改许可或SSH配置；stderr可能非UTF8，不用无容错decode误判远端成功为失败。使用`/usr/bin/python3`，文档检查用`/Users/qlyf/.nvm/versions/node/v20.17.0/bin/node`。

用户中断前最后一项是成功写入R5草案，无待恢复的长命令。最后远端postflight确认诊断session不存在、目标进程0；未再次启动普通产品。历史普通PowerShell窗口可能仍在，不应未经实际核验终止或复用。

## 6. 下一个agent的最短工作顺序

1. 只读核对当前HEAD/branch/index、任务C14和上列准确证据；保留所有dirty/untracked。无需重新执行已通过的manifest探针或产品/native构建。
2. 阅读[R5接入与续验草案](../../plans/A9_31_MANIFEST_PROOF_R5_EXECUTION_APPROVAL.md)和ADR-0172。该草案是在最后一次批准之后形成，**尚未向负责人取得批准**。交接时SHA256为`ee801e62d49550827ea2c85a7d45da62946033117b3052d8ed2f8bce8dea0b78`。
3. 先只读评估该草案的实现可行性，尤其是观察器就绪→普通请求、live事件记录→最终零丢失/退出核验、worker/dispatcher结束的握手顺序，避免未收尾提前签PASS或彼此等待死锁。草案不是已实现设计；必要的文档修正可先完成，不能暗中放宽原未知生命周期门。
4. 提供具体可审核的R5合同后，请负责人批准§1–4及ADR-0172普通接入。没有批准，不能创建新六源、编译新观察器、部署新根或启动普通phase。此次handoff请求不授予这些动作。
5. 获批后先任务/C15/C16登记六源，再实现和实际消费者检查。仅继承未变产品/native/capture精确字节；新事件组件需独立source/EXE/MVID/pin。按计划先最短实际链路和反例，再新普通入口和退出相关phase，最后扩展完整八phase。

草案的准确新本地根为`.acceptance/a9-31-developer/product-r3-retry-r5`，交接核对不存在；远端拟`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R5`，本代理未创建，接手后需只读重新核实。新普通入口仍要求SID1005/Session3/Medium8192/非提升/noJob；旧R4身份不能继承。

R5草案明确仅对准确System32 conhost、原OpenQueryHandle/87、同PID+CreateTime和已证明cmd父链新增事件proof，保留原query-failure及UNKNOWN；其他生命周期错误继续硬停。完整映像来自Start，原SYNC命令范围与时间判据不改。phase PASS和下一请求必须等待事件会话停止/零丢失/观察器exit0/最终清单闭合以及原持有树退出；临时记录不能独立签PASS。

普通执行拟120分钟/16请求，原120秒真实对话框选择不延长；StopExit→ReleaseExit→Recovery优先，再完整后台/ready负例/Shell/EncodingSecurity/FailureBoundaries。无法远控输入时沿用最少人工协助；不得伪造原生选择。第六根、发布、删除、提交/推送/合并、独立验收、Win7和委派均不在现有批准内。

## 7. 交接后的边界

本次仅可交付“精确事件取证渠道的隔离诊断通过”。原R4失败不改判，用户最初的普通StopExit/ReleaseExit/Recovery闭环及整批Win10任务仍未完成。不得把本报告、检查数量或已批准诊断转换成产品PASS。继续集中维护r3报告、STATUS和R4/R5各不可变矩阵，不建立第二套结论台账。

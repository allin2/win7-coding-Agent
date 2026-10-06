# A9-31 product r1：R4 捕获修复及准确桌面重试审批

```text
Status: READY_FOR_OWNER_EXACT_SCOPE_APPROVAL
Branch: codex/a9-31-background-tools
HEAD/product source: 35a19250ed6589f6a7ba35b940a784325970c111
Decision: ADR-0161 Proposed
R3: HALTED / lifecycle UNKNOWN retained
R4 implementation/deployment/execution: NOT_PERFORMED
```

## 1. 问题与授权边界

[R3首失败事实](../reports/2026-10/a9_31_product_r1_r3_boot_focus_and_capture_failure_2026-10-03.md)绑定准确run与原始hash。焦点夹具修复已经在原批准driver路径完成本地检查；尚未实际复验。
[R3合同](A9_31_PRODUCT_R1_R3_REUSABLE_DESKTOP_APPROVAL.md)§2明确：“三份 PS 或调度规则改变、目标/产品/phase/身份变化、硬门失败后的恢复仍另立准确合同”。本材料只申请新R4，不恢复或改写R3。

沿用R3 source/ZIP/manifest/managed锁/helper/Electron/SQLite及八phase、安全和真实桌面身份合同。没有新产品代码、native、系统API、依赖或验收裁决。

## 2. 精确实现路径与具体修改

仅以下四个外部验证源路径；文档和ADR登记另按仓库文档规则：

1. `.acceptance/a9-31-developer/product-r1/control-scripts/stage-product-r1.ps1`
2. `.acceptance/a9-31-developer/product-r1/control-scripts/launch-product-r1-desktop.ps1`
3. `.acceptance/a9-31-developer/product-r1/control-scripts/serve-product-r1-desktop.ps1`
4. `.acceptance/a9-31-developer/product-r1/control-scripts/product-r1-driver.cjs`

具体变化：

- 四源固定新R4根；旧冻结R1/R2/R3、master/revision/run及全部失败字节保持。
- serve把观察子进程到获取并持有Process.Handle、PID/父PID、creation、Session的步骤移入现有A31Capture C#层，尽量在同一次枚举内完成，减少PowerShell跨层逐行延迟；继续使用已登记Toolhelp、.NET Process和令牌/Job API。不能持有句柄、父/creation/Session不符仍是硬失败，不能忽略短进程或用PID不存在推定成功。
- 捕获失败留下schema_version=1诊断：master/revision/request、观察时间、PID/父PID/Exe、失败步骤、经脱敏的异常类型/码、已持有实例，以及独立的unresolved_observations。未能查明的creation/exit仍为UNKNOWN。launch与serve共用相同捕获代码。
- 硬失败后停止新派发；保留所有已持有句柄，继续有界等待并记录实际退出。不能因已经抛异常立即丢掉其余句柄。新未绑定观察继续保留UNKNOWN，最终状态保持HALTED，即使后来所有已持有进程结束也不能清除缺口。
- serve可CreateNew写入本次run/signals/controller-abort.json，仅schema_version、master_sha256、revision_sha256、request_id、reason_code五个字段，reason_code仅固定LIFECYCLE_CAPTURE_FAILED或LIFECYCLE_PHASE_TIMEOUT；driver核对完整绑定后调用既有真实产品Stop→等待→关闭路径。它不是任意命令/PID入口，不接受force kill、权限变更或额外动作。审计/停止失败及release未知保持原事实，不虚构清理。持有树最多沿用210秒收尾且不越过窗口期限；仍未结束继续UNKNOWN。
- driver保留现有54项请求/硬门判据，增加abort绑定拒绝/真实停止收尾检查；保留已修正的权限选择→输入焦点顺序。ReleaseExit仍需直接补齐既有丢回执/取消竞态判据，不能靠删除NOT_PERFORMED取得PASS。
- stage显式传递RevisionSha256给LibraryOnly，修复同名参数重置；launch在发布WAITING前完成捕获编译与完整预检，输出实际身份。三PS/捕获/请求/安全门和master在首执行前重新冻结，之后仍只允许同合同driver新不可变版本。

## 3. 准确远端目标与写入

仅 `192.168.1.4 / WIN-2JQ66JE4HTQ / Win10build19045`，普通执行SID `S-1-5-21-3031939772-989444280-3099258187-1005`、Session3、Medium8192、非提升、ordinary、no Host Job。每次重新实测；漂移停止。

新准确根：

```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261003-R4
```

准确子目录仅inputs/control/requests/runs/evidence。沿用R3严格派生规则：control/revisions/<64位SHA>仅四个固定basename；inputs仅master/revision/checks/范围批准/registration及明确检查记录；requests仅九字段请求或绑定master的stop；runs/<32位request id>仅隔离workspace/LOCALAPPDATA/TEMP/signals/evidence。新增abort仅固定本次信号文件，不接受外部任意路径。
只读复用准确R2根的inputs四输入、package784文件、host73文件；每请求校验完整闭包。Administrator SSH仅传输/调度/回收，实际产品与夹具仍从A9 Builder真实普通桌面运行。沿用已有权限，不更改ACL/owner/账户/Job/UAC/Bitvise/许可证/系统策略或服务。
初次余量≥2GiB、每请求≥1GiB、R4根≤1GiB、每层拒绝reparse；不足停止，不清理旧证据。

## 4. 检查、冻结及执行顺序

批准覆盖§2四路径实施/必要定向修复、检查、准确新输入冻结/逐项hash登记、§3目标R4部署及本节执行；不重复请求同范围普通操作。首远端执行前形成实际hash清单，所有master/revision/registration/checks绑定同批准证据；不以占位hash或R3 master运行。

本地Node语法、请求/物理ASAR完整性、abort缺/额外字段与错绑定负例；实际PS5.1三解析、现有210类schema/request/expiry/limit/unknown-tree判据，以及新捕获/失败收尾正负检查。旧检查只有精确未变函数/依赖/调用范围才能登记INHERITED_EVIDENCE；capture及变动入口直接重跑。工具调用失败、身份/完整性/审计/实际树未知仍硬停止。

捕获定向检查覆盖长存活子进程、快速退出、父PID/creation不符、打开失败、未能绑定观察的UNKNOWN、已持有进程真实退出码及首次诊断保留；不能仅用模拟对象声称真实句柄通过。未绑定快速进程反例必须保持HALTED；不得把速度优化当作消除全部竞态的保证。

启动新的普通桌面有限窗口一次，最多2小时/16请求；不复用R3期限/PID、不恢复R3 HALTED。Boot及Shell先跑；通过后其余六组。至少一次普通失败→已检查新driver revision→新run成功，必须同窗口PID/creation/master、旧树真实结束、旧失败不可变，证明后续普通重试无需人工重启。通过SSH调度与回收，GUI仅必要启动/真实退出按钮和交互观察。
所有正向场景保存原始文件、SQLite/截图、进程实例与秘密扫描；冻结后的PS变更、新产品/安全范围、硬失败后的再次恢复仍另立合同。独立复核/开发收口不自签。

## 5. 不包含的动作与历史保留

不提交/推送/合并/发布，不改产品/native/输入锁，不安装或修改系统/账户/权限，不执行Win7，不分配WIN7-43或提升Alpha2/RC。R3 exit UNKNOWN、未绑定PID13524与旧P1/UNKNOWN完整保留；本合同不裁决历史未知为成功。R4实际失败保持原run并按失败等级停下游。


## 6. 负责人实际批准

负责人批准§1–5及ADR-0161，准确批准前合同SHA-256 `cb26343fda42bcfb9f79f04f57ce835724f2868350ab0b7b73811d75a83398bc`；登记 `.acceptance/a9-31-developer/product-r1/owner-r4-execution-approval.json`。前文待批状态保留为历史，允许准确四路径实施、检查、冻结和R4目标部署/执行，不恢复R3或签收口。


## 7. 实施与部署实际登记

四源及新输入已冻结；Node68、实际PS三解析/210协议判据与12实际捕获/abort预检通过。18准确输入CreateNew/校验后装配PASS，三ParseFile和784产品/73宿主闭包通过。[事实与哈希](../reports/2026-10/a9_31_product_r1_r4_capture_fix_and_deployment_2026-10-03.md)完整登记。普通桌面一次启动尚未完成，不宣称产品phase/复用/Win7 PASS。


## 8. 实际普通桌面启动与首失败

R4已真实启动，普通身份三角色通过；准确Boot观察未绑定csc.exe触发HALTED，已持有worker/Electron真实exit1，编译器UNKNOWN保留。[完整事实](../reports/2026-10/a9_31_product_r1_r4_boot_compiler_capture_failure_2026-10-03.md)绑定15文件/hash。§4禁止冻结PS热改或硬失败后复活；R5预编译材料另立待批，后续phase未执行。本追加不改写前文启动前历史。

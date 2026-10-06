# A9-31 product r1：R3 有限可复用桌面调度窗口具体合同

```text
Status: READY_FOR_OWNER_EXACT_SCOPE_APPROVAL
Branch: codex/a9-31-background-tools
HEAD/product source: 35a19250ed6589f6a7ba35b940a784325970c111
Decision: ADR-0160 Proposed
ASAR local repair: PASS; repaired real Electron: NOT_PERFORMED
Reusable dispatcher / R3 remote writes: NOT_IMPLEMENTED / NOT_PERFORMED
```

## 1. 问题、输入与不变边界

负责人要求减少每次夹具失败后重复人工启动。R2 的普通 Boot 首失败及持有实例 exit1 见 [事实报告](../reports/2026-10/a9_31_product_r1_r2_boot_asar_failure_2026-10-03.md)。
ASAR 修复已在原批准 driver 源路径完成本地检查；R2 冻结副本、pin、run、产品和旧失败保持原字节。

沿用 [原合同](A9_31_PRODUCT_R1_WIN10_VALIDATION_APPROVAL.md)§1 的准确 source、ZIP、manifest、managed 锁、helper、Electron/SQLite、目标和普通身份，不新增产品能力或原生构建。
原合同八组 phase 原样保留。Administrator SSH 仅传输、校验、固定调度与回收；实际执行仍由 A9 Builder 普通真实桌面启动。

## 2. 精确实现路径与版本合同

仍仅四项外部验证源路径，批准后允许完成本合同改变及必要定向修复：

1. `.acceptance/a9-31-developer/product-r1/control-scripts/stage-product-r1.ps1`
2. `.acceptance/a9-31-developer/product-r1/control-scripts/launch-product-r1-desktop.ps1`
3. `.acceptance/a9-31-developer/product-r1/control-scripts/serve-product-r1-desktop.ps1`
4. `.acceptance/a9-31-developer/product-r1/control-scripts/product-r1-driver.cjs`

stage 核对新调度器及不可变测试版本；launch 成为有限桌面调度窗口；serve 每请求启动独立测试进程、返回真实实例/树证据；driver 按 ADR-0088 校验物理文件并执行原八组。
首次三份 PS、捕获 API、身份/生命周期/请求验证规则和调度器 pin 冻结。后续普通夹具修复仅允许上述 driver 源路径、相同包/phase/安全合同；每版做定向检查后 CreateNew 冻结新副本、revision pin 和范围批准登记，不能覆盖已执行版本。不得把原生/产品/安全门修改当作普通夹具修复。
三份 PS 或调度规则改变、目标/产品/phase/身份变化、硬门失败后的恢复仍另立准确合同；当前批准不自动接受这些版本。
不新增库、系统 API、服务或自动登录；沿用既有 .NET Process/令牌/Job/Toolhelp、Electron original-fs 和 Schema IPC。

## 3. 准确目标与允许写入

仅 `192.168.1.4` / `WIN-2JQ66JE4HTQ` / Win10build19045 / SID1005 / Session3 / Medium8192 / ordinary / 非提升 / no Host Job。
新根：

```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261003-R3
```

准确子目录仅 `inputs`、`control`、`requests`、`runs`、`evidence`。`control\revisions\<64位revision pin哈希>` 保存按清单逐项校验的四文件不可变副本；`inputs` 保存 master/revision pin、批准范围及测试证据绑定。生成目录名只接受固定哈希，副本文件名只接受上述四个准确 basename，不接收任意路径。
`requests` 是固定九字段请求；`runs\<32位request id>` 是新隔离 workspace/LOCALAPPDATA/TEMP/signals/evidence；`evidence` 是监督器和逐请求事实，不写入产品包。
只读复用 R2 准确根中的 `inputs` 四个输入、`package` 的784文件以及 `host` 的锁定 Electron，避免再次复制完整包占空间；每请求重新核对准确物理闭包、输入/锁/主机程序哈希。新 pin 显式冻结这两个准确路径，不从请求读取任意 product/host 路径。
不修改 R2 的 scripts/pin/包/run/证据。允许向 R2 既有 `control\stop.json` CreateNew 写入唯一正确 pin 字段，在无活动请求时停止旧调度；回收旧 controller/监督器实际退出和树证据，不删除旧目录。
沿用已有权限，不改 ACL、owner、账户、Job、UAC、Bitvise、许可证或服务。每层拒绝 reparse；初次余量≥2GiB，每请求≥1GiB，R3 根累计≤1GiB；不足停派发，不清理旧材料。

## 4. 一次启动与固定请求

R3 launch 从普通真实桌面启动一次，保持窗口；内部经相同令牌创建每请求的新 serve，再由 serve 创建准确 Electron/fixture。每层重新检查完整普通身份及 no Host Job，原生自身托管 Job 按原合同。
全窗口最多2小时、16请求，不能通过切版本重置计数或延期；到限拒绝新请求。三个固定 PS 及 master pin 不热换。
请求继续仅九字段：`schema_version`、`request_id`、`phase`、`source`、`zip`、`manifest`、`lock`、`scripts_digest`、`pin_sha256`；严格原始键、类型、来源和重复检测。
revision pin 只能从固定哈希文件名读取；必须存在同批准范围的登记，绑定四脚本、检查记录和 master 的准确产品/目标/phase/身份。未检查、未登记、错 hash、多/缺文件或未知版本拒绝。
普通 driver 失败仅在原始证据保存、实际树全部结束且无硬门失败时，回 WAITING；我可经 SSH 部署范围内新的 driver revision 并派发新 run，窗口无需重启。
身份、安全、完整性、必需审计、capture 溢出或实际生命周期未知立即停后续，保持原 HALTED/UNKNOWN，不静默重试、不提升或伪造清理。
每次仍持有 serve/Electron/helper/root/child 实例并绑定 PID/creation/parent/Session/真实退出码，监督器直到所有观测实例结束才记录最终结果。普通 driver ASSERT 不改变安全门。
退出原生对话按准确产品窗口和固定按钮进行必要 GUI 操作；本合同不新增 UI Automation API、不 mock 对话。目标是取消每次夹具修复的重复 PowerShell 启动，非声称零人工。

## 5. 必需检查、部署与完成条件

实现后先完成 Node 语法/请求检查、物理 ASAR 正负完整性检查、实际 PS5.1 三解析、请求/revision 正负用例及 .NET 捕获预检；正负项包含缺批准登记、错 source/包/脚本/PS版本、缺/额外文件、非法相对路径、重复/额外/错误字段、重复 request/revision、到期/到限、未知树禁止下一请求。
保存每版源码及检查字节，生成准确四文件 SHA、master/revision pin、批准登记和本地差异清单后再部署；准确记录最终哈希，不以占位哈希执行。批准本合同覆盖上述四路径实施、定向修复/检查、最终冻结及本准确目标/根的部署与执行，不另行请求同范围普通操作许可。
先通过 Boot 和 Shell，再按原矩阵执行其余六组。每次审阅原始结果和实际树；ReleaseExit 丢回执/取消竞态仍须直接补齐，未执行保持 NOT_PERFORMED/INCOMPLETE。
普通失败后至少一次经 SSH 使用新 driver revision、新 run 的受控复验，证明调度窗口/PID/身份保持、旧失败与副本不变、下一派发只发生在原树结束后。安全失败负向对照不得伪造为产品成功。
收回原始日志、SQLite、截图及进程实例；独立复核和开发收口另授权，不自行签 DEVELOPER_VERIFIED。

## 6. 不包含的动作

不提交、推送、合并、发布，不新建账户/ACL、不安装软件、不重编或改锁、不分配 Win7 候选。A9-32、Win7、Alpha2/RC、旧P1/UNKNOWN均不改判。不默认启动子代理。
本合同及 ADR-0160 批准前，仅已有批准范围内 ASAR 本地修复和文档已完成；可复用调度实现、新 R3 根、远端部署及修复后实机测试保持 NOT_PERFORMED。


## 7. 负责人实际批准登记

负责人对§1–6及ADR-0160回复“批准”；登记时间 `2026-10-03T09:01:30.115829+00:00`。批准前合同SHA-256为 `d9264e132e46317f718e76abfa787852c9e6d9c939f278f48ce5d2e68f2c0d1a`，准确记录见 `.acceptance/a9-31-developer/product-r1/owner-r3-execution-approval.json`。
前文待批/NOT_PERFORMED保留为历史；本批准覆盖四路径、准确R3新根与R2只读复用/stop、新有限普通桌面调度及定向修复版本，不包含提交、系统权限改变、产品/native改动、Win7或独立收口。

## 8. 实施与部署实际登记

同四源路径已实施、检查并冻结，准确R3新根已创建。产品784项、宿主73项、revision/批准/检查登记远端装配通过；首次装配参数绑定错误及修正输入后的成功均保存，未覆盖三PS。
完整哈希、检查层级和旧R2实际收尾见 [实施报告](../reports/2026-10/a9_31_product_r1_r3_reusable_dispatcher_2026-10-03.md)。
普通桌面R3尚待一次启动，修复后实机和同窗口新revision复验NOT_PERFORMED，不签开发收口或Win7结论。


## 9. R3启动与首请求实际结果

普通桌面启动已通过；准确Boot请求在焦点前置夹具失败及观察PID13524未能绑定后HALTED。原始证据与UNKNOWN保持，R3不再派发。[事实报告](../reports/2026-10/a9_31_product_r1_r3_boot_focus_and_capture_failure_2026-10-03.md)及[R4具体合同](A9_31_PRODUCT_R1_R4_CAPTURE_RETRY_APPROVAL.md)已形成。前文“尚待启动”是此前时点，后续以本节为准；冻结三PS或恢复硬失败需本合同§2要求的新准确批准。

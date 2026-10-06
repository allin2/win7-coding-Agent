# A9-31 product r1：R4 捕获修复、定向验证与部署

## 当前结果

负责人批准[R4具体合同](../../plans/A9_31_PRODUCT_R1_R4_CAPTURE_RETRY_APPROVAL.md)§1–5及ADR-0161。只在四个外部验证源路径实现并冻结新R4，原产品/native/锁/HEAD和R1–R3失败/UNKNOWN不变；没有提交、推送、合并、发布或系统权限变更。
R4装配 `R4_STAGED_REUSED_FULL_CLOSURE_PASS`，18项准确输入逐字节CreateNew并校验hash，复用产品784项和宿主73项，根188723 bytes。普通桌面尚未启动，Boot/Shell与其余phase、同窗口普通重试证明、Win7均NOT_PERFORMED；A9-31保持IMPLEMENTATION_IN_PROGRESS。

## 实施与真实边界

serve使用既有Toolhelp/.NET Process，尽量在枚举内获得子进程句柄、creation/parent/Session；PowerShell只接纳已经持有的实例。失败输出进程名、失败步骤、异常类型/码和未知项，不能绑定继续硬停止；未知系统错误码用null/UNKNOWN，不填0。
两层硬失败后保留已持有句柄并有界等实际退出，仍保留未绑定观察/原HALTED。固定五字段的本run中止信号经driver核对master/revision/request后只走原产品Stop/等待/关闭，不操作任意PID或改变权限。stage显式传RevisionSha256，三PS进程输出显式UTF8。
driver先完成真实隔离工作区权限表单并等输入可用/模态框关闭，再测输入焦点；不移除禁用门或直接解除disabled。三PS/master从本次冻结起不可热换；后续同范围driver检查并新revision登记仍可复用窗口。

## 定向检查及首失败保留

| 层级 | 当前证据 |
|---|---|
| Node语法及请求/物理接口/硬失败/abort绑定 | 68项PASS，其中新abort正负14项；仅本地外部夹具 |
| 本地物理包闭包 | 784项PASS，精确相同source/ZIP/manifest；非实机功能结论 |
| 物理ASAR八反例 | INHERITED_EVIDENCE；selectPhysicalFs/manifestCheck/SOURCE/sha及锁定包不变，函数hash与原记录逐项绑定 |
| 实际PS5.1三源码解析 | PASS，精确冻结hash；版本5.1.19041.6456 |
| 实际PS请求/revision/登记/限额/UNKNOWN禁止派发 | 210项PASS，全部直接重跑，不改绑R3原报告 |
| 实际捕获与abort | 12项PASS，含真实子句柄/实际exit23、错父creation/Session、真实打开失败、未知接纳硬拒绝、收尾不消除UNKNOWN、真实快速退出及固定中止；Administrator/Session0 API预检，明确不是普通产品证据 |
| 目标部署/装配 | 18输入hash、产品784项/宿主73项、原生/锁/批准/检查记录及三ParseFile通过 |
| 普通桌面R4 / Boot及后续 | NOT_PERFORMED，待一次启动 |

取证命令首轮多行stdin没有测试结果，保留EMPTY而非PASS。随后取证模板以SERVE替换占位时也误替换OBSERVED错误判据，造成两份负例误报；修正为唯一占位token后真实guard通过。第三份到8项后失败，因为测试读UTF8无BOM中文JSON时未指定Encoding UTF8；修正读取参数后12项全部通过。三类原始stdout/stderr及失败run不覆盖。它们是取证夹具问题，不能归入产品失败或以成功报告替换。

## 准确冻结

| 输入 | SHA-256 |
|---|---|
| master | `8e51461c1194e6200da3d387ba20731d518678393620ab707648a01326f0a12d` |
| revision | `5736a2d9ac801a7cb8e021d1d159b96e62b3a13bb89123ef2bfd40ef5a546803` |
| checks | `794096f367e088732ab6763399872870c87ad9691c58d8e859a03f05c058bc8f` |
| launch-product-r1-desktop.ps1 / 7768 bytes | `44cc92f245559776d86f995123718fc425afcbe00a15375a14b215c1a438eb4f` |
| product-r1-driver.cjs / 46355 bytes | `04bbe309be01e8e085bbe1c6f388f071fd6122f6349f82a40cbc0391a983653e` |
| serve-product-r1-desktop.ps1 / 36031 bytes | `a58b852af064ababe1382a295e19aae5640260c5364ed635cd29724e6d8289fd` |
| stage-product-r1.ps1 / 1967 bytes | `25c83ac4e1b3a8cd8f7851d05efd6daae34e17220dff483e2a4101886d860fb4` |

完整绑定 `.acceptance/a9-31-developer/product-r1/frozen-control-r4-bindings.json`，取证目录同任务product-r1；`r4-deployment-evidence-index.json`逐项绑定raw stdout与首失败分类。所有实际角色/Session及本地/继承/目标证据等级保持独立。

## 桌面启动阻断与下一步

只读预检目标Win10/主机/SID1005/Session3 explorer通过，C余量约2.1GiB；没有改账户/ACL/UAC/Job/Bitvise或许可证。UU显示同A9 Builder CMD，但Computer Use paste/typeText后没有控制台输入变化；SSH随后确认R4没有dispatcher-start/ready/final。此时不派发产品请求，也不由Administrator/Session0替代普通桌面启动。
已向负责人提供一次准确R4启动命令；启动后直接重新核对ordinary/Medium/non-elevated/noHostJob及master，然后Boot→Shell→余六组，通过SSH派发/回收。保持原2小时16请求，必需同窗口新revision重试证明、ReleaseExit丢回执/取消竞态补充以及独立收口尚未完成。


## 追加：普通桌面启动及Boot硬失败

2026-10-03T10:47:21Z已由Computer Use在Windows运行框直接输入准确命令启动，SSH确认SID1005/Session3/Medium/非提升/noHostJob。Boot run01e5a8be22e9473fae4da8b1059eb46a观察worker初始化csc.exe未绑定而HALTED；真实已持有worker/Electron exit1，编译器UNKNOWN保留。见[首失败报告](a9_31_product_r1_r4_boot_compiler_capture_failure_2026-10-03.md)。前文“待启动”保留为历史，不声称本报告部署检查证明产品通过。R5方案待准确批准，不复活R4。

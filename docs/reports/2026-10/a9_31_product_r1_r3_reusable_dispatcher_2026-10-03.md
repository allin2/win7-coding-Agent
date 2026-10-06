# A9-31 product r1：R3 有限可复用调度窗口实施与部署

## 当前结果

负责人批准 [准确 R3 合同](../../plans/A9_31_PRODUCT_R1_R3_REUSABLE_DESKTOP_APPROVAL.md)§1–6及ADR-0160；仅四个外部验证源路径完成实现并冻结，产品/native/输入锁、HEAD和旧证据未改。
R3 已在准确 A9 Builder profile 新根部署17份输入，装配为 `R3_STAGED_REUSED_FULL_CLOSURE_PASS`，核对产品784文件、宿主73文件、全部输入/脚本/检查记录及批准登记；R3根162694 bytes。
普通桌面 R3 尚待一次启动，修复后真实 Electron、各组phase和Win7仍 `NOT_PERFORMED`；不宣称已证明可复用重试或功能PASS。

## 实现与冻结

launch 在同普通桌面保持最多2小时/16请求；每请求创建独立serve，固定三PS与master，不接受任意command/path/PID/env。
serve 校验九字段请求、revision/范围批准/检查登记与完整物理闭包，持有实际Electron/helper/root/child句柄及实例身份；普通driver失败只有完整树已结束才允许下一请求，安全/身份/完整性/审计/未知生命周期停止。
driver 按ADR-0088使用original-fs读物理ASAR，不可用拒绝；输出泄露/锁/身份等断言不能作为普通夹具失败继续。阶段和产品入口保持原合同。
后续仅同范围driver修复可通过检查与新不可变revision登记自动派发；三PS、调度/安全合同或目标变动需新准确裁决。普通失败后同窗口的新revision直接复验尚未执行。

| 冻结项 | SHA-256 |
|---|---|
| master pin | `82c2e55c0a25dd6d3098448c326c31183f0c9b2eec37fa0d1fd91cfed8cdb452` |
| 初始 revision pin | `2b54b4a35d865f2fe02c1c2cac00f6270240360dccf1ab8f4944608f121b57b8` |
| checks | `0ac013159e8e79632d7d53f103d327784df7d9775adda110afb27abe5ffc1cf9` |
| launch PS | `cac23621117f61002fdf9654b0901b98a90e2611e883797a1b83a809ac81bdf6` |
| serve PS | `6e893d6d2bda4ac260cd856b7f87b403c26a09ef34216434c6505f3eb7c65517` |
| stage PS | `bf06851c77b0c6c1b8ae4c4f051378bea7e61d65f1d13d9961c32984e09d4676` |
| 初始 driver | `1d8e709f0a68debba854b1474d4049078a4204b83406d111732dcdda36b4225d` |

## 检查与首失败

Node语法、54项请求/物理接口/硬失败分类检查以及八项物理ASAR完整性正负检查通过。物理接口选择采用受控运行时视图，不能冒充实际Electron验证。
实际PS5.1.19041.6456三源解析和210项master/revision/批准/检查登记/九字段原始请求/到期到限/未知树禁止派发检查通过。
捕获API只读探针为Administrator/Session0/High/Job，证明API可调用，明确不是普通产品执行证据。
首次远端装配在 `INTEGRITY_REVISION_NAME` 停止：stage加载同参数名的LibraryOnly脚本后，未绑定的RevisionSha256重置原值。首轮原始stdout/stderr保留。
随后仅在该次PowerShell进程将默认RevisionSha256显式绑定至同准确revision，原输入参数和全部校验仍执行；装配通过。未修改冻结脚本、账户或系统策略，没有产品派发。
后续装配沿用同固定参数绑定入口；三个PS字节保持固定，不能在运行中的调度器热换。

## 旧控制器收尾与证据

批准stop请求在无活动R2请求时执行。R2 controller正常exit0，监督器持有的controller及首轮Electron真实退出码分别0/1，观察树全部结束；COMPLETED仅表示控制流程结束，passed phases为空，不把Boot改为PASS。
两份原始final及逐文件哈希位于 `.acceptance/a9-31-developer/product-r1/controller-r2-stop-return/`。
R3完整冻结/检查记录见 `frozen-control-r3-bindings.json`；部署成功与首装配失败均由 `.acceptance/a9-31-developer/product-r1/r3-deployment-stage-evidence-index.json`绑定。

## 待执行

Mac锁屏使Computer Use暂停输入，需A9 Builder真实桌面启动一次R3 launch。随后直接核对调度器完整身份、master和每请求实际退出证据，再执行Boot/Shell与剩余phase；保存普通失败、新driver修复重试和硬停止负向对照。
release丢回执/取消竞态补充、最终独立复核、开发收口和Win7均未完成。A9-31保持IMPLEMENTATION_IN_PROGRESS，无提交、推送、整合、发布或系统权限修改。


## 普通桌面启动后更新

R3已由负责人从普通桌面启动。dispatcher/worker/Electron完整身份直接通过，但首Boot请求同时出现焦点前置缺失与未绑定PID13524；窗口HALTED，不能取得phasePASS或同窗口普通重试证明。[首失败与本地修复](a9_31_product_r1_r3_boot_focus_and_capture_failure_2026-10-03.md)保留13原始文件、截图/SQLite及准确hash。原driver前置本地修复PASS，冻结三PS/旧副本不变；[R4具体合同](../../plans/A9_31_PRODUCT_R1_R4_CAPTURE_RETRY_APPROVAL.md)待批准，后续实机与Win7仍未完成。

# A9-35 后台启动失败生命周期与审计修复

Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_HARDENING
Phase-Gate: A9_35_IMPLEMENTATION_AUTHORIZED
Branch: codex/a9-35-managed-start-failure
Source Baseline: d1b5275f6bc46253d2b16990c42f9f19ca2ee858
Product Code Baseline: 548ef0a65fa307a2af7932958236e0c5a7a0c932
Win7 Validation: NOT_PERFORMED

## 1. 批准与完整合同

2026-10-15 负责人对绑定上述基线的[9路径提案](../plans/A9_35_MANAGED_START_FAILURE_REPAIR_PROPOSAL.md)回复“批准”。该提案§1～5的范围、行为、不变条件、验收和停止条件完整纳入本任务。其DRAFT标记作为批准前历史保留，本任务登记现行授权。

授权新任务登记、隔离分支、本地最小实现、必要检查、全新Codex会话独立复核及同范围本地提交，不推送。登记提交仅改文档；隔离分支从该登记提交建立，产品字节须与Source Baseline一致。A9-34仍延期。

用户可观察的成功条件：正常后台启动拒绝结束本次工具及turn，留下准确失败审计；有完整绑定清理证明时不产生虚假的cleanup_required。真实审计失败、未知生命周期仍阻止后续派发。健康启动、Stop、release和取消维持原语义。

首失败见[预演16报告](../reports/2026-10/a9_33_win7_45_rehearsal16_product_block_2026-10-15.md)，run b9731870-0776-4a67-950d-3cc849db7c66，源548ef0a…；原始DB/WAL/SHM不变。当前无相关进程不能证明未知句柄生命周期。首次遗漏WAL的摘要不作完整结论，正确摘要为diagnosis-db-wal-facts.json。

## 2. 唯一允许的实现与测试路径

1. src/runner/src/trusted-shell-runner.ts
2. src/runner/src/background-process-manager.ts
3. src/runner/src/native-transport.ts
4. src/shell/product/a9-agent-runtime.js
5. src/runner/tests/trusted-shell-runner.test.ts
6. src/runner/tests/trusted-shell-runner-contract.test.ts
7. src/runner/tests/background-process-manager.test.ts
8. src/runner/tests/native-transport.test.ts
9. src/shell/tests/product/a9-background-tools.test.ts

允许维护本任务、索引、既有STATUS/STATUS_LOG及本问题报告。不得在A9-33分支修改产品。不改native/协议/锁/版本、依赖、历史取证组件、UI、API/Schema/持久化格式、权限或所有权模型，不新增ADR、不改Accepted ADR。超出上述边界时停止相关实现并提交具体缺口。

## 3. 必须完成的本地验证

先最小复现再改实现。覆盖不存在cwd、cwd为文件/读取拒绝、中文空格有效目录、helper启动后ready失败的完整证明、缺失/错实例证明、检查后目录变化、真实审计失败和健康启动/Stop/release。反例旧代码失败、修复后通过；缺证明必须继续拒绝。预启动拒绝与启动后ready失败分别报告，前者不冒充后者。

先构建runner依赖及实际消费者，消费者测试加载当前新dist；消费者全部结束后才恢复跟踪生成物用于干净提交。运行上述4个runner测试文件、shell的a9-background-tools测试、verify:quick、docs:check、git diff --check。按具体失败增补检查，不默认产品全量或native重建。Node20开发机/Mock只计对应层级，不计Electron/Win7。

准确代码提交后另开全新Codex会话独立复核（gpt-6.1-sol / xhigh / default）；0P0/0P1后才准备后续整合材料。同范围发现可依本授权继续修复、验证、本地提交。

## 4. 后续边界

本地整合、新远端执行须待修复SHA、独立报告及准确清单形成后另报，不借用A9-33旧远端授权。不授权Win10、安装、系统/安全设置修改、强杀未知进程、native/锁修改、冻结、门A/B、正式运行、发布、推送、ADR-0155接受或A9-32 DEVELOPER_VERIFIED。

身份、完整性、权限、安全、必需审计或未知生命周期失败停止依赖下游；同类两轮失败先共同根因，不整批重试。保留全部旧ZIP、候选、run、数据库、首失败、HALTED和UNKNOWN，不恢复或改判旧失败。

## 5. 执行记录

批准登记阶段：开发机文档登记；实现、检查、独立复核、新包与目标平台均NOT_PERFORMED。

本地最小修复已完成：3产品文件、2测试文件，开发机Node20.17.0 runner119/运行时17/verify:quick通过。5个旧代码行为反例和第一版profile反例已关闭，原日志保留。详见[本地报告](../reports/2026-10/a9_35_local_managed_start_failure_repair_2026-10-15.md)。当前dist消费者结束后记录编译身份，才恢复跟踪生成物用于提交。独立复核尚未启动；实际helper的ready失败清理、新包和Win7仍NOT_PERFORMED，不能关闭BG03。整合与新远端执行未授权。

第1轮已对4044272…报告0P0/0P1/0P2，原报告不覆盖后续字节。执行者补查合法error帧不带profile却被误报身份失败，新增反例在该代码上失败；一行修正及3例检查后runner122/运行时17/verify:quick通过。第2轮全新独立会话只审此增量及必要上下文；实际helper/Win7仍NOT_PERFORMED，整合与远端授权不变。

第2轮已对5f7c0e80a2c25ffb09b2d21fe6b154b98a12abe2完成独立复核，0P0/0P1/0新增P2产品缺陷（开发机）。报告SHA-256 55950b8a67fb942aace53801b07ef7b80f09ea768895ba0f202eb23923dd4d82。runner首轮121/122的时序失败保留，原因UNKNOWN；隔离通过及原命令完整复测122 PASS，shell17/quick/docs/diff通过，1个可编译变异被行为断言拦截并精确恢复。详见本地报告§6。仅本地修复与复核完成；§7给出10路径整合材料，批准问题另绑最终文档SHA与清单。实际helper/新包/Win7 NOT_PERFORMED，BG03不关闭，不整合、不远端、不推送。

## 6. 本地整合批准与执行

2026-10-15 负责人批准ce952760c8118b177c3570208a32c7941f0b0b8b按10文件清单（SHA-256 7f02ff06efd415511901abbfc3a15a97ef6a6c87ff113341ca9c50d12aae1b2b）本地快进整合到A9-33原dd7b92fd1ca4de606358b228feb822c21ef4c253。执行者核对两端身份/干净状态、清单/逐文件/独立报告哈希及祖先关系后，ff-only完成，无冲突。产品字节仍绑定5f7c0e80…；本次只身份、完整性及文档检查，产品检查与独立结论为INHERITED_EVIDENCE。

完成记录维护在A9-33工作树的[A9-33 §6.68](A9_33_BATCH_2_WIN7_ACCEPTANCE.md#668-负责人批准-a9-35-本地整合2026-10-15-utc)与本地报告§8，原A9-35源树/证据保持。整合批准不覆盖新产品编辑、目标构建、远端执行或Gate；BG03缺口、Win7 NOT_PERFORMED与旧FAIL/UNKNOWN保持，未推送。

## 7. 本轮 Win7 实机验证授权

2026-10-15 负责人在整合后指令“就在win7验证”，授权为当前修复构建新包并在既有Win7普通agent桌面做一次有界验证，具体目标、R1～R8、16请求/7200秒、累计97/124、截止2026-10-16T06:59:59Z及停止条件见[A9-33 §6.69](A9_33_BATCH_2_WIN7_ACCEPTANCE.md#669-负责人要求当前修复在-win7-实机验证2026-10-15-utc)。这次新授权覆盖本轮目标构建与远端验证，替代此前仅本地的对应限制，不借用旧run授权文件。

产品/native/协议/锁修改仍未授权；不得把预启动拒绝当ready失败清理，后者缺口保持。构建后登记准确source/ZIP/authority/run/根并报备哈希，再按既有安全闭集执行；未执行前不预填Win7 PASS。不冻结、不签Gate、不推送。

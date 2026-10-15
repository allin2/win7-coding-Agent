# 后台启动失败生命周期与审计：最小产品修复合同提案

Status: DRAFT_READY_FOR_REVIEW
Proposed Task: A9-35（当前索引未占用，正式登记前再次核号）
Target Branch: codex/a9-35-managed-start-failure
Product Code Baseline: 548ef0a65fa307a2af7932958236e0c5a7a0c932
Documentation Baseline: 本提案的最终干净文档提交，由批准问题绑定完整SHA。

结论：建议批准一个独立产品修复合同。A9-33只允许套件/装配的20路径，不能用于产品修改；A9-34处理恢复后的cleanup，仍保持延期，不借用其授权。本提案目前不生效、不改变任务索引状态。

## 1. 问题与证据界限

WIN7-45预演16已越过新会话超时，双Stop、快速退出通过。无效cwd探针返回A9_AUDIT_PERSISTENCE_FAILED，没有正常start_process结束事件，产生cleanup_required句柄，BG03-A01为FAIL；产品退出弹出后台处理对话框。精确run、原始材料及最终收尾见[A9-33失败报告](../reports/2026-10/a9_33_win7_45_rehearsal16_product_block_2026-10-15.md)。

源码中后台failed状态会触发managedAuditFailure；ready失败没有完整清理证明时保留cleanupRequired。这些路径支持当前现象，但还不能把接口错误直接等同于SQLite磁盘写入失败，也不能仅凭PID消失断言未创建子进程。修复前须以原始DB、事件、helper结果和绑定源码区分正常启动失败、真实审计失败、无子进程证明和未知生命周期。

## 2. 可批准的精确范围

只允许以下9个实现/测试路径中的本问题最小改动：

1. src/runner/src/trusted-shell-runner.ts
2. src/runner/src/background-process-manager.ts
3. src/runner/src/native-transport.ts
4. src/shell/product/a9-agent-runtime.js
5. src/runner/tests/trusted-shell-runner.test.ts
6. src/runner/tests/trusted-shell-runner-contract.test.ts
7. src/runner/tests/background-process-manager.test.ts
8. src/runner/tests/native-transport.test.ts
9. src/shell/tests/product/a9-background-tools.test.ts

允许维护新任务书、索引、现有STATUS/STATUS_LOG和本问题证据报告。批准后先登记APPROVED_FOR_IMPLEMENTATION与准确Source Baseline，再建立该基线的隔离分支；不得在A9-33分支借扩大白名单实施。

不改native源码/协议/锁/版本、依赖、历史取证组件、UI、API/Schema/持久化格式、权限或所有权模型；不新建ADR、不改Accepted ADR。若现有JS/协议证据不足以证明生命周期，或需要上述变更，停止相关实现，提交准确扩展材料再裁决。

## 3. 行为与不变条件

- 启动前可确定的无效cwd可以正常拒绝，明确helper/child未启动；若添加cwd预检，它只证明检查当时的事实，不替代检查后的实际启动/清理证据。
- 已启动helper但ready失败时，仅完整且同实例绑定的终态/清理证明可以确认cleanup。没有证明继续UNKNOWN/cleanup_required，继续阻止后续派发，不能靠PID不在表中清除。
- 有证明的正常启动失败保留一次规范的失败tool_end及审计；不得把正常业务拒绝误标为磁盘审计失败。真实审计失败仍硬停，后续Provider/工具请求为0。
- 既有健康启动、双Stop、重复Stop、正常退出、release所有权和取消的语义不变；不增加超时，不减少断言，不把failed/UNKNOWN改成PASS。
- 启动前refused不能冒充启动后的ready失败清理。两条路径必须分别测试、分别报告；若后者无法在现有运行时安全制造，保持NOT_PERFORMED/UNKNOWN，并向负责人提出明确合同裁决，不能自动给BG03通过。

## 4. 成功条件与本地检查

先最小复现原始失败，不先改实现。至少覆盖：不存在cwd、cwd为文件/读取拒绝、中文空格有效目录、helper已启动后的ready失败且清理证明完整、证明缺失或错实例、检查后目录变化、真实持久化审计失败和健康启动/Stop/release回归。反例在旧代码失败，修复后通过；缺证明场景必须继续被拒绝。

先构建runner及实际消费者，测试必须加载当前新dist；全部消费者结束后才恢复被跟踪生成物用于干净提交，不能先还原旧dist再证明新行为。执行受影响runner测试文件及a9-background-tools真实运行时测试、verify:quick、docs:check和diff检查；按影响补回归，不默认重做未变native双构建或产品全量。

Node20开发机/Mock或受控模型只计对应层级，不计Electron/Win7。固定准确提交后另开全新Codex会话独立复核，0P0/0P1才准备新目标输入。任何接口/协议/原生变更或超出9路径的实现需求先停，不扩权。

## 5. 目标验证、Git与停止条件

建议同次批准上述范围经必需检查后的本地提交及必要任务记录，不推送。与A9-33的本地整合待新修复SHA及独立报告形成后，给出准确清单再裁决，不提前合并。

本提案只授权本地实现、验证和独立复核。新任务的目标包、source/ZIP/authority、run/新根、最短实机阶段、预算和时间窗形成准确材料后另报执行；不把A9-33旧远端授权借给新任务。后续实机证据须覆盖正常业务失败与有界生命周期收尾；完整A9-33仍需两次连续成功、双干净构建、冻结、新关口A和正式独立复核。

身份、完整性、权限、安全、必需审计或未知生命周期失败立即停下游；同类两轮失败先共同根因，不续整批。保护全部旧ZIP、候选、run、数据库、首失败、HALTED与UNKNOWN。旧失败不得恢复或改判。

不授权Win10、下载/安装、系统/安全设置更改、强杀未知进程、native/锁修改、冻结、门A/B、正式运行、发布、推送、ADR-0155接受或A9-32 DEVELOPER_VERIFIED。

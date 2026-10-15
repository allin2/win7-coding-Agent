# A9-35 后台启动失败本地修复（2026-10-15 UTC）

结论：9路径授权内修改了3个产品文件和2个测试文件。开发机Node20.17.0的runner四文件119项、产品运行时17项和verify:quick通过。准确代码提交由独立复核启动提示绑定；独立复核尚未进行。Electron、新包、Win10、Win7均NOT_PERFORMED。本轮不能关闭A9-33的BG03实机缺口。

## 1. 基线、授权和首失败

批准文档基线d1b5275f6bc46253d2b16990c42f9f19ca2ee858，产品基线548ef0a65fa307a2af7932958236e0c5a7a0c932。负责人回复“批准”后，4文件文档登记提交dd7b92fd1ca4de606358b228feb822c21ef4c253，docs:check355/50通过；产品字节未变。隔离工作树为`/Users/qlyf/.codex/worktrees/a9-35-managed-start-failure/win7-coding-Agent`，分支codex/a9-35-managed-start-failure。

合同为[A9-35](../../tasks/A9_35_MANAGED_START_FAILURE.md)。只本地实现、验证、独立复核和提交，不推送，不与A9-33整合，不启动新远端执行。

预演16的原FAIL与UNKNOWN保持，见[A9-33首失败报告](a9_33_win7_45_rehearsal16_product_block_2026-10-15.md)。旧DB/WAL/SHM只读，未访问凭据。带WAL的只读分析副本确认turn active、缺tool_end、pid=NULL与cleanup_required。接口错误不能据此认定真实磁盘写入失败；具体helper原始启动结果没有被产品事件保存，仍UNKNOWN。

## 2. 最小复现与修复

先补测试再改实现。绑定旧产品代码的red-runner-corrected.log有4项行为失败：不存在cwd、cwd为文件、stat遭EACCES、错requestId的完整清理回执；red-shell.log有1项行为失败：受控ready拒绝且清理证明完整，却被运行时当成审计故障、缺正常失败结束。初次EACCES测试因对TS导入getter执行spy失败，red-runner.log保留，该次不能算行为反例；改为对真实fs模块spy后重跑。

trusted-shell-runner在后台分支进入helper与记录intent之前stat检查cwd，已知不可用或非目录返回明确未启动事实。检查不证明以后状态，检查后目录变化仍按真实helper结果保留UNKNOWN。没有增加权限、原生API、协议或依赖。

运行时只对cleanupRequired未明确为false的failed句柄保留原硬停；清理已证实的正常失败作为失败tool_end落库。持久化异常仍走原blockManagedAudit，不恢复后续派发。SQLite BEFORE INSERT触发器实际制造终态审计失败，验证新请求不再发送；原starting及late-output审计失败回归保持。

manager消费终态及ready拒绝的清理结果时，额外核对同requestId、协议版本和profile。缺证明、错请求/版本/profile或不完整清理字段保持cleanupRequired，不凭PID消失清除。补充profile反例在第一版修复仍失败（red-profile.log），随后修复并通过。

## 3. 检查与证据等级

证据根为该隔离树`.acceptance/a9-35/`；所有测试使用既有离线依赖、Node20.17.0。未安装或下载。

| 检查 | 结果与证据 |
|---|---|
| verify:quick（依赖先构建，含lint/build） | PASS，verify-quick-final.log |
| runner四文件（trusted-shell-runner、contract、background-process-manager、native-transport） | PASS 119，runner-final.log |
| a9-background-tools真实运行时与SQLite | PASS 17，shell-final3.log |
| 当前dist消费者身份 | current-build-consumer-identity.json；实际加载新runner和adapter，再恢复跟踪dist用于干净提交 |
| docs:check与diff | 提交前实际检查，结果登记任务记录 |
| Electron/实际D-013 helper/新包/Win10/Win7 | NOT_PERFORMED |

17项含3个当前dist消费者场景，实际Core→产品运行时→当前runner/adapter→manager→SQLite，但helper为受控替身。完整清理、缺清理与预启动拒绝分别断言；预启动拒绝零helper、零句柄、一次failed tool_end，turn不再active。既有健康启动、中文空格所有权、Stop/release、迟到输出和真实审计故障均回归。

中途修正测试的两类问题保留日志：shell-green2.log的结果JSON格式断言改为解析JSON；shell-final2.log暴露旧release替身遗漏profile字段，补齐协议既有字段后通过，未弱化生产校验。未将测试工具错误或夹具错误算产品反例。

## 4. 未关闭项与后续

实际native-transport对没有execution_started的v3 execution_result仍按既有协议顺序拒绝；error帧也不包含完整清理证明。本轮未修改该协议或放宽判据。因此完整ready失败清理仅为受控manager/产品消费者证据，实际helper与Win7均NOT_PERFORMED。无效cwd的预启动拒绝不能冒充BG03的启动后ready失败清理证明。

准确代码提交后全新Codex会话独立复核；形成0P0/0P1报告后，再给负责人准确修复SHA、报告和整合清单。A9-33本地整合、新目标执行与上述验收缺口裁决均待负责人批准；冻结、门A/B、正式运行和完整Alpha2未授权，旧失败不改判。

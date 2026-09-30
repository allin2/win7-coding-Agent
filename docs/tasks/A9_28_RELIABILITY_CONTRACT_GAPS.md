# A9-28 — A9-26 验证证据与上下文预算合同遗漏修复

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: RELIABILITY_HARDENING
Target Branch: codex/a9-alpha2（实现采用独立工作树与 codex/a9-28-contract-gaps）
Source Baseline: 本任务书批准提交
Phase-Gate: A9_28_DEVELOPER_VERIFIED
Win7-Validation: WIN7_42_REPORT_VERIFIED_GATE_B_PENDING
Decision: ADR-0148
```

2026-09-30 负责人在当前对话批准本任务书，修复后继续原流程。依据 [冻结前复核报告](../reports/2026-09/a9_27_premerge_contract_review_2026-09-30.md)，只修两项已复现的 A9-26 合同遗漏，再恢复 WIN7-42 流程；不重构，不引入依赖。

## 1. 可观察成功条件

1. 编辑后验证成功，再运行退出码非零的验证命令，无论输出较小、较大或 Runner 抛错，最终均 unverified，旧 verificationEvidence 清除；中性查看命令仍保留已成功验证，后续新变化仍清除。
2. 每次实际 Provider 请求估算字符不超过预算。固定前缀、当前用户输入、工具参数或必须保留的最后工具结果使请求无法压缩至预算时，发送前结构化失败，超限请求零发送。
3. 不静默裁剪用户输入或最后工具结果，不拆散 tool_calls/tool 配对；半预算重试也遵守同一硬门，错误信息可读且脱敏。

## 2. 允许路径与最小实现

- `src/core/src/a9-agent-loop.ts`：验证判定读取截断前结构化执行结果，失败/异常/无法判定时清除旧验证；Provider 发送前处理不可压缩超预算。
- `src/core/src/a9-context-budget.ts`：表达压缩后仍超预算的结构化结果或错误，保持完整轮次与工具配对。
- `src/core/tests/a9-agent-loop.test.ts`、`src/core/tests/a9-context-budget.test.ts`、`src/core/tests/a9-verification-evidence.test.ts`：新增回归与负向对照，不删除或放宽既有断言。
- 文档：本任务书、任务索引、STATUS/STATUS_LOG、DECISIONS/索引、A9-26 执行记录、A9-27 任务/交接书与本轮报告。
- W42 直接受影响验证仍按 A9-27 §4 的套件允许路径；批准后补强 W42-24 的“成功后大输出失败”与 W42-26 的“不可压缩超预算零发送”实机断言。

不得修改其他产品模块、Gateway、Runner、State/schema、native、依赖或旧候选。

## 3. 验证与交付

先固定失败回归，再最小修复；Node 20.17 下 Core 全量、verify:quick、docs:check、diff 检查及 W42 直接相关 package/Shell 检查；每项至少一个去掉保护的负向对照。
补覆盖固定前缀、当前输入、工具参数、最后工具结果与半预算重试；断言实际请求零发送而非只检查预算配置。
开发机通过并审核后并入 alpha2，WIN7-42 未冻结，可据新准确源码重新预演、双构建冻结；历史候选不改。
正式 Win7 结论仍由 A9-27 门 A、实机证据及门 B 签发，不能由开发机结果替代。

## 4. 非目标与待裁决

不修复本轮报告登记的继承审计失败、SSE/Provider 结束语义风险；它们需真实产品整合复现与单独治理，不把未执行验证写成 PASS。
负责人需批准本草案及 W42 补强范围后才可修改产品。验证通过后，合并前审查仍需对继承风险作明确处置。

## 5. 执行记录

- 2026-09-30：负责人批准 A9-28，按本任务书两项合同修复与 W42 补强范围实施；A9-29 继承安全风险另行等待批准。

- 2026-09-30：最小修复、开发机必需检查及负向对照通过，独立复核后并入 alpha2；详见[开发机修复记录](../reports/2026-09/a9_28_a9_29_developer_closeout_2026-09-30.md)。Win7 尚未执行。

- 2026-09-30：WIN7-42 正式实机执行完成，源 `94385a8`，run-id `92d693e0-e80a-4d58-9f7f-aaff5ec69bd3`；30 项 / 25 阶段及 Win7 报告复核通过，证据哈希相等，零残留、零真实秘密。[执行与合并前检查材料](../reports/2026-09/a9_27_win7_42_execution_and_premerge_2026-09-30.md)已交负责人独立审核；门 B / main 合并仍 NOT_PERFORMED，不自行记最终 PASS。

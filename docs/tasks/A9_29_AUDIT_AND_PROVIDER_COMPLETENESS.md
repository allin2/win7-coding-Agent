# A9-29 — 必需审计故障与 Provider 响应完整性修复

```text
Status: DRAFT_PENDING_OWNER_REVIEW
Task Type: SECURITY_AND_RUNTIME_HARDENING
Target Branch: codex/a9-alpha2（A9-28 后在独立工作树与 codex/a9-29-audit-provider 实现）
Source Baseline: 本任务书批准提交及已审核的 A9-28 结果
Phase-Gate: A9_29_DRAFT
Win7-Validation: NOT_PERFORMED
Decision: ADR-0149（批准后追加）
```

本草案不是实现授权。依据[冻结前复核报告](../reports/2026-09/a9_27_premerge_contract_review_2026-09-30.md)，修复两项已在开发机内存整合入口复现的继承风险；不将它们称为本次新增回归或 Win7 现场事件。

## 1. 可观察成功条件与最小契约

### 必需审计

产品将持久化审计与可降级的 UI/观察回调区分，必需审计在 A9 产品装配中不可省略。
tool_start 持久化失败时零 dispatch；tool_end 失败后停止后续工具，明确保留已发生副作用。
最终事件持久化失败时返回明确的审计不完整状态，不伪造已持久化事实；故障收尾不能因再次写失败存储而产生未处理异常。
观察回调单独失败不得错误阻断已正常审计的执行。保持既有 Policy、批准、取消、checkpoint、Renderer 隔离与脱敏链。

### Provider 完整性

保留真实 finish_reason，禁止因存在工具调用而覆盖 length/content_filter。
工具执行必须有明确匹配的 tool_calls 结束原因，并随后收到 DONE 或正常 EOF；兼容不发送 DONE 但有明确终止原因的服务。
仅 EOF 或仅 DONE 且无结束原因不足以执行工具；stop 与非空工具调用组合为协议矛盾。
length/content_filter、未完整或矛盾响应零工具执行；工具 ID、名称、参数、配对仍独立验证。空流不虚构 Completed。
异常响应不自动重试可能产生副作用的工具；已有超限、取消、TLS 和 Provider 秘密保护不减弱。

## 2. C14 允许路径（批准后冻结）

- `src/core/src/a9-agent-loop.ts`、`src/core/src/index.ts`：必要审计端口、故障语义及完整性消费边界；只改本任务相关内容。
- `src/shell/product/a9-agent-runtime.js`：必需审计装配，与事件投影/UI 观察回调分离；不新增 IPC。
- `src/gateway/src/provider/openai-compatible.ts`、`src/gateway/src/provider/sse-parser.ts`、`src/gateway/src/types/index.ts`：结束语义与响应完整性；不改网络权限或持久化格式。
- `src/core/tests/**`、`src/gateway/tests/**`、`src/shell/tests/product/**`：新增针对性回归与故障注入；既有断言不删除、不放宽，只允许明确契约变化所需的严格等价更新。
- 文档：本任务书、任务索引、STATUS/STATUS_LOG、DECISIONS/索引、本轮报告和 A9-27 相关任务/交接书。
- WIN7-42 套件沿 A9-27 §4 允许路径扩展为 30 项：新增 W42-29 审计故障、W42-30 Provider 完整性；原 W42-01～28 判据保持并纳入 A9-28 补强。

禁止其他产品模块、State/schema、native、依赖、旧候选和历史证据改动；不安装目标机软件。

## 3. 验证与交付

先保留失败回归，分别实现审计与 Provider 小提交。使用真实 A9 Runtime + 真实 SQLite 的隔离测试库验证审计故障，不能仅证明可选观察者抛错。
覆盖 tool_start、tool_end、最终事件写入失败和观察回调失败的控制组，准确断言副作用计数、后续工具零执行与结构化诊断。
Gateway→Core 覆盖正常 tool_calls/DONE、tool_calls/EOF、stop 文本、无结束帧、length/content_filter、矛盾结束、空流、未闭合工具参数、取消与既有字节上限。
Node 20.17 下 Core/Gateway/Shell 全量、verify:quick、docs:check、diff 检查；W42 包测试与每项保护的负向对照完成后独立审核。
开发机通过后恢复 W42 两次预演、双构建、门 A、实机、报告复核与门 B；目标平台证据未执行即 NOT_PERFORMED。

## 4. 批准与边界

建议负责人批准上述完整性兼容策略、允许路径及 W42 扩为 30 项后执行。若策略需要进一步调整，先更新本草案并取得明确裁决。
本任务只关闭两项合并安全阻断，不顺带重构或开放 Shell streaming/后台进程等能力；A9-28 两项合同修复由其独立任务负责。

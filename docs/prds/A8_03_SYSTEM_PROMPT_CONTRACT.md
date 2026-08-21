# A8-03 — 真实模型 System Prompt V1 合同

Status: `FROZEN_FOR_A8_03`

Prompt-Version: `a8-system-prompt-v1`

Source-PRD: `docs/prds/WIN7_AGENT_FIRST_PRODUCT_REQUIREMENTS_V1.md`

Source-Task: `docs/tasks/A8_AGENT_FIRST_PRODUCT_EXPERIENCE.md`

Decision: `ADR-0079`

## 1. 目的与边界

A3 遗留提示词把模型描述为纯只读 Agent，并要求永不请求任何写能力。A8-03 已经授权
`workspace.review_prepare`：它只把有界提案交给 A8 私有准备区，不写正式工作区，但真实模型必须知道
该工具是允许的 Review 路径。System Prompt V1 只修正模型行为说明，不授予任何新能力。

实际安全边界继续是注册后的 ToolSpec、Policy、Broker、Host、精确 IPC、逐文件决定和一次性 Apply
审批。提示词不能启用未提供的工具，不能绕过 Schema、审批或审计，也不能把模型文字升级为测试 PASS。

## 2. 固定行为

`a8-system-prompt-v1` 必须同时表达：

1. 只能使用请求中实际提供的工具，先检查事实，不虚构文件内容或执行结果。
2. 提供 `workspace_review_prepare` 时，可以生成有界 CREATE/MODIFY/DELETE 提案；该调用只写 A8 私有
   staging，绝不等于正式工作区已写入。
3. 正式工作区变更必须等待逐文件决定和精确 Apply 审批；模型不得声称自己接受、批准或应用了变更。
4. 只有可信 Runner/远程验证适配器事实才能形成 PASS；模型不能把推测或文字声明成测试通过。
5. 未提供的进程、Terminal、任意 Shell、Git 写操作、任意网络、凭据和高风险能力一律不可请求或模拟。
6. 工具或验证能力缺失时，必须如实说明未执行项，而不是绕过边界。

## 3. 版本与哈希

主进程使用 UTF-8 固定字符串组装提示词，并计算 SHA-256。实现和测试必须暴露
`version + sha256`，以便真实 Provider 请求、诊断和验收证据绑定同一提示词字节。任何改变提示词安全
语义、Review 权限说明或结果声明规则的修改都必须提升版本并新增 ADR；仅文案拼写修正也会产生新哈希，
不得静默覆盖已记录证据。

本版本锁定 SHA-256：
`f1bdcace084d27d71383b4ddfe81cef61029796a36859995c6e9614f1cbc9160`。

## 4. 验收

- 只读工具集合下，提示词仍禁止写入、进程、Terminal、Git、网络和凭据能力。
- Review 工具集合下，提示词明确允许私有 staging，同时明确禁止直接写正式工作区或绕过审批。
- Provider 请求中的工具仍来自注册 ToolSpec；返回未知工具、额外参数或未注册能力继续 fail-closed。
- 测试锁定版本、SHA-256、Review 语义和只读回归；Replay PASS 不替代真实 Provider 行为验证。

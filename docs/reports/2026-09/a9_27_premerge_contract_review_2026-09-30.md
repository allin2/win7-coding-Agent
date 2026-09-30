# A9-27 冻结前产品合同复核（2026-09-30）

结论：暂停当前产品源码的候选冻结与合并；A9-27 套件准备可继续。两项 A9-26 合同遗漏已在开发机 Core 实际入口、模拟 Provider/Runner/Workspace 端口下复现。
本报告不是 Win7、真实 Electron 或真实 Provider 通过结论，相关结果为 NOT_PERFORMED。后续内存整合复核又确认两项继承安全阻断，见下文与 [A9-29](../../tasks/A9_29_AUDIT_AND_PROVIDER_COMPLETENESS.md)。

## 已复现的两项阻断

| 项 | 观察 | 合同与定位 |
|---|---|---|
| P1 验证失败大输出仍 verified | edit → npm test 成功 → npm test 退出码 1、stdout 20,000 字符 → completed / verified，依据仍为此前退出码 0；小输出相同失败路径为 unverified | [A9-26 R1-03](../../tasks/A9_26_RELIABILITY_BATCH_1.md)；a9-agent-loop.ts 的工具结果在 1347 行截断，再于 1374 行 JSON.parse，异常路径未清除旧证据 |
| P1 上下文预算无不可压缩硬门 | contextBudgetChars=16,000、当前输入 17,000 字符，实际发送 18,974 字符且 completed | [A9-26 R3-01](../../tasks/A9_26_RELIABILITY_BATCH_1.md)；a9-context-budget.ts:34/58 与 a9-agent-loop.ts:750 |

独立顾问先在 Node 20.17.0 内存转译源码复现；主代理随后用同一 Core 入口复现，并增加小输出失败对照。
主代理脚本与原始 JSON：`.acceptance/preflight/A9-27-20260930/reproduce-contract-gaps-v2.cjs`、`contract-gaps-v2.json`。
该脚本只读加载产品源码，没有修改产品、使用真实凭据或执行 Win7 操作。
产品 Runtime 将用户输入限制为 8,000 字符，因此 17,000 字符实验仅表示 Core 入口边界。补充 v3 通过有效大小的 20,000 字节项目说明和 11 字符短输入复现固定前缀突破预算：实际发送 22,068 字符，预算仍为 16,000；脚本与 JSON 同目录另存 v3，未执行 UI/Win7。
主代理首次脚本因相对模块路径错误未执行产品实验，原文件保留，修正版另存 v2；以上数值均来自 v2 成功运行输出。

## 基线归属与边界

顾问通过 git show 内存加载 main 比较：失败大输出保留 verified 是 main 已有行为；A9-26 已明确承诺失败验证改为 unverified，小输出已修，大输出遗漏。
上下文字符预算是 A9-26 新能力，其不可压缩边界遗漏阻断预算合同完整结论。
修复不能通过调整 W42 夹具、放宽断言或使用旧候选 PASS 解决。A9-27 §4 不允许修改产品，最小修复草案见 [A9-28](../../tasks/A9_28_RELIABILITY_CONTRACT_GAPS.md)。

## 另行登记的继承风险

- 审计失败：Core onEvent(tool_start) 抛模拟错误后 edit 仍执行；产品 runtime 的回调绑定到 SQLite recordToolEvent，Core 捕获后继续。真实 SQLite 故障与产品 Runtime 整合复现 NOT_PERFORMED，不能称本次新增回归。
- Provider 结束语义：顾问模拟传输的空 SSE EOF、未终止工具帧以及 Core length/content_filter 存在普通完成行为；main 同源。显式 truncated=true 路径已有保护，不等于其他结束语义已覆盖。真实 Provider 复现 NOT_PERFORMED。

这两项不纳入 A9-28 最小合同修复草案，不自动扩大 A9-27 范围。

## 补充：继承风险内存整合复现

主代理已复核顾问实验，使用未修改的真实 A9 Runtime/Core/State 和真实 SQLite 内存数据库；只用内存文件 Map、Provider/Workspace 端口桩隔离外部副作用。
正常控制组有 tool_start/tool_end 各一条、edit 一次；SQLite trigger 拒绝 tool_start 的故障组仍 edit 一次，tool_start 为零、tool_end 为一，结果 ok=true 且记录 eventHandlerErrors。
Gateway→Core 的模拟流中，合法工具参数但无结束原因 EOF、length、content_filter 三组均 edit 一次；JSON 未闭合控制组 edit 零次。空 EOF 虚构 Completed 并进入 completed。
两项均为 main 继承行为，但已复现违反必需审计与未完整响应零执行边界，列为本次合并 P1 阻断；修复草案见 A9-29。
完整脚本与原始 JSON：`.acceptance/preflight/A9-27-20260930/reproduce-inherited-integrity.cjs`、`inherited-integrity.json`；未使用真实网络/文件编辑或 Win7。

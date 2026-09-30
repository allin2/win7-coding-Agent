# A9-28 / A9-29 开发机修复与审核记录

结论：四项冻结前阻断已修复并完成开发机验证；已并入 `codex/a9-alpha2`，尚未合入 main。Win7 验证为 **NOT_PERFORMED**，W42 套件仍在补强，未冻结候选。

## 源码与范围

- A9-28：`bd27a77`、`d086d41`，整合提交 `bddaef9`。失败验证从截断前的结构化 Shell 结果判断并撤销旧证据；所有 Provider 发送和半预算重试均拦截不可压缩超预算请求。
- A9-29 审计：`68f637a`。必需持久化端口先于观察回调；写入失败停止派发，准确保留已发生副作用；Runtime 返回审计不完整并阻止未重新打开工作区的重试。
- A9-29 Provider：`9ec2e58`，整合提交 `186e850`。完整工具流必须明确以 tool_calls 结束；正常 EOF 兼容，无结束原因、矛盾结束、终止后数据、空流、非法工具参数均停止执行。
- 三个旧 Gateway 场景在 A9-28 基线也失败；夹具由 node -e 改为实际验证脚本，保留原 verified 断言，并补强实际请求角色与环境说明断言。

## 验证证据

Node **20.17.0**。A9-28：Core 32 suites / 506 tests PASS，目标回归与移除保护负向对照 PASS；原两项输出压力测试保留相同字节上限和断言，以多字节内容及显式输入预算隔离输出上限。

A9-29：Core 33 suites / 520 tests、Shell 49 suites / 478 tests、Gateway 17 suites / 284 tests 全部 PASS。verify:quick、docs:check、diff 检查 PASS。真实 Runtime + SQLite 触发器覆盖 tool_start、tool_end、最终事件及全部审计故障；Gateway→Core 使用真实临时工作区验证正常 EOF 可编辑、异常响应零编辑。

负向对照移除必需审计端口、终止帧保护、非法参数停止保护后均红；源码恢复 SHA-256 与对照前相同。开发期间失败迭代日志保留，不将其写为通过。

原始日志：

- `/Users/qlyf/Developer/win7-coding-agent-a9-28-contract-gaps/.acceptance/a9-28-evidence/`
- `/Users/qlyf/Developer/win7-coding-agent-a9-29-audit-provider/.acceptance/a9-29-evidence/`，最终日志为 `core-full-final.log`、`shell-full-final.log`、`gateway-full-final.log`、`quick-post-review.log`、`docs-post-review.log`；负向对照为 `main-negative-controls.json`。

独立只读复核已关闭这四项开发机阻断；该复核不是目标平台验收。W42-24、26、29、30 必须使用当前产品重新取得目标平台证据；W42 两次预演、双构建、门 A、正式执行、报告审核与门 B 尚未执行。

# A9-33 第20轮独立复核：BG 探针前页面重载（2026-10-15 UTC）

结论：预演15仍在p05的无效cwd探针前出现新会话超时。两轮同类失败后，执行代理已暂停整批重试、回收原始证据并完成受控最小复现。修复仅在每个独立BG启动探针前复用已有真实页面重载入口，再走原按钮和产品守卫。准确复核提交由启动提示词绑定，不能复核未提交工作区。

## 1. 对象与证据

工作树 `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent`，分支 `codex/a9-33-batch2-win7-acceptance`。基线 `14f2b8f49cdea6eb3ba3ab02be9d0311582ec261`，第19轮全新会话已对该基线报告0P0/0P1/0新增P2；详细报告归档 `.acceptance/a9-33-review/codex-conversation-ready-round19-20261015/independent/codex_final_report.md`，SHA-256 `6abf905aec65f87d62c638d451c471b347e9ceb77392140435aa871af0226c32`。本轮只审新修复及相关测试，不重新审清理、扫描器、原生、其他历史修复或产品实现。

Win7实机预演15身份REHEARSAL_NOT_ELIGIBLE、账本FAIL；源14f2b8f…、ZIP `41075834ecfbbd758e2015856c2be6b3af71dac591b79d79513115f496ab9da3`、run `b60538f9-2f19-40f5-a624-6b2580d817b2`、授权 `8b13d885924353f3025fe885a108700f6549158c54422b7becaa875322d6597b`。p01～p04 PASS；p05 ERROR/退出1，phase-result.status原值NOT_PERFORMED，BG01/BG02断言PASS，S06重启及BG03完整A01/A02未执行；p06～p10未派发。旧预演不恢复、不改判。

证据根 `.acceptance/a9-33-rehearsal/rehearsal-15/`：

- `r7/hash-comparison.json`：完整228文件逐一大小及SHA-256匹配，0缺失额外。
- `r7/evidence/requests/05-p05-session-bg/driver-session_bg.json`、`driver-launches.json`、`phase-result.json`、`r7/evidence/request-ledger.jsonl`：原始失败与调用时序。
- `r7/evidence/data/p05-session-bg/a9-state.db`：只读immutable读取，SHA-256 `9900177d9a049a8e2523dc4afef1266938900134482be6bd0d3a97781d233036`；fast Turn于06:43:14.537Z完成，fast managed PID3812最终exited，其后没有create IPC。`diagnosis-db-facts.json`为只读摘要。
- `r8/postflight.json`：103进程、相关命中0、本次任务0；`postflight-managed-pid-readback.json`：6个命令PID及driver PID均未在当前表出现，不推断退出码。没有终止或额外清理。
- `r7/local-secret-scan.json`：160文件、0命中、正控检出，不补签未执行p10。
- `PROTECTED_SHA256SUMS.txt`：301件包/输入/首失败材料，清单SHA-256 `9d8ec83700c2327958afdbd81ab8a9efaec76e9074a6d60bc9fbf51d2e1cc169`。

负责人已授权本轮及后续同范围本地提交、不推送；预演及请求预算可按既有§6.56直接推进。预算在预演15前从92提到124，本轮消费5，累计92/124；连续成功仍0。总截止沿用2026-10-16T06:59:59Z。门A/B仍只由负责人签。

## 2. 最小复现与修复

先读AGENTS.md、WIN7_CONSTRAINTS.md、任务适用合同和§6.64～§6.65。源码只读核对既有KL-3刷新行为：产品submitPrompt在Turn返回后停止轮询并最终刷新；后台进程可能稍后退出。conversationBlockReason按实际后台活跃数量限制切换；驱动直接snapshot/settleResidue读取不会更新目录DOM。第19轮的测试每次sleep自动渲染，遗漏“后端已允许但页面仍保存旧禁用状态”的情形。

受控复现直接执行当前renderer目录渲染及驱动waitFor/newConversation/reloadRenderer/fastOutcome源码；新增场景不在sleep自动重绘，只在模拟真实页面重载时按当前后端事实渲染。旧fastOutcome下三项失败；新修复下新旧共7项通过。实机没有保存失败按钮当时属性，因此具体实机根因仍是与源码、时序和受控复现一致的推断，不补写为已观察事实。

修复为fastOutcome开始处await既有reloadRenderer，然后原newConversation、submit、waitIdle及判据全部保留。重载仅刷新renderer，不重启main/runtime、不修改守卫、不直接create IPC、不强制启用、不延长20秒点击预算、不改变BG03判据或已登记KL-3产品限制。该同一reload入口已在本次p05的S06第一部分执行，s06-after-refresh.png/s06-part1.json保留；未引入新的目标运行时能力。

新增用例覆盖旧目录刷新后只点击一次、真实busy/会话数量满仍失败、reload失败后零点击零提交。执行代理的最终必需检查以任务记录及reload-fix-*日志为准；这是开发机证据，不是新字节Win7通过。

## 3. 独立复算与交付

只在启动提示词指定的新根可写。原树、主工作区、数据库、候选、历史证据只读。不读凭据、不联网、不访问Win7/Win10、不下载、不运行Electron/PowerShell、不提交推送、不删除、不启动子代理。Node20.17.0离线依赖逐条链接，排除@win7-agent；clone --no-hardlinks。先verify:quick构建依赖，只在自己的克隆恢复runner/dist，再执行任务§4所有检查。沙箱回环listen EPERM单列UNKNOWN，不充当产品发现或变异拦截。

至少自选4个相关反例、4个变异。重点覆盖旧DOM不自动重绘、实际reload完成后才执行下一探针、reload异常/未完成保持失败、真正busy/数量满不绕过、重载不清空main进程里的受管事实。先过可运行基线，再变异；具名行为断言失败才计拦截，语法/编译/沙箱失败不计；逐次恢复原字节。不必重跑历史全部变异。未返回调用的既有中断保证和历史KL-1～KL-12不重开。

报告分P0/P1/P2/信息，给准确文件行、原始证据、全部命令结果、反例/变异和恢复身份。详细报告与CLI最终回复分开保存。明确是否建议在准确新提交上重建新预演输入；整批重试只有本地诊断、检查和独立复核完成后才恢复。正式双构建、冻结、门A/B及正式运行NOT_PERFORMED；任何Alpha2结论继续携带KL-3、KL-5、KL-6a、KL-7及a/b/c边界。

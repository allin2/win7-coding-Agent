# A9-33 第19轮独立复核：新会话按钮就绪（2026-10-15 UTC）

结论：WIN7-45预演14在p05的新会话等待超时。执行代理已在两个白名单文件修复驱动，未提交、未独立复核。请在固定新提交后另开全新独立会话复核。准确对象SHA由启动提示词绑定，不能以未提交工作区代替。

证据层级：故障为Win7实机预演，身份REHEARSAL_NOT_ELIGIBLE，源 `3d19c4d981eb2cd3b249309128f1275077cb6461`、ZIP `e228c3dce66227a9690e29ed013fb0f9e2dfc343caec28dfd8d0c588a2a0d1fc`、run `969b0015-46e8-4b73-821e-94fb8d3cef54`。新修复只有开发机证据，不是Win7通过。

## 1. 对象与原始证据

仓库 `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent`，分支 `codex/a9-33-batch2-win7-acceptance`。先读AGENTS.md、WIN7_CONSTRAINTS.md、任务书适用合同、§6.62～§6.63。前轮清理修复已获第18轮独立关闭，不重新审扫描器、清理实现、产品和原生代码；产品源码只读用于核对驱动假设。

原始证据均在 `.acceptance/a9-33-rehearsal/rehearsal-14/`：

- `r7/hash-comparison.json`：完整228文件大小和哈希匹配。
- `r7/evidence/requests/05-p05-session-bg/driver-session_bg.json`、`driver-launches.json`、`phase-result.json`：驱动ERROR/退出1，阶段账本FAIL；部分未执行字段保持原值。
- `r7/evidence/data/p05-session-bg/a9-state.db`：双Stop返回stopped/cleanupRequired=false；快速退出Turn于05:55:39.079Z结束。随后没有新的创建会话IPC，无效cwd探针及release未运行。读取须只读；没有WAL时可用immutable模式，不能对原始数据库写辅助文件。
- `r8/postflight-final.json`：当前无相关进程和本次任务；不推断后代退出码。第一次通用任务查询错误原样保留。
- `driver-fix-red.log`、`driver-fix-green.log`、`driver-fix-jest.log`、`driver-fix-verify-quick.log`、`driver-fix-node-test.log`：执行代理的开发机检查。

原始包、旧失败、历史HALTED和UNKNOWN保持。预演14不恢复、不改判。连续成功预演0次，累计请求87/92。门A/B仍由负责人签。

## 2. 最小修复

只改驱动 `newConversation()` 和合同测试，均在任务书§6.1白名单。旧实现只尝试点击一次；按钮禁用时跳过点击，之后只等ID变化。真实渲染器依据 `conversationControls.canSwitch` 与会话数量设置按钮禁用，因此快速Turn结束后的UI刷新边界可让点击被跳过。

新实现仍用原20秒总期限。循环先等待实际按钮可用并点击一次；成功点击后只等会话ID变化，不重复点击。点击回执异常时保持失败，不重试可能已发生的动作。不通过IPC直接创建、不强制启用、不绕过产品限制、不增加超时。没有产品或依赖改动。原始故障没有保存按钮当时属性，刷新竞态是受源码和反例支持的推断，实际效果由新预演核实。

四个新增用例直接取产品 `renderConversationDirectory` 和驱动 `waitFor/newConversation` 运行，只有DOM及时间/IPC结果为受控输入：延迟可用后只点击一次；永久禁用或会话数量满时不点击；接近截止才可用时仍按原总期限失败；点击回执异常不重复动作。最初3例在旧实现上2项断言失败、1项通过；补充回执例在初版修复上失败。最终完整Jest276、包测试120、verify:quick及驱动语法检查通过，见同目录 `driver-fix-final-*` 日志。

## 3. 独立复算与交付

仅在启动提示词指定的新复核根可写，原工作树、主工作区、数据库、候选和证据只读。不联网、不连接Win7/Win10、不运行Electron/PowerShell、不读凭据、不提交/推送、不启动子代理。使用现有Node20.17.0和离线依赖链接，排除指向主工作区构建产物的@win7-agent链接；克隆使用--no-hardlinks。

先构建依赖 `npm run verify:quick`。之后按任务书§4运行两个包测试、两个Jest文件、docs:check、diff检查。新增用例用 `-t 'rehearsal 14'` 定位。沙箱回环监听受限时逐项UNKNOWN；不得计为产品发现或变异拦截。

独立核对失败位置与源码，区分实际观察和刷新竞态推断。至少自选4个相关反例和4个变异：禁用不点、可用后单次点击、点击后异步切换不重复、总期限不延长、点击/快照异常保持失败。先过可运行基线，变异必须有具名行为断言失败，恢复文件字节；不必重跑历史70项变异。

报告按P0/P1/P2/信息分级，给文件行、原始证据和命令结果。详细报告与CLI最终回复分开写。明确是否建议在新准确提交上构建新的WIN7-45预演输入；新修复的真实Electron/Win7行为仍待后续预演。已知KL-1～KL-12和原信息边界不重开；任何Alpha2结论继续带KL-3、KL-5、KL-6a、KL-7及a/b/c边界。

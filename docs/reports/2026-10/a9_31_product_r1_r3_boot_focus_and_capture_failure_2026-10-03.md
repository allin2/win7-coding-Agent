# A9-31 product r1：R3 普通桌面 Boot 首失败与捕获缺口

## 当前结论

R3 普通桌面启动已直接通过；第一项 Boot 在焦点夹具失败与进程捕获缺口后 `HALTED`。没有 `dispatcher-result.json`，Boot 不得登记 PASS，也没有取得同窗口重试证明。Shell 和其余六组未派发。A9-31 保持 IMPLEMENTATION_IN_PROGRESS，Win7 NOT_PERFORMED。

## 准确执行与原始证据

目标 `192.168.1.4 / WIN-2JQ66JE4HTQ / Windows 10 build19045`。实际 dispatcher PID32184，creation ticks639266172461044846，SID1005，Session3，Medium8192，ElevationType1，非提升、ordinary、无 Host Job；started `2026-10-03T09:40:46.4821232Z`（北京时间17:40:46）。worker34536、Electron4196重新通过相同完整身份门。Administrator SSH仅调度、读取与回收。

source `35a19250ed6589f6a7ba35b940a784325970c111`；master `82c2e55c0a25dd6d3098448c326c31183f0c9b2eec37fa0d1fd91cfed8cdb452`；revision `2b54b4a35d865f2fe02c1c2cac00f6270240360dccf1ab8f4944608f121b57b8`。
Boot request `979976d3260e49a7a316bf8c0e604971`，worker started `2026-10-03T09:47:09.5080691Z`。产品/锁/helper/Electron与R3合同相同，没有重编、重新装配或覆盖历史候选。

回收根 `.acceptance/a9-31-developer/product-r1/controller-r3-boot-first-failure/`，13个原始文件逐项长度/SHA核验；包含请求、worker/driver/controller/dispatcher记录、截图、SQLite主文件和信号。`collection-index.json` SHA-256 `eabad0447543db9db3f93f3764bcae51ed2f378c50576daede6b3167029e2248`，原始传输stdout/stderr独立保留。

| 原始文件 | SHA-256 |
|---|---|
| evidence/driver-final.json | `d9063732770b384424fb23f4b09ccd6d1b5c901d76bacd79d0cd3b464f0a0790` |
| evidence/controller-final.json | `e9d0db35df574f71ac75d8d797f80c74a27849bcdea2335e720dd41329f043b1` |
| dispatcher-global/dispatcher-final.json | `d67e3d22f68d973a73d242a40164fb5c0d0b9837c39c95539ce195e33fd34dbe` |
| evidence/first-failure.png | `fdd585eb40329e6c78a1434b4bed747f8903ce215281f599172286701649b906` |

## 已证明与失败边界

实际 Electron22.3.27/Node16.17.1/ABI110/SQLite3.43.1、可见1120×760窗口、Renderer无process/require且存在Schema IPC API三项断言通过。首个红项 `ASSERT:INPUT_FOCUS`；Provider requests、helpers、工具输出均0。不能把三项局部断言当作整个Boot或native执行PASS。
截图显示必选工作区权限模态框仍打开；`a9-workbench.js`的syncComposer在模式未选择时禁用task-prompt。夹具把Full Access表单选择放在后面的setupProvider，却在此前测试输入焦点，顺序错误。这支持夹具前置缺失的判断，没有证据表明产品焦点能力失效。

两层监督器分别于 `09:47:14.5085431Z / 09:47:14.5095458Z`报告 `LIFECYCLE_OBSERVED_CHILD_NOT_PINNED:13524`。冻结serve第29行先获取Toolhelp快照、再用PowerShell逐行GetProcessById和New-Pinned；存在快照与实际句柄绑定之间的竞态窗口。当前诊断未保存该PID的Exe及底层异常，因此具体进程用途、是否由退出竞态引起保持UNKNOWN，不能断言已查明全部原因。
已有若干观察实例在final中exit_code UNKNOWN；随后只读查询全部列出PID均不存在，只能证明后来未发现这些PID，不能补出原退出码、完整树清理或13524身份。原HALTED及UNKNOWN不改判。

## 已授权的本地修复与检查

仅原四路径中的product-r1-driver.cjs已修正：先检查未选择模式时输入被禁用，经真实产品权限表单选择隔离工作区Full Access，等snapshot及Renderer输入/模态框状态一致后才聚焦并断言；setupProvider复用已完成的模式事实。未移除焦点判据，不直接修改DOM disabled，也不绕过Schema IPC。恢复阶段已有Full Access时不重复表单操作。
本地语法、54项请求/物理接口/硬失败分类和784项物理包闭包检查PASS。driver SHA `8972f4c80df990d9f42132e7510eec58926675d9d9716ffe08474e89c587e85a`。
检查记录 `r3-focus-fixture-local-repair-20261003T095221Z.json` SHA `9a71e3abdda13487916a9628e7e873a69aa1b2908ee2b0bd3077f3c9f44e5b19`；四份R3冻结脚本尺寸/hash再次全部相等。修复后真实焦点NOT_PERFORMED，没有部署新driver或复活R3。

## 后续准确材料

[R4具体合同](../../plans/A9_31_PRODUCT_R1_R4_CAPTURE_RETRY_APPROVAL.md)和ADR-0161 Proposed覆盖冻结PS的捕获/失败收尾修复、新准确根及新master，保留所有未知项；未获批不实现该部分或写远端R4。新窗口仍须普通桌面一次启动；普通driver重试无需每次启动，真实退出对话仍按实际产品按钮操作。
旧产品/native及全部历史材料保持，不提交、推送、合并、发布或修改账户/系统策略。ReleaseExit丢回执/取消竞态仍未完成；独立收口及Win7不包含在此次测试结果内。

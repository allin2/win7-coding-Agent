# A9-31：R8新根——StopExit/ReleaseExit/Recovery最终字节续验与人工点击流程

日期：2026-10-05。Status: DRAFT_NOT_APPROVED（修订稿r2，仍未批准）。请求批准§1–5的新根执行；本材料尚不构成实现、远端执行或第八根授权。

修订说明：r1（SHA256 `0d0e3ab6e152835bd89805f84875fa874fba53eb9633e4ab4d040d11d11c52c3`）发出后，负责人对D1–D4作出取向裁决（见§6），本稿据此定稿；**前置P1、P2尚未取得，且负责人尚未批准本草案任一版本**，裁决D1–D4不是批准。负责人此前对R7合同（SHA256 `73646d58787a1fee7062a74bddfffb37114b1a7d4e816ed8cbb164d62ab5fa4e`）的批准及其D4（不预授权第八根）**不延伸**到本草案。

## 1. 基线、R7结果与根因

工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`，HEAD `ebda91123e62b225c3fd104c9c9b564a4b61c466`。产品r3 ZIP/manifest/native/锁/capture库、观察器C#源（SHA256 `b949ba520eb103548cfd08a578d76df1d3d48e46089045188dc7b4b1df112a7d`）、R7控制脚本与driver字节不变，仅换根与哈希绑定；不恢复R4–R7任何HALTED入口。

R7（master `8027d5f0383f650c9dade1aacb9a9d3935eaf9a1641312f03cbbaacab7fc8146`，矩阵`.acceptance/a9-31-developer/product-r3-retry-r7/win10-evidence-matrix-r7.json`，交接[handoff §11](../reports/2026-10/a9_31_r5_manifest_proof_handoff_2026-10-05.md)）在普通账户（SID1005/Session3/Medium8192/非提升/noJob，直接核验）取得EncodingSecurity PASS（71项）与FailureBoundaries PASS（41项），观察器终态均核对通过、完整回收零不符。**StopExit三次均未通过，入口HALTED（5/16请求）**：

| 尝试 | 对话框弹出→点击 | 结果 |
|---|---|---|
| 第1次 | 160.5秒 | FAIL（`TIMEOUT:actual native exit dialog choice`，超120秒限时；非HALT） |
| 第2次 | 263.7秒 | FAIL（同上） |
| 第3次 | 3.8秒 | **HALTED**：返回`response=1`（“留给系统后退出”），StopExit要求`response=0`（“停止后退出”），`ACTUAL_NATIVE_EXIT_CHOICE`失败触发`SAFETY_DRIVER_HARD_GATE` |

**根因（人工操作，非产品或控制器缺陷，已由证据证实）**：对话框在控制器启动后约5.2秒弹出并一直保持打开，120秒限时自弹出起算（两次迟到点击时对话框仍开着，点击被记为终态后观察）；第三次提前就位并加45秒提前量后点击仅3.8秒，但点的是第二个按钮。产品对话框按钮从左到右为`[停止后退出] [留给系统后退出] [取消]`，`defaultId=0`（回车即第一个），`cancelId=2`（Esc/取消返回2，同样不满足要求）。StopExit须点第一个，ReleaseExit须点第二个，两者相邻易混。选择不符属硬门，设计上不得降级。

**证据分布**：R5（旧控制器/driver）Boot/StopExit/ReleaseExit；R6 Boot、Background短/完整、ready预期负例、Shell；R7 EncodingSecurity、FailureBoundaries。**最终字节上仍无通过记录的phase：StopExit、ReleaseExit、Recovery**（Recovery从未在Win10真实重启，其driver重启文件名修复只通过Node16自检）。修复后的conhost父进程种类分支在普通环境从未被真实缺口放行（仅真实数据回放通过）。

R7入口HALTED不恢复，续验须新根。准确新本地根`.acceptance/a9-31-developer/product-r3-retry-r8`，远端`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261005-R8`，两者须不存在。批准后先在任务书登记准确六源（C14）再实施：`product-r3-retry-r8/control-scripts/{stage-product-r3.ps1,launch-product-r3-desktop.ps1,serve-product-r3-desktop.ps1,product-r3-driver.cjs}`（与R7字节相同，仅根与哈希绑定不同）与`product-r3-retry-r8/event-sources/{manifest-process-observer.cs（与R7字节相同拷贝）,launch-manifest-observer.ps1（仅根常量）}`。

## 2. 相对R7的全部变更（仅此）

1. **无任何功能代码变更**：控制脚本、driver、观察器源与R7相同，仅根与哈希绑定换为R8；观察器在R8重新编译（新EXE/MVID/pin，不冒充继承），沿用既有10个API，无新增依赖或系统API。不修改产品/native/锁/capture、任何断言、对话框规则、SYNC、九字段请求；不修改任何Accepted ADR，批准后另行追加ADR。
2. **人工点击流程固化为合同（§4）**，替代“靠人小心”：就位确认、提前量、每次只报一个按钮名、“不确定就不点”、失败分类与重试上限。
3. 全套定向检查照旧重跑，含真实缺口回放与manifest绑定。

## 3. 新根、准入与容量前置

准备前C空闲须≥2GiB，且stage首次运行同样要求≥2GiB。**当前空闲约2.59GiB，新建R8根约0.62GiB，创建后约1.97GiB，会低于stage门槛而硬停**，故须先腾出空间（见P1）。根≤1GiB/5000文件，每请求空闲≥1GiB，返回≤128MiB；旧根R1–R7及其evidence/runs、数据库与历史文件保留。观察器准入最多三轮、每轮≤12个固定cmd/PowerShell根（沿用）；除conhost外的短命System32子进程出现87仍直接HALT（D2不变）。定向检查全套重跑：schema/api/interval/entry/files-scope/sync-actual（备fresh变体，失败结果保留、至多三次）/sync-current、Node16×20行（含重启证据自检）、package-held、manifest绑定40项、真实缺口回放16项（夹具沿用hash固定的R6真实证据）。失败规则同R7。

## 4. 执行顺序与点击流程

新普通入口一次，120分钟、最多16请求。仅三个phase：**StopExit → ReleaseExit → Recovery（最后）**。Recovery最后的理由不变：它是唯一从未真实重启的路径，放最后以免其未知阻断烧掉两个点击phase的证据。

**事实**：对话框在发布后约5–8秒弹出（控制器启动后约5.2秒），保持打开直到被选择；限时120秒自弹出起算。

**按钮（从左到右，示意）**
```
 [ 停止后退出 ]   [ 留给系统后退出 ]   [ 取消 ]
   第1个/回车         第2个             不要点，不要按Esc
```
StopExit只点第1个（点击或按回车）；ReleaseExit只点第2个（须点击，回车会选第1个）。

**每次尝试的固定步骤**：①负责人先把Win10远程画面切到前台并回复“就位”；②代理在消息里写明**本次唯一要点的按钮名**与发布时刻（UTC），并等待45秒提前量；③请求发布后约5–8秒对话框弹出，负责人立即点击，期间不回到聊天窗口；④代理从证据中读取`native-exit-dialog-*`直接计算弹出→点击耗时与`response`，不凭感觉。**“不确定就不点”**：看不清按钮或不确定位置时，宁可让120秒耗尽——超时只是FAIL且可重试，点错则是硬门并烧掉整个根。

**失败分类与重试**：超时（FAIL，非HALT）可在同一入口内重发该phase；每个点击phase最多3次尝试，每次重发前须负责人重新“就位”；点错按钮已证实触发HALT（R7第三次）；按Esc或点取消的结果未经实测（对话框返回`response=2`、产品随即不退出，可能表现为硬门或超时），保守按HALT处理，同样不重试、按§5另报。原FAIL与证据全部保留，不延长限时，不降级错误选择，不放宽对话框断言。

每请求：观察器就绪（心跳、绑定、self-test、events可读）核验后才发九字段请求；30秒接单检查；终态后由代理发停止信号，核对观察器终态、零丢失、会话停止、无遗留实例及proof与记录的逐条对账。每phase逐size/SHA完整返回、秘密扫描、SQLite副本检查及输入后飞行；更新统一报告、STATUS与矩阵r8。启动入口后请勿在窗口内点击；标题出现“选择”按Esc一次。

## 5. 失败与边界

任一HALTED保存全部证据，不恢复、不创建第九根，另报批准；若仅Recovery失败，StopExit/ReleaseExit证据保留，Recovery单独另报。本批准不含：产品/native/锁/capture修改、系统/账户/ACL/服务/计划任务改动、删除、强制结束旧实例、提交/推送/合并/发布、委派、独立验收、Win7、第九根，不自签DEVELOPER_VERIFIED（取得全部直接证据后向负责人报告，由负责人裁决）。全部Win10结果均**未在Win7实机验证**。本代理会话无可用的桌面控制工具与手机推送，所有点击由负责人完成；最终汇总须标明跨根证据组合（R5/R6/R7/R8）及各根控制器差异。

## 6. 前置、已裁决项与剩余待办

- **P1（前置，未取得，容量）**：请先在Win10上自行腾出空间至空闲≥4GiB（旧根R1、R1-R2、R2-R1、R3-R1至R7的`host/package/inputs`共约6.3GB，均可由ZIP重建；请勿动各根的`runs`/`evidence`）。代理不执行任何删除。未取得P1前不创建根（否则创建后空闲约1.97GiB，低于stage的2GiB门槛）。
- **P2（前置，未取得，界面确认）**：请确认您在R7第三次看到的对话框确为`[停止后退出] [留给系统后退出] [取消]`三个按钮、顺序如上；若不符请说明实际文字与顺序。
- **D1（负责人已裁决）**：顺序StopExit → ReleaseExit → Recovery（Recovery最后）。
- **D2（已同意）**：每个点击phase最多3次尝试（超时可重试）；点错按钮不重试。
- **D3（已确认）**：R6/R7遗留的入口窗口与Electron进程（107280、77944、42732）由负责人自行处理，代理不结束任何旧实例。
- **D4（已确认）**：不预授权第九根；任何HALT按§5另报。
- 剩余：取得P1、P2；负责人对修订稿（以其SHA256为准）作出明确批准。批准后按§1先登记六源C14并追加ADR，再实施。

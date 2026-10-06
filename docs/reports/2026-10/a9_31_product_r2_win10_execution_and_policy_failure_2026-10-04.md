# A9-31 产品r2普通Win10执行：最短后台通过，高影响确认失败（2026-10-04）

本轮结论：**Boot与后台最短链路直接通过；完整Background在永久删除确认边界失败，下游停止。** A9-31仍IMPLEMENTATION_IN_PROGRESS，未签DEVELOPER_VERIFIED；独立收口及Win7均NOT_PERFORMED。源码、包、原生与锁没有修改。

## 1. 入口、基线和授权

工作树仍为`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`，HEAD `898ee9459a9b987840e94ddef336556ea58dd389`。
沿用已批准[r2 Win10合同](../../plans/A9_31_PRODUCT_R2_WIN10_VALIDATION_APPROVAL.md)原§1–5。负责人表示“如果远控输入不行，我可以手工参与”，随后回复“已启动”，允许普通桌面入口由负责人一次输入；其他身份/完整性/期限/请求/证明门不变。未恢复R10，也未管理员启动产品。

- 产品ZIP：`d7323ac4f6ddb674eb93fdea2cd2007ed62679268afe37a6df8df29115122c47`；manifest：`1c5084a4a8d194e33af48d6c15d3e661f0808931558eacf41b849016816b6225`。
- master：`46441acf952c0ee64ccb21b863c3909f6cc56583f068d88ce3ff0d673ce3b821`；helper/锁/PS/capture DLL保持准确原字节。包仍为开发包，无正式authority。
- WIN-2JQ66JE4HTQ / Windows10 build19045；Administrator SSH仅派发/查询/回收，产品在A9 Builder普通桌面执行。
- dispatcher PID99292、creation ticks639266934531482455；SID `S-1-5-21-3031939772-989444280-3099258187-1005`、Session3、Medium8192、Ordinary=true、Elevated=false、InJob=false。worker/Electron各run实际token同门通过。
- 本地时间14:50:56启动，15:11:18取得dispatcher真实退出码0；5/16请求。窗口已停止，claim/final不可复用。

## 2. 五个不可变执行run

| 执行 | run ID | 结论 |
|---|---|---|
| 受控Boot失败 | 34d00e00ab61418290debd358bdaefc7 | 原driver FAIL：ASSERT:CONTROLLED_ORDINARY_FIXTURE_FAILURE；其他7项通过，worker及产品树退出。按约定只证明普通失败边界 |
| 同dispatcher正常Boot | 822f819d58274330a105529d12bf7df9 | 8项直接PASS：锁定运行时/窗口/main-preload隔离/模式/焦点/784闭包/native锁加载；窗口截图已读取 |
| Background最短链路 | a4d1c916a19743efbd6c64c599ec9804 | 28项直接PASS：starting先落盘、真实start/read/Stop、双路输出、SQLite终态、大小写/斜杠/中文空格归属、错属/归档拒绝 |
| 完整Background首失败 | 524f390d04ab4a3793cca19aa9660ec4 | 49通过/1失败；ASSERT:CURSOR_REPEAT_ACCEPTED。夹具从历史结果误取已停止句柄游标，产品正确拒绝错属；原FAIL保持 |
| 游标夹具修复后Background | 1c1848e6c2d446438f0e6ab355c2dfbb | 69项已通过，但TIMEOUT:target-bound high-impact confirmation；未出现确认而真实helper/删除命令已派发，整组FAIL |

最短路径的历史facts检查使用真实SQLite的安全备份，由本包A9PersistenceManager重新打开；只证明facts查询，不声称接管历史native/stdout或未建立UNC共享实机PASS。
完整Background的重复/错属/未来/过期游标、3/4句柄限制、双Stop及活动模式切换等已执行断言保留；不得据数量把整组失败改为通过。ready失败及其后检查未到达。

r3 revision `e84a724c72c94ca068b39489c612573b735b8082a5d0a29c844a077dbfe09b50`仅将BACKGROUND_SHORT_ONLY改为false。
r4 revision `2221ebd10784c77a51bd974c5680a69ff06761b1664b0f2b2864f0e3e48ffa97`仅按当前handleId选取游标，并加强句柄匹配断言。两者均完成本地Node20和实际Win10锁定Node16的syntax/73自检/88回执构造检查及目标闭包冻结；固定PS/API/安全段不变。原r1/r2/r3及首失败不覆盖。

## 3. 已证实的产品Policy缺口

普通run `1c1848e6…`真实账本中：tool_start事件159为`start_process`，command是对隔离`confirmation-must-not-run`路径的`Remove-Item -LiteralPath … -Force`；事件160记录ownership，161为background_started回执，165为真实输出。批准事件0，实际第5个helper已启动；fact对应PID109424，最终exited。
测试marker从未创建，命令没有用户数据目标；marker不存在不能证明批准边界正确，也不能把未确认派发改为PASS。

`src/core/src/a9-agent-loop.ts`将start_process映射为shell后走同一Policy。`src/core/src/policy.ts`的checkAlwaysConfirmOperation仅覆盖结构化delete.permanent、Git、发布与系统操作，没有识别直接Shell永久删除。实际包Policy纯函数复读对相同命令返回ALLOW，安全Write-Output为ALLOW、git push为ASK；该复读在Mac Node20执行且没有执行任何底层Shell命令，只是静态消费者诊断。普通桌面派发事实来自本轮Windows真实账本。

[A9-M03](../../prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md)要求Full Access的永久删除也绑定可见目标一次确认；[A9-31](../../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)要求start仍走该确认。不能更换一个已能确认的命令来遮蔽此反例。当前Win10批准不包含产品修改，policy.ts也不在A9-31现有产品白名单；因此只完成诊断和[具体本地修复提案](../../plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)，未写产品实现。

## 4. 停止、捕获与状态边界

实际持有dispatcher句柄后创建固定stop.json，取得退出码0。dispatcher保留112个真实树实例退出；合并worker独有记录后116个不同PID/creation实例均有实际held-exit证据。后飞行116个原实例均未观察存活，query unknown0；后飞行不补签exit。
两次完整Background各保留一次cmd/ver短命OpenQueryHandle错误87/原creation与exit UNKNOWN；准确只读同步回执按原合同闭合。回执不证明该观测的kernel cleanup，原错误不抹掉；其他产品/native/worker树仍走真实句柄。

raw dispatcher-final的COMPLETED只表示停止，passed_phases中的Background来自最短范围，不等于完整组PASS。当前矩阵明确：Boot PASS；Background shortest PASS；Background full FAIL；Shell/EncodingSecurity/FailureBoundaries/StopExit/ReleaseExit/Recovery全部NOT_PERFORMED；独立/Win7 NOT_PERFORMED。

## 5. 原始回收、扫描与保护

新根1546物理文件/713683524bytes；原1067准备文件逐hash不变，两个明确junction负例的准确路径/目标不变且不跟随。新增479文件/43568598bytes完整返回并逐尺寸/SHA核验。首次三run170文件与后台首失败134文件独立早返回也保留，不重复计入新增总量。
479返回文件的固定合成秘密UTF8/UTF16LE/Base64扫描：输出0命中；两份固定serve源中的显式测试输入字面量保留。该扫描不替代尚未执行的EncodingSecurity、背压与Win7门。

本轮另保留本地命令长度拒绝、回收规划2MiB上限误拒三个4202496bytes的Electron cache、前置reader默认64KiB误拒完整树receipt、只读SQLite首次忽略WAL/错列及第二次错误facts检索等取证输入问题；修正取证方法后按完整原字节回收/读取，没有放宽controller证明门或丢弃原始结果。SQLite分析只打开新字节副本并正确应用WAL，原DB/WAL/SHM未变。

证据根仍为`.acceptance/a9-31-developer/product-r2/`；当前统一继承矩阵为`win10-evidence-matrix-r4.json`，以本轮实际普通run替代准备阶段的入口阻塞状态，历史矩阵保持。关键记录：ordinary-policy-failure-sqlite-diagnosis-r3.json、ordinary-policy-boundary-stop-r1.json、ordinary-final-inventory-r1.json、ordinary-final-delta-return-verification-r1.json、ordinary-return-secret-scan-r1.json、ordinary-post-stop-observation-r2.json。
源码HEAD/index/实现、主工作区、原包与依赖及历史材料最终保护检查另存。本轮没有提交/推送/合并、原生重建、锁/账户/系统变更、R10恢复、代理委派或Win7。

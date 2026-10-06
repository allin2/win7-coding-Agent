# A9-31 R9 普通桌面部分通过及时间边界硬停止

日期：2026-10-04。结论：`R9_DESKTOP_PARTIAL_EVIDENCE_HARD_HALTED`。A9-31保持`IMPLEMENTATION_IN_PROGRESS`，不能登记DEVELOPER_VERIFIED或Win7 PASS。

## 1. 绑定与已完成内容

按[R9具体批准](../../plans/A9_31_PRODUCT_R1_R9_SYNC_PROBE_RECEIPT_APPROVAL.md)执行，产品source `35a19250ed6589f6a7ba35b940a784325970c111`，分支`codex/a9-31-background-tools`。
master `6e2131f085fc6f20cd4d96992bb16ce2965c5f10886bbda12a155f8796340266`；正常revision `e6c6394dbd399ce67908789ff86d411252dcc3321b818a7fae578474e22d7501`。
Computer Use在准确A9 Builder CMD启动一次。dispatcher PID121956、creation ticks639266722749291059，实际SID1005/Session3/Medium8192/普通/非提升/无Host Job。
UTC窗口00:57:57.8906202至02:57:57.8906202，最多16请求；实际第四请求即硬停止，期限未到不构成继续授权。

| 工作 | 当前直接证据 | 结论 |
|---|---|---|
| 受控普通Boot失败 | run `f39734ea557c491fad07d7b4858842a5`，指定断言失败、真实树结束 | `FIXTURE_FAILED_TREE_CONFIRMED`，保留FAIL |
| 同窗口正常Boot | run `2560c22dcdac41d68b8d7d88c26094ba`，8项通过、worker/Electron退出0 | PASS；与前项同PID/creation/master |
| Shell | run `67f6cecfddd14c389499687ca0c95bef`，22项通过、真实树结束 | PASS；tick退出前可见、双源顺序、先落盘后IPC、刷新及焦点/滚动 |
| EncodingSecurity | run `9801bf8c11424d8bb7bc4746b546e887`，54项断言通过后捕获硬门失败 | HALTED，整组不PASS |
| Background、FailureBoundaries、StopExit、ReleaseExit、Recovery | 无后续请求 | NOT_PERFORMED |

编码组实际完成UTF-8中文逐字节/CRLF/无换行、双源秘密分块脱敏、大输出真实退出7/截断、Stop、打包解码器CP936/UTF-16LE切分对照。
随后cp936-native真实链路开始，但捕获硬门中断；它及后续UTF-16LE native、慢消费者补充不能凭前面断言宣称通过。
实际cmd-ver的首查询87与直接同步退出回执分别保留；仅该准确只读调用按ADR-0167关联，其他进程仍走真实查询合同。

## 2. 首失败与原因边界

worker原错误`LIFECYCLE_OBSERVED_CHILD_NOT_PINNED:132888`，dispatcher原错误`SAFETY_WORKER_HARD_GATE`。
观测`52a1ecc7877d4376adc09eecbed3be58`：PowerShell PID132888、父helper60928、Session3，步骤`SnapshotCreationBoundary`。

| 实际比较值 | UTC DateTime ticks |
|---|---:|
| snapshot开始 | 639266728756751271 |
| snapshot返回 | 639266728756791274 |
| 原查询句柄取得的创建时间 | 639266728756791480 |
| 查询时间 | 639266728756821269 |

创建时间超过snapshot返回206ticks，即20.6微秒；现合同严格拒绝，未进入第二snapshot同实例证明。原查询已取得实际PID/creation/Session/native映像，失败不是本次OpenProcess权限拒绝。
后续排空确实再次持有相同PID/creation/Session/父的实例并读到退出0，37个worker已持有实例全部结束、真实退出码已取得。
这只能证明后续实例与清理事实，不能改写首观测的ownership/exit UNKNOWN。worker unresolved保留1；dispatcher自身列表为空不覆盖worker缺口。
driver因controller-abort记录`LIFECYCLE_CAPTURE_FAILED`并halt=true，无普通重试。

源码使用`DateTime.UtcNow.Ticks`包围Toolhelp；`GetProcessTimes`取得进程创建FILETIME。不同UTC读数精度导致边界矛盾是有支持的推断，尚未经新时钟对照证明；不声称产品有缺陷或修复已经通过。
[Microsoft高精度UTC接口说明](https://learn.microsoft.com/en-us/windows/win32/api/sysinfoapi/nf-sysinfoapi-getsystemtimepreciseasfiletime)提供小于1微秒精度、最低Windows8。
拟仅在外部Win10捕获改用该接口，保留原严格边界和查询判据，详见[R10具体待批合同](../../plans/A9_31_PRODUCT_R1_R10_PRECISE_UTC_CAPTURE_APPROVAL.md)。它不进入产品/native或Win7运行前置。

## 3. 原始证据与后飞行

根`.acceptance/a9-31-developer/product-r1/r9-desktop-return/`，两Boot104文件/12382645bytes，Shell69文件/7690998bytes，编码及dispatcher-final128文件/10309252bytes。
共301原始文件/30382895bytes，逐尺寸/SHA-256一致，指定合成秘密及其Base64扫描零命中；数据库、日志、截图、查询失败、真实pin、同步回执和终态均保留。
编码inventory：`r9-encoding-return-inventory-20261004T011431266151Z.json`；证据复核`r9-encoding-halt-evidence-review.json` SHA-256 `384ff9c56f8596852f37d535d1cb2b3f9955cc4af341bbe649d5a1acf6f02925`。
新矩阵`r9-desktop-evidence-matrix.json` SHA-256 `f48124d553becaa83432927778b80fccd3478463b8b6171d12d6efc6fc955686`，原准备矩阵不覆盖。

UTC01:16:56只读后飞行：Win10/build19045、A9 Builder console Session3 Active、C空闲4811239424bytes；已记录PID当前均不存在。
顶层dispatcher未由外部保留句柄读取退出码，仍`UNKNOWN_NO_HELD_OBSERVATION`，不把当前不存在签成退出0。
UTC01:19:40重核产品784文件、宿主73文件及四原输入尺寸/hash全部通过；managed helper和capture DLL仍是原锁定字节，kernel32签名Valid。
首次只读编排误查product-manifest.json及control/master-pin.json，PATH_NOT_FOUND原输出保留；改读实际release-manifest.json及inputs/master-pin.json后成功，不属于产品缺文件。
一次Shell全量JSON读取SSH超时原状态未知；随后严格SSH和有界读取成功，不据此认定Win10休眠。所有传输/编排失败不改判历史记录。

## 4. 收口与下一步

R9已HALTED，不重启、不派发、不热改固定安全源。R10尚未批准、实施、编译或写远端；新增Win10-only API、Profile及新根必须先具体批准。
产品/native/managed锁、主工作区、全部历史候选/失败/UNKNOWN保持；无提交、推送、合并、系统/账户/ACL修改或委派。
独立收口、A9-32及Win7当前验收NOT_PERFORMED。

# A9-31 R10：Win10 部分通过及 Windows 工作区归属失败

日期：2026-10-04。结论：`PARTIAL_WIN10_PASS_BACKGROUND_MANDATORY_AUDIT_FAILURE`。
A9-31 保持 `IMPLEMENTATION_IN_PROGRESS`，未登记 `DEVELOPER_VERIFIED`；独立收口及 Win7 均 `NOT_PERFORMED`。

## 1. 当前有效绑定

执行依据为 [R10 合同](../../plans/A9_31_PRODUCT_R1_R10_PRECISE_UTC_CAPTURE_APPROVAL.md) §2–4 / ADR-0168。
分支 `codex/a9-31-background-tools`；产品 source `35a19250ed6589f6a7ba35b940a784325970c111`。
Win10 `192.168.1.4` / WIN-2JQ66JE4HTQ / build19045，Electron22.3.27 / Node16.17.1 / ABI110 / SQLite3.43.1。
实际桌面 SID `S-1-5-21-3031939772-989444280-3099258187-1005`、Session3、Medium8192、Ordinary、非提升、无 Host Job。
管理员 SSH 仅调度、只读取证与回收，不替代普通产品执行。

| 输入 | SHA-256 |
|---|---|
| 产品 ZIP | aae71bb0c446bda7e9bd04f58b51c208d02d4c723f13908e55cd077e0d2f10c0 |
| 产品 manifest | df70fa5bd2df2f91eeed8cf441006241442cea33cc6c622c82a92742ca97e7b9 |
| managed 输入锁 | 7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e |
| helper | 2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7 |
| R10 master | 2096c020df792abef26864ff8bc0ba1a26013ac42078777a05c1cd4069809625 |

初始普通 revision `fcb9501dbb3c8f6d930a049e09f128cc22303e164c3b10f7e5ed5a2cab7f8a48`；受控 Boot revision `7a69cb5b402e82d612e8f52c6036fa554a668f9b191f618f049cd402db1e8dac`。
编码夹具修订 revision `2637f296c7bb2a181643cdc2dad08c34c0db0875a16725e91a168b2c7092e972`，仅按 R10 §4 普通 driver 不可变版本合同登记；产品、三 PS、capture、master 及回执安全片段未改变。

## 2. 原始执行和需求矩阵

同一 dispatcher PID122268 / creation639266767036313449 共接收六个请求，保留全部失败，未在 Background 失败后派发任何新请求。

| 阶段 | run-id | 直接结果 | 实际控制器持有的树实例 |
|---|---|---|---|
| 受控 Boot | b007338497094d8b8d09b6e147a33fe7 | 预期 FAIL；7 项通过、1 项受控失败 | 7，退出码均已取得 |
| 正常 Boot | 96f27fe5c0354a97b7979420ea0744fa | PASS，8 项 | 6，退出码均已取得 |
| Shell | d1a3aa48baea47e0ab98d554071ed304 | PASS，22 项 | 13，退出码均已取得 |
| 编码/安全首轮 | 3dedee244652435897fc8e7ea5ea97b9 | FAIL，64 项通过、1 项慢消费者断言失败 | 47，退出码均已取得 |
| 编码/安全重试 | 95c88929c1d04ae3bd840fb378f0c6ef | PASS，70 项 | 56，退出码均已取得 |
| Background | 5dee77858e484e51b7380c9bcf9fa701 | FAIL；仅 9 项基础检查通过，首个后台启动超时 | 11，退出码均已取得 |
| FailureBoundaries / StopExit / ReleaseExit / Recovery | 未派发 | NOT_PERFORMED；必需归属审计失败阻断 | NOT_PERFORMED |

Shell/编码 PASS 仅绑定本报告准确 source、包、环境和各自 revision；不预先继承或改绑到将来的修复包。
编码首失败是夹具预算错误：700ms/回调超过固定串行 delivery 的5000ms等待预算，实际返回 `A9_OUTPUT_BACKPRESSURE`，不是应正常完成的正例。
原输入保留为超预算结构化失败/清理负例，180ms/回调新增预算内完整双源正例；旧 FAIL 不改判。
上述检查未证明 A9-31 背景句柄、游标、数量、release 或恢复产品行为通过，更不代表完整 S01–S06/第二批/Alpha2/RC。

## 3. 产品失败及因果依据

Background 的实际产品页面显示失败。原始 SQLite 仅有 `tool_start/start_process`，无 `tool_end`、无 managed ownership 事件，`a9_managed_processes` 为空；task/turn 仍为 active、outcome `{}`，这些中断事实不改写。
原始 driver 的 `helpers=[]`，错误为 `TIMEOUT:background-1 real PID fixture:`。九个已通过记录属于基础/Provider 检查，不能被当成 Background PASS。

真实数据使用同一工作区的两种字节表示：

```text
runtime 配置 / fact.workspacePath:
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261004-R10\runs\5dee77858e484e51b7380c9bcf9fa701\workspace

SQLite session / owner.workspace:
c:\users\a9builder.win-2jq66je4htq\appdata\local\a9-a31-product-r1-20261004-r10\runs\5dee77858e484e51b7380c9bcf9fa701\workspace
```

源码及包内编译方法一致：

- `src/shell/product/a9-agent-runtime.js:164` 生成 canonical workspace；`:1017` 的 fact 却保留 workspaceRoot 展示路径，`:1212` 的 owner 使用 canonical workspace。
- `src/state/src/a9-persistence.ts:1278` 使用 `origin.workspace_path !== fact.workspacePath` 作字节比较，即使 Windows 同一目录也拒绝。
- `src/runner/src/background-process-manager.ts:280` 在创建 helper 前要求 starting intent 审计成功；失败删除尚未启动的 entry 并拒绝。Runtime 设置 managedAuditFailure，后续审计派发被阻断，符合必须 fail closed 的设计。

用真实回收 DB 的 origin、实际 active-workspace 输入和**包内原方法**完成七项受控判断：同目录大小写不同返回 `A9_MANAGED_OWNER_MISMATCH`，canonical 同目录进入下一道 guard；不同 workspace、不同 owner workspace、错 conversation、错 turn、非 active session 均拒绝。SQLite facade 仅允许原 origin SELECT，任何写操作拒绝，记录 writes=0。
这是本地控制输入复现（模拟 `process.platform=win32`），不是新的 Windows 真实执行；它与原始 Windows DB、启动前调用顺序及现场共同支持路径比较为本次根因。Windows 现场未直接记录 State 原异常文本，不将受控异常冒充现场日志。
既有 State 测试只用 `/w`；Shell 测试将 canonicalizeWorkspacePath 覆盖为 identity，未覆盖 Windows 展示路径与 canonical 路径不同的情形。

## 4. 停止、回收、秘密扫描和后飞行

按既有 stop.json 合同结束 dispatcher；停止前用锁定 capture DLL 取得 PID122268 的实际查询句柄，核对 creation、SID1005、Session3、Medium、非提升、noJob 和映像，等待实际退出码 **0**，exit ticks639266781554822238，查询句柄关闭成功。
第一次停止包装记录因 raw dispatcher-final 超过 Read-Json 默认64KiB上限而记 UNKNOWN/`INTEGRITY_RECORD_SIZE`；原文保留，其中实际退出0和关闭成功字段也保留。随后直接 SFTP 回收736167字节原始 final 并按 inventory 验证 SHA，单独登记解析补充，不根据进程消失猜退出码。
raw final 的 `COMPLETED` 只代表调度循环已结束；passed_phases 只有 Boot/Shell/EncodingSecurity，不能解释为八组全部通过。

回收657文件 / 49075360 bytes，逐文件尺寸及 SHA-256 全部匹配；482证据/隔离数据/信号出口及175工作区夹具输入分类扫描，测试秘密明文/Base64零命中。图片二进制扫描不证明像素文字；截图生成前 DOM 秘密门及现有相应真实断言另行保留。
顶层143个实际持有的树实例全部已退出、逐项实际退出码已取得；顶层 dispatcher 退出证明单独记录，不把143写成互不重叠的业务进程总数。
后飞行首轮额外全目录检查发现准入 file-gate 的已授权 junction 拒绝夹具：`runs/c4cb2e43e0c546ff8e87ea5ac8bd29c7/workspace/reparse/inputs` 指向同 run 的 `workspace/valid/inputs`。原定义及 `actual_file_gate_reparse / INTEGRITY_REPARSE` PASS 对照保留；不删除夹具、不弱化运行时 reparse 门。
后飞行最终结果以 `r10-postflight-r2.json` 为准；目录/进程查询首失败及后续核对分别保留。

## 5. 可恢复证据入口

本地根：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r1/`。
远端根：`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261004-R10`。
原始 `.acceptance` 为忽略目录，本报告提供准确检索入口，不将其当成随 Git 自动交付的证据。

| 本地记录 | SHA-256 |
|---|---|
| r10-partial-validation-matrix.json | 8b95da8a5ec05ffaeec53f65d9795702cf905fbb3af0ff185018577f87321148 |
| r10-ownership-guard-counterexample.json | 2efe2605fdd1566ad205cfd80859b4ba7d5c973ca10b2e6b860ce9b884cff42c |
| r10-ordinary-return-review.json | 623b16d20ca8375e63a16173f7f2ba14376e1aeecbf47f556237b4f6b03ae0d7 |
| r10-ordinary-return-secret-scan.json | 285aba4a49a1c396ccba2464665ea87b26328ca26c8f70b5f21dbbdd875c2cf6 |
| r10-partial-stop-evidence-reconciliation.json | 28094511ea2dd9b154753e317622e6a8c4f85d5d2b2402e75540dbd31e7c83b0 |
| Background 原始 a9-state.db | 36be802f1194b64cda76d05c7e6c63f25c47b30fae7a1f145c7884de8911675d |

完整原始文件在 `r10-ordinary-return/`，精确逐文件清单 `r10-post-stop-return-inventory-r2.json`；首个后台现场另外保留在 `r10-background-first-failure-return/`。原始命令输入/stdout/stderr和受控方法复现输入均在同根，不覆盖首失败。

## 6. 后续及边界

[三路径本地修复材料](../../plans/A9_31_WINDOWS_WORKSPACE_OWNERSHIP_REPAIR_APPROVAL.md)已经形成，状态仍待具体批准。
R10 §4 明确“不改产品/native/managed锁”；因此本报告只做分析/取证/文档，未改产品或恢复调度。
拟在既有 A9-31 白名单内修复同目录判断并增加 Windows State/Shell 反例；不降低 owner/request/session/turn/释放审计。
修复通过后形成准确源码差异和提交材料，再固定新包/新控制器合同；旧 master 不热重绑。原生字节未受影响时按精确锁继承，不因本 State 问题重编 helper。
无提交、推送、合并、发布、删除、委派、Win7 或候选操作；主工作区改动和全部历史证据保留。

## 7. 最终后飞行补充

`r10-postflight-r2.json` 实际状态 `R10_POSTFLIGHT_NO_OLD_INSTANCE_OBSERVED`，SHA-256 `a47c7c8a00edc5a9f8306c3b9a7d2fc775e0dcb751eeb53785498b1c9c7a5178`。原 master 全784产品/73宿主及固定输入闭包复核通过；144个已知实例（143树实例加dispatcher）的PID/creation逐项查询未见原实例存活。此查询仅补充后飞行，退出码依据仍为原持有句柄。剩余空间4718342144bytes，八组全通过=false。
唯一junction与原file-gate拒绝夹具的准确path/target/run/结果一致，保留；首次全目录检查失败不覆盖。`r10-partial-evidence-index.json`汇总上述最终记录hash。

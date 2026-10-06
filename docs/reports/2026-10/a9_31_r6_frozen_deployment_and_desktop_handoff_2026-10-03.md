# A9-31 R6：容量恢复、定向检查、冻结部署及普通桌面交接

日期：2026-10-03（Asia/Shanghai）；分支 `codex/a9-31-background-tools`；HEAD/product source `35a19250ed6589f6a7ba35b940a784325970c111`。

## 当前结论

依据负责人已经批准的 [R6合同§1–5](../../plans/A9_31_PRODUCT_R1_R6_ENTRY_GUARD_APPROVAL.md)及 ADR-0164，容量恢复后完成了实际程序集/捕获/文件检查、入口拒绝/实例绑定/并发检查、固定源冻结及准确远端部署。远端实际装配验证了 **784 个产品文件、73 个宿主文件**，结果 `R6_STAGED_REUSED_FULL_CLOSURE_PASS`。

这证明准备闭包，不代替普通桌面产品证据。R6 新普通控制器、八组产品阶段与同窗口版本重试尚为 `NOT_PERFORMED`；A9-31 保持 `IMPLEMENTATION_IN_PROGRESS`。旧 R5 普通实例仍存活，跨退出观察没有取得退出码，保留 `UNKNOWN`；首次 R6 产品派发仍被旧控制器生命周期事实及新普通桌面身份门阻断。Win7、独立收口与候选均未执行。

## 容量及准确部署

用户告知空间已满足后，2026-10-03T13:03:11Z（21:03:11）实际复查 C 盘空闲 `6053187584` bytes；创建准确 R6 根前再次检查至少 2GiB。仅在以下批准根新增 inputs/control/requests/runs/evidence，以及合同允许的不可变 revision 和隔离 run 派生内容：

```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261003-R6
```

初始三 capture 文件逐字节沿用 R5：DLL SHA `71a2ef1487ef021d1094506ad0acb449b5a3766a99244ecd971cb4842f1f046e`、build SHA `753e66442fd17c4ce0c08b14590c4ec68fc909d3b51c6d5ea53e769b2a734a24`、原编译批准 SHA `bc3b6bfa7d5e301ccda81de2ec20f3ec38dada213113821690d15c2c41ff6575`。本轮执行批准独立为 `0e842c71e4e6b1aad14d461dcad636f5b831a62e005d404ca77140c6caf6f0b9`；没有重编译或改绑历史批准。

21 个后续准确目标以 CreateNew 传输，全部尺寸、SHA-256及 PS ParseFile 通过。装配记录：`r6-full-stage-20261003T131240525502Z.stdout.bin`，R6 根实际 `356611` bytes；该记录中的 execution 为 `NOT_PERFORMED`。21:13:21 再读 C 盘空闲 `5846409216` bytes。产品、host、managed helper、新旧锁均只读；不重新打包。

所有原始记录位于 `.acceptance/a9-31-developer/product-r1/`；历史[容量阻断报告](a9_31_r6_entry_guard_local_checks_capacity_block_2026-10-03.md)保留原文，不把旧阻断改为当时通过。

## 本轮检查与冻结身份

| 检查 | 结果及准确记录 |
|---|---|
| Node 语法/自测 | 原相同源的直接 PASS；68 项；`r6-node-syntax-20261003T123118307377Z.json`、`r6-node-self-test-20261003T123118307377Z.json` |
| 本地产品物理闭包 | 同源 784 文件直接 PASS；`r6-physical-package-20261003T123118307377Z.json` |
| 实际 PS5.1 三解析及协议 | 同源直接 PASS；5.1.19041.6456；271 判据，failed=[]；`r6-parse-20261003T123337608447Z.stdout.bin`、`r6-schema-20261003T123337608447Z.stdout.bin` |
| 实际 capture/API/文件 | 25 项 PASS，failed=[]；保留原 22 项，新增原批准缺失、错误字节及误用 R6 批准三项；`r6-actual-capture-tests-20261003T130733880574Z.stdout.bin`；run `cd32f85416ea4281a6461c4deb058b9f` |
| 实际入口/文件/并发 | 22 项 PASS，failed=[]；原 claim/start/ready/final/stop 分别拒绝，拒绝前后 hash 不变；实际 copied launch 在读取 master/创建 worker 前拒绝；文件绑定七负例；两 runspace 调用一个 GRANTED、一个 REFUSED，只有一份 claim 且无共享 final；`r6-actual-entry-tests-20261003T130940306188Z.stdout.bin`；run `f11996b60f6e42c28c638f3f3c956851` |
| ASAR 八负例 | `INHERITED_EVIDENCE`；`r6-physical-negative-inheritance.json` 绑定完整函数 LF 字节/调用/配置及 R3/R4 原记录 hash；不是普通 Electron 直接证据 |
| 准确远端部署 | 21 目标 hash/尺寸/PS ParseFile PASS；`r6-frozen-transfer-20261003T131222994370Z.stdout.bin` |
| 准确远端完整装配 | 784 产品、73 宿主及批准/检查/锁/四源闭包 PASS；`r6-full-stage-20261003T131240525502Z.stdout.bin` |

API/文件/并发准备执行者是 Administrator、Session0、High、InJob=true，只表示准备检查；没有运行产品，不能继承为 SID1005 普通桌面 PASS。程序集 API 探针受控制造的未知 PID 保留 `UNKNOWN`，断言它导致硬停止而非清理成功。

`r6-freeze.json` 与 `frozen-control-r6/` 保留准确四源、输入、检查和登记。固定三 PS 及安全协议不再热改：

| 绑定 | SHA-256 |
|---|---|
| master | `9c9812d130af5b982abbf2158c4b9162412a7024d337334aeaf9327fe44172cf` |
| 初始 driver revision | `c2fb083daa39e790537211f777f46eda5d704ca92efafd8a7de7d896660ea666` |
| checks | `c390c1691654fe8b1b7762600e55ad59f398131bf8734624cb2c4bb247cdd847` |
| registration | `31d1ba2af27ad0c12fcb425b3e7411b5f7caa76e3e6d5917dbb432192c917341` |

固定源哈希与上一份实施报告完全相同。仅普通 driver 后续可按同范围定向检查与新不可变 revision 登记重试，不覆盖本轮任何记录。

## 保留的首轮准备失败

入口并发夹具首轮因一律检查 `PowerShell.HadErrors` 退出 1，原 `r6-actual-entry-tests-20261003T130855847486Z.stderr.bin`、完整探针输入与隔离目录保留。新 run 改为同时检查实际调用结果和错误流，仅允许准确的失去所有权拒绝；取得 GRANTED/REFUSED 各一、错误流为空、唯一 claim、零共享 final。固定四源没有修改。

首次传输编排在任何写入之前因函数名 H 被 PowerShell 既有 Get-History alias 解析而失败，`r6-frozen-transfer-stage-20261003T131122897763Z.stderr.bin` 原样保留。改用明确函数名后重新验证目标未占用，再执行 CreateNew 传输；未覆盖既有文件。最终 stage stderr 仅有 Bitvise 许可证提示及 CLIXML 模块准备 progress，无错误项。

本地文档/台账编排首次因 stdin 源编码 SyntaxError 在解析阶段失败，没有执行追加；`r6-document-record-preparation-failure.json` 记录错误及边界。随后文档通过文件补丁追加、台账以 ASCII 编排写入，不改固定测试源。

## 旧 R5 生命周期及下一步

21:13:21 直接复查旧 PID36076、creation `639266265512707074`、Session3 仍存活，零产品 request，原 final SHA 始终 `39d6b4b13ae0f9f53a4497c7866d7d74c5e071119fdebd2c492568cd5c147967`。随后跨动作持有同一个实际 Process 实例 50 秒，旧实例身份再次通过 SID1005/Medium8192/非提升/noHostJob；观察结束仍存活、exit_code=`UNKNOWN`，未见未知子进程，旧 final 原字节不变。准确记录 `r6-old-r5-stop-watch-20261003T131518310154Z.stdout.bin`；watch `6aa70abc8b3c42e38243b542f3a89f20`。没有强制终止或恢复旧 R5。

UU 界面仍显示无法连接服务器，Computer Use 选择已知 Win10 目标没有得到 Win10 桌面。已请用户在 A9 Builder 普通桌面对旧 R5 窗口按 Esc 后正常关闭，并通过真实 Windows Run 入口启动新 R6 一次；普通身份和旧控制器不能继续派发的证据未满足前，不创建产品 request。若在持有观察之外退出，只记当前不存在及历史退出码未知，不补签 exit0。

新普通窗口就绪后按批准合同从 SSH 自动派发 Boot→Shell 和余六组，回收证据；必须补 ReleaseExit 丢回执/取消竞态及同窗口普通失败后的新 revision 成功证明。任何完整性/身份/审计/生命周期硬失败停止下游，保留历史结果。

21:17:39 最新直接快照仍为 `OLD_EXACT_INSTANCE_ALIVE`，R6 formal entry/start/ready/final 均不存在、零产品 request，C 盘空闲 `5912838144` bytes；记录 `r6-desktop-entry-snapshot-20261003T131739896236Z.stdout.bin`。该事实不把等待启动记为产品失败。

本轮没有提交、推送、合并、发布、产品/native 改动、账户/ACL/UAC/Job/Bitvise 设置变更、计划任务、安装、委派、候选分配或 Win7 执行。

## 21:21–21:23 用户报告启动后的直接核对

用户回复“已启动”后，完整性校验通过，但读取 dispatcher-start 时发现文件不存在；该预检首失败 stdout/stderr 原样保存。随后的容错只读盘点确认 R6 claim/start/ready/final 均不存在、R6 入口 PowerShell 进程为零、产品 request 为零，旧 R5 同 PID/creation 仍存活。不能凭用户启动操作把缺失证据记成身份通过，也不把尚无执行记录记成产品 FAIL。

21:22:51 再次核对三 PS 准确尺寸/哈希和实际 ParseFile 无错误，master SHA 仍准确；21:23:43 普通 Session3 控制台盘点看到新 CMD PID34544（21:19:12创建、父 explorer32136），没有与之匹配的 PowerShell 子进程。原因尚 `UNKNOWN`，已请用户提供当前窗口错误文字；没有通过 Administrator/Session0 代启动、改脚本或派发产品请求。UU仍显示服务器连接不可用。

四轮原始核对共八 stdout/stderr 文件及准确哈希位于 `.acceptance/a9-31-developer/product-r1/r6-reported-start-verification-index.json`，包括首个缺失 start 预检。后续只在直接证实旧实例不能派发及 R6 准确普通身份/新鲜记录后自动调度。

## 21:29–21:31 当前红字与 CMD 身份核对

用户报告当前有红色错误；只读 `r6-red-error-state-20261003T132950501719Z.stdout.bin` 再次确认 R6 四种启动记录不存在、零产品 request。当前新 CMD PID65612（21:26:31创建）的实际令牌在 `r6-red-error-cmd-identity-20261003T133101351873Z.stdout.bin` 中通过 SID1005/Session3/Medium8192/非提升/Ordinary/noHostJob；这只证明该 CMD 身份，不代签未观察到的 R6 PowerShell 身份。

根、evidence、master、launch/serve、DLL/build及两批准文件的只读 ACL 显示 a9builder 已有继承 Allow FullControl；未变更任何 ACL。该静态事实不等同于普通用户实际 loader 成功。旧 PID36076 当前不存在，没有跨退出句柄取得退出码，历史退出仍 `UNKNOWN`，不补签为0。

UU仍无法连接服务器，SSH不能直接代替桌面控制台读字。已请用户保留当前 CMD、复制第一条红字及行号/FullyQualifiedErrorId，暂停重复启动。具体失败原因保持 `UNKNOWN`，不擅自改冻结源、重新装配、转管理员或创建产品 request；两轮原始 stdout/stderr及哈希登记在 `r6-red-error-diagnostic-index.json`。

## 21:40–21:46 Computer Use 实际取字、R6 启动及 Boot 硬停止

退出 UU 本机被控详情后实际进入准确 Win10 桌面，读到旧 R5 命令及既有 dispatcher-final 的 IOException。Computer Use 随后直接键入并执行准确 R6；dispatcher PID113716/creation639266316299998155 通过 SID1005/Session3/Medium8192/普通非提升/noJob 门。旧 R5 当前不存在但历史退出码仍 UNKNOWN。

唯一 Boot run `42a85eb4c6644abe8f3f892d7f7a9239` 通过四项基础检查后，权限选择表达式引号转义错误导致 Renderer 执行失败；只读提取冻结表达式已复现 SyntaxError。独立的短命 cmd.exe PID48664（父 Electron84472）在取得句柄前退出，dispatcher 因 `LIFECYCLE_OBSERVED_CHILD_NOT_PINNED` HALTED。七个已持有实例实际退出0不能证明该未持有 cmd 的 creation/exit，UNKNOWN 保留。

[准确首失败报告](a9_31_r6_cua_errors_and_boot_capture_failure_2026-10-03.md)及回收目录绑定53文件/6162158 bytes，逐文件哈希一致。Boot未通过，余七phase/同窗口重试/独立收口/Win7 NOT_PERFORMED；固定源与产品/native未改，R6不恢复，下游停止。上述历史等待记录保留原文，以本节最新直接证据判断当前状态。

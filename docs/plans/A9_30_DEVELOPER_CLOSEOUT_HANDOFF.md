# A9-30 开发机收口交接包（2026-10-01）

现行结论：2026-10-02 `DEVELOPER_VERIFIED`，见末尾最终裁决及[收口报告](../reports/2026-10/a9_30_developer_closeout_decision_2026-10-02.md)。以下首份身份及中间追加段保留各自当时快照，不能当作现行未完成状态。

```text
Status: SOURCE_COMMITTED_KIT_READY_FOR_REVIEW / NOT_APPROVED_FOR_NATIVE_BUILD
Task: A9-30 / APPROVED_FOR_IMPLEMENTATION
Branch: codex/a9-30-shell-streaming
HEAD / Source Commit: a3b6a67dbda43c41d27cedccbdf0875e1acc46d9
Source Commit Approval: GRANTED / LOCAL_COMMIT_ONLY
Build Kit: PACKAGE_READY_NOT_APPROVED
Product Native Input Lock: NOT_LOCKED
Independent Reviewer: NOT_ASSIGNED
D-017 Build Host: WIN-2JQ66JE4HTQ / 192.168.1.4 / SSH identity verified
D-017 Build User: NOT_ASSIGNED / current SSH Administrator has administrator role
D-017 Write Targets: NOT_APPROVED
Overall: DEVELOPER_GATE_NOT_SIGNED
```

本包供负责人审阅准确源码并指定独立复核人与构建机。已有授权的本地实现、测试和材料已完成；
不以本地合成 PE、协议夹具或 Node DOM 检查替代真实 Win32 / Electron。
实现方不能自签独立复核。未提交、推送、合并、分配 WIN7-43、访问或写入构建机。

## 1. 审阅材料和准确范围

- [收口准备报告及需求证据矩阵](../reports/2026-10/a9_30_closeout_readiness_2026-10-01.md)。
- [任务书 §3–5](../tasks/A9_30_SHELL_STREAMING.md)、[helper v3 合同](A9_HELPER_V3_STREAMING_PROTOCOL.md)、[模拟交互 Demo](a9-30-shell-streaming-demo/index.html)。
- 工作树 `.acceptance/a9-30-developer/closeout/source-review.patch`：对 HEAD 的全部源码/文档差异及新增文件。
- 同目录 `source-review-manifest.json`：实现与治理文件的逐文件尺寸/SHA-256；`source-review-paths.txt`：拟审阅/提交的精确路径。
- `whitelist.json`：分支、基线和全部 44 个实现/测试/模板文件均位于任务 §3 白名单。
- `prior-source-inheritance.json`：原 29 个实现文件中 28 个字节未变；Runner 脱敏头部字符串构造调整后重跑验证。

源码提交范围包括 A9-30 链路、v26 套件模板/校验/生产者、相关定向测试及本任务治理材料。
已有第二批设计、覆盖台账和 A9-31/A9-32 草稿为索引依赖保留原文，不含其实现，不提升其状态。
正式锁、kit 源码快照及批准项尚不存在；SOURCE_COMMIT/时间保持 NOT_LOCKED，批准登记为空。
不要暂存派生 dist、node_modules、.acceptance、主工作区修改或其他路径。

## 2. 依赖、API 和失败边界

产品 D-013 v26 使用协议 v3 / a9-trusted-shell-current-user-v2，旧 v1/v2 回归保留。
许可证 Apache-2.0，原生 API 和风险已登记于 WIN7_CONSTRAINTS §10。无新第三方产品依赖。
构建限定 D-017：Windows 10 x64、VS2019 16.11、MSVC 14.29/v142、SDK 19041、x64、静态 /MT，
/Brepro /INCREMENTAL:NO 和固定路径映射。Windows PowerShell 5.1 Desktop / .NET 的捕获探针仅运行于构建机，
不进入产品、Win7 运行时、SBOM 或发布依赖；禁止下载/安装/调整策略。

prepare 从指定完整 Git SHA 提取 13 个原生文件，核对工作区字节及提交时间；未提交变更、缺失/额外文件、
符号链接、Profile 或 smoke 合同错配均在写新锁前拒绝。package 核对完整文件集合及每个 SHA/尺寸，拒绝覆盖。
技术 READY_FOR_WIN10_BUILD 与 PACKAGE_READY_NOT_APPROVED 均不是批准。

返回包必须含同一批准套件、完整原始证据、不同 ZIP/run-id、相同 helper 和实际工具身份。
记录器检查真实 PE 字节（AMD64、Win7 subsystem/manifest、API imports、静态 CRT）、原始 v3 帧及时序/字节计数。
诊断包/未批准或脏登记/源或哈希漂移/失败 smoke/身份复用/额外证据/不同 helper 均不能形成正式输入锁。
批准返回复核须另登记 return_review：独立复核人不同于实现人、报告 SHA、复核时间及两组 run_id/返回 ZIP SHA；
记录器和打包生产者都校验该绑定。工具只能验证登记，不证明登记内容的真实性。
背压导致终态缺失时允许记录有界失败，但清理保持 UNKNOWN；仍需独立复核及实际进程探测，不能称清理 PASS。

## 3. 分步授权与执行

1. 负责人审阅上述准确差异，批准追加源码提交；只按 source-review-paths.txt 暂存，提交后取得完整 source SHA 和 %cI。
   源码提交本身不批准构建机写入或 native 构建，不推送/合并。
2. 使用该提交建立只用于检查/kit 绑定的干净 checkout；按 [套件 README](../../native/helper/build-win10-kit-v26/README_BUILD.md)
   填写 SOURCE_COMMIT/时间、生成快照/锁/manifest、封装到新的候选外绝对路径，计算三项哈希。此时仍未批准。
3. 负责人指定独立复核人及 D-017 主机/普通用户。先只读预检 OS/VS/MSVC/SDK/工具路径与 SHA、权限、Job 条件、
   离线文件和中文/空格路径；UNKNOWN 或不满足停止构建，不安装、不调整权限。复核设计/安全/API/套件三项哈希。
4. 获批后追加 kit/批准登记提交，HEAD 必须包含准确登记字节；负责人另批准两个全新目录和执行动作。
   同一 kit 在两个全新目录各执行一次，保留不同 run-id，logic/capture/v1/v2/v3、PE/API/CRT 和返回包。
   失败证据保留，不重用失败目录/包，任何失败停止下游锁定/装配。
5. 独立复核两份原始返回及 helper 字节一致性。获授权后追加精确 return_review 登记提交，
   再用记录器生成新的 a9-v26-input-lock.json；旧 W42/v25 输入逐字节继承，不改旧锁。
6. 使用新锁及现有生产者参数生成 A9-30 开发检查包。只用 A9-30-DEVELOPER 标识，
   不含候选 authority、旧验证驱动或历史验收 PASS；源/锁/登记漂移拒绝，不回退 v25。
7. 在实际 Windows Electron 22.3.27 / Node 16.17.1 / ABI 110 完成矩阵与受影响交互。
   独立复核、原生重锁、打包与真实 Electron 均满足合同后，由负责人裁决 DEVELOPER_VERIFIED。

## 4. 实际 Electron 执行清单

所有证据写候选外的新运行目录；绑定 source/lock/helper/ZIP/manifest SHA、run-id、OS、运行时及用户。
使用独立临时数据/工作区和合成秘密，不接触真实凭据或既有会话；实际命令、落盘事件、IPC 和 DOM 对齐。

| 场景 | 必须核对的事实 |
|---|---|
| S01/S02 | 每两秒 tick；首条在进程退出前活动卡可见；事件先在 SQLite 可读再发布；stdout/stderr 按 helper 观测序及流内字节序 |
| S03 | 真实 exitCode、verified 不被 chunk 提升；大输出失败仍撤销旧 verified；截断/清理事实与 native 终态及 PID 探测一致 |
| S04 | 三种编码按各字节边界、CR/LF、无换行、大输出；合成秘密在已知值/凭据/私钥/编码变体中跨块；日志/DB/IPC/DOM 零秘密 |
| S05 | Stop、队列背压和慢消费者；取消不等输出排空；有界终止并核对进程树；缺失终态保留 UNKNOWN，不能伪造成功 |
| S06 | 刷新、分页、视图返回、关闭重启逐事件一次；终态不重复文本；旧进程只记事实，不虚构接管或重放 |
| 负例 | 错 requestId/重复缺号/非法 Base64/错计数/启动前输出/缺终态/落盘失败；结构化失败并阻断后续派发，首轮证据保留 |
| 交互 | 自动滚动与手动回看、焦点不抢夺、Stop 反馈、退出选择、窗口返回及恢复 |

目前上述真实 Electron/Win32 执行全部 NOT_PERFORMED。Win7 本任务仍 NOT_PERFORMED；
A9-31/A9-32、新候选门 A/B、完整 Alpha 2 和 RC 不在本次裁决范围。


## 5. 源码提交批准后的实际推进

负责人回复“批准”，已追加一次准确范围的源码提交并从干净 checkout 生成未批准 kit。
完整 source SHA、ZIP/kit-lock/manifest 三项哈希与保护验证见
[源码提交与套件绑定报告](../reports/2026-10/a9_30_source_commit_and_v26_kit_binding_2026-10-01.md)。
生成快照/绑定文件及本次文档补录未提交；kit/批准登记提交、构建机写入和原生构建仍另行授权。
本节更新当前事实，前面未提交源码审阅清单保留为批准时快照；资源与独立复核尚未指定。

## 6. 指定 Win10 与连接预检（2026-10-01）

负责人明确指定 `192.168.146.1` 并要求进行构建；该主机上的构建动作已获授权。
只读连接预检未完成 SSH 握手，UU 历史 Win10 设备离线，实际 OS/工具链/普通用户/Job 仍 UNKNOWN。
独立复核人尚未指定，正式 kit 批准登记仍为空；不将构建指令视为实现方可自签独立复核。
诊断与后续前置见[连接预检报告](../reports/2026-10/a9_30_win10_build_connection_preflight_2026-10-01.md)。
未上传或执行套件、未提交批准登记，原生双构建和输入重锁仍 NOT_PERFORMED / NOT_LOCKED。

## 7. 恢复原地址后的只读预检与 Win10 agent 交接

负责人要求连接 `192.168.1.4`，严格 SSH 公钥认证成功，主机名与历史 Win10 一致。
确认 Win10 x64 build 19045、PowerShell 5.1 Desktop、VS2019 16.11.37507.1、MSVC 14.29.30133，
SDK 19041 include/lib/mt 和 cl/dumpbin/vswhere/powershell 存在，工具 SHA-256 已保留。
当前 SSH Administrator 令牌具有管理员角色、ordinary_user=false，不能直接用于 v26 正式构建；Job UNKNOWN。
原始字节及结构化记录位于工作树 `.acceptance/a9-30-developer/closeout/win10-192-168-1-4-readonly-20261001-230734.*`。
未远端写入或构建。供负责人交给本地 agent 的[完整提示词](A9_30_WIN10_AGENT_BUILD_PROMPT.md)
覆盖独立复核、普通用户预检及批准后双构建，不代表独立复核或批准登记已完成。

## 8. 当前交接状态（2026-10-02）

构建机192.168.1.4、三个准确目录、专用标准账户已获批；账户已创建，未入管理员组，未改UAC/策略。r2撤销，修复source ff15348；r3独立复核通过，批准登记本地提交0a96eb3。23文件输入已核对并部署，PS5.1请求自检通过。远程标准令牌非提升Medium但子进程仍带HostJob，正式双构建、返回复核和产品锁尚未完成。

仅依赖执行身份的动作暂停，具体[身份报告](../reports/2026-10/a9_30_win10_standard_account_identity_2026-10-02.md)和[桌面入口](A9_30_WIN10_INTERACTIVE_BUILD_ENTRY.md)已准备。保持原历史记录，未推送/合并，不改判DEVELOPER_VERIFIED、Win7或Alpha2。

## 9. 首轮失败后的当前交接状态（2026-10-02）

桌面身份门已通过，r3 首轮编译及静态工件检查通过，但 v1 smoke 的 ACL 恢复失败，第二轮未启动。失败诊断包、原始日志及四组合隔离探针保留；修复源码独立复核 P0/P1/P2=0，尚未提交或正式构建。新源码提交、新 r4 套件和全新构建目录的准确交接范围见[首轮失败报告](../reports/2026-10/a9_30_r3_win10_first_build_failure_2026-10-02.md)。下游重锁、装配及真实 Electron 验证继续暂停，不以 API 探针替代标准用户原生 smoke。

## 10. r4 当前状态（2026-10-02）

r4 已获具体授权，修复源码和独立套件批准登记分别提交为 `8e2bcfc`、`989bac9`。真实标准桌面身份门通过后，首轮在 v1 smoke 的 LABEL 恢复失败，第二轮未启动，未形成锁或装配。所有旧目录、输入、失败证据保留。现有 Modify 与标签设置所需权限的关系、以及 Apply 原始失败是否被冗余回滚掩盖仍在标准用户探针中核对；见[r4 失败报告](../reports/2026-10/a9_30_r4_win10_first_build_failure_2026-10-02.md)。不提权、不改系统策略、不以静态修复或管理员证据代签。

2026-10-02 02:09 +08，直接 `a9builder@192.168.1.4` 公钥连接实测成功；实际 Session0、非提升 Medium，但 Host Job=true，kit 身份门拒绝。直接 SSH 可用于文件/证据操作，不能替代无 Job 的桌面构建/标签探针；未改密码、账户或持久策略。

2026-10-02 02:20 +08，进一步只读查询及受控身份探针证明同账号SSH Job已允许显式breakaway；CreateProcessW独立控制台子进程真实非提升Medium、无Job，kit身份门通过。无需改变SSH配置。后续标准用户标签负例确认WRITE_OWNER缺失、应用和冗余恢复均Win32=5，末态不变。一个全新私有目录的对象级WRITE_OWNER追加探针已准备，尚待授权；具体目标和证据见同一[r4失败报告](../reports/2026-10/a9_30_r4_win10_first_build_failure_2026-10-02.md)。该路线仅支持非GUI检查，Electron仍需真实交互桌面；不复用失败目录，不提升DEVELOPER_VERIFIED。


### A9-30 r6 Win10 双构建与独立返回复核（2026-10-02）

连接恢复并获负责人“开始构建”指令后，同一批准 source `7feae402edfb30da9adb649841d777ca82cc6e80` / registry HEAD `3e2f6f602bf7b6aa0786b7c800c8541eff1198f4` / r6 kit 在既有批准全新 `build-r5-a`、`build-r5-b` 完成两次普通非提升Medium无Job原生构建。run-id `16b5abc3-e4bb-4615-a5bc-12e02fcb5e17`、`33e3d3c9-bf4d-4f40-92f5-31b8915d13f9`；helper350720 bytes、SHA `c895a2f9e4abcb84ae2295d2e33ada6289cfd34c692b88e92276e7749cdc5a2b`，原始字节一致；两个返回包独立。实际PE/API/静态CRT、logic/capture、v1/v2及v3原始证据通过相应检查。最终独立只读返回复核P0/P1/P2=0，08:38:11+08。

A首轮返回触发旧consumer精确清单漏 `helper.exe.manifest`，保留原始ZIP/失败证据并暂停B；在已批准三精确路径修正清单及与kit的字节绑定，红2 FAIL/1 PASS、绿48 PASS/2 Windows平台SKIP，独立复核通过后在未消费的B目录构建。三文件修正仍未提交，未更改原生source/kit；不删返回项或放宽批准/身份门。背压只证明有界fail-closed，进程树清理UNKNOWN；返回复核登记、产品v26输入锁、打包及真实Electron、Win7未完成，DEVELOPER_VERIFIED不签发。主工作区和旧证据保留，未推送/合并，不占用WIN7-43，不改变A9-31/A9-32或Alpha2/RC。见 [双构建报告](../reports/2026-10/a9_30_v26_r6_win10_double_build_2026-10-02.md) 和 [独立返回复核](../reports/2026-10/a9_30_v26_r6_independent_return_review_2026-10-02.md)。


### A9-30 六路径授权提交与 v26 开发输入锁（2026-10-02）

负责人对准确六路径材料回复“授权”。按已审批字节追加本地提交 `9896ebffeef17b8e703d15e0933d767f99186780`，仅包含记录器/fixture/定向测试三文件、双构建和独立返回复核两报告、批准registry的 `return_review` 登记；分支 `codex/a9-30-shell-streaming`，未推送/合并。所有六路径提交blob逐项匹配批准SHA，原生source `7feae402edfb30da9adb649841d777ca82cc6e80`及r6 kit不变；其他11项工作树文件原始字节保留。

随后使用生产 `record-a9-v26-helper-input.mjs`、准确HEAD批准registry、同一r6 kit和两份原始返回包生成新 `release/win7-product-v3/a9-v26-input-lock.json`（7323 bytes，SHA-256 `2e5942b115f1e5f1ecf6a6c31d91ed5d4f9145b9e0751941a0aa566fdebda9df`）。锁ID `A9-30-DEVELOPER-INPUTS-D013-V26`，仅开发，记录两独立run/返回SHA及helper SHA `c895a2f9e4abcb84ae2295d2e33ada6289cfd34c692b88e92276e7749cdc5a2b`。原v25锁哈希/历史runner条目及全部其余继承输入一致；新锁当前未提交，未写正式候选authority，不占用WIN7-43。

生产重锁证据 `.acceptance/a9-30-developer/closeout/r6-production-development-lock-record.json`、`r6-development-lock-verification.json`；六路径审批/执行证据 `r6-receiver-commit-approval-material.json`、`r6-receiver-approved-commit-execution.json`。此前“待授权/NOT_LOCKED”原文及PENDING只读校验快照保留为历史。当前win10门 `PASS_D013_V26_RETURN_REVIEWED`仅原生返回范围；背压清理UNKNOWN，打包完整性/装配、真实Electron及Win7仍NOT_PERFORMED，整体DEVELOPER_VERIFIED/Alpha2/RC均未裁决。


### A9-30 修复换包与真实 Electron 子集（2026-10-02）

负责人批准runtime/test准确两路径后，本地source `4318634` 的开发ZIP `b57d6806…7b232`、manifest `19d734ce…527ca`完整性与SID1005 Session3普通非提升无Job真实桌面启动PASS；原生source/kit/helper/开发锁按精确SHA继承。真实main/preload/native/Runner/Core/SQLite/IPC/Renderer路径的tick/双源/UTF-8/截断/Stop、已结束任务刷新/重启，以及回看/焦点/视图返回子集通过。CP936/UTF-16LE、40 native秘密切点、实际Runner背压及consumer失败、真实SQLite拒绝写入、协议帧故障、29秘密变体及4003直接切点另有范围明确的实机子集证据。9根310输出文件/84合成变体扫描命中0、正向对照有效，受检Electron已退出；历史native raw-pipe背压UNKNOWN不改判。

完整S01–S06和DEVELOPER_VERIFIED仍未签发：两文件运行中提示修正已完成39定向PASS及独立P0/P1/P2=0，源码提交待具体授权；失败验证撤销旧verified目标夹具已准备但未执行，编码负例、中断重启/退出交互仍待完成。UU在线而CUA远端输入无响应，坐标报noWindowsAvailable，不以SSH Session0代签。全部首失败和历史原文保留；不推送/合并、不占WIN7-43、不开放A9-31/32，不签Win7/Alpha2/RC。详见[当前包与实机矩阵](../reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)。


### A9-30 编码模块补充与桌面后续（2026-10-02 14:37 +08）

source4318634/包/原生锁不变；目标Node16解码器13断言及实际Electron/native/Runner编码负例96断言PASS，均为范围明确的Session0模块证据。标准用户无Job通过后执行，直接SSH Job门首拒绝保持；未改账户/策略。UU当前诊断终端落在Administrator已断开Session1，A9 Builder console Session3仍活跃，桌面输入尚未恢复。CP936/UTF-16LE及warning的完整产品贯通、verified撤销、中断恢复/退出交互和提示新包检查仍待执行。新桌面r2脚本已就绪，未运行；当前矩阵r2、报告§8记录详细哈希/run-id与失败。提交具体批准、完整独立复核和DEVELOPER_VERIFIED仍待；不签Win7/候选/Alpha2/RC。


### 编码与生命周期交接补充（2026-10-02 21:30 +08）

source4318634原锁定包在A9 Builder普通非提升Medium/无Job真实桌面完成r12编码完整链路及运行中正常关闭94断言PASS；11组有效/错误字节样本范围明确，UTF-16LE为外部选项、原生文件选择器UI未测。既有r4中断恢复不重绑。一次桌面启动后SSH调度、R1普通故障后正向重试通过；R1超时UNKNOWN调度缺陷保持，R2自动接管和实际UNKNOWN暂停有直接记录。r14目录准备失败未重跑，控制器HALTED，不继续派发。最新矩阵r8、新423出口文件及58控制器回传扫描0命中，首失败保留。两文件提示修正仍待具体提交授权/新包验证，新证据仍待完整独立复核。DEVELOPER_VERIFIED不签发，Win7 NOT_PERFORMED，WIN7-43不占用；A9-31/32及Alpha2/RC范围不开放。详见[打包与实机报告](../reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)。


### 已批准三项完成与新包实机交接（2026-10-02 22:38 +08）

负责人批准后，Luna high对冻结66项/旧实机样本/准确提示差异独立只读复核0/0/0；仅两批准路径追加source32ee0b4，保护其他工作区修改，无推送/合并。Node20.17干净source生成新开发包ZIP08425b62…/manifest3afb3367…，完整性PASS；780载荷及原helper/SQLite等hash一致。首Node20.10诊断包和原历史保留，不宣称独立双包构建。此前94项绑定旧source4318634；新包实际启动、提示/输出/Stop仍NOT_PERFORMED。原R2暂停/UNKNOWN不恢复，新增只读r14无Task/Turn/工具派发事实不改判原记录。R3准确三目录和两固定阶段仅本地方案，Win部署/启动另行待批；开发机整体门不签发，Win7 NOT_PERFORMED、WIN7-43未占用。详见[当前包报告](../reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)§20和矩阵r9。

### 新包 Win10 受影响验证完成（2026-10-02 23:08 +08）

负责人指示“执行Win 10实机验证”后，新source32ee0b4开发包在a9builder SID1005 Session3普通非提升Medium/无Job真实桌面完成Boot15直接启动1项、First16实时输出交互32项PASS。新提示、退出前双源顺序、实际Stop/清理、刷新分页/视图/滚动焦点通过；307次先落盘再IPC观察含重复快照，负向对照有效。111返回文件哈希匹配，84合成秘密变体零命中及正向对照有效，8登记进程已退出。主代理一次桌面启动R3，后续SSH自动调度；两固定请求完成后控制器自动结束，原R2暂停与UNKNOWN保留。矩阵r10/报告§21绑定准确source/ZIP/manifest/run-id；此前旧包编码、协议负例和中断恢复不重绑为新包直接执行。新证据及精确继承的最终独立复核仍待，DEVELOPER_VERIFIED未签发，Win7 NOT_PERFORMED、WIN7-43未占用；本轮未提交、推送、合并、发布或重建原生。

### 最终独立复核及开发机收口裁决（2026-10-02）

负责人要求最终独立复核和裁决。Luna high只读复核28冻结项、66旧归档及111新返回，哈希/尺寸无差异，最终P0/P1/P2=0/0/0，建议DEVELOPER_VERIFIED。主代理据任务§4–5登记阶段门 `A9_30_DEVELOPER_VERIFIED`；实现授权保留APPROVED_FOR_IMPLEMENTATION。新source32ee0b4的直接Boot15/First16及准确未变组件继承满足开发机合同；原生raw-pipe缺终态的清理UNKNOWN按获批README/协议/返回校验器保留为有界失败边界，不升级清理PASS。此前怀疑其构成P1，经明确合同复裁撤回；全部旧失败/UNKNOWN及暂停原文保留。矩阵r11、独立记录 `r6-final-independent-closeout-review-r1.json`和[开发机收口裁决](../reports/2026-10/a9_30_developer_closeout_decision_2026-10-02.md)绑定完整source/产物/复核入口。Win7 NOT_PERFORMED，A9-31/32仍各自草稿，WIN7-43未占用、Alpha2/RC未裁决；本轮未提交/推送/合并/发布或执行新构建机动作。

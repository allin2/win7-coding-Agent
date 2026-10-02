# A9-30 v26 r6 开发检查包与 Windows 执行状态

当前结论：修复提交 `4318634` 的开发包完整性、真实 Win10 桌面启动与实时输出链路多个子集 PASS。SQLite 写入失败、背压、协议负例、秘密变体、刷新/重启及回看/焦点已有直接证据；完整 S01–S06 和 DEVELOPER_VERIFIED 仍未签发。两文件运行中提示修正已完成本地验证/独立复核，准确提交待审批；剩余桌面检查因远控输入不可用暂停。§1–§6 保留历史快照，§7 为此前子集矩阵；新增目标编码模块与最新会话边界见§8及矩阵r2，整体门仍未签发。

## 1. 来源、输入与保护

负责人指示“打包和真实验证”。沿用 A9-30 分支的准确六路径提交 `9896ebffeef17b8e703d15e0933d767f99186780`，为产品打包创建只用于检查的干净 checkout：`/Users/qlyf/.codex/worktrees/a9-30-product-r6-check/win7-coding-Agent`。本次不追加提交、推送或合并，保留原工作树与主工作区的已有修改、删除和未跟踪文件。

v26 生产者要求源码 checkout 干净，允许通过既有参数 `--formal-input-lock` / `lockPath` 从外部读取新锁。新锁不必为本次打包再提交；未使用 `--allow-uncommitted` 或更改生产者、registry、锁以绕过门。

在干净 checkout 的忽略路径复用已有离线 Node/TypeScript 模块链接；不安装或下载依赖，不改已锁版本。实际生产者从准确 checkout 的七个模块 TypeScript 源码重新编译到包的独立输出目录，随后复制声明的运行时闭包，不复用旧 dist 作为新源验证。

| 输入 | SHA-256 |
|---|---|
| v26 开发输入锁 | `2e5942b115f1e5f1ecf6a6c31d91ed5d4f9145b9e0751941a0aa566fdebda9df` |
| 批准 registry（在准确 HEAD） | `1e9ab3aa23e4783741fe9d7a78b51369c7be5c521f4ee017738953809a04d335` |
| Electron 22.3.27 Win32 x64 ZIP | `ad723ed7dad32f9459f7a9de1fd6d718cf713c4809c2431503bea62ce8f786e6` |
| 实际 A 原生返回 ZIP | `4634a99211556698421649ba381ebb9192b523c4bbf1e0080a40137dba2d203a` |
| SQLite / ABI110 原生返回 ZIP | `2cb0cd324bb449fb5457549addd3e7f8f0610d6258415309ee748fb279a72794` |

每个输入整包及入口文件按既有锁核对，不从现场字节生成期望值。原生 source `7feae402edfb30da9adb649841d777ca82cc6e80` 与当前 HEAD 的13个 native blobs一致；registry、两run复核和祖先关系通过实际生产者门。旧候选、v25/历史锁与所有失败证据保留。

## 2. 实际开发包

包路径（本 A9-30 工作树下）：

`.acceptance/a9-30-developer/closeout/package-r6-a/Win7CodingAgent-0.3.0-alpha.2-win7-x64.zip`

| 身份 | 值 |
|---|---|
| 包大小 | 101308975 bytes |
| ZIP SHA-256 | `fb07ec3803d933f96e5fbbf8f9d987e2068d0b0ddfca62319be3ab8eb391e93d` |
| release-manifest SHA-256 | `affd1da150adb0a28525eff611b508a2de9f86735b35249672e0c06a0aa0248f` |
| manifest状态 | `A9_30_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE` |
| 源码 | `9896ebffeef17b8e703d15e0933d767f99186780`，干净 checkout |
| helper | `D-013-v26-a9-trusted-shell-current-user` / 协议3，SHA `c895a2f9e4abcb84ae2295d2e33ada6289cfd34c692b88e92276e7749cdc5a2b` |
| Runtime | Windows x64 / Electron22.3.27 / Node16.17.1 / ABI110 / SQLite3.43.1 |

生产者 `buildA9ProductCandidate` 直接执行通过；包内 JavaScript语法及离线模块闭包、原生在app外、完整manifest与敏感载荷扫描按既有入口检查通过。随后再次调用生产 `verifyA9ProductZip` 验证实际原始 ZIP 的完整清单和 Profile；额外检查 runtime、runner manifest 均绑定 v26/协议3，SBOM和许可证沿用生产者的对应描述。

manifest包含783项载荷；加上自身后 ZIP/实际staging目录各784文件。技能只读 `artifact_audit.py compare` 逐文件相对路径和SHA比较相同，缺失/额外/改变均0；这只证明内容一致。ZIP自身哈希绑定在独立记录中。

开发包有 `A9_30_DEVELOPER_CHECK.json`，没有正式候选authority或历史验收驱动，`external_acceptance_eligible=false`，不占用WIN7-43。版本文件名中有alpha.2不代表完整Alpha2或RC通过。

## 3. 验证层级与阻断

| 范围 | 当前结果 | 证据/后续 |
|---|---|---|
| 准确干净源码与锁输入 | PASS | 实际producer门、输入整包与入口哈希 |
| 编译/离线包闭包/敏感扫描 | PASS | 实际生产打包入口；本地证据 |
| 生产ZIP完整性、ZIP对staging内容 | PASS | 783项manifest、784文件比较一致 |
| D-013 Win10双构建及返回复核 | INHERITED_EVIDENCE | 同一 helper精确SHA，见[双构建报告](a9_30_v26_r6_win10_double_build_2026-10-02.md) |
| 原生实际背压清理 | UNKNOWN | 旧两run只有有界fail-closed，不能写清理PASS |
| 当前Win10可连接/桌面 | 未通过 | SSH超时；UU Win10离线。具体原因UNKNOWN，未调整网络/电源/系统设置 |
| 包内Electron/SQLite ABI实际加载 | NOT_PERFORMED | 等指定Windows主机恢复，不用macOS/普通Node替代 |
| native→Runner→Core→SQLite→IPC→DOM S01–S06 | NOT_PERFORMED | 同包实际桌面执行，不能使用纯模拟Runtime/DOM或native smoke代替 |
| 协议/审计负例与真实Stop/恢复交互 | NOT_PERFORMED | 必须绑定当前包的真实程序及合成fixture |
| Win7 / 完整Alpha2 / RC | NOT_PERFORMED | 本轮不取得这些结论 |

未启动包内exe、未传入192.168.1.4、未创建远端新目录或修改系统策略。`gates.product_assembly`及win10等包内原始门保持NOT_PERFORMED，不原地改写已生成包或manifest来提升结果。

## 4. 连接恢复后的执行交接

证据目录 `r6-product-windows-handoff.json` 已冻结准确包/manifest/lock/registry/source/helper身份和下一步。先只读重验指定主机、SID1005、当前桌面与权限；使用真实交互桌面，不把Bitvise Session0当作GUI证据。选用批准control范围内的全新包目录、包外证据目录及隔离工作区/数据根；已存在则保留并重新选择准确新目标，不覆盖旧包、真实会话或数据。

传输前核对完整ZIP和sidecar及外部锁/registry pin；解压后对所有载荷比对发布manifest。使用包内 `electron.exe`，保留原始 main/preload/Schema IPC/Runner/native/SQLite，通过真实活动卡执行以下矩阵。模型输入可用明确登记的本地合成fixture，不能算真实Provider验收；秘密仅合成，不读取真实凭据。

- S01/S02：每两秒tick，退出前DOM可见；实际SQLite已落盘早于发布；双源及流内顺序。
- S03：真实退出、截断、verified与清理/PID事实；失败大输出不保留旧verified。
- S04：UTF-8/CP936/UTF-16LE跨块、CR/LF、无换行与大输出、各类秘密切分；请求/日志/DB/IPC/DOM无泄漏。
- S05：Stop、慢消费者/背压、有界取消、进程树探测；无终态保留UNKNOWN及残留事实。
- S06：刷新/分页/视图返回/正常退出和重启逐事件一次；不复写终态或虚构接管进程。
- 协议/审计负例及自动滚动、手动回看、焦点、Stop反馈、退出交互：保留首失败及结构化阻断。

实际结果与包/源码/锁/环境/run-id/身份绑定，证据在包外；完成后按既有独立复核和负责人裁决流程，不由实现方自签DEVELOPER_VERIFIED。

## 5. 精确证据文件

均位于 `.acceptance/a9-30-developer/closeout/`：

- `r6-product-package-preflight.json`：干净checkout、离线依赖复用路径、输入哈希。
- `r6-package-a-build.json`、`.stderr.log`：实际生产者输出与失败诊断出口。
- `r6-product-zip-integrity.json`：实际ZIP完整性、source/manifest/Profile。
- `r6-product-zip-stage-comparison.json`：784文件完整比对。
- `r6-product-win10-connection-r1.json`：`2026-10-02T02:04:00.420084+00:00` SSH超时事实；UU状态来自本轮实际UI观察。
- `r6-product-windows-handoff.json`：同包后续实机执行的准确绑定及未执行矩阵。

本次应用的部署技能 `/Users/qlyf/.codex/skills/legacy-windows-deploy-doctor/SKILL.md` 仅提供打包/证据检查流程，未新增项目审批门或修改既有合同。

## 6. 恢复连接后的真实启动与修复准备（2026-10-02）

负责人回复“已唤醒，A9 Builder 桌面已登录”。02:08 UTC 重新连接确认指定主机与 SID1005，`quser` 确认 a9builder console Session3 Active；SSH 进程自身仍为 Session0。包、sidecar、开发锁和准确 registry 快照传入既有批准 control 范围，解压到独立目录 `D:\A9-A30-V26-20261001\control\product-r6-validation-20261002-1010`。02:11:56 UTC staging 校验全部784文件的相对路径、尺寸、SHA通过；包外 evidence/workspace/isolated-localappdata 为本批隔离目录。

通过 UU 真实桌面运行身份与哈希受检的启动脚本。02:22:07 UTC 直接探针确认 SID1005、Session3、普通非提升 Medium、无 Host Job；实际包内 Electron 子 PID26504。只对子进程覆盖 LOCALAPPDATA 和 WIN7AGENT_A9_DATAROOT，不修改账户、UAC、系统或持久化 ExecutionPolicy。该包为 packaged app，resources/app 入口优先于命令行 driver 参数，因此实际执行原包 main，外部 `.cjs` 驱动没有执行，不能声称完成其测试。

真实屏幕出现主进程错误 `A9_PACKAGE_RELEASE_MANIFEST_INVALID`，栈定位 `validateDescriptor → loadA9PackageRuntime → product/main.js`；关闭错误对话框后桌面恢复。生产者写开发状态 `A9_30_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE`，运行时仅接受历史状态 `DEVELOPER_PACKAGE_CANDIDATE_NOT_WIN10_OR_WIN7_PASS`，构成生产入口缺陷。包、manifest、锁与首次失败证据保持；因启动门失败，SQLite ABI、实时输出、Stop、恢复与协议/审计实机检查未执行。

02:37 UTC 后飞行发现失败 Electron 主进程仍在后台，不能凭错误框关闭声称进程已退出。核对启动记录PID26504、开始时间02:22:08.414 UTC（与记录相差不足1秒）、Session3、精确包内exe路径/锁定SHA及无窗口句柄后，只终止此失败测试实例并等待实际退出。证据 `r6-product-first-boot-postflight.json`、`r6-product-first-boot-scoped-cleanup.json`；不操作其他Electron或任意PID，不据此签发Shell进程树清理PASS。

已在 A9-30 补批的两个精确路径准备修复：

- `src/shell/product/a9-package-runtime.js`，SHA `bda363bc1eb8f1b9c9dfd218e4d1ea9af4ad807761b3ba5aabb1c9b01abcbbaf`：v25历史状态不变；v26精确接受开发状态，同时要求外部验收资格false、不得含release_authority，版本/Profile/协议/native哈希及Win10/Win7未执行门保留。
- `src/shell/tests/product/a9-package-runtime.test.ts`，SHA `abbb6ce93f0de8b7a53fea14c0468b04e0e3a2c3eaba8f759fd8f44943d1e7ac`：正例匹配生产manifest；补历史状态、验收资格、authority、Win10/Win7提升负例。

| 检查 | 当前直接结果 | 证据（closeout目录） |
|---|---|---|
| 连接、桌面身份、完整staging | PASS | `r6-product-win10-connection-r2.json`、`r6-product-user-session-preflight.json`、`r6-product-windows-staging.json`、`r6-product-real-desktop-boot-observation-r1.json` |
| 首轮包真实桌面启动 | FAIL | `r6-product-real-desktop-first-boot-failure.json`，实时UU画面观察；无driver结果 |
| 定向反证→修复 | 2 FAIL/13 PASS → 15 PASS | `r6-package-runtime-boot-regression-red-r2.log`、`r6-package-runtime-boot-regression-green.log` |
| Shell全套 | 50 suites / 492 PASS | `r6-package-runtime-shell-suite-green.log` |
| kit/打包回归 | 156 PASS / 2 Windows专项SKIP / 0 FAIL | `r6-runtime-fix-package-suite.log`，315391ms |
| 必需quick | PASS，七模块编译/静态检查 | `r6-product-runtime-fix-verify-quick.log` |
| 独立局部复核 | P0/P1/P2=0 | `r6-product-boot-fix-independent-review.json`，Luna high，02:26:14 UTC；仅本次两路径与manifest边界 |
| 修复提交、新包及修复后实机 | NOT_PERFORMED | 两路径准确提交请求待负责人回复；旧六路径授权不扩用 |
| SQLite ABI、S01–S06、Win7、整体开发机门 | NOT_PERFORMED | 不能从ZIP完整性或原生smoke外推 |

首次本地定向测试调用误用了仓库根 Jest 路径，报 MODULE_NOT_FOUND，保留 `r6-package-runtime-boot-regression-red.log`，不计测试反证。随后在 Shell 模块使用既有 Jest/Node20.17 执行真正反证及修复验证。

quick生成了20个原先干净的跟踪 `src/runner/dist` 文件；只将这些本轮构建输出逐项存入 `r6-verify-quick-generated-runner-dist.zip` 并恢复其初始HEAD字节，不提交白名单外生成物、不回退用户修改。逐文件生成/恢复SHA见 `r6-verify-quick-generated-dist-restoration.json`。后续生产打包仍须从源码重新编译，不使用这批旧dist。

已准备包外真实 Electron 测试驱动草稿 `control-scripts/r6-product-streaming-driver.cjs`，仅语法检查，未执行/未计 PASS。后续外部测试宿主须使用同一锁定官方 Electron、实际包 main/preload，区分原包直接启动和外置测试驱动证据。批准后仅提交两修复文件，从新干净 source 生产到全新包目录，不覆盖旧包；原生13源码blob/kit/helper不变，不重复原生双构建。仍须完成完整 S01–S06 矩阵与独立复核才能签发开发机门。


## 7. 修复换包与真实 Electron 子集验证（2026-10-02，更新至12:17 +08）

前一版开头原文（仅历史）：

> 当前结论：开发包完整性 PASS，Win10 真实桌面首轮启动 FAIL（`A9_PACKAGE_RELEASE_MANIFEST_INVALID`）。负责人唤醒后 SSH/桌面恢复；已定位并准备两文件最小修复，本地检查和独立局部复核通过。修复尚未获本次提交授权，未换发新包；S01–S06、整体 DEVELOPER_VERIFIED 和 Win7 不签发。下文 §3–§5 保留最初离线交接快照；§6 为最新直接证据。

负责人批准两路径准确提交后，追加本地 source `4318634915a82f539c7d33a5181b84953f9fd918`，仅包含 runtime 与定向测试；不推送/合并。干净检查 checkout 从该提交用原生产入口生成新目录 `package-r6-bootfix-a`，不覆盖首失败包。新开发 ZIP 101309098 bytes，SHA `b57d6806c36f6785e1469bfe66ded8a63e5333fc1cfa9dd1b5d4038a7cc7b232`；manifest SHA `19d734cefc51cd7c0b4034bc39b716b2a96fb74cd30fe72c3f7480d3787527ca`。Win10全部784文件尺寸/SHA复核通过；原生source、kit、双构建、helper及开发锁精确不变，仅按哈希继承原生证据。包保持开发身份及外部验收资格false，不修改manifest原始未执行门，不占WIN7-43。

真实桌面 `WIN-2JQ66JE4HTQ / 192.168.1.4`，a9builder SID1005、Session3、普通非提升Medium、无HostJob。10:58 +08，包内入口直接启动、可见工作台截图和exit0 PASS；只证明原包入口启动。随后使用同一锁定官方Electron（exe SHA `2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb`）的包外独立宿主驱动，完整73文件来源检查；加载未修改的包内main/preload/Core/Runner/native/SQLite/IPC/Renderer。实际版本22.3.27/16.17.1/ABI110/SQLite3.43.1。模型由回环合成Provider提供，配置经窄preload API；不算真实模型服务或Provider抽屉交互验收。实际UI选择Full Access、创建对话、Send、Stop及刷新，驱动不替换Runner/存储/IPC实现。SQLite只读查询证明输出在实际snapshot IPC返回前已落盘；产品本链路由IPC轮询获得状态，不将此描述成额外推送事件时序证据。

| 准确证据及run-id | 直接结论与范围 |
|---|---|
| `streaming-r6/streaming-first.json`；`370e63bd-dd64-4d5c-a934-7442896779e7` | 38断言PASS；双源每2s tick、首条637ms在退出前可见、连续序号、UTF-8逐字节中文/CRLF/无换行、跨块已知秘密、大输出真实exit7/截断、Stop实际子进程消失、592次落盘早于IPC观察、分页及刷新事件身份稳定 |
| `streaming-r6/streaming-restart.json`；`b032c507-72bd-4329-995e-7f814ab0b810` | 5断言PASS；已结束任务重启事件/DOM各一次、不可Stop；原fixture端口2s观察无重放。不能替代运行中断电/崩溃恢复 |
| `runner-supplement-r1/streaming-first.json`；`97c2c4b8-2bfe-4a22-8cec-498ffb57e440` | 保留整体FAIL；其中CP936/UTF-16LE双流逐字节中文、40个已知秘密native精确切分点成功。该首轮慢consumer触发timeout，未触发背压，不能签背压PASS |
| `runner-supplement-r2/streaming-first.json`；`1ee8db21-669f-46a8-8a2c-fbad040d8b7e` | 6断言PASS；提高测试输出允许量使队列实际溢出，结构化 `A9_OUTPUT_BACKPRESSURE`；拒绝consumer为 `A9_OUTPUT_AUDIT_OR_CONSUMER_FAILED`；两实际fixture子进程消失，返回清理证明true。仅Runner/native范围 |
| `ui-supplement-r3/streaming-first.json`；`1a0470be-2479-44e0-98a8-0d4f049e087b` | 28断言PASS；抽屉返回输出不重复；真实可滚动173px时下一tick仍top0，焦点保持，回到最新可用；Stop109ms内子进程消失、正常关闭/刷新成功 |
| `audit-negative-r2/streaming-first.json`；`98a70aee-2ccc-40c6-a2ab-403c7aa276b6` | 12断言PASS；隔离真实SQLite触发器拒绝tool_output写入，实际IPC返回 `A9_AUDIT_PERSISTENCE_FAILED`；DB/IPC/DOM无失败输出；第二工具未派发、标记文件不存在；fixture子进程消失且重试被同一失败门阻断。无终态时不伪造进程树证明 |
| `protocol-negative-r2/streaming-first.json`；`35403c3d-2db7-4b66-8bbc-247feacc099f` | 32断言PASS；真实helper/管道，包外夹具显式损坏/丢弃帧；正向对照、错requestId、缺/重号、非法Base64、字节错配、启动前输出、缺终态及错误终态计数均结构化失败；错帧不派发并发送绑定取消。实际进程退出；丢终态时程序清理证据仍false/UNKNOWN |
| `secret-supplement-r2/streaming-first.json`；`c47c0c7d-952d-47b1-b65f-e808962a299b` | 8断言PASS；同包SafeOutputStream在真实Electron内29变体、4凭据形式共4003个直接字节切分点及200053byte无分隔符长值；另真实native双流4035byte、556捕获帧、84安全片段，日志/最终结果无已知或合成未知凭据。11byte测试写入允许native合并，不冒充每切分点native实测 |

以上路径均相对于 `.acceptance/a9-30-developer/closeout/r6-bootfix-windows-evidence/`。每份报告绑定包source及运行时，启动JSON绑定标准桌面身份；返回文件逐项SHA清单与新汇总 `r6-real-electron-evidence-matrix-r1.json` 供核对。不同层级PASS不能合并成完整合同PASS。

`r6-all-outlets-and-postflight-r1.json` 对9个实际测试根的310文件，以84种合成秘密/前缀/编码变体扫描UTF-8/UTF-16LE、日志、SQLite字节、IPC/DOM报告等，命中0；正向泄漏对照被检测到。受检Electron均已退出、目录无reparse。合成输入fixture按合同在输出出口扫描外；PNG字节扫描不证明画面无可见秘密，另行检查截图及DOM。此证据上限为所列合成样本，不是未知真实凭据的全称保证。

历史原生两run raw-pipe背压的清理UNKNOWN不改写；新的实际Runner背压场景只给自身绑定范围的直接清理PASS。所有失败包和首轮失败保留：环境变量模板/驱动未刷新、fixture秘密文件被checkpoint拒绝、旧慢consumer测试timeout、滚动初始仅12px的前置不足、审计负例首次UI Send未启用等，分别位于原closeout和各failure目录。UI补充r2脚本生成语法失败未执行，改用全新r3；协议r1和秘密r1因静态夹具修正未执行，不计PASS。

### 尚未关闭的合同项

- 真实截图仍显示“命令运行中；输出将在命令结束后显示。”。已在白名单 `src/shell/product/renderer/a9-workbench.js` 和 `src/shell/tests/product/a9-workbench-contract.test.ts` 修正为“命令运行中；收到输出后会在此显示，可随时停止。”。准确差异4增3删、SHA `227fcf3283f7951301d5d14a4b86430a4ea909d0e092fdef164d06a36d9127d2`；旧renderer反证FAIL，修正后2 suites/39PASS，独立只读P0/P1/P2=0（11:32:52+08）。源码提交仍待前述具体审批，未重绑当前包/证据；后续从新干净source换发及检查新提示。
- 成功验证后真实失败大输出必须撤销旧verified：本地Core门可按精确源码继承；当前目标产品专用夹具 `r6-product-verification-r1.cjs` 已准备并绑定现有Win10测试用Node24.14.0 child exe SHA（只用于外部fixture，产品仍Node16，不是新增产品依赖或Win7能力）；尚未执行，记NOT_PERFORMED。
- 当前目标半字符/编码冲突负例、运行中中断后的重启事实/无虚构接管，以及退出交互剩余范围仍NOT_PERFORMED；不能用正常结束后的重启替代。
- 12:13–12:17+08，UU画面在线，但远端快捷键无响应；CUA坐标输入分别返回 `windowNotFoundAtPosition`、`noWindowsAvailable`。只读查看输入映射/菜单、窗口聚焦/重新绑定均未恢复；未改变账户、权限、键盘映射或安全策略。`r6-gui-input-blocked-observation.json` 记录；未用SSH Session0冒充真实桌面启动。
- 独立复核目前只覆盖原生套件/返回、runtime修复、提示文案和局部故障夹具。完整新证据复核与负责人开发机门裁决仍待完成。因此任务仍APPROVED_FOR_IMPLEMENTATION、DEVELOPER_GATE_NOT_SIGNED；Win7、新候选、Alpha2、RC均NOT_PERFORMED。


### 当前证据独立复核与后续阻断（12:27 +08）

独立只读代理 Luna high 于12:27:06+08复核本报告§7、当前矩阵、出口扫描及所绑定的 First/Restart 和补充报告，P0/P1/P2=0；记录 r6-current-partial-evidence-independent-review-r1.json 绑定复核前报告准确SHA。该结果只确认当前子集证据的分类与范围，未新增实机执行，不签发完整开发机门。CP936/UTF-16LE目前仍仅Runner/native子集；运行中中断恢复、S03旧verified撤销及剩余退出交互尚未执行。

再次只读连接于12:27:20+08确认同一主机、SID1005、console Session3 Active；verification-r1证据目录仍为空。UU画面在线，重新聚焦后的Win+R仍无远端响应，坐标动作再次报 noWindowsAvailable；控制菜单可读，不改设置。r6-current-document-and-gui-status-r1.json 保存本次文档/差异通过与GUI阻断，r6-gui-input-blocked-readonly-preflight-r2.json 保存连接/会话事实。三张截图人工检查结果另存 r6-visible-subset-review-r1.json；收起的秘密卡片不能算可见脱敏文本证明。


## 8. 继续验证与当前会话边界（2026-10-02 14:37 +08）

负责人指示“继续”。分支/HEAD仍为codex/a9-30-shell-streaming / 4318634915a82f539c7d33a5181b84953f9fd918；两文件提示修正尚未提交，其他工作树修改及历史证据保持。当前矩阵追加为 r6-real-electron-evidence-matrix-r2.json，r1原文/哈希保留。

### 连接和权限事实

14:17+08，SSH确认同主机、SID1005、a9builder console Session3 Active。CUA重新初始化后坐标动作不再报noWindowsAvailable，但远端开始/运行仍未产生响应。UU主界面显示现有连接；从该界面创建的一次诊断终端实测是Administrator SID500、Session1。14:24:23+08，终端quser显示Administrator Session1已断开、a9builder console Session3运行；只执行只读身份/时间/会话检查后退出本次终端，不断开其他连接、不改账户或设置。当前匹配UU进程在Session1；会话差异已观察到，是否为输入故障原因仍UNKNOWN，等待负责人确认A9 Builder桌面是否打开UU。

直接SSH原生模块尝试首先被普通用户/无HostJob门拒绝，未创建目标模块目录或执行Shell，证据r6-encoding-negative-r1-execution.json保留。随后只读令牌测得普通非提升Medium、HostJob=true。解码器纯模块检查保留该Job；原生检查沿用本任务已批准并在交接§10登记的同账户CreateProcessW独立子进程路线。对子进程重新实测SID1005、普通非提升Medium、HostJob=false后才执行；未用凭据、提权或改Bitvise/系统策略。两条路线均为Session0模块证据，不是标准桌面交互证据。

### 新增直接检查

| 证据 / run-id | 结果与范围 |
|---|---|
| decoder-only-r2/decoder-only.json；b17e080a-abc5-488a-8acd-e54cd8b584f7 | 13断言PASS。锁定Electron22.3.27二进制在Node模式执行，Node16.17.1/ABI110，使用当前包SafeOutputStream。中文UTF-8/CP936/UTF-16LE样本共62字节切分点；8组非法序列、EOF半字符/代理字符、明确不匹配字节；错误后无新文本、EOF后push拒绝，待判秘密前缀清空。仅解码器范围，未启动helper/Shell/UI。 |
| encoding-negative-r1/encoding-negative.json；a5d5599c-3715-4f2a-b9d9-88a6bdeab4cf | 96断言PASS。实际Electron、包内Runner及同一helper，重验全部784产品文件。8组真实PowerShell raw-byte夹具，stdout/stderr均出现A9_OUTPUT_ENCODING_ERROR，已发布前缀不追溯改码，错误后新文本/日志被停止；真实exit0、truncated标识及原始字节计数保留，8个实际子进程消失，helper清理证明true。仅native/Runner模块范围。 |

返回4份解码器和20份原生模块出口文件逐项尺寸/SHA一致；对应r6-decoder-only-r2-return-files.json、r6-encoding-negative-r1-return-files.json及r6-encoding-nojob-r2-execution.json。新24文件针对本次待判秘密前缀样本的编码变体扫描命中0，正向对照有效，记录r6-added-encoding-outlet-sample-scan-r1.json；不将此写成原310文件/84变体扫描已覆盖新目录。受检Electron已退出。原包ZIP、source、manifest、native source/kit/helper/输入锁均不重绑。

当前目标的编码负例已有解码器和native/Runner直接证据；CP936/UTF-16LE及错误warning贯通Core/SQLite/IPC/Renderer仍未单独执行。成功验证后失败大输出撤销旧verified、运行中断重启事实/无虚构接管，以及剩余退出交互仍NOT_PERFORMED。为下轮保留失败stdout/stderr，已准备并传输launch-r6-verification-r2.ps1（SHA a054155f61cdf0fd0e6188371b172bad0f39a463066dddc0930e569c6a10239b），采用新隔离verification-r2-20261002-1440目录；PS解析及驱动pin通过，证据目录为空，未启动桌面验证。

新增证据的独立复核及整体门尚未完成。两文件提示修正具体提交审批仍待确认；不能从“继续”自行改写任务§4的提交授权边界。DEVELOPER_VERIFIED、Win7、新候选、Alpha2和RC仍未签发。


### 新增编码证据独立复核（14:43 +08）

Luna high独立只读复核§8、矩阵r2、13/96两报告、身份/回传/清理和24文件样本扫描，以及控制脚本固定哈希，P0/P1/P2=0；没有重新执行实机或签桌面/开发机整体门。准确记录r6-added-encoding-independent-review-r1.json绑定评审版本报告SHA及全部关键文件；矩阵r3仅追加本次复核登记并关闭对应待办，r1/r2保持。此前“新增证据独立复核尚未完成”一句为评审前快照，当前此项已完成。其余桌面、提交/新包和最终完整复核待办不改判。

## 9. 再次继续时的连接边界（2026-10-02 14:49 +08）

本地仍为 `codex/a9-30-shell-streaming` / `4318634915a82f539c7d33a5181b84953f9fd918`；两文件提示修正及既有文档、未跟踪工件保持，未追加提交、推送、合并或换包。桌面控制工具明确报告 Mac 已锁屏，无法自动解锁，已请求负责人手动解锁；未执行任何解锁、认证或远端设置修改。

06:49:09 UTC 的独立只读 SSH 查询可连接 `192.168.1.4`，执行身份仍为 SID1005 / Session0；`quser` 当前只返回 a9builder console Session3 Active。按 `uuremote` / `uu-mux` 名称筛选的 `Get-Process` 查询为空，仅证明该次筛选结果，不扩为完整远控服务状态或故障原因。此前 Administrator Session1 的观察保留为历史，不再当作当前会话事实。GUI 输入是否恢复及 UU 当前绑定仍未能检查。

准确原始记录为 `.acceptance/a9-30-developer/closeout/r6-next-resume-preflight-utf8-20261002T064909Z.json`。首轮查询未固定远端控制台编码，返回字节未能按 UTF-8 解析；原始 stdout/stderr 和对应 `parse-failure.json` 保留，新一轮查询显式使用 UTF-8 并单独登记，没有覆盖首轮记录。两轮均未启动产品测试。`verification-r2-20261002-1440/evidence` 仍为空，剩余桌面验证保持 `NOT_PERFORMED`。整体开发机门 `NOT_SIGNED`，Win7 `NOT_PERFORMED`；原有13/96断言及其独立复核结论不变。

## 10. 桌面重连及剩余实机入口（2026-10-02 15:13 +08）

负责人要求“继续推进，直到实机验证”后，Mac 已可读取 UU。刷新绑定、置前显示窗口、鼠标及快捷键尝试未能打开远端开始菜单或运行窗口；只结束本机到 `WIN-2JQ66JE4HTQ` 的远控连接并重新进入该设备，未断开其他设备或更改安全、键盘映射、账户、权限、服务。07:02:37 UTC 新建的只读 UU 终端仍实测 SID500 / Session1 / 同一机器，查询后仅退出本次终端。07:00:04 UTC SSH 查询显示 GameViewer/uuyc-mux 在 Session1，GameViewerServer/Healthd 在 Session3；a9builder console Session3 Active。这里记录会话差异，输入故障根因仍 UNKNOWN，不用管理员或 Session0 启动来替代合格桌面入口。07:07:49 UTC 的 verification-r2 证据目录仍为空。

剩余实际测试入口已准备，状态统一 `STAGED_NOT_EXECUTED`：

| 入口 | 合同及绑定 |
|---|---|
| `launch-r6-verification-r2.ps1 -Phase First` | 现有成功检查后真实 exit7/大输出撤销 verified 夹具；仍未执行。 |
| `launch-r6-recovery-exit-r2.ps1 -Phase Close` | 双源输出在运行中可见后正常关闭真实窗口；检查取消终态、实际 Shell/helper 消失、SQLite 取消事实。 |
| 同上 `-Phase Crash`，再 `-Phase Recover` | 只对隔离测试 Electron 注入 exit93，保留真实未结束输出；随后检查中断事实、稳定事件及 DOM 各一次、不虚构终态或进程接管、不重放 Provider。Crash 是故障注入步骤，不单独签恢复 PASS。 |
| `launch-r6-remaining-desktop-r1.ps1` | 一次真实桌面启动，按 First→Close→Crash→Recover 固定脚本和哈希串行执行；身份、阶段或证据不符即停止，不接收任意命令或复用已有记录。完成仅待返回复核，不签整体门。 |

恢复脚本 r1 仅本地准备后保留，未执行；r2 在加载正式模块前观察实际 `spike02_helper.exe`，不改包内文件，并校验故障前落盘输出与 DOM 快照一致。r2 驱动 SHA `3839937e650f79ec25aee0261dd496d78bddc41a841f5e0cceb2a21222364bb5`，launcher SHA `8d658486ba74a5b98a1e47d9cdeaa9c45e6a9324663113f557c45f48a7067024`；固定串行入口 SHA `ba8a4220336edb48ceac73803cf38afb0041f486f4373f5f690b3502eba1b0f3`。实际 PS5.1 解析均0错误、回传哈希一致，隔离目录位于已批准 control 下；每个恢复阶段重新核对合格 SID1005 实际桌面、普通非提升无 Job、manifest 和全部784文件。没有通过 SSH 或管理员终端执行 GUI。

观察记录为 `r6-desktop-resume-observation-r1.json`；准备/传输/目录证据为 `r6-recovery-exit-r2-preparation.json`、`r6-recovery-exit-r2-transfer.json`、`r6-recovery-exit-r2-staging.json`、`r6-remaining-desktop-r1-preparation.json`、`r6-remaining-desktop-r1-transfer.json`，均在上述 closeout 证据根。已请求负责人从 A9 Builder 实际桌面启动；缺少启动事实期间不登记新的实机 PASS。两文件提示修正的提交审批、贯通编码警告及最终独立复核仍待完成；无提交、推送、合并、换包或候选编号变更。

## 11. 同账户交互任务替代入口：待具体授权（2026-10-02 15:19 +08）

为减少人工桌面启动依赖，已准备一个固定、无触发器的按需 Windows 任务方案。执行和任务主体均为 `192.168.1.4` 的 a9builder / SID1005；唯一任务名 `A9-30-R6-Desktop-Checks-20261002-R1`，InteractiveToken=3、RunLevel=LUA=0，不提供或保存密码、不转管理员、不改 UAC/系统策略/账户/权限。唯一动作是上述已锁定 `launch-r6-remaining-desktop-r1.ps1` 四步入口；实际子进程仍重新测量身份/Job/产品哈希，不能凭任务登记或 SessionId 推断 PASS。只有任务停止且登记来源、动作和 XML 哈希仍精确匹配，才允许移除该一个任务登记；所有测试文件及证据保留。

只读预检显示 Schedule 服务运行、ScheduledTasks 1.0 cmdlet 存在，但 `Get-ScheduledTask` 的 CIM 通道拒绝访问，保留 `r6-interactive-task-readonly-preflight-r1.json`；没有改该限制或重试提权。另行只读 Task Scheduler COM 连接成功，准确任务查询返回 HRESULT 0x80070002（文件未找到），记录 `r6-interactive-task-com-readonly-preflight-r1.json`；登记权限仍未验证，不能据此声明可启动。草稿采用 COM 接口，仅作为具体授权后的备选入口，权限拒绝会停止而不转管理员。

未执行的 r1 草稿保留；拟执行 r2 增加移除时的精确 XML 字节哈希检查，脚本 `dispatch-r6-desktop-interactive-task-r2.ps1` SHA `b40858946cf2882671dd8e8d1159daa58f6c68eccc69ff5f0bca69b82b191391`。控制目录内传输回验和实际 PS5.1 解析0错误，证据 `r6-interactive-task-r2-transfer.json`；准确审批范围见 `r6-interactive-task-exact-approval-material-r2.json`。AGENTS.md §5 将系统配置修改限定于明确授权，A9-30 §4 要求构建机写入另行授权；已经请求负责人批准唯一任务的创建、按需启动和停止后的精确移除。当前 `SPECIFIC_SYSTEM_TASK_APPROVAL_PENDING_NOT_EXECUTED`，没有任务登记、启动或删除；不将“继续推进”静默扩大为新的系统任务授权。产品源码提交、新包及其他未执行项保持原边界。

## 12. 桌面入口恢复、验证撤销通过及退出夹具首失败（2026-10-02 16:10 +08）

负责人继续推进后，07:51:30 UTC 只读查询确认 SSH 仍为同一 SID1005，console Session3 Active，原四步入口及三个证据目录为空。重新进入 UU 桌面后 Win+R 和键盘输入短时恢复，真实桌面 whoami 实测 a9builder / SID1005 / Session3。首个只读身份探针遗漏既定入口的单进程 ExecutionPolicy 参数，被默认执行策略拒绝；未执行探针或修改系统策略。使用既定单进程入口后实测普通用户、非提升、Medium、无 Host Job，再由该桌面启动既有固定四步控制器；没有创建计划任务、通过管理员启动或用 Session0 替代 GUI。

- **验证撤销：12 PASS**。`verification-r2-20261002-1440/streaming-first.json`，run-id `4db272fb-2333-45a7-8bed-25493f1fae5a`，SHA `1c7733c228c9de6ae0946d27bb54e2cf7f07639b79485eee8827d648ed08e794`。真实产品写入隔离工作区后先执行成功检查，再执行双源各200000字节、真实 exit7 的失败检查；最终 `completed_with_warnings / unverified`，截断及实际退出仍保留。受检产品仍为 source `4318634` 的原锁定包，Node24仅用于既有外部 child fixture，不是产品运行时或 Win7 结论。返回截图人工核对“完成（有警告）/未验证”，未将流片段当作 verified 证据。
- **退出首轮：FAIL，非退出 PASS**。`recovery-exit-r2-close-20261002-1510/recovery-close.json`，run-id `3a4ef741-07b1-4b38-bf26-f602eb51cc31`，SHA `e16f27be546d4be1aa7f4e1c3ce350087d0d10db34e0222123b33fcb59185db9`。4项启动检查通过后等待 Send 超时，Provider 配置 IPC 成功但 Renderer 仍显示模型未配置。没有发送任务、启动 helper 或 Shell；不能把清理 UNKNOWN 写成已证明。控制器记录 FAIL 并停止 Crash/Recover，原目录和全部首失败不覆盖。
- **返回及扫描**：两个新 evidence 目录14文件全部尺寸/SHA匹配；`r6-verification-and-recovery-first-return-r1.json`。两个新隔离目录的SQLite/日志/IPC报告等98个出口文件，84种合成秘密变体0命中、正向对照有效、无reparse、两受检Electron已退出；`r6-verification-close-first-outlets-postflight-r3.json`。这是新增两目录范围，不重写此前310文件扫描。最初扫描指令过长、第二次遗漏单进程脚本入口而遭拒的诊断保留，第三次才得到有效扫描。

外部恢复夹具 r3 增加真实视图 reload 后的 Provider 可见及同对话检查，保持正式 main/preload/Runner/数据库/IPC/Renderer 字节不变。驱动 SHA `59b5a133860fa9cd5a8d16516d279ca70e8316dd361cfc44ad71cacf45d5434b`；launcher SHA `7ef1e4a990ef25030574a168318ea73f96bb7261dfadfc3b25f599efdc79be14`。使用批准 control 下全新 `recovery-exit-r3-close-20261002-1605`、`recovery-exit-r3-crash-20261002-1605` 隔离目录。固定剩余三步入口 `launch-r6-remaining-desktop-r2.ps1` SHA `57b20976aebdc63e43570a9bbc182befbaf18d3710b71435f79b3ac3e515d384`，仅 Close→Crash→Recover；Node语法及实际PS5.1解析0错误、传输哈希匹配，目前 **STAGED_NOT_EXECUTED**。

首轮后 UU 输入再次无响应，重连同一设备和重新绑定窗口未恢复；没有修改键盘映射/服务/账户/安全策略。已请求负责人从 A9 Builder 桌面执行上述新固定入口，未凭输入尝试宣称启动。§11旧计划任务方案没有登记/执行，旧四步入口已有失败且不得复用，因此该提案不再作为当前执行入口；如另立任务方案须重新绑定新入口及具体授权。

最新矩阵 `r6-real-electron-evidence-matrix-r4.json` 只追加本次12PASS、首FAIL和新增扫描，r1～r3保留。新证据完整独立复核、运行中退出/中断恢复、贯通编码warning、两文件提示修正具体提交/新包仍待完成。任务仍 APPROVED_FOR_IMPLEMENTATION，DEVELOPER_GATE_NOT_SIGNED；Win7、新候选、Alpha2、RC均未签发。未提交、推送、合并、换包或占用WIN7-43。

## 13. 负责人要求代理桌面启动及新入口具体审批（2026-10-02 16:17 +08）

负责人答复“你控制在A9 Builder桌面执行”。08:12:02 UTC 的只读查询确认 SID1005、console Session3 Active、新三步控制器记录不存在，entry SHA仍为 `57b20976aebdc63e43570a9bbc182befbaf18d3710b71435f79b3ac3e515d384`。CUA重绑/重置、窗口前置和显示屏页签聚焦后可打开实际“运行”窗口，但原生文本、单键和粘贴均未替换选中的旧诊断命令；没有对旧命令或未核实文本按Enter，未宣称剩余测试已启动。未改键盘映射、远控安全、账户或系统策略。准确观察登记 `r6-desktop-dispatch-request-20261002-r1.json`。

为由代理完成启动，已准备新的同账户普通权限任务提案，绑定当前三步入口，不复用§11的旧四步入口。唯一任务 `A9-30-R6-Desktop-Checks-20261002-R2`，执行者与任务主体同为a9builder/SID1005，InteractiveToken=3、RunLevel=0、无触发器/密码/管理员后备；固定Close→Crash→Recover，实际子进程仍核对SID、真实桌面、普通非提升无Job及产品哈希。结束后仅在任务停止、精确登记来源及XML哈希匹配时移除这一登记，全部文件和失败证据保留。

`dispatch-r6-desktop-interactive-task-r3.ps1` SHA `cae71ff34deb12baa28dfbd9392558b1bd69c671ae40d9c95eba2e4141ab5124`，传输回验和实际PS5.1解析0错误；准确范围 `r6-interactive-task-exact-approval-material-r3.json`。08:16:55 UTC只读COM查询返回新任务精确名称不存在（0x80070002），控制器记录仍不存在；`r6-interactive-task-r3-readonly-preflight.json`。登记权限不能从COM连接成功推断。AGENTS.md §5及A9-30 §4适用于新增系统任务配置，已请求具体创建/运行/精确移除授权；当前 **PENDING_SPECIFIC_APPROVAL_NOT_CREATED**。不把桌面执行指令静默扩为系统任务登记，不改变已有12PASS或未执行项，整体开发机门仍NOT_SIGNED。

## 14. 批准交互任务的实际执行、身份门失败及移除（2026-10-02 20:05 +08）

负责人对R2普通权限交互任务范围答复“批准”；准确登记 `r6-interactive-task-r3-user-approval.json` 绑定既有审批材料SHA，仅创建/启动/停止后精确移除该任务，没有源码提交/新包或新候选授权。当前仍为 `codex/a9-30-shell-streaming` / `4318634915a82f539c7d33a5181b84953f9fd918`。

19:54:29+08，任务 `A9-30-R6-Desktop-Checks-20261002-R2` 创建成功，但启动前按原SID字符串检查失败，未启动控制器。只读核对证实Windows将Principal.UserId规范化为 `a9builder`，该名称实际解析仍为准确SID1005；LogonType=3/RunLevel=0、唯一固定动作/参数、无触发器、PT20M等批准字段均匹配。失败创建收据保留，未声称已在原收据捕获XML哈希。单独的注册后只读诊断绑定XML SHA `1afbc4b4cf4a638ae8c91f4dec06e16dc19bfe775da7eabf1097d97e0f067873`；随后恢复器仅对该失败创建收据、解析SID、精确完整动作及该注册后复核哈希核对，不接受其他任务或未核实身份。实际只读Audit通过后，19:56:33+08才对这一个批准任务调用Run；未重建/覆盖任务，未改原失败收据。

19:56:34+08，控制器实际进入 **SID1005 / Session3**，PID28856；但在 `TestBuildIdentityOnly` 的非提升/Medium/普通用户/无HostJob合并身份门处FAIL，steps为空。该调用抛错后没有返回完整token对象，因此具体失败项仍 **UNKNOWN**，不能单凭合并错误认定HostJob=true、提升或其他原因。两个恢复产品evidence目录仍0文件，Close/Crash/Recover全部 **NOT_PERFORMED**。任务进程返回0只表示PowerShell完成，不替代控制器FAIL或产品PASS。

19:58:01+08确认任务已停止、注册后XML SHA仍匹配、准确同账户登记后，仅移除该任务登记；没有删除任何测试目录/文件/数据库。收回原创建失败、恢复启动、精确移除及控制器首失败四份JSON，逐项尺寸/SHA一致：`r6-task-r2-return-files.json` / `r6-task-r2-return/`。20:03:54+08再次只读COM查询确认R2与拟议R3精确名称均不存在，controller-r3不存在，两个恢复evidence目录仍0文件；`r6-task-r2-removal-and-r3-pending-readonly-postflight.json`。新GUI重连仍未能将文本填入选中的“运行”字段，没有对旧命令或未核实文本按Enter。

### 新的固定启动器：仅准备，待新动作具体授权

为取得可诊断的完整身份，新控制器 `launch-r6-remaining-desktop-r3.ps1` SHA `5d014a202dde783f2d5330bc35257189013ba67c0c1bbac29cf2d1bfc99c7b02` 先保存与锁定kit同源的原始令牌/Job结果，再执行相同身份门；明确要求integrity_rid=8192，未放宽子进程条件。旧controller-r2 FAIL保留；原三个产品阶段尚未执行，所以使用原全新R3夹具目录及锁定driver/launcher，不覆盖失败产品目录。

新的提案任务为唯一 `A9-30-R6-Desktop-Checks-20261002-R3`，普通SID1005 InteractiveToken、无密码/触发器，入口 `launch-r6-desktop-same-token-r1.ps1` SHA `d7071e43e4b8bcf6bf510ceff3c6bfd576d20303e9144790c40e74456c6238a3`。它先要求真实Session3、普通非提升Medium并保存完整身份，只在宿主允许时以CreateProcessW/CREATE_BREAKAWAY_FROM_JOB创建 **同一令牌、同一Session3** 的固定独立子进程；不调整Job、UAC、账户或权限，不使用管理员/凭据/WTS跨用户令牌。子进程必须再次证明SID1005/Session3/普通Medium/非提升/无Job才可执行原Close→Crash→Recover；宿主拒绝、身份失败、测试失败均停止并保留诊断。超时记录残留UNKNOWN，不全局终止进程。此方案的宿主可行性仍待实测；[Microsoft Job Objects合同](https://learn.microsoft.com/en-us/windows/win32/procthread/job-objects)说明显式breakaway依赖宿主Job的许可，不以通用文档代替当前环境证据。

`dispatch-r6-desktop-interactive-task-r4.ps1` SHA `57a2615145e880aadba7330c354ca0899b95ea3ddc75d5ea851307b8c91ef626` 将任务主体解析为SID，先记录注册XML哈希再核对，结束后还要求控制器子进程不存活才能精确移除。两脚本实际PS5.1解析0错误、传输哈希一致，但 **STAGED_PROPOSAL_NOT_EXECUTED**。准确范围 `r6-desktop-same-token-task-exact-approval-material-r1.json`；因新增独立子进程启动动作，已依据A9-30 §4/AGENTS.md §5请求新任务范围具体批准，未把R2授权静默扩为R3动作。草稿静态复查确认WinSta0\default字面值单反斜杠正确；未实际调用新增桌面CreateProcessW。

原12PASS、原生/局部实机证据及其历史复核不重绑；新身份失败不是产品测试FAIL，更不是完整开发机门PASS。两文件提示提交/新包、编码warning全链路、运行中退出/恢复、最终独立复核仍待完成；DEVELOPER_GATE_NOT_SIGNED，Win7/新候选/Alpha2/RC未签发。


## 15. 已批准 R3 交互任务的实际失败与移除（2026-10-02 20:15 +08）

负责人具体批准 R3 唯一任务及同令牌独立子进程范围后，20:06:20+08 登记并运行 `A9-30-R6-Desktop-Checks-20261002-R3`。实际 wrapper SID1005 / Session3，普通、非提升、Medium（RID8192），Host Job 查询成功且 `in_host_job=true`。固定同令牌 CreateProcessW 路线返回错误5，`child_started=false`；三步产品验证没有启动。此处是入口失败，不是产品测试失败；错误5的进一步根因未证明，不能写成系统策略已定位。

20:09:01+08，在任务停止且登记/XML匹配后移除唯一 R3 登记，文件和证据保留。原始 start/wrapper/remove 三文件已收回，逐项尺寸/SHA一致，见 `r6-task-r3-return-files.json` 和 `r6-task-r3-return/`。20:15:09+08 只读后飞行确认 R2/R3 任务均不存在；三步 r3 控制器尚无结果、原两证据目录为空。具体记录 `r6-desktop-ready-readonly-20261002T121509Z.json`。没有改 Job/UAC/账户权限，没有提权或凭据替代。

负责人要求尽量脚本自动执行后，收敛为 A9 Builder 桌面启动一次固定控制器，随后 SSH 读取结果。桌面入口不再依赖重复 UU 键盘尝试。

## 16. 桌面自动入口身份通过、r3 夹具失败及 r4 修正（2026-10-02 20:25 +08）

负责人从 A9 Builder 实际桌面启动 r3 控制器。20:17:29+08 实测 SID1005 / Session3、普通非提升 Medium、Host Job=false；此前任务入口失败不再作为当前桌面身份结论。Close run `66dbe4a6-3e62-451f-a102-9cf1ca966ec3` 在配置 Provider 后等待页面正文包含模型名时超时，整体 FAIL；4个前置断言通过，尚无 Shell/helper 子进程或输出事件，不能计作运行中退出证据。Crash/Recover 自动停止，NOT_PERFORMED。

报告 SHA `2295abb0c90d30f5f43b664b4cf4cc51cc64182944d3b518c6e1df4cb036b4c3`；8份原始报告/截图/日志/控制器文件全部回收并核对尺寸/SHA，记录 `r6-recovery-r3-return-files-r1.json`。退出后实际 Electron PID18436 和控制器 PID31868 均不存在。未覆盖旧失败或改包。

r3 夹具的判据错误是用 `document.body.innerText` 查找位于输入框中的模型值；r4 改走未修改产品的 Provider 表单“应用并探测”真实 handler，等待按钮完成、字段值、实际 snapshot configured/tool_calling 和真实 probe 请求，同时核对同一对话身份。没有注入 Renderer 私有状态、修改产品源码或绕过权限链。r4 Close/Crash 使用全新隔离目录 `recovery-exit-r4-close-20261002-2025` / `recovery-exit-r4-crash-20261002-2025`，Recover仅复用本轮已完成的精确Crash事实。JS语法、Win10 PS5.1解析0错误、三文件SHA回验通过，见 `r6-recovery-r4-transfer.json` / `r6-recovery-r4-staging.json`；r4尚待桌面启动及实际结果，不登记PASS。

开发机整体门仍 NOT_SIGNED；贯通编码warning、剩余退出/中断恢复、新证据独立复核及两文件提示的具体提交/新包均待完成。Win7、新候选、Alpha2、RC不改判。


## 17. 桌面控制器：单次失败不退出调度（2026-10-02）

负责人指出每次失败仍需重新启动PowerShell。针对一次性入口退出这一问题，在既有批准control范围内准备临时 `serve-r6-desktop-tests-r1.ps1`。由A9 Builder真实桌面启动一次；实际SID1005/Session3、普通非提升Medium/无Job硬门仍有效。控制器最长两小时、串行处理本批请求，正常单次夹具失败只保留该次结果并返回WAITING，不重放请求；身份不符、生命周期未知或报告进程仍存活时停止后续派发。控制器仍可保存健康状态，不用继续测试掩盖硬门失败。

请求只描述Close/Crash/Recover、脚本revision/SHA、绑定source `4318634`与同一manifest、限定control内本批隔离root；不接收任意命令或参数。每次重新核对身份、脚本SHA/解析、目录无重解析、旧证据不存在；Recover前置继续由原launcher验证精确Crash。由可信实施方通过SSH投放并审核测试脚本；路径/哈希绑定不是不可信脚本沙箱，也不增加产品业务执行入口。无服务/计划任务/启动项、无账户权限/UAC/系统策略更改、无产品文件修改。

请求通过独立nonce文件以`.part`→`.json`原子发布；ready/request/result/log全部独立留存，health是明确可更新的运行状态。新本地请求生产者 `request-r6-desktop-phase.py` 核对唯一live worker、PID准确启动时间、心跳、控制器SHA及身份后才能投放固定阶段；Python语法检查通过。旧r3/r4一次性入口及失败材料保持。

Win10 PS5.1语法0错误、传输SHA一致；实际request validator 15个正负用例PASS，拒绝任意action、错误phase/revision/id/hash/source/root/额外字段。记录 `r6-desktop-worker-r1-transfer.json`、`r6-desktop-worker-r1-request-validator-selftest.json`。尚未由桌面启动控制器，队列失败后存活/再次派发及产品三步均NOT_PERFORMED；不能把请求校验PASS当作实机结果。已提供一次桌面启动命令，之后本轮普通夹具修正可用SSH投放新请求，无需每次重开PowerShell。注销、休眠或控制器自身退出后的恢复不在本临时方案内。


## 18. 控制器实际自动派发、失败后重试与退出恢复证据（2026-10-02 20:35 +08）

负责人一次从A9 Builder桌面启动临时控制器。worker `f01cb194caa044438d6267b9a0d5c2d9` / PID24220 /准确启动时间 `2026-10-02T12:28:47.7835011Z`，SID1005 / Session3 / 普通非提升Medium / 无HostJob。后续6个请求均由SSH生产者原子投放，不再操作桌面或重启控制器。首个生产者因Python拒绝七位小数UTC字符串，在发布前失败；保留 `r6-desktop-request-producer-first-failure.json`，仅将小数精度规范到6位，时区和心跳门不变。

| 实际报告 | run-id | 结果与范围 |
|---|---|---|
| r4 Close | `72161cf9-1388-4957-831c-f5cf04c9960f` | 15断言PASS_ACTIVE_CLOSE_SUBSET；输出先落盘且进程运行中可见，真实正常关窗产生cancelled终态、清理证明true、SQLite任务cancelled、实际PS/helper消失。 |
| r4 Crash | `4ab661c2-0623-42e5-bf2c-332218c5b647` | 10前置断言通过，实际隔离Electron退出码93，FAULT_INJECTED_PENDING_RECOVERY；故障注入本身不单签恢复PASS。 |
| r4 Recover | `6e4b9723-b2bf-4d75-b714-7fb7bf755f56` | 15断言PASS_INTERRUPTED_RESTART_SUBSET；同一对话/输出事件id与DOM各一次、tasks/turns为interrupted、无虚构tool_end/接管、旧Electron/PS/helper消失、Provider无重放。 |
| r5明确故障对照 | `fbc17b19-9539-4a4b-a19f-6729102c1ad4` | 在提交Shell前外部夹具故意throw，整体FAIL且5个前置断言通过；控制器记录PHASE_FAILED_CONTROLLER_REMAINS_AVAILABLE，进程已退出，返回WAITING。该记录是调度恢复负向对照，不是产品FAIL。 |
| r6修正版Close | `4e482046-12ee-42d4-88d8-dff0c473fe59` | 原r4驱动逐字节复用，新隔离目录和launcher绑定；同一PID24220控制器接收新请求，15断言PASS，证明单次测试失败后无需重新启动PowerShell。 |

另外重复r4 Close请求被 `PRIOR_PHASE_EVIDENCE_REFUSED` 拒绝，child_started=false；之后同一控制器成功执行Crash/Recover，旧证据未覆盖。ready/6 requests/6 results/五次启动stdout/stderr合计23文件回收SHA/尺寸一致，见 `r6-desktop-worker-return-files-r1.json`；r4实际产品21份、r5负例7份、r6重试7份原始材料分别绑定 `r6-recovery-r4-return-files-r1.json`、`r6-recovery-r5-return-files-r1.json`、`r6-recovery-r6-return-files-r1.json`。

五个新增根的251出口文件针对84合成秘密变体命中0，正向对照有效、无重解析点、所登记6个Electron均已退出；扫描范围包含r3首轮失败，保留并单独登记 `r6-recovery-worker-outlet-scan-postflight-r1.json`，不 retroactively 并入旧310/98文件扫描。控制器23回传文件另行84变体0命中，正向对照有效，见 `r6-desktop-worker-return-outlets-scan-r1.json`。合成扫描不证明任意真实秘密；PNG二进制扫描不代替像素检查。

已人工检查r4恢复截图：中断事实可见，输入/Stop未虚构仍运行；工具卡当时收起，截图不作为可见输出全文证明，输出一次以真实DOM断言绑定。当前Close/Crash/Recover子集已有直接桌面证据；编码完整warning贯通及新证据完整独立复核、提示源码提交/新包仍待完成。控制器保持WAITING，最长到22:28:48+08，非服务或自启动项。DEVELOPER_VERIFIED与Win7仍未签发。


## 19. 编码完整链路、自动接管与控制器硬暂停（2026-10-02 21:30 +08）

仍使用 source `4318634915a82f539c7d33a5181b84953f9fd918`、原 ZIP/manifest/native helper/输入锁；全部产品784文件及实际Electron22.3.27/Node16.17.1/ABI110重新核对。两文件运行中提示修正未提交。下述8次请求均通过SSH原子投放，未让负责人重启PowerShell、使用CUA键盘或修改账户/策略/计划任务。

| 轮次 | run-id | 实际结果及边界 |
|---|---|---|
| r7 | `418ee93e-6e86-4852-9b8b-7f24e7ad2c5a` | 5 前置/样本断言通过；FAIL。原生文件选择等待超时，编码未启动。 |
| r8 | `13d74107-a1ac-46df-a547-68419ce078fa` | 5 前置/样本断言通过；FAIL。外部夹具误取 BrowserWindow.title，编码未启动。 |
| r9 | `6ebab273-6944-419d-83fa-c4c7e1baf6e4` | 5 前置/样本断言通过；RUNNING。启动器超时；报告仍 RUNNING，清理 UNKNOWN，不计完成检查。 |
| r10 | `e51fa6db-897a-421c-bb3f-8885e1c022ca` | 13 前置/样本断言通过；FAIL。UTF-8样本通过；CMD命令引号导致CP936夹具未生成PID文件，整体失败。 |
| r11 | `68a5cffb-f204-4fb3-953f-e72c2a0d90aa` | 83 前置/样本断言通过；FAIL。11组编码/83项通过，但最后调用不存在的 switchConversation，整体失败。 |
| r12 | `527d7ac9-a4ef-49db-b387-c315ce39167f` | 94 前置/样本断言通过；PASS_ACTIVE_CLOSE_SUBSET。改用实际公共 activateConversation；11组编码及真实运行中关闭共94项PASS。 |
| r13 | `ef87f27d-586c-4bb2-9ee0-15fab613c95a` | 5 前置/样本断言通过；FAIL。明确的提交Shell前故障对照，整体失败，R2返回WAITING。 |
| r14 | `5e327b70-5174-4f17-92f8-c9492594d1d8` | 5 前置/样本断言通过；FAIL。R2接受后续请求，但漏建fixtures目录，Shell尚未提交；UNKNOWN触发暂停。 |

r12报告SHA `2769d19cddf881f2cdf240148b3befca8ed98bd7f9c991232b2919c8fcd8af29`。三个有效样本为UTF-8/CP936/UTF-16LE中文、CR/LF及无换行尾部；八个负例覆盖非法字节、EOF半字符、UTF-16代理字符与明确冲突字节。每例双源通过真实helper→Runner→Core→SQLite→Schema IPC→Renderer；错误warning、停止后续文本、截断、真实exit0和字节计数均保留，编码固定后不追溯改码。报告有10914次落盘先于IPC的观察（含重复快照观察，不是10914个独立事件），全部通过。11个编码helper及最后运行中Close的实际Electron/Shell/helper共14个登记PID，独立后飞行均不存在。

UTF-16LE编码在启动前由可信外部夹具设置Runner选项，不宣称产品有编码选择UI。CP936通过实际configureShell公共IPC和系统CMD Profile执行；外部夹具只为两个准确原生Shell选择标题返回固定系统路径，原生文件选择器UI为NOT_PERFORMED。CMD样本使用`/s /c`所需外层双引号；只证明该准确命令形式，不泛化所有带引号CMD命令。新报告/矩阵逐项绑定样本身份、实际request编码、源码/产物哈希及返回清单。

### 控制器修正与边界

R1在r9明确timeout_cleanup.shell_tree=UNKNOWN后错误返回WAITING；该调度缺陷已确认，原超时/仍RUNNING报告及错误调度结果保持。不得将R1的原始清理未知改成已证明。R2增加显式timeout/UNKNOWN停止条件；普通已知“Shell提交前注入故障”仅在记录无helper观察时可继续。实际PS5.1解析0错误，20个请求/生命周期正负判据通过，见`r6-desktop-worker-r2-validator-and-lifecycle-selftest.json`；这是模块判据，不代替真实桌面结果。

r12固定launcher先由原普通桌面进程启动R2，核对SID1005/Session3/非提升Medium/无Job及准确脚本SHA后写交接记录，再请求R1结束本次活动阶段后停止。R2 worker `b7b43f8dc2ed4498ac2adca12815f712` / PID10716 /启动`2026-10-02T13:09:43.1232184Z`，原截止22:28:48+08不延长，余下最多4次请求。R1已STOPPED_BY_REQUEST且准确进程消失；`r6-desktop-controller-r2-handoff-and-postflight-r1.json`为直接接管/身份与后飞行证据。

R2 r13故障后同一PID接受r14重试，但r14因主代理准备目录漏建fixtures失败；不能写作R2正向Close通过。随后明确UNKNOWN触发HALTED_LIFECYCLE_REVIEW_REQUIRED，两份实际结果与持续暂停状态保留；没有再向暂停控制器派发或静默重启。r14实际Electron已退出、Provider仅probe，未观察helper启动；原failure_cleanup的UNKNOWN仍不改写。请求生产者已补五个必需目录/重解析点前置，在发布请求前拒绝未准备目录；只读正反路径判据2项通过。修正未重跑r14，不给失败记录补签。

### 回收、扫描与当前待办

r7～r14原始返回共57文件逐项尺寸/SHA匹配；每轮独立`r6-recovery-rN-return-files-r1.json`保留。两个准确worker的ready/request/result/日志及接管记录58份回收匹配，`r6-desktop-worker-return-files-r2.json`，不覆盖原23份登记。八个新根423出口文件/84合成变体0命中、正向对照有效、无reparse、8个登记Electron已退出；58份控制器回传另行84变体0命中。PNG二进制扫描不代替像素检查；样本扫描不证明任意真实秘密。实际r12编码/DOM证据由公共IPC观察和真实页面DOM断言绑定。

最新矩阵`r6-real-electron-evidence-matrix-r8.json`仅追加本轮直接样本、全部首失败、R1缺陷/R2修正及实际硬暂停。编码warning产品贯通已有直接样本证据；独立完整复核、两文件提示修正具体源码提交及新包验证仍待。控制器暂停不会阻断本地报告与交接材料。DEVELOPER_GATE_NOT_SIGNED；Win7、新候选、Alpha2及RC均未签发，不占WIN7-43。没有提交、推送、合并或覆盖历史证据。


## 20. 批准三项完成：独立复核、两文件提交与新开发包（2026-10-02 22:38 +08）

负责人对准确材料r2（SHA `4ca083c1d5d35c6b40dab7d1609069e6b9109d01a899b06e28f42c23e8e1f7f3`）答复“批准”，仅授权独立只读复核、通过后准确两文件本地提交、从该干净source生成新开发包。明确不恢复当前暂停控制器，不包含推送/合并/发布/原生重建。批准记录`r6-note-source-and-new-evidence-user-approval-r2.json`。

Luna high `/root/a9_30_final_evidence_review`只读复核P0/P1/P2=0；66项冻结文件尺寸/SHA逐项吻合，r4生命周期、r12 94项、R1缺陷/R2修正/实际硬暂停及现有39定向测试登记边界准确。没有重跑测试或自签DEVELOPER_VERIFIED。记录`r6-note-source-and-current-evidence-independent-review-r2.json`；在追加本节前另存66项准确已评审字节，`r6-final-review-inputs-archival-index-r2.json`与`r6-final-review-inputs-snapshot-r2/`，防止当前文档追加后丢失原评审版本。

准确两路径提交为 `32ee0b48edd286c77aa543bdda9eb834fd4576aa`：`src/shell/product/renderer/a9-workbench.js`与`src/shell/tests/product/a9-workbench-contract.test.ts`，diff SHA仍`227fcf3283f7951301d5d14a4b86430a4ea909d0e092fdef164d06a36d9127d2`。仅更正运行中提示及其合同断言；提交blob逐项匹配批准SHA，主工作区及本工作树其余tracked/untracked路径提交前后全部保留，未推送/合并。精确记录`r6-note-approved-source-commit-execution-r1.json`。

新干净验证checkout为`/Users/qlyf/.codex/worktrees/a9-30-note-package-check/win7-coding-Agent`，HEAD绑定该source，沿用既有安装依赖，不安装新工具。第一次包沿用本机Node20.10，保存为`package-r6-note-a`诊断，不能关闭任务要求的开发宿主合同；随后明确使用既有`/Users/qlyf/.nvm/versions/node/v20.17.0/bin/node`重建到全新`package-r6-note-b`，源工作区仍干净。两包字节相同仅是记录，不声明独立双干净包构建；原生已锁定D-017双构建按准确hash继承，未重复编译。

Node20.17生产者及生产ZIP消费者完整性校验通过：ZIP `Win7CodingAgent-0.3.0-alpha.2-win7-x64.zip`，101309096 bytes，SHA `08425b621613c67d3079726f5fb39efc08a6c40f928a94da6f93184ef177b8b9`；manifest SHA `3afb33678e80d5a07abc94f419f82bb193a2955c92a373f4ad64e06498509522`；783载荷+manifest=784文件，source_dirty=false、external_acceptance_eligible=false、`A9_30_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE`。与旧source4318634包相比780个载荷精确字节相同，变化仅Renderer提示、`A9_30_DEVELOPER_CHECK.json`源码登记和`SBOM.cdx.json`；helper、SQLite、许可及其余运行时保持原hash。静态包内提示字节匹配批准a292…，旧提示已无；这不是实际UI可见证明。记录`r6-package-note-b-integrity.json`和`r6-note-package-byte-inheritance-r1.json`。

### 暂停事实及下一实机边界

新增只读SQLite观察使用锁定Electron的Node模式，SSH Session0，非GUI：r14原DB字节前后SHA相同，只有mode.set/provider.configure各1条，task=0、turn=0、无tool_start/output/end；原helper观察=0、非probe Provider请求=0、失败Electron不存在。原报告SHA `4adf22fff716c9bd7ec8c2ca3026c4f460d6ae34be318b1b40fdd97f3dbe397f`匹配已收回字节；原UNKNOWN不改写，控制器没有恢复。这是新事实观察，不冒充进程树清理或实机GUI PASS。首轮远程命令因长度超限被拒的stdout/stderr保留，改成已批准control内固定只读脚本后才得到`r6-r14-readonly-task-and-shell-dispatch-facts-r2.json`。

新包实际Win10启动、提示/输出/Stop及受影响UI检查仍NOT_PERFORMED。已形成仅本地的下一阶段具体方案`r6-note-package-win10-impact-exact-proposal-r3.json`：准确新包目录、Boot15/First16隔离目录、6个Win控制脚本和1个Mac生产者；新R3仅两个固定请求/两小时，SID1005真实Session3普通非提升Medium/无Job，未知清理/超时停止。JS语法已检查，新方案实际PS5.1解析/自检未执行；未传输新包/新脚本或创建三个新Win目录。新部署/控制器启动仍按任务§4另行具体授权；不把本次本地三项批准扩为旧R2恢复或新Win动作。

矩阵r9保留此前source4318634直接证据，当前新包只登记静态完整性及准确未变组件hash继承；整个已变Renderer和新包UI不能继承为直接PASS。源码提交/本地新包待办已关闭，新包实机及最终整体裁决仍待。DEVELOPER_GATE_NOT_SIGNED；Win7 NOT_PERFORMED，WIN7-43未占用，A9-31/32、Alpha2与RC裁决范围不开放。所有历史原文、失败包、失败运行和UNKNOWN保持。

## 21. 新包 Win10 直接启动与受影响交互验证（2026-10-02 23:08 +08）

负责人明确指示“执行Win 10实机验证”，随后“继续”，授权按§20准确方案部署和执行。身份只读核对为主机192.168.1.4、a9builder SID1005、console Session3活跃；SSH自身Session0只用于传输、解析、自检、调度和证据回收。6份远端脚本逐项尺寸/SHA匹配，实际PS5.1解析0错误、请求/生命周期自检20项PASS。Mac请求生产者执行前发现driver basename误写为不存在的`r6-product-product-impact-r`，保留原字节后只修为已冻结的`r6-product-note-impact-r`；未派发失败请求，6份远端脚本字节保持方案r3绑定。

新ZIP仍为`08425b621613c67d3079726f5fb39efc08a6c40f928a94da6f93184ef177b8b9`，source `32ee0b48edd286c77aa543bdda9eb834fd4576aa`，manifest `3afb33678e80d5a07abc94f419f82bb193a2955c92a373f4ad64e06498509522`。在批准的新product目录解包，784文件逐项尺寸/SHA通过；Boot15、First16两根的五个必需目录均先准备，证据在产品包外。

主代理通过UU真实桌面Win+R启动一次R3，之后两次请求均经SSH原子发布，无需负责人再次运行PowerShell。worker `28b84da844444132b8bf3c332938bc39`、PID30708、启动`2026-10-02T15:01:13.7225787Z`；身份直接证明SID1005/Session3、普通非提升、Medium RID8192、无Host Job。两小时上限、固定Boot15/First16，完成第二次后自动`EXPIRED_OR_REQUEST_LIMIT`并退出；原R2保持`HALTED_LIFECYCLE_REVIEW_REQUIRED`，未重启、清除或改写UNKNOWN。

| 阶段 | 直接结论 | run-id | 原始报告SHA-256 |
|---|---|---|---|
| Boot15 | `PASS_DIRECT_PACKAGE_BOOT`，1项 | `23586933-cdee-482c-b064-d4e4fac7d640` | `44cb4fd6c8365ce3a45e595a7b749026003247538c96969eebb4ba39dc2b42a9` |
| First16 | `PASS_INTEGRATED_SUBSET`，32项 | `8b38dba3-c6a8-4a8d-b6e3-ab4021c06c55` | `2575b72e1de78b580dff7923a83bc028474301c86c27217f99d4abefec042eb0` |

Boot使用新包自身electron.exe，真实工作台显示工作区权限选择并正常退出0；只证明直接启动。First沿用准确锁定官方Electron外部测试宿主，加载新包未修改main/preload/runtime/Runner/Core/SQLite/IPC/Renderer，使用loopback合成Provider。实际Electron22.3.27、Node16.17.1、ABI110、SQLite3.43.1匹配。

First中两个实际Shell运行均出现新提示“命令运行中；收到输出后会在此显示，可随时停止。”，旧提示缺席；首条tick/Stop输出分别在提交后548/612ms可见，此时尚无tool_end。三轮每两秒双源tick顺序正确，终态exit0、未截断、清理true；实际Stop按钮使Shell PID17440在124ms观察窗口内消失，终态cancelled/exit1、清理true。两个helper按锁定SHA `c895a2f9e4abcb84ae2295d2e33ada6289cfd34c692b88e92276e7749cdc5a2b`启动并退出。视图返回不重复输出、手动滚动不被抢回、Stop焦点稳定、跳至最新、分页稳定身份、刷新无新增事件/输出均通过。

307次输出快照观察全部先落SQLite再返回IPC，包含重复快照，不能当成307个独立事件；不存在event-id的落盘负向对照有效。原始报告、SQLite、stdout/stderr、DOM相关断言和截图回收到`r6-note-win10-return-r1/`，111文件尺寸/SHA逐项匹配。84合成秘密变体扫描零命中、正向对照有效；两根`-Force`出口清单与回收逐项数量一致，无重解析点。8个登记PID（两个Electron、两个helper、Stop Shell、两个启动器及R3控制器）独立只读后飞行均不存在。截图已检查直接启动、运行中tick/Stop的新提示和停止后空闲界面；二进制扫描不替代像素检查，也不证明任意真实秘密。

证据索引：`r6-note-win10-execution-user-authorization-r1.json`、`r6-note-win10-script-transfer-and-ps51-parse-r1.json`、`r6-note-win10-request-selftest-r1.json`、`r6-note-win10-staging-r1.json`、`r6-note-r3-desktop-ready-r1.json`、两份controller-result、`r6-note-win10-return-files-r1.json`、`r6-note-win10-return-outlet-scan-r1.json`及`r6-note-win10-exact-process-postflight-r2.json`。当前矩阵r10新增新source的两固定阶段直接证据；旧source4318634编码/协议负例/中断恢复报告仍保留原绑定，精确未变组件的继承须最终复核，不重标为新包直接执行。

本次新包启动和受影响交互验证已完成。新证据尚未独立复核，整体`DEVELOPER_GATE_NOT_SIGNED`；Win7 `NOT_PERFORMED`，未占WIN7-43，未裁决Alpha2/RC，未推送/合并/发布或原生重建。此前失败、诊断包和UNKNOWN保持。

## 22. 最终独立复核及开发机裁决（2026-10-02）

负责人要求最终复核与裁决后，独立Luna high复算28项冻结入口、66项旧归档与111项新返回，无缺失/尺寸/SHA差异；追溯合同、原始JSON、身份、截图、生产锁与新旧组件哈希继承。最终P0/P1/P2=0/0/0，建议DEVELOPER_VERIFIED；未重跑GUI或测试，不把复核当成独立实机重执行。

原生raw-pipe清理UNKNOWN初查疑点经明确获批失败边界复裁撤回：README_BUILD及生产返回校验器允许缺终态的有界fail-closed，协议明确要求记录UNKNOWN；Runner用户侧背压取消另有清理成功证据。两层不互相改判，旧UNKNOWN始终保留，不能把预期负例失败当清理PASS。

主代理依据上述独立意见登记 `DEVELOPER_VERIFIED` / `A9_30_DEVELOPER_VERIFIED`，完整裁决与逐合同分类见[最终收口报告](a9_30_developer_closeout_decision_2026-10-02.md)。矩阵r11和独立记录 `r6-final-independent-closeout-review-r1.json`是当前开发机登记；此前r1–r10、失败、未执行和UNKNOWN作为历史准确快照保留。旧source4318634直接报告不重绑为新source32ee0b4直接运行，780未变载荷精确继承与新包受影响检查共同闭合本合同。Win7 NOT_PERFORMED，A9-31/32/新候选/完整Alpha2/RC不纳入，未提交、推送、合并、发布或执行新构建机动作。

# A9-31：Policy修复源码提交、新r3开发包及Win10实机执行批准材料

日期：2026-10-04。Status: APPROVED_FOR_C1_C2_C3_EXECUTION。

负责人回复“批准”，具体批准原C1–C3。原全文SHA256 `37cd8d4b7d5bea326ed225a013e2812e7ea8e6c2067e6b3ad07e317ddf9bb0cc`及批准登记已保存在product-r3/approved-source-package-win10-contract.md和owner-approval.json。下述草案时点正文保留；实际结果在文末及既有任务状态追加。

请求一次具体批准下述C1、C2、C3，按依赖顺序执行。当前只完成本地修复/复验、只读目标预检和本材料；没有提交、新包装配、新根写入或普通桌面重启。原r2/R10、全部FAIL/UNKNOWN和工作区保留。

## C1. 只提交已验证的五路径源码快照

工作树：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`；分支：`codex/a9-31-background-tools`；准确父提交：`898ee9459a9b987840e94ddef336556ea58dd389`。index为空。

源码和测试只允许本表五路径，当前字节已经完成Core九组417/417、Shell九组117/117、七模块编译静态及24项实际编译Policy定向检查。新增变量/条件体/子表达式反例及原失败都保留；完整审批原command/cwd、拒绝/错绑定零派发继续验证。

| 精确路径 | SHA256 |
|---|---|
| src/core/src/policy.ts | a0851f60af52e683da864c416af9f9aa6a7e7f3a9dd785f42294c8e72a4ce463 |
| src/core/src/a9-agent-loop.ts | f4b5db823cdc707d7d3345594d80a5d17445419d9cc37006f0ef99e7d7804ce9 |
| src/core/tests/policy.test.ts | 5411e4b14315decc466ccc4cbdbf032ba891ff13e13a3f19fdefa94978802c19 |
| src/core/tests/a9-background-tools.test.ts | bf066c5a1a46b0c85943cb03f38c0c3402118827f2b3492448475ce284c31751 |
| src/core/tests/a9-verification-evidence.test.ts | f01ce71a59168d22cbdef601378bf8f0d99e4c5ffef2f2cca468ee14d59881b5 |

准确快照：`.acceptance/a9-31-developer/win10-policy-readiness-r1/source-commit-snapshot-r2/`；准确补丁：同根`source-commit-proposed-r2.patch`，SHA256 `adbfe333c07709a8a2190c24b664c6d3b7c3d8dc7499eacf40361fa1fba48fd2`。前一个proposed-inputs/patch是较早未执行提案，不适用于本次提交。

提交前重核HEAD/分支/index、五文件hash和diff。只逐项暂存本表路径，检查staged diff逐字节等于批准补丁，再执行一次本地普通提交：`fix(core): require approval for compound high-impact shell operations`。提交后检查准确40位source、父、仅五路径、五blob/工作区hash；其余dirty/untracked与旧证据逐hash保持。治理文档、生成dist、候选、输入和历史证据不进入本次提交。不推送、合并或改写历史。

## C2. 由C1结果在干净新checkout装配r3开发包

准确新本地根：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r3`。批准材料形成时不存在；执行前再确认不存在。

新checkout仅为根下`source-checkout`；从当前本地仓库`clone --no-checkout --shared`，detached检出C1实际生成并通过五blob核验的40位source。不猜测新commit，不把898ee945当作新修复source，不改原仓库refs/remotes。准确全新output仅为根下`package`，运行前不存在。

仅在新clone的.git/info/exclude登记并建立以下八个精确、忽略的依赖链接，读取已有离线锁定依赖，不安装/下载、不写目标：

| 新checkout内路径 | 既有目标 |
|---|---|
| node_modules | /Users/qlyf/Developer/win7-coding-Agent/node_modules |
| src/core/node_modules | /Users/qlyf/Developer/win7-coding-Agent/src/core/node_modules |
| src/gateway/node_modules | /Users/qlyf/Developer/win7-coding-Agent/src/gateway/node_modules |
| src/git-adapter/node_modules | /Users/qlyf/Developer/win7-coding-Agent/src/git-adapter/node_modules |
| src/runner/node_modules | /Users/qlyf/Developer/win7-coding-Agent/src/runner/node_modules |
| src/shell/node_modules | /Users/qlyf/Developer/win7-coding-Agent/src/shell/node_modules |
| src/state/node_modules | /Users/qlyf/Developer/win7-coding-Agent/src/state/node_modules |
| src/workspace/node_modules | /Users/qlyf/Developer/win7-coding-Agent/src/workspace/node_modules |

固定生产者`scripts/release/build-a9-product-v3.mjs` SHA256 `a66f8f9230963d4591503a56d6ff8896ed4931c5719d57bffa453242009b94fe`；Node20.17.0绝对入口`/Users/qlyf/.nvm/versions/node/v20.17.0/bin/node`及该bin PATH。固定lock为新checkout内`release/win7-product-v3/a9-v26-managed-input-lock.json`，SHA256 `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e`。

| 生产者输入参数 | 精确只读路径 | SHA256 |
|---|---|---|
| --electron-zip | /Users/qlyf/Developer/win7-coding-Agent/.acceptance/deps/electron/electron-v22.3.27-win32-x64.zip | ad723ed7dad32f9459f7a9de1fd6d718cf713c4809c2431503bea62ce8f786e6 |
| --storage-zip | /Users/qlyf/Developer/win7-coding-Agent/.acceptance/deps/a6/WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip | 2cb0cd324bb449fb5457549addd3e7f8f0610d6258415309ee748fb279a72794 |
| --runner-zip | /Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/native-kit-r3/return-BuildA/WIN7_D013_V26_HELPER_ARTIFACTS_20261003-060935.zip | 251674103e519b4e642c46b38d2b8af29929732a209613cfc5d3721daba47a40 |

其余argv只为`--source-commit` C1实际source、`--formal-input-lock`上述新checkout锁和`--output`上述package。进入生产者前重核source/干净status/锁/输入/版本和已有native登记；不传allow-uncommitted。生产者重新编译七模块，不用恢复过的旧tracked dist或早期production-runtime准备探针输出打包。

装配后用同source的verifyA9ProductZip、新ZIP/展开树双向全闭包、实际加载JS/Profile/native/许可证/SBOM/manifest核对。单独检查包内Policy和完整审批摘要确含当前修复；helper仍为`2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7`。现有BuildA/B和锁定native只作适用继承，不重编native，不借用旧r2整体实机结论。

准确新source、ZIP/manifest/hash、全部输入/工具和本次批准必须写入新不可变包身份记录后，才能进入C3。未知hash不得派发。保留首次失败；装配本身失败时停止C3，诊断不修改生产者、锁或洁净门，不覆盖失败输出。

仍为`A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE`，external_acceptance_eligible=false，无候选authority，不占用WIN7-43，不发布。

## C3. 固定新根、四测试源与普通Win10八phase

准确机器：`192.168.1.4 / WIN-2JQ66JE4HTQ / Windows 10 Pro build19045`。2026-10-04T09:00:09Z只读SSH核验C盘6543396864bytes空闲、新根不存在、旧r2指定Electron路径零进程；这不是新产品身份或运行PASS。SSH保持StrictHostKeyChecking=yes和IdentitiesOnly=yes；Administrator只准备/传输、固定取证组件编译、固定请求派发/查询/回收。

准确远端新根只为：`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R1`。执行前必须不存在、无reparse、≥2GiB空闲；每请求≥1GiB、根总量≤1GiB。仅package/host/inputs/control/requests/runs/evidence/compile及原框架已定义的有界文件。继承权限，不改ACL；不触及日常数据库/provider/项目/旧root。磁盘不足仅暂停，不清理旧证据。

批准后先在任务C14登记并仅实现四个新外部测试源：

1. `.acceptance/a9-31-developer/product-r3/control-scripts/stage-product-r3.ps1`
2. `.acceptance/a9-31-developer/product-r3/control-scripts/launch-product-r3-desktop.ps1`
3. `.acceptance/a9-31-developer/product-r3/control-scripts/serve-product-r3-desktop.ps1`
4. `.acceptance/a9-31-developer/product-r3/control-scripts/product-r3-driver.cjs`

只从已保留r2对应四源复制，并在新文件修改准确source/包/master/批准/新根绑定和本次Policy断言；原四源不变。只读基准SHA依次为`f44c6b836bae40dfba371f84f150904683dd960fa587e289e0bb2d2a503db27d`、`8b226b679356a5c15237f55fda4147524f519c4fe0d8b451e7f4a16240471e80`、`6be47f97a0c075a6b73c4e169855f26152648c20d73a4a5ab094d5e8323bd5b5`、`17b491cfe25a14e43341fe76ee1333730aace2579bd5bae2a782722086dddd77`。保留最终r2当前handle游标修正，不恢复旧错误revision。

九字段schema、八phase、32hex run、真实句柄/父/Session/creation/映像/exit、claim、回执预算、完整性/身份/安全判据不变。允许同四源内普通夹具局部修复；先定向检查，再新不可变按SHA命名revision/checks/registration。已执行master/输入不能热改。所有最终hash由实际字节产生并冻结；本材料不填虚构hash或执行占位符。

取证仍使用相同V4固定C#源：19439bytes/SHA256 `dbc85763ce25287adcb4c853e37963755c56d9561f9d06e41f53bfdb78e952cd`；仅新根固定编译一次并产生绑定C1 source的新DLL/MVID/build。不得改写旧DLL/build的source。无新增C#实现或API；Profile保持`WIN10_PS51_NET4_QUERY_HANDLE_CAPTURE_V4_TEST_ONLY`，不得进入Win7产品或SBOM。固定csc/三参考/kernel32的版本、SHA和实际API入口按[r2合同§3](A9_31_PRODUCT_R2_WIN10_VALIDATION_APPROVAL.md)原值逐一重核，漂移即停。

实际PS5.1三源解析、新Node/Renderer输入、master/revision/锁/限额/claim正负例先通过；新DLL重新验证查询/区间/文件/精确UTC/回执及未来206ticks等负例，最多16夹具子进程/每个10秒/总200次捕获及60秒。全部已持有真实实例和exit绑定；不回退粗时钟、不以后来消失补签退出。新host只由同锁定Electron档案提取并核验。

普通产品/dispatcher/worker/Electron必须直接证明SID `S-1-5-21-3031939772-989444280-3099258187-1005`、profile `C:\Users\a9builder.WIN-2JQ66JE4HTQ`、Session3、Medium8192、非提升和InJob=false。Active会话不能替代实际进程token/Job证据。Computer Use在A9 Builder普通桌面一次启动全新入口；既有负责人手工协助仅在输入失败时替代输入操作者。其余启动核验/固定派发/回收由代理执行。不用管理员启动、计划任务或Job脱离。

同一窗口最多120分钟、16个固定phase请求，无自动重启/服务。先受控Boot失败及真实整树exit，再同dispatcher正常Boot；随后`Background`最短真实start→输出→Stop→starting审计/SQLite/归属/实际退出，才扩展全部后台回归。完整顺序为Boot→Background→Shell→EncodingSecurity→FailureBoundaries→StopExit→ReleaseExit→Recovery；原r2合同§4表的全部直接检查、5秒交付预算和700ms背压负例保持，原六个未执行phase不能继承为新包PASS。

本次Background/审批增加以下真实main/preload/IPC/Renderer/SQLite断言：

- 原Remove-Item、含自主Git的发布/系统变更、明确全局依赖、PowerShell/CMD静态变量和条件体/子表达式，均先pending落盘再可见审批；shell/start_process两个实际入口各有覆盖。
- 原完整command、显式cwd、中文空格目标及超过旧160字符边界的参数在实际窗口可核验；保留脱敏边界，不用简短摘要替代完整目标。
- 错digest、旧Turn/变化参数拒绝；正确绑定仅执行拒绝，核对SQLite/audit结果、helper派发数未增加、隔离marker未出现。
- 高影响反例只拒绝，绝不实际执行删除、发布、全局安装或注册表/服务变更；无效网络目标使用example.invalid。纯输出/正常测试是自主执行对照，不能为了通过而放宽确认。

每run先保存原始响应，再断言；绑定新source/ZIP/manifest/lock/master/revision/请求、实际账户/Session/权限、模块路径/hash、相关SQLite安全事实、真实UI和持有实例exit。失败反例只有设计边界成立、零后续派发且实际树结束才记CASE_PASS。

身份、完整性、安全、必需审计或未知生命周期失败立即HALTED并停止下游；同类失败连续两轮未闭环先最小共同根因诊断，不延长等待/削弱断言。同范围普通夹具修复及有界重试无需另一次批准，但必须旧树已实际结束并使用新不可变revision。产品/native/锁/安全协议或新源路径改变不在C3授权内。

通过固定stop正常退出并用原持有句柄取证；不任意PID强杀，不恢复HALTED旧实例。返回有界inventory/尺寸/SHA、合成秘密各出口扫描、输入/控制后飞行与树退出证据；原r2/首FAIL/UNKNOWN不改判。独立收口、DEVELOPER_VERIFIED负责人裁决和Win7仍单独边界。

## 批准范围和本次等待原因

请求仅批准C1精确五路径本地提交、C2新根干净离线装配及检查、C3四源实施/固定取证编译/新根普通八phase与取证回收。除材料明确的三项，不包含推送/合main/发布/删除/恢复R10/原生重建/锁/账户/ACL/UAC/服务/Bitvise修改、委派、独立验收或Win7。

等待具体批准来自[A9-31任务书§6](../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)："本任务后续源码提交、原生kit批准/双构建、远端新目录/写入、本地整合与候选门另行具体批准"。当前本地修复授权材料§7明确不含提交/新包/远端。生产者同时强制`A9_V26_CLEAN_SOURCE_REQUIRED`，不能从未提交工作区打新包；先完成本材料和准确快照，再请负责人批准这三个实际动作。不是skill新增审批或自动审批拒绝。

## C1实际完成登记

准确source `ebda91123e62b225c3fd104c9c9b564a4b61c466`，父898ee945，仅批准的五路径提交；五blob与表中SHA/所测字节一致，index为空，其余46个dirty逐hash不变。证据source-commit-result.json和staged-approved.patch；没有推送/合并。C2/C3在已批准范围内继续，旧待批准措辞仅保留为历史时点。

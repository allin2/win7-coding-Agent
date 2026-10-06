# A9-31 后续对话交接（2026-10-04）

## 1. 交接点和目标

本次负责人要求交接，后续由其他对话继续。交接动作不授予新的打包、远端写入、提交、代理复核或候选权限。
整体目标仍是完成A9-31后台进程、A9-32用户主动继续，与A9-30整批取得Win7正式执行、独立审核及负责人门B PASS；完整Alpha2/RC另走合同。
**当前准确停点：Windows工作区归属三路径修复已提交，开发包r2具体合同已形成，但未获批/未生成。**
上一条待负责人确认的问题是：是否批准[A9-31开发包r2本地装配合同](../../plans/A9_31_PRODUCT_R2_LOCAL_PACKAGE_APPROVAL.md)§1–3。负责人随后要求交接，没有批准该包。

| 工作 | 当前合同状态/证据结论 |
|---|---|
| A9-30 Shell实时输出 | APPROVED_FOR_IMPLEMENTATION；A9_30_DEVELOPER_VERIFIED；Win7 NOT_PERFORMED |
| A9-31 后台工具 | APPROVED_FOR_IMPLEMENTATION；A9_31_IMPLEMENTATION_IN_PROGRESS；未DEVELOPER_VERIFIED |
| A9-31当前修复源码 | 已本地提交898ee9459a9b987840e94ddef336556ea58dd389；本地State/Shell通过；新包Windows NOT_PERFORMED |
| A9-32 用户主动继续 | DRAFT_READY_FOR_REVIEW；DESIGN_PENDING_APPROVAL；未开始实现 |
| A9-33 整批Win7候选 | DRAFT_READY_FOR_REVIEW；source NOT_BOUND；WIN7-43仅暂定，未冻结；Win7 NOT_PERFORMED |

现状以[STATUS](../../STATUS.md)、[任务索引](../../tasks/README.md)及每份任务末尾的准确批准/执行登记为入口。保留的早期“待批/未执行”段落是历史时点，不能覆盖后续登记；草案的早期接口描述也须对当前源码重新核对。

## 2. 必须使用的工作树及保护

- 工作树：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`。
- 分支：`codex/a9-31-background-tools`。
- HEAD：`898ee9459a9b987840e94ddef336556ea58dd389`；父：`35a19250ed6589f6a7ba35b940a784325970c111`。
- 当前index及src/native/scripts/release实现diff干净；工作树整体有五个已修改治理文档和多份未跟踪历史审批/报告，**整体不干净**。
- 未提交材料含DECISIONS、STATUS、STATUS_LOG、WIN7_CONSTRAINTS、A9-31任务书的历次准确补充，以及R1–R10历史合同/报告和新r2合同。不得清理、覆盖或为了打包暂存所有文档。
- 原主工作区`/Users/qlyf/Developer/win7-coding-Agent`只读核对为`codex/a9-alpha2`、HEAD `a53c9b9d861486e5923bc82ea70b31b76af1a939`，有文档修改、两处Electron ZIP删除和未跟踪check.py/设计/报告。它不是本次实施工作树，不切换或清理。
- 本交接文档和大部分R1–R10文档未提交；`.acceptance`为Git忽略的证据目录。**仅clone该source不会带走这些材料**；新对话应直接访问此工作树及证据，另机器交接须另行完整安全传输，不假定Git已包含。

接手先核对实际状态，不执行reset/checkout覆盖当前修改：

```sh
cd /Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent
git -c core.fsmonitor=false status --short
git branch --show-current
git rev-parse HEAD
```

先读本工作树AGENTS.md，再按需读WIN7_CONSTRAINTS及[A9-31任务书](../../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)。C14任务状态/分支/精确路径必须同时满足。本文不替代原始任务合同。

## 3. 最近完成的五路径提交及共性修复

准确提交只含以下五文件，暂存/提交blob逐项与批准字节匹配；另外35个已有修改/未跟踪文件在提交前后逐字节核对一致。后续文档登记只作追加/批准状态登记，没有扩大源码提交。

| 提交文件 | SHA-256 |
|---|---|
| src/state/src/a9-persistence.ts | fc7a3b9a78c5ed2cdfe595d8d32f172f73ec38d536939d21d9257f4495160b4a |
| src/state/tests/a9-managed-process-ownership.test.ts | 507a0363fc442de64fa4f313eecf11c7ac0a92754b90a496fe80366ee0be46dd |
| src/shell/tests/product/a9-background-tools.test.ts | e1820080f08b3a6200ea35ee9d945722976ecccde7f192ed7b47ed8667899e3f |
| docs/plans/A9_31_WINDOWS_WORKSPACE_OWNERSHIP_REPAIR_APPROVAL.md | 776fc053a25a35f4b9cf53a054d8170620a17c3c4542cde3d670c60f9b08bec1 |
| docs/reports/2026-10/a9_31_windows_workspace_ownership_local_repair_2026-10-04.md | 8cf020327a0d7eaca9fb14d5789b1725d63e79d70a1662f66ced8121479c382f |

[修复报告](a9_31_windows_workspace_ownership_local_repair_2026-10-04.md)记录三个已证实问题：

1. recordManagedOwnership将canonical session与display fact用字符串全等比较，拒绝同一Windows目录；现复用sameWorkspacePath，仅替换该目录比较。
2. listManagedProcesses精确路径键查找会漏掉历史不同大小写/分隔符事实；Windows用等价路径键取回，不改历史原始字段，不用SQLite ASCII-only NOCASE代替Unicode比较。
3. 原sameWorkspacePath用win32.isAbsolute('/w')误识别POSIX，放宽/w与/W；现结合实际平台和drive/UNC根识别，POSIX保持大小写敏感。

canonical owner的精确身份匹配、session/task/turn关系、active状态、request不可变和release guards均保留。只读检查State/Core/Runner/Shell/Workspace/Git Adapter相关入口后，没有已证实需要第四路径的本批同类缺陷；不声称全仓库所有路径问题均排除。
新增用例覆盖Windows斜杠/大小写/dot/中文/空格/UNC/非ASCII、错属/归档零写入，先持久化starting后native start、晚输出原Turn、Stop/release和起始审计失败零派发。

## 4. 本地检查、首失败和dist陷阱

实际本地环境为Mac/arm64、锁定Node20.17.0；Windows路径用例是显式模拟process.platform，不是实机证据。

| 检查 | 结果/证据 |
|---|---|
| State任务三组 | 3 suites / 82 tests PASS；state-final.* |
| Shell任务九组 | 9 suites / 117 tests PASS，正常exit0；shell-final.* |
| verify:quick | 七模块build/lint/static PASS；verify-quick.* |
| 提交后的docs:check | 270文档/48任务PASS；source-commit-docs-check.* |
| diff --check及提交范围/blob/父验证 | PASS；source-commit-diff-check.*、source-commit-result.json |

首红State6失败/10通过、Shell Windows启动失败保留；Jest只读platform夹具首失败、Stop回执夹具首失败、旧dist导致的两个已有lifecycle失败/隔离Node子进程中断，以及文档记录Python参数环境错误均保留。不把夹具失败或受控异常伪装成真实Windows异常。
**verify:quick曾重编24个tracked Runner dist；最终Shell测试使用重编结果，通过后保全生成副本并只恢复原HEAD的24个字节。当前checkout tracked dist仍可能是历史版本。**
若新的产品检查需要执行，先按合同重编sibling模块并保全生成变化；不能直接在旧dist上推断源码失败，不能通过forceExit代签。新包生产者从准确source重编七模块，不应消费这些历史dist作交付输入。
源码未变且相应source/依赖/config/调用行为和原记录hash相同的项目可按精确矩阵继承，标INHERITED_EVIDENCE；不要机械重跑全量，也不要仅看某个文件未变就继承共享链路。

本地根：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/windows-workspace-repair-r1/`。

| 关键记录 | SHA-256 |
|---|---|
| local-repair-evidence-matrix.json | c410cccb63db1c682addb8ee34102494e719e0f621c4b5dcfea2b80e3fb2835c |
| source-commit-result.json | ed8dc6b0577796ec2066975b00eb44b94bd766f2939509dcb53f5131600a4d0c |
| source-commit-handoff.json（批准时五路径） | e0364118ea954e749600fd6f14c399c561ec1645d84526da4b9f6c9b2c496234 |

同根source-snapshot、source-commit-snapshot、source-three-path.diff、verify-generated-runner-dist及恢复记录可核验。源码提交批准与执行、原stdout/stderr均保留。

## 5. 原生、旧开发包与Win10直接证据

- managed原生source：`10114503a1e79706131ea4a11a5b96bd2958807a`；双返回BuildA/B helper逐字节一致。
- 当前managed输入锁：`release/win7-product-v3/a9-v26-managed-input-lock.json`，SHA `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e`。
- helper SHA：`2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7`。
- [独立原生返回复核](a9_31_managed_r3_independent_return_review_2026-10-03.md)原结论P0=0/P1=1/P2=0、NOT_APPROVED_FOR_INPUT_LOCK保留；后经负责人[ADR-0158准确有限裁决](../../plans/A9_31_MANAGED_R3_RETURN_RELOCK_APPROVAL.md)才取得离线输入准入和锁。controller exit/tree UNKNOWN及原生raw-pipe背压缺终态仍保留，不改判清理PASS，不将有限准入扩大为Win7/RC证据。
- 本次State修复没有修改native/Runner/Core/Runtime源码及锁；无需因它重复原生构建，按精确hash复用原批准工件。
- 旧包r1源码：35a19250ed6589f6a7ba35b940a784325970c111；ZIP `aae71bb0c446bda7e9bd04f58b51c208d02d4c723f13908e55cd077e0d2f10c0`；manifest `df70fa5bd2df2f91eeed8cf441006241442cea33cc6c622c82a92742ca97e7b9`。

[R10事实报告](a9_31_r10_partial_pass_and_windows_ownership_failure_2026-10-04.md)是旧包实机入口：

| 旧包Win10 phase | 事实 |
|---|---|
| Boot | 8项PASS；run96f27fe5c0354a97b7979420ea0744fa |
| Shell | 22项PASS；rund1a3aa48baea47e0ab98d554071ed304 |
| EncodingSecurity | 重试70项PASS；run95c88929c1d04ae3bd840fb378f0c6ef；首失败保留 |
| Background | FAIL；run5dee77858e484e51b7380c9bcf9fa701；helper启动前必需starting归属审计失败，原DB无managed事实 |
| FailureBoundaries / StopExit / ReleaseExit / Recovery | NOT_PERFORMED；审计失败停止下游 |

R10已经按原stop合同实际取得dispatcher退出码0；143持有树实例实际退出码闭合；657文件/49075360bytes全hash回收，秘密出口0命中；后飞行144旧实例未观测存活。raw COMPLETED只表示停止，不代表八组通过。
**不能恢复R10、热改master、复用HALTED/停止/过期控制器，或把旧三组PASS改绑到898ee94新包。**新包必须重做后台/退出/恢复及受影响的Shell/脱敏/先落盘再发布链路。

旧现场证据根：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r1/`。
入口为r10-partial-validation-matrix.json、r10-partial-evidence-index.json、r10-post-stop-return-inventory-r2.json、r10-ordinary-return/和r10-background-first-failure-return/。
历史固定脚本位于control-scripts/，冻结版本位于frozen-control-r10*/及r10-preparation-return/inputs/。最后编码driver不可变revision为2637f296c7bb2a181643cdc2dad08c34c0db0875a16725e91a168b2c7092e972；重新准备必须绑定新包并冻结新身份，不能改旧revision。

## 6. 远程与自动化入口（仅历史信息，接手重新只读核对）

历史Win10为192.168.1.4、WIN-2JQ66JE4HTQ/build19045；A9 Builder准确SID为S-1-5-21-3031939772-989444280-3099258187-1005，profile为C:\Users\a9builder.WIN-2JQ66JE4HTQ，实机时Session3。
本次交接未联网，不能把旧身份/Session/在线状态当作当前已验证。Win7历史IP192.168.1.3也只作线索，不凭IP认机器。
沿用既有SSH密钥/known_hosts、StrictHostKeyChecking=yes、IdentitiesOnly=yes，不猜密码、不接受主机密钥冲突、不改Bitvise/账户/ACL/UAC/服务。管理员SSH是调度/传输身份，不替代SID1005普通桌面/Medium/非提升/noHostJob产品证据。
历史传输实现可定位`.acceptance/a9-31-developer/native-kit-r3/remote.py`及product-r1下r10-*-inputs.json/原stdout/stderr；先核对工具入口作用和目标，保护内部凭据，不直接运行旧默认构建动作或打印配置。
用户希望最大限度自动化：新有限普通桌面控制器启动一次后，SSH派发固定phase/取证/回收；普通夹具失败只有证明真实树结束才能等待后续批准的修复版本。身份、完整性、安全、审计或未知生命周期硬门立即暂停。GUI仅用于不可替代的桌面入口/真实观察。
Task Scheduler与管理员SSH曾造成Host Job硬门失败，不能通过Job脱离、管理员执行或放宽noJob解决。历史新控制器/新目标授权不自动覆盖r2新包。
**R10捕获库/ADR-0168包含kernel32!GetSystemTimePreciseAsFileTime及WIN10_PS51_NET4_QUERY_HANDLE_CAPTURE_V4_TEST_ONLY，仅外部Win10测试。不能直接复制为Win7正式套件；Win7需其自身兼容API/Profile/批准合同。**

## 7. 接手后执行顺序和授权

1. 读本交接，核对§2、AGENTS、当前任务/状态及准确信息。读[提交登记](../../plans/A9_31_WINDOWS_WORKSPACE_REPAIR_SOURCE_COMMIT_APPROVAL.md)§4和[开发包r2合同](../../plans/A9_31_PRODUCT_R2_LOCAL_PACKAGE_APPROVAL.md)；r2材料SHA `f415096d1b1534fa3f203ec200ed4d10cb17fee729192e816dfde049edd7c2a8`。先取得该材料§1–3的具体本地装配批准，不能把“交接”解释为批准。
2. 获批后按r2材料创建准确本地干净detached验证checkout及全新output；核对source/锁/登记/三archive，读取现有锁定依赖，不安装。用绝对Node20.17.0及固定PATH运行原生产者，从source重编七模块；原工作区不清理。
3. 验证ZIP/展开树完整闭包、runtime/Profile/helper/SQLite/许可证/SBOM及State修复/managedOwner/onOutput进入实际包。保存首失败、准确新ZIP/manifest/hash和外部报告。它仍是A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE，无authority、不占WIN7-43；Mac包检查不签WindowsPASS。
4. 基于实际新包形成新Windows精确合同（准确源、ZIP/manifest/锁、允许外部测试文件、新profile根、不可变控制器/pin、普通身份、8phase、期限/请求上限），具体批准后才部署/运行。复用框架和原API，不复用旧停止控制器；测试含Windows路径修复、后台句柄/游标/3上限/Policy、release/停止/退出/恢复及受影响Shell安全链路。
5. 完成Win10全部必需直接场景后，形成准确源码/包/证据交接，单独指定独立复核人。若请求代理，必须明确授权；已授权Luna且未另指定时用gpt-6-luna/high，仅一个只读复核任务，不再次委派。实现方不能自签独立结论。必要合同都满足才由负责人裁决A9-31 DEVELOPER_VERIFIED。
6. A9-31收口及本地整合分别具体批准后，更新/批准A9-32/ADR-0152并绑定包含已审核A9-31的准确整合提交；按独立任务/分支/路径实现用户主动继续。设计依赖managed锁，不默认新增原生构建。
7. A9-30/31/32全部开发合同完成后，补齐/批准A9-33具体套件、干净基线及需求矩阵；核对候选编号，两次Win7成功预演、独立干净双打包/冻结、候选外authority/pin及负责人门A、普通Win7正式执行/审核/秘密扫描/后飞行/门B。所有必需项满足后才第二批Win7 PASS；完整Alpha2/RC另裁决。

当前r2尚不存在的准确目标与固定argv/三输入路径已在材料列明；接手无需重新设计或重新询问已批准五文件提交/三路径修复。新提交、整合、远端写入、复核代理、门A/B、推送/发布都不从本交接自动获得授权。
默认主代理推进，不默认委派；缺少环境只暂停依赖它的动作并记NOT_PERFORMED，其他已授权本地材料继续。A9-17性能、A8、恢复目录迁移、安装器及凭据生命周期仍是独立范围。

## 8. 交接材料本身的绑定

本次只新建交接文档/候选外快照及文档检查记录，不提交、不写远端、不改源码或包、不删除、不启动代理。
准确快照：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/continuation-handoff-20261004-r1/snapshot.json`。
快照SHA-256：0d0b4a71d7fa0ac1d522d812fa45299a5f833756ff0acca2f809953a23c6a6a6。它绑定交接前两工作区ref/status和关键证据字节；交接后的docs/diff检查见同根handoff-docs-check.* / handoff-diff-check.*。
交接文档是快照时点信息；接手必须重新核对HEAD、批准、目标身份和证据hash。

## 9. 后续对话接手核对（2026-10-04；r2批准前）

本轮按负责人要求读取本交接并使用指定A9-31工作树，仅核对本地基线、授权、证据和装配输入，补充本节及候选外核对记录。交付目标仍为第二批正式Win7 PASS；本轮不提升任务Gate。

- 实际分支为`codex/a9-31-background-tools`，HEAD仍为`898ee9459a9b987840e94ddef336556ea58dd389`，父为`35a19250ed6589f6a7ba35b940a784325970c111`。index及src/native/scripts/release/release干净；五个治理文档修改及32个未跟踪文档保留。五个批准提交路径的工作文件和HEAD blob逐项匹配批准尺寸/SHA。
- 本工作树AGENTS、WIN7_CONSTRAINTS和完整A9-31任务书已读取；STATUS/任务索引仍登记A9-31实施中、A9-32/33待批准。五路径提交已完成，但r2合同仍为`DRAFT_NOT_APPROVED`且没有追加批准登记，合同SHA仍为`f415096d1b1534fa3f203ec200ed4d10cb17fee729192e816dfde049edd7c2a8`。
- 全局增量规范已读取。项目增量规范目前只存在主工作区，按负责人提供的规则以只读方式读取，未复制到本工作树或当作898ee94已提交文件；具体A9-31合同继续优先。
- **本轮直接核对：** 原交接快照、修复矩阵、源码提交登记、矩阵所列13个原始结果/首失败记录、受保护源码/锁及R10六个索引记录哈希一致；R10返回657文件/49075360bytes逐项尺寸/SHA一致。R10矩阵仍绑定旧source35a19250及Background失败，四个下游phase仍NOT_PERFORMED，不重绑到新源。
- **历史本地检查，INHERITED_EVIDENCE：** State3组82项、Shell9组117项及verify:quick的原结果、源码绑定和已有stdout/stderr已读取；本轮没有重跑产品检查。Core/Runner原报告哈希与列明组件字节一致；不据此签新包或WindowsPASS。
- **r2只读输入核对：** 三个准确archive及锁指定electron/helper/SQLite条目哈希一致；BuildB archive也匹配，BuildA/B helper均为`2036bf69…51e4b7`。managed锁/registry的文件及登记commit blob、生产者SHA、Node20.17.0和八个既有离线依赖目标一致；七模块TypeScript5.3.3、Node类型16.18.126及五个实际复制运行时依赖的版本/installed integrity元数据与source锁匹配。Shell/State的Node类型实际从根node_modules解析，已按实际路径登记，不安装或写入依赖。
- **NOT_PERFORMED：** r2根/source-checkout/output均尚未创建，未编译/装配新包、连接Win10/Win7、启动或恢复R10、写远端、提交/推送/整合、委派或独立收口。装配只能在r2§1–3具体批准后执行；新包仍需准确Windows执行合同及直接后台/停止/退出/恢复和受影响安全链路证据。

候选外接手快照位于原交接证据根的`continuation-readback-snapshot-20261004-r1.json`，SHA-256为`bb20c17f37e1654c3796140777a1e92f3df7a28eb0cf796d15b9bd0c3d225071`，绑定本轮逐项核对、两工作区原dirty文件尺寸/哈希和实际依赖路径。核对器的ZIP反斜杠查询、Node类型提升路径及状态句号解析失败和修正均记录为本地只读核对器问题，不作产品失败或目标机证据；原始产品首失败保持不变。原`snapshot.json`及全部历史证据没有覆盖。

本节追加后的文档/差异检查与保护复核将保存在同根`continuation-readback-docs-check-r1.*`、`continuation-readback-diff-check-r1.*`及`continuation-readback-preservation-r1.json`；实际检查结果以这些记录为准。

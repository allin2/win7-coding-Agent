> 后续状态：负责人已授权确认同类问题后修复，发布/系统及可见审批缺口现已本地闭合，见[同类高影响修复报告](a9_31_shell_high_impact_policy_repair_2026-10-04.md)。下文303项/8漏2误是上一轮历史时点；原始证据和首失败保留。

# A9-31 Shell永久删除本地修复与同类问题核查

删除Policy修复和已补批的一行Core夹具修正完成，**当前Core必需九组303项全部PASS**。产品源码/编译未变，Shell九组117项和七模块编译/静态按准确证据继承；原Core302通过/1旧夹具失败保留为首失败。相邻纯Policy求值另确认发布/系统操作8个漏确认反例和2个纯文本误确认反例，尚未修复。仅本地完成，不签DEVELOPER_VERIFIED或目标机PASS。

## 1. 基线、授权与证据入口

- 工作树 `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支 `codex/a9-31-background-tools`；HEAD `898ee9459a9b987840e94ddef336556ea58dd389`未变。本轮产品工作区未提交diff，不存在新源码提交。
- 负责人“审批同意并检查有无类似问题”批准[精确材料](../../plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)原§1–3。原批准正文SHA256 `ea809dc385650bdd87e861956291e335ec3993d8cdadf6559b77baac890ac054`冻结保留；三路径在任务C14追加，ADR-0170新增Accepted，其他Accepted正文不改。
- 执行记录根 `.acceptance/a9-31-developer/shell-delete-policy-repair-r1/`；owner-approval.json、before.json、source-working-identity.json、source-working-diff.patch与impact-and-verification-r1.json绑定本轮。沿用STATUS和任务台账，原r2统一Windows矩阵product-r2/win10-evidence-matrix-r4.json不改、不重绑。
- 本地Node `/Users/qlyf/.nvm/versions/node/v20.17.0/bin/node`，v20.17.0，Darwin arm64，QLYFdeMacBook-Air.local，uid501。已有离线依赖，无安装或新系统API/依赖。

## 2. 修复与最短链路

policy.ts在自主Git提前返回前检查明显Shell永久删除执行，覆盖Remove-Item/ri/rm/rmdir/rd/del/erase/unlink、路径/大小写/转义、控制流、分号/管道、cmd/powershell包裹和编码payload。复用既有tokenize，保留原命令字节，不改Tool、IPC、Runner权限、状态schema或一次性审批链。显式CMD载荷使用CMD的注释/单引号/分号/转义语义；PowerShell双引号子表达式仍按执行分析，纯输出/单引号和注释保持数据。深度4及256KiB上限，无法分析的明显删除执行保守ASK。

真实r2字符串来自product-r2/ordinary-policy-failure-sqlite-diagnosis-r3.json，固定首红：原Policy ALLOW，预期ASK。policy-first-red.*保留原失败。修复后同字符串ASK；`git status; Remove-Item x -Force`也ASK，自主Git不能遮住删除。原r2包/数据库原件仍旧FAIL，未用新源码改判。

Core最短链路为模型start_process→原ToolRegistry严格校验→映射shell→Policy ASK→完整command/cwd绑定与approval_required→等待onApprovalPending完成→NEEDS_APPROVAL。持久化回调未完成时零Runner/managed派发；拒绝、错误目标/参数摘要、挂起参数故障注入、旧审批和Read Only均零受控派发。这是实际Core队列与测试端口，不能写成新包SQLite或真实原生helper的删除零派发证明；目标机未复验。

尽力识别不解析任意Shell程序，不是安全沙箱。Policy边界未携带实际选中的Shell身份，顶层未包裹文本仍按现有通用约定识别；未知脚本文件、运行时重新定义别名、计算/隐藏命令或任意语言程序不在完整识别保证内。显式包裹及本轮反例不以该限制豁免。

## 3. 直接、继承与未执行检查

| 检查 | 结果与范围 | 原始记录 |
|---|---|---|
| 真实首反例 | EXPECTED_RED：1失败，原ALLOW | policy-first-red.json/stdout/stderr |
| Policy | PASS 113项，真实命令/执行家族/纯文本 | core-final.jest.json对应suite |
| Core后台 | PASS 10项，确认回调、拒绝/错绑定零端口派发 | 同上 |
| 原Core首轮 | HISTORICAL_FIRST_FAIL 302 PASS / 1 FAIL，九组；旧rm自主执行夹具冲突，不改判 | 原core-final.json/jest.json/stdout/stderr |
| 当前Core合同八组加Policy | **PASS 303项，九组**；负责人补批后只改一行夹具，原断言保持 | fixture-supplement-r1/core-final.json/jest.json/stdout/stderr |
| Shell合同九组 | PASS 117项，本地真实Runtime/SQLite/IPC模块和POSIX普通夹具；非Windows桌面/原生 | shell-final.json/jest.json/stdout/stderr |
| verify:quick | PASS七模块lint/build，完成后才运行实际消费者 | verify-quick-r2.json/stdout/stderr |
| Runner未变部分 | INHERITED_EVIDENCE，仅原列出的Runner模块检查；六组件与原报告hash精确核验 | inheritance-check.json，原runner-review-fixes-r2-final.log |
| State未变部分 | INHERITED_EVIDENCE，仅原State82模块检查；本次Store、测试与依赖未变 | 原windows-workspace-repair-r1矩阵/state-final记录 |
| native/helper/锁 | 只继承原批准输入字节，不替代新高影响确认或目标机验收 | 原r2矩阵/锁；原P1/raw-pipe/UNKNOWN保留 |
| 新包、Windows/Win7、独立收口 | NOT_PERFORMED且本批准未授权 | 原r2状态保持 |

首轮矩阵测试源码引号错误使policy-r1零测试编译失败，原结果保留；修正引号后局部policy-core-r2/r3/r4分别107/113/119通过。补入最后四个CMD/PS转义对照并重编后，Core合同首轮Policy113/后台10全部通过。Jest自然退出，无forceExit；没有删除、发布、注册表、服务或权限命令实际执行。

## 4. 旧夹具与可审阅的第四路径补丁

src/core/tests/a9-verification-evidence.test.ts:115的R1-03用edit→npm test→**rm file.txt**测试新的Shell变更使验证信用失效。删除现在正确需要确认，Turn挂起，所以旧测试期待的verification=unverified不存在。这是旧夹具对高影响操作自主执行的假设冲突，不是应把rm重新允许的产品回归。没有减少断言或排除必跑suite。

[材料§5](../../plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)准备一行补丁：rm file.txt→**copy file.txt copied.txt**，保留原断言与验证目的。准确文件为本轮记录根proposed-verification-fixture-r2.patch；git apply --check通过，当前编译Policy ALLOW且verification classifier=mutating，仅纯求值。批准前**未应用、未运行修改后的测试**；负责人随后明确回复“批准”，现已仅应用该一行并完成Core九组303项PASS，准确原材料和补批记录在fixture-supplement-r1/。早先echo重定向草案经分类为neutral，不适用，首草案/诊断保留，改为普通copy。

原批准仅三路径；依AGENTS.md C14“目标文件位于任务书允许路径内，才可实现”，先形成具体第四路径材料再取得补批。当前已登记第四路径、应用一行fixture并重跑Core九组；生产源码/编译未变，按材料§5继承Shell117和七模块静态证据。此补批不批准下列发布/系统实现。

## 5. 相邻同类问题：纯求值确认，范围外未实现

adjacent-policy-before.json与adjacent-policy-after.json固定16个输入。两个删除反例已修复，剩余**8个应该ASK却ALLOW、2个纯文本应该ALLOW却ASK**。全部只做当前TypeScript Policy.evaluate，不执行命令、不访问例示URL或系统目标，不是目标机动态绕过证据。

| 优先级/原因 | 具体反例（完整值见JSON） | 当前→合同预期 |
|---|---|---|
| P1：policy.ts:274–282自主Git提前返回，跳过非Git外部写/系统门 | git status; npm publish / git status & reg.exe add HKCU\Software\A9PolicyProbe / git status; sc.exe delete A9PolicyProbe / git status; icacls.exe C:\work /grant user:F | 四项ALLOW→ASK |
| P1：policy.ts:287仅连续名+publish正则，遗漏Windows入口/前置参数/有效转义 | npm.cmd publish / npm --registry https://example.invalid publish / powershell -Command 'np`m publish' | 三项ALLOW→ASK |
| P1：policy.ts:293系统入口正则不识别CMD executable-name转义 | r^eg.exe add HKCU\Software\A9PolicyProbe /v X /d 1 | ALLOW→ASK |
| P2：policy.ts:287/293全文匹配，不分执行与输出数据 | Write-Output "npm publish" / Write-Output "reg.exe delete HKCU\Software\A9PolicyProbe" | 两项ASK→ALLOW |

后续具体合同应统一组合各高影响裁决，不因自主Git短路；发布/系统分类复用执行词/包裹边界，保留纯数据对照。须声明操作族、白名单、完整绑定与Core零派发回归，按影响复验。本轮只检查，未扩成该实现。PRD A9-M03要求保持，不能签完整后台或Alpha2。

## 6. 保全与后续边界

补批前三路径diff SHA256 `19b003b79d8435bb5a2d381c35c12d590349ca3b288a7dd8178df5f496dec03b`；逐文件及Core实际编译哈希在source-working-identity.json，与检查消费者输入相符。444个dist文件保存在compiled-current/，其中24个tracked Runner产物按本轮原字节恢复。未用旧dist认定源码失败，也未在恢复后重跑需要新Runner构建的消费者。

本轮核对原dirty/main修改、native/锁、历史三ZIP及1273个r2输入/返回/包文件，结果记录final-preservation-r1.json。r2 ZIP d7323ac4…15122c47、master46441acf…3b821、源898ee945、r2/R10停止和原FAIL/UNKNOWN保持。未提交、推送、合并、打包、远端写入/启动、系统/账户/权限变更或委派。A9-31仍IMPLEMENTATION_IN_PROGRESS。

第四fixture路径已补批并闭合本地必需Core检查。后续范围外发布/系统高影响问题仍需具体实现授权。准确新源码提交、开发包和全新Win10合同各自需要授权；不得重启原r2或恢复R10。

## 7. 第四路径补批后的最终本地结果

负责人针对材料§5和准确一行补丁回复“批准”；补批只增加src/core/tests/a9-verification-evidence.test.ts并将rm file.txt换为copy file.txt copied.txt。补丁应用后文件逐字节等于批准前文件的一处替换，所有断言保留。Core九组303项自然退出通过；当前四路径diff SHA256 `76ccb2d94eb06414241500b5b2058f25a81a96b8a6ab8129baf76239097620ac`，源898ee945仍未提交。产品policy.ts、实际Core编译Policy及原三路径与上一轮检查输入一致。

本轮唯一补充记录根为fixture-supplement-r1/，包含批准全文/owner-approval、fixture-before、patch-application、core-final原输出/JSON、source-working-identity与impact-and-verification-r2.json。此记录明确当前本地PASS与原首FAIL，原r1记录/索引保持不可变。Shell117和七模块静态只继承原准确检查，不在tracked Runner dist恢复后重跑消费者，也不把继承写成新的Windows/native通过。文档/diff及保全结果在该根最终记录。未新增包、提交、远端或Win7；8漏确认/2误确认仍只读发现，A9-31保持IMPLEMENTATION_IN_PROGRESS。

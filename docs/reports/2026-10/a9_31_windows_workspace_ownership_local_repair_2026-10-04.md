# A9-31：Windows 工作区归属及同路径共性问题的本地修复

日期：2026-10-04。结论：`LOCAL_REPAIR_VERIFIED_SOURCE_COMMIT_AND_WINDOWS_REVALIDATION_PENDING`。
本报告只登记本地修复；A9-31 仍 `IMPLEMENTATION_IN_PROGRESS`，新包 Win10、独立收口及 Win7 均 `NOT_PERFORMED`。

## 1. 批准、源码和准确改动

依据 [三路径合同](../../plans/A9_31_WINDOWS_WORKSPACE_OWNERSHIP_REPAIR_APPROVAL.md) §2–3，负责人批准本地修复，并明确要求检查、修复共性问题。
原材料 SHA-256 `24bab6cfacb1a40acc476522b9795dc51076a52988d1f93301314a09369a0712`；批准记录 `.acceptance/a9-31-developer/windows-workspace-repair-r1/owner-approval.json` SHA-256 `8e77eae14ff0c0dfe570c78a3b4f4eb8724f305f7f0d9ae24ebbb1d3d8f4e1a4`。
HEAD `35a19250ed6589f6a7ba35b940a784325970c111`，分支 `codex/a9-31-background-tools`；源码尚未提交。

| 准确文件 | 修复/检查结果 | 当前 SHA-256 |
|---|---|---|
| src/state/src/a9-persistence.ts | managed owner 的 origin/fact 用等价路径判断；Windows 历史 managed facts 按等价路径键取回；共享比较不将 POSIX 单根路径误判为 Windows | fc7a3b9a78c5ed2cdfe595d8d32f172f73ec38d536939d21d9257f4495160b4a |
| src/state/tests/a9-managed-process-ownership.test.ts | Windows 大小写/斜杠/dot/中文/空格/%/#/UNC/非ASCII大小写正例；旧事实查回及错属/归档零写入；POSIX 重命名/恢复的大小写拒绝 | 507a0363fc442de64fa4f313eecf11c7ac0a92754b90a496fe80366ee0be46dd |
| src/shell/tests/product/a9-background-tools.test.ts | 真实 Runtime/State/in-memory SQLite/IPC 用真实 canonicalizer；native start 前 starting 意图已落盘；原Turn晚输出归属、Stop/release及起始审计失败零启动 | e1820080f08b3a6200ea35ee9d945722976ecccde7f192ed7b47ed8667899e3f |

源码三路径 binary diff 为 `source-three-path.diff`，SHA-256 `1d0952af58d0c9cbd3acd90bb6c66c64281d1e796367feacade38e3c51864436`；完整三个源文件快照在 `source-snapshot/`。
未修改 Runtime/Runner/Core/native 源码、输入锁或捕获脚本；不更改数据库 schema，不迁移或重写历史事实。

## 2. 共性检查及修复边界

**已证实并修复的三处：**

1. 原 R10 根因：canonical session/owner 与 display fact 用字符串全等比较，同一个 Windows 工作区被误拒绝。现在只替换 origin/fact 目录比较，canonical owner、session/task/turn关联、active状态、request不可变及release guards保留。
2. 同文件的事实查询也仅按原始路径精确匹配。更换大小写/分隔符后，旧清理/恢复事实会返回空。Windows 分支先枚举持久化的不同路径键，用同一比较选出等价键，再仅装载这些键的事实；原始workspace_path不改写，不用SQLite ASCII-only NOCASE代替Unicode路径判断。POSIX查询保留原精确键。
3. `path.win32.isAbsolute('/w')` 本身为true，旧共享比较将普通POSIX根当Windows，允许 `/w` 对话被 `/W` 重命名/恢复。现在结合真实平台和path.win32解析出的drive/UNC根识别；POSIX单根保持大小写敏感，Windows测试路径兼容性保留。

只读搜索覆盖 State、Shell、Core、Runner，扩展复查 Workspace/Git Adapter 的路径API与比较入口。当前链路其余全等有不同合同，不机械替换：

- A9模式、会话列表/切换、workspace lock、checkpoint查询由 Runtime 传 canonicalWorkspace；Core设置读取也先canonicalize；这些是canonical键比较，没有本次display/canonical混用证据。
- Runner ownedEntry 的 owner.workspace 是产品生成的canonical身份，必须精确匹配；模型不能提供显示路径作归属，不放宽该门。
- Main/Renderer 的A8工作区会话选择由desktop-host的path.resolve/realpathSync生成统一选择路径；活动指针字符串全等用于减少重复写入，不决定授权。未发现当前入口需要本批修改的已证实同类缺陷。
- checkpoint 的 isAbsolute 检查用于拒绝绝对路径，不用于选择大小写规则，因此不属于本次POSIX误分类。

此检查仅说明已检查入口和修复范围，不宣称全仓库不存在任何路径问题。没有需要扩展白名单的已证实本批缺陷。

## 3. 原代码反例、首失败和最终检查

锁定本地 Node20.17.0，实际 macOS/arm64/本地用户；Windows平台用例明确为本地模拟，进程平台descriptor在finally恢复，不是Windows桌面证据。

- 两份测试先加到原State产品字节上：State 16项中6失败/10通过，覆盖四种Windows写入误拒绝、历史managed查回为空、POSIX错属重命名被接受；Shell Windows启动正例失败。`state-red-r2.*`/`shell-red-r2.*`保留。
- 首次Jest.replaceProperty不能恢复只读process.platform，两个suite未运行；保留首失败，改为保存/恢复完整descriptor，不计为产品反例。
- 修复后State首轮82通过；随后补齐POSIX归档恢复拒绝/正确路径恢复对照，最终规定三组 **82/82 PASS**。
- Shell首轮新增Stop夹具只给kind=cancelled/cleanupConfirmed，Runner按v3合同仍记failed/不承认stopped。改为完整v3 execution_result、cancelled状态和已批准token/Job/清理字段；这是控制夹具，不是Windows清理证据，没有放宽Runner。
- 同次Shell使用未重编的历史sibling Runner dist，两个旧managed lifecycle用例失败，且留下已创建的隔离Node子进程；该次Jest未正常结束。记录准确pid/父/启动时间和原输出后中断Jest及其明确子进程，没有使用forceExit代签通过；未触及用户/远端进程。首轮114通过/3失败、退出-2保留，不当成有效整体PASS。
- 完成规定 `verify:quick` 后重跑原完整Shell九组，**117/117 PASS**，实际正常退出0，无forceExit。重编后两个旧场景通过；原Runner源未改，原dist确有缺少managedOwner/onOutput参数传递的历史字节。以后产品模块检查需先完成所有sibling build，不在旧dist上推断源码失败。

| 必需命令范围 | 最终结果 | 原始记录 |
|---|---|---|
| State任务书三组 | 3 suites / 82 tests PASS | state-final.json / stdout.log / stderr.log |
| Shell任务书九组 | 9 suites / 117 tests PASS | shell-final.json / stdout.log / stderr.log |
| npm run verify:quick | 七个模块全部build/lint/设计静态门PASS | verify-quick.json / stdout.log / stderr.log |
| npm run docs:check | PASS；268个文档、48份任务书，exit 0 | final-docs-check.json / stdout.log / stderr.log |
| git diff --check | PASS；exit 0，无差异诊断 | final-diff-check.json / stdout.log / stderr.log |

`final-integrity-check.json`另核对HEAD未变、实现diff仅批准三路径、源码/快照/diff/矩阵hash一致，以及三源码与两份本批文档均为UTF-8无BOM/LF。新增源码提交审批材料后的文档/差异复查另见`handoff-docs-check.*`/`handoff-diff-check.*`，不重复产品检查。

Core/Runner先前定向测试只按原清单源文件哈希及原报告哈希相同登记INHERITED_EVIDENCE；当前涉及的Runtime/SQLite/IPC/Stop链路由本次Shell直接覆盖，不把继承当成新包WindowsPASS。

## 4. 生成文件、证据和剩余交付

verify:quick按必需合同生成了24个tracked历史Runner dist变更；初始这些文件均与HEAD一致，且本次Runner源无变化。
最终Shell测试使用的是重新编译的准确dist，编译副本及生成SHA在 `verify-generated-runner-dist/` / `verify-generated-runner-dist.json` 保全。测试后只将这24个本次生成文件回填原HEAD字节，未删除任何文件，未保留未批准的Runner实现差异；源码diff仍只有上述三路径。
因此未来直接在checkout中运行产品测试前仍需重新执行verify:quick/build；历史dist不成为新交付包输入。装配按生产者的source-bound干净编译合同形成准确新包。

本地证据根：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/windows-workspace-repair-r1/`。
`local-repair-evidence-matrix.json` SHA-256 `c410cccb63db1c682addb8ee34102494e719e0f621c4b5dcfea2b80e3fb2835c` 绑定源码、首失败/最终结果、继承来源、原生锁及未执行项；该忽略目录不会随普通Git提交交付，本报告提供检索入口。
managed锁仍为 `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e`；helper/source/native协议和系统API未变。本修复不要求重新原生双构建。

尚未提交/推送/合并/新打包/远端写入/委派；主工作区和历史失败保留。新源提交、准确新开发包/新控制器冻结、Windows后台/退出/恢复直接复验、独立收口均未执行。原[R10](a9_31_r10_partial_pass_and_windows_ownership_failure_2026-10-04.md)FAIL及旧Shell/编码PASS保留原source/产物绑定，R10不恢复或重绑。Win7依后续整批新候选，仍NOT_PERFORMED。

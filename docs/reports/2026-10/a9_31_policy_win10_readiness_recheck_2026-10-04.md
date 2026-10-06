# A9-31：Policy再核查与Win10新包准入

再次检查确认并修复变量命令的同类漏确认及明确发布执行歧义。**当前本地Core九组417/417、Shell九组117/117、七模块编译静态PASS，24项实际编译定向检查零不符。新包Win10实机验证仍NOT_PERFORMED**，不能宣称实机通过或签DEVELOPER_VERIFIED。

## 1. 实际基线与范围

准确工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`，HEAD仍`898ee9459a9b987840e94ddef336556ea58dd389`，index为空。新修复为未提交字节，HEAD只表示父基线。主仓只读，主代理直接执行。

负责人要求“再次进行检查，保证win10实机验证通过”，沿用已批准[同类本地修复§7](../../plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)和任务C14四路径范围，实施前在任务书登记。前一轮a9-agent-loop完整审批修复和第四夹具copy一行保持；本轮只追加policy及既有policy/background测试。无新模块、依赖、API、权限、Runner/State/native/IPC或持久化格式变化；ADR-0171既有尽力识别/歧义保守确认决定适用，Accepted正文未改。

原报告[397/117本地修复](a9_31_shell_high_impact_policy_repair_2026-10-04.md)及其886证据文件是上一版字节的历史直接证据；本报告是当前入口。新证据根`.acceptance/a9-31-developer/win10-policy-readiness-r1/`。原r2整体确认FAIL、停止根及R10/历史UNKNOWN保留，不恢复。

## 2. 新确认的问题与修复

再次纯Policy检查确认PowerShell变量调用npm/sc/reg和CMD百分号变量npm调用漏确认；新增前置registry及.cmd、CMD sc变量同类反例。`npm -- --registry publish`属于无法确认安全的明确发布执行歧义，保守ASK，不声称已实际执行npm。

修复只跟踪同一命令内的静态字面量命令名，命令变量按Shell大小写规则查找、Windows后缀/路径仍沿原入口归一；不求值任意Shell表达式。普通npm test、变量作为输出数据、重赋值为echo的执行保持自主。完整原字符串仍绑定审批，不以替换后的命令重写原目标。

第一版复验412/117通过后，追加10项共同边界核查发现CMD IF变量体、双引号$()中的变量执行、${变量}写法3个漏报。修复共同的上下文传递和执行分段：子表达式在此前静态赋值上下文内检查，子赋值不泄漏；条件体保留已知命令名；变量括号不作为控制组拆散。单引号文字和echo条件体继续作为数据。不是任意Shell程序解析器或安全沙箱。

## 3. 当前直接检查与失败保留

| 检查 | 本证据根文件 | 当前结论 |
|---|---|---|
| 最初14项纯编译核查 | expanded-static-before.json | 4个变量漏报及1个明确发布歧义；原输出/正常操作对照保留 |
| 首红测试 | policy-first-red.jest.json | 232项，222 PASS/10 FAIL，原始反例有效，不运行高影响命令 |
| 第一版修复 | core-final.jest.json、shell-final.jest.json | 412/117 PASS，为中间版本证据 |
| 条件体共同边界 | variable-control-boundary-before.json | 10项中的3漏报；保留首结果 |
| 当前七模块 | verify-quick-r2.json/stdout/stderr | Node20.17.0离线lint/build PASS，先编译后消费者 |
| 当前Core | core-final-r2.jest.json | 九组417/417 PASS，自然退出；Policy217、后台20、原其他180 |
| 当前Shell | shell-final-r2.jest.json | 九组117/117 PASS，自然退出，读取当前构建Core |
| 当前编译反例/数据对照 | compiled-boundary-after-r2.json | 24项零不符，纯求值无真实Shell执行 |
| 文档与差异 | docs-final-r2.json、diff-final-r2.json | PASS，最终保护诊断补录后完成 |
| 新包/真实Windows审批UI/SQLite/八phase | 尚无当前产物 | NOT_PERFORMED |
| 独立收口/负责人裁决/Win7 | 未执行 | NOT_PERFORMED |

后台测试经真实A9AgentLoop/ToolRegistry/Policy、受控Runner/managed端口验证shell和start_process的变量发布/系统调用：pending先持久化、等待审批、错digest/变化参数失效、拒绝后零端口派发。端口测试不证明实机SQLite或真实窗口。

## 4. 准确源码、构建与保护

当前五文件准确快照及SHA见`source-package-win10-proposed-inputs-r2.json`、`source-commit-snapshot-r2/`和准确补丁`source-commit-proposed-r2.patch`，补丁SHA256 `adbfe333c07709a8a2190c24b664c6d3b7c3d8dc7499eacf40361fa1fba48fd2`。先前proposed-inputs/patch和production-runtime准备输出均为较早未执行提案/旧修复字节，不可用于当前包身份。

| 输入 | 当前SHA256 |
|---|---|
| policy.ts | a0851f60af52e683da864c416af9f9aa6a7e7f3a9dd785f42294c8e72a4ce463 |
| a9-agent-loop.ts | f4b5db823cdc707d7d3345594d80a5d17445419d9cc37006f0ef99e7d7804ce9 |
| policy.test.ts | 5411e4b14315decc466ccc4cbdbf032ba891ff13e13a3f19fdefa94978802c19 |
| a9-background-tools.test.ts | bf066c5a1a46b0c85943cb03f38c0c3402118827f2b3492448475ce284c31751 |
| a9-verification-evidence.test.ts | f01ce71a59168d22cbdef601378bf8f0d99e4c5ffef2f2cca468ee14d59881b5 |
| 当前实际编译policy.js | 7dfb78dabe813ff3ee068427530f58b5f81d9b6213c0bb2cf69690ea2b2376a6 |
| 当前实际编译a9-agent-loop.js | 5c08f57077891212c100522cb3bd4c7dc34ed89907a1f2d4235c45599e7bc324 |

444个当前消费者所测编译文件保存在compiled-current/及manifest；消费者结束后仅恢复构建造成的24个tracked Runner dist到本轮进入前字节，详见generated-dist-preservation.json。未reset/checkout/删除；再跑依赖消费者须先重建。未变化构建组件与上一版444文件逐hash比较，不能将历史Windows整组结果继承为当前包PASS。

before-recheck.json先保全1813 tracked、49 dirty、886上一版和590原删除修复证据。最终保护核对见final-preservation-r2.json：42个其余dirty、886/590旧修复证据、r2的1273保护文件、主仓21可读dirty及64个tracked dist均零不符，HEAD/index保持。第一份final-preservation.json的FAIL是本地检查脚本把证据相对路径按仓库根解析，修正为两个原证据根后逐项hash一致；首记录保留，不是文件丢失或产品失败。主仓两份早已缺失的历史Electron ZIP保持原D状态，仍为既有DIFF，不恢复、不把其签为本轮保全PASS。444编译产物相比上一版仅Policy JS/两个map共3项变化，其余441项逐hash相同。

## 5. Win10实际只读预检与未闭环部分

Strict SSH真实确认目标WIN-2JQ66JE4HTQ/Windows10 Pro19045/PS5.1；Administrator只作准备读取。普通A9 Builder SID1005/profile/Session3 Active为会话预检，尚无新dispatcher/Electron的实际Medium/非提升/InJob=false证据。

C盘首次1865310208bytes低于2GiB准备门；随后外部环境变化，只读复查先5030555648、最终2026-10-04T09:00:09Z为6543396864bytes（约6.09GiB）。代理没有清理或迁移文件；执行前仍须重新实查。新r3根不存在。kernel32/csc/三参考哈希与锁定旧合同一致，需执行前再查。

两次只读准备用的stdin内存探针分别50秒/40秒传输超时，保存输入/首超时/第二执行记录与原stderr；Bitvise还提示评估期结束、SSH仅管理员可用。未取得目标运行结果，不归类为产品PASS或产品断言FAIL。停止该stdin路径重试，不修改Bitvise、账户或许可。最后只读查询旧r2指定Electron路径零进程；此观察不替代未知进程树的持有句柄exit证据。

早期production-runtime首次与旧包JS的34差异为sourceMappingURL；按实际生产者sourceMap=false编译后对应依赖一致，诊断保留。该准备输出早于本轮变量修复，不能用于新包。新产品必须从已提交source的干净checkout由正式现有生产者编译。

## 6. 最短后续链路与具体授权

[C1/C2/C3具体材料](../../plans/A9_31_POLICY_R3_SOURCE_PACKAGE_WIN10_APPROVAL.md)已绑定当前五路径/补丁、锁定三个只读档案和生产者、新本地根、新普通Win10根、四外部测试源、固定取证组件/预算及全部八phase。批准后依次：精确源码提交→干净checkout/new r3包与自身闭包/身份→新根准备/能力准入→一次普通入口→Boot→后台最短真实链路→受影响回归与完整八phase→固定停止/取证回收。

源提交/新包/新远端写入仍待该材料具体批准；原本地修复授权不包含这些动作。任务§6明确要求后续源码提交、远端新目录/写入等另行具体批准，生产者禁止未提交源码开发包。范围内普通夹具局部修复/有界重试在C3材料一并列明；若安全/身份/完整性/审计/未知生命周期失败，按合同HALTED并停止相关下游，不能为了“保证通过”改判。

任务保持A9_31_IMPLEMENTATION_IN_PROGRESS。尚无新Win10产品通过证据；负责人审批、独立和Win7边界保持。

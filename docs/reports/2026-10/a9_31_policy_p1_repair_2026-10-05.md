# A9-31 Shell Policy P1 本地修复报告（2026-10-05）

依据[P1修复材料](../../plans/A9_31_POLICY_P1_REPAIR_APPROVAL.md)（SHA256 e0dc01e2…，负责人批准）与ADR-0181。仅本地修复与Mac开发机验证；
源码**未提交**，未打包，无远端动作；不冒充Windows、Win10或Win7证据。未在Win7实机验证。

## 1. 改动（相对HEAD `ebda911`，未提交）

| 文件 | SHA256（修复后） | 内容 |
|---|---|---|
| `src/core/src/policy.ts` | 249d6b3491e58192e84fe274cd395f87f9a8a68afd2b796b852c02af8db25a53 | F1、F2 |
| `src/core/tests/policy.test.ts` | bd243a06ee1df8d28be850259216f011d2e2be2133855078d285d6337917ba59 | 新增15个用例 |
| `src/core/tests/a9-background-tools.test.ts` | cccf967084a4410abb356e59efe2c85187e916aacfdb5102fea916c4d5053fd5 | `shell`/`start_process`入口新增3个审批用例 |

- **F1**：段切分新增`backslashEscapes`参数，默认（PowerShell/cmd读法）不再把`\`当引号转义；原求值体更名为`shellImpactReading`，
  新`shellImpact`在命令含`\"`时按两种读法各求值一次，任一得出高影响即返回。旧行为即“转义”读法，因此新结果是旧结果的超集，不会更宽松。
- **F2**：段切分为每段标记`conditional`（处于`()`/`{}`块内或位于`&&`/`||`之后）；变量表由单值改为候选值列表，条件段内的字面赋值只追加候选；
  命令名对每个候选逐一求值（原段内逻辑封装为`evaluateName`，`continue`改为`return undefined`，语义不变），任一高影响即返回。
  同层重新赋值仍为确定值（`$tool='npm'; $tool='echo'; & $tool publish`保持allow）。~~非字面赋值处理不变~~——**更正（r2）**：此说法不成立，r1把条件块内的非字面赋值丢弃，造成回归，见§6。
- 类型检查`tsc --noEmit`通过。审批摘要、digest、Read Only、其他工具未改。

## 2. 先红后绿（证据`.acceptance/a9-31-developer/policy-p1-repair-r1/`）

- **红**（`red.*`，产品源码未改）：两文件255项中新增11项失败、244项通过——即材料§1的A–D、cmd写法`echo "C:\" & npm publish`、
  `foreach`/`while`变体、`bash -c`预测用例，以及两入口的3个审批用例。
- **绿1**（`green-1.*`）：254通过，仅`bash -c "echo \"npm publish\""`未变为ask。
- **与材料的偏差（如实登记）**：材料§3预测该用例F1后会成为ask（误确认）。实际不变且这是正确的：宿主载荷由`tokenizeCommand`提取，与段切分读法无关；
  tokenizer提取的宿主载荷为`echo "npm publish"`，属打印数据。故把它移入“保持allow”组并加注释。**更正（r2）**：原写的“按PowerShell实际解析npm只是bash位置参数”未经原生参数解析验证，删去该理由。
- **绿2**（`green-2.*`）：255/255通过；既有全部用例结论不变。

## 3. 全量验证（`run-section4.py`，`g2-summary.json` SHA256 62a00581a72a7c709caa58f75bcc20dc1b629b26464aff086d5d1bb2a92f77d2）

先`verify:quick`构建，再按§5运行且Core组加入`policy.test.ts`：Core 435/435、Runner 166/166、State 82/82、Shell 117/117、release
`node --test` 200通过/2 Windows专项SKIP/0失败、`verify:quick`、`docs:check`、`diff --check`均退出码0。运行前核对源码改动恰为上述3文件；
构建改写的24个受跟踪Runner dist按原字节恢复，受跟踪文件前后一致，无新增未跟踪文件，无遗留进程；R5–R8冻结5448文件基线0差异。

## 4. 任务书§5清单修正（D2，P2-1）

`npm run verify:quick`移至清单首行（末尾保留一次），Core组加入`tests/policy.test.ts`，并在说明中注明先构建的原因。

## 5. 未覆盖与后续

- ~~未覆盖：cmd单行`if … set`（无括号）形式的条件赋值仍不记录为赋值；非字面赋值仍按未知处理。~~ **更正（r2）**：该限制登记被Codex否定，已由§6的G2覆盖；当前仍未覆盖项见§6末条。
- 后续：Codex聚焦复核 → 无P0/P1后起草源码提交材料 → 新包与Win10重验材料（除Boot外经工具派发的phase预计重跑）。

## 6. 修订r2（Codex聚焦复核后，ADR-0182）

Codex复核r1修复：A–D与cmd引号用例已修复，但新P1三项（我方以HEAD与r1分别编译纯策略求值复现一致）：①条件块内非字面赋值被丢弃，
`$tool='echo'; if ($true) {$tool=$env:ComSpec}; & $tool /c 'npm publish'`由HEAD的ask变allow（**r1引入的回归**）；②cmd无括号
`if … set`赋值不传播；③双引号`$()`与点调用函数/脚本块的赋值未计入当前作用域。

补修（`src/core/src/policy.ts` SHA256 b25ee29356c9c43237d8886aeca2df72304eb63c3b116163b89be5be949b9c51）：G1 条件段非字面赋值追加“未知”候选，解析时还原为原变量记号，
走修复前的保守检查；G2 `if`/`do`/`else`载荷求值后其赋值作为候选并入当前变量表；G3 双引号`$()`中的赋值求值后作为候选并入；G4 点调用段把本命令
出现过的块内赋值重新并入。均只追加候选。测试：`policy.test.ts`（53dc6860…）新增6个ask、3个allow对照；`a9-background-tools.test.ts`
（7b12e1d6…）新增2个入口用例。

- 红（`policy-p1-repair-r2/red.*`，在r1修复版上）：8失败/258通过（新增8个ask用例全部失败，3个allow对照已通过）。
- 绿（`green-1.*`）：266/266；既有用例结论不变。
- 差分（`differential-head-vs-r2.json`，SHA256 e601b7a1…）：以`policy.test.ts`全部字符串字面量及本轮输入共304条，对HEAD与r2分别纯策略求值：
  **HEAD为ask而r2非ask的0条**；r2新增ask的11条恰为本轮与上轮目标输入。该差分只覆盖语料，不证明全空间超集。
- 全量（`run-section4.py`，`g2-summary.json` SHA256 3fe0fb3f…）：先构建，Core 446/446、Runner 166、State 82、Shell 117、release 200通过/2 SKIP、
  verify:quick/docs:check/diff --check全部退出码0；dist恢复、受跟踪文件一致、无新增未跟踪文件、5448基线0差异。
- 仍未覆盖：非字面赋值不求值（只保留“未知”）；点调用只并入本命令内可见的块赋值，外部脚本文件内容不可见。

## 7. 修订r3（Codex第三轮复核后，ADR-0183，取代§1的F2与§6的G1–G4实现）

Codex第三轮：历史11个反例均已修复，但r2又引入HEAD ASK→ALLOW回归（同层非字面赋值的“未知”被后续条件候选覆盖），嵌套`if`、
`for … do if`、`call set`、多层`$()`、块内`$()`与子表达式中的点调用仍漏报；其432组合中20条HEAD ASK→r2 ALLOW。判断逐项候选追踪不收敛。

**r3实现**：`src/core/src/policy.ts`回到HEAD后只加两处（与HEAD差异25行，SHA256 af589fc1a8c70a946a8a27f2ef278d0496473f9583b7b1b2640cb4c735c2ba19）：
F1——原转义读法逐字保留，命令含`\"`时另加不转义读法；R——以变量作为命令名的段，若该层文本含控制结构且出现高影响词，即确认为
“无法完整分析的潜在高影响Shell”。r1/r2的候选值实现整体撤除。**由构造保证**：HEAD为ASK的输入r3必为ASK。

测试（`policy.test.ts` 82333258…，`a9-background-tools.test.ts` 18f8ace5…）：新增Codex第三轮8个反例与两条接受的误确认
（`$tool='npm'; if ($false) { $tool='echo' }; & $tool test`、未点调用的`function f {$tool='npm'}; $tool='echo'; & $tool publish`，由ALLOW改为ASK）；
新增结构性测试（432组合中HEAD确认的242条，r3必须全部确认）；两入口新增2个用例；bash用例注释删去未经验证的说法。

- 红（`policy-p1-repair-r3/red.*`，在r2上）：13失败/264通过。绿（`green-1.*`）：277/277。
- 差分（`differential-head-vs-r3.json`，SHA256 7c26280c…）：语料323、432组合、三轮反例20，共775条，**HEAD ASK→r3非ASK为0**；20个反例全部ASK。
- 全量（`g2-summary.json` SHA256 59884cf4…）：先构建，Core 457/457、Runner 166、State 82、Shell 117、release 200通过/2 SKIP、verify:quick/docs:check/diff --check
  全部退出码0；dist恢复、受跟踪文件一致、无新增未跟踪文件、5448基线0差异。
- 已知限制：变量值不求解；含控制结构但无高影响词的变量调用不确认（与HEAD相同）；`call :label`等需批处理上下文的写法未实测。

## 8. 修订r4（Codex第四轮复核后，ADR-0184，含收敛标准）

Codex第四轮确认r3对HEAD不放宽（撤除F1/R后与HEAD全文相同；两组5,122/13,878条构造0放宽）、三轮20个反例两入口均needs_approval；另报P1两项
（R漏掉`$script:`/`${…}`/中文/反引号/cmd `@!X!`等调用形式；递归进入`$()`、cmd `if`/`for … do`载荷时外层上下文丢失；二者HEAD同样放行）与P2一项
（`if ($true) { npm test }`、`${tool}='npm'; & ${tool} test`及单引号/注释中的词由HEAD的ALLOW变ASK）。负责人批准r4并采用收敛标准。

**r4实现**（`policy.ts` SHA256 3b94f859dda2bc1d22d43543840fbd22461ebea735999b92fbe296d8aef18f7a，相对HEAD 78行）：变量记号去除cmd `@`与转义后判定，接受任意`$`/`%…%`/`!…!`
（排除`$true`/`$false`/`$null`），原文检查`& ${…}`；PowerShell仅`&`引出或带参数视为调用；控制结构与高影响词随递归向内传递，宿主自身名称不计；
控制结构在去掉`${}`、单引号字符串、注释后的文本上判定。仍只增加确认，原HEAD读法不变。

测试（`policy.test.ts` db748bb1…，`a9-background-tools.test.ts` b143e898…）：新增8个ASK、4个ALLOW、两入口2个用例。

- 红（`policy-p1-repair-r4/red.*`，在r3上）：14失败/277通过。绿（`green-1.*`）：291/291。
- 差分（`differential-head-vs-r4.json`，SHA256 437bbd62…）：语料342、432组合、四轮反例27，共801条，**HEAD ASK→r4非ASK为0**；27个反例全部ASK；语料新增ASK 27条=r3的19条+本轮8个目标输入，无新增误确认。
- 全量（`g2-summary.json` SHA256 839d1c07…）：先构建，Core 471/471、Runner 166、State 82、Shell 117、release 200通过/2 SKIP、verify:quick/docs:check/diff --check全部退出码0；
  dist恢复、受跟踪文件一致、无新增未跟踪文件、5448基线0差异。
- **按收敛标准自查**：①回归：差分与构造性质均为0；②已报告反例：四轮27条全部ASK；③误确认：语料中除已接受的两条外无新增，第四轮P2四条已恢复ALLOW。
- 已知限制（不阻断，转后续任务）：变量值不求解（如`$tool='n'+'pm'`拼接）；无可见高影响词的变量调用不确认；需批处理上下文的`call :label`未实测。

## 9. 修订r5（r4独立复核四项P1；ADR-0185；本地修复交原对话审核）

**结果：四项已报告P1在本地修复，必需验证通过；未提交，等待原对话独立只读复核。** §8的“无新增误确认/自查满足收敛标准”被后续独立复核反例否定；旧源码、原报告和r1–r4证据保留，不将本轮开发验证写成独立审核或Windows PASS。

实际工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`，HEAD `ebda91123e62b225c3fd104c9c9b564a4b61c466`。起始三个文件SHA与交接完全一致（policy `3b94f859…`、policy测试`db748bb1…`、后台测试`b143e898…`），原报告SHA `b2754a294dd6db8399eeaa56a132d76fc97576b2033fe7e2aa108f8265cddeb5`。已有dirty/untracked均保留；本轮实际改动为下列三文件及本报告、任务书末尾记录、DECISIONS新增ADR-0185，Accepted ADR-0183/0184正文未改。

| 产品/测试文件 | r5 SHA256 |
|---|---|
| `src/core/src/policy.ts` | `32dca48541b626db41f1987cc426bddfb20b209cfa178608b4e236bb7c3e95bd` |
| `src/core/tests/policy.test.ts` | `f352284cd88c15d20ac403d32de4ce3f4f3d9244ebc9e98e1488b50a6b22fc26` |
| `src/core/tests/a9-background-tools.test.ts` | `61fa7d58ab2e0d4597813536aa65bd54dd48f63d50e19612fe7f4ada5aef9e9c` |

**修复机制（只改R识别，不恢复候选值追踪）：**

- **P1-1**：R使用严格变量记号和表达式操作符分类；赋值、`in`、比较/逻辑/算术表达式不因“首token是变量且还有token”而判调用。显式`&`/`.`调用仍保守确认，非显式的带参数变量仍按既有保守类别识别。无变量名特判；覆盖原四条普通开发输入、不同变量名与操作符、cargo/npm参数变量，均ALLOW。
- **P1-2**：删除全原文`& ${…}`正则；R改用尊重引号和行/块注释的执行段读法。输出字符串和注释里的调用形状不触发R；原两条输入两入口均恢复自主模拟派发一次。
- **P1-3**：新增仅供R使用的分段参数，保留任意`${…}`为完整记号，识别`.`调用和`&`/`.`的括号操作数；HEAD段切分仍使用默认旧读法。四条已报告输入以及`& ($tool)`/`& ($script:tool)`对照均ASK；另覆盖中文连字符花括号与点调用括号变体。
- **P1-4**：在原`depth > 4`守卫前应用继承上下文的R判定；到深度5时仍能使用外层控制结构及`npm`风险词识别`& $tool publish`。原守卫全文保留，没有提高递归上限或继续深层解码。准确四层输入4303字节，两入口均needs_approval、模拟派发0。

**证据目录：** `.acceptance/a9-31-developer/policy-p1-repair-r5/`。独立新临时目录记录于`scratch-path.txt`；旧r4复核脚本只读后复制执行，旧目录及r1–r4未改。复用脚本中的`policy-r3.js`/`r4`命名是历史别名，r5执行所绑定的实际源码/产物以本节及`current-core-dist.json`为准。

| 直接检查 | 结果与可复核证据 |
|---|---|
| 先保留r4失败 | `initial/`保存六文件起始字节；`r4-reported.stdout`、`r4-reported-probes.json`保存原失败；`red.jest.json`=27失败/300通过（添加最后两个算术/转义操作符对照前） |
| 最终绿/回退红 | 最终两测试文件`current-green.jest.json`=329/329；隔离回退准确r4字节=`rollback-r5-to-r4.jest.json`=29失败/300通过；退回HEAD=54失败/275通过。工作树产品源码从未为回退测试换回旧版 |
| HEAD ASK构造保证 | `construction-proof.json`：撤除F1/R及其参数/元数据/上下文后，与HEAD全文逐字节相同，恢复SHA `a0851f60af52e683da864c416af9f9aa6a7e7f3a9dd785f42294c8e72a4ce463`；R仅增加返回，不改变HEAD赋值记录、解析和原深度守卫 |
| 原两组构造差分 | `r5-differential.stdout`：5,122输入中HEAD ASK 2,197；13,878输入中HEAD ASK 5,656；两组ASK→非ASK均0，原432组合冻结索引一致 |
| 历史32反例及编码两入口 | `r5-reported-probes.json`：32裸输入×2入口=64/64；1–4层编码=256/256；合计320/320 needs_approval，模拟Runner/managed派发0；每层32条Policy均ASK |
| 本轮四项P1精确输入 | `p1-probes.cjs`、`p1-before-after.json`：14输入/28入口检查、0失败，含六条普通命令、四条漏报及四层编码；对照HEAD/r4/r5均用各自准确源码纯求值/模拟 |
| 普通开发及旧P2 | `probe-summary.json`：25条普通对照中24条ALLOW/每入口模拟派发1，另1条真实变量工具调用属于已接受的控制流保守确认、派发0；四条原P2均ALLOW。新增测试同时覆盖裸npm/cargo、直线变量工具调用和表达式数据 |
| 项目§5必需项 | `g2-summary.json`=`G2_ALL_COMMANDS_EXIT_0`：先verify:quick构建，Core 509/509、Runner 166/166、State 82/82、Shell 117/117；release node --test 200通过/2 Windows专项SKIP/0失败；verify:quick、docs:check、diff --check全部退出码0 |
| 工作区/证据保护 | §5构建改写24个受跟踪Runner dist已恢复原字节，1813受跟踪文件前后0差异、无新增untracked。`frozen-baseline-recheck.json`对原5448文件0差异；本轮保护清单和最终六文件hash见`protection-final-r2.json`/`delivery-files-r2.json` |

实际消费者检查在当前源码构建后运行；`current-core-dist.json`绑定其编译产物。全局增量规范已读取，本工作树项目`docs/acceptance/ACCEPTANCE_AND_RELEASE_WORKFLOW.md`确实不存在，使用全局版与现任务§5有效顺序，不创建平行合同。报告完成后文档检查首次拒绝指向Git忽略证据目录的Markdown链接（`final-doc-checks.json`保留失败）；改为文字路径，再做文档/空白检查，最终结果见`final-doc-checks-r2.json`。准确本轮差异见`source-r4-vs-r5.patch`；相对HEAD的累计产品/测试差异见`source-head-vs-r5.patch`；六文件完整本轮差异见`complete-r4-to-r5-r2.patch`。

**保守确认与剩余限制：** 普通条件、foreach/赋值变量是表达式数据，已恢复ALLOW；真实`& $tool test`在控制结构与可见高影响词共存时仍ASK，这是ADR-0183/0184已接受类别。策略仍为有界尽力识别，不求解变量值或外部脚本，表达式识别不是完整Shell解析器。HEAD与r5均放行且无可见高影响词的写法（如`$tool='n'+'pm'; & $tool publish`，或`$tool=$env:TOOL; if (0) {$tool='echo'}; & $tool publish`）登记为已知限制；不把它们当作本轮已报告反例修复。`call :label`等批处理上下文未实测，收敛标准不扩为完整解析器。

**NOT_PERFORMED：** 真实危险命令内容、网络/远端动作、Windows/Win10/Win7实机、原生重构建、打包/新候选、提交/推送/发布、独立只读审核。本轮只交付未提交修复与Mac Node 20.17开发证据；原对话负责后续独立复核，阶段门不升级。

## 10. 修订r6：原P1-1普通表达式词法补齐

负责人直接要求修复三条追加反例及范围表达式。它们均为HEAD ALLOW、r4/r5 ASK，属于原P1-1类别；§9普通表达式修复结论只覆盖其已检查写法，不能解释为整个类别已闭环。任务书中既有r5独立审核记录保留，本轮结果另交复核，不登记DEVELOPER_VERIFIED。

实际工作树、分支和HEAD仍为§9基线。起始产品/测试SHA与r5一致：`32dca485…`、`f352284c…`、`61fa7d58…`；已有文档、其他对话追加的任务记录、untracked和候选/证据保留。修改仍限定原三文件、原报告及任务书记录；Accepted ADR正文未改。此轮在ADR-0185既定表达式分类内补齐词法边界，不改变安全模型或收敛标准。

**机制：** R对非显式变量调用读取保留引号的`rawShellWords`词段，识别`-eq'true'`、`-ne0`等操作符与相邻操作数的边界，避免通用tokenizer将它们合成`-eqtrue`/`-ne0`。带字母的参数前缀如`-eqtrue`/`-format`不按操作符豁免。识别变量上的索引及`..`范围表达式，避免索引内空格成为“参数”；花括号变量名内部字符不作为索引/范围。显式`&`/`.`和CMD变量调用先保持确认判定，表达式识别不豁免这些调用。HEAD读法、赋值解析、风险上下文、深度守卫及通用tokenizer均未改。

| 产品/测试文件 | r6 SHA256 |
|---|---|
| `src/core/src/policy.ts` | `d06b03e02209487348a5aea4bf3baec7f74151fb325104cbe8b2e485a028513e` |
| `src/core/tests/policy.test.ts` | `881878eab144590e862f8a54a1d0fa73c48a8ed3dffba7dd378d68f98be286ba` |
| `src/core/tests/a9-background-tools.test.ts` | `a05e54938fc84a4f379994b2ce5f04fb4cd06b0626ec8427d60adbf4807502a3` |

新证据只写`.acceptance/a9-31-developer/policy-p1-repair-r6/`，r1–r5原样保留。`initial/`保存本轮起始六文件，独立临时副本位置见`scratch-path.txt`。

- **红→绿与回退红**：`red.jest.json`在r5产品字节上为18失败/337通过；`green.jest.json`为355/355通过；隔离回退准确r5源码（SHA `32dca485…`）后`rollback-r6-to-r5.jest.json`再次18失败/337通过。工作树未为回退测试换回旧产品。
- **本轮精确对照及两入口**：`target-probes.cjs`/`target-before-after.json`覆盖16条相邻引号/数字/变量/类型操作数、索引空格/多维/链式索引及范围写法，全部HEAD/r6 ALLOW、r5 ASK；r6每入口模拟派发1。另6条真实变量调用对照全部r6 ASK，每入口needs_approval/模拟派发0。合计22输入、44入口检查、0失败；三条用户原输入及范围表达式均覆盖。
- **HEAD ASK超集**：`construction-proof.py`/`construction-proof.json`撤除F1/R后与HEAD全文一致（SHA `a0851f60…`）；原两组构造重新执行，`differential.stdout`记录5,122输入/HEAD ASK 2,197及13,878输入/HEAD ASK 5,656，两组ASK→非ASK均0，原432冻结索引一致。
- **历史反例与编码**：`historical-probes.json`/`historical-summary.json`为32输入×0–4层编码×两入口，共320/320 needs_approval，模拟派发0；旧四条P2、上一轮表达式及变量调用测试全部保持通过。
- **项目§5必需项**：`g2-summary.json`=`G2_ALL_COMMANDS_EXIT_0`，先verify:quick构建实际消费者依赖，再Core 535、Runner 166、State 82、Shell 117；release 200通过/2 Windows专项SKIP/0失败；verify:quick/docs:check/diff --check全部退出码0。构建改写24个Runner dist恢复原字节，1813受跟踪文件前后0差异，无新增untracked；`current-core-dist.json`绑定实际Core编译产物。
- **保护及交付**：原冻结5448文件0差异（`frozen-baseline-recheck.json`）；本轮7187旧证据/冻结文件及起始1884 tracked/untracked文件的最终保护核对见`protection-final.json`。本轮五文件完整差异见`complete-r5-to-r6.patch`，三文件源码差异见`source-r5-to-r6.patch`，全部最终SHA见`delivery-files.json`；报告补录后的文档/空白检查见`final-doc-checks.json`。

剩余边界沿用§9：有界尽力识别，不是完整Shell解析器；不求解变量值/外部脚本，真实变量调用在控制流与可见高影响词共存时仍保守确认。本轮没有新增权限、依赖、解析器或递归上限。**NOT_PERFORMED**：r6独立审核、Windows/Win10/Win7实机、真实危险命令、网络/远端、原生重构建、打包/新候选、提交/推送/发布；修复保持未提交，阶段门不升级。

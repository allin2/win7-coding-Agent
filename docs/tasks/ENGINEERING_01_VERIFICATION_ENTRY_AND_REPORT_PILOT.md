# ENGINEERING_01 — 检查入口与报告校验试点

```text
Status: COMPLETE
Task Type: ENGINEERING_TOOLING
Target Branch: codex/a9-alpha2
Phase-Gate: COMPLETE
Win7-Validation: NOT_PERFORMED
```

2026-10-07 负责人要求“请你按照方案优化项目”。本任务登记当前分支可独立实施的工具范围。
依据为[优化方案](../plans/PROJECT_ENGINEERING_OPTIMIZATION_PLAN.md)。不借用 DOCS_06 授权。

## 1. 基线与成功条件

基线 `a53c9b9d861486e5923bc82ea70b31b76af1a939`，已有 dirty/untracked 原样保护。
开发机 Node 20.17.0。新工具只用标准库，不新增依赖。
完整入口与发布测试以本轮开发机运行时验证；Node 16.17.1 实际执行 NOT_PERFORMED。
工具只在开发/验收准备环境运行，不进入当前产品包。

1. 保留旧检查命令语义，新增分组及完整入口。
2. 前置失败时不派发下游；失败与 NOT_PERFORMED 不汇总成 PASS。
3. 发布测试按实际文件枚举，无必要输入时返回失败。
4. 候选外报告校验器读取版本化合同，保留 W42 报告验证规则。
5. 错身份、缺用例、错误状态、缺附件、错哈希和秘密字段被拒绝。
6. 新工具不改历史报告器、候选、证据、产品代码或原生输入。

## 2. 精确允许路径

- `package.json`
- `scripts/verify_project.mjs`
- `scripts/test_verify_project.mjs`
- `scripts/release/validation/report-verifier.cjs`
- `scripts/release/test/report-verifier.test.mjs`
- 根 `README.md` 的检查说明

本地检查日志仅新增 `outputs/engineering-optimization-20261007-r1/` 下的
`verify-all-initial.log`、`tools-final.log`、`report-pilot-final.log`、`release-final.log`、
`release-final-summary.json`、`preservation.json`、`report-pilot-portable-final.log`。不覆盖已有同名目录或文件。

文档维护为本任务、任务索引、优化方案与方案索引、STATUS、增量验收规范，以及报告试点格式 ADR 和 ADR 索引。
不修改旧 Accepted ADR 正文。新格式 ADR 在实现前登记。

## 3. 执行与停止边界

允许本地定向修复、测试与完整检查。测试临时夹具沿用既有隔离目录的创建/清理方式。
构建生成物先保全已有内容，运行后恢复精确字节，不用 Git reset/checkout 清理。
未知组选项、子进程失败或缺输入返回非零。前置失败停止依赖组。
同类失败两轮未闭环先最小诊断。不改旧测试判据以取得通过。
不联网、提交、推送、合并、远端写入、发布或空间删除。

## 4. 后续范围与实施条件

产品诊断等待 A9-30/31 实际整合基线选择；不覆盖功能分支主入口。
共享 driver、UI 自动点击与取证绑定解耦先核对现有合同和真实入口；不修改冻结工具。
结构收敛按具体功能接缝执行。空间对象依原台账逐项确认。
这些事项保持待办，不因工具试点通过宣布整个方案完成。

## 5. 验证与执行记录

定向检查覆盖真实 CLI、分组顺序、退出码、缺文件和未知参数；编排受控检查不作为产品证据。
报告试点使用隔离小样本，对照原 W42 校验器的通过与拒绝结果。
完整入口在当前开发机运行，结果按组记录；Win10/Win7 均 NOT_PERFORMED。
执行耗时与返回结果写在本节，不新增平行台账。

2026-10-07：用户指令、实际基线和允许路径已登记。尚未执行实现与检查。

2026-10-07 收口：本任务的工具实现及开发机定向验证完成。
任务 COMPLETE 只关闭本节规定的工具交付，不表示发布检查或整个优化方案通过。

| 项目 | 本轮结果与依据 |
|---|---|
| 检查入口 | 文档、工具、产品、发布四组；单次产品构建；实际 CLI 与子进程拒绝/退出检查 PASS |
| SKIP/TODO 处理 | 真实 Node 子测试退出 0 且 SKIP=1 时，新入口返回 FAIL；空或矛盾摘要也拒绝 |
| 报告试点 | 最终源码 26/26 定向检查 PASS；W42 合成完整/失败/待证据样本对照，秘密/身份/附件反例及实际符号链接拒绝 |
| 文档检查 | 206 文件、50 任务 PASS；最终链接/索引/编码再次核对 |
| 七模块产品 | 完整入口实际构建后测试，2008/2008 PASS；开发机约 46.96 秒 |
| 发布组 | 实跑 182 项：179 PASS、3 SKIP，子进程退出非零；完整入口 FAIL，发布组约 242.15 秒 |
| 已定位阻断 | 两项 RC0708 输入 ZIP 缺失；旧测试 SKIP 后仍继续执行并报错。另一项 Windows PowerShell 5.1 在 macOS 未执行 |
| 最终发布摘要 | 最终编排器复算既有实跑日志，仍 FAIL；明确为日志复核，不是第二次实跑。未变化旧测试不重复执行 |
| 保护 | 440 个模块构建输出运行前后字节相同，无新增生成文件；其余已有内容按基线摘要复核 |
| 未执行 | Node16、Electron、Win10/Win7 实机、新候选接入、产品诊断、桌面点击、取证合同变更、空间删除、Git 交付均 NOT_PERFORMED |

本地原始日志见 `outputs/engineering-optimization-20261007-r1/`。
初次完整检查后的改动只增加 SKIP/TODO 拒绝与发布摘要计数，并补报告 API 默认文件系统。
最终工具组及报告试点已定向复验；没有把初次完整入口描述为最终源码的全部检查 PASS。
最终反逃逸测试使用目录符号链接，Windows 路径使用 junction，不新增 Windows 必然 SKIP。
此变体在开发机再次 26/26 PASS，记录为 `report-pilot-portable-final.log`；Windows 实际执行仍 NOT_PERFORMED。
发布组的缺输入不能通过改断言修复。未重建历史 RC ZIP，也未连接 Windows 执行缺失项。

后续沿用优化方案：先处理真实工具入口及派生绑定，再按批准的产品整合基线推进诊断。
工具试点不接管既有安全控制器，也不解除任何旧 HALTED/UNKNOWN。

最终保护复核：1708 个白名单外原有文件/删除记录无差异；HEAD 未变。


## 6. Win10 真实入口与输入绑定改造计划（待审，2026-10-07）

建议先改候选外工具，再用新根完成实际运行时准入。
本计划只完成开发机调查与文档设计。实现、构建、回放执行、UI 操作及远端连接均为 `NOT_PERFORMED`。
本任务原 `COMPLETE` 及任务索引不变。本节不是实现批准，也不重开原白名单。
依据为[工程优化方案](../plans/PROJECT_ENGINEERING_OPTIMIZATION_PLAN.md)末尾五项、
[增量验收规范](../acceptance/ACCEPTANCE_AND_RELEASE_WORKFLOW.md) §3–6、§10。
本轮沿用本文件记录，不另建执行台账。

### 6.1 可观察的交付结果与实际基线

执行代理生成新工具输入后，能在派发前拒绝错 source、错产品、错工具、旧根、旧 run 和旧父实例。
执行代理能从真实 Renderer、重启文件创建及退出对话框取得结果。
身份、完整性、安全、必需审计及生命周期未知继续阻断下游。
新工具成功只绑定新工具版本、准确产品、run、环境与用户身份。
历史 Win10 结果不继承为新工具 PASS。Win7 结论另按产品合同取得。

| 基线 | 本轮开发机核对事实 | 适用范围 |
|---|---|---|
| 当前仓库 | `/Users/qlyf/Developer/win7-coding-Agent`；`codex/a9-alpha2`；HEAD `a53c9b9d…` | 新工具计划所在分支；不是含 A9-31 的产品整合源 |
| 当前工作区 | 18 个修改项、2 个删除项、20 个 untracked 状态项；共 40 项 | 目录项按 Git status 计数；不解释为文件总数 |
| 历史工作树 | `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`；`codex/a9-31-background-tools`；HEAD `571ec550…` | 仅本地参考；14 个修改项、8 个 untracked 状态项，共 22 项 |
| 两份 A9-31 合同 | 当前分支副本为 `DRAFT_READY_FOR_REVIEW`；历史树为 `APPROVED_FOR_IMPLEMENTATION / A9_31_DEVELOPER_VERIFIED` | 历史批准不能授权当前分支实施或覆盖其任务副本 |
| 历史产品 | r4 开发包，source `8d207ab1…`，ZIP `e96fdf96…`，manifest `d084907c…` | 不是 HEAD `571ec550…` 构建；也不是正式 Win7 候选 |
| 最终历史工具 | `product-r4-win10-r2`，master `fb4adc2b…`，准入记录 `9a60b345…`，矩阵 `905c4f4b…` | 历史准入与普通产品执行分开；不是本计划新工具准入 |
| 历史普通入口 | 返回记录 PID 90920、creation ticks `639268559292611658`、SID 后缀 1005、Session 3、Medium、非提升、`InJob=false` | 仅说明当时实例；不得写入新运行输入或推定当前存活 |
| 历史最终结果 | 矩阵 `WIN10_SINGLE_ROOT_PASS`；dispatcher `COMPLETED`；10 请求、8 phase | 保留 Recovery、Esc/取消、Policy 及 conhost 范围限制 |
| 本轮证据层级 | 本地复算 ZIP、master、DLL、pin、dispatcher-final 和 10 份评审摘要哈希；与矩阵所查字段一致 | 未重跑历史评审；未复核全部返回闭包；未连接 Win10 |

保护已有修改，包括两份已删除 Electron ZIP。禁止恢复、暂存或清理它们。
初次 Git status 的 fsmonitor IPC 报错已用只读 `-c core.fsmonitor=false` 复核。
不修改 Git 配置，也不启动 fsmonitor 服务。
历史工作树的治理 dirty 不代表 r4 产品 dirty。构建来源以原产品记录为准。
当前 HEAD 只定位仓库。未来新工具含未提交修改时，先锁定获批不可变源码快照。
不能声称这些新字节来自当前 clean HEAD。

历史工具根固定为下列本地目录。以下参考路径均相对于该根，除非另写完整路径。
它们只读；本轮不执行其中的 Python、PowerShell 或 driver。

```text
/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/
```

| 组件与消费者 | 已核对的精确参考路径或调用点 | 后续影响 |
|---|---|---|
| 产品身份 | `product-r4/package-identity.json`；`product-r4/package/Win7CodingAgent-0.3.0-alpha.2-win7-x64.zip` | 首个工具消费者建议使用这份不变开发包的独立副本；须由负责人确认 |
| 四源与四 revision | `product-r4-win10-r2/control-scripts/{stage-product-r3.ps1,launch-product-r3-desktop.ps1,serve-product-r3-desktop.ps1,product-r3-driver.cjs}`；`frozen-control/{controlled-boot,normal-short,normal-full,ready-negative}/revision.json` | 不改旧四源；新工具形成新字节与准入 |
| 当前派生 | `product-r4-win10-r2/{derive-r4r2-control.py,prepare-r4r2-local.py,finish-current-admission.py,freeze-admission.py}` | `prepare` 复制模板，`finish` 后取真实回执；集中管理依赖顺序 |
| Renderer | driver 第 7–16、399–400 行；`APPLY_FULL_ACCESS_SCRIPT` 经 `webContents.executeJavaScript` 使用 | 保留函数序列化；覆盖动态参数和最终执行字符串 |
| 重启与晚到日志 | driver 第 190–193 行的 `restartAware`、`entry` 和 `driver-journal`；第 95–136 行自检 | 执行实际创建点；辅助函数自测不足以证明消费者 |
| 取证构建 | `product-r4-win10-r2/capture-built/{capture-source.cs,capture-library.dll,capture-build.json,capture-build-scope-approval.json}`；serve 第 152–167 行 | `Capture-Build` 和 `Capture-BuildApproval` 当前要求构建 source 等于产品 source |
| 父分类与 observer | serve 第 79–94 行；`event-sources/{manifest-process-observer.cs,launch-manifest-observer.ps1}`；`observer-components/v1/pin.json` | 分类使用 ready 的 C: 设备映射；其余卷不能通过 basename 放行 |
| 退出真实回执 | driver 第 195–205、244 行；历史 `src/shell/product/main.js` 第 1033–1038 行 | 原生 API 真调用；StopExit response=0，ReleaseExit response=1；取消=2 |
| 回收及评审 | `product-r4-win10-r2/{return-one-run.py,return-partial-evidence.py,review-phase.py,review-negative.py,review-phase-r9.py}` | 保留返回 size/SHA、秘密扫描及独立评审；不先扩大共享报告器 |

### 6.2 未来实现的精确范围与消费者

本轮实际编辑只追加本任务计划，并在优化方案追加入口链接。
其余路径是**待批准的未来白名单建议**，不是当前允许路径。
建议在当前分支开发候选外工具；产品字节保持由独立产品合同提供。
不把 A9-30/31 主入口复制到当前分支。后续产品诊断继续等待整合基线裁决。

| 精确拟议文件 | 职责及直接消费者 |
|---|---|
| `scripts/release/validation/win10/input-binding.cjs` | 统一 CLI：校验合同、生成静态输入、由当前回执生成运行输入、校验最终闭包；stage、serve、冻结步骤读取其输出 |
| `scripts/release/validation/win10/product-driver.cjs` | 承接最终 r4/R2 driver；只改输入读取、真实入口检查及新身份字段消费者 |
| `scripts/release/validation/win10/stage-product.ps1` | 核验与部署新工具闭包；读取独立组件构建身份与本轮产品身份 |
| `scripts/release/validation/win10/launch-product-desktop.ps1` | 普通入口、请求预算、上一树终态；不增加启动项或计划任务 |
| `scripts/release/validation/win10/serve-product-desktop.ps1` | worker、Query/SYNC/manifest 证据关联、完整性和生命周期硬门 |
| `scripts/release/validation/win10/launch-manifest-observer.ps1` | 只将独立组件身份和本轮请求身份传到已有观察器；若需改 C# 契约，停止此项并补精确范围 |
| `scripts/release/validation/win10/exit-dialog-action.cjs` | 语义定位能力探针及获准的单次退出 UI 操作；不得返回模拟产品 response |
| `scripts/release/test/win10-input-binding.test.mjs` | 实际 CLI、旧输入拒绝、静态派生确定性、动态事实隔离与文件独占创建 |
| `scripts/release/test/win10-entry.test.mjs` | 实际序列化字符串、实际创建点、旧错误实现反例、历史数据回放 |
| `scripts/release/test/win10-contract.test.mjs` | 产品/组件双身份、完整性负例、UI 错选及超时判据、生命周期失败不派发 |
| `docs/tasks/ENGINEERING_01_VERIFICATION_ENTRY_AND_REPORT_PILOT.md` | 本轮计划及后续引用；原 COMPLETE 不自行改为批准 |
| `docs/plans/PROJECT_ENGINEERING_OPTIMIZATION_PLAN.md` | 只维护本计划入口；不复制运行流水 |

不预先增加 npm 依赖、通用验证框架、package scripts 或产品代码改动。
`capture-source.cs` 与 `manifest-process-observer.cs` 先按冻结哈希作为构建输入只读引用。
若当前接口无法表达双身份，先提交准确 C# 文件与格式差异供裁决，不热改旧源。
归档取回路径和来源必须能核验；不能让新工具依赖未锁定的任意历史目录。

未来本地新执行输入建议使用 `.acceptance/engineering-win10-entry-r1/`。
它仅是候选外版本位置建议，本轮不创建。
批准时精确登记以下文件：`contract.json`、`product-identity.json`、`component-identity.json`、
`static-input.json`、`master-pin.json`、`derivation.json`、`admission-binding.json`、`runtime-input.json`、
`frozen-admission-result.json`、`runtime-admission.json`、`replay-result.json`、`preservation.json`。
四版路径为 `revisions/<版名>/{revision.json,checks.json,registration.json}`，版名只取上表四版。
脚本路径只取本表六个执行文件，复制后逐 size/SHA 锁定。
只读引用 capture/observer 构建闭包；若需新构建，单独登记源、产物、MVID、build、批准及 pin 路径。

每次请求的证据位置为 `runs/<fresh-run-id>/`。
准确登记其 `request.json`、`input-binding.json`、`first-failure.json`、`controller-result.json`、
`driver-result.json`、`review.json`、`return-manifest.json` 与原工具必需的 signals/observer/journal 文件族。
文件族先从真实入口枚举后列入承接任务。未登记的新写点先停止该写点。
本轮不批准动态文件族，也不创建占位哈希或批准记录。

### 6.3 固定配置、组件事实与当前运行事实

建议沿用既有 master/revision/请求结构，新双身份格式另行版本化。
旧 schema 只由旧校验器读取；新工具拒绝未知格式、缺字段、重复字段和多余字段。
不把“存在一个 PASS 字符串”当成冻结条件。

```mermaid
flowchart LR
  A[已批准配置与产品身份] --> B[集中生成静态输入]
  C[组件真实构建记录] --> B
  B --> D[实际运行时准入与冻结]
  D --> E[新根普通入口及当前回执]
  E --> F[集中生成运行输入]
  F --> G[派发前重新校验]
  G --> H[最短产品链路及受影响回归]
```

| 类别 | 字段与来源 | 生成及核验时机 |
|---|---|---|
| 固定配置 | schema、允许 phase、四版语义、准确 API/运行档案、预算、超时、时钟精度、系统映像范围、批准范围与哈希 | 从获批合同读取；禁止成为关闭安全门的参数 |
| 产品身份 | 产品 source、ZIP SHA/size、manifest SHA、helper/原生锁、Electron/SQLite/包内加载身份 | 原生产者记录加实际工件复算；source 不是执行目录 HEAD 的别名 |
| 组件构建身份 | 自身源码提交或不可变源码快照及 SHA、编译器/三引用/argv、运行档案、DLL/EXE SHA、MVID、build SHA、真实构建批准 | 保留原来源；由真实构建闭包取得，不随产品 source 全局替换 |
| 静态部署绑定 | 准确本地/远端根、master SHA、工具脚本 SHA/size、四 revision SHA、派生依赖 | 根可先获批；用实际文件生成 pin；完整派生完成后统一检查 |
| 当前运行事实 | fresh run/request ID、父/dispatcher/worker/Electron PID 与 creation ticks、Session/SID/提升/Job、ready/heartbeat、当前 receipt SHA | 只从本根当前实例取得；旧模板中不允许存在这些事实 |
| 最终结果 | 本轮产品及组件身份、输入 SHA、真实 response、必要审计、整树退出、观察器关闭、返回 SHA | 先保留原始观察，再生成结果；下游不靠名称或汇总退出 0 推定 PASS |

1. 读取获批合同及准确工件。
2. 校验 source 与产品 manifest 一致。
3. 核验组件来源及批准闭包。
4. 独占创建静态输入和新版本目录。
5. 生成四 revision 及全部消费者参数。
6. 解码内嵌 JSON 和脚本再核对。
7. 在实际运行时完成准入。
8. 冻结静态输入及工具闭包。
9. 获取本根当前实例与实际回执。
10. 生成新 request/run 运行输入。
11. 派发前重新校验全部绑定。
12. 保存结果并核验真实收尾。

运行输入逐请求创建，不再修改已冻结 master。
若静态输入依赖准入时取得的回执，应在冻结前生成并绑定该准入 run。
准入回执不能代替普通产品请求的当前回执。
`sync-current` 必须等待本根 `sync-actual` 返回后生成。
manifest 实际入口同时生成 `PinSha256`、`AdmitRequestId`、`AdmitLabel`、`ComponentVersion`、`Tag`。
五项均从本轮 pin/admission 取得；缺参数即拒绝，不能照抄旧 r1b/r2 标签。
旧 PID、creation ticks、receipt、run ID 不参与静态模板派生。
创建目录与文件时用独占语义；已存在即拒绝，不删除后重建。

PID 单独不能证明实例。creation ticks 和纳秒计数跨 JS/PS 用十进制字符串传递。
禁止把大整数经 JS Number 四舍五入后再比较。
请求同时绑定 root、source、master、revision、request/run 与父实例。
读取回执后、实际派发前再核对实例和文件 SHA，防止期间替换。
重启实例重新取父 pin，不能复用崩溃实例 creation ticks。

静态派生做两类检查：同输入字节确定性；字段/文本位置的差异与反向还原。
解码 Base64 载荷检查根、source、hash、旧值残留及实际脚本定义。
多对一映射必须按字段用途核对，不能笼统声称全局反向替换成立。
历史组件 source 是合法保留值；与误留旧产品 source 分开判断。
真实运行字段变化写入本次输入摘要，不要求把动态事实还原成旧运行。

### 6.4 实施顺序、反例与验收门

以下工作全部待实施批准。执行代理负责实现与取证。
负责人负责合同、权限范围和门 A/B 裁决。独立审核按适用合同执行。

| 顺序与地点 | 动作 | 必须保留的反例 | 进入下一步条件 |
|---|---|---|---|
| 1，本地 | 在承接任务完成 C14 分支、路径、状态登记；绑定历史样本清单与哈希 | 关闭任务、错分支、超白名单不能实现 | 负责人指定当前承接任务；本轮计划不作为批准 |
| 2，本地 | 先实现集中输入生成及校验；再迁移 stage/serve/driver 消费者 | 错 source/ZIP/tool hash、旧根、重复 run、错父 ticks、旧 receipt、字段重复、路径越界与现有输出 | 实际 CLI 非零拒绝；前置失败无下游写入/派发；旧文件字节不变 |
| 3，本地 | 回放历史错误实现及真实输入；执行序列化和创建点 | 引号/反斜杠/中文/换行；重启 journal、截图、晚到事件 EEXIST；错 NT 映像与时钟边界 | 原实现能呈现原缺口；新实现遵守批准预期；回放不计当前 Win10 PASS |
| 4，Win10 | ParseFile 与实际 Electron-as-Node/PS5.1/CLR4 能力准入；取得本根 sync-actual；生成 sync-current | 模板旧 PID、复用 probe run、包内模块来源错、遗漏 manifest 参数 | 当前工具字节、解释器和消费者一致；真实回执可唯一关联；构造样本单列 |
| 5，Win10 | 准入真实 Renderer/重启/查询/SYNC/manifest 调用点；试探退出语义定位 | helper 可用但真实调用仍旧；短命 87；错父/Session/映像；丢事件；错误 UI 窗口 | 整树结束、零丢失、观察器确实关闭；身份与完整性门满足 |
| 6，Win10 | 普通入口执行 Boot 和最短 Background | 管理员或 Host Job 入口、旧 dispatcher、错 revision、旧 ready | 实际 main/preload/IPC/SQLite/Renderer 加载；启动一进程、读输出、Stop、持久化及整树收尾有直接证据 |
| 7，Win10 | 按影响完成 Background、Shell、EncodingSecurity、FailureBoundaries、StopExit、ReleaseExit、Recovery | 游标错属/过期、审计失败、取消/release竞态、重启造终态、错选/超时 | 覆盖承接矩阵必跑项；全部结果绑定新工具、新输入与准确产品 |
| 8，本地审核 | 完整回收、逐 size/SHA/秘密扫描，审核每 phase 和 dispatcher-final | 缺附件、超预算、截断、UNKNOWN 被写零、只看 controller 退出 0 | 正式结果由适用角色与负责人裁决；未执行项明确记录 |

最短链路不缩减合同必跑矩阵。新控制器影响跨 phase 证明时，不能只验 Background。
建议首轮工具消费者使用历史 r4 不变开发包，复制到获批新根。
这能先验证工具变化，避免同时整合产品变化。
负责人另选产品源时，只替换产品身份输入，并重新判断包内接口与原生调用影响。
未变化 helper 不自动重做双构建。新包仍须直接核验自身闭包与实际加载。

### 6.5 历史失败回放与真实调用点

| 问题 | 历史输入位置及已核对依据 | 本地反例与 Win10 必需检查 |
|---|---|---|
| Renderer 表达式 | 历史 `docs/reports/2026-10/a9_31_r6_cua_errors_and_boot_capture_failure_2026-10-03.md`；任务书第 333–344 行；ADR-0165 | 回放最终 executeJavaScript 字符串；旧引号拼接报 SyntaxError。新函数序列化解析及 DOM 操作有效；动态 JSON 参数在真实 Renderer 执行。缺元素零点击，不能绕过实际模式表单 |
| 重启创建 | `product-r3-retry-r8/control-scripts/product-r3-driver.cjs`；`r8-review-repair-r1/`；ADR-0174/0177/0178 | 崩溃与重启共用证据目录，实际创建 journal、final、截图与 post-final-event。原文件保留；重复同实例写拒绝；迟到成功不覆盖原 FAIL。真实 Recovery 完整重启另验 |
| NT 父路径 | `product-r3-retry-r6/win10-evidence-matrix-r6.json` 与其 EncodingSecurity 返回；最终 serve 第 79–94 行；ADR-0175 | 真实 `\Device\HarddiskVolume3\Windows\System32\cmd.exe` 与 PowerShell 路径；大小写、其他卷、同 basename、错 mapping、拼接后缀均作反例。其他卷保持拒绝，支持新卷须新 API/合同 |
| 短命进程 | 历史 r1 R6/R8 的 cmd 查询 87 与 r3 R6 的 conhost 87；ADR-0167/0173；最终矩阵 Boot proof | 原始 gap、receipt、Start/Stop 与 parent pin 唯一关联。短命退出不凭后来 PID 消失证明；cmd-ver SYNC 只限准确只读调用。conhost proof 不推广到其他程序 |
| 时钟边界 | 历史 `a9_31_r9_desktop_partial_pass_and_clock_boundary_halt_2026-10-04.md` 中 creation 晚 206 ticks；ADR-0166/0168；observer 第 596–601 行 | 精确 UTC 包围同一 snapshot；边界内、边界相等、±1 tick、反向时钟、双观察身份错配。区分 capture 严格边界、SYNC 16ms 精度和 manifest 160000 ticks 容差；不混用或扩大 |
| 旧运行事实 | `product-r4-win10-r2/directed-validation-sync-current-r1.stdout`、`directed-validation-sync-current-r2-r1.stderr`、`admission-inputs/validation-sync-current-r3.ps1` | 第一轮 `LIFECYCLE_SYNC_RECEIPT_PARENT_NOT_PINNED`，第二轮 `OLD_PROBE_RUN`，均未执行判据。新 CLI 无本根回执即拒绝；同内容换 fresh run 后才可检查。旧记录永久保留 |
| 完整性耦合 | `product-r4-win10-r1/` 的 files-scope 返回；R2 serve 第 152–167 行；ADR-0187 | 不改旧构建记录 source；新产品配旧组件只有批准的双身份合同能接入。篡改 build/批准/DLL/MVID/引用或漏闭包必须拒绝 |
| UI 超时与错选 | `product-r3-retry-r7/win10-evidence-matrix-r7.json` 与三次 StopExit 返回；ADR-0176 | 160.5/263.7 秒为超时；3.8 秒 response=1 是错选。重放必须保持原 FAIL/HALTED。新 UI 实跑分别核对 response=0/1，而不是从按钮文字推定 |

先只复制所需样本到新隔离目录，清单记录准确文件、SHA、原 run 和期望。
原始数据按字节保护。未知编码不擅自以 UTF-8 重写。
没有可核验数据的反例记 `UNKNOWN`；不得填造历史成功。
真实进程、时钟、文件系统和 UI 准入必须在锁定 Win10 运行时执行。
本地 VM/桩 DOM 只证明解析与动作契约，不能代签实际 UI 或实例身份。

### 6.6 原生退出对话框的语义自动点击

建议先探测现有受控桌面工具能否读取真实原生窗口的语义。
只有探测结果可靠且获得准确 UI 操作授权后，才启用自动点击。
本轮不启动 GUI，也不连接远端。

1. 等待本请求的 `native-exit-dialog-opened`。
2. 核对 request、master、revision、phase 与当前产品实例。
3. 定位产品 PID 所属的唯一原生对话框。
4. 核对标题“退出时处理后台进程”。
5. 核对完整按钮集合及启用状态。
6. 对指定按钮执行一次语义动作。
7. 读取真实 `showMessageBox` 返回回执。
8. 核对持久化与进程收尾。

| phase | 目标按钮与必须取得的实际 response | 拒绝与停止 |
|---|---|---|
| StopExit | “停止后退出”；response=0 | 不按默认焦点、坐标或按钮顺序猜测 |
| ReleaseExit | “留给系统后退出”；response=1 | 同时核对逐句柄 release 意图及真实回执 |
| Esc/取消 | 历史未实测；response=2 不计上述成功 | 正向运行中误选按原硬门 HALTED；专用验证另行授权 |

点击方只提交 UI 动作事实，不写产品 response 文件，不拦截 API 返回为固定值。
driver 必须调用保存的原生 `showMessageBox`，记录 actual response、sequence、起止及绑定。
API called_at/returned_at 与窗口实际就绪时刻分开记录；计时遵循原合同，不重置或放宽 120 秒。
未知标题、多个窗口、跨 PID、按钮缺失/禁用、旧 opened、点击后无实际回执均停止点击。
超时后返回只记晚到观察，不把旧 FAIL 改成 PASS。

优先复用已有受控桌面能力，不安装自动化框架或修改权限。
若只能通过新 Windows UI Automation API/程序集实现，先列 C15/C16 与独立 Win10-only Profile。
在负责人批准精确 API、源码、运行身份和操作范围前，停止该实现与运行。
自动定位不可靠时保留人工路径：负责人提前就位，每轮只给一个按钮目标。
执行代理负责启动、状态、派发、回收；不要求负责人反复手输 PowerShell。
若普通入口只能人工启动，交付一个已绑定命令或已有桌面入口，核验实际进程身份后恢复。

### 6.7 合同与 ADR 差异（待负责人裁决）

历史 ADR 位置为历史工作树的 `docs/DECISIONS.md`。
当前分支未导入这些完整实现合同；不能在当前分支伪造其 Accepted 状态。
以下是新合同差异建议。本轮不新增 Accepted ADR，不改旧 ADR 正文。

| 原合同 | 拟议差异 | 必须保持的判据与恢复条件 |
|---|---|---|
| C14 / ADR-0192；ENGINEERING_01 已关闭 | 负责人指定当前承接任务及分支，登记上表新工具白名单；建议先在 `codex/a9-alpha2` 做候选外工具 | 本节不改变任务索引。批准、当前分区、分支及路径齐备后才实施 |
| ADR-0186 仅换绑定；ADR-0187 同产品 source 重编 capture | 新合同分别锁定 `product_source` 与 `component_source/build`；运行绑定同时引用两者及准确兼容接口 | 不能仅删 source 比较。build SHA、批准、源码、编译器/引用/参数、DLL/MVID、API/clock Profile 全部继续核验 |
| serve 的 Capture-Build/BuildApproval 与 observer-ready 都读单一 source | 在新工具迁移所有生产者和消费者；保留旧组件构建记录原字节，由新运行关联记录引用 | 必须逐消费者列差异；未知/不支持格式拒绝。组件自身嵌入旧 source 时原样保留并明确字段语义 |
| ADR-0176 人工点击；ADR-0177/0178 候选外工具版本 | 增加经准入的语义点击方与真实 UI 证据，不改产品关闭逻辑 | response、120秒、错选/取消 HALTED 不变；自动化 API 新增须先登记 |
| ADR-0167 SYNC、ADR-0168 精确UTC、ADR-0173/0175 manifest | 使用当前 run/parent/receipt；父分类仅支持已批准 C: 映像 | capture 不回退粗 UTC；SYNC 不扩大命令；manifest 不扩大未知程序或其他卷 |
| ADR-0179/0188 Recovery 限制；G3/G4 未关闭 | 工具测试保持 `cleanup_required` 及隔离 `app.exit(0)` 的原语义 | 不能据新工具通过宣称产品恢复出口或 Esc/取消已完成；A9-34 不在本计划实现范围 |
| ADR-0186 全单根十请求；增量规范建议最短链路先行 | 建议新任务明确 Boot→短 Background→受影响回归，保留完整矩阵与专用负例 | 若涉及固定顺序，先批准差异；不能自动借通用规范重排旧运行 |
| ADR-0193 参数化报告试点 Proposed | 首轮只复用已证实报告规则；新双身份格式单独登记 Proposed ADR | 不直接接管旧控制器或报告器，不把 Proposed 记 Accepted |

建议新 ADR 只解决输入格式、双身份消费者与 UI 动作边界。
编号在承接分支核对最新 DECISIONS/索引后分配；本计划不预占编号。
产品身份与取证身份解耦后，组件复用仍须核对字节、依赖/参数/配置、上下游和合同适用性。
符合条件的旧组件构建证据标 `INHERITED_EVIDENCE`。
新工具准入、新运行身份和新产品执行始终取得直接证据。
不能复制旧 build 后改 source、MVID 或批准哈希来通过 files-scope。

### 6.8 本地、Win10 与人工边界

| 范围 | 执行代理可完成的工作 | 人工帮助、原因与恢复条件 |
|---|---|---|
| 本轮本地 | 只读基线、历史工具/证据核对；写计划；文档/链接/编码/保护检查 | 无需新增权限；已完成范围不等待实现裁决 |
| 后续本地 | C14 获批后实现集中生成、真实 CLI 与历史反例回放；形成准确差异和不可变工具闭包 | 负责人指定承接任务/分支、批准格式与路径；此前实现停止 |
| Win10 工具准入 | 锁定 PS5.1、Electron22.3.27/Node16.17.1/ABI110、CLR4、csc及三引用；解析、构建、查询与真实文件/回执检查 | 需要准确远端目标/账户/新根及写入执行授权；本轮无此权限 |
| 普通产品执行 | 代理派发固定请求、回收、检查实际 SID/Session/Medium/非提升/noJob与整树终态 | 若桌面锁定或入口不可操作，负责人解锁并启动已绑定普通入口；不能用管理员/SSH/计划任务替代 |
| 退出点击 | 可靠语义点击获批后代理操作；失败保存现场 | 定位不可靠时负责人就位并点唯一指定按钮；实际回执齐全后恢复 |
| 容量/权限/系统 | 仅在获准的新根核对可写、容量和共享读取 | 空间不足或权限不符时停止依赖动作；负责人提供满足合同环境。本计划不改 ACL、不删除腾空间 |
| 门 A/B 与产品基线 | 代理准备准确源码/产物、工具、环境、run 和返回 | 负责人绑定具体基线及范围后裁决；技术 PASS 不能自签门 B |
| Win7 | 本轮与工具首轮均 `NOT_PERFORMED` | Win10-only 取证 DLL 不用于 Win7；未来 Win7 验收另按候选合同准备 |

未来远端目标建议仅复用原 Win10 `WIN-2JQ66JE4HTQ` 的身份合同。
主机当前身份、账户状态与可用性未核查，不因历史地址相同确认目标。
新根建议准确字面路径如下，**尚未授权、尚未创建**：

```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-Engineering-Win10-Entry-20261007-R1
```

远端授权需单独列明：严格主机密钥验证的连接、新根独占创建、准确文件上传/展开、
目录内准入执行、已有 csc 受控编译、准确自有观察器会话、普通产品入口、固定请求、
语义或人工点击、证据读取回收及合同内整树停止。
其中管理员取证准入与普通产品运行分开绑定账户和进程身份。
不新增账户、不提权、不改系统策略/ACL/服务/注册表、不安装框架、不改时钟。
不操作任何旧根、HALTED 入口或不属于本轮 pin 的进程。
`remote-actions.py`、sftp/ssh、Computer Use 与历史冻结工具本轮均不执行。

### 6.9 停止、重试和回滚条件

| 触发 | 立即动作 | 恢复或回滚条件 |
|---|---|---|
| 无当前实现批准、分支/范围冲突 | 停相关实现；继续已授权文档核查 | 负责人确定承接任务、准确路径和差异批准 |
| source/ZIP/tool/build/批准不一致 | 保存首失败，停止冻结与派发 | 新不可变版本重新核验；不得修改旧记录补过门 |
| 身份、安全、必需审计、未知生命周期、事件丢失或观察器未结束 | 停全部依赖请求与下游 Gate | 原合同允许的诊断与新入口；HALTED 不恢复，不把后补结果改签旧 UNKNOWN |
| 普通夹具失败且树已证实结束 | 保存原输入与错误；只修获批路径 | 建议新合同非HALT普通phase最多重试1次；点击phase最多3次且限时不变。此建议不新增旧合同权限 |
| 同类失败连续两轮未解释/闭环 | 停该整批重试，做最小复现和共同根因诊断 | 出现新的原因、修复及验证证据后才重新准入 |
| 错选或 Esc/取消、无真实 response | 停点击与下游；原硬门 HALTED | 不在同入口重试错选；负责人裁决新运行。晚到回执只作补充观察 |
| 容量、桌面、权限或运行时缺失 | 停依赖的 Win10 动作；本地回放/文档继续 | 负责人提供可用环境；不自行安装、提权或清理 |
| 新工具需新增 API、C# 源、产品或原生改动 | 停该改动；列精确文件与消费者 | 负责人批准补充范围与 ADR/C15/C16 后恢复 |

回滚是停止使用新工具并保留其首失败及输入。
不删除新根、不恢复 Git 文件、不替换冻结件、不重绑历史 PASS。
回到旧工具只可在新合同允许、旧工具与消费者仍适用时进行。
它是另一次新输入/新 run 的执行，不是恢复旧 HALTED 运行。
安全组件变更不得同窗口热替换；新版本重新取得实际运行时准入。
停止或清理只作用于合同内同 PID+creation 的本轮树，不能仅凭数字 PID 终止进程。

### 6.10 分项成本与交付验收

沿用本任务执行记录及承接任务既有矩阵，不另建成本系统。
每次运行记录 `类别、实际起止UTC、工具/产品/source/run、动作、结果、首失败、恢复条件`。
连续区间只计一次。审批等待、人工就位和机器执行重叠时写清重叠，不能相加为总耗时。

| 类别 | 记录内容 |
|---|---|
| 工具准备/返工 | 派生、准入、自测、修复、回放及共因诊断；区分新能力与同类返工 |
| 产品执行 | 真正启动至对应业务终态；最短链路、每phase与真实收尾分别记录 |
| 审批等待 | 材料可审至负责人裁决；记录具体阻断，不把等待计为产品执行 |
| 人工介入 | 解锁/入口启动/点击/异常处置的次数、起止与原因；负责人动作和代理动作分开 |

指标为首次有效产品结果耗时、同范围重复批准次数、人工介入次数、同类夹具返工次数。
历史没有完整计时的字段记 `UNKNOWN`，不估算或承诺节省比例。
工具 PASS、产品 PASS、门 B 和优化收益分别报告。

后续交付须同时满足：真实入口反例有效；集中生成无旧运行事实；全部消费者双身份一致；
Win10实际运行时准入通过；最短链路及受影响/必跑矩阵完成；真实 response 与收尾可核验；
所有直接/继承/未执行项有绑定；旧候选、工具、首失败、HALTED/UNKNOWN 原字节保持。
未满足的项记 `FAIL`、`UNKNOWN` 或 `NOT_PERFORMED`，按实际事实选择。

### 6.11 本轮计划核对记录与完整参考身份

2026-10-07，本轮只在开发机核对文件与记录。
源码/工件构建、回放测试、Win10准入、普通入口、UI点击、远端操作、Win7及Git交付均 `NOT_PERFORMED`。
不改当前任务状态、实现索引、候选结论或 Accepted ADR。
下列完整值用于复核引用，不能填入未来产品或运行输入。

```text
当前 HEAD: a53c9b9d861486e5923bc82ea70b31b76af1a939
历史 HEAD: 571ec550b5e09611f55557563d0cf2f1a4a40d1b
历史产品 source: 8d207ab11d2c8134a81e4e62900f395aae99944e
历史 ZIP: e96fdf9678ffede770704fa68cfd39ea7ac6bf42ba0c3dd5fd400aa7dd7cd1a0
历史 ZIP size: 101330419；ZIP entry count: 784
历史 manifest: d084907ce7d488f0bf98984b49fe09b6e6d5c86b0c9786db46a33c40e62eda1c
历史 input lock: 7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e
历史 master: fb4adc2b0bd53b8b1dd4e124e2d9a97e37e9ec1d573c25b48504e54adc22366f
历史 admission: 9a60b345bce674658adf79112ae98f422c161fa1f92cbf6aa4758b38e183aafa
历史 matrix: 905c4f4b08a25f45e52fe2bfc93b851994c642d09a16d47ac81ca2563cb93141
历史 capture source SHA: dbc85763ce25287adcb4c853e37963755c56d9561f9d06e41f53bfdb78e952cd
历史 capture DLL: 3f45cc66e7f81c7321bdce4b71338614ceae618d9c0636620a0f47b72d880064
历史 capture MVID: ba25f945-5351-4b90-8ed8-4c8a5f1cfe08
历史 capture build: c5afee88aea36920f7d6a56a35bd136548a993608d5303a034bd6b6ab0a84cca
历史 observer source SHA: 218a2ed353acb0338b0c831f58e3233b3a7802465bffca41535cc62ed9571f78
历史 observer pin: 0f26ff6477cb516b46c93f744fc2e6b713b079d01b6ff96432ae47e26ca23298
历史 observer EXE: 7b34224ac5b423f35cd9b17c88adf5a821a5ea6dd20d5dea759849c3eec0633b
历史 observer MVID: f353033a-3468-44fb-8d44-5ba18d6c3a3d
历史 dispatcher-final SHA: 3a34107c2577655bd1428c4beb94e912f7c738fa5da959ffeafe444b265c26e3
历史 dispatcher-final size: 1444901
```

开发机计划检查 PASS：`node scripts/check_docs.mjs` 检查 206 文件、50 任务；
`git -c core.fsmonitor=false diff --check` 通过；两份文档的相对链接目标、UTF-8无BOM和LF核对通过。
两份文档原有前缀SHA保持；1720项白名单外当前树记录与8849项历史基线无变化。
HEAD未变。保护仅覆盖所登记范围，不扩大为全部历史证据审计。
本轮保护基线在开发机临时目录记录：当前树 1722 项、历史树与选定历史工具/证据 8849 项。
检查覆盖所登记文件的 SHA 或缺失状态，不声称覆盖整个历史证据库。


2026-10-07，负责人选择A＋r4后，准确材料见[ENGINEERING_02](ENGINEERING_02_WIN10_ENTRY_AND_INPUT_BINDING.md)。
该任务为DRAFT_READY_FOR_REVIEW，ADR-0194为Proposed；当前只完成文档。
本任务COMPLETE保持。新实施与执行记录由ENGINEERING_02承载，沿用本节计划，不另建台账。

2026-10-07后续：负责人已准确批准ENGINEERING_02本地范围及ADR-0194。
十路径本地实现与17/17定向检查完成；实际Win10/产品/UI仍NOT_PERFORMED。
当前入口及恢复条件见ENGINEERING_02 §11。上段准备状态保留为历史记录，本任务不重新开放。

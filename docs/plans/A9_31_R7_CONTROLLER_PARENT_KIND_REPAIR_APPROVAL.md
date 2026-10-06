# A9-31：R7新根——控制器父进程种类判断修复与剩余phase续验

日期：2026-10-05。Status: DRAFT_NOT_APPROVED。请求批准§1–5的新根执行与有限修复；本材料尚不构成实现、远端执行或第七根授权。负责人此前对R6合同r2（SHA256 `97d402a37c7f0b8876d2a8c0bb56cedf4ac997c57556fa6f6bda9da5e6a7826f`）的批准及D4（不预授权第七根）**不延伸**到本草案。

## 1. 基线、R6结果与根因

工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`，HEAD `ebda91123e62b225c3fd104c9c9b564a4b61c466`。产品r3 ZIP/manifest/native/锁/capture库、观察器C#源（SHA256 `b949ba520eb103548cfd08a578d76df1d3d48e46089045188dc7b4b1df112a7d`）、driver（含R6的重启实例证据文件名修复，SHA256 `ed7e46ff4cf8d07d65fde1bc062e206b99d2719f3dc75808f5d4091f33d53e66`）字节不变；不恢复R4/R5/R6任何HALTED入口。

R6（master `70578072352f2cb73f5d7b6a6961233355967790d1f0319c0a1a0ad20e1913ab`，矩阵`.acceptance/a9-31-developer/product-r3-retry-r6/win10-evidence-matrix-r6.json`，交接[handoff §10](../reports/2026-10/a9_31_r5_manifest_proof_handoff_2026-10-05.md)）在普通账户（SID1005/Session3/Medium8192/非提升/noJob，直接核验）取得：Boot PASS、Background短PASS（29项）、Background完整PASS（133项）、ready专用负例按设计预期失败（`A9_EXPECTED_READY_FAILURE`，16项0失败，退出码94）、Shell PASS，观察器终态均核对通过、完整回收零不符。**EncodingSecurity HALTED**（累计6/16请求）。

**根因（已直接证实，我方控制器缺陷）**：driver 62项检查通过后遇`conhost.exe`原生错误87（pid 135016，父为被持有的cmd 75368）。观察器记录完整（conhost Start/End、退出码0、Session3、父cmd），但控制器`Resolve-ManifestObservation`用持有树`Binding.Image`判断父进程是cmd还是PowerShell，我假定其为`C:\Windows\System32\cmd.exe`，实际是NT设备路径`\Device\HarddiskVolume3\Windows\System32\cmd.exe`，故`kind`为空直接返回false，缺口未放行→`LIFECYCLE_OBSERVED_CHILD_NOT_PINNED`。R6全部185个真实持有条目的`Image`均为设备路径格式，控制器中仅此一处使用该字段。R6的38项定向检查夹具同样用了`C:\`格式，因而未暴露——测试与实现犯了同一错误。

**修复预验证（只读，非产品证据）**：在R6根下新建临时目录`evidence/r7-prestudy-r1|r2`，用该次真实缺口的真实数据（真实事件文件、真实查询失败记录、真实被持有的父cmd条目、真实ready记录）和捕获库的真实`Gap/Proof/CaptureResult`类，对R6冻结serve文本回放：R6原函数**复现失败**，拟议修复**放行并产出完整proof**，PowerShell设备路径对真实事件放行，盘符形式/其他卷/`..`穿越/后缀拼接/用户目录/UNKNOWN/Electron父进程/坏设备映射/非conhost/错误快照区间等负例守住，`Accept-Capture`端到端放行后不再抛、不放行仍硬停且未解析项仍被报告；17项全部通过（脚本SHA256 `d126c6bc982f7dfa5f4b976f90ae78732df428ac85d382e59ef622941234c2cf`，结果`32350252e3364704c36455bfb5aa58b33a525bfe502a49c966d94ac847686478`，固定夹具位于`product-r3-retry-r6/prestudy-r7/fixtures/`）。这未证明修复在活的phase内有效，也未触及任何其他分支。

R6入口HALTED不恢复，故续验须新根。准确新本地根`.acceptance/a9-31-developer/product-r3-retry-r7`，远端`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261005-R7`，两者须不存在。批准后先在任务书登记准确六源（C14）再实施：`product-r3-retry-r7/control-scripts/{stage-product-r3.ps1,launch-product-r3-desktop.ps1,serve-product-r3-desktop.ps1,product-r3-driver.cjs}`与`product-r3-retry-r7/event-sources/{manifest-process-observer.cs（与R6字节相同拷贝）,launch-manifest-observer.ps1（仅根常量）}`。

## 2. 相对R6的全部变更（仅此）

1. **serve`Resolve-ManifestObservation`**：把`Assert-ObserverReady`调用提前到种类判定之前；`$dev`取自该ready记录的`c_device_mapping`，须匹配`^\\Device\\HarddiskVolume[0-9]+$`，否则该缺口不可放行；父进程`Binding.Image`仅在与`<$dev>\Windows\System32\cmd.exe`或`<$dev>\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`**大小写不敏感精确相等**时才分别判为`cmd`/`powershell`，其余一律`return $false`走原硬门。其后的父绑定、快照时钟、proof校验、5秒等待、proof回执字段均不变。
2. **定向检查**：`validation-manifest`夹具改用真实设备路径格式；新增**真实缺口回放**作为准入输入——把上述17项预验证（夹具取自R6真实证据，hash固定后随输入上传）对R7冻结后的serve文本重跑。新增原则：控制器新逻辑的夹具必须取自真实证据格式，不得自拟。
3. 其余（观察器源、driver、stage/launch、停止握手、采集域、30秒接单检查等）与R6相同，仅根与哈希绑定换为R7；观察器在R7重新编译（新EXE/MVID/pin，不冒充继承），沿用既有10个API，无新增依赖或系统API。不修改产品/native/锁/capture、任何断言、真实对话框规则、SYNC、九字段请求；不修改任何Accepted ADR，批准后另行追加ADR。

## 3. 新根、准入与检查

准备前C空闲≥2GiB（当前约3.49GB，R7根约0.67GB，无需再清理旧根）；根≤1GiB/5000文件，每请求空闲≥1GiB，返回≤128MiB；旧根R1–R6、数据库与全部历史文件保留。观察器准入最多三轮、每轮≤12固定cmd/PowerShell根（沿用）；除conhost外的短命System32子进程出现87仍直接HALT（D2不变）。定向检查全套重跑：schema/api/interval/entry/files-scope/sync-actual/sync-current、Node16锁定检查（含重启证据自检，20行）、package-held、manifest绑定、§2第2点的真实缺口回放。`sync-actual`在R6首次因探针时序竞争失败后用fresh run id通过，R7准备时直接备好fresh变体，每次失败结果保留、至多三次。失败规则同R6：准入/身份/完整性/安全/必需审计/未知生命周期失败停止下游；六源内同范围局部修复以新不可变版本重检；HALTED不恢复。

## 4. 执行顺序与人工步骤

新普通入口一次，120分钟、最多16请求。默认**方案A（待D1）**：仅重跑未完成的五个phase，顺序EncodingSecurity → FailureBoundaries → StopExit → ReleaseExit → **Recovery最后**（唯一从未在Win10真实重启的路径，放最后以免烧掉其余证据）。R6已取得的Boot/Background×2/ready负例/Shell继续作为**R6根上的直接证据**保留（R7控制器与R6仅差§2第1点，该函数仅在conhost 87缺口分支被调用，R6这五个phase均未触发该分支），最终汇总须在报告中标明跨根组合与该差异。方案B：在R7重跑全部八phase共10请求（Boot→Background短→Background完整→ready负例→Shell→EncodingSecurity→FailureBoundaries→StopExit→ReleaseExit→Recovery），无跨根组合。

每请求：观察器就绪（心跳、绑定、self-test、events可读）核验后才发九字段请求；30秒接单检查（未接单立即停观察器）；终态后由代理发停止信号，核对观察器终态、零丢失、会话停止、无遗留实例，以及controller的proof与观察器记录逐条对账。StopExit点“停止后退出”、ReleaseExit点“留给系统后退出”，各限120秒，由负责人在真实对话框点击（本代理会话无可用的桌面控制工具与手机推送，我会在对话中提示），不得注入或伪造选择，不延长限时。启动入口后请勿在窗口内点击；若标题出现“选择”按Esc一次。每phase逐size/SHA完整返回、秘密扫描、SQLite副本检查及输入后飞行；更新统一报告、STATUS与新矩阵r7。

## 5. 失败与边界

任一HALTED保存全部证据，不恢复、不创建第八根，另报批准；若仅Recovery失败，其余证据保留，Recovery单独另报。本批准不含：产品/native/锁/capture修改、系统/账户/ACL/服务/计划任务改动、删除、强制结束旧实例、提交/推送/合并/发布、委派、独立验收、Win7、第八根，不自签DEVELOPER_VERIFIED（取得全部直接证据后向负责人报告，由负责人裁决）。全部Win10结果均**未在Win7实机验证**。新proof此前只在预验证（真实数据回放）和admission探针中证明，普通环境中从未成功放行过一次真实缺口；PowerShell父进程的真实87缺口从未出现过。

## 6. 待负责人裁决

- **D1**：方案A（推荐，仅五个phase，R6五个phase作为R6根直接证据保留并标明跨根组合）或方案B（全部八个phase重跑，约10请求）。
- **D2**：Recovery放最后（沿用，请确认）。
- **D3**：R6遗留入口窗口与Electron进程（107280、77944、42732）由负责人自行处理，代理不结束任何旧实例。
- **D4**：确认不预授权第八根；Recovery或其他phase再失败按§5另报。
- 无P0前置：根因已由真实证据直接证实。批准须按本草案SHA256绑定。

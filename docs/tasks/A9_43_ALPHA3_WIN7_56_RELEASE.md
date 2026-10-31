# A9-43 — v0.3.0-alpha.3（WIN7-56）版本整合、冻结与正式验收

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: RELEASE_REISSUE_AND_WIN7_ACCEPTANCE
Target Branch: main
Source Baseline: 63e173fc90f81c9c5ddcafe3dabf18f03cdbdad2
Phase-Gate: A9_43_IMPLEMENTATION_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0289, ADR-0290, ADR-0304, ADR-0305, ADR-0306, ADR-0307, ADR-0308
```

本任务把 WIN7-55（上一个已签发候选）之后完成的四项工作合成一个版本，走完一次正式流程到发布。
范围按 ADR-0290 登记；门 A、门 B、标签与发布仍逐次由负责人签发。

## 1. 授权

2026-10-29 America/Los_Angeles，负责人两次裁决：

1. 回复“同意推荐的内容”：选定四项合成一个版本走正式流程到发布；现在推送 main，不打标签、不发布。
2. 回复“全部案推荐”：D1～D6 全部采用推荐项，见 §3。

| 范围项 | 内容 |
|---|---|
| 交付结果 | `v0.3.0-alpha.3` 冻结候选 WIN7-56。经门 A、正式执行与门 B 后，发布同一字节产物 |
| 实际分支 | main；执行代理可在工具创建的工作树内实施，由执行代理（主会话）整合到 main |
| 行为边界 | 只含 §2 四项及其冻结前缺陷修复；不新增产品权限、系统配置或依赖；Review 继续 fail-closed |
| 本地提交与构建 | 本地提交、开发构建、双干净构建与冻结在本范围内连续执行 |
| 开发级运行 | Win7 开发通道，预算见 §6 |
| 推送 | main 源码推送已获准；标签与发布另行签发 |
| 停止条件 | 见 §6 |

## 2. 版本内容

| 任务 | 用户可见结果 | 当前证据 |
|---|---|---|
| [A9-34](A9_34_RECOVERED_CLEANUP_DISPOSITION.md) | 重启恢复的“清理未确认”记录可由用户确认处置 | Win7 实机 DEV_CHANNEL |
| [A9-40](A9_40_BACKGROUND_PROGRESS_VISIBILITY.md) | 后台任务进展与结束状态自动显示 | Win7 实机 DEV_CHANNEL |
| [A9-41](A9_41_WORKBENCH_UI_POLISH.md) | 工作台可读性、窄窗口与焦点优化 | Win7 实机 DEV_CHANNEL，随 A9-42 开发构建 |
| [A9-42](A9_42_LIGHTWEIGHT_AGENT_TOOLS.md) | 编辑反馈、环境信息、Skills、ask_user、read_image、Office Lite | Win7 实机 DEV_CHANNEL；真实模型五场景见 A9-42 §8.10 |

四项均包含在开发构建 `cd4a428b…` 中，源提交 `08e41400…`。DEV_CHANNEL 结果只作诊断，不是正式验收。

## 3. 负责人裁决

| 编号 | 裁决 |
|---|---|
| D1 | 版本号 `v0.3.0-alpha.3`，候选号 WIN7-56；新功能与 Alpha 2 遗留义务分开 |
| D2 | 采纳 ADR-0293 拟决定三甲。正式执行也放在 `C:\A9-DEV\run\<run>`，见 ADR-0304 |
| D3 | 拒绝集移到数据文件，由门 A 授权绑定其 SHA-256，见 ADR-0304 |
| D4 | verify:release 中规则检查保持必跑；历史回放有归档就按原哈希回放，没有归档就明确 NOT_PERFORMED |
| D5 | 本版不签正式性能预算，列为已知限制，到 RC 再测 |
| D6 | 开发级运行预算见 §6 |

ENGINEERING_04 其余验收削减建议：E4-2、E4-4、E4-5 延到 RC；E4-6 被 ADR-0289 决定 6 取代。

## 4. 冻结前工作

缺口来源：开发机只读分析 `outputs/next-version-r1/sol/GAP_REPORT.md` §3～§5。

| 缺口 | 处理方 | 阻断冻结 |
|---|---|---|
| verify:release 历史回放与跳过分类 | 执行代理已修复；开发机当前适用检查 PASS，见 §8.2 | 已解除此项阻断 |
| 正式执行驱动不存在；现有驱动写死开发根与 DEV_CHANNEL | 执行代理，按 ADR-0304 先方案后实现 | 是 |
| 拒绝集写在工具字节 | 执行代理，按 ADR-0304 | 是 |
| 版本号、候选号与候选元数据 | 执行代理已改为 alpha.3、暂定 WIN7-56，见 §8.3；冻结前核号 | 是，核号前不冻结 |
| 六项轻量工具与 A9-41 的证据映射 | 执行代理整理覆盖矩阵 | 是 |
| 含界面撤销的完整 Office 流程 | 主会话在全阶段开发级运行中执行 | 是 |
| 同一代码与驱动的全阶段开发级运行 | 主会话操作 Win7 | 是 |
| 双干净构建与冻结 | 执行代理 | 是 |
| 负责人试用反馈 | 负责人；材料 `outputs/next-version-r1/owner-trial/` | 是，试用发现的问题冻结前处理 |
| Win10 同候选完整验证 | RC 前补齐 | 否 |

冻结候选的代码与驱动必须与全阶段开发级运行相同（ADR-0289 决定 4）。

## 5. 冻结后流程

1. 执行代理准备门 A 材料。
2. 独立审核核对门 A 材料一次。
3. 负责人签发门 A，含正式执行预算。
4. 主会话执行正式验收。
5. 独立审核核对正式结果一次。
6. 负责人签发门 B。
7. 负责人批准标签与发布同一字节产物。

## 6. 预算与停止条件

| 项 | 上限 |
|---|---|
| Win7 开发级运行目标机窗口 | 合计 5 小时 15 分钟，最多 4 次窗口（ADR-0308） |
| 开发级运行真实模型请求 | 合计 60 次 |
| 费用 | UNKNOWN，不设金额上限 |
| 正式执行 | 预算在门 A 中另签 |

- 目标机身份、单写锁或安全收尾硬门失败时，停止全部依赖步骤。
- 同类失败连续两轮未闭环时，先做最小诊断，不整批重试（ADR-0169）。
- 超出上表任一预算，暂停目标机动作并请负责人决定。
- 出现数据损坏、凭据泄露、越权或失控进程时，立即停止并报告。

## 7. 已知限制

| 限制 | 来源 |
|---|---|
| 正式性能预算本版不签 | D5 |
| Win10 同候选验证到 RC 前补齐 | A9 总合同 |
| Office Lite 不承诺版式保真、公式重算与宏 | [Office Lite 范围](../plans/A9_42_OFFICE_LITE_SCOPE.md) |
| 完整 Review 未签发，继续 fail-closed | ADR-0096、ADR-0143、ADR-0286 |
| 历史 FAIL、HALTED 与 UNKNOWN 保留，不改判 | AGENTS §2 |

## 8. 执行记录

### 8.1 范围启动（2026-10-29）

- 主会话把 main 从 `6ea0b9af…` 推送到 `63e173fc…`；未打标签，未发布。推送前凭据模式扫描只命中测试合成值。
- 三份只读分析已交付。均为开发机材料，不是验收证据：
  - 冻结缺口：GPT 6.1 Sol。
  - ENGINEERING_04 取舍：Opus 5.5。
  - 负责人试用说明：GLM 5.3；主会话修订 4 处。
- `document_write_copy` 工具说明补一句：DOCX 表格单元格只接受字符串。起因是 A9-42 §8.10 S2 中模型先写数字被拒后自纠正。DOCX 合同未改。开发机 core 定向测试 tools 7/7、office-loop 2/2 PASS，提交 `026a148…`。
- 已派执行代理：verify:release 修复（独立工作树）；正式执行工具方案（只写 `outputs/next-version-r1/formal-tooling/`）。

### 8.2 发布检查修复与方案审核（2026-10-30 UTC）

执行代理在开发机修复发布检查。历史测试夹具提交为 `2d4846f6…`。总入口分类修复接在该提交之后。

| 检查 | 实际结果 | 原始日志 |
|---|---|---|
| 首次完整发布检查 | 409 项，393 PASS、0 FAIL、16 skipped；总入口 FAIL | `outputs/next-version-r1/release-verification/release-r1.log` |
| 分类修复后的完整发布检查 | 409 项，393 PASS、0 FAIL、16 skipped、0 TODO；总入口 PASS，退出码 0 | `outputs/next-version-r1/release-verification/release-r2.log` |
| 工具回归 | 三个脚本 PASS；包含跳过分类及失败阻断反例 | 本轮开发机命令输出 |

16 项未执行保持 `NOT_PERFORMED`。其中历史归档缺失 11 项、旧 RC 包缺失 2 项、目标平台缺失 3 项。执行代理未增加通过计数，也未改判原 FAIL。

独立审核已完成正式工具方案与清点审核。证据为开发机静态审核，绑定 `2d4846f6…`。结论 P0 零项、P1 六项；报告在 `/Users/qlyf/.claude/plans/act-as-the-review-melodic-fog.md`。

执行代理已补正设计 P1-2、P1-4。正式专属授权校验只在本地入口执行。全阶段开发级运行使用正式 Profile；该 ZIP 与同源双构建的 SHA-256 必须相等。清点 P1-1 正在独立工作树补正。

| 未决项 | 当前处理 |
|---|---|
| M1～M6 是否进入本版正式执行 | 2026-10-30 负责人按推荐裁决，见 ADR-0305：留待 RC |
| 三个固定夹具映像的根外终止例外 | ADR-0305 按原范围续期至 2026-11-28T00:00:00Z |
| 门 A 前统一准入是否替代 close 条款 | ADR-0305 采用统一准入；close 只作恢复 |

P6 上机继续停止。开发级运行预算尚未消耗。本轮无目标机连接、真实模型请求、后继推送、标签或发布。

### 8.3 正式打包身份适配（2026-10-30 UTC）

执行代理把正式 batch2 Profile 的身份改为 `0.3.0-alpha.3`、暂定 WIN7-56。改动包括构建 Profile、输入锁、包内运行时启动合同、验证套件说明及相应测试。
输入锁的原生输入、来源、批准登记与 `source_date_epoch` 未变。夹具文件只改顶端发布身份，用例、矩阵、限额与清理未变。

包内运行时只接受 alpha.3 正式身份。历史 alpha.1 与 A9-30、A9-31、A9-32 的 alpha.2 开发合同继续有效。错误版本、发布身份、锁、协议或候选号均拒绝。

| 检查 | 执行者 | 结果 |
|---|---|---|
| 运行时合同 | 执行代理，员工工作树与主树各一次 | 50/50 PASS |
| batch2 打包合同，含三份模拟 ZIP 字节相等 | 执行代理，员工工作树与主树各一次 | 9/9 PASS |
| batch2 验收合同 | 执行代理，员工工作树 | 695/695 PASS |
| 历史打包回归 | 执行代理，员工工作树 | 7 PASS；105 项按名称筛选未执行 |
| Electron 22 / Node 16 身份正反例 | 执行代理，员工工作树 | 16/16 PASS |

以上均为开发机证据。原始日志在 `outputs/next-version-r1/p5-integration/`。Electron 22 下运行 Jest 退出 133，原因 UNKNOWN，不计通过。
三份模拟 ZIP 只证明构建确定性合同，不证明真实产品三次构建相等。真实构建、冻结、Win7 运行与门 A/B 均为 `NOT_PERFORMED`。

本任务书会随正式 Profile 复制进包内合同目录。全阶段开发级运行与后继双构建必须使用同一提交；该提交之后的记录不进入这三份构建。

### 8.4 上机前三项裁决（2026-10-30）

负责人回复“按照推荐继续”，三项见 ADR-0305。续期截止日期负责人未另给，执行代理按常设授权 r2 的截止时间记录，负责人可改短。
已知限制增加：M1～M6 补充组本版不正式执行，留待 RC。P6 上机的裁决阻断已解除，仍须 P1、P2、P4、P5 完成。

### 8.5 P1 执行绑定与拒绝集（2026-10-30）

DeepSeek 执行代理实现 P1，GLM 独立审核结论为 P0 零项、P1 零项。合同见 `outputs/next-version-r1/formal-tooling/DESIGN.md` §5.2.2。
包内完整性检查改为执行绑定 `WIN7_56_EXECUTION_BINDING`，两类别走同一校验路径，`evidence_class` 只写入证据。负责人批准只在候选外的本地正式入口核对。
主会话按审核意见把消耗登记的拒绝集哈希与执行绑定哈希分成两个字段。

| 检查（开发机，主树） | 结果 |
|---|---|
| 授权与拒绝集测试，含缺失、篡改、缩减、命中 | 14/14 PASS |
| batch2 打包测试 | 10/10 PASS |
| Shell batch2 验收合同 | 695/695 PASS |

日志在 `outputs/next-version-r1/p1-review/`。门 A 载荷与回执格式、拒绝集首版种子为 `UNKNOWN`，在门 A 材料中核定。

### 8.6 P2 第一步：候选内 smoke 清理准入统一（2026-10-30）

DeepSeek 执行代理去除 `a9-batch2-smoke.cjs` 按根路径推断开发或正式的分支。两类别使用同一清理准入；根外三映像只限本 run 已绑定实例，身份条件与终止前重读不变。
GPT 6.1 Sol 关键审核：P0 零项，P1 一项。新准入把证据根当成 run 容器根，并要求候选根位于其内，与请求合同的证据外置规则冲突，真实运行必被拒绝。
主会话已修复：准入按真实布局校验 run 容器内同级的候选根 `p` 与证据根 `e`；两者不得互相包含，驱动运行时须在证据根内。测试夹具改用真实布局，并补前缀相似目录、证据根等于容器、候选嵌套于证据根三个反例。

| 检查（开发机，员工工作树） | 结果 |
|---|---|
| Shell batch2 验收合同 | 704/704 PASS |
| batch2 打包测试 | 10/10 PASS |

日志在 `outputs/next-version-r1/p2-review/logs/`。总控迁移（P2 第二步）为 `NOT_PERFORMED`。

### 8.7 P2 第二步：总控迁入 Git 跟踪源码（2026-10-30）

GPT 6.1 Sol 执行代理分三轮把 WIN7-55 正式总控迁到 `scripts/release/validation/win7-alpha3/controller/`，来源与原 SHA 见同目录 `PROVENANCE.json`。补充组按 ADR-0305 未迁移。
两类别目标侧代码同字节，类别只作标签；目标侧不读回执和拒绝集。可变 run 数据走外部 JSON，生成的 PowerShell 与 XML 不随 run 数据变化。准入按 ADR-0305 四条件两类别同跑，close 不在准入与正常收尾路径。
P1 正式载荷按主会话裁决增加四个绑定字段：执行工具清单 SHA、RUN_CONTEXT SHA、PHASE_PLAN SHA 与目标 Session。材料生产入口要求 Git 工作树对闭包干净，否则拒绝。

GLM 独立审核：P0 零项，P1 一项。产品阶段探针仍把观测写到旧 `work\observed\`，新布局为 `w`，真实运行时全部产品阶段会失败。主会话已改为 `w\observed\`，补回归测试，并更新 `PROVENANCE.json`。

| 检查（开发机） | 结果 |
|---|---|
| controller 与 P1 测试，Node 20，主树 | 58/58 PASS |
| controller 同步测试体，Electron 22 / Node 16，员工工作树 | 56/56 PASS |
| PowerShell 2.0/5.1 解析、C# 编译、真实解包、计划任务 | `NOT_PERFORMED`，开发机无对应解释器 |

PowerShell 与 C# 项在 §6 批准的首个 Win7 开发级运行窗口先做最短准入验证。审核报告与日志在 `outputs/next-version-r1/p2-review/`。



### 8.8 P4 驱动与通道收尾（2026-10-30）

负责人要求执行代理接手 P4 收尾。原 DeepSeek 工作树为 `t3-f34d2687`，基线 `bd1b5253…`。
原任务于 13:15:59 UTC 停止，无活动执行。原修改、diff 和失败日志保留；不把其循环检查计为新增验证。
主会话在 `main@41aae717…` 接手 16 个文件。任务相关源码只改 `scripts/win7-dev/`；产品与原生字节未变。
原有三个 release 测试文件及负责人创建的 `workflow.md` 保留，不纳入本次提交。

交付是原 P4 派单的驱动、准备器和通道适配。执行绑定提供类别、source、包身份和 run；目标侧两类别共用布局与校验。
本地总控继续负责正式回执、pin 和拒绝集，目标驱动不签发授权。包按正式 Profile 校验，不把包可验收标记解释成已完成验收。
准备器与克隆的 Electron 应用保留完整相对模块层级，并绑定执行闭包哈希。CMD 入口不再插入 run 数据。
通道 `stop --run <UUID>` 只选择当前 run；`close` 仍为恢复入口，包装器同时响应 run 与全局恢复停止标记。
工具不调用 close 作为正常套件收尾，不扩大根外终止范围。

| 开发机检查 | 直接结果 | 证据 |
|---|---|---|
| 当前七模块依赖编译与静态检查 | PASS | `outputs/next-version-r1/p4-closeout/verify-quick.log` |
| 六个 Node20 测试入口 | 101/101 PASS，0 skipped | 同目录 `node20-r2.log` |
| 不同 run 与类别的执行字节一致 | 定向入口 PASS，配置路径不同但 CMD/代码 SHA 相同 | 同目录 `run-invariance-r1.log` |
| Electron22/Node16 真实部署加载、依赖篡改与绑定反例 | 6 项 PASS | 同目录 `node16-binding-r1/RESULT.json` |
| 当前 Gateway/Core 的 Electron22/Node16 本机 HTTP | 4 项 PASS | 同目录 `node16-direct-r1.log` |
| 真实 Office engine 样本读取与生成回读 | PASS | 同目录 `node16-samples-r1.log` |
| 关键代码独立审核 | P0 零项、P1 两项；主会话修复并定向验证，未重签审核结论 | 同目录 `independent-review-r1.md` |
| 审核修复后 Node20 六入口 | 103/103 PASS，0 skipped | 同目录 `review-fixes-node20-r1.log` |
| 审核修复后 Electron22/Node16 部署与入口守卫 | 8 项 PASS，含两类别实际入口依赖篡改拒绝 | 同目录 `node16-binding-r2/RESULT.json` |
| 错误实现注入 | 省略入口闭包校验、绕过 Git 源绑定两项均使反例失败；源字节已恢复 | 同目录 `mutation-results.json` |
| PowerShell 2.0 解析、任务注册与停止 | NOT_PERFORMED | 开发机无目标解释器，留首个 Win7 开发窗口 |
| Win7 全阶段、完整 Office GUI、正式 Gate | NOT_PERFORMED | 本次仅本地收尾 |

原全目录自动发现日志的 4 项失败未改判。三项把 Electron 专用 cjs 夹具误作普通 Node 测试；
另一项是员工树缺 `state/dist`。正确入口和运行时见 `scripts/win7-dev/README.md`，当前编译后消费者检查直接通过。
六项轻量工具与 A9-41 的最终证据映射、阶段计划接线、准确新包与全阶段运行仍按 §4 推进，不从上述定向通过签为完成。
本轮未连接目标机、消耗模型请求预算、推送、发布或删除。旧工作树和临时产物仅盘点保留。


P4 审核指出两项 P1：A9-3440 未在真实入口核对依赖闭包；两份 prepare 未把执行文件与声明的 Git source 对齐。
主会话已修复。A9-3440 的共用入口、两个 controller 和克隆后均校验原字节绑定与准确执行清单。
两份 prepare 共用 Git blob 比较，同时核对声明源码树与实际运行工具树，复制后再按同一清单核对。
反例直接经过共用真实入口与两份 public prepare，覆盖依赖改变、绑定身份漂移和跨树执行。
主会话另注入两种错误实现；反例均转为失败，随后逐字恢复源码。该结果是开发机修复验证，不冒充独立复审。

审核流程偏差：审核员报告曾误触发带委派的技能，违反本单“不再委派”。
主会话已停止该已完成审核任务的后续及嵌套工作，保留其两项经原代码核对的发现，不增加审核次数。
本次收尾仅完成原 P4 派单的驱动与通道适配。P5/P6 的阶段计划、版本内容覆盖矩阵和全阶段取证仍未完成。


### 8.9 版本阶段与四任务覆盖接线（2026-10-30）

主会话继续完成本地版本材料组装。基线为 `main@a9044ca4…`；保留三个既有 release 测试修改。
产品与原生源码未改，当前修改影响候选外驱动、准备器和版本计划。原 P2 的 10 阶段不改写。

版本计划入口为 `scripts/release/validation/win7-alpha3/version-plan.cjs`。
它使用同一个 source/ZIP/manifest 身份，按以下顺序准备独立新 run；核心目录模板和证据类别规则相同。
分 run 是为隔离数据目录，不新增目标机窗口或单独重置预算。M1～M6 保持留待 RC。

| 版本阶段 | 入口 | 当前必须直接证明的覆盖 |
|---|---|---|
| batch2 | 现有 FULL 总控 | 原 10 阶段、37 用例、67 断言；不改历史判据 |
| background-recovery | A9-3440 普通驱动 | 后台迟到输出、停止与恢复处置、重启保持 |
| portable | A9-3440 portable 驱动 | 正常产品启动、独立数据目录、持久化、正常关闭 |
| office-tools | Office 真实界面驱动 | 六视口/中文长标题/焦点；编辑/环境/Skills/图片；同 run 完整 Office 撤销、取消和独立 postflight |
| real-model | 产品直连真实模型驱动 | S1～S5、准确原件/副本、请求计数、TLS、DPAPI 与独立 postflight |

`journeys/lightweight.cjs` 已接入 Office 驱动的本机 HTTP 序列夹具。它不替换 Runtime 或 State。
Skills 样本正文只在 read 后返回；检查错误元数据跳过、真实环境事实、编辑定位和失败反馈、有界读取、图片默认关闭/显式开启/后续请求释放。
工作台检查直接调用真实 preload 的对话重命名，并检查六个视口、长中文标题和设置关闭后的焦点。
本机文本旅程已经过真实 Runtime/Gateway/Workspace/SQLite；这不是 Win7 或图片解码证据。

准备器同时支持 background-recovery 和 portable，沿用同一包核对与 Git 闭包绑定。
版本计划逐阶段绑定 run UUID、执行清单与包身份；遗漏、错顺序、重复前缀、错包或前阶段收尾 UNKNOWN 均不能推进。
该材料生产器不签发权限、不连接目标机。期限为空的模板不可执行；batch2 的准确窗口与 FULL 上下文仍由原生产器绑定。

当前新增接线及回归：开发机 163/163 PASS，0 skipped，原日志 `outputs/next-version-r1/p5-integration/local-logs/integration-r1.log`。
首轮新测试的导出函数调用错误与返回对象层级错误已定位修正，原日志 version-r1.log 保留。
本轮后续先锁定执行源码，再从独立干净检出准备正式 Profile 开发包；主树原有修改不纳入包。
Win7/PowerShell 实际运行、图片与六视口当前包直接结果、全阶段结果、门 A/B 均为 NOT_PERFORMED。

Node16 直接部署与入口八项、版本计划的五阶段/37 用例解析检查已通过。日志同目录 `node16-binding-r1.log` 与 `node16-plan-r1.log`。
本次普通后台驱动与 portable 使用同一源包复制策略，避免新统一根内产品运行副本尚未建立时直接启动。
原生三个外部 ZIP 已按当前正式输入锁逐个复算：Electron、Runner v26、SQLite 均匹配；见 `input-audit.json`。
这只解除打包输入身份缺口，不提升为新包或 Win7 PASS。

### 8.10 开发包、只读准入与总控入口阻断（2026-10-30 UTC）

版本材料已准备，完整版本运行仍为 NOT_PERFORMED。
P4 交付驱动和通道适配；P5/P6 负责版本编排与直接取证。
主会话此前未在 P4 收尾时完成后两项接入。

开发包绑定干净源码 `a2ac37fd…`。ZIP 为 `2aefd407…`，manifest 为 `867f617f…`。
完整哈希及构建结果见 `outputs/next-version-r1/p5-integration/developer-formal-profile-r1/A9_43_BUILD_RESULT.json`。
开发机逐成员比较 3275 文件一致；当前完整性函数校验通过。
这两项不证明产品装配运行、Win7 或正式门通过。
五阶段材料为 PREPARED_NOT_AUTHORIZED；batch2 尚缺准确 FULL 上下文及本地开发范围绑定。

Win7 只读检查确认主机、SID、活动 agent console session 2、闲置自有 holder、零根内进程和任务。
当前解释器是 PowerShell 5.1.14409.1018，CLR 4.0.30319.42000。
12 份 PS 源和组合入口共 13 项在该解释器解析通过。PS2 实际解析仍为 NOT_PERFORMED。

R1 首次在 10 秒容量扫描处失败。只替换目录枚举的首轮修复仍失败。
定向诊断记录到 9540 个目录、37810 个文件时仍未结束；未据局部统计签通过。
最终改用列表保存目录，并减少逐项重复祖先查询和目录对象构造。
10 秒时限、目录/文件数量界限、20 GB 上限和 reparse 拒绝规则保留。
相同目录下的只读 R1 直接返回完整字节数 `14680360432`。
该结果经过不同 stdin 诊断入口，不能代替总控实际入口通过。
准确 PS SHA 为 `7e9fbce1ff86780fcd8a504d05052ffd23724800c598f96abbf4a1d0112d71ff`。
该字节与 `target-readonly-input-diagnostic-r3/sources.json` 一致。
开发机最终 controller 回归 43/43 PASS，日志为 `local-logs/capacity-final-r1.log`。

总控实际 `-EncodedCommand` / Console stdin 路径仍未返回 R1。
短行正例通过；ReadToEnd、长行和原始字节读取的最小输入均超时。
分片行输入也未取得实际入口结果，试改已撤回。
具体底层原因 UNKNOWN；不增加等待，不进入依赖它的 FULL 或产品阶段。
原始双流、各版本、失败和撤回补丁保存在同一 p5-integration 目录。
下一步只诊断实际 stdin 传递；真实入口通过后再完成工具准入与版本调度。

目标操作全部只读，真实模型请求为 0；未上传或运行产品。
最终只读查询确认本轮诊断进程零残留，时间为 `2026-10-30T15:16:39.465Z`。
预算保守计入首个窗口：从首次 status 的 `14:46:47.883Z` 到上述收尾，共 1791.582 秒。
剩余 9008.418 秒、2 个窗口、60 次真实模型请求；不把只读阶段登记为零耗时。
准确状态为 `target-binding-status-r2.json`；旧 r1 记录保留。
当前容量修复改变候选外工具字节；旧包和旧准备材料不得重绑为此修复的全阶段结果。
本轮未推送、发布、删除或签发门 A/B。

### 8.11 总控 stdin 修复与只读收尾（2026-10-30 UTC）

执行代理已修复总控 stdin 阻塞。Win7 PowerShell 5.1 的实际传输入口完成 R1。
本轮证据只作 DEV_CHANNEL 诊断；完整版本运行仍为 NOT_PERFORMED。
源码基线为 main `d5e4386b…`，实测使用本轮未提交修改。
准确文件 SHA、run、目标身份和预算见 `outputs/next-version-r1/p5-integration/target-binding-status-r3.json`。
下文证据目录均相对于 `outputs/next-version-r1/p5-integration/stdin-fix-r1/`。

原入口使用 Console.In 读取重定向 stdin，与 PowerShell 宿主的输入处理冲突。
最小诊断中，改用 `-InputFormat Text` 的 `$input` 后，短输入和 120 KB 输入及时返回。
总控据此改用文本管道读取两行，再把 JSON 作为参数传入固定源码。
源码 base64、JSON 的两行传输格式不变；运行数据不拼入可执行文本。
入口拒绝缺行、多行、超限、非法 base64 和源码 SHA 不符。
固定源码继续执行原 JSON 格式、目标身份和路径守卫。
SHA256 对象改用 CLR 2.0/4.0 均支持的 Clear() 释放。

| 检查 | 本轮直接结果 | 证据 |
|---|---|---|
| 开发机 controller、authority、deny-set | 58/58 PASS；0 skipped/TODO | `local-tests-final-r2.log` |
| 开发机 Electron 22.3.27 / Node 16.17.1 | 加载及组合入口检查 PASS；与实机源码原字节一致 | `node16-final.log` |
| Win7 PowerShell 5.1 实际传输入口 | 普通输入及约 200 KB JSON 均返回 R1；8 项反例按预期拒绝 | `direct-entry-final/RESULT.json` |
| Win7 PowerShell 2.0 / CLR 2.0 | 已通过 stdin、源码和 JSON 检查并进入 R1；容量扫描返回 CHANNEL_CAPACITY_UNKNOWN | `ps2-r2/runtime.stdout`、`ps2-r2/entry.stdout` |
| Win7 最终只读收尾 | 通道零进程、零任务，锁 inactive；本轮诊断进程零残留 | `target-status.json`、`target-closeout.json` |

实机验证调用真实 `makeTransport → adminCommand → adminScript → R1`。
它未执行 FULL 的授权材料消费、占锁、上传或调度。
8 项反例覆盖重复字段、源码篡改、缺行、多行、超限、非法 base64、错误主机和错误 session。
最终 run 为 `6d33bc01-382a-4197-b3aa-91bbfa295276`。
组合源码 SHA 为 `845bf86b…`，总控文件 SHA 为 `4a917e13…`。
目标仍为 `192.168.1.9` / `DCCS-CHAIZL-PC`，普通 agent console session 2。
两项 R1 均取得完整通道字节数 `14680360432`。

PowerShell 2.0 的容量扫描缺口未修复，未放宽 10 秒限时。
不得据 PowerShell 5.1 的结果宣称 PowerShell 2.0 完整 R1 通过。
首次非法 base64 错误码过滤失败、CLR 2.0 Dispose 失败及容量失败均保留。
修复后的通过结果不改判这些历史记录。

本轮目标动作全部只读，真实模型请求为 0。
第二窗口从 `15:24:46.703Z` 至 `15:37:17.201Z`，计入 750.498 秒。
连同首个窗口，累计 2542.080 秒；剩余 8257.920 秒、1 个窗口、60 次请求。
窗口已关闭；没有上传、运行产品、关闭他人锁或删除目标文件。
本轮产物与既有工作树只读盘点后保留，见 `retained-artifacts.json`、`worktrees-retained.txt`。

下一步按当前源码重新准备准确 FULL 材料，再完成后续工具准入与五阶段运行。
旧开发包及旧准备材料保留，不重绑为本轮工具修复的全阶段结果。
正式门 A/B、推送与发布均为 NOT_PERFORMED。

### 8.12 首轮 FULL 与本地账号绑定修复（2026-10-30 UTC）

第三个开发窗口已于 `15:55:13.975Z` 开始，共同截止 `18:11:32.708Z`；沿用剩余 8257.920 秒和 60 次真实模型请求，不重置预算。
干净源码 `bb00bb8576ef8b9372026a557529b08b481aaac1` 的开发包 ZIP 为 `06998f724a483c0e7c8605b9283f31f13809e19731c5590d61f732ac89757a4d`。
新五阶段材料、包内真实授权校验器检查完成。Win7 PS2/PS5.1 各直接解析 13 项源码通过；PS2 完整 R1 仍未通过。
FULL run `a1c0c3e8-4d73-4d0a-84eb-d76bc6906cf0` 在 R0～R5 完成后，于 p01 环境断言 `B2-G0-ENV-A02` 失败，原结果保留 HALTED。
真实解包与 C# 调用、普通 agent InteractiveToken 调度已执行。取证及收尾 R7/R8 PASS：零残留进程、零任务、锁 idle。
证据为 Win7 DEV_CHANNEL，目录 `outputs/next-version-r1/controller/a1c0c3e8/`。

原因是候选外请求生成器写入短账号名 `agent`，而未变更的产品断言严格比较 `主机名\\agent`。
实际 SID、Medium、非提权、session 2 和非 Job 事实一致。此次只修正请求生成与消费校验的完整账号名；不放宽身份门，不改产品和原生代码。
开发机 controller/authority/deny-set 59/59 PASS，0 skipped；新增用例调用真实产品环境断言，覆盖短名、错主机、错账号、SID 与 session 反例。
保留首次 CLI 测试后缀错误日志；正确入口结果为 `outputs/next-version-r1/p5-integration/local-logs/account-binding-r2.log`。
本地取证回放只用于定位，不代替新 run 的实机证据。修复后须以新源码、新包和新 run 推进；后续四阶段仍 NOT_PERFORMED。

第二轮 run `44fda738-a25c-4db4-9d8c-adb4ba455c61` 绑定源码 `4192b5e…`、ZIP `18056bd2…`。
R0～R5 完成；目标请求签入前在 `ACTIVATION_DEADLINE` 停止，未重入产品断言。
本地执行起点为 `16:07:53.604Z`，激活写入为 `16:07:53.723Z`。目标新进程错误地使用后者重算截止点，造成 119 毫秒不一致。
原较长预算被共同窗口截止截断，掩盖了该错误。本次改为从已锚定激活记录读取准确 `execution_started_at_utc`，并继续核对锚点、开始范围和截止点相等。
不扩展窗口、不增加容差。开发机 60/60 PASS；真实 consume 反例模拟独立目标进程丢失内存状态和延迟激活。
日志 `local-logs/activation-clock-r2.log`；首次 run 证据仍在 `outputs/next-version-r1/controller/44fda738/`。
该轮 R7/R8 PASS，零任务/进程、锁 idle；真实模型请求仍为 0。继续以新不可变源码、包及 run 复验。

第三轮 run `2273b7b4-011e-4a21-9f86-05c803ff135a` 绑定 `1b96a6a…`、ZIP `1ae7634e…`。
p01 环境阶段直接 PASS，验证前两项修复；p02 模块加载 PASS，但完整性校验因 `A9_BATCH2_ZIP_FILENAME_INVALID` 停止。
总控迁移把上传包改名为 `candidate.zip`，违反未改变的包内原发布文件名合同。
本次统一上传、解包和请求使用绑定的 `zip_top + '.zip'`，不修改产品完整性判据。真实请求入口反例直接调用包内 ZIP 校验器的文件名守卫。
开发机 60/60 PASS，0 skipped，日志 `local-logs/zip-name-r1.log`。R7/R8 已直接通过，第三轮零任务/进程、锁 idle。
所有三轮失败保留，未将 p01 与旧包证据拼成完整通过；第四轮需新源码/包/run。

### 8.13 batch2 直接通过与后台恢复取证修复（2026-10-30 UTC）

开发包源 `f54e62163132e1455658eeff11d8b3e7385d87dc`，ZIP SHA-256
`f3c9fce9c1fb973faae41548fe46bc9698f4701d74cbea051041a8521899f65c`。
Win7 DEV_CHANNEL run `77091fbc-394b-4978-aec5-cd5fc97fd0c0` 的 10 个产品阶段、GPU gate、37 个用例和 67 个断言直接 PASS。
R7 校验回收 1584 个文件，另 233 项按既有合同排除；R8 零进程、零任务、锁 idle。
完整报告复核位于 `outputs/next-version-r1/controller/77091fbc/LOCAL_REPORT_VERIFICATION.json`。
此前三轮 HALTED 均保留；本结论不是正式门 A/B，也不覆盖后续四阶段。

后台恢复 run `13ad75ee-9334-4627-94fc-2afa7cbbff7a` 绑定同一包。
progress、interrupt、recover 的功能检查完成；recover 收尾于 `16:52:25.103Z` 报 `PROCESS_CURRENT_IDENTITY_UNKNOWN`，整阶段 HALTED，reopen 未执行。
末次成功观测记录两个 `C:\Program Files (x86)\SogouInput\SogouExe\SogouExe.exe` 实例仍阻断；准确失败瞬间的身份缺失对象为 UNKNOWN。
`SGTool.exe` 已按 ADR-0297 分类；本次不扩展环境进程豁免、不终止根外进程。
后补只读核对时相关 PID 全部不存在，通道零任务/进程、锁 idle；不据此改判原失败。
原结果与复查位于 `outputs/win7-dev/alpha3-r5/background-recovery/RESULT.json` 和
`outputs/next-version-r1/p5-integration/background-closeout-r5.json`。

本地最小修复只补取证：`remainingInstances` 在身份缺失时附带原实例及当前失败行，后台与便携控制器保存到 HALTED 报告。
仅保存 PID、父 PID、创建时间、映像、来源、会话及名称；不保存命令行。身份未知仍立即失败，等待上限和环境分类不变。
开发机定向测试 13/13 PASS，含旧/新观测区分及命令行排除；日志 `local-logs/process-identity-evidence-r1.log`。
下一步先以新不可变源码、包、run 做一次后台恢复诊断；不重跑整批，不把诊断替代五阶段版本运行。
继续受第三窗口共同截止、20 GB 开发根与 60 次真实模型总预算约束。便携、Office 完整流程和真实模型阶段当前 NOT_PERFORMED。

负责人随后明确批准逐个删除三份失败运行的上传 ZIP 副本：
`C:\A9-DEV\run\a1c0c3e8\w\package\candidate.zip`、
`C:\A9-DEV\run\44fda738\w\package\candidate.zip`、
`C:\A9-DEV\run\2273b7b4\w\package\candidate.zip`。
逐项重新核对本地恢复包、远端 SHA/大小、独占锁及零任务/进程后删除；总逻辑字节 333523249，远端位置均已复核不存在。
失败报告、解包目录、本地恢复包均保留；不从逻辑字节推断实际物理空间释放。
末次 status 的开发根为 17146635113 字节，锁 idle；记录 `outputs/next-version-r1/p5-integration/uploaded-copy-cleanup-r1.json`。

负责人明确回复“批准本次 A9-43 使用 24 GB 上限”。本次开发窗口容量可调整到 24000000000 字节；50 GB 最低剩余、第三窗口共同截止与 60 次真实模型总预算不变。
容量投影含诊断和新五阶段的保守预留为 23576666923 字节，记录 `capacity-proposal-r6.json`；这是预估，不是当前用量。

### 8.14 后台单阶段复验与容量例外验证（2026-10-30 UTC）

新诊断包源 `b0c13455841333cdf449e7766de98f8c82577df8`，ZIP SHA-256
`cf3d065d5001d2e70a4e16dfa8e4c9cfaf78b3bc947fd75c831f93ee88c04710`。
与 §8.13 包相比，产品/原生文件字节一致；包内变化限于 manifest、kit、SBOM 和本任务合同。
候选外驱动只增加失败身份取证，不改变身份门、SGTool 分类与等待上限。
首次部署材料 `d6436091…` 因临时调用器传入绝对上传路径被本地 `REMOTE_PATH_INVALID` 拒绝；未上传该 run、未启动产品，失败后状态零任务/进程、锁 idle。
修正调用器相对路径参数并验证路径往返后，使用新 run `56bf7b0b-8651-466e-8912-c60984e2444b`。
产品执行为 UTC `17:19:04.319Z` 至 `17:19:46.541Z`；progress/interrupt/recover/reopen 四模式直接完成，6 次本机夹具请求、0 真实模型请求。
报告 `DEV_CHANNEL_COMPLETE`，四模式均完成进程收尾；正常退出的工作区锁清空，恢复及重开无模型重放、无重复处置。
独立通道 status 零任务/进程、锁 idle、无解包未知；开发根 18057759557 字节，仍低于原 20 GB。
证据：`outputs/next-version-r1/p5-integration/background-diagnostic-r6b/execution/diagnostic-report.json` 与
`outputs/win7-dev/alpha3-r6b/background-diagnostic/RESULT.json`。
本次未重现首次身份缺失，准确根因为 UNKNOWN；取证缺口已修，不宣称首次异常根因已解决。
这是新包单阶段诊断，不能与旧源 batch2 拼接成五阶段通过。

ADR-0306 容量例外已实现。开发机 channel/controller 86/86 PASS；Win7 PowerShell 2.0/5.1 分别直接完成 9 项边界检查，未启动产品或写目标文件。
准确 holder/开始边界/截止前允许 24 GB，其他 holder、大小写差异、窗口外及总控截止越界仍为 20 GB。
新增量越界和最低剩余空间保持拒绝。证据 `local-logs/capacity-scope-r1.log` 与 `capacity-admission-r1/RESULT.json`。
完整新版本五阶段尚未执行；本地继续准备，是否延长当前窗口另由负责人明确决定。

### 8.15 容量变更收尾与后继完整批次的预算阻断（2026-10-30 UTC）

ADR-0306 实现已本地提交 `e93b78d13aeb266b9ddbe5706f62ece5d3405add`。
干净源码 r7 开发包 ZIP SHA-256 为 `80a70e641203923096564e23275e87041508177b04b3225fecf61b541857a63e`；新包自身完整 ZIP、目录与真实包内授权校验器检查 PASS（开发机）。
五阶段绑定材料位于 `outputs/next-version-r1/p5-integration/prepared-version-r7/`，计划 SHA-256 为
`7e13341d2777dfbe3feac086c6e2ec0fbed99ebe7cd83add6b7530f0afb77f0d`。
本包 Win7 产品运行 NOT_PERFORMED，不继承旧源的阶段 PASS。

FULL 材料生成在原共同截止下返回 `RUN_CONTEXT:WINDOW_BUDGET`，未产出执行授权，未启动新批次；原失败日志 `local-logs/prepare-full-r5.log` 保留。
该检查拒绝 6600 秒技术上限大于剩余窗口，不通过改写截止或删减用例绕过。
本地已准备有直接时长依据的后继预算提案：保留 37 用例/67 断言、10 产品阶段和 GPU gate；batch2 技术预算 4110 秒，包含 300 秒收尾预留。
各阶段上限仍高于本轮直接测得的完成时长，上传/解包按本轮实际记录保留余量；不是已执行结果。
提案 `execution-extension-proposal-r1.json` 请求第三窗口延长 2700 秒至 UTC `18:56:32.708Z`，合计预算 13500 秒，仍最多三个窗口及 60 次真实模型请求，24 GB 例外同步截止。
负责人尚未批准时间变更；原 UTC `18:11:32.708Z` 截止继续生效。阻断完整上机批次，其余本地准备已完成。

最新只读状态和连续计时预算见 `target-snapshot-r7.json`、`budget-snapshot-r7.json`；等待负责人期间窗口继续计时，不重置额度。
本轮本地产物只读盘点见 `retained-artifacts-r7.json`、`worktrees-retained-r7.txt`；全部保留，未新增删除。

### 8.16 负责人批准延长当前窗口（2026-10-30 UTC）

负责人对 §8.15 准确提案回复“批准”。第三窗口截止为 UTC `18:56:32.708Z`，总预算 13500 秒；24 GB 例外同步截止，仍最多三个窗口、60 次真实模型请求。
旧窗口记录与失败材料保留；新执行记录使用 `execution-window-r4.json`，沿用原开始点与前两窗口计时。按 ADR-0307 更新范围后，用新不可变源码、包及五阶段材料继续。

### 8.17 大开发根容量扫描的真实入口修复（2026-10-30 UTC）

延期后源 `45a0a8cb…`、ZIP `0f037c3f…` 的 run `83fdcbae…` 在 R1 返回 `CHANNEL_CAPACITY_UNKNOWN`，未上传包、未启动产品。
R7 因尚未取得 run 锁而失败；R8 直接确认零任务/进程、锁 idle。原 HALTED 保留于 `outputs/next-version-r1/controller/83fdcbae/`。
同一 10 秒扫描在受控诊断中已读 12373 个目录、65804 个文件、17906616907 字节，仍未遍历完；不是空间或数量越界。

最小修复把目录遍历移到已有 CLR 中，使用 Win7 原生 `FindFirstFileW`、`FindNextFileW`、`FindClose` 直接读取 Unicode 文件名、属性与逻辑大小。
保持 10 秒、65536 目录、262144 文件、逐项 reparse 拒绝和适用容量上限；根和祖先仍经 Safe 检查，句柄在 finally 中关闭，枚举错误 fail-closed。
代码随固定总控源码绑定 SHA，不引入安装项、产品依赖或原生重建；使用 Win7 已有 kernel32/CLR 编译能力。
CLR 编译临时文件限定在 `C:\A9-DEV\.channel`，不创建 run 根或修改产品；该准入含工具编译临时写入，不将新检查描述为目标零写入。
另修本地 R1 预计占用检查遗漏的固定 20 GB 条件，同步采用已批准的准确 holder/窗口 24 GB 例外；50 GB 最低剩余和 2 GiB 预留不变。

实际总控 stdin/JSON/R1 入口在 PS2/CLR2 与 PS5.1/CLR4 分别于 2.728、3.127 秒完成，完整字节数均为 18057759750，与独立通道状态一致。
两解释器分别执行超字节、零时间、目录数和文件数四个拒绝反例；全部拒绝。开发机 controller 定向 46/46 PASS。
证据 `capacity-scanner-admission-r3/RESULT.json`、`local-logs/capacity-scanner-local-r1.log`；两轮受控诊断原失败日志保留。
修复后使用新源码、包和 run 继续，不复用失败 run。

### 8.18 r9 三阶段通过、Office 停止与窗口收尾（2026-10-30 UTC）

本轮实际源码 `35ad300144973a81703bfbe745ed0043e41d6323`，ZIP SHA-256
`1569a0a454b2337483269e87705bdf0f9ff525c87b384a60f1e2a6222df31d46`。
五阶段计划仍保持顺序与完整判据；实际完成前 3/5，未形成版本完整通过。

| 阶段 | run | Win7 DEV_CHANNEL 结果 |
|---|---|---|
| batch2 | `40bc6c06-bb1f-4448-95ae-60f82faecb8e` | PASS；10 阶段、37 用例、67 断言、GPU gate；1584 文件回收校验、R8 零任务/进程、锁 idle |
| 后台恢复 | `4c14cff0-33d7-4c4d-8a0c-a6d737d0e93b` | PASS；四模式与独立收尾通过，首次身份缺失未复现 |
| 便携 | `9000ba76-5dde-4c99-9b14-aae2d56973eb` | PASS；隔离数据、Read Only、对话持久化及独立收尾通过，截图已核对 |
| Office 完整旅程 | `bf804776-f69d-4774-90b6-b3b4000353ae` | HALTED；UI 首失败 TIMEOUT_VIEWPORT；控制器失败 PROCESS_OBSERVATION_FAILED |
| 真实模型 | `176cf6ca-4d43-4dc7-886a-e50040343e65` | NOT_PERFORMED；被前阶段阻断，未启动 |

后继部署复用了绑定提交的原生目录扫描辅助代码；代码来源 SHA 和生成脚本 SHA 写入各 deployment-manifest。
前置就绪查询不重复统计根占用，明确记录 null；部署前完整校验现占用、预计新增和最低剩余空间，后置仍采集完整 status。
本轮全部真实模型请求为 0；夹具请求不计入真实模型。

最后目标 status 于 UTC `18:53:22.344Z` 返回：零根内进程、零任务、锁 idle、无解包未知；开发根 21509578163 字节，C: 剩余 870598696960 字节。
三窗口累计计入 13230.449 秒，低于 13500 秒；本轮目标动作已关闭，剩余时间不自动授权新窗口。
源包、失败报告和全部证据保留；汇总 `outputs/next-version-r1/p5-integration/VERSION_R9_RESULT.json`，窗口记录 `execution-window-r4-closeout.json`。
正式门、冻结、双干净构建和发布仍 NOT_PERFORMED。

### 8.19 Office 驱动视口修正与失败取证补齐（2026-10-30 UTC）

保留原 `failure.png` 和两个独立失败原因；原控制器未保存进程观测错误细节，准确原因仍 UNKNOWN。
在相同 Electron 22.3.27 / Node16.17.1 与产品窗口配置下，独立几何诊断复现：调用 `setMinimumSize(0,0)` 后仍受原最小窗口约束；1079×540 实际为 1079×582，800/780 宽实际为 844。
改用非零最小尺寸后，六个请求视口全部精确达到目标；不删视口、不改几何判据、不改产品最小窗口设置。
这是窗口几何诊断，不是修正后 Office 完整旅程通过。
证据位于 `outputs/win7-dev/alpha3-r9/geometry-probe-r1/RESULT.json` 与 `geometry-probe-r2/RESULT.json`。
第二诊断首次因重复任务名被拒，未启动进程；以新任务名完成。原拒绝记录保留。

本地实现将轻量旅程的最小尺寸覆盖改为非零值；Office 观测器额外保存首个错误代码、相关原/当前实例和 UI 首失败。
只保留 PID、父 PID、创建时间、映像、来源、会话及名称，最多 128 个实例；查询失败记 null，不保存命令行。原硬门继续 fail-closed。
开发机 Office/版本定向测试 20/20 PASS。修正后完整 Office 与真实模型为 NOT_PERFORMED。

建议下一轮先定向验证 Office，成功后再用最终同一源码/包执行五阶段，避免在已知驱动失败下整批重跑。
新窗口与空间提案为 `next-window-proposal-r10.json`：90 分钟新窗口、累计不超过 18900 秒/4 窗口、真实模型仍累计最多 60 次，开发根建议 30 GB。
当前 21.51 GB 加一次 Office 复验及全阶段保守预留为 28.78 GB；50 GB 最低剩余不变，保留所有历史证据，不计划额外删除。
该提案未批准，不自动开放目标执行或改变当前已批准上限。

修正已本地保存为 `384dd6f541f8102e77f3015d7196cb73651f9612`。
新干净源码包 ZIP SHA-256 `325614bac1171d502c6ed14b0efe2932def5d5321a31329cf1b788ebbecc95cd`，字节数 111180891；真实包内完整性入口在开发机 PASS。
五阶段材料 `prepared-version-r10/` 已准备，计划 SHA-256 `417e4d555bacc57049b805822a9779cce03168e438484508b760be91c2a67c40`。
材料为 PREPARED_NOT_AUTHORIZED，期限为空；当前预算已关闭，不生成可执行 FULL 授权。新包目标运行 NOT_PERFORMED。
本地只读产物盘点见 `retained-artifacts-r10.json`、`worktrees-retained-r10.txt`，全部保留；原有三个用户测试文件哈希未变。

### 8.20 第四窗口授权（2026-10-30 UTC）

负责人明确批准 §8.19 的准确后续提案，见 ADR-0308。先 Office 定向复验，再同源五阶段。
从本地准备锚点 `2026-10-30T23:45:35.980Z` 保守计时至 `2026-10-31T01:15:35.980Z`，5400 秒；累计上限 18900 秒/4 窗口，已耗 13230.449 秒/0 真实模型请求。30 GB 例外同步生效，50 GB 最低剩余不变。
记录 `execution-window-r5.json`；不覆盖前三窗口及失败证据。

### 8.21 第四窗口 Office 定向失败与两项实际根因（2026-10-31 UTC）

第四窗口入口 PS2/PS5.1 实测均通过；开发机授权/通道/版本检查 91/91 PASS。源 `a827c749…` 的新包在开发机通过完整性入口。
首部署 `48e1e4ed…` 因临时容量脚本 `$d` 与通道参数 `$D`（PowerShell 不区分大小写）冲突，在产品启动前拒绝；失败后零任务/进程、锁 idle，原记录保留。
修正变量后以新 run `6bffdd26-bf94-4e0d-aab2-63e097d7b92e` 运行，保持 HALTED，未推进五阶段。
新取证直接显示：UI 在窄屏导航抽屉已打开时再次点击被遮挡的 `#open-navigation`，返回 UI_ACTION_OCCLUDED；控制器观察到完整创建时间/会话2、PID6480/cmd.exe 但映像为空的 WMI 行，报 PROCESS_CHILD_IDENTITY_UNKNOWN。
旧轮进程异常仍 UNKNOWN，不反向补签。

本次修正仅限外部夹具/取证：导航按实际开闭状态操作，等待设置按钮真实命中，在下一视口前通过可见入口关闭抽屉；保留六视口、焦点和几何断言。
空 WMI 映像使用只读原生实例查询，完整来源、权限、时限与拒绝条件见 ADR-0309 及 WIN7_CONSTRAINTS。
创建时间漂移、访问拒绝、查询未知和错会话仍停止；不是 cmd.exe 豁免。Office 与真实模型共用此查询。
Win7 Electron22/Node16 的独立查询测试直接确认当前实例映像/会话、错创建时间拒绝和同实例句柄已退出事实；报告 `outputs/win7-dev/alpha3-r11b/native-query-admission-r2/RESULT.json`。
首个查询测试发现 Unicode 封送声明遗漏并拒绝，原日志保留；修正后 3 项直接通过。开发机 Office/真实模型/版本定向检查 43/43 PASS。
源码仍需新包、新 run 复验完整 Office；全部真实模型请求至此为 0。第四窗口截止不改变。

### 8.22 导航动画最小复现完成（2026-10-31 UTC）

完整 Office run `da0aee95…` 再次在导航切换 UI_ACTION_OCCLUDED 停止；控制器改为 UI_INCOMPLETE，本轮没有进程观测失败，原结果保持 HALTED。
失败截图显示抽屉在关闭动画中覆盖了导航开关；仅检查 open 类不足以证明开关可点击。修正为按原 5 秒上限等待实际 elementFromPoint 命中，再通过真实鼠标入口点击，不绕过遮挡判据。
暂停完整旅程，使用相同产品入口做六视口和导航/设置/焦点的最小诊断。前两次诊断分别缺少窗口可见等待、权限对话框等待，原失败保留；补齐正式入口的对应等待后，`navigation-probe-r3` 六视口全部直接完成，正常退出，0 真实模型请求。
原始报告 `outputs/win7-dev/alpha3-r12/navigation-probe-r3/RESULT.json`，本地 Office/版本定向 21/21 PASS；该结果不替代完整 Office。

# A9-43 — v0.3.0-alpha.3（WIN7-56）版本整合、冻结与正式验收

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: RELEASE_REISSUE_AND_WIN7_ACCEPTANCE
Target Branch: main
Source Baseline: 63e173fc90f81c9c5ddcafe3dabf18f03cdbdad2
Phase-Gate: A9_43_IMPLEMENTATION_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0289, ADR-0290, ADR-0304, ADR-0305
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
| Win7 开发级运行目标机窗口 | 合计 3 小时，最多 3 次窗口 |
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

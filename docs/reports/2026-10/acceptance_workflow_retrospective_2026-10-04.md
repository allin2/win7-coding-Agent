# Win10 构建与验收返工流程复盘

日期：2026-10-04。性质：文档复盘，不是新的产品/Win10/Win7验收。
负责人要求总结问题、改进流程并作为后续规范；对应
[增量验收与发版工作规范](../../acceptance/ACCEPTANCE_AND_RELEASE_WORKFLOW.md)和 ADR-0169。

## 1. 结论与纠正

已核对引用聊天“检查项目后续推进计划”（`01a0f2ed-503a-78e3-bd33-0a8250541e8b`）、
A9-31 工作树的失败/修复记录、现有增量矩阵和 R3/R10 合同。多次可避免返工有直接记录，
但没有完整工时统计，不据此声称某个时间占比或节省比例。

- R1～R10 主要是外部控制器/取证/夹具修订，不是十次产品原生重建。
- 必需归属审计失败和生命周期未知按合同停止是有效保护；问题在进入长流程前没有稳定相应工具，
  以及后续反复暴露同类集成缺口，不能通过忽略未知或削弱审计提高通过率。
- 同窗口增量重试已经存在：R10在同一控制器中修复慢消费者夹具并取得70项编码检查通过。
  因此优化应优先复用，不能重新建设一套调度系统。
- 开发运行也需要不可变输入/证据。应减少无关重建、重复审批和整套重冻结，不能取消运行追溯。
- 路径修复已提交到 `898ee9459a9b987840e94ddef336556ea58dd389`；本地修复通过不代表新包实机通过。
  本次复盘未执行任何远端或产品测试，不重判历史结果。

## 2. 问题、证据与防复发措施

| 问题 | 已核对事实 | 后续措施 |
|---|---|---|
| 测试工具先于产品失败 | E1合法请求中的pin_sha256被正则漏计；E2用Electron虚拟fs做物理ASAR校验 | 新改工具先在实际运行时验证解析、读取和调用 |
| 取证模型未稳定 | E3创建时间超过snapshot结束206ticks，严格时间门停止；此前短命进程也造成缺口 | 先做短命/时钟/同实例最小探针；同类两轮未闭环则停止整批重试 |
| 模拟抹掉被测差异 | E4既有State测试使用/w，Shell把canonicalizer替换为identity | 保留真实路径/状态/审计实现，尽早跑Windows最短真实链路 |
| 使用旧生成产物 | E5两个旧场景因历史Runner dist失败；重编后117项Shell检查通过 | 依赖构建前置，验证实际加载字节，打包按绑定源码生成 |
| 测试期望错误 | E4要求700ms串行回调在固定5000ms排空预算内正常完成 | 预算内正例与超预算失败分开；不改产品预算迎合夹具 |
| 回收链遗漏输出规模 | E4停止包装因默认64KiB上限拒绝736167字节final，另行回收补充 | 新改回收器检查实际结果上限和原始字节返回 |
| 产品和工具身份混淆 | E6把批准kit登记编号与native revision要求相等，记录器修复即可，无需重编 | 分别绑定产品/原生/夹具/取证版本；按影响决定重建 |
| 合同切片放大交接成本 | R3已允许同范围driver修复，安全组件则精确冻结；新源码提交合同又明确排除打包 | 新合同提前覆盖可预见同范围迭代；已批准动作不重复求批，范围改变仍走原门 |

R10正常Boot 8项、Shell 22项、编码70项通过，Background首启动失败；随后四组未执行。
Windows展示路径与canonical路径不一致的因果判断结合现场DB、包内方法及本地受控复现；
现场未直接记录State原异常，不能把受控异常冒充Windows原日志。E5修复三处同类路径问题，
记录State82项、Shell117项本地通过；未变化native输入不要求重新原生双构建。

## 3. 采用顺序

1. 立即在已有授权内采用：先构建依赖、真实组件测试、普通夹具同窗口增量重试、准确分类首失败。
2. 下一执行合同明确：关键产品链路优先、受影响矩阵、取证组件版本及停止/重试范围；
   固定顺序或冻结边界的调整取得原合同要求的批准后执行。
3. 稳定候选后完成任务规定的目标平台验收、独立复核和发布；原始事实不覆盖、正式产物不临时重建。

这些改进是工作规范，不是实现新脚本、改变系统权限、提交、发布或当前A9-31新包执行的批准。

## 4. 复盘来源快照与检索

2026-10-04读取的证据工作树为
`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，
分支`codex/a9-31-background-tools`，HEAD为`898ee9459a9b987840e94ddef336556ea58dd389`。
该工作树有未提交历史报告；以下SHA绑定本次实际读取字节，不声称全部报告已包含在该提交中。
路径均相对该证据工作树。原始机器记录按各报告指向的`.acceptance`索引检索；
本报告只保存复盘摘要及检索依据，不复制/改写原报告和原始证据。

| ID | 报告路径与相关章节 | 本次读取SHA-256 |
|---|---|---|
| E1 | `docs/reports/2026-10/a9_31_product_r1_controller_first_failure_and_r2_repair_2026-10-03.md`，原因与修复 | `72d217701d73e517aa8bec9619ff8b0d88d11b68013dd54c4a220994e93b9f61` |
| E2 | `docs/reports/2026-10/a9_31_product_r1_r2_boot_asar_failure_2026-10-03.md`，原因与本地修复 | `867dad42a7f97b2900b74c87d181a80442d5186703f4cd3e6430dc8db4e3c757` |
| E3 | `docs/reports/2026-10/a9_31_r9_desktop_partial_pass_and_clock_boundary_halt_2026-10-04.md`，首失败与原因边界 | `020f9aa70afcd2bddd034b1eab7324759c406b9aa2c70ee66eaa95a9aaa7b759` |
| E4 | `docs/reports/2026-10/a9_31_r10_partial_pass_and_windows_ownership_failure_2026-10-04.md`，§2–4 | `f935fa0359bbe2258382df9de5ad3cbe2ef32327ae808b24c4d37f1a06b8d7be` |
| E5 | `docs/reports/2026-10/a9_31_windows_workspace_ownership_local_repair_2026-10-04.md`，§2–4 | `8cf020327a0d7eaca9fb14d5789b1725d63e79d70a1662f66ced8121479c382f` |
| E6 | `docs/reports/2026-10/a9_31_managed_r3_native_double_build_return_2026-10-03.md`，记录器修复与验证 | `ece6b8402430a55c939abbfa11c08110175667544ff3f61dcb328d655218b030` |

流程合同来源：同一工作树的`docs/plans/A9_BATCH_2_INCREMENTAL_VALIDATION.md` §1–6、
`docs/plans/A9_31_PRODUCT_R1_R3_REUSABLE_DESKTOP_APPROVAL.md` §2–5、
`docs/plans/A9_31_PRODUCT_R1_R10_PRECISE_UTC_CAPTURE_APPROVAL.md` §2–4，
以及`docs/plans/A9_31_WINDOWS_WORKSPACE_REPAIR_SOURCE_COMMIT_APPROVAL.md` §3–4。
这些文件用于解释当时流程，不把其特定路径、时限和批准泛化到新任务。

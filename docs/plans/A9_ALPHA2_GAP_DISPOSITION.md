# 完整 Alpha 2 缺口处置表

```text
Status: DRAFT_FOR_OWNER_REVIEW
Updated: 2026-10-12
Scope: 完整 Alpha 2 (0.3.0-alpha.2)，不是第二批 Win7 验收
Source: 905bf760… (A9-33 实现提交，本地，未推送)
Authorization: NOT_GRANTED
```

2026-10-15当前对账见§6。下方§1～§5保留2026-10-12准备快照，其中候选状态和断言数量不代表当前WIN7-45。

结论：第二批 Win7 验收（A9-33）全部通过，也只关闭表中 17 行里的 4 行（D）。另有 8 行需要补直接回归（R），5 行需要负责人做范围裁决或另立任务。
其中 `core/policy.ts` 自 WIN7-42 候选源码起改动 392 行，Git 形态与高影响确认（G07）不能默认继承旧结论，是最高优先级的回归项。
本表只整理来源[覆盖台账](A9_BATCH_2_ACCEPTANCE_COVERAGE.md)§1、§6 和 [A9 合同 §6](../tasks/A9_TRUSTED_AGENT_RUNTIME.md) 的事实，不批准任何继承，不裁决 Alpha 2。
证据层级写在每行。表中“批次 2”指 A9-33 的 25 个用例、42 条断言，目前全部 `NOT_PERFORMED`（开发机检查已通过，未在 Win7 实机验证）。

## 1. 处置码

| 码 | 含义 | 前置 |
|---|---|---|
| D | 批次 2 在 Win7 通过后即关闭 | 批次 2 PASS，关口 B |
| R | 补直接回归用例 | 用例进入 A9-33（须扩白名单）或另立任务书 |
| I | 精确哈希继承旧结论 | ADR-0155 获批、逐组件影响分析、负责人批准 |
| L | 登记为 Alpha 2 已知限制 | 负责人范围裁决 |
| S | 另立独立任务或采样 | 另立任务书与授权 |
| B | 阻断 Alpha 2，保持 `FAIL` 或 `NOT_PERFORMED` | 无 |

## 2. 影响面事实

自 WIN7-42 候选源码 `94385a87…` 到 `905bf760…`，产品源码（不含测试和 `dist`）的改动如下。该比较在开发机完成，不是 Win7 证据。

| 模块 | 改动文件数 | 主要文件与行数 |
|---|---|---|
| `core/src` | 5 | `policy.ts` 392、`a9-agent-loop.ts` 174、`a9-tools.ts` 21 |
| `runner/src` | 7 | `background-process-manager.ts` 227、`native-transport.ts` 170、`stream-output.ts` 147、`trusted-shell-runner.ts` 117 |
| `shell/product` | 7 | `a9-agent-runtime.js` 213、`renderer/a9-workbench.js` 146、`main.js` 50 |
| `state/src` | 1 | `a9-persistence.ts` 206 |
| `gateway`、`workspace`、`git-adapter` | 0 | 无改动 |

`gateway` 无改动，Provider 协议适配层未变；但 `a9-agent-loop.ts` 消费 Provider 流，其改动仍须分析。以上只给出改动面，不构成逐组件影响分析。

## 3. 缺口处置表

| 编号 | 范围 | 批次 2 直接证据 | 既有证据（层级、绑定） | 缺口 | 推荐 | 理由 |
|---|---|---|---|---|---|---|
| G01 | Shell 实时输出 S01–S06 | `B2-S01`～`B2-S06`，8 条断言 | A9-30 `DEVELOPER_VERIFIED`（开发机，源 `32ee0b4…`）；Win10 精确继承证据；Win7 `NOT_PERFORMED` | 无合同内缺口；原生退出取消（Esc）未测，已列已知限制 | D | 批次 2 即为 Win7 直接证据 |
| G02 | 后台工具 A9-SH03 | `B2-BG-01`～`03`、`B2-CH-02`、`B2-CH-03` | A9-31 `DEVELOPER_VERIFIED`（开发机，ADR-0188）；Win10 跨根组合 `WIN10_CROSS_ROOT_COMBINED_PASS_WITH_LIMITS` | 恢复后 `cleanup_required` 无产品内处置出口（A9-34 未做） | D + L | A9-34 缺口随结论明列 |
| G03 | 用户显式继续 A9-ST03 | `B2-CH-04`、`B2-CH-05`、`B2-CONT-01`、`B2-CONT-03`、`B2-UI-01` | A9-32 开发机通过；`DEVELOPER_VERIFIED` 未签 | B2-CONT-02（崩溃点）与 B2-SAFE-01（超预算）移为已知限制，仅开发机覆盖 | D + L | 2026-10-12 负责人已裁决收窄 |
| G04 | 预算、验证、审计、Provider 协议完整性（A9-26/28/29） | `B2-S03T`、`B2-SAFE-02`（仅审计硬停） | WIN7-42 `A9_27_WIN7_42_A9_26_PASS`（Win7 实机，源 `94385a87…`，run-id `92d693e0…`） | `a9-agent-loop.ts` 改 174 行；预算、验证、Provider 流未被批次 2 直接回归 | R | 先做影响分析；未受影响的组件才可走 I |
| G05 | 改动审阅（A9-24） | 无 | WIN7-41 `A9_25_WIN7_41_A9_24_PASS`（Win7 实机，run-id `318e27e4…`）；WIN7-42 W42-23 | `a9-agent-runtime.js` 改 213 行；Diff、撤销、漂移未直接回归 | R | 同 G04 |
| G06 | 响应式 U01–U07 | `B2-UI-01`、`B2-UI-02` | WIN7-37 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`；WIN7-36 UI 子集；WIN7-42 | 低于 800 px 为 `PRODUCT_UNREACHABLE` / `NOT_VERIFIED` | D + L | 限制已登记 |
| G07 | 策略、高影响确认、19 种 Git 形态 | 无 | WIN7-39 `A9_23_WIN7_39_A9_20_A9_21_PASS`（Win7 实机）；WIN7-42 | `policy.ts` 改 392 行；新工具、IPC、dispatch 的零拒绝副作用未直接回归 | R | 改动最大，不得默认继承 |
| G08 | Checkpoint 与恢复目录 | `B2-CH-04`（中断重启，间接） | WIN7-42 W42-23；补充真实 Windows Git R0-01～04 | `a9-persistence.ts` 改 206 行；撤销路径未直接回归；`git clean -fdx` 限制保留 | R | 先做影响分析，必要时 I |
| G09 | Renderer 隔离、Schema IPC、秘密、TLS、进程树 | `B2-S05`（秘密）、`B2-G1-PACKAGE`、`B2-G4`（秘密扫描） | WIN7-42；开发机 IPC 与 preload 测试 | 新动作 `a9.task.continue` 在 Win7 无 Schema 负向用例；目标服务 TLS 无真实环境 | R + G10 | IPC 负向可补；TLS 随 G10 |
| G10 | 真实 Provider 与企业环境（企业 CA、代理） | 无，仅回环夹具 | 开发机真实 Provider Gate（[A9 合同 §3.3](../tasks/A9_TRUSTED_AGENT_RUNTIME.md)）；Win7 `NOT_PERFORMED` | 全部 | L 或 R | 需要真实服务与凭据，只能由负责人提供 |
| G11 | J1–J3 项目解释、缺陷修复、小功能 | 无 | WIN7-19 `A9_ALPHA1_PASS`（Alpha 1，源 `781b20e3…`）；真实 Provider 使用情况本表未核对，`UNKNOWN` | Alpha 2 候选无直接证据；J2、J3 合同要求真实模型 | R + L | 夹具旅程只验证工具循环，不能代替真实模型 |
| G12 | J4 Shell 与 Git | 批次 2 的 Shell 流、后台、编码用例 | WIN7-19；WIN7-39；WIN7-42 | Git 状态、Diff、本地提交、目标绑定 push 审批无直接用例 | R | Git 部分补回归 |
| G13 | POSIX 可执行与 PowerShell `/Command` | 无 | `NOT_PERFORMED` | 全部 | L | Profile 支持声明与实测分开，继续标未测 |
| G14 | J5 撤销与恢复 | `B2-CH-04`、`B2-CH-05` | WIN7-42 checkpoint 与撤销 | 新候选撤销直接回归；A9-34 出口 | R + L | 同 G08 |
| G15 | A9-17 启动与内存采样 | 无 | 执行包就绪于 `scripts/mvp_acceptance/a9-startup-baseline/**`；Win7、Win10 采样 `NOT_PERFORMED` | 全部 | S | 独立工作，本批不宣称性能 |
| G16 | A8-06 外部验收与历史 Phase Gate | 无 | Win10、Win7 三层验证 `NOT_PERFORMED` | 全部 | S 或 L | 是否适用于 Alpha 2，`UNKNOWN` |
| G17 | 部署、回退、闭包 | `B2-G1-PACKAGE`（普通用户实际加载） | A7 `RC_PASS`（2026-08-20）；D-012 SBOM 与许可证闭包仍需 | 同包新目录升级与旧目录回退、数据库与备份、DPAPI、SBOM | S | 是否适用于 Alpha 2，`UNKNOWN` |

分类统计：D 类 4 行（G01、G02、G03、G06）；R 类 8 行（G04、G05、G07、G08、G09、G11、G12、G14）；其余 5 行为 L 或 S（G10、G13、G15、G16、G17）。

## 4. 待裁决

### Q1 回归用例放在哪一轮

问题：R 类 8 行需要 Win7 直接用例。候选尚未冻结，现在并入 A9-33 比再开第二个候选便宜，但需要扩大 §6.1 白名单并延长预演。

| 选项 | 影响 |
|---|---|
| A：并入 A9-33，冻结前一次完成 | 只跑一轮 Win7 预演和正式执行；开发量与预演时长增加；须负责人批准扩白名单和合同 |
| B：批次 2 先通过，R 类另立任务书与候选（暂定 WIN7-44） | 批次 2 范围不变，更快取得 D 类结论；Alpha 2 须再跑一整轮 Win7 |
| C：先做逐组件影响分析（仅文档），再定 A 或 B | 先判断哪些行可走 I；I 需要 ADR-0155 获批 |

推荐 C：影响分析只改文档、无远端动作，能把 R 类行数压到最小，再决定 A 或 B。
提问：请负责人选 A、B 或 C；选 C 时，执行代理先出 G04、G05、G07、G08、G09 的影响分析。

### Q2 哪些范围项登记为 Alpha 2 已知限制

问题：G10、G13、G15、G16、G17 以及 ≤799 px 目前都无证据，是否登记为 Alpha 2 的显式延期，由负责人裁决。

| 选项 | 影响 |
|---|---|
| A：逐项列入已知限制并延期到 RC | Alpha 2 范围收窄，路径最短；限制随结论明列 |
| B：其中部分列入 Alpha 2 范围 | 每一项须另立授权、环境与凭据；耗时随项数增加 |
| C：全部保持 `NOT_PERFORMED` 并阻断 Alpha 2 | 无范围裁决，Alpha 2 无法通过 |

推荐 A：这些项在覆盖台账里已经标 `NOT_PERFORMED`，当前合同没有为它们提供环境或凭据。
提问：请负责人逐项指出哪几项不接受延期。

## 5. 未执行与未知

| 项 | 状态 |
|---|---|
| 逐组件影响分析 | `NOT_PERFORMED` |
| 批次 2 在 Win7 | `NOT_PERFORMED` |
| ADR-0155 | `Proposed`，无继承获批 |
| Alpha 1 的 J1–J5 是否含真实 Provider | `UNKNOWN` |
| A8-06、部署闭包是否适用于 Alpha 2 | `UNKNOWN` |

本表不改覆盖台账，不创建候选、授权或 Alpha 2 裁决。

## 6. WIN7-45 之后的当前待办对账（2026-10-15 UTC）

当前source为ba042757a04f428cb3db3ccd10888a7bebe97d3b，ZIP ae1d4bb1…，正式run5773470e…。Win7实机25用例/43断言全部PASS，回收与独立复核已结束；独审0P0/1P1/0P2。负责人要求KL-12延期修复，门B尚未签。准确绑定见[交接书§3及§11](A9_33_WIN7_45_ACCEPTANCE_HANDOFF.md#11-kl-12-延期登记与本轮结束口径2026-10-15-utc)。本节覆盖§5“批次2在Win7 NOT_PERFORMED”的历史快照，不改原始结果或旧失败。

| 当前待办 | 结论边界与最短后续动作 |
|---|---|
| 第二批签发 | 负责人明确已验证范围与KL-12排除项后，才可签限定范围门B；D类4行仍须满足各自限制和签发条件，不能自动关闭 |
| R类8行覆盖对账 | G04预算/验证/Provider流、G05改动审阅、G07策略/高影响确认/Git形态、G08 checkpoint、G09隔离与IPC负向、G11 J1～J3、G12 Shell/Git、G14撤销恢复。先对当前候选逐组件分析及证据核销，再补最小直接回归或提出精确继承；不把旧表8行当成8个已确认需重测任务 |
| 优先安全项 | policy.ts从WIN7-42源码94385a87…到当前ba042757…为380行新增/12行删除。新工具、IPC与dispatch的拒绝及目标确认影响须先核对，不能默认沿用旧Git形态结论 |
| A9-32开发收口 | 将现有真实Electron/Win7证据逐项对应§5及已批准放宽口径，再由负责人另行裁决DEVELOPER_VERIFIED；当前不签 |
| 后续产品问题 | A9-34崩溃恢复后的清理确认出口仍为草稿并已延期；KL-12真实helper启动后ready失败清理仍P1/NOT_PERFORMED。两项后续处理及Alpha2结论中是否接受延期须明确，见[覆盖台账§8](A9_BATCH_2_ACCEPTANCE_COVERAGE.md#8-kl-12-后续修复与补证计划2026-10-15-utc) |
| L/S类5行范围 | G10真实Provider/企业CA与代理、G13 POSIX/PowerShell /Command、G15 A9-17启动与内存、G16历史A8外部验收、G17部署回退/数据库备份/DPAPI/SBOM。逐项确认适用范围、补证或延期；不自动把全部项变成本轮必跑，也不把未测项写为PASS |
| 完整Alpha2最终裁决 | 汇总直接/获批继承证据、未执行项及全部已知限制，经适用审核后由负责人裁决。ADR-0155仍Proposed，涉及其继承路径时先解决批准；完整Alpha2和RC分别裁决 |

本节只同步工作状态，不扩大实现、候选或实机授权，不签门B、完整Alpha2或RC。当前仅获准同名分支Git同步；冻结候选、原始证据、全部FAIL/UNKNOWN/HALTED保持。

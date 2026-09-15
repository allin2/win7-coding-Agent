# A9-16 — Alpha 2 Review、运行中输出与自适应工作台

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: ALPHA2_PRODUCT_REQUIREMENTS
Target Branch: codex/a9-alpha2
Source Baseline: 7d067890b1f54ab8bcde6bdbc5ea778d9e79c1ed
Target Version: 0.3.0-alpha.2
Phase-Gate: A9_16_WIN7_34_CANDIDATE_PENDING_DUAL_BUILD
Win7-Validation: WIN7_30_G2_FAILED / WIN7_31_G3_FAILED / WIN7_32_G3_FAILED / WIN7_33_G2_FAILED / WIN7_34_NOT_PERFORMED
Decision: ADR-0117 / ADR-0124 / ADR-0125 / ADR-0126 / ADR-0127 / ADR-0128 / ADR-0129 / ADR-0130
```

## 1. 需求来源与授权边界

项目负责人于 2026-09-09 将下列能力明确移入 `0.3.0-alpha.2`：Shell 运行中输出、完整 Review、扩大
左侧对话区、桌面宽屏可开关右侧检查器，以及左右栏关闭后主界面自适应。

本任务书只冻结需求与验收边界，**不构成实现授权**。开始实现前必须另行将任务状态改为
`APPROVED_FOR_IMPLEMENTATION`，选择目标分支和源码基线，并依据最终设计冻结允许路径、兼容性影响、
验证矩阵和 Win7 新候选合同。不得借本任务修改 Alpha 1 产品字节、WIN7-24 或任一历史候选和证据。

## 2. 权限与 Review 语义

| ID | 可观察成功条件 |
|---|---|
| A9-16-R01 | Alpha 2 恢复 Full Access、Read Only、Review 三模式；Review 后端未就绪、损坏或身份不一致时继续 fail-closed、零正式工作区写入，绝不静默降级为 Full Access |
| A9-16-R02 | Review 写操作只进入私有准备区；用户可逐文件接受/拒绝，Apply 绑定 Review revision、工作区基线、预览与 accepted-set 哈希，基线漂移时原子拒绝且零部分写入 |
| A9-16-R03 | Review 的准备区、逐文件决定和 Apply 审批卡只属于 Review；Full Access 的普通读写、计划和执行不生成 Review 审批卡，也不进入 Review staging |
| A9-16-R04 | 现有 Full Access 对删除、外部写入、push、提权等高影响操作的一次性目标绑定确认继续有效，并在 UI 中明确命名为“高影响操作确认”，不得冒充 Review 审批。是否移除该安全确认不在本基线内，必须另行明确授权并新增安全 ADR |
| A9-16-R05 | Review 审批、决定、Apply、拒绝、过期和重启恢复绑定对话、任务、Turn、Review revision 与精确目标；旧审批不能重放，模式之间不能串用 |

这里将“审批卡”拆成两类，以避免产品语义与安全合同冲突：Review 卡负责“是否把准备区改动应用到正式
工作区”；Full Access 高影响确认只负责一个精确、可见的危险操作。两者的标题、说明、审计类型和恢复
状态必须可区分。

## 3. Shell 运行中输出

| ID | 可观察成功条件 |
|---|---|
| A9-16-S01 | 前台 Shell 在进程仍运行时把新产生的 stdout/stderr 增量显示在对应工具活动卡和原始输出区；不得等进程退出后一次性补齐并称为“实时” |
| A9-16-S02 | 受控用例每隔 2 秒输出一个带序号 tick、最后退出；首个 tick 必须在 `tool_end` 前可见，后续 tick 顺序稳定、不重复、不丢失，结束状态与真实退出码一致 |
| A9-16-S03 | 输出链路必须从 native helper/直接 Runner 的运行中读取贯通到 Core 事件、持久化/IPC 和 Renderer；只在 Renderer 对最终 stdout 做动画、切片或轮询不算通过 |
| A9-16-S04 | stdout 与 stderr 保留各自来源、顺序和有界展示；跨 chunk UTF-8 字符、Win7 中文输出及 CR/LF 边界不能乱码、截断成伪字符或改变命令语义 |
| A9-16-S05 | 秘密脱敏必须能跨 chunk 匹配，未经脱敏的片段不得先进入 IPC、SQLite、日志或 UI；输出上限、截断原因、取消、进程树清理和 cleanup-required 语义不得弱化 |
| A9-16-S06 | 切换到其他可切换视图再返回、Renderer 刷新或应用重启后，已持久化的输出按稳定事件身份恢复且不重复；尚未落盘的活动进程不得被虚构为已恢复执行 |

本节仅要求工具 stdout/stderr 的运行中增量反馈，不把模型 token 级输出、交互式终端或向进程 stdin 注入
输入纳入范围。A9-15 的 `model_note` 仍是完整语义段，不以本任务自动改为 token streaming。

## 4. 左侧对话区与左右栏自适应

| ID | 可观察成功条件 |
|---|---|
| A9-16-U01 | 左侧对话目录优先占用导航栏中除必要全局入口外的剩余高度，活动对话列表独立滚动，不再因固定辅助区块只露出 1～2 条 |
| A9-16-U02 | 在 1366×768、100% DPI、无审批/错误遮挡的默认工作台中，左侧至少完整显示 4 条普通对话行；更矮或 125% DPI 时允许减少，但列表始终可达、可滚动且底部操作不遮挡条目 |
| A9-16-U03 | 左侧导航和右侧 Inspector 在桌面宽屏均可独立关闭和重新打开；按钮具有可理解的中文名称、`aria-controls`/`aria-expanded` 状态、键盘焦点和可见焦点样式 |
| A9-16-U04 | 主区至少覆盖“四态”：左右均开、仅左开、仅右开、左右均关。每次切换后网格立即重排，主对话区使用释放出的宽度，不保留空列、不产生页面横向滚动，也不遮挡标题、消息、审批/确认和输入框 |
| A9-16-U05 | 关闭或打开侧栏不得丢失对话滚动位置、工具卡展开态、草稿、活动任务状态或焦点上下文；任务运行中仍可访问 Stop，待 Review/高影响确认仍可访问决定入口 |
| A9-16-U06 | 窄屏继续使用抽屉/遮罩语义；桌面折叠态和窄屏抽屉态不得共用冲突的 `hidden/open` 状态，窗口跨断点缩放后 UI 与 `aria-expanded` 保持一致 |
| A9-16-U07 | 1366×768 的 100%/125% DPI、常见较矮窗口以及左右栏四态都执行布局和键盘回归；中文标题、长路径、错误条、等待状态和 Review 卡不得截断关键操作 |

“至少 4 条”是本需求基线为“明显多于当前 1～2 条”设定的最低可测目标；实现设计可以显示更多，但不能
通过缩小到不可读行高达标。左右栏开关是否跨重启记忆不在本轮固定，实施设计需在编码前作出一致决定。

## 5. 预计影响面与实现前置

运行中输出会跨越 `native/helper` 协议与实现、`src/runner`、`src/core` 事件、`src/state` 持久化、
`src/shell` IPC/Renderer 及发布验证；Review 会跨越 Core、State、Shell、Renderer、私有 staging、审批、
checkpoint/Diff/Undo 和恢复；布局主要影响 `src/shell/product/renderer/**`。这些只是影响面盘点，不是 C14
实现白名单。

实施授权前必须补齐：

1. chunk 协议、序号、背压、上限、跨块脱敏与中断恢复设计；若 native helper 协议变化，登记版本与兼容策略；
2. Review 数据模型、staging 生命周期、原子 Apply/回滚、漂移与恢复状态机；复用 A8 资产前逐项确认 A9
   IPC、SQLite 和权限边界，不直接宣称继承 PASS；
3. 桌面四态线框、断点行为、侧栏状态是否持久化，以及 1366×768/125% DPI 的可用性基线；
4. 独立审查、开发机真实 Electron、Win10 打包预检及普通用户非提升 Win7 同候选验收合同。

## 6. 非目标与证据边界

- 本文不授权实现、提交、推送、打包、部署或外部系统写入。
- 不重开 A9-15/WIN7-24，不修改或重判 WIN7-19～24 任何候选与证据。
- 不实现交互式终端、终端输入、并行 Agent、多窗口或 Office Lite。
- 文档检查通过只证明需求文档结构一致，不构成 Alpha 2 功能、开发机、Win10 或 Win7 PASS。

## 7. 实施授权（2026-09-14，负责人指令）

负责人于 2026-09-14 指示：**实现上述 UI 需求与响应式 UI，暂时放弃 Review。** 据此冻结本轮授权：

- **范围**：仅 §4 U01–U07（左侧对话区三段式与行密度、双侧开关、桌面四态自适应、状态保持、
  抽屉/桌面状态机分离、布局与键盘回归）。设计输入为
  `docs/plans/A9_16_UI_ZCODE_REFERENCE_SUGGESTIONS.md` 及其已验证的静态演示
  `docs/plans/a9-16-ui-demo/index.html`（四态与运行输出形态已按 1366×768 实测）。
- **明确不做（本轮）**：R01–R05 完整 Review（负责人指示暂缓；权限模式维持 Alpha 1 的
  Full Access / Read Only，Review 入口继续 disabled + fail-closed 文案）；S01–S06 Shell
  运行中输出（涉及 Runner/Core/IPC 链路，另行授权）；侧栏状态跨重启持久化（维持会话内）。
- **设计决定**：桌面/抽屉断点沿用既有 1200px（Inspector）与 800px（导航），1366×768 位于
  桌面态；桌面四态由 `.workbench` 的 `rail-closed`/`inspector-closed` 状态类驱动，仅类切换
  不重建 DOM（U05）；侧栏/检查器内容以固定最小宽度内层包裹，折叠时 `visibility:hidden`
  保留滚动位置；对话行为单行"标题 + 状态·时间"密度；信任注记默认折叠。
  与建议文档的偏差：断点 1280→沿用 1200/800；"进行中/更早"分组按 `activity` 字段实现为
  组头展示，不做跨重启记忆与时间分组裁剪。
- **允许路径白名单**（严格限定，C14）：
  - `src/shell/product/renderer/workbench.html`
  - `src/shell/product/renderer/a9-workbench.css`
  - `src/shell/product/renderer/a9-workbench.js`
  - `src/shell/tests/product/a9-workbench-contract.test.ts`
  - `docs/tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md`、`docs/tasks/README.md`、
    `docs/STATUS.md`、`docs/reports/2026-09/**`、`docs/plans/A9_16_UI_ZCODE_REFERENCE_SUGGESTIONS.md`、
    `docs/plans/a9-16-ui-demo/**`
- **验证矩阵**：`npm --prefix src/shell test -- --runInBand a9-workbench-contract`（含新增
  U01–U07 契约用例）+ shell 包 lint/build + `git diff --check`；真实 Electron 视觉与
  1366×768/125% DPI 实机回归 NOT_PERFORMED，不得宣称 Win7 PASS / Alpha 2 PASS。
- **源码基线说明**：基线 `7d06789` 上已有同分支在制且未提交的 A9-17（启动内存）改动，本任务在其
  之上继续；因此本轮 diff 同时包含两个任务的改动，只有 `renderer/workbench.html`、
  `renderer/a9-workbench.css`、`renderer/a9-workbench.js` 与
  `tests/product/a9-workbench-contract.test.ts` 中的 A9-16 部分属于本任务。
- **实现中补齐的两处缺口**（记录供复核；不改变上面冻结的范围与设计决定）：
  1. **U02 行容量不足**：只改行密度不能满足"至少 4 条"。按左栏固定 chrome 静态核算，原列表高度
     仅约 147px（约 2 条）；已压缩 brand / workspace-card / product-nav / rail-task / 目录头 /
     搜索框 / 当前动作 / 目录注记 / 组头，并把 rail-task 说明压到单行，使列表高度约 248px
     （预计 5 条）。该结论由契约测试中的静态高度预算模型锁定；真实布局仍为 `NOT_PERFORMED`。
  2. **U06 跨断点回归**：原 `resize` 监听在桌面断点调用 `closeInspector()`/`closeNavigation()`，
     使本轮新增的桌面折叠分支退化为"任何一次窗口缩放都折叠左右栏"，与 U05 冲突；现改为只做
     状态机收敛（清理失效的抽屉/桌面机制）与 `aria-expanded` 重推。另修 ≤799px 抽屉断点下残留
     `.rail-closed` 会把主对话区放进 0 宽网格列的冲突。

## 8. WIN7-29 候选合同与实机验收授权（2026-09-14，负责人指令）

负责人在 §7 实现授权基础上追加授权：为 §4 U01–U07 的 UI 子集冻结新候选 `WIN7-29`，使其可进入
Win7 实机验收。本轮仍不开放 Review（R01–R05）与 Shell 运行中输出（S01–S06）。

- **候选范围**：仅 A9-16 §4 U01–U07 的 renderer 改动（`workbench.html`、`a9-workbench.css`、
  `a9-workbench.js`）。A9-17（启动内存）经 2026-09-14 裁决不并入本候选，也不单独建立产品候选；
  其 Win7 采样沿用自身授权与既有执行包。
- **候选 ID 与决策记录**：`WIN7-29`；新增 ADR-0125，不改写任何 Accepted ADR 正文。
- **版本约束**：`scripts/release/build-a9-product-v3.mjs` 的 `validateA9Lock()` 硬校验
  `release_id === 'WIN7-CODING-AGENT-A9-ALPHA1'` 与 `version === '0.3.0-alpha.1'`。本候选保持该组合
  不变——Review 未启用，产品能力集仍为 Alpha 1（ADR-0096），不得据此改判或宣称 Alpha 2。
- **允许路径（在 §7 基础上追加，C14）**：
  - `scripts/release/build-a9-product-v3.mjs`：仅新增 `A9-16-INPUTS-…-WIN7-29` profile 与对应候选
    分支、验收用例、provenance 判定，保持 WIN7-22～28 历史 profile 与既有测试通过。
  - `scripts/release/test/a9-package.test.mjs`：WIN7-29 正负向回归与历史 profile 兼容检查。
  - `release/win7-product-v3/` 下 WIN7-29 的 input lock、validation kit、integrity/report/smoke
    脚本、CMD 包装与 `A9_16_WIN7_29_VALIDATION.md`，以及 `README.md` 的候选说明；
    不得改写 W23～W28 的冻结 release 文件。
  - `docs/DECISIONS.md`（仅新增 ADR-0125）、`docs/STATUS.md`、`docs/tasks/README.md`、
    `docs/plans/WIN7_29_CANDIDATE_CONTRACT_PROPOSAL.md`。
- **边界**：不修改 native helper、Runner/Policy、IPC 契约、SQLite schema、权限模式或秘密边界；
  不新增运行时依赖；不启用 Review；Alpha 权限模式维持 Full Access / Read Only。
- **构建与证据**：候选须来自两个独立干净工作树的逐字节一致构建；`--allow-uncommitted` 不得用于
  正式候选；候选哈希形成后由候选外独立 `WIN7_29_RELEASE_AUTHORITY` 与 SHA-256 pin 收口。
  未执行前保持 `WIN7_29_NOT_PERFORMED`。
- **本地提交**：允许将本轮改动冻结为本地提交；不推送、不打标签。

## 9. WIN7-30 候选合同与实机验收授权（2026-09-14，负责人指令）

负责人在 §8 基础上追加授权：`WIN7-29` 冻结候选在候选外预检阶段被判定为**构建缺陷**，其包内
自带校验器拒绝候选自身携带的 input lock，Win7 实机验收无法通过第一条命令；负责人裁决按既有
修复先例换发新标签，`WIN7-29` 保留为失败构建，不重新判定其结果。

- **缺陷事实（已实测证明）**：`release/win7-product-v3/a9-package-integrity-w29.cjs` 有 5 处字面量
  未从 W28 重基线——`gates.win7`（`NOT_PERFORMED_WIN7_28`）、`provenance.task`（`A9-15`）、
  `provenance.previous_candidate`（`WIN7-27`）、`provenance.previous_candidate_result`
  （`ACCEPTANCE_GAP_REPAIR_REQUIRED`）、`provenance.change_scope`
  （`DOM_OUTCOME_…APPROVAL_EXECUTION`），以及 `approved.kind`/`approved.status`
  （`WIN7_28_RELEASE_AUTHORITY` / `APPROVED_FOR_WIN7_28_VALIDATION`）。该文件被
  `release-manifest.json` 哈希绑定并随 ZIP 发布，因此无法以包外补丁修正。
- **候选 ID 与决策记录**：`WIN7-30`；新增 ADR-0126。ADR-0125 不可改写，其正文保持原样；
  `WIN7-29` 的冻结身份（commit `4bdf87b`、ZIP `a69d92c4…`、manifest `46f11c0d…`）作为失败构建
  证据留档，不得复用其哈希改判。
- **候选范围**：与 §8 一致，仅 A9-16 §4 U01–U07 的 renderer 改动；版本组合仍为
  `WIN7-CODING-AGENT-A9-ALPHA1` / `0.3.0-alpha.1`，Review 与 Shell 运行中输出不开放。
- **允许路径（在 §8 基础上追加，C14）**：
  - `scripts/release/build-a9-product-v3.mjs`：新增 `A9-16-INPUTS-…-WIN7-30` profile 与对应候选
    分支、验收用例、provenance 判定，以及派生脚本的**重基线残留守卫**；保持 WIN7-22～29 历史
    profile 与既有测试通过。
  - `scripts/release/test/a9-package.test.mjs`：WIN7-30 正负向回归，并新增"派生脚本字面量必须与
    input lock 逐项一致"的守卫断言（本轮漏检即因缺少该校验）。
  - `release/win7-product-v3/` 下 WIN7-30 的 input lock、validation kit、integrity/report/smoke
    脚本、CMD 包装与 `A9_16_WIN7_30_VALIDATION.md`，以及 `README.md` 的候选说明与失败构建记录；
    不得改写 W23～W29 的冻结 release 文件。
  - `docs/DECISIONS.md`（仅新增 ADR-0126）、`docs/STATUS.md`、`docs/tasks/README.md`、
    `docs/plans/WIN7_29_CANDIDATE_CONTRACT_PROPOSAL.md`。
- **边界**：不修改 native helper、Runner/Policy、IPC 契约、SQLite schema、权限模式或秘密边界；
  不新增运行时依赖；不启用 Review；Alpha 权限模式维持 Full Access / Read Only。
- **构建与证据**：候选须来自两个独立干净工作树的逐字节一致构建；`--allow-uncommitted` 不得用于
  正式候选；候选哈希形成后由候选外独立 `WIN7_30_RELEASE_AUTHORITY` 与 SHA-256 pin 收口。
  未执行前保持 `WIN7_30_NOT_PERFORMED`。
- **本地提交**：允许将本轮改动冻结为本地提交；不推送、不打标签。

## 10. WIN7-31 修复与换发授权（2026-09-14，负责人指令）

负责人在 WIN7-30 实机验收完成但失败后明确批准“修复与换发新候选”。本授权只处理 G2 已证实的两个
失败点，WIN7-30 及其候选外失败证据继续冻结，不得覆盖、补丁改包或复用哈希改判。

- **失败事实**：WIN7-30（ZIP SHA-256
  `1ec123e4f73dbb6607007e34460350164a06a6dd9035f4c031ff4782fc74af90`）在 `10.211.42.40`
  普通用户 Medium/non-elevated run `add716dd-c45e-4a18-ab5f-0ba1fc19d6c3` 通过 G1；G2 自动 smoke
  中四个 Electron 阶段均退出 0、fixture 325 次请求，但候选 driver 发布 W28 投影证据键而 smoke
  按 W30 键读取，且折叠左栏下 Ctrl+K 搜索过滤成功但焦点断言失败。硬门失败后真实 Provider保持
  `NOT_PERFORMED`；原 ZIP 复核哈希不变，结束后 Electron 进程为零。
- **候选 ID 与决策**：换发 `WIN7-31`，新增 ADR-0127；WIN7-30 保持 `G2_FAILED`，不得重签。
- **修复范围**：候选构建时将共享 driver 的 03/09/10 投影 case key 与 evidence package kind 精确派生
  为 W31；产品 Ctrl+K 在聚焦/全选搜索框前先展开导航。15 项用例、Alpha 1 版本和能力集保持不变。
- **允许路径（C14）**：在 §7/§9 基础上允许修改
  `src/shell/product/renderer/a9-workbench.js`、`src/shell/tests/product/a9-workbench-contract.test.ts`、
  `scripts/release/build-a9-product-v3.mjs`、`scripts/release/test/a9-package.test.mjs`；允许在
  `release/win7-product-v3/` 新增 W31 lock、integrity/report/smoke、CMD、validation 文档并更新
  `README.md`；允许更新本任务书、`docs/tasks/README.md`、`docs/STATUS.md`，并只向
  `docs/DECISIONS.md` 新增 ADR-0127。不得修改 W23～W30 的冻结候选脚本或工件。
- **防回归**：残留守卫必须在 driver 与 kit 生成后运行，并拒绝 03/09/10 投影对象键指向任何非 W31
  前缀；测试须证明正向 driver/报告器/smoke 键一致，以及注入旧键时构建 fail-closed。
- **构建与批准边界**：允许冻结本地提交并从两个独立干净工作树构建逐字节一致候选；不推送、不打
  标签。未知的新 ZIP 哈希形成后仍须取得候选外独立 `WIN7_31_RELEASE_AUTHORITY` 与 SHA-256 pin，
  本次“修复与换发”批准不预先等同于对未知哈希签发 authority。实机执行前保持
  `WIN7_31_NOT_PERFORMED`。
- **换发结果**：源码冻结提交 `ac4ed5048a6a2d4ed2f223c61ed06108a4a07d4b`；两个独立干净工作树
  构建 ZIP 逐字节一致，`source_dirty=false`、`external_acceptance_eligible=true`。ZIP SHA-256
  `79aec61da2046727ae89d94ccb4c9341ca5fb07aff17a72291479d1372ffa16a`（101,353,790 B），manifest
  SHA-256 `a215217b6279a85b4c8213f561bafda07a6c529f630a6e4060c63b084cb9dbe6`，788 文件完整树复验
  通过。测试夹具 authority 仅用于证明候选校验链路可接受正确绑定，明确不构成正式批准。正式
  `WIN7_31_RELEASE_AUTHORITY` 尚未签发，实机验收尚未开始。

## 11. WIN7-31 G3 失败与源码修复（2026-09-15，负责人指令）

负责人在 WIN7-31 实机 G3 失败后明确指示“帮我进行修复”。该指令授权修复已证实的 125% DPI 左栏
容量缺口；没有预先指定下一候选标签，也不等同于冻结提交、双构建、签发未知哈希 authority 或重新实机验收。

- **冻结失败事实**：WIN7-31 ZIP SHA-256
  `79aec61da2046727ae89d94ccb4c9341ca5fb07aff17a72291479d1372ffa16a`、manifest SHA-256
  `a215217b6279a85b4c8213f561bafda07a6c529f630a6e4060c63b084cb9dbe6`，候选外 authority SHA-256
  `5732a4628cb5a889037dbcab265292a3fc390f475835ab4d87ccd6b77e30b3e5`。`10.134.115.40`
  普通用户 Medium/non-elevated run `cdc35c14-abee-4f8e-bd4a-5759559ba0c8` 中 G1 PASS、G2
  75/75 PASS；G3 在真实 1366×768、120 DPI（125%）最坏形态下仅 1 条完整对话行，低于 W31-11-A03 /
  W31-15-A02 的 4 行硬门，故固定为 `WIN7_31_G3_FAILED`。正常关闭、零 Electron/helper 残留、
  postflight 完整性与证据秘密零命中均通过，但不能据此签发 A9-16 UI 集成 PASS。
- **根因**：既有契约测试只预算 768 CSS px 的 100% DPI 默认态，没有计入真实 125% DPI 最大化窗口约
  540 CSS px 的内容高，也没有把运行中 Stop 纳入最坏固定 chrome；开发机 125% 缩放代理曾观察到 1 行，
  但旧 U02 文案允许减少，未形成失败守卫。W31 validation kit 后来要求真实 125% 同样达到 4 行，产品
  CSS 与源码回归未同步，导致候选必然在该硬门失败。
- **最小修复**：只修改 §7 已授权的 `a9-workbench.css` 与 `a9-workbench-contract.test.ts`。在
  `max-height: 650px` 下压缩品牌与工作区装饰，把“任务 / Review”两个产品入口横排，把当前任务状态与
  Stop 横排，并压缩目录内部固定控制；Review 入口仍可见且 disabled，可信工作区、设置、诊断、Stop
  均保持可达。对话行继续为 36px，未靠缩小行高达标。
- **开发机验证**：A9 workbench 定向契约 31/31 PASS；新增守卫按 540 CSS px、运行中 Stop、两个组头、
  归档摘要与目录状态计算，要求至少 4 条 36px 行。Electron 22 / Chromium 108 以 1093×540 CSS px
  注入同一最坏形态量测：列表 197px、完整行 4、行高 36px、横纵页面溢出均为 0。shell lint、build 与
  `git diff --check` 通过。机器可读记录见
  [`win7-31-125dpi-source-repair-dev-geometry.json`](../reports/2026-09/a9-16-ui-evidence/win7-31-125dpi-source-repair-dev-geometry.json)。
  该 Electron 量测是开发机同引擎证据，不是新的 Win7 实机 PASS。
- **后续边界**：WIN7-31 及其全部候选外证据保持不可变。下一候选仍须另立身份、提交、双独立干净
  工作树构建、逐字节一致核验、候选外 SHA-256 authority 和 `10.134.115.40` 普通用户实机复验；在此
  之前保持 `NEXT_CANDIDATE_NOT_AUTHORIZED / WIN7_NOT_PERFORMED`。

## 12. WIN7-32 候选构建与实机复验授权（2026-09-15，负责人指令）

负责人在 §11 源码修复完成后指示“下面开始实际验收”。该指令授权把已验证的 125% DPI 左栏容量修复
冻结为新候选 `WIN7-32`，完成本地提交、两个独立干净工作树的逐字节一致构建，并在候选身份和候选外
authority 收口后于 `10.134.115.40` 继续普通用户实机验收。未知 ZIP 哈希不能由本指令预先批准。

- **候选与历史边界**：新增 ADR-0128；WIN7-31 保持 `G3_FAILED`，其 ZIP、manifest、authority、run 与
  全部候选外证据不可变，不得补丁改包、重签或复用哈希改判。WIN7-32 仍为
  `WIN7-CODING-AGENT-A9-ALPHA1` / `0.3.0-alpha.1`，不构成 Alpha 2 或 RC。
- **修复范围**：只承接 §11 的 `max-height: 650px` 左栏固定 chrome 压缩与对应最坏形态容量守卫；
  36px 对话行、Stop、任务/Review 两入口、可信工作区、设置和诊断保持可达。Review 继续 disabled +
  fail-closed，Shell 运行中输出不开放；不修改 native helper、Runner/Policy、IPC、SQLite schema、权限或
  秘密边界，不新增依赖。
- **允许路径（C14）**：在 §7/§10 基础上允许修改 `scripts/release/build-a9-product-v3.mjs`、
  `scripts/release/test/a9-package.test.mjs`；允许在 `release/win7-product-v3/` 新增 W32 input lock、
  integrity/report/smoke、CMD 与 `A9_16_WIN7_32_VALIDATION.md` 并更新 `README.md`；允许更新本任务书、
  `docs/tasks/README.md`、`docs/STATUS.md`，并只向 `docs/DECISIONS.md` 新增 ADR-0128。不得修改 W23～W31
  的冻结候选脚本或工件。
- **构建门**：允许本地提交；不推送、不打标签。正式候选必须由两个独立干净工作树构建且 ZIP 逐字节
  一致，`source_dirty=false`、`external_acceptance_eligible=true`；`--allow-uncommitted` 不得使用。
- **批准与执行门**：ZIP 与 manifest 哈希形成后，须另行取得绑定精确 ZIP、manifest、源码提交、正式
  lock 与 registry 的候选外 `WIN7_32_RELEASE_AUTHORITY` 及其独立 SHA-256 pin，方可在目标机执行。
  在该批准前保持 `WIN7_32_NOT_PERFORMED`，不得用本节这句未绑定哈希的授权替代 authority。
- **复验范围**：沿用 15 项用例与 G1→G2→G3→报告顺序，重点直接复验 W32-11/W32-15：真实
  1366×768、120 DPI（125%）、1 running + 8 older + 1 archived、Stop 可见时至少 4 条完整 36px 行，
  并检查桌面四态无页面溢出。任何硬门失败即停止下游，未执行项标 `NOT_PERFORMED`。
- **冻结结果**：源码提交 `916fe8240e73d6efa956eacf485652075639dbcb`；两个独立干净工作树构建
  `source_dirty=false`、`external_acceptance_eligible=true`，ZIP 逐字节一致。ZIP SHA-256
  `639063b70a1f7fb5dd422870708cb8cb457c405df8752668a5e43f8220a92ea2`（101,356,737 B），manifest
  SHA-256 `03647a0e0966e27787aa28ea17f577307955e0e28d7de3d31bd7fc62f8b442f6`，788 文件完整树与 15 项 kit
  闭包复验通过。测试专用 authority 只证明绑定校验链可接受正确输入，不构成正式批准；当前停在
  `WIN7_32_RELEASE_AUTHORITY` 门前，Win7 仍为 `NOT_PERFORMED`。
- **正式 authority 与实机结果**：负责人随后按上述精确 ZIP 哈希批准候选外 authority（SHA-256
  `4f06c80cb3c33aa9916273b26f753b5906ea8ce11e910125e5e758f6b9aa2dbe`）。物理 Win7 run
  `6e5c315d-cf59-4a5c-bb9f-1f58a2df366c` 在普通用户 `dccs-chaizl-pc\agent`、1366×768、120 DPI
  （125%）下完成 G1 PASS、G2 自动 smoke 75/75 PASS；G3 正式窗口首次启动和一次普通关闭后的正常重启
  均持续白屏。主/GPU/网络/renderer 进程存活且 responding，无同期 Application 崩溃事件；打开 DevTools
  触发重绘后已加载 DOM 才可见，故不是候选未启动，也不能把诊断重绘后的界面算作正常启动 PASS。
  硬门失败后真实 Provider、Stop、四态、键盘和最坏形态容量均保持 `NOT_PERFORMED`。正常退出后 Electron
  残留 0、postflight 完整性 PASS；候选自带报告器校验正式失败报告为 `FAIL`。WIN7-32 冻结为
  `G3_FAILED / FIX_BEFORE_REISSUE`，不签发 A9-16 UI 集成 PASS，不得重签、补丁改包或复用哈希改判。

## 13. WIN7-33 GPU 合成首绘修复与换发授权（2026-09-15，负责人指令）

负责人在 WIN7-32 正式失败收口后明确指示“修复并走验证”。该指令授权修复已经由物理 Win7 直接诊断
收敛的 Electron 22 GPU 合成首绘故障，并换发新候选 `WIN7-33`；不改写 WIN7-32 候选或证据。

- **直接诊断**：WIN7-32 正常启动和一次普通重启均持续白屏；renderer 存活且 responding。最小化/恢复
  和一像素 resize 均不能恢复；打开 DevTools 重建合成表面后已加载 DOM 立即显示。同一冻结候选仅增加
  `--disable-gpu` 重新启动后无需任何诊断操作即可正常首绘，故修复点绑定 Win7 GPU 合成路径。
- **最小实现**：仅在 Windows 的 Electron 主进程、`app.ready` 前调用
  `app.disableHardwareAcceleration()`；非 Windows 开发环境保持原策略。不得改 Runner/Policy、IPC、
  SQLite schema、权限、秘密、网络或依赖，WIN7-32 的 renderer 容量修复原样继承。
- **允许路径（C14）**：追加 `src/shell/product/main.js` 与
  `src/shell/tests/product/a9-startup-window.test.ts`；允许修改本任务书 §13 所需的 WIN7-33 release profile、
  测试与新文件，以及 `release/win7-product-v3/README.md`、`docs/STATUS.md`、`docs/tasks/README.md`；只向
  `docs/DECISIONS.md` 新增 ADR-0129。WIN7-22～WIN7-32 的冻结 release 文件与候选字节不得修改。
- **验证与候选**：先执行主进程启动顺序测试、shell/package 定向回归和开发机包预检；正式候选仍须
  本地提交、两个独立干净工作树逐字节一致构建、`source_dirty=false`、
  `external_acceptance_eligible=true`。允许本地提交，不推送、不打标签。
- **authority 与实机硬门**：未知 ZIP 哈希不由本指令预先批准。WIN7-33 哈希形成后仍须负责人按精确
  ZIP SHA-256 批准候选外 `WIN7_33_RELEASE_AUTHORITY` 及独立 pin，才可在 `10.134.115.40` 执行
  G1→G2→G3→报告。G3 首先证明无参数正常启动与正常重启均直接可见，再继续真实 Provider、Stop、四态
  和真实 125% DPI 最坏形态容量；诊断参数或 DevTools 触发后的画面不得计 PASS。
- **源码与候选冻结结果**：修复提交为 `d6c6a3e5d908ff3ffe72d14d1c64bb7ba968e718`。主进程启动顺序
  7/7、workbench 合同合并定向回归 38/38、package 全集 29/29、Shell lint/build 与仓库
  `verify:quick` 均 PASS；`docs:check` 只保留本任务前已存在的 A9-17 临时路径及历史 input-snapshot
  断链，未命中本次文件。两个独立干净 detached 工作树生成逐字节一致的 101,358,703 B ZIP，SHA-256
  `ab885f43c5285ebe81351ca5841f33399cb58b750b16cb8367fd2c760b08984c`；manifest SHA-256
  `6d9986f43135171517be34c61d85b17e9f79eae04f70be3c7c5bd6443930bd9e`，两份结果均为
  `source_dirty=false`、`external_acceptance_eligible=true`。冻结候选保存在
  `.acceptance/candidates/WIN7-33/`，双构建保存在 `.acceptance/builds/WIN7-33/d6c6a3e-reissue/`；
  临时工作树已注销并移除。使用明确标注 `TEST ONLY. NOT RELEASE AUTHORITY` 的候选外 fixture 对正式
  verifier 做开发机预检已 PASS，但它不构成 authority。当前硬停在精确哈希 authority 门，Win7 仍为
  `NOT_PERFORMED`；未推送、未打标签。

## 14. WIN7-33 G2 失败、渲染策略就绪守卫与 WIN7-34 换发授权（2026-09-15，负责人指令）

负责人在 WIN7-33 实机 G2 失败收口后明确指示“对问题进行修复”“现在就推进换发”。该指令授权修复
WIN7-33 在物理 Win7 上暴露的、候选自身驱动加载顺序与渲染策略调用时机冲突的缺陷，并换发新候选
`WIN7-34`；不改写 WIN7-33 及更早任何候选、报告与证据。

- **直接证据**：WIN7-33 在 `10.134.115.40` 以普通用户 `dccs-chaizl-pc\agent`、Medium/non-elevated
  令牌执行 run `15f2c247-d5e1-4c82-8d9f-c34759cf9a4f`，G0/G1 PASS，G2 四个驱动阶段全部抛
  `Error: app.disableHardwareAcceleration() can only be called before app is ready`，抛点在
  `resources/app/product/main.js:21`，触发点是驱动在 `app.whenReady()` 之内才 `require` 产品入口；
  fixture 请求为 0，未产出投影附件，G3 与 15 项用例按 fail-closed 记 `NOT_PERFORMED`，正式 verifier
  `status=FAIL`。非 Windows 平台跳过该调用，故该缺陷只能在物理 Win7 暴露。
- **最小实现**：把该调用改为按就绪状态守卫——
  `if (process.platform === 'win32' && !app.isReady()) app.disableHardwareAcceleration();`。
  打包入口仍在 `app.ready` 前加载本模块，Windows 软件渲染策略与 WIN7-33 完全等价；此后加载本模块的
  harness 不再能把一次非法迟到调用变成产品启动失败。不得改 renderer、Runner/Policy、IPC、SQLite
  schema、权限、秘密、网络或依赖；WIN7-32/33 的 renderer 容量修复与短高度左栏布局原样继承。
- **允许路径（C14）**：`src/shell/product/main.js`、`src/shell/tests/product/a9-startup-window.test.ts`；
  允许修改本节所需的 WIN7-34 release profile、`scripts/release/build-a9-product-v3.mjs`、
  `scripts/release/test/a9-package.test.mjs`、新文件，以及 `release/win7-product-v3/README.md`、
  `docs/STATUS.md`、`docs/tasks/README.md`；只向 `docs/DECISIONS.md` 新增 ADR-0130。
  WIN7-22～WIN7-33 的冻结 release 文件与候选字节不得修改。
- **验证与候选**：先执行主进程启动顺序测试（须覆盖“ready 之后加载不得做出非法迟到渲染调用”与
  “ready 前加载必须照旧生效”两条）、shell/package 定向回归和开发机包预检；正式候选仍须本地提交、
  两个独立干净工作树逐字节一致构建、`source_dirty=false`、`external_acceptance_eligible=true`。
  允许本地提交，不推送、不打标签。
- **派生工件**：WIN7-34 的候选作用域脚本（integrity / report / smoke / driver / 两个 RUN 包装与
  input lock）由冻结的 WIN7-33 工件按仓库既有约定重基线候选令牌生成；构建期 `A9_CANDIDATE_STALE_TOKEN`
  守卫必须通过，且候选包测试须逐项确认 lock 身份、provenance、kit 与错误码均为 WIN7-34 作用域。
- **authority 与实机硬门**：未知 ZIP 哈希不由本指令预先批准。WIN7-34 哈希形成后仍须负责人按精确
  ZIP SHA-256 批准候选外 `WIN7_34_RELEASE_AUTHORITY` 及独立 pin，才可在 `10.134.115.40` 执行
  G1→G2→G3→报告。实机顺序不变：G2 自动产品 smoke 必须先在候选内通过，之后才可进入 G3 首绘硬门；
  G3 须先证明无参数正常启动与正常重启均直接可见，再继续真实 Provider、Stop、四态和真实 125% DPI
  最坏形态容量；诊断参数或 DevTools 触发后的画面不得计 PASS。
- **边界**：本授权不构成 Alpha 2 或 RC PASS，不改判 WIN7-19～WIN7-33 任何结论，也不解除
  A9-16 §1–§6 对 Review 与 Shell 运行中输出的范围限制。WIN7-33 保持
  `G2_FAILED / FIX_BEFORE_REISSUE`，其候选、run、正式报告与全部原始证据原样留档。

# A9-16 — Alpha 2 Review、运行中输出与自适应工作台

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: ALPHA2_PRODUCT_REQUIREMENTS
Target Branch: codex/a9-alpha2
Source Baseline: 7d067890b1f54ab8bcde6bdbc5ea778d9e79c1ed
Target Version: 0.3.0-alpha.2
Phase-Gate: A9_16_UI_IMPLEMENTATION
Win7-Validation: NOT_PERFORMED
Decision: ADR-0117 / ADR-0124
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

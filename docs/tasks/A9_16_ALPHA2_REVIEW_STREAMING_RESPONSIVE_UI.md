# A9-16 — Alpha 2 Review、运行中输出与自适应工作台

```text
Status: PLANNED_NOT_AUTHORIZED
Task Type: ALPHA2_PRODUCT_REQUIREMENTS
Target Branch: NOT_SELECTED
Source Baseline: NOT_SELECTED
Target Version: 0.3.0-alpha.2
Phase-Gate: A9_16_REQUIREMENTS_BASELINE
Win7-Validation: NOT_PERFORMED
Decision: ADR-0117
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

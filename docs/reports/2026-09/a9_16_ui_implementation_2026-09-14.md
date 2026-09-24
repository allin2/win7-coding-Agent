# A9-16 UI 子集实现报告（U01–U07 / 响应式四态）

日期：2026-09-14
授权：任务书 §7（负责人 2026-09-14 指令"实现上述 UI 需求和响应式 UI，暂时放弃 Review"）
分支：`codex/a9-alpha2`（基线 `7d06789`，同分支在制 A9-17 改动之上，均未提交）
范围裁决：仅 U01–U07；**R01–R05 Review 与 S01–S06 运行中输出本轮不做**（任务书 §7 冻结）
决策：ADR-0117（需求基线）/ ADR-0124（本轮实施授权与延期）

## 1. 交付内容

| 需求 | 实现 | 文件 |
|---|---|---|
| U01 左栏三段式 | 导航内容移入固定最小宽度 `.rail-inner`；信任注记改默认折叠 `<details id="trust-note">`；对话目录 `flex:1 1 auto` 成为左栏唯一 grow 成员、列表 `overflow:auto` 独立滚动 | workbench.html、a9-workbench.css |
| U02 行密度与行容量 | 对话行改单行网格（标题左省略 + "状态 · 时间"右对齐），`min-height: 36px`；压缩左栏固定 chrome（见 §3） | a9-workbench.css |
| A-3 分组 | `renderConversationDirectory` 按 `activity` 分"进行中"（非 idle）/"更早"两组，组头带计数；已归档仍为独立折叠区 | a9-workbench.js |
| U03 双侧开关 | 头部 `open-navigation`/`open-inspector` 桌面可见且改为真 toggle；`close-navigation`/`close-inspector` 桌面生效；`aria-controls` 保留、`aria-expanded` 由启动同步与断点收敛共同维护；`closeNavigation` 抽屉分支补焦点归还 | workbench.html、a9-workbench.js |
| U04 四态 | `.workbench` 的 `rail-closed`/`inspector-closed` 状态类驱动网格列：≥1200px 三列四态；800–1199px 仅导航列可关（Inspector 为抽屉）；≤799px 双抽屉（既有） | a9-workbench.css |
| U05 状态保持 | 只切类不重建 DOM；`.rail-inner`/`.inspector-inner` 固定最小宽度 + 折叠时 `visibility:hidden`，滚动位置与焦点保留；桌面关闭时焦点在面板内则交还头部开关 | workbench.html、a9-workbench.js |
| U06 状态机分离 | 抽屉 `.open`/backdrop 与桌面状态类互不共用，由 `syncPaneState()` 单点收敛；跨断点缩放只清理失效机制并重推 `aria-expanded` | a9-workbench.js、a9-workbench.css |
| Review 暂缓 | 权限对话框 Review 选项维持 Alpha 1 disabled + fail-closed 文案，未动 R01–R05 任何语义 | （无改动） |

与建议文档的偏差（已记录于任务书 §7）：桌面断点沿用既有 1200/800 而非 1280；分组不做时间裁剪与跨重启记忆。

## 2. 本轮复核发现并修复的三处缺口

上一轮提交的实现只在"静态结构"层面覆盖 U01–U06，没有覆盖三个可观测行为，本轮补齐：

1. **U02 行容量不达标。** 只改行密度并不满足"至少完整显示 4 条"。按左栏固定 chrome 静态核算，
   原实现的列表可用高度仅约 **147px ≈ 2 条**（分组出现两个组头时更少），与 U02 的 4 条相差一倍。
   已压缩 brand / workspace-card / product-nav / rail-task / 目录头 / 搜索框 / 当前动作 / 目录注记 /
   组头，并把 rail-task 说明从两行压到单行，使列表高度约 **248px ≈ 5 条**（详见 §3）。
2. **U06 跨断点回归。** 原 `resize` 监听为
   `() => { if (!inspectorIsDrawer()) closeInspector(); if (!navigationIsDrawer()) closeNavigation(); }`。
   在这轮新增桌面折叠分支之前，`closeInspector()/closeNavigation()` 在桌面是空操作，所以该监听无害；
   加上桌面分支后，它变成"**任何一次窗口缩放都会把用户打开的左右栏一起折叠**"，直接与 U05
   （状态保持）冲突。现改为 `root.addEventListener('resize', syncPaneState)`，只做收敛与 aria 重推。
   同时修复 ≤799px 抽屉断点下残留 `.rail-closed` 会把主对话区放进 **0 宽网格列**的冲突
   （`@media (max-width: 799px)` 内新增单列覆盖）。

两处修复都用负向对照验证过：把 U06 的旧监听放回去后，`implements the A9-16 four-state responsive shell…`
与 `re-syncs drawer and desktop pane state across breakpoints…` 两个用例**同时失败**。
第三处（归档区漏算）由 §4 的真实 Electron 几何量测发现并回归。

3. **U02 预算模型漏算归档区，真实 Electron 量测暴露 3 行缺口。** §3 的静态预算只累加了目录
   header/搜索/当前动作/目录注记，**没有计入有已归档对话时必然出现的
   `.conversation-archive-section` 折叠摘要**（约 30px），也没有计入 workspace-card 的实际
   最小高度。用开发机真实 Electron 22.3.27（Chromium 108）加载真实 `workbench.html` 后按
   `getBoundingClientRect` 实测：**"2 个组头 + 归档区可见"最坏形态下列表仅 190px、只有 3 条完整行**，
   低于 U02 的 4 条下限。已再次压缩 brand / product-nav / rail-task / workspace-card 的装饰间距与
   目录边距（不改 36px 行高、不改 44px `.nav-item`、不改 30px 触达目标），并把归档摘要项补进
   §3 预算模型与契约断言，使其成为常驻护栏。修复后同一最坏形态实测 **196px / 4 条完整行**。

## 3. U02 左栏高度静态预算（1366×768 / 100% DPI）

模型口径：按 `a9-workbench.css` 的实际声明值累加左栏固定 chrome，文字行高按 `font-size × line-height`
估算，取最坏情况（"进行中/更早"两个组头都在，且归档区折叠摘要可见）。该模型已固化进契约测试
`keeps the A9-16 rail height budget above the U02 floor of four visible conversation rows`，
任何撑大左栏或组头的改动会直接失败并给出新行数。

| 项 | 修改前 | 修改后 |
|---|---|---|
| `rail-inner` 上下 padding | 24 | 16 |
| brand | 47.0 | 39.0 |
| workspace-card | 90.4 | 76.4 |
| product-nav（2×44 + gap + margin） | 116.0 | 96.0 |
| rail-task（含说明行） | 105.4 | 84.5 |
| trust-note（折叠） | 52.0 | 34.0 |
| rail-bottom | 40.0 | 40.0 |
| **固定 chrome 合计** | **474.8** | **379.9** |
| → 对话目录可用内容高 | 281.2 | 384.1 |
| → 目录内部固定开销（含归档摘要） | 134.0 | 146.1 |
| **→ `.conversation-list` 高度** | **147.2** | **238.0** |
| 行步进 / 组头步进 | 40 / 30 | 38 / 22 |
| **完整可见行数（2 个组头 + 归档区）** | **1** | **5** |

模型里"修改后"的 5 行是**乐观估算**（真实 Electron 实测同形态为 4 行，见 §4），差值为真实换行与
内容高度带来的约 28px；模型作为**单调护栏**（撑大即失败）使用，权威口径是 §4 的真实渲染量测。

行本身没有缩小：对话行仍是 `min-height: 36px`、标题 12px、元信息 11px，未采用"缩小到不可读行高"的方式达标。
`min-height: 44px` 的可点击目标（`.nav-item`）与 `font-size` 下限（无 9/10px）由既有契约断言继续锁定。

## 4. 开发机真实 Electron 布局量测（本轮新增）

在开发机上用真实 Electron 22.3.27（Chromium 108，与 Win7 运行时同版本）加载**产品原件**
`src/shell/product/renderer/workbench.html` + `a9-workbench.css` + `a9-workbench.js`，
preload 换成返回固定快照的桩（2 个进行中 + 6 个空闲 + 1 个已归档对话），用
`getBoundingClientRect` / `getComputedStyle` 取渲染期几何值。证据：
[`docs/reports/2026-09/a9-16-ui-evidence/layout-evidence.json`](a9-16-ui-evidence/layout-evidence.json)
与同目录 7 张 PNG。**这是布局/aria 的几何证据，不是像素级视觉签字。**

| 状态（1366×768 视口） | `grid-template-columns` | 横向溢出 | 列表高/内容高 | 完整行 | `aria-expanded` 导航/检查器 |
|---|---|---|---|---|---|
| 双开 | `232px 774px 360px` | 0 | 210 / 347 | 4 | true / true |
| 仅左开 | `232px 1134px 0px` | 0 | 210 / 347 | 4 | true / false |
| 仅右开 | `0px 1006px 360px` | 0 | 210 / 347 | 4 | false / true |
| 双关 | `0px 1366px 0px` | 0 | 210 / 347 | 4 | false / false |
| 1100 宽（检查器转抽屉）开 | `220px 880px` | 0 | 210 / 347 | 4 | true / true |
| 1100 宽抽屉关 | `220px 880px` | 0 | 210 / 347 | 4 | true / false |
| 760 宽（双抽屉）导航开 | `760px` | 0 | 215 / 347 | 4 | true / true |
| 1366 × zoom 1.25（125% 代理） | `220px 872.8px` | 0 | 61 / 347 | 1 | true / false |

结论与边界：

- **四态与两个断点全部符合预期**：网格列随状态类切换，主区取走释放宽度，**全程 `scrollWidth`
  与 `scrollHeight` 均无溢出**（不产生页面横向滚动，符合 U04）；`aria-expanded` 与视觉开合一致（U03/U06）。
- **U02 最坏形态达到 4 条完整行**（2 个组头 + 归档区可见）。默认全空闲形态为 5 条。
- **键盘（U03/U05）**：焦点位于检查器内时 Ctrl+I 关闭，焦点交还头部 `open-inspector`，
  `aria-expanded` 变 `false`；Ctrl+K 聚焦目录搜索；两个开关 `display:grid`、`tabIndex=0`、
  中文 `aria-label`（"开关左侧导航"/"开关检查器"）齐备。
- **125% 代理为最弱项**：Chromium `setZoomFactor(1.25)` 使 CSS 视口降到 1092.8×614，
  落回 <1200 的抽屉态，列表仅 61px、约 1 条完整行。U02 明确"125% DPI 时允许减少"，且列表
  可达、可滚动、底部操作不遮挡，故未违反条文；但密度确实很低，**必须作为 Win7 实机
  1366×768 × 125% DPI 的首要复核项**。此处的 125% 是 Chromium 缩放代理，**不等于**真实
  Windows DPI 变更，仅作方向性提示。

## 5. 验证

- `cd src/shell && /usr/local/bin/node node_modules/jest/bin/jest.js --runInBand`：
  **37 套件 / 357 项全绿**（较上一轮 355 项新增 2 项）。
- 本轮 A9-16 契约用例共 5 项：
  1. `implements the A9-16 four-state responsive shell and dense conversation directory (U01-U06)`
     （静态合同：四态媒体查询、≤799px 单列覆盖、内层包裹、单行行密度、组头、开关 aria、分组函数、`syncPaneState` 与 resize 绑定）；
  2. `keeps the A9-16 rail height budget above the U02 floor of four visible conversation rows`
     （U02 预算模型；已补入归档区折叠摘要与 workspace-card 实际高度项）；
  3. `drives desktop four-state panes through state classes without rebuilding conversation DOM (U03-U05)`；
  4. `re-syncs drawer and desktop pane state across breakpoints without collapsing open sidebars (U06)`；
  5. `renders the A9-16 conversation directory with live/older group heads and single-line rows (U01/A-3)`。
- 负向对照：还原旧 resize 监听后用例 1、4 同时失败（证明两处修复是真实护栏，不是顺带通过）。
- `npm --prefix src/shell run lint`：`tsc --noEmit` + 全部产品 JS `node --check` 通过。
- `git diff --check` 干净。
- `node scripts/check_docs.mjs`：唯一与本次改动相关的失败是 `docs/tasks/README.md` 的 A9-16
  `Status` 逐字比对（任务书状态行带括号注记），已通过把状态行改回裸 token 修复；其余 73 条
  link 失败全部落在 **untracked 且被 ignore 的 `outputs/**` 沙箱快照**（`outputs/a9-18-independent-review-*/input-snapshot/`），
  与本次改动无关，属既有环境噪声。

## 6. 未验项与边界

- **像素级视觉签字与真实 1366×768 × 125% DPI、较矮窗口的实机回归：`NOT_PERFORMED`。**
  §4 是开发机真实 Electron 的**渲染几何量测**（DOM 尺寸/计算样式/溢出/aria），已把布局与
  aria 的行为证据补到几何级；但它不是人工/视觉模型的逐页像素验收，且 125% 用的是 Chromium
  缩放代理而非真实 Windows DPI。契约测试只到字符串/VM 级，**均不构成视觉 PASS**。
- **Win7 实机验证未执行**；本报告不构成 Alpha 2 PASS / Win7 PASS，未签发任何新 PASS。
- 侧栏状态跨重启持久化按任务书 §7 维持不持久化；S01–S06 运行中输出待另行授权。
- 改动文件均在任务书 §7 白名单内：workbench.html / a9-workbench.css / a9-workbench.js /
  a9-workbench-contract.test.ts / 本报告与 `docs/reports/2026-09/a9-16-ui-evidence/**` / 索引文档 / ADR-0124。
- 分支上仍混有未提交的 A9-17（启动内存）改动；`renderer/*` 与契约测试中的 A9-16 部分才是本任务归属。
  本地未提交、未推送。
- **环境观察**：本轮期间检测到工作区存在并发写入者（`a9-workbench.js` 的
  `initializePaneState` 被改为 `syncPaneState`、契约用例由 355 增至 357、`.workbuddy-ai/` 目录出现），
  本报告所有数值以**当前磁盘内容**为准；另有 untracked 的 `.workbuddy-ai/` 与 `outputs/**` 快照
  非本任务产物，未纳入改动。

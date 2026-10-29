# A9-41 — 工作台可读性与交互反馈优化

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_EXPERIENCE
Target Branch: main
Source Baseline: 6ea0b9af67145603f5991cd441bdc4c9af658d4c
Phase-Gate: A9_41_DEVELOPER_VERIFIED
Win7-Validation: NOT_PERFORMED
```

## 1. 授权、结果与边界

2026-10-28 America/Los_Angeles，负责人要求“使用gpt重置模式，帮我优化本项目的ui”，
在主会话展示模式配置和范围后回复“开启fast执行”。按 ADR-0290 登记本轮本地实施范围。
主会话整合到 main；执行代理由 T3 创建独立工作树，实际路径、分支和 HEAD 在回传后登记。

交付结果：改善现有工作台导航、对话、输入与运行状态的视觉层级；改善字体、间距、窄窗口布局、
滚动和键盘焦点；完善空状态、处理中、失败与禁用状态反馈。先展示基于真实渲染代码的最小交互演示，
再落地同一方向。沿用既有设计语言；重大产品行为或交互方向变化须先说明并等待负责人决定。

实现定位：`src/shell/product/renderer/workbench.html`、`a9-workbench.css`、`a9-workbench.js`，
以及 Shell 内必要的受影响交互测试。演示与检查材料放在 `outputs/a9-41-ui/`。
主会话维护本任务书、任务索引及当前状态；执行代理不改主工作区和其他治理文件。

沿用 D-009 Electron 22.3.27 / Chromium 108 / Node 16.17.1，开发 Node 20.17.0。
不引入依赖、外部字体、远程资源或新系统 API。不改变 main/preload/IPC、Core/Policy、State、Runner、
安全批准、权限模式、数据格式、A9-34 恢复处置和 A9-40 刷新生命周期语义。
Review 继续 fail-closed；所有按钮沿用真实能力与禁用守卫，不创造占位功能。

本轮允许本地编辑、最小演示、受影响构建与验证；不提交、不推送、不发布，不连接 Win10/Win7，
不安装依赖、不调用真实模型、不删除既有文件。模式员工的模型推理不属于产品真实模型请求。
新权限、接口、依赖、持久化或重大方向变化停止相应实现并报告；安全或生命周期未知停止依赖动作。
同类失败两轮未闭环先做最小诊断，不整批重试或弱化断言。

## 2. 基线与影响

开发机仓库 `/Users/qlyf/Developer/win7-coding-Agent`，基线如上。
起始已有修改：DECISIONS、DECISIONS_INDEX、EVIDENCE_ARCHIVE_RETRIEVAL、A9_ALPHA2_GAP_DISPOSITION、
ENGINEERING_05；另有 EXTERNAL_ARCHIVE.json、EXTERNAL_ARCHIVE_RESTORE.md、scripts/maintenance/ 未跟踪内容。
这些已有修改保留，不纳入本次 UI 变更。

产品实际入口由 `src/shell/product/main.js` 选择 `renderer/workbench.html`；
旧 `index.html` 不作为本次产品 UI 证明。预期变化仅为 Renderer 展示与必要局部交互。
本轮不沿用旧候选 UI PASS，也不改判 WIN7-55 或 A9-34/A9-40 的历史证据。

## 3. 必要验证与最短链路

1. 使用真实工作台 HTML/CSS/JS 加显式桩数据制作自包含演示，注明“演示，非验收证据”、日期和基线。
2. 开发机加载实际渲染入口，完成侧栏开合、对话搜索/选择、输入与状态反馈、设置面板开合和焦点返回。
3. 检查 1366×768、125% 等效可视区、800–1199px 抽屉布局及必要窄窗口边界；长标题、长输出不遮挡关键操作。
4. 按实际差异运行最窄工作台合同与行为测试；使用现有入口先构建依赖，再测试当前消费者。
5. 执行 docs:check 与 git diff --check，保留首失败并修复本次改动引起的问题。

开发机 Renderer 桩验证不证明真实 main/preload/IPC、打包运行时或目标机行为。
打包、Win10/Win7、正式门 A/B、真实模型与发布均为 NOT_PERFORMED。

## 4. 执行记录

### 4.1 实施与开发机结果

2026-10-28 America/Los_Angeles，主会话完成本地产品整合。
身份为 main `6ea0b9af…` 加本轮未提交差异；不代表已发布版本变化。
实际 Renderer 三文件 SHA-256 见 `outputs/a9-41-ui/integrated-browser.json`。

| 用户结果 | 实现与直接证据 |
|---|---|
| 长标题不再挤窄开关 | 图标禁止 flex 收缩，标题使用剩余空间；六种开发视口的导航和检查器开关均为 44px |
| 中等宽度导航不再沿用过宽内层 | ≤1199px 内层宽度与 220px 栏宽匹配；保留列表 DOM 和侧栏折叠状态 |
| 窄窗口关闭设置后恢复可见焦点 | 打开设置同步侧栏 aria；关闭后回到可见导航开关，900px/1366px 保留原设置入口 |
| 对话与输入提示更易辨认 | 普通标题 13px、当前标题强调；搜索提示缩短且保留 Ctrl+K；禁用发送按钮保持文字对比 |
| 失败与长输出更清晰 | 结论行距、失败标题、阻断原因和长摘要换行精修；长输出继续独立滚动 |

三个产品文件仅改展示和上述焦点恢复；未变更 IPC、权限或任务生命周期。
主会话复核候选后调整禁用样式的选择器优先级，避免覆盖发送按钮的清晰度规则。
完整产品差异与新增回归共四文件，68 行新增、23 行删除；未提交。

### 4.2 验证与首失败

执行环境为 macOS / Node 20.17.0；浏览器为 Chrome 156.0.8078.73。
现有项目入口已先编译七模块依赖闭包，并执行 Shell lint 与消费者测试。

```sh
npm run test:local -- --module shell --test-file tests/product/a9-workbench-contract.test.ts
npm run test:local -- --module shell --test-file tests/product/a9-workbench-contract.test.ts --test-file tests/product/a9-19-live-progress.test.ts --test-file tests/product/a9-background-refresh.test.ts --test-file tests/product/a9-change-review-workbench.test.ts --test-file tests/product/a9-21-workbench-checkpoints.test.ts
node outputs/a9-41-ui/verify-integrated.cjs
npm run docs:check
git diff --check
```

- 新增焦点回归在原产品实现上得到 1 FAIL / 48 PASS：780px 返回隐藏设置按钮；900px/1366px 通过。
  原始失败保留在 `outputs/a9-41-ui/baseline-contract.log`，没有覆盖或改判。
- 修复后五组定向检查 73 PASS，日志为 `outputs/a9-41-ui/integrated-tests.log`。
  覆盖实际工作台合同、实时进展、后台轮询、改动检查器和 checkpoint 展示。
- 主会话直接加载 main 的 `renderer/workbench.html`，保留产品 CSP 和实际 CSS/JS，注入显式内存 preload 桩。
  14 项检查通过：六视口布局、三宽度焦点/aria、禁用发送文字、搜索、发送/停止、长失败输出和异常/网络检查。
  报告绑定实际三文件 SHA，页面异常与 HTTP 请求均为 0；浏览器已关闭。
- 开发截图为 `outputs/a9-41-ui/integrated-running-1366.png` 与 `integrated-failed-1079.png`。
  125% 使用等效 CSS 可视区，不是系统 DPI 证明。

`docs:check` 通过 392 个文档、63 个任务书；`git diff --check` 通过。
打包运行时、Electron 22 / Chromium 108、真实 main/preload/IPC、
Win10/Win7、真实模型、正式门 A/B、提交、推送和发布为 NOT_PERFORMED。
本轮不据 Chrome 或桩结果签发 Win7 PASS；产品 UI 的目标平台表现待后续准确开发包验证。

### 4.3 演示、派单与材料保留

本轮派单 1 次：Codex / gpt-6.1-sol / xhigh / priority，实际调用已完成。
员工工作树 `/Users/qlyf/.t3/worktrees/win7-coding-Agent/t3-7da7955e`，
完成后实际分支为 `t3/workbench-ui-polish`，HEAD 与基线一致；早期报告分支名为创建时名称。
员工仅写 `outputs/a9-41-ui/`，产品源码未改；主会话核对 patch 后整合。

演示、候选 patch、首失败与 33 项候选/宿主检查已保留到主工作区 `outputs/a9-41-ui/demo-r1/`。
主会话先展示交互 Demo，再整合产品。内嵌展示初次拒绝 iframe 内容里的 vh；
仅演示包装改为显式高度，修复加载期间空 documentElement 竞争后完成展示。
Demo 是 fixture，不能替代上节真实源码加载检查或目标平台证据。

附属材料盘点：员工工作树、Demo 副本、验证日志/截图和模式状态记录保留。
基线失败留下的项目临时测试目录按原入口保留，不执行删除。
负责人使用验收为 NOT_PERFORMED；已有归档和交付文档改动保留。

### 4.4 字体优化：测量环境不可信，本轮不采用

2026-10-28 America/Los_Angeles，负责人要求就字体与排版提出候选方案。按 GPT 重置模式派单 2 次：
Codex / gpt-6-astra / xhigh / priority（三方案推演），Codex / gpt-6.1-sol / xhigh / priority（实现实测）。
两者均已回报，材料在 `outputs/a9-font-variants/`，产品源码未改。

**结论：字体改动本轮不采用。原因是全部收益数字都测自错误的字体环境。**

开发机实测渲染字体为 `PingFang SC`（macOS 系统字体），浏览器为 Chromium 153；
本机 `Microsoft YaHei`、`Microsoft YaHei UI`、`Segoe UI`、`PingFang SC` 四个字体名回退到同一字形，
同一段中文在四种声明下宽度均为 120px（20px 字号）。因此开发机无法复现目标字体的度量。

由此推翻本轮此前得出的两条判断：

- 「`font-weight: 600` 与 `700` 渲染一致、600 被合成为 700」——这是 PingFang SC 的表现，
  不能推断微软雅黑在 Win7 上相同。微软雅黑仅含 400/700 两档，600 的实际合成行为未在目标平台验证。
- 字距与大小写的收益（实测每元素 0.44–1.09px、混排合计 16.47px）——依赖字体度量，
  在微软雅黑下的数值未知。

员工交付中同时存在未生效项，不能按报告数字采用：

- 方案 2 主张的正文行距 28px 在 `body` 上未生效；`body` 的 `font: 15px/1.55` 受合同测试锁定，
  实测仍为 23.25px。该方案的核心卖点不成立。
- 方案 3 主张首屏阴影元素 5→0，实测仍残留 7 个。
- 方案 1 的任务流高度 552.9→459.9（−16.82%）经复测属实，但以压低字号实现，
  会加剧左栏长标题截断，与 §4.1「长标题不再挤窄开关」的方向冲突。

**跨字体仍成立、可在后续单独立项的只有两类**：字号（px 绝对值）与阴影数量（布局属性）。
字距、字重、大小写均依赖字体度量，须待 Win7 实机或装载微软雅黑的环境复测后再议。

本节不改变 §4.1–§4.3 的任何已验证结果；不据此签发或撤回 Win7 结论。
字体相关的 Win7 实测仍为 NOT_PERFORMED，本轮授权范围明确不连接 Win10/Win7。

### 4.5 随A9-42批准清单保存与开发打包（2026-10-29）

负责人批准A9-42审阅清单内82项改动的本地提交及开发打包，其中包含本任务UI改动。
产品源码已保存为main `100f8db454f67225a03d33cfd628ade0b20fc4bd`；
该授权对本次本地提交和开发打包替代§1最初的不提交范围，推送发布和目标机边界不变。
实际开发包及准确SHA-256见 [A9-42 §4.8](A9_42_LIGHTWEIGHT_AGENT_TOOLS.md#48-已提交源码与实际开发包交付2026-10-29)。
包内工作台HTML、图片/问询组件及入口闭包已核对；没有重跑或提升本任务已有UI交互证据。
打包完成不证明产品GUI在Electron22或Win7上的布局、焦点或字体表现，相关运行验证仍NOT_PERFORMED。

### 4.6 随A9-42直接Win7开发试用补证

2026-10-29，负责人批准A9-42准确开发包的60分钟、零真实模型请求试用。
源 `94135364fa922261d1f0b281ddb29c34b900c7b7`、ZIP `751c76f2…d72085d`，
Win7 SP1 x64普通agent会话2实际加载产品main/preload/IPC/State及工作台，完成portable启动、
Read Only、新建对话、SQLite持久化和正常关闭；另用同包Renderer、真实Electron22窗口/preload/strict IPC
加明确Runtime夹具完成6视口与设置关闭焦点、问询/图片交互检查。
这补充§4.5中未执行项的DEV_CHANNEL直接证据；不把夹具问询当真实State端到端行为。
两张Win7截图已直接检查，普通控件及中文可见；没有重新采用§4.4被否决的字体方案。
准确原始报告、截图哈希、普通用户身份和零残留收尾见 [A9-42 §5.4](A9_42_LIGHTWEIGHT_AGENT_TOOLS.md#54-win7普通用户直接开发试用完成dev_channel)。
正式门A/B、长期性能预算、完整产品使用验收及发布仍NOT_PERFORMED。

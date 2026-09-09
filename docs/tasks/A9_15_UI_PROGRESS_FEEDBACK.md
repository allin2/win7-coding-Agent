# A9-15 — UI 优化与 Agent 过程反馈

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_EXPERIENCE_HARDENING
Target Branch: codex/ui-optimization
Source Baseline: 72dfe229447d93750815525e713a1a80f02534f3
Phase-Gate: A9_15_WIN7_24_CANDIDATE_PREPARATION
Win7-Validation: WIN7_NOT_PERFORMED
Target Candidate: WIN7-24
Decision: ADR-0114 / ADR-0115 / ADR-0116
```

## 1. 授权与目标

用户于 2026-09-08 会话中明确指示"在 codex/ui-optimization 分支上，依据
`docs/plans/UI_PROGRESS_IMPLEMENTATION_PLAN.md` 进行 UI 的优化"，构成产品实施授权。实现方案为该
READY_FOR_ASSIGNMENT 文档（用户已认可的修正版 Demo 为视觉基线）；本任务书将其转为可执行合同。

目标：保留 A9 Alpha 1 全部既有能力，按获批 Demo 重构工作台视觉，并补上真实、及时、可回看的 Agent
过程反馈（中间自然语言说明、工具活动组、审批留痕、等待事实、持久化回看）。

## 2. 需求与验收（引用实现方案 §3/§4）

UI-01～UI-13 逐项以 `docs/plans/UI_PROGRESS_IMPLEMENTATION_PLAN.md` §3 矩阵为准；中间态与文字反馈
合同以其 §4 为准。本任务补充的可观察成功条件：

| ID | 要求 |
|---|---|
| A9-15-01 | loop 在"响应含 content 且发起 toolCalls"时发出 `model_note`（步骤完整语义段，脱敏后进入 timeline 与 a9_events）；最终答案仍只在 turn_completed 呈现一次 |
| A9-15-02 | `tool_start`/`tool_end` 携带稳定 `callId` 与 `step`；timeline 条目带 `eventId`/`sequence`（a9_events 行 id），重连/轮询不重复 |
| A9-15-03 | 新 IPC `a9.events.query`（信封 schemaVersion 6）按会话有界查询（默认 200、上限 1000、游标 beforeEventId），跨会话请求拒绝 |
| A9-15-04 | 审批决定产生 `approval_resolved` 时间线事件（批准/拒绝均留痕） |
| A9-15-05 | Renderer 轮次结构：请求卡→过程（说明/计划/活动组/审批留痕）→结果卡；增量渲染保留展开态、滚动与焦点；旧记录无事件时明示"历史记录未包含过程" |
| A9-15-06 | 等待>10s 显示真实等待对象与实际时长；无虚构百分比或动作声明 |
| A9-15-07 | 标题搜索（Ctrl+K）覆盖当前工作区活动与归档对话；空结果、清空、恢复结果 |
| A9-15-08 | 视觉对齐获批 Demo 暖色浅色主题；不引入远程字体/新框架；CSP 与单文件结构不变 |
| A9-15-09 | 渲染安全：说明/路径/命令/输出仅 textContent；单条说明展示上限 16 KB、工具输出 8 KB，截断明示 |

## 3. 允许路径

- `src/core/src/a9-agent-loop.ts`、`src/core/src/system-prompt.ts` 及对应 `src/core/tests/a9-agent-loop.test.ts`、`src/core/tests/system-prompt.test.ts`
- `src/state/src/a9-persistence.ts`、`src/state/tests/a9-persistence-contract.test.ts`
- `src/shell/product/a9-agent-runtime.js`、`src/shell/product/a9-product-ipc.js`、`src/shell/product/preload.js`
- `src/shell/product/renderer/workbench.html`、`src/shell/product/renderer/a9-workbench.css`、`src/shell/product/renderer/a9-workbench.js`
- `src/shell/tests/product/a9-product-contract.test.ts`、`a9-workbench-contract.test.ts`、`a9-lifecycle.test.ts`、`a9-preload-capability.test.ts`、`a9-06-driver-entry.cjs`
- `docs/tasks/`、`docs/DECISIONS.md`、`docs/STATUS.md`、`docs/tasks/README.md`
- `docs/plans/UI_PROGRESS_IMPLEMENTATION_PLAN.md`、`docs/plans/ui-progress-reference/**`：本任务已引用的
  实现方案与视觉基线。
- `scripts/release/build-a9-product-v3.mjs`、`scripts/release/test/a9-package.test.mjs`：只新增 WIN7-23
  profile，必须保持 WIN7-22 历史 profile 与测试通过。
- `release/win7-product-v3/README.md`、`a9-15-win7-23-input-lock.json`、
  `A9_15_WINDOWS_VALIDATION.md`、`RUN_A9_15_INTEGRITY.cmd`、`RUN_WIN7_23_REPORT_VERIFY.cmd`、
  `a9-package-integrity-w23.cjs`、`a9-win7-23-report.cjs`、`a9-win7-23-smoke.cjs`：仅限新候选合同；
  既有 WIN7-19～22 文件不可修改。
- `release/win7-product-v3/a9-15-win7-24-input-lock.json`、`A9_15_WIN7_24_VALIDATION.md`、
  `RUN_A9_15_W24_INTEGRITY.cmd`、`RUN_WIN7_24_REPORT_VERIFY.cmd`、`a9-package-integrity-w24.cjs`、
  `a9-win7-24-report.cjs`、`a9-win7-24-smoke.cjs`：仅限 WIN7-24 新候选合同；WIN7-23 合同、候选和
  证据均冻结不可修改。构建器只可新增 WIN7-24 profile/driver 闭包，并保持 WIN7-22/23 历史测试通过。

## 4. 非目标与边界

- 不修改 native helper、Runner/Policy 安全语义、Git 适配器与冻结的 WIN7-19～22 文件；除 §3 精确列出的
  WIN7-23 新合同外不修改 `release/**`。不新增依赖、运行时或权限模式；不启用 Full Access 之外的新能力；
  不实现完整 Review、附件、交互终端、正文全文搜索。
- SQLite 表结构不变（沿用 a9_events 版本化 schema v4 校验）；新事件经版本化 payload 扩展。
- 用户在 2026-09-09 批注中授权提交本次 A9-15 范围改动、补充新候选/验收合同并构建干净候选；随后在
  WIN7-23 自动 smoke 失败后明确授权修复验证启动方式、优化 Win7 字体清晰度并建立 WIN7-24。仍不推送，
  不重跑或改判历史候选、不覆盖历史失败证据。候选哈希形成后的独立 release-authority pin 仍须另行绑定。
- 真实 Provider 多工具任务、Win10 双构建、Win7 实机、打包发布均为 NOT_PERFORMED；开发机证据不构成
  Win7 PASS。

## 5. 验证

按改动模块执行定向检查（lint/test/docs:check，见实现方案 §7）；Renderer 契约测试覆盖新结构、
交互与渲染安全；Electron smoke 视本机依赖可用性执行并如实记录。交付时按实现方案 §9 交接模板汇总
证据与 NOT_PERFORMED 项。

## 6. 开发机验证记录（2026-09-09）

全部命令在开发机（macOS）执行且退出码为 0；以下为实际结果，不构成 Win7 PASS。

| 命令 | 结果 |
|---|---|
| `npm test --workspace=@win7-agent/core -- --runInBand --runTestsByPath tests/a9-agent-loop.test.ts tests/a9-permission-modes.test.ts tests/system-prompt.test.ts` | 18/18 PASS |
| `npm test --workspace=@win7-agent/state -- --runInBand --runTestsByPath tests/a9-persistence-contract.test.ts` | 55/55 PASS |
| `npm test --workspace=@win7-agent/shell -- --runInBand --runTestsByPath tests/product/a9-workbench-contract.test.ts tests/product/a9-product-contract.test.ts tests/product/a9-lifecycle.test.ts tests/product/a9-mode-fail-closed.test.ts tests/product/a9-preload-capability.test.ts` | 87/87 PASS |
| `npm run lint --workspace=@win7-agent/core` / `@win7-agent/state` / `@win7-agent/shell` | 全部通过（tsc --noEmit；shell 另含 16 个产品文件 node --check） |
| `npm run docs:check` | `{"ok":true,"checked_files":116,"task_files":28}` |
| `node --check src/shell/product/renderer/a9-workbench.js` | 通过 |

新增 ADR-0114 合同断言：core `model_note`（content+toolCalls 才发、callId/step）；state
`listSessionEvents` 升序/limit 夹紧/游标/eventId 回传；shell IPC `a9.events.query` payload 校验
与跨会话拒绝（`A9_EVENTS_CONVERSATION_MISMATCH`）、真实运行时事件投影与重启回看、
`approval_resolved` 拒绝留痕、Renderer 新结构/搜索/键盘/等待反馈/显示上限/渲染安全（唯一
innerHTML 为静态状态图标）。

NOT_PERFORMED：Electron 真实 smoke（`run-a9-06-electron-smoke.mjs`）、视口/截图 QA、真实
Provider 多工具任务、Win10 双构建、Win7 实机、打包发布、提交/推送（按方案 §10 默认不提交）。

## 7. 独立检查后的修复（2026-09-09）

用户明确要求先确认问题真实性，真实则修复。复现确认：非零退出/工具错误/清理未确认被误标成功；
审批决定事件晚于恢复执行；前端缺少历史分页入口；历史查询失败被静默忽略。

本轮修复：状态判定覆盖失败、取消与未知结果；身份校验通过后先记录决定，再恢复执行；
历史增加游标加载与可见失败/重试，补载旧事件重新对齐过程顺序并保留已有活动展开态。
新增函数行为回归覆盖状态与分页失败重试，运行时测试核对决定事件早于 tool_start。
不修改数据库格式、IPC 合同或 Renderer 权限；保留已有工作区修改，不提交/推送。
最终 Electron 交互、真实 Provider 和 Win7 验证仍为 NOT_PERFORMED；阶段保持待集成验证。

## 8. Electron 集成推进（2026-09-09）

本节更新 §6/§7 的 Electron 未执行状态，其余未完成项不升级结论。

- 当前 `codex/ui-optimization`、HEAD `72dfe229447d93750815525e713a1a80f02534f3` 加未提交修改；
  core → state → shell 重新 build 全部成功。不是冻结候选。
- 在 `/tmp/a9-ui-electron-native-rtegES` 隔离编译既有 better-sqlite3 8.7.0，使用本地
  Electron 22.3.27 头文件；未替换仓库 Node ABI 模块，未安装新依赖。
- 正式 main/preload/Renderer 四进程 smoke 初次 50/51：唯一失败为旧断言查找英文 `shell`，
  实际 UI 为“运行命令”，真实 `exit=0` 与输出正常。修正 driver 断言后 51/51 PASS。
- driver 增加可选 `A9_SMOKE_VISUAL_DIR` 取图，按正常关闭检查器操作捕获主对话；最终
  `/tmp/a9-ui-electron-native-rtegES/electron-smoke-visual-r2.json` 为 PASS，55/55
  （51 项原交互检查 + 4 项截图文件生成检查；截图生成成功不等于视觉验收 PASS）。
- 覆盖实际工作区选择、read/edit/Shell、Diff、目标绑定审批拒绝零副作用、重启与 Provider
  配置恢复、旧审批拒绝、16 对话 IPC 隔离、Stop 取消及子 PID 回收、无 active 生命周期残留。
- 视觉人工检查：`/tmp/a9-ui-electron-native-rtegES/visual-r2/` 的 empty、completed、approval、
  running PNG；空态内容尺寸 860×592，其余 1120×732，zoom 1.25。已查看空态、完成卡、审批目标
  与拒绝/批准按钮、运行状态与 Stop；暖色主题与主要入口可见。未完成同视口 Demo 精确对照、
  失败态、等待超过 10 秒、历史分页/焦点/展开态和搜索的完整 Electron 交互矩阵，不裁定完整 UI PASS。
- 真实 Provider：三个 `A9_REAL_PROVIDER_*` 专用环境变量缺失，NOT_PERFORMED；没有读取其他
  应用凭据，也没有发起外部模型请求。
- Win7：旧连接端点已失效；按用户纠正的目标与项目既有专用验收身份、锁定主机指纹、
  `StrictHostKeyChecking=yes` 严格 SSH 成功。只读实测为 Windows 7 Professional build 7601 x64，
  当前管理会话为提升权限身份。
  本次仅关闭远程管理连接与系统身份预检；尚未传输或运行本次源码候选，当前候选实机行为验证
  仍 NOT_PERFORMED。
- 全部 smoke 使用 `--keep-root=1`，临时数据和初次失败证据保留；未提交、推送、发布或覆盖候选。
- WIN7-23 driver 扩展后再次运行同一四进程 smoke；修正查询事件 DTO 字段与 Renderer 状态刷新等待后，
  `/tmp/a9-ui-electron-native-rtegES/electron-smoke-fixed-r2.json` 为 57/57 PASS。新增检查直接覆盖事件顺序/
  稳定 ID/工具配对、最终答案仅一次、审批决定持久化、重启历史、跨对话拒绝，以及 active/archived 搜索与
  Ctrl+K 焦点。它仍是 macOS 开发机 + 回环 fixture 证据，不是 Win7 或真实 Provider PASS。

继续所需：专用 Provider 配置、恢复 Win7 管理连接；正式目标验收还需当前源码候选及对应构建、
哈希与普通用户证据链，不能复用 WIN7-22 历史候选替代本次改动。

## 9. WIN7-23 候选与实机验收授权（2026-09-09）

用户明确选中并确认：“提交本次 A9-15 范围内的改动（不推送），补充 A9-15 新候选/验收合同及必要的
`release/**` 文件，然后构建干净候选并继续 Win7 实机验收。”据此由 ADR-0115 开启 WIN7-23：

- 新候选只复用 WIN7-22 已批准的 Electron、D-013 v25 与 SQLite 输入精确哈希；native 源码、helper、
  Profile 与协议均未变化，不重跑或改判 WIN7-22。
- 正式包必须在提交后的两个干净工作树独立构建并逐字节一致；候选身份绑定新的源码提交、ZIP、manifest、
  input lock、验证 kit 与候选外 release authority。
- Win7 结果限定为 `A9_15_WIN7_UI_INTEGRATION_PASS`。八项当前候选用例全部直接执行，其中真实 Provider
  多工具任务不能由 fixture 替代；普通用户、非提升 GUI/令牌证据不能由管理员 SSH 代替。
- 本次授权不包含推送，也不允许把 `.trae/**`、本机连接资料、秘密、状态数据库、临时 smoke 数据或
  历史候选/证据纳入提交或候选。

## 10. WIN7-23 冻结失败（2026-09-09）

- 源码提交 `e39e136fbf62e67516aeaf7838099bbc4587cdbb` 的 WIN7-23 已完成两次干净、逐字节一致构建；候选身份、
  包完整性及普通用户非提升令牌完整性均通过。
- 普通用户自动产品 smoke 失败：外层 `electron.exe` 在 `ELECTRON_RUN_AS_NODE=1` 下运行验证脚本，但其
  子进程再次启动已打包 `electron.exe <driver.cjs>` 时，打包入口忽略外部脚本参数并加载
  `resources/app`。因此没有生成三个 driver phase 报告，不能把窗口可见或进程退出推断为 smoke PASS。
- WIN7-23 保持冻结失败；其 ZIP、manifest、lock、authority、部署目录与证据均不得修改、替换或重判。
  真实 Provider 用例及正式 A9-15 Win7 总结论仍 `NOT_PERFORMED`。

## 11. WIN7-24 修复与新候选授权（2026-09-09）

用户明确要求“建议修复验证启动方式，提交后建立全新的 WIN7-24 候选；不能修改或重判 WIN7-23。继续修复
并生成 WIN7-24”，并要求结合目标机截图优化字体显示清晰度。据此由 ADR-0116 开启最小修复：

- 自动 smoke 在候选外运行目录创建临时 Electron 验证副本，仅复制锁定候选的 Electron 根运行文件、
  `locales`、`swiftshader` 和 `resources/default_app.asar`；副本不含 `resources/app`。验证 app/driver 也
  位于候选外，driver 再通过 `A9_SMOKE_PRODUCT_MAIN` 加载候选内正式 `resources/app/product/main.js`。
- smoke 必须证明三个 phase 报告实际生成、mode 对应、fixture 至少收到一次 journey 与 stop 请求，且
  每个 phase 全部断言 PASS；只看退出码或窗口出现不能判 PASS。`stop` 独立数据根先经正式工作区选择链
  绑定工作区，再配置模式/Provider 并执行取消与进程树清理。
- 字体修复仅调整现有 CSS：Win7 本地微软雅黑 UI/微软雅黑优先，正文使用整数 15px，辅助/代码信息提高
  到可读字号并加深 muted 对比度；不下载字体、不改变 CSP、布局、功能或权限边界。
- WIN7-24 使用新的 lock、kit、ZIP/manifest、authority、部署目录与证据根；仍复用 WIN7-22 已批准的
  Electron/D-013 v25/SQLite 精确输入。提交与双干净构建在当前授权内，不推送；候选哈希形成后仍须独立
  authority pin，之后才可进入新的普通用户实机验证。

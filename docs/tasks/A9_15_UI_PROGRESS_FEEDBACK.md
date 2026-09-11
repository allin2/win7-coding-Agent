# A9-15 — UI 优化与 Agent 过程反馈

```text
Status: COMPLETE
Task Type: PRODUCT_EXPERIENCE_HARDENING
Target Branch: codex/ui-optimization
Source Baseline: 72dfe229447d93750815525e713a1a80f02534f3
Phase-Gate: A9_15_WIN7_UI_INTEGRATION_PASS
Win7-Validation: WIN7_28_PASS
Target Candidate: WIN7-28
Decision: ADR-0114 / ADR-0115 / ADR-0116 / ADR-0118 / ADR-0119 / ADR-0120 / ADR-0121 / ADR-0122
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
- `src/shell/tests/product/a9-product-contract.test.ts`、`a9-workbench-contract.test.ts`、`a9-lifecycle.test.ts`、
  `a9-preload-capability.test.ts`、`a9-06-driver-entry.cjs`、`run-a9-06-electron-smoke.mjs`
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
- `release/win7-product-v3/a9-15-win7-25-input-lock.json`、`A9_15_WIN7_25_VALIDATION.md`、
  `RUN_A9_15_W25_INTEGRITY.cmd`、`RUN_WIN7_25_REPORT_VERIFY.cmd`、`a9-package-integrity-w25.cjs`、
  `a9-win7-25-report.cjs`、`a9-win7-25-smoke.cjs`：仅限 ADR-0118 的新候选合同；WIN7-23/24 合同、候选和
  证据均冻结不可修改。构建器只可新增 WIN7-25 profile/driver 闭包，并保持 WIN7-22/23/24 历史测试通过。
- `release/win7-product-v3/a9-15-win7-26-input-lock.json`、`A9_15_WIN7_26_VALIDATION.md`、
  `RUN_A9_15_W26_INTEGRITY.cmd`、`RUN_WIN7_26_REPORT_VERIFY.cmd`、`a9-package-integrity-w26.cjs`、
  `a9-win7-26-report.cjs`、`a9-win7-26-smoke.cjs`：仅限 ADR-0119 的验证缺口修复候选；WIN7-23/24/25
  合同、候选与证据均冻结不可修改。构建器只可新增 WIN7-26 profile/driver 闭包，并保持历史 profile 测试通过。
- `release/win7-product-v3/a9-15-win7-27-input-lock.json`、`A9_15_WIN7_27_VALIDATION.md`、
  `RUN_A9_15_W27_INTEGRITY.cmd`、`RUN_WIN7_27_REPORT_VERIFY.cmd`、`a9-package-integrity-w27.cjs`、
  `a9-win7-27-report.cjs`、`a9-win7-27-smoke.cjs`：仅限 ADR-0120 的四项 P2 修复候选；WIN7-23/24/25/26
  合同、候选与证据均冻结不可修改。构建器只可新增 WIN7-27 profile/driver 闭包与新 driver 协议开关，
  并保持 WIN7-22/23/24/25/26 历史 profile 测试与协议兼容性通过。

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

## 12. WIN7-24 重启投影失败与 WIN7-25 授权（2026-09-09）

- 普通用户真实 Provider 多工具轮次完成并正常退出后，重启未重放请求且中央请求/结果仍可见，但 Inspector
  活动为空、agent 状态为 idle，单一全局结果错误停留在更早轮次的 `failed · not_applicable`，没有反映
  最新持久化事实 `completed · verified`。只读 SQLite 元数据核对确认 133 条事件仍在，最新 task、turn、
  checkpoint 和 terminal event 四处一致；这是 Renderer 投影缺陷，不是状态库丢失或工具重放。
- 根因一：会话加载清空运行时内存 timeline；历史 `queryEvents` 只并入中央轮次的 `turnEvents`，Inspector
  仍只渲染 `snapshot.timeline`。根因二：每个历史轮次块按自己的增量签名更新同一个全局结果字段，较早
  失败轮次因事件消息变化重新写入后，后续签名未变的成功轮次提前返回，导致全局字段陈旧。
- 负责人确认“完全按此方案继续”，授权在 A9-15 既有 Renderer/测试白名单内修复两处投影、补回归，新增
  WIN7-25 lock/kit/verifier/report/smoke 合同，本地提交但不推送，并执行两个干净工作树的确定性构建、
  候选外独立 authority 绑定和受影响普通用户 Win7 复验。
- WIN7-24 永久保持 `FIX_BEFORE_WIN7_25_VALIDATION`；其 ZIP、manifest、lock、authority、部署与证据不得
  修改或重判。WIN7-25 复用未变化的 WIN7-22 Electron/D-013 v25/SQLite 精确输入，但使用新的源码提交、
  ZIP/manifest、lock、authority、部署目录和证据根。开发机或管理诊断不构成普通用户实机 PASS。

## 13. WIN7-25 验证缺口与 WIN7-26 授权（2026-09-10）

- WIN7-25 两处 Renderer 修复的同输入行为对照有效，但源码回归未执行真实连续渲染，Electron 重启链路也
  未构造旧失败→较新成功；把旧全局副作用放回内存副本时原测试仍通过。WIN7-25 kit 还未明确要求
  Inspector 持久事件恢复及旧失败不得覆盖新成功，报告器无法以这两项签发门拒绝缺失证据。
- 负责人要求按完整方案直接修复并延续本地提交、双干净构建与实机流程。回归必须调用真实 Renderer 函数，
  通过内存故障注入证明能拒绝原故障；正式 Electron driver 必须绑定同一会话的旧失败/新成功 turn/event ID、
  Inspector DOM 与重启显示。产品 Renderer 无新证据时不得重写。
- WIN7-26 新增稳定用例 `W26-03-INSPECTOR-PERSISTED-RESTART` 与
  `W26-04-LATEST-OUTCOME-PROJECTION`。报告器要求 `projection_evidence` 绑定查询 event ID、turn ID、DOM
  导出文件哈希与最新持久化结果；新增断言缺失、失败或投影证据缺失均拒绝 PASS。历史 W23/W24/W25
  profile 与冻结工件保持不变。
- WIN7-25 全部 out-a/out-b、ZIP、manifest、kit、lock、构建树及候选外证据保持原字节。WIN7-26 使用新源码
  提交、lock、kit、ZIP/manifest、authority、部署目录和证据根；未完成普通用户非提升 Win7 当前候选验证前，
  `WIN7_26_NOT_PERFORMED`，开发机 fixture 不构成真实 Provider 或 Win7 PASS。

## 14. WIN7-26 四项 P2 修复与 WIN7-27 授权（2026-09-10）

- 修复基线为 `2e5a534d88fcf46c700c6406786c469d4d4427dd`（`codex/ui-optimization`），继续在当前工作区实施，
  保留既有未提交修改（Alpha 2 的 ADR-0117/A9-16 草稿、`docs/REMOTE_WINDOWS_CONNECTIONS.md`、`.trae/**`、
  `docs/plans/WIN7_25_VALIDATION_GAP_REPAIR_PLAN.md`），这些内容不混入本次提交。
- 只读复核结论：WIN7-26 的产品投影修复与双构建一致性成立，但四项 P2 未关闭，复核报告见
  `/tmp/a9-w26-audit-p1aF0M/REVIEW.md`（R1 报告器未解析投影附件语义、R2 Electron Inspector 断言可接受
  缺行/乱序/重复、R3 新增投影用例时移除了原审批与失败顺序签发断言、R4 共享 driver 新协议破坏
  W24/W25 profile 兼容性）。ADR-0120 记录四项修复范围与 WIN7-27 新候选授权。

### 14.1 四项修复范围（逐项对应复核 R1～R4）

| ID | 范围 | 可观察成功条件 |
|---|---|---|
| R1 | 统一机器可读投影证据格式，让报告器实际解析附件 | 正式 driver 导出 `A9_PROJECTION_QUERY_EXPORT` 与 `A9_PROJECTION_DOM_EXPORT`（schema_version 1）JSON 附件；报告器解析附件字节，交叉核对会话、event/turn ID、查询顺序与 DOM 结果，并拒绝内容矛盾（非 JSON、另一会话、空事件、结果不符）与旧新轮次 turn ID 相同 |
| R2 | 加强 Electron driver 的 Inspector 判定 | 按 `LAST_60_BY_EVENT_ID_ASC` 有界显示范围逐行核对 event ID、turn ID、文本与顺序；覆盖去重、切换会话无残留并切回复原、旧事件补载后结果不变；加入缺行、乱序、重复、残留负向检查且负向必须失败 |
| R3 | 保留原审批、拒绝零副作用、失败状态与查询重试断言，再追加投影验收 | `W27-04-APPROVAL-FAILURE-ORDER` 四项原有要求回到实际 kit 并由 driver 实际断言；投影用例独立新增；verifier 的用例数量与 assertion 集合共同强制，缺失任一即拒绝签发 |
| R4 | 新 driver 流程限定到支持它的新候选与开发机 fixture | 故障轮次、较新成功轮次与投影导出只在显式启用新协议的 WIN7-27 与开发机 fixture 生效；历史 W23/W24/W25 profile 走兼容路径；补 fixture/协议级回归，不以闭包存在判兼容 |

### 14.2 允许路径（在 §3 基础上追加）

- `src/shell/product/renderer/a9-workbench.js`：仅为 Inspector 时间线行增加稳定的 `data-event-id`/
  `data-turn-id` 身份属性，不改变布局、文案、排序、去重或有界显示规则。
- `src/shell/tests/product/a9-06-driver-entry.cjs`、`run-a9-06-electron-smoke.mjs`：driver 协议开关、
  逐行 Inspector 断言、负向敏感性检查与投影导出。
- `scripts/release/build-a9-product-v3.mjs`、`scripts/release/test/a9-package.test.mjs`：WIN7-27 profile、
  kit 用例恢复与新增、报告器联动与历史 profile 协议回归。

### 14.3 边界与不做的事

- 不重写已验证有效的 Renderer 投影修复（`projectOutcome`/`renderTimeline` 既有语义保持不变）；
  不修改 native helper、Runner/Policy、IPC 契约、SQLite schema、权限模式或秘密边界。
- WIN7-25/26 的源码提交、out-a/out-b、ZIP、manifest、kit、lock、authority、构建树与复核证据全部冻结，
  不得覆盖、改名或重判；历史 W23/W24/W25 profile 的 `release/**` 合同保持原字节。
- 不新增依赖、运行时或高权限产品接口；负向检查在测试侧观察值副本上进行，不做故障注入到冻结源码。
- 本地提交不推送；候选哈希形成后仍须候选外独立 `WIN7_27_RELEASE_AUTHORITY` 与 SHA-256 pin；
  开发机 fixture 不构成真实 Provider 或普通用户非提升 Win7 PASS。

### 14.4 WIN7-27 新增与恢复用例

- `W27-03-INSPECTOR-PERSISTED-RESTART`：重启后 Inspector 逐行等于当前会话查询的最近有界范围；包含无
  `turnId` 的会话事件与工具/终态事件；切换会话无残留且切回复原；`projection_evidence` 必须绑定查询导出
  与 DOM 导出附件及其哈希。
- `W27-04-APPROVAL-FAILURE-ORDER`（恢复）：`approval_resolved` 先于恢复的 `tool_start`；拒绝无目标副作用；
  非零退出/工具错误/取消/清理未确认不得标记成功；历史查询失败后可见重试且无重复事件。
- `W27-09-LATEST-OUTCOME-PROJECTION`（新增）：真实旧 `failed · not_applicable` 轮次早于较新
  `completed · verified` 轮次；两者 turn ID 必须不同（相同即拒绝）；重启后与旧事件补载后，DOM 全局结果与
  最新持久化轮次一致，最新终态行绑定较新成功 turn ID。

未执行普通用户非提升 Win7 当前候选验证前保持 `WIN7_27_NOT_PERFORMED`；本任务不重签 WIN7-22 或 Alpha/RC。

## 15. WIN7-27 复核四项验收缺口修复与 WIN7-28 授权（2026-09-10）

- 修复基线为 `32c5f6b0443a1f82eb4c24179378bca7ec954d69`（`codex/ui-optimization`），继续在当前工作区实施，
  保留既有未提交修改（Alpha 2 的 ADR-0117/A9-16 草稿、`docs/REMOTE_WINDOWS_CONNECTIONS.md`、`.trae/**`、
  `docs/plans/WIN7_25_VALIDATION_GAP_REPAIR_PLAN.md`、`docs/plans/WIN7_27_ACCEPTANCE_GAPS_REPAIR_PLAN.md`），
  这些内容不混入本次提交。
- 只读复核结论：`32c5f6b` 有实质改进，但仍有四项 P2 级验收逻辑缺口；复核报告见
  `/tmp/a9-w27-review-upl8xm/REVIEW.md`，原反例脚本见同目录 `review-probes.cjs`。修复方案见
  `docs/plans/WIN7_27_ACCEPTANCE_GAPS_REPAIR_PLAN.md`（该方案本身不因此成为批准记录）。ADR-0121 记录
  本次修复范围与 WIN7-28 新候选授权。

### 15.1 四项缺口修复范围（逐项对应复核 F1～F4）

| ID | 范围 | 可观察成功条件 |
|---|---|---|
| F1 | 让 DOM 实际结果与最新持久化 turn 身份真正参与报告判定 | 报告器解析并强制校验 DOM 附件的 `displayed_outcome`、`latest_persisted_turn_id` 与阶段标识；以附件为唯一事实来源与查询最新终态、snapshot 独立采集的 turn 身份交叉比较，报告平行字段只能由附件推导；结果不符、turn 不符、字段缺失、类型错误、阶段/会话错绑、旧新轮次同 turn ID（重算哈希后）一律拒绝 |
| F2 | 把"非空/关键词"升级为独立推导的逐行内容核对 | 查询导出携带重建显示文本所需的最小脱敏事实；期望行表示由查询事实独立推导，实际行只从 DOM 观察；`LAST_60_BY_EVENT_ID_ASC` 的行数、event ID、turn ID、类型、内容与顺序逐行比较并去重，切回/补载复用同一判定；保留 ID 与标签但替换关键内容、交换两行文字、替换时间或另一轮次内容，均使正向判定所用同一函数失败 |
| F3 | 真实覆盖审批恢复顺序与四项旧集成要求 | 受控审批场景必须实际出现恢复后的 `tool_start`，且与 `approval_resolved` 绑定同一 conversation/task/turn/工具目标、决定 event ID 更早；拒绝场景记录目标前后存在性与字节哈希；非零退出、工具错误、取消、清理未确认分项覆盖且不得标记 verified success；历史查询失败后可见重试并去重（隔离实例内记录注入点与证据等级）；无安全接缝的子项记 `NOT_PERFORMED`，不以其他场景代替 |
| F4 | 证明旧事件真的在后续分页中被加载 | 构造旧失败终态位于首次查询范围之外的受控会话；重启后 `hasMore=true` 且旧失败不在首批；点击真实"加载更早记录"，记录正式查询的 `beforeEventId`、响应页与旧事件身份；证明旧失败经分页进入已加载历史，最近有界投影与较新成功结果不变；查询附件保存真实 `limit`/`beforeEventId`/`hasMore`/返回范围 |

### 15.2 允许路径（在 §3 与 §14.2 基础上追加）

- `src/shell/tests/product/a9-06-driver-entry.cjs`、`run-a9-06-electron-smoke.mjs`：观察值导出、逐行/
  结果判定、真实审批/失败/重试/分页场景与共享投影契约接入。
- `scripts/release/test/a9-package.test.mjs`：F1～F4 正负向回归、基线与协议兼容检查。
- `scripts/release/build-a9-product-v3.mjs`：仅新增 WIN7-28 profile 与对应用例，保留历史候选要求。
- `release/win7-product-v3/` 下 WIN7-28 的 lock、integrity、report、smoke、共享投影契约模块、
  CMD 包装与验收说明；不得改写 W25/W26/W27 的冻结 release 文件。
- 必要的 A9-15 任务补充、`docs/STATUS.md`、`docs/tasks/README.md`、`release/win7-product-v3/README.md`
  与新增 ADR；不改写 Accepted ADR 正文。

### 15.3 边界与不做的事

- 不重写已验证有效的 Renderer 投影算法；不修改 native helper、Runner/Policy、IPC 契约、SQLite schema、
  权限模式或秘密边界；不开放 Alpha 2。
- WIN7-25/26/27 的源码身份、ZIP、manifest、kit、lock、authority、构建树与历史证据全部冻结，不得覆盖
  或改判；历史 W23/W24/W25 profile 的 `release/**` 合同保持原字节。
- 不新增运行时依赖；查询导出只含重建显示文本所需的最小脱敏事实，不无差别导出完整 payload 或秘密。
- 故障注入只在隔离测试实例内、以记录清楚的测试替身进行，不修改冻结源码、不暴露产品高权限测试接口、
  不降低真实清理保证、不把模拟宣称为真实 OS 故障。
- 本地提交不推送；候选哈希形成后仍须候选外独立 `WIN7_28_RELEASE_AUTHORITY` 与 SHA-256 pin；
  开发机 fixture 不构成真实 Provider 或普通用户非提升 Win7 PASS。

### 15.4 WIN7-28 用例

- `W28-03-INSPECTOR-PERSISTED-RESTART`：重启后 Inspector 逐行等于当前会话查询的最近有界范围；行内容
  经独立推导逐行核对；切换会话无残留且切回复原；`projection_evidence` 绑定查询与 DOM 附件及哈希，
  DOM 附件的 `displayed_outcome` 与 `latest_persisted_turn_id` 必须与查询最新终态一致。
- `W28-04-APPROVAL-FAILURE-ORDER`：真实批准场景必须出现恢复后的 `tool_start` 且晚于决定；拒绝场景目标
  字节哈希不变；非零退出/工具错误/取消/清理未确认分项不得标记 verified success；历史查询失败后可见
  重试且无重复事件。
- `W28-09-LATEST-OUTCOME-PROJECTION`：真实旧 `failed · not_applicable` 轮次落在首次查询范围之外，重启
  后 `hasMore=true`；经真实分页加载后，较新 `completed · verified` 结果与最新持久化轮次保持一致，旧新
  turn ID 相同即拒绝。
- `W28-10-OLDER-EVENT-PAGINATION`（新增）：独立记录分页请求与响应事实（`beforeEventId`、返回范围、
  旧事件身份），证明旧失败经分页加入已加载历史；无分页动作时该项记 `NOT_PERFORMED`。

未执行普通用户非提升 Win7 当前候选验证前保持 `WIN7_28_NOT_PERFORMED`；本任务不重签 WIN7-22/27 或 Alpha/RC。

## 16. WIN7-28 普通用户实机收口（2026-09-11）

- 冻结身份：源码 `d71807fa0d0f011d9c35104e7cd6dab62058ffa5`；ZIP
  `f1b6730bfa4cbc9d0d2955c2659d97b7a65c161efdc78cc4a7381bbad0a08351`；manifest
  `fe6589b49e820fb9cecf33f57ebba6d89109af4de2df9191232226aca83dbef2`；formal input lock
  `7c222010841438a61df0f4f7fc2762a7058e3c5b3bea5102ed612ec51cb5d082`；候选外 release authority
  `7b6c240b54a9dead83e3fd4c6c7f73493f72eb715010caedf75fd33a5abac1e7`。
- Windows 7 SP1 build 7601 x64 上由普通用户 `dccs-chaizl-pc\agent`、Medium Mandatory Level、非提升
  桌面令牌直接执行 10/10 当前候选用例；自动产品 smoke 75/75 assertions PASS，包含独立 retry、重启
  Inspector、审批/失败顺序、Stop 清理、搜索/焦点、真实分页与最新结果投影。
- 真实 Provider 以 `REAL_NON_FIXTURE` / `tool_calling` 完成正式 UI 多工具轮次，实际执行
  list/read/edit/Shell/read 并由退出 0 的 Shell 检查验证写入结果；前后文件哈希均纳入原始证据。
- 前置、后置完整性均 PASS，候选相关残留进程为 0；42 个文本/JSON 证据文件的凭据值扫描零命中，选定
  running/completed 截图另经人工检查未见凭据材料。
- 打包内正式 verifier 对报告、证据哈希、必需断言与三组投影附件全部校验通过：报告 SHA-256
  `cc9b422d228b04e5d798c5b385a1b7e5a1414a28aa4587e2b1299c08085eb267`，本机返回证据与目标机证据根均 PASS。
  据此本任务状态更新为 `COMPLETE / A9_15_WIN7_UI_INTEGRATION_PASS / WIN7_28_PASS`。
- 该裁决严格限于 A9-15 UI 集成合同，不重签 `A9_14_WIN7_22_GO_FOR_ALPHA`，不构成新的 Alpha 或 RC PASS。
  管理 SSH 只用于传输、回收、哈希与最终证据处理，不替代普通用户产品证据；原始报告、截图、SQLite、
  候选二进制和凭据材料继续保存在候选外，不纳入 Git。仓库收口报告见
  [`a9_win7_28_ui_integration_closeout_2026-09-11.md`](../reports/2026-09/a9_win7_28_ui_integration_closeout_2026-09-11.md)。

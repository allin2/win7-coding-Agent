# A9-19 / WIN7-37 运行过程实时可见与布局二期换发合同

状态：`APPROVED_FOR_IMPLEMENTATION`（2026-09-25，负责人批准编号、范围、C14 允许路径、实机目标规则与外部执行方式；决策 ADR-0136）。
A9-19 任务书 §13 为正式实施入口。批准本合同不等于候选外 authority 或实机 PASS；ZIP 精确哈希确定后仍须另行签发
候选外 `WIN7_37_RELEASE_AUTHORITY`。

## 1. 已证实的起点

- WIN7-36（ZIP SHA-256 `8f730c5ae9ab86d83ecbfe3033a00e32a935dd5217d3ab30e4c75710adbe2a3a`，源码 `f0e80ec`）已在负责人批准的
  可达响应式状态等效裁决下取得 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`；该候选、authority、报告与证据保持不可变。
- A9-19 在 `codex/a9-alpha2` 开发机完成：`b4c138b`（运行中轮次实时可见、模型输出内存预览、扫描让出事件循环、布局二期）与
  `9d82ed1`（对话/工作区切换后保持桌面左栏）。Shell 376/376、workspace 211/211、`verify:quick`、开发机渲染探针与 DOCS_03 闸门通过。
- 2026-09-24 Win7 **探索性运行（非验收）**：WIN7-36 冻结包叠加 A9-19 的 5 个文件，`agent` 普通用户、真实 Provider；运行中工具卡、
  已运行时长与模型输出预览均在落盘后 ≤1.1 s 出现在界面；同时发现并修复了切换后左栏被收起（`9d82ed1`，Win7 尚未复核）。
  探索性运行不是验收证据，WIN7-37 的所有用例必须在新候选上直接执行。
- 已知残留：`freezeTurnBaseline` 末尾的 checkpoint 往返校验约 0.4 s（`checkpoint-manager.ts` 不在 A9-19 白名单）；Shell 真正增量输出
  （A9-16 S01–S06，需 helper 协议 v3）不在本候选内。二者不作为 WIN7-37 的通过条件，报告中如实列为已知残留。

## 2. 身份与边界

1. 新编号 `WIN7-37`。版本与可执行能力集沿用 `WIN7-CODING-AGENT-A9-ALPHA1` / `0.3.0-alpha.1`（与 WIN7-36 一致）；
   Review 入口继续 fail-closed，Shell 运行中增量输出不开放。
2. 产品源码为 A9-19 已提交内容（`b4c138b`、`9d82ed1`）；本合同**不新增产品改动**。若构建或预检暴露产品缺陷，停止并另行报告，
   不在换发过程中顺带修复。
3. 结论上限：`A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`（覆盖 W37-01～W37-21）。不重签 WIN7-22/28/36 的既有结论，
   不签发 Alpha 2、Review、Shell streaming 或 RC PASS；`<=799px` 抽屉分支继续 `PRODUCT_UNREACHABLE / NOT_VERIFIED`。

## 3. C14 允许路径（批准后生效）

- 发布管线：`scripts/release/build-a9-product-v3.mjs`（新增 `A9-19-INPUTS-LIVE-PROGRESS-WIN7-37` profile 与候选集合登记）、
  `scripts/release/test/a9-package.test.mjs`（W37 正向与旧键反例）。
- `release/win7-product-v3/` 下新增：`a9-19-win7-37-input-lock.json`、`a9-package-integrity-w37.cjs`、`a9-win7-37-report.cjs`、
  `a9-win7-37-smoke.cjs`、`RUN_A9_19_W37_INTEGRITY.cmd`、`RUN_WIN7_37_REPORT_VERIFY.cmd`、`A9_19_WIN7_37_VALIDATION.md`；
  更新该目录 `README.md`。不得修改 WIN7-36 及更早的任何发布文件。
- G2 实时性自动断言：`src/shell/tests/product/a9-06-driver-entry.cjs`（仅新增 W37 实时性旅程；既有旅程与历史键语义不变）。
- 文档：`docs/tasks/A9_19_LIVE_PROGRESS_AND_WORKBENCH_LAYOUT.md`、`docs/tasks/README.md`、`docs/STATUS.md`、`docs/STATUS_LOG.md`、
  本文件、`docs/plans/A9_19_WIN7_37_ACCEPTANCE_HANDOFF.md`（候选冻结后填写 §3）、`docs/DECISIONS.md`（仅 ADR-0136）、
  `docs/DECISIONS_INDEX.md`、`docs/reports/2026-09/**`。

## 4. 用例（W37-01～W37-21）

- W37-01～W37-15：继承 WIN7-36 的 15 项，语义不变，键与错误码重基线为 W37。
- W37-16 运行过程实时可见：G2 以延迟流式 fixture 自动断言首个 `tool_start`/`model_note` 在 `turn_completed` 前进入产品 DOM，
  且逐事件“落盘 → DOM 可见”≤1.5 s；G3 以真实 Provider 复核（每秒时间线 + 截图）。
- W37-17 模型输出实时预览：G2 fixture 断言预览在完成前出现且完成后消失；同时断言被拆分到多个 chunk 的测试秘密及其前缀
  不出现在任何预览快照、DOM 或报告中；G3 真实 Provider 复核预览出现。
- W37-18 对话行标题：真实 1366×768 / 125% DPI 下前 6 行标题各至少 6 个中文字符宽度，时间为短格式。
- W37-19 对话区高度：实际 1079×540 视口运行中对话流 ≥ 视口高度 55%。
- W37-20 左栏保持：桌面宽度下新建/切换对话、切换工作区后 `.workbench` 无 `rail-closed`，左栏可见。
- W37-21 头部与文案：头部仅权限与运行状态；无 `REQUEST`/`CONVERSATIONS`/`INSPECTOR`/`tool_calling` 等文案；
  左栏无 Review 页签与常驻停止按钮。

## 5. 执行门

1. **管线与开发机门**（审核方）：新 profile、lock、Kit ID、W37 键、`WIN7_37_RELEASE_AUTHORITY`、候选作用域错误码全部重基线；
   构建期旧候选字面量守卫拒绝任何 W36 残留（正向与注入旧键的反例均为候选前置）；package 全集、Shell 全量、workspace 全量、
   `verify:quick`、`docs:check`、`git diff --check`、开发机渲染探针与 DOCS_03 闸门通过。
2. **提交与双构建**：只暂存 §3 路径形成一个本地提交，不推送、不打标签；两个独立干净工作树从同一提交构建，ZIP 逐字节一致，
   manifest `source_dirty=false`、`external_acceptance_eligible=true`；仓库 verifier 预检通过后冻结到 `.acceptance/candidates/WIN7-37/`。
3. **授权门**：向负责人提交源码提交、input lock、manifest、ZIP 的精确 SHA-256；负责人单独批准候选外 `WIN7_37_RELEASE_AUTHORITY`
   与独立 pin 之前，Win7 G1/G2/G3 均 `NOT_PERFORMED`。
4. **实机执行**：按 [交接书](A9_19_WIN7_37_ACCEPTANCE_HANDOFF.md) 由执行方在负责人确认的 Win7 地址、`agent` 普通用户非提升桌面
   执行 G1→G2→G3→报告；任一硬门失败即停止下游，失败证据原样保留，未执行项记 `NOT_PERFORMED`。
5. **审核与裁决**：审核方基于原始证据逐项核对并给出建议；负责人裁决。

## 6. 需负责人确认

1. 编号 `WIN7-37` 与 §2 的身份、结论上限。
2. §3 的 C14 允许路径（含为 G2 实时性断言修改共享驱动 `a9-06-driver-entry.cjs`）。
3. 实机目标地址：当前已知 `192.168.1.3`，2026-09-25 不可达；执行前以负责人确认的地址为准，地址变化不需要重批本合同，
   但候选外 authority 必须绑定实际执行地址。
4. 实机执行方：按交接书由外部执行模型执行，审核方复核。

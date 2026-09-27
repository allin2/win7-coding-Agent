# A9-25 — WIN7-40 换发与实机验收（A9-24 改动审阅）

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: RELEASE_REISSUE_AND_WIN7_ACCEPTANCE
Target Branch: codex/a9-alpha2
Source Baseline: codex/a9-alpha2 @ 本任务书批准提交（A9-24 已于 c136d12 并入）
Candidate: WIN7-40
Phase-Gate: A9_25_KIT_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0144
```

> 2026-09-27 负责人批准本任务书，§6 Q1～Q3 按建议（保留预演；不改验收机 DPI 设置；W40-01～15 全量回归）。批准本任务书不等于候选外 authority 或实机 PASS。
> 流程、硬门与取证沿用 [A9-23](A9_23_WIN7_39_REISSUE_AND_ACCEPTANCE.md) 已验证的做法（ADR-0141/0142 与 WIN7-39 实机交接书附录 A、B）。

## 1. 背景

- [A9-24](A9_24_REVIEW_MODE.md)（ADR-0143）“先写后审”的改动审阅已在开发机通过（`A9_24_DEVELOPER_VERIFIED`，`c136d12`）；真实 Electron 与 Win7 为 `NOT_PERFORMED`。
- WIN7-39（`7ec9db7`）已签发 `A9_23_WIN7_39_A9_20_A9_21_PASS`，并记录已知限制：W39-06 Stop 后子进程退出时间未直接记录；W39-05/13 截图未显示 Diff 与 checkpoint 视图。
- 本任务以当前主线换发 WIN7-40，在 Win7 实机验证 A9-24，同时对 WIN7-39 的 15 项做回归，并补上上述两项取证缺口。

## 2. 身份与边界

1. 编号 `WIN7-40`；版本与能力集标识沿用 `WIN7-CODING-AGENT-A9-ALPHA1` / `0.3.0-alpha.1`（与 WIN7-37/39 相同，不据此宣称 Alpha 2 PASS）。
2. **不做产品改动**。实机或开发机暴露产品缺陷时，停止并报告，另立任务修复。
3. 结论上限 `A9_25_WIN7_40_A9_24_PASS`（覆盖 §4 全部用例，可部分签发）；不改判 WIN7-39 及更早候选的结论。
4. 硬门与 WIN7-39 相同：双独立干净工作树构建、ZIP 逐字节一致；候选外 authority 与独立 SHA-256 pin；普通用户 `agent` Medium 非提升；
   证据结构化带哈希；秘密扫描零命中；后飞行零残留，不得依赖人工终止。
5. WIN7-39 及更早的发布文件、`w39` 与更早驱动旅程、历史断言键一律不改。

## 3. C14 允许路径

- 发布管线：`scripts/release/build-a9-product-v3.mjs`（新增 `A9-25-INPUTS-WIN7-40` profile 与候选集合登记）、`scripts/release/test/a9-package.test.mjs`。
- `release/win7-product-v3/` 下新增：`a9-25-win7-40-input-lock.json`、`a9-package-integrity-w40.cjs`、`a9-win7-40-report.cjs`、`a9-win7-40-smoke.cjs`、
  `RUN_A9_25_W40_INTEGRITY.cmd`、`RUN_WIN7_40_REPORT_VERIFY.cmd`、`A9_25_WIN7_40_VALIDATION.md`，以及文件名含 `w40` 的夹具；更新该目录 `README.md`。
- 实机驱动：`src/shell/tests/product/a9-06-driver-entry.cjs` 只新增 `w40*` 旅程及其辅助函数；`w39` 与更早旅程不变。驱动单测与夹具只在 `src/shell/tests/product/**` 新增。
- 文档：本任务书、`docs/tasks/README.md`、`docs/STATUS.md`、`docs/STATUS_LOG.md`、`docs/DECISIONS.md`（ADR-0144）、`docs/DECISIONS_INDEX.md`、
  `docs/plans/A9_25_*`、`docs/reports/2026-09/**`、A9-24 任务书的状态记录段。

## 4. 用例（W40）

W40-01～15 由 W39-01～15 机械派生（判定口径不变，编号与候选前缀重基线），另有两处收紧；W40-16～22 为 A9-24 新增。

| 编号 | 判定要点（均来自产品运行后的观察） |
|---|---|
| W40-01～15 | 同 W39-01～15 |
| W40-06（收紧） | 新增 `w40_stop` 旅程：点击 Stop 后轮询进程表，记录 Shell 子进程 PID 消失的毫秒数，要求 ≤ 5000 ms（补 WIN7-39 已知限制 6） |
| W40-05/13（收紧） | 截图须显示检查器“改动”页签中的对应轮次与文件 Diff，不再以对话流截图代替 |
| W40-16 | 真实轮次（本地 fixture 模型：修改 1 个、新建 1 个文件）结束后出现改动摘要卡；文件数与增删计数与 `a9.diff.get` 的 `review` 一致；截图 |
| W40-17 | 逐文件撤销与撤回：点击撤销后 5 秒内撤回，文件哈希不变；再次撤销并等待到时，文件恢复到本轮前哈希，状态“已撤销”；重启后仍为“已撤销”，再次撤销不重复作用 |
| W40-18 | 整轮撤销遇外部修改：驱动在轮后直接改写其中一个文件，整轮撤销后该文件内容不变并显示“外部修改”文案，其余文件恢复 |
| W40-19 | 后续轮次修改：第 2 轮再改同一文件，撤销第 1 轮该文件被拒绝并显示“第 2 轮又被修改”，零写入；撤销第 2 轮后再撤销第 1 轮成功 |
| W40-20 | 命令产生的变化：Shell 生成的可恢复文件列入该轮改动并可撤销；无法恢复项若能在不改产品的前提下触发，则须以“无法撤销”与原因显示，否则标 `NOT_PERFORMED` 并写明原因 |
| W40-21 | 不阻断与模式：有未撤销改动时可立即开始下一轮；权限对话框只有 Full Access / Read Only；工作区设置为 `review` 时写操作结构化拒绝、零写入 |
| W40-22 | 布局：实机窗口下“改动”页签与摘要卡无页面横向滚动、按钮可见可达（DOM 几何量测 + 截图）；验收机当前 DPI 为 125% 时同时记录，否则 125% 标 `NOT_PERFORMED`，不得为此修改系统设置 |

## 5. 执行步骤与门

1. **套件实现**（新会话，按套件交接书）：W40 套件从 W39 套件机械派生（`writeCandidateDriver` 重基线 W39→W40，残留守卫覆盖 W39 字面量），
   新增 `w40*` 旅程与断言；开发机门：打包测试、shell 全量、`verify:quick`、`docs:check`、`git diff --check`，外加 W40-16～22 与两处收紧的注入反例。
2. **Win7 套件预演**：非正式构建，以 `agent` 运行 G2 smoke，结果标 `REHEARSAL_NOT_ELIGIBLE`，只用于修正套件（沿用 A9-23 §7 Q1 的条件）。
3. **正式实机交接书**：以 WIN7-39 实机交接书（含附录 A 路径勘误与附录 B 报告校验）为模板，候选根为 `<W>\package\Win7CodingAgent-0.3.0-alpha.1-win7-x64\`，计划任务 XML 以 CP936 注册。
4. **候选冻结**：同一提交两个独立干净工作树构建，ZIP 逐字节一致，候选自带校验拒绝错误哈希与错误 pin。
5. **门 A**：负责人签发候选外 `WIN7_40_RELEASE_AUTHORITY` 与独立 pin。
6. **实机执行** → 7. **审核**（组装正式报告并在 Win7 以 `agent` 复核）→ 8. **门 B**：负责人裁决；更新本任务书、A9-24、STATUS 与 STATUS_LOG。

## 6. 开放问题

- **Q1 是否预演**：建议保留第 2 步（WIN7-39 的套件经三次预演才稳定）；若负责人希望缩短周期，可在第 1 步开发机门通过后直接进入第 3 步，风险是套件缺陷在正式运行中暴露、消耗候选编号。
- **Q2 W40-22 的 DPI**：不修改验收机系统设置；是否需要另行安排 125% DPI 的会话，由负责人决定。
- **Q3 回归范围**：建议 W40-01～15 全量回归（自动运行，增量成本低）；替代方案是只跑 A9-24 相关用例，但会失去对 A9-20/A9-21 在新候选上的回归证据。

## 7. 候选身份（冻结后填写）

未冻结。

## 8. 执行记录

- 2026-09-27：负责人批准；发出 [W40 套件交接书](../plans/A9_25_W40_KIT_HANDOFF.md)（第 1 步）。

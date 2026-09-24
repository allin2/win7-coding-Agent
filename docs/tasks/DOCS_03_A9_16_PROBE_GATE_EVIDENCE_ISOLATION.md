# DOCS_03 — A9-16 几何探针闸门与归档证据隔离

```text
Status: PROPOSED_FOR_APPROVAL
Task Type: EVIDENCE_GOVERNANCE
Target Branch: codex/a9-alpha2
Phase-Gate: NOT_STARTED
Win7-Validation: N/A
```

> 本任务书是草案，承接 [A9-16 任务书](A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md) §19 登记的待办。
> 负责人批准前，不得修改 §4 允许路径中的实现文件（AGENTS.md C14）。A9-16 §7 的白名单虽含
> `docs/reports/2026-09/**`，但那是 U01–U07 UI 子集的授权，本任务不借用。

## 1. 问题与证据

闸门脚本 `docs/reports/2026-09/a9-16-ui-evidence/win7-35-capacity-repair/verify-geometry-probe.mjs`
（下称“闸门”）在提交 `f0e80ec` 中随 WIN7-36 修复入库，同时承担两个角色：WIN7-36 开发机几何证据的
生成器，以及后续 CSS 修改的失败式回归门（`a9-workbench-contract.test.ts` 第 839 行注释）。两个角色
共用同一输出目录，造成两处缺陷：

1. **默认覆盖归档证据**：未设置 `A9_GEOMETRY_OUT` 时输出目录为脚本所在目录（第 23–25 行），
   重跑即重写已跟踪的 `verify-target-540.json`、`verify-clamped-584.json`、`verify-selector-miss.json`
   （第 84–85 行）与 `verify-geometry-probe-summary.json`（第 261–262 行），并生成未跟踪的
   `*.dom.html`、`*.chrome.log`（第 63–65 行）。按 `REPLAY.md` 的“Gate (preferred)”命令复现即触发。
   这与“报告是不可变时间点证据”（`docs/reports/README.md`）冲突；生成的 `*.dom.html` 也会让
   `docs:check` 报红（DOCS_02 已改为检查未跟踪、未忽略文件）。
2. **测量源未绑定**：`probe/index.html` 第 8 行直接加载工作区中的
   `src/shell/product/renderer/a9-workbench.css`。重跑测的是**当前** CSS，写回的却是绑定 `f0e80ec`
   的证据，结果中也没有记录被测源码身份。2026-09-24 当前 CSS 与 `f0e80ec` 的 SHA-256 相同
   （`c6fdf59a…`），但后续任何 CSS 修改都会让重跑结果与归档证据悄然混淆。

## 2. 目标

闸门重跑永远不改动仓库中已归档的证据；每次运行都记录被测源码身份，并说明与归档基线是否同源。
闸门的判定逻辑与期望值保持不变。

## 3. 范围

### 3.1 必须完成

1. **默认输出移出仓库**：未设置 `A9_GEOMETRY_OUT` 时，用 `fs.mkdtempSync` 在 `os.tmpdir()` 下创建
   `a9-geometry-probe-` 前缀的新目录作为输出目录，并在标准输出打印该路径。
2. **拒绝写入仓库受跟踪区域**：解析后的输出目录若位于仓库工作树内且未被 Git 忽略
   （以 `git check-ignore -q` 判定），立即以退出码 2 结束，输出稳定错误码
   `A9_GEOMETRY_VERIFY_OUT_REFUSED`，且不写任何文件。无法调用 `git` 而输出目录在仓库内时同样拒绝
   （fail-closed）。被忽略的路径（如 `.acceptance/**`）允许通过 `A9_GEOMETRY_OUT` 显式指定。
   该检查必须早于 Chrome 查找，保证无 Chrome 的环境也能验证拒绝逻辑。
3. **记录被测源码身份**：summary 新增 `source_identity`：
   - `head_commit`（`git rev-parse HEAD`）与四个被测文件的工作区 SHA-256：
     `src/shell/product/renderer/a9-workbench.css`、`probe/index.html`、`probe/probe.css`、`probe/probe.js`；
   - `dirty`：上述四个文件是否存在未提交修改；
   - `archived_baseline`：固定为 `f0e80ecfabaaf8414d2778e4481f7e8d68e54f40`，并给出
     `matches_archived_source`：四个文件的当前内容与该提交中的对应内容是否逐字节一致。
   PASS/FAIL 判定不依赖该字段；它只用于解释结果。
4. **与归档结果对比（仅报告）**：每个用例把 `status`、`capacity_pass`、`innerWidth`/`innerHeight`、
   `list_client_height`、`fully_visible_rows` 与同名归档 `verify-<tag>.json` 比较，写入
   `archive_drift` 列表。漂移不改变退出码。
5. **保持合同**：`a9-workbench-contract.test.ts` 锁定的全部字符串（`A9_GEOMETRY_VERIFY_FAIL`、
   `process.exit(1)`、`requireWorkbenchOrigin`、`INVALID_VIEWPORT_CLAMPED_584`、
   `simulate=selector-miss`、`stop_in_viewport`）以及三组用例的期望值不得改动；不修改该测试文件。
6. **复现说明**：在 `REPLAY.md` 末尾追加带日期的更新一节，原文不改。写明：默认输出在系统临时目录；
   归档文件不可覆盖；要严格复现 WIN7-36 归档证据，应在 `f0e80ec` 的临时 `git worktree` 中运行闸门；
   `matches_archived_source=false` 时结果不能与归档证据直接比较。
7. **自测**：新增 `scripts/test_a9_geometry_probe_gate.mjs`，不依赖 Chrome，至少覆盖：
   - `A9_GEOMETRY_OUT` 指向归档目录：退出码 2、输出 `A9_GEOMETRY_VERIFY_OUT_REFUSED`，且运行前后
     该目录全部已跟踪文件的 SHA-256 不变；
   - `A9_GEOMETRY_OUT` 指向仓库内另一个未忽略目录：同样拒绝；
   - 未设置 `A9_GEOMETRY_OUT` 且 `A9_GEOMETRY_CHROME` 指向不存在的路径：不在仓库内写任何文件
     （运行前后 `git status --porcelain` 一致）。
8. **负向对照**：用 `git show HEAD:` 取出旧闸门放入临时目录，运行上述拒绝用例，证明旧实现不输出
   `A9_GEOMETRY_VERIFY_OUT_REFUSED`；对照结果写入交付说明，不保留对照代码。

### 3.2 不做

- 不改动已归档的 `verify-*.json`、`verify-geometry-probe-summary.json`、`probe/**`，以及 `REPLAY.md` 原有文字。
- 不改变闸门的用例、期望值与 PASS/FAIL 判定；不修改产品 CSS/HTML/JS 或契约测试。
- 不自动创建 `f0e80ec` worktree（见 §8 开放问题 1）。
- 不改动 WIN7-36 及任何历史候选、manifest、authority 或运行证据。

## 4. 允许路径

- `docs/reports/2026-09/a9-16-ui-evidence/win7-35-capacity-repair/verify-geometry-probe.mjs`
- `docs/reports/2026-09/a9-16-ui-evidence/win7-35-capacity-repair/REPLAY.md`（仅末尾追加）
- `scripts/test_a9_geometry_probe_gate.mjs`（新增）
- `docs/tasks/DOCS_03_A9_16_PROBE_GATE_EVIDENCE_ISOLATION.md`、`docs/tasks/README.md`、
  `docs/tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md`（仅在 §19 追加处置结果）、
  `docs/STATUS.md`、`docs/STATUS_LOG.md`（状态回填）

## 5. 兼容性与依赖

- 闸门与自测是开发机工具，不进入任何 Win7 候选包：`scripts/release/build-a9-product-v3.mjs` 打包的
  合同文档只取任务书、PRD 与 `docs/status/` 下的一个 JSON，不含 `docs/reports/**`。因此
  `Win7-Validation: N/A`，也不影响任何已冻结候选的哈希。
- 仅使用 Node 内置模块与开发环境已有的 `git`、Chrome/Chromium；不新增依赖，无需 C15/C16 登记。
- 不影响接口、数据格式、Win7 兼容性或安全模型，不需要新增 ADR。

## 6. 验收标准

1. 开发机有 Chrome 时，在未设置 `A9_GEOMETRY_OUT` 的情况下运行闸门：输出 `A9_GEOMETRY_VERIFY_PASS`，
   退出码 0；输出目录位于系统临时目录；summary 含 `source_identity`，当前应为
   `matches_archived_source=true`，且 `archive_drift` 为空。
2. 上一步前后，`win7-35-capacity-repair/` 下全部已跟踪文件的 SHA-256 不变，`git status --porcelain` 不变。
3. `node scripts/test_a9_geometry_probe_gate.mjs` 全部通过，§3.1 第 8 项负向对照有记录。
4. `npm --prefix src/shell test -- --runInBand a9-workbench-contract` 通过（证明合同字符串未破坏）。
5. `npm run docs:check` 为 `ok=true`；`git diff --check` 通过；新文件为 UTF-8 无 BOM、LF。
6. 除 §4 允许路径外无其他文件改动。

## 7. 交付与状态回填

- 形成一个本地提交，提交说明写明第 1、2 项的哈希核对结果与负向对照结果。
- 回填本任务书 `Status`/`Phase-Gate` 为 `COMPLETE`，同步任务索引；在 A9-16 §19 追加处置结论；
  将 `STATUS.md`“当前阻断与待办”第 4 项标为已处置，并在 `STATUS_LOG.md` 追加时间线条目。
- 是否推送由负责人另行决定。

## 8. 开放问题（批准时请一并裁决）

1. **是否自动对齐归档源码**：可以让闸门在 `matches_archived_source=false` 时自动创建 `f0e80ec`
   临时 worktree 并在其中测量。建议不做：闸门的主要用途是当前 CSS 的回归门，自动切换源码会混淆这两个用途。
   严格复现改用 `REPLAY.md` 中的手工步骤。
2. **归档漂移是否判失败**：建议只报告不判失败。硬门已由用例中写死的期望值承担；归档结果来自
   特定开发机，换机器后字体与 Chrome 版本差异可能带来合理偏差，把漂移判为失败会重复设门且容易误报。
3. **期望值随 CSS 变更的归属**：之后若有获批任务合法修改左栏 CSS，导致 207px / 4 行等期望值变化，
   建议由该任务在自己的白名单内更新闸门期望，并另行归档新证据，不回写 WIN7-36 证据。本任务只登记这条规则，不修改期望值。

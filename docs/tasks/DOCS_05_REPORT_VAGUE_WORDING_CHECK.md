# DOCS_05 — 新报告模糊词检查

```text
Status: COMPLETE
Task Type: DOCUMENTATION_GOVERNANCE
Target Branch: codex/a9-alpha2
Phase-Gate: COMPLETE
Win7-Validation: N/A
Decision: ADR-0191 (Accepted)
```

> 2026-10-06 负责人看过“事后检查需先立任务书”的说明后回复“全部都做”，据此批准本任务。
> 实现仅限 §4 允许路径（AGENTS.md C14）。

## 1. 问题

[OUTPUT_STYLE.md](../OUTPUT_STYLE.md) W05 禁止在结论中使用模糊程度词。没有机器检查时，这条规则只靠作者自觉。
本任务在 `scripts/check_docs.mjs` 中增加一项检查，只针对新报告。

## 2. 规则

1. **检查范围**：`docs/reports/**/` 下文件名以 `_YYYY-MM-DD.md` 结尾、且日期不早于 `2026-10-06`（ADR-0190 生效日）的报告。
   其他文档和历史报告不检查。
2. **词表**：基本通过、基本完成、基本可用、基本没问题、应该可以、应该没问题、应该能、大概、差不多、理论上、预计通过、估计、似乎、好像。
   只收录复合词，避免误报“基本信息”“应该先……”这类正常用法。
3. **不检查的文本**：围栏代码块、行内代码、`>` 引用行、中文引号 “” 与「」内的文字（用于原文引用负责人或日志原话）。
4. **失败格式**：`kind` 为 `vague-wording`，带 `file`、`line` 和 `reason`（含命中词）。其余检查语义不变。

## 3. 现状

2026-10-06 只读扫描：本工作区 `docs/reports/` 中没有日期不早于 2026-10-06 的报告，启用后零命中。
全部文档中词表共命中 14 处，都在历史文档或规范示例中，不在检查范围内，不需要改。

## 4. 允许路径

- `scripts/check_docs.mjs`
- `scripts/test_check_docs.mjs`

文档：本任务书、`docs/tasks/README.md`、`docs/OUTPUT_STYLE.md`、`docs/DECISIONS.md`、`docs/DECISIONS_INDEX.md`、`docs/STATUS_LOG.md`。

## 5. 验证

```sh
node scripts/test_check_docs.mjs
npm run docs:check
git -c core.fsmonitor=false diff --check -- scripts/check_docs.mjs scripts/test_check_docs.mjs
```

新增测试至少覆盖：范围内报告命中时失败并带行号；生效日之前的报告放行；代码、引用和中文引号内的命中放行；
非报告文档放行。DOCS_02/DOCS_04 已有 12 个用例继续通过。
负向对照：用 `git show HEAD:scripts/check_docs.mjs` 的旧实现运行“范围内命中”用例，证明旧实现放行。

## 6. 交付记录

2026-10-06 实现完成。`node scripts/test_check_docs.mjs` 输出 16/16 PASS；`npm run docs:check` 通过；
负向对照中旧实现对范围内命中返回 `ok: true`，新实现返回 `vague-wording` 失败。仅开发机执行；本任务不涉及 Win7。

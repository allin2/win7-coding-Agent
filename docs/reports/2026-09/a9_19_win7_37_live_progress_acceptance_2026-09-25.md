# WIN7-37 实机验收收口：运行过程实时可见与布局二期（2026-09-25）

## 结论

同一冻结 WIN7-37 候选在 Win7 SP1 x64 普通用户非提权会话中，经候选自带报告器在 Win7 上核验，21/21 项为 `PASS`。
负责人于 2026-09-25 确认签发 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`。

W37-06 A03、W37-12、W37-13、W37-15 的 `PASS` 须连同负责人沿用的 WIN7-36 **可达响应式状态等效**口径阅读（ADR-0131）；
未发生的几何条件不写成直接实测。

## 绑定信息

| 绑定项 | 精确值 |
|---|---|
| 候选 / 源码 | WIN7-37 / `dd6cb1a9aeebb366478e155267996ea03653667b`（A9-19 `b4c138b` + `9d82ed1`） |
| ZIP SHA-256 | `4d70063254212ca581b7b3dac9f89edc81a2ba31a53b51a6b1c1d65667f167cf` |
| 独立 RELEASE_AUTHORITY SHA-256 | `0d8d4f9456f42da4692fea7d27c03edcd4f91df3ba6985b623233e095a9d0616` |
| 实机 run / 目标 | `85476889-099d-46b6-b8a4-666e8e0b5d77` / `192.168.1.3` |
| 身份 / 屏幕 | `dccs-chaizl-pc\agent`，Medium；1366×768，AppliedDPI=120，DPR 1.25；实际内容视口 1079×540 CSS px |
| 正式报告 SHA-256 | `f7a05f991264616a0b6bd6799a821d40c4d06ca26bbfbd50ca30a54bc00ba96c` |
| Win7 报告器输出 SHA-256 | `6bddf50701001e378364656f4c4affaad03e160ee37cd5741f107b71dc875e99` |
| 等效裁决 SHA-256 | `f2fefc7b3f42607731387920cc21fdfef0a8123cde10b1a9f17e205ef904f895` |

## 执行过程

执行方为外部模型，审核方为 Claude，按 [交接书](../../plans/A9_19_WIN7_37_ACCEPTANCE_HANDOFF.md) 进行：

1. **首轮**：G1 完整性通过；G2 打包自动 smoke 95/95，含新增 `live` 阶段；G3 真实 Provider 通过。
   审核发现 8 项证据不足：执行方自写驱动使用了无效选择器，且未执行部分 UI 用例。
2. **附录 A**：审核方把 WIN7-36 已验证的探针重基线并钉住哈希，执行方补跑 S1–S7。
   审核发现 W37-11 A03 与 W37-15 A02 仍缺证。原因是测量探针在持久化任务行写入前采样，最坏形态只出现“更早”一个组头。
   这是审核方探针的时序缺陷，不是产品失败。
3. **附录 B**：单步补跑 S1b，量测前先等待持久化的“进行中”组头（等待 630 ms）。
   最坏形态“进行中1 / 更早8 / 归档1”下完整可见 5 行，行高 36 px，Stop 与归档入口在视口内。
4. **附录 C**：审核方用候选内报告器 `init` 生成模板，组装正式报告，先在开发机预检。
   随后执行方在 Win7 上以 `agent` 运行 `RUN_WIN7_37_REPORT_VERIFY.cmd`：`REPORT_VERIFY_EXIT=0`，stderr 为空，
   输出 `status=PASS`、`verified_cases=21`、`direct_current_candidate_cases=21`、
   `disposition=A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`，候选身份与模板逐字段相等。

## 关键用例事实

- **运行过程实时可见（W37-16/17）**
  - G2 fixture 下，工具卡、模型说明与输出预览都在 `turn_completed` 前进入 DOM，拆分的测试密钥零泄露。
  - 真实 Provider 下，运行中工具卡、“已运行 N 秒 · 执行中”、Shell 说明与“模型正在输出”预览均先于完成出现。
- **布局二期**
  - 前 6 行标题每行可容纳 10 个汉字，时间为短格式（W37-18）。
  - 运行中对话流占视口 0.606（W37-19，审核方像素量测脚本与结果随证据保存）。
  - 切换工作区或对话后桌面左栏保持打开（W37-20）；头部与文案符合要求（W37-21）。
- **等待与停止（W37-05）**：真实 Shell 子进程运行 12.5 s，界面显示“正在执行工具：…”与“已运行 13秒”，没有百分比；Stop 后该 PID 消失。

## 证据位置

候选外证据留存在本机 `.acceptance/runs/WIN7-37/85476889-099d-46b6-b8a4-666e8e0b5d77/`：
首轮 `evidence/`、`supplement/`、`supplement-b/`、`supplement-c/`，以及正式报告、验证包、等效裁决、像素量测与秘密扫描所在的 `review/`，
另有各轮审核报告与 `RUN_LOG.md`。该目录被 Git 忽略，推送不会上传这些证据或冻结 ZIP，须按
[证据归档与取回](../../acceptance/EVIDENCE_ARCHIVE_RETRIEVAL.md) 独立保存。

## 边界与已知残留

- `<=799px` 抽屉分支保持 `PRODUCT_UNREACHABLE / NOT_VERIFIED`。WIN7-22～WIN7-36 的候选、证据与结论均未重写。
- 已知残留（不影响本结论）：
  - 基线冻结末尾的 checkpoint 往返校验约 0.4 s。
  - 左栏“进行中”分组在持久化任务行写入后才出现，实测滞后 0.6～2.3 s。
  - Shell 运行中真正的增量输出（A9-16 S01–S06）不在本候选内。
- 本结论不构成完整 Alpha 2、Review、Shell streaming、RC 或产品发布 PASS。

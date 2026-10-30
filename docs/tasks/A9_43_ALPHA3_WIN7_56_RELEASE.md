# A9-43 — v0.3.0-alpha.3（WIN7-56）版本整合、冻结与正式验收

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: RELEASE_REISSUE_AND_WIN7_ACCEPTANCE
Target Branch: main
Source Baseline: 63e173fc90f81c9c5ddcafe3dabf18f03cdbdad2
Phase-Gate: A9_43_IMPLEMENTATION_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0289, ADR-0290, ADR-0304
```

本任务把 WIN7-55（上一个已签发候选）之后完成的四项工作合成一个版本，走完一次正式流程到发布。
范围按 ADR-0290 登记；门 A、门 B、标签与发布仍逐次由负责人签发。

## 1. 授权

2026-10-29 America/Los_Angeles，负责人两次裁决：

1. 回复“同意推荐的内容”：选定四项合成一个版本走正式流程到发布；现在推送 main，不打标签、不发布。
2. 回复“全部案推荐”：D1～D6 全部采用推荐项，见 §3。

| 范围项 | 内容 |
|---|---|
| 交付结果 | `v0.3.0-alpha.3` 冻结候选 WIN7-56。经门 A、正式执行与门 B 后，发布同一字节产物 |
| 实际分支 | main；执行代理可在工具创建的工作树内实施，由执行代理（主会话）整合到 main |
| 行为边界 | 只含 §2 四项及其冻结前缺陷修复；不新增产品权限、系统配置或依赖；Review 继续 fail-closed |
| 本地提交与构建 | 本地提交、开发构建、双干净构建与冻结在本范围内连续执行 |
| 开发级运行 | Win7 开发通道，预算见 §6 |
| 推送 | main 源码推送已获准；标签与发布另行签发 |
| 停止条件 | 见 §6 |

## 2. 版本内容

| 任务 | 用户可见结果 | 当前证据 |
|---|---|---|
| [A9-34](A9_34_RECOVERED_CLEANUP_DISPOSITION.md) | 重启恢复的“清理未确认”记录可由用户确认处置 | Win7 实机 DEV_CHANNEL |
| [A9-40](A9_40_BACKGROUND_PROGRESS_VISIBILITY.md) | 后台任务进展与结束状态自动显示 | Win7 实机 DEV_CHANNEL |
| [A9-41](A9_41_WORKBENCH_UI_POLISH.md) | 工作台可读性、窄窗口与焦点优化 | Win7 实机 DEV_CHANNEL，随 A9-42 开发构建 |
| [A9-42](A9_42_LIGHTWEIGHT_AGENT_TOOLS.md) | 编辑反馈、环境信息、Skills、ask_user、read_image、Office Lite | Win7 实机 DEV_CHANNEL；真实模型五场景见 A9-42 §8.10 |

四项均包含在开发构建 `cd4a428b…` 中，源提交 `08e41400…`。DEV_CHANNEL 结果只作诊断，不是正式验收。

## 3. 负责人裁决

| 编号 | 裁决 |
|---|---|
| D1 | 版本号 `v0.3.0-alpha.3`，候选号 WIN7-56；新功能与 Alpha 2 遗留义务分开 |
| D2 | 采纳 ADR-0293 拟决定三甲。正式执行也放在 `C:\A9-DEV\run\<run>`，见 ADR-0304 |
| D3 | 拒绝集移到数据文件，由门 A 授权绑定其 SHA-256，见 ADR-0304 |
| D4 | verify:release 中规则检查保持必跑；历史回放有归档就按原哈希回放，没有归档就明确 NOT_PERFORMED |
| D5 | 本版不签正式性能预算，列为已知限制，到 RC 再测 |
| D6 | 开发级运行预算见 §6 |

ENGINEERING_04 其余验收削减建议：E4-2、E4-4、E4-5 延到 RC；E4-6 被 ADR-0289 决定 6 取代。

## 4. 冻结前工作

缺口来源：开发机只读分析 `outputs/next-version-r1/sol/GAP_REPORT.md` §3～§5。

| 缺口 | 处理方 | 阻断冻结 |
|---|---|---|
| verify:release 11 项失败与 S01、S02（旧 RC 回放用例）跳过写法 | 执行代理，按 D4 | 是 |
| 正式执行驱动不存在；现有驱动写死开发根与 DEV_CHANNEL | 执行代理，按 ADR-0304 先方案后实现 | 是 |
| 拒绝集写在工具字节 | 执行代理，按 ADR-0304 | 是 |
| 版本号、候选号与候选元数据仍是旧身份 | 执行代理，按 D1 | 是 |
| 六项轻量工具与 A9-41 的证据映射 | 执行代理整理覆盖矩阵 | 是 |
| 含界面撤销的完整 Office 流程 | 主会话在全阶段开发级运行中执行 | 是 |
| 同一代码与驱动的全阶段开发级运行 | 主会话操作 Win7 | 是 |
| 双干净构建与冻结 | 执行代理 | 是 |
| 负责人试用反馈 | 负责人；材料 `outputs/next-version-r1/owner-trial/` | 是，试用发现的问题冻结前处理 |
| Win10 同候选完整验证 | RC 前补齐 | 否 |

冻结候选的代码与驱动必须与全阶段开发级运行相同（ADR-0289 决定 4）。

## 5. 冻结后流程

1. 执行代理准备门 A 材料。
2. 独立审核核对门 A 材料一次。
3. 负责人签发门 A，含正式执行预算。
4. 主会话执行正式验收。
5. 独立审核核对正式结果一次。
6. 负责人签发门 B。
7. 负责人批准标签与发布同一字节产物。

## 6. 预算与停止条件

| 项 | 上限 |
|---|---|
| Win7 开发级运行目标机窗口 | 合计 3 小时，最多 3 次窗口 |
| 开发级运行真实模型请求 | 合计 60 次 |
| 费用 | UNKNOWN，不设金额上限 |
| 正式执行 | 预算在门 A 中另签 |

- 目标机身份、单写锁或安全收尾硬门失败时，停止全部依赖步骤。
- 同类失败连续两轮未闭环时，先做最小诊断，不整批重试（ADR-0169）。
- 超出上表任一预算，暂停目标机动作并请负责人决定。
- 出现数据损坏、凭据泄露、越权或失控进程时，立即停止并报告。

## 7. 已知限制

| 限制 | 来源 |
|---|---|
| 正式性能预算本版不签 | D5 |
| Win10 同候选验证到 RC 前补齐 | A9 总合同 |
| Office Lite 不承诺版式保真、公式重算与宏 | [Office Lite 范围](../plans/A9_42_OFFICE_LITE_SCOPE.md) |
| 完整 Review 未签发，继续 fail-closed | ADR-0096、ADR-0143、ADR-0286 |
| 历史 FAIL、HALTED 与 UNKNOWN 保留，不改判 | AGENTS §2 |

## 8. 执行记录

### 8.1 范围启动（2026-10-29）

- 主会话把 main 从 `6ea0b9af…` 推送到 `63e173fc…`；未打标签，未发布。推送前凭据模式扫描只命中测试合成值。
- 三份只读分析已交付。均为开发机材料，不是验收证据：
  - 冻结缺口：GPT 6.1 Sol。
  - ENGINEERING_04 取舍：Opus 5.5。
  - 负责人试用说明：GLM 5.3；主会话修订 4 处。
- `document_write_copy` 工具说明补一句：DOCX 表格单元格只接受字符串。起因是 A9-42 §8.10 S2 中模型先写数字被拒后自纠正。DOCX 合同未改。开发机 core 定向测试 tools 7/7、office-loop 2/2 PASS，提交 `026a148…`。
- 已派执行代理：verify:release 修复（独立工作树）；正式执行工具方案（只写 `outputs/next-version-r1/formal-tooling/`）。

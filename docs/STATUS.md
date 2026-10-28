# 当前项目状态

更新：2026-10-28 America/Los_Angeles。当前开发工作区 main；A9-34 基线 `f374e3783eb6e863a84c97b0a28c94f52a2169c9`，A9-40 联合验证的源码身份与本地保存记录见任务书 §4.5、§5.1。

## 产品与可试用结果

- 最新可试用版：`v0.3.0-alpha.2-win7-55`，内部预览版；[下载与说明](https://github.com/allin2/win7-coding-Agent/releases/tag/v0.3.0-alpha.2-win7-55)。
- Win7 实机已签限定范围结论：`A9_39_WIN7_55_BATCH2_PASS_WITH_KNOWN_LIMITS`（ADR-0286）。source `b4ce2be42cc9448142b831612dc7d5bc3a4df3cd`；ZIP SHA-256 `7de63dd8db0fde0f7c76aafa48f44ce6c9841c651c03b93215e175ad3792824a`。
- 总控 FORMAL `f9ae2982`；补充组 DEV `cdb82d32`；证据等级与签发范围详见 [ADR-0286/0287](DECISIONS.md#adr-0286-win7-55-门-b限定已直接证明范围签发)。本页不将补充组改成 FORMAL。
- Full Access / Read Only 为当前产品能力；Review 保持 fail-closed。完整 Alpha 2 / RC 未签发；已知限制沿用 [A9-39](tasks/A9_39_ALPHA2_FINAL_CANDIDATE.md) 与 ADR-0286，不把版本名等同完整验收。
- 当前有效需求：[A9 PRD](prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md)；后继决定以 [ADR 索引](DECISIONS_INDEX.md) 定位。源码、历史需求和运行结论冲突时按后继决策核实，不以源码替代需求。

## 进行中的工作与授权

- 本轮 [ENGINEERING_05](tasks/ENGINEERING_05_ALPHA_DELIVERY.md)：规则和日常入口已落地，真实 Win7 锁 bug 已修复；第二轮（ADR-0291）把日常集合降到 107.74 秒并加 Node ABI 前置。
  第一批 20 项清理完成；第二、三批归档核验后经负责人批准删除 1,143,164 个原件，df 可用空间增加 10.94 GB。ADR-0290 授权在 main 连续执行；未授权产品推送、发布或正式签发。
  本轮本地工作树整合已保存 21 个未提交文件并核销旧治理差异；139 个材料根已在工作树外核验保留。
  剩余文档合流已完成；负责人确认后，314e 与整合工作树已逐个通过 Git 移除，现仅保留 main 工作树。
  分支、恢复归档、WIN7-55 候选和证据继续保留。常设开发通道原文保持；A9-34/A9-40 的 main 例外见 ENGINEERING_03 §10.5。
- [ENGINEERING_03](tasks/ENGINEERING_03_WIN7_DEV_CHANNEL.md)：已登记 Win7 开发通道，目标运行仍核对有效签发、主机/身份、锁和预算。本轮不继承他人的活动锁。
- [A9-34](tasks/A9_34_RECOVERED_CLEANUP_DISPOSITION.md)：2026-10-27 负责人批准方案 U（ADR-0294），为重启恢复的“清理未确认”后台事实提供用户确认处置出口。
  开发机检查及 Win7 开发试用链路已完成：异常恢复、取消与确认、事件和事实落盘、操作恢复、正常关闭及再次重启保持均有直接证据。结果只作 DEV_CHANNEL，见 A9-40 §5.12～§5.13；WIN7-55 结论不变。
- ENGINEERING_04 为待审 RC 方案，未整体批准。其余历史任务与未闭合义务见 [任务索引](tasks/README.md)，不自动开放历史草案。
- [A9-40](tasks/A9_40_BACKGROUND_PROGRESS_VISIBILITY.md)：产品源码为本地提交 `f68b6c8e…`，开发 ZIP `efccd14a…2469bcc`。2026-10-28 Win7 普通用户联合运行已完成迟到输出自动显示、自然退出控件恢复、SQLite 持久化与 A9-34 恢复链路；正常阶段均经产品关闭释放锁。确认框实际图像已定向补证，结果只作 DEV_CHANNEL。历史 HALTED 保留，准确绑定见 §5.12～§5.13。
  同字节 ZIP、校验值与独立数据目录试用说明已整理到 `outputs/a9-34-main-integration/a9-3440-owner-handoff-20261028-r1/`，见 [§5.14](tasks/A9_40_BACKGROUND_PROGRESS_VISIBILITY.md#514-本地试用交付材料)。负责人实际使用验收为 NOT_PERFORMED。

## 日常入口

```sh
nvm use                            # .nvmrc：Node 20.17.0
npm run test:local -- --module gateway --test-file tests/a9-r3-external-changes.test.ts
npm run test:local                 # 日常集合，含依赖构建
npm test                           # 集成完整回归，含慢检查
npm run docs:check                 # 文档与规则修改
```

选择、风险覆盖及 Win7 开发运行见 [研发运行说明](../scripts/README.md)。不要求每次小改动执行全部命令。

## 待负责人决定与阻断

- A9-34/A9-40 本轮获准的开发试用已完成，无待批窗口。最后开发根零进程、零任务、锁 inactive；准确 SGTool 环境实例按 ADR-0297 保留，不声称其同步退出。本轮真实模型请求 0 次。原始 Runner 返回 ZIP 仍缺，恢复 helper 仅允许开发装配；正式构建与门 A/B 未开放。已发布版本仍为 WIN7-55，见 [A9-40 §5.13](tasks/A9_40_BACKGROUND_PROGRESS_VISIBILITY.md#513-视觉补证与本轮收尾)。
  原 ZIP 续查已定位原 Win10 BuildA 的 `result` 目录，但 `192.168.1.4:22` 在 SSH 身份核验前关闭连接，尚未取回；当前恢复阻断与准确路径见 [§5.15](tasks/A9_40_BACKGROUND_PROGRESS_VISIBILITY.md#515-原始返回-zip-恢复续查)。
- 第一批 20 文件已按批准清单删除；物理净释放未证实（APFS 克隆使重复 ZIP 删除几乎不释放）。
- 第二轮删除清单 SHA `9c78aac6…9368` 已执行，0 失败；原件实际物理释放约 6.9 GB，低于已分配 16.52 GB，原因 UNKNOWN，见 ENGINEERING_05。
- 新需求范围、重大架构/产品权限语义、系统权限/配置、超预算、正式签发、产品推送及发布仍单独决定。
- 数据损坏、凭据泄露、越权、失控进程、目标平台无法运行阻断依赖交付；非阻断缺陷明确列出后供负责人验收。
- 本轮开发机结果、Win7 开发结果及未执行项只在 ENGINEERING_05 维护。用户接受为 NOT_PERFORMED，等待交付后验收。

## 历史与恢复

旧 STATUS 原文及任务索引旧流水迁入 [STATUS_LOG](STATUS_LOG.md#2026-10-26-迁入的原-status全文历史快照)，保留原时间点结论。
历史候选和原始证据恢复见 [归档取回](acceptance/EVIDENCE_ARCHIVE_RETRIEVAL.md)。
`status/latest-validation.json` 是 A1–A3 历史记录，绑定 `b2019f022f910b2b8df150ad94c3bccdefa1fa7b`，不表示当前 Alpha 状态。

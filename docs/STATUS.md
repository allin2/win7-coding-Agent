# 当前项目状态

更新：2026-10-26 America/Los_Angeles。当前开发工作区 main；本轮第二轮起点 `1662903172b7102a6b31b0be4dd5edbfc2dd3f20`。

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
  分支、恢复归档、WIN7-55 候选和证据继续保留。常设开发通道后继工作区尚未变更。
- [ENGINEERING_03](tasks/ENGINEERING_03_WIN7_DEV_CHANNEL.md)：已登记 Win7 开发通道，目标运行仍核对有效签发、主机/身份、锁和预算。本轮不继承他人的活动锁。
- [A9-34](tasks/A9_34_RECOVERED_CLEANUP_DISPOSITION.md)：2026-10-27 负责人批准方案 U（ADR-0294），为重启恢复的“清理未确认”后台事实提供用户确认处置出口。
  执行代理在独立工作树实现，主会话审核后本地提交 main；Win7 开发通道运行待负责人另行授权。WIN7-55 结论不变。
- ENGINEERING_04 为待审 RC 方案，未整体批准。其余历史任务与未闭合义务见 [任务索引](tasks/README.md)，不自动开放历史草案。

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

- 第一批 20 文件已按批准清单删除；物理净释放未证实（APFS 克隆使重复 ZIP 删除几乎不释放）。
- 第二轮删除清单 SHA `9c78aac6…9368` 已执行，0 失败；原件实际物理释放约 6.9 GB，低于已分配 16.52 GB，原因 UNKNOWN，见 ENGINEERING_05。
- 新需求范围、重大架构/产品权限语义、系统权限/配置、超预算、正式签发、产品推送及发布仍单独决定。
- 数据损坏、凭据泄露、越权、失控进程、目标平台无法运行阻断依赖交付；非阻断缺陷明确列出后供负责人验收。
- 本轮开发机结果、Win7 开发结果及未执行项只在 ENGINEERING_05 维护。用户接受为 NOT_PERFORMED，等待交付后验收。

## 历史与恢复

旧 STATUS 原文及任务索引旧流水迁入 [STATUS_LOG](STATUS_LOG.md#2026-10-26-迁入的原-status全文历史快照)，保留原时间点结论。
历史候选和原始证据恢复见 [归档取回](acceptance/EVIDENCE_ARCHIVE_RETRIEVAL.md)。
`status/latest-validation.json` 是 A1–A3 历史记录，绑定 `b2019f022f910b2b8df150ad94c3bccdefa1fa7b`，不表示当前 Alpha 状态。

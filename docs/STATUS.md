# 当前项目状态

更新：2026-10-29 America/Los_Angeles。当前开发工作区 main；A9-34 基线 `f374e3783eb6e863a84c97b0a28c94f52a2169c9`，A9-40 联合验证的源码身份与本地保存记录见任务书 §4.5、§5.1。

## 产品与可试用结果

- 最新可试用版：`v0.3.0-alpha.2-win7-55`，内部预览版；[下载与说明](https://github.com/allin2/win7-coding-Agent/releases/tag/v0.3.0-alpha.2-win7-55)。
- Win7 实机已签限定范围结论：`A9_39_WIN7_55_BATCH2_PASS_WITH_KNOWN_LIMITS`（ADR-0286）。source `b4ce2be42cc9448142b831612dc7d5bc3a4df3cd`；ZIP SHA-256 `7de63dd8db0fde0f7c76aafa48f44ce6c9841c651c03b93215e175ad3792824a`。
- 总控 FORMAL `f9ae2982`；补充组 DEV `cdb82d32`；证据等级与签发范围详见 [ADR-0286/0287](DECISIONS.md#adr-0286-win7-55-门-b限定已直接证明范围签发)。本页不将补充组改成 FORMAL。
- Full Access / Read Only 为当前产品能力；Review 保持 fail-closed。完整 Alpha 2 / RC 未签发；已知限制沿用 [A9-39](tasks/A9_39_ALPHA2_FINAL_CANDIDATE.md) 与 ADR-0286，不把版本名等同完整验收。
- 当前有效需求：[A9 PRD](prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md)；后继决定以 [ADR 索引](DECISIONS_INDEX.md) 定位。源码、历史需求和运行结论冲突时按后继决策核实，不以源码替代需求。

## 进行中的工作与授权

- [A9-42](tasks/A9_42_LIGHTWEIGHT_AGENT_TOOLS.md)：六项轻量能力已完成本地开发交付，包括编辑反馈、环境信息、Skills、ask_user、图片和Office Lite。
  [Office Lite](plans/A9_42_OFFICE_LITE_SCOPE.md) 支持DOCX/XLSX有界读取、新稿和内容级修改副本；详细格式/保真边界及开发验证见任务书§4。
  当前开发包源 `5143b9cf50f6ef598eda0d0b4e2fae17347f08d9`，r4 ZIP SHA-256 `84585361…1dc063`，external_acceptance_eligible=false。
  Win7开发增量范围已覆盖：问询回答、Office生成/读取/哈希副本、真实工具记录和界面撤销引用同包run `a942o-b12c6d8e`，标INHERITED_EVIDENCE。
  本窗口run `a942o-2e94bc71` 直接完成取消、迟到回复拒绝、同批不执行、SQL cancelled事实及正常退出；独立postflight为QUESTION_CANCEL_DEV_CHANNEL_COMPLETE，见任务书§7.13。
  本次仅2次本机夹具请求、0真实模型。最后目标status于UTC23:55:33.270结束：根内零进程/任务、锁inactive、无解包标记；准确搜狗环境实例按ADR-0297保留。
  原包/运行副本完整性已直接核对，组件字节不变；历史失败和中断全部保留。两场景不改写为一次完整Office GUI旅程PASS。
  取证驱动抽屉顺序修复已本地保存为 `9b2e963…`，13项驱动与Electron22/Node16原生交互4项PASS；该修正后单次完整Win7旅程仍NOT_PERFORMED。
  真实模型、正式Gate A/B、长期资源预算、负责人实际使用验收、推送发布仍NOT_PERFORMED。完整release组11项历史FAIL与5项未执行不改判；前序包与全部验证见任务书§4～§7。
  负责人已批准产品直连试用及有界延长，原中继材料保留。首run a942r-8226e8de直接证明Win7真实DPAPI恢复、默认TLS1.3和tool_calling探测；原配置三文件hash不变、正常退出及独立postflight完成。
  实际6次请求，probe200后五任务均400；根因为ask_user内部数组Schema没有转成标准JSON Schema，原5项FAIL保留，见任务书§8.6。
  Gateway最小修复已提交08e41400…，回归21项及实际Electron22/Node16四项PASS；新开发包r5 ZIP cd4a428b…3987da9，仅GatewayJS和两元数据变化，原生不变。
  修复包首次a942r-f6440f58在模型请求前HALTED，触发原因UNKNOWN；原记录保留。候选外控制器补首异常持久化，0模型启动诊断及独立postflight完成，身份/进程硬门不变。
  新r5功能run a942r-542263b5在Win7普通agent真实产品链完成S1 DOCX读取、S2 XLSX转报告、S3修改副本、S4问询回答、S5取消/迟到拒绝，5项直接PASS，见§8.10。
  该run18次HTTP200/TLS1.3，连同原6次累计24次；正常退出、原件/原配置hash不变、独立postflight及最终根内零进程/任务/锁inactive均已直接证明。最后目标动作04:19:17.910Z，实际约51.8分钟，窗口已关闭。
  资源取得启动/60秒空闲与任务采样，只作开发基线，不签正式性能预算。原§7单次含UI撤销的完整旅程、正式Gate、负责人使用验收和发布未执行。原失败与旧包不改判。
- [A9-41](tasks/A9_41_WORKBENCH_UI_POLISH.md)：负责人批准本地工作台 UI 优化并开启 GPT 重置模式 fast。
  长标题开关、窄窗焦点、导航及状态可读性优化已随批准清单保存为产品提交 `100f8db4…`，进入上述A9-42开发包。
  开发机定向测试 73 PASS、Renderer 桩交互 14 PASS保持原证据；已随A9-42补Win7普通agent真实启动/关闭与同包6视口焦点检查，只作DEV_CHANNEL，见任务书§4.6。
  未采用字体候选；正式验收、完整用户使用与发布仍为 NOT_PERFORMED。
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
  原始输入路径已在 main `158a737f…` 的干净源码上完成开发重建，新 ZIP `1e8fb772…48f9429`。与上述实机试用包相比，781 文件相同，仅三份追溯元数据变化，后台进展与恢复链路引用 INHERITED_EVIDENCE。新包已直接完成 Win7 普通用户 portable 初始化、Read Only 首次选择、真实鼠标新建对话、持久化、正常退出和释放锁，结果只作 DEV_CHANNEL，见 [§5.17～§5.19](tasks/A9_40_BACKGROUND_PROGRESS_VISIBILITY.md#517-原始输入路径开发重建与证据适用性)。

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

- A9-34/A9-40 本轮获准的开发试用已完成，原目标窗口已关闭。最后开发根零进程、零任务、锁 inactive；准确 SGTool 环境实例按 ADR-0297 保留，不声称其同步退出。本轮真实模型请求 0 次。已发布版本仍为 WIN7-55，见 [A9-40 §5.13](tasks/A9_40_BACKGROUND_PROGRESS_VISIBILITY.md#513-视觉补证与本轮收尾)。
  原始 Runner BuildA/BuildB ZIP 已从原 Win10 `192.168.1.13` 取回到 `.acceptance/deps/a9-v26-managed-r3-original/`，输入缺失阻断已解除。正常输入路径开发打包及新包 portable 最短链路已完成，未重编原生或改锁。新增窗口于 UTC `15:45:08` 收尾，零根内进程/任务、锁 inactive；准确 SGTool 环境实例仍按 ADR-0297 保留。负责人使用验收为 NOT_PERFORMED，正式构建与门 A/B 未开放，见 [§5.16～§5.19](tasks/A9_40_BACKGROUND_PROGRESS_VISIBILITY.md#516-原始-runner-双返回恢复完成)。
- 第一批 20 文件已按批准清单删除；物理净释放未证实（APFS 克隆使重复 ZIP 删除几乎不释放）。
- 第二轮删除清单 SHA `9c78aac6…9368` 已执行，0 失败；原件实际物理释放约 6.9 GB，低于已分配 16.52 GB，原因 UNKNOWN，见 ENGINEERING_05。
- 新需求范围、重大架构/产品权限语义、系统权限/配置、超预算、正式签发、产品推送及发布仍单独决定。
- 数据损坏、凭据泄露、越权、失控进程、目标平台无法运行阻断依赖交付；非阻断缺陷明确列出后供负责人验收。
- 本轮开发机结果、Win7 开发结果及未执行项只在 ENGINEERING_05 维护。用户接受为 NOT_PERFORMED，等待交付后验收。

## 历史与恢复

旧 STATUS 原文及任务索引旧流水迁入 [STATUS_LOG](STATUS_LOG.md#2026-10-26-迁入的原-status全文历史快照)，保留原时间点结论。
历史候选和原始证据恢复见 [归档取回](acceptance/EVIDENCE_ARCHIVE_RETRIEVAL.md)。
`status/latest-validation.json` 是 A1–A3 历史记录，绑定 `b2019f022f910b2b8df150ad94c3bccdefa1fa7b`，不表示当前 Alpha 状态。

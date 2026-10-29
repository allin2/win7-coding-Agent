# 当前项目状态

更新：2026-10-29 America/Los_Angeles。当前开发工作区 main；A9-34 基线 `f374e3783eb6e863a84c97b0a28c94f52a2169c9`，A9-40 联合验证的源码身份与本地保存记录见任务书 §4.5、§5.1。

## 产品与可试用结果

- 最新可试用版：`v0.3.0-alpha.2-win7-55`，内部预览版；[下载与说明](https://github.com/allin2/win7-coding-Agent/releases/tag/v0.3.0-alpha.2-win7-55)。
- Win7 实机已签限定范围结论：`A9_39_WIN7_55_BATCH2_PASS_WITH_KNOWN_LIMITS`（ADR-0286）。source `b4ce2be42cc9448142b831612dc7d5bc3a4df3cd`；ZIP SHA-256 `7de63dd8db0fde0f7c76aafa48f44ce6c9841c651c03b93215e175ad3792824a`。
- 总控 FORMAL `f9ae2982`；补充组 DEV `cdb82d32`；证据等级与签发范围详见 [ADR-0286/0287](DECISIONS.md#adr-0286-win7-55-门-b限定已直接证明范围签发)。本页不将补充组改成 FORMAL。
- Full Access / Read Only 为当前产品能力；Review 保持 fail-closed。完整 Alpha 2 / RC 未签发；已知限制沿用 [A9-39](tasks/A9_39_ALPHA2_FINAL_CANDIDATE.md) 与 ADR-0286，不把版本名等同完整验收。
- 当前有效需求：[A9 PRD](prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md)；后继决定以 [ADR 索引](DECISIONS_INDEX.md) 定位。源码、历史需求和运行结论冲突时按后继决策核实，不以源码替代需求。

## 进行中的工作与授权

- [A9-42](tasks/A9_42_LIGHTWEIGHT_AGENT_TOOLS.md)：负责人授权按平民模式推进六项轻量工具与文档能力。
  编辑反馈、环境、Skills、ask_user 已整合到下述产品提交并通过开发机定向检查。
  图片全链路本地实现及文件/数量/生命周期/历史隔离定向检查通过；五项完成开发交付。
  [Office Lite](plans/A9_42_OFFICE_LITE_SCOPE.md) 的 DOCX/XLSX 有界读、新稿与修改副本已在主工作区实现；相关开发机定向验证通过。
  六项均完成本地开发交付；开发机Electron22/Node16模块探针5项PASS，包含真实图片解码与Office Worker。
  Office打包夹具依赖缺口已修复；相关打包回归123项PASS，0跳过。完整release组仍有11项历史FAIL及5项未执行，独立记录。
  批准范围82项已保存为本地产品提交 `100f8db4…`，真实干净源码开发包已构建，ZIP SHA-256 `31482faf…76bd4c3`。
  包完整性与99项Office依赖闭包校验PASS；开发机Electron22/Node16包内模块探针3项PASS，准确绑定见任务书§4.8。
  后续发现并修复问询失败返回导致卡片清空/无法重试：65项定向检查PASS，Electron22真实preload/IPC加Runtime夹具交互6项PASS。
  Node16包内Office反复读取128次，130个Worker均退出；RSS观察不构成Win7轻量预算结论。
  修复版产品提交 `94135364…`，新开发ZIP SHA-256 `751c76f2…d72085d` 已构建并校验；旧包保留，见任务书§4.9～§4.10。
  负责人已批准准确包的Win7开发试用及非活动锁转交；Win7普通agent真实portable窗口、Read Only、新建对话、SQLite持久化及正常退出均完成。
  Win7包内Office/图片3项、Runtime夹具工作台6项通过；Office读取32次的34个Worker全部退出，结果只作DEV_CHANNEL，见任务书§5.1～§5.4。
  15:10 UTC收尾确认根内进程/临时任务为空、锁inactive，保留SGTool环境实例和全部文件；原包及副本4082文件哈希一致。
  包external_acceptance_eligible=false；真实模型、完整Office Agent GUI旅程、正式门A/B、长期预算、推送发布仍为 NOT_PERFORMED。
  后续已切换GPT重置，两项员工Fast，主对话保持Sol/max/default。打包优化提交 `c9e29545…`，r3开发ZIP SHA-256 `1d2a1289…7320f42`。
  原99工件/运行字节保持；完整新包标准cand路径最长201字符已直接通过，受影响合同及闭包124项、最终包Electron模块3项PASS。
  两项Fast员工均已完成并整合；Office驱动/HTTP与绑定反例10项、真实Runtime/SQLite组合5项通过，完整GUI仍待直接执行。
  最终开发包源 `5143b9cf…`、r4 ZIP SHA-256 `84585361…1dc063`，完整性/标准路径校验及39产品/117编译文件正向绑定PASS。
  负责人已批准r4的60分钟/0真实模型/最多16次Win7 loopback夹具窗口，准确范围见任务书§7。
  已确认Win7普通agent会话2、原holder inactive和零未知生命周期；首次上传超时保留，前缀校验续传后完整ZIP哈希匹配。
  r4 Win7真实问题卡回答、DOCX/XLSX新稿与读取、哈希绑定修改副本及原件保持已直接完成，累计13次夹具请求。
  完整GUI在工具记录展开处HALTED，撤销/第二问题取消及迟到回答仍为 NOT_PERFORMED，首失败保留，见任务书§7.6。
  独立普通agent诊断确认两轮completed_with_warnings、SQLite锁已释放、原件/工作簿不变、产品树已结束，输入/副本各3256文件hash一致。
  最终status于UTC17:02:10确认零根内进程/任务、锁inactive、无解包标记，原窗口提前收尾。真实模型及正式门A/B/发布NOT_PERFORMED。
  后继仅本地改进原生点击等待和失败定位：13项驱动检查、Electron22/Node16原生交互夹具3项PASS；Win7中断具体原因UNKNOWN。
  取证代码与本轮记录已本地保存为 `3c43199…`；新20分钟/0真实模型/16次夹具复验材料已绑定，模板不可执行，待决定，见任务书§7.8。
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

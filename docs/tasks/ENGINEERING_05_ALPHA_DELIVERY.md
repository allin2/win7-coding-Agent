# ENGINEERING_05 — Alpha 研发交付优化落地

Status: APPROVED_FOR_IMPLEMENTATION
Task Type: ENGINEERING_TOOLING_AND_BOUNDED_BUGFIX
Target Branch: main
Phase-Gate: ENGINEERING_05_DEVELOPER_VERIFIED
Win7-Validation: DEV_CHANNEL_LOCK_REPAIR_PASS

## 范围与授权

2026-10-26 负责人本轮指令及 ADR-0290 直接授权。基线 main `cff930101b13b3de99ca4dd681a7d256c0e05a1d`。
保留既有两处 tracked ZIP 删除和三份未跟踪报告；默认不换分支/建工作树、不启动子代理。

交付：范围授权机制、可信日常验证入口、精简当前入口、历史加密归档及获准空间回收、一个真实小 bug 的复现/修复/验证。
允许修改承担上述结果的项目规范、脚本/测试/构建与相关实现，必要本地提交。路径不作为风险级别。
不加入无关功能，不批准 ENGINEERING_04 整体、不更改正式判据或冻结候选。产品推送、发版、正式签发未授权。
远端仅既有私有归档仓库，以及 ENGINEERING_03 有效开发通道/既有预算；新系统权限、配置、超预算停止相关动作。
删除先归档恢复核验，再给准确路径集中确认；未确认继续其他工作。

## 实施与验证

1. 治理先生效：AGENTS / CLAUDE / 约束引用 / 验收规范 / 术语表同步 ADR-0290。
2. 复用 verify_integration 做按模块/文件的构建后测试，保留全量回归。量测代表运行，保留首败。
3. 选择一个现存小 bug，保留旧实现反例，运行当前输出及适用 Win7 开发检查。
4. STATUS 与任务索引保留当前事实，旧流水原文入 STATUS_LOG；归档复用 EVIDENCE_ARCHIVE_RETRIEVAL 与 maintenance 记录。
5. docs:check、受影响工具测试及真实消费者；不重复跑全量统计。

## 执行记录

- 开发机：macOS，Node v20.17.0 / npm 10.8.2。原验证入口不支持模块/文件选择；必须全部编译或全部测试。
- 现有工作树：main；314e detached c14a968；整合树 e596c58。使用情况与 ignored 内容需单独核实，暂不移除。
- 私有归档仓库 isPrivate=true、viewerPermission=ADMIN（gh 实查）。现有 AES-256-CBC/PBKDF2/200000 及恢复工具沿用。
- 后续实际结果如下；正式验收和负责人最终接受仍为 NOT_PERFORMED。


## 实际交付与验证（2026-10-26）

### 规则与当前入口

ADR-0290 已落实到 AGENTS、CLAUDE、约束/架构/安全/评估、验收规范、术语及任务索引。
已确认范围内连续完成普通修复与验证；不按目录降低风险。原 Accepted ADR 正文未改写。
STATUS 从 2,496 行 / 365,512 字节改为 41 行 / 3,433 字节；原文完整迁入 STATUS_LOG。
CLAUDE 从 58 行压至 8 行，直接引用 AGENTS。任务索引从 193 行改为 161 行，旧流水入原日志。
已签 WIN7-55 限定范围结论与历史 FAIL/UNKNOWN 不变；当前任务和历史批准分开。

### 可运行的日常入口

入口：[scripts/README](../../scripts/README.md)。复用 verify_integration，支持 --module / --test-file。
按消费者依赖闭包构建当前输出后才测试；不缓存“上次成功”，避免旧 dist 假失败。
仅跳过脚本恰为 tsc --noEmit 且存在 build 的重复检查；含其他动作的 lint 无论属于哪个模块都保留。当前 6 个包符合去重条件，Shell JS 静态检查仍保留。
仅将 6000 文件的 baseline-yield 检查移到相关集成/发布节点，原断言、样本和完整回归入口保留。
未新增平台、钩子、审批、独审或统一时限。

开发机 macOS / Node 20.17.0，单次代表样本：

| 范围 | 实际结果与耗时 |
|---|---|
| 原编译/静态入口 | 14 条命令，日志创建至末写 10.59 秒；包含入口开销 |
| 新日常入口构建部分 | 8 条命令，各子命令合计 6.44 秒；非稳定性能承诺 |
| 定向真实 gateway 链路 | 最终定向 6.85 秒，含依赖构建，10 项 PASS；原含辅助分类反例一轮 8.48 秒，仅为诊断 |
| 首轮日常集合 | 168.99 秒，2 个旧测试失败；Shell 121.19 秒为主要耗时 |
| 修复后受影响 core/runner/gateway | 33.94 秒，1435 项 PASS；没有重跑其他已通过模块 |
| 原完整回归耗时/本轮慢检查 | UNKNOWN / NOT_PERFORMED，不借旧报告数字推算节省比例 |

首轮其余模块通过；首败日志保留在 outputs/engineering-05/daily.log，未将首轮 FAIL 改判。
Read Only 精确清单同步新增 read_process_output，全部写/删/shell 拒绝反例保留。
删除后撤销测试现在走真实目标绑定审批，审批前确认原文件仍在；不替换真实 Shell/Workspace。
输出计时从真实子进程开始工作算，仍保留首条 <3500ms / 第二条 >=3900ms 与终态前回调要求。
原测试混入了 OS 执行文件启动成本；没有延长阈值或降低输出/清理判据。

工具验证：verify:tools PASS；开发通道 39 项 PASS；docs:check PASS。
最后一处测试辅助函数收窄审批范围后另做定向复验，见同一输出目录 gateway-final-scope.log。
构建暴露原先 tracked runner/dist 与源码不一致；当前生成输出留本地，未把旧字节当作源码失败，也不顺带提交生成物。

### 真实小 bug：Win7 CRLF 历史锁无法取得

首次真实 ps --steal 以 LOCK_FORMAT_UNKNOWN 失败。只读回收：48 字节、4 CR、4 LF，按 LF 拆分后首行不等于版本 1。
根因：status 用 ReadAllLines 接受 CRLF，acquire/release 用 Split(LF) 保留 CR。
最小修复：两处先将 CRLF 归一为 LF，再沿用原行数、版本、holder、token、互斥句柄及 ACL 校验。
先前 echo 辅助分类器虽有反例，但主循环不使用它，已撤回该实现修改，不算产品故障或本轮成果。

负责人明确批准 engineering05 接管空闲锁。本轮范围对 ENGINEERING_03 的差异仅为允许本 main checkout 运行同一工具及此小修复；
目标、SID、权限和预算不变。Win7 192.168.1.9 / DCCS-CHAIZL-PC / build 7601，管理账户 dccs-chaizl，活动 agent session 2。
严格 SSH 主机键验证；无模型请求。修复后的工具通过实际 SSH 发送并执行，成功取得、调用、释放锁；
错误 holder 实际得到 LOCK_CONFLICT。最后锁 engineering05/inactive，根内进程/任务为空，未删除开发根。
这是 Win7 DEV_CHANNEL 工具直接证据；不是普通 agent 产品 UI、打包产品或正式验收证据。
原失败 action、lock-format.json、runtime-locations-after.json、lock-wrong-holder.json、win7-status-after.json 全保留。

### 归档与已批准清理

现有私有仓库 isPrivate=true，访问 ADMIN；原密钥 0600，仅作为 OpenSSL 密钥输入，未上传。
成功批次：[archive-20261026-slice1](https://github.com/allin2/win7-coding-agent-archives/releases/tag/archive-20261026-slice1)。
原始两记录共 71,258,605 字节；附件总 4,977,755 字节。全部远端回下载 SHA 一致，现有恢复工具实际重建两文件、权限与 SHA 校验通过。
恢复入口：[EVIDENCE_ARCHIVE_RETRIEVAL](../acceptance/EVIDENCE_ARCHIVE_RETRIEVAL.md)。

原计划整组 6.50 GB 去重后需上传 854 MB，实测上传慢；已停止该批上传，未完成的 draft 不作为恢复依据。
改为归档原始记录，重复 ZIP 保留同 SHA 本地副本。取消批次的临时包已列入同一确认清单，不把新增临时文件当作收益。
负责人已明确批准 SHA f74ec1df…b1862 的 20 文件清单；逐项核对 inode/字节/SHA/恢复副本后，以 20 次单文件 unlink 完成。
未用递归、通配符或删除循环；未删除目录、工作树、分支、既有 dirty/untracked、当前可用包或其他原始证据。

本机既有 maintenance 下本批记录：`.acceptance/maintenance/archive-20261026-slice1/`，含 immutable cleanup-plan.json、approval、20 行 actions、cleanup-result.json 和恢复报告。

| 空间口径 | 实测结果 |
|---|---:|
| 删除逻辑字节（含本轮临时包/清单） | 2,465,796,303 |
| 原项目移除字节（重复 ZIP + 已归档记录） | 580,700,776 |
| 新保留归档、下载、实际恢复、工具及本轮输出已分配体积 | 163,123,200（测量时点） |
| 项目文件占用账面净减 | 417,577,576（约 398 MiB） |
| 清理阶段全盘可用空间增加 | 1,877,622,784（含撤销本轮临时占用） |
| 整轮全盘可用空间变化 | -232,841,216（约 -222 MiB） |

APFS 共享块/快照及卷上并发写入无法由文件逻辑体积独占归因；不宣称整轮实现物理净释放。
空间清理动作已完成，但物理净空间收益未证实。后续若需更大回收，应先查明实际块保留原因，不能据目录大小继续删证据。
两个工作树均有 dirty 内容，未退休；主要剩余占用为历史 w54 正式准备、w48 准备及 a9-39 原始证据，保留待独立核实。

### 未执行与验收方式

新产品包构建、普通 agent 桌面运行、完整慢回归、门 A/B、发布和产品推送均 NOT_PERFORMED。
本轮无产品业务逻辑变更，样本为开发通道真实故障；不借其声称新产品 Win7 PASS。
运行定向日常命令，检查实际结果/计时；按恢复说明将两记录恢复到新的目录；查看清理 actions 与真实空间口径。
负责人最终验收为 NOT_PERFORMED，待交付后判断。产品推送和发布未执行。

剩余主要占用（本轮实测已分配体积）：w54 正式准备约 9.11 GiB、w48 准备约 3.07 GiB、整合树 .acceptance/a9-39 约 2.52 GiB。未删除工作树。


## 复核与第二轮（2026-10-26，Claude 主会话）

负责人以同一指令再次要求直接优化。执行代理复核 1662903 的结果后，只补未闭合项；不重做已生效的 ADR-0290 与 STATUS 精简。
基线 main `1662903172b7102a6b31b0be4dd5edbfc2dd3f20`；既有两处 tracked ZIP 删除与三份未跟踪报告仍保留，不纳入提交。规则变更见 ADR-0291。

### 复核结论

- 复核通过：ADR-0290 已在 AGENTS/CLAUDE/任务索引生效；Read Only 新增 `read_process_output` 与 A9-31 §“Read Only 只读当前归属记录”一致；
  归档仓库仍为私有、ADMIN。
- 未闭合：日常集合仍 169 秒且 Shell 占 122 秒；空间整轮物理净释放未证实；tracked `src/runner/dist` 每次构建变脏；
  AGENTS §2 仍以当前态陈述 Alpha 1 / WIN7-22 历史裁决。

### 日常验证（开发机 macOS，Node 20.17.0）

| 发现 | 根因证据 | 处理 |
|---|---|---|
| Shell 合同单文件 103 秒 | 逐用例计时：“A9-39 phase 2 fixed secrets contract”组 91.6 秒，其中 12 个“required fields reject absence…”用例对每行每字段做 7 种变异；B2-A37-02 一例 84 行、39.4 秒 | 移出日常集合，断言与样本不变；`npm test`、`--test-file` 保留。改为单次构建加深拷贝只省 15～20%，已撤回 |
| 默认 Node 22 下 Shell 186 项失败 | 根 better-sqlite3 为 NODE_MODULE_VERSION 115，Node 22 需 127 | 入口在 gateway/state/shell 测试前加载并停止；新增 `.nvmrc` |
| 构建后 24 个 tracked 生成物改动 | tracked 64 个旧文件，构建产出 68 个；STATUS_LOG 两处记录手工还原 | 停止跟踪 `src/runner/dist`，本机文件保留 |

| 运行 | 结果 |
|---|---|
| 调整后日常集合 `npm run test:local` | 107.74 秒，7 模块 PASS，Shell 33.28 秒，12 个用例按设计跳过；与后台哈希任务并行 |
| 被移出用例本身（同一输入，直接 jest 运行整文件） | 695 PASS / 0 FAIL，103 秒 |
| Node 22 下 `npm run test:local -- --module state` | 1 秒内 exit 1，打印 ABI 原因，未运行测试 |
| `npm run verify:tools`、`npm run docs:check` | PASS |

日常集合测试会在 TMPDIR 留下约 48 MB 夹具；默认系统临时目录由 macOS 回收，不要把 TMPDIR 指到 outputs。
本轮未改产品运行代码，Win7 开发运行与新产品包构建均 NOT_PERFORMED：所改内容只影响开发机入口与文档。

### 第二、三批归档

| 批次 | 内容 | 文件 | 已分配 | 去重后 | 加密上传 |
|---|---|---:|---:|---:|---:|
| slice2 | w54 门 A repair-1～10、13、tmp | 647,850 | 9.31 GB | 0.98 GB | 389,386,362 字节，172 秒，0 失败 |
| slice3 | w48 门 A 准备、diagnostic-3b、rehearsal-3 | 495,314 | 7.21 GB | 1.49 GB | 704,170,799 字节，192 秒，0 失败 |

- 上传前凭据扫描两批共 1,143,145 个文件：私钥块 0、GitHub/AWS 令牌 0；`sk-` 命中均为仓库测试夹具。19 个超 64 MiB 的产品 ZIP 未逐字节扫描。
- slice2 回下载 13/13 SHA 一致；归档仓库 `restore_snapshot.py` 与本机副本 SHA 相同，实际恢复 repair-13 为
  `DECRYPT_EXTRACT_RECONSTRUCT_SHA256_PASS` 且与原目录 `diff -r` 一致；12 个集合全部通过解密流式逐对象 SHA 校验。
- slice3 回下载 4/4 SHA 一致；3 个集合流式校验全部通过；实际恢复 rehearsal-3-prep 149,674 文件 PASS，与原目录 `diff -r` 无差异。
- 两批 224 个大文件中 2,093,670,400 字节与集外保留副本同内容，按 APFS 克隆不计入预期释放；物理释放以 df 前后差为准。

### 删除清单与执行结果

清单：`.acceptance/maintenance/cleanup-20261026-r2/cleanup-plan.json`（只读，SHA `9c78aac6…9368`），人读版为同目录 `cleanup-plan.md`。
范围：15 个已归档集合根 1,143,164 个文件、已分配 16,517,894,144 字节；本轮临时包、回下载副本与恢复验证副本 184,193 个文件、5,856,231,424 字节。
执行器逐条复核类型、大小与 SHA 后单条 unlink、空目录 rmdir；集合有改动或多出文件则整组跳过。执行器已在临时夹具上自测三种情形。
预期物理释放下限：原件 14,424,223,744 字节，加本轮临时 5,856,231,424 字节；实测远低于预期，见下表。

负责人于 2026-10-26T10:50Z 在对话中选择“批准全部（推荐）”，记录于同目录 `cleanup-approval.json`。执行代理随后执行：
16 个集合（15 个原件根加 1 个恢复验证副本）全部 DONE，0 失败；1,293,218 次 unlink、295,658 次 rmdir；临时文件 34,519 个、4 个空目录；用时 332 秒。
逐条动作 `cleanup-actions.jsonl.gz`，汇总 `cleanup-result.json`。未删除工作树、分支、Git 历史、WIN7-55 正式证据或当前版本。

| 空间口径 | 实测 |
|---|---:|
| 删除阶段 df 可用空间增加 | 10,941,661,184 字节 |
| 其中本轮自建临时包回收（out、download、解密对象；恢复副本为 clonefile 克隆，几乎不占块） | 约 4.03 GB |
| 原件实际物理释放（上两行之差） | 约 6.9 GB，低于已分配 16.52 GB |
| 本轮新保留 catalog、manifest、台账（du） | 约 427 MB |
| 本会话整段 df 可用空间变化（10-26 02:52 首测至删除后） | +6,338,428,928 字节，含卷上其他进程写入 |
| 整合树 du | 27.5 GB → 11.4 GB；outputs 24.4 GB → 8.2 GB |

原件约 9.6 GB 已分配块删除后未释放，原因 UNKNOWN；推断为与保留文件共享的 APFS 克隆块，未验证。不再以 du 或已分配体积预估收益。

剩余主要占用（du）：整合树 outputs 8.2 GB（win7-dev 1.78 GB、w50 准备 1.05 GB、diagnostic-3 恢复准备 1.00 GB、rehearsal-2 材料 0.71 GB），
整合树 `.acceptance` 2.85 GB，主树 `.acceptance` 5.08 GB。下批先查克隆共享再定清单。草稿 Release `archive-20261026` 未删除，不作恢复依据。

## 工作树整合（2026-10-26）

负责人本轮指令：“请你推动工作树整合”。本轮在 main 连续完成本地合并、未提交内容核销与备份、
候选和证据的工作树外保留、引用说明及准确退役清单。必要的本地合并提交属于本轮整合。
不扩展产品实现、正式签发、目标机执行、全局配置、远端推送或发布；准确目录移除仍待负责人确认。

基线 main `a4a9c5da75ff7f59a9e128f1c3e2bac276d66b0b`；314e detached `c14a9680…`；
整合分支 `e596c58a…`。原 main 两处 tracked ZIP 删除和三份未跟踪报告保持。
沿用 maintenance 台账，本轮位置 `.acceptance/maintenance/worktree-retirement-20261026/r1/`。

- 两工作树共 21 个未提交文件已保存原字节、模式及 tracked 补丁；独立解包后逐文件 SHA-256 与模式核验 PASS。
  原工作树 HEAD 和 Git 状态保持。完整清单在该目录 `dirty-backups/`。
- 314e 的两份检查器及四份文档与 main 字节相同；其余旧版治理与状态文件逐项核销，原件全部可恢复。
  不将旧 C14、旧任务分区或历史状态覆盖 main 的 ADR-0290/0291 后继规则。
- 整合分支唯一独有提交 `e596c58a…` 只新增空间清理记录。保留 main 当前 STATUS 结构，历史事实写入 STATUS_LOG。
  原记录中的空间收益及验收追溯判断不因本次合并获得新的证明。
- 冻结候选、双构建及原始证据仅在候选外建立保留副本和恢复映射，不改原字节、既有绑定或历史结果。
  第四批草稿上传不作为远端恢复完成依据。

整合、保留验证、文档检查及退役判断的最终结果在本节追加。目录移除、分支删除与新 Win7 执行为 NOT_PERFORMED。

### 本地保留与差异核销结果

- 314e：6 个文件与当前 main 原字节一致，2 个完整文件 blob 已在 main 可达历史，12 个治理/状态文件按
  后继规则、既有历史条目或本地 Target Branch 定位核销。ADR-0169/0190/0191/0192 四段正文完全一致。
  两份文档检查器无需重复合入；全部 20 个原文件与补丁仍可独立恢复。
- 整合树：139 个材料根均有工作树外保留位置。22 个未归档材料根以 APFS clone 建立独立副本，
  逻辑字节 3,194,552,341；117 个历史集合复用 slice4 既有本地加密附件与实际恢复件。
  当前原件、保留/恢复件合计 514,179 个目录成员逐项核验，文件字节、模式及符号链接目标一致。
- 131 个本地加密附件重新核验大小与 SHA；原密钥在工作树外且权限为 0600。slice4 远端仍为草稿，
  本轮不将其计为远端归档完成。保留副本与旧原件共享 APFS 块，不承诺删除工作树后释放原 du 总量。
- WIN7-55 候选和两次构建保留副本的 ZIP 均核得 `7de63dd8…2824a`，未修改冻结文件、源提交或签发绑定。
  ignored 的派生 dist 与指向主树的 node_modules 链接单独分类；共享依赖目标不能随工作树删除。
- 完整恢复入口见 [归档与本地保留](../acceptance/EVIDENCE_ARCHIVE_RETRIEVAL.md#2026-10-26-工作树整合的本地保留)。
  具体源/目标映射及 SHA 见本轮台账 `preservation-result.json`，314e 逐项核销见 `reconciliation.json`。

常设开发通道仍按 ENGINEERING_03 §10.3 核对工作区范围。准确退役计划同时列出 main 后继工作区的差异授权，
不会凭本次文件复制自动获得新的远端执行权限。目录移除及开发通道后继工作区仍待负责人确认。

### 本轮检查与停止边界

开发机检查：`node scripts/check_docs.mjs` PASS（388 文件、61 任务书），`git diff --cached --check` PASS。
两个原工作树 HEAD、Git 状态及 21 个 dirty 文件字节/模式复核不变；314e 基线已在 main 可达历史。
整合分支的独有提交经本轮本地 merge 收口；暂存范围仅本轮六个文档，既有 ZIP 删除和三份报告不入提交。
产品构建、Win7 执行、模型请求、推送发布、工作树移除与分支删除均 NOT_PERFORMED。

准确计划为本轮台账 `RETIREMENT_PLAN.md` 与 `retirement-plan.json`。其中列出两个字面量工作树、
保留/恢复路径、原 dirty 内容、Git fsmonitor 收尾与再次核验、显式 `--force` 移除范围，以及常设开发通道工作区差异。
未获该准确清单确认前，不清除原工作树、不自动停止其进程、不变更常设授权。


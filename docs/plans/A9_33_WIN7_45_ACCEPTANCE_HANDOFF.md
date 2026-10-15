# A9-33 / WIN7-45 正式实机验收交接书

Status: AWAITING_OWNER_GATE_A

WIN7-45 已冻结。两个独立干净工作树的 ZIP 逐字节相同，且与 Win7 预演 18、19 的包逐字节相同。
本页记录开发机构建与候选准备。新的门 A、正式 Win7 执行、第三阶段独立复核和门 B 均为 `NOT_PERFORMED`。
当前结论上限为第二批执行能力，不签完整 Alpha 2 或 RC。

## 1. 本轮授权与实际基线

负责人在当前会话选中“双独立干净构建及字节比对、候选冻结、负责人签发新的门 A；正式运行后独立复核和门 B”，并要求“按照计划推进上述任务”。
该指令授权执行代理完成构建、比对、冻结与具体材料。门 A 仍须绑定本页形成的准确授权载荷 SHA-256；执行代理不代签门 A 或门 B。

执行工作树为 `/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent`，分支 `codex/a9-33-batch2-win7-acceptance`，起始 HEAD `8826548473199689bdc06b34a79756b8064a4439`，起始工作树干净。
源码固定为 `ba042757a04f428cb3db3ccd10888a7bebe97d3b`。源码到起始 HEAD 只有 6 个文档路径变化，产品与套件字节没有变化。
主工作区 `/Users/qlyf/Developer/win7-coding-Agent` 的既有 dirty/untracked、历史候选和失败证据保留。

## 2. 前置证据与双构建

| 项 | 结果与证据边界 |
|---|---|
| 产品独立复核 | 产品 `5f7c0e80…` 第 2 轮 0P0/0P1/0新增P2产品缺陷，开发机；原报告 SHA-256 `55950b8a…` |
| 套件独立复核 | `ba042757…` 第 21 轮 0P0/0P1/0新增P2，开发机；原报告 SHA-256 `f7649fd1…` |
| Win7 连续预演 | 18 的 run `f17a0389-cc4f-4e0a-892a-b1950bc6b365`、19 的 run `2317fe31-d0f4-4c59-ad33-201000e44ac9`，各 10 阶段、25 用例、43 断言 PASS；两次均 `REHEARSAL_NOT_ELIGIBLE`，不计正式证据 |
| 干净构建 1 | `/Users/qlyf/.codex/worktrees/w45-freeze-1/win7-coding-Agent`，分离头 `ba042757…`；11:45:29Z～11:45:45Z 退出 0，构建前后干净 |
| 干净构建 2 | `/Users/qlyf/.codex/worktrees/w45-freeze-2/win7-coding-Agent`，分离头 `ba042757…`；11:46:12Z～11:46:29Z 退出 0，构建前后干净 |
| 比对 | 两个 ZIP 与预演包逐字节相同；ZIP 内容各 800 项，缺失、额外、变化均 0 |
| 本地静态绑定 | 候选内校验器核对 799 个 manifest 文件与 800 个 ZIP 条目、25 用例/43断言、锁/原生/载荷绑定，零不一致；DRAFT 状态被拒绝。仅本地静态检查，不执行 Electron/native，不构成负责人签发 |

两次构建在同一 macOS 开发机执行，共享既有根及各模块的 `node_modules` 和三个已锁定输入 ZIP，未安装或下载依赖。
构建使用 Node 20.17.0，生产者各自重新编译七个模块并写入本次独立输出目录。未重建或改动原生输入。跨机器可重复性为 `UNKNOWN`。

首次尝试缺模块 TypeScript 依赖链接，退出 1，未生成 ZIP。执行代理保存原日志后补齐既有依赖链接，以新输出目录完成构建 1；没有改源码或依赖版本。
两次构建、原始失败、基线和本地静态核验保存在本工作树 `.acceptance/a9-33-rehearsal/w45-formal-preparation/`，预演原始证据与报告见 [A9-33 §6.71～6.72](../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#671-第21轮关闭与win7预演18-pass)。

## 3. 冻结候选的准确身份

候选目录为 `/Users/qlyf/Developer/win7-coding-Agent/.acceptance/candidates/WIN7-45/`。2026-10-15T11:48:38Z 冻结，11 个文件只读，目录只读；后续结果和授权回执全部写在候选外。
冻结前确认无 WIN7-45 refs 和既有候选目录，WIN7-44 仍保留给既有 R 类候选计划。旧候选与预演结果共 24 件保护文件的大小和哈希核对一致。
新远端根是否存在尚未检查，记 `UNKNOWN`；门 A 后 R1 先确认目标身份、无相关残留和新根不存在，任一不符停止，不自动换根。

| 身份 | 准确值 |
|---|---|
| candidate | `WIN7-45` |
| source | `ba042757a04f428cb3db3ccd10888a7bebe97d3b` |
| ZIP | `Win7CodingAgent-0.3.0-alpha.2-win7-x64.zip`，101680489 字节 |
| ZIP SHA-256 | `ae1d4bb109df68c2f23e08cb4b927f2168f7a1f645969643f35101bf8f9da96e` |
| manifest SHA-256 | `520bda7e34cade8c611d8d28120a46b046519b462e3df8978968efc45e07c7df` |
| Kit SHA-256 | `64804b2fc964fb22a9b380d912c92ba3ad819ed50a8d70ca3c5a078b7c930ed1` |
| 输入锁 SHA-256 | `1fdbf1ae73e05ea010f7c8b4107c7e3c0c6723947efa4102bca2c89278f06f74` |
| native 批准登记 commit | `dcf541892ec3ee5f5413833206f07efa3f3ee6e2` |
| native 批准登记 SHA-256 | `de75a45050d1c38d168746542fc1837dd4cabbe13769b1fc3a3f33eb125a2e38` |
| helper SHA-256 | `2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7` |
| 双构建记录 SHA-256 | `7a10cfbde9e3e2e735fb88fc3c54bc233b1e9a07e874376391cfe2c210429c2d` |
| 冻结目录 IDENTITY.sha256 的 SHA-256 | `d2f254b35751acff07fe8b13d3e16541b61d7381355c435500ee76515f5d8c35` |

包内原合同字段 `candidate_tentative: true` 和 `NOT_PERFORMED` 保留原字节。冻结事实登记在 ZIP 外的 `FROZEN_CANDIDATE.json` 中，不能通过改包内字段重写已预演包。

## 4. 待负责人签发的门 A

| 项 | 待确认内容 |
|---|---|
| 固定 run-id | `5773470e-a1c0-402b-8454-966e38a73f68` |
| 目标 | `192.168.1.3` / `dccs-chaizl-PC` / Win7 SP1 x64 |
| 桌面身份 | `dccs-chaizl-PC\agent`，SID `S-1-5-21-1708701742-428676696-1831205153-1001`，console 会话 2，Medium，非提升；InJob 在当前实际执行中直接核验 |
| 新远端根 | `C:\A9-W43\run\5773470e`，管理员 SSH 仅传输、校验与调度；不触碰旧根 |
| 角色 | 当前执行代理执行；未参与执行的全新 Codex 会话技术独立复核；负责人签门 B |
| 正式预算 | 1 次正式运行，最多 16 请求、7200 秒，正常 10 请求；与已用预演 122/156 分开记账；正式失败不自动重跑 |
| 时间窗 | 从负责人确认准确载荷 SHA 的回执时刻起，最多 8 小时，并且不晚于 `2026-10-16T06:59:59Z`，即洛杉矶时间 2026-10-15 23:59:59；正式运行须在窗口内完成 |
| 准确待签发载荷 SHA-256 | `47fe7cae16961cac6124ed0aebab56f66e562550a2e025ca02a121b21d86de2d` |

候选外运行目录为 `/Users/qlyf/Developer/win7-coding-Agent/.acceptance/runs/A9-33-W45/5773470e-a1c0-402b-8454-966e38a73f68/`。
`authority/release-authority.draft.json` 的 SHA-256 为 `4f51d269d7c5e9963ce0218fa84386d95915764d5f33b04d68e55c7ee308ebf4`，状态为 `DRAFT_PENDING_OWNER_GATE_A`。

供负责人确认准确字节的文件是 `authority/release-authority.pending-owner.json`，不是上述 draft。
它含校验器要求的机器字段 `APPROVED_FOR_WIN7_45_VALIDATION`，但该字段和执行代理计算的 SHA 不构成签发事实。
目前无负责人门 A 回执，不能传输、建远端根、注册任务或正式执行。负责人确认其准确 SHA 后，另写候选外回执和独立 pin，原载荷字节不再改变，也不复用预演授权。
外部锁、登记簿、绑定、五件同字节粘合文件及 10 文件传输清单已在该运行目录准备；尚未上传。任务 XML 和实际期限在签发后按同一 run/身份生成并在目标逐字段回读，不增加执行能力。

## 5. 正式执行闭集

沿用已在预演执行的工具、包内入口和 R1～R8；不改产品、原生、协议、锁、系统或安全设置，不使用 Win10 或真实 Provider。

| 步骤 | 动作与准入 |
|---|---|
| R1 | 只读复核机器/OS、agent/SID/console2、空间、相关进程及新根不存在；普通进程令牌与 InJob 仍由当前阶段直接确认 |
| R2 | 只创建上述新根的 data/deploy/evidence/work 子目录，按原合同给 agent 修改权限 |
| R3 | 传输冻结 ZIP、准确授权载荷、锁、登记簿和粘合文件；两端逐项大小及 SHA 一致后才继续 |
| R4 | 解压冻结 ZIP，核对 800 文件的 manifest 闭包，证据写候选外 |
| R5 | 按阶段注册一次性任务：精确 SID、InteractiveToken、LeastPrivilege；回读 XML 的执行文件/参数/目录/身份/权限/期限/触发器后才运行，用后逐项移除 |
| R6 | p01～p10 顺序执行，25 用例、43 断言按冻结 Kit 直接验证；首个非 PASS 停止，不自动整批重试；只能按已核验创建身份清理本次套件产生的进程 |
| R7 | 取回当前 run 的日志、账本、数据库与截图，先保存原始字节，逐文件大小/SHA 对账；相同运行时载荷复用须与当前远端清单逐 SHA 匹配并单列 `INHERITED_EVIDENCE`，不替代本 run 行为；秘密扫描含正控 |
| R8 | 记录当前进程、任务、退出和后飞行；身份、审计、完整性、安全或未知生命周期失败立即停下游，保留首失败及 `UNKNOWN` |

已有预演 PASS 只满足预演准入。新候选的正式 25 用例/43 断言和身份/完整性/后飞行不得继承预演 PASS。
所有旧 FAIL、UNKNOWN、HALTED、候选、run 和数据库保持原样。

## 6. 限制与结论边界

真实 helper 启动后 ready 失败清理为 `NOT_PERFORMED`，继续携带 KL-12。无效 cwd 在启动前拒绝，只证明该路径，不证明 helper 就绪失败清理。
本轮不缩小合同或改判该缺口；门 A 材料明确披露，正式独立复核仍须判断它对结论的影响，不能因 43 条断言 PASS 自动关闭。
KL-3、KL-5、KL-6a、KL-7 的 a/b/c 和冻结 Kit 的全部已知限制继续有效。具体历史裁决在 [A9-33](../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §6.19、§6.27、§6.33、§6.41、§6.57、§6.72。
不签真实 Provider、企业环境、PowerShell CP936/UTF-16LE 端到端解码、800px 以下布局、原生 Esc 或完整 Alpha 2/RC 结论。
ADR-0155 接受、A9-32 `DEVELOPER_VERIFIED`、推送、合并与发布均不在本轮授权内。

## 7. 正式运行后的独立复核与门 B

执行代理先完成当前 run 的完整回收、原始文件哈希、报告复算、负例、秘密扫描与后飞行。
随后交给未参与本轮执行的全新 Codex 会话，复核准确 source/ZIP/authority/run/普通用户身份、断言原值、账本、时间线、所有权、同实例退出/存活、限制与失败边界。
按既有指定使用 `gpt-6.1-sol` / `xhigh` / `default`；执行代理不自行替代独立审核。阻断发现先保留并停止门 B，不能改冻结字节重跑。
技术独立复核完成后形成负责人可审阅的门 B 材料。只有负责人可以接受已知限制并签发最终结论，技术 PASS 不能代签。

## 8. 当前未执行项

门 A 回执、远端 R1～R8、正式 Win7、正式证据独立复核与门 B 均 `NOT_PERFORMED`。
跨机器构建可重复性和当前目标新根状态为 `UNKNOWN`。本轮没有连接远端，没有推送或发布。

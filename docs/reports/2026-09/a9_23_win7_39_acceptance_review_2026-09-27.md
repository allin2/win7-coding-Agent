# A9-23 / WIN7-39 Win7 实机验收审核报告（2026-09-27）

> 审核方：Claude（A9-23 验收方）。依据：[实机交接书](../../plans/A9_23_WIN7_39_ACCEPTANCE_HANDOFF.md) 正文与附录 A、
> [A9-23 任务书](../../tasks/A9_23_WIN7_39_REISSUE_AND_ACCEPTANCE.md) §4、候选内 `A9_23_WIN7_39_VALIDATION.md` §3～§5。
> 本报告只基于本机原始证据，不基于执行方摘要；签发由负责人在门 B 裁决。

## 1. 身份与证据完整性

| 项 | 核对结果 |
|---|---|
| 候选 | WIN7-39，源码 `7ec9db7`，ZIP `6bf586e7…d9e5`；Win7 端 G0-3、B1 与后飞行复算均一致 |
| authority | `b07588e0…9a09`，本机 4 个文件未改动；Win7 端复算一致 |
| run-id / 目标 | `b0ebcf98-1697-431d-9ca5-22ac26ff2a67` / `192.168.1.3`，主机键严格核对通过 |
| 第一段（G0、G1） | `<L>/SHA256SUMS.txt` 198 行复算全部一致，清单自身 `89809955…bdffb`，续跑前后未变 |
| 续跑（附录 A） | `<L>/continuation-a/SHA256SUMS.txt` 688 行复算全部一致（目录内 689 个文件，差 1 为清单本身） |
| 身份与令牌 | 两段自检均为 `agent`、`S-1-16-8192`，中文参数原样；G1 与 smoke 控制台各自记录 Medium 检查通过 |
| 计划任务 | 5 个任务均经 COM 后备逐字段一致（任务名、命令、参数、工作目录、SID、`InteractiveToken`、`LeastPrivilege`）；CP936 源与 UTF-16LE 副本均存证 |
| 秘密扫描 | 执行方两段均为零真实命中（续跑 2 个计数指向扫描脚本自身规则行，已核实）；审核方另对全部文件（含二进制与 SQLite）检索私钥头、Bearer、`sk-`、未脱敏 `w39user:`，零命中 |
| 后飞行 | 两段均未强杀；相对各自基线新增进程只有 `taskeng.exe`、`WmiPrvSE.exe`、`execs.exe`、`conhost.exe`（系统与计划任务宿主），无 Electron、helper 或测试 Shell；计划任务删除原始输出齐全 |

## 2. G1 与 G2 结果

- **G1**：`RUN_A9_23_W39_INTEGRITY.cmd` 在中文空格路径下接收 5 个参数，退出码 0；报告 `status=PASS`，身份与全树 790/791 零差异，
  运行时 `win32`/`6.1.7601`/Electron 22.3.27/ABI 110，绑定 authority `b07588e0…9a09`，文件系统 `ELECTRON_ORIGINAL_FS_PHYSICAL_BYTES`。
- **G2**：smoke 退出码 0，总报告 `status=PASS`，`phase_reports_valid=true`（R5-1 修复在实机生效），运行 2 分 36 秒（11:25:11～11:27:47）；
  13 个阶段退出码全部 0、报告全部 `PASS`、无 `error`；smoke 汇总 181 条断言全部 true，13 份阶段报告 151 条 case 全部 true；
  `A9-W39-REQUIRED-ASSERTIONS-PRESENT` 为 `ALL_PRESENT_AND_PASSED`；两个负例（迟到加载、受控错误）按预期被拒且无残留；
  `candidate_root` 为 `<W>\package\Win7CodingAgent-0.3.0-alpha.1-win7-x64`，`username=agent`。

## 3. 逐用例核对

| 用例 | 关键原始值 | 审核意见 |
|---|---|---|
| W39-01 | 见 §2 G1 | 满足 A01～A03 |
| W39-02 | 运行根、全部工作区与数据根均在 `<W>\cont-a\evidence\smoke\自动 运行 w39-…\` 下，含中文与空格；各阶段 `productMainLoaded` 有效 | 满足 |
| W39-03 | 就绪 1894 ms（阈值 60000），无未捕获异常；截图为产品工作台 | 满足 |
| W39-04 | `A9F1-TOOL-JOURNEY` 等 4 条继承断言通过 | 满足 |
| W39-05 | `A9F1-DIFF`（“diff contains calc.ts”）、`A9F1-SNAPSHOT-FACTS`（18 个 checkpoint）通过 | 满足；见 §4 第 2 条 |
| W39-06 | 拒绝目标前后哈希相同；批准目标被删除；Stop 取消轮次；重启恢复工作区；查询失败可见并可重试 | 满足 |
| W39-07/08 | 形态 1～12、18、19：审批卡出现，`gitBinding` 为 `origin`/`main`，卡片 ID 与 `bindingDigest` 一致；拒绝后同一调用 `tool_start=0`、`tool_end` 均 `denied`、审批行 `denied`、会话一致 | 满足 |
| W39-09 | 形态 13～16（bash/sh）同样确认、绑定与拒绝零执行；形态 17（>256 KiB CMD）为整条命令摘要绑定并拒绝零执行；Git 为 MinGit 2.46.2，`refs/heads/main` 前后不变 | 满足；POSIX 可执行性见 §4 第 1 条 |
| W39-10 | 小历史 5 轮就绪 1692 ms、大历史 100 轮 1713 ms；`rejectedTurns` 恰为种子中断 Turn，`status=missing`（`A9_CHECKPOINT_TURNS_QUARANTINED`） | 满足；两档耗时基本持平，不随历史线性增长 |
| W39-11 | 冻结 369 ms（阈值 10000），结局 `completed_with_warnings`，该 `turnId` 的 checkpoint 行存在；口令在数据库 24 行、6 个数据文件与驱动报告中零命中，脱敏标记 5 处 | 满足 |
| W39-12 | 结局 `completed_with_warnings`、`outputTruncated=true`，说明“模型输出超过 1 MiB 已被截断，本轮未执行其中的工具调用。”；目标文件哈希不变、工具事件 0；下一轮 `completed` | 满足 |
| W39-13 | “最近 10 / 共 60”，DOM 60 = 库 60，分页唯一连续；最旧 checkpoint 的 Diff 为 `counter.ts` 的 `-// v0 +// v1`；60 轮 9390 ms | 满足 |
| W39-14 | 上限提示“已达界面上限 2000 条…”；淘汰后提示释放 N=284，淘汰轮 E=84，区间 (200, 284]；Renderer 工作集约 1000 条时 91,608 KB、淘汰后 97,812 KB | 满足 |
| W39-15 | 最终残留快照零残留（1 次尝试 122 ms），smoke 未强杀；秘密扫描与后飞行见 §1 | 满足 |

## 4. 限制与需负责人知悉的事项

1. **W39-09 POSIX 可执行性**：Win7 上是否存在可执行 `bash`/`sh` 未探测；4 个 POSIX 形态均在确认处被拒绝，从未到达执行。
   “能否真正执行”子项记 `NOT_PERFORMED`。该标注由本报告作出，smoke 证据中没有显式字段（Kit W39-09-A01 的措辞要求“标记”）。
2. **截图的证明范围**：`w39-05-diff.png` 与 `w39-13-checkpoint-paging.png` 截的是对话流，没有显示 Diff 视图或 checkpoint 列表；
   W39-05、W39-13 的判定依据是 DOM 文本与产品库查询，不是截图。W39-05 的 `A9F1-DIFF` 只断言 Diff 含 `calc.ts`，行级内容由 W39-13 的最旧 checkpoint Diff 佐证。
3. **模型为本地回环 fixture**：smoke `real_provider=NOT_PERFORMED_BY_AUTOMATIC_FIXTURE_SMOKE`。本次证明的是真实 Electron 22.3.27 在 Win7 上的产品闭环，不包含真实 Provider。
4. **PowerShell `/Command`（A9-23 §7 Q3）**：形态 9 的分类与确认已在 Win7 观察到；该形态在 PowerShell 5.1 下是否真正执行未测试（被拒绝）。
5. **执行偏差**：第一段 D1～D4 与续跑 B1～B7 的偏差均已核对，无未报告的重试或改动；D4 为交接书路径错误（附录 A），不影响证据。
6. **W39-06 Stop 后子进程退出的时间点**（组装正式报告时补充发现）：驱动只断言 Shell 子进程已启动（PID 6436）与轮次 `cancelled`，
   没有记录 Stop 后该 PID 何时消失；续跑后飞行的完整进程表中没有 PID 6436，最终残留快照为空。任务书 §4 的“Stop 后子进程 PID 消失”
   只能以“运行结束时已不存在”证明，“立即消失”无直接证据。WIN7-37 曾以专门探针补证同一项。建议负责人在门 B 决定是否接受该口径。
7. **产品侧观察**（2026-09-27 已记录）仍未处理：会话中选择已有历史的工作区后不加载过程记录。W39-14 通过热身轮规避，未改变该行为。

## 5. 结论与建议

原始证据支持 WIN7-39 的 15 项用例全部满足 A9-23 §4 的判定要点，未发现产品缺陷或证据完整性问题。建议负责人：

1. 接受本审核结论，§4 第 1～4 条作为已知限制随结论记录；
2. 按 WIN7-37 附录 C 的做法，由审核方用候选内报告器 `init` 生成模板、组装正式报告并在开发机预检，再请执行方在 Win7 以 `agent`
   运行 `RUN_WIN7_39_REPORT_VERIFY.cmd` 复核；
3. Win7 报告校验通过后，在门 B 裁决 `A9_23_WIN7_39_A9_20_A9_21_PASS`，并据此更新 A9-20（Win7 结论）与 A9-21（§5 第 6 项）。

本报告不是 PASS 签发。

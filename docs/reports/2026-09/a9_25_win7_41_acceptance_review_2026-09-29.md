# WIN7-41 实机验收审核报告（A9-25 §9 第 ⑦ 步，2026-09-29）

> 审核方：Claude（A9-25 审核方，未兼任执行方）。执行方：外部模型，按 [WIN7-41 实机交接书](../../plans/A9_25_WIN7_41_ACCEPTANCE_HANDOFF.md) 执行。
> 依据：本机原始证据 `.acceptance/runs/A9-25-W41/318e27e4-d7ac-4c42-9530-8f973abf033f/`（下称 `<L>`），不采信执行方摘要。门 B 由负责人裁决。

## 1. 身份与证据完整性

| 项 | 核对结果 |
|---|---|
| `SHA256SUMS.txt` | 692 行（3 行注释）复算 689/689 OK；`<L>` 下 689 个文件全部列入，无遗漏 |
| 候选 ZIP | 本机 `66a4b3e4…93b0`，与交接书 §3、Win7 端 `certutil`（G0-3、后飞行）一致 |
| authority | `aeaa20cf…ffcc8`，与独立 pin 一致 |
| 取回 | Win7 端逐文件清单 583/583 字节数与 SHA-256 一致；大归档经 `sftp reget` 续传，哈希与 Win7 `certutil` 原值一致 |

## 2. 会话、G1 与 G2

- **会话**：首轮 11:01Z `query user` 显示 `agent` 为“断开”、控制台由 `dccs-chaizl` 持有，执行方按 §2/§7 硬停止，只做只读后飞行，首轮原始输出以独立文件名保留；
  负责人登录后 11:12Z 重新核验 `agent` 为 `console`“运行中”，之后连续执行。未执行 `tscon` 或任何会话切换。
- **令牌**：自检、完整性、smoke 三个任务的 `whoami /groups` 均含 `S-1-16-8192`、不含 `S-1-16-12288`；自检身份 `dccs-chaizl-pc\agent`，中文参数原样到达。三个任务回读门逐字段一致（COM 后备）。
- **G1**：退出码 0；完整性报告 `status=PASS`、`manifest_files_checked=790`、`zip_entries_checked=791`、`mismatches=[]`。
- **G2**：退出码 0，约 228 s；smoke 总报告原值 `status=PASS`、`phase_reports_valid=true`、`case_index_errors=[]`；17 个阶段退出码均为 0、报告均为 `PASS`；
  汇总断言 227 条、阶段断言 182 条全部 `passed=true`；用例索引 22 项，W41-02～22 为 `PASS`，W41-01 按设计由 G1 判定。

## 3. 逐用例核对（关键原值）

| 用例 | 依据 |
|---|---|
| W41-01 | G1 见上 |
| W41-02、03 | 中文空格路径全阶段成立；启动到工作区可用 1,980 ms（阈值 60,000），无未捕获异常 |
| W41-04～06 | 读/改/Shell 旅程与事件顺序成立；审批卡真实目标、拒绝零副作用、重启恢复、查询失败后“重试加载”可见并恢复；停止后 Shell 子进程 PID 6844 在 103 ms 内消失（阈值 5,000） |
| W41-07～09 | 19 种 Git 形态全部触发确认并拒绝零执行；Git 为 `C:\acceptance\mvp_mingit\cmd\git.exe`（2.46.2.windows.1），引用未变 |
| W41-10～14 | 定向恢复就绪 1,853 ms 并隔离损坏 checkpoint；M1b 冻结 370 ms、口令在数据库 24 行与 6 个数据文件零命中；输出截断轮 `completed_with_warnings` 且工具未执行；分页“最近 10 / 共 60”与库一致；界面释放 284 条并如实提示，渲染进程内存已采样 |
| W41-15 | 后飞行相对 `agent` 会话基线新增的只有采集链本身与 `slui.exe`、`WmiPrvSE.exe` 两个系统进程；无 Electron、无 PID 6844、无产品 helper 或测试 Shell；3 个计划任务已删除（`remaining_count=0`）。秘密扫描逐条分类，无真实秘密；审核方另行检索私钥头与未脱敏 M1b 口令，零命中 |
| W41-16～22 | 摘要卡、逐文件撤销/撤回/重启持久、外部修改拒绝、后续轮次拒绝（哈希不变）、命令产生变化与 `big.bin` 无法撤销、两种模式与 review fail-closed、布局（`devicePixelRatio=1.25`、1079×540、无横向滚动）均成立；截图显示检查器“改动”页签与 Diff，补上 WIN7-39 的取证缺口 |

## 4. 偏差、限制与观察

- **DEV-1（已登记）**：首轮因 `agent` 断开硬停止，负责人登录后重新发起；处置符合交接书。
- **DEV-2（已登记）**：证据归档 `scp` 中断后按交接书改用 `sftp reget` 续传，哈希一致。
- **DEV-3（未登记，不影响结论）**：`RUN_LOG.md` 修改时间晚于报告生成，执行方操作记录显示末尾对其整体写入，与“逐步追加、不得同名重写”不符；
  各步事实均有带时间戳的原始证据支撑，不作为判定依据。建议后续交接书要求 `RUN_LOG.md` 以追加方式写入并在每步后记录其哈希。
- **已知限制**（同 WIN7-39）：模型为本地回环夹具，`real_provider=NOT_PERFORMED_BY_AUTOMATIC_FIXTURE_SMOKE`；POSIX Shell 与 PowerShell `/Command` 只验证确认拦截，未验证真实执行；
  ≤799px 分支仍为 `PRODUCT_UNREACHABLE / NOT_VERIFIED`。
- **产品观察（不影响本次判定）**：W41-20 的命令轮只执行 `Set-Content`/`Add-Content` 生成文件，冻结产品记为 `completed · verified`，是 A9-26 ① 所修“已验证”假阳性在 Win7 上的实例；修复随 WIN7-42 验证。

## 5. 正式报告与建议

- 审核方用候选内报告器 `init` 生成模板并组装 `<L>/review/bundle/report-w41.json`（SHA-256 `81f677d7…75ae`，22 项均为 `PASS`，每条 Kit 断言附原始证据依据，`review.known_limits` 列出上述限制与 DEV-3）；
  证据包 35 个文件、路径全 ASCII，清单 `BUNDLE_SHA256SUMS.txt`；组装脚本存 `<L>/review/tools/assemble-w41-report.cjs`，任一运行时断言缺失或未通过即拒绝组装。
- **开发机预检**（非 Win7 结果）：候选内校验器 `status=PASS`、`verified_cases=22`、处置 `A9_25_WIN7_41_A9_24_PASS`；篡改一个证据字节被 `A9_W41_EVIDENCE_SIZE_MISMATCH` 拒绝，错误 pin 被 `A9_W41_AUTHORITY_PIN_MISMATCH` 拒绝。
- **建议**：在执行方按实机交接书附录 A 于 Win7 以 `agent` 完成报告校验、结果为 `status=PASS` 后，负责人在门 B 签发 `A9_25_WIN7_41_A9_24_PASS`（22 项全部，随结论记录 §4 的限制）。
  Win7 报告校验未完成前不签发。

## 6. Win7 报告校验（实机交接书附录 A，2026-09-29）

审核方核对 `<L>/report-verify/` 原始证据：

- `SHA256SUMS.txt` 76/76 OK；C1 `agent` 为 `console`“运行中”，Win7 端 ZIP 与 4 个 authority 文件哈希与 §3 一致。
- C3 Win7 端 `certutil` 逐文件与本机一致（36/36），其中含钉住的 `report-w41.json`（`81f677d7…75ae`）与 `RUN_REPORT_VERIFY_AS_AGENT.cmd`（`698c236a…2123`）。
- C4 任务 `A9W41C318e27e4ReportVerify` 只运行一次；回读门 COM 后备逐字段一致。`report-verify-output.txt` 原值：`whoami /groups` 含 `S-1-16-8192`，
  校验器输出 `status=PASS`、`disposition=A9_25_WIN7_41_A9_24_PASS`、`verified_cases=22`、`direct_current_candidate_cases=22`，绑定源码 `0f8af24`、ZIP `66a4b3e4…93b0`、authority `aeaa20cf…ffcc8`；末行 `REPORT_VERIFY_EXIT=0`。
- C5 无新增 Electron，任务已删除（`remaining_count=0`），取回 14/14 一致。
- 偏差 DEV-C1、C1b、C4a、C4b、C6 均为执行方自产脚本或清单的修正，已登记且另存或未影响校验运行；其中 DEV-C6 为交回前重算 `SHA256SUMS.txt`，最终清单复算一致。

**建议**：负责人在门 B 签发 `A9_25_WIN7_41_A9_24_PASS`（W41-01～22 全部），随结论记录 §4 的已知限制与 DEV-3。

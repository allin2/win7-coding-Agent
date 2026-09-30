# A9-27 W42 首轮预演与套件返工

结论：`c62323f` 的两次普通用户 Win7 预演均 FAIL，不能进入冻结。失败来自两处可复现的 W42 夹具/观测遗漏；保留原严格判据，只修套件。产品 A9-28/A9-29 不变，正式验收 NOT_PERFORMED。

输入 ZIP SHA-256 `8aab0528bd193c4efd1e027c3ef31bf4252e4eda4b4f3f2f3bc277dd367daf20`；manifest `8d02bd0b6a691719a7dce915d9f1b4c0ec85f6ecd7a87f8093c4434a185f7c74`。证据根 `.acceptance/rehearsals/A9-27-W42/20260930-1240/`，Win7 两个新运行根为 `C:\A9-W42\预演 目录\20260930-1240-R1` 与 `…-R2`。

两轮均经严格 SSH、ZIP 哈希、CP936 任务注册与七字段回读、自检后执行。自检为 agent / Medium / 非 High、中文参数准确、Electron 22.3.27 / ABI 110、Python 3.8.10 与 Git 2.46.2 版本及哈希正确。两轮 smoke 退出码 1；后飞行记录零 Electron/helper/测试 Shell 及停止 PID 残留，逐项删除本次两个计划任务。

## 原始失败与原因

- 实时阶段 note 延迟 R1 **-1648 ms**、R2 **-1642 ms**；tool 和 completed 都为 0。模型说明持久化前出现的 `.note-line` 是 A9-26 的项目说明提示，旧选择器错误计为模型说明。新增 `w42RunLiveProcess` 包装只在 W42 中把节点内容和真实 `model_note` 配对；继承 `runLiveProcess` 以及全部断言保持不动，范围仍为 0～1,500 ms 且完成前可见。
- W42-27 在两轮均等待历史 DOM 超时。R1 数据库实际有 1 个 session、10 个 task、10 个 turn、2,510 个 event（含 2,500 条过程事件），但 **0 checkpoint**。`listConversationFacts` 的请求事实 turnId 为 null，无法关联过程节点。仅冷历史种子追加十个已结束轮次的 checkpoint；继承 M4 种子与热身不变，不提交新轮次、不调用内部 Renderer loader。
- W42-02 与 W42-27 因以上失败记 FAIL；W42-01 无 authority，仍 NOT_PERFORMED。其余 W42-03～26、28～30 通过对应直接阶段。总体 FAIL，不能用七个新增阶段通过宣称 A9-26 已验收。

## 返工验证与证据

针对测试使用真实 State + SQLite 重现原种子 turnId 全 null，补关联后十个事实有准确 turnId、过程事件仍为 2,500；AGENTS 提示单独出现不能计为模型说明，仅真实持久化内容配对才计数。历史驱动哈希边界保持。

原始任务、控制台、JSON、数据库、截图和二进制证据均保留；取回按归档与 Win7 逐文件清单双重校验，拒绝越界、重复条目。R1 744 文件逐字节/哈希相等。导出第一次因 Win7 PowerShell 未加载 ZipArchiveMode 所在程序集而失败，原脚本/日志保留；新增 export-v2 显式加载程序集，不覆盖原文件。

修复后必须重新完成开发机门并以准确新提交/新 ZIP 在新目录连续预演两次；不能修改本次失败证据或复用旧候选改判。下游双独立工作树冻结、门 A、正式执行与复核、门 B、合入 main 均未执行。

返工开发机门：Node 20.17.0，包测试 106/106（`package-rehearsal-repair-full.log`）、Shell 49 suites / 478 tests（`shell-rehearsal-repair-v2.log`）、verify:quick、docs:check、diff 检查均 PASS。首次 Shell 命令误传 Jest 不支持的 --run，仅参数错误；原日志保留，正确 --runInBand 复测通过。R1 全字节扫描覆盖 744 文件及 UTF-16 形态，唯一生成测试 key 只在指定 AGENTS.md 输入中，数据库/日志/报告零泄漏；命中逐条登记为锁定包字节、结构字段、夹具输入，未分类项 0，真实秘密 0（`SECRET_SCAN_V2.json`）。

R2 同样 744 文件逐字节/哈希相等。最终扫描加入全部本地原始输出和自产脚本：R1 794 文件、R2 781 文件，逐条分类，未分类 0、已知夹具 key 泄漏 0、真实秘密 0（`SECRET_SCAN_V3.json`）。两轮完整 `REHEARSAL_REPORT.json`、`RUN_LOG.md` 及 `SHA256SUMS.txt` 已保存；两轮均为 REHEARSAL_NOT_ELIGIBLE / FAIL。

## 返工后闭合与冻结

`94385a8` / ZIP `3b6e0b72…a01cf` 在 `.acceptance/rehearsals/A9-27-W42/20260930-1423/` 连续两次预演均 PASS，退出码 0；全部 25 阶段及 W42-02～30 通过，W42-01 无 authority 为 NOT_PERFORMED。两轮各 743 文件与 Win7 清单一致；R1/R2 全字节与 UTF-16 扫描为 779 / 778 文件，未分类 0、夹具 key 泄漏 0、真实秘密 0，后飞行零残留。

R1 冷历史 DOM 299 条、加载更早可用，IPC 序列 select=1、queryEvents=2（limit=300）、submit=0；数据库十个 checkpoint。实时说明/tool/完成延迟均 0 ms。全部原值在 REHEARSAL_REPORT、driver JSON、SQLite 和截图中保留；R2 同样完整通过，不以 R1 摘要代替 R2。

两个独立干净工作树 `/Users/qlyf/Developer/win7-coding-agent-w42-build` 与 `/Users/qlyf/.codex/worktrees/w42-freeze-2/win7-coding-Agent` 完成正式构建：源码相同、source_dirty=false、external_acceptance_eligible=true、ZIP 逐字节一致并与预演一致。候选 `.acceptance/candidates/WIN7-42/` 已冻结；身份与角色方案见[正式交接书](../../plans/A9_27_WIN7_42_ACCEPTANCE_HANDOFF.md)。authority 仅有未批准草案；门 A、正式执行、门 B、main 合并均未执行。

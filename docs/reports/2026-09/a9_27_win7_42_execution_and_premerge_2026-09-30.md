# WIN7-42 正式执行、报告复核与合并前检查（2026-09-30）

结论：当前冻结候选在 Win7 正式执行 **30 项 / 25 阶段通过**，报告器在 Win7 复核退出码 0。执行方技术检查未发现未关闭的合并阻断；**负责人在偏差解读与接受建议后回复“接受”，门 B 收尾裁决记为 `A9_27_WIN7_42_A9_26_PASS`；补充真实 Windows Git R0-01～04 全通过。已按原授权快进合入本地 main（实现整合节点 `829ad39`），未推送**。

角色依负责人门 A 回复“签发门 A，按上述角色继续”：主代理执行、组装报告草案；负责人独立审核原始证据、裁决门 B。本报告为执行方事实材料，负责人原话和上下文单独记录；主代理不兼任独立审核。结论上限 `A9_27_WIN7_42_A9_26_PASS`，不是完整 Alpha 2 / RC。

本轮本机证据根（下称 `<L>`）：`/Users/qlyf/Developer/win7-coding-Agent/.acceptance/runs/A9-27-W42/92d693e0-e80a-4d58-9f7f-aaff5ec69bd3`。这些原始工件位于 Git 忽略目录，保留完整路径，未复制进仓库。

## 1. 准确身份与原始材料

| 项 | 值 |
|---|---|
| source | `94385a87d22928acc1ce5dd8f1881d89e0d4473b` |
| ZIP SHA-256 | `3b6e0b72b98de794594cd6924a1298ef75ed72bafcebacf966c86ad2382a01cf` |
| manifest SHA-256 | `6f7b224cdb304c9e10edf87ec9c490ffeb7dd5be42f9432ba3b6c5f3df3908c9` |
| authority / 独立 pin | `35111410302d33cacd8e042f4a4d3979d558825ce939d6b280e47d9b77fc4f79` |
| Kit SHA-256 | `96e42f48c4e578df0622773fbda02e70c43b0a234a641705719ce54912cdc827` |
| run-id / 主机 | `92d693e0-e80a-4d58-9f7f-aaff5ec69bd3` / `192.168.1.3` |
| 正式报告 SHA-256 | `13b4201622fe782647a5a38381f02b064f9fa0987625d1b51e61248fec7aa2fc` |
| Win7 运行根 | `C:\A9-W42\验收 目录\92d693e0` |

- 执行方完整收尾记录：`<L>/FORMAL_EXECUTION_CLOSEOUT.json`、正式报告草案：`<L>/review/report-w42.json`、逐用例断言与附件映射：`<L>/review/ASSERTION_OBSERVATIONS.json`。
- Win7 报告复核原始输出：`<L>/returned-report-review/unpacked/evidence/report-verify-console.json`、报告复核后飞行：`<L>/returned-report-review/unpacked/evidence/report-verify-postflight-status.json`。
- 正式执行秘密扫描逐条分类：`<L>/SECRET_SCAN_V4.json`、全文件校验和：`<L>/SHA256SUMS.txt`、追加执行日志：`<L>/RUN_LOG.md`。
- 全部执行原始证据位于 `/Users/qlyf/Developer/win7-coding-Agent/.acceptance/runs/A9-27-W42/92d693e0-e80a-4d58-9f7f-aaff5ec69bd3/returned/unpacked/`；报告复核原始证据位于 `/Users/qlyf/Developer/win7-coding-Agent/.acceptance/runs/A9-27-W42/92d693e0-e80a-4d58-9f7f-aaff5ec69bd3/returned-report-review/unpacked/`。冻结候选与两次预演保持不变，预演不计入本次结论。

## 2. 前置、运行与闭包

agent 为 console 运行中，实际身份 `dccs-chaizl-pc\agent`，Medium、非 High；中文参数原样。自检、完整性、smoke、报告复核四个任务均用 InteractiveToken / LeastPrivilege / agent 精确 SID，命令、完整参数、中文路径、工作目录和令牌字段逐一回读一致，CP936 源 XML 与 UTF-16LE 回读原文保留。

实际环境 Windows 6.1.7601 x64、Electron 22.3.27 / ABI 110、PowerShell 5.1.14409.1018、Python 3.8.10、Git 2.46.2.windows.1；未安装软件、切换会话或修改显示设置。Python/Git 哈希见原始自检和[交接书](../../plans/A9_27_WIN7_42_ACCEPTANCE_HANDOFF.md)。

- 完整性 wrapper 退出码 0，796 个物理文件、797 个 ZIP 条目、零 mismatch、独立 pin 一致。
- smoke 退出码 0，25 阶段及汇总 275 条断言全部通过；原 case index 的 W42-01 保持完整性入口占位，正式报告依据实际完整性报告补齐，W42-02～30 原值均 PASS。
- 774 个执行原始文件、19 个报告复核原始文件与 Win7 清单逐字节/哈希一致；报告复核镜像的 53 个文件闭集、字节与哈希相等，其中每个 Win7 原始附件另与仍留在运行根的原文件比对一致。
- 开发机正式报告校验通过；篡改附件一个字节及错误 pin 均拒绝，原证据哈希未变。随后 agent 运行包内 `RUN_WIN7_42_REPORT_VERIFY.cmd`：退出码 0、30 个直接当前候选用例。
- 两次后飞行均零相关进程残留，不先强杀；停止 PID 1556 已退出，实测 108 ms（阈值 5,000 ms）。四个任务逐项移除并确认不存在；ZIP/authority/输入锁/native 登记末次哈希一致。
- 最终扫描 916 个文件，含全部原始 Win7 文件、数据库、二进制、UTF-16LE 与本地原始输出；未分类命中 0、已知夹具秘密泄漏 0、真实秘密确认 0。已知随机秘密只存在于指定 AGENTS.md 输入夹具，逐条分类保留。

## 3. 关键用例原值

| 用例 | 实际观察 |
|---|---|
| W42-02～22 继承回归 | 中文空格路径；启动可用 1,930 ms（阈值 60,000）；读/改/Shell、审批拒绝零副作用、停止/重启、19 种 Git 形态、恢复/脱敏/分页/集合上限、改动审阅/撤销/漂移/后续轮次/模式/布局均通过；原索引、截图、数据库完整保留 |
| W42-23 恢复目录 | 自忽略与 legacy `.gitignore` 字节均 `2a0a`；真实 Windows Git status / dry-add / dry-clean 均不含恢复目录；二次打开哈希和 mtime 相等 |
| W42-24 验证口径 + A9-28 | 仅写/分号组合保持 unverified；验证成功有退出码依据；成功后 20,000 字符失败输出撤销已验证状态 |
| W42-25 说明与环境 | 两轮请求各一份项目说明、一份实际 Win7/PowerShell 环境；含已知秘密输入被拒绝，请求/事件/日志/数据库零泄漏 |
| W42-26 预算 + A9-28 | 16,000 预算首次 400 后请求从 15,703 压到 7,953 并成功；连续 400 明确失败；不可压缩输入零请求，`A9_CONTEXT_BUDGET_EXCEEDED` |
| W42-27 冷历史 | 选择 seq=1、查询 seq=2 / limit=300、首轮提交 0，界面 299 条且“更早”可用；只读 SQLite 为 2,500 条过程事件 + 10 条会话事实、10 个 checkpoint |
| W42-28 取消与文案 | cancelled 终态/“已停止”存在；超限备份显示中文原因且无 too_large 原因码 |
| W42-29 A9-29 审计 | 真实 Runtime + SQLite：正常两读两编辑计数 4；tool_start 故障保留原文件/计数 2，tool_end 故障只首文件已改/计数 3，终态故障如实记已有两编辑/计数 4，后续派发停止 |
| W42-30 A9-29 Provider | 明确 tool_calls + 正常 EOF：一次编辑/两请求；missing、length、content_filter、stop+tools、空流、非法 JSON：零编辑/一次请求 |

本次 Win7 布局截图：`<L>/returned/unpacked/evidence/smoke/w42-22-layout.png`显示检查器、Diff、撤销与撤回控件；实测 devicePixelRatio=1.25，1079×540，无文档横向滚动。

## 4. 偏差与证据边界

1. G0 本地生成器把 authority 路径中的 `\a` 转义成 BEL；前置停止于部分空目录创建，未注册任务或执行产品。空目录逐项核对后 prepare-v2 成功；原脚本和失败输出保留，无候选/产品修改。
2. 完整性任务未单独重定向 wrapper 控制台输出。原始结构化完整性报告、令牌组、起止/退出码及随后 Win7 原始 JSON 回读输出完整保留；不伪造缺失的控制台输出。30 项报告依据实际结构化完整性证据，报告复核再次校验同一完整候选和 pin。
3. 报告安装脚本 EncodedCommand 超过 Windows 命令行长度，未启动远端脚本；改以短 `-File` 调用同一已上传脚本后全部哈希/任务门通过，两个原始输出保留。

本次模型为本地回环协议夹具；真实 Provider/企业模型未验证。POSIX Shell 与 PowerShell `/Command` 的实际执行、≤799px 不可达分支保持既有未测边界。`git clean -fdx` 会清除忽略目录，仍不可用此命令清理恢复数据。历史候选不改判。

## 5. 合并前检查与负责人裁决

原四项 P1 冻结前阻断在 A9-28/A9-29 修复，开发机检查和独立代码复核见[收尾记录](a9_28_a9_29_developer_closeout_2026-09-30.md)；本候选 W42-24/26/29/30 已取得上述当前 Win7 证据。包测试 106/106、Shell 49 suites / 478 tests、verify:quick、docs:check 与差异检查通过，原始日志 `.acceptance/w42-developer/`；仅文档变化后不重复产品全量检查。

`main` / 刷新后的 `origin/main` 为 `38ca46ea09cb9427d125e5f0d5bf09270660eabc`，是当前 alpha2 的祖先。冻结源至当前 HEAD 的 `src/`、`release/`、`scripts/` 无差异；来源、输入、native、Kit 不重绑。main 至当前分支 22 个产品源码文件已由对应批准任务及当前/继承实机用例覆盖；合并前快照的文件/提交清单在本轮 `review/PREMERGE_FACTS.json`，后续文档追加不改变冻结实现。

原有两处 spike ZIP 删除及未跟踪 `release/win7-product-v3/check.py` 均未暂存或修改。门 B 收尾后已复查 Git ref/工作区，在独立干净 main 工作树完成快进合并；当前脏工作区的原有文件状态保留，不推送。

2026-09-30 负责人在三项偏差解读及接受建议之后回复“接受”。结合已确认的负责人独立审核/门 B 角色和原验证后合入 main 授权，记录门 B 收尾裁决 `A9_27_WIN7_42_A9_26_PASS`，并按授权继续本地合并。原话仅为“接受”，不改写为“签发门 B”，不声称负责人亲自重跑或逐文件阅读证据。回执 `<L>/GATE_B_OWNER_ACCEPTANCE.json` 绑定本节准确报告、source、ZIP、authority、run-id 和既有边界。三项偏差接受后未补造原始控制台；正式报告及旧 pending 快照保持不变。


## 6. 收尾补充：真实 Git 原矩阵

收尾检查发现原 W42-23 的 dry-add/dry-clean 不能单独证明 A9-26 §5 第 5 项全部 R0-01～04；此前汇总未充分区分。保持冻结源和产品字节，在同一 Win7 `agent` Medium 控制台增加候选外补充：包内 Workspace API 执行编辑、基线/外部改动收集及撤销，实际 PowerShell 输入和已有 Windows Git 执行命令。此补充不替代原 W42 main/preload/IPC/Runner 与 GUI 旅程。

根仓库和 `pkg` 子工作区均实际执行 `git add -A`、`git add .`、`git add :/`，缓存仅含目标代码；`clean -nd` 清单为空后执行 `clean -fd`，实际删除项为空；实际 `stash -u` 后恢复目录全文件哈希不变，Shell 轮和编辑轮撤销均零错误、代码恢复原字节。旧目录首次补写 `*\n`，二次打开哈希/mtime 不变；预置自定义规则原字节/mtime 保持，留下对应诊断。四项均 PASS，wrapper 退出码 0。

首轮补充在 stash 后严格 LF 断言遇到 Git `autocrlf` 的 CRLF 转换而退出 1，原控制台、脚本、Git 仓库和恢复数据全部保留。第二轮在新临时根、仅逐命令 `-c core.autocrlf=false` 固定夹具换行契约后通过；没有修改全局、系统或用户仓库配置，没有改产品或放宽断言。两个任务逐项移除并确认不存在，后飞行零进程残留，原 ZIP/authority 哈希仍一致。

补充报告：`<L>/returned-supplement/unpacked/supplement-recovery-v2/evidence/recovery-matrix.json`，SHA-256 `dfea7bc316cc74881514d11cc388b245a6a4d635af7db7b06124255f5915b41c`。182 个文件含首轮失败和第二轮通过证据，与 Win7 清单哈希闭合；返回 ZIP SHA-256 `3abd16628753fa1f5fca7f64da5123c65d90f6b9aeb93dfada7d3e24d4c95e64`。取回后扫描 `SECRET_SCAN_V5.json`：1,161 文件、未分类 0、已知夹具秘密泄漏 0、确认真实秘密 0。后续回执/检查追加使用另命名校验和快照，不覆盖原校验和。

开发机 R0 使用真实 Apple Git 的测试入口为 `src/workspace/tests/unit/a9-recovery-ignore.test.ts`，收尾窄范围复查 13/13 PASS、零跳过（Apple Git 2.39.5 / Node 20.17.0），记录 `<L>/review/APPLE_GIT_R0_CLOSEOUT.log`；这与上述 Windows Git 补充共同关闭 A9-26 原矩阵第 5 项。`git clean -fdx` 限制继续保留，历史候选不改判。


## 7. 本地 main 合并结果

已在 `/Users/qlyf/.codex/worktrees/a9-main-integration/win7-coding-Agent` 的干净工作树切到既有 main，从 `38ca46ea09cb9427d125e5f0d5bf09270660eabc` 快进到验收收尾提交 `829ad39f215958e6c7cf4ec064a72ac5b897e62b`。无冲突、无历史改写；本节及状态记录作为文档追加后同样快进到 main。最终本地 ref 与保护核对结果单独保存于 `<L>/LOCAL_MAIN_MERGE_CLOSEOUT.json`，不把冻结候选重绑到文档提交。

合并后 main 与 alpha2 的产品/发布/套件字节均等于冻结源 `94385a8`；main 工作树干净，主工作树仍为 alpha2，原有两处 ZIP 删除与未跟踪 check.py 均保持。origin/main 未改动，未执行 push。验收范围及已知限制不因合并扩大。

# A9-31 源码交接与构建前置（2026-10-03）

```text
Status: LOCAL_IMPLEMENTATION_REVIEW_READY_NOT_DEVELOPER_VERIFIED
Branch: codex/a9-31-background-tools
Parent: c2b6356f83ef8502a34516010924547c57a3bec2
Source Commit: NOT_COMMITTED
Managed Kit Approval: NOT_PERFORMED
Managed Input Lock: NOT_LOCKED
Windows Electron / Win7: NOT_PERFORMED
```

具体批准为任务§6的C2，仅源码实施与本地检查。当前差异尚未提交；提交前需负责人对实际差异批准。
[本地报告](../reports/2026-10/a9_31_local_implementation_and_source_handoff_2026-10-03.md)与候选外
`.acceptance/a9-31-developer/handoff/source-approval-r2.json`逐文件尺寸/SHA共同构成提交材料。
以外部清单绑定本文件及报告，避免文件自引用哈希；提交只能暂存清单的精确路径，不含Runner生成dist、
本地node_modules链接、数据库、原始证据、历史kit或任何候选。源码基线不包含主工作区改动。

## 行为与失败边界

start/read/stop只经Core Policy与产品管理器；归属由Runtime冻结，模型不能提供PID、owner、Shell path或env。
ready前先持久化启动意图；输出先冻结编码/跨块脱敏，再按原Turn落SQLite、IPC和活动卡，有界ring提供游标重读。
原Turn结束后的输出仍归原卡，不生成第二张卡，不作为verified证据。普通Shell不再接受模型background参数。
三进程上限，错归属/错游标/过期均结构化失败；重启只恢复事实与身份探测，不能重放或接管管道。
审计或协议失败阻断后续派发，无法证明清理时保留责任和锁；release_unknown不能用任意PID停止。
运行中cleanup责任与失败残留分开投影；历史cleanup_required事实保持未知。

关闭前选择Stop、release或取消。release意图落盘，本helper只清除自己的Job的KILL_ON_JOB_CLOSE并回读，
关闭所有权/捕获句柄后发送request/release/child/seq/counters绑定的回执。无回执不能报告leftToSystem。
release不宣称清理或任意程序存活；依赖pipe的进程可能退出。Stop必须等真实终态与树清理证明。

## 输入、构建与返回合同

六个managed模板保留旧kit，Profile `WIN10-VS2019-V142-SDK19041-D013-V26-MANAGED-X64`，
revision `a9-31-managed-r1`，helper版本 `1.4.1-d013-v26-managed`。
批准准确源码提交后，将完整40位SHA写入SOURCE_COMMIT并运行prepare-kit；逐文件绑定源码提交时间、
大小/SHA、input-lock/PACKAGE_MANIFEST，未提交native源码、缺失/额外/错hash均拒绝。
SOURCE_COMMIT、源码副本与正式锁现在不存在，不提前写占位哈希。

从提交生成正式ZIP，负责人/指定独立人审查安全、接口、API/CRT与准确套件哈希，批准登记及具体构建机目录/动作。
独立批准登记追加到干净HEAD后才接收正式返回；模板/TEST_ONLY包不具正式批准。
先只读检查Windows10 x64、VS2019/v142、SDK19041、普通非提升/无Host Job及工具/输入哈希；未知即停，不安装或改策略。
同批准kit在两个新批准目录执行独立run-id，v1/v2与v3 smoke、release根/子句柄身份及存活/自然结束、cancel竞态、
PE AMD64/manifest/API/静态CRT，helper逐字节一致。Windows PS5.1解析/C#编译/执行及Win7均待真实环境证明。
返回记录器验证批准HEAD、套件/源码/manifest/文件闭集、两个独立身份与smoke原始帧，失败留诊断、不生成正式锁。

新锁 `a9-v26-managed-input-lock.json` 使用独立ID/Profile；生产者仅装配独立A9-31开发检查包，
无WIN7-43编号、无authority、不继承旧候选PASS。实际原生锁到位后再做真实Electron、受影响共享Shell与后台交互。
独立复核和开发机合同完成后才能登记DEVELOPER_VERIFIED/申请整合；A9-32/33批准与Win7门A/B分开。

## r2修正与审批边界（2026-10-03）

managed README精确命令路径和锁ID已修正；套件生成/封装新增准确managed合同/revision拒绝。
旧r1提交材料保留为历史、被r2取代；r1批准不能覆盖r2不同字节。仍仅51路径，不扩大实现范围。
[报告r2追加](../reports/2026-10/a9_31_local_implementation_and_source_handoff_2026-10-03.md)记载新增6项及直接/继承分类。
source-approval-r2.json在候选外绑定全部字节；收到具体批准后才提交并取得正式来源SHA。

## 源码提交与managed r1复核之后（2026-10-03）

负责人批准r2清单后，本地源码提交2ecfc86d22bd7816cb75222db0917b25d32291a1，准确51项字节一致。
r1来源ZIP生成但未批准，独立指出审计历史解释/反向竞态缺口；原ZIP和报告保持不通过。
修复及独立补充已关闭两项本地证据缺口，修复未提交，新source/kit未形成。
[修复交接](../reports/2026-10/a9_31_managed_review_fixes_and_source_handoff_2026-10-03.md)及
候选外source-approval-r3.json是下一份准确审批材料。上文“源码未提交/生成文件不存在”是历史时点，保留原文。
r1的17项生成文件不混入修复源码提交，新kit/批准登记/构建仍各自待批准。

## managed r2独立复核之后（2026-10-03）

r3修复已按负责人批准提交d9b5be502c9475e50c54b349a6a12abd27b199f8；来源绑定managed r2 ZIP已形成。
本次独立复核FAIL_NOT_APPROVED（P1=1），[报告](../reports/2026-10/a9_31_managed_r2_independent_kit_review_2026-10-03.md)。
只读Toolhelp父子身份取证与schema2/退出码修复见[精确补批材料](A9_31_MANAGED_IDENTITY_REPAIR_APPROVAL.md)，
ADR-0156 Proposed。新增系统API具体批准前不实施；kit批准登记/源码提交/远端构建仍分开批准。
历史未提交状态及旧套件不改写，当前完整开发机/Win7门未通过。

## ADR-0156实施及准确源码交接（2026-10-03）

负责人具体批准后六路径修复完成，reader超时资源收尾P2另修并另冻输入/重跑kit。
[独立补充](../reports/2026-10/a9_31_managed_identity_repair_independent_followup_2026-10-03.md)静态0/0/0，
[最终交接](../reports/2026-10/a9_31_managed_identity_repair_source_handoff_2026-10-03.md)和
候选外source-approval-r4.json将供准确提交审批。90直接/644精确继承，真实Windows仍NOT_PERFORMED。
只在具体源码提交授权后生成未批准新r3 ZIP；保留原r2失败、旧生成文件和所有锁，登记/构建分别待批。

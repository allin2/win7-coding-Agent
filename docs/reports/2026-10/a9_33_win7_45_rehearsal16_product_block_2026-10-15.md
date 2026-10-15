# A9-33 / WIN7-45 预演16：启动失败生命周期与审计阻断

结论：预演16为FAIL，不能进入第二次连续成功预演、双构建、冻结或新关口A。页面重载修复已越过前两轮的新会话超时；本次首失败是无效cwd启动后的BG03-A01：没有start_process结束事件，句柄为cleanup_required，IPC返回A9_AUDIT_PERSISTENCE_FAILED。新的产品修复未授权，执行代理只读诊断并停止下游。

证据层级为Win7实机预演，身份REHEARSAL_NOT_ELIGIBLE；不是正式Win7/Alpha2验收。原包、run、数据库和首失败保持，不改判。连续成功0次。

## 1. 准确绑定与执行

| 项 | 实际值 |
|---|---|
| source | 548ef0a65fa307a2af7932958236e0c5a7a0c932 |
| ZIP | 101676004字节，b2e2d423aeaeba7bc641c69e48faeabf0994970a734064c53c074d39acbaaef4 |
| manifest | 8dfd08ccced65e07a2141cde9249253b3e56d347a2b5d6c7c4bf1501aa3258c4 |
| kit | 5ca7751494e7e73c5ffeedaab5309ec4f359864b89d29c24031656a14ca050f0（25用例43断言） |
| 预演授权 | 5c71aeb64e20242414e5a6f9cf50cddb00ea9f4e260df4645ec58e0d5484309e |
| run / 新根 | b9731870-0776-4a67-950d-3cc849db7c66 / C:\A9-W43\run\b9731870 |
| 目标 | DCCS-CHAIZL-PC，Win7 SP1 6.1.7601，agent精确SID、console会话2 |
| 窗口 / 预算 | 07:19:46Z～15:19:46Z，总截止2026-10-16T06:59:59Z；本次5 CONSUMED/5 COMPLETED，累计97/124 |

第20轮全新独立复核07:01:53Z～07:17:39Z退出0，对准确548ef0a…报告0P0/0P1/0新增P2，建议恢复有界预演。其结论仅开发机：包测试120、可运行Jest270、相关7例、独立10例通过，4变异有效拦截；9项沙箱listen EPERM保持UNKNOWN。报告SHA-256 85ce12d57a198e836f054e5d2aed38795c9a01034f65dc003d3c214bf584c912，归档 `.acceptance/a9-33-review/codex-bg-probe-reload-round20-20261015/independent/`。原树及独立副本最终字节/状态通过，累计非docs精确20路径。

R1目标、账户、空间和无electron/helper通过；R2只建新根并限定赋权；R3的10文件两端大小/哈希一致，R4解压manifest匹配。普通任务均先回读SID/权限/命令/目录/时限。

p01～p04 PASS。p05于07:24:38.575Z开始、07:39:43.753Z结束，阶段与账本均FAIL，failure_class=DRIVER_SESSION_BG_FAILED；07:39:52Z顺序入口停下。session_restart、release_exit和p06～p10均NOT_PERFORMED。未启动预演17、双构建、冻结、正式运行或门A/B。

## 2. 首失败原值

证据根为 `.acceptance/a9-33-rehearsal/rehearsal-16/`，下列文件均在完整回收的r7/evidence/requests/05-p05-session-bg下：

- driver-session_bg.json：status=DONE，error=null；BG01、BG02断言PASS；BG03-A01为FAIL。DONE仅表示驱动主体写出结果，不表示实际进程退出或阶段PASS。
- bg03-stop-release.json：double_stop=PASS；fast_exit=PASS（单个新事实exited、cleanup_required=false、residue=0）；failed_start=FAIL（path=null、start_ends=0、新事实1、status=cleanup_required、cleanup_required=true、residue=1、20秒收尾未解除）。
- driver-session_bg.json的IPC：07:25:01.208Z新会话创建成功；07:25:01.836Z无效cwd的a9.turn.submit返回ok=false/error=A9_AUDIT_PERSISTENCE_FAILED。
- dialog-shown.marker：07:25:22.270Z，精确driver PID7300，显示“退出时处理后台进程”，detail为sh-1792049101546-05ef41fb。执行代理未手动放行或选择按钮。
- driver-launches.json：session_bg启动07:24:41.870Z，结束07:39:42.167Z，duration_ms=900297，code=1，killed_by=timeout，dialog_click=null。这是既有900秒上限触发的套件树终止，不是正常退出，也没有延长等待；随后套件strays observed=true，attempted/removed/remaining均为空。
- phase-result.json：status=FAIL，first_failure精确指向B2-BG-03-STOP-RELEASE-EXIT-A01，不以正常双Stop和快速退出替代整个BG03。

## 3. WAL数据库核对与读取纠错

强制退出保留了DB/WAL/SHM。执行代理最初用immutable读取主库，未包含WAL；该派生结果diagnosis-db-facts.json不作为完整数据库视图，原文件保留。纠错记录为diagnosis-read-method-correction.json。

正确方法：将三个原文件逐字节复制到新的sqlite-wal-analysis-copy目录，在副本用SQLite mode=ro及query_only=1读取，让SQLite应用已有WAL；不对原件checkpoint、不写辅助文件。正确摘要为diagnosis-db-wal-facts.json。原件读前后哈希不变：

| 文件 | SHA-256 |
|---|---|
| a9-state.db | 4e714bd248a59d1c4b6e7465399b829bae2595a8d9f25caf8c957e62db952e67 |
| a9-state.db-wal | d0ec97bd8e51942f7bcadfeddd8e42ba286031fb95c1eda1c8b368513ce4fe60 |
| a9-state.db-shm | 06c7bbc4b3f4e83317ac3edc2ded07538875abc25b1f9bb1a26ab3b1e6644241 |

WAL视图显示：无效cwd的Turn为turn-1792049101507-1，status仍active；事件131～136包含turn_started、start_process的tool_start及managed_process_ownership，没有该Turn的tool_end或终态事件。句柄sh-1792049101546-05ef41fb的持久化last_probe_status=cleanup_required，pid=NULL。不能把这个NULL解释成0或未创建进程，也不能用其他已退出PID代替它。该事实保持未知生命周期和审计阻断。

## 4. 收尾、回收与结论上限

R8当前101进程，未发现electron/helper或本次根关联进程，本次任务0；6个已记录正PID和driver PID7300均未在当前表出现。这不补签缺PID句柄的退出码、未启动或清理成功。没有人工追加终止或清理；既有套件超时树终止已单列。

R7完整回收234文件，大小及SHA-256全部一致、0缺失额外；本机扫描166文件、0命中且正控检出，不补签未执行p10。315件原包/输入/首失败材料保护清单为PROTECTED_SHA256SUMS.txt，SHA-256 ec6f39df365309a71ee2e537967f66c32fdf6a422eabc0ea2ed958e02a8888a6。

只读源码核对发现：background-process-manager.ts在ready失败且无完整证明时保留cleanupRequired；a9-agent-runtime.js的recordManagedHandle遇failed状态会调用blockManagedAudit，触发后续派发硬停。它们支持当前现象，但具体helper终态、清理证明缺口及正常业务失败与审计失败的区别仍需产品范围调查。未据此认定磁盘损坏，未改产品、原生或判据；既有KL-1～KL-12不重开。

## 5. 负责人裁决

推荐A：批准[独立产品修复合同提案](../../plans/A9_35_MANAGED_START_FAILURE_REPAIR_PROPOSAL.md)，在新任务/隔离分支的9条精确路径内调查和最小修复、完成本地检查及新独立复核，并允许该范围本地提交；不推送。现有证据不足或需要native/协议/锁变更时仍停，不把未知清成PASS，不把启动前refused冒充启动后ready失败清理。

B：保留本轮FAIL并停手交接，不启动产品修复。

A9-33 §6.1明确“不批准后台/继续产品语义修复”；仓库AGENTS.md C14要求当前已批准任务、分支和精确允许路径同时满足。因此本轮旧授权不能直接修改Runner、transport或产品runtime。该新授权请求不是冻结或门A/B。未在Win7正式验收通过；任何Alpha2结论仍须携带KL-3、KL-5、KL-6a、KL-7及a/b/c边界。

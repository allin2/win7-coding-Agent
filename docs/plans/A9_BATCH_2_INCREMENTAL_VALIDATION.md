# A9 第二批增量验证与证据继承合同草稿

```text
Status: DRAFT_READY_FOR_REVIEW
Updated: 2026-10-02
Inspection Source: 32ee0b48edd286c77aa543bdda9eb834fd4576aa
Scope: A9-30 / A9-31 / A9-32 / subsequent Win7 candidate
Inheritance Authorization: NOT_GRANTED_FOR_FUTURE_SOURCE
```

本合同服务第二批整批 Win7 验收，减少已验证且未受影响内容的重复执行；不是跳过任务必需检查的授权。
与 [A9-31](../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)、[A9-32](../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md)
和 [A9-33 草稿](../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md)一起审批。

## 1. 继承准入与记录

每条机器记录至少包含 requirementId、scope、componentPaths、sourceCommit、artifactSha256、
dependencyPins、configurationDigest、originalReportPath/reportSha256、originalRunId、environmentIdentity、
userIdentity、affectedByChanges、impactRationale、evidenceClassification、approvalReference。
报告按直接/继承/未执行分别列出，不用单一总数代替覆盖。

只有字节、依赖/构建参数、配置及相关调用行为均未变化，原报告可核验且结论适用，才能提出 INHERITED_EVIDENCE。
改动组件的上下游也纳入影响分析；源码没变但调用方式变了，不能按文件哈希单独签继承。
新源尚未形成时只登记 ELIGIBLE_FOR_REVIEW 或 MUST_RERUN，不提前批准具体继承。
旧 FAIL/UNKNOWN/NOT_PERFORMED、原 source/ZIP/run-id 均不可改绑。

## 2. Win10/开发机矩阵

| ID | 范围 | A9-31 | A9-32 | 原证据及准入边界 |
|---|---|---|---|---|
| ENV | D-017、Electron22/Node16/ABI110、SQLite绑定 | 只读版本/工具/身份/哈希预检 | 同样轻量预检 | A9-30 环境可引用；本轮实际用户、Session、令牌/Job及工具字节仍直接核对 |
| BUILD | helper正确性、双构建、PE/API/CRT | 新 managed revision MUST_RERUN | 未改native且锁/参数完全一致可提议继承 | A9-30 helper c895a2f9…是旧 revision，不证明新的 release；返回包run-id独立 |
| S01/S02 | 退出前tick、双源顺序、真实终态 | MUST_RERUN | 受Runtime影响的集成路径 MUST_RERUN | 原 Boot15/First16 仅绑定32ee0b4；新helper/Runner改变不能直接沿用 |
| S03 | SQLite先落盘再IPC、最终结果验证判定 | MUST_RERUN，含必需审计失败零后续派发 | MUST_RERUN | 每阶段有负向对照，已发生副作用但无终态保持未知 |
| S04 | UTF-8/CP936/UTF-16LE跨块、CRLF/无换行 | MUST_RERUN，真实新helper至UI | 解码/helper未受影响可提议继承；共享输出集成直接重测 | A9-30编码及秘密夹具可复用，不能把旧字节输出当新helper执行 |
| S05 | 输出限额、秘密、背压、取消与清理 | MUST_RERUN，含release/取消竞态 | Stop/出口脱敏及继续影响路径 MUST_RERUN；未受影响纯解码可提议继承 | native raw-pipe终态丢失清理UNKNOWN按合同保留，不代签成功 |
| S06 | 刷新/分页/返回/重启、退出 | MUST_RERUN，含后台事实及两种退出 | MUST_RERUN，含中断继续 | 帧/终态稳定身份及重复输出有直接检查 |
| BG | 数量、owner/handle、游标、PID复用、ready/release | 全部新用例 MUST_RERUN | 正常后台共存、残留阻断、Stop/退出 MUST_RERUN；纯游标组件可提议继承 | 任何恢复旧进程均无自动重放/虚构接管；stop不能操作任意PID |
| CONT | 主动新Turn、事务去重、旧审批、未知副作用 | NOT_IN_A9_31_SCOPE | 全部新用例 MUST_RERUN | Win10首次真实验证；刷新/重启本身零Provider/工具请求 |
| SAFE | Policy/高影响确认、审计、预算、Provider完整性 | 新后台工具及共享dispatch MUST_RERUN | 新continue及共享dispatch MUST_RERUN | W42或A9-30的既有PASS不自动覆盖新入口 |
| UI | 活动卡/后台列表/继续卡、焦点滚动切换、退出 | 受影响交互 MUST_RERUN | 受影响交互 MUST_RERUN | 原生选择器、不可达宽度及未列出的编码模式保持原未测边界 |
| PACKAGE | manifest、Profile、helper/SQLite、SBOM/许可证及加载 | 新包完整性与实际加载直接执行 | 新包完整性与实际加载直接执行 | 未变稳定宿主可以精确继承，包身份/新入口不能继承为直接PASS |

原始入口为 `.acceptance/a9-30-developer/closeout/r6-real-electron-evidence-matrix-r11.json`，
SHA-256 `eee747cfd555f746e3b1e2a77e569d7f09ce1011974e30e1614223d8b4f556f7`；
独立复核 `r6-final-independent-closeout-review-r1.json`，SHA-256
`705acc507bea2d990d53305cc7700323c3713c2c660a01dff3905a811e2f6d07`。
该r11历史顶层status仍含NOT_DEVELOPER_VERIFIED，但developer_gate为DEVELOPER_VERIFIED、pending为空；
现行结论取独立复核及 [正式裁决](../reports/2026-10/a9_30_developer_closeout_decision_2026-10-02.md)，
不覆盖冻结JSON，不用这一旧顶层文案撤销已签开发机结论。新批矩阵使用单义状态并保留该差异说明。

## 3. 必跑场景与反例

- 后台：3个可用/第4个拒绝、启动/ready失败、错属/未知句柄、重复/过期/未来/错属游标、双Stop、
  异步终态、必需落盘失败、进程身份漂移、重启事实、正常Stop退出及release退出。
  release回执丢失、设置Job位失败、cancel竞态、依赖pipe导致退出分别如实报告。
- 继续：恢复摘要后零自动请求、点击创建一个新Turn、双击/刷新/崩溃持久去重、错属/归档/revision漂移、
  旧审批失效、未知副作用先查现状、残留与诊断模式阻断、AGENTS.md变更、预算零发送、Provider失败及主动重试。
- 共享安全：错requestId、重复/缺序号、非法Base64/字节计数、早于started/缺终态、慢消费者、落盘失败、
  秘密跨块/编码变体均有结构化失败及秘密出口检查。
- 反例至少包含关闭owner/cursor校验、把release当句柄删除、把清理未知写成功、移除事务去重、
  重放旧审批/工具及关闭审计门；反例应红，恢复后核对源码字节，不能提交故障注入代码。
- 普通文档准备仅docs:check和差异检查；实现按批准定向命令及verify:quick，新增变化或失败才扩测。

## 4. Win7矩阵与结论

新候选直接覆盖S01–S06、BG、CONT及SAFE受影响项；ENV、PACKAGE、正式报告验证/秘密扫描/后飞行均直接执行。
既有W42能力只在未受本批影响且精确绑定获批时标INHERITED_EVIDENCE。
Win10为开发/构建证据，不能作为上述新增Win7能力的继承替代。
真实Provider、企业代理/CA、POSIX、PowerShell /Command、≤799px布局、A9-17/A8/安装器/凭据生命周期
不因本批通过而改判；未执行统一NOT_PERFORMED。

当前第二批正式Win7全部NOT_PERFORMED。冻结前将每一requirement绑定最终源码、锁、候选、实测命令和断言；
审批矩阵的原则不等于批准尚不存在的source或authority。正式执行及独立审核分离，负责人门B才登记批次PASS。

## 5. 自动化与恢复

复用已有调度/取证逻辑，新批控制器只接受批准的phase、脚本/包hash、目录、用户及run-id。
每次启动检查实际普通桌面令牌/Session及合同Job条件，最多2小时/16个请求，到限自行停止接单。
SSH仅传输/校验/调度/回收，不把Session0当真实桌面；不复活旧HALTED控制器。
首次桌面启动尽量自动；无法满足合同且需人工时只给一条入口命令，后续失败由控制器接收新请求。
普通夹具失败可在已证明生命周期结束后等待新请求；身份/完整性/安全/审计/未知生命周期立即HALTED，
重新确认事实并按批准的新入口恢复，不能超时后直接记WAITING。
控制器不扩权、改系统、安装服务或自动删除文件。所有原始返回先保存再断言，首失败不可覆盖。

## 6. A9-31 C2及本地矩阵（2026-10-03追加）

C2已批准A9-31增量合同；本文件其他未来阶段仍待具体批准。
本轮Core185/Runner162/State70/Shell113直接本地检查，矩阵在候选外
`.acceptance/a9-31-developer/handoff/local-evidence-matrix-r1.json`，逐项绑定组件SHA、日志SHA及本地环境。
本地模拟native消息和POSIX进程不作为Windows直接证据；修改helper/Runner/runtime后的S01–S06、BG/SAFE/UI/PACKAGE
维持MUST_RERUN，未为任何新Win10/Win7包签发INHERITED_EVIDENCE。

## 7. A9-32 本地影响与后续准入（2026-10-11）

A9-32 本地 §1–5 已批准，增量命令本轮直接执行。
准确基线 `571ec550…`，未提交源差异与检查见[报告](../reports/2026-10/a9_32_local_implementation_and_batch2_readiness_2026-10-11.md)。
State 82/Core 183/Shell 125 和编译为开发机 PASS。生产页面交互为 SURROGATE。
native/Runner源、依赖/锁不变；当前 native 不重构建。
没有签发未来 source 的 INHERITED_EVIDENCE，原报告继续绑定原 run。

| 范围 | 本地本轮 | 新包/Win10/Win7 |
|---|---|---|
| State/CONT/SAFE | 当前事实、事务/Turn去重、未知副作用、审批、审计、预算直接开发检查 | MUST_RERUN；真实 Node16/SQLite ABI110及包内入口 |
| Runtime/IPC/UI | 当前 dist、文件/SQLite、本地HTTP及实际生产页面/SURROGATE | MUST_RERUN；真实 Electron/preload、滚动焦点/Stop/正常退出 |
| native BUILD/S04解码 | 未变源码/锁，ELIGIBLE_FOR_REVIEW | 先核字节/参数/配置/调用适用及原报告；新包加载与共享集成直接执行 |
| S01–S06/BG/恢复 | 原合同本地回归直接执行；Windows native未执行 | MUST_RERUN；不能以源码未改继承共享派发与生命周期 |
| PACKAGE/ENV/审核 | NOT_PERFORMED | 新 source/ZIP/锁/实际身份/闭包/普通出口与独立审核直接绑定 |

原矩阵未来继承未批准的边界保持。未测项和旧 FAIL/UNKNOWN/HALTED 不改判。

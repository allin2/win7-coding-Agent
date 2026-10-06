# A9-31 开发检查包 r1：Win10 真实 Electron 执行与控制器精确补充合同

```text
Status: READY_FOR_OWNER_EXACT_PATH_APPROVAL
Task: A9-31 / codex/a9-31-background-tools
Product source: 35a19250ed6589f6a7ba35b940a784325970c111
Decision: ADR-0159 Proposed
New controller code: NOT_IMPLEMENTED_PENDING_EXACT_WHITELIST
Remote writes / real Electron / Win7: NOT_PERFORMED
```

负责人已授权下一步打包及Win10真实验证；本包具体补齐任务C14未列出的四个外部测试源文件和新远端根。
产品包已经形成、完整性已核验，见[事实报告](../reports/2026-10/a9_31_product_r1_package_and_win10_preflight_2026-10-03.md)。
本包不要求重复原生构建，不改A9-30/managed锁，不把P1=1/旧controller UNKNOWN改为0或PASS。

## 1. 精确输入与可观察结果

| 项 | 固定值 |
|---|---|
| product source | `35a19250ed6589f6a7ba35b940a784325970c111` |
| ZIP SHA-256 | `aae71bb0c446bda7e9bd04f58b51c208d02d4c723f13908e55cd077e0d2f10c0` |
| release-manifest SHA-256 | `df70fa5bd2df2f91eeed8cf441006241442cea33cc6c622c82a92742ca97e7b9` |
| managed input lock SHA-256 | `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e` |
| helper SHA-256 | `2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7` |
| manifest / total files | 783 / 784；payload 236133235bytes |
| target | `192.168.1.4` / `WIN-2JQ66JE4HTQ` / Win10build19045x64 |
| execution identity | SID `S-1-5-21-3031939772-989444280-3099258187-1005` / Session3 / actual Medium8192、non-elevated、no Host Job |

成功结果是新包实际加载Electron22.3.27/Node16.17.1/ABI110/SQLite3.43.1并通过以下直接场景，
逐项绑定独立run-id、脚本/包/锁SHA、实际令牌及生命周期。没有运行或无法证明的项保持NOT_PERFORMED/UNKNOWN。
开发机收口仍须最终独立复核及负责人裁决；本包不分配WIN7-43、不签Win7/Alpha2/RC。

## 2. C14四个精确外部测试源路径（待本包批准）

1. `.acceptance/a9-31-developer/product-r1/control-scripts/stage-product-r1.ps1`：固定目标/输入的安全展开与完整闭包核对。
2. `.acceptance/a9-31-developer/product-r1/control-scripts/launch-product-r1-desktop.ps1`：普通真实桌面监督器；持有controller句柄直到实际结束，记录退出码与树。
3. `.acceptance/a9-31-developer/product-r1/control-scripts/serve-product-r1-desktop.ps1`：新固定phase请求控制器；逐请求持有Electron/helper/root/child句柄及实例身份。
4. `.acceptance/a9-31-developer/product-r1/control-scripts/product-r1-driver.cjs`：外部Electron测试驱动，加载未改包内main/preload/IPC/Renderer与真实SQLite/helper。

只有本包获批后才编写这四文件，不以候选外目录存在作为实现授权。
其源版本和实际执行版本全部保存；C14不授权其他实现路径。
已有68路径内发现的产品错误可按原任务修复/定向检查，但新源码提交、原生/产品重发与执行绑定仍按具体合同。
这四文件只作验证工具，不加入产品ZIP、模型工具、安装器、服务或用户自动启动。

## 3. 新远端根和允许写入（待本包批准）

实际profile已只读核对：`C:\Users\a9builder.WIN-2JQ66JE4HTQ`。新根：

```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261003
```

允许在该根创建以下准确子目录：`inputs`、`package`、`host`、`control`、`runs`、`evidence`。
`inputs`仅准确开发ZIP/锁/registry副本及最终执行pin；`package`仅该ZIP的784项。
`host`只从锁定Electron ZIP提取离线测试宿主，不修改package；`control`是本包四固定脚本及其准确SHA的不可变执行副本。
`runs`只接受32位hex request-id，新建隔离workspace、LOCALAPPDATA、TEMP和证据；恢复必须绑定已核对的原run，不能自动重放。
`evidence`只保存本批身份、请求、原始脱敏结果、日志/SQLite快照/截图和后飞行；不进入package。

Administrator既有SSH仅负责创建/传输/校验/调度/回收这些准确输入；产品执行在SID1005真实桌面。
沿用用户父目录已有继承权限，不修改owner/ACL/UAC/账户/Bitvise/服务/许可证，不安装软件。
每层检查Reparse/路径边界及ACL读写事实；未知、权限不足或主机密钥变化即停，不转管理员执行。
首次至少2GiB余量、每请求至少1GiB；新根累计最多1GiB。达到阈值停止，不自动删除旧材料或测试数据。
Windows PowerShell5.1解析和必要.NET捕获API实测门失败时不执行；脚本UTF-8无BOM/LF，含中文fixture按字节/EncodedCommand处理。

## 4. 生命周期和调度合同

- 三层均实测SID1005/Session3/Medium/非提升/noJob：桌面监督器、controller、实际Electron/fixture入口。
- 监督器先持有controller Process句柄；controller先持有Electron及实际观测到的helper/root/marker child句柄，绑定PID/creation/parent。
  使用已有D-017令牌/Job查询、Toolhelp只读身份与.NET Process；不增加产品API或请求脱离Job。
- 持有句柄后查询真实退出码；不能用进程消失、完成JSON、PID相等或after-the-fact进程列表替代。
  收尾必须覆盖实际树。release允许准确已移交root/child暂时存活，持续持有句柄证明最终自然退出/退出码，不写成零残留。
- 默认最多2小时/16个请求，固定8组phase；request strict schema，绑定准确source/package/manifest/lock/script SHA、request-id和phase。
  不接受任意命令、脚本路径、PID、Shell/env覆盖；所有输出先做已知秘密/过量保护并CreateNew保存。
- 仅已证明该请求树结束的普通夹具失败可回WAITING，保留首失败；身份/完整性/审计/安全/生命周期未知立即HALTED。
  到限/停止请求拒绝新派发，监督器等待controller真实退出并记录最终证据；不复活旧HALTED/到期控制器。
- 实现后先做本地Node语法/请求正负检查、实际PS5.1只读解析、full package hash与负向完整性检查。
  脚本、执行pin和白名单的最终SHA形成候选外不可变清单；只有全部前置通过才在本批准准确范围传输/启动。
  任一变化超出本包路径/phase/包身份/安全合同需另报具体差异；不得靠扩大请求字段修复失败。
- 初次真实桌面入口可用已授权Computer Use在A9 Builder中执行；无法可靠输入时只需用户运行一条固定命令。
  之后SSH调度和取证。退出原生对话只在绑定产品窗口选择本phase规定按钮；没有可靠自动化则保留必要GUI操作，不能mock对话替代实机交互。

## 5. 必跑phase与证据矩阵

| phase | 场景与断言 | 类型 |
|---|---|---|
| Boot | 实际Electron/Node/ABI/SQLite/native加载，784文件闭包、真实可见窗口、Renderer隔离、焦点与滚动 | DIRECT |
| Shell | S01–S03双源tick每2秒且退出前可见、流内/跨流顺序、真实exit/truncation/cleanup、先SQLite落盘再IPC/UI；输出不提升verified | DIRECT |
| EncodingSecurity | S04–S05 UTF8/CP936/UTF16LE字节跨块、CRLF/无换行、大输出、秘密切分及各输出出口扫描、Stop/慢消费者 | DIRECT |
| Background | 三可用/第四拒绝、ready失败、错属/未知句柄、重复/过期/未来/错属游标、双Stop、活动期间切换限制、Policy/高影响确认 | DIRECT |
| FailureBoundaries | 错requestId/序号/Base64/字节计数/早于started/缺终态、必需审计失败；结构化失败与零后续派发，按注入位置区分真实native与受控协议负例 | DIRECT_FAULT_INJECTION |
| StopExit | 后台root/child真实启动身份、正常关闭选择停止、真实取消/终态/进程树退出、持久化结束事实 | DIRECT |
| ReleaseExit | 正常关闭选择留给系统、release意图先落盘/真实回执、helper退出和准确root/child存活/最终自然exit；回执丢失/取消竞态如实失败 | DIRECT |
| Recovery | S06刷新/分页/返回/重启事件一次；后台facts-only/PID身份漂移/不接管，隔离崩溃后不造终态、不自动Provider/tool请求 | DIRECT |

PID重用/协议/审计负例必须注明受控注入位置及真实入口，不把fixture造出的协议帧当原生自行产生。
设计内的拒绝/故障反例只有原错误保留、零后续产品派发和真实受影响树已结束时，才能记对应验证CASE_PASS；
这不把原审计/协议错误改为成功，不在已失败的产品实例继续派发。负例若无法证明边界则HALTED，
其余场景只可在准确新隔离请求中执行；控制器自身身份/完整性/审计/安全失败没有反例豁免。
每组保存原始响应后断言；秘密场景只保存安全原始外层记录，不把测试秘密泄露到证据文件。
所有未受影响项只可按任务增量合同/精确哈希提出INHERITED_EVIDENCE；不把旧报告改绑到本包。
安全或未知生命周期不得被普通重试机制掩盖。任何未执行项统一NOT_PERFORMED。

## 6. 申请的一次具体范围和后续边界

本包申请负责人批准ADR-0159及任务C14四路径补充、以上固定包/目标/phase、新根创建与准确输入传输/普通桌面运行/回收。
该批准按本合同覆盖四路径内实现、定向修复与验证、最终hash冻结及通过前置后的本批16请求以内执行；
不包含产品源码/文档新增提交、推送、合并、发布、原生重编、新账户/ACL或任何Win7动作。
四路径以外实现、改变包字节/目标身份/phase安全边界、HALTED后的新合同仍单独具体裁决。
本轮由主代理完成，不默认另启独立代理；最终独立收口复核另行明确授权，不由实现方自签。
本包批准前四个脚本、远端创建/传输/产品运行均NOT_PERFORMED。


## 7. 负责人具体批准登记

负责人对本包§1–6及ADR-0159回复“批准”；登记时间 `2026-10-03T07:43:00.417318+00:00`。
批准四个准确路径内实施、检查和最终哈希冻结，以及准确新根/输入/8phase/2小时16请求范围内的普通桌面运行与取证。
本节是实际批准登记，前文待批描述保留为历史；ADR-0159现为Accepted。
不包含提交、推送、整合、发布、原生重编、账户/ACL改变或Win7动作。

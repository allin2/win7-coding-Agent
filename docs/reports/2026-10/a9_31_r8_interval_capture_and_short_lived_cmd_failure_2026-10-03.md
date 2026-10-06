# A9-31 R8：区间捕获修复与普通 Boot 查询缺口

日期：2026-10-03。分支 `codex/a9-31-background-tools`，产品 source `35a19250ed6589f6a7ba35b940a784325970c111`。R8 普通桌面 Boot 未通过，生命周期门 HALTED；A9-31 保持 IMPLEMENTATION_IN_PROGRESS，独立收口及 Win7 NOT_PERFORMED。

## 1. 批准、构建和定向检查

负责人回复“批准”，批准 [R8 §2–4](../../plans/A9_31_PRODUCT_R1_R8_SNAPSHOT_INTERVAL_APPROVAL.md)及 ADR-0166。原合同 SHA `744236b70e84c0ad795624e51e453b8ef347641ed073fabfdea77b5f552e83ec`；批准 JSON SHA `51a1b77635b3d354b7e6536c9ecc74e2b26731a140cc5849ae2bd5d71a29c4d8`。仅五精确外部测试源、新准确 R8 根和有限普通窗口；产品/native/锁不变。

锁定系统 csc/三参考及签名一致。compile `1930cd8c18fb4c578416ba81488dc2a1` 成功，真实编译 PID66868/creation639266368401690335/exit0。source SHA `97154a59490a542b17415e3e1d1a5bde2f1ab941871dbca5a376d4f21c59e1c2`，17664 bytes；DLL SHA `9de64e7daaa1ab3a960ee27439cf5ede8ba3146b6b1eae526f85aa49e67094b7`，18944 bytes；MVID `fcfd9126-82c9-4ffc-818d-4546f7770a47`；原始 build SHA `4366a62069ceeb1eae80b4dd47058f5dac3f3a9b2cc95a7d6d0c0a0e18d1ec61`。Administrator/Session0 准备检查不作为普通产品证据。

下列记录位于 `.acceptance/a9-31-developer/product-r1/`，准确文件名、尺寸和 hash 见 `r8-freeze.json` 及冻结 `checks.json`：

| 检查 | 记录 | 结果 |
| --- | --- | --- |
| 查询/API、合法 exit259、退出后原句柄、UNKNOWN | `r8-query-api-r2-*.json` | 27 PASS |
| 快照区间、双观察、真实并发出生与受控负例 | `r8-interval-r2-*.json` | 19 PASS |
| 准入 schema | `r8-schema-r2-*.json` | 275 PASS |
| 源/DLL/build/旧批准/hash/reparse/MVID | `r8-file-gates-*.json` | 16 PASS |
| 实际旧入口/claim/实例绑定与并发原子竞争 | `r8-entry-gates-*.json` | 22 PASS |
| 准确三份 PS | `r8-final-parse-*.json` | 实际 PS5.1 三解析 PASS |
| Node20 语法/73 自检/19 Renderer 表达式/784 文件 | `r8-local-check-records.json` | PASS |
| ASAR 物理文件八负例 | `r8-physical-negative-inheritance.json` | INHERITED_EVIDENCE |

真实区间正例 PID115296 创建 ticks639266374573213630，第一 Toolhelp 开始639266374573213595、成功返回639266374573273607；第二开始639266374573333596、返回639266374573393619。同 PID、父6232、creation、Session0、native 映像由两只真实查询句柄一致证明，原对象保留。仅为直接 API 证据。

探针首失败全部保留：旧 DLL hash 引用；schema 夹具多余字段及旧 PS/library 绑定；外部关闭真实 SafeHandle 后期待二次关闭失败的错误夹具。最后一项存在数字句柄复用可能，不能宣称为产品关闭失败；修复为实际无效句柄 CloseHandle 错误6、明确标注的构造 Gap 派发拒绝及已关闭查询对象读取失败。正例、合成负例和真实 API 事实分开记录。尚未直接制造两个合法查询句柄间的 PID 复用、不同 creation/Session；不把有限测试数量扩大为全部负例合同 PASS。

ASAR 继承核对完整 driver 除 R8 输出根外与 R7 相同，两个完整函数及原始报告 hash 一致。三份固定 PS 和捕获字节冻结后没有修改。

## 2. 冻结、部署和真实桌面

master SHA `918a871b0b14d81cddef27090a00acb2a76f9d619141bfd954cd054081e60b22`；正常 revision `47d644a429e28f71e3ecaa0c8a2ff4dc8e3f43556a3d30d7d6f60ef51ddb281c`。27 新准确目标全部核 hash，实际 PS5.1 ParseFile、784 产品/73 宿主装配 PASS。

只在原 Boot 检查后加入受控普通断言的 driver revision 为 `b39cd796eabcbf3d73bbfe70457df35428a81ae4e96f4ca75df7a29979a5c57f`，8 新目标、检查、准确装配通过；PS/capture 安全门不变。正常本地 driver 字节已恢复。

Computer Use 实际在 A9 Builder CMD 输入执行 R8 入口，无需用户代输。dispatcher PID37244/creation639266379938146705；SID1005/Session3/Medium8192/Ordinary=true/Elevated=false/InJob=false。start/ready/claim 与同实例直接查询一致。两小时/16请求限制，本轮仅1个产品请求。

## 3. 首失败及回收

唯一 request/run `415b73bf23ba4648b0849e18e74c952b`，worker PID40620、Electron PID77368 均通过普通身份门。实际 Electron22.3.27、Node16.17.1、ABI110、SQLite3.43.1。七项 LOCKED_RUNTIME、VISIBLE_WINDOW、RENDERER_ISOLATION、INITIAL_MODE_BLOCKS_INPUT、WORKSPACE_MODE_ACTUAL_UI、INPUT_FOCUS、FULL_784_CLOSURE 直接通过。

worker 在 `2026-10-03T15:28:28.4071600Z` 观察 cmd.exe PID78328、父77368。Tbegin639266381083991590、Tcaptured639266381084041591、query639266381084071600，OpenQueryHandle 返回原生87 `LIFECYCLE_OPEN_QUERY_HANDLE`。实际 PID/creation/Session/映像/退出均 UNKNOWN，ownership UNKNOWN；schema2 保留首失败。尚未取得真实查询句柄，第二次 snapshot 不能补造这个原对象。

受控普通断言也确实执行并失败，但存在更早生命周期缺口，不能归类为可重试的纯普通失败。worker 写 abort/HALTED，driver 因 LIFECYCLE_CAPTURE_FAILED 失败，dispatcher 按 SAFETY_WORKER_HARD_GATE 停止。worker 持有6个、dispatcher 持有7个实际实例均观察结束并保留退出码；worker exit1、Electron exit0 不覆盖未绑定 cmd 的 UNKNOWN。当前准确 R8 命令行进程快照为空，只是当前事实；顶层 dispatcher 实际退出码没有跨动作持有证据，仍 UNKNOWN。

55 原始文件/6259483 bytes 全部回收并核 hash；合成秘密原文/Base64/UTF-16LE 扫描0命中。原始数据库、日志、截图、abort、请求、身份、终态保存在 `controller-r8-boot-first-failure/`。索引 `r8-boot-first-failure-return.json`，inventory SHA `3e1543beb533a72399696d50cb7c67ea1a585212ccc188cb7503039e826eb466`。

| 原始终态 | SHA-256 |
| --- | --- |
| dispatcher-final | `2b838c97ce5e2245188f8df8e54558a4d8a50f4a86d947ce8d3567ebc351e007` |
| worker controller-final | `5bd9e8e15e0a5686b12657bc6b2d5b533ee695b5434e65b35744face1a05778b` |
| driver-final | `2a0695e65c3e4aa20765bf6bd2a048a2e6c0997a95264623404dcfb8705e7b21` |

## 4. 来源分析和边界

`src/runner/src/shell-detection.ts:116` 及锁定包 `resources/app/runner/dist/shell-detection.js:104` 存在系统 cmd `/d /c ver` 同步可用性探测。父 Electron/exe cmd.exe 与之相符，仅支持短命同步探测的推断；本轮未记录该次 spawnSync pid/status/参数，不能直接把 PID78328 认定为此调用或证明其退出。

纯轮询不能在子进程结束且无法 OpenProcess 后补造原句柄。后续需新具体合同，在锁定调用源记录实际 spawnSync pid/status/error/调用区间，只对准确只读探测定义新证明合同；有副作用、managed、异步工具仍保留实际查询句柄及 Job/Stop/release 门。缺失、错属、重复/PID复用或不匹配回执仍 UNKNOWN。旧 R8 UNKNOWN 不改判。

R8 §4 要求“任一身份/安全/完整性/审计/生命周期未知仍HALTED，不能恢复旧窗口”。正常 Boot、同窗口失败后成功、后续七 phase、release 丢回执/取消竞态、独立收口、Win7 均 NOT_PERFORMED。更强第二句柄错 creation/Session 直接对照、未查询字段 UNKNOWN 序列化也待后续完善。R8 不恢复、不热改、不删除；无提交、推送、合并、产品/native/锁或系统配置改变、委派、Win7 操作。

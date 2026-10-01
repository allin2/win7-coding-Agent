# A9-30 开发机收口交接包（2026-10-01）

```text
Status: LOCAL_HANDOFF_READY / NOT_APPROVED_FOR_NATIVE_BUILD
Task: A9-30 / APPROVED_FOR_IMPLEMENTATION
Branch: codex/a9-30-shell-streaming
HEAD: c14a96808d048c34f6079cc378ba12b4f60f5c62
Source Commit: NOT_COMMITTED
Formal Kit ZIP / Manifest / Input Lock: NOT_LOCKED
Independent Reviewer: NOT_ASSIGNED
D-017 Build Host / User / Write Targets: UNKNOWN
Overall: DEVELOPER_GATE_NOT_SIGNED
```

本包供负责人审阅准确源码并指定独立复核人与构建机。已有授权的本地实现、测试和材料已完成；
不以本地合成 PE、协议夹具或 Node DOM 检查替代真实 Win32 / Electron。
实现方不能自签独立复核。未提交、推送、合并、分配 WIN7-43、访问或写入构建机。

## 1. 审阅材料和准确范围

- [收口准备报告及需求证据矩阵](../reports/2026-10/a9_30_closeout_readiness_2026-10-01.md)。
- [任务书 §3–5](../tasks/A9_30_SHELL_STREAMING.md)、[helper v3 合同](A9_HELPER_V3_STREAMING_PROTOCOL.md)、[模拟交互 Demo](a9-30-shell-streaming-demo/index.html)。
- 工作树 `.acceptance/a9-30-developer/closeout/source-review.patch`：对 HEAD 的全部源码/文档差异及新增文件。
- 同目录 `source-review-manifest.json`：实现与治理文件的逐文件尺寸/SHA-256；`source-review-paths.txt`：拟审阅/提交的精确路径。
- `whitelist.json`：分支、基线和全部 44 个实现/测试/模板文件均位于任务 §3 白名单。
- `prior-source-inheritance.json`：原 29 个实现文件中 28 个字节未变；Runner 脱敏头部字符串构造调整后重跑验证。

源码提交范围包括 A9-30 链路、v26 套件模板/校验/生产者、相关定向测试及本任务治理材料。
已有第二批设计、覆盖台账和 A9-31/A9-32 草稿为索引依赖保留原文，不含其实现，不提升其状态。
正式锁、kit 源码快照及批准项尚不存在；SOURCE_COMMIT/时间保持 NOT_LOCKED，批准登记为空。
不要暂存派生 dist、node_modules、.acceptance、主工作区修改或其他路径。

## 2. 依赖、API 和失败边界

产品 D-013 v26 使用协议 v3 / a9-trusted-shell-current-user-v2，旧 v1/v2 回归保留。
许可证 Apache-2.0，原生 API 和风险已登记于 WIN7_CONSTRAINTS §10。无新第三方产品依赖。
构建限定 D-017：Windows 10 x64、VS2019 16.11、MSVC 14.29/v142、SDK 19041、x64、静态 /MT，
/Brepro /INCREMENTAL:NO 和固定路径映射。Windows PowerShell 5.1 Desktop / .NET 的捕获探针仅运行于构建机，
不进入产品、Win7 运行时、SBOM 或发布依赖；禁止下载/安装/调整策略。

prepare 从指定完整 Git SHA 提取 13 个原生文件，核对工作区字节及提交时间；未提交变更、缺失/额外文件、
符号链接、Profile 或 smoke 合同错配均在写新锁前拒绝。package 核对完整文件集合及每个 SHA/尺寸，拒绝覆盖。
技术 READY_FOR_WIN10_BUILD 与 PACKAGE_READY_NOT_APPROVED 均不是批准。

返回包必须含同一批准套件、完整原始证据、不同 ZIP/run-id、相同 helper 和实际工具身份。
记录器检查真实 PE 字节（AMD64、Win7 subsystem/manifest、API imports、静态 CRT）、原始 v3 帧及时序/字节计数。
诊断包/未批准或脏登记/源或哈希漂移/失败 smoke/身份复用/额外证据/不同 helper 均不能形成正式输入锁。
批准返回复核须另登记 return_review：独立复核人不同于实现人、报告 SHA、复核时间及两组 run_id/返回 ZIP SHA；
记录器和打包生产者都校验该绑定。工具只能验证登记，不证明登记内容的真实性。
背压导致终态缺失时允许记录有界失败，但清理保持 UNKNOWN；仍需独立复核及实际进程探测，不能称清理 PASS。

## 3. 分步授权与执行

1. 负责人审阅上述准确差异，批准追加源码提交；只按 source-review-paths.txt 暂存，提交后取得完整 source SHA 和 %cI。
   源码提交本身不批准构建机写入或 native 构建，不推送/合并。
2. 使用该提交建立只用于检查/kit 绑定的干净 checkout；按 [套件 README](../../native/helper/build-win10-kit-v26/README_BUILD.md)
   填写 SOURCE_COMMIT/时间、生成快照/锁/manifest、封装到新的候选外绝对路径，计算三项哈希。此时仍未批准。
3. 负责人指定独立复核人及 D-017 主机/普通用户。先只读预检 OS/VS/MSVC/SDK/工具路径与 SHA、权限、Job 条件、
   离线文件和中文/空格路径；UNKNOWN 或不满足停止构建，不安装、不调整权限。复核设计/安全/API/套件三项哈希。
4. 获批后追加 kit/批准登记提交，HEAD 必须包含准确登记字节；负责人另批准两个全新目录和执行动作。
   同一 kit 在两个全新目录各执行一次，保留不同 run-id，logic/capture/v1/v2/v3、PE/API/CRT 和返回包。
   失败证据保留，不重用失败目录/包，任何失败停止下游锁定/装配。
5. 独立复核两份原始返回及 helper 字节一致性。获授权后追加精确 return_review 登记提交，
   再用记录器生成新的 a9-v26-input-lock.json；旧 W42/v25 输入逐字节继承，不改旧锁。
6. 使用新锁及现有生产者参数生成 A9-30 开发检查包。只用 A9-30-DEVELOPER 标识，
   不含候选 authority、旧验证驱动或历史验收 PASS；源/锁/登记漂移拒绝，不回退 v25。
7. 在实际 Windows Electron 22.3.27 / Node 16.17.1 / ABI 110 完成矩阵与受影响交互。
   独立复核、原生重锁、打包与真实 Electron 均满足合同后，由负责人裁决 DEVELOPER_VERIFIED。

## 4. 实际 Electron 执行清单

所有证据写候选外的新运行目录；绑定 source/lock/helper/ZIP/manifest SHA、run-id、OS、运行时及用户。
使用独立临时数据/工作区和合成秘密，不接触真实凭据或既有会话；实际命令、落盘事件、IPC 和 DOM 对齐。

| 场景 | 必须核对的事实 |
|---|---|
| S01/S02 | 每两秒 tick；首条在进程退出前活动卡可见；事件先在 SQLite 可读再发布；stdout/stderr 按 helper 观测序及流内字节序 |
| S03 | 真实 exitCode、verified 不被 chunk 提升；大输出失败仍撤销旧 verified；截断/清理事实与 native 终态及 PID 探测一致 |
| S04 | 三种编码按各字节边界、CR/LF、无换行、大输出；合成秘密在已知值/凭据/私钥/编码变体中跨块；日志/DB/IPC/DOM 零秘密 |
| S05 | Stop、队列背压和慢消费者；取消不等输出排空；有界终止并核对进程树；缺失终态保留 UNKNOWN，不能伪造成功 |
| S06 | 刷新、分页、视图返回、关闭重启逐事件一次；终态不重复文本；旧进程只记事实，不虚构接管或重放 |
| 负例 | 错 requestId/重复缺号/非法 Base64/错计数/启动前输出/缺终态/落盘失败；结构化失败并阻断后续派发，首轮证据保留 |
| 交互 | 自动滚动与手动回看、焦点不抢夺、Stop 反馈、退出选择、窗口返回及恢复 |

目前上述真实 Electron/Win32 执行全部 NOT_PERFORMED。Win7 本任务仍 NOT_PERFORMED；
A9-31/A9-32、新候选门 A/B、完整 Alpha 2 和 RC 不在本次裁决范围。

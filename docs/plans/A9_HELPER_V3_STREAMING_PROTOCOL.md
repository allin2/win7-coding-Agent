# A9 helper v3 — 运行中输出协议设计

```text
Status: APPROVED_FOR_A9_30 / A9_31_RELEASE_DRAFT
Design Baseline: c14a96808d048c34f6079cc378ba12b4f60f5c62
Implementation Authorization: A9-30 only (subject to task branch and exact allowlist)
Decision: ADR-0150 (Accepted) / ADR-0151 (Proposed)
Target Runtime: Windows 7 SP1 x64 / Electron 22.3.27 / Node 16.17.1
```

本设计由 2026-09-30「实施第二批推进计划」指令授权起草。2026-10-01 负责人批准 A9-30 和 ADR-0150，
本设计的 Shell 实时输出合同作为 A9-30 实现依据；A9-31 release 扩展仍是草稿。
批准不代替原生构建、提交推送或实机执行授权，也不构成独立安全/依赖复核完成证据。
实现合同分别见 [A9-30](../tasks/A9_30_SHELL_STREAMING.md)、[A9-31](../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)。
验收来源为 [A9-16 S01–S06](../tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md#3-shell-运行中输出)。

## 1. 当前事实与范围

- `native/helper/helper.cpp` 运行中排空 stdout/stderr，但现有协议只发 execution_started 和最后整块 execution_result。
- `src/runner/src/native-transport.ts` 接受 v1/v2，最终响应以前无输出回调，且累计保存协议 stdout；v3 改为有界待解析帧，不累计整个协议历史。
- `src/runner/src/trusted-shell-runner.ts` 当前结束后解码和脱敏；`BoundedLogCapture` 也是结束后写日志。
- A9 事件表可存新事件类型和版本化 payload；优先复用 schema v4，不新增表、不改变旧表或伪造迁移。
- 背景进程已有管理器与状态事实，但不是当前完整模型工具面；`KILL_ON_JOB_CLOSE` 使现有 dispose(false) 不足以证明 Win7 进程成功留给系统。

仅前台/托管 Shell 输出；不开放交互 stdin、PTY、token streaming、并行 Agent 或后台常驻 Agent。
v1/v2 源码兼容分支、历史 build kit、工件锁、候选和证据保持原身份。新 helper 工件称 D-013 v26，
协议版本为 3，Profile 为 `a9-trusted-shell-current-user-v2`，不能与 v25/协议 v2 混称。

## 2. 请求与消息格式

UTF-8 无 BOM JSON Lines，LF 结束；一 helper 一 requestId。协议 stdout 只放 JSON，stderr 只放限长脱敏诊断。
requestId、Profile、版本必须与批准请求一致，严格拒绝额外字段、非安全整数、非规范 Base64 和长度不符。

v3 请求继承 v2 的 executable/argv、Shell 身份、command/cwd、净化 envOverlay、managed、deadlineMode 与
条件存在的 timeoutMs/idleTimeoutMs、maxStdoutBytes/maxStderrBytes；替换 schemaVersion=3/Profile，
新增 `outputEncoding: {stdout, stderr}`，每项只能 utf-8/cp936/utf-16le；编码由产品可信配置生成，模型不能传入。
无固定 deadline 的合同继续适用。Agent 子进程 stdin 为 NUL；helper stdin 仅接受同 requestId 的控制消息。

| 消息 | 字段与约束 |
|---|---|
| execution_started | schemaVersion/type/requestId/profileId + v2 helperPid/childPid/ready/tokenAudit；保持启动前 Job、Current User 和 capture proof；只有一条 |
| output_chunk | schemaVersion/type/requestId/profileId，seq 从 1 连续递增，stream=stdout或stderr，streamOffset，byteLength，dataBase64；offset 为该流已发送原字节数 |
| output_truncated | schemaVersion/type/requestId/profileId，stream、reason=byte_limit或event_limit；每流首次触限一条，不消耗 output seq |
| execution_result | schemaVersion/type/requestId/profileId，沿用 v2 status/exitCode/duration、取消/超时、Job/token/cleanup 证明；新增 lastOutputSeq、每流 rawBytesRead/emittedBytes/omittedBytes；outputTruncated 与计数一致；不再重复整块 Base64 |
| error | schemaVersion/type/requestId/error/message；只有启动前可作为唯一终态；启动后错误仍需收尾证明，否则 cleanup unknown |
| cancel（控制） | schemaVersion=3/type=cancel/requestId；幂等，只控制本次执行 |

消息的 exact-key schema 以以上字段及继承的 v2 同名 proof 为准，字段命名 executionTimeMs 保持现有实现，
不得用文中 duration 的说明文字创建第二个同义字段。`status` 继续 completed，是否成功由真实退出码及结构化终态决定。
rawBytesRead=emittedBytes+omittedBytes。空输出 seq=0；输出截断后继续计 rawBytesRead，offset 不再推进。
顺序是 started → chunk/truncated → result → helper 正常关闭；不得在 result 后输出，缺少终态不能成功。
跨流序号只证明 helper 观测顺序，不宣称还原操作系统两管道的原始写入时序。

### 2.1 后台释放扩展（仅 A9-31）

A9-30 不启用 release。A9-31 才增加同 requestId 的 `release` 控制与 `execution_released` 终态。
release 仅 managed=true，绑定用户退出选择、所属工作区/对话/句柄及一次性 releaseId；该身份在产品侧批准和审计，
helper 只消费已校验的 requestId/releaseId。终态携带版本/身份、releaseId、childPid、lastOutputSeq、每流计数、
`jobKillOnCloseDisabled=true`、`ownershipReleased=true`；不是 execution_result、不是 cleanupConfirmed。
native 先停止新输出、保持排空，再修改本次 Job 的 KILL_ON_JOB_CLOSE 位并回读，保留其他限制，
关闭本 helper 的捕获管道和 Job 句柄、返回释放证明后退出；闭管道可能让依赖 stdout 的子进程退出，故存活必须实测。
取消和释放由原生单一状态机串行裁决：cancel 已接受则拒绝 release；已释放则禁止再报告清理成功。
交接请求先持久化，回执丢失记 release_unknown，不静默改成成功，不按未知 PID 自动杀进程。
普通崩溃/未请求 release 的管道 EOF 保持 Job 回收；不能全局关闭 KILL_ON_JOB_CLOSE。
A9-31 新原生字节必须再次双构建、重锁，最终候选选取该任务最新批准的 v26 revision。

## 3. 帧、队列、上限与取消

| 层级 | 固定边界 |
|---|---|
| native chunk | 原始字节最多 16 KiB；每流在满块或 100 ms 时 flush，已有 tick 不等待换行 |
| protocol frame | UTF-8 JSON（不含 LF）最多 32 KiB；超限直接协议失败 |
| native 输出队列 | 全部序列化帧总计最多 256 KiB，唯一 writer 按序写；不在 monitor/drain 线程同步等待 stdout 写入 |
| transport 待帧 | 每帧 32 KiB，待处理输出总计 256 KiB；只持有当前缓冲，不保留终身协议字节 |
| 每流输出 | 沿用 1 MiB 默认，调用者只能在现有批准上限内收紧；最多 4,096 output chunk，先触任一边界就显式截断 |
| Runner 安全待定区 | 每流最多 64 KiB，另持有解码器最多一个未完成字符；未知不计为无秘密 |
| 日志/UI | 每流脱敏日志最多 1 MiB；工具卡沿用 8 KiB 预览，明示截断；现有 Renderer 集合上限保持 |

monitor 继续轮询两流并处理取消；writer 在独立线程同步 WriteFile 到继承的协议 stdout，monitor 不参与该阻塞调用。
Proposed API 清单为 CreateThread/WaitForSingleObject、CreateEventW/SetEvent、CancelSynchronousIo 和现有 Job API；
使用前按 WIN7_CONSTRAINTS §6 登记线程/句柄继承边界，不引入 named pipe、网络监听、ConPTY 或第三方库。
[Microsoft CancelSynchronousIo 合同](https://learn.microsoft.com/en-us/windows/win32/api/ioapiset/nf-ioapiset-cancelsynchronousio)
声明最低客户端 Windows Vista，且取消调用不等待完成；必须检查 writer 实际完成状态，不能把取消请求当成已回收。
收尾最多等待 writer 5 s，超限后取消该线程的同步 I/O 并核对完成；返回 ERROR_NOT_FOUND 也不证明子进程已清理。
writer 不能终止或终态不能完整交付时，由 transport 记协议失败/cleanup unknown，不使用 TerminateThread。
消费者慢到队列满：返回 `A9_OUTPUT_BACKPRESSURE`、请求取消、继续排空并收集清理证明，不能静默丢帧或失联挂起。
已有取消收尾超时/升级机制继承；启动 15 s、取消请求后的收尾边界与 ordinary command deadline 分开。
protocol 失序、解析或回调持久化失败同样进入受控取消；直接 kill helper 只能标 cleanup unknown，不能写已回收。
每流触输出/事件上限只停止该流发布并继续 drain，不因普通输出过大强杀命令。

## 4. 解码、跨块脱敏和最终结果

产品为 PowerShell 生成 UTF-8 Profile，CMD 默认 CP936；UTF-16LE 仅用于显式设置及对应验收夹具。
单次运行每流编码在启动前固定，增量 fatal 解码；UTF-16LE BOM 若存在只在开头消耗，保留跨块 CR/LF。
不能对已经发布的 UTF-8 前缀随后改为 CP936。显式编码冲突、非法序列或末尾半字符记
`A9_OUTPUT_ENCODING_ERROR`，停止该流文本投影、输出计数和诊断；其他清理照常，结果有 warning，不伪造正常文本。
原始子进程字节只存在于 bounded 内存/本地进程间传输，不写明文临时文件或调试 stdout。

采用每流有状态安全发布器，替代简单的每 chunk 调用 redactText：

1. 执行开始冻结当前敏感值及 UTF-8/UTF-16LE、Base64/Base64URL、百分号编码变体集合；已知敏感变体超过
   64 KiB 时在派发前拒绝此输出 Profile，留限长原因，不暴露原值。凭据变化不得悄悄改变运行中发布规则。
2. 用匹配器保留可能构成任一敏感变体或规则前缀的后缀；百分号匹配保留未完成转义，不能按固定小尾巴猜测安全。
3. Authorization/Bearer、凭据赋值、查询参数及 URL userinfo 等现有正则语义改为跨块状态机；键/分隔符候选保留，
   进入敏感值后立即输出替代标记并持续屏蔽直到相应分隔符。无分隔符长值保持屏蔽，不累计无限内容。
4. 只有确定不属于敏感前缀/值的文本可以发布；64 KiB 未决边界耗尽时屏蔽未决段并记 `redaction_boundary`，
   不能把尾部强行 flush 为原文。正常 EOF/取消/截断也要按同一安全规则 finalize。
5. 发出文本后再次应用产品已有 redactText 作为防线；日志、最终 stdout/stderr 和 UI 都只消费同一个安全投影。
   脱敏会改变文字长度，原始字节计数仍只来自 native。错误消息、Shell 命令及 URL 也保持现有脱敏。

安全投影的 outputSeq 单独连续递增，不要求逐帧对应 native seq；带 sourceSeqThrough 标记来源水位。
最终 TrustedShellResult schemaVersion 保持 2.0，增加可选 outputProtocolVersion=3 和 outputSummary，
原 stdout/stderr 由安全投影有界累计得到；不重复发到活动卡。验证仍读取完整结构化退出结果，chunk 不证明测试通过。

## 5. Core、持久化和 Renderer

Runner/adapter 增加可等待的 `onOutput(chunk)` 端口（stream、outputSeq、sourceSeqThrough、text、rawBytesRead、
truncated），异常不是可忽略 UI callback。Core 扩展 `tool_output` 事件，data.schemaVersion=1，绑定
conversationId/taskId/turnId/toolCallId/requestId；终态携带最后水位及丢弃计数。
既有 `recordToolEvent` 写入必须成功再向 IPC 发布；背景事件即使原 Turn 结束仍归属原启动身份。
不把全部输出片段逐条追加进 Provider 历史，模型继续获取有界最终工具结果/显式后台轮询结果。

现有 SQLite a9_events 承载版本化 payload，不改表 schema。安全输出与 native 帧无原始秘密数据持久化。
稳定去重键为 turnId/toolCallId/outputSeq，持久化后以 eventId 为查询游标；Runtime 唯一 writer 禁止同键二次插入，
重启不继续接收旧 helper 的输出。Renderer 增量、历史分页与刷新按同键合并，不按文本去重。
outputSeq 缺口且事件仍在可查询范围内时先补查；缺失/保留期淘汰标为明确截断，不能凭空补输出。
活动卡最多 8 KiB，始终保留退出/Stop/截断状态；跳到其他允许视图不丢卡状态，不跟随新输出强抢用户滚动。
文本仅 textContent；刷新只恢复已持久化事实。应用重启把活动执行标 interrupted，不标 running，不重放命令。

## 6. D-013/D-017 待登记 Profile 与构建闭包

这是待批准的依赖登记提案，不覆盖 [WIN7_CONSTRAINTS](../WIN7_CONSTRAINTS.md) 现有 Accepted Profile。

- 来源：本仓库 C++，Apache-2.0；D-013 v26 新独立目录与 revision；新增 API 使用清单及 Win7 import 最低系统审核。
- 构建：D-017 Win10 x64、VS2019/MSVC v142、SDK 10.0.19041.0、静态 CRT；记录实际补丁和工具 SHA-256。
  延续已有确定性源码/对象相对路径策略，两次全新目录、独立 run-id/返回包，helper 字节一致。
- 前置：审批前绑定确切干净 source commit、build kit/manifest/输入哈希、离线闭包、许可证与 SBOM。
  哈希尚未知必须写 NOT_LOCKED，禁止占位全零或借用 v25；源码提交需另行授权。
- 原生门：logic/capture/v1/v2 回归、v3 tick/超限/取消/背压/编码、PE AMD64/API/CRT、非提升用户/Job proof。
  A9-31 release 扩展另补释放/崩溃/退出后存活矩阵并重新重锁。
- 降级：缺 v3 或错误 Profile/哈希时，结构化拒绝本能力；不切到直接 spawn/v25 假装实时输出通过。
- 产品：新 v26 input lock 绑定两份独立返回证据；新候选 manifest 声明实际 helper/Profile/能力和前置。
  候选外 authority/pin 与产品 source commit 独立，历史文件不重绑。

## 7. 审阅与验收矩阵

| ID | 正向 | 负向/失败要求 |
|---|---|---|
| S01/S02 | 每 2 s tick，首条在 tool_end 前可见，双流顺序及退出码真实 | 等退出后补动画、重号/乱序均拒绝 |
| S03 | 真 native/Runner→Core→SQLite→IPC→卡片时序 | 绕过持久化或仅改 Renderer 不算完成 |
| S04 | 中文 UTF-8/CP936/UTF-16LE 每个字节边界、CR/LF、无换行 | 半字符/混合不匹配明确错误，不切换已发编码 |
| S05 | 每个秘密切分点、赋值/Bearer/URL/编码变体、无界长 token、超输出/背压/Stop | 检查请求、日志、SQLite、IPC、DOM 零真实秘密；慢 consumer 不阻取消 |
| S06 | 刷新、视图返回、分页、重启各事件一次 | 缺口有提示、旧进程不被虚构为已恢复 |
| P01 | started/chunk/result 合法完整 | 错 requestId/Profile/版本、extra key、Base64/长度、pre-start、post-result、EOF 无终态均失败 |
| P02 | 输出落盘后发布 | 必需审计失败停止后续派发；已有副作用和残留事实保留 |

新用例有移除输出/脱敏/序号/审计条件的负向对照，恢复后核对源哈希。开发机通过与 Win10 构建、Win7 当前候选证据分别记录。
界面审阅入口：[Shell 输出 Demo](a9-30-shell-streaming-demo/index.html)（模拟数据，不签发 S01–S06 或 Win7 PASS）。

## 8. A9-31 C2实施绑定（2026-10-03追加）

负责人已批准A9-31/ADR-0151及§2.1 release扩展源码实施；旧“仍草稿”记录保留历史时点。
managed新revision/工具/API及失败边界见WIN7_CONSTRAINTS§11追加和A9_31_IMPLEMENTATION_HANDOFF。
release终态精确字段为schemaVersion/type/requestId/profileId/releaseId/childPid/lastOutputSeq/stdout/stderr/
jobKillOnCloseDisabled/ownershipReleased。各counter为rawBytesRead/emittedBytes/omittedBytes，当前managed生命周期smoke不允许省略或额外帧字段。
软件ready必须完整token审计、管道就绪与Job绑定；来源身份仍由具体源码与批准套件固定。
当前实现不新增原生锁、候选或目标PASS，真实Windows的生命周期/编译/双构建/独立复核继续作为门。

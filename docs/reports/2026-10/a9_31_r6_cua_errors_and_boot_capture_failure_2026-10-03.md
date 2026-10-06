# A9-31 R6：桌面红字取证与 Boot 首失败

日期：2026-10-03（Asia/Shanghai）。分支 `codex/a9-31-background-tools`；产品 source `35a19250ed6589f6a7ba35b940a784325970c111`。本报告追加最新直接事实，保留历史等待启动及全部失败原文。

## 结论与边界

Computer Use 已进入 `WIN-2JQ66JE4HTQ` 的 A9 Builder 桌面，取得用户报告的红字。窗口实际执行旧 R5 命令，因既有 `dispatcher-final.json` 报 IOException；随后按已批准的 [R6 合同](../../plans/A9_31_PRODUCT_R1_R6_ENTRY_GUARD_APPROVAL.md)启动准确 R6，普通身份门通过。唯一 Boot request `42a85eb4c6644abe8f3f892d7f7a9239` 未通过，dispatcher 已 `HALTED`。

Boot 同时留下 Renderer 夹具语法失败及独立的短命 cmd 捕获失败。后续七 phase、同窗口重试、A9-31 独立收口及 Win7 均 `NOT_PERFORMED`；A9-31 保持 `IMPLEMENTATION_IN_PROGRESS`。没有修改冻结源、产品/native、输入锁、系统设置，未提交、重启旧控制器或派发下游。

## Computer Use 获取的旧命令错误

UU 初始停留在本机被控详情，返回设备页后进入准确 Win10 桌面成功。之前“服务器不可用”的观察保留为历史，不能继续用它判断当前桌面入口。

CMD 可见命令仍指向 `A9-A31-Product-R1-20261003-R5`，pin `54ffcf006e29b095b3566f455cb901b1d5c3773fa8bcb9b83a2612185719d8be`。可见错误为调用 Open 时文件 `R5\evidence\dispatcher-final.json` 已存在；`FullyQualifiedErrorId` 为 `IOException,launch-product-r1-desktop.ps1`。行号未在可见画面取得，不补写。

准确抄录和获取边界登记在 `.acceptance/a9-31-developer/product-r1/r6-cua-visible-old-command-error.json`；原图位于本轮 Computer Use 工具记录，未复制无关聊天内容。R5 final 原 SHA `39d6b4b13ae0f9f53a4497c7866d7d74c5e071119fdebd2c492568cd5c147967` 不变，没有删除标记或覆盖旧根。

Computer Use 聚焦当前 CMD、直接键入准确 R6 指令并确认可见全文后执行。`r6-cua-correct-entry-preflight-20261003T134008556635Z.stdout.bin` 与 `r6-cua-ordinary-ready-20261003T134116758517Z.stdout.bin` 证明新鲜入口、旧实例当前不存在，以及 R6 PID113716 / creation `639266316299998155` 实际 SID1005、Session3、Medium8192、Ordinary=true、Elevated=false、InJob=false。旧 R5 历史退出码仍 `UNKNOWN`。

## Boot 失败事实

R6 master `9c9812d130af5b982abbf2158c4b9162412a7024d337334aeaf9327fe44172cf`；driver revision `c2fb083daa39e790537211f777f46eda5d704ca92efafd8a7de7d896660ea666`。仅创建一个固定九字段 Boot request，未扩大执行范围。

driver 直接通过 LOCKED_RUNTIME、VISIBLE_WINDOW、RENDERER_ISOLATION、INITIAL_MODE_BLOCKS_INPUT 四项，随后报告：`Script failed to execute, this normally means an error was thrown. Check the renderer console for the error.`。`driver-final.json` 为 FAIL，不能用实际 exit0 代替场景通过。首失败截图仍显示待选择权限弹窗，native helper 未执行，Provider 请求为零。

只读提取冻结 driver 的权限选择表达式，解析得到 `SyntaxError: missing ) after argument list`：外层字符串消耗了内层选择器引号的转义，传给 Renderer 的 JavaScript 无效。准确冻结源码 SHA `5f53949b682e76f45758ad24613a92207e2d1c862798a197052b1b9d7d4a68fb`；复现仅编译表达式，未在 Renderer 执行或修改源。记录 `r6-boot-renderer-expression-diagnosis.json`。这证明夹具缺陷，不证明产品权限流程本身失败；目前没有额外 Renderer console 原文。

另在 `2026-10-03T13:43:07.0255153Z` 观察 cmd.exe PID48664、父 Electron84472，取得 Handle/Creation 时该进程已退出。dispatcher 报 `LIFECYCLE_OBSERVED_CHILD_NOT_PINNED:48664` 并硬停止；该 cmd 的 creation_ticks、exit_code、native_error_code 均 `UNKNOWN`。

七个已持有进程实例实际结束，exit0，`held_tree_ended=true` 仅覆盖已持有树。worker 的 `FIXTURE_FAILED_TREE_CONFIRMED` 只覆盖它自己的持有树；不能覆盖 dispatcher 的未持有 cmd，也不能提升为全部生命周期或清理 PASS。dispatcher final SHA `be3cdb5b14cfd724a6fbacc69987f4ab55212f8f2a60304ee41fde9f2170efd5`，优先保留其 HALTED/未决事实。

静态调用链中，`a9-agent-runtime.js` 的 snapshot 自动 Shell 选择可调用 `selectShell`，`src/runner/src/shell-detection.ts` 会同步探测 PowerShell 及 `cmd.exe /d /c ver`。这与当前 cmd 的父进程和时间相符，是来源线索；现有记录未绑定该 PID 的命令行或 spawn 返回实例，不将静态推断写成直接事实。当前捕获算法在枚举 PID 与取得句柄之间存在退出竞态，增加轮询频率或忽略短命 cmd 不能证明生命周期。

## 首失败回收与后续边界

准确远端根为 `C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261003-R6`。只读盘点并经严格 SSH/SFTP 回收 53 文件，共 `6162158` bytes，全部尺寸和 SHA-256 与远端清单一致；本地位于 `.acceptance/a9-31-developer/product-r1/controller-r6-boot-first-failure/`。包含首失败 PNG、SQLite、driver/controller/capture 原始 JSON、运行请求和 global dispatcher 证据。`r6-boot-return-inventory.json`、回收目录的 `retrieval-verification.json` 绑定全部逐文件哈希。

`r6-boot-known-secret-scan.json` 对准确已知夹具秘密的 UTF-8/UTF-16LE 字节检查通过；范围仅为 53 返回文件中的该秘密，不代表全凭据或图像语义扫描。safe-process-output 原记录亦报告 stdout/stderr 无该秘密。一次只读轮询发生 TimeoutExpired，异常的部分流未保存；后续准确 final 与全部返回文件已回收，不虚构该轮原始字节。

R6 合同 §4 明确：“硬失败立即停止，后续根另立准确合同。”§2 明确“不改产品/native/C#捕获算法”。本次观察触及生命周期硬门，不能在 R6 热改捕获、忽略 UNKNOWN 或复用旧 root 重启。后续需要同时处理普通 driver 的表达式转义和捕获竞态，先形成准确修复合同；当前只做证据保存、只读诊断与文档记录，不自行扩大审批范围。

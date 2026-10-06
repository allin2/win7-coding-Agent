# A9-31 — 托管后台进程工具

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: EXECUTION_CAPABILITY
Target Branch: codex/a9-31-background-tools
Source Baseline: c2b6356f83ef8502a34516010924547c57a3bec2
Phase-Gate: A9_31_DEVELOPER_VERIFIED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0151 (Accepted)
```

## 1. 授权与依赖

2026-10-01 草稿，仅文档获准。实现前批准本任务及 ADR，绑定已审核 A9-30 整合后的准确 source hash，
在上述独立干净分支执行；inspection baseline 不冒充含实时输出的实现基线。
复用 [helper v3](../plans/A9_HELPER_V3_STREAMING_PROTOCOL.md)，release 扩展需要新 revision、
D-013/D-017 评审及双构建重锁，不拿 A9-30 旧字节证明替代。

2026-10-02，负责人要求第二批整批推进到 Win7 正式验收 PASS。A9-30 已登记
DEVELOPER_VERIFIED；本任务仍是待审合同，不将推进指令解释成具体实现批准。
实现基线取 [审批包](../plans/A9_BATCH_2_IMPLEMENTATION_APPROVAL.md) C1 登记提交的完整 SHA，
该提交产品字节必须与上述 inspection source 完全一致，且包含收口文档及生产开发锁。
只有负责人批准本任务/ADR-0151及此基线绑定方式后，才登记实现授权并创建本任务独立干净工作树。
提交、套件批准、构建机写入与本地整合仍各自绑定具体差异/哈希/目标，不默认推送。

## 2. 模型工具与身份

复用 BackgroundProcessManager，strict schema，additionalProperties=false：

| 工具 | 输入 | 返回 |
|---|---|---|
| start_process | 非空 command（沿用 shell 长度上限）、可选 cwd（沿用路径规则）；无 PID/Shell path/env 覆盖 | handleId、starting/running/failed、启动身份/cleanupRequired；ready 失败不能成功 |
| read_process_output | handleId、cursor（首读可省）、maxBytes=8192（1..16384） | 按 seq entries（stream/text）、nextCursor、状态/退出码、truncated/oldestCursor；同 cursor 可重读同区间 |
| stop_process | handleId | 已验证停止/退出、cleanupRequired、诊断；重复 Stop 幂等 |

句柄绑定 canonical workspace、conversationId、原 taskId/turnId/helper requestId；模型不能提供归属、PID 或证明。
默认最多三个，本批不新增数量设置 UI。start 仍走 shell 模式/Policy/高影响目标确认。
managed transport 支持协议 v3 的 ready/output/terminal/release，沿用可等待输出和跨块脱敏；
不能把当前仅支持 v2 的 startManaged 当成 v3 可用，也不能在 v3 失败时回退直接 spawn。
启动意图及归属先必需审计落盘，ready 身份证明和状态事件成功后才返回 running；
任一必需审计失败停止后续派发并进入受控清理，不把实际已启动写成零副作用。
Read Only 不开放模型 start/stop，只读当前归属记录；用户安全 Stop 保留。
错工作区/对话、未知句柄、归档身份、cursor错属/未来值结构化拒绝。
每句柄 ring 沿用每流 1 MiB/4096 发布帧上限；旧 cursor 淘汰返回 CURSOR_EXPIRED/oldestCursor，不伪装空输出。
cursor 为 Runtime 生成的不透明、绑定句柄和实例身份的游标，模型不能选择 eventId 读取别的任务。
字节上限按 UTF-8 安全文本计，不切断码点；所有 entries 在入 ring、落盘、IPC或模型结果前脱敏。
每帧稳定身份包含启动 requestId/handleId/seq，输出与终态恢复不重复追加。
轮询不改全历史；每次工具结果继续应用既有字符/Turn预算。背景输出归属原启动身份，即使原 Turn 已结束。

## 3. 重启、Stop 和退出

统一 Stop、集合上限和活动期间切换限制保留。重启只恢复 facts，按 PID/命令探测，不接管旧 stdout；
exited/running_unknown/identity_mismatch 分开。PID复用或身份不完整时模型 stop 零执行，用户处理需新目标确认。
不新增服务、托盘、自动启动或持久 Agent。

关闭默认“停止后退出”；“留给系统后退出”必须走设计 §2.1 release。
Job KILL_ON_JOB_CLOSE 是已知实现事实，仅删除句柄不能证明移交。
release 意图先落盘，逐句柄回执成功才报告 leftToSystem；部分失败逐项保留，用户可取消退出或明确选择停止，
不能静默全杀或写全成功。释放后不再轮询受控 pipe，只保留最后安全输出和释放事实。
释放与 cancel 竞态、回执丢失写 release_unknown；Win7 实测退出后根/子 PID 身份和存活。
依赖 stdout pipe 的程序可能在闭管道后退出，失败如实报告，不泛化任意程序存活保证。

## 4. 已批准精确路径

- Core：`src/core/src/a9-tools.ts`、`src/core/src/a9-agent-loop.ts`、`src/core/src/system-prompt.ts`、`src/core/src/index.ts`。
- Runner：`src/runner/src/background-process-manager.ts`、`src/runner/src/trusted-shell-runner.ts`、`src/runner/src/trusted-shell-adapter.ts`、`src/runner/src/native-protocol.ts`、`src/runner/src/native-transport.ts`、`src/runner/src/stream-output.ts`、`src/runner/src/index.ts`。
- State：`src/state/src/a9-persistence.ts`；owner/release/cursor 放版本化事件，不改表 schema。
- Shell：`src/shell/product/a9-agent-runtime.js`、`src/shell/product/a9-product-ipc.js`、`src/shell/product/preload.js`、`src/shell/product/main.js`、`src/shell/product/renderer/a9-workbench.js`、`src/shell/product/renderer/a9-workbench.css`、`src/shell/product/a9-package-runtime.js`；最后一项仅增加 managed 开发 revision 的严格身份校验，正式候选分支由 A9-33 单独批准。
- native：`native/helper/helper.cpp`、`native/helper/helper.h`、`native/helper/protocol.cpp`、`native/helper/logic_tests.cpp`、`native/helper/CMakeLists.txt`、`native/helper/stream_writer.cpp`、`native/helper/stream_writer.h`、`native/helper/README.md`。
- managed kit 精确新增文件：`native/helper/build-win10-kit-v26-managed/prepare-kit.cjs`、`native/helper/build-win10-kit-v26-managed/package-kit.cjs`、`native/helper/build-win10-kit-v26-managed/build.ps1`、`native/helper/build-win10-kit-v26-managed/build-profile.json`、`native/helper/build-win10-kit-v26-managed/README_BUILD.md`、`native/helper/build-win10-kit-v26-managed/helper.exe.manifest`、`native/helper/build-win10-kit-v26-managed/SOURCE_COMMIT.txt`、`native/helper/build-win10-kit-v26-managed/SOURCE_COMMIT_TIMESTAMP.txt`、`native/helper/build-win10-kit-v26-managed/input-lock.json`、`native/helper/build-win10-kit-v26-managed/PACKAGE_MANIFEST.json`。
- managed kit 精确生成源码：`native/helper/build-win10-kit-v26-managed/src/helper.cpp`、`native/helper/build-win10-kit-v26-managed/src/helper.h`、`native/helper/build-win10-kit-v26-managed/src/protocol.cpp`、`native/helper/build-win10-kit-v26-managed/src/logic_tests.cpp`、`native/helper/build-win10-kit-v26-managed/src/CMakeLists.txt`、`native/helper/build-win10-kit-v26-managed/src/stream_writer.cpp`、`native/helper/build-win10-kit-v26-managed/src/stream_writer.h`、`native/helper/build-win10-kit-v26-managed/src/whitelist.cpp`、`native/helper/build-win10-kit-v26-managed/src/whitelist.h`、`native/helper/build-win10-kit-v26-managed/src/argv_builder.cpp`、`native/helper/build-win10-kit-v26-managed/src/argv_builder.h`、`native/helper/build-win10-kit-v26-managed/src/json_parser.cpp`、`native/helper/build-win10-kit-v26-managed/src/json_parser.h`。逐字节提取新批准 source，不手改第二份源码；原 A9-30 kit 与批准 ZIP/manifest/锁不得覆盖。
- 新输入登记：`release/win7-product-v3/a9-v26-approved-build-kits.json` 只追加 revision；新建 `release/win7-product-v3/a9-v26-managed-input-lock.json`，不覆盖 A9-30 的 `a9-v26-input-lock.json`。
- managed 发布消费：`scripts/release/build-a9-product-v3.mjs`、`scripts/release/record-a9-v26-helper-input.mjs`、`scripts/release/a9-v26-return-evidence.mjs`；只增加 managed revision/锁选择及 release proof 消费，不改历史锁或批准包。
- 测试：`src/core/tests/a9-tools.test.ts`、`src/core/tests/a9-background-tools.test.ts`、`src/runner/tests/background-process-manager.test.ts`、`src/runner/tests/native-transport.test.ts`、`src/runner/tests/trusted-shell-runner.test.ts`、`src/runner/tests/stream-output.test.ts`、`src/state/tests/a9-managed-process-ownership.test.ts`、`src/shell/tests/product/a9-background-tools.test.ts`、`src/shell/tests/product/a9-lifecycle.test.ts`、`src/shell/tests/product/a9-package-runtime.test.ts`、`scripts/release/test/v26-prepare-kit.test.mjs`、`scripts/release/test/v26-evidence-fixture.mjs`、`scripts/release/test/a9-package.test.mjs`。

文档仅本任务、helper设计、DECISIONS/WIN7_CONSTRAINTS 新段、任务/方案索引、STATUS/STATUS_LOG和任务报告。
不改历史 v24/v25、候选、系统设置、通用权限模型或凭据。

## 5. 验证和完成

拟批准的增量合同使用 Node 20.17，直接受影响 Core/Runner/State/Shell。与旧草稿的整 workspace 测试相比，
以下清单覆盖新功能与共享安全链路，只有本修订获批后才取代旧草稿命令：

```sh
npm run verify:quick
npm test --workspace=@win7-agent/core -- --runInBand --runTestsByPath tests/policy.test.ts tests/a9-tools.test.ts tests/a9-background-tools.test.ts tests/a9-agent-loop.test.ts tests/a9-shell-streaming.test.ts tests/a9-audit-integrity.test.ts tests/a9-verification-evidence.test.ts tests/a9-context-budget.test.ts tests/a9-permission-modes.test.ts
npm test --workspace=@win7-agent/runner -- --runInBand --runTestsByPath tests/background-process-manager.test.ts tests/native-transport.test.ts tests/trusted-shell-runner.test.ts tests/trusted-shell-runner-contract.test.ts tests/stream-output.test.ts
npm test --workspace=@win7-agent/state -- --runInBand --runTestsByPath tests/a9-managed-process-ownership.test.ts tests/a9-persistence-contract.test.ts tests/a9-stream-output.test.ts
npm test --workspace=@win7-agent/shell -- --runInBand --runTestsByPath tests/product/a9-background-tools.test.ts tests/product/a9-lifecycle.test.ts tests/product/a9-shell-streaming.test.ts tests/product/a9-audit-integrity.test.ts tests/product/a9-mode-fail-closed.test.ts tests/product/a9-workspace-binding.test.ts tests/product/a9-workbench-contract.test.ts tests/product/a9-preload-capability.test.ts tests/product/a9-package-runtime.test.ts
node --test scripts/release/test/v26-prepare-kit.test.mjs scripts/release/test/a9-package.test.mjs
npm run verify:quick
npm run docs:check
git -c core.fsmonitor=false diff --check
```
覆盖 3/4 个进程、ready失败、重复/过期/错属游标、双 Stop、错属句柄、异步退出/审计失败、PID重用、
崩溃/重启、停止退出、release退出/取消竞态/回执丢失。移除 owner/cursor校验、把清理失败写成功、
只删除句柄当移交，各至少一项反例红；恢复后源哈希相同。
真实 Electron 检查焦点/Stop/退出选择/切换；Win10原生 release 和 Win7存活证据独立。
证据 `.acceptance/a9-31-developer/`，报告 docs/reports/2026-10。开发机/构建复核通过才整合，Win7由新候选取得。
当前实现/构建/目标机均 NOT_PERFORMED，不签发完整 Alpha 2/RC。

增量判定和继承准入见 [验证矩阵](../plans/A9_BATCH_2_INCREMENTAL_VALIDATION.md)。修改 helper/transport/解码/Runtime 后，
Shell 顺序、双源、三种编码、跨块秘密、限额、背压、Stop、审计与恢复必须在新实际工件上直接检查。
Win10 必须通过真实 main/preload/SQLite/IPC/Renderer 入口检查后台工具和退出选择，Runner-only 不代签 UI。
每组失败先留原始响应；不可证明清理时记 UNKNOWN 并暂停派发，不要求夹具把 UNKNOWN 改成成功。
先执行一次 verify:quick 构建（Shell 产品测试加载各模块编译产物，受跟踪的 Runner dist 可能陈旧；2026-10-05 ADR-0181 修订），模块定向检查完成后再执行 verify:quick；新变化/失败扩大到受影响项，不机械重跑全部已验证稳定宿主项。

## 6. C1/C2具体批准与进入实施（2026-10-03）

负责人对已准备的C1/C2请求回复“批准”：准确25路径登记提交为
`c2b6356f83ef8502a34516010924547c57a3bec2`，逐项提交blob匹配审批快照，产品字节等于32ee0b4。
据此批准本任务§1–5、ADR-0151、68项精确路径及增量检查清单；本节是当前授权入口，前文草稿时点保留。
独立工作树 `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent` 从上述准确提交建立，
分支 `codex/a9-31-background-tools`，开始时tracked/untracked干净。主代理实施，不默认委派。
本任务后续源码提交、原生kit批准/双构建、远端新目录/写入、本地整合与候选门另行具体批准；
A9-32/33仍草稿，Win7 NOT_PERFORMED，不推送、不合main、不发布。

## 7. 本地实施交接（2026-10-03）

[交接材料](../plans/A9_31_IMPLEMENTATION_HANDOFF.md)及
[本地报告](../reports/2026-10/a9_31_local_implementation_and_source_handoff_2026-10-03.md)登记本轮结果。
Core185、Runner162、State70、Shell113规定项通过，4类故障反例红且源码恢复；发布/文档以最终日志与矩阵为准。
Mac原生逻辑PASS只覆盖平台无关逻辑。源码未提交，managed模板未正式批准，新锁NOT_LOCKED；
Windows原生/真实Electron/Win7、独立收口复核均NOT_PERFORMED。Phase-Gate继续IMPLEMENTATION_IN_PROGRESS。
本节不批准源码提交、远端写入、构建、整合或任何候选门。

## 8. 源码提交、独立复核与修复（2026-10-03）

负责人具体批准r2的51项字节，source2ecfc86d22bd7816cb75222db0917b25d32291a1已本地提交，父为C1。
managed r1生成但未批准；独立Luna high提出P1审计历史解释/P2反向竞态缺口。
两项在原白名单内修复且本地证据/独立补充闭环；原r1和首失败不改判。
修复提交审批r3待负责人回复，后续准确kit哈希/构建/整合仍需各自授权。
见[修复交接](../reports/2026-10/a9_31_managed_review_fixes_and_source_handoff_2026-10-03.md)。
Phase-Gate仍A9_31_IMPLEMENTATION_IN_PROGRESS，Windows双构建/真实Electron/Win7均NOT_PERFORMED。

## 9. managed r2独立复核与待审修复（2026-10-03）

负责人批准r3源码提交17项字节，准确source为d9b5be502c9475e50c54b349a6a12abd27b199f8。
新managed r2套件已生成，负责人明确授权独立只读复核；
[报告](../reports/2026-10/a9_31_managed_r2_independent_kit_review_2026-10-03.md)结论FAIL_NOT_APPROVED（P1=1）。
原生烟测真实helper/root/child身份绑定需补齐，尚无对应产品缺陷证据。
[精确修复材料](../plans/A9_31_MANAGED_IDENTITY_REPAIR_APPROVAL.md)/ADR-0156待审；
新增只读系统API具体批准前暂停相关实现，其他既有授权不扩大。源码/kit/构建/整合授权仍按§6。
r2和旧r1失败保留；本任务仍IMPLEMENTATION_IN_PROGRESS，原生双构建/真实Electron/Win7均NOT_PERFORMED。

## 10. ADR-0156具体修复批准（2026-10-03）

负责人对准确修复请求回复“批准”：批准ADR-0156及[六路径修复合同](../plans/A9_31_MANAGED_IDENTITY_REPAIR_APPROVAL.md)，
在source d9b5be502c9475e50c54b349a6a12abd27b199f8/本任务分支修复身份取证、schema2及退出码并做本地定向检查。
只读Toolhelp系统API登记已具体批准；旧r2 FAIL_NOT_APPROVED不改判。
该批准不包含后续源码提交、套件批准登记、远端写入、原生构建、推送/整合或候选门。

## 11. ADR-0156修复交接（2026-10-03）

六路径身份/证据修复完成；独立补充的reader超时句柄收尾P2也已在build.ps1内修复。
[独立补充](../reports/2026-10/a9_31_managed_identity_repair_independent_followup_2026-10-03.md)静态P0/P1/P2=0，
[源码交接](../reports/2026-10/a9_31_managed_identity_repair_source_handoff_2026-10-03.md)登记90直接+644继承。
原r2 FAIL_NOT_APPROVED不改判，源码未提交、新kit未生成；实际PS/C#、双构建、Electron和Win7仍NOT_PERFORMED。
准确r4源码提交和从新source生成未批准r3 ZIP待负责人具体批准，不含套件登记/构建/整合。

## 12. 准确r4源码提交与r3套件独立复核（2026-10-03）

负责人要求执行两个前置步骤并构建，准确16项源码已提交为10114503a1e79706131ea4a11a5b96bd2958807a，
从该source生成managed r3，独立复核P0/P1/P2=0/0/0，PASS_FOR_OWNER_KIT_APPROVAL。
详见[独立报告](../reports/2026-10/a9_31_managed_r3_independent_kit_review_2026-10-03.md)及
[具体登记/Win10构建审批包](../plans/A9_31_MANAGED_R3_WIN10_BUILD_APPROVAL.md)。
一般构建指令未预先指定新远端目录/ACL；准确套件登记及本包具体范围仍待负责人裁决。
原r1/r2与失败证据保持不变，原生/真实Electron/Win7 NOT_PERFORMED；Phase-Gate不升级。

## 13. managed r3套件登记及准确Win10双构建批准（2026-10-03）

负责人回复“批准上述具体套件登记和构建范围”，批准[具体审批包](../plans/A9_31_MANAGED_R3_WIN10_BUILD_APPROVAL.md)
的r3套件、24路径登记提交、三新目录及SID1005权限/四v1 fixture、受控双构建和回收。
套件与六控制输入独立复核均P0/P1/P2=0；必须在正式构建前通过普通身份和完整PS ParseFile硬门。
不推送/合并，不修改账户/profile/许可证；Phase-Gate不提升，后续返回复核/重锁/Electron/Win7按合同。

## 14. managed r3实际Win10双构建与待返回复核（2026-10-03）

负责人从普通桌面启动R2后，SID1005/Session3/Medium/非提升/无Job门通过。
原登记HEAD a4ec353保持绑定；两次原生返回PASS，独立run-id/不同ZIP哈希、相同helper字节。
见[返回事实报告](../reports/2026-10/a9_31_managed_r3_native_double_build_return_2026-10-03.md)。
真实预检发现并在原白名单内修复记录器误把kit登记编号等同native revision；源/哈希/固定native合同保持。
独立返回复核/return_review/managed新锁尚未完成，控制器退出码/完整树清理UNKNOWN，依ADR-0157暂停下游。
源码修正未提交；Phase-Gate保持IMPLEMENTATION_IN_PROGRESS，真实Electron/Win7 NOT_PERFORMED。
不重编已通过的原生输入，不覆盖首失败/超时/旧kit或历史候选，不推送/合并/发布。

## 15. managed r3独立返回复核与有限离线裁决待批（2026-10-03）

独立gpt-6-luna/high返回复核完成，PASS_TECHNICAL_RETURN_EVIDENCE / NOT_APPROVED_FOR_INPUT_LOCK；
P0/P1/P2=0/1/0，控制器UNKNOWN为唯一准入缺口，不改判原生helper失败。
[独立报告](../reports/2026-10/a9_31_managed_r3_independent_return_review_2026-10-03.md)绑定两个准确返回。
ADR-0158 Proposed及[准确十路径登记/五路径重锁审批包](../plans/A9_31_MANAGED_R3_RETURN_RELOCK_APPROVAL.md)待负责人裁决；
正式registry/锁未改，源码修正未提交。ADR-0157停止下游继续有效，Phase-Gate不升级。


## 16. managed r3有限离线重锁具体批准（2026-10-03）

负责人批准[准确返回登记/重锁包](../plans/A9_31_MANAGED_R3_RETURN_RELOCK_APPROVAL.md)§1–6及ADR-0158，
实际登记时间 `2026-10-03T07:10:46.920499Z`。允许准确十路径登记、两个不可变返回离线重锁及五路径锁登记提交。
独立报告0/1/0、原NOT_APPROVED准入结论及controller exit/tree UNKNOWN保留；
准入由负责人具体裁决单独登记。旧ADR-0157、原返回/失败/候选不改。
正式提交和锁结果仍待本次实际执行，不签DEVELOPER_VERIFIED；真实Electron/Win7 NOT_PERFORMED。


## 17. managed r3正式输入重锁（2026-10-03）

按负责人ADR-0158和精确格式补批，十路径登记提交为 `dcf541892ec3ee5f5413833206f07efa3f3ee6e2`；
正式managed输入锁生成/回读PASS，SHA-256 `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e`，7905 bytes。
[准确审批/执行记录](../plans/A9_31_MANAGED_R3_RETURN_RELOCK_APPROVAL.md)绑定原生source10114503、
helper2036bf69…51e4b7、两个run-id/返回及clean committed批准registry；旧锁不改。
独立P1=1、controller exit/tree UNKNOWN和原生背压缺终态保留，只解除本包离线原生输入准入。
本节及锁仅按五路径批准登记；Phase-Gate继续A9_31_IMPLEMENTATION_IN_PROGRESS。
产品装配/真实Electron和Win7 NOT_PERFORMED，尚未DEVELOPER_VERIFIED，不推送/整合/发布。


## 18. 开发检查包r1与新控制器精确补充待批（2026-10-03）

负责人批准继续打包/Win10验证准备；source35a19250ed6589f6a7ba35b940a784325970c111的独立开发包已形成。
ZIPaae71bb0…d2f10c0 / manifestdf70fa5b…97e7b9，本地784项闭包与包内runtime/native哈希加载通过。
[事实报告](../reports/2026-10/a9_31_product_r1_package_and_win10_preflight_2026-10-03.md)区分Mac配置读取和Windows实际运行。
严格SSH实际连接Win10成功，SID1005/Session3在线；本轮普通令牌/真实Electron未执行。
[具体执行包](../plans/A9_31_PRODUCT_R1_WIN10_VALIDATION_APPROVAL.md)/ADR-0159 Proposed列出四个新测试源路径、
准确新profile根、8phase及真实句柄/exit/tree取证。现任务白名单未包括这四路径，批准前不编写或写远端。
Phase-Gate仍IMPLEMENTATION_IN_PROGRESS，旧P1=1/UNKNOWN保留；不提交、推送/合并/发布、重编或启动新代理。


## 19. 开发检查包r1外部验证四路径具体批准（2026-10-03）

负责人批准[精确执行合同](../plans/A9_31_PRODUCT_R1_WIN10_VALIDATION_APPROVAL.md)§1–6和ADR-0159。
当前任务仍APPROVED_FOR_IMPLEMENTATION，分支仍 `codex/a9-31-background-tools`；在原白名单之外仅追加以下四个准确源路径：

- `.acceptance/a9-31-developer/product-r1/control-scripts/stage-product-r1.ps1`
- `.acceptance/a9-31-developer/product-r1/control-scripts/launch-product-r1-desktop.ps1`
- `.acceptance/a9-31-developer/product-r1/control-scripts/serve-product-r1-desktop.ps1`
- `.acceptance/a9-31-developer/product-r1/control-scripts/product-r1-driver.cjs`

按准确source35a1925/ZIP/manifest/managed锁/普通SID1005 Session3及新根固定合同执行，最终哈希冻结后准入。
保留旧P1=1及controller UNKNOWN；真实运行尚未执行，不签开发或Win7收口。无提交/推送/整合/发布授权。


### 2026-10-03 — product r1控制器首失败与R2具体重试待批

Supervisor/controller普通SID1005/Session3/Medium/非提升/noJob门通过。首个Boot在原始字段正则被误拒绝，
r1 HALTED，持有controller及子进程句柄退出1/0，runs=0，产品未派发；首失败字节保留。
四批准源路径内已修复，实际PS5.1三解析、69原始JSON检查及Node32项PASS。
R2新根和独立控制器具体合同待负责人裁决，旧r1不复活，不写远端R2；真实Electron和Win7仍NOT_PERFORMED。
Phase-Gate不升级，无提交、原生重编、账户/ACL改变、推送、整合或发布。


### 2026-10-03 — product r1 R2准确重试获批

负责人批准R2重试合同§1–5；在SID1005实际profile下新R2根部署相同冻结包与四脚本，重新实测普通桌面身份。
R1保持HALTED及原始退出/首失败证据，不复活、不删除；本次最多2小时16固定phase请求。
批准覆盖同四路径必要修复/检查及最终hash冻结，产品/native及旧锁保持；Phase-Gate不升级。
真实Electron/Win7结果尚未取得，无提交/推送/整合/发布、原生重编或账户/ACL修改。


### 2026-10-03 — R2 Boot 首失败及 R3 准确调度材料

R2 普通监督器/controller/Electron身份门通过；[Boot首失败](../reports/2026-10/a9_31_product_r1_r2_boot_asar_failure_2026-10-03.md)保存ASAR视图错误、实际持有实例exit1/树结束，未取得产品功能PASS。
同四路径内 driver 按 ADR-0088 修复，Node40项及八完整性用例通过；当前冻结执行版本不覆盖。
[R3合同](../plans/A9_31_PRODUCT_R1_R3_REUSABLE_DESKTOP_APPROVAL.md)拟将launch设为有限稳定窗口，三PS/安全门冻结、同范围driver修复版本逐版登记后SSH派发；ADR-0160 Proposed，新增调度范围未获准，不编写该部分或写远端R3。
A9-31保持IMPLEMENTATION_IN_PROGRESS，修复后实际Electron及后续phase/Win7均NOT_PERFORMED。


### 2026-10-03 — R3有限可复用窗口获批、部署装配通过

负责人批准R3合同§1–6及ADR-0160；四准确源路径内实施完成。Node54项、物理ASAR八正负项、实际PS5.1三解析和210请求/revision/限额/未知树检查通过。
新R3根及17输入已部署，装配复核产品784项/宿主73项及登记通过；首装配参数绑定失败与同准确输入绑定后的成功均保留，冻结三PS不覆盖。
R2已批准stop并取得持有controller/Electron实例真实exit0/1和完整观察树结束，不把首轮Boot失败改为PASS。
[实施证据与准确master/revision哈希](../reports/2026-10/a9_31_product_r1_r3_reusable_dispatcher_2026-10-03.md)已登记；Mac锁屏暂停Computer Use，R3尚待普通桌面一次启动，功能/复用实机证明与Win7 NOT_PERFORMED，Gate不升级，无提交/系统权限改变。


### 2026-10-03 — R3普通桌面Boot首失败、HALTED与R4准确材料

R3 dispatcher32184/worker34536/Electron4196均直接通过SID1005/Session3/Medium/普通非提升/noHostJob。Boot run979976d3260e49a7a316bf8c0e604971的实际Electron/Node/SQLite、可见窗口和Renderer隔离三项通过，权限模式未选择时的INPUT_FOCUS失败；夹具前置在原driver路径修正且语法/54检查/784物理闭包PASS，实际复验未执行。
两层捕获报告未绑定观察PID13524，HALTED；原始13文件/截图/数据库及hash已回收，未知退出不因后续PID不存在改判。R3不复活，Shell及余六phase/同窗口重试证明NOT_PERFORMED。
[首失败报告](../reports/2026-10/a9_31_product_r1_r3_boot_focus_and_capture_failure_2026-10-03.md)与[R4具体合同](../plans/A9_31_PRODUCT_R1_R4_CAPTURE_RETRY_APPROVAL.md)/ADR-0161 Proposed已形成；冻结PS捕获/收尾修复及新R4远端执行待具体批准。A9-31保持IMPLEMENTATION_IN_PROGRESS，Win7/独立收口NOT_PERFORMED，无提交/推送/整合/发布/系统权限改变。


### 2026-10-03 — R4准确批准、捕获修复与部署通过

负责人批准R4合同§1–5及ADR-0161。四外部源完成新捕获/失败收尾/UTF8/参数绑定和焦点前置；Node68、实际PS三解析/210判据和实际12捕获/abort API检查通过，普通产品证据不由Administrator/Session0预检替代。取证模板/编码读取首失败均保留。
R4已CreateNew传输18项，完整784产品/73宿主闭包及登记装配通过；[准确冻结与部署报告](../reports/2026-10/a9_31_product_r1_r4_capture_fix_and_deployment_2026-10-03.md)绑定全部hash。UU可见桌面但键盘输入未送入CMD，SSH无R4启动记录，等待一次普通桌面启动；R3不恢复、UNKNOWN不改判。Boot及后续/同窗口复验/Win7 NOT_PERFORMED，A9-31仍IMPLEMENTATION_IN_PROGRESS，无提交/系统改变。


## 2026-10-03 R4实际启动及捕获首失败

R4三角色普通身份均通过，准确Boot `01e5a8be22e9473fae4da8b1059eb46a` 在worker初始化观察未绑定csc.exe，HALTED。worker/Electron持有实例真实exit1不替代编译器UNKNOWN；15原始文件及准确hash、秘密扫描保留，未派发下游。详见[首失败报告](../reports/2026-10/a9_31_product_r1_r4_boot_compiler_capture_failure_2026-10-03.md)。
[R5具体合同](../plans/A9_31_PRODUCT_R1_R5_CAPTURE_PRECOMPILE_APPROVAL.md)/ADR-0162 Proposed只形成材料：四外部源内部署前固定现有C#预编译与hash准入，运行时不编译；新准确根、准备写入及桌面重试仍待具体批准。现任务状态不扩大这项未批范围，旧冻结源与输入不改；IMPLEMENTATION_IN_PROGRESS、独立收口/Win7 NOT_PERFORMED。


## 2026-10-03 R5具体批准

负责人批准[R5合同§1–5](../plans/A9_31_PRODUCT_R1_R5_CAPTURE_PRECOMPILE_APPROVAL.md)及ADR-0162：本任务分支、准确source35a19250及原四外部验证源允许预编译加载修复和准入检查、准确R5根准备/部署/普通窗口执行。原C14状态与产品白名单不扩大；只沿用既有API与固定C#片段，准备编译不是产品/Win7证据，所有历史UNKNOWN保留，无提交或账户/权限授权。


### 2026-10-03 - R5 no-manual-command desktop entry approved

The current user approved [the exact scheduled entry plan](../plans/A9_31_R5_SCHEDULED_DESKTOP_START.md); ADR-0163 is Accepted.
Only register/run/verify root task `\A9-A31-R5-Desktop-20261003`, and disable it on failure. This does not edit the four frozen validation sources.
Task Scheduler is registered as an external Win10 test profile in WIN7_CONSTRAINTS. Ordinary execution must still prove SID1005/Session3/Medium/non-elevated/noHostJob. Original eight-phase/two-hour/sixteen-request R5 scope applies only after launch gates pass. Old R4/UNKNOWN remain unchanged; registration and real launch results must be recorded separately.

### 2026-10-03 - R5 scheduled entry failed noHostJob; task disabled

[Direct failure evidence](../reports/2026-10/a9_31_r5_scheduled_desktop_entry_failure_2026-10-03.md): exact task registration/14-field readback passed, SSH launched ordinary SID1005/Session3/Medium PID22728, but InJob=true triggered IDENTITY_ORDINARY_DESKTOP_REQUIRED. R5 HALTED with requests=0 and no ready. The approved rollback disabled the exact task; no product requests, no Job bypass, no manual PowerShell fallback. Do not restart this R5 or count Task State/LastTaskResult as acceptance. New entry requires its precise authorization; Win7 and product/reusable retry checks remain NOT_PERFORMED.


### 2026-10-03 — R5普通手动实例身份通过，但历史HALTED阻断；R6材料就绪

R5准备预编译、Node68/实际PS三解析/237判据/22实际API文件检查、784产品/73宿主装配已通过；原51文件准备索引和首失败均保留。另轮计划任务PID22728因HostJob失败，原HALTED不改判。
代理给旧指令前未复查该记录；用户普通桌面新PID36076/creation639266265512707074直接通过SID1005/Session3/Medium/非提升/noJob，但旧final仍在，不派发产品。固定stop已发送，持有30秒未退出，exit UNKNOWN；20:20快照仍在且无直接子进程，不代签清理。
[准确事实与五文件hash](../reports/2026-10/a9_31_r5_manual_restart_guard_failure_2026-10-03.md)保留旧final SHA39d6b4b…147967及新start/ready分属不同实例。R6新根/入口claim防护/原编译批准来源严格校验具体合同与ADR-0164 Proposed已形成，实施/远端R6 NOT_PERFORMED；A9-31仍IMPLEMENTATION_IN_PROGRESS，产品八phase、独立收口、Win7 NOT_PERFORMED，无提交或系统权限改变。


### 2026-10-03 — R6准确批准

负责人批准[R6合同§1–5](../plans/A9_31_PRODUCT_R1_R6_ENTRY_GUARD_APPROVAL.md)及ADR-0164：原四外部源的入口claim/历史硬停止防护、原编译批准来源独立绑定、新准确R6根部署及普通有限窗口。保留旧R5及UNKNOWN；产品/native白名单不扩大，不提交/改系统/执行Win7。


### 2026-10-03 — R6批准、入口防护实施及271协议检查通过；容量阻断部署

负责人批准R6合同§1–5及ADR-0164；仅原四外部源完成唯一claim/旧final拒绝、实例绑定、原capture编译批准独立校验和新根绑定。Node68、784产品闭包、实际PS5.1三解析/271判据PASS，真实旧R5根被新guard只读拒绝且原final hash不变。ASAR八负例按完整函数字节/调用和原记录hash继承，原DLL/产品/native锁不重建。
[直接记录及边界](../reports/2026-10/a9_31_r6_entry_guard_local_checks_capacity_block_2026-10-03.md)：C盘20:31仅1536315392 bytes、20:35仅1589366784 bytes，低于部署门2147483648；R6未创建。真实文件/并发及22项API、完整装配/冻结、新普通窗口/八产品phase NOT_PERFORMED。旧R5 PID36076仍在、固定stop后实际exit UNKNOWN，UU入口不可用；不派发、不清理或迁移目标。A9-31仍IMPLEMENTATION_IN_PROGRESS，Win7/独立收口未执行，无提交或系统改变。

### 2026-10-03 — R6容量恢复、定向检查与冻结部署通过；普通桌面待启动

容量门通过后，25项实际capture/API/文件与22项入口/文件/并发检查PASS，首轮准备失败保留；固定源不变。R6 master9c9812d1…172cf、初始revisionc2fb083d…ea666及checks/registration已冻结；21新目标CreateNew传输/哈希/PS ParseFile及远端784产品/73宿主装配通过，原DLL/build/批准与产品/native锁不变。
[直接记录及桌面交接](../reports/2026-10/a9_31_r6_frozen_deployment_and_desktop_handoff_2026-10-03.md)：旧R5同实例50秒持有观察仍存活、exit UNKNOWN，原final不变、零产品request；21:17:39快照仍存活，R6尚无entry/ready/final。UU无法连接服务器，已请用户在普通A9 Builder桌面正常关闭旧R5并启动R6一次。旧控制器不能派发及新普通身份未证实前不派发；八phase、同窗口重试、独立收口及Win7 NOT_PERFORMED。IMPLEMENTATION_IN_PROGRESS不改，无提交或系统配置变更。


### 2026-10-03 — Computer Use取得旧命令红字，R6普通身份通过但Boot生命周期硬停止

Computer Use退出UU本机被控详情后进入准确Win10桌面，读取旧R5命令导致既有dispatcher-final的IOException；随后键入准确R6入口。dispatcher PID113716/creation639266316299998155通过SID1005/Session3/Medium8192/普通非提升/noJob门，旧R5当前不存在而历史退出码仍UNKNOWN。
唯一Boot run `42a85eb4c6644abe8f3f892d7f7a9239`通过四项基础检查后出现Renderer执行失败；只读冻结表达式复现权限选择脚本引号转义SyntaxError，属于夹具缺陷。独立的cmd.exe PID48664（父Electron84472）在取得句柄前退出，dispatcher报LIFECYCLE_OBSERVED_CHILD_NOT_PINNED并HALTED。七个已持有实例实际退出0不能覆盖未持有cmd的creation/exit UNKNOWN。
[准确首失败与回收报告](../reports/2026-10/a9_31_r6_cua_errors_and_boot_capture_failure_2026-10-03.md)绑定53文件/6162158 bytes，逐文件hash一致；R6不恢复、不派发后续七phase，不改冻结捕获。后续根及捕获修复须按R6合同§4另立准确合同。A9-31仍IMPLEMENTATION_IN_PROGRESS，独立收口/Win7 NOT_PERFORMED；无提交、产品/native/锁或系统配置改变。


### 2026-10-03 — R6夹具本地修复73项通过；R7查询句柄准确材料待确认

负责人“批准批准”后，在原精确外部driver路径修复Full Access表达式序列化，Node语法/73判据（原68加5个真实序列化/DOM作用/缺失元素负例）通过；19完整字面Renderer参数解析通过，动态参数仍须真实Electron。R6冻结四源及首失败不变，检查器首轮环境/分类失败保留，没有安装依赖。
[R7具体合同](../plans/A9_31_PRODUCT_R1_R7_QUERY_HANDLE_CAPTURE_APPROVAL.md)及ADR-0165 Proposed已形成：拟新增第五C#源和最小权限非继承查询句柄/API、准确R7根内准备编译及普通有限桌面窗口。新路径/API/编译/远端写入须确认本合同；这些新增动作NOT_PERFORMED，不把修复方向批准冒充准确范围批准。原产品/native/锁不变，R6 HALTED/UNKNOWN不改判，A9-31保持IMPLEMENTATION_IN_PROGRESS，独立收口/Win7未执行；无提交/系统改变/委派。


### 2026-10-03 — R7精确批准

负责人回复“批准 R7 精确范围及 ADR-0165”，批准[R7合同§2–5](../plans/A9_31_PRODUCT_R1_R7_QUERY_HANDLE_CAPTURE_APPROVAL.md)。仅五精确外部源、新查询/等待API、准确R7准备编译/冻结部署和普通有限桌面窗口；产品/native/锁不改，所有历史UNKNOWN和硬门保留，不提交/改系统/委派/执行Win7。实现和实机结论依实际后续证据。


### 2026-10-03 — R7定向检查和真实普通身份通过，首轮生命周期硬停止

负责人已批准R7合同§2–5及ADR-0165。五外部源完成查询捕获，Node73/19表达式/784闭包、实际PS5.1三解析、275准入、27查询/API、16文件门和22入口/并发PASS；八项ASAR负例按准确字节继承。三compile及首失败全部保留，最终DLL15f05ce0…3c9d6e7d/source7ec6a125…859ab7b和28新目标冻结，784产品/73宿主装配PASS。
Computer Use直接在A9 Builder CMD启动R7；PID78592/creation639266349360687397通过SID1005/Session3/Medium8192/普通非提升/noJob。唯一Boot run c26f1c3b3e2846a7bc4c432c006ecf35通过五项真实产品基础/Full Access表单检查，但尚未到受控断言即在子PID66612/父66864的CreationSessionImage联合判据失败。worker保留UNKNOWN并HALTED，dispatcher停止；后续实际持有该子实例/exit0不能覆盖首观察未知。
[直接报告](../reports/2026-10/a9_31_r7_query_capture_and_snapshot_gate_failure_2026-10-03.md)绑定55文件/6166259 bytes全部hash核验、秘密扫描0命中。首gap缺失比较边界，snapshot调用区间内创建仅为有支持的推断。R7不恢复，正常Boot、同窗口失败后成功复验、后续七组/独立收口/Win7 NOT_PERFORMED。
[R8具体材料](../plans/A9_31_PRODUCT_R1_R8_SNAPSHOT_INTERVAL_APPROVAL.md)和ADR-0166仅Proposed：同五路径、新准确根、时间区间和同实例双观察/准确诊断；具体批准前不实施/编译/写R8。A9-31仍IMPLEMENTATION_IN_PROGRESS；主工作区、产品/native/锁及历史证据保持，无提交/系统配置/委派。


### 2026-10-03 — R8精确执行批准

负责人本轮回复“批准”，批准R8合同§2–4及ADR-0166。仅五精确外部源、新快照区间/同实例双观察和schema2诊断、准确R8根内准备编译/检查/冻结部署及SID1005普通桌面有限窗口；保留R7 HALTED/UNKNOWN及全部硬门，不提交/改系统/委派/执行Win7。原审批合同SHA-256 `744236b70e84c0ad795624e51e453b8ef347641ed073fabfdea77b5f552e83ec`；原始批准记录SHA-256 `51a1b77635b3d354b7e6536c9ecc74e2b26731a140cc5849ae2bd5d71a29c4d8`。实际检查和产品结论待直接证据。


### 2026-10-03 — R8精确执行：普通Boot查询缺口硬停止

负责人本轮回复“批准”，批准R8§2–4及ADR-0166。五外部源完成准确快照区间/同实例双观察/schema2诊断，锁定编译PASS；source97154a59…1c59e1c2、DLL9de64e7d…e67094b7。Node73/19表达式/784、实际PS5.1三解析、275准入、27查询/API、19区间、16文件门、22入口/并发PASS；ASAR八负例准确继承。所有探针首失败保留，不声称已制造两个合法句柄之间的PID复用/不同creation或Session。
Computer Use启动真实SID1005/Session3/Medium/非提升/noJob，dispatcher37244/creation639266379938146705。唯一Boot415b73bf23ba4648b0849e18e74c952b七项产品检查通过，受控断言也执行；worker在cmd PID78328/父Electron77368 OpenQueryHandle返回原生87、creation/exit UNKNOWN，HALTED，不能作为可重试普通失败。55文件/6259483 bytes全部hash一致、秘密扫描0。R8不恢复，正常Boot/同窗口成功复验/后续七phase/独立收口/Win7 NOT_PERFORMED。[直接报告](../reports/2026-10/a9_31_r8_interval_capture_and_short_lived_cmd_failure_2026-10-03.md)保留具体比较值及全部证据。
[R9材料](../plans/A9_31_PRODUCT_R1_R9_SYNC_PROBE_RECEIPT_APPROVAL.md)/ADR-0167只为Proposed：准确只读cmd-ver原spawnSync回执的新证明合同，尚未实施/编译/创建R9。当前源码只能支持来源推断，不能把该cmd具体绑定为已知探测。A9-31仍IMPLEMENTATION_IN_PROGRESS；产品/native/锁、主工作区及历史失败/UNKNOWN保留，无提交/系统改变/委派/Win7。

### 2026-10-04 R9 具体批准与执行起点

负责人回复“批准 R9 §2–4及 ADR-0167”，[R9合同](../plans/A9_31_PRODUCT_R1_R9_SYNC_PROBE_RECEIPT_APPROVAL.md)的原文SHA-256 `8a6ee203efe3e2c14d6afd83ba0e2b54a7a68c240985b6a73a0ace5a25d02c5b`，批准记录SHA-256 `070063d745013b43c8d6f80075245b40a8746940deceee982e18739a7a2e9b8d`。仅五个准确外部测试源及新R9范围，开始实现/检查；原R8 HALTED、历史UNKNOWN和产品source35a19250不改判。不提交、不改产品/native/锁或系统、不委派、不执行Win7。


### 2026-10-04 — R9准入、冻结与退出补充登记通过；普通桌面待启动

按具体批准完成五外部源、新source/DLL/MVID及实际锁定Electron/Node同步cmd-ver准入；原pid58684/status0、真实父kernel身份/快照与当前reader重验通过。Node73+88、Renderer19/784、PS三解析/315schema/27查询/19区间/16文件门/22入口/77回执检查PASS；ASAR8精确继承，不改绑旧报告。准入和检查编排首失败保留。
Master6e2131f0…6340266、受控Boot877845b7…9afb70a、正常退出补充revision e6c6394d…22d7501已冻结；40+8登记文件/实际784产品/73宿主hash及登记PASS。release丢回执/取消竞态补充仅准备检查，真实Core/SQLite/UI退出仍待执行。
[准确报告与交接](../reports/2026-10/a9_31_r9_sync_receipt_freeze_and_desktop_handoff_2026-10-04.md)：SSH通过、A9 Builder Session3 Active；R9无entry/ready/final、零request。Mac锁屏使Computer Use无法启动，已请求解锁；不以管理员/SSH注入替代普通门。八phase/同窗口复验/独立收口/Win7 NOT_PERFORMED，A9-31仍IMPLEMENTATION_IN_PROGRESS；产品/native/锁/历史证据保留，无提交/系统改变/委派。


### 2026-10-04 — R9普通桌面部分证据与编码硬门

按具体批准执行R9，普通SID1005/Session3/Medium8192/非提升/noHostJob；同dispatcher121956/creation639266722749291059受控Boot普通失败后正常Boot8项PASS，Shell22项PASS。编码54项断言通过后，PowerShell132888在SnapshotCreationBoundary因实际creation超过snapshot结束206ticks而HALTED，原未知不以排空后的同实例exit0改判。
[直接报告](../reports/2026-10/a9_31_r9_desktop_partial_pass_and_clock_boundary_halt_2026-10-04.md)及新矩阵保留301文件/30382895bytes、全hash与秘密扫描0、784/73/四输入后飞行PASS；顶层真实exit尚未取得，UNKNOWN。其余五phase/独立收口/Win7 NOT_PERFORMED，任务仍IMPLEMENTATION_IN_PROGRESS，不签DEVELOPER_VERIFIED。
[R10 §2–4](../plans/A9_31_PRODUCT_R1_R10_PRECISE_UTC_CAPTURE_APPROVAL.md)/ADR-0168 Proposed拟仅修外部Win10精确UTC捕获并新根运行。五源/API/Profile准确批准前不实施、编译或远端写入；产品/native/managed锁及全部历史证据不变。无提交/系统/委派/Win7。


### 2026-10-04 R10具体批准

负责人回复“批准”，批准[R10合同§2–4](../plans/A9_31_PRODUCT_R1_R10_PRECISE_UTC_CAPTURE_APPROVAL.md)及ADR-0168。原合同SHA-256 `c388ae5ea1fc3eb73cb28f4de371f8d76db0243a0986d6cce31b9cd38c1da8d3`，原文批准SHA-256 `ef47799d2506546ec7ccee62026a0d677489b7e6b6e0a2adf0414bac15cd30d6`。仅五外部测试源、精确UTC API/V4测试Profile和准确R10准备/固定编译/准入/冻结/普通有限八组；原严格边界与全部硬门保持，不恢复R9，不改产品/native/锁或系统，不提交/委派/执行Win7。实际证据随后登记。


### 2026-10-04：R10 新捕获冻结就绪，普通桌面待启动

R10 §2–4/ADR-0168 已按负责人具体批准执行；新 capture DLL/MVID/精确 UTC、master 和两个不可变 revision 已冻结，当前准确源的本地/Win10 准入及远端产品784/宿主73闭包通过。原始准备返回163文件/3177366bytes逐文件哈希核对。Computer Use 键入/粘贴未进入CMD；普通控制器尚无启动记录，全部八组仍 NOT_PERFORMED，已交付一次性入口。R9 HALTED、首失败和 UNKNOWN 不改；A9-31不升级 DEVELOPER_VERIFIED，Win7不执行。详见 [R10冻结交接报告](../reports/2026-10/a9_31_r10_precise_utc_capture_freeze_and_desktop_handoff_2026-10-04.md)。

## 2026-10-04 R10真实桌面部分通过及产品审计阻断

负责人实际启动R10后，普通SID1005/Session3/Medium/非提升/noJob成立；Boot8、Shell22、编码安全修订70直接PASS。Background run5dee77858e484e51b7380c9bcf9fa701必需归属落盘失败，Windows展示路径与session/owner canonical路径大小写不同，被State字节比较误拒绝；包内原方法/实际DB受控复现及错属反例见[报告](../reports/2026-10/a9_31_r10_partial_pass_and_windows_ownership_failure_2026-10-04.md)。
未派发后续四组；原停止合同证明dispatcher实际exit0，全部143持有树实例退出码已取得。657文件全hash、出口秘密扫描零命中及144实例后飞行完成；raw COMPLETED不是八组PASS。
[本地三路径修复材料](../plans/A9_31_WINDOWS_WORKSPACE_OWNERSHIP_REPAIR_APPROVAL.md)待具体批准，R10不改产品范围继续有效；本任务原Status/分支/白名单不变，无产品修改/提交/新远端写入/委派。A9-31仍IMPLEMENTATION_IN_PROGRESS，独立收口/Win7 NOT_PERFORMED。

## 2026-10-04 三路径修复具体批准及本地检查通过

负责人明确批准[三路径合同](../plans/A9_31_WINDOWS_WORKSPACE_OWNERSHIP_REPAIR_APPROVAL.md)§2–3，并要求共性检查和修复。Windows归属误拒绝及同State文件的managed历史路径查回/POSIX大小写误判已修复，源码差异仅三路径。
[修复交接报告](../reports/2026-10/a9_31_windows_workspace_ownership_local_repair_2026-10-04.md)登记原代码反例、最终State82/Shell117及七模块verify:quick；首夹具失败/旧dist失败保留，生成Runner dist副本保全后恢复原HEAD。
未提交/写远端/改native或managed锁/委派，A9-31仍IMPLEMENTATION_IN_PROGRESS。新源码提交/准确新包和普通桌面复验、独立收口/Win7尚未执行，不签DEVELOPER_VERIFIED，不重绑R10。


## 2026-10-04：归属修复准确源码提交完成；新开发包待具体批准

负责人批准五路径本地提交，准确source为`898ee9459a9b987840e94ddef336556ea58dd389`，父为`35a19250ed6589f6a7ba35b940a784325970c111`；五blob/SHA、提交路径和35个其余修改字节复核通过。原State82/Shell117/verify:quick所测源码与提交一致，没有重复产品检查或改绑旧Windows报告。
[提交记录](../plans/A9_31_WINDOWS_WORKSPACE_REPAIR_SOURCE_COMMIT_APPROVAL.md)与[新包r2本地合同](../plans/A9_31_PRODUCT_R2_LOCAL_PACKAGE_APPROVAL.md)可检索。新包装配尚未获批/执行，无推送/合并/远端写入/原生或锁变更；A9-31仍IMPLEMENTATION_IN_PROGRESS，新包Win10、独立收口与Win7均NOT_PERFORMED。

## 2026-10-04：开发包r2具体批准与本地装配通过

负责人批准[r2本地合同](../plans/A9_31_PRODUCT_R2_LOCAL_PACKAGE_APPROVAL.md)§1–3；从source898ee945在全新干净detached checkout执行原生产者，七模块重编，ZIP d7323ac4…15122c47 / manifest1c5084a4…816b6225。784文件ZIP↔展开树、实际包runtime/Profile/native哈希、包内State修复/JS入口/适配器受控转发和许可证/SBOM检查通过；准备链接忽略首失败保留，原工作区与历史输入/证据保护。
[本地报告](../reports/2026-10/a9_31_product_r2_local_package_2026-10-04.md)集中记录直接本地包证据及原源码测试继承范围；不把Mac模块读取/受控转发写为Windows原生、SQL或桌面PASS。A9-31仍IMPLEMENTATION_IN_PROGRESS，真实新包Win10/独立收口/Win7均NOT_PERFORMED。
[准确Windows执行材料](../plans/A9_31_PRODUCT_R2_WIN10_VALIDATION_APPROVAL.md)仅草案，四个新外部源与新远端根/外部capture准备/普通八phase执行尚未获批；C14不因此增加这些路径。本轮没有源码提交/推送/合并/远端写入/原生或锁变更/R10恢复/委派。

### 2026-10-04：产品r2准确Win10范围批准

负责人回复“批准”，批准[A9-31产品r2 Win10合同](../plans/A9_31_PRODUCT_R2_WIN10_VALIDATION_APPROVAL.md)原§1–5。仅追加以下四个外部测试源路径至本轮C14白名单：

- `.acceptance/a9-31-developer/product-r2/control-scripts/stage-product-r2.ps1`
- `.acceptance/a9-31-developer/product-r2/control-scripts/launch-product-r2-desktop.ps1`
- `.acceptance/a9-31-developer/product-r2/control-scripts/serve-product-r2-desktop.ps1`
- `.acceptance/a9-31-developer/product-r2/control-scripts/product-r2-driver.cjs`

同合同新根准备、固定已有capture字节编译/准入/冻结、普通桌面八phase及取证回收获批；源898ee945和r2包绑定不变。产品/native/锁改动、提交/推送、独立代理及Win7不在批准内；旧R10及证据不修改或恢复。

### 2026-10-04：r2 Win10准备纠错完成，普通入口未启动

[实际报告](../reports/2026-10/a9_31_product_r2_win10_preparation_and_desktop_block_2026-10-04.md)登记本轮准入、准确scope/DLL/master和新两个revision。文件门负例曾读取旧R5批准，原范围错误保留；修正为新根隔离run明确构造错误批准数据，16项实查通过，不改变原门。固定四执行源/master/DLL字节未变，新metadata/checks/registration绑定修正后的准备证据并通过目标冻结校验；旧r1登记保留但不再派发。
UU远控画面刷新但目标输入未响应，普通dispatcher没有claim/start/ready/final、请求0、token未取得。依本轮合同保持普通入口门，八phase及同控制器失败后成功复验/独立收口/Win7全部NOT_PERFORMED，不签DEVELOPER_VERIFIED。1067文件清单与208返回文件/859保留输入逐hash核对；首错、两显式junction负例、原工作区与历史保留。无提交/推送、产品/native/锁或系统修改、R10恢复或委派。


### 2026-10-04：负责人协助手工入口，实际启动待核验

负责人随后表示“如果远控输入不行，我可以手工参与。”据此允许在WIN-2JQ66JE4HTQ的A9 Builder普通桌面由负责人打开全新非管理员CMD，一次执行同一冻结r2入口命令；仅替换§4的输入操作者，不变更源/包/master/revision、SID1005/Session3/Medium/非提升/noHostJob、120分钟/16请求及全部安全门。后续固定派发/取证仍由代理完成。旧窗口残留R10文本不执行，旧控制器不恢复；原批准§1–5和历史输入保留。

最近只读检查UTC 2026-10-04T06:30:43.8945785Z仍无claim/start/ready/final、正式请求0，普通token未取得；手工入口待实际启动，八phase、独立收口及Win7均NOT_PERFORMED。入口启动须先用实际进程实例/token核验，再按受控Boot失败→真实整树退出→同dispatcher正常Boot→Background最短链路的顺序推进。证据为product-r2/manual-assistance-owner-steering-r1.json和manual-entry-watch-063043241315.json。


### 2026-10-04：r2普通执行通过最短后台，永久删除确认失败并停止

负责人一次手工普通入口实际核验通过；同dispatcher受控Boot失败/真实树退出后正常Boot8项PASS，Background最短28项PASS。完整后台首错游标夹具误取历史句柄，修正匹配当前handle后通过相关游标/3-4/Stop项，但永久删除确认场景未批准即真实派发Remove-Item。SQLite+包内Policy证明产品缺口，完整Background FAIL；六个下游phase、独立与Win7 NOT_PERFORMED。固定stop取得dispatcher exit0，112个dispatcher树实例/合并116个持有实例退出与后飞行闭合；479新增文件43568598bytes回收核验，原1067文件不变。当前统一矩阵为product-r2/win10-evidence-matrix-r4.json；raw COMPLETED/Background标记只表示停止/最短范围。r2已停止不可恢复，A9-31仍IMPLEMENTATION_IN_PROGRESS。

实际报告：[r2执行与Policy失败](../reports/2026-10/a9_31_product_r2_win10_execution_and_policy_failure_2026-10-04.md)。具体三路径本地修复提案：[Shell删除Policy修复](../plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)，DRAFT_NOT_APPROVED；不扩大本轮已执行授权，不改源码/包/native/锁，不提交/推送/委派。


### 2026-10-04：Shell永久删除Policy三路径本地修复批准

负责人回复“审批同意并检查有无类似问题”，批准[准确修复材料](../plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)原§1–3，基线898ee945、本分支及APPROVED_FOR_IMPLEMENTATION保持。C14仅追加`src/core/src/policy.ts`、`src/core/tests/policy.test.ts`、`src/core/tests/a9-background-tools.test.ts`：非Git永久删除分类及确认/拒绝/绑定零派发回归。ADR-0170登记尽力识别与完整原命令绑定；相邻高影响分类仅只读核查，范围外实现另报。批准离线Node20.17.0本地编译、Policy/Core八组/Shell九组、verify:quick/docs:check/diff检查；原native/锁/r2包及已停止根保持。未授权新包/远端/提交/推送/合并/委派/独立/Win7；A9-31仍IMPLEMENTATION_IN_PROGRESS。


### 2026-10-04：删除本地修复与相邻核查，Core旧夹具待补批

[本次报告](../reports/2026-10/a9_31_shell_delete_policy_local_repair_and_adjacent_audit_2026-10-04.md)：三路径未提交diff，Policy113/后台Core10/Shell九组117/七模块静态PASS；Core合同总302 PASS/1 FAIL，R1-03旧rm自主执行假设与新ASK冲突。第四路径`src/core/tests/a9-verification-evidence.test.ts`一行copy替换在修复材料§5准备，未批准/未应用，不排除suite或放开rm。16项相邻纯求值另确认发布/系统8漏确认2误确认，只报告未实施。原r2统一矩阵/包/停止根、历史证据及native/锁保持，24个tracked生成dist保全后恢复。A9-31仍IMPLEMENTATION_IN_PROGRESS，不签DEVELOPER_VERIFIED，新包/Windows/独立/Win7 NOT_PERFORMED。


### 2026-10-04：第四测试路径精确补批

负责人针对[Shell删除修复材料§5](../plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)及一行准确补丁回复“批准”。C14仅追加`src/core/tests/a9-verification-evidence.test.ts`，将R1-03的rm file.txt替换为copy file.txt copied.txt；保留全部断言和原验证信用失效目的。补批覆盖原Core九组及文档/diff复验，产品源码/构建未变时继承本轮Shell117与七模块静态。原首失败、包/远端停止/历史UNKNOWN保持；不扩大到发布/系统实现、提交/打包/远端/独立/Win7。


### 2026-10-04：第四fixture补批完成，本地删除修复必需检查闭合

 批准的一行copy替换已应用，Core合同八组加Policy九组303项PASS、自然退出；产品Policy/编译字节及前三路径未变，按准确批准§5继承上一轮Shell117和七模块静态。原302 PASS/1 FAIL和所有首错/原r1记录保持。四路径diff未提交；本次报告§7及fixture-supplement-r1集中登记实际批准/哈希/当前结果。发布/系统8漏确认2误确认仍只读发现，A9-31仍IMPLEMENTATION_IN_PROGRESS，不签DEVELOPER_VERIFIED；新包/Windows/独立/Win7 NOT_PERFORMED，r2/R10不恢复。


### 2026-10-04：负责人授权确认同类高影响缺口后本地修复

负责人要求“检查同类问题，如果确实存在请修复”。依[准确材料§7](../plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)复核确认8漏确认/2误确认，另确认长/复合Shell审批摘要不可完整看见操作。本轮C14准确范围为`src/core/src/policy.ts`的非Git发布/明确全局安装及reg/net user/sc/icacls系统家族分类、`src/core/src/a9-agent-loop.ts`的完整command/显式cwd可见摘要，以及`src/core/tests/policy.test.ts`、`src/core/tests/a9-background-tools.test.ts`反例与等待/拒绝/变化绑定零派发；前一轮第四夹具保持。ADR-0171 Accepted，当前HEAD898ee945/分支/APPROVED_FOR_IMPLEMENTATION不变。先红后修、七模块构建后消费当前输出，直接跑Core九组/Shell九组及docs/diff。原证据/dirty/包/锁保持；不执行系统/发布/删除命令，无新依赖、Runner/State/native/IPC格式变化。本地证据根shell-high-impact-policy-repair-r1；Windows/包/独立/Win7尚NOT_PERFORMED，不批准提交/打包/远端重启或恢复R10。Phase-Gate保持IMPLEMENTATION_IN_PROGRESS。


### 2026-10-04：同类高影响本地修复完成

[最新报告](../reports/2026-10/a9_31_shell_high_impact_policy_repair_2026-10-04.md)登记原8漏确认2误确认及追加全局/注册表/服务缺口修复，审批summary完整显示原command/显式cwd并保留Git信息。当前Core九组397 PASS、Shell九组117 PASS、七模块静态/构建PASS；22项实际编译Policy定向零不符。旧动态执行门保留，拒绝/错digest/挂起参数变化零派发。本轮准确四路径增量/相对HEAD五路径身份及444编译文件已保全，24个本轮改变的tracked dist恢复原字节。原红/中间失败/r2 FAIL与停止根不改。源码NOT_COMMITTED，Windows新包/实际UI/Win7/独立NOT_PERFORMED；任务保持IMPLEMENTATION_IN_PROGRESS，不签DEVELOPER_VERIFIED。


### 2026-10-04：再核查当前源码与Win10准入

负责人要求“再次进行检查，保证win10实机验证通过”。当前898ee945/分支/APPROVED_FOR_IMPLEMENTATION保持；新包装配仍须准确源码提交和固定产物身份，旧r2/R10不恢复。再次纯Policy核查确认4个明确静态Shell变量调用的同类漏确认（npm/sc/reg，PowerShell/CMD），并发现--后的执行歧义；在已有§7四路径和ADR-0171的尽力识别/歧义保守确认范围内追加修复与必要回归，不扩大模块、API或权限。原报告/原始PASS及首失败保留，形成新证据win10-policy-readiness-r1。Win10只读SSH确认普通Session3 Active、锁定系统工具哈希未变；C盘首次不足2GiB，最新只读复查约4.69GiB，准备门随执行前实查判断。当前两次stdin内存准备探针传输超时，没有取得普通产品或新包PASS，不继续此传输重试；新源码提交/新包/新根普通八phase材料待具体绑定批准，未执行。

### 2026-10-04：当前变量执行修复与417/117本地复验

[再核查报告](../reports/2026-10/a9_31_policy_win10_readiness_recheck_2026-10-04.md)登记变量npm/sc/reg及发布歧义补修，第一版412/117后追加共同边界确认CMD IF、双引号子表达式和${变量}三漏报，均修复并保留首结果。当前Core九组417/417、Shell九组117/117、七模块静态编译PASS，24实际编译定向零不符；拒绝/错误绑定/变化参数零派发。444当前编译文件保全后只恢复本轮24 tracked dist原字节。准确五路径快照/补丁以win10-policy-readiness-r1的proposed-inputs-r2登记，旧397版及所有原始失败不改绑。

最新只读Win10 C盘6543396864bytes、新r3根不存在、旧指定Electron路径零进程；尚无新包普通token/真实审批UI/SQLite/八phase证据。一次[C1/C2/C3准确材料](../plans/A9_31_POLICY_R3_SOURCE_PACKAGE_WIN10_APPROVAL.md)绑定精确五路径提交、干净新r3包、新根四源/固定取证/普通八phase及有界夹具修复；当前DRAFT_NOT_APPROVED，源提交/新包/新根写入尚未执行。任务继续IMPLEMENTATION_IN_PROGRESS，不自签独立或DEVELOPER_VERIFIED；Win7未执行，r2/R10不恢复。

### 2026-10-04：C1–C3具体批准与新r3执行登记

负责人回复“批准”，授权准确材料原C1–C3，原全文SHA37cd8d4b7d5bea326ed225a013e2812e7ea8e6c2067e6b3ad07e317ddf9bb0cc及owner批准存product-r3。C1仅五路径已提交为ebda91123e62b225c3fd104c9c9b564a4b61c466，父898ee945；五blob逐hash等于417/117本地所测字节，其他46个dirty不变，无推送/合并。

C14在实施前仅追加四个新外部源：`.acceptance/a9-31-developer/product-r3/control-scripts/stage-product-r3.ps1`、`launch-product-r3-desktop.ps1`、`serve-product-r3-desktop.ps1`、`product-r3-driver.cjs`（后三文件同目录）。允许差异仅本次source/新包/新根/master/批准绑定、既有控制框架内本次Policy审批及必要普通夹具断言；安全协议、取证API/判据和原四源不改。C2新checkout/package、C3准确新普通Win10根、固定C#编译及八phase/预算/停止按已批准材料继续；不恢复r2/R10、不重编native、不改锁/系统/账户、不委派。正式Win7/独立及DEVELOPER_VERIFIED裁决未执行。

### 2026-10-04：r3干净包装配与新Win10能力准入

[统一r3执行报告](../reports/2026-10/a9_31_product_r3_package_and_win10_execution_2026-10-04.md)登记C1源ebda911、C2新ZIP d951a89…ac74b/manifest0060fff…57a68及直接784闭包/24包内Policy纯求值；不重编native或改锁。C3准确新根已准备，新DLL/MVID绑定当前source，固定系统工具/API不变；实际查询/区间/文件/回执/336 schema、三版驱动Node16及三revision stage全部通过。普通Desktop输入未进入Windows，已按原手工协助范围请求一次新入口启动。产品八phase/真实审批UI/SQLite/普通token尚NOT_PERFORMED；准备证据不升级产品、独立、负责人或Win7结论。r2/R10不恢复，任务仍IMPLEMENTATION_IN_PROGRESS。

### 2026-10-04：r3普通入口与后台功能证据、预算HALTED

[统一报告](../reports/2026-10/a9_31_product_r3_package_and_win10_execution_2026-10-04.md)及product-r3/win10-evidence-matrix-r3.json为当前状态。dispatcher76908准确SID1005/Session3/Medium/非提升/noJob；同窗口受控Boot失败/7实际退出后正常Boot8、后台最短28直接PASS。完整后台首轮直接IPC拒绝绕过Renderer导致发送禁用，SQLite拒绝/审计已落盘且40个dispatcher持有实例退出；同四源局部夹具修复用真实UI拒绝、定向检查及新不可变revision3bd2e330…13fee。复验137项断言包含十组高影响各6项真实pending/完整命令cwd/错误绑定/实际UI拒绝零派发PASS。随后真实原生退出对话框未确认，9分钟phase/12分钟worker固定预算到期，直接LIFECYCLE_PHASE_TIMEOUT/WORKER_TIMEOUT和HALTED_UNKNOWN_RETAINED，原持有树仍4/5实例alive，最终exit尚待手工退出操作与取证。立即停止下游六phase；137断言不替代阶段PASS，不恢复HALTED实例/master，不签DEVELOPER_VERIFIED/独立/Win7。源码/产品/native/锁不变，r2/R10/所有首FAIL与UNKNOWN保留。

### 2026-10-04：r3点击后退出拒绝、可接受性与正常关闭夹具修复

[当前统一报告](../reports/2026-10/a9_31_product_r3_package_and_win10_execution_2026-10-04.md)及product-r3/win10-evidence-matrix-r4.json为最新入口。负责人已点击并报告“无法确认安全退出”；原controller/dispatcher最终HALTED/held_tree_ended=false，4个Electron同creation当前仍活。ready启动回执丢弃的预期反例证明零输出/成功及下游拒绝，准确helper/root/child实际exit0/1/1、SQLite完整性ok但cleanup_required保留。预期错误可以记故障边界，不能把未结束树当正常退出PASS。

仅C3既有driver修复正常关闭前无残留及will-quit后写PASS；driver2513c064…5595、revision e5222304…b281，本地/目标Node16语法/90/88和stage闭包通过，旧运行/输入不覆盖，未向HALTED入口派发。501文件/10713343bytes完成逐hash回收和零秘密扫描；活跃DB三件另行稳定只读返回，浏览器独占锁目录完整后飞行未完成。远控/普通夹具和读取问题可记录后继续独立工作；当前真实退出硬门只暂停依赖它的六phase，不削弱身份/安全/审计/生命周期。

[后续准确R1–R2材料](../plans/A9_31_PRODUCT_R3_ISOLATED_READY_FAILURE_RETRY_APPROVAL.md)为PENDING_OWNER_APPROVAL：精确残留实例终止与取证、同r3包新根和ready负例独立测试实例；新四源C14尚不登记为实现获批，新终止/写入/普通执行NOT_PERFORMED。产品/native/锁不变，所有历史FAIL/UNKNOWN保留；不恢复r2/R10，任务仍IMPLEMENTATION_IN_PROGRESS，不签DEVELOPER_VERIFIED/独立/Win7。

### 2026-10-04：R1–R2批准与新四源C14登记

负责人回复“批准”，绑定[准确R1–R2材料](../plans/A9_31_PRODUCT_R3_ISOLATED_READY_FAILURE_RETRY_APPROVAL.md)原全文SHA256 affedbc6b1ff3a24243698ac3c795bb8ed3356b1fece4b49644e76961db4d1eb。仅准确4个旧Electron实例取证/受控结束、同r3包新Product-R3-20261004-R2根及预期ready故障隔离续验。实施前C14追加新四源：`.acceptance/a9-31-developer/product-r3-retry-r2/control-scripts/stage-product-r3.ps1`、`launch-product-r3-desktop.ps1`、`serve-product-r3-desktop.ps1`、`product-r3-driver.cjs`（后三同目录）。只复制当前r3并改新根/批准/master绑定及已明确普通关闭/ready专用实例规则；产品/native/C#/锁/安全判据不改，原build批准保持准确字节继承。原HALTED不恢复、历史证据不改判；本次普通续验结果以新证据为准，不签独立/Win7。

### 2026-10-04：R2原生选择真实回执、终态夹具修复与HALTED保留

第三StopExit最短run f3158d545b6146da986b64bf74e092f5真实原生选择response=0、will-quit/main exit0，SQLite当前handle事实stopped/integrity ok；夹具错从ownership事件读取lastProbeStatus导致原STOP_PERSISTED_TERMINAL FAIL及controller/dispatcher HALTED。原错误不改判；245持有实例均实际结束，无unknown/unresolved/drain错误，当前dispatcher PID只读不存在不补签exit。1186 runtime文件96785128bytes完整回收、逐hash/size与秘密扫描零不符。

同一R2已批准四源内修复正常关闭判据，Stop绑定当前事实表终态，Release绑定当前表released及同owner/request/releaseId intent+receipt，不注入原生选择、不延长120秒、不改产品/native/三PS/SYNC/九字段/八phase。固定修复driver ec5736fe…63c5ce83、revision3b0b61fa…3152a37；直接目标Node16/128/88/stage及准确函数对本轮真实SQLite返回事实重放通过，未冒充新的普通StopExit/ReleaseExit/Recovery PASS。统一报告、矩阵r6及首失败/旧冻结字节全部保留。

[准确新R3续验材料](../plans/A9_31_PRODUCT_R3_FRESH_EXIT_VALIDATION_APPROVAL.md)仅DRAFT_NOT_APPROVED；新根/四源C14/普通执行尚未获批，未登记为实现授权或创建新根。原R2 HALTED不恢复，任务仍IMPLEMENTATION_IN_PROGRESS，不签独立/DEVELOPER_VERIFIED/Win7。

### 2026-10-04：新R3隔离根续验批准与实施前四源C14登记

负责人回复“批准”，批准[新R3准确材料](../plans/A9_31_PRODUCT_R3_FRESH_EXIT_VALIDATION_APPROVAL.md)原§1–3，原文SHA256 bb2d76a525a53c11216ba887230c71b0c648fef7d0556bd259ae2524d5279269。当前HEAD ebda911/分支codex/a9-31-background-tools及APPROVED_FOR_IMPLEMENTATION保持。实施前C14只追加 `.acceptance/a9-31-developer/product-r3-retry-r3/control-scripts/stage-product-r3.ps1`、`launch-product-r3-desktop.ps1`、`serve-product-r3-desktop.ps1`、`product-r3-driver.cjs`（后三同目录），从R2已检查四源复制，仅新根/批准/master绑定及已有正常退出判据/真实原生回执差异。新根784产品/73宿主及固定capture字节继承，不重编产品/native/C#，保持九字段/八phase/SYNC和所有预算。普通新根八phase、回收/秘密扫描/后飞行按准确材料执行，同范围夹具有界修复不重复求批；HALTED不恢复，第四新根未授权。历史FAIL/UNKNOWN/dirty/包与证据保留，无提交/推送/合并/删除/系统账户改动/委派/独立/Win7。


### 2026-10-04：R3准确残留收尾与R4实施前四源C14登记

负责人回复“批准”，绑定[R4准确材料](../plans/A9_31_PRODUCT_R3_LATE_JOURNAL_R4_APPROVAL.md)原§1–3，原文SHA256 c8a4908c407bd62c6341eb85729be2d7b546cf3e41b74161c1f5f5847fa269ca。当前ebda911/分支及APPROVED_FOR_IMPLEMENTATION保持。允许材料列明4个R3实例按PID/creation/Session/镜像/命令和持有句柄准确收尾及全回收；不改判原FAIL。C14追加`.acceptance/a9-31-developer/product-r3-retry-r4/control-scripts/stage-product-r3.ps1`、`launch-product-r3-desktop.ps1`、`serve-product-r3-desktop.ps1`、`product-r3-driver.cjs`（后三同目录）；仅R4绑定和已验证终态日志修复。先最短真实退出链路，再新根完整八phase；120分钟/16请求/120秒选择及所有硬门保持。HALTED不恢复，第五根不授权；无产品/native/C#/锁/系统改动、删除、提交、推送、委派、独立或Win7。


### 2026-10-04：短命conhost最小取证诊断授权

负责人针对[准确诊断材料](../plans/A9_31_CONHOST_CAPTURE_DIAGNOSTIC_APPROVAL.md)回复“解决”，授权§1–3，原文SHA256 d624c814431d8321f9a6db04d007b65ff389e8f7d3b9c7edbff9038968346d80。当前ebda911/分支与APPROVED_FOR_IMPLEMENTATION保持；C14仅追加`.acceptance/a9-31-developer/product-r3-retry-r4/diagnostic-sources/conhost-event-probe.cs`和同目录`conhost-event-probe.ps1`。独立Win10测试组件、固定编译器/参考及≤3次60秒探针，Administrator准确自有临时事件会话、过滤目标/零丢事件/可靠停止与完整回收。原产品/固定capture/控制器/SYNC不改；不恢复R4、不创建第五根、不自签验收；其余边界按原材料。

同日已执行原三次诊断；v3取得12 cmd/12 conhost完整事件，零丢失且停止，26项纯回放通过，38文件完整回收。精确创建FILETIME和完整映像仍NOT_PROVEN，不能据此续跑R4或签发Win10 PASS。[manifest补证材料](../plans/A9_31_CONHOST_MANIFEST_FIELDS_APPROVAL.md)/ADR-0172仅Proposed；新两源未加入实现白名单，新API、探针及第五根未获批。任务仍IMPLEMENTATION_IN_PROGRESS，实际证据见[r3统一报告](../reports/2026-10/a9_31_product_r3_package_and_win10_execution_2026-10-04.md)。

### 同日manifest字段诊断批准与实施前登记

负责人回复“批准”，绑定[补证材料§1–3](../plans/A9_31_CONHOST_MANIFEST_FIELDS_APPROVAL.md)原文SHA256 1f61d8b26a935bca8925c4273bf146172c0546f8907e66dd93f9a4a7fac15171。在当前ebda911/codex/a9-31-background-tools下，C14仅新增`.acceptance/a9-31-developer/product-r3-retry-r4/manifest-diagnostic-sources/conhost-manifest-probe.cs`和同目录`conhost-manifest-probe.ps1`；仅独立Win10测试、准确新子目录和≤3次60秒探针、固定12个cmd-ver上限及真实字段/零丢失/自有会话停止硬门。新增三个API按C15/C16登记后实施。ADR-0172普通proof接入仍Proposed，不批准控制器、第五根、产品/native、系统配置、提交/推送/删除、委派或Win7；原经典诊断/失败/UNKNOWN及所有证据保留。

同日三次预算已用完：v1固定父字段偏移首败保留，v2最短/ v3十二组精确manifest字段直接通过；36项实际报告反例、零丢失/会话停止、26文件完整回收通过。负责人要求交接，[最新handoff](../reports/2026-10/a9_31_manifest_diagnostic_handoff_2026-10-04.md)给出准确证据和下一步。新[R5方案](../plans/A9_31_MANIFEST_PROOF_R5_EXECUTION_APPROVAL.md)尚未批准，六源未列入C14、未实现或部署；普通产品、独立、Win7不因此PASS。

### 2026-10-04：R5 manifest proof接入批准与实施前六源C14登记

负责人回复“批准”，绑定[R5接入与续验合同r3](../plans/A9_31_MANIFEST_PROOF_R5_EXECUTION_APPROVAL.md)§1–5及ADR-0173，原文SHA256 540a7c614482cb13db57c45855531f5fc1898ad50b66e249857287c1066ed0d5（r1 ee801e62…、r2 8d1dd73d…均为历史版本，不是被批准版本）。当前HEAD ebda911/分支codex/a9-31-background-tools及APPROVED_FOR_IMPLEMENTATION保持。C14仅追加六个新外部源：`.acceptance/a9-31-developer/product-r3-retry-r5/control-scripts/stage-product-r3.ps1`、`launch-product-r3-desktop.ps1`、`serve-product-r3-desktop.ps1`、`product-r3-driver.cjs`（后三同目录）及`.acceptance/a9-31-developer/product-r3-retry-r5/event-sources/manifest-process-observer.cs`、`launch-manifest-observer.ps1`。四控制源仅以R4已检查版本为基础加R5绑定、事件组件准入/闭包、准确conhost proof读取及§5.1最终收尾门；观察器由已验证manifest两源提炼，不带入诊断的cmd启动功能。D1（准入含固定PowerShell组，总启动≤12）、D2（默认不预授权其他映像类别）、D3（仅Recovery双根，ReleaseExit由3个释放实例钉住信号管理）按合同§5.2/§5.4/§5.6执行。

不授权产品/native/锁/capture修改、系统/账户/ACL/服务/计划任务改动、删除、强制结束旧实例、提交/推送/合并/发布、委派、独立验收、Win7或第六根；R4 HALTED不恢复，旧R10不恢复，任务仍IMPLEMENTATION_IN_PROGRESS，不签DEVELOPER_VERIFIED。新观察器source/EXE/MVID/pin编译后补录；普通八phase与admission结果以实际证据为准。

### 2026-10-04：R5观察器实际构建、准入三轮通过与磁盘空间阻断

远端新根`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261004-R5`已创建（原不存在，输入逐hash复制）；R5本地根`.acceptance/a9-31-developer/product-r3-retry-r5`。观察器v1源b3a02d8e0dd679e799359918a04dff4fc68f1a00d4e7605d646ab6c02444ad34编译通过（固定csc 4.8.9232.0，EXE f7bf41b5da46039c294b78e7d53495025c80079523c591b78edc0390de623209，MVID 85e3b159-2a1e-49cf-8832-17e56496fa35，38项纯回放自检通过）。准入r1a（1 cmd+1 PowerShell）与r1b（8 cmd+4 PowerShell）均直接通过：每个conhost得到`MANIFEST_CONHOST_INSTANCE_EXIT_V1`证明，零丢失、会话停止、无意外后代。
评估发现ordinary账户无法打开管理员观察器进程信息，故v2仅增加`observer-heartbeat.json`心跳文件（控制器只读其mtime），v2源b949ba520eb103548cfd08a578d76df1d3d48e46089045188dc7b4b1df112a7d、EXE 21cd35311f31bb5de37f34623baed6050dceeb1a7edc3484a121b75498ba8d80（34304 bytes）、MVID 160fb51d-083c-49fb-89fc-d364eaa1a7f0、pin f4db96d49dd19667fb8528d0b6382d2a661fe23da0b87e02d0baaae8a26e31f2，同样38项自检通过，准入r2a（8 cmd+4 PowerShell）通过：12根12证明、48事件、零丢失、会话停止、无意外后代。三轮准入预算已用完；v1保留不改判，v2为R5冻结的观察器。
控制脚本由R4派生并加入观察器接入（Win10 PS5.1解析零错误，driver仅替换根绑定、与R4其余字节一致）。远端R5根已展开784产品/73宿主文件并通过PS解析。**阻断**：C盘空闲仅约2.19GB，贴近stage首次运行的2GiB硬门；负责人已选择由其自行清理旧根副本，代理不删除任何文件；确认空闲≥3GB前不上传冻结物、不继续准入。仍未启动普通phase，DEVELOPER_VERIFIED未签。

### 2026-10-05：R5普通桌面部分证据、Recovery重启失败与入口HALTED

负责人启动R5普通入口（直接核验SID1005/Session3/Medium8192/非提升/noJob）。首个请求因入口窗口被控制台选择模式挂起未被接单，观察器按750秒预算自行收尾（零事件/零丢失），请求经负责人批准撤回，原dispatcher经Esc恢复；原失败如实保留。此后逐请求先启动观察器并核验ready，再发请求，终态后由代理发停止信号并核对终态：受控Boot（夹具故意失败，整树8实例全部结束）、普通Boot PASS（9项）、**StopExit PASS（15项，含真实原生选择与终态持久化，选择耗时21.1秒，响应0）**、**ReleaseExit PASS（32项，选择耗时9.7秒，响应1，整树36实例结束，1个cmd 87缺口由原SYNC通道解析）**，各phase观察器终态均核对通过（18/18/34/82事件，零丢失，会话停止），四次完整返回逐size/SHA与秘密扫描零不符。
**Recovery失败**：崩溃实例以退出码93结束并确认整树结束后，重启的Electron（pid 107280）未在2分钟内退出（`LIFECYCLE_RESTART_TIMEOUT`），负责人报告出现JavaScript报错；dispatcher随后`LIFECYCLE_PINNED_TREE_UNKNOWN`并HALTED，累计5请求。driver中`driver-journal.jsonl`以`'wx'`无条件创建，而重启实例与崩溃实例共用同一证据目录，据此高度怀疑重启实例在启动时EEXIST失败（待负责人提供对话框原文确认，未直接证实）；该Recovery重启路径此前从未在Win10实际运行过。新conhost proof在本次所有phase均未被真实缺口触发。HALTED入口不恢复，其余六个phase（后台最短/完整、ready负例、Shell、EncodingSecurity、FailureBoundaries）未执行，整批Win10仍NOT_PASS，DEVELOPER_VERIFIED未签。继续需要新根与具体批准（第六根不在现有批准内）。矩阵见`product-r3-retry-r5/win10-evidence-matrix-r5.json`。

### 2026-10-05：R6新根具体批准材料（仅草案）

[R6合同草案](../plans/A9_31_R6_RECOVERY_RESTART_AND_REMAINING_PHASES_APPROVAL.md)（SHA256 c608eff8adce88229f869b315b3754e786c3c36d8655e1e7f600a1ca8c1a77ef）DRAFT_NOT_APPROVED：新根修复Recovery重启实例的journal文件冲突（疑driver第118行`'wx'`，待负责人提供JS报错原文确认）并续验八phase，Recovery放最后。六源未列入C14、未实现、未部署，不构成第六根授权；R5入口HALTED不恢复，整批Win10仍NOT_PASS，DEVELOPER_VERIFIED未签。

### 2026-10-05：R6草案r2记录D1–D4裁决（仍未批准）

负责人裁决D1=方案B（八phase全部重跑，共10请求）、D2同意Recovery放最后、D3/D4确认；[R6草案r2](../plans/A9_31_R6_RECOVERY_RESTART_AND_REMAINING_PHASES_APPROVAL.md)SHA256 97d402a37c7f0b8876d2a8c0bb56cedf4ac997c57556fa6f6bda9da5e6a7826f仍DRAFT_NOT_APPROVED，前置P0（JS报错原文）未取得，未批准、未实现。

### 2026-10-05：R6批准与实施前六源C14登记

负责人回复“批准”，并此前裁决D1=方案B（八phase全部重跑，10请求）、D2 Recovery放最后、D3/D4确认，绑定[R6合同r2](../plans/A9_31_R6_RECOVERY_RESTART_AND_REMAINING_PHASES_APPROVAL.md)，原文SHA256 97d402a37c7f0b8876d2a8c0bb56cedf4ac997c57556fa6f6bda9da5e6a7826f（r1 c608eff8…为历史版本）。**P0已满足**：负责人提供的报错框原文为`Error: EEXIST: file already exists, open '...\driver-journal.jsonl'`（`Object.openSync`，driver模块加载期），原因已直接证实。当前HEAD ebda911/分支及APPROVED_FOR_IMPLEMENTATION保持。C14仅追加六个新外部源：`.acceptance/a9-31-developer/product-r3-retry-r6/control-scripts/stage-product-r3.ps1`、`launch-product-r3-desktop.ps1`、`serve-product-r3-desktop.ps1`、`product-r3-driver.cjs`（后三同目录）及`.acceptance/a9-31-developer/product-r3-retry-r6/event-sources/manifest-process-observer.cs`（与R5字节相同的拷贝）、`launch-manifest-observer.ps1`（仅根常量）。
批准后静态扫描发现重启实例路径上**第二处同类冲突**：driver第318行对所有phase（含重启实例）执行`shot('boot')`，以`'wx'`写`boot.png`，崩溃实例已写同名文件；另`post-final-event-N.json`亦同名风险。二者属合同§2.1(c)“静态扫描全部固定名`wx`创建点”范围内的同范围修复，一并以重启专用文件名处理，仍不改断言/真实对话框/SYNC/九字段/八phase。不授权产品/native/锁/capture修改、系统改动、删除、强制结束旧实例（含107280）、提交/推送/合并/发布、委派、独立验收、Win7或第七根；R5 HALTED与全部旧证据不改判。

### 2026-10-05：R6实施、准入与冻结通过，普通入口待启动

R6远端根已创建并展开784产品/73宿主文件。观察器C#源与R5字节相同，在R6固定csc重编（EXE 0037e9e304f0aaa1da8bd0bbebcd9835815fec2b383e920e624dcaefb9f81d53，MVID b7d8e629-3c51-4bac-bdff-c48adeef75b2，38项自检通过），准入两轮通过（1+1与8+4，各取得全部conhost proof，零丢失、会话停止、无意外后代）。控制脚本由R5派生：driver仅新增`restartAware/shotFileName`并改写journal与截图两处文件名调用，另新增`--restart-evidence-self-test`（本地Node20与Win10锁定Node16.17.1×4变体均28项通过；回退journal修复、回退截图命名、在`recoveryRestore`中加入`create()`三个负向对照均使其失败）；serve仅新增`Assert-ObserverReady`的events文件读取检查；stage/launch归一化后与R5零差异。既有自检（55/5/14硬门、SYNC 88项、late-journal）输出与R5一致。
定向检查：schema336、api、interval、entry、files-scope、sync-actual（首次因探针时序竞争`PREFLIGHT_NO_PRECISE_ACTUAL_ASSOCIATION`失败并保留，换fresh run id后通过）、sync-current、Node16×20行（含重启自检）、package-held、manifest绑定38项均通过；4个revision stage完整闭包PASS，根671MB。master `70578072352f2cb73f5d7b6a6961233355967790d1f0319c0a1a0ad20e1913ab`。普通入口尚待负责人启动，无普通phase证据，整批Win10仍NOT_PASS。

### 2026-10-05：R6普通桌面部分证据与控制器父进程种类缺陷、入口HALTED

负责人启动R6普通入口（直接核验SID1005/Session3/Medium8192/非提升/noJob）。逐请求先启动观察器并核验ready（含心跳与events文件的普通账户真实读取），终态后由代理发停止信号并核对：Boot PASS（9项）、Background短PASS（29项）、Background完整PASS（133项，1个查询缺口由原SYNC通道解析）、ready专用负例按设计预期失败（`A9_EXPECTED_READY_FAILURE`，halt=false，16项0失败，隔离退出码94，整树16实例结束）、Shell PASS（29项），各phase观察器终态核对通过，五次完整返回逐size/SHA与秘密扫描零不符。
**EncodingSecurity失败并使入口HALTED（累计6/16请求）**：driver 62项均通过后遇`conhost.exe` OpenQueryHandle原生错误87（pid 135016，父为被持有的cmd 75368），新conhost proof**未能解析**，`LIFECYCLE_OBSERVED_CHILD_NOT_PINNED:135016`→`LIFECYCLE_CAPTURE_FAILED`，无controller-final，dispatcher `LIFECYCLE_PINNED_TREE_UNKNOWN`。**根因为控制器缺陷（我方实现）**：`Resolve-ManifestObservation`用持有树`Binding.Image`判断父进程种类，该值是NT设备路径`\Device\HarddiskVolume3\Windows\System32\cmd.exe`而非`C:\Windows\...`，故`kind`为空直接返回false；38项定向检查的夹具同样使用了`C:\`格式，未能暴露。观察器记录完整（conhost Start/End、退出码0），用该次真实缺口数据对`ValidateConhostProof`只读回放得到有效`MANIFEST_CONHOST_INSTANCE_EXIT_V1`（`r6-encoding-gap-replay.json`），故proof设计成立，缺陷仅在控制器种类判断。这是新proof在普通环境第一次被真实缺口触发，属未解析而硬停，未放宽任何判据。
未执行：EncodingSecurity重跑、FailureBoundaries、StopExit、ReleaseExit、Recovery。Recovery重启文件名修复虽已通过Node16×4自检，仍从未在Win10真实重启。HALTED入口不恢复，修复需新根与具体批准（D4未预授权第七根）。矩阵见`product-r3-retry-r6/win10-evidence-matrix-r6.json`。整批Win10仍NOT_PASS，DEVELOPER_VERIFIED未签。

### 2026-10-05：R7新根具体批准材料（仅草案）

[R7草案](../plans/A9_31_R7_CONTROLLER_PARENT_KIND_REPAIR_APPROVAL.md)（SHA256 73646d58787a1fee7062a74bddfffb37114b1a7d4e816ed8cbb164d62ab5fa4e）DRAFT_NOT_APPROVED：新根只修控制器`Resolve-ManifestObservation`的父进程种类判断（持有树Binding.Image为NT设备路径，改用ready记录的c_device_mapping拼精确设备路径比较），并重跑未完成phase（Recovery最后）。根因已由真实证据证实，修复已在R6根临时目录用真实缺口数据只读回放（17项通过，非产品证据）。六源未列入C14、未实现、未部署，不构成第七根授权；R6入口HALTED，整批Win10仍NOT_PASS，DEVELOPER_VERIFIED未签。

### 2026-10-05：R7批准与实施前六源C14登记

负责人回复“批准”，并裁决D1=方案A（仅重跑EncodingSecurity、FailureBoundaries、StopExit、ReleaseExit、Recovery，Recovery最后；R6已取得的Boot/Background×2/ready负例/Shell继续作为R6根直接证据，最终汇总须标明跨根组合及控制器仅差一个函数）、D2同意、D3/D4确认，绑定[R7合同](../plans/A9_31_R7_CONTROLLER_PARENT_KIND_REPAIR_APPROVAL.md)，原文SHA256 73646d58787a1fee7062a74bddfffb37114b1a7d4e816ed8cbb164d62ab5fa4e。当前HEAD ebda911/分支及APPROVED_FOR_IMPLEMENTATION保持。C14仅追加六个新外部源：`.acceptance/a9-31-developer/product-r3-retry-r7/control-scripts/stage-product-r3.ps1`、`launch-product-r3-desktop.ps1`、`serve-product-r3-desktop.ps1`、`product-r3-driver.cjs`（后三同目录）及`.acceptance/a9-31-developer/product-r3-retry-r7/event-sources/manifest-process-observer.cs`（与R6字节相同拷贝）、`launch-manifest-observer.ps1`（仅根常量）。控制器仅修改`Resolve-ManifestObservation`的父进程种类判断；driver与R6除根绑定外字节相同。不授权产品/native/锁/capture修改、系统改动、删除、强制结束旧实例（含107280/77944/42732）、提交/推送/合并/发布、委派、独立验收、Win7或第八根；R4/R5/R6 HALTED与全部旧证据不改判。

### 2026-10-05：R7实施、准入与冻结通过，普通入口待启动

R7远端根已创建并展开784产品/73宿主文件。观察器C#源与R5/R6字节相同，在R7重编（EXE 48f425343efb7f3d75ce763bd3fa8fb18cda62950b2ff00f192f6d465f41ed8a，MVID ef0fbc05-e1d7-4d43-a936-ea4c8d8db832，38项自检通过），准入两轮通过（1+1与8+4，全部conhost proof取得，零丢失、会话停止、无意外后代）。控制脚本由R6派生：stage/launch/driver归一化后与R6零差异，serve仅`Resolve-ManifestObservation`一处按批准修改（ready记录提前、`c_device_mapping`须匹配`^\\Device\\HarddiskVolume[0-9]+$`、父进程种类按`<映射>\Windows\System32\cmd.exe`/`...\WindowsPowerShell\v1.0\powershell.exe`大小写不敏感精确比较）。定向检查：schema336、api、interval、entry、files-scope、sync-actual（本次一次通过）、sync-current、Node16×20行（含重启自检）、package-held、manifest绑定40项（夹具改用真实设备路径，新增盘符/其他卷负例）、**真实缺口回放16项（夹具为hash固定的R6真实证据，直接对R7冻结serve运行）**均通过；4个revision stage完整闭包PASS，根670MB。master `8027d5f0383f650c9dade1aacb9a9d3935eaf9a1641312f03cbbaacab7fc8146`。普通入口待负责人启动，无R7普通phase证据，整批Win10仍NOT_PASS。

### 2026-10-05：R7部分证据、StopExit三次人工点击问题与入口HALTED

负责人启动R7普通入口（直接核验SID1005/Session3/Medium8192/非提升/noJob）。按方案A：**EncodingSecurity PASS**（driver 71项，整树53实例结束，1个查询缺口由原SYNC解析；这是R6被HALTED的phase，本次未遇conhost 87缺口，修复后的manifest proof分支仍未被真实缺口触发）、**FailureBoundaries PASS**（41项，整树51实例结束），观察器终态核对均通过，完整返回零不符。
**StopExit三次均未通过**：对话框在控制器启动后约5.2秒弹出并一直开着，120秒限时从弹出算起。第一次负责人160.5秒后点击、第二次263.7秒后点击，均按合同判FAIL（`TIMEOUT:actual native exit dialog choice`，不延长限时，迟到点击仅记为终态后观察；其余13项通过，整树14实例结束）。第三次改为提前就位并加45秒提前量，点击仅3.8秒，但返回`response=1`（“留给系统后退出”）而StopExit要求`response=0`（“停止后退出”），`ACTUAL_NATIVE_EXIT_CHOICE`失败触发`SAFETY_DRIVER_HARD_GATE`，dispatcher `SAFETY_WORKER_HARD_GATE` HALTED，累计5/16请求，整树已全部结束。这是点击选择与要求不符的硬门，未放宽。三份证据均完整回收（73/73/70文件）、逐size/SHA与秘密扫描零不符。
未执行：StopExit（最终字节上无通过记录）、ReleaseExit、Recovery（重启路径从未在Win10真实重启）。HALTED入口不恢复；继续需新根与具体批准（D4未预授权第八根）。证据分布：R5（旧控制器/driver）Boot/StopExit/ReleaseExit；R6 Boot、Background短/完整、ready预期负例、Shell；R7 EncodingSecurity、FailureBoundaries。矩阵`product-r3-retry-r7/win10-evidence-matrix-r7.json`。整批Win10仍NOT_PASS，DEVELOPER_VERIFIED未签。

### 2026-10-05：R8新根具体批准材料（仅草案）

[R8草案](../plans/A9_31_R8_EXIT_PHASES_AND_CLICK_PROTOCOL_APPROVAL.md)（SHA256 0d0e3ab6e152835bd89805f84875fa874fba53eb9633e4ab4d040d11d11c52c3）DRAFT_NOT_APPROVED：新根无功能代码变更，仅重跑StopExit→ReleaseExit→Recovery（最后），并把人工点击固化为流程（就位确认、提前量、每次只报一个按钮、不确定就不点、超时可重试至多3次、点错不重试）。前置P1容量（当前空闲约2.59GiB，新根将使其低于2GiB门槛，须负责人先腾空间）、P2界面确认。六源未列入C14、未实现、未部署，不构成第九根授权；R7入口HALTED，整批Win10仍NOT_PASS，DEVELOPER_VERIFIED未签。

### 2026-10-05：R8草案r2记录D1–D4裁决（仍未批准）

负责人裁决D1=顺序StopExit→ReleaseExit→Recovery、D2同意（点击phase最多3次、点错不重试）、D3/D4确认；[R8草案r2](../plans/A9_31_R8_EXIT_PHASES_AND_CLICK_PROTOCOL_APPROVAL.md)SHA256 eb9b1c76e0b87fc8626ca14c8272ec6e7d2bce3ffa8e5a738586e45c8590e21b仍DRAFT_NOT_APPROVED，前置P1（腾空间至≥4GiB）与P2（按钮确认）未取得，未批准、未实现。

### 2026-10-05：R8批准与实施前六源C14登记

负责人回复“批准”，并裁决D1=顺序StopExit→ReleaseExit→Recovery（Recovery最后）、D2同意（点击phase最多3次尝试、超时可重试、点错不重试）、D3/D4确认，前置P1（腾空间，代理只读核实空闲6.18GiB≥4GiB）与P2（按钮顺序`[停止后退出] [留给系统后退出] [取消]`确认）已取得，绑定[R8合同r2](../plans/A9_31_R8_EXIT_PHASES_AND_CLICK_PROTOCOL_APPROVAL.md)，原文SHA256 eb9b1c76e0b87fc8626ca14c8272ec6e7d2bce3ffa8e5a738586e45c8590e21b（r1 0d0e3ab6…为历史版本）。当前HEAD ebda911/分支及APPROVED_FOR_IMPLEMENTATION保持。C14仅追加六个新外部源：`.acceptance/a9-31-developer/product-r3-retry-r8/control-scripts/stage-product-r3.ps1`、`launch-product-r3-desktop.ps1`、`serve-product-r3-desktop.ps1`、`product-r3-driver.cjs`（后三同目录，与R7字节相同仅根/哈希绑定不同）及`.acceptance/a9-31-developer/product-r3-retry-r8/event-sources/manifest-process-observer.cs`（与R7字节相同拷贝）、`launch-manifest-observer.ps1`（仅根常量）。无任何功能代码变更。不授权产品/native/锁/capture修改、系统改动、删除、强制结束旧实例（含107280/77944/42732及R6/R7入口窗口）、提交/推送/合并/发布、委派、独立验收、Win7或第九根；R4–R7 HALTED与全部旧证据不改判。

### 2026-10-05：R8实施、准入与冻结通过，普通入口待启动

R8远端根已创建并展开784产品/73宿主文件。观察器C#源与R5–R7字节相同，在R8重编（EXE 5bc1ad6a8ad4e0e2aeab560253b7569adc0e42d725f167119e4ca96baeb5cd0d，MVID fa8a6188-1faa-4011-a62e-37c9a904dc72，38项自检通过），准入两轮通过（1+1与8+4，全部conhost proof取得，零丢失、会话停止、无意外后代）。控制脚本由R7派生，**反向换绑后与R7逐字相同（断言通过），无任何功能变更**。定向检查全部通过：schema336、api、interval、entry、files-scope、sync-actual（本次一次通过）、sync-current、Node16×20行（含重启自检）、package-held、manifest绑定40项、真实缺口回放16项；4个revision stage完整闭包PASS，根670MB，空闲10.09GiB。master `0450ccc613b97bfbb8876cb657fd21fbecbc1bd39a409fef489a07d081dfe6cf`。普通入口待负责人启动，无R8普通phase证据，整批Win10仍NOT_PASS。点击流程按ADR-0176/合同§4执行（`click-phase.sh`固定提前量）。

### 2026-10-05：R8开跑前独立复核请求（待Codex）

负责人要求在开启R8正式流程前交由Codex复核。本会话无Codex通道（ListAgents仅有无关会话），已改为落盘[复核请求](../reports/2026-10/a9_31_r8_pre_run_review_request_2026-10-05.md)（SHA256 2cec26bfb2344f03b266d5286ce8e9bfd9be48c95e682632f3ac12b57f4b5eb3）与只读验证脚本`product-r3-retry-r8/review-verify.py`（本地19项全部通过）。复核结论返回前不启动R8普通入口、不发任何请求；复核请求不是批准，不改变授权范围。

### 2026-10-05：独立复核后四项本地修复授权（实施前）

负责人在Codex列出点击脚本删除/登记缺口、实际晚到日志未使用重启命名、复核脚本非只读、冻结状态残留R7四项发现后要求“帮我修复这个问题”。本次仅登记上述四项的候选外本地修复；实际基线仍为ebda91123e62b225c3fd104c9c9b564a4b61c466 / codex/a9-31-background-tools，已有dirty/untracked保留。

C14准确本地路径为`.acceptance/a9-31-developer/r8-review-repair-r1/review-verify.py`、`click-phase.sh`、`click-phase.py`、`freeze-admission.py`及`control-scripts/product-r3-driver.cjs`（前四同修复目录）。其中driver只修复实际post-final-event创建点及对应离线自检；点击脚本去除删除/覆盖、固定45秒、拒绝无效输入与重复输出；验证器只运行只读检查；冻结脚本只修正R8状态并拒绝已冻结根。检查生成物与差异保存在同一修复目录，文档沿用当前任务/STATUS/STATUS_LOG和复核请求，不另建验收矩阵。

ADR-0177仅授权本地修复版本，不修改原R8/R5–R7冻结输入、master、revision、批准材料、准入或原始证据，不热替换driver，不创建/部署第九根，不恢复HALTED。无远端连接/请求/产品启动/原生探针/新依赖/删除/提交/推送/委派；实际Node16/Electron/PS5.1、普通重启、实时conhost缺口与新根跨账户读取继续NOT_PERFORMED。新driver不能沿用R8原driver准入PASS；最短真实链路须在另行符合合同的新不可变执行版本中完成，当前不执行。

### 2026-10-05：四项本地修复版本验证完成，R8仍不开跑

五源位于候选外`r8-review-repair-r1`，结果见[原复核请求§6](../reports/2026-10/a9_31_r8_pre_run_review_request_2026-10-05.md)。只读验证28/28、真实文件系统entry同名反例/修复9/9、原late-journal真实文件系统15/15、点击/冻结工具21/21；本地Node20.17.0，不冒充Node16/Electron/普通产品。R5–R8 5448文件size/SHA不变，首失败保留。新driver SHA256 cbeea5571173aa216a9b3ca110f3f67efa7925a3e982343970e64dfef35b1aaa。无远端连接/部署/入口/请求/删除/提交，LOCAL_REPAIR_VERIFIED_NOT_DEPLOYED；原R8及所有历史证据保留，整批Win10仍NOT_PASS，不签DEVELOPER_VERIFIED/独立/Win7。应用新版必须另行满足准确执行范围、目标运行时准入和不可变绑定，不能覆盖原冻结六源。

### 2026-10-05：Claude对Codex复核修复的独立核对与勘误

独立核对结论：Codex四项发现均成立，其修复本地验证通过但**尚未应用**。①点击脚本：我的`click-phase.sh`确有`rm -f`删除旧输出、写`/tmp`且未登记，成立；Codex的`click-phase.py`改为独占创建唯一目录、固定45秒、校验回执，但**硬编码只允许`normal-full`**，而R5/R7的StopExit/ReleaseExit/Recovery均在`normal-short`上运行；经核对`BACKGROUND_SHORT_ONLY`只影响`Background` phase内部分支（driver第344行），这三个phase在两个revision上行为等价，已批准文档也未指定revision，故属待裁决项而非缺陷。②post-final-event重启命名：成立——只回退`entry()`中该处，Codex的新重启自检在真实`EEXIST`（`existing evidence`）处失败，修复版通过；driver差异精确限于`entry()`的`restartAware(...)`、late-journal自检上下文补入`A9_TEST_RESTART='0'`与该函数（RESTART=0时语义不变）及重启自检重写，既有自检输出不变（55/5/14、SYNC 88、late-journal 15）。③验证脚本：成立并含**我的两处错误陈述**——我称“19项/只读”，实际输出21项，且driver自检会写临时文件，并非只读；Codex的验证器如实给出28项PASS并把2项标为NOT_PERFORMED。④冻结状态残留R7：成立——R8的`frozen-admission-result.json`状态为`FRESH_WIN10_R7_ADMISSION_PASS_NOT_ORDINARY_PRODUCT`，**勘误：该文件应读作R8准入通过**（内容、master 0450ccc6…及各记录哈希无误，仅状态字符串沿用了R7标签；不改写原不可变证据）。
独立复算：R5–R8共5448个文件逐size/SHA与Codex基线零差异；被跟踪文件仅文档变化，`src/`、`release/`、`spikes/`未动；原复核请求存档副本SHA256仍为2cec26bf…。Codex的静态结论补充：active-workspace恢复入口存在；Esc/取消通常表现为关闭后超时、清理失败仍可HALT（ADR-0176保守不重试规则保持）；conhost UTC/刻度/NT映像/参数类型未发现确定错误，真实活缺口路径、健康重启耗时、R8跨账户读取仍未验证。
应用修复版driver的前提：R8合同r2§2写明“driver与R7相同、无功能代码变更”，采用新driver需负责人修订该范围（新不可变driver revision、目标运行时Node16/Electron/PS5.1准入、重新冻结），未经批准不应用；R8入口未启动、无请求发出，整批Win10仍NOT_PASS。

### 2026-10-05：R8修订（采用复核修复版driver）材料（仅草案）

负责人口头裁决采用修复版driver并统一normal-short；[R8修订草案](../plans/A9_31_R8_DRIVER_REVISION_AMENDMENT_APPROVAL.md)（SHA256 5a928e2a22e47ac3b822acd164633f5f84f1609265999d02d27c2f8f09f46e6f）DRAFT_NOT_APPROVED：仅新建一个normal-short新不可变driver revision挂在不变master下（已核实：master的initial_driver_sha256只校验格式、SYNC安全摘要新旧相同=576fea1b…），三个phase统一用它，旧四个revision不用于请求；含R8冻结结果状态串勘误。点击脚本改为normal-short。修订未批准、未实现、未部署，R8入口未启动、无请求，整批Win10仍NOT_PASS。

### 2026-10-05：R8修订批准与实施前C14登记（driver-r1）

负责人回复“批准”，并裁决A=采用复核修复版driver且三个phase统一`normal-short`、B=仅新建一个normal-short新revision、C=不需要再复核，绑定[R8修订](../plans/A9_31_R8_DRIVER_REVISION_AMENDMENT_APPROVAL.md)，原文SHA256 5a928e2a22e47ac3b822acd164633f5f84f1609265999d02d27c2f8f09f46e6f；R8合同r2（eb9b1c76…）其余条款继续有效。当前HEAD ebda911/分支及APPROVED_FOR_IMPLEMENTATION保持。C14仅追加下列准确路径（均在`.acceptance/a9-31-developer/product-r3-retry-r8/driver-r1/`下）：`control-scripts/product-r3-driver.cjs`（Codex修复版，SHA256 cbeea5571173aa216a9b3ca110f3f67efa7925a3e982343970e64dfef35b1aaa，字节拷贝）、`frozen-control/normal-short/product-r3-driver.cjs`、`frozen-control/normal-short/revision.json`、`frozen-control/normal-short/checks.json`、`frozen-control/normal-short/registration.json`、`click-phase.py`（Codex版，仅允许revision由normal-full改为normal-short）、`click-phase.sh`、`r8-driver-phase.py`、`prepare-driver-r1.py`、`freeze-driver-r1.py`、`actual-node-driver-r1.ps1`、`validation-schema-driver-r1.ps1`。master（0450ccc6…）、观察器、stage/launch/serve、根、输入、夹具与既有全部记录不变；旧四个revision保持已登记、字节不变、不用于任何请求；R8冻结结果状态串误写R7的勘误（`frozen-admission-result.json`应读作R8准入通过）在此登记、不改原文件。不授权产品/native/锁/capture修改、系统改动、删除、强制结束旧实例、提交/推送/合并/发布、委派、独立验收、Win7或第九根；新revision准入失败不得静默回退旧revision。

### 2026-10-05：R8修订实施完成——新normal-short revision准入通过（driver-r1，不是普通产品证据）

按上条批准实施。**新revision SHA256 `2d38064cb135c87dce3b303152bf227af55515a7ab5771a7e02e98146ca2d5fb`**（`normal-short`），driver SHA256 `d1d05dc715874308f2a960a2ed01f31531c06f2d9210e8b12e3cca59c4e82bfe`（= 修复版`cbeea557…`仅`BACKGROUND_SHORT_ONLY=false→true`，且已断言该派生规则与冻结normal-full→normal-short逐字一致），`scripts_digest` `b33fc10bd288610eefd8c2baac6dfb3c251409fe4d90652a9419ee71668e1b34`；checks SHA256 `d74eddee8ddfc1361dbfeec2178dded35425adde015adb6022322bc401daa2a2`，registration SHA256 `5402cc424f021ca0e9088b531e168f2fa764c5b9a3a820fb29bf55c8a70c4c89`。revision.json仅替换driver行与`scripts_digest`，其余字段与冻结normal-short逐项相同，master仍`0450ccc613b97bfbb8876cb657fd21fbecbc1bd39a409fef489a07d081dfe6cf`。

直接结果：本地Node 20的`--check`/`--self-test`/sync-receipt/restart-evidence/late-journal通过；**Win10锁定Electron-as-Node 16.17.1**对新driver五行全部退出码0（`--check`、`--self-test`128项、sync-receipt 88项、late-journal 15项、restart-evidence 31项）；绑定新revision的schema定向检查336项、失败0；新revision完整闭包`stage`返回`PRODUCT_R3_STAGED_FRESH_FULL_CLOSURE_PASS`（root_bytes 670796838）。`frozen-admission-result-driver-r1.json`状态`FRESH_WIN10_R8_DRIVER_REVISION_ADMISSION_PASS_NOT_ORDINARY_PRODUCT`。开始前与完成后各跑一次5448文件基线：0 mismatches；远端只读核对：master哈希不变、旧四个revision目录仍在且未用、新revision目录与registration存在、`evidence`无`dispatcher-*`、`requests`为空、观察器进程0、C盘空闲8.54GiB（>每请求1GiB门槛）。远端`runs`下6个32位十六进制目录与5个`late-journal-*`目录的创建时间为R8准入时刻（01:20），仅新revision的`late-journal-2d38064c…`为本次（04:01）。**R8入口仍未启动，无请求发出。**

**C14准确路径勘误（如实登记）**：上条预登记的`freeze-driver-r1.py`、`actual-node-driver-r1.ps1`、`validation-schema-driver-r1.ps1`与实际落盘不一致——实际没有`freeze-driver-r1.py`（其职责由`deploy-driver-r1.py`的`upload|checks|register|result`承担）；两份`.ps1`位于`driver-r1/admission-inputs/`下。另有下列文件在实施中创建，当时未列入预登记清单，现补登记（均位于`.acceptance/a9-31-developer/product-r3-retry-r8/driver-r1/`，均为新增、不改任何冻结文件）：`approved-amendment.md`（批准修订原文副本，SHA256 5a928e2a…）、`owner-approval-amendment.json`、`admission-binding-driver-r1.json`、`deploy-driver-r1.py`、`baseline-check.py`（只读，核对5448文件基线）、`click-phase-test.py`（本地14项，用假控制器、不连远端）、`directed-actual-node-driver-r1.json`、`directed-validation-schema-driver-r1.json`、`stage-driver-r1.json`、`frozen-admission-result-driver-r1.json`、`frozen-control/normal-short/launch-product-r3-desktop.ps1`/`serve-product-r3-desktop.ps1`/`stage-product-r3.ps1`（对应冻结normal-short三份PS脚本的字节拷贝）。远端另新增：`control\revisions\2d38064c…\`四文件、`inputs\revision-2d38064c….json`、`inputs\checks-d74eddee….json`、`inputs\registration-2d38064c….json`、`inputs\directed-*-driver-r1.*`与`runs\late-journal-2d38064c…`。首次`register`在上传与stage均成功之后因代码笔误（`PosixPath`不可下标）崩溃，已修正并改由`result`模式补写结果文件，未重复上传或覆盖。

不证明：真实Electron下的Recovery重启、新conhost父进程分支在活phase的放行、R8跨账户读取、Esc/取消后果仍未验证；旧四个revision保持已登记、不用于请求；整批Win10仍NOT_PASS，DEVELOPER_VERIFIED/独立/Win7均未签，未在Win7实机验证。

### 2026-10-05：R8 执行结果——StopExit与ReleaseExit各一次通过，Recovery HALTED，入口终止

R8入口（dispatcher PID 100464，04:07:57Z启动，SID1005/Session3/Medium 8192/非提升/无job，由`desktop-execution.py status`直接核对）统一使用driver-r1新`normal-short` revision `2d38064cb135c87dce3b303152bf227af55515a7ab5771a7e02e98146ca2d5fb`，按StopExit→ReleaseExit→Recovery执行。`dispatcher-final.json`：`HALTED`，`error=LIFECYCLE_PINNED_TREE_UNKNOWN`，requests 3、results 2，04:55:03Z；R8入口已终止，不可重试，不建第九根。

- **StopExit（request a9599b32ceef44cb9d80082b7b0412b4）PASS**：负责人点击一次；对话框04:37:05.510Z打开、04:37:09.067Z返回，耗时3.557秒，`response=0`（停止后退出，与期望一致）；driver 15项全通过（含ACTUAL_NATIVE_EXIT_CHOICE、STOP_PERSISTED_TERMINAL：`last_probe_status=stopped`、`pid_reuse_possible=0`）；16个观察实例全部已退出且退出码为整数，unresolved 0、query failure 0；观察器`OBSERVER_FINAL_VERIFIED`（34事件）；完整取回69文件/7,681,953字节逐size/SHA一致、秘密扫描0；`review-phase.py`=`DIRECT_CURRENT_SOURCE_PHASE_PASS`。
- **ReleaseExit（request 0de38ba0014c4febb0cc0a9db3933ded）PASS**：对话框04:40:48.438Z打开、04:40:51.718Z返回，耗时3.28秒，`response=1`（留给系统后退出，与期望一致）；driver 32项全通过（含lost-release、pending-release、stop-before-release三个放行边界场景与RELEASE_PERSISTED_INTENT_AND_RECEIPT）；35个观察实例全部已退出、unresolved 0、query failure 0；观察器`OBSERVER_FINAL_VERIFIED`（82事件）；完整取回112文件/7,905,067字节一致、秘密扫描0；`review-phase.py`=`DIRECT_CURRENT_SOURCE_PHASE_PASS`。
- **Recovery（request 0da51c4c79134b2d904cc7ce5d51a652）HALTED**：真实崩溃重启首次执行，重启实例的`EEXIST`未再出现，`RESTART_SAME_CONVERSATION`、`RESTART_EVENT_IDENTITY_ONCE`、`CRASH_NO_FAKE_TERMINAL`、`RESTART_DOM_OUTPUT_ONCE`四项通过；第13项`BACKGROUND_FACTS_ONLY`失败（driver期望受管句柄`lastProbeStatus==='exited'`，实际为`cleanup_required`，同时`recoveryStatus='exited'`、`cleanupRequired=true`、该后台进程PID 35788已不存在；失败时界面仍显示“后台运行 1”与“已锁定：当前对话仍有托管后台进程”）。随后driver的`failure product stop`超时（`cleanup_error=TIMEOUT:failure product stop`），控制器写`HALTED_UNKNOWN_RETAINED`/`LIFECYCLE_RESTART_TIMEOUT`（退出码93）并写`controller-abort`（`LIFECYCLE_CAPTURE_FAILED`）；重启产品树（PID 16064及其子进程130832、43080、68788）在04:55:11Z仍存活。观察器`OBSERVER_FINAL_NOT_VERIFIED`，唯一未通过项是`no_open_instances=false`（该遗留树），其余11项通过（60事件，无丢失）。

**证据范围如实说明**：Recovery的完整取回（`return-one-run.py`）失败——遗留产品进程占用`a9-state.db`（Windows“文件正由另一进程使用”），清单阶段即失败、无半截目录；改用`return-partial-evidence.py`只取`evidence`与`signals`（33文件/671,561字节，逐SHA一致，秘密扫描0）至`return-recovery-r8-partial2/`；首次partial尝试因脚本笔误（`Measure-Object`用于哈希表）失败，其`return-recovery-r8-partial-inventory-*`记录保留。**Recovery没有精确完整的运行取回，isolated-localappdata/workspace未返回。**

**源码阅读推断（非结论，未经裁决）**：`src/runner/src/background-process-manager.ts` `adoptRecoveredFact`在重启恢复时原样带回持久化的`cleanupRequired`，`src/shell/tests/product/a9-lifecycle.test.ts`有测试“keeps persisted helper cleanup uncertainty visible and blocks clean exit after restart”，即该产品行为可能是设计意图，driver的Recovery预期（`exited`）与其不一致；产品缺陷还是driver预期缺陷尚未裁决，“产品为何未退出”亦无直接证据。**此项不得在本任务内擅自改产品或改driver预期**，须负责人裁决并另建任务书/ADR。

**未验证**：新conhost证明分支——三个phase均为`query_failures=0`、`manifest_proofs=0`，该分支在R8中从未被真实触发；Esc/取消后果仍未实测；Recovery通过未取得；Win7、独立验收、DEVELOPER_VERIFIED均未签，未在Win7实机验证；整批Win10仍NOT_PASS。

**补登记的C14路径（新增，均在`.acceptance/a9-31-developer/product-r3-retry-r8/`下，不改任何冻结文件）**：`ordinary-entry-confirmed.json`（`status-entry-start-driver-r1.json`字节拷贝，供`review-phase.py`使用）、`status-entry-start-driver-r1.*`、`status-after-stopexit-r8.*`、`status-during-recovery-halt.*`、`dispatcher-status-*.*`、`phase-stopexit-r8-1.*`、`phase-releaseexit-r8-*.*`、`phase-recovery-r8-*.*`、`return-stopexit-r8-1/`、`return-releaseexit-r8-1/`、`return-recovery-r8-partial2/`、`return-partial-evidence.py`、`recovery-halt-inspect-r8/`（只读单文件复制）、`review-StopExit-*.json`、`review-ReleaseExit-*.json`、`observer-<request_id>-*`（三个request）、`requests/request-*.json`、`recovery-halt-readonly-*`与`finish-*`、`dispatch-*`等SSH执行记录；本机`/tmp/a9-r8-click/`（点击脚本日志）与`/tmp/a9-r8-recovery/`（Recovery的start/finish输出）不在仓库内。无删除、无提交/推送、未结束任何进程。

### 2026-10-05：R8 Recovery完整取回（负责人关闭遗留进程树后）

负责人回复遗留产品进程树已关闭。直接核对（只读）：PID 16064及子进程130832、43080、68788均已不存在，根目录下无该root的electron进程，仅入口PowerShell 100464仍在；C盘空闲8.5GiB。随后`return-one-run.py`以新标签`return-recovery-r8-full`完整取回request 0da51c4c79134b2d904cc7ce5d51a652整个运行目录：**88文件/9,484,576字节，逐size/SHA一致、mismatch 0、秘密扫描0命中（`EXACT_COMPLETE_RUN_RETURN_SECRET_SCAN_PASS`）**；此前`return-recovery-r8-1`的首次取回失败记录（数据库被占用）与`return-recovery-r8-partial2`（evidence/signals 33文件）原样保留，二者的`evidence`/`signals`文件与完整取回逐文件SHA相同、无新增/缺失/变化。**这修正了上条“Recovery没有精确完整的运行取回”：现已取得，但取回发生在负责人手工关闭进程树之后，进程树关闭方式（点击哪个按钮或其他方式）未记录，该关闭动作不属于合同点击流程，不当作测得的对话框结果。**

完整取回的SQLite副本（`isolated-localappdata/a9-data/a9-state.db`及WAL/SHM的只读副本）直接显示：`a9_managed_processes`仅一行`sh-1791175540859-9aa57540`、pid 35788、`last_probe_status='cleanup_required'`、`pid_reuse_possible=0`；`a9_workspace_locks`仍有一行`owner_id=main-16064`（04:45:44.147Z获取，未释放）；`a9_turns`中第二个turn为`interrupted`、第一个为`completed_with_warnings`；事件表无重启后的`tool_end`。这些是直接的事实行；“产品有意保留cleanup_required并阻止干净退出”仍是源码阅读推断、未经裁决。三个phase的评审状态不变：StopExit/ReleaseExit `DIRECT_CURRENT_SOURCE_PHASE_PASS`，Recovery HALTED（driver失败于`BACKGROUND_FACTS_ONLY`），新conhost证明分支未触发，整批Win10仍NOT_PASS，未在Win7实机验证。新增路径补登记：`return-recovery-r8-full/`、`phase-recovery-r8-final.*`、`recovery-tree-closed-check*`。

### 2026-10-05：R8 遗留进程树关闭方式登记（负责人口述）

负责人答复：遗留产品进程树是“手动关闭的进程”（负责人口述，未再细分是点击窗口/对话框按钮还是结束进程，也未留下对应证据文件）。据此：该关闭是负责人在合同流程之外的手工处置，发生在`dispatcher-final`（HALTED，04:55:03Z）之后、完整取回之前；没有记录到任何原生对话框`response`，**不得当作Esc/取消或任一按钮的实测结果**，也不得据此推断产品退出行为；完整取回的SQLite副本中工作区锁`main-16064`仍未释放，与“进程被外部结束而非正常关闭”相容但**并未证明**这一点。此条仅补充记录，不改变任何结论：Recovery仍HALTED，整批Win10仍NOT_PASS，未在Win7实机验证。

### 2026-10-05：R8 Recovery第13项裁决材料（仅草案）

负责人要求起草裁决材料；[裁决材料](../plans/A9_31_R8_RECOVERY_EXPECTATION_RULING.md)（SHA256 fa88e204c215c2af3c2c7b7d9feb31bca80baa0b3fe476abe8ee4169ccb3b675）DRAFT_NOT_APPROVED。新增直接事实：崩溃前快照该句柄已是`running`+`cleanupRequired=true`+`owned`；崩溃整树（含root 35788、child 123372及其父helper 67344）均有OS层退出证据。源码静态推导（未运行复现）：当前产品对崩溃时仍运行的helper受管进程，重启后必然落盘为`cleanup_required`且无产品内处置出口；driver第13项`exited`预期与重启分支的正常关闭要求在当前产品上均不可达，failure stop超时是其确定结果。列A（产品缺陷）/B（driver预期错）/C（B并另立产品处置问题，推荐）三选项待负责人裁决。不授权任何修改、远端执行或第九根；R8 HALTED与旧证据不改判，整批Win10仍NOT_PASS，未在Win7实机验证。

### 2026-10-05：Recovery裁决D1=C，R9 driver修订合同与A9-34任务书（均仅草案）

负责人裁决D1=C（产品保留`cleanup_required`合乎设计、driver预期有误；“崩溃后无产品内处置出口”另立任务），[裁决材料r2](../plans/A9_31_R8_RECOVERY_EXPECTATION_RULING.md)SHA256 edf9b3f5377dd1cae1d8ce60f16c1545cfb749a997a75ffbb98b9b71060360b4（r1 fa88e204…为历史版本）。据此起草：[R9合同](../plans/A9_31_R9_RECOVERY_RETAINED_UNKNOWN_APPROVAL.md)（SHA256 f34cb8d2dc8cb741bce0858953b45ecdb20e3cfba7617806bdce04e55a4ce14a）DRAFT_NOT_APPROVED——仅Recovery、仅改driver重启分支的断言与收尾、新增Recovery专用评审，控制器逻辑不改；起草前只读核实：控制器只要求重启实例退出码0且driver PASS即可，现有`review-phase.py`以崩溃实例PID比对重启实例必然失败（此前未执行到）。[A9-34任务书](A9_34_RECOVERED_CLEANUP_DISPOSITION.md)（SHA256 fb78f7dbd2509299f8f8f225feef743ea0299d5b082e73ee8db511e76a4dc1ae）DRAFT_READY_FOR_REVIEW，已入任务索引，不在本任务内实现。均不授权实现、C14登记、远端执行或第九根；R8 HALTED与旧证据不改判，整批Win10仍NOT_PASS，未在Win7实机验证。

### 2026-10-05：R9合同r2记录D1–D4裁决（仍未批准）

负责人裁决D1=收尾用`app.exit(0)`+PASS+显式字段（控制器不改）、D2同意重启实例失败直接`app.exit(1)`、D3 Recovery任何FAIL/HALT不在本根重试、D4不预授权第十根；[R9合同r2](../plans/A9_31_R9_RECOVERY_RETAINED_UNKNOWN_APPROVAL.md)SHA256 f6ed73d5dd269c9a03f6790bfca581ab994f43a58e42ba9cef35e04fa358abbe（r1 f34cb8d2…为历史版本）仍DRAFT_NOT_APPROVED，正文§1–5未改；建根前置P1（C盘空闲≥4GiB）待批准后只读核对。未登记C14、未实现、未部署；A9-34批准与排序另行裁决。整批Win10仍NOT_PASS，未在Win7实机验证。

### 2026-10-05：R9合同r2获批准；P1通过；实施前发现与R8准入工具链的矛盾，暂停待裁决

负责人回复“批准”，绑定[R9合同r2](../plans/A9_31_R9_RECOVERY_RETAINED_UNKNOWN_APPROVAL.md)原文SHA256 f6ed73d5dd269c9a03f6790bfca581ab994f43a58e42ba9cef35e04fa358abbe（实施前复核哈希一致）。P1只读核对（06:20Z）：C盘空闲8.49GiB≥4GiB，远端与本地R9根均不存在，观察器0，仅R5遗留Electron 107280/77944/42732存活。

实施前只读研读R8新根工具链，发现两处与合同不一致，**未登记C14、未创建任何R9文件、未改driver、未建根**，按CLAUDE.md行为规则2上报待裁决：①合同§2第1点要求“仅`normal-short`”新revision，§3要求“准入沿用R8新根准入全套”；但R8准入中`validation-sync-actual`/`validation-sync-current`/`validation-schema`/`actual-package-held`绑定`normal-full`revision，`freeze-admission.py`断言Node16为4个driver×5行，二者不能同时满足。②合同§1 K2称“须另出Recovery专用评审”，实际R8目录已有`review-phase-recovery-aware.py`按`restart_identity`比对（含`BACKGROUND_FACTS_ONLY`）；K2关于`review-phase.py`的结论本身无误，但“须另出”应更正为“由该脚本派生”。

### 2026-10-05：R9修订材料（仅草案，负责人选A）

负责人裁决选A；[R9修订](../plans/A9_31_R9_ADMISSION_REVISIONS_AMENDMENT.md)（SHA256 b29a0bff156d9bde13b679b8881408bee840b58962977eb94b4ed8c9229768ab）DRAFT_NOT_APPROVED：新driver以复核修复版cbeea557…为基础只做r2 §2第1点a–h修改，再按`prepare-r8-local.py`同一机械变换派生四个revision，仅`normal-short`用于请求；Node16为4个driver×6行（含新Recovery自检）；`review-phase-r9.py`由R8已有`review-phase-recovery-aware.py`派生（K2勘误）。已核实三处派生锚点在基础driver中各恰出现一次。r2其余条款与D1–D4不变。批准前不登记C14、不创建R9文件、不建根。

### 2026-10-05：R9修订批准与实施前C14登记

负责人回复“批准”，绑定[R9修订](../plans/A9_31_R9_ADMISSION_REVISIONS_AMENDMENT.md)原文SHA256 b29a0bff156d9bde13b679b8881408bee840b58962977eb94b4ed8c9229768ab（实施前复核一致），连同已批准R9合同r2（f6ed73d5…）构成R9授权，ADR-0179。HEAD ebda911/分支及APPROVED_FOR_IMPLEMENTATION保持。

**C14准确路径（实施前登记；均位于`.acceptance/a9-31-developer/product-r3-retry-r9/`，均为新增，不改R5–R8任何文件）**：
- 批准与绑定：`approved-contract.md`（R9合同r2字节拷贝）、`approved-amendment.md`（R9修订字节拷贝）、`owner-approval.json`、`scope-approval.json`、`preparation-binding.json`。
- 外部源：`control-scripts/stage-product-r3.ps1`、`control-scripts/launch-product-r3-desktop.ps1`、`control-scripts/serve-product-r3-desktop.ps1`（三者由R8字节仅换根与哈希绑定派生，反向换绑须与R8逐字相同）、`control-scripts/product-r3-driver.cjs`（cbeea557…加合同r2 §2第1点a–h修改并换根）；`event-sources/manifest-process-observer.cs`（与R8字节相同）、`event-sources/launch-manifest-observer.ps1`（仅根常量）。
- 派生与冻结产物：`observer-block.json`、`observer-components/v1/pin.json`、`frozen-control/master-pin.json`、`frozen-control/{controlled-boot,normal-short,normal-full,ready-negative}/`下各`product-r3-driver.cjs`/`stage-product-r3.ps1`/`launch-product-r3-desktop.ps1`/`serve-product-r3-desktop.ps1`/`revision.json`/`checks.json`/`registration.json`、`admission-binding.json`、`capture-inheritance.json`、`capture-inherited/`（R8字节拷贝）、`source-input-derivation.json`、`fixtures/`（R8字节拷贝）、`expand-and-parse.ps1`、`admission-inputs/`下`validation-{schema,api,interval,entry,files-scope-r3-r2,sync-actual,sync-current,manifest,real-gap}.ps1`与`actual-{node-current,package-held}.ps1`、`driver-local-self-test.json`、`frozen-admission-result.json`、`ordinary-desktop-entry-command.txt`。
- 工具（R8同名脚本字节拷贝）：`remote-actions.py`、`observer-components.py`、`prepare-runtime-admission.py`、`run-admission-checks.py`、`desktop-execution.py`、`observe-runtime.py`、`observe-progress.py`、`phase-summary.py`、`return-one-run.py`、`return-partial-evidence.py`；（R8脚本改写）`r9-phase.py`（=`r8-phase.py`字节拷贝更名）、`derive-r9-control.py`、`prepare-r9-local.py`、`deploy-r9-preparation.py`、`finish-current-admission.py`（模板改取R8）、`freeze-admission.py`（4个driver×6行、状态串R9）、`review-phase-r9.py`（由`review-phase-recovery-aware.py`派生）。
- 执行记录（由上述工具按唯一label独占生成，label不复用）：`<label>-input.ps1`、`<label>.stdout`、`<label>.stderr`、`<label>-execution.json`、`<label>-batch.txt`、`directed-*.json`、`stage-*.json`、`win10-expand-and-parse.json`、`observer-v1-*`、`observer-<request_id>-*`、`dispatcher-status-*`、`status-*`、`dispatch-*`、`phase-*`、`finish-*`、`requests/`、`return-*/`、`review-Recovery-*.json`、`ordinary-entry-confirmed.json`、`win10-evidence-matrix-r9.json`。
- 远端：`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R3-20261005-R9`及其下由上述工具创建的内容。

**实施注记（合同直接后果，事先说明）**：driver既有`--restart-evidence-self-test`以字符串锚定重启分支`…await recoveryRestore();await closeAfterChecks();return;}`；合同r2 §2第1点f要求该分支不再调用`closeAfterChecks`，故该自检中这一处锚定字符串随之改为新分支文本，断言数量与输出JSON须与修改前逐字相同；除此之外非重启路径逐字不变。不授权产品/native/锁/capture/控制器逻辑/观察器源修改、系统改动、删除、强制结束旧实例、提交/推送/合并/发布、委派、独立验收、Win7或第十根。

### 2026-10-05：R9 C14补充登记（创建前）

冻结前发现R8冻结记录含`observer-admission-r1b.json`（观察器r1b准入stdout的JSON副本），上条清单未列。创建前补登记：`.acceptance/a9-31-developer/product-r3-retry-r9/observer-admission-r1b.json`（内容须与`observer-v1-admit-r1b.stdout`解析结果相同）。另如实记录：manifest绑定检查首次以通用脚本调用（label `directed-validation-manifest-r1`）因缺少必需参数在参数绑定阶段失败（未创建远端输出目录），该失败记录保留；随后按R8方式带参数以新label `directed-validation-manifest-r2`（Tag r2）重跑通过，冻结纳入r2结果。

### 2026-10-05：R9实施、准入与冻结通过，普通入口待启动

按ADR-0179实施。**driver**：以cbeea557…为基础只做合同r2 §2第1点a–h修改（`derive-r9-control.py`逐处断言命中次数），与基础driver的差异恰为7处：新增4个判定函数、新增`--recovery-retained-self-test`、新增`retainedUnknownExit`、`recoveryRestore`内以4个新断言替换`BACKGROUND_FACTS_ONLY`、`fail()`重启实例早退、重启分支改调`retainedUnknownExit`，以及既有重启证据自检中锚定该分支的一处字符串（C14已事先说明）。本地Node 20：`--self-test`、`--sync-receipt-self-test`、`--restart-evidence-self-test`输出与基础driver逐字相同，`--late-journal-self-test`在临时目录名归一后相同，新自检33项通过。R9 driver（normal-full/控制目录）SHA256 4d445b6d32182ac153e84d6278d66336fc184d04002cf00a5cb5e0d838e5abaf；**normal-short revision `c75f573452af5983367e8a3682dfad8cc89f0226950cc8ddaac05992a2a54711`**（driver 51f14a728a43c41763144b19897f7d70c55728a66d0ed0b314b77a3e1be58006），master `fd9df3e522ee55b4c36ad23114f4aaba3e066fc31f4cd44f4c55522fe96b16fd`。三份PS控制脚本由R8派生，反向换绑与R8逐字相同；派生物中无R8根/master/revision/观察器旧绑定残留。

**远端**：R9根已建并从R8根复制4个钉定输入（逐SHA校验）；观察器源与R8字节相同，在R9重编（EXE 63f5475535ee2044d40cacf2d85b0753d46613297bb65dd233f7476e0ca64042，MVID a7bcd7aa-4740-4994-8156-eed130fb75a0，38项自检），准入两轮通过（1+1得2个、8+4得12个conhost proof，零丢失、会话停止、无遗留实例）；展开784产品/73宿主文件、PS解析通过；定向检查全部通过：schema 336、api 27、interval 23、entry 22、files-scope 16、sync-actual、sync-current 77、**Win10锁定Electron-as-Node 16.17.1共24行（4个driver×6项，含新Recovery自检）全部退出码0**、package-held、manifest绑定40项（`-r2`，见补充登记）、真实缺口回放16项；4个revision完整闭包stage均`PRODUCT_R3_STAGED_FRESH_FULL_CLOSURE_PASS`；`frozen-admission-result.json`=`FRESH_WIN10_R9_ADMISSION_PASS_NOT_ORDINARY_PRODUCT`。开跑前只读核对：R9 evidence无`dispatcher-*`、requests为空、观察器0、ETW会话0、C盘空闲约7.86GiB，仅R5遗留Electron 107280/77944/42732存活；5448文件基线0差异。

**更正**：合同r2 §1 K2的“须另出”已由修订更正；`review-phase-r9.py`由`review-phase-recovery-aware.py`派生，仅限Recovery，必需项替换为4个新断言并检查两个显式字段。**R9入口未启动、无请求。**整批Win10仍NOT_PASS，未在Win7实机验证。

### 2026-10-05：R9执行结果——Recovery一次通过（保留清理未知语义）

负责人启动R9入口；`desktop-execution.py status`直接核验dispatcher PID 113308为SID1005/Session3/Medium 8192/非提升/无job（`ordinary-entry-confirmed.json`为该状态记录字节拷贝）。观察器就绪后发布Recovery请求`d1a04183a25a4e16afa2751491a21736`（normal-short revision c75f5734…），30秒内接单。结果：控制器`PHASE_PASS_REQUIRES_EVIDENCE_REVIEW`、退出码0；driver PASS——崩溃实例16项、退出码93、崩溃树17实例全部已退出；重启实例23项全部通过，其中`BACKGROUND_RECOVERED_UNKNOWN_RETAINED`（句柄sh-1791182487778-164feaf0/pid 123888：`cleanup_required`、`recoveryStatus=exited`、`pidReusePossible=false`、owned、零新helper）、`BACKGROUND_RECOVERED_PID_EXITED_BY_OS`（该PID在控制器崩溃树中已退出、退出码1）、`RECOVERED_UNKNOWN_STOP_REJECTED`（`A9_MANAGED_PROCESS_CLEANUP_UNCONFIRMED`）、`RECOVERED_UNKNOWN_BLOCKS_SWITCH_AND_CLOSE`（canStop/managed_process、不可切换且原因为“当前对话仍有托管后台进程”、锁持有、`normalCloseState`为假）；`normal_product_exit=BLOCKED_BY_DESIGN_NOT_PERFORMED`，隔离测试`app.exit(0)`；23实例全部已退出，未解决观察0、query failure 0、manifest proof 0。观察器`OBSERVER_FINAL_VERIFIED`（64事件、零丢失、无遗留实例）。完整回收`return-recovery-r9-1/`87文件/7,601,311字节逐SHA一致、秘密扫描0；`review-phase-r9.py`=`DIRECT_CURRENT_SOURCE_PHASE_PASS`。矩阵`product-r3-retry-r9/win10-evidence-matrix-r9.json`；按R8合同§4补写`product-r3-retry-r8/win10-evidence-matrix-r8.json`；统一报告补§12/§13。

**边界**：该PASS不证明崩溃后产品可正常关闭（A9-34草案待批准与排序）；新conhost证明分支仍未被真实触发；Esc/取消未实测。dispatcher仍在等待（未写`requests\stop.json`，是否正常停止入口待负责人决定）。每个phase至少在一个根上有PASS，但跨根字节各异，是否算整批Win10通过须负责人裁决；DEVELOPER_VERIFIED/独立/Win7均未签，未在Win7实机验证。

### 2026-10-05：R9入口经stop.json正常结束

负责人指示放`stop.json`正常停止入口。首次尝试（label `r9-entry-stop`）因我方前置检查把“已处理请求文件仍在requests目录”误判为待处理而在写入前抛出`INTEGRITY_PENDING_REQUEST`，未写任何文件，记录保留；核对dispatcher源码（已处理请求按设计保留、以内存集合去重，stop在每轮循环开头检查）后，改为“每个请求都已有`dispatcher-result.json`”再发布，以新label `r9-entry-stop-r2`原子写入`requests\stop.json`（仅`master_sha256`，SHA256 99aa85fa…）。`dispatcher-final.json`=`COMPLETED`、error为空、requests 1、06:47:13Z（SHA256 0cf29b044cd2658214619e3c04d670827bb2682ae0b2e93689bef8c84c4c1943）。只读核对：R9 Electron 0、观察器0、C盘空闲9.55GiB；入口PowerShell（PID 113308，`-NoExit`）仍在提示符，窗口由负责人处置；R5遗留Electron 107280/77944/42732未动。这是本任务各根中首次以正常停止结束入口。矩阵r9已补入口结束字段。

### 2026-10-05：整批Win10跨根组合裁决材料（仅草案）

负责人要求起草；[跨根组合裁决材料](../plans/A9_31_WIN10_BATCH_CROSS_ROOT_RULING.md)（SHA256 1e5c0000096063cad29b5b74134b4e6206aac2436db261575085ec73714d8239）DRAFT_NOT_APPROVED。新核实的直接事实：R5–R9被测产品输入（source/ZIP/manifest/lock/helper/capture库/SYNC模块）完全相同；各根测试工具差异经归一比对只落在重启分支、观察器读检查与conhost proof路径；**R5–R7的PASS phase无正式评审结论文件**（目录内有同版评审脚本但无`review-*.json`与入口确认文件，身份记录`dispatcher-status-*.json`存在）。列A（直接组合）/B（先本地补正式评审再组合，推荐）/C（新根全八phase），并建议先裁决A9-34是否并入第二批。不授权任何写入旧根、远端动作或签字；整批Win10仍NOT_PASS，未在Win7实机验证。

### 2026-10-05：跨根组合裁决r2——D1=A9-34推迟、D2=B，补评审预演通过（仍未批准执行）

负责人裁决D1=A9-34推迟到第二批之后（A9-33须列已知限制）、D2=B。[裁决材料r2](../plans/A9_31_WIN10_BATCH_CROSS_ROOT_RULING.md)SHA256 6847b87ea6b6b6ce08bed205957fb0d8e6d58ce2f1db14b8ca530d33884c614e（r1 1e5c0000…为历史版本）DRAFT_NOT_APPROVED。只读预演（scratchpad副本，非评审记录）：按建议规则取R5/R6/R7首份WAITING身份记录，原样评审脚本对10项全部通过（9项`DIRECT_CURRENT_SOURCE_PHASE_PASS`，ready负例`EXPECTED_NEGATIVE_CASE_PASS_REQUIRES_COMPLETE_RETURN_SECRET_SCAN`）。§9列出待批准的准确C14路径（R5–R7各新增入口确认与评审结论文件、组合结论文件），未写入任何旧根目录。整批Win10仍NOT_PASS，未在Win7实机验证。

### 2026-10-05：跨根组合r2批准与实施前C14登记

负责人回复“批准”，绑定[跨根组合裁决材料r2](../plans/A9_31_WIN10_BATCH_CROSS_ROOT_RULING.md)原文SHA256 6847b87ea6b6b6ce08bed205957fb0d8e6d58ce2f1db14b8ca530d33884c614e（实施前复核一致），D3/D4按该稿§9，ADR-0180。**C14准确路径（创建前登记，仅新增，均在`.acceptance/a9-31-developer/`下）**：`product-r3-retry-r5/ordinary-entry-confirmed.json`（`dispatcher-status-9f80ec3f.json`字节拷贝）、`product-r3-retry-r6/ordinary-entry-confirmed.json`（`dispatcher-status-cf7a25c9.json`字节拷贝）、`product-r3-retry-r7/ordinary-entry-confirmed.json`（`dispatcher-status-f0f7b503.json`字节拷贝）；`product-r3-retry-r5/review-Boot-e28f279a4db44f9e86f669eb69f6ba00.json`、`review-StopExit-d20ba372d60e40628e82a0b2ff274e6a.json`、`review-ReleaseExit-907b3747d6fc44a3ad6e1e9f6a25b898.json`；`product-r3-retry-r6/review-Boot-9df37ce14d134012ae7e414399d1672e.json`、`review-Background-e30af2786c514973bf5fd45d14b4c962.json`、`review-Background-53eb4fdd77d04150adbe47bac661b60f.json`、`review-Shell-38973184211b4ebbb1c6d5f37a90b556.json`、`review-ready-negative-39578cdd84da43aaa4b0654e4a2631c1.json`；`product-r3-retry-r7/review-EncodingSecurity-7f5eef0dc1854c94b47d91f67fa64927.json`、`review-FailureBoundaries-fc75b5899be8497eb1bc1e8da60a893c.json`；`win10-cross-root-combined.json`。不改任何既有文件，无远端动作。

### 2026-10-05：R5–R7补正式评审10项通过；整批Win10记为跨根组合通过（带限制）

按ADR-0180执行，仅新增上条登记的14个文件，无远端动作。三根入口身份文件均为所选`dispatcher-status-*.json`的字节拷贝（SHA256复核一致）。以各根原样评审脚本对已回收证据补跑：R5 Boot/StopExit/ReleaseExit、R6 Boot/Background short/Background full/Shell、R7 EncodingSecurity/FailureBoundaries均`DIRECT_CURRENT_SOURCE_PHASE_PASS`，R6 ready负例`EXPECTED_NEGATIVE_CASE_PASS_REQUIRES_COMPLETE_RETURN_SECRET_SCAN`（该run完整回收65文件、秘密扫描0）。R5–R8冻结5448文件基线前后各一次0差异。组合结论`.acceptance/a9-31-developer/win10-cross-root-combined.json`（SHA256 107968869c00d3dfb382024ee85fd4ba207906c6e342a6a5bda532b84c01e2a4）=`WIN10_CROSS_ROOT_COMBINED_PASS_WITH_LIMITS`：采信Boot/Background三项/Shell取R6，EncodingSecurity/FailureBoundaries取R7，StopExit/ReleaseExit取R8，Recovery取R9（R5的Boot/StopExit/ReleaseExit评审通过作为旁证）。限制：conhost证明分支未被真实触发；Esc/取消未实测；Recovery仅保留未知语义（A9-34推迟，A9-33须列已知限制）；跨根等价是对归一差异的推断而非重跑；DEVELOPER_VERIFIED/独立验收/Win7均未签，**未在Win7实机验证**。

### 2026-10-05：DEVELOPER_VERIFIED裁决材料（仅草案）

负责人要求起草；[DEVELOPER_VERIFIED裁决材料](../plans/A9_31_DEVELOPER_VERIFIED_RULING.md)（SHA256 faa261dd184fb9ad887fa5cc8a83403747c71df2b9f066977baf3089b9582f05）DRAFT_NOT_APPROVED。核实：HEAD ebda911下src/native/scripts/release无未提交改动；Win10证据所测包由ebda911装配。缺口：G1 `898ee94`与`ebda911`两次产品源码修改及本轮Win10证据未经独立复核；G2 无绑定`ebda911`的§5命令清单一次性完整结果（此前按增量在受影响模块重跑）；G3 重启后`cleanup_required`无产品内处置出口（A9-34推迟）；G4 Esc/取消未实测；G5 conhost分支未触发、跨根等价为推断。列A（带限制直接登记）/B（先补G1、G2再登记，推荐）/C（A9-34后再登记）。不登记阶段门、不运行测试、不委派；未在Win7实机验证。

### 2026-10-05：DEVELOPER_VERIFIED裁决r2（D1=B、D2=Codex、D3=G3/G4为已知限制）与G2执行材料（均仅草案）

负责人裁决D1=B、D2=独立只读复核交Codex、D3=G3/G4作为已知限制不阻断；[裁决材料r2](../plans/A9_31_DEVELOPER_VERIFIED_RULING.md)SHA256 672263a128c8714f115002f92813cf1a31bd619f560b20d3af501e75e3044919（r1 faa261dd…为历史版本）。按D4起草[G2执行材料](../plans/A9_31_DEVELOPER_VERIFIED_G2_TEST_RUN_APPROVAL.md)（SHA256 56fd54e66fa1345bc994a3657b4c0bab09df610ad9bd186a83d90317004e9f4e）DRAFT_NOT_APPROVED：在本工作树准确ebda911上以Node 20.17顺序运行§5命令清单，失败不修复、继续其余命令；运行前后全部受跟踪文件逐SHA核对、构建改写的Runner dist按原字节恢复；“反例红”不在本次范围、交Codex判定。未运行任何测试、未生成Codex请求、未登记阶段门；未在Win7实机验证。

### 2026-10-05：G2执行材料批准与实施前C14登记

负责人回复“批准”，绑定[G2执行材料](../plans/A9_31_DEVELOPER_VERIFIED_G2_TEST_RUN_APPROVAL.md)原文SHA256 56fd54e66fa1345bc994a3657b4c0bab09df610ad9bd186a83d90317004e9f4e（实施前复核一致）。C14仅新增`.acceptance/a9-31-developer/developer-verified-g2-r1/`下：`run-g2.py`、`before-tracked.json`、`untracked-before.json`、`saved-runner-dist/`、`cmd-<n>-<name>.stdout`/`.stderr`/`.json`（8条命令）、`after-tracked.json`、`untracked-after.json`、`restored-files.json`、`g2-summary.json`。（`untracked-before.json`/`untracked-after.json`为材料§3“记录未跟踪文件清单”的落盘文件名，在此一并登记。）不改源码/测试、不安装、不联网、无远端动作。

### 2026-10-05：G2首次运行未完成（Shell组超时），修订r2草案

按批准的G2材料运行`developer-verified-g2-r1/run-g2.py`：Core 200/200、Runner 166/166、State 82/82均退出码0；第4条Shell组在3600秒被我方脚本超时终止，脚本未捕获该异常而退出，第5–8条未运行、Shell原始输出丢失、汇总未写（我方脚本缺陷）。遗留由本次运行派生的孤儿jest（PID 8369）及`a9-lifecycle.test.ts`夹具同款子进程（PID 9428），未结束。只读核对：1813个受跟踪文件与运行前逐SHA一致、无新增未跟踪文件、5448文件基线0差异，无需恢复。挂住的具体用例未知。[G2修订r2](../plans/A9_31_DEVELOPER_VERIFIED_G2_R2_AMENDMENT.md)（SHA256 dd778914396d6958094a8af3f8b085b7f5fe5fe1c15b6b0f4ebfbe94f7b5fc87）DRAFT_NOT_APPROVED：结束上述两个本机进程、新证据目录、去掉CI并关闭stdin、每条900秒超时且保留部分输出、Shell组追加--json输出、再超时则逐文件诊断。G2结论暂缺，未登记阶段门；未在Win7实机验证。

### 2026-10-05：G2修订r2批准与实施前C14登记

负责人回复“批准”，绑定[G2修订r2](../plans/A9_31_DEVELOPER_VERIFIED_G2_R2_AMENDMENT.md)原文SHA256 dd778914396d6958094a8af3f8b085b7f5fe5fe1c15b6b0f4ebfbe94f7b5fc87（实施前复核一致）。C14仅新增`.acceptance/a9-31-developer/developer-verified-g2-r2/`下：`killed-processes.json`、`run-g2.py`、`before-tracked.json`、`untracked-before.json`、`saved-runner-dist/`、`cmd-<n>-<name>.stdout`/`.stderr`/`.json`、`cmd-4-shell.jest.json`、（如触发）`diag-shell-<文件名>.stdout`/`.stderr`/`.json`/`.jest.json`、`after-tracked.json`、`untracked-after.json`、`restored-files.json`、`g2-summary.json`。仅结束PID 8369与9428两个由G2 r1派生的本机进程。

### 2026-10-05：G2 r2结果——Shell组2项失败（疑为测试顺序导致旧编译产物），修订r3草案

两个r1遗留进程：向9428发SIGTERM后8369自行退出（`killed-processes.json`如实记录；结束脚本因断言8369仍在而中止）。r2运行（`developer-verified-g2-r2/`）：Core 200/200、Runner 166/166、State 82/82、release node --test 200通过/2平台SKIP、verify:quick、docs:check、diff --check均退出码0；Shell组115/117，`a9-lifecycle.test.ts`两项失败（期望1个`running`受管进程实得0），失败后夹具子进程未停致jest超时（即r1挂住原因）；其余8个Shell文件逐文件诊断全部通过。构建改写的24个受跟踪Runner dist已按原字节恢复，1813受跟踪文件一致、无新增未跟踪文件、5448基线0差异。遗留两个夹具子进程（PID 53273、60808）未结束。直接比对：受跟踪Runner dist最后提交于2026-09-07，早于A9-31 Runner源码改动，与10-04先构建时的编译清单恰差这24个文件；§5把构建排在Shell组之后，故推断失败源于旧编译产物而非产品源码，未验证。[G2修订r3](../plans/A9_31_DEVELOPER_VERIFIED_G2_R3_AMENDMENT.md)（SHA256 2831136f68b5551d8179c4b5f3eec36cd39698c3d4eec155bc89201d13779583）DRAFT_NOT_APPROVED：结束两个夹具进程、先构建再按§5原顺序全量重跑。G2结论暂缺；未在Win7实机验证。

### 2026-10-05：G2修订r3批准与实施前C14登记

负责人回复“批准”，绑定[G2修订r3](../plans/A9_31_DEVELOPER_VERIFIED_G2_R3_AMENDMENT.md)原文SHA256 2831136f68b5551d8179c4b5f3eec36cd39698c3d4eec155bc89201d13779583（实施前复核一致）。C14仅新增`.acceptance/a9-31-developer/developer-verified-g2-r3/`下：`killed-processes.json`、`run-g2.py`、`before-tracked.json`、`untracked-before.json`、`saved-runner-dist/`、`cmd-0-prebuild.stdout`/`.stderr`/`.json`、`cmd-<n>-<name>.stdout`/`.stderr`/`.json`、`cmd-4-shell.jest.json`、（如触发）`diag-shell-<文件名>.stdout`/`.stderr`/`.json`/`.jest.json`、`after-tracked.json`、`untracked-after.json`、`restored-files.json`、`g2-summary.json`。仅结束PID 53273与60808两个由G2 r2派生的本机夹具进程。

### 2026-10-05：G2 r3通过；Codex复核请求已生成

结束G2 r2遗留夹具进程53273、60808（SIGTERM后均退出）。r3（`developer-verified-g2-r3/`，先`verify:quick`构建再按§5原顺序）：`g2-summary.json`=`G2_ALL_COMMANDS_EXIT_0`（SHA256 ddb891fa…）——Core 200/200、Runner 166/166、State 82/82、Shell 117/117（3.4秒）、release node --test 200通过/2 Windows专项SKIP/0失败、verify:quick、docs:check、diff --check均退出码0；构建改写的24个Runner dist按原字节恢复，1813受跟踪文件一致、无新增未跟踪文件、5448基线0差异、无遗留进程。r1/r2的Shell失败据此判定为§5顺序下加载陈旧受跟踪Runner dist（2026-09-07）所致，非`ebda911`产品源码失败（r1/r2原记录保留）。按裁决r2生成[Codex复核请求](../reports/2026-10/a9_31_developer_verified_codex_review_request_2026-10-05.md)（SHA256 b5fdd68b6c8ed09ff2cc354c3851d436515518871b1c501c23ecde17d62e1ae7），待负责人转交；阶段门未登记，未在Win7实机验证。

### 2026-10-05：Codex独立复核结论——不建议登记DEVELOPER_VERIFIED（P0=0、P1=2、P2=1）

负责人转回Codex对[复核请求](../reports/2026-10/a9_31_developer_verified_codex_review_request_2026-10-05.md)的只读复核（Codex称已核对请求SHA/分支/HEAD，未改工作树、未连远端、未执行命令内容；复现于其同HEAD临时检出）。**P1-1**：`src/core/src/policy.ts`（约240、298行）把双引号前的反斜杠当转义，而PowerShell中`\`不转义引号，`Write-Output "C:\"; npm publish`、`Write-Output "C:\"; sc.exe delete …`被判ALLOW（Codex称`ebda911`前为ASK，属本次修改造成的回归），`… Remove-Item -LiteralPath … -Force`同样ALLOW；`start_process`经`a9-agent-loop.ts`（约1164行）映射到同一Policy，两入口均受影响。**P1-2**：变量分析把未执行分支的赋值当确定事实（约264、287行），`$tool='npm'; if ($false) { $tool='echo' }; & $tool publish`判ALLOW，违反ADR-0171“明显控制流、歧义保守确认”。**P2-1**：§5清单把构建排在消费者测试之后，干净检出不能可靠执行（Shell测试直接加载`runner/dist`）；r3已有正确顺序结果，无需仅为文档重跑。信息项：`898ee94`未发现放宽；审批摘要/digest绑定无新问题；发布打包从源码独立编译、不消费陈旧受跟踪dist；r2旧产物归因成立、r1仅为有支持的推断；四类反例红可按INHERITED_EVIDENCE使用（恢复哈希与当前Manager一致），两项P1修复后须补针对性回归；Win10表述与跨根推断在已声明限制内成立；G3/G4不升级但须继续附带。

**我方独立复现（只做策略求值，未执行任何命令内容）**：以r3预构建由`ebda911`编译的`src/core/dist`调用`PolicyEngine.evaluate`（FULL_ACCESS），上述4个输入均返回`allow`（`POLICY_FULL_ACCESS_ALLOWED`），对照`$tool='npm'; & $tool publish`与`npm publish`返回`ask`；两项P1成立。“`ebda911`前为ASK”为Codex结论，我方未复现。**A9-31不登记DEVELOPER_VERIFIED**；修复将改变产品字节，影响已取得的Win10证据绑定，须负责人裁决修复范围与重验范围。未在Win7实机验证。

### 2026-10-05：P1修复材料（仅草案）

负责人要求起草；[P1修复材料](../plans/A9_31_POLICY_P1_REPAIR_APPROVAL.md)（SHA256 e0dc01e23289d3f536f5d148376518002949be42a2a8ad4d2e8de9ae5408e9ae）DRAFT_NOT_APPROVED：F1 PowerShell/cmd中`\`不转义引号，含“反斜杠紧接双引号”时按两种解释切分取高影响；F2 嵌套块/控制流内字面赋值追加为候选值，任一候选得出高影响即取该结果；先红后绿（含cmd写法、`start_process`入口与`bash`载荷的预期保守变化），先构建后§5全量加`policy.test.ts`，再交Codex聚焦复核；附§5命令清单文本修正（P2-1）。另复现：`echo "C:\" & npm publish`在PowerShell与cmd两种shellKind下当前均为allow。本次不含提交、新包、Win10；预告修复后除Boot外经工具派发的Win10 phase预计须在新包上重跑。未改任何源码；未在Win7实机验证。

### 2026-10-05：P1修复材料批准与实施前C14登记

负责人回复“批准”，绑定[P1修复材料](../plans/A9_31_POLICY_P1_REPAIR_APPROVAL.md)原文SHA256 e0dc01e23289d3f536f5d148376518002949be42a2a8ad4d2e8de9ae5408e9ae（实施前复核一致），D1保守设计、D2修改§5命令清单文本、D3仅到本地修复/验证/Codex复核为止，ADR-0181。C14准确路径：实现`src/core/src/policy.ts`；测试`src/core/tests/policy.test.ts`、`src/core/tests/a9-background-tools.test.ts`；证据目录`.acceptance/a9-31-developer/policy-p1-repair-r1/`（红/绿运行记录、§4全量运行脚本与保护文件）；报告`docs/reports/2026-10/a9_31_policy_p1_repair_2026-10-05.md`；本任务书§5命令清单文本。HEAD ebda911/分支/APPROVED_FOR_IMPLEMENTATION保持；不提交、不打包、无远端动作。

### 2026-10-05：P1本地修复完成（未提交），待Codex聚焦复核

按ADR-0181实施，[报告](../reports/2026-10/a9_31_policy_p1_repair_2026-10-05.md)（SHA256 da2e7447b2eb6e9f44a545e0698ac6528a2bc43c3ce4787db2be2c61968041e7）。仅改`src/core/src/policy.ts`（249d6b34…）、`src/core/tests/policy.test.ts`（bd243a06…）、`src/core/tests/a9-background-tools.test.ts`（cccf9670…），未提交。红：新增11项失败/244通过；绿：255/255，既有用例结论不变。偏差：材料§3预测`bash -c "echo \"npm publish\""`会变ask，实际保持allow且正确（宿主载荷由tokenizer提取，两种读法都不执行npm publish），已移入allow组并在报告登记。全量（先构建，Core加policy.test.ts）：Core 435、Runner 166、State 82、Shell 117、release 200通过/2 SKIP、verify:quick/docs:check/diff --check全部退出码0；dist恢复、受跟踪文件一致、5448基线0差异。按D2修订本任务书§5清单（verify:quick置首、Core加policy.test.ts）。不提交、不打包、无远端；未在Win7实机验证。

### 2026-10-05：Codex聚焦复核P1修复——不可提交（P1=3），修订r2草案

负责人转回Codex对P1本地修复的聚焦复核：A–D与cmd引号用例已修复（两入口均ASK/needs_approval、模拟派发0），F1单独应用未发现放宽，F2直接块场景有效，`evaluateName`封装无额外语义问题，bash偏差的ALLOW结论合理但报告中PowerShell位置参数解释未经验证；Codex回退`policy.ts`后测试10项失败，测试能检出修复被回退。新P1三项：①条件块内非字面赋值被丢弃致`$tool='echo'; if ($true) {$tool=$env:ComSpec}; & $tool /c 'npm publish'`由HEAD的ASK变ALLOW（**本次修复引入的回归**，否定报告“非字面赋值处理不变”）；②cmd无括号`if … set`赋值不传播（`cmd /v:on /c "set PKG=echo& if 1==1 set PKG=npm& !PKG! publish"`）；③双引号`$()`内赋值及点调用函数/脚本块的赋值未计入当前作用域。**我方复现**：以HEAD与修复版分别编译（HEAD于scratchpad隔离编译）纯策略求值，①HEAD ask/修复版allow，②③两版均allow，与Codex一致。[P1修复修订r2](../plans/A9_31_POLICY_P1_REPAIR_R2_AMENDMENT.md)（SHA256 9359f34478ed17c3ff7186038b2a220075652829d20993ed4f589000371bbec8）DRAFT_NOT_APPROVED：G1未知候选、G2 if/do/else载荷赋值并入、G3 `$()`赋值并入、G4点调用并入块内赋值，均只追加候选；更正报告两处表述。修复仍未提交；未在Win7实机验证。

### 2026-10-05：P1修复修订r2批准与实施前C14登记

负责人回复“批准”，绑定[P1修复修订r2](../plans/A9_31_POLICY_P1_REPAIR_R2_AMENDMENT.md)原文SHA256 9359f34478ed17c3ff7186038b2a220075652829d20993ed4f589000371bbec8（实施前复核一致），ADR-0182（ADR-0181补充）。C14：`src/core/src/policy.ts`、`src/core/tests/policy.test.ts`、`src/core/tests/a9-background-tools.test.ts`；证据目录`.acceptance/a9-31-developer/policy-p1-repair-r2/`；报告`docs/reports/2026-10/a9_31_policy_p1_repair_2026-10-05.md`追加修订。不提交、不打包、无远端。

### 2026-10-05：P1修复r2本地完成（未提交），待Codex再次复核

按ADR-0182实施G1–G4，仅改上述三文件（policy.ts b25ee293…、policy.test.ts 53dc6860…、a9-background-tools.test.ts 7b12e1d6…），未提交。红8失败/258通过，绿266/266；HEAD对r2差分304条语料中0条由ask放宽，新增ask恰为11个目标输入；全量（先构建）Core 446、Runner 166、State 82、Shell 117、release 200通过/2 SKIP、其余检查全部退出码0，dist恢复、5448基线0差异。[报告](../reports/2026-10/a9_31_policy_p1_repair_2026-10-05.md)（SHA256 a24b54dea599df01547c689efb0dc9ab2aa54e400854951c0b41c28f0d4eed2e）追加§6并更正“非字面赋值处理不变”与bash偏差理由两处表述。不提交、不打包、无远端；未在Win7实机验证。

### 2026-10-05：Codex第三轮复核（r2）——不可提交（P1=3），修订r3草案改为“只增不减”规则

负责人转回Codex对r2的复核：历史11个反例两入口均ASK/needs_approval、模拟派发0；直接控制流与两个ALLOW对照合理；测试可检出回退（换回r1 8失败、换回HEAD 15失败）。新P1三项：①同层非字面赋值的“未知”被后续条件候选追加覆盖，`$tool=$env:ComSpec; if ($false) { Write-Output "$($tool='echo')" }; & $tool /c 'npm publish'`等HEAD=ASK、r1=ASK、r2=ALLOW（**r2引入的回归**）；②嵌套`if`、`for … do if`、`call set`与多层`$()`中的赋值仍丢失；③块内`$()`赋值与子表达式中的点调用未计入。Codex 432组合中20条HEAD ASK→r2 ALLOW。另：`call :label`未判、bash用例注释仍含未经验证的说法。判断逐项候选追踪不收敛；在scratchpad以HEAD为基础原型验证“F1＋变量调用在含控制结构且有高影响词时一律确认（R）”：20个反例全部ASK，755条输入中HEAD ASK→原型非ASK为0（非证据，供裁决）。[修订r3](../plans/A9_31_POLICY_P1_REPAIR_R3_AMENDMENT.md)（SHA256 207617b72fa11333320d2b0edb1957237221712bd6198e56175e46cc24bf32f3）DRAFT_NOT_APPROVED：撤除r1/r2候选实现，在HEAD上只做F1与R，超集性质由构造保证，接受两类误确认。修复仍未提交；未在Win7实机验证。

### 2026-10-05：P1修复修订r3批准与实施前C14登记

负责人回复“批准”，绑定[修订r3](../plans/A9_31_POLICY_P1_REPAIR_R3_AMENDMENT.md)原文SHA256 207617b72fa11333320d2b0edb1957237221712bd6198e56175e46cc24bf32f3（实施前复核一致），ADR-0183。C14：`src/core/src/policy.ts`、`src/core/tests/policy.test.ts`、`src/core/tests/a9-background-tools.test.ts`；证据目录`.acceptance/a9-31-developer/policy-p1-repair-r3/`；报告追加§7。不提交、不打包、无远端。

### 2026-10-05：P1修复r3本地完成（未提交），待Codex第三次复核

按ADR-0183实施：policy.ts回到HEAD只加F1与R（差异25行，af589fc1…），测试policy.test.ts 82333258…、a9-background-tools.test.ts 18f8ace5…，未提交。红13失败/264通过，绿277/277；差分775条HEAD ASK→r3非ASK为0、20个反例全ASK；全量（先构建）Core 457、Runner 166、State 82、Shell 117、release 200通过/2 SKIP、其余全部退出码0，dist恢复、5448基线0差异。[报告](../reports/2026-10/a9_31_policy_p1_repair_2026-10-05.md)（SHA256 bde7b54f7929df071b3ddf00738d06d1508a024ae4d252f47c4ab641697ee96b）追加§7。不提交、不打包、无远端；未在Win7实机验证。

### 2026-10-05：Codex第四轮复核（r3）——超集成立，P1=2（均为HEAD已有漏报）、P2=1（r3新增误确认）；修订r4草案

负责人转回Codex对r3的复核：撤除F1与R后与HEAD全文相同，HEAD ASK不被放宽由构造成立（两组构造5,122/13,878条中0放宽），三轮20个反例两入口均needs_approval、派发0，撤回F1/R时测试分别6/18项变红。P1-1：R漏掉`$script:tool`、`${…}`、中文名、反引号转义及cmd `@!PKG!`等调用形式；P1-2：递归进入`$()`、cmd `if`/`for … do`载荷时外层上下文丢失；两项HEAD与r3均ALLOW。P2-1：`if ($true) { npm test }`、`${tool}='npm'; & ${tool} test`及单引号/注释中的词触发R，HEAD ALLOW→r3 ASK。我方复现一致。scratchpad原型（非证据）：上述P1全ASK、P2恢复ALLOW、20反例全ASK、775条中0放宽、语料新增ASK与r3相同。[修订r4](../plans/A9_31_POLICY_P1_REPAIR_R4_AMENDMENT.md)（SHA256 9e9b58108e034c74804ca46fd343a16de37946520472be4c002e8a1230cea15c）DRAFT_NOT_APPROVED，并提出收敛标准（回归、已报告反例、明显误确认为阻断；HEAD也放行的新写法登记为已知限制）。修复仍未提交；未在Win7实机验证。

### 2026-10-05：P1修复修订r4批准（含收敛标准）与实施前C14登记

负责人回复“批准，采用收敛标准”，绑定[修订r4](../plans/A9_31_POLICY_P1_REPAIR_R4_AMENDMENT.md)原文SHA256 9e9b58108e034c74804ca46fd343a16de37946520472be4c002e8a1230cea15c（实施前复核一致），ADR-0184。C14：`src/core/src/policy.ts`、`src/core/tests/policy.test.ts`、`src/core/tests/a9-background-tools.test.ts`；证据目录`.acceptance/a9-31-developer/policy-p1-repair-r4/`；报告追加§8。不提交、不打包、无远端。

### 2026-10-05：P1修复r4本地完成（未提交），待Codex第四次复核

按ADR-0184实施：policy.ts 3b94f859…（相对HEAD 78行），policy.test.ts db748bb1…，a9-background-tools.test.ts b143e898…，未提交。红14失败/277通过，绿291/291；差分801条HEAD ASK→r4非ASK为0、27个反例全ASK、无新增误确认；全量（先构建）Core 471、Runner 166、State 82、Shell 117、release 200通过/2 SKIP、其余全部退出码0，dist恢复、5448基线0差异。按收敛标准自查三项均满足。[报告](../reports/2026-10/a9_31_policy_p1_repair_2026-10-05.md)（SHA256 b2754a294dd6db8399eeaa56a132d76fc97576b2033fe7e2aa108f8265cddeb5）追加§8。不提交、不打包、无远端；未在Win7实机验证。

### 2026-10-05：r4独立复核四项P1与本轮r5修复授权

独立复核确认HEAD ASK超集和原语料，但发现四项阻断：普通条件/循环/赋值误确认；字符串/注释调用文本误确认；点调用及括号花括号变量漏报；四层EncodedCommand内子表达式丢失外层风险。§8自查结论不构成独立审核通过，旧结果保留。
负责人明确要求建立6.1sol xhigh修复对话，随后由原对话独立只读审核。本轮准确基线HEAD `ebda91123e62b225c3fd104c9c9b564a4b61c466`、分支`codex/a9-31-background-tools`；只修`src/core/src/policy.ts`、`src/core/tests/policy.test.ts`、`src/core/tests/a9-background-tools.test.ts`，维护原报告和必要治理记录。ADR-0185补充ADR-0184而不改Accepted正文，收敛标准不变。
新本地证据目录`.acceptance/a9-31-developer/policy-p1-repair-r5/`保存原字节/首失败、红绿、构造差分、两入口纯模拟、回退隔离验证、§5运行记录、dist恢复和保护清单；临时隔离副本使用独立新目录。先读全局增量规范；本工作树缺少项目`docs/acceptance/ACCEPTANCE_AND_RELEASE_WORKFLOW.md`，不补建平行合同，使用任务§5有效顺序。不启动子代理、不联网/连接远端、不执行探针命令内容、不切分支/重置/删除/提交/推送/打包；Windows/Win10/Win7均NOT_PERFORMED。

### 2026-10-05：r5本地修复与必需验证完成，交原对话独立复核

四项P1修复与准确三文件SHA见[原报告§9](../reports/2026-10/a9_31_policy_p1_repair_2026-10-05.md)。最终两文件329/329通过；隔离退回r4为29失败/300通过，退回HEAD为54失败/275通过。原5,122/13,878构造ASK→非ASK均0，撤除增量后与HEAD全文相同；32历史输入×0–4层编码×两入口320/320 needs_approval、模拟派发0。原普通开发误确认及旧P2均恢复ALLOW；真实变量调用的已接受保守确认保留。
§5先构建后检查全部退出码0：Core509、Runner166、State82、Shell117、release200通过/2 Windows专项SKIP；24个Runner dist恢复原字节，受跟踪0差异、无新增untracked；原冻结5448文件0差异。报告与六文件最终SHA/保护检查集中在`policy-p1-repair-r5/`，没有并行台账。源码未提交，原对话独立审核待执行，不登记DEVELOPER_VERIFIED；真实危险命令、远端/网络、Windows/Win10/Win7、打包/新候选、提交/推送/发布均NOT_PERFORMED。

### 2026-10-05：Codex第五轮复核（r4）——按收敛标准仍有阻断项；来源分类

负责人转回Codex对r4的结论与来源分类（HEAD→r3→r4同输入求值）：条件中的变量表达式误确认（如`if ($env:CI -eq …)`）ALLOW→ALLOW→ASK，**r4引入**；`foreach`头与普通赋值表达式误确认ALLOW→ASK→ASK，**r3引入**（上轮复核与我方自查均未覆盖）；引号/注释中的`& ${tool}`误确认ALLOW→ALLOW→ASK，**r4引入**；点调用/括号包裹的花括号变量、四层EncodedCommand内`$()`调用ALLOW→ALLOW→ALLOW，为原有漏报、r4未补齐。修复未放行任何HEAD为ASK的输入。我方以构造的同类输入复现：`if ($env:CI -eq 'true') { npm test }`、`foreach ($f in $files) { npm test }`、`$out = (Get-Date); npm test`、引号与注释中的`& ${tool}`、`. ${tool} publish`、四层编码载荷，结果与Codex分类一致。**更正**：报告§8“语料中除已接受的两条外无新增误确认”只对测试语料成立，语料缺少普通开发脚本写法，该自查结论过度概括。R把“以变量开头且带参数”的段当作调用，误把条件、循环头和赋值当成变量调用；`& ${…}`文本检查未去除引号与注释。修复仍未提交；未在Win7实机验证。

### 2026-10-05：原对话对r5的独立只读审核——按收敛标准未发现阻断项

负责人要求原对话审核r5。只读进行：工作树未构建、未运行测试、未修改源码；编译与测试均在scratchpad副本。核对：分支/HEAD/暂存区为空，源码改动恰为三文件，六文件SHA与`delivery-files-r2.json`一致（policy.ts 32dca485…）。①回归：HEAD与r5分别编译，语料373＋432组合＋四轮27个已报告反例共832条，HEAD ASK→r5非ASK为0；相对HEAD删除的行均为参数化改写，默认读法（`variableCalls=false`）保留HEAD原`${…}`规则。②已报告反例：27条全部ASK；第五轮点调用`${…}`与四层EncodedCommand内`$()`均由ALLOW变ASK。③误确认：第五轮条件/foreach/赋值/引号/注释五类恢复ALLOW；另以独立编写的38条普通开发命令（含条件、循环、赋值、函数、管道、cmd if/for及npm/cargo/reg/sc等词）对照，HEAD ALLOW→ASK在r4为10条、r5为0条，4条危险对照r5全部ASK。测试：副本中两文件329/329，换回r4（3b94f859…）为29失败/300通过，与对方报告一致。§5全量记录退出码全0（Core 509），24个Runner dist已恢复（工作树`src/runner/dist`无改动），5448冻结基线0差异。未复跑对方的5,122/13,878两组构造，属引用对方证据。治理观察：r5授权依据为负责人在另一对话的口头要求（ADR-0185），本轮未有按SHA绑定的修订材料，请负责人确认。结论：按ADR-0184收敛标准未发现阻断项；修复仍未提交，未登记DEVELOPER_VERIFIED，未在Win7实机验证。

### 2026-10-05：r6普通表达式P1续修授权

负责人直接要求修复r5仍未补齐的原P1-1类别：`-eq'true'`/`-ne0`相邻操作数、`$paths[ 0 ]`索引及`$start .. $end`范围表达式被R误认变量调用，HEAD均ALLOW。该补充反例使前节“未发现阻断项”不再适用，原审核记录保留。
继续同分支/HEAD及原三个实现/测试路径；维护原报告和本任务记录，证据仅新增`.acceptance/a9-31-developer/policy-p1-repair-r6/`及独立临时副本，r1–r5不覆盖。实现为ADR-0185既定表达式分类的词法补齐，不改变安全模型、HEAD判断、递归上限或ADR-0184收敛标准。先保存失败/红测试，再检查真实调用保守确认、两入口模拟、构造差分与§5必要验证。无子代理、网络/远端、危险命令内容、提交/推送/打包/发布或Win7授权。

### 2026-10-05：r6本地修复完成，待独立复核

普通相邻操作数、索引空格和范围表达式已补齐，准确机制、SHA及证据见[原报告§10](../reports/2026-10/a9_31_policy_p1_repair_2026-10-05.md)。两测试文件355/355；红及隔离退回准确r5均18失败/337通过。16条普通表达式HEAD/r6 ALLOW、r5 ASK，另6调用对照r6 ASK；两入口44检查0失败。原5,122/13,878构造HEAD ASK→非ASK均0，32历史输入×0–4编码×两入口320/320 needs_approval、模拟派发0。
§5先构建后必需检查全部退出码0：Core535、Runner166、State82、Shell117、release200通过/2 Windows专项SKIP；24个Runner dist恢复，受跟踪0差异，无新增untracked。原5448冻结文件0差异，r1–r5旧证据保留。五文件最终SHA与保护清单集中于`policy-p1-repair-r6/`。源码未提交，不登记DEVELOPER_VERIFIED；r6独立审核、Windows/Win10/Win7、网络/远端、打包/提交/推送/发布均NOT_PERFORMED。

### 2026-10-06：原对话对r6的独立只读审核——按收敛标准未发现阻断项；更正r5审核

**更正**：r5审核时我方普通命令语料未覆盖操作符相邻操作数、索引空格与范围表达式，负责人补充的反例证明r5在这一类仍有误确认，前条“r5未发现阻断项”对该类不成立。r6只读审核（工作树未构建/测试/修改；编译与测试在scratchpad副本）：分支/HEAD/空暂存区，源码改动仍为三文件，`delivery-files.json`五文件SHA全部一致（policy.ts d06b03e0…），相对HEAD删除行仍为12行参数化改写。①回归：HEAD与r6分别编译，语料399＋432组合＋27个已报告反例共858条，HEAD ASK→r6非ASK为0。②已报告反例：27条全部ASK，第五轮点调用`${…}`/括号/四层编码`$()`保持ASK。③误确认：我方另行独立编写205条以变量开头的表达式（比较/逻辑/匹配/索引/范围/类型/位运算/格式化/拆分/成员访问/自增/管道/重定向等，置于if/while/赋值/foreach并含`npm test`），HEAD ALLOW→ASK在r5为14条、r6为0条；7条真实变量调用对照（含`& $arr[0]`、`& $h['k']`、`& ($x)`、`. $b`、cmd `!X!`）r6全部ASK；此前38条普通命令r6为0。测试：副本两文件355/355，换回r5（32dca485…）为18失败/337通过，与对方一致。§5全量记录全0（Core 535），Runner dist无残留改动，5448冻结基线0差异。未复跑对方5,122/13,878构造与320项编码入口检查（引用对方证据）。结论：按ADR-0184收敛标准未发现阻断项；不排除仍有我方语料未覆盖的普通写法。修复未提交，未登记DEVELOPER_VERIFIED，未在Win7实机验证。

### 2026-10-06：Shell Policy P1修复源码提交材料（仅草案）

负责人在r6审核后要求起草；[源码提交材料](../plans/A9_31_POLICY_P1_SOURCE_COMMIT_APPROVAL.md)（SHA256 f48ebd273a6352728a57e4e79b13810130a4981c66865ed5a92a602d03db69fa）DRAFT_NOT_APPROVED：仅本地提交r6三文件（policy.ts d06b03e0…、policy.test.ts 881878ea…、a9-background-tools.test.ts a05e5493…），父ebda911，拟提交补丁SHA256 1bcf9af3…（+389/−12）；逐项暂存、核对staged补丁与其余dirty/untracked逐hash不变；治理文档/dist/证据不入提交，不推送/合并。提交后Win10证据对新源码失去直接绑定，新包与Win10重验另起材料。未提交；未在Win7实机验证。

### 2026-10-06：源码提交材料批准与执行前C14登记

负责人回复“批准”，绑定[源码提交材料](../plans/A9_31_POLICY_P1_SOURCE_COMMIT_APPROVAL.md)原文SHA256 f48ebd273a6352728a57e4e79b13810130a4981c66865ed5a92a602d03db69fa（执行前复核一致），并据此确认按ADR-0184收敛标准收口。C14仅新增`.acceptance/a9-31-developer/policy-p1-source-commit-r1/`下`pre-commit-status.json`、`proposed.patch`、`staged.patch`、`source-commit-result.json`。只本地提交三文件，不推送/合并/改写历史。

### 2026-10-06：Shell Policy P1修复源码提交完成（本地，未推送）

按批准材料执行：提交前HEAD ebda911、分支、空index、三文件SHA及补丁SHA（1bcf9af3…）全部核对一致，提交前状态81项逐hash记录；只逐个暂存三文件，staged补丁SHA等于批准值。**新提交`8d207ab11d2c8134a81e4e62900f395aae99944e`**，父`ebda911…`，信息`fix(core): confirm ambiguous shell quoting and variable dispatch under control flow`（含Co-Authored-By行）。提交后核对：仅三文件、三blob与材料一致、工作区三文件hash不变、index为空、其余78项dirty/untracked逐hash不变；5448冻结基线0差异。证据`policy-p1-source-commit-r1/`（`source-commit-result.json`=`SOURCE_COMMIT_DONE`）。治理文档/dist/证据未入提交；未推送/合并/改写历史。**影响**：R5–R9 Win10证据与ADR-0180组合结论绑定`ebda911`装配的包，对新源码`8d207ab`失去直接绑定；新包与Win10重验另起材料；DEVELOPER_VERIFIED未登记；未在Win7实机验证。

### 2026-10-06：r4开发包装配与Win10单根全量重验材料（仅草案）

负责人要求起草；[r4包与Win10重验材料](../plans/A9_31_PRODUCT_R4_PACKAGE_WIN10_APPROVAL.md)（SHA256 f784fa4a226ccc8393a71a94f481e59fc2a86349b2114308730996ed27dd06a8）DRAFT_NOT_APPROVED：C1由`8d207ab`干净检出装配r4包（生产者、锁、三个离线输入与r3相同，起草时只读核对SHA一致；`product-r4`当前不存在）；C2新远端根`A9-A31-Product-R4-20261006-R1`，R9现行测试工具仅换绑定（根、批准、source、ZIP/manifest及观察器重编），反向换绑须与R9逐字相同，另加一项在Win10 Node16上直接加载新包Policy模块的准入检查；C3一个入口10请求（含Boot、两次人工点击、Recovery最后），全部正式评审PASS时记单根通过。待D1–D3。未实施；未在Win7实机验证。

### 2026-10-06：r4包与Win10单根重验批准及实施前C14登记

负责人回复“批准，D1同意，D2选B，D3重跑”，绑定[材料](../plans/A9_31_PRODUCT_R4_PACKAGE_WIN10_APPROVAL.md)原文SHA256 f784fa4a226ccc8393a71a94f481e59fc2a86349b2114308730996ed27dd06a8（实施前复核一致），ADR-0186。HEAD `8d207ab`/分支/APPROVED_FOR_IMPLEMENTATION保持。

**C14准确路径（实施前登记，均为新增，不改任何既有文件）**：
- C1 `.acceptance/a9-31-developer/product-r4/`：`source-checkout/`（`clone --no-checkout --shared`后detached检出`8d207ab`，八个`.git/info/exclude`登记的离线node_modules链接）、`package/`（生产者输出）、`build-r4-package.py`、`package-execution-inputs.json`、`package-execution-result.json`、`package.stdout`、`package.stderr`、`package-verification-input.mjs`、`package-verification-result.json`、`package-verification.stderr`、`package-policy-probe.cjs`、`package-policy-current.json`、`package-identity.json`。
- C2 `.acceptance/a9-31-developer/product-r4-win10-r1/`：批准与绑定`approved-contract.md`、`owner-approval.json`、`scope-approval.json`、`preparation-binding.json`；外部源`control-scripts/{stage-product-r3.ps1,launch-product-r3-desktop.ps1,serve-product-r3-desktop.ps1,product-r3-driver.cjs}`、`event-sources/{manifest-process-observer.cs,launch-manifest-observer.ps1}`（均由R9派生，仅换绑定）；派生与冻结产物`observer-block.json`、`observer-components/v1/pin.json`、`frozen-control/`（master-pin与四个revision目录下各脚本、revision/checks/registration）、`admission-binding.json`、`capture-inheritance.json`、`capture-inherited/`、`source-input-derivation.json`、`fixtures/`、`expand-and-parse.ps1`、`admission-inputs/`（R9同名十一项及新增`validation-policy-package.ps1`）、`policy-corpus.json`、`make-policy-corpus.cjs`、`driver-local-self-test.json`、`observer-admission-r1b.json`、`frozen-admission-result.json`、`ordinary-desktop-entry-command.txt`；工具（R9同名字节拷贝）`remote-actions.py`、`observer-components.py`、`prepare-runtime-admission.py`、`run-admission-checks.py`、`desktop-execution.py`、`observe-runtime.py`、`observe-progress.py`、`phase-summary.py`、`return-one-run.py`、`return-partial-evidence.py`、`review-phase.py`、`review-negative.py`、`review-phase-r9.py`、`r4-phase.py`（=`r9-phase.py`更名）；（改写）`derive-r4-control.py`、`prepare-r4-local.py`、`deploy-r4-preparation.py`、`finish-current-admission.py`、`freeze-admission.py`。
- C3 执行记录（工具按唯一label独占生成）：`<label>-input.ps1`、`<label>.stdout`、`<label>.stderr`、`<label>-execution.json`、`<label>-batch.txt`、`directed-*.json`、`stage-*.json`、`win10-expand-and-parse.json`、`observer-*`、`dispatcher-status-*`、`status-*`、`dispatch-*`、`phase-*`、`finish-*`、`requests/`、`return-*/`、`review-*.json`、`ordinary-entry-confirmed.json`、`win10-evidence-matrix-r4-r1.json`。
- 远端`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R4-20261006-R1`及其下由上述工具创建的内容。

### 2026-10-06：r4 C1完成；C2展开首次失败与C14补充登记（创建前）

**C1完成**：`product-r4/`干净检出`8d207ab`并以r3相同生产者/锁/输入装配，生产者退出0；新ZIP `e96fdf9678ffede770704fa68cfd39ea7ac6bf42ba0c3dd5fd400aa7dd7cd1a0`（101,330,419字节），manifest `d084907ce7d488f0bf98984b49fe09b6e6d5c86b0c9786db46a33c40e62eda1c`，784文件；同源闭包与入口检查`PASS_LOCAL_PACKAGE_CLOSURE_AND_ENTRY_CHECKS`；包内`policy.js`（593568886991…）与以生产者相同参数编译`8d207ab`的产物逐字节一致，helper仍`2036bf69…`；与r3包相比仅SBOM、release-manifest、开发检查记录与`policy.js`四个文件不同；包内Policy本地纯求值`PACKAGED_POLICY_PROBE_PASS`（28个已报告反例×0–4层编码共140条ASK、238条普通语料与HEAD一致、11条调用对照ASK）。身份记录`package-identity.json`。

**C2进展与偏差（如实登记）**：远端R4根已建（三个未变输入自R9根复制并校验，新ZIP上传后校验SHA/大小一致）；观察器在R4重编（EXE 6ca838a5…，MVID b697934d…，38项自检）并两轮准入通过（2与12个conhost proof，零丢失）；控制脚本由R9仅换绑定派生、反向换绑逐字相同；`prepare-r4-local.py`生成master `222ee0f0…`与四个revision，本地Node20 24行通过，40个派生文件无R9根/旧source/旧包哈希/旧大小残留。①`observer-components.py`含source常量，实际为“仅换source常量”的派生而非登记所写的字节拷贝；②`review-phase.py`/`review-negative.py`在R9目录不存在，取自R8（与R5字节相同）。③**展开首次失败**：`deploy-r4-preparation.py`沿用R9只换根的做法，`expand-and-parse.ps1`中`source_commit`仍要求`ebda911`，在产品与宿主展开后报`INTEGRITY_PRODUCT_IDENTITY`；失败记录（`win10-expand-and-parse.*`、`expand-input-upload*`、`locked-small-input-transfer-r1*`）保留；部署脚本的fixtures上传未执行。因展开函数要求空目录且不得删除远端，**补充登记**（创建前）：`product-r4-win10-r1/expand-and-parse-r2.ps1`——同一脚本的“核验已展开”变体：不再展开，逐项比对已展开目录与ZIP条目（集合相同、每文件SHA一致、无多余文件），其余检查不变、source换为`8d207ab`；及其执行记录`expand-r2-input-upload*`、`win10-expand-and-parse-r2*`、`win10-expand-and-parse-r2.json`。

### 2026-10-06：r4 C2准入在files-scope停止——取证组件构建来源绑定旧source，超出批准范围，暂停上报

展开核验变体`expand-and-parse-r2.ps1`通过（`PRODUCT_R4_TARGET_TRANSFER_EXISTING_EXPANSION_VERIFIED_PS_PARSE_PASS`：784/73逐项与ZIP一致、无多余文件、PS解析通过、source 8d207ab、载荷哈希一致）；fixtures 4项上传校验通过；revision上传后定向检查schema 336、api 27、interval 23、entry 22通过，**files-scope失败**：`actual_file_gate_valid`=`INTEGRITY_CAPTURE_BUILD_FAILED`。根因（源码直接核对）：控制器`Capture-Build`要求取证组件构建记录`source`等于当前source，`Capture-BuildApproval`要求原构建批准记录source相同并写死r3合同`37cd8d4b…`、ADR-0168与构建批准`dd64e5bf…`；继承的`capture-build.json`/`capture-build-scope-approval.json`为r3在`ebda911`下编译时所记（DLL 93f1979a…，MVID 29314b2e…）。R5–R9 source未变故未暴露。可行路径均超出已批准“仅换绑定、不改capture”：改写构建记录source（伪造来源，不采用）、在新根以同源同编译器重编capture并换绑上述构建批准常量（master/revision与已跑检查须重做）、或改控制器校验逻辑。按CLAUDE.md规则2暂停，未继续后续准入、未冻结、未启动入口。R4根（R1）保留现状（展开与部分检查已执行），无删除。未在Win7实机验证。

### 2026-10-06：r4取证组件重编修订（仅草案）

负责人要求起草；[取证组件重编修订](../plans/A9_31_PRODUCT_R4_CAPTURE_REBUILD_AMENDMENT.md)（SHA256 da7c6341bbd11878a0e625aa195ada1fc57c822fa9eb16c6a9942ddbb59d4f33）DRAFT_NOT_APPROVED：新根`A9-A31-Product-R4-20261006-R2`；以现有`stage -PrepareCapture`机制用同一C#源/编译器/参考程序集重编取证组件并绑定`8d207ab`；R2批准记录采用r3八字段格式兼作构建批准；换绑表增加r3取证构建批准常量与旧组件绑定；先部署stage再编译再派生其余文件，准入在R2全部重做；R1保留不删。待D1/D2。未实施；未在Win7实机验证。

### 2026-10-06：取证组件重编修订批准与R2实施前C14登记

负责人回复“批准，D1用R2，D2同意”，绑定[修订](../plans/A9_31_PRODUCT_R4_CAPTURE_REBUILD_AMENDMENT.md)原文SHA256 da7c6341bbd11878a0e625aa195ada1fc57c822fa9eb16c6a9942ddbb59d4f33（实施前复核一致），ADR-0187。**C14准确路径（均新增，位于`.acceptance/a9-31-developer/product-r4-win10-r2/`）**：批准与绑定`approved-contract.md`（本修订字节拷贝）、`approved-base-material.md`（r4材料f784fa4a…字节拷贝）、`owner-approval.json`、`scope-approval.json`（r3八字段格式）、`preparation-binding.json`；外部源`control-scripts/`四件与`event-sources/`两件（由R9派生仅换绑定，含取证构建批准常量与组件绑定）；取证组件`capture-built/{capture-build.json,capture-library.dll,capture-source.cs,capture-build-scope-approval.json}`与`capture-binding.json`；派生与冻结产物`observer-block.json`、`observer-components/v1/pin.json`、`frozen-control/`、`admission-binding.json`、`source-input-derivation.json`、`fixtures/`、`expand-and-parse.ps1`、`admission-inputs/`（R9同名十一项与`validation-policy-package.ps1`）、`policy-corpus.json`（R1同字节）、`make-policy-corpus.cjs`（R1同字节）、`driver-local-self-test.json`、`observer-admission-r1b.json`、`frozen-admission-result.json`、`ordinary-desktop-entry-command.txt`；工具（R1同名字节拷贝）`remote-actions.py`、`observer-components.py`、`prepare-runtime-admission.py`、`run-admission-checks.py`、`desktop-execution.py`、`observe-runtime.py`、`observe-progress.py`、`phase-summary.py`、`return-one-run.py`、`return-partial-evidence.py`、`review-phase.py`、`review-negative.py`、`review-phase-r9.py`、`r4-phase.py`；（改写）`derive-r4r2-control.py`、`prepare-r4r2-local.py`、`deploy-r4r2-preparation.py`、`finish-current-admission.py`、`freeze-admission.py`；执行记录与R1登记相同族（`<label>-input.ps1`/`.stdout`/`.stderr`/`-execution.json`/`-batch.txt`、`directed-*.json`、`stage-*.json`、`win10-expand-and-parse.json`、`observer-*`、`dispatcher-status-*`、`status-*`、`dispatch-*`、`phase-*`、`finish-*`、`requests/`、`return-*/`、`review-*.json`、`ordinary-entry-confirmed.json`、`win10-evidence-matrix-r4-r2.json`）。远端`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R4-20261006-R2`及其下由上述工具创建的内容（含`compile\<run>\`）。

### 2026-10-06：R2准入sync-current输入派生偏差更正（实施前登记）

R2本地准备`prepare-r4r2-local.py`误把`validation-sync-current`按R9字节模板化（R1准备脚本无此项；R9流程是在sync-actual之后由`finish-current-admission.py`以**当前根**sync-actual实际回执重新生成）。
首次执行`directed-validation-sync-current-r1`以`LIFECYCLE_SYNC_RECEIPT_PARENT_NOT_PINNED`前置失败（cases为空，未执行任何判据；输入内嵌的是R9实际运行的父进程pid/creation_ticks）。该失败记录与已执行输入原样保留，不覆盖。
更正按R9流程：**新增准确路径**`.acceptance/a9-31-developer/product-r4-win10-r2/admission-inputs/validation-sync-current-r2.ps1`（由已登记的`finish-current-admission.py`以R2 `directed-validation-sync-actual.json`实际回执、R2 master、R9→R2换绑表生成），执行记录`directed-validation-sync-current-r2-r1*`。判据与R9逐字相同；不改任何检查逻辑。

补充（同日）：`validation-sync-current-r2.ps1`执行即被既有守卫`OLD_PROBE_RUN`拒绝（模板沿用R9固定探针run_id `a36482d6…`，首次失败执行已在R2创建该run目录；守卫按设计拒绝复用，未执行判据）。
记录原样保留。**新增准确路径**`admission-inputs/validation-sync-current-r3.ps1`：与r2相同生成方式，仅探针`run_id`取新随机32位十六进制（标签不复用）；`finish-current-admission.py`增加可选参数（输出名、run_id），默认值仍复现r2字节；执行记录`directed-validation-sync-current-r3-r1*`。

### 2026-10-06：r4 Win10重验R2根取证组件重编与C2准入冻结完成

- 新根`A9-A31-Product-R4-20261006-R2`（R1保留未动）；四输入自R1根逐SHA复制。R2批准记录（八字段，ADR-0187）`d4947801…`，兼作取证构建批准。
- 观察器v1重编：EXE `7b34224a…`、MVID `f353033a…`、pin `0f26ff64…`；准入r1a（1/1）、r1b（8/4）通过。
- 取证组件同源重编（run `1ea1ec00…`）：`CAPTURE_BUILD_PASS`，source `8d207ab`，C#源`dbc85763…`、csc `aae1db57…`、三参考程序集不变；新DLL `3f45cc66…`（19,968字节）、MVID `ba25f945…`、构建记录`c5afee88…`；本地`capture-built/`与远端提升件逐SHA一致。
- 控制脚本/driver/四revision/准入输入由R9仅换绑定派生（逐文件过滤换绑对，反向换绑与R9逐字相同；过时绑定扫描0命中）；master `fb4adc2b…`；本地Node20 driver四版×6项自检通过（非目标）。
- 准入（Win10目标）：展开784/73、PS解析；schema、api、interval、entry、files-scope、sync-actual、sync-current（r3，见上两节更正）、Node16四driver×6项、package-held、manifest（带参，R9同法）、real-gap、**新增包内Policy检查`PACKAGED_POLICY_TARGET_NODE16_PASS`（Node 16.17.1/Electron 22.3.27：ask 140、ordinary 238与HEAD一致、dispatch 11，0失败）**，全部PASS；冻结四revision完整闭包stage PASS（`FRESH_WIN10_R4_R2_ADMISSION_PASS_NOT_ORDINARY_PRODUCT`）。
- R5–R9冻结5448文件基线0差异；入口前只读：R2无请求/无dispatcher/无观察器；旧R9入口PowerShell 113308与R5遗留Electron仍在（不结束）。
- 入口命令见`product-r4-win10-r2/ordinary-desktop-entry-command.txt`；C3待负责人启动入口。Win10准入为管理员隔离检查，非普通产品证据；未在Win7实机验证。

### 2026-10-06：r4 Win10 C3结果——单根通过

负责人启动R2普通入口（首次误运行旧R9命令，被`INTEGRITY_OLD_DISPATCHER_ENTRY`拒绝、无副作用，已只读核实）。10请求全部首次通过正式评审，dispatcher自行COMPLETED；StopExit 2.1秒/response 0、ReleaseExit 3.8秒/response 1；conhost manifest证明在普通环境真实触发并解析。详见[统一报告§15](../reports/2026-10/a9_31_r5_manifest_proof_handoff_2026-10-05.md)与矩阵`product-r4-win10-r2/win10-evidence-matrix-r4-r2.json`（另含`dispatcher-final-return/dispatcher-final.json`、`phase-recovery-r4r2-1-from-return.json`，属已登记执行记录族）。结论`WIN10_SINGLE_ROOT_PASS`；DEVELOPER_VERIFIED登记待负责人裁决；未在Win7实机验证。

### 2026-10-06：DEVELOPER_VERIFIED登记材料（仅草案）

负责人要求起草；[登记材料](../plans/A9_31_DEVELOPER_VERIFIED_REGISTRATION.md)（SHA256 166ee45d9742a48ab77e06a9655db9a0ccad689d018457df8a5fbe2c815d5d39）DRAFT_NOT_APPROVED：依裁决r2链（G1 Codex首轮P1经r1–r6按ADR-0184收口、G2 r6全量绑定`8d207ab`源码树、Win10 R2单根通过、managed native复核）请求登记`A9_31_DEVELOPER_VERIFIED`，附G3（A9-34推迟）、G4（Esc/取消未实测）、Policy识别边界；待D1（登记前是否交Codex聚焦复核R2证据，推荐）与D2。未登记，Phase-Gate不变；未在Win7实机验证。

### 2026-10-06：DEVELOPER_VERIFIED登记材料批准（D1=B），Codex聚焦复核请求已生成

负责人回复“批准，D1选B，D2同意”，绑定[登记材料](../plans/A9_31_DEVELOPER_VERIFIED_REGISTRATION.md)原文SHA256 166ee45d9742a48ab77e06a9655db9a0ccad689d018457df8a5fbe2c815d5d39（复核一致）。按D1=B先交Codex聚焦只读复核R2证据集与工具偏差：[复核请求](../reports/2026-10/a9_31_developer_verified_r2_evidence_review_request_2026-10-06.md)；结论由负责人带回，无P0/P1时执行材料§4登记（ADR-0188），出现P0/P1回到负责人裁决。Phase-Gate暂不变；未在Win7实机验证。

### 2026-10-06：Codex聚焦复核0/0/0，登记`A9_31_DEVELOPER_VERIFIED`（ADR-0188）

负责人转回Codex对[R2证据复核请求](../reports/2026-10/a9_31_developer_verified_r2_evidence_review_request_2026-10-06.md)的只读复核：请求SHA/分支/HEAD一致，复算与评审重跑均在其独立副本（原工作树及R2/R9共4,493文件前后SHA一致），未连远端/启动产品/构建测试，未复核Policy源码。P0/P1/P2=0/0/0：r4 ZIP/manifest、784文件闭包、源码绑定、批准与入口身份无矛盾；十请求、八phase、普通入口与dispatcher COMPLETED均有返回支持，1,093返回文件逐SHA与秘密扫描一致，十份评审独立重跑逐字节相同。信息项：①master、四revision、十一准入输入及内嵌JSON/serve定义经按键/文本位置还原得R9原字节，两旧值并一新值处用途正确（补证来自复核，原生成仅正向）；②sync-current r3相对r2只换run_id，回执来自本根，77项通过；③Recovery组装件与返回一致（signals仅省略长度元数据，评审不读）；④manifest带参重跑40项有效；⑤conhost只能窄范围解除（cmd父分支已真实触发），不扩大到PowerShell父分支、重复可靠性、QueryHandle成功或Win7。Codex报告位于其临时目录（本仓库外，未纳入证据）。

按[登记材料](../plans/A9_31_DEVELOPER_VERIFIED_REGISTRATION.md)（166ee45d…）§4登记：Phase-Gate改为`A9_31_DEVELOPER_VERIFIED`，ADR-0188；源码`8d207ab`（本地，未推送）。已知限制G3（A9-34推迟，A9-33须列明）、G4、Policy识别边界、conhost窄范围。Win7-Validation保持`NOT_PERFORMED`；不签发独立验收、Alpha2/RC；**未在Win7实机验证**。

### 2026-10-06：ADR索引补齐与治理文档提交材料（仅草案）

负责人要求补齐ADR索引：`docs/DECISIONS_INDEX.md`按正文标题与首条状态补入ADR-0150–0187（37行，0169为主仓另一分支所用、本分支正文未收录，已在表头注明），连同0188共38行。
随后起草[治理文档提交材料](../plans/A9_31_GOVERNANCE_DOCS_COMMIT_APPROVAL.md)（SHA256 a72bd2ec2a8e7922805ea6035b0bf09ce1e99a5138999384b31a12468976ae70）DRAFT_NOT_APPROVED：仅本地提交84个`docs/`路径（路径清单SHA256 352693a6…），不含源码/证据，不推送；待D1（两处SSH私钥路径原样或改写）、D2（提交信息）。

### 2026-10-06：治理文档提交材料批准与执行前C14登记

负责人回复“批准，D1选A，D2同意”，绑定[治理文档提交材料](../plans/A9_31_GOVERNANCE_DOCS_COMMIT_APPROVAL.md)原文SHA256 a72bd2ec2a8e7922805ea6035b0bf09ce1e99a5138999384b31a12468976ae70（执行前复核一致）。D1=A：两处SSH私钥路径原样提交；D2：采用材料§2.4提交信息。C14仅新增`.acceptance/a9-31-developer/governance-docs-commit-r1/`下`pre-commit-status.json`、`staged-name-status.txt`、`commit-result.json`。只本地提交附录A的84个路径，不推送/合并/改写历史。

### 2026-10-06：治理文档本地提交完成（未推送）

按批准材料执行：分支/HEAD `8d207ab`/空暂存区复核，工作树改动集合等于附录A 84路径，docs检查与diff --check通过；逐路径暂存、暂存blob与工作文件哈希逐一一致，钩子未绕过。提交`2b6f3e22301b5b8a9e3593256eb5a3fccfa2a811`（父`8d207ab`），变更路径恰为附录A，提交后工作树干净。证据`.acceptance/a9-31-developer/governance-docs-commit-r1/`（`commit-result.json`=`GOVERNANCE_DOCS_COMMIT_DONE`）。未推送/合并；本条目将随下一次提交带入。未在Win7实机验证。

### 2026-10-06：分支推送材料（仅草案）

负责人要求起草；[推送材料](../plans/A9_31_BRANCH_PUSH_APPROVAL.md)（SHA256 196a1d19d98d0ab43d2ff82c40249dce14343377a28927baf91974fcbf2c26ce）DRAFT_NOT_APPROVED：origin为公开仓库；把`codex/a9-31-background-tools`推送为同名新远端分支（25提交，含A9-30从未推送的14个），不建PR/不合并。新增公开暴露：测试机主机名、账户名、更多私网地址、SSH私钥路径（均无凭据内容）。待D1（接受暴露）、D2（先提交任务书与本稿再推送，推荐）、D3（A9-30提交一并公开）。

### 2026-10-06：分支推送材料批准与执行前C14登记

负责人回复“批准，D1接受，D2选B，D3确认”，绑定[推送材料](../plans/A9_31_BRANCH_PUSH_APPROVAL.md)原文SHA256 196a1d19d98d0ab43d2ff82c40249dce14343377a28927baf91974fcbf2c26ce（执行前复核一致）。D1接受§2新增公开暴露；D2=B先本地提交任务书与推送材料两路径；D3确认A9-30的14个提交一并公开。C14仅新增`.acceptance/a9-31-developer/branch-push-r1/`下`pre-push-status.json`、`push-output.txt`、`push-result.json`。仅推送`codex/a9-31-background-tools`为同名新远端分支，不建PR/不合并/不强推。

# A9-31 — 托管后台进程工具

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: EXECUTION_CAPABILITY
Target Branch: codex/a9-31-background-tools
Source Baseline: c2b6356f83ef8502a34516010924547c57a3bec2
Phase-Gate: A9_31_IMPLEMENTATION_IN_PROGRESS
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
npm test --workspace=@win7-agent/core -- --runInBand --runTestsByPath tests/a9-tools.test.ts tests/a9-background-tools.test.ts tests/a9-agent-loop.test.ts tests/a9-shell-streaming.test.ts tests/a9-audit-integrity.test.ts tests/a9-verification-evidence.test.ts tests/a9-context-budget.test.ts tests/a9-permission-modes.test.ts
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
模块定向检查完成后执行 verify:quick；新变化/失败扩大到受影响项，不机械重跑全部已验证稳定宿主项。

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

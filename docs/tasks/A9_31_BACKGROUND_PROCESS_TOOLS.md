# A9-31 — 托管后台进程工具

```text
Status: DRAFT_READY_FOR_REVIEW
Task Type: EXECUTION_CAPABILITY
Target Branch: codex/a9-31-background-tools
Source Baseline: c14a96808d048c34f6079cc378ba12b4f60f5c62 (inspection only)
Phase-Gate: A9_31_DESIGN_PENDING_APPROVAL
Win7-Validation: NOT_PERFORMED
Decision: ADR-0151 (Proposed)
```

## 1. 授权与依赖

2026-10-01 草稿，仅文档获准。实现前批准本任务及 ADR，绑定已审核 A9-30 整合后的准确 source hash，
在上述独立干净分支执行；inspection baseline 不冒充含实时输出的实现基线。
复用 [helper v3](../plans/A9_HELPER_V3_STREAMING_PROTOCOL.md)，release 扩展需要新 revision、
D-013/D-017 评审及双构建重锁，不拿 A9-30 旧字节证明替代。

## 2. 模型工具与身份

复用 BackgroundProcessManager，strict schema，additionalProperties=false：

| 工具 | 输入 | 返回 |
|---|---|---|
| start_process | 非空 command（沿用 shell 长度上限）、可选 cwd（沿用路径规则）；无 PID/Shell path/env 覆盖 | handleId、starting/running/failed、启动身份/cleanupRequired；ready 失败不能成功 |
| read_process_output | handleId、cursor（首读可省）、maxBytes=8192（1..16384） | 按 seq entries（stream/text）、nextCursor、状态/退出码、truncated/oldestCursor；同 cursor 可重读同区间 |
| stop_process | handleId | 已验证停止/退出、cleanupRequired、诊断；重复 Stop 幂等 |

句柄绑定 canonical workspace、conversationId、原 taskId/turnId/helper requestId；模型不能提供归属、PID 或证明。
默认最多三个，本批不新增数量设置 UI。start 仍走 shell 模式/Policy/高影响目标确认。
Read Only 不开放模型 start/stop，只读当前归属记录；用户安全 Stop 保留。
错工作区/对话、未知句柄、归档身份、cursor错属/未来值结构化拒绝。
每句柄 ring 沿用每流 1 MiB/4096 发布帧上限；旧 cursor 淘汰返回 CURSOR_EXPIRED/oldestCursor，不伪装空输出。
cursor 为 Runtime 生成的不透明、绑定句柄和实例身份的游标，模型不能选择 eventId 读取别的任务。
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

## 4. 拟批准精确路径

- Core：`src/core/src/a9-tools.ts`、`src/core/src/a9-agent-loop.ts`、`src/core/src/system-prompt.ts`、`src/core/src/index.ts`。
- Runner：`src/runner/src/background-process-manager.ts`、`src/runner/src/trusted-shell-runner.ts`、`src/runner/src/trusted-shell-adapter.ts`、`src/runner/src/native-protocol.ts`、`src/runner/src/native-transport.ts`、`src/runner/src/index.ts`。
- State：`src/state/src/a9-persistence.ts`；owner/release/cursor 放版本化事件，不改表 schema。
- Shell：`src/shell/product/a9-agent-runtime.js`、`src/shell/product/a9-product-ipc.js`、`src/shell/product/preload.js`、`src/shell/product/main.js`、`src/shell/product/renderer/a9-workbench.js`、`src/shell/product/renderer/a9-workbench.css`。
- native：`native/helper/helper.cpp`、`native/helper/helper.h`、`native/helper/protocol.cpp`、`native/helper/logic_tests.cpp`、`native/helper/README.md`。
- managed kit 新 revision：根 `native/helper/build-win10-kit-v26-managed/`，精确相对文件闭集为 A9-30 §3 已逐项列出的新 kit 文件清单，仅根路径替换为本根；由新批准 source 生成，不手改第二份源码。原 `build-win10-kit-v26/` 与批准 ZIP/manifest/锁不得覆盖。
- 新输入登记：`release/win7-product-v3/a9-v26-approved-build-kits.json` 只追加 revision；新建 `release/win7-product-v3/a9-v26-managed-input-lock.json`，不覆盖 A9-30 的 `a9-v26-input-lock.json`。
- managed 发布消费：`scripts/release/build-a9-product-v3.mjs`、`scripts/release/record-a9-v26-helper-input.mjs`、`scripts/release/a9-v26-return-evidence.mjs`；只增加 managed revision/锁选择及 release proof 消费，不改历史锁或批准包。
- 测试：`src/core/tests/a9-tools.test.ts`、`src/core/tests/a9-background-tools.test.ts`、`src/runner/tests/background-process-manager.test.ts`、`src/runner/tests/native-transport.test.ts`、`src/state/tests/a9-managed-process-ownership.test.ts`、`src/shell/tests/product/a9-background-tools.test.ts`、`src/shell/tests/product/a9-lifecycle.test.ts`、`scripts/release/test/v26-prepare-kit.test.mjs`、`scripts/release/test/a9-package.test.mjs`。

文档仅本任务、helper设计、DECISIONS/WIN7_CONSTRAINTS 新段、任务/方案索引、STATUS/STATUS_LOG和任务报告。
不改历史 v24/v25、候选、系统设置、通用权限模型或凭据。

## 5. 验证和完成

Node 20.17，直接受影响 Core/Runner/State/Shell：

```sh
npm test --workspace=@win7-agent/core -- --runInBand
npm test --workspace=@win7-agent/runner -- --runInBand
npm test --workspace=@win7-agent/state -- --runInBand
npm test --workspace=@win7-agent/shell -- --runInBand
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

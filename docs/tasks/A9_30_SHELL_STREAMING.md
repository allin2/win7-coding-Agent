# A9-30 — Shell 运行中输出

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: EXECUTION_CAPABILITY
Target Branch: codex/a9-30-shell-streaming
Source Baseline: c14a96808d048c34f6079cc378ba12b4f60f5c62
Target Version: 0.3.0-alpha.2
Phase-Gate: A9_30_IMPLEMENTATION_AUTHORIZED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0150 (Accepted)
```

## 1. 授权与进入条件

2026-09-30 用户授权起草第二批设计、任务书和 Demo，2026-10-01 形成草稿。
2026-10-01，负责人明确指示“请批准 A9-30 和 ADR-0150，作为开始 Shell 实时输出实现的具体依据”，
据此登记本任务为 APPROVED_FOR_IMPLEMENTATION、ADR-0150 为 Accepted。
批准限于本任务已有范围、基线和精确白名单，不借用 A9-16/A9-09 历史授权。
仍须在上述分支独立干净工作树才允许改产品；本批准不代替原生构建、提交推送及候选门 A/B 授权。
建立工作树前核对注册，优先复用适合的干净工作树；保留主工作区已有修改。
开始实现前若 main 产品字节变化，重新绑定准确 source 并提交范围裁决，不静默套用旧基线。

完整接口、默认上限、错误与构建合同见 [helper v3 设计](../plans/A9_HELPER_V3_STREAMING_PROTOCOL.md)。
界面审阅见 [交互 Demo](../plans/a9-30-shell-streaming-demo/index.html)，模拟数据不计入实机 PASS。

## 2. 可观察交付

- 覆盖 A9-16 S01–S06；每 2 秒 tick，首条在 tool_end 前可见；双源顺序、退出状态与真实执行一致。
- native→Runner→Core→SQLite→Schema IPC→Renderer 贯通，输出先审计落盘再发布。
- 跨块 UTF-8/CP936/UTF-16LE、CR/LF、无换行、秘密及截断按设计处理；慢消费者不阻塞取消。
- 刷新、历史分页、视图返回和重启恢复已落盘输出；不虚构进程恢复或重放命令。
- chunk 不改变 verified；最终完整结构化退出失败仍撤销旧验证，不能因大输出截断丢事实。
- 本任务不启用后台模型工具、release 或继续机制；无新第三方依赖。

## 3. 已批准 C14 精确路径

以下精确白名单已随本任务获批；只改相关行为，不顺带重构。

| 子系统 | 文件 |
|---|---|
| native | `native/helper/helper.cpp`、`native/helper/helper.h`、`native/helper/protocol.cpp`、`native/helper/logic_tests.cpp`、`native/helper/CMakeLists.txt`、`native/helper/README.md` |
| 新 writer | `native/helper/stream_writer.cpp`、`native/helper/stream_writer.h` |
| Runner | `src/runner/src/native-protocol.ts`、`src/runner/src/native-transport.ts`、`src/runner/src/trusted-shell-runner.ts`、`src/runner/src/trusted-shell-adapter.ts`、`src/runner/src/index.ts`、`src/runner/src/stream-output.ts` |
| Core/State | `src/core/src/a9-agent-loop.ts`、`src/core/src/index.ts`、`src/state/src/a9-persistence.ts`；State 仅输出事件查询/校验，表 schema 不改 |
| Shell | `src/shell/product/a9-agent-runtime.js`、`src/shell/product/a9-product-ipc.js`、`src/shell/product/preload.js`、`src/shell/product/renderer/a9-workbench.js`、`src/shell/product/renderer/a9-workbench.css` |
| 定向测试 | `src/runner/tests/native-transport.test.ts`、`src/runner/tests/trusted-shell-runner.test.ts`、`src/runner/tests/stream-output.test.ts`、`src/core/tests/a9-shell-streaming.test.ts`、`src/state/tests/a9-stream-output.test.ts`、`src/shell/tests/product/a9-shell-streaming.test.ts`、`src/shell/tests/product/a9-workbench-contract.test.ts` |
| 新构建返回入口 | `scripts/release/record-a9-v26-helper-input.mjs`、`scripts/release/a9-v26-return-evidence.mjs`、`scripts/release/test/v26-prepare-kit.test.mjs`、`scripts/release/test/v26-evidence-fixture.mjs`、`release/win7-product-v3/a9-v26-approved-build-kits.json`、`release/win7-product-v3/a9-v26-input-lock.json` |
| 发布消费者 | `scripts/release/build-a9-product-v3.mjs`、`scripts/release/test/a9-package.test.mjs`；只新增 v26 消费与负例，不改历史 Profile/锁 |

新 kit 根为 `native/helper/build-win10-kit-v26/`；只允许下列精确相对文件，不是目录通配授权：
`prepare-kit.cjs`、`package-kit.cjs`、`build.ps1`、`build-profile.json`、`README_BUILD.md`、`helper.exe.manifest`、
`SOURCE_COMMIT.txt`、`SOURCE_COMMIT_TIMESTAMP.txt`、`input-lock.json`、`PACKAGE_MANIFEST.json`，以及
`src/helper.cpp`、`src/helper.h`、`src/protocol.cpp`、`src/logic_tests.cpp`、`src/CMakeLists.txt`、
`src/stream_writer.cpp`、`src/stream_writer.h`、`src/whitelist.cpp`、`src/whitelist.h`、`src/argv_builder.cpp`、
`src/argv_builder.h`、`src/json_parser.cpp`、`src/json_parser.h`。生成源码逐字节绑定批准 source，不手工改第二份。

文档限定本任务、helper 设计、Demo、任务/方案索引、STATUS/STATUS_LOG、DECISIONS 和 WIN7_CONSTRAINTS 新段。
不得改 v24/v25 kits/输入锁、已冻结候选、历史驱动判据、用户数据或历史证据。
清单不足时先修订准确目标和批准范围，不借目录通配补洞。

## 4. 顺序与构建 Gate

1. 协议、解码/脱敏先做失败用例；实现 v3 writer/严格序号/限额，保留 v1/v2。
2. 接入可等待 onOutput、Core required audit、SQLite、IPC、卡片；版本化事件 payload=1，不迁移表。
3. 只读预检 D-017 实际 OS/VS/MSVC/SDK/工具身份、权限/Job/路径和离线输入；未知写 UNKNOWN。
4. 新 Profile/CancelSynchronousIo 等 API 按 C15/C16 登记，设计/安全独立复核；形成准确干净 source、
   kit/manifest/hash 审批包。提交、推送、安装和构建机写入须另行授权；缺干净 source 只暂停构建。
5. 构建授权后：两个全新目录、独立 run-id/返回包，logic/capture/v1/v2/v3 smoke、PE/API/CRT、字节一致性；
   fail-closed 记录器生成新 v26 lock。NOT_LOCKED 工件不能装配。
6. 开发机和独立复核通过后按批准合同整合，结论上限 DEVELOPER_VERIFIED；Win7 由第二批新候选取得。

## 5. 检查和证据

开发宿主 Node 20.17；目标 Electron 22/Node 16.17.1。本次直接影响 Core/Runner/State/Shell，执行：

```sh
npm test --workspace=@win7-agent/runner -- --runInBand
npm test --workspace=@win7-agent/core -- --runInBand
npm test --workspace=@win7-agent/state -- --runInBand
npm test --workspace=@win7-agent/shell -- --runInBand
node --test scripts/release/test/v26-prepare-kit.test.mjs scripts/release/test/a9-package.test.mjs
npm run verify:quick
npm run docs:check
git -c core.fsmonitor=false diff --check
```

原生检查按新 kit README 的确切命令，不能把 macOS logic 代替 PE 执行。其他模块只 quick，不默认全仓 test。
定向矩阵为 helper 设计 §7：tick、严格协议、每个编码/秘密切分点、无换行长 token、日志/SQLite/IPC/DOM 零秘密、
落盘失败、背压取消、上限/刷新/分页/重启。实际 Electron 检查滚动、焦点、Stop、退出与恢复。
去掉 ready/序号/跨块 holdback/先落盘条件各至少一项红，恢复后核对源哈希。
证据 `.acceptance/a9-30-developer/`，报告 docs/reports/2026-10，候选内不写证据。
Developer、Win10 构建、打包/真实 Electron、Win7 分别报告 PASS/FAIL/NOT_PERFORMED。

## 6. 当前状态

A9-30 任务及 ADR-0150 已获负责人批准，相关 helper v3 设计作为实现依据；产品实现尚未开始。
native 构建、冻结和 Win7 均 NOT_PERFORMED；独立安全/依赖复核仍按 §4 执行，不因批准登记视为已完成。
本任务批准不代替 A9-31/A9-32、新候选门 A/B、完整 Alpha 2 或 RC 裁决。

# A9-30 Shell 实时输出源码验证（2026-10-01）

```text
Task: A9-30 / APPROVED_FOR_IMPLEMENTATION
Decision: ADR-0150 / Accepted
Branch: codex/a9-30-shell-streaming
HEAD / Source Baseline: c14a96808d048c34f6079cc378ba12b4f60f5c62
Delivery: UNCOMMITTED_SOURCE_WITH_LOCAL_VALIDATION
Overall Developer Gate: NOT_SIGNED
Native Artifact: D-013 v26 / NOT_LOCKED
Real Electron / Win32 helper / Win7: NOT_PERFORMED
Candidate / Alpha 2 / RC: NO_NEW_VERDICT
```

已完成批准白名单内的源码链路及本轮开发机定向检查。尚不能装配可交付的 v26 产品，也未关闭完整 A9-30。
本报告由实现方记录，不冒充独立安全审阅、目标环境执行或候选验收结论。

## 1. 工作树、授权与保护

独立工作树为 `/Users/qlyf/.codex/worktrees/a9-30-shell-streaming/win7-coding-Agent`，建立时干净。
基线与 HEAD 保持上述完整 SHA；未提交、暂存、推送、合并、发布或冻结候选。
[A9-30](../../tasks/A9_30_SHELL_STREAMING.md)及[helper v3](../../plans/A9_HELPER_V3_STREAMING_PROTOCOL.md)是实现合同。
负责人补批 `src/shell/product/a9-package-runtime.js` 与 `src/shell/tests/product/a9-package-runtime.test.ts`，
仅新增 v26 校验并保留 v25 历史合同；原生构建授权仍独立。

原工作区 `/Users/qlyf/Developer/win7-coding-Agent` 的分支/HEAD未改变；两处文档修改、两处 Electron ZIP 删除、
未跟踪 `release/win7-product-v3/check.py` 均保留。三处已有文件逐字节 SHA-256 与初始快照一致。
证据 `final-workspace-boundary.json` 包含完整哈希、删除路径和空暂存清单。

开发机使用既有 Node 20.17.0 与各 workspace 已有依赖；通过工作树内 node_modules 符号链接复用，未安装新依赖。
`verify:quick` 产生的 20 个已跟踪 Runner dist 文件属于本轮生成物，验证后恢复基线字节；
实现差异全部在批准精确路径内，未将未授权的派生文件混入交付。运行源码产品前须重新构建，不能直接使用这些旧 dist。

## 2. 源码行为

| 层 | 本轮实现 |
|---|---|
| native | v3 UTF-8 JSON Lines；同 requestId 的启动、双源 Base64 输出及结构化终态；独立 Win32 writer、256 KiB 队列、32 KiB 帧、16 KiB 原始块；每流 1 MiB/4,096 块，达到上限后持续排空；取消轮询不等待输出写入；终态保留清理证明及原始/发布/省略字节计数 |
| Runner | 严格版本/Profile/身份、启动顺序、全局序号、每流偏移、Base64/字节计数/终态水位；慢消费者超限结构化失败并合作取消；按固定每流编码有状态解码、跨块脱敏；日志、最终文本、输出回调均使用脱敏后投影；错版本或缺 v3 helper 拒绝，不静默退回整块输出 |
| Core | 可等待运行中回调及版本化 tool_output；绑定 Turn/工具调用；必需审计失败阻断发布及后续工具；chunk 不写 Provider 工具历史，不独自改变 verified，最终结构化结果仍用于判定 |
| SQLite / IPC | 复用 a9_events；校验会话/任务/Turn/工具/requestId、连续序号及有界文本；事务落盘后 Runtime 才发布；既有 Schema IPC 查询/preload 复用，无表迁移 |
| Renderer | 复用活动卡，双源有界 textContent 输出；稳定身份去重，序号缺口提示并有界补历史；终态显示退出、截断和清理，不再次追加最终输出；历史/重启保留事实，不假装接管或重放进程 |
| 打包消费者 | 新增 v26/协议 v3/Alpha 2 绑定校验和错配负例，保留 v25/协议 v2/Alpha 1 历史合同；生产者和原生输入锁尚未完成 |

新 Profile/API 已先登记于 [WIN7_CONSTRAINTS §10](../../WIN7_CONSTRAINTS.md)，哈希仍为 NOT_LOCKED。
本轮没有改写 Accepted ADR 正文、v24/v25 kits/输入锁、冻结候选或历史证据。

## 3. 检查及证据

以下证据均位于工作树 `.acceptance/a9-30-developer/`，不在候选内。
所有 npm 检查均使用 `PATH=/Users/qlyf/.nvm/versions/node/v20.17.0/bin:$PATH`。

| 命令/检查 | 本轮结果 | 最终日志 |
|---|---|---|
| `npm test --workspace=@win7-agent/runner -- --runInBand` | PASS，11 suites / 215 tests | runner-contract-final.log |
| `npm test --workspace=@win7-agent/core -- --runInBand` | PASS，34 suites / 522 tests | core-restored-final.log |
| `npm test --workspace=@win7-agent/state -- --runInBand` | PASS，22 suites / 313 tests | state-restored-final.log |
| `npm test --workspace=@win7-agent/shell -- --runInBand` | PASS，50 suites / 487 tests | shell-restored-final.log |
| Shell 最后活动卡提示改动的定向回归 | PASS，3 suites / 49 tests | shell-last-projection.log |
| `node --test scripts/release/test/a9-package.test.mjs` | PASS，106 tests；已有包构建/消费者回归 | package-regression.log |
| `npm run verify:quick` | PASS，7 模块编译及静态检查 | verify-quick-source-final.log |
| `ctest --test-dir .acceptance/a9-30-developer/logic-build --output-on-failure` | PASS，1/1 平台中立 logic；不是 Win32 helper | logic-final.log |
| `npm run docs:check` / `git -c core.fsmonitor=false diff --check` | PASS，197 文档 / 47 任务；差异检查退出码 0 | docs-final-pass.log / diff-final.log |
| `node --test scripts/release/test/v26-prepare-kit.test.mjs` | NOT_PERFORMED：v26 kit/测试尚未形成，不能用已有包回归替代 | 无 |

编译调用与原生 logic 配置日志分别在 verify-quick、cmake、logic-build 系列中；没有执行 Windows 原生编译。
最后仅新增 Runner 负例、脱敏用例和文档，不复跑无影响的 Core/State/Shell 全量；Shell 最后提示改动已做上述定向检查。

源码实现清单及各文件 SHA-256 在 `source-sha256.json`（29 个批准实现/测试文件，排除文档和派生产物）。
该清单文件 SHA-256：`c77d84321adfc4480502856e75780a7ca69884abd4ec74abb8ef4b9d0dd13584`。这是未提交源码快照，不是可发布 source commit 或原生输入锁。

## 4. 行为覆盖与限制

- 实际 Node 子进程协议 peer 每两秒发 tick；首条在进程退出前经 Runner 回调可见，第二条及终态时间分别核对。它验证真实管道/运输和 Runner，不能替代 Win32 helper 或用户可见 Electron。
- UTF-8、CP936、UTF-16LE、BOM、CR/LF、无换行、已知秘密的 Base64/URL/form 编码变体、百分号转义大小写、未知凭据、带引号值、四类多行私钥按每个字节切分点验证；不允许先泄露后回溯脱敏。
- 协议负例覆盖错 requestId、重复/缺失序号、错流偏移、非法 Base64、错误字节计数、版本错配、输出早于启动、终态后输出、缺失终态、终态计数错配、落盘失败及慢消费者。结构化错误不带原始秘密诊断。
- Runner 的日志/回调/最终结果检查使用相同脱敏投影。Runtime 测试使用真实 Core、SQLite 和 Schema IPC 模块，但 Runner/Provider 为夹具；实际 SQLite 插入失败会阻断 IPC/UI 输出和后续 Shell。
- State 使用实际 SQLite，覆盖重复/缺口/错 requestId/错 taskId、分页及文件数据库关闭重开；DOM harness 覆盖活动卡双源、重读去重、上限、缺口及不解释 HTML。真实 Electron 的滚动、焦点、Stop、退出与窗口返回仍 NOT_PERFORMED。
- S01–S06 已有开发机分层支持证据，尚未取得完整原生链路或当前 Win7 候选直接证据，不能逐项标正式 PASS。

文档检查首次发现隔离工作树漏带既有设计准备报告，导致 STATUS 链接缺失；已逐字节复制该既有报告，原文保留。失败日志 docs-final.log 不覆盖。

首轮失败及修复：Authorization 跨块值、百分号转义大小写跨块匹配、夹具 Shell 身份绑定，以及历史 Renderer 字符串合同均保留各次失败日志，修复后回归通过。未知凭据增加引号和 PEM 保留逻辑，并补充所有切分点回归。

## 5. 负向对照

临时逐项去掉 ready、连续序号、跨块 holdback、必需审计检查，针对用例均以退出码 1 失败。
每次在 finally 中逐字节恢复源码并核对 SHA-256，之后正向回归通过；没有保留削弱安全的变更。

| 对照 | 证据 |
|---|---|
| ready / sequence | negative-final-ready.log / negative-final-sequence.log，negative-controls-final.json |
| required audit | negative-final-audit.log，negative-controls-final.json |
| holdback（最终脱敏源码） | negative-source-holdback.log / negative-source-holdback.json，恢复后 runner-holdback-restored.log PASS |

`negative-controls-final.json` 的较早 holdback 哈希仅绑定当时快照；最终源码以 `negative-source-holdback.json` 为准。
早期负例与失败证据保留，不用新的日志覆盖旧判据。最终 Runner 正向 215 项全部通过。

## 6. 继续推进所缺结果

1. v26 构建返回套件、相关定向测试与发布生产者消费逻辑尚未实现；现有生产者仍绑定 v25，不能装配 v26。后续 kit 生成必须逐字节绑定获准干净 source；源码提交目前未获授权，不能用工作区快照冒充 source commit。
2. 独立设计/安全/API/依赖复核仍 NOT_PERFORMED；本报告不自行签发整体 DEVELOPER_VERIFIED。
3. D-017 实际构建机 OS/VS/MSVC/SDK/权限/离线输入预检为 UNKNOWN / NOT_PERFORMED；未读取或写入远程构建机。
4. 获准后才进行两个独立干净 Windows 构建、logic/capture/v1/v2/v3 smoke、PE/API/CRT 与字节一致性；合格返回证据才生成新 D-013 v26 输入锁。Win32 writer 目前未经目标工具链编译或执行。
5. 新原生工件锁定后仍须真实 Electron/打包交互检查。新候选另立换发任务书并走门 A/B；当前没有冻结 WIN7-43 或新 Win7 结论。

原生构建、提交/推送及候选门各自的授权与事实仍独立。A9-31/A9-32 保持草稿；没有后台模型工具或用户继续实现。
第一批/W42 和 A7 RC 历史裁决保持；未纳入 A9-17 采样、A8 验收、恢复目录迁移、安装器或凭据生命周期实现。
完整 Alpha 2 仍依据[覆盖台账](../../plans/A9_BATCH_2_ACCEPTANCE_COVERAGE.md)及负责人整体合同裁决。

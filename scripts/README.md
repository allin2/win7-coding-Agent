# 日常开发与交付入口

授权与当前结果分别见 [任务索引](../docs/tasks/README.md) 和 [STATUS](../docs/STATUS.md)。
在已确认需求/版本范围内连续开发、修复和验证（ADR-0290）。主 agent 默认直接完成。

## 本地构建与验证

要求现有各模块依赖可用。开发机 Node 以 `.nvmrc` 为准（20.17.0，先 `nvm use`）；产品随包 Electron 22 / Node 16.17.1，开发机通过不代表 Win7 通过。
根目录 better-sqlite3 按该 Node ABI 编译；其他 Node 下入口在测试前停止并提示，不再产生与改动无关的 SQLite 失败。

```sh
# 最窄有效反馈：模块名 + 模块内真实测试路径。先构建依赖闭包，再测当前输出。
npm run test:local -- --module gateway --test-file tests/a9-r3-external-changes.test.ts
npm run test:local -- --module runner
# 多模块变化可重复 --module；--test-file 只接受单个模块，可重复指定文件。
npm run test:local -- --module core --module gateway
npm run test:local               # 7 模块日常集合
npm run verify:quick             # 编译与静态门，不跑测试
npm test                        # 集成完整回归
npm run docs:check              # 文档改动
npm run verify:tools             # 入口/文档工具变化
npm run verify:release           # 打包工具变化或发布准备
```

`test:local` 复用 verify_integration，不添加安装、传输、浏览器或正式冻结。
每次从源码构建所选消费者的依赖闭包；拒绝未知模块、缺失测试文件和编译失败，Jest 无测试仍非零退出。
每步输出真实命令、退出码和耗时；`[verify-timing]` 区分构建与测试。无需为小改动运行全部模块。
现有各包 `lint` 为 `tsc --noEmit`，构建已执行同类类型检查，因此不重复编译；Shell lint 还检查 JS 入口，保留。

日常集合移出两项，运行时打印 `NOT_PERFORMED`（ADR-0290、ADR-0291）：

| 移出项 | 覆盖的风险 | 何时仍须运行 |
|---|---|---|
| `workspace/tests/unit/a9-19-baseline-yield.test.ts` | 6000 个真实文件下全树扫描的结果与事件循环让出 | 改基线扫描、分片、外部变化收集；集成回归；发布准备 |
| Shell 中名称含 `required fields reject absence and wrong types before comparison` 的 12 个用例（约 90 秒） | A9-39 验收判定器对每行每个必需字段缺失或类型错误都判 FAIL，防止正式验收假 PASS | 改 `src/shell/tests/product/a9-batch2-driver-entry.cjs` 判定器或 `release/win7-product-v3/a9-batch2-fixtures.cjs`；集成回归；正式门 A 前 |

```sh
node scripts/verify_integration.mjs --module workspace --test-file tests/unit/a9-19-baseline-yield.test.ts
node scripts/verify_integration.mjs --module shell --test-file tests/product/a9-batch2-contract.test.ts
```

未缩小容量样本或断言；同一用例组的正例、单项反例、信封字段反例仍在日常集合，容量边界、安全、审批、审计、进程生命周期也在。
`--test-file` 定向运行和 `npm test` 不做任何移出。`src/runner/dist` 不再被 Git 跟踪，构建后不会出现生成物改动。

开发机实测（macOS，Node 20.17.0，单次样本，非性能承诺）：

| 范围 | 调整前 | 调整后 |
|---|---|---|
| 日常集合 `npm run test:local` | 168.99 秒，Shell 121.72 秒（1662903 之前的首轮记录） | 107.74 秒，Shell 33.28 秒，7 模块 PASS；与后台哈希任务并行，构建偏慢 |
| 非 `.nvmrc` 的 Node 22 | Shell 合同 186 项失败，约 19 秒后才暴露 | 1 秒内停止，提示 ABI 原因，未运行测试 |
运行结果明确打印移出项 `NOT_PERFORMED`；不要将日常集合写成完整回归。
已通过且输入未变的检查不重复。普通夹具变更只复验受影响链路；新原生按其 Profile 构建验证。

## Win7 开发运行与正式验收

沿用 [win7-dev](win7-dev/README.md) 和 [ENGINEERING_03](../docs/tasks/ENGINEERING_03_WIN7_DEV_CHANNEL.md)。
先核对主机、有效授权、当前锁/会话与预算。当前登记主机以已验证配置为准，旧 README 默认地址只作历史默认值。
锁属于另一 holder 时不接管、不冒用、不自动 close。开发构建单次构建，以提交、ZIP SHA 和新 run UUID 记录。
打包入口为 `npm run package:win7 -- --electron-zip <已锁定输入> --runner-zip <已锁定输入> --storage-zip <已锁定输入> --output <新目录>`；按当前 Runtime Profile 和输入锁装配，不能借旧候选号签结论。
A9-34/A9-40 开发构建可按 ADR-0296 使用 `--runner-product-zip <固定 WIN7-55 产品 ZIP>` 替代 `--runner-zip`，同时显式指定 `--formal-input-lock release/win7-product-v3/a9-32-input-lock.json`。入口核对产品 ZIP、来源清单和 helper 的固定哈希，开发包清单与 SBOM 记录恢复来源；仅接受 A9-32 开发锁，正式构建拒绝此参数。
两项功能的候选外定向驱动为 `scripts/win7-dev/a9-3440-trial.cjs`，仅适用于 [A9-40 §5](../docs/tasks/A9_40_BACKGROUND_PROGRESS_VISIBILITY.md#5-两项改进联合试用已批准) 的准确开发包和零真实模型请求范围；配置、时限、锁和准备记录按该任务执行。开发机入口为 `node --test scripts/win7-dev/test/a9-3440-trial.test.mjs`，不连接目标机；通过不等于包内运行时或 Win7 产品链路通过。
A9-42 Office真实界面驱动为 `scripts/win7-dev/a9-42-office-journey.cjs`，范围、准确包和窗口以
[A9-42 §7](../docs/tasks/A9_42_LIGHTWEIGHT_AGENT_TOOLS.md#7-r4实际办公界面win7试用提案proposed未授权)为准。
开发机数据/HTTP/身份反例入口为 `node --test scripts/win7-dev/test/a9-42-office-journey.test.mjs`。
Mac原生点击夹具使用已锁定Electron22/Node16执行：
`env -u ELECTRON_RUN_AS_NODE <Electron.app/Contents/MacOS/Electron> scripts/win7-dev/test/a9-42-office-ui.cjs --output=<绝对新目录>`。
夹具直接检查原生details点击、滚动、禁用、遮挡及关闭抽屉后输入，使用产品CSS；不运行产品main/Office/SQLite或连接Win7。
它保留独立user-data及RESULT，不自动删除输出。实际Win7断点仍须在批准窗口复验。
A9-42真实模型试用驱动为 `scripts/win7-dev/a9-42-real-model-trial.cjs`，资源采样器为 `a9-42-resource-sampler.cjs`；
范围与窗口以 [A9-42 §8](../docs/tasks/A9_42_LIGHTWEIGHT_AGENT_TOOLS.md#8-真实模型小规模试用与轻量资源测量proposed未授权) 为准。
开发机入口为 `node --test scripts/win7-dev/test/a9-42-real-model-trial.test.mjs` 与同目录 `a9-42-resource-sampler.test.mjs`，只用本机假上游，不访问DeepSeek。
开发运行只作 DEV_CHANNEL 诊断；正式冻结、双构建、独立审核、门 A/B 只在正式节点执行。
产品推送/发布、正式签发、新系统权限/配置或超预算仍由负责人决定。

## 历史材料与空间

按 [归档取回](../docs/acceptance/EVIDENCE_ARCHIVE_RETRIEVAL.md) 下载指定集合，使用原密钥与恢复工具。
历史 FAIL/UNKNOWN 不改判。归档和实际恢复核验通过后才给准确删除清单；集中确认后逐项执行。
当前开发、已发布可用版本、必要回滚和未提交/未推送工作树保留本地。

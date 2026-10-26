# 日常开发与交付入口

授权与当前结果分别见 [任务索引](../docs/tasks/README.md) 和 [STATUS](../docs/STATUS.md)。
在已确认需求/版本范围内连续开发、修复和验证（ADR-0290）。主 agent 默认直接完成。

## 本地构建与验证

要求现有各模块依赖可用。开发机 Node 20.17.0；产品随包 Electron 22 / Node 16.17.1，开发机通过不代表 Win7 通过。

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

日常集合仅移出 `workspace/tests/unit/a9-19-baseline-yield.test.ts`：它用 6000 个真实文件检查全树扫描的结果与事件循环让出。
修改基线扫描/分片/外部变化收集、相关集成或发布准备时，运行 `npm test`，或：

```sh
node scripts/verify_integration.mjs --module workspace --test-file tests/unit/a9-19-baseline-yield.test.ts
```

未缩小容量样本或断言，容量边界、安全、审批、审计、进程生命周期仍在日常集合。
运行结果明确打印移出项 `NOT_PERFORMED`；不要将日常集合写成完整回归。
已通过且输入未变的检查不重复。普通夹具变更只复验受影响链路；新原生按其 Profile 构建验证。

## Win7 开发运行与正式验收

沿用 [win7-dev](win7-dev/README.md) 和 [ENGINEERING_03](../docs/tasks/ENGINEERING_03_WIN7_DEV_CHANNEL.md)。
先核对主机、有效授权、当前锁/会话与预算。当前登记主机以已验证配置为准，旧 README 默认地址只作历史默认值。
锁属于另一 holder 时不接管、不冒用、不自动 close。开发构建单次构建，以提交、ZIP SHA 和新 run UUID 记录。
打包入口为 `npm run package:win7 -- --electron-zip <已锁定输入> --runner-zip <已锁定输入> --storage-zip <已锁定输入> --output <新目录>`；按当前 Runtime Profile 和输入锁装配，不能借旧候选号签结论。
开发运行只作 DEV_CHANNEL 诊断；正式冻结、双构建、独立审核、门 A/B 只在正式节点执行。
产品推送/发布、正式签发、新系统权限/配置或超预算仍由负责人决定。

## 历史材料与空间

按 [归档取回](../docs/acceptance/EVIDENCE_ARCHIVE_RETRIEVAL.md) 下载指定集合，使用原密钥与恢复工具。
历史 FAIL/UNKNOWN 不改判。归档和实际恢复核验通过后才给准确删除清单；集中确认后逐项执行。
当前开发、已发布可用版本、必要回滚和未提交/未推送工作树保留本地。

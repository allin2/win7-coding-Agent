# A9-43 P2 第三轮续做交接（2026-10-30）

“继续前必须完成的最短链路”第 1～3 项已完成本地实现。`run()` 已接到共同主体，迁移阻断已移除。
证据只有开发机静态复核及注入执行器测试。目标脚本实际执行、正式材料冻结、门 A/B 均为 `NOT_PERFORMED`。
本文件取代第二轮检查点的当前状态；前两轮原始日志、来源分类与历史失败全部保留。

## 基线、范围与本轮文件

- 唯一修改工作树：`/Users/qlyf/.t3/worktrees/win7-coding-Agent/t3-7d37bd8b`。
- 实际分支：`t3/win7-55-controller-migration`。HEAD：`f6792d09d34aed5215ab7792cc81ac00c563a594`，本轮未改变。
- 接手时已有 `authority.cjs`、`test/authority.test.mjs` 修改及未跟踪的 controller。前两份 P1 修改本轮未再编辑。
- 本轮修改 controller 下的 `execution-tools.cjs`、`local-entry.cjs`、`make-run.cjs`、`run-rehearsal.cjs`、`run-admin.ps1`、`issue-request.cjs`、`rehearsal-gate.cjs`、`test/controller.test.cjs`、本文件和 `PROVENANCE.json`；新增 `INVENTORY_REVIEW.json`。
- 本轮辅助验证材料在 `outputs/next-version-r1/p2-controller-migration-r1/`。
- 无委派、联网、安装、目标机连接、真实模型、系统配置修改、暂存、提交、推送、发布或删除。
  `scripts/win7-dev/`、候选内 `release/` 与 `src/`、DECISIONS 均未修改。未创建或切换工作树。

## 第 1 项：逐点复核

`INVENTORY_REVIEW.json` 绑定 inventory-final-r1 原字节 SHA、当前全部 52 份迁移文件和 348 条关联清点记录。
全部有原点条件、原 SHA、当前位置及处置。原始迁移来源已重新读取并核验 SHA。
这不是独立审核，也不是 PS/C# 运行证明。

本轮修复：

1. R2 占锁后保留独占句柄，重新执行同一准入，再创建目录与修改新根 ACL。finally 关闭句柄，部分失败保留 token 和现场。
2. 本地在发送 R2 前记录占用尝试。响应丢失或部分失败时，R7/R8 依靠远端准确 token 校验处理，不能把本地未收到成功当成“未占锁”。
3. R8 在任何任务删除前校验准确 token。未占用的清理只接受空闲 token，不释放它。外来 token 在删除或释放前拒绝。
4. R3 和 R3-state 共用规范路径、ADS/控制字符/别名/重解析拒绝；R3 增加数字长度、重复和条数边界。
5. R0 与目标解包都绑定唯一顶层，R0 不再剥除任意顶层。目标 C# 保留唯一顶层映射、CreateNew、逐项 SHA 和路径硬门。
6. 请求入口 ZIP 路径改为 `w/package/candidate.zip`，与上传和解包一致。
7. 请求入口向账本校验传入 `validateExecution.authority` 的 rehearsal 投影；原始执行绑定本身没有该字段。

调度删除仍绑定本 run 精确任务名、允许阶段及完整固定模板回读；Run 只传一个已校验根参数。
R8 只观察本 run 进程，不终止未知或根外实例。未删除任何实际计划任务或文件。

## 第 2 项：材料生产与 AUTHORIZATION

`make-run.cjs` 现有本地 CLI。导入模块不启动进程，程序化生产必须注入 Git 执行器。
真实 Git 读取只在显式材料 CLI 内提供。

```sh
TMPDIR=/tmp /Users/qlyf/.nvm/versions/node/v20.17.0/bin/node scripts/release/validation/win7-alpha3/controller/make-run.cjs \
  --run-context=/绝对路径/输入上下文.json \
  --execution-binding=/绝对路径/执行绑定.json \
  --out=/绝对路径/新材料目录
```

生产器要求 source 等于真实 HEAD；使用 `git ls-files --stage -z` 核对全部执行闭包已跟踪且为常规文件。
它检查这些路径的 Git 状态，并将实际原字节逐一与 HEAD blob 比对。结束前复核原字节、状态与 HEAD。
未跟踪、暂存/工作树修改、链接或 HEAD 原字节不同均拒绝，不生成伪清单。

输出包括 `EXECUTION_TOOLS.json`、`PHASE_PLAN.json`、`INPUT_BINDINGS.json` 和 `external/RUN_CONTEXT.json`。
context 原字节直接保留；计划由同一 FULL 预算产生，SHA 来自输出原字节。
当前工作树尚未跟踪 controller，真实命令已明确返回 `EXECUTION_TOOLS:GIT_CLOSURE_UNTRACKED`，没有形成冻结清单。
本单禁止提交，生产成功的真实 Git 清单留待负责人整合并提交源码后生成。

取得开发范围绑定或正式签发后，对同一目录使用相同命令，加：

```text
--authorization=/绝对路径/本地授权选项.json
```

此路径重新核验 Git 及全部既有材料原字节，只排他新增 `AUTHORIZATION.json`，不覆盖材料，不消耗 run。
也可在首次生产时直接提供完整授权选项。相对路径、Bytes 伪 JSON 选项、错误类别/run 均拒绝。

- 两类别选项提供 `executionToolsManifestPath`、`runContextPath`、`phasePlanPath`，以及实际 `lockHolder`、`ledgerDir`。
- 开发选项提供 `inputBindings`，且必须等于 `developmentScope.execution_inputs`。不自动扩写已批准 scope。
- 正式选项提供既有 P1 的 payload/receipt/pin/deny/旧锚材料。三份期望 SHA 只由已签 payload 取得，不从本地 inputBindings 补造或覆盖。
- 正式 payload 的执行绑定路径必须指向最终材料目录内的实际执行绑定；run 入口也拒绝 AUTHORIZATION 路径与实际绑定文件错配。
- `local-entry.validate` 做材料和授权校验；只有 `prepare` 在全部校验后排他消耗 run。

输入锁、批准登记和 `ZIP_ENTRIES.tsv` 仍由原材料路径提供，`verifyStock` 在派发前按绑定原 SHA 核验。
本命令不生成候选、不签发负责人回执或拒绝集种子，不使 PREPARED 材料获得目标执行权限。

## 第 3 项：真实入口接线与本地验证

`run()`、`runMigration()` 和 `main()` 共用已测试主体。
所有程序化调用必须显式注入执行器；仅 `require.main === module` 的显式 CLI 分支提供真实 spawn。
本轮没有调用目标执行 CLI。R1～R8 测试通过 `main()` 的真实参数解析、描述符及 AUTHORIZATION 文件读取进入。

两类别同走 R0 → R1 → R2 → 上传/读回 → 解包 → 11 个调度阶段 → R7 → R8。
正式专属校验只在本地；目标只收到执行绑定及共享数据，没有负责人回执或拒绝集。
保留共享传输计数、首次失败、独立收尾、账本/GPU/时间窗/预算/秘密扫描与目标原字节校验。

| 检查 | 开发机结果 | 原始日志或报告 |
|---|---|---|
| controller + P1 原生 node:test | 57/57，0 skipped/TODO | `logs/third-node-test-final-r4.log` |
| Electron22.3.27 / Node16.17.1 同步注册适配器 | 56 个同步测试体全部通过；1 个异步并发测试 NOT_PERFORMED（Node20 已通过） | `logs/third-node16-all-sync-final-r2.log` |
| 实际 Node20 与 Node16 解析/API/文本检查 | 两份 findings 为空；PS 仅源码检查 | `third-source-node20-final.json`、`third-source-node16-final.json` |
| 真实 Git 材料命令 | 当前未跟踪闭包被拒绝；目标材料目录未创建 | `logs/third-real-git-dirty-refusal-r2.log` |
| inventory / 来源 / 当前 SHA | 原点已映射；原来源 SHA 重新核对 | `controller/INVENTORY_REVIEW.json`、`third-delivery-check.json` |

共同工作目录为本工作树，环境为 `TMPDIR=/tmp`。

```sh
TMPDIR=/tmp /Users/qlyf/.nvm/versions/node/v20.17.0/bin/node --test scripts/release/validation/win7-alpha3/controller/test/controller.test.cjs scripts/release/validation/win7-alpha3/test/authority.test.mjs scripts/release/validation/win7-alpha3/test/deny-set.test.mjs
```

Node16 命令：`TMPDIR=/tmp ELECTRON_RUN_AS_NODE=1 <既有 Electron.app/Contents/MacOS/Electron> outputs/next-version-r1/p2-controller-migration-r1/run-node16-all-sync.cjs`。
实际 Electron 路径：`/Users/qlyf/Developer/win7-coding-Agent/outputs/a9-42-tools/runtime-inputs/electron-22-darwin-arm64/Electron.app/Contents/MacOS/Electron`。
适配器只改测试注册和 ESM 导入形式，不是 Node16 原生 node:test。异步 P1 双进程竞争保留 Node20 原生证据。
controller 的 SSH/SFTP/Git 边界均注入；P1 原有并发测试只启动本机 Node 子进程验证本地账本。
R0 整链使用显式合成 verifier，不能证明真实产品 ZIP/PE/manifest。入口测试中的 PS/Scheduler 结果是伪执行器数据。

首失败保留：`third-node-test-r2/r3.log` 的请求入口夹具错误由错误的 ctx.prep 导致；定向诊断修正后通过。
`third-issue-entry-diagnostic.log` 是该单项证据。首个真实 Git 诊断因日志前缀解析未产出输入，日志也保留。
前两轮 `node-test-*`、`continue-*` 及本轮所有中间日志均未覆盖或删除。

## 第 4 项与下一个真实窗口

PS2/5.1 解析、C# 编译、真实 ZIP 解包、Scheduler 单一根参数展开与 XML 回读：全部 `NOT_PERFORMED`。
开发机没有对应解释器/编译器，本轮未联网补装。

**留待 A9-43 §6 授权的 Win7 开发级运行首个窗口先做最短准入验证。**
先验证实际 PS2/5.1 入口、C# 编译/解包和 Scheduler 参数/回读，再进入依赖它们的 FULL 调度。
最短验证须覆盖 R2 竞争/部分失败、R8 外来 token 不释放、R3 路径反例、唯一 ZIP 顶层及精确任务删除。
这些步骤只在获准窗口内执行，不新建正式候选，不把开发级诊断计入门 B。
身份、锁、完整性或安全收尾失败，停止依赖步骤并保留现场，不偷锁、不 close、不宽根终止。

正式种子、签发、最终 Git/包字节、全阶段开发级运行、双构建冻结及门 A/B 均留待主会话。
当前无目标进程或目标窗口在运行。本轮未消耗目标机窗口或真实模型预算。
测试临时目录按日志准确路径做只读盘点，见 `third-scratch-inventory.json`；没有清理任何路径。

# A9-33 第 18 轮独立复核交接包：保留清理前观察（2026-10-15 UTC）

结论：第 17 轮的 P1-R1 和新增 P2-N1 已在开发机修复，尚未独立复审。请另开全新独立会话，核实两项发现是否关闭。本包与修复位于同一待提交树。启动前以本地提交固定对象，并在提示词中写入完整提交 SHA，不能以未提交工作区代替。

证据层级为开发机（macOS、Node 20.17.0）。新实现没有在 Electron、Win10 或 Win7 运行，`NOT_PERFORMED`。本包不是门 A/B，不签 A9-32 `DEVELOPER_VERIFIED`，不接受 ADR-0155。

## 1. 输入与独立性

- 仓库：`/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent`；分支 `codex/a9-33-batch2-win7-acceptance`；修复前 HEAD `76e81a24190b72cfac7764bcc2ad7d6481f33ca0`，其代码与 `3d152545772e07efd54e0d4e06d6982a532c0abb` 相同。
- 先读 `AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、任务书适用合同及 §6.59～§6.61。本轮实现仍受 §6.1 的 20 个路径限制。
- 第 17 轮详细报告：`.acceptance/a9-33-review/codex-bg03-round17-20261015/independent/codex_detailed_report.md`，SHA-256 `7ab61f5b17c2b461d749dcc404a52581e686030604e349945a46163063036edf`。原始反例为同目录 `independent-counterexamples.test.cjs`、`probes.cjs`、`probe-results/results.json` 和 `independent-counterexamples.log`。
- 第 17 轮 CLI 最终回复另存并保留，真实 SHA-256 为 `af070c6923326cdc4f1b59d2254d758a7780e93ebb50b7cbc623910a6c772603`。报告同名输出覆盖及原文恢复见 `report-identity.json`；不得混用两份哈希。
- 原工作树、主工作区、候选和历史证据只读。只在启动提示词指定的全新复核根内克隆和运行；不提交、不推送、不访问 Win7/Win10、不运行 Electron/PowerShell、不联网下载、不读凭据、不启动子代理。

## 2. 本轮修复与反例

| 发现 | 修复与复核要求 |
|---|---|
| P1-R1：首次退出后或收尾采样看见子进程，父进程在清理前结束，子进程被遗忘 | `finishReleaseEvidence` 将首次列表与每次收尾列表按时间传给 `removeReleasedCommand`。同一追踪集合先消费这些观察，再查询当前列表和逐个终止。核对首次、收尾、清理三段之间是否仍有丢失。只在已知父实例存活时绑定后代；父死后才首次出现、无法绑定的条目不能凭裸父 PID 扩大终止范围 |
| P2-N1：已追踪 PID 后续缺创建时间，被计为消失 | 缺创建时间的同号行记入 `unidentified`。不终止该行、不计为干净，最终 UNKNOWN。首次退出后就缺创建时间时，存活事实也是 UNKNOWN。核对未知与确定残留的优先级，以及 PID 复用时不误终止其他实例 |

实现仅三个路径：`release/win7-product-v3/a9-batch2-smoke.cjs`、`release/win7-product-v3/A9_BATCH2_WIN7_VALIDATION.md`、`src/shell/tests/product/a9-batch2-contract.test.ts`。未改产品、原生、锁或驱动语义。累计非文档路径仍须与 §6.1 的 20 个路径逐一相同。

新增 4 个具名测试覆盖：首次采样后根消失的子／孙进程及可清理对照；收尾采样后根消失；创建时间在首次或后续查询缺失；清理前发现无创建时间的子进程。测试夹具用空值回退，空创建时间不再被替换成默认值。新增 `cleanup.samples_before_cleanup` 记录已识别实例。

执行代理在旧冒烟实现上运行新增用例，4 个全部断言失败。修复后完整 Jest 272 通过（合同 229、运行时 43），包测试 120 通过，`verify:quick` 通过。独立反例重放为 FAIL、FAIL、UNKNOWN。以上是执行代理的开发机结果，审核者须独立核对。

## 3. 复算入口

使用第 17 轮交接包第 2 节的独立克隆和依赖链接方式，将检出提交换成启动提示词绑定的本轮完整 SHA。克隆使用 `--no-hardlinks`，排除 `@win7-agent` 外部工作区链接；不得用 `cp -R` 展开依赖。先设置 `TMPDIR` 为本轮复核根下的 `tmp`，使用现有 Node 20.17.0 和 `NPM_CONFIG_OFFLINE=true`。

先运行 `npm run verify:quick` 构建依赖。仅在自己的克隆内恢复构建改写的 `src/runner/dist`，再运行：

```sh
node --test scripts/release/test/a9-batch2-package.test.mjs scripts/release/test/a9-package.test.mjs
npm test --workspace=@win7-agent/shell -- --runInBand --forceExit --runTestsByPath tests/product/a9-batch2-contract.test.ts tests/product/a9-package-runtime.test.ts
npm run docs:check
git -c core.fsmonitor=false -c core.whitespace=cr-at-eol diff --check
```

相关用例可用 `-t 'codex round 17|release exit'` 定位。沙箱中回环监听的 9 个 `EPERM` 用例单列 UNKNOWN，不能计为产品缺陷或变异拦截。变异先验证对应基线，必须出现具名行为断言失败，语法／编译失败不算拦截。

## 4. 交付与边界

逐条回答两项发现是已关闭、未关闭还是 UNKNOWN。至少自选 4 个相关反例和 4 个变异，覆盖首次采样、收尾采样、空创建时间、跨轮追踪或错误实例不被终止。已关闭的句柄根身份、严格三值和单项 UNKNOWN 做定向回归；不重审扫描器，不重新列 KL-1～KL-12 与原有信息边界。

负责人已确认 WIN7-45 沿用 `2026-10-16T06:59:59Z` 截止时间。限定身份的释放命令与其存活时发现的后代清理属于 R1～R8。该确认不代表技术通过，也不授权审核者连接目标机。

详细报告写 `codex_final_report.md`，CLI 的 `-o` 写 `codex_final_response.md`，两者必须分开。保留原始报告、日志、反例及失败。不得为缩小目录删除历史证据；如保留临时夹具，记录实际占用。

最后明确是否建议在本轮准确提交上重建 WIN7-45 并预演。存在 P0/P1 时先修复再复核；只剩 P2 时按既有裁决登记限制。门 A/B 仍由负责人签发。任何 Alpha 2 结论继续携带 KL-3、KL-5、KL-6a、KL-7 及其 a、b、c 边界。

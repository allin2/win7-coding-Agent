# A9-33 独立审核交接包（2026-10-12，绑定实现提交 905bf760…）

本包供 codex 对 A9-33 的实现提交 `905bf760b6f32f023fdf76f9f45b629098f0d7bd` 做首轮源码复核。复核者由负责人在 2026-10-12 指定（[A9-33 §6.9](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#69-负责人裁决登记与合同收窄2026-10-12)）。
证据层级为开发机。驱动、冒烟、桌面控制器没有在 Electron、PowerShell、Win10、Win7 上运行过，全部 NOT_PERFORMED。未在 Win7 实机验证。
本包是事实陈述和复核请求，不是批准。复核结论由负责人决定是否登记。
2026-10-13：codex 已按本包完成第一段复核，结论与修复见 [A9-33 §6.10](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#610-codex-第一阶段复核与修复轮2026-10-13)。本包只绑定 `905bf760…`；复核修复后的提交须另出绑定新提交的交接包。

## 0. 审核会话启动说明

审核者是负责人另开的新会话，不带执行代理的上下文，也不是实现方。
审核者只读本文件和第 1 节列出的提交，不写原隔离树、主工作区和已有 `.acceptance`。
审核者在自己的空目录复算，把结论写进自己目录的 `review-conclusion.md`，并向负责人报告。
不联网、不下载、不启动 Electron、不访问 Win10 或 Win7、不提交、不推送。
结论按 P0、P1、P2、信息分级。每条写 `文件:行`、依据和复现方式。没有发现时，写明检查了什么。
最后给出一句话：是否建议在该提交上进入预演授权。

复核分三段，本包只覆盖第一段：

| 段 | 对象 | 时点 |
|---|---|---|
| 一 | 实现提交的源码与开发机检查（本包） | 现在 |
| 二 | 预演产生的证据和驱动修正（若有） | 预演之后，负责人另行提供 |
| 三 | 正式执行的原始证据与报告核验 | 正式执行之后、门 B 之前 |

## 1. 对象与保护边界

| 对象 | 身份 |
|---|---|
| 分支 | `codex/a9-33-batch2-win7-acceptance`，本地，未推送 |
| 复核对象 | `905bf760b6f32f023fdf76f9f45b629098f0d7bd`（父 `7e96f561d3ac51e832a56928118209e604d7f2a0`）。20 个文件，+5991、−31 |
| 其后的文档提交 | `d027af7d…` 及之后只改 `docs/`，不属于源码复核对象 |
| 任务书与合同 | [A9-33](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) §3、§6.1、§6.2、§6.9；[A9-32](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md) §5、§7.10 |
| 保护边界 | 不得改动旧取证组件和产品语义。20 个路径之外的文件在该提交里必须没有差异 |

必须从提交取得文件，不能拿工作区文档对照。该提交相对父提交应当恰好改动 20 个路径，第 2 节的命令内置清单并逐项比对。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用本机已有路径。任一步不符，保存首个失败并停止依赖动作。
以下命令是交接文本。审核者复算前，对审核者而言均为 NOT_PERFORMED。

```sh
REPO=/Users/qlyf/.codex/worktrees/a9-33-batch2-win7-acceptance/win7-coding-Agent
REVIEW_DIR=$(mktemp -d /private/tmp/a9-33-independent-review.XXXXXX)
git -c core.fsmonitor=false clone -q --no-hardlinks "$REPO" "$REVIEW_DIR"
git -C "$REVIEW_DIR" -c core.fsmonitor=false checkout -q 905bf760b6f32f023fdf76f9f45b629098f0d7bd
git -C "$REVIEW_DIR" -c core.fsmonitor=false rev-parse HEAD
MAIN=/Users/qlyf/Developer/win7-coding-Agent
for mod in . $(cd "$MAIN" && echo src/*); do
  [ -d "$MAIN/$mod/node_modules" ] || continue
  mkdir -p "$REVIEW_DIR/$mod/node_modules"
  for entry in "$MAIN/$mod/node_modules"/* "$MAIN/$mod/node_modules/.bin" "$MAIN/$mod/node_modules/.package-lock.json"; do
    [ -e "$entry" ] || continue
    [ "$(basename "$entry")" = "@win7-agent" ] && continue
    ln -s "$entry" "$REVIEW_DIR/$mod/node_modules/$(basename "$entry")"
  done
done
```

预期：`rev-parse` 输出 `905bf760b6f32f023fdf76f9f45b629098f0d7bd`。依赖搭建沿用 [A9-32 交接包](a9_32_independent_review_handoff_2026-10-12.md)第 2 节的写法，不链 `@win7-agent`；模块清单改由主工作区目录展开，不依赖当前目录。
这里用本地克隆而不是 `git archive`，因为包测试和 `docs:check` 需要 `.git`。克隆只读本地仓库，不联网。

第二步：核对路径清单。同一 shell 中执行。

```sh
cd "$REVIEW_DIR"
git -c core.fsmonitor=false diff --name-only 7e96f561d3ac51e832a56928118209e604d7f2a0 905bf760b6f32f023fdf76f9f45b629098f0d7bd | LC_ALL=C sort > ../a9-33-changed-paths.txt
cat > ../a9-33-expected-paths.txt <<'EOF'
release/win7-product-v3/A9_BATCH2_WIN7_VALIDATION.md
release/win7-product-v3/README.md
release/win7-product-v3/RUN_A9_BATCH2_INTEGRITY.cmd
release/win7-product-v3/RUN_A9_BATCH2_REPORT_VERIFY.cmd
release/win7-product-v3/RUN_A9_BATCH2_SMOKE.cmd
release/win7-product-v3/a9-32-input-lock.json
release/win7-product-v3/a9-batch2-desktop-controller.ps1
release/win7-product-v3/a9-batch2-desktop-request.cjs
release/win7-product-v3/a9-batch2-fixtures.cjs
release/win7-product-v3/a9-batch2-input-lock.json
release/win7-product-v3/a9-batch2-package-integrity.cjs
release/win7-product-v3/a9-batch2-report.cjs
release/win7-product-v3/a9-batch2-smoke.cjs
scripts/release/build-a9-product-v3.mjs
scripts/release/test/a9-batch2-package.test.mjs
scripts/release/test/a9-package.test.mjs
src/shell/product/a9-package-runtime.js
src/shell/tests/product/a9-batch2-contract.test.ts
src/shell/tests/product/a9-batch2-driver-entry.cjs
src/shell/tests/product/a9-package-runtime.test.ts
EOF
diff ../a9-33-expected-paths.txt ../a9-33-changed-paths.txt && echo PATHS_MATCH
git -c core.fsmonitor=false diff --stat 7e96f561d3ac51e832a56928118209e604d7f2a0 905bf760b6f32f023fdf76f9f45b629098f0d7bd | tail -1
```

预期：输出 `PATHS_MATCH`，最后一行含 `20 files changed, 5991 insertions(+), 31 deletions(-)`。
清单与改动路径有任何差异，即为 P0：提交越过了 [A9-33 §6.1](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#61-拟批准精确允许路径) 的白名单。

第三步：开发机检查。同一 shell 中执行。顺序有意义：先构建七个模块并还原被改写的受跟踪产物，再跑包测试和 jest。包测试要求 `src/*/dist` 已在本检出里构建，且受跟踪文件干净。

```sh
cd "$REVIEW_DIR"
export PATH=/Users/qlyf/.nvm/versions/node/v20.17.0/bin:$PATH NPM_CONFIG_OFFLINE=true
node --version
npm run verify:quick
git -c core.fsmonitor=false restore src/runner/dist
node --test scripts/release/test/a9-batch2-package.test.mjs scripts/release/test/a9-package.test.mjs
npm test --workspace=@win7-agent/shell -- --runInBand --runTestsByPath tests/product/a9-batch2-contract.test.ts tests/product/a9-package-runtime.test.ts
npm run docs:check
git -c core.fsmonitor=false diff --check
git -c core.fsmonitor=false status --short | wc -l
```

预期：

| 步骤 | 预期 |
|---|---|
| `node --version` | `v20.17.0` |
| `verify:quick` | 退出码 0；会让 `src/runner/dist` 的 24 个文件变脏，随后立即还原 |
| `node --test` | 119 通过、0 失败，约 6 分钟 |
| shell jest | 2 个套件、78 个用例通过 |
| 还原后 `status` 行数 | 0 |
| `docs:check` | `ok`，该提交的内容为 324 个文件 |
| `diff --check` | 无输出 |

被跟踪的 `src/runner/dist` 落后于源码是已知问题，`verify:quick` 会改写它。必须还原，不能提交。
包测试要在不被改动的检出里整体运行，测试期间不要改动该目录。

实测说明（2026-10-12，执行代理，开发机，Node 20.17.0）：第 2 节的三个 `sh` 代码块原文抽出后，在 `905bf760…` 的全新克隆里从非主工作区目录一次执行，退出码 0。
结果：`PATHS_MATCH`，20 个文件，+5991/−31；`verify:quick` 通过；`node --test` 119 通过、0 失败；shell jest 2 个套件、78 个用例通过；`docs:check` 为 `ok`、324 个文件；`diff --check` 无输出；还原后 `status` 为 0 行。
初版命令有两处错误，已修正后复测：依赖搭建循环按当前目录展开 `src/*`，从非主工作区目录执行时漏链 `src/*/node_modules`；包测试排在 `verify:quick` 之前，而包测试要求 `src/*/dist` 已构建（首次实跑 71 通过、48 失败，原因均为这两处环境缺口，不是源码缺陷）。

## 3. 请重点复核

按风险从高到低。第 1、2 项是执行代理最不确定的地方。

1. **驱动对产品的假设。** 驱动读取的 DOM、IPC、事件和时序全部来自源码阅读，从未在 Electron 里运行。请逐条对照产品源码，第 4 节列出了全部假设。重点是 B2-UI-01 的九个子项和 B2-CONT-03 第 2 条的五个子观察。
2. **判定是否只来自观察。** 请追踪每条断言从“观察”到 PASS 的路径，确认缺观察不会变成 PASS。关注：`evaluateUiJourney`、`subResult`、`summarizeSubs`、`guardRefused`；`a9-batch2-fixtures.cjs` 的 `setAssertion`、`finalizePhaseResult`、`phaseResultProblems`；`a9-batch2-smoke.cjs` 的 `applyAssertions`。
   已知一处风险：`applyAssertions` 对同一断言后写覆盖先写。执行代理已让 B2-CONT-03 第 2 条只由最后一个模式记录，请核对没有其他断言被两个模式写入。
3. **合同收窄是否诚实。** 对照 [A9-33 §6.9](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#69-负责人裁决登记与合同收窄2026-10-12)：25 用例、42 断言、51 个证据文件。B2-CONT-02、B2-SAFE-01 只出现在已知限制，没有以其他名义留在合同里；“诊断模式”被读作 `modeDiagnostics`，是否改变了合同含义。
4. **生产者与运行时描述符。** `build-a9-product-v3.mjs` 新增 batch2 与 A9-32 两个 Profile；`a9-package-runtime.js` 区分 A9-30/31、A9-32 开发锁与 batch2 正式锁。核对：开发 Profile 不能带 authority、不能冒充非开发身份；batch2 锁拒绝开发来源声明和旧锁 ID；历史分支字节行为未变；错误 authority、漏证据、任意控制器请求、秘密出口均被拒绝。
5. **请求与账本。** `a9-batch2-desktop-request.cjs`：请求对未知字段封闭、没有命令字段、绑定 run-id 与四个哈希、有效期 900 秒、追加账本、不可重放、同类失败两次停止。核对账本在崩溃或并发下是否可能少记一次消费。
6. **桌面控制器。** `a9-batch2-desktop-controller.ps1` 目标为 PowerShell 2.0：不得使用 `ConvertFrom-Json`、`ConvertTo-Json` 等 3.0 以后的命令，非 ASCII 字符不得出现。核对 [WIN7_CONSTRAINTS.md](../../WIN7_CONSTRAINTS.md) 平台能力矩阵。该脚本在开发机无法执行，只能静态审。
7. **Node 16.17.1 兼容。** 套件脚本在包内 Electron 22 的 Node 模式下运行，开发机却是 Node 20，测试发现不了新 API。执行代理 grep 过 `structuredClone`、`findLast`、`toSorted`、`fetch`、`.at(` 等，无命中；请用你的方法再核一次，并核对语法层面（例如正则标志、类静态块）。
8. **秘密与数据边界。** 正控制样本在运行时拼接；打包 payload 扫描会拒绝整段密钥样字面量。Provider 只监听回环地址。驱动写入候选数据库的注入行只用于一次性数据根，残留事实的 pid 为 2147483000，驱动在 `finally` 中删除；请核对产品在这段时间内不会对该 pid 发信号。
9. **证据诚实。** 文档里对 PASS、NOT_PERFORMED、UNKNOWN 和证据层级的表述是否与上面的事实一致，特别是 [A9-33 §6.9](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#69-负责人裁决登记与合同收窄2026-10-12) 与 STATUS。

## 4. 驱动的假设清单（请逐条验证）

文件均为 `src/shell/tests/product/a9-batch2-driver-entry.cjs`，除非另注。产品位置用名称标注，行号可能随提交变化。

| # | 驱动假设 | 对照产品位置 |
|---|---|---|
| 1 | 继续动作串为 `a9.task.continue`，用于数量统计 | `a9-product-ipc.js` 的 `A9_ACTIONS.TASK_CONTINUE`（执行代理已核对一致） |
| 2 | 滚动容器是 `#conversation`，不是 `#a9-task-stream` | `renderer/a9-workbench.css` 的 `.conversation { overflow: auto }`、`workbench.html` |
| 3 | 继续卡为 `section.continuation-card`，按钮文本 `继续` 与 `正在继续`，忙时按钮禁用，焦点落在卡片 | `renderer/a9-workbench.js` 的 `updateContinuationCard`、`continueInterruptedTask` |
| 4 | 空闲判断用 `controls.stopKind !== 'turn'`，因为后台进程在运行时 `canStop` 恒为真 | `a9-agent-runtime.js` 的 `controls` 计算 |
| 5 | 对继续轮次点 Stop 后，同一任务回到一张可操作的新卡：`interruptedTurnId` 与 `recoveryRevision` 都变化 | [A9-32 任务书](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md)“失败保留诊断，回到可操作的中断卡”；`continueTask` 的失败分支。驱动没有运行过这条路径 |
| 6 | `task_continue_requested` 事件在派发前同步持久化，可用来数“忙时只派发一次” | `a9-persistence.ts` 的 `requestTaskContinuation` |
| 7 | 注入用的表和列：`a9_tasks`、`a9_turns`、`a9_events`、`a9_managed_processes` | A9-32 生命周期测试的同名写法；`a9-batch2-contract.test.ts` 用真实运行时核对过 |
| 8 | `webContents.sendInputEvent` 的 keyDown、char、keyUp 序列，keyCode 为 `Enter` 或 `Space`，能在已聚焦按钮上触发点击 | 无产品位置；Electron 22 行为，未验证 |
| 9 | 预加载 API：`window.win7Agent.a9.snapshot`、`queryEvents`、`activateConversation`、`resumeApproval`、`continueTask` 的参数顺序 | `preload.js` 约 55–68 行 |
| 10 | 模式设置文件是 `workspace-modes` 下唯一不以 `.v1.json` 结尾的 `.json` | `core/src/a9-mode-settings.ts` 的 `settingsFilePathFor` |
| 11 | Provider 夹具的 `holdNext` 只拦下一次请求，之后恢复应答 | `a9-batch2-smoke.cjs` 的 `ProviderFixture` |
| 12 | 工作区打开前改坏模式文件，运行时进入 `modeDiagnostics`，卡片被 `A9_MODE_SELECTION_REQUIRED` 阻断 | `a9-agent-runtime.js` 约 175–203 行；`a9-batch2-contract.test.ts` 在 Node 里核对过，Electron 里未核 |
| 13 | 退出对话框三个按钮顺序为 `停止后退出`、`留给系统后退出`、`取消` | `EXIT_BUTTONS`；`main.js` 的退出对话框 |

## 5. 执行代理已知的同类错误（请据此找相似问题）

- **假设没有核对产品。** 本轮自查就找到三处套件缺陷：空闲判断用了 `canStop === false`，滚动容器读错元素，继续后的第一条请求取错基线。三处都是读源码时才发现，不是测试发现的。
- **测试用开发机口径。** 整个套件在 macOS、Node 20 下测试。Windows 路径、`wmic` 输出、CRLF、代码页只有固定样本。
- **夹具自拟。** 注入行的列值取自 A9-32 生命周期测试，不是产品自己写入的真实形态。
- **纯函数覆盖旅程。** B2-UI-01 的评估器有完整测试，但按键、焦点、滚动的真实采集没有任何自动测试。

建议的反例（执行代理没有执行，请审核者在自己的目录试）：

| 变更 | 预期被哪个测试拦住 |
|---|---|
| `guardRefused` 去掉请求数比较 | `a9-batch2-contract.test.ts` 的 “a guard counts as refused…” |
| `finalizePhaseResult` 把 `UNKNOWN` 当作 PASS | 同文件的 “every assertion needs an observed value…” |
| `evaluateUiJourney` 放宽滚动容差 | 同文件的 “the UI-01 journey passes only from…” |
| 生产者去掉 `.cmd` 的 CRLF 检查 | `a9-batch2-package.test.mjs` 的 “producer refuses … LF CMD entry” |
| 把 `a9-batch2-input-lock.json` 的 managed 锁摘要改一位 | 同文件的锁漂移用例 |

## 6. 不在范围

Win7 与 Win10 的任何动作、预演与正式执行的授权、候选冻结、关口 A 与 B、ADR-0155 的接受、A9-32 `DEVELOPER_VERIFIED` 的签发、完整 Alpha 2 裁决。
本包不请求任何执行授权。复核者的结论不构成关口签署。

# A9-40 — 后台任务进展可见与结束状态同步

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_EXPERIENCE
Target Branch: main
Source Baseline: fa5ec1ec4093f40b9b69d10519cfe5001882f45b
Phase-Gate: A9_40_DEVELOPER_VERIFIED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0295
```

## 1. 批准与交付范围

2026-10-27，负责人对“后台任务进展可见”回复“值得做”，批准提前修复 KL-3/KL-13。
负责人同时要求并行推进，由主会话负责分工、技术取舍与整合。

| 要素 | 本轮范围 |
|---|---|
| 用户结果 | 无需再发送消息，后台任务的新输出持续显示；自然退出后同步按钮与对话可用状态 |
| 基线与分支 | 上述 main 提交；执行代理由 T3 分配独立工作树，回报实际路径、分支及 HEAD，由主会话整合 main |
| 实施边界 | 工作台刷新生命周期和相关行为验证；复用既有快照与权限入口；不得放宽后端切换、停止或恢复处置守卫 |
| 关联工作 | A9-34 同时修改工作台；由主会话整合，保留处置界面、确认框与脱敏语义 |
| 外部动作 | 本地编辑、依赖编译、必要测试；不连接目标机、不安装依赖、不调用真实模型、不推送或发布 |
| 停止条件 | 需要新增权限、接口、依赖、原生或持久化变更时报告；安全或生命周期未知停止依赖动作 |

本批准只改变上述两项产品修复的执行顺序，不关闭历史限制或改判 WIN7-55。
上述为首次实现批准边界。后续本地提交与本版本 Win7 联合试用已按 §5 获准。
正式门 A/B、推送与发布不在本轮授权内。

## 2. 已知问题与最小修复

KL-3 的 Win7 观察见 [A9-33 §6.19](A9_33_BATCH_2_WIN7_ACCEPTANCE.md)。
KL-13 见 [ADR-0260](../DECISIONS.md)：后台进程自然退出后，后端已允许切换而页面仍禁用新建对话。
开发机 main 基线中 `beginSnapshotPolling` 随请求结束而清除；历史观察不替代本轮复现。

只修工作台读取与显示既有后台事实的生命周期，不新增后台守护服务。
任务输出按现有纯文本与脱敏路径展示；沿用用户滚动和焦点行为。
后台任务存在时有界刷新，终态同步后停止不必要轮询。
请求去重；关闭、工作区切换及无活动任务时清理；错误可见，不无限堆积请求。
仅有清理未确认的恢复记录不应造成永久高频轮询；后端守卫仍决定能否切换。
沿用 D-009 Electron 22.3.27 / Chromium 108，开发 Node 20.17.0；无新依赖或系统 API。

定位路径：`src/shell/product/renderer/a9-workbench.js`，以及 Shell 内受影响行为测试。
代理可新增 `src/shell/tests/product/a9-background-refresh.test.ts`，避免与 A9-34 测试并发编辑。

## 3. 必要验证

1. 复现请求已结束但后台仍运行时没有后续刷新，修复后确认新输出进入现有展示路径。
2. 自然退出后终态、停止按钮和对话控制同步；不能把恢复未确认事实误当安全退出。
3. 覆盖慢响应去重、终态停轮询、关闭清理和失败后恢复；保留既有前台输出行为。
4. 以项目入口先构建依赖再跑实际消费者；合并 A9-34 后跑受影响工作台测试。
5. 沿用现有日常集合与文档检查；不增加整批变异测试或重复审核。

本轮开发机证据不能替代 Electron 打包运行时和 Win7 实机。
Win7 开发运行的范围与预算见 §5；其结果只记 DEV_CHANNEL。

## 4. 执行记录

### 4.1 本轮开发机基线与边界

- 执行工作树：`/Users/qlyf/.t3/worktrees/win7-coding-Agent/t3-bdfc5a60`。
- 实际分支：`t3/background-progress-visibility`。
- 起始 HEAD：`fa5ec1ec4093f40b9b69d10519cfe5001882f45b`，起始工作区干净。
- 授权来源：主工作区本任务书、任务索引与 ADR-0295；仅复制本任务书。
- 改动影响：Renderer 快照刷新生命周期和定向行为测试。后端合同及原生组件不变。
- 最短链路：加载实际 Renderer → 提交请求 → 请求完成但后台运行 → 迟到输出进入原工具卡 → 自然退出同步控件。
- 检查范围：Node 20.17.0 下按项目入口构建当前依赖，再运行 Shell 定向消费者及文档检查。
- 环境准备：负责人已允许根目录和七模块的 `node_modules` 链接复用主工作区现有依赖；不安装依赖。
- Electron 打包运行时、Win10、Win7、真实模型、目标机及正式门 A/B：`NOT_PERFORMED`。
- 不提交、不推送、不改任务索引或其他治理文档。A9-34 由主会话整合。

### 4.2 实现结果

开发机实现完成。证据绑定上述 HEAD 加本工作树三路径差异，尚未提交。

- 原因：`beginSnapshotPolling` 的生命周期只覆盖请求。请求返回后，后台事件仍进入后端快照，但页面不再读取。
- 现在由请求和真实受管任务共同维持一个 500 ms 刷新循环。读取中的轮询不再追加请求。
- `running` / `starting` 且非恢复 PID、非释放事实继续刷新。仅有历史 `cleanupRequired` 不维持高频轮询。
- 终态通过既有 `renderSnapshot` 更新停止按钮及对话控件。后端 `canSwitch` 和清理守卫保持原样。
- 显式操作遇到旧读取时，等待它结束并合并为一次新读取。停止或处置后的控件不复用操作前的快照。
- 工作区和对话操作期间暂停轮询；取消或失败后恢复。关闭时清除刷新与前台计时，丢弃迟到快照。
- 输出仍经既有事件去重、纯文本渲染和脱敏路径进入原工具卡。快照失败显示有界、脱敏的诊断并支持重试。

修改路径仅为：

1. `src/shell/product/renderer/a9-workbench.js`。
2. `src/shell/tests/product/a9-background-refresh.test.ts`（新增）。
3. 本任务书。

### 4.3 开发机定向验证

所有命令先执行 `source ~/.nvm/nvm.sh && nvm use`，实际为 Node 20.17.0。
测试直接加载本工作树的完整 Renderer；Preload 返回及 DOM 是夹具。
后台工具回归另覆盖实际 Runtime、SQLite 与已构建 Runner 消费链，native transport 为夹具。
这不是 Electron 打包运行或 Win7 实机证据。

| 检查 | 命令及结果 |
|---|---|
| 原实现红例与依赖编译 | `npm run test:local -- --module shell --test-file tests/product/a9-background-refresh.test.ts`；退出 1。七模块编译、Shell lint 与静态门通过。10 项测试中 8 项失败、2 项通过。迟到 stdout/stderr 未显示、自然退出后新建对话仍禁用直接复现。 |
| 停止后新快照补充红例 | `npm test --prefix src/shell -- --runInBand --runTestsByPath tests/product/a9-background-refresh.test.ts --testNamePattern 'reads fresh controls after Stop'`；退出 1。初版复用了停止前的在途快照，随后修正为一次合并的新读取。 |
| 修复后的定向消费者 | `node --check src/shell/product/renderer/a9-workbench.js`；退出 0。`npm test --prefix src/shell -- --runInBand --runTestsByPath tests/product/a9-background-refresh.test.ts tests/product/a9-workbench-contract.test.ts tests/product/a9-background-tools.test.ts`；退出 0，3 套件 66 项通过。 |
| 退出取消及改动审阅相关回归 | `npm test --prefix src/shell -- --runInBand --runTestsByPath tests/product/a9-change-review-workbench.test.ts tests/product/a9-21-workbench-checkpoints.test.ts`；退出 0，2 套件 11 项通过。 |
| 文档检查 | `npm run docs:check`；退出 1。仅 `task-index`、`task-lifecycle` 两项：本工作树索引没有 A9-40 行。该行已在主工作区，本分工明确不复制或修改索引，交主会话整合后检查。 |
| 差异与格式 | `git diff --check`；退出 0。三路径 UTF-8 无 BOM、LF、无行尾空白检查通过。 |
| 可应用性 | `git diff -- src/shell/product/renderer/a9-workbench.js \| git -C /Users/qlyf/Developer/win7-coding-Agent apply --check`；退出 0，检查目标为含 A9-34 的 `f374e37`，没有写入主工作区。 |

新增 11 项行为测试覆盖请求终态后迟到输出、原工具卡展开态、滚动与焦点保持、自然退出、慢请求串行及合并、
历史恢复事实、混合后台事实、停止后新读取、关闭清理、工作区切换及取消、错误恢复、前台预览与取消。
本轮没有修改任何现有测试文件，没有运行整批变异测试。
测试 DOM 补齐标准 `append` 方法后，单独复验新增文件 11 项，退出 0。
最终产品差异的相关测试共 5 套件 77 项通过；没有据此签发完整版本结论。

### 4.4 整合与限制

- 与 A9-34 的同文件交叠为 `state` 声明和 `bind()`，增加内容在不同位置。
  本任务还修改 `refreshSnapshot`、`runConversationOperation`、`chooseWorkspace`、`beginSnapshotPolling`，
  新增 `showSnapshotError`、`syncSnapshotPolling`。
- 本工作树没有复制 A9-34 补丁。主工作区已含 A9-34 的 `f374e37`；最终整合及整合后检查由主会话完成。
- `activeManagedProcesses`、`syncComposer`、`renderSnapshot` 和后台守卫没有改动。
- 完整日常集合、A9-34 整合后验证、Electron 打包运行时、Win10、Win7：`NOT_PERFORMED`。
- 历史 KL-3/KL-13 与 WIN7-55 结论不改判。没有 Win7 PASS、正式门 A/B、发布或推送结论。

### 4.5 main 联合验证与中断恢复（2026-10-27 America/Los_Angeles）

主会话已将 A9-40 整合到含 A9-34 的 main `f374e3783eb6e863a84c97b0a28c94f52a2169c9`。
A9-34 已本地提交；A9-40 保留为可审阅工作区修改，未提交、未推送。
本轮只恢复验证记录与交付文档，没有再次修改产品代码。

证据保存在 `outputs/a9-34-main-integration/a9-40-integration-20261028T053205Z/`。
`source-binding.json` 绑定完整文件 SHA、原始日志和界面检查结果。
Renderer SHA-256 为 `24effcf5c631ef32b8c60128e01d105a9193743c35a5fc8f8eb9c574e3f0a66e`。
目录还保留源码补丁、新增测试及浏览器夹具，原 A9-34 证据没有覆盖。

| 范围 | 结果与适用边界 |
|---|---|
| main 受影响消费者 | 上一执行轮 `npm run test:local -- --module shell` 退出 0；七模块依赖编译及 Shell 静态门通过，54 套件、1340 项通过，12 项慢检查按日常配置跳过。开发机 macOS / Node 20.17.0，耗时 36.485 秒。 |
| 两项功能联合交互 | 上一执行轮加载真实 workbench.html、CSS、完整 Renderer 与桩 preload，16 项通过，错误 0。覆盖取消零请求、确认处置、后台迟到输出、纯文本、焦点与展开态、自然退出、闲时停读、旧快照在途时处置后读取新状态，以及其他活动进程继续阻断。 |
| 中断后的输入核对 | 当前 JS/CSS 与浏览器实测副本逐字节一致；HTML 只相差已声明的夹具脚本注入；新增测试与代理交付一致。A9-34 原绑定文件中只有本轮 Renderer 发生变化，故不重复已通过的联合检查。 |
| 未变化模块 | A9-34 已保存的六模块 2123 项按 `INHERITED_EVIDENCE` 引用；产品源码、测试与依赖配置未变化。不是本轮重新执行，不与当前 Shell 数量拼成全量直接 PASS。 |
| 尚未执行 | Electron 打包运行时、Win7 开发级运行、Win10、正式门 A/B、推送及发布均为 `NOT_PERFORMED`。日常移出的扫描慢检查与 12 项判定器慢检查也不是直接证据。 |

Shell 日志仍有既有 Jest 句柄提示，命令最终正常退出。
本轮没有将该提示解释为已修复，也没有因它重复启动整批检查。
主会话收尾的 `npm run docs:check` 通过，检查 391 份文档、62 份任务书；`git diff --check` 通过。
日志和 `closeout-checks.json` 保存在同一证据目录。实机准备见 §5。

## 5. 两项改进联合试用（已批准）

2026-10-27 America/Los_Angeles，负责人对本节具体试用提案回复“继续推动”。
原消息时间为 `2026-10-28T05:44:47.550Z`。本节范围及 A9-34 §8 Q4 的选项 A 获准。
主会话将 A9-34 与 A9-40 一起放到原 Win7 测试机试用。
目标是确认真实用户能持续看见后台进展，并在异常恢复后继续工作。
开发浏览器结果不能证明 Electron、真实进程、数据库与退出共同生效。

工作区差异授权登记在 [ENGINEERING_03 §10.5](ENGINEERING_03_WIN7_DEV_CHANNEL.md#105-a9-34a9-40-联合试用的-main-工作区例外2026-10-27)。
本轮只增加下表准确版本的开发级执行，不改写常设授权 r2 原文、历史批准或已签结论。

| 要素 | 已批准范围 |
|---|---|
| 版本与本地保存 | 仅 A9-34 已提交实现和本任务 §4.5 的准确 A9-40 改动；允许在 main 本地提交本任务相关路径和文档差异，保留其他会话修改。 |
| 构建 | 本地提交后按现有入口单次开发构建，绑定实际提交和 ZIP SHA；复用经核验适用的原生输入，不分配候选号、不双构建、不冻结。当前开发包为 `NOT_PERFORMED`。 |
| 工作区差异 | 仅为这两项改进，将常设授权 r2 的本地执行工作区改为当前 main；其他版本不自动取得此例外。保留旧账本，日额不重置。 |
| 目标与运行边界 | 沿用 DCCS-CHAIZL-PC / Win7 SP1 x64 build 7601、原主机键、dccs-chaizl 管理账户与 agent 普通桌面身份；仅局域网和 `C:\A9-DEV\`。使用原工具、独立 holder、新 run，不接管其他会话锁。身份与运行态在获准后现场核验。 |
| 投入上限 | 首轮目标机窗口最多 60 分钟，包含传输、运行、取证与收尾；最后 10 分钟不再开始新场景。真实模型请求 0 次，不产生模型调用费用。60 分钟是投入封顶，不是完成耗时预测；两项新链路的实机耗时为 `UNKNOWN`。 |
| 局部修复与重试 | 仅修复本版本范围内暴露的问题；修改形成新源码/包身份和新 run。首败先定位，同类失败两轮仍未闭环即停止；不增加投入上限，不重做无关检查。 |
| 停止与收尾 | 身份、完整性、审计、进程生命周期未知或权限边界失败时立即停止依赖动作并保留证据；只按有效授权收尾。ADR-0264 根外终止例外已到期，不沿用、不扩大终止范围。 |
| 不包含 | 新权限、安装或系统配置变更、其他版本、正式门 A/B、推送、发布及历史材料删除。 |

在批准范围内按以下顺序执行：

1. 核对当前源码和包内真实入口。
2. 核对目标身份、普通桌面、空间和锁。
3. 通过产品链路启动受管后台任务。
4. 观察请求结束后的迟到输出。
5. 核对自然退出后界面恢复。
6. 按 A9-34 §6.2 完成异常重启与用户确认处置。
7. 核对审计、持久化、对话切换、正常关闭和重开。
8. 回收证据，核对本次进程与任务收尾。

用受控夹具替代模型响应；真实产品 main/preload/IPC、State、Runner 和 DOM 不替换。
涉及崩溃的场景在执行前核对进程与有效收尾范围；不能安全收尾则不启动该场景。
当前包内输入闭包、开发驱动与目标运行态仍待准入，未声称可直接运行。
结果只记 `DEV_CHANNEL`，不改变 WIN7-55 或已登记限制的正式结论。
开始目标机窗口前，需要测试机开机、联网且保留 agent 登录桌面。

### 5.1 本地保存与构建输入阻断（2026-10-27 America/Los_Angeles）

构建为 `BLOCKED`：缺少输入锁绑定的 managed Runner 原始返回 ZIP。
本轮源码与 §4.5 的逐文件 SHA 相同；已通过的消费者与浏览器检查不重复执行。
本地提交只纳入 A9-40 源码、测试及关联授权/状态差异。
其他会话的归档、ADR-0292/0293 和 ENGINEERING_05 修改保留在工作区。
保存回执与准入材料在 `outputs/a9-34-main-integration/a9-40-build-preparation-20261028-r1/`。

| 输入 | 本地核对结果 |
|---|---|
| Electron 22.3.27 | `.acceptance/deps/electron/electron-v22.3.27-win32-x64.zip`；ZIP 与 `electron.exe` 哈希匹配 |
| Storage | `.acceptance/deps/a6/WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip`；ZIP 与 native binding 哈希匹配 |
| Runner v26 managed / 协议 3 | `WIN7_D013_V26_HELPER_ARTIFACTS_20261003-060935.zip`；原件未定位，所需尺寸 221,660 B |
| 开发输入锁 | `release/win7-product-v3/a9-32-input-lock.json`，SHA `88c600b9…43158`；本轮不改锁、不重编原生 |

Runner ZIP 所需 SHA-256 为 `251674103e519b4e642c46b38d2b8af29929732a209613cfc5d3721daba47a40`。
原路径在已退役的 `a9-31-background-tools` 工作树下：
`.acceptance/a9-31-developer/native-kit-r3/return-BuildA/`。
定位依据为保留的 `INPUTS_BEFORE.json`，完整位置和输入身份见上述准入材料。

当前仓库、既有工作树、保留材料和归档索引未定位到该原件。
已登记外置卷在线且身份检查通过；准确恢复集合仍为 `UNKNOWN`。
远端已发布归档未列出该 ZIP；slice4 草稿不作恢复依据。
Downloads 与 Trash 因 macOS 隐私限制不可读，不能据此判断文件不存在。
没有替换输入、重新封装 helper、改写哈希、连接 Win10 或消耗 Win7 窗口。

取得原始 ZIP 后，先核对完整 ZIP 与成员哈希。
再从本地提交建立干净构建源，复用现有依赖，保护 main 的无关修改。
构建身份、闭包及实际开发驱动就绪后才开始目标机窗口。
当前打包运行时、Win7 开发级运行、门 A/B、推送和发布均为 `NOT_PERFORMED`。

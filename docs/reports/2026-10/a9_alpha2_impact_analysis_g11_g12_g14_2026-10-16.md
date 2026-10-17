# Alpha 2 影响分析：G11、G12、G14（2026-10-16）

```text
Status: ANALYSIS_DELIVERED_PENDING_OWNER_REVIEW
Evidence: 开发机（源码差异、冻结包编译产物差异执行）；未在 Win7 实机验证
Binds: WIN7-42 source 94385a87… → WIN7-45 source ba042757… / ZIP ae1d4bb1… / run 5773470e…
Authorization: 负责人 2026-10-16 回复“继续：出 G11、G12、G14 的影响分析（开发机，只改文档）”
```

结论：三行都不能整行继承，也没有发现新的行为回归。F-01 不波及 Git：98 种“包装器 + Git”写法在两个版本的判定完全一致。G14 的撤销代码本身没有改动，缺的是续跑回合与后台进程相关的撤销证据。G11 在 Win7 上没有任何候选的真实模型存档证据，M5 必须保留。G12 的 CMD 降级路径在 WIN7-45 没有被执行。

本报告只做影响分析。不改产品、不连接目标机、不批准任何继承（ADR-0155 仍 Proposed），不改变门 B 结论（ADR-0238）和 F-01 的登记（ADR-0239）。前一份分析见[G04/G05/G07/G08/G09 影响分析](a9_alpha2_impact_analysis_g04_g05_g07_g08_g09_2026-10-16.md)。

## 1. 逐行结论

| 行 | 实际改动面（开发机） | 可提议继承的部分（须 ADR-0155） | 必须补直接证据 | 对 M 组的调整建议 |
|---|---|---|---|---|
| G11 J1～J3 | 模型看到的工具表和提示正文变了；读、搜、写、改等 9 个工具定义内容相同；`gateway` 10/10 同字节 | Provider 发送、预算、拒绝与终态验证判定所在代码区（见前一份报告 §3.2） | Win7 上真实模型的 J1、J2、J3 全程 | M5 保留，加三条前置（第 3.1 节） |
| G12 J4 | 选 Shell 的源码未改；每条 Shell 命令改走输出协议 v3；批准卡摘要由截断 160 字符改为完整命令加 `cwd` | `git-command-policy`（`18420605…`）、`approval-binding`（`8ce29db0…`）两包字节相同；`git-adapter` 7/7 同字节 | CMD 降级路径在 v3 下的一次执行；真实 Git 状态、Diff、本地提交；批准卡长命令显示 | 并入 M1，加三项检查（第 3.2 节） |
| G14 J5 | `undoTurn`、`undoFile` 与检查点管理器代码未改；续跑回合新增“可重试则记为 interrupted”；后台进程可晚于回合结束写文件 | 撤销函数与检查点管理器（W42 的 W42-05、17、18、19、23 为旧候选 Win7 证据） | 续跑回合的撤销；`start_process` 外部变更的撤销；后台晚写文件后的漂移判定 | 并入 M3，加三项检查（第 3.3 节） |

## 2. 方法与基线

执行代理（开发机）做了四件事。

1. 比较 `94385a87…` 到 `ba042757…` 的 20 个产品源码文件（1888 行新增、190 行删除）。`shell-detection.ts`、`trusted-shell-environment.ts`、`containment.ts`、`process-cleanup.ts`、`approval.ts`、`output.ts` 不在差异里。`workspace`、`gateway`、`git-adapter` 的源码无差异。
2. 从两个冻结 ZIP 取出 `resources/app/core/dist`，在 Node v22.23.1（macOS）上加载两版代码，对同一批输入求值：批准请求（26 种 Git 写法）、工具定义（三种权限模式）、系统提示、Policy（98 种“包装器 + Git”写法）。目标机是 Electron 22 / Node 16，所以这是 SURROGATE，不是 Win7 行为。
3. 读取 W45 已有证据（`01-p01-env`、`04-p04-streaming`）和 WIN7-42 报告 `report-w42.json` 的 30 个用例名，取其对应关系，不重复执行。
4. 读取 A9 合同对 J1～J5 和 WIN7-10 的记录。

脚本、语料、结果与两包文件哈希保存在候选外 `preparation/alpha2-impact-analysis-20261016-02/`。结果文件 SHA-256：批准、工具、提示 `c9041ab1…`；Git 包装器 `e6f2352f…`。语料不穷举。

## 3. 逐行分析

### 3.1 G11 J1～J3 项目解释、缺陷修复、小功能

模型能看到的东西变了：

| 项 | WIN7-42 | WIN7-45 |
|---|---|---|
| 工具数（Full Access / Review） | 10 | 13，新增 `start_process`、`read_process_output`、`stop_process` |
| 工具数（Read Only） | 4 | 5，新增 `read_process_output` |
| `shell` 工具 | 有 `background` 参数 | 无 `background` 参数；Schema 禁止额外属性，循环按此严格校验，旧参数会被拒绝（源码依据，未执行） |
| 定义内容相同的工具 | — | `list`、`read`、`search`、`update_plan`、`write`、`edit`、`copy`、`move`、`delete` |
| 系统提示 | 29 行 | 30 行：工具清单一行改动，新增一行说明后台工具 |

直接影响三点：

1. 系统提示正文变了，但版本标记仍是 `a9-system-prompt-v3`（观察 O-01）。任何按该标记归档的请求日志，分不出两版提示。M5 须同时记录提示正文的 SHA-256。
2. `start_process` 之后验证状态回到 `unverified`（前一份报告 §3.2）。J2 要求“已验证完成状态”，所以旅程里模型若启动后台命令再收尾，结论应是未验证，不能是已验证。
3. `configureProvider` 在后台进程运行时抛出 `A9_PROVIDER_MANAGED_ACTIVE`（前一份报告 §3.5）。

Win7 上的真实模型证据：

| 来源 | 内容 | 状态 |
|---|---|---|
| WIN7-45 | 25 用例使用回环夹具 | 不含真实模型 |
| WIN7-42 | 30 个用例名无 J1～J3 | 真实模型使用情况 `UNKNOWN` |
| WIN7-10（Alpha 1） | 操作者报告到 J4；J1～J3 的执行事实未写入候选外证据目录 | `EVIDENCE_PENDING` |
| WIN7-19（Alpha 1 收口） | 收口报告没有 J1～J3 条目 | 存档证据缺失 |
| 开发机 A9-05（2026-08-23，DeepSeek） | J1～J3 真实模型 PASS | 开发机，源码早于 WIN7-42，提交本轮未核对 |

所以 Win7 上没有任何候选的真实模型 J1～J3 存档证据。WIN7-45 的 NOT_PERFORMED，旧候选的 `UNKNOWN`。

另有环境事实：W45 的 `g0-env.json` 没有记录 Git、Node、npm 是否安装。A9 合同记录 WIN7-10 的 J1～J3 用的是不依赖系统 Node 和 Python 的一次性 CMD 项目。J3 要求“允许安装项目依赖”，该机器上的前置条件 `UNKNOWN`。

M5 的三条前置：

1. 绑定准确服务、模型和配置；记录提示正文 SHA-256。
2. 选不依赖系统 Node 的项目，或先只读核实 Node 与 npm 存在。
3. 旅程中不要在后台进程运行时改 Provider。

### 3.2 G12 J4 Shell 与 Git

不变的部分：

- 选 PowerShell 或 CMD 的源码 `shell-detection.ts` 和环境叠加 `trusted-shell-environment.ts` 不在差异里。W45 自动选中 PowerShell 5.1.14409.1018（`s04-encoding.json`）。
- Git 分类与批准绑定的两个文件同字节。26 种 Git 写法的批准请求，`gitBinding`（远端、分支等目标字段）26/26 一致；新摘要都以旧绑定摘要开头。

变化的部分：

- 每条 Shell 命令改走输出协议 v3（`native-transport`、`native-protocol`、`trusted-shell-runner` 与新增的 `stream-output`）。W45 的 S01～S06 在 PowerShell 上取得直接 PASS。W45 证据中没有 `"kind": "cmd"`，CMD 降级路径在 v3 下 `NOT_PERFORMED`。
- 批准卡摘要现在含完整命令和 `cwd`。旧版把摘要截断在 160 字符：200 多字符的命令，旧摘要长 167、不含完整命令；新摘要长 217、含完整命令。批准绑定摘要的哈希随之全部变化（26/26），同一版本内创建与校验用同一函数，不构成不一致。长命令在 1366×768 卡片里的显示没有证据，`UNKNOWN`。
- 编码：W45 的 `s04-encoding.json` 中，UTF-8 与 CRLF 通过；UTF-16LE 与 CP936 样本得到 `A9_OUTPUT_ENCODING_ERROR` 且输出为空，按 KL-5 为 INFORMATIONAL。目标机 `chcp` 为 936，J4 里原生中文输出可能受影响。WIN7-42 对这两种样本的行为未比较，`UNKNOWN`。该项随 KL-5 携带，不新增限制。

F-01 对 Git 的影响：开发机对 7 种 Git 命令乘 14 种包装前缀共 98 条求值。

| 结果 | 条数 | 新旧一致 |
|---|---|---|
| `ask`（`git push`、`--force`、`reset --hard`、`clean -fdx`、`commit`、`branch -D`） | 84 | 84/84 |
| `allow`（`git status`） | 14 | 14/14 |

包装前缀为：无、`cmd /c`、`start`、`start /b`、`cmd /c start`、`xargs`、`nohup`、`time`、`npx`、`npm exec --`、`conhost`、`call`、`powershell -Command`、`cmd /c "…"`。另对 `git push origin main` 的 7 种变形写法（`cmd /c`、`start`、`start /b`、`nohup`、`xargs`、`git -C`、`&&` 串接）取批准请求：新旧 `gitBinding` 都存在且相同，目标为 `remote=origin branch=main`。所以 F-01 不波及 J4 的外部 push 审批，证据层级为开发机 SURROGATE。

仍缺的直接证据（并入 M1）：

1. 同一份 W45 包上 CMD 降级路径执行一次，覆盖 v3 流式输出。
2. 真实 Git 状态、Diff、本地分支与提交；执行前只读核实 Git 是否安装。
3. 批准卡对 200 字符以上命令的显示。

### 3.3 G14 J5 撤销与恢复

不变的部分：

- `undoTurn`、`undoFile`、`confirmExternalUndo`：运行时差异的最后一个相关区段在新文件第 2301 行结束，下一个从第 2527 行开始；撤销函数在 2389～2445 行，不在任何改动区段内。
- 检查点管理器 `CheckpointManager` 在 `workspace/src`，该包无源码差异，17/17 同字节。IPC 的撤销动作未改，只新增继续动作。
- W42 旧候选 Win7 证据：W42-05（Diff 与检查点）、W42-17（撤销）、W42-18（外部漂移）、W42-19（后续回合）、W42-23（恢复目录与 Git 安全）。WIN7-42 的正式结论为 `A9_27_WIN7_42_A9_26_PASS`。

变化的部分：

1. 续跑回合以非完成结果结束时，任务、回合、运行都记为 `interrupted`。撤销是否依赖回合状态未核对，`UNKNOWN`，也没有直接测试。
2. `start_process` 的外部变更与 Shell 共用同一收集路径，但后台进程在回合结束后仍可写文件。晚写的文件撤销时如何判定漂移，没有测试。
3. 重启后的恢复卡（`recoveryTasks`）是新增事实源。

W45 已有直接证据：重启后零请求（E03 `04-restart-counters`）、单击与双击去重（`05-turn-dedup`）、旧批准失效（E06 `cont03-approval-unknown`）、Shell 未知副作用阻断。续跑函数建立新循环并清空历史，源码注释说明新循环没有挂起的批准和旧工具队列。按源码推断，不重放与工具种类无关；但 Win7 直接证据只覆盖 Shell 与模型请求，Git 重放 `NOT_PERFORMED`。

仍缺的直接证据（并入 M3）：

1. 续跑回合产生的检查点，撤销一次。
2. `start_process` 之后的外部变更，撤销一次。
3. 后台进程在回合结束后写文件，再撤销，观察漂移保护。

A9-34 的恢复清理出口仍未做，随结论携带。

## 4. 观察

这两项不是缺陷结论，也不需要负责人裁决。

| 编号 | 观察 | 处置建议 |
|---|---|---|
| O-01 | 系统提示正文变了，版本标记仍是 `a9-system-prompt-v3` | M5 记录提示正文 SHA-256；是否在后续版本递增标记，交后续任务 |
| O-02 | 批准卡摘要由截断改为完整，是更强的显示；批准绑定摘要哈希全部变化 | 并入 M1 的批准卡检查 |

## 5. 对 M1～M5 的调整建议（仅建议，不是授权）

| 组 | 本报告新增的建议 |
|---|---|
| M1 | 加 CMD 降级一次执行、真实 Git 状态与本地提交、200 字符以上命令的批准卡显示；执行前只读核实 Git 是否安装 |
| M2 | 无新增 |
| M3 | 加续跑回合撤销、`start_process` 外部变更撤销、后台晚写文件的漂移判定 |
| M4 | 无新增 |
| M5 | 加第 3.1 节三条前置；记录提示正文 SHA-256 |

A9-36 仍是 DRAFT_READY_FOR_REVIEW，上述建议不生效。

## 6. 未执行与未知

| 项 | 状态 |
|---|---|
| 任何目标机或 Win7 动作 | `NOT_PERFORMED` |
| CMD 降级路径在 v3 下的执行 | `NOT_PERFORMED` |
| 真实模型 J1～J3 在 Win7（任何候选） | WIN7-45 `NOT_PERFORMED`；旧候选 `UNKNOWN` |
| W45 机器上 Git、Node、npm 是否安装 | `UNKNOWN` |
| WIN7-42 对 CP936、UTF-16LE 样本的输出行为 | 未比较，`UNKNOWN` |
| 长命令批准卡在 1366×768 的显示 | `UNKNOWN` |
| WIN7-42 的 W42 用例是否使用真实模型 | 未核对，`UNKNOWN` |
| REVIEW、WORKSPACE_WRITE 模式的令牌绑定路径 | 未求值，`UNKNOWN` |
| Electron 22 / Node 16 下的求值 | 未执行，本报告用 Node v22.23.1 |
| ADR-0155 继承记录 | 未批准 |

## 7. 待裁决

本报告没有新的待裁决项。三行的处置沿用缺口表 Q1 的 C：先分析，再定哪些进 M 组。下一步由负责人在以下事项中择一：缺口表 Q2 的范围裁决、评审 A9-36 草案、或把 M1～M5 的补证与继承方案合并成一份批准材料。

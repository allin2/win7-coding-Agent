# Alpha 2 影响分析：G04、G05、G07、G08、G09（2026-10-16）

```text
Status: ANALYSIS_DELIVERED_F01_REGISTERED_AS_KNOWN_LIMIT
Evidence: 开发机（源码差异、冻结包编译产物差异执行）；未在 Win7 实机验证
Binds: WIN7-42 source 94385a87… → WIN7-45 source ba042757… / ZIP ae1d4bb1… / run 5773470e…
Authorization: 负责人 2026-10-16 选择[缺口表](../../plans/A9_ALPHA2_GAP_DISPOSITION.md) Q1 的 C
```

结论：五行都不能整行继承，但可继承的范围比旧表小得多。G05、G08 的审阅与撤销代码本身没有改动，只剩一条新入口旅程要补。G09 只多了一个窄入口。G04 的 Provider、预算、终态验证判定代码区没有改动。G07 有真实回归：13 种启动器包装写法在 WIN7-42 要确认，在 WIN7-45 直接放行，需要负责人裁决（第 4 节）。

本报告只做影响分析。不改产品、不连接目标机、不批准任何继承（ADR-0155 仍 Proposed），不改变门 B 结论（ADR-0238）。

## 1. 逐行结论

| 行 | 实际改动面（开发机） | 可提议继承的部分（须 ADR-0155） | 必须补直接证据 | 对 M 组的调整建议 |
|---|---|---|---|---|
| G07 Policy 与 Git | `policy.ts` 新增非 Git 高影响分析器，先于 Git 分类运行；删除旧的三条正则 | `git-command-policy.js`（`18420605…`）、`approval-binding.js`（`8ce29db0…`）两包字节相同；38 个 Git 写法新旧判定 38/38 一致 | 批准与目标绑定链；新入口 `start_process`；13 种包装写法（第 4 节） | M1 保留，加入第 4 节的 13+4 个判定用例 |
| G04 预算、验证、审计、Provider | 循环文件 `a9-agent-loop.ts` 改 174 行；旧文件 587～1112 行无任何改动 | Provider 发送、预算、响应完整性、终态验证判定所在代码区未变 | `start_process` 使验证失效；`tool_output` 与托管所有权的审计失败硬停；续跑路径的新循环 | M2 缩小为这三项，不重做 Provider 拒绝与预算 |
| G05 改动审阅 | `workspace` 包 17/17 同字节；渲染层与运行时没有审阅段改动 | 审阅、Diff、撤销所在代码 | `start_process` 之后的外部变更进入同一检查点链 | 并入 M3，缩为一条旅程 |
| G08 检查点与恢复 | `a9-persistence.ts` 改 206 行，全部为新增方法与过滤；检查点写入与回滚函数无改动 | 检查点表的写入与回滚 | 续跑回合产生的检查点；`start_process` 的外部变更 | 并入 M3 |
| G09 隔离、IPC、秘密、TLS、进程树 | 新增 1 个 IPC 动作、1 个预加载函数；`gateway` 10/10 同字节；退出对话框逻辑重写 | 网关与 TLS 实现层；秘密屏蔽已有 W45 实机直接证据 | 新动作的 Schema 负向（M4 已备）；退出时 `unresolved` 分支 | M4 不变；M5 加一条前置须知（第 3.5 节） |

## 2. 方法与基线

执行代理（开发机）做了三件事。

1. 比较 `94385a87…` 到 `ba042757…` 的非测试源码，共 20 个产品源码文件，1888 行新增、190 行删除。验收驱动入口脚本 `a9-batch2-driver-entry.cjs` 另增 2052 行，不计入。
2. 从两个冻结 ZIP 取出 `resources/app/core/dist`，在 Node v22.23.1（macOS）上加载两版 `PolicyEngine`，对同一批命令求值。目标机是 Electron 22 / Node 16，所以这是 SURROGATE，不是 Win7 行为。
3. 读取 W45 已有证据的覆盖对应（取自[缺口表 §7](../../plans/A9_ALPHA2_GAP_DISPOSITION.md)），不重复执行。

差异执行的脚本、语料、结果和两包文件哈希保存在候选外 `preparation/alpha2-impact-analysis-20261016-01/`。结果文件 SHA-256 为 `bea4153a…`。

语料限制：WIN7-42 的 19 种 Git 形态原始清单本轮没有逐项取回，状态 `UNKNOWN`（后续更正：清单已在 `release/win7-product-v3/a9-win7-42-smoke.cjs` 的 `W42_GIT_FORMS` 定位，见缺口表 §19）。我用 38 个自拟 Git 写法代替，不等同原清单。语料也未穷尽 Shell 写法。

## 3. 逐行分析

### 3.1 G07 Policy 与高影响 Git

`policy.js` 从 `95372455…` 变为 `59356888…`。变化集中在 `checkAlwaysConfirmOperation`：新增 `shellImpact`，在 Git 分类之前检查删除、发布、系统变更、全局安装和无法分析的写法。

| 语料组 | 条数 | 新旧一致 | 旧确认、新放行 | 旧放行、新确认 |
|---|---|---|---|---|
| Git 写法 | 38 | 38 | 0 | 0 |
| 非 Git 应确认 | 33 | 17 | 0 | 16 |
| 数据语境（echo、rem、printf） | 18 | 14 | 4 | 0 |
| 包装与变体写法 | 45 | 27 | 13 | 5 |
| 取自旧测试的字面量 | 39 | 23 | 0 | 16 |

- 新增确认主要是删除类：`rm -rf`、`del /s`、`rmdir`、`Remove-Item`、`erase`，以及全局安装、`sc stop`、`npm.cmd publish`、带引号的 `"npm" publish`。这扩大了确认面，会让脚本化删除多一次确认。
- `start_process` 在循环里以 `shell` 身份进入 Policy，所以走同一套分析。`stop_process` 进入 Policy 的命令文本固定为 `stop managed process`，不含高影响词，Full Access 下不确认；它的约束来自句柄与所有者校验，不来自 Policy。
- 批准摘要从截断 160 字符改为完整命令加 `cwd`，审批绑定摘要的输入随之变化。该变化在 W45 的 25 用例中没有被单独断言。
- REVIEW 与 WORKSPACE_WRITE 模式的令牌绑定路径本轮没有求值，`UNKNOWN`。

### 3.2 G04 预算、验证、审计、Provider

对 `a9-agent-loop.ts` 的改动按旧文件行号归位：

| 旧文件行区间 | 内容 | 是否改动 |
|---|---|---|
| 754～853 | Provider 发送、预算超限、重试减半、输出预算 | 无 |
| 919～931 | `length`、`content_filter`、工具调用不完整的拒绝 | 无 |
| 946～954 | 终态 `verified` 与 `unverified` 判定 | 无 |
| 1423～1450 | 变更后清除验证、Shell 验证证据 | 仅在 1433 行后新增 `start_process` 分支 |
| 1622、1644 | 审计失败置位与硬停 | 无；新增 `tool_output` 事件类型走同一通道 |

因此 Provider 拒绝、预算和终态验证判定没有被这次改动触及。`a9-agent-loop.js` 的字节仍然变了，按 ADR-0155 的精确哈希口径不能整文件继承，只能提议“区间等同”的继承记录，并经独立审核。

必须直接验证的三项：

1. `start_process` 之后 `verified` 回到 `unverified`。这是新增分支，W45 没有断言。
2. `tool_output` 与托管所有权事件写入失败时的硬停。W45 只覆盖终态审计（E04 `s03t`）和 `tool_end` 审计（E07 `safe02`）。
3. 续跑路径新建循环并重载 AGENTS 与预算。W45 摘要里的 `agents_marker_present` 均不为 true，此项仍需核验准确输入与实际请求构造。

### 3.3 G05 改动审阅与 G08 检查点

- `workspace` 包 17/17 文件同字节。渲染层 `a9-workbench.js` 新增的是 `tool_output` 与续跑卡片，没有审阅面板改动。运行时没有审阅段改动。
- `a9-persistence.ts` 的检查点写入与回滚函数没有出现在差异里。新增的 `getTaskRecovery`、`requestTaskContinuation` 等方法只读事实或写续跑事务。
- 唯一新触点是 `start_process` 之后进入“收集外部变更”（循环里 `isShellTool || start_process` 分支），它与 Shell 共用同一检查点链。续跑回合也会产生自己的检查点。这两处没有 Win7 直接证据。
- `sameWorkspacePath` 在 win32 上统一按大小写不敏感比较，对 Windows 路径与旧逻辑等价。

### 3.4 G09 隔离、IPC、秘密、TLS、进程树

- 新动作 `a9.task.continue` 严格校验 4 个键、长度不超过 256、`recoveryRevision` 为 64 位十六进制。预加载只新增 `continueTask`。M4 的 17 种负例已备，目标机仍 `NOT_PERFORMED`。
- `gateway` 10/10 同字节，TLS 实现层未变。真实服务的 TLS 连接仍随 M5。
- 秘密屏蔽由新增的 `stream-output.ts` 承担。W45 的 `B2-S05` 与 R7 扫描已有实机直接证据。
- `main.js` 的退出对话框改为“停止后退出 / 留给系统后退出 / 取消”，运行时关闭结果新增 `unresolved` 字段。W45 的 BG03 覆盖了正常退出，`unresolved` 非空分支没有被触发。

### 3.5 M5 的前置须知

`configureProvider` 在有后台进程运行时抛出 `A9_PROVIDER_MANAGED_ACTIVE`。这是产品行为变化：J2、J3 旅程中若有后台进程在跑，不能中途修改 Provider。

## 4. 新发现 F-01：13 种启动器包装写法不再确认

旧版用全文正则匹配 `npm publish`、`reg add` 等字样，新版只识别每个命令段的首个命令。下面 13 种写法在 WIN7-42 判为确认，在 WIN7-45 判为 `allow`（规则 `POLICY_FULL_ACCESS_ALLOWED`）：

| 类别 | 写法 |
|---|---|
| `start` 启动 | `start npm publish`、`start /b npm publish`、`cmd /c start npm publish`、`start reg add …`、`cmd /c start reg add …`、`start icacls …` |
| 前缀包装 | `xargs npm publish`、`nohup npm publish`、`time npm publish`、`npx npm publish`、`npm exec -- npm publish` |
| 其他宿主 | `conhost reg add …`、`wmic process call create "reg add …"` |

另有 4 种写法的放行是预期收窄：`echo npm publish`、`rem npm publish`、`printf "reg add x"`、`echo reg add …` 属于纯数据，ADR-0171 要求区分数据与执行。

边界：[ADR-0171](../../DECISIONS.md) 写明“不宣称通用解析或沙箱”，所以新分析器不识别包装器不违反该 ADR 的字面范围。但 DECISIONS 中没有登记“包装器不确认”为已接受限制，这属于未登记的行为退化。新版同时新增了 21 种确认（删除、全局安装等），净识别面更大。

影响：Full Access 下，模型若用上述写法发起发布、注册表或权限变更，不会出现一次性确认。概率与实际危害 `UNKNOWN`。

## 5. 对 M1～M5 的调整建议（仅建议，不是授权）

| 组 | 建议 |
|---|---|
| M1 | 加入第 4 节 13+4 个判定用例；Git 形态若 ADR-0155 获批，对 `git-command-policy` 组件做继承，批准与目标绑定链仍直接测 |
| M2 | 缩为 3.2 的三项，不重做 Provider 拒绝与预算 |
| M3 | 缩为一条旅程：`start_process` 外部变更 → 审阅 → 撤销，并覆盖续跑回合的检查点 |
| M4 | 不变 |
| M5 | 加 3.5 的前置须知 |

## 6. 未执行与未知

| 项 | 状态 |
|---|---|
| 任何目标机或 Win7 动作 | `NOT_PERFORMED` |
| ADR-0155 继承记录 | 未批准 |
| WIN7-42 的 19 种 Git 形态原始清单 | 本报告未取回，`UNKNOWN`；后续已在 `W42_GIT_FORMS` 定位，见缺口表 §19 |
| REVIEW、WORKSPACE_WRITE 模式的令牌绑定路径 | 未求值，`UNKNOWN` |
| Electron 22 / Node 16 下的 Policy 求值 | 未执行，本报告用 Node v22.23.1 |
| runner 的 `background-process-manager`、`native-transport`、`native-protocol` 逐函数分析 | 未做，仅按 BG 用例的实机证据对应 |
| F-01 的实际危害与出现概率 | `UNKNOWN` |

## 7. 待裁决

问题：F-01 的 13 种写法如何处置。

| 选项 | 影响 |
|---|---|
| A：登记为 Alpha 2 已知限制，下一批修复 | 不改产品字节，M1～M5 仍可用冻结 WIN7-45 执行；Alpha 2 携带一条安全相关限制 |
| B：修复后再验收 | 需改 `policy.ts` 与测试，产生新候选和双构建；M1～M5 须改在新候选上执行，成本最高 |
| C：先复核两个版本的设计意图，再选 A 或 B | 只读，无产品改动；耗时最短，但不产出结论 |

推荐 A。理由：净确认面更大，ADR-0171 不宣称沙箱，且 B 会使已准备的 M4 与补证计划整体换到新候选。

提问：F-01 选 A、B 还是 C？

## 8. F-01 裁决（2026-10-16）

负责人回复：“F-01 选 A：登记为已知限制，不在验收前修复。”决定见 ADR-0239。第 7 节保留为裁决前的提问快照。

| 项 | 处置 |
|---|---|
| F-01 | 登记为 Alpha 2 已知限制，随完整 Alpha 2 结论携带 |
| `policy.ts` 与候选 | 不改，WIN7-45 冻结字节不变 |
| 修复排期 | 未裁决，不授权实现 |
| M1 的 13+4 个判定用例 | 建议按“表征”记录：13 种包装写法的期望值为 `allow`，4 种纯数据写法为 `allow`。通过不得解读为“包装器需要确认”。A9-36 未批准，这仍是建议 |
| 门 B 结论 | 不变，`A9_33_WIN7_45_BATCH2_PASS_WITH_KNOWN_LIMITS` |

未执行：13 种写法在 Win7 实机的判定仍 `NOT_PERFORMED`。

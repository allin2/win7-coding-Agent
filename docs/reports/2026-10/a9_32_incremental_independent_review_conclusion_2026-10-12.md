# A9-32 R-01 修复增量复审结论（2026-10-12，绑定提交 adb9d0f0…）

## 1. 结论

独立审核在开发机层对提交 `adb9d0f0a5a78dd6a82917a794d0930bff6ffa60` 的增量（`59a3f650…..adb9d0f0…`）给出有发现项 PASS。未发现阻断、高、中级问题。
证据层级是开发机（macOS，Node v20.17.0）。真实 Electron、打包、Win10、Win7 均 NOT_PERFORMED。
R-01 的修复与 ADR-0237 一致，真实写入方与读取方字段吻合，前任留下的 3 个存活反例现在各有 1 个用例变红。
发现 7 项低级或信息级问题（R-08～R-14），均不阻断。核心缺口是：8 个副作用工具里有 4 个没有仓库用例钉住，每个回合的配对键也没有用例。
独立审核没有签发 `DEVELOPER_VERIFIED`。是否把本结论登记进交接包第 6 节，由负责人决定。

| 审核者 | 日期 | 绑定提交 | 结论 | 发现项 |
|---|---|---|---|---|
| Claude Sonnet 5.5，负责人另开的独立审核会话 | 2026-10-12 | `adb9d0f0…`（增量 `59a3f650…..adb9d0f0…`） | 有发现项 PASS（开发机） | R-08、R-09 低，负责人裁决为已知限制、不补（第 11 节）；R-10～R-14 信息，负责人裁决为整体留置、不登记 |

## 2. 边界偏差（1 项，需要负责人知悉）

独立审核在隔离树和主工作区各运行了 4 次 `git status`，用于记录前后状态。该命令会刷新 `.git/index` 的缓存统计信息。
证据：主工作区 `.git/index` 的修改时间晚于审核开始时间。隔离树 gitdir 目录的修改时间也晚于开始时间。
内容未变的证据：隔离树 HEAD 前后同为 `4667bb02…`；主工作区 HEAD 前后同为 `a53c9b9d…`；主工作区 `status --porcelain` 输出哈希前后同为 `bdf14261…`（47 行）；隔离树 `.acceptance` 的 683 个文件的路径、大小、修改时间汇总哈希前后同为 `0299c8ea…`。
没有文件被写入、检出或重置。之后改用 `GIT_OPTIONAL_LOCKS=0` 执行 Git 命令。
这一项不属于被审对象，不进入发现项表。

## 3. 复算结果

执行者是独立审核本人。审核目录是新建的空目录，从 `adb9d0f0…` 的 `git archive` 解包。设置 `NPM_CONFIG_OFFLINE=true`。

| 步骤 | 命令（交接包第 2～4 节原文） | 退出码 | 结果 |
|---|---|---|---|
| Node 版本 | `node --version` | 0 | v20.17.0 |
| 清单 SHA-256 | `shasum -a 256 …/review-bundle-manifest-r4.json` | 0 | `d00d1123…`，与交接包一致 |
| 清单逐文件 | 交接包第 3 节 Python 核对 | 0 | 26 个文件字节数与 SHA-256 全部一致 |
| 增量补丁 | `git diff 59a3f650…..adb9d0f0… -- src` | 0 | SHA-256 `acd63137…`，与记录文件一致 |
| 全量补丁 | 读取 `reviewable-local-change-r4.patch` | 0 | SHA-256 `7ff126ca…`，与交接包一致 |
| `npm run verify:quick` | 同左 | 0 | 七模块编译通过 |
| State 合同 | 交接包第 2 节 State 命令 | 0 | 3 个套件，88 项通过 |
| Core 合同 | 交接包第 2 节 Core 命令 | 0 | 7 个套件，221 项通过 |
| Shell 合同 | 交接包第 2 节 Shell 命令 | 0 | 10 个套件，134 项通过 |
| r4 八个反例恢复 SHA | 交接包 4.1 节脚本 | 0 | 8 行通过，对照 `d8fd760a…` |
| r5 两个反例恢复 SHA | 交接包 4.2 节脚本 | 0 | 通过，分别 3 项与 2 项变红 |
| r6 四个反例恢复 SHA | 交接包 4.3 节脚本 | 0 | 通过，分别 3、1、1、1 项变红 |
| 全部反例结束后重跑三组合同 | 同上三条 | 0 | State 88、Core 221、Shell 134，全部通过 |

数字与执行代理的记录一致。这些数字由独立审核自己的运行得出。日志在 `logs/`。
`a9-agent-loop.ts` 的 SHA-256 是 `34184a20…`。审核结束后三个被注入的源文件与新取归档逐字节一致（1836 个文件，不含 `dist` 与 `node_modules`）。

## 4. 对交接包第 5 节新增复核点的回答

### 4.1 核对点 a：ADR-0237 两项决定与保留条件 — PASS

- 决定一：副作用工具的 `tool_end` 带 `residueRisk: true` 时保留 `tool_start`。实现在 `src/state/src/a9-persistence.ts:958`，最终过滤在 `:966`。
- 决定二：`shell` 无路径，`unknownResults` 的 `paths` 为空，Runtime 在 `src/shell/product/a9-agent-runtime.js:1971` 把它记为 opaque。带路径的工具保留路径。
- 不变项成立：无 `residueRisk` 的 `tool_end` 照旧清除；`recoveryRevision` 哈希输入（`:979`）不含新字段；Core 文件未改。
- 证据：反例 `s3`、`s4b`、`s5`、`s6`、`s7`、`s10` 全部由匹配器断言变红；探针 SP3 对 8 个工具逐个确认「带 residue 保留，无 residue 清除」。
- 保留条件有两处冗余防线，见 R-10。

### 4.2 核对点 b：sideEffects 集合覆盖与只读工具 — PASS，附 R-08

- 集合是 `write`、`edit`、`copy`、`move`、`delete`、`shell`、`start_process`、`stop_process`，共 8 个。
- Core 工具表（`src/core/src/a9-tools.ts`）里批准级别为写级别的工具正好是这 8 个。`list`、`read`、`search`、`update_plan`、`read_process_output` 是只读。
- `dispatchTool`（`a9-agent-loop.ts` 的 `switch`）只有这 13 个分支，没有其他可改文件的路径。前台 Shell 在集合内。
- Core 观察门（`a9-agent-loop.ts:1159`）使用同一份 8 个工具的清单。
- 只读工具带 `residueRisk` 不计未知：正确。State 用例第 4 项覆盖，反例 `s10`（同时去掉两处防线）使该项变红。
- `dispatchTool` 对 `write`、`edit`、`copy`、`move`、`delete` 只返回 `payload`，不带 `residueRisk`。这 5 个工具的保留路径只会在它们抛出带 `residueRisk` 或 `cleanupRequired` 的错误时触发（`a9-agent-loop.ts:1432`）。
- 仓库用例只钉住 4 个成员，见 R-08。

### 4.3 核对点 c：写入方与读取方字段 — PASS

追踪结果：

| 环节 | 位置 | 内容 |
|---|---|---|
| 写入 | `src/core/src/a9-agent-loop.ts:1533-1546` | `tool_end` 的 `data` 含 `callId`、`toolName`，残留时含顶层 `residueRisk: true`。`shell` 子对象里另有一份 |
| 落库 | `src/shell/product/a9-agent-runtime.js:1266、1276` | 持久化 `{ type, data: redactForProjection(...) }`。`residueRisk` 字段名不命中敏感字段正则，布尔值不变 |
| 读取 | `src/state/src/a9-persistence.ts:953、958` | `payload.data || payload` 取到 `data`，判断 `data.residueRisk === true` |
| 配对键 | 同文件 `:954`、`:956` | 两端都是 `${turn_id}:${callId}`，`turn_id` 来自同一事件的 `turnId` |

端到端证据：独立审核探针 `probes/shell-zz-review-probe-real-residue.test.ts` 用真实 Shell Runtime、真实 Core、真实 State。它通过 `createA9AgentRuntime({ modules })` 只替换 Shell 适配器，使其返回 `residueRisk: true`。
结果：第一次点击后，库里的真实 `tool_end` 行含 `"residueRisk":true`（日志 `REAL_ROWS`）。任务与回合变为 `interrupted`。第二张继续卡的 `unknownResults` 为 `[{"toolName":"shell","callId":"new-1","status":"result_unknown","paths":[]}]`，`canContinue` 为 true。
第二次点击后，两个被拦的 `write` 没有落盘（`blocked-1.txt`、`blocked-2.txt` 不存在），门禁提示出现在后续请求里；`read` 不解除；`list` 之后 `fresh.txt` 写入成功。假适配器只被调用 1 次。
该探针在 `r01-revert-unconditional-delete` 反例下 2 项全部变红，说明它对修复敏感。
已知限制确认：仓库的 Shell 端到端用例手写 `tool_end` 行（`src/shell/tests/product/a9-task-continue.test.ts:186`），不经 Core 写入路径。独立审核的探针弥补了这一点，见 R-12。
未覆盖：真实进程树回收失败。探针的假适配器直接返回 `residueRisk: true`，没有执行 Runner 的清理判断。该项 NOT_PERFORMED。

### 4.4 核对点 d：保留未知后的行为 — PASS，无死锁路径

| 检查 | 结果 |
|---|---|
| `recoveryRevision` | 哈希输入是 `rows`、`task`、`turn`、`checkpoint`。保留逻辑不改输入，也不改哈希公式。带残留的继续回合产生新事件和新回合，所以第二张卡的版本号与第一张不同（探针确认） |
| `unknownResults` | 残留 Shell 计入 1 项，`paths` 为空，Runtime 置 `opaqueUnknown` |
| 观察门 | `write`、`shell` 等 8 个工具在 `list` 之前被拦（反例 `c5`、`h1` 变红，`c4-gate-drops-shell` 变红 4 项） |
| 继续卡 | `canContinue` 只受后台托管进程条件影响（`a9-agent-runtime.js:1880-1899`），未知项不禁用按钮。第二次点击被接受 |
| 放行 | `list` 任一已核验目录即解除。工作区根目录可列，所以不会永久卡住（R-02 的残余限制不变） |
| 终态 | 放行后继续完成，任务变为 `completed`，卡片消失（探针 2 通过） |
| 失败方向 | 阻断。没有发现放行副作用的路径 |

仍然存在的边界：
- 普通回合（非继续）遇残留时任务记为失败，不出现继续卡，也没有观察门。这是 `d8fd760a…` 起的行为，本增量没有改。
- 未知项在同一任务内永久保留，见 R-13。

### 4.5 核对点 e：未改动 a9-agent-loop.ts 与 ADR-0236 — PASS

- `a9-agent-loop.ts` 的 SHA-256 是 `34184a20…`。`59a3f650…` 与 `adb9d0f0…` 两个提交里该文件的 Git blob 同为 `8b203fc1…`。`git diff` 在 `src/core/src` 下输出为空。
- ADR-0236 的段落在两个提交里逐字相同，只差新增 ADR-0237 造成的一个末尾空行。ADR-0189 段落逐字相同。`DECISIONS.md` 在 ADR-0237 之前的部分与旧版相同。
- Core 测试文件只加了一个 `search` 桩和 3 个新用例，没有改动或删除既有用例。增量统计为 56 行新增、3 行删除，删除全部是被改写的行。

### 4.6 交接包追加的两个复核点

- R-01 回归用例是否充分：State 4 项加 Shell 1 项能杀死 R-01 回退（State 2 项、Shell 1 项变红，与 r6 记录一致）和主要变体（`s3`、`s4b`、`s5`、`s6`、`s7`）。不能杀死的变体见 R-08、R-09、R-10。
- R-03 的 3 个 Core 用例：`dangling-symlink-guard-removed`、`absent-stat-check-inverted`、`opaque-released-by-search` 各使 1 个对应用例变红，均为匹配器断言。结论 PASS。

## 5. 发现项

没有阻断、高、中级发现。路径均相对仓库根目录。编号从 R-08 起。

| 编号 | 级别 | 文件和行号 | 复现证据 | 建议处置 |
|---|---|---|---|---|
| R-08 | 低 | `src/state/src/a9-persistence.ts:950`；`src/core/src/a9-agent-loop.ts:1159` | 8 个工具里 `write`、`copy`、`start_process`、`stop_process` 没有仓库用例钉住。把任一个从 State 集合移除，State 88 项加 Shell 134 项全部通过（`s8-set-member-removed-*`）。把 `start_process` 或 `stop_process` 从 Core 观察门移除，Core 221 项加 Shell 134 项全部通过（`c4-gate-drops-*`）。独立审核探针 SP3 对 State 的 4 个成员各使 1 项变红 | 补表驱动用例：8 个工具各一个「未结束」「带残留结束」「正常结束」；Core 门对 8 个工具逐一拦截。属 R-03 同类补用例，由负责人决定本轮是否补 |
| R-09 | 低 | `src/state/src/a9-persistence.ts:954、956` | 配对键是 `${turn_id}:${callId}`。去掉 `turn_id` 后（`s4a`）State 与 Shell 全部通过。探针 SP1 构造「旧回合残留 Shell 与新回合同 callId 的只读调用」，去掉 `turn_id` 时变红。若提供方在不同回合复用同一调用号，旧残留会被新回合的正常结束清掉。提供方是否复用调用号：UNKNOWN（见第 8 节） | 补一个跨回合同 callId 的 State 用例 |
| R-10 | 信息 | `src/state/src/a9-persistence.ts:958` 与 `:966` | 保留条件里的 `sideEffects.has` 与最终过滤是两道冗余防线。只去掉 `:958` 的判断（`s1`）与结果等价，任何用例都杀不死。只去掉 `:966` 的过滤（`s9`）则全部通过，因为没有「未结束的只读 `tool_start` 不计未知」用例。两道同时去掉（`s10`）使 State 用例第 4 项变红 | 交接包要求的「去掉 `sideEffects.has` 判断」变体是等价变体，不算用例缺口。可保留作纵深防御，或删去 `:958` 中的冗余判断。补「未结束的 `read` 不计未知」用例可杀死 `s9` |
| R-11 | 信息 | `src/state/src/a9-persistence.ts:958、960` | 保留用 `=== true`，`confirmedSteps` 用真值判断。`residueRisk` 为 `"true"`、`1`、`"yes"` 时，步骤文字写 `result_unknown`，`unknownResults` 为空（探针 SP2）。真实写入方只写布尔 `true`（`a9-agent-loop.ts:1466、1479、1544`），当前不可达。放宽为真值判断的 `s2` 对真实写入方等价 | 接受，或统一为同一判断 |
| R-12 | 信息 | `src/shell/tests/product/a9-task-continue.test.ts:186` | Shell 端到端用例手写 `tool_end` 行，不经 Core 写入路径（已知限制）。独立审核探针经 `createA9AgentRuntime({ modules })` 注入假 Shell 适配器，走通真实写入、落库、读取、门禁、放行（4.3 节）。探针 2 项通过 | 建议把探针改为仓库用例。该文件在任务书 §4 白名单内 |
| R-13 | 信息 | `src/state/src/a9-persistence.ts:966`；`src/shell/product/a9-agent-runtime.js:1945` | 保留的未知项在同一任务内不会清除，每次带残留的继续尝试多加 1 项。继续提示上限是 8000 字符。探针 SP4：callId 为 29 个字符时，70 项为 7424 字符，80 项为 8414 字符，每项约 99 字符。约 76 项后该任务的继续被 `A9_RECOVERY_SUMMARY_LIMIT` 永久阻断。方向是阻断，用户仍可开新任务 | 登记为已知限制，与前任审核的 R-07 同类，不修复 |
| R-14 | 信息 | `docs/DECISIONS.md` 的 ADR-0237 决定一 | 决定一写「`shell`、`write`、`edit`、`delete` 等」。「等」隐藏了 `copy`、`move`、`start_process`、`stop_process`（OUTPUT_STYLE W08）。实现是明确的 8 个工具 | ADR-0237 已是 Accepted，不改正文。在任务书 §7.6 或后续 ADR 补全清单 |

## 6. 独立反例

独立审核自己定义了 41 个反例，在 `adb9d0f0…` 的归档副本里逐个注入。31 个变红，10 个存活。
每个反例的流程是：核对原文件 SHA；按精确出现次数替换；重建被改模块；运行相关合同测试（State 改动跑 State 加 Shell，Core 改动跑 Core 加 Shell，Shell 改动跑 Shell）；恢复原字节；重建；核对 SHA。
全部 41 个的恢复 SHA 与注入前相同。注入定义在 `mutation-defs/<id>.json`，日志在 `logs/mut/`。

### 6.1 必选项

| id | 注入内容 | 变红的用例 | 恢复 SHA 一致 |
|---|---|---|---|
| `r01-revert-unconditional-delete` | 回到 `59a3f650…` 行为：所有 `tool_end` 无条件清除 | State 2 项加 Shell 1 项（与 r6 记录一致） | 是，`c57ea195…` |
| `s1-drop-sideeffects-has-in-retention` | 去掉保留条件里的 `sideEffects.has` | 存活，等价变体（R-10） | 是 |
| `s2-residue-truthy` | `=== true` 放宽为真值 | 存活，对真实写入方等价（R-11） | 是 |
| `s6-nested-shell-residue-only` | 收窄：只认 `shell.residueRisk` | State 2 项加 Shell 1 项 | 是 |
| `s7-only-shell-retained` | 收窄：只有 `shell` 保留 | State 1 项（`edit` 用例） | 是 |
| `s3-read-residue-counts-unknown` | 让 `read` 带 `residueRisk` 也计未知 | State 1 项（用例第 4 项） | 是 |
| `s4a-key-without-turn-id` | 键去掉 `turn_id` | 存活（R-09）；探针 SP1 变红 | 是 |
| `s4b-lookup-key-differs` | 保留查找与登记使用不同的键 | State 2 项加 Shell 1 项 | 是 |
| `s5-retain-all-completed-side-effects` | 所有已完成的副作用工具都保留 | State 5 项 | 是 |
| `dangling-symlink-guard-removed` | 去掉悬空软链接保护（前任存活反例） | Core 1 项：悬空软链接用例 | 是，`34184a20…` |
| `absent-stat-check-inverted` | 去掉「目标实际存在则拒绝」（前任存活反例） | Core 1 项：ENOENT 读但文件存在 | 是，`34184a20…` |
| `opaque-released-by-search` | `search` 也解除 opaque 门（前任存活反例） | Core 1 项：search 不解除用例 | 是，`34184a20…` |

### 6.2 仍存活的反例及含义

| id | 含义 |
|---|---|
| `s1-drop-sideeffects-has-in-retention` | 等价变体，无缺口（R-10） |
| `s2-residue-truthy` | 对真实写入方等价，无当前缺口（R-11） |
| `s9-final-filter-removed` | 缺「未结束的只读 `tool_start` 不计未知」用例（R-10）。方向偏保守 |
| `s4a-key-without-turn-id` | 缺跨回合同 callId 用例（R-09） |
| `s8-set-member-removed-write`、`-copy`、`-start_process`、`-stop_process` | State 集合 4 个成员无用例（R-08）。其中 `write` 是最常见的副作用工具 |
| `c4-gate-drops-start_process`、`-stop_process` | Core 观察门 2 个成员无用例（R-08），属 `d8fd760a…` 起的既有缺口 |

### 6.3 变红的类型

- 逐文件检查 49 个运行结果：没有编译错误，没有测试套件加载失败，没有超时。
- `pred-site-A-realpath-catch`、`-site-B-lstat-catch`、`-site-C-stat-catch` 3 个前任反例只由运行时异常变红：被还原的 ENOTDIR 错误从 `verifyRecoveryPath` 抛出，用例以异常失败，不是匹配器断言。栈指向被注入的行。
- `pred-f1-enoent-observation`、`pred-f2-path-normalization`、`pred-f7-enotdir-absent` 另有部分用例以同类异常变红，但这 3 个反例各有匹配器断言变红。
- 其余 28 个变红的反例至少有 1 个匹配器断言变红。必选项（6.1 节）的变红全部是匹配器断言。

### 6.4 前任其余反例的重放

前任的 16 个反例里，3 个存活反例见 6.1。其余 13 个已在 `adb9d0f0…` 上按前任定义逐字重放，全部变红：`unknown-side-effect-gate` 28 项、`opaque-ignored-by-gate` 5 项、`fresh-approval` 1 项、`f1-enoent-observation` 3 项、`f2-path-normalization` 7 项、`f6-opaque-read-release` 3 项、`f7-enotdir-absent` 2 项、`site-A` 3 项、`site-B` 3 项、`site-C` 2 项、`site-D` 1 项、`boundary-check-removed` 2 项、`list-verify-removed` 1 项（Core 组计数）。
交接包 4.1 节里 4 个 NOT_PERFORMED 的 Core 反例（`unknown-side-effect-gate`、`fresh-approval`、`f1-enoent-observation`、`f2-path-normalization`）的等价定义现在已在 `adb9d0f0…` 上重放，全部变红。原注入定义没有保存，仍无法逐字重放执行代理当时的版本。

### 6.5 附录：全部 41 个反例

「变红用例」列：数字是该测试组变红的用例数。`探针` 是独立审核自写探针测试的结果，不属于仓库用例。

| id | 作用文件 | 状态 | 变红用例 | 恢复 SHA 一致 |
|---|---|---|---|---|
| `r01-revert-unconditional-delete` | `a9-persistence.ts` | 变红 | state 2 + shell 1 | 是 |
| `s1-drop-sideeffects-has-in-retention` | `a9-persistence.ts` | 存活 | 0 ; 探针: 0 | 是 |
| `s2-residue-truthy` | `a9-persistence.ts` | 存活 | 0 ; 探针: state 3 | 是 |
| `s3-read-residue-counts-unknown` | `a9-persistence.ts` | 变红 | state 1 | 是 |
| `s4a-key-without-turn-id` | `a9-persistence.ts` | 存活 | 0 ; 探针: state 1 | 是 |
| `s4b-lookup-key-differs` | `a9-persistence.ts` | 变红 | state 2 + shell 1 | 是 |
| `s5-retain-all-completed-side-effects` | `a9-persistence.ts` | 变红 | state 5 | 是 |
| `s6-nested-shell-residue-only` | `a9-persistence.ts` | 变红 | state 2 + shell 1 | 是 |
| `s7-only-shell-retained` | `a9-persistence.ts` | 变红 | state 1 | 是 |
| `s9-final-filter-removed` | `a9-persistence.ts` | 存活 | 0 ; 探针: 0 | 是 |
| `s10-both-read-guards-removed` | `a9-persistence.ts` | 变红 | state 1 | 是 |
| `s8-set-member-removed-write` | `a9-persistence.ts` | 存活 | 0 ; 探针: state 1 | 是 |
| `s8-set-member-removed-edit` | `a9-persistence.ts` | 变红 | state 2 + shell 1 | 是 |
| `s8-set-member-removed-copy` | `a9-persistence.ts` | 存活 | 0 ; 探针: state 1 | 是 |
| `s8-set-member-removed-move` | `a9-persistence.ts` | 变红 | shell 2 | 是 |
| `s8-set-member-removed-delete` | `a9-persistence.ts` | 变红 | shell 1 | 是 |
| `s8-set-member-removed-shell` | `a9-persistence.ts` | 变红 | state 1 + shell 1 | 是 |
| `s8-set-member-removed-start_process` | `a9-persistence.ts` | 存活 | 0 ; 探针: state 1 | 是 |
| `s8-set-member-removed-stop_process` | `a9-persistence.ts` | 存活 | 0 ; 探针: state 1 | 是 |
| `dangling-symlink-guard-removed` | `a9-agent-loop.ts` | 变红 | core 1 | 是 |
| `absent-stat-check-inverted` | `a9-agent-loop.ts` | 变红 | core 1 | 是 |
| `opaque-released-by-search` | `a9-agent-loop.ts` | 变红 | core 1 | 是 |
| `c4-gate-drops-shell` | `a9-agent-loop.ts` | 变红 | core 4 | 是 |
| `c4-gate-drops-start_process` | `a9-agent-loop.ts` | 存活 | 0 | 是 |
| `c4-gate-drops-stop_process` | `a9-agent-loop.ts` | 存活 | 0 | 是 |
| `c5-opaque-released-by-read` | `a9-agent-loop.ts` | 变红 | core 3 + shell 1 | 是 |
| `h1-shell-opaque-flag-false` | `a9-agent-runtime.js` | 变红 | shell 1 | 是 |
| `h2-shell-unknown-paths-dropped` | `a9-agent-runtime.js` | 变红 | shell 4 | 是 |
| `pred-boundary-check-removed` | `a9-agent-loop.ts` | 变红 | core 2 | 是 |
| `pred-f1-enoent-observation` | `a9-agent-loop.ts` | 变红 | core 3 + shell 4 | 是 |
| `pred-f2-path-normalization` | `a9-agent-loop.ts` | 变红 | core 7 + shell 2 | 是 |
| `pred-f6-opaque-read-release` | `a9-agent-loop.ts` | 变红 | core 3 + shell 1 | 是 |
| `pred-f7-enotdir-absent` | `a9-agent-loop.ts` | 变红 | core 2 | 是 |
| `pred-fresh-approval` | `a9-agent-loop.ts` | 变红 | core 1 | 是 |
| `pred-list-verify-removed` | `a9-agent-loop.ts` | 变红 | core 1 | 是 |
| `pred-opaque-ignored-by-gate` | `a9-agent-loop.ts` | 变红 | core 5 + shell 1 | 是 |
| `pred-site-A-realpath-catch` | `a9-agent-loop.ts` | 变红 | core 3 | 是 |
| `pred-site-B-lstat-catch` | `a9-agent-loop.ts` | 变红 | core 3 | 是 |
| `pred-site-C-stat-catch` | `a9-agent-loop.ts` | 变红 | core 2 | 是 |
| `pred-site-D-read-catch` | `a9-agent-loop.ts` | 变红 | core 1 | 是 |
| `pred-unknown-side-effect-gate` | `a9-agent-loop.ts` | 变红 | core 28 + shell 5 | 是 |

## 7. 增量源码差异通读

命令：`git diff 59a3f650…..adb9d0f0… -- src`，4 个文件，56 行新增，3 行删除。

| 位置 | 差异 | 评估 |
|---|---|---|
| `src/state/src/a9-persistence.ts:950` | `sideEffects` 声明上移到循环前 | 必要，保留判断要用。语义不变 |
| `:956-958` | 引入 `key` 变量；`residueRisk === true` 且工具属于集合时不删除 `tool_start` | 与 ADR-0237 一致。冗余防线见 R-10 |
| `:966` | 过滤仍用同一集合 | 不变 |
| `src/core/tests/…` | 加 `search` 桩；加 3 个用例 | 既有用例未改动 |
| `src/shell/tests/product/…` | 加 1 个端到端用例 | 手写 `tool_end` 行（R-12） |
| `src/state/tests/…` | 加 1 个 `it.each`，4 种组合 | 覆盖 shell、edit 保留，无残留清除，read 不计 |

没有发现修复引入的新回归。回归检查项：
- 无残留的 `tool_end` 仍然清除（State 用例第 3 项，`s5` 变红 5 项）。
- 只读工具不被保留（用例第 4 项）。
- `confirmedSteps`、`changedPaths`、`recoveryRevision` 输入未变。
- `59a3f650…` 时的 State 84、Core 218、Shell 133 项既有用例，随 4、3、1 项新增用例在 `adb9d0f0…` 上一起通过。

措辞与实现的核对：
- 代码注释「A side effect that ended with unconfirmed process-tree cleanup may still change files: keep it unknown.」与实现一致。
- ADR-0237 证据段落的数字（State 88、Core 221、Shell 134；State 2 项加 Shell 1 项变红；3 个存活反例各 1 项）与独立审核复算一致。
- ADR-0237 决定一的「等」见 R-14。
- 交接包第 1 节「与 r3 不同的 10 个文件中，1 个是修复代码，3 个是测试，6 个是文档」：独立审核对比 r3 与 r4 清单，差异恰为 10 个路径，构成一致。

## 8. NOT_PERFORMED

| 项 | 原因 |
|---|---|
| 真实 Electron、打包、GUI 焦点与滚动 | 范围排除，不启动 Electron |
| Win10、Win7 实机，含 ENOTDIR 在 Win7 NTFS 上的错误码 | 范围排除，不访问 |
| `npm run docs:check`、`git diff --check` | 依赖 Git 历史；审核目录没有 `.git`，也不在受保护目录运行。交接包记录的「323 个文件，ok」未复现 |
| 全量 `npm test` 与其余套件 | 只运行交接包第 2 节的三组合同测试和 `verify:quick` |
| 真实进程树回收失败导致的残留 | 需要真实 Runner 与进程树；探针用假适配器返回 `residueRisk: true` |
| 执行代理 r4 的 4 个 Core 反例（`unknown-side-effect-gate`、`fresh-approval`、`f1-enoent-observation`、`f2-path-normalization`）按原注入定义逐字重放 | 原定义没有保存；已改用前任审核的定义重放（6.4 节） |
| 提供方是否在不同回合复用调用号 | 未检查网关与提供方的调用号生成。R-09 只说明该键没有用例 |

## 9. 环境与证据索引

- 审核目录：`/private/tmp/claude-501/-Users-qlyf-Developer-win7-coding-Agent/d6667859-30b8-4021-9445-17a8a28efd77/scratchpad/a9-32-review.fF10Op/`
- 解包的源码树：`tree/`；命令日志：`logs/`；反例定义：`mutation-defs/`；反例日志与结果：`logs/mut/`；注入脚本：`scripts/run_mut.py`、`run_mut_probe.py`、`run_mut_probe2.py`、`run_mut_pred.py`；探针：`probes/state-zz-review-probe.test.ts`（SP1～SP4）、`probes/shell-zz-review-probe-real-residue.test.ts`（端到端）；探针日志 `logs/probe-state.log`、`logs/probe-real-residue.log`；反例汇总：`mutation-summary.json`。
- 前后状态：`logs/s0-pre-state.txt`、`logs/s8-post-state.txt`、`logs/src-snapshot-*.txt`、`logs/dist-snapshot-*.txt`。
- 依赖搭建沿用交接包第 2 节的逐项软链接写法，没有链接 `@win7-agent`。`verify:quick` 在审核目录内重建了 `dist`；`state` 与 `core` 的 `dist` 在全部反例结束后与注入前逐文件相同。
- 探针测试文件在运行期间临时放入 `tree/`，结束后移出并保存在 `probes/`。最终的 `tree/` 与新取归档逐字节一致。
- `docs/OUTPUT_STYLE.md` 与 `docs/GLOSSARY.md` 不在 `adb9d0f0…` 的归档里，只在主工作区作为未跟踪文件存在。独立审核从主工作区只读读取，没有写入。
- 没有联网、下载、启动 Electron、访问 Win10 或 Win7、提交、推送、安装依赖。

## 10. 声明

独立审核不签发 `DEVELOPER_VERIFIED`。本结论不是门 A 或门 B。
真实 Electron、打包、Win10、Win7 均 NOT_PERFORMED。
是否把本结论登记进仓库，由负责人决定。独立审核没有登记。

## 11. 负责人裁决（2026-10-12）

负责人在聊天中的原话：「R-08 和 R-09 登记为已知限制，不补」。

| 项 | 裁决 | 对结论的影响 |
|---|---|---|
| R-08 | 登记为已知限制，不补用例 | 结论不变，仍是有发现项 PASS（开发机，绑定 `adb9d0f0…`） |
| R-09 | 登记为已知限制，不补用例 | 同上 |
| R-10～R-14 | 整体留置，不登记 | 级别均为信息，不阻断。保持原文，不进入已知限制，不要求处置。结论不变 |

负责人对 R-10～R-14 的原话：「R-10～R-14 整体留置，不登记」。

独立审核没有把这两项写进仓库。登记由执行代理在负责人指定的文件里完成。下面是可直接使用的登记文字，措辞按 GLOSSARY 的「已知限制」写法。

| 编号 | 已知限制（随本结论签发） | 当前代码是否正确 | 未覆盖的范围 | 证据 |
|---|---|---|---|---|
| R-08 | State 的 `sideEffects` 集合（`a9-persistence.ts:950`）中 `write`、`copy`、`start_process`、`stop_process` 4 个成员，以及 Core 观察门（`a9-agent-loop.ts:1159`）中 `start_process`、`stop_process` 2 个成员，没有仓库用例钉住 | 是。独立审核探针 SP3 对 8 个工具逐个通过 | 以后若有人从这两处清单移除上述成员，仓库用例不会变红 | 开发机，`adb9d0f0…`；反例 `s8-set-member-removed-*`、`c4-gate-drops-*` 存活 |
| R-09 | `getTaskRecovery` 的配对键 `${turn_id}:${callId}`（`a9-persistence.ts:954、956`）没有仓库用例。提供方是否在不同回合复用调用号：UNKNOWN | 是。独立审核探针 SP1 通过 | 以后若有人去掉键里的 `turn_id`，仓库用例不会变红 | 开发机，`adb9d0f0…`；反例 `s4a-key-without-turn-id` 存活 |

两项都不改变 `adb9d0f0…` 的运行行为，不进入 Win7 验收的通过判据，只记录回归防护的缺口。真实 Electron、Win10、Win7 仍为 NOT_PERFORMED。

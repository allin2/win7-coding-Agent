# A9-32 独立审核结论（2026-10-12，绑定提交 59a3f650…）

## 1. 结论

独立审核在开发机层对提交 `59a3f6507ecac3c0c89fdcd6fc9b8ef79ceba73c` 给出 PASS。未发现阻断级问题。
有 1 项中级发现 R-01 需要负责人裁决。它不阻断本结论，但建议在 Win7 验收前裁决。
证据层级是开发机（macOS，Node 20.17.0）。真实 Electron、Win10、Win7 均为 NOT_PERFORMED。
审核者没有签发 `DEVELOPER_VERIFIED`。是否登记进交接包第 6 节由负责人决定。

| 审核者 | 日期 | 绑定提交 | 结论 | 发现项 |
|---|---|---|---|---|
| Claude Sonnet 5.5，负责人另开的独立审核会话 | 2026-10-12 | `59a3f650…` | PASS（开发机，绑定 `59a3f650…`）；无阻断级发现；R-01 待负责人裁决 | R-01 中；R-02～R-04 低；R-05～R-07 信息 |

## 2. 复算结果

执行者是审核者本人。所有命令在审核目录内运行，设置了 `NPM_CONFIG_OFFLINE=true`。

| 步骤 | 交接预期 | 本次结果 | 日志 |
|---|---|---|---|
| Node 版本 | v20.17.0 | v20.17.0 | 命令输出 |
| 清单 r3 SHA-256 | `51ac0ca0…` | 一致 | `logs/s3-manifest-sha.txt` |
| 清单逐文件字节与 SHA | 26 个文件 | 26 个 PASS | `logs/s3-manifest-check.txt` |
| `npm run verify:quick` | 七模块构建，退出 0 | 退出 0 | `logs/verify-quick.log` |
| State 合同测试 | 84 项，退出 0 | 84 项通过，3 个套件 | `logs/state-contract.log` |
| Core 合同测试 | 218 项，退出 0 | 218 项通过，7 个套件 | `logs/core-contract.log` |
| Shell 合同测试 | 133 项，退出 0 | 133 项通过，10 个套件 | `logs/shell-contract.log` |
| r4 八个反例的恢复 SHA | 8 行，对照 `d8fd760a…` | PASS | `logs/s4-1-r4-check.txt` |
| r5 两个反例的恢复 SHA | 2 行，对照 `59a3f650…` | PASS，分别 3 项与 2 项变红 | `logs/s4-2-r5-check.txt` |
| 源码完整性 | 无要求 | 与新取归档比对，`dist` 以外 0 处差异 | `logs/source-integrity.txt` |

`a9-agent-loop.ts` 的 SHA-256 是 `34184a20…`，与交接包一致。

## 3. 对交接包新增复核点的回答

| 复核点 | 回答 | 证据 |
|---|---|---|
| ADR-0236 决定一：opaque 门只由已核验目录的 `list` 解除 | 实现与决定一致。只有 `list` 且核验通过且 `tool_end` 审计成功后才解除。 | `src/core/src/a9-agent-loop.ts:1549-1561`；反例 `f6-opaque-read-release` 变红 3 项；`tool_end` 审计失败用例通过 |
| ADR-0236 决定二：ENOTDIR 与 ENOENT 同按不存在处理 | 实现与决定一致。4 处使用点单独回退，各自被用例捕获。 | `a9-agent-loop.ts:42-44, 1433, 1590, 1593, 1604`；反例 `site-A`～`site-D` 全部变红 |
| 软链接指向工作区外文件时 ENOTDIR 是否仍阻断 | 仍阻断。去掉越界检查后该用例变红。指向工作区内文件的软链接按不存在处理。 | `a9-agent-loop.ts:1599-1600`；用例 `a9-task-continue.test.ts:164`；反例 `boundary-check-removed`；探针 P3 |
| 残余限制是否可接受 | 本轮可接受，条件是不把它写成「未知 Shell 的影响已核查」。影响见 R-02。 | 探针 P5 |

## 4. 独立反例

审核者自己定义了 16 个反例，在 `59a3f650…` 的源码上逐个注入。每次跑 Core 的 `a9-task-continue` 与 `a9-agent-loop` 两个测试文件，共 73 项。每次结束后还原，SHA 均为 `34184a20…`。定义见 `scripts/mutate.py`，结果见 `logs/mutation-results-own.jsonl`。

| 反例 | 注入内容 | 变红项数 |
|---|---|---|
| unknown-side-effect-gate | 删除观察门 | 25 |
| opaque-ignored-by-gate | 门只看路径，不看 opaque | 4 |
| fresh-approval | 继续回合跳过审批 | 1 |
| f1-enoent-observation | ENOENT 不再记为不存在观察 | 3 |
| f2-path-normalization | 路径键不做规范化 | 7 |
| f6-opaque-read-release | `read` 重新解除 opaque 门 | 3 |
| f7-enotdir-absent | ENOTDIR 不再按不存在处理 | 2 |
| site-A-realpath-catch | 仅回退 realpath 处的 ENOTDIR | 3 |
| site-B-lstat-catch | 仅回退 lstat 处的 ENOTDIR | 3 |
| site-C-stat-catch | 仅回退 stat 处的 ENOTDIR | 2 |
| site-D-read-catch | 仅回退读取错误处的 ENOTDIR | 1 |
| boundary-check-removed | 删除越界检查 | 2 |
| list-verify-removed | `list` 不再核验精确目录 | 1 |
| dangling-symlink-guard-removed | 删除悬空软链接保护 | 0，存活 |
| absent-stat-check-inverted | 删除「目标实际存在则拒绝」复核 | 0，存活 |
| opaque-released-by-search | `search` 也解除 opaque 门 | 0，存活 |

交接包中 r4 的 4 个 NOT_PERFORMED 反例，已用审核者自己的同类定义在 `59a3f650…` 上重跑，全部变红。原 r4 注入定义没有保存，未逐字重放。

3 个存活反例是用例缺口。探针 P1、P2 在真实文件系统上确认现有代码对这两种情形行为正确，见 R-03。

## 5. 发现项

没有阻断级发现。路径均相对仓库根目录。

| 编号 | 级别 | 一句话 |
|---|---|---|
| R-01 | 中，待裁决 | 继续回合遇到前台 Shell 残留后，任务被改记为 `interrupted`，再次继续时不设观察门 |
| R-02 | 低，已知限制 | 任何已核验目录的 `list` 都能解除 opaque 门，包括工作区根和无关空目录 |
| R-03 | 低 | 3 个存活反例对应的行为没有用例 |
| R-04 | 低 | 一个中断任务的恢复事实不可用，会让整个继续卡列表退化为全部阻断 |
| R-05 | 信息 | 核验阶段遇到 EACCES 时，回合以原始异常终止，`tool_start` 没有 `tool_end` |
| R-06 | 信息 | `requestTaskContinuation` 的 `requestPrompt` 参数未被使用，输入对象多余字段会被整体持久化 |
| R-07 | 信息 | 早先回合的未知结果在后续恢复中一直保留 |

### R-01 前台 Shell 残留之后的继续（中，待负责人裁决）

- 现象：继续回合以 `residueStop` 结束时，结果是 `failed`。`persistTurnResult` 把它改记为 `interrupted`，继续卡再次出现。再次继续时 `unknownPaths` 为空、`opaqueUnknown` 为 false，观察门不启动。
- 路径与行号：
  - `src/core/src/a9-agent-loop.ts:717-730`：`residueStop` 的消息写明「继续前需要人工检查」。
  - `src/shell/product/a9-agent-runtime.js:1779-1780`：继续回合的任何非成功结果都改记为 `interrupted`。
  - `src/state/src/a9-persistence.ts:957`：`residueRisk` 只在文字标签里写 `result_unknown`。
  - `src/state/src/a9-persistence.ts:963-966`：`unknownResults` 只取没有 `tool_end` 的 `tool_start`。
  - `src/shell/product/a9-agent-runtime.js:1880-1899`：阻断条件只看后台托管进程；`cleanupRequired` 只由 `src/runner/src/background-process-manager.ts` 维护，前台 Shell 的 `residueRisk` 不写入该记录。
  - `src/shell/product/a9-agent-runtime.js:1970-1971`：门的输入取自 `unknownResults`。
- 证据：探针 S1（`probes/state-zz-review-extra.test.ts`）。一个带 `residueRisk` 的 `shell` 事件得到 `unknownResults=[]`、`confirmedSteps=["shell: result_unknown"]`。真实残留的复现是 NOT_PERFORMED，需要真实进程树回收失败。
- 对照：任务书 §5 列出「残留阻断」。现有用例只覆盖后台托管进程（`src/shell/tests/product/a9-task-continue.test.ts:74`）。
- 影响：点击继续后，新回合可以立即提出新写入或 Shell。新 Policy 与审批仍然生效。残留的进程树可能仍在改文件。
- 归属：本缺口来自 `d8fd760a…`，修复提交 `59a3f650…` 没有改动这些文件。普通回合遇到残留时没有观察门，任务记为失败，不出现继续卡。
- 分级理由：任务书 §2 只要求「`tool_start` 无 `tool_end`」记 `result_unknown`，实现符合；新审批仍有效；普通回合同样没有门。负责人可以不同意，并将其升级为阻断。

待裁决：

| 选项 | 内容 | 影响 |
|---|---|---|
| A | 本轮接受，登记为已知限制 | 不改代码；Win7 验收时继续卡在残留后仍可点击 |
| B | 在 `getTaskRecovery` 中把带 `residueRisk` 的 `tool_end` 计入未知结果，按 opaque 处理 | 改 `a9-persistence.ts`，在任务书 §4 白名单内；需要补用例并重跑反例 |
| C | 继续回合遇残留时保持 `failed`，不改记 `interrupted` | 改 `a9-agent-runtime.js`；卡片不再出现，但普通回合的缺口仍在 |

推荐选项 B，因为它在事实层补齐，与任务书的 `result_unknown` 语义一致。选项 C 只隐藏卡片。
是否按选项 B 另开修复？

### R-02 opaque 门的残余限制（低，已声明的已知限制）

- 复现：探针 P5（`probes/core-zz-review-extra.test.ts`）。
- 会解除：工作区根 `.`、无关的空目录。`list` 默认不递归，根目录列表看不到深层改动。
- 不会解除：普通文件路径、不存在的目录、`..`、指向工作区外的软链接目录。
- 影响：未知 Shell 之后，观察门变成「列过一个目录」的动作，不证明影响范围已核查。新 Policy 与审批仍然生效。
- 处置：ADR-0236 已写明「收窄 F6，没有消除」。建议保持措辞，不在验收材料里写成「已核查」。彻底解决需要与基线比较，另立任务。

### R-03 用例缺口（低）

- `src/core/src/a9-agent-loop.ts:1592`：悬空软链接保护没有用例。探针 P1 确认现有行为是阻断。
- `src/core/src/a9-agent-loop.ts:1603`：读取报 ENOENT 但文件实际存在时，真实文件系统复核没有用例。探针 P2 确认现有行为是阻断。
- `src/core/src/a9-agent-loop.ts:1560`：没有用例断言 `search` 不能解除 opaque 门。
- 建议：补 3 个用例。审核者不修改代码。

### R-04 恢复事实不可用拖垮整个列表（低）

- 路径：`src/state/src/a9-persistence.ts:983-986` 的 `listTaskRecoveries` 逐任务调用 `getTaskRecovery`，一个任务抛错则整体抛错。`src/shell/product/a9-agent-runtime.js:1901-1912` 把所有中断任务降级为阻断卡，显示同一个英文错误码。
- 证据：探针 S2。一个任务缺少原目标时抛 `A9_RECOVERY_GOAL_UNAVAILABLE`，同一对话中另一个正常任务单独查询成功。
- 影响：失败方向是阻断，没有放行副作用。只影响可用性。与 §7.1 的「错误码可读性」是同一类问题。

### R-05 核验阶段的 EACCES（信息）

- 路径：`src/core/src/a9-agent-loop.ts:1433-1435` 在 `catch` 块内调用 `verifyRecoveryPath`，其中非不存在类错误会抛出。
- 证据：探针 P6。读取模拟为 ENOENT 而父目录不可读时，`runTurn` 以 `EACCES` 拒绝，审计事件为 `turn_started`、`model_thinking`、`tool_start`，没有 `tool_end`。
- 触发条件：读取与复核之间权限发生变化，属于竞态。只出现在继续回合。
- 运行时在 `continueTask` 的 `catch` 中把它记为 `interrupted` 并允许重试，这一点来自代码阅读，没有单独的用例。
- 归属：来自 `d8fd760a…`，不是修复提交引入。

### R-06 持久化接口卫生（信息）

- `src/state/src/a9-persistence.ts:1008` 的 `requestPrompt` 参数没有被使用，函数注释写「请求一并提交」，实际没有保存提示词。
- 探针 S5：传入整个恢复事实对象时，`task_continue_requested` 事件会持久化全部字段。生产路径由 `a9-agent-runtime.js:1918` 的键检查限定为 4 个字段，所以没有生产影响。

### R-07 早先回合的未知结果一直保留（信息）

- 探针 S4：第一次继续读取并确认了路径，第二次中断后，第一回合的未匹配 `tool_start` 仍然列为未知。
- 方向保守，每次继续都需要重新核查。不是缺陷，记录供设计参考。

## 6. 仍存在的已知限制

以下三项在 `59a3f650…` 上仍存在，审核者没有改动，见 A9-32 §7.1。

| 项 | 核对方式 |
|---|---|
| 错误码可读性：`src/shell/product/renderer/a9-workbench.js:1025-1026` 直接显示英文错误码 | 代码阅读，确认仍存在 |
| Core 路径核验职责：`a9-agent-loop.ts:1580-1607` 的 `verifyRecoveryPath` 直接使用 Node 文件系统接口 | 代码阅读，确认仍存在 |
| ADR-0189 措辞与编号 | 沿用交接包说明，审核者未核查措辞 |

编号核对：主工作区的 `docs/DECISIONS.md` 最大编号是 ADR-0235，不含 ADR-0236。所有本地分支和远端分支中只有 `codex/a9-32-explicit-continue` 含 ADR-0236。`codex/turn-diffs/checkpoints/*` 是快照引用，不是分支，最大到 ADR-0235。提交 `59a3f650…` 的 `DECISIONS.md` 没有重复编号。整合前仍须再次核号。

## 7. NOT_PERFORMED

| 项 | 原因 |
|---|---|
| 真实 Electron、打包、GUI 键盘焦点与滚动 | 范围排除；不启动 Electron |
| Win10、Win7 实机，含 ENOTDIR 在 Win7 NTFS 上的错误码 | 范围排除；不访问 |
| `npm run docs:check` | 依赖 Git 历史，审核目录没有 `.git`；交接包称原树 322 个文件 ok，审核者未复现 |
| 全量 `npm test` 与其余套件 | 只运行交接包第 2 节列出的三组合同测试 |
| r4 原注入定义的逐字重放 | 定义未保存；已用同类自定义反例代替 |
| 前台 Shell 残留的真实复现 | 需要真实进程树回收失败 |
| `verifyRecoveryPath` 的竞态场景自动化 | 只做了单次权限场景 |

## 8. 环境差异与操作边界

### 8.1 与交接命令的差异

- 交接命令把审核目录的 `node_modules` 整体链到主工作区。这有两个问题：
  - `jest`、`tsc` 在 `src/<模块>/node_modules`，不在根 `node_modules`。`scripts/verify_integration.mjs` 会在依赖检查处失败。该点来自代码阅读，没有原样执行。
  - 根 `node_modules/@win7-agent/*` 是相对软链接，整体链接后会解析到主工作区的 `src/*`。
- 审核者的做法：审核目录自己建真实的 `node_modules`，里面只放指向主工作区第三方包的逐项软链接；不链 `@win7-agent`，不链 `.cache`。各 `src/<模块>/node_modules` 同样处理。
- 跨包依赖走兄弟 `dist` 的相对路径，指向审核目录自己的构建结果。
- 结果与交接预期的数字一致，所以这是环境搭建差异，不改变判据。
- `dist` 重建后与归档有 28 处差异，全部在审核目录内。交接包记录的是 24 个已跟踪文件。差异数不同的原因未核查。

### 8.2 没有写入原环境

| 检查 | 结果 |
|---|---|
| 隔离树 HEAD | `a9c13605…`，前后一致 |
| 隔离树 `git status --porcelain` | 前后均为空 |
| 隔离树 `.acceptance` 579 个文件的修改时间与大小 | 前后一致 |
| 主工作区 `node_modules` 与各 `src/*/node_modules` | 起始时间之后无改动 |
| 联网 | 设置 `NPM_CONFIG_OFFLINE=true`，没有执行下载。测试只访问 `127.0.0.1`。机器上唯一的 443 连接属于 WorkBuddy 应用（PID 274，启动早于审核），不是审核命令。 |
| 提交与推送 | 没有执行 |
| Electron、Win10、Win7 | 没有启动，没有访问 |

审核者还在审核目录内临时放过两个探针测试文件。它们已移出源码树，保存在 `probes/`。

## 9. 证据索引

审核目录：`/private/tmp/claude-501/-Users-qlyf-Developer-win7-coding-Agent/41d7a020-14d6-4db5-841b-3e89b4210240/scratchpad/a9-32-review/`

| 内容 | 位置 |
|---|---|
| 解包的源码树与重建的 `dist` | `tree/` |
| 全部命令日志 | `logs/` |
| 自定义反例定义与运行器 | `scripts/mutate.py` |
| 反例结果 | `logs/mutation-results-own.jsonl`，每个反例另有 `logs/mut-<id>.json` 与 `.log` |
| Core 探针 P1～P6 | `probes/core-zz-review-extra.test.ts`，输出 `logs/probe-core-extra.log` |
| State 探针 S1～S5 | `probes/state-zz-review-extra.test.ts`，输出 `logs/probe-state-extra.log` |
| 环境变量 | `env.sh` |

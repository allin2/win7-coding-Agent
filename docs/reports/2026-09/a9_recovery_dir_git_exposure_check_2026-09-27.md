# 恢复目录误暂存只读核查报告（2026-09-27）

> 核查方：Claude（A9 Alpha 2 验收方）。依据：[A9 Alpha 2 推进顺序](../../plans/A9_ALPHA2_DELIVERY_SEQUENCE.md) 阶段 0。
> 性质：只读核查，未改产品代码；实验只在会话临时目录进行，结束后已删除。
> 环境：macOS 开发机、Node 20.17.0、Apple Git 2.39.5；产品代码为 `codex/a9-alpha2` @ `a1a669f` 的 `src/workspace/src` 临时编译产物。
> **本报告全部为开发机结果，未在 Win7 实机验证。** Git 的忽略与暂存语义不随平台变化，但下文标“待验证”的 Windows 行为仅由代码推断。

## 1. 结论

1. **误暂存确认。** 未加任何忽略规则的 Git 仓库中，产品在工作区根生成的 `.agent_recovery/` 会被 `git add -A`、`git add .`、`git add :/` 全部暂存（实验中 131 个暂存文件里 125 个来自恢复目录）。
2. **内容含改动前原文与未登记秘密。** 恢复目录保存每次被改文件的轮前原文；Shell 轮还会复制整个工作区（有上限）。秘密门只拦截“已知秘密”（Provider key、代理口令、自定义头与 `authorization` 形态），
   未登记的口令（如 `.env`、配置文件里的数据库口令、已被改掉的旧口令）会进入恢复目录。清单还记录绝对路径（含用户名与目录结构）。
3. **反方向同样有害。** `git clean -fd` 与 `git stash -u` 会删除或收走恢复目录，之后撤销失败（`未找到 Checkpoint`），产品不会提示原因。
4. **影响范围。** 该默认值自 A9-03（`ff96a19`，2026-08-22）起未变，WIN7-22、WIN7-37、WIN7-39 等全部 A9 候选都带有此问题。本仓库只因 `.gitignore` 第 34 行才未受影响。
5. **推荐**：近期修复采用 §5 的方案 3b（产品在恢复目录内写入内容为 `*` 的 `.gitignore`），长期另议方案二；D1 建议进入第一批（§6）。

## 2. 代码事实

| 事实 | 位置 |
|---|---|
| `A9WorkspaceService` 构造 `CheckpointManager` 时不传恢复根 | `src/workspace/src/a9-workspace-service.ts:183` |
| 恢复根默认为 `<工作区>/.agent_recovery`，下设 `blobs/`、`snapshots/`、`checkpoints/`、`undo-staging/` | `src/workspace/src/checkpoint-manager.ts:115-118`、`:296` |
| 产品两处实例化都用默认值（启动恢复与 Agent loop） | `src/shell/product/a9-agent-runtime.js:670`、`:1152` |
| 产品扫描时跳过该目录（忽略名单与四处 `startsWith`），但不写任何 Git 排除规则 | `src/workspace/src/a9-ignore.ts:17`；`a9-workspace-service.ts:1011`、`:1100`、`:1312`、`:1361` |
| 文件工具写入前保存该文件轮前原文（`snapshots/<turn>/<路径哈希>/original.bin`） | `checkpoint-manager.ts` `recordPreMutation`、`storeBoundFile` |
| 每轮首个 `shell` 调用前冻结全工作区基线：最多 2000 个文件、单文件 2 MiB、合计 40 MiB，逐轮独立复制，不去重 | `src/core/src/a9-agent-loop.ts:956`、`:1073-1078`；`a9-workspace-service.ts:120`、`:128-129`、`:981-1066` |
| 基线扫描遵循工作区 `.gitignore` 与 `.agentignore`（被忽略的文件不复制） | `a9-ignore.ts` `createWorkspaceIgnoreFilter` |
| 秘密门只识别已知秘密值及其编码变体和 `authorization` 头形态 | `a9-agent-runtime.js:405-445` |
| 恢复目录没有保留期或清理机制 | `checkpoint-manager.ts` 中的 `rmSync` 只用于撤销交换区 |
| 撤销时在 `undo-staging/` 暂存后用 `renameSync` 换入工作区 | `checkpoint-manager.ts:404-425`、`:468` |

## 3. 实验方法

临时目录中新建两个干净示例仓库并提交初始内容：`README.md`、`src/calc.ts`、`src/mod0..49.ts`（每个约 4 KB）、`config/app.json`（含未登记口令）、`.env`（含同一口令）、3 MiB 的 `big.bin`。
仓库 A 没有 `.gitignore`；仓库 B 的 `.gitignore` 忽略 `.env` 与 `big.bin`。用编译后的 `A9WorkspaceService` 按产品调用顺序跑以下轮次（秘密门用与产品同口径的模拟函数，已知秘密为一个模拟 Provider key）：

| 轮次 | 操作 |
|---|---|
| turn-1 | 先 `read` 再 `edit` `src/calc.ts`、把 `config/app.json` 中的口令改为 `rotated`，`write` 新建 `notes.md` |
| turn-2 | Shell 轮：`freezeTurnBaseline` → 直接改 `README.md`、新建 `gen.txt` → `collectExternalChanges` |
| turn-3 | `write` 一个含已知 Provider key 的文件 |
| turn-4 | Shell 轮（此时工作区含已知 key） |
| turn-5 | 移除 key 后再跑一次 Shell 轮 |

之后记录 `git status`、各种 `git add`、`git clean -n`、`git stash -u` 的结果与恢复目录内容，并在副本上逐一试验三种保障方式及方案 3b。

## 4. 实验结果

### 4.1 Git 暴露（仓库 A，无忽略规则）

| 命令 | 结果 |
|---|---|
| `git status --porcelain` | 一行 `?? .agent_recovery/`（`-uall` 下 125 行） |
| `git add -A` / `git add .` / `git add --all -- :/` | 均暂存 131 个文件，其中恢复目录 125 个 |
| `git commit -a` | 只提交已跟踪文件，不纳入（由 Git 语义决定，未单测） |
| `git clean -nd` / `-ndx` | 均列出 `Would remove .agent_recovery/` |
| `git stash push -u` | 恢复目录被收进 stash、从工作区消失 |
| `git clean -fd` 后撤销 turn-1 | `errors: ["未找到 Checkpoint: turn-1"]`，文件未恢复 |
| 工作区为仓库子目录 `pkg/` | `pkg/.agent_recovery/` 同样出现在未跟踪列表 |

### 4.2 恢复目录内容

| 项 | 仓库 A | 仓库 B |
|---|---|---|
| turn-1 后 | 6 个文件，3,005 字节 | — |
| turn-2（一次 Shell 轮）后 | 62 个文件，254,676 字节；基线复制 55 个文件，`big.bin` 以 `too_large` 跳过 | — |
| 5 轮后 | 125 个文件，507,075 字节 | 125 个文件，506,719 字节 |
| 改动前原文 | 含（`ORIGINAL-CALC` 1 处） | 含 |
| 未登记口令 | 4 处：turn-1 `config/app.json` 改前原文 1 处 + 3 次 Shell 基线中的 `.env` | 1 处：turn-1 `config/app.json` 改前原文（`.env` 因被 `.gitignore` 忽略而未复制） |
| 已知 Provider key | 0 处 | 0 处 |
| 清单中的路径 | 绝对路径（如 `<临时目录>/repoA/.agent_recovery/snapshots/turn-1/<hash>/original.bin`） | 同 |

附带观察：turn-3 含已知 key 的写入成功落盘（秘密门只检查轮前原文，原文不含 key）；此后 turn-4 的 Shell 基线因工作区含已知秘密被 `A9_CHECKPOINT_SECRET_BLOCKED` 拒绝，在移除 key 之前该工作区的 Shell 轮都会被阻断。这是既有的失败即关闭设计，不属本次误暂存问题，只登记。

体积规律：工作区（不含 `.git` 与被跳过的大文件）约 0.25 MB 时，每个 Shell 轮新增约 0.25 MB。按上限推算，40 MiB 以上的工作区每个 Shell 轮最多新增约 40 MiB，且没有清理机制；一旦误暂存，提交体积随 Shell 轮数线性增长。

### 4.3 路径长度（顺带核对，待验证）

恢复文件相对工作区的固定后缀约为 `\.agent_recovery\snapshots\turn-<13 位时间戳>-<序号>\<64 位哈希>\original.bin`，约 125 字符；工作区路径超过约 130 字符时，Win7 下将超过 `MAX_PATH`（`docs/WIN7_CONSTRAINTS.md` §1、§5）。
目录快照还会再拼接被快照目录的相对路径。未在 Win7 验证，与本次问题无关，只登记。

## 5. 保障方式评估

| 方式 | 实验结果 | 影响与局限 | 迁移成本 | 对 WIN7-39 已发布候选的含义 |
|---|---|---|---|---|
| **方案一**：写 `.git/info/exclude` | `status`、三种 `add` 均不再纳入；`clean -fd` 不删，`clean -fdx` 仍删；`add -f` 仍可暂存（125 个）。worktree 中 `.git` 是文件，须写到公共目录的 `info/exclude`（实验确认该文件对 worktree 生效）；仓库子目录工作区也生效 | 要求产品定位 Git 目录（`.git` 目录、`gitdir:` 文件、worktree 公共目录、子模块），或调用 Git——后者引入进程与 P19 间接执行面；产品写入工作区外的仓库元数据；工作区打开后才 `git init` 的仓库、祖先目录中的仓库都要每轮重查；不覆盖 SVN/Hg | 无数据迁移；需 ADR（产品写仓库元数据）与 Git 目录解析的单测 | 已发布候选不变；可作为用户手动缓解步骤（一行命令），立即写入已知问题说明 |
| **方案二**：恢复目录移到产品数据目录并迁移已有 checkpoint | 恢复根指定到工作区外时，同卷撤销正常，工作区无恢复目录，`git status` 为空；把已有 `.agent_recovery/` 整体搬到新位置后撤销失败（`无法读取 Checkpoint 清单…`），因为清单记录并校验绝对路径 | 根治：`git clean -fdx`、`stash -u`、打包、同步盘、其他 VCS 都不再触及，清单里的绝对路径也不再进入仓库。但撤销用 `renameSync` 在 `undo-staging/` 与工作区之间换入，数据目录（系统盘）与工作区（常见 D:）跨卷时 `rename` 将失败（EXDEV，**待验证**），交换区须留在工作区所在卷，需重新设计；需按工作区身份分目录、设计保留期与清理 | 高：清单格式改为相对路径（schema 升版）或迁移时重写并重校验路径；启动时迁移旧目录，处理迁移中断、崩溃恢复中的轮次与 SQLite 中断轮次；须 ADR 与 Win7 跨卷实测 | 需版本化迁移；旧候选产生的目录须被新版本识别并迁移，否则旧轮次撤销不可用 |
| **方案三**：在工作区根写 `.gitignore` | 恢复目录不再纳入；但新建的 `.gitignore` 本身以 `?? .gitignore` 出现，会被 `add -A` 带入提交 | 改动用户项目的版本化文件（或新建一个），变更对团队可见；该写入发生在 Agent 轮次之外，没有 checkpoint 与审计，与“工作区写入可撤销、可审计”的原则相悖；已有 `.gitignore` 时需合并 | 无数据迁移；但每个用户仓库会多出一次需要他人评审的提交 | 不建议作为产品行为 |
| **方案 3b（补充）**：在恢复目录内写 `.agent_recovery/.gitignore`，内容为 `*` | `status` 与 `add -A`、`add .` 均不再纳入恢复目录（`git check-ignore` 显示由该文件命中）；`clean -fd` 不删、`stash -u` 不收走；`clean -fdx` 仍删；产品 `listPersistedTurns` 与撤销不受该文件影响（撤销后内容恢复为原文）。对已有恢复目录补写该文件，`?? .agent_recovery/` 立即消失 | 不改用户文件、不碰 `.git`、不需要定位 Git 目录；worktree、子模块、子目录工作区、之后才 `git init` 的仓库都自然生效（pytest、ruff 等缓存目录的通行做法）。不能阻止 `add -f`、`clean -fdx`，不覆盖非 Git 工具；已经提交过的恢复目录仍留在 Git 历史中，只能由用户处理 | 低：创建恢复根时写入，并在打开工作区时对已有目录补写（幂等）；不改清单格式；需小 ADR 记录这一工作区可见行为 | 已发布候选不变；新版本打开旧工作区即补写，无需迁移；手动缓解可用同一做法 |

## 6. 推荐与 D1 建议

**方案**：近期修复用方案 3b。它覆盖本次确认的全部误暂存路径，实现最小，不改数据格式，旧工作区在新版本打开时即自动生效。
方案一能达到相近效果，但需要定位 Git 目录并写仓库元数据，收益不高于 3b；方案三改动用户文件，不建议。
方案二是唯一能同时解决 `clean -fdx`、非 Git 工具、清单绝对路径与路径长度问题的做法，但跨卷交换、清单格式与迁移都需要设计，建议与“恢复目录保留期与清理”一并另立任务评估，不进入 D1。

**D1（由负责人裁决）**：建议进入**第一批**，作为第一个里程碑（最小、与其余里程碑无依赖）。理由：

1. A9-25 §2 第 2 条规定 WIN7-40 不做产品改动，W40 套件正在按该范围实现；并入修复需另立产品任务、修订 A9-25 范围与用例，并返工进行中的套件，违反推进顺序第 1、2 条的隔离做法。
2. 该问题自 2026-08-22 起存在于全部 A9 候选，WIN7-40 延后一个候选修复不会改变暴露面；手动缓解（在仓库执行一次 3b 或方案一）立即可用。
3. 需要注意的反面理由：WIN7-40 验收的 A9-24 让撤销成为显眼功能，用户对恢复目录的依赖会增加。若负责人认为这一点优先，3b 的改动量允许放进 WIN7-40，但须在 W40 套件冻结前完成产品任务书、ADR 与新增用例。

**无论 D1 结果如何，建议立即**：在 WIN7-40 验证说明与 STATUS 中把“恢复目录可能被 `git add` 纳入、`git clean -fd`/`stash -u` 会使撤销失效”登记为已知问题并给出手动缓解；核查结论出来前不对外宣称“不会误暂存”的约束（推进顺序 §3）改为引用本报告。

## 7. 附带登记（不在 D1 范围）

| 编号 | 观察 | 建议去向 |
|---|---|---|
| R-1 | 恢复目录无保留期与清理，每个 Shell 轮最多复制 40 MiB | 与方案二同一任务评估 |
| R-2 | 未登记秘密（`.env` 未被忽略时、被改掉的旧口令）进入恢复目录；秘密门只识别已知秘密，这是设计边界，但需在用户文档中说明 | 第一批或文档任务 |
| R-3 | 清单记录绝对路径，误提交时泄露用户名与目录结构 | 随方案二的清单格式一并处理 |
| R-4 | `git clean -fd`、`stash -u` 删除恢复目录后撤销只提示“未找到 Checkpoint” | 3b 可消除前两种情形；`clean -fdx` 后的提示改进可并入第一批 |
| R-5 | 工作区含已知 Provider key 时全部 Shell 轮被阻断，直到移除 | 既有设计，是否需要更清楚的提示另议 |
| R-6 | 工作区路径较长时恢复文件可能超过 Win7 `MAX_PATH`（§4.3，待验证） | 另行核查 |

## 8. 矛盾与偏离

- 未发现文档之间或文档与现状的矛盾。
- 偏离：推进顺序只列三种保障方式，本报告另增方案 3b；它属于“在工作区写 `.gitignore`”的变体（写在恢复目录内），列出供裁决，不视为已采纳。

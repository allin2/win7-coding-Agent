# A9-32 独立审核交接包（2026-10-12，绑定 R-01 修复提交）

本包供负责人另开的审核会话对提交 `adb9d0f0a5a78dd6a82917a794d0930bff6ffa60` 做增量复审；增量复审 NOT_PERFORMED。
该提交在 `59a3f650…` 之上修复 R-01（ADR-0237），并补 R-01 回归用例和 R-03 的 3 个用例。
`59a3f650…` 已于 2026-10-12 通过开发机独立审核（第 6 节）。本包把复核对象推进到 `adb9d0f0…`。
本包取代绑定 `59a3f650…` 的版本，其历史在提交 `7504832a…`；更早的初版在 `5cf8da1…`。
证据层级为开发机，未取得真实 Electron、Win10 或 Win7 实机结果。

## 0. 审核会话启动说明

审核者是负责人另开的新会话，不带执行代理的上下文，也不是实现方。
审核者只读本文件和第 1 节列出的材料，不写原隔离树、主工作区、A9-31 树和已有 `.acceptance`。
审核者在自己的空目录复算，把结论写进自己目录的 `review-conclusion.md`，格式同第 6 节，并向负责人报告。是否登记进第 6 节由负责人决定。
不联网、不下载、不启动 Electron、不访问 Win10/Win7、不提交、不推送。
本轮是增量复审，重点是第 5 节的新增复核点；审核者仍可对全量 `d8fd760a…..adb9d0f0…` 复算。

## 1. 对象、输入与保护边界

提交链：基线 `571ec550…` → `d8fd760a…`（A9-32 实现）→ `5cf8da1…`、`ea437f40…`、`27740393…`（仅文档）→ `59a3f650…`（F6/ENOTDIR 修复，已审）→ `7504832a…`、`a9c1360…`、`62a73f78…`（仅文档）→ `adb9d0f0…`（R-01 修复，本包复核对象）。
增量源码差异用 `git -C "$REPO" diff 59a3f6507ecac3c0c89fdcd6fc9b8ef79ceba73c adb9d0f0a5a78dd6a82917a794d0930bff6ffa60 -- src` 查看，涉及 4 个文件：`src/state/src/a9-persistence.ts`（R-01 修复）与 State、Core、Shell 各一个 `a9-task-continue.test.ts`。
`src/core/src/a9-agent-loop.ts` 相对 `59a3f650…` 未变，SHA-256 `34184a20…`。
r4 清单路径 `.acceptance/a9-32-developer/review-bundle-manifest-r4.json`。
清单 SHA-256：`d00d11235667a14fe542901b74641a0a07458ccd102ff530e5c8643111868b54`。
清单 26 个路径与 r3 相同，字节取自 `adb9d0f0…` 的 Git blob。与 r3 不同的 10 个文件中，1 个是修复代码，3 个是测试，6 个是文档。
r4 补丁 `reviewable-local-change-r4.patch`（基线到本提交，26 路径），SHA-256 `7ff126ca…`。
增量补丁 `reviewable-delta-r4.patch`（`59a3f650…..adb9d0f0…`，仅 `src`），SHA-256 `acd63137…`。提交回执见 `local-commit-receipt-r6.json`。
清单内 status 是各自提交前后的快照，r2、r3、r4 均不得改写。
当前树在 `adb9d0f0…` 之后还有仅文档的追加提交，含本次重绑，不属于源码审核对象。必须从提交 `adb9d0f0…` 的归档取得文件，不能拿工作区文档对照清单。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用已在本机存在的路径。任一步不符就保存首失败并停止依赖动作。
以下命令是交接文本，审核者复算前均 NOT_PERFORMED。

```sh
REPO=/Users/qlyf/.codex/worktrees/a9-32-explicit-continue/win7-coding-Agent
REVIEW_DIR=$(mktemp -d /private/tmp/a9-32-independent-review.XXXXXX)
git -C "$REPO" -c core.fsmonitor=false archive adb9d0f0a5a78dd6a82917a794d0930bff6ffa60 | tar -x -C "$REVIEW_DIR"
MAIN=/Users/qlyf/Developer/win7-coding-Agent
for mod in . src/*; do
  [ -d "$MAIN/$mod/node_modules" ] || continue
  mkdir -p "$REVIEW_DIR/$mod/node_modules"
  for entry in "$MAIN/$mod/node_modules"/* "$MAIN/$mod/node_modules/.bin" "$MAIN/$mod/node_modules/.package-lock.json"; do
    [ -e "$entry" ] || continue
    [ "$(basename "$entry")" = "@win7-agent" ] && continue
    ln -s "$entry" "$REVIEW_DIR/$mod/node_modules/$(basename "$entry")"
  done
done
cd "$REVIEW_DIR"
export PATH=/Users/qlyf/.nvm/versions/node/v20.17.0/bin:$PATH NPM_CONFIG_OFFLINE=true
node --version
npm run verify:quick
npm test --workspace=@win7-agent/state -- --runInBand --runTestsByPath tests/a9-task-continue.test.ts tests/a9-persistence-contract.test.ts tests/a9-stream-output.test.ts
npm test --workspace=@win7-agent/core -- --runInBand --runTestsByPath tests/a9-task-continue.test.ts tests/a9-agent-loop.test.ts tests/a9-audit-integrity.test.ts tests/a9-verification-evidence.test.ts tests/a9-context-budget.test.ts tests/a9-project-instructions.test.ts tests/a9-permission-modes.test.ts
npm test --workspace=@win7-agent/shell -- --runInBand --runTestsByPath tests/product/a9-task-continue.test.ts tests/product/a9-workbench-contract.test.ts tests/product/a9-lifecycle.test.ts tests/product/a9-audit-integrity.test.ts tests/product/a9-mode-fail-closed.test.ts tests/product/a9-workspace-binding.test.ts tests/product/a9-preload-capability.test.ts tests/product/a9-shell-streaming.test.ts tests/product/a9-background-tools.test.ts tests/product/a9-26-context-budget-config.test.ts
```

预期 Node 为 v20.17.0。`verify:quick` 先构建七模块，再验证消费者；预期退出码 0。
开发机在提交前的工作树上得到：State 88（`59a3f650…` 时 84，增 4）、Core 221（218，增 3）、Shell 134（133，增 1），均退出 0。日志为 `state-contract-r6.log`、`core-contract-r6.log`、`shell-contract-r6.log`、`verify-quick-r7.log`。
该工作树在提交时与 `adb9d0f0…` 字节相同，`a9-agent-loop.ts` 的 SHA-256 为 `34184a20…`。
依赖搭建说明（2026-10-12 修订）：`verify_integration.mjs` 要求每个 `src/<模块>/node_modules` 存在，且根 `node_modules/@win7-agent/*` 是相对软链接。初版把根 `node_modules` 整体链到主工作区，既过不了依赖检查，也会让包解析到主工作区。上面的循环改为逐项软链接，不链 `@win7-agent`。
初版写法由首位独立审核者发现并绕过；修订写法已在 `59a3f650…` 的全新归档上实测，并在 `adb9d0f0…` 的全新归档上复测：本文件第 2～4 节的 5 个 `sh` 代码块原文抽出后一次执行，退出码 0。结果：`verify:quick` 退出 0，State 88、Core 221、Shell 134 通过，第 3 节清单 26 个文件逐项通过，第 4 节三组反例核对通过（开发机，Node 20.17.0）。日志为 `d4-doc-commands-r4.log`。
归档里的 `src/runner/dist` 是提交版本，`verify:quick` 会在审核者目录内重新生成，不影响原树。
SQLite 本地依赖必须可用于该 Node 与架构；不符时记环境差异，不能降判据。
独立目录没有 .git，不在归档副本运行依赖 Git 枚举的 `docs:check`。文档检查在原隔离树单独完成：323 个文件，ok。

## 3. 清单逐文件核对

在上一步同一 shell 中执行。先核清单本身，再核每个归档成员，不能只核总清单 SHA。

```sh
shasum -a 256 "$REPO/.acceptance/a9-32-developer/review-bundle-manifest-r4.json"
python3 - "$REPO" "$REVIEW_DIR" <<'PY'
import sys,json,hashlib
from pathlib import Path
repo,review=map(Path,sys.argv[1:])
p=repo/'.acceptance/a9-32-developer/review-bundle-manifest-r4.json'
assert hashlib.sha256(p.read_bytes()).hexdigest()=='d00d11235667a14fe542901b74641a0a07458ccd102ff530e5c8643111868b54'
data=json.loads(p.read_text(encoding='utf-8'))
assert data['gitCommit']=='adb9d0f0a5a78dd6a82917a794d0930bff6ffa60'
for row in data['files']:
    b=(review/row['path']).read_bytes()
    assert len(b)==row['bytes'],row['path']
    assert hashlib.sha256(b).hexdigest()==row['sha256'],row['path']
print('PASS',len(data['files']),'archived files')
PY
```

## 4. 反例与恢复 SHA 核对

读取结果与日志，不在原树重新注入。结果分两组，绑定对象不同。

### 4.1 r4：8 个反例，绑定 `d8fd760a…`（历史）

反例清单：durable-dedup、recovery-revision、unknown-side-effect-gate、fresh-approval、restart-auto-dispatch、f1-enoent-observation、f2-path-normalization、f3-original-goal-filter。
其中 unknown-side-effect-gate、fresh-approval、f1-enoent-observation、f2-path-normalization 作用于 `a9-agent-loop.ts`，该文件已被修复提交改动。
这 4 个反例在 `59a3f650…` 和 `adb9d0f0…` 上均未由执行代理重跑，状态 NOT_PERFORMED。原注入定义没有保存，无法逐字重放。
上一轮审核者已在 `59a3f650…` 上自行注入等价反例，结论全部变红；`adb9d0f0…` 未改 `a9-agent-loop.ts`，该结论沿用。
r4 的恢复 SHA 因此对照 `d8fd760a…` 的字节，而不是修复提交。

```sh
python3 - "$REPO" <<'PY'
import sys,json,hashlib,subprocess
from pathlib import Path
repo=Path(sys.argv[1]); evidence=repo/'.acceptance/a9-32-developer'
OLD='d8fd760a1c283b638996bde50c90fc7d2d139ccb'
rows=json.loads((evidence/'mutation-results-r4.json').read_text(encoding='utf-8'))
assert len(rows)==8
for r in rows:
    assert all(r[k] is True for k in ['expectedRed','actualRed','assertionFailure','behavioralFailure']),r['id']
    assert r['buildExitCode']==0 and r['exitCode']!=0,r['id']
    assert r['originalSha256']==r['restoredSha256'],r['id']
    old=subprocess.run(['git','-C',str(repo),'-c','core.fsmonitor=false','show',f"{OLD}:{r['file']}"],capture_output=True,check=True).stdout
    assert hashlib.sha256(old).hexdigest()==r['restoredSha256'],r['file']
    assert 'restoreBuildExitCode' not in r or r['restoreBuildExitCode']==0,r['id']
    assert (evidence/r['log']).is_file(),r['log']
    print(r['id'],r['file'],r['restoredSha256'][:8]+'…',r['log'])
PY
```

### 4.2 r5：2 个反例，绑定 `59a3f650…`（Core 文件在 `adb9d0f0…` 未变）

| id | 回退内容 | 预期变红的用例 |
|---|---|---|
| f6-opaque-read-release | `read` 重新可解除 opaque 门 | 无关 ENOENT 读、无关已存在读、读取受影响路径只清除该路径，共 3 项 |
| f7-enotdir-absent | ENOTDIR 不再按路径不存在处理 | ENOENT 与 ENOTDIR 的文件父级用例，共 2 项 |

```sh
python3 - "$REPO" "$REVIEW_DIR" <<'PY'
import sys,json,hashlib
from pathlib import Path
repo,review=map(Path,sys.argv[1:]); evidence=repo/'.acceptance/a9-32-developer'
rows=json.loads((evidence/'mutation-results-r5.json').read_text(encoding='utf-8'))
assert [r['id'] for r in rows]==['f6-opaque-read-release','f7-enotdir-absent']
for r in rows:
    assert all(r[k] is True for k in ['expectedRed','actualRed','assertionFailure','behavioralFailure']),r['id']
    assert r['buildExitCode']==0 and r['exitCode']!=0 and r['restoreBuildExitCode']==0,r['id']
    assert r['originalSha256']==r['restoredSha256'],r['id']
    assert hashlib.sha256((review/r['file']).read_bytes()).hexdigest()==r['restoredSha256'],r['file']
    assert (evidence/r['log']).is_file() and r['failedTests'],r['id']
    print(r['id'],r['restoredSha256'][:8]+'…',len(r['failedTests']),'red tests')
PY
```

### 4.3 r6：4 个反例，绑定 `adb9d0f0…`

| id | 作用文件 | 回退内容 | 预期变红的用例 |
|---|---|---|---|
| r01-residue-not-kept-unknown | `src/state/src/a9-persistence.ts` | 带 `residueRisk` 的副作用工具 `tool_end` 无条件清除 | State 2 项加 Shell 1 项，共 3 项 |
| dangling-symlink-guard-removed | `src/core/src/a9-agent-loop.ts` | 去掉悬空软链接的 `lstat` 保护 | Core 1 项 |
| absent-stat-check-inverted | `src/core/src/a9-agent-loop.ts` | 去掉 `stat` 检查后的 `return false` | Core 1 项 |
| opaque-released-by-search | `src/core/src/a9-agent-loop.ts` | `search` 也解除 opaque 门 | Core 1 项 |

后 3 个是上一轮审核者留下的存活反例，注入定义取自其 `scripts/mutate.py`。

```sh
python3 - "$REPO" "$REVIEW_DIR" <<'PY'
import sys,json,hashlib
from pathlib import Path
repo,review=map(Path,sys.argv[1:]); evidence=repo/'.acceptance/a9-32-developer'
rows=json.loads((evidence/'mutation-results-r6.json').read_text(encoding='utf-8'))
want={'r01-residue-not-kept-unknown':3,'dangling-symlink-guard-removed':1,'absent-stat-check-inverted':1,'opaque-released-by-search':1}
assert {r['id']:len(r['failedTests']) for r in rows}==want
for r in rows:
    assert all(r[k] is True for k in ['expectedRed','actualRed','assertionFailure','behavioralFailure']),r['id']
    assert r['buildExitCode']==0 and r['exitCode']!=0 and r['restoreBuildExitCode']==0,r['id']
    assert r['originalSha256']==r['restoredSha256'],r['id']
    assert hashlib.sha256((review/r['file']).read_bytes()).hexdigest()==r['restoredSha256'],r['file']
    assert all((evidence/l).is_file() for l in r['log']),r['id']
    print(r['id'],r['restoredSha256'][:8]+'…',len(r['failedTests']),'red tests')
PY
```

先保存原始审核输出，再汇总。日志引用来自原 r2、r5 和本轮 r6；不得覆盖 r1～r5 或改历史失败。
`generated-output-preservation-r6.json` 记录 r6 重建时被改动、随后还原的 24 个已跟踪 `src/runner/dist` 文件，它们不属于修复提交；r5 同类记录保留。

## 5. 审核范围、此前发现与排除项

范围：A9-32 持久恢复与事务去重、原目标、recoveryRevision、未知副作用核查、旧批准失效、IPC、preload、继续卡，以及共享审计、预算、取消与恢复边界。
本轮是增量复审，新增复核点：
- [ADR-0237](../../DECISIONS.md) 的两项决定，及 `getTaskRecovery` 中保留条件（`residueRisk === true` 且工具属于 `sideEffects`）是否按其实现。
- `sideEffects` 集合是否覆盖所有可能改文件的工具，包括前台 Shell；只读工具带 `residueRisk` 不计未知是否正确。
- R-01 回归用例是否充分：State 4 项、Shell 端到端 1 项。
- R-03 的 3 个 Core 用例是否能杀死上一轮留下的 3 个存活反例（第 4.3 节）。
- 保留未知后，`recoveryRevision` 与继续卡的行为是否仍符合 ADR-0189、ADR-0236；审核者报告影响，不修代码。
上一轮已审并通过的 [ADR-0236](../../DECISIONS.md) 两项决定不重复审核，只检查本增量没有改动它们。残余限制不变：任何已核验目录的 `list`（包括无关目录）仍可解除 opaque 门。

此前发现与处置：

| 项 | 处置 |
|---|---|
| F1～F4 | 此前一次评审发现，执行代理已修复，开发机复现 |
| F5 授权来源 | 负责人已在聊天中确认，见 [A9-32 §7.2](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#72-f5-授权来源确认2026-10-12) |
| F6、ENOTDIR | 已在 `59a3f650…` 修复并通过上一轮独立审核，见 [§7.4](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#74-f6-与-enotdir-独立复核前修复2026-10-12) |
| R-01 | 已在 `adb9d0f0…` 修复（ADR-0237），本轮复审对象，见 [§7.6](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#76-r-01-修复与-r-03-补用例2026-10-12) |
| R-02、R-04～R-07 | 登记为已知限制，不修复，见 [§7.5](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#75-独立审核结论登记与-r-01-裁决2026-10-12) |
| R-03 | 3 个用例已在 `adb9d0f0…` 补入，本轮复审对象 |
| ADR-0189 措辞与编号 | 原文保持，补充由 ADR-0236 承载；整合前仍须再次核号 |
| 错误码可读性、Core 路径核验职责 | 仍是已知限制，未修复，见 A9-32 §7.1 |

此前一次评审不是负责人指定的独立审核，不得写成已签审。
原报告标题含“独立复核”的历史文字保持；本交接不据此签发独立审核或 DEVELOPER_VERIFIED。

真实 Electron、Windows native/SQLite ABI110 加载、Win10、Win7 均 NOT_PERFORMED。ENOTDIR 在 Win7 NTFS 上的实际错误码 NOT_PERFORMED。
不审核正式候选 authority、冻结、门 A/B、完整 Alpha2/RC、发布或主工作区在制改动。
发现新的阻断级问题，只记录路径、行号和证据并报负责人；停止依赖签发，不实施修复。

## 6. 审核结论栏

审核者把结论写在自己的 `review-conclusion.md`；是否登记进本表由负责人决定。

| 审核者 | 日期 | 绑定提交 | 结论 | 发现项 |
|---|---|---|---|---|
| Claude Sonnet 5.5，负责人另开的独立审核会话 | 2026-10-12 | `59a3f650…` | PASS（开发机）；无阻断级发现；R-01 待修复 | R-01 中，负责人选 B；R-02～R-04 低；R-05～R-07 信息 |
| 待负责人指定 | — | `adb9d0f0…`（增量 `59a3f650…..adb9d0f0…`） | NOT_PERFORMED | — |

登记日期 2026-10-12，登记依据为负责人在聊天中回复“B，补用例，登记并提交”。
审核结论全文见[独立审核结论](a9_32_independent_review_conclusion_2026-10-12.md)，原文 SHA-256 `2843769f…`。证据副本在 `.acceptance/a9-32-developer/independent-review-r1/`。
登记不签 `DEVELOPER_VERIFIED`。R-01 已在 `adb9d0f0…` 修复，但增量复审 NOT_PERFORMED，对 `59a3f650…` 的 PASS 不覆盖该修复。
审核者发现第 2 节的依赖搭建命令有缺陷，已在本文件第 2 节修订。

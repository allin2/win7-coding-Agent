# A9-32 独立审核交接包（2026-10-12，绑定修复提交）

本包供负责人另开的新审核会话复核提交 `59a3f6507ecac3c0c89fdcd6fc9b8ef79ceba73c`；独立审核 NOT_PERFORMED。
该提交在 `d8fd760a1c283b638996bde50c90fc7d2d139ccb` 之上修复 F6 与 ENOTDIR（ADR-0236）。
本包取代绑定 `d8fd760a…` 的初版，初版保留在历史提交 `5cf8da1…`。
证据层级为开发机，未取得真实 Electron、Win10 或 Win7 实机结果。

## 0. 审核会话启动说明

审核者是负责人另开的新会话，不带执行代理的上下文，也不是实现方。
审核者只读本文件和第 1 节列出的材料，不写原隔离树、主工作区、A9-31 树和已有 `.acceptance`。
审核者在自己的空目录复算，把结论写进自己目录的 `review-conclusion.md`，格式同第 6 节，并向负责人报告。是否登记进第 6 节由负责人决定。
不联网、不下载、不启动 Electron、不访问 Win10/Win7、不提交、不推送。

## 1. 对象、输入与保护边界

提交链：基线 `571ec550b5e09611f55557563d0cf2f1a4a40d1b` → `d8fd760a…`（A9-32 实现）→ `5cf8da1…`、`ea437f40…`、`27740393…`（仅文档）→ `59a3f650…`（修复，本包复核对象）。
修复差异用 `git -C "$REPO" diff d8fd760a1c283b638996bde50c90fc7d2d139ccb 59a3f6507ecac3c0c89fdcd6fc9b8ef79ceba73c -- src` 查看，仅涉及 `src/core/src/a9-agent-loop.ts` 与 `src/core/tests/a9-task-continue.test.ts`。
r3 清单路径 `.acceptance/a9-32-developer/review-bundle-manifest-r3.json`。
清单 SHA-256：`51ac0ca01de3a64d1db880e32d3f93ae7c51379c6aa4b73ba4551f682de1518c`。
清单 26 个路径与 r2 相同，字节取自 `59a3f650…` 的 Git blob。与 r2 不同的 12 个文件中，2 个是修复代码，10 个是文档追加。
r3 补丁 `.acceptance/a9-32-developer/reviewable-local-change-r3.patch`，SHA-256 `08af231b…`。提交回执见 `local-commit-receipt-r5.json`。
清单内 status 与 r2 的 NOT_CREATED 是各自提交前后的快照，不得改写。
当前树在 `59a3f650…` 之后还有仅文档的追加提交，不属于源码审核对象。必须从提交 `59a3f650…` 的归档取得文件，不能拿工作区文档对照清单。

## 2. 可复现命令与预期

先核 Node 20.17.0，使用已在本机存在的路径。任一步不符就保存首失败并停止依赖动作。
以下命令是交接文本，审核者复算前均 NOT_PERFORMED。

```sh
REPO=/Users/qlyf/.codex/worktrees/a9-32-explicit-continue/win7-coding-Agent
REVIEW_DIR=$(mktemp -d /private/tmp/a9-32-independent-review.XXXXXX)
git -C "$REPO" -c core.fsmonitor=false archive 59a3f6507ecac3c0c89fdcd6fc9b8ef79ceba73c | tar -x -C "$REVIEW_DIR"
ln -s /Users/qlyf/Developer/win7-coding-Agent/node_modules "$REVIEW_DIR/node_modules"
cd "$REVIEW_DIR"
export PATH=/Users/qlyf/.nvm/versions/node/v20.17.0/bin:$PATH
node --version
npm run verify:quick
npm test --workspace=@win7-agent/state -- --runInBand --runTestsByPath tests/a9-task-continue.test.ts tests/a9-persistence-contract.test.ts tests/a9-stream-output.test.ts
npm test --workspace=@win7-agent/core -- --runInBand --runTestsByPath tests/a9-task-continue.test.ts tests/a9-agent-loop.test.ts tests/a9-audit-integrity.test.ts tests/a9-verification-evidence.test.ts tests/a9-context-budget.test.ts tests/a9-project-instructions.test.ts tests/a9-permission-modes.test.ts
npm test --workspace=@win7-agent/shell -- --runInBand --runTestsByPath tests/product/a9-task-continue.test.ts tests/product/a9-workbench-contract.test.ts tests/product/a9-lifecycle.test.ts tests/product/a9-audit-integrity.test.ts tests/product/a9-mode-fail-closed.test.ts tests/product/a9-workspace-binding.test.ts tests/product/a9-preload-capability.test.ts tests/product/a9-shell-streaming.test.ts tests/product/a9-background-tools.test.ts tests/product/a9-26-context-budget-config.test.ts
```

预期 Node 为 v20.17.0。`verify:quick` 先构建七模块，再验证消费者；预期退出码 0。
开发机在提交前的工作树上得到：State 84、Core 218（原 212 加新增 6 项）、Shell 133，均退出 0。日志为 `state-contract-r5.log`、`core-contract-r5.log`、`shell-contract-r5.log`、`verify-quick-r5.log`。
该工作树的 `a9-agent-loop.ts` 与提交 `59a3f650…` 同为 SHA-256 `34184a20…`。
归档里的 `src/runner/dist` 是提交版本，`verify:quick` 会在审核者目录内重新生成，不影响原树。
SQLite 本地依赖必须可用于该 Node 与架构；不符时记环境差异，不能降判据。
独立目录没有 .git，不在归档副本运行依赖 Git 枚举的 `docs:check`。文档检查在原隔离树单独完成：322 个文件，ok。

## 3. 清单逐文件核对

在上一步同一 shell 中执行。先核清单本身，再核每个归档成员，不能只核总清单 SHA。

```sh
shasum -a 256 "$REPO/.acceptance/a9-32-developer/review-bundle-manifest-r3.json"
python3 - "$REPO" "$REVIEW_DIR" <<'PY'
import sys,json,hashlib
from pathlib import Path
repo,review=map(Path,sys.argv[1:])
p=repo/'.acceptance/a9-32-developer/review-bundle-manifest-r3.json'
assert hashlib.sha256(p.read_bytes()).hexdigest()=='51ac0ca01de3a64d1db880e32d3f93ae7c51379c6aa4b73ba4551f682de1518c'
data=json.loads(p.read_text(encoding='utf-8'))
assert data['gitCommit']=='59a3f6507ecac3c0c89fdcd6fc9b8ef79ceba73c'
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
这 4 个反例在 `59a3f650…` 上未重跑，状态 NOT_PERFORMED。原注入定义没有保存，无法逐字重放，建议审核者在自己的目录独立注入同类反例。
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

### 4.2 r5：2 个反例，绑定 `59a3f650…`

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

先保存原始审核输出，再汇总。日志引用来自原 r2 和本轮 r5；不得覆盖 r1、r2、r3、r4 或改历史失败。
`generated-output-preservation-r5.json` 记录本轮重建时被改动、随后还原的 24 个已跟踪 `src/runner/dist` 文件，它们不属于修复提交。

## 5. 审核范围、此前发现与排除项

范围：A9-32 持久恢复与事务去重、原目标、recoveryRevision、未知副作用核查、旧批准失效、IPC、preload、继续卡，以及共享审计、预算、取消与恢复边界。
本轮新增复核点：
- [ADR-0236](../../DECISIONS.md) 的两项决定，及 `a9-agent-loop.ts` 中 `isAbsentPathError` 与 opaque 门解除条件是否按其实现。
- 软链接指向工作区外文件时 ENOTDIR 是否仍阻断，对应用例 `ENOTDIR below a symlink to an outside file stays closed`。
- 残余限制是否可接受：任何已核验目录的 `list`（包括无关目录）仍可解除 opaque 门。审核者报告影响，不修代码。

此前发现与处置：

| 项 | 处置 |
|---|---|
| F1～F4 | 此前一次评审发现，执行代理已修复，开发机复现 |
| F5 授权来源 | 负责人已在聊天中确认，见 [A9-32 §7.2](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#72-f5-授权来源确认2026-10-12) |
| F6、ENOTDIR | 已在本提交修复，见 [§7.4](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#74-f6-与-enotdir-独立复核前修复2026-10-12) |
| ADR-0189 措辞与编号 | 原文保持，补充由 ADR-0236 承载；整合前仍须再次核号 |
| 错误码可读性、Core 路径核验职责 | 仍是已知限制，未修复，见 A9-32 §7.1 |

此前一次评审不是负责人指定的独立审核，不得写成已签审。
原报告标题含“独立复核”的历史文字保持；本交接不据此签发独立审核或 DEVELOPER_VERIFIED。

真实 Electron、Windows native/SQLite ABI110 加载、Win10、Win7 均 NOT_PERFORMED。ENOTDIR 在 Win7 NTFS 上的实际错误码 NOT_PERFORMED。
不审核正式候选 authority、冻结、门 A/B、完整 Alpha2/RC、发布或主工作区在制改动。
发现新的阻断级问题，只记录路径、行号和证据并报负责人；停止依赖签发，不实施修复。

## 6. 审核结论栏

以下栏位留空，由负责人另开的新审核会话填写在自己的 `review-conclusion.md`。

| 审核者 | 日期 | 绑定提交 | 结论 | 发现项 |
|---|---|---|---|---|
| | | | | |

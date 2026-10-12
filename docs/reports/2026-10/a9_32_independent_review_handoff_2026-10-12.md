# A9-32 独立审核交接包（2026-10-12）

本包供负责人指定的独立审核者复核提交 `d8fd760a1c283b638996bde50c90fc7d2d139ccb`；当前指定独立审核 NOT_PERFORMED。
证据层级为开发机，未取得真实 Electron、Win10 或 Win7 实机结果。

## 1. 对象、输入与保护边界

父提交 `571ec550b5e09611f55557563d0cf2f1a4a40d1b`。r2 清单路径 `.acceptance/a9-32-developer/review-bundle-manifest-r2.json`。
清单 SHA-256：`5a02c683d2beb567804805f48fb47210962638d6a237ca43463a411a79cc44d2`。
清单 26 文件与 d8fd760a… 的 Git blob 已由本轮只读逐项比较，事实见 producer-readonly-analysis-r3.json。
清单内 NOT_CREATED/status 是提交前快照，不得改写。提交事实见 local-commit-receipt-r2.json。
当前树的后续文档追加不属于该源码审核对象；从提交归档取得原 26 文件，不能拿工作区文档对照旧清单。

独立审核者不写原隔离树、主工作区、A9-31 树或已有 .acceptance。只在自己的空目录复算。
不联网、不下载、不启动 Electron、不访问 Win10/Win7、不提交/推送。共享 node_modules 仅作依赖输入，不运行安装或修改它。
证据读取路径在下列命令中明确给出；新的审核输出留在独立副本/审核者目录。

## 2. 可复现命令与预期

先核 Node20.17.0，使用已在本机存在的路径。任一步不符就保存首失败并停止依赖动作。
以下命令是交接文本，本轮均 NOT_PERFORMED。

```sh
REPO=/Users/qlyf/.codex/worktrees/a9-32-explicit-continue/win7-coding-Agent
REVIEW_DIR=$(mktemp -d /private/tmp/a9-32-independent-review.XXXXXX)
git -C "$REPO" -c core.fsmonitor=false archive d8fd760a1c283b638996bde50c90fc7d2d139ccb | tar -x -C "$REVIEW_DIR"
ln -s /Users/qlyf/Developer/win7-coding-Agent/node_modules "$REVIEW_DIR/node_modules"
cd "$REVIEW_DIR"
export PATH=/Users/qlyf/.nvm/versions/node/v20.17.0/bin:$PATH
node --version
npm run verify:quick
npm test --workspace=@win7-agent/state -- --runInBand --runTestsByPath tests/a9-task-continue.test.ts tests/a9-persistence-contract.test.ts tests/a9-stream-output.test.ts
npm test --workspace=@win7-agent/core -- --runInBand --runTestsByPath tests/a9-task-continue.test.ts tests/a9-agent-loop.test.ts tests/a9-audit-integrity.test.ts tests/a9-verification-evidence.test.ts tests/a9-context-budget.test.ts tests/a9-project-instructions.test.ts tests/a9-permission-modes.test.ts
npm test --workspace=@win7-agent/shell -- --runInBand --runTestsByPath tests/product/a9-task-continue.test.ts tests/product/a9-workbench-contract.test.ts tests/product/a9-lifecycle.test.ts tests/product/a9-audit-integrity.test.ts tests/product/a9-mode-fail-closed.test.ts tests/product/a9-workspace-binding.test.ts tests/product/a9-preload-capability.test.ts tests/product/a9-shell-streaming.test.ts tests/product/a9-background-tools.test.ts tests/product/a9-26-context-budget-config.test.ts
```

预期 Node 为 v20.17.0。verify:quick 先构建七模块，再验证消费者；退出码预期 0。
任务书 §5 的三组命令逐字保留：State 84 / Core 212 / Shell 133，均退出 0。
这些是 r2 历史预期，不是本轮断言结果。SQLite 本地依赖必须可用于该 Node/架构；不符时记环境差异，不能降判据。
独立目录没有 .git；不在归档副本运行依赖 Git 枚举的 docs:check。本轮文档检查在原隔离树单独完成。

## 3. 清单逐文件核对

在上一步同一 shell 中执行。先核清单本身，再核每个归档成员，不能只核总清单 SHA。

```sh
shasum -a 256 "$REPO/.acceptance/a9-32-developer/review-bundle-manifest-r2.json"
python3 - "$REPO" "$REVIEW_DIR" <<'PY'
import sys,json,hashlib
from pathlib import Path
repo,review=map(Path,sys.argv[1:])
p=repo/'.acceptance/a9-32-developer/review-bundle-manifest-r2.json'
assert hashlib.sha256(p.read_bytes()).hexdigest()=='5a02c683d2beb567804805f48fb47210962638d6a237ca43463a411a79cc44d2'
data=json.loads(p.read_text(encoding='utf-8'))
for row in data['files']:
    b=(review/row['path']).read_bytes()
    assert len(b)==row['bytes'],row['path']
    assert hashlib.sha256(b).hexdigest()==row['sha256'],row['path']
print('PASS',len(data['files']),'archived files')
PY
```

## 4. 反例与恢复 SHA 核对

读取 `mutation-results-r4.json` 和对应日志，不在原树重新注入。
反例清单：durable-dedup、recovery-revision、unknown-side-effect-gate、fresh-approval、restart-auto-dispatch、f1-enoent-observation、f2-path-normalization、f3-original-goal-filter。
各项要求 expectedRed/actualRed/assertionFailure/behavioralFailure 为 true、buildExitCode 为 0、exitCode 非 0，originalSha256=restoredSha256。
含 restoreBuildExitCode 的项必须为 0。逐项打开 log 核对真实行为断言，编译失败不能代替反例。

```sh
python3 - "$REPO" "$REVIEW_DIR" <<'PY'
import sys,json,hashlib
from pathlib import Path
repo,review=map(Path,sys.argv[1:]); evidence=repo/'.acceptance/a9-32-developer'
rows=json.loads((evidence/'mutation-results-r4.json').read_text(encoding='utf-8'))
assert len(rows)==8
for r in rows:
    assert all(r[k] is True for k in ['expectedRed','actualRed','assertionFailure','behavioralFailure']),r['id']
    assert r['buildExitCode']==0 and r['exitCode']!=0,r['id']
    assert r['originalSha256']==r['restoredSha256'],r['id']
    assert hashlib.sha256((review/r['file']).read_bytes()).hexdigest()==r['restoredSha256'],r['file']
    assert 'restoreBuildExitCode' not in r or r['restoreBuildExitCode']==0,r['id']
    assert (evidence/r['log']).is_file(),r['log']
    print(r['id'],r['file'],r['restoredSha256'],r['log'])
PY
```

恢复 SHA 绑定三文件：State caef747c…、Core 147cab18…、Runtime bf402a08…；完整值由上式读取记录并核对归档。
先保存原始审核输出，再汇总。日志引用来自原 r2；不得覆盖 r1/r2 或改历史失败。

## 5. 审核范围、此前发现与排除项

范围：A9-32 持久恢复/事务去重、原目标、recoveryRevision、未知副作用核查、旧批准失效、IPC/preload/继续卡，以及共享审计/预算/取消与恢复边界。
核对源码、历史检查、反例真实失败和恢复字节。F6 与 ENOTDIR 重点按 [D1 §7](a9_33_producer_gap_analysis_2026-10-12.md#7-已知限制后续再修d3)报告影响，不修代码。

此前一次评审发现 F1～F4，执行代理已修复并在开发机复现。
对应历史结果为 State84/Core212/Shell133 和 8 个最终字节反例。
F6 登记为已知限制。F5 原授权来源待负责人确认。ADR-0189 措辞与编号风险待负责人确认。
此前评审不是负责人本轮指定的独立审核，不得写成已签审。
原报告标题含“独立复核”的历史文字保持；本交接不据此签发独立审核或 DEVELOPER_VERIFIED。

真实 Electron、Windows native/SQLite ABI110 加载、Win10、Win7 均 NOT_PERFORMED。
本轮也未执行上面的复算。不审核正式候选 authority、冻结、门 A/B、完整 Alpha2/RC、发布或主工作区在制改动。
发现新的阻断级问题，只记录路径/行号/证据并报负责人；停止依赖签发，不实施修复。

## 6. 审核结论栏

以下栏位留空，由负责人指定的独立审核者填写。

| 审核者 | 日期 | 绑定提交 | 结论 | 发现项 |
|---|---|---|---|---|
| | | | | |

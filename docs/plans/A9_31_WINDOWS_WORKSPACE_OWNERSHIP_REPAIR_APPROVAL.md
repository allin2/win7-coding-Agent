# A9-31：Windows 工作区归属比较的具体本地修复材料

日期：2026-10-04。Status: APPROVED_FOR_IMPLEMENTATION。
分支 `codex/a9-31-background-tools`；当前 HEAD `35a19250ed6589f6a7ba35b940a784325970c111`。
依据 [R10 现场报告](../reports/2026-10/a9_31_r10_partial_pass_and_windows_ownership_failure_2026-10-04.md)，Background 必需归属审计在 helper 创建之前失败。R10 已按原停止合同结束；此材料不恢复它。

## 1. 具体问题及批准后可观察结果

Session 和 owner 保存 canonical Windows 路径，fact 保留实际 workspaceRoot 展示路径；State 当前用字符串全等比较 origin/fact，导致同目录大小写差异被误拒绝。
批准后：同一个 Windows 工作区的 canonical owner 与展示路径可完成事务归属校验；真正不同目录、错会话/任务/Turn、非 active 会话仍零写入、零启动；起始意图必须落盘后才能创建 helper。
原始 R10 FAIL、旧中断数据和所有历史 UNKNOWN 保留。不编辑回收 SQLite 来“修复”事实，不通过测试入口把路径强制改小写来规避产品错误。

## 2. 本次精确实现路径和最小改动

仅以下三个路径；当前 A9-31 §4 已有白名单，此材料批准的是 R10 排除范围之外的具体产品修复动作：

| 路径 | 拟改动 |
|---|---|
| `src/state/src/a9-persistence.ts` | recordManagedOwnership 的 origin/fact 字节全等改为复用本文件已有 sameWorkspacePath；owner.workspace 与 canonical、session.state、关联 origin、request不可变及release guards全部保留。fact原始存储及其查询键不重写。 |
| `src/state/tests/a9-managed-process-ownership.test.ts` | 加入 Windows 大小写、斜杠、中文/空格同目录正例和错目录/归属/非active反例；核对事务事件/事实落盘及零部分写入。POSIX 大小写不同仍拒绝。模拟 Windows 与真实目标证据明确区分，测试平台修改在 finally 恢复。 |
| `src/shell/tests/product/a9-background-tools.test.ts` | 在现有真实 Runtime→State/in-memory SQLite 集成入口加入 Windows 展示路径与 canonical 路径不同的场景；使用真实 canonicalizer及正确win32平台合同，不再用identity替代该判据。证明starting ownership先落盘再startManaged，输出归属原Turn，错属/审计失败无派发，停止/release事实依旧可查。 |

拟修改的核心判据为：

```text
旧：origin.workspace_path !== fact.workspacePath
新：!sameWorkspacePath(origin.workspace_path, fact.workspacePath)
```

不新增接口、事件版本、依赖、系统 API 或安全例外，沿用 ADR-0151 已批准 canonical workspace 归属合同。
不改 Runtime/Runner/native、managed锁、包生产者、捕获库、三PS或回执安全逻辑。
若检查证明需要第四个实现文件，先提供准确路径和差异补充，仅暂停该路径的修改。

## 3. 检查、负向对照和交接结果

采用已锁定 Node20.17.0，本次受影响 State/Shell 执行 A9-31 §5 对应完整指定清单：

```sh
npm test --workspace=@win7-agent/state -- --runInBand --runTestsByPath tests/a9-managed-process-ownership.test.ts tests/a9-persistence-contract.test.ts tests/a9-stream-output.test.ts
npm test --workspace=@win7-agent/shell -- --runInBand --runTestsByPath tests/product/a9-background-tools.test.ts tests/product/a9-lifecycle.test.ts tests/product/a9-shell-streaming.test.ts tests/product/a9-audit-integrity.test.ts tests/product/a9-mode-fail-closed.test.ts tests/product/a9-workspace-binding.test.ts tests/product/a9-workbench-contract.test.ts tests/product/a9-preload-capability.test.ts tests/product/a9-package-runtime.test.ts
npm run verify:quick
npm run docs:check
git -c core.fsmonitor=false diff --check
```

State/Shell 新 Windows 用例先在原字节运行，必须出现预期红，再应用修复取得绿；保存首失败，不用修改 mock 代替产品变化。
负向对照包含不同workspace、owner.workspace不符、错误session/task/turn、归档session，以及POSIX大小写差异；已有request不可变/release-intent/terminal及审计失败回归保持。
Core/Runner/release未受影响检查只在原source/依赖/config/hash可核验时记INHERITED_EVIDENCE；verify:quick等项目必需检查不省略。出现新失败按影响扩大，不机械重跑无关全量测试。
交付三个路径准确diff、输入/输出SHA、首红/修复绿日志和更新后的需求证据矩阵。本地通过仅登记本地修复，不签真实Windows/独立审核/DEVELOPER_VERIFIED/Win7 PASS。

## 4. 本次批准范围及后续分界

本次请求仅批准 §2 三路径本地修改、§3 定向/必需检查和修复报告。
不提交、推送、合并或写远端，不创建新用户/目录/任务/服务，不改变ACL/UAC/Job/许可证，不委派，不打Win7候选。
准确源码差异形成后，按 A9-31 §6 单独取得源码提交授权；取得真实source SHA后才形成新开发包及精确新普通桌面合同。旧R10不恢复、不重绑。
本 State 修复不改原生合同：helper和managed锁必须逐字节匹配原批准工件，按影响继承，不新增原生双构建。
新Windows包须直接覆盖修复后的完整后台/退出/恢复链路及相关Shell/脱敏/先落盘再发布；旧Shell/编码直接PASS保留原绑定，不预先改成新包PASS。

需要具体批准的原文依据：R10 §4 “不改产品/native/managed锁”；当前任务 §6 “本任务后续源码提交、原生kit批准/双构建、远端新目录/写入、本地整合与候选门另行具体批准”。本材料不将普通“已启动”回复解释为扩大产品修改范围。

## 5. 具体批准及同路径共性修复（2026-10-04）

负责人明确回复“批准三路径本地修复和规定检查，并且如果可能是共性问题的话，检查一下是否还存在类似的问题，一并修复。”批准原文材料SHA-256 `24bab6cfacb1a40acc476522b9795dc51076a52988d1f93301314a09369a0712`，准确记录在 `.acceptance/a9-31-developer/windows-workspace-repair-r1/owner-approval.json`。
据此仅在上述三路径实施及检查；新增共性修复仍在同一State文件：Windows托管事实查询按等价路径键取回历史记录，保留原始存储；sameWorkspacePath不把POSIX单根路径误当Windows而忽略大小写。对应State用例及Windows Runtime/SQLite集成覆盖，不扩大文件白名单。
其余路径只读检查，canonical输入上的身份全等不机械替换；提交、打包输入绑定、远端新部署、独立复核及候选授权仍按§4。原生/锁不变，R10不恢复。

# A9-31 R8 执行后交接（2026-10-05）

状态：交接文档，不是批准材料，不授权任何实现、远端执行或新根。接手者先读本文，再读
`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、`docs/tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md` 末尾条目（ADR-0173…0178 与 R8 执行结果）。

## 1. 一句话状态

R8 入口已 **HALTED 终止**：StopExit 与 ReleaseExit 各一次 PASS，**Recovery HALTED**（driver 第 13 项 `BACKGROUND_FACTS_ONLY` 失败后收尾超时）。Recovery 的完整证据已取回并校验。**整批 Win10 仍 NOT_PASS**；DEVELOPER_VERIFIED、独立验收、Win7 均未签；**未在 Win7 实机验证**。下一步是负责人裁决，不是继续执行。

## 2. 长期规矩（负责人定的，不要放宽）

- 工作区固定：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支 `codex/a9-31-background-tools`，HEAD `ebda91123e62b225c3fd104c9c9b564a4b61c466`。
- **git 暂存区保持为空**；不提交、不推送、不删除、不结束任何旧进程；不在没有“绑定哈希的明确批准”下创建新根。
- 每个阶段结论必须有直接证据；Win10 开发机结果不得冒充 Win7；与负责人对话一律用中文。
- 矛盾、未裁决的解释一律上报，不自行“就近取一”；影响接口/兼容性/安全模型的选择要在 `docs/DECISIONS.md` 末尾追加 ADR，不改既有 Accepted ADR。
- 实现文件只能写在状态为 `APPROVED_FOR_IMPLEMENTATION` 的任务书允许路径内（AGENTS.md C14）。**R8 期间有若干新增产物最初没有预登记，已在任务书末尾补登记并如实写明偏差**；以后新增路径应先登记。

## 3. 已核实的当前状态（2026-10-05 约 05:00Z 之后，只读核对）

- git：HEAD 如上；index 0 个文件；被跟踪文件仅 5 个文档有改动（`docs/DECISIONS.md`、`STATUS.md`、`STATUS_LOG.md`、`WIN7_CONSTRAINTS.md`、`docs/tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md`）。
- 冻结基线：R5–R8 共 5448 个文件逐 size/SHA 与 Codex 基线零差异（`driver-r1/baseline-check.py`，**R8 执行结束、完整取回之后已重跑：`baseline_files=5448`、`mismatches=0`**；该脚本只覆盖被冻结的 5448 个文件，不含 R8 之后新增的证据文件）。
- Win10 远端：`dispatcher-final.json` 存在且为 `HALTED`；观察器进程 0；R8 产品树已由负责人**手动关闭**；C 盘空闲约 8.5 GiB；R8 入口 PowerShell（PID 100464）窗口仍在（dispatcher 已终止，窗口处置归负责人）。
- 仍存活的旧进程（负责人负责，勿动）：R5 根下的 Electron 107280（子进程 77944、42732）。R6/R7 入口窗口在本次核对时已不存在。
- 远端 SSH 返回 “Bitvise SSH Server evaluation period has ended … only connections from administrators”。当前连接仍正常；这是环境风险，不是已发生的阻断。

## 4. R8 本次执行（driver-r1，新 `normal-short` revision）

- master `0450ccc613b97bfbb8876cb657fd21fbecbc1bd39a409fef489a07d081dfe6cf`（不变）。
- 新 revision `2d38064cb135c87dce3b303152bf227af55515a7ab5771a7e02e98146ca2d5fb`，driver `d1d05dc715874308f2a960a2ed01f31531c06f2d9210e8b12e3cca59c4e82bfe`（= Codex 修复版 `cbeea557…` 仅 `BACKGROUND_SHORT_ONLY` 改为 true），`scripts_digest` `b33fc10bd288610eefd8c2baac6dfb3c251409fe4d90652a9419ee71668e1b34`。旧四个 revision 已登记、字节不变、**不用于请求**。
- 准入：Win10 Electron-as-Node 16.17.1 五项（`--check`、self-test、sync-receipt、late-journal、restart-evidence）退出码 0；schema 336 项 0 失败；完整闭包 stage PASS。
- 批准依据：修订草案 `docs/plans/A9_31_R8_DRIVER_REVISION_AMENDMENT_APPROVAL.md`（SHA256 `5a928e2a22e47ac3b822acd164633f5f84f1609265999d02d27c2f8f09f46e6f`），R8 合同 r2（`eb9b1c76e0b87fc8626ca14c8272ec6e7d2bce3ffa8e5a738586e45c8590e21b`）其余条款继续有效。

| phase | request_id | 结果 | 直接证据 |
|---|---|---|---|
| StopExit | `a9599b32ceef44cb9d80082b7b0412b4` | PASS（一次） | 对话框 04:37:05.510Z 打开、04:37:09.067Z 返回，3.557 s，`response=0`；driver 15 项；16 实例全退出；观察器 VERIFIED；完整取回 69 文件/7,681,953 字节，秘密扫描 0；`review-phase.py` PASS |
| ReleaseExit | `0de38ba0014c4febb0cc0a9db3933ded` | PASS（一次） | 04:40:48.438Z→04:40:51.718Z，3.28 s，`response=1`；driver 32 项（含 lost/pending/stop-before-release 三个放行边界）；35 实例全退出；观察器 VERIFIED；完整取回 112 文件/7,905,067 字节，秘密扫描 0；评审 PASS |
| Recovery | `0da51c4c79134b2d904cc7ce5d51a652` | **HALTED** | 见 §5；完整取回 88 文件/9,484,576 字节逐 SHA 一致、秘密扫描 0（`return-recovery-r8-full/`，取回发生在负责人手动关树之后） |

入口 `dispatcher-final`：`HALTED`，`LIFECYCLE_PINNED_TREE_UNKNOWN`，requests 3、results 2，04:55:03Z。三个 phase 的 `query_failures` 均为 0、`manifest_proofs` 均为 0。

## 5. Recovery 失败的事实与推断

**直接事实**
- 真实崩溃重启首次执行成功推进：R5 的 `EEXIST` 没再出现；`RESTART_SAME_CONVERSATION`、`RESTART_EVENT_IDENTITY_ONCE`、`CRASH_NO_FAKE_TERMINAL`、`RESTART_DOM_OUTPUT_ONCE` 四项通过（第一次在真实 Electron 下验证重启命名修复）。
- 第 13 项 `BACKGROUND_FACTS_ONLY` 失败。driver 断言（`product-r3-driver.cjs` 第 330 行）：`managedProcesses.length===1 && 每项 lastProbeStatus==='exited' && helpers.length===0`。实际句柄：`lastProbeStatus='cleanup_required'`、`recoveryStatus='exited'`、`cleanupRequired=true`、`pidReusePossible=false`，后台进程 PID 35788 已不存在。失败时截图（`recovery-halt-inspect-r8/first-failure-restart.png`）显示“后台运行 1”“已锁定：当前对话仍有托管后台进程”。
- driver 的 `failure product stop` 超时（`cleanup_error=TIMEOUT:failure product stop`）；控制器写 `HALTED_UNKNOWN_RETAINED` / `LIFECYCLE_RESTART_TIMEOUT`（退出码 93）、`controller-abort`（`LIFECYCLE_CAPTURE_FAILED`）。重启产品树（PID 16064 及 130832、43080、68788）此时仍存活，观察器因此 `OBSERVER_FINAL_NOT_VERIFIED`——**唯一未通过项是 `no_open_instances`**，其余 11 项通过（60 事件，无丢失）。
- 完整取回的 SQLite 副本：`a9_managed_processes` 仅一行 `sh-1791175540859-9aa57540`/pid 35788/`cleanup_required`；`a9_workspace_locks` 仍有 `owner_id=main-16064`（04:45:44.147Z 获取，未释放）；第二个 turn 为 `interrupted`，重启后无 `tool_end`。
- 关树方式：负责人口述“手动关闭的进程”，无对话框 `response` 或其他证据——**不得当作任何按钮/Esc 的实测结果**。

**源码阅读推断（未经裁决，不是结论）**
- `src/runner/src/background-process-manager.ts` 的 `adoptRecoveredFact` 在恢复时带回持久化的 `cleanupRequired`；`src/state/src/a9-persistence.ts` 的 `recordManagedProcess` 在 `cleanupRequired===true` 时写 `cleanup_required`；`src/shell/tests/product/a9-lifecycle.test.ts` 有测试 “keeps persisted helper cleanup uncertainty visible and blocks clean exit after restart”。据此，**产品可能是有意保留该状态并阻止干净退出，driver 的 `exited` 预期可能与设计不一致**。
- “产品为什么没有退出”没有直接证据；上述测试覆盖的是进程仍存活的场景，本次是 PID 已死、`cleanupRequired` 仍带回的场景，二者是否等价**未验证**。

## 6. 跨根证据构成（不得合并成“整批通过”）

| phase | 曾有 PASS 的根 | 说明 |
|---|---|---|
| Boot | R5、R6 | 旧控制器/driver 字节 |
| Background(short/full)、ready-negative(预期失败)、Shell | R6 | R6 字节 |
| EncodingSecurity、FailureBoundaries | R7 | R7 字节；EncodingSecurity 是 R6 HALT 的 phase，本次未命中 87 缺口 |
| StopExit、ReleaseExit | R5（旧字节）、**R8（修复版 driver）** | R7 的 StopExit 曾两次超时 FAIL、一次点错 HALT |
| Recovery | **任何根都没有 PASS** | R5：JS `EEXIST` 弹窗致重启超时 HALT；R8：重启成功但第 13 项失败 |

各根矩阵：`.acceptance/a9-31-developer/product-r3-retry-r{5,6,7}/win10-evidence-matrix-r*.json`（均为 `PARTIAL_NOT_PASS`）。**R8 的矩阵 `win10-evidence-matrix-r8.json` 尚未写**，统一报告 `docs/reports/2026-10/a9_31_r5_manifest_proof_handoff_2026-10-05.md` 也还没有 §12（R8 结果）——这是待办。

## 7. 仍未验证（不要声称）

- 新 conhost 证明分支（`MANIFEST_CONHOST_INSTANCE_EXIT_V1`）：R5–R8 活 phase 中从未被真实触发（R8 三个 phase 均 `manifest_proofs=0`）。
- Esc/取消对原生退出对话框的后果（ADR-0176 保守按 HALT、不重试）。
- Recovery PASS；Recovery 预期与产品行为谁对。
- Win7、独立验收、DEVELOPER_VERIFIED（未签）；整批 Win10 NOT_PASS。

## 8. 待负责人裁决（接手者不得自行决定）

1. **Recovery 预期问题**：产品缺陷，还是 driver 预期有误（两种解释的修改范围、风险、证据不同；需另建任务书并追加 ADR）。
2. **是否为 Recovery 申请新根**：R8 不可重试；新根需另行的、绑定哈希的批准，并按 R6/R7/R8 惯例走“准入→冻结→一个根一个入口”。
3. 若继续：我上一轮提议的下一步是先起草 `DRAFT_NOT_APPROVED` 的裁决材料，把两种解释各自的修改范围、已有证据、风险并列；**负责人尚未回复是否起草**。
4. 其余：R5 遗留 Electron 与 R8 入口窗口的处置归负责人。

## 9. 工具与踩坑（接手者省时间）

- 目录：`.acceptance/a9-31-developer/product-r3-retry-r8/`。关键脚本：`remote-actions.py`（ssh/sftp 封装，**同一 label 不可复用**，复用会 `AssertionError`；失败尝试的记录要保留，换新 label 重跑）、`desktop-execution.py status`（核对入口身份）、`driver-r1/r8-driver-phase.py start|finish`、`driver-r1/click-phase.sh <StopExit|ReleaseExit> normal-short 45 <tag>`、`phase-summary.py`、`return-one-run.py <rid> <label>`（运行目录被产品占用时会失败）、`return-partial-evidence.py`（只取 evidence/signals）、`review-phase.py`（需要 `ordinary-entry-confirmed.json`）、`driver-r1/baseline-check.py`（只读 5448 文件基线）。
- Python：用 `/usr/bin/python3`（3.9）。**stdin heredoc 里写中文会报 “Non-UTF-8 code … no encoding declared”**，且整段不执行；改为写成带 `# -*- coding: utf-8 -*-` 的脚本文件，再 `exec(compile(open(p,encoding='utf-8').read(),p,'exec'),{'__file__':p,'__name__':'__main__'})`。3.9 没有 `Path.write_text(newline=)`。
- zsh：未加引号的变量不会分词；`grep --include=*.js` 在无匹配时 zsh 会报错，改用 `grep -rn … src | grep -v tests`。前台 `sleep` 被阻止时用短循环或后台命令。
- 点击协议（ADR-0176）：负责人说“就位”→代理报**单个**按钮和发布时间→固定 45 s 提前量→负责人点→耗时与 `response` 一律取证据（`native-exit-dialog-opened-*.json`/`choice-*.json`）计算。StopExit 要 `response=0`（第一个“停止后退出”，回车也行）；ReleaseExit 要 `response=1`（第二个“留给系统后退出”，必须鼠标点，回车会选错）；超时是 FAIL 可重试至多 3 次；点错是硬门 HALT，不重试；“不确定就不点”。
- 本机无 computer-use、无 Codex 通道；Win10 屏幕只能靠负责人描述/截图。

## 10. 关键文件速查

- 任务书末尾条目（R8 修订、实施、执行、完整取回、关树方式）：`docs/tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md`。ADR：`docs/DECISIONS.md` ADR-0173…0178。
- R8 合同与批准：`docs/plans/A9_31_R8_EXIT_PHASES_AND_CLICK_PROTOCOL_APPROVAL.md`、`docs/plans/A9_31_R8_DRIVER_REVISION_AMENDMENT_APPROVAL.md`。
- Codex 复核与修复：`docs/reports/2026-10/a9_31_r8_pre_run_review_request_2026-10-05.md`、`.acceptance/a9-31-developer/r8-review-repair-r1/`。
- 本次新证据：`return-stopexit-r8-1/`、`return-releaseexit-r8-1/`、`return-recovery-r8-full/`、`return-recovery-r8-partial2/`、`recovery-halt-inspect-r8/`、`phase-*-r8-*.json`、`observer-<request_id>-*`、`requests/`。
- 项目记忆：`/Users/qlyf/.claude/projects/-Users-qlyf-Developer-win7-coding-Agent/memory/project_a9_31_r5_state.md`。

## 11. 可直接粘贴给下一个对话的开场

> 接手 A9-31。先读 `docs/reports/2026-10/a9_31_r8_execution_handoff_2026-10-05.md`、`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md` 和任务书末尾条目。当前状态：R8 入口已 HALTED，StopExit/ReleaseExit 各一次 PASS，Recovery HALTED（第 13 项 `BACKGROUND_FACTS_ONLY`，期望 `exited`、实际 `cleanup_required`），整批 Win10 NOT_PASS，未在 Win7 实机验证。我还没有回复是否起草裁决材料。规则：不提交/推送/删除/结束旧进程，git 暂存区保持为空，没有绑定哈希的批准不建新根，每个结论要有直接证据，用中文回复。先只读核对：HEAD、暂存区、`baseline-check.py`、远端 `dispatcher-final`，然后等我的指示。

# A9-22 — WIN7-38 换发与实机验收（A9-20 + A9-21）

```text
Status: COMPLETE
Task Type: RELEASE_REISSUE_AND_WIN7_ACCEPTANCE
Target Branch: codex/a9-alpha2
Source Baseline: codex/a9-alpha2（本任务书所在提交；A9-20、A9-21 M0～M4 均已并入）
Candidate: WIN7-38
Phase-Gate: A9_22_WIN7_38_VALIDATION_KIT_DEFECT_NOT_PASS
Win7-Validation: WIN7_38_G2_FAILED_VALIDATION_KIT_DEFECT
Decision: ADR-0141, ADR-0142
```

> 2026-09-26 负责人授权以当前主线换发新候选并在 Win7 实机验收（连通性已于同日只读核实：`192.168.1.3` 返回 `6.1.7601`）。
> 本任务书是 WIN7-38 的正式实施入口。批准本任务书不等于候选外 authority 或实机 PASS：候选冻结、ZIP 精确哈希确定后，
> 仍须负责人另行签发候选外 `WIN7_38_RELEASE_AUTHORITY`；实机结论由负责人在审核后裁决。

## 1. 背景与起点

- 已签发的最新候选为 WIN7-37（`A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`，源码 `dd6cb1a`，ZIP `4d700632…f167cf`），不含 A9-20、A9-21。
- A9-20（Git 确认分类器绕过修复，ADR-0137/0140）为 `A9_20_DEVELOPER_VERIFIED`；[STATUS](../STATUS.md) 已记“需另行批准换发合同（建议 WIN7-38）”。
- A9-21（启动定向恢复、脱敏正则线性化、模型输出上限、checkpoint 分页、事件与被拦截请求上限）M0～M5 完成，开发机全量测试通过；
  §5 第 6 项“真实 Electron 启动与完整任务回归”由本任务的 Win7 实机运行取代（负责人 2026-09-26 决定，本机 Electron 包已缺失）。
- WIN7-37 的换发合同与交接书是本任务的模板：[换发合同](../plans/A9_19_WIN7_37_REISSUE_PROPOSAL.md)、
  [实机交接书](../plans/A9_19_WIN7_37_ACCEPTANCE_HANDOFF.md)、[A9-19 任务书 §13～§15](A9_19_LIVE_PROGRESS_AND_WORKBENCH_LAYOUT.md)、
  [WIN7-37 收口报告](../reports/2026-09/a9_19_win7_37_live_progress_acceptance_2026-09-25.md)。

## 2. 身份与边界

1. 编号 `WIN7-38`。版本与可执行能力集沿用 `WIN7-CODING-AGENT-A9-ALPHA1` / `0.3.0-alpha.1`（与 WIN7-37 一致）；Review 入口继续 fail-closed，
   Shell 运行中增量输出不开放。
2. 产品源码为本任务书所在提交的 `codex/a9-alpha2`。**本任务不新增产品改动**；构建、预检或实机暴露产品缺陷时，停止并报告，另立任务修复，
   不在换发过程中顺带修改。
3. 结论上限：`A9_22_WIN7_38_A9_20_A9_21_PASS`（覆盖 §4 用例）。不重签 WIN7-22/28/36/37 的既有结论；不签发 Alpha 2、Review、
   Shell streaming 或 RC PASS。
4. 其余硬门与 WIN7-37 相同：双独立干净工作树构建、ZIP 逐字节一致；候选外 authority 与独立 SHA-256 pin；实机以普通用户 `agent`
   Medium 非提升运行；证据结构化并带哈希；秘密扫描零命中；后飞行零残留。

## 3. C14 允许路径

- 发布管线：`scripts/release/build-a9-product-v3.mjs`（新增 `A9-22-INPUTS-WIN7-38` profile 与候选集合登记）、
  `scripts/release/test/a9-package.test.mjs`（W38 正向与旧键反例）。
- `release/win7-product-v3/` 下新增：`a9-22-win7-38-input-lock.json`、`a9-package-integrity-w38.cjs`、`a9-win7-38-report.cjs`、
  `a9-win7-38-smoke.cjs`、`RUN_A9_22_W38_INTEGRITY.cmd`、`RUN_WIN7_38_REPORT_VERIFY.cmd`、`A9_22_WIN7_38_VALIDATION.md`；更新该目录 `README.md`。
  不得修改 WIN7-37 及更早的任何发布文件。
- 实机自动断言：`src/shell/tests/product/a9-06-driver-entry.cjs`（仅新增 W38 旅程；既有旅程与历史键语义不变）；
  如需测试夹具（例如本地回环模型桩、历史数据种子），只在 `release/win7-product-v3/` 的 W38 新文件或 `src/shell/tests/product/**` 内新增。
- 文档：本任务书、`docs/tasks/README.md`、`docs/STATUS.md`、`docs/STATUS_LOG.md`、`docs/plans/A9_22_WIN7_38_ACCEPTANCE_HANDOFF.md`（新建）、
  `docs/DECISIONS.md`（仅 ADR-0141）、`docs/DECISIONS_INDEX.md`、`docs/reports/2026-09/**`、A9-20 与 A9-21 任务书的状态记录段。

## 4. 用例（W38）

执行方在 §5 第 1 步把每条用例细化为可执行步骤、判定条件与证据文件名，写入实机交接书；无法在不改产品的前提下于 Win7 触发的用例，
标 `NOT_PERFORMED` 并写明原因，不得以开发机结果代替。

| 组 | 编号 | 内容 | 判定要点 |
|---|---|---|---|
| G1 基线 | W38-01～03 | 候选完整性、安装/解压到中文+空格路径、首次启动与工作区选择 | 沿用 WIN7-37 G1 的方式与判定 |
| G2 回归 | W38-04～06 | 一次完整任务：read/edit/Shell、Diff、审批拒绝零副作用、停止与子进程回收、重启后恢复 | 沿用 WIN7-37 旅程，结果与 W37 一致 |
| A9-20 | W38-07～09 | `cmd /c"git push …"`、PowerShell 参数前缀、`powershell "git push …"` 等 A9-20 登记的绕过形式均触发目标绑定确认；拒绝后零副作用 | 以 A9-20 任务书登记的样例为准 |
| M1 | W38-10 | 预置不少于 100 个历史 Turn（含 1 个中断且缺 checkpoint 的 Turn）后启动：启动耗时、定向恢复结果 | 记录耗时；中断 Turn 按 M1 规则恢复或记为 missing/quarantined |
| M1b | W38-11 | 工作区含 1 MiB 单行十六进制文件时冻结基线与检查点不卡顿；诊断/事件中的 `https://u:p@host` 被脱敏 | 冻结耗时在秒级以内；证据中无明文凭据 |
| M2 | W38-12 | 本地回环模型桩返回超过 1 MiB 的内容：截断说明可见，工具不执行，轮次为 `COMPLETED_WITH_WARNINGS`；下一轮请求正常 | 以界面与持久化结果共同判定 |
| M3 | W38-13 | 预置 60 条以上 checkpoint：检查器显示“最近 10 / 共 N”，加载更早记录连续，对更早记录执行 Diff | 界面与 IPC 结果一致 |
| M4 | W38-14 | 长任务或预置事件超过 2000 条：界面提示释放数量，过程记录连续，内存不随事件数无限增长 | 提示文案与计数；Renderer 内存采样 |
| 收尾 | W38-15 | 秘密扫描、后飞行零残留 | 零命中、零残留 |

## 5. 执行步骤与门

0. **恢复构建输入（需负责人明确同意下载）**：WIN7-37 输入锁的三个输入中，Electron zip（`.acceptance/deps/electron/`、`spikes/*/build-win10/kit/inputs/`，
   SHA-256 `ad723ed7…`）与 D-013 helper 返回包（`.acceptance/deps/d013-v25-r15/`，`7485cf22…`）在本机；A6 SQLite 返回包
   `WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip`（`2cb0cd324bb449fb5457549addd3e7f8f0610d6258415309ee748fb279a72794`，98,096,648 B）
   已于 2026-09-25 加密归档至 GitHub 私有仓库 `allin2/win7-coding-agent-archives` 的 release `archive-20260925`，本机只剩 `A6/*.sha256`。
   恢复方法：用 `gh release download archive-20260925 --repo allin2/win7-coding-agent-archives` 只下载
   `legacy-builds--a6-sqlite-artifacts-zip.tar.gz.enc`（97,885,728 B，`5790a93ee1bbbf20…`）与 `legacy-builds--shared-objects.tar.gz.enc`（320 B）到会话临时目录；
   用本机 `~/.codex/win7-archive-20260925/repo/restore_snapshot.py`，以 `~/.codex/win7-archive-20260925/catalogs/catalog-legacy-builds.json` 为 catalog、
   `--candidate a6-sqlite-artifacts-zip`、`--key ~/.codex/archive-keys/win7-a9-20260911.key` 恢复；工具逐级核对哈希。恢复出的 zip 必须等于上面的 SHA-256，
   放到 `.acceptance/deps/a6/`，下载件与中间文件在完成后删除。**不得读取、输出或复制密钥内容**，只以路径传给恢复脚本。任何哈希不符即停止。
1. **合同细化（新会话）**：按 §4 写实机交接书 `docs/plans/A9_22_WIN7_38_ACCEPTANCE_HANDOFF.md`（结构仿 WIN7-37 交接书：分工、开始条件、
   候选身份、环境与连接、步骤、用例、硬停止条件、交回格式、审核清单），补 ADR-0141 的实施细节（如需）。
2. **管线与测试**：在 §3 允许路径内新增 W38 profile、输入锁、完整性/报告/冒烟脚本与测试；`node --test scripts/release/test/a9-package.test.mjs`
   及受影响包测试通过。
3. **候选冻结**：从同一提交在两个独立干净工作树构建，ZIP 逐字节一致；记录 ZIP、`release-manifest.json`、输入锁、`electron.exe` 等 SHA-256；
   用候选自带校验拒绝错误哈希与错误 pin。写入本任务书 §7 与交接书 §3。
4. **门 A：负责人签发 `WIN7_38_RELEASE_AUTHORITY`**。新会话准备 authority 草稿（绑定源码提交、ZIP、manifest、输入锁、用例清单、
   目标主机 `192.168.1.3`、run-id）与独立 pin，**停在此处等负责人在对话中明确签发**；未签发不得部署或运行。
5. **实机执行**：按交接书部署并运行 W38 用例，普通用户 `agent`；证据存本机 `.acceptance/runs/A9-22-W38/<run-id>/`，全部计算哈希。
   遇 §4 以外的异常或硬停止条件即停止并交回。
6. **审核**：由另一会话（或本任务的审核方）基于原始证据独立复核，给出签发建议。
7. **门 B：负责人裁决**是否签发 `A9_22_WIN7_38_A9_20_A9_21_PASS`（可部分签发，未覆盖用例保持原状态）。
   裁决后更新本任务书、STATUS、STATUS_LOG；A9-21 任务书按结果把 §5 第 6 项记为 Win7 实机覆盖，A9-20 任务书记录 Win7 结论。

## 6. 约束

- 先读 `AGENTS.md`、`CLAUDE.md`、`docs/WIN7_CONSTRAINTS.md`、本任务书与 §1 所列模板；文档之间或与仓库现状矛盾时停止并列出矛盾清单。
- SSH 只用仓库 `.acceptance/ssh/` 下的私钥与 known_hosts，`-o HostKeyAlias=192.168.1.11` 严格核对主机键；不得读取、输出或复制私钥内容。
- 除候选部署与用例运行所需外，不在验收机上改系统设置、注册表、服务或安装软件；不提权。
- 除 §5 第 0 步经负责人同意的私有归档下载外，不联网下载任何依赖；构建只用输入锁登记且哈希一致的工件。
  若构建需要未锁定或缺失的其他工件，停止并报告。
- 开发机结果不得写成 Win7 通过；证据中不得出现秘密。本地提交，不推送。

## 7. 候选身份（冻结后填写）

- 管线提交 `874f541f61442f0fce803e8a30bbbaed07743525`（单一本地提交，未推送、未打标签），只含 §3 允许路径：新增 profile `A9-22-INPUTS-WIN7-38`、
  input lock、15 项 Kit、完整性/报告/smoke、两个 CMD 与验证说明；共享驱动只新增 `w38` 旅程。开发机门：`a9-package.test.mjs`（含 W38 闭包与
  注入 W37 残留的反例）、`verify:quick`、`docs:check`、`git diff --check` 全部通过。
- 双独立干净工作树（依赖以 APFS 克隆逐字节复制）从同一提交构建，ZIP 逐字节一致（`cmp`），101,379,887 B：

| 项 | SHA-256 |
|---|---|
| 候选 ZIP `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip` | `105531bf3cdd632f382ae466a1ae23e36b220f1cc519a8ca74b4fc8c3d1e0b22` |
| `release-manifest.json` | `2a3d802a87a5fe89426a88e66fa97a2fad1b09449f033d5279828cc7cf1072d4` |
| input lock `a9-22-win7-38-input-lock.json` | `60b65e5c5c93777c2366c49e4d9edfc728939577cc46425a24c7703c8c2d2fa6` |
| approval registry `a9-v25-approved-kits.json`（commit `e1b6f4bf30ad2ae7576aa958317e0aea6f4338d3`） | `d9cfea73c2f89c01a33a2bbef1d65c27eb995cd3681c71a939183348744917b7` |

- manifest `source_dirty=false`、`external_acceptance_eligible=true`，790 个文件；Kit `A9-22-WIN7-38-20260926-01`（15 项）。
  开发机预检以候选自带 `verifyAcceptanceCandidate` 对完整文件树与测试夹具 authority 接受正确绑定，并拒绝错误 ZIP 哈希
  （`A9_W38_RELEASE_AUTHORITY_BINDING_INVALID`）与错误 pin（`A9_W38_AUTHORITY_PIN_MISMATCH`）；测试夹具不构成批准。
- 冻结于本机 `.acceptance/candidates/WIN7-38/`（含 `IDENTITY.sha256`），双构建输出在 `.acceptance/builds/WIN7-38/874f541-reissue/`，临时工作树已移除。
- 当前停在候选外 `WIN7_38_RELEASE_AUTHORITY` 门：负责人按上表精确哈希与实际 Win7 地址签发 authority 与独立 SHA-256 pin 之前，
  Win7 G1/G2/G3 均 `NOT_PERFORMED`。

## 8. 执行记录

- 2026-09-26：按第 0 步核对 A6 SQLite 返回包哈希，所有三项原生与环境输入（Electron zip、D-013 v25 helper、A6 SQLite zip）就绪。
- 2026-09-26：细化 15 项 W38 用例，编写实机交接书 `docs/plans/A9_22_WIN7_38_ACCEPTANCE_HANDOFF.md`。
- 2026-09-26：在 C14 允许路径内新增 W38 发布管线、驱动旅程与测试；测试通过并提交为 `874f541`。
- 2026-09-26：从提交 `874f541` 在两个独立干净工作树中完成双构建，ZIP 逐字节一致，冻结候选于 `.acceptance/candidates/WIN7-38/`。
- 2026-09-26：准备 `WIN7_38_RELEASE_AUTHORITY` 草稿与独立 SHA-256 pin 于 `.acceptance/runs/A9-22-W38/31504dc1-8371-4381-a2ea-67ab2b9ce411/authority/`，等待负责人签发。
- 2026-09-26：候选外 authority（SHA-256 `55bf8074…584f`，run-id `31504dc1-8371-4381-a2ea-67ab2b9ce411`，目标 `192.168.1.3`）
  记载负责人批准时间 `2026-09-26T05:15:00Z`；签发对话记录待负责人补录。
- 2026-09-26：外部执行方按交接书实机执行。G0/G1 完成（G1 `status=PASS`，agent Medium）；G2 smoke 退出码 1、`status=FAIL`
  （`MODULE_NOT_FOUND`，产品入口未加载），5 个 `electron.exe` 残留经人工强制终止；按硬停止条件未执行 G3。候选与仓库未被改动。
- 2026-09-26：审核方基于原始证据复核，根因为候选内 smoke 未传 `A9_SMOKE_PRODUCT_MAIN`，另有恒真断言与残留检测缺陷；
  见[审查报告](../reports/2026-09/a9_22_win7_38_acceptance_review_2026-09-26.md)。
- 2026-09-26：负责人裁决（ADR-0142）：WIN7-38 记为 `A9_22_WIN7_38_VALIDATION_KIT_DEFECT_NOT_PASS`，不签发任何用例；
  本任务关闭，修复套件与换发 WIN7-39 由 [A9-23](A9_23_WIN7_39_REISSUE_AND_ACCEPTANCE.md) 承接。WIN7-38 发布文件与 W38 驱动旅程保持冻结。

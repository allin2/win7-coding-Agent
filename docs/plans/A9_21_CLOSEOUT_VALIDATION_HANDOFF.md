# A9-21 收口验证交接书：gateway 偶发失败排查

> 执行方：新会话。授权依据：[A9-21](../tasks/A9_21_A9_18_SALVAGE_PORT.md) §5 第 5、6 项与 §6。
> M0～M5 已全部完成并并回 `codex/a9-alpha2`（见任务书 §8）。**第 2 版（2026-09-26）**：本交接书只做 §5 第 5 项（gateway 偶发失败）；
> 第 6 项改由 Win7 实机覆盖：原定 A9-22 / WIN7-38（ADR-0141），WIN7-38 以验证套件缺陷不通过后改由 A9-23 / WIN7-39（ADR-0142）。

## 1. 当前状态

- 代码：`codex/a9-alpha2` 已含 M1～M4 全部改动；主工作区各包已构建，state 305、workspace 213、gateway 263、core 371、shell 447 项通过
  （2026-09-26，开发机 macOS arm64、Node 20.17）。
- 任务书头部 `Phase-Gate: A9_21_IMPLEMENTATION_AUTHORIZED`、`Win7-Validation: NOT_PERFORMED`。
- 仍开放的 §5 项：
  - **第 5 项**：A9-18 移植试验中 gateway 测试 10 次中 1 次失败，未捕获用例名。M2 期间执行方与验收方共连续运行 60 次（每次 263～266 项）未复现，原因未定位。
  - **第 6 项**：真实 Electron 启动与一次完整任务回归，未执行。
- 已知遗留（不在本交接书处理）：`main.js` 的 `deniedPermissions` 无上限；快照中 `listConversationFacts` 随 checkpoint 总数增长。

## 2. 第 6 项：改由 Win7 实机覆盖（现为 WIN7-39）

2026-09-26 负责人决定：§5 第 6 项不在开发机下载 Electron 运行，改由 [A9-22](../tasks/A9_22_WIN7_38_REISSUE_AND_ACCEPTANCE.md)
（WIN7-38 换发与 Win7 实机验收，ADR-0141）覆盖；WIN7-38 结论为 `A9_22_WIN7_38_VALIDATION_KIT_DEFECT_NOT_PASS` 后，按 ADR-0142 改由
[A9-23](../tasks/A9_23_WIN7_39_REISSUE_AND_ACCEPTANCE.md)（WIN7-39）覆盖。本交接书只执行下面的第 5 项；不要下载 Electron，也不要运行开发机 Electron 冒烟。

## 3. 第 5 项：gateway 偶发失败

**与 WIN7 候选换发并行时的隔离（2026-09-26）**：A9-23 / WIN7-39 的套件修复在工作树 `win7-coding-agent-w39-kit`（分支 `codex/a9-23-w39-kit`）进行，
文档与并回在主工作区 `codex/a9-alpha2`；本项必须在另一个独立工作树与分支中执行，
例如 `git worktree add ../win7-coding-agent-gwflake -b codex/a9-21-gateway-flake codex/a9-alpha2`；`node_modules` 可用符号链接复用主工作区，
各包 `dist` 在本工作树内构建。所有提交只进该分支，**不得合并到 `codex/a9-alpha2`**，由负责人在 WIN7-39 候选冻结后决定是否并回；
需要修改产品源码时同样只在该分支，且不进入 WIN7-39。人为 CPU 负载组尽量避开 WIN7-39 的管线测试与双构建阶段；如无法确认，
在报告中写明负载时段，便于区分对方的测试失败是否受负载影响。


1. 在本项独立工作树的 `src/gateway` 用 `npx jest --json --outputFile=<临时目录>/run-N.json` 连续运行，至少 200 次：其中 100 次空载，100 次在人为 CPU 负载下
   （例如同时运行若干个 `node -e "for(;;){}"` 并在结束后全部终止，或用 `--maxWorkers` 变化制造并发差异）。每次记录通过数与失败用例名。
2. 若复现：按失败用例定位根因（时序、端口、超时、共享状态等），在 A9-21 §4 允许的 `src/gateway/tests/**` 或 M2 允许的 gateway 源文件内修复，
   修复后同样条件下再连续运行不少于 200 次无失败；负向对照证明修复前可复现。
3. 若 200 次仍不复现：如实记录运行条件、次数与结果，结论写“未复现、原因未定位”，不得写成“已排除”。此时由负责人决定是否以该结论关闭第 5 项。
4. 负载进程与 jest 进程在结束前必须全部终止（确认 `pgrep -fl jest` 与负载进程为空）；不要与其他包的全量 jest 并行。

## 4. 记录与 Phase-Gate

- 结果写入任务书 §8（新小节“收口验证”）、`docs/STATUS.md`、`docs/STATUS_LOG.md`；证据文件在会话临时目录，文档中记录路径与 SHA-256，
  并注明临时目录可能被系统清理。
- 本交接书只记录第 5 项结果，不改 `Phase-Gate`。`A9_21_DEVELOPER_VERIFIED` 须待第 5 项结论（复现并修复，或负责人接受“未复现”）
  与第 6 项（WIN7-39 实机结果）都具备后，由负责人决定；`Win7-Validation` 随 WIN7-39 裁决更新。
- 只在本项独立分支上本地提交，不推送、不合并；提交只包含本次相关路径。文档记录（任务书 §8、STATUS、STATUS_LOG）也写在该分支，并回时再合入。

## 5. 约束

- 先读 `AGENTS.md`、`CLAUDE.md`、`docs/WIN7_CONSTRAINTS.md` 与 A9-21 任务书；文档之间或与仓库现状矛盾时停止并列出矛盾清单。
- 使用 Node 20.17（`export PATH="$HOME/.nvm/versions/node/v20.17.0/bin:$PATH"`）。
- 不下载、不安装任何东西，不联网。
- 不删除 `outputs/`、其他分支或工作树中的内容。
- 开发机结果不得写成 Win7 通过。

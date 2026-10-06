# A9-31：Shell Policy P1修复（r6）源码提交材料

日期：2026-10-06。Status: DRAFT_NOT_APPROVED。请求批准一次**本地**源码提交；不含推送、合并、改写历史、打包、Win10/Win7执行或阶段门登记。
新包与Win10重验另起材料。未在Win7实机验证。

## 1. 对象与前置条件

- 工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`，准确父提交
  `ebda91123e62b225c3fd104c9c9b564a4b61c466`，index为空。
- 只提交下表三个路径，字节即r6交付并经独立审核的版本（[修复报告](../reports/2026-10/a9_31_policy_p1_repair_2026-10-05.md) §10、任务书“原对话对r6的独立只读审核”条）：

| 精确路径 | SHA256 | git blob |
|---|---|---|
| `src/core/src/policy.ts` | d06b03e02209487348a5aea4bf3baec7f74151fb325104cbe8b2e485a028513e | 27e27b297e132ffdb22acd20f6a2422b27349d5b |
| `src/core/tests/policy.test.ts` | 881878eab144590e862f8a54a1d0fa73c48a8ed3dffba7dd378d68f98be286ba | c3aa1e2ccc3146e04ffe7203d9ecd02c392ea619 |
| `src/core/tests/a9-background-tools.test.ts` | a05e54938fc84a4f379994b2ce5f04fb4cd06b0626ec8427d60adbf4807502a3 | 22b14ffd2bc1d1403aecd6aef9c66073c05f7c40 |

- 拟提交补丁：`git diff --binary ebda911 -- <上表三路径>`，SHA256 `1bcf9af356b97355113028c9ccb85d034cd8ed756f8a7f924701a8ccfd8b1133`（3文件，+389/−12）。
- 这些字节上已有的验证：r6 §5全量（先构建）全部退出码0（Core 535、Runner 166、State 82、Shell 117、release 200通过/2 Windows专项SKIP）；
  两测试文件355/355；HEAD ASK→r6非ASK为0（我方858条＋对方5,122/13,878构造）；27个已报告反例全部ASK；独立表达式与普通命令语料误确认0。
- 负责人在r6审核后指示起草本材料，视为对ADR-0184收敛标准下收口的确认；若仍要求Codex对r6再复核，请在批准前说明，届时本材料暂停。

## 2. 提交步骤（批准后执行）

1. 先在任务书登记本次C14证据路径（§4），再重核HEAD、分支、index为空，三文件SHA与上表一致，重新生成的补丁SHA等于`1bcf9af3…`。任一不符即停。
2. 记录提交前其余dirty与untracked文件逐hash清单（当前`git status --porcelain`共80项，其中9项为受跟踪改动，含本三文件）。
3. 只逐个`git add`上表三路径；核对`git diff --cached --binary`的SHA等于`1bcf9af3…`、staged文件恰为三项。
4. 执行一次本地普通提交，作者沿用仓库配置，提交信息：

   ```
   fix(core): confirm ambiguous shell quoting and variable dispatch under control flow

   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   ```

5. 提交后核对：新提交父为`ebda911…`、仅三路径、三blob与上表一致、index为空、工作区三文件hash不变；其余dirty/untracked逐hash与提交前一致；
   R5–R8冻结5448文件基线0差异。结果写入任务书。
6. 治理文档（任务书、DECISIONS、报告、计划）、生成dist、候选、输入与全部历史证据**不进入**本次提交。不推送、不合并、不改写历史。

## 3. 提交后的影响

产品源码由`ebda911`变为新提交；R5–R9的Win10证据与组合结论（ADR-0180）绑定的是`ebda911`装配的包，对新源码失去直接绑定。按增量验证矩阵，
除Boot外经工具派发的phase需在由新提交装配的新包上重跑；该新包与Win10重验另起材料批准。DEVELOPER_VERIFIED在新包Win10重验通过前不登记。

## 4. C14（批准后、执行前登记）

证据目录`.acceptance/a9-31-developer/policy-p1-source-commit-r1/`：`pre-commit-status.json`、`proposed.patch`、`staged.patch`、`source-commit-result.json`。
批准须按本稿SHA256绑定。

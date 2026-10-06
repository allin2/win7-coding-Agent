# A9-31：分支推送到 origin（新远端分支，不建PR、不合并）

日期：2026-10-06。Status: DRAFT_NOT_APPROVED。请求批准把本地分支`codex/a9-31-background-tools`推送为`origin`上的同名新分支。
**`origin`=`https://github.com/allin2/win7-coding-Agent`为公开仓库（`gh repo view`：PUBLIC）**，推送即公开，事后删除分支也可能已被缓存或克隆。
不含PR、合并到main、标签、发布或改写历史；未在Win7实机验证。

## 1. 直接事实（2026-10-06只读核对）

- 本地：分支`codex/a9-31-background-tools`，HEAD `2b6f3e22301b5b8a9e3593256eb5a3fccfa2a811`，无上游；仅任务书有一条未提交结果条目，另有本稿未跟踪。
- 远端（`git ls-remote --heads origin`）：`main`=`c14a968`、`codex/a9-alpha2`=`f3b5915`、`phase/02-readonly-agent`、`prototype/full-agent-skeleton`；**无同名分支**。本地`main`=`c14a968`。
- 推送范围：`c14a968..2b6f3e2`共**25个提交**（232文件，+32947/−260），`c14a968`是其祖先（日后可快进合并）：
  - A9-30的14个（`a3b6a67`…`32ee0b4`及`c2b6356`），**此前从未推送**，也包含在本地分支`codex/a9-30-shell-streaming`中；
  - A9-31的11个：`2ecfc86`、`d9b5be5`、`1011450`、`a0042d0`、`dcf5418`、`a4ec353`、`35a1925`（managed实现与锁）、`898ee94`、`ebda911`、`8d207ab`（源码修复）、`2b6f3e2`（治理文档）。
- 作者/提交者元数据均为`allin2 <37659199+allin2@users.noreply.github.com>`；仓库无push钩子。

## 2. 公开暴露核查（推送前后对比，按文件计）

| 内容 | 远端main现有 | 推送后分支含 |
|---|---|---|
| 私网地址`192.168.1.x` | 87 | 135 |
| 本机主目录路径`/Users/qlyf/…` | 52 | 87 |
| 测试机主机名`WIN-2JQ66JE4HTQ` | 0 | **58（新增暴露）** |
| 测试机账户名`a9builder` | 0 | **63（新增暴露）** |
| SSH私钥**路径**`/Users/qlyf/.ssh/id_ed25519`（无密钥内容） | 0 | **3（新增暴露）** |

- 未发现真实凭据：私钥内容、口令、API key/token字面量扫描为0；唯一的`BEGIN PRIVATE KEY`是`src/runner/tests/stream-output.test.ts`的脱敏测试夹具（假值）。合成秘密字面量`A931-Synthetic-Key…`不在仓库中。
- 推送范围内无新增二进制文件；仓库中>1MB的文件（spikes下的Electron/Node包等）均已在远端main中。
- `.acceptance/`证据被`.gitignore`忽略，不会推送。

## 3. 执行步骤（批准后）

1. 复核：分支、HEAD（按D2结果）、远端仍无同名分支（`git ls-remote --heads origin codex/a9-31-background-tools`为空）、`origin/main`仍为`c14a968`；任一不符即停。
2. （D2=B时）先做一个本地文档提交：仅`docs/tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md`与本稿两路径，逐路径暂存核对，信息
   `docs(a9-31): record governance commit result and push approval`（附Co-Authored-By行）。
3. 推送：`git push origin refs/heads/codex/a9-31-background-tools:refs/heads/codex/a9-31-background-tools`；不加`--force`/`-u`/`--tags`/`--no-verify`。
4. 复核：`git ls-remote --heads origin codex/a9-31-background-tools`等于本地HEAD；其余远端分支不变。
5. 证据（新增，`.acceptance/a9-31-developer/branch-push-r1/`）：`pre-push-status.json`、`push-output.txt`、`push-result.json`；任务书追加结果条目。

失败（认证、网络、拒绝）即停并原样上报，不重试其他方式、不改远端设置。

## 4. 不在本批准内

PR、合并或快进main、推送`codex/a9-30-shell-streaming`为独立分支、推送`codex/a9-alpha2`、标签/Release、删除或改写任何远端分支、修改仓库可见性或设置。

## 5. 待负责人确认

- D1：接受§2所列新增公开暴露（测试机主机名、账户名、私网地址、SSH私钥路径；均无凭据内容）后推送；或先不推送，另行决定脱敏方式（会改写已提交历史或新增修订提交，需另起材料）。
- D2：A 只推送现有`2b6f3e2`（任务书结果条目与本稿留在本地）；B（推荐）先按§3.2把这两个路径做一个本地提交再推送，使远端治理记录完整。
- D3：确认A9-30的14个从未推送的提交随本分支一并公开。
- 批准须按本稿SHA256绑定。

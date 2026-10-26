# 本机外证据归档与取回

历史候选、双构建输出、Win7 运行证据和旧工件不进入本仓库 Git（`.acceptance/`、`outputs/` 等均被忽略），
为减少开发机占用，已加密归档到私有仓库 `allin2/win7-coding-agent-archives` 的 Release，本机原件随后移除。
文档中仍写作 `.acceptance/...` 等本机路径的证据，按本页取回。归档只保存历史事实，不改变任何候选的
既有 PASS/FAIL 裁决，也不构成新的 Alpha、RC 或 Win7 验收；取回的材料不得冒充新的实机证据。

## 归档批次

| Release | 日期 | 内容 |
|---|---|---|
| `archive-20260911-v2` | 2026-09-11 | 原 `~/.codex/a9-release` 下 12 个 A9 历史候选（20260903～20260911）及当时的 Git 历史 bundle |
| `archive-20260925` | 2026-09-25 | 下表 15 组、40 个目录；另含 `source-history-20260925.bundle.enc`（全部本地 refs，含未推送提交） |
| `archive-20260930` | 2026-09-30 | 下文 5 组、25 个目录（A9-23/A9-25 全部预演，WIN7-36～40 候选、WIN7-37/38 构建及同期运行证据）；另含 `source-history-20260930.bundle.enc` |
| `archive-20261026-slice1` | 2026-10-26 | 历史 diagnostic-3b / addendum11 原始搜索 JSON 与日志；3 个附件全部回下载 SHA 校验，实际恢复 2 文件通过；不含 Git bundle 或工作树 |
| `archive-20261026-slice2` | 2026-10-26 | WIN7-54 门 A 修复轮 repair-1～10、13 与 tmp 共 12 个集合（开发机测试夹具与沙箱，647,850 文件）；见下文 |
| `archive-20261026-slice3` | 2026-10-26 | Alpha 2 历史准备：w48 门 A 准备、diagnostic-3b 准备、rehearsal-3 准备 3 个集合（495,314 文件）；见下文 |

上述批次使用同一恢复密钥。密钥不在 GitHub，由负责人保管；位置与离机备份要求见私有仓库 README。

## `archive-20260925` 原路径对照

“组”决定下载哪个 catalog 与共享包，“集合”是 `--candidate` 参数和恢复后的目录名。

| 原本机路径（仓库根相对） | 组 | 集合 |
|---|---|---|
| `.acceptance/candidates/WIN7-14`～`WIN7-19` | `win7-14-19` | `candidates-WIN7-<N>` |
| `.acceptance/candidates/WIN7-29`、`.acceptance/a9-w29-plumbing` | `win7-29` | `candidates-WIN7-29`、`a9-w29-plumbing` |
| `.acceptance/candidates/WIN7-30`、`.acceptance/runs/WIN7-30` | `win7-30` | `candidates-WIN7-30`、`runs-WIN7-30` |
| `.acceptance/{builds,candidates,runs}/WIN7-31`～`WIN7-35` | `win7-<N>` | `builds-WIN7-<N>`、`candidates-WIN7-<N>`、`runs-WIN7-<N>` |
| `.acceptance/builds/WIN7-36` | `win7-36` | `builds-WIN7-36` |
| `outputs/a9-w33-local`、`outputs/a9-w34-local` | `outputs` | `outputs-a9-w33-local`、`outputs-a9-w34-local` |
| `spikes/02-terminal-containment/build-win10/dist` | `legacy-builds` | `spike02-build-win10-dist` |
| `spikes/04-storage-index/build-win10/dist` | `legacy-builds` | `spike04-build-win10-dist` |
| `release/win7-product-v2/out` | `legacy-builds` | `release-win7-product-v2-out` |
| 仓库根 `WIN7_NATIVE_ARTIFACTS_20260806-160514.zip`（含 `.sha256`） | `legacy-builds` | `root-native-artifacts-zip` |
| `A6/WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip`（含 `.sha256`） | `legacy-builds` | `a6-sqlite-artifacts-zip` |
| 仓库外 `../win7-agent-artifacts/closeout-20260812` | `artifacts-closeout-20260812` | `closeout-20260812` |
| 仓库外 `../win7-agent-artifacts/a7` | `artifacts-a7` | `a7` |
| 仓库外 `../win7-agent-artifacts/releases` | `artifacts-releases` | `releases` |
| 仓库外 `../win7-agent-artifacts/` 下 `a1-a3-worktree-closeout-20260820`、`worktree-closeout-20260820`、`tmpdir-evidence-20260911`、`tmpdir-evidence-20260914` | `artifacts-misc` | 与目录同名 |

（2026-09-25 时）仍保留在本机、未归档：`.acceptance/candidates/WIN7-36`、`WIN7-37`，`.acceptance/runs/WIN7-36`、`WIN7-37`、
`A9-19-EXPLORE`，`.acceptance/builds/WIN7-37`，以及 `deps/`、`evidence/`、`ssh/`、`build-kits/`、`coordinator/`。
其中 WIN7-36 运行与 A9-19-EXPLORE 为 [A9-19 WIN7-37 交接](../plans/A9_19_WIN7_37_ACCEPTANCE_HANDOFF.md) 所需。

## `archive-20260930` 原路径对照

| 原本机路径（仓库根相对） | 组 | 集合 |
|---|---|---|
| `.acceptance/rehearsals/A9-23-W39/<时间戳>`（`20260926-1935`、`-2303`、`-2331`、`20260927-0059`） | `rehearsals-w39` | `rehearsals-A9-23-W39-<时间戳>` |
| `.acceptance/rehearsals/A9-25-W40/<时间戳>`（`20260927-1741`、`-2019`、`-2224`） | `rehearsals-w40` | `rehearsals-A9-25-W40-<时间戳>` |
| `.acceptance/rehearsals/A9-25-W41/<时间戳>`（`20260928-1848`、`-2128`、`20260929-0748`） | `rehearsals-w41` | `rehearsals-A9-25-W41-<时间戳>` |
| `.acceptance/candidates/WIN7-36`～`WIN7-38`、`.acceptance/builds/WIN7-37`、`WIN7-38` | `win7-36-38` | `candidates-WIN7-<N>`、`builds-WIN7-<N>` |
| `.acceptance/runs/WIN7-36`、`WIN7-37`、`A9-19-EXPLORE`、`A9-21-GWFLAKE`、`A9-22-W38` | `win7-36-38` | `runs-<目录名>` |
| `.acceptance/candidates/WIN7-39`、`WIN7-40`、`_superseded`（含 `WIN7-40-3a2ecdb`） | `win7-39-40` | `candidates-<目录名>` |
| `.acceptance/runs/A9-23-W39`、`A9-25-W40` | `win7-39-40` | `runs-<目录名>` |

预演证据均为 `REHEARSAL_NOT_ELIGIBLE`，取回后也不计入任何结论。取回方法与上文相同，Release 名换为 `archive-20260930`。
上传前已在本机把 25 个集合全部解密还原，经恢复工具逐文件核对并与原目录 `diff -r` 比对一致；上传后每个附件重新下载核对 SHA-256。

2026-09-30 之后仍保留在本机、未归档：`.acceptance/candidates/WIN7-41`、`.acceptance/runs/A9-25-W41`（W42 套件派生可能需要，
计划在 WIN7-42 门 B 之后归档），以及 `deps/`、`evidence/`、`ssh/`、`build-kits/`、`coordinator/`。
`.acceptance/ssh/` 私钥从不归档或上传。`.DS_Store` 未归档。

## 本机历史修复证据索引

### WIN7-28 修复证据（20260910-baseline）

- 用途：保留源码提交 `55d9d5f7bec009c62a1f508c8b7bed0946ba6aae` 的独立复核、复现探针及开发机 smoke / 投影附件，用于追溯时间显示、历史分页、跨会话残留、外置 driver 依赖和 fixture 协议问题。
- 本机主工作区：`/Users/qlyf/Developer/win7-coding-Agent`；证据目录（相对该根）：`.acceptance/maintenance/a9-w28-repair-evidence/20260910-baseline/`。其他 Git 工作树或克隆不会自动携带此目录。
- 阅读入口：`review/REVIEW.md`；复现探针及原输出：`review/review-probes.cjs`、`review/review-probes-output.json`；原 smoke 记录：`smoke/a9-06-w28-smoke.json`；投影原始附件：`projection-evidence/`；内容校验清单：`SHA256SUMS.txt`。
- 范围：这些是历史源码和开发机复核证据，原 smoke 为 FAIL，不签发 Win7、Alpha 或 RC PASS。正式 WIN7-28 结论另见 [A9-15 UI 集成验收收口报告](../reports/2026-09/a9_win7_28_ui_integration_closeout_2026-09-11.md)。
- 保留与定位：2026-09-30 从同级 `a9-w28-repair-evidence` 移入项目，原始内容保留；迁移校验记录为 `.acceptance/maintenance/a9-w28-evidence-move-20260930.json`。本项保留在本机，不作为上述 Release 的已归档集合。

`.acceptance/` 被 Git 忽略，常规搜索可能跳过。先从本索引定位，再明确指定证据目录检索，例如：

```sh
rg --no-ignore -n 'F2|F4|QUERY_FAILURE_RETRY' /Users/qlyf/Developer/win7-coding-Agent/.acceptance/maintenance/a9-w28-repair-evidence/20260910-baseline/review
```

## 取回步骤

需要 `gh`（已登录且有该私有仓库读权限）、`python3` 与 OpenSSL 3。以取回 WIN7-33 双构建为例：

```sh
REPO=allin2/win7-coding-agent-archives
gh api repos/$REPO/contents/restore_snapshot.py -H "Accept: application/vnd.github.raw" > restore_snapshot.py
gh release download archive-20260925 --repo $REPO --dir ./download \
  --pattern catalog-win7-33.json \
  --pattern 'win7-33--shared-objects.tar.gz.enc' \
  --pattern 'win7-33--builds-WIN7-33.tar.gz.enc'
python3 restore_snapshot.py --catalog ./download/catalog-win7-33.json --download-dir ./download \
  --candidate builds-WIN7-33 --key /secure/path/restore.key --output ./verified
```

每个集合只需下载：本组 `catalog-<组>.json`、`<组>--shared-objects.tar.gz.enc`、`<组>--<集合>.tar.gz.enc`。
省略 `--candidate` 则恢复整组（需下载该组全部附件）。工具先核对下载件与明文 SHA-256，再逐文件核对
字节、权限与符号链接，文件重建于 `./verified/restored/<集合>/`，报告为 `<集合>.verification.json`，
状态 `DECRYPT_EXTRACT_RECONSTRUCT_SHA256_PASS`。目标目录已存在时工具拒绝覆盖。

放回原位时，把 `restored/<集合>/` 的内容复制到上表原路径即可；原路径只在需要时恢复，恢复后仍受
`.gitignore` 保护，不要提交。`archive-20260911-v2` 的取回方式相同，catalog 名为 `catalog.json`，
共享包为 `shared-objects.tar.gz.enc`，详见私有仓库 README。

## 恢复 Git 历史

`source-history-20260925.bundle.enc` 下载后先核对 catalog 中 `git_bundle.sha256`，再解密：

```sh
openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -pass file:/secure/path/restore.key \
  -in source-history-20260925.bundle.enc -out source-history-20260925.bundle
git bundle verify source-history-20260925.bundle
git bundle list-heads source-history-20260925.bundle
```


## 2026-10-26 原始诊断记录与重复副本回收

Release：[archive-20261026-slice1](https://github.com/allin2/win7-coding-agent-archives/releases/tag/archive-20261026-slice1)。
组 `diagnostic3b-records`，集合 `address-search-records`。
原路径根：`/Users/qlyf/.codex/worktrees/a9-alpha2-integration-r2/win7-coding-Agent/outputs/a9-39-diagnostic-3b-prep/addendum11/`。
仅含 `REPOSITORY_OLD_ADDRESS_SEARCH.json`（42,603,063 字节）与 `repository-old-address-search.log`（28,655,542 字节）。
这两件为历史原始搜索结果，不是新的目标平台证据。全部附件已回下载校验，现有工具实际解密并逐文件重建通过。
71,258,605 字节原始记录压缩加密后约 4.98 MB；保留原密钥、算法与 schema_version 2。

```sh
gh release download archive-20261026-slice1 --repo allin2/win7-coding-agent-archives --dir ./download \
  --pattern catalog-diagnostic3b-records.json \
  --pattern diagnostic3b-records--shared-objects.tar.gz.enc \
  --pattern diagnostic3b-records--address-search-records.tar.gz.enc
python3 restore_snapshot.py --catalog ./download/catalog-diagnostic3b-records.json \
  --download-dir ./download --candidate address-search-records \
  --key /secure/path/restore.key --output ./verified
```

本批不退役工作树，Git refs、dirty 内容、当前版本和回滚包均保留本地。
重复模拟测试 ZIP 只在逐文件 SHA 与保留副本相同后进入准确删除清单；不以目录年龄或大小判可删。
本机执行台账：`.acceptance/maintenance/archive-20261026-slice1/`。回收结果与授权状态见
[ENGINEERING_05](../tasks/ENGINEERING_05_ALPHA_DELIVERY.md)，不能把临时包清理体积当作净空间收益。

## 2026-10-26 第二、三批：A9-39 历史准备材料

两批原路径根均为整合树 `/Users/qlyf/.codex/worktrees/a9-alpha2-integration-r2/win7-coding-Agent/outputs/`。
本机执行台账：`.acceptance/maintenance/archive-20261026-slice2/`、`archive-20261026-slice3/`、`cleanup-20261026-r2/`。

| Release | 组 | 集合（`--candidate`） | 原路径（相对上述根） |
|---|---|---|---|
| [archive-20261026-slice2](https://github.com/allin2/win7-coding-agent-archives/releases/tag/archive-20261026-slice2) | `w54-gate-a-repairs` | `repair-1`～`repair-10`、`repair-13`、`tmp` | `a9-39-w54-formal-packages/gate-a/<集合>` |
| [archive-20261026-slice3](https://github.com/allin2/win7-coding-agent-archives/releases/tag/archive-20261026-slice3) | `alpha2-history` | `w48-gate-a-prep`、`diagnostic-3b-prep`、`rehearsal-3-prep` | `a9-39-w48-gate-a-package-prep`、`a9-39-diagnostic-3b-prep`、`a9-39-rehearsal-3-prep` |

`gate-a/formal`（WIN7-55 FORMAL 证据）、`gate-a` 顶层记录、`supplement/` 及其他目录不在本批，保留本机。
draft `archive-20261026` 是同组的未完成上传，盐值不同，不作恢复依据；以 slice3 为准。
上传前凭据扫描未发现私钥块或令牌；`sk-` 命中均为仓库测试夹具。.DS_Store 未归档。

```sh
REPO=allin2/win7-coding-agent-archives
gh release download archive-20261026-slice2 --repo $REPO --dir ./download \
  --pattern catalog-w54-gate-a-repairs.json \
  --pattern w54-gate-a-repairs--shared-objects.tar.gz.enc \
  --pattern 'w54-gate-a-repairs--repair-4.tar.gz.enc'
python3 restore_snapshot.py --catalog ./download/catalog-w54-gate-a-repairs.json \
  --download-dir ./download --candidate repair-4 --key /secure/path/restore.key --output ./verified
```

slice3 同法：catalog 为 `catalog-alpha2-history.json`，共享包为 `alpha2-history--shared-objects.tar.gz.enc`。
本机原件已于 2026-10-26 经负责人批准按清单 `9c78aac6…9368` 删除；核验方法与结果见 [ENGINEERING_05](../tasks/ENGINEERING_05_ALPHA_DELIVERY.md)。
本机 `manifests/` 保留每个集合的逐文件清单，可先按路径检索再决定下载哪个集合。

## 2026-10-26 工作树整合的本地保留

本节是开发机文件保留与恢复说明，不新增 Win7 证据或改变原签发范围。
来源工作树为 `/Users/qlyf/.codex/worktrees/a9-alpha2-integration-r2/win7-coding-Agent`，HEAD `e596c58a…`。
原件尚未删除。完整映射、清单和核验结果在主工作区
`.acceptance/maintenance/worktree-retirement-20261026/r1/`。

| 材料 | 工作树外的保留位置 | 本轮核验 |
|---|---|---|
| 314e 的 20 个未提交文件、整合树的 1 个未提交文件 | 上述台账的 `dirty-backups/`；含 tracked 补丁、原文件归档和逐文件清单 | 实际解包，原字节、模式与 SHA-256 一致 |
| WIN7-55 冻结候选、双构建、正式/补充证据、开发账本及未归档准备材料，共 22 个根 | `.acceptance/evidence/a9-alpha2-integration-r2-e596c58-20261026/`，保留原工作树相对路径 | 文件字节、模式、目录成员与符号链接目标一致 |
| 第四批已恢复的 117 个整合树历史集合 | `.acceptance/maintenance/archive-20261026-slice4/verified/<组>/restored/<集合>/` | 当前原件与既有恢复件逐项重比；131 个本地加密附件重新核 SHA |

上述两类证据材料合计核验 514,179 个目录成员。归档略过的文件和 FIFO 类型另在独立保留根保存；
不读取 FIFO 内容，不将管道类型保存描述为运行状态恢复。验证范围不包含 ACL/xattr 等价性。
WIN7-55 候选及两次构建保留副本的 ZIP SHA 均为 `7de63dd8db0fde0f7c76aafa48f44ce6c9841c651c03b93215e175ad3792824a`。

以下材料为 `KEEP`：独立保留根、两个 dirty 归档、本轮清单、slice4 的 catalog/manifest、131 个本地加密附件、
117 个恢复集合及原归档密钥。密钥仍在原有受限位置，没有复制到工作树或上传。
slice4 的远端草稿不作为本次恢复依据；未经另轮确认，不得清理这些本地恢复来源。

恢复原工作树时，先按 `baseline.json` 中的原 HEAD/分支重新建立工作树，再将对应 `dirty-files.tar.gz`
解包到该工作树，复核 `manifest.json` 的路径、模式和 SHA。本轮不删除 Git 分支或历史对象。
整合树的 ignored 材料按 `preservation-result.json` 的 source/retained 映射恢复到原相对路径，
再复核 `custody-files.jsonl`、原归档 manifest 及 wrapper 模式记录。不覆盖其他已有目录。
冻结输入中的原路径与绑定保留原文；本地迁存不授权复跑已消费 run 或改绑旧候选。

已知缺失材料仍见 `.acceptance/maintenance/unarchived-deletion-20261026-r1/INCIDENT.md`，状态为 `LOST`。
本节没有恢复、补签或重新归档那些已缺失的原件。

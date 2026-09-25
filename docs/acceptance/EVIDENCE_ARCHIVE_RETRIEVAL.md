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

两批使用同一恢复密钥。密钥不在 GitHub，由负责人保管；位置与离机备份要求见私有仓库 README。

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

仍保留在本机、未归档：`.acceptance/candidates/WIN7-36`、`WIN7-37`，`.acceptance/runs/WIN7-36`、`WIN7-37`、
`A9-19-EXPLORE`，`.acceptance/builds/WIN7-37`，以及 `deps/`、`evidence/`、`ssh/`、`build-kits/`、`coordinator/`。
其中 WIN7-36 运行与 A9-19-EXPLORE 为 [A9-19 WIN7-37 交接](../plans/A9_19_WIN7_37_ACCEPTANCE_HANDOFF.md) 所需。
`.acceptance/ssh/` 私钥从不归档或上传。`.DS_Store` 未归档。

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

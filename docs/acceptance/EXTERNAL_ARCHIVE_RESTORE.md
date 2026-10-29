# 从“相机盘”重新获取历史验收材料

适用：macOS 开发机、本仓库 `main`。这是离线档案恢复，不运行候选、不产生新的 Win7 证据。

## 保存位置与边界

登记卷 UUID：`C8BF5026-0077-3F03-AA08-019E0A1DC444`。
卷名为“相机盘”，原名为“Untitled”。两者是同一卷，不是两份独立备份。
归档根相对路径为 `win7-coding-agent-archives/`。
卷名和 `/Volumes/相机盘` 只用于说明，不作为恢复脚本的定位依据。

| 内容 | 外置盘位置 | 本机保留 |
|---|---|---|
| slice1 原始搜索记录加密归档 | `archive-20261026-slice1/` | catalog、原清理记录与恢复入口 |
| slice4 历史准备、预演与旧候选加密归档 | `archive-20261026-slice4/` | catalog、原清理记录与恢复入口 |
| slice2、slice3 的 catalog/manifest 索引 | 对应批次目录 | 原索引；归档附件仍按原说明从已发布私有 Release 获取 |
| 当前 WIN7-55 候选、双构建及直接证据 | 本轮不迁出本机 | `.acceptance/evidence/` 的现有保留位置 |
| 活跃依赖、测试输入、凭据和归档密钥 | 不复制到外置盘 | 现有受限位置 |

slice4 的 GitHub 草稿不完整，不能用作恢复来源。
本轮源副本移除状态及准确范围见 ENGINEERING_05 的外置盘迁移记录。

## 接盘与定位

从仓库根运行：

```sh
python3 scripts/maintenance/acceptance_archive.py status
```

脚本通过 macOS `diskutil` 查询已登记 UUID 的实际挂载点。
随后检查外置卷边界及归档标识文件，不扫描其他卷的文件内容。
磁盘被改名，或系统挂载为“相机盘 1”时，使用查询到的路径。
磁盘未接入、未挂载、UUID 不同或标识不符时，返回非零并停止。
脚本不会创建 `/Volumes/相机盘` 作为替代目录，也不会自动挂载磁盘。

需要 Python 3.9+、macOS 自带 `diskutil`，以及既有 OpenSSL 3。
脚本只使用 Python 标准库，不安装依赖，不用于 Win7 目标机。

## 查找集合与恢复

列出 slice4 中的旧候选和构建集合：

```sh
python3 scripts/maintenance/acceptance_archive.py list \
  --batch archive-20261026-slice4 \
  --group slice4-candidates-w41-w54
```

恢复 WIN7-42 到一个尚不存在的本机目录：

```sh
python3 scripts/maintenance/acceptance_archive.py restore \
  --batch archive-20261026-slice4 \
  --group slice4-candidates-w41-w54 \
  --candidate candidates-WIN7-42 \
  --output .acceptance/restored/WIN7-42-retrieved-1
```

脚本核对已登记 catalog、恢复工具、共享包和集合包的 SHA-256。
然后调用现有 `restore_snapshot.py` 解密并逐文件重建。
密钥默认由 catalog 中的本机位置定位，要求归当前用户所有且 mode 为 0600。
密钥位置变化时用 `--key-file /secure/path/restore.key` 指定；不要将密钥放到归档盘。
输出目录必须是新的本机路径，不允许覆盖已有恢复结果。

成功后查看：

```text
.acceptance/restored/WIN7-42-retrieved-1/candidates-WIN7-42.verification.json
.acceptance/restored/WIN7-42-retrieved-1/restored/candidates-WIN7-42/
```

报告须为 `DECRYPT_EXTRACT_RECONSTRUCT_SHA256_PASS`，并绑定当前两份加密附件的 SHA。
先核对报告，再按原路径映射复制需要的文件；不要覆盖现有候选或改写原绑定。
恢复历史文件不授权重放已消费的 run、目标机操作或重新签发结论。

其他 slice4 分组为 `slice4-outputs-other`、`slice4-rehearsals`、`slice4-a9-39-acceptance`。
slice1 使用 `--batch archive-20261026-slice1 --group diagnostic3b-records --candidate address-search-records`。
slice2、slice3 仍使用 [原归档取回说明](EVIDENCE_ARCHIVE_RETRIEVAL.md) 的下载步骤。

## 插拔、中断和更换磁盘

1. 先接入“相机盘”，运行 `status`。
2. 恢复期间保持连接，完成后核对报告。
3. 恢复失败时保留本机部分输出供诊断。
4. 重新接盘后运行 `status`，用新的输出目录重试。
5. 使用 macOS 正常推出磁盘后再拔出。

脚本在恢复前后重新核对磁盘状态。中途拔盘造成读取、校验或子进程失败时，不报告成功。
重插后 device 编号可能变化，脚本不绑定 `disk4s1`。
重新格式化会改变 UUID；更换盘也需要重新核对全部附件并更新登记。
不能仅凭同名磁盘自动采用新的 UUID 或忽略标识错误。

## 登记与证据

- [外置归档登记](EXTERNAL_ARCHIVE.json)：卷 UUID、相对路径、catalog 与恢复工具哈希。
- [归档与原路径映射](EVIDENCE_ARCHIVE_RETRIEVAL.md)：各批次原路径、既有恢复证据和 LOST 边界。
- 本轮台账：`.acceptance/maintenance/external-migration-20261026-r1/`。
- 本机源副本若经批准移除，离线时对应历史材料不可直接读取；日常构建与现有凭据路径继续使用本机保留内容。

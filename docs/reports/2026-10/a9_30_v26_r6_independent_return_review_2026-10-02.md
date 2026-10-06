# A9-30 v26 r6 双返回包独立只读复核

结论 **PASS，P0=0/P1=0/P2=0**。复核人 `/root/a9_30_r4_label_review`（gpt-6-luna/high），实现方 `/root`；时间 `2026-10-02T08:38:11+08:00`。本报告忠实登记独立代理返回的检查结论，未由实现方冒充复核人执行。范围只覆盖本次实际 Win10 双构建与返回闭包，不签产品锁、A9-30 `DEVELOPER_VERIFIED` 或 Win7 验收。

## 输入与逐项检查

| 输入 | 身份 |
|---|---|
| 原生 source | `7feae402edfb30da9adb649841d777ca82cc6e80` |
| r6 kit ZIP SHA-256 | `8c0f79bf2f5383be3b59b6542f27e159c00efb23f07eeabdc0a05477462cf406` |
| 批准登记 HEAD | `3e2f6f602bf7b6aa0786b7c800c8541eff1198f4` |
| A ZIP SHA-256 / bytes | `4634a99211556698421649ba381ebb9192b523c4bbf1e0080a40137dba2d203a` / 207549 |
| B ZIP SHA-256 / bytes | `c9591d5ba2bce1edbf72bd08287774eaf8074c17e1a3903f40be3fcd9d232e75` / 207575 |
| A run-id | `16b5abc3-e4bb-4615-a5bc-12e02fcb5e17` |
| B run-id | `33e3d3c9-bf4d-4f40-92f5-31b8915d13f9` |
| helper SHA-256 / bytes | `c895a2f9e4abcb84ae2295d2e33ada6289cfd34c692b88e92276e7749cdc5a2b` / 350720 |
| production 双包只读校验 JSON SHA-256 | `d4e60dab62e7d9551c2d9319caea507eb54d94e0b24680e4f71e167c570ca3b6` |

独立人实际本地重算 ZIP 与 sidecar；两包各58条目，返回 manifest覆盖另外57项，逐项尺寸/SHA一致。`input-lock.json`、`PACKAGE_MANIFEST.json`、`build-profile.json`、`helper.exe.manifest` 均与同一批准 r6 kit 原始字节一致。两个 run-id 唯一，返回包独立；两个 helper 同哈希且逐字节相同。

两次实际身份记录为 Win10 Pro19045、普通非提升Medium RID8192、无HostJob；VS2019 `16.11.37507.1`、MSVC `14.29.30133`、SDK19041。工具身份SHA相同：`18fb8e85331d9a6c6c21064d29235b5c29d28007599b4de5457873216ad6bd65`。

两次 PE/API/CRT 分析为 x64 PASS，禁止API与动态CRT依赖空，仅依赖 ADVAPI32.dll、KERNEL32.dll。每个目录两个精确 fixture 各一条本人不继承 WRITE_OWNER `0x80000` 增量，DACL精确delta与实际WRITE_OWNER open均通过；v1允许/取消 smoke的低完整性标签应用、验证和回滚、containment通过。v2 marker、取消和环境覆盖拒绝证据齐全；v3 tick、UTF-8、CP936、UTF-16LE、limit和cancel原始事件及时序齐全。

两份 `build-result.json` 的原始字段为 PASS/COMPLETE/candidate_eligible；这些字段不等于完整产品候选审批。生产双包只读 inspector PASS，`product_lock_generated=false`；其生成时的 `independent_return_review=PENDING` 是不可变快照，本独立复核在其后完成，不重写该 JSON。

## 明确限制

两次 backpressure 均 exit10、发送cancel、无terminal JSON；仅支持有界fail-closed，进程树清理 **UNKNOWN**。复核人未把它提升为清理完成，也未执行远端、构建或测试。consumer修正的48项日志为继承证据；本次归档/原始字节核对为独立直接检查。

产品 v26 输入锁、打包及真实 Electron仍未完成，Win7 `NOT_PERFORMED`。整体A9-30开发机门、完整Alpha2和RC均未裁决。

## 证据位置

全部位于 A9-30 工作树 `.acceptance/a9-30-developer/closeout/`：`build-a-r6-return/`、`build-b-r6-return/` 原始ZIP与sidecar；`r6-double-build-readonly-production-validation.json`；32项身份/源码/批准/输入/首失败/测试/返回包索引 `r6-double-build-evidence-index.json`。详细执行与失败纠正见[双构建报告](a9_30_v26_r6_win10_double_build_2026-10-02.md)。

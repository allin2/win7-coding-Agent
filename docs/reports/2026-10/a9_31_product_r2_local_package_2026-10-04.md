# A9-31：修复后开发检查包 r2 本地装配结果

日期：2026-10-04。结论：`A9_31_DEVELOPER_PACKAGE_INTEGRITY_PASS`。
本轮完成批准的本地装配与包检查；A9-31仍IMPLEMENTATION_IN_PROGRESS。新包Win10、独立收口、Win7及完整Alpha2/RC均NOT_PERFORMED。

## 1. 批准、基线与产物

负责人对[本地合同](../../plans/A9_31_PRODUCT_R2_LOCAL_PACKAGE_APPROVAL.md)§1–3回复“批准”。
批准原文SHA-256为`f415096d1b1534fa3f203ec200ed4d10cb17fee729192e816dfde049edd7c2a8`，完整原文保存在候选外approved-local-package-contract.md；owner-approval.json SHA为`1054cab33e8b9ead00bfec12009aa938b46c2f1bf052653d10f5441c63fd069a`。

源工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支codex/a9-31-background-tools，HEAD `898ee9459a9b987840e94ddef336556ea58dd389`，父35a19250ed6589f6a7ba35b940a784325970c111。
全新source-checkout以本地clone --no-checkout --shared后detached检出该source；原HEAD/refs/remotes未改。
实际装配环境Mac/arm64、UID501、Node20.17.0；固定PATH与生产者SHA/argv见package-build.json，不是Windows执行环境。

产物根为`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r2/package`：

| 产物 | bytes / SHA-256 |
|---|---|
| Win7CodingAgent-0.3.0-alpha.2-win7-x64.zip | 101324304 / d7323ac4f6ddb674eb93fdea2cd2007ed62679268afe37a6df8df29115122c47 |
| .work/Win7CodingAgent-0.3.0-alpha.2-win7-x64/release-manifest.json | 150177 / 1c5084a4a8d194e33af48d6c15d3e661f0808931558eacf41b849016816b6225 |
| ZIP.sha256 sidecar | 精确绑定上述ZIP哈希与文件名 |
| A9_31_BUILD_RESULT.json | 生产者原始结果保留，developer_package_integrity=PASS |

包身份为A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE，source_dirty=false，external_acceptance_eligible=false。
不含release_authority，开发kit authority=NOT_GRANTED，不占用WIN7-43；包内product_assembly/win10/win7/alpha的NOT_PERFORMED未改写。

## 2. 装配、首失败与保护

批准后重核source/五路径/锁/registry/三输入/生产者和已解析离线依赖。
依赖仅链接合同中的八个既有目标，没有安装、下载或写入依赖；编译器是各模块既有TypeScript5.3.3，Node类型16.18.126。
生产者在全新package目录编译七模块，编译输出由实际包使用，没有采用原工作树tracked历史Runner dist。

准备首失败：提交的.gitignore使用node_modules/目录规则，不能忽略符号链接；首个git check-ignore返回1，产品编译尚未开始。
仅在新克隆已有.git/info/exclude追加八个合同批准的精确链接路径，保全前后字节；不改源码.gitignore，不忽略其他路径或传allow-uncommitted。
checkout-ready.json证实八链接已忽略、detached HEAD准确、源码status为空及编译器无incremental/composite持久缓存。
首失败与准确本地Git元数据变更分别在checkout-link-first-failure.json和checkout-exclude-before/after.txt保留。

生产者首次执行正常exit0，耗时约16秒；没有产品编译/装配失败或重试，没有重复原生构建。
生成后pre-doc-preservation.json核验原工作树37个dirty文件、主工作区23个dirty文件均未变，checkout仍干净；三输入、所核对的依赖元数据/编译入口字节保持。
后续仅更新本轮批准/状态文档并新增本报告及下一步合同；最终保护和文档检查另见final-preservation.json、final-docs-check.*和final-diff-check.*。

## 3. 本轮直接检查与影响

| 本轮检查 | 准确结论及记录 |
|---|---|
| source-bound生产者 | exit0；七模块源码重编，package-build.* |
| 同source verifyA9ProductZip | manifest与全部payload完整性PASS；package-verification.* |
| ZIP↔展开树双向核对 | 784文件，零缺失/额外/变化；zip-tree-comparison.* |
| 实际包runtime入口 | 在Mac读取包内descriptor、manifest和native哈希，Profile/v3正确；没有执行Windows EXE/.node |
| 包内七模块入口 | 实际require包内JS入口通过，不加载WindowsSQLite或启动helper |
| managedOwner/onOutput | 包内适配器对受控Runner边界的调用保留对象/回调身份；真实native生命周期未执行 |
| State修复与Runner编译输出 | 三处State修复及Runner传递链路均在实际新包；是编译输出检查，不替代WindowsSQL/桌面证明 |
| runtime/许可证/SBOM | Electron22.3.27、Node16.17.1声明、ABI110、SQLite3.43.1、helper/Profile、runner manifest及许可哈希一致 |

包内State为95514bytes/SHA `4e99d27e7b07dff99a7523a57a3baba5e5ca3c6b48f64cea2b546d5057926243`。
helper仍`2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7`，managed锁仍`7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e`。

package-impact.json绑定r1/r2准确ZIP与manifest。783项payload路径集相同；变化仅State编译文件、SBOM源码字段和开发kit源码字段，另release-manifest变化。
其他应用JS、Electron、helper和SQLite字节完全相同；不据此继承旧包整体WindowsPASS。

## 4. 继承、未执行与下一步

State82/Shell117/verify:quick以及原Core/Runner规定检查，只在提交/源、依赖/配置与原报告绑定成立的范围登记INHERITED_EVIDENCE。
本次真实新包身份、闭包及JS入口是直接本地证据；原生准入继续按ADR-0158准确有限裁决，不改旧独立P1=1、controller UNKNOWN或raw-pipe背压缺终态。
旧R10返回/失败/停止/后飞行记录不改；Boot/Shell/EncodingSecurity的旧PASS不绑定到新包。

证据根为`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r2`，统一索引local-package-evidence-matrix.json。
下一步[新包Win10准确合同](../../plans/A9_31_PRODUCT_R2_WIN10_VALIDATION_APPROVAL.md)已形成本地草案；包含新source/ZIP/manifest/锁、新根/控制器与外部测试范围，尚未批准。
无源码提交/推送/合并、远端写入、R10恢复、代理复核或Win7执行；真实后台、Stop/release/退出/恢复和受影响安全链路须取得新直接证据后，才进入独立收口与负责人裁决。


# A9-30 开发机收口裁决（2026-10-02）

```text
Task: A9-30 / Shell 运行中输出
Branch: codex/a9-30-shell-streaming
Product Source: 32ee0b48edd286c77aa543bdda9eb834fd4576aa
Decision: DEVELOPER_VERIFIED
Phase-Gate: A9_30_DEVELOPER_VERIFIED
Independent Review: PASS / P0=0 P1=0 P2=0
Win7-Validation: NOT_PERFORMED
Candidate / Alpha 2 / RC: NO_NEW_VERDICT
```

负责人要求“实现最终独立复核及 A9-30 收口裁决”。主代理依据已批准的 [任务书](../../tasks/A9_30_SHELL_STREAMING.md) §4–5、[helper v3 合同](../../plans/A9_HELPER_V3_STREAMING_PROTOCOL.md)和独立只读复核，登记 A9-30 为 **DEVELOPER_VERIFIED**。本结论关闭 Shell 实时输出的开发机合同，不等同于 Win7 兼容性或第二批整体验收。实现授权状态继续保留 `APPROVED_FOR_IMPLEMENTATION`，阶段门单独登记。

## 1. 精确交付身份

| 项目 | 身份 |
|---|---|
| 产品源码 | `32ee0b48edd286c77aa543bdda9eb834fd4576aa`，相对上一包仅提示及合同测试两文件提交 |
| 开发 ZIP | `Win7CodingAgent-0.3.0-alpha.2-win7-x64.zip`，101309096 bytes，SHA `08425b621613c67d3079726f5fb39efc08a6c40f928a94da6f93184ef177b8b9` |
| release manifest | SHA `3afb33678e80d5a07abc94f419f82bb193a2955c92a373f4ad64e06498509522`；783载荷及manifest共784文件 |
| 开发标识 | `A9_30_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE`；source_dirty=false，external_acceptance_eligible=false |
| 原生源码 | `7feae402edfb30da9adb649841d777ca82cc6e80`，独立于产品源码身份 |
| D-013 v26 helper | 350720 bytes，SHA `c895a2f9e4abcb84ae2295d2e33ada6289cfd34c692b88e92276e7749cdc5a2b` |
| v26 kit | SHA `8c0f79bf2f5383be3b59b6542f27e159c00efb23f07eeabdc0a05477462cf406` |
| 产品开发输入锁 | `release/win7-product-v3/a9-v26-input-lock.json`，7323 bytes，SHA `2e5942b115f1e5f1ecf6a6c31d91ed5d4f9145b9e0751941a0aa566fdebda9df`；本地未提交状态保持 |
| Win10 实际运行 | `192.168.1.4`，a9builder SID末尾1005、Session3、普通非提升Medium RID8192、无Host Job |
| 目标运行时 | Electron22.3.27 / Node16.17.1 / ABI110 / SQLite3.43.1；开发打包宿主Node20.17 |

原生两次独立构建、PE/API/静态CRT、兼容及v3证据和生产重锁见 [双构建报告](a9_30_v26_r6_win10_double_build_2026-10-02.md)、[独立返回复核](a9_30_v26_r6_independent_return_review_2026-10-02.md)。本轮按精确源码/helper/输入锁继承，未重新编译或重锁。历史v25和冻结候选保持原身份。

## 2. 最终独立复核

复核人为 `/root/a9_30_final_closeout_review`，`gpt-6-luna` / high，独立只读；没有参与修改实现，没有写状态或证据，没有重跑GUI、产品测试或远端动作。其最终建议为 `DEVELOPER_VERIFIED`，P0/P1/P2=0/0/0。

复核重新计算28项冻结入口、66项旧评审归档及111项新Win10回传的尺寸/SHA，无缺失或不匹配；追溯原生双构建、生产锁、包内身份、既有模块/回归记录、正负用例、实际身份/JSON/截图和进程后飞行。此为证据复核，不宣称独立重跑所有测试。既有未变检查按准确源码及组件字节引用，新增提示的39项定向检查与新包受影响交互分别绑定现有记录。

复核期间材料保持不变。登记前另存28项已复核原字节，避免文档追加后丢失原评审版本。证据根为 `.acceptance/a9-30-developer/closeout/`：

- `r6-note-win10-final-review-handoff-r1.json`：冻结入口，SHA `3c0ebbae4eb3ff5fbbeb67e14d9e6113e70cef111ceac74459c13f3d81447483`。
- `r6-final-closeout-reviewed-inputs-archive-r1.json`及snapshot目录：28项准确归档，索引SHA `b163f556cef3d661638cbd996a74396b5e411e4922bbf83e090e808e3b456817`。
- `r6-final-independent-closeout-review-r1.json`：主代理记录独立最终意见，SHA `705acc507bea2d990d53305cc7700323c3713c2c660a01dff3905a811e2f6d07`。
- 当前裁决矩阵 `r6-real-electron-evidence-matrix-r11.json`；r1–r10和旧冻结66项原文继续保留。

## 3. 合同覆盖裁决

| 合同 | 开发机结论 | 证据分类及适用范围 |
|---|---|---|
| S01/S02 | PASS | 新source直接：每2秒双源tick在退出前可见，序号/各流顺序正确，新提示真实显示。 |
| S03 | PASS | 新source直接观察307次先SQLite后IPC快照（含重复观察）；旧source失败验证撤销verified按未变Core/Runner哈希继承。 |
| S04 | PASS | 旧source UTF-8/CP936/UTF-16LE字节边界、无换行/CRLF及错误样本，相关执行组件准确字节继承；不能把旧报告改标新source直接执行。 |
| S05 | PASS，失败边界保留 | 新source实际Stop/helper退出；旧source真实Runner消费者队列背压/回调拒绝受控失败及清理继承；原生物理pipe负例只证明有界fail-closed，清理仍UNKNOWN。秘密仅合成样本。 |
| S06 | PASS | 新source视图返回、分页/刷新去重、滚动/焦点直接；旧source正常关闭及中断重启依据未变组件继承，不重放旧工具。 |
| P01/P02 | PASS | 既有精确列出的协议负例及SQLite审计失败阻断派发，未变模块哈希继承；新source补落盘后发布正向证据。 |
| D-013/D-017 | PASS | 准确批准套件、两个独立run/返回包、同helper字节、PE/API/CRT、独立返回复核及生产开发锁；按精确输入引用。 |
| 打包/真实Electron | PASS | 生产ZIP完整性、真实普通桌面直接启动及受影响交互；稳定组件精确继承，不外推至Win7。 |

包载荷783项中780项与旧source4318634一致，变化仅开发源码身份清单、Renderer提示和SBOM。整个已改Renderer不继承成新source直接PASS；批准提示差异、对应定向检查及Boot15/First16的直接运行共同覆盖本次影响，旧执行组件按准确哈希继承。旧报告原source/run-id/SHA不重绑。

新包Boot15为1项直接启动，run-id `23586933-cdee-482c-b064-d4e4fac7d640`，报告SHA `44cb4fd6c8365ce3a45e595a7b749026003247538c96969eebb4ba39dc2b42a9`；First16为32项实时输出交互，run-id `8b38dba3-c6a8-4a8d-b6e3-ab4021c06c55`，报告SHA `2575b72e1de78b580dff7923a83bc028474301c86c27217f99d4abefec042eb0`。111文件回收匹配，84合成变体0命中、正向对照有效，8登记进程后飞行均不存在。新控制器两请求完成后自动退出，未恢复旧暂停控制器。详细行为与入口边界见 [实机报告§21](a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md#21-新包-win10-直接启动与受影响交互验证2026-10-02-2308-08)。

## 4. 背压 UNKNOWN 的裁决依据

独立复核初查曾提出原生物理stdout pipe负例缺终态是否阻断S05；核对获批构建README、生产返回校验器及协议失败边界后撤回该疑点。最终0/0/0不删去此审阅过程。

[构建README](../../../native/helper/build-win10-kit-v26/README_BUILD.md)明确：背压缺失终态只证明fail-closed、有界退出，清理保持UNKNOWN。[返回校验器](../../../scripts/release/a9-v26-return-evidence.mjs)明确接受该有界背压负例，同时禁止把缺终态当清理成功。helper协议允许终态不能交付时transport报告协议失败/cleanup unknown。两次raw-pipe运行约2.55s退出、cancel_written=true、13帧、exit10，无执行终态，仍是原始UNKNOWN，未补签清理PASS。

Runner消费者队列背压另有真实 `A9_OUTPUT_BACKPRESSURE`、受控取消、processTreeReaped=true及子进程退出证据；它和普通Stop的清理成功均不替代或改判raw-pipe负例。分层证据满足开发机合同的正向行为及诚实失败边界，原生UNKNOWN本身不是被合同禁止的状态。

## 5. 保留项与后续边界

- Win7全部 `NOT_PERFORMED`；新候选由第二批后续换发合同取得，不占WIN7-43、不携带正式authority。完整Alpha2和RC需另行裁决。
- 编码及协议负例仅覆盖记录列出的模式；UTF-16LE由可信夹具在启动前设置Runner选项，原生Shell文件选择器UI未测。
- 秘密扫描仅证明合成样本及受检出口；截图二进制扫描不等同像素检查，不宣称任意真实秘密零泄漏。
- 原生raw-pipe清理UNKNOWN、R1超时未暂停缺陷、r9/R14首失败和旧R2暂停全部保留，不重新签发历史结果。
- A9-31/A9-32仍为各自草稿，默认不纳入本次；性能/A8/恢复目录迁移/安装器/凭据生命周期未因此关闭。

本轮只登记独立意见及开发机裁决、更新相关文档。产品源码HEAD、主工作区已有修改、未提交开发锁保持；未提交、推送、合并、发布或执行新构建机动作。收口文档执行文档检查和差异检查，不重复产品全量测试。

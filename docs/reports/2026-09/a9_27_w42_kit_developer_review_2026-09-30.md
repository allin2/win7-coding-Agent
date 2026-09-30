# A9-27 W42 套件开发机检查

结论：套件已扩为 30 项，开发机检查通过；目标平台执行 **NOT_PERFORMED**，尚未冻结候选。继承 W41 判据保持；新增旅程已由泛化“工具完成”改为实际合同观察。

- 包测试 104/104 PASS（`package-final-full.log`）。后续补齐完整性校验 30 项计数/编号及闭包，W42 和历史哈希边界针对复测 4/4 PASS（`package-integrity-final.log`）。
- Shell 在构建后 49 suites / 478 tests PASS（`shell-after-build.log`）。首次整合消费者检查使用旧 Core dist 而失败，原日志保留；verify:quick 按依赖重建后通过，不修改断言。
- verify:quick、docs:check、diff PASS（`quick-final.log`、`docs-final.log`）。
- 八项新增判据分别注入恢复目录暴露、旧 verified、秘密泄露、超限发送、热身提交、错误取消事件、审计故障后编辑、未完整流编辑，均拒绝。
- 以 git show 只读转译 `6acbb14` 实际 Core 与 Renderer，当前验收断言分别复现 `verified != unverified` 与历史 queryEvents 0 != 1。原始日志及身份在 `old-product/negative-results.json`。这属于开发机旧产品对照，未执行 Win7。
- Core/Gateway/Runtime 隔离实测：压缩重试 15713 → 7963 字符；不可压缩请求零发送；SQLite 故障前/后及最终故障保留实际执行次数；正常 EOF 可编辑，异常响应零编辑。Runtime 审计场景另增加两个编辑目标，证明故障后后续编辑零执行。日志 `runtime-two-edits.log`。

原始证据目录：`/Users/qlyf/Developer/win7-coding-Agent/.acceptance/w42-developer/`。开发迭代失败均保留。两份用户既有 Electron ZIP 删除以及未允许的重复 check.py 不进入提交；候选仅从允许的 w42-check.py 派生 validation/check.py。

当前代码由主代理接手补强，已有独立 A9-28/A9-29 产品复核保留。实机预演之后仍须独立正式执行与报告审核，以及负责人门 A / B 裁决；本报告不代签。

# A9 第二批设计准备与本地检查（2026-10-01）

## 1. 已执行范围

主代理按用户推进计划完成文档准备，未委派。仓库为 `/Users/qlyf/Developer/win7-coding-Agent`，
分支 `codex/a9-alpha2`，HEAD `a53c9b9d861486e5923bc82ea70b31b76af1a939`；本地/实时远端main为
`c14a96808d048c34f6079cc378ba12b4f60f5c62`，HEAD..main差异只有发布登记文档。

- [推进顺序](../../plans/A9_ALPHA2_DELIVERY_SEQUENCE.md)：保留历史，追加第一批/W42收尾、遗留设计及编号说明。
- [helper v3设计](../../plans/A9_HELPER_V3_STREAMING_PROTOCOL.md)：严格帧/序号、writer/取消、编码/跨块脱敏、事件身份、先落盘后发布、恢复及原生重锁。
- [A9-30](../../tasks/A9_30_SHELL_STREAMING.md)、[A9-31](../../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)、[A9-32](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md)：分支/基线、精确允许文件、接口/失败行为/检查命令，全部DRAFT_READY_FOR_REVIEW。
- ADR-0150～0152 Proposed、任务/方案索引和当前状态同步；Accepted ADR正文不改。
- [模拟Demo](../../plans/a9-30-shell-streaming-demo/index.html)及[候选覆盖台账](../../plans/A9_BATCH_2_ACCEPTANCE_COVERAGE.md)。

文档工具首次写任务书因本机Python的Path.write_text不支持newline参数而停止在写入前，
未生成半份任务书；改用文件patch完成。首次预览端口8765被占用，未停止原进程；使用OS自动分配loopback端口，
验证后关闭本次服务器和临时浏览器页。这些不涉及产品或系统设置。

## 2. 检查与证据等级

| 检查 | 结果与范围 |
|---|---|
| npm run docs:check | PASS；链接/任务索引/元数据/Accepted ADR不可变检查，最终数量以候选外checks-final.json为准 |
| git -c core.fsmonitor=false diff --check | PASS；本次差异，原有改动保留 |
| 新文件编码/JS语法 | PASS；UTF-8无BOM/LF、内联JS经Node语法检查；不是产品运行证明 |
| 浏览器设计演示 | 已观察运行中tick1、最终退出码0/双流、Stop、脱敏示例、保存投影不重复、重启interrupted、审计失败、长输出滚动与键盘Enter |
| 桌面四态 | 1366×768四态document.scrollWidth=1366，无页面横向滚动；可见停止入口，非Win7截图 |
| 主工作区保护 | 既有docs/README、EVIDENCE_ARCHIVE_RETRIEVAL及未跟踪check.py字节不变，两份ZIP仍保持既有删除状态；HEAD不变 |
| 产品/原生源码与候选 | 本次未改；产品测试、真实Electron、Win10原生构建、Win7、新候选均NOT_PERFORMED |

本机证据根：`.acceptance/maintenance/a9-batch2-docs-20260930/`（目录按原指令日期命名，完成日期为2026-10-01）。
保护快照protected-before.json、最终checks-final.json、demo-running.jpg及demo-desktop-1366.jpg。
截图仅本机浏览器设计演示，不签S01–S06、原生或Win7 PASS。Demo使用示例文本，未注入真实秘密。

## 3. 设计自检与尚未执行事项

取消同步writer采用CancelSynchronousIo；[Microsoft合同](https://learn.microsoft.com/en-us/windows/win32/api/ioapiset/nf-ioapiset-cancelsynchronousio)
给出Vista起最低版本且调用不等待完成。设计要求实际完成状态及Job回收证据，不将取消请求写成已清理。
本次仅查证API文档，真实Windows阻塞writer/取消仍NOT_PERFORMED。

后台退出发现现有KILL_ON_JOB_CLOSE与简单dispose(false)不能证明存活，将显式release/回执/回读/竞态/存活
纳入A9-31及独立managed kit和输入锁；这不是本次复现的实机事故。继续机制使用显式新Turn、事务身份/revision去重，旧副作用不重放。

下一依赖门为具体A9-30及ADR-0150审批、C15/C16登记；A9-31/32仍需各自审批和准确整合基线。
提交/推送、构建机写入、候选冻结/门A/B均不由本次草稿批准替代。本次未提交、未暂存、未推送、未发布、未恢复或删除既有文件。

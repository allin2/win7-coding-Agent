# A9-31 managed 身份修复与源码交接

## 当前结果

ADR-0156及[六路径修复合同](../../plans/A9_31_MANAGED_IDENTITY_REPAIR_APPROVAL.md)已获负责人具体批准。
实现仅修改该六项路径，source父基线d9b5be502c9475e50c54b349a6a12abd27b199f8，
分支codex/a9-31-background-tools；源码未提交，新包装批次r3未生成，旧managed r2仍FAIL_NOT_APPROVED。
[独立补充](a9_31_managed_identity_repair_independent_followup_2026-10-03.md)对静态修复P0/P1/P2=0/0/0，
不构成新kit批准或实际Windows通过。

## 修改与失败证据

捕获器核对实际helper PID并在control前固定root/child句柄、creation ticks、Toolhelp32父子关系；
查询缺失、错属、时间倒置、提前退出均拒绝。固定句柄等待真实退出，release两组要求root/child exit0。
managed汇总schema2、profile和verifier同步；取消根退出码与终态一致，旧/缺失身份或版本拒绝。
Toolhelp只读、不用WMI或权限回退；未完成reader保持失败/UNKNOWN，最终continuation只在reader完成后显式释放句柄。

原r2独立P1报告保留；主代理修复前的四类错误接受与修复后拒绝比较保留于
`native-kit-r2/review-negative-controls/identity-binding-before-fix.json`、`identity-binding-after-fix.json`。
首轮资源收尾P2独立回执保留；修复后另冻结r2输入、另跑kit全组，不重签前一finally的检查结果。

## 验证与继承

- 最终kit/recorder：90直接PASS、2 WindowsPS NOT_PERFORMED（总92）；最终log/receipt绑定最新六项冻结字节。
- 首轮完整release：199PASS、2 WindowsPS NOT_PERFORMED（总201），其中包装109项按未变调用/文件哈希继承。
- Core185、Runner166、State70、Shell114：535项按原始报告/组件/依赖哈希继承；328个module树文件与父HEAD逐字节相同。
- 有效唯一计数：90直接+644 INHERITED_EVIDENCE=734。定向21和首轮kit90与最终组重叠，不重复计数。
- verify:quick：7模块PASS；编译产生的24个Runner dist文件另存证据后恢复HEAD，不纳入源码提交。
- docs:check/diff：以最终日志为准。实际C#编译、Toolhelp与finally执行不能由Node fixture或静态复核代签。

精确矩阵为 `.acceptance/a9-31-developer/handoff/local-evidence-matrix-r4.json`，保留原report/run-id，
没有重绑旧报告。发布组件未受P2 build-script变化影响；该次变化后只补跑kit/recorder。

## 后续具体批准

本次16项源码/文档准确清单、快照与diff在候选外handoff/source-approval-r4.json及同批材料。
负责人批准该准确提交后才从新SHA生成未批准managed r3 ZIP，并重新核验23文件/Git闭包。
旧r1/r2 ZIP/manifest/锁与失败保留，17项旧生成文件不混入源码提交。
新kit完整复核、批准登记、本地提交、Win10新目录/普通身份/构建和返回重锁仍分别具体授权。
没有推送、合并、远端写入或构建；本任务继续IMPLEMENTATION_IN_PROGRESS，Win7 NOT_PERFORMED。

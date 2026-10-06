# A9-30 v26 构建身份门修复与独立复核

r2 撤销：真实受限令牌 ordinary_user=true 但 token_is_elevated=true、High RID 12288；未运行正式构建，未产生输入锁。保留原复核结论及失败探针，不改写历史。

修复直接读取 TokenElevation、TokenElevationType、Integrity SID/RID、Host Job；仅普通角色、非提升、Default/Limited、Medium SID/RID8192及明确无Job可构建。返回记录器使用严格字段类型和同一合同，缺失/未知拒绝。

独立只读复核人 /root/a9_30_native_kit_review；实现人 /root。复核原 P1 已闭合，P0=0/P1=0/P2=0；PowerShell5.1静态兼容无新增问题。此复核不等于新套件哈希批准或原生返回复核。

本地定向检查：node --test scripts/release/test/v26-prepare-kit.test.mjs scripts/release/test/a9-package.test.mjs：155项，154 PASS，1 Windows-only SKIP，0 FAIL。新增提升/High/缺字段/错类型/HostJob等8项负例。日志 `.acceptance/a9-30-developer/closeout/p1-token-gate-tests.log`。docs检查203文件/47任务通过，diff检查通过。

负责人已批准专用标准账户 a9builder 与三个目录权限；已创建且未入管理员组，密码未输出，受保护DPAPI文件保存。真实标准账户探针为非提升Medium；Start-Process启动子进程仍在HostJob，被新门拒绝。正在验证无HostJob启动路径。

正式原生构建、重锁、真实Electron、Win7：NOT_PERFORMED；不登记DEVELOPER_VERIFIED。

# Phase 1 Win7 实机前置验证

## MVP 结论

在 Win7 Professional SP1 x64（build 7601，`dccs-chaizl`，CPython 3.8.10 x64）上，标准验收树的 Phase 1 capability probe 连续 3 次均为 **18/18 PASS**，退出码为 0；同一部署树的 Phase 1 Python 回归为 **20/20 PASS**。MVP-20260802-12 进一步在 `C:\测试 目录\phase1 mvp`（中文+空格）运行 E2 预备探针：**17 PASS + 1 个预期 degraded（Git 不在进程 PATH）**，无 blocking check，`agent_runnable=true`，退出码 1；同一目录的回归仍为 **20/20 PASS**。本轮使用进程级 PATH 和自包含 CPython，不修改机器 PATH、网络、Bitvise 或系统服务。

证据：

- [schema v1 汇总报告](evidence/report_phase1_MVP-20260802-10.json)
- [MVP-20260802-07 probe](evidence/phase1_probe_MVP-20260802-07.json)（首轮）
- [MVP-20260802-09 probe](evidence/phase1_probe_MVP-20260802-09.json)（稳定性复测）
- [MVP-20260802-10 probe](evidence/phase1_probe_MVP-20260802-10.json)（稳定性复测）
- [MVP-20260802-12 E2 probe](evidence/phase1_probe_MVP-20260802-12_e2.json)（中文+空格路径、Git 缺失降级）
- [MVP-20260802-12 E2 汇总报告](evidence/report_phase1_MVP-20260802-12_e2.json)
- [MVP-20260802-12 E2 回归 stdout/stderr](evidence/phase1_e2_regression_MVP-20260802-12.txt)
- [MVP-20260802-12 compileall 证据](evidence/phase1_compileall_MVP-20260802-12.txt)
- 对应 SQLite 证据库与 `report.sqlite` 检查随 JSON 同目录保存。

## 已实测门禁

`os.version`、`python.runtime`、64 位进程、SQLite 回滚、临时目录、中文/空格/混合路径、显式编码与 BOM、CRLF 字节保持、子进程执行/超时/输出截断/进程树终止、受控 Git 探测、离线 Python TLS runtime、磁盘空间、用户临时目录和 SQLite 报告回读均通过。标准树三次报告 `agent_runnable=true`、`blocking_check_ids=[]`、`degraded=0`；E2 树报告 `agent_runnable=true`、`blocking_check_ids=[]`、`degraded=1`，唯一降级为预期的 `tool.git=TOOL_NOT_FOUND`。标准树和 E2 树的 CPython `compileall` 均以退出码 0 完成。

## 边界与未放行项

这批证据是 **Win7 实机运行前置和稳定性证据**，不自动改写 `docs/tasks/PHASE_01_CAPABILITY_PROBE.md` 的 `Phase-Gate: REPAIR_REQUIRED_BEFORE_E1`，也不把 E1/E2 正式合同标成完成。E2 的退出码 1 是任务书约定的可选 Git 缺失降级信号，不是未捕获错误。正式 Gate 仍需架构师解除修复冻结，并按任务书完成获授权的物理断网、干净环境及其余 E1/E2 条件。Phase 2 没有独立的 Win7 只读 Agent 入口，本轮不冒充 Phase 2 通过。

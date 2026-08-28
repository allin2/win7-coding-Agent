# A9-08 — WIN7-19 后置独立审查修复与 WIN7-20 增量复验

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_HARDENING
Target Branch: codex/a9-trusted-agent-runtime
Target Version: 0.3.0-alpha.1
Source Baseline: WIN7-19 / 781b20e3da277570f85c28286d7ea5bbbdd5fa28
Current Stage: A9-08
Current Stage Status: IN_PROGRESS_POST_REVIEW_FIXES
Target Candidate: WIN7-20
Win7 Validation: NOT_PERFORMED_FOR_WIN7_20
Decision: ADR-0100
```

## 1. 背景与裁决

WIN7-19 在当时执行和继承的验收范围内取得 `GO_FOR_ALPHA`，该候选、哈希和原始证据保持不可变。
随后项目负责人要求在合并前独立审查审批、状态迁移、进程停止、checkpoint 和秘密保护。审查与隔离动态
复现发现新的 P1：Shell 变体可绕过 `git push` 审批，已知秘密可进入事件/SQLite WAL/Renderer 快照，
以及 Provider、遗留 IPC、进程和恢复路径的其他硬缺陷。因此当前交付状态转为 `FIX_BEFORE_ALPHA`，
但不追溯篡改 WIN7-19 的现场执行事实。

本任务只修复已确认的后置审查缺陷并补齐相应回归；不实现 Alpha 2 Review，不重构无关 A8/A7 历史代码，
不修改 WIN7-19 ZIP、manifest、candidate identity 或候选外证据。

## 2. 实现授权与允许路径

- `src/core/src/**`、`src/core/tests/**`：Shell/Git 高影响分类与审批绑定。
- `src/shell/product/**`、`src/shell/tests/product/**`：A9 IPC、秘密边界、Provider 配置、退出和 Stop。
- `src/gateway/src/**`、`src/gateway/tests/**`：TLS/CA 与 Provider 凭据传输合同。
- `src/runner/src/**`、`src/runner/tests/**`：D-013 helper、进程树结果和并发停止。
- `src/workspace/src/**`、`src/workspace/tests/**`：checkpoint 身份、目录漂移、快照完整性和 undo 持久化。
- `src/state/src/**`、`src/state/tests/**`：跨工作区对话边界、迁移事务与 A8 物理数据库导入。
- `release/win7-product-v3/**`、`scripts/release/**`：WIN7-20 验证和确定性构建。
- `docs/**`、`AGENTS.md`、`README.md`：授权、状态、追踪、验收和发布说明。

不新增依赖、Runtime Profile、服务、注册表、PATH、防火墙或 TLS/SSH 弱化设置。不得删除或改写历史
Accepted ADR 和 WIN7-19 证据。

## 3. 需求追踪矩阵

| ID | 要求 | 当前状态 | 最小修复 | 开发机验收 | WIN7-20 必验 |
|---|---|---|---|---|---|
| A9R-01 | CMD/PowerShell 包装、转义或动态调用中的外部 Git 写入不得绕过审批 | divergent | 无法可靠静态解析时对可疑 Git push fail-closed；正确解析带值选项目标 | 分类器与 Policy 负向矩阵 | CMD/PS 5.1 真实拒绝/批准/变目标 |
| A9R-02 | Alpha 1 Renderer 不得调用延期的 A8 Review 写入链 | divergent | A9 产品入口不暴露、不注册遗留 mutation IPC | Preload/main IPC 边界测试 | Read Only/Full Access 下遗留动作零写入 |
| A9R-03 | 已知秘密不得进入事件、审批、SQLite、WAL、日志、checkpoint 或快照 | divergent | 在统一事件/审批持久化与展示边界递归脱敏 | 全 dataRoot 与 snapshot 扫描 | 普通用户秘密扫描 |
| A9R-04 | Provider 凭据绑定目标；Base URL 改变不得复用旧 Key | divergent | origin 改变时清除内存/DPAPI Key，空 Key 不继承 | 双 Provider 捕获测试 | Provider 切换负向 |
| A9R-05 | TLS 验证不得关闭；CA 缺失必须 fail-closed | divergent | 主进程拒绝 insecure 配置，Provider 拒绝缺失 CA | TLS/IPC 合同测试 | TLS/CA 负向 |
| A9R-06 | 正式 A9 Shell 使用已锁定 D-013 helper；清理结果不得虚报 | partial | 接入 helper transport；无法证明整树清理时报告 residue | 正式 composition 与进程树测试 | 双 Stop、崩溃、退出零残留 |
| A9R-07 | 无法清理时保留可操作窗口和锁，用户可重试/选择退出 | divergent | 关闭前完成退出决策；阻断时不销毁唯一窗口 | Electron 生命周期测试 | recovered PID/退出锁 |
| A9R-08 | checkpoint undo 不得恢复错对象或删除 Turn 后数据 | divergent | 目录树哈希、无碰撞快照身份、漂移拒绝、undo 持久化 | 目录/重启/篡改测试 | checkpoint/undo 增量矩阵 |
| A9R-09 | 对话操作必须受当前工作区约束 | divergent | restore/rename 验证 canonical workspace | 跨工作区负向测试 | 对话隔离抽样 |
| A9R-10 | v2→v4 迁移整体原子，真实 A8 物理库只读白名单导入 | divergent | 单一恢复边界或失败自动还原；显式 A8 source path | 故障注入与物理布局迁移测试 | v3→v4/回滚/fail-closed |

## 4. 批次和 Gate

1. `A9-08A_APPROVAL_IPC_PASS`：A9R-01～02。
2. `A9-08B_SECRET_PROVIDER_TLS_PASS`：A9R-03～05。
3. `A9-08C_PROCESS_LIFECYCLE_PASS`：A9R-06～07。
4. `A9-08D_CHECKPOINT_STATE_PASS`：A9R-08～10。
5. `A9-08E_DEVELOPER_REVIEW_PASS`：全量验证和第二轮独立审查无 P0/P1。
6. `A9-08F_WIN7_20_GO_FOR_ALPHA`：按 ADR-0097 完成候选必验项及所有直接受影响项。

每批独立提交并推送；后一批不得把前一批失败掩盖为完成。开发机 PASS 不冒充 Win7 PASS。

## 5. 完成条件

- 全部 A9R-01～10 具有连接真实产品入口的确定性回归证据；
- `npm run verify`、`npm run docs:check` 和包级验证通过；
- 第二轮独立审查没有未处置 P0/P1；
- WIN7-20 来自干净源码、双构建一致，在 Win7 SP1 x64 普通用户完成 ADR-0097 必验及影响项；
- 只有上述条件满足后才能恢复 `GO_FOR_ALPHA` 并合并 PR #3。

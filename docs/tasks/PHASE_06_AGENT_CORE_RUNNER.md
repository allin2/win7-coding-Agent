# PHASE_06 — Agent Core、Policy 与 Runner 任务书（AGENT_CORE_RUNNER）

> 实现前必读：`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、`docs/DECISIONS.md`（ADR-0012/0027/0029/0030/0031/0032）、本文档。
> 编号遵守 ADR-0012（阶段 6）。本文档为规划任务书，处于 DRAFT。

## 0. 实现授权（ADR-0011 / C14）

```
Status: DRAFT
Task Type: FORMAL_PHASE
Target Branch: phase/06-agent-core-runner
Phase-Gate: NOT_APPROVED
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Pending SPIKE_02/03 Go and Phase 03/04/05 completion (PC-003 ruled 2026-07-29)
```

前置：PC-003 裁决 + SPIKE_02 Go（containment/终端）+ SPIKE_03 Go（Git Adapter）
+ 阶段 03/04/05 完成。

### 0.1 路径白名单（获批后生效）

- `src/core/**`、`src/runner/**`、`src/git-adapter/**`、`native/helper/**`（C++ helper 源码）、
  `tests/core/**`、`tests/runner/**`、本文档 §13 验证记录。

禁止路径：其他阶段目录、`src/win7_agent/**`（legacy 冻结）、已 Accepted ADR 正文。

## 1. 目标

Node Agent Core（状态机、上下文管理、Policy、Broker、能力令牌）+ 通用 Runner
（C++ helper containment + Approval 三档）+ Git Adapter 集成 + winpty 交互终端
+ 并发配额（默认 2，同工作区写操作串行锁）。**Phase 2 §3 契约逐条对账移植**（ADR-0029）。

## 2. 非目标

- 不实现 Desktop UI（PHASE_07）；不实现 full-access 本地等价（ADR-0030 明令不做）。
- 不实现 MCP/Hooks 插件宿主（ADR-0035，推迟 v1.1）；不实现多 Agent 编排。

## 3. Runtime Profile（C15）

- Core：独立 `utilityProcess`（Electron main 仅编排；Core 内嵌 Node 16.17.1，`runAsNode` fuse 关闭、不用 `ELECTRON_RUN_AS_NODE`，ADR-0028）。
- Runner：Core 派生子进程，经 C++ helper（D-013）建立 Job Object + Restricted Token
  + ACL + argv 白名单 + **尽力限制网络（best-effort，非安全边界）**（ADR-0030，SPIKE_02 冻结的 helper 接口 argv + JSON over stdio）。
  Job/Token/ACL 不阻断 Winsock；强制断网须走远程隔离或企业 WFP，不得在本地宣称禁网/硬隔离。
- 终端：独立 winpty 宿主（D-011，ADR-0031），stdin 仅接用户输入；Runner 无 pty、stdin 关闭。
- Git：经 Git Adapter（D-012，ADR-0032 隔离配置 + 命令白名单）。

## 4. 核心机制

- **状态机**：任务生命周期状态转移（继承 Phase 2 §3 语义 + Replay 一致性 ADR-0026）。
- **Policy/Broker**：工具调用经 Policy 裁决 + 能力令牌；结构化 argv，绝不执行模型拼接的 shell 字符串。
- **Approval 三档**（ADR-0030）：read-only / workspace-write / 无 full-access；`IsProcessInJob` fail-closed。
- **并发**：默认上限 2（PERFORMANCE_BUDGET #9）；同一工作区写操作串行锁避免冲突。
- **契约对账清单**：附录逐条列 Phase 2 §3 契约与 §7 F 矩阵（继承 / 有据变更 / 不适用三态 + 理由）。

## 5. 错误模型

| 错误码 | 触发 | 处理 |
|--------|------|------|
| `CONTAINMENT_UNAVAILABLE` | `IsProcessInJob` 探测失败或已在不可嵌套 Job | fail-closed：高风险命令拒绝或远程（ADR-0030） |
| `POLICY_DENIED` | Policy 拒绝工具调用 | `tool.denied` + `state.transition_rejected`（ADR-0026 语义） |
| `APPROVAL_REQUIRED` | 超 workspace-write 边界 | 逐条显式审批或路由远程 |
| `CONCURRENCY_LIMIT` | 超并发上限 | 排队，不超配额 |
| `WORKSPACE_WRITE_LOCK` | 同工作区并发写 | 串行化 |

## 6. 测试矩阵

- 状态机/Policy/Broker 单元 + Replay 一致性（对账 Phase 2 F 矩阵）。
- Runner containment 集成（复用 SPIKE_02 负向用例）：进程树必杀、注入拒绝、网络可达性实测（记录 best-effort 限制的实际效果，不作隔离断言）。
- Git Adapter 集成（复用 SPIKE_03 G10 矩阵）。
- 终端：模型不能写 stdin（N01）、VT/OSC 过滤、会话回收。
- 并发：2 任务并发 + 同工作区写串行；资源不超 #4/#9/#10。
- 静态门禁 G1~G10；安全负向 C19/C20/containment。

## 7. 验收（E5/E6）

- E5：干净 Win7 端到端任务闭环（检索→计划→审批→执行→审计）。
- E6：中文+空格路径 + 缺失工具（Git 缺失降级、containment 不可用 fail-closed）。
- Win7 实机验收前 Phase-Gate 至多 `READY_FOR_WIN7_VALIDATION`。

## 13. 验证记录（占位）

```
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Target environment unavailable
```

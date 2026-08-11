# INTEGRATION_03 — A4/A5/A6 整合收口与 A7 Gate

## 0. 实现授权（ADR-0011 / C14）

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: INTEGRATION_CLOSEOUT
Target Branch: codex/integrated-robustness
Authorization: Project owner implementation request, 2026-08-12
Phase-Gate: APPROVED_FOR_CLOSEOUT
Win7-Compatibility: EVIDENCE_REUSE_ONLY
Win7-Validation: NO_NEW_WIN7_EXECUTION
Blocking-Reason: A5_NOT_INTEGRATED_AND_A7_GATE_NOT_RECORDED
```

### 0.1 允许路径

- `docs/STATUS.md`、`docs/DECISIONS.md`、`docs/tasks/**`、`docs/status/**`
- `spikes/02-terminal-containment/**`（仅合入已验收 A5 实现、证据与局部属性）
- `scripts/mvp_acceptance/win7_coordinator/**`
- `native/helper/**`、`src/runner/**`、`src/core/**`、`src/shell/**`
- `tests/runner/**`、`tests/core/**`、`tests/shell/**`

不授权新增产品能力、重新执行 Win7 验收、修改原始证据字节、提交大型返回包、私钥、凭据、
`node_modules`、缓存或临时文件。A6 的 `SPIKE_04 WIN7_PASS` 不得被旧分支状态覆盖。

## 1. 收口合同

| ID | 要求 | 确定性验收 |
|----|------|------------|
| CL-01 | A4 `eee6219`、A5 `af589dc`、A6 `fb2084d` 均进入整合祖先链 | `git merge-base --is-ancestor` 全部为真 |
| CL-02 | 保留 A6 的规范 ADR-0066；A5 本地 ADR-0066～0071 以新编号导入 | `docs/DECISIONS.md` 编号唯一且引用无歧义 |
| CL-03 | SPIKE_02 如实记录交互 winpty No-Go 与非交互 Runner Win7 PASS | 不把交互终端或网络隔离宣称为 PASS |
| CL-04 | A5 原始证据字节不变，补丁空白检查通过 | 证据 manifest 哈希复核及 `git diff --check` |
| CL-05 | A4/A5/A6 非 Git 工件在移除 worktree 前完成外部归档 | 外部 manifest、逐文件 SHA-256 与原路径链接一致 |
| CL-06 | A7 只从干净的最终收口提交创建 | A7 分支基线等于正式 closeout commit |

## 2. 受限 SPIKE_02 裁决

项目负责人选择 `NO_GO_INTERACTIVE_WINPTY + WIN7_PASS_FOR_LOW_RISK_NONINTERACTIVE_RUNNER` 作为
Win7 v1 的正式结论，并允许 `A7_GATE=PASS_FOR_WIN7_V1_RC`。这不恢复 Renderer 终端输入，不授权
Shell/任意路径/高风险命令，也不把 Job、Restricted Token 或 ACL 解释为网络隔离。

## 3. 交付与边界

- 本任务只形成整合提交、正式状态、工件归档记录、worktree 收口和 A7 Gate。
- 收口期间不签发 Win7 租约，不连接目标机，不修改网络、路由、防火墙、PATH、服务或系统配置。
- A7 的 RC 构建、安装、升级、回滚、卸载和 Win7 实机验收由独立 `RC_01` 任务书授权。

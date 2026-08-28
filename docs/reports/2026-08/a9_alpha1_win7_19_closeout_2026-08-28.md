# A9 Alpha 1 WIN7-19 收口报告

## 裁决

`A9_ALPHA1_PASS / GO_FOR_ALPHA`。WIN7-19 在 Windows 7 SP1 x64 实机关闭 WIN7-18 的审批身份复用 P0，
完成 ADR-0097 要求的候选必验项、直接影响项和后飞行检查；其余能力具有可追溯继承证据。当前无 P0/P1，
可作为内部 `0.3.0-alpha.1` 交付，但不是 Review PASS 或 RC PASS。

机器可读摘要见
[`a9-alpha1-win7-19-acceptance-20260828.json`](../../status/a9-alpha1-win7-19-acceptance-20260828.json)。
原始报告、查询和截图保存在候选外 WIN7-19 验收档案中，不进入 Git 或发布 ZIP。

## 候选身份

| 项目 | 值 |
|---|---|
| 候选 | `WIN7-19 / Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip` |
| 源码提交 | `781b20e3da277570f85c28286d7ea5bbbdd5fa28` |
| 源码状态 | `source_dirty=false / external_acceptance_eligible=true` |
| ZIP SHA-256 | `824a10cd213534aca87c348d8304b053d27a5bd896831daf528ed13b1c1c72b0` |
| manifest SHA-256 | `b483e9b0bcab19cf96114bda39e5d8a9ef8a48842c9aaabbaabfa7e87af12c26` |
| manifest | 780 文件 |
| State schema | v4 |
| 可复现性 | 两次构建字节一致 |

本地候选、sidecar、包内 manifest 与 candidate identity 在上传前后相符；`RUN_A9_07_INTEGRITY.cmd`
对 ZIP 绑定、manifest、物理全树、native/ABI 和无系统 Node 五项均通过。旧候选和旧程序目录保留用于回退。

## 环境矩阵

| 层 | 环境与结论 |
|---|---|
| OS | Windows 7 Professional SP1，build 7601，x64 |
| 交互桌面 | `agent` 普通用户，console session 2，作为 UI 权威环境 |
| 管理通道 | Bitvise 9.66；严格主机密钥校验保持开启 |
| 显示 | 1366×768；100% 主执行，125% 复用既有覆盖 |
| Shell | PowerShell 5.1.14409.1018 优先，CMD fallback 可用 |
| Git | 2.46.2.windows.1；普通用户 PATH 不含 Git，锁定绝对路径可用 |
| 安全设置 | 未修改 PATH、注册表、服务、防火墙、TLS 或 SSH 校验 |

## 当前候选实际执行

| 项目 | 结果 | 证据摘要 |
|---|---|---|
| 身份与完整性 | PASS | 本地/目标 ZIP、sidecar、manifest、candidate identity 一致；包完整性 5/5 |
| 正式生命周期 | PASS | 正式 `electron.exe` 启动、退出、重启；普通用户关闭后重启，历史保留且审批不重放 |
| 审批分类 | PASS | 包内分类器把复合 CMD 中绝对 `git.exe push` 识别为 `always_confirm` |
| 新身份 | PASS | 新对话、另一新对话、同对话新 Turn、变更目标共四张卡，审批 ID 均不同 |
| 单次消费 | PASS | 三个拒绝 Turn 均为 `tool_start=0`；快速重复点击已批准卡仅一次 `tool_start` |
| 目标变化 | PASS | `w19-changed-target` 生成新绑定卡，拒绝后零执行 |
| 外部写入 | PASS（边界） | 批准命令只到达 Git 一次；`safe.directory` 阻止 push，bare remote 仍为空 |
| 后飞行 | PASS | ZIP/manifest 哈希不变、受管进程 0、Bitvise Running、秘密模式命中 0 |
| 报告校验 | PASS（结构） | `RUN_WIN7_17_REPORT_VERIFY.cmd` exit 0，验证 8 个 case 记录 |

Git 所有权保护导致 push 未成功，不是审批 Gate 失败：验收目标是证明执行前确认、身份绑定、一次性消费和
变更目标零执行，而非向 remote 制造写入。未为了“通过”添加全局 `safe.directory` 或改变系统配置。

## ADR-0097 继承范围

WIN7-19 相对 WIN7-18 只修改 `git-command-policy.ts` 和两份审批回归测试，直接影响范围为 Windows 引号内
反斜杠分词、Git push 分类及审批身份。下列七组未受影响能力保留为 `INHERITED_EVIDENCE`，不冒充
WIN7-19 现场 PASS：

- 16 个未归档对话、17th 拒绝、切换/重命名/归档/恢复及隔离；
- 本地完整历史、Provider 20 轮/32,000 字符边界与跨对话隔离；
- schema v3→v4 备份、回滚和 fail-closed；
- DPAPI 草稿密文与可见内存降级；
- checkpoint 完整身份、崩溃恢复、撤销和不重放；
- 双 Stop、recovered PID 保护、退出锁和零残留；
- PowerShell/CMD、中文空格、编码换行、路径/token 与严格 SSH 主机密钥行为。

包内报告 verifier 的 schema 没有 `INHERITED_EVIDENCE` 枚举，因此七组在 WIN7-19 报告中保持
`EVIDENCE_PENDING`；这是刻意避免伪造“当前候选已重跑”，不否定 ADR-0097 的最终裁决组合。

## Findings 与允许延期

- P0：无。WIN7-18 `APPROVAL_REUSE` 已关闭。
- P1：无。
- P2：1366×768 默认缩放下对话列表拥挤，已归档入口可能需要缩小；普通用户 PATH 无 Git；复用的
  管理员所有仓库触发 `safe.directory`；Bitvise Session 0 的 DPAPI/GPU 降级可见且不落秘密明文。
- Alpha 2：完整 Review 工作流、轻微布局与 125% DPI polish。
- RC 前：补齐 Win10 同候选 smoke。

## 残余风险

- 七组未受影响能力依赖 WIN7-17/18 的继承证据，未在 WIN7-19 全量机械重跑。
- 成功 push 本身未发生；Git 在执行一次后因仓库所有权保护退出 128，但审批安全边界已直接验证。
- 本报告仅授权内部 Alpha 使用；不得外推为 Review、Win10 或 RC 通过。

## PR 交付边界

阶段 PR 包含 A9 实现、审批分词修复、回归测试、任务/ADR/状态与本收口摘要。候选 ZIP、sidecar、原始截图、
SQLite 查询、API 凭据和候选外验收目录均不进入 Git。PR 推送后，源码提交的“尚未远端可达”残余风险关闭。

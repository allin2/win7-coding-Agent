# PHASE_04 — Workspace 与文件写入任务书（WORKSPACE_WRITE）

> 实现前必读：`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、`docs/DECISIONS.md`（ADR-0012/0027/0030）、本文档。
> 编号遵守 ADR-0012（阶段 4）。本文档为规划任务书，处于 DRAFT。

## 0. 实现授权（ADR-0011 / C14）

```
Status: DRAFT
Task Type: FORMAL_PHASE
Target Branch: phase/04-workspace-write
Phase-Gate: NOT_APPROVED
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Pending SPIKE_04 Go (PC-003 ruled 2026-07-29)
```

前置：PC-003 裁决 + SPIKE_04 Go（存储/索引基线）。

### 0.1 路径白名单（获批后生效）

- `src/workspace/**`、`tests/workspace/**`、本文档 §13 验证记录。

禁止路径：其他阶段目录、`src/win7_agent/**`（legacy 冻结）、已 Accepted ADR 正文。

## 1. 目标

编码感知的工作区读写：编码确定性识别、Plan/Apply 双阶段写入、原子事务写入与回滚、
diff 审批、ShadowWorkspace（兑现原型迁移矩阵 M-17 DEFER）、junction/reparse 边界防逃逸。

## 2. 非目标

- 不实现文件删除/重命名（PRD §20 v1 假设：v1 不删改名）。
- 不实现命令执行 Runner（PHASE_06）；不实现审批 UI（PHASE_07，本阶段只定义审批数据契约）。

## 3. Runtime Profile（C15）

- 运行时：Electron 内嵌 Node 16.17.1（ADR-0028）。
- 编码识别顺序（继承 PRD §8）：BOM → 严格 UTF-8 → 严格 GBK → `AMBIGUOUS`（人工确认）。
- 换行：保持原文件 CRLF/LF；编辑不无关改写整文件换行或 BOM。
- 路径：Node path API + 规范化；工作区根边界须解析 Junction/Symlink/Mount Point（W7C）。

## 4. Plan/Apply 双阶段与写入事务

1. **Plan**：产出计划哈希 + 每个目标文件的 `base_sha256`；供用户审批。
2. **Apply**：写入前校验 `base_sha256` 未变，否则 `REPLAN_REQUIRED`（拒绝盲写）。
3. **写入事务**：备份 → 原子替换（临时文件 + rename）→ 重读校验 → 失败回滚到备份。
4. **ShadowWorkspace**（M-17）：在影子副本上预演写入与验证，再决定 Apply。

## 5. 错误模型

| 错误码 | 触发 | 处理 |
|--------|------|------|
| `ENCODING_AMBIGUOUS` | 编码无法确定 | 停止写入，请求人工确认 |
| `REPLAN_REQUIRED` | Apply 时 `base_sha256` 与计划不符 | 拒绝写入，要求重新 Plan |
| `WORKSPACE_BOUNDARY_VIOLATION` | 目标路径经 reparse 解析后逃出工作区根 | 拒绝 |
| `ATOMIC_REPLACE_FAILED` | 原子替换失败 | 回滚备份，结构化失败 |
| `VERIFY_MISMATCH` | 写后重读校验不符 | 回滚备份 |

## 6. 测试矩阵

- 编码：BOM/UTF-8/GBK/AMBIGUOUS 各分支；CRLF/LF 保持。
- 事务：备份→替换→校验→回滚全路径；断电/中途失败注入。
- 边界：junction/symlink/mount point 逃逸尝试全部拒绝；中文+空格+长路径。
- Plan/Apply：`base_sha256` 变更触发 `REPLAN_REQUIRED`；ShadowWorkspace 预演一致性。
- 静态门禁 G1~G10。

## 7. 验收（E5/E6）

- E5：干净 Win7 上写入-校验-回滚闭环。
- E6：中文+空格+长路径 + reparse point 边界；缺失工具不影响核心写入。
- Win7 实机验收前 Phase-Gate 至多 `READY_FOR_WIN7_VALIDATION`。

## 13. 验证记录（占位）

```
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Target environment unavailable
```

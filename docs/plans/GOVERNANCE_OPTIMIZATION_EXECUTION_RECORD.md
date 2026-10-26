# 治理优化统一执行记录

依据：[DOCS_06](../tasks/DOCS_06_GOVERNANCE_CHECK_AND_LIFECYCLE.md)。
2026-10-06 负责人已直接授权本地修复、规则与生命周期同步、审批材料收敛和空间盘点。
当前记录是开发机治理结果，不是产品或 Win7 验收证据。

## 1. 实际基线

| 工作树 | 分支 | HEAD | 本轮范围 |
|---|---|---|---|
| 主工作区 | codex/a9-alpha2 | a53c9b9d… | 修复检查器，保留已有修改 |
| main | main | c14a9680… | 本地治理同步 |
| A9-30 | codex/a9-30-shell-streaming | c2b6356f… | 本地治理同步 |
| A9-31 | codex/a9-31-background-tools | 571ec550… | 本地治理同步，保留已有修改 |

基线、原文件副本和验证结果位于主工作区 `outputs/governance-optimization-20261006-r1/`。
其他绑定/检查工作树与所有候选、原始验收证据保持原字节。

## 2. 执行状态

| 阶段 | 当前状态 | 下一动作 |
|---|---|---|
| 检查器漏检 | PASS（开发机，四个本地 HEAD） | 中英文保护、ADR 索引和分区检查已覆盖 |
| 规则与任务生命周期同步 | PASS（开发机，四个本地 HEAD） | 核对最终摘要与保护范围 |
| 审批材料收敛 | PASS（开发机文档） | 后续同范围迭代使用本节约定 |
| 空间维护 | PASS（开发机盘点与计划） | 6 个 dirty 工作树保留，3 个干净快照仍 UNKNOWN |

提交、推送、合并、发布、空间删除和 Win7 实机验证均未授权执行。

## 3. 变更与验证记录

2026-10-06：保存四个活跃工作树的 HEAD、工作区内容摘要及治理文件原副本。
主工作区已登记 DOCS_06；检查器实现尚未修改。

2026-10-06 后续：先保存旧检查器放行英文 Accepted 正文变更和索引缺项的两个内存反例。
修复后 25 项真实入口检查通过。增加任务分区检查时曾发生括号缺失，解析门发现后修正；29 项定向检查通过。
四个活跃工作树的检查器、AGENTS、CLAUDE 和规范文件 SHA-256 一致。
四处文档检查均 PASS：主工作区 203 文件、main 196 文件、A9-30 227 文件、A9-31 325 文件。
ADR-0146 只对齐索引标题；原 ADR 正文与原任务书状态保持。
以上结果绑定 §1 的四个本地 HEAD 及本轮未提交文件，不代表远端或产品验证。

## 4. 空间对象与后续维护计划

2026-10-06 开发机盘点。沿用 docs/acceptance/EVIDENCE_ARCHIVE_RETRIEVAL.md 的已有归档与恢复规则。
详细元数据、Git 状态、分支可达性、局部引用和进程观察位于本轮私有证据目录。
本轮没有 READY_FOR_APPROVAL 对象。删除和归档上传均 NOT_PERFORMED。

| 明确目标（绝对路径） | 分配体积 MiB | 处置 | 依据与最短下一动作 |
|---|---:|---|---|
| `/Users/qlyf/Developer/win7-coding-Agent/.git` | 371.6 | `KEEP` | 保护 Git 历史。扫描跳过 14 个 IPC socket，文件统计不代表完整对象类型覆盖；不改写历史。 |
| `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance` | 3366.8 | `KEEP` | A9-31 当前及历史证据。任务尚未完成 Win7，保留旧失败与基线；候选/证据解除保留后才设计单独归档恢复。 |
| `/Users/qlyf/.codex/worktrees/95aa/win7-coding-Agent` | 297.2 | `UNKNOWN` | Git 干净，新增独有提交计数 0；观察到 Git 进程占用。局部报告引用 0 处。其他对话使用与恢复尚 UNKNOWN。先确认使用结束及依赖链接，随后重新评估。 |
| `/Users/qlyf/.codex/worktrees/a9-30-kit-binding/win7-coding-Agent` | 297.8 | `KEEP` | 存在未提交内容。先确认对应绑定合同、独有修改和恢复闭包；不使用 force 移除。 |
| `/Users/qlyf/.codex/worktrees/a9-30-kit-r2-binding/win7-coding-Agent` | 297.8 | `KEEP` | 存在未提交内容。先确认对应绑定合同、独有修改和恢复闭包；不使用 force 移除。 |
| `/Users/qlyf/.codex/worktrees/a9-30-kit-r3-binding/win7-coding-Agent` | 297.9 | `KEEP` | 存在未提交内容。先确认对应绑定合同、独有修改和恢复闭包；不使用 force 移除。 |
| `/Users/qlyf/.codex/worktrees/a9-30-kit-r4-binding/win7-coding-Agent` | 297.9 | `KEEP` | 存在未提交内容。先确认对应绑定合同、独有修改和恢复闭包；不使用 force 移除。 |
| `/Users/qlyf/.codex/worktrees/a9-30-kit-r5-binding/win7-coding-Agent` | 297.9 | `KEEP` | 存在未提交内容。先确认对应绑定合同、独有修改和恢复闭包；不使用 force 移除。 |
| `/Users/qlyf/.codex/worktrees/a9-30-kit-r6-binding/win7-coding-Agent` | 297.9 | `KEEP` | 存在未提交内容。先确认对应绑定合同、独有修改和恢复闭包；不使用 force 移除。 |
| `/Users/qlyf/.codex/worktrees/a9-30-note-package-check/win7-coding-Agent` | 297.9 | `UNKNOWN` | Git 干净，新增独有提交计数 0；观察到 Git 进程占用。局部报告引用 2 处。其他对话使用与恢复尚 UNKNOWN。先确认使用结束及依赖链接，随后重新评估。 |
| `/Users/qlyf/.codex/worktrees/a9-30-product-r6-check/win7-coding-Agent` | 297.9 | `UNKNOWN` | Git 干净，新增独有提交计数 0；观察到 Git 进程占用。局部报告引用 2 处。其他对话使用与恢复尚 UNKNOWN。先确认使用结束及依赖链接，随后重新评估。 |

扫描体积不能相加作为预计释放空间。APFS 克隆、共享依赖、嵌套目录和回收站影响实际空间。
三个干净快照的逻辑体积约 881 MiB；尚不能转换为可释放空间承诺。
引用检索仅覆盖四个活跃工作树的 AGENTS/CLAUDE、docs、scripts、release；未扫描其他对话。
历史包和数据库不能仅按名称、时间或分支是否已合并判为可删。
恢复工具、密钥和历史归档由原索引定位；本轮未联网或执行恢复，不能写成恢复 PASS。
## 5. 后续审批和交接记录用法

新任务或执行方案在已有任务书中一次写清下表。具体批准留在同一记录，不另起同范围批准材料。
本约定不代替原合同的候选冻结、安全复核、门 A/B 或高影响操作批准。
旧任务固定边界发生变化时，列出准确差异后按原合同处理；不追溯扩大旧批准。

| 字段 | 写入内容 |
|---|---|
| 交付结果与基线 | 用户可见结果，实际分支/HEAD、已有修改、输入和产物 |
| 允许动作 | 精确路径、目标和动作；提交、推送、发布分别列明 |
| 同范围修复 | 可修复组件、不可变版本/run 规则；不覆盖已执行输入 |
| 重试与停止 | 允许次数/时限、身份与安全硬停止、两轮同类失败的最小诊断 |
| 验证与继承 | 真实入口、受影响矩阵、继承依据、NOT_PERFORMED |
| 结果与交接 | 首失败、原因、当前输入、原始证据、实际收尾和下一动作 |

仅过程性批准、提交或重试记录写入上述表；影响接口、格式、兼容性、安全模型或 AGENTS 的决定继续新增 ADR。
历史批准材料不移动、不删除、不改写 Accepted 正文。交接通过任务索引和本记录定位，不复制多个“当前状态”。

## 6. 收尾与交付边界

本次只完成本地治理修改、检查和空间维护计划。提交、推送、合并、发布、删除、归档上传与 Win10/Win7 产品验证均 NOT_PERFORMED。

四个本地 HEAD 保持 §1 基线。既有白名单之外的文件按 baseline.json 逐 SHA-256 复核；结果写入 preservation.json。完整验证结果写入 final-validation.json。

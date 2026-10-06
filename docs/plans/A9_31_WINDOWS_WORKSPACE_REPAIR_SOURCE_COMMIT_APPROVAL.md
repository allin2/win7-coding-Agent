# A9-31：Windows 工作区归属修复的准确源码提交审批材料

日期：2026-10-04。Status: APPROVED_AND_COMMITTED。原请求和五路径字节绑定保留，结果见§4。

## 1. 已完成结果及请求

负责人已批准三路径修复、规定检查和共性问题修复。实现只涉及原批准三文件；修复Windows归属误拒绝、等价路径查回历史managed事实、POSIX大小写误判。
State 82/82、Shell 117/117、七模块verify:quick、268份文档/48份任务书及diff --check通过；首轮失败保留。真实新包Windows及Win7未执行。

现请求追加一次本地提交，分支`codex/a9-31-background-tools`，准确父提交`35a19250ed6589f6a7ba35b940a784325970c111`；仅含下表五路径，不包含当前其他已修改或未跟踪文档。提交说明建议为`fix(state): normalize managed workspace ownership matching`。

## 2. 准确允许提交字节

| 路径 | bytes | SHA-256 |
|---|---:|---|
| src/state/src/a9-persistence.ts | 95533 | fc7a3b9a78c5ed2cdfe595d8d32f172f73ec38d536939d21d9257f4495160b4a |
| src/state/tests/a9-managed-process-ownership.test.ts | 8372 | 507a0363fc442de64fa4f313eecf11c7ac0a92754b90a496fe80366ee0be46dd |
| src/shell/tests/product/a9-background-tools.test.ts | 18755 | e1820080f08b3a6200ea35ee9d945722976ecccde7f192ed7b47ed8667899e3f |
| docs/plans/A9_31_WINDOWS_WORKSPACE_OWNERSHIP_REPAIR_APPROVAL.md | 6654 | 776fc053a25a35f4b9cf53a054d8170620a17c3c4542cde3d670c60f9b08bec1 |
| docs/reports/2026-10/a9_31_windows_workspace_ownership_local_repair_2026-10-04.md | 8935 | 8cf020327a0d7eaca9fb14d5789b1725d63e79d70a1662f66ced8121479c382f |

原三个源码的准确diff和快照及本次五文件快照保存在`.acceptance/a9-31-developer/windows-workspace-repair-r1/`；`source-commit-handoff.json` SHA-256 `e0364118ea954e749600fd6f14c399c561ec1645d84526da4b9f6c9b2c496234`绑定本表和父提交。审批前及提交前核对字节；发生变化时不沿用本次字节批准。
本审批材料本身不在拟提交五路径内。

## 3. 执行与停止边界

批准后仅逐项暂存这五路径、校验暂存blob与本表、追加提交并核对父提交/提交路径/字节。不改写历史、不推送、不合并，不暂存主工作区或当前其他修改。
保留本地原始证据和生成dist副本；不将历史tracked Runner dist作为新包输入。后续source-bound干净checkout需要按生产者合同重编全部sibling模块。

本次提交不批准新打包、远端新目录/写入、普通桌面新控制器、独立审核或Win7候选；这些动作绑定新source及具体合同另行形成材料。native源码与managed锁不变，不要求原生重建；旧R10不恢复、不重绑。

需要此具体批准的依据为[A9-31任务书](../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)§6：“本任务后续源码提交、原生kit批准/双构建、远端新目录/写入、本地整合与候选门另行具体批准”。本轮修复批准不替代源码提交批准。

## 4. 具体批准及提交结果（2026-10-04）

负责人对本材料五路径请求回复“批准”。批准时本材料SHA-256为`c318e2ad7fc130726eacd3d0a595fcf47fd6671bf33bb96edaa6c4deceb8bdea`，批准与暂存验证分别保存在`source-commit-owner-approval.json`/`source-commit-staged-verification.json`。
已追加本地提交`898ee9459a9b987840e94ddef336556ea58dd389`，父提交仍为§1准确父提交，五个提交blob逐项匹配§2尺寸/SHA。实际提交exit0；其余35个已修改/未跟踪文件逐字节核对保持一致。实现工作区及index干净，其他历史文档修改保留。
`source-commit-result.json` SHA-256 `ed8dc6b0577796ec2066975b00eb44b94bd766f2939509dcb53f5131600a4d0c`提供提交路径、父/source、字节与保护结果，位于原本地证据根；原测试所测源码与新提交blob完全相同，检查引用不改绑旧Windows报告。
未推送/合并/新打包/远端写入/原生重建/委派。真实新包Win10、独立收口和Win7仍NOT_PERFORMED。后续本地打包的准确材料见[A9-31开发包r2合同](A9_31_PRODUCT_R2_LOCAL_PACKAGE_APPROVAL.md)，尚未批准执行。

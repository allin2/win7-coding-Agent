# A9-31 product r1：停止后 R2 新控制器准确重试合同

```text
Status: READY_FOR_OWNER_R2_RETRY_APPROVAL
Branch: codex/a9-31-background-tools
HEAD/source: 35a19250ed6589f6a7ba35b940a784325970c111
Product/native bytes: UNCHANGED
Remote R2 creation/execution: NOT_PERFORMED
```

## 1. 适用门与保留事实

[原具体执行合同](A9_31_PRODUCT_R1_WIN10_VALIDATION_APPROVAL.md)及ADR-0159已经批准。
原合同§6明确“HALTED后的新合同仍单独具体裁决”；r1因合法请求字段误计数停止，不能在原入口重试或覆盖final。
[首失败与修复事实](../reports/2026-10/a9_31_product_r1_controller_first_failure_and_r2_repair_2026-10-03.md)绑定普通身份、持有句柄退出1/0及零产品派发。
本材料申请新执行身份，旧r1目录、四脚本、pin和全部首失败原文/字节保留，不删除、不改判。

## 2. 四路径夹具修复与固定哈希

源路径仍是原合同已获批准的四项C14路径：

| 精确路径 | bytes | SHA-256 |
|---|---:|---|
| `.acceptance/a9-31-developer/product-r1/control-scripts/stage-product-r1.ps1` | 5402 | `ce8a3b8e625c63ffc5cdf35f4ad992f89913226b6494b6bdf8e7ac66de710d4c` |
| `.acceptance/a9-31-developer/product-r1/control-scripts/launch-product-r1-desktop.ps1` | 2562 | `88b96d5851729e96704e6c3add1b8888959c4c429c7715343df22e5c0afbd0b0` |
| `.acceptance/a9-31-developer/product-r1/control-scripts/serve-product-r1-desktop.ps1` | 20794 | `6976eec88ce8964a52b9fbf139157b4dedd8cf24d87f09ee7cc0983da1aef9b8` |
| `.acceptance/a9-31-developer/product-r1/control-scripts/product-r1-driver.cjs` | 41316 | `1ad98c9d4f4304c2dece7634721f2d94614b834c6e6c243d131baf3f39a2cf72` |

R2修复原始字段解析，保持固定九字段、严格类型、重复拒绝及全部安全门；ready如实写WAITING。
ASCII UTF8无BOM/LF fixture和显式字节输出减少PS5.1编码与Policy歧义，测试秘密由片段组成。
三PS实际解析、69原始请求检查及Node32项检查PASS，四源副本和proposal绑定已形成。
不增加任意command/PID/path/env请求字段，不修改产品或锁。

## 3. 准确新目标与输入

仅192.168.1.4 / WIN-2JQ66JE4HTQ / Win10build19045；普通SID1005 / Session3 / Medium8192 / 非提升 / noHostJob。
新根：

```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261003-R2
```

只创建 `inputs`、`package`、`host`、`control`、`runs`、`evidence` 六个准确子目录，原r1不写。
输入仍是source35a1925、ZIPaae71bb0…d2f10c0、manifestdf70fa5b…97e7b9、managed锁7593e758…461d3e和helper2036bf69…51e4b7；
完整哈希、Electron ZIP与registry副本沿用原合同§1及r2 proposal，不重绑历史报告。
新pin由实际批准登记、四hash、相同输入和R2新根生成并CreateNew冻结；执行前完整核对。
Administrator仅管理创建、准确输入传输、校验、SSH固定调度及回收；产品在普通桌面新监督器启动，身份重新实测。
不改ACL、owner、账户、UAC、Job、Bitvise或服务，不安装软件；SSH保持StrictHostKeyChecking=yes。
初次至少2GiB余量，每请求至少1GiB，新根累计不超过1GiB；不足停止，不清理旧材料。

## 4. 本次允许执行与失败边界

沿用原合同§4–5的准确8phase、最多2小时/16请求、隔离数据和持有句柄/creation/parent/实际exit/tree硬门。
R2使用独立run-id，普通身份、完整闭包和实际Electron均重新实测。
Boot、Shell通过后推进其余phase；INCOMPLETE及未知不得写PASS。release回执丢失和取消竞态补充仍须在固定phase范围内完成。
普通夹具失败只有实际树已结束才能接新隔离请求；身份、安全、完整性、审计及未知生命周期仍HALTED，停止后不复活。
GUI仅用于必要普通桌面启动和原生退出选择，其余由SSH调度。
批准覆盖相同四路径内必要修复、定向检查、不可变版本和最终hash冻结，以及准确R2部署、启动及回收。
改变目标、phase、安全合同或白名单时重新形成具体差异，不默认另启代理。

## 5. 不包含的动作

不提交、推送、合并、发布，不改包/native或重新原生构建，不分配Win7候选编号。
独立P1=1和历史controller UNKNOWN保留。最终独立收口另行具体授权；Win7、Alpha2及RC未裁决。


## 6. 负责人实际批准登记

负责人对本合同§1–5回复“批准”，登记时间 `2026-10-03T08:19:48.773155+00:00`。
允许准确R2新根、同四路径和相同冻结包下实现修复、最终hash冻结、受控普通桌面验证及回收；原停止/未知边界不变。
前文READY及NOT_PERFORMED保留为批准前历史；执行结果以后续真实记录为准，不包含提交/推送/整合/发布。

## 7. R2 部署与装配实际记录

准确新根及六个子目录已创建，九份准确输入已传输；未改账户、ACL、UAC、Job 或 Bitvise。
2026-10-03T08:26:21.2478551Z 的远端装配为 `STAGED_FULL_CLOSURE_PASS`：784 文件、manifest、source 和全部输入哈希一致，根目录 665401747 bytes。
实际执行 pin SHA-256 为 `d178d5cce87a8e66ea9748d48d53f5fb39fcfe7c7061cc474493bd7d74c416f5`；完整原始记录和逐文件哈希见 `.acceptance/a9-31-developer/product-r1/r2-deployment-stage-evidence-index.json`。
普通桌面新监督器尚待启动，身份与真实 Electron/phase 证据仍为 `NOT_PERFORMED`。本地文档检查 241 文件/48 任务及差异检查通过；旧 R1 字节与失败保留。

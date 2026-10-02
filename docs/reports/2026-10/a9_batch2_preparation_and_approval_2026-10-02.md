# 第二批整批推进：合同补齐与审批准备（2026-10-02）

```text
Status: PREPARATION_COMPLETE_PENDING_OWNER_APPROVAL
Branch: codex/a9-30-shell-streaming
HEAD: 32ee0b48edd286c77aa543bdda9eb834fd4576aa
A9-30: DEVELOPER_VERIFIED
A9-31 / A9-32 / A9-33: DRAFT_READY_FOR_REVIEW
Win7: NOT_PERFORMED
```

## 1. 已完成

在原A9-30工作树完成文档/交付材料，未把整体推进授权解释为具体实现、提交或远端写入授权。
A9-30正式裁决、独立复核、矩阵和生产锁的尺寸/SHA与记录一致；锁仍未提交。
A9-31补v3 managed启动/输出/终态/release及先审计合同，展开23个managed kit精确路径；
A9-32绑定后续实际整合源，保留新Turn/事务去重/重核/未知副作用边界。
建立 [增量矩阵](../../plans/A9_BATCH_2_INCREMENTAL_VALIDATION.md)，
起草 [A9-33候选合同](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md)，
[审批包](../../plans/A9_BATCH_2_IMPLEMENTATION_APPROVAL.md)列C1准确25路径和C2具体A9-31/ADR-0151请求。

## 2. 发现及处置

| 发现 | 证据 | 处置 |
|---|---|---|
| managed transport仍仅协议v2 | native-transport.ts startManaged检查/completion类型 | A9-31扩展v3，不静默回退 |
| v3 runtime仅接受A9-30开发包 | a9-package-runtime.js validateDescriptor | A9-31新增managed开发revision，正式分支单列A9-33 |
| r11顶层status与已签developer_gate不一致 | 原JSON及正式裁决 | 保留冻结记录；新矩阵说明元数据差异 |
| 旧检查基线/kit仅引用另一任务 | A9-31/32旧草稿 | 检查源32ee0b4，实施源取实际登记/整合SHA；kit逐文件列明 |
| 覆盖台账仍显示A9-30未执行 | 旧正文/历史§4 | 当前行补DEVELOPER_VERIFIED，原文存历史；Win7未执行 |

## 3. 验证与保护

本轮仅文档/差异/白名单/测试入口静态检查、输入和保护哈希核对。
实际输出保存 `.acceptance/a9-batch2-preparation/20261002-r1/`，结果见verification.json。
不运行产品测试/GUI/原生构建/Win7，文档检查不证明新功能PASS。

- docs:check：220份文档、48份任务书，PASS；git diff --check：PASS。
- A9-31精确路径68项，其中managed kit 23项与原kit文件闭集对应；A9-32精确路径12项。
  定向命令中的测试均已有或由本任务/前置任务白名单明确新增，未运行不存在的未来测试。
- 原A9-30受保护的810个tracked实现/发布文件字节未变；主工作区HEAD、18项dirty/untracked状态及文件字节未变。
  STATUS_LOG和推进顺序保持本轮前的全部字节为前缀，只追加新记录。
- 当前三份关键收口原始JSON与输入锁原始SHA匹配；r11顶层status残留只做新说明，不改冻结证据。

输入锁SHA `2e5942b115f1e5f1ecf6a6c31d91ed5d4f9145b9e0751941a0aa566fdebda9df`，
独立意见SHA `705acc507bea2d990d53305cc7700323c3713c2c660a01dff3905a811e2f6d07`，
裁决记录SHA `a61f8b54fd57fa01a2ed3cd013b9016fa6efad6fa73fc5fd44c01653e9a78fc3`保持未变。

## 4. 待具体批准

先C1本地登记提交和C2 A9-31/ADR-0151；C3继续、C4原生/整合、C5新候选/门A/B
在其具体交付物形成后分别审批。未实现阶段保持NOT_PERFORMED，不推送/合main/发布。

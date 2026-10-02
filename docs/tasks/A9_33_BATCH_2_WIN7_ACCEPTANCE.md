# A9-33 — 第二批整批换发与 Win7 验收合同草稿

```text
Status: DRAFT_READY_FOR_REVIEW
Task Type: RELEASE_REISSUE_AND_WIN7_ACCEPTANCE
Target Branch: codex/a9-33-batch2-win7-acceptance
Source Baseline: NOT_BOUND (requires reviewed A9-30/31/32 integration commit)
Target Version: 0.3.0-alpha.2
Candidate: WIN7-43 (tentative; NOT_FROZEN)
Phase-Gate: A9_33_CONTRACT_PENDING_APPROVAL
Win7-Validation: NOT_PERFORMED
Decision: ADR-0155 (Proposed)
```

## 1. 授权与前置

2026-10-02负责人选择第二批三项整批验收并要求执行推进计划。本合同草稿不授予套件实现、
新候选冻结、构建机/目标机写入、计划任务或门A/B权限。审批顺序见 [审批包](../plans/A9_BATCH_2_IMPLEMENTATION_APPROVAL.md)。
只有A9-30/31/32开发机合同、必要原生双构建/锁及独立复核通过，并形成完整干净基线SHA后，才提交具体实现批准。
本批结论上限为第二批执行能力Win7 PASS，不签完整Alpha2或RC。

## 2. 候选与执行合同

- WIN7-43为默认建议；冻结前核对refs、注册、目录，已占用则顺延并在本任务中重新绑定。
  文件名采用batch2而非提前把w43写成已冻结身份；最终候选ID写入锁/manifest/报告/authority一致。
- 复用managed v26正式锁，保持A9-30、v25/W42及更早工件/报告字节；新版本/Profile/锁/源码错配拒绝装配。
  当前runtime将所有协议v3包限制为A9-30开发包，必须在本任务单独增加正式batch2分支；开发包继续无authority、不计正式候选。
- 审批 [增量矩阵](../plans/A9_BATCH_2_INCREMENTAL_VALIDATION.md)：S01–S06、BG、CONT、SAFE以及受影响UI直接Win7验证；
  未变能力精确继承并单列，真实Provider/企业环境等未执行不计本合同必需PASS。
- 两次连续成功Win7预演；身份标REHEARSAL_NOT_ELIGIBLE，不能计正式证据。预演失败保留，修复后重新取得连续两次。
- 同一准确源码/锁两个独立干净产品构建，正确性通过且ZIP逐字节相同后冻结。
  冻结后不能覆盖；产品或套件修复另建候选身份，不能复用旧FAIL身份改判。
- 候选外authority和独立pin由负责人门A绑定source/ZIP/manifest/helper/锁/套件/目标/run-id。
  草案无签发事实时不得注册或运行正式任务。
- Win7普通agent真实桌面运行main/preload/native/SQLite/IPC/Renderer；录令牌、Session、Job、codepage/补丁/runtime，
  SSH管理员仅管理传输/校验/调度，不代签桌面。目标前置失败相关阶段NOT_PERFORMED，不安装或改策略。
- 原始文件先落盘再判定，证据写候选外；包括日志、数据库、截图、时间线、进程身份、JSON及文件哈希。
  报告器在Win7普通用户复核，故障注入/错pin/改报告负例有效；秘密扫描及后飞行通过才送独立审核。
- 主代理执行并组装事实，负责人独立审核/门B；另设技术独立复核者须具体指定，不由实现方自签。

## 3. 拟批准精确白名单

仅装配/套件/直接交互驱动，不修后台/继续产品语义。产品缺陷回到对应任务或另立修复合同。

- 发布生产者：`scripts/release/build-a9-product-v3.mjs`。
- runtime消费：`src/shell/product/a9-package-runtime.js`；仅新增正式batch2描述符/manifest严格分支，保留所有历史分支。
- 新驱动：`src/shell/tests/product/a9-batch2-driver-entry.cjs`，通过现有产品入口，不改历史a9-06驱动判据。
- 测试：`scripts/release/test/a9-batch2-package.test.mjs`、`scripts/release/test/a9-package.test.mjs`、`src/shell/tests/product/a9-batch2-contract.test.ts`、`src/shell/tests/product/a9-package-runtime.test.ts`。
- 新发布输入/校验：`release/win7-product-v3/a9-batch2-input-lock.json`、`release/win7-product-v3/a9-batch2-package-integrity.cjs`、`release/win7-product-v3/a9-batch2-report.cjs`、`release/win7-product-v3/a9-batch2-smoke.cjs`。
- 新夹具/说明：`release/win7-product-v3/a9-batch2-fixtures.cjs`、`release/win7-product-v3/A9_BATCH2_WIN7_VALIDATION.md`；更新 `release/win7-product-v3/README.md`。
- 新入口：`release/win7-product-v3/RUN_A9_BATCH2_INTEGRITY.cmd`、`release/win7-product-v3/RUN_A9_BATCH2_SMOKE.cmd`、`release/win7-product-v3/RUN_A9_BATCH2_REPORT_VERIFY.cmd`。
- 新桌面控制器：`release/win7-product-v3/a9-batch2-desktop-controller.ps1`、`release/win7-product-v3/a9-batch2-desktop-request.cjs`。限定批准phase/目录/hash/run-id、身份硬门、期限及请求上限，不能执行任意命令。

CMD入口明确使用ASCII/CRLF；其余源码/Markdown为UTF-8无BOM/LF，PowerShell脚本显式编码读写、兼容实际批准目标版本。
套件安装/传输/账户/任务/远端新目录及候选外authority不借本白名单授权，形成精确目标材料后单独批准。
文档为本任务、索引、状态、覆盖/验证/审批合同、ADR及本批报告；不删除或重写Accepted ADR正文。

## 4. 检查与裁决

合同获批后执行：

```sh
node --test scripts/release/test/a9-batch2-package.test.mjs scripts/release/test/a9-package.test.mjs
npm test --workspace=@win7-agent/shell -- --runInBand --runTestsByPath tests/product/a9-batch2-contract.test.ts tests/product/a9-package-runtime.test.ts
npm run verify:quick
npm run docs:check
git -c core.fsmonitor=false diff --check
```

每个新判据有反例；原生锁/候选身份/错误authority/漏证据/任意控制器请求/秘密出口均拒绝。
任务批准前将phase映射、实机断言、执行命令、工具前置及证据闭集补齐为具体套件交接书，不能以本高层草稿直接冻结。
G0目标/会话 → G1包/锁完整性 → G2正式smoke → G3回传与报告核验 → G4秘密/后飞行 → 独立审核 → 门B。
门B只在本合同必需项满足且限制明确时由负责人裁决，任何缺项保持FAIL/NOT_PERFORMED。
Git提交/本地整合/推送/发布各自审批，不因为实机PASS自动执行。

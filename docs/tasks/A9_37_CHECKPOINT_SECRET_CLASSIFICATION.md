# A9-37 — checkpoint秘密判定误报修复

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_HARDENING
Target Branch: codex/a9-37-checkpoint-secrets
Source Baseline: 013cf7966c1f5858e2a2c58542d6f9495e88d29e
Phase-Gate: A9_37_DEVELOPER_VERIFIED
Win7-Validation: NOT_PERFORMED
Decision: ADR-0246, ADR-0247
```

## 1. 授权与可观察结果

2026-10-15负责人要求“明确该问题的原因并进行修复”。本任务登记本轮本地修复授权，不借用A9-33/35/36授权。
从当前第二批整合提交建立隔离工作树，主alpha2工作区全部既有修改保留。不提交、不推送、不构建正式包或执行远端。

已复现：`Authorization: Bearer YOUR_API_KEY`、源码`authorization: token`、虚构URL账号示例触发checkpoint秘密门，Shell尚未执行就整轮失败。
原因是checkpoint将日志保守脱敏结果变化当作已知秘密命中。

成功条件：普通源码、文档及URL示例不因启发式脱敏变化阻断Shell；正常恢复基线与撤销保留原文；API key、代理密码、自定义头及进程内旧值的已知秘密和现有编码变体仍拒绝进入checkpoint；日志/投影继续保守脱敏。
已知真实秘密仍阻断Shell，不静默跳过文件或承诺不可恢复内容可撤销。未登记凭据不是可完整识别的对象；不能把本修复称为通用DLP。具体安全边界见ADR-0246。

## 2. 允许路径

- `src/shell/product/a9-agent-runtime.js`：拆分已知秘密替换与通用启发式脱敏，checkpoint只使用前者，编码解码及旧值集合保持。
- `src/shell/tests/product/a9-lifecycle.test.ts`：产品运行时、真实SQLite和工作区恢复检查；POSIX进程夹具仅为SURROGATE。
- 本任务、`docs/tasks/README.md`、`docs/STATUS.md`、`docs/STATUS_LOG.md`、`docs/DECISIONS.md`、`docs/DECISIONS_INDEX.md`及本轮报告。

不改Core/Workspace/Runner、native、依赖版本、接口/Schema、恢复格式、权限、忽略规则、UI、旧候选或证据。
复用已安装Node20依赖的只读软链接，构建输出只在隔离工作树；消费者加载该树当前dist，不用旧dist证明新源码。

## 3. 验证

先新增旧代码会失败的运行时反例，再修复。覆盖文档、源码、URL、UTF-16LE示例、恢复内容及撤销；已知值原文/编码、路径、Provider切换后旧值与新登记重校验继续拒绝。保守日志脱敏有独立断言。
先构建依赖和消费者，执行verify:quick、生命周期产品测试、相关脱敏测试、docs:check、diff检查。失败先保存，不放宽产品判据。
开发机检查不替代Electron/Win10/Win7。当前目标是本地修复及其证据；目标运行与正式换包另按准确合同授权。

## 4. 执行记录

登记时实现、检查与目标平台均NOT_PERFORMED。

第一轮（2026-10-15）本地修复及新增15项直接检查PASS。三相关套件113 PASS/2 FAIL；2项后台清理失败已在未修复基线复现，原结果保留，不记全绿。verify:quick通过，详细身份、证据与边界见[本地报告](../reports/2026-10/a9_37_checkpoint_secret_classification_repair_2026-10-15.md)。Electron/Win10/Win7、新包及发布NOT_PERFORMED；未提交或推送。

### 第二轮修复（2026-10-16）

负责人和项目经理已裁决处理独立审核的四项：ADR 改为 0246；项目说明恢复保守外发门；补齐 padded/unpadded URL-safe 覆盖；仅给后台夹具请求补齐 `profileId`。本轮沿用分支 `codex/a9-37-checkpoint-secrets`、HEAD `013cf7966c1f5858e2a2c58542d6f9495e88d29e`，只改 §2 允许路径。入场 31 个 M、2 个 ??（含 24 个 Runner dist）保留；构建未造成额外 dist 字节漂移。

最短链路为真实 Runtime/Core/Workspace/SQLite、Read Only、只调用 read、本地 HTTP Provider 夹具。先新增 Authorization、URL userinfo 两项测试，未修复产品 `426bb327…` 上退出 1、2 FAIL/43 skipped；两项均实际得到 loaded 且请求体含合成凭据。之后恢复项目说明的 `redactSecrets` 判据及原编码解码，checkpoint/A9WorkspaceService 仍仅检测已知秘密。

本轮产品 SHA-256：`603323e25273eaf0a20a9987f0568d720a20d898d1fd8ef0dc40d9ace580b390`。测试 SHA-256：`1912076361d13f36f8cd53a6a5adf9326f6cd583340f216b83827aa2cd70b842`。

Node 20.17.0 下 verify:quick 退出 0（7 模块），三套件退出 0：lifecycle 46 PASS、redaction 46 PASS、Provider persistence 26 PASS，共 118 PASS/0 FAIL。两项新外发反例均为 secret_blocked 且 Provider 请求体不含凭据；URL-safe padded/unpadded 两项均拒绝。原后台 Stop/shutdown 2 FAIL 历史保留：根因为 schemaVersion 3 夹具请求缺 profileId，与响应身份不一致；只补字段后原断言通过，没有修改 Runner 或产品身份检查。

docs:check 和 diff 检查及完整证据见[报告第二轮修复](../reports/2026-10/a9_37_checkpoint_secret_classification_repair_2026-10-15.md#第二轮修复2026-10-16)，原始输出位于 `outputs/a9-37-checkpoint-secrets/fix-round2/`。KL-12 仍为 P1/NOT_PERFORMED，本修复不关闭 KL-12。Electron/Win10/Win7、新包与正式 Gate 均 NOT_PERFORMED；未提交、推送、连接远端或目标机、安装依赖或修改其他工作树。

### 开发收口登记（2026-10-16）

负责人原话：“批准 A9-37 签 A9_37_DEVELOPER_VERIFIED（开发机，603323e2…）。请登记 ADR 并准备整合方案，整合后重跑 A9-32 §5。”执行代理据此追加 ADR-0247，Gate 登记为 `A9_37_DEVELOPER_VERIFIED`。结论绑定开发机、基线 `013cf796…`、产品 `603323e2…` 与测试 `19120763…`，完整哈希和独立审核依据见 [ADR-0247](../DECISIONS.md#adr-0247-a9-37-登记-a9_37_developer_verified带已知限制)。

本结论带 ADR-0247 的 L1–L6 已知限制，具体内容以该 ADR 同号限制为准。此前已知秘密保护与日志脱敏概述须同时读取 L1/L2 例外。后续单独任务处理 L1/L2，本登记不授权该任务。

`Status` 保持 `APPROVED_FOR_IMPLEMENTATION`，不记 `COMPLETE`；`Win7-Validation` 保持 `NOT_PERFORMED`。A9-37 不在 WIN7-45 候选中，未在 Win7 实机验证。Electron/Win10、新候选、Alpha2/RC 均不签发，未提交、推送或连接远端。整合方案见[报告](../reports/2026-10/a9_37_checkpoint_secret_classification_repair_2026-10-15.md#整合方案与复验边界)；整合及整合后的 A9-32 §5 复验均 NOT_PERFORMED。

# A9-31 managed r2 身份证据修复审批材料

Status: APPROVED_FOR_IMPLEMENTATION

## 事实与边界

独立复核 source `d9b5be502c9475e50c54b349a6a12abd27b199f8` / ZIP
`5172a895d62e2db63635c427b31e9e0ba24c277c0d032742a4f0a7656a6362c2`
结论 FAIL_NOT_APPROVED（P0=0/P1=1/P2=0）。见
[独立报告](../reports/2026-10/a9_31_managed_r2_independent_kit_review_2026-10-03.md)。
问题限于构建 smoke 的真实 OS 进程身份证据；本次没有发现产品 helper 对应缺陷。
主代理进一步用合成 TEST_ONLY 输入确认当前 verifier 接受四类无效变体：错 helperPid、
错 root parent、错 child parent、release root/child 非零退出码。
保留证据 `.acceptance/a9-31-developer/native-kit-r2/review-negative-controls/identity-binding-before-fix.json`。
这只是校验器反例，不是实际 Windows 构建结果。r1/r2 ZIP、冻结文件、失败报告不覆盖、不改判。

本材料和 ADR-0156 均为待审；不批准新增系统 API、源码提交、套件登记、远端写入或构建。
分支保持 `codex/a9-31-background-tools`，修复基线为上述 source。

## 待批准的实现合同

1. 捕获器启动 helper 后保留实际 Process 句柄，记录 PID 和 UTC creation ticks。
   `execution_started.helperPid` 必须等于此实际 PID，不能仅为正整数。
2. 在 control 写入前，按固定句柄钉住 root 和 marker child 的 PID/creation ticks；
   用 `CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS)`、`Process32FirstW`、`Process32NextW`
   只读查询 `PROCESSENTRY32W.th32ParentProcessID`，确认 root parent=实际 helper、child parent=root。
   查询失败、进程缺失/提前退出、父身份错、creation 时间倒置或 marker 时间不符均停止该 smoke。
   全部相关父进程仍存活且句柄已固定后才发送控制，防止仅靠 PID 查询误收 PID 重用。
   快照在 finally 中 CloseHandle；不杀任意 PID，不采用 WMI 或修改权限的回退。
3. `v26-managed.json` 升为 schema_version=2；四组 row 必需实际 helper PID/creation ticks、
   root/child parent PID、root/child creation ticks、控制前身份钉住结果及退出后真实 exit_code。
   release/release-cancel 必须证明移交后仍存活，随后两个固定进程自然退出且各退出码=0。
   cancel/cancel-release 必须证明树终止，记录实际退出码，root 退出码与协议终态一致。
   未知或获取失败不能用0填充，也不能签 PASS；处置保持诊断和生命周期 UNKNOWN。
4. verifier 严格要求新证据版本及字段，将协议 ready 与独立捕获身份对照，校验父子关系、
   creation 时间顺序、marker 和终态/退出码。旧schema=1、字段缺失、身份错均拒绝 managed 重锁。
   这只收紧本次未批准 managed 返回证据；v1/v2、A9-30 v26 历史合同与锁保持不变。

## 精确实现路径

以下六项均已在 A9-31 §4 精确白名单内；新增 API/证据合同按 ADR-0156 具体批准后再修改：

- `native/helper/build-win10-kit-v26-managed/build.ps1`：实际helper/OS父子关系、句柄/时间绑定与退出码捕获。
- `native/helper/build-win10-kit-v26-managed/build-profile.json`：managed证据版本及必需身份/退出合同。
- `native/helper/build-win10-kit-v26-managed/README_BUILD.md`：查询前置、失败边界、schema2及旧包不改判。
- `scripts/release/a9-v26-return-evidence.mjs`：新身份合同和旧/缺失/错属/非零退出拒绝。
- `scripts/release/test/v26-evidence-fixture.mjs`：仅TEST_ONLY合成schema2正例。
- `scripts/release/test/v26-prepare-kit.test.mjs`：正例及错误helper、父PID、creation顺序、缺失/旧版证据、退出结果反例。

文档涉及 `docs/DECISIONS.md`、`docs/WIN7_CONSTRAINTS.md`、本材料、任务/交接/STATUS及报告，
按仓库文档规则追加，保留历史原文。产品native/Runner/Core/State/IPC/Renderer不在本修复差异内。

## 验证和后续授权

修复后运行任务指定 release 两份测试、verify:quick、docs:check、diff检查。
对上述四类反例先保留当前错误接受记录，修复后明确拒绝；增加时间错序、父进程错属和缺失版本负例。
未受影响模块只能按源码/依赖精确哈希继承。实际PS5.1完整脚本/C#编译、新Win10原生双构建、
真实Electron和Win7均等待对应批准动作，未执行记NOT_PERFORMED。

修复字节及本地证据就绪后，复用本次只读复核范围检查此P1的修复；形成准确源码差异供负责人批准提交。
新提交生成新包装批次r3，不覆盖当前r2。新kit完整复核、批准登记、本地提交、Win10目录/执行授权独立办理。
本补批只开放上述六路径的身份修复及ADR-0156；不默认提交、推送、合并、远端构建或候选门。

## 负责人批准（2026-10-03）

负责人对已冻结审批请求回复“批准”。批准ADR-0156、以上六路径源码修复及本地定向检查；
前文“待审/不批准新增系统API”为批准前材料原文，保留为历史，不否定本节的具体实施批准。
请求SHA-256=f89796e39c0140f8c2f6e95ccffc24c23e76823cec1b711d224b73f6642c8d2c，
授权回执在候选外native-kit-r2/identity-repair-owner-approval-r1.json。
后续源码提交、新kit及登记、远端写入/构建和候选门仍未授权。

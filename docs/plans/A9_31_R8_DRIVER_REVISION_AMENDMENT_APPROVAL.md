# A9-31：R8修订——采用复核修复版driver（新不可变revision），三个phase统一normal-short

日期：2026-10-05。Status: DRAFT_NOT_APPROVED。请求批准§1–5对R8合同r2的**有限修订**；本材料尚不构成实现、远端执行或新根授权。R8合同r2（SHA256 `eb9b1c76e0b87fc8626ca14c8272ec6e7d2bce3ffa8e5a738586e45c8590e21b`）其余条款（§3准入与容量、§4执行顺序与点击流程、§5失败与边界、D1–D4）**原样保留**；本修订只替换r2§2第1点“无任何功能代码变更”（driver改用复核修复版）及点击脚本/冻结工具/revision选择，且不改变master、观察器、控制脚本、根与输入。

## 1. 依据与已核实事实

R8（master `0450ccc613b97bfbb8876cb657fd21fbecbc1bd39a409fef489a07d081dfe6cf`）已实施、准入并冻结，普通入口**尚未启动、无请求发出**。Codex开跑前独立复核（[复核请求§6](../reports/2026-10/a9_31_r8_pre_run_review_request_2026-10-05.md)、ADR-0177、任务书末尾条目）提出四项发现，我已逐项独立核实全部成立：①`click-phase.sh`含`rm -f`删旧输出、写`/tmp`且未登记；②driver实际创建`post-final-event-N.json`的位置未使用重启命名，崩溃实例与重启实例同名时重启实例会`EEXIST`（我曾考虑后放过；只回退该处，Codex的新重启自检即在真实`Error: existing evidence, code: EEXIST`处失败，修复版通过）；③我先前称验证脚本“只读、19项”不准（实际21项，且driver自检写临时文件）；④R8的`frozen-admission-result.json`状态串误写`FRESH_WIN10_R7_ADMISSION_PASS…`（**勘误：该文件应读作R8准入通过**，其余内容与哈希无误，原文件不改写）。

候选外修复目录`.acceptance/a9-31-developer/r8-review-repair-r1/`（修复清单SHA256 `54a8c8e5ef1a331d389faf7c2d51bee5dbde25d7cc2be860e6545f3d251a806c`）中的修复版driver SHA256 `cbeea5571173aa216a9b3ca110f3f67efa7925a3e982343970e64dfef35b1aaa`。独立核对：相对冻结driver的差异精确限于三处——`entry()`中post-final文件名套`restartAware(...)`；late-journal自检上下文补入`A9_TEST_RESTART='0'`与该函数（RESTART=0时语义不变，既有断言未改）；重启自检重写为用内存文件系统执行真实`entry()`并保留原EEXIST反例。既有自检输出不变（硬门55/5/14、SYNC 88、late-journal 15），新重启自检31项通过；SYNC安全片段摘要与master的`driver_safety_sha256` `576fea1b4c0520fa…`**相同**；R5–R8共5448个文件逐size/SHA零变化；被跟踪文件仅文档变化。本地解释器为Node 20，**不能替代目标Node16/Electron/PS5.1**。

**可行性（已核实）**：master的`initial_driver_sha256`仅被校验为64位十六进制、不与任何revision的driver比较；master只绑定3个PS脚本，driver哈希只绑在各revision。故新driver可作为新的不可变revision挂在**不变的master**下（R2/R3已用过的“已检查driver revision”机制），不需要新根。

## 2. 相对r2的全部变更（仅此）

1. **driver**：以修复版（cbeea557…）为新基础，用与原冻结相同的机械变换派生**仅`normal-short`一个**新revision（`BACKGROUND_SHORT_ONLY=true`）；其余三个旧label不再新建。StopExit、ReleaseExit、Recovery**统一使用该新`normal-short` revision**（此前R5/R7惯例即normal-short；`BACKGROUND_SHORT_ONLY`只影响`Background`内部分支，对这三个phase无影响）。原四个旧revision保持已登记、字节不变、**不用于任何请求**。
2. **新增不可变文件**（批准后先在任务书逐一登记C14准确路径再实施，均在`.acceptance/a9-31-developer/product-r3-retry-r8/driver-r1/`下）：修复版driver与normal-short新revision的`product-r3-driver.cjs`/`revision.json`/`checks.json`/`registration.json`；`click-phase.py`（Codex版，**仅把允许的revision由`normal-full`改为`normal-short`**，其余不变：固定45秒、独占创建唯一目录、拒绝无效输入/重复输出、回执校验）与其`.sh`壳；读新绑定的phase编排与准备/冻结脚本；冻结脚本只写新结果文件`frozen-admission-result-driver-r1.json`（状态明确R8），并拒绝改写已冻结文件。
3. **不变**：master、观察器源/EXE/MVID/pin、四个控制脚本（stage/launch/serve）、观察器launcher、根、输入、夹具、既有全部准入记录与证据——开始与结束均用5448文件基线加R8新增文件复核零变化。
4. **目标运行时准入（新revision必须通过，不冒充旧准入）**：Win10锁定Electron-as-Node 16.17.1对新driver运行`--check`、`--self-test`、`--sync-receipt-self-test`、`--late-journal-self-test`、`--restart-evidence-self-test`（5行，全部退出码0）；schema定向检查以绑定新revision的夹具重跑（让真实库函数校验新`revision/checks/registration`）；新revision完整闭包stage须`PRODUCT_R3_STAGED_FRESH_FULL_CLOSURE_PASS`；`registration/checks`不可覆盖上传，其`records`沿用R8原记录并追加新Node16与schema记录。任一失败即停，**不静默回退到旧revision**，须另请负责人裁决（旧driver存在上述未观察到的同名风险）。
5. **勘误登记**：任务书与STATUS_LOG记录R8冻结结果状态串勘误，不改原文件。

## 3. 本修订不证明什么

新driver只在本地Node 20与（批准后）Win10 Node16离线自检/准入中被验证；真实Electron下的Recovery重启、健康重启耗时、新conhost父进程分支在活phase中的放行、R8跨账户读取均仍**未验证**；Esc/取消的实际后果仍未实测（沿用ADR-0176保守按HALT、不重试）。不改产品/native/锁/capture、控制器、观察器、proof判据、对话框断言、120秒限时、九字段请求；不放宽任何未知生命周期门；不修改任何Accepted ADR（批准后另行追加ADR记录本修订）。整批Win10仍NOT_PASS，DEVELOPER_VERIFIED、独立验收、Win7均未签，Win7未验证。

## 4. 执行

准入完成并核对通过**之前不启动入口**。执行顺序、点击流程（就位、45秒提前量、每次只报一个按钮、不确定就不点、超时FAIL可重试至多3次、点错HALT不重试）与失败/重试规则完全沿用r2§4–§5：StopExit → ReleaseExit → Recovery（最后），请求均钉到新`normal-short` revision；入口窗口120分钟、最多16请求。每请求前核对观察器就绪、30秒接单检查，终态后由代理发停止信号并核对观察器终态；每phase逐size/SHA完整返回、秘密扫描、SQLite副本检查及输入后飞行；点击耗时与`response`一律由证据计算。

## 5. 边界

不含：产品/native/锁/capture修改、系统/账户/ACL/服务/计划任务改动、删除、强制结束旧实例（含R6/R7窗口与Electron 107280/77944/42732）、提交/推送/合并/发布、委派、独立验收、Win7、新根或第九根。任一HALTED保存证据、不恢复、不创建第九根，另报批准。

## 6. 待负责人确认

- **A（已口头裁决，待写入批准）**：采用修复版driver；三个phase统一`normal-short`。
- **B**：仅新建`normal-short`一个新revision（推荐，缩小面积），而非四个label全部重建。
- **C（可选）**：新revision准入通过后、首个请求前，是否再请Codex复核一次新revision与点击流程（会推迟开跑）。
- 批准须按本修订SHA256绑定，并同时认可r2其余条款继续有效。

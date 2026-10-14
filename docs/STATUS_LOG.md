# 项目状态流水（历史）

> 本文件承接 2026-09-24 之前 `STATUS.md` 的全部时间线条目，按原文迁移，仅做两处整理：
> WIN7-33 授权条目移到其实机条目之前；原误置于“状态使用规则”下的 A8-06 三节归入独立标题。
> 当前状态与阻断项以 [STATUS.md](STATUS.md) 为准；本文件条目是时间点记录，不自动代表当前基线。

## A9 Trusted Agent Runtime（2026-08-31）

- 2026-09-14，负责人指令启动 [A9-16](tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md) UI 子集（任务书 §7：状态 `APPROVED_FOR_IMPLEMENTATION`，分支 `codex/a9-alpha2`，基线 `7d06789` + 在制 A9-17，决策 ADR-0117 / ADR-0124）：实现 U01–U07 左侧对话区三段式与单行密度、桌面四态状态类切换（双侧独立开关、aria 同步、DOM 保活）、信任注记折叠与"进行中/更早"分组；**Review（R01–R05）与 Shell 运行中输出（S01–S06）按指令暂缓**，Review 入口维持 disabled fail-closed。设计输入为 [ZCode 参照建议](plans/A9_16_UI_ZCODE_REFERENCE_SUGGESTIONS.md) 与已实测的 [静态演示](plans/a9-16-ui-demo/index.html)。本轮复核补齐两处缺口：**U02 行容量不达标**（左栏固定 chrome 474.8→379.9px，列表 147.2→238.0px，完整可见行 2→5，凭静态高度预算模型并已固化进契约测试；行高仍 36px，未靠缩小行高达标）与 **U06 跨断点回归**（原 resize 监听在任何窗口缩放时折叠左右栏，改为只做状态机收敛 + aria 重推；并修 ≤799px 残留 `.rail-closed` 导致的 0 宽网格列）。随后在开发机真实 Electron 22.3.27（Chromium 108）用真实渲染层 + 桩快照做**几何量测**，另暴露并修复第三处缺口：**U02 预算模型漏算归档折叠摘要**，最坏形态（2 组头 + 归档区）实测仅 190px / 3 条完整行，二次回收后为 196px / 4 条完整行，并把归档项补进预算模型。量测确认桌面四态与 1200/800 两个断点全程 `scrollWidth`/`scrollHeight` 无溢出、`aria-expanded` 与视觉一致、Ctrl+I 关闭后焦点交还头部开关；**125% 用 Chromium 缩放代理仅 1 条完整行，是 Win7 实机 1366×768 × 125% DPI 的首要复核项**（不等于真实 DPI）。门禁：shell 37 套件 357 项全绿（含 5 项 A9-16 契约用例，另经负向对照确认修复为真实护栏）、`tsc --noEmit` + 产品 JS `node --check`、`git diff --check` 干净；`check_docs.mjs` 仅剩既有 `outputs/**` 沙箱快照噪声。几何证据见 [layout-evidence.json](reports/2026-09/a9-16-ui-evidence/layout-evidence.json)；**像素级视觉签字与真实 125% DPI、Win7 实机回归仍 `NOT_PERFORMED`**；未签发 Alpha 2 PASS；未提交/推送。详见[实现报告](reports/2026-09/a9_16_ui_implementation_2026-09-14.md)。

- 2026-09-14，A9-16 UI 子集冻结新候选 **WIN7-29**（决策 ADR-0125，任务书 §8）。候选范围限于 §4
  U01–U07 的 renderer 改动；Review（R01–R05）与 Shell 运行中输出（S01–S06）**不在候选内**，Review 入口
  维持 disabled + fail-closed。发布管线新增 `A9-16-INPUTS-RESPONSIVE-UI-WIN7-29` profile
  （`scripts/release/build-a9-product-v3.mjs`）与一整套 W29 release 工件：输入锁、validation kit
  （**15 项用例**：继承 W28 的 `W29-01`～`W29-10`，新增 `W29-11`～`W29-15` 覆盖左栏三段式与行容量、
  桌面四态 DOM 保活、跨断点收敛回归、键盘/焦点契约，以及**真实 1366×768 × 125% DPI** 布局）、
  完整性/报告/smoke 脚本与 CMD 包装、[验收说明](../release/win7-product-v3/A9_16_WIN7_29_VALIDATION.md)。
  三件锁定输入按精确哈希复核在位：Electron 22.3.27 `ad723ed7…86e6`、D-013 v25 `7485cf22…99d6d0`
  （本轮从私有归档恢复并逐级校验）、SQLite/ABI 110 `2cb0cd32…2794`。**A9-17 经负责人裁决不并入本候选、
  也不单独建立产品候选**，其 Win7 采样沿用自身授权；版本与能力集保持 Alpha 1（`0.3.0-alpha.1`，
  ADR-0096），不得据该候选宣称 Alpha 2 PASS。同日完成**双独立干净工作树构建并逐字节一致**：源码提交
  `4bdf87b40449a1a7c5488425d45604767ce8e24a`，`source_dirty=false`、
  `external_acceptance_eligible=true`，ZIP `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip`
  （101,350,978 B）SHA-256 `a69d92c434631d13019c3cfb760db907555ecc84b853f56bdd6d3dab2e0d820e`，
  manifest SHA-256 `46f11c0ddb2d2d4b2566a035914d41ae4751a7ecd2f404c4b65831e6643d5d01`。
  随后在候选外预检发现该构建**不可验收**：包内 `validation/a9-package-integrity-w29.cjs` 有 5 处字面量
  未从 W28 重基线（`gates.win7`、`provenance.task`、`provenance.previous_candidate`、
  `provenance.previous_candidate_result`、`provenance.change_scope`，以及 `approved.kind` /
  `approved.status`），以符合文档契约的候选外 authority 实测被拒 `A9_W29_INPUT_LOCK_CONTRACT_INVALID`
  ——**候选自带的校验器拒绝候选自身携带的 input lock**，Win7 实机验收无法通过第一条命令；该文件被
  `release-manifest.json` 哈希绑定并随 ZIP 发布，包外补丁不可行。**故 WIN7-29 判定为构建缺陷并保留为
  失败构建**，其哈希不得被任何 authority 引用，不得删除、改写或复用改判。

- 2026-09-14，按既有修复先例换发 **WIN7-30**（决策 ADR-0126，任务书 §9）作为 A9-16 UI 子集的修正候选：
  候选范围、15 项用例集、版本与能力集（Alpha 1）与 WIN7-29 一致，修正范围严格限于上述字面量，使其与
  `a9-16-win7-30-input-lock.json` 逐项一致。同时补两处**残留守卫**：
  `scripts/release/test/a9-package.test.mjs` 新增"派生脚本的 gates/provenance/authority/kit 字面量必须与
  input lock 逐项一致"的回归断言；`scripts/release/build-a9-product-v3.mjs` 新增构建期
  `assertNoStaleCandidateTokens()`，按 lock 与 kit 逐项比对（覆盖 `WIN7_28_`、`APPROVED_FOR_WIN7_28_`
  等下划线形式，即本轮绕过连字符守卫的形式），命中即 `A9_CANDIDATE_STALE_TOKEN` 失败。守卫经负向对照
  验证：临时解除豁免后精确命中 WIN7-29 的全部 7 处残留，恢复后无误报；发布回归 **23/23 全绿**。
  同日完成**双独立干净工作树构建并逐字节一致**（`cmp` 通过）：源码提交
  `640571ea11a402b4b827cf31175d849ec729d970`，`source_dirty=false`、`external_acceptance_eligible=true`，
  ZIP `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip`（101,352,637 B）SHA-256
  `1ec123e4f73dbb6607007e34460350164a06a6dd9035f4c031ff4782fc74af90`，manifest SHA-256
  `4c41af7501c51433ff240a14d6ebd28246716fa3884a8c12fac08a2f4d75daae`。候选外预检 12 项全 PASS
  （`verifyFullTree()` 788 文件、64 项闭包、无禁止载荷、kit 身份一致），含
  **`verifyAcceptanceCandidate()` 接受符合文档契约的 authority 与候选自带 input lock**——即 WIN7-29
  失败的那一项（该 authority 为测试夹具，不构成批准）。该结论仅为开发机包完整性
  （`A9_16_DEVELOPER_PACKAGE_INTEGRITY_PASS`），`product_assembly` / `win10` / `win7` / `alpha` 当时全部
  `NOT_PERFORMED`。随后签发候选外 authority 并在 `10.211.42.40` 以普通用户 Medium/non-elevated
  执行 run `add716dd-c45e-4a18-ab5f-0ba1fc19d6c3`：G1 通过，G2 自动 smoke 失败。四个 Electron 阶段
  均退出 0、fixture 325 次请求，但 driver 发布 W28 投影键而 W30 smoke 按 W30 键读取，且折叠左栏下
  Ctrl+K 搜索过滤成功但 `focused=false`；真实 Provider 因硬门失败为 `NOT_PERFORMED`，原 ZIP 复核
  哈希不变，结束后无 Electron 残留。**WIN7-30 固定为 `G2_FAILED`，不得重签或复用哈希改判。**

- 2026-09-14，负责人批准修复并换发 **WIN7-31**（ADR-0127，任务书 §10）。修复严格限于两项：
  （1）构建时把共享 driver 的 `W28-03` / `W28-09` / `W28-10` 与 evidence package kind 精确派生为
  W31；（2）Ctrl+K 在聚焦并全选搜索框前先展开导航。构建残留守卫改在 driver 与 kit 生成后执行，
  并拒绝 03/09/10 投影对象键出现非 W31 前缀；正向与注入旧键的负向回归均为候选前置。15 项用例、
  Alpha 1 版本和能力集保持不变。同日以源码提交 `ac4ed5048a6a2d4ed2f223c61ed06108a4a07d4b`
  完成双独立干净工作树构建，ZIP 逐字节一致、`source_dirty=false`、
  `external_acceptance_eligible=true`：`Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip`
  （101,353,790 B）SHA-256 `79aec61da2046727ae89d94ccb4c9341ca5fb07aff17a72291479d1372ffa16a`，
  manifest SHA-256 `a215217b6279a85b4c8213f561bafda07a6c529f630a6e4060c63b084cb9dbe6`；788 文件
  完整树复验通过，包内 driver 只含 W31 的 03/09/10 投影键。候选已归档到
  `.acceptance/candidates/WIN7-31/`，两个临时 Git worktree 已解除注册并移除，独立 out-a/out-b 构建结果
  保留。测试夹具 authority 仅证明校验链路可接受正确绑定，**不构成正式批准**；尚未签发
  `WIN7_31_RELEASE_AUTHORITY`，Win7 验收为 `WIN7_31_NOT_PERFORMED`。未推送、未打标签。

- 2026-09-15，WIN7-31 已取得候选外 authority 并在新确认地址 `10.134.115.40` 的同一物理 Win7 主机
  `DCCS-CHAIZL-PC` 开始普通用户 Medium/non-elevated 实机验收。run
  `cdc35c14-abee-4f8e-bd4a-5759559ba0c8` 中 G1 PASS、G2 自动 smoke 75/75 PASS；真实 Provider
  multi-tool 与 wait/cancel 直接观察通过。G3 在真实 1366×768、120 DPI（125%）的最坏形态（1 running、
  8 older、1 archived，且 Stop 可见）只完整显示 1 条 36px 对话行，低于 W31-11-A03 / W31-15-A02
  的 4 行硬门，故 **WIN7-31 固定为 `G3_FAILED`**，不签发 A9-16 UI 集成 PASS。候选正常关闭后
  Electron/helper 均为零，postflight 完整性 PASS，证据秘密扫描零命中。负责人随后批准修复；当前源码
  在 `max-height: 650px` 下压缩固定 chrome，但保持 Review disabled 入口、可信提示、设置/诊断与 Stop
  可达，36px 行高不变。新增 540 CSS px 最坏形态契约守卫，定向测试 31/31 PASS；开发机 Electron 22
  同引擎量测为列表 197px、完整 4 行、页面零溢出，shell lint/build 与 diff check 通过。该结果仅为
  `SOURCE_REPAIR_VERIFIED`；随后已按下条获得 WIN7-32 冻结与双构建授权，authority 与 Win7 重验仍须
  按候选精确哈希收口。

- 2026-09-15，负责人指示“下面开始实际验收”，据此授权换发 **WIN7-32**（ADR-0128、任务书 §12）。
  候选只承接 WIN7-31 G3 已证实的真实 125% DPI 左栏容量修复，36px 对话行、15 项用例、Alpha 1
  版本与能力集不变；Review 与 Shell 运行中输出仍不开放。允许本地提交和双独立干净工作树一致构建，
  但未知 ZIP 哈希不视为已批准；哈希形成后仍须候选外 `WIN7_32_RELEASE_AUTHORITY` 与独立 SHA-256 pin，
  方可在 `10.134.115.40` 开始普通用户复验。现已由源码提交
  `916fe8240e73d6efa956eacf485652075639dbcb` 完成双独立干净工作树构建，ZIP 逐字节一致、
  `source_dirty=false`、`external_acceptance_eligible=true`：ZIP 101,356,737 B，SHA-256
  `639063b70a1f7fb5dd422870708cb8cb457c405df8752668a5e43f8220a92ea2`；manifest SHA-256
  `03647a0e0966e27787aa28ea17f577307955e0e28d7de3d31bd7fc62f8b442f6`。788 文件完整树、15 项 kit
  闭包与测试专用 authority 全链预检通过；测试 authority 不构成批准。候选已归档到
  `.acceptance/candidates/WIN7-32/`，双构建输出保存在 `.acceptance/builds/WIN7-32/916fe824-reissue/`，
  两个临时 Git worktree 已解除注册；临时父目录删除被 Auto Review 拒绝，未绕过。当前停在正式
  `WIN7_32_RELEASE_AUTHORITY` 门前，仍为 `WIN7_32_NOT_PERFORMED`；未推送、未打标签。

- 2026-09-15，负责人按精确 ZIP SHA-256 `639063b70a1f7fb5dd422870708cb8cb457c405df8752668a5e43f8220a92ea2`
  批准 WIN7-32 候选外 authority；正式 authority SHA-256
  `4f06c80cb3c33aa9916273b26f753b5906ea8ce11e910125e5e758f6b9aa2dbe`。在 `10.134.115.40` 的物理
  Win7 主机 `DCCS-CHAIZL-PC` 以普通用户 `dccs-chaizl-pc\agent`、Medium/non-elevated 令牌执行 run
  `6e5c315d-cf59-4a5c-bb9f-1f58a2df366c`：G1 包完整性 PASS；G2 自动 smoke 75/75 PASS；显示事实为
  1366×768、120 DPI（125%）。G3 正式窗口首次启动持续白屏，四个 Electron 进程（含 renderer）均存活
  且 responding、Windows Application 日志无同期崩溃；普通 WM_CLOSE 后 Electron 清零，但同一普通用户
  正常重启仍持续白屏。仅在打开 DevTools 触发窗口失效重绘后，已经加载的 workbench DOM 才立即可见，
  关闭 DevTools 后界面继续显示；该诊断性重绘不能满足正常启动合同。因此 WIN7-32 固定为
  **`G3_FAILED / FIX_BEFORE_REISSUE`**，不签发 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`；真实 Provider、
  Stop、桌面四态、键盘与最坏形态容量复验按硬门保持 `NOT_PERFORMED`。应用随后正常关闭，postflight
  包完整性 PASS、Electron 残留 0、候选外高置信秘密扫描 0 命中；候选自带报告器接受完整 15 项集合的
  正式失败报告并返回 `status=FAIL`。候选、authority、run 与全部候选外证据保持不可变；未推送、未打标签。

- 2026-09-15，负责人指示“修复并走验证”，授权换发 **WIN7-33**（ADR-0129、任务书 §13）。补充物理
  Win7 判别实验确认：WIN7-32 最小化/恢复及一像素 resize 后仍无 renderer 内容；同一冻结候选仅以
  `--disable-gpu` 启动则无需 DevTools 即正常首绘。因此源码修复严格限定为 Windows 主进程在
  `app.ready` 前调用 `app.disableHardwareAcceleration()`，非 Windows 不变；WIN7-32 renderer 容量修复、
  15 项用例与 Alpha 1 能力集全部继承。修复源码已提交为
  `d6c6a3e5d908ff3ffe72d14d1c64bb7ba968e718`；定向启动/工作台测试、package 全集、Shell lint/build、
  仓库快速集成门和开发机包预检均 PASS。两个独立干净工作树生成逐字节一致的 101,358,703 B ZIP，
  SHA-256 `ab885f43c5285ebe81351ca5841f33399cb58b750b16cb8367fd2c760b08984c`，manifest SHA-256
  `6d9986f43135171517be34c61d85b17e9f79eae04f70be3c7c5bd6443930bd9e`；均记录
  `source_dirty=false`、`external_acceptance_eligible=true`。候选已冻结到 `.acceptance/candidates/WIN7-33/`，
  双构建输出位于 `.acceptance/builds/WIN7-33/d6c6a3e-reissue/`，临时工作树已移除。当前硬停在该精确
  ZIP 哈希的候选外 `WIN7_33_RELEASE_AUTHORITY` 与独立 pin，WIN7-33 仍为 `NOT_PERFORMED`；未推送、
  未打标签。

- 2026-09-15，WIN7-33 在 `10.134.115.40` 的物理 Win7 以普通用户 `dccs-chaizl-pc\agent`、
  Medium/non-elevated 令牌（Session 11，真实 1366×768 / 120 DPI，非 Chromium 缩放代理）执行 run
  `15f2c247-d5e1-4c82-8d9f-c34759cf9a4f`：G0 宿主预检与 G1 包完整性 PASS，**G2 自动产品 smoke 硬失败**
  ——四个驱动阶段（first / second / retry / stop）全部抛
  `Error: app.disableHardwareAcceleration() can only be called before app is ready`，抛点在
  `resources/app/product/main.js:21`，触发点是候选自家驱动在 `app.whenReady().then(main)` 之内才
  `require` 产品入口。两个本机回环 fixture 请求计数为 0、批准目标未删除、未产出任何投影附件；G3 与
  15 项用例按 fail-closed 记 `NOT_PERFORMED`，正式失败报告与候选自带 verifier 均 `status=FAIL`
  （`verified_cases=15`、`direct_current_candidate_cases=0`）。该缺陷仅 Windows 触发，因此开发机双构建
  逐字节一致与候选外 verifier 预检都无法发现。postflight 完整性复检 PASS、Electron/helper 残留 0、
  候选外高置信秘密扫描 0 命中、13 个一次性计划任务已删除。据此 WIN7-33 固定为
  `G2_FAILED / FIX_BEFORE_REISSUE`，候选、报告、run 与全部候选外证据保持不可变。

- 2026-09-15，负责人指示“对问题进行修复”“现在就推进换发”，授权换发 **WIN7-34**（ADR-0130、任务书 §14）。
  最小修复为把渲染策略调用改为按就绪状态守卫
  （`if (process.platform === 'win32' && !app.isReady()) app.disableHardwareAcceleration();`）：打包入口
  在 ready 前加载主进程，行为与 WIN7-33 完全等价；此后加载本模块的验收 harness 不再能把一次非法迟到
  调用变成产品启动失败。新增两条主进程启动顺序回归用例与一条候选包断言（ready 之后加载不得做出非法
  迟到渲染调用；ready 前加载必须照旧生效）。WIN7-34 的 integrity / report / smoke / driver / 两个 RUN
  包装与 input lock 由冻结的 WIN7-33 工件按仓库既有约定重基线候选令牌生成，构建期
  `A9_CANDIDATE_STALE_TOKEN` 守卫已实际拦下一次遗漏的 `change_scope` 未重基线。两个独立干净工作树已在提交 `2f6d3fd2ee8817922cf771300e3f348e541dfaf6` 上构建，ZIP 逐字节一致：
  101,361,365 B，SHA-256 `d0b8528fccef905dce2d420d1b231251fac017d29f1505dbc10a6f20d9a93ead`；manifest
  SHA-256 `3801430d0716ebfa3dafb65e3f123bf6d5bbdd19fc030f0e4c0dbf63a441761a`；validation kit SHA-256
  `628ef158c3bf7b9797ecffab98d732144379aae7f33b3faae67f4fcc12b80644`，两份结果均
  `source_dirty=false`、`external_acceptance_eligible=true`。候选已冻结到
  `.acceptance/candidates/WIN7-34/`，双构建输出位于 `.acceptance/builds/WIN7-34/2f6d3fd-reissue/`。
  当前硬停在该精确 ZIP 哈希的候选外 `WIN7_34_RELEASE_AUTHORITY` 与独立 pin，WIN7-34 普通用户实机仍
  `NOT_PERFORMED`；未推送、未打标签。

- 2026-09-16，WIN7-34 在 `10.134.115.40` 的物理 Win7 以普通用户完成 run
  `1910b132-1043-46f9-9b32-70b0a9ed4892`。原报告因 W34-13-A03 要求的 `<=799px` 抽屉态被产品
  `minWidth: 860` 阻断而为 `EVIDENCE_PENDING`；负责人选择「规格收窄」后，候选外 floor harness
  在可达最窄 847 CSS px 上证明折叠 rail 时对话列非零且无横向溢出。修订报告保留原报告与
  证据不变，候选自带 verifier 返回 `status=PASS`、`verified_cases=15`、
  `direct_current_candidate_cases=15`，裁决为 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`。`<=799px`
  分支继续登记为 `PRODUCT_UNREACHABLE / NOT_VERIFIED`；不据此签发 Alpha 2 或 RC PASS（ADR-0131）。

- 2026-09-22，负责人批准 **WIN7-35** Driver 生命周期与退出码修复规划（ADR-0132、任务书
  §16）。实施后经主代理独立复核，补齐了候选内真实 `electron.exe` 迟到加载/受控 ERROR
  两个反例、非零退出与 ERROR 报告双绑定、WMI 零路径相关进程残留、四阶段完整合同，
  并将 W35-13 按 ADR-0131 收窄为可达最窄 847 CSS px；`<=799px` 仍为
  `PRODUCT_UNREACHABLE / NOT_VERIFIED`。定向 Shell 47/47、package 33/33、Shell lint/build、
  `verify:quick` 与 `git diff --check` 通过；`docs:check` 仍因既有 A9-17 `/tmp` 链接及历史
  `outputs/**/input-snapshot` 缺件失败，本次未改写该历史证据。产品 `main.js`、renderer、
  Runner/Policy、IPC、SQLite、权限、网络和依赖均未改动。WIN7-35 候选、authority 和
  物理 Win7 G1→G2→G3 证据仍 `NOT_PERFORMED`，不签发 Alpha 2 或 RC PASS。

- 2026-09-23，后续 WIN7-35 实机运行 `9ffae420-fd2c-4c5f-93ef-c56584fe1ca4` 已更新上述历史时间点状态：
  精确 ZIP SHA-256 为 `0d1474fddbd05c28e2109f2b7d70eb78d7e4ac786cadf2418175c7504b73749c`，
  `10.110.237.40` 上 G1、消除旧实例干扰后的 G2、正式入口首启/重启首绘均通过；真实
  1366×768 / 125% DPI 的 1079×540 CSS px 视口下，最坏形态列表仅 178px / 3 条完整 36px 行，
  W35-11/W35-15 的 G3 UI 硬门 **FAIL**。1080×584 最小窗口钳大样本不构成通过证据；
  W35-12/W35-13 DOM 身份为待隔离风险，真实 Provider 等下游 `NOT_PERFORMED`。
  WIN7-35 保持冻结 FAIL，候选外运行证据见 `.acceptance/runs/WIN7-35/9ffae420-fd2c-4c5f-93ef-c56584fe1ca4/`。
  现有未提交修复在开发机 1079×540 探针中得到 207px / 4 行，但不构成 Win7 PASS；
  [WIN7-36 换发合同](plans/A9_16_WIN7_36_REISSUE_PROPOSAL.md) 后由负责人明确批准编号、C14
  路径及 `10.110.237.40` 目标（ADR-0133、任务书 §17）；当时尚未提交、换发或签候选外 authority。
- 2026-09-23，WIN7-36 修复在本地干净提交 `f0e80ecfabaaf8414d2778e4481f7e8d68e54f40` 冻结。
  工作台契约 32/32、package 测试 35/35、Shell lint/build、实际渲染几何门与反例、`verify:quick`
  均 PASS；`docs:check` 在干净工作树仅剩 9 处既有 A9-17 临时路径断链，未命中 W36 文件。
  两个独立干净工作树构建的 ZIP 逐字节一致，SHA-256
  `8f730c5ae9ab86d83ecbfe3033a00e32a935dd5217d3ab30e4c75710adbe2a3a`；manifest SHA-256
  `1a9fa1584cd4f99295df6c44ad5ced47cc44c5dfd2d810c09841fe0557de00e2`；正式 input lock SHA-256
  `d99c0dcf16d44cbceed41e6e6b4a6622877c856aaa40cfc6fc664d689cde676a`。manifest 为
  `source_dirty=false`、`external_acceptance_eligible=true`；冻结件在 `.acceptance/candidates/WIN7-36/`，
  双构建在 `.acceptance/builds/WIN7-36/f0e80ec-reissue/`，开发机仓库 ZIP verifier 预检 PASS。
  尚未签发候选外 `WIN7_36_RELEASE_AUTHORITY` 与独立 pin，Win7 G1/G2/G3 均 `NOT_PERFORMED`，
  不签发 Alpha 2、Review、Shell streaming 或 RC PASS。
- 2026-09-23，负责人随后按 WIN7-36 精确哈希单独批准候选外 `WIN7_36_RELEASE_AUTHORITY`、独立 pin
  及在 `10.110.237.40` 执行 G1→G2→G3；本地签发 authority SHA-256
  `9c9b61a27287782a7ed8bea677d7dd85d8fe39de8c491b13e3f600ef0d001991`，候选自带 verifier 的
  开发机纯字节与绑定接口通过。目标 TCP 22 可连接，但三次严格 SSH 连接均在服务器 banner 交换前超时，
  未到主机密钥核验或认证，也未发生远程写入。此 run 的 G1/G2/G3 仍 `NOT_PERFORMED`，当前为
  `BLOCKED_SSH_SERVER_HANDSHAKE / INSUFFICIENT_EVIDENCE`，不是候选产品 FAIL。候选外详情见
  `.acceptance/runs/WIN7-36/485927dc-d043-47e3-b12c-85df380b6e85/RUN_STATUS.md`。
- 2026-09-23，负责人将 WIN7-36 目标 IP 更正为 `10.233.193.40`；新地址完成 SSH 握手，
  ECDSA 主机密钥与原 Win7 已固定主机键一致，但现有公钥登录被拒。新候选外 authority/pin
  按更正地址独立保存在 run `9d9b5cab-96ec-47e2-b7b3-8102a9ab6909`，SHA-256
  `7d335d76184dc6676680d5b1117a5babbb200b09fbdf6f32985ab37c5cea1708`，开发机纯字节与
  绑定预检 PASS；原地址 run 与 authority 不改写。当前为 `BLOCKED_SSH_AUTHENTICATION`，
  无远程写入或执行，Win7 G1/G2/G3 继续 `NOT_PERFORMED`。见
  `.acceptance/runs/WIN7-36/9d9b5cab-96ec-47e2-b7b3-8102a9ab6909/RUN_STATUS.md`。

- 2026-09-24，上述 SSH 登录阻塞在用户重新登录后解除；同一 WIN7-36 冻结 ZIP 和新 IP authority
  于 `10.233.193.40` 的 Win7 SP1 x64 非提权普通用户会话完成 G1→G2→G3 和 15 项 UI 子集验证。
  物理 1366×768 / 125% DPI 的实际内容视口为 1079×540 CSS px，最坏形态完整可见 4 行。
  负责人明确按**可达响应式状态等效**裁决 W36-06/12/13/15：目标视口使用两列加 Inspector
  抽屉、导航栏开关 × 抽屉开关四态；不宣称在该视口看到了三列或四个桌面 class 组合。
  请求 700px 被钳至 847px，≤799px 分支及真正跨越 800px 仍为
  `PRODUCT_UNREACHABLE / NOT_VERIFIED`。冻结候选自带报告器在普通用户会话中核验
  `report-stage-v5.json`（SHA-256 `f7463691076491312c80fc83032417eb520bfede22c8be1c0edb4967a9e559e1`）
  为 `status=PASS`、`verified_cases=15`、`direct_current_candidate_cases=15`，签发
  `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`；计数表示同候选证据绑定，不表示不可达几何已直接实测。
  报告器输出 SHA-256 `05d9d00818e0b094ec18803721aa8bf228e0e929277f775a54867827447c0c4f`。
  详见[WIN7-36 实机验收收口](reports/2026-09/a9_16_win7_36_ui_subset_acceptance_2026-09-24.md)。
  候选 ZIP、kit、旧报告不变；完整 Alpha 2、Review、Shell streaming、RC 未获此结论。

- 2026-09-12，负责人授权 [A9-17](tasks/A9_17_STARTUP_MEMORY_OPTIMIZATION.md) 启动测量修正与三个启动热点优化，分支 `codex/a9-alpha2`，基线 `7d06789`。本地实现完成，状态/Shell 定向测试及开发机 Electron 86 项回归通过。当前保留 `A9_17_IMPLEMENTATION_AUTHORIZED`；未提交/部署，不改历史候选。补充开发机优化前后 A/B（`git archive HEAD` 导出优化前侧，端点对比 + 0/100/1,000/5,000 轮规模扫描 + 稳态确认，Electron `getAppMetrics` 口径、需 `--no-sandbox`）：窗口创建约 −4.7～−5.3 s；稳态空闲 1,000 轮 −138.2 MiB、5,000 轮 −584.4 MiB，空历史无变化；优化后仍随历史增长 46.5 MiB（Main +33.9），首屏就绪仅超大历史下可判改善。非产品配置，PowerShell/WMI 行为与 Win7 性能收益仍 `NOT_PERFORMED`。

- 2026-09-11，A9-15 WIN7-28 在 Windows 7 SP1 build 7601 x64 普通用户 Medium/non-elevated 桌面令牌下
  完成 10/10 当前候选直接用例；自动产品 smoke 75/75 assertions、真实 Provider `tool_calling` 多工具轮次、
  前置/后置完整性、零残留进程、本机返回证据 verifier 与目标机 verifier 全部 PASS。冻结源码为
  `d71807fa0d0f011d9c35104e7cd6dab62058ffa5`，ZIP SHA-256 为 `f1b6730…08351`，正式报告 SHA-256 为
  `cc9b422…b267`。据此签发 `A9_15_WIN7_UI_INTEGRATION_PASS`，A9-15 更新为 COMPLETE；该裁决只关闭
  WIN7-28 UI 集成合同，不重签 `A9_14_WIN7_22_GO_FOR_ALPHA`，也不构成新的 Alpha 或 RC PASS。脱敏证据见
  [收口报告](reports/2026-09/a9_win7_28_ui_integration_closeout_2026-09-11.md) 与
  [结构化状态](status/a9-15-win7-28-ui-integration-20260911.json)；原始证据、截图、SQLite 和候选二进制保存在候选外。

- 2026-09-10，WIN7-28 验收工具在真实 Electron 开发机 smoke 下复核（`55d9d5f` 工作树，未提交）：
  首次真实运行 **FAIL 79/84**，暴露上一轮标记为"✅"的分页/会话残留/重试区域四个缺陷——
  retry 去重断言用了 `Set#length` 而恒假；分页"补载前已填充"把产品自身的「历史记录未包含过程。」
  提示当成已填充（假阳性），"补载后可观察"又要求 503 失败轮次存在工具活动组（假阴性）；
  会话残留正向样本是空会话而 `sessionResidueViolation` 明确拒绝空行集。修复后同一命令
  **PASS 84/84**，package 回归 **20/20**。另建立候选外 H07 harness：外置 driver 目录**不含**
  投影契约、缺省 legacy、配上逐条未改动的 W25 历史提示路由，真实运行 PASS（投影提示命中 0 条），
  证明共享 driver 的候选打包改动未破坏历史 profile；W23/W24/W25 原生 smoke 脚本因
  `win32` + Electron-as-node + ABI 110 平台门禁记 `NOT_PERFORMED_PLATFORM_GATED`；
  cleanup 未确认因无安全接缝保留 `NOT_PERFORMED`。交回材料见
  `validation/win7-28/W28_H09_HANDOVER.md`。WIN7-28 候选双干净构建、候选外 authority 与
  普通用户非提升 Win7 验收仍 `NOT_PERFORMED`，不得据此判定 F1～F4 全部完成。

- 2026-09-10，WIN7-27（`32c5f6b`）只读复核确认四项修复有实质改进，但仍存在四项 P2 级验收逻辑缺口：
  DOM 附件的实际结果与最新 turn 身份被解析后丢弃、逐行文本仍是非空/关键词检查、审批恢复顺序断言不要求
  出现恢复后的 `tool_start`、旧事件补载未真实执行即可通过。ADR-0121 / A9-15 §15 已授权按
  `docs/plans/WIN7_27_ACCEPTANCE_GAPS_REPAIR_PLAN.md` 修复 F1～F4 并在新候选 WIN7-28 上重建合同；
  WIN7-25/26/27 候选、证据与复核材料全部冻结。当前阶段为
  `A9_15_WIN7_28_ACCEPTANCE_GAP_REPAIR_AUTHORIZED`，WIN7-28 普通用户实机仍 `NOT_PERFORMED`。

- 2026-09-10，WIN7-26 只读复核确认产品投影修复与两个干净工作树的构建一致性成立（788 文件一致、ZIP 逐字节
  一致、W25 冻结工件未变），但发现四项 P2：投影附件只核对存在与哈希而不解析内容、Electron Inspector
  断言可接受缺行/乱序/重复、新增投影用例时移除了原审批与失败顺序签发断言、共享 driver 新协议破坏
  W24/W25 profile 兼容性。ADR-0120 / A9-15 §14 已授权以 `2e5a534` 为基线修复四项并在新候选 WIN7-27
  上重建合同；WIN7-25/26 候选、证据与复核材料全部冻结。当前阶段为
  `A9_15_WIN7_27_PROJECTION_EVIDENCE_REPAIR_AUTHORIZED`，WIN7-27 普通用户实机仍 `NOT_PERFORMED`。

- 2026-09-10，WIN7-25 只读复核确认 Renderer 两处修复有效，但发现回归未执行原连续渲染触发顺序，且
  kit/report 未把 Inspector 持久事件恢复与旧失败不得覆盖新成功设为签发条件。ADR-0119 / A9-15 §13
  已授权直接修复：真实 Renderer 回归必须能拒绝故障注入，Electron 重启链绑定旧失败/新成功 turn/event ID、
  查询事件与 DOM，WIN7-26 报告器拒绝新增断言或结构化投影证据缺失/失败。WIN7-25 候选和证据全部冻结；
  当前阶段为 `A9_15_WIN7_26_VALIDATION_GAP_REPAIR_AUTHORIZED`，WIN7-26 普通用户实机仍 `NOT_PERFORMED`。

- 2026-09-09，WIN7-24 普通用户真实 Provider 多工具任务完成并正常退出后，重启虽恢复中央对话且未重放，
  Inspector 活动却为空，全局结果错误停留在较早的 `failed · not_applicable`。只读 SQLite 元数据核对确认
  133 条事件完整存在，最新 task/turn/checkpoint/terminal event 均为 `completed · verified`，故裁定为
  Renderer 投影缺陷而非数据丢失。WIN7-24 永久保持 `FIX_BEFORE_WIN7_25_VALIDATION`，不得修改或重判。
  负责人已授权 ADR-0118：修复 Inspector 持久事件投影和全局最新轮次结果，补回归、本地提交不推送，
  建立全新 WIN7-25 并完成双干净构建、独立 authority 与受影响普通用户 Win7 复验。当前阶段为
  `A9_15_WIN7_25_REPAIR_AUTHORIZED`，尚未形成 WIN7-25 候选或新 PASS。

- 2026-09-09，负责人将真实 Shell 运行中增量输出、完整 Review、扩大左侧对话区、桌面宽屏左右栏独立
  开关及主区四态自适应纳入 `0.3.0-alpha.2`。ADR-0117 / [A9-16](tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md)
  已形成需求基线，状态为 `PLANNED_NOT_AUTHORIZED`：不构成实现、候选或验收授权。Review 审批卡只属于
  Review staging/Apply；Full Access 普通写入无 Review 卡，但既有高影响操作目标绑定确认仍保留并须在
  UI 中明确区分。当前 WIN7-24 与 Alpha 1 验收事实不因此修改或升级。

- 2026-09-09，ADR-0114 / [A9-15 UI 优化与 Agent 过程反馈](tasks/A9_15_UI_PROGRESS_FEEDBACK.md) 在
  `codex/ui-optimization` 分支（基线 `72dfe22`）完成开发机实现与定向验证：按获批 Demo 暖色浅色主题重构
  工作台视觉，新增 `model_note`/`approval_resolved` 事件与 `a9.events.query`（IPC schemaVersion 6）
  过程回看；core 18/18、state 55/55、shell 87/87 合同测试与三包 lint、docs:check 全部通过（证据见
  任务书 §6）。独立检查后修复状态误判、审批记录顺序、历史分页与失败重试；不修改 native helper、Runner/Policy 安全
  语义；本轮 macOS Electron smoke 最终 57/57 PASS，另取图并查看四个场景，完整 UI
  交互矩阵仍待验证。目标机已按项目专用验收身份与锁定主机指纹严格 SSH，
  只读预检确认 Windows 7 Professional build 7601 x64；管理员 SSH 不构成普通用户 PASS。
  用户随后授权提交 A9-15 范围改动（不推送）、新增独立 WIN7-23 `release/**` 合同并继续实机验收；当前阶段进入
  `A9_15_WIN7_23_CANDIDATE_PREPARATION`。候选、候选外 release authority、普通用户执行和真实 Provider
  多工具任务尚未完成，仍不新增 Win7 PASS。

- 2026-09-09，WIN7-23 在双干净构建、候选/包完整性及普通用户非提升令牌门通过后，自动产品 smoke
  发现验证启动器实际加载候选 `resources/app` 而非 driver，三个 phase 报告未生成；该候选与失败证据已
  冻结，保持 `FIX_BEFORE_WIN7_24_VALIDATION`，不得修改或重判。负责人随后授权 ADR-0116：修复为候选外
  独立 Electron 验证副本，补齐 stop 工作区前置与反假阳性断言，并按目标机截图优化 Win7 本地字体栈、
  整数基础字号和辅助文字对比度；提交后建立全新 WIN7-24，不推送。当前仍处
  `A9_15_WIN7_24_CANDIDATE_PREPARATION`；WIN7-24 哈希、独立 authority、普通用户实机与真实 Provider
  结果尚未形成，均不得写成 PASS。

- 2026-09-07 补录 2026-09-04 的 WIN7-22 正式收口：源 `1c04644`，ZIP `5cc07f35…c4e8`，
  正式验证 13/13（4 直接、9 继承），G7 独审 P0/P1/P2=0，裁决 `A9_14_WIN7_22_GO_FOR_ALPHA`。
  下方记录为历史执行过程，不覆盖此冻结候选最终裁决；Win10 同候选 smoke 仍为 RC 前置。
  证据与构建基线边界见 [收口核对报告](reports/2026-09/a9_win7_22_closeout_and_build_baseline_2026-09-07.md)。

- 2026-09-03，WIN7-22 G0 的 r14 虽在 Win10 双构建中得到字节一致 helper，正式记录器仍因请求证据中的
  中文空格目录被 Windows PowerShell 5.1 按 CP936 误读为 `涓枃 绌烘牸` 而拒绝，未生成输入锁；r14
  已撤销且不改判。编码兼容修复提交为 `1eb02c254ffd8a4081c984da21f176671c6ce026`，改用 Unicode 码位构造
  路径；r15 ZIP、input lock、package manifest SHA-256 分别为 `2b4192cc…61a1c`、`494e8939…dd4b`、
  `2692fff9…03b`。独立审查在撤销 r14 的条件下批准 r15 进入新的 Win10 双构建。r15 随后在两个全新
  目录完成构建，run ID 为 `8cb9089e…bf6`、`7bf6be7c…593`，返回 ZIP 为 `7485cf22…d6d0`、
  `5d37a5f…e237`，字节一致 helper 为 `c8615e65…fa31`；正式记录器已生成 WIN7-22 新 input lock
  `a9750078…f7e1`。G0 helper 输入冻结完成，产品双构建与 Win7 实机 PASS 仍未执行。

- 2026-09-03，WIN7-21 在 Win7 普通用户 D-013 CMD 当前候选用例失败：native helper 对已绑定的
  `/d /s /c` command payload 再次套用 CRT argv 引号，导致内部双引号被反斜杠转义，目标文件未创建；
  同一 payload 经管理通道直启成功。独立复核结论 `P0=0 / P1=1 / P2=1`，G6 硬停止、G7 未执行，
  WIN7-21 永久保持 `FIX_BEFORE_ALPHA`。负责人已授权 ADR-0111/A9-14 在独立干净分支作最小 verbatim
  修复、独审、重新冻结和双构建，以全新 WIN7-22 重跑受 helper/候选影响的门禁；稳定宿主项仅轻量复核，
  未受影响历史能力只允许精确哈希继承。当前尚未形成新源码冻结、Win10、Win7 或 Alpha PASS。

- 2026-09-03，WIN7-20 在 Win7 普通用户正式 Electron 启动时因既有 WIN7-19 schema v4 的
  `a9_sessions.last_activated_at` 物理声明可为空而被后置严格校验器拒绝；四项直接用例均未执行，候选
  永久保持 `FIX_BEFORE_ALPHA`。负责人已授权 ADR-0110/A9-13 在独立分支从该候选源码 `9323cbe` 作
  精确兼容性修复、独立审查、重新冻结和产品双构建，并以全新 WIN7-21 从 G0 重走全部门禁。冻结前
  独立审查已以 `P0=0 / P1=0 / P2=0` 批准进入 G0；尚未形成 Win10、Win7 或 Alpha PASS。

- 2026-09-03，r11 在两个全新目录经无 Host Job 的 WMI 进程顺序构建，run ID 为
  `054a5213-58e8-4433-ae86-ce012ee0b721`、`157caea1-56b6-4ef8-97b4-062f1657931c`；两次 logic、
  capture、v1/v2 smoke、PE/API/CRT 均 `PASS`，helper.exe 均为 331776 字节且 SHA-256 同为
  `43bd9dfd…04ce`。两个返回 ZIP SHA-256 为 `5a5c433a…6864`、`42c4511f…e681`，正式记录器复核通过并
  创建 `a9-09-input-lock.json`（SHA-256 `54012613…dfc3`）。Win10 构建门槛完成；产品装配与 WIN7-20
  仍为 `NOT_PERFORMED`，两项负责人延期的 Provider P2 仍不标记关闭。
- 2026-09-03，r10 两个全新 WMI 构建再次全部 `PASS`，非 `helper.obj` 对象已一致，但 helper 对象及最终
  EXE 仍不同。COFF 符号比较定位到 MSVC lambda 内部名称仍受传入编译器的绝对源码参数影响；Win10 直接
  探针确认从各自 kit 根运行且使用相同相对 source/include/object 参数后，两个 `helper.obj` 均为
  `bf466ce7…2f14`。修复提交为 `bbbffdf73622c02aa4d36e2bc9efeb9218c86c8a`，r10 已撤销。新 r11 ZIP、
  input lock、package manifest SHA-256 分别为 `7aeceef0…378b`、`a29d6ebe…76e9`、
  `ed706a02…65eb`，等待两个全新目录复验。
- 2026-09-03，r9 两个无 Host Job 的全新 WMI 构建均为 `PASS`，但 helper SHA-256 分别为
  `7778c8f2…d6bd` 与 `b9141b85…88de`，不满足字节一致门槛。逐层比较定位到 MSVC `.obj` 中的不同绝对
  构建路径；Win10 探针确认 `/Brepro /experimental:deterministic`、把各自 kit 根映射到固定
  `C:\a9-v25-kit` 且保持相同相对对象路径后可得到相同对象。修复提交为
  `0e134d54cb4d26fb761355272b151aa785643056`，r9 已撤销。新 r10 ZIP、input lock、package manifest
  SHA-256 分别为 `9a267b4a…6583`、`3e9d4984…ec65`、`7abaa864…c28a`；当时等待两个全新目录复验。
- 2026-09-03，r8 的禁止 overlay smoke 按既有协议返回 `error: JSON_PARSE_FAILED`，但新脚本/记录器误读
  `code` 字段并由 StrictMode 拒绝。消费者与夹具修复提交为 `bc26e5835b479be7fff1a23150d07f7868baacfe`，
  r8 已撤销。新 r9 ZIP、input lock、package manifest SHA-256 分别为 `e2ceab17…4708`、
  `6ca67019…8a48`、`37da1fe1…e203`，等待全新双构建。
- 2026-09-02，r7 通过精确 ACL 回滚后暴露 CMD `if defined ... & echo` 条件链吞掉最终 marker；Win10
  直接对照已复现并确认 `if ... else if ... else echo` 语法。修复提交为
  `e3e778bdf62e22777e58e9eb7370de38c3ab3926`，PowerShell 5.1 前置自测现真实验证 marker；r7 已撤销。
  新 r8 ZIP、input lock、package manifest SHA-256 分别为 `64772425…5e35`、`0e2e2f73…22f8`、
  `005abf83…39e7`，等待全新双构建。
- 2026-09-02，r6 在无 Host Job 路径完成原生构建后发现 DACL 回滚会新增 `SE_DACL_AUTO_INHERITED`；
  Win10 API 探针证明用捕获的原始安全描述符调用 `SetFileSecurityW` 可精确恢复。修复提交为
  `9fa02c3b6503e71aae8f0c889d5dbc61e30a8776`，r6 已撤销；新 r7 ZIP、input lock、package manifest
  SHA-256 分别为 `f5bf50a5…dafb`、`71c7a797…7081`、`320ea758…8f98`，等待全新双构建。
- 2026-09-02，r5 在锁定 Win10/MSVC 环境暴露 Win32 `max` 宏与 `std::max(...)` 冲突；最小修复已提交为
  `7f43dec19612bafba1bb94e5ecb261cd87508f80`。r5 已撤销，FAIL 诊断保留；新 r6 ZIP、input lock、package
  manifest SHA-256 分别为 `4d7985d4…922c`、`104b4aca…c8c5`、`da90075f…b5c8`，当前仅 r6 获准进入
  新的 Win10 双构建目录。该修复尚不等于 Win10 或 Win7 PASS。
- 2026-09-02，A9-09～A9-12 修复提交为 `c718152f0c413d2c21407eec042dc50197b6e51f`；新 r5 Win10
  离线构建套件曾获准用于首次构建，后因上项 MSVC 失败撤销；旧 r4 撤销项也保持不变。
- 2026-09-02，项目负责人确认 Bitvise trace logging 已关闭，并决定将独立复核发现的两个 Provider P2
  延期：代理端口 `0` 静默清除及显式清空 API Key 后旧持久化凭据可能在重启时恢复。本轮获准提交并
  推送现有 A9-09～A9-12 修复、继续 v25 Win10 双构建和 WIN7-20 候选验证；两项 P2 不标记为关闭，
  最终报告必须保留风险，相关开发机证据不构成 Windows DPAPI 或完整发布 PASS。
- ADR-0109 / [A9-12 D-013 v25 后置恢复与用户流加固](tasks/A9_12_POST_REVIEW_RECOVERY_AND_UI_HARDENING.md)
  已关闭 Viewer 编码状态、正式 Explorer smoke、Undo IPC、IME、Provider 高级配置、审批恢复 Stop、退出
  残留提示、Shell 探测缓存、崩溃锁恢复和初始化诊断十项缺口。定向 State 37/37、Shell 97/97、七模块
  1563 tests、发布 17 PASS/1 Windows skip、原生逻辑和真实开发机 Electron 22 四进程 smoke 均通过；
  当前状态 `A9_12_DEVELOPER_VERIFIED_PENDING_WIN7`。Win10/Win7 未执行，不解除 `FIX_BEFORE_ALPHA`。
- ADR-0108 / [A9-11 D-013 v25 后置安全与可用性修复](tasks/A9_11_POST_V25_USABILITY_SECURITY_HARDENING.md)
  已关闭独审复现的 Git 回调/投影秘密、活动模式迁移、拆分流秘密、SSE 中文、Shell DTO/活动刷新、显式
  编码 edit 和 Viewer legacy UTF-8 八项源码缺口。七模块 1554 tests、发布 15 PASS/1 Windows skip、
  原生逻辑 PASS；后续 A9-12 合并工作树已关闭 Runtime 初始化阻塞并通过真实开发机 Electron smoke，
  状态更新为 `A9_11_DEVELOPER_VERIFIED_PENDING_WIN7`。Win10/Win7 未执行，不解除 `FIX_BEFORE_ALPHA`。
- ADR-0107 / [A9-10 中文编码与大文件读取](tasks/A9_10_TEXT_READ_HARDENING.md) 已获负责人独立授权并完成
  本地源码修复：显式 GBK/UTF-16LE、binary 元数据、64 KiB 异步分块、128 KiB 有界预览和完整基线哈希。
  Workspace/Core/真实产品组合共 535 tests PASS，状态 `A9_10_DEVELOPER_VERIFIED_PENDING_WIN7`；
  未提交、未打正式包、Win7 未执行，不解除 A9-09 或 `FIX_BEFORE_ALPHA` 门禁。
- ADR-0101 / [`A9-09 D-013 TrustedShell Current-User Profile`](tasks/A9_09_D013_TRUSTED_SHELL_PROFILE.md)
  的初始 A9-09A 开发机 Gate 随后被 v25 独立复审撤销；旧 r4 SHA-256 `037213c…e09` 不包含当前未提交
  整改，已禁止正式使用。上一轮本地整改完成 1498 项全量测试；ADR-0103 的工作树自批准问题已获复审
  关闭，但完整闭包只证明内部自洽，随后复审发现发布信任 P1=1。已按 ADR-0104 补充候选外批准记录与
  独立哈希 pin、正式 lock/批准根/双构建绑定和原生 PE 检查，本地发布回归 18/18、全量 1498 tests PASS；
  随后五参数文档 P2 也获独审关闭。但最新复审新增两项 P1：普通变量名可携带已知秘密，以及 NODE_DEBUG
  等控制项漏拦。ADR-0105 环境整改已获最新独审关闭；该轮新增生成器精确数组匹配及 OrderedDictionary.Clone
  两项构建脚本 P1，现按 ADR-0106 修复并补真实生成器入口回归。修复已提交并生成、批准 r5；当前 Gate 为
  `A9_09B_READY_FOR_WIN10_DOUBLE_BUILD`，尚未完成 D-017 Win10 双干净构建、正式 v25 input lock、
  WIN7-20 候选和 Win7 实机复验，因此综合状态继续为
  `FIX_BEFORE_ALPHA`，PR #3 仍不得合并。
- ADR-0100 已根据合并前独立代码审查开启
  [`A9-08 后置审查修复`](tasks/A9_08_POST_REVIEW_HARDENING.md)，状态
  `APPROVED_FOR_IMPLEMENTATION / FIX_BEFORE_ALPHA`。已动态确认的审批绕过和秘密持久化，以及独审确认的
  Provider、遗留 IPC、进程、checkpoint 和迁移 P1 必须修复；PR #3 暂不合并。修复完成后构建 WIN7-20，
  按 ADR-0097 执行扩大后的增量复验并重新裁决。
- A9-08A 已关闭当前已知的 Shell 转义/动态调用审批绕过和正常 A9 Renderer 的遗留 A8 Review mutation
  IPC 旁路；A9-08B 已关闭事件/审批持久化秘密泄漏、跨 Provider origin 旧 Key 复用、TLS 校验关闭和缺失
  CA 静默忽略；A9-08C 已将正式前台/后台 Shell 接入 D-013 helper，收紧整树回收真实性、双 Stop 和
  窗口销毁前退出裁决。第四批进一步完成 checkpoint v4 目录树哈希/无碰撞快照/undo 单次持久化、跨工作区
  对话操作拒绝、v2→v4（含最终 schema/index 创建）整体原子迁移与真实 A8 物理库只读白名单导入；
  轮初文件/目录快照不可覆盖、restore swap/旧 checkpoint fail-closed、物理 v4 schema 完整校验、Provider
  generation 隔离、递归秘密脱敏、崩溃后两阶段 checkpoint 对账和清理不确定事实跨重启闭环。最终开发机
  7 模块共 1482 tests、docs/diff
  检查通过。独立审查同时确认锁定的 D-013 v24 Low Integrity/低风险白名单协议不能承载 A9 Full Access，
  且缺少 envOverlay、真实无 deadline 与 managed ready acknowledgement；该修复需要新 ADR/任务授权
  `native/helper/**`。安全、进程、checkpoint/状态三路最终独立复核均为 P0/P1/P2=0，授权范围内闭环 PASS；
  A9-08 阶段记录以 `A9_08E_BLOCKED_D013_CONTRACT` 结束并移交 ADR-0101/A9-09；当前执行状态为
  `A9_09A_BUILD_REVIEW_FIXES_PENDING_INDEPENDENT_REVIEW / FIX_BEFORE_ALPHA`，尚未构建 WIN7-20。
- 产品负责人已确认
  [`Windows 7 Trusted Coding Agent 产品需求合同 V1`](prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md)
  和 ADR-0089/ADR-0096；实现任务为 [`A9_TRUSTED_AGENT_RUNTIME`](tasks/A9_TRUSTED_AGENT_RUNTIME.md)，状态
  `COMPLETE / A9_ALPHA1_PASS`，交付分支 `codex/a9-trusted-agent-runtime`，版本 `0.3.0-alpha.1`。
- 最终候选 WIN7-19 绑定源码提交 `781b20e3da277570f85c28286d7ea5bbbdd5fa28`；ZIP SHA-256
  `824a10cd…72b0`，manifest SHA-256 `b483e9b0…2c26`，780 文件、state schema v4、干净源码双构建
  字节一致。Win7 SP1 x64 上的候选身份、5/5 完整性、正式 Electron 生命周期、审批缺陷复验和后飞行
  均通过，ADR-0099 按当时范围裁决为 `GO_FOR_ALPHA`。后置独审的新证据不改写这些现场事实，但使当前
  综合交付状态转为 `FIX_BEFORE_ALPHA`。机器记录与收口报告见
  [`a9-alpha1-win7-19-acceptance-20260828.json`](status/a9-alpha1-win7-19-acceptance-20260828.json) 和
  [`a9_alpha1_win7_19_closeout_2026-08-28.md`](reports/2026-08/a9_alpha1_win7_19_closeout_2026-08-28.md)。
- WIN7-19 直接重验四个新 Turn 的独立审批身份、拒绝/旧卡/重复点击/变更目标零额外执行；批准卡只消费
  一次。其余七组未受本次 Git 命令分类修复影响的能力按 ADR-0097 继承 WIN7-17/18 证据。旧报告校验器
  不支持 `INHERITED_EVIDENCE`，因此候选报告保持 `EVIDENCE_PENDING`，不把继承项伪写为当前候选现场 PASS。
- WIN7-10 在 Gate 4 证明 Full Access 与 Read Only 通过，但 Review 因正式 Runtime 未配置 staging 后端而
  fail-closed；该失败按旧三模式合同永久保留，不追溯改判。ADR-0096 将 Alpha 1 收敛为 Full Access 与
  Read Only，并把完整 Review 移入 `0.3.0-alpha.2`。该范围调整不改变 WIN7-10 产品字节，因此不要求新候选
  或重跑已完成的同候选项目；验收从现场实际检查点 J4 继续。仍可选择但只会 fail-closed 的 Review 作为
  Alpha 1 已知限制记录，不计入 Alpha 1 PASS。机器可读范围记录见
  [`a9-alpha1-review-deferral-20260825.json`](status/a9-alpha1-review-deferral-20260825.json)。
- A9 从最新干净 A8 代码基线启动，复用对话/会话/Goal、Agent Runtime、上下文压缩、SQLite、DPAPI、
  Electron Renderer 隔离与确定性打包；A8 Review 代码只作为历史输入保留，不构成 Alpha 1 产品能力。
  A8 候选和证据保持历史原样，不继承为 A9 产品 PASS。
- A9 取代 A8 默认不可用的关键产品策略：可信工作区推荐 Full Access，允许通用 PowerShell/CMD Shell、
  直接多文件写入、工作区外显式路径、真实 Git 配置和用户网络；外部写、破坏性 Git、永久删除和系统级
  操作继续目标绑定确认。该模式不是 Win7 强沙箱。
- A9-00 文档与差距 Gate 已取得 `A9_00_DESIGN_AND_GAP_PASS`。A9-01～A9-06 对应实现、fixture
  行为测试和开发机 Electron 22 产品入口 smoke 保持 PASS；Review 的 Alpha 1 处置是范围延期和已知限制，
  不把缺失 staging 的失败改写为功能 PASS。F2/F4/F5/F6 修复检查点见
  [`a9-trusted-agent-runtime-latest.json`](status/a9-trusted-agent-runtime-latest.json)。这表示代码与开发机证据
  可供独立复核，不等于六个正式串行 Gate 已全部签发。
- A9-04 已使用 `https://api.deepseek.com` / `deepseek-v4-flash` 完成真实 SSE、tool calling、五次工具执行、
  真实修复/测试与取消，Gate 为 `A9_04_REAL_PROVIDER_PASS`。首次运行发现工具 Schema 缺少顶层
  `type: object`，统一 wire 修复后 Gateway 241 项与真实闭环均通过；凭据未写入证据。记录见
  [`a9-04-real-provider-deepseek-20260823.json`](status/a9-04-real-provider-deepseek-20260823.json)。
- A9-05 已完成：真实模型 J1 实际读取指令/配置/源码并引用路径，J2 完成真实修复和测试，J3 完成范围
  受控的跨文件功能和真实项目脚本；行为化 J4/J5 使用真实 Git/审批和 SQLite/子进程副作用。记录见
  [`a9-05-real-model-journeys-deepseek-20260823.json`](status/a9-05-real-model-journeys-deepseek-20260823.json)。
- A9-06 经 1307 项回归（含 A9-07 新增 5 项包运行时/DPAPI 宿主注入合同）和真实 Electron 22 三进程
  38/38 验证，Gate 为
  `A9_06_DESKTOP_STATE_AND_LIFECYCLE_PASS`。A9-01～A9-06 汇总见
  [`a9-01-to-a9-06-developer-gates-20260823.json`](status/a9-01-to-a9-06-developer-gates-20260823.json)。
  A9-07 历史上，Win7 `WIN7-02` 对候选 `5bee0069…d5b3` 的 Gate 3 首次 Full Tree 校验在
  `resources/default_app.asar` 失败，旧失败证据保持不变。根因是 Electron ASAR hook 改变了校验器的
  `fs` 读取语义；提交 `dce391c` 改为 `original-fs` 物理字节并清除 `NODE_OPTIONS`，新增回归后仓库
  1310 项与包测试 4/4 通过。新候选双构建一致，ZIP SHA-256 为 `37c3e51c…60080`、manifest SHA-256
  为 `63801337…1b626`，`source_dirty=false`。它已在 Win7 独立 `WIN7-03` 证据目录通过 ZIP、manifest、
  Full Tree、native/ABI 和无系统 Node 五项 Gate 3。该历史候选随后被 WIN7-10～19 迭代取代；记录见
  [`a9-07-win7-gate3-integrity-repair-20260824.json`](status/a9-07-win7-gate3-integrity-repair-20260824.json)。
  权威差距与交付计划见
  [`A9 Trusted Agent 差距与交付计划`](reports/2026-08/a9_trusted_agent_gap_and_delivery_plan_2026-08-22.html)。
- Office 专用能力不进入 A9 Alpha 1；首要交付是代码阅读、编辑、文件管理、Shell、测试、Git、Diff、
  撤销和重启恢复的五条真实 Coding Agent 旅程。

## A8 Agent-first 产品体验（2026-08-20）

- 负责人已确认 [`Agent-first 产品需求合同 v1`](prds/WIN7_AGENT_FIRST_PRODUCT_REQUIREMENTS_V1.md)，
  并授权 [`A8_AGENT_FIRST_PRODUCT_EXPERIENCE`](tasks/A8_AGENT_FIRST_PRODUCT_EXPERIENCE.md) 在独立
  `codex/a8-agent-first-product` 分支实现。目标是把固定场景验收控制台重构为对话优先的 Coding Agent：
  自然语言启动、直接/计划模式、连续 Assistant 消息、工具卡片、上下文引用、多文件 Review、真实测试、
  会话/Goal 恢复以及隔离的 Terminal/受限 Browser 工作区。
- ASAR 修复新候选已重新签发为 `A8_DEVELOPER_COMPLETE_VALIDATION_READY`，但不是
  `COMPLETE / A8_RC_PASS`。新候选尚未在 Win10/Win7 执行；旧候选的 Win10 A8-03
  `FAIL_A8_03_VALIDATION_HARNESS_ASAR_FALSE_NEGATIVE` 与后续 `NOT_RUN` 保留为历史现场事实。A7
  `0.1.0-rc.1` 保持只读冻结，其 `RC_PASS` 不自动传递给 A8。
- A8-00 已完成并取得文档 Gate `A8_00_DESIGN_PASS`。冻结合同为
  [`A8-00 产品架构与数据合同`](prds/A8_00_PRODUCT_ARCHITECTURE_AND_DATA_CONTRACT.md)，关键裁决为
  ADR-0075，追踪报告为
  [`a8_00_design_gate_2026-08-20.html`](reports/2026-08/a8_00_design_gate_2026-08-20.html)。信息架构、
  原始事件/展示投影、会话恢复、多文件准备区、A7 迁移白名单和 A8-01～A8-05 测试口径已冻结，
  没有应用代码或产品测试被计入本 Gate。
- A8-01 已完成并取得 `A8_01_CONVERSATION_PASS`：对话主界面、Enter/Shift+Enter、直接/计划模式、
  计划前置审批、工具卡片和原始 `gateway.delta` 审计后的确定性聚合已实现；`A8E-01`～`A8E-06`、
  Composer、计划零副作用与原始审计测试通过，仓库级 `npm run verify` 通过。证据见
  [`a8_01_conversation_gate_2026-08-20.html`](reports/2026-08/a8_01_conversation_gate_2026-08-20.html)。
  A8-02 也已取得 `A8_02_WORKSPACE_SESSION_CONTEXT_PASS`：同工作区多会话、Session/Thread/Turn/Task/Run
  隔离、产品级单活动任务锁、Goal 原子修订与恢复投影、文件/目录/文本上下文引用，以及只读代码查看器
  已实现；`A8S-01`～`A8S-04`、Shell 148 项、State 235 项和仓库级 1010 项回归通过。本地 Chromium
  1280×720 三栏布局无页面溢出。证据见
  [`a8_02_workspace_session_context_gate_2026-08-20.html`](reports/2026-08/a8_02_workspace_session_context_gate_2026-08-20.html)。
- A8-03 已取得开发机实现 Gate `A8_03_REVIEW_APPLY_PASS`：ReviewSetV1、私有 staging、逐文件决定、漂移零写入、批量回滚、验证绑定、Host/IPC/Renderer Review seam 已实现；开发机回归与未完成门禁见
  [`a8_03_review_staging_progress_2026-08-20.html`](reports/2026-08/a8_03_review_staging_progress_2026-08-20.html)。当前没有真实项目测试 Profile，Electron 22、Win10、Win7 和 RC 仍为 `NOT_PERFORMED`，不因此宣称 A8 整体 PASS。
- A8-03 最新开发检查点已冻结 `a8-system-prompt-v1`（ADR-0079，SHA-256
  `f1bdcace084d27d71383b4ddfe81cef61029796a36859995c6e9614f1cbc9160`），解除 A3 遗留纯只读提示词与
  私有 Review staging 的语义冲突；受控 Gateway Provider Review 和已知凭据在 prompt、Workspace 工具
  结果、Provider chunk/响应/工具参数中的持久化前阻断均已通过。仓库级 7 模块 1051 项、Shell 169 项和
  文档检查通过，机器可读记录见
  [`a8-03-developer-checkpoint-20260821.json`](status/a8-03-developer-checkpoint-20260821.json)。真实 Electron
  三文件 Review 自动化代码已就绪，但本地 GUI 审批服务因用量限制拒绝启动，本项保持
  `NOT_PERFORMED_LOCAL_GUI_APPROVAL_UNAVAILABLE`；随后 GUI 审批服务恢复，真实生产 Electron 8-case 已
  PASS（证据等级 `DEVELOPER_SURROGATE_ELECTRON`）。开发机实现 Gate
  `A8_03_REVIEW_APPLY_PASS` 已签发，仅解除 A8-04；可复用执行器、外层工件哈希核验、故障回收合同测试和
  Win10/Win7 移交包已就绪，不以 Chromium Harness 或入口 smoke 替代。
- 现有 `NO_GO_INTERACTIVE_WINPTY` 继续有效。A8 Terminal 必须形成新的运行时 Profile 与 Win7 证据，
  否则只能保持清晰的 disabled/fail-closed 状态；不得以缺少现代强隔离为由放开任意 Shell、模型输入、
  未登记浏览或系统配置修改。
- A8-04 已取得开发机实现 Gate `A8_04_RUNNER_TERMINAL_BROWSER_SETTINGS_DIAGNOSTICS_PASS`：生产 Renderer
  的 Terminal/Browser disabled、Runner 未登记状态、RunnerLog 64 KiB/控制序列与危险链接清理、Settings
  fake key 脱敏、Diagnostics System Prompt/hash、CSP/Preload 和 `terminal.input` fail-closed 均已通过。
  真实 Electron 8-case 与 1280×720 Diagnostics 截图证据见
  [`a8_04_terminal_browser_settings_gate_2026-08-21.html`](reports/2026-08/a8_04_terminal_browser_settings_gate_2026-08-21.html)、
  [`a8-04-boundary-electron-qa-20260821.json`](status/a8-04-boundary-electron-qa-20260821.json)；运行使用
  Electron 41.7.1 macOS arm64，属于 `DEVELOPER_SURROGATE_ELECTRON`，只解除 A8-05。Electron 22、Win10、
  Win7 与最终 RC 仍为 `NOT_PERFORMED`。
- A8-04 Gate 收口时重新执行 `npm run verify`，7 模块共 1058 项（Gateway 202、Workspace 97、State 236、
  Core 229、Runner 67、Git Adapter 51、Shell 176）全部通过；`npm run docs:check` 为 83 files / 19 task files
  PASS。该回归仍是开发机证据，不等于 Win10/Win7 或 RC PASS。
- A8-05 已取得开发机实现 Gate `A8_05_PERSISTENCE_RECOVERY_MIGRATION_PASS`：D-014 `SqliteDatabase` seam
  的版本化结构化实体、Session/Goal/Turn/Task/Run 与事实重开、Review 文件哈希投影、Validation 摘要、
  活动执行中断、`AWAITING_REVIEW` 保留、Review 基线漂移 `STALE`、损坏/缺口/引用 fail-closed 以及 A7
  白名单迁移均已实现。Host 启动只恢复事实/UI，不自动调用模型、Runner、Terminal、Browser 或 Apply；
  机器可读证据见 [`a8-05-developer-checkpoint-20260821.json`](status/a8-05-developer-checkpoint-20260821.json)，
  D-014/Electron 22/Win10/Win7 锁定执行包见 [`a8-05-persistence-validation-kit-20260821.json`](status/a8-05-persistence-validation-kit-20260821.json)。
  开发机 `npm run verify` 为 7 模块 1072 项（Gateway 202、Workspace 98、State 245、Core 229、Runner 67、
  Git Adapter 51、Shell 180），`docs:check` 为 85 files / 19 task files；外部层仍为
  `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE`，该 Gate 只解除 A8-06 实现准备。
- A8-06 已取得开发机 Gate `A8_06_PACKAGE_AND_VALIDATION_READY`，状态为
  `A8_DEVELOPER_COMPLETE_VALIDATION_READY`：输入锁定的 Electron 22.3.27、D-013 v24、D-014
  8.7.0/SQLite 3.43.1 经过真实哈希核对后完成独立 `0.2.0-alpha.1` 候选装配；缺失/错误输入和
  `.env`/私钥/缓存/winpty/node-pty payload 负向测试 fail-closed，重复构建 ZIP/manifest/SBOM/
  许可证与 sidecar 字节一致，native helper/SQLite 位于 `resources/native`，A8-03/A8-04/A8-05
  验证入口和安装/并存/升级/回滚/卸载模板已随包交付。候选 manifest 只将
  `developer_package_integrity` 写为 `PASS`，product/Win10/Win7/RC 保持 `NOT_PERFORMED`；实际
  包和 manifest 哈希、命令与剩余外部门禁见 [`a8-06-developer-checkpoint-20260821.json`](status/a8-06-developer-checkpoint-20260821.json)
  与 [`a8-06-package-validation-kit-20260821.json`](status/a8-06-package-validation-kit-20260821.json)。
- 最新 UI 交互审计修正了旧复核的证据高估：旧 Chrome Harness 没有会话关闭/取消 seam，1024 px
  检查器和 760 px 以下导航不可达；跨会话关闭会丢失活动任务句柄，提交句柄返回前切换会话会跳过自动
  取消，Host 重开后新建会话也会因未恢复工作区失败。源码提交 `7121853` 已修复并推送；标题栏关闭入口、
  活动/归档分组、窄宽导航/检查器、焦点约束与语义控件均已补齐。仓库验证实际为 1083 项 PASS，新候选
  ZIP `e76b465b…5f9ab`、manifest `c3f51f98…7eda8` 双构建一致且 schema v2 10/10 PASS。Chrome 扩展未安装，
  Chrome Harness 为 `NOT_PERFORMED_LOCAL_CHROME_EXTENSION_UNAVAILABLE`；Win10/Win7/RC 不变。证据见
  [`a8-06-ui-interaction-audit-checkpoint-20260821.json`](status/a8-06-ui-interaction-audit-checkpoint-20260821.json)。
- 用户提供的 Win10 长对话截图确认了新的生产 Renderer 布局缺陷：Grid/Flex 自动最小高度会让消息内容撑高
  中间列，把底部 Composer 推到窗口外，同时使页面上的滚动无法到达真实底部。源码提交 `e6b3b34` 修复
  高度与滚动链；后续 `9fe439c` 把 `A8UX-01-CONVERSATION-SCROLL` 纳入发布验证包必验清单。Shell 194 项、
  仓库 1086 项、打包合同 4/4、证据合同 5/5 与 schema v2 10/10 均通过。新候选 ZIP
  `123fe4a8…f3375`、manifest `4a84d941…a4af6` 两次构建一致；Win10/Win7/RC 对此新候选仍为
  `NOT_PERFORMED`。证据见
  [`a8-06-conversation-scroll-layout-fix-checkpoint-20260821.json`](status/a8-06-conversation-scroll-layout-fix-checkpoint-20260821.json)。
- Win10 用户反馈“＋ 文本”点击无反应后确认：文本附件和 Goal 编辑仍调用 Electron Renderer 中不可靠的
  `window.prompt()`。源码提交 `a7682b0` 已用具备标签、焦点约束、取消路径、内联错误、UTF-8 字节计数及
  64 KiB/2,000 字符边界的应用内对话框替换全部原生 prompt；禁用附件按钮也会明确显示原因。新增真实
  Electron 用例 `A8UX-02-TEXT-ATTACHMENT-DIALOG` 并纳入验证包必验清单。Shell 197 项、仓库 1089 项、
  打包合同 4/4、证据合同 5/5、schema v2 10/10 均通过。新候选 ZIP `363fbfb0…bb053`、manifest
  `92fd342f…a214c` 两次构建一致；Win10/Win7/RC 保持 `NOT_PERFORMED`。证据见
  [`a8-06-text-context-dialog-fix-checkpoint-20260821.json`](status/a8-06-text-context-dialog-fix-checkpoint-20260821.json)。

## 验证状态

- 当前 main 开发机回归：`PASS` — 2026-08-12 在 `ec9d27a` 运行 `npm run verify`，7 个模块
  969 项全部通过（Gateway 202、Workspace 80、State 219、Core 225、Runner 65、
  Git Adapter 51、Shell 127），同时通过 TypeScript 检查、构建与静态设计门。该结果证明
  A4/A5/A6 收口后的 main 可回归，不替代 A7 RC 或新的 Win7 实机验收。
- 当前 A1～A3 收口工作区已建立最终指纹；最新证据编号为 `A1-A3-CLOSEOUT-20260804-01`（见
  `status/mvp-baselines/`），SHA-256 为
  `597eab41ee7fdedd1227ab92b9c318ce55d1965fad7e316620821e88115faf21`。历史 Win7 MVP 产品
  收口仍绑定 MVP-20260802-14；没有提交、暂存、切换或丢弃用户修改。
- 开发机回归：`PASS` — 2026-08-04 A1～A3 收口重跑 `npm run verify`，7 个模块共
  942 项测试通过（Gateway 202、Workspace 80、State 219、Core 225、Runner 46、
  Git Adapter 51、Shell 119）；各模块 lint/build 与静态设计门同时通过。
  `MVP-20260802-14` 的 889 项历史日志仍保存在
  [`validation/mvp_verify_MVP-20260802-14.txt`](../validation/mvp_verify_MVP-20260802-14.txt)，不改写为当前计数。
  Gateway 13 项 loopback 测试本次在仅允许本地临时端口的受控环境再次通过；
  历史结构化证据见 [报告](../validation/report_gateway_loopback_MVP-20260802-15.json)
  和[完整日志](../validation/gateway_loopback_MVP-20260802-15.txt)。
- Win7 SP1 x64：`OWNER_ACCEPTED_FOR_MVP` — C01 系统/补丁、Electron 22.3.27、CPython 3.8.10、受控 MinGit、机器 PATH 缺失工具检测、工件哈希和 Bitvise 状态在 MVP-20260802-14 只读采集中全部通过；真实 Electron 产品入口随后在隔离目录启动，沙箱 Renderer 加载、只读诊断回传并以退出码 0 正常退出，无对应 Electron 残留。客观 SPIKE/Phase 的正式状态没有被改写；延期边界由 ADR-0055 和负责人 disposition 单独记录。详情见 [Win7 MVP 实机报告](reports/2026-08/win7_mvp_acceptance_report.html)。
- SPIKE_03 的旧部署 `dist` 风险已由 fail-closed 修复并在受控 MinGit 派生包上重测；旧报告仍保留为历史证据，新报告绑定当前 adapter/harness SHA-256。
- 全部替代条件、命令与原始证据见 [status/latest-validation.json](status/latest-validation.json)；本页不把 MVP 替代项写成正式 Phase 或发布通过。
- MVP-20260802-12 已补充证据型 [SBOM](acceptance/MVP-20260802-12_SBOM.json) 与输入哈希清单（[manifest.sha256](acceptance/MVP-20260802-12_manifest.sha256.txt)）；两者明确标记为非正式产品发布闭包。
- MVP-20260802-14 新增 [负责人 disposition](acceptance/MVP-20260802-14_OWNER_DISPOSITION.json)、[产品/证据哈希清单](acceptance/MVP-20260802-14_product_manifest.sha256.txt)、[运行时盘点](../validation/win7_runtime_evidence_MVP-20260802-14.json)和[真实产品入口 smoke](../validation/report_product_shell_MVP-20260802-14.json)。
- Desktop Alpha 2 的 Win7 增量门禁已完成 A2-W03（用户拒绝且工作区不变）和
  A2-W04（显式批准后写入，目标 SHA-256 与 UTF-8/CRLF 预期一致，无临时/备份残留）。
  2026-08-04 又完成打包 Electron 自动证据 A2-W07～W10、W14、W15；原始报告为
  [`A2-W07-W15-20260804_auto-report.json`](acceptance/A2-W07-W15-20260804_auto-report.json)，
  报告 SHA-256 为 `a0c11b3f9db933ed591df278571e8fe813980e55228825a42ccbc9b4635473c8`，
  独立 SSH 复核确认 Win7 `certutil` 哈希一致、Bitvise PID 1780 仍运行且无本轮探针残留。
  同日 A1 product-entry smoke 2/2 与 A1 W08 security/readonly 14/14 也已在真实打包 Electron
  上通过；首次 A2-W01 GUI 检查暴露嵌套 `src` 目录下 Replay 未继续遍历的问题，已修复并以
  88 个 Shell 测试及重新部署的 Electron 包复核；用户随后确认 W01 工作区/会话/只读任务完成，
  人工记录见 [`A2-W01-20260804_gui-confirmation.json`](acceptance/A2-W01-20260804_gui-confirmation.json)。
  W02 检查又发现原 UI 未单独显示目标文件哈希，已补齐“目标 SHA-256”字段并重新部署；用户已确认
  W02 Diff 且未批准，人工记录见 [`A2-W02-20260804_gui-confirmation.json`](acceptance/A2-W02-20260804_gui-confirmation.json)。
  W13 撤销准备曾暴露 `task.undo_prepare` IPC Schema 漏登记 `sessionId`，已修复、以 90 个 Shell 测试
  复核并重新部署；新的隔离 W13 GUI 流程已完成初次批准写入，独立 SSH 核验匹配目标哈希，
  记录见 [`A2-W13-20260804_fresh-initial-approval.json`](acceptance/A2-W13-20260804_fresh-initial-approval.json)。
  随后撤销审批面板因 Renderer 任务 ID 切换竞态未显示；先前撤销计划人工记录已作废，竞态修复
  已通过 90 个 Shell 测试并部署，新的 `A2-W13-racefix-20260804` 隔离流程待重跑。
  racefix 流程现已完成 W13 初次审批、撤销审批面板、第二次审批和最终 SSH 恢复核验，记录见
  [`A2-W13-racefix-20260804-final.json`](acceptance/A2-W13-racefix-20260804-final.json)。
  W11/W12 打包探针原始报告已取回：W11 后端故障注入 `PASS`，并随后完成真实 GUI 锁定/恢复指引确认、用户恢复及 SSH 独立核验；W12 也完成真实 GUI 重启、恢复页面确认、用户点击恢复及 SSH 独立核验；原始报告为
  [`A2-W11-W12-20260804_report.json`](acceptance/A2-W11-W12-20260804_report.json)，SHA-256 为
  `b854a12c8cf370ffa53052b103f2b094dda9fb97b150e9fec27ab2c2a640e8ef`。
  W11 最终人工/SSH 收口记录为 [`A2-W11-GUI-20260804-final.json`](acceptance/A2-W11-GUI-20260804-final.json)：页面显示
  `rollback_failed`、写入锁定和人工恢复指引，未误报已回滚；最终文件恢复为原始 SHA-256，且无残留。
  W12 最终人工/SSH 收口记录为 [`A2-W12-20260804-final.json`](acceptance/A2-W12-20260804-final.json)：最终文件 SHA-256
  恢复为原始 `ce84104d3edf357a9a6bd8bf671190e05124f009a7deb77a834076bca83f17bb`，`.bak` 与恢复清单均不存在，
  Bitvise `BvSshServer` 仍为 `RUNNING`。
  详细路径、哈希和边界见
  [`INTEGRATION_01` §10](tasks/INTEGRATION_01_ROBUSTNESS_HARDENING.md)。A2-W01～W15 的 MVP 实机证据现已全部具备，
  因此 Desktop Alpha 2 仅按本次受控单文件修改 MVP 口径标记 `PASS`；这不改变正式 Phase/发布 Gate，也不表示
  Runner、Git、终端、Gateway 或 SQLite 可用。
- C01–C20 剩余门禁、前置依赖、执行顺序、证据接口和连接保护条件已形成 [剩余约束验收方案](reports/2026-08/win7_remaining_constraints_acceptance_plan.html)。

## Desktop Alpha 3 受控 Gateway 验收（2026-08-04）

- 受控结果为 `A3_CONTROLLED_GATEWAY_PASS`，结构化证据见
  [`A3-20260804-01_controlled-gateway.json`](acceptance/A3-20260804-01_controlled-gateway.json)，Win7 细项见
  [`A3-WIN7-HTTPS-20260804.json`](acceptance/A3-WIN7-HTTPS-20260804.json)，精致 HTML 报告见
  [`a3_controlled_gateway_acceptance_2026-08-04.html`](reports/2026-08/a3_controlled_gateway_acceptance_2026-08-04.html)。结果仅是受控 HTTP/HTTPS
  fixture 与 CONNECT proxy 的验收，不是企业 E7、真实模型或正式 Phase 3 PASS。
- A3-01 根验证通过：7 个模块共 909 项测试（Gateway 193、Workspace 80、State 219、Core 225、Runner 46、Git Adapter 51、Shell 95），lint/build 与设计门通过。
- A3 受控行为已通过：Replay 默认且无出站、显式 HTTP/HTTPS Gateway、HTTPS TLS 1.2 + 有效 CA、主机名/错误 CA fail-closed、SSE 协议/截断失败、3 次有界重试与 1.2 秒总 deadline、取消无迟到完成、CONNECT 成功/407 分类、凭据内存与脱敏，以及 Gateway→Core→Workspace 只读工具→UI 纵向链路。
- 已构建独立 A3 包并校验 Electron 22.3.27 SHA-256 为锁定值
  `2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb`；CA 私钥、API key、代理密码未进入仓库/报告。临时 fixture、proxy 已停止，端口检查未发现残留。
- Win7 A3 W01～W15 受控 Gateway 用例现均已有 PASS 证据：W13 使用 A3.2 独立产品包和新隔离
  工作区完成两次显式审批闭环，结构化记录见
  [`A3-W13-20260804-02.json`](acceptance/A3-W13-20260804-02.json)。初始 → 初次写入 → 撤销恢复
  的 SHA-256 依次为 `14e851…a582` → `33b305…2db5` → `14e851…a582`，无 `.tmp/.bak`；
  其他 W01～W12、W14、W15 继续引用既有原始报告。未改变网卡/路由/防火墙/服务/PATH、未重启。
- A2-W01～W15 仍按既有 Win7 MVP 实机证据与原指纹记录为 PASS；A3-W13 是 A3 范围的独立重验，
  不改写 A2 历史证据。DPAPI A3P-01～A3P-10 的整体结论仍待独立 W15 清理及其余 A3P 项收口；
  PAC/企业代理、企业 CA/模型和正式 Phase 3/E7 仍延期；公网真实模型由下述 A3.1 独立切片记录。

## Desktop Alpha 3.1 DeepSeek 公网真实模型验收（2026-08-04）

- 结果为 `A3_REAL_MODEL_PUBLIC_NETWORK_PASS`。结构化证据见
  [`A3R-DEEPSEEK-20260804.json`](acceptance/A3R-DEEPSEEK-20260804.json)，精致 HTML 报告见
  [`a3r_deepseek_public_model_acceptance_2026-08-04.html`](reports/2026-08/a3r_deepseek_public_model_acceptance_2026-08-04.html)。
  该结论只证明当前 Win7、当前 DeepSeek 账户和当前公网路径，不是企业 E7 或正式 Phase 3 PASS。
- Win7 无密钥公网探测连接 `api.deepseek.com:443`，223 ms 内完成 TLSv1.3 授权握手；证书 CN 为
  `api.deepseek.com`、Issuer 为 `TrustAsia DV TLS RSA CA 2025`，`/models` 返回预期 401 且响应正文未保存。
- 真实完成任务产生 638 个连续事件、618 个 Gateway 流增量；模型依次驱动
  `workspace.list_directory`、`workspace.search_text`、`workspace.read_text`，三组 started/completed 后
  以 `task.completed` 收口。报告 SHA-256 为
  `08b05d7f56bf6b6757dd3aa287816cfe869670fe9aed4432abec043d05c0d7be`。
- 独立真实取消任务在 48 个流增量后进入 `task.cancelling`，6 ms 后成为最终 `task.cancelled`；
  `task.completed=0`、`task.failed=0`，关闭报告前无迟到事件。报告 SHA-256 为
  `48466a13297bfc1194d54ef1a196d0c3c1f3bda4bd38daa6e4203a64ce60b575`。
- fix3 自包含包清单共 908 条，清单 SHA-256
  `8eb60ddf2c515fa4c896ea149d10a118c883f393925991ec3f77ddd8db02d3aa`；Electron 与关键 Product/Gateway
  文件均在 Win7 由 `certutil` 复核匹配。API key 仅在主进程内存，严格 key/Bearer 模式在报告、隔离
  userData/evidence 中均无值命中；退出后 Electron/Node 为 0，Bitvise 保持 `RUNNING`，SSH 22 保持连接。
- A2-W01～W15 继续按既有 Win7 MVP 证据和当前根回归标记 PASS；A3R 只暴露只读工具，未把历史
  A2 W13 冒充新的 A3 重测。A3-W13 已由 A3.2 独立记录完成。企业 Gateway/CA/代理/PAC、企业模型服务、
  正式 E7/Phase 3、Runner/Git/终端/SQLite/Updater/插件仍未完成或未启用；DPAPI 整体切片仍按 A3P
  证据单列。

## Desktop Alpha 3 A3-W13 独立写入审批重验（2026-08-04）

- 结果为 `PASS`，结构化证据见
  [`A3-W13-20260804-02.json`](acceptance/A3-W13-20260804-02.json)，精致 HTML 报告见
  [`a3_w13_write_approval_acceptance_2026-08-04.html`](reports/2026-08/a3_w13_write_approval_acceptance_2026-08-04.html)。
- A3.2 产品包在新隔离工作区完成两次独立显式审批：初次写入后文件 SHA-256 为
  `33b305c1903672e81d27ef07aa62decb62780fecb12740256765d19ade602db5`，撤销第二次审批后恢复为
  初始 `14e851741ab4d7acddef09d0dc7592d71f5e954c83c404fea2ba44bd9548a582`，无 `.tmp/.bak`。
- Renderer 当前按任务独立显示时间线；`prepareUndo` 会清空旧任务列表。本次以两个用户停点和两次
  SSH `certutil` 哈希核验形成证据，不宣称初次任务和撤销任务在一个 UI 列表中同时可见。
- 用户关闭产品窗口后，Electron/Node 进程均为 0，`BvSshServer` 为 `RUNNING`，SSH 22 仍可用；
  未改变网卡、路由、防火墙、服务、PATH，未重启。A3P 其他 DPAPI 原子项和企业 E7 仍单独处理。

## A1–A3 验收总览与 Win7 收口（2026-08-04）

- 总体口径为 `A1_A2_MVP_AND_A3_ACCEPTANCE_RECORDED_WITH_FORMAL_DEFERRALS`。A1 为
  `OWNER_ACCEPTED_FOR_MVP`，A2 为 `DESKTOP_ALPHA_2_MVP_PASS`，A3 受控 Gateway W01～W15 为
  `A3_CONTROLLED_GATEWAY_PASS`，A3R DeepSeek 公网纵向切片为
  `A3_REAL_MODEL_PUBLIC_NETWORK_PASS`。据此可以认为 A1～A3 的既定 MVP/Alpha 验收已完成，
  但不能写成正式发布、正式 Phase 3 或企业 E7 完成。
- A3P 的 Electron safeStorage / Windows DPAPI Current User 保存、重启状态识别与解密、清除、
  损坏 fail-closed 受控探针已通过；四份报告保留在 Win7 最终包中。由于 A3P-10“重启后显式
  真实连接”没有形成完整的本地归档证据，A3P 整体状态保持 `PARTIAL_EVIDENCE`，不提升为 PASS。
- 项目负责人明确批准永久删除 Win7 `C:\Win7CodingAgent` 下固定 23 个旧包、临时工作区和
  userData 目录。清理后 23 项均不存在，只保留 4 个最终包与 4 个 evidence 目录；按清理前盘点
  估算释放 `1,725,141,506` bytes（约 1.61 GiB）。最终复核 Electron/Node 均为 0，Bitvise
  `BvSshServer` 为 `RUNNING`，TCP 22 的 IPv4/IPv6 listener 均存在；临时清理脚本也已删除。
- 完整矩阵、证据 SHA-256、保留/删除清单和正式延期项见
  [`A1-A3-CLOSEOUT-20260804-01.json`](acceptance/A1-A3-CLOSEOUT-20260804-01.json) 与
  [A1–A3 Win7 验收总览报告](reports/2026-08/a1_a3_acceptance_closeout_2026-08-04.html)。

## A4 Execution Beta 非交互实机验收（2026-08-05～06）

- A4 无人值守编排 `A4-20260805-123467` 的 AUTO-00～AUTO-07 全部通过，锁定 x64 候选
  SHA-256 为 `733f549181228273afd65817b6448be1cc4beb888f8bf2caa294e4e1299ceecc`；Win7
  非交互 Helper 14/14，通过后无相关残留，`taskkill=false`，Bitvise 保持 `RUNNING`。
- 补充执行 `A4-20260806-140606` 的 REM-00～REM-06 全部通过：正式 C02 为 `PASS`；C03 为
  `FAIL`，因为 Restricted Token 进程仍能写入工作区外兄弟目录；C05 loopback TCP/UDP/DNS
  可达，但缺少批准的外部/企业端点和网络审计，因此正式 C05 保持 `ENVIRONMENT_MISSING`。
- 完整 SPIKE_02 仍为 `NO_GO_FORMAL_GAPS`：19 个原子项中直接通过 6 项（C01、C02、C06、
  C07、C08、N06）；C04 需要人工 ACL 授权。A5/D-011 的 Electron 22 ABI 工件已经由 Win10 构建
  并复核，但终端集成/harness 仍未完成，T01～T05/N01～N05 尚未执行。D-013 v15 的 Win10
  源码→二进制闭包为历史 `PASS`；`A4-20260810-000002` 已在 Win7 fail-closed：轮前、上传、smoke、
  harness 启动和后置零残留通过，但 C01/C03/C04/C05 共享 `ACL_ROLLBACK_FAILED`，REM-D07 又遇到
  空 stderr 的 `certutil 0x800703EE`。该轮 ledger 当时为 `RECOVERY_REQUIRED`，生产 Runner 未开放。
- v21 recovery 已在签名租约 `A4-20260810-000004` 下完成：REM-D01～D08、C01～C07 的九个
  必需用例、上传/回收双向 SHA-256 与后置零残留检查全部通过；ADR-0065 协调器在 commit
  `20b4480ab2ea4f53b3ccee7df39e47755ed92102` 上分级为 `WIN7_PASS`，租约已 `RELEASED`，活跃
  租约为 0。C05 仅证明 loopback 可达，正式企业/网络证据仍为 `ENVIRONMENT_MISSING`。
- 机器可读状态见 [`status/a4-execution-beta-latest.json`](status/a4-execution-beta-latest.json)，
  自动化与补充审计见 [A4 报告索引](reports/README.md)。A1～A3 已接受证据及 A4-14/A4-20/A4-21
  历史原始证据均未改写。

## Win10 原生构建与 A7 产品层进展（更新至 2026-08-20）

三条原生构建返回均已完成适用的结构、哈希、工具链、PE/API/CRT、smoke 和合规材料复核。共享 D-017
Profile 已被实际使用，但下表只说明“可以进入 Win7 集成/验证”，不代表对应 A5/A6/A7 已验收完成。
完整机器可读台账见
[`status/win10-native-builds-latest.json`](status/win10-native-builds-latest.json)。

| 轨道 / 组件 | Win10 结果 | 已解除的卡点 | 当前仍阻塞 |
|---|---|---|---|
| A4 / D-013 helper | v21 Win10 `PASS`：返回包 `5d3bdd6b…f8ef`、helper `98964fc5…ce5`、input-lock `60ddd80c…795b`；capture selftest、v142 logic、native smoke、PE/API/CRT 与开发机 containment 37/37 均 `PASS` | `A4-20260810-000004` 已由 ADR-0065 协调器分级为 `WIN7_PASS`；restricted primary、精确 SID 集合、Low Integrity、ACL rollback、C01～C07、双向哈希和后置零残留均通过，租约已释放 | D-013 已解除；C05 不提供网络隔离，交互终端、高风险和未知 Profile 继续拒绝 |
| A5 / D-011 node-pty + winpty | `PASS_WITH_PACKAGING_GAP`；返回包 `c938f115…46ea`，三项原生工件均为 x64，ABI 110 与 smoke 通过 | Win7 实测裁决为 `NO_GO_INTERACTIVE_WINPTY`；D-013 v24 低风险非交互 Runner 与 H3 只读日志已分别取得正式 `WIN7_PASS` | 交互终端不进入 Win7 v1；返回包内部总清单缺口由 A7 统一发布 manifest/SBOM 收口 |
| A6 / D-014 better-sqlite3 | `PASS`；返回包 `2cb0cd32…2794`，247 项清单全匹配，WAL/FTS5/schema smoke 通过 | D-014 已为 `READY_FOR_WIN7_VALIDATION`，不再缺 SQLite Electron ABI 工件 | 本行只记录 2026-08-07 Win10 构建前置；后续 Win7 正式结果见下文 A6 章节 |
| A7 / 发布包装 | 当前唯一 RC ZIP `39eecb6a…040c9` 已取得开发机、Win10、Win7 三层 PASS；唯一租约 `lease-A7-RC-20260820-055210` 下 RC-01～RC-10 全部通过，协调器评分 `WIN7_PASS` | D-013 v24 与 D-014 按 manifest 在 ASAR 外置装配；RC-04/05/06 产品矩阵、RC-07 升级/故障回滚、RC-08 retain/purge 卸载及 RC-09 零残留/系统不变均在 Win7 实机复核 | `RC_PASS`；交互 winpty、任意 Shell、高风险/未知 Profile 和网络隔离声明仍不包含在 RC 中 |

因此 A4/D-013 v21、A5/D-011 和 A6/D-014 的 Win10 构建前置均已完成；A4/D-013 v21 又已取得
协调器正式 `WIN7_PASS`。结合 A5 v24 非交互 Runner 与 H3 正式证据，SPIKE_02 以
`NO_GO_INTERACTIVE_WINPTY / WIN7_PASS_FOR_LOW_RISK_NONINTERACTIVE_RUNNER` 受限收口，
`A7_GATE=PASS_FOR_WIN7_V1_RC`；不得据此启用交互终端、任意 Shell、高风险 Profile 或强网络隔离声明。

## A6 正式 Win7 本地 SSD 存储验收（2026-08-10）

- A6 `20260810-06` 已获协调器正式 `WIN7_PASS`，唯一正式 Profile 为
  `E22-SQLITE343-LOCAL-SSD`：`dccs-chaizl-PC`、Win7 SP1 x64 build 7601、本地 NTFS Samsung 870 EVO、
  Electron 22.3.27 / ABI 110、better-sqlite3 8.7.0、SQLite 3.43.1、FTS5、WAL。签名租约绑定
  提交 `2a07d6db8d95816e84d7919898d46abfd543a8af` 与包 manifest
  `11500d96a0e0504339ce547bd3f80d76aacb2bb66f439f97f349d94b9fa7ea86`；Mac/Win7 双向哈希、轮前/轮后、
  BvSshServer/SSH 22 和零残留均通过。机器可读的唯一正式状态为
  [`status/a6-storage-latest.json`](status/a6-storage-latest.json)。
- 性能预算 #5～#8 全部达标：S01 60 秒 61650.86 QPS；S03 为 1312.34（3k）、1213.89（10k）、
  1089.52（30k）文件/s；S05 100 次查询 P95 183ms；S06 在 517.79MB 触发、清理后 199.60MB，
  完整性通过。S02、S04、S07、S08、F01～F06、P08/C11-PATH 也均通过。
- 原始返回证据约 1.2GB，位于本地忽略归档
  `A6/WIN7_A6_SSD_EVIDENCE_20260810-06/`；正式状态列出每个返回文件的大小和 SHA-256。历史 SSD
  evidence 与 disposition 保持不变。此结论只覆盖本地 SSD，不推断 HDD、网络盘或未知介质性能，
  也不表示生产 EventStore 或索引服务已实现。

## A5 非交互 Runner v24 构建收口（2026-08-11）

- D-013 v24 返回包 `WIN7_D013_HELPER_ARTIFACTS_20260811-105127.zip` 已独立复核为
  `BUILD PASS / candidate_eligible=true / REVIEW PASS`；外层 SHA-256 为
  `5a65a023e33addc7b06bca6956443df8dc2e3bfab67649ac6d8c3ff4472d667c`，helper SHA-256 为
  `7f86dac89862b2c61d55fe83ba00bf7cdaa69714d24d0f9d21b62f9040d1c134`。
- 返回包绑定源码提交 `78113f49db6ec94f803ae38518c42eaa740448ba` 和锁定的
  Win10/VS2019/v142/SDK 10.0.19041/x64/static CRT Profile；内部 24 项清单、logic tests、
  PE/API/CRT、严格 UTF-8 捕获、普通执行和合作取消 smoke 全部通过。取消 smoke 证明 helper
  在返回 `canceled=true` 前完成 Job 回收和 Low Integrity 的精确 SDDL 回滚。
- v23 首轮 Win7 L08 的 ACL 残留记录仍保留且该候选仍为拒绝状态。V24 已在
  `D013-RUNNER-20260811-020000`、目标 `192.168.1.11` 和新 ADR-0065 签名租约下完成 L01～L10，
  10 项全部 PASS；轮后 helper/ping 与 Low Integrity 残留均为零，工件哈希匹配，Bitvise 保持
  `RUNNING`。协调器评级为 `WIN7_PASS`，生命周期已 `RELEASED` 且无活动租约。
- A5 的生产非交互 Runner containment 核心卡点因此正式解除，结论为
  `CONTAINMENT_READY_FOR_LOW_RISK_NONINTERACTIVE_RUNNER`。交互式 winpty 继续 No-Go，任意 Shell、
  高风险本地命令与未登记 Profile 继续拒绝。
- H3 r2 已在 Win7 普通交互式桌面会话完成只读日志与取消验收：STDOUT/STDERR 分栏、滚动、
  358-byte 截断提示、`task.cancelling → runner.finished(cancelled) → task.cancelled` 反馈均通过，
  界面不存在终端输入能力。最终 postflight 为 `residues=[]`、无 Low Integrity 标签残留、Bitvise
  `RUNNING` 且 H3 工件哈希匹配。首包的标签回滚 `ACCESS_DENIED` 失败及干净恢复证据继续保留；
  ADR-0072 明确只读 profile 不修改工作目录 Integrity Label，child token 仍保持 Low Integrity。
- A5 非交互 Runner + 只读日志整合任务现为 `COMPLETE`，结论为
  `H3_READONLY_STREAMING_LOG_UI_PASS / CONTAINMENT_READY_FOR_LOW_RISK_NONINTERACTIVE_RUNNER`。

## A4/A5/A6 整合收口与 A7 Gate（2026-08-12）

- A4 `eee6219`、A5 `af589dc`、A6 `fb2084d` 已进入 `codex/integrated-robustness` 祖先链，
  收口提交 `793cc47` 又已成为当前 main `ec9d27a` 的祖先；main 与 `origin/main` 同步，本次状态
  更新开始前工作树干净。
  A6 继续使用规范 ADR-0066；A5 分支本地 ADR-0066～0071 以规范 ADR-0067～0072 导入，原始
  Win7 证据字节未重写。
- SPIKE_02 正式受限结论为 `NO_GO_INTERACTIVE_WINPTY` 与
  `WIN7_PASS_FOR_LOW_RISK_NONINTERACTIVE_RUNNER`；SPIKE_04 保持 `WIN7_PASS`，因此
  `A7_GATE=PASS_FOR_WIN7_V1_RC`。Renderer 终端输入、网络隔离、任意 Shell、高风险和未知 Profile
  均未开放。
- 中央只读归档为 `/Users/qlyf/Developer/win7-agent-artifacts/closeout-20260812/`，共 205 个文件、
  1,469,654,891 字节；`CLOSEOUT_MANIFEST.json` SHA-256 为
  `df4aa1957eb6c12a4311138424702fe92ba4d1da6a96a11734e5bda9a0327cea`。中央副本与原路径/符号链接
  的逐文件大小及 SHA-256 均一致。
- A4、A6、A5 worktree 已按顺序且不带 `--force` 移除，分支引用保留，原绝对工件路径通过只读
  符号链接继续可访问。机器可读单一事实来源为
  [`integration-closeout-latest.json`](status/integration-closeout-latest.json)。A7 已从该唯一基线启动；
  后续开发进展不会改写本次 A4/A5/A6 收口证据。

## A7 RC-04 产品装配与 Windows smoke（更新至 2026-08-13）

- 提交 `f24d9a42a915dcab9eecb1e61d0870ac11a84555` 已建立 manifest 绑定的产品 composition root：
  Electron 创建 Renderer 前逐文件校验并装配 D-013 v24 低风险 `whoami` Runner 与 D-014
  `better-sqlite3 8.7.0 / SQLite 3.43.1 / ABI 110` 状态层；交互终端、任意 Shell、网络盘和 HDD
  性能声明继续显式关闭。
- 状态层已接入 schema v1 的 SQLite V2 EventLedger，覆盖 WAL/FTS5/Profile 检查、原子批次、事件
  指纹、线程序列、容量上限、启动恢复扫描和关闭 checkpoint。当前持久化的是审计事件事实；完整
  session catalog 仍为进程内状态，不宣称重启后的完整会话恢复。
- 开发机 `npm run verify` 通过 7 个模块共 981 项测试，release/RC 合同 19/19 通过。由同一干净提交
  和锁定输入连续两次生成的 ZIP 字节一致：731 个 manifest 文件、100,877,883 字节、SHA-256
  `909166478a8766ed380221d7b349e4db841651516be42feba7db281e0678f1d5`；独立逐文件校验通过。
- 锁定候选已在 Windows x64 上完成两轮真实产品入口 smoke：Electron 22.3.27、Renderer/诊断、
  安全基线、D-013 `win7-whoami` Runner composition、D-014 SQLite 3.43.1/WAL composition
  全部通过，两轮退出码均为 0；状态库为 49,152 字节，关闭后无 `-wal`/`-shm` 残留。返回 summary
  与两轮原始 JSON 的 SHA-256 已在开发机复算，并与候选 release manifest 及 8 个关键产品文件
  逐项绑定。只读原始归档位于
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc04-windows-smoke-20260813/`。
- RC-04 限定结论为 `PASS`；在 RC-05/RC-06 工具包形成前，阶段状态曾为
  `RC04_WINDOWS_PRODUCT_SMOKE_PASS_RC0506_PENDING`。Win10 仍仅为 `PARTIAL_RC04_SMOKE_ONLY`；
  RC-05/RC-06、完整 Win10 门禁、新 Win7 租约与 RC 总体结论均未完成。
  返回报告中“State remains in-memory”是与同报告 SQLite/WAL 和数据库事实矛盾的遗留 MVP 注释，
  已记录为非阻断文案不一致且原始字节保持不变。机器可读记录见
  [`a7-rc-development-latest.json`](status/a7-rc-development-latest.json) 和
  [`a7-rc04-windows-smoke-latest.json`](status/a7-rc04-windows-smoke-latest.json)。
- RC0506 首轮 Windows 返回按 fail-closed 裁决：RC05-P02 失败，RC-06 虽报告 7/7，但由于执行前加载
  未受 KIT manifest 约束的外部 `noasar.js`，且未返回生产测试库，不能进入正式 PASS。首轮 5 个原始
  返回物已按字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-windows-attempt1-20260813/`。
- 不改动产品候选的 v2 验证包已由提交 `46ccd90` 修复：ASAR 模式由 manifest 绑定 harness 内部设置，
  禁止 `NODE_OPTIONS`/外部 preload；P02 改用实时哈希绑定的回环 `ping.exe`；失败总是生成 summary、
  fatal 且退出码为 1；返回的生产/篡改数据库由独立验证器复算。两次确定性构建均得到 12,294 字节、
  SHA-256 `3aaaa718efe68ba45e1b510cab707d147f42230a8b9fd692df014a891f108a8a`。当前状态为
  `RC04_PASS_RC0506_ATTEMPT1_FAIL_CLOSED_V2_READY`；v2 的 RC-05/RC-06 仍未执行，Win7 与 RC 均为
  `NOT_PERFORMED`。机器可读记录见
  [`a7-rc0506-validation-kit-latest.json`](status/a7-rc0506-validation-kit-latest.json)。
- v2 随后在普通 Win10 CMD 完成执行并保持 fail-closed：RC-06 的 7 项、生产数据库 `quick_check`、
  2 条连续事件、FTS 与零 WAL/SHM 残留已独立复核为 `PASS`；RC-05 的 P02 因回环 `ping.exe`
  返回 exit 1 而失败。该轮还暴露一个真实 C11 缺陷：CP936 head/tail 截断文本出现替换字符，
  但旧实现错误记录 `replacement_count=0`。返回报告写出的进程退出码 0 又与 harness 的
  `process.exit(1)` 合同冲突，因此 RC-05 与组合门禁均保持 `FAIL_CLOSED`。
- 2026-08-14 的 v3 源码修复已就绪：Runner 对截断 head/tail 分别做多字节边界对齐；RC-05
  改用 KIT manifest 绑定的本地固定字节探针，通过候选自身哈希绑定的 `electron.exe` 执行，
  不访问网络；`RUN_RC0506.cmd` 会记录并原样返回真实子进程退出码。提交 `963eabe` 已两次
  确定性重建出相同的新产品 ZIP，SHA-256 为 `39eecb6a…040c9`，包内 Runner 修复与源构建哈希
  一致。旧候选 `90916647…f1d5` 已移入只读归档；它的 RC-04/RC-06 PASS 不自动继承给新候选。
  v3 KIT 已由提交 `f47fd84` 两次确定性生成相同的 13,502 字节 ZIP，SHA-256 为
  `9cbe6be7…72b1e`，6 个 ZIP 文件和 5 个 manifest payload 全部独立复核。新候选与 KIT 已归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-v3-ready-20260814/`；当前仍需在普通 Win10
  CMD 对新候选重跑 RC-04/05/06，故不得提前声明新的 Win10 PASS。
- 2026-08-16 v3 Windows 轮已在 Win10 专业版 19045 x64（本地 NTFS SSD）完成并按 fail-closed 裁决：
  RC-04 两轮各 3/3 PASS、退出码 0、无 WAL/SHM 与进程残留；RC-06 全 7 项 PASS，生产库与篡改库
  均已返回并独立哈希绑定（`quick_check=ok`）；RC-05 的 P02/C01 因
  `CONTAINMENT_UNAVAILABLE` 失败——v3 harness 以候选 `electron.exe` 注册
  `rc05-harness-local-probe`，而 D-013 原生 helper 的 C06 allow-list（真实 System32 直属
  8 个工具）在创建 Job 前拒绝该可执行文件。helper 的拒绝本身是正确的 fail-closed 行为，
  定性为 v3 验证设计与原生安全边界不兼容，不是环境噪音。本轮 `RUN_RC0506.cmd` 真实退出码为 1，
  退出码合同首次得到履行。返回包 `return-to-dev-20260816.zip`（22,204 字节，SHA-256
  `5e02a7e5…a6a0e`）15/15 manifest 项复核一致，已按字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-windows-attempt3-v3-20260816/`。
  当前分层结论：`RC04=Windows PASS / RC05=FAIL_CLOSED / RC06=Windows PASS / WIN10=NOT_PASS /
  WIN7=NOT_PERFORMED / RC=NOT_PERFORMED`。
- v4 修复已完成并通过两次确定性构建，且不扩大产品 helper allow-list：RC-05 探针改用 helper 已允许的
  System32 `findstr.exe` 读取 harness 内生成的确定性 GBK fixture（215 字节，SHA-256
  `f1e8bf35…7da9`，正例含中文解码、截断用例压 128 字节上限验证多字节边界对齐），取消用例改用
  仅 127.0.0.1 的 System32 `ping.exe`；harness 内置 C06 allow-list 镜像并对全部 harness profile
  做执行前预检，新增 fixture 确定性与 allow-list 相容性（含 v3 electron.exe 回归负例）合同测试，
  release 合同测试由 19 项增至 22 项（RC0506 合同 9→12），全量 `npm run verify` 7 模块通过。
  产品候选字节不变（继续锁定 `39eecb6a…040c9`）。v4 KIT
  `RC0506_WINDOWS_VALIDATION_KIT_20260816-v4.zip`（14,239 字节，SHA-256 `ff5a26ef…c6d5`，
  绑定提交 `ef1486e`）两次构建字节一致，内含 README 候选哈希已修正为当前候选；已归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-v4-ready-20260816/kit/`。下一步是在普通
  Win10 CMD 以新 KIT 重跑 RC-05/RC-06（RC-04 可按同候选既有两轮 PASS 引用），通过后才可准备
  完整 Win10 分层门禁与新的 A7 RC Win7 签名租约。
- 2026-08-16 22:32 v4 Windows 轮已在同一 Win10 19045 x64 主机完成并通过：RC-05 六项中五项
  PASS、RC05-P01 按预期以 `NOT_APPLICABLE_TARGET_PROFILE_HASH` 延期（Win10 whoami 字节与
  Win7 目标 pin 不同），总评 `PASS_WITH_WIN7_TARGET_PROFILE_DEFERRED`；RC-06 全 7 项再次
  PASS，返回数据库哈希与 v3 轮完全一致（`0070c116…9640`/`81870940…a2e`，确定性成立）。
  findstr fixture 探针实测：正例 215 字节 CP936 解码零替换字符；128 字节上限下保留
  127 字节、省略 88 字节且零替换（与开发机预测的 head 63 + tail 64 一致）；取消用例
  `ping 127.0.0.1` 以 `job_object` contain 回收，`child_job_assignment_verified` 与
  `acl_rollback_verified` 均为真。fixture SHA-256 与 harness 记录常量
  `f1e8bf35…7da9` 一致。`RUN_RC0506.cmd` 真实退出码 0（PASS 合同履行）；前后
  electron/helper 进程均为 0。开发机 `verify-rc0506-evidence.mjs` 独立复核 PASS，
  返回包 10/10 manifest 项一致（17,718 字节，SHA-256 `9c3d5bae…080d`），已按字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0506-windows-attempt4-v4-20260816/`。
  当前分层结论：**当前候选 `39eecb6a…040c9` 的 RC-04/RC-05/RC-06 Windows 证据齐备**；
  剩余门禁为 RC-07 升级/回滚、RC-08 卸载/零残留、最终 Win10 层的 RC-03 精确 PE/API/CRT
  总门禁，以及新的 A7 RC Win7 签名租约下的完整 RC-01～10 实机矩阵。Win7 与 RC 总体仍为
  `NOT_PERFORMED`，不得提前声明。
- 2026-08-16 深夜，RC-07/RC-08 生命周期工具 v1 已实现并两次确定性构建（提交 `e10b2a1`）：
  `RC0708_WINDOWS_LIFECYCLE_KIT_20260816-v1.zip`（18,407 字节，SHA-256 `0103998b…f1ff`，8 个
  ZIP 文件）。升级侧实现旁路 staging、严格 release-manifest 全树等值校验、由 cmd 包装器在
  harness 阶段间执行的同卷目录改名激活（阶段退出码合同 0/1/42/43）、注入式暂存文件损坏
  （激活前检出）与激活后损坏（字节级一致回滚、无混合版本）三场景，以及用户数据快照不变
  与残留审计；卸载侧实现隔离区托管卸载、`version` 文件锁探针（harness 宿主 electron.exe
  自身不可改名）、显式 retain/purge 数据保留策略与 transcript 证明的隔离区清除。产品候选
  字节不变；升级源使用上一代 `f24d9a4` 候选 ZIP（`90916647…f1d5`，只读归档）以证明真实
  版本前进。合同测试扩至 31 项（RC0708 9 项，含真实候选 ZIP 嵌套布局验证、CJK/空格路径、
  wrapper 合同与验证器正负例），全量 `npm run verify` 7 模块通过。KIT 已归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-lifecycle-kit-v1-20260816/`；
  机器可读记录见 [`a7-rc0708-lifecycle-kit-latest.json`](status/a7-rc0708-lifecycle-kit-latest.json)。
  RC-07/RC-08 的 Windows 执行仍为 `NOT_PERFORMED`，按 README 三轮升级 + 两轮卸载执行并通过
  `verify-rc0708-evidence.mjs` 独立复核后方可计入 Win10 分层门禁。
- 2026-08-18，RC-07/RC-08 的 Win10 交付已打包为**单一交付 ZIP**
  `RC0708_WIN10_DELIVERY_20260816.zip`（201,260,387 字节，SHA-256 `9b49b6a1…f008ef2`，
  两次确定性构建字节一致），内装：锁定新候选 `Win7CodingAgent-0.1.0-rc.1-win7-x64.zip`
  （`39eecb6a…040c9`，文件名保持原样——harness stage 绑定 basename）、上一代候选改名字节副本
  `…-PREVIOUS-f24d9a4.zip`（`90916647…f1d5`，与锁定旧版哈希一致，作为升级源避免同名冲突）、
  生命周期 KIT `RC0708_WINDOWS_LIFECYCLE_KIT_20260816-v1.zip`（`0103998b…f1ff`）、
  内嵌 SHA-256 清单 `RC0708_WIN10_DELIVERY_SHA256.txt` 与操作提示词
  `RC0708_WIN10_OPERATION_PROMPT.txt`（UTF-8 无 BOM/LF）。提示词规定 Win10 侧按
  哈希核对 → 目录布局（产品目录外解压 KIT）→ 五轮执行（success / corrupt-staged-file /
  activation-corruption 三轮升级 + retain / purge 两轮卸载，共用单一 evidence 根）→
  原样返回全部证据；交付包与提示词已只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-win10-delivery-20260816/`，
  机器可读记录见 [`a7-rc0708-lifecycle-kit-latest.json`](status/a7-rc0708-lifecycle-kit-latest.json)。
  RC-07/RC-08 的 Windows 执行仍为 `NOT_PERFORMED`。
- 2026-08-19，v1 返回包 `return-to-dev-20260819.zip`（14,725 字节，SHA-256
  `22134211…780e`）虽报告三轮 RC-07 与两轮 RC-08 均 PASS，但报告同时确认执行前在 KIT 目录新增
  CJS 别名、注入 `process.noAsar`、修改两个 manifest 绑定的 CMD，并新增串联 CMD；其中“CMD 不在
  KIT_MANIFEST”的说法与 v1 清单事实冲突。因此该轮正式裁决为
  `FAIL_CLOSED_KIT_MUTATED_EVIDENCE_INELIGIBLE`，对 RC-07/08 与 Win10 Gate **无推进效力**。原返回包
  与 21 个展开文件已逐字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-windows-attempt1-v1-20260819/`，不改写原始证据。
- 同日已从干净提交 `5eb2b29` 生成不可现场修补的 v2 KIT：统一 lower-hyphen 模块名、最早设置
  `process.noAsar`、把 ASCII/CRLF CMD 的准确字节纳入 manifest，并在每个阶段强制复核
  KIT_MANIFEST、精确入口哈希及额外控制文件；五份报告必须携带 `kit_provenance`，开发机验证器还须
  以 `--kit` 绑定同一 ZIP。KIT `RC0708_WINDOWS_LIFECYCLE_KIT_20260819-v2.zip`（20,952 字节，
  SHA-256 `0c3be032…55d2`，manifest SHA-256 `929c3a18…9e17`）及提交 `2f4bccf` 生成的单一交付包
  `RC0708_WIN10_DELIVERY_20260819-v2.zip`（201,263,145 字节，SHA-256 `f7ced50b…61137`）均连续
  构建两次且逐字节一致，已分别只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-lifecycle-kit-v2-20260819/` 与
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-win10-delivery-v2-20260819/`。开发机全量
  `npm run verify` 983 项通过，RC0708 合同 12 项通过；v2 Windows 五轮仍为 `NOT_PERFORMED`，
  当前 Win10 总门禁继续等待 RC-03、RC-07、RC-08，Win7/RC 仍为 `NOT_PERFORMED`。
- 2026-08-19 01:14，v2 Windows attempt 2 返回包
  `RC0708_V2_WINDOWS_RETURN_20260819-011417.zip`（17,794 字节，SHA-256 `00464f63…7ba8`）与
  sidecar 本地复核一致，ZIP 20 个证据文件完整；开发机以精确 KIT `0c3be032…55d2` 执行
  `verify-rc0708-evidence.mjs --kit` 独立复核 PASS。RC-07 success、staged corruption、activation
  corruption 三轮及 RC-08 retain/purge 两轮均 status PASS、exit code 0；五份 provenance 精确绑定
  manifest `929c3a18…9e17`，`unexpected_control_files=[]`，无生命周期或进程残留。返回包和报告已
  逐字节只读归档至
  `/Users/qlyf/Developer/win7-agent-artifacts/a7/rc0708-windows-attempt2-v2-20260819/`。报告中的
  “未用包装脚本”按证据解释为“未用额外或修改后的包装脚本”；正式 manifest 绑定的
  `RUN_RC0708_*.cmd` 执行由报告与 transcript 共同证明，不构成阻断。
- RC-03 同日按精确字节连续性收口：唯一 RC ZIP 内仅有两个 ASAR 外置原生文件；helper
  `7f86dac8…c134` 与 D-013 v24 Win10 返回包逐字节一致（x64、静态 CRT、forbidden API/动态 CRT
  扫描和 smoke PASS），`better_sqlite3.node` `7138aa23…15cc` 与 D-014 Win10 返回包逐字节一致
  （x64、Electron ABI 110、forbidden API/动态 CRT、WAL/FTS5 PASS），且 RC-06 已在当前候选真实
  加载。该段形成 2026-08-19 的 **`WIN10_PASS`** 分层结论；2026-08-20 的 Win7/RC 正式结果见
  下节，不再沿用当时的 `NOT_PERFORMED`。Win10 机器可读收口见
  [`a7-win10-rc-closeout-latest.json`](status/a7-win10-rc-closeout-latest.json)。

## A7 Win7 RC-01～RC-10 正式验收（2026-08-20）

- 唯一候选 ZIP `39eecb6a…040c9` 在 `dccs-chaizl-PC`（Win7 SP1 x64 build 7601，
  本地 NTFS Samsung SSD 870 EVO 1TB）完成完整 RC-01～RC-10。正式租约
  `lease-A7-RC-20260820-055210` 使用 Ed25519，绑定候选提交 `963eabe…d56c`、发布 manifest
  `ff1a46ff…32d0`、RC0506-v4、RC0708-v2、Win7 内置 Shell 提取脚本、目标身份和全部 required cases。
- RC-04 两轮产品启动、RC-05 Runner、RC-06 WAL/FTS5/恢复/中文空格路径/上限/损坏与网络盘拒绝、
  RC-07 三轮升级/故障回滚、RC-08 retain/purge 两轮卸载均通过；RC0708 独立 exact-kit verifier
  对五份报告复核 PASS。
- RC06-v4 原始子报告保留 `RC06-M01` FAIL：它错误调用 Win7 PowerShell 2.0 不存在的现代 Storage
  cmdlet。其余六项均 PASS；协调器以未改写的 `Win32_DiskDrive` UTF-16 原始证据确认系统盘型号
  含 `SSD 870 EVO 1TB`，补足物理 SSD 条件后裁决 RC-06 PASS。该补充不把原始子报告伪装成 PASS。
- 轮前轮后 `BvSshServer=RUNNING`、SSH 22 可用、相关进程零残留；启动时间、Bitvise 配置、路由、
  防火墙和机器 PATH 均字节一致。64 项回收证据 manifest SHA-256 为
  `045dd72f16963c6033403eb71260c0a622ab12b43cd2461ab82a12133ac89270`；协调器评分 `WIN7_PASS`，
  租约已 `RELEASED`，活跃租约为 0。因此 A7 正式状态为 **`RC_PASS`**。
- 首次租约 `lease-A7-RC-20260820-054316` 因验收用 7za 与 Win7 不兼容，在 RC-01 前 fail-closed，
  经干净 postflight 后释放且未评分，门禁影响为 NONE。机器可读事实来源为
  [`a7-win7-rc-acceptance-latest.json`](status/a7-win7-rc-acceptance-latest.json)。
- A7 已以非快进方式进入 main `bd43c63`，且该提交已与 `origin/main` 一致。双层注释标签
  `artifact-source/win7-v0.1.0-rc.1` 绑定实际构建源 `963eabe`，
  `acceptance/win7-v0.1.0-rc.1` 绑定验收收口 `bd43c63`，两者均已推送远端。
- RC 长期只读归档为 `/Users/qlyf/Developer/win7-agent-artifacts/releases/win7-v0.1.0-rc.1/`：
  139 项、309,627,153 字节，`CLOSEOUT_MANIFEST.json` SHA-256 为
  `ec67c340d5df7ea113dd99457fef9074842ee3dd4ea6f8755b87e2657e364b95`。逐文件大小/SHA-256、
  清单 sidecar、候选 ZIP、发布 manifest、SBOM、许可证、最终 Win10 与 Win7 证据均已复核，
  且不含私钥、凭据、缓存或历史失败尝试的重复副本。

## A8-06 候选修复记录（2026-08-21）

### A8-06 独立复核修复（2026-08-21）

- 独立复核确认首版 A8K-04 的 Windows 入口不可正式使用：普通 Node 16.17.1 不能加载 Electron ABI 110
  的 D-014 binding；A8-03/A8-04 报告不满足声明的统一字段，三份报告没有共同绑定候选 manifest；报告路径
  还会向候选目录写入未纳入 manifest 的文件。上述属于开发机可修缺陷，不是外部环境不可用。
- ADR-0085 修复已实现：A8-05 由结构化 Node 包装器启动包内 `electron.exe` Node-mode；三份报告升级为
  evidence schema v2、逐文件复算完整 manifest、记录相同 `candidate_manifest_sha256`、验证目标 ABI/操作者，
  并仅写入候选兄弟 evidence 目录；evidence-set verifier 联合检查 required cases 和同一候选。
- `source_dirty: true` 的开发包现明确为 `external_acceptance_eligible: false`，正式 Win10/Win7 工具在启动
  产品前拒绝。ADR-0086 同时把需要回填最终哈希的 current status/构建后报告移出不可变候选。修复已在
  干净提交 `7ccaed6b98e4ebb9f77d993d22c3ed136bdeb8c0` 上无 `--allow-uncommitted` 重建两次，结果字节一致：
  ZIP `d1e8dbbe5e9a09e8d50fc1411c11e48de6d0bb734d7bce1d957bb42d3f45aef9`，manifest
  `85c874843947478307515de4a56391fc7cbee2689fbffb5b7af8508e3873087c`，`source_dirty: false`、
  `external_acceptance_eligible: true`。A8-06 状态已重新签发为 `A8_DEVELOPER_COMPLETE_VALIDATION_READY`；
  Win10、Win7 和 RC 继续保持 `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE` / `NOT_PERFORMED`，A7 PASS 不继承。
- 后续独立 Agent 审查的五项结论已逐条复核：ABI wrapper、辅助模块、候选外证据路径和 clean candidate
  均已关闭；新增打包测试扫描 `validation/*.mjs` 的全部相对依赖。旧 Electron 41 schema v1 报告保留为
  不可用于正式评分的历史 surrogate，未伪造 manifest 绑定；A8-03/A8-04 source kit 已明确由 A8-06 schema v2
  正式命令取代。机器可读复核见 [`a8-06-independent-review-followup-20260821.json`](status/a8-06-independent-review-followup-20260821.json)。

### A8-06 消除外部 Node.exe 假设（ADR-0087，2026-08-21）

- 验证套件全面改用包内 Electron 22.3.27 的 Node 模式（`set ELECTRON_RUN_AS_NODE=1&& .\electron.exe`）
  作为脚本宿主，彻底消除外部 `node.exe` 假设；`preflight` 移除 `where node` 检查，改为探测
  包内 `electron.exe -v` 并校验工件哈希。
- A8-03/A8-04 在拉起真实 Electron GUI 测试窗口前净化子进程环境变量（清除 `ELECTRON_RUN_AS_NODE`）。
- 增补了“无系统 Node 仍可执行验证套件”的自动化合同测试（`scripts/release/test/a8-package.test.mjs`）。
- 修复已从远端可达的干净提交 `03c4d6e20b58a7897c9e1c6427143f75bef98a57` 重建两次，结果字节一致：
  ZIP SHA-256 `5b24fe7ead243569e12c38c947aa31c1a04091bdea1eba3e8bd4b0bb3966ae6e`，manifest SHA-256
  `8def5b3f8e3421009cf8b079fb87eaf61896ce36f82bfcefff9c8f2a60a993a7`，`source_dirty: false`、
  `external_acceptance_eligible: true`。
- 该候选取代 source commit 不在分支历史中的 `3d8f1b3…` 候选；新证据使用普通追加提交，不 amend
  `03c4d6e`。开发机 schema v2 smoke 10/10 PASS 且候选未改变，追踪见
  [`a8-06-candidate-provenance-reissue-20260821.json`](status/a8-06-candidate-provenance-reissue-20260821.json)。

### A8-06 Win10 ASAR 物理文件校验修复（ADR-0088，2026-08-21）

- Win10 19045 x64/NTFS/NVMe 现场已通过旧候选 ZIP、manifest、Electron 22.3.27 和
  `better_sqlite3.node` 哈希预检；A8-03 随后误报物理 `resources/default_app.asar` 缺失并按规则停止。
- 独立 `certutil` 复算确认该文件大小 109138、SHA-256 `db1bfd…724f4` 与 manifest 相同。根因是包内
  Electron Node-mode 的普通 `node:fs` 对 `.asar` 启用虚拟目录视图，不是候选字节损坏。
- 验证器现显式使用 Electron 内建 `original-fs` 复算候选物理树，接口不可用时结构化 fail-closed；新增
  `.asar` manifest fixture、Electron 接口选择/缺失拒绝与打包闭包测试。修复记录见
  [`a8-06-win10-asar-field-failure-20260821.json`](status/a8-06-win10-asar-field-failure-20260821.json)。
- 旧 ZIP `5b24fe7e…ae6e` 保持 Win10 A8-03 FAIL，A8-04/A8-05/联合验证为 NOT_RUN，不得用手工哈希改写为
  PASS。修复提交 `fc4e0deea9a0cfcd86037ebbbbd2bc40a4f74ff9` 已推送且从远端分支可达；干净工作区
  两次构建字节一致，新 ZIP SHA-256 `4ab0c2ce…12ad6`、manifest SHA-256 `0ab06b5c…503ea`。
- 新候选的 schema v2 开发机 smoke 10/10 PASS，执行前后 ZIP/manifest 未改变；机器可读重新签发见
  [`a8-06-asar-candidate-reissue-20260821.json`](status/a8-06-asar-candidate-reissue-20260821.json)。新候选
  Win10/Win7/RC 仍为 NOT_PERFORMED，下一步须全新解压并从 A8-03 重新执行。

## 文档治理（2026-09-24）

- 2026-09-24 09:55（+08:00），[PR #8](https://github.com/allin2/win7-coding-Agent/pull/8)
  “A9-16 WIN7-36 UI subset: candidate and physical acceptance” 将 `codex/a9-alpha2` 合并入 `main`，合并提交
  `8fd9d5d707005918e5ad5f0fae4fc100bb481131`，内容与 `f348761` 一致。相对原 main `72dfe22` 带入 34 个非合并提交：
  A9-15（WIN7-23～28）、A9-16 UI 子集（WIN7-29～36）及 A9-17 启动/内存实现（`3437bc1`）。合并不改变任何候选、
  authority 或实机证据；A7 仍为唯一 RC，完整 Alpha 2 未获 PASS。本节以下文档治理提交均在合并之后。
- 2026-09-24，文档整理 P0/P1 完成：修复 A9-17 临时路径断链、补齐报告索引（`17761ab`）；`STATUS.md`
  拆为当前快照与本流水、新增 ADR 与方案索引（`adad4d3`）；ADR-0134 接受，`AGENTS.md`/`CLAUDE.md`
  不再写死当前任务（`f634044`）。
- 2026-09-24，[DOCS_02](tasks/DOCS_02_DOC_CHECK_IGNORED_PATHS.md) 经负责人批准并完成：`docs:check`
  改按 `git ls-files` 枚举，跳过被忽略路径，`outputs/**` 73 处噪声失败消除，当前 `ok=true`
  （137 个文档）；新增 `scripts/test_check_docs.mjs` 7/7 PASS，负向对照确认旧实现失败。开发机工具，
  不进入 Win7 候选，`Win7-Validation: N/A`。
- 2026-09-24，[DOCS_03](tasks/DOCS_03_A9_16_PROBE_GATE_EVIDENCE_ISOLATION.md) 经负责人批准并完成：A9-16 几何探针闸门
  默认输出移至系统临时目录，拒绝写入仓库内未忽略路径，summary 记录被测源码身份（当前与 `f0e80ec` 一致）
  与归档漂移（仅报告）；开发机实跑 PASS 且归档证据哈希不变，自测 4/4 PASS，负向对照确认旧闸门会改写
  归档证据，工作台契约 32/32 PASS。开发机工具，`Win7-Validation: N/A`。
- 2026-09-24，[DOCS_04](tasks/DOCS_04_DOC_LINK_TARGETS_TRACKED.md) 经负责人批准并完成：`docs:check` 要求本地链接
  目标属于仓库（已跟踪或未跟踪未忽略），并拒绝仓库外目标与大小写不一致的链接；现有 503 个本地链接零命中，
  测试 12/12 PASS，负向对照确认旧实现放行三类链接，耗时无变化。开发机工具，`Win7-Validation: N/A`。
- 2026-09-24 16:50（+08:00），[PR #9](https://github.com/allin2/win7-coding-Agent/pull/9)
  “docs: 2026-09-24 documentation governance (STATUS split, ADR-0134, DOCS_02-04)” 将本节文档治理提交
  `17761ab`～`2aeb672`（11 个）合并入 `main`，合并提交 `ea24c0d5c94d9748812db86184bc648fe9e7a8c6`。不涉及产品代码、
  候选、authority 或 Win7 证据。

## A9-19 运行过程实时可见与布局二期（2026-09-24）

- 2026-09-24，负责人反馈运行中的工具调用与中间状态要到最终结果才出现，并要求优化布局；核查定位主因为渲染端
  运行中轮次（持久化为 `active`）绑定缺陷，另有模型 chunk 压到轮次结束、同步全树哈希独占主进程、等待提示需空闲 10 s。
  负责人批准 [A9-19](tasks/A9_19_LIVE_PROGRESS_AND_WORKBENCH_LAYOUT.md) 与 ADR-0135 并授权修订需求。
- 同日开发机实现完成（`A9_19_DEVELOPER_VERIFIED`）：运行中过程与模型输出预览实时可见，对话行显示标题，界面中文化，
  1079×540 下运行中对话区 60.5%（旧 43.7%）。扫描独占 550 ms → 27 ms，残留 checkpoint 往返校验约 0.4 s。Shell 375、
  workspace 211、`verify:quick` 通过；证据为无头 Chrome，未运行 Electron 22、Win10 或 Win7。

- 2026-09-24 22:30，A9-19 Win7 **探索性运行（非验收）**：`192.168.1.3` 上以 `agent` 普通用户、WIN7-36 冻结包叠加 A9-19 的
  5 个文件跑一轮真实 Provider 任务。运行中工具卡、已运行时长与模型输出预览均在落盘后 ≤1.1 s 出现在界面；新发现切换对话/工作区会收起
  桌面左栏（A9-19 前已存在）。不签发任何 PASS，详见 A9-19 任务书 §12。

- 2026-09-25，负责人批准 WIN7-37 换发合同（ADR-0136）；管线提交 `dd6cb1a`，双独立干净构建 ZIP 逐字节一致
  （SHA-256 `4d70063254212ca581b7b3dac9f89edc81a2ba31a53b51a6b1c1d65667f167cf`，manifest `bad63b4ce9f881d42bfd4426ccd5bdae58916ea7c284b5c1bbc8cc17e08ea27c`），`source_dirty=false`、`external_acceptance_eligible=true`，冻结于 `.acceptance/candidates/WIN7-37/`。
  开发机预检通过；待负责人签发候选外 `WIN7_37_RELEASE_AUTHORITY`，Win7 G1/G2/G3 均 `NOT_PERFORMED`。

- 2026-09-25，负责人按精确哈希批准 WIN7-37 并指定目标 `192.168.1.3`；候选外 authority SHA-256 `0d8d4f9456f42da4692fea7d27c03edcd4f91df3ba6985b623233e095a9d0616`（run-id `85476889-099d-46b6-b8a4-666e8e0b5d77`），
  冻结候选自带校验器接受。交接书转为 `READY_FOR_EXECUTION`，Win7 G1/G2/G3 仍 `NOT_PERFORMED`。

- 2026-09-25，WIN7-37 外部执行完成（run `85476889-…`）。审核方复核：身份、权限、完整性、G2 95/95 与 A9-19 实时性/左栏/文案用例通过；
  W37-05/06/11～15/18 证据不足。审核建议暂不签发，补跑 G3 UI 用例；待负责人裁决。

- 2026-09-25，负责人接受建议，按交接书附录 A 补跑 G3（S1–S7，审核方钉住哈希的探针）。审核：W37-05、06、12、13、14、18 证据充分；
  W37-11 A03 与 W37-15 A02 因测量探针在持久化任务行写入前采样而缺证（审核方探针缺陷，非产品失败）。随后按附录 B 补跑 S1b：
  最坏形态“进行中1 / 更早8 / 归档1”下完整可见 5 行，断言全部为 true。
- 2026-09-25，负责人沿用 WIN7-36 可达响应式等效口径。正式报告组装完成（21/21 PASS，附等效裁决）；开发机预检，冻结候选自带校验器返回 PASS。
  待按附录 C 在 Win7 上以 `agent` 执行报告校验后再签发 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`。

- 2026-09-25，执行方按附录 C 在 Win7 上以 `agent` 完成正式报告校验：`REPORT_VERIFY_EXIT=0`，`PASS / A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS / 21`，
  审核方独立复核通过。负责人确认签发 WIN7-37 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`（可达响应式状态等效口径；≤799px 不可达/未验证），
  A9-19 Phase-Gate 改为 `A9_19_WIN7_37_LIVE_PROGRESS_AND_LAYOUT_PASS_EQUIVALENCE`；不构成 Alpha 2 或 RC PASS。

- 2026-09-25，A9-17/A9-18 状态核查发现：Git 外部写确认分类器在 `c8691e3` 上对 `cmd /c"git push …"`、PowerShell 参数前缀与位置参数、
  `bash -c`/`-lc` 等形态返回“无 Git”，Full Access 下不触发目标绑定确认；分类器自 `e80b8c8` 未变，WIN7-22、WIN7-37 等候选同源（分类器层复现，
  Win7 端到端可达性待验证）。A9-18 工作树曾部分修复但未提交。负责人同日按建议批准 [A9-20](tasks/A9_20_GIT_CONFIRMATION_CLASSIFIER_HARDENING.md)
  与 ADR-0137，并授权按推荐优化需求；已签结论不改判，仅登记已知缺陷。

- 2026-09-25，建立 [A9-17 / A9-18 承接台账](plans/A9_17_A9_18_CARRYOVER_LEDGER.md)：登记 A9-17 遗留项 K17-1～K17-5（含预算 #3 与 ADR-0028 口径矛盾）、
  A9-18 的 P0-1～P0-4 / P2 需求、工作树自报进度与影响主线的缺陷；A9-18 工作树仍未提交，保全、ADR 重编号与拆分承接待负责人裁决。

- 2026-09-25，按负责人要求评估 A9-18 价值：主线实测启动全量加载历史 checkpoint，100 Turn 约 4 s 且线性增长，确认启动定向恢复方向正确；
  schema 事实投影性价比低不移植。起草 [A9-21](tasks/A9_21_A9_18_SALVAGE_PORT.md) 与 ADR-0138/0139（均待批准），移植完成后删除 A9-18 工作树。

- 2026-09-25，负责人按建议批准 A9-21 与 ADR-0138/0139，顺序为 A9-20 先行；A9-20 开始实现。

- 2026-09-25，A9-20 开发机完成：Git 确认分类器支持 CMD/PowerShell/POSIX 各种载荷写法，不可解析即保守确认，超长命令策略层确认，
  Git 外部写与无法解包的 Shell 宿主不计验证证据。实施中另发现并关闭两类旁路（已分类分段掩盖动态 push、深层嵌套 `powershell -e`），见 ADR-0140。
  core 362 / shell 376 项通过，旧实现负向对照 37 项失败，7 项变异全部捕获。Win7 未验证。

- 2026-09-25，A9-21 M0 完成：性能预算 #3 改按 `shell.main` 计量（ADR-0139），测量计划映射同步，采样脚本仅改注释，
  SHA-256 变为 `198bdac3…0b6`。K17-5 关闭，A9-17 的 Win7 采样（K17-1）不再被口径问题阻塞。

- 2026-09-25，A9-21 M1 完成：启动只恢复本工作区中断且缺 checkpoint 的 Turn，历史清单改为使用时校验。开发机 100 Turn 历史启动 8.0～8.3 s → 35～51 ms。
  另发现 `redactSecrets` URL 凭据正则在长字母数字串上为二次复杂度（范围外，待裁决）。

- 2026-09-25，负责人决定 A9-21 M1b（脱敏正则线性化）与 M2（模型输出上限）交由外部 Agent 实施，本会话验收；交接书见
  `docs/plans/A9_21_M1B_REDACTION_REGEX_HANDOFF.md`、`docs/plans/A9_21_M2_OUTPUT_LIMITS_HANDOFF.md`。

- 2026-09-25，A9-21 M1b 第一轮验收不通过（`a78d928`）：`{0,31}` 修法在协议名末 32 字符无字母时漏脱敏，与旧正则不等价。
  负责人裁决改为等价的线性扫描实现、渲染端恢复原样；交接书修订为第 2 版，执行方返工。

- 2026-09-25，A9-21 M1b 第二轮验收通过并并回（`d67979a`，合并 `3e73b5e`）：URL 凭据脱敏改为与旧正则等价的线性扫描，
  差分 160 万条 0 差异，1 MiB 最坏输入 ≤ 7.4 ms。渲染端保留旧正则（输入已截到 500）。Win7 未验证。

- 2026-09-25，A9-21 M2 第一轮验收不通过（`e118f2b`）：SSE 长行分片查找为二次复杂度；截断后历史残留孤立 tool 消息，会话后续请求会被拒绝。
  交接书修订为第 2 版，执行方返工。

- 2026-09-25，A9-21 M2 第二轮有条件通过（`df0405a`）：二次复杂度与截断后历史协议问题已修复；C-4 降级用例被 A9-20 规则掩盖、
  历史协议用例依赖 core 构建产物，两处只改测试，补齐复查后并回。

- 2026-09-26，A9-21 M2 第三轮验收通过并并回（`3bc8815`，合并 `de851be`）：模型输出单响应 1 MiB、单工具参数 512 KiB、单 Turn 2 MiB，
  SSE 长行查找线性，截断后对话历史符合协议。gateway 263、core 371、shell 423 项通过。Win7 未验证。

- 2026-09-26，A9-21 M3/M4 开工前裁决：`blockedRequests` 位于 `main.js`，M4 允许路径增补该文件（仅相关代码）；界面方案经演示确认。
  M3（checkpoint 列表分页）交外部 Agent 实施，交接书见 `docs/plans/A9_21_M3_CHECKPOINT_PAGINATION_HANDOFF.md`。

- 2026-09-26，A9-21 M3 第一轮有条件通过（`106e650`）：分页契约与界面符合；同一时刻记录的稳定排序缺测试，补齐复查后并回。
  另发现快照耗时随 checkpoint 总数增长源于既有 `listConversationFacts`，不属 M3。

- 2026-09-26，A9-21 M3 第二轮验收通过并并回（`ab5e792`，合并 `6dc75d0`）：快照只带最近 50 条 checkpoint 与总数，
  更早记录经 `a9.checkpoint.list` 游标分页。state 305、shell 432 项通过。Win7 未验证。

- 2026-09-26，A9-21 M4（事件集合与被拦截请求上限）交外部 Agent 实施，交接书见 `docs/plans/A9_21_M4_COLLECTION_LIMITS_HANDOFF.md`。

- 2026-09-26，A9-21 M4 第一轮验收不通过（`e1c6956`）：淘汰后“加载更早记录”跳过已释放记录并留下断档；“收回已淘汰事件”缺测试；
  `releasedEventIds` 随对话无限增长，一并改为计数。交接书修订为第 2 版，执行方返工。

- 2026-09-26，A9-21 M4 第二轮验收不通过（`7e0ebf9`）：断档与逐 ID 集合问题已解决；一页中同时含已释放与从未加载的记录时释放计数多减。
  交接书修订为第 3 版，执行方返工。

- 2026-09-26，A9-21 M4 第三轮验收通过并并回（`d38aeaf`，合并 `b146595`）：渲染端事件与 Main 被拦截请求均有上限，释放计数准确。
  A9-21 M1～M4 全部并回，各受影响包全量测试通过。下一步 M5 清理 A9-18 工作树。Win7 未验证。

- 2026-09-26，A9-21 M5 完成：负责人删除 A9-18 工作树与分支 `codex/a9-memory-optimization`（最后 HEAD `7d06789`），删除前逐文件核对见承接台账 §7.3。
  A9-21 M0～M5 全部完成；任务级待办为 gateway 偶发失败定位、真实 Electron 完整任务回归与 Win7 实机。

- 2026-09-26，清理 A9-21 M1b～M4 的外部执行工作树与已并回的本地分支；主工作区只剩 `codex/a9-alpha2`。

- 2026-09-26，A9-21 收口验证（gateway 偶发失败、真实 Electron 回归）交接给新会话，交接书见 `docs/plans/A9_21_CLOSEOUT_VALIDATION_HANDOFF.md`。

- 2026-09-26，负责人授权以当前主线换发 WIN7-38 并在 Win7 实机验收 A9-20 与 A9-21（ADR-0141，任务书 A9-22）；验收机只读连通性检查通过
  （`192.168.1.3` 返回 `6.1.7601`）。A9-21 §5 第 6 项改由 WIN7-38 覆盖，收口交接书改为只排查 gateway 偶发失败。
  构建输入中 A6 SQLite 返回包需从私有加密归档恢复。

- 2026-09-26，WIN7-38 实机执行（run-id `31504dc1-8371-4381-a2ea-67ab2b9ce411`，目标 `192.168.1.3`，外部执行方）：authority `55bf8074…584f`
  记载负责人批准时间 `2026-09-26T05:15:00Z`（签发对话记录待负责人补录）。G1 完整性 PASS（agent Medium）；G2 smoke 退出码 1，
  产品入口 `MODULE_NOT_FOUND`，5 个 `electron.exe` 残留经人工强制终止；G3 按硬停止条件未执行。
- 2026-09-26，WIN7-38 审核：根因为候选内 `a9-win7-38-smoke.cjs` 未传 `A9_SMOKE_PRODUCT_MAIN`，产品未运行；W38 断言多为恒真，残留检测未排除自身 PID。
  负责人裁决 WIN7-38 为 `A9_22_WIN7_38_VALIDATION_KIT_DEFECT_NOT_PASS`（ADR-0142），A9-22 关闭；新建 A9-23 修复套件后换发 WIN7-39。
  审查报告见 `docs/reports/2026-09/a9_22_win7_38_acceptance_review_2026-09-26.md`。
- 2026-09-26，负责人同意 A9-23 §7 Q1：WIN7-39 冻结前以非正式构建在 Win7 预演 G2 smoke，仅用于修正套件，标 `REHEARSAL_NOT_ELIGIBLE`，不计入任何结论。
- 2026-09-26，A9-23 套件修复交接书完成（`docs/plans/A9_23_W39_KIT_REPAIR_HANDOFF.md`），分支 `codex/a9-23-w39-kit`，由新会话或外部执行方实施，本会话验收。

- 2026-09-26，A9-23 W39 套件修复第一轮验收不通过（`90f840e`）：机械门与构建均通过，断言来源审查发现 6 处问题，返工要求见套件修复交接书 §7；
  Win7 预演交接书待返工通过后再出。

- 2026-09-26，A9-23 W39 套件修复第二轮验收通过（`330eae7`），发出 Win7 套件预演交接书（非正式构建，结果不计入任何结论）。

- 2026-09-26，A9-23 W39 Win7 套件预演完成：产品入口修复在实机生效，M1/M2/启动与 W37 继承阶段通过；24 条未通过断言均为套件问题，
  第三轮返工要求见套件修复交接书 §9，返工后再预演。Win7 的 MinGit 只在管理员 PATH 中，smoke 改用完整路径。

- 2026-09-26，A9-23 W39 套件第三轮返工（`28c5508`）验收通过，发出第二次 Win7 预演要求（含计划任务 XML 须 CP936 编码）。

- 2026-09-26，A9-23 第二次预演止于计划任务回读门（`schtasks /query` 在 SSH 会话报“无法加载列资源”）；裁决分层门（`chcp 936` 首选、COM 导出后备、自检任务必做），换新目录重跑。

- 2026-09-27，A9-23 第二次 Win7 预演复核：M3 60 轮等在实机通过，剩余 24 条未通过断言为套件问题 K8～K11，出第四轮返工要求（套件修复交接书 §11）。
  记录产品侧观察：会话中选择或切换到已有历史的工作区后，过程记录不加载，需切换对话或完成一轮后才显示（待定是否另立任务）。

- 2026-09-27，A9-23 W39 套件第四轮返工（`8f5e0e4`）验收通过，发出第三次 Win7 预演要求（预演交接书附录 C）。
- 2026-09-27，A9-23 第三次 Win7 预演（`20260927-0059`）：13 个阶段与 181 条断言全部通过；smoke 汇总因套件判定缺陷 K12 输出 `FAIL`，发出第五轮返工 R5-1（套件修复交接书 §13）。
- 2026-09-27，A9-23 套件第五轮返工（`e0e8da6`）验收通过；负责人决定不做第四次预演；套件分支于 `7ec9db7` 并入 `codex/a9-alpha2`，起草正式实机交接书 `A9_23_WIN7_39_ACCEPTANCE_HANDOFF.md`（待双构建冻结与门 A）。
- 2026-09-27，WIN7-39 双构建冻结：源码 `7ec9db7`，两个独立干净工作树 ZIP 逐字节一致，SHA-256 `6bf586e764f18947f52227ff9e321c60091e0410ed7a84061979e49d10cad9e5`（101,414,183 B），manifest `1388bebc…f420`，输入锁 `a3decbc5…3b48`；候选自带校验拒绝错误 pin 与错误绑定（开发机预检）；authority 草稿（run-id `b0ebcf98-1697-431d-9ca5-22ac26ff2a67`，目标 `192.168.1.3`）待负责人签发。
- 2026-09-27，门 A：负责人在对话中明确指示“签发 WIN7-39 authority”，签发 `WIN7_39_RELEASE_AUTHORITY`（`approved_at` 2026-09-26T18:36:58Z，SHA-256 `b07588e00c47dce88d9ea95e28fedf0c8db26a28900351f2770251ea336f9a09`），绑定 ZIP `6bf586e7…d9e5`、manifest `1388bebc…f420`、输入锁 `a3decbc5…3b48`、目标 `192.168.1.3`、run-id `b0ebcf98-1697-431d-9ca5-22ac26ff2a67`；A9-23 实机交接书改为 `READY_FOR_EXECUTION`。
- 2026-09-27，WIN7-39 实机第一段：G0 与 G1 完成（完整性 `PASS`，Win7 端 ABI 110），G2 前因交接书完整性报告路径写错停止；审核方裁决为交接书勘误，G1 有效，G2 按实机交接书附录 A 续跑。
- 2026-09-27，WIN7-39 G2 续跑：smoke 退出码 0、`status=PASS`，13 个阶段与 181 条断言全部通过，零残留；审核报告 `a9_23_win7_39_acceptance_review_2026-09-27.md` 建议 15 项满足，待正式报告 Win7 复核与门 B。
- 2026-09-27，负责人接受 WIN7-39 审核结论；正式报告 `report-w39.json`（`70229b79…2688`）开发机预检 `PASS`（15/15），Win7 复核按实机交接书附录 B 执行。
- 2026-09-27，WIN7-39 正式报告 Win7 校验：`agent` Medium 下候选校验器 `status=PASS`、`verified_cases=15`、`REPORT_VERIFY_EXIT=0`；待负责人门 B 裁决。
- 2026-09-27，**门 B**：负责人签发 WIN7-39 `A9_23_WIN7_39_A9_20_A9_21_PASS`（15 项，源码 `7ec9db7`，ZIP `6bf586e7…d9e5`，run-id `b0ebcf98`），接受 W39-06 Stop 后 PID 以运行结束时不存在为准；已知限制随结论记录。A9-23 关闭；A9-20 改为 `A9_20_WIN7_39_PASS`；A9-21 §5 第 6 项关闭，`Phase-Gate` 待第 5 项。
- 2026-09-26，A9-21 §5 第 5 项 gateway 偶发失败排查：独立分支 `codex/a9-21-gateway-flake`（基线 `8efd6ad`），Node 20.17.0，
  `src/gateway` 全量 Jest 空载 100 次、3 个 Node CPU 负载下 100 次，每次 263/263 通过；**未复现、原因未定位**。
  负载时段（北京时间）15:41:04～16:03:29、16:07:15～16:10:08、16:27:05～16:38:48；前两段与 WIN7-39 打包测试部分重叠，
  两次中断运行未计数。初始 6 次预检因本工作树缺 `core/dist` 导致 J5 失败，补建后重新计数；不是原偶发失败的复现。
  原始 JSON 与进程清理证据：`/tmp/a9-21-gateway-flake-evidence-20260926.tar.gz`，SHA-256
  `7af335e5e63d85d97e3721949955a5cb91dd39432516fcbf3e89c08cf30ba2b0`（临时目录可能被清理）。
  未改产品代码；是否接受未复现结论待负责人决定。`Phase-Gate` 不变，WIN7-39 实机待验证。
- 2026-09-27，A9-21 收口：负责人接受 §5 第 5 项 gateway 排查结论“未复现、原因未定位”（开发机 200 次 263/263，审核方复核原始 JSON 一致），关闭第 5 项；第 6 项已由 WIN7-39 完成。`Phase-Gate` 改为 `A9_21_DEVELOPER_VERIFIED`。证据长期保存于 `.acceptance/runs/A9-21-GWFLAKE/a9-21-gateway-flake-evidence-20260926.tar.gz`（SHA-256 `7af335e5…a0ba2b0`，自 `/tmp` 复制长期保存）。
- 2026-09-27，Alpha 2 剩余范围：负责人决定拆两任务、先做 Review；起草 A9-24 任务书（`DRAFT_PENDING_OWNER_REVIEW`）与交互 Demo `docs/plans/a9-24-review-demo/`，未授权实现。
- 2026-09-27，负责人批准 ADR-0143：不做暂存区式 Review 模式，改为“先写后审”的改动审阅（直接写入、每轮改动摘要、逐文件 Diff 与撤销、整轮撤销、不阻断）；A9-16 追加 §21 修订登记；A9-24 草稿与 Demo 按新方向重写。
- 2026-09-27，负责人确认 A9-24 Demo 与开放问题建议，批准实施（`APPROVED_FOR_IMPLEMENTATION`）；冻结 C14 允许路径与 W37/W39 驱动兼容约束，发出实现交接书 `A9_24_CHANGE_REVIEW_HANDOFF.md`。
- 2026-09-27，A9-24 实现 `a086626` 验收通过（workspace 216、shell 458、打包 60/60，三项负向对照有效），于 `c136d12` 并入 alpha2，`A9_24_DEVELOPER_VERIFIED`；起草 A9-25（WIN7-40 换发与实机验收，ADR-0144 Proposed）。
- 2026-09-27，负责人批准 A9-25（ADR-0144 Accepted；保留预演、不改验收机 DPI、W40-01～15 全量回归），发出 W40 套件交接书。
- 2026-09-27，负责人要求有序推进已规划工作；新增推进顺序文档 `A9_ALPHA2_DELIVERY_SEQUENCE.md`（一次一个 Win7 候选、产品改动分支开发冻结后并入、只读核查并行、先证据后修复）。
- 2026-09-27，恢复目录误暂存只读核查完成（[报告](reports/2026-09/a9_recovery_dir_git_exposure_check_2026-09-27.md)，开发机，未在 Win7 验证）：确认无忽略规则的仓库中 `git add -A`/`git add .` 会纳入 `.agent_recovery/`（含改动前原文、未登记秘密与绝对路径），`git clean -fd`/`git stash -u` 会使撤销失效；自 A9-03（`ff96a19`）起全部 A9 候选同源。负责人裁决 D1：修复进入第一批首个里程碑，采用方案 3b（恢复目录内写入内容为 `*` 的 `.gitignore`），WIN7-40 范围不变；迁出工作区（方案二）与恢复目录清理另立任务评估。登记为已知问题并给出手动缓解。
- 2026-09-27，A9-25 第 1 步开发机门通过：W40 套件 `b99336f` 经审计返工 `8ce1bc3`（恢复被误删的继承旅程变量绑定并加回归测试），验收方复跑包测试 70/70、shell Jest 458/458、`verify:quick`、`docs:check` 通过，于 `762e2d3` 并入 alpha2；`w40*` 旅程未运行，下一步 Win7 预演（结果标 `REHEARSAL_NOT_ELIGIBLE`）。
- 2026-09-27，A9-25 第一次 W40 Win7 预演（`20260927-1741`）复核：继承 13 阶段通过，改动审阅核心观察符合预期；6 项套件问题需返工（截图关闭检查器、`too_large` 字段匹配、review 模式经界面提交、阶段耗时、停止终态读取、抽屉过渡中测量），未发现产品缺陷；登记产品侧观察 O-1（取消无终态事件）、O-2（超限文件原因措辞）。
- 2026-09-27，A9-25 W40 套件第二轮返工（`2f14d69`）复核：K-01/02/05/06 符合要求，包测试 77/77；需第三轮小返工（共用 `runElectron` 不得改写驱动原始报告且计时不得抛出；W40-21 结构化拒绝口径放宽为任意错误码）。登记 O-3：`a9-lifecycle.test.ts:945` 偶发一次未复现，疑为时序竞争，另行核查。
- 2026-09-27，A9-25 W40 套件第二、三轮返工通过（包测试 80/80），于 `5a20663` 并入 alpha2；发出第二次 Win7 预演（预演交接书附录 A）。
- 2026-09-27，A9-25 第二次 W40 预演（`20260927-2019`）复核：停止用例 K-05 消除；检查器等待超时（125% DPI 小数视口 1079.2 对取整 `innerWidth` 1079 的无容差判定），单阶段失败导致 smoke 中止、无总报告；需第四轮套件返工（视口容差、阶段失败不中止、等待诊断），未发现产品缺陷。
- 2026-09-27，A9-25 W40 套件第四轮返工通过（包测试 84/84），于 `0ca5a81` 并入 alpha2；发出第三次 Win7 预演（预演交接书附录 B）。
- 2026-09-27，A9-25 第三次 W40 预演（`20260927-2224`）复核：smoke PASS，17 阶段与 W40-02～22 全部通过，K-01～K-06 消除，套件第 2 步完成（预演证据不计入结论）；登记 O-4（命令产生文件的 Diff 为空）。下一步起草 WIN7-40 正式实机交接书。
- 2026-09-27，A9-25 第 4 步冻结预检发现候选内报告器残留 W39 结论标签，门 A 前撤回 `3a2ecdb` 冻结（保留于 `_superseded`），发出第五轮小返工，修复后重新双构建冻结。
- 2026-09-27，A9-25 W40 套件第五轮返工通过（包测试 85/85），于 `908f0f2` 并入 alpha2；重新执行第 4 步双构建冻结。
- 2026-09-27，A9-25 第 4 步完成：WIN7-40 从 `64fd3a7` 双构建冻结（ZIP `f14b7992…58fb`，manifest `4d499d73…888f`），开发机预检通过（非 Win7 结果）；等待门 A 签发 authority。
- 2026-09-27，A9-25 门 A：负责人签发 WIN7-40 authority（`b17ab35f…5618`，run-id `81c7a234`，目标 `192.168.1.3`）；实机交接书 `READY_FOR_EXECUTION`，Win7 实机验收待执行。
- 2026-09-28，A9-25 WIN7-40 实机（run-id `81c7a234`）：G1 PASS；G2 `w40_review` 因驱动读取未重绘 DOM 与一次性点击的时序缺陷失败，执行方按 §7 停止，后飞行零残留。审核报告确认非产品缺陷；负责人门 B 裁决 `A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS`（ADR-0145），不部分签发，修订 A9-25 以 WIN7-41 换发（连续 2 次预演通过后冻结），第一批候选顺延为 WIN7-42。
- 2026-09-28，A9-25 §9 第 ① 步完成：W41 套件（R6 时序修复 + W41 派生 + R6-5 补测，包测试 94/94）于 `5d671bc` 并入 alpha2；发出 W41 连续两次 Win7 预演交接书。
- 2026-09-28，A9-25 W41 连续两次预演（`20260928-1848`）复核：两次一致失败于驱动 `showDiff` 完成判据（依赖 `#a9-diff` 内容变化，同内容赋值在 Blink 不触发变更），套件缺陷、非产品缺陷；要求 R7 返工后重新连续两次预演。
- 2026-09-28，A9-25 W41 套件 R7 返工通过（包测试 97/97），于 `e846366` 并入 alpha2；发出第二轮连续两次 Win7 预演（W41 预演交接书附录 A）。
- 2026-09-28，A9-25 W41 第二轮连续两次预演（`20260928-2128`）复核：R7 生效；两次同点失败于 R6 返工把可选的“确认撤销”改成必达等待（写工具文件无确认卡），套件缺陷、非产品缺陷；要求 R8 返工后第三次连续两次预演。
- 2026-09-29，A9-25 W41 套件 R8 返工通过（包测试 101/101），于 `f77de6d` 并入 alpha2；发出第三轮连续两次 Win7 预演（W41 预演交接书附录 B，写入反斜杠归一化与续传取回做法）。
- 2026-09-29，A9-25 W41 第三轮连续两次预演（`20260929-0748`）复核：两次全部通过（17 阶段、21 个用例，W41-01 留待完整性入口），R7/R8 生效；偏差为 agent 会话断开（窗口尺寸不同）与执行方越权尝试 `tscon`（失败）。待负责人裁决是否认定 §9 第 ② 步完成。
- 2026-09-29，负责人认定 A9-25 §9 第 ② 步完成（W41 三轮预演，套件稳定），确认 DEV-2 授权来自负责人；进入第 ③ 步 WIN7-41 实机交接书。
- 2026-09-29，A9-25 §9 第 ③④ 步：起草 WIN7-41 实机交接书；WIN7-41 从 `0f8af24` 双构建冻结（ZIP `66a4b3e4…93b0`，manifest `141ef659…343e`），开发机预检通过（非 Win7 结果）；等待门 A。
- 2026-09-29，A9-25 门 A：负责人签发 WIN7-41 authority（`aeaa20cf…ffcc8`，run-id `318e27e4`，目标 `192.168.1.3`）；WIN7-41 实机交接书 `READY_FOR_EXECUTION`，Win7 实机验收待执行。
- 2026-09-29，A9-26 第一批可靠性任务书与 ⑤ 交互 Demo 经负责人批准（C1/C2、Q1～Q7 按建议；O-1、O-2 并入，O-4 另立），追加 ADR-0146 与推进顺序记录，发出实现交接书；状态 `A9_26_IMPLEMENTATION_AUTHORIZED`。
- 2026-09-29，A9-26 首次交回（`445aaaf`）验收需返工 B1（掩盖退出码的组合被判为验证）、B2（删除“重试加载”破坏继承的 retry 旅程）；返工 `1c8fb06` 复核通过，开发机门通过，`0fea04b` 并入 `codex/a9-alpha2`，状态 `A9_26_DEVELOPER_VERIFIED`；Win7 由 WIN7-42 承担。
- 2026-09-29，WIN7-41 实机执行完成（run-id `318e27e4`，首轮因 `agent` 断开硬停止后重新发起；G1/G2 退出码 0、smoke PASS）；审核方复核原始证据支持 22 项成立，组装正式报告并开发机预检通过，待执行方 Win7 报告校验后提交门 B。
- 2026-09-29，WIN7-41 正式报告 Win7 校验完成（`agent` Medium，`status=PASS`、22 项、`REPORT_VERIFY_EXIT=0`）；审核方核对一致，建议门 B 签发 `A9_25_WIN7_41_A9_24_PASS`，待负责人裁决。
- 2026-09-29，WIN7-41 门 B：负责人“按建议签发” `A9_25_WIN7_41_A9_24_PASS`（22 项，源码 `0f8af24`，run-id `318e27e4`）；A9-25 关闭，A9-24 取得 Win7 结论；推进顺序阶段 1 完成。

- 2026-09-30，负责人批准 A9-27 / WIN7-42，授权完成 A9-26 实机验证、合并前审查并合入 main；任务状态为 `APPROVED_FOR_IMPLEMENTATION / A9_27_IMPLEMENTATION_AUTHORIZED`。候选门 A/B 仍按独立绑定签发流程执行。严格 SSH 只读预检成功，agent 为控制台运行中；实际产品验证仍为 `NOT_PERFORMED`。

- 2026-09-30，冻结前复核发现四项开发机阻断。负责人批准 A9-28 修复失败验证大输出与预算硬门遗漏，A9-29 必需审计及 Provider 完整性草案待批准；A9-27 套件继续准备，产品冻结/合并暂停。
- 2026-09-30，负责人明确批准 A9-29：修复必需审计故障与 Provider 响应完整性，W42 扩为 30 项；与 A9-28 分任务实施，实机证据仍 NOT_PERFORMED。

## A9-28 / A9-29 开发机修复整合（2026-09-30）

四项冻结前阻断已修复并独立复核，通过必要开发机检查后并入 alpha2（`186e850`）。详见[记录](reports/2026-09/a9_28_a9_29_developer_closeout_2026-09-30.md)。W42 套件补强中，Win7 为 NOT_PERFORMED，尚未冻结或合入 main。

## A9-27 WIN7-42 换发（2026-09-30）

- 负责人批准 A9-27，并分别批准 A9-28/A9-29 的四项冻结前合同修复；开发机验证和独立产品复核闭合。W42 扩为 30 项。
- 源 `c62323f` 连续两轮预演 FAIL，保留原包和全部证据。仅修 W42 冷历史种子轮次关联与实时模型说明观测，继承函数和原断言不改。
- 返工源 `94385a8` 连续两轮 Win7 预演 25 阶段及 W42-02～30 均 PASS；W42-01 无 authority 为 NOT_PERFORMED。每轮 743 文件与 Win7 哈希一致，零残留、零真实秘密。证据 `.acceptance/rehearsals/A9-27-W42/20260930-1423/`，属于 REHEARSAL_NOT_ELIGIBLE。
- 双独立干净构建逐字节一致并与预演 ZIP 相等，WIN7-42 已冻结：source `94385a87d22928acc1ce5dd8f1881d89e0d4473b`，ZIP `3b6e0b72b98de794594cd6924a1298ef75ed72bafcebacf966c86ad2382a01cf`，manifest `6f7b224cdb304c9e10edf87ec9c490ffeb7dd5be42f9432ba3b6c5f3df3908c9`。固定正式 run-id `92d693e0-e80a-4d58-9f7f-aaff5ec69bd3`，目标 `192.168.1.3`。
- [正式交接书](plans/A9_27_WIN7_42_ACCEPTANCE_HANDOFF.md)与候选外 authority 草案就绪，等待负责人门 A 签发及角色确认；正式执行、独立证据审核、门 B 和本地 main 合并均 NOT_PERFORMED，未推送。

- 2026-09-30，负责人回复“签发门 A，按上述角色继续”，批准冻结候选和上述固定目标/run-id；主代理执行，负责人独立证据审核及门 B。候选外 authority 与独立 pin 已落盘（SHA-256 `35111410302d33cacd8e042f4a4d3979d558825ce939d6b280e47d9b77fc4f79`），开始正式执行；门 B/main 合并仍 NOT_PERFORMED。

- 2026-09-30，WIN7-42 正式执行及 Win7 报告复核完成：完整性 796/797、25 阶段/275 汇总断言、30 项，退出码均 0；774+19 Win7 文件哈希相等、916 文件扫描零真实秘密、两次后飞行零残留、四任务逐项移除。三项执行偏差完整保留，见[执行与合并前检查材料](reports/2026-09/a9_27_win7_42_execution_and_premerge_2026-09-30.md)。负责人独立审核与门 B 待完成，main 未合并，未推送。

- 2026-09-30，负责人在三项执行偏差解读及接受建议后回复“接受”；按已确认角色和原合并授权，门 B 收尾记为 `A9_27_WIN7_42_A9_26_PASS`。收尾发现 W42-23 dry-run 不足以独立关闭 A9-26 全部真实 Git 原矩阵，补充当前包 Windows Git R0-01～04 全 PASS；首轮换行断言失败及第二轮逐命令固定换行后通过均保留。182 个补充文件哈希闭合，零残留，两个任务逐项移除；1,161 文件扫描零真实秘密。A9-26～29 更新验收状态，恢复目录登记在当前候选关闭，保留 fdx 与既有未测边界；开始按授权本地 main 合并，未推送。

- 2026-09-30，本地 main 在 `/Users/qlyf/.codex/worktrees/a9-main-integration/win7-coding-Agent` 干净工作树快进：`38ca46e` → `829ad39`（负责人验收收尾与已批准实现），无冲突；本条文档追加同样快进并入。冻结源/候选/正式报告未重绑，主工作树仍 alpha2，原有两处 ZIP 删除与 check.py 未改动；origin/main 未变，未推送。

## A9 第二批设计准备（2026-10-01）

依据负责人 2026-09-30 推进指令，追加第一批/WIN7-42 收尾和后续编号说明，形成
[helper v3 设计](plans/A9_HELPER_V3_STREAMING_PROTOCOL.md)、A9-30～32 三任务草稿和
[Shell 模拟 Demo](plans/a9-30-shell-streaming-demo/index.html)，ADR-0150～0152 保持 Proposed。
默认用户点击继续、第二批整批候选，暂定 WIN7-43，冻结前复查编号；构建实际阻塞才提出拆分裁决。
现有修改/删除/check.py 保留，未同步分支、提交、推送、构建或实机执行。产品实现须具体任务批准及允许路径/分支硬门。

## A9-30 实现授权登记（2026-10-01）

负责人明确指示“请批准 A9-30 和 ADR-0150，作为开始 Shell 实时输出实现的具体依据”。
据此将 [A9-30](tasks/A9_30_SHELL_STREAMING.md) 登记为 APPROVED_FOR_IMPLEMENTATION、ADR-0150 为 Accepted，
同步 helper v3 的 A9-30 设计状态及索引；范围、源码基线 c14a968、目标分支和精确白名单保持。
A9-31/A9-32、ADR-0151/0152 仍是草稿/Proposed。独立安全/依赖复核、原生构建、提交推送及候选门 A/B 不因本登记获代替授权。
本次仅更新批准记录，产品实现、原生构建、冻结和 Win7 验证尚未执行；保留现有工作区改动。


## A9-30 源码接入与开发机定向验证（2026-10-01）

依据负责人独立工作树指令，在 `c14a96808d048c34f6079cc378ba12b4f60f5c62` 建立
`codex/a9-30-shell-streaming`，保留原工作区文档修改、ZIP 删除与未跟踪 check.py。
负责人另补批打包运行时及其测试两个精确路径，仅用于新增 v26 校验、保留 v25 合同。
已接入 native v3 writer、严格 Runner、Core 必需审计、SQLite 输出事件及活动卡；既有 Schema IPC/preload 复用。
开发机模块回归、真实 Node 子进程两秒 tick、实际 SQLite 及 Schema IPC、DOM 夹具和四类负向对照通过。
[源码验证报告](reports/2026-10/a9_30_shell_streaming_source_validation_2026-10-01.md)记录命令、哈希、首轮失败及证据边界。
新 Profile/API 已先行登记，原生工件哈希仍 NOT_LOCKED。v26 构建返回套件/发布生产者尚未实现，
独立复核、D-017 实际环境、Win32 helper、两次干净构建/PE/API/CRT、新输入锁、真实 Electron、Win7、
候选门 A/B 均 NOT_PERFORMED；不签整体 DEVELOPER_VERIFIED 或 Alpha 2。未提交、推送或合并。


## A9-30 收口本地交接准备（2026-10-01）

已实现白名单内 v26 套件/返回校验及独立 A9-30 开发检查包，补齐源码/输入/返回哈希、双构建身份、
原始 v3 事件、PE/API/CRT 和独立复核登记的拒绝路径；本地夹具测试通过，旧 v25/W42 文件哈希保持。
首轮打包失败为源码脱敏规则内完整私钥头部字符串触发秘密扫描；改为等价字符串构造，未弱化扫描规则，Runner 与打包定向回归通过。
[收口准备报告](reports/2026-10/a9_30_closeout_readiness_2026-10-01.md)及[交接包](plans/A9_30_DEVELOPER_CLOSEOUT_HANDOFF.md)已形成。
未提交/推送/合并，未读写构建机，未生成正式 kit/输入锁；独立复核人与 D-017 主机未指定。
当前 LOCAL_HANDOFF_READY / DEVELOPER_GATE_NOT_SIGNED；Windows 原生/真实 Electron/Win7 均 NOT_PERFORMED，
A9-31/A9-32、第二批新候选、完整 Alpha 2 和 RC 均不改判。


## A9-30 源码提交与 kit 审阅准备（2026-10-01）

负责人回复“批准”，按准确 61 路径追加一次本地 source `a3b6a67dbda43c41d27cedccbdf0875e1acc46d9`，父提交 c14a968，提交后干净。
从该 source 的干净 checkout 生成 23 文件 v26 kit，ZIP SHA `54879a93754b3561922120c6eb680ac6a5f926fbb7cf2f4b106e2bcde040b1fc`；
kit-lock/manifest SHA 及保护检查见 [绑定报告](reports/2026-10/a9_30_source_commit_and_v26_kit_binding_2026-10-01.md)。
状态 SOURCE_COMMITTED_KIT_READY_FOR_REVIEW；生成文件/文档未提交，kit 未批准，登记为空。
未推送/合并，未访问构建机；独立复核人/构建机仍待指定，原生重锁和真实 Electron/Win7 NOT_PERFORMED。

### 2026-10-02 A9-30 Win10 构建身份推进

r2因真实提升High令牌可能绕过角色判定已撤销；r3已独立复核并本地提交批准登记，source ff153483ef4e6df5daae59c6dcef9784e29d4140，登记0a96eb3。专用标准账户与三个目录获批并已创建，r3已校验部署。标准令牌非提升Medium，但远程启动子进程仍带HostJob；正式双构建/重锁 NOT_PERFORMED。等待真实桌面探针，不放宽身份门。见[身份报告](reports/2026-10/a9_30_win10_standard_account_identity_2026-10-02.md)及[桌面入口](plans/A9_30_WIN10_INTERACTIVE_BUILD_ENTRY.md)。未推送/合并，保留主工作区及历史证据，不提升DEVELOPER_VERIFIED。

## A9-30 r3 桌面身份通过与首轮失败（2026-10-02）

标准账户桌面身份探针 PASS：非提升、Medium、无 Host Job。首轮 run `8cfdd065-77e4-4634-b508-a729af6344c1` 编译、logic/capture、manifest、PE/API/CRT 通过，v1 smoke 因 `ACL_ROLLBACK_FAILED` 失败，第二轮未启动。失败 helper 不可锁定或装配；r3 撤销登记待提交。

唯一产品修复为 helper.cpp 的 DACL 恢复分支，严格比较及原保护状态保持；四组合管理员隔离探针通过，独立只读复核 P0/P1/P2=0。修复源码未提交，标准用户新 helper smoke 未执行。新源码提交与新 r4 构建目录审批范围见[首轮失败报告](reports/2026-10/a9_30_r3_win10_first_build_failure_2026-10-02.md)。保留旧套件、失败目录和全部诊断，产品重锁、真实 Electron、Win7均 NOT_PERFORMED，不登记 DEVELOPER_VERIFIED。

## A9-30 r4 新授权及首轮标签失败（2026-10-02）

负责人批准源码三个精确路径和两个全新 r4 目录、标准账户 Modify 及双构建。source `8e2bcfc`、独立套件复核登记 `989bac9`；两目录23文件输入及五项负例通过。用户启动真实桌面入口，标准身份非提升 Medium、无 Host Job，控制PID31172/Session2所有者在请求前核对。

首轮 run `17ae5e37-c173-45f3-9201-8e8d41b7a091` 编译、logic/capture、PE/API/CRT 通过，但 v1 smoke LABEL 恢复拒绝访问，后续 smoke 及第二轮未启动。DIAGNOSTICS SHA-256 `ed89c181dd8ad6942d3f2bc1831cc96c7ebafc3836998423bb76e3ac25841cec` 与 sidecar 一致，全部首轮证据保留；r4 撤销登记待提交。最小 LABEL 修复及标准用户原始 API 探针继续定位，详见[r4 失败报告](reports/2026-10/a9_30_r4_win10_first_build_failure_2026-10-02.md)。不得以 Modify 推导标签能力，不扩大账户或系统权限，不生成产品锁、不装配、不提升 DEVELOPER_VERIFIED。未推送、未合并；Win7仍 NOT_PERFORMED。

2026-10-02 02:14～02:25 +08，直接 a9builder SSH 实测 Job flags2048已允许显式breakaway；CreateProcessW同账户独立控制台子进程通过实际非提升Medium/无Job身份门，未改SSH/UAC/账户配置。由此取得标准用户标签负例：WRITE_OWNER打开、Apply Low、冗余restore均5，LABEL/DACL/owner末态不变。保留最初命令行超长和无身份记录的失败尝试，不以退出0冒充PASS。最小helper修复仍未提交，单个全新自有私有目录的WRITE_OWNER追加探针草稿待具体授权；正式构建/锁/装配/Electron仍未完成，见同一[r4报告](reports/2026-10/a9_30_r4_win10_first_build_failure_2026-10-02.md)。

2026-10-02 02:41:53 +08，现有 a9builder 直接 SSH 认证及同账户 breakaway 子进程再次通过完整身份门，删除重建账户的条件不成立。保留账户，继续定位已复现的私有目录 WRITE_OWNER 缺失。单目录最小权限探针补齐增量授权证明、句柄 fail-closed 和精确 Low 标签标志；尚待具体权限批准，未运行。其后 SSH:22 连接超时，材料未上传；不将网络或身份探针状态提升为构建结论。见[r4失败报告](reports/2026-10/a9_30_r4_win10_first_build_failure_2026-10-02.md)。

2026-10-02 02:48 +08，负责人批准单个精确新私有目录的不继承 WRITE_OWNER 探针；本地批准材料字节已核对，历史待批状态不重复求批。再次连接 192.168.1.4:22 超时，权限增加/标签探针/构建仍 NOT_PERFORMED，状态 APPROVED_WAITING_HOST_CONNECTION。账户无需重建且保留，网络恢复后继续已批准动作。见[r4报告](reports/2026-10/a9_30_r4_win10_first_build_failure_2026-10-02.md)。

2026-10-02 连接恢复后，SID1004在同一已批准私有目录的WRITE_OWNER/标签探针r2 PASS，r1自动SYNCHRONIZE增量失败和DACL恢复证据保留。v26测试46 PASS/1 Windows专项SKIP，实际PS5.1解析及纯ACL增量1正7负通过，均不代替正式helper构建。现有账户随后以新SID1005出现，标准/启用状态只读确认，SSH仍KeyNotTrusted；创建脚本两次前置停止，未由本代理创建/删除账户或改Bitvise设置。新source/kit/构建未执行，详见[r4报告](reports/2026-10/a9_30_r4_win10_first_build_failure_2026-10-02.md)。

2026-10-02 03:56～03:57 +08，Bitvise两账户认证恢复；SID1005独立控制台子PID29816实测普通/非提升Medium/无Job，构建身份门PASS。直接SSH父子带HostJob不用于正式构建，未改变服务/账户配置。新source五精确路径及两r5目录/四个私有fixture WRITE_OWNER待具体授权，r4诊断工件不重跑或装配。见[r4推进报告](reports/2026-10/a9_30_r4_win10_first_build_failure_2026-10-02.md)。


### A9-30 r5 宿主预检补充（2026-10-02）

负责人批准的五路径源码提交已追加为 `27a1de9`，未推送/合并；r5 kit 源码/ZIP 闭包独立复核通过，仍未登记正式批准。新 SID1005 的普通非提升Medium无Job身份通过，CIM/WMI OS查询拒绝，正式r5构建未启动。已准备只读运行时版本+HKLM交叉校验修正，实际PS5.1宿主门1正20负通过；控制入口目录/日志/批准绑定/阶段顺序修正及负例通过。修正源码提交待具体授权；两个已批准r5目录仍空，未扩权限/策略，产品锁、双构建、真实Electron/Win7及整体开发机门仍未完成。详见[宿主预检报告](reports/2026-10/a9_30_r5_win10_host_preflight_2026-10-02.md)。


### A9-30 r6 kit registration (2026-10-02)

Exact four-path source commit: `7feae402edfb30da9adb649841d777ca82cc6e80`. New r6 ZIP SHA-256: `8c0f79bf2f5383be3b59b6542f27e159c00efb23f07eeabdc0a05477462cf406`. Independent kit/control review P0/P1/P2=0; 23 ZIP entries / 13 exact committed native source blobs. Registration commit: `3e2f6f602bf7b6aa0786b7c800c8541eff1198f4`. Exact HEAD registry/report byte binding PASS; no push/merge. The stage script now checks approval before writes; actual PS5.1 syntax and missing-approval negative check must run before staging.

Current 192.168.1.4 SSH/TCP22 connection times out. The pretransfer guard did not succeed: r6 transfer/staging/BuildA/BuildB NOT_PERFORMED. Network cause UNKNOWN; no account/permission/Bitvise/UAC/system policy changes. Resume after readonly network, SID1005 identity, host/tool and fresh build-r5-a/b checks; these existing approved targets remain the only build directories. Returned-evidence review, product relock, actual Electron and Win7 NOT_PERFORMED; DEVELOPER_VERIFIED not signed. See [r6 independent review](reports/2026-10/a9_30_v26_r6_independent_kit_review_2026-10-02.md).


### A9-30 r6 Win10 双构建与独立返回复核（2026-10-02）

连接恢复并获负责人“开始构建”指令后，同一批准 source `7feae402edfb30da9adb649841d777ca82cc6e80` / registry HEAD `3e2f6f602bf7b6aa0786b7c800c8541eff1198f4` / r6 kit 在既有批准全新 `build-r5-a`、`build-r5-b` 完成两次普通非提升Medium无Job原生构建。run-id `16b5abc3-e4bb-4615-a5bc-12e02fcb5e17`、`33e3d3c9-bf4d-4f40-92f5-31b8915d13f9`；helper350720 bytes、SHA `c895a2f9e4abcb84ae2295d2e33ada6289cfd34c692b88e92276e7749cdc5a2b`，原始字节一致；两个返回包独立。实际PE/API/静态CRT、logic/capture、v1/v2及v3原始证据通过相应检查。最终独立只读返回复核P0/P1/P2=0，08:38:11+08。

A首轮返回触发旧consumer精确清单漏 `helper.exe.manifest`，保留原始ZIP/失败证据并暂停B；在已批准三精确路径修正清单及与kit的字节绑定，红2 FAIL/1 PASS、绿48 PASS/2 Windows平台SKIP，独立复核通过后在未消费的B目录构建。三文件修正仍未提交，未更改原生source/kit；不删返回项或放宽批准/身份门。背压只证明有界fail-closed，进程树清理UNKNOWN；返回复核登记、产品v26输入锁、打包及真实Electron、Win7未完成，DEVELOPER_VERIFIED不签发。主工作区和旧证据保留，未推送/合并，不占用WIN7-43，不改变A9-31/A9-32或Alpha2/RC。见 [双构建报告](reports/2026-10/a9_30_v26_r6_win10_double_build_2026-10-02.md) 和 [独立返回复核](reports/2026-10/a9_30_v26_r6_independent_return_review_2026-10-02.md)。


### A9-30 六路径授权提交与 v26 开发输入锁（2026-10-02）

负责人对准确六路径材料回复“授权”。按已审批字节追加本地提交 `9896ebffeef17b8e703d15e0933d767f99186780`，仅包含记录器/fixture/定向测试三文件、双构建和独立返回复核两报告、批准registry的 `return_review` 登记；分支 `codex/a9-30-shell-streaming`，未推送/合并。所有六路径提交blob逐项匹配批准SHA，原生source `7feae402edfb30da9adb649841d777ca82cc6e80`及r6 kit不变；其他11项工作树文件原始字节保留。

随后使用生产 `record-a9-v26-helper-input.mjs`、准确HEAD批准registry、同一r6 kit和两份原始返回包生成新 `release/win7-product-v3/a9-v26-input-lock.json`（7323 bytes，SHA-256 `2e5942b115f1e5f1ecf6a6c31d91ed5d4f9145b9e0751941a0aa566fdebda9df`）。锁ID `A9-30-DEVELOPER-INPUTS-D013-V26`，仅开发，记录两独立run/返回SHA及helper SHA `c895a2f9e4abcb84ae2295d2e33ada6289cfd34c692b88e92276e7749cdc5a2b`。原v25锁哈希/历史runner条目及全部其余继承输入一致；新锁当前未提交，未写正式候选authority，不占用WIN7-43。

生产重锁证据 `.acceptance/a9-30-developer/closeout/r6-production-development-lock-record.json`、`r6-development-lock-verification.json`；六路径审批/执行证据 `r6-receiver-commit-approval-material.json`、`r6-receiver-approved-commit-execution.json`。此前“待授权/NOT_LOCKED”原文及PENDING只读校验快照保留为历史。当前win10门 `PASS_D013_V26_RETURN_REVIEWED`仅原生返回范围；背压清理UNKNOWN，打包完整性/装配、真实Electron及Win7仍NOT_PERFORMED，整体DEVELOPER_VERIFIED/Alpha2/RC均未裁决。

### A9-30 开发包与真实桌面启动（2026-10-02）

开发包source `9896ebf`、ZIP SHA `fb07ec3803d933f96e5fbbf8f9d987e2068d0b0ddfca62319be3ab8eb391e93d`，本地与Win10解压完整784文件核验通过。负责人唤醒后，SID1005 Session3普通非提升Medium无Job真实桌面启动报 `A9_PACKAGE_RELEASE_MANIFEST_INVALID`：生产者使用v26开发状态，runtime只接受历史状态。

在补批runtime/test两精确路径完成最小修复；反证2FAIL/13PASS→15PASS，Shell492PASS、kit/打包回归156PASS/2Windows专项SKIP，verify:quick通过；独立局部复核P0/P1/P2=0。两路径源码提交待本次批准，未覆盖首失败包、未改原生source/kit/helper、未推送/合并。S01–S06和修复后新包未执行，整体DEVELOPER_VERIFIED不签发，背压清理UNKNOWN，Win7/Alpha2/RC未执行。见[打包与启动报告](reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)。


### A9-30 修复换包与真实 Electron 子集（2026-10-02）

负责人批准runtime/test准确两路径后，本地source `4318634` 的开发ZIP `b57d6806…7b232`、manifest `19d734ce…527ca`完整性与SID1005 Session3普通非提升无Job真实桌面启动PASS；原生source/kit/helper/开发锁按精确SHA继承。真实main/preload/native/Runner/Core/SQLite/IPC/Renderer路径的tick/双源/UTF-8/截断/Stop、已结束任务刷新/重启，以及回看/焦点/视图返回子集通过。CP936/UTF-16LE、40 native秘密切点、实际Runner背压及consumer失败、真实SQLite拒绝写入、协议帧故障、29秘密变体及4003直接切点另有范围明确的实机子集证据。9根310输出文件/84合成变体扫描命中0、正向对照有效，受检Electron已退出；历史native raw-pipe背压UNKNOWN不改判。

完整S01–S06和DEVELOPER_VERIFIED仍未签发：两文件运行中提示修正已完成39定向PASS及独立P0/P1/P2=0，源码提交待具体授权；失败验证撤销旧verified目标夹具已准备但未执行，编码负例、中断重启/退出交互仍待完成。UU在线而CUA远端输入无响应，坐标报noWindowsAvailable，不以SSH Session0代签。全部首失败和历史原文保留；不推送/合并、不占WIN7-43、不开放A9-31/32，不签Win7/Alpha2/RC。详见[当前包与实机矩阵](reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)。

更新前A9-30当前行（历史快照）：

```text
| A9-30～32 第二批执行能力 | A9-30 `APPROVED_FOR_IMPLEMENTATION`；v26 r6 Win10双构建helper一致、开发锁已生成；开发包ZIP完整性PASS，真实桌面启动FAIL，最小修复待本次提交授权；整体开发机门未签发 | [A9-30](tasks/A9_30_SHELL_STREAMING.md)、[双构建报告](reports/2026-10/a9_30_v26_r6_win10_double_build_2026-10-02.md)、[独立返回复核](reports/2026-10/a9_30_v26_r6_independent_return_review_2026-10-02.md)、[打包与启动报告](reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)、ADR-0150 Accepted | 六路径本地提交 `9896ebf`、原生source `7feae402`、开发锁SHA `2e5942b1…a9df`。首包784文件本地/Win10核验通过；SID1005 Session3普通非提升无Job真实启动报manifest状态不匹配。两批准路径修复15定向/492 Shell/156打包回归PASS，独立局部复核P0/P1/P2=0；源码提交待批，修复后新包和S01–S06未执行。背压清理UNKNOWN，Win7/DEVELOPER_VERIFIED未签发；A9-31/A9-32草稿，WIN7-43未占用 |
```


### A9-30 当前子集证据独立复核（2026-10-02 12:27 +08）

Luna high只读复核最新实机子集报告/矩阵/出口扫描，P0/P1/P2=0；仅确认所列证据范围，未签整体DEVELOPER_VERIFIED。再次连接确认a9builder SID1005 console Session3 Active；GUI输入工具仍报noWindowsAvailable，verification-r1尚未启动。当前报告与记录见 docs/reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md §7 和 .acceptance/a9-30-developer/closeout/r6-current-partial-evidence-independent-review-r1.json。文案提交具体审批、当前目标剩余编码/verified/中断恢复及退出交互仍待完成；Win7不改判。


### A9-30 继续验证：目标编码模块与会话边界（2026-10-02 14:37 +08）

当前source4318634和开发包身份不变。目标Electron二进制Node模式的解码器13断言PASS（中文三编码62切分点、8类错误及待判秘密前缀）；沿用获批同账户非提升无Job路线完成真实Electron/native/Runner编码负例96PASS，8个子进程消失且清理证明true。以上均为Session0模块证据，未取得GUI补充PASS。新增24个返回文件精确SHA一致，单独合成样本扫描0命中。原直接SSH HostJob门拒绝保留；未修改账户/Bitvise/系统策略。

UU诊断终端为Administrator SID500已断开Session1，A9 Builder console Session3仍活跃；只读诊断后退出本次终端，不影响其他连接。原生模块门已重新实测SID1005普通非提升Medium/noJob，桌面输入尚未恢复，故verified撤销、中断恢复、剩余退出交互NOT_PERFORMED。新r2桌面脚本已传输和解析，未执行。两文件提示修正的具体提交仍待确认；开发机门不签发。当前准确报告§8及矩阵r6-real-electron-evidence-matrix-r2.json；主工作区和旧证据保持。


此前STATUS当前行/阶段说明快照（历史；本轮仅维护当前状态，不改历史裁决）：

~~~text
| A9-30～32 第二批执行能力 | A9-30 `APPROVED_FOR_IMPLEMENTATION`；v26原生双构建/重锁完成，source `4318634` 开发包完整性/真实桌面启动与多项实时输出子集PASS；整体开发机门未签发 | [A9-30](tasks/A9_30_SHELL_STREAMING.md)、[原生双构建](reports/2026-10/a9_30_v26_r6_win10_double_build_2026-10-02.md)、[当前包与实机矩阵](reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)、ADR-0150 Accepted | 实际SQLite审计失败、协议负例、背压、脱敏、回看/焦点、已结束任务重启子集通过；310输出文件合成秘密扫描0命中。两文件提示修正提交待具体授权，失败验证撤销/编码负例/中断重启与退出交互尚未完成，远控输入不可用；完整S01–S06/DEVELOPER_VERIFIED/Win7未签发。A9-31/32草稿、WIN7-43未占用 |
推进顺序见 [A9 Alpha 2 推进顺序](plans/A9_ALPHA2_DELIVERY_SEQUENCE.md)：阶段 0 已完成（W40 套件开发机门通过并入 `762e2d3`；恢复目录误暂存核查已完成，D1 已裁决，修复进第一批，见下文第 6 项（当前候选已关闭））；阶段 1 已完成：WIN7-40 记为 `A9_25_WIN7_40_VALIDATION_KIT_DEFECT_NOT_PASS`（ADR-0145）后换发 WIN7-41（`0f8af24`，ZIP `66a4b3e4…93b0`，run-id `318e27e4`），2026-09-29 门 B 签发 `A9_25_WIN7_41_A9_24_PASS`（22 项，[审核报告](reports/2026-09/a9_25_win7_41_acceptance_review_2026-09-29.md)）。阶段 2 第一批（A9-26）及阶段 3 WIN7-42 已关闭（[A9-27](tasks/A9_27_WIN7_42_REISSUE_AND_ACCEPTANCE.md)，正式验证、报告复核与门 B 收尾完成）；第二批设计及 A9-30～32 任务已形成；2026-10-01 负责人批准 A9-30 和 ADR-0150，helper v3 的 Shell 实时输出合同作为实现依据。A9-31/A9-32 与后台 release 扩展仍待各自批准，独立安全/依赖复核及原生构建授权尚未完成。
~~~


2026-10-02 14:43+08，新增目标解码器/原生编码子集独立只读复核P0/P1/P2=0；评审版本报告、矩阵r2与原始证据精确SHA登记在r6-added-encoding-independent-review-r1.json，矩阵r3追加复核而不覆盖r1/r2。纯模块13PASS/实际Electron-native-Runner96PASS的范围保持；桌面补充、具体文案提交/新包和完整开发机门仍未完成。


### A9-30 桌面重连及固定入口准备（2026-10-02 15:19 +08）

Mac已解锁；只重连本机到同一Win10的UU连接，鼠标/快捷键仍无可确认桌面响应。重连后的只读UU终端SID500/Session1，与a9builder console Session3不同；故障根因UNKNOWN。四步First→Close→Crash→Recover固定桌面入口、隔离目录、哈希及PS5.1解析已准备，GUI均NOT_PERFORMED。Scheduler cmdlet只读CIM查询拒绝，另行COM只读连接成功；同账户LUA/InteractiveToken唯一任务创建/启动/精确移除材料已形成，待具体授权，没有任务登记或安全/账户改变。准确报告§10–11，整体开发机门NOT_SIGNED，Win7 NOT_PERFORMED。

此前当前行快照保留：

~~~text
| A9-30～32 第二批执行能力 | A9-30 `APPROVED_FOR_IMPLEMENTATION`；v26原生双构建/重锁完成，source `4318634` 开发包完整性/真实桌面启动与多项实时输出子集PASS；整体开发机门未签发 | [A9-30](tasks/A9_30_SHELL_STREAMING.md)、[原生双构建](reports/2026-10/a9_30_v26_r6_win10_double_build_2026-10-02.md)、[当前包与实机矩阵](reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)、ADR-0150 Accepted | 实际SQLite审计失败、协议负例、背压、脱敏、回看/焦点、已结束任务重启子集通过；310输出文件合成秘密扫描0命中。两文件提示修正提交待具体授权，目标解码器13项及实际native/Runner编码负例96项通过（Session0模块范围）；失败验证撤销、完整编码warning贯通、中断重启与退出交互尚未完成。UU终端为Administrator已断开Session1，A9 Builder桌面Session3仍活跃，输入未恢复；完整S01–S06/DEVELOPER_VERIFIED/Win7未签发。A9-31/32草稿、WIN7-43未占用 |
~~~

### A9-30 桌面验证前状态快照（2026-10-02 16:10 +08）

| A9-30～32 第二批执行能力 | A9-30 `APPROVED_FOR_IMPLEMENTATION`；v26原生双构建/重锁完成，source `4318634` 开发包完整性/真实桌面启动与多项实时输出子集PASS；整体开发机门未签发 | [A9-30](tasks/A9_30_SHELL_STREAMING.md)、[原生双构建](reports/2026-10/a9_30_v26_r6_win10_double_build_2026-10-02.md)、[当前包与实机矩阵](reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)、ADR-0150 Accepted | 实际SQLite审计失败、协议负例、背压、脱敏、回看/焦点、已结束任务重启子集通过；310输出文件合成秘密扫描0命中。两文件提示修正提交待具体授权，目标解码器13项及实际native/Runner编码负例96项通过（Session0模块范围）；失败验证撤销、完整编码warning贯通、中断重启与退出交互尚未完成。Mac已解锁，UU重连终端仍实测Administrator/Session1，A9 Builder桌面Session3活跃，输入未恢复；四步桌面入口已准备；同账户普通权限InteractiveToken任务备选待具体授权，未登记/启动；完整S01–S06/DEVELOPER_VERIFIED/Win7未签发。A9-31/32草稿、WIN7-43未占用 |

### A9-30 批准交互任务前状态快照（2026-10-02 20:05 +08）

| A9-30～32 第二批执行能力 | A9-30 `APPROVED_FOR_IMPLEMENTATION`；v26原生双构建/重锁完成，source `4318634` 开发包完整性/真实桌面启动与多项实时输出子集PASS；整体开发机门未签发 | [A9-30](tasks/A9_30_SHELL_STREAMING.md)、[原生双构建](reports/2026-10/a9_30_v26_r6_win10_double_build_2026-10-02.md)、[当前包与实机矩阵](reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)、ADR-0150 Accepted | 实际SQLite审计失败、协议负例、背压、脱敏、回看/焦点、已结束任务重启子集通过；解码器13项及native/Runner编码负例96项通过（模块范围）。新增真实标准桌面验证撤销12项PASS，新增98出口文件/84变体扫描0命中。运行中退出夹具首轮Send超时FAIL、Shell未启动，Crash/Recover停止；修正版三步入口已准备未执行，UU输入再次无响应。完整编码warning贯通、中断重启/退出、新证据完整复核及两文件提示提交/新包仍待完成；旧计划任务提案未创建且不再适用于当前入口。完整S01–S06/DEVELOPER_VERIFIED/Win7未签发。A9-31/32草稿、WIN7-43未占用 |


### A9-30 自动桌面入口验证前状态快照（2026-10-02 20:25 +08）

| A9-30～32 第二批执行能力 | A9-30 `APPROVED_FOR_IMPLEMENTATION`；v26原生双构建/重锁完成，source `4318634` 开发包完整性/真实桌面启动与多项实时输出子集PASS；整体开发机门未签发 | [A9-30](tasks/A9_30_SHELL_STREAMING.md)、[原生双构建](reports/2026-10/a9_30_v26_r6_win10_double_build_2026-10-02.md)、[当前包与实机矩阵](reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)、ADR-0150 Accepted | 实际SQLite审计失败、协议负例、背压、脱敏、回看/焦点、已结束任务重启子集通过；解码器13项及native/Runner编码负例96项通过（模块范围）。新增真实标准桌面验证撤销12项PASS，新增98出口文件/84变体扫描0命中。运行中退出夹具首轮Send超时FAIL、Shell未启动，Crash/Recover停止；修正版三步入口已准备未执行，UU输入再次无响应。完整编码warning贯通、中断重启/退出、新证据完整复核及两文件提示提交/新包仍待完成；批准R2交互任务已进入SID1005/Session3，但合并身份门FAIL（具体失败项UNKNOWN），未启动产品阶段；任务已停止并按精确登记/XML核对移除。R3同令牌独立子进程固定入口已准备，新增动作待具体批准。完整S01–S06/DEVELOPER_VERIFIED/Win7未签发。A9-31/32草稿、WIN7-43未占用 |


### A9-30 桌面控制器自动验证前快照（2026-10-02 20:35 +08）

| A9-30～32 第二批执行能力 | A9-30 `APPROVED_FOR_IMPLEMENTATION`；v26原生双构建/重锁完成，source `4318634` 开发包完整性/真实桌面启动与多项实时输出子集PASS；整体开发机门未签发 | [A9-30](tasks/A9_30_SHELL_STREAMING.md)、[原生双构建](reports/2026-10/a9_30_v26_r6_win10_double_build_2026-10-02.md)、[当前包与实机矩阵](reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)、ADR-0150 Accepted | 实际SQLite审计失败、协议负例、背压、脱敏、回看/焦点、已结束任务重启子集通过；解码器13项及native/Runner编码负例96项通过（模块范围）。新增真实标准桌面验证撤销12项PASS，新增98出口文件/84变体扫描0命中。运行中退出夹具首轮Send超时FAIL、Shell未启动，Crash/Recover停止；修正版三步入口已准备未执行，UU输入再次无响应。完整编码warning贯通、中断重启/退出、新证据完整复核及两文件提示提交/新包仍待完成；批准R2/R3交互任务均在身份/独立子进程门前停止并精确移除；R3实测Session3普通非提升Medium但HostJob=true、CreateProcessW错误5、无产品阶段。负责人手动桌面启动后身份无Job通过；r3 Close因夹具错误正文判据超时FAIL、Shell未启动，Crash/Recover停止；r4走真实Provider表单的固定三步入口已准备，待执行。完整S01–S06/DEVELOPER_VERIFIED/Win7未签发。A9-31/32草稿、WIN7-43未占用 |


### A9-30 实机矩阵r8更新前的当前状态原文（2026-10-02 21:30 +08）

| A9-30～32 第二批执行能力 | A9-30 `APPROVED_FOR_IMPLEMENTATION`；v26原生双构建/重锁完成，source `4318634` 开发包完整性/真实桌面启动与多项实时输出子集PASS；整体开发机门未签发 | [A9-30](tasks/A9_30_SHELL_STREAMING.md)、[原生双构建](reports/2026-10/a9_30_v26_r6_win10_double_build_2026-10-02.md)、[当前包与实机矩阵](reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)、ADR-0150 Accepted | 实际SQLite审计失败、协议负例、背压、脱敏、回看/焦点、已结束任务重启子集通过；解码器13项及native/Runner编码负例96项通过（模块范围）。新增真实标准桌面验证撤销12项PASS，新增98出口文件/84变体扫描0命中。运行中退出/中断恢复r4真实桌面15/10/15断言通过（Crash为故障注入），新251出口文件/84变体0命中。桌面控制器一次启动后SSH派发；重复请求拒绝、故意夹具失败后同一控制器完成修正版Close15断言，均有直接证据。旧失败及R2/R3身份入口失败保留，控制器无服务/提权/策略更改。完整编码warning贯通、新证据独立复核及两文件提示提交/新包仍待完成；完整S01–S06/DEVELOPER_VERIFIED/Win7未签发。A9-31/32草稿、WIN7-43未占用 |


### A9-30 提示源码提交与新开发包更新前原文（2026-10-02 22:38 +08）

| A9-30～32 第二批执行能力 | A9-30 `APPROVED_FOR_IMPLEMENTATION`；v26原生双构建/重锁完成，source `4318634` 开发包真实桌面多项实时输出子集PASS；整体开发机门未签发 | [A9-30](tasks/A9_30_SHELL_STREAMING.md)、[原生双构建](reports/2026-10/a9_30_v26_r6_win10_double_build_2026-10-02.md)、[当前包与实机矩阵](reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)、ADR-0150 Accepted | 真实审计失败、协议负例、背压/脱敏、视图/焦点、验证撤销及运行中退出/中断恢复子集已通过。r12新增11组UTF-8/CP936/UTF-16LE及错误字节样本、运行中关闭，共94断言PASS；UTF-16LE为可信外部选项，文件选择器UI未测。新增423出口文件/84变体、58控制器回传0命中，登记14个r12进程均已退出。一次桌面启动后SSH派发及普通故障重试有直接证据；R1超时UNKNOWN未暂停的缺陷保留，自动接管R2后实测UNKNOWN停止。r14漏建夹具目录首失败不改判，当前控制器HALTED，未继续派发。两文件提示源码提交/新包与新证据完整独立复核仍待；完整S01–S06/DEVELOPER_VERIFIED/Win7未签发。A9-31/32草稿、WIN7-43未占用 |

### A9-30 新包实机更新前原文（2026-10-02 23:08 +08）

| A9-30～32 第二批执行能力 | A9-30 `APPROVED_FOR_IMPLEMENTATION`；v26原生双构建/重锁完成，最新两文件source `32ee0b4`，Node20.17新开发包完整性PASS；整体开发机门未签发 | [A9-30](tasks/A9_30_SHELL_STREAMING.md)、[原生双构建](reports/2026-10/a9_30_v26_r6_win10_double_build_2026-10-02.md)、[当前包与实机矩阵](reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)、ADR-0150 Accepted | 独立Luna high复核冻结66项及旧包直接实机/当前精确提示差异P0/P1/P2=0。仅两批准路径追加源码提交；主工作区及其余修改保持，无推送/合并。新包ZIP08425b62…、manifest3afb3367…，780/783载荷与旧包字节相同，原helper/SQLite/许可不变。旧source4318634的94项及生命周期证据不重绑为新包直接PASS；新包启动/提示/输出/Stop仍NOT_PERFORMED。r14新增只读事实无Task/Turn/工具事件，原UNKNOWN保留、R2暂停不恢复。R3两个固定阶段与准确三目录方案仅本地准备，Win部署/启动待具体授权；最终DEVELOPER_VERIFIED/Win7未签发。A9-31/32草稿、WIN7-43未占用 |

### A9-30 最终开发机裁决前原文（2026-10-02）

| A9-30～32 第二批执行能力 | A9-30 `APPROVED_FOR_IMPLEMENTATION`；v26原生双构建/重锁完成，source `32ee0b4` 新开发包完整性、Win10直接启动及受影响交互子集PASS；整体开发机门未签发 | [A9-30](tasks/A9_30_SHELL_STREAMING.md)、[原生双构建](reports/2026-10/a9_30_v26_r6_win10_double_build_2026-10-02.md)、[当前包与实机矩阵](reports/2026-10/a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)、ADR-0150 Accepted | 新包ZIP08425b62…/manifest3afb3367…在SID1005 Session3普通非提升Medium无Job桌面完成Boot15启动1项、First16交互32项PASS。新提示、退出前双源输出/顺序、Stop/清理、307次先落盘再IPC观察、刷新分页/滚动焦点通过；111返回文件哈希匹配，84合成变体0命中且正向对照有效，8登记进程已退出。新R3两请求后自动结束；原R2暂停/UNKNOWN保留。旧source4318634直接证据不重绑，新包新证据和精确继承待最终独立复核；DEVELOPER_VERIFIED/Win7未签发。A9-31/32草稿、WIN7-43未占用 |


### 第二批推进合同准备（2026-10-02）

负责人要求整批推进到Win7实机PASS，已在A9-30工作树完成待审合同及登记材料。
A9-30保持DEVELOPER_VERIFIED；A9-31/32/33均草稿，ADR-0151/0152/0155均Proposed。
[审批包](plans/A9_BATCH_2_IMPLEMENTATION_APPROVAL.md)列C1本地25路径登记和C2具体实现请求；
未提交、未开始新实现、未写远端或冻结，Win7 NOT_PERFORMED。主工作区已有修改保持。


### A9-31实施批准与工作树（2026-10-03）

负责人批准C1/C2，C1本地25路径提交c2b6356完成且产品字节未变；
A9-31/ADR-0151已批准，独立分支codex/a9-31-background-tools进入实施。
新原生kit/构建/远端写入、产品源码提交及整合尚未批准；A9-32/33仍草稿，Win7 NOT_PERFORMED。

### 2026-10-03 A9-31本地实施交接

新后台三工具、owner/cursor/ring、release及退出路径已实现；Core185/Runner162/State70/Shell113通过。
四项故障注入反例红，恢复源码哈希一致；构建返回/装配负例及七模块静态检查见A9-31交接报告。
仅本地源码/模拟协议/真实SQLite与POSIX证据，无managed Windows工件/锁或真实Electron/Win7新证据。
源码提交等待确切清单批准，原生套件/目录/构建及独立复核分开；A9-32/33仍草稿，未推送或整合。

### A9-31准确源码与managed r1独立复核修复（2026-10-03）

r2准确51项批准后已本地提交2ecfc86d22bd7816cb75222db0917b25d32291a1，未推送/整合。
r1技术闭包通过，独立P1审计解释/P2反向竞态缺口使原kit不获批准；原ZIP和首FAIL保留。
SQLite跨Jest VM matcher误判根因及四行控制次序已修复，本地Runner166/Shell114与七模块检查通过。
独立补充关闭本地P1/P2；修复未提交，新kit未形成，managed锁/构建/真实Electron/Win7仍待。
见[修复交接](reports/2026-10/a9_31_managed_review_fixes_and_source_handoff_2026-10-03.md)。

### A9-31源码提交更新前的当前快照原文（2026-10-03）

### A9-31 本地实施（2026-10-03）

负责人已批准C1准确25路径登记和C2任务/ADR-0151/68路径/增量合同。
登记提交 `c2b6356f83ef8502a34516010924547c57a3bec2`，实现分支 `codex/a9-31-background-tools`。
后台启动/有界游标读/停止、不可变归属、跨块脱敏与先审计、release意图/回执、退出选择已进入本地实现。
当前仍为 `A9_31_IMPLEMENTATION_IN_PROGRESS`；源码提交、managed kit批准/双构建/新锁、真实Electron均未完成。
本地模拟协议及POSIX进程检查不证明Windows Job；Win10/Win7新工件验证均 `NOT_PERFORMED`。
A9-32/33未批准、候选未冻结，不签发第二批Win7 PASS或Alpha2/RC。

### 2026-10-03 — A9-31 managed r2独立复核不通过

负责人批准r3准确17文件提交及未批准新套件生成后，source=d9b5be502c9475e50c54b349a6a12abd27b199f8。
managed r2 ZIP SHA=5172a895d62e2db63635c427b31e9e0ba24c277c0d032742a4f0a7656a6362c2，23文件闭包匹配。
负责人明确要求“进行独立复核”；Luna high复核P0=0/P1=1/P2=0、FAIL_NOT_APPROVED。
P1为构建smoke真实helper/root/child父子身份和release退出码证据缺口；主代理合成反例进一步复现错误接受。
ADR-0156/系统API登记和精确六路径修复合同已形成，均待具体批准；没有修改实现、登记套件批准或运行构建。
报告见[独立复核](reports/2026-10/a9_31_managed_r2_independent_kit_review_2026-10-03.md)，
材料见[修复请求](plans/A9_31_MANAGED_IDENTITY_REPAIR_APPROVAL.md)。Win7及第二批正式门均NOT_PERFORMED。

### 2026-10-03 — A9-31 ADR-0156身份修复本地交接

负责人具体批准ADR-0156/六路径修复和本地检查；真实helper/root/child父子关系、时间和退出码/schema2闭合。
独立发现reader超时资源收尾P2，修复后另冻输入并复跑kit90PASS/2 WindowsPS NOT_PERFORMED。
独立静态P0/P1/P2=0；90直接+644精确继承=734唯一项，不将21定向/首轮重叠kit重复计数。
源码尚未提交、新kit未生成、实际Windows/构建/Electron/Win7仍NOT_PERFORMED，原r2不改判。
见[源码交接](reports/2026-10/a9_31_managed_identity_repair_source_handoff_2026-10-03.md)。

## 2026-10-03 A9-31准确source及managed r3前置

16项批准源码已提交10114503a1e79706131ea4a11a5b96bd2958807a，新managed r3闭包23项，
ZIP0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1。
独立只读复核PASS_FOR_OWNER_KIT_APPROVAL，P0/P1/P2=0/0/0；旧r1/r2不改判。
准确套件登记/三目标目录/SID1005权限/四v1 fixture/双构建材料待具体审批，尚无新远端写入。
普通SSH受Bitvise许可证限制；使用已在线普通桌面的固定控制器方案，不改profile/账户/许可证。
[具体审批包](plans/A9_31_MANAGED_R3_WIN10_BUILD_APPROVAL.md)记录范围和失败边界，Win7 NOT_PERFORMED。

2026-10-03，负责人对managed r3审批包回复“批准上述具体套件登记和构建范围”。
批准24路径本地登记、三新Win10目录/SID1005权限/四v1 fixture、普通桌面固定双构建控制器及回收。
尚未执行的构建/新锁/Electron/Win7不改判；不推送、合并或改账户/profile/许可证。

### 2026-10-03 — A9-31 managed r3原生双返回与收口边界

用户启动普通桌面R2后，SID1005/Session3/Medium/非提升/无Job通过，按原批准登记恢复BuildA→BuildB。
两份返回PASS；run-id3abe9a16-449b-4900-956e-6d0fb4c40fe2、33514a91-c5e8-4bb0-9176-135782175c88，
helper361472bytes/SHA2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7逐字节一致。
本地记录器误等同kit/native revision已按白名单修复；首失败、旧code5及首次30分钟等待超时保留。
独立返回复核和新锁未完成，控制器退出码/完整树清理UNKNOWN，停止下游重锁/装配。
[事实报告](reports/2026-10/a9_31_managed_r3_native_double_build_return_2026-10-03.md)记录边界；
不推送、不整合、不发布，不签DEVELOPER_VERIFIED/Win7/Alpha2/RC。

### 2026-10-03 — A9-31独立返回技术通过及准确离线裁决待批

负责人继续推进指令后启动独立gpt-6-luna/high只读复核；原生双返回/记录器修正技术通过，
独立91 PASS/0 FAIL/2 WindowsPS本地NOT_PERFORMED。P0/P1/P2=0/1/0，唯一P1为控制器UNKNOWN准入缺口。
[独立报告](reports/2026-10/a9_31_managed_r3_independent_return_review_2026-10-03.md)保留NOT_APPROVED_FOR_INPUT_LOCK。
只读4688/4689补查无证明；新增ADR-0158 Proposed和[具体审批包](plans/A9_31_MANAGED_R3_RETURN_RELOCK_APPROVAL.md)，
限定两个准确返回的离线登记/重锁及两次精确本地提交，尚未获得具体批准。
没有原生重编、formal registry/新锁写入、远端修改、推送/整合/发布，当前下游门保持停止。


### 2026-10-03 — A9-31准确双返回有限离线重锁获批

负责人回复“批准”，实际批准登记时间 `2026-10-03T07:10:46.920499Z`；批准准确审批包§1–6和ADR-0158。
十路径本地登记提交及五路径锁登记提交开始执行；仅两个准确managed r3返回允许离线重锁。
独立P1=1/原NOT_APPROVED准入结论保留，由负责人单独准入；控制器退出码/完整树UNKNOWN不改判。
不重编、不写远端、不推送/合并/发布；真实Electron/Win7 NOT_PERFORMED，Phase-Gate不升级。


### 2026-10-03 — A9-31准确十路径登记与managed正式锁生成

7处Markdown硬换行触发首轮暂存检查FAIL；负责人精确补批仅删除14字节并同步报告SHA，原版/失败日志保留。
格式修正后docs检查237文件/48任务及暂存/未暂存diff检查通过，准确十路径提交 `dcf541892ec3ee5f5413833206f07efa3f3ee6e2`。
正式记录器从clean committed registry生成独立managed锁，时间 `2026-10-03T07:20:10.862Z`，
SHA-256 `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e` / 7905bytes；全部原生/返回/批准/继承绑定回读PASS。
独立P1=1和controller UNKNOWN原样保存，按ADR-0158有限裁决离线重锁，不自签独立豁免。
Python回读曾按正斜杠直接查找Win10归档反斜杠条目而报KeyError；诊断保留，改用唯一规范化映射后回读通过，
没有改动产品或锁，正式记录器仍为一次成功生成。旧A9-30/W42/v25/v24不改。
本节及锁只按批准五路径登记；本轮无重编/远端写入/推送/整合/发布。
产品装配/真实Electron/Win7 NOT_PERFORMED，Phase-Gate不升级。


### 2026-10-03 — A9-31开发检查包及Win10只读预检完成

负责人批准继续下一步。按source35a1925及准确managed锁7593e758…461d3e生成A9-31独立开发包，
ZIPaae71bb0…d2f10c0、manifestdf70fa5b…97e7b9；本地生产者完整性PASS、784项内容一致、包内描述符/native哈希PASS。
实际Win10管理SSH成功；SID1005/Session3在线。只读发现实际profile为a9builder.WIN-2JQ66JE4HTQ，
新合同使用该profile下现有读写父目录，不猜路径或修改ACL；目标新根不存在，C盘余量约3.4GiB。
四个新测试源路径不在现任务白名单，先形成ADR-0159 Proposed及具体路径/新根/8phase/16请求取证合同。
旧控制器不复活、旧UNKNOWN/P1不改；新脚本/远端写入/真实Electron/Win7未执行。
新文档留待具体交付授权，不提交/推送/合并/发布，不开启新代理或重编原生。


### 2026-10-03 — A9-31新产品r1验证具体批准

负责人批准精确执行合同§1–6及ADR-0159；四个外部测试路径及准确profile新根获批，开始定向实现/检查。
包字节/source35a1925/managed锁保持冻结，普通身份/实际生命周期门仍适用。
本次运行结果尚未取得，Phase-Gate不升级；旧UNKNOWN/P1保留，无提交/整合/发布或Win7动作。


### 2026-10-03 — product r1控制器首失败与R2具体重试待批

Supervisor/controller普通SID1005/Session3/Medium/非提升/noJob门通过。首个Boot在原始字段正则被误拒绝，
r1 HALTED，持有controller及子进程句柄退出1/0，runs=0，产品未派发；首失败字节保留。
四批准源路径内已修复，实际PS5.1三解析、69原始JSON检查及Node32项PASS。
R2新根和独立控制器具体合同待负责人裁决，旧r1不复活，不写远端R2；真实Electron和Win7仍NOT_PERFORMED。
Phase-Gate不升级，无提交、原生重编、账户/ACL改变、推送、整合或发布。


### 2026-10-03 — product r1 R2准确重试获批

负责人批准R2重试合同§1–5；在SID1005实际profile下新R2根部署相同冻结包与四脚本，重新实测普通桌面身份。
R1保持HALTED及原始退出/首失败证据，不复活、不删除；本次最多2小时16固定phase请求。
批准覆盖同四路径必要修复/检查及最终hash冻结，产品/native及旧锁保持；Phase-Gate不升级。
真实Electron/Win7结果尚未取得，无提交/推送/整合/发布、原生重编或账户/ACL修改。


### 2026-10-03 — product r1 R2 Boot ASAR 夹具失败，R3 具体材料就绪

准确普通身份下 Electron22/Node16/ABI110 已直接启动；外部 manifestCheck 使用虚拟ASAR视图误报 ENOENT，cases/tools/provider=0，原始错误与持有 Electron exit1/结束树保留。
仅批准 driver 源按已 Accepted ADR-0088 修复，Node语法/40检查和八物理完整性用例PASS；R2冻结脚本、pin和产品/native不改。
ADR-0160/R3有限可复用调度合同待具体批准；当前普通夹具失败可等待，但同冻结入口不重复派发必败Boot。修复后实机/Win7 NOT_PERFORMED，无提交/推送/整合/发布或系统权限改变。


### 2026-10-03 — R3有限可复用窗口获批、部署装配通过

负责人批准R3合同§1–6及ADR-0160；四准确源路径内实施完成。Node54项、物理ASAR八正负项、实际PS5.1三解析和210请求/revision/限额/未知树检查通过。
新R3根及17输入已部署，装配复核产品784项/宿主73项及登记通过；首装配参数绑定失败与同准确输入绑定后的成功均保留，冻结三PS不覆盖。
R2已批准stop并取得持有controller/Electron实例真实exit0/1和完整观察树结束，不把首轮Boot失败改为PASS。
[实施证据与准确master/revision哈希](reports/2026-10/a9_31_product_r1_r3_reusable_dispatcher_2026-10-03.md)已登记；Mac锁屏暂停Computer Use，R3尚待普通桌面一次启动，功能/复用实机证明与Win7 NOT_PERFORMED，Gate不升级，无提交/系统权限改变。


### 2026-10-03 — R3普通桌面Boot首失败、HALTED与R4准确材料

R3 dispatcher32184/worker34536/Electron4196均直接通过SID1005/Session3/Medium/普通非提升/noHostJob。Boot run979976d3260e49a7a316bf8c0e604971的实际Electron/Node/SQLite、可见窗口和Renderer隔离三项通过，权限模式未选择时的INPUT_FOCUS失败；夹具前置在原driver路径修正且语法/54检查/784物理闭包PASS，实际复验未执行。
两层捕获报告未绑定观察PID13524，HALTED；原始13文件/截图/数据库及hash已回收，未知退出不因后续PID不存在改判。R3不复活，Shell及余六phase/同窗口重试证明NOT_PERFORMED。
[首失败报告](reports/2026-10/a9_31_product_r1_r3_boot_focus_and_capture_failure_2026-10-03.md)与[R4具体合同](plans/A9_31_PRODUCT_R1_R4_CAPTURE_RETRY_APPROVAL.md)/ADR-0161 Proposed已形成；冻结PS捕获/收尾修复及新R4远端执行待具体批准。A9-31保持IMPLEMENTATION_IN_PROGRESS，Win7/独立收口NOT_PERFORMED，无提交/推送/整合/发布/系统权限改变。


### 2026-10-03 — R4准确批准、捕获修复与部署通过

负责人批准R4合同§1–5及ADR-0161。四外部源完成新捕获/失败收尾/UTF8/参数绑定和焦点前置；Node68、实际PS三解析/210判据和实际12捕获/abort API检查通过，普通产品证据不由Administrator/Session0预检替代。取证模板/编码读取首失败均保留。
R4已CreateNew传输18项，完整784产品/73宿主闭包及登记装配通过；[准确冻结与部署报告](reports/2026-10/a9_31_product_r1_r4_capture_fix_and_deployment_2026-10-03.md)绑定全部hash。UU可见桌面但键盘输入未送入CMD，SSH无R4启动记录，等待一次普通桌面启动；R3不恢复、UNKNOWN不改判。Boot及后续/同窗口复验/Win7 NOT_PERFORMED，A9-31仍IMPLEMENTATION_IN_PROGRESS，无提交/系统改变。


### 2026-10-03 — R4普通桌面已启动、编译器捕获首失败及R5材料

Computer Use通过Windows运行框直接键入并确认焦点后启动R4；dispatcher28448/worker28356/Electron34180均实际通过SID1005/Session3/Medium/普通非提升/noHostJob。Boot run `01e5a8be22e9473fae4da8b1059eb46a` 观察短命csc.exe PID33576（父worker28356）但GetProcessById失败，dispatcher HALTED；固定abort生效，worker/Electron真实exit1、持有树结束，编译器creation/exit仍UNKNOWN。全部15文件/hash与秘密扫描已回收，不以PID消失补签清理，不派发Shell或余六组。
[首失败事实](reports/2026-10/a9_31_product_r1_r4_boot_compiler_capture_failure_2026-10-03.md)及[R5预编译具体合同](plans/A9_31_PRODUCT_R1_R5_CAPTURE_PRECOMPILE_APPROVAL.md)/ADR-0162 Proposed已形成；拟部署前预编译锁定现有C#，worker仅校验加载，保留所有硬门。R5实施/编译/远端写入/重试待准确批准，NOT_PERFORMED。A9-31仍IMPLEMENTATION_IN_PROGRESS，独立收口/Win7未执行，无提交/系统权限改变，历史R3/R4 UNKNOWN不改判。


### 2026-10-03 — R5普通手动实例身份通过，但历史HALTED阻断；R6材料就绪

R5准备预编译、Node68/实际PS三解析/237判据/22实际API文件检查、784产品/73宿主装配已通过；原51文件准备索引和首失败均保留。另轮计划任务PID22728因HostJob失败，原HALTED不改判。
代理给旧指令前未复查该记录；用户普通桌面新PID36076/creation639266265512707074直接通过SID1005/Session3/Medium/非提升/noJob，但旧final仍在，不派发产品。固定stop已发送，持有30秒未退出，exit UNKNOWN；20:20快照仍在且无直接子进程，不代签清理。
[准确事实与五文件hash](reports/2026-10/a9_31_r5_manual_restart_guard_failure_2026-10-03.md)保留旧final SHA39d6b4b…147967及新start/ready分属不同实例。R6新根/入口claim防护/原编译批准来源严格校验具体合同与ADR-0164 Proposed已形成，实施/远端R6 NOT_PERFORMED；A9-31仍IMPLEMENTATION_IN_PROGRESS，产品八phase、独立收口、Win7 NOT_PERFORMED，无提交或系统权限改变。


### 2026-10-03 — R6批准、入口防护实施及271协议检查通过；容量阻断部署

负责人批准R6合同§1–5及ADR-0164；仅原四外部源完成唯一claim/旧final拒绝、实例绑定、原capture编译批准独立校验和新根绑定。Node68、784产品闭包、实际PS5.1三解析/271判据PASS，真实旧R5根被新guard只读拒绝且原final hash不变。ASAR八负例按完整函数字节/调用和原记录hash继承，原DLL/产品/native锁不重建。
[直接记录及边界](reports/2026-10/a9_31_r6_entry_guard_local_checks_capacity_block_2026-10-03.md)：C盘20:31仅1536315392 bytes、20:35仅1589366784 bytes，低于部署门2147483648；R6未创建。真实文件/并发及22项API、完整装配/冻结、新普通窗口/八产品phase NOT_PERFORMED。旧R5 PID36076仍在、固定stop后实际exit UNKNOWN，UU入口不可用；不派发、不清理或迁移目标。A9-31仍IMPLEMENTATION_IN_PROGRESS，Win7/独立收口未执行，无提交或系统改变。

### 2026-10-03 — R6容量恢复、定向检查与冻结部署通过；普通桌面待启动

容量实际恢复至6053187584 bytes后，在批准R6根完成25项实际capture/API/文件用例及22项入口/文件/并发检查。271协议、三PS解析、Node68与784本地闭包绑定相同源；两并发调用只有一个取得claim，旧claim/start/ready/final/stop拒绝且不污染共享记录。首轮准备失败保留，固定实现源未再改。
R6 master9c9812d1…172cf、初始revisionc2fb083d…ea666、checks/registration已准确冻结；21新目标CreateNew传输/哈希/ParseFile与远端784产品/73宿主装配通过，DLL及原build/批准字节不变，产品/native锁未重建。
[直接记录及桌面交接](reports/2026-10/a9_31_r6_frozen_deployment_and_desktop_handoff_2026-10-03.md)：旧R5 PID36076/creation639266265512707074在50秒实际Process持有观察结束仍存活，exit UNKNOWN、零产品request、旧final不变；21:17:39快照仍存活，R6无entry/ready/final、零产品request。UU无法连接服务器，已请用户普通桌面正常关闭旧R5并启动新R6一次；旧控制器不能派发及新SID1005普通身份未证实前不创建产品请求。八产品phase/同窗口重试/独立收口/Win7 NOT_PERFORMED，A9-31仍IMPLEMENTATION_IN_PROGRESS；无提交、账户/权限/系统变更。


### 2026-10-03 — Computer Use取得旧命令红字，R6普通身份通过但Boot生命周期硬停止

Computer Use退出UU本机被控详情后进入准确Win10桌面，读取旧R5命令导致既有dispatcher-final的IOException；随后键入准确R6入口。dispatcher PID113716/creation639266316299998155通过SID1005/Session3/Medium8192/普通非提升/noJob门，旧R5当前不存在而历史退出码仍UNKNOWN。
唯一Boot run `42a85eb4c6644abe8f3f892d7f7a9239`通过四项基础检查后出现Renderer执行失败；只读冻结表达式复现权限选择脚本引号转义SyntaxError，属于夹具缺陷。独立的cmd.exe PID48664（父Electron84472）在取得句柄前退出，dispatcher报LIFECYCLE_OBSERVED_CHILD_NOT_PINNED并HALTED。七个已持有实例实际退出0不能覆盖未持有cmd的creation/exit UNKNOWN。
[准确首失败与回收报告](reports/2026-10/a9_31_r6_cua_errors_and_boot_capture_failure_2026-10-03.md)绑定53文件/6162158 bytes，逐文件hash一致；R6不恢复、不派发后续七phase，不改冻结捕获。后续根及捕获修复须按R6合同§4另立准确合同。A9-31仍IMPLEMENTATION_IN_PROGRESS，独立收口/Win7 NOT_PERFORMED；无提交、产品/native/锁或系统配置改变。


### 2026-10-03 — R6夹具本地修复73项通过；R7查询句柄准确材料待确认

负责人“批准批准”后，在原精确外部driver路径修复Full Access表达式序列化，Node语法/73判据（原68加5个真实序列化/DOM作用/缺失元素负例）通过；19完整字面Renderer参数解析通过，动态参数仍须真实Electron。R6冻结四源及首失败不变，检查器首轮环境/分类失败保留，没有安装依赖。
[R7具体合同](plans/A9_31_PRODUCT_R1_R7_QUERY_HANDLE_CAPTURE_APPROVAL.md)及ADR-0165 Proposed已形成：拟新增第五C#源和最小权限非继承查询句柄/API、准确R7根内准备编译及普通有限桌面窗口。新路径/API/编译/远端写入须确认本合同；这些新增动作NOT_PERFORMED，不把修复方向批准冒充准确范围批准。原产品/native/锁不变，R6 HALTED/UNKNOWN不改判，A9-31保持IMPLEMENTATION_IN_PROGRESS，独立收口/Win7未执行；无提交/系统改变/委派。


### 2026-10-03 — R7定向检查和真实普通身份通过，首轮生命周期硬停止

负责人已批准R7合同§2–5及ADR-0165。五外部源完成查询捕获，Node73/19表达式/784闭包、实际PS5.1三解析、275准入、27查询/API、16文件门和22入口/并发PASS；八项ASAR负例按准确字节继承。三compile及首失败全部保留，最终DLL15f05ce0…3c9d6e7d/source7ec6a125…859ab7b和28新目标冻结，784产品/73宿主装配PASS。
Computer Use直接在A9 Builder CMD启动R7；PID78592/creation639266349360687397通过SID1005/Session3/Medium8192/普通非提升/noJob。唯一Boot run c26f1c3b3e2846a7bc4c432c006ecf35通过五项真实产品基础/Full Access表单检查，但尚未到受控断言即在子PID66612/父66864的CreationSessionImage联合判据失败。worker保留UNKNOWN并HALTED，dispatcher停止；后续实际持有该子实例/exit0不能覆盖首观察未知。
[直接报告](reports/2026-10/a9_31_r7_query_capture_and_snapshot_gate_failure_2026-10-03.md)绑定55文件/6166259 bytes全部hash核验、秘密扫描0命中。首gap缺失比较边界，snapshot调用区间内创建仅为有支持的推断。R7不恢复，正常Boot、同窗口失败后成功复验、后续七组/独立收口/Win7 NOT_PERFORMED。
[R8具体材料](plans/A9_31_PRODUCT_R1_R8_SNAPSHOT_INTERVAL_APPROVAL.md)和ADR-0166仅Proposed：同五路径、新准确根、时间区间和同实例双观察/准确诊断；具体批准前不实施/编译/写R8。A9-31仍IMPLEMENTATION_IN_PROGRESS；主工作区、产品/native/锁及历史证据保持，无提交/系统配置/委派。


### 2026-10-03 — R8精确执行：普通Boot查询缺口硬停止

负责人本轮回复“批准”，批准R8§2–4及ADR-0166。五外部源完成准确快照区间/同实例双观察/schema2诊断，锁定编译PASS；source97154a59…1c59e1c2、DLL9de64e7d…e67094b7。Node73/19表达式/784、实际PS5.1三解析、275准入、27查询/API、19区间、16文件门、22入口/并发PASS；ASAR八负例准确继承。所有探针首失败保留，不声称已制造两个合法句柄之间的PID复用/不同creation或Session。
Computer Use启动真实SID1005/Session3/Medium/非提升/noJob，dispatcher37244/creation639266379938146705。唯一Boot415b73bf23ba4648b0849e18e74c952b七项产品检查通过，受控断言也执行；worker在cmd PID78328/父Electron77368 OpenQueryHandle返回原生87、creation/exit UNKNOWN，HALTED，不能作为可重试普通失败。55文件/6259483 bytes全部hash一致、秘密扫描0。R8不恢复，正常Boot/同窗口成功复验/后续七phase/独立收口/Win7 NOT_PERFORMED。[直接报告](./reports/2026-10/a9_31_r8_interval_capture_and_short_lived_cmd_failure_2026-10-03.md)保留具体比较值及全部证据。
[R9材料](./plans/A9_31_PRODUCT_R1_R9_SYNC_PROBE_RECEIPT_APPROVAL.md)/ADR-0167只为Proposed：准确只读cmd-ver原spawnSync回执的新证明合同，尚未实施/编译/创建R9。当前源码只能支持来源推断，不能把该cmd具体绑定为已知探测。A9-31仍IMPLEMENTATION_IN_PROGRESS；产品/native/锁、主工作区及历史失败/UNKNOWN保留，无提交/系统改变/委派/Win7。

### 2026-10-04 R9 具体批准与执行起点

负责人回复“批准 R9 §2–4及 ADR-0167”，[R9合同](./plans/A9_31_PRODUCT_R1_R9_SYNC_PROBE_RECEIPT_APPROVAL.md)的原文SHA-256 `8a6ee203efe3e2c14d6afd83ba0e2b54a7a68c240985b6a73a0ace5a25d02c5b`，批准记录SHA-256 `070063d745013b43c8d6f80075245b40a8746940deceee982e18739a7a2e9b8d`。仅五个准确外部测试源及新R9范围，开始实现/检查；原R8 HALTED、历史UNKNOWN和产品source35a19250不改判。不提交、不改产品/native/锁或系统、不委派、不执行Win7。


### 2026-10-04 — R9准入、冻结与退出补充登记通过；普通桌面待启动

按具体批准完成五外部源、新source/DLL/MVID及实际锁定Electron/Node同步cmd-ver准入；原pid58684/status0、真实父kernel身份/快照与当前reader重验通过。Node73+88、Renderer19/784、PS三解析/315schema/27查询/19区间/16文件门/22入口/77回执检查PASS；ASAR8精确继承，不改绑旧报告。准入和检查编排首失败保留。
Master6e2131f0…6340266、受控Boot877845b7…9afb70a、正常退出补充revision e6c6394d…22d7501已冻结；40+8登记文件/实际784产品/73宿主hash及登记PASS。release丢回执/取消竞态补充仅准备检查，真实Core/SQLite/UI退出仍待执行。
[准确报告与交接](reports/2026-10/a9_31_r9_sync_receipt_freeze_and_desktop_handoff_2026-10-04.md)：SSH通过、A9 Builder Session3 Active；R9无entry/ready/final、零request。Mac锁屏使Computer Use无法启动，已请求解锁；不以管理员/SSH注入替代普通门。八phase/同窗口复验/独立收口/Win7 NOT_PERFORMED，A9-31仍IMPLEMENTATION_IN_PROGRESS；产品/native/锁/历史证据保留，无提交/系统改变/委派。


### 2026-10-04 — R9实际部分通过及编码捕获硬停止

R9批准范围内：真实SID1005普通桌面同控制器受控Boot失败→正常Boot8项通过，Shell22项通过；编码54项断言通过后实际PowerShell创建时间超过snapshot返回206ticks，硬门HALTED。原观测UNKNOWN保持，后续持有同实例实际退出0不补签；其余五phase未执行。
[直接报告](reports/2026-10/a9_31_r9_desktop_partial_pass_and_clock_boundary_halt_2026-10-04.md)：301原始文件/30382895bytes hash全部一致、秘密扫描0，后飞行784/73/四输入PASS，顶层exit UNKNOWN。新r9-desktop-evidence-matrix不覆盖原准备矩阵。R9不恢复，A9-31仍IMPLEMENTATION_IN_PROGRESS，独立收口/Win7 NOT_PERFORMED。
[R10具体合同](plans/A9_31_PRODUCT_R1_R10_PRECISE_UTC_CAPTURE_APPROVAL.md)/ADR-0168只Proposed，新取时API/Profile/新根尚未批准/实施/编译/部署。主工作区、产品/native/锁及历史失败保留，无提交/系统/委派。


### 2026-10-04 R10具体批准

负责人回复“批准”，批准[R10合同§2–4](plans/A9_31_PRODUCT_R1_R10_PRECISE_UTC_CAPTURE_APPROVAL.md)及ADR-0168。原合同SHA-256 `c388ae5ea1fc3eb73cb28f4de371f8d76db0243a0986d6cce31b9cd38c1da8d3`，原文批准SHA-256 `ef47799d2506546ec7ccee62026a0d677489b7e6b6e0a2adf0414bac15cd30d6`。仅五外部测试源、精确UTC API/V4测试Profile和准确R10准备/固定编译/准入/冻结/普通有限八组；原严格边界与全部硬门保持，不恢复R9，不改产品/native/锁或系统，不提交/委派/执行Win7。实际证据随后登记。


### 2026-10-04：R10 新捕获冻结就绪，普通桌面待启动

R10 §2–4/ADR-0168 已按负责人具体批准执行；新 capture DLL/MVID/精确 UTC、master 和两个不可变 revision 已冻结，当前准确源的本地/Win10 准入及远端产品784/宿主73闭包通过。原始准备返回163文件/3177366bytes逐文件哈希核对。Computer Use 键入/粘贴未进入CMD；普通控制器尚无启动记录，全部八组仍 NOT_PERFORMED，已交付一次性入口。R9 HALTED、首失败和 UNKNOWN 不改；A9-31不升级 DEVELOPER_VERIFIED，Win7不执行。详见 [R10冻结交接报告](reports/2026-10/a9_31_r10_precise_utc_capture_freeze_and_desktop_handoff_2026-10-04.md)。

### 2026-10-04 — R10真实桌面部分通过，后台必需归属审计失败

[现场及证据矩阵](reports/2026-10/a9_31_r10_partial_pass_and_windows_ownership_failure_2026-10-04.md)：SID1005/Session3/Medium/普通非提升/noJob，正常Boot8、Shell22、编码安全重试70直接PASS。受控Boot及编码首失败保留；后者仅按冻结driver合同增加预算内正例、保留超预算失败对照。
Background run5dee77858e484e51b7380c9bcf9fa701在helper启动前失败；真实DB只有tool_start，无managed事实。包内原方法结合实际Windows origin/fact复现同目录大小写被字符串比较拒绝；错属反例仍拒绝，本地受控复现不冒充Windows新执行。
依R10审计硬门停止后续派发，原stop合同取得dispatcher实际exit0；143树实例退出码均取得，657文件49075360bytes全hash核验、秘密出口0命中，后飞行144旧实例未见存活。raw COMPLETED只表示停止，三phase通过不代表八组通过。
[三路径本地修复材料](plans/A9_31_WINDOWS_WORKSPACE_OWNERSHIP_REPAIR_APPROVAL.md)待具体批准；产品/native/锁未改，无提交/远端新部署/委派。FailureBoundaries/StopExit/ReleaseExit/Recovery和独立收口/Win7均NOT_PERFORMED；A9-31仍IMPLEMENTATION_IN_PROGRESS，未签DEVELOPER_VERIFIED。

### 2026-10-04 — 三路径归属修复及两项同路径共性修复本地通过

负责人明确批准三路径本地修改/规定检查及共性检查。现[本地修复报告](reports/2026-10/a9_31_windows_workspace_ownership_local_repair_2026-10-04.md)登记：修复Windows canonical/display归属误拒绝、旧managed facts路径变体查回缺失，以及共享比较对POSIX大小写的错误放宽。均在原三路径内，其他身份canonical键不机械替换。
原代码反例、Jest平台属性夹具失败、首轮Stop回执/旧sibling dist失败及中断记录保留。最终State82、Shell117、verify:quick七模块build/static通过；规定检查后生成的24个Runner dist副本保全并只恢复原HEAD字节。原生/managed锁未变，无外部写入/提交/委派。
结论仅LOCAL_REPAIR_VERIFIED，源码提交和新包Windows复验待具体交付；旧R10不改判/恢复，独立收口/Win7 NOT_PERFORMED，A9-31不登记DEVELOPER_VERIFIED。


## 2026-10-04：归属修复准确源码提交完成；新开发包待具体批准

负责人批准五路径本地提交，准确source为`898ee9459a9b987840e94ddef336556ea58dd389`，父为`35a19250ed6589f6a7ba35b940a784325970c111`；五blob/SHA、提交路径和35个其余修改字节复核通过。原State82/Shell117/verify:quick所测源码与提交一致，没有重复产品检查或改绑旧Windows报告。
[提交记录](plans/A9_31_WINDOWS_WORKSPACE_REPAIR_SOURCE_COMMIT_APPROVAL.md)与[新包r2本地合同](plans/A9_31_PRODUCT_R2_LOCAL_PACKAGE_APPROVAL.md)可检索。新包装配尚未获批/执行，无推送/合并/远端写入/原生或锁变更；A9-31仍IMPLEMENTATION_IN_PROGRESS，新包Win10、独立收口与Win7均NOT_PERFORMED。

### 2026-10-04 — A9-31 r2本地装配批准/执行

负责人批准r2本地合同§1–3；source898ee945准确干净clone、离线七模块编译和原生产者首次exit0，ZIP d7323ac4…15122c47 / manifest1c5084a4…816b6225。784文件双向闭包、实际包runtime/Profile/native哈希/JS入口、State修复/适配器受控转发、许可证/SBOM及影响比较通过。[本地报告](reports/2026-10/a9_31_product_r2_local_package_2026-10-04.md)与原product-r2统一矩阵为证据入口。
符号链接的目录型忽略规则首失败及新clone八个精确exclude登记保留；源码、原工作区、依赖输入、旧R10与历史证据保护，无提交/推送/合并/远端写入/原生重建/委派。新Windows合同只形成草案，实际Windows/独立收口/Win7未执行；任务Gate不提升。

### 2026-10-04 — r2 Win10具体批准、范围纠错和普通入口阻塞

负责人批准[r2 Win10合同](plans/A9_31_PRODUCT_R2_WIN10_VALIDATION_APPROVAL.md)原§1–5；原合同9c21e3b7…e45ca99e、批准a593b05e…6bd55f0。四源准确实施；新根产品784/宿主73、一次固定C#编译、PS5.1、实际锁定Node16和查询/区间/回执准入通过。旧run引用、夹具input-holder、读取器作用域/参数及本地长度/盘点/回收首错全部保留，未放宽安全门。
初始文件门负例遗漏旧R5批准读取，范围错误明确登记，不作为仅新根合格检查。新run cd7eb70b…b524c2b用明确构造的无效批准数据完成原16项；旧控制器未启动/写入。新metadata revisions 210ffb9a…a8cb77 / 82c5a69a…4d6c13绑定修正后的17记录checks，master46441acf…3b821及四执行源/DLL保持；新登记和784/73闭包实查PASS。原冻结r1及首矩阵保留，不再派发。
[报告](reports/2026-10/a9_31_product_r2_win10_preparation_and_desktop_block_2026-10-04.md)记录1067文件清单、208文件4811376bytes返回及859保留输入逐hash匹配；两个显式junction负例不跟随。UU远控未将输入送入目标CMD，新root无claim/start/ready/final、请求0、普通token未取得，120分钟窗口未开始；旧剪贴板R10命令未执行。依普通桌面合同暂停产品派发，八phase/同控制器失败后成功复验/独立收口/Win7 NOT_PERFORMED。A9-31仍IMPLEMENTATION_IN_PROGRESS，无提交/推送/产品native锁修改/系统改变/委派。


### 2026-10-04 — A9-31 r2负责人手工协助入口

负责人随后表示“如果远控输入不行，我可以手工参与。”据此允许在WIN-2JQ66JE4HTQ的A9 Builder普通桌面由负责人打开全新非管理员CMD，一次执行同一冻结r2入口命令；仅替换§4的输入操作者，不变更源/包/master/revision、SID1005/Session3/Medium/非提升/noHostJob、120分钟/16请求及全部安全门。后续固定派发/取证仍由代理完成。旧窗口残留R10文本不执行，旧控制器不恢复；原批准§1–5和历史输入保留。

最近只读检查UTC 2026-10-04T06:30:43.8945785Z仍无claim/start/ready/final、正式请求0，普通token未取得；手工入口待实际启动，八phase、独立收口及Win7均NOT_PERFORMED。入口启动须先用实际进程实例/token核验，再按受控Boot失败→真实整树退出→同dispatcher正常Boot→Background最短链路的顺序推进。证据为product-r2/manual-assistance-owner-steering-r1.json和manual-entry-watch-063043241315.json。


### 2026-10-04 — A9-31 r2普通验证与Policy阻断

负责人一次手工普通入口实际核验通过；同dispatcher受控Boot失败/真实树退出后正常Boot8项PASS，Background最短28项PASS。完整后台首错游标夹具误取历史句柄，修正匹配当前handle后通过相关游标/3-4/Stop项，但永久删除确认场景未批准即真实派发Remove-Item。SQLite+包内Policy证明产品缺口，完整Background FAIL；六个下游phase、独立与Win7 NOT_PERFORMED。固定stop取得dispatcher exit0，112个dispatcher树实例/合并116个持有实例退出与后飞行闭合；479新增文件43568598bytes回收核验，原1067文件不变。当前统一矩阵为product-r2/win10-evidence-matrix-r4.json；raw COMPLETED/Background标记只表示停止/最短范围。r2已停止不可恢复，A9-31仍IMPLEMENTATION_IN_PROGRESS。

实际报告：[r2执行与Policy失败](reports/2026-10/a9_31_product_r2_win10_execution_and_policy_failure_2026-10-04.md)。具体三路径本地修复提案：[Shell删除Policy修复](plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)，DRAFT_NOT_APPROVED；不扩大本轮已执行授权，不改源码/包/native/锁，不提交/推送/委派。


### 2026-10-04 — A9-31删除Policy三路径批准修复与同类核查

负责人“审批同意并检查有无类似问题”批准精确三路径原§1–3；C14和ADR-0170登记。真实r2命令先红后ASK，删除族检查位于自主Git提前返回之前，执行与数据分开；原审批绑定/等待持久化/拒绝/错绑定/ReadOnly零端口派发保持。Policy113、后台Core10、Shell九组117、七模块lint/build通过。必需Core总302 PASS/1 FAIL：旧R1-03把rm file.txt当自主修改，与新ASK冲突；第四测试路径一行copy替换已准备但未批准/应用，首失败保留，不弱化安全或排除suite。

相邻16个纯Policy输入显示删除2项修复，发布/系统剩8漏确认2误确认；不执行这些命令，不扩大删除实现范围。[实际报告](reports/2026-10/a9_31_shell_delete_policy_local_repair_and_adjacent_audit_2026-10-04.md)与[第四路径材料§5](plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)集中记录。HEAD898ee945未变、三路径diff未提交，444个生成产物保全后24个tracked Runner dist恢复；原dirty/main、r2/三ZIP/native锁保留。A9-31仍IMPLEMENTATION_IN_PROGRESS；新包/Windows/独立/Win7 NOT_PERFORMED，无远端重启/R10恢复/提交/推送/系统改动/委派。


### 2026-10-04 — 第四测试路径补批与删除本地检查闭合

负责人针对精确§5/一行补丁回复“批准”，C14追加src/core/tests/a9-verification-evidence.test.ts。仅rm file.txt→copy file.txt copied.txt，原断言逐字保留，Core九组303项PASS并自然退出。产品/编译与原三路径不变，Shell117和七模块静态按原记录精确继承，不重复构建或用恢复后的旧Runner dist测试消费者。原302 PASS/1 FAIL、原r1全部证据及r2 FAIL不改判；当前结果见[报告§7](reports/2026-10/a9_31_shell_delete_policy_local_repair_and_adjacent_audit_2026-10-04.md)和fixture-supplement-r1。四路径工作区diff未提交，范围外8漏确认2误确认未实现；A9-31保持IMPLEMENTATION_IN_PROGRESS，新包/Windows/独立/Win7未执行，无远端/系统/委派。


### 2026-10-04：A9-31同类高影响Policy与可见审批本地闭合

负责人要求检查确实存在的同类问题并修复；实现前C14/材料§7与ADR-0171登记。原16项复核8漏2误有效，新首红144 PASS/66 FAIL保留；包管理器前置参数分别解析、非Git高影响先于自主Git，纯数据不再触发全文正则，明确全局依赖和注册表/服务变更纳入ASK。长/复合审批包含完整原command及显式cwd，保留旧digest/Git动态保守门。中间396/1新增错误ALLOW预期经原字节诊断改为原合同ASK，未放宽产品门。最终Core397、Shell117、七模块静态/构建PASS；实际编译22项零不符。源898ee945基线加未提交五路径diff（本轮四路径、上轮一行夹具不变），444编译文件保全后24 tracked dist复原。原r2/首FAIL/UNKNOWN、历史、工作区保留；新包/Windows/独立/Win7 NOT_PERFORMED，r2/R10不恢复，A9-31仍IMPLEMENTATION_IN_PROGRESS。见[报告](reports/2026-10/a9_31_shell_high_impact_policy_repair_2026-10-04.md)。

### 2026-10-04：A9-31再次核查、变量执行补修与Win10准入材料

负责人要求再次检查并推进Win10实际验证；沿已批准本地四路径/C14/ADR-0171修复静态命令变量npm/sc/reg漏确认与明确发布歧义。首红232项222 PASS/10 FAIL，第一版412/117后追加条件体/子表达式/${变量}三反例；共同上下文修复后最终Core417/417、Shell117/117、七模块静态编译PASS及24项实际编译纯求值零不符。原结果保持，拒绝/变化绑定零派发，444编译文件保全、24 tracked dist只恢复本轮起始字节。

目标只读预检C盘由首次不足2GiB到最终6543396864bytes，非代理清理；新r3根不存在、旧指定Electron零进程。两次stdin准备传输超时停止该路径，未计产品PASS。当前准确源码/五路径diff未提交，新包/真实Windows UI/SQLite/八phase、独立、Win7 NOT_PERFORMED。具体[C1/C2/C3材料](plans/A9_31_POLICY_R3_SOURCE_PACKAGE_WIN10_APPROVAL.md)一次列明源提交、干净r3装配、新根普通八phase和有界夹具重试，仍待项目要求的具体批准。原r2/失败/UNKNOWN/历史和工作区保留，不恢复R10；A9-31继续IMPLEMENTATION_IN_PROGRESS。[当前报告](reports/2026-10/a9_31_policy_win10_readiness_recheck_2026-10-04.md)集中登记。

### 2026-10-04：R4短命conhost共同根因与已批准事件诊断

当前源ebda911/r3；R3真实退出选择迟到导致终态日志访问已关闭journal，外部driver已修复并通过实际Win10 Node检查，原失败保留。已批准准确R3残留收尾及R4新根；R4受控Boot因conhost78648快照后消失、OpenQuery87而HALTED，8持有实例已退出但原子实例UNKNOWN，不重试整批。

负责人“解决”批准独立最小诊断；原三次尝试及所有失败保留。v3 GUI诊断宿主实际取得12 cmd/12 conhost、48 Start/End、exit0/零丢失/会话停止，26项纯回放与反例通过。38文件427988bytes完整返回/秘密零命中，R2/R3/R4共48冻结脚本、4 capture文件、原18诊断返回和5产品源均零不符，HEAD/index未变。经典事件尚缺OS创建FILETIME和完整镜像；因此整批Win10仍不PASS。新增精确字段材料与ADR-0172仅Proposed，未执行新API/探针/第五根。详细授权、首失败和证据均集中于[r3统一报告](reports/2026-10/a9_31_product_r3_package_and_win10_execution_2026-10-04.md)；独立/Win7未执行，无提交/推送/删除/R10恢复。

### 2026-10-04：manifest精确字段补证通过并交接

负责人批准准确manifest诊断§1–3（原文1f61d8b2…fac15171），新增两源/三个API先登记。v1固定父字段偏移失败保留；改为按字段名读取后v2一组、v3十二组通过：12 cmd/12 conhost、48事件、根CreateTime/ExitTime与真实句柄相等、Start完整系统映像及同实例End退出0、零丢失/session停止。36项真实报告反例及7自检通过，26文件264909bytes完整回收，最后诊断进程0。源/EXE/MVID/首失败及准确结果见[r3统一报告](reports/2026-10/a9_31_product_r3_package_and_win10_execution_2026-10-04.md)。

负责人要求其他agent接手，新增[handoff](reports/2026-10/a9_31_manifest_diagnostic_handoff_2026-10-04.md)。R5仅形成待批草案，普通取证接入/六源/新根未实现，原R4 HALTED及UNKNOWN不改判，整批Win10不PASS。交接前48历史控制脚本/4 capture/两批64返回文件/5产品源零不符，HEAD ebda911、index空；未提交/推送/删除/委派/恢复R10，独立/Win7未执行。

### 2026-10-04：R5 manifest proof接入合同批准

负责人批准[R5合同r3](plans/A9_31_MANIFEST_PROOF_R5_EXECUTION_APPROVAL.md)§1–5与ADR-0173，原文SHA256 540a7c614482cb13db57c45855531f5fc1898ad50b66e249857287c1066ed0d5；六源C14与观察器C15/C16已在实施前登记。D1/D2已采纳，D3核实为仅Recovery双根、ReleaseExit由3个释放实例钉住信号管理。尚未实现、编译或部署；R4 HALTED、UNKNOWN与全部旧证据不变，整批Win10仍NOT_PASS。

### 2026-10-04：R5观察器v2准入通过，磁盘空间待清理

R5根已创建并展开；观察器v2三轮准入通过（12根12证明、零丢失、会话停止）。C盘空闲约2.19GB贴近2GiB硬门，负责人选择自行清理旧根副本；代理未删除任何文件。冻结物上传、定向检查与普通phase均待空间确认，整批Win10仍NOT_PASS。

### 2026-10-05：R5入口已启动、首个请求未被接单并交接

R5冻结物与普通入口（SID1005/Session3/Medium8192）已通过；首个受控Boot请求在观察器就绪后发布，但dispatcher未接单、无run目录，观察器750秒到期自行HALTED（零事件/零丢失），请求仍pending。合同§5.3跨账户读写实测尚未执行。无普通phase证据，整批Win10仍NOT_PASS。见[handoff](reports/2026-10/a9_31_r5_manifest_proof_handoff_2026-10-05.md)。

### 2026-10-05：R5唯一pending请求获批撤回，窗口恢复待确认

负责人批准复核、撤回唯一请求并通过computer use解除选择模式。00:59:58（北京时间），Administrator经Strict SSH将`request-8d4805e86d3947b5a08cc65ff3769273.json`从R5 requests同卷移至evidence的withdrawn文件；525bytes、SHA256 `8c8d48fc552b47f4be37e716a964697edc626ac5eb9ddc7c86094fb9bd41e1f8`与本地副本及移动前后相等，原路径不存在、请求目录为空。Computer use看到标题“选择”，但Esc及标题栏输入无预期可见效果，恢复未确认；01:02:13同dispatcher PID92564/creation639267280524271566存活、无run/final、3秒CPU/I/O增量0。需一次手工退出选择模式后只读复核，不重开入口或发布新请求。原观察器HALTED/exit2及§5.3遗漏保留，整批Win10 NOT_PASS、独立/Win7 NOT_PERFORMED。首个传输长度失败和后续完整回执均保留，详见[handoff §9](reports/2026-10/a9_31_r5_manifest_proof_handoff_2026-10-05.md#9-批准撤回后的当前停点2026-10-05)。未提交/推送/删除/重发/恢复HALTED观察器。

### 2026-10-05：R5手工Esc后原入口恢复等待已核验

负责人手工Esc后，01:06:50（北京时间）Strict SSH复核原PID92564/creation639267280524271566存活，3秒CPU增加31.25ms；computer use直接看到窗口标题“选择”消失及`A9-31 reusable desktop dispatcher ready`输出。请求目录为空、原请求无run、无dispatcher-final，保全文件hash一致。批准的复核/撤回/退出选择模式第1–3步完成；原截止02:27:36不变，新请求和观察器重启未执行，原HALTED、§5.3遗漏及整批Win10 NOT_PASS保持。详见[handoff §9](reports/2026-10/a9_31_r5_manifest_proof_handoff_2026-10-05.md#9-批准撤回后的当前停点2026-10-05)第4项及`owner-esc-readonly-status-20261005-r1.*`。

### 2026-10-05：R5部分普通证据与入口HALTED

R5普通入口上Boot、StopExit（真实原生选择，21.1秒）、ReleaseExit（9.7秒）PASS且观察器终态核对通过；Recovery重启实例未退出，dispatcher HALTED（5/16请求）。其余phase未执行，整批Win10仍NOT_PASS。详见任务书同日条目与[handoff](reports/2026-10/a9_31_r5_manifest_proof_handoff_2026-10-05.md)。

### 2026-10-05：R6新根批准材料草案

[R6草案](plans/A9_31_R6_RECOVERY_RESTART_AND_REMAINING_PHASES_APPROVAL.md)已形成，未批准；前置P0=JS报错原文，裁决D1–D4待负责人。R5入口HALTED，其余phase未执行。

### 2026-10-05：R6合同r2批准

负责人批准[R6合同r2](plans/A9_31_R6_RECOVERY_RESTART_AND_REMAINING_PHASES_APPROVAL.md)（SHA256 97d402a37c7f0b8876d2a8c0bb56cedf4ac997c57556fa6f6bda9da5e6a7826f）及D1=B/D2/D3/D4；P0已由报错框原文满足（`EEXIST driver-journal.jsonl`）。六源C14与观察器C15/C16、ADR-0174已在实施前登记；另查出重启实例`boot.png`同类冲突并纳入同范围修复。尚未实现、编译或部署，R5入口HALTED，整批Win10仍NOT_PASS。

### 2026-10-05：R6准入与冻结通过

R6根、观察器重编、driver重启证据文件名修复及全部定向检查通过，4个revision stage PASS；普通入口待负责人启动，整批Win10仍NOT_PASS。见任务书同日条目。

### 2026-10-05：R6部分证据与入口HALTED

R6上Boot、Background短/完整、ready预期负例、Shell通过且观察器终态核对通过；EncodingSecurity遇conhost 87缺口，新proof因控制器父进程种类判断缺陷（NT设备路径与C:\\比较）未解析而硬停，入口HALTED（6/16）。观察器记录完整，真实回放得有效proof。其余五个phase未执行，整批Win10仍NOT_PASS。

### 2026-10-05：R7新根批准材料草案

[R7草案](plans/A9_31_R7_CONTROLLER_PARENT_KIND_REPAIR_APPROVAL.md)已形成，未批准；D1–D4待负责人裁决。预验证17项通过（真实R6缺口回放），R6入口HALTED，EncodingSecurity等五个phase未执行。

### 2026-10-05：R7合同批准

负责人批准[R7合同](plans/A9_31_R7_CONTROLLER_PARENT_KIND_REPAIR_APPROVAL.md)（SHA256 73646d58787a1fee7062a74bddfffb37114b1a7d4e816ed8cbb164d62ab5fa4e）及D1=A/D2/D3/D4；六源C14、观察器C15/C16、ADR-0175已在实施前登记。尚未实现、编译或部署，R6入口HALTED，整批Win10仍NOT_PASS。

### 2026-10-05：R7准入与冻结通过

R7根、观察器重编、控制器父进程种类修复及全部定向检查（含真实缺口回放16项）通过，4个revision stage PASS；普通入口待负责人启动，整批Win10仍NOT_PASS。见任务书同日条目。

### 2026-10-05：R7部分证据与入口HALTED

R7上EncodingSecurity、FailureBoundaries通过；StopExit三次：两次人工点击超过120秒限时判FAIL，第三次点击返回response=1（要求0）触发硬门，入口HALTED（5/16）。ReleaseExit、Recovery未执行，整批Win10仍NOT_PASS。

### 2026-10-05：R8新根批准材料草案

[R8草案](plans/A9_31_R8_EXIT_PHASES_AND_CLICK_PROTOCOL_APPROVAL.md)已形成，未批准；前置P1（腾空间）、P2（界面确认）与D1–D4待负责人。R7入口HALTED，StopExit/ReleaseExit/Recovery在最终字节上仍无通过记录。

### 2026-10-05：R8合同批准

负责人批准[R8合同r2](plans/A9_31_R8_EXIT_PHASES_AND_CLICK_PROTOCOL_APPROVAL.md)（SHA256 eb9b1c76e0b87fc8626ca14c8272ec6e7d2bce3ffa8e5a738586e45c8590e21b）及D1–D4；P1（空闲6.18GiB）、P2（按钮顺序）已满足。六源C14、观察器C15/C16、ADR-0176已在实施前登记。尚未实现、编译或部署，R7入口HALTED，整批Win10仍NOT_PASS。

### 2026-10-05：R8准入与冻结通过

R8根、观察器重编及全部定向检查通过（含真实缺口回放16项），4个revision stage PASS，控制脚本与R7仅差根/哈希绑定；普通入口待负责人启动，整批Win10仍NOT_PASS。

### 2026-10-05：R8开跑前复核请求已备

复核请求与只读验证脚本已落盘，等待Codex复核；R8入口未启动、无请求发出，整批Win10仍NOT_PASS。

### 2026-10-05：R8独立复核四项本地修复，冻结候选保持

Codex复核发现未登记点击脚本删除/覆盖、实际晚到日志未使用重启命名、验证脚本非只读及R7状态标签残留。负责人要求修复，按任务末尾/ADR-0177形成候选外`r8-review-repair-r1`五源；只读28、真实entry文件系统9、late-journal15、点击/冻结21项通过，R5–R8 5448文件哈希不变。首次只读Git检查失败保留；改为仅允许/dev/null字符设备后成功，不放开普通文件写入或网络。准确结果见[复核请求§6](reports/2026-10/a9_31_r8_pre_run_review_request_2026-10-05.md)。LOCAL_REPAIR_VERIFIED_NOT_DEPLOYED；原R8不开跑、不热替换，新版尚无Node16/Electron/PS5.1准入或远端绑定，不授权第九根。无远端连接/请求/删除/提交/推送，整批Win10仍NOT_PASS，DEVELOPER_VERIFIED/独立/Win7未签。

### 2026-10-05：Codex复核修复的独立核对

Codex四项发现均成立，修复本地验证通过但未应用；R8冻结结果状态字符串勘误（R7标签应读作R8，不改写原证据）；采用新driver需负责人修订R8范围。R8入口未启动，整批Win10仍NOT_PASS。

### 2026-10-05：R8 driver修订草案

[R8修订草案](plans/A9_31_R8_DRIVER_REVISION_AMENDMENT_APPROVAL.md)已形成，未批准；采用修复版driver、新normal-short revision挂在不变master下。R8入口未启动，整批Win10仍NOT_PASS。

### 2026-10-05：R8修订批准

负责人批准[R8修订](plans/A9_31_R8_DRIVER_REVISION_AMENDMENT_APPROVAL.md)（SHA256 5a928e2a22e47ac3b822acd164633f5f84f1609265999d02d27c2f8f09f46e6f）：采用修复版driver、仅新建normal-short新revision、三个phase统一normal-short。C14（driver-r1各文件）与ADR-0178已在实施前登记。尚未实现、部署，R8入口未启动，整批Win10仍NOT_PASS。

### 2026-10-05：R8 driver-r1实施完成，新normal-short revision准入通过

新revision `2d38064cb135c87d…`（driver `d1d05dc7…`）挂在不变master `0450ccc6…`下；Win10 Node16.17.1五行退出码0、schema336项0失败、完整闭包stage PASS；5448文件基线0差异；远端无dispatcher/请求，观察器0。C14实际路径与预登记差异已在任务书末尾勘误。R8入口未启动，整批Win10仍NOT_PASS。

### 2026-10-05：R8执行——StopExit/ReleaseExit PASS，Recovery HALTED，入口终止

driver-r1 revision `2d38064c…`下：StopExit（response 0，3.557秒）与ReleaseExit（response 1，3.28秒）各一次PASS，均完整取回并通过评审；Recovery真实崩溃重启首次执行，重启四项通过，`BACKGROUND_FACTS_ONLY`失败（期望`exited`，实际`cleanup_required`，`recoveryStatus=exited`）后failure stop超时，`dispatcher-final`=HALTED（`LIFECYCLE_PINNED_TREE_UNKNOWN`），入口终止。Recovery仅取回evidence/signals 33文件，无精确完整取回；遗留产品树仍存活，未处理。新conhost证明分支未被触发。整批Win10仍NOT_PASS，未在Win7实机验证。

### 2026-10-05：R8 Recovery完整取回完成

负责人关闭遗留产品树后（已直接核对进程不存在）完整取回88文件/9,484,576字节，逐SHA一致、秘密扫描0；与此前partial的evidence/signals逐文件相同。SQLite副本显示受管行`cleanup_required`（pid 35788）与未释放的工作区锁`main-16064`。关闭方式未记录。Recovery仍HALTED，整批Win10仍NOT_PASS，未在Win7实机验证。

### 2026-10-05：R8 遗留进程树关闭方式登记

负责人口述为“手动关闭的进程”，无对话框`response`或其他证据文件，不作为任何按钮/Esc的实测结果；发生在HALTED终态之后、完整取回之前。结论不变：Recovery HALTED，整批Win10 NOT_PASS。

### 2026-10-05：A9-31 Recovery裁决、R9批准实施与Recovery通过

负责人裁决R8 Recovery第13项为D1=C（driver预期有误，产品处置出口另立A9-34草案）；批准R9合同r2与修订（ADR-0179）。R9实施、准入（Node16 24行等全套）与冻结通过后，负责人启动入口，Recovery一个请求PASS并经`review-phase-r9.py`评审通过（保留清理未知语义，`normal_product_exit=BLOCKED_BY_DESIGN_NOT_PERFORMED`）。矩阵r8（事后补写）与r9、统一报告§12/§13已更新。跨根组合是否算整批Win10通过待负责人裁决；未在Win7实机验证。

### 2026-10-05：A9-31整批Win10跨根组合（ADR-0180）

R9入口经`stop.json`正常结束（dispatcher-final COMPLETED）。负责人裁决A9-34推迟到第二批之后、选B并批准跨根组合裁决r2；R5–R7已回收证据以原样评审脚本补跑正式评审10项全部通过，组合结论`WIN10_CROSS_ROOT_COMBINED_PASS_WITH_LIMITS`。限制：conhost证明分支未触发、Esc/取消未实测、Recovery仅保留未知语义、跨根等价为推断；DEVELOPER_VERIFIED/独立/Win7未签，未在Win7实机验证。

### 2026-10-06：A9-31 Shell Policy P1修复本地提交

Codex独立复核发现两项Shell审批漏报（P1），经r1–r6本地修复与多轮独立复核，按ADR-0184收敛标准收口；本地提交`8d207ab`（仅policy.ts与两测试文件，父ebda911），未推送。既有Win10证据绑定旧包，需新包重验；DEVELOPER_VERIFIED未登记，未在Win7实机验证。

### 2026-10-06：A9-31 r4 Win10重验R2准入冻结

R1根因取证组件构建记录绑定旧source停止；负责人批准修订（ADR-0187）后在新根R2同源重编取证组件（新DLL `3f45cc66…`），R9工具仅换绑定，准入全套与新增包内Policy检查（Node 16.17.1，ask 140/ordinary 238/dispatch 11）通过，四revision冻结PASS。准备阶段sync-current派生偏差已按R9流程更正并留痕。C3普通桌面重验待负责人启动入口；未在Win7实机验证。

### 2026-10-06：A9-31 r4 Win10单根通过

R2普通入口一次跑完10请求，全部首次通过正式评审，dispatcher自行COMPLETED；当前源`8d207ab`的Win10结论由跨根组合升级为`WIN10_SINGLE_ROOT_PASS`，conhost证明分支限制解除。剩余限制：A9-34推迟、Esc/取消未实测、Policy识别边界。DEVELOPER_VERIFIED待负责人裁决；未在Win7实机验证。

### 2026-10-06：A9-31 登记 DEVELOPER_VERIFIED

Codex对R2证据集聚焦只读复核P0/P1/P2=0/0/0（并补足派生文件反向换绑证明），按已批准登记材料登记`A9_31_DEVELOPER_VERIFIED`（ADR-0188），源码本地提交`8d207ab`未推送。已知限制：A9-34推迟、Esc/取消未实测、Policy识别边界、conhost仅cmd父分支。Win7/独立验收/Alpha2/RC不签发；未在Win7实机验证。

## A9-32 本地授权登记（2026-10-11）

负责人本轮直接实施指令登记 A9-32 APPROVED_FOR_IMPLEMENTATION、ADR-0152 Accepted。
隔离工作树从准确 `571ec550b5e09611f55557563d0cf2f1a4a40d1b` 创建。
四份合同哈希与交接一致；原主工作区及 A9-31 工作树未修改。
产品检查、真实 Electron、Win7 尚未执行；提交/推送/远端/冻结/门 A/B 未授权。

## A9-32 本地实现与准确增量检查（2026-10-11）

基线 `571ec550b5e09611f55557563d0cf2f1a4a40d1b`，12产品/测试文件未提交；State82/Core183/Shell125开发机PASS。
重启/去重、实际文件核查后新写、旧审批、失败/Stop、审计/预算与正常后台共存已检查。
生产页面六项为SURROGATE；真实Electron/打包/新源Win10/Win7和独立审核NOT_PERFORMED。
任务Gate不升级，完整Alpha2未裁决；A9-33仍草稿，具体准备见[报告](reports/2026-10/a9_32_local_implementation_and_batch2_readiness_2026-10-11.md)。
本轮没有提交/推送/远端/冻结/发布；ENGINEERING_02 HALTED保持。


## A9-32 独立复核修复与 r2 清单（2026-10-11）

执行代理仅在原隔离树修复 F1～F3。基线 `571ec550…` 与 26 文件未提交差异保持。
开发机 State84/Core212/Shell133、七模块编译 PASS。12 产品/测试文件集合 SHA-256 `d8cf72fbe590e01eab974a176a5ccd9c7f01071cc349c8375c7b2206bd291637`。
8 个反例全部为断言失败；原/恢复 SHA 相同，绑定最终 r2 清单。首次夹具编译、目录权限反例和注入编译失败保留。
F5 授权来源待负责人确认，不扩写 §6。真实 Electron、打包、新源 Win10、Win7、独立审核、完整 Alpha2 检查 NOT_PERFORMED。
Gate 保持 A9_32_IMPLEMENTATION_AUTHORIZED；未暂存、提交、推送、合并或改 PR。保护核查与准确待提交范围见[本轮报告](reports/2026-10/a9_32_local_implementation_and_batch2_readiness_2026-10-11.md)。

开发机文档与只读分析，绑定 d8fd760a…（2026-10-12）：[D1 生产者缺口](reports/2026-10/a9_33_producer_gap_analysis_2026-10-12.md)、[D2 批准请求](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#6-a9-33-批准请求包2026-10-12)、[D3 已知限制](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#71-已知限制后续再修2026-10-12)。A9-33 保持 DRAFT_READY_FOR_REVIEW。
[D4 独立审核交接](reports/2026-10/a9_32_independent_review_handoff_2026-10-12.md)、[D5 待裁决](reports/2026-10/a9_32_owner_decisions_2026-10-12.md)；F5/ADR-0189 待负责人确认，真实 Electron/Win10/Win7/指定独立审核 NOT_PERFORMED。

F5 授权来源确认（2026-10-12）：负责人在聊天中确认“我授权了A9-32”，按 D5 第 1 项选项 A 登记，见 [A9-32 §7.2](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#72-f5-授权来源确认2026-10-12)。
范围仍为 §6 的基线 `571ec550…` 与 §1–5 本地实现；不含提交、推送、合并、远端、下载、冻结、发布和门 A/B。Gate 保持 A9_32_IMPLEMENTATION_AUTHORIZED；ADR-0189 与 D5 第 2～6 项待裁决。

D5 第 3～6 项裁决（2026-10-12）：负责人在聊天中原话“第3到6项按推荐选A”。第 2 项（独立审核者）未裁决。
ADR-0189 保持原文，批准未来新增补充 ADR，编号整合前另行核对（[A9-32 §7.3](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#73-adr-0189-处理裁决2026-10-12)）。
A9-33 §6.1 的 20 个路径在 §1 前置满足后生效；不下载 Electron；目标值未提供，八项绑定清单见 [A9-33 §6.5](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#65-负责人裁决登记2026-10-12)。
A9-33 Status 与 Phase-Gate 不变；真实 Electron、Win10、Win7、独立审核均 NOT_PERFORMED。
补充（2026-10-12）：负责人对 Win7 目标回复“用候选”，登记 `dccs-chaizl@192.168.1.3`、普通账户 `agent`；实际身份执行前核验，NOT_PERFORMED。

F6/ENOTDIR 复核前修复与独立审核者（2026-10-12）：负责人在聊天中原话“A选，新开审核会话”。独立审核者为负责人另开的新审核会话，尚未启动。
修复见 [A9-32 §7.4](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#74-f6-与-enotdir-独立复核前修复2026-10-12) 和 ADR-0236：opaque 门只由已核验目录的 `list` 解除，ENOTDIR 按路径不存在处理。
开发机 State 84、Core 218、Shell 133 PASS，`verify:quick` 退出 0，两个反例断言失败并恢复同一 SHA。残余限制是无关目录的 `list` 仍可解除 opaque 门。真实 Electron、Win10、Win7 均 NOT_PERFORMED。
提交（2026-10-12，负责人授权“两个都提交”）：修复提交 `59a3f6507ecac3c0c89fdcd6fc9b8ef79ceba73c`，审核交接包重绑提交 `7504832a64d2ba879dcba436676c84ea5f0d9fc8`；均未推送、未合并。
审核清单 r3 的 SHA-256 为 `51ac0ca0…`。r4 的 4 个 Core 反例在修复提交上未重跑，NOT_PERFORMED。新审核会话由负责人启动，尚未启动。

独立审核结论登记（2026-10-12，负责人回复“B，补用例，登记并提交”）：负责人另开的 Claude Sonnet 5.5 会话对 `59a3f650…` 给出开发机 PASS，无阻断级发现，结论全文见[独立审核结论](reports/2026-10/a9_32_independent_review_conclusion_2026-10-12.md)（原文 SHA-256 `2843769f…`）。
发现 R-01～R-07；R-01 选 B 修复，R-03 补 3 个用例，R-04～R-07 登记为已知限制，见 [A9-32 §7.5](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#75-独立审核结论登记与-r-01-裁决2026-10-12)。不签 DEVELOPER_VERIFIED。真实 Electron、Win10、Win7 均 NOT_PERFORMED。

R-01 修复与 R-03 补用例（2026-10-12，工作树，未提交）：`getTaskRecovery` 对带 `residueRisk` 的副作用工具 `tool_end` 保留未知结果（ADR-0237，[A9-32 §7.6](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#76-r-01-修复与-r-03-补用例2026-10-12)）。
开发机（macOS，Node 20.17.0，基线 `62a73f78…` 加未提交差异）State 88、Core 221、Shell 134 PASS，`verify:quick`、`docs:check`、`git diff --check` 通过；4 个反例均由断言变红并恢复同一 SHA。`59a3f650…` 的 PASS 不覆盖本修复，须增量再审；不签 DEVELOPER_VERIFIED。真实 Electron、Win10、Win7 均 NOT_PERFORMED。

R-01 修复提交与 D4 重绑（2026-10-12）：负责人授权“A，提交这9个文件”后，修复提交为 `adb9d0f0a5a78dd6a82917a794d0930bff6ffa60`；负责人授权“重绑D4并提交”后，D4 交接包重绑提交为 `9dea138455430a17482dff3703708592cd0603d4`。均未推送、未合并。
上一条“工作树，未提交”是提交前的快照，以本条为准。复审范围 `59a3f650…..adb9d0f0…`，r4 清单 SHA-256 `d00d1123…`；D4 命令原文在全新归档上执行通过（开发机，Node 20.17.0）。增量复审由负责人另开会话执行，NOT_PERFORMED；不签 DEVELOPER_VERIFIED。真实 Electron、Win10、Win7 均 NOT_PERFORMED。


## A9-32 增量复审结论登记（2026-10-12）

执行代理按负责人提供的交接书登记，登记起点为 `codex/a9-32-explicit-continue` 的 `4667bb02…`。负责人原话：“R-08 和 R-09 登记为已知限制，不补”。
独立审核者是负责人另开的 Claude Sonnet 5.5 会话。结论为有发现项 PASS（开发机），绑定 `adb9d0f0…`，增量 `59a3f650…..adb9d0f0…`；未发现阻断、高、中级问题。
原文见[增量复审结论](reports/2026-10/a9_32_incremental_independent_review_conclusion_2026-10-12.md)，SHA-256 `561b23ce…`；逐文件核对的证据副本在 `.acceptance/a9-32-developer/independent-review-r2/`。
独立审核复算 `verify:quick` 退出 0，State 88、Core 221、Shell 134 项通过；26 个清单成员一致。41 个独立反例中 31 个变红、10 个存活，恢复 SHA 全部一致，核对点 a～e 全部 PASS。
R-01 修复与 R-03 的 3 个新增用例通过本次增量复审。R-08、R-09 仅登记为回归防护的已知限制，见 [A9-32 §7.7](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#77-增量复审结论与已知限制2026-10-12)。
执行代理本次只改登记文档与新增证据副本，不补用例、不改 Accepted ADR 正文、不签 DEVELOPER_VERIFIED。真实 Electron、打包、Win10、Win7 均 NOT_PERFORMED；未提交、推送或合并。

## A9-32 独立审核者追认（2026-10-12）

执行代理提出问题：是否追认负责人另开的 Claude Sonnet 5.5 会话为 A9-32 的独立审核者。负责人在聊天中回复“选A”，按 D5 第 2 项选项 A 登记。
追认对象是 [A9-32 §7.5](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#75-独立审核结论登记与-r-01-裁决2026-10-12) 对 `59a3f650…` 的审核，以及 [§7.7](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#77-增量复审结论与已知限制2026-10-12) 对 `adb9d0f0…` 的增量复审。证据层级为开发机。
追认不覆盖 A9-33 的技术独立复核者，不签 DEVELOPER_VERIFIED，不产生 Win10 或 Win7 结论。A9-33 §1 仍缺完整干净基线 SHA，§6.1 路径未生效。
登记位置：[A9-32 §7.8](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#78-独立审核者追认2026-10-12)、[A9-33 §6.5 补记](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#65-负责人裁决登记2026-10-12)、D5 第 2 项。执行代理只改文档；未提交、推送或合并。

## A9-32 DEVELOPER_VERIFIED 条件与 A9-33 前置修订（2026-10-12）

执行代理上报顺序矛盾：A9-32 §5 要求真实 Electron；D5 第 5 项把 Electron 取证放在新 Windows 包阶段；该包依赖 A9-33 §6.1 路径；A9-33 §1 又以 A9-32 开发机合同通过为 §6.1 生效前置。
负责人在聊天中回复“选C”。A9-32 不签 DEVELOPER_VERIFIED，Gate 保持 `A9_32_IMPLEMENTATION_AUTHORIZED`；§5 真实 Electron 要求不变，取证改在 §6.1 新增开发 Profile 所构建的包上。
A9-33 §1 对 A9-32 的前置改为“开发机检查与独立复核通过”。该部分已满足（开发机，`adb9d0f0…`，State 88 / Core 221 / Shell 134）。完整干净基线 SHA 未形成，§6.1 路径仍未生效。
登记位置：[A9-32 §7.9](tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#79-developer_verified-签发条件裁决2026-10-12)、[A9-33 §6.6](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#66-1-前置修订裁决2026-10-12)、[推进顺序 §6.5 补记](plans/A9_ALPHA2_DELIVERY_SEQUENCE.md#65-补记真实-electron-检查位置2026-10-12)。
未新增 ADR。执行代理只改文档；真实 Electron、Win10、Win7 均 NOT_PERFORMED；未提交、推送或合并。

## A9-32 基线登记与 A9-33 §6.1 生效（2026-10-12）

负责人对“完整干净基线 SHA 怎么定”回复“选A”。执行代理把 9 个未提交文档文件提交为 `152106f3efd41e5cb8aa6688a4fddc0df99db42a`（分支 `codex/a9-32-explicit-continue`，父 `4667bb02…`，未推送）。
提交后工作树干净；`adb9d0f0…` 到该提交的变更全部在 `docs/` 内，`src`、`scripts`、`release` 差异为空。证据层级为开发机。
按 A9-33 §6.5 的规则，前置满足后登记 A9-33 为 APPROVED_FOR_IMPLEMENTATION，Phase-Gate 为 A9_33_IMPLEMENTATION_AUTHORIZED，Source Baseline 为 `152106f3…`。
ADR-0155 仍为 Proposed，未被接受；增量矩阵尚未批准任何 INHERITED_EVIDENCE。A9-32 DEVELOPER_VERIFIED 仍未签。
A9-33 分支 `codex/a9-33-batch2-win7-acceptance` 尚未创建；A9-33 实现、构建、Win10、Win7 均 NOT_PERFORMED。登记位置：[A9-33 §6.7](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#67-基线登记与-61-生效2026-10-12)。

## A9-33 本地实现与开发机检查（2026-10-12）

执行代理按负责人“选A”在分支 `codex/a9-33-batch2-win7-acceptance`（HEAD `7e96f561…`，工作树未提交）实现 A9-33 §6.1 的 20 个路径。证据层级为开发机。
`node --test` 两个包测试文件 119 通过；shell jest 两个文件 73 通过；`npm run verify:quick`、`npm run docs:check`、`git diff --check` 通过。
驱动、冒烟、桌面控制器只在开发机用纯函数、假进程和回环 Provider 测过；真实 Electron、PowerShell、Win10、Win7 均 NOT_PERFORMED。
5 条断言按设计为 NOT_PERFORMED，阶段 p06、p07、p08 在负责人裁决前不能 PASS。新套件数据格式尚无 ADR，写入前须先核号。
`src/runner/dist` 被跟踪且落后于源码，`verify:quick` 会使其变脏；已还原。执行代理未提交、推送或合并，未创建 ADR，未冻结候选，未签关口 A 或 B。
登记位置：[A9-33 §6.8](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#68-本地实现进展2026-10-12)。

## A9-33 合同收窄与驱动补全（2026-10-12）

负责人回复“同意，独立复核者是codex”：放宽两条文档限制（缩小合同；A9-32 §5 真实 Electron 取证可由首次 Win7 预演取得），保留另外 7 条，指定 codex 为 A9-33 技术独立复核者。
合同由 27 用例、45 断言、53 个证据文件收窄为 25 用例、42 断言、51 个证据文件；B2-CONT-02 与 B2-SAFE-01 移为已知限制。证据层级为开发机，绑定分支 `codex/a9-33-batch2-win7-acceptance`，实现提交 `905bf760…`（父 `7e96f561…`，本地，未推送）。
驱动新增 `continue_guards`、`continue_mode_guard` 两个模式，补全 B2-CONT-03 第 2 条与 B2-UI-01 九个子项，并修正套件自身三处缺陷（空闲判断、滚动容器、继续后请求基线）。
`node --test` 两个包测试文件 119 通过；shell jest 两个文件 78 通过；`npm run verify:quick`、`npm run docs:check`、`git diff --check` 通过；用驱动自己的写入函数对真实运行时（Node）核对了错误码与阻断原因。
驱动、冒烟、桌面控制器仍未在 Electron、PowerShell、Win10、Win7 运行。负责人选 A 授权本地提交；执行代理未推送或合并，未创建 ADR，未冻结候选，未签关口 A 或 B。
登记位置：[A9-33 §6.9](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#69-负责人裁决登记与合同收窄2026-10-12)。

## A9-33 codex 第一阶段复核与修复轮（2026-10-13）

codex 对实现提交 `905bf760…` 的第一阶段复核结论：不建议进入预演授权评审，0 个 P0、8 组 P1、3 组 P2，路径白名单无越界。执行代理逐条对照源码，确认全部属实。
负责人选 A：开修复轮并确认 P1-6 收窄（退出码只记直接启动的产品进程，子孙进程按创建时间核对缺席，退出前树为空或未观察记 UNKNOWN）。
执行代理在 §6.1 的 20 个路径内修复全部 11 组发现并补回归用例；修复未提交，复核者尚未重审。证据层级为开发机，绑定未提交工作树（基线 `d027af7d…`）。
驱动、冒烟、桌面控制器仍未在 Electron、PowerShell、Win10、Win7 运行；未在 Win7 实机验证。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。
负责人对“怎样落到分支”选 A，草案并入文档提交，并同意提交后重跑 codex 第一阶段。修复已提交为 `8c16ffd9…`（父 `d027af7d…`，9 个文件，+574/−56，本地，未推送）；开发机整体重跑 `node --test` 119 通过、shell jest 94 通过、`verify:quick` 与 `docs:check` 通过。
新交接包 [第二轮](reports/2026-10/a9_33_independent_review_handoff_stage1_rerun_2026-10-13.md)绑定 `8c16ffd9…`，命令在全新克隆实测一次通过。codex 第二轮结果登记前，结论仍为“修复未经独立重审”。
登记位置：[A9-33 §6.10](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#610-codex-第一阶段复核与修复轮2026-10-13)。

## A9-33 codex 第一阶段第二轮复核与第二修复轮（2026-10-13）

codex 对修复提交 `8c16ffd9…` 的第二轮复核结论：不建议进入预演授权评审，0 个 P0、4 组 P1、2 组 P2；第一轮 11 组中 5 组关闭、6 组部分关闭。执行代理逐条对照源码，确认 R1～R6 全部属实。
负责人选 A，开第二修复轮：执行代理在 §6.1 的 20 个路径内修复全部 6 组并补回归用例，修复已提交为 `0c163c24…`（父 `46bce3a0…`，7 个文件，+235/−43，本地，未推送）。
开发机整体重跑：`node --test` 120 通过、shell jest 100 通过、`verify:quick` 通过、`docs:check` 328 个文件通过，8 项变异全部被杀死并还原。
交接包第二轮 §4.8 把 B2-UI-02 注入行写成“用后清理”，该写法有误：驱动只关闭数据库，注入行留在一次性数据根。任务书 §6.11 已更正。
codex 沙箱的 6 项 jest 失败均为回环监听被拒（`EPERM`），不是产品缺陷。第三轮交接包绑定 `0c163c24…`，复核者尚未重审。
驱动、冒烟、桌面控制器仍未在 Electron、PowerShell、Win10、Win7 运行；未在 Win7 实机验证。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。
登记位置：[A9-33 §6.11](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#611-codex-第一阶段第二轮复核与第二修复轮2026-10-13)。

## A9-33 codex 第一阶段第三轮复核与第三修复轮（2026-10-13）

codex 对第二修复提交 `0c163c24…` 的第三轮复核结论：不建议进入预演授权评审，0 个 P0、2 个 P1、1 个 P2；第一轮 11 组中 9 组关闭、2 组部分关闭，第二轮 R1～R6 中 4 组关闭、2 组部分关闭。执行代理逐条对照源码，确认 3 项发现全部属实。
负责人选 A，开第三修复轮：执行代理在 §6.1 的 20 个路径内修复全部 3 项并补回归用例，修复已提交为 `cde53348…`（父 `beac36a4…`，4 个文件，+111/−11，本地，未推送）。
开发机整体重跑：`node --test` 120 通过、shell jest 101 通过、`verify:quick` 通过、`docs:check` 329 个文件通过，7 项变异全部被杀死并还原。
codex 沙箱的 6 项 jest 失败均为回环监听被拒（`EPERM`），不是产品缺陷；codex 没有用执行代理的通过结果补签。第四轮交接包绑定 `cde53348…`，复核者尚未重审。
驱动、冒烟、桌面控制器仍未在 Electron、PowerShell、Win10、Win7 运行；未在 Win7 实机验证。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。
登记位置：[A9-33 §6.12](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#612-codex-第一阶段第三轮复核与第三修复轮2026-10-13)。

## A9-33 第一段独立复核终局与负责人例外裁决（2026-10-13）

codex 对第三修复提交 `cde53348…` 的第四轮复核结论：不建议进入预演授权评审，0 个 P0、0 个 P1、2 个 P2。第三轮的 N1、N2 原反例已关闭，21 项变异全部被拦住。执行代理用只读探针复现了两项 P2，确认属实。
负责人回复“把这两项登记为已知限制，不再修，直接进入预演授权评审”：两项登记为 KL-1（失败进程列表末列截断）与 KL-2（令牌跨帧增长误报），源码停在 `cde53348…`。第一段独立复核未通过，该例外由负责人裁决，不改写 codex 结论。
预演授权未授予：批准材料 Q1～Q4 与 Win7 机器名待负责人作答。第二、三段独立复核保持。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。
真实 Electron、PowerShell、Win10、Win7 均 NOT_PERFORMED；未在 Win7 实机验证。
登记位置：[A9-33 §6.13](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#613-第一段独立复核终局与负责人例外裁决2026-10-13)。

## A9-33 预演批准材料裁决（2026-10-13）

负责人对批准材料草案作答：Q1 选 A，Q2 选 B，Q3 选 A，Q4 选 A，并同意把 §6.13、§6.14 的文档改动做成只改 `docs/` 的本地提交（不推送）。
预演授权未授予：Win7 机器名为 `UNKNOWN`，普通账户是否仍为 `agent` 待确认，时间窗起点待确认。执行代理不自行取得机器名并自行批准。
三个本地构建输入（Electron ZIP、存储 ZIP、运行器 ZIP）的 SHA-256 已与输入锁核对一致，未构建，无需下载。
真实 Electron、PowerShell、Win10、Win7 均 NOT_PERFORMED；未在 Win7 实机验证。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。
登记位置：[A9-33 §6.14](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#614-预演批准材料裁决2026-10-13)、[批准材料草案 §3A](plans/A9_33_REHEARSAL_AND_EXECUTION_APPROVAL_DRAFT.md#3a-负责人裁决2026-10-13)。

## A9-33 Win7 只读预检（2026-10-13）

负责人回复“选B，授权只读预检，agent确认，时间窗从授权补齐当日起”。执行代理于 08:12:32Z 经一次 SSH 会话只读执行 `hostname`、`query user`、`ver`，未写文件、未改设置、未创建任务。
读得：机器名 `dccs-chaizl-PC`；系统 6.1.7601；`agent` 在控制台会话 2，状态运行中，空闲 13 天以上；锁屏或屏保状态 UNKNOWN。
预演授权仍未授予：机器名须由负责人确认为批准值，`agent` 的 SID 须再经一次只读核验。时间窗从补齐当日起算，窗口尚未开始。
证据层级 Win7 实机，仅只读观察，不是验收证据。Win7 验收、预演、正式执行均 NOT_PERFORMED。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。
登记位置：[A9-33 §6.15](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#615-win7-只读预检与时间窗起点2026-10-13)。

## A9-33 目标绑定补齐与时间窗开始（2026-10-13）

负责人确认机器名 `dccs-chaizl-PC` 为批准值，授权只读核验 `agent` 的 SID，并同意提交文档。执行代理 08:15:22Z 经一次 SSH 会话只读读得 `agent` 为本地账户，SID `S-1-5-21-1708701742-428676696-1831205153-1001`；同一查询约 08:15:07Z 的首次执行因开发机侧管道命令写错丢失输出，已重复取得。
目标绑定补齐，预演时间窗于 2026-10-13T08:15:22Z 开始，至 2026-10-16T06:59:59Z 止（连续 3 个日历日，按开发机系统时区 PDT 计）。预算沿用最多 4 次预演、≤64 请求、≤8 小时。
写入类远端动作仍须先有负责人对预演授权文件 SHA-256 的同意；该文件尚未生成。预演、正式执行、Win7 验收均 NOT_PERFORMED；未在 Win7 实机验证。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。
登记位置：[A9-33 §6.16](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#616-目标绑定补齐与时间窗开始2026-10-13)。

## A9-33 预演 1 与 p03 修复（2026-10-13）

负责人批准预演授权文件（SHA-256 前缀 `4b566715…`）。执行代理按 R1～R8 闭集动作在 Win7 完成预演 1：R2 建根 08:29:12Z，R3 传输 10 个文件并两端复算一致，R4 展开 800 个文件，R5 每阶段注册、COM 回读、运行、删除一次性任务。
结果：p01 PASS（5/5），p02 PASS（4/4），p03 FAIL（`PHASE_RESULT_MISSING`），p04～p10 NOT_PERFORMED。根因：冒烟脚本复制 `default_app.asar` 时被 Electron 的 asar 虚拟化拦截，WIN7-42 冒烟脚本的 `process.noAsar = true;` 在本批漏了。修复 `5499843…`（2 个文件，+45 行，含 2 个契约用例，去掉修复后用例变红）已本地提交，未推送。
Win7 现状：三个任务已删除，进程表 104 行无残留，运行根 `C:\A9-W43\run\0f3591ba` 保留。证据取回 20/102 个文件，82 个运行时副本只留 Win7 端哈希清单。预算：预演 1/4，请求 3/64。
负责人同意提交修复并构建预演 2。预演 2 使用新运行编号与新运行根，须另有负责人对新授权文件 SHA-256 的同意。证据层级 Win7 实机（预演，非验收证据）；修复在真实 Electron 上是否生效 `UNKNOWN`；正式执行、Win10、Win7 验收均 NOT_PERFORMED。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。
登记位置：[A9-33 §6.17](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#617-预演-1-执行记录与-p03-修复2026-10-13)。

## A9-33 预演 2 与 p03 两项失败的修复（2026-10-13）

负责人批准预演 2 授权文件（SHA-256 前缀 `b05f72a1…`）。执行代理按 R1～R8 闭集动作在 Win7 完成预演 2：R2 建根 10:52:51Z，R3 传输 11 个文件并两端复算一致，R4 展开 800 个文件，R5 每阶段注册、COM 回读、运行、删除一次性任务。
结果：p01 PASS（5/5），p02 PASS（4/4），p03 FAIL（`DRIVER_CHAIN_EXIT_FAILED`，12 个断言 8 个 PASS、4 个 FAIL），p04～p10 NOT_PERFORMED。预演 1 的 `process.noAsar` 修复在 Win7 上生效；B2-CH-01、B2-CH-03、B2-CH-04、B2-CH-05 全部 PASS。
两个失败都在验收套件。B2-CH-02：观测循环在“6 帧或 Turn 结束”时停止，Turn 在 `tool_end` 后 13 ms 结束，第一帧晚 451 ms 落库，循环以 0 帧结束（根因已确认）。B2-CH-06：控制器的 UI Automation 30 秒内找不到退出对话框按钮，产品等待 150 秒后被终止（根因 `UNKNOWN`，原实现未留窗口树）。
修复 `9820934c…`（5 个文件，+280/−26，含 3 个契约用例，4 项变异各被拦住）已本地提交，未推送：观测规则改为 Turn 结束须满 8 秒才计、夹具取 30 个 tick、`ClickDialog` 先 Win32 按钮点击再 UI Automation、未找到时输出窗口树。开发机：`node --test` 120 通过、两个 shell 测试文件 106 通过、`verify:quick` 通过。控制器的 PowerShell 与内联 C# 未在任何 Windows 上运行。
Win7 现状：三个任务已删除，进程表 102 行无 `electron`、`spike02`、`node` 残留，运行根 `C:\A9-W43\run\d254bfcb` 保留。证据取回 54/153 个文件，其余 99 个运行时副本只留 Win7 端哈希清单。预算：预演 2/4，请求 6/64。
负责人同意提交修复并构建预演 3。预演 3 使用新运行编号与新运行根，须另有负责人对新授权文件 SHA-256 的同意。证据层级 Win7 实机（预演，非验收证据）；Win32 点击能否命中 Electron 对话框 `UNKNOWN`；正式执行、Win10、Win7 验收均 NOT_PERFORMED。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。
登记位置：[A9-33 §6.18](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#618-预演-2-执行记录与-p03-两项失败的修复2026-10-13)。

## A9-33 预演 3 与 p03 两项剩余失败（2026-10-13）

负责人批准预演 3 授权文件（SHA-256 前缀 `d66d8bd5…`）。执行代理按 R1～R8 闭集动作在 Win7 完成预演 3：R3 传输时 ZIP 经 scp 三次中断，改用 sftp 续传，11 个文件两端复算一致；R4 展开 800 个文件；R5 每阶段注册、COM 回读、运行、删除一次性任务。
结果：p01 PASS（5/5），p02 PASS（4/4），p03 FAIL（`ASSERTION_FAILED`，12 个断言 10 个 PASS、2 个 FAIL），p04～p10 NOT_PERFORMED。预演 2 的两项修复在 Win7 上生效：B2-CH-02-A02 PASS（frames=6），退出对话框点击成功（Win32 路径，产品退出码 0）。
B2-CH-06-A02：`finishChainEvidence` 把冒烟脚本自身的 `electron.exe` 算作残留（residue=1，survivors=0，R8 无 `electron`）。修复：排除 `ctx.pid` 与父进程，新增 1 个契约用例（无修复时失败）。pid 7300 即冒烟脚本自身是推断，`UNKNOWN`，下次运行的 `own_pids_excluded` 可确认。
B2-CH-02-A01：产品界面在 Turn 结束后不显示后台输出。11 次采样 IPC 快照帧数 0→6，界面 DOM 始终 0；渲染层只在提交的 Turn 内轮询快照，主进程推送通道只转发 `task.event`。不在 §6.1 路径内。负责人对“预演 3 报告”选 B：登记已知限制 KL-3，A01 收窄为“输出已落库并出现在 IPC 快照”，界面帧数只记录不判；B2-S01 仍查 Turn 内的界面显示；产品不改。该断言在预演 2、3 各失败一次，执行代理暂停 Win7 动作到裁决为止。
两项修复提交为 `83e03bf6…`（本地，未推送；4 个文件，+77/−8，仅 §6.1 路径）。开发机：契约 jest 65 通过，`node --test` 120 通过，`verify:quick` 通过，两个 shell 测试文件 108 通过；A01 评估器 4 项变异各被拦住。未在 Win7 实机验证。
Win7 现状：任务已删除，进程表 103 行无 `electron`、`spike02`、`node` 残留，运行根 `C:\A9-W43\run\79a32916` 保留。预算：预演 3/4，请求 9/64。证据层级 Win7 实机（预演，非验收证据）；正式执行、Win10、Win7 验收均 NOT_PERFORMED。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。
登记位置：[A9-33 §6.19](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#619-预演-3-执行记录与-p03-两项剩余失败2026-10-13)。

## A9-33 预演 4 与套件修复轮（2026-10-13）

负责人批准预演 4 授权文件（SHA-256 前缀 `517894f7…`）。执行代理按 R1～R8 闭集动作在 Win7 完成预演 4：ZIP 经 sftp 上传 38 分钟（含一次脚本误覆盖重传，已披露），Win7 端 `certutil` 复算 11 个文件与开发机逐项一致。
结果：p01 PASS（5/5），p02 PASS（4/4），p03 PASS（12/12），p04、p05、p06 FAIL，p07 被套件守卫拒绝，p08～p10 NOT_PERFORMED。预演 3 的两项修复在 Win7 上生效（B2-CH-06-A02 的 `own_pids_excluded=[7364,6608]`、`residue=[]`；B2-CH-02-A01 收窄后 PASS，`dom_frames_max=0`，KL-3 再现）。
已确认的套件缺陷 3 项：p04 的 `canStop` 竞态；B2-BG-01 与 B2-BG-02 的判据没有解析转义 JSON 的 `data.result`（产品行为正确）。原因 `UNKNOWN` 的 3 项：B2-BG-03 残留 1 项、B2-S06 刷新后 2 次与重启后 0 次、p05 的 `in_job` 偶发拒绝。B2-CONT-03 的 `mode_diagnostics` 从代码确认是顺序缺陷：产品只在启动时读一次模式文件。
负责人答复预演 4 报告：放宽到预演 5 次、8 小时自 14:33:16Z 重新计时（到 22:33:16Z）；修复轮选 B。修复提交 `f672f518…`（本地，未推送；5 个文件，+382/−48，仅 §6.1 路径）修 3 项缺陷、为 3 项 UNKNOWN 补诊断字段，并修正 p08 布局探针的窗格切换；负责人同意 B2-S06（改在实时输出块内计数）与 B2-UI-02（抽屉打开的行判关闭控件）两项判定范围调整。开发机：契约 jest 73 通过，`node --test` 120 通过，`verify:quick` 通过，6 项变异各被拦住。未在 Win7 实机验证。
Win7 现状：任务已删除，进程表 102 行无 `electron`、`spike02`、`node`、`powershell`、`wmic`，运行根 `C:\A9-W43\run\dbd8df63` 保留。预算：预演 4/5，请求 15/64。证据层级 Win7 实机（预演，非验收证据）；正式执行、Win10、Win7 验收均 NOT_PERFORMED。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。
登记位置：[A9-33 §6.20](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#620-预演-4-执行记录与套件修复轮2026-10-13)。

## A9-33 预演 5（2026-10-13）

负责人批准预演 5 授权文件（SHA-256 前缀 `72eb3b3d…`）。执行代理按 R1～R8 闭集动作在 Win7 完成预演 5：ZIP 经 sftp 一次 `put` 上传 68 秒，Win7 端 `certutil` 复算 11 个文件与开发机逐项一致，展开 800 个文件。
结果：p01 PASS（5/5），p02 PASS（4/4），p03 FAIL（`DRIVER_CHAIN_A_FAILED`，2 个断言 PASS、10 个 NOT_PERFORMED），p04～p10 因前置 p03 未通过为 NOT_PERFORMED。账本 3 个请求，没有重试，没有绕过守卫，同类失败 0 次，KL-1、KL-2 无触发迹象。
根因是套件缺陷：预演 4 修复轮新加的 `submit` 等待要求发送键可用，渲染层要求输入框非空，所以在输入文字之前等待不可能结束（30 秒后 `TIMEOUT:composer ready`）。契约测试只比对源码字符串并把该写法固定为期望，开发机未发现。影响 p03～p08 的 16 处提交。超时时刻的页面状态没有记录，该状态 UNKNOWN。
开发机修复已本地提交为 `a4816779…`（2 个文件，仅 §6.1 路径，未推送）：`submit` 改为“等输入框打开、输入、等发送键可用、点击”，超时消息带页面状态；新测试在 vm 中运行真实渲染层的输入框逻辑，旧写法的变异使 3 项测试失败。`node --test` 120 通过，`verify:quick` 通过，jest 120 通过。未在 Win7 实机验证。
Win7 现状：R7 取回 122 个文件，0 个哈希不一致；R8 进程表 104 行无 `electron`、`spike02`、`node`、`powershell`，无 A9W43 任务，运行根 `C:\A9-W43\run\82f275a9` 与旧根保留。预算：预演 5/5 已用完，请求 18/64。证据层级 Win7 实机（预演，非验收证据）；正式执行、Win10、Win7 验收均 NOT_PERFORMED。执行代理未提交、推送、合并、冻结候选或签关口 A、B，未创建 ADR。负责人回复“同意”：放宽到预演 6（最后一次，总请求仍 ≤64），并同意提交修复与文档；该回复没有重述 8 小时计时，原上限 22:33:16Z 已到期，计时规则待负责人裁决，裁决前不做写类 Win7 动作。
登记位置：[A9-33 §6.21](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#621-预演-5-执行记录与-p03-提交等待缺陷2026-10-13)、[§6.22](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#622-预演-6-放宽与计时矛盾2026-10-13)。

## A9-33 预演 6 与第 7 次预演放宽（2026-10-14）

负责人批准预演 6 授权文件（SHA-256 前缀 `0b4ad365…`），8 小时计时按“用已有做法，规则最少变动”自批准时刻起算。执行代理按 R1～R8 闭集动作在 Win7 完成预演 6：ZIP 经 sftp 一次 `put` 上传，Win7 端 `certutil` 复算 11 个文件与开发机逐项一致，展开 800 个文件。
结果：p01 PASS（5/5），p02 PASS（4/4），p03 PASS（12/12），p04 FAIL（`ASSERTION_FAILED`），p05 FAIL（`ASSERTION_FAILED`），p06～p10 NOT_PERFORMED。账本 5 个请求，没有重试，没有绕过守卫；p04、p05 连续两次同类失败，套件守卫会拒绝 p06，执行代理暂停。KL-1、KL-2 无触发迹象；KL-3 在 p03 再现。
失败分类：S03T、S04、S05-A01、S05-A02 是套件缺陷，已由代码和证据确认（含数据库中的 `outcome=stuck`）；S06 重启原因 UNKNOWN。产品在审计硬停止、编码、脱敏上的行为被这些缺陷遮蔽，UNKNOWN。
Win7 现状：R7 取回 150 个文件，0 个哈希不一致；R8 进程表 104 行无残留进程；运行根 `C:\A9-W43\run\37632497` 与旧根保留。R8 任务核验：原查询命令写错没有返回列表，预演 5 的同类记录缺任务列表，已补做 COM 只读核验，名称以 A9W43 开头的任务 0 个。预算：预演 6/7，请求 23/64。证据层级 Win7 实机（预演，非验收证据）；正式执行、Win10、Win7 验收均 NOT_PERFORMED。
负责人回复“选A”：放宽到第 7 次预演（最后一次，总请求仍 ≤64），开修复轮，修复结果发 codex 复核（gpt-6.1-sol、xhigh、非 fast）。开发机修复已本地提交为 `2c06317c…`（3 个文件，+296/−12，仅 §6.1 路径，未推送）：`node --test` 120 通过，`verify:quick` 通过，jest 136 通过，8 项变异各被拦住；交接包命令在全新目录实测通过。未在 Win7 实机验证。codex 复核于 2026-10-14T01:23:58Z 启动，结果待登记。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。
登记位置：[A9-33 §6.23](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#623-预演-6-执行记录第-7-次预演放宽与套件修复轮2026-10-14)。

## A9-33 codex 复核第 1 轮与第二修复轮（2026-10-14）

codex 复核 `2c06317c…`（gpt-6.1-sol，xhigh，非 fast；01:23:58Z 启动，01:57:11Z 完成，退出码 0）：0 个 P0、1 个 P1、4 个 P2，结论不建议进入预演 7 授权评审。执行代理逐条对源码核实，5 条全部成立。证据层级开发机；读取预演 6 数据库为 Win7 实机（预演，非验收证据）。报告归档在 `.acceptance/a9-33-review/codex-stage2-round1-20261014/`（95 个文件，哈希复核 0 个不一致）。
发现：R1（P1）后续驱动进程见到 Provider 已配置就不再录入密钥，产品没有已知秘密，S05 脱敏未被检验，Win7 p04 库事件 129、130、134 含测试密钥；R2 事件窗口基线；R3 侧栏行前缀匹配；R4 测试桩恒返回第一次轮询；R5 UTF-8 夹具切点落在 ASCII 字节（执行代理另核实 crlf 切点也不在 CR 与 LF 之间）。
负责人回复“选A，开第二修复轮，修复结果发送给codex复审”。开发机修复已本地提交为 `9dd3b165…`（父 `2c06317c…`，3 个文件，+424/−54，仅 §6.1 路径，未推送，产品代码未改）。R1 的密钥重录入只在 `streamLimits` 启用，原因见 §6.24 的范围决定。`node --test` 120 通过，`verify:quick` 通过，jest 172 通过（contract 129、package-runtime 43），24 项变异 23 项被拦住，存活的 D16 是冗余保护；交接包命令在全新目录整体实测通过（397 秒）。未在 Win7 实机验证。
codex 第 2 轮复审（02:31:30Z 启动，03:04:48Z 完成，退出码 0）：0 个 P0、0 个 P1、2 个 P2，R1～R5 原问题在开发机范围已关闭，不建议在 `9dd3b165…` 上进入预演 7 授权评审。N1：驱动点击应用后只等页面文字 `tool_calling` 和密钥可用，两者都不绑定本次应用结束，驱动在配置与探测完成前返回；N2：新 Provider 测试桩不执行表单代码，删除 `.click()` 的变异存活。执行代理核实两条成立。报告归档在 `.acceptance/a9-33-review/codex-stage2-round2-20261014/`（137 个文件，哈希复核 0 个不一致）。
负责人回复“选A，开第三修复轮，修复结果发送给codex复审”。开发机修复已本地提交为 `6679ef30…`（父 `9dd3b165…`，2 个文件，+154/−30，仅 §6.1 路径，未推送，产品代码未改）：N1 点击后等应用按钮释放再核对探测文字与密钥；N2 测试桩改为执行驱动真实语句的小型 DOM；R2 目标 Turn 在轮询间保留。`node --test` 120 通过，`verify:quick` 通过，jest 180 通过（contract 137、package-runtime 43），32 项变异 31 项被拦住，存活的 E6 判定为等价；交接包命令在全新目录整体实测通过（382 秒）。未在 Win7 实机验证。codex 第 3 轮复审（03:54:56Z 启动，04:24:06Z 完成，退出码 0）：0 个 P0、0 个 P1、1 个 P2，N2 与 R2 目标 Turn 保持在开发机关闭，N1 部分关闭，不建议在 `6679ef30…` 上进入预演 7 授权评审。N1 残余：`refreshSnapshot` 失败时返回 `null`，`applyProvider` 不检查而释放按钮，驱动只看按钮、表单错误和页面探测文字，会接受重启恢复的旧成功文字；执行代理读源码核实成立。codex 另报告 D16 不是无条件等价（缺动态行漂移用例）。报告归档在 `.acceptance/a9-33-review/codex-stage2-round3-20261014/`（167 个文件，哈希复核 0 个不一致）。负责人回复“B”（登记为已知限制，不再修，直接进入预演 7 授权评审）：N1 残余登记为 KL-4，不开第四修复轮，codex 不做第 4 轮复审；D16、A3、A4 与 `T:2122` 桩列为未修的覆盖缺口。预演 7 未授权、未构建；预算预演 6/7，请求 23/64。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。登记位置：[A9-33 §6.24](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#624-codex-复核第-1-轮结果与第二修复轮2026-10-14)。预算：预演 6/7，请求 23/64；预演 7 未授权、未构建。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。
登记位置：[A9-33 §6.24](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#624-codex-复核第-1-轮结果与第二修复轮2026-10-14)。

## A9-33 预演 7 执行记录（2026-10-14）

结论：预演 7 在 Win7 实机完成，p01、p02、p03、p05、p06 通过，p04、p07、p08 各有失败的断言，p09、p10 `NOT_PERFORMED`，预演预算 7/7 耗尽。证据层级 Win7 实机（预演，`REHEARSAL_NOT_ELIGIBLE`），绑定源提交 `0722df00…`、ZIP `9ce89f06…`、授权文件 `caf9a83c…`、运行编号 `16f6af76`。
负责人先回复“选A，同意提交文档并构建预演7包”，执行代理本地提交文档 `0722df00…`（7 个文件，未推送）并构建预演 7 包；再回复“批准，授权文件 SHA-256 caf9a83c… 同意，开始预演7”（执行代理 05:40:39Z 首次读到），8 小时按既有做法重新计时，截止 13:40:39Z。Win7 动作 R1～R8 在 05:41:26Z～05:51:55Z 完成；R3 的 11 个文件哈希与开发机逐项相同；R7 取回 230 个文件，0 个不一致；R8 无残留进程，无 `A9W43*` 计划任务。
失败三项：p04 的 S04 utf16le、cp936（产品输出 `A9_OUTPUT_ENCODING_ERROR`，PowerShell 下解码器是严格 UTF-8，与切点无关）；p07 的 B2-SAFE-02（注入审计写失败后产品停止派发，但 Turn 行仍为 active，无失败标记）；p08 的 B2-UI-01 两项（第一次 Enter 无响应）。合同与产品不一致 2 条，等负责人裁决。预演 6 的四项套件缺陷在 Win7 上不再出现；R1 的密钥重录入在 Win7 上生效，p04 库内无 `sk-TESTONLY`。p09、p10 从未在 Win7 运行。
预算：预演 7/7；请求 31/64；窗口至 2026-10-16T06:59:59Z。执行代理未推送、合并、冻结候选或签关口 A、B，未创建 ADR。
登记位置：[A9-33 §6.25](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#625-预演-7-执行记录2026-10-14)。

## A9-33 预演 7 失败分类（2026-10-14，开发机只读）

结论：B2-UI-01 归为套件缺陷，B2-SAFE-02 归为套件判据过窄，B2-S04 归为合同与产品不一致。
证据层级为开发机，绑定提交 `09fd4772…`；执行代理没有访问 Win7，没有改套件代码。
B2-UI-01：IPC 日志在第一次 Enter 后 9.96 秒内没有任何调用，产品点击处理是同步的，渲染层没有拦截 Enter，所以点击没有发生；Enter 未送达的原因（char 事件文本或焦点）`UNKNOWN`。
B2-SAFE-02：`a9.turn.submit` 两次返回 `A9_AUDIT_PERSISTENCE_FAILED`，无新 Provider 请求；驱动判据在 `outcome_json` 与页面文字里找错误码，没有读 IPC 返回值。Turn 行停在 `active` 记为产品观察。
处置选项 U-A、U-B、S-A、S-B、S-C、E-A、E-B 与 S04 收窄草案（KL-5）等负责人裁决；未开修复轮，未提交。
登记位置：[A9-33 §6.26](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#626-预演-7-失败分类2026-10-14开发机只读)。

## A9-33 第四修复轮裁决（2026-10-14）

结论：负责人回复“批准”，批准 U-A、S-A、E-A，开第四修复轮，修复送 codex 复审，提交 4 个分类文档，登记 KL-5。
证据层级为开发机，绑定提交 `09fd4772…`。预演 8 的预算放宽、授权文件、构建与 Win7 动作不在本裁决内，预算仍是 7/7 耗尽。
登记位置：[A9-33 §6.27](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#627-第四修复轮裁决与-kl-52026-10-14)。

## A9-33 第四修复轮的 codex 复核（2026-10-14）

结论：codex 对 `1a2b2783…` 报告 0 个 P0、1 个 P1、1 个 P2，不建议进入预演 8 的授权评审；两条发现经执行代理复现成立，都是套件判据误通过。
证据层级为开发机。N1（P1）：B2-SAFE-02 不约束首轮请求数，也不要求第二次提交到达 IPC。N2（P2）：额外 Enter 与 Space 未到达页面时，重复派发检查仍可 PASS。另有 3 个闭包级变异存活。
同时更正 §6.26：产品侧原因不能说“已排除”，点击处理的静默提前返回守卫仍是一条未排除路径。
第一次 codex 运行因模型容量失败，无报告，重试后完成。修复建议等负责人裁决，未实施。
登记位置：[A9-33 §6.28](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#628-第四修复轮的-codex-复核2026-10-14)。

## A9-33 第五修复轮裁决（2026-10-14）

结论：负责人回复“选A，开第五修复轮并提交这些文档”，批准第五修复轮（N1、N2、U-A 加固、闭包级用例）并提交 §6.28 相关文档。
证据层级为开发机，绑定提交 `1a2b2783…`。预演 8 的预算放宽、授权文件、构建与 Win7 动作不在本裁决内，预算仍是 7/7 耗尽。
登记位置：[A9-33 §6.29](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#629-第五修复轮裁决2026-10-14)。

## A9-33 第五修复轮实现与 codex 第 5 轮复核（2026-10-14）

结论：第五修复轮已提交（`c8d9113b…`，只改 2 个套件文件），codex 复核 0 个 P0、2 个 P1、2 个 P2，不建议进入预演 8 的授权评审。
证据层级为开发机，绑定提交 `c8d9113b…`。P1 两条（B2-S03T、重启检查）是既有判据在必要事实缺失时仍给 PASS；P2 两条（额外键门槛遮住重复继续、首轮固定 1 误判合法重试）由第五修复轮引入。
登记位置：[A9-33 §6.30](tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#630-第五修复轮实现与-codex-第-5-轮复核2026-10-14)。预算仍 7/7 耗尽，预演 8 未授权。

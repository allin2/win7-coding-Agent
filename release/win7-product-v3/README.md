# A9 `0.3.0-alpha.1` v3 自包含候选

本目录是 A9-09 独立打包线。它复用锁定的 Electron 22.3.27 和 D-014 better-sqlite3 8.7.0 /
SQLite 3.43.1，并要求 D-017 锁定 Win10 工具链返回的 D-013 v25 Current-User helper。D-013 v24、
WIN7-19 及其证据保持只读，不继承 A7/A8 的产品 PASS。

## A9-16 / WIN7-35 Driver ready 前加载与退出码修复候选

WIN7-35 依据 ADR-0132 与任务书 §16 换发自 WIN7-34。WIN7-34 验收后发现其 Driver 在 `app.whenReady()`
之内才安装接缝并首次 `require` 产品入口，延后了模块顶层生命周期副作用；且在受控驱动初始化或
阶段注入异常时，报告记为 ERROR 但子进程退出码可能为 0，与父级 smoke 校验产生矛盾。

WIN7-35 修复 Driver 生命周期与退出码交付：
- 接缝安装与首次 `require(productMain)` 移至 Electron `app.whenReady()` 之前；
- 增加迟到加载守卫：若在 `app.isReady() === true` 后尝试加载产品入口，抛出稳定错误码 `A9_W35_DRIVER_PRODUCT_ENTRY_LATE_LOAD` 并 fail-closed；
- 受控阶段 ERROR / FAIL 保证非零退出码（码 1），报告完整落盘，且通过 `app.quit()` 先触发 `before-quit` 与 `a9RuntimeInstance.shutdown()`；同一轮的 `will-quit` 清理处理器运行后再交付目标码；
- 候选内 smoke 用真实 `electron.exe` 执行迟到加载和受控 ERROR 两个反例，强校验子进程退出码、报告状态、`cases`/`error` 与 WMI 零进程残留。

```bat
node scripts\release\build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-16-win7-35-input-lock.json ^
  --electron-zip <electron-v22.3.27-win32-x64.zip> ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip <WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip> ^
  --output <new-empty-output-directory>
```

现场步骤见 [`A9_16_WIN7_35_VALIDATION.md`](A9_16_WIN7_35_VALIDATION.md)。WIN7-34 及其报告与证据保持冻结。

## A9-16 / WIN7-34 渲染策略就绪守卫修复候选

WIN7-34 依据 ADR-0130 与任务书 §14 换发自 WIN7-33。WIN7-33 在 `10.134.115.40` 的普通用户
`dccs-chaizl-pc\agent`、Medium/non-elevated 令牌下通过了 G0 与 G1，但 **G2 自动产品 smoke 硬失败**：
四个驱动阶段全部抛 `app.disableHardwareAcceleration() can only be called before app is ready`
（抛点在 `resources/app/product/main.js:21`，触发点是驱动在 `app.whenReady()` 之内才 `require`
产品入口），fixture 请求为 0，未产出任何投影附件；正式 verifier 记 `status=FAIL`。非 Windows 平台
跳过该调用，因此该缺陷只能在物理 Win7 上暴露。

WIN7-34 因此把该调用改为按就绪状态守卫：

```js
if (process.platform === 'win32' && !app.isReady()) app.disableHardwareAcceleration();
```

打包入口仍在 `app.ready` 前加载 `main.js`，Windows 软件渲染策略与 WIN7-33 完全一致；此后加载本模块
的验收 harness 不再能把一次非法迟到调用变成产品启动失败。WIN7-33 的 renderer 容量修复、短高度左栏
布局、15 项用例、Alpha 1 版本和能力集全部继承。

```bat
node scripts\release\build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-16-win7-34-input-lock.json ^
  --electron-zip <electron-v22.3.27-win32-x64.zip> ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip <WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip> ^
  --output <new-empty-output-directory>
```

正式候选已由源码提交 `2f6d3fd2ee8817922cf771300e3f348e541dfaf6` 从两个独立干净工作树构建，
ZIP 逐字节一致：101,361,365 B，SHA-256
`d0b8528fccef905dce2d420d1b231251fac017d29f1505dbc10a6f20d9a93ead`；manifest SHA-256
`3801430d0716ebfa3dafb65e3f123bf6d5bbdd19fc030f0e4c0dbf63a441761a`；validation kit SHA-256
`628ef158c3bf7b9797ecffab98d732144379aae7f33b3faae67f4fcc12b80644`
（`A9-16-WIN7-34-RESPONSIVE-UI-20260915-01`，15 项用例）。两份结果均为 `source_dirty=false`、
`external_acceptance_eligible=true`。候选已冻结到 `.acceptance/candidates/WIN7-34/`，双构建输出位于
`.acceptance/builds/WIN7-34/2f6d3fd-reissue/`。仍须候选外独立 `WIN7_34_RELEASE_AUTHORITY` 与
SHA-256 pin；现场步骤见 [`A9_16_WIN7_34_VALIDATION.md`](A9_16_WIN7_34_VALIDATION.md)。authority 前
保持 `WIN7_34_NOT_PERFORMED`。WIN7-33 及其失败报告与证据保持冻结。

## A9-16 / WIN7-33 Win7 GPU 合成首绘修复候选

WIN7-33 依据 ADR-0129 与任务书 §13 换发自 WIN7-32。WIN7-32 在物理 Win7 普通用户下通过 G1 与
G2 75/75，但无参数正式启动和一次正常重启均持续白屏；renderer 存活，只有 DevTools 重建合成表面后
已加载 DOM 才显示。同一冻结候选使用 `--disable-gpu` 后直接正常首绘，因此 WIN7-33 仅在 Windows 的
`app.ready` 前禁用 Electron 硬件加速。WIN7-32 的 renderer 容量修复、15 项用例、Alpha 1 版本和能力集
全部继承。

```bat
node scripts\release\build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-16-win7-33-input-lock.json ^
  --electron-zip <electron-v22.3.27-win32-x64.zip> ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip <WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip> ^
  --output <new-empty-output-directory>
```

正式候选已由源码提交 `d6c6a3e5d908ff3ffe72d14d1c64bb7ba968e718` 从两个独立干净工作树构建，
ZIP 逐字节一致：101,358,703 B，SHA-256
`ab885f43c5285ebe81351ca5841f33399cb58b750b16cb8367fd2c760b08984c`；manifest SHA-256
`6d9986f43135171517be34c61d85b17e9f79eae04f70be3c7c5bd6443930bd9e`。

**实机结果（2026-09-15，run `15f2c247-d5e1-4c82-8d9f-c34759cf9a4f`）**：G0/G1 PASS、**G2 FAIL**，
G3 与 15 项用例按 fail-closed 记 `NOT_PERFORMED`，正式 verifier `status=FAIL`
（`disposition=FIX_BEFORE_REISSUE`）。候选不可签发，由 WIN7-34 换发；WIN7-33 的冻结身份、报告与全部
原始证据保持原样，不得改写或复用哈希改判。现场步骤见
[`A9_16_WIN7_33_VALIDATION.md`](A9_16_WIN7_33_VALIDATION.md)。

## A9-16 / WIN7-32 真实 125% DPI 容量修复候选

WIN7-32 依据 ADR-0128 与任务书 §12 换发自 WIN7-31。WIN7-31 在 `10.134.115.40` 的普通用户
Medium/non-elevated 实机 run `cdc35c14-abee-4f8e-bd4a-5759559ba0c8` 中通过 G1 与 G2 75/75，
但 G3 在真实 1366×768、120 DPI（125%）、Stop 可见的最坏形态下只显示 1 条完整对话行，低于 4 行
硬门，固定为 `G3_FAILED`。WIN7-32 只在短内容高度下压缩左栏固定 chrome，保留 36px 行与所有必需
入口；15 项用例、Alpha 1 版本和能力集不变。

```bat
node scripts\release\build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-16-win7-32-input-lock.json ^
  --electron-zip <electron-v22.3.27-win32-x64.zip> ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip <WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip> ^
  --output <new-empty-output-directory>
```

正式候选已由源码提交 `916fe8240e73d6efa956eacf485652075639dbcb` 从两个独立干净工作树构建，
ZIP 逐字节一致：101,356,737 B，SHA-256
`639063b70a1f7fb5dd422870708cb8cb457c405df8752668a5e43f8220a92ea2`；manifest SHA-256
`03647a0e0966e27787aa28ea17f577307955e0e28d7de3d31bd7fc62f8b442f6`。仍须候选外独立
`WIN7_32_RELEASE_AUTHORITY` 与 SHA-256 pin；现场步骤见
[`A9_16_WIN7_32_VALIDATION.md`](A9_16_WIN7_32_VALIDATION.md)。authority 签发前保持
`WIN7_32_NOT_PERFORMED`。WIN7-31 ZIP SHA-256
`79aec61da2046727ae89d94ccb4c9341ca5fb07aff17a72291479d1372ffa16a` 与其失败证据保持冻结。

## A9-16 / WIN7-31 实机 G2 修复候选

WIN7-31 依据 ADR-0127 与任务书 §10 换发自 WIN7-30。WIN7-30 已在 `10.211.42.40` 通过 G1，但 G2
自动 smoke 失败：包内 driver 仍发布 W28 投影证据键，而 smoke 按 W30 键读取；左栏折叠时 Ctrl+K
搜索过滤成功但没有取得真实焦点。WIN7-31 仅修复这两点：构建时把共享 driver 的 03/09/10 投影键
及 evidence package kind 精确派生为 W31；Ctrl+K 先展开导航，再聚焦并全选搜索框。15 项用例、
Alpha 1 版本与能力集不变，Review 和 Shell 运行中输出仍不开放。

```bat
node scripts\release\build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-16-win7-31-input-lock.json ^
  --electron-zip <electron-v22.3.27-win32-x64.zip> ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip <WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip> ^
  --output <new-empty-output-directory>
```

正式候选已由源码提交 `ac4ed5048a6a2d4ed2f223c61ed06108a4a07d4b` 在两个独立干净工作树构建，
ZIP 逐字节一致：101,353,790 B，SHA-256
`79aec61da2046727ae89d94ccb4c9341ca5fb07aff17a72291479d1372ffa16a`；manifest SHA-256
`a215217b6279a85b4c8213f561bafda07a6c529f630a6e4060c63b084cb9dbe6`。仍需候选外独立
`WIN7_31_RELEASE_AUTHORITY` 与 SHA-256 pin。现场步骤见
[`A9_16_WIN7_31_VALIDATION.md`](A9_16_WIN7_31_VALIDATION.md)。在 authority 与普通用户非提升 Win7
实机验证完成前，WIN7-31 保持 `NOT_PERFORMED`。WIN7-30 ZIP SHA-256
`1ec123e4f73dbb6607007e34460350164a06a6dd9035f4c031ff4782fc74af90` 与 run
`add716dd-c45e-4a18-ab5f-0ba1fc19d6c3` 的失败证据保持冻结。

## A9-16 / WIN7-30 响应式工作台 UI 子集修正候选

**当前结论：G2_FAILED，不再用于验收。** G1 已通过；G2 自动 smoke 因投影证据键残留 W28 与折叠
左栏下 Ctrl+K 焦点失败而停止，真实 Provider 为 `NOT_PERFORMED`。本节以下内容保留为当时的候选合同；
修复候选为 WIN7-31，见上节。不得为 WIN7-30 重签 authority 或复用其哈希改判。

WIN7-30 是 A9-16 §4 U01–U07（左侧对话区与左右栏自适应）的**修正候选**，决策记录 ADR-0126（任务书 §9）。
它换发自 `WIN7-29`：后者包内的 `validation/a9-package-integrity-w29.cjs` 有 5 处字面量未从 W28 重基线，
导致**候选自带的校验器拒绝候选自身携带的 input lock**（实测 `A9_W29_INPUT_LOCK_CONTRACT_INVALID`），
Win7 实机验收无法通过第一条命令。按既有修复先例换发新标签，`WIN7-29` 保留为失败构建，不得复用其哈希改判。
范围仅限 `renderer/workbench.html`、`renderer/a9-workbench.css`、`renderer/a9-workbench.js` 的改动；
Review（R01–R05）与 Shell 运行中输出（S01–S06）**不在候选内**，Review 入口维持 disabled + fail-closed。
版本与能力集保持 Alpha 1（`0.3.0-alpha.1`，ADR-0096），本候选不构成 Alpha 2 或 RC PASS。
A9-17（启动内存）经负责人裁决不并入本候选，也不单独建立产品候选。

validation kit 含 **15 项**用例：继承 WIN7-28 的 `W30-01`～`W30-10`（含投影 `W30-09` 与分页 `W30-10`），
新增 `W30-11`～`W30-15` 覆盖左栏三段式与行容量、桌面四态 DOM 保活、跨断点收敛回归、键盘/焦点契约，
以及**真实 1366×768 × 125% DPI** 布局——后者是 `docs/STATUS.md` 中唯一被明确标注"不等于真实 DPI"
的遗留项，开发机 Chromium 缩放代理只测得 1 条完整行，不得据以宣称达标。

```bat
node scripts\release\build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-16-win7-30-input-lock.json ^
  --electron-zip <electron-v22.3.27-win32-x64.zip> ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip <WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip> ^
  --output <new-empty-output-directory>
```

必须从提交后的两个独立干净工作树构建并逐字节比较；候选哈希形成后仍需候选外独立
`WIN7_30_RELEASE_AUTHORITY` 与 SHA-256 pin。三件锁定输入与 WIN7-28 完全一致（Electron 22.3.27、
D-013 v25、SQLite 3.43.1 / ABI 110），按精确哈希继承。现场步骤见
[`A9_16_WIN7_30_VALIDATION.md`](A9_16_WIN7_30_VALIDATION.md)。**双干净构建与普通用户非提升 Win7
实机验收均 `NOT_PERFORMED`**；WIN7-22～29 的冻结 release 文件保持原字节。

### WIN7-29 失败构建记录（2026-09-14）

以下冻结身份**不再用于验收**：该构建的包内校验器无法验证自身 input lock（ADR-0126）。记录保留仅为证据留档，不得删除、改写或复用其哈希改判。

该构建当时的冻结身份（仅留档，不得引用）：

| 项 | 值 |
|---|---|
| 源码提交 | `4bdf87b40449a1a7c5488425d45604767ce8e24a` |
| `source_dirty` | `false` |
| `external_acceptance_eligible` | `true` |
| ZIP | `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip`（101,350,978 B） |
| ZIP SHA-256 | `a69d92c434631d13019c3cfb760db907555ecc84b853f56bdd6d3dab2e0d820e` |
| manifest SHA-256 | `46f11c0ddb2d2d4b2566a035914d41ae4751a7ecd2f404c4b65831e6643d5d01` |
| 构建状态 | `A9_16_DEVELOPER_PACKAGE_INTEGRITY_PASS`（非 Win10/Win7/Alpha PASS） |

包完整性仅为开发机结论：`product_assembly`、`win10`、`win7`、`alpha` 全部 `NOT_PERFORMED`。
`WIN7-29` 的裁决为 **构建缺陷（不可验收）**，其哈希不得被任何 authority 引用。

### WIN7-30 冻结候选身份（2026-09-14）

从提交后的两个独立干净工作树各构建一次，逐字节一致（`cmp` 通过）：

| 项 | 值 |
|---|---|
| 源码提交 | `640571ea11a402b4b827cf31175d849ec729d970` |
| `source_dirty` | `false` |
| `external_acceptance_eligible` | `true` |
| ZIP | `Win7CodingAgent-0.3.0-alpha.1-win7-x64.zip`（101,352,637 B） |
| ZIP SHA-256 | `1ec123e4f73dbb6607007e34460350164a06a6dd9035f4c031ff4782fc74af90` |
| manifest SHA-256 | `4c41af7501c51433ff240a14d6ebd28246716fa3884a8c12fac08a2f4d75daae` |
| 构建状态 | `A9_16_DEVELOPER_PACKAGE_INTEGRITY_PASS`（非 Win10/Win7/Alpha PASS） |

候选外预检 12 项全 PASS，含 `verifyFullTree()`（788 文件）、64 项闭包、无禁止载荷，以及
**`verifyAcceptanceCandidate()` 接受符合文档契约的 authority 与候选自带 input lock**——
即 `WIN7-29` 失败的那一项。该 authority 为测试夹具，**不构成批准**。
**候选外 `WIN7_30_RELEASE_AUTHORITY` 与普通用户非提升 Win7 实机验收仍待执行。**

## A9-15 / WIN7-28 验收缺口修复候选

WIN7-28 已于 2026-09-11 在 Windows 7 SP1 x64 普通用户 Medium/non-elevated 桌面令牌下完成 10/10
当前候选直接用例，自动产品 smoke 75/75 assertions 与真实 Provider `tool_calling` 多工具轮次均 PASS；
前置/后置完整性、零残留进程、本机返回证据 verifier 与目标机 verifier 均 PASS。冻结源码为
`d71807fa0d0f011d9c35104e7cd6dab62058ffa5`，ZIP SHA-256 为
`f1b6730bfa4cbc9d0d2955c2659d97b7a65c161efdc78cc4a7381bbad0a08351`。最终裁决仅为
`A9_15_WIN7_UI_INTEGRATION_PASS`，不重签 Alpha/RC；脱敏收口见
[`docs/reports/2026-09/a9_win7_28_ui_integration_closeout_2026-09-11.md`](../../docs/reports/2026-09/a9_win7_28_ui_integration_closeout_2026-09-11.md)。

WIN7-27 的复核确认四项修复有实质改进，但仍存在四项 P2 级验收逻辑缺口（F1 DOM 结果与最新 turn 身份未参与
判定、F2 逐行文本仍是关键词检查、F3 审批恢复顺序未要求恢复工具活动、F4 未真实执行旧事件补载）。ADR-0121
的 WIN7-28 使用新锁 `a9-15-win7-28-input-lock.json`：投影附件成为唯一事实来源并由报告器强制校验 DOM 结果
与最新持久化 turn 身份，逐行内容由查询事实独立推导后核对，审批恢复必须出现真实恢复工具活动，旧失败必须
经真实 `beforeEventId` 分页加载。历史 W23～W27 profile 的 `release/**` 合同保持原字节。

```bat
node scripts\release\build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-15-win7-28-input-lock.json ^
  --electron-zip <electron-v22.3.27-win32-x64.zip> ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip <WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip> ^
  --output <new-empty-output-directory>
```

必须从提交后的两个独立干净工作树构建并逐字节比较；候选哈希形成后仍需候选外独立
`WIN7_28_RELEASE_AUTHORITY` 与 SHA-256 pin。开发机 fixture 不能替代真实 Provider 或普通用户 Win7 证据。
WIN7-25/26/27 的源码提交、out-a/out-b、ZIP、manifest、kit、lock、authority、构建树与复核证据保持原字节。

## A9-15 / WIN7-27 投影证据与集成断言修复候选

WIN7-26 的复核确认产品投影修复与构建一致性成立，但报告器未解析投影附件内容、Electron Inspector 断言
不足、新增投影用例时移除了原审批与失败顺序签发要求，且共享 driver 的新协议与历史 fixture 失配。
ADR-0120 的 WIN7-27 使用新锁 `a9-15-win7-27-input-lock.json`：机器可读投影导出成为唯一事实来源并由
报告器实际解析交叉核对，Inspector 按有界显示范围逐行核对并做缺行/乱序/重复/残留负向检查，恢复
`W27-04-APPROVAL-FAILURE-ORDER` 并新增 `W27-09-LATEST-OUTCOME-PROJECTION`，新 driver 协议只对显式
启用它的 WIN7-27 与开发机 fixture 生效，历史 W23/W24/W25 profile 保持协议兼容。

```bat
node scripts\release\build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-15-win7-27-input-lock.json ^
  --electron-zip <electron-v22.3.27-win32-x64.zip> ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip <WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip> ^
  --output <new-empty-output-directory>
```

必须从提交后的两个独立干净工作树构建并逐字节比较；候选哈希形成后仍需候选外独立
`WIN7_27_RELEASE_AUTHORITY` 与 SHA-256 pin。开发机 fixture 不能替代真实 Provider 或普通用户 Win7 证据。
WIN7-25/26 的源码提交、out-a/out-b、ZIP、manifest、kit、lock、authority、构建树与复核证据保持原字节。

## A9-15 / WIN7-26 投影验证缺口修复候选

WIN7-25 的产品修复保持冻结；其复核发现 Renderer 回归未执行原连续渲染触发顺序，验收 kit/report 也未把
Inspector 当前会话持久事件恢复与旧失败不得覆盖新成功设为签发硬条件。ADR-0119 的 WIN7-26 使用新锁
`a9-15-win7-26-input-lock.json`，加入真实 Renderer 故障敏感性回归、Electron 旧失败→较新成功重启链路，
以及要求 turn/event ID、查询顺序和 DOM 导出哈希的两个稳定报告用例。

```bat
node scripts\release\build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-15-win7-26-input-lock.json ^
  --electron-zip <electron-v22.3.27-win32-x64.zip> ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip <WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip> ^
  --output <new-empty-output-directory>
```

必须从提交后的两个独立干净工作树构建并逐字节比较；候选哈希形成后仍需候选外独立
`WIN7_26_RELEASE_AUTHORITY` 与 SHA-256 pin。开发机 fixture 不能替代真实 Provider 或普通用户 Win7 证据。

## A9-15 / WIN7-25 重启历史投影修复候选

WIN7-24 已在普通用户正常退出后的重启检查中确认 Renderer 投影失败，冻结为
`FIX_BEFORE_WIN7_25_VALIDATION`；其合同、候选和证据不得修改或重判。ADR-0118 的 WIN7-25 使用新锁
`a9-15-win7-25-input-lock.json`，修复 Inspector 对持久化事件的恢复以及全局结果绑定最新轮次，并保持
IPC、SQLite schema、Runner/Policy 与权限边界不变。

```bat
node scripts\release\build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-15-win7-25-input-lock.json ^
  --electron-zip <electron-v22.3.27-win32-x64.zip> ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip <WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip> ^
  --output <new-empty-output-directory>
```

必须从提交后的两个独立干净工作树各构建一次并比较 ZIP 字节；候选哈希形成后再创建候选外独立
release authority。自动 fixture smoke 不能替代普通用户真实 Provider 与重启历史复验。

## A9-15 / WIN7-24 验证启动与字体清晰度候选

WIN7-23 已因打包 Electron 子进程没有执行 driver、三份 phase 报告未生成而冻结为
`FIX_BEFORE_WIN7_24_VALIDATION`；其合同、候选和证据不得修改或重判。ADR-0116 的 WIN7-24 使用新锁
`a9-15-win7-24-input-lock.json`，修复候选外 Electron driver runtime、stop 工作区前置和反假阳性断言，
同时只在现有 CSS 内优化 Win7 本地字体栈、整数基础字号和辅助文字对比度：

```text
node scripts/release/build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-15-win7-24-input-lock.json ^
  --electron-zip spikes\04-storage-index\build-win10\kit\inputs\electron-v22.3.27-win32-x64.zip ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip A6\WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip ^
  --output <候选外新目录>
```

正式包仍须双干净构建逐字节一致，并在哈希确定后取得候选外 `WIN7_24_RELEASE_AUTHORITY` 与独立 pin。
验证步骤见 `A9_15_WIN7_24_VALIDATION.md`。自动 fixture smoke 的临时 Electron 副本位于候选外证据 run
root，被测产品入口仍是候选内正式 main/preload/IPC/renderer；它不能替代真实 Provider 或普通用户证据。

## A9-15 / WIN7-23 历史候选

WIN7-23 是 A9-15 的独立候选身份，不覆盖或改判 WIN7-22。它复用未变化的 Electron、D-013 v25 与
SQLite 正式输入精确哈希，使用新锁 `a9-15-win7-23-input-lock.json`：

```text
node scripts/release/build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-15-win7-23-input-lock.json ^
  --electron-zip spikes\04-storage-index\build-win10\kit\inputs\electron-v22.3.27-win32-x64.zip ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip A6\WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip ^
  --output <候选外新目录>
```

该段仅保留历史重建说明。正式包必须从两个干净、已提交源码工作树独立构建并逐字节一致。候选哈希确定后，按
`A9_15_WINDOWS_VALIDATION.md` 获取候选外 `WIN7_23_RELEASE_AUTHORITY` 与独立 SHA-256 pin，再进入
Win7 普通用户验证。自动 fixture smoke 不满足真实 Provider 用例；完整结果仅可签发
`A9_15_WIN7_UI_INTEGRATION_PASS`，不是新的 Alpha 或 RC PASS。

从仓库根目录构建：

```text
node scripts/release/build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-13-win7-21-input-lock.json ^
  --electron-zip spikes\02-terminal-containment\build-win10\kit\inputs\electron-v22.3.27-win32-x64.zip ^
  --runner-zip D013-V25-WIN10-RETURN.zip ^
  --storage-zip A6\WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip ^
  --output release\win7-product-v3\out
```

正式候选必须来自干净、已提交源码。`--allow-uncommitted` 只生成开发机替代候选；manifest 会记录
`source_dirty: true` 和 `external_acceptance_eligible: false`，不得拿去签发 Win10、Win7 或 Alpha PASS。
构建器不下载依赖，不要求目标机安装 Node，并在发布 ZIP 前验证全树 manifest、A9 `git-adapter`
闭包、外置 Electron ABI SQLite、D-013 helper、敏感信息排除和双构建确定性。

Windows 验收必须解压同一个 ZIP 到全新目录，在包外建立证据目录。默认数据位于
`%LOCALAPPDATA%\Win7CodingAgent\a9`；只有显式传入 `--portable` 才使用包旁 `portable-data`。
先用 `record-a9-v25-helper-input.mjs` 校验两次干净 Win10 构建的两组 ZIP/sidecar。两次返回 ZIP 和 `run_id`
必须各自独立，返回包中的 input lock、input verification、package manifest 必须精确绑定授权套件及其 Git
source commit。授权根是 `a9-v25-approved-kits.json` 中状态为 `APPROVED_FOR_RETURN_RECORDING` 的不可覆盖
构建 ZIP/hash；该清单必须与当前 clean Git HEAD 的固定路径字节一致，未跟踪或本地修改一律拒绝，批准
commit/hash 写入正式 input lock。调用方目录不能充当授权根。helper 字节必须一致；复制同一返回包不能作为第二次构建，
并生成一次性的 `a9-13-win7-21-input-lock.json`，再构建正式候选；历史 `a9-09-input-lock.json` 不得作为 WIN7-21 的正式锁：

```text
node scripts/release/record-a9-v25-helper-input.mjs ^
  --kit-zip PREAPPROVED-D013-V25-BUILDKIT.zip ^
  --runner-zip D013-V25-WIN10-RETURN-A.zip --sidecar D013-V25-WIN10-RETURN-A.zip.sha256 ^
  --runner-zip-2 D013-V25-WIN10-RETURN-B.zip --sidecar-2 D013-V25-WIN10-RETURN-B.zip.sha256
```

Windows 现场先运行
`RUN_A9_09_INTEGRITY.cmd <原始ZIP> <候选外正式lock> <候选外批准清单> <候选外批准记录> <独立批准记录SHA256>`
绑定 ZIP/manifest、正式输入和独立批准。Win10/Win7 未实际执行前
始终保持 `NOT_PERFORMED`。完整性工具在 Electron Node mode 下强制使用 `original-fs` 读取物理文件字节，
避免 Electron 的 ASAR 虚拟文件系统改变 `resources/default_app.asar` 的读取语义；启动脚本同时清除外部
`NODE_OPTIONS`，防止预加载代码污染哈希边界。

WIN7-21 identity verifier 另有内置、版本化的完整产品闭包，不采信 manifest 自己定义的最小文件集合。
它要求正式 input lock、Shell Product/Preload/Renderer、七个运行时模块、离线依赖、Runner manifest、
native、SBOM、许可证、验证脚本和 kit 全部存在并交叉绑定；同步裁剪目录、manifest 和 ZIP 也会拒绝。
上述内部一致性不是批准来源。ADR-0104 要求由独立批准渠道提供 `WIN7_21_RELEASE_AUTHORITY` schema 1
记录的 SHA-256 pin；该记录锁定正式 input lock、批准清单 commit/hash、完整产品 ZIP/manifest/hash 和
产品 source commit。包内 lock 必须与候选外正式 lock 逐字节一致；两个 build/run/evidence binding 不得
复用；三个原生入口还验证 PE32+/AMD64/section/DLL 类型。完整格式及可信预飞行命令见
`A9_09_WINDOWS_VALIDATION.md`。不得从本候选或自行创建的外置文件生成“批准”pin。

`A9_09_VALIDATION_KIT.json` 和 `validation/a9-win7-21-report.cjs` 使用 WIN7-21 report schema v2：仅 8 个
`W17-*` 用例可用 `INHERITED_EVIDENCE`，但只能引用 kit 预先锁定的 WIN7-19 disposition、继承 ledger 与
incremental report 的 SHA-256/JSON pointer；任意新文件不能自报为历史证据。5 个 `W21-*` 用例必须直接
执行，每个 execution 的 `candidate` 必须等于当前 ZIP/manifest 计算出的候选身份，并绑定 Win7 build 7601
x64 普通用户、非提升、D-013 v25 Profile 的系统/令牌探测、候选启动和 postflight 证据。

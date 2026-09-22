# A9-16 / WIN7-35 响应式工作台 UI 子集实机验收

WIN7-35 是 A9-16 §4 U01–U07（左侧对话区与左右栏自适应）的**修正候选**，决策记录为 ADR-0132；
它换发自 WIN7-34（见下节），WIN7-34 的冻结身份、报告与全部证据原样留档。不得覆盖、改名或改判
WIN7-22～WIN7-34 任何候选、证据与结论。验收结果只可签发 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`，
不重签 `A9_14_WIN7_22_GO_FOR_ALPHA` 与 `A9_15_WIN7_UI_INTEGRATION_PASS`，也不构成 Alpha 2 或
RC PASS。Review（R01–R05）与 Shell 运行中输出（S01–S06）**不在本候选内**，Review 入口维持
disabled + fail-closed（ADR-0096）。

## WIN7-34 验收后缺陷与 WIN7-35 换发

WIN7-34 验收后发现 Driver 生命周期时序与阶段退出码存在重要缺陷：

1. **Driver ready 前加载时序缺陷**：候选验收驱动在 `app.whenReady().then(main)` 内才安装接缝并
   首次 `require(productMain)`。虽然 WIN7-34 修复了 `app.isReady()` 守卫使迟到加载不再崩溃，但打包产品
   正式入口是在 Electron ready 前加载 `main.js`；验收驱动在 ready 之后加载产品入口延后了模块顶层副作用与
   生命周期注册，未能真实模拟生产入口的生命周期时序。
2. **阶段受控 ERROR 退出码缺陷**：驱动在发生受控驱动初始化或阶段注入异常时，
   生成了 `status: ERROR` 报告，但子进程退出码仍为 0；父级 smoke runner 仅根据退出码 0 即判定通过，
   形成退出码与错误状态矛盾的歧义。

因此换发 WIN7-35（ADR-0132）：

- **Driver ready 前加载与接缝顺序**：驱动在 Electron ready 之前完成 `dialog.showOpenDialog` 与
  `ipcMain.handle` 接缝安装，并首次 `require(productMain)`；`app.whenReady()` 之后仅负责创建窗口与驱动旅程。
- **迟到加载守卫**：若驱动或测试在 `app.isReady() === true` 后尝试首次加载产品入口，抛出稳定错误码
  `A9_W35_DRIVER_PRODUCT_ENTRY_LATE_LOAD` 并立即 fail-closed。
- **阶段退出码与优雅停机**：报告先完整落盘；`PASS` 退出码为 0，`FAIL` / `ERROR` / 异常退出码严格非 0（码 1）。
  已加载产品时必须先走 `app.quit()` 触发 `before-quit` 与 `a9RuntimeInstance.shutdown()`；
  `will-quit` 中只阻止 Electron 默认 0 码退出，等同一轮所有同步清理处理器运行后再交付非零码。
- **双重 Fail-Closed 校验**：父 smoke 严格校验子进程退出码、JSON `status`、`cases` 与 `error`；矛盾或缺失一律失败。

WIN7-34（ZIP SHA-256 `d0b8528fccef905dce2d420d1b231251fac017d29f1505dbc10a6f20d9a93ead`）及全部历史证据
**保留为历史不可变证据，不得删除、改写或复用哈希改判**。

## 硬门与顺序

1. 候选必须来自干净、已提交源码，manifest 必须为 `source_dirty=false`、
   `external_acceptance_eligible=true`。两份独立源码工作树构建结果须逐字节一致。
2. 候选外 release authority 必须在候选 ZIP、manifest 与源码提交确定后独立批准；批准文件和其
   SHA-256 pin 都不能从候选或 sidecar 自行推导后冒充批准。
3. 在可信开发机先运行仓库内 verifier 预检。Win7 上先以普通用户、非提升令牌运行
   `RUN_A9_16_W35_INTEGRITY.cmd`，成功后才可启动自动产品 smoke。
4. G2 自动产品 smoke 必须在本候选内先通过（退出码 0 且 `status` 为 `PASS`）。它必须在
   候选携带的真实 `electron.exe` 中执行「ready 后首次加载」和「受控阶段 ERROR」两个反例，
   同时记录非零退出码、可解析 ERROR 报告和 WMI 路径扫描的零 Electron/helper/Shell 残留。驱动加载产品入口的
   顺序属于硬门的一部分：任何「候选自身 gate 无法运行产品链路」的情形判 FAIL，未执行项保持
   `NOT_PERFORMED`。
5. 自动 fixture smoke 只覆盖确定性产品链路，不满足真实 Provider 用例，也不能代替 U01–U07 的
   人工几何与视觉观察。真实 Provider 必须由普通用户在设置中配置，秘密不得进入命令、事件、
   截图或报告。
6. 任何硬门失败立即停止后续签发；未执行项保持 `NOT_PERFORMED`，失败证据保留在候选外。

## ADR-0132 候选范围

- Driver 在 Electron ready 前完成接缝包装并首次 `require` 产品入口；迟到加载以 `A9_W35_DRIVER_PRODUCT_ENTRY_LATE_LOAD` 失败。
- 受控阶段 `ERROR` / `FAIL` 必须交付非零退出码，且不绕过 `before-quit` 与 `a9RuntimeInstance.shutdown()` 清理。
- 父 smoke 同时强校验进程退出码与报告完整性。
- 完整保留 WIN7-34 的 Windows 渲染策略 `app.isReady()` 守卫、WIN7-33/32 短高度与 125% DPI 布局容量修复。
- 左侧对话区三段式（brand / 工作区与产品导航 / 搜索与对话列表）与单行"标题 + 状态·时间"行密度。
- 桌面四态（左右栏独立开关的四种组合）由 `.workbench` 的 `rail-closed`/`inspector-closed`
  状态类驱动，**只切类不重建 DOM**；折叠栏以 `visibility` 隐藏并保留滚动位置。
- 抽屉态（`.open` + backdrop）与桌面折叠态是两个互不复用的状态机；跨断点缩放只做状态机收敛与
  `aria-expanded` 重推，不得在桌面断点折叠侧栏。
- 断点沿用既有 1200px（Inspector）与 800px（导航）；1366×768 位于桌面态。
- 侧栏状态维持会话内，不做跨重启持久化；信任注记默认折叠；"进行中 / 更早"按 `activity` 分组。

## 用例集（15 项）

继承 WIN7-28 合同（`W35-01`～`W35-10`，含投影 `W35-09` 与分页 `W35-10`）并新增 5 项 UI 用例：

- `W35-11-LEFT-PANE-DENSITY-AND-CAPACITY`（U01/U02）：三段式分区不重叠；每行单行不折行；
  **最坏形态（2 组头 + 归档区）下至少 4 条对话行完整可见**；行高保持 36px，容量靠压缩固定
  chrome 而非缩小行高达成；组头按 `activity` 字段。
- `W35-12-DESKTOP-FOUR-STATE-DOM-KEEPALIVE`（U03/U04/U05）：四态均可到达且状态类正确；
  任一态切换后 `scrollWidth`/`scrollHeight` 无溢出；两个头部开关的 `aria-expanded` 与视觉一致；
  切换不重建对话列表 DOM（节点身份保持）；折叠栏保留滚动位置且用 `visibility` 而非 `display:none`。
- `W35-13-BREAKPOINT-CONVERGENCE-REGRESSION`（U06）：双向跨越 1200px/800px 均不得在桌面断点设置
  `rail-closed`/`inspector-closed`；抽屉态与桌面折叠态不跨断点复用；按 ADR-0131 只验证
  **产品可达最窄 847 CSS px**：折叠 rail 后对话列非零且无水平溢出，
  `matchMedia('(max-width: 799px)') === false`。≤799px 抽屉分支继续登记为
  `PRODUCT_UNREACHABLE / NOT_VERIFIED`，不得在本候选中记 PASS。
- `W35-14-KEYBOARD-AND-FOCUS-CONTRACT`（U07）：Ctrl+K 聚焦搜索、清空后不丢焦点；Ctrl+I 关闭
  Inspector 并把焦点交还头部开关；增量搜索保持焦点、滚动位置与展开的活动状态；无键盘路径把焦点
  留在隐藏或折叠元素上。
- `W35-15-REAL-125-PERCENT-DPI-LAYOUT`（首要复核项）：**必须是真实 1366×768 × 125% DPI**，
  不接受 Chromium 缩放代理；记录 DPI 来源；最坏形态完整行数达标；四态在真实 125% DPI 下均无溢出。

## 导出契约（沿用 WIN7-28，不得漂移）

- DOM 导出附件的行字段固定为 snake_case：`event_id`、`turn_id`、`event_type`、`text`；driver 内部
  camelCase 观察值必须在写附件时显式转换，否则被 `A9_W35_PROJECTION_DOM_KIND_INVALID` 拒绝。
- 终态事实按"显式 payload 优先、事件类型兜底"推导；全局结果必须显式为 `completed · verified`。
- 自动 smoke 会在候选外证据根上直接调用正式报告器的解析函数核对投影附件
  （`A9-W35-PROJECTION-ARTIFACTS-REPORT-PARSEABLE`），格式漂移必须在开发机或候选内 smoke 即失败。

## 候选外批准格式

`release-authority.json`：

```json
{
  "schema_version": 1,
  "kind": "WIN7_35_RELEASE_AUTHORITY",
  "status": "APPROVED_FOR_WIN7_35_VALIDATION",
  "formal_input_lock_sha256": "<a9-16-win7-35-input-lock.json SHA-256>",
  "approval_registry": {
    "commit": "<批准清单提交>",
    "sha256": "<a9-v25-approved-kits.json SHA-256>"
  },
  "candidate": {
    "source_commit": "<产品源码提交>",
    "package_sha256": "<候选 ZIP SHA-256>",
    "manifest_sha256": "<release-manifest.json SHA-256>"
  }
}
```

## Win7 命令

在全新解压的候选目录中运行，所有证据写到候选兄弟目录：

```text
RUN_A9_16_W35_INTEGRITY.cmd <原始ZIP> <外部正式lock> <外部批准清单> <外部批准记录> <独立批准记录SHA256>

set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-35-smoke.cjs --evidence-root=<候选外证据目录>
set "ELECTRON_RUN_AS_NODE="
```

自动 smoke 使用本机回环 fixture，必须明确记录 `real_provider=NOT_PERFORMED_BY_AUTOMATIC_FIXTURE_SMOKE`。
它覆盖继承的确定性链路，**不覆盖 U01–U07 的几何、DPI 与视觉观察**。随后由普通用户打开正式
`electron.exe`，按 `A9_16_VALIDATION_KIT.json` 完成 15 项用例，其中 `W35-11`～`W35-15` 必须提供
真实 1366×768 × 125% DPI 下的截图与几何量测。最后生成报告模板：

```text
set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-35-report.cjs init --kit A9_16_VALIDATION_KIT.json --release-manifest release-manifest.json --zip <原始ZIP> --formal-input-lock <外部正式lock> --approval-registry <外部批准清单> --release-authority <外部批准记录> --release-authority-sha256 <独立批准SHA256> > ..\a9-win7-35-evidence\report-template.json
set "ELECTRON_RUN_AS_NODE="
```

填入实际证据后用 `RUN_WIN7_35_REPORT_VERIFY.cmd` 校验。每个 PASS 必须绑定同一候选身份、普通用户
非提升环境、全部 assertion 与候选外文件哈希；真实 Provider 用例还必须写明
`provider_kind=REAL_NON_FIXTURE`、`provider_probe=tool_calling`。报告器拒绝秘密字段和秘密样式内容。
**15 项用例缺一即不得签发**：包完整性与报告器都会显式要求 `W35-11`～`W35-15` 存在。

不得修改系统 PATH、注册表、服务、防火墙、TLS 或 SSH 主机密钥验证。保留旧程序目录与数据备份；
失败时停止新候选并回到最后获准使用的冻结版本，不删除任何历史候选或证据。

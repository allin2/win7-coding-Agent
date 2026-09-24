# A9-16 / WIN7-36 响应式工作台 UI 子集实机验收

WIN7-36 是 A9-16 §4 U01–U07（左侧对话区与左右栏自适应）的**修正候选**，决策记录为 ADR-0133；
它换发自 WIN7-35。WIN7-35 的 ZIP SHA-256 为
`0d1474fddbd05c28e2109f2b7d70eb78d7e4ac786cadf2418175c7504b73749c`，其冻结身份、报告与
全部 FAIL 证据原样留档。不得覆盖、改名或改判 WIN7-22～WIN7-35 任何候选、证据与结论。
验收结果只可签发 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`，
不重签 `A9_14_WIN7_22_GO_FOR_ALPHA` 与 `A9_15_WIN7_UI_INTEGRATION_PASS`，也不构成 Alpha 2 或
RC PASS。Review（R01–R05）与 Shell 运行中输出（S01–S06）**不在本候选内**，Review 入口维持
disabled + fail-closed（ADR-0096）。

## WIN7-35 G3 UI 容量失败与 WIN7-36 换发

WIN7-35 在 `10.110.237.40` 的普通用户非提升桌面身份下通过 G1、排除旧实例后的 G2，以及正式入口
首启/重启首绘，但物理 1366×768、125% DPI（AppliedDPI=120）给产品的实际可用视口仅
1079×540 CSS px、DPR 1.25。最坏形态（1 运行 + 8 更早 + 1 归档、双组头、Stop）列表
`clientHeight=178`，36px 普通行仅 3 条完整可见，W35-11 与 W35-15 的 G3 UI 硬门 FAIL。
Windows 最小窗口尺寸把一次企图缩放钳大到 1080×584；这组 5 行结果不能冒充真实可用视口 PASS。
W35-12/W35-13 的 DOM 身份观察仍可能被运行中目录轮询干扰，保留待隔离风险，不作独立缺陷或 PASS 裁决。

根因为目录注记的布局 CSS 只按 `.conversation-directory-note` 选择，但真实 `<p>` 节点未挂该 class；
默认段落外边距与换行多占约 29px。修复把 class 绑定到真实节点，并在短高度模式下用 class/ID
双绑定确保单行、零外边距；列表阻止横向滚动侵占布局。36px 行高不缩小。

WIN7-36（ADR-0133）继承 WIN7-35 已修复的 Driver ready 前加载、迟到加载反例、受控 ERROR
非零退出与优雅停机合同，并将这些检查作为 G2 硬门继续执行：

- **Driver ready 前加载与接缝顺序**：驱动在 Electron ready 之前完成 `dialog.showOpenDialog` 与
  `ipcMain.handle` 接缝安装，并首次 `require(productMain)`；`app.whenReady()` 之后仅负责创建窗口与驱动旅程。
- **迟到加载守卫**：若驱动或测试在 `app.isReady() === true` 后尝试首次加载产品入口，抛出稳定错误码
  `A9_W36_DRIVER_PRODUCT_ENTRY_LATE_LOAD` 并立即 fail-closed。
- **阶段退出码与优雅停机**：报告先完整落盘；`PASS` 退出码为 0，`FAIL` / `ERROR` / 异常退出码严格非 0（码 1）。
  已加载产品时必须先走 `app.quit()` 触发 `before-quit` 与 `a9RuntimeInstance.shutdown()`；
  `will-quit` 中只阻止 Electron 默认 0 码退出，等同一轮所有同步清理处理器运行后再交付非零码。
- **双重 Fail-Closed 校验**：父 smoke 严格校验子进程退出码、JSON `status`、`cases` 与 `error`；矛盾或缺失一律失败。

WIN7-35 及全部更早候选外证据**保留为历史不可变证据，不得删除、改写或复用哈希改判**。

## 硬门与顺序

1. 候选必须来自干净、已提交源码，manifest 必须为 `source_dirty=false`、
   `external_acceptance_eligible=true`。两份独立源码工作树构建结果须逐字节一致。
2. 候选外 release authority 必须在候选 ZIP、manifest 与源码提交确定后独立批准；批准文件和其
   SHA-256 pin 都不能从候选或 sidecar 自行推导后冒充批准。
3. 在可信开发机先运行仓库内 verifier 预检。Win7 上先以普通用户、非提升令牌运行
   `RUN_A9_16_W36_INTEGRITY.cmd`，成功后才可启动自动产品 smoke。
4. G2 自动产品 smoke 必须在本候选内先通过（退出码 0 且 `status` 为 `PASS`）。它必须在
   候选携带的真实 `electron.exe` 中执行「ready 后首次加载」和「受控阶段 ERROR」两个反例，
   同时记录非零退出码、可解析 ERROR 报告和 WMI 路径扫描的零 Electron/helper/Shell 残留。驱动加载产品入口的
   顺序属于硬门的一部分：任何「候选自身 gate 无法运行产品链路」的情形判 FAIL，未执行项保持
   `NOT_PERFORMED`。
5. 自动 fixture smoke 只覆盖确定性产品链路，不满足真实 Provider 用例，也不能代替 U01–U07 的
   人工几何与视觉观察。真实 Provider 必须由普通用户在设置中配置，秘密不得进入命令、事件、
   截图或报告。
6. 任何硬门失败立即停止后续签发；未执行项保持 `NOT_PERFORMED`，失败证据保留在候选外。

## ADR-0133 候选范围

- Driver 在 Electron ready 前完成接缝包装并首次 `require` 产品入口；迟到加载以 `A9_W36_DRIVER_PRODUCT_ENTRY_LATE_LOAD` 失败。
- 受控阶段 `ERROR` / `FAIL` 必须交付非零退出码，且不绕过 `before-quit` 与 `a9RuntimeInstance.shutdown()` 清理。
- 父 smoke 同时强校验进程退出码与报告完整性。
- 完整保留 WIN7-35 的 Windows 渲染策略 `app.isReady()` 守卫、Driver 生命周期/退出码合同和既有短高度布局；新增注记选择器绑定修复。
- 左侧对话区三段式（brand / 工作区与产品导航 / 搜索与对话列表）与单行"标题 + 状态·时间"行密度。
- 桌面四态（左右栏独立开关的四种组合）由 `.workbench` 的 `rail-closed`/`inspector-closed`
  状态类驱动，**只切类不重建 DOM**；折叠栏以 `visibility` 隐藏并保留滚动位置。
- 抽屉态（`.open` + backdrop）与桌面折叠态是两个互不复用的状态机；跨断点缩放只做状态机收敛与
  `aria-expanded` 重推，不得在桌面断点折叠侧栏。
- 断点沿用既有 1200px（Inspector）与 800px（导航）；1366×768 位于桌面态。
- 侧栏状态维持会话内，不做跨重启持久化；信任注记默认折叠；"进行中 / 更早"按 `activity` 分组。

## 用例集（15 项）

继承 WIN7-28 合同（`W36-01`～`W36-10`，含投影 `W36-09` 与分页 `W36-10`）并新增 5 项 UI 用例：

- `W36-11-LEFT-PANE-DENSITY-AND-CAPACITY`（U01/U02）：三段式分区不重叠；每行单行不折行；
  **最坏形态（2 组头 + 归档区）下至少 4 条对话行完整可见**；行高保持 36px，容量靠压缩固定
  chrome 而非缩小行高达成；组头按 `activity` 字段。真实 125% DPI 下须记录实际 1079×540
  内容视口；被最小窗口钳大到 584px 的样本只作无效负向对照。
- `W36-12-DESKTOP-FOUR-STATE-DOM-KEEPALIVE`（U03/U04/U05）：四态均可到达且状态类正确；
  任一态切换后 `scrollWidth`/`scrollHeight` 无溢出；两个头部开关的 `aria-expanded` 与视觉一致；
  切换不重建对话列表 DOM（节点身份保持）；折叠栏保留滚动位置且用 `visibility` 而非 `display:none`。
  先在无轮询的稳定目录比较节点引用，再在运行中记录目录刷新时点，分开裁决切栏和数据刷新。
- `W36-13-BREAKPOINT-CONVERGENCE-REGRESSION`（U06）：双向跨越 1200px/800px 均不得在桌面断点设置
  `rail-closed`/`inspector-closed`；抽屉态与桌面折叠态不跨断点复用；按 ADR-0131 只验证
  **产品可达最窄 847 CSS px**：折叠 rail 后对话列非零且无水平溢出，
  `matchMedia('(max-width: 799px)') === false`。≤799px 抽屉分支继续登记为
  `PRODUCT_UNREACHABLE / NOT_VERIFIED`，不得在本候选中记 PASS。
- `W36-14-KEYBOARD-AND-FOCUS-CONTRACT`（U07）：Ctrl+K 聚焦搜索、清空后不丢焦点；Ctrl+I 关闭
  Inspector 并把焦点交还头部开关；增量搜索保持焦点、滚动位置与展开的活动状态；无键盘路径把焦点
  留在隐藏或折叠元素上。
- `W36-15-REAL-125-PERCENT-DPI-LAYOUT`（首要复核项）：**必须是真实 1366×768 × 125% DPI**，
  不接受 Chromium 缩放代理；记录 DPI 来源；最坏形态完整行数达标；四态在真实 125% DPI 下均无溢出。

## 导出契约（沿用 WIN7-28，不得漂移）

- DOM 导出附件的行字段固定为 snake_case：`event_id`、`turn_id`、`event_type`、`text`；driver 内部
  camelCase 观察值必须在写附件时显式转换，否则被 `A9_W36_PROJECTION_DOM_KIND_INVALID` 拒绝。
- 终态事实按"显式 payload 优先、事件类型兜底"推导；全局结果必须显式为 `completed · verified`。
- 自动 smoke 会在候选外证据根上直接调用正式报告器的解析函数核对投影附件
  （`A9-W36-PROJECTION-ARTIFACTS-REPORT-PARSEABLE`），格式漂移必须在开发机或候选内 smoke 即失败。

## 候选外批准格式

`release-authority.json`：

```json
{
  "schema_version": 1,
  "kind": "WIN7_36_RELEASE_AUTHORITY",
  "status": "APPROVED_FOR_WIN7_36_VALIDATION",
  "formal_input_lock_sha256": "<a9-16-win7-36-input-lock.json SHA-256>",
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
RUN_A9_16_W36_INTEGRITY.cmd <原始ZIP> <外部正式lock> <外部批准清单> <外部批准记录> <独立批准记录SHA256>

set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-36-smoke.cjs --evidence-root=<候选外证据目录>
set "ELECTRON_RUN_AS_NODE="
```

自动 smoke 使用本机回环 fixture，必须明确记录 `real_provider=NOT_PERFORMED_BY_AUTOMATIC_FIXTURE_SMOKE`。
它覆盖继承的确定性链路，**不覆盖 U01–U07 的几何、DPI 与视觉观察**。随后由普通用户打开正式
`electron.exe`，按 `A9_16_VALIDATION_KIT.json` 完成 15 项用例，其中 `W36-11`～`W36-15` 必须提供
真实 1366×768 × 125% DPI 下的截图与几何量测。最后生成报告模板：

```text
set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-36-report.cjs init --kit A9_16_VALIDATION_KIT.json --release-manifest release-manifest.json --zip <原始ZIP> --formal-input-lock <外部正式lock> --approval-registry <外部批准清单> --release-authority <外部批准记录> --release-authority-sha256 <独立批准SHA256> > ..\a9-win7-36-evidence\report-template.json
set "ELECTRON_RUN_AS_NODE="
```

填入实际证据后用 `RUN_WIN7_36_REPORT_VERIFY.cmd` 校验。每个 PASS 必须绑定同一候选身份、普通用户
非提升环境、全部 assertion 与候选外文件哈希；真实 Provider 用例还必须写明
`provider_kind=REAL_NON_FIXTURE`、`provider_probe=tool_calling`。报告器拒绝秘密字段和秘密样式内容。
**15 项用例缺一即不得签发**：包完整性与报告器都会显式要求 `W36-11`～`W36-15` 存在。

不得修改系统 PATH、注册表、服务、防火墙、TLS 或 SSH 主机密钥验证。保留旧程序目录与数据备份；
失败时停止新候选并回到最后获准使用的冻结版本，不删除任何历史候选或证据。

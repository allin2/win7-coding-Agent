# A9-16 / WIN7-33 响应式工作台 UI 子集实机验收

WIN7-33 是 A9-16 §4 U01–U07（左侧对话区与左右栏自适应）的**修正候选**，决策记录为 ADR-0129；
它换发自实机 G3 正式窗口首绘失败的 WIN7-32（见下节），WIN7-32 的冻结身份与失败证据
原样留档。不得覆盖、改名或改判 WIN7-22～WIN7-32 任何候选、证据与结论。
验收结果只可签发 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`，不重签 `A9_14_WIN7_22_GO_FOR_ALPHA`
与 `A9_15_WIN7_UI_INTEGRATION_PASS`，也不构成 Alpha 2 或 RC PASS。Review（R01–R05）与
Shell 运行中输出（S01–S06）**不在本候选内**，Review 入口维持 disabled + fail-closed（ADR-0096）。

## WIN7-32 G3 失败与 WIN7-33 换发

WIN7-32 在 `10.134.115.40` 以普通用户 `dccs-chaizl-pc\\agent`、Medium/non-elevated 令牌执行 run
`6e5c315d-cf59-4a5c-bb9f-1f58a2df366c`。G1 包完整性与 G2 自动 smoke 75/75 均通过；G3 在真实
1366×768、120 DPI（125%）下首次启动与一次普通关闭后的正常重启均持续白屏。主/GPU/网络/renderer
进程均存活且 responding，无同期 Application 崩溃；只有打开 DevTools 重建合成表面后已加载 DOM
才可见。冻结候选使用 `--disable-gpu` 重新启动后无需诊断操作即可正常首绘，直接把原因收敛为
Electron 22 在该 Win7 环境的 GPU 合成路径。候选正常关闭且 Electron/helper 零残留，但不得签发
A9-16 UI 集成 PASS。

因此换发 WIN7-33：在 Windows 主进程 `app.ready` 前调用 Electron
`app.disableHardwareAcceleration()`，固定使用软件渲染；非 Windows 开发环境不改变加速策略。
WIN7-32 已冻结的短高度左栏布局原样保留。修正不扩大能力范围、不改变 15 项用例集、不弱化断言，
也不修改 native helper、IPC、SQLite、权限、秘密或依赖。
WIN7-32（ZIP SHA-256 `639063b70a1f7fb5dd422870708cb8cb457c405df8752668a5e43f8220a92ea2`）及上述
run 的证据**保留为失败候选证据，不得删除、改写或复用哈希改判**。

## 硬门与顺序

1. 候选必须来自干净、已提交源码，manifest 必须为 `source_dirty=false`、
   `external_acceptance_eligible=true`。两份独立源码工作树构建结果须逐字节一致。
2. 候选外 release authority 必须在候选 ZIP、manifest 与源码提交确定后独立批准；批准文件和其
   SHA-256 pin 都不能从候选或 sidecar 自行推导后冒充批准。
3. 在可信开发机先运行仓库内 verifier 预检。Win7 上先以普通用户、非提升令牌运行
   `RUN_A9_16_W33_INTEGRITY.cmd`，成功后才可启动正式 `electron.exe`。
4. 自动 fixture smoke 只覆盖确定性产品链路，不满足真实 Provider 用例，也不能代替 U01–U07 的
   人工几何与视觉观察。真实 Provider 必须由普通用户在设置中配置，秘密不得进入命令、事件、
   截图或报告。
5. 任何硬门失败立即停止后续签发；未执行项保持 `NOT_PERFORMED`，失败证据保留在候选外。

## ADR-0129 候选范围

- 左侧对话区三段式（brand / 工作区与产品导航 / 搜索与对话列表）与单行"标题 + 状态·时间"行密度。
- 桌面四态（左右栏独立开关的四种组合）由 `.workbench` 的 `rail-closed`/`inspector-closed`
  状态类驱动，**只切类不重建 DOM**；折叠栏以 `visibility` 隐藏并保留滚动位置。
- 抽屉态（`.open` + backdrop）与桌面折叠态是两个互不复用的状态机；跨断点缩放只做状态机收敛与
  `aria-expanded` 重推，不得在桌面断点折叠侧栏。
- 断点沿用既有 1200px（Inspector）与 800px（导航）；1366×768 位于桌面态。
- 侧栏状态维持会话内，不做跨重启持久化；信任注记默认折叠；"进行中 / 更早"按 `activity` 分组。

## 用例集（15 项）

继承 WIN7-28 合同（`W33-01`～`W33-10`，含投影 `W33-09` 与分页 `W33-10`）并新增 5 项 UI 用例：

- `W33-11-LEFT-PANE-DENSITY-AND-CAPACITY`（U01/U02）：三段式分区不重叠；每行单行不折行；
  **最坏形态（2 组头 + 归档区）下至少 4 条对话行完整可见**；行高保持 36px，容量靠压缩固定
  chrome 而非缩小行高达成；组头按 `activity` 字段。
- `W33-12-DESKTOP-FOUR-STATE-DOM-KEEPALIVE`（U03/U04/U05）：四态均可到达且状态类正确；
  任一态切换后 `scrollWidth`/`scrollHeight` 无溢出；两个头部开关的 `aria-expanded` 与视觉一致；
  切换不重建对话列表 DOM（节点身份保持）；折叠栏保留滚动位置且用 `visibility` 而非 `display:none`。
- `W33-13-BREAKPOINT-CONVERGENCE-REGRESSION`（U06）：双向跨越 1200px/800px 均不得在桌面断点设置
  `rail-closed`/`inspector-closed`；抽屉态与桌面折叠态不跨断点复用；≤799px 无残留 `.rail-closed`
  造成的 0 宽网格列；缩放只做状态机收敛与 `aria-expanded` 重推。
- `W33-14-KEYBOARD-AND-FOCUS-CONTRACT`（U07）：Ctrl+K 聚焦搜索、清空后不丢焦点；Ctrl+I 关闭
  Inspector 并把焦点交还头部开关；增量搜索保持焦点、滚动位置与展开的活动状态；无键盘路径把焦点
  留在隐藏或折叠元素上。
- `W33-15-REAL-125-PERCENT-DPI-LAYOUT`（首要复核项）：**必须是真实 1366×768 × 125% DPI**，
  不接受 Chromium 缩放代理；记录 DPI 来源；最坏形态完整行数达标；四态在真实 125% DPI 下均无溢出。

`W33-15` 同时复验 WIN7-32 已证实的 Win7 首绘失败与真实 DPI 容量点；开发机同引擎量测虽已达到 4 行，仍
**不得据此宣称物理 Win7 达标**。

## 导出契约（沿用 WIN7-28，不得漂移）

- DOM 导出附件的行字段固定为 snake_case：`event_id`、`turn_id`、`event_type`、`text`；driver 内部
  camelCase 观察值必须在写附件时显式转换，否则被 `A9_W33_PROJECTION_DOM_KIND_INVALID` 拒绝。
- 终态事实按"显式 payload 优先、事件类型兜底"推导；全局结果必须显式为 `completed · verified`。
- 自动 smoke 会在候选外证据根上直接调用正式报告器的解析函数核对投影附件
  （`A9-W33-PROJECTION-ARTIFACTS-REPORT-PARSEABLE`），格式漂移必须在开发机或候选内 smoke 即失败。

## 候选外批准格式

`release-authority.json`：

```json
{
  "schema_version": 1,
  "kind": "WIN7_33_RELEASE_AUTHORITY",
  "status": "APPROVED_FOR_WIN7_33_VALIDATION",
  "formal_input_lock_sha256": "<a9-16-win7-33-input-lock.json SHA-256>",
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
RUN_A9_16_W33_INTEGRITY.cmd <原始ZIP> <外部正式lock> <外部批准清单> <外部批准记录> <独立批准记录SHA256>

set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-33-smoke.cjs --evidence-root=<候选外证据目录>
set "ELECTRON_RUN_AS_NODE="
```

自动 smoke 使用本机回环 fixture，必须明确记录 `real_provider=NOT_PERFORMED_BY_AUTOMATIC_FIXTURE_SMOKE`。
它覆盖继承的确定性链路，**不覆盖 U01–U07 的几何、DPI 与视觉观察**。随后由普通用户打开正式
`electron.exe`，按 `A9_16_VALIDATION_KIT.json` 完成 15 项用例，其中 `W33-11`～`W33-15` 必须提供
真实 1366×768 × 125% DPI 下的截图与几何量测。最后生成报告模板：

```text
set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-33-report.cjs init --kit A9_16_VALIDATION_KIT.json --release-manifest release-manifest.json --zip <原始ZIP> --formal-input-lock <外部正式lock> --approval-registry <外部批准清单> --release-authority <外部批准记录> --release-authority-sha256 <独立批准SHA256> > ..\a9-win7-33-evidence\report-template.json
set "ELECTRON_RUN_AS_NODE="
```

填入实际证据后用 `RUN_WIN7_33_REPORT_VERIFY.cmd` 校验。每个 PASS 必须绑定同一候选身份、普通用户
非提升环境、全部 assertion 与候选外文件哈希；真实 Provider 用例还必须写明
`provider_kind=REAL_NON_FIXTURE`、`provider_probe=tool_calling`。报告器拒绝秘密字段和秘密样式内容。
**15 项用例缺一即不得签发**：包完整性与报告器都会显式要求 `W33-11`～`W33-15` 存在。

不得修改系统 PATH、注册表、服务、防火墙、TLS 或 SSH 主机密钥验证。保留旧程序目录与数据备份；
失败时停止新候选并回到最后获准使用的冻结版本，不删除任何历史候选或证据。

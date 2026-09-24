# A9-16 / WIN7-34 响应式工作台 UI 子集实机验收

WIN7-34 是 A9-16 §4 U01–U07（左侧对话区与左右栏自适应）的**修正候选**，决策记录为 ADR-0130；
它换发自实机 G2 自动产品 smoke 在候选自身驱动加载顺序上硬失败的 WIN7-33（见下节），WIN7-33 的冻结
身份、失败报告与全部证据原样留档。不得覆盖、改名或改判 WIN7-22～WIN7-33 任何候选、证据与结论。
验收结果只可签发 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`，不重签 `A9_14_WIN7_22_GO_FOR_ALPHA`
与 `A9_15_WIN7_UI_INTEGRATION_PASS`，也不构成 Alpha 2 或 RC PASS。Review（R01–R05）与
Shell 运行中输出（S01–S06）**不在本候选内**，Review 入口维持 disabled + fail-closed（ADR-0096）。

## WIN7-33 G2 失败与 WIN7-34 换发

WIN7-33 在 `10.134.115.40` 以普通用户 `dccs-chaizl-pc\agent`、Medium/non-elevated 令牌执行 run
`15f2c247-d5e1-4c82-8d9f-c34759cf9a4f`（Session 11，真实 1366×768 / 120 DPI，即真实 125%）。
G0 宿主预检与 G1 包完整性均 PASS（`W33PKG-IDENTITY-AUTHORITY-FULL-TREE-ZIP`、
`W33PKG-RUNTIME-ABI`）；**G2 自动产品 smoke 硬失败**：

```text
Error: app.disableHardwareAcceleration() can only be called before app is ready
    at Object.<anonymous> (resources/app/product/main.js:21:39)
    at main (validation/a9-win7-33-driver.cjs:313:3)
```

四个驱动阶段（first / second / retry / stop）全部 `status: ERROR`、`cases` 为空，两个本机回环
fixture 的请求计数均为 0，批准目标文件未删除，未产出任何投影附件。按 fail-closed，G3 首绘硬门与
15 项用例全部记 `NOT_PERFORMED`，正式 verifier 输出 `status=FAIL`、`verified_cases=15`、
`direct_current_candidate_cases=0`，候选不可签发。

根因是**单点、可复现且仅 Windows 触发**的加载顺序冲突：WIN7-33 的修复为让 Win7 首绘恢复而在
`main.js` 模块顶层无条件调用 `app.disableHardwareAcceleration()`；该调用只在 `app.ready` 之前
合法。打包入口在 ready 前加载 `main.js`，因此生产路径正确；但候选自家的验收驱动在
`app.whenReady().then(main)` 之内才 `require` 产品入口，于是该调用必然在 ready 之后执行并抛错。
非 Windows 平台跳过该调用，因此开发机双构建逐字节一致与候选外 verifier 预检都无法发现。

因此换发 WIN7-34：把该调用改为**按就绪状态守卫**——

```js
if (process.platform === 'win32' && !app.isReady()) app.disableHardwareAcceleration();
```

打包入口仍在 ready 前加载本模块，Windows 软件渲染策略照旧生效；此后加载本模块的 harness 不再能把
一次非法迟到调用变成产品启动失败。修正只改这一处调用条件，不扩大能力范围、不改变 15 项用例集、
不弱化断言，也不修改 native helper、IPC、SQLite、权限、秘密或依赖；WIN7-33 与 WIN7-32 的 renderer
容量修复与短高度左栏布局原样继承。

WIN7-33（ZIP SHA-256 `ab885f43c5285ebe81351ca5841f33399cb58b750b16cb8367fd2c760b08984c`）及上述
run 的报告（`status=FAIL`，`disposition=FIX_BEFORE_REISSUE`）与全部原始证据**保留为失败候选证据，
不得删除、改写或复用哈希改判**。

## 硬门与顺序

1. 候选必须来自干净、已提交源码，manifest 必须为 `source_dirty=false`、
   `external_acceptance_eligible=true`。两份独立源码工作树构建结果须逐字节一致。
2. 候选外 release authority 必须在候选 ZIP、manifest 与源码提交确定后独立批准；批准文件和其
   SHA-256 pin 都不能从候选或 sidecar 自行推导后冒充批准。
3. 在可信开发机先运行仓库内 verifier 预检。Win7 上先以普通用户、非提升令牌运行
   `RUN_A9_16_W34_INTEGRITY.cmd`，成功后才可启动自动产品 smoke。
4. G2 自动产品 smoke 必须在本候选内先通过（退出码 0 且 `status` 为 `PASS`）。驱动加载产品入口的
   顺序属于硬门的一部分：任何「候选自身 gate 无法运行产品链路」的情形判 FAIL，未执行项保持
   `NOT_PERFORMED`。
5. 自动 fixture smoke 只覆盖确定性产品链路，不满足真实 Provider 用例，也不能代替 U01–U07 的
   人工几何与视觉观察。真实 Provider 必须由普通用户在设置中配置，秘密不得进入命令、事件、
   截图或报告。
6. 任何硬门失败立即停止后续签发；未执行项保持 `NOT_PERFORMED`，失败证据保留在候选外。

## ADR-0130 候选范围

- Windows 渲染策略按 `app.isReady()` 守卫；打包入口行为与 WIN7-33 完全一致。
- 左侧对话区三段式（brand / 工作区与产品导航 / 搜索与对话列表）与单行"标题 + 状态·时间"行密度。
- 桌面四态（左右栏独立开关的四种组合）由 `.workbench` 的 `rail-closed`/`inspector-closed`
  状态类驱动，**只切类不重建 DOM**；折叠栏以 `visibility` 隐藏并保留滚动位置。
- 抽屉态（`.open` + backdrop）与桌面折叠态是两个互不复用的状态机；跨断点缩放只做状态机收敛与
  `aria-expanded` 重推，不得在桌面断点折叠侧栏。
- 断点沿用既有 1200px（Inspector）与 800px（导航）；1366×768 位于桌面态。
- 侧栏状态维持会话内，不做跨重启持久化；信任注记默认折叠；"进行中 / 更早"按 `activity` 分组。

## 用例集（15 项）

继承 WIN7-28 合同（`W34-01`～`W34-10`，含投影 `W34-09` 与分页 `W34-10`）并新增 5 项 UI 用例：

- `W34-11-LEFT-PANE-DENSITY-AND-CAPACITY`（U01/U02）：三段式分区不重叠；每行单行不折行；
  **最坏形态（2 组头 + 归档区）下至少 4 条对话行完整可见**；行高保持 36px，容量靠压缩固定
  chrome 而非缩小行高达成；组头按 `activity` 字段。
- `W34-12-DESKTOP-FOUR-STATE-DOM-KEEPALIVE`（U03/U04/U05）：四态均可到达且状态类正确；
  任一态切换后 `scrollWidth`/`scrollHeight` 无溢出；两个头部开关的 `aria-expanded` 与视觉一致；
  切换不重建对话列表 DOM（节点身份保持）；折叠栏保留滚动位置且用 `visibility` 而非 `display:none`。
- `W34-13-BREAKPOINT-CONVERGENCE-REGRESSION`（U06）：双向跨越 1200px/800px 均不得在桌面断点设置
  `rail-closed`/`inspector-closed`；抽屉态与桌面折叠态不跨断点复用；≤799px 无残留 `.rail-closed`
  造成的 0 宽网格列；缩放只做状态机收敛与 `aria-expanded` 重推。
- `W34-14-KEYBOARD-AND-FOCUS-CONTRACT`（U07）：Ctrl+K 聚焦搜索、清空后不丢焦点；Ctrl+I 关闭
  Inspector 并把焦点交还头部开关；增量搜索保持焦点、滚动位置与展开的活动状态；无键盘路径把焦点
  留在隐藏或折叠元素上。
- `W34-15-REAL-125-PERCENT-DPI-LAYOUT`（首要复核项）：**必须是真实 1366×768 × 125% DPI**，
  不接受 Chromium 缩放代理；记录 DPI 来源；最坏形态完整行数达标；四态在真实 125% DPI 下均无溢出。

`W34-15` 同时复验 WIN7-32 已证实的 Win7 首绘失败与真实 DPI 容量点；开发机同引擎量测虽已达到 4 行，仍
**不得据此宣称物理 Win7 达标**。

## 导出契约（沿用 WIN7-28，不得漂移）

- DOM 导出附件的行字段固定为 snake_case：`event_id`、`turn_id`、`event_type`、`text`；driver 内部
  camelCase 观察值必须在写附件时显式转换，否则被 `A9_W34_PROJECTION_DOM_KIND_INVALID` 拒绝。
- 终态事实按"显式 payload 优先、事件类型兜底"推导；全局结果必须显式为 `completed · verified`。
- 自动 smoke 会在候选外证据根上直接调用正式报告器的解析函数核对投影附件
  （`A9-W34-PROJECTION-ARTIFACTS-REPORT-PARSEABLE`），格式漂移必须在开发机或候选内 smoke 即失败。

## 候选外批准格式

`release-authority.json`：

```json
{
  "schema_version": 1,
  "kind": "WIN7_34_RELEASE_AUTHORITY",
  "status": "APPROVED_FOR_WIN7_34_VALIDATION",
  "formal_input_lock_sha256": "<a9-16-win7-34-input-lock.json SHA-256>",
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
RUN_A9_16_W34_INTEGRITY.cmd <原始ZIP> <外部正式lock> <外部批准清单> <外部批准记录> <独立批准记录SHA256>

set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-34-smoke.cjs --evidence-root=<候选外证据目录>
set "ELECTRON_RUN_AS_NODE="
```

自动 smoke 使用本机回环 fixture，必须明确记录 `real_provider=NOT_PERFORMED_BY_AUTOMATIC_FIXTURE_SMOKE`。
它覆盖继承的确定性链路，**不覆盖 U01–U07 的几何、DPI 与视觉观察**。随后由普通用户打开正式
`electron.exe`，按 `A9_16_VALIDATION_KIT.json` 完成 15 项用例，其中 `W34-11`～`W34-15` 必须提供
真实 1366×768 × 125% DPI 下的截图与几何量测。最后生成报告模板：

```text
set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-34-report.cjs init --kit A9_16_VALIDATION_KIT.json --release-manifest release-manifest.json --zip <原始ZIP> --formal-input-lock <外部正式lock> --approval-registry <外部批准清单> --release-authority <外部批准记录> --release-authority-sha256 <独立批准SHA256> > ..\a9-win7-34-evidence\report-template.json
set "ELECTRON_RUN_AS_NODE="
```

填入实际证据后用 `RUN_WIN7_34_REPORT_VERIFY.cmd` 校验。每个 PASS 必须绑定同一候选身份、普通用户
非提升环境、全部 assertion 与候选外文件哈希；真实 Provider 用例还必须写明
`provider_kind=REAL_NON_FIXTURE`、`provider_probe=tool_calling`。报告器拒绝秘密字段和秘密样式内容。
**15 项用例缺一即不得签发**：包完整性与报告器都会显式要求 `W34-11`～`W34-15` 存在。

不得修改系统 PATH、注册表、服务、防火墙、TLS 或 SSH 主机密钥验证。保留旧程序目录与数据备份；
失败时停止新候选并回到最后获准使用的冻结版本，不删除任何历史候选或证据。

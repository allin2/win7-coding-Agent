# A9-19 / WIN7-37 运行过程实时可见与工作台布局二期实机验收

WIN7-37 在不可变的 WIN7-36 之上承接 A9-19（决策 ADR-0136）：运行中轮次的过程与模型输出实时可见、基线扫描让出事件循环、
工作台布局二期，以及对话/工作区切换后保持桌面左栏。WIN7-36 的 ZIP SHA-256 为
`8f730c5ae9ab86d83ecbfe3033a00e32a935dd5217d3ab30e4c75710adbe2a3a`，其冻结身份、报告、authority 与证据原样留档；
不得覆盖、改名或改判 WIN7-22～WIN7-36 任何候选、证据与结论。

验收结果只可签发 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`。不重签 `A9_14_WIN7_22_GO_FOR_ALPHA`、
`A9_15_WIN7_UI_INTEGRATION_PASS`、`A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`，也不构成 Alpha 2、Review、Shell streaming 或 RC PASS。
版本与能力集沿用 `0.3.0-alpha.1`；Review 入口继续 fail-closed，Shell 运行中增量输出不开放（工具卡如实标注“输出将在命令结束后显示”）。

## 硬门与顺序

1. 候选必须来自干净、已提交源码，manifest 为 `source_dirty=false`、`external_acceptance_eligible=true`，两份独立源码工作树构建逐字节一致。
2. 候选外 release authority 必须在候选 ZIP、manifest 与源码提交确定后独立批准；批准文件与其 SHA-256 pin 不得从候选或 sidecar 推导。
3. 在可信开发机先运行仓库内 verifier 预检。Win7 上先以普通用户、非提升令牌运行 `RUN_A9_19_W37_INTEGRITY.cmd`，成功后才可启动自动 smoke。
4. G2 自动 smoke 必须通过（退出码 0 且 `status` 为 `PASS`）。它继承 WIN7-36 的四阶段、迟到加载与受控 ERROR 两个反例、非零退出码与
   零残留要求，并新增第五阶段 `live`：延迟流式 fixture 下核对运行中工具卡、模型说明与输出预览在轮次完成前出现，逐项“落盘 → DOM 可见”
   ≤1.5 s，预览在完成后消失，本次随机测试密钥及其前缀不出现在界面、预览或任何报告中。
5. 自动 fixture smoke 不满足真实 Provider 用例，也不能代替真实 1366×768 × 125% DPI 下的几何与视觉观察。真实 Provider 必须由普通用户在
   设置中配置，秘密不得进入命令、事件、截图或报告。
6. 任何硬门失败立即停止后续签发；未执行项保持 `NOT_PERFORMED`，失败证据保留在候选外。

## 用例集（21 项）

继承 WIN7-36 的 `W37-01`～`W37-15`（语义不变，≤799px 抽屉分支仍 `PRODUCT_UNREACHABLE / NOT_VERIFIED`），新增：

- `W37-16-LIVE-PROCESS`：G2 `live` 阶段自动断言运行中工具卡（含“已运行 N 秒 · 执行中”）与模型说明在 `turn_completed` 前进入产品 DOM，
  逐项延迟 ≤1.5 s；G3 以真实 Provider 复核，提交每秒“落盘事件计数 vs DOM”时间线与每 2 秒截图。
- `W37-17-LIVE-MODEL-PREVIEW`：G2 断言“模型正在输出”预览在完成前出现、完成后消失，拆分到多个 chunk 的测试密钥与其前缀零命中；
  G3 以真实 Provider 复核至少一次采样中预览字符数 > 0 且早于完成。
- `W37-18-ROW-TITLES`：真实 1366×768 × 125% DPI 下左栏前 6 行各可见至少 6 个中文字符宽度的标题，时间为短格式（刚刚 / HH:mm / M月D日）。
- `W37-19-CONVERSATION-HEIGHT`：实际 1079×540 内容视口下，运行中对话流高度 ≥ 视口高度 55%。
- `W37-20-RAIL-PRESERVED`：桌面宽度下选择工作区、新建与切换对话后 `.workbench` 无 `rail-closed`、导航开关 `aria-expanded="true"`、左栏可见
  （G2 自动断言 + G3 截图）。
- `W37-21-HEADER-AND-LABELS`：头部只显示权限、运行状态与检查器开关；界面无 `REQUEST`/`CONVERSATIONS`/`INSPECTOR`/`AGENT /`/`CURRENT TASK`/
  `tool_calling`；左栏无 Review 页签与常驻停止按钮（G2 自动断言 + G3 截图）。

已知残留（不作为通过条件，报告中如实列出）：基线冻结末尾的 checkpoint 往返校验在大工作区上仍会同步占用主进程约 0.4 s；
Shell 真正增量输出（A9-16 S01–S06）不在本候选内。

## 候选外批准格式

`release-authority.json`：

```json
{
  "schema_version": 1,
  "kind": "WIN7_37_RELEASE_AUTHORITY",
  "status": "APPROVED_FOR_WIN7_37_VALIDATION",
  "formal_input_lock_sha256": "<a9-19-win7-37-input-lock.json SHA-256>",
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
RUN_A9_19_W37_INTEGRITY.cmd <原始ZIP> <外部正式lock> <外部批准清单> <外部批准记录> <独立批准记录SHA256>

set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-37-smoke.cjs --evidence-root=<候选外证据目录>
set "ELECTRON_RUN_AS_NODE="
```

自动 smoke 使用本机回环 fixture，必须明确记录 `real_provider=NOT_PERFORMED_BY_AUTOMATIC_FIXTURE_SMOKE`。随后由普通用户打开正式
`electron.exe`，按 `A9_19_VALIDATION_KIT.json` 完成 21 项用例。最后生成报告模板：

```text
set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-37-report.cjs init --kit A9_19_VALIDATION_KIT.json --release-manifest release-manifest.json --zip <原始ZIP> --formal-input-lock <外部正式lock> --approval-registry <外部批准清单> --release-authority <外部批准记录> --release-authority-sha256 <独立批准SHA256> > ..\a9-win7-37-evidence\report-template.json
set "ELECTRON_RUN_AS_NODE="
```

填入实际证据后用 `RUN_WIN7_37_REPORT_VERIFY.cmd` 校验。每个 PASS 必须绑定同一候选身份、普通用户非提升环境、全部 assertion 与候选外文件哈希；
真实 Provider 用例还必须写明 `provider_kind=REAL_NON_FIXTURE`、`provider_probe=tool_calling`。报告器拒绝秘密字段和秘密样式内容。
**21 项用例缺一即不得签发**：包完整性与报告器都会显式要求 `W37-11`～`W37-21` 存在。

不得修改系统 PATH、注册表、服务、防火墙、TLS 或 SSH 主机密钥验证。保留旧程序目录与数据备份；失败时停止新候选并回到最后获准使用的冻结版本，
不删除任何历史候选或证据。

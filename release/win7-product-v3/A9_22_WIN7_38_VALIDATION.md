# A9-22 / WIN7-38 换发与实机验收

WIN7-38 在不可变的 WIN7-37 之上承接 A9-20 与 A9-21（决策 ADR-0141）：
- A9-20：Git 外部写确认分类器绕过修复（三态分析、CMD/PowerShell/POSIX 壳载荷开关前缀与引号相连解包、PowerShell 位置参数解包、超过 256 KiB 兜底拦截、含外部写的 Shell 命令不计为验证证据）；
- A9-21：运行时加固移植（M1 启动定向恢复、M1b URL 凭据脱敏正则线性化、M2 模型输出上限与增量截断、M3 checkpoint 列表分页、M4 事件与被拦截请求集合上限）。

WIN7-37 的 ZIP SHA-256 为 `4d70063254212ca581b7b3dac9f89edc81a2ba31a53b51a6b1c1d65667f167cf`，其冻结身份、报告、authority 与证据原样留档；不得覆盖、改名或改判 WIN7-22～WIN7-37 任何候选、证据与结论。

验收结果只可签发 `A9_22_WIN7_38_A9_20_A9_21_PASS`。不重签 `A9_14_WIN7_22_GO_FOR_ALPHA`、`A9_15_WIN7_UI_INTEGRATION_PASS`、`A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`、`A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`，也不构成 Alpha 2、Review、Shell streaming 或 RC PASS。
版本与能力集沿用 `0.3.0-alpha.1`；Review 入口继续 fail-closed，Shell 运行中增量输出不开放。

## 硬门与顺序

1. 候选必须来自干净、已提交源码，manifest 为 `source_dirty=false`、`external_acceptance_eligible=true`，两份独立源码工作树构建逐字节一致。
2. 候选外 release authority 必须在候选 ZIP、manifest 与源码提交确定后独立批准；批准文件与其 SHA-256 pin 不得从候选或 sidecar 推导。
3. 在可信开发机先运行仓库内 verifier 预检。Win7 上先以普通用户、非提升令牌运行 `RUN_A9_22_W38_INTEGRITY.cmd`，成功后才可启动自动 smoke。
4. G2 自动 smoke 必须通过（退出码 0 且 `status` 为 `PASS`）。包含完整任务旅程、迟到加载与受控 ERROR 反例、非零退出码与零残留，以及 W38 专属断言。
5. 自动 fixture smoke 不满足真实 Provider 用例。真实 Provider 必须由普通用户在设置中配置，秘密不得进入命令、事件、截图或报告。
6. 任何硬门失败立即停止后续签发；未执行项保持 `NOT_PERFORMED`，失败证据保留在候选外。

## 用例集（15 项）

- `W38-01-CANDIDATE-INTEGRITY`：候选完整性、所有内部文件、输入锁、validation kit 与 authority 签名 pin。
- `W38-02-CHINESE-SPACE-PATH`：解压至中文+空格路径并验证运行。
- `W38-03-STARTUP-WORKSPACE-SELECT`：首次启动与工作区选择，Renderer 无 Node/process 权限。
- `W38-04-TASK-READ-EDIT-SHELL`：一次完整任务（read、edit、shell）。
- `W38-05-DIFF-AND-CHECKPOINT`：改动产生 checkpoint 并展示 Diff。
- `W38-06-APPROVAL-STOP-RESTART`：审批拒绝零副作用、停止与子进程回收、重启后恢复。
- `W38-07-A9-20-CMD-CONCAT-GIT-CONFIRM`：`cmd /c"git push origin main"` 触发目标绑定确认；拒绝后零副作用。
- `W38-08-A9-20-POWERSHELL-PREFIX-GIT-CONFIRM`：PowerShell 参数前缀（如 `powershell -co "git push origin main"`）触发确认；拒绝后零副作用。
- `W38-09-A9-20-POWERSHELL-POSITIONAL-GIT-CONFIRM`：PowerShell 位置参数（如 `powershell "git push origin main"`）触发确认；拒绝后零副作用。
- `W38-10-M1-STARTUP-TARGETED-RECOVERY`：预置 >= 100 历史 Turn（含 1 中断缺 checkpoint）启动耗时与定向恢复。
- `W38-11-M1B-HEX-FREEZE-AND-URL-REDACTION`：1 MiB 单行十六进制文件冻结基线与检查点不卡顿；诊断/事件中的 `https://u:p@host` 被脱敏。
- `W38-12-M2-OUTPUT-LIMITS`：本地回环模型桩返回超过 1 MiB 内容：截断说明可见，工具不执行，轮次为 `COMPLETED_WITH_WARNINGS`；下一轮正常。
- `W38-13-M3-CHECKPOINT-PAGINATION`：预置 60 条以上 checkpoint：检查器显示“最近 10 / 共 N”，加载更早记录连续，对更早记录执行 Diff。
- `W38-14-M4-COLLECTION-BOUNDS`：预置或运行超过 2000 条事件：界面提示省略数量，过程记录连续，内存不随事件数无限增长。
- `W38-15-SECRET-SCAN-AND-POSTFLIGHT`：秘密扫描零命中，后飞行零残留。

## 候选外批准格式

`release-authority.json`：

```json
{
  "schema_version": 1,
  "kind": "WIN7_38_RELEASE_AUTHORITY",
  "status": "APPROVED_FOR_WIN7_38_VALIDATION",
  "formal_input_lock_sha256": "<a9-22-win7-38-input-lock.json SHA-256>",
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
RUN_A9_22_W38_INTEGRITY.cmd <原始ZIP> <外部正式lock> <外部批准清单> <外部批准记录> <独立批准记录SHA256>

set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-38-smoke.cjs --evidence-root=<候选外证据目录>
set "ELECTRON_RUN_AS_NODE="
```

自动 smoke 使用本机回环 fixture，记录 `real_provider=NOT_PERFORMED_BY_AUTOMATIC_FIXTURE_SMOKE`。随后由普通用户打开正式 `electron.exe`，按 `A9_22_VALIDATION_KIT.json` 完成用例。最后生成报告模板：

```text
set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-38-report.cjs init --kit A9_22_VALIDATION_KIT.json --release-manifest release-manifest.json --zip <原始ZIP> --formal-input-lock <外部正式lock> --approval-registry <外部批准清单> --release-authority <外部批准记录> --release-authority-sha256 <独立批准SHA256> > ..\a9-win7-38-evidence\report-template.json
set "ELECTRON_RUN_AS_NODE="
```

填入实际证据后用 `RUN_WIN7_38_REPORT_VERIFY.cmd` 校验。

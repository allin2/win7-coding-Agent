# A9-15 / WIN7-26 UI 过程反馈实机验收

WIN7-26 是 A9-15 重启投影验证缺口修复的新候选；不得覆盖、改名或改判 WIN7-25。验收结果只可签发
`A9_15_WIN7_UI_INTEGRATION_PASS`，不重签 `A9_14_WIN7_22_GO_FOR_ALPHA`，也不构成 RC PASS。

## 硬门与顺序

1. 候选必须来自干净、已提交源码，manifest 必须为 `source_dirty=false`、
   `external_acceptance_eligible=true`。两份独立源码工作树构建结果须逐字节一致。
2. 候选外 release authority 必须在候选 ZIP、manifest 与源码提交确定后独立批准；批准文件和其
   SHA-256 pin 都不能从候选或 sidecar 自行推导后冒充批准。
3. 在可信开发机先运行仓库内 verifier 预检。Win7 上先以普通用户、非提升令牌运行
   `RUN_A9_15_W26_INTEGRITY.cmd`，成功后才可启动正式 `electron.exe`。
4. 自动 fixture smoke 只覆盖确定性产品链路，不满足真实 Provider 用例。真实 Provider 必须由普通用户
   在设置中配置，秘密不得进入命令、事件、截图或报告。
5. 任何硬门失败立即停止后续签发；未执行项保持 `NOT_PERFORMED`，失败证据保留在候选外。

## WIN7-26 新增投影断言

- `W26-03-INSPECTOR-PERSISTED-RESTART-A01`～`A04`：正常退出并重启后，从正式
  `a9.events.query` 导出当前会话 event ID、turn ID、内容与顺序；Inspector DOM 导出必须与查询范围逐项一致、
  event ID 唯一，包含无 turnId 的会话事件以及工具/终态事件。切换会话后不得残留上一会话内容，分页必须
  使用 `beforeEventId` 且跨会话查询必须拒绝。
- `W26-04-LATEST-OUTCOME-PROJECTION-A01`～`A04`：通过正式 Provider 链路先形成
  `failed · not_applicable` 轮次，再形成 `completed · verified` 轮次。报告必须绑定两者的 turn/event ID，
  证明旧 event ID 小于新 event ID；重启以及补载旧失败详情后，最新持久化 turn ID 与 DOM 全局结果均须保持
  `completed · verified`。

上述两个用例的每次执行必须提供 `projection_evidence`，其中 DOM 导出文件的路径与 SHA-256 还须出现在
`evidence` 列表。报告器会解析顺序、身份、结果值和文件绑定；缺失任一新增 assertion、缺失投影字段、
旧失败晚于新成功、DOM 结果不一致，或任一 assertion 为 FAIL，均不得签发 PASS。

## 候选外批准格式

`release-authority.json`：

```json
{
  "schema_version": 1,
  "kind": "WIN7_26_RELEASE_AUTHORITY",
  "status": "APPROVED_FOR_WIN7_26_VALIDATION",
  "formal_input_lock_sha256": "<a9-15-win7-26-input-lock.json SHA-256>",
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
RUN_A9_15_W26_INTEGRITY.cmd <原始ZIP> <外部正式lock> <外部批准清单> <外部批准记录> <独立批准记录SHA256>

set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-26-smoke.cjs --evidence-root=<候选外证据目录>
set "ELECTRON_RUN_AS_NODE="
```

自动 smoke 使用本机回环 fixture，必须明确记录 `real_provider=NOT_PERFORMED_BY_AUTOMATIC_FIXTURE_SMOKE`。
它会在候选外的本次 run root 创建临时 Electron 验证副本和 driver app；副本只承载验证入口，真正被测
产品仍是候选内 `resources/app/product/main.js` 及其正式 preload/IPC/renderer。三份 phase 报告、mode、
journey/stop fixture 请求和全部断言缺一不可，不能用进程退出码或窗口出现代替。
随后由普通用户打开正式 `electron.exe`，按 `A9_15_VALIDATION_KIT.json` 完成真实 Provider、多工具过程、
等待超过 10 秒、审批/失败、历史分页、搜索/焦点、截图与 postflight。最后生成报告模板：

```text
set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-26-report.cjs init --kit A9_15_VALIDATION_KIT.json --release-manifest release-manifest.json --zip <原始ZIP> --formal-input-lock <外部正式lock> --approval-registry <外部批准清单> --release-authority <外部批准记录> --release-authority-sha256 <独立批准SHA256> > ..\a9-win7-26-evidence\report-template.json
set "ELECTRON_RUN_AS_NODE="
```

填入实际证据后用 `RUN_WIN7_26_REPORT_VERIFY.cmd` 校验。每个 PASS 必须绑定同一候选身份、普通用户
非提升环境、全部 assertion 与候选外文件哈希；真实 Provider 用例还必须写明
`provider_kind=REAL_NON_FIXTURE`、`provider_probe=tool_calling`。报告器拒绝秘密字段和秘密样式内容。

不得修改系统 PATH、注册表、服务、防火墙、TLS 或 SSH 主机密钥验证。保留旧程序目录与数据备份；
失败时停止新候选并回到最后获准使用的冻结版本，不删除任何历史候选或证据。

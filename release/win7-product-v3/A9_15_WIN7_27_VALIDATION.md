# A9-15 / WIN7-27 投影证据与集成断言修复实机验收

WIN7-27 是 A9-15 四项 P2 修复（ADR-0120）的新候选；不得覆盖、改名或改判 WIN7-25、WIN7-26。
验收结果只可签发 `A9_15_WIN7_UI_INTEGRATION_PASS`，不重签 `A9_14_WIN7_22_GO_FOR_ALPHA`，也不构成 RC PASS。

## 硬门与顺序

1. 候选必须来自干净、已提交源码，manifest 必须为 `source_dirty=false`、
   `external_acceptance_eligible=true`。两份独立源码工作树构建结果须逐字节一致。
2. 候选外 release authority 必须在候选 ZIP、manifest 与源码提交确定后独立批准；批准文件和其
   SHA-256 pin 都不能从候选或 sidecar 自行推导后冒充批准。
3. 在可信开发机先运行仓库内 verifier 预检。Win7 上先以普通用户、非提升令牌运行
   `RUN_A9_15_W27_INTEGRITY.cmd`，成功后才可启动正式 `electron.exe`。
4. 自动 fixture smoke 只覆盖确定性产品链路，不满足真实 Provider 用例。真实 Provider 必须由普通用户
   在设置中配置，秘密不得进入命令、事件、截图或报告。
5. 任何硬门失败立即停止后续签发；未执行项保持 `NOT_PERFORMED`，失败证据保留在候选外。

## ADR-0120 四项修复

- **R1 机器可读投影证据**：Inspector 与最新轮次投影不再使用报告中手填的平行字段，而是候选外的
  `A9_PROJECTION_QUERY_EXPORT` 与 `A9_PROJECTION_DOM_EXPORT` 附件。报告器实际读取并解析附件字节，
  从附件推导会话身份、event/turn ID、顺序、去重与终端结果，再与报告字段交叉核对；内容矛盾、
  附件未绑定到 `evidence` 列表、旧新轮次使用同一 turn ID 一律拒绝。
- **R2 driver 逐行核对与负向敏感性**：Inspector 按有界显示范围（`LAST_60_BY_EVENT_ID_ASC`，最多 60 行）
  逐行核对身份、顺序、内容与去重，并对观察值副本做缺行、乱序、重复、跨会话残留变异；每种变异都必须
  被同一断言拒绝。切换会话不得残留上一会话内容，切回后逐行复原。
- **R3 恢复原有集成断言**：`W27-04-APPROVAL-FAILURE-ORDER` 恢复审批先于恢复工具活动、拒绝零目标副作用、
  失败/取消/清理不得标记成功、历史查询失败重试可见且无重复事件四项断言，并在其上追加投影验收。
- **R4 driver 协议隔离**：新 driver 流程由 `A9_SMOKE_DRIVER_PROTOCOL=projection` 显式启用，只作用于支持该
  协议的 WIN7-27 开发机 fixture；缺省 legacy 路径不发送投影专用提示词，保证 W23/W24/W25 历史 profile 的
  fixture 协议保持兼容。

## WIN7-27 投影断言

- `W27-03-INSPECTOR-PERSISTED-RESTART-A01`～`A04`：正常退出并重启后，从正式 `a9.events.query`
  导出机器可读查询附件，Inspector DOM 附件必须与查询附件的有界显示范围逐行一致（event ID、turn ID、
  内容、顺序、去重），包含无 turnId 的会话事件以及工具/终态事件；切换会话后不得残留上一会话内容，
  切回后逐行复原。
- `W27-04-APPROVAL-FAILURE-ORDER-A01`～`A04`：`approval_resolved` 必须先于恢复后的 `tool_start` 持久化；
  拒绝必须零目标副作用；非零退出/工具错误/取消/未知清理不得标记为成功；历史查询失败后的重试必须可见
  且不产生重复事件。
- `W27-09-LATEST-OUTCOME-PROJECTION-A01`～`A04`：通过正式 Provider 链路先形成 `failed · not_applicable`
  轮次，再形成 `completed · verified` 轮次，两者必须使用不同 turn ID。重启以及补载旧失败详情后，最新
  持久化 turn ID 与 DOM 全局结果均须保持 `completed · verified`；旧失败与新成功复用同一 turn ID 必须拒绝。

`W27-03` 与 `W27-09` 的每次执行必须提供 `projection_evidence`，其中附件路径与 SHA-256 还须出现在
`evidence` 列表。报告器会解析顺序、身份、结果值和文件绑定；缺失任一新增 assertion、缺失投影字段、
附件非 JSON、旧失败晚于新成功、DOM 行数/顺序/身份不一致、跨会话残留，或任一 assertion 为 FAIL，
均不得签发 PASS。

### 导出契约（开发机实测确定，不得漂移）

- DOM 导出附件的行字段固定为 snake_case：`event_id`、`turn_id`、`event_type`、`text`；driver 内部的
  camelCase 观察值必须在写附件时显式转换。报告器只接受该约定，camelCase 行会被
  `A9_W27_PROJECTION_DOM_ROW_INVALID` 拒绝。
- 终态事实按"显式 payload 优先、事件类型兜底"推导：产品只在 `turn_completed` 上持久化
  `outcome`/`verification`（其值可能是 `completed · verified`，也可能是 `blocked · not_applicable`，
  因此全局结果必须显式为 `completed · verified` 才算通过）；`turn_failed` 事件的
  `outcome`/`verification` 为空，其 `failed · not_applicable` 语义由事件类型承载。
- 自动 smoke 会在候选外证据根上直接调用正式报告器的解析函数核对刚生成的投影附件
  （`A9-W27-PROJECTION-ARTIFACTS-REPORT-PARSEABLE`），格式漂移必须在开发机或候选内 smoke 即失败，
  不得留到 Win7 报告签发时才暴露。

## 候选外批准格式

`release-authority.json`：

```json
{
  "schema_version": 1,
  "kind": "WIN7_27_RELEASE_AUTHORITY",
  "status": "APPROVED_FOR_WIN7_27_VALIDATION",
  "formal_input_lock_sha256": "<a9-15-win7-27-input-lock.json SHA-256>",
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
RUN_A9_15_W27_INTEGRITY.cmd <原始ZIP> <外部正式lock> <外部批准清单> <外部批准记录> <独立批准记录SHA256>

set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-27-smoke.cjs --evidence-root=<候选外证据目录>
set "ELECTRON_RUN_AS_NODE="
```

自动 smoke 使用本机回环 fixture，必须明确记录 `real_provider=NOT_PERFORMED_BY_AUTOMATIC_FIXTURE_SMOKE`。
它会在候选外的本次 run root 创建临时 Electron 验证副本和 driver app；副本只承载验证入口，真正被测
产品仍是候选内 `resources/app/product/main.js` 及其正式 preload/IPC/renderer。三份 phase 报告、mode、
journey/stop fixture 请求和全部断言缺一不可，不能用进程退出码或窗口出现代替。投影协议附件的生成范围
限定在启用 `A9_SMOKE_DRIVER_PROTOCOL=projection` 的开发机 fixture，不得据此推断历史候选结论。
随后由普通用户打开正式 `electron.exe`，按 `A9_15_VALIDATION_KIT.json` 完成真实 Provider、多工具过程、
等待超过 10 秒、审批/失败、历史分页、搜索/焦点、截图与 postflight。最后生成报告模板：

```text
set "ELECTRON_RUN_AS_NODE=1"
electron.exe validation\a9-win7-27-report.cjs init --kit A9_15_VALIDATION_KIT.json --release-manifest release-manifest.json --zip <原始ZIP> --formal-input-lock <外部正式lock> --approval-registry <外部批准清单> --release-authority <外部批准记录> --release-authority-sha256 <独立批准SHA256> > ..\a9-win7-27-evidence\report-template.json
set "ELECTRON_RUN_AS_NODE="
```

填入实际证据后用 `RUN_WIN7_27_REPORT_VERIFY.cmd` 校验。每个 PASS 必须绑定同一候选身份、普通用户
非提升环境、全部 assertion 与候选外文件哈希；真实 Provider 用例还必须写明
`provider_kind=REAL_NON_FIXTURE`、`provider_probe=tool_calling`。报告器拒绝秘密字段和秘密样式内容。

不得修改系统 PATH、注册表、服务、防火墙、TLS 或 SSH 主机密钥验证。保留旧程序目录与数据备份；
失败时停止新候选并回到最后获准使用的冻结版本，不删除任何历史候选或证据。

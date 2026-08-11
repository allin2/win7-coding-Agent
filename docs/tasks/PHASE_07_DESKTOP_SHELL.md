# PHASE_07 — Desktop Shell 任务书（DESKTOP_SHELL）

> 实现前必读：`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、`docs/SECURITY.md`、`docs/DECISIONS.md`（ADR-0012/0027/0028/0030/0031/0036）、本文档。
> 编号遵守 ADR-0012（阶段 7 = Desktop Shell）。本文档为规划任务书，已获 PC-003 裁决批准（ADR-0036，2026-07-29）。

## 0. 实现授权（ADR-0011 / C14）

```
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: FORMAL_PHASE
Target Branch: phase/07-desktop-shell
Phase-Gate: APPROVED_FOR_IMPLEMENTATION
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: PC-003 ruled 2026-07-29 (ADR-0036); pending SPIKE_01 Go and Phase 06 completion
```

> **PC-003 裁决引用**：PC-003 已于 2026-07-29 由项目负责人裁决通过（ADR-0036），本任务书随裁决置 `APPROVED_FOR_IMPLEMENTATION`。

前置：PC-003 裁决（ADR-0036，已通过）+ SPIKE_01 Go（Electron 22 运行时闭包/GPU 降级可用）+ 阶段 06 完成。

### 0.1 路径白名单（获批后生效）

- `src/shell/**`（Renderer + preload）、`src/shell/main/**`（窗口/Session/Updater 主进程侧）、
  `build/**`（打包配置）、`tests/shell/**`、本文档 §13 验证记录。

禁止路径：其他阶段目录、`src/phase1-2/win7_agent/**`（legacy 冻结，ADR-0029）、已 Accepted ADR 正文。

## 1. 目标

Electron 桌面客户端 UI 与打包交付：会话视图、流式输出、diff 预览与审批、终端面板、
设置与诊断页；Schema 校验的 IPC 边界、CSP + Session 出站过滤、fail-closed Updater（D-016）、
自包含打包与回滚。Renderer 为**最小权限**展示层（C17，非"零权限"——即使关 Node 仍有浏览器网络/导航/Chromium 攻击面），全部能力经 IPC 向 Core 申请。

## 2. 非目标

- 不实现 Agent Core/Policy/Runner（PHASE_06 提供，本层仅消费其 IPC 契约）。
- 不在 Renderer 内直接执行文件/命令/网络（C17）；不实现插件 UI 宿主（ADR-0035，v1.1）。

## 3. Runtime Profile（C15）

- 运行时：Electron 22.3.27 x64（ADR-0028）；`nodeIntegration=false`、`contextIsolation=true`、
  `sandbox` 开启；preload 仅暴露白名单 API（C17）。
- GPU：老显卡黑屏（P17）时按 SPIKE_01 结论启用软件渲染开关，UI 须在软渲染下可用。
- 出站：Session `webRequest` 默认拒绝非白名单出站（仅允许 Gateway 对端）；CSP 禁内联脚本/远程源。
- 资源：常驻内存引用 PERFORMANCE_BUDGET #2（Shell ≤ 上限）；冷启动引用 #1。

## 4. 核心机制

- **IPC 边界**：所有 Renderer↔Core 消息经 JSON Schema 双向校验；未通过校验拒绝并审计（不猜测解析）。
- **会话/流式**：流式事件增量渲染；模型输出按不可信数据处理（不解释为 HTML/脚本，VT/OSC 见 ADR-0031）。
- **diff 审批**：展示 Plan 阶段 diff 与 `base_sha256`（PHASE_04 契约），审批动作回传 Core，Renderer 不直接写盘。
- **执行日志**：按 ADR-0067 只显示非交互 Runner 的有界流式日志；不暴露输入、粘贴或按键通道。
- **Updater**：fail-closed（D-016）——签名/校验失败拒绝更新并保留旧版本；支持回滚到上一版本。
- **打包**：自包含（内嵌运行时 + 依赖），干净卸载无残留（SPIKE_01 判据）。

## 5. 错误模型

| 错误码 | 触发 | 处理 |
|--------|------|------|
| `IPC_SCHEMA_INVALID` | IPC 消息未过 Schema 校验 | 拒绝 + 审计，不部分执行 |
| `RENDERER_CAPABILITY_DENIED` | Renderer 请求越权能力 | 拒绝（C17），提示经 Core 审批路径 |
| `OUTBOUND_BLOCKED` | 非白名单出站 | Session 拦截 + 审计 |
| `UPDATE_VERIFY_FAILED` | 更新包签名/校验失败 | fail-closed 拒绝，保留旧版本（D-016） |
| `GPU_FALLBACK_REQUIRED` | GPU 初始化失败/黑屏 | 切软件渲染（P17），提示用户 |

## 6. 测试矩阵

- IPC：Schema 正/负向；越权能力请求全拒；消息篡改注入拒绝。
- 安全：CSP 生效、内联脚本被拒；Session 出站白名单外全拦（对齐 W7C-05~07、C17）。
- UI：会话/流式/diff 审批/只读执行日志/设置诊断五视图；软件渲染（P17）下可用。
- Updater：签名失败拒绝 + 回滚；断电/中途失败不产生半更新状态。
- 打包/卸载：自包含安装、中文+空格路径、干净卸载零残留（SPIKE_01）。
- 静态门禁 G1~G10；桌面验收 W7C-01~13 全量。

## 7. 验收（E5/E6/E7）

- E5：干净 Win7 端到端桌面闭环（会话→流式→diff 审批→执行→审计→诊断）。
- E6：中文+空格安装路径 + 缺失工具（GPU/Git 缺失降级路径可用）。
- E7：企业代理/CA 下更新与 Gateway 连接（联网组件部分，复用 PHASE_03 环境）。
- W7C-01~13 全量通过；性能项引用 PERFORMANCE_BUDGET #1/#2 实测。
- Win7 实机验收前 Phase-Gate 至多 `READY_FOR_WIN7_VALIDATION`。

## 13. 验证记录

```
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Formal five-view/W7C/E5/E6/E7 contract is not complete
```

ADR-0055 的 MVP 装配增量不改写上述正式 Gate：`src/shell/product/**` 已形成可信本地
main/preload/renderer 入口，开发机 Shell 76 项测试通过；MVP-20260802-14 在 Win7 Electron
22.3.27 x64 上完成启动、Renderer 诊断回传和正常退出，结构化报告为
`validation/report_product_shell_MVP-20260802-14.json`。该证据只关闭“无真实产品入口”缺口，
Runner、持久化、Gateway 装配、五视图、安装器和正式 W7C/E5/E6/E7 仍未完成。

# SPIKE 01 - Win7 运行时基线验证

## 状态

- **任务书**：`docs/tasks/SPIKE_01_WIN7_RUNTIME_BASELINE.md`
- **状态**：APPROVED_FOR_IMPLEMENTATION
- **Win7 实机验证**：PARTIAL（MVP-20260802-05/08/12，ThinkPad T460 / Win7 SP1 x64）
- **成果迁入**：待验证（为 Phase 3-7 提供 Runtime Profile 基线；Go/No-Go 结论须来自 Win7 SP1 x64 实机执行）

> **Win7-Validation: PARTIAL** — 独立 harness 已实测 10 分钟内存、Renderer/IPC 隔离、应用层 HTTP/WS/DNS 阻断、真实崩溃、中文路径和精确清理；MVP-20260802-08 修正网络证据计数后为 `MVP_NETWORK_SURROGATE`。MVP-20260802-12 追加 3 个 utilityProcess 工作集/私有页样本，但 `process.stdin.readable=true`，严格 T03 记录 `FAIL`；stdio 诊断另确认 ignore 变体没有父侧 `utility.stdin`、无数据读入，不能由 Agent 自动放宽正式合同。冷重启、视觉/焦点、抓包和真实双任务负载仍未完成，不能判定正式 Go。

## 目标

验证 Electron 22.3.27 在 Windows 7 SP1 x64 上的最小可行性，确认核心运行时约束可满足。

## 验证矩阵

| ID   | 验证项                                       | 静态检查 | Win7 实机 |
|------|----------------------------------------------|----------|-----------|
| T01  | 冷重启后 Electron 首次启动                   | —        | PARTIAL（未重启） |
| T02  | 10 分钟空闲内存采样                          | —        | PASS（10 个样本） |
| T03  | utilityProcess 内存与 stdin 边界              | —        | FAIL（内存 3 样本；stdin readable=true） |
| T04  | GPU / 黑屏降级                               | —        | OWNER_ACCEPTED_FOR_MVP |
| T05  | 中文+空格路径                                | —        | PASS |
| T06  | 单实例与窗口焦点                             | —        | PARTIAL（焦点未视觉复核） |
| T07  | Renderer / IPC 最小权限                      | —        | PASS |
| T08  | HTTP、WebSocket、DNS 出站控制                | —        | MVP_NETWORK_SURROGATE |
| T09  | 真实崩溃与 dump/log                          | —        | PASS |
| T10  | 精确范围清理                                 | —        | PASS（复测） |
| T11  | 两任务资源采样                               | —        | PARTIAL（无真实负载） |

## 文件结构

```
01-win7-runtime-baseline/
├── package.json        # Electron 22.3.27 最小项目配置
├── main.js             # 最小 Electron 主进程
├── preload.js          # contextBridge 白名单 API
├── renderer/
│   ├── index.html      # 最小验证页面
│   └── renderer.js     # 渲染进程验证逻辑
├── validate.js         # 自动化验证脚本（静态检查）
└── README.md           # 本文件
```

## 使用方法

### 静态验证（现代构建机）

```bash
node validate.js
```

### Win7 实机验证

```bat
REM Win7 不联网安装 npm 依赖；从构建机带入已锁哈希的 Electron 22.3.27 和 acceptance 文件。
C:\acceptance\electron\electron.exe C:\acceptance\mvp_spike01_mvp12\codex_formal_harness.js --report=C:\acceptance\report_spike01_MVP-<MVP-ID>_formal.json --mvp-id=MVP-<MVP-ID> --idle-duration-ms=600000
REM GPU/视觉补充项使用独立 --disable-gpu 变体；不得用它覆盖 T04 人工黑屏结论。
C:\acceptance\electron\electron.exe C:\acceptance\mvp_spike01_mvp12\codex_formal_harness.js --disable-gpu --report=C:\acceptance\report_spike01_MVP-<MVP-ID>_gpu.json --mvp-id=MVP-<MVP-ID> --idle-duration-ms=600000
REM 中文+空格路径必须从预打包目录部署后再执行；路径和报告均须绑定同一 MVP ID。
```

## Go/No-Go 报告模板

```
SPIKE 01 - Go/No-Go 报告
========================
日期: YYYY-MM-DD
Win7 版本: Windows 7 SP1 x64
Electron 版本: 22.3.27

验证结果: 逐项引用 schema v1 原始报告；仅任务书条件全部满足时才写 PASS。

判定: [ GO / NO-GO / MVP_PARTIAL ]

备注:
- 实机：ThinkPad T460 / Win7 SP1 x64 / 16GB / SSD / Intel HD 520 集显
- MVP-20260802-05/08 的独立报告位于 `acceptance/evidence/`；历史共享 harness 报告仅作交叉证据。
- 物理冷启动、抓包、视觉项与真实负载不可由本模板自动标绿。
```

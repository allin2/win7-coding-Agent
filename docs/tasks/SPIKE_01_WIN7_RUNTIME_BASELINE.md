# SPIKE_01 — Win7 运行时基线验证（WIN7_RUNTIME_BASELINE）

> 实现前必读：`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、`docs/PERFORMANCE_BUDGET.md`、本文档。
> 本 Spike 是 Electron 22.3.27 单栈裁决（ADR-0028，Proposed）的阻断门槛；不占用
> ADR-0012 阶段编号（ADR-0034）。

## 0. 实现授权（ADR-0011 / C14）

### 0.1 状态块

```
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: SPIKE
Target Branch: spike/01-win7-runtime-baseline
Phase-Gate: N/A (SPIKE)
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: PC-003 ruled 2026-07-29; scaffolding may proceed on modern build host, but Win7-Validation stays NOT_PERFORMED until executed on Win7 SP1 x64 hardware
```

（PC-003 已于 2026-07-29 由项目负责人裁决通过，本任务书随裁决置
`APPROVED_FOR_IMPLEMENTATION`：允许在 `spike/01-win7-runtime-baseline` 分支按
§0.2 白名单编写脚手架；Go/No-Go 结论必须来自 Win7 SP1 x64 实机执行。）

### 0.2 路径白名单（获批后生效）

- `spikes/01-win7-runtime-baseline/**`（Spike 代码、脚本、README、证据目录）
- 本文档自身（§9 验证记录追加）

禁止路径：`src/**`、其他任务书、`AGENTS.md`、已 Accepted ADR 正文。

## 1. 目标

在 Win7 SP1 x64（build 7601）实机/可复现 VM 上验证 Electron 22.3.27 x64 作为
Desktop Shell + Agent Core 运行时闭包的可行性，产出 Go/No-Go 报告，为 ADR-0028
的单栈裁决提供实机证据。

## 2. 非目标

- 不构建任何生产 UI/Agent 功能；最小验证壳只包含探测所需元素。
- 不验证终端/containment（SPIKE_02）、Git（SPIKE_03）、存储索引（SPIKE_04）。
- 不评审 WPF 备选（No-Go 时另启动 D-015 重跑本 Spike 的等价矩阵）。

## 3. Runtime Profile（C15）

- 目标机：Win7 SP1 x64 build 7601，含/不含 SP1 后可选更新两档；普通用户与管理员各一遍。
- 运行时：Electron 22.3.27 win32-x64（D-009，哈希在工件入库时锁定，见 WIN7_CONSTRAINTS §6.1）。
- Renderer：`nodeIntegration:false`、`contextIsolation:true`、`sandbox:true`、最小 preload（最小权限，非零权限）。
- Core 形态：以独立 `utilityProcess` 承载（ADR-0028 首选，`runAsNode` fuse 关闭、不用 `ELECTRON_RUN_AS_NODE`）；须实测 `utilityProcess` 启动、stdin 默认关闭与常驻内存。若需对照，可附带 `ELECTRON_RUN_AS_NODE` 仅作数据参考，不作为交付形态。
- 交付形态：免安装解压目录 + 可选安装器原型；均须支持中文+空格路径。

## 4. 验证矩阵

| # | 用例 | 通过标准 |
|---|------|----------|
| T01 | 冷启动计时（重启后首次，3 次中位数） | 预算 #1 |
| T02 | Shell 常驻内存（空闲 10 分钟均值） | 预算 #2 |
| T03 | Core（独立 `utilityProcess`）常驻内存与 stdin 关闭验证 | 预算 #3 |
| T04 | GPU 降级：老显卡/无独显机型强制软渲染（`disable-gpu`、swiftshader 路径） | 无黑屏（P17）、UI 可用、CPU 占用可接受并记录 |
| T05 | 中文+空格安装目录与工作区路径 | 启动、日志、userData 路径全部正确（W7C-02） |
| T06 | 单实例锁 | 二次启动聚焦已有窗口，不重复进程 |
| T07 | Renderer 隔离动态验证 | preload 外 API 不可达；`require` 不可用；越权 IPC 被拒（W7C-05/07） |
| T08 | 出站阻断 | CSP `connect-src` + Session 过滤下，验证壳发起的未声明 HTTP(S)/WS/DNS 全部被拒，抓包零意外出站（W7C-06） |
| T09 | 崩溃日志 | 主/渲染进程人为崩溃后 crash dump + 结构化日志落盘且路径正确 |
| T10 | 干净卸载 | 删除目录 + userData 后无残留进程/服务/注册表启动项 |
| T11 | 并发资源初测 | 模拟 2 任务负载下预算 #9/#10 采样 |

## 5. Go/No-Go 判据（ADR-0028）

**Go（四项全过）：**
1. 启动与运行稳定：T01 达标或有条件达标，T09 崩溃可诊断；
2. 路径兼容：T05 全过；
3. GPU 软渲染可用：T04 在最差机型无黑屏；
4. 零意外出站：T08 抓包证据为零。

**No-Go：** 任一项失败且无法在 Spike 范围内修复 → 触发 ADR-0028 降级阶梯第二档
（.NET 4.8 WPF，D-015），以等价矩阵重跑本 Spike，并记补充 ADR。

## 6. 交付物

1. `spikes/01-win7-runtime-baseline/` 最小验证壳源码与构建脚本（构建机现代系统）。
2. Win7 实机证据包：截图、日志、抓包记录、内存/计时原始数据。
3. Go/No-Go 报告（含 PERFORMANCE_BUDGET #1/#2/#3/#9/#10 状态位更新提案）。
4. D-009 工件 SHA-256 锁定登记（WIN7_CONSTRAINTS §6.1）。

## 7. 治理

- 失败只废弃 `spike/01-*` 分支，不合 main；证据与报告以 `docs:` 提交进 main。
- 本 Spike 通过不构成 PHASE_07 实现授权（ROADMAP 架构验证轨条款）。

## 8. 开放问题

- Win7 测试机来源（PC-002/R1）：无可复现 Win7 环境前本 Spike 不得启动。

## 9. 验证记录（占位，验收时填写）

```
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Target environment unavailable
```

# SPIKE 01 - Go/No-Go 报告（Win7 实机验收）

```
SPIKE 01 - Go/No-Go 报告
========================
日期: 2026-08-02
Win7 版本: Windows 7 Professional SP1 x64 (build 7601)
Electron 版本: 22.3.27 (Chromium 108.0.5359.215 / Node 16.17.1)
验收机器: ThinkPad T460（私人机，柴子良）
```

## 实机环境

| 项 | 值 |
|---|---|
| 机型 | ThinkPad T460 (2016, Skylake) |
| 系统 | Windows 7 Professional SP1 x64, build 7601 |
| 内存 | 16 GB（高于 PERFORMANCE_BUDGET 8GB 下限，验收记录如实标注，更优硬件不放宽标准）|
| 磁盘 | Samsung 870 EVO 1TB **SSD** |
| 显卡 | Intel HD 520 集显（无独显）|
| 补丁 | KB4490628 / KB4474419 / KB3140245 已安装 |
| TLS | WinHttp DefaultSecureProtocols=0xA00（Wow6432Node）已写入 |
| 远程通道 | Bitvise SSH（密钥认证），Mac `192.168.1.10` ↔ Win7 `192.168.1.11` |
| Electron 部署 | `C:\acceptance\electron\electron.exe`（SHA256 ad723ed7dad32f9459f7a9de1fd6d718cf713c4809c2431503bea62ce8f786e6）|

## 验证方式

headless 无窗口（BrowserWindow `show:false`）方式，经 `electron.exe <harness>` 在 Win7 真机实际执行各项行为；结果以结构化 JSON 落盘 + stdout 回传。关键项均为**运行时真实行为**而非静态检查：

- **T08 utilityProcess**：真实 `utilityProcess.fork()` 派生子进程并收到 `parentPort` 回包（验证 Core 进程边界可行性）。
- **T02 安全配置**：在沙箱渲染进程内实测 `window.require` / `window.process` / `window.Buffer` 均不可见（nodeIntegration=false + contextIsolation + sandbox 三重生效）。
- **T07 CSP**：渲染进程动态注入内联 `<script>`，实测被 `script-src 'self'` 阻止（`window.__csp_inline_executed` 未置位）。
- **T03 / C10**：将整套 harness 复制到 `C:\测试 目录\spike01\`（中文+空格），从其 `__dirname` 加载 preload / renderer / utility-child 并写回报告，全部通过。
- **T06 GPU 降级**：以 `--disable-gpu` 启动，确认软件渲染模式下窗口创建不崩溃。

## 验证结果

所有场景：**11/11 通过**。

| ID | 验证项 | 普通路径 | 中文+空格路径 | GPU 降级 |
|----|--------|:--------:|:-------------:|:--------:|
| T01 | Electron 22.3.27 可启动 | ✓ | ✓ | ✓ |
| T02 | nodeIntegration=false / contextIsolation / sandbox | ✓ | ✓ | ✓ |
| T03 | 中文+空格路径兼容（C10）| ✓(基础) | ✓(实机) | ✓(基础) |
| T04 | 单实例锁 | ✓ | ✓ | ✓ |
| T05 | 崩溃日志配置 | ✓ | ✓ | ✓ |
| T06 | GPU 降级 / 软件渲染 | ✓ | ✓ | ✓ |
| T07 | 出站 CSP（default-src 'none'）| ✓ | ✓ | ✓ |
| T08 | utilityProcess 可用性探测（真实 fork）| ✓ | ✓ | ✓ |
| T09 | preload.js 使用 contextBridge | ✓ | ✓ | ✓ |
| T10 | renderer 页面存在且引用 CSP | ✓ | ✓ | ✓ |
| T11 | package.json 脚本完整 | ✓ | ✓ | ✓ |

> 注：T03 普通路径列为"基础"指 harness 自身路径兼容性；中文+空格路径列为"实机"指从 `C:\测试 目录\` 实际运行并通过全部项，为 C10 决定性证据。

## 证据文件

- `acceptance/evidence/report_normal.json` — 普通路径运行（gpuDisabled=false）
- `acceptance/evidence/report_cjk.json` — 中文+空格路径运行（`C:\测试 目录\spike01\`）
- `acceptance/evidence/report_gpu.json` — GPU 降级模式运行（gpuDisabled=true, hasGpuSwitch=true）
- 首个里程碑（第一关 `electron.exe --version` → v22.3.27）于 2026-08-01 记录于 `.workbuddy/memory/2026-08-01.md` 与 `2026-08-02.md`

## 修复记录（验收中发现并修正）

- **package.json 缺 `build` 脚本**：原脚本仅有 `build:win`，而 T11 验收准则（validate.js 与 README Go/No-Go 模板）要求 `start`/`build`/`validate` 三脚本齐备。已补 `"build": "electron-builder --win --dir"`（保留 `build:win` 别名）。修正后 T11 三场景全绿。

## 判定

```
总计: 11/11 通过
判定: [ GO ]
```

**结论**：Electron 22.3.27 在 Windows 7 SP1 x64 真机上完整可行，ADR-0028「Electron 单栈（main / Core utilityProcess / Shell Renderer）」方向获实机支撑，**未触发降级到 .NET WPF**。Phase 3–7 可基于该 Runtime Profile 推进。

## 遗留 / 待补

- **SPIKE_04 磁盘 IO 性能项**：本机为 SSD，无法代表目标机械盘 IO 特征。该项需在外接 USB 机械盘或另行安排的机械盘 Win7 环境补测，或显式标注"待补"。
- **TLS 64 位原生注册表路径**：Wow6432Node 路径已写入并验证；64 位原生 `HKLM\...\WinHttp\DefaultSecureProtocols` 待补（非阻塞）。
- **PowerShell / WMF 5.1**：未升级（默认 2.0），不影响 Electron 验收，但后续 Phase 脚本若依赖 WMF 5.1 需另行安排。

# Win10 原生构建闭包风险记录

状态：`BUILD_KIT_READY_FOR_WIN10_BUILD`。本记录不解除 `BUILD_HOST_MISSING`，实际 Win10 报告经复核后才可解除构建机缺失；Win7 状态仍为 `NOT_PERFORMED`。

| 组件 | 状态与风险 | 本包控制 | 后续责任 |
|---|---|---|---|
| Electron 22.3.27 / Node 16.17.1 | 均已 EOL，不再获得常规上游安全更新 | 只加载可信本地 UI；版本、归档和 SHA-256 固定 | 项目维护者跟踪公开漏洞；不把 Renderer 当作不可信网页安全边界 |
| node-pty 0.10.0 | 老旧原生模块，当前上游版本已前移 | npm 官方归档和 Electron ABI 110 固定；强制 Win10 load smoke | SPIKE_02 完成 Win7 T01～T05/N01～N06 |
| 内置 winpty 0.4.4-dev | 上游停止维护；不是独立正式 release | 使用 node-pty 0.10.0 自带源码的精确派生快照；哈希固定；API 合同预检 | 本项目承担回补和 Win7 兼容验证 |
| node-gyp 9.4.1 与传递工具包 | 仅构建机使用；存在上游 deprecated 提示 | package-lock v2、integrity、离线缓存、SBOM 和许可证归档 | 不进入 Win7 运行包；换版本必须重跑构建与 SPIKE_02 |
| MSVC/SDK | 微软专有构建工具，不随包再分发 | 仅接受 VS2019 `[16.0,17.0)`、v142/14.2x、SDK 10.0.19041.0 | 记录实际 VS/MSVC 补丁版本；产物执行 PE/API/CRT 扫描 |

## 漏洞记录边界

- `npm-audit.json` 是生成本包时针对锁文件执行的时间点快照；它不覆盖 Electron/Chromium、Node、MSVC、Windows SDK 或未进入 npm audit 数据库的 winpty C++ 源码。
- 2026-08-06 快照报告 4 个构建工具链问题（3 high、1 critical），根因为 node-gyp 9.4.1 的 `tar` 6.x 传递依赖。该依赖只处理已经由 SHA-256/integrity 锁定的离线 npm 内容；Electron headers 改由 Windows 10 `tar.exe` 解压，node-tar 不再直接处理该输入。此为受限构建机风险接受，不表示漏洞已修复，也不允许处理外部任意归档。
- audit、EOL 与许可证记录不能替代 Win7 实机证据。正式发布前仍须在当时重新扫描并裁决可接受风险。
- 发现动态 `VCRUNTIME`、`MSVCP` 或 UCRT 依赖且结果包未携带精确 DLL 时，构建脚本 fail-closed；不得把构建机已安装的运行库当作目标机闭包。
- node-pty 默认同时构建 ConPTY 原生模块；它们会导入 Win10 专属 API。Win7 派生输出会明确删除 `conpty*.node`，只保留强制 `useConpty:false` 的 winpty 路径，并在结果清单记录被裁剪文件。

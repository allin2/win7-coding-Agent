# A9-11 — D-013 v25 后置安全与可用性修复

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_HARDENING
Target Branch: codex/a9-trusted-agent-runtime
Source Baseline: eebb724b6f3198ece2a3be229925a17570231d0f
Phase-Gate: A9_11_DEVELOPER_VERIFIED_PENDING_WIN7
Win7-Validation: WIN7_20_NOT_PERFORMED
Decision: ADR-0108
```

## 1. 授权与目标

项目负责人要求核对并直接修复 D-013 v25 独立审查仍存在的问题。据此允许在目标分支基线对应的当前
detached 工作区增量实施；保留 A9-09/A9-10 和其他用户改动，不切换分支、不提交或推送。

本任务关闭八项可复现缺口：只读 Git 投影触发仓库回调、活动 Turn 中切换权限模式、Git 投影泄漏已知
秘密、跨 `model_chunk` 的秘密碎片持久化、SSE UTF-8 跨字节分块损坏、Shell 事件 DTO/活动刷新缺失、
显式读取编码没有绑定后续 edit，以及 A9 查看器固定走 legacy UTF-8 读取。

## 2. 允许路径与非目标

- `src/git-adapter/src/**`、`src/git-adapter/tests/**`：只读投影禁用 fsmonitor/textconv/external diff 等回调。
- `src/gateway/src/provider/**`、`src/gateway/tests/**`：SSE UTF-8 增量解码和回归。
- `src/core/src/a9-agent-loop.ts`、`src/core/tests/**`：版本化 Shell 事件 DTO。
- `src/runner/src/trusted-shell-adapter.ts`、`src/runner/tests/**`：只透传 DTO 所需的既有 Runner 结果事实。
- `src/workspace/src/**`、`src/workspace/tests/**`：读取基线编码/BOM 绑定及 edit 保真。
- `src/shell/product/**`、`src/shell/tests/**`：模式迁移阻断、投影/流事件脱敏、A9 IPC、Viewer 与活动状态刷新。
- `docs/**`、`AGENTS.md`：授权、ADR、追踪和验证状态。

不修改 native helper、协议 v1/v2、v24/v25 锁定输入、WIN7-19 ZIP/manifest/candidate identity，不生成新正式包；
不新增依赖、系统 API、权限模式或 Review 能力，不把开发机验证写成 Win10/Win7 PASS。

## 3. 修复合同

- Git 状态/Diff 投影必须是无仓库回调的观察路径：禁用 fsmonitor、textconv、external diff 与 pager；真实
  Git 命令仍只经 TrustedShellRunner。所有投影在跨进程边界前递归按字段名和已知秘密值脱敏。
- 活动 Turn、审批决定或 cleanup-required 受管进程存在时拒绝模式变更；不能先公布 `read_only` 再让旧
  Full Access Loop 继续执行。连续模型增量在完整敏感值边界上脱敏后才进入 timeline/SQLite。
- SSE 使用有状态 UTF-8 解码，字节序列跨任意 Buffer chunk 仍保持原字符；畸形事件合同保持不变。
- Shell `tool_end` 提供版本化、有界、可脱敏的结构化预览、exit/truncation/log/residue 事实；Renderer 在
  Turn 活动期刷新 snapshot，显示 `tool_start` 与最终 Shell 事实，不能把未完成误报为空白或成功。
- 显式读取的 encoding/BOM 成为同一新鲜基线的一部分；edit 使用该绑定严格解码并原编码写回。A9 Viewer
  只能走 A9 有界读取 IPC，默认自动识别并允许用户显式选择 UTF-8/GBK/UTF-16LE；错误必须可见。

## 4. 验证与交付边界

每项缺口均需定向失败回归；运行 Git/Gateway/Core/Workspace/Shell 受影响包、相关类型检查、产品合同、
`npm run docs:check` 与 `git diff --check`。对 UI 变化至少运行 Renderer 合同/组合测试；若当前开发机不能
形成真实 Electron/Windows 证据，明确列为剩余风险。重新核对 v24 input lock、WIN7-19 历史工件和
candidate identity 未改写。本任务完成仍不解除 A9-09 独审、正式双构建或 WIN7-20 实机 Gate。

## 5. 本地修复与验证（2026-08-30，未提交）

| 审查发现 | 修复与回归 |
|---|---|
| Git 投影执行回调 | status 禁用 fsmonitor 和外部 filter，diff 同时禁用 external diff/textconv；真实临时仓库证明三个 marker 均未创建 |
| 活动 Turn 中切换模式 | 活动控制器/生命周期/审批/cleanup-required 进程存在时结构化拒绝；延迟真实 Provider Turn 证明快照仍为 Full Access，终止后才可切换 |
| Git 投影泄漏秘密 | `gitStatus` 跨产品边界前递归按字段和值脱敏；真实 diff 与 credential helper 中已知 Provider Key 均不返回 |
| 拆分模型 chunk 泄密 | 同一 Turn 的模型增量只在内存聚合，终态统一脱敏后写 timeline/SQLite；三段拆分 Key 回归只留下一个 redacted 事件 |
| SSE 中文跨字节损坏 | `StringDecoder('utf8')` 保留跨 Buffer 状态；逐字节输入的中文 content/tool arguments 精确恢复 |
| Shell DTO/长任务空白 | Core 发布 schema 1 有界 Shell DTO，Runner 透传 status/truncated；Workbench 活动期刷新并显示 start/exit/stdout/stderr/log/truncation |
| 显式 read 后 edit 失败 | baseline 保存 encoding/BOM，write/edit 严格复用；单字 GBK 与无 BOM UTF-16LE 均按原编码替换字节 |
| Viewer 固定 legacy UTF-8 | A9 IPC 升为 v5，Viewer 使用 A9 有界 read，自动歧义时可见提示并可选 UTF-8/GBK/UTF-16LE；拒绝绝对路径、`..` 和解析后越界 |

`npm run verify` 七模块 132 suites / 1554 tests、全部 lint/build PASS；发布/ZIP/报告/真实 prepare-kit
15 PASS / 1 SKIP（Windows PowerShell 5.1 在本机 NOT_PERFORMED）；平台中立原生 `logic_tests` PASS。
定向产品组合覆盖真实 Gateway → Core → Workspace/Runner → Runtime/SQLite、v5 IPC 和 Renderer 静态合同。

正式 Electron 22 smoke 已尝试：工作区根的 SQLite 为 Node ABI 115，先按合同 fail-closed；在临时目录成功
重建 ABI 110 后，现有开发组合仍于 A9 Runtime 初始化前返回 `DESKTOP_RUNTIME_ERROR`，因此新 Viewer/Shell
DOM 用例未执行，不能声明 Electron PASS。未修改工作区依赖或候选。Win10/Win7 仍 NOT_PERFORMED。

2026-08-31 后续 A9-12 修复 Runtime 初始化恢复链后，同一合并工作树已使用临时 ABI 110 闭包完成真实
Electron 22 四进程 smoke；Viewer/Shell DOM、正式 Explorer 会话、Stop/回收均 PASS。该证据只关闭开发机
Electron 阻塞，Win10/Win7 仍 NOT_PERFORMED。

历史复核：所有 `*input-lock.json` 与 HEAD 相同；WIN7-19 ZIP、manifest、candidate identity 仍分别为
`824a10cd…72b0`、`b483e9b0…2c26`、`ab5a1159…d3c`，撤销 r4 ZIP 仍为 `037213c…e09`。未生成正式
v25 lock、WIN7-20 候选或新批准。

# A9-12 — D-013 v25 后置恢复与用户流加固

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_HARDENING
Target Branch: codex/a9-trusted-agent-runtime
Source Baseline: eebb724b6f3198ece2a3be229925a17570231d0f
Phase-Gate: A9_12_DEVELOPER_VERIFIED_PENDING_WIN7
Win7-Validation: WIN7_20_NOT_PERFORMED
Decision: ADR-0109
```

## 1. 授权与目标

项目负责人要求继续核对并直接修复 D-013 v25 独立审查发现的问题。据此允许在目标分支基线对应的当前
detached 工作区增量实施；保留 A9-09/A9-10/A9-11 和其他用户改动，不切换分支、不提交或推送。

本任务关闭十项已定位缺口：Viewer 编码选择跨文件泄漏、Electron smoke 未经正式 Explorer 会话进入新
用例、首次 Undo IPC 被错误拒绝、IME 组合输入按 Enter 提前发送、Provider 二次保存丢失高级设置或秘密、
审批恢复后的长任务缺少 Stop、残留进程退出对话框异常、snapshot 重复同步探测 Shell、异常退出后的
工作区锁只能等待固定超时，以及 A9 Runtime 初始化失败诊断在 Renderer 中不可见。

## 2. 允许路径与非目标

- `src/shell/product/**`、`src/shell/tests/product/**`：IPC、Runtime、Renderer、主进程与 Electron smoke
  的最小修复和回归。
- `src/state/src/a9-persistence.ts`、`src/state/tests/**`：只允许工作区锁的保守存活判断、原子接管与重试。
- `docs/**`、`AGENTS.md`：授权、ADR、追踪和验证状态。

不修改 native helper、协议 v1/v2、Runner 协议、v24/v25 正式输入锁、WIN7-19 ZIP/manifest/candidate
identity，不生成新正式包；不新增依赖、系统 API、权限模式或 Review 能力，不把开发机或 Electron smoke
结果写成 Win10/Win7 PASS。

## 3. 修复与安全合同

| ID | 审查发现 | 可观察成功条件 |
|---|---|---|
| A9-12-01 | Viewer 复用上一个文件的手工编码 | 打开不同文件默认重新自动识别；只在同一文件显式切换时复用选项 |
| A9-12-02 | Electron smoke 没有 Explorer 会话 | 第一产品进程通过真实 `workspace-select` IPC 建立会话后再检查 Viewer/Shell DOM |
| A9-12-03 | 首次 Undo 缺少可选 confirmationId | preload 省略该字段时 v5 IPC 接受；未知字段、错误类型仍 fail-closed |
| A9-12-04 | IME Enter 提前提交 | composition 期间及兼容 keyCode 229 不提交；普通 Enter 行为不变 |
| A9-12-05 | Provider 高级配置二次保存不安全 | snapshot 只暴露非秘密元数据；省略保留、显式空值清除；endpoint 变化绝不复用旧秘密 |
| A9-12-06 | 审批恢复长任务缺少 Stop | 批准后立即进入 running/可停止并持续刷新，完成或取消后收敛 |
| A9-12-07 | 残留退出提示格式化抛错 | 数组与异常输入均形成有界纯文本，不掩盖真实 cleanup 风险 |
| A9-12-08 | snapshot 重复同步 Shell 探测 | 自动探测按 Runtime 缓存；Shell 设置变更后失效并重新探测 |
| A9-12-09 | 崩溃后死进程锁阻塞固定时长 | 仅精确 `main-<pid>` 且证明 PID 已不存在时原子接管；未知/存活持有者仍等待过期 |
| A9-12-10 | Runtime 初始化失败诊断不可见 | Renderer 显示经过脱敏且有界的 code/detail，并引导打开诊断而非提示选模式 |

工作区锁存活判断必须保守：只有 `process.kill(pid, 0)` 明确返回 `ESRCH` 才视为死进程；权限错误、未知
owner、PID 复用或其他不确定状态均不得抢锁。同一 Runtime 初次未持锁时必须在后续 snapshot/操作前重试，
但不能绕过持久层事务条件。Provider snapshot 不得包含 API Key、Header 值、代理密码或其他秘密；名称与
可用性标志只能用于 UI 安全回填。旧 endpoint 的秘密不能跨 origin 自动迁移。

## 4. 验证与交付边界

每项缺口需定向失败回归；运行 State/Shell 受影响测试、产品合同、Preload/IPC、Renderer VM/静态合同、
生命周期与 Electron smoke（若本机依赖允许）、`npm run verify`、`npm run docs:check` 和
`git diff --check`。Electron smoke 仅能证明当前开发机产品路径；Win10/Win7 仍须直接执行。

重新核对所有 v24 input lock、WIN7-19 历史 ZIP/manifest/candidate identity 与 HEAD 一致，且未生成正式
v25 lock 或 WIN7-20 候选。本任务不解除 A9-09 独审、锁定 Win10 双构建或 WIN7-20 实机 Gate。

## 5. 本地修复与验证（2026-08-31，未提交）

| 审查发现 | 修复与回归 |
|---|---|
| Viewer 编码跨文件泄漏 | 新文件恢复 auto，同一文件显式切换仍可复用；真实 Electron smoke 覆盖 GBK 后再开 UTF-8 文件 |
| Smoke 绕过 Explorer 会话 | 首进程通过正式 `workspace-select` IPC 建立 Explorer 会话并打开 `calc.ts` |
| 首次 Undo 被拒绝 | `confirmationId` 改为可选非空字符串；未知字段和错误类型仍拒绝 |
| IME Enter 提前发送 | `isComposing` 与兼容 `keyCode=229` 均不提交，普通 Enter 合同不变 |
| Provider 二次保存失真 | 省略保留、显式空值清除；snapshot 只公开 CA/Header 名称/代理非秘密字段和秘密可用性；endpoint 变化清除旧秘密 |
| 审批恢复没有 Stop | 批准后立即进入 running、显示 Stop 并恢复 snapshot 轮询，完成/取消后收敛 |
| 残留进程提示异常 | 数组和异常输入统一形成有界文本，保留 cleanup/residue 风险事实 |
| snapshot 重复 Shell 探测 | 自动选择按 Runtime 缓存，设置变化后失效并只在需要时重探测 |
| 崩溃锁固定阻塞 | 持久层事务内只接管已明确死亡的 `main-<pid>`；未知/存活/权限不确定仍 fail-closed；同一 Runtime 可重试 |
| 初始化诊断不可见 | 快照只投影脱敏、有界的 code/detail/hint；Renderer 明确显示 Runtime 限制及诊断入口 |

定向 State 37/37、Shell 97/97 通过；`npm run verify` 七模块 132 suites / 1563 tests、全部 lint/build
通过。v25 prepare-kit、产品双构建夹具、输入记录器、产品完整性与 WIN7-20 schema 2 报告 verifier 共
17 PASS / 1 SKIP；跳过项仅为本机不可用的 Windows PowerShell 5.1，明确 `NOT_PERFORMED`。平台中立原生
`logic_tests` 1/1 通过。

使用 Electron 22.3.27 ABI 110 的临时 `better-sqlite3` 闭包执行真实开发机 smoke，四个产品进程全部
PASS；新增 `A9F1-FORMAL-EXPLORER-SESSION` 与 `A9F1-VIEWER-ENCODING-PER-FILE` 均通过，Runner Stop/
进程树回收与生命周期存量用例也通过。该结果仅为 macOS arm64 开发机产品路径证据；报告中的 Win10、
Win7 均保持 `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE`，不能解释为目标平台 PASS。

历史复核：仓库内 5 份 `*input-lock.json` 与 HEAD 字节一致；外置 WIN7-19 ZIP、manifest、candidate
identity 的 SHA-256 分别仍为 `824a10cd…72b0`、`b483e9b0…2c26`、`ab5a1159…d3c`，撤销 r4 ZIP 仍为
`037213c…e09`；结构化 WIN7-19 状态和收口报告也与 HEAD 相同。未生成正式 v25 input lock、WIN7-20
候选或新批准。`npm run docs:check` 检查 105 文件/25 任务通过，`git diff --check` 通过。

## 6. Provider P2 延期与 Win10 构建授权（2026-09-02）

独立只读复核另记录两项 Provider P2：代理主机存在而端口为 `0` 时会静默清除已有代理；显式清空
API Key 时持久化密文删除失败或未执行可导致旧 Key 在重启后恢复。项目负责人明确决定本轮暂不修复
这两项 P2，并授权提交本任务范围内的现有修复、推送目标分支和继续 D-013 v25 锁定 Win10 构建。

该决定仅允许生成和验证 WIN7-20 候选，不把两项 P2 标记为已关闭或 PASS。最终报告必须保留已知风险；
Provider 保存/清空/重启与 Windows DPAPI 相关结论不得由本轮开发机证据推断。若最终发布裁决要求关闭
上述行为，必须另行修复并从新的源码提交重新执行 kit、Win10 双构建、正式 input lock 和候选验收链。

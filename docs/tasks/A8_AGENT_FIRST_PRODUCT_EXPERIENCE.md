# A8 — Agent-first 产品体验与 Win7 MVP 闭环

## 0. 实现授权（ADR-0011 / C14）

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_EXPERIENCE
Target Branch: codex/a8-agent-first-product
Target Version: 0.2.0-alpha.1
Phase-Gate: A8_IMPLEMENTATION_AUTHORIZED
Developer-Validation: NOT_PERFORMED
Win10-Validation: NOT_PERFORMED
Win7-Validation: NOT_PERFORMED
Blocking-Reason: A8_IMPLEMENTATION_AND_THREE_LAYER_PRODUCT_ACCEPTANCE_NOT_PERFORMED
```

授权依据：项目负责人于 2026-08-20 完成四轮需求决策并明确确认
`docs/prds/WIN7_AGENT_FIRST_PRODUCT_REQUIREMENTS_V1.md`。本任务只授权该合同定义的 Agent-first
产品体验与完整 MVP 闭环；不授权扩大任意 Shell、高风险 Runner、Git 写操作、任意公网浏览、模型控制
用户终端、多 Agent、自动更新或无审批完全自主模式。

### 0.1 允许路径

- `src/shell/product/**`：Agent-first 桌面入口、Renderer、Preload、IPC host、设置与诊断装配。
- `src/shell/tests/product/**`：产品交互、IPC、安全边界、恢复与回归测试。
- `src/core/src/**`、`src/core/tests/**`：仅限会话 Turn、结构化计划、Goal、工具摘要和恢复合同。
- `src/workspace/src/**`、`src/workspace/tests/**`：仅限上下文引用、只读代码视图与准备区基线接口。
- `src/state/src/**`、`src/state/tests/**`：仅限带版本的会话/Goal/Review 持久化与 fail-closed 恢复。
- `src/gateway/src/**`、`src/gateway/tests/**`：仅限已登记内网 Provider 的流式消息与错误恢复合同。
- `src/runner/src/**`、`src/runner/tests/**`：只允许复用/展示已验收低风险非交互 Profile；不得新增命令面。
- `src/git-adapter/src/**`、`src/git-adapter/tests/**`：仅限既有隔离适配器上的只读状态、Diff 和历史。
- `release/win7-product-v2/**`、`scripts/release/**`：A8 确定性打包、生命周期和三层验收工具。
- `docs/prds/**`、`docs/tasks/**`、`docs/status/**`、`docs/reports/**`、`docs/STATUS.md`、
  `docs/DECISIONS.md`、`docs/ARCHITECTURE.md`、`docs/SECURITY.md`、`docs/EVALUATION.md`、
  `docs/WIN7_CONSTRAINTS.md`：合同、设计、风险、状态和证据。

禁止通过路径白名单顺带重构无关 Phase 1/2 代码、改写已接受证据或修改 `0.1.0-rc.1` 长期归档。
新增依赖、原生组件、网络目标、系统 API 或运行时前，必须先满足 C15/C16 并更新约束登记。

## 1. 冻结输入与不可继承结论

| 输入 | 固定边界 |
|------|----------|
| Git 基线 | A7 已合入且 main 干净的授权提交；A8 从该提交单独建 branch/worktree |
| 历史 RC | `0.1.0-rc.1` / ZIP SHA-256 `39eecb6a683f90dea12e58dbeee070ec0bc4dd1706a08bd4f1967343e28040c9`，只读冻结 |
| Runtime | Electron `22.3.27` x64、Node `16.17.1`、Win7 SP1 x64；不因 A8 自动升级 |
| Runner | D-013 v24 低风险非交互 Profile；交互 winpty 继续 `NO_GO` |
| Storage | D-014 本地 NTFS SSD Profile；旧 EventLedger PASS 不等于完整会话恢复 PASS |
| 模型 | Provider 接口可扩展，但 A8 首发只承诺经登记并实测的内网模型 |

A4～A7 的开发机/Win10/Win7 PASS 只证明锁定输入资格。任何 A8 文件或包字节变化都必须产生新的分层
结论，不得把旧 RC 的 `RC_PASS` 写成 A8 PASS。

## 2. 产品合同

### 2.1 日常工作流

1. 用户选择工作区并进入会话。
2. 用户输入自然语言；`Enter` 提交，`Shift+Enter` 换行。
3. “直接执行”立即进入受控读取/计划；“先计划”先展示结构化步骤并等待执行确认。
4. Assistant 消息持续聚合流式 delta；工具、计划、Runner、测试和错误以可折叠卡片显示。
5. Agent 形成多文件准备区；Review 显示 Diff、验证和未验证项，用户逐文件接受或拒绝。
6. 批准后才写入正式工作区；失败原地恢复，重启后恢复事实但不擅自继续任务。

### 2.2 页面与能力边界

- 工作区页面：`Agent / Review / Terminal / Browser`。
- 全局页面：`Settings / Diagnostics`。
- Terminal 是用户能力，必须与 Agent Runner 输入隔离；旧 winpty No-Go 不得绕过。A8-04 在形成新的
  Runtime Profile、威胁模型和 Win7 证据前，只能实现清晰的 disabled/fail-closed 状态或经批准的
  独立用户控制路径，不能宣称嵌入式交互终端 PASS。
- Browser 只允许可信本地预览、用户显式系统浏览器和管理员登记内网目标；Renderer 继续无 Node、
  context isolated、sandboxed、deny-by-default navigation/window/permission。
- Gateway/CA/API Key 离开主任务页面；凭据只能走已批准的安全存储与 IPC，日志和数据库必须脱敏。

## 3. 实施阶段与串行 Gate

| 阶段 | 交付 | 进入下一阶段的硬门槛 |
|------|------|----------------------|
| A8-00 | 合同、信息架构、事件/状态/数据迁移设计、测试矩阵 | 文档一致；无未决安全或数据格式决策 |
| A8-01 | 对话主界面、Enter 提交、直接/计划模式、流式聚合、工具卡片 | 中文逐字/英文 token/request 切换/截断/失败回归通过；原始审计不变 |
| A8-02 | 工作区、多会话、Goal、上下文引用、只读代码查看器 | 中文/空格路径、会话隔离、上下文上限与只读边界通过 |
| A8-03 | 多文件准备区、Review、逐文件接受/拒绝、真实测试闭环 | 基线漂移、部分拒绝、失败回滚、编码/EOL/路径用例通过 |
| A8-04 | Runner 展示、Terminal/Browser、Settings/Diagnostics | C17/C19 负向测试；Terminal 新 Profile 未通过则保持 disabled |
| A8-05 | 会话/Goal/Review 持久化、中断与恢复、旧设置迁移 | schema/version、损坏、序列缺口、凭据扫描、重启恢复通过 |
| A8-06 | `0.2.0-alpha.1` 打包、开发机/Win10/Win7 产品旅程 | 新哈希/manifest/SBOM/许可证/唯一租约；三层分别记录 |

同一提交只允许一个阶段处于 `IN_PROGRESS`。前一阶段测试未通过，不得以 UI 演示代替 Gate 进入后续阶段。

## 4. 事件、状态与安全不变量

- Gateway 原始 chunk 继续逐项审计；Renderer 仅在展示投影层按 `taskId + requestId + 连续 index` 聚合。
- 任一非 delta 事件、request 切换、index 缺口、任务终态或长度上限必须关闭当前聚合段。
- 所有持久化对象具有 schema version；未知版本、损坏、哈希漂移和不连续序列 fail-closed。
- Renderer 不直接获得文件系统、进程、凭据或任意网络能力；所有动作经 Schema IPC、Policy、批准与审计。
- Agent 不得向用户 Terminal 注入输入；终端输出按不可信数据处理。旧 D-011 工件不得进入 A8 包。
- Git 只读仍必须关闭 hooks、filters、textconv、pager、credential/SSH helper、fsmonitor 和外部 diff。
- 不修改目标机网络、路由、防火墙、PATH、服务或系统策略，也不以“试用”为由放松这些边界。

## 5. MVP 非目标

完整代码编辑器、Diff 内编辑、任意 Shell、Git 写操作、多 Agent、后台并发队列、任意浏览器自动化、
插件市场、自动更新、无审批全自动模式、未登记模型、高风险和未知 Runner Profile不在本任务范围内。

## 6. 验证矩阵与完成条件

### 6.1 开发机

- 全量 `npm run verify`，所有模块 lint/build/test 与新增交互/持久化/安全回归通过。
- 真实 Renderer 自动化覆盖输入、计划、流式消息、工具卡片、Review、恢复、Terminal/Browser 边界。
- 所有跟踪 JSON 解析；`git diff --check`、路径白名单、依赖、TODO/Mock、私钥、缓存和
  `node_modules` 跟踪检查通过。

### 6.2 Win10

- 精确工具链和锁定原生闭包；产品入口、长会话、多文件 Review、真实测试、恢复和生命周期通过。
- 新 ZIP、manifest、ASAR 外置、PE/API/CRT、SBOM、许可证与 sidecar 双向哈希一致。

### 6.3 Win7

- 新唯一租约下执行需求合同 §8 的十二条真实用户旅程。
- 上传前后本地 SHA-256 与 `certutil` 双向核对；轮前轮后 Bitvise、22 端口、相关进程和系统状态符合
  既有协调纪律。
- 安装、并行共存、升级、故障回滚、卸载和零残留通过；不得修改网络、路由、防火墙、PATH、服务或重启。

### 6.4 完成裁决

只有开发机、Win10、Win7 三层均绑定同一候选且分别 PASS，任务才可从
`APPROVED_FOR_IMPLEMENTATION` 升为 `COMPLETE / A8_RC_PASS`。任何单层或 harness PASS 都不得冒充
产品 MVP PASS。

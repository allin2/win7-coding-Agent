# SPIKE 03 - Git Adapter 隔离验证

## 状态

- **任务书**：`docs/tasks/SPIKE_03_GIT_ADAPTER.md`
- **状态**：APPROVED_FOR_IMPLEMENTATION
- **Win7 实机验证**：MVP PASS（MVP-20260802-06，P01-P04/N01-N10 = 14/14）
- **成果迁入**：成果已迁入 `src/git-adapter/`；当前 adapter 对仓库 `filter`/`diff` 外部属性 fail-closed，并已用受控 MinGit 派生包在 Win7 重测

> **Win7-Validation: MVP PASS** — 原始官方 MinGit ZIP 含 GCM/SSH/HTTP helpers，不能直接作为 D-012 交付包；本轮生成并绑定 SHA-256 的受控派生包，去除这些外部入口后完成独立 P01-P04/N01-N10 矩阵。2026-08-01 的旧报告仍保留为 N02 filter 逃逸风险证据；当前修复已在 Win7 重测，但正式 SBOM/许可证/抓包闭包仍未完成。

## MVP 实机风险证据（2026-08-01）

原始报告为 [`acceptance/evidence/report_spike03.json`](acceptance/evidence/report_spike03.json)：
Win7 上的 Electron Node 运行 harness，harness 直接调用部署的真实
`GitAdapter.prepare()`，再以其生成的结构化 argv、隔离环境和工作目录启动 Git。报告记录 Git
`2.46.2.windows.1`、12 个已执行 case、11/12 通过和 `NO-GO`。

- P01--P04、N01、N04--N07、N10 在该次运行中报告为 PASS；N05/N06/N10 的白名单拒绝是
  fail-closed 行为。
- **N02 为 FAIL**：`.gitattributes` 选择的仓库本地 `filter.*.process` 写入了哨兵文件，且 Git
  返回 128。这证明当时的隔离 argv 没有阻断仓库本地 filter 子进程；“进程因 filter 协议不完整
  而退出”不能被当作未逃逸。
- 原报告把 N03 记为 PASS，但其命令没有充分证明 textconv 被实际触发；因此 N03 的有效结论是
  **UNVERIFIED**，不是安全通过。当前工作区 harness 草案使用两次提交加
  `git show --textconv HEAD`；它与所述的 `git diff --textconv HEAD~1 HEAD` 重跑命令不一致，
  且两者都尚未有对应的 Win7 原始报告。
- 该运行也没有覆盖 N08/N09，故它不是任务书 P01--P04/N01--N10 的完整矩阵。

报告只声明“真实 `dist`”，没有记录部署的 adapter/harness SHA-256。因此它可复核为旧工件的
真实风险发现，但不能证明当前源码或当前 `dist` 已在 Win7 修复。当前适配器已在 `prepare()`
阶段对选择 `filter`/`diff` 外部属性的仓库 fail-closed；其开发机回归只能作为待重跑的修复依据，
不能替代受控 MinGit 上的实机证据。

## 目标

验证在 Win7 SP1 x64 上实现安全 Git 适配器的可行性：
- 环境变量隔离（防止 Git 配置注入）
- 结构化 argv 执行（无 shell 调用）
- 命令白名单（读/写分类）
- 恶意样本仓库攻击面覆盖

## 验证矩阵

### 正向验证（P01-P04）

| ID   | 验证项                                       | 静态检查 | Win7 实机 |
|------|----------------------------------------------|----------|-----------|
| P01  | GIT_CONFIG_NOSYSTEM=1 生效                   | ✓        | 原报告 PASS（非正式） |
| P02  | HOME/XDG_CONFIG_HOME 重定向                  | ✓        | 原报告 PASS（非正式） |
| P03  | -c 参数显式注入配置                          | ✓        | 原报告 PASS（非正式） |
| P04  | 白名单命令执行                               | ✓        | 原报告 PASS（非正式） |

### 负向验证（N01-N10 攻击面）

| ID   | 攻击面                                       | 静态检查 | Win7 实机 |
|------|----------------------------------------------|----------|-----------|
| N01  | hooks 仓库攻击                               | ✓        | 原报告 PASS（非正式） |
| N02  | filter 仓库攻击                              | ✓        | **原报告 FAIL：哨兵逃逸** |
| N03  | textconv 仓库攻击                            | ✓        | UNVERIFIED：原触发不足，待确定性重跑 |
| N04  | pager 仓库攻击                               | ✓        | 原报告 PASS（非正式） |
| N05  | credential.helper 攻击                       | ✓        | 原报告 PASS（非正式，白名单拒绝） |
| N06  | core.sshCommand 攻击                         | ✓        | 原报告 PASS（非正式，白名单拒绝） |
| N07  | core.fsmonitor 攻击                          | ✓        | 原报告 PASS（非正式） |
| N08  | GIT_* 环境变量注入                           | ✓        | 未覆盖 |
| N09  | SSH_* 环境变量注入                           | ✓        | 未覆盖 |
| N10  | 全局 config 修改攻击                         | ✓        | 原报告 PASS（非正式，白名单拒绝） |

## 文件结构

```
03-git-adapter/
├── adapter/
│   ├── isolation.ts      # 隔离配置注入器
│   ├── executor.ts       # 结构化 argv 执行器
│   └── whitelist.ts      # 命令白名单
├── malicious/
│   └── generator.ts      # 恶意样本仓库生成器
├── test/
│   └── run_matrix.ts     # 完整验证矩阵执行
└── README.md             # 本文件
```

## 使用方法

### 静态验证（现代构建机）

```bash
# 编译 TypeScript
npx tsc

# 运行验证矩阵
node test/run_matrix.js
```

### Win7 实机验证

```bash
# 需要 Git for Windows 已安装
# 需要 Node.js 运行时

# 生成恶意样本仓库
node malicious/generator.js

# 运行完整测试
node test/run_matrix.js
```

## Go/No-Go 报告模板

```
SPIKE 03 - Go/No-Go 报告
========================
日期: YYYY-MM-DD
Win7 版本: Windows 7 SP1 x64
Git 版本: x.y.z

正向验证:
  [  ] P01 - GIT_CONFIG_NOSYSTEM
  [  ] P02 - HOME/XDG_CONFIG_HOME 重定向
  [  ] P03 - -c 参数配置注入
  [  ] P04 - 白名单命令执行

负向验证:
  [  ] N01 - hooks 攻击防护
  [  ] N02 - filter 攻击防护
  [  ] N03 - textconv 攻击防护
  [  ] N04 - pager 攻击防护
  [  ] N05 - credential.helper 攻击防护
  [  ] N06 - sshCommand 攻击防护
  [  ] N07 - fsmonitor 攻击防护
  [  ] N08 - GIT_* 环境变量防护
  [  ] N09 - SSH_* 环境变量防护
  [  ] N10 - 全局 config 修改防护

总计: __/14 通过

判定: [ GO / NO-GO ]

备注:
- 
```

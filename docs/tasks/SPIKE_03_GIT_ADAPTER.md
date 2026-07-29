# SPIKE_03 — Git Adapter 隔离与恶意仓库负向验证（GIT_ADAPTER）

> 实现前必读：`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、ADR-0032（Proposed）、本文档。
> 不占用 ADR-0012 阶段编号（ADR-0034）。

## 0. 实现授权（ADR-0011 / C14）

### 0.1 状态块

```
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: SPIKE
Target Branch: spike/03-git-adapter
Phase-Gate: N/A (SPIKE)
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: PC-003 ruled 2026-07-29; scaffolding may proceed on modern build host, but Win7-Validation stays NOT_PERFORMED until executed on Win7 SP1 x64 hardware
```

### 0.2 路径白名单（获批后生效）

- `spikes/03-git-adapter/**`（Adapter 原型、恶意样本仓库生成器、测试脚本、证据目录）
- 本文档自身（§9 验证记录追加）

禁止路径：`src/**`、其他任务书、`AGENTS.md`、已 Accepted ADR 正文。

## 1. 目标

在 Win7 实机验证 MinGit 2.46.2（D-012）在 ADR-0032 隔离配置下，G10 恶意仓库负向
矩阵零逃逸，为 Git/Worktree 升级为正式能力提供证据。

## 2. 非目标

- 不实现生产 Adapter API/审批 UI；原型只需覆盖隔离配置注入与白名单命令执行。
- 不验证网络类 Git 操作（fetch/push/clone 不在 v1 本地白名单，ADR-0032 第 5 条）。

## 3. Runtime Profile（C15）

- MinGit 2.46.2 x64 随包解压（哈希入库时锁定，§6.1）；不安装、不写系统 PATH。
- 隔离强制项：`GIT_CONFIG_NOSYSTEM=1`；`HOME`/`XDG_CONFIG_HOME` 指向受控空目录；
  净化环境（剥离 `GIT_*`、`SSH_*` 等）；全部配置经 `-c` 显式注入。
- 封堵项（`-c` + 环境变量双保险）：`core.hooksPath` 指空目录、filter/textconv/pager/
  editor/askpass/credential helper/`core.sshCommand`/remote helper/`core.fsmonitor`。
- 执行通道：结构化 argv（无 shell），超时 + 输出上限 + 进程树终止（可复用 SPIKE_02 helper 或临时等价物）。

## 4. 验证矩阵

### 4.1 白名单命令功能（正向）

| # | 用例 | 通过标准 |
|---|------|----------|
| P01 | 读类命令 status/diff/log/show/branch/`worktree list` | 在隔离配置下正确返回，无外部进程/网络 |
| P02 | 写类命令 add/commit/`worktree add`（模拟审批已通过） | 正确执行且仅影响工作区；worktree 隔离生效 |
| P03 | 白名单外命令（如 `git config --global`、`git fetch`） | 被 Adapter 拒绝 |
| P04 | 中文+空格路径仓库 | 全部命令正确处理路径 |

### 4.2 G10 恶意仓库负向矩阵（硬门槛，全部零逃逸）

每个用例构造一个触发对应攻击面的仓库，对其执行读类命令，验证零进程/零网络：

| # | 攻击面 | 构造 | 要求 |
|---|--------|------|------|
| N01 | hooks | 仓库内 `.git/hooks/*` + 配置 `core.hooksPath` | 不执行任何 hook 脚本 |
| N02 | clean/smudge filter | `.gitattributes` filter + `filter.*.process` | 不启动 filter 进程 |
| N03 | textconv | `.gitattributes` diff textconv + `diff.*.textconv` | `git diff/show` 不调用 textconv 程序 |
| N04 | pager | `core.pager` 指向恶意程序 | 不启动 pager |
| N05 | editor | `core.editor`/`sequence.editor` | 不启动 editor（写命令走审批不触发交互编辑器） |
| N06 | credential helper | `credential.helper` 指向恶意程序 | 不调用凭据程序，不读凭据 |
| N07 | SSH / remote helper | `core.sshCommand`、`remote.*.url` 指 `ext::`/自定义 helper | 读命令不触网、不启动 helper |
| N08 | fsmonitor | `core.fsmonitor` 指向恶意程序 | 不启动 fsmonitor 进程 |
| N09 | LFS/GCM 缺席 | 依赖 LFS 的仓库 | 不随包携带 LFS/GCM，明确报告能力缺失而非静默调用系统组件 |
| N10 | `.gitattributes` 组合注入 | 多攻击面叠加 | 组合下仍零逃逸 |

监测手段：进程创建审计（Job/`tasklist` 前后比对）+ 抓包（零出站）。

## 5. Go/No-Go 判据（ADR-0032）

- **Go：** P01~P04 全过 + N01~N10 零逃逸（零外部进程、零网络）。
- **No-Go：** 任一负向用例逃逸且无法在隔离配置内封堵 → Git 降级为**只读观测**
  （沿用 Phase 2 固定只读 Git 子进程语义），写操作远程化。

## 6. 交付物

1. Adapter 隔离原型 + 恶意样本仓库生成器（`spikes/03-git-adapter/**`）。
2. Win7 实机证据包（进程审计快照、抓包、每个负向用例的判定日志）。
3. Go/No-Go 报告 + 隔离配置 `-c` 清单冻结提案（进 PHASE_06 Git Adapter 集成）。
4. D-012 哈希与 MinGit 裁剪内容清单登记（WIN7_CONSTRAINTS §6.1）。

## 7. 治理

- 失败只废弃 `spike/03-*` 分支；证据与报告以 `docs:` 提交进 main。

## 8. 开放问题

- MinGit 裁剪包的确切组件清单（确认 LFS/GCM 已排除）。

## 9. 验证记录（占位，验收时填写）

```
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Target environment unavailable
```

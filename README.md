# win7-coding-agent

面向 **Windows 7 SP1 x64** 的企业内部通用 Coding Agent 执行端与客户端。
模型推理默认运行在远程/内网服务器；Win7 端负责交互界面、代码读取、受控修改、命令执行、测试验证、状态保存与审计。

Windows 7 是唯一固定平台。项目不再全局限定 Python-only、stdlib-only、CLI-only，也不再禁止
Node.js、Electron、.NET Framework、Win32 原生组件或第三方依赖；每个组件必须声明精确的
Runtime Profile、锁定依赖并通过 Win7 实机验证（ADR-0027）。这项架构变更不改变既有
Phase 1/2 的 Python 3.8.10 冻结合同，也不绕过 `AGENTS.md` C14 的任务授权机制。

## 项目状态

| 阶段 | 内容 | 状态 |
|------|------|------|
| 0 | 工程基线与文档体系 | 进行中（本仓库当前内容） |
| 1 | Capability Probe | 修复轮 R1--R8 已实现，待架构师解除 Phase-Gate 后进行 Win7 E1/E2 实机验收 |
| 2 | 正式只读代码分析 Agent | 已实现，等待独立架构复审；Win7 验证未执行 |
| 3+ / 新客户端 | 见 `docs/ROADMAP.md` | 未开始，须先建立获批任务书 |

阶段 1/2 实现遵循任务授权机制（`AGENTS.md` C14 / ADR-0011）；真实 Win7 E1/E2
验收完成前，不得将对应阶段标记为完成。ADR-0027 是新的项目级架构基线，不构成当前分支的
桌面客户端、运行时或依赖实现授权。

## Phase 1 Capability Probe 运行方式

Capability Probe 是历史阶段组件，仍固定使用 CPython 3.8.10 标准库。在 Windows
`cmd.exe` 中从项目根目录运行：

```bat
scripts\run_probe.bat
scripts\run_probe.bat --out "D:\中文 目录\probe_report.json"
scripts\run_probe.bat --list
scripts\run_tests.bat
```

也可以在已将 `src` 放入 `PYTHONPATH` 的环境中运行：

```bat
python -m win7_agent.probe --out probe_report.json --db probe_report.sqlite3
```

Probe 仅做离线环境检测，不安装软件、不修改系统配置、不访问网络。JSON 报告是唯一权威输出；
退出码 `0` 表示全通过，`1` 表示存在可降级能力，`2` 表示存在失败/检查错误，`3` 表示参数或
报告写出错误。Win7 实机验收步骤见 [`tests/win7/README.md`](tests/win7/README.md)。
这里的“离线”和“仅标准库”只属于 Phase 1 冻结合同，不是所有未来组件的全局限制。

## 给 Coding Agent / 新成员的入口

按此顺序阅读：

1. [`AGENTS.md`](AGENTS.md) — 最高约束，单一事实来源
2. [`docs/WIN7_CONSTRAINTS.md`](docs/WIN7_CONSTRAINTS.md) — 兼容性红线与依赖评审流程
3. 当前分支对应的阶段任务文档；现有正式任务包括
   [`docs/tasks/PHASE_01_CAPABILITY_PROBE.md`](docs/tasks/PHASE_01_CAPABILITY_PROBE.md)
   与
   [`docs/tasks/PHASE_02_READONLY_CODE_ANALYSIS.md`](docs/tasks/PHASE_02_READONLY_CODE_ANALYSIS.md)

Claude 专用指令见 [`CLAUDE.md`](CLAUDE.md)。

## 文档地图

```
AGENTS.md                       最高项目约束（先读这个）
CLAUDE.md                       Claude 工作指令
README.md                       本文件
docs/
  PROJECT_CHARTER.md            项目章程：目标、范围、非目标、成功标准
  ARCHITECTURE.md               架构：当前实现 vs 未来规划（明确区分）
  WIN7_CONSTRAINTS.md           Win7 兼容性 Profile + 依赖/运行时评审登记表
  ROADMAP.md                    阶段划分与各阶段完成标准
  SECURITY.md                   威胁模型与安全规则
  EVALUATION.md                 验证与评估方法
  DECISIONS.md                  ADR 决策记录
  tasks/
    PHASE_01_CAPABILITY_PROBE.md  阶段 1 冻结任务书（Python 3.8.10）
    PHASE_02_READONLY_CODE_ANALYSIS.md  阶段 2 冻结任务书（只读 Agent）
```

## 核心硬约束速览

- 唯一固定目标环境是 Windows 7 SP1 x64；运行时、架构、依赖与交付模式由组件
  Runtime Profile 和获批任务书声明。
- 可使用经评审且固定版本的 Python、Node.js、Electron、.NET Framework、Win32 原生组件
  与第三方依赖；Docker/WSL 可以用于构建或远程服务，但不能成为 Win7 本地前置。
- 禁止使用 Win10+ 专属 API；可选能力缺失必须明确降级，不能静默失败。
- Agent 非交互命令具备超时、输出上限与进程树终止；用户交互终端具备取消、背压、
  会话上限与强制终止。
- Agent 工具使用结构化参数并经过 Policy、权限确认与审计；不执行模型拼接的 Shell 字符串。
- Git 使用专用隔离适配器；用户交互终端不向模型开放 stdin，不能作为 Runner 权限旁路。
- 所有路径逻辑兼容中文/空格路径；文本 I/O 显式编码，未知内容按字节保持。
- 每个实现仍须满足 C14：任务书状态为 `APPROVED_FOR_IMPLEMENTATION`，且只修改白名单路径。

完整清单见 `AGENTS.md` §4。

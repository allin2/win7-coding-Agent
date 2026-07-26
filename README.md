# win7-coding-agent

在 **Windows 7 SP1 x64 + Python 3.8.10（仅标准库）** 上运行的轻量通用 Coding Agent 执行端。
模型推理运行在远程/内网服务器；Win7 端负责代码读取、受控修改、非交互式命令执行、测试验证、状态保存与审计。

## 项目状态

| 阶段 | 内容 | 状态 |
|------|------|------|
| 0 | 工程基线与文档体系 | 进行中（本仓库当前内容） |
| 1 | Capability Probe | 修复轮 R1--R8 已实现，待架构师解除 Phase-Gate 后进行 Win7 E1/E2 实机验收 |
| 2+ | 见 `docs/ROADMAP.md` | 未开始 |

阶段 1 实现遵循任务授权机制（`AGENTS.md` C14 / ADR-0011）；真实 Win7 E1/E2 验收完成前，不得将阶段标记为完成。

## Capability Probe 运行方式

在 Windows `cmd.exe` 中从项目根目录运行：

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

Probe 仅做离线环境检测，不安装软件、不修改系统配置、不访问网络。JSON 报告是唯一权威输出；退出码 `0` 表示全通过，`1` 表示存在可降级能力，`2` 表示存在失败/检查错误，`3` 表示参数或报告写出错误。Win7 实机验收步骤见 [`tests/win7/README.md`](tests/win7/README.md)。

## 给 Coding Agent / 新成员的入口

按此顺序阅读：

1. [`AGENTS.md`](AGENTS.md) — 最高约束，单一事实来源
2. [`docs/WIN7_CONSTRAINTS.md`](docs/WIN7_CONSTRAINTS.md) — 兼容性红线与依赖评审流程
3. [`docs/tasks/PHASE_01_CAPABILITY_PROBE.md`](docs/tasks/PHASE_01_CAPABILITY_PROBE.md) — 当前阶段任务

Claude 专用指令见 [`CLAUDE.md`](CLAUDE.md)。

## 文档地图

```
AGENTS.md                       最高项目约束（先读这个）
CLAUDE.md                       Claude 工作指令
README.md                       本文件
docs/
  PROJECT_CHARTER.md            项目章程：目标、范围、非目标、成功标准
  ARCHITECTURE.md               架构：当前实现 vs 未来规划（明确区分）
  WIN7_CONSTRAINTS.md           Win7/Py3.8 兼容性限制 + 依赖评审登记表
  ROADMAP.md                    阶段划分与各阶段完成标准
  SECURITY.md                   威胁模型与安全规则
  EVALUATION.md                 验证与评估方法
  DECISIONS.md                  ADR 决策记录
  tasks/
    PHASE_01_CAPABILITY_PROBE.md  阶段 1 任务书（含 JSON Schema、测试矩阵、验收标准）
```

## 核心硬约束速览

- 目标环境 Windows 7 SP1 x64，Python 3.8.10，仅标准库，完全离线交付。
- 禁止：Node.js/Electron/Docker/WSL、Python 3.9+ 语法、Win10+ API、`shell=True`、运行时联网装依赖。
- 所有子进程：超时 + 输出上限 + 可强制终止。
- 所有路径逻辑兼容中文/空格路径；所有文件 I/O 显式编码。

完整清单见 `AGENTS.md` §4。

## Prototype (independent branch only)

`prototype/full-agent-skeleton` contains an architecture prototype, not a formal Win7 delivery and not a candidate for wholesale merge to `main`. Its deterministic, local MockProvider demonstration can be run with:

```bat
scripts\run_prototype_demo.bat
```

It uses only read-only workspace tools, writes its event database to a temporary directory unless `--event-db` is supplied, and never accesses a real model or network.

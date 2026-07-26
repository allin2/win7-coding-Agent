# Win7 SP1 实机验收说明

本目录用于 E1/E2 的离线实机验收，不能由 macOS、Linux 或 Windows 10/11 的回归结果替代。

## 前置条件

- Windows 7 SP1 x64，普通用户，外网断开。
- CPython 3.8.10 x64；E2 可额外用 CPython 3.8.10 x86 运行一次。
- 将整个项目复制到本地 NTFS 路径；E2 必须使用包含中文和空格的安装路径。

## E1 基准验收

在项目根目录执行：

```bat
scripts\run_tests.bat
scripts\run_probe.bat --out probe_report.json --db probe_report.sqlite3
```

确认 JSON 可由 `python -c "import json; json.load(open('probe_report.json', encoding='utf-8')); print('ok')"` 读取，检查项为 18 项，`tool.git` 为 `pass`，并检查 `report.sqlite` 中 `checks` 表有 17 行。

## E2 边界验收

在中文和空格路径中执行，确保 Git 不在 `PATH`，并使用中文输出目录：

```bat
scripts\run_probe.bat --out "D:\中文 目录\probe report.json"
```

确认 `tool.git` 为 `degraded` / `TOOL_NOT_FOUND`；即使总退出码为 1，报告仍完整。按 `docs/EVALUATION.md` §5 在 `docs/acceptance/` 留存环境快照、报告 SHA-256 与失败处置。

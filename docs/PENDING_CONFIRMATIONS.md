# 待确认清单

本清单记录阶段 1 实现中发现、但实现工程师无权自行裁决的任务书矛盾；不改变任何已接受 ADR 或冻结架构原则。

## PC-001：包根文件与实现路径白名单冲突

- 状态：待项目负责人裁决。
- 发现位置：`docs/tasks/PHASE_01_CAPABILITY_PROBE.md` §0.2 与 §4.1。
- 事实：§4.1 要求创建 `src/win7_agent/__init__.py`，但 §0.2 的唯一源码白名单为 `src/win7_agent/probe/**`，不包含该文件。
- 当前处理：未创建白名单外文件；使用 CPython 3.8 支持的隐式命名空间包，使 `python -m win7_agent.probe` 在 `src` 位于 `PYTHONPATH` 时可运行。
- 需要裁决：是否将 `src/win7_agent/__init__.py` 明确加入阶段 1 白名单，以完全满足 §4.1 的版本常量要求。

## PC-002：开发环境未提供 CPython 3.8.10

- 状态：待 Win7 E1/E2 验收环境执行。
- 事实：当前开发环境仅发现 CPython 3.9.6，未发现 `python3.8` 可执行文件。
- 当前处理：已用现有解释器完成编译、unittest、JSON 与 SQLite 证据文件验证；代码仅采用 Python 3.8 可用的语法和标准库 API。
- 需要裁决：无；请在 E1/E2 使用 CPython 3.8.10 执行任务书 T01--T25，并按 `docs/EVALUATION.md` §5 留存验收记录。

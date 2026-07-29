# 待确认清单

本清单记录阶段 1 实现中发现、但实现工程师无权自行裁决的任务书矛盾；不改变任何已接受 ADR 或冻结架构原则。

## PC-001：包根文件与实现路径白名单冲突

- 状态：已裁决（2026-07-27，ADR-0017）：`src/win7_agent/__init__.py` 已加入 PHASE_01 §0.2 白名单，仅允许包含 `__version__ = "0.1.0"`。本条关闭。
- 发现位置：`docs/tasks/PHASE_01_CAPABILITY_PROBE.md` §0.2 与 §4.1。
- 事实：§4.1 要求创建 `src/win7_agent/__init__.py`，但 §0.2 的唯一源码白名单为 `src/win7_agent/probe/**`，不包含该文件。
- 当前处理：已创建 `src/win7_agent/__init__.py`，且内容严格限定为 `__version__ = "0.1.0"`。
- 需要裁决：无。

## PC-002：开发环境未提供 CPython 3.8.10

- 状态：部分解除；待 Win7 E1/E2 验收环境执行。
- 事实：早期开发环境仅有 CPython 3.9.6；此后开发机已完成正式 CPython 3.8.10 验证（Phase 2 Gate `PYTHON38_VALIDATED`，提交 `fd40ad2`，标签 `phase2-py38-validated`；原型线另见 `prototype-r1-py38-verified`）。仍缺失的只有 Win7 SP1 x64 实机环境。
- 当前处理：Phase 1/2 代码均已在 CPython 3.8.10 下通过编译与测试矩阵；代码仅采用 Python 3.8 可用的语法和标准库 API。
- 需要裁决：无；请在 Win7 实机 E1/E2 使用 CPython 3.8.10 执行各任务书验收矩阵，并按 `docs/EVALUATION.md` §5 留存验收记录。

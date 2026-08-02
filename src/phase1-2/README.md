# Phase 1/2 — Python 代码

本目录存放 Phase 1（Capability Probe）与 Phase 2（Readonly Code Analysis Agent）的实现代码。

## 运行时

- **CPython 3.8.10**（Phase 1/2 冻结合同）
- 仅使用 Python 标准库

## 目录结构

- `win7_agent/` — Phase 1 Probe + Phase 2 只读分析 Agent
  - `probe/` — Capability Probe 实现
  - `cli/` — 命令行接口
  - `context/` — 上下文管理
  - `models/` — 数据模型
  - `policy/` — 策略引擎
  - `runtime/` — 运行时
  - `storage/` — 存储层
  - `tools/` — 工具层
  - `verification/` — 验证模块
  - `workspace/` — 工作区管理

## 测试

- 单元测试位于 `tests/` 顶层目录
- 运行方式：`pytest` 或 `scripts/run_tests.bat`

## 阶段状态

- Phase 1：待 Win7 E1/E2 验收
- Phase 2：待 Win7 实机验收

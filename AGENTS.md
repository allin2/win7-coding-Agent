# AGENTS.md — win7-coding-agent 最高项目约束（单一事实来源）

> 本文件是本仓库所有 Coding Agent（Claude、其他 LLM Agent、人类工程师）的**最高约束文档**。
> 任何其他文档、注释、口头约定与本文件冲突时，以本文件为准。
> 修改本文件必须在 `docs/DECISIONS.md` 中新增一条 ADR 说明理由。

## 1. 文档优先级（冲突裁决顺序）

1. `AGENTS.md`（本文件）
2. `docs/WIN7_CONSTRAINTS.md`（兼容性红线）
3. `docs/tasks/PHASE_XX_*.md`（当前阶段任务文档）
4. `docs/ARCHITECTURE.md` / `docs/SECURITY.md`
5. 其余文档

## 2. 项目一句话定义

构建一个运行在 **Windows 7 SP1 x64 + Python 3.8.10（仅标准库）** 上的轻量通用 Coding Agent 执行端；模型推理在远程/内网服务器完成，Win7 端负责代码读取、受控修改、非交互式命令执行、测试验证、状态保存与审计。

## 3. 当前阶段（必须先确认再动手）

- 当前处于 **阶段 0（工程基线）+ 阶段 1（Capability Probe）**。
- 阶段 1 任务文档：`docs/tasks/PHASE_01_CAPABILITY_PROBE.md`，状态 `APPROVED_FOR_IMPLEMENTATION`（允许路径见该文档 §0.2）。
- 当前阶段**不实现 Agent Loop、不接入大模型、不修改用户代码**。
- 阶段边界以 `docs/ROADMAP.md` 为准；不得跨阶段实现未来功能。

## 4. 硬性技术约束（逐条可测试，违反即打回）

| # | 约束 | 验证方式 |
|---|------|----------|
| C01 | 目标运行环境为 Windows 7 SP1 x64 | 在 Win7 SP1 x64 实机/VM 上跑通验收用例 |
| C02 | Python 固定为 3.8.10（CPython） | 代码中不出现任何 3.9+ 语法/库；`python --version` 检查 |
| C03 | 仅使用 Python 标准库 | 无 `pip install`；`import` 静态扫描仅命中标准库 |
| C04 | 禁止 Node.js / Electron / Docker / WSL | 仓库中不出现相关配置、脚本、依赖 |
| C05 | 禁止 Python 3.9+ 语法与库能力 | 见 `docs/WIN7_CONSTRAINTS.md` §3 禁用清单；CI 用 3.8 解释器做 `compileall` |
| C06 | 禁止 Windows 10+ 专属 API | 见 `docs/WIN7_CONSTRAINTS.md` §4 禁用清单 |
| C07 | 禁止运行时在线安装依赖 | 运行期无任何网络下载行为 |
| C08 | 所有子进程必须有：超时 + 输出上限 + 强制终止 | 代码审查 + `docs/EVALUATION.md` 子进程测试项 |
| C09 | 禁止 `shell=True`，禁止 `os.system` / `os.popen` | 静态扫描零命中 |
| C10 | 路径逻辑必须兼容中文路径、空格路径、Windows 盘符/反斜杠 | 测试矩阵含中文、空格、混合路径用例 |
| C11 | 所有文件 I/O 必须显式指定编码，禁止依赖 `locale` 默认编码 | 静态扫描 `open(` 无 encoding 参数即打回（二进制模式除外） |
| C12 | 完全离线交付：交付包不依赖任何在线资源 | 断网环境完成安装与运行验收 |
| C13 | 不得假设已安装 PowerShell / VS / .NET SDK / 其他开发工具 | 探测类功能对缺失工具必须降级而非崩溃 |
| C14 | 实现代码采用**任务授权机制**：默认禁止编写实现代码；仅当当前任务文档标注 `Status: APPROVED_FOR_IMPLEMENTATION` 时方可实现，且实现文件只能位于该任务文档列出的允许路径内（ADR-0011） | 核对任务文档状态与路径白名单；白名单外出现实现文件即打回 |

## 5. Agent 工作流程规则

任何 Coding Agent 在本仓库工作时必须：

1. **先读**：`AGENTS.md` → `docs/WIN7_CONSTRAINTS.md` → 当前阶段 `docs/tasks/PHASE_XX_*.md`。
2. **只做当前阶段任务**。发现任务文档缺失或与本文件矛盾时，停止实现并在输出中列出矛盾，不得自行取舍。
3. **实现授权检查**：动手写实现代码前，确认当前任务文档状态为 `APPROVED_FOR_IMPLEMENTATION`，且目标文件路径在该文档的允许路径清单内；文档与 ADR 文件的修改不受实现路径清单限制，但仍遵循本文件的文档规则。**禁止以“临时豁免某个目录”等任何方式绕过 C14**（ADR-0011）。
4. **新增依赖**（包括标准库中的高风险模块，如 `ctypes`、`winreg`）必须先在 `docs/WIN7_CONSTRAINTS.md` §6 登记评审记录，通过后方可使用。
5. **关键设计决策**（影响接口、数据格式、兼容性、安全模型的决策）必须写入 `docs/DECISIONS.md`（ADR 风格），不允许只体现在代码里。
6. **不得删除或改写已接受（Accepted）ADR 的正文**，只能新增 ADR 并将旧 ADR 状态行标记为 Superseded。
7. 所有新写的 Markdown 文档使用 UTF-8（无 BOM）编码、LF 换行；未来的 Python 源码同样使用 UTF-8（无 BOM）。
8. 输出物必须可在断网的 Win7 SP1 x64 环境验证，凡是"在我的机器上能跑"的验证一律不算通过；允许在现代开发环境 + Python 3.8.10 上开发与回归，但阶段完成标记以 Win7 验收为硬门槛（见 `docs/EVALUATION.md`）。

## 6. 代码规则（对未来实现阶段生效，现在即冻结）

- 语言级别：以 `python3.8 -m compileall` 通过为最低门槛；禁止 `match`、`dict |=`、`str.removeprefix/removesuffix`、内置泛型标注 `list[str]`、`zoneinfo`、`graphlib`、`functools.cache` 等 3.9+ 能力（完整清单见 `docs/WIN7_CONSTRAINTS.md` §3）。
- 子进程统一通过未来的 `runner` 模块调用，业务代码禁止直接 `subprocess.Popen`。
- 控制台输出只允许 ASCII 字符（Win7 cmd 默认 CP936，非 ASCII 会乱码/抛错）；完整信息写入 UTF-8 文件。
- 所有持久化数据格式必须有版本号字段。
- 每个模块必须可独立测试，失败必须产生结构化错误（见各阶段任务文档的错误模型）。

## 7. 明确禁止事项（全局）

- 禁止交互式子进程（任何等待 stdin 的命令必须以关闭/重定向 stdin 的方式运行）。
- 禁止写注册表、禁止要求管理员权限。
- 禁止在探测/测试代码中访问外部网络。
- 禁止生成"占位式"文档或 TODO 空章节——每条规则必须可执行、可测试。
- 禁止静默吞异常：捕获后必须记录到结构化输出。

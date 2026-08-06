# SPIKE 02 - 终端容器化验证

## 状态

- **任务书**：`docs/tasks/SPIKE_02_TERMINAL_CONTAINMENT.md`
- **状态**：APPROVED_FOR_IMPLEMENTATION
- **Win7 实机验证**：A4 非交互 Runner 自动矩阵 `A4-20260805-123467` 为 14/14 PASS；完整 SPIKE_02 仍为 PARTIAL
- **成果迁入**：非交互 helper 已有精确 SHA 的 Win7 证据；生产 Runner、交互终端及完整 Go/No-Go 仍受独立 Gate 约束

> **Win7-Validation: A4_AUTOMATION_PASS / SPIKE_PARTIAL** — 精确候选 `733f5491…eecc` 已在 Win7 SP1 x64 完成非交互 14 项矩阵；未使用 taskkill，超时/取消/最终残留为 0。缺失的 A5/A6 Electron 22 ABI 工件、ACL/网络/生产授权不由该结果替代。

## 目标

验证在 Win7 SP1 x64 上实现安全终端容器的可行性：
- C++ Helper 通过 Win32 Job Object + Restricted Token 隔离子进程
- winpty 集成实现伪终端通信
- VT/OSC 序列过滤防止终端注入攻击（C19 负向防护）

## 正式验证矩阵状态

以下 ID 与 `docs/tasks/SPIKE_02_TERMINAL_CONTAINMENT.md` 一致；完整正式结论仍为
`NO_GO_FORMAL_GAPS`。

| ID | 验证项 | Win7 / Gate 状态 |
|----|--------|------------------|
| C01 | Job Object 进程树必杀 | PASS |
| C02 | 已在不可嵌套 Job 时 fail-closed | PASS |
| C03 | Restricted Token 工作区外/注册表边界 | FAIL（工作区外写入仍成功） |
| C04 | ACL 工作区外拒绝 | MANUAL_GATE |
| C05 | TCP/UDP/DNS 实际可达性 | ENVIRONMENT_MISSING（loopback 已观测） |
| C06 | argv 白名单 | PASS |
| C07 | 超时、输出上限与整树清理 | PASS |
| C08 | Runner 内存预算 | PASS |
| T01～T05 | 交互终端与会话回收 | BUILD_HOST_MISSING |
| N01～N05 | C19 终端输入/VT/设备应答负向 | BUILD_HOST_MISSING |
| N06 | 禁止 `taskkill` 冒充 containment | PASS |

## 文件结构

```
02-terminal-containment/
├── helper/
│   ├── helper.cpp        # C++ helper 主入口骨架
│   ├── helper.h          # 头文件定义
│   └── CMakeLists.txt    # MSVC v142 编译配置骨架
├── winpty/
│   ├── winpty_host.js    # winpty 宿主进程管理
│   ├── terminal_session.js # 终端会话管理
│   └── filter.js         # VT/OSC 过滤器
├── test/
│   ├── generate_malicious.js # 恶意输入生成器
│   └── test_containment.sh   # containment 测试脚本
└── README.md             # 本文件
```

## 使用方法

### C++ Helper 编译（Win7 实机）

```bash
cd helper
mkdir build && cd build
cmake .. -G "Visual Studio 16 2019" -A x64  # MSVC v142
cmake --build . --config Release
```

### winpty 集成测试

```bash
cd winpty
node winpty_host.js
```

### 恶意输入测试

```bash
cd test
node generate_malicious.js
```

## Go/No-Go 报告模板

## A4 无人值守后续编排

SPIKE_02 的 A4 非交互 helper 后续验收由 [`acceptance/README.md`](acceptance/README.md) 和
[`acceptance/AUTO-FUP-20260805-01-plan.json`](acceptance/AUTO-FUP-20260805-01-plan.json)定义；
入口只负责 AUTO-00～AUTO-07，不改写历史 A4-14/A4-20/A4-21 证据。严格 SSH、Bitvise、精确工件
哈希、全新 acceptance/data root 和零残留是危险阶段的硬停止条件；生产 Runner、交互终端、ACL、
网络观测及 A5/A6 继续保留各自 Gate。

最新自动执行 `A4-20260805-123467` 已实现 AUTO-00～07 全 PASS，Win7 非交互 Runner 14/14、超时/取消零残留、`taskkill=false`、Bitvise-after RUNNING。补充执行 `A4-20260806-140606` 已确认 C02 PASS、C03 FAIL、C05 loopback PASS（正式 C05 仍环境缺失）；修正后的审计 ID 为 `A4-20260806-140606-REMAINING`。完整 SPIKE_02 的正式原子项当前直接通过 6/19，仍为 `NO_GO_FORMAL_GAPS`，详见 [`acceptance/evidence/A4-20260806-140606/remaining-acceptance-audit.html`](acceptance/evidence/A4-20260806-140606/remaining-acceptance-audit.html)。

```
SPIKE 02 - Go/No-Go 报告
========================
日期: YYYY-MM-DD
Win7 版本: Windows 7 SP1 x64
MSVC 版本: v142 (Visual Studio 2019)

验证结果:
  [  ] C01 - Job Object 创建
  [  ] C02 - Restricted Token
  [  ] C03 - ACL 设置
  [  ] C04 - argv 白名单
  [  ] C05 - 子进程启动
  [  ] C06 - 超时终止
  [  ] C07 - 输出上限
  [  ] C08 - winpty 宿主
  [  ] C09 - stdin 隔离
  [  ] C10 - 路径兼容性
  [  ] C11 - KILL_ON_JOB_CLOSE
  [  ] C12 - IsProcessInJob
  [  ] C13 - VT 过滤
  [  ] C14 - 标题注入防护
  [  ] C15 - DECRQSS 防护

总计: __/15 通过

判定: [ GO / NO-GO ]

备注:
- 
```

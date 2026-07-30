# SPIKE 02 - 终端容器化验证

> **Win7-Validation: NOT_PERFORMED**

## 目标

验证在 Win7 SP1 x64 上实现安全终端容器的可行性：
- C++ Helper 通过 Win32 Job Object + Restricted Token 隔离子进程
- winpty 集成实现伪终端通信
- VT/OSC 序列过滤防止终端注入攻击（C19 负向防护）

## 验证矩阵

| ID   | 验证项                                       | 静态检查 | Win7 实机 |
|------|----------------------------------------------|----------|-----------|
| C01  | Job Object 创建与进程分配                    | ✓        | 待验证    |
| C02  | Restricted Token 创建                        | ✓        | 待验证    |
| C03  | ACL 设置（限制文件系统访问）                 | ✓        | 待验证    |
| C04  | argv 白名单验证                              | ✓        | 待验证    |
| C05  | 子进程启动与监控                             | ✓        | 待验证    |
| C06  | 超时终止                                     | ✓        | 待验证    |
| C07  | 输出上限截断                                 | ✓        | 待验证    |
| C08  | winpty 宿主进程管理                          | ✓        | 待验证    |
| C09  | 终端会话 stdin 隔离                          | ✓        | 待验证    |
| C10  | 中文+空格路径兼容                            | ✓        | 待验证    |
| C11  | JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE           | ✓        | 待验证    |
| C12  | IsProcessInJob 探测                          | ✓        | 待验证    |
| C13  | VT 序列过滤（OSC 52 等）                     | ✓        | 待验证    |
| C14  | 窗口标题注入防护                             | ✓        | 待验证    |
| C15  | DECRQSS 响应防护                             | ✓        | 待验证    |

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

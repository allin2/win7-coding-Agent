# SPIKE 03 - Git Adapter 隔离验证

> **Win7-Validation: NOT_PERFORMED**

## 目标

验证在 Win7 SP1 x64 上实现安全 Git 适配器的可行性：
- 环境变量隔离（防止 Git 配置注入）
- 结构化 argv 执行（无 shell 调用）
- 命令白名单（读/写分类）
- 恶意样本仓库攻击面覆盖

## 验证矩阵

### 正向验证（P01-P04）

| ID   | 验证项                                       | 静态检查 | Win7 实机 |
|------|----------------------------------------------|----------|-----------|
| P01  | GIT_CONFIG_NOSYSTEM=1 生效                   | ✓        | 待验证    |
| P02  | HOME/XDG_CONFIG_HOME 重定向                  | ✓        | 待验证    |
| P03  | -c 参数显式注入配置                          | ✓        | 待验证    |
| P04  | 白名单命令执行                               | ✓        | 待验证    |

### 负向验证（N01-N10 攻击面）

| ID   | 攻击面                                       | 静态检查 | Win7 实机 |
|------|----------------------------------------------|----------|-----------|
| N01  | hooks 仓库攻击                               | ✓        | 待验证    |
| N02  | filter 仓库攻击                              | ✓        | 待验证    |
| N03  | textconv 仓库攻击                            | ✓        | 待验证    |
| N04  | pager 仓库攻击                               | ✓        | 待验证    |
| N05  | credential.helper 攻击                       | ✓        | 待验证    |
| N06  | core.sshCommand 攻击                         | ✓        | 待验证    |
| N07  | core.fsmonitor 攻击                          | ✓        | 待验证    |
| N08  | GIT_* 环境变量注入                           | ✓        | 待验证    |
| N09  | SSH_* 环境变量注入                           | ✓        | 待验证    |
| N10  | 全局 config 修改攻击                         | ✓        | 待验证    |

## 文件结构

```
03-git-adapter/
├── adapter/
│   ├── isolation.ts      # 隔离配置注入器
│   ├── executor.ts       # 结构化 argv 执行器
│   └── whitelist.ts      # 命令白名单
├── malicious/
│   └── generator.ts      # 恶意样本仓库生成器
├── test/
│   └── run_matrix.ts     # 完整验证矩阵执行
└── README.md             # 本文件
```

## 使用方法

### 静态验证（现代构建机）

```bash
# 编译 TypeScript
npx tsc

# 运行验证矩阵
node test/run_matrix.js
```

### Win7 实机验证

```bash
# 需要 Git for Windows 已安装
# 需要 Node.js 运行时

# 生成恶意样本仓库
node malicious/generator.js

# 运行完整测试
node test/run_matrix.js
```

## Go/No-Go 报告模板

```
SPIKE 03 - Go/No-Go 报告
========================
日期: YYYY-MM-DD
Win7 版本: Windows 7 SP1 x64
Git 版本: x.y.z

正向验证:
  [  ] P01 - GIT_CONFIG_NOSYSTEM
  [  ] P02 - HOME/XDG_CONFIG_HOME 重定向
  [  ] P03 - -c 参数配置注入
  [  ] P04 - 白名单命令执行

负向验证:
  [  ] N01 - hooks 攻击防护
  [  ] N02 - filter 攻击防护
  [  ] N03 - textconv 攻击防护
  [  ] N04 - pager 攻击防护
  [  ] N05 - credential.helper 攻击防护
  [  ] N06 - sshCommand 攻击防护
  [  ] N07 - fsmonitor 攻击防护
  [  ] N08 - GIT_* 环境变量防护
  [  ] N09 - SSH_* 环境变量防护
  [  ] N10 - 全局 config 修改防护

总计: __/14 通过

判定: [ GO / NO-GO ]

备注:
- 
```

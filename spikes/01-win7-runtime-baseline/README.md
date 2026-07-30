# SPIKE 01 - Win7 运行时基线验证

> **Win7-Validation: NOT_PERFORMED**

## 目标

验证 Electron 22.3.27 在 Windows 7 SP1 x64 上的最小可行性，确认核心运行时约束可满足。

## 验证矩阵

| ID   | 验证项                                       | 静态检查 | Win7 实机 |
|------|----------------------------------------------|----------|-----------|
| T01  | Electron 22.3.27 可启动                      | ✓        | 待验证    |
| T02  | nodeIntegration=false / contextIsolation / sandbox | ✓  | 待验证    |
| T03  | 中文+空格路径兼容（C10）                     | ✓        | 待验证    |
| T04  | 单实例锁                                     | ✓        | 待验证    |
| T05  | 崩溃日志配置                                 | ✓        | 待验证    |
| T06  | GPU 降级 / 软件渲染                          | ✓        | 待验证    |
| T07  | 出站 CSP（default-src 'none'）               | ✓        | 待验证    |
| T08  | utilityProcess 可用性探测                    | ✓        | 待验证    |
| T09  | preload.js 使用 contextBridge                | ✓        | 待验证    |
| T10  | renderer 页面存在且引用 CSP                  | ✓        | 待验证    |
| T11  | package.json 脚本完整                        | ✓        | 待验证    |

## 文件结构

```
01-win7-runtime-baseline/
├── package.json        # Electron 22.3.27 最小项目配置
├── main.js             # 最小 Electron 主进程
├── preload.js          # contextBridge 白名单 API
├── renderer/
│   ├── index.html      # 最小验证页面
│   └── renderer.js     # 渲染进程验证逻辑
├── validate.js         # 自动化验证脚本（静态检查）
└── README.md           # 本文件
```

## 使用方法

### 静态验证（现代构建机）

```bash
node validate.js
```

### Win7 实机验证

```bash
npm install
# 正常路径
npm start
# 中文+空格路径测试
# 将本目录复制到 "C:\测试 目录\01-win7-runtime-baseline\" 后运行
npm start
# GPU 降级模式
SPIKE_DISABLE_GPU=1 npm start
```

## Go/No-Go 报告模板

```
SPIKE 01 - Go/No-Go 报告
========================
日期: YYYY-MM-DD
Win7 版本: Windows 7 SP1 x64
Electron 版本: 22.3.27

验证结果:
  [  ] T01 - Electron 启动
  [  ] T02 - 安全配置
  [  ] T03 - 路径兼容性
  [  ] T04 - 单实例锁
  [  ] T05 - 崩溃日志
  [  ] T06 - GPU 降级
  [  ] T07 - 出站 CSP
  [  ] T08 - utilityProcess
  [  ] T09 - contextBridge
  [  ] T10 - renderer CSP
  [  ] T11 - 脚本完整

总计: __/11 通过

判定: [ GO / NO-GO ]

备注:
- 
```

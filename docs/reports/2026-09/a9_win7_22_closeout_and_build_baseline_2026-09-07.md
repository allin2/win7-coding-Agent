# WIN7-22 收口与仓库构建基线核对

2026-09-07 核对。物理验收发生于 2026-09-04；本次没有重新构建冻结候选或执行 Win7 验收。

## 已冻结候选

- 裁决：`A9_14_WIN7_22_GO_FOR_ALPHA`，仅内部 Alpha，不是 RC PASS。
- 源提交：`1c0464441db049d25a28425ebaf9b2db65b0ff59`。
- ZIP SHA-256：`5cc07f35b85e37243f3168701b1a493a6f5e0772a336282db22c785792efc4e8`。
- Manifest SHA-256：`3da5201606cef9c6be477cf0333063fab14ed5dee30528a5bcbaefe1ba24fccd`，787 文件。
- G0/G1/G2/G3/G5/G6/G7 PASS；G4 为同宿主普通用户轻量复核。
- 正式验证 13/13：4 个当前候选直接用例，9 个受治理继承用例。不得写成 13 个全部现场重跑。
- G7 秘密扫描 196 文件、0 命中；相关进程残留 0；独立最终复核 P0/P1/P2 均为 0。
- WIN7-20、WIN7-21 与失败 harness/wrapper 尝试保留原失败裁决。Review 延期 Alpha 2，Win10 同候选 smoke 仍须在 RC 前补齐。

## 外置证据索引

证据保存在维护者候选外归档 `20260903-1c04644`，不随本次源码更新改绑。

| 原始文件 | SHA-256 |
|---|---|
| WIN7-22-final-disposition.json | `08c53d30c0c055e3c7bd866da15408a9aaa563d9150d911c051517a722532966` |
| WIN7-22-formal-report-r3.json | `e307ab63e546f4ef9fd7bb8cd2b6b47563d2e8e2fcc8b63a2f8dc4f9ac2c134b` |
| G7-INDEPENDENT-FINAL-REVIEW.md | `2f2ae96677991f4f0bbb846a4ce0dfbe0063a34d2295361a7264205e402505e1` |

本次重新核验候选 ZIP、正式报告与以上证据哈希。仓库摘要不替代原始证据。

## 构建基线修复

负责人于 2026-09-07 明确授权从 main 独立工作树复现、修复并验证，再与 PR #5 整合。
`fa8d44d` 干净检出时 State dist 缺失，Runner 入口引用未提交模块；即使其他依赖完成构建，旧 Runner
入口仍导致 J5 在环境重验证时以 `A9_ENV_OVERLAY_REJECTED` 失败。Runner 源码未修改。

- 整仓验证改为先完成七模块 lint/build，再执行测试；构建失败跳过所有测试；保留 quick 模式。
- 补交完整 Runner dist，包含此前被 ignore 的 TrustedShell 模块。
- 编排回归在旧脚本失败、新脚本通过，覆盖构建顺序、quick、构建失败及缺依赖。
- 修复后五旅程 8/8 PASS；main 基线整仓 1563 tests PASS。
- 与冻结 ZIP 中全部 16 个 Runner JavaScript 文件比较，去掉源码映射尾注后逐字节一致。

本轮本机测试使用已有依赖：五模块独立离线 ci 成功；State/Shell 复用本机依赖，State 独立 ci
暴露 package-lock 与 better-sqlite3 声明不同步，Shell 离线缓存缺失。不能将本次测试宣称为全新联网安装验证。
本修复不改变已验收运行代码，不要求改判或重打 WIN7-22 包；后续源码提交也不得冒充该冻结候选源提交。

## PR #5 组合验证

合入 PR #5 后：七模块 lint/build 与 1581 tests PASS；发布闭包回归 11/11 PASS；
编排回归 PASS；文档检查 108 文件/27 任务 PASS；diff 空白检查 PASS。
这些是本次开发机证据，不是新的 Win7 实机执行。

## 依赖安装后续收口（2026-09-07）

前文的 State/Shell 安装限制已在后续修复中解决；原记录保留为上一轮验证的实际边界。
两个独立 lockfile 补齐已声明的 SQLite/Electron 及依赖闭包，所有新增版本/校验值均来自既有根 lockfile，
已有锁定版本与 integrity 未改变。README 改为优先使用根 workspace 统一安装。

- 全新独立工作树根目录执行 `npm ci --ignore-scripts --no-audit --no-fund` 成功，随后
  `npm rebuild better-sqlite3 electron` 成功；没有链接或复制旧工作区 node_modules。
- State/Shell 分别在只含 package.json 与修复后 lockfile 的新目录执行离线 `npm ci --ignore-scripts`
  成功，再执行对应原生安装脚本成功。两者均实际打开内存 SQLite 并执行查询；Shell 的 Electron
  可执行文件存在。本步骤未启动 Electron GUI。
- 新安装环境七模块 lint/build 与 1581 tests PASS；docs:check 108 文件/27 任务 PASS。
- 本轮开发宿主为 macOS/Node 20；使用缓存与联网下载，不代表完全空下载缓存、其他操作系统或 Win7
  重新验收。冻结 WIN7-22 未改变，无新增生产依赖或运行时版本。

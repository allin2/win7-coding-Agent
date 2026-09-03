# A9-14 — D-013 CMD verbatim 修复与 WIN7-22 新候选

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: NATIVE_RUNTIME_COMPATIBILITY_AND_RELEASE_RECOVERY
Target Branch: codex/a9-win7-22-cmd-verbatim
Source Baseline: d28c1b9510d6d528f07e8a76a7527b4fc25c35ba
Superseded Candidate: WIN7-21 / FIX_BEFORE_ALPHA / IMMUTABLE
Target Candidate: WIN7-22
Phase-Gate: A9_14_G0_SOURCE_FREEZE_READY
Win7-Validation: WIN7_22_NOT_PERFORMED
Decision: ADR-0111
```

## 1. 授权与目标

项目负责人于 2026-09-03 授权修复 WIN7-21 在 Win7 实机 D-013 CMD 用例中暴露的命令行装配缺陷，
生成全新 WIN7-22，并从 G0 重新执行所有受源码、helper 字节或候选身份影响的门禁。原理上未受影响的
宿主基线和历史功能证据可以按本任务第 4 节的规则轻量复核或逐哈希继承，但不得改判 WIN7-21，也不得把
继承证据写成 WIN7-22 当前候选直接 PASS。

WIN7-21 的不可变失败事实是：协议 v2 已将 CMD 命令固定为 `/d /s /c` 加单个命令 payload，Runner 直启
路径使用 `windowsVerbatimArguments: true`；native helper 却继续通过通用 CRT `argv` 引号算法转义
payload 内部的双引号。`cmd.exe` 不把反斜杠当作双引号转义符，因此含引号的环境变量路径、中文空格路径
及重定向命令在 helper 路径改变语义，进程可返回而目标文件未创建。管理通道使用相同 CMD payload 直启
成功，已将问题隔离到 helper 命令行装配。

## 2. 允许路径与非目标

- `native/helper/argv_builder.cpp`、`native/helper/argv_builder.h`、`native/helper/helper.cpp`、
  `native/helper/logic_tests.cpp`：CMD verbatim 命令行装配和纯逻辑回归。
- `native/helper/build-win10-kit-v25/**`：新的 Win10 双构建套件、真实 CMD smoke 与输入冻结。
- `release/win7-product-v3/**`、`scripts/release/**`：WIN7-22 lock、候选装配、验证器与 G0～G7 证据绑定。
- `docs/**`、`AGENTS.md`：任务授权、ADR、状态、门禁和独立审查记录。

不新增依赖、Runtime Profile、系统 API、权限、IPC 或产品能力；不修改 Runner 的 Shell 解析、环境过滤、
审批、Job、取消、输出上限、进程树回收或 v1 行为；不修改 WIN7-19、WIN7-20、WIN7-21 原始工件、证据
或裁决。不得用 shell 拼接重新解释 PowerShell 参数，也不得用放宽 host/argv/command 绑定来绕过本缺陷。

## 3. 修复合同

| ID | 可观察成功条件 |
|---|---|
| A9-14-01 | 仅对通过 v2 TrustedShell host 校验且 `shellKind=cmd`、`argv` 精确为 `/d /s /c/<command>` 的请求，helper 构造“已引用 executable + 固定三个开关 + 原样 command payload”的 Windows 命令行 |
| A9-14-02 | payload 中的内部双引号、`%VAR%`、中文、空格、重定向符和 `&` 不被 CRT 反斜杠转义或拆成额外协议参数 |
| A9-14-03 | executable 身份、canonical path、SHA-256、协议字段、`argv[3] == command` 和环境策略仍 fail-closed；非法绑定不能到达创建进程 |
| A9-14-04 | PowerShell、其他已批准 shell 和协议 v1 继续使用既有通用 argv 构造且行为不变 |
| A9-14-05 | Win10 双构建 smoke 必须通过 helper 实际创建并读取中文空格路径 marker，保存请求、原始响应、退出码、stdout/stderr 与文件字节 |
| A9-14-06 | Win7 D-013 harness 在断言文件前先落盘 helper 原始响应；CMD 当前候选用例同时证明进程结果和目标文件内容 |

实现必须保持修复点可由非 Windows 纯逻辑测试覆盖；目标 Windows 构建和实机执行仍是不可替代的硬门禁。

## 4. 独立审查与 WIN7-22 门禁

源码冻结前必须由独立审查复核 CMD 引号语义、v2 精确绑定、v1/PowerShell 不回归、恶意或不一致参数拒绝、
测试真实性和候选构建信任链；独审结论与实现者验证分开记录，存在 P0/P1 时不得进入 G0。

WIN7-22 使用新的源码提交、helper、input lock、manifest、ZIP、release authority、部署目录、当前直接证据
和最终裁决；不得复用 WIN7-21 的候选身份或将其改判：

1. G0（重跑）：干净源码提交、独审关闭、新 r12 或后续批准套件、Win10 helper 两个全新目录双构建、
   helper 字节一致、新正式 input lock 与输入冻结；
2. G1（重跑）：两个全新 detached 源码工作树独立构建 WIN7-22，候选逐字节一致；
3. G2（重跑）：绑定新的 manifest、候选 ZIP 和候选外 release authority；
4. G3（重跑）：开发机预飞行验证 WIN7-22 完整闭包、输入锁、原生结构和报告入口；
5. G4（轻量复核）：同一 Win7 普通用户、OS/PowerShell/磁盘/时间、部署根、候选身份及零相关进程重新采集；
   不重复与候选无关且未漂移的扩展宿主调查；
6. G5（重跑）：WIN7-22 包完整性、正式 Electron 启动、Renderer 可用、正常退出和零残留；
7. G6（重跑）：D-013 v25 当前候选的 PowerShell、CMD、explicit shell、环境覆盖四项直接实测，CMD 必须
   创建中文空格路径 marker 并匹配期望字节；helper 原始响应必须先于断言落盘；
8. G7（重跑）：后飞行、秘密扫描、候选不变性、证据完整性、独立最终复核和 WIN7-22 新裁决。

A9-13 schema v4 精确迁移/回滚、WIN7-19 历史未受影响能力可在源码、运行时模块及夹具哈希均未变化时标记
`INHERITED_EVIDENCE_UNAFFECTED_EXACT_HASH`；G4 稳定宿主项可标记 `LIGHTWEIGHT_REVALIDATION`。
这两种状态都不是 `WIN7_22_CURRENT_CANDIDATE_PASS`。任一受 helper、打包、候选身份或现场状态影响的门禁
不得略过。任何 Gate 失败即停止后续签发。

## 5. G0 执行记录

- r14 在 Win10 两个全新目录完成构建且 helper 字节一致，但正式记录器在写入新锁前以
  `A9_V25_CMD_VERBATIM_SMOKE_PROOF_INVALID` 拒绝两份返回。请求证据中的目录名为 CP936 误解码后的
  `涓枃 绌烘牸`，不是合同要求的 `中文 空格`；因此 r14 已撤销，返回包只保留为失败证据，不得改判。
- 根因是 Windows PowerShell 5.1 在无 BOM 脚本上按活动 ANSI 代码页解释中文字面量。提交
  `1eb02c254ffd8a4081c984da21f176671c6ce026` 改为用 Unicode 码位构造目录名，不改变 UTF-8 无 BOM
  源码约束，并增加静态生成器回归。r15 的 ZIP、input lock、package manifest SHA-256 分别为
  `2b4192cc…61a1c`、`494e8939…dd4b`、`2692fff9…03b`；独立审查在撤销 r14 的条件下批准 r15 进入新一轮
  Win10 双构建。此批准不是 Win10 或 Win7 PASS。
- r15 已在 Win10 的两个全新目录独立构建，run ID 为
  `8cb9089e-4e5f-4b2a-afa8-5ad628608bf6`、`7bf6be7c-2bb5-41b6-8fdb-fc01f760a593`；两份返回 ZIP
  SHA-256 为 `7485cf22…d6d0`、`5d37a5f…e237`，helper SHA-256 均为 `c8615e65…fa31`。正式记录器
  复核了原始响应、中文空格 marker 路径及字节、PE/API/CRT 和双构建绑定，生成新锁
  `a9-14-win7-22-input-lock.json`（SHA-256 `2b5d3d4d…8366`）。G0 helper 双构建与输入冻结完成；产品
  双构建、WIN7-22 候选和 Win7 实机门禁尚未执行。

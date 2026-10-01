# A9-30 r3 Win10 首轮构建失败与修复审阅

结论：身份门 PASS，首轮原生构建 FAIL。没有启动第二轮；不得生成产品输入锁、装配开发检查包或签 DEVELOPER_VERIFIED。

## 精确绑定

- 主机：192.168.1.4 / WIN-2JQ66JE4HTQ，标准账户 a9builder、桌面Session 2。
- Probe于2026-10-02 01:00:36 +08确认普通、非提升、ElevationType1、Medium SID/RID8192、无HostJob；控制窗口PID24036存活后才发BuildA请求。
- source：ff153483ef4e6df5daae59c6dcef9784e29d4140；批准登记HEAD：0a96eb396241fa5f03aa67e085a22e756cdfae1a。
- r3 ZIP SHA-256：c0add425ed6510bc8e7f5946ab806f200101f99d42ec0557685b79ff36508698。
- 首轮run-id：8cfdd065-77e4-4634-b508-a729af6344c1。
- DIAGNOSTICS ZIP SHA-256：15d831404dfd029394dcf8c82cc19a1b79a7813fcbe60a3fec3ebe6e8594feb1，185204字节。
- 编译helper SHA-256：592b8ec65a10bee8dae6005eb02e61b7d79604804e8cca3e0abdaea02601ee45。它是失败诊断工件，不能装配或锁定。

## 检查结果

| 项目 | 结果 |
|---|---|
| 普通非提升、Medium、无Job身份 | PASS |
| logic tests | PASS |
| process capture self-test | PASS |
| 编译、manifest、PE AMD64/API/静态CRT | PASS |
| v1兼容smoke / ACL恢复 | FAIL：ACL_ROLLBACK_FAILED |
| 后续v1取消、v2、v3 smoke | NOT_PERFORMED |
| 第二轮、字节一致性、产品重锁、实际Electron、Win7 | NOT_PERFORMED |

错误为 protected 目录“restored DACL or its inheritance control does not match the captured descriptor”。失败后只读检查发现该目录没有AI标志，同级allowed仍有；当时未检出本轮helper进程，但这不能证明全部进程树或ACL恢复，清理保持未充分证明。BuildB请求/work均不存在，控制窗口因BuildA失败已退出。

## 最小修复与四组合证据

`native/helper/helper.cpp`的RestoreDirectoryDacl是唯一产品修改。原SetFileSecurityW在已有AUTO_INHERITED快照上会清掉AI位。新逻辑仅该位存在时使用既有SetNamedSecurityInfoW，并按原PROTECTED位显式选择保护或继承；不含AI仍走原路径。最终CurrentDaclMatches严格比较不变，不以权限语义相近代替原始ACL/控制位。

Win10 control隔离探针四组合均恢复完整SDDL、ACL bytes及控制位：

| AI | Protected | 证据文件 |
|---|---|---|
| 有 | 无 | acl-restore-control-probe-r2.json |
| 有 | 有 | acl-restore-protected-ai-probe-r2.json |
| 无 | 无 | acl-restore-noai-probe.json |
| 无 | 有 | acl-restore-protected-noai-probe.json |

前两组保留原API丢失AI的失败对照。首轮探针PowerShell类型错误和修正后的新目录结果均保留，不覆盖。上述Admin控制探针不等同标准用户执行修改后helper；新C++编译、正式smoke仍NOT_PERFORMED。

独立只读复核人 `/root/a9_30_native_kit_review`；实现人 `/root`；reviewed_at `2026-10-02T01:19:12+08:00`。最终P0=0/P1=0/P2=0。没有引入新系统函数、库或提权路径，原Protection状态保持；API边界沿用已登记Win7函数。本次修复源码未提交。

## 待批准的准确下一步

按A9-30 §4的源码提交与构建机写入合同，申请本地提交以下三个准确路径：

1. native/helper/helper.cpp：上述最小ACL恢复修复。
2. release/win7-product-v3/a9-v26-approved-build-kits.json：撤销失败r3，不改历史报告及hash。
3. docs/reports/2026-10/a9_30_r3_win10_first_build_failure_2026-10-02.md：失败/修复/复核证据登记。

获批后从新source生成r4，再独立复核套件哈希；套件登记提交沿用已批准的“复核通过后本地登记”流程，不推送/合并。

申请在同一Win10新建 D:\A9-A30-V26-20261001\build-r4-a 和 D:\A9-A30-V26-20261001\build-r4-b，仅向现有标准账户 a9builder 授予这两个目录的 Modify 权限，分别用于两个全新离线构建。control继续使用已批准目录，r4控制记录采用新名称，不复用r3失败目录、请求或结果。r3 build-b保持原输入，不能冒充r4双构建之一。新控制入口仍须a9builder真实桌面、无Job；全部正式检查和精确字节比较完成后才安排独立返回复核。

本地文档检查通过（208 文件、47 任务书），差异检查通过。以上未执行项保持原状态。

2026-10-02，负责人回复“批准”，授权以上三个精确路径的本地源码提交，以及新建两个 r4 目录、向现有 a9builder 授予这两目录 Modify 并执行双构建。套件仍须从提交生成并经独立复核后登记；不推送、不合并，保留旧失败目录和证据。

原始诊断、日志、环境及探针在 `.acceptance/a9-30-developer/closeout/build-a-r3-first-failure/`，逐文件索引 evidence-index.json。主工作区、v25和历史候选未改。

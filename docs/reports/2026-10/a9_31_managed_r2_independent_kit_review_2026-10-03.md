# A9-31 managed r2 独立只读复核报告

## 结论

**FAIL_NOT_APPROVED。** ZIP、输入锁、manifest 和源码绑定闭包均通过只读核验；但 managed Windows smoke 尚不能独立证明它监测的 `root_pid` 就是 helper 实际启动的根进程。因此当前不满足套件批准前置。

## 复核身份与冻结输入

独立复核人：`/root/a9_31_managed_r2_independent_review`，`gpt-6-luna/high`。实现方：`/root`。复核范围仅为源码、ZIP 和现有证据。本文由主代理保存复核人回传结果，不代表实现方自签。

- 分支：`codex/a9-31-background-tools`
- source：`d9b5be502c9475e50c54b349a6a12abd27b199f8`
- 父提交：`2ecfc86d22bd7816cb75222db0917b25d32291a1`
- source `%cI`：`2026-10-03T08:09:37+08:00`
- ZIP SHA-256：`5172a895d62e2db63635c427b31e9e0ba24c277c0d032742a4f0a7656a6362c2`
- input-lock SHA-256：`79add53f8d1d59eeb550fb4109ae61407a96118e0e447ba9f90fe9a4e174400b`
- manifest SHA-256：`4f18eecf0d7c8db8ac93e62259e4d938caec49929229b107360a56617ae87882`

交接材料 SHA 与指定值一致。r3 source approval 的 17 项文件尺寸与 SHA 均匹配该 source commit；receipt 记录 17 项已核验。source commit 与父提交、时间戳和 kit 内身份文件一致。

## 发现

### P0：无

### P1：managed smoke 未把 root 进程绑定到实际 helper 启动的进程

在冻结 r2 `build.ps1:307`，捕获器从 `execution_started` 中只解析 `childPid`，随后直接用该值执行 `Process.GetProcessById` 并将进程记为 root；它没有解析或对照 `helperPid` 与实际捕获到的 `process.Id`，也没有验证该 root PID 的父进程是 helper。之后在 352–355 行仅记录 root/child 是否存活及是否最终退出。

返回校验器 `scripts/release/a9-v26-return-evidence.mjs:34` 只要求 `helperPid` 是正数；它将 `ready.childPid` 与 smoke 自己记录的 `root_pid` 对照，而该 `root_pid` 本来就取自同一字段。48–53 行再验证 child marker 与 `row.child_pid`，却没有建立这个 marker 进程与 root 的父子关系。生命周期只要求进程最后退出，没有记录或校验 release 场景的 root/child 退出码。

**可能的假 PASS：** 若 helper 回报的 `childPid` 指向一个短期存活的其他进程，同时实际命令仍产生了 child marker，捕获器会把该其他进程固定为 root；它若在等待窗口内退出，校验器就可能接受“root/child 存活后均退出”，即使真正由 helper 启动的 root 没有满足该生命周期。此处是构建 smoke 的证据绑定缺口；本次未发现产品 helper 实现有相应错误。

源码中，native helper 将 `helperPid` 输出为 `GetCurrentProcessId()`（`native/helper/build-win10-kit-v26-managed/src/protocol.cpp:705`），并从 `pi.dwProcessId` 设置 `childPid`（`native/helper/build-win10-kit-v26-managed/src/helper.cpp:1783`）。生产 transport 也将 helper PID 明确作为诊断信息，并用 ready 与 release 回执的 `childPid` 保持一致（`src/runner/src/native-transport.ts:24`、`:239`）。这属于产品协议身份字段验证，不等价于 smoke 对真实 OS 进程身份和父子关系的独立证明。

建议修复方向：在 smoke 中校验 `helperPid === process.Id`，并从 OS 进程信息验证 root 确为该 helper 启动的进程；同时为 release 场景校验预期的成功退出结果。之后应重新生成新的准确 kit 并复核。

### P2：无新增发现

## 闭包与合同核验

- 以 Python `zipfile` 在内存读取 ZIP；23 个成员无重复，无目录项，成员集合与 manifest 及 manifest 自身精确闭包相符。
- 21 项 input-lock、22 项 manifest 文件尺寸与 SHA 均匹配 ZIP 字节。
- 13 项 native 源码、6 项模板均与 source commit Git blob 相同；source/模板总计 19 项匹配。
- r1 ZIP 仍在原路径，其 SHA 为原值 `bb74c56c839cb6b44b0cd8e81a91dc1c395c78fb863e0f736f6e6a253c8d4cc1`；不改判。
- build-profile 声明的 release、cancel、cancel-release、release-cancel 四组请求、stdout、stderr 和汇总文件均在返回证据清单内；返回校验器要求四种控制次序、release 回执字段、cancel 清理终态、身份字段、输出序列及生命周期字段。`cancel-release` 与 `release-cancel` 的现有校验约束能区分两个顺序。上述机制仍受 P1 进程身份绑定缺口限制。

## 现有证据与历史记录

跨 Jest realm 的 SQLite 失败根因有受控复现：测试保留真实 SQLite trigger 拒写，验证 `SqliteError` 的 realm 差异会令旧 `rejects.toThrow` matcher 报 `Received function did not throw`；同时检查审计计数、ring/SQLite 输出为零、后续派发被阻断，并在 `finally` 恢复构造器。历史首次失败保留，未被重签为 PASS。实现方保存的 `background-audit-root-cause-r2.log` 记录 8/8 通过；r1 首次诊断日志记录 1 失败、7 通过。

控制竞态证据同样保留首次失败：`release-cancel-race-runner-r1.log` 为 2 失败、67 通过；`runner-review-fixes-r2-final.log` 为 166/166 通过。`release-r3-node2017.log` 为 166 通过、2 项 Windows PowerShell 检查未执行。证据矩阵记录 460 项直接 PASS、255 项继承、715 项非重叠 PASS；这些是实现方保存的证据，本复核未重跑。

## 本次检查边界

本次执行了 Git 身份读取、SHA-256 核验、ZIP 内存读取和 Git blob 比对，并只读检查源码、测试日志及历史报告。**本次未运行测试、构建、解包或 Windows 命令，也未修改文件。**

Windows PowerShell 两项、真实 managed helper smoke、原生双构建、返回实证审核、真实 Electron、Win7 生命周期和存活验证均为 `NOT_PERFORMED`；现有证据矩阵也将 managed build、Windows Electron、Win7 标为 `NOT_PERFORMED`。`PACKAGE_READY_NOT_APPROVED` 和 `READY_FOR_WIN10_BUILD` 是套件内部技术状态，不是套件批准或构建 PASS。

旧 r1 报告与首失败作为历史快照保留；它们不改判，也不计为本次新缺陷。

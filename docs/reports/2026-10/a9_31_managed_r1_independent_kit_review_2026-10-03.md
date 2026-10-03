# A9-31 managed r1 独立只读复核

复核人：`/root/a9_31_managed_r1_independent_review`；模型 `gpt-6-luna`，推理 `high`。
实现人：`/root`。用户明确授权独立只读复核；本报告由主代理保存复核人返回的结论与发现，未替代复核裁决。

## 绑定与结论

- source：`2ecfc86d22bd7816cb75222db0917b25d32291a1`，parent `c2b6356f83ef8502a34516010924547c57a3bec2`。
- 分支：`codex/a9-31-background-tools`。
- ZIP：`A9_31_V26_MANAGED_BUILDKIT_r1.zip`，SHA-256 `bb74c56c839cb6b44b0cd8e81a91dc1c395c78fb863e0f736f6e6a253c8d4cc1`。
- input-lock SHA-256：`cd3a96ebb528a7702c43e8eb34b2bd1b78dafb15304433d856e556b33bec306c`。
- PACKAGE_MANIFEST SHA-256：`f269ceeb91172b9bd255a771ed64b0a7e96b32a5d07b2a1c5d5086d5537545bb`。

**裁决：暂不满足套件批准前置。P0=0，P1=1，P2=1。**
kit 闭包及三项哈希通过只读检查；历史审计失败的根因及 release-first/cancel 竞态证据需在批准前闭环。
当前 r1 不登记批准，不启动构建；后续修复不改写本报告及历史失败。

## 独立发现

**P1：历史审计失败尚未独立定位。** `.acceptance/a9-31-developer/tests/shell-r1.log:1312` 与
`shell-r3.log:122` 保存了注入 audit 失败后 rejects.toThrow 报“Received function did not throw”的失败。
随后诊断和 ASCII/中文输入矩阵通过，但源码提交中的本地报告明确根因尚未独立确定。
后续 PASS 不能撤销历史 FAIL。须沿 callback/投影/审计事件顺序定位并保留证据；真实 Windows 审计负例仍需实测。

**P2：release-first/cancel 缺少直接证据。** `native/helper/helper.cpp:111`、`:1845` 有一次处理一个控制帧的
静态依据；managed `build.ps1:415` 的 smoke 只覆盖 release、cancel、cancel-release。
`src/runner/tests/native-transport.test.ts:317` 只直接覆盖 cancel-before-release。
未确认错误成功，但合同要求两种竞态顺序，须补 manager/transport 回归及新 Windows helper 的实测。

## 已核对内容

执行 `git status --short --branch`、`git rev-parse HEAD HEAD^`、`shasum -a 256`、`unzip -Z1`、`unzip -tq`。
CRC PASS，ZIP 23 文件，哈希与 local-kit-verification-r1.json 一致；17 个生成文件为 untracked，未修改或清理。
只读查看 C14 输入、native release 条件/Job flags 回读、关闭句柄后回执、transport/manager 的 release_unknown、
返回校验器 root/child PID+StartTime pin、存活/自然退出证明及 r2 验证矩阵分类。
原生释放前查询且仅清除 KILL_ON_JOB_CLOSE，回读其余 flags 一致；丢回执不宣称 cleanupConfirmed 或 leftToSystem。
现有证据矩阵的 596 直接 PASS 与 109 继承证据为实现方保存的本地证据，本次未重跑。

## 未执行与限制

本次未执行测试、构建、kit 生成或封装，未修改源码、提交、推送、远端或系统配置。
Windows PowerShell、Win32 helper、原生双构建、真实 Windows smoke、PE/API/CRT、Electron 产品入口、
Win7 生命周期及存活验证均 `NOT_PERFORMED`；未复查目标实时状态。这些后续 Gate 不由静态复核代签。

完整独立回复保留于本任务 `/root/a9_31_managed_r1_independent_review` 消息记录；
审批回执及 ZIP 位于 `.acceptance/a9-31-developer/native-kit-r1/`。

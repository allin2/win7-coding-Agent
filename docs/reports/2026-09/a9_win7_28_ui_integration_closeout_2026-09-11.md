# A9-15 WIN7-28 UI 集成验收收口报告

日期：2026-09-11

最终状态：`PASS`

裁决：`A9_15_WIN7_UI_INTEGRATION_PASS`

本裁决只关闭 A9-15 的 WIN7-28 UI 集成验收合同，不重新签发
`A9_14_WIN7_22_GO_FOR_ALPHA`，也不构成新的 Alpha 或 RC PASS。

## 冻结候选身份

| 项目 | 值 |
|---|---|
| Candidate | `WIN7-28` / `0.3.0-alpha.1` |
| Source commit | `d71807fa0d0f011d9c35104e7cd6dab62058ffa5` |
| Package SHA-256 | `f1b6730bfa4cbc9d0d2955c2659d97b7a65c161efdc78cc4a7381bbad0a08351` |
| Manifest SHA-256 | `fe6589b49e820fb9cecf33f57ebba6d89109af4de2df9191232226aca83dbef2` |
| Formal input lock SHA-256 | `7c222010841438a61df0f4f7fc2762a7058e3c5b3bea5102ed612ec51cb5d082` |
| Release authority SHA-256 | `7b6c240b54a9dead83e3fd4c6c7f73493f72eb715010caedf75fd33a5abac1e7` |
| Approval registry | commit `e1b6f4bf30ad2ae7576aa958317e0aea6f4338d3`; SHA-256 `d9cfea73c2f89c01a33a2bbef1d65c27eb995cd3681c71a939183348744917b7` |

## 当前候选直接证据

目标环境为 Windows 7 Professional SP1 build 7601 x64。产品证据来自普通用户
`dccs-chaizl-pc\agent` 的 Medium Mandatory Level（`S-1-16-8192`）非提升桌面令牌。

| 用例 | 结果 |
|---|---|
| `W28-01-IDENTITY-INTEGRITY-STARTUP` | PASS |
| `W28-02-PROGRESS-TIMELINE` | PASS |
| `W28-03-INSPECTOR-PERSISTED-RESTART` | PASS |
| `W28-04-APPROVAL-FAILURE-ORDER` | PASS |
| `W28-05-WAIT-STOP-CLEANUP` | PASS |
| `W28-06-SEARCH-FOCUS-VISUAL` | PASS |
| `W28-07-REAL-PROVIDER-MULTITOOL` | PASS |
| `W28-08-POSTFLIGHT-IMMUTABILITY` | PASS |
| `W28-09-LATEST-OUTCOME-PROJECTION` | PASS |
| `W28-10-OLDER-EVENT-PAGINATION` | PASS |

- 自动确定性产品 smoke 为 75/75 assertions PASS；`first`、`second`、`retry`、`stop` 四阶段均退出 0，
  三组投影附件均由正式报告器解析通过。
- 真实 Provider 以 `REAL_NON_FIXTURE` / `tool_calling` 执行一轮正式 UI 任务，产生并完成配对的
  list/read/edit/Shell/read 活动；目标文件从 SHA-256
  `9754d7df2ae14e039a2c9d9e856de170a329aaac5ffd5373edeefa57d631f78c` 变为
  `a51570a5fa9ae17f04daeac949e2ec3c56429387f6c91d42aa05d674ba3f12b4`，验证命令退出 0。
- 1120×728 的 running/completed 候选窗口截图显示已绑定工作区、Full Access、`tool_calling`、真实
  running/idle 状态与完成结果；人工检查未见凭据值。
- 42 个生成的文本/JSON 证据文件凭据值扫描为零命中；二进制与 SQLite 快照不参与文本扫描，选定截图另行
  人工检查。
- 前置与后置包完整性均 PASS；后置候选相关进程数为 0，候选树、ZIP、manifest、lock、authority 与
  Electron ABI 110 保持同一冻结绑定。

## 正式签发与证据边界

打包内 WIN7-28 verifier 校验全部必需断言、证据哈希和三组投影附件：

- 正式报告：`WIN7_28_ACCEPTANCE_REPORT.json`，SHA-256
  `cc9b422d228b04e5d798c5b385a1b7e5a1414a28aa4587e2b1299c08085eb267`；
- verifier 结果：`PASS / A9_15_WIN7_UI_INTEGRATION_PASS`；
- 已验证用例 10，当前候选直接用例 10；
- 本机返回证据 verifier 与目标机证据根 verifier 均为 PASS。

管理 SSH 只用于传输、回收、哈希和运行最终证据处理器，不替代上述普通用户产品证据。原始报告、截图、
SQLite、候选二进制和凭据材料均保存在候选外验收归档，不纳入 Git。本次收口没有修改候选字节、历史候选、
Provider vault、DPAPI 凭据、远端配置或既有 Git 历史。

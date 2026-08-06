# A4 FUP 自动验收编排

本目录的编排器只覆盖 SPIKE_02 允许范围内的非交互 helper 验收，不接入生产 Runner、交互终端或 SQLite。

## 入口

```text
run_fup_automation.mjs       AUTO-00～AUTO-07 编排入口
fup_safe_profile.json        锁定目标、SSH 保护项、工件 SHA-256 与 Gate
AUTO-FUP-20260805-01-plan.json 机器可读计划
test_fup_automation.mjs      负向保护与 dry-run 回归
remaining_acceptance_audit.mjs       剩余 SPIKE_02 用例只读审计入口
test_remaining_acceptance_audit.mjs  剩余项审计保护测试
run_remaining_win7.mjs               C02/C03/C05 Win7 补充编排入口
run_remaining_win7.py                 Win7 补充 harness（C05 仅 loopback）
run_remaining_wmi.cmd                 固定 WMI 脱离启动脚本
```

默认必须显式选择模式：

```bash
node run_fup_automation.mjs --dry-run
node run_fup_automation.mjs --execute-win7 --acceptance-id A4-YYYYMMDD-unique
node test_fup_automation.mjs
node run_remaining_win7.mjs --execute-win7 --acceptance-id A4-YYYYMMDD-unique
```

`--dry-run` 不调用 SSH/SCP、不建远端目录、不上传、不加载 helper。真实执行只有在本机治理、依赖/回归、精确工件哈希与 PE 检查通过后才会进入严格 SSH/Bitvise 预检；任何失败都会停止危险阶段但生成 JSON/HTML 与各阶段 stdout/stderr。

私钥只作为 `-i` 参数路径传给 SSH/SCP，代码不读取、不输出、不复制私钥内容。每轮要求新的 `A4-YYYYMMDD-unique`，远端 acceptance/data root 均独立；禁止网络配置、服务修改、启动项变更、重启和用 `taskkill` 冒充 containment。

## 证据

每轮输出位于 `evidence/<acceptance-id>/`（或 `--out` 指定 JSON 的同目录）：每个 AUTO 阶段都有 `*-stdout.txt`、`*-stderr.txt`，汇总有 JSON 与 HTML。开发机检查只能标记 `DEVELOPMENT_PASS`，不能写成 Win7 PASS；历史 A4-14/A4-20/A4-21 原始证据不由编排器改写。

GATE-ACL、GATE-NET、GATE-PROD、GATE-A5-A6 始终单独记录为 `MANUAL_GATE`、`ENVIRONMENT_MISSING`、`AUTHORIZATION_BLOCKED` 或 `BUILD_HOST_MISSING`，不计入无人值守 PASS。

## 最新执行

`A4-20260805-123467` 已完成 AUTO-00～AUTO-07，结果为 `AUTOMATION_PASS`：Win7 14/14 用例通过，`taskkill_used=false`，超时/取消与最终相关进程残留均为 0，取证后的 Bitvise 为 `RUNNING`。开发机 AUTO-01 仍只分类为 `DEVELOPMENT_PASS_NOT_WIN7_EVIDENCE`。

- [结构化汇总](evidence/A4-20260805-123467/A4-20260805-123467-automation.json)
- [可读 HTML](evidence/A4-20260805-123467/A4-20260805-123467-automation.html)
- [Win7 14 项原始 harness](evidence/A4-20260805-123467/remote-A4-20260805-123467-harness.json)

## 最新补充执行

`A4-20260806-140606` 已通过补充编排阶段 REM-00～REM-06：严格 SSH/Bitvise、全新根、上传哈希、loader、WMI 脱离启动和取证均 PASS。对应只读审计 ID 为 `A4-20260806-140606-REMAINING`，不复用早期 dry-run ID。
Win7 用例分类为：C02 `PASS`；C03 `FAIL`（工作区外写入仍成功，受保护注册表读取被拒绝）；C05 loopback TCP/UDP/localhost DNS `PASS`，但正式 C05 仍为 `ENVIRONMENT_MISSING`，因为没有批准的企业/外部端点和网络审计。

- [补充自动化汇总](evidence/A4-20260806-140606-remaining-automation.json)
- [补充 Win7 harness](evidence/A4-20260806-140606/remote-remaining-results.json)
- [更新后的剩余项审计](evidence/A4-20260806-140606/remaining-acceptance-audit.html)

A4-20 临时工作树归档后，包通过受引用保护的 Git 快照 `3445ed4164fa58a2deded29ec5403eed8646715a` 只读恢复到每轮 evidence 临时目录；编排器校验快照 parent、计划、manifest 和包内逐文件 SHA-256，不执行 checkout 或分支切换。

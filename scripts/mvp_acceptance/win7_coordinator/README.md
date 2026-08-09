# Win7 Acceptance Coordinator

该目录实现 ADR-0065/ADR-0066 的 Node.js 标准库协调器。A6 Worker 永远只输出
`DEVELOPMENT` 或 `CANDIDATE_EVIDENCE`；只有 `validate` 可以写正式状态
`docs/status/a6-storage-latest.json`。

## 安全边界

- 私钥由 `WIN7_ACCEPTANCE_SIGNING_KEY_FILE` 指定，父目录必须为 `0700`、文件必须为 `0600`；
  私钥不得进入仓库、Win7、包、argv、日志或证据。
- SSH 固定启用 `BatchMode`、`IdentitiesOnly`、`StrictHostKeyChecking=yes` 和独立
  `known_hosts`，没有关闭 host-key 校验的选项。
- 目标、run ID 与文件路径先校验；Win7 只执行协调器内置的固定命令和包内固定 Runner。
- `preflight` 失败不部署；执行或轮后失败把租约置为 `RECOVERY_REQUIRED`。

## 命令顺序

```text
package-create -> lease-create -> preflight -> execute -> collect -> postflight -> validate -> release
```

正式 A6 参数由签名租约固定：S01 60 秒，S03 3k/10k/30k，S05 30k/100 次，
S06 512MB/256MB，以及 S02/S04/S07/S08/F/P。包在 Win7 上不执行 `npm install`，
不编译原生模块，也不修改网络、Bitvise、服务、PATH 或系统配置。

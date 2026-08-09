# Win7 Acceptance Coordinator

该目录是 ADR-0065/ADR-0066 的 Node.js 标准库控制面。A4/D-013 与 A6/SPIKE_04 Worker
均只能输出 `CANDIDATE_EVIDENCE`；正式 `WIN7_PASS` 只由对应协调器在签名租约、工件哈希、
轮前/轮后和完整证据均通过后写入。

## A4 / D-013

`coordinator.mjs`、`lease.mjs`、`lease_public.pem` 与 `lease_public.json` 服务 A4：私钥和 ledger
在 Git 外 `.acceptance/win7-coordinator/`，私钥权限必须为 `0600`。流程为
`init-key → prepare-a4 → grant → run-a4 → grade-a4 → transition --to RELEASED`；只有显式的
`run-a4` 会连接 Win7。

## A6 / SPIKE_04

`cli.js` 与 `lib/`、`runner/` 服务 A6：私钥由 `WIN7_ACCEPTANCE_SIGNING_KEY_FILE` 指定，父目录
必须为 `0700`、文件必须为 `0600`，不得进入仓库、Win7、包、argv、日志或证据。SSH 固定启用
`BatchMode`、`IdentitiesOnly`、`StrictHostKeyChecking=yes` 和独立 `known_hosts`。固定流程为：

```text
package-create → lease-create → preflight → execute → collect → postflight → validate → release
```

正式参数固定为 S01 60 秒、S03 3k/10k/30k、S05 30k/100 次、S06 512MB/256MB，以及
S02/S04/S07/S08/F/P。包在 Win7 上不执行 `npm install`、不编译原生模块，也不修改网络、Bitvise、
服务、PATH 或系统配置。`validate` 是唯一能够写 `docs/status/a6-storage-latest.json` 的命令。

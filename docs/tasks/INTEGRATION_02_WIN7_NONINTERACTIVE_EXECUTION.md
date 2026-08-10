# INTEGRATION_02 — Win7 非交互执行与只读日志

## 0. 实现授权（ADR-0011 / C14）

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: INTEGRATION_HARDENING
Target Branch: codex/win7-noninteractive-runner
Authorization: Project owner implementation request, 2026-08-10
Phase-Gate: IMPLEMENTING
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: A4 D-013 v21 is WIN7_PASS; A5 signed-lease T05 and product L01-L10 remain open
```

### 0.1 允许路径

- `scripts/mvp_acceptance/win7_coordinator/**`
- `spikes/02-terminal-containment/**`、`spikes/04-storage-index/harness/evidence/**`
- `native/helper/**`、`src/runner/**`、`src/core/**`、`src/shell/**`
- `tests/runner/**`、`tests/core/**`、`tests/shell/**`
- `docs/status/**`、本文档与直接相关状态文档
- `docs/DECISIONS.md`（只追加 ADR 或修改被取代 ADR 的状态行）
- `docs/WIN7_CONSTRAINTS.md`（只同步 D-013/D-011 登记状态）

禁止修改 Phase 1/2 冻结实现；禁止提交私钥、Win7 凭据或未登记二进制；禁止任意 Shell、
Renderer 进程权限和模型可调用的通用 `terminal.exec`。

## 1. 原子需求与门禁

| ID | 要求 | 验收 |
|----|------|------|
| NIR-01 | 协调器以 Ed25519 签名租约约束唯一活动 Win7 验收 | 篡改、过期、绑定不符、并发租约全部拒绝 |
| NIR-02 | A4/A5 Worker 只产出候选证据，不接受布尔 lease 开关 | 缺少有效租约时在 SSH 前失败 |
| NIR-03 | D-013 正式通过前生产 Runner fail-closed | 默认装配仍为 `UnavailableRunner` |
| NIR-04 | 生产执行仅允许可信 profile、结构化 argv、关闭 stdin | Shell、未知程序、哈希不符全部拒绝 |
| NIR-05 | 总超时、空闲超时、双流上限、取消和 Job 清理产生结构化结果 | 正负向 Runner 测试与 Win7 L01～L10 |
| NIR-06 | UI 只显示有界 Runner 日志，无终端输入能力 | IPC、preload、Renderer 静态门禁和 UI 测试 |
| NIR-07 | A6 旧 SSD 证据不得冒充正式机械盘结论 | 原文件不变，追加 `SSD_SURROGATE` disposition |

## 2. 实施顺序与失败策略

1. 按 A4 → A6 → A5 合并并实现协调器；在人工 H1 确认后签发单次 D-013 租约。
2. D-013 C01/C03/C04/C06/C07 或清理门禁失败时停止：进入 `RECOVERY_REQUIRED` 或
   `PREFLIGHT_BLOCKED`，不迁移生产 helper、不启用 NativeRunner。
3. D-013 通过后复验 A5 T05，并记录 `NO_GO_INTERACTIVE_WINPTY`；随后才迁移原生 helper、实现
   `NativeRunner` 与只读日志。
4. C05 只记录网络实际可达性，不宣称本地网络隔离；需要强隔离的命令拒绝或路由远程。

## 3. Runtime Profile 与交付

- 协调器：开发/验收机 Node.js 标准库；私钥位于 Git 外，Worker 仅持公钥。
- helper：D-013、MSVC v142、Windows SDK 10.0.19041、x64、静态 CRT，目标 Win7 SP1 build 7601。
- 产品宿主：Electron 22.3.27 内嵌 Node 16.17.1；自包含内网/离线包，不在目标机在线解析依赖。
- 降级：签名、哈希、containment 或清理任一不确定即 `UnavailableRunner`/`cleanup_failed`。

## 4. 人工门禁

- H1：签发租约前确认 `192.168.1.11` 空闲，允许新验收目录和仅限该目录的临时 ACL。
- H2：发现进程、文件或 ACL 残留时暂停并报告，不自动强杀或删除。
- H3：自动验证完成后由负责人确认 Win7 只读日志的可见性、滚动、截断和取消反馈。

# INTEGRATION_02 — Win7 非交互执行与只读日志

## 0. 实现授权（ADR-0011 / C14）

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: INTEGRATION_HARDENING
Target Branch: codex/win7-noninteractive-runner
Authorization: Project owner implementation request, 2026-08-10
Phase-Gate: IMPLEMENTING
Win7-Compatibility: PROVISIONAL
Win7-Validation: A4_D013_AND_A5_T05_WIN7_PASS
Blocking-Reason: Product NativeRunner L01-L10 and H3 read-only log review remain open
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

### 2.1 A5 门禁解除记录（2026-08-10）

- `A5-20260810-153300` 在目标 `192.168.1.11` 上以独立 Ed25519 签名租约执行 T05；租约绑定
  `be57695df7f4831b2cf46851b5d5b38ad4a9fd1c`、候选 manifest 和 D-013 v21 helper 哈希。
- T05 的 Job Object 进程树回收、Restricted Token、Low Integrity、临时 ACL 回滚和零 `ping.exe`
  残留全部通过；轮前/轮后残留均为空，Bitvise 始终为 `RUNNING`。
- 协调器评级为 `WIN7_PASS`，租约完整经历 `GRANTED → RUNNING → RETURNED → RELEASED`。
  A5 核心门禁因此解除，允许迁移生产 helper 并实现低风险非交互 Runner；正式 C05 仍不构成网络隔离。

## 3. Runtime Profile 与交付

- 协调器：开发/验收机 Node.js 标准库；私钥位于 Git 外，Worker 仅持公钥。
- helper：D-013、MSVC v142、Windows SDK 10.0.19041、x64、静态 CRT，目标 Win7 SP1 build 7601。
- 产品宿主：Electron 22.3.27 内嵌 Node 16.17.1；自包含内网/离线包，不在目标机在线解析依赖。
- 降级：签名、哈希、containment 或清理任一不确定即 `UnavailableRunner`/`cleanup_failed`。

### 3.1 生产 helper 构建候选

- source commit：`2adc9b2f4c64ef34ac57fed968fca93bac9b3b97`
- 离线 Win10 构建包：`native/helper/build-win10-kit/result/WIN7_D013_PRODUCTION_HELPER_BUILDKIT_20260811_BOUND.zip`
- ZIP SHA-256：`cca2db6d2fdf1e9f355f1a38d5e4d60fcda4130bee307809005db3347a331564`
- `PACKAGE_MANIFEST.json`：`674dd540137142722ea7d686559818cb12cf7305992cfe4f3572aabc5c4b2135`
- `input-lock.json`：`9c534060d2d00807722dfd6d670dabd031f32d4f9b020223220d0c2c07fa6e08`

该 ZIP 是 Git 忽略的本地交接物，不是 Win7 运行包。必须在 D-017 锁定的 Win10/VS2019/v142
构建机执行 `build.ps1`，返回新的 ARTIFACTS ZIP 与 sidecar；旧 v21 helper 二进制不能替代本修订。

### 3.2 Win10 返回包复核（2026-08-11）

- 返回包：`WIN7_D013_HELPER_ARTIFACTS_20260810-161615.zip`
- 外层 SHA-256：`22f946b18eb6d12134dabe1ac2af04d9c97e1749e2843242336bbc20fd1315f9`
- 生产 helper SHA-256：`b48e535d7a4e955cdec0557904e745bdc36d799dc1eeaeb688d3fc24f6aa0c5e`
- 构建宿主：Windows 10 build 19045、VS2019 `16.11.37507.1`、MSVC `14.29.30133`、
  Windows SDK `10.0.19041.0`、x64、静态 CRT。
- 返回清单逐文件哈希、输入锁、源码提交 `2adc9b2f4c64ef34ac57fed968fca93bac9b3b97`、
  PowerShell 原始字节捕获、logic tests、PE/API/CRT 检查及 Win10 containment smoke 均独立复核通过。
  smoke 证明 Restricted Primary Token、Low Integrity、Job Object、stdin 关闭及两项临时 ACL 精确回滚。
- 构建脚本裁决：`BUILD PASS / candidate_eligible=true`。但产品复核发现该 v22 helper 对
  `IsProcessInJob(self)=true` 无条件返回 `HOST_ALREADY_IN_JOB`；A5-20260810-152500 已证明
  Electron Win7 产品派生路径确实处于宿主 Job。因此该返回包追加定性为
  `REJECTED_AS_PRODUCT_CANDIDATE`，不得上传执行 L01～L10，也不得启用生产 Runner。

### 3.3 v23 宿主 Job breakaway 收口

- 不关闭 Electron Renderer sandbox，不用 WMI/CPython 绕开生产路径，也不把 Win7 Job 嵌套
  伪装成可用。
- helper 查询当前 Job 的 `JobObjectExtendedLimitInformation`。只有宿主明确提供
  `BREAKAWAY_OK` 或 `SILENT_BREAKAWAY_OK` 时才尝试创建 suspended restricted child；显式模式
  加 `CREATE_BREAKAWAY_FROM_JOB`，silent 模式依赖宿主 Job 的自动 breakaway。
- child 在 `ResumeThread` 前必须先证明不属于任何 Job，再证明已加入 helper 自建的
  `KILL_ON_JOB_CLOSE` Job；两步任一不确定均 fail-closed。响应增加 `hostJob` 审计，
  `NativeRunner` 将它纳入 containment 判定。
- 该源码增量必须重新经过 D-017 Win10 构建与返回包复核。之后 L01 必须从真实 Electron 产品
  路径验证 breakaway；若目标 Job 不允许 breakaway，则停止本地 Runner，另行裁决外部 Broker
  或远程执行，不能回退为无 Job 执行。

## 4. 人工门禁

- H1：签发租约前确认 `192.168.1.11` 空闲，允许新验收目录和仅限该目录的临时 ACL。
- H2：发现进程、文件或 ACL 残留时暂停并报告，不自动强杀或删除。
- H3：自动验证完成后由负责人确认 Win7 只读日志的可见性、滚动、截断和取消反馈。

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

### 3.1 生产 helper v23 构建候选

- source commit：`e41bc9dbf7ebcad3570ef3d6cb4491e6cb1f630a`
- 离线 Win10 构建包：`native/helper/build-win10-kit/result/WIN7_D013_PRODUCTION_HELPER_BUILDKIT_20260811_V23_BOUND.zip`
- ZIP SHA-256：`c16e8743e93c9dee64e32722ed15ee072413157cfa3594bfdf9d2b0db375dc48`
- `PACKAGE_MANIFEST.json`：`2332f5cf045949d2b2267269ffb2dfe33f66f7832770de8a09178c098ff76968`
- `input-lock.json`：`f6f3ea7440f7f038ccbe7889692bcf685d2f70cd6915be2130d6369be9a28d11`

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

### 3.4 v23 Win10 返回包复核（2026-08-11）

- 返回包：`WIN7_D013_HELPER_ARTIFACTS_20260810-164456.zip`
- 外层 SHA-256：`9b1dbd3d404d74d56e20a7b051681a9985b31b95f2ff9d0f1e0553badabb9390`
- helper SHA-256：`d275605124527f292307fd45e2ab4b9af850d22af53ca6f7e8ee795fab629a5c`
- 版本：`win7-agent-helper 1.1.0-d013-v23 win7-x64`
- 返回清单 22 个文件全部匹配；源码提交、输入锁、构建 Profile、PowerShell 原始字节捕获、
  logic tests、PE/API/CRT 和 Win10 smoke 均复核通过。smoke 证明无宿主 Job 时 child 先处于
  Job 外，再成功加入 helper 自建 Job；Restricted Primary Token、Low Integrity、stdin 关闭及
  两项临时 ACL 精确回滚均成立。
- 裁决：`BUILD PASS / candidate_eligible=true / REVIEW PASS`。该结果只授权准备 Win7 产品
  L01～L10；Electron 宿主 Job 的 breakaway 仍必须由正式签名租约下的 L01 实机证明。

### 3.5 Win7 NativeRunner L01～L10 正式矩阵

验收 ID 固定为 `D013-RUNNER-20260811-010000`，目录固定为
`C:\Win7CodingAgent\acceptance\D013-RUNNER-20260811-010000`。包清单、产品 Release Manifest、
v23 helper、Electron 和系统 Profile 均以 SHA-256 绑定至 ADR-0065 Ed25519 签名租约；Worker
只生成 `CANDIDATE_EVIDENCE`，协调器完成无残留 postflight 后才可评级 `WIN7_PASS`。

| 用例 | 正式判定 |
|------|----------|
| L01 | 真实 Electron 产品路径检测宿主 Job，使用获准 breakaway，并在启动前证明 child 已重新加入 helper 的 `KILL_ON_JOB_CLOSE` Job |
| L02 | 签名租约、源码提交、包清单、Release Manifest、helper 与 Electron 哈希全部匹配 |
| L03 | 未登记 Profile、Shell Host 与高风险本地 Profile 在启动 helper 前拒绝 |
| L04 | CP936、CRLF、中文及空格工作目录均产生结构化结果 |
| L05 | stdout/stderr 独立上限与截断提示生效 |
| L06 | 总超时后整个进程树回收且无 `ping.exe` 残留 |
| L07 | 空闲超时独立生效且无 `ping.exe` 残留 |
| L08 | 取消关闭单请求 helper，并由 Job 回收 child，无 helper/ping 残留 |
| L09 | 每轮仅在 `work\*` 应用、验证并回滚 Low Integrity/临时 ACL |
| L10 | 轮后 helper、ping 与验收 ID 残留均为空，Bitvise 仍为 `RUNNING`，L01～L09 全部通过 |

### 3.6 首轮正式 Runner 证据与 v24 收口

- `D013-RUNNER-20260811-010000` 在旧目标 IP `192.168.1.11` 的签名租约下执行。L01 已证明
  Electron 宿主 Job `detected=true`、`breakaway=silent`、child 重新加入 helper Job；L02/L03、
  L05、L07～L09 的主要合同亦通过。L01/L04 仅因 harness 把非零工具退出码误判为 Runner 未执行，
  L06 因 `idleTimeoutMs > timeoutMs` 被本地合同拒绝，均需在下轮修正后复验。
- L08 暴露真实产品缺陷：`StdioHelperTransport` 取消时直接终止 helper，Job 成功回收 child，但
  helper 未能执行 `work\l08` 的 Low Integrity 回滚。协调器据此进入 `RECOVERY_REQUIRED`，v23
  定性为 `REJECTED_AS_PRODUCT_CANDIDATE`，不得复用。
- 项目负责人授权只删除并重建空 `work\l08`。目标 IP 随后变更为 `10.49.123.40`；新地址的
  ECDSA/RSA 主机公钥与旧 known-hosts 逐字节一致，干净恢复快照证明进程/ACL 零残留、Bitvise
  正常且工件哈希未变。协调器按 ADR-0069 签发迁移恢复证明
  `2d136ccdc1df21a0414cf78278ca80984d97dcaf406e117c77eb2ec3092200d1`，旧租约最终 `RELEASED`。
- v24 改为单执行请求 + request ID 绑定的协作取消。产品先写执行请求，取消时写第二条
  `cancel` 控制消息；helper 终止 Job、等待 child、精确回滚 ACL 后才返回 `canceled=true`。
  5 秒内没有结构化确认才允许强制终止，并必须返回 `cleanup_failed`。该增量须重新执行 D-017
  Win10 构建/返回包复核，并在新 IP、新提交和新租约下重跑 L01～L10。

## 4. 人工门禁

- H1：签发租约前确认当前目标 `10.49.123.40` 空闲，允许新验收目录和仅限该目录的临时 ACL。
- H2：发现进程、文件或 ACL 残留时暂停并报告，不自动强杀或删除。
- H3：自动验证完成后由负责人确认 Win7 只读日志的可见性、滚动、截断和取消反馈。

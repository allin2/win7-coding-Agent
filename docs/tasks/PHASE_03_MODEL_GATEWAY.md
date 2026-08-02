# PHASE_03 — Model Gateway 任务书（MODEL_GATEWAY）

> 实现前必读：`AGENTS.md`、`docs/WIN7_CONSTRAINTS.md`、`docs/DECISIONS.md`（ADR-0012/0027/0028/0036）、本文档。
> 编号遵守 ADR-0012（阶段 3 = Model Gateway）。本文档为规划任务书，已获 PC-003 裁决批准（ADR-0036，2026-07-29）。

## 0. 实现授权（ADR-0011 / C14）

```
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: FORMAL_PHASE
Target Branch: phase/03-model-gateway
Phase-Gate: APPROVED_FOR_IMPLEMENTATION
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: PC-003 ruled 2026-07-29 (ADR-0036); pending SPIKE_01 Go and E7 environment
```

> **PC-003 裁决引用**：PC-003 已于 2026-07-29 由项目负责人裁决通过（ADR-0036），本任务书随裁决置 `APPROVED_FOR_IMPLEMENTATION`。

**实施策略备注**：
- 非终端/containment 模块（协议客户端、流式事件、鉴权、TLS/代理、重试/幂等、断线恢复等）可基于理论分析先行实现。
- 终端层（winpty/node-pty）和进程 containment 模块须等 SPIKE_02 实机验证结论后定稿。

前置：PC-003 裁决（ADR-0036，已通过）+ SPIKE_01 Go（运行时闭包可用）+ E7 环境（企业代理/CA）就绪。

### 0.1 路径白名单（获批后生效）

- `src/gateway/**`（Node/TypeScript 实现）、`tests/gateway/**`、本文档 §13 验证记录。

禁止路径：其他阶段目录、`src/phase1-2/win7_agent/**`（Python legacy 冻结，ADR-0029）、已 Accepted ADR 正文。

## 1. 目标

实现 Win7 端到内网 Gateway 的版本化流式协议客户端：模型/工具请求、流式事件、鉴权、
TLS/代理/CA、超时、重试、幂等、断线恢复。复用 PRD 协议 v1 字段设计；Provider 契约
继承 Phase 2 `models/contracts.py` 的 vendor-neutral 语义（ADR-0029 对账，不复制代码）。

## 2. 非目标

- 不实现模型推理本身（远程，ADR-0034）；不实现 Browser Use/OAuth（远程化）。
- 不实现 Agent 状态机/Runner（PHASE_06）。

## 3. Runtime Profile（C15）

- 运行时：Electron 22.3.27，Agent Core 为独立 `utilityProcess`（内嵌 Node 16.17.1，ADR-0028）；不再限定标准库 http/ssl。
- **网络栈先定型**：实现前必须先确定 Gateway 客户端走哪条网络栈——Electron `net`（Chromium 网络栈）、
  Node `https`（OpenSSL）还是 WinHTTP——三者的 TLS/代理/CA 行为与配置入口不同，须**分别**在 Win7 实测。
- TLS：TLS 1.2 起；企业 CA 经 D-006（随包 CA bundle 或部署到受信任存储）；
  验证失败必须拒绝连接，禁止关闭 TLS 验证。**`KB3140245 + DefaultSecureProtocols` 主要作用于 WinHTTP**
  （见 WIN7_CONSTRAINTS §4），**不能证明 Electron `net` / Node `https`（OpenSSL）栈的 TLS 1.2 可用**；
  因此该注册表基线仅对"确定使用 WinHTTP"的路径有意义，其余栈以随包 OpenSSL/Chromium 能力 + 真实握手为准。
  无论哪条栈，验收都以 Win7 实机对 Gateway/企业 CA 的**真实 TLS 1.2 握手**为准。
- 代理：支持企业 HTTP(S) 代理（含 PAC/显式），凭据不落盘明文。

## 4. 协议与契约

- 版本化流式协议（协议版本字段必填；不兼容变更须升版本并记 ADR）。
- 请求/响应字段沿用 PRD 协议 v1；`ModelResponse` 保持 vendor-neutral（content、
  tool_calls、finish_reason、允许的 metadata），与 Phase 2 Replay 契约（ADR-0026）一致。
- 幂等：请求携带幂等键；重试不产生重复副作用。

## 5. 错误模型

| 错误码 | 触发 | 处理 |
|--------|------|------|
| `GATEWAY_UNREACHABLE` | 连接失败/超时 | 有界重试（指数退避 + 抖动），耗尽后结构化失败 |
| `TLS_VERIFY_FAILED` | 证书链/主机名校验失败 | fail-closed 拒绝，不降级明文 |
| `PROXY_AUTH_FAILED` | 代理鉴权失败 | 明确报错，不静默重试泄露凭据 |
| `STREAM_INTERRUPTED` | 流中断 | 断线恢复（续传或安全重放幂等请求） |
| `PROTOCOL_VERSION_MISMATCH` | 协议版本不兼容 | 拒绝并提示升级，不猜测解析 |

## 6. 测试矩阵

- 单元：协议编解码、重试/退避、幂等键、断线恢复状态机。
- 集成（E7）：真实企业代理 + 自签/企业 CA 的 TLS 1.2 握手；证书错误必拒；代理鉴权。
- 负向：中间人证书、过期证书、协议降级尝试、流截断。
- 静态门禁 G1~G10。

## 7. 验收（E5/E6/E7）

- E5：干净 Win7 上从零配置到成功握手。
- E6：中文+空格安装路径 + 缺失工具场景不影响连接。
- E7：企业代理/CA 环境真实握手与恢复；性能类指标引用 PERFORMANCE_BUDGET（如适用）。
- Win7 实机验收前 Phase-Gate 至多 `READY_FOR_WIN7_VALIDATION`。

## 13. 验证记录（占位）

```
Win7-Compatibility: PROVISIONAL
Win7-Validation: NOT_PERFORMED
Blocking-Reason: Target environment unavailable
```

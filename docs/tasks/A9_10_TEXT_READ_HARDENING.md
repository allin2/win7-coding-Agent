# A9-10 — 中文编码与大文件有界读取修复

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_HARDENING
Target Branch: codex/a9-trusted-agent-runtime
Source Baseline: eebb724b6f3198ece2a3be229925a17570231d0f
Phase-Gate: A9_10_DEVELOPER_VERIFIED_PENDING_WIN7
Win7-Validation: WIN7_20_NOT_PERFORMED
Decision: ADR-0107
```

## 1. 授权与目标

项目负责人在获知 A9-09 不包含 Workspace/Core 后，明确要求“直接进行修复”。据此单独授权本任务；
允许在上述分支基线对应的当前 detached 工作区实施，保留其他未提交改动，不切换分支、不提交或推送。
修复已复现的显式 GBK/UTF-16LE 被自动检测挡住、binary 请求返回文本、超过 8 MiB 时行范围无效问题。

## 2. 允许路径与非目标

- `src/workspace/src/a9-workspace-service.ts`：仅 A9 read 实现、结果类型、读取限额和私有读取辅助逻辑。
- `src/workspace/tests/**`：读取、编码、分块、取消、哈希/基线和漂移回归。
- `src/core/src/a9-tools.ts`、`src/core/src/a9-agent-loop.ts`：仅 read 参数描述、验证与取消传递。
- `src/core/tests/**`：read Schema 与真实 Agent Loop/Workspace 调用回归。
- `src/shell/tests/product/**`：现有真实产品读取入口回归；不修改 Renderer/UI。
- `docs/**`、`AGENTS.md`：本授权、ADR、追踪及验证状态。

不改共享历史编码器、A8 读取、写/edit/checkpoint 安全规则、权限审批、Provider/TLS、helper 协议或依赖。
不修改 v24/旧 v25 正式锁、WIN7-19 ZIP/manifest/candidate identity，不生成新正式包。

## 3. 读取合同

- 显式 `utf-8 / gbk / utf-16le` 优先，严格解码；`binary` 只返回元数据和完整 SHA-256，不回显内容。
  未给编码时保持 BOM → 严格 UTF-8 → 有效 GBK 的优先级，不能解码时返回 binary/ambiguous 元数据。
  无 BOM UTF-16LE 可能与 ASCII/GBK 字节重合，用户须显式指定，不能保证自动判断意图。
- 所有大小均以固定 64 KiB 块异步读取，最多返回 2000 行、128 KiB UTF-8 预览；超长单行也不得无限积累。
  截断保留完整字符并明确标记；完整行数与 SHA-256 仍通过扫描全文件获得，不把片段当全文件基线。
- 不新增模型可控取消参数；复用 Agent Loop 的 AbortSignal，在每次分块前检查，取消后关闭文件句柄。
- 同一打开句柄读取；读取前后核对文件身份、大小、mtime/ctime 及路径身份；变化/取消/失败不建立新基线。
  明确编码错误不返回乱码替代字符；不能解码或统计不完整时不得冒充正常完整文本。
- 默认编码不再向模型宣称固定 UTF-8。既有字段不改义；可选 `truncationReasons` 描述行/字节上限。

## 4. 验证与交付边界

UTF-8/GBK/UTF-16LE 中文、BOM/无 BOM、CRLF 跨块、多字节字符跨块、binary、8 MiB 以上范围读取、
长行、非首行、EOF、显式编码错误、取消、读取漂移及完整哈希必须有回归。Workspace 全包和 Core 受影响
测试、相关 TypeScript 检查、docs/diff 通过；现有写入/撤销/漂移回归不得退化。
Win7 SP1 x64 / Electron 22 Node 16.17.1 必须后续用当前候选直接重验；本地 Node 测试不等于 Windows PASS。
本任务仅交付源码修复，不解除 A9-09 独审/双构建或 WIN7-20 验收门槛。

## 5. 本地修复与验证（2026-08-30，未提交）

- 显式编码优先与 binary 元数据分支已修复；自动 GBK 扫描整个字节流，长 ASCII 前缀不会遮住后面的中文。
- 同一文件句柄按 64 KiB 异步扫描，预览最多 128 KiB / 2000 行；读取全文件得到精确哈希/行数，
  只在读取前后身份、大小、mtime/ctime 一致且关闭句柄成功后保留基线。取消信号由 Core 内部传递。
- Workspace 18 suites / 206 tests、Core 28 suites / 308 tests、真实产品组合/SQLite 合同 21 tests，
  共 535 tests PASS；其中新增 33 项回归。Workspace/Core TypeScript noEmit 与隔离目录编译通过。
  产品测试只重定向 Core/Workspace/Runner 到本次源码编译的临时 dist，未覆盖工作区已有 dist。
- 产品用本地 HTTP/SSE 模型夹具贯穿 Gateway → A9 Agent Loop → Workspace，证明显式 GBK/无 BOM
  UTF-16LE、binary 和第 750001 行读取抵达模型结果；不是外部 Provider 或 Windows/Electron GUI PASS。
- `docs:check`（103 文件/23 任务）及 `git diff --check` PASS。未重跑未变化的原生/Runner 全量或正式打包。
- 无 BOM UTF-16LE/ASCII 字节歧义仍需显式编码；长单行只返回截断预览。完整哈希需要扫描全文件，
  不是恒定时间随机访问。Win7 实机尚未执行，必须后续将本任务直接影响项纳入新候选验收。

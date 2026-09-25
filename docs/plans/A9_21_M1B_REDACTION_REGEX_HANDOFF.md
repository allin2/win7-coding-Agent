# A9-21 M1b 交接书：脱敏正则二次复杂度修复

> 执行方：外部执行 Agent。验收方：发出本交接书的会话。执行方只交代码、测试和事实报告，不自行宣布验收通过。
> 授权依据：[A9-21](../tasks/A9_21_A9_18_SALVAGE_PORT.md) §2 M1b（2026-09-25 负责人指示交由其他 Agent 实施）。

## 1. 问题

检测 URL 内嵌凭据的正则

```text
/([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi
```

在连续的 `[a-z0-9+.-]` 字符上是二次复杂度：协议名部分 `[a-z0-9+.-]*` 从每个起点贪婪吃到串尾再回退找 `://`。
开发机实测 64 K 字符约 2 s，256 K 约 30 s。它经 `redactSecrets` → `containsSensitiveCheckpointData` 作用于每个 checkpoint
快照文件、工具输出和事件；工作区里只要有一个长的十六进制或纯字母单行文件，基线冻结、启动恢复或脱敏就会卡住。

出现位置（基线 `25c89d3`）：

| 位置 | 函数 | 输入是否有界 |
|---|---|---|
| `src/shell/product/a9-agent-runtime.js:72` | `boundedDiagnosticText` | 否（先替换，后截到 600） |
| `src/shell/product/a9-agent-runtime.js:391` | `redactSecrets` | 否 |
| `src/shell/product/renderer/a9-workbench.js:117` | `runtimeDiagnostic` | 是（先截到 500），无性能问题，为一致性一并修改 |

## 2. 修复方法

把协议名的重复次数限定为最多 31 次：

```text
/([a-z][a-z0-9+.-]{0,31}:\/\/)[^\s/@:]+:[^\s/@]+@/gi
```

这个修改**不改变脱敏结果**：正则没有锚点，协议名超过 32 个字符时匹配会从词中间开始，`$1` 原样写回，输出与旧正则逐字节相同。
验收方已在开发机验证：1 MiB 最坏输入约 75 ms，线性。

## 3. 实施要求

1. 基线：`codex/a9-alpha2` @ `25c89d3`。在新分支 `codex/a9-21-m1b` 上工作（可用 git worktree），完成后本地提交，**不推送、不合并**。
2. 允许修改的文件，仅限：
   - `src/shell/product/a9-agent-runtime.js`
   - `src/shell/product/renderer/a9-workbench.js`（只改第 117 行附近这一个正则）
   - 新增 `src/shell/tests/product/a9-21-redaction-regex.test.ts`
3. 运行时里的两处改为共用一个模块级函数（建议名 `redactUrlUserinfo(text)`），在 `module.exports` 中额外导出它供测试使用；
   不改变 `createA9AgentRuntime`、`A9_PROTOCOL_VERSION` 的导出。渲染端是沙箱脚本，不能引用运行时模块，保留字面量并加注释说明与运行时保持一致。
4. 不修改其他正则、不改 `boundedDiagnosticText` 的截断位置（不要在替换前先截断：会把跨越截断点的凭据留成半截明文）。
5. 不新增依赖，不改 ADR、任务书、STATUS 等文档（文档由验收方更新）。

## 4. 测试要求（新文件 `a9-21-redaction-regex.test.ts`）

1. **等价性**：在测试里内联旧正则作为参照，对下列语料断言新旧输出逐字节相同：
   `https://user:pass@host/x`、`git+ssh://u:p@h`、`HTTP://A:B@C`、`s3://k:v@b`、协议名恰好 32 与 33 个字符、
   无凭据 URL `https://example.com/a:b@c`、同一行多个 URL、中文前后缀、空串。
2. **性能**：以下每个 1 MiB 输入，`redactUrlUserinfo` 在 1 s 内完成（旧正则需要数分钟）：
   连续字母；字母串中间加一个冒号；`a://` + 长串 + `:` + 长串且无 `@`；`a://b:c ` 重复；十六进制串。
3. **行为路径**：通过持久化失败诊断走一遍 `boundedDiagnosticText`：给 `createA9AgentRuntime` 传入一个抛出
   “1 MiB 连续字母 + `https://u:p@h`” 错误的 `openDatabase`，断言快照诊断中不含 `u:p`、长度不超过 600，且整个调用在 2 s 内完成。
   若该路径在不改允许路径外文件的前提下不可达，改用导出的函数测试，并在报告中说明。
4. **负向对照**：把新测试放在 `25c89d3` 的代码上运行（可在临时副本中给旧代码补一个行为等价的 `redactUrlUserinfo` 导出），
   记录性能用例超时或失败、等价性用例通过。

## 5. 验证命令（Node 20.17，better-sqlite3 需要 ABI 115）

```bash
cd src/shell && npx tsc --noEmit
```

```bash
cd src/shell && npx jest --runInBand
```

```bash
npm run verify:quick
```

```bash
git diff --check
```

## 6. 交付

- 分支 `codex/a9-21-m1b` 上的提交哈希（提交信息说明问题、修法与“输出不变”）。
- 事实报告（贴在回复里即可）：改动文件清单；全部测试输出摘要（套数/项数/失败项）；性能用例的实测毫秒数；负向对照结果；
  未完成或偏离本交接书的地方及原因。
- 不写“验收通过”“已修复”等结论性措辞。

## 7. 验收方将检查

1. 只改了 §3.2 允许的文件，`git diff 25c89d3..` 无其他改动。
2. 三处正则均为 `{0,31}` 形式，运行时两处共用一个函数。
3. 等价性语料新旧输出一致；1 MiB 最坏输入在验收方环境复测为线性。
4. shell 全量测试通过，负向对照成立。

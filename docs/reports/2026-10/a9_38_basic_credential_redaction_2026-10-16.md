# A9-38 HTTP Basic 凭据判定与脱敏修复本地报告（2026-10-16）

## 1. 结论

负责人已批准 A9-38 带已知限制登记 `A9_38_DEVELOPER_VERIFIED`，执行代理以 ADR-0249 登记。结论限开发机，绑定基线 `234e3dfb…`、当前第三轮产品 `1809d4a5…`、测试 `34b9036c…`，完整身份见 §9 与 §10。

Node 20.17.0 三套件 150 PASS/0 FAIL，codex 聚焦复核为 0P0/0P1/0P2。限制完整清单见 ADR-0249，K1 已关闭，K2～K8 保留。Electron、Win10 验收机、Win7 实机均 `NOT_PERFORMED`；未提交、未整合、未推送、未连接远端。

下表及 §2～§7 保留第一轮执行与审核记录，不代表当前字节。§8 记录第二轮（产品 `bc3ed2b2…`），§9 记录第三轮，§10 记录本次批准与文档收口。

| 项 | 值 |
|---|---|
| 分支 | `codex/a9-38-basic-credential-redaction`（隔离工作树） |
| 基线 | `234e3dfbcf25e27e3fafe29162244551eac771ea` |
| 基线产品 SHA-256 | `603323e2…` |
| 修复后产品 SHA-256 | `d744db2d8133bc57b4465cf5640e54693903007cffb59ba2f36fa6691b90e27e` |
| 测试 SHA-256（修复前后相同） | `8f720f025b8bcdf695d40b9717a9fde94bfef71035facfdedd67b776d03d0cf4` |
| 运行时 | Node 20.17.0，macOS；POSIX 进程夹具为 `SURROGATE` |
| 决策 | [ADR-0248](../../DECISIONS.md#adr-0248-a9-38-将代理-basic-组合纳入已知秘密并修正-authorization-单令牌脱敏) |

## 2. 先失败后修复

执行代理先在基线产品上新增 14 项 `A9-38` 测试，再修改产品。测试文件修复前后字节相同。

| 阶段 | 产品 | 命令退出码 | PASS | FAIL |
|---|---|---|---|---|
| 修复前 | `603323e2…` | 1 | 3 | 11 |
| 修复后 | `d744db2d…` | 0 | 14 | 0 |

修复前 11 项 FAIL 与任务书 §5 一一对应。L1 的 10 项均在 `result.ok` 断言处失败：checkpoint 放行，Shell 实际执行。L2 一项在快照断言处失败：快照含 `A938BASICCREDONE`。3 项对照修复前后均 PASS。

| 任务书编号 | 测试 |
|---|---|
| N1 | `proxy-authorization-header`，代理指向夹具，当前组合处于生效状态 |
| N2 | `bare-json` |
| N3 | `base64-unpadded`、`base64url-padded`、`base64url-unpadded`、`percent` |
| N4 | `utf16le` |
| N5 | `previous-after-proxy-null` |
| N6 | `previous-after-username-change`、`current-after-username-change` |
| N7、N8、C3 | 单项投影测试：Basic、`Proxy-Authorization`、小写 `authorization=basic`、NTLM，以及换行后下一行保留；快照与 `dataRoot` 全部文件不含凭据 |
| C1、C2 | `unregistered composite`、`documentation example`，均已登记代理；恢复与撤销字节相同 |
| C4 | 含 Basic 凭据的项目说明仍为 `secret_blocked`，Provider 请求体不含凭据 |
| C5 | A9-37 既有 11 种已知秘密形式，随三套件回归运行 |

## 3. 产品改动

改动只在 `src/shell/product/a9-agent-runtime.js`，共增 20 行、删 3 行：

1. 新增进程内 `knownBasicCredentials` 集合与 `rememberBasicCredential`。
2. 在 Provider 配置登记新秘密时、在启动恢复持久化秘密时登记组合。登记发生在恢复区重校验之前。
3. `redactKnownSecrets` 与实时预览保留长度改用 `knownSecretMaterial()`，组合排在单值之前。
4. `redactSecrets` 的 Authorization 规则增加“方案名 + 空格/制表符 + 令牌”分支；`Bearer` 分支不变。

## 4. 检查

全部命令在隔离工作树执行，Node 20.17.0。原始输出位于候选外 `outputs/a9-38-basic-credential-redaction/`（`.gitignore` 忽略）。

| 检查 | 退出码 | 结果 |
|---|---|---|
| `npm run verify:quick`（基线） | 0 | 7 模块 |
| A9-38 定向（修复前） | 1 | 3 PASS/11 FAIL |
| A9-38 定向（修复后） | 0 | 14 PASS/0 FAIL |
| 三套件回归 | 0 | lifecycle 60、redaction 46、Provider persistence 26，共 132 PASS/0 FAIL |
| `npm run verify:quick`（修复后） | 0 | 7 模块 |
| `npm run docs:check` | 0 | 见 §6 |
| `git -c core.fsmonitor=false diff --check` | 0 | 无输出 |

`verify:quick` 重建了 24 个已跟踪的 `src/runner/dist` 文件。执行代理在检查结束后用 `git checkout -- src/runner/dist` 只恢复这些文件，恢复前状态保存在 `status-before-dist-restore.txt`。

## 5. 已知限制

| 编号 | 限制 |
|---|---|
| K1 | 重启后由持久化代理配置恢复组合的路径无直接测试；开发机无 DPAPI，代理密码只在内存。`NOT_VERIFIED` |
| K2 | 未登记用户名的组合不识别（ADR-0248 L1 边界） |
| K3 | `Digest` 逗号分隔参数只替换首个参数 |
| K4 | 已写入 SQLite 的历史投影不回洗 |
| K5 | GBK 解码分支无组合形式的直接测试（与 ADR-0247 L3 同类） |
| K6 | POSIX 进程夹具为 `SURROGATE`，不提供 Windows 原生身份或进程树清理证明 |

## 6. 未执行与边界

- 独立审核、Electron、Win10 验收机、Win7 实机：`NOT_PERFORMED`。
- 本修复不在 WIN7-45（第二批正式验收候选）中，未创建新候选。
- 未提交、推送或连接远端；未修改其他工作树。`docs/STATUS.md` 与 `docs/STATUS_LOG.md` 未改，由整合方统一同步。
- Phase-Gate 保持 `A9_38_IMPLEMENTATION_AUTHORIZED`；登记 `A9_38_DEVELOPER_VERIFIED` 需负责人签发。

## 7. 独立审核与复核（2026-10-16）

独立审核结论 0P0/0P1/4P2，审核对象为产品 `d744db2d…`、测试 `8f720f02…`。报告位于仓库外共享笔记目录 `a9-38-independent-review-2026-10-16.md`。审核未改工作树。4 项 P2 处置待负责人裁决。

| 编号 | 内容 |
|---|---|
| P2-1 | 启动恢复路径的组合登记无测试；删除该行后 14 项仍 PASS（即 K1） |
| P2-2 | 带引号值与 JSON 键形式的 Authorization 凭据不脱敏；早于 A9-38，限制清单未列 |
| P2-3 | 投影用例合并四种形式；标题与命令两路由代码阅读证明，无直接测试 |
| P2-4 | Shell 环境覆盖校验只读 `knownSecrets`，看不到组合；含 U+0080～U+00FF 的代理凭据经 `btoa` 生成 Latin-1 base64，不命中 |

审核会话中 3 项后台进程测试 FAIL。执行代理复核确认根因：这些测试加载 `src/runner/dist`。已跟踪 dist 落后于 Runner 源码时 3 项 FAIL；用 `src/runner` 的 `npm run build` 重建后 3 项 PASS。§4 的 132/0 在 `verify:quick` 重建 dist 后运行，因此成立。复核后已恢复 dist，未遗留测试进程。原始输出为 `recheck-background-rebuilt.*` 与 `review-recheck-background.*`。

该依赖在基线 `234e3dfb…` 上同样存在，与 A9-38 改动无关。复验必须先重建 Runner dist，再运行三套件。

## 8. 审核处置与第二轮修复（2026-10-16）

项目经理经负责人授权裁决独立审核 4 项 P2，执行代理按裁决完成第二轮本地修复。证据层级为开发机；Electron、Win10 验收机、Win7 实机均 `NOT_PERFORMED`。第二轮独立审核 `NOT_PERFORMED`，由项目经理另派。未提交。

| 项 | 值 |
|---|---|
| 第二轮产品 SHA-256 | `bc3ed2b2f7210f993d6a25c0596f51a003451be0b79408afdbba29fff3982e2e` |
| 第二轮测试 SHA-256 | `c17e3d3891395701fbc951acb5190f73821bff6814cd4b342f138601e4fa58eb` |
| 相对基线 | 产品增 53 行、删 14 行；测试增 318 行、删 2 行 |
| 原始输出 | `outputs/a9-38-basic-credential-redaction/round2/` |

### 8.1 先失败后修复

同一测试文件（`c17e3d38…`）的 28 项 `A9-38` 用例，在不同产品字节上的结果：

| 产品 | 退出码 | PASS | FAIL | 失败项 |
|---|---|---|---|---|
| 基线 `603323e2…` | 1 | 4 | 24 | L1、L2 反例与全部新增反例 |
| 第一轮 `d744db2d…` | 1 | 21 | 7 | P2-4 的 4 项环境覆盖、3 项 Latin-1 checkpoint |
| 第一轮去掉启动恢复登记行 | 1 | 20 | 8 | 上述 7 项，加重启用例 |
| 第二轮 `bc3ed2b2…` | 0 | 28 | 0 | 无 |

失败原因均已核对：环境覆盖用例为 `configureShell` 被接受；checkpoint 用例为 `result.ok` 为 true，即 Shell 实际执行。

### 8.2 处置明细

| 编号 | 处置 | 新增或改动 |
|---|---|---|
| P2-1 | 补测试 | 用测试专用 fake safeStorage 走 vault 合同：首个运行时持久化代理后关闭，第二个运行时重启后阻断组合；`makeCheckpointRuntime` 增加可选配置参数。K1 由此关闭 |
| P2-2 | 不修 | 已知限制 K7：带引号值与 JSON/字典键形式不脱敏，早于 A9-38 |
| P2-3 | 拆分并补测试 | 4 个独立投影用例；换行对照独立；手动标题与 Shell 命令各一项，均断言快照与 `dataRoot` 文件 |
| P2-4 | 修产品 | 新增 `latin1CompositeBase64` 与 `environmentSensitiveValues`；6 处 `Array.from(knownSecrets)` 改为后者；组合含 U+0080～U+00FF 时同时登记 Latin-1 base64 变体 |

### 8.3 检查

| 检查 | 退出码 | 结果 |
|---|---|---|
| `src/runner` 下 `npm run build` | 0 | 先于测试重建 dist |
| A9-38 定向（第二轮） | 0 | 28 PASS/0 FAIL |
| `npm run verify:quick` | 0 | 7 模块 |
| 三套件回归 | 0 | lifecycle 74、redaction 46、Provider persistence 26，共 146 PASS/0 FAIL |
| `a9-product-contract`（附加，只运行） | 0 | 32 PASS/0 FAIL |
| `npm run docs:check`、`git -c core.fsmonitor=false diff --check` | 0 | 见下文 |

检查结束后用 `git checkout -- src/runner/dist` 恢复 24 个 dist 文件，未遗留测试进程。

### 8.4 已知限制更新

K1 关闭。K2～K6 不变。新增：

| 编号 | 限制 |
|---|---|
| K7 | 带引号值与 JSON/字典键形式的 Authorization 凭据不脱敏（审核 P2-2，早于 A9-38） |
| K8 | 代理凭据含高于 U+00FF 的码位时，网关 `btoa` 抛错，代理不可用；属网关，不在允许路径 |

## 9. codex 复审处置与第三轮修复（2026-10-16）

codex 独立复审结论 0P0/0P1/1P2，审核对象为产品 `bc3ed2b2…`。项目经理经负责人授权裁决修复 P2-01，执行代理完成第三轮本地修复。证据层级为开发机；Electron、Win10 验收机、Win7 实机均 `NOT_PERFORMED`。未提交。

| 项 | 值 |
|---|---|
| 第三轮产品 SHA-256 | `1809d4a559eb7fd7d35548d0a5412ca91d78a590224a451f478cb9013234924b` |
| 第三轮测试 SHA-256 | `34b9036c93ac25a931bfe8f1a08f0256584c1d444e14193550773830875020a8` |
| 相对基线 | 产品增 54 行、删 14 行；测试增 369 行、删 2 行 |
| 复审证据 | `outputs/a9-38-basic-credential-redaction/codex-review/run-20261017T015206Z/review.md` |
| 本轮原始输出 | `outputs/a9-38-basic-credential-redaction/round3/` |

### 9.1 改动

正则只改方案名首字符：`[a-z][tchar]*` 改为 `[tchar]+`，tchar 为 RFC 7235 token 字符集合。`Bearer` 分支、方案名后只跨空格/制表符、Digest 只处理首个参数（K3）与 K7 均不变。

### 9.2 先失败后修复

| 用例 | `bc3ed2b2…` | `1809d4a5…` |
|---|---|---|
| `1Custom`、`!Custom`、`_Custom` 标题投影，各 1 项 | FAIL；快照与 SQLite 两路均含凭据 | PASS |
| 普通文本 `Authorization: see docs` 标题投影 | PASS | PASS |
| A9-38 全部 32 项 | 29 PASS/3 FAIL | 32 PASS/0 FAIL |

三项反例把两路结果放在同一断言里，因此旧产品上两路都有直接观察值。

### 9.3 普通文本与既有排除项

执行代理用 Node 直接比较 `bc3ed2b2…` 与第三轮正则的输出，结果存于 `round3/regex-behavior.txt`。

| 输入 | 第三轮输出 | 与 `bc3ed2b2…` |
|---|---|---|
| `Authorization: see docs` | `Authorization: ***redacted***` | 相同 |
| `authorization: required for all requests` | `authorization: ***redacted*** all requests` | 相同 |
| `Authorization: Basic` 后接换行 | 下一行保留 | 相同 |
| `Authorization: Digest username="u", response="…"` | 只替换首个参数 | 相同 |
| `Authorization: Bearer abc` | `Authorization: ***redacted***` | 相同 |
| `1Custom`、`!Custom`、`_Custom` 后接凭据 | 凭据整体替换 | 不同，即本次修复 |

与基线 `603323e2…` 相比，`Authorization: see docs` 的投影从 `Authorization: ***redacted*** docs` 变为 `Authorization: ***redacted***`。这是第一轮起已登记的保守过度替换（ADR-0248 L2 边界），本轮未改变。回溯压测：100 万个 tchar 与 90 万字符混合输入各耗时 1 ms。

### 9.4 检查

| 检查 | 退出码 | 结果 |
|---|---|---|
| `src/runner` 下 `npm run build` | 0 | 先于测试重建 dist |
| A9-38 定向 | 0 | 32 PASS/0 FAIL |
| `npm run verify:quick` | 0 | 7 模块 |
| 三套件回归 | 0 | lifecycle 78、redaction 46、Provider persistence 26，共 150 PASS/0 FAIL |
| `npm run docs:check`、`git -c core.fsmonitor=false diff --check` | 0 | 见本轮 `docs-check.log`、`diff-check.log` |

检查结束后用 `git checkout -- src/runner/dist` 恢复 dist，未遗留测试进程。

## 10. 开发收口登记（2026-10-16）

负责人对下列问题回复原话“批准”。执行代理据此以 [ADR-0249](../../DECISIONS.md#adr-0249-a9-38-登记-a9_38_developer_verified带已知限制) 登记 `A9_38_DEVELOPER_VERIFIED`。

> A9-38 是否按选项 A 带已知限制签 A9_38_DEVELOPER_VERIFIED，并本地合入整合分支

### 10.1 身份与证据层级

| 项 | 值 |
|---|---|
| 工作树 | `/Users/qlyf/.codex/worktrees/a9-38-basic-credential-redaction/win7-coding-Agent` |
| 分支 | `codex/a9-38-basic-credential-redaction` |
| HEAD / Source Baseline | `234e3dfbcf25e27e3fafe29162244551eac771ea`，加当前未提交差异 |
| 产品 SHA-256（本次复算） | `1809d4a559eb7fd7d35548d0a5412ca91d78a590224a451f478cb9013234924b` |
| 测试 SHA-256（本次复算） | `34b9036c93ac25a931bfe8f1a08f0256584c1d444e14193550773830875020a8` |
| 证据层级 | 开发机；POSIX 进程夹具为 `SURROGATE` |
| 产品检查 | `INHERITED_EVIDENCE`：沿用 §9.4 与 codex 聚焦复核的当前产品/测试字节证据，本次不重跑 |
| 继承检查结果 | Node 20.17.0 三套 Jest 150 PASS/0 FAIL，`verify:quick`、`docs:check`、`diff --check` 均退出 0 |

执行代理已核对第三轮 Jest JSON、原始日志和聚焦复核报告。第三轮与聚焦复核均先重建 Runner dist，再检查实际消费者；原报告可核验。本次只改文档，产品、测试、依赖、配置、运行参数与相关上下游字节不变，故沿用上述开发机证据。本次直接检查见 §10.4。

### 10.2 审核链

审核原文位于候选外，文件哈希经本次复算。原轮次结论与失败证据保留。

| 独立审核 | 报告路径 | 报告 SHA-256 前 8 位 | 审核产品 | 原结论 |
|---|---|---|---|---|
| Claude | `/Users/qlyf/Library/Application Support/Claude/side-session-notes/local_53e0058b-d6de-450d-b89e-6dbe006dcf67/a9-38-independent-review-2026-10-16.md` | `c09d52cc…` | `d744db2d…` | 0P0/0P1/4P2 |
| codex 复审 | `outputs/a9-38-basic-credential-redaction/codex-review/run-20261017T015206Z/review.md` | `856e4cd4…` | `bc3ed2b2…` | 0P0/0P1/1P2 |
| codex 聚焦复核 | `outputs/a9-38-basic-credential-redaction/codex-review/recheck/review.md` | `71c19a43…` | `1809d4a5…` | 0P0/0P1/0P2 |

Claude P2-1、P2-3 已补测试，P2-4 已修复，P2-2 按裁决保留为 K7。codex 复审的 P2-01 已修复，聚焦复核确认关闭。零发现仅覆盖该轮审核范围，不关闭既有已知限制。

### 10.3 已知限制与授权边界

完整编号沿用 §5 与 §8.4，当前状态以本表为准。

| 编号 | 限制与当前状态 |
|---|---|
| K1 | 已关闭：第二轮以 fake safeStorage 补启动恢复组合登记的直接测试，不提供真实 DPAPI 或 Win7 证据。 |
| K2 | 未登记用户名的 Basic 组合不识别。 |
| K3 | `Digest` 逗号分隔参数只替换首个参数，后续参数不保证脱敏。 |
| K4 | 已写入 SQLite 的历史投影不迁移、不回洗。 |
| K5 | GBK 解码分支无组合形式的直接测试，仍为 `NOT_VERIFIED`。 |
| K6 | POSIX 进程夹具为 `SURROGATE`，不提供 Windows 原生身份或进程树清理证明。 |
| K7 | 带引号值与 JSON/字典键形式的 Authorization 凭据不脱敏，该缺陷早于 A9-38。 |
| K8 | 代理凭据含高于 U+00FF 的码位时，网关 `btoa` 抛错使代理不可用，不在本任务允许路径。 |

数字/符号开头文本会多替换后续单词，属保守脱敏边界，见聚焦复核的普通文本矩阵。POSIX 夹具仍为 `SURROGATE`。KL-12（真实 helper 启动后 ready 失败清理）仍为 P1/NOT_PERFORMED。

`Win7-Validation` 保持 `NOT_PERFORMED`。本登记不签 Electron/Win10、Win7、新候选、Alpha2/RC、推送、合入 main 或发布。A9-38 产品改动不在 WIN7-45（第二批正式验收候选）中，未在 Win7 实机验证。

本分支原有最大编号为 ADR-0248。本次只读核对 a9-36 最大 ADR-0245、a9-33 最大 ADR-0243、整合工作树最大 ADR-0247。整合前须再核号。本轮只改指定七件文档，产品与测试保持入场字节。主工作区 `docs/OUTPUT_STYLE.md` 与 `docs/GLOSSARY.md` 仅作只读写作参考。

负责人已同意本地合入整合分支；本轮未提交、未整合、未推送、未连接远端。下一步为本地提交并快进合入 `codex/a9-alpha2-integration-r2`；整合前再核号，整合后按既有方案重跑 A9-32 §5。上述后续动作本轮均 `NOT_PERFORMED`，不签 A9-32 状态。

### 10.4 本次文档检查

执行代理在 Node 20.17.0 下检查本次七件文档，结果如下。

| 直接检查 | 退出码 | 结果 |
|---|---|---|
| `node -v` | 0 | `v20.17.0`，PATH 固定 `/Users/qlyf/.nvm/versions/node/v20.17.0/bin` |
| `npm run docs:check` | 0 | `ok: true`，363 个文件、52 份任务书 |
| `git -c core.fsmonitor=false diff --check` | 0 | 无输出 |

本轮未重跑 Jest 或 `verify:quick`，产品检查沿用 §10.1 的 `INHERITED_EVIDENCE`。执行代理在收尾复算产品与测试完整 SHA-256，均与 §10.1 及入场值一致。


# A9-38 — HTTP Basic 凭据的已知秘密判定与日志脱敏修复

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: PRODUCT_HARDENING
Phase-Gate: A9_38_DEVELOPER_VERIFIED
Target Branch: codex/a9-38-basic-credential-redaction（隔离工作树）
Source Baseline: 234e3dfbcf25e27e3fafe29162244551eac771ea（codex/a9-alpha2-integration-r2，含 A9-37）
Win7-Validation: NOT_PERFORMED
Decision: ADR-0248、ADR-0249（依据 ADR-0247 L1、L2）
```

## 1. 来源与本草稿边界

2026-10-16 负责人对本任务书回复“批准”。执行代理据此将 Status 改为 `APPROVED_FOR_IMPLEMENTATION`，§8 按推荐项登记。

本任务处理 [ADR-0247](../DECISIONS.md#adr-0247-a9-37-登记-a9_37_developer_verified带已知限制) 登记的已知限制 L1、L2。ADR-0247 本身不授权本任务；本任务的实现授权来自上述批准，只限 §4 允许路径和 Target Branch（AGENTS.md C14）。
起草与批准登记均未改代码、未提交。

来源审核：Claude 独立审核 R-02 及其附记，报告在 A9-37 工作树候选外 `outputs/a9-37-checkpoint-secrets/independent-review-2026-10-16.md`（`271f4ae8…`）。

| 编号 | 缺陷 | 代码位置（Source Baseline） | 开发机复现 |
|---|---|---|---|
| L1 | 已登记代理密码以 `base64(用户名:密码)` 出现时，`redactKnownSecrets` 不命中，checkpoint 放行 | `a9-agent-runtime.js:408`、`:446` | 合成密码的 4 种 base64 变体均不是组合串的子串 |
| L2 | `redactSecrets` 的 Authorization 规则只吃掉 `Basic` 一词，凭据留在日志与投影 | `a9-agent-runtime.js:438-442` | 输出为 `Authorization: ***redacted*** <凭据>` |

L1 由 A9-37 引入：修复前 `Proxy-Authorization` 启发式附带阻断 checkpoint。L2 是既有缺陷，早于 A9-37。复现只用 Node 字符串计算，证据层级为开发机，未运行产品测试。

## 2. 可观察结果

L1 成功条件：

1. 已登记代理用户名与密码的 Basic 组合编码出现在工作区文件中时，Shell 前 checkpoint 返回 `A9_CHECKPOINT_SECRET_BLOCKED`，Shell 调用 0 次。
2. 覆盖的组合编码：标准 base64、去 padding、URL-safe 带/不带 padding、上述各式的 percent 编码；文本按 UTF-8、UTF-16LE、GBK 解码，与单值变体一致。
3. 组合判定不依赖 `Authorization` 或 `Proxy-Authorization` 字段名；裸串同样阻断。
4. 本进程内曾登记的旧组合继续阻断：代理被清除、用户名更换或密码更换之后均成立。
5. 未登记的 `用户名:密码` 组合不阻断；文档示例 `Authorization: Basic dXNlcjpwYXNz` 恢复与撤销字节相同。
6. 恢复区、结果、快照与事件不出现组合串或密码原文。

L2 成功条件：

1. `Authorization` 与 `Proxy-Authorization` 的 `Basic <凭据>` 经 `redactSecrets` 后，凭据整体替换为 `***redacted***`。
2. 字段名、方案名大小写不敏感；分隔符 `:` 与 `=` 均覆盖。
3. 方案名与凭据之间只匹配空格或制表符；换行后的下一行内容不被吞掉。
4. 快照、事件和 SQLite 持久化的提示、标题、命令、最终消息均不含该凭据。
5. 既有 `Bearer` 行为、URL userinfo 脱敏不变。
6. 项目说明外发门的阻断集合不缩小：原先 `secret_blocked` 的输入仍为 `secret_blocked`。

## 3. 设计约束

L1 的已知值集合扩展为“用户名与密码组合”。执行代理在内存中保留本进程见过的组合，与 `knownSecrets` 同生命周期。组合不写盘，不改 vault、Schema 或持久化格式；重启后只恢复当前持久化的代理组合。

L2 只修改 `redactSecrets` 的 Authorization 规则。`redactKnownSecrets` 与 checkpoint 判定入口不引入任何字段名启发式，保持 ADR-0246 的分离。

不包括：

- 未登记用户名的组合，例如同一密码用于其他站点的 Basic 认证。
- `Digest` 认证的逗号分隔参数列表。
- 已写入 SQLite 的历史日志与投影；不迁移、不回洗。
- 通用 DLP 或未登记秘密识别。
- 带引号值与 JSON/字典键形式的 Authorization 凭据（独立审核 P2-2；早于 A9-38，2026-10-16 项目经理裁决不修，登记为已知限制）。

## 4. 允许路径

实现与测试路径只限下列两项：

1. `src/shell/product/a9-agent-runtime.js`
2. `src/shell/tests/product/a9-lifecycle.test.ts`

文档路径：本任务书、`docs/tasks/README.md`、`docs/STATUS.md`、`docs/STATUS_LOG.md`、`docs/DECISIONS.md`、`docs/DECISIONS_INDEX.md`、`docs/reports/2026-10/` 下本任务报告。

不改 Core、Workspace、Runner、native、依赖版本、接口、Schema、恢复格式、权限、忽略规则、UI、`a9-21-redaction-regex.test.ts`、`a9-provider-persistence.test.ts`，也不改旧候选或证据。后两个测试文件只运行，不修改。

## 5. 先失败后修复的反例清单

执行代理先在 Source Baseline 产品字节上新增下列测试，测试名以 `A9-38` 开头。反例在未修复产品上必须 FAIL，修复后 PASS；对照组修复前后均 PASS。

| 编号 | 类型 | 输入 | 修复后期望 | 未修复产品上的结果 |
|---|---|---|---|---|
| N1 | 反例 | 登记代理 `fixture` 与合成密码；文件含 `Proxy-Authorization: Basic base64(fixture:密码)` | checkpoint 阻断，Shell 0 次 | Shell 执行 |
| N2 | 反例 | 同一组合串裸写在 JSON 字段中 | 阻断 | Shell 执行 |
| N3 | 反例 | 组合串去 padding、URL-safe 带/不带 padding、percent 编码，各一例 | 均阻断 | Shell 执行 |
| N4 | 反例 | N1 内容以 UTF-16LE 编码写入 | 阻断 | Shell 执行 |
| N5 | 反例 | 登记后执行 `proxy: null`，文件含旧组合 | 阻断 | Shell 执行 |
| N6 | 反例 | 更换用户名、密码不变；文件分别含旧组合与新组合 | 两者均阻断 | Shell 执行 |
| N7 | 反例 | 提示含 `Authorization: Basic <合成凭据>` | 快照、事件、SQLite 不含凭据 | 凭据留存 |
| N8 | 反例 | `Proxy-Authorization: Basic <合成凭据>`，及小写 `authorization=basic <凭据>` | 同 N7 | 凭据留存 |
| C1 | 对照 | 未登记的 `base64(other:other-pass)` | 不阻断，恢复与撤销字节相同 | 同期望 |
| C2 | 对照 | 文档示例 `Authorization: Basic dXNlcjpwYXNz` 写入工作区文件 | 同 C1 | 同期望 |
| C3 | 对照 | `Authorization: Basic` 后接换行，下一行为普通文本 | 下一行原样保留 | 同期望 |
| C4 | 对照 | 含 `Authorization: Basic <凭据>` 的项目说明 | 仍为 `secret_blocked`，Provider 请求体不含凭据 | 同期望 |
| C5 | 对照 | A9-37 既有 11 种已知秘密形式 | 仍阻断 | 同期望 |

C2 只断言 checkpoint 与恢复；该示例的投影脱敏由 N7 覆盖。所有凭据用合成值，不得使用真实凭据。执行代理保存未修复产品上的失败输出，不放宽断言。

## 6. 验证

全部命令在隔离工作树执行，使用 Node 20.17.0（ADR-0247 L4）。执行代理先确认 `node -v` 输出 `v20.17.0`。

1. 记录 Source Baseline 产品与测试的 SHA-256。
2. 在未修复产品上运行反例：

```bash
node node_modules/jest/bin/jest.js --config jest.config.js --runInBand tests/product/a9-lifecycle.test.ts --testNamePattern "A9-38"
```

   工作目录为 `src/shell`。期望退出 1，N1～N8 FAIL，C1～C5 PASS。

3. 修复后运行同一命令，期望退出 0。
4. 运行三套件回归：

```bash
node node_modules/jest/bin/jest.js --config jest.config.js --runInBand tests/product/a9-lifecycle.test.ts tests/product/a9-21-redaction-regex.test.ts tests/product/a9-provider-persistence.test.ts
```

5. 在仓库根运行 `npm run verify:quick`、`npm run docs:check`、`git -c core.fsmonitor=false diff --check`。
6. 构建改动 `src/runner/dist` 时，按 A9-37 第二轮做法只恢复构建漂移，不改其他文件。

完成标准：第 3～5 步全部退出 0；三套件 FAIL 为 0；新增 ADR 写明组合判定的安全边界；报告绑定产品与测试 SHA-256。POSIX 进程夹具为 `SURROGATE`（ADR-0247 L6）。

## 7. 对 Win7 候选的影响

1. WIN7-45（第二批正式验收候选）已冻结，本任务不改其字节，也不改其门 B 结论。
2. A9-37 与本任务都改 `a9-agent-runtime.js`，均不在 WIN7-45 中。
3. 两项修复进入 Win7 实机，须由后续换发任务生成新编号候选并另签门 A。本任务不授权换发。
4. 本任务结论上限为 `A9_38_DEVELOPER_VERIFIED`，证据层级为开发机；Electron、Win10 验收机、Win7 实机均为 `NOT_PERFORMED`。
5. 本任务以含 A9-37 的整合提交为基线。整合分支后续若重跑 A9-32 §5，须包含本任务改动后的产品字节。

## 8. 开放问题

| 编号 | 问题 | 选项 | 推荐 |
|---|---|---|---|
| Q1 | L2 是否扩到 `NTLM`、`Negotiate` 等单令牌方案 | A：只修 `Basic`。B：任意单令牌方案名后的凭据整体脱敏 | B。企业代理常用 NTLM/Negotiate，规则改动范围相同；`Digest` 仍排除 |
| Q2 | L1 是否检测“任意用户名 + 已登记密码”的 base64 | A：只检测已登记用户名组合。B：按 3 种字节对齐检测密码片段 | A。B 对短密码误报不可控，需另立 ADR |

裁决（2026-10-16）：负责人原话“批准”，未另选选项。执行代理按推荐项登记：Q1 取 B，Q2 取 A。负责人如要改选，执行代理在实施前改本节。

据此 §2 L2 成功条件第 1 条同样适用于 `NTLM`、`Negotiate` 等单令牌方案；§5 N8 增加 `Proxy-Authorization: NTLM <合成令牌>` 一例。

## 9. 执行记录

### 第一轮本地修复（2026-10-16）

负责人原话：“开始实现 A9-38：从 234e3dfb… 建隔离工作树 codex/a9-38-basic-credential-redaction，先失败后修复，不提交。”执行代理据此从 Source Baseline 新建隔离工作树，依赖用主工作区已安装 Node 20 依赖的软链接。

先新增 14 项 `A9-38` 测试。未修复产品 `603323e2…` 上退出 1，3 PASS/11 FAIL，失败项与 §5 N1～N8 一致。修复后产品 SHA-256 `d744db2d8133bc57b4465cf5640e54693903007cffb59ba2f36fa6691b90e27e`，测试 SHA-256 `8f720f025b8bcdf695d40b9717a9fde94bfef71035facfdedd67b776d03d0cf4`，定向 14 PASS/0 FAIL。

Node 20.17.0 下三套件 132 PASS/0 FAIL，`verify:quick`、`docs:check`、`diff --check` 均退出 0。ADR 核号后追加 ADR-0248。详细证据与已知限制见[本地报告](../reports/2026-10/a9_38_basic_credential_redaction_2026-10-16.md)。

证据层级为开发机。独立审核、Electron、Win10 验收机、Win7 实机均 `NOT_PERFORMED`。未提交、推送或连接远端。Phase-Gate 保持 `A9_38_IMPLEMENTATION_AUTHORIZED`，`A9_38_DEVELOPER_VERIFIED` 待负责人签发。

### 审核处置与第二轮本地修复（2026-10-16）

独立审核结论 0P0/0P1/4P2，审核对象为产品 `d744db2d…`、测试 `8f720f02…`。项目经理经负责人授权裁决 4 项 P2，经会话消息下达执行代理：

| 编号 | 裁决 | 执行 |
|---|---|---|
| P2-1 | 补启动恢复路径组合登记的直接测试 | 新增重启用例；删除该登记行后用例 FAIL，恢复后 PASS |
| P2-2 | 不修，登记为已知限制 | 写入 §3 不包括项与 ADR-0248 补充 |
| P2-3 | 投影用例按四种形式拆分；标题、命令各补直接测试 | 4 个独立投影用例、换行对照、标题与命令用例 |
| P2-4 | 修产品：Shell 环境覆盖可见组合；登记 UTF-8 与 Latin-1 两种 base64 | 先写 7 项反例，在 `d744db2d…` 上全部 FAIL，再修复 |

第二轮产品 SHA-256 `bc3ed2b2f7210f993d6a25c0596f51a003451be0b79408afdbba29fff3982e2e`，测试 SHA-256 `c17e3d3891395701fbc951acb5190f73821bff6814cd4b342f138601e4fa58eb`。A9-38 用例共 28 项：基线产品 4 PASS/24 FAIL，第一轮产品 21 PASS/7 FAIL，第二轮产品 28 PASS/0 FAIL。

Node 20.17.0 下先重建 Runner dist，`verify:quick` 退出 0；三套件 146 PASS/0 FAIL；附加 `a9-product-contract` 32 PASS/0 FAIL。dist 漂移已恢复。证据层级为开发机；第二轮独立审核由项目经理另派，执行代理未启动。Electron、Win10 验收机、Win7 实机均 `NOT_PERFORMED`。未提交。详见[本地报告第二轮](../reports/2026-10/a9_38_basic_credential_redaction_2026-10-16.md#8-审核处置与第二轮修复2026-10-16)。

### codex 复审处置与第三轮本地修复（2026-10-16）

codex 独立复审结论 0P0/0P1/1P2，审核对象为产品 `bc3ed2b2…`，证据在候选外 `outputs/a9-38-basic-credential-redaction/codex-review/run-20261017T015206Z/review.md`。P2-01：方案名首字符限于 `[a-z]`，`1Custom`、`!Custom`、`_Custom` 后的凭据留在标题快照与 SQLite，不满足 Q1=B。项目经理经负责人授权裁决修复，经会话消息下达执行代理。

执行代理先新增 3 项反例与 1 项普通文本对照。在 `bc3ed2b2…` 上 3 项反例 FAIL，标题快照与 SQLite 两路都含凭据；对照 PASS。修复只改方案名首字符：从 `[a-z]` 改为完整 tchar 集合，与 RFC 7235 token 一致。Digest 排除项与 K3、K7 不变。

`Authorization: see docs` 的投影为 `Authorization: ***redacted***`，与 `bc3ed2b2…` 逐字节相同。第三轮产品 SHA-256 `1809d4a559eb7fd7d35548d0a5412ca91d78a590224a451f478cb9013234924b`，测试 SHA-256 `34b9036c93ac25a931bfe8f1a08f0256584c1d444e14193550773830875020a8`。A9-38 用例 32 PASS/0 FAIL。

Node 20.17.0 下先重建 Runner dist，`verify:quick` 退出 0；三套件 150 PASS/0 FAIL。dist 漂移已恢复。证据层级为开发机；Electron、Win10 验收机、Win7 实机均 `NOT_PERFORMED`。未提交。详见[本地报告第三轮](../reports/2026-10/a9_38_basic_credential_redaction_2026-10-16.md#9-codex-复审处置与第三轮修复2026-10-16)。

## 开发收口登记（2026-10-16）

负责人对“A9-38 是否按选项 A 带已知限制签 A9_38_DEVELOPER_VERIFIED，并本地合入整合分支”回复原话“批准”。执行代理以 [ADR-0249](../DECISIONS.md#adr-0249-a9-38-登记-a9_38_developer_verified带已知限制) 登记阶段门。Status 保持 `APPROVED_FOR_IMPLEMENTATION`，不登记 `COMPLETE`。

结论限开发机，绑定基线 `234e3dfb…`、产品 `1809d4a5…`、测试 `34b9036c…`。完整 SHA-256 见 ADR-0249 与[报告开发收口登记](../reports/2026-10/a9_38_basic_credential_redaction_2026-10-16.md#10-开发收口登记2026-10-16)。Node 20.17.0 三套件 150 PASS/0 FAIL，`verify:quick`、`docs:check`、差异检查通过。产品检查沿用第三轮与聚焦复核的 `INHERITED_EVIDENCE`。Claude、codex 复审、codex 聚焦复核分别为 0P0/0P1/4P2、0P0/0P1/1P2、0P0/0P1/0P2。

本结论带 ADR-0249 的 K2～K8 限制，K1 已关闭。K3 为 Digest 只替换首个参数；K7 为带引号值与 JSON/字典键形式不脱敏。数字/符号开头文本会多替换后续单词，属保守脱敏边界。POSIX 夹具为 `SURROGATE`；KL-12 仍为 P1/NOT_PERFORMED。

`Win7-Validation` 保持 `NOT_PERFORMED`。A9-38 产品改动不在 WIN7-45 中；Electron、Win10 验收机、Win7 实机均 `NOT_PERFORMED`。本登记不签新候选、Alpha2/RC、推送、合入 main 或发布。本轮只改指定七件文档，未提交、未整合、未推送、未连接远端。下一步为本地提交并快进合入 `codex/a9-alpha2-integration-r2`；整合前再核号，整合后按既有方案重跑 A9-32 §5。本轮未执行这些后续动作。


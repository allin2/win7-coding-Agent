# A9-37 checkpoint秘密判定误报本地修复

负责人于 2026-10-16 批准 `A9_37_DEVELOPER_VERIFIED`，执行代理以 ADR-0247 登记，带 L1–L6 已知限制。结论限开发机，绑定产品 `603323e2…`、测试 `19120763…`。整合方案已准备，整合与整合后的 A9-32 §5 复验均 NOT_PERFORMED。详见[开发收口登记](#开发收口登记2026-10-16)。

第二轮已完成指定四项本地修复及验证：三套件 118 PASS/0 FAIL。详情见[第二轮修复](#第二轮修复2026-10-16)；以下第一轮记录及原失败保持。

## 第一轮结论与身份

开发机已修复普通源码和文档触发checkpoint秘密门的问题。证据绑定隔离分支`codex/a9-37-checkpoint-secrets`、基线`013cf796…`及下述产品哈希，不是Win7当前包结论。

- 产品文件：`src/shell/product/a9-agent-runtime.js`。
- 产品SHA-256：`426bb327bf54a2d5bbc4b3377abfeee9f187faff4b3e5adf59e98407dd33528e`。
- 测试文件：`src/shell/tests/product/a9-lifecycle.test.ts`。
- 测试SHA-256：`7f59b757ad60bb8326424732fe664a79ce98eab8caa2646b54281d4187cee16c`。
- 开发机：macOS、Node20.17.0、SQLite3.43.1。真实Runtime/Core/Workspace/SQLite；Provider为本地HTTP夹具，Shell经测试适配器执行真实短命POSIX进程，Windows native transport为SURROGATE。
- 主alpha2工作区已有dirty/untracked未改；旧候选、包、run、数据库、首失败、HALTED及UNKNOWN保留。本轮不提交、不推送、不发布、不远端、不签门A/B。

## 原因和修改

`containsSensitiveCheckpointData`使用`redactSecrets(text) !== text`判断已知秘密。该脱敏函数还包含Authorization及URL userinfo启发式，因而正常`Authorization: Bearer YOUR_API_KEY`、`authorization: token`及虚构URL文本也命中。
Shell在首个潜在副作用前冻结工作区基线，所以即便命令只读、命中文件与任务无关，也会在Runner前被拦截。

将现有已知值及编码变体替换逻辑抽为`redactKnownSecrets`。`redactSecrets`继续追加原有启发式，日志行为保持；checkpoint仅按已知值判定。没有跳过敏感文件、保存脱敏原文或更改恢复格式。
真实已知秘密仍阻断Shell，Provider新增秘密的恢复缓存重校验仍拒绝。未登记Authorization/URL凭据也不再凭外形阻断checkpoint；这个安全边界变化见[ADR-0246](../../DECISIONS.md#adr-0246-a9-37将checkpoint已知秘密判定与日志启发式脱敏分离)。本修复不是通用秘密扫描，也不保证未登记凭据不进入工作区恢复区。

## 直接验证

| 检查 | 开发机结果 |
|---|---|
| 修复前有效反例 | 普通文档、源码、URL、UTF-16LE示例及只读Shell共5项FAIL；已知秘密7项PASS |
| 修复后新增15项 | PASS：5条正常使用/恢复链路，10条已知秘密拒绝链路 |
| 恢复原字节 | 四类文本均经实际POSIX Shell修改，checkpoint保留原字节，Runtime撤销后字节相等 |
| 已知秘密不入快照 | 原文、Base64、URL-safe、无padding、percent、UTF-16LE、路径、旧Provider key、自定义头、移除代理后的旧密码均拒绝，Shell dispatch为0 |
| 保守日志投影 | 示例原文可备份，快照仍不暴露Authorization示例值或URL userinfo |
| Provider持久化 | 26 PASS |
| 脱敏等价/性能相关套件 | 46 PASS |
| 生命周期完整套件 | 41 PASS / 2 FAIL；其中本次15项全部PASS |
| 未修复基线对照 | 上述2条后台Stop/shutdown清理失败在原产品字节下同样FAIL；不归因于本修复，不改判PASS |
| verify:quick | PASS；7模块编译/静态门完成，测试消费者实际加载本树当前dist |
| docs:check、diff | PASS；docs检查360文件/51任务，diff无空白错误 |
| Electron、Win10、Win7、新包 | NOT_PERFORMED |

后台失败的直接信息为测试替代transport的D-013清理确认缺失；本轮仅证明基线与修复代码有相同结果，不据此解释目标平台行为。没有修复或弱化这两条既有断言。
初版夹具错误使用旧`background`参数，Schema拒绝后没有执行Shell；这些首失败保留为before.json/before-valid.json。修正为当前工具接口及显式测试适配器后的before-corrected.json才是有效旧代码反例。

## 证据和复验

候选外证据在本工作树`outputs/a9-37-checkpoint-secrets/`，不进入正式候选或Git提交。

- `before-corrected.json`、`after.json`、`regression.json`：有效旧反例、首轮修复及最终3套件结果。最终新增3个保护用例也在regression.json中。
- `baseline-background.json`、`baseline-control-restore.json`：未修复基线的2条同类失败和修复文件逐字节恢复证明。
- `build-before.log`、`build-after.log`：依赖先编译；`input-manifest.json`绑定源码和本次消费者加载的构建输出。
- `compiled/src/runner/dist/`保留本轮实际编译且已被消费者加载的生成物。消费者结束后，仅恢复该新工作树由本轮构建改动的跟踪dist，避免把无关历史生成物漂移混入产品补丁。以后复验必须先重新构建。

Node 20.17.0 前置：复验必须使用 Node 20.17.0，并先用 `node --version` 确认。Node 22 下 better-sqlite3 ABI 不匹配，会进入诊断模式；该结果不能作为产品复验结论。

复验命令：确认上述运行时后，先在本树执行`npm run verify:quick`；再于`src/shell`执行：

```text
node node_modules/jest/bin/jest.js --config jest.config.js --runInBand tests/product/a9-lifecycle.test.ts tests/product/a9-21-redaction-regex.test.ts tests/product/a9-provider-persistence.test.ts
```

不通过删断言、延长等待或忽略失败将完整套件写成PASS。目标机器、实际安装包与截图触发文件尚UNKNOWN；本地修复完成不代表正在使用的Win7旧包已经更新。

收口核对：`completion-audit.json`确认本次15项、旧代码反例、两条既有失败同名对应、当前产品/测试字节身份、基线控制精确恢复及主工作区产品未改。检查结论仅限本地修复，不扩大到安装包或目标平台。

## 第二轮修复（2026-10-16）

本轮按负责人和项目经理裁决完成 ADR 改号、P1 项目说明外发门恢复、P2-a URL-safe 覆盖及 P2-b 后台夹具身份字段修复。指定三套件 **118 PASS/0 FAIL**，新增 Read Only/无 Shell 两项在未修复产品上先失败，修复后项目说明均 `secret_blocked`，本地 Provider 请求体不含合成凭据。结论仅限开发机。

### 输入、范围和产品行为

沿用隔离工作树 `/Users/qlyf/.codex/worktrees/a9-37-checkpoint-secrets/win7-coding-Agent`，分支 `codex/a9-37-checkpoint-secrets`，HEAD `013cf7966c1f5858e2a2c58542d6f9495e88d29e`。入场产品 `426bb327…`、测试 `7f59b757…`；31 个既有 M、2 个既有 ??，其中 24 个 Runner dist，均以入场清单保护。本轮只修改任务 §2 的两件产品/测试文件、六件治理文档及本报告；编译依赖后测试实际消费者，本轮没有新增 dist 字节差异。

- **P1**：项目说明单独使用保守判定 `redactSecrets(text) !== text`，保留字符串和 UTF-8/UTF-16LE/GBK 解码。除函数名外，函数体与 HEAD 修复前保守判据一致，见 `instruction-gate-baseline-equivalence.json`。checkpoint 判定函数保持入场字节，A9WorkspaceService 继续仅检测已知秘密，普通工作区示例可执行和撤销的行为保持。
- **P2-a**：将合成秘密换为 `A9-37-known-~~~???x`，标准 Base64 为 `QTktMzcta25vd24tfn5+Pz8/eA==`；断言它实际包含 `+`、`/`、padding，URL-safe 包含 `-`、`_`。分别验证 padded `QTktMzcta25vd24tfn5-Pz8_eA==` 和 unpadded `QTktMzcta25vd24tfn5-Pz8_eA` 均阻断 checkpoint，Shell dispatch 为 0。
- **P2-b**：仅给 schemaVersion 3 的夹具请求补上 `profileId: a9-trusted-shell-current-user-v2`，与响应一致。没有修改 Runner、产品身份检查、原 Stop/shutdown 断言或任何超时。
- **ADR**：按 2026-10-16 批准改为 ADR-0246，统一当前治理文档和本报告的引用/锚点，正文保留既有语义，追加改号说明和项目说明外发门范围澄清；整合主线前再核号。全树检索包括忽略目录（排除 Git 元数据和 node_modules）；旧独立审核报告中的原编号属于历史原始证据，保留原文，当前对应编号为 0246。

不引入运行时、依赖、原生 API、Schema 或恢复格式变化。适用既有 D-009/D-014 和 C14/C15/C16、显式编码、秘密外发与生命周期边界；POSIX native transport/Job 字段为 SURROGATE，不提供 Windows 原生身份或清理证明。

### 旧代码反例和修复后验证

两项新测试分别写入未登记 Authorization Bearer 合成值和 URL userinfo 合成凭据，使用真实 Runtime/Core/Workspace/SQLite、Read Only、本地 `127.0.0.1` HTTP Provider 夹具，实际请求只有 read→final。先保留产品入场字节、只加入这两项测试运行，退出 **1**：**2 FAIL/43 skipped**；失败均为预期 `secret_blocked/false`、实际 `loaded/providerReceivedCredential: true`。原失败日志、Jest JSON、产品/测试输入哈希和当时测试源码分别为 `p1-before.log`、`p1-before.json`、`p1-before-input.json`、`p1-before-test.ts`，原产品完整字节保存在 `entry-source/`。这是真实请求体反例，界面快照脱敏不能替代外发门验证。

修复后使用 Node **20.17.0**，先编译七模块，再执行指定三套件；本轮所有结果为直接开发机证据。原第一轮结果仅作为保留历史，不作为本轮继承 PASS。

| 命令/套件 | 退出码 | 直接结果 |
|---|---:|---|
| npm run verify:quick（旧代码反例前） | 0 | 7 模块编译/静态门通过 |
| lifecycle --testNamePattern 'A9-37 blocks unregistered'（未修复产品） | 1 | 2 FAIL，43 skipped，45 total |
| npm run verify:quick（修复后） | 0 | 7 模块编译/静态门通过 |
| 指定三套 Jest 命令 | 0 | 3 套件，118 PASS/0 FAIL/0 skipped |
| a9-lifecycle.test.ts | 同上 | 46 PASS，含 P1 两项、URL-safe padded/unpadded 两项和原后台 Stop/shutdown 两项 |
| a9-21-redaction-regex.test.ts | 同上 | 46 PASS |
| a9-provider-persistence.test.ts | 同上 | 26 PASS |
| npm run docs:check | 0 | 360 文档/51 任务书 |
| git -c core.fsmonitor=false diff --check | 0 | 无空白错误 |
| Electron、Win10、Win7、新包、正式 Gate/发布 | 未执行 | NOT_PERFORMED |

Jest 命令在 `src/shell` 运行，主体与负责人指定命令相同；追加 `--json --outputFile` 留存结构化结果，没有筛掉完整回归的任何用例。产品源文件为直接加载的 JS，消费者按现有 sibling dist 路径加载本树刚构建的模块；`built-dist-after-manifest.json` 绑定本轮构建输出，`regression-input.json` 绑定产品和测试。

### 原两条后台失败与 KL-12

第一轮 `regression.json` 和 `baseline-background.json` 的 **113 PASS/2 FAIL** 及两个原失败保持，不追溯改判。失败用例为 `persists a managed background process and keeps Stop available after the turn completes` 和 `does not resolve shutdown until managed background processes are reaped`。独立审核定位请求缺少 profileId；本轮只补齐该夹具字段，完整回归的两条原断言均通过，确认根因为请求/响应身份不一致使 BackgroundProcessManager 拒绝采纳清理证明。此前报告只有“基线同样失败”的事实，不能将其解释为 POSIX 清理限制或产品清理缺陷；本段补充根因，不覆盖首失败。

**KL-12 仍为 P1/NOT_PERFORMED，本修复不关闭 KL-12。** 本轮正常 ready 后的 Stop/shutdown 与真实 helper 启动后 ready 失败的目标平台清理证据不同，不能相互替代。Electron/Win10/Win7 均 NOT_PERFORMED；未构建正式包、不签任何目标平台或发版门。

### 新身份、证据与保护检查

| 文件 | 本轮 SHA-256 |
|---|---|
| src/shell/product/a9-agent-runtime.js | `603323e25273eaf0a20a9987f0568d720a20d898d1fd8ef0dc40d9ace580b390` |
| src/shell/tests/product/a9-lifecycle.test.ts | `1912076361d13f36f8cd53a6a5adf9326f6cd583340f216b83827aa2cd70b842` |

原始结果统一保存在 `outputs/a9-37-checkpoint-secrets/fix-round2/`：入场清单/源码与 status、前后构建日志/产物哈希、P1 原失败与最终三套件 JSON/日志、docs/diff 检查、范围及原证据保护核对。`summary.json` 汇总本轮计数和退出码，`final-audit.json`/`final-status.txt` 记录收口字节及状态，不建立平行任务台账。

补充运行时取证第一次直接假设 `src/shell/node_modules/better-sqlite3` 路径，退出 1（MODULE_NOT_FOUND），首失败保存在 `consumer-resolution-first-result.json`；按测试相同的 Node 模块解析规则重取证后退出 0，确认 Node 20.17.0、SQLite 3.43.1 和本树七个 dist 入口，见 `consumer-resolution-corrected.json`。复用任务允许的既有只读依赖链接，没有安装或修改依赖；该取证路径错误不改变上述指定构建/测试的原结果。

本树缺少 `docs/OUTPUT_STYLE.md`，本地 Git 历史也未找到该路径；已请求补充规则，文档暂沿用现有中文报告风格，该文件的规则未能核验。仅本地授权动作；没有提交、推送、远端或目标机连接、npm install、其他工作树修改、旧候选/证据改写、删断言或延长超时。

## 开发收口登记（2026-10-16）

负责人已批准 `A9_37_DEVELOPER_VERIFIED`。执行代理按 [ADR-0247](../../DECISIONS.md#adr-0247-a9-37-登记-a9_37_developer_verified带已知限制) 登记，未改变产品与测试字节。负责人聊天原话如下：

> 批准 A9-37 签 A9_37_DEVELOPER_VERIFIED（开发机，603323e2…）。请登记 ADR 并准备整合方案，整合后重跑 A9-32 §5。

绑定分支 `codex/a9-37-checkpoint-secrets`，HEAD 为 `013cf7966c1f5858e2a2c58542d6f9495e88d29e`。产品完整 SHA-256 为 `603323e25273eaf0a20a9987f0568d720a20d898d1fd8ef0dc40d9ace580b390`。测试完整 SHA-256 为 `1912076361d13f36f8cd53a6a5adf9326f6cd583340f216b83827aa2cd70b842`。

本次读取第二轮原始结果 `fix-round2/summary.json`、`regression.json` 和构建日志，核对 Node 20.17.0、三套件 118 PASS/0 FAIL 及 `verify:quick` 退出 0。它们是第二轮直接开发机证据的既有记录，不记为本次新执行结果。本次不重跑产品构建或 Jest。

### 独立审核依据

下表报告均位于 `outputs/a9-37-checkpoint-secrets/`，哈希由本次复算。原报告保留，不回改旧编号、原失败或原审核结论。

| 独立审核 | 报告 | 报告 SHA-256 前 8 位 | 审核产品 | 原结论 |
|---|---|---|---|---|
| codex 第一轮 | `independent-review-codex-2026-10-16.md` | `d09d4adb…` | `426bb327…` | 0P0/1P1/2P2 |
| codex 第二轮 | `independent-review-round2-codex-2026-10-16.md` | `72021ebf…` | `603323e2…` | 0P0/0P1/0P2 |
| Claude | `independent-review-2026-10-16.md` | `271f4ae8…` | `426bb327…` | 0P0/1P1/3P2 |

Claude R-01 与 codex 首轮 P1 均指项目说明外发门被放宽。第二轮产品已恢复保守判据，codex 第二轮确认关闭。codex 第二轮 0P0/0P1/0P2 不消除 Claude R-02 与其登记的既有日志缺陷。

### 随结论签发的已知限制

L1–L6 是 ADR-0247 的限制编号。本表补足此前已知秘密保护概述的边界。

| 编号 | 限制与后续边界 |
|---|---|
| L1 | Claude R-02：已登记代理密码以 HTTP Basic 组合 `base64(用户名:密码)` 形式出现时，不匹配任何已知变体，checkpoint 不再阻断。修复前仅靠 Authorization 启发式附带阻断，不能写成已知秘密的所有组合编码均受保护。 |
| L2 | 既有缺陷，非 A9-37 引入：日志启发式对 `Authorization: Basic <凭据>` 只替换 `Basic` 一词，凭据留在日志与投影中。 |
| L3 | GBK 解码分支无新增直接检查，代码未改。 |
| L4 | 复验必须使用 Node 20.17.0。Node 22 下 better-sqlite3 ABI 不匹配，会进入诊断模式。 |
| L5 | KL-12 仍为 P1/NOT_PERFORMED，本登记不关闭。 |
| L6 | POSIX 进程夹具为 SURROGATE，不是 Windows 原生身份或进程树清理证明。 |

L1、L2 由后续单独任务处理，本 ADR 与本次文档登记不授权该任务。`Win7-Validation` 保持 `NOT_PERFORMED`。A9-37 产品改动不在 WIN7-45（第二批正式验收候选）中，未在 Win7 实机验证。不签 Electron/Win10、新候选、Alpha2/RC、推送/合并/发布，当前未提交。

本次已只读读取主工作区 `/Users/qlyf/Developer/win7-coding-Agent/docs/OUTPUT_STYLE.md` 与 `docs/GLOSSARY.md`，新写段落按其规则整理。上文“规则未能核验”保留为第二轮执行时的事实，不代表本次仍缺参考规则。本次只修改负责人指定的 7 件文档，保留入场产品、测试、24 件 Runner dist 修改及原证据。

本次在 Node 20.17.0 下执行 `npm run docs:check`，退出 0，检查 360 件文档、51 份任务书。`git -c core.fsmonitor=false diff --check` 退出 0。入场 1952 件 Git 枚举文件的 SHA-256 对比显示，本次只改指定 7 件文档，全部 `src/` 文件保持入场字节。产品与测试完整哈希复算匹配本节绑定值。

## 整合方案与复验边界

本节只准备方案。整合及整合后的 A9-32 §5 复验均 NOT_PERFORMED，不据此执行提交、推送、合并或远端动作。

1. 绑定整合目标分支/ref 和准确 HEAD，记录 dirty/untracked。复核上列产品、测试及三份独立审核报告哈希。重新核对目标树 ADR 编号；本次本地 a9-36 最大为 ADR-0245，ADR-0246/0247 整合前仍须再核号。
2. 在获准的整合树应用 A9-37 两件产品/测试差异及本次 7 件文档。治理文档逐段整合，保留目标树较新记录。记录整合前后输入身份和恢复基线；有冲突时先核对行为与合同，不覆盖原工作树、候选或证据。
3. 使用 Node 20.17.0，先执行 `npm run verify:quick` 编译依赖与消费者。核对实际加载的本树 dist 和运行时。先查普通示例 Shell→恢复→撤销、项目说明阻断→Provider 请求体无合成凭据、已知变体拒绝→零 Shell dispatch，再复跑本报告指定的 A9-37 三套件。
4. 在整合后的准确源码上重跑 [A9-32 §5](../../tasks/A9_32_EXPLICIT_TASK_CONTINUE.md#5-验证) 全部合同。执行其中 State/Core/Shell 定向命令、`verify:quick`、`docs:check`、差异检查及要求的反例；不以本轮 A9-37 的 118 PASS 代替。真实 Electron 检查范围见下表。按 §5、§7.10 及适用授权绑定产物、环境、run 与身份；未执行的层级保持 NOT_PERFORMED。
5. 沿用本报告、任务记录与状态入口登记整合结果。逐项记录直接检查、获准的 INHERITED_EVIDENCE、NOT_PERFORMED 和 L1–L6，不另建台账。新候选与目标平台验收按具体合同另行处理，保留 WIN7-45、KL-12 和全部旧 FAIL/UNKNOWN/HALTED。

| A9-32 §5 真实 Electron 检查 | 必须证明的行为 |
|---|---|
| 重启与继续 | 重启零自动请求，点击创建一个新 Turn，重复点击只执行一次 |
| 权限与未知结果 | 旧批准失效，未知副作用先核查 |
| 失败与恢复 | Provider/预算/审计失败后，可再次主动尝试 |
| 页面交互 | 加载、滚动、焦点和 Stop 按合同工作 |

哈希、身份、完整性、安全、必需审计或未知生命周期失败时，停止依赖它的下游。保留首失败；同类未解释失败连续两轮时暂停整批重试，先做最小复现和共同根因诊断。整合前的准确 ref/HEAD 与原工作树是恢复依据，原始证据保留。

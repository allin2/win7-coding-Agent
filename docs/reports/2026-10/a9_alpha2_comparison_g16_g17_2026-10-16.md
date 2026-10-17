# Alpha 2 只读对照：G16、G17（2026-10-16）

```text
Status: COMPARISON_DELIVERED_OWNER_RULED_ADR_0241
Evidence: 开发机（文档与冻结 ZIP 只读对照；跨版本数据库差分执行）；未在 Win7 实机验证
Binds: WIN7-42 source 94385a87… ZIP 3b6e0b72… → WIN7-45 source ba042757… ZIP ae1d4bb1… run 5773470e…
Authorization: 负责人 2026-10-16 回复“G16 和 G17 先做只读对照再定”（ADR-0240）
```

结论：G16 建议登记为 `N/A`（不适用于 Alpha 2，只关闭 A8 的历史验收行）。G17 不能整行延期，也不能整行继承。包闭包、SBOM 与许可证文件有 Win7 实机直接证据，双构建有开发机记录，均不重测。升级与回退在 WIN7-45 上没有 Win7 实机证据；开发机差分 13 项接口调用无异常，但发现两处回退差异（第 4.3 节 R-1、R-2）。DPAPI、备份生成、诊断包导出和 SBOM 内容适用性建议延期到 RC。

本报告只做对照。不改产品、不连接目标机、不批准任何继承（ADR-0155 仍 Proposed），不改变门 B 结论（ADR-0238）、F-01（ADR-0239）和 Q2 的登记（ADR-0240）。前两份分析见[G04/G05/G07/G08/G09](a9_alpha2_impact_analysis_g04_g05_g07_g08_g09_2026-10-16.md)与[G11/G12/G14](a9_alpha2_impact_analysis_g11_g12_g14_2026-10-16.md)。

## 1. 逐行结论

| 行 | 对照结论 | 建议处置 | 需要负责人裁决 |
|---|---|---|---|
| G16 A8-06 外部验收与历史 Phase Gate | A8 已被 ADR-0089 冻结，不继承其 Win10、Win7、RC 结论。A8-06 的合同对象是 `0.2.0-alpha.1`。A9 有自己的打包条目 A9PKG-01 和 Win7 硬门（A9 任务书 §7.2） | 登记为 `N/A` | 是 |
| G17-a 包闭包、双构建、SBOM 与许可证文件 | 包闭包与普通用户加载有 WIN7-45 Win7 实机直接证据；双构建是 macOS 开发机记录（同一主机） | 不重测 | 否 |
| G17-b 升级、回退与损坏库恢复 | WIN7-45 无 Win7 实机证据；开发机差分 13 项接口调用无异常；回退有两处差异 R-1、R-2 | 补一个最小 Win7 组（暂称 M6），或延期 | 是 |
| G17-c DPAPI、备份生成、诊断包导出、SBOM 内容适用性 | DPAPI 相关文件与 WIN7-42 相同，旧 Win7 证据来自 Alpha 1 候选；备份在同 schema 重开时不触发；诊断包导出入口本次未检索到；SBOM 内容未审查 | 延期到 RC，登记已知限制 | 是 |

## 2. G16：A8-06 对照

### 2.1 事实

| 项 | 内容 | 来源 |
|---|---|---|
| A8-06 对象 | `0.2.0-alpha.1` 的确定性候选装配、输入闭包、manifest、SBOM、许可证和三层验收模板 | [A8-06 合同](../../prds/A8_06_DETERMINISTIC_PACKAGE_AND_VALIDATION_CONTRACT.md) §1 |
| A8-06 门的含义 | 只表示开发机候选和验收准备完成，不代表 A8 三层产品验收通过 | [任务索引](../../tasks/README.md) A8 行 |
| A8 的地位 | 冻结为历史 Review-first 产品线，不继承其未完成的 Win10、Win7、RC 结论 | ADR-0089 决策（1） |
| 历史 Phase 1/2 | Python 历史冻结合同，只作追溯 | `CLAUDE.md` 长期约束 |
| A8 验收状态 | 三层验收 `NOT_PERFORMED`，没有被任何 A9 结论覆盖 | 任务索引 A8 行 |

### 2.2 A8-06 条款与 A9 对应物

| A8-06 条款 | A9 对应物 | 在 Alpha 2 的证据 |
|---|---|---|
| 确定性候选装配 | A9PKG-01、`release/win7-product-v3` | WIN7-45 `DOUBLE_BUILD.json`：两个干净 worktree 的 ZIP 字节相同（开发机，同一 macOS 主机；跨机器可复现 `UNKNOWN`） |
| manifest、SBOM、许可证 | PRD A9-D02 第二条、A9PKG-01 | 第 3 节 |
| 输入闭包与哈希锁 | `a9-batch2-input-lock.json`、`a9-v26-approved-build-kits.json` | 候选目录内文件存在；本次未重新核对其内容 |
| SBOM 逐项记录版本、SHA-256、许可证、来源和 EOL 说明（§4） | A9 SBOM 9 个组件，各有版本、1 个哈希、许可证；EOL 说明在 `THIRD_PARTY_LICENSES.md` | “来源”字段与逐项内容本次未核对，`UNKNOWN` |
| ZIP 固定 epoch、排序、UTF-8 路径（§4） | 双构建字节相同 | 固定 epoch 等细节本次未核对 |
| 验证套件锁定命令、expected case IDs、hash 双向核对、失败回收（§4） | `A9_BATCH2_VALIDATION_KIT.json` | 候选目录内文件存在；内容本次未核对 |
| 目标环境不依赖外部 `node.exe`（§4） | A9PKG-01 “无系统 Node” | WIN7-45 的 Win7 实机加载；细节以 A9-33 记录为准 |
| A8K-05 安装、并行共存、升级、故障回滚、卸载说明 | PRD A9-D02 第一条、G17-b | 升级与回退见第 4 节；并行共存与卸载说明在 A9 任务书和 PRD 中本次未检索到对应条目，`UNKNOWN` |
| 三层验收模板 | A9 任务书 §7.1（Win10 非阻塞）、§7.2（Win7 硬门）、ADR-0097 增量复验 | 以 A9 任务书与 STATUS 为准 |
| 开发机、Win10、Win7 三层结论 | A9 自己的三层，绑定 `0.3.0-alpha.x` 候选 | 以 STATUS 与各任务书为准 |

### 2.3 选项与推荐

| 选项 | 内容 | 影响 |
|---|---|---|
| A（推荐） | 登记 G16 为 `N/A`：A8-06 不适用于 Alpha 2，A8 保持冻结，其 `NOT_PERFORMED` 不改 | 不新增 Win7 动作；缺口表 G16 关闭；A8 的未验收状态继续存在，不写 PASS |
| B | 登记为延期到 RC | G16 在 RC 前仍要判断一次适用性，没有新信息支持这样做 |
| C | 从 A8-06 摘取条款纳入 Alpha 2 | 每条都要先说明为何 A9PKG-01 与 §7.2 不够。本次对照把 A8-06 §4、§5 的条款逐项映射（第 2.2 节），已有 A9 对应物的不摘取，没有对应物的列为观察 O-03 |

推荐 A。理由：A8-06 的对象是另一个版本号，ADR-0089 已明确不继承，A9 的打包与硬门有独立条目。`N/A` 只关闭 A8 的历史验收行，不表示 A9 同类义务已全部覆盖：并行共存与卸载说明、SBOM 来源字段、验证套件内容仍 `UNKNOWN`，由 G17 与观察 O-03 承接。

## 3. G17-a、G17-c：包、SBOM、DPAPI、诊断包

下表为只读检查结果（开发机）：读取 WIN7-45 与 WIN7-42 的 ZIP、候选记录和源码。

| 项 | 观察 | 状态 |
|---|---|---|
| ZIP 条目与 manifest | WIN7-45 ZIP 800 条目；原独审复核了 799 个 manifest 文件的物理闭包（缺口表 §7.2） | 直接证据，不重测 |
| 普通用户实际加载 | `B2-G1-PACKAGE`，Win7 实机，WIN7-45 | 直接证据 |
| 双构建 | `DOUBLE_BUILD.json`：`zip_bytes_equal` 为 true，同一主机，跨机器可复现 `UNKNOWN` | 开发机证据 |
| SBOM | `SBOM.cdx.json`，CycloneDX 1.5，9 个组件，每个组件 1 个哈希；组件为 Electron、D-013 helper、better-sqlite3、SQLite 和 5 个 ajv 闭包库 | 文件存在已校验 |
| 许可证 | `THIRD_PARTY_LICENSES.md` 5 行；`LICENSES.chromium.html`、`LICENSE` 存在 | 文件存在已校验 |
| SBOM 内容适用性 | 是否覆盖实际运行闭包、是否满足 D-012 的许可证闭包语义，本次未审查 | `UNKNOWN` |
| `credential-vault.js` | 两个 ZIP 内同字节（`3a7850bb…`） | 开发机，SURROGATE |
| 草稿加密相关代码行 | `a9-agent-runtime.js`、`main.js` 中含 `safeStorage`、`DPAPI`、`draft`、`diagnostic` 的行，除续跑回合新增一行 `diagnostic` 外，两版相同 | 开发机行级比较，不证明语义不变 |
| DPAPI 实机证据 | Alpha 1 的 WIN7-17/18 有“DPAPI 草稿密文与可见内存降级”，WIN7-19 按 ADR-0097 继承；WIN7-45 没有 | 非当前候选直接证据 |
| A9GW-03（保存、清除、损坏、账户不匹配、日志扫描） | 当前候选 `NOT_PERFORMED` | 缺口 |
| 诊断显示 | 应用内诊断抽屉与 `getDiagnostics` 存在；`main.js` 自检含“秘密不出现在诊断中”检查 | 源码事实，Win7 现场 `UNKNOWN` |
| 诊断包导出 | PRD A9-D02 第三条写“支持导出本地脱敏诊断包”。本次在 `src/shell/product/*.js` 检索导出入口，未找到 | `UNKNOWN`，见观察 O-01 |
| 数据库受限诊断模式 | `A9_DIAGNOSTICS_MODE`：数据库受限时拒绝提交任务；WIN7-45 未触发 | 现场 `NOT_PERFORMED` |

建议：G17-c 延期到 RC，登记为 Alpha 2 已知限制。DPAPI 草稿一项若要继承 WIN7-17/18 证据，除 ADR-0155 批准外，还须逐项核对原报告、组件、运行时、配置和调用链是否适用于 WIN7-45（A9 任务书 §7.2 末段的增量复验条件）。WIN7-17/18 的 ZIP 不在开发机，本次无法完成这项核对；条件未满足前，DPAPI 在 WIN7-45 上保持 `NOT_PERFORMED`，继承后也不得写成当前候选直接 PASS。

## 4. G17-b：升级与回退

### 4.1 要求来源

| 来源 | 内容 |
|---|---|
| PRD A9-D02 第一条 | 新版本解压到新目录并读取旧用户数据，旧目录可直接回退 |
| A9 任务书 §7.2 | “SQLite 重启、损坏备份和旧版回退” |
| A9S-01 | A9 迁移、活动任务中断、checkpoint、损坏只读恢复和保留策略 |

### 4.2 现有证据

| 证据 | 层级与候选 | 覆盖 |
|---|---|---|
| WIN7-17/18，经 WIN7-19 收口继承 | Win7 实机，Alpha 1 候选 | schema v3→v4 备份、回滚和 fail-closed |
| `B2-CH-04`、E03 `04-restart-counters.json` | Win7 实机，WIN7-45 | 中断后重启（间接）；不含跨版本数据 |
| `A9_SCHEMA_VERSION` | 两个 ZIP 都是 4 | 无 schema 升级 |
| 持久层打开、迁移、备份、建表 | 两个 ZIP 的 `a9-persistence.js` 前 915 行逐字节相同；14 处差异全部在第 915 行之后（新增恢复方法、事实读取、托管进程读写、保留与路径比较） | 开发机字节比较。WIN7-19 的 ZIP 不在开发机，WIN7-19 到 WIN7-42 是否相同 `UNKNOWN` |
| 迁移备份的触发条件 | `requiresMigrationBackup` 只在内嵌 A8 数据、旧 schema 版本或 `win7_19_legacy` 配置时为真；同为 v4 的 WIN7-42 与 WIN7-45 互相重开不触发备份 | 源码事实。备份生成不在本次差分内 |
| 开发机跨版本差分（本次执行） | 开发机，SURROGATE | 见 4.3 |
| WIN7-42 数据由 WIN7-45 打开；WIN7-45 数据由旧目录打开 | Win7 实机 | `NOT_PERFORMED` |
| 损坏库的只读恢复 | Win7 实机，WIN7-45 | `NOT_PERFORMED` |

### 4.3 开发机跨版本差分

执行者：执行代理。环境：Node v20.17.0（macOS）加 better-sqlite3（SQLite 3.43.1）。目标机是 Electron 22 / Node 16 / Windows 7，所以这是 SURROGATE。方法：一个版本的 `A9PersistenceManager` 向临时 SQLite 文件写数据，关闭后由另一个版本打开同一文件，调用 13 项接口：11 个读取接口（`listConversations`、`getActiveConversationId`、`listConversationFacts`、`listConversationFactPage`、`hasConversationFacts`、`listInterruptions`、`listRecentCheckpoints`、`getCheckpoint`、`listManagedProcesses`、`listSessionEvents`、`countEvents`）和 2 个修改状态的接口（`markInterruptionsOnRestart`、`enforceRetention`）。

| 场景 | 写入 | 读取 | 打开状态 | 接口异常 |
|---|---|---|---|---|
| 对照 1 | WIN7-42 | WIN7-42 | ready | 0 |
| 对照 2 | WIN7-45 通用数据 | WIN7-45 | ready | 0 |
| 升级 | WIN7-42 | WIN7-45 | ready | 0 |
| 回退 1 | WIN7-45 通用数据 | WIN7-42 | ready | 0 |
| 回退 2 | WIN7-45 通用数据加 WIN7-45 专有数据 | WIN7-42 | ready | 0 |
| 对照 3 | WIN7-45 通用数据加 WIN7-45 专有数据 | WIN7-45 | ready | 0 |

WIN7-45 专有数据指：托管进程归属事件、`running_unknown` 输入（同时 `cleanupRequired:true`，持久层存为 `cleanup_required`）、`tool_output` 事件、续跑回合。

观察到的结果：

1. 13 项接口调用在 6 个场景都没有抛出异常。脚本只保存条数和标志，所以“摘要相同”只覆盖这些摘要：升级场景的摘要与同版本对照相同；回退 1（通用数据）事件数 5、中断数 2，回退 2（含 WIN7-45 专有数据）事件数 9、中断数 4，均与 WIN7-45 自读相同。内容级差异见 R-1、R-2。
2. 两个修改状态的接口在所有场景返回 0。夹具里没有待中断的活动实体，也没有过期事件，所以这两个 0 不能证明重启中断或保留清理的实际行为。
3. **R-1 句柄清理判定不同**：句柄 `h2`（`start_process` 启动、持久化状态 `running`、归属状态 `owned`）。WIN7-45 读出 `cleanupRequired=true`，WIN7-42 读出 `cleanupRequired=false`。原因：WIN7-45 的 `listManagedProcesses` 把“状态为 starting 或 running 且归属事件为 owned”算作需要清理；WIN7-42 只认存储状态 `cleanup_required`，而 WIN7-45 写入时对这类句柄存的是 `running`。`h3`（由 `running_unknown` 输入生成，存为 `cleanup_required`）两版都读出需要清理，这不能证明直接存为 `running_unknown` 的状态被覆盖。
4. **R-2 续跑后的任务目标不同**：任务 `task2` 先有原目标请求，再有续跑请求（载荷带 `interruptedTurnId`）。WIN7-45 的 `listConversationFacts` 排除带 `interruptedTurnId` 的请求，读出原目标；WIN7-42 不排除，用最新请求覆盖，读出续跑提示词。探针 `facts-probe.cjs` 用原目标 `ORIGINAL GOAL two` 和续跑提示词 `continue prompt` 复现：WIN7-45 读出前者，WIN7-42 读出后者。

R-1 的触发条件是持久化中存在 `starting` 或 `running` 且 `owned` 的句柄，不要求进程当时仍存活。WIN7-42 的恢复入口对 `running` 或 `starting` 且有 PID 的句柄仍会尝试接管（`a9-agent-runtime.js`），所以 WIN7-42 读出 `cleanupRequired=false` 不等于它会忽略该句柄。接管后的清理后果 `UNKNOWN`。A9-34 已登记“恢复后无产品内清理出口，手工恢复办法 `UNKNOWN`”，所以 M6 的现场回收成本也 `UNKNOWN`。

R-2 的影响面：回退到 WIN7-42 后，历史中被续跑过的任务以续跑提示词作为目标显示。该内容是否进入发给模型的文本上下文，`UNKNOWN`。

R-1、R-2 在 Win7 实机均 `NOT_PERFORMED`。

未覆盖：Windows 文件锁与路径形式、Electron 22 / Node 16 的 better-sqlite3 构建、真实用户数据目录、迁移备份文件的生成、真实 Shell 与 helper 进程、回退后 UI 表现、异常中断与正常停止的差别。

脚本、结果、探针与独立审核输出保存在候选外 `preparation/alpha2-comparison-g16-g17-20261016-01/`。结果文件 SHA-256 `c68b4687…`，脚本 `33d54bca…`，探针 `04d6aa73…`，探针输出 `976e3376…`。首轮运行中，两个 WIN7-45 专有数据场景因脚本里 `tool_output` 载荷缺字段被拒（`A9_OUTPUT_EVENT_INVALID`），修正后重跑；归档的是修正后的运行。

## 5. 观察

| 编号 | 观察 | 处置建议 |
|---|---|---|
| O-01 | PRD A9-D02 要求“导出本地脱敏诊断包”，本次检索未找到导出入口，只找到应用内诊断显示 | 不改合同。是否算缺口由负责人裁决；建议并入 G17-c 的延期登记 |
| O-02 | 回退目录的选择：`.acceptance/candidates/` 下只有 WIN7-41、42、43、45 的 ZIP，没有 Alpha 1 候选 WIN7-19、WIN7-22 的 ZIP。M6 若要验证“回退到上一个正式 Alpha”，需先取得该 ZIP；WIN7-19 的 `win7_19_legacy` 配置在重开时还会触发迁移和备份，覆盖范围随回退目标变化 | 在 M6 方案里指定回退目标；本报告不假设 |
| O-03 | A8-06 的并行共存、卸载说明、SBOM “来源”字段、验证套件内容，在 A9 侧本次未找到对应条目或未核对 | 不并入 G16。负责人可选择并入 G17-c 的延期登记 |

## 6. 待裁决（W11 格式）

### 问题一：G16 如何处置

选项见第 2.3 节。推荐 A，登记为 `N/A`。

### 问题二：G17 如何处置

| 选项 | 内容 | 影响 |
|---|---|---|
| A | G17-b、G17-c 全部延期到 RC，登记为 Alpha 2 已知限制 | 不新增 Win7 动作。完整 Alpha 2 结论必须写明：升级、回退、备份、R-1、R-2 未在 WIN7-45 实机验证 |
| B（推荐） | G17-b 补最小 Win7 组 M6；G17-c 延期到 RC 并登记 | 要新增一组实机，需 A9-36 增补、新的门 A 和执行授权，候选仍是冻结的 WIN7-45。M6 内容：WIN7-42 数据由 WIN7-45 打开；WIN7-45 数据由旧目录打开，核对历史内容与续跑任务的目标（R-2）、`start_process` 句柄的状态与回收（R-1）；损坏库的只读恢复。M6 不含备份生成：同 schema 重开不触发备份，备份归 G17-c。M6 开始前须先指定回退目标（O-02）和 R-1 句柄的回收方案（A9-34 限制） |
| C | 在 B 之上，再补 DPAPI（A9GW-03）实机组，并让 M6 含备份子场景 | 比 B 多一组实机，覆盖 DPAPI 在 WIN7-45 上的保存、清除、损坏、账户不匹配，以及迁移备份的生成、哈希和失败保护；备份子场景需要旧 schema 数据或 WIN7-19 候选，当前开发机没有 |

推荐 B。理由：升级与回退写在 PRD A9-D02 和 A9 任务书 §7.2 的 Win7 硬门里，WIN7-45 上没有对应实机证据，且开发机已发现 R-1、R-2，只有实机才能判定其后果。DPAPI 相关文件与 WIN7-42 相同，备份触发依赖旧 schema 数据，二者的补证成本更高，延期到 RC 登记。

两个问题的提问：G16 选 A、G17 选 B，是否按推荐裁决？

## 7. 本报告未做的事

- 未在 Win7 实机执行任何动作。
- 未审查 SBOM 的内容适用性，未核对验证套件内容和 ZIP 固定 epoch 细节。
- 未批准继承，未新增或修改产品文件。
- 未决定 M6 是否纳入 A9-36，A9-36 仍是草案。
- 独立审核由 codex 完成一轮（read-only，输出 SHA-256 `82d0a11e…`）。8 条发现经执行代理复核后全部采纳：续跑目标差异（R-2）、双构建层级更正、备份覆盖范围、R-1 触发条件、接口分类与计数、DPAPI 继承条件、G16 条款映射。

## 8. 裁决（2026-10-16）

负责人回复：“G16 按推荐登记为 N/A；G17 按推荐：升级回退补最小 Win7 组 M6，DPAPI、备份生成、诊断包导出、SBOM 内容适用性延期到 RC 并登记已知限制。请登记 ADR 和缺口表。” 决定见 ADR-0241。第 6 节保留为裁决前的提问快照。

| 项 | 处置 |
|---|---|
| G16 | 登记为 `N/A`，只关闭 A8 的历史验收行 |
| G17-a | 不重测 |
| G17-b | 补最小 Win7 组 M6，不含备份生成；待并入 A9-36 草案，未批准执行 |
| G17-c | DPAPI、备份生成、诊断包导出、SBOM 内容适用性登记为 Alpha 2 已知限制，延期到 RC |
| R-1、R-2 | 作为 M6 核对项保留，不改产品，是否修复未裁决 |
| O-03 | 保持 `UNKNOWN`，未登记为限制 |

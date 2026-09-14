# WIN7-29 候选合同提案（A9-16 UI 子集 + A9-17 启动优化）

```text
Document Type: PROPOSAL
Status: PROPOSAL_NOT_FROZEN — 等待项目负责人冻结候选 ID、变更范围与授权
Prepared: 2026-09-14
Branch: codex/a9-alpha2
Baseline: 7d067890b1f54ab8bcde6bdbc5ea778d9e79c1ed
Supersedes: 无
```

本文只提出候选合同草案，**不构成实现、提交、推送、打包、部署或验收授权**。冻结前不得据此构建任何包。

## 1. 为什么需要一份新候选合同

A9-16 与 A9-17 当前都只有**实现授权**，没有候选合同：

| 事实 | 证据 |
|---|---|
| 两份任务书均 `Win7-Validation: NOT_PERFORMED` | `docs/tasks/A9_16_*.md`、`A9_17_*.md` 头部 |
| `RELEASE_PROFILES` 只到 `A9-15-INPUTS-UI-PROGRESS-WIN7-28` | `scripts/release/build-a9-product-v3.mjs:31-84` |
| 仓库内不存在 `WIN7-29` / `A9-16-INPUTS` / `A9-17-INPUTS` 任何引用 | 全 `release/` 检索为空 |
| 不存在 A9-16/A9-17 的 input lock、validation kit、validation doc | `release/win7-product-v3/` 仅 W23～W28 |
| 两份 ADR 均写明「不授权提交、推送或部署」 | ADR-0123、ADR-0124 后果段 |

没有候选合同就无法产出 `external_acceptance_eligible` 的包，也就无法进行任何正式 Win7 验收。

## 2. 待负责人裁决的两项

**裁决项 A — 候选粒度。** 二选一：

- **A1（单候选）**：A9-16 UI 子集与 A9-17 启动优化合并为同一候选 `WIN7-29`。优点是一次构建覆盖两项；
  代价是两项改动的实机结论互相耦合，任一项失败都会污染整包归因。
- **A2（双候选）**：`WIN7-29`（A9-16 UI）与 `WIN7-30`（A9-17 启动）各自独立。归因清晰，符合
  ADR-0116/0118/0119/0120/0121 一路「一候选一变更范围」的先例；代价是两次双干净构建与两套工件。

**推荐 A2**，与既有先例一致；且 A9-17 的 Win7 部分是 PowerShell/WMI 采样（`a9-startup-baseline/**`），
未必需要产品候选 ZIP，可与其自身授权解耦。

**裁决项 B — 候选 ID 与授权范围。** 确认候选 ID、对应 ADR 编号（下一个为 **ADR-0125**）、
以及解除 A9-16 §6 / A9-17 §1 的「不提交」约束。

## 3. 需要产出的工件（对照 WIN7-28 先例）

以 A2 单候选 `WIN7-29` 为例，需新增：

| # | 工件 | 路径 | 说明 |
|---|---|---|---|
| 1 | 输入锁 | `release/win7-product-v3/a9-16-win7-29-input-lock.json` | 见 §4 草案 |
| 2 | 构建 profile | `scripts/release/build-a9-product-v3.mjs` 新增 `A9-16-INPUTS-...-WIN7-29` 条目 | `task` / `candidate` / `lockFile` / `kitFile` / `validationDoc` / `integrityCommand` / `reportCommand` / `integrityScript` / `reportScript` / `evidenceDirectory` |
| 3 | 验收文档 | `release/win7-product-v3/A9_16_WIN7_29_VALIDATION.md` | 现场步骤与 Go/No-Go |
| 4 | 完整性入口 | `release/win7-product-v3/RUN_A9_16_W29_INTEGRITY.cmd` | 绑定 ZIP/manifest/正式锁 |
| 5 | 报告校验入口 | `release/win7-product-v3/RUN_WIN7_29_REPORT_VERIFY.cmd` | 报告 schema 校验 |
| 6 | 完整性脚本 | `release/win7-product-v3/a9-package-integrity-w29.cjs` | 由 w28 派生 |
| 7 | 报告脚本 | `release/win7-product-v3/a9-win7-29-report.cjs` | 由 w28 派生 |
| 8 | smoke 脚本 | `release/win7-product-v3/a9-win7-29-smoke.cjs` | 若沿用产品 smoke 路径 |
| 9 | ADR | `docs/DECISIONS.md` 新增 ADR-0125 | 不得改写 Accepted ADR 正文 |
| 10 | 状态更新 | `docs/STATUS.md`、`docs/tasks/README.md` | 记录候选与 `NOT_PERFORMED` |

### 3.1 重要修正：这不是"加一条配置"，而是构建管线改动

初版提案把新增候选描述为数据条目。经核对 `scripts/release/build-a9-product-v3.mjs`，**不成立**：
该脚本对每个候选都有**硬编码分支**，新增 `WIN7-29` 必须同时改代码，至少涉及：

| 位置 | 内容 |
|---|---|
| `:88` | `A915_CANDIDATES` 集合成员判定，驱动 driver 打包（`:211-213`）、kit 生成（`:357`）、契约证据拷贝（`:844`）与 kit 内容（`:344`） |
| `:356` `createValidationKit()` | 按候选分支生成验收用例集；`:639` `addsPagingCase` 亦按候选判定 |
| `:641-645` | `decision` 的 ADR 映射（现止于 `WIN7-28 → ADR-0121`），需为 WIN7-29 补 ADR-0125 |
| `:646-650` | `historicalCandidate` 链（现止于 `WIN7-28 → WIN7-27`） |
| `:911-946` | 各候选 `provenance` 文本块（win22～win28），需新增 win29 块 |

因此候选合同的实际工作量包含**发布管线代码改动 + 新 ADR + 一套新的验收用例定义与报告/完整性脚本**，
而不是新增一个 JSON 与一行 profile。这些改动影响发布闭包，按 AGENTS.md §4 必须先冻结候选合同并新增 ADR，
再由具备授权的实现步骤落地。

同时，**A9-17 的 Win7 部分可能不需要产品候选**：其 Win7 验证是 PowerShell/WMI 采样
（`scripts/mvp_acceptance/a9-startup-baseline/**`），任务书 §5 只要求"其自身授权并绑定源码与工件哈希"。
若采用 A2，`WIN7-30` 是否必要应先确认，避免为不需要的产物付出双构建成本。

## 4. 输入锁草案

三件锁定输入中两件已在本机按哈希核验通过，一件缺失（见 §5）。

```json
{
  "schema_version": 1,
  "lock_id": "A9-16-INPUTS-ALPHA2-UI-WIN7-29",
  "release_id": "WIN7-CODING-AGENT-A9-ALPHA2",
  "version": "0.3.0-alpha.2",
  "target": {
    "os": "Windows 7 SP1 build 7601",
    "architecture": "x64",
    "delivery": "SELF_CONTAINED_OFFLINE_WIN7_X64"
  },
  "inputs_are_not_a9_pass": true,
  "inputs": {
    "electron_zip": {
      "filename": "electron-v22.3.27-win32-x64.zip",
      "version": "22.3.27",
      "sha256": "ad723ed7dad32f9459f7a9de1fd6d718cf713c4809c2431503bea62ce8f786e6",
      "required_entry": "electron.exe",
      "required_entry_sha256": "2ed9543796e0962bfcaae175794cfb1b3293f4f9e14fb1c3b37628f7cfd339cb"
    },
    "runner_return_zip": {
      "filename": "WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip",
      "version": "D-013-v25-a9-trusted-shell-current-user",
      "sha256": "7485cf222ef8477141ca9b690a6fde254b8613c31b5ece70ed7d82697499d6d0",
      "required_entry": "output/helper.exe",
      "required_entry_sha256": "c8615e6537460fbb3c5a7a06e266996538977b36a83a3828268e26030134fa31",
      "profile": "D-013-v25-a9-trusted-shell-current-user",
      "protocol_version": 2,
      "runtime_profile": "a9-trusted-shell-current-user-v1",
      "source_commit": "1eb02c254ffd8a4081c984da21f176671c6ce026",
      "build_kit": {
        "revision": "20260903-r15",
        "filename": "WIN7_D013_V25_HELPER_BUILDKIT_20260903-r15.zip",
        "sha256": "2b4192ccaa8036966e7c7122dc88675908967aae4f6333c3ed028b70cdf61a1c",
        "source_commit": "1eb02c254ffd8a4081c984da21f176671c6ce026",
        "input_lock_sha256": "494e893995f3fd045f36021f7699834a4ae15f73151261327162cc7cca53dd4b",
        "package_manifest_sha256": "2692fff98d1f2b9da3a40506801839d1d822a6e07608def5ad67dc43850ec03b"
      },
      "approval_registry": {
        "commit": "e1b6f4bf30ad2ae7576aa958317e0aea6f4338d3",
        "sha256": "d9cfea73c2f89c01a33a2bbef1d65c27eb995cd3681c71a939183348744917b7",
        "path": "release/win7-product-v3/a9-v25-approved-kits.json"
      },
      "provenance": "A9-16 reuses the immutable WIN7-22-approved D-013 v25 native input by exact hash; no native source or helper byte changed."
    },
    "storage_return_zip": {
      "filename": "WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip",
      "version": "8.7.0",
      "sha256": "2cb0cd324bb449fb5457549addd3e7f8f0610d6258415309ee748fb279a72794",
      "required_entry": "output/runtime/node_modules/better-sqlite3/build/Release/better_sqlite3.node",
      "required_entry_sha256": "7138aa2365e0027ced9bc8ae356097b31776d084a5a8f91cc2d3677785e915cc",
      "sqlite": "3.43.1",
      "electron_abi": 110,
      "profile": "E22-SQLITE343-LOCAL-SSD"
    }
  },
  "gates": {
    "developer_package_integrity": "NOT_PERFORMED",
    "product_assembly": "NOT_PERFORMED",
    "win10": "INHERITED_NATIVE_INPUTS_FROM_WIN7_22_EXACT_HASH",
    "win7": "NOT_PERFORMED_WIN7_29",
    "alpha": "NOT_PERFORMED"
  }
}
```

`electron_zip` 与 `storage_return_zip` 的哈希已在本机实测匹配；`runner_return_zip` 及其 `build_kit`
的字段沿用 WIN7-28 锁的原值，**但对应文件当前不在本机**（§5），冻结前必须由负责人提供并二次核验。

## 5. 锁定输入状态（2026-09-14 已解除阻断）

三件锁定输入现已全部在位并逐项核验通过：

| 输入 | 状态 |
|---|---|
| `electron-v22.3.27-win32-x64.zip` | ✅ 在位，sha 精确匹配 `ad723ed7…86e6` |
| `WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip` | ✅ 在位，sha 精确匹配 `2cb0cd32…2794` |
| `WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip` | ✅ **已从私有归档恢复**，见下 |
| `WIN7_D013_V25_HELPER_BUILDKIT_20260903-r15.zip` | ✅ **已从私有归档恢复**，sha `2b4192cc…61a1c` |

### 5.1 恢复来源与完整核验链

该 ZIP 本体不在产品 Git 历史中（本地/远端 refs、历史对象与 LFS 均无）。恢复路径为私有归档
release `archive-20260911-v2`（仓库 `allin2/win7-coding-agent-archives`）的资产
`20260903-3e458ca.tar.gz.enc`，其 `catalog.json` 记录加密方式为
`openssl enc aes-256-cbc PBKDF2 SHA256 iterations=200000`，密钥为本地专用文件。

核验链（逐级 SHA-256 全部精确匹配，无一步跳过）：

| 环节 | 期望值 | 结果 |
|---|---|---|
| `.enc` 资产本体 | `3423dc66…43da6` | ✅ 匹配 |
| 解密后 `tar.gz` 明文 | `d2e93549…5c9b9` | ✅ 匹配 |
| 归档内 `objects/7485cf22…` 对象 | — | ✅ 存在 |
| 恢复出的 ARTIFACTS ZIP | `7485cf22…99d6d0` | ✅ 匹配 |
| ZIP 内 `output/helper.exe` | `c8615e65…34fa31` | ✅ 匹配 |
| r15 BUILDKIT | `2b4192cc…61a1c` | ✅ 匹配 |
| 随包 `.sha256` sidecar | — | ✅ 与 ZIP 哈希一致 |

归档为内容寻址存储（`objects/<sha256>`），`ARCHIVE-MANIFEST.json` 提供
`路径 → sha256` 映射；恢复时按清单逐文件比对。

### 5.2 恢复落点

```
.acceptance/deps/d013-v25-r15/
├─ WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip        (183,796 B, a 组，锁定的正式输入)
├─ WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip.sha256
├─ WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084214.zip        (183,808 B, b 组，锁的 reproducible_builds[1])
├─ WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084214.zip.sha256
├─ WIN7_D013_V25_HELPER_BUILDKIT_20260903-r15.zip            (86,071 B)
└─ WIN7_D013_V25_HELPER_BUILDKIT_20260903-r15.zip.sha256
```

`.acceptance/` 已被 gitignore，故恢复物不进入交付基线。两组 ARTIFACTS 均保留，以支持锁中
`reproducible_builds` 的双构建交叉核对。

**注意**：本次恢复只解除"输入缺失"这一项。候选仍需 §2 的裁决与 §3 的工件，方可构建。

## 6. 验证合同草案

### 6.1 A9-16（UI 子集）

本轮范围仅 §7 冻结的 U01–U07，Review（R01–R05）与 Shell 运行中输出（S01–S06）**不在候选内**，
Review 入口维持 disabled + fail-closed（ADR-0096 / ADR-0124 不变）。

Win7 实机必须覆盖当前唯一的未验证项：

- **1366×768 × 125% DPI** 真实 DPI 复核。STATUS 已记录：开发机用 Chromium 缩放代理时仅 1 条完整
  对话行，**不等于真实 DPI**，是首要复核项。
- 桌面四态（双侧开关的四种组合）切换后 `scrollWidth`/`scrollHeight` 无溢出、`aria-expanded` 与
  视觉一致、切换不重建对话 DOM（U03–U05）。
- 跨断点回归：1200px / 800px 两侧缩放只做状态机收敛，不得在桌面断点折叠侧栏（U06）。
- 左栏行容量：最坏形态（2 组头 + 归档区）下完整可见行数。
- 证据必须来自普通用户 `dccs-chaizl-pc\agent`、Medium、非提升桌面令牌。

### 6.2 A9-17（启动与内存）

按 A9-17 §4：同版本 Electron 最小窗口、产品空历史、产品真实历史**三组**；冷/热启动各**至少三次**；
同机器/窗口/GPU/安全设置，记录首屏、可交互、首次发送、峰值和稳态。

- 采样复用只读 `a9_win7_memory_baseline.ps1`（既有 WMI/PowerShell 口径），不得与开发机
  `app.getAppMetrics()` 口径交叉比较或换算。
- 执行包位于 `scripts/mvp_acceptance/a9-startup-baseline/**`，**须其自身授权并绑定源码与工件哈希**。
- 未执行不得声称降幅、内存达标或 Win7 PASS。

## 7. 冻结后的执行顺序

1. 负责人确认裁决项 A / B，新增 ADR-0125。
2. 解除「不提交」约束，把在制改动冻结为本地提交（不推送）。
3. 产出 §3 的工件 1–8。
4. 从**提交后的两个独立干净工作树**各构建一次并逐字节比较（`README.md` 硬要求）。
5. 候选哈希形成后，创建候选外独立 `WIN7_29_RELEASE_AUTHORITY` 与 SHA-256 pin。
6. 解压同一 ZIP 到 Win7 全新目录，在包外建证据目录，以普通用户非提升令牌执行 §6。
7. 报告与裁决；未执行项保持 `NOT_PERFORMED`。

**`--allow-uncommitted` 不可用于正式候选**：manifest 会记 `source_dirty: true` 与
`external_acceptance_eligible: false`，不得据以签发 Win10 / Win7 / Alpha PASS。

## 8. 当前在制改动现状（供候选范围参考）

分支 `codex/a9-alpha2`，基线 `7d06789`。白名单核对已完成，**无越界文件**：全部代码改动落在 A9-17 §3
允许路径内，三个 renderer 文件同时属于 A9-16 白名单；`docs/**` 按 AGENTS.md §4 不受实现白名单限制。

门禁现状（2026-09-14 复核，**全部在 Node 20.10.0 / ABI 115 下取得**）：

| 门禁 | 结果 |
|---|---|
| A9-16 §7 `a9-workbench-contract` | **PASS 29/29**（含 5 项 U01–U07 契约用例） |
| A9-17 state 包全量 | **PASS 302/302，20/20 套件** |
| A9-17 shell 定向（5 套件） | **PASS 67/68**；1 项见下 |
| shell lint（`tsc --noEmit` + 全部 `node --check`） | **PASS**，零诊断 |
| `git diff --check` | **PASS** |
| `docs:check` | 73 处失败全部位于已被 gitignore 的 `outputs/a9-18-…/input-snapshot/**`，属既有噪声；真实 `docs/` 零新增 |

**唯一未闭合项（1/68）**：`a9-product-contract.test.ts` 的
`delivers explicit Chinese encodings, binary metadata and large-file ranges through the real A9 product loop`
触发 jest 默认 **5000 ms 超时**。该用例真实耗时约 5–9 s；以 `--testTimeout=120000` 复跑**通过**，
断言全部成立。判定为**阈值/环境时序问题，不是行为回归**；冻结前建议由负责人决定是放宽该用例超时
还是维持现状，不应静默改测试。

**方法学警示（务必沿用）**：本仓库的原生绑定
`node_modules/better-sqlite3/build/Release/better_sqlite3.node` 编译目标是
**NODE_MODULE_VERSION 115（Node 20）**，而托管运行时为 Node 22（ABI 127）。用 Node 22 跑测试会因
绑定加载失败导致 A9 持久层不可用，产品按设计 fail-closed 进入 `createDiagnosticsRuntime()`
（`src/shell/product/a9-agent-runtime.js:2300-2334`），表现为 state 55 项 + shell 48 项失败。
**这是工具链 ABI 不匹配，不是代码回归，也不是沙箱问题。** 复跑方式：

```sh
cd src/state && /usr/local/bin/node node_modules/jest/bin/jest.js --runInBand
cd src/shell && /usr/local/bin/node node_modules/jest/bin/jest.js --runInBand <套件名…>
```


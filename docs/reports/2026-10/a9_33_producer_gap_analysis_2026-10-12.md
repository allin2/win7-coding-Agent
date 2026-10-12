# A9-33 生产者缺口分析（2026-10-12）

生产者缺口已按开发机只读分析列明，绑定提交 `d8fd760a1c283b638996bde50c90fc7d2d139ccb`。A9-33 保持 DRAFT_READY_FOR_REVIEW。
本报告没有执行产品构建、测试、Electron 或远端命令。

## 1. 基线、授权与证据入口

隔离树为 `/Users/qlyf/.codex/worktrees/a9-32-explicit-continue/win7-coding-Agent`。
分支为 `codex/a9-32-explicit-continue`。父提交为 `571ec550b5e09611f55557563d0cf2f1a4a40d1b`。
本轮开始时 porcelain 为空；没有推送操作。只读事实见 `.acceptance/a9-32-developer/producer-readonly-analysis-r3.json`。
完整起始/最终保护事实见同根 `protected-boundary-check-r3.json`。
最终文档字节与提交请求清单见同根 `docs-bundle-manifest-r1.json`。
F5 原授权来源及 ADR-0189 措辞/编号均待负责人确认。

隔离树缺少 OUTPUT_STYLE、GLOSSARY 与验收规范。本轮只读使用主工作区同名文件。
未将这些规范复制或同步进隔离树。规划同时读取全局增量验收规范；具体任务合同优先。
当前前置仍按 [A9-33 §1–5](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md) 与[增量矩阵](../../plans/A9_BATCH_2_INCREMENTAL_VALIDATION.md)。

## 2. D1(a)：干净源码门

开发机代码阅读，绑定 d8fd760a…：`scripts/release/build-a9-product-v3.mjs:485–503` 的 buildA9ProductCandidate 检查完整 40 位 sourceCommit 等于当前 HEAD。
它读取 `git status --porcelain --untracked-files=all`。开发 Profile 只要有 dirty/untracked，或指定 allowUncommitted，就抛 A9_V26_CLEAN_SOURCE_REQUIRED。
干净时还调用 verifyV26CommittedInputs。它不是“只能打包 A9-31 HEAD”的门。
`--allow-uncommitted` 不能用于绕过开发 Profile 的干净门。

`verifyV26CommittedInputs` 在同文件 2465–2497：核对本地批准 registry 与锁定提交字节/hash；匹配预批准 kit；核对独立返回审核及两 run；比较 13 个 native/helper 输入；确认 native source 与 registry commit 都是 HEAD 的祖先。
registry 的三个 SHA 一致：`de75a45050d1c38d168746542fc1837dd4cabbe13769b1fc3a3f33eb125a2e38`。
13 个 helper 输入与锁定源码逐项相同。两个祖先检查退出码均为 0。
这些事实见 r3 JSON；没有调用构建函数。独立返回审核的静态要求见 `scripts/release/a9-v26-return-evidence.mjs:406–417`。

```sh
git -c core.fsmonitor=false rev-parse HEAD HEAD^
git -c core.fsmonitor=false status --porcelain --untracked-files=all
git -c core.fsmonitor=false merge-base --is-ancestor 10114503a1e79706131ea4a11a5b96bd2958807a d8fd760a1c283b638996bde50c90fc7d2d139ccb
git -c core.fsmonitor=false merge-base --is-ancestor dcf541892ec3ee5f5413833206f07efa3f3ee6e2 d8fd760a1c283b638996bde50c90fc7d2d139ccb
```

结论仅为源码门：起始干净 d8fd760a… 满足 A9_V26_CLEAN_SOURCE_REQUIRED 的条件。
其他输入 ZIP、完整装配、运行时与新 Profile 均 NOT_PERFORMED。
写入本轮文档后当前工作区有差异；直接在该脏树构建会被拒绝。
未来须先获得提交授权，再绑定准确干净 source。不能把 d8fd760a… 写成新生产者实现提交。

## 3. D1(b)：逐文件最小变更提案

开发机代码阅读，绑定 d8fd760a…：RELEASE_PROFILES 的协议 3 开发项只有 A9-30 与 A9-31（32–36 行）。
历史正式 WIN7-22～42 使用 v25/协议 2/alpha.1。不是只有两个历史 Profile。
validateA9Lock 在 2231–2244 行只将两个开发 lock_id 转交 v26；正式通路要求 ALPHA1/v25。
runtime 的 validateDescriptor 在 69–93 行把所有协议 3 归入开发状态，并拒绝 release_authority。
当前不能生成或消费正式 batch2。

提案新增 `A9-32-DEVELOPER-INPUTS-D013-V26-MANAGED` 与 `A9-BATCH2-INPUTS-D013-V26-MANAGED` 两个 Profile。
名称均为拟批准常量；未实现。分别使用新开发锁和正式 batch2 锁。
保留 `RUNTIME_MODULES` 七模块、v26 helper Profile、协议 3、ABI110 与 managed revision；不增加依赖或原生能力。
buildRuntimeDistributions 在 2112–2150 行已经在候选外编译七模块，不需要改为读取残留 dist。

| 精确允许路径提案 | 动作 | 最小责任 |
|---|---|---|
| `scripts/release/build-a9-product-v3.mjs` | 修改 | RELEASE_PROFILES；buildA9ProductCandidate、validateA9Lock、validateV26DeveloperLock、verifyV26CommittedInputs、verifyA9ProductZip、verifyA9Manifest、createValidationKit、copyContractEvidence、installationGuide。新增 A9-32 开发及正式 batch2 分支；不借旧开发状态或 authority。 |
| `src/shell/product/a9-package-runtime.js` | 修改 | validateDescriptor：以描述符、manifest、Profile、输入锁身份区分开发与正式 batch2；loadA9PackageRuntime 保留真实路径与哈希核验。 |
| `src/shell/tests/product/a9-batch2-driver-entry.cjs` | 新增 | 新驱动：实际 main/preload/IPC/SQLite/Renderer；CONT/BG/SAFE/UI 与真实退出。不得改 a9-06 驱动判据。 |
| `scripts/release/test/a9-batch2-package.test.mjs` | 新增 | 两个新 Profile 的装配、锁、闭包、authority 与错配反例。 |
| `scripts/release/test/a9-package.test.mjs` | 修改 | 保留历史 Profile；添加新分支的回归与拒绝反例。 |
| `src/shell/tests/product/a9-batch2-contract.test.ts` | 新增 | 阶段闭集、请求上限、身份/审计/生命周期硬门及真实入口合同。 |
| `src/shell/tests/product/a9-package-runtime.test.ts` | 修改 | validateDescriptor 的开发/正式正例及伪装、错锁、错协议、错候选拒绝。 |
| `release/win7-product-v3/a9-32-input-lock.json` | 新增 | A9-32 开发输入身份；引用既有 managed 原生字节，不覆盖 a9-v26-managed-input-lock.json。 |
| `release/win7-product-v3/a9-batch2-input-lock.json` | 新增 | 正式 batch2 输入身份；准确候选号在冻结前重新核号，不从旧开发锁推导正式批准。 |
| `release/win7-product-v3/a9-batch2-package-integrity.cjs` | 新增 | 准确 source/ZIP/manifest/native/锁/authority/pin 与物理闭包核验。 |
| `release/win7-product-v3/a9-batch2-report.cjs` | 新增 | S01–S06/BG/CONT/SAFE/UI 原始证据闭集与故障反例核验。 |
| `release/win7-product-v3/a9-batch2-smoke.cjs` | 新增 | 先最短真实链路，再受影响回归；不把控制器成功当产品成功。 |
| `release/win7-product-v3/a9-batch2-fixtures.cjs` | 新增 | 有界后台、输出、恢复及失败输入；实际运行时先检查新夹具。 |
| `release/win7-product-v3/A9_BATCH2_WIN7_VALIDATION.md` | 新增 | 精确 argv、证据闭集、目标前置与运行时合同；当前不填执行结果。 |
| `release/win7-product-v3/README.md` | 修改 | 登记新 Profile/入口与开发包、正式候选的不同权限。 |
| `release/win7-product-v3/RUN_A9_BATCH2_INTEGRITY.cmd` | 新增 | 仅调用包内 Electron 已声明 Node 模式和完整性脚本。 |
| `release/win7-product-v3/RUN_A9_BATCH2_SMOKE.cmd` | 新增 | 仅调用批准的 phase、run-id 与候选外证据根。 |
| `release/win7-product-v3/RUN_A9_BATCH2_REPORT_VERIFY.cmd` | 新增 | 普通用户复核原始报告闭包；不假设系统 Node。 |
| `release/win7-product-v3/a9-batch2-desktop-controller.ps1` | 新增 | 普通桌面入口、固定请求、期限、次数及失败停止；不执行任意命令。 |
| `release/win7-product-v3/a9-batch2-desktop-request.cjs` | 新增 | 只生成批准 phase 的目标绑定请求；旧请求/批准不能重放。 |

生产者还须处理同一文件中的状态常量与分支：开发 manifest/status（约 667、742、2187 行）、runner streaming_profile（566 行）、SBOM/许可证（595–610 行）、kit/cases（612–652 行）、正式闭包与 createValidationKit（744–798 行）。
新正式分支不能回落到 createWin22ValidationKit。copyContractEvidence 必须带 A9-30/31/32/33 及当前矩阵。
正式锁沿用已核验 v26 原生来源，重新声明正式 provenance；不能把 managed 开发锁改写成正式锁。
`release-contract.mjs` 的 createRunnerManifest 按输入输出；本提案不要求修改该文件。
新增函数/阶段常量的准确命名留给获批实现；严格限定到表中路径。

本表与 [A9-33 §6](../../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md#6-a9-33-批准请求包2026-10-12) 一致，共 20 个精确路径。
相对原 §3 仅补充 `a9-32-input-lock.json`，用于独立开发 Profile，不覆盖 managed 锁。
现有产品缺陷不在白名单内。取证源内嵌绑定需改变时，先提交准确差异，不能借本表改旧取证组件。

## 4. D1(c)：普通入口与工具盘点

开发机只读盘点。主工作区绑定 a53c9b9d… 加既有 dirty/untracked；A9-31 树绑定 571ec550… 加既有 dirty/untracked。
下表 SHA 是本轮读取的磁盘字节；不是新包/新运行结论。完整 bytes/路径见 r3 JSON 的 reuseInventory。

| 文件名与绝对位置 | SHA-256 | 复用判定 |
|---|---|---|
| `/Users/qlyf/Developer/win7-coding-Agent/scripts/release/validation/win10/launch-product-desktop.ps1` | `2a7458ac5e38332e52c257cdb7da55803bb3c533e8cc7ad09dd5ca2782752758` | 只读参考；ENGINEERING_02 绑定与旧入口不可执行或借用。 |
| `/Users/qlyf/Developer/win7-coding-Agent/scripts/release/validation/win10/serve-product-desktop.ps1` | `13443099de0a589c4865cdf41b9e51c80fae4a9f5cea8d6d195b313a9c08b9b0` | 只读参考；ENGINEERING_02 绑定与旧入口不可执行或借用。 |
| `/Users/qlyf/Developer/win7-coding-Agent/scripts/release/validation/win10/stage-product.ps1` | `f0d90a59a87f0e07d6bd26b7cdea458369b605055c95b8abc9a0cc18b778e2a3` | 只读参考；ENGINEERING_02 绑定与旧入口不可执行或借用。 |
| `/Users/qlyf/Developer/win7-coding-Agent/scripts/release/validation/win10/product-driver.cjs` | `bfd9b97e8c02db35ceb699b2cbd23a2989d681037352936af3a1974f0d8775db` | 只读参考；ENGINEERING_02 绑定与旧入口不可执行或借用。 |
| `/Users/qlyf/Developer/win7-coding-Agent/scripts/release/validation/win10/input-binding.cjs` | `6dc6ca5dd14fd2d7f5979f17f168d19a43c921601c126eaadd059c441fc5f578` | 只读参考；ENGINEERING_02 绑定与旧入口不可执行或借用。 |
| `/Users/qlyf/Developer/win7-coding-Agent/scripts/release/validation/win10/exit-dialog-action.cjs` | `5ff76b3ec6224b5af7188040dcdc339981373d6e954f9f40bffa2d4085367f73` | 只读参考；ENGINEERING_02 绑定与旧入口不可执行或借用。 |
| `/Users/qlyf/Developer/win7-coding-Agent/scripts/release/validation/win10/manifest-process-observer.cs` | `0f4ff8fcd9ecdc051d71728445a19e39e3b4f59454258986a48b1f8fcf504496` | 只读参考；ENGINEERING_02 绑定与旧入口不可执行或借用。 |
| `/Users/qlyf/Developer/win7-coding-Agent/scripts/release/validation/win10/launch-manifest-observer.ps1` | `fb8d5c81b4e03b82f064ae4ca5bebb6ec2561b03c4662959319b4520b33fcd36` | 只读参考；ENGINEERING_02 绑定与旧入口不可执行或借用。 |
| `/Users/qlyf/Developer/win7-coding-Agent/scripts/release/validation/win10/start-ordinary-entry-bridge.ps1` | `505ca76ee97c9c4a7b4d7937e2191bba758e020850c34c3accf47896ed6a1718` | 只读参考；ENGINEERING_02 绑定与旧入口不可执行或借用。 |
| `/Users/qlyf/Developer/win7-coding-Agent/scripts/release/validation/report-verifier.cjs` | `a248f48fb3036539a10dd90bc2cbaecd5a449d94e2279041798d457a989ba979` | 只读参考；ENGINEERING_02 绑定与旧入口不可执行或借用。 |
| `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r4-win10-r2/control-scripts/launch-product-r3-desktop.ps1` | `b859bd36a9104b22ab359ece783a1575a35aed74dfab1c18c11660598cd7256f` | 旧根/driver/pin/产品 source 绑定；需新版本重绑。不能运行旧普通入口。 |
| `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r4-win10-r2/control-scripts/serve-product-r3-desktop.ps1` | `80a29258ddae9ba134435fb1ddd171be5f9ba029b0b9a7a9b95f31a4416b2d0d` | 旧根/driver/pin/产品 source 绑定；需新版本重绑。不能运行旧普通入口。 |
| `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r4-win10-r2/control-scripts/stage-product-r3.ps1` | `f41cf571e5706f89e47dbc855b90c608e8d13d3318cd0763b1b3063e8c26d268` | 旧根/driver/pin/产品 source 绑定；需新版本重绑。不能运行旧普通入口。 |
| `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r4-win10-r2/control-scripts/product-r3-driver.cjs` | `24ddd6f68e15c16c57eed40b51203449ab34dae79bd08287dda7658a2a956e37` | 旧根/driver/pin/产品 source 绑定；需新版本重绑。不能运行旧普通入口。 |
| `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r4-win10-r2/capture-built/capture-source.cs` | `dbc85763ce25287adcb4c853e37963755c56d9561f9d06e41f53bfdb78e952cd` | 可提议原样复用源与 DLL；先核 API/配置/上下游及新合同。旧 build 记录不改绑。 |
| `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r4-win10-r2/capture-built/capture-library.dll` | `3f45cc66e7f81c7321bdce4b71338614ceae618d9c0636620a0f47b72d880064` | 可提议原样复用字节；V4 精确 UTC API 仅 Win10，不能在 Win7 加载。 |
| `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r4-win10-r2/capture-built/capture-build.json` | `c5afee88aea36920f7d6a56a35bd136548a993608d5303a034bd6b6ab0a84cca` | 仅原构建来源证据；保留旧 source，不随新产品重写。 |
| `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r4-win10-r2/event-sources/manifest-process-observer.cs` | `218a2ed353acb0338b0c831f58e3233b3a7802465bffca41535cc62ed9571f78` | 源内嵌旧产品 source/根；需新版本与独立构建/pin，旧文件不可原样冒充新包证据。 |
| `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r4-win10-r2/event-sources/launch-manifest-observer.ps1` | `17370629b5dcbc818d7040dbbc12265b1b833988a7a8e3fbb012b83d2d01a1b0` | 源内嵌旧产品 source/根；需新版本与独立构建/pin，旧文件不可原样冒充新包证据。 |
| `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r4-win10-r2/ordinary-desktop-entry-command.txt` | `7ca77a159e0db1fb4042eb82f17350eabcf4886f6eca386e3b42026e5b437a31` | 旧根/driver/pin/产品 source 绑定；需新版本重绑。不能运行旧普通入口。 |
| `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r4-win10-r2/review-phase.py` | `1d40ecabf1ffe88ac2b62ff6e7fdfd4ab645d49f2474a5b96dce999e98815a7a` | 可复用核验算法；先核固定 Profile、source、phase 与目录。新输入必须重新绑定。 |
| `/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r4-win10-r2/review-negative.py` | `40d2cbceb5f669784d78a5b4bdf61fa5ee12eef0195af20a57ab0f4940113bad` | 可复用核验算法；先核固定 Profile、source、phase 与目录。新输入必须重新绑定。 |

A9-31 普通入口文件为 `launch-product-r3-desktop.ps1`，旧命令文本保存在表中 ordinary-desktop-entry-command.txt。
它固定旧根与旧 pin，不能作为 A9-33 新执行命令。只复用“一次普通桌面启动→固定请求→证据回收”的机制。
主工作区 ENGINEERING_02 工具仅作只读对照。p17/w16、旧桥接根、已消费批准与预算全部保持关闭。

新包必须重编并重新装配 State/Core/Shell 与七模块的实际 JS，形成新 ZIP/manifest/descriptor/driver/输入锁/SBOM/许可证/kit/pin。
改动的 driver、控制器和夹具用新不可变版本，实际运行时重新准入；旧包与旧证据不得覆盖。
未变 helper/SQLite/依赖字节只可提出继承。没有必要仅因 JS 变化重做未变 helper 双构建。
capture-source.cs/DLL 可提出同字节复用，但当前原构建记录绑定旧 source，不能改写或自动签为新源取证。
observer 源 50 行内嵌旧 source；若未来必须改该绑定，需单独准确取证变更批准，并重建 observer/pin。
上述 V4 捕获使用 Windows 8+ 精确 UTC API，只用于 Win10；不得直接复用于 Win7。

## 5. D1(d)：字节变化事实与继承前提

开发机只读比较 `571ec550b5e09611f55557563d0cf2f1a4a40d1b` → `d8fd760a1c283b638996bde50c90fc7d2d139ccb`。
命令退出 0，diff --stat 输出为空。依赖清单包括全部 24 个跟踪 package/lock 清单，逐文件详见 r3 JSON。

```sh
git -c core.fsmonitor=false diff --stat 571ec550b5e09611f55557563d0cf2f1a4a40d1b d8fd760a1c283b638996bde50c90fc7d2d139ccb -- native/ src/runner/ package.json package-lock.json '**/package.json' '**/package-lock.json' release/win7-product-v3/a9-v26-managed-input-lock.json
git -c core.fsmonitor=false show 571ec550b5e09611f55557563d0cf2f1a4a40d1b:release/win7-product-v3/a9-v26-managed-input-lock.json | shasum -a 256
git -c core.fsmonitor=false show d8fd760a1c283b638996bde50c90fc7d2d139ccb:release/win7-product-v3/a9-v26-managed-input-lock.json | shasum -a 256
shasum -a 256 release/win7-product-v3/a9-v26-managed-input-lock.json
```

| 跟踪集合 | 文件数 | 父提交 SHA-256 | d8fd760a… SHA-256 | 事实 |
|---|---:|---|---|---|
| native/ | 106 | `5dd72eb7c4addeaf006210e1deed49fa46763930aeea50606cca9f59bcc62300` | `5dd72eb7c4addeaf006210e1deed49fa46763930aeea50606cca9f59bcc62300` | 集合与逐文件字节未变 |
| src/runner/，含跟踪 dist | 97 | `be9b1002a0cf456c472c0469102560d1023afab4d8a856788ba00a35d4cc3dd7` | `be9b1002a0cf456c472c0469102560d1023afab4d8a856788ba00a35d4cc3dd7` | 集合与逐文件字节未变 |
| 依赖清单 | 24 | `f30c6e26f5fa5d856adf87bc6c117b26b965b9e1b867ac901d111260a3248325` | `f30c6e26f5fa5d856adf87bc6c117b26b965b9e1b867ac901d111260a3248325` | 集合与逐文件字节未变 |
| managed 锁，单文件 | 1 | `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e` | `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e` | 磁盘字节也相同 |

前三行集合摘要算法：按路径排序，拼接每行 `path + NUL + file SHA256 + LF`，再作 SHA-256。
每个成员的两个提交与当前磁盘 SHA 都在 r3 JSON。空 stat 也证明没有增删成员。
本节不签继承 PASS。[矩阵 §1](../../plans/A9_BATCH_2_INCREMENTAL_VALIDATION.md#1-继承准入与记录)逐项核参数、配置、上下游、原报告/run/身份及合同允许性。
获准后才记 INHERITED_EVIDENCE。新包身份、实际加载、继续、共享审计/预算/恢复及退出仍须直接检查。

## 6. D1(e)：Electron 缺失与取证选择

开发机只读事实，绑定 d8fd760a…：node_modules 指向主工作区 node_modules。
根和 Shell 两处 `node_modules/electron`、`electron/dist`、`electron/path.txt` 均不存在。
证据仅覆盖当前依赖解析预期位置，不声称扫描了整台电脑。真实 Electron 本轮 NOT_PERFORMED。

| 选项 | 覆盖 | 不覆盖 | 处置 |
|---|---|---|---|
| A：新包阶段取证 | 获准后在准确 Windows 新包检查 Electron22/Node16/ABI110、main/preload/IPC、SQLite/native、卡片/Stop/重启与真实退出 | 当前文档阶段没有真实 Electron；Win10 结果不能替代 Win7，正式门仍按合同 | 推荐；与最短真实链路合并，不为 macOS 另行下载 |
| B：负责人批准后下载 darwin Electron 22.3.27 | 下载前绑定 darwin 架构、官方 ZIP/校验清单来源和批准 SHA；校验后可检查 macOS Electron main/preload/IPC 与可运行的 UI/重启/Stop | 不覆盖 Windows helper、DPAPI、Win7 Shell/codepage/补丁、Windows SQLite ABI 工件、普通桌面令牌/Job或 Win7 PASS | 下载与校验本轮 NOT_PERFORMED；工件 SHA 为 UNKNOWN，须批准前绑定；不能只校验自算 SHA |

## 7. 已知限制，后续再修（D3）

以下登记仅支持文档主流程推进，绑定 d8fd760a…；不修改任何问题代码。
| 项 | 现象与触发条件 | 影响及不阻断本轮主流程的理由 | 证据层级与绑定 |
|---|---|---|---|
| F6 | 未知 Shell 恢复时，读取无关但在工作区内的缺失路径。已审计 ENOENT 后，`src/core/src/a9-agent-loop.ts:1553` 无条件执行 `recoveryCheck.opaque = false`。 | 未知 Shell 的观察门会被清除；Shell 仍受原 Policy 与新审批约束。负责人本轮要求登记后继续文档流程。此登记不批准正式安全判据，不代表所有 Shell 副作用已核查。 | 开发机代码阅读，d8fd760a…；本轮反例实验 NOT_PERFORMED。 |
| ENOTDIR | 目标父级为文件。`a9-agent-loop.ts:1583,1586,1597` 只接受 ENOENT，ENOTDIR 会抛出。 | 对应观察门无法解除，主动继续被阻断；没有放行副作用。此边缘路径不阻断批准材料编制。实际行为状态 UNKNOWN，代码阅读，未实验。 | 开发机代码阅读，d8fd760a…；运行实验 NOT_PERFORMED。 |
| 错误码可读性 | 恢复卡存在 blockedReason 时，`src/shell/product/renderer/a9-workbench.js:1025–1026` 直接显示英文错误码。 | 影响卡片诊断可读性，不改变 IPC/Policy/审批判定；不阻断文档流程。 | 开发机代码阅读，d8fd760a…；本轮真实 Electron NOT_PERFORMED。 |
| Core 路径核验 | `a9-agent-loop.ts:1571–1600` 的 verifyRecoveryPath 直接使用 fs realpath/lstat/stat/readdir。 | 跨层职责已在 ADR-0189 说明观察规则。措辞仍待负责人确认；现有字节不在本轮修复范围。 | 开发机代码阅读，d8fd760a…；Win7 实机 NOT_PERFORMED。 |
| ADR-0189 治理 | 隔离树用 0189 追加观察规则。主工作区治理线在 DECISIONS.md:2493 声明 0153–0189 已用于并行工作树。 | 整合存在编号和引用冲突风险。当前不整合，不改 Accepted 正文；本轮文档流程可继续。措辞与编号处理待负责人确认。 | 开发机只读文档，隔离 d8fd760a…；主工作区 a53c9b9d… 加既有 dirty/untracked。 |

F5 授权来源仍待负责人确认。ADR-0189 的 Accepted 原文保持；本轮不重新签发其措辞。
本轮定向代码阅读未取得新的实机结论。独立审核与正式安全判据仍需后续裁决。

## 8. 本轮检查与下一步

本轮只做 docs:check、diff --check HEAD、新增文本格式与保护检查，结果见 `docs-check-r3.log`、`diff-check-r3.log`、`untracked-text-check-r3.json` 和 `protected-boundary-check-r3.json`。
所有结论均为开发机文档/只读分析，绑定 d8fd760a… 加本轮文档清单；不是产品运行 PASS。
verify:quick、定向测试、装包、Electron、下载、Win10/Win7连接、正式候选冻结、独立签审、门 A/B、提交与推送均 NOT_PERFORMED。
裁决见 [D5](a9_32_owner_decisions_2026-10-12.md)。负责人指定独立审核者后使用 [D4](a9_32_independent_review_handoff_2026-10-12.md)。

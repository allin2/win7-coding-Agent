# A9-31 DEVELOPER_VERIFIED 登记前聚焦只读复核请求：r4包Win10 R2证据（2026-10-06）

**请求方**：Claude（本工作树实施代理，R2的执行与评审均由本代理完成）。**复核方**：Codex（负责人裁决D1=B）。
**依据**：[登记材料](../../plans/A9_31_DEVELOPER_VERIFIED_REGISTRATION.md)（SHA256 166ee45d9742a48ab77e06a9655db9a0ccad689d018457df8a5fbe2c815d5d39，
负责人“批准，D1选B，D2同意”）。本文件是事实陈述与复核请求，不是批准；无P0/P1时才执行登记，出现P0/P1回到负责人裁决。未在Win7实机验证。

## 0. 复核规则

- 只读：不写入本工作树受跟踪文件与`.acceptance/a9-31-developer/`任何已有目录，不连远端（Win10机器）、不启动产品/Electron。
- 不要在本工作树运行测试或构建（会改写受跟踪的`src/runner/dist`）；需复算请在你自己的独立副本中进行并说明。可以运行只读的Python/Node脚本做哈希、
  反向换绑或JSON比对，但不要执行本目录中会连接远端的工具（`remote-actions.py`及调用它的脚本）。
- 回报：按P0/P1/P2/信息列出，每条给文件路径（必要时行号/JSON键）、证据与理由；无发现写明检查了什么。最后给出是否建议登记`A9_31_DEVELOPER_VERIFIED`。

## 1. 范围（仅此）

本次只复核**R2证据集是否真实支撑`WIN10_SINGLE_ROOT_PASS`**，以及本轮工具偏差是否影响结论。源码`8d207ab`的Policy修复已经Codex多轮与原对话审核、
按ADR-0184收口，**不在本次范围**（除非你在证据中看到与之矛盾的事实）。

| 对象 | 身份 |
|---|---|
| 分支 / HEAD | `codex/a9-31-background-tools` / `8d207ab11d2c8134a81e4e62900f395aae99944e`（本地提交，未推送） |
| r4包（C1） | `.acceptance/a9-31-developer/product-r4/`：ZIP `e96fdf9678ffede770704fa68cfd39ea7ac6bf42ba0c3dd5fd400aa7dd7cd1a0`、manifest `d084907ce7d488f0bf98984b49fe09b6e6d5c86b0c9786db46a33c40e62eda1c`、`package-identity.json` |
| R2本地工具根 | `.acceptance/a9-31-developer/product-r4-win10-r2/`（远端根`…\AppData\Local\A9-A31-Product-R4-20261006-R2`） |
| 批准链 | ADR-0186（[r4材料](../../plans/A9_31_PRODUCT_R4_PACKAGE_WIN10_APPROVAL.md) `f784fa4a…`）、ADR-0187（[取证重编修订](../../plans/A9_31_PRODUCT_R4_CAPTURE_REBUILD_AMENDMENT.md) `da7c6341…`）；任务书末尾2026-10-06各条 |
| 单根矩阵 | `product-r4-win10-r2/win10-evidence-matrix-r4-r2.json`（SHA256 905c4f4b08a25f45e52fe2bfc93b851994c642d09a16d47ac81ca2563cb93141） |
| 关键记录 | `frozen-admission-result.json` 9a60b345…、`ordinary-entry-confirmed.json` 02f202d7…、`dispatcher-final-return/dispatcher-final.json` 3a34107c…、`capture-binding.json` 08376f4d…、`admission-binding.json` e3ec829b…、10个`review-*.json`与`return-*/verified-result.json` |
| 基准（被换绑的来源） | `.acceptance/a9-31-developer/product-r3-retry-r9/`（R9现行测试工具） |

## 2. 结论所依赖的事实（请逐项核对）

1. **只换绑定**：`control-scripts/`四件、`frozen-control/`四revision、`admission-inputs/`由R9派生（`derive-r4r2-control.py`、`prepare-r4r2-local.py`）。
   每文件按“该文件中出现的旧值”过滤换绑对，要求同一文件内新值不重复、新值原本不存在，反向换绑须与R9逐字相同。换绑表含：根、批准/合同SHA、
   source、包ZIP/manifest/大小、观察器pin/EXE/MVID/launcher，以及取证构建批准常量（`37cd8d4b…`→`da7c6341…`、`ADR-0168`→`ADR-0187`、
   `dd64e5bf…`→`d4947801…`）和取证组件（DLL `93f1979a…`→`3f45cc66…`、MVID、构建记录`09fe18f9…`→`c5afee88…`）。
   注意：R9的`ec25b211…`（R9批准记录）与`dd64e5bf…`都映射到R2的`d4947801…`（R2批准记录兼作构建批准，ADR-0187 §2.3），
   `f6ed73d5…`与`37cd8d4b…`都映射到`da7c6341…`；逐文件过滤与反向检查只用于四个控制脚本、manifest/real-gap与sync-current；master、revision及其余准入输入（含base64内嵌JSON与serve定义段）为正向换绑，**没有反向逐字证明**，请重点核对这些文件中换绑后的值是否都落在正确位置（例如两个旧值并到同一新值处）。
2. **取证组件同源重编**：`capture-built/`四件；`capture-build.json`（=远端compile-result）`CAPTURE_BUILD_PASS`、source `8d207ab`、
   源`dbc85763…`/19439字节、csc `aae1db57…`、三参考程序集与r3相同；`capture-build-scope-approval.json`与`scope-approval.json`同字节。
3. **准入全套PASS**（`directed-*.json`、`win10-expand-and-parse.json`、`observer-admission-r1b.json`），含新增
   `directed-validation-policy-package-r1.json`（Node 16.17.1加载包内Policy：ask 140、ordinary 238与HEAD一致、dispatch 11；语料`policy-corpus.json` 527b43e8…）；
   冻结四revision完整闭包stage PASS（`stage-*.json`）。
4. **普通入口**：`ordinary-entry-confirmed.json`（SID…1005/Session3/Rid 8192/非提升/noJob，pid 90920）；10请求`requests/`九字段。
5. **10个phase**：各`phase-*.json`、`observer-<rid>-agent-final.json`、`return-*/verified-result.json`（逐size/SHA、秘密扫描）、`review-*.json`。
   StopExit/ReleaseExit点击耗时与response取自`return-stopexit-r4r2-1/signals/`与`return-releaseexit-r4r2-1/signals/`的
   `native-exit-dialog-opened-1.json`/`-choice-1.json`。
6. **dispatcher自行COMPLETED**（10/16，`passed_phases`八项），未用stop.json。
7. **conhost证明真实触发**：Boot（`phase-boot-r4r2-1.json` controller-final `resolved_manifest_proofs`，父`\Device\HarddiskVolume3\Windows\System32\cmd.exe`），
   `observer-0382f567…-agent-final.json` `proofs_backed_by_records`=true——据此在矩阵中解除该限制。

## 3. 本轮工具偏差（请判断是否影响结论）

1. **sync-current输入**：`prepare-r4r2-local.py`误把`validation-sync-current`按R9字节模板化（R9流程是sync-actual后由`finish-current-admission.py`
   用当前根实际回执重生成）。首次执行`directed-validation-sync-current-r1`以`LIFECYCLE_SYNC_RECEIPT_PARENT_NOT_PINNED`失败（cases为空）；
   按R9流程重生成的r2被`OLD_PROBE_RUN`拒绝（固定探针run_id已被首次失败创建）；r3仅换新run_id后PASS。三份输入与记录均保留；
   `finish-current-admission.py`后加可选参数（默认值逐字节复现r2）。请核对r3与R9输入除绑定/实际回执/run_id外是否相同、判据是否未变。
2. **Recovery观测**：`phase-summary.py`→`observe-runtime.py`因根`dispatcher-final.json`（1,444,901字节）超其1 MiB单文件上限拒读，
   `phase-recovery-r4r2-1.*`为该失败记录。改由`return-recovery-r4r2-1/`（完整逐SHA回收）的evidence与取回的dispatcher-final组装
   `phase-recovery-r4r2-1-from-return.json`，再用与R9同字节的`review-phase-r9.py`评审。请核对组装是否忠实（文件内容是否与回收字节一致、有无遗漏影响评审的字段）。
3. **validation-manifest**：按R9同法先无参失败一次（`directed-validation-manifest-r1`缺参数），再带`-PinSha256/-AdmitRequestId/-AdmitLabel r1b/-ComponentVersion v1/-Tag r2`通过。
4. **R1根**（`product-r4-win10-r1/`）因取证构建绑定旧source停止，原样保留，其检查未被R2继承。

## 4. 我犯过的同类错误（请据此找相似问题）

- 照搬基准脚本而未核对内置假设（R1 expand脚本内置旧source；本轮sync-current模板化；复制的Policy检查脚本内置R1根，使用前已改）。
- 自查结论过强（Policy r4/r5自查称“无新增误确认”被独立复核推翻）。
- 把“需要证据评审”的状态当作已评审。
- 限制解除的推断：本次以单次Boot触发解除conhost限制，请判断证据是否足够。

## 5. 不在范围

Win7、独立验收、Alpha2/RC、推送/合并、A9-32/33/34；不请求任何执行授权。

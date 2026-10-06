# A9-31 R8 开跑前独立复核请求（2026-10-05）

**请求方**：Claude（本工作树的实施代理）。**复核方**：Codex。**状态**：R8 已实施、准入、冻结，**尚未启动普通入口、未发任何请求**；复核结论返回前不开始正式流程。本文件是事实陈述与复核请求，不是批准，也不改变任何授权范围。

## 0. 复核规则（请严格遵守）

- 只读：不写入任何已冻结根（本地`.acceptance/a9-31-developer/product-r3-retry-r*`、远端`A9-A31-Product-R3-*`），不启动产品/Electron/观察器，不做任何原生探针；默认只读本地文件。远端只读查询须负责人明确授权。
- 不创建、不修改、不删除任何文件（本文件与`review-verify.py`除外），不提交/推送/合并。
- 不假设我的结论正确：我在本任务中已犯过两类错误（见§4），请优先找**同类问题**。
- 回报格式：按严重度（阻断/高/中/低/信息）列出发现，每条给出`文件:行`、证据（真实证据文件路径优先）和复现步骤；没有发现就明确写“未发现”并说明检查了什么。

## 1. 先跑这个

```bash
/usr/bin/python3 .acceptance/a9-31-developer/product-r3-retry-r8/review-verify.py
```

它只读地核对：批准草案哈希、观察器源在R5–R8字节相同、R8四个控制脚本**反向换绑后与R7逐字相同**（即无功能变更）、master/revision/观察器块一致、driver五项离线自检、对话框按钮常量、git index为空。我已运行，19项全部通过；请独立复跑，不要只信本文。

## 2. 待复核对象与准确身份

| 对象 | SHA256 |
|---|---|
| 批准草案r2 `docs/plans/A9_31_R8_EXIT_PHASES_AND_CLICK_PROTOCOL_APPROVAL.md` | eb9b1c76e0b87fc8626ca14c8272ec6e7d2bce3ffa8e5a738586e45c8590e21b |
| R8 master-pin | 0450ccc613b97bfbb8876cb657fd21fbecbc1bd39a409fef489a07d081dfe6cf |
| serve-product-r3-desktop.ps1 | 36f73fb52ca86be83b7d4c7d42d444a0cbf5db8a33068129b15a54676c6e95df |
| launch-product-r3-desktop.ps1 | 2df70940b4821ee76d2913d3e93007246c53298f71d46399eeb6402f41f98c11 |
| stage-product-r3.ps1 | dda0ea02fa69b95336fb675665ef32844998fe93c0a49cc8465c7a12a41fab7c |
| product-r3-driver.cjs | 8505c0a46765b2dedfff2cb70cb16cdd9f293a0fc64968ef91b7fda74d0e8b91 |
| 观察器源 manifest-process-observer.cs | b949ba520eb103548cfd08a578d76df1d3d48e46089045188dc7b4b1df112a7d |
| 观察器 EXE / MVID（R8重编） | 5bc1ad6a8ad4e0e2aeab560253b7569adc0e42d725f167119e4ca96baeb5cd0d / fa8a6188-1faa-4011-a62e-37c9a904dc72 |

R8范围（草案§1/§4）：**无功能代码变更**；仅重跑StopExit→ReleaseExit→Recovery（最后）；人工点击流程固化（就位确认、45秒提前量、每次只报一个按钮、“不确定就不点”、超时FAIL可重试至多3次、点错按钮HALT不重试）。相关记录：ADR-0176、任务书末尾R7/R8条目、[handoff §10–§11](a9_31_r5_manifest_proof_handoff_2026-10-05.md)、矩阵`product-r3-retry-r6|r7/win10-evidence-matrix-r*.json`。

## 3. 请重点复核的问题

1. **Recovery重启路径（最大风险）**：该路径从未在Win10真实重启。我已修了两处已知冲突（driver第118行journal、第318行`shot('boot')`），并有`--restart-evidence-self-test`（含对`recoveryRestore`与`whenReady`段源码的静态守卫）。请**独立静态走读**重启实例从模块加载到`closeAfterChecks`的完整执行路径（R8 `product-r3-driver.cjs`第119–121行辅助函数与journal、第161行`shot`、第294–299行`recoveryRestore`、第307行`uncaughtException`注册、第319–323行`whenReady`与重启分支；R8 `serve-product-r3-desktop.ps1`第326–336行重启子进程启动与收尾，行号以R8文件为准、不要沿用R5/R6的行号），找出其余同名文件创建、端口复用（`server.listen(previous.recovery.fixture_port)`）、环境变量、`electron-restart-pinned.json`绑定、2分钟`LIFECYCLE_RESTART_TIMEOUT`与`Complete-Tree 15000`等可能使重启实例失败或使控制器硬停的点。特别注意控制器启动重启子进程时**不传`--a9-smoke-workspace`**，而产品`main.js`第1287行依赖该参数选择工作区——请判断重启实例靠持久化的`active-workspace`恢复是否确实成立。
2. **点击流程与断言**：核对`src/shell/product/main.js`第1033–1042行对话框（按钮数组在第1036行）（`defaultId:0`、`cancelId:2`）与driver`ACTUAL_NATIVE_EXIT_CHOICE`/`native-exit-dialog-*`逻辑，回答：Esc/取消（`response=2`）在StopExit/ReleaseExit下实际表现为硬门还是超时？我只知道“点第二个按钮”被证实触发HALT（R7第三次），其余是推测。
3. **新conhost proof的未验证面**：它在普通环境从未放行过真实缺口（R6遇到但旧控制器拒绝；R7修复后未再遇到）。请审查`Resolve-ManifestObservation`在**活的**phase中与我的回放夹具的差异：回放使用了伪造的`$parent.process`对象并屏蔽了`Assert-ObserverReady`，请检查真实`QueryProcess`/`Held`对象下`$parent.process.StartTime.Ticks`、`Binding.ParentCreationTicks`、`SnapshotClock`、`ValidateConhostProof`参数类型是否会出现我没覆盖的差异。
4. **观察器预算与phase时长**：观察器硬预算750秒、dispatcher单phase上限12分钟。核对Recovery（崩溃实例+重启）健康运行时的预期时长是否在预算内（R5 Recovery在失败时观察器已跑578秒）。
5. **证据诚实性**：核对R5/R6/R7矩阵、任务书与handoff对“PASS/预期负例/FAIL/HALTED/未执行”的表述是否与原始证据一致，跨根组合（R5旧字节、R6、R7、R8）是否被明确标注而非冒充“整批通过”；`ready`专用负例按设计预期失败的判定是否有driver源码与16项检查支持。
6. **合同与ADR一致性**：R8草案r2、ADR-0176、C14六源登记、`WIN7_CONSTRAINTS.md`末尾C15/C16、`STATUS_LOG.md`之间有无矛盾；是否有任何地方暗中放宽了原未知生命周期门、对话框断言或120秒限时。
7. **批准范围**：R8草案§5/§6与D1–D4（顺序StopExit→ReleaseExit→Recovery、点击phase最多3次尝试、不预授权第九根）是否被本次实施超出；有无未登记的新文件落入“实现代码”范畴。
8. **容量与权限**：空闲空间现约10GiB；每请求≥1GiB、stage≥2GiB的门槛是否在三个phase全程内仍成立；跨账户（Administrator观察器/a9builder控制器）文件读写在R5–R7每个请求前的真实读取证据是否足以覆盖R8。

## 4. 我犯过的同类错误（请据此找相似假设）

- **夹具自拟、与真实证据格式不符**：我假定持有树`Binding.Image`是`C:\Windows\...`，实际是`\Device\HarddiskVolumeN\...`（R6全部185个真实条目如此），导致R6 EncodingSecurity硬停；我的38项定向检查用了同样的错误格式因而没抓到。请检查代码里还有哪些字段/格式假设**没有**对照真实证据：例如观察器进程名比较、会话号常量3、`Exe`名比较、路径大小写与分隔符、FILETIME与.NET刻度换算（常量504911232000000000）。
- **复用脚本未核对其内置假设**：沿用R5/R6脚本时曾遗漏“样例脚本行size需重绑定”“R6模板已带重启自检参数”等；R8由R7派生并已做反向换绑断言，但请核对准备/部署/冻结脚本是否仍有残留的R7/R6绑定（`review-verify.py`未覆盖准备脚本）。

## 5. 不在本次复核范围

不要求验证Win7（未验证）；不要求重新评审R4–R7已HALTED入口的结论；不请求批准或授权任何执行。DEVELOPER_VERIFIED、独立验收、Win7均未签，整批Win10仍为NOT_PASS。

## 6. Codex独立复核与负责人要求的本地修复（2026-10-05）

原§1“只读/19项全过”是实施方的历史陈述，独立复核未复现：原脚本实际定义21项，重启与late-journal自检写文件；禁写/禁网络运行得到17 PASS、1 FAIL，随后临时目录异常，余3项未执行。原请求全文已保存到候选外修复目录的`evidence/pre-run-review-request-original.md`，不改原冻结脚本或准入证据。

复核发现高1/中2/低1：①新增click-phase.sh删除/覆盖旧输出，未在六源内；②重启自检测试了restartAware，但实际entry创建post-final-event未调用它，与任务书R6修复记录不符（未证明健康Recovery必然碰撞）；③验证器不是只读且检查数量不符；④freeze-admission.py及结果残留R7状态。另静态确认active-workspace恢复入口存在；Esc通常取消关闭后超时、清理失败仍可HALT，ADR-0176的保守不重试规则保持；conhost UTC/刻度/NT映像和参数类型未发现确定错误，但真实活缺口路径、健康重启耗时、R8跨账户读取仍未验证。R5–R7 1541个回收文件size/SHA核对一致，预期负例/FAIL/HALTED和跨根组合未发现冒充整批PASS。

负责人随后要求“帮我修复这个问题”，范围按[任务书末尾](../../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)与ADR-0177登记，仅本地候选外修复。交付目录为`.acceptance/a9-31-developer/r8-review-repair-r1/`：

- `review-verify.py`：只读验证冻结基线和修复副本；不创建临时目录，不启动写盘自检，动态输出准确检查数及NOT_PERFORMED。
- `control-scripts/product-r3-driver.cjs`：实际晚到记录使用restartAware；重启自检执行实际entry源并保留原EEXIST反例；原late-journal自检加载实际命名函数。其余产品路径、断言与预算不变。
- `click-phase.sh`/`click-phase.py`：固定45秒，只允许两个点击phase/normal-full；独占创建唯一标签目录和日志，不删除、不覆盖；开始失败或回执错误不进入finish，finish失败保留输出。修复目录无远端控制器，直接调用会先拒绝，不发请求。该脚本不自动证明负责人已就位、批准顺序或最多3次；这些执行合同仍须逐次满足。
- `freeze-admission.py`：明确R8状态，先拒绝已冻结根与未准备目录；未生成新的Windows准入结果，不修改旧R7标签证据。

直接本地验证：只读验证器28/28（普通文件禁写、网络禁用，Git所需`/dev/null`字符设备例外）；真实文件系统entry反例/修复9/9；真实closed-descriptor late-journal自检15/15；点击/冻结工具21/21（本地合成控制器，验证固定45秒参数，不实际等待/点击/远端请求）。R5–R8 **5448个文件**逐size/SHA无变化。首次Git检查因`/dev/null`被禁写退出128，该失败与后续明确设备例外的成功输出均保留，没有忽略返回码或改写首失败。

文档检查通过（293文件/48任务），`git diff --check`通过；五源size/SHA与repair-manifest逐项一致，原复核请求副本SHA256仍为2cec26bfb2344f03b266d5286ce8e9bfd9be48c95e682632f3ac12b57f4b5eb3。证据保存在修复目录`evidence/`；没有运行无关的产品全量测试或GUI。

最终driver SHA256 `cbeea5571173aa216a9b3ca110f3f67efa7925a3e982343970e64dfef35b1aaa`；五源及结果索引见修复目录`repair-manifest.json`（SHA256 `54a8c8e5ef1a331d389faf7c2d51bee5dbde25d7cc2be860e6545f3d251a806c`）。本地解释器Node20.17.0，不能替代目标Node16/Electron/PS5.1。产品/native/锁/capture/观察器/九字段/原master/revision不变，无删除/提交/推送/委派/远端连接。

**当前结论：LOCAL_REPAIR_VERIFIED_NOT_DEPLOYED，不可据此开跑原R8或热换driver。** 新driver字节不能沿用原准入PASS；不创建第九根、不恢复HALTED。新不可变执行版本的具体范围、目标运行时准入、绑定和冻结仍须按合同完成。真实Recovery/conhost缺口/跨账户/Win7、DEVELOPER_VERIFIED及独立验收保持NOT_PERFORMED；整批Win10仍NOT_PASS。

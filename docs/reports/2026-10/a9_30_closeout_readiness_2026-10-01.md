# A9-30 收口准备与需求证据矩阵（2026-10-01）

本报告保留首次准备及后续中间快照。2026-10-02最终独立复核通过，当前开发机结论为 `DEVELOPER_VERIFIED`，见[最终收口裁决](a9_30_developer_closeout_decision_2026-10-02.md)；Win7仍NOT_PERFORMED。

```text
Branch: codex/a9-30-shell-streaming
HEAD: c14a96808d048c34f6079cc378ba12b4f60f5c62
Status: LOCAL_HANDOFF_READY / DEVELOPER_GATE_NOT_SIGNED
Formal source / kit / helper / v26 input lock: NOT_LOCKED
Independent Review / Native Windows / Real Electron / Win7: NOT_PERFORMED
Candidate / Alpha 2 / RC: NO_NEW_VERDICT
```

已完成本次授权范围内的本地 v26 构建与装配源码闭包、拒绝用例和可审批交接材料。
本报告由实现方记录；独立复核、实际原生重锁及真实 Windows Electron 是仍待完成的硬门，不能登记 DEVELOPER_VERIFIED。
执行步骤、资源与授权见 [交接包](../../plans/A9_30_DEVELOPER_CLOSEOUT_HANDOFF.md)。

## 1. 实现与输入输出合同

| 交付 | 已完成行为 |
|---|---|
| v26 prepare/package | 13 个原生文件（含 stream_writer）从完整 source commit 提取；提交时间、每文件 SHA/尺寸、Profile 和完整 manifest；预校验后生成，未提交/缺失/额外/符号链接/漂移拒绝；封装不覆盖旧包 |
| v26 build 模板 | D-017 16.11/v142/14.29/SDK19041/x64/static CRT/Brepro/路径映射；独立 run-id；v1/v2 原 smoke 不删；v3 tick/双源/三编码/无换行/上限/取消/慢消费者 raw JSONL 和单调时序；工具身份与 PE/API/CRT |
| v26 return/record | 批准 kit、committed HEAD 登记、完整返回文件集合和每文件绑定；直接读 PE 和 v3 帧；不同 run-id/ZIP、同 helper/工具；独立返回复核登记绑定；诊断、假 PASS、协议错误或漂移拒绝，输出不覆盖 |
| v26 开发装配 | 沿用参数入口；Alpha 2 / helper v26 / 协议 v3 / Current User v2；runtime/runner manifest/SBOM/许可证一致；全源码干净、登记/source 祖先及哈希校验；开发标识而非 WIN7-43，无 authority 或旧驱动结论 |
| 脱敏字符串修正 | 保持四类私钥识别，等价构造 header 字符串，避免打包源码自身命中秘密扫描；秘密扫描规则不变，未增加豁免 |

实际工作树源码尚未提交，SOURCE_COMMIT/时间为 NOT_LOCKED；未产生正式 kit ZIP/input-lock/PACKAGE_MANIFEST 或发布输入锁。
a9-v26-approved-build-kits.json 当前 kits=[]，没有自填批准人、虚构工件哈希或声明原生 PASS。
记录器精确继承 c14a968 的 W42 锁 SHA `bf0430d626301eab174a8906338e8d8bae015c0c31d94bbf5c8bc2212847d68f`。
新返回复核格式记录为 ADR-0153 Proposed，不改 Accepted ADR 正文。

## 2. 本地检查

全部使用既有 Node 20.17.0。原始日志在工作树 `.acceptance/a9-30-developer/closeout/`，不是候选内。
合成 PE 从未执行；临时 Git 提交仅在 TEST_ONLY 夹具仓库中，不是产品 source commit 或批准登记。

| 检查 | 结果 | 证据 |
|---|---|---|
| v26 kit/返回记录器 | PASS，38 tests；1 Windows-only SKIP | v26-final-r3.log |
| 新 v26 装配定向（含锁定原生源漂移） | PASS，2；历史 106 按 name pattern 跳过 | package-v26-final.log |
| 全量装配回归（含历史 106 项） | PASS，108 tests；最终 v26 两项另做定向复跑 | package-regression.log |
| Runner 全量（脱敏字符串调整后） | PASS，11 suites / 215 tests | runner.log |
| verify:quick | PASS，7 模块编译/静态检查 | verify-quick.log |
| 文档/差异/编码及范围保护 | PASS，199 文档 / 47 任务，差异退出码 0；44 实现路径、24 历史文件及主工作区保护 | docs-final.log / final-boundary.json / whitelist.json |

Core 522、State 313、Shell 487 及最后活动卡 49 tests 的先前检查见 [原源码报告](a9_30_shell_streaming_source_validation_2026-10-01.md)。
本轮 28/29 原实现文件逐字节未变，Core/State/Shell 与其测试可按 prior-source-inheritance.json 精确哈希引用，
不重复无影响全量；Runner 调整后重跑全部 215。7 模块 quick 仍执行。
全量装配覆盖历史 106 项；新增返回复核/原生 source 一致性检查仅影响 v26，最终版本两项定向重新通过。
quick 生成的 20 个已跟踪 Runner dist 属本次构建输出，已精确恢复基线；未提交派生文件。

生成/封装负例：未提交 source、缺失/额外/符号链接、时间/NOT_LOCKED/Profile/smoke 漂移、字节错配、覆盖拒绝。
返回负例在重新计算绑定后仍拒绝：错 requestId、缺/重复序号、错 offset、非法 JSON 的结构化诊断不带 marker、非法 Base64/错计数、启动前输出、缺终态、
额外字段、非数字退出码、未及时输出、清理失败、错编码、工具缺失/漂移、源错配、额外/缺失返回文件、非一致 helper、
错误 PE 架构/禁用 API/动态 CRT、失败 smoke、重复 ZIP/run-id、未批准/未提交/脏登记、W42 锁漂移；
无独立复核/实现方自签/复核返回哈希错配不能生成锁。

首轮 v26 测试的重复 run-id 负例先被重复 ZIP 哈希挡住，调整夹具使返回身份确实独立，后续能定位 run-id 拒绝。
首轮装配因完整私钥 header 字符串触发秘密扫描失败，保留 package-v26-first.log；改源码构造并回归，未弱化扫描器。
v26-first.log / v26-fixed.log / v26-strict.log / v26-final.log 均保留，不覆盖失败或旧验证证据。

## 3. 需求与证据矩阵

| 合同 | 当前直接/继承证据 | 真实 Windows/native/Electron |
|---|---|---|
| S01 tick / 先落盘再发布 | Runner 实际 Node 管道 tick、Core required audit、SQLite→既有 IPC 模块夹具：PASS（开发机）；v26 raw tick 校验器正负例 PASS | NOT_PERFORMED |
| S02 双源顺序 | requestId/global seq/流 offset/Base64/字节数/ready 负例 PASS；活动卡 textContent 双源 harness PASS（原源码精确哈希） | NOT_PERFORMED |
| S03 真实终态/验证判定 | Core final result 不依赖 chunk、失败验证大输出及旧 verified 清除；v26 计数/退出码/清理拒绝用例 PASS | NOT_PERFORMED |
| S04 编码/秘密/边界 | 每切分点 UTF-8/CP936/UTF-16LE、CR/LF/无换行、已知及未知凭据/URL/四类私钥；日志/SQLite/IPC/DOM 分层用例 PASS | NOT_PERFORMED |
| S05 上限/Stop/背压 | Runner 严格上限/慢消费者/合作取消负例 PASS；v26 cancel/limit/backpressure evidence 校验器 PASS，实际脚本未执行 | NOT_PERFORMED |
| S06 刷新/分页/重启去重 | 实际 SQLite 文件关闭重开、分页；Renderer 稳定身份/序号补历史/终态不重复 harness PASS（原源码精确哈希） | NOT_PERFORMED |
| 负例停止派发 | 错协议、缺终态、必需 audit 落盘失败停止 Core/Runtime 派发；返回合同拒绝负例 PASS | NOT_PERFORMED |
| D-013/D-017 闭包 | 生成器/封装器/记录器/生产者 TEST_ONLY fixture PASS；全部 44 个路径在白名单 | UNKNOWN host / NOT_PERFORMED builds |
| 原生/API/CRT/双构建 | 合成 PE 与注册绑定正负例 PASS；不是 Windows PE 执行/真实 helper 字节一致性 | NOT_PERFORMED |
| 滚动/焦点/Stop/退出/窗口返回 | 沿用活动卡实现与模拟 Demo，只作为审阅；真实 Windows Electron 用户交互尚无证据 | NOT_PERFORMED |
| 整体开发 Gate | 本地材料就绪；独立复核和原生/真实 Electron 未完成，不能签发 | DEVELOPER_GATE_NOT_SIGNED |

原生 API/依赖登记见 [WIN7_CONSTRAINTS §10](../../WIN7_CONSTRAINTS.md)；helper 实际哈希仍 NOT_LOCKED。
旧 v25 kit/W42 锁/旧批准登记共 24 个文件对 historical-before.json 的 SHA 全部一致。
ready/sequence/audit 负向对照源码未变，沿用原报告和精确哈希；holdback 本轮按最终源码再次检查：故意去掉跨块等待后退出码 1、原始字节恢复，57 项正向回归通过；
negative-holdback.json 绑定恢复 SHA `11a25977dad2aecd0471c069ec595bcffdb3f2c7f21bf05eddf1cfbfa4f59ee8`。

## 4. 差异、完整性与仍待条件

本地准确路径、未提交源码 SHA/尺寸和统一补丁在 source-review-paths.txt / source-review-manifest.json / source-review.patch。
报告与哈希清单互相引用，为避免自引用哈希循环，报告本身只列入路径/补丁，不计入源码哈希清单。
最终保护记录 final-boundary.json：工作树分支/HEAD/空暂存、主工作区 HEAD/三处文件 SHA/两 ZIP 仍删除、历史文件未变。

下一步须负责人审阅差异并另行批准追加源码提交、指定独立复核人及 D-017 构建机。
按任务 §4 后续完成：正式 kit 三项哈希审批与登记提交、只读主机预检、授权双构建、独立返回复核、
精确 return_review 登记提交、v26 重锁及真实 Electron/打包 S01–S06 检查。当前全部未执行，不能以本报告替代。
原先源码报告为当时快照，旧记录原文保留；本次新增交接不回写历史结论。
A9-31/A9-32、新候选 Win7/门 A/B、完整 Alpha 2、RC、性能/A8/迁移/安装器/凭据生命周期均不纳入本次。


## 5. 后续事实补录

本报告主体保留为负责人审批源码时的快照。负责人随后回复“批准”，完成准确源码提交及未批准 kit 生成；
当前完整 source/三项哈希与后续未执行门见 [源码提交与 kit 绑定报告](a9_30_source_commit_and_v26_kit_binding_2026-10-01.md)。
原生 helper 和产品输入锁仍 NOT_LOCKED，不改判整体开发 Gate、Alpha 2 或 RC。


### A9-30 修复换包与真实 Electron 子集（2026-10-02）

负责人批准runtime/test准确两路径后，本地source `4318634` 的开发ZIP `b57d6806…7b232`、manifest `19d734ce…527ca`完整性与SID1005 Session3普通非提升无Job真实桌面启动PASS；原生source/kit/helper/开发锁按精确SHA继承。真实main/preload/native/Runner/Core/SQLite/IPC/Renderer路径的tick/双源/UTF-8/截断/Stop、已结束任务刷新/重启，以及回看/焦点/视图返回子集通过。CP936/UTF-16LE、40 native秘密切点、实际Runner背压及consumer失败、真实SQLite拒绝写入、协议帧故障、29秘密变体及4003直接切点另有范围明确的实机子集证据。9根310输出文件/84合成变体扫描命中0、正向对照有效，受检Electron已退出；历史native raw-pipe背压UNKNOWN不改判。

完整S01–S06和DEVELOPER_VERIFIED仍未签发：两文件运行中提示修正已完成39定向PASS及独立P0/P1/P2=0，源码提交待具体授权；失败验证撤销旧verified目标夹具已准备但未执行，编码负例、中断重启/退出交互仍待完成。UU在线而CUA远端输入无响应，坐标报noWindowsAvailable，不以SSH Session0代签。全部首失败和历史原文保留；不推送/合并、不占WIN7-43、不开放A9-31/32，不签Win7/Alpha2/RC。详见[当前包与实机矩阵](a9_30_v26_r6_product_package_and_windows_validation_2026-10-02.md)。

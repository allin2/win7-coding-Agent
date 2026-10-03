# A9-31 managed r3 Controller R2 最终独立只读复核报告

- Review: PASS_FOR_R2_SOURCE_REGISTRATION_ONLY
- P0: 0
- P1: 0
- P2: 0
- Reviewer: /root/a9_31_controller_r2_independent_review
- Model: gpt-6-luna / high
- Implementation author: /root
- Review date: 2026-10-03
- Review baseline: a0042d014c342856b96c09509865389bb441211f
- Branch: codex/a9-31-background-tools

本报告由独立只读复核人回传，主代理据原回复存档；实施方未自行签署独立结论。
首轮结果竞态P1和后续严格整数类型P2均已修复，最终未关闭问题为0/0/0。
可用于正式R2本地登记；不代表R2已运行，不签署构建、控制器生命周期、Electron或Win7 PASS。

## 最终输入与检查

最终dispatcher：`.acceptance/a9-31-developer/native-kit-r3/dispatch-and-collect-r2.py`，
SHA-256 `02a25bc8515781941adf8cf93ed66ad3b88cc89fbf8726fe269ec59c05365924`，17,812字节。
启动器：`control-scripts/launch-managed-r3-controlled-build-r2.ps1`，
SHA-256 `14cc77765d4149d6c87f7cc3362ff733c37f31ed2671d8c6c951257b072dba45`，14,330字节。
[补批材料](../../plans/A9_31_MANAGED_R3_CONTROLLER_RETRY_APPROVAL.md)中最终fence与文件逐字节相同，
提议登记dispatcher SHA一致。原dispatcher `05bfd2cbf98882c32d798bbeeed6e27f803c79a18833be0bd253a683d16c57c4`，
remote.py `f3f4f86757b2f824772e00c311422a226d3d7d94623e6d0ed017dabe271cc609`。

最终直接证据（位置均在上述native-kit-r3证据目录）：

- `controller-r2-final-result-gates-20261003T052158Z.json`：23项通过，绑定最终dispatcher SHA；
  覆盖A/B新FAIL、记录写入中、PID重用、钉住记录漂移、worker字段、B completed身份与时间、A失败不派B。
- `controller-r2-strict-identity-types-20261003T052125Z.json`：16项通过，绑定最终SHA。
- 独立复核人执行只读AST解析及内存身份门检查：合法整数正例通过，schema/elevation/integrity的bool和float拒绝。
- 账号字面量实际是单个U+005C反斜杠分隔符，不是bell字符。

原六控制文件与23文件native kit未改，沿用先前精确矩阵。复核确认ZIP仍为
`0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1`，23个唯一成员。
proposal的kits数组与正式registry逐对象一致；旧registry只读HEAD核验通过，不能代签新增登记。

## 首失败、修复及最终边界

首轮：FAIL_NOT_APPROVED，P0=0/P1=1/P2=0。结果出现时的快速分支先收包，后扫新FAIL，
未验证同期写入记录或轮询期间控制器PID/身份，可能绕过失败。原源码及首发现保存在
`controller-r2-dispatch-review-first-failure-20261003.md`，原SHA为5bbacf048062393749613fdc323cee7c2380d45481e0222280d1ed155a5b8b15。

最终分支先扫新FAIL和写入中记录，再校验worker身份与source/kit/registry绑定。
A收包前复核当前live身份/创建时间；B校验两worker、completed PID/SID/time。
B控制器缺席时只记录返回事实，退出码/进程树清理UNKNOWN，不签生命周期PASS或relock。

后续严格类型P2：Python True可与1相等。45d5版源码保存在
`controller-r2-dispatch-result-race-fix-before-strict-types.txt`。最终identity_gate要求schema、
提升级别和完整性RID为实际int，四个bool字段仍严格。P2已关闭。
早期27项只作为对应版本历史证据，最终判断采用上述最终SHA直接23项与16项。

调用者同进程完整普通Medium/非提升/无Job、固定SID1005/Session3门保留，
CreateProcessW只使用CREATE_NEW_CONSOLE=16；原server/worker仍复核子进程身份。
旧FAIL按确切哈希绑定，仅作为历史失败；新FAIL不被忽略。CreateNew记录、精确HEAD/report/registry
和依赖哈希检查、A→B及两请求/60分钟合同均保持。

复核时实际新registry仍草稿、正式报告文件未创建，工作树文档修改保留。
复核未修改文件、提交、远端写入或构建。本报告存档动作不改变复核时点。
最终启动器的远端ParseFile、普通桌面启动、双构建、返回复核、Electron及Win7均NOT_PERFORMED；
前期同SHA启动器ParseInput及旧控制ParseFile只作为对应证据，不冒充本轮部署检查。

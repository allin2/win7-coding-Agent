# A9-31 managed r3 Win10 原生双构建返回事实报告

2026-10-03；实现方事实报告，不替代独立返回复核或负责人裁决。

## 结果与身份

批准source `10114503a1e79706131ea4a11a5b96bd2958807a`、kit SHA-256
`0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1`，
批准登记HEAD `a4ec353721af6e905e199d9859fa3d80f098e78e` / SHA-256
`9dffe8e85a2cb83a580f74cf449626ecfa1b2ac06f5d76ee2ea63cf83f018d8c`。

Win10 `192.168.1.4 / WIN-2JQ66JE4HTQ`；实际执行为a9builder SID1005、Session3、普通用户、
Medium8192、非提升、无Host Job。Administrator SSH仅传输、固定请求与取证，不代签构建身份。
R2实际调用者和独立控制器均通过身份门；首轮30分钟未启动超时保留，
用户随后启动后按准确原登记恢复未改变的批准BuildA→BuildB代码，不覆盖原绑定/失败/超时。

| 构建 | run-id | 返回ZIP SHA-256 | 原生结果 |
|---|---|---|---|
| BuildA | `3abe9a16-449b-4900-956e-6d0fb4c40fe2` | `251674103e519b4e642c46b38d2b8af29929732a209613cfc5d3721daba47a40` | PASS |
| BuildB | `33514a91-c5e8-4bb0-9176-135782175c88` | `ce8679187e120d8c0c9896fd201f37dfb1187e87d58702c3529f24b73737ff44` | PASS |

两个全新目录为 `D:\A9-A31-V26-MANAGED-20261003\build-r3-a` / `build-r3-b`。
helper 361472 bytes，SHA-256 `2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7`，逐字节一致。
工具身份哈希 `18fb8e85331d9a6c6c21064d29235b5c29d28007599b4de5457873216ad6bd65` 一致；两个run-id/返回哈希独立。

## 已核验的原始证据

每包71唯一条目、sidecar、RETURN_PACKAGE_MANIFEST、源输入、Profile/manifest均匹配批准kit；
实际记录器技术检查通过。logic/capture/v1/v2/v3 tick、UTF8/CP936/UTF16LE、限额、取消/背压，
managed release/cancel双向顺序、helper/root/child PID/父子关系/启动时间/退出码、
PE AMD64、Win7 API边界、静态CRT及asInvoker manifest通过。
helper当前导入ADVAPI32.DLL/KERNEL32.DLL，130个API；这不代签Win7兼容性。

原始证据在 `.acceptance/a9-31-developer/native-kit-r3/`：两个 `return-BuildA/return-BuildB`、
`return-inventory-BuildA.json` / `return-inventory-BuildB.json`、
`ordinary-controller-r2-identity-live.json`、各序列观察及final、后飞行只读记录。
返回完整技术预检为 `managed-r3-double-build-return-precheck-r2-20261003.json`。

## 记录器修复与验证

真实返回预检首轮在 `A9_V26_APPROVED_KIT_SOURCE_BINDING_MISMATCH` 失败，证据
`managed-r3-double-build-return-precheck-20261003.json` 保留。
根因是批准kit登记编号 `A9-31-D013-V26-MANAGED-r3` 与manifest原生revision
`a9-31-managed-r1` 被错误要求相等。

仅修复任务白名单内 `scripts/release/record-a9-v26-helper-input.mjs` 与
`scripts/release/test/v26-prepare-kit.test.mjs`；manifest的固定原生revision、批准SHA/源/闭包判定保留。
夹具改用真实登记编号，增加已哈希绑定但错误native revision的拒绝用例。定向首轮1红/1绿保留。
修正后真实双返回完整记录器技术检查到达 `A9_V26_INDEPENDENT_RETURN_REVIEW_REQUIRED`，
确认未生成输入锁。native/已批准kit/registry/控制输入/原始返回均不改动，无须重新编译。

本地修正尚未提交；正式检查记录：`recorder-revision-regression-green.log` 202项中200 PASS、
0 FAIL、2 Windows PowerShell平台项本地未执行（NOT_PERFORMED）；Node20.17运行。
`recorder-revision-verify-quick-node2017.log` Node20.17父子环境的7模块编译/静态检查通过。
早先仅父进程20.17/子PATH20.10的quick记录保留，正式引用后续全链20.17记录。
编译检查产生的24项tracked Runner dist字节已保存差异/哈希后恢复准确HEAD，不纳入本次源码修正。
文档检查235文件/48任务通过，差异检查通过；普通文档补录不重复产品全量检查。

## 未知与下游门

BuildB完成记录绑定控制器PID24088/SID1005；后飞行未发现该PID、helper/cl/link同名进程，
但缺少控制器实际退出码和完整进程树证明，两项保持 `UNKNOWN`。原生managed测试的根/子进程生命周期
有直接证据，不能拿它代签控制器收尾；也不能把控制器UNKNOWN改写成原生测试失败。
依ADR-0157，暂停重锁、装配及后续下游门，交独立返回复核/负责人裁决是否需补证。
原生背压无终态的有界失败边界按原合同保留，不能伪造清理成功。

独立返回复核 `NOT_PERFORMED`；return_review未登记；managed新锁 `NOT_LOCKED`；
真实Electron/Win7 `NOT_PERFORMED`。A9-31仍 `A9_31_IMPLEMENTATION_IN_PROGRESS`，
A9-32/33仍草稿、WIN7-43未分配；不提升DEVELOPER_VERIFIED、第二批Win7 PASS、Alpha2或RC。

独立交接材料为 `.acceptance/a9-31-developer/native-kit-r3/NATIVE_DOUBLE_BUILD_RETURN_REVIEW_HANDOFF_20261003.md`。
[已批准构建范围](../../plans/A9_31_MANAGED_R3_WIN10_BUILD_APPROVAL.md)与
[R2控制器合同](../../plans/A9_31_MANAGED_R3_CONTROLLER_RETRY_APPROVAL.md)继续约束后续具体登记/授权。

## 独立返回复核补录（2026-10-03）

负责人在具体复核请求后要求继续推动，gpt-6-luna/high只读代理完成原始双返回和记录器修正复核。
[独立报告](a9_31_managed_r3_independent_return_review_2026-10-03.md)结论PASS_TECHNICAL_RETURN_EVIDENCE，
但NOT_APPROVED_FOR_INPUT_LOCK；P0/P1/P2=0/1/0，唯一P1为控制器退出码/完整树UNKNOWN证据缺口。
独立91 PASS/0 FAIL/2 WindowsPS本地NOT_PERFORMED；没有原生产品缺陷发现，不重新编译。
Security4688/4689只读补查无可追溯证明；ADR-0158 Proposed与[具体审批包](../../plans/A9_31_MANAGED_R3_RETURN_RELOCK_APPROVAL.md)已形成，
准确双返回的离线准入裁决、正式登记提交和重锁仍待负责人批准。原UNKNOWN/历史结论保持。

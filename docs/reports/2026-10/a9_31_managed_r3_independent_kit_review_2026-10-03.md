# A9-31 managed r3 独立套件复核报告

独立复核人：`/root/a9_31_managed_r2_independent_review`（gpt-6-luna/high）；实现方：`/root`。
主代理保存复核人回传结果。复核人只读，不修改实现、不执行测试、构建或远端命令。

## 结论与准确绑定

**PASS_FOR_OWNER_KIT_APPROVAL，P0/P1/P2=0/0/0。** 满足负责人批准套件的技术前置，
不代表复核人批准套件、登记提交或构建，不签发开发机、Electron或Win7 PASS。

- 分支：`codex/a9-31-background-tools`。
- source：`10114503a1e79706131ea4a11a5b96bd2958807a`。
- 父提交：`d9b5be502c9475e50c54b349a6a12abd27b199f8`。
- source提交时间：`2026-10-03T09:14:21+08:00`。
- 交接材料SHA-256：`95e6fd908d6c1080a54bbec207bb1732f1345c8aa038f25e65b1953548f4b400`。
- ZIP：`A9_31_V26_MANAGED_BUILDKIT_r3.zip`。
- ZIP SHA-256：`0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1`。
- input-lock SHA-256：`5d3159712d77ccd89e0a38e7e89379562685c98cc208d0b48c4d9f34912a68b4`。
- PACKAGE_MANIFEST SHA-256：`82ae5dd5539a85facade3b8aea6659e15bcede90e0601fd6cca075912ca248de`。

source r4批准清单SHA-256为`455bdf825a943c674c37298a0492af1e4516527fc9a2e7328240479be40e9311`。
16项逐项与source commit的尺寸和SHA匹配；提交receipt记录相同source、父提交、分支、时间和核验结果。

## 闭包核验

复核人在内存读取ZIP，未解包写盘。ZIP含23个唯一文件，与manifest列表加PACKAGE_MANIFEST精确相符，
无重复成员或目录项。input-lock的21项、manifest的22项均与ZIP内尺寸和SHA匹配。
13项原生源码与source中native/helper的Git blob一致；6项构建模板与source中的managed模板Git blob一致。
SOURCE_COMMIT及时间戳文件与准确提交及`%cI`相符。

此前独立核对的六项身份修复仍匹配r2冻结输入；source r4清单也绑定修复字节。
source10114503是准确修复提交，d9b5be5只是修复父基线。
包装revision为r3；native revision仍为a9-31-managed-r1、协议v3、managed证据schema2，kit/profile/verifier一致。
r1/r2历史ZIP哈希不变，原FAIL_NOT_APPROVED报告不改判。

## 修复与治理核验

A9-31状态APPROVED_FOR_IMPLEMENTATION；任务书记录ADR-0156及六路径修复具体批准。
提交receipt绑定准确16项字节。该批准和本报告均不替代套件登记或构建批准。

复核人继承此前对六项修复的静态核验：helper/root/child身份、创建时间及Toolhelp32父子关系在control前固定；
reader未结束保持失败，并在结束后显式释放句柄；release/cancel退出码由profile、capture、fixture和verifier共同约束。
这些字节在r3 source及ZIP中精确绑定，无新增P0/P1/P2。

## 证据边界

实现方本地矩阵记录90项直接PASS、644项继承，共734项非重叠证据；两项WindowsPS检查NOT_PERFORMED。
复核人未运行测试。WindowsPS5.1/C#实际运行、原生双构建、真实Electron及Win7均NOT_PERFORMED。
套件生成记录保持PACKAGE_READY_NOT_APPROVED，本报告不修改历史状态。
完整材料位于`.acceptance/a9-31-developer/native-kit-r3/`；本报告不包含其后准备的远端控制脚本审阅结论。

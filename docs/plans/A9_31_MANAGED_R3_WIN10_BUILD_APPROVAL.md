# A9-31 managed r3 套件登记与 Win10 双构建具体审批包

```text
Status: READY_FOR_OWNER_APPROVAL
Branch: codex/a9-31-background-tools
Source: 10114503a1e79706131ea4a11a5b96bd2958807a
Kit approval: NOT_APPROVED
Native build: NOT_PERFORMED
Win7: NOT_PERFORMED
```

## 已完成与待批准动作

负责人“执行这两个前置步骤并构建”已用于准确16项源码提交和新r3套件生成、独立只读复核。
source10114503提交完成，主工作区及A9-30旧工作树不改；独立复核P0/P1/P2=0/0/0。
原r1/r2套件和FAIL_NOT_APPROVED保留，不覆盖。

本包将任务§6和kit README要求的后续具体登记、目标目录及权限范围展开，供负责人一次裁决。
复核报告为[managed r3独立报告](../reports/2026-10/a9_31_managed_r3_independent_kit_review_2026-10-03.md)。
本审批包尚未签发具体批准，不将一般构建意图写成精确目录/ACL批准。

## 套件与本地登记提交

- ZIP：`A9_31_V26_MANAGED_BUILDKIT_r3.zip`，97280 bytes，SHA-256
  `0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1`。
- input-lock：`5d3159712d77ccd89e0a38e7e89379562685c98cc208d0b48c4d9f34912a68b4`。
- PACKAGE_MANIFEST：`82ae5dd5539a85facade3b8aea6659e15bcede90e0601fd6cca075912ca248de`。
- 23文件闭包；协议v3、native revision a9-31-managed-r1、证据schema2。
- 拟追加kit/登记本地提交；准确逐文件快照见
  `.acceptance/a9-31-developer/native-kit-r3/registration-approval-manifest.json`。
  17项生成文件与已复核ZIP逐字节相同，不手改native源码。
- `release/win7-product-v3/a9-v26-approved-build-kits.json`仅追加本revision；拟登记字节在
  `.acceptance/a9-31-developer/native-kit-r3/proposed-approved-registry.json`，当前状态REVIEWED_PENDING_OWNER_APPROVAL。
  负责人批准后仅将本项状态/批准人/批准时间/批准范围更新为实际授权，旧kits保持原值。
- 同批保存独立报告、本审批包和任务/STATUS/STATUS_LOG追加记录；不推送、不合并。

## 构建机、执行用户、管理连接

构建机192.168.1.4，主机WIN-2JQ66JE4HTQ，Win10 Pro19045/UBR6466；
VS2019 16.11、MSVC14.29、SDK19041工具与哈希已只读核对。
构建执行用户a9builder，SID `S-1-5-21-3031939772-989444280-3099258187-1005`，真实桌面Session3。
管理员SSH仅负责本包批准的目录/权限准备、传输、固定请求和取证，不执行正式编译/smoke。
普通SSH被Bitvise许可证拒绝；不修改许可证、账户、服务或认证配置。

旧`C:\Users\a9builder` ACL仍绑定SID1004，当前普通账户为SID1005。
不修改此用户目录，改用下列全新D盘路径；写入前再检查不存在且祖先无重解析点。

## 精确远端写入与权限范围

拟新建父容器`D:\A9-A31-V26-MANAGED-20261003`，及三个目标目录：

1. `D:\A9-A31-V26-MANAGED-20261003\control`
2. `D:\A9-A31-V26-MANAGED-20261003\build-r3-a`
3. `D:\A9-A31-V26-MANAGED-20261003\build-r3-b`

仅三个目标目录向SID1005追加Modify（目录/文件继承），不改已有ACE/owner/group；
父容器仅在缺失读取权限时追加SID1005 ReadAndExecute（不继承），不扩大为Modify/WRITE_OWNER。
权限写入前后读回保留SDDL，失败停止，不改旧目录、profile、D盘根ACL或系统策略。

两个build目录分别从同一批准ZIP解压完整23文件；所有work/output/evidence/result新建并留在对应目录。
仅在各build目录内以下四个新建、空、普通用户拥有的v1 fixture目录，
允许本人、不继承、单个WRITE_OWNER ACE（mask0x80000），由已复核build.ps1实际校验并记录：

- `D:\A9-A31-V26-MANAGED-20261003\build-r3-a\work\smoke\allowed`
- `D:\A9-A31-V26-MANAGED-20261003\build-r3-a\work\smoke\cancel-allowed`
- `D:\A9-A31-V26-MANAGED-20261003\build-r3-b\work\smoke\allowed`
- `D:\A9-A31-V26-MANAGED-20261003\build-r3-b\work\smoke\cancel-allowed`

不用于父目录、protected、v2/v3/managed工作区。正式入口`-AllowV1FixtureWriteOwner`只用于上述fixture。

## 固定控制器与输入

准确六项控制脚本哈希/尺寸登记在拟批准registry的control_scripts，原A9-30脚本不变：

- `managed-r3-standard-worker.ps1`
- `stage-managed-r3-kit.ps1`
- `serve-managed-r3-controlled-build.ps1`
- `launch-managed-r3-controlled-build.ps1`
- `test-managed-r3-input-closure.ps1`
- `verify-managed-r3-registry-head.py`

输入位于`.acceptance/a9-31-developer/native-kit-r3/control-scripts/`。
control目录可存上述脚本、批准ZIP/sidecar、批准registry与独立报告快照、standard-temp、
两份固定请求、身份/阶段结果、console/控制器记录，以及5个新建闭包负例副本及其保留的missing文件。
请求文件只能是managed-r3-BuildA-request.json和managed-r3-BuildB-request.json，绑定source、kit、
干净登记commit/hash、实际controller PID及Session3；最多2请求、60分钟，超时不启动下一阶段。

启动入口仅从a9builder真实桌面运行。既有CreateProcessW同令牌/同桌面breakaway方案限定本批固定控制器，
不提供新凭据、不提权、不修改Host Job/UAC；宿主不允许则失败。
子进程必须再次实测普通角色、Medium8192、非提升、无Host Job、SID1005/Session3，否则停止全部下游。
不恢复旧控制器，不允许任意命令或路径请求。

## 检查顺序与失败边界

本地准确HEAD/source/23闭包和独立复核已通过；本地启动验证器负例拒绝未登记HEAD。
控制脚本与完整build.ps1的远端只读PS解析首轮stdin观察超时，原记录保留，未签PASS；
只读回查未发现该parser残留进程。获准传输后必须先实际PS5.1 ParseFile全组通过，未通过不执行脚本。
后续按单文件输入，最终五个PowerShell控制脚本均在实际PS5.1 ParseInput通过，完整kit build.ps1仍待ParseFile。
最终worker每阶段显式重验完整身份；launcher在CreateProcessW前再次核对批准登记/报告/六控制字节。
实际PS5.1纯谓词检查13项身份、10项固定请求正负例通过；直接脚本输出后throw会进入worker外层catch，
没有忽略独立子进程exit的调用。本地HEAD检查也拒绝未批准登记；这些不证明当前普通令牌或原生构建PASS。
随后执行批准记录负例、输入闭包5负例、普通桌面身份、TestSmokeRequestOnly，再进行BuildA。
BuildA失败保留首失败/诊断并停止BuildB、重锁、装配；成功才以全新build-r3-b独立执行BuildB。

两个run-id、完整返回manifest、相同helper字节、logic/capture/v1/v2/v3/managed/release及PE/API/CRT均须核验。
返回证据回收后独立复核/return_review登记/新输入锁各按合同执行，本包不提前签发收口或Win7结论。
源码及冻结kit失败需要修改时保留原kit/目录，形成新的具体源码/kit/目录范围，不复用失败身份。

## 负责人具体批准（2026-10-03）

负责人对本包明确回复“批准上述具体套件登记和构建范围”。
据此批准准确source10114503/r3 ZIP及24路径本地登记提交；本包三目标目录、父容器按需读取权限、
SID1005 Modify、四v1 fixture WRITE_OWNER、传输/固定普通桌面控制器/双构建和回收均获具体授权。
登记状态可更新APPROVED_FOR_RETURN_RECORDING；授权不包含推送、合并、账户/profile/许可证修改，
不代签普通身份、原生返回复核、新输入锁、Electron、Win7或阶段收口PASS。
此前READY_FOR_OWNER_APPROVAL及NOT_APPROVED段落保留为材料形成时点。

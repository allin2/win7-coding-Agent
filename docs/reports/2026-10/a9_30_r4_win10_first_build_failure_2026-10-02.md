# A9-30 r4 Win10 首轮构建与标签失败

结论：r4 身份、编译、logic/capture、PE/API/静态 CRT 检查通过；v1 smoke 因标签恢复拒绝访问失败。没有启动第二轮，不生成产品锁或装配，不登记 DEVELOPER_VERIFIED。

## 源码、批准与实际执行绑定

- 修复 source：`8e2bcfc38b03813f2cfa34ec17e60c89e23f68ff`；仅提交已批准三个路径。
- r4 批准登记 HEAD：`989bac979434552fe8222aed9a06b116ec0a31ef`；[套件独立复核](a9_30_v26_r4_independent_kit_review_2026-10-02.md) P0/P1/P2=0。
- ZIP SHA-256：`f7157f71da3ea91d09ef5891344d5ba7a6850c3207e52e231cdd425c54fbc296`，88092 字节。
- kit input-lock SHA-256：`141fcbd6d406342a3a4187f4b8b2dc0bd6b3c8fd063b2deb64d5bc2856e37356`。
- kit manifest SHA-256：`ed625fe9e5be83fcc3d999c93320ec5b71dc24e31079dae7232db9693250538f`。
- 主机：192.168.1.4 / WIN-2JQ66JE4HTQ；Win10 x64 19045，PS5.1，VS2019 16.11.37507.1，MSVC14.29/v142，SDK19041。
- 目录：`D:\A9-A30-V26-20261001\build-r4-a`、`build-r4-b`，仅新增现有 a9builder 的 Modify；未改账户组、UAC或系统策略。
- 两目录 23 文件闭包及五种输入篡改负例通过，未复用 r3 目录、请求或结果。
- 桌面 Probe：2026-10-02 01:45:34 +08；a9builder 非提升、Medium RID8192、无 Host Job。控制 PID31172、Session2 的实际所有者在请求前核对。
- BuildA 请求：2026-10-02 01:47:35 +08；run-id `17ae5e37-c173-45f3-9201-8e8d41b7a091`。

## 第一轮结果及证据

| 项目 | 结果 |
|---|---|
| 实际标准用户身份与无 Host Job | PASS |
| logic / process capture | PASS |
| 编译 / manifest / PE AMD64 / API / 静态 CRT | PASS |
| v1 smoke | FAIL：ACL_ROLLBACK_FAILED，SetNamedSecurityInfoW(label restore)拒绝访问 |
| 后续 v1取消 / v2 / v3 | NOT_PERFORMED |
| 第二轮 / 字节一致性 / 原生重锁 / 实际 Electron / Win7 | NOT_PERFORMED |

DIAGNOSTICS 为 `WIN7_D013_V26_HELPER_DIAGNOSTICS_20261001-174745.zip`，185488 字节，SHA-256 `ed89c181dd8ad6942d3f2bc1831cc96c7ebafc3836998423bb76e3ac25841cec`。回传 sidecar 与本地实际字节匹配。失败 helper 为349184字节，SHA-256 `8064f46a8ded8aa6e47a5ed772f68efe46cf5bec8484f46e649eb9a9b383dedb`，不可用于锁定或装配。

错误指向 `build-r4-a\work\smoke\allowed` 的 LABEL 恢复；本轮未再报告 r3 的 DACL 首错，不将整体 v1 裁决提升为 PASS。BuildB 请求和 work 未出现。只读 icacls 采样显示 allowed/protected 继承 a9builder Modify，未显示 Low 标签；不能据此证明 Apply 调用成功或全部清理完成。

原始包、worker/Probe/ready JSON、console、smoke 字节、环境与逐文件 SHA-256 索引保存在 `.acceptance/a9-30-developer/closeout/build-a-r4-first-failure/`。首次只读 PowerShell 状态查询超时不代表构建超时；随后 cmd/SFTP 读到结构化 FAIL，保留后续查询原始输出。

## 当前定位与修复材料

源码在 ApplyLowIntegrityLabel 前登记回滚快照，即使 Apply 失败，fatal 分支也会调用 RestoreLowIntegrityLabel。现有错误响应只保留最终回滚错误，不能区分最初 Apply 成功与否。

独立只读复核 `/root/a9_30_r4_label_review`（gpt-6-luna / high）确认这一证据缺口；首次 P0=0/P1=1/P2=1。主代理准备 helper.cpp 白名单内最小修复：先复读比较当前 LABEL 与快照，只有已匹配才跳过冗余写；不匹配或读取失败仍恢复并复读验证。同时保留首个 ACL setup 错误，即使回滚失败也不掩盖它。不改变 LABEL null/合法零 ACE 的既有语义，不新增协议字段、系统 API 或权限。修复未提交、未编译、未正式运行；不属于上述 r4 source。

修复静态复核（2026-10-02 02:01:48 +08）确认22行变更不会把 `applied=false` 误判为 smoke成功；代码静态发现 P0/P1/P2=0。独立复核随后修正对探针身份调用链的判断：其所调用的批准 build.ps1 的 TestBuildIdentityOnly 已执行完整身份断言，失败不会继续。探针未保存 Apply后/restore前实际 Low 的中间读回，因此即使输出 LABEL_CAPABILITY_PASS，也不能作为正向运行证据直接接收；尚未执行的探针仍 NOT_PERFORMED。

微软合同规定设置 LABEL_SECURITY_INFORMATION 需要 WRITE_OWNER，而 Modify 与 TakeOwnership 是不同的权限位；仅有 Modify 不能推导出标签设置能力。[SECURITY_INFORMATION](https://learn.microsoft.com/en-us/windows/win32/secauthz/security-information)、[FileSystemRights](https://learn.microsoft.com/en-us/dotnet/api/system.security.accesscontrol.filesystemrights?view=netframework-4.8.1)。这是权限缺失的调查线索，实际原始返回码仍须同一标准用户探针确认。

探针 `control\probe-r4-standard-label.ps1` 已部署并通过真实 PS5.1 语法解析；只在批准 control 下的新专用目录记录 WRITE_OWNER 打开结果、LABEL/DACL 前后哈希、应用与恢复 Win32 返回码，不增加权限、不改策略。尚待用户真实桌面执行，不以管理员探针代签。

下一步先取得探针事实，再形成准确源码与构建前置修复审批包；新 source 提交、权限范围变化或新的构建目录仍按 A9-30 §4 具体授权。保留所有旧套件、失败目录和证据，不重跑 r4、不推送、不合并。

## A9 Builder 直接 SSH 连接实测（2026-10-02 02:08～02:09 +08）

用户要求核对直接连接；沿用现有公钥、BatchMode、StrictHostKeyChecking=yes，直接 `a9builder@192.168.1.4` 认证成功，whoami 返回 `win-2jq66je4htq\a9builder`。未改密码、SSH配置、账户、权限或策略。

实际 SSH 会话 Session0、ordinary_user=true、token_is_elevated=false、Medium SID/RID8192，但 in_host_job=true；批准的 kit 身份入口明确拒绝，退出码1。因此可直接进行同账户的传输/只读诊断，不能以该 SSH 子进程替代正式构建或无 Host Job 的桌面探针。首次未带已批准的进程级 ExecutionPolicy Bypass 的调用被脚本执行策略拒绝；随后沿用 kit 的命令参数完成身份实测，未更改持久策略。

原始连接与身份记录：`.acceptance/a9-30-developer/closeout/a9builder-direct-connection-identity.json`、对应 stdout/stderr；标准用户标签探针仍待真实桌面执行。

## 已允许的同账户 Job 脱离与标准用户标签实测

2026-10-02 02:14 +08，直接 a9builder SSH 只读查询 Job flags=2048，BREAKAWAY_OK=true、SILENT_BREAKAWAY_OK=false。无需修改 Bitvise 设置；父 SSH Shell 本身仍带 Job，须在创建子进程时显式请求脱离。Bitvise 的[官方 Q185](https://bitvise.com/ssh-server-usage-faq)描述了已允许 Job breakaway 后的启动方式；Windows [CREATE_BREAKAWAY_FROM_JOB](https://learn.microsoft.com/en-us/windows/win32/procthread/process-creation-flags)要求父 Job 允许此操作。

保留两次失败尝试：首条内嵌编码命令超过 Windows 命令行长度，未进入探针；分离控制台版本子进程退出0但没有身份文件，不能登记 PASS。改用新命名的独立控制台版本，CreateProcessW 使用当前用户，不提供凭据，flags=0x01000010（BREAKAWAY_FROM_JOB + NEW_CONSOLE）。2026-10-02 02:20:56 +08，实际子 PID17992 / Session0 返回完整身份：a9builder、ordinary_user=true、token_is_elevated=false、Medium SID/RID8192、job_probe_ok=true、in_host_job=false，kit 身份门 PASS。

这是非 GUI 原生/权限诊断启动路线，不是交互桌面接管；实际 Electron/窗口验证仍须交互桌面。未改 SSH 配置、账户权限、UAC、系统策略或套件，没有启动构建。

2026-10-02 02:25 +08，同一标准用户、无 Job 子进程在批准 control 中的新私有目录运行标签探针，确认：

- WRITE_OWNER 打开失败，Win32=5。
- 原 LABEL 为 NULL；Apply Low 返回5，应用后读回仍 NULL、Low verified=false。
- 冗余 restore 原 NULL 标签同样返回5。
- 最终 LABEL/DACL hash、DACL SDDL、owner 均与初态相同，未追加权限或更改策略。

状态 `PRIMARY_LABEL_APPLY_DENIED_REDUNDANT_RESTORE_DENIED_STATE_UNCHANGED`。这直接复现了当前 Modify 私有目录缺少标签操作能力的负例，也证明该探针中初次应用失败被后续冗余恢复错误掩盖。不能把探针替代修改后 helper 的 v1正例。

实际身份/标签四份远端 JSON 已通过同账户 SFTP 回传并逐文件索引：`.acceptance/a9-30-developer/closeout/direct-ssh-probes-20261002/evidence-index.json`。旧桌面探针命令和全部失败记录保持原样，新 SSH 探针采用独立目录/结果名。

## 最窄的标签权限追加探针草稿（待具体批准）

已准备两个精确控制脚本 `ssh-label-writeowner-child-r1.ps1`、`ssh-label-writeowner-parent-r1.ps1`，在本地 `.acceptance/a9-30-developer/closeout/control-scripts/`；未上传、未执行。

计划只新建 `D:\A9-A30-V26-20261001\control\ssh-label-writeowner-probe-target-r1`。先确认新目录由当前标准用户本人拥有，再仅在该目录授予本人 WRITE_OWNER（ACL的TakeOwnership位0x80000），不继承给子项、不授FullControl、不改父目录权限、账户组/系统特权/UAC/SSH或系统策略。

记录授权前DACL；后续标签测试基线明确包含新增授权ACE。用实际非提升Medium、无Job身份验证 Apply Low、实际Low SID4096/OI|CI/NO_WRITE_UP、restore原LABEL及末态 owner/DACL不变。仅将完整原始返回码和实测比对作为结果；保留隔离目录、授权ACE和全部诊断，不隐含清理授权。该对象权限超出原目录Modify，须由负责人具体批准，不能凭构建指令自行追加。正例成立后才形成正式 v1私有fixture前置和新source/kit审批包；现在不提交或构建。

## 当前账户适用性复核与权限探针准备（2026-10-02）

负责人授权在现有账户不满足构建要求时删除重建。02:41:53 +08 新的直接 Bitvise 连接及同账户独立控制台子进程 PID31268 实测 ordinary_user=true、token_is_elevated=false、Medium RID8192、job_probe_ok=true、in_host_job=false，满足批准 kit 的身份门。因此删除重建的条件不成立，账户及其证据/目录全部保留。新原始记录位于 `.acceptance/a9-30-developer/closeout/direct-ssh-probes-20261002/ssh-native-breakaway-recheck-r4.json`；不将身份 PASS 记作构建 PASS。

权限探针草稿的增量证明已补齐：RawSecurityDescriptor 验证原 ACE 顺序/字节、owner/group/control flags 不变，只新增本人单个、不继承、WRITE_OWNER Allow ACE；WRITE_OWNER 句柄证明失败即停止 LABEL 操作。独立只读复核 02:41:44 +08 的 P0=0/P1=0/P2=1（Low ACE flags 精度）已按建议改为精确等于 OI|CI。超时只终止并等待由 CreateProcessW 返回的精确子进程句柄，记录对象及其他子进程状态 UNKNOWN，并停止后续。静态复核不能代替真实执行。

真实 PS5.1 语法解析首次使用 SSH 标准输入读取，25秒未返回，未执行探针；随后上传 `.review.txt` 审阅材料前的连接检查在 192.168.1.4:22 超时，未上传、未执行、未增加权限。请求单目录 WRITE_OWNER 权限的具体批准，尚未收到答复。原生构建仍停在失败处，旧套件/目录不重跑，新的源码提交和新套件/目录审批待探针事实准备完成。

## 单目录权限探针批准登记（2026-10-02 02:48 +08）

负责人对上轮精确请求回复“批准”，授权新建 `D:\A9-A30-V26-20261001\control\ssh-label-writeowner-probe-target-r1`，仅给 a9builder 本人添加不继承 WRITE_OWNER 并执行 Low 标签设置、读回和恢复探针。批准材料的两脚本 SHA-256/尺寸已复核不变，独立批准记录保存在 `.acceptance/a9-30-developer/closeout/writeowner-probe-approval-r1.json`。此前“待批准”属于历史状态；现在不重复请求同一权限。

批准后再次以既有公钥、StrictHostKeyChecking=yes、BatchMode 连接 `a9builder@192.168.1.4`，SSH:22 连接超时、退出255。未执行脚本解析、权限增加、标签操作或构建。状态 APPROVED_WAITING_HOST_CONNECTION；网络恢复后继续按已批准脚本完成真实 PS5.1 解析及探针，不扩大目录/权限，不删除账户，不重跑失败目录。此批准不代替后续新 source 提交、新 kit 及双构建目录的具体登记。

## 连接恢复、权限正例与账户替换事实（2026-10-02）

网络恢复后，原 a9builder SID1004 的已批准私有目录探针完成真实 PS5.1 解析与脚本哈希绑定。r1 的 FileSystemAccessRule 自动增加 SYNCHRONIZE，使实际新 ACE mask=0x180000；精确增量判据拒绝，未进入任何 LABEL 操作。原 DACL 已读回并恢复到授权前 SDDL。保留首轮失败及恢复原始记录，不改判。

02:56:24 +08，r2 仅在同一已批准目录用 Raw CommonAce 写入本人、不继承、精确 0x80000。完整身份非提升 Medium/无 Job；新增 ACE 和 WRITE_OWNER 句柄均证明成功，Apply Low/restore 返回0，中间实际Low标签读回成功，最终 LABEL NULL、DACL hash/SDDL、owner均与包含授权ACE的基线一致，状态 LABEL_CAPABILITY_PASS。这只证明该私有对象能力，不替代 helper 正式 smoke。五份远端原始 JSON 与 SHA索引已回传 `.acceptance/a9-30-developer/closeout/approved-writeowner-probes-20261002/`。

本地 build.ps1/README 已准备新kit的私有fixture前置：默认缺WO拒绝，只有独立批准开关才给本人新建的allowed/cancel-allowed新增精确WO，原ACE/owner/group/control flags逐字节保留，句柄验证通过才启动helper；失败回滚并记录尝试、写入、恢复三种事实。22行helper LABEL最小修复不变，r4撤销登记未提交。v26定向测试46 PASS、1 Windows专项SKIP；03:17真实PS5.1解析0错误，并对准确build.ps1 SHA `d0ede9aa71748dc3e2bb70b8a3db90155ab51541e1a4a29052edf5986bc12d9e` 的纯ACL增量判据执行1正例/7负例，全通过。该纯判据测试在管理员管理通道执行，不修改文件权限、不编译helper、不证明普通用户构建。独立只读复核P0/P1为0，两项证据精度建议已补充记录和澄清历史v1判据，后续新source/kit/目录仍需具体批准。

随后标准账户公钥认证失败。管理员只读账户列表一度确认a9builder不存在，稍后又出现同名SID1005，仅Users组、enabled=true、Administrators成员=false，FullName为空。原SID1004与新SID1005事实不可混用；旧权限正例不是新账户直接证据。依负责人重建授权准备的两版创建脚本均在创建前置检查处停止，没有创建/删除账户或保存Bitvise设置，没有改密码、组或目录权限；a9builder2不存在。账户消失和重建发生在本代理动作之外，尚未确定操作者。

当前新账户a9builder确已存在。管理员连接可用、SSH网络正常，标准账户仍退出255。Bitvise现有a9builder配置中公钥与本机公钥一致，但实际认证日志03:14:18记录 KeyNotTrusted（测试公钥未被信任），不能仅凭配置存在签发连接PASS。已保留只读记录，等待现有账户/配置稳定后修复其登录绑定，不再新建同用途账户、不使用管理员替代正式构建。新source提交、r5双构建及原生重锁均未执行，Electron/Win7保持NOT_PERFORMED。

## 新SID的Bitvise连接和构建身份门恢复（2026-10-02 03:56～03:57 +08）

负责人要求再次检查，当前 a9builder 和 administrator 均沿用原公钥与 StrictHostKeyChecking=yes 登录成功。a9builder SID1005直接SSH子进程仍带Host Job，仅普通用户、非提升和Medium成立，不能直接启动正式构建。以同一新用户显式创建独立控制台脱离已允许的Job，子PID29816/Session0实测完整身份普通用户=true、token_is_elevated=false、ElevationType1、Medium RID8192、job_probe_ok=true、in_host_job=false，身份门PASS。未修改SSH配置、账户、密码、UAC或系统策略；不使用旧SID1004探针补签新身份。原始记录 `.acceptance/a9-30-developer/closeout/a9builder-1005-breakaway-r1.stdout.json` 及stderr。

身份恢复不代表helper构建已成功。r4仍撤销、诊断工件不可装配；新源码提交及新r5目录/精确fixture权限须按§4具体授权后，再生成准确source绑定套件、独立复核及登记。准备提交的精确路径仅为 `native/helper/helper.cpp`、`native/helper/build-win10-kit-v26/build.ps1`、`native/helper/build-win10-kit-v26/README_BUILD.md`、`release/win7-product-v3/a9-v26-approved-build-kits.json` 和本报告。计划新目录 `D:\A9-A30-V26-20261001\build-r5-a`、`build-r5-b`，本人目录Modify及各自新建 `work\smoke\allowed`、`work\smoke\cancel-allowed` 的不继承WRITE_OWNER；不触碰旧build目录。未提交、未推送、未合并、未创建r5目录或构建。

03:58:09 +08，获授权独立只读复核人 `/root/a9_30_r4_label_review`（gpt-6-luna/high）仅复核上轮P2修正，确认两项关闭，最终静态P0/P1/P2=0；当前build.ps1 SHA与实际PS5.1判据结果绑定一致。复核为静态及原始JSON审阅，不代替正式双构建、smoke或权限执行。

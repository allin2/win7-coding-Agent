# A9-31：开发包 r2 的准确 Win10 执行合同

日期：2026-10-04。Status: APPROVED_FOR_EXECUTION。
负责人在本轮回复“批准”，明确批准本合同§1–5；准确原合同与批准保存在product-r2/approved-win10-contract.md和win10-owner-approval.json。实施、远端实查及实际执行结果将逐项追加。
本合同不是r2本地装配批准的延伸；需负责人具体批准§1–5后才实施和写远端。

## 1. 固定产品输入与成功条件

[本地装配报告](../reports/2026-10/a9_31_product_r2_local_package_2026-10-04.md)已登记：

| 输入 | 准确身份 |
|---|---|
| source / 分支 | 898ee9459a9b987840e94ddef336556ea58dd389 / codex/a9-31-background-tools |
| ZIP | Win7CodingAgent-0.3.0-alpha.2-win7-x64.zip，101324304bytes |
| ZIP SHA-256 | d7323ac4f6ddb674eb93fdea2cd2007ed62679268afe37a6df8df29115122c47 |
| manifest SHA-256 | 1c5084a4a8d194e33af48d6c15d3e661f0808931558eacf41b849016816b6225 |
| managed lock SHA-256 | 7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e |
| helper SHA-256 / Profile | 2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7 / D-013-v26-managed-a9-trusted-shell-current-user |
| 包内State SHA-256 | 4e99d27e7b07dff99a7523a57a3baba5e5ca3c6b48f64cea2b546d5057926243 |

ZIP在原工作树.acceptance/a9-31-developer/product-r2/package/；manifest在同package/.work/Win7CodingAgent-0.3.0-alpha.2-win7-x64/。
包为A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE，784文件，外部正式验收资格false、authority不存在。
成功条件是该包在准确普通Win10桌面通过真实main/preload/IPC/SQLite/Renderer入口，直接验证Windows路径归属修复及后台/输出/Policy/退出/恢复、安全失败边界和实际进程收尾，返回全部绑定原始证据。实现方不自签独立收口或DEVELOPER_VERIFIED。

## 2. 本地实现精确范围及冻结

拟追加C14授权，仅以下四个新外部Win10测试源：

1. .acceptance/a9-31-developer/product-r2/control-scripts/stage-product-r2.ps1
2. .acceptance/a9-31-developer/product-r2/control-scripts/launch-product-r2-desktop.ps1
3. .acceptance/a9-31-developer/product-r2/control-scripts/serve-product-r2-desktop.ps1
4. .acceptance/a9-31-developer/product-r2/control-scripts/product-r2-driver.cjs

从product-r1/control-scripts的最新框架精确提取到新路径；原五源、冻结R10和全部旧root/signals不修改、不恢复。
准确基准SHA：stage039eb33edd4bf1bee270b354bcd1fbd031c7be0726e7279c4b77ff01c2890d40；launch eeaa407a781602feb1b9f3dcb115fac55c7ede40ea8526576e46c723a2b6b095；serve a31cb36863ac008a418b4bb5f44b8aba54846f2bca60cb96d40212da8bfbc060；driver356c6ebd291c44c868733996de9f2b4b624fea317d3987295a5be6f0e5082388。
允许差异仅：新source/ZIP/manifest/锁/根/本次批准身份绑定；不再指向旧产品/宿主/inputs根；对应路径和审批标签替换；Windows归属/历史facts查回场景及最短链路前置；同范围普通夹具修复和定向检查。
九字段请求schema、真实句柄/父/Session/creation/映像/退出、回执预算、入口claim及原完整性/身份/安全判据保持；不新增通用执行接口或任意命令/PID接口。
新三PS及安全逻辑通过准入后冻结为新master；driver修复用新按SHA命名的不可变revision/checks/registration，不改已执行版本。最终字节在实施和实查后绑定准确hash，本草案不伪造尚未形成的hash。

仅复用已有V4捕获C#固定字节和已登记Win10 API/Profile，不增加C#实现路径或API：
capture-source.cs为19439bytes，SHA dbc85763ce25287adcb4c853e37963755c56d9561f9d06e41f53bfdb78e952cd，来源product-r1/r10-preparation-return/inputs/。
历史DLL5450d5bc193330367bac5735e91774cc4404230075634e73b5b4a05904fa9d0f、build6090e5445c598807605b174a0d9459ef78ed5a37ef59a6bcb808e0da5b72760b保留原source35a19250/批准绑定，不改写成新source。
现有Capture-Build校验要求build.source绑定本次产品source；因此在新根准备固定编译一次该相同C#输入，实际生成本批DLL/MVID/build证据并冻结，避免改写或放宽旧build来源门。这是外部Win10取证组件准备，不是D-013原生重建。
Profile继续WIN10_PS51_NET4_QUERY_HANDLE_CAPTURE_V4_TEST_ONLY / QUERY_LIMITED_INFORMATION_SYNCHRONIZE_SNAPSHOT_PRECISE_UTC_V4，含GetSystemTimePreciseAsFileTime，明确不可作为Win7套件、产品依赖或SBOM。
版本化请求/捕获/回执格式和证明规则不变；若需新增API/字段、修改证明判据或其他源路径，停止相应动作，先形成具体修订/适用ADR。

## 3. 准确远端范围、账户与准备硬门

预期目标为192.168.1.4 / WIN-2JQ66JE4HTQ / Windows10 build19045。以上是待重新验证的历史身份，不是本轮在线证据。
严格SSH沿用已配置密钥和known_hosts，StrictHostKeyChecking=yes、IdentitiesOnly=yes；主机密钥/机器/OS/profile不符立即停止。
Administrator SSH仅用于本根准备/传输、固定编译/准入、固定phase请求、查询和回收；不能替代产品执行身份。

新根仅：
```text
C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R2-20261004-R1
```
根必须不存在且无reparse，继承权限，不改ACL。部署前空闲至少2GiB、每请求前至少1GiB、根总量最多1GiB；不足只暂停，不清理或迁移历史。
只允许package/host/inputs/control/requests/runs/evidence/compile及这些目录下框架已经定义的有界文件：
package展开本节固定ZIP并逐文件核验；host从同锁定Electron ZIP提取已有捕获宿主，逐文件hash绑定，不复用旧R10可变目录。
inputs固定包输入/manifest/锁/本次批准和新master及capture-source/DLL/build记录；control仅本次三PS/driver及按SHA命名的revision/checks/registration。
requests仅固定九字段/八phase/32hex run ID；runs仅隔离workspace/userData/fixtures；evidence保留原始有界诊断、实际树、安全返回和真实相关UI截图。禁止触及用户日常数据库、provider配置、项目或旧控制器。
compile/<新32hex>仅固定C#输入、DLL、compiler stdout/stderr、compile-result及框架既有isolated-temp，不安装组件或调用在线解析。
固定csc为C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe，版本4.8.9232.0、SHA aae1db57f898ca8bda18590c56f86ced6d0ead80c22033b76fdfe9119706f116；三参考同目录：
mscorlib.dll cbba0b14d43901ff3d92cc44efe6a79149bfcaa3006c08ca05e186b2a75b54b5；
System.dll af12577769e3b0c94fc8e4715cdfd21cbcf0f665bf63489f81e5a0934c94c7e4；
System.Core.dll78c77c7250b6e318e69c1162980640bf7da5e8d3303d3abcc32401a52d667139。
kernel32.dll预期版本10.0.19041.5915、SHA4636f65d449b1353100578c6cb139933cf2b134f5e246119d18968873a058bed。
系统工具/参考/签名/准确API入口漂移即停止，不改系统、时钟、Job、UAC、账户、服务或Bitvise。

准入先检查新Node/Renderer输入与实际PS5.1三解析、master/revision/输入/限额/claim正负例及编译真实句柄exit0。
新DLL实际检查原查询/区间/文件/回执/精确UTC判据与关键负例：最多16个明确夹具子进程、每个最长10秒、总200次捕获/60秒，全部实际实例和退出绑定；粗UTC不得回退，206ticks未来拒绝等反例继续有效。
宿主、DLL/源码/工具、产品闭包/实际模块和新控制输入均核验后才允许冻结/普通派发。管理员准入与普通产品结果分别登记。

## 4. 普通桌面、八phase与重试

产品/dispatcher/worker/Electron均须直接证明SID S-1-5-21-3031939772-989444280-3099258187-1005，预期profile C:\Users\a9builder.WIN-2JQ66JE4HTQ、交互Session3、Medium8192、普通非提升、无HostJob。会话/profile变化先重新绑定合同，不猜测；普通身份不能代替完整Job证明。
由Computer Use在普通A9 Builder桌面启动新入口一次，SSH后续固定派发/取证/回收；不恢复R10、不用计划任务/管理员启动或Job脱离绕过普通门。
同一窗口最多120分钟、16个固定phase请求，无自动重启或后台服务。旧HALTED/final/过期、重复entry claim一律拒绝。

先受控普通Boot失败并取得真实整树exit，无未知后同一dispatcher PID/creation/master正常Boot；之后先Background中的最短真实链路，再完成受影响回归。
本次顺序明确为Boot→Background→Shell→EncodingSecurity→FailureBoundaries→StopExit→ReleaseExit→Recovery；八个phase名称和九字段schema不变。Background先执行实际工作区/模式→start一个进程→读到输出→Stop→核对starting归属落盘和实际退出，再扩展本组矩阵。
旧R10先Shell/编码后Background的顺序仅为历史；此草案获批后才采用本次顺序，不恢复或重解释旧运行。

| phase | 必需直接覆盖 |
|---|---|
| Boot | 包/Node16.17.1/ABI110/SQLite/main/preload/Renderer隔离/真实窗口、模式/输入；同窗口受控普通失败后成功复验 |
| Background | 同一Windows目录display/canonical大小写/斜杠与中文空格真实归属；先starting审计落盘再native；旧路径facts重启查回；错属/归档拒绝；三可用/第四拒绝、ready失败、游标重复/过期/未来/错属、双Stop、活动切换限制、Policy/高影响确认 |
| Shell | 新包实际双源/S01–S03增量顺序、上限、Stop、持久化与原Turn绑定 |
| EncodingSecurity | UTF8/CP936/UTF16LE、CRLF/无换行、跨块秘密/各出口、预算内慢消费者成功及700ms背压失败/清理负例，不放宽原5秒交付预算 |
| FailureBoundaries | 协议request/序号/Base64/计数/终态与必需审计反例；明确注入位置、零后续派发及真实树结束 |
| StopExit | 真实后台root/child、用户正常关闭选择停止、实际取消/终态/整树退出、SQLite事实 |
| ReleaseExit | release意图先落盘/逐句柄回执、正常关闭留给系统、helper退出、准确root/child存活及自然退出；回执丢失/取消竞态如实失败 |
| Recovery | 事件不重复、facts-only恢复/PID身份漂移/不接管旧stdout、不自动Provider/tool；隔离崩溃不造终态 |

非ASCII/UNC等原本地受控路径用例只按精确矩阵继承，不冒充未建立的UNC共享实机证据。
故障反例保留原始错误，只有边界按设计成立、零后续产品派发且实际受影响树结束时可记CASE_PASS；不是把错误改为成功，不在失败产品实例继续派发。
同四路径内普通夹具修复可在16请求/120分钟范围使用新不可变driver revision，必须先定向检查/冻结且旧实际树结束；不热改master/捕获/安全规则。
身份、完整性、安全、必需审计或未知生命周期异常立即HALTED停止下游；同类失败两轮未解释先最小诊断，不延长等待、减少断言或放宽归属/时钟/退出判据。

## 5. 取证、停止与授权边界

逐run绑定source/ZIP/manifest/锁/master/revision/请求和实际账户/Session/权限；原始响应先保存再断言，记录实际模块路径/哈希、SQLite安全事实、真实窗口及持有实例exit。
受控停止请求允许框架正常退出并以原真实句柄查询/等待取证；不任意PID强杀，不以进程后来不存在补签exit或未知树。
返回完整文件inventory/尺寸/SHA并逐项验证，合成秘密出口扫描、主输入/控制后飞行、旧实例不存活观察与实际已知退出分别陈述；原FAIL/UNKNOWN不改，未执行记NOT_PERFORMED。
原原生ADR-0158有限准入及历史P1/UNKNOWN/raw-pipe背压缺终态保留；新包八组不借用旧三组PASS。
本合同请求仅批准§1–5的四源实施/定向修复/检查、新根准备与固定外部capture编译/冻结传输、普通桌面窗口/固定八phase/取证回收。
不包含产品/native/锁修改、源码提交/推送/合并/发布、账户/ACL/UAC/服务/Bitvise改变、独立代理或Win7。独立收口和负责人DEVELOPER_VERIFIED裁决后续另行授权。


## 6. 本轮批准登记

负责人回复“批准”，授权范围为原合同§1–5；原合同SHA-256为9c21e3b78811f45f7502a5d3d29179932776d30f5b8401f260454d66e45ca99e。原始批准与执行输入保持不可变，最新状态按实际证据更新。

本轮实际结果见[准备、范围纠错与普通入口阻塞报告](../reports/2026-10/a9_31_product_r2_win10_preparation_and_desktop_block_2026-10-04.md)。准入文件门负例遗漏旧R5批准读取，违反本合同仅新根范围，原记录保留；修正夹具在新根隔离run用明确无效批准数据完成原16项，固定执行源/master/DLL及判据未改。新metadata revisions和checks/registration已通过目标冻结校验，原r1登记不再派发。
普通入口因Computer Use目标输入无响应而未启动；新根零claim/ready/请求，窗口未开始。八phase、同控制器复验、独立收口与Win7均NOT_PERFORMED。§4普通身份/入口门和全部硬门继续适用；同范围普通动作已获批准，无须重复批准；当前阻塞不授权管理员入口、旧R10恢复或范围扩大。


## 7. 负责人手工协助普通入口（2026-10-04）

负责人随后表示“如果远控输入不行，我可以手工参与。”据此允许在WIN-2JQ66JE4HTQ的A9 Builder普通桌面由负责人打开全新非管理员CMD，一次执行同一冻结r2入口命令；仅替换§4的输入操作者，不变更源/包/master/revision、SID1005/Session3/Medium/非提升/noHostJob、120分钟/16请求及全部安全门。后续固定派发/取证仍由代理完成。旧窗口残留R10文本不执行，旧控制器不恢复；原批准§1–5和历史输入保留。

最近只读检查UTC 2026-10-04T06:30:43.8945785Z仍无claim/start/ready/final、正式请求0，普通token未取得；手工入口待实际启动，八phase、独立收口及Win7均NOT_PERFORMED。入口启动须先用实际进程实例/token核验，再按受控Boot失败→真实整树退出→同dispatcher正常Boot→Background最短链路的顺序推进。证据为product-r2/manual-assistance-owner-steering-r1.json和manual-entry-watch-063043241315.json。


## 8. 普通执行与停止登记（2026-10-04）

负责人一次手工普通入口实际核验通过；同dispatcher受控Boot失败/真实树退出后正常Boot8项PASS，Background最短28项PASS。完整后台首错游标夹具误取历史句柄，修正匹配当前handle后通过相关游标/3-4/Stop项，但永久删除确认场景未批准即真实派发Remove-Item。SQLite+包内Policy证明产品缺口，完整Background FAIL；六个下游phase、独立与Win7 NOT_PERFORMED。固定stop取得dispatcher exit0，112个dispatcher树实例/合并116个持有实例退出与后飞行闭合；479新增文件43568598bytes回收核验，原1067文件不变。当前统一矩阵为product-r2/win10-evidence-matrix-r4.json；raw COMPLETED/Background标记只表示停止/最短范围。r2已停止不可恢复，A9-31仍IMPLEMENTATION_IN_PROGRESS。

实际报告：[r2执行与Policy失败](../reports/2026-10/a9_31_product_r2_win10_execution_and_policy_failure_2026-10-04.md)。具体三路径本地修复提案：[Shell删除Policy修复](../plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)，DRAFT_NOT_APPROVED；不扩大本轮已执行授权，不改源码/包/native/锁，不提交/推送/委派。

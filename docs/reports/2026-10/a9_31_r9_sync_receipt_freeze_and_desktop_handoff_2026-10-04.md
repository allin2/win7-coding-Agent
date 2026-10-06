# A9-31 R9 同步只读回执、冻结和普通桌面交接

日期：2026-10-04（北京时间）。结论：`R9_FROZEN_READY_DESKTOP_NOT_PERFORMED`。
A9-31 保持 `IMPLEMENTATION_IN_PROGRESS`；普通产品八组、同窗口普通失败后成功复验、独立收口和 Win7 均未执行。

## 1. 授权和证据边界

负责人批准 [R9 §2–4及 ADR-0167](../../plans/A9_31_PRODUCT_R1_R9_SYNC_PROBE_RECEIPT_APPROVAL.md)，仅五外部测试源及准确 R9 目录。
产品 source `35a19250ed6589f6a7ba35b940a784325970c111`、分支 `codex/a9-31-background-tools`；无提交、推送、整合或委派。
产品/native/managed锁、主工作区及全部历史候选/失败/UNKNOWN 保留。
Administrator SSH 只用于准备、编译、检查和传输，不能代替SID1005普通桌面产品证据。

实现记录原 spawnSync 准确只读cmd-ver的实际pid/status、真实父kernel ACK及UTC/单调区间；
固定上限、250ms等待、先fsync回执再fsync publication。仅实际OpenQueryHandle/87/cmd.exe/准确父和唯一完整回执可形成另一种证明。
OS creation仍UNKNOWN，native query handle为NOT_OBTAINED，kernel cleanup为NOT_PROVEN_BY_THIS_RECEIPT。
不能虚构Held、操作数字PID，或将其他短进程失败归入例外。

## 2. 编译与实际API准入

固定Framework csc及三个参考的版本/哈希/签名通过。实际compile run：
`c7f3122e5b9547a194c05e541c1e9150`，compiler exit0。
source `cdb3cc68f391c39e47d2193dec335c0587f1573d9b8b8cac927ead4063dfbe2a`（18548bytes）；
DLL `f815675cbdbf9091a7c9ca89d6898c6c5cb54738eb9798e8a6e1b3fd6fdc6a94`（18944bytes），MVID `a91f1189-675e-40de-ac0d-91a3e58c0ab4`。
五原始编译返回已逐字节核验；格式化sidecar不代替原build hash。

实际Electron22.3.27/Node16.17.1/ABI110 API run：
`e86e5cdaa7cd41d1bc6cf4466b8349e1`。
真实父PID72604/creation639266429917517697/Session0由kernel pin证明；
原同步返回cmd PID58684/status0，signal/error null。
实际raw captures保留该PID的OpenQueryHandle/87；单调包围快照与真实调用区间有严格交集，UTC一致且同父回执唯一。
原association记录注明“eligibility error87是受控validator输入”，独立raw captures则确实含实际87；
当前77项检查再用原文件/哈希和实际Gap核对reader，构造resolver正例不冒充实际子实例证明。

实际错误argv退出1、错误status退出7、不存在程序ENOENT通过；
真实双查询和四个故意错误的PID/creation/Session/image预期metadata均拒绝。
不声称制造Windows PID复用。父实际结束；上述为Administrator Session0 API证据，不是普通产品PASS。

UTC16ms全包含与单调全包含的两次准入失败保留；最终按已批准“区间支持且唯一”冻结严格交集和两侧4096ns转换余量。
同父重叠多回执、重复PID、无交集、UTC矛盾仍拒绝。原失败/源hash/输入不改判。

## 3. 当前检查与冻结

| 检查 | 结果 | 证据等级 |
|---|---|---|
| Node语法、原请求/硬门 | 73项PASS | 本地Node20 |
| 新回执/时序反例 | 88项PASS | 构造输入，不执行进程 |
| Renderer表达式、产品闭包 | 19/784 PASS | 本地准确字节 |
| 原ASAR负例 | 8项INHERITED_EVIDENCE | 完整函数/依赖/调用/config及原hash相同 |
| PS5.1三源解析 | PASS | 当前源，传输后再ParseFile |
| schema | 315项PASS | 构造正负输入 |
| query/API、interval | 27/19 PASS | 实际API及标明的受控metadata/诊断 |
| file/entry/concurrency | 16/22 PASS | 实际隔离文件和并发门 |
| 当前回执reader | 77项PASS | 原实际回执重验2项，其余构造/文件对照 |
| 远端冻结登记与闭包 | 40+8登记文件PASS | 全hash/解析/登记，784产品及73宿主 |

Node首轮末检曾把“UTC部分交集”错当负例，Missing expected exception原输出已保留；
改为整段位于调用前/后，新增部分交集正例和不同PID重叠负例；未改安全实现迎合测试。
定义提取误含formal bootstrap、回执探针重用旧run-id都在派发前拒绝，原输出保留后仅修检查编排。
传输发现已准备的scope-approval，经相同size/hash只读核对后复用，未覆盖；其他既存目标仍拒绝。

Master `6e2131f085fc6f20cd4d96992bb16ce2965c5f10886bbda12a155f8796340266`；
原正常revision `248dedd3f0282558d8eb8a2499b13bd4140ac0f3e1657e0bd702ecb2fa833515`；
受控Boot revision `877845b76f890972700e56f8ed2765c268ee2a3909b57f7f7cfe75e669afb70a`；
退出补充正常revision `e6c6394dbd399ce67908789ff86d411252dcc3321b818a7fae578474e22d7501`。
固定三PS/C#/两安全源片段保持不变。
原实际API driver SHA83019443…b16a69a7保持原绑定；
当前源按完整安全片段hash继承准入，远端亦重读原不可变源码核对，不改绑旧报告。

## 4. 退出补充的范围与未执行项

新普通driver版本准备：真实执行后丢execution_released帧；release_intent写入有界fsync日志后真实发送、pending Stop零cancel；
真实Stop完成后release零移交。丢回执保留release_unknown/cleanupRequired，不产生leftToSystem或无归属Stop。
根/子存活由controller已持有原实例再查询；不靠数字PID，不增加kill权限。
这些负例使用锁定native、打包Runner/manager和外部状态日志，不能代签Core/SQLite/UI；
随后仍须实际产品退出选择，证明SQLite intent/receipt、helper结束、根/子移交与自然退出。
模块负例和实际产品执行仍NOT_PERFORMED，准备或静态通过不能关闭缺项。

## 5. 启动阻断和交接

严格SSH192.168.1.4连接成功，WIN-2JQ66JE4HTQ/build19045。
最后只读快照UTC2026-10-03T17:44:51.9197137Z：
A9 Builder console Session3 Active、C空闲5623853056bytes；
R9 entry/start/ready/final均不存在、requests0。
新dispatcher必须实际证明SID1005/Session3/Medium8192/非提升/noHostJob，桌面在线本身不够。

Computer Use两次返回“The Mac is locked and automatic unlock could not unlock it”。
已请用户解锁Mac；未用SSH GUI注入、计划任务或管理员产品执行替代。
解锁后主代理在UU的准确A9 Builder CMD启动一次：

```text
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261003-R9\control\launch-product-r1-desktop.ps1" -PinSha256 6e2131f085fc6f20cd4d96992bb16ce2965c5f10886bbda12a155f8796340266
```

先核普通dispatcher身份/唯一claim/期限，再CreateNew受控Boot请求；真实树结束且没有未知项后，同PID/creation/master取得正常Boot和其余七组。
正常八组使用退出补充revision，受控版只用于指定普通失败对照。两小时/16请求不变，硬门失败不恢复。
独立审核、DEVELOPER_VERIFIED及Win7不因本次准备改判。

## 6. 可恢复材料

根 `.acceptance/a9-31-developer/product-r1/`；矩阵 `r9-evidence-matrix.json`逐项区分本地、实际API、继承和未执行。
每个检查input、原stdout/stderr、独立run-id及hash均保存。不要清理原始失败或返回。

| 记录 | SHA-256 |
|---|---|
| `r9-freeze.json` | `654e2f764e97669e11c647b74f5075873ef2d21d8980dadb602a9db456d1c1a0` |
| `r9-release-supplement-freeze.json` | `e7f875b3ac61d17f03cfc84c46adf3083556964bd1b7843b18df7c58f788ca48` |
| `r9-frozen-all-bytes-registration.json` | `54243b98cdc11309b09d05b3226ca216c12a040315e0b8303471cc626ff830b7` |
| `r9-supplement-registration-check.json` | `8dbccfd06bdc6a236d63252fe2f74c6d5749e6c0fd92fec92990c8548a02045d` |
| `r9-evidence-matrix.json` | `72a53057f178e99149820ea306813d6b8ce622ad18b084fb2aac6257959c61dd` |
| `r9-pre-desktop-final-snapshot.json` | `509a7e15bc67698875f6c80865a429fe100d6ad30298c5baad625f04f92b10b3` |


## 7. 2026-10-04 后续实际运行登记

上述准备和Mac锁屏记录保留原文；解锁后Computer Use在普通A9 Builder CMD启动R9并实际执行。[后续直接报告](a9_31_r9_desktop_partial_pass_and_clock_boundary_halt_2026-10-04.md)记录同控制器受控Boot失败→正常Boot8项PASS、Shell22项PASS，以及编码54项断言后时间边界HALTED。
R9不恢复；301原始文件/hash/秘密扫描和784/73/四输入后飞行已核验，顶层exit UNKNOWN。原准备矩阵不覆盖，新r9-desktop-evidence-matrix绑定当前事实；其余五组/独立收口/Win7 NOT_PERFORMED，A9-31不提升状态。
[R10精确UTC合同](../../plans/A9_31_PRODUCT_R1_R10_PRECISE_UTC_CAPTURE_APPROVAL.md)为待批材料，新增API/Profile/新根尚未实施或写入。

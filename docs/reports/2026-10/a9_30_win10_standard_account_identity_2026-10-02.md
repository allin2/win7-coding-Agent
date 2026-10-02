# A9-30 Win10 专用账户与构建身份阻断

当前结论：BLOCKED_EXECUTION_IDENTITY。r3 输入已批准并部署；正式双构建、返回复核、产品重锁、真实 Electron、Win7 均 NOT_PERFORMED。不登记 DEVELOPER_VERIFIED。

## 已完成与授权

负责人明确批准专用标准账户 a9builder、自动生成且不输出密码，以及 control/build-a/build-b 目录读写。主机 192.168.1.4 / WIN-2JQ66JE4HTQ。账户已创建，未加入管理员组；未调整 UAC、系统策略或授予系统特权。只在三个批准目录增加 Modify。凭据最初为用户级 DPAPI，WMI 控制进程无法稳定解密；随后同一私有目录保存机器级 DPAPI 加密副本，private ACL 仅 Administrators/SYSTEM。未回传任何凭据或密文。

r2 已撤销，P1 修复 source ff153483ef4e6df5daae59c6dcef9784e29d4140。本地定向154 PASS /1 Windows-only SKIP /0 FAIL；独立r3复核P0/P1/P2=0。批准登记提交0a96eb396241fa5f03aa67e085a22e756cdfae1a，与 HEAD 文件一致；未推送/合并，主工作区未动。

r3 ZIP SHA-256：c0add425ed6510bc8e7f5946ab806f200101f99d42ec0557685b79ff36508698。ZIP已上传control，并解压到两个尚无work/output/evidence/result的批准目录。23文件及逐文件manifest哈希核对通过。真实Windows PowerShell5.1执行原v2请求自检 PASS；桌面入口脚本语法检查通过。此自检不计入原生构建或当前候选PASS。

## 实测失败边界

| 入口 | 实测事实 | 判定 |
|---|---|---|
| 原受限Administrator | ordinary_user=true，但Elevation=true、HighRID12288 | 拒绝，r2缺陷修复 |
| WMI Administrator控制进程 | IsProcessInJob=false | 仅控制进程事实 |
| Start-Process / ProcessStartInfo Credential标准用户 | 非提升、Type1、MediumSID8192，HostJob=true | 拒绝 |
| 原生CreateProcessWithLogonW及breakaway参数探针 | 身份断言拒绝，未运行构建 | FAIL |
| LogonUserW+CreateProcessAsUserW | Win32 1314 | FAIL，不授予新特权 |
| 标准用户真实桌面shell | 尚无直接证据 | NOT_PERFORMED |

不能从现有证据断言是哪一个系统组件赋予Job；控制进程无Job不等于子进程无Job，breakaway失败也不能证明某个未知Job具体限制。独立只读复核建议停止这些启动变体，验证真实桌面入口；保持判据。

## 桌面入口与远程继续

见 [Win10桌面构建入口](../../plans/A9_30_WIN10_INTERACTIVE_BUILD_ENTRY.md)。必须从a9builder自己的真实桌面启动；入口核对账号及SessionId>0，然后执行r3同一身份门，不使用管理员凭据bootstrap。只有Probe通过才保持控制窗口等待明确BuildA/BuildB请求。当前未写任何构建请求。

若Probe失败，保留JSON，不能开编译器；若通过且控制窗口存活，主代理可远程写固定批准kit/phase请求并逐次复核。返回证据独立审阅后才生成锁。控制器超时不改判成功，未证明清理时保持UNKNOWN。

独立控制入口复核首轮指出两个P1：管理员bootstrap仍沿用失败启动路径，以及执行目录未绑定批准ZIP。旧入口已首行拒绝；新入口从标准用户真实桌面直接运行。每phase执行build.ps1之前逐文件比较23路径/尺寸/哈希，拒绝缺失、额外文件/目录、reparse、已有输出。真实PS5.1实际函数验证两个批准目录PASS；script/profile字节漂移、额外文件、缺文件、空work目录五个负例均拒绝，未运行编译器。日志 `closeout/r3-input-closure-real-ps51-test.stdout.bin`。桌面身份结果仍NOT_PERFORMED；不将入口修复写成运行PASS。

独立复核追加指出旧请求复用P2，已在创建ready之前拒绝任何既有BuildA/BuildB请求，保留文件。最终复核人 `/root/a9_30_native_kit_review`，实现人 `/root`，reviewed_at `2026-10-02T00:52:29+08:00`，P0=0/P1=0/P2=0。复核路径为A9-30工作树；前一条代理报告错误引用主工作区路径已由复核人作废并更正。此结论仅覆盖入口源码和已有输入校验，不签桌面Probe或构建PASS。

## 证据与控制边界

`.acceptance/a9-30-developer/closeout/execution-identity-evidence-index-20261002.json` 逐文件绑定探针、自检与部署原始字节。private凭据文件不纳入索引。所有失败原样保留。

新增控制脚本只在批准control目录运行，不加入产品；系统LogonUserW/CreateProcessWithLogonW/CreateProcessAsUserW/CloseHandle/WaitForSingleObject/GetExitCodeProcess为构建控制API，不修改产品导入。来源为构建机Windows系统advapi32/kernel32；原生返回仍须记录实际环境，不将控制预检冒充正式构建证据。

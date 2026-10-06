# A9-30 r3 Win10 桌面构建入口

当前原生构建 NOT_PERFORMED。远程标准账户代启动未通过HostJob门；不得调整UAC/策略、授系统特权或放宽r3。

前一版管理员代启动入口已停用，不能作为恢复依据。需要在192.168.1.4本机以a9builder真正登录桌面；用户可在本机为该账户设置自己掌握的密码，无需向主代理发送密码。主代理不远程重设密码。直接从该用户开始菜单打开Windows PowerShell5.1，运行（不要经SSH/agent exec容器）：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\A9-A30-V26-20261001\control\start-r3-standard-desktop.ps1
```

保持窗口打开。入口只允许a9builder、SessionId>0，直接运行身份探针，不再读取凭据或以管理员代启动。未通过立即停；通过后等待最多30分钟固定BuildA/BuildB请求，不安装服务或修改系统策略。告知主代理已执行，由主代理读取结果、确认controller进程/会话仍有效后逐次控制。真正无Job仍须实测，不能由SessionId推断。

## 固定输入与输出

- source：ff153483ef4e6df5daae59c6dcef9784e29d4140；登记HEAD：0a96eb396241fa5f03aa67e085a22e756cdfae1a。
- kit：control/A9_30_V26_BUILDKIT_r3.zip；SHA-256 c0add425ed6510bc8e7f5946ab806f200101f99d42ec0557685b79ff36508698。
- 执行目录：D:\A9-A30-V26-20261001\build-a、build-b，已提取并校验23文件；不能复用出现work/output/evidence/result的目录。
- Profile：VS2019/v142/MSVC14.29/SDK19041/x64/静态MT，VsDevCmd只设本进程环境，不安装组件。
- control/interactive-Probe-result.json必须IDENTITY_PASSED且真实普通、非提升、MediumSID8192、无Job；正式build.ps1再次查询。
- 每个phase在执行build.ps1之前，对批准ZIP和对应目录核对全部23路径、尺寸、字节SHA-256；缺失、额外文件/目录、reparse或已有输出立即拒绝。实际PS5.1两个目录正例及五种篡改负例通过；不等于原生构建。
- 控制器只接受BuildA后BuildB，以及正确固定kit SHA；请求不得包含任意命令。每个phase仅一次，失败保留文件并停止。
- 每份正式返回必须独立run-id；主代理核对两份实际证据后安排独立返回复核，不直接形成lock/PASS。

## 交给Win10 agent的提示词

请从a9builder自己的已登录桌面执行上述Probe，并保持控制窗口。不要把脚本放进会套HostJob的agent exec容器；若无法操作真实桌面，报告NOT_PERFORMED。读取control/interactive-Probe-result.json及interactive-controller-ready.json，确认普通非提升Medium且无Job。不得执行已停用的管理员bootstrap。不输出密码/密文、不改UAC或策略，不手工改build.ps1、manifest或锁，不重跑失败目录。让Mac主代理逐次发固定BuildA/BuildB请求；若任一失败，保留控制JSON、控制台日志和DIAGNOSTICS，停止后续构建。Win7/真实Electron/Alpha2/RC均不在本次构建结论内。

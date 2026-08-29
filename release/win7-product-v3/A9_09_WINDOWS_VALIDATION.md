# A9-09 / WIN7-20 增量实机验收

WIN7-20 必须解压到新目录，并保留 WIN7-19 程序目录、候选 ZIP、manifest 与外置证据以便回退。
先执行 `RUN_A9_09_INTEGRITY.cmd <原始 WIN7-20 ZIP>`，再以普通用户启动正式
`electron.exe`。证据只能写到候选目录之外。

本轮按 ADR-0097 继承 WIN7-19 未受 D-013 v25 影响的证据；包内
`A9_09_VALIDATION_KIT.json` 中所有 `W20-*` 用例必须由当前候选直接执行：

- Current-User Primary Token、协议 v2、Job/stdin/双流/清理证明与工作区 ACL 不变；
- PowerShell 5.1、CMD 和一个用户显式配置 Shell 的路径/哈希/版本绑定；
- 普通非秘密环境覆盖可见，Provider/API Key 和 Electron/Node/TLS 控制变量不可进入 child；
- 真实 `deadlineMode=none`、前台 Stop、后台 ready、双 Stop、崩溃/恢复、退出锁与零残留；
- 中文空格、编码换行、junction、近 MAX_PATH 及普通用户优先矩阵。

用户显式 Shell 必须从“设置 → Shell 与工作区环境”选择种类，再由主进程打开的 Windows 文件选择器
选择 `.exe`；页面不能直接把路径作为 IPC 参数提交。环境覆盖按每行 `NAME=value` 输入，应用后只回显键名，
不回显值。切回“自动选择”时使用规范系统 PowerShell/CMD 路径。

严禁关闭 TLS/SSH 主机密钥验证，严禁修改系统 PATH、服务、注册表、防火墙或安装未知组件。
完成后用 `RUN_WIN7_20_REPORT_VERIFY.cmd` 校验报告、候选身份与全部外置证据哈希。只有
A9-09A、Win10 双构建和本轮实机项目全部通过，才能签发 `A9_09_WIN7_20_GO_FOR_ALPHA`。

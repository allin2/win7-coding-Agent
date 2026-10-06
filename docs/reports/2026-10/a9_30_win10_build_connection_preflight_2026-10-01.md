# A9-30 Win10 构建连接预检（2026-10-01）

```text
Status: CONNECTION_RECOVERED / BLOCKED_EXECUTION_IDENTITY_AND_REVIEW_PRECONDITIONS
Requested Host: 192.168.146.1
Source: a3b6a67dbda43c41d27cedccbdf0875e1acc46d9
Host OS / Toolchain / User / Job: UNKNOWN
Native Double Build / Real Electron / Win7: NOT_PERFORMED
Product Native Input Lock: NOT_LOCKED
Independent Reviewer: NOT_ASSIGNED
```

负责人明确指示“当前win10地址是192.168.146.1，帮我进行构建”，据此登记指定主机上的构建授权。
此指令不代替独立设计/安全/API/套件复核，不授权实现方自签，不扩大为提交、安装、提权或系统配置变更。
现有正式套件批准登记仍为 `kits=[]`；[交接包](../../plans/A9_30_DEVELOPER_CLOSEOUT_HANDOFF.md)步骤 3–4 前置尚未满足。

## 只读预检结果

- 22 与 3389 端口的 TCP 连接建立；这不能证明主机身份、SSH/RDP 服务可用或 Win10 环境合格。
- 22 端口首次读取未取得 SSH 服务标识；发送客户端标识后收到 EOF。`ssh-keyscan -T 5` 退出 1，无返回主机公钥。
- `route -n get 192.168.146.1` 显示 gateway `198.18.0.1`、interface `utun4`。未断言隧道是唯一故障原因。
- UU 当前显示“无法连接至服务器 请检查网络状态或配置”，历史 Win10 设备 WIN-2JQ66JE4HTQ 为离线。
- 未猜测用户名/密码，未建立 SSH 信任，未修改 known_hosts、路由、防火墙、服务或系统策略。
- 本地 v26 ZIP 仍为 86745 B，SHA-256 `54879a93754b3561922120c6eb680ac6a5f926fbb7cf2f4b106e2bcde040b1fc`。

结构化诊断位于工作树 `.acceptance/a9-30-developer/closeout/win10-192-168-146-1-preflight-20261001.json`。
连接预检不是 D-017 系统/工具链预检 PASS。

## 后续依赖

需要已有可用连接的 SSH 用户名/端口/配置名称或恢复该 Win10 的桌面连接，以及负责人指定独立复核人。
连接恢复后继续只读核对 OS、VS/MSVC/SDK/工具哈希、普通用户及 Job 条件；独立复核完成后登记准确 kit 批准与允许写入目录，
按交接包执行两个全新目录的构建。未上传套件、未写入远端、未编译、未生成 v26 产品锁或修改任何历史候选。

## 历史连接恢复与准确参数复测

随后依负责人要求查阅历史连接信息，找到 2026-09-02 会话中用户提供的 Win10 SSH 交接及实际只读返回：
原地址 `192.168.1.4:22`、账户 `administrator`、Bitvise SSH Server 9.66、ED25519 公钥认证。
当时返回 `win-2jq66je4htq\administrator`、`WIN-2JQ66JE4HTQ` 和 Windows `10.0.19045.6466`。
本机原 ED25519 私钥仍存在，文件权限 600；原 known_hosts 记录仍存在，不输出私钥内容。
最近一次 r15 构建使用 UU 文件传输/终端与 WMI 独立启动，与 SSH 管理通道区分。

沿用原密钥，启用 `IdentitiesOnly=yes`、`BatchMode=yes`、`StrictHostKeyChecking=yes`，
以 `HostKeyAlias=192.168.1.4` 核对原 Win10 身份，仅对新地址 `192.168.146.1:22` 执行 `whoami && hostname && ver`。
实际 SSH 退出 255，返回 `Connection closed by 192.168.146.1 port 22`；未取得远端身份或版本。
用户名已经恢复，无需负责人重复提供；剩余连接阻断仍在 SSH 握手阶段，尚未到公钥认证。
未更改信任记录或网络设置，未远端写入。复测证据位于工作树
`.acceptance/a9-30-developer/closeout/win10-recovered-ssh-preflight-20261001.json`。

## 原地址恢复后的当前事实

负责人随后要求连接 `192.168.1.4`。该地址严格 SSH 连接成功，返回历史主机名、Administrator 与系统版本。
只读预检确认 OS x64/build 19045、PowerShell 5.1.19041.6456 Desktop、VS 16.11.37507.1、MSVC 14.29.30133、
SDK 19041 include/lib/mt，并记录五项构建工具 SHA-256。原始 stdout/stderr 与结构化 JSON 位于工作树
`.acceptance/a9-30-developer/closeout/win10-192-168-1-4-readonly-20261001-230734.*`。
中文控制台文本发生代码页错配，原始字节保留；不以损坏显示推断 OS edition 或 console 状态。
实际执行令牌具有 Administrators 角色，ordinary_user=false；Job UNKNOWN。
连接阻断已解除，剩余为非提升执行身份、独立复核和 kit 批准登记；未远端写入或构建。

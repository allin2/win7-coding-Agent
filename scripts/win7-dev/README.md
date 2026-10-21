# Win7 开发通道

仅用于 ENGINEERING_03 常设授权 r1，输出证据等级始终为 `DEV_CHANNEL`。它不产生 Win7 验收、门 A、门 B、Alpha 2 或 RC PASS。实现阶段只在开发机测试，**Win7 自检 NOT_PERFORMED**。

## 运行环境与授权边界

开发机：Node **20.17.0** 标准库、系统 `/usr/bin/ssh` 与 `/usr/bin/sftp`。无需安装依赖。目标机：DCCS-CHAIZL-PC，Win7 SP1 x64 build 7601，PowerShell 2.0、.NET 3.5、WMI、Task Scheduler 2.0、Shell.Application、icacls、schtasks、qwinsta；复用已有 SSH 服务，不安装组件。身份、SID 或主机键不符即拒绝。固定 SSH 参数包括 `-F /dev/null`、BatchMode、IdentitiesOnly、StrictHostKeyChecking=yes；不读取、复制或打印私钥内容。

常设授权有效至 **2026-10-28T00:00:00Z**。过期后只允许 `status`、`get` 和 `stop`/`close` 收尾。撤销授权后只执行 `close` 收尾。工具不会自行发现负责人的撤销消息，调用方必须停止其他命令。

这是受信任脚本的管理通道，不提供文件或网络沙箱。`ps` 的脚本和 `agent-run` 的程序/参数必须事先确认符合任务书 §7：不得修改系统设置、服务、HKLM、防火墙、账户，不得安装/卸载软件，不得读取、复制或下载 agent 凭据及模型配置，不得在开发根外写入/删除，不得结束根外映像或改变控制台会话。产品按已保存配置调用模型的例外仅适用于产品；每 UTC 日 **200 次**请求上限由调用方维护实际服务请求计数，工具不能从任意程序的命令行推断请求数。无法确认这些条件、发现根外可疑进程/任务或触发禁止动作时，立即停止并报告。

工具自身的文件操作限定在 `C:\A9-DEV\`；上传/下载参数仅接受相对路径，统一使用 Windows 路径规则，支持中文、空格、`%`、`#` 及正/反斜杠。拒绝 `..`、绝对路径、盘符、UNC、ADS、设备名、尾随点/空格、控制字符、接近 MAX_PATH 的路径。`LOCK` 和 `.channel` 保留给工具。目标端对已有祖先及遍历对象再检查 reparse point，遇到 Junction/链接即拒绝。并发的非工具写入属于受信任开发根的外部风险，不把字符串前缀检查称为安全隔离。

## 用法与每个命令的远端效果

下面是后续获准连接时的用法示例；本次实现没有执行这些命令。

```sh
NODE=~/.nvm/versions/node/v20.17.0/bin/node
TOOL=scripts/win7-dev/win7-dev.mjs
"$NODE" "$TOOL" status
"$NODE" "$TOOL" put ./diagnostic.ps1 'tools/diagnostic.ps1'
"$NODE" "$TOOL" get 'runs/smoke/stdout.bin' 'downloads/smoke.txt'
"$NODE" "$TOOL" ps ./diagnostic.ps1
"$NODE" "$TOOL" agent-run smoke '"C:\A9-DEV\app\electron.exe" --version' --wait 60
"$NODE" "$TOOL" cand ./candidate.zip
"$NODE" "$TOOL" stop
"$NODE" "$TOOL" close
```

| 命令 | 远端效果 |
| --- | --- |
| `status` | 只读查询主机、build、agent explorer 会话、开发根是否存在/字节数、根内映像进程、各任务文件夹内 `A9-DEV-` 任务、C: 余量与锁；不创建根或取锁。会话数组不等于已证明活动控制台，agent-run 另做控制台核验。 |
| `put <本地文件> <远端相对文件>` | 取锁，检查空间，创建目标父目录，SFTP 上传至 `.channel` 暂存，复算 SHA-256/大小后写入指定路径；允许覆盖普通文件。 |
| `get <远端相对文件> <本地相对文件>` | 只读取远端大小/SHA-256，再 SFTP 下载至本地 `.incoming`，扫描秘密并验证字节身份；最终文件必须在 `outputs/win7-dev/`，不覆盖已有证据。只支持单个文件，不递归下载目录。 |
| `ps <本地 UTF-8 无 BOM 脚本>` | 取锁，经 ASCII stdin 载体解码 UTF-8 内容，以 dccs-chaizl 执行脚本，工作目录为开发根，进程级 TEMP/TMP 为 `.channel`。未处理的非零原生命令退出码或 `throw` 都视为失败；直接 `exit` 会跳过结果协议，因此视为协议失败。原始输出只写 action 证据。 |
| `agent-run <名称> <命令行> [--wait 秒]` | 取锁，校验 agent SID/活动 console/explorer 属主；建立 `runs\名称`，生成包装器与 ASCII+LF 无声明 XML，注册/回读/启动 `A9-DEV-名称`，等待，删除任务并下载 stdout、stderr、退出码及身份 JSON。名称不能复用；再次运行应换新名称。 |
| `cand <ZIP>` | 取锁，本地算 SHA-256，检查 ZIP 路径/头部；在 `cand\SHA前16位` 复算已有包 SHA，相同则跳过上传，不同拒绝。校验远端 ZIP 后使用系统 Shell.Application CopyHere 解包至 `expanded`，轮询文件数与长度并写 ready 标记。 |
| `stop` | 取锁，写协作停止标记，删除各任务文件夹内全部 `A9-DEV-` 任务，按开发根映像筛选，先子后父结束这些进程；不按 CommandLine 扩大选择，不用 taskkill /T，不结束根外映像。 |
| `close` | 先做 stop，等待包装器结束，检查 reparse point 后删除整个开发根；生命周期未知或进程/任务残留时拒绝删除。正式门 A 前另以 status 确认零进程、零任务、根不存在。 |

`agent-run` 的命令行首项必须是开发根内的绝对 EXE/COM 路径，有空格时双引号包围；其余参数原样作为 Windows 参数串传入，不经 CMD。不能直接运行系统 `cmd.exe /c echo`，回显自检须使用已上传的开发根程序。任务本身沿用系统 PowerShell 包装器；stop 不强杀这个根外映像，包装器通过停止标记协作退出。包装器用 .NET 异步字节流分别记录 stdout/stderr，关闭 stdin，最多输出 64 MiB，到期或停止只终止其直接启动的根内映像；全体根内映像由 stop 收尾，根外子进程不能由本工具终止。

等待默认 600 秒，`--wait` 接受 1～86400 秒。SSH 单次默认 600 秒，agent-run 控制连接为 wait+60 秒，上传为 `max(600, ceil(字节/200000))` 秒。目标端解包最多轮询 540 秒。主机侧超时只中断本机传输，不能证明远端已结束；断连后任务、包装器、Shell 解包的状态保持 UNKNOWN，先 status，再按授权 stop/close，禁止自动整批重试。

## 锁、空间与不可变证据

所有写命令取 `C:\A9-DEV\LOCK`。锁格式版本 1，四行依次为版本、holder、UTC、当前动作 token。动作成功/失败后释放 token，保留 holder；同 holder 后续可续用，其他 holder 或活动 token 拒绝。同一 holder 的并发动作也拒绝。异常断连或取锁后的 ACL 准备失败可能留下活动 token，只有负责人明确要求后才用 `--steal` 强制接管，工具不会自动偷锁。`close` 后锁随根消失。成功取锁后只对开发根用 icacls 确保 agent SID `(OI)(CI)M` 并 verify，不修改账户或其他根 ACL。

put/cand 在上传前查询空间，C: 剩余低于 **50,000,000,000** 字节、开发根大于 **20,000,000,000** 字节或查询未知即拒绝；也检查上传/解包后的预计余量和总量。使用十进制 GB。空间不是配额沙箱；任意执行的程序仍须由调用方遵守 20 GB 上限。

每次 SSH/SFTP 调用，包括取锁、释放、失败和恢复下载，都有 `outputs/win7-dev/actions/<UTC>-<命令>-<步骤>-<UUID>/`，保存 `stdin.bin`、`stdout.bin`、`stderr.bin` 原始字节及带 `schema_version:1`、`evidence_class:DEV_CHANNEL` 的 `result.json`。TSV 账本逐次追加 UTC 起止、命令、JSON 参数摘要、退出码、上传/下载文件字节数、action 相对目录。摘要记录路径、哈希、名称；脚本只记摘要哈希，参数内容不进入摘要。SSH 控制消息不计入文件传输字节。传输失败时不能准确证明文件字节数，记 **UNKNOWN**，不记 0；计划字节数在 result.json 单列保存。原始流不重编码、不回显到终端，文件以受限权限创建。

get 不按扩展名跳过扫描，使用分块扫描覆盖 UTF-8、UTF-16 LE/BE 及 CP936 中的 ASCII 模式，包含 `sk-` 后至少 20 位字母数字、`Authorization:`、`api_key`、`password`（大小写不敏感）。部分下载或哈希不符的内容也先扫描。命中移至 `quarantine/<UUID>-文件名`，CLI 非零退出，只报告文件名与类别，不打印秘密值。此目录仍是敏感内容，不应复制到文档。无命中的失败传输保留 `.incoming`；已成功下载的证据不会被下一次 get 覆盖。

ZIP 不支持 ZIP64、多卷、加密、符号链接、非 UTF-8 非 ASCII 文件名、Unicode 替代路径 extra field 或 Windows 路径别名，发现即在连接前拒绝。Shell.Application 为 .NET 3.5 下的系统解包方案，异步结束通过文件数/大小及独占只读打开判断；**这不是逐文件内容校验**。半解包目录保留并拒绝合并重试；异常后留下 extraction-active 标记，status 显示 UNKNOWN，cand/close 拒绝继续，须先确认解包确已结束再在授权内处理标记。目标机 CopyHere 完成时序、无桌面 UI 行为和任务等待/清理尚须实机验证。

## 环境变量

| 变量 | 默认 |
| --- | --- |
| `WIN7_DEV_HOST` | `192.168.1.5` |
| `WIN7_DEV_USER` | `dccs-chaizl` |
| `WIN7_DEV_IDENTITY` | `/Users/qlyf/Developer/win7-coding-Agent/.acceptance/ssh/id_rsa_win7accept` |
| `WIN7_DEV_KNOWN_HOSTS` | `/Users/qlyf/Developer/win7-coding-Agent/.acceptance/ssh/known_hosts_win7` |
| `WIN7_DEV_HOLDER` | `main`；并行主会话应分别设置有意义的唯一名称 |

覆盖连接参数不改变目标身份授权；HostKeyAlias 固定为 `192.168.1.11`，脚本仍绑定 DCCS-CHAIZL-PC、7601、dccs-chaizl 与固定 agent SID。不得通过覆盖 known_hosts 绕过身份核对。严格核验失败必须停止。put/ps/cand 的本地输入禁止指向已配置私钥或其链接别名，检查只读元数据，不读密钥内容。

## 远端文件与本地验证

| 文件 | 用途 |
| --- | --- |
| `remote/common.ps1` | PS2 JSON 转义、身份、reparse point、空间、锁及只读查询帮助函数；由主机拼到 stdin。 |
| `remote/lock.ps1` | 创建开发根/授根 ACL、独占取锁与释放当前动作 token。 |
| `remote/status.ps1` | 只读状态与锁快照。 |
| `remote/files.ps1` | 上传准备/校验写入、下载元数据、候选复用与 Shell ZIP 解包。 |
| `remote/agent-run.ps1` | agent 控制台核验、任务注册/回读、等待与删除。 |
| `remote/agent-wrapper.ps1` | agent 身份核验、启动根内程序、保存原始双流及退出码；控制器生成 ASCII 载体。 |
| `remote/stop.ps1` | 按映像筛选停止、移除前缀任务，以及 close 的根删除。 |
| `remote/agent-task.xml` | InteractiveToken、LeastPrivilege、固定 agent SID、按需启动的 ASCII 任务模板。 |

```sh
~/.nvm/versions/node/v20.17.0/bin/node --test scripts/win7-dev/test/
npm run docs:check
```

测试全程注入假 spawn，不运行 ssh/sftp/ping；覆盖参数、路径、严格 SSH argv、末尾空行、成功/失败原字节与账本、秘密隔离、锁冲突、超时、空间限制、候选复用、agent 输出回收，以及每份 PS1 的 PS2 禁用语法文本扫描。夹具与证据只写 `outputs/win7-dev/unit-*`，不自动删除首失败。文本扫描不能代替 PowerShell 2.0 解析或 Win7 运行证据。本任务不修改候选、正式总控或 docs 状态。

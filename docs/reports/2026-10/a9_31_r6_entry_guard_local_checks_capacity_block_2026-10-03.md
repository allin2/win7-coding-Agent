# A9-31 R6：启动防护实施及定向检查，部署被磁盘门阻断

日期：2026-10-03（Asia/Shanghai）。分支 `codex/a9-31-background-tools`；HEAD/product source `35a19250ed6589f6a7ba35b940a784325970c111`。

## 当前结论

负责人已批准 [R6合同§1–5](../../plans/A9_31_PRODUCT_R1_R6_ENTRY_GUARD_APPROVAL.md)及 ADR-0164。四处批准外部源已完成必要改动，Node 68 项、784 文件产品闭包、实际 PS5.1 三解析及 271 项协议判据通过。

Win10 C盘容量未达到合同要求，**不创建或传输远端 R6**。真实入口原子 claim/并发文件负例、22 项实际程序集/捕获/文件检查、完整远端装配、正式冻结、新普通窗口和八组产品阶段尚为 `NOT_PERFORMED`。当前 provisional master 只是检查输入，不是可执行冻结包。

原 R5 已发送固定 stop，PID36076/creation639266265512707074 的实际退出仍 `UNKNOWN`。不把其普通身份通过改为 R5 可复活，不派发测试。Win7 与 A9-31 开发收口未取得结论。

## 实施变化

只修改 `.acceptance/a9-31-developer/product-r1/control-scripts/` 内四个批准源：

| 文件 | 当前 SHA-256 |
|---|---|
| launch-product-r1-desktop.ps1 | `a7e4b2b9e2ebbfabb179be21f0fbdeb79e018d65913fb847a358afd1e221c6d0` |
| serve-product-r1-desktop.ps1 | `5b32ea2f6549786aa1dbc5921a5709774b41ab3372a74a1b5a7fa6a3f8284b22` |
| stage-product-r1.ps1 | `4d632770d308b45581274f163857a11169305e157cedbb9812df93f892c6fd44` |
| product-r1-driver.cjs | `5f53949b682e76f45758ad24613a92207e2d1c862798a197052b1b9d7d4a68fb` |

launch 在进入共享记录之前拒绝旧 claim/start/ready/final/stop；现有 `FileMode.CreateNew` 原子取得 claim，未取得者不进入写共享 final 的 try/finally。claim PID/creation/时间/master 严格绑定，worker及每次派发重新核对。

serve 将 capture 原编译批准与本批执行批准分开，增加严格 `build_approval_sha256` 和原批准记录校验。原 DLL、build、scope 来源保持字节不变，不在 R6 中改绑编译记录。PS5.1 `-File` 的非 BOM 源可能按系统编码解读，因此 PS 源中的批准文字比较使用固定 Unicode 码点；JSON 内容仍显式 UTF-8 读取。stage 拒绝 R6 源编译参数，只准复用原准确程序集，未调用编译器。

R5 冻结四源与原 final 未修改；产品、managed helper、输入锁、R2包和宿主未重建，任务实现白名单不扩大。

## 直接检查与证据边界

| 检查 | 结果与准确记录 |
|---|---|
| Node语法 | PASS；`r6-node-syntax-20261003T123118307377Z.json` |
| 请求/物理FS接口/硬失败/abort | 68项 PASS；`r6-node-self-test-20261003T123118307377Z.json` |
| 本地物理包闭包 | 784 文件 PASS；`r6-physical-package-20261003T123118307377Z.json`；产品ZIP/manifest未变 |
| 实际 PS5.1 三解析 | PASS；`r6-parse-20261003T123337608447Z.stdout.bin`，版本5.1.19041.6456 |
| 协议及准入 | 271项 PASS、failed=[]；`r6-schema-20261003T123337608447Z.stdout.bin`，新增claim字段/类型/实例绑定、原批准缺失/错属及编译记录不得使用新执行批准 |
| 旧根实际拒绝 | `DIRECT_OLD_R5_REJECTED_FINAL_UNCHANGED`；`r6-direct-old-entry-guard-20261003T123513874749Z.stdout.bin`。新 guard 只读拒绝真实旧R5状态，旧final hash仍39d6b4b…147967，零产品派发 |
| ASAR八负例 | `INHERITED_EVIDENCE`；`r6-physical-negative-inheritance.json`校验完整LF函数字节、SOURCE/sha/physicalFs及调用，核验R4中间记录到R3八项直接记录的准确hash；不是实际Electron PASS |
| 原子文件/并发/完整22项API | NOT_PERFORMED；需要新准确隔离run目录及容量门 |

所有检查记录位于 `.acceptance/a9-31-developer/product-r1/`。协议探针只在内存运行，固定 source 定义及 fixture JSON保存在 `r6-schema-probe-inputs.json`；没有将fixture里的检查状态当成正式批准或目标产品证据。

本地准备曾出现两个编排错误：Python3.9不支持Path.write_text(newline)，继承摘要计算首轮漏计LF。已保留在 `r6-preparation-local-failures.json`；修复工具调用及摘要边界后准确字节核对通过，未改产品或覆盖原证据。

## 容量和旧控制器

20:31:20预检空闲 **1536315392 bytes**（约1.43GiB）；20:35:14再读 **1589366784 bytes**（约1.48GiB），均低于合同部署前 **2147483648 bytes**。两次 R6 root_exists=false；没有绕过门创建新根、迁往未批准盘符或清理文件。每次正式部署前重新核对，不把后来余量猜作满足。

20:35:14 同 creation 的旧R5 PID36076仍在。当前 UU 不能连接服务器，未通过GUI解除控制台选择或关闭窗口；不能确认停止未生效的具体原因。当前PID快照不补签未知退出码。后续按已批准准确旧窗口停止取证，不按PID号强制杀进程。

## 后续已授权动作

容量达到至少2GiB后，在准确 R6 根内完成真实文件/并发和22项程序集/捕获/文件负例，再据实际通过记录登记唯一最终 master/revision/checks，检查完整784产品/73宿主，冻结并通过普通桌面启动。先确认旧控制器不会继续派发，再执行 Boot→Shell及余六组、同窗口普通失败后的新checked driver重试。

无需为以上同范围动作重复批准；磁盘和桌面条件不足只暂停对应动作。当前没有提交、推送、合并、发布、账户/ACL/Job改变、候选分配或Win7执行。

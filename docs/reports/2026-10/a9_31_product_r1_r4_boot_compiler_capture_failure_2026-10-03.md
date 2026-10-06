# A9-31 product r1：R4 普通桌面启动及编译器捕获首失败

```text
Branch: codex/a9-31-background-tools
HEAD/product source: 35a19250ed6589f6a7ba35b940a784325970c111
R4: HALTED / unresolved compiler lifecycle UNKNOWN
Boot request: 01e5a8be22e9473fae4da8b1059eb46a
Product phase PASS / reusable retry / Shell and remaining phases: NOT_PERFORMED
A9-31: IMPLEMENTATION_IN_PROGRESS
Win7 / independent closeout: NOT_PERFORMED
```

## 已执行与身份

Computer Use 经 Windows“运行”框完成启动。先前 CMD 未确认输入焦点，不能声称命令执行；运行框中 paste 一度呈现旧剪贴板内容，未执行旧命令。改用直接 typeText，核对命令开头和准确 R4 pin 末尾，再点击输入框并 Return。SSH 随后读取实际 start/ready，启动成立以此为准。

准确 master `8e51461c1194e6200da3d387ba20731d518678393620ab707648a01326f0a12d`；revision `5736a2d9ac801a7cb8e021d1d159b96e62b3a13bb89123ef2bfd40ef5a546803`。

2026-10-03T10:47:21.3266375Z 起的 dispatcher PID28448、creation ticks639266212408225429，期限至12:47:21.3266375Z；普通 SID `S-1-5-21-3031939772-989444280-3099258187-1005`、Session3、Medium8192、ElevationType1、Elevated=false、Ordinary=true、InJob=false。worker28356、Electron34180也直接通过同身份门。没有使用 Administrator 或 Session0替代普通产品验证。

SSH在检查当前实例、期限、无final、零请求及完整输入后，CreateNew派发准确 Boot 请求，2026-10-03T10:49:02.4552704Z；请求SHA `ec54cbcba52317f4eaab5869287919d00ceca945b5e0b950e3409c65bc568e66`。只派发一次。

## 首失败与证据等级

dispatcher观察到 `csc.exe` PID33576、父PID28356；2026-10-03T10:49:05.3210570Z在GetProcessById步骤失败，System.ArgumentException：“ID 为33576的进程当前未运行”。Native error、creation和exit保持UNKNOWN。原始capture诊断保存这个观察，没有略过短进程。

固定abort信号随后送入driver，原因LIFECYCLE_CAPTURE_FAILED。driver在实际测试cases仍为空时退出1；controller为SAFETY_DRIVER_HARD_GATE；dispatcher为LIFECYCLE_OBSERVED_CHILD_NOT_PINNED:33576，均HALTED。已持有worker28356和Electron34180真实exit1，held_tree_ended=true；这只证明已持有实例结束，不能补签csc.exe的缺失退出。其余phase和同窗口普通失败重试未执行。

源码静态核对：冻结serve第5行在每个新的PowerShell进程执行Add-Type -TypeDefinition，先编译捕获类型，后到第152行LibraryOnly分界及worker身份/产品入口。worker在初始化期间调用编译器与实际观察的父PID/时间相符。观察到的可执行名和异常是直接事实；“由这次Add-Type产生”是结合源码与进程关系的推断，不拥有已退出csc.exe的完整命令行。没有证据把这一失败归入产品Shell/后台功能。

## 原始证据保留

本地 `.acceptance/a9-31-developer/product-r1/controller-r4-boot-first-failure/` 回收15个准确文件，共16322 bytes，逐项尺寸/SHA核对；index SHA `83a9c91ee1d367d0e075fa80d135610ba8e59c9129132442aec14b9cad6ebf16`。包含run/evidence、run/signals、dispatcher-global及两个capture诊断；原始传输stdout/stderr另保留。合成秘密的明文/Base64扫描PASS，仅涵盖这些已回收文件。

| 文件 | SHA-256 |
|---|---|
| dispatcher-start.json | `0b2bdb7b269b1bcc2e1c4c8bede24d4f0a55948dc8929ce0bb7a3a435a21c7c4` |
| dispatcher-ready.json | `0cfff93be788c092e96a0364bef214bf548be32e3eb5f2546649d8092aa702e5` |
| dispatcher-final.json | `346b78e25f813e732e701f6b0dc860291e7868bf857c878eade381130e505dba` |
| driver-final.json | `d84eda6c2e47a9f99ed543e7b9449c78813509033ce10c77e54e63d81e85fdcf` |
| controller-final.json | `23fed4df0eb9b6637ee7bdcef60bef80a85a57a306a2d8438c52f9043cf62521` |
| controller-abort.json | `44d8c7d9373f9c4ff5156e2bf8d9f7d313116a42f00eeb2703a6b433a021ce4a` |

回收时上述四PID当前不存在，仅作只读后飞行快照；没有据此裁决csc退出0或完整树成功。R4冻结源与部署输入不修改，R3历史UNKNOWN同样保留。

## 后续具体材料

[R5预编译合同](../../plans/A9_31_PRODUCT_R1_R5_CAPTURE_PRECOMPILE_APPROVAL.md)及ADR-0162 Proposed将编译移出受监督产品worker，固定程序集字节及完整准入检查；不忽略编译器或其他未绑定进程。R4合同§4明确“三PS变更…硬失败后的再次恢复仍另立合同”，本轮只形成材料，R5实施/远端写入/编译/启动NOT_PERFORMED。已完成只读已安装Framework编译器检查，没有安装、更改账户/权限或执行编译。新方案实际捕获与实机成功仍须直接验证。

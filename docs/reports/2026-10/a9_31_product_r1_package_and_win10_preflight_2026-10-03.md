# A9-31 开发检查包 r1 与 Win10 只读预检（2026-10-03）

```text
Status: DEVELOPER_PACKAGE_INTEGRITY_PASS_NOT_WINDOWS_RUNTIME_PASS
Product source: 35a19250ed6589f6a7ba35b940a784325970c111
A9-31 Phase-Gate: A9_31_IMPLEMENTATION_IN_PROGRESS
Windows real Electron: NOT_PERFORMED
Win7: NOT_PERFORMED
```

负责人在准确managed输入重锁完成后回复“批准”，授权继续A9-31打包及Win10实机验证准备。
本轮仅执行已锁定的本地打包/内容复核、目标连接和目录只读预检；没有新的远端写入或普通桌面产品运行。
新控制器文件不在当前任务精确白名单；具体补充合同见[执行审批包](../../plans/A9_31_PRODUCT_R1_WIN10_VALIDATION_APPROVAL.md)。

## 已执行结果

- 当前分支 `codex/a9-31-background-tools`，打包前source `35a19250ed6589f6a7ba35b940a784325970c111`，tracked/untracked干净。
- 生产者使用Node20.17绝对入口并固定子进程PATH；准确三输入archive及正式managed锁哈希核对后装配。
- 返回 `A9_31_DEVELOPER_PACKAGE_INTEGRITY_PASS`；无正式候选authority，external_acceptance_eligible=false。
- ZIP `aae71bb0c446bda7e9bd04f58b51c208d02d4c723f13908e55cd077e0d2f10c0` / 101324034bytes；manifest `df70fa5bd2df2f91eeed8cf441006241442cea33cc6c622c82a92742ca97e7b9`。
- ZIP与展开树784项完全一致，only_left/only_right/changed均0；manifest本身之外783项。
- 从实际包内加载a9-package-runtime描述符，helper/SQLite绑定哈希通过，managed Profile/协议3一致。
  此项只在Mac/Node读取配置与哈希，没有执行Windows Electron或加载Windows SQLite原生模块。
- helper2036bf69…51e4b7与正式managed锁 `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e`绑定；旧Electron、SQLite和历史输入保持原字节。
- 打包结束工作树仍干净；产品包不可因本轮文档准备而改绑为后续HEAD。

## 目标连接与身份边界

StrictHostKeyChecking=yes的既有Administrator管理SSH连接实际通过；目标 `WIN-2JQ66JE4HTQ`，
Windows10Pro/build19045/x64，a9builder SID1005 enabled，console Session3 Active。
管理SSH身份是Administrator；它不构成本轮普通桌面令牌或真实产品运行证据。
本轮普通Medium/非提升/no-Job及实际runtime/API加载仍NOT_PERFORMED。

当前SID1005真实profile为 `C:\Users\a9builder.WIN-2JQ66JE4HTQ`，不是默认同名路径。
现有LocalAppData父目录归a9builder所有，用户已有继承读写权限，未发现Reparse祖先。
拟使用全新 `C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R1-20261003`，目前不存在。
C盘实际剩余 `3642187776` bytes；新执行合同要求首次至少2GiB、每请求至少1GiB余量且本批根不超过1GiB。
不为测试新建用户、调整ACL/UAC/Bitvise/许可证或安装组件；旧D盘构建/控制/失败目录不作为新产品输出目录。

## 尚未执行与证据

A9-31后台工具、S01–S06、安全/审计/恢复/退出必须在当前managed包通过实际main/preload/SQLite/IPC/Renderer重测。
旧A9-30脚本只能作结构参考，不能复活旧HALTED/到期控制器，也不能继承旧helper运行结果。
独立返回P1=1、旧控制器exit/tree UNKNOWN及原生背压终态缺失继续保留；本报告不补签旧生命周期。
A9-32/33、Win7候选及Alpha2/RC不在本轮裁决。

全部材料位于候选外 `.acceptance/a9-31-developer/product-r1/`：
`input-preflight-and-authorization.json`、`build.log`、`build-result.json`、`zip-to-stage-audit.stdout.json`、
`runtime-config-readback.json`、`win10-readonly-preflight.json`、`win10-profile-readonly.json`、
`product-r1-execution-contract-inputs.json`及保留的stdout/stderr；准确信息由外部审批快照逐项绑定。

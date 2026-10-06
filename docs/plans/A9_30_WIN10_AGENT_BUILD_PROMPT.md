# A9-30 Win10 agent 构建交接提示词

以下正文供负责人复制到 Win10 本地 agent；交接稿不代表独立复核、批准登记或构建已完成。

---

你负责 win7-coding-Agent 的 A9-30 D-013 v26 构建前独立复核及 Win10 执行，不修改产品代码。你不是此前实现方。
先只读预检、核对套件与独立复核，形成证据报告。仅当前置全部满足时，执行两次独立干净构建。
保留历史目录、失败证据、v24/v25 和候选；不安装、提权、创建账户、清理或修改服务/策略/网络。

## 身份和输入

- 主机 `WIN-2JQ66JE4HTQ`，当前可用 SSH 地址 `192.168.1.4:22`；不使用未握手成功的 `192.168.146.1`。
- 2026-10-01 只读核对：Win10 x64 build 19045，PowerShell 5.1.19041.6456 Desktop，VS2019 16.11.37507.1，
  MSVC 14.29.30133，SDK 10.0.19041.0 include/lib/mt 存在。
- 当前 SSH Administrator 的实际令牌具有管理员角色，ordinary_user=false，不能直接运行 v26 正式构建/smoke。
  本地 agent 也必须实测令牌，不能因在桌面运行就假定非提升。Job 尚为 UNKNOWN。
- Source commit：`a3b6a67dbda43c41d27cedccbdf0875e1acc46d9`；实现分支 `codex/a9-30-shell-streaming`。
- `A9_30_V26_BUILDKIT_r1.zip`：86745 B，SHA-256
  `54879a93754b3561922120c6eb680ac6a5f926fbb7cf2f4b106e2bcde040b1fc`。
- kit input-lock SHA-256：`83907feaf73f06eabe56d037bdb5d898dfc40f73542a4af5f1605f2e5ef0dc4d`。
- kit PACKAGE_MANIFEST SHA-256：`0aff15feb8744976a938b9ee3354e693b40097c4db0ad7e0a29babe701ab5a93`。
- 当前 kit 为 PACKAGE_READY_NOT_APPROVED，`release/win7-product-v3/a9-v26-approved-build-kits.json` 为 kits=[]。
  负责人已要求构建；独立复核、kit 批准登记提交及具体目录批准尚未完成，不得假定已满足。

## 第一步：只读预检与独立复核

读取 AGENTS.md、WIN7_CONSTRAINTS §10、A9_30_SHELL_STREAMING 任务书、helper v3 设计、
A9_30_DEVELOPER_CLOSEOUT_HANDOFF、批准源码差异/测试记录及 kit README_BUILD。
缺资料时列出缺失项，继续不依赖它的工作，不自行下载或重新拼装套件。

1. 核对实际 OS/PowerShell/VS/MSVC/SDK、x64、工具路径/版本/SHA-256、用户及令牌。未知写 UNKNOWN。
   普通用户/非提升或 Job 条件不满足，停止对应构建，不调整系统设置。
2. 只读核对 ZIP 三项哈希、完整 23 文件集合、13 个原生源码与 source commit、Profile 和 smoke 合同。
   不修改 ZIP、不使用占位哈希，展开套件前先取得新目录批准。
3. 独立复核协议 v3、writer/背压/取消/清理失败边界、Win7 API、确定性参数与返回证据闭包。
   报告绑定复核者/实现者身份、时间、source 和三项哈希，列出具体发现与判据。
4. 返回报告及两个全新目录提案：`D:\A9-A30-V26-20261001\build-a`、`D:\A9-A30-V26-20261001\build-b`。
   目录仅为提案，未获批不得写入。不要自签 kit 批准或提交登记。
   由负责人核对独立报告，按合同完成精确 kit 批准登记、追加提交和目录批准。

## 第二步：批准后正式双构建

只有独立复核通过、非提升普通用户/Job 满足、同一准确 kit 获批、批准登记与干净 HEAD 一致、
两个具体新目录和执行动作获准，才开始。前置缺失仅暂停依赖动作，不伪造完成。

1. 同一 ZIP 分别进入两个全新目录；已有 work/output/evidence/result 时拒绝复用，不删除。
2. 在每个 kit 根依次执行 Windows PowerShell 5.1：

   ```cmd
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build.ps1 -TestSmokeRequestOnly
   powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\build.ps1
   ```

3. 固定 VS2019 16.11/v142 14.29/SDK 19041/x64/静态 `/MT`，保持相对参数、
   `/Brepro`、`/INCREMENTAL:NO`、`C:\a9-v26-kit` 映射，不换工具链、不跳 smoke。
4. 保存不同 run-id、退出码、原始协议/时序、logic/capture/v1/v2/v3、PE/API/CRT、权限与清理证据。
   v3 包括双源 tick、编码字节、上限、取消、慢消费者；秘密只用合成 marker。
5. 失败保存 first-failure/DIAGNOSTICS，阻断正式输入锁和装配。
   成功返回两份 `WIN7_D013_V26_HELPER_ARTIFACTS_<时间>.zip` 和各自 `.sha256`；helper 必须逐字节一致。
6. 报告两组 ZIP SHA/run-id、helper SHA/尺寸、工具身份以及各项 PASS/FAIL/NOT_PERFORMED。
   不自行生成正式产品锁、不签 DEVELOPER_VERIFIED，不做 Electron/Win7、新候选、Alpha 2 或 RC 裁决。
   原始返回交主代理核验，按合同另行完成独立返回复核与批准登记。

首次回复请给出：资料是否齐全、账户/令牌、工具链、Job、三项哈希、复核发现、尚缺的正式构建前置。
不要仅回复“可以构建”，不要把只读预检写成构建 PASS。

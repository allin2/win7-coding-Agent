# A9-14 / WIN7-22 增量实机验收

WIN7-22 必须解压到新目录，并保留 WIN7-19 程序目录、候选 ZIP、manifest 与外置证据以便回退。
先执行 `RUN_A9_14_INTEGRITY.cmd <原始ZIP> <外部正式lock> <外部批准清单> <外部批准记录> <独立批准SHA256>`，再以普通用户启动正式
`electron.exe`。证据只能写到候选目录之外。

本轮按 ADR-0097 继承 WIN7-19 未受 D-013 v25 影响的证据。A9-13 已在 WIN7-21 上直接完成且未受
helper 修复影响的 schema v4 精确迁移/回滚，只能在 kit 锁定的 State 源码与四份证据哈希均不变时标记
`INHERITED_EVIDENCE_UNAFFECTED_EXACT_HASH`；这不是 WIN7-22 当前候选 PASS。其余四个 `W22-*`
D-013 用例必须由当前候选直接执行：

- Current-User Primary Token、协议 v2、Job/stdin/双流/清理证明与工作区 ACL 不变；
- PowerShell 5.1、CMD 和一个用户显式配置 Shell 的路径/哈希/版本绑定；
- 普通非秘密环境覆盖可见，Provider/API Key 和 Electron/Node/TLS 控制变量不可进入 child；
- 真实 `deadlineMode=none`、前台 Stop、后台 ready、双 Stop、崩溃/恢复、退出锁与零残留；
- 中文空格、编码换行、junction、近 MAX_PATH 及普通用户优先矩阵。

用户显式 Shell 必须从“设置 → Shell 与工作区环境”选择种类，再由主进程打开的 Windows 文件选择器
选择 `.exe`；页面不能直接把路径作为 IPC 参数提交。环境覆盖按每行 `NAME=value` 输入，应用后只回显键名，
不回显值。切回“自动选择”时使用规范系统 PowerShell/CMD 路径。

按 ADR-0105，环境拒绝全部 `NODE_*` 和 `ELECTRON_*`，并按当前已知秘密检查普通变量名下的原文、
Base64/Base64URL、percent/form 编码。用合成哨兵覆盖继承、overlay、前后台、Provider 凭据变化和重启：
旧设置命中时整个 overlay 被清除并标记无效，必须重新保存；不得把真实密钥放入验收命令或证据。
schema 2 设置迁移到 schema 3；普通非秘密覆盖及显式 Shell 文件身份仍保留。

严禁关闭 TLS/SSH 主机密钥验证，严禁修改系统 PATH、服务、注册表、防火墙或安装未知组件。
完成后用 `RUN_WIN7_22_REPORT_VERIFY.cmd` 校验报告、候选身份与全部外置证据哈希。只有
A9-14 独审、产品双构建和本轮实机项目全部通过，才能签发新的 `A9_13_WIN7_22_GO_FOR_ALPHA`。

报告入口按 ADR-0102 拒绝 `source_dirty != false` 或 `external_acceptance_eligible != true` 的 manifest。
它会重新校验解压候选的物理全树，并逐项解析原始确定性 ZIP，要求内置 manifest、全部 payload、v25
native 哈希及验收 kit 与当前文件完全一致。伪 ZIP、外置替换 manifest/kit、额外文件或候选内改写均拒绝；
报告与证据仍须保存在候选目录外。该步骤不启动产品，也不能替代 Windows 启动/ABI 和实机旅程。

“完整产品闭包”不是候选 manifest 自报集合：verifier 内置本版本不可省略清单，覆盖 Electron 主入口与
Chromium/Electron 许可证、正式 `a9-14-win7-22-input-lock.json`、Shell Preload/Renderer/主进程、Core/Gateway/
Git/Runner/State/Workspace 全部运行时 JavaScript、离线 npm 依赖、Runner manifest、helper、SQLite、
SBOM、验收脚本与报告 verifier。它解析 input lock、runtime profile、Runner manifest、SBOM 和 kit，
交叉绑定 source commit、三份输入 ZIP、v25 Profile/协议、native 哈希、Electron ABI、Win10 已审返回状态
及未完成的产品/Win7/Alpha Gate。同步删除关键文件并重写 manifest/ZIP 仍会失败。

### 候选外正式批准根（ADR-0104）

内部自洽不能证明正式来源。必须从独立批准渠道取得下列三份候选外文件及批准记录的 SHA-256 pin，
只读使用，不得从候选或其 sidecar 自行计算一个新 pin 并当作批准：

- `a9-14-win7-22-input-lock.json`：A9-14 新冻结的正式锁，包内副本须逐字节一致；旧 `a9-09-input-lock.json` 仅为历史记录，不能用于 WIN7-22。
- `a9-v25-approved-kits.json`：从 lock 指定的已提交批准 commit 导出的精确字节；新近 HEAD 不可替代旧
  批准 commit。这里无需现场 Git，来源在移交前由可信仓库和独审确认。
- `release-authority.json`：外部独立复核签发，格式如下（占位符不可运行）：

```json
{
  "schema_version": 1,
  "kind": "WIN7_22_RELEASE_AUTHORITY",
  "status": "APPROVED_FOR_WIN7_22_VALIDATION",
  "formal_input_lock_sha256": "<正式锁SHA256>",
  "approval_registry": { "commit": "<批准清单Git提交>", "sha256": "<批准清单SHA256>" },
  "candidate": {
    "source_commit": "<产品Git提交>",
    "package_sha256": "<已复核完整产品ZIP-SHA256>",
    "manifest_sha256": "<已复核manifest-SHA256>"
  }
}
```

签发顺序：用户授权提交修复 → A9-14 独审关闭 → 新 `a9-14-win7-22-input-lock.json` 与源码 G0 冻结 →
两个全新 detached 工作树做产品确定性双构建 → 同一候选预飞行 → 外部批准记录与独立 pin → WIN7-22。
新锁只逐哈希复用已批准的 D-013 v25、Electron 和 SQLite 原生输入，不复用 WIN7-20 正式锁、候选或裁决；
不能用测试夹具填充。产品 source commit 与 helper source commit 分别绑定，不要求新锁改写 helper 来源。
批准记录不是 Win7 PASS；PE32+/AMD64/DLL/section 结构检查也不能替代加载、协议与实机验收。

在可信开发机先用仓库里的 verifier 做预飞行；不要首先执行尚未校验的候选 Electron 或包内校验脚本：

```text
node release/win7-product-v3/a9-win7-22-report.cjs init --zip <原始ZIP> --release-manifest <解压目录/release-manifest.json> --kit <解压目录/A9_14_VALIDATION_KIT.json> --formal-input-lock <外部/a9-14-win7-22-input-lock.json> --approval-registry <外部/a9-v25-approved-kits.json> --release-authority <外部/release-authority.json> --release-authority-sha256 <独立批准SHA256>
```

现场 CMD（所有含空格路径均加双引号）：

```text
RUN_A9_14_INTEGRITY.cmd <原始ZIP> <外部正式lock> <外部批准清单> <外部批准记录> <独立批准SHA256>
RUN_WIN7_22_REPORT_VERIFY.cmd <原始ZIP> <报告JSON> <外部证据根> <外部正式lock> <外部批准清单> <外部批准记录> <独立批准SHA256>
```

report init、verify 和 integrity 共用同一必需批准根；candidate identity 增加
`release_authority_sha256`、`formal_input_lock_sha256`、`approval_registry_commit/sha256`，所有 W21 execution、
candidate-start/postflight 必须带上它们。lock 校验 approval_registry、精确 build kit 及两份不同的
ZIP/run ID/evidence binding；缺失、TEST_ONLY、复用或不一致一律拒绝。原始 Win10 evidence binding 文件
已由正式记录器验证，其哈希受正式 lock 和外部 pin 保护，Win7 不重放构建。

报告必须使用 `schema_version: 2` / `report_kind: WIN7_22_INCREMENTAL_ACCEPTANCE`。8 个 `W17-*`
历史项可写为 `INHERITED_EVIDENCE`，但 `inherited_from` 必须与 kit 内锁定的 WIN7-19 候选完全一致，
且 `evidence_refs` 必须逐项等于 kit 内 case binding；verifier 会加载外置 evidence root 下精确锁定哈希的
WIN7-19 disposition、继承 ledger 和 incremental report，并解析指定 JSON pointer。任意临时文件或报告
自报的证据集合均不被接受。除 schema v4 精确继承项外，所有 `W22-*` 只能使用当前候选的直接
execution；每个 execution 必须包含与当前 ZIP 和 release manifest 计算结果完全一致的 `candidate` 对象，
环境必须严格为 Windows 7 SP1 build 7601 / x64 / ordinary-user / not-elevated /
`D-013-v25-a9-trusted-shell-current-user`，并通过 `machine_binding` 为 `ver`、`whoami /all`、候选启动和
postflight 身份各提供外置哈希证据。报告还必须覆盖 kit 为该 case 声明的全部 assertion。不得把历史证据
标成当前候选 PASS。

# A9 `0.3.0-alpha.1` v3 自包含候选

本目录是 A9-09 独立打包线。它复用锁定的 Electron 22.3.27 和 D-014 better-sqlite3 8.7.0 /
SQLite 3.43.1，并要求 D-017 锁定 Win10 工具链返回的 D-013 v25 Current-User helper。D-013 v24、
WIN7-19 及其证据保持只读，不继承 A7/A8 的产品 PASS。

## A9-15 / WIN7-26 投影验证缺口修复候选

WIN7-25 的产品修复保持冻结；其复核发现 Renderer 回归未执行原连续渲染触发顺序，验收 kit/report 也未把
Inspector 当前会话持久事件恢复与旧失败不得覆盖新成功设为签发硬条件。ADR-0119 的 WIN7-26 使用新锁
`a9-15-win7-26-input-lock.json`，加入真实 Renderer 故障敏感性回归、Electron 旧失败→较新成功重启链路，
以及要求 turn/event ID、查询顺序和 DOM 导出哈希的两个稳定报告用例。

```bat
node scripts\release\build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-15-win7-26-input-lock.json ^
  --electron-zip <electron-v22.3.27-win32-x64.zip> ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip <WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip> ^
  --output <new-empty-output-directory>
```

必须从提交后的两个独立干净工作树构建并逐字节比较；候选哈希形成后仍需候选外独立
`WIN7_26_RELEASE_AUTHORITY` 与 SHA-256 pin。开发机 fixture 不能替代真实 Provider 或普通用户 Win7 证据。

## A9-15 / WIN7-25 重启历史投影修复候选

WIN7-24 已在普通用户正常退出后的重启检查中确认 Renderer 投影失败，冻结为
`FIX_BEFORE_WIN7_25_VALIDATION`；其合同、候选和证据不得修改或重判。ADR-0118 的 WIN7-25 使用新锁
`a9-15-win7-25-input-lock.json`，修复 Inspector 对持久化事件的恢复以及全局结果绑定最新轮次，并保持
IPC、SQLite schema、Runner/Policy 与权限边界不变。

```bat
node scripts\release\build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-15-win7-25-input-lock.json ^
  --electron-zip <electron-v22.3.27-win32-x64.zip> ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip <WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip> ^
  --output <new-empty-output-directory>
```

必须从提交后的两个独立干净工作树各构建一次并比较 ZIP 字节；候选哈希形成后再创建候选外独立
release authority。自动 fixture smoke 不能替代普通用户真实 Provider 与重启历史复验。

## A9-15 / WIN7-24 验证启动与字体清晰度候选

WIN7-23 已因打包 Electron 子进程没有执行 driver、三份 phase 报告未生成而冻结为
`FIX_BEFORE_WIN7_24_VALIDATION`；其合同、候选和证据不得修改或重判。ADR-0116 的 WIN7-24 使用新锁
`a9-15-win7-24-input-lock.json`，修复候选外 Electron driver runtime、stop 工作区前置和反假阳性断言，
同时只在现有 CSS 内优化 Win7 本地字体栈、整数基础字号和辅助文字对比度：

```text
node scripts/release/build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-15-win7-24-input-lock.json ^
  --electron-zip spikes\04-storage-index\build-win10\kit\inputs\electron-v22.3.27-win32-x64.zip ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip A6\WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip ^
  --output <候选外新目录>
```

正式包仍须双干净构建逐字节一致，并在哈希确定后取得候选外 `WIN7_24_RELEASE_AUTHORITY` 与独立 pin。
验证步骤见 `A9_15_WIN7_24_VALIDATION.md`。自动 fixture smoke 的临时 Electron 副本位于候选外证据 run
root，被测产品入口仍是候选内正式 main/preload/IPC/renderer；它不能替代真实 Provider 或普通用户证据。

## A9-15 / WIN7-23 历史候选

WIN7-23 是 A9-15 的独立候选身份，不覆盖或改判 WIN7-22。它复用未变化的 Electron、D-013 v25 与
SQLite 正式输入精确哈希，使用新锁 `a9-15-win7-23-input-lock.json`：

```text
node scripts/release/build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-15-win7-23-input-lock.json ^
  --electron-zip spikes\04-storage-index\build-win10\kit\inputs\electron-v22.3.27-win32-x64.zip ^
  --runner-zip <WIN7_D013_V25_HELPER_ARTIFACTS_20260903-084131.zip> ^
  --storage-zip A6\WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip ^
  --output <候选外新目录>
```

该段仅保留历史重建说明。正式包必须从两个干净、已提交源码工作树独立构建并逐字节一致。候选哈希确定后，按
`A9_15_WINDOWS_VALIDATION.md` 获取候选外 `WIN7_23_RELEASE_AUTHORITY` 与独立 SHA-256 pin，再进入
Win7 普通用户验证。自动 fixture smoke 不满足真实 Provider 用例；完整结果仅可签发
`A9_15_WIN7_UI_INTEGRATION_PASS`，不是新的 Alpha 或 RC PASS。

从仓库根目录构建：

```text
node scripts/release/build-a9-product-v3.mjs ^
  --formal-input-lock release\win7-product-v3\a9-13-win7-21-input-lock.json ^
  --electron-zip spikes\02-terminal-containment\build-win10\kit\inputs\electron-v22.3.27-win32-x64.zip ^
  --runner-zip D013-V25-WIN10-RETURN.zip ^
  --storage-zip A6\WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip ^
  --output release\win7-product-v3\out
```

正式候选必须来自干净、已提交源码。`--allow-uncommitted` 只生成开发机替代候选；manifest 会记录
`source_dirty: true` 和 `external_acceptance_eligible: false`，不得拿去签发 Win10、Win7 或 Alpha PASS。
构建器不下载依赖，不要求目标机安装 Node，并在发布 ZIP 前验证全树 manifest、A9 `git-adapter`
闭包、外置 Electron ABI SQLite、D-013 helper、敏感信息排除和双构建确定性。

Windows 验收必须解压同一个 ZIP 到全新目录，在包外建立证据目录。默认数据位于
`%LOCALAPPDATA%\Win7CodingAgent\a9`；只有显式传入 `--portable` 才使用包旁 `portable-data`。
先用 `record-a9-v25-helper-input.mjs` 校验两次干净 Win10 构建的两组 ZIP/sidecar。两次返回 ZIP 和 `run_id`
必须各自独立，返回包中的 input lock、input verification、package manifest 必须精确绑定授权套件及其 Git
source commit。授权根是 `a9-v25-approved-kits.json` 中状态为 `APPROVED_FOR_RETURN_RECORDING` 的不可覆盖
构建 ZIP/hash；该清单必须与当前 clean Git HEAD 的固定路径字节一致，未跟踪或本地修改一律拒绝，批准
commit/hash 写入正式 input lock。调用方目录不能充当授权根。helper 字节必须一致；复制同一返回包不能作为第二次构建，
并生成一次性的 `a9-13-win7-21-input-lock.json`，再构建正式候选；历史 `a9-09-input-lock.json` 不得作为 WIN7-21 的正式锁：

```text
node scripts/release/record-a9-v25-helper-input.mjs ^
  --kit-zip PREAPPROVED-D013-V25-BUILDKIT.zip ^
  --runner-zip D013-V25-WIN10-RETURN-A.zip --sidecar D013-V25-WIN10-RETURN-A.zip.sha256 ^
  --runner-zip-2 D013-V25-WIN10-RETURN-B.zip --sidecar-2 D013-V25-WIN10-RETURN-B.zip.sha256
```

Windows 现场先运行
`RUN_A9_09_INTEGRITY.cmd <原始ZIP> <候选外正式lock> <候选外批准清单> <候选外批准记录> <独立批准记录SHA256>`
绑定 ZIP/manifest、正式输入和独立批准。Win10/Win7 未实际执行前
始终保持 `NOT_PERFORMED`。完整性工具在 Electron Node mode 下强制使用 `original-fs` 读取物理文件字节，
避免 Electron 的 ASAR 虚拟文件系统改变 `resources/default_app.asar` 的读取语义；启动脚本同时清除外部
`NODE_OPTIONS`，防止预加载代码污染哈希边界。

WIN7-21 identity verifier 另有内置、版本化的完整产品闭包，不采信 manifest 自己定义的最小文件集合。
它要求正式 input lock、Shell Product/Preload/Renderer、七个运行时模块、离线依赖、Runner manifest、
native、SBOM、许可证、验证脚本和 kit 全部存在并交叉绑定；同步裁剪目录、manifest 和 ZIP 也会拒绝。
上述内部一致性不是批准来源。ADR-0104 要求由独立批准渠道提供 `WIN7_21_RELEASE_AUTHORITY` schema 1
记录的 SHA-256 pin；该记录锁定正式 input lock、批准清单 commit/hash、完整产品 ZIP/manifest/hash 和
产品 source commit。包内 lock 必须与候选外正式 lock 逐字节一致；两个 build/run/evidence binding 不得
复用；三个原生入口还验证 PE32+/AMD64/section/DLL 类型。完整格式及可信预飞行命令见
`A9_09_WINDOWS_VALIDATION.md`。不得从本候选或自行创建的外置文件生成“批准”pin。

`A9_09_VALIDATION_KIT.json` 和 `validation/a9-win7-21-report.cjs` 使用 WIN7-21 report schema v2：仅 8 个
`W17-*` 用例可用 `INHERITED_EVIDENCE`，但只能引用 kit 预先锁定的 WIN7-19 disposition、继承 ledger 与
incremental report 的 SHA-256/JSON pointer；任意新文件不能自报为历史证据。5 个 `W21-*` 用例必须直接
执行，每个 execution 的 `candidate` 必须等于当前 ZIP/manifest 计算出的候选身份，并绑定 Win7 build 7601
x64 普通用户、非提升、D-013 v25 Profile 的系统/令牌探测、候选启动和 postflight 证据。

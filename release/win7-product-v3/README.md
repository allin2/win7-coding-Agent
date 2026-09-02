# A9 `0.3.0-alpha.1` v3 自包含候选

本目录是 A9-09 独立打包线。它复用锁定的 Electron 22.3.27 和 D-014 better-sqlite3 8.7.0 /
SQLite 3.43.1，并要求 D-017 锁定 Win10 工具链返回的 D-013 v25 Current-User helper。D-013 v24、
WIN7-19 及其证据保持只读，不继承 A7/A8 的产品 PASS。

从仓库根目录构建：

```text
node scripts/release/build-a9-product-v3.mjs ^
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
并生成一次性的 `a9-09-input-lock.json`，再构建正式候选：

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

WIN7-20 identity verifier 另有内置、版本化的完整产品闭包，不采信 manifest 自己定义的最小文件集合。
它要求正式 input lock、Shell Product/Preload/Renderer、七个运行时模块、离线依赖、Runner manifest、
native、SBOM、许可证、验证脚本和 kit 全部存在并交叉绑定；同步裁剪目录、manifest 和 ZIP 也会拒绝。
上述内部一致性不是批准来源。ADR-0104 要求由独立批准渠道提供 `WIN7_20_RELEASE_AUTHORITY` schema 1
记录的 SHA-256 pin；该记录锁定正式 input lock、批准清单 commit/hash、完整产品 ZIP/manifest/hash 和
产品 source commit。包内 lock 必须与候选外正式 lock 逐字节一致；两个 build/run/evidence binding 不得
复用；三个原生入口还验证 PE32+/AMD64/section/DLL 类型。完整格式及可信预飞行命令见
`A9_09_WINDOWS_VALIDATION.md`。不得从本候选或自行创建的外置文件生成“批准”pin。

`A9_09_VALIDATION_KIT.json` 和 `validation/a9-win7-20-report.cjs` 使用 WIN7-20 report schema v2：仅 8 个
`W17-*` 用例可用 `INHERITED_EVIDENCE`，但只能引用 kit 预先锁定的 WIN7-19 disposition、继承 ledger 与
incremental report 的 SHA-256/JSON pointer；任意新文件不能自报为历史证据。4 个 `W20-*` 用例必须直接
执行，每个 execution 的 `candidate` 必须等于当前 ZIP/manifest 计算出的候选身份，并绑定 Win7 build 7601
x64 普通用户、非提升、D-013 v25 Profile 的系统/令牌探测、候选启动和 postflight 证据。

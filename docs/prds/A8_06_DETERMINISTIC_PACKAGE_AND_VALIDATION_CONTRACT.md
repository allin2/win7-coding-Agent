# A8-06 确定性打包与三层验收准备合同

Status: `FROZEN_FOR_A8_06_IMPLEMENTATION`

Stage: `A8-06`

Gate: `A8_06_PACKAGE_AND_VALIDATION_READY`

Source: `docs/prds/WIN7_AGENT_FIRST_PRODUCT_REQUIREMENTS_V1.md` §8、`docs/tasks/A8_AGENT_FIRST_PRODUCT_EXPERIENCE.md` §6

Decision: `ADR-0084`；evidence 修订：`ADR-0085`

## 1. 范围与停止边界

A8-06 只负责 `0.2.0-alpha.1` 的确定性产品候选装配、运行时/原生工件闭包、manifest/SBOM/许可证、
安装生命周期操作说明、A8-03/A8-04/A8-05 锁定验证入口以及同一候选的开发机/Win10/Win7 验收模板。
它不得修改 A7 `0.1.0-rc.1` 工件，不得下载依赖，不得把未锁定或缺失的 Electron/Runner/SQLite 工件伪装
成 PASS，也不得在没有真实三层证据时改变 A8 `NOT_PERFORMED` 状态。

## 2. 输入闭包

- `electron-v22.3.27-win32-x64.zip`、D-013 v24 helper 返回包和 D-014 better-sqlite3 8.7.0 返回包必须
  由 `a8-06-input-lock.json` 的精确 SHA-256、必需 ZIP entry、Electron ABI 110、SQLite 3.43.1、
  `ENABLE_FTS5`/`ENABLE_COLUMN_METADATA`/`THREADSAFE=2` 约束。
- 输入缺失、哈希不匹配、ZIP CRC/路径异常、版本或 ABI 不匹配时，构建在写入候选前失败；不读取网络，
  不回退到 A7 已验收 ZIP 的 PASS 结论。
- 源码、`src/*/dist`、产品 JS、锁定测试入口和声明文件均纳入候选 manifest；禁止 `.git`、缓存、私钥、
  `.env`、`winpty`、`node-pty` 和临时目录。

## 3. 目录与运行时

- 独立输出目录：`release/win7-product-v2/out/Win7CodingAgent-0.2.0-alpha.1-win7-x64/`。
- Electron 主程序与本地 UI 处于候选应用目录；Runner helper、Runner manifest、better-sqlite3 native
  binding 与其运行时包位于 `resources/native/`，不进入 ASAR，启动前由 `release-manifest.json` 哈希校验。
- `rc-runtime.json` 明确 Electron/Node/ABI/SQLite Profile 和 disabled capabilities；交互 Terminal、任意
  Shell、任意 Browser、Git 写入、自动更新和未登记 Runner 不得出现在能力清单。
- `userData`、state DB、Review staging 和 runner work 必须位于候选外部用户数据目录；不得打开或写入 A7 DB。

## 4. 证据与验收包

- `release-manifest.json`：schema v1、候选版本、source commit、输入哈希、完整文件哈希、native 绑定、
  `developer_package_integrity: PASS`，以及 `product_assembly/win10/win7: NOT_PERFORMED` 初始状态。
- `SBOM.cdx.json`：CycloneDX 1.5，逐项记录版本、SHA-256、许可证、来源和 EOL/降级说明；
  `THIRD_PARTY_LICENSES.md` 和 Electron/Chromium notices 必须随包交付。
- `<candidate>.zip.sha256` 与 `A8_06_BUILD_RESULT.json` 必须由最终字节重算；ZIP 使用固定 epoch、排序、
  UTF-8 路径和无额外时间字段，重复构建字节一致。
- `A8_06_VALIDATION_KIT.json` 锁定精确命令、expected case IDs、报告 schema、hash 双向核对、安装/升级/
  回滚/卸载和失败回收步骤。任何一层不可用写 `NOT_PERFORMED_EXTERNAL_ENV_UNAVAILABLE`，不得写 PASS。
- 候选可以携带签发前已冻结的阶段合同和检查点，但不得复制需要回填最终 ZIP/manifest 哈希的
  `a8-agent-first-product-latest.json` 或构建后验收报告；这类证据必须位于候选外，以避免自引用和包内过期状态。
- 正式 A8-03/A8-04/A8-05 报告使用 evidence schema v2，逐份复算候选完整 manifest，记录相同
  `candidate_id + candidate_manifest_sha256`，并由 evidence-set verifier 联合校验；调用者自填标签不能替代
  候选绑定。报告、截图、stdout/stderr 和临时数据库必须写在候选目录外，执行前后候选文件集合及哈希不变。
- D-014 native smoke 必须由 manifest 绑定的包内 Electron 22.3.27 以 Node 模式执行，并显式校验 Win32 x64、
  Node 16.17.1、ABI 110 和 Win10/Win7 实际系统版本；普通 Node 不得直接加载 Electron binding，正式层也
  不得省略 `--require-d014`。`source_dirty: true` 的开发包不得进入
  Win10/Win7 正式评分，验证工具必须在启动产品前 fail-closed。

## 5. 必须通过的开发机检查点

| ID | 必须证明 |
|---|---|
| A8K-01 | 缺失/错误输入和禁止文件 fail-closed，候选目录不会产生半包 |
| A8K-02 | Fixture 输入可重复构建，ZIP/manifest/SBOM/许可证与 sidecar 哈希字节一致 |
| A8K-03 | native 外置目录、rc-runtime、disabled capabilities、manifest 双向校验合同通过 |
| A8K-04 | 同一干净候选的 A8-03/A8-04/A8-05 命令可直接在 Windows 执行；Electron ABI 110、schema v2、manifest 全树与候选外证据集联合校验 |
| A8K-05 | 安装/并行共存/升级/故障回滚/卸载说明明确不改网络、PATH、服务、注册表或旧 RC |

开发机 Gate 只表示打包和验收准备完成；Electron 22.3.27、Win10、Win7 与最终 `A8_RC_PASS` 仍必须
在同一锁定候选上分别执行。

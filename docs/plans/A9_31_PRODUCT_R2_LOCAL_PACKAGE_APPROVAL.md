# A9-31：修复后开发检查包r2的准确本地装配合同

日期：2026-10-04。Status: APPROVED_AND_LOCALLY_ASSEMBLED。
负责人已具体批准§1–3并完成本地新checkout/离线装配与包检查；结果见§5。远端部署、普通桌面重验及Win7均NOT_PERFORMED。

## 1. 请求、源码和成功条件

[五路径源码提交](A9_31_WINDOWS_WORKSPACE_REPAIR_SOURCE_COMMIT_APPROVAL.md)已具体批准并完成：`898ee9459a9b987840e94ddef336556ea58dd389`，分支`codex/a9-31-background-tools`。原82项State/117项Shell及verify:quick的实际源码字节与提交blob一致；修复报告和首失败保留。
现请求从该准确source生成一个本地开发检查包r2，核对全部包内容、runtime/Profile/native/许可证/SBOM一致性并交付准确ZIP/manifest/hash及后续Windows执行输入材料。本合同不修改实现源码，不增加接口/API/ADR，不要求再次原生构建。

## 2. 精确本地创建目标及依赖

在当前A9-31工作树下新建候选外根`.acceptance/a9-31-developer/product-r2`，仅用于本次本地装配、取证和返回材料；批准前只读检查该根不存在。
准确干净checkout：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r2/source-checkout`；从当前本地仓库clone --no-checkout --shared后以detached HEAD检出上述40位source，不修改原仓库HEAD、refs、remotes或已有工作区。
准确全新output：`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r2/package`；运行前必须不存在，不复用r1或失败输出目录。
checkout内仅新增以下被git忽略的依赖链接，读取现有离线锁定依赖，不安装、不下载、不写入链接目标；无法证明锁定依赖或会写入现有依赖时停止：

| checkout内路径 | 既有只读依赖目标 |
|---|---|
| node_modules | /Users/qlyf/Developer/win7-coding-Agent/node_modules |
| src/core/node_modules | /Users/qlyf/Developer/win7-coding-Agent/src/core/node_modules |
| src/gateway/node_modules | /Users/qlyf/Developer/win7-coding-Agent/src/gateway/node_modules |
| src/git-adapter/node_modules | /Users/qlyf/Developer/win7-coding-Agent/src/git-adapter/node_modules |
| src/runner/node_modules | /Users/qlyf/Developer/win7-coding-Agent/src/runner/node_modules |
| src/shell/node_modules | /Users/qlyf/Developer/win7-coding-Agent/src/shell/node_modules |
| src/state/node_modules | /Users/qlyf/Developer/win7-coding-Agent/src/state/node_modules |
| src/workspace/node_modules | /Users/qlyf/Developer/win7-coding-Agent/src/workspace/node_modules |

锁为新checkout内`release/win7-product-v3/a9-v26-managed-input-lock.json`，SHA-256 `7593e7584305fd76f8ebb7d99adbdcb302a3272ccd616423c2346bd7ff461d3e`。
只读输入档案如下，形成材料时逐文件哈希/尺寸已重新核对；执行前再次核对，不改写任何输入：

| 输入 | 精确路径 | SHA-256 |
|---|---|---|
| electron_zip | /Users/qlyf/Developer/win7-coding-Agent/.acceptance/deps/electron/electron-v22.3.27-win32-x64.zip | ad723ed7dad32f9459f7a9de1fd6d718cf713c4809c2431503bea62ce8f786e6 |
| storage_return_zip | /Users/qlyf/Developer/win7-coding-Agent/.acceptance/deps/a6/WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip | 2cb0cd324bb449fb5457549addd3e7f8f0610d6258415309ee748fb279a72794 |
| runner_return_zip | /Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/native-kit-r3/return-BuildA/WIN7_D013_V26_HELPER_ARTIFACTS_20261003-060935.zip | 251674103e519b4e642c46b38d2b8af29929732a209613cfc5d3721daba47a40 |

native helper仍`2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7`；旧Electron22.3.27/SQLite3.43.1/ABI110保持锁定输入。

## 3. 准确生产者与验证

使用上述source中的`scripts/release/build-a9-product-v3.mjs`，SHA-256 `a66f8f9230963d4591503a56d6ff8896ed4931c5719d57bffa453242009b94fe`，Node20.17.0绝对入口及其bin PATH，以下固定argv在准确checkout中执行：

```json
[
  "/Users/qlyf/.nvm/versions/node/v20.17.0/bin/node",
  "scripts/release/build-a9-product-v3.mjs",
  "--electron-zip",
  "/Users/qlyf/Developer/win7-coding-Agent/.acceptance/deps/electron/electron-v22.3.27-win32-x64.zip",
  "--storage-zip",
  "/Users/qlyf/Developer/win7-coding-Agent/.acceptance/deps/a6/WIN7_A6_SQLITE_ARTIFACTS_20260806-172601.zip",
  "--runner-zip",
  "/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/native-kit-r3/return-BuildA/WIN7_D013_V26_HELPER_ARTIFACTS_20261003-060935.zip",
  "--source-commit",
  "898ee9459a9b987840e94ddef336556ea58dd389",
  "--formal-input-lock",
  "/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r2/source-checkout/release/win7-product-v3/a9-v26-managed-input-lock.json",
  "--output",
  "/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent/.acceptance/a9-31-developer/product-r2/package"
]
```

采用已有`A9-31-DEVELOPER-INPUTS-D013-V26-MANAGED`分支，不传allow-uncommitted。执行前HEAD/source/干净git status、批准登记及锁必须逐字节通过；checkout工作区和原工作树前后状态均取证。
生产者从锁定源码编译core/gateway/git-adapter/runner/shell/state/workspace七模块，不将当前tracked旧dist或本地修复检查的临时dist作为打包输入。保存首次编译/装配失败，不通过编辑源码或放宽干净门重试；源码需要变化时回对应批准实现合同。
仅沿用生产者在全新output下的自身临时构建行为；不清理原工作树、既有候选/证据/输入。失败输出保全后若重试需要新output，应先登记准确新目标，不覆盖原产物。

完成后使用同source的verifyA9ProductZip、ZIP与展开树双向逐文件核对、actual包内runtime描述符/Profile/helper/SQLite/hash核对以及许可证/SBOM/runner manifest一致性检查。检查必要调用行为/源码编译输出，确认修复后的State及managedOwner/onOutput链路进入实际新包；不在Mac执行Windows native/SQLite，不能将静态包检查写成真实WindowsPASS。
返回ZIP、sidecar、manifest、A9_31_BUILD_RESULT及完整外部日志/结果/源码与输入SHA；锁定输入及源码不变的原检查只按精确字节登记继承，不重绑旧报告。源码绑定+当前包完整性为本次直接证据，实际桌面仍未执行。

## 4. 后续边界与批准依据

本包保持`A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE`，external_acceptance_eligible=false，不分配WIN7-43，不带候选authority，不宣布完整Alpha2/RC。
新Windows目标根/控制器/外部脚本及测试phase合同在取得准确ZIP/manifest/hash后单独形成；不恢复R10，保留其Background失败、未执行项及历史UNKNOWN。
本次请求仅批准§1–3的本地新checkout/离线依赖读取/生产者装配/检查和材料。不提交、推送、合并或写远端，不改native/输入锁/系统设置/账户/ACL/UAC/Bitvise，不委派或运行Win7。
五路径提交合同§3明确“本次提交不批准新打包”；A9-31§6要求后续准确动作单独绑定。该边界导致本轮仅准备材料，待本合同具体批准后才执行新包装配。

## 5. 负责人具体批准与本地执行结果（2026-10-04）

负责人对§1–3请求回复“批准”；原审批材料SHA-256为`f415096d1b1534fa3f203ec200ed4d10cb17fee729192e816dfde049edd7c2a8`，完整原文保存在product-r2/approved-local-package-contract.md。批准登记owner-approval.json SHA-256为`1054cab33e8b9ead00bfec12009aa938b46c2f1bf052653d10f5441c63fd069a`，原待批段为历史时点。

准确source898ee945的干净detached checkout及全新output已生成；生产者首次exit0，ZIP为`d7323ac4f6ddb674eb93fdea2cd2007ed62679268afe37a6df8df29115122c47`，manifest为`1c5084a4a8d194e33af48d6c15d3e661f0808931558eacf41b849016816b6225`。同source ZIP验证、784文件双向闭包、实际包runtime描述符/native哈希/JS入口、State编译修复/适配器受控转发、许可证/SBOM及r1/r2影响比较通过。
仅在新克隆.git/info/exclude登记合同八个精确依赖链接，使其按合同忽略；未修改源码.gitignore或其他路径的干净门。准备首失败/排除字节、原始日志和工作区保护均保留。
证据根为`.acceptance/a9-31-developer/product-r2/`；[本地结果报告](../reports/2026-10/a9_31_product_r2_local_package_2026-10-04.md)及local-package-evidence-matrix.json提供准确产物和直接/继承/未执行边界。
本包仍无正式候选authority，未提交/推送/合并/写远端/重编native/恢复R10/委派/运行Win7；新Win10及独立收口NOT_PERFORMED。[后续Windows合同](A9_31_PRODUCT_R2_WIN10_VALIDATION_APPROVAL.md)仅草案，尚未批准。

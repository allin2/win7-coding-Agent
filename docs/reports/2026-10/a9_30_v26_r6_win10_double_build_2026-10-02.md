# A9-30 v26 r6 Win10 双构建与返回闭包记录

两次授权原生构建命令完成，两个独立返回包通过完整 production inspector 的只读校验；helper 逐字节一致。结论为 `DOUBLE_NATIVE_BUILD_BYTE_IDENTITY_VERIFIED`，不签发 A9-30 `DEVELOPER_VERIFIED`。背压清理仍为 `UNKNOWN`；产品 v26 输入锁、打包及真实 Electron、Win7 均未完成。

## 1. 授权、源码与环境

本次沿用负责人批准的 Win10 `192.168.1.4`、`D:\A9-A30-V26-20261001\control`、两个全新 `build-r5-a` / `build-r5-b` 目录和 SID1005 的精确 fixture 权限。负责人恢复连接后明确指示“开始构建”。未创建额外构建目录、调整账户、Bitvise、UAC、系统策略或电源设置。

实现工作树为 `/Users/qlyf/.codex/worktrees/a9-30-shell-streaming/win7-coding-Agent`，分支 `codex/a9-30-shell-streaming`，批准登记 HEAD `3e2f6f602bf7b6aa0786b7c800c8541eff1198f4`。原生源码提交 `7feae402edfb30da9adb649841d777ca82cc6e80`；r6 kit、input-lock、PACKAGE_MANIFEST 的完整哈希见[独立套件报告](a9_30_v26_r6_independent_kit_review_2026-10-02.md)。kit ZIP SHA-256 为 `8c0f79bf2f5383be3b59b6542f27e159c00efb23f07eeabdc0a05477462cf406`；批准 registry blob SHA-256 为 `ec3afc309ee3fa4dedee3e62997ba8a57b636b404b63bde17e5b4f7a75b711a5`，与准确 HEAD 字节一致。

实际主机 `WIN-2JQ66JE4HTQ`：Windows 10 Pro x64 `10.0.19045.0` / UBR6466、PowerShell `5.1.19041.6456`、VS2019 BuildTools `16.11.37507.1`、MSVC `14.29.30133` / v142、SDK `10.0.19041.0`。两轮均实际检测当前 `a9builder` SID `S-1-5-21-3031939772-989444280-3099258187-1005`：普通用户、非提升、Medium、无 Host Job。使用同用户显式 breakaway 的非 GUI 控制台，不使用凭据，不修改服务或账户设置；该路线不证明 Electron 桌面交互。

投放前实际 PS5.1 解析、缺批准负例、宿主/工具身份、空目录、完整 23 文件输入及五项输入篡改负例通过。kit 内 13 个 native source 与指定 git blobs 原始字节一致；两个构建 worker 在开始前再次校验输入及批准绑定。仅在各自两个私有 v1 fixture 给本人不继承 WRITE_OWNER，记录精确增量、打开证明及原 ACE/owner；不扩大到父目录。

## 2. 两次实际结果

| 项目 | A | B |
|---|---|---|
| 目录 | `build-r5-a` | `build-r5-b` |
| run-id | `16b5abc3-e4bb-4615-a5bc-12e02fcb5e17` | `33e3d3c9-bf4d-4f40-92f5-31b8915d13f9` |
| 完成时间（+08:00） | `2026-10-02 08:22:56.9705958` | `2026-10-02 08:35:48.7988600` |
| 返回 ZIP | `WIN7_D013_V26_HELPER_ARTIFACTS_20261002-002257.zip` | `WIN7_D013_V26_HELPER_ARTIFACTS_20261002-003548.zip` |
| ZIP bytes | 207549 | 207575 |
| ZIP SHA-256 | `4634a99211556698421649ba381ebb9192b523c4bbf1e0080a40137dba2d203a` | `c9591d5ba2bce1edbf72bd08287774eaf8074c17e1a3903f40be3fcd9d232e75` |
| sidecar SHA-256 | `467c65f710f88fb3bd4535a639ce5f191804440acee8097003efe3f5d725d2db` | `3edaef652821fd483a23b01477a85277436180bbccdf0a47219b04da1524e421` |

两个 helper 均为 **350720 bytes**，SHA-256 **`c895a2f9e4abcb84ae2295d2e33ada6289cfd34c692b88e92276e7749cdc5a2b`**；从原始 ZIP 提取后 Buffer 逐字节比较一致。两个 run-id、返回 ZIP 哈希、验证绑定哈希各自独立；工具身份摘要相同：`18fb8e85331d9a6c6c21064d29235b5c29d28007599b4de5457873216ad6bd65`。

每个返回包 58 个精确文件，RETURN_PACKAGE_MANIFEST 覆盖另外 57 个文件的完整名称、尺寸与哈希。kit source/Profile/输入锁、原始工具日志、token/ACL/请求/协议输出、实际 PE x64、禁止 API imports、静态 CRT、嵌入 manifest 等经过 production inspector 核对，未删文件迎合旧清单。

| 检查 | 直接证据与结论 |
|---|---|
| 编译、logic、capture | 两轮命令 exit 0；原始日志与 capture JSON 校验通过 |
| v1 / v2 回归 | 两轮实际普通用户执行；版本、ACL/LABEL 往返及取消等原始证据通过检查 |
| PE / API / CRT | 两轮 AMD64、嵌入 manifest、无禁止 imports / 无动态 CRT 依赖；静态 `/MT` |
| v3 双源 tick | A 启动帧24ms、首输出83ms、约2067ms双源输出、4089ms终态；B启动帧22ms、首输出75ms、约2073ms双源输出、4104ms终态；运行中输出早于结束 |
| UTF-8 / CP936 / UTF-16LE、上限 | 两轮对应原始字节/序号/Base64/终态校验通过；不等于 UI 中文跨块展示验证 |
| v3 cancel | A 586ms、B585ms；cancel_written=true、无超时，结构化返回经检查 |
| v3 backpressure | 2500ms 慢消费者；A2546ms / B2545ms，exit10、cancel_written=true、13帧、无执行终态；只支持有界 fail-closed，清理 `UNKNOWN` |
| helper / 工具字节一致性 | 两个实际原始 helper 全字节相同，工具身份摘要相同 |
| 产品 S01–S06、SQLite/IPC/DOM/焦点/退出 | 本次 native smoke 不覆盖，实际 Windows Electron 检查 `NOT_PERFORMED` |

构建脚本产生的 `status=PASS` / `candidate_eligible=true` 是该脚本的原始字段，本报告保留它们，不将其等同于完整 A9-30/Win7 候选资格。背压无终态的清理事实必须继续核验或明确补齐报告后再裁决相应门。

## 3. A 返回闭包首失败与最小修正

A 原生构建已成功，但旧记录器遗漏生产者有意返回的 `helper.exe.manifest`，首次真实返回检查报 `A9_V26_RETURN_FILE_SET_MISMATCH`：实际58项、旧预期57项，唯一额外项为该 manifest。保留 A 原始 ZIP、sidecar、失败记录及校验器失败输出；未修改原始包、manifest 或原生 source/kit。

在 A9-30 已批准精确白名单内修正三文件，当前均为未提交修改：

| 文件 | 当前 SHA-256 | 改动 |
|---|---|---|
| `scripts/release/record-a9-v26-helper-input.mjs` | `47c2064017f59885ec5bb19638f02dab2cd82b796bc3468d20cef94c5fa973d3` | 纳入精确返回清单，并要求 manifest 与批准 kit 原始字节相同 |
| `scripts/release/test/v26-evidence-fixture.mjs` | `658010a7e085cf5c32a1faa39bb054c67fd49b03167e1a4349cac9ce4be83510` | fixture 对齐真实生产闭包 |
| `scripts/release/test/v26-prepare-kit.test.mjs` | `7b9077819a7945b3665636e05f0722b1dcf3fb6f2cc6e726f10252c93bec874f` | 缺 manifest、改 manifest 并重绑定返回清单的负例 |

先运行新负例和真实 fixture 对照，红阶段2 FAIL/1 PASS；修正后 v26 定向测试48 PASS/0 FAIL/2 Windows平台专项SKIP，`git diff --check` 通过。macOS SKIP 不代替 Win10证据；实际 PS5.1 控制文件语法检查通过。仅修改返回清单及 manifest 绑定，不放宽身份、源码、Profile、PE/API/CRT 或审批门。

A 失败后 B 尚未请求：先核对原等待控制器 PID25112/准确启动时间、A 已终态及 B 无请求，再终止并等待该自有空闲控制器退出。修正和独立只读复核通过后，启动 B 专用控制器 PID13176，实际身份再次通过，绑定 A 成功事实及同一 kit/approval；核对 PID/开始时间与 B 未执行后 CreateNew 写一次准确 B 请求。B 在尚未消费的全新 `build-r5-b` 执行，未重建 A、复用旧失败构建或增加权限。

只读生产检查使用准确当前记录器的 `inspectApprovedKit` / `inspectEligibleReturn` 函数定义，核对 HEAD 中的批准 registry，然后检查两个原始返回包及 helper 字节；未调用生成锁入口。记录器源哈希与函数定义哈希均记录于 `r6-double-build-readonly-production-validation.json`。

## 4. 独立复核与证据索引

套件/控制独立复核见既有报告。consumer 修正、A 原始返回及 B 专用入口独立只读复核为 P0/P1/P2=0，时间 `2026-10-02T08:30:44+08:00`，复核人 `/root/a9_30_r4_label_review`（gpt-6-luna/high）、实现方 `/root`。复核人未运行远端或构建；48项定向测试日志为 `INHERITED_EVIDENCE`。

两个原始返回包最终独立只读复核 **PASS，P0/P1/P2=0**，时间 `2026-10-02T08:38:11+08:00`；实现方与复核人相同角色分离。复核人逐项重算两包清单及哈希、核对批准 kit、原始环境/ACL/协议/PE证据与 helper 字节；详见[独立返回报告](a9_30_v26_r6_independent_return_review_2026-10-02.md)。产品输入锁尚未生成，`return_review` 未自行登记。

证据均位于本 A9-30 工作树 `.acceptance/a9-30-developer/closeout/`，候选外保存：

- `build-a-r6-return/`、`build-b-r6-return/`：实际原始 ZIP 和 sidecar。
- `r6-double-build-readonly-production-validation.json`：完整生产只读校验，两 helper 全字节比较。
- `r6-double-build-evidence-index.json`：32项精确文件名称、尺寸与SHA-256索引，包括批准/身份/投放/负例/首失败/测试/两个返回包；生成时独立返回复核 PENDING 的快照保留。
- `r6-build-a-return-closure-failure.json`、`r6-controller-stopped-after-return-closure-failure.json`、`r6-manifest-regression-red.log`：首失败与停下游事实。
- `r6-manifest-regression-green.log`、`r6-receiver-fix-local-validation.json`：修复及48项测试。
- `r6-build-b-launch-live-identity.json`、`r6-build-b-request-created.json`、`r6-build-b-progress-r2.json`、`r6-build-b-return-transfer.json`：B实际身份、一次请求、结果、原始传回字节。

读取 B 状态的首次观察命令受 Windows ExecutionPolicy 拒绝，记录为 `r6-build-b-progress-r1.json` 及 `.stderr.bin`；构建本身已完成，未重启。改用任务合同内 process-level `-ExecutionPolicy Bypass -File` 只读观察，未改持久策略。该观察错误不改写为构建失败。

## 5. 后续门与未执行项

三文件准确 consumer 差异、本次两个报告及 registry 的准确双返回复核登记草案，共六个精确路径的本地提交材料已准备，见 `.acceptance/a9-30-developer/closeout/r6-receiver-commit-approval-material.json`。registry 草案只保存在证据目录，实际批准登记仍与 HEAD 相同；获具体批准后才能应用/提交并按生产记录器生成新的开发输入锁。既有 source7feae/kit批准保持不变，不把“开始构建”扩展为新源码提交授权。

背压清理继续保持 `UNKNOWN`；完整 S01–S06 尚需锁定工件后的真实 Windows Electron22/Node16 贯通、脱敏、恢复与交互证据。原生返回字节一致仅证明本次双构建，不能代替产品重锁、打包、真实 Electron、Win7、整体 Alpha2或RC。不占用 WIN7-43；A9-31/A9-32未开始。未推送、合并或改写历史，主工作区现有改动及所有旧输入/失败证据保持。

# A9-31 managed r3 返回登记与离线重锁具体审批包

```text
Status: READY_FOR_OWNER_DECISION
Branch: codex/a9-31-background-tools
Current HEAD: a4ec353721af6e905e199d9859fa3d80f098e78e
Native source: 10114503a1e79706131ea4a11a5b96bd2958807a
Independent technical review: PASS_TECHNICAL_RETURN_EVIDENCE
Independent findings: P0=0 / P1=1 / P2=0 (controller lifecycle evidence gap)
Input-lock eligibility: NOT_APPROVED_FOR_INPUT_LOCK
Owner decision: NOT_APPROVED
Managed input lock: NOT_LOCKED
Win10 product / Win7: NOT_PERFORMED
```

## 1. 本次申请与可观察结果

负责人要求“继续推动”，本轮已完成独立gpt-6-luna/high只读返回复核及准确交接，
未把继续指令解释为未形成具体材料的提交/重锁裁决。
[独立报告](../reports/2026-10/a9_31_managed_r3_independent_return_review_2026-10-03.md)
SHA-256 `ec25b08d3ba66ce4d705e2007f6e4307fdfa8f1e6326e2c633dc631f38194ae4`；实现方/复核人为不同角色。

本包请求批准[ADR-0158 Proposed](../DECISIONS.md#adr-0158-a9-31-准确原生双返回的有限离线重锁裁决)、
已复核的两文件记录器修正、准确十路径本地登记提交，随后生成新的managed输入锁并追加准确五路径本地提交。
成功结果为：不可变双返回和独立技术报告绑定到clean committed registry，新锁锁定helper和managed合同，
controller exit/tree `UNKNOWN`及背压终态缺失原样保存；Win10产品/Win7仍未执行。
这不签A9-31开发机收口，也不代替新候选、门A/B、Alpha2或RC裁决。

## 2. 准确不可变输入

| 输入 | 精确绑定 |
|---|---|
| source | `10114503a1e79706131ea4a11a5b96bd2958807a` |
| native kit | `A9_31_V26_MANAGED_BUILDKIT_r3.zip` / `0191f61db2719eb42e0cbf822cbed6f6f07eeed69a7c5f0b04a9e19d54a367c1` |
| 原批准registry HEAD / SHA | `a4ec353721af6e905e199d9859fa3d80f098e78e` / `9dffe8e85a2cb83a580f74cf449626ecfa1b2ac06f5d76ee2ea63cf83f018d8c` |
| BuildA | run `3abe9a16-449b-4900-956e-6d0fb4c40fe2` / ZIP `251674103e519b4e642c46b38d2b8af29929732a209613cfc5d3721daba47a40` |
| BuildB | run `33514a91-c5e8-4bb0-9176-135782175c88` / ZIP `ce8679187e120d8c0c9896fd201f37dfb1187e87d58702c3529f24b73737ff44` |
| helper | 361472 bytes / `2036bf697f16db523c297d150661b43be76458eb718ca24781ebed98ab51e4b7`，两个返回逐字节一致 |
| Profile / revision | `WIN10-VS2019-V142-SDK19041-D013-V26-MANAGED-X64` / `a9-31-managed-r1` |
| 旧W42基础锁 | `release/win7-product-v3/a9-27-win7-42-input-lock.json` / `bf0430d626301eab174a8906338e8d8bae015c0c31d94bbf5c8bc2212847d68f` |

kit23文件源快照与source逐项相同；两个返回各71唯一条目、manifest70项size/hash及sidecar精确匹配。
原生v1/v2/v3/managed生命周期/PE/API/CRT通过，实际普通SID1005/Session3/Medium/非提升/无Job直接核对。
原生证据不等于Win10真实产品或Win7运行证据。

## 3. UNKNOWN的有限裁决

控制器PID24088完成记录和消失不能证明其实际退出码/完整树清理；06:06–06:12UTC Security4688/4689
只读补查无匹配事件，不能事后还原已丢失的进程句柄。唯一P1是证据缺口，不是产品失败。
依ADR-0157，当前停止新锁和装配。仅负责人具体批准ADR-0158后，可对本包两个准确返回允许离线重锁。

该决定只改变本包准确返回的离线准入：controller状态仍UNKNOWN，P1不伪造为0或清理PASS。
如果独立报告存在原生身份/审计/安全/根子生命周期缺口，不可使用这项裁决。
实际原生背压无终态保持批准的有界失败边界，未核实清理不改判。

本申请不新增远端执行、不复用已退出控制器、不重新构建、不调整账户/ACL/UAC/Job/许可证。
后续新控制器须预先形成完整生命周期取证合同。若负责人不接受本次UNKNOWN风险，保留全部证据，
重锁继续NOT_LOCKED；另拟新的可证据化执行合同，不能通过重编未变helper回填旧控制器事实。

## 4. 准确本地登记提交（十路径）

仅以下十路径，按最终审批快照逐文件size/SHA审核；不使用git add -A。

1. `scripts/release/record-a9-v26-helper-input.mjs`：修复kit登记编号误等同native revision，保留所有源/哈希/固定native合同门。
2. `scripts/release/test/v26-prepare-kit.test.mjs`：采用实际r3登记编号，增加已重新哈希但错误native revision的拒绝反例。
3. `docs/reports/2026-10/a9_31_managed_r3_native_double_build_return_2026-10-03.md`：原生双返回事实和首失败/修复记录。
4. `docs/reports/2026-10/a9_31_managed_r3_independent_return_review_2026-10-03.md`：独立原回复存档，原结论/0-1-0计数保持。
5. `docs/plans/A9_31_MANAGED_R3_RETURN_RELOCK_APPROVAL.md`：本包及负责人实际审批追加。
6. `docs/DECISIONS.md`：只新增ADR-0158；批准后其状态由Proposed转Accepted，ADR-0157正文不改。
7. `docs/tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md`：追加返回复核、负责人准确裁决/登记；不升阶段门。
8. `docs/STATUS.md`：追加本轮事实/待执行项。
9. `docs/STATUS_LOG.md`：保留历史并追加准确过程。
10. `release/win7-product-v3/a9-v26-approved-build-kits.json`：只增加managed r3的return_review，历史kits及顶层controller_retries不变。

registry预览位于 `.acceptance/a9-31-developer/native-kit-r3/proposed-managed-r3-return-review-registry-20261003.json`，
SHA-256 `95189812796c394168e2b48ccd0feb1bd63ae268a7a2476161df7661b13f5ca7`，当前为PENDING_OWNER_APPROVAL_FOR_INPUT_LOCK；未写正式registry。
预览已经绑定独立身份、报告SHA、两run-id/ZIP、0-1-0发现、原NOT_APPROVED独立准入结论和
controllerUNKNOWN、准确证据SHA。批准后仅将本项status设APPROVED_FOR_INPUT_LOCK，
owner_decision.status设APPROVED并补实际approved_by=user/approved_at；不改独立报告结论/发现数。
新增登记状态体现负责人对ADR-0158的具体裁决，不能表述为独立复核自签豁免。

文档审批后只追加实际负责人批准/commit/时间以及ADR-0158状态；代码和独立报告字节保持审批快照。
提交前后核对精确差异和blob；若有其他变更或基线漂移，暂停相应提交，不混入主工作区改动。

## 5. 正式生成与锁登记提交（五路径）

第一提交后读取该HEAD中字节一致的正式registry，正式记录器检查source/kit/两返回/独立登记和旧锁。
使用Node20.17绝对入口，不使用testOnly、临时registry或占位hash；新锁路径必须不存在。

```sh
/Users/qlyf/.nvm/versions/node/v20.17.0/bin/node scripts/release/record-a9-v26-helper-input.mjs \
  --runner-zip .acceptance/a9-31-developer/native-kit-r3/return-BuildA/WIN7_D013_V26_HELPER_ARTIFACTS_20261003-060935.zip \
  --runner-zip-2 .acceptance/a9-31-developer/native-kit-r3/return-BuildB/WIN7_D013_V26_HELPER_ARTIFACTS_20261003-061029.zip \
  --kit-zip .acceptance/a9-31-developer/native-kit-r3/A9_31_V26_MANAGED_BUILDKIT_r3.zip \
  --base-lock release/win7-product-v3/a9-27-win7-42-input-lock.json \
  --output release/win7-product-v3/a9-v26-managed-input-lock.json \
  --lock-id A9-31-DEVELOPER-INPUTS-D013-V26-MANAGED \
  --win7-gate NOT_PERFORMED \
  --provenance 'A9-31 managed r3 D-017 double-clean native returns; independent technical review and exact owner ADR-0158 decision; controller exit code/tree UNKNOWN and raw-pipe backpressure missing terminal retained; development input lock only.'
```

回读新锁确认helper/revision/Profile/source/kit/approvalHEAD、两个run-id/ZIP与证据哈希严格绑定。
新锁用开发用途；Win7/装配/产品完整性保持NOT_PERFORMED，旧Electron/SQLite/v25精确字节继承。
生成失败保留原错误，不修改旧锁、不装配。不预写未获得的generated_at/hash/commit。

成功后只追加以下五路径本地提交：

1. `release/win7-product-v3/a9-v26-managed-input-lock.json`
2. `docs/plans/A9_31_MANAGED_R3_RETURN_RELOCK_APPROVAL.md`
3. `docs/tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md`
4. `docs/STATUS.md`
5. `docs/STATUS_LOG.md`

该第二提交仅锁及实际结果/哈希登记；准确字节由正式锁生成并回读后固定到证据快照，再按本批准范围提交。
不推送、不合并、不发布，不分配WIN7-43，不启用新远端控制器或提前签开发机门。

## 6. 已完成验证与待执行项

- 实现方200 PASS/0 FAIL/2 WindowsPS本地NOT_PERFORMED；独立91 PASS/0 FAIL/2 WindowsPS本地NOT_PERFORMED。
- 正式Win10双构建和原生烟测的实际PS/身份/工具/日志证据单独保留；不把Mac平台跳过改成PASS。
- Node20.17父子环境7模块quick通过；编译生成的24项tracked Runner dist保留差异/哈希后恢复HEAD。
- 原记录器首失败、旧breakaway code5、首次30分钟等待超时及所有历史kit/报告保持原文/字节。
- 本材料只做文档/差异检查；本轮代码自独立复核输入未再修改，不重复成功的200项。
- return_review正式登记、两次提交、新锁生成/登记和后续装配尚未执行；Win10真实Electron与Win7仍NOT_PERFORMED。

准确逐文件审批快照：`.acceptance/a9-31-developer/native-kit-r3/return-relock-owner-approval-manifest-r3-20261003.json`。
其中registry使用上述PENDING预览字节；审批后唯一允许的状态/实际批准元数据变化已在§4列明。

## 7. 负责人裁决

当前未获得本包具体裁决，ADR-0158保持Proposed。负责人可批准本包§1–6（准确十路径登记，
准确双返回离线重锁和五路径锁登记），或要求另形成完整controller生命周期新执行方案。
本包不能以独立技术PASS自动升级为输入锁准入PASS。


## 8. 负责人具体批准与登记执行（2026-10-03）

负责人对本包§1–6及ADR-0158的具体请求回复“批准”；登记时间 `2026-10-03T07:10:46.920499Z`。
批准准确十路径本地登记提交、两个不可变返回的有限离线重锁和准确五路径锁登记提交。
ADR-0158据此Accepted；原ADR-0157正文不改，独立报告P0/P1/P2=0/1/0及
NOT_APPROVED_FOR_INPUT_LOCK原结论保留，registry以负责人APPROVED裁决单独登记准入。
controller PID24088实际退出码/完整树仍UNKNOWN，原生背压缺失终态不写清理PASS。
当前正在执行批准的第一提交，提交SHA/生成锁哈希仅在实际取得后追加；未生成输入锁。
无新原生构建或远端执行，不推送/合并/发布；真实Electron/Win7仍NOT_PERFORMED，
A9-31保持IMPLEMENTATION_IN_PROGRESS。前文待审状态为历史时点，以本节实际批准为准。


### 独立报告格式精确补批

负责人于 `2026-10-03T07:19:11.998517Z` 对准确格式请求回复“批准”：仅删除独立报告第3–7、17–18行
七处Markdown行尾双空格，共14字节，并同步return_review报告SHA。原版及首轮暂存差异失败完整保留；
新归档报告SHA-256 `d3067b1858846010ffdcef7403ccc0369873b5763e04aa7d568800678eab71e0`。
复核正文、原结论NOT_APPROVED_FOR_INPUT_LOCK、P0/P1/P2=0/1/0不变；
controller exit/tree UNKNOWN和ADR-0158有限范围不变，继续原十路径提交及五路径锁登记。

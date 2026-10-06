# A9-31：登记 `A9_31_DEVELOPER_VERIFIED`（带已知限制）

日期：2026-10-06。Status: DRAFT_NOT_APPROVED。请求负责人确认登记阶段门`A9_31_DEVELOPER_VERIFIED`。本材料只改治理文档，
不改源码/产品/native/锁，不运行测试，不连远端，不提交/推送/整合。结论上限不含独立验收、Win7、Alpha2/RC；**未在Win7实机验证**。

## 1. 依据：裁决r2的顺序已走完

[DEVELOPER_VERIFIED裁决r2](A9_31_DEVELOPER_VERIFIED_RULING.md)（SHA256 `672263a1…`；D1=B、D2=Codex独立复核、D3=G3/G4为已知限制）
规定：G2全量 → Codex复核 → 无P0/P1时起草登记条目 → 负责人确认后登记。逐项状态：

| 门 | 状态与直接证据 |
|---|---|
| G1 独立复核 | Codex首轮（ebda911全量请求）P0/P1/P2=0/2/1：两项P1均在Shell Policy，P2-1为§5命令清单（已按其改为先`verify:quick`、Core含`tests/policy.test.ts`）。P1经r1–r6修复：Codex第2–5轮复核r1–r4，r5、r6由原对话独立只读审核，按ADR-0184收敛标准未发现阻断项；负责人批准源码提交时确认收口（ADR-0181–0185）。最终源码=本地提交`8d207ab`（父ebda911，仅三文件+389/−12）。 |
| G2 §5全量 | r6交付运行`policy-p1-repair-r6/g2-summary.json`（SHA256 `9579f5cf…`）=`G2_ALL_COMMANDS_EXIT_0`：先构建，Core 535、Runner 166、State 82、Shell 117、release 200通过/2个Windows专项SKIP、verify:quick、docs:check、diff --check全部退出码0；dist恢复、受跟踪0差异。运行时三文件SHA（policy.ts `d06b03e0…`、policy.test.ts `881878ea…`、a9-background-tools.test.ts `a05e5493…`）与`8d207ab`逐一相同，`8d207ab`相对ebda911只改这三文件，故源码树等于最终提交（Mac开发机，非Windows证据）。 |
| Win10真实Electron（§5） | r4包（由`8d207ab`干净检出装配，ZIP `e96fdf96…`、manifest `d084907c…`，包内policy.js与同源编译逐字节一致）在R2根`WIN10_SINGLE_ROOT_PASS`（ADR-0186/0187，矩阵`product-r4-win10-r2/win10-evidence-matrix-r4-r2.json` SHA256 `905c4f4b…`）：普通入口（SID…1005/Session3/Medium/非提升/noJob）10请求全部首次正式评审PASS——焦点/Stop/退出选择（StopExit response 0、ReleaseExit response 1）、切换限制、release与回执丢失/取消竞态、崩溃重启恢复；准入另在Node 16.17.1直接加载包内Policy（ask 140/ordinary 238与HEAD一致/dispatch 11）。[统一报告§15](../reports/2026-10/a9_31_r5_manifest_proof_handoff_2026-10-05.md)。 |
| managed native | v26 revision、双构建、重锁的独立复核P0/P1/P2=0（2026-10-03各报告，锁`35a1925`）；r4包helper仍`2036bf69…`，未重编。 |

原G5（conhost证明分支未触发、跨根等价为推断）已解除：R2 Boot在普通环境真实触发并解析conhost 87缺口；单根结论不再依赖跨根组合。

## 2. 登记时附带的已知限制

- G3：崩溃时仍运行的受管进程，重启后`cleanup_required`无产品内处置出口，对话与正常退出被阻断（Recovery只证“保留清理未知”语义，隔离退出用`app.exit(0)`）；A9-34推迟到第二批之后，A9-33须列为已知限制。
- G4：原生退出对话框按Esc/“取消”的真实后果未实测。
- Shell Policy识别边界：按ADR-0184收敛标准收口，静态识别不覆盖所有间接调用形式，未识别的形式仍依赖产品其余确认路径。
- 证据边界：Win10为开发验证环境，非Win7；Policy与§5结果为Mac开发机；`8d207ab`仅本地提交，未推送/合并。

## 3. 不由本登记签发

独立验收、Win7实机（`Win7-Validation`保持`NOT_PERFORMED`）、Alpha2/RC候选、推送/合并/发布、A9-32/A9-33/A9-34任何状态。

## 4. 批准后的准确改动（仅文档）

1. 任务书[A9-31](../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md)头部`Phase-Gate: A9_31_IMPLEMENTATION_IN_PROGRESS`→`A9_31_DEVELOPER_VERIFIED`，末尾追加登记条目（依据、限制、不签发项）。
2. [任务索引](../tasks/README.md) A9-31行第四列同步为`A9_31_DEVELOPER_VERIFIED`；第五列`NOT_PERFORMED`不变。
3. `docs/DECISIONS.md`追加ADR-0188（登记与限制；不改既有ADR），同步`docs/DECISIONS_INDEX.md`。
4. `docs/STATUS.md` A9-31行与`docs/STATUS_LOG.md`更新。

无C14实现路径；不改`.acceptance/`既有证据。

## 5. 待负责人确认

- D1：登记前是否再做一次独立只读复核。
  - A（直接登记）：G1已按裁决链收口，R2证据由正式评审脚本（与R9同字节）判定。
  - B（推荐）：先交Codex做一次聚焦只读复核，范围限R2证据集与本轮两处工具偏差（sync-current派生更正、Recovery由完整回收组装观测），再登记。理由：R2执行与评审均由本代理完成，A9-30登记前的独立复核覆盖了返回证据；该复核不改源码，若出现P0/P1回到负责人裁决。
- D2：同意按§2列明限制登记（不把G3/G4当阻断，沿用D3）。
- 批准须按本稿SHA256绑定。

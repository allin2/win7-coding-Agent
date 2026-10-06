# A9-31：治理文档本地提交

日期：2026-10-06。Status: DRAFT_NOT_APPROVED。请求批准把A9-31累积的治理文档作为**一个本地提交**落到`codex/a9-31-background-tools`。
只含`docs/`文本；不含源码、产品、native、锁、`.acceptance/`证据（`.gitignore`已忽略）；不推送、不合并、不改写历史。未在Win7实机验证。

## 1. 基线与范围（执行前复核）

- 工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`，HEAD `8d207ab11d2c8134a81e4e62900f395aae99944e`，暂存区为空。
- 准确84个路径（附录A，排序后路径清单SHA256 `352693a647be46bbfe2274fc4b6b6b3421818df5a9583ce423168d55e35a59ff`，每行一个路径、LF结尾）：
  修改7个（`docs/DECISIONS.md`、`docs/DECISIONS_INDEX.md`、`docs/STATUS.md`、`docs/STATUS_LOG.md`、`docs/WIN7_CONSTRAINTS.md`、任务书、任务索引）；
  新增77个（`docs/plans/` 43个批准/裁决/修订材料含本稿、`docs/reports/2026-10/` 33个报告与复核请求、`docs/tasks/A9_34_RECOVERED_CLEANUP_DISPOSITION.md`草案）。
- 内容覆盖2026-10-03至今：R1–R10/R4–R9各根合同与结果、Policy P1修复链（ADR-0181–0185）、r4包与R2单根通过（ADR-0186/0187）、
  DEVELOPER_VERIFIED登记（ADR-0188）、ADR索引补齐（0150–0188）及WIN7_CONSTRAINTS中A9-31外部验证夹具登记。
- 工作树当前无源码/`native`/`scripts`/`release`改动；`src/runner/dist`受跟踪字节不变。
- 主检出`/Users/qlyf/Developer/win7-coding-Agent`（分支`codex/a9-alpha2`）的改动不在本范围、不触碰。

## 2. 执行步骤

1. 复核：分支/HEAD/空暂存区；`git status --porcelain -uall`的路径集合必须**等于**附录A（多一个或少一个即停）；`docs:check`与`git diff --check`退出码0。
2. 证据（新增，`.acceptance/a9-31-developer/governance-docs-commit-r1/`）：`pre-commit-status.json`（84路径各SHA256与大小、HEAD、分支）、
   `staged-name-status.txt`、`commit-result.json`。
3. 逐路径`git add -- <path>`（不用`-A`/`.`）；核对`git diff --cached --name-only`等于附录A，且每个暂存blob与工作文件哈希一致。
4. 提交，信息：
   ```
   docs(a9-31): record Win10 validation, policy repair governance and DEVELOPER_VERIFIED registration

   Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
   ```
   不用`--no-verify`；若钩子失败则停止上报，不绕过。
5. 复核：新提交父为`8d207ab`；`git diff --name-only 8d207ab HEAD`等于附录A；附录A路径在工作树已干净；其余未跟踪/忽略文件不变。
6. 结果写入`commit-result.json`，并在任务书追加结果条目（该条目将在下一次提交中带入，本提交后任务书因此重新出现改动属预期）。

## 3. 已知敏感信息核查

- 无私钥内容、口令或合成秘密字面量。私网地址`192.168.1.3/.4/.11`、`a9builder`、`WIN-2JQ66JE4HTQ`、`/Users/qlyf/...`在已提交文档中已大量存在（HEAD中49个文件含私网地址、45个含本机主目录路径）。
- **新出现**：两份报告写有SSH私钥**路径**`/Users/qlyf/.ssh/id_ed25519`（无密钥内容）：
  `docs/reports/2026-10/a9_31_manifest_diagnostic_handoff_2026-10-04.md`第119行、`docs/reports/2026-10/a9_31_r5_manifest_proof_handoff_2026-10-05.md`第31行。
  前者SHA已被既有证据记录引用（policy-p1-repair-r5/r6 `initial-files.json`、manifest-diagnostic-r1 `handoff-document-check-r1.json`）。见D1。

## 4. 不在本批准内

推送/合并/PR、改写或拆分历史提交、`.acceptance/`入库、源码改动、Win7、独立验收、Alpha2/RC、A9-32/33/34。

## 5. 待负责人确认

- D1：私钥路径两处。A 原样提交（推荐：只是路径不是密钥，且其一已被既有证据按哈希引用，改动会使这些记录指向旧字节）；B 提交前把两处路径改为“既有SSH密钥（路径略）”，并在任务书记录改前SHA。
- D2：提交信息如§2.4，或另给。
- 批准须按本稿SHA256绑定。

## 附录A：准确路径清单（84）

```
docs/DECISIONS.md
docs/DECISIONS_INDEX.md
docs/STATUS.md
docs/STATUS_LOG.md
docs/WIN7_CONSTRAINTS.md
docs/plans/A9_31_CONHOST_CAPTURE_DIAGNOSTIC_APPROVAL.md
docs/plans/A9_31_CONHOST_MANIFEST_FIELDS_APPROVAL.md
docs/plans/A9_31_DEVELOPER_VERIFIED_G2_R2_AMENDMENT.md
docs/plans/A9_31_DEVELOPER_VERIFIED_G2_R3_AMENDMENT.md
docs/plans/A9_31_DEVELOPER_VERIFIED_G2_TEST_RUN_APPROVAL.md
docs/plans/A9_31_DEVELOPER_VERIFIED_REGISTRATION.md
docs/plans/A9_31_DEVELOPER_VERIFIED_RULING.md
docs/plans/A9_31_GOVERNANCE_DOCS_COMMIT_APPROVAL.md
docs/plans/A9_31_MANIFEST_PROOF_R5_EXECUTION_APPROVAL.md
docs/plans/A9_31_POLICY_P1_REPAIR_APPROVAL.md
docs/plans/A9_31_POLICY_P1_REPAIR_R2_AMENDMENT.md
docs/plans/A9_31_POLICY_P1_REPAIR_R3_AMENDMENT.md
docs/plans/A9_31_POLICY_P1_REPAIR_R4_AMENDMENT.md
docs/plans/A9_31_POLICY_P1_SOURCE_COMMIT_APPROVAL.md
docs/plans/A9_31_POLICY_R3_SOURCE_PACKAGE_WIN10_APPROVAL.md
docs/plans/A9_31_PRODUCT_R1_CONTROLLER_R2_RETRY_APPROVAL.md
docs/plans/A9_31_PRODUCT_R1_R10_PRECISE_UTC_CAPTURE_APPROVAL.md
docs/plans/A9_31_PRODUCT_R1_R3_REUSABLE_DESKTOP_APPROVAL.md
docs/plans/A9_31_PRODUCT_R1_R4_CAPTURE_RETRY_APPROVAL.md
docs/plans/A9_31_PRODUCT_R1_R5_CAPTURE_PRECOMPILE_APPROVAL.md
docs/plans/A9_31_PRODUCT_R1_R6_ENTRY_GUARD_APPROVAL.md
docs/plans/A9_31_PRODUCT_R1_R7_QUERY_HANDLE_CAPTURE_APPROVAL.md
docs/plans/A9_31_PRODUCT_R1_R8_SNAPSHOT_INTERVAL_APPROVAL.md
docs/plans/A9_31_PRODUCT_R1_R9_SYNC_PROBE_RECEIPT_APPROVAL.md
docs/plans/A9_31_PRODUCT_R1_WIN10_VALIDATION_APPROVAL.md
docs/plans/A9_31_PRODUCT_R2_LOCAL_PACKAGE_APPROVAL.md
docs/plans/A9_31_PRODUCT_R2_WIN10_VALIDATION_APPROVAL.md
docs/plans/A9_31_PRODUCT_R3_FRESH_EXIT_VALIDATION_APPROVAL.md
docs/plans/A9_31_PRODUCT_R3_ISOLATED_READY_FAILURE_RETRY_APPROVAL.md
docs/plans/A9_31_PRODUCT_R3_LATE_JOURNAL_R4_APPROVAL.md
docs/plans/A9_31_PRODUCT_R4_CAPTURE_REBUILD_AMENDMENT.md
docs/plans/A9_31_PRODUCT_R4_PACKAGE_WIN10_APPROVAL.md
docs/plans/A9_31_R5_SCHEDULED_DESKTOP_START.md
docs/plans/A9_31_R6_RECOVERY_RESTART_AND_REMAINING_PHASES_APPROVAL.md
docs/plans/A9_31_R7_CONTROLLER_PARENT_KIND_REPAIR_APPROVAL.md
docs/plans/A9_31_R8_DRIVER_REVISION_AMENDMENT_APPROVAL.md
docs/plans/A9_31_R8_EXIT_PHASES_AND_CLICK_PROTOCOL_APPROVAL.md
docs/plans/A9_31_R8_RECOVERY_EXPECTATION_RULING.md
docs/plans/A9_31_R9_ADMISSION_REVISIONS_AMENDMENT.md
docs/plans/A9_31_R9_RECOVERY_RETAINED_UNKNOWN_APPROVAL.md
docs/plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md
docs/plans/A9_31_WIN10_BATCH_CROSS_ROOT_RULING.md
docs/plans/A9_31_WINDOWS_WORKSPACE_REPAIR_SOURCE_COMMIT_APPROVAL.md
docs/reports/2026-10/a9_31_continuation_handoff_2026-10-04.md
docs/reports/2026-10/a9_31_developer_verified_codex_review_request_2026-10-05.md
docs/reports/2026-10/a9_31_developer_verified_r2_evidence_review_request_2026-10-06.md
docs/reports/2026-10/a9_31_manifest_diagnostic_handoff_2026-10-04.md
docs/reports/2026-10/a9_31_policy_p1_repair_2026-10-05.md
docs/reports/2026-10/a9_31_policy_win10_readiness_recheck_2026-10-04.md
docs/reports/2026-10/a9_31_product_r1_controller_first_failure_and_r2_repair_2026-10-03.md
docs/reports/2026-10/a9_31_product_r1_package_and_win10_preflight_2026-10-03.md
docs/reports/2026-10/a9_31_product_r1_r2_boot_asar_failure_2026-10-03.md
docs/reports/2026-10/a9_31_product_r1_r3_boot_focus_and_capture_failure_2026-10-03.md
docs/reports/2026-10/a9_31_product_r1_r3_reusable_dispatcher_2026-10-03.md
docs/reports/2026-10/a9_31_product_r1_r4_boot_compiler_capture_failure_2026-10-03.md
docs/reports/2026-10/a9_31_product_r1_r4_capture_fix_and_deployment_2026-10-03.md
docs/reports/2026-10/a9_31_product_r2_local_package_2026-10-04.md
docs/reports/2026-10/a9_31_product_r2_win10_execution_and_policy_failure_2026-10-04.md
docs/reports/2026-10/a9_31_product_r2_win10_preparation_and_desktop_block_2026-10-04.md
docs/reports/2026-10/a9_31_product_r3_package_and_win10_execution_2026-10-04.md
docs/reports/2026-10/a9_31_r10_partial_pass_and_windows_ownership_failure_2026-10-04.md
docs/reports/2026-10/a9_31_r10_precise_utc_capture_freeze_and_desktop_handoff_2026-10-04.md
docs/reports/2026-10/a9_31_r5_manifest_proof_handoff_2026-10-05.md
docs/reports/2026-10/a9_31_r5_manual_restart_guard_failure_2026-10-03.md
docs/reports/2026-10/a9_31_r5_scheduled_desktop_entry_failure_2026-10-03.md
docs/reports/2026-10/a9_31_r6_cua_errors_and_boot_capture_failure_2026-10-03.md
docs/reports/2026-10/a9_31_r6_entry_guard_local_checks_capacity_block_2026-10-03.md
docs/reports/2026-10/a9_31_r6_frozen_deployment_and_desktop_handoff_2026-10-03.md
docs/reports/2026-10/a9_31_r7_query_capture_and_snapshot_gate_failure_2026-10-03.md
docs/reports/2026-10/a9_31_r8_execution_handoff_2026-10-05.md
docs/reports/2026-10/a9_31_r8_interval_capture_and_short_lived_cmd_failure_2026-10-03.md
docs/reports/2026-10/a9_31_r8_pre_run_review_request_2026-10-05.md
docs/reports/2026-10/a9_31_r9_desktop_partial_pass_and_clock_boundary_halt_2026-10-04.md
docs/reports/2026-10/a9_31_r9_sync_receipt_freeze_and_desktop_handoff_2026-10-04.md
docs/reports/2026-10/a9_31_shell_delete_policy_local_repair_and_adjacent_audit_2026-10-04.md
docs/reports/2026-10/a9_31_shell_high_impact_policy_repair_2026-10-04.md
docs/tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md
docs/tasks/A9_34_RECOVERED_CLEANUP_DISPOSITION.md
docs/tasks/README.md
```

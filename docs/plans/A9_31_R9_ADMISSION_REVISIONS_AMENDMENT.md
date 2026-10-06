# A9-31：R9合同修订——四个label同R8机械派生、仅normal-short用于请求；评审脚本来源勘误

日期：2026-10-05。Status: DRAFT_NOT_APPROVED。请求批准对[R9合同r2](A9_31_R9_RECOVERY_RETAINED_UNKNOWN_APPROVAL.md)
（已批准，SHA256 `f6ed73d5dd269c9a03f6790bfca581ab994f43a58e42ba9cef35e04fa358abbe`）的两处**有限修订**；
r2其余条款与D1–D4裁决原样有效。本修订批准前不登记C14、不创建R9文件、不建根。

## 1. 依据（实施前只读研读R8冻结工具链发现）

- r2 §2第1点写“新不可变revision（仅`normal-short`）”，§3写“准入沿用R8新根准入全套”。R8准入中
  `validation-sync-actual`、`validation-sync-current`、`actual-package-held`绑定`normal-full`的revision或driver，
  `validation-schema`同时核对`normal-short`与`normal-full`；R8冻结脚本断言Node16共20行、4个driver各5行
  （`--check`、`--self-test`、`--sync-receipt-self-test`、`--late-journal-self-test`、`--restart-evidence-self-test`，
  见`product-r3-retry-r8/directed-actual-node-current-r1.json`）。两条要求不能同时满足。负责人裁决选A。
- r2 §1 K2称Recovery“须另出”专用评审；实际R8目录已有`review-phase-recovery-aware.py`，按`restart_identity`比对并
  检查崩溃证据，其必需项集合含`BACKGROUND_FACTS_ONLY`。K2关于`review-phase.py`必然失败的结论不变。

## 2. 修订（仅此）

1. **替换r2 §2第1点首句**：新driver基础为driver-r1目录中的复核修复版
   （`driver-r1/control-scripts/product-r3-driver.cjs`，SHA256 `cbeea5571173aa216a9b3ca110f3f67efa7925a3e982343970e64dfef35b1aaa`），
   只做r2 §2第1点a–h所列重启分支与失败收尾修改；再用与R8相同的机械变换派生`controlled-boot`、`normal-short`、
   `normal-full`、`ready-negative`四个revision（`BACKGROUND_SHORT_ONLY`、`READY_FAILURE_ONLY`与controlled-boot夹具失败注入，
   规则与`prepare-r8-local.py`逐字相同）。**仅`normal-short`用于请求**；其余三个只用于准入，不发任何请求。
2. **替换r2 §3 Node16一句**：四个driver各运行既有五项自检及新增`--recovery-retained-self-test`，共24行，全部退出码0；
   R9冻结脚本相应断言为4个driver×6行。其余准入项（schema、api、interval、entry、files-scope、sync-actual/current、manifest绑定、
   真实缺口回放、package-held、观察器准入、四个revision完整闭包stage）沿用R8，仅换根与哈希绑定。
3. **更正r2 §1 K2与§2第3点**：`review-phase-r9.py`由`review-phase-recovery-aware.py`派生：必需项集合以
   `BACKGROUND_RECOVERED_UNKNOWN_RETAINED`、`BACKGROUND_RECOVERED_PID_EXITED_BY_OS`、`RECOVERED_UNKNOWN_STOP_REJECTED`、
   `RECOVERED_UNKNOWN_BLOCKS_SWITCH_AND_CLOSE`替换`BACKGROUND_FACTS_ONLY`，并新增r2 §2第3点所列字段检查；其余断言不变。

## 3. 不变与边界

不改控制器逻辑、观察器源、产品/native/锁/capture；不放宽任何断言或生命周期门；D1（`app.exit(0)`+显式字段）、
D2（失败直接`app.exit(1)`）、D3（不重试）、D4（不预授权第十根）不变。批准后先在任务书登记准确C14路径并追加ADR，再实施。
未在Win7实机验证。

## 4. 待负责人确认

按本修订SHA256明确批准，并认可r2其余条款继续有效。

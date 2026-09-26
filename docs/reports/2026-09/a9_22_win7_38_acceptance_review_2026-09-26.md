# A9-22 / WIN7-38 实机验收审查报告（审核方）

> 原始证据位于本机 `.acceptance/runs/A9-22-W38/31504dc1-8371-4381-a2ea-67ab2b9ce411/`（不入库）；本文为同目录
> `REVIEW_REPORT.md` 的入库副本。负责人裁决见 ADR-0142：WIN7-38 记为 `A9_22_WIN7_38_VALIDATION_KIT_DEFECT_NOT_PASS`，
> 按 §8 方案 (a) 新建 A9-23 换发 WIN7-39。

```text
Run ID: 31504dc1-8371-4381-a2ea-67ab2b9ce411
Candidate: WIN7-38（源码 874f541f61442f0fce803e8a30bbbaed07743525）
Target: 192.168.1.3（Win7 SP1 x64 6.1.7601）
Reviewer: Claude（依据交接书 §8～§9、任务书 A9-22 §5 第 6 步）
Review date: 2026-09-26
Basis: 原始证据（evidence/、scripts/、authority/）与候选 ZIP 内文件；执行方摘要仅作索引
Recommendation: 不签发 A9_22_WIN7_38_A9_20_A9_21_PASS；WIN7-38 记为验证套件缺陷导致的不可用候选
```

## 1. 结论摘要

1. **G2 失败根因是候选内验证套件缺陷，不是产品缺陷，也不是执行方操作问题。**
   `validation\a9-win7-38-smoke.cjs` 构造子驱动环境时遗漏 `A9_SMOKE_PRODUCT_MAIN`，驱动回落到开发仓库布局路径，
   6 次 Electron 子进程全部未加载产品入口。产品代码在本轮**零执行**。
2. 即使补上该变量，W38 驱动旅程与 smoke 中的 A9-20/M1～M4 断言**大多为空心断言**，无法支撑任务书 §4 判定要点（§4）。
   因此不能用"只修一个环境变量后重跑同一候选"的方式取得结论；候选 ZIP 哈希已绑定该套件，修复必须换发新候选。
3. 可由原始证据支持的只有：W38-01 候选完整性、实机令牌与会话合规、秘密扫描零命中。
   后飞行"零残留"不满足（5 个 `electron.exe` 需人工强制终止）。
4. 执行方遵守了硬停止与"不改候选"红线；存在若干未登记的小偏差与报告事实误差（§6），不改变结论。

## 2. 独立复核：哈希与授权

| 核对项 | 方法 | 结果 |
|---|---|---|
| `SHA256SUMS.txt` | 本机 `shasum -a 256 -c` | 116/116 OK；清单与 `evidence/` 文件集完全一致。注：清单**未覆盖** `scripts/`、`authority/`、`RUN_LOG.md`、`EXECUTOR_REPORT.json` |
| 候选 ZIP | 本机复算 `.acceptance/candidates/WIN7-38/` | `105531bf…0b22`，与交接书 §3、任务书 §7、authority、`IDENTITY.sha256` 一致；`IDENTITY.sha256` 5 项全部 OK |
| manifest | 同上 | `2a3d802a…72d4` 一致 |
| authority | 本机复算 `authority/release-authority.json` | `55bf8074…584f`，与独立 pin 文件内容一致 |
| input lock / approval registry | 本机复算 | `60b65e5c…2fa6`、`d9cfea73…17b7`，与任务书 §7 一致 |
| authority 绑定内容 | 阅读 JSON | 绑定源码提交、ZIP、manifest、input lock、registry、目标 `192.168.1.3`、run-id；`approved_at 2026-09-26T05:15:00Z` |
| Win7 端 ZIP/authority 哈希 | `RUN_LOG.md` 所录 `certutil` 输出 | 与签发值一致。**仅 RUN_LOG 文本，无原始输出文件** |
| 候选内 smoke / driver 与源码一致性 | 从 ZIP 解出比对 | `a9-win7-38-smoke.cjs` 与仓库 `release/win7-product-v3/` 同哈希 `d5a75633…`；Win7 上 `driver-app/main.cjs` 与 ZIP 内 `a9-win7-38-driver.cjs` 同哈希 `0a08e866…`（证明执行方未改动套件） |
| 仓库状态 | `git diff 874f541 HEAD -- release src scripts` | 无代码差异；工作树干净 |

## 3. G2 失败根因（已实证）

1. 驱动 `main.cjs:28-29`：
   `repositoryRoot = path.resolve(__dirname, '../../../..')`；
   `productMain = process.env.A9_SMOKE_PRODUCT_MAIN || path.join(repositoryRoot, 'src/shell/product/main.js')`。
2. smoke 把驱动复制到 `<evidence-root>\driver-app\main.cjs`，即 `C:\A9-W38\31504dc1\evidence\smoke\driver-app\`；
   上溯 4 级为 `C:\A9-W38`，得到 `C:\A9-W38\src\shell\product\main.js`，与报错路径逐字一致。
3. `a9-win7-38-smoke.cjs` 的 `baseEnv`（约 329-340 行）**没有** `A9_SMOKE_PRODUCT_MAIN`。
   WIN7-37 前身 `a9-win7-37-smoke.cjs:353,398` 设置了
   `productMain = path.join(candidateRoot, 'resources','app','product','main.js')` 并传入；
   W23～W37 各版 smoke 均传该变量，W38 派生时丢失。候选 ZIP 内确有 `resources/app/product/main.js`（70,503 B）。
4. 连锁后果（均与 `automatic-smoke.json` 相符）：
   - `first/second/stop/w38` 四个阶段报告均为 `ERROR MODULE_NOT_FOUND`，退出码 1。
   - `controlled_error_negative` 本应在 `main()` 抛 `A9_FORCED_STAGE_ERROR_FOR_TEST`，但产品入口加载先于 `main()` 失败，
     故 `A9-W38-CONTROLLED-ERROR-NONZERO=false`。
   - `late_load_negative` 在 ready 后按设计抛 `LATE_LOAD`，先于 require，所以"通过"；它没有证明产品可加载。
   - `APPROVE-TARGET-EXECUTED-AFTER-APPROVAL=false`：产品未运行，目标文件自然未被删除。
   - `DENY-TARGET-SURVIVES-DENIAL=true` 同理**无意义**：没有任何拒绝动作发生过。
5. 开发机门未发现：`scripts/release/test/a9-package.test.mjs` 不检查 smoke 是否传递产品入口，也没有在打包布局下实际启动驱动。

## 4. 套件的其他缺陷（修复后仍会阻碍有效结论）

| # | 位置 | 缺陷 | 影响 |
|---|---|---|---|
| K1 | smoke `waitForNoRelatedProcesses` | 用 `wmic` 按 `candidateRoot`/`runRoot` 子串匹配，**未排除自身 PID**（W37 版有 `pid === process.pid` 排除与结构化记录）。父进程 `electron.exe`（路径含 candidateRoot、命令行含 runRoot）永远命中 | `NEGATIVE-PROBES-NO-RESIDUE` 在 Win7 上恒为 false；残留检测既无效又不记录命中的进程 |
| K2 | smoke M1 段 | `A9-W38-M1-STARTUP-TARGETED-RECOVERY` 在"插入种子数据成功"时即记 `passed:true`，不启动产品、不测耗时、不看恢复结果；而且种子表名为 `turns/checkpoints/meta/events`，产品实际 schema 为 `a9_turns/a9_checkpoints/…`（`src/state/src/a9-persistence.ts` §assertA9CurrentSchema），产品根本不会读取这些种子 | 恒真断言；执行方报告把它当作观察事实引用，审核方**不予采信** |
| K3 | 驱动 `runW38Process` W38-07～09 | 只要审批卡出现且 `tool` 含 `shell` 即通过；不校验 Git 外部写分类、目标绑定字段，拒绝后不检查零副作用 | 不足以证明 A9-20 修复 |
| K4 | 驱动 M1b | 只测一次 `snapshot()` 耗时；不冻结含 1 MiB hex 文件的基线/检查点，不注入 `https://u:p@host`，不检查脱敏 | 不覆盖 W38-11 |
| K5 | 驱动 M2 | `outcome` 含 `completed` 即通过（普通完成也满足）；不检查 `COMPLETED_WITH_WARNINGS`、工具未执行、下一轮正常 | 不覆盖 W38-12 |
| K6 | 驱动 M3/M4 | 只要 `queryEvents` 返回 `ok` 即通过；无 60 条 checkpoint、无"最近 10 / 共 N"、无更早记录 Diff、无 2000 条事件、无省略提示、无内存采样 | 不覆盖 W38-13/14 |
| K7 | 交接书 §6 | 要求的 `w38-03-startup.png`、`w38-05-diff.json`、`chinese-space-path-test.txt` 等证据文件，候选内没有任何工具会生成；G3 缺少可执行步骤 | 执行方即使不被硬停止也无法按合同产出 G3 证据 |

以上为对候选内套件的静态审查结论；K2 中"产品是否会因多余表拒绝启动"未验证（待验证）。

## 5. 安全与合规复核

- **身份与令牌**：G1/G2 的 `whoami` 为 `dccs-chaizl-pc\agent`，SID `…-1001`；`whoami /groups`（GBK 解码）含
  `S-1-16-8192` Medium、`S-1-5-4 INTERACTIVE`，**无** `S-1-16-12288`、无 `S-1-5-32-544`。
  计划任务 XML：`UserId` 为 agent SID、`InteractiveToken`、`LeastPrivilege`。符合交接书 §4。
  `SESSIONNAME=` 为空（计划任务环境不设该变量），不能证明会话；会话由 G0 `query user`（agent console Active）
  与清理前进程表中 `electron.exe` 位于 Console / Session 2 旁证。
- **主机键**：RUN_LOG 记录严格校验通过；无原始 ssh 输出文件，属 RUN_LOG 级证据。
- **后飞行**：`pre-cleanup-tasklist.txt` 原样显示 5 个 `electron.exe`（PID 4604/7476/2996/7400/2464，agent，Session 2，各 128 K，CPU 0:00:00）；
  `postflight-tasklist.txt` 中 `electron.exe` 为 0。残留**需人工 `taskkill /F` 才清除**，不满足"产品全部关闭后零残留"。
  进程表只有 `tasklist /v` 格式、无命令行和父 PID，无法归属到具体阶段（可能是驱动失败退出后遗留的 Chromium 子进程，待验证）。
  agent 会话中的 `cmd.exe 6040 / conhost.exe 6608` 清理前后都存在，G0 未记录基线，无法判定是否为测试 Shell 残留。
- **计划任务删除、Win7 端后飞行哈希复算**：只有 RUN_LOG 文本，无原始输出。
- **秘密扫描**：执行方扫描 32 个文件、零命中，排除了 `driver-electron`。审核方用私钥头、`sk-`、`ghp_`、`github_pat_`、AKIA、Slack token、
  `scheme://user:pass@`、Bearer 等模式独立扫描运行目录内全部 55 个文本文件（含 `driver-electron`、scripts、authority、RUN_LOG、报告），
  唯一命中是候选说明文档 `A9_22_WIN7_38_VALIDATION.md:33` 中的用例示例 `https://u:p@host`，不是秘密。**零真实命中**。

## 6. 执行方过程核对

遵守情况：G2 失败 + 残留后按 §7 硬停止；未修改候选、未重打包、未重签、未重试 smoke；G3 如实记为 `NOT_PERFORMED`；报告未对用例使用 PASS/FAIL 裁决。

未在 `deviations[]` 登记的偏差（均不影响结论，但应记录）：

1. 额外创建 `original\` 目录存放 ZIP（交接书为 `{package,evidence,scripts,authority}`），并对运行根执行 `icacls … /grant agent:(OI)(CI)M`。
2. 向 `authority\` 额外上传 input lock 与 approval registry（完整性命令需要，合理）。
3. 本地保存的任务 XML 是 ASCII，交接书要求 UTF-16；实际注册时的编码无证据。
4. G0 `query user` 退出码 1，已在 RUN_LOG 说明原因。

报告中的事实误差：

- W38-13 称"65 checkpoints"；种子库实为 **64** 条（`sqlite3` 核对：i≤65 且排除 i=50）。
- W38-01 称"790 files / 791 entries verified with zero mismatch"；`a9-package-integrity.json` 只有两项用例级 `PASS`，无逐文件明细，该表述是推断。
- W38-06 称"Stop phase executed"；stop 阶段在加载产品入口时即失败，没有执行停止旅程。
- W38-10 引用 `passed: true` 作为观察事实；见 K2，该断言恒真。

## 7. 15 项用例审查状态

状态口径：**证据支持** = 原始证据满足判定要点；**不满足** = 原始证据显示判定要点未达成；**未执行** = 产品未运行或步骤未做；
**证据不足** = 有证据但不能支撑判定。凡未执行项均**不构成产品缺陷证据**。

| 用例 | 审查状态 | 依据 |
|---|---|---|
| W38-01 候选完整性 | 证据支持 | G1 以 agent/Medium 运行，退出码 0；`a9-package-integrity.json` `status=PASS`，ZIP/manifest/authority/input lock/registry 哈希与签发一致，Electron 22.3.27 / ABI 110 / 6.1.7601。stderr 已合并入控制台原文，无错误输出 |
| W38-02 中文+空格路径 | 未执行 | 运行根为纯 ASCII `C:\A9-W38\31504dc1` |
| W38-03 首次启动与工作区选择 | 未执行 | 产品入口未加载（§3），无窗口、无截图 |
| W38-04 read/edit/Shell | 未执行 | first 阶段 `MODULE_NOT_FOUND` |
| W38-05 Diff 与 checkpoint | 未执行 | 同上 |
| W38-06 审批拒绝/停止/重启 | 未执行 | first/second/stop 阶段均在加载时失败；deny 目标未变化只是因为从未有拒绝动作 |
| W38-07 `cmd /c"git push …"` | 未执行 | w38 阶段加载失败；且断言设计不足（K3） |
| W38-08 PowerShell 参数前缀 | 未执行 | 同上 |
| W38-09 PowerShell 位置参数 | 未执行 | 同上 |
| W38-10 M1 启动定向恢复 | 证据不足（断言无效） | 产品未启动；smoke 侧 `passed:true` 为恒真断言，种子 schema 与产品不符（K2） |
| W38-11 M1b 冻结与脱敏 | 未执行 | 只生成了 `huge-hex.txt`；断言不覆盖要点（K4） |
| W38-12 M2 输出上限 | 未执行 | 断言不覆盖要点（K5） |
| W38-13 M3 checkpoint 分页 | 未执行 | 断言不覆盖要点（K6） |
| W38-14 M4 集合上限 | 未执行 | 断言不覆盖要点（K6） |
| W38-15 秘密扫描与后飞行 | 部分：秘密扫描证据支持；零残留**不满足** | 扫描零真实命中（执行方与审核方独立扫描）；5 个 `electron.exe` 残留需强制终止（§5） |

## 8. 对负责人的裁决建议

1. **不签发** `A9_22_WIN7_38_A9_20_A9_21_PASS`，也不建议部分签发：W38-01 单独签发没有产品意义。
   建议把 WIN7-38 记为不可变结论，例如 `A9_22_WIN7_38_VALIDATION_KIT_DEFECT_NOT_PASS`，
   原因写明"候选内验证套件缺陷，产品未运行"。按 AGENTS.md §2，此候选及其证据保留，不得复用改判。
2. A9-20 仍为 `A9_20_DEVELOPER_VERIFIED`，A9-21 §5 第 6 项仍未取得 Win7 覆盖；WIN7-22/WIN7-37 既有结论与已知缺陷登记不变。
3. **需要负责人决定**：套件修复与换发走哪条授权路径。ADR-0141 与 A9-22 把候选身份绑定为 WIN7-38，修复后 ZIP 哈希必然变化，
   不能沿用 WIN7-38 编号与本 authority。可选：
   - (a) 新建任务书（如 A9-23）换发 WIN7-39，新增 ADR 与新的候选外 authority；
   - (b) 修订 A9-22 使其覆盖换发 WIN7-39（需新 ADR，不改写 ADR-0141 正文）。
   审核方倾向 (a)，边界更清楚。
4. 换发前套件至少须修复：
   - smoke 传递 `A9_SMOKE_PRODUCT_MAIN = <candidateRoot>\resources\app\product\main.js`；
   - 恢复 W37 的残留快照（排除自身 PID、记录命中进程的名称/PID/父 PID/路径），后飞行进程表同样采集命令行；
   - 按 K2～K6 重写断言：M1 通过产品真实 schema 或产品 API 预置数据并测启动耗时与恢复结果；A9-20 校验 Git 外部写分类与拒绝后零副作用；
     M1b/M2/M3/M4 按任务书 §4 判定要点逐项断言；
   - 开发机门增加：在打包布局下实际启动驱动的冒烟、传参检查，以及禁止"种子成功即通过"的测试；
   - 交接书 §6 G3 用例配套可执行步骤与证据产出工具，或明确列为人工 UI 步骤并规定截图/记录格式。
5. 文档漂移，建议在裁决记录中一并修正：交接书 §3 authority 行仍写"草稿待负责人签发"，`docs/STATUS.md` 仍为
   `A9_22_WIN7_38_FROZEN_AWAITING_AUTHORITY`；authority JSON 显示 `approved_at 2026-09-26T05:15:00Z`。
   负责人签发 authority 的记录目前未进入 STATUS_LOG，审核方无法从仓库文档核实签发过程，请负责人确认后补录。

## 9. 审核方验证方式与限制

- 本机复算：`SHA256SUMS.txt`、候选 ZIP、manifest、`IDENTITY.sha256`、authority、pin、input lock、registry；从 ZIP 解出 smoke/driver 比对哈希；
  `sqlite3` 读取种子库；GBK 解码 `whoami /groups`；独立秘密扫描。
- 根因依据：驱动路径解析代码 + smoke 环境构造代码 + 报错路径逐字吻合 + W37 对照。
- 限制：审核方未连接 Win7、未重跑任何用例；Win7 端哈希复算、主机键核对、计划任务删除只有 RUN_LOG 文本证据。
  本报告不构成任何 Win7 PASS。

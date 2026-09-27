# A9-20 — Git 外部写确认分类器绕过修复

```text
Status: APPROVED_FOR_IMPLEMENTATION
Task Type: SECURITY_HARDENING
Target Branch: codex/a9-alpha2
Source Baseline: c8691e3
Target Version: 0.3.0-alpha.2
Phase-Gate: A9_20_WIN7_39_PASS
Win7-Validation: WIN7_39_PASS_WITH_KNOWN_LIMITS
Decision: ADR-0137, ADR-0140
```

> 2026-09-25 起草；同日负责人按建议批准实现，ADR-0137 同时接受，§11 开放问题按建议裁决，并授权按推荐优化需求
> （优化记录见 §12）。实现仅限 §7 允许路径（AGENTS.md C14）。编号说明：`A9-18` 已被未提交工作树 `codex/a9-memory-optimization` 中的
> `A9_18_COMPREHENSIVE_MEMORY_OPTIMIZATION.md` 占用，本任务取 A9-20，与其治理问题分开处理（§10）。

## 1. 背景

Full Access 下 Shell 工具中的 `git push` 等外部写入必须经目标绑定的一次性确认（AGENTS.md §5、
ADR-0089）。该确认由 `src/core/src/policy.ts` 的 `checkAlwaysConfirmOperation` 调用
`classifyGitCommand`（`src/core/src/git-command-policy.ts`）决定；分类器返回 `null` 即视为“无 Git 操作”并放行。

A9-18 返修轮 6～8（2026-09-13/14，工作树 `codex/a9-memory-optimization`，未提交）发现分类器存在多类失明，
但修复只完成一部分且未进入任何提交。2026-09-25 对当前 `codex/a9-alpha2`（`c8691e3`）复核：
`git-command-policy.ts`、`policy.ts`、`a9-agent-loop.ts` 自 `7d06789` 起未变，缺陷全部仍在。
分类器自 `e80b8c8`（2026-08-29）起未再修改，此后的 A9 候选（含已签 Alpha 的 WIN7-22 与已签 PASS 的 WIN7-37，源码 `dd6cb1a`）均使用同一份代码。

## 2. 开发机复现（`c8691e3`，本机构建的 `src/core/dist`，直接调用 `classifyGitCommand`）

| # | 命令形态 | 当前结果 | 类别 |
|---|---|---|---|
| 1 | `cmd /c "git push origin main"` | `always_confirm` | 对照（正确） |
| 2 | `cmd /c"git push origin main"`、`cmd /C"…"` | `null` | CMD 开关与引号相连 |
| 3 | `cmd.exe /d /s /c"C:\g\git.exe push origin main"` | `null` | 同上，带路径 |
| 4 | `cmd /s/c "git push origin main"` | `null` | CMD 开关簇 |
| 5 | `cmd /R "git push origin main"` | `null` | CMD `/R`（`/C` 同义）未识别 |
| 6 | `powershell -co "…"`、`-Com "…"`、`/Command "…"` | `null` | PowerShell 参数前缀/斜杠形态 |
| 7 | `powershell -NoProfile -c"git push origin main"` | `null` | PowerShell 参数与引号相连 |
| 8 | `powershell -e <base64>`、`-ec <base64>` | `null` | EncodedCommand 前缀未识别 |
| 9 | `bash -c"…"`、`bash -lc "…"`、`sh -ec "…"` | `null` | POSIX 选项簇/相连 |
| 10 | `bash -c "git push origin main"` | `null` | POSIX 壳未解包 |
| 11 | 引号整体包裹的 CMD 载荷且总长 > 262144 字符 | `null` | 体积上限 fail-open |
| 12 | `powershell "git push origin main"`、`powershell -NoProfile "…"` | `null` | PowerShell 位置参数即命令（无 `-Command`） |

同一探针下 `cmd /r git push …`、`cmd /k git push …`、`pwsh -c "…"`、`set g=git&& %g% push …`
和嵌套 `cmd /c "cmd /c ""git push …"""` 均为 `always_confirm`；`npm test`、`echo git push …` 为 `null`（预期）。

复现只到分类器层。第 2～8 类在 Win7 TrustedShell（CMD `/d /s /c`、PowerShell 5.1）下能否真的执行 `git push`、
第 9～10 类是否可达（取决于 Git for Windows 的 `bash.exe` 是否在 PATH）均为**待验证**，见 §9。第 12 类同属 PowerShell，按第 2～8 类处理。
第 11 类在 Win7 上预计因 CreateProcess 命令行 32,767 字符上限而无法启动（`trusted-shell-runner.ts` 未另设长度上限，待验证），
对 Win7 属纵深防御；开发机壳与未来非命令行传参路径仍可能可达。

## 3. 根因

1. **精确拼写匹配**：`unwrapShellPayload` 只认独立的 `/c`、`-command|-c`、`-encodedcommand|-enc` token，
   不认开关簇、与引号相连的开关、CMD `/R`、PowerShell 参数前缀，也不处理任何 POSIX 壳。
2. **兜底不解包**：`containsExecutableGitRisk` 只对外层 segment 分词一次，不解包壳载荷；引号内容被
   `tokenizeCommand` 塌缩成单个 token 后，`isGitExecutable` 不再匹配。
3. **“超出分析能力”与“无 Git”同值**：`collectGitDecisions` 与 `containsDynamicGitPushRisk` 在
   `depth > 4 || length > 256 KiB` 时返回空/`false`，与“确认没有 Git”不可区分；EncodedCommand 解码超限同样返回 `undefined`。
4. **记账旁路**（A9-18 R8-4，代码路径推断）：`a9-agent-loop.ts` 验证记账以 `classifyGitCommand` 结果为准，
   `RUNNER_COMMANDS` 含 `cmd`/`powershell`/`bash`，分类失明的壳包裹 `git push` 在同轮已有副作用时可被记为验证证据。

## 4. 需求

G04 是安全保证：任何壳宿主载荷形态，只要无法精确解析且含 Git 可执行词，都必须要求确认。G01～G03 负责把常见形态
解析准确，使确认对话框能绑定具体 remote/branch，而不是退化为整条命令摘要。两者都要做，但评审以 G04 为准。

- **G01 CMD 载荷识别**：`/c`、`/C`、`/r`、`/R` 及其与后续文本/引号相连形态、开关簇（`/s/c`、`/d/s/c`）均解包。
- **G02 PowerShell 载荷识别**：参数名为 `command` 或 `encodedcommand` 任意前缀（含单字母 `c`、`e`）的开关，前导 `-` 或 `/`
  （`/` 形态待验证），以及开关与引号相连的形态，都当作载荷开关解包，不依赖 PowerShell 的前缀歧义规则。前缀同时匹配两者时，
  先试 UTF-16LE Base64 解码，解码失败再按原文分析。无载荷开关时，第一个非开关参数起的余部即命令（位置参数形态），同样解包。
  `-File` 脚本内容不在分析范围。
- **G03 POSIX 壳载荷识别**：`bash`/`sh`/`dash`/`zsh`（含 `.exe`）的短选项簇中含 `c` 即取其后载荷，含 `-c'…'`/`-c"…"` 相连形态。
- **G04 壳宿主兜底 fail-closed**：段首为已知壳宿主而载荷无法精确提取时，对去引号后的整段文本扫描可执行 Git token；
  命中即 `always_confirm`（保守决定）。已知散文汇聚点（`echo`/`rem`/`::`/`Write-Output` 等）豁免保持不变。
- **G05 三态分析结果**：分析函数区分“无 Git”“有 Git 决定”“超出分析能力”。超出能力时：已观察到 Git 相关 token → 保守确认；
  否则不升级（避免 A9-18 R8-3 的纯散文深嵌套误报）。`containsDynamicGitPushRisk` 与兜底在超限时语义一致。
- **G06 超长命令策略层兜底（纵深防御）**：`checkAlwaysConfirmOperation` 对超过 `MAX_ANALYZABLE_GIT_COMMAND_BYTES`（256 KiB，单一导出常量）
  的 Shell 命令一律要求确认，并给出可区分的原因文本；不依赖 loop 层守卫（A9-18 ADR-0130 的思路下沉到 `policy.ts`，覆盖所有调用方）。
- **G07 验证记账**：壳宿主命令只有在载荷被成功解包、载荷无 Git 决定且载荷本身非纯输出时才可计为验证证据；否则不计。
- **G08 审计与提示**：新增保守决定沿用现有 `binding.summary`/审批摘要格式，截断与脱敏规则不变；不新增 IPC 字段。

非目标：分类器是对常见 Git 外部写入的确认闸，不是安全边界；不宣称覆盖任意动态构造（如 PowerShell 变量调用），
Full Access 仍是可信工作区（ADR-0089 不变）。不改 Runner、TrustedShell、native helper、IPC schema 与 Renderer。

## 5. 设计要点

1. 在分词阶段为壳宿主段做“开关前缀切分”：把 `/c"…"`、`-c"…"`、`-lc` 等拆成“开关 + 载荷”，再走统一解包。
2. 解包成功走既有 `collectGitDecisions` 递归；解包失败或超限走 G04/G05 兜底，兜底本身同样递归解包（深度上限与主路径一致）。
3. 体积常量只保留一个导出，`git-command-policy.ts` 与 `policy.ts` 共用。
4. 规则按“宁可多问一次，不可静默放行”取向；每新增一处保守路径须有对应的“不误拦”对照用例。

## 6. 兼容性

- 纯 TypeScript 逻辑变更，不新增依赖、Runtime Profile、系统 API；Electron 22.3.27/Node 16 目标不变。
- Win7 PowerShell 版本与 TrustedShell 实际使用的解释器（`trusted-shell-runner.ts` 注明 PowerShell 5.1）下，
  参数前缀与 `/Command` 形态的真实解析行为为**待验证**；G02 以“宁多不少”识别，不依赖确切版本语义。
- 可见行为变化：部分此前不提示的 Shell 命令会弹出确认；审批文案格式不变。

## 7. 允许路径（C14）

- `src/core/src/git-command-policy.ts`
- `src/core/src/policy.ts`（仅 `checkAlwaysConfirmOperation` 及超长命令规则）
- `src/core/src/a9-agent-loop.ts`（仅验证记账与 `isNonVerifyingCommand` 相关逻辑）
- `src/core/src/index.ts`（仅新增常量的再导出）
- `src/core/tests/git-command-policy.test.ts`、`src/core/tests/policy.test.ts`、`src/core/tests/a9-agent-loop.test.ts`
- 本任务书、`docs/DECISIONS.md`（仅 ADR-0137）、`docs/DECISIONS_INDEX.md`、`docs/tasks/README.md`、`docs/STATUS.md`、`docs/STATUS_LOG.md`

不得修改 Runner、Shell 产品代码、Gateway、State、Workspace、发布脚本、`release/**` 或任何历史候选与证据；
不得从 A9-18 工作树整文件复制或 cherry-pick（其改动未提交且基线已分叉），只可参考其报告与用例思路重新实现。

## 8. 验证矩阵（开发机）

1. §2 第 2～12 类逐条断言为 `always_confirm`。G01～G03 能精确解析的形态（第 2～10、12 类）再断言 `binding` 指向正确的
   remote/branch；只走 G04/G05 兜底的形态断言为保守决定（整条命令摘要绑定）。§2 的对照保持不变。
2. 不误拦对照：`npm test`、`echo git push …`、纯非 Git 超长命令、4/5 层纯散文嵌套 `cmd /c` 均不升级。
3. 256 KiB 边界：阈值内按真实子命令分类，超一字走保守路径。
4. G07：构造“同轮已有写副作用 + `bash -lc "git push …"`/`cmd /c"git push …"` 成功”，断言 `verification !== 'verified'`。
5. 负向对照：每条新增用例在 `c8691e3` 实现上失败（记录失败清单），修复后通过；关键分支做移除变异检验。
6. core `lint`/`build`/全量 jest；`npm run verify:quick`；`npm run docs:check`；`git diff --check`。

## 9. Win7 与候选

本任务只到开发机验证（`Phase-Gate` 至多 `A9_20_DEVELOPER_VERIFIED`），不授权构建、打包或远程执行。
Win7 结论需另行批准新候选换发（建议 WIN7-38：继承 WIN7-37 用例集，新增在 Win7 普通用户 TrustedShell 下
对 §2 第 2～10、12 类逐条确认“出现目标绑定确认、拒绝后未执行”，并在只读或本地裸仓库远端上记录各形态在真实 CMD/PowerShell 5.1
下是否确实会执行 Git，以关闭 §2 的可达性待验证项）。未执行前不得声称已在 Win7 修复。

## 10. 与 A9-18 的关系

A9-18 工作树中的 F-1/F-2（部分形态修复与 32 项分类器用例）、ADR-0130 的 loop 层超长守卫与 R8-1～R8-4 自查结论是本任务的输入资料，
不是实现来源。A9-18 自身的去留、登记与 ADR 编号冲突（其 ADR-0124～0130 与主线已接受的同号 ADR 重叠）另行裁决，不在本任务范围。

## 11. 开放问题与裁决（2026-09-25，均按建议）

1. **G05 深度耗尽策略**：建议“仅在已见 Git 相关 token 时保守确认”；备选为一律确认（更严格、有散文误报）。
2. **G07 记账严格度**：建议按 §4 G07 解包后判断；备选为壳宿主命令一律不计验证证据（最简单，`cmd /c npm test` 将不再计为验证）。
3. **WIN7-37 已签结论的披露**：建议不改判 `A9_19_WIN7_LIVE_PROGRESS_AND_LAYOUT_PASS`（该验收不覆盖确认分类器），
   但在 `STATUS.md` 对 WIN7-22、WIN7-37 等同源候选登记“已知缺陷：Git 确认分类器可被引号/开关形态绕过，见 A9-20”。
4. **是否紧急换发**：建议开发机验证通过后立即按 §9 换发 WIN7-38，不与 A9-17 采样或 Alpha 2 其余范围捆绑。
   裁决含义：同意换发方向；换发合同（发布管线允许路径、用例、authority）仍按 ADR-0136 先例另行起草并批准后才可修改管线。

## 12. 需求优化记录（2026-09-25，负责人授权按推荐修订）

1. **补漏**：复核时新发现 PowerShell 位置参数形态（§2 第 12 类）同样被判为无 Git，已并入 G02。
2. **G02 改为前缀规则**：原文“全部无歧义前缀”要求复刻 PowerShell 各版本的参数歧义规则，Win7 版本行为又待验证。
   改为“`command`/`encodedcommand` 的任意前缀都当作载荷开关”，宁多不少，与版本无关。
3. **明确主次**：G04 兜底是安全保证，G01～G03 负责确认对话框的绑定精度；§8.1 验收同步拆分，不再要求兜底形态给出具体 remote/branch。
4. **G06 降为纵深防御**：Win7 命令行上限使超长命令预计不可启动；保留该规则（成本低、覆盖开发机壳），
   并删去“规则 ID”要求，因为 `checkAlwaysConfirmOperation` 现有返回结构只有原因文本，不应为此扩接口。
5. **实施中补漏（2026-09-25）**：
   - `git status && powershell -c "$g='git'; & $g push …"` 被判为 `autonomous`：动态 push 检测只在“整条命令没有任何 Git 决定”时运行。
     改为对每个没有静态决定的分段单独检测，已静态分类的 Git 命令（如 `git add %FILE%`）不受影响。
   - 变异检验发现 6 层及以上嵌套 `powershell -e` 包裹的 `git push` 返回 `null`：到达深度上限时剩余文本仍是 Base64，
     没有 `git` 字样。G05 因此收紧：到达上限时，剩余文本含 Git 词**或仍含未解开的 Shell 宿主**都保守确认。
     代价是超过深度上限的纯文本嵌套（如 6 层 `cmd /c … echo hello`）也会要求确认，实际使用中几乎不会出现。
6. **G07 补充**：分类器修好后，`bash -lc "git push …"` 的载荷就是 `git push`，而 `git` 在运行器名单里，仍会被记为验证证据；
   直接执行的 `git push` 也一样。补充规则：含 Git 外部写（`always_confirm`）的命令不计为验证证据。
7. 以上两处收紧见 ADR-0140（不改 ADR-0137 正文）。

## 13. 实施结果（2026-09-25，开发机，Node 20.17.0）

- 改动：`git-command-policy.ts`（三态载荷解析 `payload`/`opaque`/`none`，CMD/PowerShell/POSIX 各自解包，
  Shell 宿主分段的开关与引号相连拆分，逐分段动态检测，统一上限 `MAX_ANALYZABLE_GIT_COMMAND_BYTES`，
  导出 `expandShellHostPayloads`）、`policy.ts`（G06）、`a9-agent-loop.ts`（G07）、`index.ts`（常量再导出），
  测试增加在 `git-command-policy.test.ts`、`policy.test.ts`、`a9-agent-loop.test.ts`。均在 §7 允许路径内。
- 验证：core `tsc --noEmit`、build 通过，全量 jest 28 套 / 362 项通过；shell 全量 39 套 / 376 项通过（使用新 core 构建）；
  `npm run verify:quick` 通过；`docs:check`、`git diff --check` 通过。
- 负向对照：三个测试文件在 `c8691e3` 实现上 37 项失败、66 项通过（旧实现缺少的两个新导出以等价旧行为的桩补上），
  失败项正是 §2 各类形态、G06、G07 与 §12.5 补漏用例；“不误拦”用例在新旧实现上都通过。
- 变异检验（7 项，全部被测试捕获）：去掉开关与引号拆分 2 项失败；去掉不可提取载荷兜底 1 项；去掉上限处的保守判定 1 项；
  去掉 G07 外部写排除 3 项；去掉逐分段动态检测 2 项；CMD 只认独立 `/c` 4 项；上限处只看 Git 词 2 项。
  变异检验中发现的冗余状态（`gaveUpOnGit`）已删除。
- 未执行：Win7 实机（`Win7-Validation: NOT_PERFORMED`）；§2 各形态在真实 CMD/PowerShell 5.1 下的可达性仍待验证；
  未做真实 Electron 回归（改动只在 Core 策略层，已由 shell 全量测试覆盖到产品调用链）。

## 14. Win7 换发记录

- 2026-09-26：WIN7-38（A9-22）实机 G2 因候选内验证套件缺陷失败，产品未运行，未取得本任务的 Win7 结论（ADR-0142）。
  Win7 验证改由 [A9-23](A9_23_WIN7_39_REISSUE_AND_ACCEPTANCE.md) 换发的 WIN7-39 承担；`Phase-Gate` 保持 `A9_20_DEVELOPER_VERIFIED`。
- 2026-09-27：WIN7-39（A9-23，源码 `7ec9db7`）Win7 实机签发 `A9_23_WIN7_39_A9_20_A9_21_PASS`。W39-07～09 在 Win7 SP1 x64、`agent` Medium 下覆盖
  §2 第 1～12 类的 19 种形态：全部出现审批卡，Git 绑定为 `origin`/`main`（第 11 类超长 CMD 为整条命令摘要绑定），拒绝后零执行，
  本地裸仓库 `refs/heads/main` 不变（MinGit 2.46.2）。限制：第 9、10 类 POSIX 形态的可执行性与 PowerShell 5.1 下 `/Command` 的真实执行未测试（均在确认处被拒）。
  `Phase-Gate` 改为 `A9_20_WIN7_39_PASS`。WIN7-22、WIN7-37 等既有候选的已签结论不改判，仍登记已知缺陷。

# A9-31：P1修复修订r2——Codex聚焦复核后的三项补修

日期：2026-10-05。Status: DRAFT_NOT_APPROVED。请求批准对[P1修复材料](A9_31_POLICY_P1_REPAIR_APPROVAL.md)（e0dc01e2…，ADR-0181）的修订；
仍只到本地修复、验证与Codex复核为止，不含提交、新包、Win10/Win7。未在Win7实机验证。

## 1. 依据（Codex复核，我方以HEAD与修复版分别编译后纯策略求值复现，结果一致）

| # | 输入 | HEAD | 修复版 | 性质 |
|---|---|---|---|---|
| N1 | `$tool='echo'; if ($true) {$tool=$env:ComSpec}; & $tool /c 'npm publish'`（`sc.exe delete`载荷同） | ask | **allow** | **本次修复引入的回归**：条件块内的非字面赋值被丢弃，变量只剩`echo`，数据命令判断提前结束 |
| N2 | `cmd /v:on /c "set PKG=echo& if 1==1 set PKG=npm& !PKG! publish"` | allow | allow | 无括号`if … set`的赋值在副本中求值后被丢弃 |
| N3 | `$tool='echo'; Write-Output "$($tool='npm')"; & $tool publish` | allow | allow | 双引号`$()`内的赋值作用于当前作用域，却在副本中被丢弃 |
| N4 | `function f {$tool='npm'}; $tool='echo'; . f; & $tool publish`；`$b={$tool='npm'}; $tool='echo'; . $b; & $tool publish` | allow | allow | 点调用把块内赋值带回当前作用域，未计入 |

另两处报告表述需更正：①报告§1“非字面赋值处理不变”不成立（N1）；②报告§2对`bash -c`偏差中“按PowerShell实际解析npm只是bash位置参数”的解释未经原生参数解析验证，改为“tokenizer提取的载荷为`echo "npm publish"`，属打印数据”。

## 2. 补修设计（原则：任何可能进入当前作用域的赋值效果只追加为候选，未知值保留修复前的保守路径）

- **G1（N1）**：条件段内的非字面赋值追加一个“未知”候选；“未知”在解析命令名时还原为原变量记号本身，从而走修复前对未解析变量的保守检查。
- **G2（N2）**：对`if`/`do`/`else`载荷求值后，再把载荷各段中的赋值（字面或未知）作为条件候选并入当前变量表。
- **G3（N3）**：对双引号`$()`子表达式求值后，把其中的赋值作为条件候选并入当前变量表（不作为确定值，从不移除已有候选）。
- **G4（N4）**：记录本命令中出现过的所有块内赋值；遇到点调用段（以`. `开头）时，把这些赋值重新作为条件候选并入当前变量表。不经点调用的普通调用（子作用域）不并入。
- 不求解任意表达式，不改审批摘要/digest、Read Only、其他工具或非Policy路径。

## 3. 先红后绿与验证

1. 在`src/core/tests/policy.test.ts`追加N1（两种载荷）、N2、N3、N4两式应为ASK；对照保持ALLOW：`function f {$tool='npm'}; $tool='echo'; & $tool publish`（未点调用）、
   `$tool='npm'; $tool='echo'; & $tool publish`；`src/core/tests/a9-background-tools.test.ts`追加N1、N2在`shell`/`start_process`入口为needs_approval。
2. 在当前修复版上运行，新增用例应失败（红）；实施G1–G4后全部通过（绿），既有用例结论变化逐条列出。
3. 先构建再按修订后的§5全量运行，保护方式同前；证据目录`.acceptance/a9-31-developer/policy-p1-repair-r2/`，r1原样保留。
4. 更新修复报告（追加§6“修订r2”并更正§1、§2两处表述），生成新的Codex聚焦复核提示。

## 4. C14（批准后、实施前登记）

`src/core/src/policy.ts`、`src/core/tests/policy.test.ts`、`src/core/tests/a9-background-tools.test.ts`（同前）；证据目录`policy-p1-repair-r2/`；
报告`docs/reports/2026-10/a9_31_policy_p1_repair_2026-10-05.md`追加修订。批准须按本稿SHA256绑定，并追加ADR-0181补充条目。

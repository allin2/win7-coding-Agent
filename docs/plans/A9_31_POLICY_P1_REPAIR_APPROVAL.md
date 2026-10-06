# A9-31：Codex复核两项P1（Shell审批漏报）的本地修复材料

日期：2026-10-05。Status: DRAFT_NOT_APPROVED。请求批准§1–6的**本地修复与验证**；不含源码提交、新包、Win10/Win7执行，三者在本轮
结果和复核通过后另行起草。修复沿用ADR-0171原则（尽力识别明显执行/宿主/控制流，歧义保守确认），批准后追加ADR作为其补充。未在Win7实机验证。

## 1. 依据（已复现）

Codex独立复核（任务书末尾“Codex独立复核结论”条）与我方复现一致：以`ebda911`编译的Core调用`PolicyEngine.evaluate`（FULL_ACCESS），
下列输入当前均返回`allow`，应为`ask`：

| # | 输入 | 问题 |
|---|---|---|
| A | `Write-Output "C:\"; npm publish` | P1-1：段切分把双引号前的`\`当转义（`src/core/src/policy.ts`约240行），而PowerShell与cmd中`\`不转义引号，后续命令被吞进输出数据 |
| B | `Write-Output "C:\"; sc.exe delete A9ReviewProbe` | 同上 |
| C | `Write-Output "C:\"; Remove-Item -LiteralPath "C:\a9-review-target" -Force` | 同上（删除门） |
| D | `$tool='npm'; if ($false) { $tool='echo' }; & $tool publish` | P1-2：花括号/括号被拆平后，未执行分支内的赋值被当作确定值（约264、287行） |

`start_process`经`src/core/src/a9-agent-loop.ts`约1164行使用同一Shell Policy，两入口同受影响。

## 2. 修复设计

- **F1 引号**：PowerShell与cmd段切分中，`\`不再作为引号转义。Policy也会分析嵌套的`sh`/`bash`载荷（其中`\"`确为转义），因此
  当命令中出现“反斜杠紧接双引号”时，按“转义”与“不转义”两种解释分别切分求值，**任一解释得出高影响即取该结果**；不含该序列的命令
  行为不变。代价：极少数合法的`\"`用法可能多一次确认（误确认），属ADR-0171允许的保守方向。
- **F2 控制流中的赋值**：段切分记录每段所处的嵌套层（PowerShell的`{}`/`()`，cmd的括号块，以及`if`/`else`/`elseif`/`for`/`foreach`/
  `while`/`do`/`switch`/`try`/`catch`/`finally`后的块）。嵌套层内的字面赋值**不替换**外层已知值，而是追加为候选值；变量有多个候选值时，
  用每个候选分别解析命令名，**任一候选得出高影响即取该结果**。非字面赋值维持现有处理（不扩大到任意脚本求值）。
- 不改审批摘要、digest绑定、Read Only限制、其他工具或任何非Policy路径；不新增依赖或API。

## 3. 先红后绿

1. **先写回归测试**（`src/core/tests/policy.test.ts`）：A–D四条；cmd对应写法`echo "C:\" & npm publish`（已复现：当前PowerShell与cmd两种shellKind下均为allow）；`start_process`入口同样
   为`ask`（`src/core/tests/a9-background-tools.test.ts`）；保持不变的对照：`$tool='npm'; & $tool publish`→ask、`npm publish`→ask、
   不含`\"`的普通输出命令仍为allow、既有全部Policy用例不变。**预期的保守变化**：`bash -c "echo \"npm publish\""`当前为allow，F1后将为ask（误确认，按D1接受），以用例显式锁定。
2. 在当前源码上运行，新增用例必须失败（红），原样保存输出。
3. 修改`src/core/src/policy.ts`后重跑至全部通过（绿）；任何既有用例结论变化都单独列出并说明是否属于F1的保守误确认。

## 4. 验证（Mac开发机，沿用G2 r3保护方式）

先`npm run verify:quick`构建，再运行§5全部命令，并在Core组额外加入`tests/policy.test.ts`；运行前后全部受跟踪文件逐SHA核对，构建改写的
受跟踪Runner dist按原字节恢复；R5–R8冻结5448文件基线0差异。结果不冒充Windows、Win10或Win7证据。

## 5. 复核

修复与红绿证据形成后，生成给Codex的聚焦复核提示（范围：本次diff、§3用例、F1/F2是否引入新的漏报或扩大误确认），由负责人转交；
无P0/P1后才起草源码提交材料。

## 6. C14与文档（批准后、实施前在任务书登记）

- 实现与测试：`src/core/src/policy.ts`、`src/core/tests/policy.test.ts`、`src/core/tests/a9-background-tools.test.ts`。
- 证据：`.acceptance/a9-31-developer/policy-p1-repair-r1/`（红、绿、§4全量运行记录与保护文件）。
- 报告：`docs/reports/2026-10/a9_31_policy_p1_repair_2026-10-05.md`。
- 文档修正（P2-1）：任务书§5命令清单把`npm run verify:quick`移到最前，并在Core组加入`tests/policy.test.ts`（改合同文本，见D2）。

## 7. 对Win10证据的影响（预告，不在本次批准内）

Policy位于每次`shell`/`start_process`派发路径上。按[增量验证矩阵](A9_BATCH_2_INCREMENTAL_VALIDATION.md)SAFE行“共享dispatch MUST_RERUN”
及“调用行为变化不能按文件哈希继承”，修复提交后需新包，且凡经过工具派发的Win10 phase（Background、Shell、EncodingSecurity、
FailureBoundaries、StopExit、ReleaseExit、Recovery）预计须在新包上重跑，Boot可提议继承。届时另起草新根材料（预计约10个请求、两次人工点击）。

## 8. 待负责人确认

- D1：F1“两种解释取高影响”与F2“候选值取高影响”的保守设计（接受少量误确认）。
- D2：是否同意按§6修改任务书§5命令清单文本。
- D3：确认本次只到本地修复、验证与Codex复核为止；提交、新包、Win10另行批准。
- 批准须按本稿SHA256绑定。

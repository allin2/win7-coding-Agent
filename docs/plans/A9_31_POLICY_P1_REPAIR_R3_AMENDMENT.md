# A9-31：P1修复修订r3——改为“只增不减”的保守规则，放弃候选值追踪

日期：2026-10-05。Status: DRAFT_NOT_APPROVED。请求批准替换[P1修复材料](A9_31_POLICY_P1_REPAIR_APPROVAL.md)的F2设计及
[修订r2](A9_31_POLICY_P1_REPAIR_R2_AMENDMENT.md)（ADR-0182）的G1–G4；F1保留。仍只到本地修复、验证与Codex复核为止。未在Win7实机验证。

## 1. 依据

Codex第三轮复核（r2）：历史11个反例均已修复，但又有3项P1，其中1项是r2新引入的ASK→ALLOW回归（同层非字面赋值表示的“未知”被
条件候选追加覆盖）；另两项为嵌套`if`/`for … do if`/`call set`、多层`$()`与块内`$()`、子表达式中的点调用仍漏报。Codex在432组合中
发现20条HEAD ASK→r2 ALLOW。

**判断**：两轮补修表明，逐项追踪赋值候选的方式在组合场景下每补一处就可能在别处丢失“未知”，继续修补不收敛。

## 2. 新设计（替换F2、G1–G4）

在HEAD `ebda911`的`policy.ts`上只做两处**只会增加确认、不会减少确认**的改动：

1. **F1（保留，Codex已确认单独应用不放宽）**：段切分增加`backslashEscapes`参数；原读法（转义）原样保留，命令含`\"`时再加
   PowerShell/cmd读法（不转义），任一读法得出高影响即确认。
2. **R（新）**：某段以变量作为命令名（PowerShell `$x`/`${x}`，cmd `%x%`/`!x!`）时，若该层命令文本含任何控制结构
   （`{}`、`()`、`$(`、`&&`、`||`、点调用、`if`/`else`/`for`/`foreach`/`while`/`do`/`switch`/`try`/`catch`/`finally`/`trap`/`function`/
   `filter`/`call`/`iex`/`Invoke-Expression`/`Invoke-Command`/`goto`），且文本中出现高影响词（与HEAD深度上限检查同一词表），
   即按“无法完整分析的潜在高影响Shell”确认。直线式文本中的变量仍按HEAD的字面赋值解析。

**超集性质**：原读法与HEAD逐字相同，仅在R触发时提前返回确认；第二读法只增加确认。因此对任意输入，HEAD为ASK时新版必为ASK——这由构造保证，不依赖语料。

**接受的误确认（按D1）**：含控制结构且出现高影响词的变量调用一律确认，例如`$tool='npm'; if ($false) { $tool='echo' }; & $tool test`、
未点调用的`function f {$tool='npm'}; $tool='echo'; & $tool publish`。

## 3. 原型验证（scratchpad，非证据，供裁决参考）

以HEAD源码为基础实现上述两处，与HEAD分别编译后纯策略求值：三轮Codex的20个反例全部为ASK；755条输入（测试语料303、组合432＝4初值×12结构×3赋值×3调用尾、
Codex 20）中**HEAD ASK→新版非ASK为0**；语料中新增ASK的为全部目标输入加上述两条误确认。

## 4. 实施与验证

1. `src/core/src/policy.ts`回到HEAD后实施F1与R（r1/r2的候选值实现整体撤除）。
2. 测试：保留r1/r2全部ASK用例；把上述两条由ALLOW改为ASK并注明为接受的误确认；新增Codex第三轮反例（含`for … do if`、`call set`、
   块内`$()`、子表达式中的点调用）为ASK；保留`$tool='npm'; $tool='echo'; & $tool publish`等直线式ALLOW对照；更正`policy.test.ts`中bash用例
   注释里未经验证的PowerShell位置参数说法。
3. 红（在当前r2上）→ 绿；新增一项**结构性测试**：对一组含控制结构的组合，断言HEAD为ASK的新版必为ASK（以测试内嵌的HEAD判定结果作期望）。
4. 先构建再按§5全量；差分扩展为语料+432组合；证据`.acceptance/a9-31-developer/policy-p1-repair-r3/`，r1、r2原样保留。
5. 更新报告（追加§7），生成Codex第三次聚焦复核提示。

## 5. C14与ADR

同前三文件与报告；证据目录`policy-p1-repair-r3/`。批准后追加ADR-0183，声明以本设计替换ADR-0181的F2部分与ADR-0182（二者原文不改）。
批准须按本稿SHA256绑定。

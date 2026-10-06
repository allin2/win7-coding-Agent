# A9-31 同类高影响Policy与可见审批本地修复

本报告为上一版397/117的历史字节与证据；当前变量执行补修和417/117结果以[再核查报告](a9_31_policy_win10_readiness_recheck_2026-10-04.md)为入口。原报告和原始证据保留，不重绑。

已确认并修复原8个漏确认/2个纯文本误确认；同一入口扩展核查的明确全局安装、注册表/服务变更也已纳入确认。长命令/复合命令审批现在包含完整原command和显式cwd，保留Git信息和一次性完整参数绑定。**本地Core九组397项、Shell九组117项、七模块编译/静态PASS**；当前编译Policy定向22项零不符。源码未提交，Windows新包/真实UI/Win7/独立均NOT_PERFORMED，不签DEVELOPER_VERIFIED。

## 1. 实际基线、授权和保护

工作树`/Users/qlyf/.codex/worktrees/a9-31-background-tools/win7-coding-Agent`，分支`codex/a9-31-background-tools`，HEAD仍`898ee9459a9b987840e94ddef336556ea58dd389`。HEAD只表示基线，不能当作新修复字节的源码提交。主仓只读；当前主代理执行，无委派。

负责人要求“检查同类问题，如果确实存在请修复”。实现前[材料§7](../../plans/A9_31_SHELL_DELETE_POLICY_REPAIR_APPROVAL.md)、任务C14及ADR-0171先登记：本轮只改policy.ts、a9-agent-loop.ts和policy/background两个既有测试；上轮第四夹具的一行copy保持。本轮无新依赖/API/模块、Runner/State/native/IPC数据格式变化。批准全文、owner原指令及hash在当前证据根approved-expanded-contract-original.md/owner-approval.json。

证据根`.acceptance/a9-31-developer/shell-high-impact-policy-repair-r1/`。before.json先保全1813 tracked、47 dirty、590上一轮修复证据、主仓21 dirty和既有1273个r2保护输入/返回文件。原r2 ZIP/master/统一Windows矩阵与真实Remove-Item FAIL、停止根和历史UNKNOWN均保持；R10不恢复。不提交/推送/合并、装配新包、远端写入/重启或系统操作。

## 2. 确认的缺口与最小修复

| 缺口 | 原实际行为 | 修复行为 |
|---|---|---|
| 自主Git遮蔽后续操作 | git status后npm publish、reg add、sc delete、icacls变更ALLOW | 先聚合非Git高影响执行，再作Git裁决，返回ASK |
| 包/系统调用形态 | npm.cmd、前置registry参数、np`m/r^eg及宿主执行漏报 | 在既有有界命令/引号/宿主边界识别；各包管理器分别识别参数值 |
| 全文正则误判 | Write-Output中的npm publish/reg delete也ASK | 输出、单引号文字和注释为数据；实际$()或执行体仍ASK |
| 同家族明确变更 | 全局npm/pnpm/yarn/cargo安装、sc stop、reg load/restore等漏报 | 明确全局依赖与注册表/服务变更ASK，普通项目安装和查询保持自主 |
| 审批摘要缺目标 | 长命令截断到160字符；含Git时只显示Git摘要 | 保留完整原command和显式cwd，并附Git绑定信息 |

Policy复用前轮删除识别器，不新增解析库或通用执行接口。保留256KiB分析门、嵌套上限、无法分析的明显高影响执行保守确认、既有Git动态执行门、Read Only和安全审计。不是任意Shell程序的完美解析或安全沙箱。

UI既有textContent消费summary；Runtime既有redactApproval/redactForProjection继续在持久化/IPC前脱敏。此次不改UI布局、IPC、摘要digest算法或秘密投影逻辑。审批可见文本是本地生产Core摘要/既有投影路径证据；实际Windows窗口和本次特定审批SQLite回写仍未执行，不能由端口测试代签。

## 3. 首失败、边界诊断与实际验证

| 检查 | 证据 | 本轮结论/边界 |
|---|---|---|
| 原16项源码核查 | adjacent-policy-before.json | 原8漏确认/2误确认仍存在，纯求值不执行命令 |
| 新反例首红 | policy-first-red.jest.json/stdout/stderr | 144 PASS/66 FAIL，210项；原实现/摘要缺口有效 |
| 首版产品回归 | core-final.jest.json、shell-final.jest.json | 390/117 PASS，保留为中间版本 |
| 参数/控制体追加核查 | additional-boundary-before.json | 发现npm布尔color被混用为值参数、普通循环被误确认；已修正共同入口 |
| 原动态门诊断 | original-dynamic-contract-before.json | 原字节本就要求Invoke-Expression确认；新增ALLOW预期不符合原合同，移为ASK断言，未放宽生产Git门 |
| 中间第二次Core | core-final-r2.jest.json | 396 PASS/1新增预期错误FAIL，原结果保留 |
| 当前实际编译定向核查 | compiled-adjacent-policy-after-r2.json | 22项零不符；包括原16项及追加参数/控制体/既有动态门 |
| 当前编译/静态 | verify-quick-r2.json/stdout/stderr | Node20.17.0离线七模块lint/build PASS，先于消费者 |
| 当前Core合同 | core-final-r3.jest.json | 九组397/397 PASS，自然退出；Policy199、后台18，其余原合同180 |
| 当前Shell合同 | shell-final-r2.jest.json | 九组117/117 PASS，自然退出，实际当前Core构建输入 |
| 文档/差异 | docs-final-r2.json、diff-final.json | PASS，278文档/48任务；最终原始记录绑定 |
| 原生/Runner/State独立项 | impact-and-verification.json | 未改部分按组件及编译字节核对继承，不冒充本轮新原生/目标验收 |
| Windows包/UI/真实SQLite/Win7/独立 | impact-and-verification.json | NOT_PERFORMED；原r2整体FAIL不改判 |

新Core用例通过实际A9AgentLoop/ToolRegistry/Policy和受控Runner/managed端口，覆盖shell与start_process的发布/系统复合命令：pending回调先完成、进入tool_start前挂起；拒绝、错digest和挂起参数变化均零Runner/managed派发。前轮真实等待持久化回调、旧Turn绑定和Read Only回归继续在合同中通过。受控端口没有执行任何发布/删除/系统命令，这些检查证明派发门，不证明新包实机行为。

## 4. 准确字节与影响

当前修复身份以source-working-identity.json、source-working-diff.patch和本轮source-incremental-diff.patch绑定。

| 输入 | SHA256 |
|---|---|
| src/core/src/policy.ts | `74d38041c1176c87b07db04dc30e7ba4019e252649705884ebae0b9c9162d656` |
| src/core/src/a9-agent-loop.ts | `f4b5db823cdc707d7d3345594d80a5d17445419d9cc37006f0ef99e7d7804ce9` |
| src/core/tests/policy.test.ts | `cc4d2ec40473db66a355d2f304439cf4c372265e20da2ce72b0d6b47524c6e6c` |
| src/core/tests/a9-background-tools.test.ts | `de839e28c37485936cf20e71a51430c97b259ad238cfd967b8ea8bc73e11ea92` |
| src/core/tests/a9-verification-evidence.test.ts | `f01ce71a59168d22cbdef601378bf8f0d99e4c5ffef2f2cca468ee14d59881b5` |
| Core实际policy.js | `9688c792512f40e3b35aedc6f7b657903626f3427949091cc232cdedfb22df9b` |
| Core实际a9-agent-loop.js | `5c08f57077891212c100522cb3bd4c7dc34ed89907a1f2d4235c45599e7bc324` |
| 相对HEAD的五路径产品/测试diff | `d41b736a06375c80e121dd46a765dfe1bea3d32c3345049c6a1a2d56e67e82dc` |
| 本轮相对已有修复的四路径增量diff | `5b55fa3078a53f25041f7b20d3ab2c2430cb8845e8bdf71e5575eeaf8f1798b7` |

完整444个本轮编译文件保存在compiled-current/，清单compiled-current-manifest.json。构建造成的24个tracked Runner dist仅在消费者结束且新字节保全后恢复进入本轮前的原字节；恢复清单generated-dist-preservation.json。未reset/checkout或删除文件；此后若再次运行依赖消费者须先按合同重建，不能把已恢复的历史tracked dist当新源码输出。

当前影响矩阵和最终工作区/旧证据保护检查见impact-and-verification.json、final-preservation.json。任务仍A9_31_IMPLEMENTATION_IN_PROGRESS。后续新源码提交、新开发包及新Windows合同须绑定本次准确新字节并取得适用授权，不能复用已失败并停止的r2或恢复旧R10。

## 5. 主仓既有历史输入差异（只读）

本轮起始可读dirty快照为主仓21个文件；上一轮历史保护集合另有两份Electron ZIP未进入本轮可读文件集合，当前git status均为D，文件确实缺失：

- `spikes/02-terminal-containment/build-win10/kit/inputs/electron-v22.3.27-win32-x64.zip`
- `spikes/04-storage-index/build-win10/kit/inputs/electron-v22.3.27-win32-x64.zip`

本轮未写主仓；不把这两份历史差异签为保全PASS。记录preexisting-main-zip-deletions.json区分本轮基线保护PASS与历史输入DIFF；本A9-31工作树对应文件仍在且hash等于起始快照，可核验恢复来源，未自动恢复。其余本轮记录的主仓21 dirty、工作树38个非任务dirty、590旧修复证据和1273个r2保护文件逐hash未变，HEAD/index保持。该差异不影响本次隔离工作树的Policy修复验证，不授权旧原生kit运行或任何恢复/清理。

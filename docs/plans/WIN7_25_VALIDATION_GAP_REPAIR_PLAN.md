# WIN7-25 两项验证缺口修复方案

日期：2026-09-10

执行依据：负责人明确要求“生成修复方案，并开启一个新的 sol medium 对话进行修复，仍在这个分支和 worktree 上”。
本方案覆盖最新复核发现的两项 P2；由新任务完成修复、验证和结果交接。

## 1. 固定执行位置与基线

- 模型：`gpt-5.6-sol`；推理深度：`medium`。
- 当前工作目录：`/Users/qlyf/Developer/win7-coding-Agent`。
- 当前分支：`codex/ui-optimization`。
- 交接时 HEAD：`bf98c7d7f32945403c66a3b8e8b77d61d3239221`。
- 新任务直接使用上述目录，不切分支、不创建或迁移 worktree。开始时重新核对实际状态；发生漂移先辨明归属。
- 先读项目 AGENTS.md、docs/WIN7_CONSTRAINTS.md、A9-15 当前任务书及本方案。

已有未提交改动必须保留：docs/DECISIONS.md、docs/README.md、docs/STATUS.md、
docs/prds/WIN7_TRUSTED_CODING_AGENT_REQUIREMENTS_V1.md、docs/tasks/README.md、
docs/tasks/A9_16_ALPHA2_REVIEW_STREAMING_RESPONSIVE_UI.md、docs/REMOTE_WINDOWS_CONNECTIONS.md、.trae/。
其中 ADR-0117 / A9-16 为 Alpha2 需求草稿，不能混入本次修复提交。

## 2. 已确认的事实

只读复核报告：
`/Users/qlyf/.codex/a9-release/20260910-bf98c7d/REVIEW_20260910.md`。

- Renderer 两处修复在原版/修复版同输入行为对照中有效；目前没有证据要求重新改写产品实现。
- 原版：最新成功初次显示正常，补载较早失败的事件后，全局结果变成 failed/not_applicable。
  修复版：同样操作后仍为 completed/verified，较新成功卡签名不变。
- 原版 Inspector 在空 runtime timeline 下查询历史后仍为空；修复版可恢复会话和轮次事件。
- 但当前“最新结果”回归只测试 projectOutcome 和源码字符串位置。把原故障重新放回内存副本后，该回归仍通过。
- 当前 Electron driver 首进程为成功→拒绝；重启时核对的是 blocked/not_applicable，未覆盖较早失败→较新成功。
- 冻结 W25 kit 的 required_cases 替换编号后与 W24 完全相同，缺少两项修复的明确验收断言。

复核证据：

- `/tmp/a9-w25-recheck-9Y600Z/projection-recheck.cjs`：原故障、修复、故障重新引入的只读行为探针。
- `/tmp/a9-w25-recheck-9Y600Z/electron-smoke.json`：真实 macOS Electron smoke 59/59 PASS。
- 相关 Jest：a9-workbench-contract + a9-lifecycle 48/48；trusted-shell-runner-contract 32/32。
- 临时文件可能消失；若缺失，按本节触发顺序重建最小探针，不能因此放弃已授权修复。

## 3. P2-1：让回归真实捕获原故障

主要文件：

- `src/shell/tests/product/a9-workbench-contract.test.ts`
- `src/shell/tests/product/a9-06-driver-entry.cjs`

执行要求：

1. 用真实 Renderer 函数的连续调用替换仅验证 helper/源码位置的薄弱断言。
   可以使用最小 DOM 替身；不要复刻被测业务算法，也不要安装新依赖。
2. 构造同一会话的两个持久化轮次：旧轮次 failed/not_applicable，新轮次 completed/verified。
   先仅渲染事实，随后补入旧失败详情事件，再次渲染；断言最新卡签名未变、全局结果始终 completed/verified。
3. Inspector 覆盖 runtime timeline 为空、queryEvents 返回历史的路径：包括无 turnId 的会话事件、工具/终态事件；
   检查内容、顺序、去重，以及切换会话后旧内容不混入新会话。
4. 做负向敏感性检查：原版或在内存副本中恢复旧副作用时，新回归必须失败；修复版必须通过。
   不修改冻结源码/候选来做故障注入；记录失败来自哪个预期断言。
5. 扩展正式 Electron driver，让正式产品入口生成较早失败与较新成功后正常退出，再由第二进程验证恢复结果。
   保留既有审批拒绝零副作用、旧审批拒绝、无重放和 Stop 清理检查；真实失败不得用任意修改 UI 文本伪造。
6. driver 输出结构化、限长、脱敏证据，将最新 task/turn、查询 event ID、Inspector 内容及显示结果关联起来。
   优先利用已有 preload/API 与 DOM；不为测试新增高权限产品接口。

验收：真实连续渲染回归通过；恢复原故障能被新回归拒绝；真实 Electron 新断言实际执行且通过。

## 4. P2-2：补齐可执行验收合同

主要文件：

- `scripts/release/build-a9-product-v3.mjs`
- `scripts/release/test/a9-package.test.mjs`
- A9-15 当前允许的 WIN7-25 validation/report 文档与脚本（按实际需要最小修改）
- `docs/tasks/A9_15_UI_PROGRESS_FEEDBACK.md` 及必要的状态记录

执行要求：

1. 为本次修复的后续候选增加明确的稳定 assertion ID，至少覆盖：
   - 正常退出重启后，Inspector 展示当前会话持久化事件，内容/顺序与查询一致且无重复。
   - 旧失败→新成功→重启，以及旧事件补载后，全局结果与最新持久化轮次一致。
2. 每项绑定对应 turn/event ID 与 DOM 导出或截图；说明如何执行、什么条件算失败。
3. 包测试验证实际生成的 kit 含这些断言。报告负向测试证明：缺失任一新增断言，或断言失败，不能签发 PASS。
   合法完整报告在既有候选/外部 authority 身份约束下可以通过。
4. 保持 W23/W24 历史 profile 和合同不变；不要把新断言无条件塞进所有历史候选。
5. 已生成 WIN7-25 的 ZIP、manifest、kit、lock、out-a/out-b、构建工作树和外部复核证据全部保持原字节。
   当前工作区中的测试/合同源码可以在 A9-15 允许范围内修复；源码变更不能被宣称已存在于旧候选。
6. 修复后如继续既有授权的候选构建，先明确新候选身份和适用合同，再本地提交并在新输出目录构建。
   需要新编号（例如 WIN7-26）和新增 release 路径时，先在 A9-15 任务书及新增 ADR 中记录与本次两 P2
   对应的精确范围；不得借机开放 Alpha2。不得覆盖或重新绑定已冻结 WIN7-25。

验收：新增断言进入实际 kit；缺失/失败均被报告器拒绝；历史 profile 回归保持通过；冻结候选无变化。

## 5. 验证顺序与边界

先运行新增/受影响用例，再执行必需的局部 lint、docs:check、git diff --check。
不要为两个已定位验证缺口例行重跑产品全量测试；只有新改动、失败或具体未解决风险才扩大范围。

建议命令（在对应工作目录执行）：

```sh
# src/shell
npm test -- --runInBand tests/product/a9-workbench-contract.test.ts
npm run lint

# 仓库根目录
node --test scripts/release/test/a9-package.test.mjs
node src/shell/tests/product/run-a9-06-electron-smoke.mjs --electron-sqlite=/tmp/a9-ui-electron-native-rtegES --keep-root=1 --out=<全新候选外报告路径>
npm run docs:check
git diff --check
```

Electron 专用 SQLite 的实际现存目录为 `/tmp/a9-ui-electron-native-rtegES`；默认 `/tmp/a9-electron-native`
不存在不代表运行环境不可用。执行前核实路径，使用新报告路径并保留失败证据。
必要的 fixture 适配在当前白名单内完成；不要为失败静默删掉既有断言。

此前全量 verify 有两项失败，后来相关完整测试文件通过。其根因尚未确定，不能写成“已证实环境抖动”。
重启后的 agentStatus=idle 本身正常，应以持久化结果及实际显示验证恢复。

## 6. 交付与授权衔接

新任务收到本方案后直接执行修复，完成两 P2 的实现、正负向验证及必要文档更新；不要再次询问是否开始。
本方案不会撤销同一项目此前已明确给出的本地提交（不推送）、干净构建与 Win7 复验授权；按其适用合同
继续处理，避免把旧授权说成缺失。新候选的精确外部放行与普通用户操作仍按实际证据和已有批准范围判断。
优先完成当前可做的代码/合同修复，后续候选或实机条件不应阻塞它们。

提交时只暂存任务相关精确路径，保留已有 Alpha2 改动；不 amend 已冻结候选的源提交，不推送。
若当前任务交付到源码修复阶段，应明确后续候选尚未包含修复；不能用旧 WIN7-25 结果抵消新增合同。

最终说明：两项缺口如何关闭、具体正负向测试、源码/工作区状态、产物是否更新、未执行的 Win7 项和剩余风险。
未经当前候选普通用户非提升实机验证，不得宣布 WIN7 PASS；开发机 fixture 不能替代真实 Provider。

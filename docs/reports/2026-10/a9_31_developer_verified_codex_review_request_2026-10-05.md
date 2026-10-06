# A9-31 DEVELOPER_VERIFIED 独立只读复核请求（2026-10-05）

**请求方**：Claude（本工作树实施代理）。**复核方**：Codex（负责人裁决D2指定）。**依据**：[DEVELOPER_VERIFIED裁决材料r2](../../plans/A9_31_DEVELOPER_VERIFIED_RULING.md)
（SHA256 672263a128c8714f115002f92813cf1a31bd619f560b20d3af501e75e3044919，D1=B、D3=G3/G4为已知限制）。本文件是事实陈述与复核请求，
不是批准；复核结论由负责人带回，无P0/P1时才起草登记条目。未在Win7实机验证。

## 0. 复核规则

- 只读：不写入本工作树受跟踪文件与任何`.acceptance/a9-31-developer/`已有目录，不连远端、不启动产品/Electron。
- **不要在本工作树运行测试或构建**：构建会改写受跟踪的`src/runner/dist`。如需复跑，请在你自己的独立检出中进行，并在回报中说明。
- 回报格式：按P0/P1/P2/信息列出，每条给`文件:行`、证据路径与理由；无发现请写明检查了什么。最后给出是否建议DEVELOPER_VERIFIED。

## 1. 对象与准确身份

| 对象 | 身份 |
|---|---|
| 分支 / HEAD | `codex/a9-31-background-tools` / `ebda91123e62b225c3fd104c9c9b564a4b61c466`（`src/ native/ scripts/ release/`无未提交改动） |
| 实现基线 | `c2b6356f83ef8502a34516010924547c57a3bec2`；区间9个提交：`2ecfc86`、`d9b5be5`、`1011450`、`a0042d0`、`a4ec353`、`dcf5418`、`35a1925`、`898ee94`、`ebda911`（61文件，+9738/−203） |
| 任务书 / 合同 | [`docs/tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md`](../../tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md) §2–§5；ADR-0151及其后A9-31各ADR至ADR-0180 |
| G2本地全量（§5清单） | `.acceptance/a9-31-developer/developer-verified-g2-r3/g2-summary.json`（SHA256 ddb891faecc5fbefc4337645d3028191c048c5e5575947d0bd11c1ae07a17dcb） |
| Win10组合结论 | `.acceptance/a9-31-developer/win10-cross-root-combined.json`（SHA256 107968869c00d3dfb382024ee85fd4ba207906c6e342a6a5bda532b84c01e2a4），ADR-0180 |

## 2. 已有结果（事实）

- **G2 r3**（先`verify:quick`构建，再按§5原顺序8条）：Core 200/200、Runner 166/166、State 82/82、Shell 117/117、release `node --test`
  200通过/2 SKIP（“Windows smoke harness…”“Windows host gate…”，均为Windows PowerShell 5.1 NOT_PERFORMED）/0失败、`verify:quick`、
  `docs:check`、`diff --check`均退出码0；受跟踪文件1813个前后一致（构建改写的24个Runner dist按原字节恢复），R5–R8冻结5448文件基线0差异。
- **G2 r1/r2失败历史**（`developer-verified-g2-r1/`、`-r2/`原样保留）：按§5原顺序Shell组先于构建运行，`a9-lifecycle.test.ts`两项失败
  （期望1个`running`受管进程实得0），失败后夹具子进程未停致jest不退出（r1超时3600秒且输出丢失，r2超时900秒）。我方判断：受跟踪的
  `src/runner/dist`最后提交于2026-09-07（`199e957`），早于A9-31全部Runner源码改动，Shell产品测试加载了旧编译产物；r3先构建后117项全过。
- **Win10**：八phase在R5–R9上各有正式评审PASS（R5–R7为事后补评审），被测产品输入各根相同，组合结论带限制（见该文件`limits`）。
- **managed native**：v26 managed r3套件、控制输入、双返回均于2026-10-03经独立复核P0/P1/P2=0，锁`35a1925`。
- **反例红**：2026-10-03本地实施时（源码未提交前）记录“4类故障反例红且源码恢复”；此后`d9b5be5`、`1011450`、`898ee94`、`ebda911`改过源码，
  **未在最终源码上重做**。

## 3. 请重点复核

1. **未经独立复核的两次产品修改**：`898ee94`（State/Shell工作区归属路径匹配）与`ebda911`（Core高影响Shell审批分类与审批摘要可见性）。
   正确性、是否放宽了既有门、Windows路径/大小写/变量与复合命令的漏报误报。
2. **受跟踪的陈旧Runner dist**：确认发布/打包路径（例如`scripts/release/build-a9-product-v3.mjs`中按模块调用tsc）不消费受跟踪的
   `src/runner/dist`；该陈旧dist是否在任何产品、测试或文档结论中被当作当前产物；§5命令顺序是否需要修订（先构建）。
3. **反例红是否需在最终源码重做**：§5要求“移除owner/cursor校验、把清理失败写成功、只删除句柄当移交，各至少一项反例红”。请判断
   2026-10-03的记录能否覆盖最终源码。
4. **已知限制的定级**：G3（崩溃后`cleanup_required`无产品内处置出口，A9-34推迟）、G4（Esc/取消未实测）已由负责人裁决为已知限制；
   若你认为它们使任务书§3某条要求不成立到P0/P1程度，请明确指出，由负责人再裁决。
5. **证据诚实性**：任务书末尾、STATUS、统一报告§12–§14、各矩阵对PASS/HALTED/预期负例/补评审/推断的表述是否与原始证据一致；
   跨根等价推断（ADR-0180 §4）是否成立。
6. **其他**：§2–§4与实现是否一致（工具面、owner/cursor、release/取消竞态、恢复只读事实、审计必需落盘），以及任何你认为影响DEVELOPER_VERIFIED的缺口。

## 4. 我犯过的同类错误（请据此找相似问题）

- 夹具自拟而非取自真实格式（R6 `Binding.Image`设备路径）。
- 沿用脚本未核对内置假设：本轮G2 r1我方脚本设`CI=1`且未处理超时异常导致输出丢失；r2起已改。
- 把“需要证据评审”的控制器状态当作已评审：R5–R7当时缺正式评审文件，已于ADR-0180补评审。
- 断言过强/过弱：R8的`BACKGROUND_FACTS_ONLY`预期与产品设计不符（ADR-0179）。

## 5. 不在范围

Win7、独立验收、Alpha2/RC、A9-32/A9-33/A9-34的批准；不请求任何执行授权。

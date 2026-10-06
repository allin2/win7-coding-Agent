# A9-31：整批Win10证据跨根组合的裁决材料

日期：2026-10-05。Status: DRAFT_NOT_APPROVED（r2，记录D1/D2裁决与补评审预演，仍未批准）。本材料只供负责人裁决，不授权任何新根、远端执行、对旧根目录的写入、
DEVELOPER_VERIFIED、独立验收或Win7；R4–R8 HALTED及全部旧证据不改判。未在Win7实机验证。

修订说明（r2）：r1（SHA256 `1e5c0000096063cad29b5b74134b4e6206aac2436db261575085ec73714d8239`）发出后，负责人裁决
**D1=A9-34推迟到第二批之后**、**D2=B**。裁决不是对写入旧根的批准；§9执行计划须按本稿SHA256另行批准。

## 1. 要裁决的问题

A9-31第二批的八个Win10 phase（[验证合同](A9_31_PRODUCT_R1_WIN10_VALIDATION_APPROVAL.md)表：Boot、Shell、EncodingSecurity、
Background、FailureBoundaries、StopExit、ReleaseExit、Recovery）现在都至少在一个根上有PASS，但分布在R5–R9五个根，
各根的控制器/driver字节不同。需要裁决：这种跨根组合能否、以及在什么条件下记为整批Win10通过。

## 2. 被测产品字节相同（直接事实）

R5–R9各根`admission-binding.json`中`normal-short` revision登记的被测输入完全相同：source `ebda9112…`、
ZIP `d951a89a…`、manifest `0060ffff…`、lock `7593e758…`、helper `2036bf69…`、capture库 `93f1979a…`、
SYNC模块 `628dd457…`。各根之间变化的只有测试工具（控制器、driver、观察器编译产物）与根路径。

## 3. 各phase证据分布

| phase | 有PASS的根与request | driver项数 | 正式评审结论文件 |
|---|---|---|---|
| Boot | R5 `e28f279a…`；R6 `9df37ce1…` | 9；9 | 无；无 |
| Background（short / full / ready预期负例） | R6 `e30af278…` / `53eb4fdd…` / `39578cdd…` | 29 / 133 / 16（设计内失败） | 无 |
| Shell | R6 `38973184…` | 29 | 无 |
| EncodingSecurity | R7 `7f5eef0d…`（R6同phase HALTED） | 71 | 无 |
| FailureBoundaries | R7 `fc75b589…` | 41 | 无 |
| StopExit | R5 `d20ba372…`（旧工具）；R8 `a9599b32…` | 15；15 | R5无；**R8有** |
| ReleaseExit | R5 `907b3747…`（旧工具）；R8 `0de38ba0…` | 32；32 | R5无；**R8有** |
| Recovery | R9 `d1a04183…`（R5、R8 HALTED） | 16+23 | **R9有** |

各PASS均有：控制器`PHASE_PASS_REQUIRES_EVIDENCE_REVIEW`、观察器`OBSERVER_FINAL_VERIFIED`、完整回收逐SHA一致与秘密扫描0
（见各根`win10-evidence-matrix-r*.json`）。R5 ReleaseExit与R6 Background full各有1个cmd 87缺口由既有SYNC通道解析；
所有PASS phase的manifest conhost proof均为0。

## 4. 各根测试工具差异（直接比对，根路径/哈希/尺寸归一后按行计）

| 区间 | driver | 控制器`serve` | `launch`/`stage` | 差异性质 |
|---|---|---|---|---|
| R5→R6 | 7行 | 3行 | 0 | driver：重启实例证据文件改名（`restartAware`，非重启时名字不变）及其自检；控制器：每请求前读取观察器events文件的检查（更严）、观察器组件目录v2→v1 |
| R6→R7 | 0 | 7行 | 0 | 控制器：conhost proof父进程种类按NT设备路径判定（ADR-0175），只作用于manifest proof路径 |
| R7→R8冻结 | 0 | 0 | 0 | 仅换根与哈希 |
| R8冻结→R8 driver-r1（实际发请求） | 41行 | — | — | 晚到事件文件重启命名及自检（ADR-0177/0178） |
| R8 driver-r1→R9 | 56行 | 0 | 0 | 重启分支断言、隔离退出、重启实例失败收尾及新自检（ADR-0179） |

**推断（基于差异性质，未经重跑）**：除Recovery外，各phase的执行路径不经过上述driver改动；控制器改动或更严格、
或只作用于本批PASS phase未出现的conhost proof路径。因此较早工具上的PASS不因后续修复而失去意义。R5的StopExit/ReleaseExit
已被R8在更新工具上重新取得，R5的Boot已被R6重新取得。

## 5. 组合不能消除的缺口

- G1 **R5–R7的PASS phase没有正式评审结论文件**：各根目录都有与R8相同的`review-phase.py`/`review-negative.py`，但无
  `review-*.json`，也无评审所需的`ordinary-entry-confirmed.json`；dispatcher身份记录（`dispatcher-status-*.json`）存在。
  控制器状态本身写的是“需要证据评审”，因此Boot、Background三项、Shell、EncodingSecurity、FailureBoundaries目前只有
  控制器+观察器+回收结论，**缺正式评审这一步**。
- G2 新conhost证明分支在R5–R9所有普通phase中从未被真实缺口触发。
- G3 原生退出对话框Esc/取消的后果从未实测。
- G4 Recovery PASS仅为“保留清理未知”语义，崩溃后产品无法正常关闭（A9-34草案）。
- G5 A9-34若并入第二批，产品字节改变，本节以上全部Win10证据随之失去绑定。
- G6 Win7、独立验收、DEVELOPER_VERIFIED均未进行或未签。

## 6. 选项

| | A：现在按跨根组合记整批Win10通过 | B：先补正式评审，再记组合通过（推荐） | C：不组合，新根一次跑全八phase |
|---|---|---|---|
| 做法 | 以§3–§4为依据直接登记，G1–G6列为限制 | 对R5–R7的PASS phase在本地用原样评审脚本对已回收证据补跑评审；全部通过后登记组合结论；任一不通过则该phase另行重跑 | 在最终工具字节上新根一次执行八个phase |
| 远端动作 | 无 | 无（只读本地已回收证据） | 新根、约10–11个请求、两次人工点击 |
| 新增写入 | 文档 | R5–R7目录各新增入口确认文件与`review-*.json`（需先登记C14） | 新根全套 |
| 风险 | 七个phase缺正式评审即被采信 | 补评审若暴露问题，需重跑对应phase | 新HALT风险、耗时与容量；若A9-34随后并入仍要再跑 |

## 7. 建议（推荐，不是裁决）

先定A9-34是否并入第二批（G5）：若并入，组合裁决意义有限，应等新产品字节后一次性新根取证（近于C）；若推迟，
采用B：补评审成本低、只读、无远端动作，且正好补上G1。补评审全部通过后，建议把结论记为
`WIN10_CROSS_ROOT_COMBINED_PASS_WITH_LIMITS`并逐条带上G2–G4、G6，而不是无条件“整批通过”；DEVELOPER_VERIFIED仍由负责人另行裁决。

## 8. 已裁决与补评审预演

- D1（负责人已裁决）：A9-34推迟到第二批之后；A9-33须把“后台进程运行中崩溃后，该对话与正常退出被永久阻断”列为已知限制。
- D2（负责人已裁决）：B。
- **预演（只读，非评审记录）**：在scratchpad中复制各根`review-phase.py`/`review-negative.py`（三根字节相同，SHA256前缀
  `1d40ecab…`/`40d2cbce…`）、`admission-binding.json`、`requests/`与已回收的`*-observe.json`，按D3建议规则取入口身份文件，
  对下列10项原样运行评审，全部通过：R5 Boot/StopExit/ReleaseExit、R6 Boot/Background short/Background full/Shell、
  R7 EncodingSecurity/FailureBoundaries为`DIRECT_CURRENT_SOURCE_PHASE_PASS`；R6 ready负例为
  `EXPECTED_NEGATIVE_CASE_PASS_REQUIRES_COMPLETE_RETURN_SECRET_SCAN`（该run已完整回收65文件、秘密扫描0）。
  预演只说明正式执行的预期结果，不替代正式评审。

## 9. 待批准的执行计划

1. **D3入口身份文件（待确认）**：每根取首个请求前最早一份、dispatcher为`WAITING`且身份为SID1005/Session3/Medium 8192/
   非提升/无job的记录，原样拷贝为该根`ordinary-entry-confirmed.json`：R5 `dispatcher-status-9f80ec3f.json`（SHA256
   93453b34cbe5c9f448ace364d21da02d95702a9b01106e277665beee2776ed39，dispatcher PID 92564）、R6 `dispatcher-status-cf7a25c9.json`
   （096cca6741febe49a6b1717533d3ce957ea0e8b0e3e88d558ac9e37cb4a1beb0，PID 133820）、R7 `dispatcher-status-f0f7b503.json`
   （c198e2cc978a2daba5e772e280de3614b152ce4e1a3b43073413bd5770b3c343，PID 88008）。
2. **C14（批准后、创建前登记）**：仅新增，均位于`.acceptance/a9-31-developer/`下：R5–R7各自的`ordinary-entry-confirmed.json`；
   `product-r3-retry-r5/review-{Boot-e28f279a4db44f9e86f669eb69f6ba00,StopExit-d20ba372d60e40628e82a0b2ff274e6a,ReleaseExit-907b3747d6fc44a3ad6e1e9f6a25b898}.json`；
   `product-r3-retry-r6/review-{Boot-9df37ce14d134012ae7e414399d1672e,Background-e30af2786c514973bf5fd45d14b4c962,Background-53eb4fdd77d04150adbe47bac661b60f,Shell-38973184211b4ebbb1c6d5f37a90b556,ready-negative-39578cdd84da43aaa4b0654e4a2631c1}.json`；
   `product-r3-retry-r7/review-{EncodingSecurity-7f5eef0dc1854c94b47d91f67fa64927,FailureBoundaries-fc75b5899be8497eb1bc1e8da60a893c}.json`；
   组合结论`win10-cross-root-combined.json`。不改动任何既有文件；评审脚本自身拒绝覆盖已存在的结论文件。
3. **执行**：在各根目录用该根原样评审脚本运行上述10项；R5–R8冻结5448文件基线前后各跑一次须0差异。
4. **D4结论措辞（待确认）**：全部通过则写`WIN10_CROSS_ROOT_COMBINED_PASS_WITH_LIMITS`，逐条附G2（conhost证明分支未触发）、
   G3（Esc/取消未实测）、G4（Recovery仅保留未知语义，A9-34推迟）、G6（Win7/独立/DEVELOPER_VERIFIED未签），并逐phase列出
   所采信的根、request与评审文件；任一不通过则该phase记NOT_PASS，另报是否新根重跑，不改写原结论。
5. **边界**：无远端动作、无新根、不签DEVELOPER_VERIFIED/独立/Win7；整批结论仍待负责人对第4点结果的确认。未在Win7实机验证。

请按本稿SHA256批准，并确认D3取文件规则与D4措辞。

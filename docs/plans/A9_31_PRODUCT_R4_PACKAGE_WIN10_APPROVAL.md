# A9-31：由`8d207ab`装配r4开发包并在新Win10根全量重验

日期：2026-10-06。Status: DRAFT_NOT_APPROVED。请求批准C1（装配）、C2（新根准入与冻结）、C3（普通桌面重验）。不含推送/合并、新原生构建、
Win7、候选或DEVELOPER_VERIFIED登记。结论上限为`A9_31_DEVELOPER_CHECK_NOT_WIN7_CANDIDATE`。未在Win7实机验证。

## 0. 为什么要重验

源码已由`ebda911`本地提交为`8d207ab`（Shell Policy P1修复，仅`policy.ts`与两测试文件）。R5–R9的Win10证据和ADR-0180组合结论绑定
`ebda911`装配的r3包（ZIP `d951a89a…`），对新源码失去直接绑定。Policy位于每次`shell`/`start_process`派发路径上，按
[增量验证矩阵](A9_BATCH_2_INCREMENTAL_VALIDATION.md)PACKAGE行（新包完整性与实际加载直接执行）与SAFE行（共享dispatch MUST_RERUN），
新包须完整重验；为免再次跨根拼接，本次在**一个新根、一个入口**内跑全部phase（含Boot）。

## C1. 装配r4开发包（Mac，本地）

- 新本地根`.acceptance/a9-31-developer/product-r4/`（当前不存在，执行前复核）。`source-checkout/`由本仓库`clone --no-checkout --shared`，
  detached检出准确`8d207ab11d2c8134a81e4e62900f395aae99944e`并核对三文件blob；不改原仓库refs。输出`package/`运行前不存在。
- 依赖：与r3相同的八个`.git/info/exclude`登记的离线`node_modules`链接，不安装/下载。
- 生产者与输入与r3完全相同（已于起草时只读核对）：`scripts/release/build-a9-product-v3.mjs` SHA256 `a66f8f92…`（`8d207ab`下未变）；
  锁`a9-v26-managed-input-lock.json` `7593e758…`；`--electron-zip` `ad723ed7…`、`--storage-zip` `2cb0cd32…`、`--runner-zip`（native-kit-r3 BuildA）`25167410…`。
  Node 20.17.0；`--source-commit 8d207ab…`；不传allow-uncommitted；生产者自行编译七模块，不用工作树中的旧dist。
- 装配后：同源`verifyA9ProductZip`、ZIP与展开树双向全闭包、manifest/Profile/native/许可证/SBOM核对；单独核对包内Core `policy.js`由`8d207ab`编译
  （与本地同源编译产物逐字节一致）；helper仍为`2036bf69…`。新包身份（source、ZIP、manifest、全部输入/工具、本批准）写入不可变记录后才进入C2。
  装配失败即停，保留首次失败，不改生产者、锁或洁净门。

## C2. 新Win10根：测试工具换绑、准入与冻结

- 远端新根`C:\Users\a9builder.WIN-2JQ66JE4HTQ\AppData\Local\A9-A31-Product-R4-20261006-R1`（须不存在、无reparse、空闲≥4GiB；
  2026-10-05末次只读为9.55GiB，执行前复核）。本地工具根`.acceptance/a9-31-developer/product-r4-win10-r1/`。
- **测试工具 = R9现行版本仅换绑定**：控制脚本（stage/launch/serve）、driver（R9版，含ADR-0179的Recovery“保留清理未知”断言）、四个revision
  （controlled-boot/normal-short/normal-full/ready-negative）的机械派生、观察器、准入检查与评审脚本，全部由R9字节派生，**只替换**：根路径、
  批准/合同哈希、source `ebda911…`→`8d207ab…`、ZIP与manifest哈希→新包值，以及随之重编的观察器pin/EXE/MVID。每个派生文件做反向换绑断言，
  须与R9字节逐字相同（证明除绑定外无功能变化）。观察器C#源仅`SOURCE`常量变化，在新根重编（新EXE/MVID不冒充继承）。
- **新增一项准入定向检查**（只在准入、不改driver）：在Win10锁定Electron-as-Node 16.17.1上，直接加载**新包内**的Core Policy模块，对四轮全部已报告
  反例（含0–4层EncodedCommand包裹）、我方普通开发命令/表达式语料求值，断言反例全部ASK、普通语料与HEAD一致；只做策略求值，不执行任何被测命令。
- 准入全套沿用R9（观察器准入≤3轮、schema、api、interval、entry、files-scope、sync-actual/current、Node16各driver×6项自检、package-held、
  manifest绑定、真实缺口回放），四个revision完整闭包stage须PASS；R5–R9冻结5448文件基线前后0差异。

## C3. 普通桌面重验（一个入口）

- 负责人启动入口一次；`desktop-execution.py status`直接核验SID1005/Session3/Medium 8192/非提升/无job。120分钟、≤16请求。
- 顺序（10请求）：Boot → Background short → Background full → ready负例（预期失败）→ Shell → EncodingSecurity → FailureBoundaries →
  **StopExit**（点第1个“停止后退出”）→ **ReleaseExit**（点第2个“留给系统后退出”）→ Recovery（最后，R9断言，隔离退出）。点击按ADR-0176流程（就位、45秒提前量、
  每次只报一个按钮、不确定就不点）。
- 每请求：观察器就绪后发布、30秒接单、终态后停止观察器并核对终态；完整逐size/SHA回收、秘密扫描；`review-phase.py`/`review-negative.py`/
  `review-phase-r9.py`正式评审（入口身份文件取本根首份WAITING身份记录）。全部完成后经负责人批准的`stop.json`正常结束入口。
- 失败处理（待D2裁决）：任何HALT立即停止，不恢复、不建新根；点击phase超时可重试至多3次、点错不重试；其余非HALT的FAIL见D2。
- 产出：单根矩阵`win10-evidence-matrix-r4-r1.json`、统一报告新节、STATUS。全部phase在本根有正式评审PASS时，记为`WIN10_SINGLE_ROOT_PASS`（不再依赖跨根组合），
  并附既有已知限制（G3 A9-34推迟、G4 Esc未实测、conhost证明分支若仍未触发、Shell Policy识别边界）。

## 边界

不改产品/native/锁/capture、控制器与driver的功能逻辑、观察器判据、对话框断言、限时；不删除、不结束旧进程（含R5遗留Electron 107280等）、不改系统设置；
不推送/合并/发布；不委派；Win7、独立验收、DEVELOPER_VERIFIED不在本批准内。批准后先在任务书登记C1–C3准确新增路径并追加ADR，再实施。

## 待负责人确认

- D1：接受“R9工具仅换绑定＋新增一项Policy准入检查”，而不在driver里新增Win10界面级Policy断言（后者需改driver功能，另起材料）。
- D2：普通phase出现非HALT的FAIL时：A 不重试，停止并上报（与R9一致）；或 B 同一入口内重试至多1次（推荐，十个请求的入口一次失败即重开代价高）。
- D3：Boot一并重跑（推荐，包身份变化，PACKAGE行要求直接执行），不提议继承。
- 批准须按本稿SHA256绑定。

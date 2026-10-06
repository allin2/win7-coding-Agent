# A9-31 本地实现与源码交接（2026-10-03）

A9-31已在批准独立分支完成本地实现；当前为 `IMPLEMENTATION_IN_PROGRESS`，不是DEVELOPER_VERIFIED或Win7 PASS。
基线 `c2b6356f83ef8502a34516010924547c57a3bec2`，C1精确25路径提交与C2批准收据保存在候选外approval目录。
源码提交未授权/未执行，套件只有六个模板，无managed二进制、正式ZIP/输入锁、远端写入或候选冻结。

## 实现与验证边界

| 合同 | 本地检查 | Windows/Win7直接证据 |
|---|---|---|
| 新工具/Policy/批准目标绑定/预算与验证 | Core定向185项；后台启动只算副作用，不计verified | NOT_PERFORMED |
| owner/上限3/4/游标重读过期/双Stop | Runner定向162项；含真实本地POSIX进程及TEST_ONLY v3消息 | NOT_PERFORMED；模拟Job/token不证明Windows |
| 固定原task/turn/request、先落盘、release意图及终态 | State定向70项；真实SQLite事务和负例 | NOT_PERFORMED |
| 迟到输出归原卡、IPC、审计阻断、退出选择、恢复 | Shell定向最终记录见下文；Runtime/IPC/Renderer VM+SQLite、真实POSIX生命周期 | NOT_PERFORMED；非真实Electron交互 |
| release协议及取消竞态 | macOS CMake logic_tests ALL PASS，0.36s；Win32 helper.cpp未在Mac编译 | Windows native/build NOT_PERFORMED |
| 新kit/批准HEAD/双返回/锁/打包闭包与v25回归 | Node20.17套件测试；正式native素材使用TEST_ONLY隔离Git/PE/证据 | Windows PS5.1/C#、实际双构建/PE/API/CRT NOT_PERFORMED |
| 项目必需静态检查 | verify:quick全部7模块build/lint通过；docs/diff按最终材料检查 | 不等于目标平台通过 |

本地记录根：`.acceptance/a9-31-developer/`。Core `tests/core-r2-final.log`、Runner `tests/runner-r6-final.log`、
State `tests/state-r2-final.log`、Shell `tests/shell-r9-final.log`、发布 `tests/release-r4-final.log`，
静态 `tests/verify-quick-r2-final.log`；哈希/环境/源码组件绑定见 `handoff/local-evidence-matrix-r1.json`。
旧A9-30直接报告不改绑；本轮变化涉及helper/transport/管理器/Runtime/shared dispatch，Windows S01–S06均MUST_RERUN。
Windows环境预检仅可按实际身份轻量复核，不能引用SID1005历史信息签本轮PASS。

## 已保存的失败与修正

- 首轮状态/诊断断言、旧shell background入口与本机默认Node20.10断言文案问题保留；合同运行统一Node20.17。
- 历史后台生命周期测试改走start_process。TEST_ONLY transport驱动真实POSIX子进程，明确标出模拟的Job/token字段；
  正式路径仍要求v3 helper，不能直接spawn回退。后台启动结果为completed_with_warnings，不能伪称verified。
- 发现运行中cleanup责任被投影为cleanup_required；versioned owned running/starting保持状态及责任，历史残留语义不改。
- 审计夹具曾出现未抛出错误，保留原日志；加入投影/审计计数和ASCII/中文输入矩阵后定向及整组通过。
  先前瞬时行为未确定独立根因，不把早期FAIL撤销；独立复核需核对该记录，Windows直接审计故障注入仍必跑。
- 首轮反例遗漏合法格式外属游标，补负例后四项全部红：移除owner、游标nonce校验、伪造清理成功、仅遗忘句柄当release。
  `tests/negative-controls-r2.json`及四个原日志证明测试断言失败，源码SHA恢复一致；r1漏检记录保留。
- 受失败夹具影响的两个自有测试进程按实际PID/PGID/命令核对后终止，未处理外部进程；记录tests/failed-fixture-process-cleanup.json。
- 新返回校验要求完整ready/token/帧字段，拒绝输入未脱离、令牌不完整及额外字段；12项managed定向通过。

所有首轮日志、负向故障与隔离TEST_ONLY工件均保留在候选外，不生成候选authority。

## 下一步具体审批

[交接合同](../../plans/A9_31_IMPLEMENTATION_HANDOFF.md)与外部source-approval清单冻结确切差异。
先批准清单所列本地源码提交，再从准确提交提取正式managed kit并计算ZIP/input-lock/manifest哈希。
独立复核、批准登记提交、构建机具体目录及双构建动作在材料成形后分别批准；本报告不代签。
A9-31原生/真实Electron/独立复核完成前不签DEVELOPER_VERIFIED、不整合、不开始未批准A9-32实现。
A9-33/新Win7预演/冻结/门A/正式执行/独立审核/负责人门B仍未执行，最终批次目标尚未完成。

## 最终本地检查记录

本轮Core185、Runner162、State70、Shell113、发布169项通过，共699项；发布2项Windows PowerShell实机项NOT_PERFORMED。
全部7模块build/lint、文档222文件/48任务及diff检查通过；记录以候选外矩阵哈希绑定。
4类反例均为有效断言失败，Manager源码恢复SHA-256
`987db4bbf58471bb9ff3ef3911d8d1088b1b55c9d0f25bf1efbd758d663f71e8`。
24个tracked Runner生成文件保存到候选外后恢复HEAD字节，源码提交不含dist；交付时仍按批准生产者重新编译。
主工作区18处既有状态与A9-30干净工作树保留；没有新增产品提交、远端写入、整合、推送或发布。

## 待批准本地提交的精确路径

共51项；仅下列字节快照，提交父为上述完整c2b6356 SHA，不推送或整合。

- `docs/DECISIONS.md`
- `docs/STATUS.md`
- `docs/STATUS_LOG.md`
- `docs/WIN7_CONSTRAINTS.md`
- `docs/plans/A9_31_IMPLEMENTATION_HANDOFF.md`
- `docs/plans/A9_ALPHA2_DELIVERY_SEQUENCE.md`
- `docs/plans/A9_BATCH_2_INCREMENTAL_VALIDATION.md`
- `docs/plans/A9_HELPER_V3_STREAMING_PROTOCOL.md`
- `docs/plans/README.md`
- `docs/reports/2026-10/a9_31_local_implementation_and_source_handoff_2026-10-03.md`
- `docs/tasks/A9_31_BACKGROUND_PROCESS_TOOLS.md`
- `docs/tasks/README.md`
- `native/helper/README.md`
- `native/helper/build-win10-kit-v26-managed/README_BUILD.md`
- `native/helper/build-win10-kit-v26-managed/build-profile.json`
- `native/helper/build-win10-kit-v26-managed/build.ps1`
- `native/helper/build-win10-kit-v26-managed/helper.exe.manifest`
- `native/helper/build-win10-kit-v26-managed/package-kit.cjs`
- `native/helper/build-win10-kit-v26-managed/prepare-kit.cjs`
- `native/helper/helper.cpp`
- `native/helper/helper.h`
- `native/helper/logic_tests.cpp`
- `native/helper/protocol.cpp`
- `scripts/release/a9-v26-return-evidence.mjs`
- `scripts/release/build-a9-product-v3.mjs`
- `scripts/release/record-a9-v26-helper-input.mjs`
- `scripts/release/test/a9-package.test.mjs`
- `scripts/release/test/v26-evidence-fixture.mjs`
- `scripts/release/test/v26-prepare-kit.test.mjs`
- `src/core/src/a9-agent-loop.ts`
- `src/core/src/a9-tools.ts`
- `src/core/src/system-prompt.ts`
- `src/core/tests/a9-background-tools.test.ts`
- `src/core/tests/a9-tools.test.ts`
- `src/runner/src/background-process-manager.ts`
- `src/runner/src/index.ts`
- `src/runner/src/native-protocol.ts`
- `src/runner/src/native-transport.ts`
- `src/runner/src/trusted-shell-adapter.ts`
- `src/runner/src/trusted-shell-runner.ts`
- `src/runner/tests/background-process-manager.test.ts`
- `src/runner/tests/native-transport.test.ts`
- `src/shell/product/a9-agent-runtime.js`
- `src/shell/product/a9-package-runtime.js`
- `src/shell/product/main.js`
- `src/shell/product/renderer/a9-workbench.js`
- `src/shell/tests/product/a9-background-tools.test.ts`
- `src/shell/tests/product/a9-lifecycle.test.ts`
- `src/shell/tests/product/a9-package-runtime.test.ts`
- `src/state/src/a9-persistence.ts`
- `src/state/tests/a9-managed-process-ownership.test.ts`

## 提交审批 r2：套件交接入口修正（2026-10-03）

上述r1源码清单已被r2取代；旧r1快照和首轮证据保留，不能按旧批准提交更新字节。
复核发现managed README生成/封装命令仍指旧v26目录，记录新锁命令缺--lock-id。
修正为build-win10-kit-v26-managed路径、A9_31_V26_MANAGED_BUILDKIT及
A9-31-DEVELOPER-INPUTS-D013-V26-MANAGED；不触碰旧kit或锁。
managed生成器现在先核对revision/control/release_terminal/persistent_adoption，封装器先核对准确revision。
新增6项场景：实际按README入口生成/封装、4类合同漂移拒绝、错误manifest revision零ZIP。
旧README反例确实红、当前README恢复哈希一致；证据tests/managed-readme-negative-control.json。
当前v26检查文件整组66项通过、2项Windows专属NOT_PERFORMED（tests/v26-prepare-r6-final.log）。

本轮仅4个实施路径及本报告/交接文档改变，Core/Runner/State/Shell产品字节、解码、
其他发布消费脚本、共享fixture和a9-package.test.mjs未变。原release-r4记录内109项打包检查
仅按冻结r1组件/依赖SHA和相同调用行为标INHERITED_EVIDENCE，不改绑原日志。
有效覆盖为Core185/Runner162/State70/Shell113、套件66直接、打包109继承，共705项；不全部描述为本轮直接执行。
无共享原生/Renderer源码新改动，不机械重跑四模块/全部打包组；项目规定整组命令已在r1执行，受影响v26组已直接重跑。
构建前仍需Windows解析/编译/原生双构建，真实Electron和Win7没有新的直接PASS。

r2仍为相同51精确路径，父提交未变；准确尺寸/SHA、差异patch及r1变更对照由候选外
handoff/source-approval-r2.json绑定。未经该r2具体提交批准不提交，不推送/整合/写远端/构建。
本轮只读预检确认Win7 SP1 x64/PS5.1、agent console在线无产品残留；Win10管理员通道可用，
a9builder SID1005/Session3桌面在线。普通a9builder SSH被Bitvise试用到期拒绝，不提升账户或更改服务器。
内存完整脚本解析观察超时，对应远端进程随后确认不存在，Parser仍NOT_PERFORMED；该失败记录保留候选外preflight目录。

统计修正：先前沟通中的799为汇总算术错误，原五组185+162+70+113+169应为699。
r2有效记录为596项直接本地检查+109项精确未变继承=705；不会增加Win10/Win7证据等级。

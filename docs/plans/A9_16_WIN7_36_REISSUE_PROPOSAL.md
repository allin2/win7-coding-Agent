# A9-16 / WIN7-36 短高度容量修复换发合同

状态：`APPROVED_FOR_IMPLEMENTATION`（2026-09-23，负责人明确批准 WIN7-36 编号、范围、C14 允许路径及 `10.110.237.40` 目标；任务书 §17 与 ADR-0133 为正式实施入口）。本批准不等于候选外 authority 或实机 PASS；ZIP 精确哈希确定后仍须另行签发候选外 `RELEASE_AUTHORITY`。

## 已证实的起点

- WIN7-35 ZIP SHA-256 为 `0d1474fddbd05c28e2109f2b7d70eb78d7e4ac786cadf2418175c7504b73749c`；在 `10.110.237.40` 的运行 `9ffae420-fd2c-4c5f-93ef-c56584fe1ca4` 中，G1 PASS，清除旧 WIN7-34 实例后的 G2 PASS，正式入口首启与重启首绘 PASS，但 G3 UI 硬门 FAIL。真实 1366×768、125% DPI（AppliedDPI=120）的可用内容视口为 1079×540 CSS px、DPR 1.25；最坏形态列表 `clientHeight=178`，36px 普通行仅 3 条完整可见，未达到 W35-11/W35-15 的 4 条。584px 是最小窗口钳大后的无效对照，不得拿其 5 行改判。
- W35-12/W35-13 的 DOM 节点身份观察仍存在运行中轮询干扰可能，是待隔离风险，不能计 PASS，也不能直接宣称产品缺陷。真实 Provider 与失败硬门后的下游用例保持 `NOT_PERFORMED`。
- 当前 `codex/a9-alpha2`、HEAD `3ba50d48605464f6fb115f826310912b791a3246` 上的未提交补丁只改 `workbench.html`、`a9-workbench.css`、`a9-workbench-contract.test.ts`，可重放探针及证据只在 `docs/reports/2026-09/**`。开发机实测 1079×540 得 207px/4 行，584px 判 `INVALID_VIEWPORT_CLAMPED_584`，选择器失效对照得 178px/3 行。以上不是 Win7 新候选证据。

## 身份与实施边界

1. 新编号 `WIN7-36`；WIN7-35 及更早 ZIP、manifest、authority、报告和候选外证据保持不可变。新候选沿用 Alpha 1 可执行产品与 A9-16 U01–U07 UI 子集，不据此签发 Alpha 2、Review、Shell streaming 或 RC PASS。
2. 产品修复限定为短高度目录注记选择器绑定、单行/零外边距布局与必要的列表横溢出控制；保留 36px 行高、Stop/归档可见、桌面四态、现有断点及 WIN7-35 Driver 生命周期/退出码合同。Runner、Policy、IPC、SQLite、依赖、权限、网络与产品 `main.js` 不在本轮范围。
3. C14 实现路径为现有 A9-16 §7 三个文件：`src/shell/product/renderer/workbench.html`、`src/shell/product/renderer/a9-workbench.css`、`src/shell/tests/product/a9-workbench-contract.test.ts`；候选换发追加 `scripts/release/build-a9-product-v3.mjs`、`scripts/release/test/a9-package.test.mjs`，以及 `release/win7-product-v3/` 下新建 WIN7-36 专属 input lock、integrity/report/smoke 脚本、两个 `.cmd` 和验证合同，更新该目录 `README.md`。相关文档限 A9-16 任务书、任务索引、`docs/STATUS.md`、新 ADR 与 `docs/reports/2026-09/**`。不修改 WIN7-35 文件以“重绑”旧候选。
4. 实施前将上述允许路径、候选日期/ID、W36-01～W36-15 用例、可达窄屏下限和结论范围写入 A9-16 任务书与新 ADR；不能仅靠本草案或代码改动自行扩大白名单。发行脚本必须产生独立 WIN7-36 profile 与候选作用域错误码、用例键、authority kind；新增 package 反例拒绝任何残留 W35 键。新 lock 可继承 D-013 v25、Electron 和 storage 输入的精确哈希，但不能继承 WIN7-35 的 Win7 UI PASS。

## 执行门与验收矩阵

1. 在现有脏工作区独立复核三文件补丁与证据，运行 A9 工作台定向契约、Shell lint/build、`git diff --check` 和失败式几何门；探针必须读取实际 `innerWidth`/`innerHeight`/DPR、工作台原点、完整行数、Stop/归档边框盒。1079×584 必须无效，selector-miss 必须失败。原始输出仅作为开发机证据。
2. 本合同已获授权；仅暂存明确的任务相关路径，形成一个本地源码/候选合同实施提交；不推送、不打标签。两个独立干净工作树从同一提交构建，核对源码、输入锁、原生 ABI、内容闭包、manifest、ZIP 逐字节一致；manifest 必须 `source_dirty=false`、`external_acceptance_eligible=true`。仓库 verifier 预检与受控反例全部 PASS 后将 ZIP 冻结到新路径。
3. 向负责人提交精确源码提交、input-lock SHA-256、manifest SHA-256 和 ZIP SHA-256；在负责人针对该组合单独批准候选外 `WIN7_36_RELEASE_AUTHORITY` 及其独立 SHA-256 pin 前，Win7 G1/G2/G3 均 `NOT_PERFORMED`。
4. 获批后在 `10.110.237.40` 普通用户、非提升桌面身份执行 G1→G2→G3。G2 必须包含四阶段、迟到加载与受控 ERROR 非零退出反例、报告解析、零候选相关残留；若硬门失败，G3 和下游停止。G3 在真实 1366×768、125% DPI、**实际 1079×540** 视口、最坏形态下验证至少 4 条完整 36px 行、Stop/归档完全可见、无横溢出；584px 钳大样本只作负向对照。再完成真实 Provider、重启/恢复、四态、焦点、可达最窄 847px 与 15/15 当前候选用例。
5. W36-12/W36-13 的 DOM 身份须隔离验证：先在无运行中轮询的稳定目录做节点引用与切栏前后比较，再在运行中记录目录刷新/轮询时点与节点变化；只将“切栏本身不重建”与“数据刷新可重建”分开裁决。不能用一次混杂失败或先前候选结果冒充本候选 PASS。
6. 所有证据写候选外，报告逐项绑定 W36 ZIP、源码提交、run ID、环境、用户身份与文件哈希；失败原样留存。正式结论最多为 `A9_16_WIN7_UI_SUBSET_INTEGRATION_PASS`，不签 Alpha 2 或 RC PASS。

负责人已确认 `WIN7-36` 编号、上述 C14 允许路径、在 `10.110.237.40` 执行的目标。候选外 `RELEASE_AUTHORITY` 必须在新 ZIP 精确 SHA-256 已知后再次单独批准。

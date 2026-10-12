# A9 第二批候选与 Alpha 2 覆盖台账

```text
Status: DRAFT_PLANNING_ONLY
Updated: 2026-10-02
Candidate: WIN7-43 (tentative, NOT_FROZEN)
A9-30 Implementation: APPROVED_FOR_IMPLEMENTATION
Candidate / Win7 Authorization: NOT_GRANTED
```

这是换发任务书的准备材料，不创建候选、authority、实机 PASS 或 Alpha 2 裁决。
来源为[推进顺序](A9_ALPHA2_DELIVERY_SEQUENCE.md)、[当前状态](../STATUS.md)、A9-16 与当前有效 ADR。
用户已选择三项整批一个候选；只有实际原生构建阻塞才提出拆分，由负责人裁决。

## 1. 需求、已有事实与后续证据

| 范围 | 当前事实（本次未重签） | 第二批所需证据 / 结论边界 |
|---|---|---|
| S01–S06 Shell 实时输出 | A9-30 DEVELOPER_VERIFIED，source32ee0b4；原生双构建/锁及Win10直接和精确继承证据通过，Win7 NOT_PERFORMED | 新managed helper影响的Shell链路直接回归；新候选直接Win7矩阵，不能用Win10替代 |
| A9-SH03 后台工具 | 有管理器/状态事实，不等于完整模型工具面 | A9-31，归属/游标、上限/Stop、重启与释放实测；新 revision lock |
| A9-ST03 用户显式继续 | 历史/预算基础在 W42 取得结论，具体继续入口未实现 | A9-32，重启零请求、主动新 Turn、去重/旧审批失效/未知副作用 |
| 第一批可靠性与审计/Provider完整性 | W42 门 B 收尾，A9-26/28/29 | 第二批会改事件/dispatch/Runtime，直接回归预算、验证、审计失败和协议完整性，不自动继承旧 PASS |
| 改动审阅 | W41/W42 范围内有既有结论，语义按 ADR-0143 | 按新候选影响面回归 Diff/撤销/漂移；不能把先写后审改称旧 R01–R05 staging |
| U01–U07 可达响应式布局 | W36/W37/W42 已有范围内证据 | 流式卡/Stop/继续入口直接布局回归；≤799px仍不可达/未验证，等效裁决不新增 |
| Policy/高影响确认/19种Git形态 | W39/W42 既有范围内结论 | 新工具/IPC/dispatch直接回归零拒绝副作用，不因后台工具绕开分类器 |
| Checkpoint/恢复目录 | W42及真实Windows Git补充已关闭自忽略矩阵 | 影响处直接回归，精确未变组件可提议继承；git clean -fdx限制与迁移/清理独立保留 |
| Renderer隔离/Schema IPC/秘密/TLS/进程树 | 不可解除的既有硬门 | 本批受影响入口直接验，禁不安全fallback；目标服务TLS需要实际环境证据 |
| 真实Provider/企业环境 | W42使用回环夹具，真实服务NOT_PERFORMED | 不把夹具PASS扩成真实服务；是否纳入新候选由其合同固定，不虚构服务可用 |
| POSIX / PowerShell /Command | 实际执行NOT_PERFORMED | Profile支持声明与实测分开，未经执行继续标未测 |
| A9-17启动/内存 | Win7/Win10采样NOT_PERFORMED | 独立工作，本批不宣称目标环境性能收益 |
| A8、历史Phase Gate、安装/卸载/回滚、DPAPI、SBOM | 独立任务及历史边界 | 不借本批实现关闭；按Alpha2/RC适用合同逐项判断，不自动提升 |

精确哈希继承必须记录 component/path、source/artifact SHA-256、原候选/run-id、环境/身份、
影响分析和负责人批准；本表尚未批准任何第二批 INHERITED_EVIDENCE。
原结论仍只绑定其原source/ZIP/run-id，历史 FAIL保持原判。

## 2. 新候选进入顺序

1. A9-30～32各自批准，设计/依赖/独立审阅、开发机与原生构建门通过并按合同整合。
2. 另立换发验收任务书（编号执行前核实），绑定准确source、允许套件文件、完整矩阵、执行/审核角色、
   构建和传输动作授权。WIN7-43只是建议编号，核查refs/注册/候选目录后才能冻结。
3. 两次连续成功Win7预演（REHEARSAL_NOT_ELIGIBLE）；任何失败保留，不覆盖或算正式证据。
4. 双独立干净产品构建逐字节一致；冻结source/ZIP/manifest/helper/新锁，生成候选外authority/独立pin。
5. 负责人门A，目标环境自检：Win7 SP1 x64、真实Electron/ABI、非提升agent控制台、Shell/codepage、
   原生工件哈希/Job/token、目录身份、工具前置。未知或硬门失败停止下游，记NOT_PERFORMED。
6. 正式执行与报告审核分离，返回原始文件/哈希闭包、结构化报告、GUI/日志/数据库证据、秘密扫描及后飞行。
   证据只写候选外；预演/旧候选/开发机不能计直接当前候选PASS。
7. 负责人门B：证据与限制满足合同才签第二批范围结论。发布/推送不自动获授权。

## 3. Alpha 2 与 RC

第二批完成只关闭其合同内能力。完整Alpha2要逐项审阅本台账和当前有效需求/ADR，
核对修改过的Review需求、支持模式、五条核心旅程、恢复/部署要求和已批准延期。
未满足项要保持FAIL/NOT_PERFORMED或取得明确范围裁决，不能用三项功能或测试总数代替。
新的RC另立合同；A7仍是唯一已有RC，本台账不重判A7或已发布W42。


## 4. A9-30 开发机证据补录（2026-10-01）

详见[源码验证报告](../reports/2026-10/a9_30_shell_streaming_source_validation_2026-10-01.md)。
两秒 tick 来自实际 Node 子进程协议 peer；SQLite/Schema IPC 用真实模块和数据库，但原生入口使用夹具；
活动卡恢复是 DOM harness 检查。上述证据不能合成为当前 Win7 S01–S06 PASS。
v26 原生哈希尚未锁定，第二批无冻结候选，未批准新的 INHERITED_EVIDENCE。

## 5. 当前收口与后续合同补齐（2026-10-02）

§4是2026-10-01历史快照，保持原文。旧表S01–S06“当前事实”为：
“已批准并接入源码；开发机定向检查通过，真实 Electron/Win32 helper/Win7 NOT_PERFORMED”。
现已据 [收口裁决](../reports/2026-10/a9_30_developer_closeout_decision_2026-10-02.md)更新当前行；
helper/锁和证据身份不重绑，Win7仍NOT_PERFORMED。
新批继承合同见 [增量矩阵](A9_BATCH_2_INCREMENTAL_VALIDATION.md)，未来source尚未批准任何继承。
A9-31/32与 [A9-33草稿](../tasks/A9_33_BATCH_2_WIN7_ACCEPTANCE.md)保持待审；
编号WIN7-43仍暂定，推进和审批顺序见 [具体审批包](A9_BATCH_2_IMPLEMENTATION_APPROVAL.md)。

## 6. A9-32 本地推进后的完整 Alpha 2 边界（2026-10-11）

[本轮报告](../reports/2026-10/a9_32_local_implementation_and_batch2_readiness_2026-10-11.md)只证明开发机当前未提交差异。
A9-30/31 原开发结论保持；A9-32 真实 Electron/第二批 Win7 未执行。
整批 PASS 与完整 Alpha 2 分别裁决，不用测试数量代替产品覆盖。

| 裁决范围 | 当前边界及还需核对的证据 |
|---|---|
| 改动审阅 / 模式 | ADR-0143 的先写后审、Diff/逐文件撤销/漂移保护；Full Access与Read Only。不得把旧 staging Review 或可见入口计为支持模式 |
| J1 项目解释 | 当前 AGENTS、真实引用/搜索、未知代码库；真实 Provider 环境仍 NOT_PERFORMED |
| J2 缺陷修复 | 当前候选读取→修改→失败修复→验证→Diff；本轮 read/write 仅开发机、本地Provider fixture |
| J3 跨文件小功能 | 当前候选多文件与依赖/脚本旅程；尚无本轮正式证据 |
| J4 Shell / Git | CMD/PS5.1、真实构建/测试、Git状态/Diff/目标确认；POSIX和PowerShell /Command 保留 NOT_PERFORMED |
| J5 撤销 / 恢复 | 新候选 checkpoint/撤销、崩溃恢复、零重放、主动继续；A9-34处置出口延期限制保留 |
| 部署 / 回退 / 闭包 | 同包新目录升级与旧目录回退、数据库/备份、秘密/DPAPI/许可证/SBOM、普通用户实际加载，未执行不能继承整体PASS |
| 性能 / 企业 / 响应式 | A9-17目标机采样、真实Provider/企业CA/代理保持NOT_PERFORMED；≤799px保持PRODUCT_UNREACHABLE / NOT_VERIFIED |

J1–J5 来源为 A9 总合同 §6；模式按后续有效裁决解释。
A9-34 已推迟到第二批之后：恢复后清理未确认可永久阻断对话/正常退出，须随结论明列。
负责人尚未裁决完整 Alpha 2；A7仍是唯一既有RC。
